"""Tests for arabic-proofread/scripts/ortho_lint.py (run as a CLI). The rule ids come from
data/rules/ortho.json; the dialect lists from data/dialects/*.json."""

import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SKILLS = Path(os.environ.get("CS_TEST_SKILLS") or ROOT / "plugins" / "carousel-studio" / "skills")
SCRIPT = SKILLS / "arabic-proofread" / "scripts" / "ortho_lint.py"
FALLBACK = SKILLS / "carousel-design" / "scripts"
ENV = {**os.environ, "PYTHONIOENCODING": "utf-8", "PYTHONUTF8": "1",
       "PYTHONPATH": os.pathsep.join(filter(None, [str(FALLBACK), os.environ.get("PYTHONPATH", "")]))}

HAVE_CS = any((p / "_cs" / "__init__.py").exists() for p in (SCRIPT.parent, FALLBACK))
NEEDS_CS = unittest.skipUnless(HAVE_CS, "the _cs package is not in place yet (run tools/sync_shared.py)")

# (dialect, text, rule ids that must be reported, severity of the first of them)
FINDINGS = [
    ("msa-white", "إنشاء الله نبدأ غدًا", ["ORTHO-SPLIT-004"], "BLOCK"),
    ("eg", "انشاء الله هنبدأ بكرة", ["ORTHO-SPLIT-005"], "BLOCK"),
    ("msa-white", "ان شاء الله نلتقي", ["ORTHO-SPLIT-006"], "FIX"),
    ("eg", "هنعمل اعلان جديد", ["ORTHO-HAMZA-001"], "FIX"),
    ("eg", "اختار الاسهل", ["ORTHO-HAMZA-002"], "FIX"),
    ("msa-white", "الوان الشركة", ["ORTHO-HAMZA-009"], "FIX"),
    ("msa-white", "إستخدام الأداة", ["ORTHO-WASL-001"], "FIX"),
    ("eg", "مسئول عن الشركه", ["ORTHO-HAMZA-008", "ORTHO-TAA-001"], "FIX"),
    ("eg", "اللى فى الخطوه", ["ORTHO-YAA-001", "ORTHO-TAA-001"], "FIX"),
    ("msa-white", "هاذا لاكن ذالك", ["ORTHO-SPLIT-001"], "FIX"),
    ("eg", "كتاب جميل ک", ["ORTHO-ENC-001"], "BLOCK"),
    ("eg", "جربت 3 أدوات و٥ حاجات", ["ORTHO-DIG-002"], "BLOCK"),
    ("eg", "رقم ۱۲۳ هنا", ["ORTHO-DIG-001"], "BLOCK"),
    ("eg", "خصم ٥٠% النهارده", ["ORTHO-DIG-003"], "BLOCK"),
    ("eg", "ده سؤال ؟", ["ORTHO-PUNCT-001"], "FIX"),
    ("eg", "اطلب الآن, ويصلك غدًا", ["ORTHO-PUNCT-003"], "FIX"),
    ("eg", "استنى...", ["ORTHO-PUNCT-005"], "FIX"),
    ("eg", "إيه ده؟؟", ["ORTHO-PUNCT-006"], "FIX"),
    ("eg", "خصــم كبير", ["ORTHO-TATWEEL-001"], "FIX"),
    ("eg", "فيه​حاجة", ["ORTHO-ENC-004"], "FIX"),
    ("eg", "فيه‏حاجة", ["ORTHO-ENC-005"], "FIX"),
    ("eg", "فيه‮حاجة", ["ORTHO-ENC-006"], "BLOCK"),
    ("eg", "ﻣﺮﺣﺒﺎ", ["ORTHO-ENC-003"], "BLOCK"),
    ("eg", "عَلَّمَتْنِي الحَيَاةُ كُلَّ شَيْءٍ", ["ORTHO-TASH-001"], "FIX"),
    ("eg", "جرّبت يوتيوب امبارح", ["ORTHO-TRANS-001"], "NOTE"),
]

