"""Tests for the shared Python library `_cs` (carousel-design/scripts/_cs): canonical JSON and hashes, JSON patch, colour,
the JSON-Schema subset, the text model, the lint, the rules bundle, the text gates and the QA report.

The values asserted here are written out by hand (known FNV-1a vectors, WCAG contrast of black on white, ...) or come from the
contract, not from running the module under test. Run: python -m unittest discover -s tests/unit/py -p "test_cs_lib.py"
"""

from __future__ import annotations

import contextlib
import io
import json
import re
import tempfile
import unittest
from pathlib import Path
from unittest import mock

try:
    import b7_support as support
except ImportError:  # `python -X utf8 -m unittest tests.unit.py.test_cs_lib`: the folder is a package here
    from . import b7_support as support

REPO = Path(__file__).resolve().parents[3]
SCRIPTS = REPO / "plugins" / "carousel-studio" / "skills" / "carousel-design" / "scripts"
FIXTURES = REPO / "tests" / "fixtures"
NBSP = " "

cs = None


def setUpModule() -> None:
    global cs
    support.prepare("carousel-design")
    import _cs  # noqa: PLC0415
    from _cs import canon, color, lint, patch, qa, report, rules, schema, text  # noqa: PLC0415

    class NS:
        pass

    cs = NS()
    cs.CSError = _cs.CSError
    for mod in (canon, color, lint, patch, qa, report, rules, schema, text):
        setattr(cs, mod.__name__.split(".")[-1], mod)


def tearDownModule() -> None:
    support.cleanup()


def load(name: str):
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


class CanonTests(unittest.TestCase):
    def test_keys_sorted_and_integers_plain(self) -> None:
        self.assertEqual(cs.canon.canonical_json({"b": 1, "a": [1.0, 2.5, "x"], "c": None}), '{"a":[1,2.5,"x"],"b":1,"c":null}')

    def test_no_whitespace_and_unicode_kept(self) -> None:
        self.assertEqual(cs.canon.canonical_json({"k": "خطوات"}), '{"k":"خطوات"}')

    def test_fnv1a64_known_vectors(self) -> None:
        self.assertEqual(cs.canon.fnv1a64(""), "cbf29ce484222325")
        self.assertEqual(cs.canon.fnv1a64("a"), "af63dc4c8601ec8c")

    def test_hash_is_order_independent(self) -> None:
        self.assertEqual(cs.canon.hash16({"a": 1, "b": 2}), cs.canon.hash16({"b": 2, "a": 1}))
        self.assertNotEqual(cs.canon.hash16({"a": 1}), cs.canon.hash16({"a": 2}))
        self.assertEqual(len(cs.canon.hash16({"a": 1})), 16)


class PatchTests(unittest.TestCase):
    def test_add_replace_remove_on_a_copy(self) -> None:
        doc = {"a": [1, 2], "b": {"c": 1}}
        out = cs.patch.apply_patch(doc, [
            {"op": "add", "path": "/a/1", "value": 9},
            {"op": "replace", "path": "/b/c", "value": 2},
            {"op": "remove", "path": "/a/0"},
        ])
        self.assertEqual(out, {"a": [9, 2], "b": {"c": 2}})
        self.assertEqual(doc, {"a": [1, 2], "b": {"c": 1}}, "the input document is left alone")

    def test_failed_test_op_is_a_conflict(self) -> None:
        with self.assertRaises(cs.CSError) as ctx:
            cs.patch.apply_patch({"a": 1}, [{"op": "test", "path": "/a", "value": 2}])
        self.assertEqual(ctx.exception.code, "E_CONFLICT")

    def test_missing_path_is_a_conflict(self) -> None:
        with self.assertRaises(cs.CSError) as ctx:
            cs.patch.apply_patch({"a": 1}, [{"op": "replace", "path": "/zzz", "value": 2}])
        self.assertEqual(ctx.exception.code, "E_CONFLICT")

    def test_unknown_op_is_a_usage_error(self) -> None:
        with self.assertRaises(cs.CSError) as ctx:
            cs.patch.apply_patch({}, [{"op": "move", "path": "/a"}])
        self.assertEqual(ctx.exception.code, "E_USAGE")

    def test_pointer_escapes(self) -> None:
        out = cs.patch.apply_patch({"a/b": {"c~d": 1}}, [{"op": "replace", "path": "/a~1b/c~0d", "value": 2}])
        self.assertEqual(out, {"a/b": {"c~d": 2}})

    def test_diff_round_trips(self) -> None:
        a = {"x": [1, 2, 3], "y": {"z": "q"}, "gone": True}
        b = {"x": [1, 5, 3, 4], "y": {"z": "r"}, "new": None}
        self.assertEqual(cs.patch.apply_patch(a, cs.patch.diff(a, b)), b)
        self.assertEqual(cs.patch.diff(a, a), [])


class ColorTests(unittest.TestCase):
    def test_parse_and_hex(self) -> None:
        self.assertEqual(cs.color.parse("#abc"), (170, 187, 204))
        self.assertEqual(cs.color.to_hex((170, 187, 204)), "#AABBCC")

    def test_contrast_extremes(self) -> None:
        self.assertAlmostEqual(cs.color.contrast("#000000", "#FFFFFF"), 21.0, places=6)
        self.assertAlmostEqual(cs.color.contrast("#777777", "#777777"), 1.0, places=6)
        self.assertAlmostEqual(cs.color.contrast("#767676", "#FFFFFF"), 4.54, places=2)

    def test_ensure_contrast_reaches_the_target(self) -> None:
        res = cs.color.ensure_contrast("#777777", "#FFFFFF", 4.5)
        self.assertTrue(res["changed"])
        self.assertGreaterEqual(cs.color.contrast(res["hex"], "#FFFFFF"), 4.5)
        same = cs.color.ensure_contrast("#000000", "#FFFFFF", 4.5)
        self.assertFalse(same["changed"])

    def test_on_color_picks_the_readable_side(self) -> None:
        self.assertEqual(cs.color.on_color("#FFD400"), "#111111")
        self.assertEqual(cs.color.on_color("#1D2B5A"), "#FFFFFF")

    def test_oklch_round_trip(self) -> None:
        for hex_ in ("#E3262B", "#1F6F5C", "#3B1E8F", "#7A7A7A"):
            L, C, h = cs.color.to_oklch(hex_)
            back = cs.color.parse(cs.color.from_oklch(L, C, h))
            want = cs.color.parse(hex_)
            self.assertTrue(all(abs(a - b) <= 1 for a, b in zip(back, want)), (hex_, back, want))

    def test_neutral_oklch_has_no_cancellation_chroma_or_hue(self) -> None:
        for n in range(256):
            hex_ = "#" + ("%02X" % n) * 3
            L, C, h = cs.color.to_oklch(hex_)
            self.assertEqual((C, h), (0.0, 0.0), hex_)
            self.assertEqual(cs.color.from_oklch(L, C, h), hex_)
        self.assertGreater(cs.color.to_oklch("#808081")[1], 0)

    def test_mix_midpoint(self) -> None:
        self.assertEqual(cs.color.mix("#000000", "#FFFFFF", 0.0), "#000000")
        self.assertEqual(cs.color.mix("#000000", "#FFFFFF", 1.0), "#FFFFFF")


