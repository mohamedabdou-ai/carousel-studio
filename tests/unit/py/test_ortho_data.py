"""Structure and quality checks for the rule data B8 owns: data/rules/ortho.json and
data/dialects/*.json (canonical copies in carousel-design, synced copies in arabic-proofread),
plus brand-setup's copy of locale-defaults.json."""

import json
import os
import re
import unicodedata
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SKILLS = Path(os.environ.get("CS_TEST_SKILLS") or ROOT / "plugins" / "carousel-studio" / "skills")
DESIGN = SKILLS / "carousel-design" / "data"
PROOF = SKILLS / "arabic-proofread" / "data"
DIALECTS = ("eg", "gulf", "levant", "msa-white", "en")
SEVS = {"BLOCK", "FIX", "NOTE"}
CHECKS = {"mixed-digits", "persian-digits", "persian-letters", "space-before-punct", "missing-space-after-punct",
          "latin-punct-in-arabic", "digit-glued-to-word", "double-space", "programmatic-tatweel", "ellipsis-dots",
          "repeated-punct", "percent-sign", "lam-latin-stranded", "number-noun-unbound", "emoji-edge"}
# contract 7.4 (+ N1.percent, which the gate registry lists as autofix)
AUTOFIX_CHECKS = {"persian-letters", "persian-digits", "space-before-punct", "latin-punct-in-arabic",
                  "digit-glued-to-word", "mixed-digits", "programmatic-tatweel", "double-space", "ellipsis-dots",
                  "repeated-punct", "lam-latin-stranded", "number-noun-unbound", "percent-sign"}
LEXICON_KEYS = {"not", "will", "want", "think-that", "thing", "how", "why", "now", "a-lot", "do", "before", "free", "this"}
CTA_KEYS = {"save", "send", "question", "keyword-dm", "follow"}
CTA_SLOTS = {"who", "reason", "question", "keyword", "asset", "series", "day"}
DIACRITICS = {chr(c) for c in range(0x064B, 0x0660)} | {"ٰ", "ـ"}
NON_WESTERN_DIGITS = re.compile("[٠-٩۰-۹]")


def load(path):
    raw = path.read_bytes()
    assert not raw.startswith(b"\xef\xbb\xbf"), "%s has a BOM" % path
    assert b"\r" not in raw, "%s has CR characters" % path
    assert raw.endswith(b"\n"), "%s lacks a trailing newline" % path
    return json.loads(raw.decode("utf-8"))


class OrthoRulesTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.path = DESIGN / "rules" / "ortho.json"
        cls.data = load(cls.path)
        cls.rules = cls.data["rules"]

    def test_header_and_clitics(self):
        self.assertEqual((self.data["schemaVersion"], self.data["dataVersion"]), (1, "1.0.0"))
        self.assertEqual(self.data["clitics"], ["و", "ف", "ب", "ل", "ك", "ال", "وال", "بال", "كال", "فال", "لل", "ولل"])
        self.assertLess(self.path.stat().st_size, 256 * 1024)

    def test_ids_kinds_and_severities(self):
        ids = [r["id"] for r in self.rules]
        self.assertEqual(len(ids), len(set(ids)))
        for r in self.rules:
            self.assertRegex(r["id"], r"^ORTHO-[A-Z]+-[0-9]{3}$")
            self.assertIn(r["kind"], {"word-map", "char", "regex", "check"}, r["id"])
            self.assertIn(r["sev"], SEVS, r["id"])
            self.assertTrue(0 <= r["confidence"] <= 1, r["id"])
            self.assertIsInstance(r["autofix"], bool)
            self.assertTrue(r["msg"]["ar"] and r["msg"]["en"], r["id"])
            for d in r.get("dialects", []):
                self.assertIn(d, DIALECTS)

    def test_autofix_only_where_the_contract_allows_it(self):
        for r in self.rules:
            if not r["autofix"]:
                continue
            if r["kind"] == "check":
                self.assertIn(r["check"], AUTOFIX_CHECKS, r["id"])
            else:
                self.assertEqual(r["kind"], "char", "%s: only checks and the Urdu-letter map may autofix" % r["id"])
                self.assertEqual(r["id"], "ORTHO-ENC-002")
        for r in self.rules:
            if r["kind"] == "word-map":
                self.assertFalse(r["autofix"], "%s: spelling fixes are suggestions" % r["id"])

    def test_checks_name_a_known_builtin_and_each_appears_once(self):
        names = [r["check"] for r in self.rules if r["kind"] == "check"]
        self.assertEqual(len(names), len(set(names)))
        self.assertTrue(set(names) <= CHECKS)
        self.assertEqual(set(names), CHECKS, "every built-in check of contract 7.4 has a rule")

    def test_regex_rules_stay_in_the_portable_subset(self):
        for r in self.rules:
            if r["kind"] != "regex":
                continue
            pat = r["pattern"]
            re.compile(pat)
            for banned in (r"\d", r"\w", r"\s", r"\b", "(?<", "(?P", "(?=", "(?!", "(?:", "(?i"):
                self.assertNotIn(banned, pat, "%s uses %s" % (r["id"], banned))
            self.assertIsInstance(r["replace"], str)
            self.assertNotRegex(r["replace"], r"\$[0-9]|\\[0-9]", "%s: replacements are literal" % r["id"])
            self.assertIsNone(re.fullmatch(pat, ""), "%s matches the empty string" % r["id"])

    def test_word_maps(self):
        seen = {}
        for r in self.rules:
            if r["kind"] != "word-map":
                continue
            self.assertTrue(r["map"], r["id"])
            scope = set(r.get("dialects") or DIALECTS)
            for key, value in r["map"].items():
                self.assertNotEqual(key, value, r["id"])
                self.assertTrue(value.strip(), r["id"])
                self.assertEqual(key, unicodedata.normalize("NFC", key))
                self.assertFalse(set(key) & DIACRITICS, "%s: key %r holds a diacritic" % (r["id"], key))
                self.assertNotIn(" ", key)
                for other_scope in seen.get(key, []):
                    self.assertFalse(scope & other_scope, "duplicate key %r" % key)
                seen.setdefault(key, []).append(scope)
        self.assertGreaterEqual(len(seen), 250)

    def test_a_fix_is_not_itself_flagged(self):
        keys = set()
        for r in self.rules:
            if r["kind"] == "word-map" and not r.get("dialects"):
                keys |= set(r["map"])
        for r in self.rules:
            if r["kind"] != "word-map":
                continue
            for key, value in r["map"].items():
                if re.fullmatch("[ء-ي]+", value):
                    self.assertNotIn(value, keys, "%s: %r -> %r is itself a key (fix loop)" % (r["id"], key, value))

    def test_the_owner_flagged_errors_are_covered(self):
        flat = {}
        for r in self.rules:
            if r["kind"] == "word-map":
                flat.update(r["map"])
        for wrong, right in (("انشاء", "إنشاء"), ("الوان", "ألوان"), ("فى", "في"), ("اللى", "اللي"), ("شركه", "شركة"),
                             ("هاذا", "هذا"), ("الى", "إلى"), ("مسئول", "مسؤول")):
            self.assertEqual(flat.get(wrong), right, wrong)
        phrases = {r["pattern"]: r["replace"] for r in self.rules if r["kind"] == "regex"}
        self.assertEqual(phrases["إنشاء الله"], "إن شاء الله")

    def test_no_non_western_digits_in_user_facing_text(self):
        blob = json.dumps(self.rules, ensure_ascii=False)
        self.assertIsNone(NON_WESTERN_DIGITS.search(blob))


