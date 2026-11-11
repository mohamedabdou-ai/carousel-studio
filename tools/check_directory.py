#!/usr/bin/env python3
"""Check the Carousel Studio plugin (and repository) against the directory policy.

Anthropic's plugin directory and our own contract (docs/CONTRACT.md, sections 0.2, 0.6
and 9.3) set rules that are cheap to break by accident and expensive to find late.
This script enforces them on every push. It reads files only; it never changes
anything and makes no network calls.

Usage:
    python tools/check_directory.py [--root PATH] [--scope auto|plugin|repo]
                                    [--max-files N] [--repo-max-files N] [--strict] [--format text|json]
                                    [--list-rules]

    --root     folder to scan. Default: plugins/carousel-studio next to tools/.
               Pass the repository root (.) to scan the whole repository.
    --scope    plugin: a plugin folder on its own. repo: the repository (plugin rules
               apply to plugins/carousel-studio, plus repository-level rules).
               auto (default): repo when .claude-plugin/marketplace.json and plugins/
               exist under --root, otherwise plugin.
    --strict   treat warnings as errors.

Exit codes (CONTRACT 0.4): 0 clean, 1 warnings only, 2 errors (or warnings with
--strict), 64 usage error, 66 the root does not exist.

Rule ids (run --list-rules for the full list):
    S structure and files   F file contents   P policy   M manifests and skills

Python 3.11, standard library only.
"""

from __future__ import annotations

import argparse
import fnmatch
import hashlib
import json
import os
import posixpath
import re
import sys
from collections import Counter
from dataclasses import dataclass
from functools import cached_property, lru_cache
from pathlib import Path
from typing import Callable, Iterable, Iterator

# ---------------------------------------------------------------------------
# Exit codes and limits (CONTRACT 0.2, 0.4, 9.3)
# ---------------------------------------------------------------------------

EXIT_OK, EXIT_WARN, EXIT_ERROR, EXIT_USAGE, EXIT_NO_INPUT = 0, 1, 2, 64, 66

ERROR, WARN = "error", "warn"

MAX_FILES = 480  # the directory allows 512; CI fails earlier
MAX_FILE_BYTES = 256 * 1024  # a non-image, non-font file must be smaller than this
MAX_CHUNK_BYTES = 240 * 1024  # a runtime chunk may be at most this large
README_MIN_WORDS = 40
SKILL_TOKEN_BUDGET = 4000  # SKILL.md budget (CONTRACT Appendix C.7); checked by estimate
MAX_RELATIVE_PATH = 120  # keeps installs under Windows MAX_PATH

PLUGIN_DIR = "plugins/carousel-studio"
RUNTIME_DIR = "skills/carousel-design/runtime"
UI_STRINGS = f"{RUNTIME_DIR}/ui-strings.json"
FONTS_DIR = "skills/carousel-design/fonts"

# APACHE_2_0_SHA256 is the hash of the unmodified Apache-2.0 text (LICENSE-2.0.txt) in which only the
# "Copyright [yyyy] [name of copyright owner]" line of the appendix may differ.
APACHE_2_0_SHA256 = "cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30"

SKIP_DIRS = {
    ".git", "node_modules", "__pycache__", ".pytest_cache", ".mypy_cache", ".ruff_cache",
    ".venv", "venv", "dist", "coverage", ".cache",
}
JUNK_NAMES = {".DS_Store", "Thumbs.db", "desktop.ini"}
JUNK_SUFFIXES = (".pyc", ".pyo", ".orig", ".rej", ".swp", ".bak", ".tmp", "~")

IMAGE_EXT = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".ico", ".bmp"}
FONT_EXT = {".ttf", ".otf", ".woff", ".woff2"}
BINARY_EXT = IMAGE_EXT | FONT_EXT | {".zip", ".gz", ".pdf", ".mp4", ".webm", ".mov", ".wasm"}
# Files whose content is code or markup that runs: telemetry words are errors here.
RUNNING_CODE_EXT = {".js", ".mjs", ".cjs", ".py", ".html", ".htm", ".css"}
# Files where a banned library name is an error rather than a prose mention.
DATA_OR_CODE_EXT = RUNNING_CODE_EXT | {".json", ".svg", ".yml", ".yaml", ".toml"}
LOCKFILES = ("package.json", "package-lock.json", "pnpm-lock.yaml", "yarn.lock")

WINDOWS_RESERVED = {"con", "prn", "aux", "nul", *(f"com{i}" for i in range(1, 10)), *(f"lpt{i}" for i in range(1, 10))}
WINDOWS_BAD_CHARS = set('<>:"|?*\\')

# ---------------------------------------------------------------------------
# Identity (tools/identity.json is the single source)
# ---------------------------------------------------------------------------

IDENTITY_PATH = Path(__file__).resolve().parent / "identity.json"


def _flex(term: str) -> str:
    """Regex for a name: escaped, with any run of spaces matching any whitespace."""
    return re.escape(term).replace(r"\ ", r"\s+")


@dataclass(frozen=True)
class Identity:
    name: str
    license: str
    repo_url: str
    github_owner: str
    ownership: str
    documentation_url: str
    support_url: str
    privacy_url: str
    credit: re.Pattern[str]
    repo_ref: re.Pattern[str]
    ownership_ar: str = ""

    @classmethod
    def load(cls, path: Path = IDENTITY_PATH) -> "Identity":
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            data = {}
        name = data.get("name", "Mohamed Abdou")
        owner = data.get("githubOwner", "mohamedabdou-ai")
        names = [name, data.get("nameAr", "محمد عبده"), *data.get("nameVariants", [])]
        handles = [s.get("handle", "").lstrip("@") for s in data.get("socials", {}).values()]
        store = re.sub(r"^https?://(?:www\.)?", "", data.get("storeUrl", "https://store.pyraai.cloud")).split("/")[0]
        terms = [t for t in [*names, *handles, owner, store] if t]
        credit = re.compile(
            r"(?<![A-Za-z0-9])(?:" + "|".join(_flex(t) for t in sorted(set(terms), key=len, reverse=True)) + r")(?![A-Za-z0-9])",
            re.IGNORECASE,
        )
        repo_ref = re.compile(
            r"(?:https?://(?:www\.)?github\.com/|github\.com/)?" + re.escape(owner) + r"/carousel-studio", re.IGNORECASE
        )
        return cls(
            name=name,
            license=data.get("license", "Apache-2.0"),
            repo_url=data.get("repoUrl", f"https://github.com/{owner}/carousel-studio"),
            github_owner=owner,
            ownership=data.get("ownership", {}).get("en", "You own everything you create with Carousel Studio."),
            documentation_url=data.get("documentationUrl", ""),
            support_url=data.get("supportUrl", ""),
            privacy_url=data.get("privacyUrl", ""),
            credit=credit,
            repo_ref=repo_ref,
            ownership_ar=data.get("ownership", {}).get("ar", ""),
        )

    def credit_hits(self, text: str) -> list[re.Match[str]]:
        """Credit terms in text, ignoring the project's own repository address."""
        return list(self.credit.finditer(self.repo_ref.sub(lambda m: " " * len(m.group(0)), text)))


# ---------------------------------------------------------------------------
# Findings
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Finding:
    severity: str
    rule: str
    path: str
    message: str
    line: int | None = None

    def sort_key(self) -> tuple:
        return (0 if self.severity == ERROR else 1, self.rule, self.path, self.line or 0)

    def as_dict(self) -> dict:
        return {"severity": self.severity, "rule": self.rule, "path": self.path, "line": self.line, "message": self.message}


