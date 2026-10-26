"""Tests for carousel-design/scripts/preset_lint.py: the shipped presets pass, and every rule of CONTRACT 6.3 catches the
construct it exists for (checked on small stylesheets and on a mutated copy of a shipped preset).

Round 3 (E4b) adds the rebuilt look: --strict (outline, border-image, color-mix, gradient and shadow colours, 25 KiB, and everything the replay painter
refuses), the vocabulary of IS-6, lint_tones over the eight roles of every tone (the table of spec 6.0 is the test vector: tests/preset-lint/spec-6.0.json),
the graphic rules G1-G6, art.objectOutline, and the staged variants. Planted decor.css cases are in tests/preset-lint/decor-cases.json.

Two rules are held to the code they describe rather than to a copy of it: the plate and glyph colours of G3 and G6 are compared with the real kit.frame
(tests/preset-lint/kit-pairs.mjs), and the strict CSS bans with the real replaySupportCheck (tests/preset-lint/replay-probe.mjs). Both probes run in node,
without a browser. Nothing here assumes which of --strict and --no-strict is the default: the integration beat flips STRICT_DEFAULT with one line, and every
test that depends on the mode passes the flag or overrides the constant.

Wave 2b (DATA-TONES-LINT) adds: a custom property and the fallback of a var() are read for what they stand for (a 3D function behind transform: var(--cs-turn), a
colour behind box-shadow: var(--cs-shadow) or var(--cs-missing, red)); the `pick` fallback is the resolver's (the last candidate); a list-item whose list-style is
none is drawn; and decision D-7 for decor.size (the first 20 KiB of rules scoped to [data-type="cover"] or [data-type="poster"] do not count toward the strict limit).

Run: python -X utf8 -m unittest tests.unit.py.test_preset_lint   (from the repository root)
     python -m unittest discover -s tests/unit/py -p "test_preset_lint.py"
"""

from __future__ import annotations

import contextlib
import copy
import io
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

try:
    import b7_support as support
except ImportError:  # run as tests.unit.py.test_preset_lint from the repository root
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import b7_support as support

REPO = Path(__file__).resolve().parents[3]
SKILL = REPO / "plugins" / "carousel-studio" / "skills" / "carousel-design"
SCRIPT = SKILL / "scripts" / "preset_lint.py"
FIXTURES = REPO / "tests" / "preset-lint"
ENV = {**os.environ, "PYTHONIOENCODING": "utf-8", "PYTHONUTF8": "1"}

pl = None
NODE = shutil.which("node")


def setUpModule() -> None:
    global pl
    pl = support.load_script("carousel-design", "preset_lint.py", "preset_lint_under_test")


def tearDownModule() -> None:
    support.cleanup()


def run_cli(*args: str) -> subprocess.CompletedProcess:
    return subprocess.run([sys.executable, str(SCRIPT), *args], capture_output=True, text=True, encoding="utf-8", env=ENV, timeout=120)


def codes(css: str, preset_id: str = "swiss") -> set:
    return {f["code"] for f in pl.lint_css(css, preset_id)}


def rule(body: str, selector: str = '.cs-slide[data-preset="swiss"] .cs-headline') -> str:
    return selector + " { " + body + " }\n"


class CssRuleTests(unittest.TestCase):
    def test_a_clean_sheet_passes(self) -> None:
        css = rule("color: var(--cs-ink); padding-block-end: 12px; border-block-end: 4px solid var(--cs-accent);")
        css += rule("opacity: .5; background: var(--cs-accent);", '.cs-slide[data-preset="swiss"] .cs-decor')
        self.assertEqual(pl.lint_css(css, "swiss"), [])

    def test_selector_must_be_scoped_to_the_preset(self) -> None:
        self.assertIn("decor.selector", codes(rule("color: var(--cs-ink);", ".cs-headline")))
        self.assertIn("decor.selector", codes(rule("color: var(--cs-ink);", '.cs-slide[data-preset="poster"] .cs-headline')))

    def test_unknown_class_and_attribute_are_rejected(self) -> None:
        self.assertIn("decor.selector", codes(rule("color: var(--cs-ink);", '.cs-slide[data-preset="swiss"] .my-class')))
        self.assertIn("decor.selector", codes(rule("color: var(--cs-ink);", '.cs-slide[data-preset="swiss"] [style]')))

    def test_interaction_states_and_ids_are_rejected(self) -> None:
        self.assertIn("decor.selector", codes(rule("color: var(--cs-ink);", '.cs-slide[data-preset="swiss"] .cs-cta:hover')))
        self.assertIn("decor.selector", codes(rule("color: var(--cs-ink);", '.cs-slide[data-preset="swiss"] #main')))

    def test_at_rules_are_rejected(self) -> None:
        self.assertIn("decor.at-rule", codes('@import "x.css";\n@media print { .cs-slide[data-preset="swiss"] .cs-headline { color: var(--cs-ink); } }\n'))

    def test_important(self) -> None:
        self.assertIn("decor.important", codes(rule("color: var(--cs-ink) !important;")))

    def test_forbidden_properties(self) -> None:
        for decl in ("filter: blur(2px);", "mix-blend-mode: multiply;", "font-family: serif;", "animation: spin 1s;", "transition: all 1s;", "font-style: italic;"):
            self.assertIn("decor.forbidden-property", codes(rule(decl)), decl)

    def test_font_style_normal_is_fine(self) -> None:
        self.assertNotIn("decor.forbidden-property", codes(rule("font-style: normal;")))

    def test_letter_spacing_and_justify(self) -> None:
        self.assertIn("decor.letter-spacing", codes(rule("letter-spacing: 2px;")))
        self.assertNotIn("decor.letter-spacing", codes(rule("letter-spacing: 0;")))
        self.assertIn("decor.justify", codes(rule("text-align: justify;")))

    def test_position_fixed_and_viewport_units(self) -> None:
        self.assertIn("decor.position-fixed", codes(rule("position: fixed;")))
        self.assertIn("decor.viewport-unit", codes(rule("padding: 4vw;")))

    def test_urls_must_be_data_uris(self) -> None:
        self.assertIn("decor.url", codes(rule("background-image: url(https://example.com/a.png);")))
        self.assertNotIn("decor.url", codes(rule("background-image: url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E\");")))

    def test_colour_literals_are_rejected_outside_data_uris(self) -> None:
        self.assertIn("decor.colour-literal", codes(rule("border-color: #ff0000;")))
        self.assertIn("decor.colour-literal", codes(rule("background: rgb(0, 0, 0);")))
        self.assertNotIn("decor.colour-literal", codes(rule("border-color: var(--cs-accent);")))

    def test_opacity_only_on_background_layers(self) -> None:
        self.assertIn("decor.opacity", codes(rule("opacity: .5;")))
        self.assertNotIn("decor.opacity", codes(rule("opacity: .5;", '.cs-slide[data-preset="swiss"] .cs-bg')))

    def test_text_colours_are_opaque(self) -> None:
        self.assertIn("decor.translucent-text", codes(rule("color: rgba(0, 0, 0, .5);")))

    def test_text_slots_take_no_font_size(self) -> None:
        self.assertIn("decor.font-size", codes(rule("font-size: 40px;")))

    def test_unknown_placeholder(self) -> None:
        self.assertIn("decor.placeholder", codes(rule("background: {{Nope}};")))

    def test_size_limit(self) -> None:
        big = rule("color: var(--cs-ink);") * 3000
        self.assertGreater(len(big.encode("utf-8")), 64 * 1024)
        self.assertIn("decor.size", codes(big))

    def test_comments_are_ignored(self) -> None:
        self.assertEqual(pl.lint_css("/* filter: blur(2px); */\n" + rule("color: var(--cs-ink);"), "swiss"), [])


class ContrastTests(unittest.TestCase):
    def preset(self, **roles) -> dict:
        base = {"bg": "#FFFFFF", "ink": "#111111", "inkMuted": "#555555", "accent": "#E3262B", "surface": "#F4F4F4"}
        base.update(roles)
        return {"roles": base, "floors": {"contrastBody": 4.5, "contrastLarge": 3.0}}

    def test_good_roles_pass(self) -> None:
        self.assertEqual(pl.lint_contrast(self.preset()), [])

    def test_low_ink_is_an_error(self) -> None:
        found = pl.lint_contrast(self.preset(ink="#EEEEEE"))
        self.assertTrue(any(f["sev"] == "ERROR" and f["where"] == "ink on bg" for f in found), found)

    def test_between_floors_is_a_warning(self) -> None:
        found = pl.lint_contrast(self.preset(inkMuted="#8A8A8A"))
        self.assertTrue(found)
        self.assertEqual({f["sev"] for f in found}, {"WARN"})


class ShippedPresetTests(unittest.TestCase):
    """The shipped set, in the mode each test names (none of these reads STRICT_DEFAULT, so the beat that flips it cannot break them)."""

    def test_all_shipped_presets_are_clean(self) -> None:
        res = run_cli("--all", "--no-strict", "--format", "json")
        self.assertEqual(res.returncode, 0, res.stdout + res.stderr)
        data = json.loads(res.stdout)
        self.assertTrue(data["ok"])
        self.assertEqual(sorted(data["results"]), ["creator", "heritage", "interface", "notebook", "poster", "swiss"])
        self.assertEqual((data["errors"], data["warnings"]), (0, 0))

    def test_text_output_summarises(self) -> None:
        res = run_cli("--all", "--no-strict")
        self.assertEqual(res.returncode, 0)
        self.assertIn("6 preset(s): 0 error(s), 0 warning(s)", res.stdout)

    def test_the_default_mode_is_strict_only_once_every_shipped_preset_is_rebuilt(self) -> None:
        """The one test that reads the default: the lint of the whole set, with no flag, is clean in whichever mode STRICT_DEFAULT names, and the flip waits for the six."""
        legacy = [pid for pid in pl.V1_PRESETS if "art" not in shipped(pid)]
        if pl.STRICT_DEFAULT:
            self.assertEqual(legacy, [], "STRICT_DEFAULT is True but %s still have the 1.0 look: the beat flips it after the six rebuilds" % legacy)
        res = run_cli("--all", "--format", "json")
        self.assertEqual((res.returncode, json.loads(res.stdout)["strict"]), (0, pl.STRICT_DEFAULT), res.stdout[-1500:])


class PresetSetTests(unittest.TestCase):
    """The shipped set equals the v1 list (Q37): a stray editorial or scrapbook folder, a missing preset or an unknown one fails."""

    def setUp(self) -> None:
        self.tmp = Path(tempfile.mkdtemp(prefix="cs-presets-"))
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)
        for name in pl.V1_PRESETS:
            (self.tmp / name).mkdir()
        self.index = {"presets": [{"id": n} for n in pl.V1_PRESETS]}

    def codes(self, index=None) -> dict:
        return {(f["code"], f["where"]) for f in pl.lint_preset_set(self.tmp, index or self.index)}

    def test_the_v1_set_is_clean(self) -> None:
        self.assertEqual(self.codes(), set())

    def test_a_later_preset_may_not_be_shipped_even_listed(self) -> None:
        (self.tmp / "editorial").mkdir()
        (self.tmp / "scrapbook").mkdir()
        self.assertEqual(self.codes(), {("set.deferred", "editorial"), ("set.deferred", "scrapbook")})
        self.index["presets"].append({"id": "editorial"})
        self.assertIn(("set.deferred", "editorial"), self.codes())

    def test_unknown_missing_and_unlisted_presets(self) -> None:
        (self.tmp / "neon").mkdir()
        (self.tmp / "heritage").rmdir()
        self.index["presets"] = [p for p in self.index["presets"] if p["id"] != "swiss"]
        found = self.codes()
        self.assertIn(("set.unknown", "neon"), found)
        self.assertIn(("set.missing", "heritage"), found)
        self.assertIn(("set.unlisted", "swiss"), found)

    def test_a_preset_listed_as_dropped_is_not_required(self) -> None:
        (self.tmp / "poster").rmdir()
        self.assertIn(("set.missing", "poster"), self.codes())
        index = {"presets": [p for p in self.index["presets"] if p["id"] != "poster"], "dropped": ["poster"]}
        self.assertEqual(self.codes(index), set())

    def test_the_shipped_set_is_the_v1_set(self) -> None:
        index = json.loads((SKILL / "styles" / "index.json").read_text(encoding="utf-8"))
        self.assertEqual({d.name for d in (SKILL / "styles").iterdir() if d.is_dir()}, set(pl.V1_PRESETS))
        self.assertEqual([f for f in pl.lint_preset_set(SKILL / "styles", index) if f["sev"] == "ERROR"], [])


class MotionDefaultTests(unittest.TestCase):
    """Decision: motion is on by default and calm is an option, never the default."""

    def test_no_preset_defaults_to_calm_and_calm_stays_available(self) -> None:
        for folder in sorted((SKILL / "styles").iterdir()):
            if not folder.is_dir():
                continue
            motion = json.loads((folder / "preset.json").read_text(encoding="utf-8"))["motion"]
            self.assertNotEqual(motion["default"], "calm", folder.name)
            self.assertIn(motion["default"], motion["allowed"], folder.name)
            self.assertIn("calm", motion["allowed"], folder.name)

    def test_the_motion_guides_do_not_call_calm_the_default(self) -> None:
        import re
        for rel in ("skills/carousel-design/references/motion-recipes.md", "skills/carousel-create/references/flow.md"):
            text = (REPO / "plugins" / "carousel-studio" / rel).read_text(encoding="utf-8")
            self.assertIsNone(re.search(r"calm[^\n]{0,40}\(default\)", text, re.I), rel)
            self.assertIsNone(re.search(r"anything else\s*(?:->|→)\s*`?calm", text, re.I), rel)


class MutatedPresetTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = Path(tempfile.mkdtemp(prefix="cs-preset-lint-"))
        self.styles = self.tmp / "styles"
        shutil.copytree(SKILL / "styles", self.styles)
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)

    def lint(self, preset: str = "swiss") -> tuple[int, dict]:
        res = run_cli("--preset", str(self.styles / preset), "--styles", str(self.styles), "--no-strict", "--format", "json")
        return res.returncode, json.loads(res.stdout)

    def test_the_copy_is_clean(self) -> None:
        code, data = self.lint()
        self.assertEqual((code, data["errors"]), (0, 0))

    def test_a_forbidden_rule_in_decor_css_fails(self) -> None:
        decor = self.styles / "swiss" / "decor.css"
        decor.write_text(decor.read_text(encoding="utf-8") + '\n.cs-slide[data-preset="swiss"] .cs-headline { letter-spacing: 3px; }\n', encoding="utf-8")
        code, data = self.lint()
        self.assertEqual(code, 2)
        self.assertIn("decor.letter-spacing", {f["code"] for f in data["results"]["swiss"]})

    def test_an_unknown_font_fails(self) -> None:
        pj = self.styles / "swiss" / "preset.json"
        preset = json.loads(pj.read_text(encoding="utf-8"))
        text = json.dumps(preset, ensure_ascii=False).replace("ibm-plex-sans-arabic", "no-such-font")
        pj.write_text(text, encoding="utf-8")
        code, data = self.lint()
        self.assertEqual(code, 2)
        self.assertTrue(any(f["sev"] == "ERROR" for f in data["results"]["swiss"]))

    def test_an_id_that_differs_from_the_folder_fails(self) -> None:
        pj = self.styles / "swiss" / "preset.json"
        preset = json.loads(pj.read_text(encoding="utf-8"))
        preset["id"] = "other"
        pj.write_text(json.dumps(preset, ensure_ascii=False), encoding="utf-8")
        code, _ = self.lint()
        self.assertEqual(code, 2)

    def test_unreadable_json_is_reported_not_a_traceback(self) -> None:
        (self.styles / "swiss" / "preset.json").write_text("{not json", encoding="utf-8")
        res = run_cli("--preset", str(self.styles / "swiss"), "--styles", str(self.styles), "--no-strict", "--format", "json")
        self.assertNotIn("Traceback", res.stderr)
        self.assertNotEqual(res.returncode, 0)

    def test_write_index_regenerates_the_shipped_index(self) -> None:
        shipped = json.loads((SKILL / "styles" / "index.json").read_text(encoding="utf-8"))
        index = self.styles / "index.json"
        index.write_text(json.dumps({**shipped, "presets": []}), encoding="utf-8")
        res = run_cli("--all", "--styles", str(self.styles), "--no-strict", "--write-index")
        self.assertIn("rewritten (6 presets)", res.stdout)
        self.assertEqual(res.returncode, 1, "the lint ran against the old, empty index and warned about it")
        self.assertEqual(run_cli("--all", "--styles", str(self.styles), "--no-strict").returncode, 0, "the regenerated index lists every preset")
        again = json.loads(index.read_text(encoding="utf-8"))
        self.assertEqual({p["id"] for p in again["presets"]}, {p["id"] for p in shipped["presets"]})
        for new in again["presets"]:
            old = [p for p in shipped["presets"] if p["id"] == new["id"]][0]
            self.assertEqual(new["fonts"], old["fonts"])
            self.assertEqual(new["preview"], old["preview"])

    def test_a_missing_preview_is_reported(self) -> None:
        (self.styles / "swiss" / "preview.png").unlink()
        code, data = self.lint()
        self.assertNotEqual(code, 0)
        self.assertTrue(any(f["code"].startswith("preview") for f in data["results"]["swiss"]))


class OccasionTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = Path(tempfile.mkdtemp(prefix="cs-occasion-"))
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)

    def test_a_folder_without_pack_json_fails(self) -> None:
        res = run_cli("--occasion", str(self.tmp))
        self.assertEqual(res.returncode, 2)
        self.assertIn("pack.json", res.stdout)

    def test_a_motif_with_a_script_fails(self) -> None:
        (self.tmp / "pack.json").write_text("{}", encoding="utf-8")
        (self.tmp / "motif.svg").write_text('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', encoding="utf-8")
        res = run_cli("--occasion", str(self.tmp), "--format", "json")
        data = json.loads(res.stdout)
        found = {f["code"] for f in next(iter(data["results"].values()))}
        self.assertIn("motif.external", found)
        self.assertEqual(res.returncode, 2)


# ---- Round 3 (E4b): the rebuilt look ---------------------------------------------------------------------------------------------


def _load(name: str):
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


def shipped(pid: str) -> dict:
    return json.loads((SKILL / "styles" / pid / "preset.json").read_text(encoding="utf-8"))


def legacy(pid: str) -> dict:
    """The 1.0 look of a shipped preset: the art block and the tones taken off, so the tests that need a look "not rebuilt yet" do not depend on how far PR1-PR6 are."""
    preset = shipped(pid)
    preset.pop("art", None)
    preset.pop("tones", None)
    return preset


def rebuilt(pid: str, **art_over) -> dict:
    """The shipped preset with the art essentials and the tone expressions of spec 6.0 (tests/preset-lint/spec-6.0.json) on top: what a PR package
    delivers. The roles and the highlight must be the shipped ones, or the vectors are stale."""
    preset, fixture = shipped(pid), _load("spec-6.0.json")["presets"][pid]
    assert preset["roles"] == fixture["roles"] and preset["decor"]["highlight"] == fixture["highlight"], pid
    preset["art"] = copy.deepcopy(fixture["art"])
    preset["art"].update(art_over)
    preset["tones"] = copy.deepcopy(fixture["tones"])
    return preset


def where_codes(findings) -> set:
    return {(f["code"], f["where"]) for f in findings}


def run_node(script: str, payload: dict):
    """One of the probes of tests/preset-lint (node, no browser): JSON in on stdin, JSON out."""
    res = subprocess.run([NODE, str(FIXTURES / script)], input=json.dumps(payload), capture_output=True, text=True, encoding="utf-8", timeout=120, cwd=str(REPO))
    if res.returncode != 0:
        raise AssertionError("%s exited %d: %s" % (script, res.returncode, res.stderr[-800:]))
    return json.loads(res.stdout)


class FlippedDefault:
    """Sets preset_lint.STRICT_DEFAULT for the length of a block, the way the integration beat will flip it."""

    def __init__(self, value: bool) -> None:
        self.value = value

    def __enter__(self) -> None:
        self.old, pl.STRICT_DEFAULT = pl.STRICT_DEFAULT, self.value

    def __exit__(self, *exc) -> None:
        pl.STRICT_DEFAULT = self.old


