"""Tests for brand-setup/scripts/fingerprint.py."""

import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SKILLS = Path(os.environ.get("CS_TEST_SKILLS") or ROOT / "plugins" / "carousel-studio" / "skills")
SCRIPT = SKILLS / "brand-setup" / "scripts" / "fingerprint.py"
FALLBACK = SKILLS / "carousel-design" / "scripts"
ENV = {**os.environ, "PYTHONIOENCODING": "utf-8", "PYTHONUTF8": "1",
       "PYTHONPATH": os.pathsep.join(filter(None, [str(FALLBACK), os.environ.get("PYTHONPATH", "")]))}

HAVE_CS = any((p / "_cs" / "__init__.py").exists() for p in (SCRIPT.parent, FALLBACK))
NEEDS_CS = unittest.skipUnless(HAVE_CS, "the _cs package is not in place yet (run tools/sync_shared.py)")

CAPTIONS = [
    "لو بتجدول من غير خطة… هتتعب مرتين 😅\nأنا جربت 6 أدوات ببلاش، وفرقت معايا جدًا.\nاحفظ البوست ده لحد ما تحتاجه. #ذكاء_اصطناعي @someone",
    "مشكلتك مش في الخوارزمية… مشكلتك في أول سطر؟\nأنا بقالي 9 سنين في المجال، وده اللي اتعلمته.\nجرّب Claude مع ChatGPT وقولي رأيك!",
    "لو بتبدأ من صفحة فاضية… هتتأخر كل مرة.\nاحفظ البوست ده لحد ما تحتاجه 🔖\nأنا بستخدم Canva كل يوم.",
    "أنا عملت تجربة النهارده على 3 أدوات.\nالنتيجة مش زي ما كنت متوقع… ولا زي ما بيقولوا.\nاحفظ البوست ده لحد ما تحتاجه",
]


def run(*args, stdin=None):
    p = subprocess.run([sys.executable, str(SCRIPT), *args], capture_output=True, text=True, encoding="utf-8",
                       env=ENV, input=stdin)
    return p.returncode, p.stdout, p.stderr


def fingerprint(captions, *extra, sep="---"):
    code, out, err = run("--stdin", "--format", "json", "--computed-at", "2026-10-22T10:00:00Z", *extra,
                         stdin=("\n%s\n" % sep).join(captions))
    assert code == 0, err
    return json.loads(out)


@NEEDS_CS
class FingerprintTests(unittest.TestCase):
    def test_object_shape_and_counts(self):
        fp = fingerprint(CAPTIONS)
        self.assertEqual(fp["sampleCount"], 4)
        self.assertEqual(fp["computedAt"], "2026-10-22T10:00:00Z")
        for key in ("sentLen", "emojiPer100w", "emojiSet", "latinMixPct", "ellipsisRate", "questionBangRate",
                    "openers", "dialectMarkers", "captionLenBand", "signatures"):
            self.assertIn(key, fp)
        sl = fp["sentLen"]
        self.assertLessEqual(sl["p25"], sl["p50"])
        self.assertLessEqual(sl["p50"], sl["p75"])
        self.assertLessEqual(sl["p75"], sl["p90"])
        lo, hi = fp["captionLenBand"]
        self.assertLessEqual(lo, hi)

    def test_voice_markers(self):
        fp = fingerprint(CAPTIONS, "--dialect", "eg")
        self.assertEqual(set(fp["emojiSet"]), {"😅", "🔖"})
        self.assertGreater(fp["emojiPer100w"], 0)
        self.assertEqual(fp["person"], "ana")
        self.assertGreater(fp["ellipsisRate"], 0)
        self.assertGreater(fp["questionBangRate"], 0)
        self.assertIn("مش", fp["dialectMarkers"])
        self.assertGreater(fp["latinMixPct"], 0)

    def test_signature_is_the_recurring_phrase(self):
        fp = fingerprint(CAPTIONS)
        self.assertIn("احفظ البوست ده لحد ما تحتاجه", fp["signatures"])

    def test_hashtags_handles_and_urls_are_not_voice(self):
        base = fingerprint(CAPTIONS)
        noisy = fingerprint([c + " #tag1 #tag2 @someone https://example.com/x" for c in CAPTIONS])
        self.assertEqual(base["sentLen"], noisy["sentLen"])
        self.assertEqual(base["latinMixPct"], noisy["latinMixPct"])

    def test_openers_stop_at_the_ellipsis(self):
        fp = fingerprint(CAPTIONS)
        self.assertIn("مشكلتك مش في الخوارزمية", fp["openers"])

    def test_custom_separator_and_file_input(self):
        with tempfile.TemporaryDirectory() as d:
            f = Path(d) / "captions.txt"
            f.write_text("\n===\n".join(CAPTIONS), encoding="utf-8")
            code, out, err = run("--file", str(f), "--separator", "===", "--format", "json", "--computed-at", "2026-10-22T10:00:00Z")
            self.assertEqual(code, 0, err)
            self.assertEqual(json.loads(out)["sampleCount"], 4)

    def test_needs_three_captions(self):
        code, _, err = run("--stdin", "--format", "json", stdin="\n---\n".join(CAPTIONS[:2]))
        self.assertEqual(code, 64, err)

    def test_more_than_ten_captions_are_truncated_with_a_warning(self):
        code, out, err = run("--stdin", "--format", "json", "--with-report", "--computed-at", "2026-10-22T10:00:00Z",
                             stdin="\n---\n".join(CAPTIONS * 4))
        self.assertEqual(code, 0, err)
        res = json.loads(out)
        self.assertEqual(res["fingerprint"]["sampleCount"], 10)
        self.assertTrue(any("first 10" in w for w in res["report"]["warnings"]))

    def test_detects_a_dialect_mismatch(self):
        code, out, _ = run("--stdin", "--format", "json", "--with-report", "--dialect", "gulf",
                           "--computed-at", "2026-10-22T10:00:00Z", stdin="\n---\n".join(CAPTIONS))
        res = json.loads(out)
        self.assertEqual(res["report"]["detectedDialect"], "eg")
        self.assertTrue(any("gulf" in w for w in res["report"]["warnings"]))

    def test_missing_file(self):
        self.assertEqual(run("--file", "/nonexistent/captions.txt")[0], 66)


if __name__ == "__main__":
    unittest.main()
