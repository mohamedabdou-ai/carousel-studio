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
    def test_intro_and_caption_rules_do_not_disable_numbered_slide_headings(self):
        numbered = "1. وقف هنا\nنقطة البداية\n2. السبب\nتفصيل\n3. احفظ الفكرة"
        for prefix, suffix in (("مقدمة\n---\n", ""), ("", "\n---\nالكابشن"),
                               ("مقدمة\n---\n", "\n---\nالكابشن")):
            with self.subTest(prefix=prefix, suffix=suffix):
                got = sections(prefix + numbered + suffix)
                self.assertEqual(got, ([["مقدمة"]] if prefix else []) + [
                    ["1. وقف هنا", "نقطة البداية"], ["2. السبب", "تفصيل"], ["3. احفظ الفكرة"]
                ] + ([["الكابشن"]] if suffix else []))

    def test_rules_between_slides_keep_their_numbered_lists_as_copy(self):
        raw = "الغلاف\n---\nالخطوات\n1. افتح\n2. اضغط\n---\nالمراجعة\n1. راجع\n2. احفظ\n---\nالقفلة"
        self.assertEqual(sections(raw), [["الغلاف"], ["الخطوات", "1. افتح", "2. اضغط"],
                                         ["المراجعة", "1. راجع", "2. احفظ"], ["القفلة"]])

    def test_numbered_headings_can_start_with_digits_in_both_digit_systems(self):
        for raw, heads in (
            ("1. وقف\n2. السبب\n3. 5 أخطاء شائعة\n4. الحل", ["1. وقف", "2. السبب", "3. 5 أخطاء شائعة", "4. الحل"]),
            ("١ — ٥ أفكار\n٢ — السبب\n٣ — ٢ حلول\n٤ — احفظ", ["١ — ٥ أفكار", "٢ — السبب", "٣ — ٢ حلول", "٤ — احفظ"]),
        ):
            with self.subTest(raw=raw):
                self.assertEqual(sections(raw), [[h] for h in heads])

    def test_real_dash_ranges_stay_in_their_slide(self):
        for value in ("٥ - ١٠ دقايق", "5 – 10 minutes", "5 — 10 minutes", "5 - 10 to 15 minutes"):
            with self.subTest(value=value):
                self.assertEqual(sections("1. الغلاف\n2. التمرين\n" + value + "\n3. احفظ"),
                                 [["1. الغلاف"], ["2. التمرين", value], ["3. احفظ"]])

    def test_a_caption_numbered_list_does_not_disable_slide_numbering(self):
        for label in ("Caption", "الكابشن", "**كابشن:**"):
            with self.subTest(label=label):
                raw = "1. الغلاف\n2. التمرين\n3. احفظ\n---\n" + label + "\n1. فكرة\n2. خطوة"
                self.assertEqual(sections(raw), [["1. الغلاف"], ["2. التمرين"], ["3. احفظ"],
                                                 [label, "1. فكرة", "2. خطوة"]])

    def test_a_range_does_not_consume_the_following_actual_ordinal(self):
        for raw in ("1 - Cover\n2 - Exercise\n3 - 5 minutes\n3 - Save this",
                    "١ — الغلاف\n٢ — التمرين\n٣ — ٥ دقايق\n٣ — احفظ"):
            with self.subTest(raw=raw):
                lines = raw.splitlines()
                self.assertEqual(sections(raw), [[lines[0]], lines[1:3], [lines[3]]])

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
