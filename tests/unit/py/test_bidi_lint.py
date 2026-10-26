"""Tests for arabic-proofread/scripts/bidi_lint.py: gates N1 (digits) and B1 (bidi), text scope."""

import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SKILLS = Path(os.environ.get("CS_TEST_SKILLS") or ROOT / "plugins" / "carousel-studio" / "skills")
SCRIPT = SKILLS / "arabic-proofread" / "scripts" / "bidi_lint.py"
FALLBACK = SKILLS / "carousel-design" / "scripts"
ENV = {**os.environ, "PYTHONIOENCODING": "utf-8", "PYTHONUTF8": "1",
       "PYTHONPATH": os.pathsep.join(filter(None, [str(FALLBACK), os.environ.get("PYTHONPATH", "")]))}
NBSP = " "

HAVE_CS = any((p / "_cs" / "__init__.py").exists() for p in (SCRIPT.parent, FALLBACK))
NEEDS_CS = unittest.skipUnless(HAVE_CS, "the _cs package is not in place yet (run tools/sync_shared.py)")


def run(*args):
    p = subprocess.run([sys.executable, str(SCRIPT), *args], capture_output=True, text=True, encoding="utf-8", env=ENV)
    return p.returncode, p.stdout, p.stderr


def lint(text, *extra):
    code, out, err = run("--text", text, "--format", "json", *extra)
    assert out.strip(), err
    return code, json.loads(out)


def gates(res):
    return {i["gateRule"] for i in res["issues"]}


@NEEDS_CS
class BidiLintTests(unittest.TestCase):
    def test_mixed_digits(self):
        code, res = lint("٣ أدوات و5 ساعات", "--digits", "western")
        self.assertIn("N1.mixed", gates(res))
        self.assertTrue(all(i["sev"] == "BLOCK" for i in res["issues"] if i["gate"] == "N1"))
        self.assertEqual(code, 2)

    def test_persian_digits(self):
        _, res = lint("رقم ۴۵۶ هنا", "--digits", "western")
        self.assertIn("N1.persian", gates(res))

    def test_percent_must_follow_the_digit_system(self):
        _, res = lint("خصم 50٪", "--digits", "western")
        self.assertIn("N1.percent", gates(res))
        _, res = lint("خصم ٥٠%", "--digits", "arabic-indic")
        self.assertIn("N1.percent", gates(res))
        _, res = lint("خصم ٥٠٪", "--digits", "arabic-indic")
        self.assertNotIn("N1.percent", gates(res))

    def test_digit_system_must_equal_the_locale(self):
        _, res = lint("٣ من ٨", "--digits", "western")
        self.assertIn("N1.system", gates(res))
        _, res = lint("٣ من ٨", "--digits", "arabic-indic")
        self.assertNotIn("N1.system", gates(res))
        _, res = lint("3 من 8", "--digits", "arabic-indic")
        self.assertIn("N1.system", gates(res))

    def test_latin_codes_do_not_count_as_a_digit_system(self):
        _, res = lint("استخدم GPT4 و4K وكلمة @user2026", "--digits", "arabic-indic")
        self.assertFalse([i for i in res["issues"] if i["gate"] == "N1"])

    def test_stranded_lam_and_binding(self):
        code, res = lint("استخدم لـ ChatGPT اليوم", "--digits", "western")
        self.assertIn("B1.stranded-lam", gates(res))
        _, res = lint("بعد 5 ساعات", "--digits", "western")
        issue = next(i for i in res["issues"] if i["gateRule"] == "B1.unbound-pair")
        self.assertEqual((issue["sev"], issue["fix"]), ("FIX", NBSP))

    def test_glued_digit_is_reported_under_o1(self):
        _, res = lint("وجبة 3000سعرة", "--digits", "western")
        self.assertIn("O1.glued-digit", gates(res))

    def test_clean_text_passes(self):
        code, res = lint("استخدم لـChatGPT خلال 5%sساعات، وأيضًا 3%sأدوات" % (NBSP, NBSP), "--digits", "western")
        self.assertEqual((code, res["issues"]), (0, []))
        self.assertEqual(res["summary"]["status"], "pass")

    def test_fix_repairs_every_autofix_finding(self):
        code, res = lint("٣ أدوات و5 ساعات وخصم 50٪", "--digits", "western", "--fix")
        fixed = res["fixed"]
        self.assertNotIn("٣", fixed)
        self.assertNotIn("٪", fixed)
        self.assertIn("3%sأدوات" % NBSP, fixed)
        self.assertEqual([i for i in res["issues"] if i["sev"] == "BLOCK"], [])

    def test_fix_converts_to_arabic_indic_when_that_is_the_opt_in(self):
        _, res = lint("3 من 8", "--digits", "arabic-indic", "--fix")
        self.assertIn("٣", res["fixed"])
        self.assertNotIn("3", res["fixed"])

    def test_spec_mode_uses_the_spec_locale(self):
        spec = {"locale": {"dialect": "eg", "digits": "western"},
                "slides": [{"id": "s01", "type": "cover", "headline": "٦ أدوات ببلاش"},
                           {"id": "s02", "type": "cta", "cta": {"kind": "save", "text": "احفظ البوست"}}]}
        with tempfile.TemporaryDirectory() as d:
            spec_path = Path(d) / "spec.json"
            spec_path.write_text(json.dumps(spec, ensure_ascii=False), encoding="utf-8")
            code, out, _ = run("--spec", str(spec_path), "--format", "json")
        res = json.loads(out)
        hit = [i for i in res["issues"] if i.get("slide") == "s01" and i["el"] == "headline"]
        self.assertTrue(any(i["gate"] == "N1" for i in hit))
        self.assertEqual(code, 2)

    def test_usage_errors(self):
        self.assertEqual(run()[0], 64)
        self.assertEqual(run("--file", "/nonexistent/x.txt")[0], 66)
        self.assertEqual(run("--text", "x", "--digits", "roman")[0], 64)


if __name__ == "__main__":
    unittest.main()