def err(rule: str, path: str, message: str, line: int | None = None) -> Finding:
    return Finding(ERROR, rule, path, message, line)


def warn(rule: str, path: str, message: str, line: int | None = None) -> Finding:
    return Finding(WARN, rule, path, message, line)


# ---------------------------------------------------------------------------
# The scanned tree
# ---------------------------------------------------------------------------


@lru_cache(maxsize=None)
def glob_regex(pattern: str) -> re.Pattern[str]:
    """Glob with ** (any depth), * (within a folder) and ? to an anchored regex."""
    out, i = [], 0
    while i < len(pattern):
        if pattern.startswith("**", i):
            out.append(".*")
            i += 2
        elif pattern[i] == "*":
            out.append("[^/]*")
            i += 1
        elif pattern[i] == "?":
            out.append("[^/]")
            i += 1
        else:
            out.append(re.escape(pattern[i]))
            i += 1
    return re.compile("^" + "".join(out) + "$")


def matches_any(rel: str, patterns: Iterable[str]) -> bool:
    return any(glob_regex(p).match(rel) for p in patterns)


class GitIgnore:
    """The subset of .gitignore syntax this repository uses: comments, blank lines, a leading / (anchored), a trailing / (folders only),
    * and ** globs. Negations (!) are honoured for the simple case of re-including a file name. Used so that the repository scan counts
    the files a clone really contains (a git-ignored examples/ folder is not part of the repository)."""

    def __init__(self, text: str):
        self.rules: list[tuple[bool, bool, bool, str]] = []  # (negated, folder_only, anchored, pattern)
        for raw in text.splitlines():
            line = raw.strip()
            if not line or line.startswith("#"):
                continue
            negated = line.startswith("!")
            if negated:
                line = line[1:]
            folder_only = line.endswith("/")
            line = line.rstrip("/")
            anchored = line.startswith("/") or "/" in line
            self.rules.append((negated, folder_only, anchored, line.lstrip("/")))

    @classmethod
    def load(cls, root: Path) -> "GitIgnore | None":
        path = root / ".gitignore"
        try:
            return cls(path.read_text(encoding="utf-8")) if path.is_file() else None
        except OSError:
            return None

    def _matches(self, rel: str, is_dir: bool) -> bool:
        ignored = False
        parts = rel.split("/")
        for negated, folder_only, anchored, pattern in self.rules:
            if folder_only and not is_dir:
                continue
            if anchored:
                hit = fnmatch.fnmatchcase(rel, pattern) or fnmatch.fnmatchcase(rel, pattern.replace("**/", ""))
            else:
                hit = any(fnmatch.fnmatchcase(part, pattern) for part in parts[-1:])
            if hit:
                ignored = not negated
        return ignored

    def ignores(self, rel: str, is_dir: bool = False) -> bool:
        """True when the path, or any folder above it, is ignored."""
        parts = rel.split("/")
        for i in range(1, len(parts)):
            if self._matches("/".join(parts[:i]), True):
                return True
        return self._matches(rel, is_dir)


@dataclass
class SourceFile:
    rel: str  # POSIX path relative to the scan root
    path: Path
    size: int
    is_symlink: bool
    plugin_rel: str | None  # POSIX path relative to the plugin folder, None outside it

    @property
    def ext(self) -> str:
        return Path(self.rel).suffix.lower()

    @property
    def is_binary(self) -> bool:
        return self.ext in BINARY_EXT or self.is_symlink

    @cached_property
    def data(self) -> bytes:
        return self.path.read_bytes()

    @cached_property
    def text(self) -> str | None:
        """UTF-8 text (BOM tolerated here; F02 reports it), or None for binary or undecodable files."""
        if self.is_binary:
            return None
        try:
            return self.data.decode("utf-8-sig")
        except UnicodeDecodeError:
            return None

    @property
    def policy_rel(self) -> str:
        return self.plugin_rel if self.plugin_rel is not None else self.rel


class Scan:
    def __init__(self, root: Path, scope: str, max_files: int, identity: Identity, repo_max_files: int | None = None):
        self.root = root
        self.scope = scope
        self.max_files = max_files
        self.repo_max_files = repo_max_files if repo_max_files is not None else max_files
        self.identity = identity
        self.plugin_prefix = f"{PLUGIN_DIR}/" if scope == "repo" else ""
        self.plugin_root = root / PLUGIN_DIR if scope == "repo" else root
        self.skipped_dirs: list[str] = []
        self.ignore = GitIgnore.load(root) if scope == "repo" else None
        self.files: list[SourceFile] = self._walk()

    def _walk(self) -> list[SourceFile]:
        found: list[SourceFile] = []
        for dirpath, dirnames, filenames in os.walk(self.root, followlinks=False):
            base = Path(dirpath)
            kept = []
            for d in sorted(dirnames):
                full = base / d
                rel = full.relative_to(self.root).as_posix()
                if full.is_symlink():
                    found.append(self._make(full, rel, symlink=True))
                elif d in SKIP_DIRS or (self.ignore is not None and self.ignore.ignores(rel, True)):
                    self.skipped_dirs.append(rel)
                else:
                    kept.append(d)
            dirnames[:] = kept
            for name in sorted(filenames):
                full = base / name
                if self.ignore is not None and self.ignore.ignores(full.relative_to(self.root).as_posix()):
                    continue
                found.append(self._make(full, full.relative_to(self.root).as_posix(), symlink=full.is_symlink()))
        return sorted(found, key=lambda f: f.rel)

    def _make(self, full: Path, rel: str, symlink: bool) -> SourceFile:
        try:
            size = full.lstat().st_size
        except OSError:
            size = 0
        plugin_rel = rel[len(self.plugin_prefix):] if rel.startswith(self.plugin_prefix) else None
        return SourceFile(rel, full, size, symlink, plugin_rel)

    # -- views -------------------------------------------------------------

    @property
    def plugin_files(self) -> list[SourceFile]:
        return [f for f in self.files if f.plugin_rel is not None]

    @property
    def policy_files(self) -> list[SourceFile]:
        """Plugin files, plus runtime sources (src/) in a repository scan."""
        return [f for f in self.files if f.plugin_rel is not None or (self.scope == "repo" and f.rel.startswith("src/"))]

    @property
    def public_files(self) -> list[SourceFile]:
        """Everything a visitor can read, except the contract and the tooling that must name the patterns."""
        if self.scope == "plugin":
            return self.files
        return [f for f in self.files if not f.rel.startswith(("docs/", "tools/"))]

    def get(self, rel: str) -> SourceFile | None:
        return next((f for f in self.files if f.rel == rel), None)

    def plugin_file(self, plugin_rel: str) -> SourceFile | None:
        return self.get(self.plugin_prefix + plugin_rel)

    def rel_for(self, plugin_rel: str) -> str:
        return self.plugin_prefix + plugin_rel


def line_of(text: str, index: int) -> int:
    return text.count("\n", 0, index) + 1


Rule = Callable[[Scan], Iterator[Finding]]
RULES: list[tuple[str, Rule]] = []


def rule(rule_id: str) -> Callable[[Rule], Rule]:
    def register(fn: Rule) -> Rule:
        RULES.append((rule_id, fn))
        fn.rule_id = rule_id  # type: ignore[attr-defined]
        return fn

    return register


