#!/usr/bin/env python3
"""Copy the shared schemas, rules and helpers from carousel-design into the skills that use them.

Claude syncs skills folder by folder, so no skill may read a file outside its own
folder at run time. The files that several skills need therefore have one canonical
home, plugins/carousel-studio/skills/carousel-design/, and a byte-identical copy in
every consumer. This tool writes those copies (CONTRACT section 2.4) and, with
--check, fails when any copy has drifted, so CI catches an edit made in the wrong place.

It also mirrors four legal files from the repository root into the plugin folder
(LEGAL_MIRRORS), because the plugin ships on its own and must carry its own copies.

Sources that their owners have not shipped yet are marked optional in the manifest (the icon
library, the art direction and scene data, the icon-search and art-direction scripts of the visual
language): while such a source is absent it is reported as "pending" and skipped. --strict turns a
pending source into an error, which is the form for a release and for the final integration.

Usage:
    python tools/sync_shared.py [--check] [--verbose] [--prune] [--strict] [--format text|json]
                                [--root REPO_ROOT]

Exit codes (CONTRACT 0.4):
    0   everything is in sync (or was synced)
    2   --check found drift: a copy differs, is missing, or is an orphan
    64  usage error
    66  a source file is missing (with --strict: or not shipped yet), or the repository root cannot be found
    73  a copy could not be written

Python 3.11, standard library only.
"""

from __future__ import annotations

import argparse
import fnmatch
import json
import os
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

EXIT_OK = 0
EXIT_DRIFT = 2
EXIT_USAGE = 64
EXIT_NO_INPUT = 66
EXIT_CANT_WRITE = 73

SKILLS_REL = Path("plugins/carousel-studio/skills")
PLUGIN_REL = Path("plugins/carousel-studio")
SOURCE_SKILL = "carousel-design"

# Directories and files that tooling creates and that never take part in a sync.
IGNORED_NAMES = {"__pycache__"}
IGNORED_SUFFIXES = {".pyc", ".pyo"}


@dataclass(frozen=True)
class Entry:
    """One line of the sync manifest.

    src_dir  -- folder inside carousel-design/ (POSIX, relative)
    names    -- file names, or glob patterns such as "*.json" or "*"
    dest_dir -- folder inside the consumer skill (POSIX, relative)
    managed  -- True when dest_dir is a mirror of src_dir: files in it that the
                manifest does not produce are reported as orphans
    optional -- True for a source that its owner has not shipped yet: while it is
                absent it is "pending" (skipped), not "source missing"; --strict
                makes it an error again
    """

    src_dir: str
    names: tuple[str, ...]
    dest_dir: str
    managed: bool = False
    optional: bool = False


def _cs(*modules: str) -> Entry:
    """Entry for named modules of scripts/_cs/ (dest folder is always scripts/_cs/)."""
    return Entry("scripts/_cs", tuple(f"{m}.py" for m in modules), "scripts/_cs", managed=True)


_ALL_CS = Entry("scripts/_cs", ("*",), "scripts/_cs", managed=True)
# Round 3 close: the contract of the free design lane (slide.free). Every skill that runs validate.py or a _cs module carries it, as it
# carries qa-rules.json; the validator (_cs/free.py) and the text twin (_cs/text.py free_text) read it from their own skill folder.
_FREE_DESIGN = Entry("data", ("free-design.json",), "data")
_DIALECTS = Entry("data/dialects", ("*.json",), "data/dialects", managed=True)

# Round 3, IS-4: the icon library (written by tools/build-icons.mjs and the stemmer), the art direction and scene data, and the two scripts
# that read them. carousel-create runs the planner twin and the icon search in the sandbox, so it carries them. marks.json is not here: the
# marks are drawn by the Studio only. New _cs modules (icons, space, art_plan, qa_visual) need no line: _ALL_CS already copies them.
_ICON_DATA = ("pack.json", "index.json", "concepts.json", "objects.json", "stem.json", "emoji-map.json")

