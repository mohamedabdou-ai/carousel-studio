"""Tests for carousel-create/scripts/script_to_spec.py: the creator's finished script becomes a spec without the writers' room.

Run: python -m unittest discover -s tests/unit/py -p "test_script_to_spec.py"   (standard library only)
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
SCRIPT = REPO / "plugins" / "carousel-studio" / "skills" / "carousel-create" / "scripts" / "script_to_spec.py"
BRAND = REPO / "docs" / "examples" / "brand.example.json"
ENV = {**os.environ, "PYTHONIOENCODING": "utf-8", "PYTHONUTF8": "1"}

# The owner's real test post (2026-10-24): circled numbers in bold, sections split by ---, emoji, a request line first.
OWNER = """اعملي كاروسيل عن
**① الغلاف**

وكلاء AI اتواصلوا…
من غير إنترنت! 👀

إيه اللي حصل في اختبارات OpenAI؟

---

**② لا شبكة… ولا ملف مشترك**

بحسب OpenAI، وكلاء في بيئات افتراضية منفصلة تبادلوا بيانات اختبارية.

من غير اتصال شبكة…
ومن غير ملف مشترك يكتبوا فيه.

بس كانوا على نفس الجهاز الفعلي.

---

**③ السر كان في المعالج 🧠**

استخدموا فروق توقيت القراءة من ذاكرة المعالج المؤقتة «Cache».

---

**④ استنى… التجربة كانت موجّهة**

الفريق طلب منهم يختبروا إمكانية التواصل.

---

**⑤ OpenAI عملت إيه؟**

واستأنفت تدريب التعزيز والاستخدام الداخلي يوم ١ أكتوبر.

---

**⑥ قافل النت؟ راجع باقي الأبواب**

لو بتشغّل Agents لشغلك، راجع كمان الموارد اللي بيشاركوها.

إنت بتراجع صلاحيات الـAgent قبل تشغيله؟