class SchemaTests(unittest.TestCase):
    SCHEMA = {
        "type": "object",
        "required": ["name", "n"],
        "additionalProperties": False,
        "properties": {
            "name": {"type": "string", "minLength": 2},
            "n": {"type": "integer", "minimum": 1, "maximum": 5},
            "kind": {"enum": ["a", "b"]},
            "tags": {"type": "array", "items": {"type": "string"}, "maxItems": 2},
        },
    }

    def test_valid_instance(self) -> None:
        self.assertEqual(cs.schema.validate({"name": "ok", "n": 3, "kind": "a", "tags": ["x"]}, self.SCHEMA), [])

    def test_errors_carry_path_and_keyword(self) -> None:
        errs = cs.schema.validate({"name": "x", "n": 9, "kind": "z", "tags": ["a", "b", "c"], "extra": 1}, self.SCHEMA)
        got = {(e["path"], e["keyword"]) for e in errs}
        self.assertIn(("/name", "minLength"), got)
        self.assertIn(("/n", "maximum"), got)
        self.assertIn(("/kind", "enum"), got)
        self.assertIn(("/tags", "maxItems"), got)
        self.assertTrue(any(e["keyword"] == "additionalProperties" for e in errs))

    def test_required_error_points_at_the_missing_property(self) -> None:
        errs = cs.schema.validate({}, self.SCHEMA)
        self.assertEqual(sorted(e["path"] for e in errs if e["keyword"] == "required"), ["/n", "/name"])

    def test_bool_is_not_an_integer(self) -> None:
        errs = cs.schema.validate({"name": "ok", "n": True}, self.SCHEMA)
        self.assertTrue(any(e["path"] == "/n" and e["keyword"] == "type" for e in errs))

    def test_every_shipped_schema_uses_only_supported_keywords(self) -> None:
        for path in sorted((SCRIPTS.parent / "schemas").glob("*.schema.json")):
            schema = json.loads(path.read_text(encoding="utf-8"))
            self.assertEqual(cs.schema.unsupported_keywords(schema), [], path.name)

    def test_shipped_fixtures_validate(self) -> None:
        for name in ("brand.eg.creator.json", "brand.en.minimal.json", "brand.gulf.client.json", "brand.msa.indic.json"):
            self.assertEqual(cs.schema.validate_named("brand", load(name)), [], name)
        for name in ("spec.eg.8slides.json", "spec.en.8slides.json", "spec.gulf.9slides.json", "spec.levant.10slides.json", "spec.msa-white.indic.8slides.json"):
            self.assertEqual(cs.schema.validate_named("spec", load(name)), [], name)

    def test_a_bad_brand_is_rejected(self) -> None:
        self.assertTrue(cs.schema.validate_named("brand", {"schemaVersion": 1}))


class TextTests(unittest.TestCase):
    def kinds(self, s: str) -> list:
        return [t["kind"] for t in cs.text.tokenize(s) if t["kind"] != "space"]

    def test_token_kinds(self) -> None:
        self.assertEqual(self.kinds("اشترك @name 5 Instagram https://a.com a@b.com #tag"), ["ar", "handle", "number", "latin", "url", "email", "tag"])

    def test_ltr_flag_follows_the_kind(self) -> None:
        toks = {t["kind"]: t["ltr"] for t in cs.text.tokenize("خطوات 5 Instagram")}
        self.assertFalse(toks["ar"])
        self.assertTrue(toks["number"])
        self.assertTrue(toks["latin"])

    def test_counts(self) -> None:
        self.assertEqual(cs.text.word_count("5 خطوات للنجاح"), 3)
        self.assertEqual(cs.text.word_count(""), 0)
        self.assertEqual(cs.text.char_count("خطوات"), 5)

    def test_digits(self) -> None:
        self.assertEqual(cs.text.convert_digits("خطوة 5 من 10", "arabic-indic"), "خطوة ٥ من ١٠")
        self.assertEqual(cs.text.convert_digits("خطوة ٥ من ١٠", "western"), "خطوة 5 من 10")
        self.assertEqual(cs.text.detect_digits("٣ و 4"), "mixed")
        self.assertEqual(cs.text.detect_digits("خطوة 4"), "western")
        self.assertEqual(cs.text.detect_digits("خطوة ٤"), "arabic-indic")

    def test_counter_and_remaining(self) -> None:
        self.assertEqual(cs.text.counter(3, 8, "western"), "3 من 8")
        self.assertEqual(cs.text.counter(3, 8, "arabic-indic"), "٣ من ٨")
        self.assertEqual(cs.text.remaining(2, "western"), "باقي 2")

    def test_similarity(self) -> None:
        self.assertEqual(cs.text.similarity("بتحفظ الكاروسيل", "بتحفظ الكاروسيل"), 1.0)
        self.assertEqual(cs.text.similarity("كاروسيل", "موبايل"), 0.0)
        a = cs.text.similarity("5 أخطاء بتموت الكاروسيل", "خمس أخطاء بتموت الكاروسيل")
        self.assertGreater(a, 0.5)

    def test_skeleton_folds_marks_and_letters(self) -> None:
        self.assertEqual(cs.text.skeleton("أَحْمَد"), cs.text.skeleton("احمد"))

    def test_markup_and_html(self) -> None:
        html = cs.text.to_html("5 خطوات ==كاروسيل== على Instagram")
        self.assertIn('<bdi dir="ltr" class="cs-ltr" data-run="number">5</bdi>', html)
        self.assertIn('<mark class="cs-em" data-m="em">', html)
        self.assertIn('<bdi dir="ltr" class="cs-ltr" data-run="latin">Instagram</bdi>', html)
        self.assertEqual(html.count('class="w"'), 5)
        self.assertEqual(cs.text.strip_markup("a ==b== c"), "a b c")

    def test_html_escapes(self) -> None:
        self.assertNotIn("<script", cs.text.to_html("<script>x</script> خطوات"))

    def test_bind_glues_a_number_to_its_noun(self) -> None:
        self.assertEqual(cs.text.bind("5 خطوات"), "5" + NBSP + "خطوات")
        self.assertEqual(cs.text.bind("خطوات كثيرة"), "خطوات كثيرة")

    def test_kashida(self) -> None:
        pos = cs.text.kashida_positions("كاروسيل")
        self.assertTrue(pos and all(0 < p < 7 for p in pos))
        one = cs.text.kashida_apply("كاروسيل", 1)
        self.assertEqual(one.count("ـ"), 1)
        self.assertEqual(one.replace("ـ", ""), "كاروسيل")
        self.assertEqual(cs.text.kashida_apply("ك", 1), "ك", "a one-letter word takes no kashida")

    def test_joining_types(self) -> None:
        self.assertEqual(cs.text.joining_type(ord("ب")), "D")
        self.assertEqual(cs.text.joining_type(ord("ا")), "R")
        self.assertEqual(cs.text.joining_type(ord("a")), "U")

    def test_slide_text_reads_the_visible_strings(self) -> None:
        slide = {"type": "stat", "title": "الوقت", "number": {"value": "5", "unit": "ساعات"}}
        strings = cs.text.slide_text(slide)
        self.assertIn("الوقت", strings)
        self.assertIn("5" + NBSP + "ساعات", [t.replace(" ", NBSP) for t in strings])
        item = {"type": "item", "title": "الوقت", "body": "نص", "bridge": "اسحب"}
        self.assertEqual(cs.text.slide_text(item), ["الوقت", "نص", "اسحب"])


