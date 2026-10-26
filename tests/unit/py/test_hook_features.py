"""Tests for carousel-create/scripts/hook_features.py: the five gates, the rule scores, the prior, the penalties, the batch ranking,
and the shared fixture of 18 candidates whose gate outcomes were written down by hand (tests/fixtures/hook-candidates.eg.json).

Run: python -m unittest discover -s tests/unit/py -p "test_hook_features.py"
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import b7_support as support

REPO = Path(__file__).resolve().parents[3]
SKILL = REPO / "plugins" / "carousel-studio" / "skills" / "carousel-create"
SCRIPT = SKILL / "scripts" / "hook_features.py"
DATA = SKILL / "data" / "hooks"
FIXTURES = REPO / "tests" / "fixtures"
ENV = {**os.environ, "PYTHONIOENCODING": "utf-8", "PYTHONUTF8": "1"}

hf = None
ctx = None


class Args:
    library = None
    brand = None
    history = None
    sourced = None


def setUpModule() -> None:
    global hf, ctx
    hf = support.load_script("carousel-create", "hook_features.py", "hook_features_under_test")
    ctx = hf.Context(Args())


def tearDownModule() -> None:
    support.cleanup()


def run_cli(*args: str, stdin: str | None = None) -> subprocess.CompletedProcess:
    return subprocess.run([sys.executable, str(SCRIPT), *args], input=stdin, capture_output=True, text=True, encoding="utf-8", env=ENV, timeout=120)


def analyse(text: str, dialect: str = "eg", **kw) -> dict:
    hook = {"id": kw.pop("id", "x"), "text": text, "cover": kw.pop("cover", text)}
    for key in ("family", "hookId", "sourced", "intent", "awareness", "role"):
        if key in kw:
            hook[key] = kw.pop(key)
    return hf.analyse(ctx, hook, {"dialect": dialect, "role": "cover", **kw})


def gates(result: dict) -> dict:
    return {k: g["pass"] for k, g in result["gates"].items()}


class ScoringDataTests(unittest.TestCase):
    def setUp(self) -> None:
        self.scoring = json.loads((DATA / "scoring.json").read_text(encoding="utf-8"))

    def test_weights_add_up_to_one_hundred(self) -> None:
        self.assertEqual(sum(self.scoring["weights"].values()), 100)

    def test_the_parts_equal_their_totals(self) -> None:
        self.assertEqual(sum(self.scoring["rules"].values()), self.scoring["weights"]["R"])
        self.assertEqual(sum(self.scoring["judge"].values()), self.scoring["weights"]["J"])
        self.assertEqual(self.scoring["prior"]["intentPrimary"] + max(self.scoring["prior"]["evidence"].values()), self.scoring["weights"]["P"])

    def test_penalties_are_negative(self) -> None:
        self.assertTrue(all(v < 0 for v in self.scoring["penalties"].values()))
        self.assertEqual(set(self.scoring["penalties"]), {"familyRepeat", "similar", "emoji", "latinOnly"})

    def test_the_documented_numbers_are_the_data(self) -> None:
        doc = (SKILL / "references" / "hook-scoring.md").read_text(encoding="utf-8")
        for needle in ("20", "40", "10", "15", "5", "0.8", "12", "125"):
            self.assertIn(needle, doc)

    def test_families_and_libraries_agree(self) -> None:
        families = {f["code"] for f in json.loads((DATA / "families.json").read_text(encoding="utf-8"))["families"]}
        self.assertEqual(len(families), 26)
        for lang in ("ar", "en"):
            lib = json.loads((DATA / ("library.%s.json" % lang)).read_text(encoding="utf-8"))
            self.assertTrue({e["family"] for e in lib["entries"]} <= families)


class FixtureTests(unittest.TestCase):
    """The 18 candidates of tests/fixtures/hook-candidates.eg.json: gates as written by hand."""

    @classmethod
    def setUpClass(cls) -> None:
        cls.fx = json.loads((FIXTURES / "hook-candidates.eg.json").read_text(encoding="utf-8"))
        cls.brand = FIXTURES / "brand.eg.creator.json"
        res = run_cli("--batch", str(FIXTURES / "hook-candidates.eg.json"), "--dialect", "eg", "--brand", str(cls.brand), "--intent", "save", "--awareness", "problem")
        assert res.returncode == 0, res.stdout + res.stderr
        cls.out = json.loads(res.stdout)
        cls.by_id = {r["id"]: r for r in cls.out["results"]}

    def test_gate_outcomes_match_the_expectation_of_every_candidate(self) -> None:
        for cand in self.fx["candidates"]:
            want = {k: v == "pass" for k, v in cand["expect"]["gates"].items()}
            self.assertEqual(gates(self.by_id[cand["id"]]), want, cand["id"])

    def test_the_discarded_set_is_exactly_the_five_expected(self) -> None:
        self.assertEqual(set(self.out["summary"]["discarded"]), set(self.fx["expect"]["mustDiscard"]))

    def test_enough_candidates_and_families(self) -> None:
        self.assertGreaterEqual(len(self.out["results"]), self.fx["expect"]["minCandidates"])
        self.assertGreaterEqual(len({r["family"] for r in self.out["results"]}), self.fx["expect"]["minFamilies"])
        self.assertTrue(self.out["summary"]["enoughCandidates"] and self.out["summary"]["enoughFamilies"])

    def test_top_three_come_from_three_families_and_only_from_survivors(self) -> None:
        top = self.out["top3"]
        self.assertEqual(len(top), 3)
        self.assertEqual(len({self.by_id[i]["family"] for i in top}), 3)
        self.assertFalse(set(top) & set(self.fx["expect"]["mustDiscard"]))
        self.assertTrue(set(top) <= set(self.out["ranking"]))

    def test_ranking_is_ordered_by_the_partial_score(self) -> None:
        partials = [self.by_id[i]["partial"] for i in self.out["ranking"]]
        self.assertEqual(partials, sorted(partials, reverse=True))

    def test_the_emoji_candidate_pays_the_emoji_penalty(self) -> None:
        r = self.by_id["P3-MISTAKE-with-emoji"]
        self.assertEqual(r["penalties"]["emoji"], -5)
        self.assertEqual(self.by_id["P3-MISTAKE-count-cost"]["penalties"]["emoji"], 0)

    def test_the_recent_family_pays_the_repeat_penalty(self) -> None:
        brand = json.loads(self.brand.read_text(encoding="utf-8"))
        recent = [p["family"] for p in brand["hooks"]["history"][-2:]]
        for r in self.out["results"]:
            self.assertEqual(r["penalties"]["familyRepeat"], -10 if r["family"] in recent else 0, r["id"])

    def test_every_gate_carries_both_languages(self) -> None:
        for r in self.out["results"]:
            for g in r["gates"].values():
                self.assertTrue(g["reason"]["ar"] and g["reason"]["en"])

    def test_discarded_hooks_have_no_total_and_survivors_do(self) -> None:
        for r in self.out["results"]:
            self.assertEqual(r["discarded"], bool(r["failed"]))


class GateTests(unittest.TestCase):
    def test_hg1_limits(self) -> None:
        self.assertTrue(analyse("ستة كلمات بالضبط في الغلاف هنا")["gates"]["HG1"]["pass"])
        self.assertFalse(analyse("سبع كلمات هنا في أول جملة من الغلاف")["gates"]["HG1"]["pass"])
        self.assertTrue(analyse("الناس بتقول الكاروسيل لازم يتصمم حلو… والحقيقة العكس")["gates"]["HG1"]["pass"], "the second beat only counts toward the total")
        self.assertFalse(analyse("كلمة " * 13)["gates"]["HG1"]["pass"])

    def test_hg1_total_of_twelve(self) -> None:
        ok = "ست كلمات هنا في أول الجملة… وست كلمات تانية في آخرها هنا"
        self.assertTrue(analyse(ok)["gates"]["HG1"]["pass"])
        self.assertFalse(analyse(ok + " زيادة")["gates"]["HG1"]["pass"])

    def test_hg1_by_role(self) -> None:
        long_text = "كلمة " * 13
        self.assertFalse(analyse(long_text, role="slide2", cover="")["gates"]["HG1"]["pass"])
        self.assertTrue(analyse("كلمة " * 12, role="slide2", cover="")["gates"]["HG1"]["pass"])
        self.assertFalse(analyse("ك" * 126, role="caption-line1", cover="")["gates"]["HG1"]["pass"])
        spoken = analyse(long_text, role="spoken", cover="")
        self.assertTrue(spoken["gates"]["HG1"]["pass"])
        self.assertFalse(spoken["gates"]["HG1"].get("applies", True))

    def test_hg2_unsourced_figures_fail(self) -> None:
        self.assertFalse(analyse("كاروسيل جاب 90% حفظ أكتر")["gates"]["HG2"]["pass"])
        self.assertFalse(analyse("413 حفظ من كاروسيل واحد")["gates"]["HG2"]["pass"])
        self.assertFalse(analyse("زودنا المبيعات 2.5 مرة")["gates"]["HG2"]["pass"])

    def test_hg2_a_source_clears_it(self) -> None:
        self.assertTrue(analyse("كاروسيل جاب 90% حفظ أكتر", sourced=["90"])["gates"]["HG2"]["pass"])
        self.assertTrue(analyse("كاروسيل جاب ٩٠٪ حفظ أكتر", sourced=["90"])["gates"]["HG2"]["pass"], "Arabic-Indic digits and the percent sign are normalised")

    def test_hg2_counts_and_time_frames_need_no_source(self) -> None:
        for text in ("5 أخطاء بتموّت الكاروسيل", "كاروسيل في 10 دقايق", "7 أدوات ببلاش", "من 2026 والتغيير مستمر"):
            self.assertTrue(analyse(text)["gates"]["HG2"]["pass"], text)

    def test_hg2_is_strict_for_result_patterns(self) -> None:
        lib = {e["id"]: e for e in ctx.entries.values()}
        proof = next(i for i, e in lib.items() if e.get("needsSource") and e["family"] == "P7")
        self.assertFalse(analyse("30 عميل جديد في شهر", hookId=proof)["gates"]["HG2"]["pass"])
        self.assertTrue(analyse("30 عميل جديد في شهر", hookId=proof, sourced=["30"])["gates"]["HG2"]["pass"])

    def test_hg3_answer_cue_fails(self) -> None:
        self.assertFalse(analyse("ليه محدش بيحفظ؟ السبب هو الغلاف")["gates"]["HG3"]["pass"])
        self.assertFalse(analyse("كاروسيل")["gates"]["HG3"]["pass"], "one word opens no specific gap")
        self.assertTrue(analyse("آخر كاروسيل نزّلته… ليه محدش حفظه؟")["gates"]["HG3"]["pass"])
        self.assertTrue(analyse("آخر كاروسيل نزّلته… ليه محدش حفظه؟")["gates"]["HG3"]["judged"])

    def test_hg4_dialect_leak(self) -> None:
        self.assertFalse(analyse("ابغى اعرف ليش الكاروسيل ما ينحفظ", "eg")["gates"]["HG4"]["pass"])
        self.assertTrue(analyse("ابغى اعرف ليش الكاروسيل ما ينحفظ", "gulf")["gates"]["HG4"]["pass"])

    def test_hg4_two_digit_systems(self) -> None:
        self.assertFalse(analyse("5 أخطاء و٣ حلول للكاروسيل")["gates"]["HG4"]["pass"])

    def test_hg5_policy_lists(self) -> None:
        cases = {
            "اكتب نعم لو عايز الجزء التاني": "bait",
            "الحقيقة الصادمة عن الكاروسيل": "hype",
            "نتيجة مضمونة من أول كاروسيل": "overclaim",
            "بيخبوه عنك مصممين الكاروسيل": "conspiracy",
        }
        for text, why in cases.items():
            self.assertFalse(analyse(text)["gates"]["HG5"]["pass"], why)

    def test_hg5_fear_stacking_needs_two_distinct_words(self) -> None:
        stacked = ctx.list_entries("fearWords")
        words = [e["text"] for e in stacked if e.get("match") == "word"][:2]
        self.assertEqual(len(words), 2)
        self.assertFalse(analyse("%s و%s في بوستك" % tuple(words))["gates"]["HG5"]["pass"])
        self.assertTrue(analyse("%s في بوستك" % words[0])["gates"]["HG5"]["pass"])

    def test_a_clean_hook_passes_everything(self) -> None:
        r = analyse("5 أخطاء بتموّت الكاروسيل", family="P3")
        self.assertTrue(all(gates(r).values()))
        self.assertFalse(r["discarded"])


class ScoreTests(unittest.TestCase):
    def test_scannability_rewards_a_numeral_on_a_list_family(self) -> None:
        a = analyse("5 أدوات ببلاش", family="P1")["rules"]["scannability"]
        b = analyse("أدوات ببلاش كتير", family="P1")["rules"]["scannability"]
        self.assertGreater(a, b)

    def test_scannability_wants_a_meaning_word_first(self) -> None:
        good = analyse("كاروسيل يتحفظ… من أول مرة")["rules"]["scannability"]
        weak = analyse("في الحقيقة من غير ما… تقول")["rules"]["scannability"]
        self.assertGreater(good, weak)

    def test_specificity_penalises_abstract_words(self) -> None:
        concrete = analyse("5 أدوات Canva بتوفر ساعة")["rules"]["specificity"]
        abstract = analyse("سر نجاح حياتك")["rules"]["specificity"]
        self.assertGreater(concrete, abstract)
        self.assertGreaterEqual(abstract, 0)

    def test_scores_stay_in_range(self) -> None:
        for text in ("5 أدوات Canva بتوفر ساعة في الأسبوع", "سر نجاح حياتك الصادم", "كاروسيل"):
            r = analyse(text, family="P1")["rules"]
            for key in ("scannability", "specificity", "awarenessFit", "voiceFit"):
                self.assertTrue(0 <= r[key] <= 10, (text, key, r[key]))
            self.assertEqual(r["R"], sum(r[k] for k in ("scannability", "specificity", "awarenessFit", "voiceFit")))

    def test_awareness_fit(self) -> None:
        fam = ctx.families["P1"]
        inside = fam["awareness"][0]
        self.assertEqual(analyse("5 أدوات", family="P1", awareness=inside)["rules"]["awarenessFit"], 10)
        self.assertEqual(analyse("5 أدوات", family="P1")["rules"]["awarenessFit"], 5)
        far = [a for a in ("unaware", "problem", "solution", "product") if a not in fam["awareness"]]
        self.assertTrue(analyse("5 أدوات", family="P1", awareness=far[-1])["rules"]["awarenessFit"] in (0, 5))

    def test_voice_fit_drops_for_machine_phrases(self) -> None:
        clean = analyse("5 أدوات بتوفر وقتك")["rules"]["voiceFit"]
        machine = analyse("أطلق العنان لإبداعك مع 5 أدوات")["rules"]["voiceFit"]
        self.assertLess(machine, clean)

    def test_prior_follows_intent_and_evidence(self) -> None:
        on_intent = hf.score_prior(ctx, "P1", "save")[0]
        off_intent = hf.score_prior(ctx, "P1", "sell")[0]
        self.assertGreater(on_intent, off_intent)
        self.assertEqual(hf.score_prior(ctx, "NOPE", "save")[0], 0)
        self.assertLessEqual(on_intent, 20)

    def test_a_small_sample_is_ignored(self) -> None:
        saved = ctx.families["P1"]["priors"]
        try:
            ctx.families["P1"]["priors"] = [{"tag": "D-own", "metric": "x", "value": 9, "baseline": 1, "n": 2}]
            p, basis, own = hf.score_prior(ctx, "P1", "save")
            self.assertEqual(p, ctx.scoring["prior"]["intentPrimary"])
            self.assertFalse(own)
        finally:
            ctx.families["P1"]["priors"] = saved


class PenaltyTests(unittest.TestCase):
    def test_emoji_and_latin_only(self) -> None:
        self.assertEqual(analyse("5 أخطاء 🔥 بتموّت الكاروسيل")["penalties"]["emoji"], -5)
        self.assertEqual(analyse("Canva vs Figma")["penalties"]["latinOnly"], -5)
        self.assertEqual(analyse("Canva vs Figma", "en")["penalties"]["latinOnly"], 0)
        self.assertEqual(analyse("5 أخطاء بتموّت الكاروسيل")["penalties"]["total"], 0)

    def test_similarity_to_a_history_text(self) -> None:
        saved = ctx.history_texts
        try:
            ctx.history_texts = [("old-hook", "5 أخطاء بتموّت الكاروسيل")]
            near = analyse("5 أخطاء بتموّت الكاروسيل")
            far = analyse("ليه محدش بيحفظ بوستك؟")
            self.assertEqual(near["penalties"]["similar"], -15)
            self.assertEqual(near["similarity"]["hookId"], "old-hook")
            self.assertGreaterEqual(near["similarity"]["max"], 0.8)
            self.assertEqual(far["penalties"]["similar"], 0)
        finally:
            ctx.history_texts = saved

    def test_family_repeat_uses_the_last_two_posts_only(self) -> None:
        saved = ctx.history_posts
        try:
            ctx.history_posts = [{"family": "P3"}, {"family": "P1"}, {"family": "P2"}]
            self.assertEqual(analyse("5 أدوات", family="P1")["penalties"]["familyRepeat"], -10)
            self.assertEqual(analyse("5 أدوات", family="P3")["penalties"]["familyRepeat"], 0, "P3 is three posts back")
        finally:
            ctx.history_posts = saved


class LibraryTests(unittest.TestCase):
    def test_every_shipped_example_passes_every_gate(self) -> None:
        """The synthetic examples are the engine's own reference: figures declared sourced, nothing else excused."""
        checked = 0
        for lang in ("ar", "en"):
            for entry in ctx.libraries[lang]["entries"]:
                for ex in entry["examples"]:
                    numbers = [hf.norm_number(t["text"]) for t in hf.cs_text.tokenize(ex["text"]) if t["kind"] == "number"]
                    r = analyse(ex["text"], ex["dialect"], family=entry["family"], hookId=entry["id"], sourced=numbers)
                    self.assertEqual(r["failed"], [], (entry["id"], ex["dialect"], ex["text"], r["failed"]))
                    checked += 1
        self.assertGreater(checked, 400)

    def test_lints_follow_the_family(self) -> None:
        r = analyse("5 أدوات ببلاش", family="P1")
        ids = {lint["id"] for lint in r["lints"]}
        self.assertEqual(ids, set(ctx.families["P1"]["lints"]))
        status = {lint["id"]: lint["status"] for lint in r["lints"]}
        self.assertEqual(status["digits-on-cover"], "pass")
        self.assertEqual(status["one-gap"], "judge")
        self.assertEqual(analyse("أدوات ببلاش", family="P1")["lints"][0]["status"], "fail")