احفظ البوست وشاركه، وتابعني للمزيد.
"""

NUMBERED = """1. 5 أدوات ببلاش… بتغنيك عن المصمم
2. Canva
تصميمات جاهزة لكل حاجة وبتتعدل في دقايق.
3. Remove.bg
بتشيل الخلفية في ثانية من غير فوتوشوب.
4. Coolors
بتطلعلك ألوان متناسقة لبراندك في ضغطة.
5. احفظ البوست عشان ترجعله
"""

BULLETS = """Slide 1: Three checks before you run an agent
---
Slide 2: The checklist
- Shared files
- Open ports
- Who can read the logs
---
Slide 3: Which one do you skip?
Save this for your next setup.
"""


def run(*args: str) -> subprocess.CompletedProcess:
    return subprocess.run([sys.executable, str(SCRIPT), *args], capture_output=True, text=True, encoding="utf-8", env=ENV, timeout=120)


class ScriptToSpecTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name)
        brand = json.loads(BRAND.read_text(encoding="utf-8"))  # the example's stock handle and name are refused by gate B2
        brand.update({"name": "نورا للتصميم", "handle": "@noura.designs"})
        self.brand = self.dir / "brand.json"
        self.brand.write_text(json.dumps(brand, ensure_ascii=False), encoding="utf-8")

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def step1(self, text: str, *extra: str) -> tuple[subprocess.CompletedProcess, dict]:
        script = self.dir / "script.md"
        script.write_text(text, encoding="utf-8", newline="\n")
        post = self.dir / "post-20261024-0007"
        res = run("--script", str(script), "--brand", str(self.brand), "--out", str(post), *extra)
        spec = json.loads((post / "spec.json").read_text(encoding="utf-8")) if (post / "spec.json").exists() else {}
        return res, spec

    def test_the_owners_script_keeps_his_words_and_gets_the_structure(self) -> None:
        res, spec = self.step1(OWNER, "--style", "notebook", "--architecture", "news")
        self.assertEqual(res.returncode, 1, res.stderr)  # bridges and the caption pack are still to fill
        types = [s["type"] for s in spec["slides"]]
        self.assertEqual(types, ["cover", "rehook", "story-beat", "item", "item", "item", "item", "cta"])
        cover = spec["slides"][0]
        self.assertEqual(cover["headline"], "وكلاء AI اتواصلوا…\nمن غير إنترنت!")      # the label «الغلاف» and the emoji are gone
        self.assertEqual(cover["sub"], "إيه اللي حصل في اختبارات OpenAI؟")
        # the first line (9 words) does not fit beside the title, so the rehook keeps the title and the story-beat keeps his order
        self.assertEqual(spec["slides"][1], {"id": "s02", "n": 2, "type": "rehook", "headline": "لا شبكة… ولا ملف مشترك"})
        self.assertTrue(spec["slides"][2]["body"].startswith("بحسب OpenAI"))
        self.assertTrue(spec["slides"][2]["body"].endswith("بس كانوا على نفس الجهاز الفعلي."))
        self.assertNotIn("🧠", json.dumps(spec, ensure_ascii=False))
        self.assertIn("يوم 1 أكتوبر", spec["slides"][5]["body"])                  # western digits; the date stays bound (B1)
        last = spec["slides"][-1]
        self.assertEqual(last["title"], "إنت بتراجع صلاحيات الـAgent قبل تشغيله؟")
        self.assertEqual(last["cta"]["kind"], "save")
        self.assertIn("save + send + follow", res.stdout)                               # one CTA works best: said, not rewritten
        self.assertEqual(spec["style"]["presetId"], "notebook@1.0")
        self.assertIn(spec["cover"]["motion"]["recipe"], ("reorder", "highlight-sweep"))  # notebook has no «story» recipe
        self.assertEqual([s.get("variant") for s in spec["slides"][3:7]], ["base", "ghost-number", "base", "ghost-number"])
        self.assertEqual(spec["id"], "post-20261024-0007")
        self.assertEqual((spec["mode"], spec["checkpoint"]), ("fast", "design"))
        self.assertIn("bridges for s02, s03, s04, s05, s06, s07", res.stdout)

    def test_no_split2_keeps_slide_2_as_written(self) -> None:
        _, spec = self.step1(OWNER, "--no-split2")
        self.assertEqual(spec["slides"][1]["type"], "item")
        self.assertEqual(len(spec["slides"]), 7)

    def test_numbered_lines_without_separators(self) -> None:
        res, spec = self.step1(NUMBERED)
        self.assertEqual(res.returncode, 1, res.stderr)
        self.assertEqual([s["type"] for s in spec["slides"]], ["cover", "item", "item", "item", "cta"])
        self.assertEqual(spec["slides"][0]["headline"], "5 أدوات ببلاش… بتغنيك عن المصمم")
        self.assertEqual(spec["slides"][1]["title"], "Canva")
        self.assertEqual(spec["slides"][-1]["cta"]["kind"], "save")
        self.assertEqual(spec["architecture"], "listicle")
        self.assertEqual(spec["cover"]["motion"]["recipe"], "counter")                   # a number on the cover counts up

    def test_bullets_become_a_checklist(self) -> None:
        _, spec = self.step1(BULLETS)
        s2 = spec["slides"][1]
        self.assertEqual(s2["type"], "checklist")
        self.assertEqual(s2["bullets"], ["Shared files", "Open ports", "Who can read the logs"])
        self.assertEqual(spec["slides"][-1]["type"], "cta")

    def test_one_section_is_an_input_error(self) -> None:
        res, _ = self.step1("بس سطر واحد من غير ترقيم")
        self.assertEqual(res.returncode, 65)
        self.assertIn("E_SCRIPT", res.stderr)

    def test_step_2_merges_the_fill_and_runs_the_check(self) -> None:
        res, spec = self.step1(OWNER, "--style", "notebook", "--architecture", "news")
        n = len(spec["slides"])
        fill = {
            "bridges": ["ودي حصلت إزاي؟", "والرسالة عدّت منين؟", "بس في تفصيلة", "وبعد النتيجة دي؟", "ودلوقتي دورك", "سؤال واحد بس…"],
            "emphasis": {"s02": "شبكة", "s09": "nothing"},
            "edits": {"s08": {"cta": {"kind": "question", "text": "اكتب إجابتك في سطر واحد"}}},
            "caption": {"firstLine": "قبل ما تفتكر إن الوكلاء بقوا بيتكلموا لوحدهم… شوف التجربة اتعملت إزاي.",
                        "keywordLine": "اختبار من OpenAI على وكلاء الذكاء الاصطناعي من غير شبكة.",
                        "body": "وكلاء في بيئات منفصلة تبادلوا بيانات اختبارية عن طريق توقيت ذاكرة المعالج، والتجربة كانت موجّهة من الفريق.",
                        "cta": "إنت بتراجع صلاحيات الـAgent قبل تشغيله؟", "hashtags": ["#ذكاء_اصطناعي", "#AIAgents"]},
            "perSlide": ["سطر %d" % (i + 1) for i in range(n)],
            "alt": ["وصف الشريحة %d" % (i + 1) for i in range(n)],
        }
        f = self.dir / "fill.json"
        f.write_text(json.dumps(fill, ensure_ascii=False), encoding="utf-8")
        spec_path = self.dir / "post-20261024-0007" / "spec.json"
        res = run("--spec", str(spec_path), "--fill", str(f), "--brand", str(self.brand))
        self.assertIn(res.returncode, (0, 1), res.stdout + res.stderr)
        self.assertIn("check: 0 BLOCK", res.stdout)
        self.assertNotIn("MISSING", res.stdout)
        spec = json.loads(spec_path.read_text(encoding="utf-8"))
        self.assertEqual(spec["rev"], 2)
        self.assertEqual(spec["slides"][1]["headline"], "لا ==شبكة==… ولا ملف مشترك")
        self.assertEqual(spec["slides"][1]["bridge"], "ودي حصلت إزاي؟")
        self.assertEqual(spec["slides"][-1]["cta"]["kind"], "question")
        self.assertNotIn("bridge", spec["slides"][-1])
        self.assertEqual(len(spec["captionPack"]["alt"]), n)

    def test_a_long_slide_2_is_split_in_the_creators_order_and_a_bold_title_over_two_lines_stays_whole(self) -> None:
        script = """**① الغلاف**

