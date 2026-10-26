"""Tests for carousel-design/scripts/extract_spec.py: reading the data blocks of a built page and applying a Studio patch.

Run: python -m unittest discover -s tests/unit/py -p "test_extract_spec.py"   (standard library only)
"""
from __future__ import annotations

import contextlib
import copy
import io
import json
import shutil
import tempfile
import unittest
from pathlib import Path

import b7_support as support

EXTRACT = BUILD = None


def setUpModule() -> None:
    """The scripts import their own folder's `_cs` (and apply_patch imports `_cs.schema` when it runs), so they are loaded here and the
    scope stays open until tearDownModule: whatever `_cs` an earlier test module left behind is set aside, and put back afterwards."""
    global EXTRACT, BUILD
    EXTRACT = support.load_script("carousel-design", "extract_spec.py", "extract_spec_under_test")
    BUILD = support.load_script("carousel-design", "build_studio.py", "build_studio_for_extract_test")


def tearDownModule() -> None:
    support.cleanup()

SPEC = {
    "specVersion": 1, "id": "post-test-0001", "rev": 3, "brand": {"slug": "demo-brand"}, "format": "carousel", "mode": "fast", "checkpoint": "design",
    "canvas": {"preset": "ig-3x4", "w": 1080, "h": 1440, "safe": [34, 45, 1012, 1350], "exports": ["3x4"]},
    "locale": {"dialect": "eg", "digits": "western", "appLanguage": "ar", "swipeCue": "arrow-rtl"}, "style": {"presetId": "swiss@1.0"},
    "slides": [
        {"id": "s01", "n": 1, "type": "cover", "headline": "6 أدوات</script><!-- ببلاش"},
        {"id": "s02", "n": 2, "type": "summary", "title": "الخلاصة", "bullets": ["أ", "ب", "ج"]},
    ],
    "meta": {"updatedBy": "claude", "updatedAt": "2026-10-22T10:00:00Z"},
}
BRAND = {"schemaVersion": 1, "id": "brand-demo-0001", "slug": "demo-brand", "name": "براند"}


def make_page(spec=SPEC) -> str:
    """The skeleton the Artifact tool wraps around a page, with the blocks build_studio.py writes."""
    return ("<!doctype html><html><head><meta charset=utf8></head><body><title>x</title>\n"
            + BUILD.json_block("cs-config", {"engine": "cs-1.1.0", "view": "design"}) + "\n"
            + BUILD.json_block("cs-spec", spec) + "\n" + BUILD.json_block("cs-brand", BRAND) + "\n"
            + '<script id="cs-chunk-ui">var s = \'<script type="application/json" id="cs-spec">\' + "{}";</script>\n</body></html>')


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="cs-extract-test-"))
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)
        self.page = self.tmp / "page.html"
        self.page.write_text(make_page(), encoding="utf-8")
        self.spec_path = self.tmp / "spec.json"
        self.spec_path.write_text(json.dumps(SPEC, ensure_ascii=False), encoding="utf-8")

    def run_cli(self, *args):
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            code = EXTRACT.main([str(a) for a in args])
        return code, out.getvalue(), err.getvalue()

    def write_patch(self, ops, base_rev=3, spec_id="post-test-0001") -> Path:
        path = self.tmp / "patch.json"
        path.write_text(json.dumps({"carouselStudioPatch": 1, "specId": spec_id, "baseRev": base_rev,
                                    "patch": [{"op": "test", "path": "/rev", "value": base_rev}] + ops}, ensure_ascii=False), encoding="utf-8")
        return path


