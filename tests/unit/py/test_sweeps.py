"""Tests for the round-3 sweeps: tools/remove_peek.py, tools/add_type.py and the 1.1.0 version bump.

What they guard (build plan F2): the edge peek is gone from every hand-edited source, both new slide types (grid, timeline) appear in every
list that names `story-beat`, and the version agrees in every place except package.json (F4), tools/build.mjs (F3) and build_studio.py (F4).

Run: python -X utf8 -m unittest tests.unit.py.test_sweeps    (or: python -m unittest discover -s tests/unit/py -p "test_sweeps.py")
"""

from __future__ import annotations

import importlib.util
import json
import os
import re
import subprocess
import sys
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
TOOLS = REPO / "tools"
SK = REPO / "plugins" / "carousel-studio" / "skills" / "carousel-design"
SC = REPO / "plugins" / "carousel-studio" / "skills" / "carousel-create"
PLUGIN = REPO / "plugins" / "carousel-studio"
ENV = {**os.environ, "PYTHONIOENCODING": "utf-8", "PYTHONUTF8": "1"}
NEW_TYPES = ("grid", "timeline")
VARIANT_OF = {"grid": "bento", "timeline": "rail"}

# generated outputs and folders that are not sources; they are rebuilt by tools/build.mjs and the example maker
SKIP_DIRS = {"node_modules", ".git", "examples", "runtime", "__pycache__", ".pytest_cache", ".ruff_cache", "release", "output"}
GENERATED_FILES = {".verdicts.js.json"}
TEXT_SUFFIXES = {".py", ".js", ".mjs", ".cjs", ".json", ".md", ".html", ".css"}


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


def run_tool(*args: str) -> subprocess.CompletedProcess:
    return subprocess.run([sys.executable, "-X", "utf8", *args], capture_output=True, text=True, encoding="utf-8", env=ENV, timeout=300, cwd=str(REPO))


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def source_files():
    for base, dirs, files in os.walk(REPO):
        dirs[:] = sorted(d for d in dirs if d not in SKIP_DIRS)
        for name in sorted(files):
            p = Path(base) / name
            if p.suffix in TEXT_SUFFIXES:
                yield p


remove_peek = load_module("remove_peek_under_test", TOOLS / "remove_peek.py")
add_type = load_module("add_type_under_test", TOOLS / "add_type.py")


class PeekSweepTests(unittest.TestCase):
    def test_no_peek_outside_the_changelog(self) -> None:
        """Generated outputs (runtime chunks, examples/) are rebuilt by the build; CHANGELOG.md keeps its history."""
        self.assertEqual(remove_peek.find_leftovers(REPO), [])

    def test_the_tool_is_idempotent_and_exits_clean(self) -> None:
        res = run_tool(str(TOOLS / "remove_peek.py"), "--check")
        self.assertEqual(res.returncode, 0, res.stdout + res.stderr)
        self.assertIn("0 file(s) would change", res.stdout)

    def test_help_exits_zero(self) -> None:
        for tool in ("remove_peek.py", "add_type.py"):
            res = run_tool(str(TOOLS / tool), "--help")
            self.assertEqual(res.returncode, 0, tool)
            self.assertIn("usage", res.stdout.lower())

    def test_the_layout_and_the_presets_draw_no_edge_cards(self) -> None:
        sheet = read(SK / "templates" / "archetypes.html")
        self.assertNotIn("peek", sheet.lower())
        for preset in ("swiss", "creator", "notebook", "poster", "interface", "heritage"):
            css = read(SK / "styles" / preset / "decor.css")
            self.assertNotIn("peek", css.lower(), preset)
            self.assertNotIn("data-edge", css, preset)

    def test_compose_adds_nothing_to_the_decor_layer_for_the_neutral_cue(self) -> None:
        compose = read(REPO / "src" / "core" / "compose.js")
        self.assertNotIn("peek", compose.lower())
        self.assertNotIn('"neutral" && cx.total', compose)

    def test_the_css_dropper_removes_only_the_listed_rules(self) -> None:
        css = (
            '.a .cs-keep { color: red; }\n\n'
            '.a .cs-gone {\n  background: url("data:image/svg+xml,%3Csvg%3E{{accent}}%3C/svg%3E");\n}\n'
            '/* a note about the neighbour */\n'
            '.a .cs-gone[data-x="1"] {\n  inset: 0;\n}\n'
            '.a .cs-gone[data-x="2"] {\n  inset: 1px;\n}\n\n'
            '/* ---------- next ---------- */\n.b { margin: 0; }\n'
        )
        out = remove_peek.css_drop_rules(".cs-gone", "neighbour")(css)
        self.assertEqual(out, '.a .cs-keep { color: red; }\n\n/* ---------- next ---------- */\n.b { margin: 0; }\n')
        self.assertEqual(remove_peek.css_drop_rules(".cs-gone", "neighbour")(out), out, "a second pass changes nothing")

    def test_sub_is_exact_idempotent_and_loud(self) -> None:
        step = remove_peek.sub("old text", "new text")
        self.assertEqual(step("a old text b"), "a new text b")
        self.assertEqual(step("a new text b"), "a new text b")
        with self.assertRaises(remove_peek.EditError):
            step("nothing here")
        with self.assertRaises(remove_peek.EditError):
            step("old text and old text")


