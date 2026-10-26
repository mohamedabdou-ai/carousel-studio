"""Tests for carousel-design/scripts/validate.py: schema validation of every document kind, the checkpoint completeness rules
(CONTRACT 8.1), the text gates behind --lint, the JSON report, stdin, and the exit codes (0 ok, 2 invalid, 64 usage, 65 bad
JSON, 66 missing input).

Run: python -m unittest discover -s tests/unit/py -p "test_validate.py"
"""

from __future__ import annotations

import contextlib
import io
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

try:
    import b7_support as support
except ImportError:  # `python -X utf8 -m unittest tests.unit.py.test_validate`: the folder is a package here
    from . import b7_support as support

REPO = Path(__file__).resolve().parents[3]
SKILLS = REPO / "plugins" / "carousel-studio" / "skills"
SCRIPT = SKILLS / "carousel-design" / "scripts" / "validate.py"
FIXTURES = REPO / "tests" / "fixtures"
ENV = {**os.environ, "PYTHONIOENCODING": "utf-8", "PYTHONUTF8": "1"}
LONG_COVER = "واحد اثنين ثلاثة أربعة خمسة ستة سبعة"

validate = None


def setUpModule() -> None:
    global validate
    validate = support.load_script("carousel-design", "validate.py", "validate_under_test")


def tearDownModule() -> None:
    support.cleanup()


def run(*args: str, stdin: str | None = None) -> subprocess.CompletedProcess:
    return subprocess.run([sys.executable, str(SCRIPT), *args], input=stdin, capture_output=True, text=True, encoding="utf-8", env=ENV, timeout=120)


class ValidateTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = Path(tempfile.mkdtemp(prefix="cs-validate-"))
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)

    def write(self, name: str, obj) -> Path:
        path = self.tmp / name
        path.write_text(obj if isinstance(obj, str) else json.dumps(obj, ensure_ascii=False), encoding="utf-8")
        return path

    def spec(self) -> dict:
        return json.loads((FIXTURES / "spec.eg.8slides.json").read_text(encoding="utf-8"))

    # ---- schemas -------------------------------------------------------------------------------------------------------

    def test_every_brand_fixture_is_valid(self) -> None:
        for name in ("brand.eg.creator.json", "brand.en.minimal.json", "brand.gulf.client.json", "brand.msa.indic.json"):
            res = run("brand", str(FIXTURES / name))
            self.assertEqual(res.returncode, 0, name + res.stdout)
            self.assertIn("OK", res.stdout)

    def test_every_spec_fixture_is_valid(self) -> None:
        names = ("spec.eg.8slides.json", "spec.en.8slides.json", "spec.gulf.9slides.json", "spec.levant.10slides.json",
                 "spec.msa-white.indic.8slides.json", "spec.eg.single.json", "spec.eg.angle-stub.json")
        for name in names:
            res = run("spec", str(FIXTURES / name))
            self.assertEqual(res.returncode, 0, name + res.stdout)

    def test_plan_preset_and_hook_library_are_valid(self) -> None:
        self.assertEqual(run("plan", str(FIXTURES / "plan.eg.2026-11.json")).returncode, 0)
        self.assertEqual(run("preset", str(SKILLS / "carousel-design" / "styles" / "swiss" / "preset.json")).returncode, 0)
        for lang in ("ar", "en"):
            res = run("hook-library", str(SKILLS / "carousel-create" / "data" / "hooks" / ("library.%s.json" % lang)))
            self.assertEqual(res.returncode, 0, lang + res.stdout)

    def test_an_incomplete_brand_is_invalid_and_lists_what_is_missing(self) -> None:
        res = run("brand", "-", stdin='{"schemaVersion":1}')
        self.assertEqual(res.returncode, 2)
        self.assertIn("INVALID", res.stdout)
        for prop in ("/name", "/slug", "/locale"):
            self.assertIn(prop, res.stdout)

    def test_the_wrong_kind_is_invalid(self) -> None:
        self.assertEqual(run("qa-report", str(FIXTURES / "spec.eg.8slides.json")).returncode, 2)
        self.assertEqual(run("occasion", "-", stdin="{}").returncode, 2)

    def test_def_validates_against_a_definition(self) -> None:
        slide = self.spec()["slides"][0]
        self.assertEqual(run("spec", "-", "--def", "slide", stdin=json.dumps(slide, ensure_ascii=False)).returncode, 0)
        self.assertEqual(run("spec", "-", "--def", "slide", stdin="{}").returncode, 2)

    # ---- checkpoints ---------------------------------------------------------------------------------------------------

    def test_ready_checkpoint_asks_for_approval_and_a_frozen_layout(self) -> None:
        res = run("spec", str(FIXTURES / "spec.eg.8slides.json"), "--checkpoint", "ready")
        self.assertEqual(res.returncode, 2)
        self.assertIn("/approvals/design", res.stdout)
        self.assertIn("/frozen", res.stdout)

    def test_earlier_checkpoints_accept_the_draft(self) -> None:
        self.assertEqual(run("spec", str(FIXTURES / "spec.eg.8slides.json"), "--checkpoint", "script").returncode, 0)
        self.assertEqual(run("spec", str(FIXTURES / "spec.eg.angle-stub.json"), "--checkpoint", "angle").returncode, 0)

    def test_script_checkpoint_needs_the_slide_copy(self) -> None:
        spec = self.spec()
        del spec["slides"][0]["headline"]
        res = run("spec", str(self.write("nocopy.json", spec)), "--checkpoint", "script")
        self.assertEqual(res.returncode, 2)
        self.assertIn("headline", res.stdout)

    # ---- --lint --------------------------------------------------------------------------------------------------------

    def test_lint_passes_a_clean_deck(self) -> None:
        res = run("spec", str(FIXTURES / "spec.eg.8slides.json"), "--lint", "--brand", str(FIXTURES / "brand.eg.creator.json"))
        self.assertEqual(res.returncode, 0, res.stdout)

    def test_lint_blocks_a_long_cover_and_names_the_rules(self) -> None:
        spec = self.spec()
        spec["slides"][0]["headline"] = LONG_COVER
        res = run("spec", str(self.write("long.json", spec)), "--lint", "--brand", str(FIXTURES / "brand.eg.creator.json"))
        self.assertEqual(res.returncode, 2)
        self.assertIn("C1.hero-words", res.stdout)
        self.assertIn("BLOCK", res.stdout)

    def test_json_report_shape_and_out_file(self) -> None:
        spec = self.spec()
        spec["slides"][0]["headline"] = LONG_COVER
        out = self.tmp / "report.json"
        res = run("spec", str(self.write("long.json", spec)), "--lint", "--brand", str(FIXTURES / "brand.eg.creator.json"), "--format", "json", "--out", str(out))
        self.assertEqual(res.returncode, 2)
        printed = json.loads(res.stdout)
        saved = json.loads(out.read_text(encoding="utf-8"))
        self.assertFalse(printed["ok"])
        self.assertEqual(printed["kind"], "spec")
        self.assertEqual(printed["qa"]["status"], "block")
        self.assertGreaterEqual(printed["qa"]["counts"]["block"], 1)
        self.assertEqual(saved, printed, "--out writes the same JSON report")

    def test_json_output_of_a_valid_document(self) -> None:
        res = run("spec", str(FIXTURES / "spec.eg.8slides.json"), "--format", "json")
        data = json.loads(res.stdout)
        self.assertEqual((res.returncode, data["ok"], data["errors"]), (0, True, []))

    # ---- inputs and exit codes -----------------------------------------------------------------------------------------

    def test_stdin(self) -> None:
        text = (FIXTURES / "spec.eg.8slides.json").read_text(encoding="utf-8")
        res = run("spec", "-", stdin=text)
        self.assertEqual(res.returncode, 0)
        self.assertIn("<stdin>", res.stdout)

    def test_missing_file_is_66(self) -> None:
        res = run("spec", str(self.tmp / "nope.json"))
        self.assertEqual(res.returncode, 66)
        self.assertIn("E_USAGE", res.stderr)

    def test_bad_json_is_65(self) -> None:
        res = run("spec", str(self.write("bad.json", "{bad")))
        self.assertEqual(res.returncode, 65)
        self.assertIn("E_SCHEMA", res.stderr)

    def test_duplicate_keys_are_refused(self) -> None:
        res = run("brand", str(self.write("dup.json", '{"a": 1, "a": 2}')))
        self.assertIn(res.returncode, (2, 65))
        self.assertNotIn("Traceback", res.stderr)

    def test_unknown_kind_is_a_usage_error(self) -> None:
        res = run("zzz", "x.json")
        self.assertEqual(res.returncode, 64)
        self.assertIn("E_USAGE", res.stderr)

    def test_help_works(self) -> None:
        res = run("--help")
        self.assertEqual(res.returncode, 0)
        self.assertIn("--checkpoint", res.stdout)

    def test_no_traceback_on_any_fixture(self) -> None:
        for path in sorted(FIXTURES.glob("*.json")):
            for kind in ("brand", "spec"):
                res = run(kind, str(path))
                self.assertNotIn("Traceback", res.stderr, "%s %s" % (kind, path.name))


