"""tests/icons/corpus.dev.json: the dev acceptance corpus of the Arabic icon index (spec 3.1 "Acceptance", App. D).

The three index authors iterate against this file; the held-out corpus (tests/icons/heldout/) is written blind and is a different file.
Checks: the IS-9 shape, counts per dialect and per tag, labels that exist (icons in the candidate list, objects in the 40 of spec 3.1.1,
primitives in the closed set), the 51 gap words of App. D inside sentences, homograph senses, negation forms, dialect markers, one digit
system, and that none of the owner's private hook lines is in the file (check_directory rule P10).

Reading the corpus. One JSON array, one slide per line: {id, dialect eg|gulf|lev|mag|msa, title, body, accept, acceptObject, primitive,
noIcon, tags}. A slide passes when the lookup's top-1 is in `accept` (an icon), or is the labelled `primitive`, or, for `noIcon`, when it
returns nothing. `accept` lists every icon an art director would take; `acceptObject` the equally right objects. Tags: homograph (with
home:<word>, sense:<name>, topic:<candidate category> that picks the sense), negation (with neg:slash: the slash modifier goes on the
concept's own icon), polarity (a warning word: neg or warn icons first), structural (a primitive answer), loanword, gap (with w:<word>, one of
the 51 words of App. D), stat, quote, verb, noicon, tashkeel (diacritics kept on purpose to exercise the normaliser), loan-variant (a regional
spelling such as لوغو), sub:ma|tn|dz (Maghrebi sub-dialect), src:showcase|fixture|hook|glossary (where the text comes from).
"""
from __future__ import annotations

import importlib.util
import json
import re
import sys
import unittest
from collections import Counter
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
CORPUS = REPO / "tests" / "icons" / "corpus.dev.json"
# the candidate list: the repository copy (D1) first, then the research copy while the round is being built
CANDIDATES = [REPO / "tools" / "icons-src" / "candidates.json", REPO.parent / "research" / "round3" / "icon-candidates.json"]
OWNER_PHRASES = REPO / "tools" / "owner-phrases.json"
CHECK_DIRECTORY = REPO / "tools" / "check_directory.py"

DIALECTS = ("eg", "gulf", "lev", "mag", "msa")
KEYS = ["id", "dialect", "title", "body", "accept", "acceptObject", "primitive", "noIcon", "tags"]
PRIMITIVES = {"versus", "before-after", "myth-fact", "track", "numeral", "staircase", "rows"}
# the 40 objects of spec 3.1.1 (D5 draws 12, D6 the other 28)
OBJECTS = set("""coin-stack banknote-bundle wallet piggy-bank price-tag phone laptop camera mic megaphone lightbulb rocket trophy calendar clock
hourglass key lock shield shopping-bag cart gift box book notebook pencil magnifier heart star chat-bubble bell flag target bar-chart gear
plant coffee-cup house car map-pin""".split())
# the 51 words of the App. D probe that matched nothing in the rev-1 index
GAP_WORDS = """محتوى تسويق سر كونتنت ريتش فولورز مصمم كورس راتب ذهب بتقرا بيتحفظ هتكتب بيكتب هيشكرك قبل مشاكل أفكار نصائح أهداف أسعار أخطاء أيام
عروض زبون نتيجة قصة شهر أسبوع مجاني مدير شريك ابداع قرار لون فطور فيروسي لوجو انجيجمنت ديون اختبار حفظها تدريب مهارة مقابلة ذاتية ترقية
قائد تغذية سعادة خوف""".split()
HOMOGRAPH_CORE = ["عنوان", "دور", "صفحة", "جملة", "علامة", "رقم", "خط", "سلسلة"]
LOANWORDS = ["هوك", "كونتنت", "ريتش", "فولورز", "ستوري", "كابشن", "براند", "لوجو", "لوغو", "ترند", "انجيجمنت"]