CLEAN = [
    ("msa-white", "الأدوات المجانية في الإعلان إن شاء الله تفيدك أنت وأنا، لماذا لا تجرّب؟"),
    ("msa-white", "الإجابة الصحيحة هي الأفضل لأن النتيجة أوضح."),
    ("eg", "مشكلتك مش في الخوارزمية… مشكلتك في أول سطر؟"),
    ("eg", "احفظ البوست ده لحد ما تحتاجه، وابعته لصاحبك."),
    ("eg", "جرّبت أدوات كتير ببلاش، وفرقت معايا أوي."),
    ("gulf", "أبي أسوي بوست عن أدوات مجانية، وش رأيك؟ ما راح تندم."),
    ("gulf", "الحين تقدر تصمم بوست بنفسك من غير مصمم."),
    ("levant", "شو رأيك؟ بدي جرّب أداة جديدة وبعدين بخبرك."),
    ("levant", "هلق بتقدر تعمل كاروسيل كتير حلو بدقيقة."),
    ("en", "Stop paying for tools you can replace for free."),
]


def run(*args):
    p = subprocess.run([sys.executable, str(SCRIPT), *args], capture_output=True, text=True, encoding="utf-8", env=ENV)
    return p.returncode, p.stdout, p.stderr


def lint(text, dialect, *extra):
    code, out, err = run("--text", text, "--dialect", dialect, "--format", "json", *extra)
    return code, json.loads(out), err