class DocsTests(unittest.TestCase):
    FILES = ("references/hook-engine.md", "references/hook-scoring.md", "references/compression.md",
             "data/hooks/lexicon.json", "data/hooks/scoring.json")

    def test_the_hook_documents_exist_and_are_public_safe(self) -> None:
        import re
        banned = re.compile(r"https?://|www\.|analytic|track\(|gtag|sendBeacon|gsap|remotion", re.I)
        indic = re.compile("[٠-٩]")
        for rel in self.FILES:
            text = (SKILL / rel).read_text(encoding="utf-8")
            self.assertIsNone(banned.search(text), rel)
            self.assertIsNone(indic.search(text), rel + ": Western digits only")
            self.assertNotIn("\r", text, rel)
            self.assertLess(len(text.encode("utf-8")), 256 * 1024, rel)
            for name in ("Mohamed", "Abdou", "pyraai"):
                self.assertNotIn(name, text, rel)

    def test_the_documents_name_real_scripts_and_data(self) -> None:
        for rel in self.FILES[:3]:
            text = (SKILL / rel).read_text(encoding="utf-8")
            for script in ("hook_features.py", "compress.py"):
                if script in text:
                    self.assertTrue((SKILL / "scripts" / script).is_file(), script)
            for data in ("families.json", "scoring.json", "lexicon.json", "triggers.json", "library.ar.json", "library.en.json"):
                if data in text:
                    self.assertTrue((DATA / data).is_file(), data)

    def test_every_gate_and_family_named_in_the_docs_exists(self) -> None:
        import re
        text = (SKILL / "references" / "hook-scoring.md").read_text(encoding="utf-8")
        gates = set(re.findall(r"\bHG[1-9]\b", text))
        self.assertEqual(gates, {"HG1", "HG2", "HG3", "HG4", "HG5"})
        for code in re.findall(r"\b([PFS][0-9]{1,2})\b", text):
            self.assertIn(code, ctx.families, code)

    def test_the_lexicon_lists_are_non_empty_and_unique_enough(self) -> None:
        lex = json.loads((DATA / "lexicon.json").read_text(encoding="utf-8"))
        for key in ("stopwords", "timeUnits", "claimUnits", "answerCues"):
            self.assertTrue(lex[key]["ar"] and lex[key]["en"], key)
        for dialect in ("eg", "gulf", "levant", "msa-white", "en"):
            self.assertTrue(lex["compression"]["fillers"][dialect], dialect)


class CliTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = Path(tempfile.mkdtemp(prefix="cs-hooks-"))
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)

    def write(self, name: str, obj) -> Path:
        path = self.tmp / name
        path.write_text(json.dumps(obj, ensure_ascii=False), encoding="utf-8")
        return path

    def test_single_hook_json_and_exit_code(self) -> None:
        ok = run_cli("--text", "5 أخطاء بتموّت الكاروسيل", "--dialect", "eg", "--family", "P3", "--intent", "save")
        self.assertEqual(ok.returncode, 0, ok.stderr)
        data = json.loads(ok.stdout)
        for key in ("gates", "rules", "prior", "penalties", "similarity", "lints", "partial", "cover"):
            self.assertIn(key, data)
        self.assertEqual(set(data["gates"]), {"HG1", "HG2", "HG3", "HG4", "HG5"})
        bad = run_cli("--text", "الحقيقة الصادمة عن الكاروسيل", "--dialect", "eg")
        self.assertEqual(bad.returncode, 2)
        self.assertEqual(json.loads(bad.stdout)["failed"], ["HG5"])

    def test_text_format(self) -> None:
        res = run_cli("--text", "5 أخطاء بتموّت الكاروسيل", "--dialect", "eg", "--format", "text")
        self.assertEqual(res.returncode, 0)
        self.assertIn("HG1:ok", res.stdout)

    def test_cover_option_gates_the_cover_not_the_long_text(self) -> None:
        long_text = "5 أخطاء بتموّت الكاروسيل قبل ما حد يسحب للسلايد التانية"
        res = run_cli("--text", long_text, "--cover", "5 أخطاء بتموّت الكاروسيل", "--dialect", "eg")
        self.assertEqual(res.returncode, 0)
        self.assertEqual(json.loads(res.stdout)["cover"]["words"], 4)

    def test_batch_accepts_a_plain_list_and_the_judge_reorders(self) -> None:
        rows = [{"id": "a", "text": "5 أدوات ببلاش", "family": "P1"}, {"id": "b", "text": "ليه محدش بيحفظ بوستك؟", "family": "P6"},
                {"id": "c", "text": "نص كتير ولا نص قليل؟ جرّبت الاتنين", "family": "P2"}]
        batch = self.write("batch.json", rows)
        first = json.loads(run_cli("--batch", str(batch), "--dialect", "eg").stdout)
        worst = first["ranking"][-1]
        judge = self.write("judge.json", {worst: 40})
        second = json.loads(run_cli("--batch", str(batch), "--dialect", "eg", "--judge", str(judge)).stdout)
        self.assertEqual(second["ranking"][0], worst)
        self.assertEqual(len(second["top3"]), 3)

    def test_batch_without_survivors_exits_two(self) -> None:
        batch = self.write("bad.json", [{"id": "x", "text": "الحقيقة الصادمة عن الكاروسيل", "family": "P5"}])
        res = run_cli("--batch", str(batch), "--dialect", "eg")
        self.assertEqual(res.returncode, 2)
        self.assertEqual(json.loads(res.stdout)["ranking"], [])

    def test_history_file_triggers_the_similarity_penalty(self) -> None:
        hist = self.write("history.json", ["5 أخطاء بتموّت الكاروسيل"])
        res = run_cli("--text", "5 أخطاء بتموّت الكاروسيل", "--dialect", "eg", "--history", str(hist))
        self.assertEqual(json.loads(res.stdout)["penalties"]["similar"], -15)

    def test_sourced_option(self) -> None:
        text = "كاروسيل جاب 90% حفظ أكتر"
        self.assertEqual(run_cli("--text", text, "--dialect", "eg").returncode, 2)
        self.assertEqual(run_cli("--text", text, "--dialect", "eg", "--sourced", "90").returncode, 0)

    def test_usage_and_input_errors(self) -> None:
        self.assertEqual(run_cli("--text", "x", "--dialect", "zz").returncode, 64)
        self.assertEqual(run_cli("--dialect", "eg").returncode, 64)
        self.assertEqual(run_cli("--batch", str(self.tmp / "nope.json"), "--dialect", "eg").returncode, 66)
        self.assertEqual(run_cli("--batch", str(self.write("empty.json", [])), "--dialect", "eg").returncode, 65)
        broken = self.tmp / "broken.json"
        broken.write_text("{nope", encoding="utf-8")
        self.assertEqual(run_cli("--batch", str(broken), "--dialect", "eg").returncode, 65)
        res = run_cli("--text", "x", "--dialect", "zz")
        self.assertIn("E_USAGE", res.stderr)
        self.assertNotIn("Traceback", res.stderr)

    def test_help(self) -> None:
        res = run_cli("--help")
        self.assertEqual(res.returncode, 0)
        self.assertIn("--batch", res.stdout)

    def test_output_is_deterministic(self) -> None:
        args = ("--batch", str(FIXTURES / "hook-candidates.eg.json"), "--dialect", "eg")
        self.assertEqual(run_cli(*args).stdout, run_cli(*args).stdout)


if __name__ == "__main__":
    unittest.main()