# ---------------------------------------------------------------------------
# S: structure and files
# ---------------------------------------------------------------------------


def _breakdown(files: list[SourceFile], strip: str = "") -> str:
    counts = Counter("/".join(f.rel[len(strip):].split("/")[:3 if "/" in f.rel[len(strip):] else 1]) for f in files)
    return ", ".join(f"{name} ({n})" for name, n in counts.most_common(4))


@rule("S01")
def s01_file_count(scan: Scan) -> Iterator[Finding]:
    """The plugin has at most --max-files files (the directory limit is 512)."""
    plugin = scan.plugin_files
    if len(plugin) > scan.max_files:
        yield err("S01", scan.plugin_prefix or ".", f"{len(plugin)} files in the plugin, limit {scan.max_files}. Largest folders: {_breakdown(plugin, scan.plugin_prefix)}")
    if scan.scope == "repo" and len(scan.files) > scan.repo_max_files:
        note = "until the directory confirms it counts only the plugin path" if scan.repo_max_files == scan.max_files else "(the repository ratchet, see CONTRIBUTING.md)"
        yield err("S01", ".", f"{len(scan.files)} files in the repository, limit {scan.repo_max_files} {note}. Largest folders: {_breakdown(scan.files)}")


@rule("S02")
def s02_no_bin(scan: Scan) -> Iterator[Finding]:
    """No top-level bin/ folder, in the plugin or in the repository."""
    for base, prefix in ((scan.plugin_root, scan.plugin_prefix), (scan.root, "")):
        if (base / "bin").exists():
            yield err("S02", f"{prefix}bin/", "top-level bin/ is not allowed; put scripts under skills/<name>/scripts/ or tools/")


PLUGIN_REQUIRED = (".claude-plugin/plugin.json", "README.md", "LICENSE", "NOTICE", "TRADEMARKS.md", "PRIVACY.md")
REPO_REQUIRED = (
    ".claude-plugin/marketplace.json", "README.md", "README.en.md", "LICENSE", "NOTICE", "TRADEMARKS.md",
    "PRIVACY.md", "CHANGELOG.md", "CONTRIBUTING.md", ".gitignore", ".editorconfig", "tools/identity.json",
)


@rule("S03")
def s03_required_files(scan: Scan) -> Iterator[Finding]:
    """Required legal, readme and manifest files exist and are not empty."""
    for rel in PLUGIN_REQUIRED:
        f = scan.plugin_file(rel)
        if f is None:
            yield err("S03", scan.rel_for(rel), "required file is missing")
        elif f.size == 0:
            yield err("S03", f.rel, "required file is empty")
    if scan.scope == "repo":
        for rel in REPO_REQUIRED:
            f = scan.get(rel)
            if f is None:
                yield err("S03", rel, "required file is missing")
            elif f.size == 0:
                yield err("S03", rel, "required file is empty")


def _words(markdown: str) -> int:
    text = re.sub(r"```.*?```", " ", markdown, flags=re.DOTALL)
    text = re.sub(r"<[^>]+>|\]\([^)]*\)", " ", text)
    return len(re.findall(r"[^\W_]+", text))


PRIVACY_LINES = ("sends no data", "لا ترسل أي بيانات")


@rule("S04")
def s04_readme(scan: Scan) -> Iterator[Finding]:
    """README.md has at least 40 words, the privacy line and the ownership statement."""
    readmes = [scan.plugin_file("README.md")]
    if scan.scope == "repo":
        readmes.append(scan.get("README.md"))
    for f in readmes:
        if f is None or f.text is None:
            continue
        words = _words(f.text)
        if words < README_MIN_WORDS:
            yield err("S04", f.rel, f"{words} words; the directory requires at least {README_MIN_WORDS}")
        # the repository README is Arabic first, so the Arabic privacy line and ownership sentence count too
        if not any(line in f.text.lower() for line in PRIVACY_LINES):
            yield err("S04", f.rel, 'must say "This plugin sends no data." (or «هذه الإضافة لا ترسل أي بيانات.»)')
        if not any(o and o in f.text for o in (scan.identity.ownership, scan.identity.ownership_ar)):
            yield err("S04", f.rel, f'must state "{scan.identity.ownership}"')
    notice = scan.plugin_file("NOTICE")
    if notice and notice.text is not None and scan.identity.ownership not in notice.text:
        yield err("S04", notice.rel, f'must state "{scan.identity.ownership}"')


def _normalise_apache(text: str) -> str:
    """Put the placeholder back on the appendix copyright line so a filled-in LICENSE still hashes the same."""
    marker = "APPENDIX: How to apply the Apache License to your work."
    head, sep, tail = text.partition(marker)
    if not sep:
        return text
    tail = re.sub(r"(?m)^(\s*)Copyright .*$", r"\1Copyright [yyyy] [name of copyright owner]", tail, count=1)
    return head + sep + tail


@rule("S05")
def s05_licence_files(scan: Scan) -> Iterator[Finding]:
    """LICENSE is the unmodified Apache-2.0 text; NOTICE, TRADEMARKS.md and PRIVACY.md have real content."""
    lic = scan.plugin_file("LICENSE")
    if lic and lic.text is not None:
        digest = hashlib.sha256(_normalise_apache(lic.text.replace("\r\n", "\n")).encode("utf-8")).hexdigest()
        if "Apache License" not in lic.text or "Version 2.0, January 2004" not in lic.text:
            yield err("S05", lic.rel, "not the Apache License, Version 2.0")
        elif digest != APACHE_2_0_SHA256:
            yield err("S05", lic.rel, "the Apache-2.0 text has been altered; keep it byte for byte (only the appendix copyright line may be filled in)")
    for name, minimum in (("NOTICE", 30), ("TRADEMARKS.md", 60), ("PRIVACY.md", 80)):
        f = scan.plugin_file(name)
        if f and f.text is not None and _words(f.text) < minimum:
            yield err("S05", f.rel, f"fewer than {minimum} words; this legal file must be complete")


LEGAL_MIRRORS = ("LICENSE", "NOTICE", "TRADEMARKS.md", "PRIVACY.md")


@rule("S06")
def s06_legal_mirror(scan: Scan) -> Iterator[Finding]:
    """The plugin's LICENSE, NOTICE, TRADEMARKS.md and PRIVACY.md are byte copies of the repository root's."""
    if scan.scope != "repo":
        return
    for name in LEGAL_MIRRORS:
        root_file, plugin_file = scan.get(name), scan.plugin_file(name)
        if root_file and plugin_file and root_file.data != plugin_file.data:
            yield err("S06", plugin_file.rel, f"differs from the repository's {name}; run python tools/sync_shared.py")