# CONTRACT 2.4. Paths are relative to carousel-design/ (source) and to the consumer skill (destination).
MANIFEST: dict[str, tuple[Entry, ...]] = {
    "carousel-create": (
        Entry("schemas", ("spec.schema.json", "hook.schema.json"), "data/schemas", managed=True),
        Entry("data", ("qa-rules.json", "platform-instagram.json", "locale-defaults.json", "glossary.json"), "data"),
        _FREE_DESIGN,
        Entry("data/rules", ("copy.json", "ortho.json"), "data/rules", managed=True),
        _DIALECTS,
        Entry("scripts", ("validate.py",), "scripts"),
        Entry("data/icons", _ICON_DATA, "data/icons", managed=True, optional=True),
        Entry("data", ("art-direction.json",), "data", optional=True),
        Entry("data/art", ("scenes.json",), "data/art", managed=True, optional=True),
        Entry("scripts", ("icon_search.py", "art_direct.py"), "scripts", optional=True),
        _ALL_CS,
    ),
    "content-angles": (
        _FREE_DESIGN,
        _cs("__init__", "paths", "text"),
    ),
    "brand-setup": (
        Entry("schemas", ("brand.schema.json", "hook.schema.json"), "data/schemas", managed=True),
        Entry("data", ("locale-defaults.json", "glossary.json"), "data"),
        _FREE_DESIGN,
        Entry("scripts", ("validate.py",), "scripts"),
        _cs("__init__", "paths", "schema", "canon", "text", "color", "free"),
    ),
    "arabic-proofread": (
        Entry("data", ("qa-rules.json", "glossary.json"), "data"),
        _FREE_DESIGN,
        Entry("data/rules", ("copy.json", "ortho.json"), "data/rules", managed=True),
        _DIALECTS,
        _cs("__init__", "paths", "text", "rules", "lint", "report"),
    ),
    "content-plan": (
        Entry("schemas", ("plan.schema.json",), "data/schemas", managed=True),
        Entry("data", ("platform-instagram.json", "locale-defaults.json"), "data"),
        _FREE_DESIGN,
        Entry("scripts", ("validate.py",), "scripts"),
        _cs("__init__", "paths", "schema", "canon", "text", "free"),
    ),
    "visual-prompts": (),
}

# Not part of CONTRACT 2.4: the plugin ships alone, so it carries its own copy of the
# legal files. The repository root is canonical. README.md is written separately.
LEGAL_MIRRORS: tuple[str, ...] = ("LICENSE", "NOTICE", "TRADEMARKS.md", "PRIVACY.md")

# Statuses of one planned copy.
OK, CREATE, UPDATE, MISSING_SOURCE, ORPHAN, PENDING = "ok", "create", "update", "missing-source", "orphan", "pending"


@dataclass(frozen=True)
class Item:
    group: str  # skill name, or "legal"
    src: Path | None  # None for orphans
    dst: Path
    status: str


def _is_ignored(path: Path) -> bool:
    return path.name in IGNORED_NAMES or path.suffix in IGNORED_SUFFIXES


def _expand(src_dir: Path, patterns: Iterable[str]) -> tuple[list[str], list[str]]:
    """Resolve names and globs against src_dir.

    Returns (found file names, patterns that matched nothing). A literal name that
    does not exist and a glob that matches no file are both reported as missing, so
    an absent source folder can never pass as "nothing to sync".
    """
    found: list[str] = []
    missing: list[str] = []
    entries = (
        sorted(p.name for p in src_dir.iterdir() if p.is_file() and not _is_ignored(p))
        if src_dir.is_dir()
        else []
    )
    for pattern in patterns:
        if any(ch in pattern for ch in "*?["):
            matches = [n for n in entries if fnmatch.fnmatchcase(n, pattern)]
            if not matches:
                missing.append(pattern)
            found.extend(n for n in matches if n not in found)
        elif pattern in entries:
            if pattern not in found:
                found.append(pattern)
        else:
            missing.append(pattern)
    return found, missing