class TypeSweepTests(unittest.TestCase):
    def test_the_tool_finds_nothing_left_to_register(self) -> None:
        for t in NEW_TYPES:
            res = run_tool(str(TOOLS / "add_type.py"), t, "--check")
            self.assertEqual(res.returncode, 0, "%s\n%s%s" % (t, res.stdout, res.stderr))

    def test_an_unknown_type_is_a_usage_error(self) -> None:
        self.assertEqual(run_tool(str(TOOLS / "add_type.py"), "carousel-of-doom", "--check").returncode, 64)

    def test_add_to_literal_keeps_the_style_and_is_idempotent(self) -> None:
        text = 'var X = ["a", "b"];\nvar Y = new Set(["a"]);'
        once = add_type.add_to_literal(text, r"var X = ", "c")
        self.assertEqual(once, 'var X = ["a", "b", "c"];\nvar Y = new Set(["a"]);')
        self.assertEqual(add_type.add_to_literal(once, r"var X = ", "c"), once)
        with self.assertRaises(add_type.EditError):
            add_type.add_to_literal(text, r"var Z = ", "c")

    def test_the_registry_lists_both_types_last(self) -> None:
        m = re.search(r"var SLIDE_TYPES = \[([^\]]*)\]", read(REPO / "src" / "core" / "registry.js"))
        types = re.findall(r'"([^"]+)"', m.group(1))
        self.assertEqual(types[-2:], list(NEW_TYPES))
        self.assertEqual(len(types), len(set(types)))
        self.assertEqual(len(types), 20)

    def test_both_types_appear_in_every_list_that_names_story_beat(self) -> None:
        """A file that lists the slide types (it names story-beat and at least eight other types) must name grid and timeline too."""
        old_types = ["cover", "rehook", "item", "step", "stat", "compare", "myth-fact", "quote", "story-beat", "checklist", "summary", "setup",
                     "proof", "share", "cta", "offer", "testimonial", "poster"]
        not_lists = {  # files that name the types in order to do this very sweep
            "tools/add_type.py", "tools/remove_peek.py", "tests/unit/py/test_sweeps.py",
            # round 3: these name many types without being lists of them
            "src/core/compose.js",  # one branch per type (cover, compare, step, story-beat...); the grid/timeline item code moved to src/visual/hooks.js
            "tests/unit/js/visual/plan.test.mjs",  # a random-deck pool drawn from the fixture decks, which hold no grid or timeline slide
        }

        def names(text: str, t: str) -> bool:
            return re.search(r'(?<![\w-])%s(?![\w-])' % re.escape(t), re.sub(r"display\s*:\s*grid|grid-[a-z-]+|inline-grid", "", text)) is not None
        missing = []
        for p in source_files():
            rel = p.relative_to(REPO).as_posix()
            if p.name in GENERATED_FILES:
                continue  # the conformance runner's verdict dump: rebuilt by tests/conformance/run_js.mjs, not a source
            if rel in not_lists or rel.startswith("tests/cover-baseline/") or re.fullmatch(r"plugins/carousel-studio/skills/carousel-design/styles/[a-z]+/decor\.css", rel):
                continue  # decor sheets style the panel look of a few types (a stub type needs no rule of its own); the cover baseline is a frozen 1.0 deck
            try:
                text = read(p)
            except UnicodeDecodeError:
                continue
            if "story-beat" not in text or sum(1 for t in old_types if t != "story-beat" and names(text, t)) < 8:
                continue
            for t in NEW_TYPES:
                if not names(text, t):
                    missing.append("%s lacks %s" % (rel, t))
        golden = json.loads(read(REPO / "tests" / "golden" / "manifest.json"))
        self.assertEqual(missing, [], "\n".join(missing))
        for preset, data in golden["presets"].items():
            for t in NEW_TYPES:
                self.assertIn(t, data["slides"], "golden manifest: %s %s" % (preset, t))

    def test_schemas_presets_and_archetypes_agree(self) -> None:
        for path in (SK / "schemas" / "spec.schema.json", SC / "data" / "schemas" / "spec.schema.json", SK / "schemas" / "preset.schema.json"):
            enum = json.loads(read(path))["$defs"]["slideType"]["enum"]
            for t in NEW_TYPES:
                self.assertIn(t, enum, path.name)
            self.assertEqual(len(enum), len(set(enum)))
        sheet = read(SK / "templates" / "archetypes.html")
        for t in NEW_TYPES:
            m = re.search(r'<template data-archetype="%s" data-version="1" data-default-variant="([a-z-]+)"\s+data-variants="([a-z -]+)"' % t, sheet)
            self.assertIsNotNone(m, t)
            self.assertEqual((m.group(1), m.group(2)), (VARIANT_OF[t], VARIANT_OF[t]))
            self.assertIn('class="cs-content cs-a-%s"' % t, sheet)
            for preset in ("swiss", "creator", "notebook", "poster", "interface", "heritage"):
                variants = json.loads(read(SK / "styles" / preset / "preset.json"))["variants"]
                self.assertEqual(variants[t], [VARIANT_OF[t]], "%s %s" % (preset, t))

    def test_qa_rule_lists_carry_the_new_types(self) -> None:
        rules = json.loads(read(SK / "data" / "qa-rules.json"))
        lists = []

        def walk(node):
            if isinstance(node, dict):
                for key, value in node.items():
                    if key in ("slideTypes", "types") and isinstance(value, list) and "story-beat" in value:
                        lists.append(value)
                    walk(value)
            elif isinstance(node, list):
                for item in node:
                    walk(item)

        walk(rules)
        self.assertGreaterEqual(len(lists), 4)
        for value in lists:
            for t in NEW_TYPES:
                self.assertIn(t, value)
        for other in (SC / "data" / "qa-rules.json", PLUGIN / "skills" / "arabic-proofread" / "data" / "qa-rules.json"):
            self.assertEqual(read(other), read(SK / "data" / "qa-rules.json"), other.parent.parent.name)

    def test_names_exist_in_five_dialects(self) -> None:
        strings = json.loads(read(SK / "runtime" / "ui-strings.json"))["strings"]
        for key in ["type.grid", "type.timeline", "variant.bento", "variant.rail"]:
            self.assertIn(key, strings)
            self.assertEqual(sorted(strings[key]), sorted(["eg", "gulf", "levant", "msa-white", "en"]), key)
            for dialect, value in strings[key].items():
                self.assertTrue(value.strip(), "%s %s" % (key, dialect))
                self.assertEqual(value, value.strip())
        self.assertEqual(list(strings), sorted(strings), "the strings stay sorted by key")

    def test_the_showcase_deck_has_both_slides_inside_the_limits(self) -> None:
        deck = json.loads(read(REPO / "tools" / "examples" / "showcase.spec.json"))
        self.assertLessEqual(len(deck["slides"]), 10)
        slides = list(deck["ext"]["archetypeSamples"].values())
        self.assertEqual([s["id"] for s in slides], ["s%02d" % (i + 1) for i in range(len(slides))])
        self.assertEqual([s["n"] for s in slides], list(range(1, len(slides) + 1)))
        self.assertEqual(slides[-1]["type"], "cta")
        by_type = {s["type"]: s for s in slides}
        self.assertEqual(len(slides), 20)
        self.assertLess([s["type"] for s in slides].index("grid"), [s["type"] for s in slides].index("timeline"))
        limits = {"grid": (3, 6), "timeline": (3, 4)}
        for t, (lo, hi) in limits.items():
            s = by_type[t]
            items = s.get("items", [])  # `items` goes in with `add_type.py <type> --items`, after the spec schema allows the field (E1)
            self.assertTrue(items == [] or lo <= len(items) <= hi, t)
            self.assertTrue(s.get("bridge"), t + " has a bridge (it is not the last slide)")
            words = sum(len(str(x).split()) for x in [s["title"], s["bridge"]] + [v for it in items for k, v in it.items() if k in ("title", "text", "value")])
            self.assertLessEqual(words, 45, "%s: %d words" % (t, words))
            self.assertLessEqual(len(s["title"].split()), 6)
            self.assertEqual(sum(1 for it in items if it.get("hi")), 1 if items else 0, "one key item")
            for it in items:
                self.assertLessEqual(len(it["title"].split()), 3 if t == "grid" else 2)
                self.assertLessEqual(len(it["text"].split()), 5 if t == "grid" else 4)
        for it in by_type["timeline"].get("items", []):
            self.assertLessEqual(len(it["value"]), 12)
            self.assertLessEqual(len(it["value"].split()), 2)
        data = add_type.TYPES  # the items the tool will add stay inside the same limits
        for t, (lo, hi) in limits.items():
            items = data[t]["showcase"]["items"]
            self.assertTrue(lo <= len(items) <= hi, t)
            self.assertEqual(sum(1 for it in items if it.get("hi")), 1)

    def test_the_completeness_check_asks_for_a_title_and_titled_items(self) -> None:
        scripts = SK / "scripts"
        sys.path.insert(0, str(scripts))
        try:
            validate = load_module("validate_under_test", scripts / "validate.py")
        finally:
            sys.path.remove(str(scripts))
        base = json.loads(read(REPO / "tests" / "fixtures" / "spec.eg.8slides.json"))
        for t in NEW_TYPES:
            self.assertEqual(validate.REQUIRED_FIELDS[t], ("title", "items"))
            spec = json.loads(json.dumps(base))
            n = len(spec["slides"]) + 1
            spec["slides"].append({"id": "s%02d" % n, "n": n, "type": t, "title": "عنوان"})
            problems = [p["path"] for p in validate.structure_checks(spec, "script")]
            self.assertIn("/slides/%d/items" % (n - 1), problems, t)
            spec["slides"][-1]["items"] = [{"title": "أول"}, {"title": "تاني"}, {"title": "تالت"}]
            problems = [p["path"] for p in validate.structure_checks(spec, "script")]
            self.assertNotIn("/slides/%d/items" % (n - 1), problems, t)
            self.assertNotIn("/slides/%d/title" % (n - 1), problems, t)
        for other in ("carousel-create", "brand-setup", "content-plan"):
            self.assertEqual(read(PLUGIN / "skills" / other / "scripts" / "validate.py"), read(scripts / "validate.py"), other)