_MARKS = re.compile("[ً-ٰٟـ]")
_FOLD = str.maketrans({"أ": "ا", "إ": "ا", "آ": "ا", "ٱ": "ا", "ى": "ي", "ة": "ه", "ؤ": "و", "ئ": "ي"})
_TOKEN = re.compile("[ء-ي]+|[0-9A-Za-z]+")
CLITICS = {"", "و", "ب", "ل", "ف", "ك", "ال", "وال", "بال", "فال", "كال", "لل", "ولل", "فل", "ول", "وب", "فب"}
SUFFIXES = {"", "ك", "ه", "ها", "هم", "كم", "نا", "ني", "ي", "ات", "ين", "ون"}
ARABIC_INDIC = re.compile("[٠-٩۰-۹]")

NEG_WORDS = {"مش", "ما", "مفيش", "لا", "بلا", "بدون", "ليس", "لن", "مو", "مب", "موش", "ماشي"}
NEG_CONTRACTED = re.compile("^م[ا]?[ء-ي]{2,}ش$")

# markers of each family (folded); a slide of the family should carry at least one, and a slide of another family must not carry the deny list
EG = set("""مش ده دي دول دلوقتي ازاي ليه بتاع بتاعك بتاعنا عشان كده لسه اللي فين مفيش عايز عايزهم هيكمل هتكتب بيكتب بيتحفظ هيشكرك بتقرا ميتقراش
ماتشتريش ماتنشرش اتغير اتعلمتها بدالك بتاعه تلات تالت التاني التانيه اتنين الاتنين قدام دلوقت جه حاجه حاجات فايده الفايده لوقتك""".split())
GULF = set("""مو مب وايد الحين شلون شنو وش ليش ابي ابغي تبي يبي زين كذا وين حق شي مره اللي هالاسبوع هالطعم بالطريق بثواني بجوالك عشان
الماي جمعه مرتين لين وحده وحدة راح""".split())
LEV = set("""شو هلق هلا عم رح بدي بدك مشان هيك كتير شوي لسا منيح مو مش ما في إله اله حدا هدول هني بيكملوه بيبلش بيخلوا بتحكي بيستنى بتعمل
بتعطيك بتحب بتعرفه بدو بتحكيله وحدة بيمشي بتخليك الجاية""".split())
MAG = set("""بزاف ديال ديالك ديالها كيفاش علاش شنو واش دابا غادي كاين ماشي خاصك خاصو فين باش برشا موش توا شنوة كي نهار مزيان جوج هاد هادي
هادشي واخا كولو كيبيع كيقرروا كيفرق كتبيع كيشري كيعلمك كتحب كتقدم كيتحفظ الناس يعدو حريف الحريف الكليان فثواني فالنهار""".split())
MAG_PREFIX = re.compile("^[ك][ء-ي]{3,}$")
EG_PREFIX = re.compile("^(بي|بت|هي|هت)[ء-ي]{3,}$")
LEV_PREFIX = re.compile("^(بي|بت|عم)[ء-ي]{3,}$")
FAMILY_MARKERS = {"eg": (EG, EG_PREFIX), "gulf": (GULF, None), "lev": (LEV, LEV_PREFIX), "mag": (MAG, MAG_PREFIX)}
# words that belong to one family only: they must not appear in another family's slides
ONLY = {
    "eg": set("ده دي دول دلوقتي ازاي عايز عاوز بتاع بتاعك بتاعنا كده لسه".split()),
    "gulf": set("وايد الحين شلون ابي ابغي تبي يبي مب".split()),
    "lev": set("هلق هلا بدي بدك مشان هيك لسا".split()),
    "mag": set("بزاف ديال ديالك كيفاش علاش دابا غادي واش برشا موش توا".split()),
}


def fold(text: str) -> str:
    return _MARKS.sub("", text).translate(_FOLD).lower()


def tokens(text: str) -> list[str]:
    return _TOKEN.findall(fold(text))