@rule("S07")
def s07_portability(scan: Scan) -> Iterator[Finding]:
    """No symlinks, no names that break on Windows or macOS, no junk files, no overlong paths."""
    seen: dict[str, str] = {}
    for f in scan.plugin_files:
        rel = f.plugin_rel or f.rel
        if f.is_symlink:
            yield err("S07", f.rel, "symlinks do not survive zip upload or Windows; use a real file")
        name = f.rel.rsplit("/", 1)[-1]
        if name in JUNK_NAMES or name.endswith(JUNK_SUFFIXES):
            yield err("S07", f.rel, "junk file; delete it")
        for part in rel.split("/"):
            bad = sorted(WINDOWS_BAD_CHARS & set(part))
            if bad or part.endswith((" ", ".")) or part.split(".")[0].lower() in WINDOWS_RESERVED:
                yield err("S07", f.rel, f"name '{part}' is not valid on Windows")
                break
        if len(rel) > MAX_RELATIVE_PATH:
            yield warn("S07", f.rel, f"path is {len(rel)} characters; keep it under {MAX_RELATIVE_PATH} so installs stay below Windows MAX_PATH")
        folded = f.rel.lower()
        if folded in seen and seen[folded] != f.rel:
            yield err("S07", f.rel, f"differs only in case from {seen[folded]}")
        seen[folded] = f.rel
    for d in scan.skipped_dirs:
        if scan.plugin_prefix and not d.startswith(scan.plugin_prefix):
            continue
        base = d.rsplit("/", 1)[-1]
        if base == "node_modules":
            yield err("S07", d + "/", "node_modules must not be inside the plugin")
        elif base == "__pycache__":
            yield warn("S07", d + "/", "not scanned; make sure the release zip leaves it out")


# ---------------------------------------------------------------------------
# F: file contents
# ---------------------------------------------------------------------------


@rule("F01")
def f01_sizes(scan: Scan) -> Iterator[Finding]:
    """Non-image, non-font files are under 256 KiB; runtime chunks are at most 240 KiB."""
    chunk = glob_regex(f"{RUNTIME_DIR}/cs-*.js")
    scoped = scan.files if scan.scope == "repo" else scan.plugin_files
    for f in scoped:
        if f.is_symlink or f.ext in IMAGE_EXT or f.ext in FONT_EXT:
            continue
        kib = f.size / 1024
        if f.plugin_rel is not None and chunk.match(f.plugin_rel):
            if f.size > MAX_CHUNK_BYTES:
                yield err("F01", f.rel, f"runtime chunk is {kib:.1f} KiB; the limit is {MAX_CHUNK_BYTES // 1024} KiB")
        elif f.size >= MAX_FILE_BYTES:
            yield err("F01", f.rel, f"{kib:.1f} KiB; every non-image, non-font file must stay under {MAX_FILE_BYTES // 1024} KiB")


@rule("F02")
def f02_encoding(scan: Scan) -> Iterator[Finding]:
    """Text files are valid UTF-8 without a BOM, contain no NUL bytes, and use LF line endings."""
    scoped = scan.files if scan.scope == "repo" else scan.plugin_files
    for f in scoped:
        if f.is_binary:
            continue
        data = f.data
        if data.startswith(b"\xef\xbb\xbf"):
            yield err("F02", f.rel, "UTF-8 byte order mark; save as UTF-8 without BOM")
        if f.text is None:
            yield err("F02", f.rel, "not valid UTF-8")
            continue
        if b"\x00" in data:
            yield err("F02", f.rel, "contains a NUL byte; is this a binary file with a text extension?")
        if b"\r\n" in data:
            yield warn("F02", f.rel, "CRLF line endings; the project keeps LF (see CONTRIBUTING.md)")


def _reject_constant(name: str):
    raise ValueError(f"{name} is not valid JSON")


def _no_duplicates(pairs: list[tuple[str, object]]) -> dict:
    keys = [k for k, _ in pairs]
    dupes = sorted({k for k in keys if keys.count(k) > 1})
    if dupes:
        raise ValueError(f"duplicate key {dupes[0]!r}")
    return dict(pairs)


def load_json(text: str):
    return json.loads(text, object_pairs_hook=_no_duplicates, parse_constant=_reject_constant)


@rule("F03")
def f03_json(scan: Scan) -> Iterator[Finding]:
    """Every .json file parses, with no duplicate keys, NaN or Infinity."""
    scoped = scan.files if scan.scope == "repo" else scan.plugin_files
    for f in scoped:
        if f.ext != ".json" or f.text is None:
            continue
        try:
            load_json(f.text)
        except json.JSONDecodeError as exc:
            yield err("F03", f.rel, f"invalid JSON: {exc.msg}", exc.lineno)
        except ValueError as exc:
            yield err("F03", f.rel, f"invalid JSON: {exc}")


# ---------------------------------------------------------------------------
# P: policy
# ---------------------------------------------------------------------------

BANNED_LIBS = (
    ("GSAP", re.compile(r"\bgsap\b|greensock|\bTweenMax\b|\bTimelineMax\b", re.IGNORECASE)),
    ("Remotion", re.compile(r"\bremotion\b|@remotion/", re.IGNORECASE)),
)


@rule("P01")
def p01_banned_libraries(scan: Scan) -> Iterator[Finding]:
    """No GSAP or Remotion: an error in code and data, a warning in prose."""
    manifests = [f for f in scan.files if scan.scope == "repo" and "/" not in f.rel and f.rel in LOCKFILES]
    for f in [*scan.policy_files, *manifests]:
        if f.text is None:
            continue
        for label, pattern in BANNED_LIBS:
            m = pattern.search(f.text)
            if not m:
                continue
            make = err if f.ext in DATA_OR_CODE_EXT or f.rel in LOCKFILES else warn
            yield make("P01", f.rel, f"mentions {label} ('{m.group(0)}'); this project uses its own tween code and no {label}", line_of(f.text, m.start()))


TELEMETRY = re.compile(r"\banalytics\b|\bgtag\b|sendBeacon|\btrack\(", re.IGNORECASE)


@rule("P02")
def p02_telemetry(scan: Scan) -> Iterator[Finding]:
    """No telemetry words (analytics, gtag, sendBeacon, a track call) in code or markup."""
    for f in scan.policy_files:
        if f.ext not in RUNNING_CODE_EXT or f.text is None:
            continue
        m = TELEMETRY.search(f.text)
        if m:
            yield err("P02", f.rel, f"telemetry word '{m.group(0)}'; the plugin contains no tracking code", line_of(f.text, m.start()))


PY_NETWORK = re.compile(
    r"(?m)^\s*(?:from|import)\s+(?:urllib\.request|urllib3|http\.client|http\.server|socket|socketserver|requests|httpx|aiohttp|ftplib|smtplib|telnetlib|xmlrpc|ssl|websockets?)\b"
)
JS_NETWORK = re.compile(r"\bfetch\s*\(|XMLHttpRequest|new\s+WebSocket|EventSource|\bhttps?\.(?:get|request)\s*\(")


@rule("P03")
def p03_network(scan: Scan) -> Iterator[Finding]:
    """Plugin Python scripts import no network module; Node scripts that open connections are flagged for review."""
    for f in scan.plugin_files:
        if f.text is None or not f.plugin_rel or not re.match(r"skills/[^/]+/scripts/", f.plugin_rel):
            continue
        if f.ext == ".py":
            m = PY_NETWORK.search(f.text)
            if m:
                yield err("P03", f.rel, f"network module import ({m.group(0).strip()}); skills make no network calls unless the user asks", line_of(f.text, m.start()))
        elif f.ext in (".mjs", ".js", ".cjs"):
            m = JS_NETWORK.search(f.text)
            if m:
                yield warn("P03", f.rel, f"'{m.group(0).strip()}' opens a connection; confirm it only targets 127.0.0.1 or runs on the user's request", line_of(f.text, m.start()))


URL = re.compile(r"https?://[^\s<>\"'`\\)\]}]+", re.IGNORECASE)

