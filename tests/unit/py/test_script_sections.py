"""Where a pasted script is cut into slides: a numbered line inside a slide is copy, and nothing before a slide is lost silently."""
from __future__ import annotations

import unittest

try:
    import b7_support as support
except ImportError:
    from . import b7_support as support


def setUpModule():
    global lane
    lane = support.load_script("carousel-create", "script_to_spec.py", "script_to_spec")


def sections(raw: str, notes: list | None = None) -> list[list[str]]:
    return [[line for line in sec if line.strip()] for sec in lane.split_sections(raw, notes)]


class SectionBoundaryTests(unittest.TestCase):
    def test_a_numbered_list_inside_a_separated_slide_is_copy(self):
        raw = "٣ خطوات تغير يومك\nوبسهولة\n---\nالخطوات\n1. افتح الإعدادات\n2. اضغط حفظ\n3. ارجع للبداية\n---\nشاركه مع صاحبك\n"
        got = sections(raw)
        self.assertEqual(len(got), 3)
        self.assertEqual(got[0], ["٣ خطوات تغير يومك", "وبسهولة"])
        self.assertEqual(got[1], ["الخطوات", "1. افتح الإعدادات", "2. اضغط حفظ", "3. ارجع للبداية"])

    def test_a_range_is_not_a_slide_number(self):
        self.assertEqual(sections("عنوان الغلاف\n---\nالتمرين\n٥ - ١٠ دقايق\n"), [["عنوان الغلاف"], ["التمرين", "٥ - ١٠ دقايق"]])

    def test_a_number_out_of_sequence_or_in_another_style_stays_in_its_slide(self):
        raw = "١ — الكافر\nعنوان قوي\n٢ — الفكرة\nكلام\n20: دقيقة تكفي\n٣ — القفلة\nاحفظ البوست\n"
        got = sections(raw)
        self.assertEqual([s[0] for s in got], ["١ — الكافر", "٢ — الفكرة", "٣ — القفلة"])
        self.assertIn("20: دقيقة تكفي", got[1])
        inner = "١ — الكافر\nعنوان\n٢ — الخطوات\n1. افتح\n2. اضغط\n3. ارجع\n٣ — القفلة\nاحفظ\n"
        got = sections(inner)
        self.assertEqual(len(got), 3)
        self.assertEqual(got[1], ["٢ — الخطوات", "1. افتح", "2. اضغط", "3. ارجع"])

    def test_instructions_before_slide_one_are_dropped_with_a_note_and_an_unnumbered_cover_is_kept(self):
        notes: list = []
        got = sections("حول الخبر دا لكاروسيل:\n1. الغلاف\nعنوان\n2. الفكرة\nكلام\n3. القفلة\nاحفظ\n", notes)
        self.assertEqual([s[0] for s in got], ["1. الغلاف", "2. الفكرة", "3. القفلة"])
        self.assertEqual(len(notes), 1)
        self.assertIn("حول الخبر دا لكاروسيل", notes[0])
        notes = []
        got = sections("عنوان الغلاف\nسطر تاني\n2. الفكرة\nكلام\n3. القفلة\nاحفظ\n", notes)
        self.assertEqual(got[0], ["عنوان الغلاف", "سطر تاني"])
        self.assertEqual(notes, [])

    def test_the_formats_creators_paste_still_split(self):
        self.assertEqual(len(sections("١ | الغلاف\nعنوان\n٢ | أهم المميزات\n* واحد\n* اتنين\n٣ | القفلة\nاحفظ\n")), 3)
        self.assertEqual(len(sections("**سلايد ١ — الغلاف**\nعنوان\n**سلايد ٢ — نتيجة**\nكلام\n**سلايد ٣ — القفلة**\nاحفظ\n")), 3)
        self.assertEqual(len(sections("① الغلاف\nعنوان\n② الفكرة\nكلام\n③ القفلة\nاحفظ\n")), 3)

    def test_every_word_of_a_separated_script_reaches_a_section(self):
        raw = "٣ خطوات تغير يومك\nوبسهولة\n---\nالخطوات\n1. افتح الإعدادات\n2. اضغط حفظ\n---\n20: دقيقة تكفي\nشاركه مع صاحبك\n"
        kept = [line for sec in sections(raw) for line in sec]
        self.assertEqual(kept, [line for line in raw.split("\n") if line.strip() and line.strip() != "---"])


if __name__ == "__main__":
    unittest.main()