@NEEDS_CS
class OrthoLintTests(unittest.TestCase):
    def test_seeded_defects_are_found_by_their_rule(self):
        for dialect, text, rules, sev in FINDINGS:
            code, res, err = lint(text, dialect)
            found = {i["rule"]: i for i in res["issues"]}
            for rule in rules:
                self.assertIn(rule, found, "%r should trigger %s (got %s)" % (text, rule, sorted(found)))
            self.assertEqual(found[rules[0]]["sev"], sev, text)
            expected_code = 2 if any(i["sev"] == "BLOCK" for i in res["issues"]) else \
                1 if any(i["sev"] == "FIX" for i in res["issues"]) else 0
            self.assertEqual(code, expected_code, text)

    def test_clean_copy_has_no_block_or_fix(self):
        for dialect, text in CLEAN:
            code, res, _ = lint(text, dialect)
            bad = [i for i in res["issues"] if i["sev"] in ("BLOCK", "FIX")]
            self.assertEqual(bad, [], "%s: %r" % (dialect, text))
            self.assertEqual(code, 0, text)

    def test_hamza_is_a_suggestion_not_an_autofix(self):
        _, res, _ = lint("هنعمل اعلان جديد", "eg")
        issue = next(i for i in res["issues"] if i["rule"] == "ORTHO-HAMZA-001")
        self.assertEqual((issue["original"], issue["fix"], issue["autofix"]), ("اعلان", "إعلان", False))
        self.assertLess(issue["confidence"], 1.0)

    def test_clitics_keep_their_prefix(self):
        _, res, _ = lint("بالاعلان والشركه", "eg")
        fixes = {i["original"]: i["fix"] for i in res["issues"] if i["rule"].startswith(("ORTHO-HAMZA", "ORTHO-TAA"))}
        self.assertEqual(fixes.get("بالاعلان"), "بالإعلان")
        self.assertEqual(fixes.get("والشركه"), "والشركة")

    def test_diacritics_do_not_hide_a_misspelling(self):
        _, res, _ = lint("اعْلان", "eg")
        self.assertTrue(any(i["rule"] == "ORTHO-HAMZA-001" for i in res["issues"]))

    def test_dialect_deny_and_warn_lists(self):
        _, res, _ = lint("عايز أعمل بوست دلوقتي", "gulf")
        deny = {i["original"] for i in res["issues"] if i["rule"].startswith("O1.deny-marker")}
        self.assertTrue({"عايز", "دلوقتي"} <= deny)
        self.assertTrue(all(i["sev"] == "BLOCK" for i in res["issues"] if i["rule"].startswith("O1.deny-marker")))
        _, res, _ = lint("مب كده", "eg")
        self.assertTrue(any(i["original"] == "مب" for i in res["issues"]))
        _, res, _ = lint("لماذا تنتظر", "eg")
        warn = [i for i in res["issues"] if i["rule"].startswith("O1.warn-marker")]
        self.assertTrue(warn and warn[0]["sev"] == "FIX")
        _, res, _ = lint("هذا مش مفيد", "msa-white")
        self.assertTrue(any(i["original"] == "مش" for i in res["issues"]))

    def test_a_dialects_own_words_are_never_denied(self):
        for dialect, text in CLEAN:
            _, res, _ = lint(text, dialect)
            self.assertFalse([i for i in res["issues"] if i["rule"].startswith("O1.deny-marker")], text)

    def test_allow_list_silences_a_word(self):
        code, res, _ = lint("هنعمل اعلان جديد", "eg", "--allow", "اعلان")
        self.assertFalse([i for i in res["issues"] if i["rule"] == "ORTHO-HAMZA-001"])
        _, res, _ = lint("وش رايك", "eg", "--allow", "وش")
        self.assertFalse([i for i in res["issues"] if i["rule"].startswith("O1")])

    def test_fix_applies_only_autofix_rules(self):
        code, res, _ = lint("کتاب  اعلان, ٣ أدوات و5 خطوات...", "eg", "--fix")
        fixed = res["fixed"]
        self.assertNotIn("ک", fixed)               # Persian kaf -> ك   (autofix)
        self.assertNotIn("  ", fixed)               # double space        (autofix)
        self.assertNotIn(",", fixed)                # Latin comma         (autofix)
        self.assertNotIn("...", fixed)              # three dots          (autofix)
        self.assertNotIn("٣", fixed)                # mixed digits        (autofix)
        self.assertIn("اعلان", fixed)               # hamza is a suggestion: untouched
        self.assertEqual(code, 1)                   # the hamza suggestion is still pending
        self.assertTrue(all(not i["autofix"] for i in res["issues"] if i["sev"] in ("BLOCK", "FIX")))

    def test_table_format_and_file_input(self):
        with tempfile.TemporaryDirectory() as d:
            f = Path(d) / "copy.txt"
            f.write_text("هنعمل اعلان جديد\n", encoding="utf-8")
            code, out, _ = run("--file", str(f), "--dialect", "eg")
            self.assertEqual(code, 1)
            self.assertIn("| FIX | ORTHO-HAMZA-001 | اعلان | إعلان |", out)

    def test_spec_mode_reports_slide_and_field_and_never_overwrites(self):
        spec = {"specVersion": 1, "locale": {"dialect": "eg", "digits": "western"},
                "hook": {"cover": "6 أدوات ببلاش…\nبتغنيك عن ==المصمم=="},
                "slides": [{"id": "s01", "type": "cover", "headline": "هنعمل اعلان", "kashidaWord": "المصمم"},
                           {"id": "s02", "type": "item", "title": "الأداة", "body": "كتاب جميل",
                            "bullets": ["اعلان واحد", "نص سليم"]}],
                "captionPack": {"firstLine": "فى الشركه", "alt": ["صورة", "اعلان"]}}
        with tempfile.TemporaryDirectory() as d:
            src = Path(d) / "spec.json"
            src.write_text(json.dumps(spec, ensure_ascii=False), encoding="utf-8")
            code, out, err = run("--spec", str(src), "--format", "json")
            res = json.loads(out)
            where = {(i.get("slide"), i["el"], i["rule"]) for i in res["issues"]}
            self.assertIn(("s01", "headline", "ORTHO-HAMZA-001"), where)
            self.assertIn(("s02", "bullets.0", "ORTHO-HAMZA-001"), where)
            self.assertIn((None, "captionPack.firstLine", "ORTHO-YAA-001"), {(i.get("slide"), i["el"], i["rule"]) for i in res["issues"]})
            self.assertIn(("s02", "captionPack.alt.1", "ORTHO-HAMZA-001"), where)  # alt text belongs to slide 2
            # --fix needs --out
            self.assertEqual(run("--spec", str(src), "--fix")[0], 64)
            out_file = Path(d) / "fixed.json"
            code, _, _ = run("--spec", str(src), "--fix", "--out", str(out_file), "--format", "json")
            self.assertEqual(json.loads(src.read_text(encoding="utf-8")), spec, "the input spec must stay untouched")
            self.assertTrue(out_file.exists())

    def test_usage_errors(self):
        self.assertEqual(run("--text", "x")[0], 64)                      # dialect missing
        self.assertEqual(run("--text", "x", "--dialect", "klingon")[0], 64)
        self.assertEqual(run("--file", "/nonexistent/x.txt", "--dialect", "eg")[0], 66)
        self.assertEqual(run("--dialect", "eg")[0], 64)


if __name__ == "__main__":
    unittest.main()