ANY_FILE = ("**",)
DOC_FILES = ("README.md", "NOTICE", "PRIVACY.md", "TRADEMARKS.md", "LICENSE", "skills/carousel-design/references/**")
RUNTIME_FILES = (f"{RUNTIME_DIR}/**", "skills/carousel-design/templates/**")

# (pattern, files it may appear in). A URL must match one pattern for the file it is in.
ALLOWED_URLS: tuple[tuple[re.Pattern[str], tuple[str, ...]], ...] = (
    # XML namespace and JSON Schema dialect identifiers: names, never fetched.
    (re.compile(r"^https?://www\.w3\.org/(?:1999/(?:xhtml|xlink)|2000/svg)$"), ANY_FILE),
    (re.compile(r"^https://json-schema\.org/draft/2020-12/schema$"), ANY_FILE),
    # The Apache licence address, as printed in licence headers.
    (re.compile(r"^https?://(?:www\.)?apache\.org/licenses/(?:LICENSE-2\.0(?:\.txt)?)?$"), ANY_FILE),
    # The two pinned browser dependencies (CONTRACT 0.2 rule 5).
    (re.compile(r"^https://cdn\.jsdelivr\.net/npm/(?:mediabunny@1\.61\.0|fflate@0\.8\.2)/"), DOC_FILES + RUNTIME_FILES),
    # Source links for third-party components named in NOTICE.
    (re.compile(r"^https://(?:github\.com/(?:Vanilagy/mediabunny|heygen-com/hyperframes|lucide-icons/lucide|101arrowz/fflate)|mediabunny\.dev|lucide\.dev)(?:[/#?].*)?$"), DOC_FILES + RUNTIME_FILES),
    # Licence texts.
    (re.compile(r"^https://(?:www\.mozilla\.org/MPL/2\.0|opensource\.org/licenses?/[A-Za-z0-9.+_-]+|openfontlicense\.org|scripts\.sil\.org/OFL|lucide\.dev/license)/?$"), DOC_FILES + RUNTIME_FILES),
)
# Upstream records about fonts are data about where a font came from; nothing fetches them.
URL_EXEMPT_FILES = (f"{FONTS_DIR}/**",)


@rule("P04")
def p04_urls(scan: Scan) -> Iterator[Finding]:
    """Web addresses in the plugin appear only on a short allowlist (no endpoint of ours can leak in)."""
    repo_url = re.compile(re.escape(scan.identity.repo_url) + r"(?:[/#?].*)?$", re.IGNORECASE)
    for f in scan.plugin_files:
        if f.text is None or matches_any(f.plugin_rel or "", URL_EXEMPT_FILES):
            continue
        for m in URL.finditer(f.text):
            url = m.group(0).rstrip(".,;:!?*_")
            if repo_url.match(url) or scan.identity.credit_hits(url):
                continue  # the project address is always fine; author links are judged by P05
            if any(p.match(url) and matches_any(f.plugin_rel or "", files) for p, files in ALLOWED_URLS):
                continue
            yield err("P04", f.rel, f"web address not on the allowlist: {url}", line_of(f.text, m.start()))


CREDIT_FILES = (
    "README.md", "LICENSE", "NOTICE", "PRIVACY.md", "TRADEMARKS.md", ".claude-plugin/plugin.json",
    UI_STRINGS, "skills/brand-setup/references/sections.md",
)


@rule("P05")
def p05_credit_scope(scan: Scan) -> Iterator[Finding]:
    """The author's name and handles appear only in the files CONTRACT 0.6 lists (ui-strings.json: only in about.* keys)."""
    for f in scan.policy_files:
        if f.text is None or f.ext in IMAGE_EXT:
            continue
        if f.plugin_rel == UI_STRINGS:
            yield from _credit_in_ui_strings(scan, f)
            continue
        if f.plugin_rel is not None and f.plugin_rel in CREDIT_FILES:
            continue
        hits = scan.identity.credit_hits(f.text)
        if hits:
            yield err("P05", f.rel, f"'{hits[0].group(0)}' (author credit) outside the files that may carry it; credits belong in tool screens, README and legal files only", line_of(f.text, hits[0].start()))


def _credit_in_ui_strings(scan: Scan, f: SourceFile) -> Iterator[Finding]:
    try:
        strings = load_json(f.text or "").get("strings", {})
    except (ValueError, AttributeError):
        return  # F03 reports the broken JSON
    for key, value in strings.items():
        hits = scan.identity.credit_hits(json.dumps(value, ensure_ascii=False))
        if hits and not str(key).startswith("about."):
            yield err("P05", f.rel, f"credit text in key '{key}'; credit strings must use the about.* prefix so credit-free builds can drop them")


HOOK_BANK_CLIENT_ID = re.compile(r"\bH(?:14[7-9]|1[5-8][0-9]|19[0-7])\b")
HOOK_BANK_RANGE = re.compile(r"\bH\d{1,3}\s*(?:-|–|—|\.\.|to)\s*H\d{1,3}\b")


@rule("P06")
def p06_hook_bank_ids(scan: Scan) -> Iterator[Finding]:
    """No client hook-bank IDs (H147-H197) in public files. A range such as H147-H197 names the boundary, not an entry, and is allowed."""
    for f in scan.public_files:
        if f.text is None:
            continue
        text = HOOK_BANK_RANGE.sub(lambda r: " " * len(r.group(0)), f.text)
        m = HOOK_BANK_CLIENT_ID.search(text)
        if m:
            yield err("P06", f.rel, f"hook-bank client id {m.group(0)}; client text and ids never go into public files", line_of(text, m.start()))


# ---------------------------------------------------------------------------
# Owner phrases (Q42): the owner's own hooks and signature lines stay in his private pack
# ---------------------------------------------------------------------------

OWNER_PHRASES_FILE = Path(__file__).resolve().parent / "owner-phrases.json"
OWNER_NGRAM = 4  # words; shorter runs are ordinary Arabic
_MARKS_RE = re.compile("[\\u064B-\\u065F\\u0670\\u0640]")
_FOLD = str.maketrans({
    "\u0623": "\u0627", "\u0625": "\u0627", "\u0622": "\u0627", "\u0671": "\u0627",  # alef forms
    "\u0649": "\u064A", "\u0626": "\u064A",  # alef maqsura, yaa with hamza
    "\u0629": "\u0647", "\u0624": "\u0648",  # taa marbuta, waw with hamza
})
_WORD_RE = re.compile("[\\u0621-\\u064A0-9A-Za-z]+")


def phrase_words(text: str) -> list[str]:
    """Words of a text with tashkeel, tatweel, punctuation and hamza/taa/yaa variants folded away (the comparison form of a phrase)."""
    return _WORD_RE.findall(_MARKS_RE.sub("", text).translate(_FOLD).lower())


def phrase_hashes(words: list[str], n: int = OWNER_NGRAM) -> list[str]:
    """Short SHA-256 digests of every run of n words. A run is not reversible, so the list can be published safely."""
    return [hashlib.sha256(" ".join(words[i:i + n]).encode("utf-8")).hexdigest()[:12] for i in range(len(words) - n + 1)]