class StrictCssTests(unittest.TestCase):
    """--strict (spec 6.8, F1): the planted cases of tests/preset-lint/decor-cases.json, with and without the flag."""

    def test_every_planted_case_gives_its_codes_strict_and_loose(self) -> None:
        cases = _load("decor-cases.json")["cases"]
        self.assertGreaterEqual(len(cases), 18)
        for case in cases:
            css = case["css"].replace("{S}", '.cs-slide[data-preset="swiss"]')
            for mode, strict in (("strict", True), ("loose", False)):
                with self.subTest(case=case["name"], mode=mode):
                    self.assertEqual(sorted({f["code"] for f in pl.lint_css(css, "swiss", strict)}), sorted(case[mode]))

    def test_the_legacy_presets_pass_without_strict_and_fail_with_it(self) -> None:
        """Until each PR package rebuilds its preset: 36-41 KiB decor.css, color-mix, no art, no tones."""
        self.assertEqual(run_cli("--all", "--no-strict").returncode, 0)
        res = run_cli("--all", "--strict", "--format", "json")
        data = json.loads(res.stdout)
        self.assertTrue(data["strict"])
        legacy = [pid for pid in data["results"] if "art" not in shipped(pid)]
        for pid in legacy:
            codes = {f["code"] for f in data["results"][pid]}
            self.assertTrue({"decor.size", "strict.art", "strict.tones"} <= codes, pid)
        if legacy:
            self.assertEqual(res.returncode, 2)

    def test_the_strict_size_limit_is_25_kib_and_the_loose_one_64(self) -> None:
        rule = '.cs-slide[data-preset="swiss"] .cs-kicker { color: var(--cs-ink); }\n'
        for count, strict_ok, loose_ok in ((25 * 1024 // len(rule), True, True), (25 * 1024 // len(rule) + 2, False, True), (64 * 1024 // len(rule) + 2, False, False)):
            css = rule * count
            with self.subTest(bytes=len(css)):
                self.assertEqual("decor.size" not in {f["code"] for f in pl.lint_css(css, "swiss", True)}, strict_ok)
                self.assertEqual("decor.size" not in {f["code"] for f in pl.lint_css(css, "swiss", False)}, loose_ok)

    def test_lint_css_takes_its_mode_from_its_argument_not_from_the_default(self) -> None:
        css = rule_with("outline: 2px solid var(--cs-ink);")
        for default in (False, True):
            with self.subTest(default=default), FlippedDefault(default):
                self.assertIsInstance(pl.STRICT_DEFAULT, bool)
                self.assertEqual(pl.lint_css(css, "swiss", False), [])
                self.assertEqual({f["code"] for f in pl.lint_css(css, "swiss", True)}, {"decor.strict-property"})


def rule_with(body: str) -> str:
    return '.cs-slide[data-preset="swiss"] .cs-kicker { ' + body + " }\n"


class VocabularyTests(unittest.TestCase):
    """IS-6: the classes E3 emits and primitives.css styles are allowed in a preset's selectors; a typo in a closed attribute value is not."""

    NEW_CLASSES = "cs-art cs-art-panel cs-art-svg cs-art-label cs-icon cs-items cs-item cs-rail cs-rail-seg cs-marks cs-thread cs-anchor-slot".split()

    def test_the_art_classes_and_cs_items_are_in_the_vocabulary(self) -> None:
        for cls in self.NEW_CLASSES:
            with self.subTest(cls=cls):
                css = '.cs-slide[data-preset="swiss"] .%s { gap: 8px; }\n' % cls
                self.assertEqual(pl.lint_css(css, "swiss"), [])

    def test_every_class_the_layout_sheet_emits_is_allowed(self) -> None:
        import re
        text = (SKILL / "templates" / "archetypes.html").read_text(encoding="utf-8")
        emitted = {c for attr in re.findall(r'class="([^"]*)"', text) for c in attr.split()}
        self.assertGreater(len(emitted), 30)
        self.assertEqual(sorted(c for c in emitted if c not in pl.CLASS_VOCABULARY and not pl.CLASS_PATTERN.match(c)), [])

    def test_text_bearing_art_classes_take_no_font_size(self) -> None:
        for cls in ("cs-art-label", "cs-item"):
            css = '.cs-slide[data-preset="swiss"] .%s { font-size: 40px; }\n' % cls
            self.assertIn("decor.font-size", {f["code"] for f in pl.lint_css(css, "swiss")}, cls)


class ToneShapeTests(unittest.TestCase):
    """The schema subset cannot say which array position holds a role and which a number; lint_tones does (hand-off from E1)."""

    GAP = ({"mix": [0.1, 0.2, 0.3]}, {"mix": ["bg", "ink", "bg"]}, {"mix": [0.5, "ink", "bg"]}, {"mix": ["ink", 0.5, "bg"]},
           {"lightness": [0.5, "ink"]}, {"lightness": ["ink", "bg"]}, {"pick": [3, 3]}, {"pick": [3, ["ink"]]}, {"pick": [["ink"], ["bg"]]})
    GOOD = ("bg", "accent2", "#CBA36B", {"mix": ["ink", "bg", 0]}, {"mix": ["accent", "ink", 1]}, {"mix": ["#CBA36B", "bg", 0.5]}, {"lightness": ["accent", 0.5]},
            {"muted": 4.7}, {"muted": 21}, {"pick": [["ink", "surface"], 3.0]}, {"pick": [["ink", "#FFFFFF", "bg", "accent"], 1]})
    BAD = ("nope", "", "ink2", "#CBA36", "#GGGGGG", "CBA36B", 3, None, {}, {"mix": ["ink", "bg"]}, {"mix": ["ink", "bg", 1.5]}, {"muted": 0.5}, {"muted": True}, {"pick": [[], 3]},
           {"pick": [["ink", "surface", "bg", "accent", "accent2"], 3]}, {"pick": [["ink"], 30]}, {"mix": ["ink", "bg", 0.1], "muted": 4.7},
           {"shade": 3}, ["ink"])

    def test_misplaced_positions_are_refused(self) -> None:
        for value in self.GAP:
            with self.subTest(value=value):
                self.assertNotEqual(pl.tone_shape_errors(value), [])

    def test_the_documented_shapes_are_accepted(self) -> None:
        for value in self.GOOD:
            with self.subTest(value=value):
                self.assertEqual(pl.tone_shape_errors(value), [])

    def test_everything_else_is_refused(self) -> None:
        for value in self.BAD:
            with self.subTest(value=value):
                self.assertNotEqual(pl.tone_shape_errors(value), [])

    def test_a_broken_tone_is_one_grammar_finding_per_problem(self) -> None:
        preset = rebuilt("swiss")
        preset["tones"]["field"]["roles"]["bg"] = {"mix": [0.5, "ink", "bg"]}
        del preset["tones"]["invert"]["roles"]["surface"]
        preset["tones"]["invert"]["roles"]["glow"] = "accent"
        found = [f for f in pl.lint_tones(preset) if f["code"] == "tones.grammar"]
        self.assertEqual(sorted(f["where"] for f in found), ["tones.field", "tones.invert", "tones.invert"])
        self.assertTrue(any("missing" in f["message"] for f in found) and any("glow" in f["message"] for f in found))


class ToneTableTests(unittest.TestCase):
    """Spec 6.0, "Tones: every role, every pair, verified": the table is the test vector (it is the output of 13-evidence/tone_contrast.py)."""

    @classmethod
    def setUpClass(cls) -> None:
        cls.spec = _load("spec-6.0.json")

    def ratio(self, a: str, b: str) -> float:
        return pl.color.contrast(a, b)

    def check_row(self, row: dict, bundle: dict, exact_accent: bool = True) -> None:
        roles = ("bg", "surface", "ink") + (("accent",) if exact_accent else ())
        self.assertEqual({k: bundle[k] for k in roles}, {k: row[k] for k in roles})
        # {muted} is searched in 0.1% steps by resolve.js (and here) and in 1% steps by tone_contrast.py, which printed the table: a few levels apart
        got, want = pl.color.parse(bundle["inkMuted"]), pl.color.parse(row["inkMuted"])
        self.assertLessEqual(max(abs(a - b) for a, b in zip(got, want)), 4, "%s/%s inkMuted %s, table %s" % (row["preset"], row["tone"], bundle["inkMuted"], row["inkMuted"]))
        # the table prints one decimal, half-way values were rounded up by hand (16.745 is printed 16.8): agree within one last digit
        near = lambda got, want: self.assertLessEqual(abs(got - want), 0.06, "%s/%s got %.3f, table %.1f" % (row["preset"], row["tone"], got, want))
        near(min(self.ratio(bundle["ink"], bundle["bg"]), self.ratio(bundle["ink"], bundle["surface"])), row["inkOnBoth"])
        expr = self.spec["presets"][row["preset"]]["tones"].get(row["tone"], {}).get("roles", {}).get("inkMuted")
        muted_min = min(self.ratio(bundle["inkMuted"], bundle["bg"]), self.ratio(bundle["inkMuted"], bundle["surface"]))
        if isinstance(expr, dict) and "muted" in expr:    # solved: never under the floor, and within a coarse step (1% against 0.1%) of the table's
            self.assertGreaterEqual(muted_min, expr["muted"] - 1e-9)
            self.assertLessEqual(abs(muted_min - row["mutedMin"]), 0.25)
        else:
            near(muted_min, row["mutedMin"])
        if exact_accent:
            near(self.ratio(bundle["onAccent"], bundle["accent"]), row["onAccent"])
            near(self.ratio(bundle["accent"], bundle["bg"]), row["graphicBg"])
            near(self.ratio(bundle["accent"], bundle["surface"]), row["graphicSurface"])

    def test_the_grammar_reproduces_every_expressible_row(self) -> None:
        seen = 0
        for row in self.spec["rows"]:
            if (row["preset"], row["tone"]) == ("heritage", "invert"):
                continue                      # a lightness the engine sets in OKLCH (below)
            with self.subTest(preset=row["preset"], tone=row["tone"]):
                bundle, problems = pl.resolve_tone(rebuilt(row["preset"]), row["tone"])
                self.assertEqual(problems, [])
                self.check_row(row, bundle)
                seen += 1
        self.assertEqual(seen, 17)

    def test_heritage_invert_sets_the_accent_by_oklch_lightness_and_clears_the_floors(self) -> None:
        """The table's #846635 comes from darkening in linear light to 4.6:1; the engine sets OKLCH lightness (L 0.5 is #845A00, 5.4:1)."""
        row = next(r for r in self.spec["rows"] if (r["preset"], r["tone"]) == ("heritage", "invert"))
        bundle, _ = pl.resolve_tone(rebuilt("heritage"), "invert")
        self.check_row(row, bundle, exact_accent=False)
        self.assertGreaterEqual(self.ratio(bundle["accent"], bundle["bg"]), 4.5)
        self.assertGreaterEqual(self.ratio(bundle["accent"], bundle["surface"]), 4.5)

    def test_hex_literals_read_like_roles(self) -> None:
        """notebook/field is a kraft cover (#CBA36B) with a deep red accent (#8E1F18): resolve.js ref() reads a #RRGGBB wherever a role may stand."""
        row = next(r for r in self.spec["rows"] if (r["preset"], r["tone"]) == ("notebook", "field"))
        bundle, problems = pl.resolve_tone(rebuilt("notebook"), "field")
        self.assertEqual(problems, [])
        self.assertEqual((bundle["bg"], bundle["accent"]), ("#CBA36B", "#8E1F18"))
        self.check_row(row, bundle)
        preset = rebuilt("swiss")
        preset["tones"]["field"]["roles"]["surface"] = {"mix": ["#000000", "#FFFFFF", 0.5]}
        self.assertEqual(pl.resolve_tone(preset, "field")[0]["surface"], pl.color.mix("#000000", "#FFFFFF", 0.5))

    def test_all_eighteen_rows_pass_every_pair_of_the_lint(self) -> None:
        for pid in ("swiss", "creator", "notebook", "poster", "interface", "heritage"):
            with self.subTest(preset=pid):
                preset = rebuilt(pid)
                self.assertEqual(pl.lint_tones(preset), [])
                self.assertEqual(pl.lint_graphics(preset), [])
                self.assertEqual(pl.lint_strict(preset), [])

    def test_a_bundle_has_all_eight_roles(self) -> None:
        for pid in ("swiss", "creator", "poster"):
            for tone, bundle in pl.resolve_tones(rebuilt(pid)).items():
                with self.subTest(preset=pid, tone=tone):
                    self.assertEqual(sorted(bundle), sorted(pl.BUNDLE_ROLES))
                    self.assertTrue(all(len(v) == 7 and v.startswith("#") for v in bundle.values()))
        self.assertEqual(sorted(pl.resolve_tones(rebuilt("swiss"))), ["base", "field", "invert"])

    def test_the_derived_roles_follow_the_resolver(self) -> None:
        bundle, _ = pl.resolve_tone(rebuilt("swiss"), "field")
        self.assertEqual(bundle["onAccent"], pl.color.on_color(bundle["accent"]))
        self.assertEqual(bundle["line"], pl.color.mix(bundle["ink"], bundle["bg"], 0.82))
        self.assertEqual(bundle["accent2"], "#E3262B", "accent2 is the preset's (its accent when it gives none), as resolve.js carries it into every tone")
        preset = rebuilt("swiss")
        preset["roles"]["accent2"] = "#0F766E"
        self.assertEqual(pl.resolve_tone(preset, "field")[0]["accent2"], "#0F766E")
        self.assertEqual(pl.resolve_tone(preset, "invert")[0]["accent2"], "#0F766E")

    def test_the_four_expressions_on_their_own(self) -> None:
        base = {"bg": "#FFFFFF", "surface": "#F0F0F0", "ink": "#000000", "inkMuted": "#555555", "accent": "#CC2222", "accent2": "#CC2222"}
        ev = lambda value, out=None: pl.eval_tone_value(value, base, out or {})  # noqa: E731
        self.assertEqual(ev("ink"), "#000000")
        self.assertEqual(ev({"mix": ["ink", "bg", 0]}), "#000000")
        self.assertEqual(ev({"mix": ["ink", "bg", 1]}), "#FFFFFF")
        self.assertEqual(ev({"mix": ["ink", "bg", 0.5]}), pl.color.mix("#000000", "#FFFFFF", 0.5))
        out = {"bg": "#000000", "surface": "#111111", "ink": "#FFFFFF"}
        muted = ev({"muted": 7}, out)
        self.assertGreaterEqual(min(self.ratio(muted, "#000000"), self.ratio(muted, "#111111")), 7)
        self.assertLess(self.ratio(muted, "#000000"), 21, "the most muted mix that still clears the floor, not the ink itself")
        self.assertGreater(self.ratio(pl.color.mix("#FFFFFF", "#000000", 0.001 * (round(pl.color.to_oklch(muted)[0] * 0) + 1) + 0.3), "#111111"), 1)
        self.assertEqual(ev({"muted": 21}, out), "#FFFFFF", "nothing clears 21:1 on the surface: the ink itself")
        self.assertEqual(ev({"pick": [["ink", "surface"], 3.0]}, {"bg": "#FFFFFF"}), "#000000")
        self.assertEqual(ev({"pick": [["bg", "ink"], 3.0]}, {"bg": "#FFFFFF"}), "#000000", "bg is 1:1 with itself, ink is the first that reaches 3")
        self.assertEqual(ev({"pick": [["bg", "surface"], 3.0]}, {"bg": "#FFFFFF"}), "#F0F0F0", "none reaches the floor: the LAST candidate, as resolve.js falls back (v.pick[0].slice(-1)[0])")
        lightness = ev({"lightness": ["accent", 0.4]})
        self.assertAlmostEqual(pl.color.to_oklch(lightness)[0], 0.4, delta=0.01)
        self.assertAlmostEqual(pl.color.to_oklch(lightness)[2], pl.color.to_oklch("#CC2222")[2], delta=3)


class TonePairTests(unittest.TestCase):
    """lint_tones on planted tones: the pair, the tone and the chrome that reads it are named."""

    def lint(self, preset: dict) -> set:
        return where_codes(pl.lint_tones(preset))

    def test_a_tone_whose_ink_matches_its_ground_fails_with_the_chrome_named(self) -> None:
        preset = rebuilt("swiss")
        preset["tones"]["invert"]["roles"]["ink"] = "ink"
        found = {(f["code"], f["where"]): f["message"] for f in pl.lint_tones(preset)}
        self.assertIn(("tones.text", "invert: ink on bg"), found)
        self.assertIn("chrome: handle and save pill", found[("tones.text", "invert: ink on bg")])
        self.assertIn(("tones.text", "invert: inkMuted on bg"), self.lint(preset), "inkMuted is the muted mix of that same ink")
        self.assertIn("meta, counter and swipe", next(f["message"] for f in pl.lint_tones(preset) if f["where"] == "invert: inkMuted on bg"))
        self.assertFalse({w for c, w in self.lint(preset) if w.startswith("field")})

    def test_the_surface_pairs_are_checked(self) -> None:
        preset = rebuilt("swiss")
        preset["tones"]["invert"]["roles"]["surface"] = "bg"            # a light card on a dark ground, with light ink on it
        found = self.lint(preset)
        self.assertEqual({w for c, w in found}, {"invert: ink on surface", "invert: inkMuted on surface"})

    def test_on_accent_must_reach_the_floor(self) -> None:
        preset = rebuilt("swiss")
        preset["roles"]["accent"] = "#777777"                          # neither black nor white reads on mid grey (4.1 and 4.5)
        preset["tones"]["field"]["roles"]["bg"] = "accent"
        found = self.lint(preset)
        self.assertIn(("tones.on-accent", "invert: onAccent on accent"), found)
        message = next(f["message"] for f in pl.lint_tones(preset) if f["code"] == "tones.on-accent")
        self.assertIn("below the floor 4.5:1", message)
        self.assertIn("accent chips", message)

    def test_g5_holds_a_text_accent_to_4_5_on_both_grounds_in_every_tone(self) -> None:
        preset = rebuilt("poster")
        preset["tones"]["invert"]["roles"]["accent"] = "accent"        # the rust on the green: about 2:1
        found = self.lint(preset)
        self.assertEqual({w for c, w in found if c == "graphics.highlight"}, {"invert: accent on bg", "invert: accent on surface"})
        preset["decor"]["highlight"] = "marker"                       # the accent no longer colours text: G5 does not apply
        self.assertFalse({w for c, w in self.lint(preset) if c == "graphics.highlight"})

    def test_the_floors_come_from_the_preset(self) -> None:
        preset = rebuilt("swiss")
        self.assertEqual(self.lint(preset), set())
        preset["floors"]["contrastBody"] = 7
        self.assertIn(("tones.text", "invert: inkMuted on surface"), self.lint(preset))

    def test_a_preset_without_tones_or_art_is_left_alone(self) -> None:
        for pid in ("swiss", "creator", "poster"):
            self.assertEqual(pl.lint_tones(legacy(pid)), [])
            self.assertEqual(pl.lint_graphics(legacy(pid)), [])
            self.assertEqual(pl.lint_background(legacy(pid)), [])


class GraphicRuleTests(unittest.TestCase):
    """Spec 6.0, the graphic floor is a boundary rule: G1-G6."""

    def lint(self, preset: dict, **kw) -> set:
        return where_codes(pl.lint_graphics(preset, **kw))

    def codes(self, preset: dict, **kw) -> set:
        return {c for c, _ in self.lint(preset, **kw)}

    def test_g1_creator_yellow_at_1_3_passes_through_its_4_px_ink_outline(self) -> None:
        creator = rebuilt("creator")
        self.assertAlmostEqual(pl.color.contrast("#FFD23F", "#F6F2EA"), 1.29, places=2)
        self.assertEqual(pl.lint_graphics(creator), [])
        self.assertEqual(pl.lint_tones(creator), [])

    def test_g2_without_the_outline_the_same_yellow_fails_on_every_ground(self) -> None:
        found = self.lint(rebuilt("creator", mark="fill", outline=0))
        self.assertTrue({("graphics.fill", "base: accent on bg"), ("graphics.fill", "base: accent on surface"), ("graphics.fill", "field: accent on bg"),
                         ("graphics.fill", "field: accent on surface"), ("graphics.fill", "base: support 1 on bg"), ("graphics.fill", "base: support 2 on surface")} <= found)
        self.assertFalse({w for c, w in found if w.startswith("invert")}, "yellow on charcoal is 12:1")

    def test_g1_a_mark_outline_needs_at_least_3_px(self) -> None:
        found = self.lint(rebuilt("creator", outline=2))
        self.assertIn(("graphics.mark", "art.mark"), found)
        self.assertIn(("graphics.fill", "base: accent on bg"), found, "a thin outline does not carry the boundary")
        self.assertNotIn("graphics.mark", self.codes(rebuilt("creator", outline=3)))

    def test_g1_the_outline_itself_is_3_to_1_against_the_ground(self) -> None:
        found = self.lint(rebuilt("creator", outlineColor="#F0E8D0"))
        self.assertEqual({w for c, w in found if c == "graphics.outline"}, {"base: outline on bg", "base: outline on surface", "field: outline on bg", "field: outline on surface"})
        self.assertEqual(self.codes(rebuilt("creator", outlineColor="ink")), set())

    def test_g1_g2_notebook_amber_is_met_by_its_pen_outline(self) -> None:
        notebook = rebuilt("notebook")
        self.assertLess(pl.color.contrast("#F4B63F", "#F6F0DF"), 3)
        self.assertEqual(pl.lint_graphics(notebook), [])
        self.assertIn(("graphics.fill", "base: support 2 on bg"), self.lint(rebuilt("notebook", mark="fill", outline=0)))

    def creator(self, **fills) -> dict:
        """The rebuilt creator with `fills` declared on top of the fixture's own (fills.giant = surface: see the fixture's about)."""
        preset = rebuilt("creator")
        preset["art"]["fills"] = {**preset["art"]["fills"], **fills}
        return preset

    def test_g3_a_glyph_on_a_filled_tile_reaches_4_5(self) -> None:
        found = self.lint(self.creator(chip="#777777"))
        self.assertEqual({w for c, w in found if c == "graphics.glyph"}, {"base: art.fills.chip", "invert: art.fills.chip", "field: art.fills.chip"})
        for fill in ("accent", "ink", "bg", "surface", "#0F766E"):
            self.assertEqual({c for c, _ in self.lint(self.creator(chip=fill))} - {"graphics.support-glyph"}, set(), fill)

    def test_g3_bare_and_ring_have_no_plate_to_check(self) -> None:
        self.assertEqual(self.lint(self.creator(ring="#777777", bare="#777777")), set())
        self.assertIsNone(pl.plate_pair("ring", {"fills": {"ring": "#777777"}}, pl.resolve_tones(rebuilt("creator"))["base"], ["#FF8FB1", "#6EC6FF"], "#FFF3C4"))
        self.assertIsNone(pl.plate_pair("bare", {}, pl.resolve_tones(rebuilt("creator"))["base"], ["#FF8FB1", "#6EC6FF"], "#FFF3C4"))

    def test_g3_duo_and_giant_draw_their_glyph_in_ink_and_are_checked_like_the_rest(self) -> None:
        """The review's probe: creator giant #777777 is 4.18:1 for the base ink; the old lint skipped duo and giant, so it said nothing."""
        tones = pl.resolve_tones(rebuilt("creator"))
        self.assertAlmostEqual(pl.color.contrast(tones["base"]["ink"], "#777777"), 4.18, places=2)
        self.assertAlmostEqual(pl.color.contrast(tones["invert"]["ink"], "#777777"), 4.01, places=2)
        for treatment in ("giant", "duo"):
            with self.subTest(treatment=treatment):
                found = self.lint(self.creator(**{treatment: "#777777"}))
                self.assertEqual(found, {("graphics.glyph", "%s: art.fills.%s" % (tone, treatment)) for tone in ("base", "invert", "field")})
                for fill in ("tint", "surface", "bg"):
                    self.assertEqual(self.lint(self.creator(**{treatment: fill})), set(), fill)
                self.assertEqual({w for c, w in self.lint(self.creator(**{treatment: "ink"}))}, {"%s: art.fills.%s" % (t, treatment) for t in ("base", "invert", "field")}, "ink on ink")

    def test_g3_the_accent_plate_fails_where_the_ink_is_light(self) -> None:
        """An accent plate is the on-colour's for a chip and the ink's for a giant: creator's yellow is fine for the first and 1.29:1 for the second in the invert tone."""
        self.assertAlmostEqual(pl.color.contrast("#F6F2EA", "#FFD23F"), 1.29, places=2)
        self.assertEqual(self.lint(self.creator(chip="accent", tile="accent", sticker="accent", badge="accent")), set())
        for treatment in ("giant", "duo"):
            self.assertEqual(self.lint(self.creator(**{treatment: "accent"})), {("graphics.glyph", "invert: art.fills.%s" % treatment)}, treatment)

    def test_g3_the_default_plate_is_checked_too_and_the_message_says_what_to_declare(self) -> None:
        """An outlined disc makes the kit's default giant plate the accent (kit.frame); the finding is the creator's, and declaring fills.giant (a role the schema accepts) clears it."""
        preset = rebuilt("creator")
        del preset["art"]["fills"]
        found = pl.lint_graphics(preset)
        self.assertEqual(where_codes(found), {("graphics.glyph", "invert: giant (default accent)")})
        self.assertIn("declare art.fills.giant", found[0]["message"])
        self.assertEqual(pl.lint_graphics(rebuilt("creator")), [])
        for pid in ("swiss", "notebook", "poster", "interface", "heritage"):
            self.assertEqual(pl.lint_graphics(rebuilt(pid)), [], pid)

    def test_the_container_defaults_follow_the_kit(self) -> None:
        bundle, support, tint = pl.resolve_tones(rebuilt("swiss"))["base"], ["#1D4ED8", "#0F766E"], "#F5D0D0"
        ref = lambda treatment, **art: pl.plate_pair(treatment, art, bundle, support, tint)[3]
        for treatment in ("chip", "sticker", "giant"):
            self.assertEqual(ref(treatment, container="disc", mark="outline"), "accent", treatment)
            self.assertEqual(ref(treatment, container="disc", mark="fill"), "tint", treatment)
            self.assertEqual(ref(treatment, container="stamp", mark="outline"), "tint", treatment)
        self.assertEqual(ref("tile"), "ink")
        self.assertEqual(ref("tile", container="square"), "ink")
        self.assertEqual(ref("tile", container="disc", mark="outline"), "accent")
        self.assertEqual((ref("duo", container="disc", mark="outline"), ref("badge", container="square")), ("tint", "accent"))
        self.assertEqual(ref("chip", fills={"chip": "support2"}), "support2")

    def test_g4_adjacent_chart_marks_are_3_to_1_apart_or_separated(self) -> None:
        """The separation is an input (see ChartSeparationTests for where its value comes from): below the 3 px of G4 the unseparated pairs fail."""
        swiss = rebuilt("swiss")
        self.assertEqual(self.lint(swiss), set())
        self.assertEqual(self.lint(swiss, chart_gap=pl.CHART_GAP_MIN_PX), set())
        self.assertEqual(self.lint(swiss, chart_gap=0), {("graphics.chart", "accent next to support 1"), ("graphics.chart", "support 1 next to support 2")})
        self.assertEqual(self.lint(swiss, chart_gap=2.5), self.lint(swiss, chart_gap=0))
        self.assertEqual(self.lint(rebuilt("creator"), chart_gap=0), set(), "the 4 px outline separates every mark")

    def test_g6_support_1_never_carries_a_glyph(self) -> None:
        self.assertAlmostEqual(pl.color.contrast("#A8741A", "#FBF6E9"), 3.76, places=2)      # a mark can use ochre, a glyph cannot
        for treatment in ("chip", "tile", "sticker", "badge"):
            found = self.lint(rebuilt("poster", fills={treatment: "#A8741A"}))
            self.assertEqual({w for c, w in found if c == "graphics.support-glyph"}, {"base: art.fills." + treatment, "invert: art.fills." + treatment, "field: art.fills." + treatment})
        self.assertEqual(self.lint(rebuilt("poster", fills={"chip": "accent"})), set(), "S-8: poster chips use rust")
        self.assertEqual(self.lint(rebuilt("poster", fills={"chip": "#3A6EA5"})), set(), "support 2 may: white on print blue is 5.2:1")

    def test_g6_duo_and_giant_on_ochre_carry_a_glyph_on_support_1_and_it_does_not_read(self) -> None:
        """The review's probe: poster giant and duo on #A8741A put the dark-green ink on ochre at 2.73:1 (and a glyph on support 1); the old lint skipped both."""
        tones = pl.resolve_tones(rebuilt("poster"))
        self.assertAlmostEqual(pl.color.contrast(tones["base"]["ink"], "#A8741A"), 2.73, places=2)
        for treatment in ("giant", "duo"):
            for ref in ("#A8741A", "support1"):
                with self.subTest(treatment=treatment, fill=ref):
                    found = self.lint(rebuilt("poster", fills={treatment: ref}))
                    here = {"%s: art.fills.%s" % (tone, treatment) for tone in ("base", "invert", "field")}
                    self.assertEqual(found, {("graphics.support-glyph", w) for w in here} | {("graphics.glyph", w) for w in here})
            self.assertEqual(self.lint(rebuilt("poster", fills={treatment: "surface"})), set(), "S-8 and G3: the paper plate reads with ink")
            self.assertEqual({c for c, _ in self.lint(rebuilt("poster", fills={treatment: "#3A6EA5"}))}, {"graphics.glyph"}, "support 2 is allowed a glyph, but ink on print blue is not 4.5:1")

    def test_g6_bare_and_ring_icons_may_use_support_1(self) -> None:
        self.assertEqual(self.lint(rebuilt("poster", fills={"ring": "#A8741A", "bare": "#A8741A"})), set())

    def test_object_outline_is_3_to_4_percent(self) -> None:
        for good in (0.03, 0.035, 0.04):
            self.assertEqual(self.lint(rebuilt("swiss", objectOutline=good)), set(), good)
        for bad in (0.0299, 0.0401, 0.05, 0, "0.035", None, True):
            self.assertIn(("art.object-outline", "art.objectOutline"), self.lint(rebuilt("swiss", objectOutline=bad)), bad)

    def test_the_kit_ignores_an_unknown_treatment_so_the_lint_says_so(self) -> None:
        found = pl.lint_graphics(rebuilt("swiss", fills={"chips": "accent"}))
        self.assertEqual([(f["sev"], f["code"]) for f in found], [("WARN", "art.fills-key")])

    def test_support_hues_are_checked_on_the_base_grounds_only(self) -> None:
        heritage = rebuilt("heritage")
        self.assertEqual(pl.lint_graphics(heritage), [])
        heritage["art"]["colors"]["support"] = ["#1F5A47", "#7DB0DE"]          # support 1 equals the dark surface
        self.assertIn(("graphics.fill", "base: support 1 on surface"), self.lint(heritage))
        self.assertFalse({w for c, w in self.lint(heritage) if not w.startswith("base")})


class FixtureSchemaTests(unittest.TestCase):
    """The rebuilt presets the graphic tests lint are what a PR package could actually ship: the preset schema accepts them (art.fills takes role names and hex, not the kit's
    tint, support or note references). The one known gap is notebook's field tone, which writes #RRGGBB where the schema wants a role (see the fixture's about)."""

    KNOWN_GAP = {"/tones/field/roles/accent", "/tones/field/roles/bg"}

    def test_the_rebuilt_presets_are_schema_valid(self) -> None:
        for pid in pl.V1_PRESETS:
            errors = {e["path"] for e in pl.schema.validate_named("preset", rebuilt(pid))}
            with self.subTest(preset=pid):
                self.assertLessEqual(errors, self.KNOWN_GAP if pid == "notebook" else set())


class BackgroundTests(unittest.TestCase):
    """A gradient's stops are role names or hex colours (the resolver paints the bg colour for anything else) and the text reads on all of them."""

    def preset(self, stops, kind="gradient", **params) -> dict:
        preset = shipped("swiss")
        preset["background"] = {"kind": kind, "params": {"angle": 160, "stops": stops, **params} if kind == "gradient" else params}
        return preset

    def test_the_shipped_gradient_is_fine(self) -> None:
        self.assertEqual(pl.lint_background(shipped("heritage")), [])

    def test_role_names_and_hex_are_fine(self) -> None:
        self.assertEqual(pl.lint_background(self.preset([["bg", 0], ["#FFFFFF", 50], ["#fff", 100], ["surface", 100]])), [])

    def test_a_name_or_a_function_is_silently_replaced_by_bg(self) -> None:
        found = pl.lint_background(self.preset([["red", 0], ["hsl(10 50% 50%)", 40], [None, 60], ["bg", 100], ["#12", 100]]))
        self.assertEqual([f["where"] for f in found if f["code"] == "background.stop"], ["background.params.stops[%d]" % i for i in (0, 1, 2, 4)])

    def test_the_text_colours_must_read_on_every_stop(self) -> None:
        found = pl.lint_background(self.preset([["bg", 0], ["#222222", 100]]))
        self.assertEqual({(f["sev"], f["where"]) for f in found}, {("ERROR", "ink on background stop 2"), ("ERROR", "inkMuted on background stop 2")})

    def test_a_solid_role_that_is_not_bg_is_checked(self) -> None:
        self.assertEqual(pl.lint_background(self.preset(None, kind="solid", role="surface")), [])
        found = pl.lint_background(self.preset(None, kind="solid", role="ink"))
        self.assertTrue(found and all(f["where"].endswith("background role") for f in found))
        found = pl.lint_background(self.preset(None, kind="paper", role="nope"))
        self.assertEqual([f["code"] for f in found], ["background.stop"])


class VariantTests(unittest.TestCase):
    """`variants` stays within what archetypes.html offers, the staged variants of the wave-2 slice included (r2 3.1)."""

    STAGED = {"stat": ["icon", "chart"], "compare": ["table", "before-after"], "quote": ["statement"], "rehook": ["statement"], "step": ["track"],
              "cta": ["action"], "item": ["numeral"], "grid": ["bento"], "timeline": ["rail"]}

    @classmethod
    def setUpClass(cls) -> None:
        cls.offered = pl.archetype_variants(SKILL / "templates" / "archetypes.html")

    def test_the_staged_variants_are_offered(self) -> None:
        for typ, flags in self.STAGED.items():
            for flag in flags:
                self.assertIn(flag, self.offered[typ], "%s:%s" % (typ, flag))
        self.assertEqual(pl.lint_variants_chrome({"variants": self.STAGED}, self.offered), [])

    def test_a_variant_the_archetype_does_not_offer_is_an_error(self) -> None:
        found = pl.lint_variants_chrome({"variants": {"stat": ["icon", "tiles"], "quote": ["bubble"], "poster": ["half"], "nope": ["x"]}}, self.offered)
        self.assertEqual({(f["code"], f["where"]) for f in found}, {("variants.flag", "stat/tiles"), ("variants.flag", "quote/bubble"), ("variants.flag", "poster/half"), ("variants.type", "nope")})

    def test_the_shipped_presets_stay_within_the_offer(self) -> None:
        for pid in ("swiss", "creator", "notebook", "poster", "interface", "heritage"):
            self.assertEqual(pl.lint_variants_chrome(shipped(pid), self.offered), [], pid)


class StrictRequirementTests(unittest.TestCase):
    def test_a_rebuilt_preset_meets_them(self) -> None:
        self.assertEqual(pl.lint_strict(rebuilt("poster")), [])

    def test_each_missing_piece_is_named(self) -> None:
        self.assertEqual({f["code"] for f in pl.lint_strict(legacy("poster"))}, {"strict.art", "strict.tones"})
        preset = rebuilt("poster")
        del preset["tones"]["field"]
        del preset["art"]["colors"]["support"]
        self.assertEqual({(f["code"], f["where"]) for f in pl.lint_strict(preset)}, {("strict.tones", "tones.field"), ("strict.support", "art.colors.support")})
        preset["art"]["colors"]["support"] = ["#3A6EA5"]
        self.assertIn("strict.support", {f["code"] for f in pl.lint_strict(preset)})


class StrictCliTests(unittest.TestCase):
    """A rebuilt preset end to end: the schema, the fonts, the variants, the tones, the graphics and decor.css in one run."""

    CLEAN = ('{S} .cs-art-panel { border: 4px solid var(--cs-ink); box-shadow: 8px 8px 0 var(--cs-ink); }\n'
             '{S} .cs-items .cs-item { background-image: linear-gradient(to bottom, var(--cs-scrim-to) 0%, var(--cs-accent) 100%); }\n'
             '{S}[data-tone="field"] .cs-rail-seg { background-color: var(--cs-line); }\n')

    def setUp(self) -> None:
        self.tmp = Path(tempfile.mkdtemp(prefix="cs-strict-"))
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)
        self.styles = self.tmp / "styles"

    def make(self, preset: dict | None = None, decor: str | None = None) -> Path:
        folder = self.styles / "swiss"
        folder.mkdir(parents=True, exist_ok=True)
        preset = preset or rebuilt("swiss")
        (folder / "preset.json").write_text(json.dumps(preset, ensure_ascii=False, indent=2), encoding="utf-8")
        (folder / "decor.css").write_text((self.CLEAN if decor is None else decor).replace("{S}", '.cs-slide[data-preset="swiss"]'), encoding="utf-8")
        (self.styles / "index.json").write_text(json.dumps({"schemaVersion": 1, "version": "1.1.0", "default": "swiss", "presets": [{"id": "swiss", "preview": None}]}), encoding="utf-8")
        return folder

    def lint(self, *flags: str) -> tuple[int, dict]:
        res = run_cli("--preset", str(self.styles / "swiss"), "--styles", str(self.styles), "--format", "json", *flags)
        return res.returncode, json.loads(res.stdout)

    def codes(self, data: dict) -> set:
        return {f["code"] for f in data["results"]["swiss"]}

    def test_a_clean_rebuilt_preset_passes_strict(self) -> None:
        self.make()
        code, data = self.lint("--strict")
        self.assertEqual((code, data["errors"], data["warnings"], data["strict"]), (0, 0, 0, True), data["results"])

    def test_the_legacy_look_is_not_held_to_strict_until_it_is_rebuilt(self) -> None:
        self.make(preset=legacy("swiss"), decor='{S} .cs-kicker { outline: 2px solid var(--cs-ink); color: color-mix(in srgb, var(--cs-ink) 14%, var(--cs-bg)); }\n')
        code, data = self.lint("--no-strict")
        self.assertEqual((code, data["strict"]), (0, False))
        code, data = self.lint("--strict")
        self.assertEqual(code, 2)
        self.assertTrue({"decor.strict-property", "decor.color-mix", "strict.art", "strict.tones"} <= self.codes(data))

    def test_each_planted_defect_is_found_in_the_full_run(self) -> None:
        def with_(**art):
            return rebuilt("swiss", **art)
        broken_tone = rebuilt("swiss")
        broken_tone["tones"]["invert"]["roles"]["ink"] = "ink"
        cases = [
            ("decor.strict-property", dict(decor=self.CLEAN + '{S} .cs-kicker { outline: 1px solid var(--cs-ink); }\n')),
            ("decor.color-mix", dict(decor=self.CLEAN + '{S} .cs-meta { color: color-mix(in srgb, var(--cs-ink) 14%, var(--cs-bg)); }\n')),
            ("decor.paint-colour", dict(decor=self.CLEAN + '{S} .cs-art-panel { box-shadow: 0 4px 0 black; }\n')),
            ("decor.inset-shadow", dict(decor=self.CLEAN + '{S} .cs-art-panel { box-shadow: inset 0 0 0 3px var(--cs-bg); }\n')),
            ("decor.conic-gradient", dict(decor=self.CLEAN + '{S} .cs-art-panel { background-image: conic-gradient(var(--cs-bg), var(--cs-ink)); }\n')),
            ("decor.clip-path", dict(decor=self.CLEAN + '{S} .cs-art-panel { clip-path: polygon(0 0, 100% 0, 50% 100%); }\n')),
            ("decor.size", dict(decor=self.CLEAN + '{S} .cs-kicker { color: var(--cs-ink); }\n' * 700)),
            ("decor.transform-3d", dict(decor=self.CLEAN + '{S} .cs-art-panel { --cs-turn: rotateX(30deg); transform: var(--cs-turn); }\n')),
            ("decor.paint-colour", dict(decor=self.CLEAN + '{S} .cs-art-panel { --cs-shadow: 0 6px 0 red; box-shadow: var(--cs-shadow); }\n')),
            ("decor.paint-colour", dict(decor=self.CLEAN + '{S} .cs-art-panel { box-shadow: 0 6px 0 var(--cs-missing, red); }\n')),
            ("tones.text", dict(preset=broken_tone)),
            ("graphics.mark", dict(preset=with_(mark="outline", outline=2))),
            ("graphics.support-glyph", dict(preset=with_(fills={"tile": "#1D4ED8"}))),
            ("graphics.glyph", dict(preset=with_(fills={"chip": "#777777"}))),
            ("graphics.glyph", dict(preset=with_(fills={"giant": "#777777"}))),
            ("graphics.glyph", dict(preset=with_(fills={"duo": "#777777"}))),
            ("art.object-outline", dict(preset=with_(objectOutline=0.06))),
        ]
        for code, kwargs in cases:
            with self.subTest(code=code):
                self.make(**kwargs)
                result, data = self.lint("--strict")
                self.assertEqual(result, 2)
                self.assertIn(code, self.codes(data))
        # the size is a strict-only finding: the same sheet passes the loose 64 KiB limit
        self.make(decor=[c for code, c in cases if code == "decor.size"][0]["decor"])
        self.assertNotIn("decor.size", self.codes(self.lint("--no-strict")[1]))

    def main(self, *flags: str) -> int:
        with contextlib.redirect_stdout(io.StringIO()):
            return pl.main(["--preset", str(self.styles / "swiss"), "--styles", str(self.styles), *flags])

    def test_both_defaults_behave_and_the_flags_win_over_either(self) -> None:
        """The beat flips STRICT_DEFAULT with one line (IB3): a legacy look fails under the flipped default, passes with --no-strict; a rebuilt look passes under both."""
        legacy_look, rebuilt_look = self.tmp / "legacy", self.tmp / "rebuilt"
        for folder, preset in ((legacy_look, legacy("swiss")), (rebuilt_look, rebuilt("swiss"))):
            self.styles = folder / "styles"
            self.make(preset=preset, decor='{S} .cs-kicker { outline: 2px solid var(--cs-ink); }\n' if folder is legacy_look else None)
        expected = {  # (default, flag) -> exit code of the legacy look, of the rebuilt look
            (False, None): (0, 0), (False, "--strict"): (2, 0), (False, "--no-strict"): (0, 0),
            (True, None): (2, 0), (True, "--strict"): (2, 0), (True, "--no-strict"): (0, 0),
        }
        for (default, flag), (want_legacy, want_rebuilt) in expected.items():
            for name, folder, want in (("legacy", legacy_look, want_legacy), ("rebuilt", rebuilt_look, want_rebuilt)):
                with self.subTest(default=default, flag=flag, look=name), FlippedDefault(default):
                    self.styles = folder / "styles"
                    self.assertEqual(self.main(*([flag] if flag else [])), want)

    def test_the_json_report_names_the_mode_that_ran(self) -> None:
        self.make(preset=legacy("swiss"), decor='{S} .cs-kicker { color: var(--cs-ink); }\n')
        for default in (False, True):
            with FlippedDefault(default):
                for flag, strict in ((None, default), ("--strict", True), ("--no-strict", False)):
                    out = io.StringIO()
                    with contextlib.redirect_stdout(out):
                        pl.main(["--preset", str(self.styles / "swiss"), "--styles", str(self.styles), "--format", "json", *([flag] if flag else [])])
                    self.assertIs(json.loads(out.getvalue())["strict"], strict, (default, flag))

    def test_strict_and_no_strict_cannot_be_combined(self) -> None:
        res = run_cli("--all", "--strict", "--no-strict")
        self.assertEqual(res.returncode, 64)

    def test_the_schema_still_judges_the_art_block(self) -> None:
        preset = rebuilt("swiss", objectOutline=0.05)
        self.make(preset=preset)
        code, data = self.lint("--strict")
        self.assertEqual(code, 2)
        self.assertTrue({"schema", "art.object-outline"} <= self.codes(data), self.codes(data))


@unittest.skipUnless(NODE, "node is needed for the replay probe")
class ReplayPainterTests(unittest.TestCase):
    """Rule A6: what the replay painter refuses, the strict lint refuses, and what it draws the lint lets through. The painter's own check (replaySupportCheck in
    src/paint/replay.js, run by tests/preset-lint/replay-probe.mjs on planted computed styles) is the reference; the planted css cases state the computed style a
    browser reports for them."""

    @classmethod
    def setUpClass(cls) -> None:
        cls.cases = [c for c in _load("decor-cases.json")["cases"] if "replay" in c]
        out = run_node("replay-probe.mjs", {"cases": [{"id": c["name"], **c["replay"]} for c in cls.cases]})
        cls.flags, cls.raised = out["flags"], {r["id"]: r["unsupported"] for r in out["results"]}

    @staticmethod
    def code_of(flag: str) -> str:
        return pl.REPLAY_STRICT[flag][0] if flag in pl.REPLAY_STRICT else "decor.forbidden-property"

    def test_the_planted_computed_styles_raise_the_flags_the_fixture_states(self) -> None:
        for case in self.cases:
            with self.subTest(case=case["name"]):
                self.assertEqual(self.raised[case["name"]], sorted(case["replay"]["flags"]))

    def test_the_strict_lint_refuses_exactly_what_the_painter_refuses(self) -> None:
        replay_codes = {code for code, _ in pl.REPLAY_STRICT.values()} | {"decor.forbidden-property"}
        for case in self.cases:
            css = case["css"].replace("{S}", '.cs-slide[data-preset="swiss"]')
            want = {self.code_of(flag) for flag in self.raised[case["name"]]}
            with self.subTest(case=case["name"]):
                self.assertEqual({f["code"] for f in pl.lint_css(css, "swiss", True)} & replay_codes, want)

    def test_the_loose_lint_keeps_passing_what_it_always_passed(self) -> None:
        """Only the properties the painter can never draw are errors in every mode; the strict-only constructs are not (the legacy presets pass as they are)."""
        for case in self.cases:
            css = case["css"].replace("{S}", '.cs-slide[data-preset="swiss"]')
            loose = {f["code"] for f in pl.lint_css(css, "swiss", False)}
            with self.subTest(case=case["name"]):
                self.assertEqual(loose & {code for code, _ in pl.REPLAY_STRICT.values()}, set())
                self.assertEqual("decor.forbidden-property" in loose, any(flag in pl.REPLAY_FORBIDDEN_FLAGS for flag in self.raised[case["name"]]))

    def test_every_flag_of_the_painter_has_a_lint_code_and_a_planted_case(self) -> None:
        """A flag added to replaySupportCheck tomorrow fails here until the lint maps it and a case plants it."""
        self.assertEqual(set(self.flags), set(pl.REPLAY_FORBIDDEN_FLAGS) | set(pl.REPLAY_STRICT))
        planted = {flag for case in self.cases for flag in case["replay"]["flags"]}
        self.assertEqual(set(self.flags) - planted, set())

    def test_the_review_constructs_are_strict_errors(self) -> None:
        """The two the review ran through the real check: an inset shadow and a conic gradient."""
        for css, code in (("box-shadow: inset 0 0 0 3px var(--cs-bg);", "decor.inset-shadow"), ("background-image: conic-gradient(var(--cs-bg), var(--cs-ink));", "decor.conic-gradient")):
            self.assertEqual({f["code"] for f in pl.lint_css(rule_with(css), "swiss", True)}, {code}, css)
            self.assertEqual(pl.lint_css(rule_with(css), "swiss", False), [], css)


@unittest.skipUnless(NODE, "node is needed for the kit probe")
class KitPairTests(unittest.TestCase):
    """G3 and G6 read the plate and the glyph colour the renderer really draws. plate_pair is compared with the real kit.frame (src/art/kit.js, run by
    tests/preset-lint/kit-pairs.mjs) for the six presets, their three tones, every plate treatment, every kind of fill reference and the container defaults."""

    REFS = (None, "accent", "ink", "bg", "surface", "inkMuted", "accent2", "tint", "note", "paper", "support1", "support2", "#777777", "#A8741A")
    DNAS = (None, {"container": "disc", "mark": "outline"}, {"container": "square"}, {"container": "disc", "mark": "fill"}, {"container": "stamp", "mark": "outline"})

    def test_plate_pair_equals_the_kit_for_every_case(self) -> None:
        cases, expected = [], {}
        for pid in ("swiss", "creator", "notebook", "poster", "interface", "heritage"):
            preset = rebuilt(pid)
            support, note = [pl._hex(c) for c in preset["art"]["colors"]["support"]], pl._hex(preset["art"]["colors"]["note"])
            for tone, bundle in pl.resolve_tones(preset).items():
                tint = pl.tint_of(bundle)
                tokens = {**bundle, "support": support, "note": note}
                for dna in self.DNAS:
                    for treatment in pl.GLYPH_TREATMENTS:
                        for ref in self.REFS:
                            art = {**preset["art"], **(dna or {}), "fills": {treatment: ref} if ref else {}}
                            key = "%s|%s|%s|%s|%s" % (pid, tone, json.dumps(dna, sort_keys=True), treatment, ref)
                            cases.append({"id": key, "treatment": treatment, "art": art, "tokens": tokens})
                            expected[key] = pl.plate_pair(treatment, art, bundle, support, tint, note)
        self.assertGreater(len(cases), 7000)
        drawn = {r["id"]: (r["fill"], r["glyph"]) for r in run_node("kit-pairs.mjs", {"cases": cases})}
        self.assertEqual(len(drawn), len(cases))
        wrong = [(k, expected[k][:2], drawn[k]) for k in drawn if expected[k] is None or (expected[k][0].upper(), expected[k][1].upper()) != (drawn[k][0].upper(), drawn[k][1].upper())]
        self.assertEqual(wrong[:5], [], "%d of %d plates differ from the kit" % (len(wrong), len(cases)))

    def test_the_ink_glyph_treatments_are_the_ones_the_kit_draws_in_ink(self) -> None:
        """INK_GLYPH_TREATMENTS is read off the kit: on an accent plate duo and giant keep the tone's ink, the other four take the accent's on-colour."""
        preset = rebuilt("swiss")
        bundle, support = pl.resolve_tones(preset)["base"], [pl._hex(c) for c in preset["art"]["colors"]["support"]]
        tokens = {**bundle, "support": support, "note": preset["art"]["colors"]["note"]}
        self.assertNotEqual(bundle["ink"], bundle["onAccent"])
        cases = [{"id": tr, "treatment": tr, "art": {**preset["art"], "fills": {tr: "accent"}}, "tokens": tokens} for tr in pl.GLYPH_TREATMENTS]
        glyph = {r["id"]: r["glyph"].upper() for r in run_node("kit-pairs.mjs", {"cases": cases})}
        self.assertEqual({tr for tr, colour in glyph.items() if colour == bundle["ink"].upper()}, set(pl.INK_GLYPH_TREATMENTS))
        self.assertEqual({tr for tr, colour in glyph.items() if colour == bundle["onAccent"].upper()}, set(pl.GLYPH_TREATMENTS) - set(pl.INK_GLYPH_TREATMENTS))


@unittest.skipUnless(NODE, "node is needed for the chart probe")
class ChartSeparationTests(unittest.TestCase):
    """G4 is a promise the chart builders make (a gap between neighbouring marks). The lint's figure is a named contract shared as data
    (tests/preset-lint/chart-separation.json), reachable from the command line, and held to the real chart geometry: chart-gap.mjs runs the registered chart
    builders of src/art on the six presets' tokens and measures the gap between their marks."""

    STRATEGIES = ("chart:bars-h", "numeral:waffle")

    @classmethod
    def setUpClass(cls) -> None:
        cls.contract = _load("chart-separation.json")
        cls.cases = []
        for pid in ("swiss", "creator", "notebook", "poster", "interface", "heritage"):
            preset = rebuilt(pid)
            support, note = [pl._hex(c) for c in preset["art"]["colors"]["support"]], pl._hex(preset["art"]["colors"]["note"])
            for tone, bundle in pl.resolve_tones(preset).items():
                for rtl in (True, False):
                    for strategy in cls.STRATEGIES:
                        cls.cases.append({"id": "%s|%s|%s|%s" % (pid, tone, "rtl" if rtl else "ltr", strategy), "strategy": strategy, "rtl": rtl, "tone": tone,
                                          "tokens": {**bundle, "support": support, "note": note}, "art": preset["art"]})
        cls.out = run_node("chart-gap.mjs", {"cases": cls.cases})
        cls.results = {r["id"]: r for r in cls.out["results"]}

    def setUp(self) -> None:
        self.tmp = Path(tempfile.mkdtemp(prefix="cs-chart-gap-"))
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)

    def cli(self, *flags: str) -> tuple[int, dict]:
        folder = self.tmp / "styles" / "swiss"
        folder.mkdir(parents=True, exist_ok=True)
        (folder / "preset.json").write_text(json.dumps(rebuilt("swiss"), ensure_ascii=False, indent=2), encoding="utf-8")
        (folder / "decor.css").write_text('.cs-slide[data-preset="swiss"] .cs-rail-seg { background-color: var(--cs-line); }\n', encoding="utf-8")
        (self.tmp / "styles" / "index.json").write_text(json.dumps({"schemaVersion": 1, "version": "1.1.0", "default": "swiss", "presets": [{"id": "swiss", "preview": None}]}), encoding="utf-8")
        res = run_cli("--preset", str(folder), "--styles", str(self.tmp / "styles"), "--strict", "--format", "json", *flags)
        return res.returncode, json.loads(res.stdout)

    def test_the_lint_uses_the_contracted_gap_and_the_contract_meets_g4(self) -> None:
        self.assertEqual((pl.CHART_GAP_PX, pl.CHART_GAP_MIN_PX, pl.OUTLINE_MIN_PX), (self.contract["gapPx"], self.contract["g4MinPx"], self.contract["outlineMinPx"]))
        self.assertGreaterEqual(self.contract["gapPx"], self.contract["g4MinPx"])

    def test_the_built_charts_leave_at_least_the_gap_the_lint_assumes(self) -> None:
        """The integration assertion: real builders, real geometry, every preset and tone and both directions."""
        for strategy, marks in (("chart:bars-h", {6}), ("numeral:waffle", {100})):
            measured = [self.results[c["id"]] for c in self.cases if c["strategy"] == strategy]
            with self.subTest(strategy=strategy):
                self.assertEqual([r["id"] for r in measured if not r["built"]], [], "a chart the builder refused or the probe could not read: %s" % [r.get("error") for r in measured if not r["built"]][:2])
                self.assertEqual({r["marks"] for r in measured}, marks)
                self.assertGreaterEqual(min(r["minGap"] for r in measured), pl.CHART_GAP_PX, "the lint credits more separation than %s draws" % strategy)

    def test_the_measurement_sees_a_gap_below_the_contract(self) -> None:
        """Test of the test: the same probe with the waffle grid planted 1 px apart reports 1 px, so a builder that drew cells that close would fail the assertion above."""
        case = [c for c in self.cases if c["strategy"] == "numeral:waffle"][0]
        out = run_node("chart-gap.mjs", {"cases": [case], "plant": "waffle-gap-1"})["results"][0]
        self.assertEqual((out["built"], out["marks"], out["minGap"]), (True, 100, 1))
        self.assertLess(out["minGap"], pl.CHART_GAP_PX)

    def test_every_registered_chart_kind_is_measured_or_listed(self) -> None:
        """A chart kind registered without a strategy in chart-gap.mjs is reported as skipped here, so a new builder (A6a, A7) shows up instead of passing unseen."""
        registered = {"chart:" + sub for sub in self.out["registered"]["chart"]} | {"numeral:" + sub for sub in self.out["registered"]["numeral"] if sub == "waffle"}
        self.assertEqual(set(self.out["strategies"]), set(self.STRATEGIES))
        self.assertTrue({"chart:bars-h", "numeral:waffle"} <= registered, "the probe measures nothing if the builders it knows are not registered: %s" % sorted(registered))
        for kind in sorted(registered - set(self.STRATEGIES)):
            with self.subTest(kind=kind):
                self.skipTest("%s is registered but chart-gap.mjs has no measurement strategy for it yet: its gap to the %s px contract is unverified" % (kind, self.contract["gapPx"]))

    def test_the_failure_is_reachable_in_production(self) -> None:
        """Through the command line, with the gap a measurement (or a worse promise) gives: below 3 px the unseparated pairs fail and the report names the figure."""
        code, data = self.cli()
        self.assertEqual((code, data["chartGap"]), (0, self.contract["gapPx"]))
        for gap in ("2", "2.9", "0"):
            with self.subTest(gap=gap):
                code, data = self.cli("--chart-gap", gap)
                self.assertEqual(code, 2)
                self.assertEqual(data["chartGap"], float(gap) if "." in gap else int(gap))
                self.assertEqual({(f["code"], f["where"]) for f in data["results"]["swiss"]}, {("graphics.chart", "accent next to support 1"), ("graphics.chart", "support 1 next to support 2")})
        self.assertEqual(self.cli("--chart-gap", "3")[0], 0)
        self.assertEqual(self.cli("--chart-gap", "12")[0], 0)

    def test_a_bad_gap_is_a_usage_error(self) -> None:
        for bad in ("-1", "wide", "nan", "inf", "-inf", "1e999", "5000", ""):
            with self.subTest(gap=bad):
                self.assertEqual(run_cli("--all", "--chart-gap", bad).returncode, 64)


