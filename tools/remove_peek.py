#!/usr/bin/env python3
"""Delete the edge "peek" rectangles from every hand-edited source, once (round 3, spec 6.7, audit 13d 2.2).

Until 1.1 the neutral swipe cue (mixed audiences only) was the counter plus two empty cards drawn on the slide edges. They carried nothing
from the neighbouring slide, so they read as a rendering fault. The cue's content is now the counter (and, in 1.1, a quiet progress rail
that compose builds). This tool removes the cards from the sources that mention them: the compose code, the base layout rules, the six
decor sheets, the lint vocabulary, the schemas and data descriptions, the references, the contract, the team brief and the tests that
expected them.

It edits only hand-written files. Generated outputs (the runtime chunks and the examples/ folder) are rebuilt by tools/build.mjs and the
example maker, and CHANGELOG.md keeps its history.

Idempotent: a second run changes nothing. With --check nothing is written; the tool exits 2 when a file still needs the edit or when an
unlisted file still mentions the peek, and prints every such file.

Usage:
    python tools/remove_peek.py [--check] [--format text|json] [--root REPO_ROOT]

Exit codes (CONTRACT 0.4): 0 done (or clean with --check) · 2 --check found work to do, or a file still mentions the peek · 64 usage ·
66 a listed file is missing · 70 internal (an edit did not apply) · 73 a file could not be written.

Python 3.11, standard library only.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import tempfile
from pathlib import Path
from typing import Callable

EXIT_OK, EXIT_DRIFT, EXIT_USAGE, EXIT_NO_INPUT, EXIT_INTERNAL, EXIT_CANT_WRITE = 0, 2, 64, 66, 70, 73

SK = "plugins/carousel-studio/skills/carousel-design"
SC = "plugins/carousel-studio/skills/carousel-create"
PL = "plugins/carousel-studio"
PRESETS = ("swiss", "creator", "notebook", "poster", "interface", "heritage")

# What counts as "the peek is still mentioned". Built from pieces so that this file does not match itself.
_T = ["cs", "-peek"]
LEFTOVER = re.compile("|".join(["".join(_T), "data" + "-edge", "data-m=.peek.", "edge " + "peek", "edge-" + "peek"]), re.I)
LEFTOVER_SKIP_DIRS = {"node_modules", ".git", ".team", "private", ".impeccable", "examples", "runtime", "__pycache__", ".pytest_cache", ".ruff_cache", "research", "release", "output"}
LEFTOVER_SKIP_FILES = {"CHANGELOG.md", "remove_peek.py", "test_sweeps.py"}
LEFTOVER_SUFFIXES = {".js", ".mjs", ".cjs", ".py", ".json", ".md", ".html", ".css", ".txt", ".yml", ".yaml"}


class EditError(Exception):
    """An edit that neither applies nor is already applied."""


# ---------------------------------------------------------------------------------------------------------------------------------
# edit helpers: each returns a function text -> text
# ---------------------------------------------------------------------------------------------------------------------------------


def sub(old: str, new: str) -> Callable[[str], str]:
    """Replace one exact string. Already applied (the new text is there, the old one is not) is fine; neither present is an error."""

    def run(text: str) -> str:
        if old in text:
            if text.count(old) != 1:
                raise EditError("expected one occurrence of %r, found %d" % (old[:60], text.count(old)))
            return text.replace(old, new)
        if new and new in text:
            return text
        if not new:
            return text  # removing something that is gone
        raise EditError("neither the old nor the new text found: %r" % old[:80])

    return run


def css_drop_rules(selector_part: str, comment_hint: str) -> Callable[[str], str]:
    """Remove every top-level CSS rule whose selector contains `selector_part`, plus a directly preceding comment that holds `comment_hint`."""

    def blocks(css: str) -> list[tuple[int, int, str]]:
        out, i, n, depth, start, sel_start = [], 0, len(css), 0, None, 0
        while i < n:
            c = css[i]
            if c in "\"'":
                q = c
                i += 1
                while i < n and css[i] != q:
                    i += 2 if css[i] == "\\" else 1
            elif c == "/" and css[i + 1:i + 2] == "*":
                j = css.find("*/", i + 2)
                i = n if j < 0 else j + 1
                if depth == 0:
                    sel_start = i + 1
            elif c == "{":
                if depth == 0:
                    start = sel_start
                    while start < i and css[start] in " \t\r\n":
                        start += 1
                    sel = css[start:i]
                depth += 1
            elif c == "}":
                depth -= 1
                if depth == 0 and start is not None:
                    out.append((start, i + 1, sel.strip()))
                    sel_start = i + 1
                    start = None
            i += 1
        return out

    def run(css: str) -> str:
        spans = [(a, b) for a, b, sel in blocks(css) if selector_part in sel]
        if not spans:
            return css
        # take a comment that sits directly before a removed rule
        widened = []
        for a, b in spans:
            head = css[:a].rstrip()
            if head.endswith("*/"):
                k = head.rfind("/*")
                if k >= 0 and comment_hint in head[k:]:
                    a = k
            widened.append((a, b))
        for a, b in reversed(widened):
            end = b
            while end < len(css) and css[end] in " \t":
                end += 1
            if css[end:end + 1] == "\n":
                end += 1
            css = css[:a] + css[end:]
            # keep exactly one blank line between the neighbours
            while css[a - 2:a] == "\n\n" and css[a:a + 1] == "\n":
                css = css[:a] + css[a + 1:]
        return css

    return run


# ---------------------------------------------------------------------------------------------------------------------------------
# the edit table: path -> steps
# ---------------------------------------------------------------------------------------------------------------------------------

NEUTRAL_OLD_SCHEMA = "neutral = counter + edge peek, no arrow."
NEUTRAL_NEW_SCHEMA = "neutral = the counter and a quiet progress rail, no arrow."
NEUTRAL_OLD_LOCALE = "Mixed audience: no arrow; counter plus an edge peek of the next slide."
NEUTRAL_NEW_LOCALE = "Mixed audience: no arrow; the counter plus a quiet progress rail."
PANEL_OLD = "English: counter and edge peek)"
PANEL_NEW = "English: «Swipe →»; mixed uses the counter without arrows)"

COMPOSE_BLOCK = (
    '    if (cx.swipe === "neutral" && cx.total > 1 && cx.index < cx.total - 1) {\n'
    '      ["start", "end"].forEach(function (edge) { decor.appendChild(set(el("span", "cs-peek"), { "data-m": "peek", "data-edge": edge })); });\n'
    "    }\n\n"
)
ARCHETYPE_BLOCK = (
    '.cs-slide .cs-peek{ position:absolute; inset-block-start:50%; transform:translateY(-50%); inline-size:calc(var(--cs-unit) * 2.5); block-size:calc(var(--cs-unit) * 45); background:var(--cs-line); }\n'
    '.cs-slide .cs-peek[data-edge="start"]{ inset-inline-start:0; }\n'
    '.cs-slide .cs-peek[data-edge="end"]{ inset-inline-end:0; }\n'
)

COMPOSE_TEST_OLD = (
    '  test("compose: neutral cue has no arrow and adds edge peeks, arrow-ltr and English", async function () {\n'
)
COMPOSE_TEST_NEW = (
    '  test("compose: neutral cue has no arrow and no edge cards, arrow-ltr and English", async function () {\n'
)
COMPOSE_TEST_OLD_BODY = (
    '    eq(qa(a, ".cs-peek").length, 2, "two edge peeks"); assert(qa(a, ".cs-peek").every(function (p) { return p.parentNode.classList.contains("cs-decor") && p.getAttribute("data-m") === "peek"; }), "inside the decor layer");\n'
    '    eq(qa(z, ".cs-peek").length, 0, "none on the last slide");\n'
)
COMPOSE_TEST_NEW_BODY = (
    '    var gone = [".cs-" + "peek", \'[data-m="\' + "peek" + \'"]\', "[data-" + "edge]"].join(", ");   /* the 1.0 edge cards, spelled in pieces so tools/remove_peek.py --check does not flag the guard itself */\n'
    '    eq(qa(a, gone).length, 0, "no edge cards on a neutral deck (removed in 1.1.0)"); eq(qa(z, gone).length, 0, "and none on the last slide");\n'
)


def edits() -> list[tuple[str, list[Callable[[str], str]]]]:
    out: list[tuple[str, list[Callable[[str], str]]]] = []

    def add(path: str, *steps: Callable[[str], str]) -> None:
        out.append((path, list(steps)))

    # code
    add("src/core/compose.js", sub(COMPOSE_BLOCK, ""))
    add("src/motion/recipes.js", sub("Decorative items (edge peeks, motif shapes) drift", "Decorative items (motif shapes) drift"))
    add("src/core/README.md", sub("only the counter and two edge peeks.", "only the counter (1.1 adds a quiet progress rail)."))
    # layout and look
    add(SK + "/templates/archetypes.html", sub(ARCHETYPE_BLOCK, ""))
    for p in PRESETS:
        add("%s/styles/%s/decor.css" % (SK, p), css_drop_rules("." + "".join(_T), "sliver of the neighbour"))
    # lint vocabulary
    add(SK + "/scripts/preset_lint.py", sub("cs-savepill cs-peek \"", "cs-savepill \""))
    # data and schema descriptions (the canonical file and every synced copy carry the same text)
    for path in (SK + "/data/locale-defaults.json", SC + "/data/locale-defaults.json", PL + "/skills/brand-setup/data/locale-defaults.json",
                 PL + "/skills/content-plan/data/locale-defaults.json"):
        add(path, sub(NEUTRAL_OLD_LOCALE, NEUTRAL_NEW_LOCALE))
    for path in (SK + "/schemas/spec.schema.json", SC + "/data/schemas/spec.schema.json", SK + "/schemas/brand.schema.json",
                 PL + "/skills/brand-setup/data/schemas/brand.schema.json"):
        add(path, sub(NEUTRAL_OLD_SCHEMA, NEUTRAL_NEW_SCHEMA))
    # references and briefs
    add(SK + "/references/presets.md", sub("`var(--cs-footer-item-h)`; `.cs-peek` is absolutely positioned inside the slide. Presets paint", "`var(--cs-footer-item-h)`. Presets paint"))
    add(SC + "/references/architectures.md",
        sub("the counter and the edge slivers carry the progress.", "the counter and a quiet progress rail carry the progress."),
        sub("the «باقي k» label and the edge peek; you write the rest.", "the «باقي k» label and, for a mixed audience, a quiet progress rail; you write the rest."))
    add(PL + "/skills/brand-setup/references/sections.md", sub("neutral counter and edge peek for mixed", "neutral counter with a quiet progress rail for mixed"))
    for path in ("team/roles/cs-audience-panel.md", PL + "/agents/cs-audience-panel.md", SC + "/references/team/cs-audience-panel.md"):
        add(path, sub(PANEL_OLD, PANEL_NEW))
    # the contract and the build report
    add("docs/CONTRACT.md",
        sub("`mixed → neutral` (counter + edge peek, no arrow)", "`mixed → neutral` (the counter and a quiet progress rail, no arrow; `style.rail`, 1.1)"),
        sub(" cs-savepill cs-peek cs-kicker", " cs-savepill cs-kicker"),
        sub("; the engine may add two `.cs-peek` decor elements (one per edge) which presets may style as a bleeding edge shape. On the last slide",
            "; the neutral cue is the counter, and from 1.1 a quiet progress rail inside the counter slot (`style.rail`). On the last slide"),
        sub(" The two `.cs-peek` slivers are placed by each preset's own `[data-edge=\"start\"]` and `[data-edge=\"end\"]` rules, never by a sibling selector: "
            "a preset that moved the second peek with `.cs-peek + .cs-peek` left both on one edge, because the base rules for `data-edge` stayed in force for the first.",
            " Version 1.0 also drew two empty cards on the slide edges for this cue; they carried nothing from the neighbouring slide and were removed in 1.1.0 "
            "(the rail is the neutral cue's content)."),
        sub(" savepill peek kicker ", " savepill kicker "))
    add("docs/BUILD-REPORT.md",
        sub("both edge slivers of the neutral cue now show (every preset's `.cs-peek + .cs-peek` rule collided with the base `data-edge` rules and put both on one edge)",
            "the neutral cue's edge slivers were fixed here and then removed in 1.1.0 (they carried nothing from the neighbouring slide; the cue is now the counter with a quiet progress rail)"),
        sub("The peek, the pill and the poster frame were fixed", "The neutral-cue slivers (removed in 1.1.0), the pill and the poster frame were fixed"))
    # tests that expected the peek
    add("tests/unit/js/core/cases/compose.test.js", sub(COMPOSE_TEST_OLD, COMPOSE_TEST_NEW), sub(COMPOSE_TEST_OLD_BODY, COMPOSE_TEST_NEW_BODY),
        sub("|cs-savepill|cs-peek|cs-kicker|", "|cs-savepill|cs-kicker|"))
    add("tests/unit/js/core/cases/real.test.js", sub("|cs-savepill|cs-peek|cs-kicker|", "|cs-savepill|cs-kicker|"),
        sub('"data-side": ["0", "1"], "data-edge": ["start", "end"], ', '"data-side": ["0", "1"], '))
    return out


# ---------------------------------------------------------------------------------------------------------------------------------
# run
# ---------------------------------------------------------------------------------------------------------------------------------


def read(path: Path) -> str:
    with open(path, "r", encoding="utf-8", newline="") as fh:
        return fh.read()


def write_atomic(path: Path, text: str) -> None:
    fd, tmp = tempfile.mkstemp(prefix=path.name + ".", suffix=".tmp", dir=str(path.parent))
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="") as fh:
            fh.write(text)
        os.replace(tmp, path)
    except OSError:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def find_leftovers(root: Path) -> list[str]:
    hits = []
    for base, dirs, files in os.walk(root):
        dirs[:] = sorted(d for d in dirs if d not in LEFTOVER_SKIP_DIRS)
        for name in sorted(files):
            p = Path(base) / name
            if name in LEFTOVER_SKIP_FILES or p.suffix not in LEFTOVER_SUFFIXES:
                continue
            rel = p.relative_to(root).as_posix()
            try:
                if LEFTOVER.search(read(p)):
                    hits.append(rel)
            except (OSError, UnicodeDecodeError):
                continue
    return hits


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="remove_peek.py", description="Delete the edge peek rectangles from every hand-edited source (spec 6.7).")
    parser.add_argument("--check", action="store_true", help="write nothing; exit 2 when a file still needs the edit or still mentions the peek")
    parser.add_argument("--format", choices=("text", "json"), default="text", help="output format (default: text)")
    parser.add_argument("--root", help="repository root (default: the folder above tools/)")
    try:
        args = parser.parse_args(argv)
    except SystemExit as exc:
        return EXIT_OK if exc.code == 0 else EXIT_USAGE
    root = Path(args.root).resolve() if args.root else Path(__file__).resolve().parent.parent
    if not (root / "src").is_dir():
        sys.stderr.write("cs-error: E_USAGE: %s is not the repository root\n" % root)
        return EXIT_NO_INPUT

    changed, clean = [], []
    pending: list[tuple[Path, str]] = []
    for rel, steps in edits():
        path = root / rel
        if not path.is_file() and rel in {"docs/BUILD-REPORT.md", "site/landing-copy.md"}:
            continue
        if not path.is_file():
            sys.stderr.write("cs-error: E_USAGE: listed file is missing: %s\n" % rel)
            return EXIT_NO_INPUT
        before = read(path)
        text = before
        try:
            for step in steps:
                text = step(text)
        except EditError as exc:
            sys.stderr.write("cs-error: E_INTERNAL: %s: %s\n" % (rel, exc))
            return EXIT_INTERNAL
        if text != before:
            changed.append(rel)
            pending.append((path, text))
        else:
            clean.append(rel)

    if not args.check:
        for path, text in pending:
            try:
                write_atomic(path, text)
            except OSError as exc:
                sys.stderr.write("cs-error: E_CANT_WRITE: %s: %s\n" % (path, exc))
                return EXIT_CANT_WRITE

    leftovers = find_leftovers(root)  # after writing (or the current state with --check)

    if args.format == "json":
        print(json.dumps({"check": args.check, "changed": changed, "clean": len(clean), "leftover": leftovers}, ensure_ascii=False, indent=1))
    else:
        verb = "would change" if args.check else "changed"
        for rel in changed:
            print("%s: %s" % (verb, rel))
        print("%d file(s) %s, %d already clean." % (len(changed), verb, len(clean)))
        for rel in leftovers:
            print("still mentions the peek: %s" % rel)
        if leftovers:
            print("The files above are not in the edit table of tools/remove_peek.py: add them (or fix them by hand) and run it again.")
    if leftovers:
        return EXIT_DRIFT
    if args.check and changed:
        return EXIT_DRIFT
    return EXIT_OK


if __name__ == "__main__":
    sys.exit(main())