def _read(path: Path) -> bytes | None:
    try:
        return path.read_bytes()
    except FileNotFoundError:
        return None


def plan(root: Path, strict: bool = False) -> list[Item]:
    """Compare every source with its destination and return one Item per file.

    A source of an optional entry that does not exist yet is a PENDING item (nothing to copy); with strict it is MISSING_SOURCE like any other."""
    skills = root / SKILLS_REL
    source_root = skills / SOURCE_SKILL
    items: list[Item] = []

    for skill, entries in MANIFEST.items():
        dest_root = skills / skill
        expected: dict[Path, set[str]] = {}
        managed_dirs: set[Path] = set()
        for entry in entries:
            src_dir = source_root / entry.src_dir
            dst_dir = dest_root / entry.dest_dir
            names, missing = _expand(src_dir, entry.names)
            for name in missing:
                items.append(Item(skill, src_dir / name, dst_dir / name, PENDING if entry.optional and not strict else MISSING_SOURCE))
            for name in names:
                src, dst = src_dir / name, dst_dir / name
                dst_bytes = _read(dst)
                if dst_bytes is None:
                    status = CREATE
                elif dst_bytes != src.read_bytes():
                    status = UPDATE
                else:
                    status = OK
                items.append(Item(skill, src, dst, status))
            expected.setdefault(dst_dir, set()).update(names)
            if entry.managed:
                managed_dirs.add(dst_dir)
        for dst_dir in sorted(managed_dirs):
            if not dst_dir.is_dir():
                continue
            for child in sorted(dst_dir.iterdir()):
                if child.is_file() and not _is_ignored(child) and child.name not in expected[dst_dir]:
                    items.append(Item(skill, None, child, ORPHAN))

    for name in LEGAL_MIRRORS:
        src, dst = root / name, root / PLUGIN_REL / name
        src_bytes = _read(src)
        if src_bytes is None:
            items.append(Item("legal", src, dst, MISSING_SOURCE))
            continue
        dst_bytes = _read(dst)
        status = CREATE if dst_bytes is None else (OK if dst_bytes == src_bytes else UPDATE)
        items.append(Item("legal", src, dst, status))
    return items


def _write_atomic(dst: Path, data: bytes) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(prefix=f".{dst.name}.", suffix=".tmp", dir=dst.parent)
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(data)
        os.replace(tmp_name, dst)
    except BaseException:
        try:
            os.unlink(tmp_name)
        except FileNotFoundError:
            pass
        raise


def apply(items: list[Item], prune: bool) -> list[Item]:
    """Write every create/update, optionally delete orphans. Returns the items as they stand afterwards."""
    result: list[Item] = []
    for item in items:
        if item.status in (CREATE, UPDATE):
            assert item.src is not None
            _write_atomic(item.dst, item.src.read_bytes())
            result.append(Item(item.group, item.src, item.dst, item.status))
        elif item.status == ORPHAN and prune:
            item.dst.unlink()
            result.append(item)
        else:
            result.append(item)
    return result


def _rel(root: Path, path: Path) -> str:
    try:
        return path.relative_to(root).as_posix()
    except ValueError:
        return path.as_posix()


def _counts(items: list[Item]) -> dict[str, int]:
    counts = {OK: 0, CREATE: 0, UPDATE: 0, MISSING_SOURCE: 0, ORPHAN: 0, PENDING: 0}
    for item in items:
        counts[item.status] += 1
    return counts