def has_word(text: str, word: str) -> bool:
    """A whole token, or the word behind one of the clitic prefixes (ال، بال، فال، و، ب، ل، ف، ك)."""
    word = fold(word)
    for tok in tokens(text):
        if tok.endswith(word) and tok[: len(tok) - len(word)] in CLITICS:
            return True
    return False


def has_stem(text: str, word: str) -> bool:
    """The word behind a clitic prefix and in front of a possessive or plural suffix (دورك، صفحتك، علامتك)."""
    word = fold(word)
    stems = {word} | ({word[:-1] + "ت"} if word.endswith("ه") else set())  # a taa marbuta turns into taa before a suffix (صفحتك)
    for tok in tokens(text):
        for pre in CLITICS:
            for suf in SUFFIXES:
                if any(tok == pre + stem + suf for stem in stems):
                    return True
    return False


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def candidate_rows() -> list:
    for path in CANDIDATES:
        if path.is_file():
            data = load_json(path)
            if isinstance(data, dict):
                data = data.get("icons") or data.get("candidates") or []
            return data
    raise AssertionError("no icon candidate list found; looked in " + ", ".join(str(p) for p in CANDIDATES))


def candidate_names() -> set[str]:
    return {(row["name"] if isinstance(row, dict) else row[0]) for row in candidate_rows()}


def candidate_categories() -> set[str]:
    return {(row["category"] if isinstance(row, dict) else row[1]) for row in candidate_rows()}


def tag_values(entry: dict, prefix: str) -> list[str]:
    return [t[len(prefix):] for t in entry["tags"] if t.startswith(prefix)]


def analyse(corpus: list[dict]) -> dict:
    """Counts the acceptance runner and the other tests rely on; pure, so two runs must agree."""
    tags = Counter(t.split(":")[0] if ":" in t else t for e in corpus for t in e["tags"])
    return {
        "total": len(corpus),
        "dialects": dict(sorted(Counter(e["dialect"] for e in corpus).items())),
        "tags": dict(sorted(tags.items())),
        "primitives": dict(sorted(Counter(e["primitive"] for e in corpus if e["primitive"]).items())),
        "noIcon": sum(1 for e in corpus if e["noIcon"]),
        "gapWords": sorted({w for e in corpus for w in tag_values(e, "w:")}),
        "homographs": sorted({(h, s) for e in corpus for h in tag_values(e, "home:") for s in tag_values(e, "sense:")}),
    }