class CustomPropertyTests(unittest.TestCase):
    """Wave 2b: the strict bans read the VALUES that custom properties and var() fallbacks stand for, because the real replaySupportCheck reads computed styles.
    The review's probes: `--cs-turn: rotateX(30deg); transform: var(--cs-turn)` passed with zero findings while the painter returns transform-3d, and
    `--cs-shadow: 0 6px 0 red; box-shadow: var(--cs-shadow)` and `var(--cs-missing, red)` passed because paint_colour_problems stripped every var() whole."""

    def strict(self, body: str) -> set:
        return {f["code"] for f in pl.lint_css(rule_with(body), "swiss", True)}

    def test_the_three_planted_constructs_are_strict_findings_and_loose_passes(self) -> None:
        for body, code in (("--cs-turn: rotateX(30deg); transform: var(--cs-turn);", "decor.transform-3d"),
                           ("--cs-shadow: 0 6px 0 red; box-shadow: var(--cs-shadow);", "decor.paint-colour"),
                           ("box-shadow: 0 6px 0 var(--cs-missing, red);", "decor.paint-colour")):
            with self.subTest(body=body):
                self.assertEqual(self.strict(body), {code})
                self.assertEqual(pl.lint_css(rule_with(body), "swiss", False), [])

    def test_the_planted_cases_of_the_fixture_name_them(self) -> None:
        names = {c["name"] for c in _load("decor-cases.json")["cases"]}
        for want in ("transform-3d-through-a-custom-property", "transform-3d-in-a-var-fallback", "shadow-colour-through-a-custom-property", "missing-var-fallback-colour-in-a-shadow"):
            self.assertIn(want, names)

    def test_a_3d_function_is_found_wherever_the_transform_takes_it_from(self) -> None:
        for body in ("--cs-turn: rotateX(30deg); transform: var(--cs-turn);", "transform: var(--cs-missing, rotateX(30deg));",
                     "--cs-tilt: rotateX(30deg); --cs-pose: var(--cs-tilt) rotate(2deg); transform: var(--cs-pose);", "--cs-turn: perspective(400px) rotateY(10deg);",
                     "--cs-z: translateZ(4px); transform: translate(2px, 2px) var(--cs-z);"):
            with self.subTest(body=body):
                self.assertEqual(self.strict(body), {"decor.transform-3d"})

    def test_a_custom_property_that_a_transform_reads_is_reported_where_it_is_read(self) -> None:
        found = pl.lint_css(rule_with("--cs-turn: rotateX(30deg); transform: var(--cs-turn);"), "swiss", True)
        self.assertEqual([f["where"].rsplit("{ ", 1)[1].rstrip(" }") for f in found], ["transform"], "one finding, not one per site")
        found = pl.lint_css(rule_with("--cs-shadow: 0 6px 0 red; box-shadow: var(--cs-shadow);"), "swiss", True)
        self.assertEqual([f["where"].rsplit("{ ", 1)[1].rstrip(" }") for f in found], ["box-shadow"])
        unread = pl.lint_css(rule_with("--cs-turn: rotateX(30deg);"), "swiss", True)
        self.assertEqual([f["where"].rsplit("{ ", 1)[1].rstrip(" }") for f in unread], ["--cs-turn"], "nothing here reads it, so it may feed a transform elsewhere")

    def test_two_d_transforms_and_token_colours_through_var_stay_clean(self) -> None:
        for body in ("--cs-turn: rotate(2deg); transform: var(--cs-turn);", "--cs-ring: 0 0 0 3px var(--cs-ink); box-shadow: var(--cs-ring), 6px 6px 0 var(--cs-line);",
                     "box-shadow: 0 0 0 3px var(--cs-line, var(--cs-ink));", "background-image: linear-gradient(var(--cs-bg-2, var(--cs-bg)), var(--cs-accent));",
                     "--cs-gap: 4px 8px; padding: var(--cs-gap);", "--cs-a: var(--cs-b); --cs-b: var(--cs-a); box-shadow: 0 0 0 3px var(--cs-a); transform: var(--cs-a);"):
            with self.subTest(body=body):
                self.assertEqual(self.strict(body), set())

    def test_a_colour_form_is_found_in_a_fallback_a_definition_or_a_nested_fallback(self) -> None:
        for body in ("box-shadow: 0 0 0 3px var(--cs-line, var(--brand-red));", "--cs-stop: red; background-image: linear-gradient(var(--cs-stop), var(--cs-bg));",
                     "box-shadow: var(--cs-x, var(--cs-y, var(--cs-z, red)));", "--cs-shadow: 0 6px 0 light-dark(var(--cs-ink), var(--cs-bg)); box-shadow: var(--cs-shadow);",
                     "--cs-stop: black; box-shadow: 0 0 0 3px var(--cs-stop);", "background-image: linear-gradient(var(--cs-missing, red), var(--cs-bg));"):
            with self.subTest(body=body):
                self.assertEqual(self.strict(body), {"decor.paint-colour"})

    def test_a_foreign_variable_is_still_not_a_token_even_when_the_sheet_defines_it(self) -> None:
        found = pl.lint_css(rule_with("--brand-red: var(--cs-accent); box-shadow: 0 6px 0 var(--brand-red);"), "swiss", True)
        self.assertIn("decor.paint-colour", {f["code"] for f in found})

    def test_a_chain_of_any_length_is_read_to_its_end(self) -> None:
        """Round 2 of the review: the lint stopped at depth 4 and passed the value it had not reached. Five properties reading each other ended at var(--cs-e)
        without a rotateX in sight; the chain below is read to its end whatever its length."""
        def chain(n: int, last: str) -> str:
            names = ["--cs-c%d" % i for i in range(n)]
            return " ".join("%s: var(%s);" % (names[i], names[i + 1]) for i in range(n - 1)) + " %s: %s;" % (names[-1], last)
        for n in (2, 4, 5, 6, 9, 20, 33, 40, 120):
            with self.subTest(properties=n):
                self.assertEqual(self.strict(chain(n, "rotateX(30deg)") + " transform: var(--cs-c0);"), {"decor.transform-3d"})
                self.assertEqual(self.strict(chain(n, "0 6px 0 red") + " box-shadow: var(--cs-c0);"), {"decor.paint-colour"})
                self.assertEqual(self.strict(chain(n, "inset 0 0 0 3px var(--cs-ink)") + " box-shadow: var(--cs-c0);"), {"decor.inset-shadow"})
                self.assertEqual(self.strict(chain(n, "conic-gradient(var(--cs-ink), var(--cs-bg))") + " background-image: var(--cs-c0);"), {"decor.conic-gradient"})
                self.assertEqual(self.strict(chain(n, "rotate(3deg)") + " transform: var(--cs-c0); box-shadow: 0 0 0 3px var(--cs-ink);"), set(), "a chain of safe values stays clean")
                self.assertEqual(self.strict(chain(n, "0 0 0 3px var(--cs-ink)") + " box-shadow: var(--cs-c0);"), set())

    def test_a_chain_nothing_reads_is_read_from_its_first_link(self) -> None:
        """The first link of a chain that no declaration reads is inspected as if it fed a transform or a shadow elsewhere: the danger at the end of the chain shows there."""
        for tail, code in (("rotateX(30deg)", "decor.transform-3d"), ("0 6px 0 red", "decor.paint-colour")):
            body = "--cs-a: var(--cs-b); --cs-b: var(--cs-c); --cs-c: var(--cs-d); --cs-d: var(--cs-e); --cs-e: %s;" % tail
            with self.subTest(tail=tail):
                found = pl.lint_css(rule_with(body), "swiss", True)
                self.assertEqual({f["code"] for f in found}, {code})
                self.assertEqual([f["where"].rsplit("{ ", 1)[1].rstrip(" }") for f in found], ["--cs-a"], "reported once, at the link nothing else reads")

    def test_the_seventeenth_definition_is_read(self) -> None:
        """The cascade is not modelled: every rule that sets a custom property gives a value it can take. The lint kept the first 16 alternatives and dropped the rest."""
        for n in (16, 17, 18, 40, 100):
            safe = " ".join("--cs-pick: rotate(%ddeg);" % (i + 1) for i in range(n - 1))
            with self.subTest(definitions=n):
                self.assertEqual(self.strict(safe + " --cs-pick: rotateX(30deg); transform: var(--cs-pick);"), {"decor.transform-3d"}, "the last of %d" % n)
                self.assertEqual(self.strict(" ".join("--cs-pick: %dpx %dpx 0 var(--cs-ink);" % (i + 1, i + 1) for i in range(n - 1)) + " --cs-pick: 0 6px 0 red; box-shadow: var(--cs-pick);"),
                                 {"decor.paint-colour"})
                self.assertEqual(self.strict(safe + " transform: var(--cs-pick);"), set())

    def test_the_seventeenth_alternative_of_a_combination_is_read(self) -> None:
        """Three properties with three definitions each combine into 27 whole values; the danger sits in the 27th. Piece by piece it is found whatever the combination count."""
        parts = "".join("--cs-w%d: a%d; --cs-w%d: b%d; --cs-w%d: %s;" % (i, i, i, i, i, "rotateX(30deg)" if i == 2 else "c%d" % i) for i in range(3))
        self.assertEqual(self.strict(parts + " transform: var(--cs-w0) var(--cs-w1) var(--cs-w2);"), {"decor.transform-3d"})
        parts = "".join("--cs-w%d: 0 0 0 1px var(--cs-ink); --cs-w%d: 0 0 0 2px var(--cs-ink); --cs-w%d: %s;" % (i, i, i, "0 6px 0 red" if i == 2 else "0 0 0 3px var(--cs-line)") for i in range(3))
        self.assertEqual(self.strict(parts + " box-shadow: var(--cs-w0), var(--cs-w1), var(--cs-w2);"), {"decor.paint-colour"})

    def test_a_loop_is_read_once_and_a_loop_with_a_fallback_reads_the_fallback(self) -> None:
        self.assertEqual(self.strict("--cs-a: var(--cs-b); --cs-b: var(--cs-a); transform: var(--cs-a);"), set())
        self.assertEqual(self.strict("--cs-a: var(--cs-b); --cs-b: var(--cs-a); transform: var(--cs-a, rotateX(30deg));"), {"decor.transform-3d"}, "the use site's own fallback is read")
        self.assertEqual(self.strict("--cs-a: var(--cs-b, 0 6px 0 red); --cs-b: var(--cs-a); box-shadow: var(--cs-b);"), {"decor.paint-colour"}, "a fallback inside the loop is a value the chain can end in")

    def test_what_the_lint_cannot_list_it_says(self) -> None:
        """A declaration that needs its value whole (clip-path, display, list-style) and stands for more whole values than the lint lists, or for a chain deeper than
        it follows, is a finding (decor.var-limit): the review's rule that a truncated analysis is never a pass."""
        def chain(n: int, last: str) -> str:
            names = ["--cs-c%d" % i for i in range(n)]
            return " ".join("%s: var(%s);" % (names[i], names[i + 1]) for i in range(n - 1)) + " %s: %s;" % (names[-1], last)
        within, beyond = pl.VAR_DEPTH, pl.VAR_DEPTH + 2
        self.assertEqual(self.strict(chain(within, "list-item") + " display: var(--cs-c0);"), {"decor.list-marker"}, "inside the depth the value is known")
        self.assertEqual(self.strict(chain(beyond, "list-item") + " display: var(--cs-c0);"), {"decor.var-limit"}, "past the depth it is said, not passed")
        self.assertEqual(self.strict(chain(beyond, "inset(2px)") + " clip-path: var(--cs-c0);"), {"decor.var-limit"})
        many = lambda tail: " ".join("--cs-clip: inset(%dpx);" % (i + 1) for i in range(pl.VAR_ALTERNATIVES + 6)) + " --cs-clip: %s; clip-path: var(--cs-clip);" % tail
        self.assertEqual(self.strict(many("polygon(0 0, 100% 0, 100% 100%)")), {"decor.var-limit"}, "more definitions than the lint lists")
        self.assertEqual(self.strict(" ".join("--cs-clip: inset(%dpx);" % (i + 1) for i in range(pl.VAR_ALTERNATIVES - 1)) + " clip-path: var(--cs-clip);"), set(), "up to the limit all are listed")
        self.assertEqual(self.strict(" ".join("--cs-clip: polygon(%dpx 0, 1px 1px, 2px 2px);" % i for i in range(pl.VAR_ALTERNATIVES - 1)) + " clip-path: var(--cs-clip);"), {"decor.clip-path"})
        # combinations of properties the painter reads piece by piece (padding, a transform, a shadow) are never a limit finding: only a value that is checked whole is
        wide = "".join("--cs-w%d: a%d; --cs-w%d: b%d; --cs-w%d: c%d; --cs-w%d: d%d;" % ((i,) * 8) for i in range(5))
        self.assertEqual(self.strict(wide + " padding: var(--cs-w0) var(--cs-w1) var(--cs-w2) var(--cs-w3) var(--cs-w4);"), set())
        self.assertEqual(pl.lint_css(rule_with(many("polygon(0 0, 100% 0, 100% 100%)")), "swiss", False), [], "the legacy presets are not asked")

    def test_the_helpers(self) -> None:
        calls = pl.var_calls("0 0 var(--cs-a, rgb(1 2 3 / 4%)) 1px var(--cs-b) my-var(--x) VAR( --cs-c , 5px )")
        self.assertEqual([(c[2], c[3]) for c in calls], [("--cs-a", "rgb(1 2 3 / 4%)"), ("--cs-b", None), ("--cs-c", "5px")])
        self.assertEqual(pl.var_calls("var(--cs-a, (unbalanced"), [])
        self.assertEqual(pl.var_calls('x var(--cs-a, ")") y'), [(2, 18, "--cs-a", '")"')])
        self.assertEqual(pl.expansions("a var(--cs-x) b", {}), ["a var(--cs-x) b"], "an engine token stays as written")
        defs = {"--cs-x": ["1", "2"], "--cs-y": ["var(--cs-x) 3"]}
        self.assertEqual(pl.expansions("v var(--cs-y)", defs), ["v 1 3", "v 2 3"])
        self.assertEqual(pl.expansions("var(--cs-missing, 9)", defs), ["9"])
        loop = {"--cs-a": ["var(--cs-b)"], "--cs-b": ["var(--cs-a)"]}
        self.assertEqual(pl.expand("var(--cs-a)", loop), (["var(--cs-a)"], True), "a loop ends where it comes back to itself, kept as written, and it is complete")
        self.assertEqual(pl.expand("var(--cs-a, 7)", loop), (["7"], True), "a loop stands for its fallback only")
        wide = {"--cs-w%d" % i: ["a", "b", "c"] for i in range(8)}
        values, complete = pl.expand(" ".join("var(--cs-w%d)" % i for i in range(8)), wide)
        self.assertEqual((len(values), complete), (pl.VAR_ALTERNATIVES, False), "3^8 whole values: cut at VAR_ALTERNATIVES and said to be cut")
        three = " ".join("var(--cs-w%d)" % i for i in range(3))
        self.assertEqual((len(pl.expansions(three, wide)), pl.expand(three, wide)[1]), (27, True), "3^3 whole values are all listed")
        self.assertEqual(pl.strip_var_calls("0 0 var(--cs-a, red) 1px").split(), ["0", "0", "1px"])

    def test_var_trace_reads_the_pieces_to_the_end_of_a_chain(self) -> None:
        """No combination of definitions and no depth limit: the pieces are the texts around the var() calls, the definitions of every property read and the fallbacks."""
        self.assertEqual(pl.var_trace("0 6px 0 red", {}), (["0 6px 0 red"], []))
        pieces, names = pl.var_trace("a var(--cs-x, b var(--cs-y)) c", {"--cs-x": ["1"], "--cs-y": ["2 var(--cs-x)"]})
        self.assertEqual(sorted(p.strip() for p in pieces), sorted(["a   c", "1", "b", "2"]))
        self.assertEqual(sorted(names), ["--cs-x", "--cs-x", "--cs-y"], "a call inside a fallback and inside a definition is read too")
        depth = 200
        chain = {"--cs-p%d" % i: ["var(--cs-p%d)" % (i + 1)] for i in range(depth)}
        chain["--cs-p%d" % depth] = ["rotateX(30deg)"]
        pieces, names = pl.var_trace("var(--cs-p0)", chain)
        self.assertIn("rotateX(30deg)", pieces, "two hundred custom properties deep is still read")
        self.assertEqual(len(names), depth + 1)
        many = {"--cs-pick": ["rotate(%ddeg)" % i for i in range(99)] + ["rotateX(1deg)"]}
        self.assertIn("rotateX(1deg)", pl.var_trace("var(--cs-pick)", many)[0], "the hundredth definition is read")
        self.assertEqual(pl.var_trace("var(--cs-a)", {"--cs-a": ["var(--cs-b)"], "--cs-b": ["var(--cs-a)"]})[0], [" ", " ", " "], "a loop is read once, not for ever")