# A slide that carries every kind of visible field the visual language adds (visual language 3.4, 5.2; text.js `visualFields`).
VISUAL_SLIDE = {
    "type": "grid", "title": "Title",
    "items": [{"title": "Item", "text": "Text", "value": "2,500", "icon": "star", "hi": True, "mark": "tick"}],
    "demo": {"lines": [{"who": "ignored", "text": "Demo", "hi": True}], "caption": "Caption"},
    "visual": {"idea": "ignored", "why": "ignored", "alt": "ignored", "anchor": {
        "kind": "chart", "value": "99", "captions": ["Label"], "word": "Word", "unit": "Unit",
        "chart": {"kind": "bars-h", "values": [{"label": "Chart", "value": 99}], "unit": "ignored"},
        "mock": {"kind": "chat", "title": "Mock", "lines": [{"who": "me", "text": "Line"}], "items": ["Choice"], "caption": "Note", "stamp": "Stamp"}}},
}
VISUAL_FIELDS = [("items.0", "Item"), ("items-text.0", "Text"), ("items-value.0", "2,500"), ("demo.0", "Demo"), ("demo-caption", "Caption"),
                 ("anchor.captions.0", "Label"), ("anchor.word", "Word"), ("anchor.unit", "Unit"), ("chart.0.label", "Chart"),
                 ("mock.title", "Mock"), ("mock.lines.0", "Line"), ("mock.items.0", "Choice"), ("mock.caption", "Note"), ("mock.stamp", "Stamp")]


class VisualTextTests(unittest.TestCase):
    """The text a slide shows besides the old fields: the same list, in the same order, with the same keys as `visualFields` in text.js."""

    def test_the_fields_come_in_a_fixed_order_with_canonical_keys(self) -> None:
        self.assertEqual(cs.text.visual_fields(VISUAL_SLIDE), VISUAL_FIELDS)
        self.assertEqual(cs.text.visual_fields(VISUAL_SLIDE), cs.text.visual_fields(VISUAL_SLIDE), "run twice")

    def test_instructions_and_numeric_data_are_not_text(self) -> None:
        texts = [t for _k, t in cs.text.visual_fields(VISUAL_SLIDE)]
        for ignored in ("ignored", "99", "tick", "star"):
            self.assertNotIn(ignored, texts)
        self.assertEqual(cs.text.visual_fields({"type": "item", "title": "t"}), [])
        self.assertEqual(cs.text.visual_fields({"visual": {"anchor": {"kind": "icon"}}}), [])

    def test_slide_text_appends_them_after_the_old_fields_on_every_type(self) -> None:
        expected = [t for _k, t in VISUAL_FIELDS]
        self.assertEqual(cs.text.slide_text(VISUAL_SLIDE), ["Title"] + expected)
        quote = {**VISUAL_SLIDE, "type": "quote", "body": "Quote", "title": "dropped"}
        self.assertEqual(cs.text.slide_text(quote), ["Quote"] + expected)
        offer = {**VISUAL_SLIDE, "type": "offer", "number": {"value": "5", "unit": "ساعات"}, "bullets": ["b"], "cta": {"kind": "save", "text": "احفظ"}}
        self.assertEqual(cs.text.slide_text(offer)[:5], ["Title", "5 ساعات", "b", "احفظ", "Item"])

    def test_digits_follow_the_requested_system(self) -> None:
        self.assertEqual(cs.text.slide_text({"items": [{"value": "2,500"}]}, "arabic-indic"), ["٢٬٥٠٠"])
        self.assertEqual(cs.text.slide_text({"items": [{"value": "٢٬٥٠٠"}]}, "western"), ["2,500"])
        self.assertEqual(cs.text.slide_text({"items": [{"value": "2,500"}]}, None), ["2,500"])

    def test_every_word_counts_once(self) -> None:
        self.assertEqual(cs.text.word_counts(VISUAL_SLIDE), {"hero": 0, "title": 1, "body": 0, "total": 15, "bullets": []})
        two = {**VISUAL_SLIDE, "items": [{"title": "Item", "text": "Two words", "value": "2,500"}]}
        self.assertEqual(cs.text.word_counts(two)["total"], 16)
        old = {"type": "item", "title": "الوقت", "body": "نص قصير", "bullets": ["أ ب", "ج"], "bridge": "اسحب", "number": {"value": "5", "unit": "ساعات"}}
        self.assertEqual(cs.text.word_counts(old), {"hero": 0, "title": 1, "body": 2, "total": 1 + 2 + 3 + 1 + 2, "bullets": [2, 1]})

    def test_empty_strings_are_listed_and_never_become_text(self) -> None:
        slide = {"items": [{"title": "", "text": "   ", "value": ""}], "demo": {"lines": [{"text": ""}], "caption": ""}}
        self.assertEqual([k for k, _t in cs.text.visual_fields(slide)], ["items.0", "items-text.0", "items-value.0", "demo.0", "demo-caption"])
        self.assertEqual(cs.text.slide_text(slide), [])
        self.assertEqual(cs.text.word_counts(slide)["total"], 0)

    def test_values_of_the_wrong_type_are_skipped_and_the_next_one_keeps_its_index(self) -> None:
        slide = {"items": [{"title": 7}, {"title": "ok"}], "demo": {"lines": ["oops", {"text": "line"}], "caption": 3},
                 "visual": {"anchor": {"captions": [1, "cap"], "word": None, "chart": {"values": [{"label": 4}, {"label": "L"}]},
                                       "mock": {"lines": [3, {"text": "m"}], "items": [8, "choice"]}}}}
        self.assertEqual(cs.text.visual_fields(slide), [("items.1", "ok"), ("demo.1", "line"), ("anchor.captions.1", "cap"), ("chart.1.label", "L"),
                                                         ("mock.lines.1", "m"), ("mock.items.1", "choice")])
        for odd in (None, "x", 5, [], {"items": "x", "demo": "x", "visual": "x"}, {"visual": {"anchor": "x"}}, {"visual": {"anchor": {"mock": "x", "chart": 3}}}):
            self.assertEqual(cs.text.visual_fields(odd), [], repr(odd))

    def test_a_grouped_number_is_one_ltr_run_and_binds_its_noun(self) -> None:
        html = cs.text.to_html("2,500 خطوة")
        self.assertEqual(html.count('<bdi dir="ltr"'), 1)
        self.assertIn(">2,500</bdi></span>" + NBSP, html)
        self.assertEqual(cs.text.bind("2,500 خطوة"), "2,500" + NBSP + "خطوة")
        self.assertEqual(cs.text.to_html("2,500" + NBSP + "خطوة"), html, "an existing NBSP is kept, not doubled")


