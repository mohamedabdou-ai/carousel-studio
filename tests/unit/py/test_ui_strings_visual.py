"""U3a: runtime/ui-strings-visual.json, the Studio strings of the Visual tab and its basic editors (slice scope: kind chips, plan buttons, lock,
the quiet «اتضافت صور تلقائي» line, the items editor, the demo editor, the numeral editor, the chart-values editor with the source field).

The file has the shape of ui-strings.json (`strings: {key: {eg, gulf, levant, msa-white, en}}`) and `build_studio.py` merges it into the page's
`cs-ui-strings` block, refusing a key that ui-strings.json already defines. What this test holds it to:

* the shape and the bytes: five dialects on every key, the same `{placeholders}` in every dialect, keys under `vis.`, nothing that already
  exists in ui-strings.json (`type.grid`, `type.timeline`, `variant.bento` and `variant.rail` live there), one canonical serialisation, a second
  read gives the same bytes;
* the key list is the contract with the editors (U2a reads these keys with `t("...")`): REQUIRED_KEYS below is that published list, and the dynamic
  families (`vis.tab.kind.<kind>`, `vis.demo.<who>`) are complete for every value the schema allows;
* the Arabic Editor gates, run over the product's own words in every dialect: `_cs.lint.lint_text` finds nothing at BLOCK or FIX (spelling, digits,
  bidi, number-noun binding, dialect markers), digits are Western, Arabic punctuation, no tatweel, no tashkeel beyond the shadda and the tanwin
  that the Studio's other strings already use, no direction marks, no markup, no credit text.

U3b (the rest of the keys: picker, size ladder, recipes, tone, marks, strip, remix) extends the same file and this test.
"""
from __future__ import annotations

import json
import re
import unicodedata
import unittest
from pathlib import Path

try:
    import b7_support as support
except ImportError:  # `python -X utf8 -m unittest tests.unit.py.test_ui_strings_visual`: the folder is a package here
    from . import b7_support as support

REPO = Path(__file__).resolve().parents[3]
SKILL = REPO / "plugins" / "carousel-studio" / "skills" / "carousel-design"
FILE = SKILL / "runtime" / "ui-strings-visual.json"
BASE_FILE = SKILL / "runtime" / "ui-strings.json"

DIALECTS = ("eg", "gulf", "levant", "msa-white", "en")
ARABIC_DIALECTS = ("eg", "gulf", "levant", "msa-white")
MAX_BYTES = 25_000            # IS-4 cap for the whole visual strings file (the lite file is about 11 KB)
LITE_MIN, LITE_MAX = 36, 52   # "about 40 keys" (r2 3.2); U3b raises LITE_MAX when it adds the rest
OWNER_STRINGS = ("محمد عبده", "Mohamed Abdou", "mohamed.abdou90", "mohamedabdou", "pyraai")
PLACEHOLDERS = {"n", "max"}   # the placeholder vocabulary of the lite keys; U3b adds its own
SAMPLES = ({"n": "3", "max": "6"}, {"n": "12", "max": "6"})

# the anchor kinds the slice ships (r2 3.1) plus the two chips that are not kinds
SLICE_KINDS = ("icon", "numeral", "chart", "mock", "rows", "field", "word")
DEMO_WHO = ("me", "them", "sys")      # schema demoLine.who

# The published key list (U2a's contract). Keep it sorted; U3b appends its keys to a separate tuple.
REQUIRED_KEYS = (
    "vis.chart.add", "vis.chart.count", "vis.chart.illustrative", "vis.chart.label", "vis.chart.source", "vis.chart.source.hint",
    "vis.chart.title", "vis.chart.value",
    "vis.demo.add", "vis.demo.caption", "vis.demo.count", "vis.demo.hint", "vis.demo.me", "vis.demo.sys", "vis.demo.them", "vis.demo.title",
    "vis.items.add", "vis.items.count", "vis.items.icon", "vis.items.item", "vis.items.title", "vis.items.value",
    "vis.note.planned", "vis.note.planned.hint",
    "vis.numeral.hint", "vis.numeral.title",
    "vis.tab.kind", "vis.tab.kind.auto", "vis.tab.kind.chart", "vis.tab.kind.field", "vis.tab.kind.icon", "vis.tab.kind.mock",
    "vis.tab.kind.none", "vis.tab.kind.numeral", "vis.tab.kind.rows", "vis.tab.kind.word",
    "vis.tab.lock", "vis.tab.lock.hint", "vis.tab.locked",
    "vis.tab.plan", "vis.tab.plan.slide", "vis.tab.replan", "vis.tab.replan.hint",
    "vis.tab.why", "vis.tab.word",
)