class ListItemTests(unittest.TestCase):
    """`display: list-item` draws a marker unless list-style is none, and replaySupportCheck flags a list-item only when its list-style-type is not none: the lint
    flagged `display: list-item; list-style: none` although the painter draws it (the replay cases of decor-cases.json hold both halves)."""

    def strict(self, body: str) -> set:
        return {f["code"] for f in pl.lint_css(rule_with(body), "swiss", True)}

    def test_a_list_item_without_a_marker_is_drawn(self) -> None:
        for body in ("display: list-item; list-style: none;", "list-style: none; display: list-item;", "display: list-item; list-style-type: none;",
                     "list-style-type: none; display: list-item;", "display: list-item; list-style: inside none;", "display: list-item; list-style: none; list-style-position: outside;"):
            with self.subTest(body=body):
                self.assertEqual(self.strict(body), set())

    def test_a_list_item_with_a_marker_is_not(self) -> None:
        for body in ("display: list-item;", "display: list-item; list-style: disc;", "list-style: none; display: list-item; list-style-type: disc;",
                     "display: list-item; list-style: none; list-style: inside;", "display: list-item; list-style-position: inside;", "--cs-kind: list-item; display: var(--cs-kind);"):
            with self.subTest(body=body):
                self.assertEqual(self.strict(body), {"decor.list-marker"})

    def test_the_flag_belongs_to_the_rule_that_sets_the_display(self) -> None:
        css = rule("list-style: none;", '.cs-slide[data-preset="swiss"] .cs-bullets') + rule("display: list-item;", '.cs-slide[data-preset="swiss"] .cs-bullet')
        self.assertEqual({f["code"] for f in pl.lint_css(css, "swiss", True)}, {"decor.list-marker"}, "the lint reads one rule at a time: put both in the rule that needs them")

    def test_a_list_style_type_that_is_not_none_is_still_a_marker_in_any_rule(self) -> None:
        self.assertEqual(self.strict("list-style-type: square;"), {"decor.list-marker"})
        self.assertEqual(self.strict("display: flex; list-style: none;"), set())