class LintTests(unittest.TestCase):
    def rules_of(self, s: str, **kw) -> set:
        return {i["rule"] for i in cs.lint.lint_text(s, **kw)}

    def test_clean_text_is_clean(self) -> None:
        self.assertEqual(cs.lint.lint_text("بتحفظ الكاروسيل بسهولة"), [])

    def test_double_space(self) -> None:
        self.assertIn("ORTHO-PUNCT-004", self.rules_of("نص  مكرر"))

    def test_two_digit_systems_block(self) -> None:
        issues = cs.lint.lint_text("اشتري٣ و 3")
        self.assertTrue(any(i["rule"] == "ORTHO-DIG-002" and i["sev"] == "BLOCK" for i in issues))

    def test_number_noun_unbound(self) -> None:
        self.assertNotIn("ORTHO-BIDI-002", self.rules_of("5 خطوات"))
        self.assertNotIn("ORTHO-BIDI-002", self.rules_of("5" + NBSP + "خطوات"))

    def test_autofix_applies_the_fixes(self) -> None:
        text = "نص  مكرر"
        self.assertEqual(cs.lint.apply_fixes(text, cs.lint.lint_text(text)), "نص مكرر")

    def test_spelled_one_is_not_a_hamza_error(self) -> None:
        self.assertFalse([i for i in cs.lint.lint_text("واحد") if i["rule"].startswith("ORTHO-HAMZA")])

    def test_issue_offsets_point_at_the_original_text(self) -> None:
        text = "نص  مكرر"
        issue = [i for i in cs.lint.lint_text(text) if i["rule"] == "ORTHO-PUNCT-004"][0]
        self.assertEqual(text[issue["start"]:issue["end"]], issue["original"])

    def test_digit_helpers(self) -> None:
        self.assertEqual(cs.lint.map_digits("1 ٢ 3", "western"), "1 2 3")
        found = cs.lint.digit_systems("1 ٢")
        self.assertTrue(found["western"] and found["arabicIndic"] and not found["persian"])


class RulesTests(unittest.TestCase):
    def test_bundle_sections(self) -> None:
        bundle = cs.rules.load_bundle()
        for key in ("qaRules", "copy", "ortho", "dialects", "platform", "locale"):
            self.assertIn(key, bundle)

    def test_platform_values_resolve(self) -> None:
        self.assertEqual(cs.rules.platform("plugin.cover.maxLines"), 3)
        self.assertEqual(cs.rules.platform("no.such.path", "dflt"), "dflt")

    def test_every_check_has_a_severity_and_both_messages(self) -> None:
        checks = cs.rules.index()["checks"]
        self.assertGreater(len(checks), 40)
        for cid, entry in checks.items():
            rule = cs.rules.check(cid)
            self.assertIn(rule["sev"], ("BLOCK", "FIX", "NOTE"), cid)
            self.assertTrue(rule["msg"]["ar"] and rule["msg"]["en"], cid)

    def test_unknown_check_is_a_usage_error(self) -> None:
        with self.assertRaises(cs.CSError):
            cs.rules.check("ZZ9.nothing")

    def test_fold_removes_marks_and_unifies_letters(self) -> None:
        self.assertEqual(cs.rules.fold_key("أَحْمَد"), "أحمد")
        self.assertEqual(cs.rules.fold_key("كَاروسيل"), cs.rules.fold_key("كاروسيل"))


class TextGateTests(unittest.TestCase):
    def test_clean_decks_pass(self) -> None:
        brand = load("brand.eg.creator.json")
        for name in ("spec.eg.8slides.json", "spec.gulf.9slides.json", "spec.levant.10slides.json"):
            spec = load(name)
            blocking = [r for r in cs.qa.run_text_gates(spec, brand if "gulf" not in name else load("brand.gulf.client.json")) if r["sev"] == "BLOCK"]
            self.assertEqual(blocking, [], name)

    def test_a_long_cover_blocks(self) -> None:
        spec = load("spec.eg.8slides.json")
        spec["slides"][0]["headline"] = "واحد اثنين ثلاثة أربعة خمسة ستة سبعة"
        results = cs.qa.run_text_gates(spec, load("brand.eg.creator.json"))
        rules = {(r["rule"], r["sev"]) for r in results}
        self.assertIn(("C1.hero-words", "BLOCK"), rules)

    def test_results_are_sorted_blocks_first(self) -> None:
        spec = load("spec.eg.8slides.json")
        spec["slides"][0]["headline"] = "واحد اثنين ثلاثة أربعة خمسة ستة سبعة"
        order = {"BLOCK": 0, "FIX": 1, "NOTE": 2}
        sev = [order[r["sev"]] for r in cs.qa.run_text_gates(spec, load("brand.eg.creator.json"))]
        self.assertEqual(sev, sorted(sev))


