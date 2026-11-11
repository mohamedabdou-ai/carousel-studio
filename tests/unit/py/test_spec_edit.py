"""Fresh ready-script fixtures, durable edits, conflicts, refusals and legacy Windows output."""
from __future__ import annotations

import contextlib
import copy
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

try:
    import b7_support as support
except ImportError:
    from . import b7_support as support

SCRIPT = support.SKILLS / "carousel-create" / "scripts" / "script_to_spec.py"
EDITOR = SCRIPT.with_name("spec_edit.py")
ENV = {**os.environ, "PYTHONIOENCODING": "utf-8", "PYTHONDONTWRITEBYTECODE": "1"}
PASTE = """**سلايد ١ — الغلاف**
**موعد واضح**
خطوة صغيرة
**سلايد ٢ — نتيجة الورشة**
الزيادة 48.5% مقابل 32.1%.
**سلايد ٣ — نتيجة ثانية**
التغيير 19%. [تقرير](https://workshop.example/report?utm_source=chat)
**سلايد ٤ — القفلة**
احفظ القائمة.
"""


def setUpModule():
    global lane
    lane = support.load_script("carousel-create", "script_to_spec.py", "script_to_spec")


def tearDownModule():
    support.cleanup()


class EditorTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.post = self.root / "post-20261111-0042"
        self.script = self.root / "script.md"
        self.script.write_text(PASTE, encoding="utf-8", newline="\n")
        self.spec = self.post / "spec.json"
        self.record = self.post / "spec.edits.json"
        self.parse()
        self.fill = self.root / "fill.json"
        self.fill.write_text(json.dumps({
            "bridges": ["التفاصيل التالية", "وبعد القياس"],
            "caption": {"firstLine": "عنوان «موعد واضح»", "keywordLine": "تنظيم مواعيد الورشة",
                        "body": "نتيجة الورشة وطريقة مراجعة الجدول قبل الموعد.", "cta": "احفظ القائمة.", "hashtags": ["#تنظيم"]},
            "perSlide": ["موعد واضح", "نتيجة", "تقرير", "احفظ القائمة"],
            "alt": ["غلاف: موعد واضح، خطوة صغيرة", "نتيجة الورشة", "تقرير الورشة", "حفظ القائمة"],
        }, ensure_ascii=False), encoding="utf-8", newline="\n")
        self.parse("--spec", str(self.spec), "--fill", str(self.fill))

    def parse(self, *args):
        args = args or ("--script", str(self.script), "--out", str(self.post), "--no-split", "--architecture", "news")
        res = subprocess.run([sys.executable, str(SCRIPT), *args], capture_output=True, text=True, encoding="utf-8", env=ENV, timeout=60)
        self.assertIn(res.returncode, (0, 1, 2), res.stdout + res.stderr)
        self.assertFalse(res.stderr, res.stderr)
        return res

    def edit(self, *args, status=None):
        res = subprocess.run([sys.executable, str(EDITOR), "--spec", str(self.spec), *args], capture_output=True, text=True,
                             encoding="utf-8", env=ENV, timeout=60)
        if status is None:
            self.assertIn(res.returncode, (0, 1, 2), res.stdout + res.stderr)
            self.assertFalse(res.stderr, res.stderr)
        else:
            self.assertEqual(res.returncode, status, res.stdout + res.stderr)
        return res

    def read(self):
        return json.loads(self.spec.read_text(encoding="utf-8"))

    def test_shared_options_work_before_and_after_the_command(self):
        """`spec_edit.py show --spec F` is what people type first; an option given before the command must not be reset by it."""
        def run(*args):
            return subprocess.run([sys.executable, str(EDITOR), *args], capture_output=True, text=True, encoding="utf-8", env=ENV, timeout=60)
        after = run("show", "--spec", str(self.spec), "--format", "json")
        before = run("--format", "json", "--spec", str(self.spec), "show")
        self.assertIn(after.returncode, (0, 1, 2), after.stderr)
        self.assertEqual(json.loads(after.stdout)["slides"], json.loads(before.stdout)["slides"])
        missing = run("show")
        self.assertEqual(missing.returncode, 64, missing.stdout + missing.stderr)
        self.assertIn("--spec", missing.stderr)

    def test_show_is_compact_read_only_and_json_has_fresh_counts(self):
        before = self.spec.read_bytes()
        shown = json.loads(self.edit("show", "--format", "json").stdout)
        self.assertEqual(shown["slides"][0]["id"], "s01")
        self.assertEqual(shown["style"], "creator@1.0")
        self.assertIn("words", shown["slides"][1])
        self.assertIn("block", shown["qa"]["counts"])
        self.assertGreater(shown["qa"]["counts"]["block"], 0)
        self.assertEqual(before, self.spec.read_bytes())
        reordered = self.read()
        reordered["slides"][1], reordered["slides"][2] = reordered["slides"][2], reordered["slides"][1]
        self.assertEqual(lane.find_slide(reordered, "2")["id"], "s03")
        self.assertEqual(lane.find_slide(reordered, "s02")["id"], "s02")

    def test_each_edit_survives_both_reruns_with_revisions_and_cover_quotes(self):
        rev = self.read()["rev"]
        calls = [
            ("style", "notebook"),
            ("cover", "--headline", "وقت منظم", "--sub", "خطوة واضحة", "--kicker", "دليل الورشة"),
            ("text", "2", "--field", "body", "القيمة 48.5% مقابل 32.1%."),
            ("text", "s02", "--field", "bridge", "قارن النتيجتين"),
            ("text", "s03", "--field", "title", "قراءة القياس"),
            ("source", "add", "--url", "https://workshop.example/data?utm_medium=chat", "--label", "بيانات الورشة", "--slide", "s02"),
            ("alt", "s02", "وصف مستقل للقياس"),
            ("caption", "--field", "perSlide", "--slide", "s02", "تعليق القياس"),
            ("caption", "--field", "body", "ملخص المراجعة وموعد الورشة."),
            ("caption", "--field", "hashtags", "#تنظيم", "#موعد"),
            ("cta", "--kind", "question", "--text", "ما الموعد المناسب؟", "--title", "موعدك القادم"),
            ("override", "post", "roles.accent=#2468AC"),
            ("override", "s02", "type.scale.body=48"),
        ]
        for command in calls:
            with self.subTest(command=command):
                res = self.edit(*command)
                rev += 1
                self.assertEqual(self.read()["rev"], rev)
                self.assertIn("BLOCK", res.stdout)
                self.assertTrue(self.record.is_file())
        changed = self.read()
        self.assertEqual(changed["captionPack"]["firstLine"], "عنوان «وقت منظم»")
        self.assertEqual(changed["captionPack"]["alt"][0], "غلاف: وقت منظم، خطوة واضحة")
        self.assertEqual(changed["hook"]["cover"], "وقت منظم")
        self.parse()
        again = self.read()
        for field in ("slides", "style", "sources", "captionPack", "hook"):
            self.assertEqual(changed[field], again[field], field)
        self.parse("--spec", str(self.spec), "--fill", str(self.fill))
        self.assertEqual(self.read()["captionPack"], again["captionPack"])

    def test_attest_is_explicit_idempotent_and_leaves_url_sources_alone(self):
        self.assertFalse(any(s["kind"] == "user" for s in self.read().get("sources", [])))
        self.edit("source", "attest")
        s = self.read()
        user = next(x for x in s["sources"] if x["kind"] == "user")
        self.assertTrue(user["verified"])
        self.assertIn(user["id"], s["slides"][1]["sourceIds"])
        self.assertNotIn(user["id"], s["slides"][2]["sourceIds"])
        self.assertFalse([r for r in s["qa"]["results"] if r["rule"] == "SRC1.missing"])
        self.edit("source", "attest")
        self.parse()
        self.assertEqual(len([x for x in self.read()["sources"] if x["kind"] == "user"]), 1)

    def test_parser_attest_flag_is_durable_and_does_not_attest_changed_figures(self):
        self.parse("--spec", str(self.spec), "--fill", str(self.fill), "--attest-numbers")
        self.parse()
        self.assertTrue(any(s["kind"] == "user" for s in self.read()["sources"]))
        self.script.write_text(PASTE.replace("48.5%", "49.7%"), encoding="utf-8", newline="\n")
        self.parse()
        self.assertFalse(self.read()["slides"][1].get("sourceIds"))
        self.assertTrue(any(r["rule"] == "SRC1.missing" and r.get("slide") == "s02" for r in self.read()["qa"]["results"]))

    def test_legacy_sources_assets_and_media_survive_first_rebuild(self):
        self.record.unlink()
        spec = self.read()
        spec["assets"] = [{"id": "plate-a", "kind": "image", "ref": "asset:plate-a", "aiGenerated": False}]
        spec["slides"][1]["media"] = {"assetId": "plate-a", "slot": "photo"}
        spec["slides"][0]["headline"] = "جدول واضح"
        spec["hook"]["cover"] = "جدول واضح"
        spec["meta"]["studioUrl"] = "saved-studio"
        spec["ext"]["reviewed"] = True
        self.spec.write_text(json.dumps(spec, ensure_ascii=False), encoding="utf-8", newline="\n")
        self.parse()
        self.assertEqual(self.read()["assets"], spec["assets"])
        self.assertEqual(self.read()["slides"][1]["media"], spec["slides"][1]["media"])
        self.assertEqual(self.read()["slides"][0]["headline"], "جدول واضح")
        self.assertEqual(self.read()["hook"]["cover"], "جدول واضح")
        self.assertEqual(self.read()["meta"]["studioUrl"], "saved-studio")
        self.assertTrue(self.read()["ext"]["reviewed"])

    def test_missing_cta_kept_explicitly_is_the_creators_override(self):
        """«زي ما هو» on a script that ends without a call to action: the gate stays in the report, marked as the creator's
        override, so the Studio and the export honour it. Nothing is invented and nothing is waived without the explicit command."""
        self.script.write_text(PASTE.replace("احفظ القائمة.", "هنا تنتهي النتيجة."), encoding="utf-8", newline="\n")
        # Start a fresh post; saved deliberate edits belong to their own structure.
        self.spec.unlink()
        self.record.unlink()
        self.parse()
        before = self.read()
        self.assertTrue(any(r["rule"] == "C4.count" and not r.get("overridden") for r in before["qa"]["results"]))
        self.edit("cta", "--keep", "--reason", "المنشئ اختار النص كما هو")
        self.edit("cta", "--keep", "--reason", "المنشئ اختار النص كما هو")  # a repeat replaces the record, it does not stack
        s = self.read()
        self.assertFalse(any(sl.get("cta") for sl in s["slides"]))
        self.assertIn("keepWithoutCta", s["ext"]["readyScript"])
        kept = {r["rule"]: r.get("overridden") for r in s["qa"]["results"] if r["rule"] in ("C4.count", "C5.skeleton")}
        self.assertTrue(kept.get("C4.count"), kept)
        self.assertTrue(all(kept.values()), kept)
        record = json.loads(self.record.read_text(encoding="utf-8"))
        self.assertEqual(sum(1 for e in record["edits"] if e.get("kind") == "keep-cta"), 1)
        self.parse()  # the decision survives a rebuild
        again = {r["rule"]: bool(r.get("overridden")) for r in self.read()["qa"]["results"] if r["rule"] == "C4.count"}
        self.assertEqual(again, {"C4.count": True})

    def test_schema_usage_unknown_keys_and_stale_writers_are_refused_without_changes(self):
        commands = [
            (("text", "s99", "--field", "body", "نص"), 64),
            (("text", "s02", "--field", "body", "x" * 401), 2),
            (("cover", "--headline", "x" * 241), 2),
            (("caption", "--field", "sourceIds", "src-bad"), 64),
            (("cta", "--kind", "comment", "--text", "نص"), 64),
            (("override", "post", "roles.accent=[]"), 64),
            (("override", "post", "layout.align=sideways"), 64),
            (("override", "post", "unknown.key=1"), 64),
            (("source", "add", "--url", "javascript:bad", "--slide", "s02"), 64),
            (("style", "not-a-preset"), 64),
            (("keep", "C4.bait"), 64),  # a rule that stays non-overridable: bait is never the creator's call
            (("style", "poster", "--expect-rev", "1"), 75),
        ]
        for command, code in commands:
            with self.subTest(command=command):
                before = (self.spec.read_bytes(), self.record.read_bytes())
                res = self.edit(*command, status=code)
                self.assertIn("cs-error:", res.stderr)
                self.assertEqual(before, (self.spec.read_bytes(), self.record.read_bytes()))
                if command[-1] == "unknown.key=1":
                    self.assertIn("roles.accent", res.stderr)
        with lane.post_lock(self.spec):
            self.edit("style", "poster", status=75)

    def test_invalid_json_missing_inputs_and_foreign_records_are_refused(self):
        bad_brand = self.root / "bad-brand.json"
        for value in ("{", "[]"):
            before = self.spec.read_bytes()
            bad_brand.write_text(value, encoding="utf-8", newline="\n")
            self.edit("show", "--brand", str(bad_brand), status=65)
            self.assertEqual(before, self.spec.read_bytes())
        self.edit("show", "--brand", str(self.root / "missing.json"), status=66)
        before = self.spec.read_bytes()
        record = json.loads(self.record.read_text(encoding="utf-8"))
        record["specId"] = "different-post"
        self.record.write_text(json.dumps(record), encoding="utf-8", newline="\n")
        self.edit("style", "poster", status=75)
        self.assertEqual(before, self.spec.read_bytes())

    def test_override_reason_is_schema_checked_after_qa_marks_are_added(self):
        self.edit("cover", "--headline", "موعد واضح للورشة يناسب كل من يرغب في الحضور")
        before = (self.spec.read_bytes(), self.record.read_bytes())
        self.edit("keep", "C1.hero-words", "--reason", "x" * 301, status=2)
        self.assertEqual(before, (self.spec.read_bytes(), self.record.read_bytes()))

    def test_stdout_that_cannot_encode_arabic_does_not_crash(self):
        class LegacyStream:
            encoding = "cp1252"
            def __init__(self):
                self.parts = []
            def write(self, value):
                value.encode(self.encoding)
                self.parts.append(value)
            def flush(self):
                pass
        editor = support.load_module(EDITOR, "spec_edit_console")
        stream = LegacyStream()
        with mock.patch.object(sys, "stdout", stream):
            status = editor.main(["--spec", str(self.spec), "show"])
        self.assertIn(status, (0, 1, 2))
        self.assertTrue(stream.parts)
        self.edit("source", "add", "--url", "https://workshop.example/unicode", "--label", "تقرير 🔔", "--slide", "s02")
        stream = LegacyStream()
        with mock.patch.object(sys, "stdout", stream):
            editor.main(["--spec", str(self.spec), "show", "--format", "json"])
        parsed = json.loads("".join(stream.parts))
        self.assertTrue(any(s.get("location") == "تقرير 🔔" for s in parsed["sources"]))
        stream = LegacyStream()
        with mock.patch.object(sys, "stdout", stream):
            lane.main(["--spec", str(self.spec), "--fill", str(self.fill), "--format", "json"])
        self.assertIn("qa", json.loads("".join(stream.parts)))

    def test_all_cta_kinds_keyword_delivery_and_caption_asset(self):
        for kind in ("save", "send", "follow", "question"):
            self.edit("cta", "--kind", kind, "--title", "خطوتك القادمة", "--text", "اختر الخطوة المناسبة.")
            self.assertEqual(self.read()["slides"][-1]["cta"]["kind"], kind)
        self.edit("cta", "--kind", "keyword-dm", "--text", "اكتب «جدول».", status=64)
        self.edit("caption", "--field", "asset", "--keyword", "جدول", "--delivery", "instant", "--description", "جدول العمل")
        self.edit("cta", "--kind", "keyword-dm", "--text", "اكتب «جدول».")
        self.assertEqual(self.read()["captionPack"]["asset"]["keyword"], "جدول")

    def test_cover_quote_replacement_is_simultaneous_and_idempotent(self):
        self.edit("cover", "--headline", "موعد واضح ومناسب")
        self.parse("--spec", str(self.spec), "--fill", str(self.fill))
        self.assertEqual(self.read()["captionPack"]["firstLine"], "عنوان «موعد واضح ومناسب»")

    def test_approved_design_import_and_refused_system_fields(self):
        patch = self.root / "approved-design.json"
        data = {"post": {"assets": [{"id": "plate-one", "kind": "image", "ref": "asset:plate-one", "aiGenerated": False}]},
                "slides": {"s02": {"media": {"slot": "plate", "assetId": "plate-one"}}}}
        patch.write_text(json.dumps(data), encoding="utf-8", newline="\n")
        self.edit("apply", "--file", str(patch))
        self.parse()
        self.assertEqual(self.read()["slides"][1]["media"], data["slides"]["s02"]["media"])
        for bad in ({"post": {"rev": 999}}, {"slides": {"s02": {"id": "s99"}}}, {"post": {"qa": {"status": "pass"}}}):
            before = self.spec.read_bytes()
            patch.write_text(json.dumps(bad), encoding="utf-8", newline="\n")
            self.edit("apply", "--file", str(patch), status=64)
            self.assertEqual(before, self.spec.read_bytes())

    def test_schema_validation_precedes_writes_and_partial_write_is_replayable(self):
        editor = support.load_module(EDITOR, "spec_edit_atomic")
        before = self.spec.read_bytes()
        real_write = lane.paths.write_json
        def fail_spec(path, value, **kwargs):
            if Path(path) == self.spec:
                raise OSError("simulated interrupted spec replacement")
            return real_write(path, value, **kwargs)
        with mock.patch.object(lane.paths, "write_json", side_effect=fail_spec), contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(editor.main(["--spec", str(self.spec), "style", "poster"]), 73)
        self.assertEqual(before, self.spec.read_bytes())
        self.parse()
        self.assertEqual(self.read()["style"]["presetId"], "poster@1.0")


if __name__ == "__main__":
    unittest.main()
