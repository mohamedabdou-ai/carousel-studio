"""D4: the Python twin of the Arabic icon lookup (carousel-design/scripts/_cs/icons.py, spec 3.1 "Lookup ladder").

Three groups.
* Vectors. tests/icons/lookup-vectors.json is written by D3 from the JavaScript lookup (src/visual/stem.js and icons.js). Every normalisation,
  every list of stem candidates and every ladder result (name, rung, integer score, concept, negation, primitive, words as typed) must come
  out the same here. Entry 0 holds the fixture data; the real data/icons/stem.json supplies the stemmer tables, as in the JavaScript test.
* Semantics. The rules of spec 3.1 on the same fixture: unstripped token first, dialect verbs, negation and slash, primitives, homographs by
  topic, polarity, no repeats, weights, explain, determinism, missing data.
* Parity. Both implementations run side by side on the same freshly built icon data: the dev corpus slides, a seeded fuzz of mixed queries
  (clitics, tashkeel, negations, homographs, English, digits) and the stemmer on every word. Skipped when node or the icon tool is missing.

Run: python -X utf8 -m unittest tests.unit.py.test_icons
"""
from __future__ import annotations

import ast
import json
import random
import re
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

try:
    import b7_support as support
except ImportError:  # `python -m unittest tests.unit.py.test_icons`: the folder is a package here, not a search-path entry
    from . import b7_support as support

REPO = Path(__file__).resolve().parents[3]
SKILL = REPO / "plugins" / "carousel-studio" / "skills" / "carousel-design"
MODULE = SKILL / "scripts" / "_cs" / "icons.py"
VECTORS = REPO / "tests" / "icons" / "lookup-vectors.json"
CORPUS = REPO / "tests" / "icons" / "corpus.dev.json"
SRC = REPO / "src" / "visual"
NODE = shutil.which("node")
BUDGET = 17 * 1024  # the plan said about 9 KB; stem.js + icons.js are 18 KB of JavaScript, see the D4 report

icons = None
FX = CASES = None


def setUpModule() -> None:
    global icons, FX, CASES
    support.prepare("carousel-design")
    from _cs import icons as module  # noqa: PLC0415
    icons = module
    vec = json.loads(VECTORS.read_text(encoding="utf-8"))
    FX, CASES = vec[0]["fixtures"], vec[1:]


def tearDownModule() -> None:
    if icons is not None:
        icons.use()
    support.cleanup()


def names(rows):
    return [r["name"] for r in rows]


def pairs(rows):
    return [[r["id"], r["neg"]] for r in rows]


class Vectors(unittest.TestCase):
    def tearDown(self) -> None:
        icons.use()

    def test_the_vector_file_is_the_one_d3_publishes(self) -> None:
        self.assertGreaterEqual(len(CASES), 100)
        self.assertEqual(sorted(FX), ["base"])
        self.assertGreaterEqual(sum(1 for c in CASES if "cands" in c), 40)
        self.assertGreaterEqual(sum(1 for c in CASES if "fx" in c), 50)

    def test_normalise_every_vector(self) -> None:
        for c in CASES:
            with self.subTest(c["in"]):
                self.assertEqual(icons.normalize(c["in"]), c["norm"])

    def test_stem_candidates_every_vector(self) -> None:
        for c in CASES:
            if "cands" in c:
                with self.subTest(c["in"], dialect=c.get("dialect")):
                    self.assertEqual(icons.stem_candidates(c["in"], c.get("dialect")), c["cands"])

    def test_ladder_every_vector(self) -> None:
        for c in CASES:
            if "fx" not in c:
                continue
            with self.subTest(c["in"], dialect=c.get("dialect"), topic=c.get("topic")):
                icons.use(FX[c["fx"]])
                hits = icons.find(c["in"], c.get("dialect"), exclude=c.get("exclude") or (), topic=c.get("topic"), avoid_cat=c.get("avoidCat"))
                self.assertEqual([{k: h[k] for k in ("name", "rung", "score", "concept", "neg", "primitive", "via")} for h in hits], c["hits"])
                cs = icons.concepts(c["in"], c.get("dialect"), c.get("topic"))
                self.assertEqual([{k: x[k] for k in ("id", "rung", "score", "neg", "primitive", "pol")} for x in cs], c["cs"])

    def test_scores_are_the_integers_of_the_ladder(self) -> None:
        seen = set()
        for c in CASES:
            for h in c.get("hits", []):
                seen.add((h["rung"], h["score"]))
        for rung, score in seen:
            self.assertIn(rung, range(1, 8))
            self.assertIsInstance(score, int)
        self.assertTrue({(1, 35), (2, 30), (3, 30), (4, 20), (5, 22), (5, 15), (6, 10), (7, 5)} <= seen)