CORPUS = REPO / "tests" / "conformance" / "corpus"
FIELD_KINDS = {"items", "items-text", "items-value", "demo", "demo-caption", "anchor.captions", "anchor.word", "anchor.unit", "chart.label",
               "mock.title", "mock.lines", "mock.items", "mock.caption", "mock.stamp"}


def field_kind(key: str) -> str:
    """`s03.items-text.2` -> `items-text`; `s05.chart.0.label` -> `chart.label`; `s06.mock.lines.1` -> `mock.lines`."""
    rest = re.sub(r"^s[0-9]{2}\.", "", key)
    return re.sub(r"\.[0-9]+", "", rest)


class VisualQaTests(unittest.TestCase):
    """The text gates see the fields of the visual language, each under its own key (`s03.items.1`, `s06.mock.caption` ...)."""

    def test_slide_fields_list_them_after_the_old_fields_with_keys(self) -> None:
        slide = {"id": "s04", **VISUAL_SLIDE, "bridge": "Bridge", "cta": {"kind": "save", "text": "Cta"}}
        fields = cs.qa.slide_fields(slide)
        self.assertEqual([f["key"] for f in fields], ["s04.title", "s04.bridge", "s04.cta"] + ["s04." + k for k, _t in VISUAL_FIELDS])
        self.assertEqual([f["text"] for f in fields[3:]], [t for _k, t in VISUAL_FIELDS])
        extra = fields[3]
        self.assertEqual((extra["slide"], extra["field"], extra["index"]), ("s04", "items.0", None))
        self.assertEqual(cs.qa.slide_fields(slide), fields, "run twice")
        self.assertEqual(cs.qa.slide_fields({"type": "item", "demo": {"lines": [{"text": "x"}]}})[0]["key"], "s00.demo.0")
        self.assertEqual(cs.qa.slide_fields({"id": "s01", "items": [{"title": "  ", "text": ""}]}), [], "empty text is not a field")

    def test_slide_strings_put_them_before_the_bridge_and_the_call_to_action(self) -> None:
        slide = {**VISUAL_SLIDE, "attribution": "Who", "bridge": "Bridge", "cta": {"kind": "save", "text": "Cta"}}
        all_visual = [t for _k, t in VISUAL_FIELDS]
        self.assertEqual(cs.qa.slide_strings(slide, False, False), ["Title", "Who"] + all_visual)
        self.assertEqual(cs.qa.slide_strings(slide, True, True), ["Title", "Who"] + all_visual + ["Bridge", "Cta"])
        self.assertEqual(cs.qa.slide_words(slide, True, True), 15 + 3)

    def test_the_words_of_items_and_a_demo_reach_the_slide_limits(self) -> None:
        spec = load("spec.eg.8slides.json")
        spec["slides"][2] = {"id": "s03", "n": 3, "type": "grid", "title": "ست أدوات بتفرق",
                             "items": [{"title": "واحد اثنين ثلاثة", "text": "أربعة خمسة ستة سبعة ثمانية"}] * 6}
        found = {(r["rule"], r.get("el")) for r in cs.qa.run_text_gates(spec, None)}
        self.assertIn(("C2.slide-words", "s03"), found)
        spec["slides"][2] = {"id": "s03", "n": 3, "type": "item", "title": "قصير", "body": "نص"}
        self.assertNotIn(("C2.slide-words", "s03"), {(r["rule"], r.get("el")) for r in cs.qa.run_text_gates(spec, None)})

    def test_a_run_counts_every_gate_even_when_it_finds_nothing(self) -> None:
        spec = load("spec.eg.8slides.json")
        ran = cs.qa.run_text_gates(spec, load("brand.eg.creator.json"))
        counts = ran.stats["gates"]
        text_gates = sorted(g for g, _r in cs.qa.TEXT_GATES)
        # every text gate ran once, finding or not; every other registered gate or check is listed with 0 (the report schema allows it), so a gate that
        # is registered but has nothing to run in this engine is told from an id nobody knows
        self.assertEqual(sorted(g for g, n in counts.items() if n), text_gates)
        self.assertTrue(all(n == 1 for n in counts.values() if n))
        self.assertGreater(len(counts), len(text_gates))
        for registered in ("A1", "D9.band", "VA9.anchor-unbuilt", "C2.text-dropped", "C2.word-echo"):
            self.assertEqual(counts.get(registered), 0, registered)
        for gate_id, n in (("C2", 1), ("N1", 1)):
            self.assertEqual(counts[gate_id], n)
        only = cs.qa.run_text_gates(spec, None, gates=["C2"]).stats["gates"]
        self.assertEqual({g: n for g, n in only.items() if n}, {"C2": 1})
        self.assertEqual(set(only), set(counts), "a run of one gate lists the same registered ids")
        both = cs.qa.run_text_gates(spec, None, gates=["C2", "N1"]).stats["gates"]
        self.assertEqual({g: n for g, n in both.items() if n}, {"C2": 1, "N1": 1})
        self.assertIsInstance(ran, list)

    def mutations(self) -> list:
        return json.loads((CORPUS / "mutations.visual.json").read_text(encoding="utf-8"))["mutations"]

    def test_the_corpus_plants_a_defect_in_every_kind_of_new_field(self) -> None:
        planted = {field_kind(e["el"]) for m in self.mutations() for e in m.get("expect", []) if not e.get("absent")}
        self.assertEqual(FIELD_KINDS - planted, set())
        controls = {field_kind(e["el"]) for m in self.mutations() for e in m.get("expect", []) if e.get("absent")}
        self.assertEqual(FIELD_KINDS - controls, set(), "and a clean control for each kind")

    def test_the_engine_finds_each_planted_defect_and_none_of_the_controls(self) -> None:
        for m in self.mutations():
            spec = cs.patch.apply_patch(load(m["base"]), m["patch"])
            brand = load(m["brand"]) if m.get("brand") else None
            results = cs.qa.run_text_gates(spec, brand)
            for e in m.get("expect", []):
                hit = any(r["gate"] == e["gate"] and r.get("el") == e["el"] and (not e.get("rule") or r["rule"] == e["rule"]) for r in results)
                self.assertEqual(hit, not e.get("absent"), "%s: %s %s" % (m["id"], e["gate"], e["el"]))

    def test_every_planted_mutation_is_a_valid_spec(self) -> None:
        for m in self.mutations():
            spec = cs.patch.apply_patch(load(m["base"]), m["patch"])
            errors = [e for e in cs.schema.validate_named("spec", spec) if not m["id"].endswith("odd-values")]
            self.assertEqual(errors, [], m["id"])


