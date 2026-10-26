"""Tests for carousel-create/scripts/compress.py: spoken openers become cover candidates inside the limits, the speaker's numbers
and Latin names survive, and the script is deterministic and honest when nothing fits.

All openers here are synthetic. Run: python -m unittest discover -s tests/unit/py -p "test_compress.py"
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
SKILL = REPO / "plugins" / "carousel-studio" / "skills" / "carousel-create"
SCRIPT = SKILL / "scripts" / "compress.py"
ENV = {**os.environ, "PYTHONIOENCODING": "utf-8", "PYTHONUTF8": "1"}
ELLIPSIS = "…"
HERO_MAX, TOTAL_MAX = 6, 12


def run(*args: str, stdin: str | None = None) -> subprocess.CompletedProcess:
    return subprocess.run([sys.executable, str(SCRIPT), *args], input=stdin, capture_output=True, text=True, encoding="utf-8", env=ENV, timeout=60)


def compress(text: str, dialect: str = "eg", *extra: str) -> dict:
    res = run("--text", text, "--dialect", dialect, *extra)
    assert res.returncode in (0, 1), res.stdout + res.stderr
    return json.loads(res.stdout)


def covers(result: dict) -> list:
    return [c["cover"] for c in result["candidates"]]


def words(s: str) -> int:
    return len([w for w in re.split(r"\s+", s.replace(ELLIPSIS, " ")) if re.search(r"\w", w)])


class CompressTests(unittest.TestCase):
    def test_an_if_clause_is_dropped_when_the_result_carries_the_point(self) -> None:
        res = compress("لو بتنزل بوستات كل يوم ومفيش حد بيحفظ حاجة منها، يبقى المشكلة مش في العدد، المشكلة في أول سلايد")
        top = res["candidates"][0]
        self.assertEqual(top["cover"], "المشكلة مش في العدد" + ELLIPSIS + " المشكلة في أول سلايد")
        self.assertEqual((top["hero"], top["sub"], top["breakAt"]), ("المشكلة مش في العدد", "المشكلة في أول سلايد", 4))
        self.assertIn("drop-condition", top["rules"])
        self.assertTrue(top["ok"])

    def test_fillers_are_stripped_and_spelled_numbers_become_digits(self) -> None:
        res = compress("طب بص، أنا جربت تلات أدوات ذكاء اصطناعي ببلاش، وطلعت واحدة بس تستاهل")
        top = res["candidates"][0]
        self.assertTrue(top["cover"].startswith("3 أدوات"), top["cover"])
        self.assertNotIn("طب", top["cover"])
        self.assertNotIn("بص", top["cover"])
        self.assertIn("spelled-number", top["rules"])
        self.assertIn("numeral-first", top["rules"])
        self.assertTrue(any("digits" in n["en"] for n in res["notes"]))

    def test_a_bare_one_stays_a_word(self) -> None:
        top = compress("أنا مع الكابشن الطويل بشرط واحد")["candidates"][0]
        self.assertNotRegex(top["cover"], r"\b1\b")

    def test_a_qualifier_is_dropped_to_fit_the_hero(self) -> None:
        top = compress("دي مش شغلتي كمصور أعراس في أسوان… ده الفلتر.")["candidates"][0]
        self.assertEqual(top["cover"], "دي مش شغلتي" + ELLIPSIS + " ده الفلتر")
        self.assertIn("drop-qualifier", top["rules"])

    def test_a_cover_already_within_the_limits_comes_back_whole(self) -> None:
        text = "لو مصممك سلّم بدري بالـAI… هتشكره ولا تشك فيه؟"
        top = compress(text)["candidates"][0]
        self.assertEqual(top["cover"], text)
        self.assertEqual(top["heroWords"], 5)

    def test_latin_names_survive_exactly(self) -> None:
        res = compress("لو مصممك سلّم بدري بالـAI… هتشكره ولا تشك فيه؟")
        self.assertTrue(all("AI" in c for c in covers(res)[:2]))
        res = compress("طيب شوف، أنا جربت Canva وFigma وطلع الفرق كبير في الشغل", "gulf")
        self.assertIn("Canva", res["candidates"][0]["cover"])

    def test_every_ok_candidate_is_inside_the_limits(self) -> None:
        openers = [
            "لو بتنزل بوستات كل يوم ومفيش حد بيحفظ حاجة منها، يبقى المشكلة مش في العدد، المشكلة في أول سلايد",
            "طب بص، أنا جربت تلات أدوات ذكاء اصطناعي ببلاش، وطلعت واحدة بس تستاهل",
            "تعرف إن أغلب الناس بتقفل الكاروسيل من أول سلايدين، والسبب إن الغلاف بيشرح بدل ما يشد",
            "لو بتكتب كابشن طويل ومحدش بيقراه، يبقى لازم تغيّر أول سطر مش آخر سطر",
            "أنا بقالي سنتين بنزل كاروسيل وكل مرة بغلط في نفس الغلطة، وأخيرا فهمت الحكاية",
        ]
        for text in openers:
            for cand in compress(text)["candidates"]:
                if cand["ok"]:
                    self.assertLessEqual(cand["heroWords"], HERO_MAX, cand["cover"])
                    self.assertLessEqual(cand["words"], TOTAL_MAX, cand["cover"])
                    self.assertEqual(cand["words"], words(cand["cover"]), cand["cover"])

    def test_at_most_three_candidates_best_first(self) -> None:
        res = compress("لو بتنزل بوستات كل يوم ومفيش حد بيحفظ حاجة منها، يبقى المشكلة مش في العدد، المشكلة في أول سلايد")
        self.assertLessEqual(len(res["candidates"]), 3)
        scores = [(not c["ok"], -c["score"]) for c in res["candidates"]]
        self.assertEqual(scores, sorted(scores))
        self.assertEqual(len(compress("لو بتنزل بوستات كل يوم ومفيش حد بيحفظ حاجة منها، يبقى المشكلة مش في العدد، المشكلة في أول سلايد", "eg", "--top", "1")["candidates"]), 1)

    def test_the_hero_and_sub_rebuild_the_cover(self) -> None:
        for cand in compress("طب بص، أنا جربت تلات أدوات ذكاء اصطناعي ببلاش، وطلعت واحدة بس تستاهل")["candidates"]:
            if cand["sub"]:
                self.assertEqual(cand["cover"].replace(ELLIPSIS, "").split(), (cand["hero"] + " " + cand["sub"]).split())
                self.assertEqual(cand["breakAt"], cand["heroWords"])
            else:
                self.assertIsNone(cand["breakAt"])

    def test_nothing_fits_is_reported_honestly(self) -> None:
        text = "الخطأ القاتل اللي بيعمله كل صانع محتوى مبتدئ على إنستجرام وبيخلي بوستاته مش بتتحفظ"
        res = run("--text", text, "--dialect", "eg")
        self.assertEqual(res.returncode, 1)
        data = json.loads(res.stdout)
        self.assertFalse(any(c["ok"] for c in data["candidates"]))
        self.assertTrue(data["notes"])
        self.assertIn("trim-tail", [r for c in data["candidates"] for r in c["rules"]])

    def test_custom_limits(self) -> None:
        text = "المشكلة مش في العدد… المشكلة في أول سلايد"
        tight = compress(text, "eg", "--hero-max", "3", "--total-max", "6")
        self.assertTrue(all(c["heroWords"] <= 3 for c in tight["candidates"] if c["ok"]))
        self.assertEqual(tight["limits"], {"heroMax": 3, "totalMax": 6})

    def test_the_other_dialects(self) -> None:
        gulf = compress("طيب شوف، لو بتصرف فلوس على الإعلانات من غير ما تعرف مين بيشتري، يعني انت بترمي فلوسك", "gulf")
        self.assertTrue(any(c["ok"] for c in gulf["candidates"]))
        msa = compress("حسنًا، إذا كنت تنشر كل يوم ولا يحفظ أحد منشوراتك، فالمشكلة ليست في العدد بل في أول شريحة", "msa-white")
        self.assertTrue(any(c["ok"] for c in msa["candidates"]))
        levant = compress("طيب شوف، بتعرف إنو أغلب الناس بتسكّر الكاروسيل من أول سلايد", "levant")
        self.assertNotIn("طيب", levant["candidates"][0]["cover"])

    def test_english(self) -> None:
        res = compress("If you post every day and nobody saves anything, the problem isn't the count, it's your first slide", "en")
        self.assertTrue(any(c["ok"] for c in res["candidates"]))
        self.assertNotIn("؟", json.dumps(res, ensure_ascii=False))

    def test_arabic_punctuation_replaces_latin_punctuation(self) -> None:
        top = compress("ليه محدش بيحفظ بوستك, وانت بتنزل كل يوم?")["candidates"][0]
        self.assertNotIn(",", top["cover"])
        self.assertNotIn("?", top["cover"])

    def test_it_is_deterministic(self) -> None:
        text = "لو بتنزل بوستات كل يوم ومفيش حد بيحفظ حاجة منها، يبقى المشكلة مش في العدد، المشكلة في أول سلايد"
        self.assertEqual(run("--text", text, "--dialect", "eg").stdout, run("--text", text, "--dialect", "eg").stdout)


class CliTests(unittest.TestCase):
    def test_text_format_and_exit_code(self) -> None:
        res = run("--text", "المشكلة مش في العدد… المشكلة في أول سلايد", "--dialect", "eg", "--format", "text")
        self.assertEqual(res.returncode, 0)
        self.assertIn("1.", res.stdout)
        self.assertIn("rules:", res.stdout)

    def test_file_and_stdin(self) -> None:
        text = "لو بتنزل بوستات كل يوم ومفيش حد بيحفظ حاجة منها، يبقى المشكلة مش في العدد، المشكلة في أول سلايد"
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "opener.txt"
            path.write_text(text, encoding="utf-8")
            from_file = run("--file", str(path), "--dialect", "eg")
        from_stdin = run("--file", "-", "--dialect", "eg", stdin=text)
        self.assertEqual(from_file.returncode, 0)
        self.assertEqual(json.loads(from_file.stdout)["candidates"], json.loads(from_stdin.stdout)["candidates"])

    def test_usage_errors(self) -> None:
        self.assertEqual(run("--dialect", "eg").returncode, 64)
        self.assertEqual(run("--text", "x", "--dialect", "zz").returncode, 64)
        self.assertEqual(run("--text", "   ", "--dialect", "eg").returncode, 64)
        self.assertEqual(run("--text", "x y z", "--dialect", "eg", "--hero-max", "5", "--total-max", "3").returncode, 64)
        self.assertEqual(run("--file", str(Path(tempfile.gettempdir()) / "no-such-opener.txt"), "--dialect", "eg").returncode, 66)
        res = run("--text", "x", "--dialect", "zz")
        self.assertIn("E_USAGE", res.stderr)
        self.assertNotIn("Traceback", res.stderr)

    def test_help(self) -> None:
        res = run("--help")
        self.assertEqual(res.returncode, 0)
        self.assertIn("--hero-max", res.stdout)


class ReferenceTests(unittest.TestCase):
    def test_the_documented_examples_are_what_the_script_returns(self) -> None:
        """compression.md shows five synthetic pairs; the first four are real outputs."""
        doc = (SKILL / "references" / "compression.md").read_text(encoding="utf-8")
        rows = re.findall(r"(?m)^\| (.+?) \| (.+?) \|$", doc)
        pairs = {a: b for a, b in rows if a not in ("Spoken", "---")}
        checked = 0
        for spoken, cover in pairs.items():
            if "(" in cover or "write" in cover:
                continue
            top = compress(spoken)["candidates"][0]
            self.assertEqual(top["cover"], cover, spoken)
            checked += 1
        self.assertGreaterEqual(checked, 3)


if __name__ == "__main__":
    unittest.main()