class TestIconCorpus(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.raw = CORPUS.read_bytes()
        cls.corpus = json.loads(cls.raw.decode("utf-8"))
        cls.names = candidate_names()
        cls.categories = candidate_categories()

    # ---- shape --------------------------------------------------------------------------------------------------------------------
    def test_file_form(self):
        self.assertLessEqual(len(self.raw), 200 * 1024, "the corpus budget is 200 KB")
        self.assertFalse(self.raw.startswith(b"\xef\xbb\xbf"), "no BOM")
        self.assertNotIn(b"\r", self.raw, "LF line endings")
        self.assertTrue(self.raw.endswith(b"\n"))
        self.assertIsInstance(self.corpus, list, "IS-9: the corpus is a JSON array of slides")

    def test_shape(self):
        seen = set()
        for e in self.corpus:
            where = e.get("id", "?")
            self.assertEqual(list(e.keys()), KEYS, where)
            self.assertRegex(e["id"], r"^(eg|gulf|lev|mag|msa)-\d{3}$", where)
            self.assertNotIn(e["id"], seen, f"duplicate id {where}")
            seen.add(e["id"])
            self.assertEqual(e["id"].split("-")[0], e["dialect"], where)
            self.assertIn(e["dialect"], DIALECTS, where)
            for key in ("title", "body"):
                self.assertIsInstance(e[key], str, where)
                self.assertEqual(e[key], e[key].strip(), f"{where}: {key} has stray whitespace")
                self.assertTrue(e[key], f"{where}: {key} is empty")
            for key in ("accept", "acceptObject", "tags"):
                self.assertIsInstance(e[key], list, where)
                self.assertTrue(all(isinstance(x, str) and x for x in e[key]), where)
                self.assertEqual(len(e[key]), len(set(e[key])), f"{where}: duplicate in {key}")
            self.assertIn(e["primitive"], PRIMITIVES | {None}, where)
            self.assertIsInstance(e["noIcon"], bool, where)

    def test_ids_are_consecutive_per_dialect(self):
        for d in DIALECTS:
            numbers = [int(e["id"].split("-")[1]) for e in self.corpus if e["dialect"] == d]
            self.assertEqual(numbers, list(range(1, len(numbers) + 1)), d)

    # ---- counts -------------------------------------------------------------------------------------------------------------------
    def test_counts(self):
        info = analyse(self.corpus)
        self.assertGreaterEqual(info["total"], 150)
        for d in DIALECTS:
            self.assertGreaterEqual(info["dialects"].get(d, 0), 30, f"{d}: at least 30 slides per dialect family")
        self.assertGreaterEqual(info["tags"].get("homograph", 0), 25)
        self.assertGreaterEqual(info["tags"].get("negation", 0), 20)
        self.assertGreaterEqual(info["tags"].get("structural", 0), 15)
        self.assertGreaterEqual(info["tags"].get("loanword", 0), 10)
        self.assertGreaterEqual(info["noIcon"], 8, "slides where a typographic anchor is the right answer")
        for d in DIALECTS:
            for tag in ("homograph", "negation"):
                n = sum(1 for e in self.corpus if e["dialect"] == d and tag in e["tags"])
                self.assertGreaterEqual(n, 3, f"{d}: at least 3 {tag} slides")

    def test_sources(self):
        info = analyse(self.corpus)
        sources = Counter(t for e in self.corpus for t in e["tags"] if t.startswith("src:"))
        self.assertEqual(sources["src:showcase"], 18, "the 18 real texts of the poster and creator sheets")
        self.assertGreaterEqual(sources["src:fixture"], 20, "the fixture decks")
        self.assertGreaterEqual(sources["src:hook"], 8, "the hook library")
        self.assertGreaterEqual(sources["src:glossary"], 3, "glossary.json")
        self.assertGreaterEqual(info["tags"].get("polarity", 0), 4)

    # ---- labels -------------------------------------------------------------------------------------------------------------------
    def test_labels(self):
        for e in self.corpus:
            where = e["id"]
            for name in e["accept"]:
                self.assertIn(name, self.names, f"{where}: {name} is not in the candidate list")
                self.assertFalse(name.startswith("tb-brand-"), f"{where}: the brand-glyph pack is opt-in and is never a default answer")
            for obj in e["acceptObject"]:
                self.assertIn(obj, OBJECTS, f"{where}: {obj} is not one of the 40 objects of spec 3.1.1")
            if e["noIcon"]:
                self.assertEqual((e["accept"], e["acceptObject"], e["primitive"]), ([], [], None), f"{where}: noIcon with labels")
                self.assertIn("noicon", e["tags"], where)
            else:
                self.assertTrue(e["accept"] or e["primitive"], f"{where}: label an icon or a primitive, or set noIcon")
                self.assertNotIn("noicon", e["tags"], where)
                self.assertGreaterEqual(len(e["accept"]) + len(e["acceptObject"]), 1 if e["primitive"] else 1, where)
            self.assertLessEqual(len(e["accept"]), 6, where)

    def test_structural_slides_carry_a_primitive(self):
        used = Counter()
        for e in self.corpus:
            if "structural" in e["tags"]:
                self.assertIsNotNone(e["primitive"], f"{e['id']}: structural slides name their primitive")
            if e["primitive"]:
                used[e["primitive"]] += 1
        for primitive in PRIMITIVES:
            self.assertGreaterEqual(used[primitive], 2, f"primitive {primitive} needs at least two slides")
        for e in self.corpus:
            if e["primitive"]:
                self.assertIn("structural", e["tags"], f"{e['id']}: a primitive is a structural answer (ordinals, steps, versus, before-after, myth-fact, ranked rows)")

    # ---- the special subsets ------------------------------------------------------------------------------------------------------
    def test_homographs(self):
        senses = {}
        for e in self.corpus:
            if "homograph" not in e["tags"]:
                self.assertEqual(tag_values(e, "home:"), [], e["id"])
                continue
            home, sense = tag_values(e, "home:"), tag_values(e, "sense:")
            self.assertEqual((len(home), len(sense)), (1, 1), f"{e['id']}: one home: and one sense: tag")
            self.assertTrue(has_stem(e["title"] + " " + e["body"], home[0]), f"{e['id']}: the homograph {home[0]} is not in the text")
            self.assertEqual(len(tag_values(e, "topic:")), 1, f"{e['id']}: the deck topic category that picks the sense")
            self.assertIn(tag_values(e, "topic:")[0], self.categories, f"{e['id']}: topic: is a category of the candidate list")
            senses.setdefault(home[0], set()).add(sense[0])
        for word in HOMOGRAPH_CORE:
            self.assertGreaterEqual(len(senses.get(word, ())), 2, f"{word}: at least two senses in the corpus")

    def test_topic_tags_are_categories(self):
        for e in self.corpus:
            for topic in tag_values(e, "topic:"):
                self.assertIn(topic, self.categories, f"{e['id']}: unknown category {topic}")

    def test_negation(self):
        for e in self.corpus:
            if "negation" not in e["tags"]:
                continue
            toks = tokens(e["title"] + " " + e["body"])
            joined = " ".join(toks)
            found = any(t in NEG_WORDS or NEG_CONTRACTED.match(t) for t in toks) or " من غير " in f" {joined} "
            self.assertTrue(found, f"{e['id']}: tagged negation but no negation word in the text")
            self.assertTrue("neg:slash" in e["tags"] or "polarity" in e["tags"], f"{e['id']}: negation puts the slash on the concept's own icon")
        for e in self.corpus:
            if "neg:slash" in e["tags"]:
                self.assertIn("negation", e["tags"], e["id"])

    def test_gap_words_in_sentences(self):
        self.assertEqual(len(GAP_WORDS), 51)
        covered = set()
        for e in self.corpus:
            words = tag_values(e, "w:")
            self.assertEqual(bool(words), "gap" in e["tags"], f"{e['id']}: the gap tag and the w: tags go together")
            text = e["title"] + " " + e["body"]
            for w in words:
                self.assertIn(w, GAP_WORDS, f"{e['id']}: {w} is not one of the 51 gap words")
                self.assertTrue(has_word(text, w), f"{e['id']}: gap word {w} is not in the text")
                self.assertGreaterEqual(len(tokens(text)), 5, f"{e['id']}: a gap word sits inside a sentence, not alone")
                covered.add(w)
        self.assertEqual(sorted(set(GAP_WORDS) - covered), [], "gap words with no slide")

    def test_loanword_slides(self):
        for e in self.corpus:
            if "loanword" not in e["tags"]:
                continue
            n = sum(1 for w in LOANWORDS if has_word(e["title"] + " " + e["body"], w))
            self.assertGreaterEqual(n, 2, f"{e['id']}: a loanword-heavy slide holds at least two loanwords")
        self.assertGreaterEqual(sum(1 for e in self.corpus if "loan-variant" in e["tags"]), 1, "one regional loanword spelling (لوغو)")

    # ---- dialect ------------------------------------------------------------------------------------------------------------------
    def test_dialect_markers(self):
        for d, (words, prefix) in FAMILY_MARKERS.items():
            rows = [e for e in self.corpus if e["dialect"] == d]
            hits = 0
            for e in rows:
                toks = tokens(e["title"] + " " + e["body"])
                if any(t in words or (prefix and prefix.match(t)) for t in toks):
                    hits += 1
            self.assertGreaterEqual(hits / len(rows), 0.6, f"{d}: {hits} of {len(rows)} slides carry a marker of the dialect")

    def test_no_other_dialect_leaks_in(self):
        for e in self.corpus:
            toks = set(tokens(e["title"] + " " + e["body"]))
            for family, words in ONLY.items():
                if family == e["dialect"]:
                    continue
                if e["dialect"] == "lev" and family == "gulf":
                    words = words - {"ابي"}  # not shared, but keep the Levantine ابي (my father) out of the check
                leaked = toks & words
                self.assertEqual(leaked, set(), f"{e['id']} ({e['dialect']}) uses {family}-only words")
        for e in self.corpus:
            if e["dialect"] != "msa":
                continue
            toks = set(tokens(e["title"] + " " + e["body"]))
            every = set().union(*ONLY.values()) | {"مش", "شو", "ليه", "عشان", "اللي", "فين", "كتير", "شي"}
            self.assertEqual(toks & every, set(), f"{e['id']}: dialect words in an MSA slide")

    # ---- hygiene ------------------------------------------------------------------------------------------------------------------
    def test_one_digit_system(self):
        for e in self.corpus:
            self.assertIsNone(ARABIC_INDIC.search(e["title"] + e["body"]), f"{e['id']}: Western digits only")

    def test_tashkeel_is_declared(self):
        for e in self.corpus:
            has = bool(_MARKS.search(e["title"] + e["body"]))
            self.assertEqual(has, "tashkeel" in e["tags"], f"{e['id']}: slides with diacritics carry the tashkeel tag (they exercise the normaliser)")

    def test_no_forbidden_text(self):
        blob = self.raw.decode("utf-8")
        for needle in ("http", "www.", "@"):
            self.assertNotIn(needle, blob.lower(), f"the corpus must not contain {needle!r}")
        self.assertNotRegex(blob, "[\U0001F300-\U0001FAFF☀-➿]", "no emoji in the dev corpus")
        self.assertNotRegex(blob, r"H1(4[7-9]|[5-9]\d)\b", "client hook-bank ids stay out of public files (P06)")

    def test_none_of_the_owners_private_hooks(self):
        """check_directory rule P10: no run of four words of the owner's private hook bank."""
        if not OWNER_PHRASES.is_file() or not CHECK_DIRECTORY.is_file():
            self.skipTest("tools/owner-phrases.json or tools/check_directory.py is not in this tree")
        spec = importlib.util.spec_from_file_location("check_directory_for_corpus", CHECK_DIRECTORY)
        cd = importlib.util.module_from_spec(spec)
        sys.modules[spec.name] = cd  # dataclasses looks the module up while the class body runs
        try:
            spec.loader.exec_module(cd)
        finally:
            sys.modules.pop(spec.name, None)
        doc = load_json(OWNER_PHRASES)
        known, n = set(doc["hashes"]), int(doc.get("ngram") or 4)
        for e in self.corpus:
            for text in (e["title"], e["body"], e["title"] + " " + e["body"]):
                for line in text.split("\n"):
                    words = cd.phrase_words(line)
                    if len(words) >= n:
                        hits = [h for h in cd.phrase_hashes(words, n) if h in known]
                        self.assertEqual(hits, [], f"{e['id']}: matches the owner's private hook bank; write a fresh line")

    # ---- determinism --------------------------------------------------------------------------------------------------------------
    def test_run_twice_compare(self):
        self.assertEqual(analyse(self.corpus), analyse(json.loads(self.raw.decode("utf-8"))))
        again = json.dumps(self.corpus, ensure_ascii=False, sort_keys=False)
        self.assertEqual(again, json.dumps(json.loads(again), ensure_ascii=False, sort_keys=False))


if __name__ == "__main__":
    unittest.main()