class Semantics(unittest.TestCase):
    def setUp(self) -> None:
        icons.use(FX["base"])

    def tearDown(self) -> None:
        icons.use()

    def test_normaliser_folds_what_spec_3_1_says_and_nothing_else(self) -> None:
        n = icons.normalize
        self.assertEqual(n("الأفكار إيه آمن ٱلكتاب"), "الافكار ايه امن الكتاب")
        self.assertEqual(n("مدرسة ؤئ ى"), "مدرسه وي ي")
        self.assertEqual(n("السَّرّ ـــمحتـــوى"), "السر محتوي")
        self.assertEqual(n("٧٤٪ و ۱۲ و 5"), "74 و 12 و 5")
        self.assertEqual(n("Reels, HOOKS!"), "reels hooks")
        self.assertEqual(n(None), "")
        self.assertEqual(n("   "), "")

    def test_the_unstripped_token_leads_so_a_card_is_not_energy_and_a_recipe_is_not_an_attribute(self) -> None:
        self.assertEqual(icons.concepts("بطاقة")[0]["id"], "card")
        self.assertEqual(icons.concepts("وصفة")[0]["id"], "recipe")
        self.assertEqual(icons.concepts("طاقة")[0]["id"], "energy")
        self.assertEqual(icons.concepts("صفة")[0]["id"], "trait")
        self.assertEqual(icons.concepts("بطاقتك")[0]["id"], "card", "a stem still finds the card when the word has a suffix")
        self.assertEqual(icons.concepts("بطاقة")[0]["rung"], 2)
        self.assertEqual(icons.concepts("بطاقتك")[0]["rung"], 5)

    def test_candidates_come_in_a_fixed_order_and_stay_bounded(self) -> None:
        c = icons.stem_candidates("السَّاعات")
        self.assertEqual(c[0], "الساعات")
        self.assertIn("ساعه", c)
        self.assertIn("ساعه", icons.stem_candidates("ساعات"))
        self.assertEqual(len(c), len(set(c)))
        self.assertLessEqual(len(icons.stem_candidates("والمتابعينكمهم")), 60)
        self.assertEqual(icons.stem_candidates(""), [])
        self.assertEqual(icons.stem_candidates("Hooks"), ["hooks", "hook"])
        self.assertEqual(icons.stem_candidates("كيكتب", "mag")[1], "يكتب", "the Maghrebi progressive prefix needs the Maghrebi dialect")
        self.assertEqual(icons.stem_candidates("كيكتب", "eg"), ["كيكتب"])

    def test_dialect_verbs_reach_their_concept(self) -> None:
        self.assertEqual(icons.concepts("بتقرا", "eg")[0]["id"], "reading")
        self.assertEqual(icons.concepts("هتكتب", "eg")[0]["id"], "writing")
        self.assertEqual(icons.concepts("حيكتب", "eg")[0]["id"], "writing")
        w = icons.concepts("رح يكتب", "lev")[0]
        self.assertEqual([w["id"], w["rung"]], ["writing", 2])
        self.assertEqual(icons.concepts("كيكتب", "mag")[0]["id"], "writing")
        self.assertEqual(icons.concepts("كيكتب", "eg"), [])
        self.assertEqual(icons.concepts("ميتقراش", "eg")[0]["id"], "reading", "ma + verb + sh is read through")

    def test_a_negation_puts_slash_on_the_concepts_own_icon_and_never_picks_the_alert_icon(self) -> None:
        r = icons.find("السر مش في التصميم", "eg", k=12)
        self.assertEqual(r[0]["concept"], "design")
        self.assertTrue(r[0]["neg"])
        self.assertIn(r[0]["name"], ("palette", "pen-tool", "layout-template"))
        self.assertNotIn("triangle-alert", names(r))
        self.assertEqual(pairs(icons.concepts("السر مش في التصميم", "eg")), [["design", True], ["secret", False]])
        self.assertEqual(pairs(icons.concepts("ماتشتريش", "eg")), [["shopping", True]])
        self.assertEqual(pairs(icons.concepts("مفيش وقت", "eg")), [["time", True]])
        self.assertEqual(pairs(icons.concepts("لا تنشر قبل ما تراجع", "msa")), [["publish", True]])
        self.assertEqual(pairs(icons.concepts("التصميم مش مهم", "eg")), [["design", True]], "no concept after it: the one before")
        self.assertTrue(icons.find("من غير كاميرا", "eg")[0]["neg"], "a keyword icon is bound too")
        self.assertFalse(icons.find("كاميرا")[0]["neg"])
        self.assertEqual(icons.find("مش كده"), [], "a negation with nothing to negate finds nothing")
        self.assertFalse(icons.concepts("ماشي التصميم", "eg")[0]["neg"], "the Maghrebi 'maashi' negates only in the Maghrebi dialect")
        self.assertTrue(icons.concepts("ماشي التصميم", "mag")[0]["neg"])

    def test_structural_words_become_primitives_not_icons(self) -> None:
        c = icons.concepts("قبل وبعد")[0]
        self.assertEqual([c["id"], c["primitive"], c["rung"], c["score"]], ["before-after", "before-after", 1, 35])
        self.assertEqual(icons.find("قبل وبعد")[0]["primitive"], "before-after")
        v = icons.concepts("الكاروسيل ضد الريل")
        self.assertEqual([v[0]["primitive"], v[1]["id"]], ["versus", "carousel"])
        self.assertEqual(icons.concepts("فولورز")[0]["object"], "star", "an object rides along")

    def test_homographs_resolve_by_the_topic_category_and_the_first_sense_wins_without_one(self) -> None:
        def sense(topic, q="عنوان"):
            return icons.find(q, topic=topic)[0]

        self.assertEqual(sense(None)["concept"], "headline")
        self.assertEqual(sense(["education"])["concept"], "headline")
        self.assertEqual([sense(["sales"])["name"], sense(["sales"])["concept"]], ["map-pin", "home:عنوان:1"])
        self.assertEqual(sense(["travel", "sales"])["name"], "map-pin")
        self.assertEqual(sense("sales")["name"], "map-pin", "a string topic works")
        self.assertEqual(sense(["real-estate"], "العناوين")["name"], "map-pin", "a plural reaches the same senses")
        self.assertEqual(sense(["unknown-category"])["concept"], "headline")
        self.assertEqual(sense(["sales", "creator"])["name"], "map-pin", "the first topic wins")
        self.assertEqual(sense(["creator", "sales"])["concept"], "headline")
        # the other words of the sentence are the cues, before the topic is asked
        self.assertEqual(icons.find("اكتب عنوان التوصيل صح", "eg", topic=["creator"])[0]["name"], "truck")
        self.assertEqual(icons.find("جه دورك", topic=["business"])[0]["concept"], "home:دور:1")
        self.assertEqual(icons.find("الدور الثالث في العمارة")[0]["name"], "map-pin")

    def test_without_the_concept_layer_the_home_table_still_resolves_them(self) -> None:
        icons.use({**FX["base"], "concepts": {"concepts": []}})
        self.assertEqual(icons.find("عنوان")[0]["name"], "type")
        self.assertEqual(icons.find("عنوان", topic=["sales"])[0]["name"], "map-pin")
        self.assertEqual([r["rung"] for r in icons.find("قناة", topic=["travel"])], [7], "icons the index lacks are never returned")

    def test_the_topic_of_a_script_comes_from_its_concepts_and_a_homograph_does_not_vote(self) -> None:
        self.assertEqual(icons.topic("فلوس وتوفير وعنوان"), ["finance"])
        self.assertEqual(icons.topic(["الفلوس", {"text": "التصميم والكاميرا", "w": 60}])[:1], ["finance"])
        self.assertEqual(icons.topic("في من على"), [])
        self.assertLessEqual(len(icons.topic("فلوس وتصميم ووقت وكتاب")), 2)

    def test_polarity_a_warning_slide_takes_the_flagged_icons_first(self) -> None:
        warn = icons.find("احذر الغلطة دي في الغلاف", "eg")
        self.assertEqual(warn[0]["name"], "triangle-alert")
        self.assertTrue(set(names(warn)) <= {"triangle-alert", "circle-alert", "circle-x", "heart-crack", "thumbs-down"})
        self.assertEqual(icons.concepts("احذر")[0]["pol"], "warn")
        mixed = names(icons.find("5 أخطاء بتموّت الكاروسيل", "eg", k=8))
        self.assertEqual(mixed[0], "triangle-alert")
        self.assertGreater(mixed.index("gallery-horizontal"), mixed.index("thumbs-down"))
        self.assertNotIn("triangle-alert", names(icons.find("كاروسيل")))
        self.assertEqual(icons.concepts("خطا واضح"), [], "the bare word 'khata' is not a warning")

    def test_no_repeats_exclude_gives_the_next_best_and_avoid_cat_prefers_another_category(self) -> None:
        self.assertEqual(icons.find("توفير الوقت")[0]["name"], "hourglass")
        self.assertEqual(icons.find("توفير الوقت", exclude=["hourglass"])[0]["name"], "clock")
        self.assertNotIn("timer", names(icons.find("توفير الوقت", k=9, exclude=["hourglass", "clock", "timer"])))
        self.assertEqual(names(icons.find("فلوس", k=3)), ["coins", "wallet", "piggy-bank"])
        plain = icons.find("الفلوس والمتابعين", k=6)
        avoided = icons.find("الفلوس والمتابعين", k=6, avoid_cat="finance")
        self.assertEqual(plain[0]["cat"], "finance")
        self.assertNotEqual(avoided[0]["cat"], "finance")
        self.assertEqual(len(avoided), len(plain))
        near = icons.find("توفير الوقت", k=6, avoid_cat="productivity")
        self.assertEqual([near[0]["name"], near[0]["cat"], near[0]["score"]], ["piggy-bank", "finance", 30], "30 is within 5 points of 35")
        self.assertEqual(icons.find("وقت", k=4, avoid_cat="productivity")[0]["name"], "clock", "nothing of another category: the order stays")
        self.assertEqual(len(icons.find("فلوس", k=2)), 2)
        self.assertEqual(len(icons.find("فلوس")), 3, "k defaults to 5 and the concept holds three icons")

    def test_hero_avoid_and_the_occasion_icons(self) -> None:
        self.assertIn("rocket", names(icons.find("صاروخ")))
        self.assertNotIn("rocket", names(icons.find("صاروخ", hero=True)), "a high-detail icon never goes to xl or hero")
        self.assertIn("users", names(icons.find("جمهور")))
        self.assertNotIn("users", names(icons.find("جمهور", avoid=["h"])), "faceless brands drop figure icons")
        self.assertNotIn("cat", names(icons.find("قطة", avoid=["a"])))
        self.assertIn("mosque", names(icons.find("مسجد")), "its own word brings it")
        stem = json.loads((SKILL / "data" / "icons" / "stem.json").read_text(encoding="utf-8"))
        icons.use({**FX["base"], "stem": {**stem, "def": {"mena": "mosque coins"}}})
        self.assertEqual(names(icons.find("في من", topic=["mena"])), ["coins"], "a topic default is never an occasion icon")

    def test_several_fields_are_weighted_like_the_planner_does(self) -> None:
        f = icons.find([{"text": "وقتك", "w": 100}, {"text": "فلوس", "w": 60}], k=6)
        self.assertEqual([f[0]["name"], f[0]["score"]], ["clock", 22])
        self.assertEqual(next(x for x in f if x["name"] == "coins")["score"], 18, "30 x 60 / 100")
        swap = icons.find([{"text": "وقتك", "w": 60}, {"text": "فلوس", "w": 100}], k=6)
        self.assertEqual([swap[0]["name"], swap[0]["score"]], ["coins", 30])
        self.assertEqual(icons.find([{"text": "فلوس", "w": 0}]), [], "a zero weight silences a field")
        self.assertEqual(len(icons.find(["فلوس", "وقت"], k=6)), 6, "plain strings are full-weight fields")
        c = icons.concepts([{"text": "وقتك", "w": 100}, {"text": "وقت", "w": 60}])
        self.assertEqual([c[0]["id"], c[0]["score"]], ["time", 22], "the best hit counts, hits do not add")

    def test_a_form_of_the_speakers_own_dialect_leads_a_tie(self) -> None:
        self.assertEqual(icons.find("حاجتي", "eg")[0]["concept"], "thing-eg")
        self.assertEqual(icons.find("حاجتي", "gulf")[0]["concept"], "thing-gulf")
        self.assertEqual(icons.find("فولورز", "lev")[0]["concept"], "followers", "loan words count for every dialect")

    def test_explain_says_why_in_the_dialect_in_at_most_120_characters(self) -> None:
        e = icons.explain("hourglass", "توفير الوقت", "eg")
        self.assertEqual([e["name"], e["rung"], e["concept"]], ["hourglass", 1, "time-saving"])
        self.assertEqual(e["via"], "توفير الوقت")
        self.assertTrue(e["why"].startswith("اخترنا") and "hourglass" in e["why"] and "توفير الوقت" in e["why"])
        for d in ("eg", "gulf", "lev", "mag", "msa", "xx", None):
            w = icons.explain("clock", "الساعات بتجري", d)["why"]
            self.assertTrue(0 < len(w) <= 120 and "clock" in w and "الساعات" in w, "%s: %s" % (d, w))
        self.assertNotEqual(icons.explain("clock", "وقتك", "eg")["why"], icons.explain("clock", "وقتك", "lev")["why"], "five dialects, five templates")
        self.assertIsNone(icons.explain("rocket", "فلوس", "eg"))
        self.assertEqual(icons.find("إيه", "eg"), [])

    def test_has_and_result_shape(self) -> None:
        self.assertTrue(icons.has("clock") and icons.has("dot-test"))
        self.assertFalse(icons.has("nope"))
        r = icons.find("فلوس", "eg")[0]
        self.assertEqual(list(r), ["name", "score", "rung", "concept", "cat", "via", "neg", "primitive", "object", "why"])
        c = icons.concepts("فلوس", "eg")[0]
        self.assertEqual(list(c), ["id", "cat", "score", "rung", "icons", "object", "primitive", "pol", "neg", "via"])

    def test_deterministic_and_independent_of_call_order(self) -> None:
        qs = [c["in"] for c in CASES if "fx" in c]

        def run(order):
            return {q: json.dumps([icons.find(q, k=6), icons.concepts(q)], ensure_ascii=False, sort_keys=True) for q in order}

        a, b = run(qs), run(reversed(qs))
        self.assertEqual(a, b)
        self.assertEqual(a, run(qs))
        icons.use(FX["base"])
        self.assertEqual(a, run(qs), "a fresh load of the same data")

    def test_new_data_is_seen_at_once_and_missing_data_degrades_to_nothing(self) -> None:
        self.assertEqual(icons.concepts("فلوس")[0]["id"], "money")
        icons.use({**FX["base"], "concepts": {"concepts": [c for c in FX["base"]["concepts"]["concepts"] if c["id"] != "money"]}})
        self.assertEqual(icons.concepts("فلوس"), [])
        icons.use({"pack": None, "index": None, "concepts": None, "stem": None})
        self.assertEqual(icons.find("فلوس"), [])
        self.assertEqual(icons.normalize("فلوس"), "فلوس")
        icons.use(folder=str(REPO / "no" / "such" / "folder"))
        self.assertEqual(icons.concepts("فلوس"), [])
        self.assertFalse(icons.has("clock"))


