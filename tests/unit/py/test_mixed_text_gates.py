"""Regressions for plain mixed copy and the encoding policy, with fresh fixtures."""
import unittest
try:
    import b7_support as support
except ImportError:
    from . import b7_support as support


def setUpModule():
    global lint, qa
    support.prepare("carousel-design")
    from _cs import lint, qa


def tearDownModule():
    support.cleanup()


class MixedTextTests(unittest.TestCase):
    def test_safe_check_loop_records_actual_changes_and_can_be_disabled(self):
        original = "نص\x01  آخر"
        repaired = lint.check_text(original)
        self.assertEqual(repaired["fixed"], "نص آخر")
        self.assertEqual(repaired["issues"], [])
        self.assertTrue(repaired["applied"])
        self.assertEqual(lint.check_text(original, autofix=False)["fixed"], original)
        self.assertEqual(lint.check_text(original, autofix=False)["applied"], [])

    def test_input_normalisation_keeps_joining_intent(self):
        from _cs.text import render_input
        self.assertEqual(render_input("\u2066Opus\x01\u202f5.5\u2069"), "Opus 5.5")
        self.assertEqual(render_input("نص\u200c\u200d"), "نص\u200c\u200d")

    def test_field_walk_keeps_literal_dots_in_metadata_keys(self):
        spec = {"style": {"overrides": {"roles.accent": "#123\x01"}},
                "slides": [{"id": "s01", "type": "item", "overrides": {"type.body.family": "face\x01"}}]}
        fields = [(sid, el, value) for sid, el, value, _ in lint.iter_spec_fields(spec)]
        for sid, el, value in fields:
            fixed = lint.check_text(value)["fixed"]
            lint.set_spec_field(spec, sid, el, fixed)
        self.assertEqual(spec["style"]["overrides"]["roles.accent"], "#123")
        self.assertEqual(spec["slides"][0]["overrides"]["type.body.family"], "face")

    def test_metadata_is_not_language_copy_and_bad_unicode_is_reviewable(self):
        import json
        self.assertFalse(lint.copy_field(None, "sources.0.ref"))
        self.assertFalse(lint.copy_field("s01", "free.css"))
        self.assertTrue(lint.copy_field("s01", "body"))
        self.assertEqual(lint.encoding_issues("https://مثال.کوم/٥"), [])
        value = {"body": "نص\ud800"}
        encoded = lint.json_text(value)
        self.assertIn("نص", encoded)
        self.assertEqual(json.loads(encoded), value)
        self.assertTrue(any(i["rule"] == "ORTHO-ENC-007" for i in lint.lint_text("نص\x01", allow=["\x01"])))

    def test_binding_and_percent_repairs_accept_pasted_spaces(self):
        for value in ("لـ\u202fGoogle", "لـ\u2009Google", "بـ @الاسم"):
            result = lint.check_text(value)
            self.assertEqual(result["fixed"], value.replace("\u202f", "").replace("\u2009", "").replace(" ", ""))
        self.assertEqual(lint.check_text("خصم 50\u2009٪")["fixed"], "خصم 50\u2009%")

    def test_urls_are_opaque_to_language_repairs(self):
        value = "رابط https://مثال.کوم/نص,نص"
        self.assertEqual(lint.check_text(value)["fixed"], value)
        self.assertTrue(any(i["rule"] == "ORTHO-ENC-007" for i in lint.lint_text("https://مثال.کوم/نص\x01")))

    def test_bindings_are_rendered_not_stored(self):
        self.assertFalse([f for f in lint.lint_text("20 عقد وOpus 5.5") if f["rule"] == "ORTHO-BIDI-002"])

    def test_encoding_blocks_controls_and_unassigned(self):
        for ch in ("\x01", "\x81", "\u0378", "\ud800"):
            issues = [f for f in lint.lint_text("Opus" + ch + " 5.5") if f["rule"] == ("ORTHO-ENC-007" if ch in ("\x01", "\x81") else "ORTHO-ENC-008")]
            self.assertEqual(len(issues), 1, repr(ch))
            self.assertEqual(issues[0]["sev"], "BLOCK")
        spec = {"slides": [{"id": "s01", "type": "cover", "headline": "عنوان"}],
                "captionPack": {"body": "Opus\x01 5.5", "perSlide": ["نص\x01"], "alt": ["وصف\x01"]},
                "ext": {"note": "نص\x01"}}
        findings = qa.run_text_gates(spec, gates=["O1"])
        self.assertEqual(len([f for f in findings if f["rule"] == "O1.ortho-enc-007"]), 4)

    def test_connectors_and_marked_verb(self):
        for text in ("الـAPI،", "بـ@الاسم", "بـ50%", "وبـ50%"):
            self.assertFalse([f for f in lint.lint_text(text) if f["rule"] == "ORTHO-TATWEEL-001"], text)
        self.assertFalse([f for f in lint.lint_text("تجرّبه") if f["rule"] == "ORTHO-TAA-001"])