def deck_with(slide: dict) -> dict:
    """The Egyptian fixture deck with `slide` as its ninth slide (an id and a position are given to it)."""
    spec = json.loads((FIXTURES / "spec.eg.8slides.json").read_text(encoding="utf-8"))
    n = len(spec["slides"]) + 1
    spec["slides"].append({"id": "s%02d" % n, "n": n, **slide})
    return spec


def problems_of(spec: dict, checkpoint: str = "script") -> dict:
    out: dict = {}
    for p in validate.structure_checks(spec, checkpoint):
        out.setdefault(p["path"], []).append(p["message"])
    return out


class ListFieldRuleTests(unittest.TestCase):
    """CONTRACT 5.3 and 8.1 for the visual language: the item count of a grid and a timeline, the title of every item, one hero,
    the lines of a demo, and the advice that a step without a demo draws no mock."""

    def titled(self, n: int, **extra) -> list:
        return [{"title": "بند %d" % (i + 1), **extra} for i in range(n)]

    def test_a_grid_holds_three_to_six_items(self) -> None:
        for n, ok in ((1, False), (2, False), (3, True), (6, True), (7, False)):
            found = problems_of(deck_with({"type": "grid", "title": "عنوان", "items": self.titled(n)}))
            self.assertEqual("/slides/8/items" in found, not ok, "grid with %d items: %s" % (n, found))
        self.assertIn("3 to 6", problems_of(deck_with({"type": "grid", "title": "عنوان", "items": self.titled(2)}))["/slides/8/items"][0])

    def test_a_timeline_holds_three_to_five_items(self) -> None:
        for n, ok in ((2, False), (3, True), (4, True), (5, True), (6, False)):
            found = problems_of(deck_with({"type": "timeline", "title": "عنوان", "items": self.titled(n)}))
            self.assertEqual("/slides/8/items" in found, not ok, "timeline with %d items: %s" % (n, found))

    # ---- the item count by look (visual language 4.4: bento 3-4, tiles 5-6, rail 3-4, a fifth node only compact) ----------------

    def refused(self, slide: dict) -> list:
        return problems_of(deck_with(slide)).get("/slides/8/items", [])

    def test_a_named_look_has_its_own_range(self) -> None:
        for kind, variant, accepted in (("grid", "bento", (3, 4)), ("grid", "tiles", (5, 6)), ("timeline", "rail", (3, 4))):
            for n in range(1, 9):
                found = self.refused({"type": kind, "variant": variant, "title": "عنوان", "items": self.titled(n)})
                self.assertEqual(not found, accepted[0] <= n <= accepted[1], "%s:%s with %d items: %s" % (kind, variant, n, found))

    def test_a_six_card_bento_is_refused_and_says_which_look_and_how_many(self) -> None:
        message = self.refused({"type": "grid", "variant": "bento", "title": "عنوان", "items": self.titled(6)})
        self.assertEqual(message, ["a grid (bento) holds 3 to 4 items, this one holds 6"])
        self.assertEqual(self.refused({"type": "grid", "variant": "bento", "title": "عنوان", "items": self.titled(5)}),
                         ["a grid (bento) holds 3 to 4 items, this one holds 5"])
        self.assertEqual(self.refused({"type": "grid", "title": "عنوان", "items": self.titled(6)}), [], "no look named: the type allows six")
        self.assertEqual(self.refused({"type": "grid", "variant": "mosaic", "title": "عنوان", "items": self.titled(6)}), [], "an unknown look is VA3's to flag")

    def test_a_five_node_rail_is_refused_with_or_without_a_bridge(self) -> None:
        for extra in ({}, {"bridge": "وبعدها"}, {"bridge": "وبعدها", "items": [{"title": "بند %d" % i, "text": "سطر" } for i in range(5)]}):
            slide = {"type": "timeline", "variant": "rail", "title": "عنوان", "items": self.titled(5), **extra}
            self.assertEqual(self.refused(slide), ["a timeline (rail) holds 3 to 4 items, this one holds 5"], str(extra))
        self.assertEqual(self.refused({"type": "timeline", "variant": "rail", "title": "عنوان", "bridge": "وبعدها", "items": self.titled(4)}), [],
                         "four nodes and a bridge are what a rail is for")

    def test_a_fifth_timeline_node_needs_one_line_texts_and_no_bridge(self) -> None:
        def five(**extra):
            return {"type": "timeline", "title": "عنوان", "items": extra.pop("items", self.titled(5, text="سطر قصير")), **extra}

        self.assertEqual(self.refused(five()), [], "five short nodes, no bridge")
        self.assertEqual(self.refused(five(items=self.titled(5))), [], "five nodes with no text at all")
        self.assertEqual(self.refused(five(bridge="   ")), [], "a blank bridge is no bridge")
        with_bridge = self.refused(five(bridge="وبعدها"))
        self.assertEqual(len(with_bridge), 1)
        self.assertIn("one-line texts and no bridge", with_bridge[0])
        self.assertIn("it has a bridge", with_bridge[0])
        wordy = self.titled(5, text="سطر قصير")
        wordy[2]["text"] = "كلمة بعد كلمة بعد كلمة بعد كلمة"
        self.assertIn("the text of node 3", self.refused(five(items=wordy))[0])
        wide = self.titled(5, text="سطر قصير")
        wide[0]["text"] = " ".join(["كلمةطويلةجدا"] * 3)
        self.assertIn("the text of node 1", self.refused(five(items=wide))[0], "few words, but wider than one line")
        broken = self.titled(5, text="سطر قصير")
        broken[4]["text"] = "سطر\nتحته سطر"
        self.assertIn("the text of node 5", self.refused(five(items=broken))[0], "a line break is two lines")
        both = self.refused(five(items=broken, bridge="وبعدها"))
        self.assertTrue("it has a bridge" in both[0] and "node 5" in both[0], both)
        marked = self.titled(5, text="==مهم== جدا")
        self.assertEqual(self.refused(five(items=marked)), [], "the markers are not characters on the line")
        self.assertEqual(self.refused(five(items=self.titled(6, text="سطر قصير"))), ["a timeline holds 3 to 5 items, this one holds 6"], "never six")
        self.assertEqual(self.refused({"type": "timeline", "title": "عنوان", "bridge": "وبعدها", "items": wordy[:4]}), [], "the exception is for the fifth node")

    def test_the_item_ranges_follow_the_platform_file_and_stay_inside_it(self) -> None:
        plan = json.loads((SKILLS / "carousel-design" / "data" / "platform-instagram.json").read_text(encoding="utf-8"))["plugin"]["visual"]["plan"]["valid"]
        self.assertEqual({k: tuple(v) for k, v in plan["itemsByType"].items()}, validate.ITEM_COUNT)
        self.assertEqual(validate.COMPACT_NODES, validate.ITEM_COUNT["timeline"][1])
        for (kind, _variant), (lo, hi) in validate.VARIANT_ITEMS.items():
            self.assertTrue(validate.ITEM_COUNT[kind][0] <= lo <= hi <= validate.ITEM_COUNT[kind][1], kind)

    def test_the_command_line_refuses_the_two_oversized_decks(self) -> None:
        tmp = Path(tempfile.mkdtemp(prefix="cs-validate-"))
        self.addCleanup(shutil.rmtree, tmp, ignore_errors=True)

        def check(slide: dict):
            path = tmp / "deck.json"
            path.write_text(json.dumps(deck_with(slide), ensure_ascii=False), encoding="utf-8")
            res = run("spec", str(path), "--checkpoint", "script", "--format", "json")
            return res.returncode, [s["path"] for s in json.loads(res.stdout)["structure"]]

        self.assertEqual(check({"type": "grid", "variant": "bento", "title": "عنوان", "items": self.titled(4)}), (0, []))
        self.assertEqual(check({"type": "grid", "variant": "bento", "title": "عنوان", "items": self.titled(6)}), (2, ["/slides/8/items"]))
        self.assertEqual(check({"type": "timeline", "variant": "rail", "title": "عنوان", "bridge": "وبعدها", "items": self.titled(5)}), (2, ["/slides/8/items"]))
        self.assertEqual(check({"type": "timeline", "title": "عنوان", "items": self.titled(5, text="سطر قصير")}), (0, []))

    def test_a_list_with_no_titled_item_is_reported_once_by_the_completeness_table(self) -> None:
        found = problems_of(deck_with({"type": "grid", "title": "عنوان", "items": [{"text": "x"}, {"text": "y"}, {"text": "z"}]}))
        self.assertEqual(found["/slides/8/items"], ["a grid slide needs items"])
        self.assertIn("/slides/8/items/0/title", found)

    def test_every_item_needs_a_title_on_any_type(self) -> None:
        found = problems_of(deck_with({"type": "item", "title": "عنوان", "body": "نص", "items": [{"title": "أول"}, {"text": "بلا عنوان"}, {"title": "  "}]}))
        self.assertEqual(sorted(p for p in found if "/items" in p), ["/slides/8/items/1/title", "/slides/8/items/2/title"])
        self.assertNotIn("/slides/8/items", found, "an item type has no item count")

    def test_only_one_hero_item_on_a_grid_or_a_timeline(self) -> None:
        for kind in ("grid", "timeline"):
            two = self.titled(3)
            two[0]["hi"] = two[1]["hi"] = True
            self.assertIn("highlighted", problems_of(deck_with({"type": kind, "title": "عنوان", "items": two}))["/slides/8/items"][0], kind)
            one = self.titled(3)
            one[2]["hi"] = True
            self.assertNotIn("/slides/8/items", problems_of(deck_with({"type": kind, "title": "عنوان", "items": one})), kind)
        marked = self.titled(3, hi=True)
        self.assertNotIn("/slides/8/items", problems_of(deck_with({"type": "checklist", "title": "عنوان", "bullets": ["أ"], "items": marked})))

    def test_a_demo_needs_a_line_with_text(self) -> None:
        base = {"type": "step", "title": "عنوان"}
        self.assertNotIn("/slides/8/demo/lines", problems_of(deck_with({**base, "demo": {"lines": [{"text": "سطر"}], "caption": "ملاحظة"}})))
        self.assertIn("/slides/8/demo/lines", problems_of(deck_with({**base, "demo": {"lines": []}})))
        self.assertIn("/slides/8/demo/lines", problems_of(deck_with({**base, "demo": {"caption": "x"}})))
        found = problems_of(deck_with({**base, "demo": {"lines": [{"text": "سطر"}, {"text": "  "}, {"who": "me"}]}}))
        self.assertEqual(sorted(p for p in found if "/demo" in p), ["/slides/8/demo/lines/1/text", "/slides/8/demo/lines/2/text"])

    def test_the_rules_start_at_the_script_checkpoint(self) -> None:
        spec = deck_with({"type": "grid", "title": "عنوان", "items": self.titled(1)})
        self.assertFalse([p for p in problems_of(spec, "angle") if "/slides/8" in p])
        self.assertIn("/slides/8/items", problems_of(spec, "script"))
        self.assertIn("/slides/8/items", problems_of(spec, "ready"), "checkpoints are cumulative")

    # ---- the note ---------------------------------------------------------------------------------------------------------

    def test_a_step_without_a_demo_gets_a_note_and_nothing_else(self) -> None:
        spec = deck_with({"type": "step", "title": "عنوان"})
        notes = validate.note_checks(spec, "script")
        self.assertEqual([(n["path"], n["code"]) for n in notes], [("/slides/8/demo", "C2.demo-missing")])
        self.assertEqual(validate.note_checks(spec, "script"), notes, "run twice")
        self.assertNotIn("/slides/8/demo", problems_of(spec), "a note is not a structure problem")
        spec["slides"][8]["demo"] = {"lines": [{"text": "سطر"}]}
        self.assertEqual(validate.note_checks(spec, "script"), [])

    def test_the_types_that_need_a_demo_and_the_keyword_call_to_action(self) -> None:
        for kind in ("step", "story-beat", "setup", "share", "testimonial"):
            notes = validate.note_checks(deck_with({"type": kind}), "script")
            self.assertEqual([n["path"] for n in notes], ["/slides/8/demo"], kind)
        for kind in ("item", "stat", "quote", "cta", "offer", "grid", "cover", "checklist"):
            self.assertEqual(validate.note_checks(deck_with({"type": kind}), "script"), [], kind)
        keyword = deck_with({"type": "cta", "title": "عنوان", "cta": {"kind": "keyword-dm", "text": "اكتب كلمة"}})
        self.assertEqual([n["path"] for n in validate.note_checks(keyword, "script")], ["/slides/8/demo"])
        keyword["slides"][8]["demo"] = {"lines": [{"text": "كلمة"}]}
        self.assertEqual(validate.note_checks(keyword, "script"), [])
        for save in ("save", "send", "question", "follow"):
            self.assertEqual(validate.note_checks(deck_with({"type": "cta", "title": "عنوان", "cta": {"kind": save, "text": "x"}}), "script"), [], save)

    def test_an_empty_demo_counts_as_missing_and_the_angle_checkpoint_says_nothing(self) -> None:
        self.assertEqual(len(validate.note_checks(deck_with({"type": "step", "demo": {"lines": [{"text": " "}]}}), "script")), 1)
        self.assertEqual(validate.note_checks(deck_with({"type": "step"}), "angle"), [])

    def test_the_day_the_demo_becomes_required_it_is_a_structure_problem_not_a_note(self) -> None:
        spec = deck_with({"type": "share", "headline": "ابعتها"})
        with mock.patch.object(validate, "DEMO_REQUIRED", True):
            self.assertEqual(validate.note_checks(spec, "script"), [])
            self.assertIn("/slides/8/demo", problems_of(spec))
            spec["slides"][8]["demo"] = {"lines": [{"text": "سطر"}]}
            self.assertNotIn("/slides/8/demo", problems_of(spec))
        self.assertEqual(problems_of(deck_with({"type": "share", "headline": "ابعتها"})).get("/slides/8/demo"), None)

    def test_the_demo_types_equal_the_rules_file(self) -> None:
        rules = json.loads((SKILLS / "carousel-design" / "data" / "qa-rules.json").read_text(encoding="utf-8"))
        check = next(c for g in rules["gates"] for c in g["checks"] if c["id"] == "C2.demo-missing")
        self.assertEqual(set(validate.DEMO_TYPES) | {"cta"}, set(check["params"]["needsDemo"]))
        self.assertEqual(validate.DEMO_NOTE, check["id"])

    def test_the_command_line_prints_the_note_and_still_succeeds(self) -> None:
        tmp = Path(tempfile.mkdtemp(prefix="cs-validate-"))
        self.addCleanup(shutil.rmtree, tmp, ignore_errors=True)
        path = tmp / "deck.json"
        path.write_text(json.dumps(deck_with({"type": "step", "title": "عنوان"}), ensure_ascii=False), encoding="utf-8")
        res = run("spec", str(path), "--checkpoint", "script")
        self.assertEqual(res.returncode, 0, res.stdout)
        self.assertIn("note", res.stdout)
        self.assertIn("C2.demo-missing", res.stdout)
        data = json.loads(run("spec", str(path), "--checkpoint", "script", "--format", "json").stdout)
        self.assertTrue(data["ok"])
        self.assertEqual([n["code"] for n in data["notes"]], ["C2.demo-missing"])
        plain = json.loads(run("spec", str(FIXTURES / "spec.eg.8slides.json"), "--format", "json").stdout)
        self.assertEqual(plain["notes"], [], "no checkpoint, no notes")

    def test_a_note_is_not_said_twice_once_the_text_gate_says_it(self) -> None:
        tmp = Path(tempfile.mkdtemp(prefix="cs-validate-"))
        self.addCleanup(shutil.rmtree, tmp, ignore_errors=True)
        path = tmp / "deck.json"
        path.write_text(json.dumps(deck_with({"type": "step", "title": "عنوان"}), ensure_ascii=False), encoding="utf-8")
        said = {"status": "fix", "counts": {"block": 0, "fix": 0, "note": 1}, "exitCode": 0,
                "results": [{"rule": "C2.demo-missing", "slide": "s09", "sev": "NOTE", "msg": {"ar": "x", "en": "y"}}]}
        out = io.StringIO()
        with mock.patch.object(validate, "run_lint", return_value=said), contextlib.redirect_stdout(out):
            code = validate.main(["spec", str(path), "--checkpoint", "script", "--lint", "--format", "json"])
        self.assertEqual(code, 0)
        self.assertEqual(json.loads(out.getvalue())["notes"], [])
        other = {**said, "results": [{**said["results"][0], "slide": "s03"}]}
        out = io.StringIO()
        with mock.patch.object(validate, "run_lint", return_value=other), contextlib.redirect_stdout(out):
            validate.main(["spec", str(path), "--checkpoint", "script", "--lint", "--format", "json"])
        self.assertEqual(len(json.loads(out.getvalue())["notes"]), 1, "the gate named another slide")

    def test_the_zero_override_decks_are_complete(self) -> None:
        folder = FIXTURES / "auto"
        decks = [d for f in sorted(folder.glob("*.json")) if f.name != "manifest.json" for d in json.loads(f.read_text(encoding="utf-8"))]
        if not decks:
            self.skipTest("tests/fixtures/auto is not there yet")
        for i, deck in enumerate(decks):
            self.assertEqual(validate.structure_checks(deck, "script"), [], "deck %d" % i)
            self.assertEqual(validate.note_checks(deck, "script"), [], "deck %d" % i)


if __name__ == "__main__":
    unittest.main()