class Hygiene(unittest.TestCase):
    def test_the_module_is_plain_ascii_pure_and_inside_its_budget(self) -> None:
        text = MODULE.read_text(encoding="utf-8")
        self.assertTrue(text.isascii(), "Arabic characters are written as escapes so the source never hides a combining mark")
        self.assertLessEqual(len(text.encode("utf-8")), BUDGET)
        modules = set()
        for node in ast.walk(ast.parse(text)):
            if isinstance(node, ast.Import):
                modules.update(a.name.split(".")[0] for a in node.names)
            elif isinstance(node, ast.ImportFrom):
                modules.add(("." * node.level) + (node.module or ""))
        self.assertEqual(modules, {"math", "re", "unicodedata", "pathlib", "types", "."}, "standard library and the sibling paths module only")
        for bad in ("random", "datetime", "time.", "analytics", "environ", "urllib", "socket", "subprocess"):
            self.assertNotIn(bad, text)

    def test_the_public_names(self) -> None:
        for name in ("normalize", "stem_candidates", "find", "concepts", "topic", "explain", "has", "use"):
            self.assertTrue(callable(getattr(icons, name)), name)


JS_HARNESS = r"""
const vm = require("node:vm"), fs = require("node:fs"), path = require("node:path");
const [, , srcDir, dataDir, reqFile, outFile] = process.argv;
const text = ["root.js", "stem.js", "icons.js"].map((f) => fs.readFileSync(path.join(srcDir, f), "utf8")).join("\n");
const sb = {}; sb.window = sb; vm.createContext(sb);
vm.runInContext(`(function(){"use strict";var CS=(window.CS=window.CS||{});\n${text}\n})();`, sb);
const V = sb.CS.visual, rd = (f) => JSON.parse(fs.readFileSync(path.join(dataDir, f), "utf8"));
V._.blocks = { "cs-icon-pack": rd("pack.json"), "cs-icon-index": rd("index.json"), "cs-icon-concepts": rd("concepts.json"), "cs-icon-stem": rd("stem.json") };
const I = V.icons, S = V._.stem, plain = (x) => JSON.parse(JSON.stringify(x));
const req = JSON.parse(fs.readFileSync(reqFile, "utf8"));
const out = {
  stem: req.words.map((w) => plain({ norm: S.norm(w[0]), cands: S.tok(w[0]).length ? S.cands(S.tok(w[0])[0].n, w[1] || undefined) : [] })),
  look: req.look.map((r) => plain({
    find: I.find(r.q, { dialect: r.dialect, topic: r.topic, k: r.k, exclude: r.exclude, hero: r.hero, avoid: r.avoid, avoidCat: r.avoidCat }),
    concepts: I.concepts(r.q, { dialect: r.dialect, topic: r.topic }), topic: I.topic(r.q, { dialect: r.dialect })
  }))
};
fs.writeFileSync(outFile, JSON.stringify(out));
"""