class CoverScopeTests(unittest.TestCase):
    """Decision D-7 (cover exactness): the byte-exact 1.0 creator grain rule is 16,598 B (the compact re-encoding that drifted the cover is 3,861 B), and the
    strict limit of 25,600 B is for everything that is not a cover or a poster: rules whose every selector is scoped to [data-type="cover"] or
    [data-type="poster"] are free up to 20,480 B (COVER_ALLOWANCE_BYTES); every other strict ban still applies to them."""

    S = '.cs-slide[data-preset="swiss"]'

    @classmethod
    def setUpClass(cls) -> None:
        cls.sizes = _load("decor-cases.json")["sizes"]

    def build(self, parts: list) -> str:
        css = ""
        for part in parts:
            line = part["selector"].replace("{S}", self.S) + (" { color: var(--cs-ink); }\n" if " .cs-kicker" in part["selector"] else " .cs-kicker { color: var(--cs-ink); }\n")
            css += line * -(-part["bytes"] // len(line.encode("utf-8")))
        return css

    def test_the_constants(self) -> None:
        self.assertEqual((pl.MAX_DECOR_BYTES_STRICT, pl.COVER_ALLOWANCE_BYTES, pl.MAX_DECOR_BYTES), (25 * 1024, 20 * 1024, 64 * 1024))
        self.assertEqual((pl.MAX_DECOR_BYTES_STRICT, pl.COVER_ALLOWANCE_BYTES), (25_600, 20_480))

    def test_every_fixture_gives_its_size_verdict_strict_and_loose(self) -> None:
        self.assertGreaterEqual(len(self.sizes), 12)
        for case in self.sizes:
            css = self.build(case["parts"])
            for mode, strict in (("strict", True), ("loose", False)):
                with self.subTest(case=case["name"], mode=mode):
                    self.assertEqual(sorted({f["code"] for f in pl.lint_css(css, "swiss", strict)}), sorted(case[mode]))

    def test_the_acceptance_fixtures(self) -> None:
        """30 KB of cover-scoped rules passes, 30 KB of other rules fails, and a rule with one cover and one other selector counts fully."""
        by = {c["name"]: c for c in self.sizes}
        cover, other, mixed = (by["30-kb-of-cover-scoped-rules-passes"], by["30-kb-of-other-rules-fails"], by["30-kb-where-each-rule-has-one-non-cover-selector-counts-fully"])
        for case, ok in ((cover, True), (other, False), (mixed, False)):
            css = self.build(case["parts"])
            self.assertGreaterEqual(len(css.encode("utf-8")), 30 * 1024, case["name"])
            self.assertEqual("decor.size" not in {f["code"] for f in pl.lint_css(css, "swiss", True)}, ok, case["name"])

    def test_the_counted_size(self) -> None:
        sized = lambda css: pl.counted_size(css.replace("{S}", self.S))
        cover = '{S}[data-type="cover"] .cs-kicker { color: var(--cs-ink); }\n'
        other = "{S} .cs-kicker { color: var(--cs-ink); }\n"
        counted, scoped = sized(cover)
        self.assertEqual(counted, 1, "a small cover rule is free; the newline after the last rule belongs to no rule")
        self.assertEqual(scoped, len(cover.replace("{S}", self.S).encode("utf-8")) - 1, "its own text")
        mixed = '{S}[data-type="cover"] .cs-kicker, {S} .cs-kicker { color: var(--cs-ink); }\n'
        total = len(mixed.replace("{S}", self.S).encode("utf-8"))
        self.assertEqual(sized(mixed), (total, 0), "one selector that is not scoped counts the whole rule")
        both = cover + other
        total = len(both.replace("{S}", self.S).encode("utf-8"))
        counted, scoped = sized(both)
        self.assertEqual(counted, total - scoped)
        self.assertGreater(scoped, 0)
        self.assertGreater(counted, len(other))
        commented = "/* " + "x" * 200 + " */\n" + cover
        counted, scoped = sized(commented)
        self.assertEqual(counted, len(commented.replace("{S}", self.S).encode("utf-8")) - scoped, "comments count")
        self.assertGreater(counted, 200)
        # past the allowance the rest counts
        big = cover * 1000
        total = len(big.replace("{S}", self.S).encode("utf-8"))
        counted, scoped = sized(big)
        self.assertEqual(counted, total - pl.COVER_ALLOWANCE_BYTES)
        self.assertGreater(scoped, pl.COVER_ALLOWANCE_BYTES)
        self.assertGreater(sized("{S}[data-type=cover] { }\n{S} .a {}")[1], 0, "an empty body does not break the spans")
        self.assertGreater(sized('@import "x.css";\n' + cover)[1], 0, "an @rule statement does not hide the rules after it")


    def test_which_selectors_are_cover_scoped(self) -> None:
        yes = ('{S}[data-type="cover"] .a', "{S}[data-type=cover] .a", "{S}[data-type='poster'] .a", '{S}[data-type="cover" i] .a', '{S}[data-type="cover"]',
               '{S}[data-tone="invert"][data-type="poster"] .a', '{S}[data-type="cover"] > .a', '{S}[data-type="cover"]::before',
               '{S}:is([data-type="cover"],[data-type="poster"]) .a', '{S}:where([data-type="cover"], [data-type="poster"]) .a',
               '{S}:is([data-type="cover"], :is([data-type="poster"])) .a', '{S}[data-type="cover"]:is(.cs-bg, .cs-decor)')
        no = ('{S}:is([data-type="cover"],[data-type="item"]) .a', '{S}:not([data-type="cover"]) .a', '{S} [data-type="cover"] .a', '{S}[data-type="cover-x"] .a',
              '{S}[data-type="item"] .a', "{S} .a", '{S}:is([data-type="cover"], .cs-kicker) .a', '{S}[data-type^="cover"] .a', '{S}[data-type~="cover"] .a',
              '{S} .a[data-type="cover"]', '{S}:is([data-type="cover"] .b) .a', "")
        for selector in yes:
            with self.subTest(selector=selector):
                self.assertTrue(pl.cover_scoped(selector.replace("{S}", self.S)))
        for selector in no:
            with self.subTest(selector=selector):
                self.assertFalse(pl.cover_scoped(selector.replace("{S}", self.S)))
        self.assertTrue(pl.cover_scoped("[data-type=cover]"), "the scope test reads the attribute; selector_problems rejects a selector that does not start with the preset")

    def test_every_other_strict_ban_still_applies_to_cover_rules(self) -> None:
        cover = self.S + '[data-type="cover"] .cs-art-panel'
        for body, code in (("outline: 2px solid var(--cs-ink);", "decor.strict-property"), ("border-image: linear-gradient(var(--cs-ink), var(--cs-bg)) 1;", "decor.strict-property"),
                           ("color: color-mix(in srgb, var(--cs-ink) 14%, var(--cs-bg));", "decor.color-mix"), ("box-shadow: 0 6px 0 red;", "decor.paint-colour"),
                           ("background-image: linear-gradient(red, var(--cs-bg));", "decor.paint-colour"), ("box-shadow: inset 0 0 0 3px var(--cs-bg);", "decor.inset-shadow"),
                           ("transform: rotateX(20deg);", "decor.transform-3d"), ("--cs-turn: rotateX(20deg); transform: var(--cs-turn);", "decor.transform-3d"),
                           ("--cs-shadow: 0 6px 0 red; box-shadow: var(--cs-shadow);", "decor.paint-colour")):
            with self.subTest(body=body):
                found = {f["code"] for f in pl.lint_css(cover + " { " + body + " }\n", "swiss", True)}
                self.assertIn(code, found)

    def test_a_cover_rule_still_needs_the_selector_vocabulary(self) -> None:
        self.assertIn("decor.selector", {f["code"] for f in pl.lint_css(self.S + '[data-type="cover"] .nope { color: var(--cs-ink); }', "swiss", True)})
        self.assertIn("decor.selector", {f["code"] for f in pl.lint_css('.cs-slide[data-preset="poster"][data-type="cover"] .cs-kicker { color: var(--cs-ink); }', "swiss", True)})

    def test_the_loose_limit_is_unchanged_and_counts_every_byte(self) -> None:
        big = self.build([{"selector": '{S}[data-type="cover"]', "bytes": 70 * 1024}])
        self.assertIn("decor.size", {f["code"] for f in pl.lint_css(big, "swiss", False)})
        self.assertIn("decor.size", {f["code"] for f in pl.lint_css(big, "swiss", True)}, "70 KiB of cover rules is 50 KiB past the allowance")


class CoverScopeCliTests(unittest.TestCase):
    """The same verdicts end to end: a preset folder with a decor.css of cover rules passes `preset_lint.py --preset ... --strict`, the same size of other rules fails."""

    def setUp(self) -> None:
        self.tmp = Path(tempfile.mkdtemp(prefix="cs-cover-"))
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)
        self.styles = self.tmp / "styles"

    def lint(self, decor: str) -> tuple[int, dict]:
        folder = self.styles / "swiss"
        folder.mkdir(parents=True, exist_ok=True)
        (folder / "preset.json").write_text(json.dumps(rebuilt("swiss"), ensure_ascii=False, indent=2), encoding="utf-8")
        (folder / "decor.css").write_text(decor, encoding="utf-8")
        (self.styles / "index.json").write_text(json.dumps({"schemaVersion": 1, "version": "1.1.0", "default": "swiss", "presets": [{"id": "swiss", "preview": None}]}), encoding="utf-8")
        res = run_cli("--preset", str(folder), "--styles", str(self.styles), "--format", "json", "--strict")
        return res.returncode, json.loads(res.stdout)

    def test_thirty_kb_of_cover_rules_passes_and_thirty_kb_of_other_rules_fails(self) -> None:
        sizes = {c["name"]: c for c in _load("decor-cases.json")["sizes"]}
        for name, want in (("30-kb-of-cover-scoped-rules-passes", 0), ("30-kb-of-other-rules-fails", 2), ("30-kb-where-each-rule-has-one-non-cover-selector-counts-fully", 2)):
            css = CoverScopeTests().build(sizes[name]["parts"])
            with self.subTest(case=name):
                code, data = self.lint(css)
                self.assertEqual(code, want, [f for f in data["results"]["swiss"] if f["sev"] != "OK"][:3])
                self.assertEqual("decor.size" in {f["code"] for f in data["results"]["swiss"]}, want == 2)