KEY_RE = re.compile(r"^[a-zA-Z0-9]+(\.[A-Za-z0-9_\-]+)+$")          # the same rule test_build_studio holds every key to
PLACEHOLDER_RE = re.compile(r"\{([A-Za-z0-9_]+)\}")
ARABIC_RE = re.compile("[\u0600-\u06ff]")
ALLOWED_MARKS = {"\u0651", "\u064b"}                          # shadda (خطّط) and fathatan before alef (تلقائيًا), as in ui-strings.json
DIGIT_OTHER = re.compile("[\u0660-\u0669\u06f0-\u06f9]")           # Arabic-Indic and Persian digits: the Studio's one digit system is Western
BIDI_CONTROLS = re.compile("[\u200e\u200f\u202a-\u202e\u2066-\u2069\u061c]")
lint = None
BUILDER = None


def setUpModule() -> None:
    """The proofreading library and the builder are loaded here, not at import (the policy job imports every module first)."""
    global lint, BUILDER
    BUILDER = support.load_script("carousel-design", "build_studio.py", "build_studio_u3a_under_test")
    from _cs import lint as _lint  # noqa: PLC0415
    lint = _lint


def tearDownModule() -> None:
    support.cleanup()


def forms(value):
    """The strings of one dialect entry: the text itself, or every plural form of it (zero, one, two, few, many, other)."""
    return list(value.values()) if isinstance(value, dict) else [value]


def fill(text: str, sample: dict) -> str:
    return PLACEHOLDER_RE.sub(lambda m: sample.get(m.group(1), "1"), text)


