"""copy.json (B7): shape per CONTRACT 7.4, portable regexes, and behaviour through the entry matcher."""
import json
import re
import unicodedata
import unittest

import b7_support as support

COPY_PATH = support.skill_dir("carousel-design") / "data" / "rules" / "copy.json"

LIST_NAMES = {"aiWords", "stockOpeners", "hypeWords", "abstractWords", "fearWords", "conspiracy", "overclaim",
              "commentBait", "introPhrases", "stiffMsa", "translationese", "bindLabels", "numberWords"}
ENTRY_KEYS = {"id", "text", "pattern", "match", "flags", "clitics", "dialects", "sev", "note", "suggest", "value"}
DIALECTS = {"eg", "gulf", "levant", "msa-white", "en", "*"}
MARKS = re.compile("[" + chr(0x064B) + "-" + chr(0x065F) + chr(0x0670) + chr(0x0640) + "]")
BACKSLASH = chr(92)
# CONTRACT 3.1: only these escapes are portable between Python and JavaScript
ALLOWED_ESCAPES = re.compile(r"^(?:\.|\+|/|-|\||t|n|r|u[0-9A-Fa-f]{4})$")


def load_copy():
    return json.loads(COPY_PATH.read_text(encoding="utf-8"))


def all_entries(data):
    for name, lst in data["lists"].items():
        for entry in lst["entries"]:
            yield name, entry


def portable_problems(pattern):
    """Return a list of reasons a pattern is not in the portable regex subset of CONTRACT 3.1."""
    problems = []
    i = 0
    while i < len(pattern):
        ch = pattern[i]
        if ch == BACKSLASH:
            m = re.match(r"u[0-9A-Fa-f]{4}|.", pattern[i + 1:i + 6], re.S)
            token = m.group(0) if m else ""
            if not ALLOWED_ESCAPES.match(token):
                problems.append("escape " + BACKSLASH + token)
            i += 1 + len(token)
            continue
        i += 1
    if "(?" in pattern:
        problems.append("group modifier or lookaround")
    return problems