class DialectFileTests(unittest.TestCase):
    def test_shape(self):
        for code in DIALECTS:
            d = load(DESIGN / "dialects" / ("%s.json" % code))
            self.assertEqual((d["schemaVersion"], d["dialect"], d["dataVersion"]), (1, code, "1.0.0"), code)
            self.assertTrue(d["label"]["ar"] and d["label"]["en"])
            self.assertLess((DESIGN / "dialects" / ("%s.json" % code)).stat().st_size, 256 * 1024)
            self.assertEqual(set(d["lexicon"]), LEXICON_KEYS, code)
            self.assertEqual(set(d["cta"]), CTA_KEYS, code)
            self.assertTrue(d["registerNotes"]["ar"] and d["registerNotes"]["en"])
            ids = [e["id"] for e in d["deny"] + d["warn"]]
            self.assertEqual(len(ids), len(set(ids)), code)
            for e in d["deny"] + d["warn"]:
                self.assertIn(e["match"], {"word", "phrase", "regex"})
                self.assertTrue(e.get("text") or e.get("pattern"))
                self.assertIn(e.get("sev", "BLOCK"), SEVS)
            for kind, templates in d["cta"].items():
                for t in templates:
                    self.assertTrue(set(re.findall(r"\{(\w+)\}", t)) <= CTA_SLOTS, (code, t))
            self.assertIsNone(NON_WESTERN_DIGITS.search(json.dumps(d, ensure_ascii=False)), code)

    def test_beta_flags_follow_the_decision(self):
        status = {c: load(DESIGN / "dialects" / ("%s.json" % c))["status"] for c in DIALECTS}
        self.assertEqual(status, {"eg": "stable", "gulf": "beta", "levant": "beta", "msa-white": "stable", "en": "stable"})
        for c in DIALECTS:
            self.assertIs(load(DESIGN / "dialects" / ("%s.json" % c))["nativeReviewed"], False)

    def test_a_dialect_never_denies_its_own_markers(self):
        def fold(w):
            return "".join(ch for ch in w if ch not in DIACRITICS)
        for code in DIALECTS:
            d = load(DESIGN / "dialects" / ("%s.json" % code))
            deny = {fold(e["text"]) for e in d["deny"] if e.get("text")}
            self.assertFalse(deny & {fold(m) for m in d["markers"]}, code)
            self.assertFalse({fold(x) for words in d["lexicon"].values() for x in words} & deny, code)
            self.assertFalse(deny & {fold(e["text"]) for e in d["warn"] if e.get("text")}, code)

    def test_arabic_dialects_have_deny_lists_and_english_has_none(self):
        for code in ("eg", "gulf", "levant", "msa-white"):
            self.assertGreater(len(load(DESIGN / "dialects" / ("%s.json" % code))["deny"]), 20, code)
        en = load(DESIGN / "dialects" / "en.json")
        self.assertEqual(en["deny"], [])
        self.assertTrue(all(re.fullmatch(r"[A-Za-z' -]+", e["text"]) for e in en["warn"]))

    def test_gulf_and_levant_carry_sub_varieties(self):
        self.assertEqual(set(load(DESIGN / "dialects" / "gulf.json")["subVarieties"]), {"najdi", "hijazi", "emirati"})
        self.assertEqual(set(load(DESIGN / "dialects" / "levant.json")["subVarieties"]), {"lebanese", "syrian"})

    def test_egyptian_face_word_is_not_denied(self):
        eg = load(DESIGN / "dialects" / "eg.json")
        self.assertNotIn("وش", {e["text"] for e in eg["deny"]})  # «وش» is "face" in Egyptian
        self.assertNotIn("أبي", {e["text"] for e in eg["deny"]})  # «أبي» is "my father" in formal copy


class SyncedCopiesTests(unittest.TestCase):
    def test_proofread_copies_are_byte_identical_to_the_canonical_files(self):
        pairs = [(DESIGN / "rules" / "ortho.json", PROOF / "rules" / "ortho.json")]
        pairs += [(DESIGN / "dialects" / ("%s.json" % c), PROOF / "dialects" / ("%s.json" % c)) for c in DIALECTS]
        for canonical, copy in pairs:
            self.assertTrue(copy.exists(), "%s is missing (run tools/sync_shared.py)" % copy)
            self.assertEqual(canonical.read_bytes(), copy.read_bytes(), copy.name)

    def test_brand_setup_locale_defaults_is_a_copy(self):
        copy = SKILLS / "brand-setup" / "data" / "locale-defaults.json"
        self.assertTrue(copy.exists())
        self.assertEqual((DESIGN / "locale-defaults.json").read_bytes(), copy.read_bytes())


if __name__ == "__main__":
    unittest.main()