class Base(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.raw = FILE.read_bytes()
        cls.doc = json.loads(cls.raw.decode("utf-8"))
        cls.strings = cls.doc["strings"]
        cls.base = json.loads(BASE_FILE.read_text(encoding="utf-8"))["strings"]


class TestShapeAndBytes(Base):
    def test_the_file_has_the_shape_of_ui_strings(self):
        self.assertEqual(sorted(self.doc), ["dataVersion", "schemaVersion", "strings"])
        self.assertEqual(self.doc["schemaVersion"], 1)
        self.assertEqual(self.doc["dataVersion"], "1.1.0")
        self.assertIsInstance(self.strings, dict)

    def test_bytes_are_canonical_utf8_lf_and_stable(self):
        self.assertFalse(self.raw.startswith(b"\xef\xbb\xbf"), "no byte order mark")
        self.assertNotIn(b"\r", self.raw, "LF line endings")
        self.assertTrue(self.raw.endswith(b"\n") and not self.raw.endswith(b"\n\n"))
        canonical = json.dumps({**self.doc, "strings": {k: self.strings[k] for k in sorted(self.strings)}}, ensure_ascii=False, indent=1) + "\n"
        self.assertEqual(self.raw.decode("utf-8"), canonical, "sorted keys, one space of indent, as ui-strings.json is written")
        again = FILE.read_bytes()
        self.assertEqual(self.raw, again, "a second read gives the same bytes")
        self.assertEqual(json.loads(again.decode("utf-8")), self.doc)

    def test_size_and_key_count(self):
        self.assertLessEqual(len(self.raw), MAX_BYTES)
        self.assertGreaterEqual(len(self.strings), LITE_MIN)
        self.assertLessEqual(len(self.strings), LITE_MAX, "the lite card is about 40 keys; the rest belongs to U3b")

    def test_no_key_is_already_in_ui_strings_and_the_builder_merges_both(self):
        clash = sorted(set(self.strings) & set(self.base))
        self.assertEqual(clash, [], "build_studio.py refuses a key that ui-strings.json defines")
        merged = BUILDER.load_ui_strings(SKILL, False)["strings"]
        self.assertTrue(set(self.strings) <= set(merged))
        self.assertEqual(len(merged), len(self.base) + len(self.strings))
        self.assertEqual(merged["vis.tab.plan"], self.strings["vis.tab.plan"])

    def test_keys_are_dotted_under_vis(self):
        for key in self.strings:
            self.assertRegex(key, KEY_RE, key)
            self.assertTrue(key.startswith("vis."), f"{key}: this file owns the vis.* family")

    def test_the_grid_and_timeline_names_stay_in_ui_strings(self):
        for key in ("type.grid", "type.timeline", "variant.bento", "variant.rail"):
            self.assertIn(key, self.base)
            self.assertNotIn(key, self.strings)


class TestKeyListContract(Base):
    def test_every_published_key_exists(self):
        self.assertEqual(list(REQUIRED_KEYS), sorted(REQUIRED_KEYS), "keep the published list sorted")
        self.assertEqual(len(set(REQUIRED_KEYS)), len(REQUIRED_KEYS))
        self.assertEqual([k for k in REQUIRED_KEYS if k not in self.strings], [])

    def test_the_lite_file_holds_nothing_unpublished(self):
        extra = sorted(set(self.strings) - set(REQUIRED_KEYS))
        self.assertEqual(extra, [], "a key the editors cannot know about; add it to REQUIRED_KEYS when it is meant to ship")

    def test_the_kind_chip_family_is_complete(self):
        for kind in ("auto", "none", *SLICE_KINDS):
            self.assertIn(f"vis.tab.kind.{kind}", self.strings)

    def test_the_demo_who_family_covers_the_schema_enum(self):
        for who in DEMO_WHO:
            self.assertIn(f"vis.demo.{who}", self.strings, "t('vis.demo.' + who) must never show a key")

    def test_every_dialect_has_every_key_and_nothing_is_empty(self):
        for key, entry in self.strings.items():
            self.assertEqual(sorted(entry), sorted(DIALECTS), key)
            for dialect, value in entry.items():
                for text in forms(value):
                    self.assertIsInstance(text, str, f"{key}/{dialect}")
                    self.assertTrue(text.strip(), f"{key}/{dialect} is empty")

    def test_placeholders_agree_across_dialects_and_stay_in_the_vocabulary(self):
        for key, entry in self.strings.items():
            sets = {d: sorted({m for text in forms(v) for m in PLACEHOLDER_RE.findall(text)}) for d, v in entry.items()}
            self.assertEqual(len({tuple(v) for v in sets.values()}), 1, f"{key}: {sets}")
            self.assertLessEqual(set(sets["en"]), PLACEHOLDERS, key)
        for key in ("vis.items.count", "vis.demo.count", "vis.chart.count"):
            self.assertEqual(sorted(PLACEHOLDER_RE.findall(self.strings[key]["eg"])), ["max", "n"], key)
        self.assertEqual(PLACEHOLDER_RE.findall(self.strings["vis.items.item"]["eg"]), ["n"])

    def test_the_owner_phrases_of_the_spec_are_kept_word_for_word(self):
        self.assertEqual(self.strings["vis.tab.plan"]["eg"], "خطّط الصور")
        self.assertEqual(self.strings["vis.tab.replan"]["eg"], "خطّط تاني")
        self.assertEqual(self.strings["vis.note.planned"]["eg"], "اتضافت صور تلقائي")

    def test_lengths_fit_the_chips_buttons_and_hints(self):
        for key, entry in self.strings.items():
            if key.startswith("vis.tab.kind.") or key.startswith("vis.demo.") and key.rsplit(".", 1)[1] in DEMO_WHO:
                limit = 18
            elif key in ("vis.tab.plan", "vis.tab.plan.slide", "vis.tab.replan", "vis.tab.lock", "vis.tab.locked"):
                limit = 28
            elif key.endswith(".hint"):
                limit = 120
            else:
                limit = 44
            for dialect, value in entry.items():
                for text in forms(value):
                    self.assertLessEqual(len(text), limit, f"{key}/{dialect}: {len(text)} > {limit}: {text}")

    def test_the_dialects_are_not_one_copy(self):
        differ = {d: sum(1 for e in self.strings.values() if e[d] != e["msa-white"]) for d in ("eg", "gulf", "levant")}
        self.assertGreaterEqual(differ["eg"], 10, differ)
        self.assertGreaterEqual(differ["levant"], 6, differ)
        self.assertGreaterEqual(differ["gulf"], 3, differ)


class TestArabicEditorGates(Base):
    def each(self):
        for key, entry in self.strings.items():
            for dialect, value in entry.items():
                for text in forms(value):
                    yield key, dialect, text

    def test_lint_text_finds_nothing_in_any_dialect(self):
        """Spelling, digits, bidi, number-noun binding and the dialect's deny and warn markers: the template and two filled-in samples."""
        found = []
        for key, dialect, text in self.each():
            for variant in (text, *(fill(text, s) for s in SAMPLES)):
                for item in lint.lint_text(variant, dialect=dialect, digits="western"):
                    if item["sev"] in ("BLOCK", "FIX"):
                        found.append((key, dialect, item["rule"], item["original"]))
        self.assertEqual(sorted(set(found)), [])

    def test_arabic_dialects_hold_arabic_and_english_holds_none(self):
        for key, dialect, text in self.each():
            if dialect == "en":
                self.assertFalse(ARABIC_RE.search(text), f"{key}/en carries Arabic: {text}")
                self.assertTrue(re.sub("[“”’…]", "", text).isascii(), f"{key}/en: {text}")
            else:
                self.assertRegex(text, ARABIC_RE, f"{key}/{dialect} has no Arabic letter: {text}")

    def test_one_digit_system_and_arabic_punctuation(self):
        for key, dialect, text in self.each():
            where = f"{key}/{dialect}: {text}"
            self.assertFalse(DIGIT_OTHER.search(text), "Western digits only: " + where)
            if dialect == "en":
                continue
            self.assertNotIn("?", text, "Arabic text asks with \u061f: " + where)
            self.assertNotIn(";", text, where)
            self.assertFalse(re.search("[\u0600-\u06ff]\\s*,|,\\s*[\u0600-\u06ff]", text), "Arabic comma \u060c next to Arabic: " + where)
            self.assertNotIn("\u0640", text, "no tatweel: " + where)

    def test_no_tashkeel_beyond_shadda_and_tanwin_and_no_direction_marks(self):
        for key, dialect, text in self.each():
            marks = {ch for ch in text if unicodedata.category(ch) == "Mn"}
            self.assertLessEqual(marks, ALLOWED_MARKS, f"{key}/{dialect}: {text}")
            self.assertFalse(BIDI_CONTROLS.search(text), f"{key}/{dialect}: direction control characters (the page sets dir)")
            self.assertNotIn("\u00a0", text, f"{key}/{dialect}: a no-break space belongs to rendered art labels, not to UI strings")

    def test_text_is_trimmed_single_spaced_and_plain(self):
        for key, dialect, text in self.each():
            where = f"{key}/{dialect}: {text!r}"
            self.assertEqual(text, text.strip(), where)
            self.assertNotIn("  ", text, where)
            self.assertNotIn("\n", text, where)
            self.assertFalse(re.search("[<>&]", text), "no markup characters: " + where)
            self.assertNotIn("{{", text, "the page templates own the double brace: " + where)
            self.assertNotRegex(text, "(?i)https?:|www\\.", where)

    def test_hints_end_with_a_full_stop_and_questions_with_a_question_mark(self):
        for key, entry in self.strings.items():
            for dialect, text in entry.items():
                if key.endswith(".hint"):
                    self.assertTrue(text.endswith("."), f"{key}/{dialect}: {text}")
                if key == "vis.tab.why":
                    self.assertTrue(text.endswith("؟" if dialect != "en" else "?"), f"{key}/{dialect}: {text}")

    def test_no_credit_text_and_no_telemetry_words(self):
        joined = json.dumps(self.strings, ensure_ascii=False)
        for needle in OWNER_STRINGS:
            self.assertNotIn(needle, joined)
        self.assertNotIn("analytics", joined.lower())


if __name__ == "__main__":
    unittest.main()