PRE = ["", "", "", "ال", "و", "ب", "لل", "ه", "ح", "رح ", "ك", "بال", "ي", "ت", "ما", "م"]
SUF = ["", "", "", "ك", "ها", "هم", "ات", "ين", "ون", "ة", "ش", "وا", "نا", "ي"]
NEGS = ["مش", "ما", "لا", "بدون", "من غير", "مفيش", "ليس", "لن", "ماشي"]
MARKS = ["", "", "", chr(0x64E), chr(0x651), chr(0x640)]
DIALECTS = [None, "auto", "eg", "gulf", "lev", "mag", "msa", "xx"]


def drop_none(x):
    if isinstance(x, dict):
        return {k: drop_none(v) for k, v in x.items() if v is not None}
    return [drop_none(v) for v in x] if isinstance(x, list) else x


@unittest.skipUnless(NODE, "node is not installed")
class Parity(unittest.TestCase):
    """The JavaScript lookup and this one on the same built data: nothing may differ."""

    @classmethod
    def setUpClass(cls) -> None:
        if not all((SRC / f).is_file() for f in ("root.js", "stem.js", "icons.js")):
            raise unittest.SkipTest("src/visual lookup sources are not there")
        cls.tmp = tempfile.TemporaryDirectory()
        cls.data = Path(cls.tmp.name) / "data"
        done = subprocess.run([NODE, str(REPO / "tools" / "build-icons.mjs"), "--out", str(cls.data)], capture_output=True, text=True, encoding="utf-8", cwd=str(REPO), timeout=300)
        if done.returncode != 0 or not (cls.data / "index.json").is_file():
            cls.tmp.cleanup()
            raise unittest.SkipTest("the icon tool cannot build the data: %s" % done.stderr.strip()[-200:])
        shutil.copy(SKILL / "data" / "icons" / "stem.json", cls.data / "stem.json")
        (Path(cls.tmp.name) / "harness.cjs").write_text(JS_HARNESS, encoding="utf-8")
        icons.use(folder=str(cls.data))

    @classmethod
    def tearDownClass(cls) -> None:
        icons.use()
        cls.tmp.cleanup()

    def js(self, words, look):
        base = Path(self.tmp.name)
        (base / "req.json").write_text(json.dumps({"words": words, "look": look}, ensure_ascii=False), encoding="utf-8")
        done = subprocess.run([NODE, str(base / "harness.cjs"), str(SRC), str(self.data), str(base / "req.json"), str(base / "out.json")],
                              capture_output=True, text=True, encoding="utf-8", timeout=300)
        self.assertEqual(done.returncode, 0, done.stderr[-800:])
        return json.loads((base / "out.json").read_text(encoding="utf-8"))

    def python(self, r):
        return drop_none(json.loads(json.dumps({
            "find": icons.find(r["q"], r["dialect"], k=r["k"], exclude=r.get("exclude") or (), hero=r.get("hero", False), topic=r.get("topic"),
                               avoid=r.get("avoid") or (), avoid_cat=r.get("avoidCat")),
            "concepts": icons.concepts(r["q"], r["dialect"], r.get("topic")), "topic": icons.topic(r["q"], r["dialect"])}, ensure_ascii=False)))

    def corpus_requests(self):
        reqs = []
        for s in json.loads(CORPUS.read_text(encoding="utf-8")):
            both = [{"text": s["title"], "w": 100}, {"text": s["body"], "w": 60}]
            reqs += [{"q": both, "dialect": s["dialect"], "k": 8}, {"q": s["title"], "dialect": s["dialect"], "k": 12},
                     {"q": s["body"], "dialect": s["dialect"], "k": 8, "hero": True, "avoid": ["h", "a"]},
                     {"q": both, "dialect": None, "k": 6, "topic": ["finance", "creator"]}]
        for r, first in [(r, icons.find(r["q"], r["dialect"], k=3)) for r in reqs[::4]]:
            if first:
                reqs.append({"q": r["q"], "dialect": r["dialect"], "k": 8, "exclude": [a["name"] for a in first[:2]], "avoidCat": first[0]["cat"]})
        return reqs

    def fuzz_requests(self, seed, count):
        rnd = random.Random(seed)
        corpus = json.loads(CORPUS.read_text(encoding="utf-8"))
        words = sorted({w for s in corpus for w in re.findall("[ء-ي]+", s["title"] + " " + s["body"])})
        concepts = json.loads((self.data / "concepts.json").read_text(encoding="utf-8"))["concepts"]
        forms = sorted({x for c in concepts for lst in c["forms"].values() for x in lst}) or words
        index = json.loads((self.data / "index.json").read_text(encoding="utf-8"))
        keywords, english = sorted({x for r in index for x in r[3]}), sorted({x for r in index for x in r[2]})
        homes = sorted(json.loads((SKILL / "data" / "icons" / "stem.json").read_text(encoding="utf-8"))["home"])
        cats = sorted({r[1] for r in index})

        def token():
            w = rnd.choice(rnd.choice([words, words, forms, forms, keywords, english, homes]))
            if rnd.random() < 0.45:
                w = rnd.choice(PRE) + w + rnd.choice(SUF)
            return w[:1] + rnd.choice(MARKS) + w[1:] if rnd.random() < 0.1 else w

        def query():
            toks = [token() for _ in range(rnd.randint(1, 7))]
            if rnd.random() < 0.3:
                toks.insert(rnd.randint(0, len(toks)), rnd.choice(NEGS))
            if rnd.random() < 0.08:
                toks.insert(0, str(rnd.randint(1, 99)))
            return " ".join(toks)

        reqs = []
        for _ in range(count):
            q = query() if rnd.random() < 0.7 else [{"text": query(), "w": rnd.choice([100, 60, 30, 0])}, {"text": query(), "w": rnd.choice([60, 100, 45])}]
            r = {"q": q, "dialect": rnd.choice(DIALECTS), "k": rnd.choice([1, 3, 5, 8, 20])}
            if rnd.random() < 0.4:
                r["topic"] = rnd.sample(cats, rnd.randint(1, 3)) if rnd.random() < 0.8 else rnd.choice(cats)
            if rnd.random() < 0.2:
                r["hero"] = True
            if rnd.random() < 0.2:
                r["avoid"] = rnd.sample(["h", "a", "o", "c"], rnd.randint(1, 3))
            if rnd.random() < 0.25:
                r["avoidCat"] = rnd.choice(cats)
            if rnd.random() < 0.2:
                r["exclude"] = [rnd.choice(index)[0] for _ in range(rnd.randint(1, 6))]
            reqs.append(r)
        return reqs

    def compare(self, reqs, words=()):
        out = self.js(list(words), reqs)
        bad = []
        for r, theirs in zip(reqs, out["look"]):
            mine = self.python(r)
            if mine != drop_none(theirs):
                bad.append((r, [k for k in mine if mine[k] != drop_none(theirs)[k]]))
        self.assertEqual(bad[:3], [], "%d of %d requests differ" % (len(bad), len(reqs)))
        for w, theirs in zip(words, out["stem"]):
            self.assertEqual(icons.normalize(w[0]), theirs["norm"], w)
            self.assertEqual(icons.stem_candidates(w[0], w[1] or None), theirs["cands"], w)
        return out

    def test_the_dev_corpus_slides_agree(self) -> None:
        reqs = self.corpus_requests()
        self.assertGreaterEqual(len(reqs), 600)
        out = self.compare(reqs)
        self.assertGreater(sum(1 for x in out["look"] if x["find"]), len(reqs) * 0.8, "the comparison is not trivially empty")

    def test_a_seeded_fuzz_of_mixed_queries_agrees(self) -> None:
        reqs = self.fuzz_requests(7, 500)
        out = self.compare(reqs)
        self.assertGreater(sum(1 for x in out["look"] if any(h["neg"] for h in x["find"])), 20, "negations are exercised")
        self.assertGreater(sum(1 for x in out["look"] if x["concepts"]), 200, "the concept layer is exercised")

    def test_the_stemmer_agrees_on_every_word_in_every_dialect(self) -> None:
        words = sorted({w for s in json.loads(CORPUS.read_text(encoding="utf-8")) for w in re.findall("[ء-ي]+", s["title"] + " " + s["body"])})
        pairs_ = [(w, d) for w in words for d in ("", "mag")] + [(c["in"], c.get("dialect") or "") for c in CASES if "cands" in c]
        self.compare([], pairs_)


if __name__ == "__main__":
    unittest.main()