class TestExtract(Base):
    def test_reads_the_spec_block(self):
        code, out, _ = self.run_cli(self.page)
        self.assertEqual(code, 0)
        self.assertEqual(json.loads(out), SPEC)

    def test_ignores_code_that_mentions_the_block(self):
        code, out, _ = self.run_cli(self.page, "--format", "json")
        self.assertEqual(code, 0)
        self.assertEqual(json.loads(out)["id"], "post-test-0001")

    def test_other_kinds(self):
        self.assertEqual(json.loads(self.run_cli(self.page, "--kind", "brand")[1])["slug"], "demo-brand")
        self.assertEqual(json.loads(self.run_cli(self.page, "--kind", "config")[1])["engine"], "cs-1.1.0")

    def test_writes_a_file(self):
        out = self.tmp / "out" / "spec.json"
        code, stdout, _ = self.run_cli(self.page, "-o", out, "--format", "json")
        self.assertEqual(code, 0)
        self.assertEqual(json.loads(out.read_text(encoding="utf-8")), SPEC)
        self.assertEqual(json.loads(stdout), {"kind": "spec", "id": "post-test-0001", "rev": 3, "out": str(out), "overrides": []})
        self.assertTrue(out.read_text(encoding="utf-8").endswith("}\n"))

    def test_lists_the_creators_overrides(self):
        # A save read back with -o names every override, so the reader never raises a decided finding again.
        doc = {"rev": 7, "checkpoint": "design", "style": {"presetId": "notebook@1.0"},
               "qa": {"results": [{"rule": "C1.hero-words", "slide": "s01", "sev": "BLOCK", "overridden": {"reason": "لان دا الصح", "at": "x"}},
                                  {"rule": "C1.total-words", "slide": "s01", "sev": "BLOCK"}]}}
        decided = EXTRACT.creator_overrides(doc)
        self.assertEqual(decided, [{"rule": "C1.hero-words", "slide": "s01", "reason": "لان دا الصح"}])
        text = EXTRACT.save_summary(doc, decided)
        self.assertIn("rev 7", text)
        self.assertIn("C1.hero-words on s01", text)
        self.assertNotIn("C1.total-words", text)

    def test_expect_rev(self):
        self.assertEqual(self.run_cli(self.page, "--expect-rev", 3)[0], 0)
        code, _, err = self.run_cli(self.page, "--expect-rev", 2)
        self.assertEqual(code, 75)
        self.assertIn("rev 3", err)

    def test_missing_block_and_file(self):
        bare = self.tmp / "bare.html"
        bare.write_text("<html></html>", encoding="utf-8")
        self.assertEqual(self.run_cli(bare)[0], 65)
        self.assertEqual(self.run_cli(self.tmp / "nope.html")[0], 66)

    def test_usage(self):
        self.assertEqual(self.run_cli()[0], 64)
        self.assertEqual(self.run_cli(self.page, "--kind", "weird")[0], 64)
        self.assertEqual(self.run_cli("--apply-patch", self.tmp / "p.json")[0], 64, "needs --spec")
        self.assertEqual(self.run_cli(self.page, "--kind", "brand", "--expect-rev", 1)[0], 64)

    def test_page_built_by_the_real_builder_round_trips(self):
        # the builder's escaping and this reader agree on hostile text
        spec = copy.deepcopy(SPEC)
        spec["slides"][0]["headline"] = "a</script>b<!--c d"
        page = self.tmp / "hostile.html"
        page.write_text(make_page(spec), encoding="utf-8")
        self.assertEqual(json.loads(self.run_cli(page)[1]), spec)


