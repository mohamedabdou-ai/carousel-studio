#!/usr/bin/env python3
"""Build the creative team's files from their single source, team/ (charter and nine role briefs).

The team (team/charter.md and team/roles/<agent>.md) has one home. This tool writes the two places the plugin needs it:

  plugins/carousel-studio/agents/<agent>.md
        one subagent per role, for Cowork and Claude Code: frontmatter (name, description, tools, model), a "generated" header, the role
        brief, the rules every agent follows and the handoff card, all taken from the sources;
  plugins/carousel-studio/skills/carousel-create/references/team/{charter.md,<agent>.md}
        the same words as plain reference files, so the Claude app, which does not load plugin agents, runs the same rounds as explicit
        role passes. A skill may read nothing outside its own folder, so these are copies, not links.

With --check nothing is written and the tool exits 2 when a generated file differs from what the sources produce, is missing, or is an
orphan, so CI catches an edit made in the wrong place. With --prune the orphans (generated names that no role file produces, such as the
two agents of the first version) are deleted.

Usage:
    python tools/sync_team.py [--check] [--prune] [--verbose] [--format text|json] [--root REPO_ROOT]

Exit codes (CONTRACT 0.4):
    0   everything is in sync (or was synced)
    2   --check found drift
    64  usage error
    65  a role file is malformed
    66  a source file is missing, or the repository root cannot be found
    73  a file could not be written

Python 3.11, standard library only. UTF-8 everywhere; files are written with LF newlines.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path

EXIT_OK, EXIT_DRIFT, EXIT_USAGE, EXIT_DATA, EXIT_NO_INPUT, EXIT_CANT_WRITE = 0, 2, 64, 65, 66, 73

PLUGIN_REL = Path("plugins/carousel-studio")
AGENTS_REL = PLUGIN_REL / "agents"
REFS_REL = PLUGIN_REL / "skills" / "carousel-create" / "references" / "team"
TEAM_REL = Path("team")

REQUIRED_KEYS = ("agent", "title-ar", "title-en", "model", "tools", "description")
MODELS = ("inherit", "sonnet", "opus", "haiku")
EFFORTS = ("low", "medium", "high", "xhigh", "max")
SLUG = re.compile(r"^cs-[a-z]+(?:-[a-z]+)*$")
FRONTMATTER = re.compile(r"\A---\n(.*?)\n---\n(.*)\Z", re.S)

AGENT_HEADER = "<!-- Generated from team sources; edit in the development repository, not this installed file. -->"
REF_HEADER = "<!-- Generated team reference; edit in the development repository. -->"

OK, CREATE, UPDATE, ORPHAN, MISSING_SOURCE = "ok", "create", "update", "orphan", "missing-source"


class RoleError(Exception):
    pass


@dataclass(frozen=True)
class Role:
    agent: str
    title_ar: str
    title_en: str
    model: str
    tools: str
    description: str
    body: str
    effort: str = ""      # optional frontmatter `effort`: overrides the session's reasoning effort for this agent
    max_turns: int = 0    # optional frontmatter `max-turns`: the host stops the agent after this many turns (0 = no cap)


@dataclass(frozen=True)
class Item:
    kind: str  # "agent" | "reference"
    dst: Path
    text: str | None  # None for orphans
    status: str


def parse_role(path: Path) -> Role:
    raw = path.read_text(encoding="utf-8").replace("\r\n", "\n")
    m = FRONTMATTER.match(raw)
    if not m:
        raise RoleError(f"{path.name}: no frontmatter block between --- lines")
    meta: dict[str, str] = {}
    for line in m.group(1).split("\n"):
        if not line.strip():
            continue
        if ":" not in line:
            raise RoleError(f"{path.name}: frontmatter line without a colon: {line!r}")
        key, value = line.split(":", 1)
        meta[key.strip()] = value.strip()
    missing = [k for k in REQUIRED_KEYS if not meta.get(k)]
    if missing:
        raise RoleError(f"{path.name}: missing frontmatter {', '.join(missing)}")
    if not SLUG.match(meta["agent"]) or meta["agent"] != path.stem:
        raise RoleError(f"{path.name}: agent {meta['agent']!r} must be cs-<role> and equal the file name")
    if meta["model"] not in MODELS:
        raise RoleError(f"{path.name}: model {meta['model']!r} is not one of {', '.join(MODELS)}")
    if meta.get("effort") and meta["effort"] not in EFFORTS:
        raise RoleError(f"{path.name}: effort {meta['effort']!r} is not one of {', '.join(EFFORTS)}")
    if meta.get("max-turns") and not (meta["max-turns"].isdigit() and 1 <= int(meta["max-turns"]) <= 200):
        raise RoleError(f"{path.name}: max-turns must be a whole number from 1 to 200")
    body = m.group(2).strip("\n") + "\n"
    if not body.lstrip().startswith("# "):
        raise RoleError(f"{path.name}: the body must start with a # heading")
    return Role(meta["agent"], meta["title-ar"], meta["title-en"], meta["model"], meta["tools"], meta["description"], body,
                meta.get("effort", ""), int(meta.get("max-turns") or 0))


def between(text: str, start: str, end: str, what: str) -> str:
    a, b = text.find(start), text.find(end)
    if a < 0 or b < 0 or b < a:
        raise RoleError(f"team/charter.md: the {what} block ({start} ... {end}) is missing")
    return text[a + len(start):b].strip("\n")


def build_agent(role: Role, common_rules: str, handoff: str) -> str:
    front = "\n".join([
        "---",
        f"name: {role.agent}",
        f"description: {json.dumps(role.description, ensure_ascii=False)}",
        f"tools: {role.tools}",
        f"model: {role.model}",
    ] + ([f"effort: {role.effort}"] if role.effort else []) + ([f"maxTurns: {role.max_turns}"] if role.max_turns else []) + ["---"])
    if role.agent == "cs-creative-director":
        intro = (
            f"You are the **{role.title_en} ({role.title_ar})**, the showrunner of the Carousel Studio creative team, called as the fresh-context reviewer "
            "so that the person who wrote the work does not grade it. "
            "Do exactly what your brief below says and give back the output it describes. "
            "The creator owns the post and decides at the three checkpoints; the Arabic editor's veto and the QA producer's technical block are final."
        )
    else:
        intro = (
            f"You are the **{role.title_en} ({role.title_ar})** of the Carousel Studio creative team, led by the Creative Director. "
            "Do exactly what your brief below says, in a fresh context, and give back the output it describes. "
            "The creator owns the post; the director owns the decisions; the Arabic editor's veto and the QA producer's technical block are final."
        )
    parts = [
        front,
        AGENT_HEADER.format(agent=role.agent),
        "",
        intro,
        "",
        role.body.strip("\n"),
        "",
        "## Rules for every agent",
        common_rules,
        "",
        "## Your handoff card",
        "Finish with this card, filled in, in Arabic (the creator's words in the creator's dialect):",
        handoff,
    ]
    return "\n".join(parts).rstrip("\n") + "\n"


def build_reference(role: Role) -> str:
    return REF_HEADER.format(source=f"roles/{role.agent}.md") + "\n\n" + role.body.strip("\n") + "\n"


def build_charter_reference(charter: str) -> str:
    return REF_HEADER.format(source="charter.md") + "\n\n" + charter.strip("\n") + "\n"


def _read(path: Path) -> str | None:
    try:
        return path.read_text(encoding="utf-8")
    except FileNotFoundError:
        return None


def plan(root: Path) -> list[Item]:
    charter_path = root / TEAM_REL / "charter.md"
    roles_dir = root / TEAM_REL / "roles"
    charter = charter_path.read_text(encoding="utf-8").replace("\r\n", "\n")
    common = between(charter, "<!-- common-rules:start -->", "<!-- common-rules:end -->", "common rules")
    handoff = between(charter, "<!-- handoff:start -->", "<!-- handoff:end -->", "handoff card")
    roles = [parse_role(p) for p in sorted(roles_dir.glob("cs-*.md"))]
    if not roles:
        raise RoleError("team/roles/ holds no cs-*.md role file")
    wanted: list[tuple[str, Path, str]] = []
    for role in roles:
        wanted.append(("agent", root / AGENTS_REL / f"{role.agent}.md", build_agent(role, common, handoff)))
        wanted.append(("reference", root / REFS_REL / f"{role.agent}.md", build_reference(role)))
    wanted.append(("reference", root / REFS_REL / "charter.md", build_charter_reference(charter)))
    items: list[Item] = []
    for kind, dst, text in wanted:
        current = _read(dst)
        status = CREATE if current is None else (OK if current == text else UPDATE)
        items.append(Item(kind, dst, text, status))
    known = {dst for _, dst, _ in wanted}
    for directory, pattern in ((root / AGENTS_REL, "*.md"), (root / REFS_REL, "*.md")):
        if directory.is_dir():
            for child in sorted(directory.glob(pattern)):
                if child not in known:
                    items.append(Item("agent" if directory.name == "agents" else "reference", child, None, ORPHAN))
    return items


def write_atomic(dst: Path, text: str) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix=f".{dst.name}.", suffix=".tmp", dir=dst.parent)
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(text.encode("utf-8"))
        os.replace(tmp, dst)
    except BaseException:
        try:
            os.unlink(tmp)
        except FileNotFoundError:
            pass
        raise


def rel(root: Path, path: Path) -> str:
    try:
        return path.relative_to(root).as_posix()
    except ValueError:
        return path.as_posix()


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="sync_team.py", description="Build the agents and the skill's team references from team/.")
    parser.add_argument("--check", action="store_true", help="write nothing; exit 2 on drift")
    parser.add_argument("--prune", action="store_true", help="delete orphans (generated names that no role file produces)")
    parser.add_argument("--verbose", action="store_true", help="list files that are already in sync")
    parser.add_argument("--format", choices=("text", "json"), default="text")
    parser.add_argument("--root", help="repository root (default: the folder above tools/)")
    return parser


def main(argv: list[str] | None = None) -> int:
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if reconfigure is not None:
            reconfigure(encoding="utf-8")
    try:
        args = build_parser().parse_args(argv)
    except SystemExit as exc:
        return EXIT_OK if exc.code == 0 else EXIT_USAGE
    if args.check and args.prune:
        print("cs-error: E_USAGE: --prune cannot be combined with --check", file=sys.stderr)
        return EXIT_USAGE
    root = Path(args.root).resolve() if args.root else Path(__file__).resolve().parent.parent
    if not (root / TEAM_REL / "charter.md").is_file():
        print(f"cs-error: E_USAGE: {TEAM_REL.as_posix()}/charter.md not found; pass --root with the repository root", file=sys.stderr)
        return EXIT_NO_INPUT
    try:
        items = plan(root)
    except RoleError as exc:
        print(f"cs-error: E_SCHEMA: {exc}", file=sys.stderr)
        return EXIT_DATA
    drift = any(i.status in (CREATE, UPDATE, ORPHAN) for i in items)
    if not args.check:
        try:
            for item in items:
                if item.status in (CREATE, UPDATE):
                    assert item.text is not None
                    write_atomic(item.dst, item.text)
                elif item.status == ORPHAN and args.prune:
                    item.dst.unlink()
        except OSError as exc:
            print(f"cs-error: E_ABORTED: cannot write {exc.filename}: {exc.strerror}", file=sys.stderr)
            return EXIT_CANT_WRITE
    counts = {s: sum(1 for i in items if i.status == s) for s in (OK, CREATE, UPDATE, ORPHAN)}
    if args.format == "json":
        print(json.dumps({"ok": not (args.check and drift), "mode": "check" if args.check else "sync", "counts": counts,
                          "items": [{"kind": i.kind, "status": i.status, "path": rel(root, i.dst)} for i in items]}, ensure_ascii=False, indent=2))
    else:
        verbs = {OK: "ok", CREATE: "missing" if args.check else "created", UPDATE: "differs" if args.check else "updated",
                 ORPHAN: "orphan" if (args.check or not args.prune) else "removed"}
        for item in items:
            if item.status == OK and not args.verbose:
                continue
            print(f"{verbs[item.status]:>9}  {item.kind:<9} {rel(root, item.dst)}")
        total = len(items) - counts[ORPHAN]
        summary = f"{total} team files: {counts[OK]} in sync"
        for key in (CREATE, UPDATE, ORPHAN):
            if counts[key]:
                summary += f", {counts[key]} {verbs[key]}"
        if counts[ORPHAN] and not args.prune and not args.check:
            summary += " (use --prune to delete orphans)"
        print(summary)
    return EXIT_DRIFT if (args.check and drift) else EXIT_OK


if __name__ == "__main__":
    sys.exit(main())
