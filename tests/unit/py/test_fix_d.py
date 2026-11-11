"""Package D: entity readability and the mixed-list QA fallback, using canonical helpers."""
import unittest
import b7_support as support


def setUpModule():
    global free, qa
    support.prepare("carousel-design")
    from _cs import free, qa


def tearDownModule():
    support.cleanup()


class PackageDTests(unittest.TestCase):
    def test_entity_only_tone_panels_are_readable(self):
        for entity in ("&#1634;", "&#x662;", "&eacute;", "&#65;"):
            with self.subTest(entity=entity):
                errors, notes = free.check_html('<div data-tone="field">' + entity + '</div>', {"id": "s03"})
                self.assertEqual(errors, [])
                self.assertEqual(notes, [])

    def test_empty_entities_do_not_make_a_panel_readable(self):
        for entity in ("&nbsp;", "&amp;", "&#32;"):
            errors, _ = free.check_html('<div data-tone="field">' + entity + '</div>', {"id": "s03"})
            self.assertTrue(any("readable panel" in e for e in errors))

    def test_entities_still_cannot_fill_a_picture(self):
        for entity in ("&#1634;", "&amp;", "&lt;"):
            errors, _ = free.check_html('<div data-picture="photo">' + entity + '</div>', {"id": "s03"})
            self.assertTrue(any("placeholder must be empty" in e for e in errors))

    def test_escaped_less_than_remains_valid_literal_text(self):
        self.assertEqual(free.check_html('<p>2 &lt; 3</p>', {"id": "s03"})[0], [])

    def test_mixed_unnumbered_lists_use_the_combined_count(self):
        for architecture in ("listicle", "steps"):
            spec = {"format": "carousel", "architecture": architecture,
                    "locale": {"dialect": "eg"}, "slides": [
                        {"id": "s01", "type": "cover", "headline": "5 خطوات واضحة"},
                        *[{"id": "s0" + str(i + 2), "type": kind, "title": "عنوان", "body": "نص"}
                          for i, kind in enumerate(("item", "step", "item", "step", "step"))]]}
            def findings():
                return [r for r in qa.run_text_gates(spec, gates=["C6"]) if r["rule"] == "C6.list-count"]
            self.assertEqual(findings(), [], architecture)
            spec["slides"][0]["headline"] = "4 خطوات واضحة"
            self.assertEqual(findings()[0]["sev"], "BLOCK")


if __name__ == "__main__":
    unittest.main()