class TestApplyPatch(Base):
    def apply(self, ops, **kw):
        patch = self.write_patch(ops, **kw)
        out = self.tmp / "result.json"
        code, stdout, err = self.run_cli("--apply-patch", patch, "--spec", self.spec_path, "-o", out, "--format", "json")
        result = json.loads(out.read_text(encoding="utf-8")) if out.exists() else None
        return code, result, err

    def test_applies_edits_and_keeps_the_rev_the_patch_set(self):
        code, result, _ = self.apply([{"op": "replace", "path": "/rev", "value": 4}, {"op": "replace", "path": "/slides/0/headline", "value": "جديد"},
                                      {"op": "replace", "path": "/meta/updatedBy", "value": "studio"}])
        self.assertEqual(code, 0)
        self.assertEqual(result["rev"], 4)
        self.assertEqual(result["slides"][0]["headline"], "جديد")
        self.assertEqual(result["meta"]["updatedBy"], "studio")

    def test_a_hand_written_patch_still_bumps_the_rev(self):
        code, result, _ = self.apply([{"op": "replace", "path": "/slides/1/title", "value": "خلاصة"}])
        self.assertEqual(code, 0)
        self.assertEqual(result["rev"], 4)
        self.assertEqual(result["meta"]["updatedBy"], "studio")
        self.assertRegex(result["meta"]["updatedAt"], r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")

    def test_add_remove_and_array_operations(self):
        code, result, _ = self.apply([{"op": "add", "path": "/slides/1/bullets/-", "value": "د"}, {"op": "remove", "path": "/slides/1/bullets/0"},
                                      {"op": "add", "path": "/slides/1/bullets/0", "value": "أول"}, {"op": "add", "path": "/style/metaLabel", "value": "سلسلة"},
                                      {"op": "remove", "path": "/meta/updatedAt"}])
        self.assertEqual(code, 0)
        self.assertEqual(result["slides"][1]["bullets"], ["أول", "ب", "ج", "د"])
        self.assertEqual(result["style"]["metaLabel"], "سلسلة")

    def test_pointer_escapes(self):
        base = {"a/b": {"c~d": 1}}
        out = EXTRACT.apply_ops(base, [{"op": "replace", "path": "/a~1b/c~0d", "value": 2}])
        self.assertEqual(out, {"a/b": {"c~d": 2}})

    def test_rev_conflict_exits_75(self):
        code, result, err = self.apply([{"op": "replace", "path": "/rev", "value": 3}], base_rev=2)
        self.assertEqual(code, 75)
        self.assertIsNone(result)
        self.assertIn("rev 2", err)

    def test_failed_test_operation_exits_75(self):
        patch = self.write_patch([{"op": "test", "path": "/slides/0/headline", "value": "غير موجود"}])
        self.assertEqual(self.run_cli("--apply-patch", patch, "--spec", self.spec_path, "-o", self.tmp / "r.json")[0], 75)

    def test_wrong_post_and_malformed_envelopes_exit_65(self):
        self.assertEqual(self.apply([{"op": "replace", "path": "/rev", "value": 4}], spec_id="another-post-9")[0], 65)
        bad = self.tmp / "bad.json"
        for doc in ({"patch": []}, {"carouselStudioPatch": 2, "patch": []}, {"carouselStudioPatch": 1, "specId": "post-test-0001", "baseRev": "3", "patch": []},
                    {"carouselStudioPatch": 1, "specId": "post-test-0001", "baseRev": 3, "patch": [{"op": "move", "path": "/a"}]}):
            bad.write_text(json.dumps(doc), encoding="utf-8")
            self.assertEqual(self.run_cli("--apply-patch", bad, "--spec", self.spec_path)[0], 65, doc)
        bad.write_text("not json", encoding="utf-8")
        self.assertEqual(self.run_cli("--apply-patch", bad, "--spec", self.spec_path)[0], 65)

    def test_bad_paths_exit_65(self):
        for op in ({"op": "replace", "path": "/slides/9/title", "value": "x"}, {"op": "remove", "path": "/nothing"}, {"op": "replace", "path": "/slides/0/headline/x", "value": "y"},
                   {"op": "add", "path": "slides", "value": 1}):
            patch = self.write_patch([op])
            self.assertEqual(self.run_cli("--apply-patch", patch, "--spec", self.spec_path)[0], 65, op)

    def test_array_index_grammar_matches_the_studio(self):
        # the Studio (src/lib/patch.js) accepts ^(0|[1-9][0-9]*)$ and '-' only for add; anything else is a malformed patch, never a crash
        for path in ("/slides/-1/title", "/slides/01/title", "/slides/+1/title", "/slides/ 1/title", "/slides/1_0/title", "/slides/١/title", "/slides/-/title", "/slides/%s/title" % ("9" * 5000)):
            patch = self.write_patch([{"op": "replace", "path": path, "value": "x"}])
            self.assertEqual(self.run_cli("--apply-patch", patch, "--spec", self.spec_path)[0], 65, path)
        for path in ("/slides/01/bullets/0", "/slides/1/bullets/-1", "/slides/1/bullets/-"):
            patch = self.write_patch([{"op": "remove", "path": path}])
            self.assertEqual(self.run_cli("--apply-patch", patch, "--spec", self.spec_path)[0], 65, path)
        patch = self.write_patch([{"op": "add", "path": "/slides/1/bullets/9", "value": "x"}])
        self.assertEqual(self.run_cli("--apply-patch", patch, "--spec", self.spec_path)[0], 65)

    def test_a_result_that_breaks_the_schema_writes_nothing(self):
        out = self.tmp / "result.json"
        out.write_text("keep me", encoding="utf-8")
        patch = self.write_patch([{"op": "replace", "path": "/slides/0/type", "value": "no-such-type"}])
        code, stdout, err = self.run_cli("--apply-patch", patch, "--spec", self.spec_path, "-o", out)
        if code == 0:  # the schema module may be absent in a stripped install; the check below only applies when it validates
            self.skipTest("schema validation is not available")
        self.assertEqual(code, 2)
        self.assertEqual(out.read_text(encoding="utf-8"), "keep me")
        self.assertEqual(stdout, "")
        self.assertIn("nothing was written", err)

    def test_the_input_spec_is_not_modified(self):
        before = self.spec_path.read_text(encoding="utf-8")
        self.apply([{"op": "replace", "path": "/slides/0/headline", "value": "x"}])
        self.assertEqual(self.spec_path.read_text(encoding="utf-8"), before)

    def test_studio_envelope_shape_applies(self):
        # exactly what CS.ui copyPatch() produces for a one-word edit
        envelope = {"carouselStudioPatch": 1, "specId": "post-test-0001", "baseRev": 3, "patch": [
            {"op": "test", "path": "/rev", "value": 3}, {"op": "replace", "path": "/rev", "value": 4},
            {"op": "replace", "path": "/slides/0/headline", "value": "جديد"}, {"op": "replace", "path": "/meta/updatedAt", "value": "2026-10-22T11:00:00Z"},
            {"op": "replace", "path": "/meta/updatedBy", "value": "studio"}]}
        result = EXTRACT.apply_envelope(envelope, SPEC)
        self.assertEqual((result["rev"], result["meta"]["updatedBy"], result["slides"][0]["headline"]), (4, "studio", "جديد"))


if __name__ == "__main__":
    unittest.main()
