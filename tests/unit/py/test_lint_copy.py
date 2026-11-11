"""lint_copy.py (B7): the --text spec builder, result filtering, CLI contract.

The wrapper is tested against a patched `_cs.qa.run_text_gates` so the tests
describe what the wrapper does, not what B4's gates decide.  One integration
test runs the genuine engine on the example spec and is skipped until B4's
package exists.
"""
import contextlib
import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import b7_support as support

REPO = support.REPO


def result(gate, rule, sev, slide=None, el=None):
    r = {"gate": gate, "rule": rule, "sev": sev, "msg": {"ar": "رسالة " + rule, "en": "message " + rule}}
    if slide:
        r["slide"] = slide
    if el:
        r["el"] = el
    return r


class LintCopyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.lc = support.load_script("carousel-create", "lint_copy.py")
        from _cs import qa
        cls.qa = qa

    def run_cli(self, argv, results=None):
        calls = []

        def fake(spec, brand=None, *, gates=None, fast=False, history=None):
            calls.append({"spec": spec, "brand": brand, "gates": gates, "fast": fast, "history": history})
            return list(results or [])

        out = io.StringIO()
        with mock.patch.object(self.qa, "run_text_gates", fake), contextlib.redirect_stdout(out):
            code = self.lc.main(argv)
        return code, out.getvalue(), calls

    # -- the throw-away spec ------------------------------------------------

    def test_cover_text_goes_into_slide_one(self):
        spec = self.lc.spec_for_text("6 أدوات ببلاش", "cover", "eg", "western", False)
        self.assertEqual(spec["slides"][0]["type"], "cover")
        self.assertEqual(spec["slides"][0]["headline"], "6 أدوات ببلاش")
        self.assertEqual(spec["locale"]["dialect"], "eg")
        self.assertEqual([s["n"] for s in spec["slides"]], [1, 2])

    def test_two_beat_cover_agrees_with_hook_and_text_gates(self):
        hf = support.load_script("carousel-create", "hook_features.py")
        for separator in ("؟ ", "? ", "… ", "... ", ": ", "\n"):
            cover = "صورة منتجك ثابتة" + separator + "حركها داخل الأداة بخطوة بسيطة الآن"
            spec = self.lc.spec_for_text(cover, "cover", "eg", "western", False)
            self.assertEqual(hf.split_beats(cover), self.qa.split_cover(cover))
            found = self.qa.run_text_gates(spec, gates=["C1"])
            self.assertFalse(any(r["rule"] == "C1.hero-words" for r in found), separator)
            spec["slides"][0]["sub"] = "إضافة كلمات تتجاوز حد الغلاف"
            self.assertTrue(any(r["rule"] == "C1.total-words" for r in self.qa.run_text_gates(spec, gates=["C1"])))

    def test_rehook_title_body_bullet_land_on_slide_two(self):
        cases = {"rehook": ("rehook", "headline"), "title": ("item", "title"), "body": ("item", "body")}
        for role, (kind, field) in cases.items():
            spec = self.lc.spec_for_text("نص", role, "gulf", "western", False)
            self.assertEqual(spec["slides"][1]["type"], kind)
            self.assertEqual(spec["slides"][1][field], "نص")
        spec = self.lc.spec_for_text("أول\nتاني", "bullet", "eg", "western", False)
        self.assertEqual(spec["slides"][1]["bullets"], ["أول", "تاني"])

    def test_caption_is_split_into_the_pack(self):
        spec = self.lc.spec_for_text("سطر أول\nسطر ثاني\nباقي الكلام #كاروسيل #تصميم", "caption", "eg", "western", False)
        pack = spec["captionPack"]
        self.assertEqual((pack["firstLine"], pack["keywordLine"]), ("سطر أول", "سطر ثاني"))
        self.assertEqual(pack["body"], "باقي الكلام")
        self.assertEqual(pack["hashtags"], ["#كاروسيل", "#تصميم"])

    def test_alt_text_goes_into_the_alt_array(self):
        spec = self.lc.spec_for_text("غلاف: 6 أدوات", "alt", "eg", "western", False)
        self.assertEqual(spec["captionPack"]["alt"], ["غلاف: 6 أدوات"])

    def test_english_text_spec_is_ltr(self):
        spec = self.lc.spec_for_text("Hello", "cover", "en", "western", False)
        self.assertEqual(spec["locale"]["appLanguage"], "en")
        self.assertEqual(spec["locale"]["swipeCue"], "arrow-ltr")

    def test_skeleton_spec_has_every_required_top_level_field(self):
        schema = json.loads((support.skill_dir("carousel-design") / "schemas" / "spec.schema.json").read_text(encoding="utf-8"))
        spec = self.lc.spec_for_text("x", "cover", "eg", "western", False)
        for key in schema["required"]:
            self.assertIn(key, spec)

    # -- filtering ---------------------------------------------------------

    def test_text_mode_runs_only_the_gates_of_the_role(self):
        for role, gates in self.lc.ROLE_GATES.items():
            _, _, calls = self.run_cli(["--text", "نص", "--role", role, "--format", "json"])
            self.assertEqual(calls[0]["gates"], gates, role)
            self.assertNotIn("C5", calls[0]["gates"])
            self.assertNotIn("SRC1", calls[0]["gates"])

    def test_findings_about_filler_slides_are_dropped(self):
        results = [result("C1", "C1.hero-words", "BLOCK", slide="s01"), result("C2", "C2.body-words", "FIX", slide="s02")]
        code, out, _ = self.run_cli(["--text", "نص", "--role", "cover", "--format", "json"], results)
        data = json.loads(out)
        self.assertEqual([r["rule"] for r in data["results"]], ["C1.hero-words"])
        self.assertEqual(code, 2)

    def test_caption_role_keeps_only_caption_rules(self):
        results = [result("C9", "C9.length", "FIX", el="caption.body"),
                   result("C9", "C9.per-slide", "BLOCK"),
                   result("C9", "C9.alt-missing", "BLOCK"),
                   result("C9", "C9.first-line-similarity", "FIX"),
                   result("C8", "C8.ai-words", "FIX", el="caption.body"),
                   result("C1", "C1.hero-words", "BLOCK", slide="s01")]
        _, out, _ = self.run_cli(["--text", "نص", "--role", "caption", "--format", "json"], results)
        self.assertEqual([r["rule"] for r in json.loads(out)["results"]], ["C9.length", "C8.ai-words"])

    def test_alt_role_keeps_only_alt_length_rules(self):
        results = [result("C9", "C9.alt-length", "NOTE"), result("C9", "C9.alt-length-hard", "BLOCK"),
                   result("C9", "C9.length", "FIX")]
        _, out, _ = self.run_cli(["--text", "نص", "--role", "alt", "--format", "json"], results)
        self.assertEqual([r["rule"] for r in json.loads(out)["results"]], ["C9.alt-length", "C9.alt-length-hard"])

    def test_spec_mode_reports_everything_and_applies_overrides(self):
        spec = json.loads((REPO / "docs" / "examples" / "spec.example.json").read_text(encoding="utf-8"))
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "spec.json"
            path.write_text(json.dumps(spec, ensure_ascii=False), encoding="utf-8")
            results = [result("C5", "C5.slide-count", "NOTE"), result("C8", "C8.hype", "FIX", slide="s03")]
            code, out, calls = self.run_cli(["--spec", str(path), "--dialect", "gulf", "--digits", "arabic-indic",
                                             "--gates", "c5,c8", "--format", "json"], results)
        self.assertEqual(len(json.loads(out)["results"]), 2)
        self.assertEqual(code, 1)
        self.assertEqual(calls[0]["gates"], ["C5", "C8"])
        self.assertEqual(calls[0]["spec"]["locale"]["dialect"], "gulf")
        self.assertEqual(calls[0]["spec"]["locale"]["digits"], "arabic-indic")
        self.assertEqual(spec["locale"]["dialect"], "eg", "the file's own spec must not be mutated")

    def test_history_file_forms(self):
        entries = [{"postId": "post-20261001-0001", "date": "2026-10-01", "family": "P2", "cta": "save"}]
        for payload in (entries, {"history": entries}, {"hooks": {"history": entries}}):
            with tempfile.TemporaryDirectory() as tmp:
                hpath = Path(tmp) / "h.json"
                hpath.write_text(json.dumps(payload), encoding="utf-8")
                _, _, calls = self.run_cli(["--text", "نص", "--role", "cover", "--history", str(hpath), "--format", "json"])
            self.assertEqual(calls[0]["history"], {"history": entries})

    def test_fast_flag_reaches_the_engine_and_the_spec(self):
        _, _, calls = self.run_cli(["--text", "نص", "--role", "caption", "--fast", "--format", "json"])
        self.assertTrue(calls[0]["fast"])
        self.assertEqual(calls[0]["spec"]["mode"], "fast")

    # -- output and exit codes ------------------------------------------------

    def test_exit_codes(self):
        self.assertEqual(self.run_cli(["--text", "نص", "--role", "cover"], [])[0], 0)
        self.assertEqual(self.run_cli(["--text", "نص", "--role", "cover"], [result("C8", "C8.hype", "FIX", slide="s01")])[0], 1)
        self.assertEqual(self.run_cli(["--text", "نص", "--role", "cover"], [result("C1", "C1.hero-words", "BLOCK", slide="s01")])[0], 2)
        notes_only = [result("C8", "C8.abstract", "NOTE", slide="s01")]
        self.assertEqual(self.run_cli(["--text", "نص", "--role", "cover"], notes_only)[0], 0)

    def test_text_output_uses_the_requested_language(self):
        results = [result("C8", "C8.hype", "FIX", slide="s01", el="s01.headline")]
        _, ar, _ = self.run_cli(["--text", "نص", "--role", "cover"], results)
        _, en, _ = self.run_cli(["--text", "نص", "--role", "cover", "--lang", "en"], results)
        self.assertIn("رسالة C8.hype", ar)
        self.assertIn("message C8.hype", en)
        self.assertIn("status=fix", ar)

    def test_usage_errors(self):
        for argv in ([], ["--text", "x"], ["--spec", "a.json", "--role", "cover"], ["--text", "x", "--role", "nope"],
                     ["--text", "x", "--role", "cover", "--gates", "ZZ9"]):
            err = io.StringIO()
            with contextlib.redirect_stderr(err), self.assertRaises(SystemExit) as ctx:
                self.lc.main(argv)
            self.assertEqual(ctx.exception.code, 64, argv)
            self.assertIn("cs-error: E_USAGE", err.getvalue())

    def test_missing_and_broken_files(self):
        err = io.StringIO()
        with contextlib.redirect_stderr(err), self.assertRaises(SystemExit) as ctx:
            self.lc.main(["--spec", "no-such-file.json"])
        self.assertEqual(ctx.exception.code, 66)
        with tempfile.TemporaryDirectory() as tmp:
            bad = Path(tmp) / "bad.json"
            bad.write_text("{not json", encoding="utf-8")
            with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit) as ctx2:
                self.lc.main(["--spec", str(bad)])
            self.assertEqual(ctx2.exception.code, 65)


@unittest.skipUnless(support.real_qa_available("carousel-create"), "B4's _cs package is not present yet")
class LintCopyWithRealEngine(unittest.TestCase):
    def test_example_spec_runs(self):
        lc = support.load_script("carousel-create", "lint_copy.py", module_name="b7_lint_copy_real")
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            code = lc.main(["--spec", str(REPO / "docs" / "examples" / "spec.example.json"), "--format", "json"])
        data = json.loads(out.getvalue())
        self.assertIn(code, (0, 1, 2))
        self.assertEqual(data["summary"]["exitCode"], code)

    def test_a_stock_opener_is_found_in_a_cover(self):
        lc = support.load_script("carousel-create", "lint_copy.py", module_name="b7_lint_copy_real2")
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            lc.main(["--text", "هل تعلم أن الأدوات كتير", "--role", "cover", "--format", "json"])
        rules = {r.get("rule") for r in json.loads(out.getvalue())["results"]}
        self.assertIn("C8.stock-opener", rules)


def tearDownModule():
    support.cleanup()


if __name__ == "__main__":
    unittest.main()