class PickFallbackTests(unittest.TestCase):
    """`pick` is the first candidate that reaches the floor on the tone's own ground, else the LAST candidate (resolve.js: v.pick[0].slice(-1)[0]); the lint
    used to fall back to the base ink. The differential case of the review: {pick: [[bg, surface], 3]} on white with surface #F0F0F0 and ink #000000 is
    #F0F0F0 in the resolver (tests/unit/js/core/cases/resolve.test.js holds the same vector) and was #000000 here."""

    BASE = {"bg": "#FFFFFF", "surface": "#F0F0F0", "ink": "#000000", "inkMuted": "#555555", "accent": "#FF0000", "accent2": "#00AA00"}

    def test_the_differential_case(self) -> None:
        self.assertEqual(pl.eval_tone_value({"pick": [["bg", "surface"], 3]}, self.BASE, {}), "#F0F0F0")

    def test_the_first_candidate_that_clears_the_floor_wins(self) -> None:
        self.assertEqual(pl.eval_tone_value({"pick": [["bg", "surface", "ink"], 3]}, self.BASE, {}), "#000000")
        self.assertEqual(pl.eval_tone_value({"pick": [["bg", "accent", "ink"], 3]}, self.BASE, {}), "#FF0000")
        self.assertEqual(pl.eval_tone_value({"pick": [["ink", "accent"], 3]}, self.BASE, {}), "#000000")

    def test_one_candidate_is_the_fallback_too(self) -> None:
        self.assertEqual(pl.eval_tone_value({"pick": [["surface"], 3]}, self.BASE, {}), "#F0F0F0")

    def test_the_ground_is_the_tones_own_bg(self) -> None:
        self.assertEqual(pl.eval_tone_value({"pick": [["bg", "accent2"], 5]}, self.BASE, {"bg": "#000000"}), "#FFFFFF", "white clears 5:1 on a black tone ground")
        self.assertEqual(pl.eval_tone_value({"pick": [["bg", "surface"], 5]}, self.BASE, {"bg": "#FFFFFF"}), "#F0F0F0", "neither clears: the last")

    def test_a_hex_candidate_and_a_whole_tone(self) -> None:
        self.assertEqual(pl.eval_tone_value({"pick": [["#777777", "#888888"], 5]}, self.BASE, {}), "#888888")
        preset = rebuilt("swiss")
        preset["roles"] = {"bg": "#FFFFFF", "surface": "#F0F0F0", "ink": "#000000", "inkMuted": "#555555", "accent": "#FF0000"}
        preset["tones"]["field"]["roles"] = {"bg": "bg", "surface": "surface", "ink": "ink", "inkMuted": {"muted": 4.5}, "accent": {"pick": [["bg", "surface"], 3]}}
        bundle, problems = pl.resolve_tone(preset, "field")
        self.assertEqual(problems, [])
        self.assertEqual(bundle["accent"], "#F0F0F0", "the whole tone: the last candidate, not the ink")

    def test_the_resolver_source_keeps_the_rule_this_lint_follows(self) -> None:
        """A guard, not a second implementation: resolve.js falls back to the last candidate. If that line changes, this test says the lint must follow."""
        source = (REPO / "src" / "core" / "resolve.js").read_text(encoding="utf-8")
        self.assertIn("v.pick[0].filter(function (r) { return C.contrast(ref(r), tone.bg) >= v.pick[1]; })[0] || v.pick[0].slice(-1)[0]", source)