class ConformanceRunnerTests(unittest.TestCase):
    """tests/conformance/run_py.py: how it reads the corpus, which findings both engines own, and when a run proves nothing."""

    @classmethod
    def setUpClass(cls) -> None:
        cls.py = support.load_module(REPO / "tests" / "conformance" / "run_py.py", "run_py_under_test")

    def tree(self, files: dict) -> Path:
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        for name, doc in files.items():
            path = Path(tmp.name) / "tests" / "conformance" / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(doc), encoding="utf-8")
        return Path(tmp.name)

    def test_the_loader_reads_corpus_and_visual_in_path_order_and_ignores_other_keys(self) -> None:
        root = self.tree({"corpus/strings.json": {"strings": ["a"], "colors": [["#000", "#fff"]]}, "corpus/zz/more.json": {"strings": ["c"]},
                          "corpus/mutations.json": {"mutations": [{"id": "m1"}]}, "visual/vectors.json": {"vectors": [1], "strings": ["b"], "requireExecuted": ["VA1"]},
                          "visual/deep/deeper/x.json": {"mutations": [{"id": "m2"}], "slides": [{"id": "s01"}]}, "elsewhere/y.json": {"strings": ["no"]}})
        with mock.patch.object(self.py, "ROOT", root):
            corpus = self.py.load_corpus()
        self.assertEqual(corpus["files"], ["corpus/mutations.json", "corpus/strings.json", "corpus/zz/more.json", "visual/deep/deeper/x.json", "visual/vectors.json"])
        self.assertEqual(corpus["strings"], ["a", "c", "b"])
        self.assertEqual([m["id"] for m in corpus["mutations"]], ["m1", "m2"])
        self.assertEqual((corpus["slides"], corpus["requireExecuted"], corpus["colors"]), ([{"id": "s01"}], ["VA1"], [["#000", "#fff"]]))
        self.assertNotIn("vectors", corpus)

    def test_a_repeated_mutation_id_stops_the_run(self) -> None:
        root = self.tree({"corpus/a.json": {"mutations": [{"id": "same"}]}, "visual/b.json": {"mutations": [{"id": "same"}]}})
        with mock.patch.object(self.py, "ROOT", root), self.assertRaises(SystemExit):
            self.py.load_corpus()

    def test_the_shipped_corpus_has_every_file_and_unique_ids(self) -> None:
        corpus = self.py.load_corpus()
        self.assertEqual(self.py.load_corpus(), corpus, "run twice")
        for name in ("corpus/strings.json", "corpus/strings.visual.json", "corpus/mutations.json", "corpus/mutations.visual.json", "corpus/slides.visual.json",
                     "corpus/mutations.plan.json", "corpus/executed.json"):
            self.assertIn(name, corpus["files"])
        ids = [m["id"] for m in corpus["mutations"]]
        self.assertEqual(len(ids), len(set(ids)))
        self.assertGreaterEqual((len(corpus["mutations"]), len(corpus["slides"])), (50, 20))

    def test_only_findings_both_engines_implement_are_compared(self) -> None:
        rules = {"gates": [
            {"id": "C2", "engines": ["py", "js"], "checks": [{"id": "C2.a"}, {"id": "C2.b", "deferred": {"engines": ["py"], "by": "Q6"}}, {"id": "C2.c", "engines": ["js"]}]},
            {"id": "X", "engines": ["js"], "checks": [{"id": "X.a"}]}]}
        shared = self.py.shared_filter(rules)
        self.assertTrue(shared({"gate": "C2", "rule": "C2.a"}))
        self.assertFalse(shared({"gate": "C2", "rule": "C2.b"}), "deferred for py until its twin exists")
        self.assertFalse(shared({"gate": "C2", "rule": "C2.c"}))
        self.assertTrue(shared({"gate": "C2", "rule": "C2.some-dynamic-rule"}), "a rule id that is no check id follows its gate")
        self.assertFalse(shared({"gate": "X", "rule": "X.a"}))
        self.assertFalse(shared({"gate": "ZZ", "rule": "ZZ.a"}))
        rules["gates"][0]["checks"][1].pop("deferred")
        self.assertTrue(self.py.shared_filter(rules)({"gate": "C2", "rule": "C2.b"}), "the flag removed, the finding joins the comparison")

    def test_a_gate_that_never_ran_fails_the_comparison(self) -> None:
        rules = {"gates": [
            {"id": "T", "scope": "text", "engines": ["py", "js"], "checks": [{"id": "T.a"}]},
            {"id": "V", "scope": "spec", "engines": ["py", "js"], "checks": [{"id": "V.a", "deferred": {"engines": ["py"], "by": "Q6"}}]},
            {"id": "P", "scope": "spec", "engines": ["py", "js"], "checks": [{"id": "P.a", "deferred": {"engines": ["py", "js"], "by": "wave 3"}}]},
            {"id": "R", "scope": "rendered", "engines": ["js"], "checks": [{"id": "R.a"}]}]}
        py = {"executed": {g: 3 for g, _runner in cs.qa.TEXT_GATES}}
        js = {"executed": {"T": 3, "V.a": 3}}
        self.assertEqual(self.py.executed_problems(js, py, rules), [])
        problems = self.py.executed_problems({"executed": {"T": 3}}, py, rules)
        self.assertEqual(len(problems), 1)
        self.assertIn("V", problems[0])
        self.assertIn("JavaScript", problems[0])
        problems = self.py.executed_problems({"executed": {"T": 0, "V.a": 3}}, py, rules)
        self.assertEqual(len(problems), 1)
        self.assertIn("T", problems[0])
        gone = {"executed": {k: v for k, v in py["executed"].items() if k != "C2"}}
        problems = self.py.executed_problems(js, gone, rules)
        self.assertEqual((len(problems), "C2" in problems[0], "Python" in problems[0]), (1, True, True))
        extra = self.py.executed_problems({**js, "requireExecuted": ["VA9.never"]}, py, rules)
        self.assertEqual((len(extra), "VA9.never" in extra[0]), (1, True))
        two = {"gates": [{"id": "V", "scope": "spec", "engines": ["py", "js"], "checks": [
            {"id": "V.a", "deferred": {"engines": ["py"], "by": "Q6"}}, {"id": "V.b", "deferred": {"engines": ["py"], "by": "Q6"}}]}]}
        problems = self.py.executed_problems({"executed": {"V.a": 2}}, py, two)
        self.assertEqual((len(problems), "V.b" in problems[0]), (1, True), "the gate ran, one of its checks did not")

    # ---- who owns a check, per check (a text check can sit inside a rendered gate) ------------------------------------------

    RULES = {"gates": [
        {"id": "G", "scope": "rendered", "engines": ["js"], "checks": [{"id": "G.shape"}, {"id": "G.glyph", "scope": "text"}]},
        {"id": "B", "scope": "text+rendered", "engines": ["py", "js"], "checks": [{"id": "B.a"}, {"id": "B.box", "engines": ["js"]}]},
        {"id": "M", "scope": "text+model", "engines": ["py", "js", "model"], "checks": [{"id": "M.a"}, {"id": "M.veto", "engines": ["model"]}]},
        {"id": "D", "scope": "text", "engines": ["py", "js"], "checks": [{"id": "D.a"}, {"id": "D.run", "scope": "spec", "deferred": {"engines": ["py"], "by": "Q6"}}]}]}

    def test_the_scope_and_the_engines_are_resolved_per_check(self) -> None:
        table = self.py.check_table(self.RULES)
        self.assertEqual({c: (r["text"], r["engines"]) for c, r in table.items()}, {
            "G.shape": (False, ["js"]), "G.glyph": (True, ["js"]), "B.a": (True, ["py", "js"]), "B.box": (False, ["js"]),
            "M.a": (True, ["py", "js", "model"]), "M.veto": (False, ["model"]), "D.a": (True, ["py", "js"]), "D.run": (True, ["js"])})
        py = {"executed": {g: 1 for g, _runner in cs.qa.TEXT_GATES}}
        ran = {"executed": {"B": 2, "M": 2, "D": 2, "G.glyph": 2, "D.run": 2}}
        self.assertEqual(self.py.executed_problems(ran, py, self.RULES), [])
        for label, counts in (("missing", {"B": 2, "M": 2, "D": 2, "D.run": 2}), ("zero", {"B": 2, "M": 2, "D": 2, "D.run": 2, "G.glyph": 0}),
                              ("its rendered gate ran, the check did not", {"B": 2, "M": 2, "D": 2, "D.run": 2, "G": 7, "G.shape": 7})):
            problems = self.py.executed_problems({"executed": counts}, py, self.RULES)
            self.assertEqual(len(problems), 1, label)
            self.assertIn("G.glyph", problems[0], label)
            self.assertIn("JavaScript", problems[0], label)
        problems = self.py.executed_problems({"executed": {"B": 2, "M": 2, "D": 2, "G.glyph": 2}}, py, self.RULES)
        self.assertEqual((len(problems), "D.run" in problems[0]), (1, True), "the gate D ran; its deferred spec check did not (the gate count stands for no check)")

    def test_the_planted_findings_belong_to_the_engine_that_implements_the_check(self) -> None:
        rules = {"gates": [
            {"id": "C2", "engines": ["py", "js"], "checks": [{"id": "C2.a"}, {"id": "C2.b", "deferred": {"engines": ["py"], "by": "Q6"}}]},
            {"id": "X", "engines": ["js"], "checks": [{"id": "X.a"}]}, {"id": "P", "engines": ["py"], "checks": [{"id": "P.a"}]}]}
        owns = self.py.engine_owner(rules)
        self.assertEqual([owns("js", "C2", "C2.b"), owns("py", "C2", "C2.b"), owns("py", "C2", "C2.a"), owns("js", "C2", "C2.a")], [True, False, True, True])
        self.assertEqual([owns("js", "X", "X.a"), owns("py", "X", "X.a"), owns("py", "P", "P.a"), owns("js", "P"), owns("py", "ZZ")], [True, False, True, False, False])
        self.assertTrue(owns("py", "C2", "C2.some-dynamic-rule"), "a rule id that is no check id follows its gate")
        findings = [{"gate": "C2", "rule": "C2.b", "sev": "FIX", "el": "s03.x", "slide": "s03"}, {"gate": "C2", "rule": "C2.c", "sev": "NOTE", "slide": "s04"}]
        self.assertFalse(self.py.shared_filter(rules)(findings[0]), "the comparison does not see it ...")
        hit = self.py.expectation_hit
        self.assertTrue(hit(findings, {"gate": "C2", "el": "s03.x", "rule": "C2.b", "sev": "FIX"}), "... the planted entry does")
        self.assertFalse(hit(findings, {"gate": "C2", "el": "s03.x", "rule": "C2.b", "sev": "BLOCK"}))
        self.assertTrue(hit(findings, {"gate": "C2", "slide": "s04"}), "a finding that has a slide and no element key")
        self.assertFalse(hit(findings, {"gate": "C2", "slide": "s05"}))
        self.assertTrue(hit(findings, {"gate": "C2", "slide": "s03", "el": "s03.x"}))
        self.assertFalse(hit(findings, {"gate": "C2", "el": "s09.x"}))

    def test_an_expectation_that_names_no_gate_or_nothing_to_look_at_stops_the_run(self) -> None:
        rules = {"gates": [{"id": "C2", "engines": ["py", "js"], "checks": [{"id": "C2.a"}]}]}
        for bad in ({"gate": "ZZ", "el": "s01"}, {"gate": "C2", "rule": "C3.x", "el": "s01"}, {"gate": "C2"}, {"gate": "C2", "absent": True}):
            with self.assertRaises(SystemExit, msg=str(bad)):
                self.py.check_expectations({"mutations": [{"id": "m", "expect": [bad]}]}, rules)
        fine = [{"gate": "C2", "rule": "C2.a", "slide": "s01"}, {"gate": "C2", "el": "s01.title", "absent": True}, {"gate": "C2", "rule": "C2.dynamic-id", "el": "s01"}]
        self.py.check_expectations({"mutations": [{"id": "m", "expect": fine}, {"id": "n"}]}, rules)

    def shipped_javascript_counts(self) -> dict:
        """A JavaScript run in which every text check the shipped rules give to JavaScript ran: shared ones under their gate, the others
        (deferred for py, or JavaScript by design) under their own id."""
        counts = {}
        for cid, row in self.py.check_table(self.py.qa_rules()).items():
            if row["text"] and "js" in row["engines"]:
                counts[row["gate"] if "py" in row["engines"] else cid] = 3
        return counts

    def compare_exit(self, py_executed: dict, js_executed: dict) -> tuple:
        """`run_py.py --compare` end to end, with the two engines agreeing on every verdict but the executed counts."""
        mine = {"executed": py_executed, "requireExecuted": []}
        theirs = {"executed": {**js_executed, **py_executed}, "requireExecuted": []}
        out = io.StringIO()
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "verdicts.js.json"
            path.write_text(json.dumps(theirs), encoding="utf-8")
            with mock.patch.object(self.py, "compute", return_value=(mine, [], {"mutations": [], "slides": [], "files": []})), contextlib.redirect_stdout(out):
                code = self.py.main(["--compare", str(path)])
        return code, out.getvalue()

    def test_a_missing_or_zero_glyph_icon_count_makes_the_comparison_exit_2(self) -> None:
        rules = self.py.qa_rules()
        row = self.py.check_table(rules)["D10.glyph-icon"]
        self.assertEqual((row["gate"], row["text"], row["engines"]), ("D10", True, ["js"]), "a text check inside the rendered gate D10")
        py_executed = {g: 1 for g, _runner in cs.qa.TEXT_GATES}
        counts = self.shipped_javascript_counts()
        self.assertEqual(self.py.executed_problems({"executed": counts}, {"executed": py_executed}, rules), [])
        code, out = self.compare_exit(py_executed, counts)
        self.assertEqual(code, 0, out)
        for label, change in (("missing", lambda d: d.pop("D10.glyph-icon")), ("zero", lambda d: d.__setitem__("D10.glyph-icon", 0))):
            counts = self.shipped_javascript_counts()
            change(counts)
            problems = self.py.executed_problems({"executed": counts}, {"executed": py_executed}, rules)
            self.assertEqual(len(problems), 1, label)
            self.assertIn("D10.glyph-icon", problems[0], label)
            code, out = self.compare_exit(py_executed, counts)
            self.assertEqual(code, 2, label + ": " + out)
            self.assertIn("D10.glyph-icon", out, label)

    def test_every_javascript_only_text_check_is_listed_in_the_corpus_as_required(self) -> None:
        rules = self.py.qa_rules()
        table = self.py.check_table(rules)
        only_javascript = {c for c, r in table.items() if r["text"] and r["engines"] == ["js"]}
        listed = set(self.py.load_corpus()["requireExecuted"])
        self.assertEqual(sorted(only_javascript - listed), [], "a check only JavaScript runs that the corpus does not require")
        self.assertEqual(sorted(listed - set(table) - {g["id"] for g in rules["gates"]}), [], "an id of the list that no rule knows")
        self.assertIn("D10.glyph-icon", listed)
        for rendered in ("B1.isolation", "D10.nesting", "VA2.anchor-size"):
            self.assertNotIn(rendered, only_javascript, "a rendered check is not run as text")

    def test_the_plan_mutations_plant_each_capability_defect_and_are_valid_specs(self) -> None:
        owns = self.py.engine_owner(self.py.qa_rules())
        doc = json.loads((CORPUS / "mutations.plan.json").read_text(encoding="utf-8"))
        planted = set()
        for m in doc["mutations"]:
            self.assertEqual(cs.schema.validate_named("spec", cs.patch.apply_patch(load(m["base"]), m["patch"])), [], m["id"])
            if m.get("brand"):
                brand = cs.patch.apply_patch(load(m["brand"]), m["brandPatch"])
                self.assertEqual(cs.schema.validate_named("brand", brand), [], m["id"])
            for e in m["expect"]:
                self.assertTrue(owns("js", e["gate"], e.get("rule")), "%s: JavaScript owns %s" % (m["id"], e.get("rule")))
                if not e.get("absent"):
                    planted.add((e["rule"], e["el"].split(".", 1)[-1] if e.get("el") else None))
        needed = {("VA3.valid", "anchor"), ("VA3.valid", "recipe"), ("VA3.valid", "variant"), ("VA3.valid", "anchor.icon"), ("VA3.valid", "anchor.object"),
                  ("VA3.valid", "items"), ("VA7.agreement", "anchor.icon"), ("VA8.constraints", "anchor.icon"), ("D10.glyph-icon", "title"),
                  ("VA4.chart-honesty", "chart"), ("C2.demo-missing", None), ("C2.figure-repeat", None)}
        self.assertEqual(sorted(needed - planted, key=str), [])

    def test_compare_reports_a_difference_and_tolerates_rounding(self) -> None:
        self.assertEqual(self.py.compare({"a": [1, {"b": "x"}], "f": 1.0}, {"a": [1, {"b": "x"}], "f": 1.0 + 1e-12}), [])
        diffs = self.py.compare({"a": [1, {"b": "x"}], "k": 1}, {"a": [1, {"b": "y"}], "k": 1, "extra": 2})
        self.assertEqual([d[0] for d in diffs], ["/a[1]/b", "/extra"])
        self.assertEqual(self.py.compare({"x": [1, 2]}, {"x": [1]})[0][0], "/x[len]")