class VersionTests(unittest.TestCase):
    """B-8: the version agrees everywhere at once, because tools/release.py (and CI) refuse a half-bumped tree.
    Not checked here: package.json (F4), tools/build.mjs (F3) and build_studio.py (F4); their own tests do."""

    @classmethod
    def setUpClass(cls) -> None:
        cls.version = json.loads(read(PLUGIN / ".claude-plugin" / "plugin.json"))["version"]
        cls.engine = "cs-" + cls.version

    def test_the_plugin_is_1_1_x(self) -> None:
        self.assertRegex(self.version, r"^1\.1\.[0-9]+$")

    def test_manifests_agree(self) -> None:
        market = json.loads(read(REPO / ".claude-plugin" / "marketplace.json"))
        self.assertEqual(market["metadata"]["version"], self.version)
        self.assertEqual(market["plugins"][0]["version"], self.version)
        self.assertEqual(json.loads(read(REPO / "v1-manifest.json"))["version"], self.version)

    def test_python_package_and_report_engine_agree(self) -> None:
        self.assertIn('__version__ = "%s"' % self.version, read(SK / "scripts" / "_cs" / "__init__.py"))
        self.assertIn('ENGINE = "%s"' % self.engine, read(SK / "scripts" / "_cs" / "report.py"))

    def test_the_browser_runtime_sources_agree(self) -> None:
        self.assertIn('CS.version = "%s";' % self.engine, read(REPO / "src" / "lib" / "root.js"))
        self.assertIn('ENGINE: "%s",' % self.engine, read(REPO / "src" / "qa" / "core.js"))
        self.assertIn('"%s"' % self.engine, read(REPO / "src" / "ui" / "qa.js"))
        self.assertIn('"%s"' % self.engine, read(REPO / "src" / "brandbook" / "screens" / "about.js"))
        self.assertIn('const VERSION = "%s";' % self.engine, read(REPO / "tests" / "unit" / "js" / "core" / "_build.mjs"))
        self.assertIn("engine %s" % self.engine, read(SK / "templates" / "archetypes.html"))

    def test_the_changelog_has_an_entry_for_the_version(self) -> None:
        self.assertRegex(read(REPO / "CHANGELOG.md"), r"(?m)^## \[%s\]" % re.escape(self.version))

    def test_the_contract_names_the_new_pins(self) -> None:
        text = read(REPO / "docs" / "CONTRACT.md")
        self.assertIn("| `ENGINE` (`CS.version`, `frozen.engine`, `qa.engine`) | `%s` |" % self.engine, text)
        self.assertIn("| `PLUGIN_VERSION` | `%s` |" % self.version, text)
        self.assertIn("Engine version `%s`. Plugin version `%s`." % (self.engine, self.version), text)


if __name__ == "__main__":
    unittest.main()