class MalformedInputTests(unittest.TestCase):
    """The graphics lint and the strict css bans report what they can read and never raise on input the schema check has already rejected."""

    ART = ({"fills": []}, {"fills": "tint"}, {"fills": {"giant": 5, "duo": None, "chip": ["x"], "tile": {}, "sticker": True, "badge": ""}}, {"container": 7, "mark": ["outline"]},
           {"colors": {"note": 3, "support": "x"}}, {"colors": []}, {"colors": {"support": [None, None]}}, {"outline": "4", "mark": "outline"}, {"objectOutline": [1]},
           {"fills": {"giant": "support1", "duo": "support2"}, "colors": {"support": []}}, {"fills": {"giant": "support2", "duo": "note", "chip": "paper"}, "colors": {"support": ["#FF8FB1"]}},
           {"fills": {"giant": "#12", "duo": "#GGGGGG", "chip": "accent3"}})

    def test_odd_art_blocks_are_read_not_raised_on(self) -> None:
        for art in self.ART:
            preset = rebuilt("creator")
            preset["art"] = {**preset["art"], **art}
            with self.subTest(art=art):
                self.assertIsInstance(pl.lint_graphics(preset), list)
        for value in (None, [], "x", 5, True):
            preset = rebuilt("creator")
            preset["art"] = value
            with self.subTest(art=value):
                self.assertIsInstance(pl.lint_graphics(preset), list)

    def test_references_that_do_not_resolve_are_left_to_the_schema(self) -> None:
        """A reference the kit would not understand is the schema's finding; an empty one falls through to the default plate, as `||` does in kit.frame."""
        bundle = pl.resolve_tones(rebuilt("creator"))["base"]
        pair = lambda ref: pl.plate_pair("giant", {"fills": {"giant": ref}, "container": "square"}, bundle, [None, None], "#FFF3C4")
        for bad in (5, "accent3", "#12", ["tint"], True):
            self.assertIsNone(pair(bad), bad)
        for empty in ("", None, 0, False):
            self.assertEqual(pair(empty)[3:], ("tint",), empty)

    def test_odd_css_never_raises(self) -> None:
        for body in ("box-shadow: ;", "box-shadow: inset", "content: attr(", "clip-path:", "transform: rotateX(", "list-style:", "display:", "--cs-x: \"inset", "background: conic-gradient(",
                     'background-image: url("data:conic-gradient(")', "content: ;", "box-shadow: inset(", "transform: ;", "list-style-type: ;",
                     "box-shadow: var(", "box-shadow: 0 0 var(--cs-x,", "transform: var(--cs-x, rotateX(", "transform: var()", "--cs-a: var(--cs-a); transform: var(--cs-a)",
                     "--cs-a: var(--cs-b); --cs-b: var(--cs-a); box-shadow: 0 0 0 var(--cs-a)", 'box-shadow: 0 0 0 var(--cs-x, "', "box-shadow: var(--cs-x, var(--cs-y, var(--cs-z, red)))"):
            for strict in (True, False):
                with self.subTest(body=body, strict=strict):
                    self.assertIsInstance(pl.lint_css(rule_with(body), "swiss", strict), list)


if __name__ == "__main__":
    unittest.main()