**جوجل بتجهّز للـAI كمبيوتر**

---

**② الموديل يفكّر… والتنفيذ فين؟**

جوجل أعلنت Agent Compute Engine.

خدمة بتوفّر لكل جلسة Agent بيئة كمبيوتر معزولة لتشغيل الكود والأدوات.

يعني بيئة ينفّذ فيها الشغل.

---

**③ مستنّي ردّك؟
بيئة التنفيذ تاخد استراحة.**

البيئة تتوقّف مؤقتًا.

---

**④ إمتى؟**

خلال الأشهر القادمة.

احفظ البوست.
"""
        _, spec = self.step1(script, "--architecture", "news")
        s2, s3, s4 = spec["slides"][1:4]
        self.assertEqual((s2["headline"], s2["sub"]), ("الموديل يفكّر… والتنفيذ فين؟", "جوجل أعلنت Agent Compute Engine."))
        self.assertTrue(s3["body"].endswith("يعني بيئة ينفّذ فيها الشغل."))  # the conclusion stays last
        self.assertEqual(s4["title"], "مستنّي ردّك؟\nبيئة التنفيذ تاخد استراحة.")
        self.assertEqual(s4["body"], "البيئة تتوقّف مؤقتًا.")
        _, kept = self.step1(script, "--architecture", "news", "--no-split2")  # «كما هو»: his slide count
        self.assertEqual([s["type"] for s in kept["slides"]][:3], ["cover", "item", "item"])

    def test_keep_records_the_creators_override_on_a_long_cover(self) -> None:
        long_cover = OWNER.replace("وكلاء AI اتواصلوا…\nمن غير إنترنت! 👀", "كلود كتب الكود… طب فين الدليل إنه صح فعلاً؟")
        _, spec = self.step1(long_cover, "--style", "notebook", "--architecture", "news")
        n = len(spec["slides"])
        fill = {
            "bridges": ["ودي حصلت إزاي؟", "والرسالة عدّت منين؟", "بس في تفصيلة", "وبعد النتيجة دي؟", "ودلوقتي دورك", "سؤال واحد بس…"],
            "caption": {"firstLine": "قبل ما تصدّق إن الكود صح… شوف الدليل اتعمل إزاي.",
                        "keywordLine": "التحقق الرسمي من الكود بالذكاء الاصطناعي.",
                        "body": "البرهان الرياضي بيثبت إن خاصية محددة بتتحقق لكل المدخلات اللي بتغطيها شروطه، مش لحالات معيّنة بس.",
                        "cta": "إنت بتراجع صلاحيات الـAgent قبل تشغيله؟", "hashtags": ["#ذكاء_اصطناعي", "#برمجة"]},
            "perSlide": ["سطر %d" % (i + 1) for i in range(n)],
            "alt": ["وصف الشريحة %d" % (i + 1) for i in range(n)],
        }
        f = self.dir / "fill.json"
        spec_path = self.dir / "post-20261024-0007" / "spec.json"
        f.write_text(json.dumps(fill, ensure_ascii=False), encoding="utf-8")
        res = run("--spec", str(spec_path), "--fill", str(f), "--brand", str(self.brand))
        self.assertIn("BLOCK s01 C1.hero-words", res.stdout)
        self.assertIn('"keep": ["C1.hero-words"]', res.stdout)                    # the output says how; nothing to look up
        fill["keep"] = ["C1.hero-words", "C3.words@s02", "C9.nothing"]
        f.write_text(json.dumps(fill, ensure_ascii=False), encoding="utf-8")
        res = run("--spec", str(spec_path), "--fill", str(f), "--brand", str(self.brand))
        self.assertNotIn("BLOCK s01 C1", res.stdout, res.stdout)
        self.assertIn("kept as the creator wrote it: C1.hero-words s01", res.stdout)
        self.assertIn("keep C9.nothing: the check does not raise it", res.stdout)
        spec = json.loads(spec_path.read_text(encoding="utf-8"))
        self.assertEqual(spec["slides"][0]["headline"], "كلود كتب الكود… طب فين الدليل إنه صح فعلاً؟")  # the words stay
        kept = [r for r in spec["qa"]["results"] if r.get("overridden")]
        self.assertTrue(kept and all(r["rule"].startswith("C1.") and r["slide"] == "s01" for r in kept))
        check = subprocess.run([sys.executable, str(SCRIPT.parent / "validate.py"), "spec", str(spec_path), "--brand", str(self.brand)],
                               capture_output=True, text=True, encoding="utf-8", env=ENV, timeout=120)
        self.assertEqual(check.returncode, 0, check.stdout + check.stderr)          # spec.qa is schema-valid


if __name__ == "__main__":
    unittest.main()