def _report_text(root: Path, items: list[Item], check: bool, prune: bool, verbose: bool) -> str:
    verbs = {
        OK: "ok",
        CREATE: "missing" if check else "created",
        UPDATE: "differs" if check else "updated",
        MISSING_SOURCE: "source missing",
        ORPHAN: "orphan" if (check or not prune) else "removed",
        PENDING: "pending",
    }
    lines = []
    for item in items:
        if item.status in (OK, PENDING) and not verbose:
            continue
        lines.append(f"{verbs[item.status]:>14}  {item.group:<17} {_rel(root, item.dst)}")
    counts = _counts(items)
    total = len(items) - counts[ORPHAN] - counts[PENDING]
    summary = f"{total} shared files: {counts[OK]} in sync"
    for key in (CREATE, UPDATE, MISSING_SOURCE, ORPHAN):
        if counts[key]:
            summary += f", {counts[key]} {verbs[key]}"
    if counts[PENDING]:
        summary += f", {counts[PENDING]} pending (not shipped yet; --strict makes them errors, --verbose lists them)"
    if not check and counts[ORPHAN] and not prune:
        summary += " (use --prune to delete orphans)"
    lines.append(summary)
    return "\n".join(lines)


def _report_json(root: Path, items: list[Item], check: bool, ok: bool) -> str:
    return json.dumps(
        {
            "ok": ok,
            "mode": "check" if check else "sync",
            "counts": _counts(items),
            "items": [
                {
                    "group": i.group,
                    "status": i.status,
                    "source": _rel(root, i.src) if i.src else None,
                    "destination": _rel(root, i.dst),
                }
                for i in items
            ],
        },
        ensure_ascii=False,
        indent=2,
    )


def _find_root(explicit: str | None) -> Path | None:
    root = Path(explicit).resolve() if explicit else Path(__file__).resolve().parent.parent
    return root if (root / SKILLS_REL / SOURCE_SKILL).is_dir() else None


def _ensure_utf8_stdio() -> None:
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if reconfigure is not None:
            reconfigure(encoding="utf-8")


def _error(code: str, message: str) -> None:
    print(f"cs-error: {code}: {message}", file=sys.stderr)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="sync_shared.py",
        description="Copy shared schemas, rules and helpers from carousel-design into the skills that use them.",
    )
    parser.add_argument("--check", action="store_true", help="write nothing; exit 2 if any copy differs, is missing or is an orphan")
    parser.add_argument("--verbose", action="store_true", help="list files that are already in sync")
    parser.add_argument("--prune", action="store_true", help="delete orphans (files in a mirrored folder that the manifest does not produce)")
    parser.add_argument("--strict", action="store_true", help="treat a source that is not shipped yet (pending) as a missing source: exit 66")
    parser.add_argument("--format", choices=("text", "json"), default="text", help="output format (default: text)")
    parser.add_argument("--root", help="repository root (default: the folder above tools/)")
    return parser


def main(argv: list[str] | None = None) -> int:
    _ensure_utf8_stdio()
    try:
        args = build_parser().parse_args(argv)
    except SystemExit as exc:  # argparse exits 0 for --help and 2 for bad usage
        return EXIT_OK if exc.code == 0 else EXIT_USAGE
    if args.check and args.prune:
        _error("E_USAGE", "--prune cannot be combined with --check")
        return EXIT_USAGE

    root = _find_root(args.root)
    if root is None:
        _error("E_USAGE", f"{SKILLS_REL.as_posix()}/{SOURCE_SKILL} not found; pass --root with the repository root")
        return EXIT_NO_INPUT

    items = plan(root, strict=args.strict)
    counts = _counts(items)
    missing_source = counts[MISSING_SOURCE] > 0

    if args.check:
        drift = counts[CREATE] + counts[UPDATE] + counts[ORPHAN] > 0
        ok = not drift and not missing_source
        code = EXIT_NO_INPUT if missing_source else (EXIT_DRIFT if drift else EXIT_OK)
    else:
        try:
            items = apply(items, args.prune)
        except OSError as exc:
            _error("E_ABORTED", f"cannot write {exc.filename}: {exc.strerror}")
            return EXIT_CANT_WRITE
        ok = not missing_source
        code = EXIT_NO_INPUT if missing_source else EXIT_OK

    if args.format == "json":
        print(_report_json(root, items, args.check, ok))
    else:
        print(_report_text(root, items, args.check, args.prune, args.verbose))
    return code


if __name__ == "__main__":
    sys.exit(main())