class CopyJsonShape(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = load_copy()

    def test_top_level(self):
        self.assertEqual(self.data["schemaVersion"], 1)
        self.assertRegex(self.data["dataVersion"], r"^[0-9]+\.[0-9]+\.[0-9]+$")
        self.assertEqual(set(self.data["lists"]), LIST_NAMES)

    def test_every_list_is_described_and_filled(self):
        for name, lst in self.data["lists"].items():
            self.assertTrue(lst["description"].strip(), name)
            self.assertGreaterEqual(len(lst["entries"]), 10, name)

    def test_ids_unique_and_well_formed(self):
        seen = set()
        for name, entry in all_entries(self.data):
            self.assertRegex(entry["id"], r"^[A-Z]{2}-[0-9]{3}$", name)
            self.assertNotIn(entry["id"], seen)
            seen.add(entry["id"])

    def test_entry_fields(self):
        for name, e in all_entries(self.data):
            self.assertLessEqual(set(e), ENTRY_KEYS, e["id"])
            self.assertIn(e["match"], ("word", "phrase", "regex"), e["id"])
            if "sev" in e:
                self.assertIn(e["sev"], ("BLOCK", "FIX", "NOTE"), e["id"])
            if "dialects" in e:
                self.assertTrue(set(e["dialects"]) <= DIALECTS, e["id"])
            if "note" in e:
                self.assertEqual(set(e["note"]), {"ar", "en"}, e["id"])

    def test_matching_kinds(self):
        for name, e in all_entries(self.data):
            if e["match"] == "regex":
                self.assertIn("pattern", e, e["id"])
                self.assertNotIn("text", e, e["id"])
                self.assertIn(e.get("flags"), ("u", "ui"), e["id"])
            else:
                self.assertIn("text", e, e["id"])
                self.assertNotIn("pattern", e, e["id"])
                words = e["text"].split()
                if e["match"] == "word":
                    self.assertEqual(len(words), 1, e["id"])
                else:
                    self.assertGreaterEqual(len(words), 2, e["id"])
                self.assertEqual(e["text"], " ".join(words), "single spaces only: " + e["id"])

    def test_text_is_clean_nfc_without_marks(self):
        # matching strips tashkeel and tatweel from the TEXT, so entries must not contain them
        for name, e in all_entries(self.data):
            body = e.get("text") or e.get("pattern")
            self.assertFalse(MARKS.search(body), e["id"])
            self.assertEqual(unicodedata.normalize("NFC", body), body, e["id"])

    def test_regexes_are_portable_and_compile(self):
        for name, e in all_entries(self.data):
            if e["match"] != "regex":
                continue
            self.assertEqual(portable_problems(e["pattern"]), [], e["id"])
            re.compile(e["pattern"].replace("$", r"\Z"))

    def test_number_words_carry_values(self):
        for name, e in all_entries(self.data):
            if name == "numberWords":
                self.assertIsInstance(e["value"], int, e["id"])
            else:
                self.assertNotIn("value", e, e["id"])
        values = {e["value"] for e in self.data["lists"]["numberWords"]["entries"]}
        self.assertTrue(set(range(1, 11)) <= values)

    def test_contract_seeds_present(self):
        texts = {e.get("text") for e in self.data["lists"]["hypeWords"]["entries"]}
        self.assertIn("الحقيقة الصادمة", texts)
        self.assertIn("سر خطير", texts)

    def test_english_entries_are_marked_english(self):
        latin = re.compile("[A-Za-z]")
        for name, e in all_entries(self.data):
            if e["match"] != "regex" and latin.search(e["text"]):
                self.assertEqual(e.get("dialects"), ["en"], e["id"])

    def test_file_is_public_safe(self):
        raw = COPY_PATH.read_text(encoding="utf-8")
        self.assertNotIn("http", raw)
        self.assertNotIn("تبقى غلطان", raw)           # the owner's signature line stays in his private pack
        self.assertIsNone(re.search(r"\bH[0-9]{3}\b", raw))
        self.assertLess(len(raw.encode("utf-8")), 256 * 1024)


class CopyJsonBehaviour(unittest.TestCase):
    """Drive the lists through the entry matcher (real _cs.rules when present, the test stub otherwise)."""

    @classmethod
    def setUpClass(cls):
        support.prepare("carousel-create")
        from _cs import rules  # noqa: WPS433
        cls.rules = rules
        cls.lists = load_copy()["lists"]

    def hits(self, list_name, text, dialect=None):
        entries = self.lists[list_name]["entries"]
        return [h["entry"]["id"] for h in self.rules.entries_match(entries, text, dialect=dialect)]

    def test_hype_phrase(self):
        self.assertTrue(self.hits("hypeWords", "الحقيقة الصادمة عن الكاروسيل"))
        self.assertFalse(self.hits("hypeWords", "الحقيقة كاملة في السلايد الثالث"))

    def test_translationese_regex(self):
        self.assertTrue(self.hits("translationese", "قم بالضغط على الرابط"))
        self.assertTrue(self.hits("translationese", "يتم الشحن خلال يومين"))
        self.assertFalse(self.hits("translationese", "اضغط الرابط يصلك الملف"))

    def test_number_words_and_the_monday_trap(self):
        self.assertTrue(self.hits("numberWords", "ثلاثة أدوات بتغنيك"))
        self.assertTrue(self.hits("numberWords", "خمس خطوات"))
        self.assertFalse(self.hits("numberWords", "نبدأ يوم الاثنين"))        # Monday is not the number two

    def test_clitics_on_abstract_words(self):
        self.assertTrue(self.hits("abstractWords", "طريقك للنجاح"))
        self.assertFalse(self.hits("abstractWords", "جدول الأسبوع"))

    def test_comment_bait_is_not_keyword_dm(self):
        self.assertTrue(self.hits("commentBait", "اكتب نعم لو موافق"))
        self.assertFalse(self.hits("commentBait", "علق بكلمة قالب وابعتهولك على الخاص"))

    def test_english_entries_follow_the_dialect(self):
        self.assertTrue(self.hits("aiWords", "Let us delve into hooks", dialect="en"))
        self.assertFalse(self.hits("aiWords", "Let us delve into hooks", dialect="eg"))

    def test_dialect_specific_openers(self):
        self.assertTrue(self.hits("stockOpeners", "النهارده هنتكلم عن الهوكات", dialect="eg"))
        self.assertFalse(self.hits("stockOpeners", "النهارده هنتكلم عن الهوكات", dialect="gulf"))

    def test_fear_stacking_vocabulary(self):
        self.assertGreaterEqual(len(self.hits("fearWords", "كارثة وخسارة وانهيار")), 3)
        self.assertTrue(self.hits("fearWords", "هتخسر متابعينك"))

    def test_clean_copy_triggers_nothing(self):
        clean = {
            "eg": ["جرّبت 6 أدوات ببلاش وبتوفّر عليك ساعة في اليوم.", "مشكلتك مش في الخوارزمية، مشكلتك في أول سطر."],
            "gulf": ["جرّبت 6 أدوات ببلاش تسوّي لك الشغل في دقايق.", "مو كل أداة تستاهل وقتك."],
            "levant": ["جرّبت 6 أدوات ببلاش وبتوفّر عليك وقت.", "مش كل أداة بتستاهل وقتك."],
            "msa-white": ["جرّبت ستّ أدوات مجانية وتعرض نتائجها هنا.", "السطر الأول هو أهم سطر في المنشور."],
        }
        skip = {"numberWords"}            # "ستّ" is a legitimate hit there; the others must stay silent
        for dialect, sentences in clean.items():
            for sentence in sentences:
                for name in self.lists:
                    if name in skip or name == "bindLabels":
                        continue
                    self.assertEqual(self.hits(name, sentence, dialect=dialect), [], (dialect, name, sentence))


def tearDownModule():
    support.cleanup()


if __name__ == "__main__":
    unittest.main()
