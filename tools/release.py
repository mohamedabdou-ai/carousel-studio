#!/usr/bin/env python3
"""Build a release of the Carousel Studio plugin: run the checks, then zip `plugins/carousel-studio` with a SHA-256 file.

The archive is reproducible: entries are sorted, timestamps are fixed, permissions are normalised and nothing machine-specific
(caches, bytecode, editor files) goes in, so the same tree always gives the same hash. The version you pass must already be the
version written in the manifests, the runtime and the changelog, the plugin's listing fields (documentation, support and privacy URLs, icon)
must agree with tools/identity.json, and the tree must match v1-manifest.json (skills, commands, agents, presets); the tool refuses to
release a tree that disagrees with itself.

Usage:
    python tools/release.py --version X.Y.Z [--out DIR] [--checks LIST|none] [--format text|json] [--root REPO_ROOT]

    --version  the release, for example 1.0.0 (a pre-release such as 1.1.0-rc.1 is accepted)
    --out      where the zip and its .sha256 are written (default: release/ in the repository, which git ignores)
    --checks   comma-separated checks to run first: sync (tools/sync_shared.py --check), team (tools/sync_team.py --check),
               build (node tools/build.mjs --check), directory (tools/check_directory.py on the plugin folder). Default: all four. "none" skips them (the version checks still run)
    --root     the repository root (default: the folder above tools/)

Writes carousel-studio-<version>.zip (one top-level folder, carousel-studio/) and carousel-studio-<version>.zip.sha256
("<hash>  <file name>", the format `sha256sum -c` reads).

Exit codes (CONTRACT 0.4): 0 released, 2 a check or a version disagreement failed, 64 usage error, 66 the plugin folder is missing,
73 the output could not be written.

Python 3.11, standard library only.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import sys
import zipfile
from pathlib import Path

EXIT_OK, EXIT_FAIL, EXIT_USAGE, EXIT_NO_INPUT, EXIT_CANT_WRITE = 0, 2, 64, 66, 73
PLUGIN_DIR = Path("plugins") / "carousel-studio"
ARCHIVE_ROOT = "carousel-studio"
SEMVER = re.compile(r"^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-[0-9A-Za-z.-]+)?$")
FIXED_TIME = (1980, 1, 1, 0, 0, 0)
EXCLUDED_DIRS = {"__pycache__", ".git", "node_modules", ".pytest_cache", ".mypy_cache", ".ruff_cache", ".venv", "venv"}
EXCLUDED_NAMES = {".DS_Store", "Thumbs.db", "desktop.ini"}
EXCLUDED_SUFFIXES = (".pyc", ".pyo", ".swp", ".log", ".local.json")
ALL_CHECKS = ("sync", "team", "build", "directory")


class _Parser(argparse.ArgumentParser):
    def error(self, message):
        sys.stderr.write("cs-error: E_USAGE: %s\n" % message)
        sys.exit(EXIT_USAGE)


def build_parser() -> argparse.ArgumentParser:
    p = _Parser(prog="release.py", description="Run the checks and zip the Carousel Studio plugin with a SHA-256 file.")
    p.add_argument("--version", required=True, help="the release version, X.Y.Z")
    p.add_argument("--out", help="output folder (default: release/ in the repository)")
    p.add_argument("--checks", default=",".join(ALL_CHECKS), help="checks to run first: sync,build,directory or none (default: all)")
    p.add_argument("--format", choices=("text", "json"), default="text", help="output format (default: text)")
    p.add_argument("--root", help="repository root (default: the folder above tools/)")
    return p


# --------------------------------------------------------------------------
# version agreement
# --------------------------------------------------------------------------


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def version_sources(root: Path, version: str) -> list[tuple[str, str | None, str]]:
    """[(where, found, expected)] for every place that carries the version."""
    out: list[tuple[str, str | None, str]] = []

    def add(where: str, getter, expected: str = version) -> None:
        try:
            found = getter()
        except (OSError, ValueError, KeyError, IndexError, AttributeError):
            found = None
        out.append((where, found, expected))

    plugin_json = root / PLUGIN_DIR / ".claude-plugin" / "plugin.json"
    add("plugins/carousel-studio/.claude-plugin/plugin.json", lambda: read_json(plugin_json)["version"])
    market = root / ".claude-plugin" / "marketplace.json"
    add(".claude-plugin/marketplace.json (metadata)", lambda: read_json(market)["metadata"]["version"])
    add(".claude-plugin/marketplace.json (plugin entry)", lambda: read_json(market)["plugins"][0]["version"])
    add("package.json", lambda: read_json(root / "package.json")["version"])
    lockfile = root / "package-lock.json"
    add("package-lock.json (root)", lambda: read_json(lockfile)["version"])
    add("package-lock.json (package)", lambda: read_json(lockfile)["packages"][""]["version"])
    add("v1-manifest.json", lambda: read_json(root / "v1-manifest.json")["version"])

    checked: set[str] = set()

    def declaration(relative: str, pattern: str, expected: str) -> None:
        """Required declarations fail closed, including a missing file or a removed declaration."""
        checked.add(relative)
        field = " __version__" if "__version__" in pattern else " CS.version" if "CS\\.version" in pattern else ""
        add(relative + field, lambda: re.search(pattern, read_text(root / relative)).group(1), expected)

    scripts = PLUGIN_DIR.as_posix() + "/skills/carousel-design/scripts/"
    declaration(scripts + "_cs/__init__.py", r'__version__\s*=\s*[\'"]([^\'"]+)', version)
    for path in sorted((root / PLUGIN_DIR / "skills").glob("*/scripts/_cs/__init__.py")):
        relative = path.relative_to(root).as_posix()
        if relative not in checked:
            declaration(relative, r'__version__\s*=\s*[\'"]([^\'"]+)', version)

    engine = "cs-" + version
    declaration("docs/CONTRACT.md", r'Plugin version\s*`([^`]+)`', version)
    for relative, pattern in (
        ("tools/build.mjs", r'\bENGINE\s*=\s*[\'"]([^\'"]+)'),
        ("src/lib/root.js", r'CS\.version\s*=\s*[\'"]([^\'"]+)'),
        ("src/qa/core.js", r'\bENGINE\s*:\s*[\'"]([^\'"]+)'),
        (scripts + "_cs/report.py", r'\bENGINE\s*=\s*[\'"]([^\'"]+)'),
        (scripts + "build_studio.py", r'\bENGINE\s*=\s*[\'"]([^\'"]+)'),
    ):
        declaration(relative, pattern, engine)

    # Include every live engine literal: UI fallbacks, template comments, generated chunk headers,
    # shared Python mirrors and the public contract/example. Historical test fixtures and baselines
    # describe their recorded engine, not this release, so they are deliberately outside this scan.
    engine_literal = re.compile(r'\bcs-[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?')
    python_version = re.compile(r'__version__\s*=\s*[\'"]([^\'"]+)')
    candidates = {root / "docs/CONTRACT.md", root / "docs/examples/qa-report.example.json"}
    for folder in (root / "src", root / "tools", root / PLUGIN_DIR):
        candidates.update(path for path in folder.rglob("*") if path.is_file()
                          and path.suffix in {".js", ".mjs", ".py", ".html", ".css", ".json"}
                          and not set(path.relative_to(folder).parts) & EXCLUDED_DIRS)
    for path in sorted(candidates):
        try:
            contents = read_text(path)
        except OSError:
            add(path.relative_to(root).as_posix(), lambda: None, engine)
            continue
        for i, found in enumerate(engine_literal.findall(contents), 1):
            add("%s (engine %d)" % (path.relative_to(root).as_posix(), i), lambda value=found: value, engine)
        for i, found in enumerate(python_version.findall(contents), 1):
            add("%s (__version__ %d)" % (path.relative_to(root).as_posix(), i), lambda value=found: value, version)

    # Engine stubs are live test dependencies too; they must follow the package, unlike saved fixtures.
    for relative in ("tests/video/harness/stub-core.js", "tests/unit/js/core/lib-stub.js", "tests/unit/js/ui/stub-engine.js"):
        declaration(relative, r'CS\.version\s*=\s*[\'"]([^\'"]+)', engine)

    def changelog_entry() -> str | None:
        text = read_text(root / "CHANGELOG.md")
        return version if re.search(r"(?m)^## \[%s\]" % re.escape(version), text) else None

    add("CHANGELOG.md entry", changelog_entry)
    return out


def check_versions(root: Path, version: str) -> list[str]:
    problems = []
    for where, found, expected in version_sources(root, version):
        if found != expected:
            problems.append("%s: expected %s, found %s" % (where, expected, found if found is not None else "nothing"))
    problems += check_listing(root)
    problems += check_manifest(root, version)
    return problems


def check_listing(root: Path) -> list[str]:
    """The fields the directory reads for the listing agree with tools/identity.json, and the icon exists."""
    problems = []
    try:
        identity = read_json(root / "tools" / "identity.json")
        plugin_json = read_json(root / PLUGIN_DIR / ".claude-plugin" / "plugin.json")
    except (OSError, ValueError) as exc:
        return ["listing: cannot read identity.json or plugin.json (%s)" % exc]
    expected = {"documentationUrl": identity.get("documentationUrl"), "supportUrl": identity.get("supportUrl"),
                "privacyPolicyUrl": identity.get("privacyUrl"), "homepage": identity.get("homepage"), "repository": identity.get("repoUrl")}
    for key, want in expected.items():
        if want and plugin_json.get(key) != want:
            problems.append("plugin.json %s: expected %s, found %s" % (key, want, plugin_json.get(key) or "nothing"))
    icon = plugin_json.get("icon")
    if not icon:
        problems.append("plugin.json icon: not set")
    elif not (root / PLUGIN_DIR / icon).is_file():
        problems.append("plugin.json icon: %s does not exist" % icon)
    return problems


def check_manifest(root: Path, version: str) -> list[str]:
    """v1-manifest.json lists what ships; the tree must match it, and nothing deferred may be half-shipped."""
    path = root / "v1-manifest.json"
    try:
        manifest = read_json(path)
    except (OSError, ValueError) as exc:
        return ["v1-manifest.json: cannot read (%s)" % exc]
    problems = []
    if manifest.get("version") != version:
        problems.append("v1-manifest.json version: expected %s, found %s" % (version, manifest.get("version")))
    plugin = root / PLUGIN_DIR

    def names(directory: Path, suffix: str = "", folders: bool = False) -> list[str]:
        if not directory.is_dir():
            return []
        if folders:
            return sorted(d.name for d in directory.iterdir() if d.is_dir())
        return sorted(f.stem for f in directory.iterdir() if f.is_file() and f.suffix == suffix)

    on_disk = {
        "skills": names(plugin / "skills", folders=True),
        "commands": names(plugin / "commands", ".md"),
        "agents": names(plugin / "agents", ".md"),
        "presets": names(plugin / "skills" / "carousel-design" / "styles", folders=True),
    }
    for key, found in on_disk.items():
        listed = sorted(manifest.get(key) or [])
        if listed != found:
            missing, extra = sorted(set(listed) - set(found)), sorted(set(found) - set(listed))
            problems.append("v1-manifest.json %s differ from the tree: %s%s" % (
                key, ("missing on disk: " + ", ".join(missing) + "; ") if missing else "", ("not in the manifest: " + ", ".join(extra)) if extra else ""))
    # a deferred preset must not exist in the tree (not solid means deferred, not shipped broken)
    for item in manifest.get("deferred") or []:
        if item.get("id", "").startswith("preset-") and item["id"][len("preset-"):] in on_disk["presets"]:
            problems.append("v1-manifest.json defers %s but the tree ships it" % item["id"])
    return problems


# --------------------------------------------------------------------------
# checks
# --------------------------------------------------------------------------


def run_check(name: str, root: Path) -> tuple[bool, str]:
    if name == "sync":
        cmd = [sys.executable, str(root / "tools" / "sync_shared.py"), "--check", "--root", str(root)]
    elif name == "directory":
        cmd = [sys.executable, str(root / "tools" / "check_directory.py"), "--root", str(root / PLUGIN_DIR), "--scope", "plugin"]
    elif name == "team":
        cmd = [sys.executable, str(root / "tools" / "sync_team.py"), "--check", "--root", str(root)]
    elif name == "build":
        cmd = ["node", str(root / "tools" / "build.mjs"), "--check"]
    else:  # pragma: no cover - the caller validates names
        raise ValueError(name)
    try:
        res = subprocess.run(cmd, cwd=str(root), capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=600)
    except FileNotFoundError:
        return False, "%s is not installed" % cmd[0]
    except subprocess.TimeoutExpired:
        return False, "timed out after 600 s"
    tail = (res.stdout.strip() + "\n" + res.stderr.strip()).strip().splitlines()[-6:]
    return res.returncode == 0, "\n".join(tail)


# --------------------------------------------------------------------------
# the archive
# --------------------------------------------------------------------------


def included_files(plugin: Path) -> list[Path]:
    files = []
    for path in plugin.rglob("*"):
        if not path.is_file() or path.is_symlink():
            continue
        rel = path.relative_to(plugin)
        if any(part in EXCLUDED_DIRS for part in rel.parts) or path.name in EXCLUDED_NAMES or path.name.endswith(EXCLUDED_SUFFIXES):
            continue
        files.append(path)
    files.sort(key=lambda p: p.relative_to(plugin).as_posix())
    return files


def is_executable_script(data: bytes) -> bool:
    return data.startswith(b"#!")


def write_archive(plugin: Path, files: list[Path], target: Path) -> None:
    tmp = target.with_name(target.name + ".part")
    with zipfile.ZipFile(tmp, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        for path in files:
            data = path.read_bytes()
            name = ARCHIVE_ROOT + "/" + path.relative_to(plugin).as_posix()
            info = zipfile.ZipInfo(name, date_time=FIXED_TIME)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.create_system = 3
            info.external_attr = (0o755 if is_executable_script(data) else 0o644) << 16
            zf.writestr(info, data, compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
    tmp.replace(target)


def sha256_of(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


# --------------------------------------------------------------------------
# main
# --------------------------------------------------------------------------


def main(argv=None) -> int:
    args = build_parser().parse_args(argv)
    if not SEMVER.match(args.version):
        sys.stderr.write("cs-error: E_USAGE: --version must look like 1.2.3 (got %r)\n" % args.version)
        return EXIT_USAGE
    names = [] if args.checks.strip().lower() == "none" else [c.strip() for c in args.checks.split(",") if c.strip()]
    unknown = [c for c in names if c not in ALL_CHECKS]
    if unknown:
        sys.stderr.write("cs-error: E_USAGE: unknown check %s (choose from %s or none)\n" % (", ".join(unknown), ", ".join(ALL_CHECKS)))
        return EXIT_USAGE
    root = Path(args.root).resolve() if args.root else Path(__file__).resolve().parent.parent
    plugin = root / PLUGIN_DIR
    if not plugin.is_dir():
        sys.stderr.write("cs-error: E_USAGE: plugin folder not found: %s\n" % plugin)
        return EXIT_NO_INPUT
    out_dir = Path(args.out).resolve() if args.out else root / "release"

    report: dict = {"version": args.version, "checks": {}, "versionProblems": [], "ok": False}
    problems = check_versions(root, args.version)
    report["versionProblems"] = problems
    failed = bool(problems)
    for name in names:
        ok, tail = run_check(name, root)
        report["checks"][name] = {"ok": ok, "output": tail}
        failed = failed or not ok

    if failed:
        emit(report, args.format)
        return EXIT_FAIL

    files = included_files(plugin)
    zip_name = "carousel-studio-%s.zip" % args.version
    try:
        out_dir.mkdir(parents=True, exist_ok=True)
        target = out_dir / zip_name
        write_archive(plugin, files, target)
        digest = sha256_of(target)
        (out_dir / (zip_name + ".sha256")).write_text("%s  %s\n" % (digest, zip_name), encoding="utf-8", newline="\n")
    except OSError as exc:
        sys.stderr.write("cs-error: E_IO: cannot write the release: %s\n" % exc)
        return EXIT_CANT_WRITE
    report.update({"ok": True, "zip": str(target), "sha256": digest, "files": len(files), "bytes": target.stat().st_size,
                   "sha256File": str(out_dir / (zip_name + ".sha256"))})
    emit(report, args.format)
    return EXIT_OK


def emit(report: dict, fmt: str) -> None:
    if fmt == "json":
        sys.stdout.write(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
        return
    lines = ["Carousel Studio release %s" % report["version"]]
    for problem in report["versionProblems"]:
        lines.append("  version  FAIL  %s" % problem)
    if not report["versionProblems"]:
        lines.append("  version  ok    every manifest, the runtime, the changelog, the listing and v1-manifest.json agree")
    for name, res in report["checks"].items():
        lines.append("  %-8s %s" % (name, "ok" if res["ok"] else "FAIL"))
        if not res["ok"]:
            lines.extend("      " + ln for ln in res["output"].splitlines())
    if report["ok"]:
        lines.append("  wrote    %s (%d files, %d bytes)" % (report["zip"], report["files"], report["bytes"]))
        lines.append("  sha256   %s" % report["sha256"])
    else:
        lines.append("Release stopped: nothing was written.")
    sys.stdout.write("\n".join(lines) + "\n")


if __name__ == "__main__":
    sys.exit(main())