class ReportTests(unittest.TestCase):
    def test_format_msg(self) -> None:
        self.assertEqual(cs.report.format_msg("a {x} b {y}", {"x": 3, "y": "z"}), "a 3 b z")

    def test_summarize_counts_and_exit_codes(self) -> None:
        self.assertEqual(cs.report.summarize([])["exitCode"], 0)
        fix = [{"rule": "C1.lines", "sev": "FIX", "slide": "s01", "msg": {"ar": "x", "en": "y"}}]
        s = cs.report.summarize(fix)
        self.assertEqual((s["status"], s["counts"]["fix"], s["exitCode"]), ("fix", 1, 1))
        block = [{"rule": "C1.hero-words", "sev": "BLOCK", "slide": "s01", "msg": {"ar": "x", "en": "y"}}]
        self.assertEqual(cs.report.summarize(block)["exitCode"], 2)

    def test_report_matches_its_schema(self) -> None:
        spec = load("spec.eg.8slides.json")
        spec["slides"][0]["headline"] = "واحد اثنين ثلاثة أربعة خمسة ستة سبعة"
        results = cs.qa.run_text_gates(spec, load("brand.eg.creator.json"))
        report = cs.report.to_report(spec, results)
        self.assertEqual(cs.schema.validate_named("qa-report", report), [])
        self.assertEqual(report["status"], "block")
        self.assertEqual(report["counts"]["block"], sum(1 for r in results if r["sev"] == "BLOCK"))

    def test_markdown_lists_the_findings_in_both_languages(self) -> None:
        spec = load("spec.eg.8slides.json")
        spec["slides"][0]["headline"] = "واحد اثنين ثلاثة أربعة خمسة ستة سبعة"
        report = cs.report.to_report(spec, cs.qa.run_text_gates(spec, load("brand.eg.creator.json")))
        self.assertIn("C1.hero-words", cs.report.to_markdown(report, "ar"))
        self.assertIn("C1.hero-words", cs.report.to_markdown(report, "en"))


if __name__ == "__main__":
    unittest.main()
