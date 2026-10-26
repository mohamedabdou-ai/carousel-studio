"""Locating the skill folder, its data and schemas, the user's workspace, and reading/writing files (CONTRACT 9.4).

Every synced copy of ``_cs`` finds its data relative to its own location, so a script never hard-codes which skill it runs in.
Writes are atomic (temporary file in the same folder, then ``os.replace``), UTF-8, LF, with a trailing newline for JSON.
"""
from __future__ import annotations

import json
import os
import sys
import tempfile
from pathlib import Path

from . import CSError


def skill_root() -> Path:
    """The skill folder that contains ``scripts/`` (``<skill>/scripts/_cs/paths.py`` -> ``<skill>``)."""
    return Path(__file__).resolve().parents[2]


def data_path(*parts: str) -> Path:
    """``<skill>/data/<parts>``."""
    return skill_root().joinpath("data", *parts)


def schema_path(name: str) -> Path:
    """Schema file for ``name`` (``spec`` or ``spec.schema.json``): ``data/schemas/`` in every skill, ``schemas/`` in carousel-design."""
    base = name if name.endswith(".schema.json") else f"{name}.schema.json"
    for candidate in (skill_root() / "schemas" / base, data_path("schemas", base)):
        if candidate.is_file():
            return candidate
    raise CSError("E_USAGE", f"schema '{name}' is not part of this skill (looked in schemas/ and data/schemas/)")


WORKSPACE_POINTER = ".carousel-studio-workspace"  # in the home folder: the brands folder chosen with --dir when a brand was created


def workspace_dir(env: dict | None = None) -> Path:
    """``$CS_WORKSPACE``, else ``$CLAUDE_PLUGIN_OPTION_WORKSPACE_DIR`` (the plugin option, when the host passes it), else the folder
    recorded in ``~/.carousel-studio-workspace`` when ``~/CarouselStudio`` does not exist, else ``~/CarouselStudio``.
    Claude Code does not put plugin options into the environment of shell commands, so skills pass the folder explicitly (``--dir``).
    The pointer lets a session started in any folder find the brands saved elsewhere, so the creator is never asked again."""
    source = os.environ if env is None else env
    value = source.get("CS_WORKSPACE") or source.get("CLAUDE_PLUGIN_OPTION_WORKSPACE_DIR")
    if value:
        return Path(value).expanduser()
    default = Path.home() / "CarouselStudio"
    if env is None and not default.is_dir():
        try:
            saved = Path((Path.home() / WORKSPACE_POINTER).read_text(encoding="utf-8").strip())
            if saved.is_absolute() and (saved / "brands").is_dir():
                return saved
        except (OSError, ValueError):
            pass
    return default


def remember_workspace(root) -> None:
    """Record ``root`` as the brands folder for sessions started elsewhere. Skipped for the default folder, a temporary folder
    (tests) and when ``$CS_WORKSPACE`` is set; never fails the command that called it."""
    try:
        root = Path(root).expanduser().resolve()
        temp = Path(tempfile.gettempdir()).resolve()
        if os.environ.get("CS_WORKSPACE") or root == (Path.home() / "CarouselStudio").resolve() or root.is_relative_to(temp):
            return
        (Path.home() / WORKSPACE_POINTER).write_text(str(root) + "\n", encoding="utf-8")
    except (OSError, ValueError):
        pass


def ensure_utf8_stdio() -> None:
    """Make stdin, stdout and stderr UTF-8 (Windows consoles and pipes default to a legacy code page such as cp1256) without
    crashing on odd characters. stdin matters as much as the output streams: piped Arabic text is otherwise decoded with the
    ANSI code page and silently turns into mojibake."""
    for stream in (sys.stdin, sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, ValueError):
            pass


def _no_duplicates(pairs):
    seen = {}
    for key, value in pairs:
        if key in seen:
            raise ValueError(f"duplicate key '{key}'")
        seen[key] = value
    return seen


def read_text(path) -> str:
    """UTF-8 text; a leading BOM is dropped. A missing file raises ``OSError``."""
    return Path(path).read_text(encoding="utf-8-sig")


def read_json(path, *, strict_keys: bool = False):
    """Parse a JSON file. A missing file raises ``OSError`` and malformed JSON ``ValueError`` (``json.JSONDecodeError``), which is
    what the scripts catch. ``strict_keys`` also rejects duplicate object keys (the shipped data files must not have any)."""
    return json.loads(read_text(path), object_pairs_hook=_no_duplicates if strict_keys else None)


def write_text(path, text: str) -> None:
    """Atomic UTF-8 write with LF newlines."""
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    data = text.replace("\r\n", "\n").encode("utf-8")
    fd, tmp = tempfile.mkstemp(dir=str(target.parent), prefix=target.name + ".", suffix=".tmp")
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(data)
        os.replace(tmp, target)
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def write_json(path, obj, *, indent: int = 2, sort_keys: bool = False) -> None:
    """Atomic JSON write: ``ensure_ascii=False``, LF, trailing newline."""
    write_text(path, json.dumps(obj, ensure_ascii=False, indent=indent, sort_keys=sort_keys) + "\n")