def build_owner_hashes(bank: Path) -> dict:
    """Read the owner's private hook bank (Markdown tables whose first cell is an id such as H012) and return the hash document."""
    hashes: set[str] = set()
    for line in bank.read_text(encoding="utf-8").splitlines():
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) >= 2 and re.fullmatch(r"H\d{1,3}", cells[0]):
            candidates = [cells[1]]
        elif len(cells) >= 4 and re.fullmatch(r"\d{1,3}", cells[0]):
            candidates = [cells[3]]  # the "example" column of the named-formats table
        else:
            continue
        for text in candidates:
            hashes.update(phrase_hashes(phrase_words(text)))
    return {
        "schemaVersion": 1,
        "description": "Salted-by-length SHA-256 digests (12 hex) of every run of four words in the owner's private hook bank. check_directory.py rule P10 uses them to prove that none of his own lines is in a public file; the bank itself is never in the repository.",
        "ngram": OWNER_NGRAM,
        "hashes": sorted(hashes),
    }


@rule("P10")
def p10_owner_phrases(scan: Scan) -> Iterator[Finding]:
    """None of the owner's own hooks or signature lines (hashed in tools/owner-phrases.json) appears in a public file."""
    try:
        doc = load_json(OWNER_PHRASES_FILE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return
    known = set(doc.get("hashes") or [])
    n = int(doc.get("ngram") or OWNER_NGRAM)
    if not known:
        return
    for f in scan.public_files:
        if f.text is None or f.ext in IMAGE_EXT or f.rel == "tools/owner-phrases.json":
            continue
        shown = 0
        for number, line in enumerate(f.text.splitlines(), 1):
            words = phrase_words(line)
            if len(words) < n:
                continue
            if any(h in known for h in phrase_hashes(words, n)):
                yield err("P10", f.rel, "a line that matches the owner's private hook bank; his own hooks and signature lines stay in his private pack (write a fresh synthetic line)", number)
                shown += 1
                if shown >= 6:
                    break


SKILL_PATH = re.compile(r"^skills/([^/]+)/")
PARENT_REF = re.compile(r"(?<![A-Za-z0-9_.])(?:\.\.[/\\])+[A-Za-z0-9_./\\\-\[\]]*")
OTHER_SKILL_REF = re.compile(r"(?<![A-Za-z0-9_-])skills/([a-z][a-z0-9-]*)/")
ABSOLUTE_REF = re.compile(r"(?<![A-Za-z0-9_])[A-Za-z]:[\\/](?!/)|(?<![A-Za-z0-9_.])/(?:home|Users|mnt|opt|usr|var|tmp|etc)/|~/\.claude|\$\{?CLAUDE_PLUGIN_ROOT")
SKILL_TEXT_EXT = {".md", ".py", ".mjs", ".js", ".cjs", ".json", ".html"}


@rule("P07")
def p07_skill_containment(scan: Scan) -> Iterator[Finding]:
    """A skill reads nothing outside its own folder (Chat syncs skills one folder at a time)."""
    for f in scan.plugin_files:
        m = SKILL_PATH.match(f.plugin_rel or "")
        if not m or f.text is None or f.ext not in SKILL_TEXT_EXT:
            continue
        skill = m.group(1)
        skill_dir = f"skills/{skill}"
        here = posixpath.dirname(f.plugin_rel)
        for ref in PARENT_REF.finditer(f.text):
            target = posixpath.normpath(posixpath.join(here, ref.group(0).replace("\\", "/")))
            if target != skill_dir and not target.startswith(skill_dir + "/"):
                yield err("P07", f.rel, f"'{ref.group(0)}' leaves the {skill} folder; sync a copy into the skill instead", line_of(f.text, ref.start()))
        for ref in OTHER_SKILL_REF.finditer(f.text):
            if ref.group(1) != skill:
                yield err("P07", f.rel, f"path into another skill ('skills/{ref.group(1)}/'); a skill must be self-contained", line_of(f.text, ref.start()))
                break
        body = re.sub(r"\A#![^\n]*", lambda s: " " * len(s.group(0)), f.text)  # a shebang line is not a path to read
        absolute = ABSOLUTE_REF.search(body)
        if absolute:
            yield err("P07", f.rel, f"absolute or machine-specific path ('{absolute.group(0)}')", line_of(f.text, absolute.start()))


FETCH_LATEST = re.compile(
    r"\b(?:fetch|download|pull|retrieve|grab|get|update)\b[^\n.!?]{0,60}\b(?:latest|newest|most recent)\b[^\n.!?]{0,60}\b(?:rules?|instructions?|prompts?|skills?|guides?|config(?:uration)?|data|versions?)\b"
    r"|(?:نزّل|نزل|حمّل|حمل|حدّث|حدث)\s+(?:أحدث|احدث)",
    re.IGNORECASE,
)
SHELL_FETCH = re.compile(r"(?m)(?:^|[\s`$>(])(?:curl|wget|Invoke-WebRequest|Invoke-RestMethod|iwr)\s+(?:-|https?://)")
UNPINNED = re.compile(r"@latest\b")


@rule("P08")
def p08_no_remote_instructions(scan: Scan) -> Iterator[Finding]:
    """No skill tells Claude to download "the latest" rules or instructions, to curl or wget, or to use @latest."""
    for f in scan.plugin_files:
        if f.text is None:
            continue
        in_prose = f.ext == ".md" and re.match(r"(?:skills/[^/]+/(?:SKILL\.md|references/)|commands/|agents/)", f.plugin_rel or "")
        if in_prose:
            for pattern, what in ((FETCH_LATEST, "an instruction to fetch the latest rules or data from outside"), (SHELL_FETCH, "a download command")):
                m = pattern.search(f.text)
                if m:
                    yield err("P08", f.rel, f"{what}: '{m.group(0).strip()}'; skills never pull rules or instructions at run time", line_of(f.text, m.start()))
        m = UNPINNED.search(f.text)
        if m:
            yield err("P08", f.rel, "unpinned dependency '@latest'; pin an exact version", line_of(f.text, m.start()))


SECRET_PATTERNS = (
    re.compile(r"sk-ant-[A-Za-z0-9_-]{20,}"),
    re.compile(r"\bsk-[A-Za-z0-9]{32,}"),
    re.compile(r"\bAKIA[0-9A-Z]{16}\b"),
    re.compile(r"\bAIza[0-9A-Za-z_-]{35}\b"),
    re.compile(r"\bgh[pousr]_[A-Za-z0-9]{36,}\b"),
    re.compile(r"\bgithub_pat_[A-Za-z0-9_]{50,}\b"),
    re.compile(r"\bxox[abprs]-[A-Za-z0-9-]{20,}"),
    re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----"),
    re.compile(r"(?i)\b(?:api[_-]?key|secret|token|password)\b\s*[:=]\s*[\"'][A-Za-z0-9_\-./+]{24,}[\"']"),
)
FAKE_MARKER = re.compile(r"example|fake|dummy|placeholder|sample|xxxx|0000|test", re.IGNORECASE)


@rule("P09")
def p09_secrets(scan: Scan) -> Iterator[Finding]:
    """No API keys, tokens or private keys in committed files (obviously fake test values are ignored)."""
    for f in scan.files:
        if f.text is None or f.rel == "tools/check_directory.py":
            continue
        for pattern in SECRET_PATTERNS:
            for m in pattern.finditer(f.text):
                if not FAKE_MARKER.search(m.group(0)):
                    yield err("P09", f.rel, "looks like a secret; remove it and rotate the key", line_of(f.text, m.start()))
                    break


# ---------------------------------------------------------------------------
# M: manifests and skills
# ---------------------------------------------------------------------------

SEMVER = re.compile(r"^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$")
KEBAB = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
KNOWN_PLUGIN_KEYS = {
    "name", "version", "description", "author", "homepage", "repository", "license", "keywords",
    "commands", "agents", "skills", "hooks", "mcpServers", "lspServers", "outputStyles", "userConfig", "channels",
    # listing fields the directory reads; `claude plugin validate --strict` accepts them (Claude Code 2.1.283)
    "icon", "documentationUrl", "supportUrl", "privacyPolicyUrl",
}
USER_CONFIG_TYPES = {"string", "number", "boolean", "directory", "file"}


def _load_manifest(scan: Scan, f: SourceFile | None) -> tuple[dict | None, list[Finding]]:
    if f is None or f.text is None:
        return None, []  # S03 reports a missing file
    try:
        data = load_json(f.text)
    except ValueError:
        return None, []  # F03 reports the syntax error
    if not isinstance(data, dict):
        return None, [err("M01", f.rel, "must be a JSON object")]
    return data, []


@rule("M01")
def m01_plugin_manifest(scan: Scan) -> Iterator[Finding]:
    """plugin.json has the required fields, a valid name and version, and well-formed userConfig."""
    f = scan.plugin_file(".claude-plugin/plugin.json")
    data, problems = _load_manifest(scan, f)
    yield from problems
    if data is None or f is None:
        return
    name = data.get("name")
    if not isinstance(name, str) or not KEBAB.match(name):
        yield err("M01", f.rel, "name must be kebab-case")
    elif name != "carousel-studio" or name.startswith(("claude", "anthropic")):
        yield err("M01", f.rel, f"name is '{name}'; it must be 'carousel-studio' (no claude- or anthropic prefix)")
    if not isinstance(data.get("version"), str) or not SEMVER.match(data["version"]):
        yield err("M01", f.rel, "version must be semantic (X.Y.Z)")
    if data.get("license") != scan.identity.license:
        yield err("M01", f.rel, f"license must be {scan.identity.license}")
    if not str(data.get("description", "")).strip():
        yield err("M01", f.rel, "description is missing")
    author = data.get("author")
    if not isinstance(author, dict) or author.get("name") != scan.identity.name:
        yield err("M01", f.rel, f"author.name must be '{scan.identity.name}' (tools/identity.json)")
    if data.get("repository") != scan.identity.repo_url:
        yield err("M01", f.rel, f"repository must be {scan.identity.repo_url} (tools/identity.json)")
    for key, want in (("documentationUrl", scan.identity.documentation_url), ("supportUrl", scan.identity.support_url), ("privacyPolicyUrl", scan.identity.privacy_url)):
        if want and data.get(key) != want:
            yield err("M01", f.rel, f"{key} must be {want} (tools/identity.json)")
    icon = data.get("icon")
    if not isinstance(icon, str) or not icon:
        yield err("M01", f.rel, "icon is missing: the directory listing needs it (./assets/icon.png)")
    elif not (scan.plugin_root / icon).is_file():
        yield err("M01", f.rel, f"icon {icon} does not exist")
    for key in sorted(set(data) - KNOWN_PLUGIN_KEYS):
        yield warn("M01", f.rel, f"'{key}' is not a documented plugin.json field; confirm `claude plugin validate` accepts it or remove it")
    for key, option in (data.get("userConfig") or {}).items():
        if not isinstance(option, dict):
            yield err("M01", f.rel, f"userConfig.{key} must be an object")
            continue
        if option.get("type") not in USER_CONFIG_TYPES:
            yield err("M01", f.rel, f"userConfig.{key}.type must be one of {sorted(USER_CONFIG_TYPES)}")
        for field in ("title", "description"):
            if not str(option.get(field, "")).strip():
                yield err("M01", f.rel, f"userConfig.{key}.{field} is missing")


@rule("M02")
def m02_marketplace(scan: Scan) -> Iterator[Finding]:
    """marketplace.json lists only plugins/carousel-studio, with matching name, version and license."""
    if scan.scope != "repo":
        return
    f = scan.get(".claude-plugin/marketplace.json")
    data, problems = _load_manifest(scan, f)
    yield from problems
    if data is None or f is None:
        return
    if not isinstance(data.get("owner"), dict) or data["owner"].get("name") != scan.identity.name:
        yield err("M02", f.rel, f"owner.name must be '{scan.identity.name}'")
    plugins = data.get("plugins")
    if not isinstance(plugins, list) or len(plugins) != 1:
        yield err("M02", f.rel, "must list exactly one plugin (carousel-studio)")
        return
    entry = plugins[0]
    if entry.get("name") != "carousel-studio":
        yield err("M02", f.rel, "the listed plugin must be named carousel-studio")
    source = str(entry.get("source", ""))
    if source != "./" + PLUGIN_DIR:
        yield err("M02", f.rel, f"source must be ./{PLUGIN_DIR} (never lite/ or any other folder)")
    plugin = scan.plugin_file(".claude-plugin/plugin.json")
    manifest, _ = _load_manifest(scan, plugin)
    if manifest:
        for key in ("version", "license", "description"):
            if entry.get(key) != manifest.get(key):
                yield err("M02", f.rel, f"plugins[0].{key} differs from plugin.json")
    if data.get("metadata", {}).get("version") not in (None, entry.get("version")):
        yield err("M02", f.rel, "metadata.version differs from the plugin version")


@rule("M03")
def m03_changelog_version(scan: Scan) -> Iterator[Finding]:
    """CHANGELOG.md's newest entry is the plugin version."""
    if scan.scope != "repo":
        return
    changelog, plugin = scan.get("CHANGELOG.md"), scan.plugin_file(".claude-plugin/plugin.json")
    manifest, _ = _load_manifest(scan, plugin)
    if changelog is None or changelog.text is None or not manifest:
        return
    m = re.search(r"(?m)^## \[(\d+\.\d+\.\d+[^\]]*)\]", changelog.text)
    if not m or m.group(1) != manifest.get("version"):
        found = m.group(1) if m else "none"
        yield err("M03", changelog.rel, f"newest entry is {found}; plugin.json says {manifest.get('version')}")


def parse_frontmatter(text: str) -> dict[str, str] | None:
    """Read the key: value pairs of a leading --- block (strings and folded blocks only)."""
    lines = text.replace("\r\n", "\n").split("\n")
    if not lines or lines[0].strip() != "---":
        return None
    end = next((i for i in range(1, len(lines)) if lines[i].strip() == "---"), None)
    if end is None:
        return None
    data: dict[str, str] = {}
    key = None
    for line in lines[1:end]:
        m = re.match(r"^([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$", line)
        if m and not line.startswith((" ", "\t")):
            key, value = m.group(1), m.group(2).strip()
            data[key] = "" if value in (">", "|", ">-", "|-", ">+", "|+") else value.strip("\"'")
        elif key and line.strip():
            data[key] = f"{data[key]} {line.strip()}".strip()
    return data


def estimate_tokens(text: str) -> int:
    ascii_chars = sum(1 for ch in text if ord(ch) < 128)
    return int(ascii_chars / 4 + (len(text) - ascii_chars) / 2.5)


@rule("M04")
def m04_skills(scan: Scan) -> Iterator[Finding]:
    """Every skill has valid SKILL.md frontmatter, stays within the token budget, and ships evals/evals.json."""
    skills = sorted({m.group(1) for f in scan.plugin_files if (m := SKILL_PATH.match(f.plugin_rel or ""))})
    for skill in skills:
        md = scan.plugin_file(f"skills/{skill}/SKILL.md")
        if md is None:
            yield err("M04", scan.rel_for(f"skills/{skill}/"), "SKILL.md is missing")
            continue
        if md.text is None:
            continue
        meta = parse_frontmatter(md.text)
        if meta is None:
            yield err("M04", md.rel, "missing --- frontmatter block with name and description")
        else:
            if meta.get("name") != skill:
                yield err("M04", md.rel, f"frontmatter name '{meta.get('name')}' must equal the folder name '{skill}'")
            if not KEBAB.match(skill) or len(skill) > 64 or "claude" in skill or "anthropic" in skill:
                yield err("M04", md.rel, "skill name: lowercase letters, digits and hyphens, at most 64 characters, no 'claude' or 'anthropic'")
            description = meta.get("description", "")
            if not description:
                yield err("M04", md.rel, "frontmatter description is empty")
            elif len(description) > 1024 or re.search(r"<[A-Za-z/][^>]*>", description):
                yield err("M04", md.rel, "description must be at most 1024 characters and contain no XML tags")
        tokens = estimate_tokens(md.text)
        if tokens > SKILL_TOKEN_BUDGET:
            yield warn("M04", md.rel, f"about {tokens} tokens (estimate); keep SKILL.md under {SKILL_TOKEN_BUDGET} and move detail to references/")
        if scan.plugin_file(f"skills/{skill}/evals/evals.json") is None:
            yield warn("M04", scan.rel_for(f"skills/{skill}/evals/"), "evals/evals.json is missing")


# ---------------------------------------------------------------------------
# Running and reporting
# ---------------------------------------------------------------------------


def detect_scope(root: Path) -> str:
    is_repo = (root / ".claude-plugin" / "marketplace.json").is_file() and (root / "plugins").is_dir()
    return "repo" if is_repo else "plugin"


def run(root: Path, scope: str, max_files: int, repo_max_files: int | None = None) -> tuple[Scan, list[Finding]]:
    scan = Scan(root, scope, max_files, Identity.load(), repo_max_files)
    findings = [finding for _, check in RULES for finding in check(scan)]
    return scan, sorted(findings, key=Finding.sort_key)


def exit_code(findings: list[Finding], strict: bool) -> int:
    if any(f.severity == ERROR for f in findings) or (strict and findings):
        return EXIT_ERROR
    return EXIT_WARN if findings else EXIT_OK


def render_text(scan: Scan, findings: list[Finding], strict: bool) -> str:
    errors = sum(f.severity == ERROR for f in findings)
    warnings = len(findings) - errors
    plugin_count = len(scan.plugin_files)
    lines = [
        "Carousel Studio directory check",
        f"  scope  {scan.scope}",
        f"  root   {scan.root}",
        f"  files  {plugin_count} in the plugin (limit {scan.max_files})" + (f", {len(scan.files)} in the repository (limit {scan.repo_max_files})" if scan.scope == "repo" else ""),
        "",
    ]
    for f in findings:
        where = f"{f.path}:{f.line}" if f.line else f.path
        lines.append(f"{f.severity.upper():<5}  {f.rule}  {where}")
        lines.append(f"       {f.message}")
    if findings:
        lines.append("")
    verdict = "FAIL" if exit_code(findings, strict) >= EXIT_ERROR else ("WARN" if findings else "PASS")
    lines.append(f"{verdict}: {errors} error{'s' if errors != 1 else ''}, {warnings} warning{'s' if warnings != 1 else ''}")
    return "\n".join(lines)


def render_json(scan: Scan, findings: list[Finding], strict: bool) -> str:
    errors = sum(f.severity == ERROR for f in findings)
    code = exit_code(findings, strict)
    return json.dumps(
        {
            "ok": code < EXIT_ERROR,
            "status": "fail" if code >= EXIT_ERROR else ("warn" if findings else "pass"),
            "scope": scan.scope,
            "root": str(scan.root),
            "files": {"plugin": len(scan.plugin_files), "total": len(scan.files), "limit": scan.max_files, "repoLimit": scan.repo_max_files},
            "errors": errors,
            "warnings": len(findings) - errors,
            "findings": [f.as_dict() for f in findings],
        },
        ensure_ascii=False,
        indent=2,
    )


def build_parser() -> argparse.ArgumentParser:
    default_root = Path(__file__).resolve().parent.parent / PLUGIN_DIR
    parser = argparse.ArgumentParser(prog="check_directory.py", description="Check the plugin (and repository) against the directory policy.")
    parser.add_argument("--root", default=str(default_root), help=f"folder to scan (default: {PLUGIN_DIR}; use . for the whole repository)")
    parser.add_argument("--scope", choices=("auto", "plugin", "repo"), default="auto")
    parser.add_argument("--max-files", type=int, default=MAX_FILES, help=f"file-count limit (default {MAX_FILES})")
    parser.add_argument("--repo-max-files", type=int, help="file-count limit for the whole repository in --scope repo (default: --max-files). CI passes the committed baseline here so the tree cannot grow unnoticed")
    parser.add_argument("--strict", action="store_true", help="treat warnings as errors")
    parser.add_argument("--format", choices=("text", "json"), default="text")
    parser.add_argument("--list-rules", action="store_true", help="print the rule ids and exit")
    parser.add_argument("--build-owner-hashes", metavar="BANK.md", help="read the owner's private hook bank and write tools/owner-phrases.json (digests only), then exit")
    return parser


def _ensure_utf8_stdio() -> None:
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if reconfigure is not None:
            reconfigure(encoding="utf-8")


def main(argv: list[str] | None = None) -> int:
    _ensure_utf8_stdio()
    try:
        args = build_parser().parse_args(argv)
    except SystemExit as exc:
        return EXIT_OK if exc.code == 0 else EXIT_USAGE
    if args.list_rules:
        for rule_id, check in RULES:
            print(f"{rule_id}  {(check.__doc__ or '').strip()}")
        return EXIT_OK
    if args.build_owner_hashes:
        bank = Path(args.build_owner_hashes)
        if not bank.is_file():
            print(f"cs-error: E_USAGE: bank not found: {bank}", file=sys.stderr)
            return EXIT_NO_INPUT
        doc = build_owner_hashes(bank)
        OWNER_PHRASES_FILE.write_text(json.dumps(doc, ensure_ascii=False, indent=1) + "\n", encoding="utf-8", newline="\n")
        print(f"wrote {OWNER_PHRASES_FILE.name}: {len(doc['hashes'])} digests")
        return EXIT_OK
    if args.max_files < 1:
        print("cs-error: E_USAGE: --max-files must be at least 1", file=sys.stderr)
        return EXIT_USAGE
    root = Path(args.root).resolve()
    if not root.is_dir():
        print(f"cs-error: E_USAGE: root not found: {root}", file=sys.stderr)
        return EXIT_NO_INPUT
    scope = detect_scope(root) if args.scope == "auto" else args.scope
    if args.repo_max_files is not None and args.repo_max_files < 1:
        print("cs-error: E_USAGE: --repo-max-files must be at least 1", file=sys.stderr)
        return EXIT_USAGE
    scan, findings = run(root, scope, args.max_files, args.repo_max_files)
    print(render_json(scan, findings, args.strict) if args.format == "json" else render_text(scan, findings, args.strict))
    return exit_code(findings, args.strict)


if __name__ == "__main__":
    sys.exit(main())
