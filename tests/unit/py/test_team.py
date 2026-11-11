"""The creative team's production board (board_check.py) and the places its rules are written down.

The board is the team's one record per post. These tests build a valid board stage by stage, break one rule at a time and check that
the checker names it, and they keep the role files, the charter and the checker from drifting apart.
"""
from __future__ import annotations

import contextlib
import io
import json
import re
import shutil
import subprocess
import tempfile
import unittest
from datetime import date
from pathlib import Path

import b7_support as support

REPO = Path(__file__).resolve().parents[3]
TEAM = REPO / "team"
BC = None
TODAY = date(2026, 10, 22)        # the day the platform facts are judged on, so these tests do not age


def setUpModule():
    global BC
    BC = support.load_script("carousel-create", "board_check.py")


def tearDownModule():
    support.cleanup()


BRIEF = """الفكرة الكبيرة: الغلط مش في البرومبت، الغلط إنك بتبدأ من شات فاضي
العدو: نصيحة «اكتب برومبت أطول»
الجمهور ولحظته: صاحب مشروع صغير بيسكرول 11 بالليل وفي باله إن الذكاء الاصطناعي بيضيّع وقته
الهدف: حفظ — عشان يرجعله لما يكتب برومبت
الوعي: عارف المشكلة
بيتش آمن: P3 · reveal · «5 أخطاء في البرومبت» — الأخطاء الخمسة مرتبة
بيتش جريء: F17 · enemy · «بطّل تكتب برومبتات» — ابدأ من السياق مش من الأمر — المخاطرة: ممكن يتفهم إنه ضد البرومبت
عائلات الهوك: P3, F17, P4, P1
النبرة واللهجة: مصري، ودود وعملي، جمل قصيرة
الاتجاه البصري: swiss + الرقم البطل + counter
معايير النجاح: الغلاف بيتقري في 130px، سلايد 2 فيها أول فايدة، اللجنة توصل لآخر سلايد
القيود: 10 سلايدات، كل رقم بمصدر، لهجة واحدة، أرقام 123
حقائق المنصة: reserve-from-slide-2، edit-after-publish"""

PITCH = """| الاتجاه | سطر الغلاف | الفكرة | العائلة | الحركة | اللجنة |
|---|---|---|---|---|---|
| آمن | 5 أخطاء في البرومبت | الأخطاء مرتبة | P3 | reveal | 1/3 |
| جريء | بطّل تكتب برومبتات… ابدأ من هنا | السياق قبل الأمر | F17 | enemy | 2/3 |
القرار: جريء — السبب: اتنين من تلاتة وقفوا عنده
اختيار المبدع: جريء"""

PERSONAS = """- [الأساسي] سلمى · القاهرة، مصر · 25 إلى 30 (تقدير) · مصري · واجهة عربي · لحظتها: 11 بالليل في السرير · عايز: توفير وقت · بيتضايق من: كلام نظري · من: audience.persona، audience.pains[0]
- [المتشكك] أبو فهد · الرياض، السعودية · 35 إلى 40 (تقدير) · خليجي · واجهة عربي · لحظتها: بين اجتماعين في العربية · عايز: نتيجة سريعة · بيتضايق من: الوعود · من: audience.persona، audience.objections[0]
- [الامتداد] لينا · عمّان، الأردن · 20 إلى 24 (تقدير) · شامي · واجهة إنجليزي · لحظتها: في الباص للجامعة · عايز: تتعلم من الصفر · بيتضايق من: المصطلحات · من: locale.countries"""

HOOKS = [("h01", "P3", "5 أخطاء بتموّت الكاروسيل", "ok", "71.5"), ("h02", "P3", "الغلطة الأغلى في البرومبت", "ok", "64.0"), ("h03", "P3", "ليه برومبتك بيفشل", "fail", "30.0"),
         ("h04", "F17", "مش برومبت… ده سياق", "ok", "68.0"), ("h05", "F17", "مش طول… ده وضوح", "ok", "60.0"),
         ("h06", "P4", "بطّل تكتب برومبتات… ابدأ من هنا", "ok", "74.0"), ("h07", "P4", "البرومبت الطويل خرافة", "ok", "66.0"), ("h08", "P4", "أطول برومبت أضعف نتيجة", "ok", "58.0"),
         ("h09", "P1", "3 أسطر بتغيّر ردود الذكاء الاصطناعي", "ok", "69.0"), ("h10", "P1", "4 جمل قبل أي برومبت", "ok", "61.0"),
         ("h11", "P15", "جرّبت 20 برومبت ورتّبتهم", "ok", "67.0"), ("h12", "P15", "رتّبت 12 برومبت من الأسوأ", "ok", "59.0")]


def duel(hooks=HOOKS, champions="h01 · h04 · h06 · h09 · h11", podium="1 h06 · 2 h01 · 3 h04"):
    rows = "\n".join("| %s | %s | %s | %s | %s |" % h for h in hooks)
    return ("| id | العائلة | الغلاف | البوابات | الدرجة |\n|---|---|---|---|---|\n" + rows + "\n"
            "أبطال العائلات: %s\n"
            "أصوات اللجنة: h01 1/3 · h04 2/3 · h06 3/3 · h09 2/3 · h11 1/3\n"
            "القراءة الباردة: h01 2/3 · h04 1/3 · h06 3/3 · h09 3/3 · h11 2/3\n"
            "| الجولة | أ | ب | الفائز | السبب |\n|---|---|---|---|---|\n"
            "| R1.1 | h01 | h11 | h01 | الوضوح 2/3 مقابل 2/3 ثم الأصوات 1/3 مقابل 1/3 ثم الدرجة |\n"
            "| R1.2 | h04 | h09 | h04 | الأصوات 2/3 مقابل 2/3 والفجوة أوضح |\n"
            "| R2.1 | h04 | h06 | h06 | الوضوح 3/3 مقابل 1/3 |\n"
            "| R2.2 | h01 | h06 | h06 | الوضوح 3/3 مقابل 2/3 |\n"
            "المنصة: %s") % (champions, podium)


SWIPE = """| الشخصية | العمق | الجذب | وقفت عند | السبب | النية |
|---|---|---|---|---|---|
| سلمى | 10/10 | 3,3,2,3,2,2,3,3,2,3 | - | - | حفظ — لما أجي أكتب بوست |
| أبو فهد | 4/10 | 3,2,1,0 | s04 | «المثال ده معاد» — مفيش فايدة جديدة | لا شيء — مش شغلي |
| لينا | 10/10 | 3,3,3,2,2,3,2,2,3,2 | - | - | إرسال — لصاحبتي اللي بتصمم |
القراء لكل سلايد: 3,3,3,3,2,2,2,2,2,2
أضعف انتقال: s04→s05 — متوسط الجذب 1.7
الإصلاح: s04→s05 — جسر جديد / أول سطر جديد — أبو فهد وقف لأن المثال معاد"""

REVIEW = """المرحلة: script
الفكرة 4 — العدو واضح: نصيحة «اكتب برومبت أطول»
الهوك 5 — فاز بالوضوح 3/3 والتلاتة وقفوا
التدفق 4 — وصل 2 من 3 لآخر سلايد
القيمة 4 — سلايد 6 قابل للتصوير
الصوت 5 — المدقق PASS
الصنعة 4 — الكلمات قليلة والحركة مخططة
الدليل 4 — كل الأرقام بمصادر
الدعوة 5 — دعوة حفظ بعد الفايدة
الحكم: SHIP"""

FINAL_REVIEW = (REVIEW.replace("المرحلة: script", "المرحلة: final") + "\nغلاف 130px: 3 من 3 وقفوا\nQA: ok\nالمدير الفني: PASS"
                "\nالوعد: الرقم 5 بيتقري على بلاطة 130px — ✓ — «5» واضح على contact-sheet.png (cover tile)")

HUDDLE = """الستايل: creator — بدائل: poster (حكم واضح)، notebook (قايمة بتتحفظ) — اختبار V1: creator ok
عنصر البطل: الرقم 5 | الاستعارة: عدّاد بيقف | المدير الفني ✓
عنصر البطل: الرقم 5 | الاستعارة: عدّاد بيقف | الوصفة: counter (رقم في الغلاف) | مصمم الحركة ✓
الخطة البصرية — visual-plan.md
سلايد 2 — الهيكل: B — المرساة: رقم — الجسر: لكن…
التصميم الحر: free/s02.html + free/s02.css merged into spec.json
ورقة المراجعة: out-design/sheet.png — Read checked
0.0s — الغلاف كامل: الرقم 5 كبير
0.4s — يتفكك: الكلمات تطير
1.5s — الرقم 5 بيتبنى
3.0s — العدّاد بيعدّ
4.5s — الكلمات بتتجمع
5.9s — الغلاف كامل، نفس الإطار الأول"""

DECISIONS = ("- R2 · البيتش: جريء — السبب: اتنين من تلاتة وقفوا عنده\n- R3 · الهوك: h06 — السبب: الوضوح 3/3\n"
             "- وعد: الرقم 5 بيتقري على بلاطة 130px — يتأكد على contact-sheet.png (cover tile)")

CARDS = """من: cs-copywriter → إلى: cs-arabic-editor
سلّمت: السكريبت في spec.json
قرارات خدتها وليه: اخترت الجريء لأن اللجنة وقفت عنده
محتاج منك: PASS أو VETO
مخاطر / أسئلة مفتوحة: لا يوجد
ثقتي: عالية"""

LOG = {"director": "الفكرة: الغلط في البداية من شات فاضي. العدو: اكتب برومبت أطول.", "pitch": "الجريء كسب: اتنين من تلاتة وقفوا عنده.",
       "duel": "12 هوك ← فاز h06 لأنه اتفهم عند التلاتة.", "swipe": "أبو فهد وقف عند 4 ← اتعدّل.", "editor": "PASS بعد تصحيح همزتين.",
       "design": "سويس، الرقم البطل، حركة العدّاد، والمراجعة النهائية SHIP."}


def log_block(keys=tuple(LOG)):
    return "\n".join("- %s: %s" % (k, LOG[k]) for k in keys)


def board(stage="final", **over):
    """A valid board up to `stage`; `over` replaces a section's body (or None drops it) and 'head' replaces the header lines."""
    head = over.pop("head", "# لوحة الإنتاج — post-20261022-0001 · أخطاء البرومبت\n<!-- cs-board v1 -->\nmode: guided · dialect: eg · digits: western · slides: 10\n"
                   "loops: pitch 0/1 · duel 0/1 · editor 1/2 · swipe 1/1 · script 0/2 · huddle 0/1 · review 0/2\n")
    bodies = {"brief": BRIEF}
    order = ["brief", "pitch", "personas", "duel", "editor", "swipe", "review", "huddle", "decisions", "cards", "log"]
    bodies.update({"pitch": PITCH, "personas": PERSONAS, "decisions": DECISIONS, "cards": CARDS})
    bodies.update({"duel": duel(), "editor": "الحكم: PASS\nالجولة: 1 من 2", "swipe": SWIPE, "review": REVIEW})
    bodies["huddle"] = HUDDLE
    bodies["log"] = log_block(("director", "pitch", "duel", "swipe", "editor")) if stage in ("room", "huddle") else log_block(("director", "pitch"))
    if stage == "final":
        bodies["review"], bodies["log"] = FINAL_REVIEW, log_block()
    upto = BC.STAGES.index(stage)
    keep = {"brief": 0, "pitch": 1, "personas": 1, "decisions": 1, "cards": 1, "duel": 2, "editor": 2, "swipe": 2, "review": 2, "huddle": 3, "log": 1}
    out = [head]
    for sid in order:
        if keep[sid] > upto:
            continue
        body = over.get(sid, bodies[sid])
        if body is None:
            continue
        out.append("\n## عنوان {#%s}\n%s" % (sid, body))
    return "\n".join(out) + "\n"


def codes(report):
    return sorted({i["code"] for i in report.items})


def run(text, stage="final", spec=None):
    return BC.check_board(text, stage, spec, TODAY)


class TestValidBoard(unittest.TestCase):
    def test_a_good_board_passes_at_every_stage(self):
        for stage in ("brief", "pitch", "room", "huddle", "final"):
            rep = run(board(stage), stage)
            self.assertEqual(rep.items, [], "%s: %s" % (stage, rep.items))

    def test_arabic_indic_digits_are_read_like_western_ones(self):
        text = board("room").replace("slides: 10", "slides: ١٠").replace("1/3", "١/٣")
        self.assertEqual(run(text, "room").items, [])

    def test_a_later_stage_needs_what_the_earlier_ones_need(self):
        rep = run(board("pitch"), "room")
        self.assertIn("T07", codes(rep))
        self.assertEqual(sorted(i["where"] for i in rep.items if i["code"] == "T07"), ["duel", "editor", "review", "swipe"])


class TestBriefAndPitch(unittest.TestCase):
    def test_two_beat_question_covers_use_the_shared_hero_definition(self):
        for cover, count in (("هل جدولك واضح؟ هذه بقية الفكرة في كلمات", 3), ("Is this clear? Here is the second beat", 3), ("نتيجة واضحة! تفاصيل الفكرة تأتي هنا", 2)):
            self.assertEqual(BC.hero_of(cover), count)
            pitch = PITCH.replace("5 أخطاء في البرومبت", cover)
            self.assertNotIn("T23", codes(run(board("pitch", pitch=pitch), "pitch")))

    def test_the_marker_and_the_loop_counters(self):
        self.assertIn("T01", codes(run(board("brief", head="# x\nmode: guided · dialect: eg · digits: western\nloops: pitch 0/1 · duel 0/1 · editor 0/2 · swipe 0/1 · script 0/2 · huddle 0/1 · review 0/2\n"), "brief")))
        over = board("room").replace("editor 1/2", "editor 3/2")
        self.assertIn("T05", codes(run(over, "room")))
        wrong = board("room").replace("swipe 1/1", "swipe 1/2")
        self.assertIn("T04", codes(run(wrong, "room")))

    def test_two_directions_from_different_families_and_moves(self):
        same_family = BRIEF.replace("بيتش جريء: F17", "بيتش جريء: P3")
        self.assertIn("T13", codes(run(board("brief", brief=same_family), "brief")))
        same_move = BRIEF.replace("F17 · enemy", "F17 · reveal")
        self.assertIn("T13", codes(run(board("brief", brief=same_move), "brief")))
        no_label = BRIEF.replace("العدو: نصيحة «اكتب برومبت أطول»\n", "")
        self.assertIn("T10", codes(run(board("brief", brief=no_label), "brief")))
        no_risk = BRIEF.replace(" — المخاطرة: ممكن يتفهم إنه ضد البرومبت", "")
        self.assertIn("T14", codes(run(board("brief", brief=no_risk), "brief")))

    def test_the_pitch_table(self):
        rep = run(board("pitch", pitch=PITCH.replace("| F17 |", "| P3 |")), "pitch")
        self.assertIn("T24", codes(rep))
        rep = run(board("pitch", pitch=PITCH.replace("| 2/3 |", "| 2 |")), "pitch")
        self.assertIn("T22", codes(rep))
        rep = run(board("pitch", pitch=PITCH.replace(" — السبب: اتنين من تلاتة وقفوا عنده", "")), "pitch")
        self.assertIn("T25", codes(rep))
        rep = run(board("room", pitch=PITCH.replace("اختيار المبدع: جريء", "")), "room")
        self.assertIn("T26", codes(rep))

    def test_three_personas_with_nine_fields(self):
        two = "\n".join(PERSONAS.split("\n")[:2])
        self.assertIn("T30", codes(run(board("pitch", personas=two), "pitch")))
        thin = PERSONAS.replace(" · لحظتها: 11 بالليل في السرير", "")
        self.assertIn("T32", codes(run(board("pitch", personas=thin), "pitch")))
        self.assertIn("T31", codes(run(board("pitch", personas=PERSONAS.replace("[المتشكك]", "[غريب]")), "pitch")))


class TestDuel(unittest.TestCase):
    def test_twelve_hooks_four_families_three_per_family(self):
        short = duel(HOOKS[:11])
        self.assertIn("T41", codes(run(board("room", duel=short), "room")))
        three_families = [(h[0], {"P1": "P3", "P15": "F17"}.get(h[1], h[1]), *h[2:]) for h in HOOKS]
        self.assertIn("T42", codes(run(board("room", duel=duel(three_families)), "room")))

    def test_champions_are_one_per_surviving_family(self):
        rep = run(board("room", duel=duel(champions="h01 · h02 · h06 · h09 · h11")), "room")
        self.assertIn("T44", codes(rep))
        rep = run(board("room", duel=duel(champions="h01 · h04 · h06 · h09 · h03")), "room")
        self.assertIn("T44", codes(rep))

    def test_the_knockout_must_finish_with_a_reason_per_duel(self):
        text = duel().replace("| R2.2 | h01 | h06 | h06 | الوضوح 3/3 مقابل 2/3 |\n", "")
        self.assertIn("T46", codes(run(board("room", duel=text), "room")))
        text = duel().replace("| R2.1 | h04 | h06 | h06 |", "| R2.1 | h04 | h06 | h09 |")
        self.assertIn("T47", codes(run(board("room", duel=text), "room")))
        text = duel().replace("| h01 | h11 | h01 | الوضوح 2/3 مقابل 2/3 ثم الأصوات 1/3 مقابل 1/3 ثم الدرجة |", "| h01 | h11 | h01 | - |")
        self.assertIn("T48", codes(run(board("room", duel=text), "room")))

    def test_the_podium_is_three_families_led_by_the_final_winner(self):
        self.assertIn("T49", codes(run(board("room", duel=duel(podium="1 h06 · 2 h01 · 3 h02")), "room")))
        self.assertIn("T49", codes(run(board("room", duel=duel(podium="1 h01 · 2 h06 · 3 h04")), "room")))

    def test_the_panels_votes_and_cold_reads_cover_every_champion(self):
        text = duel().replace("أصوات اللجنة: h01 1/3 · h04 2/3 · h06 3/3 · h09 2/3 · h11 1/3", "أصوات اللجنة: h01 1/3 · h04 2/3")
        self.assertIn("T45", codes(run(board("room", duel=text), "room")))


class TestWhatTheFirstReviewFoundMissing(unittest.TestCase):
    """Process fixes from the independent creative director's review of the first dogfood post."""

    def test_the_brief_names_the_platform_facts_it_rests_on(self):
        none = BRIEF.replace("\nحقائق المنصة: reserve-from-slide-2، edit-after-publish", "")
        self.assertEqual([i["severity"] for i in run(board("brief", brief=none), "brief").items if i["code"] == "T17"], ["fix"])
        nothing = BRIEF.replace("reserve-from-slide-2، edit-after-publish", "لا يوجد")
        self.assertEqual(run(board("brief", brief=nothing), "brief").items, [])
        unknown = BRIEF.replace("edit-after-publish", "made-up-fact")
        self.assertEqual([i["severity"] for i in run(board("brief", brief=unknown), "brief").items if i["code"] == "T17"], ["error"])
        self.assertIn("T17", codes(run(board("brief", brief=BRIEF.replace("reserve-from-slide-2، edit-after-publish", "غير معروف")), "brief")))

    def test_an_open_platform_fact_caps_proof_at_three(self):
        unverified = BRIEF.replace("reserve-from-slide-2، edit-after-publish", "swipe-mirrors-app-language")      # status unverified in the register
        self.assertIn("T77", codes(run(board("room", brief=unverified), "room")))
        capped = REVIEW.replace("الدليل 4", "الدليل 3").replace("الحكم: SHIP", "الحكم: REVISE\nملاحظة لـcs-strategist: تحقّق من حقيقة المنصة")
        self.assertNotIn("T77", codes(run(board("room", brief=unverified, review=capped), "room")))
        # a verified fact goes stale: edit-after-publish is good for 120 days from 2026-10-22
        stale = BC.check_board(board("room"), "room", None, date(2027, 3, 1))
        self.assertIn("T77", codes(stale))
        self.assertNotIn("T77", codes(BC.check_board(board("room"), "room", None, date(2027, 1, 1))))

    def test_derived_facts_do_not_cap_proof_even_without_a_verification_date(self):
        derived = BRIEF.replace("reserve-from-slide-2، edit-after-publish", "counter-pill-and-icons")
        self.assertNotIn("T77", codes(run(board("room", brief=derived), "room")))
        self.assertFalse(BC.is_open({"status": "derived"}, date(2030, 1, 1)))

    def test_two_of_three_personas_are_the_brands_own_audience(self):
        drift = PERSONAS.replace("من: audience.persona، audience.objections[0]", "من: audience.objections[0]")
        self.assertEqual([i["severity"] for i in run(board("pitch", personas=drift), "pitch").items if i["code"] == "T34"], ["fix"])
        self.assertNotIn("T34", codes(run(board("pitch"), "pitch")))

    def test_a_duel_where_the_leader_and_the_favourite_differ_needs_a_hybrid(self):
        split = duel().replace("أصوات اللجنة: h01 1/3 · h04 2/3 · h06 3/3 · h09 2/3 · h11 1/3", "أصوات اللجنة: h01 1/3 · h04 2/3 · h06 1/3 · h09 3/3 · h11 1/3")
        self.assertIn("T4A", codes(run(board("room", duel=split), "room")))
        hybrid = split.replace("المنصة:", "الهجين: h09 — «3 أسطر… بتغيّر ردود الذكاء الاصطناعي» — يحمل: توتر h09 ورقم h06\nالمنصة:")
        self.assertNotIn("T4A", codes(run(board("room", duel=hybrid), "room")))
        bare = split.replace("المنصة:", "الهجين: h09\nالمنصة:")
        self.assertIn("T4A", codes(run(board("room", duel=bare), "room")))
        tie = duel().replace("h06 3/3", "h06 2/3")
        self.assertNotIn("T4A", codes(run(board("room", duel=tie), "room")), "the leader shares the top vote count: no split")

    def test_the_huddle_starts_from_a_ranked_style_shortlist(self):
        missing = "\n".join(HUDDLE.split("\n")[1:])
        self.assertIn("T85", codes(run(board("huddle", huddle=missing), "huddle")))
        self.assertIn("T85", codes(run(board("huddle", huddle=HUDDLE.replace("creator", "retro", 1)), "huddle")))
        self.assertIn("T85", codes(run(board("huddle", huddle=HUDDLE.replace("، notebook (قايمة بتتحفظ)", "")), "huddle")))
        self.assertIn("T85", codes(run(board("huddle", huddle=HUDDLE.replace("poster (حكم واضح)", "creator (نفس الستايل)")), "huddle")))
        self.assertIn("T85", codes(run(board("huddle", huddle=HUDDLE.replace("اختبار V1: creator ok", "اختبار V1: غير واضح")), "huddle")))

    def test_the_bold_move_is_in_frame_zero(self):
        gone = HUDDLE.replace("0.0s — الغلاف كامل: الرقم 5 كبير", "0.0s — الغلاف كامل: العنوان والخلفية")
        self.assertEqual([i["severity"] for i in run(board("huddle", huddle=gone), "huddle").items if i["code"] == "T84"], ["fix"])
        self.assertNotIn("T84", codes(run(board("huddle"), "huddle")))

    def test_the_final_review_rechecks_every_promise(self):
        no_ledger = FINAL_REVIEW.replace("\nالوعد: الرقم 5 بيتقري على بلاطة 130px — ✓ — «5» واضح على contact-sheet.png (cover tile)", "")
        self.assertIn("T79", codes(run(board("final", review=no_ledger), "final")))
        broken = FINAL_REVIEW.replace("— ✓ —", "— ✗ —")
        rep = run(board("final", review=broken), "final")
        self.assertEqual([i["severity"] for i in rep.items if i["code"] == "T79"], ["error"])
        self.assertEqual(run(board("final"), "final").items, [])
        silent = DECISIONS.split("\n- وعد:")[0]
        self.assertEqual(run(board("final", decisions=silent, review=no_ledger), "final").items, [], "no promise was made, so no ledger is owed")

    def test_craft_cannot_be_four_over_an_open_fix(self):
        over = FINAL_REVIEW.replace("المدير الفني: PASS", "المدير الفني: FIX")
        self.assertIn("T78", codes(run(board("final", review=over), "final")))
        over_qa = FINAL_REVIEW.replace("QA: ok", "QA: FIX")
        self.assertIn("T78", codes(run(board("final", review=over_qa), "final")))
        lowered = over.replace("الصنعة 4", "الصنعة 3").replace("الحكم: SHIP", "الحكم: REVISE\nملاحظة لـcs-art-director: الغلاف صغير عند 130px")
        self.assertNotIn("T78", codes(run(board("final", review=lowered), "final")))


class TestEditorAndSwipe(unittest.TestCase):
    def test_a_veto_stops_the_stage(self):
        rep = run(board("room", editor="الحكم: VETO\nالجولة: 2 من 2"), "room")
        self.assertIn("T51", codes(rep))
        self.assertIn("T52", codes(run(board("room", editor="الحكم: PASS\nالجولة: 3 من 2"), "room")))

    def test_the_pull_list_matches_the_depth(self):
        rep = run(board("room", swipe=SWIPE.replace("3,3,2,1,0", "3,3,2,1,0").replace("3,2,1,0", "3,2,1")), "room")
        self.assertIn("T61", codes(rep))

    def test_a_stop_has_a_zero_a_reason_and_a_fix(self):
        rep = run(board("room", swipe=SWIPE.replace("3,2,1,0", "3,2,1,2")), "room")
        self.assertIn("T62", codes(rep))
        rep = run(board("room", swipe="\n".join(l for l in SWIPE.split("\n") if not l.startswith("الإصلاح"))), "room")
        self.assertIn("T67", codes(rep))

    def test_intent_names_a_person_or_a_moment(self):
        rep = run(board("room", swipe=SWIPE.replace("إرسال — لصاحبتي اللي بتصمم", "إرسال")), "room")
        self.assertIn("T63", codes(rep))

    def test_the_readers_per_slide_is_the_drop_off_map(self):
        missing = SWIPE.replace("القراء لكل سلايد: 3,3,3,3,2,2,2,2,2,2" + chr(10), "")
        self.assertIn("T68", codes(run(board("room", swipe=missing), "room")))
        wrong = SWIPE.replace("3,3,3,3,2,2,2,2,2,2", "3,3,3,2,2,2,2,2,2,2")
        self.assertIn("T68", codes(run(board("room", swipe=wrong), "room")))

    def test_the_weakest_transition_is_recomputed(self):
        rep = run(board("room", swipe=SWIPE.replace("s04→s05 — متوسط", "s02→s03 — متوسط", 1)), "room")
        self.assertIn("T66", codes(rep))
        self.assertEqual(BC.weakest_pair([{"pulls": [3, 3], "depth": 2}, {"pulls": [1, 0], "depth": 2}], 4), (2, 1.5))
        # ties go to the earlier pair; a transition nobody reads is skipped
        self.assertEqual(BC.weakest_pair([{"pulls": [2, 2, 2], "depth": 3}], 4)[0], 1)


class TestReview(unittest.TestCase):
    def test_two_review_blocks_are_selected_by_phase(self):
        text = board("final", review=REVIEW) + "\n## مراجعة نهائية {#review}\n" + FINAL_REVIEW
        self.assertEqual(run(text, "room").items, [])
        self.assertEqual(run(text, "final").items, [])
        wrong_final = text.replace("QA: ok", "QA: BLOCK")
        self.assertIn("T76", codes(run(wrong_final, "final")))
        self.assertEqual(run(wrong_final, "room").items, [])
        duplicate = text + "\n## مراجعة أخرى {#review}\n" + FINAL_REVIEW
        self.assertIn("T06", codes(run(duplicate, "final")))

    def test_phase_selection_uses_the_existing_label_formatting_rules(self):
        text = (board("final", review=REVIEW.replace("المرحلة: script", "- **المرحلة**: script"))
                + "\n## مراجعة نهائية {#review}\n"
                + FINAL_REVIEW.replace("المرحلة: final", "**المرحلة**: final"))
        self.assertEqual(run(text, "room").items, [])
        self.assertEqual(run(text, "final").items, [])

    def test_verdict_word_can_have_an_explanation(self):
        text = board("final", editor="الحكم: PASS — النص سليم\nالجولة: 1 من 2",
                     review=FINAL_REVIEW.replace("الحكم: SHIP", "الحكم: SHIP — الوعود تحققت"))
        self.assertEqual(run(text).items, [])
        self.assertIn("T51", codes(run(board("room", editor="الحكم: VETO — خطأ مفتوح\nالجولة: 1 من 2"), "room")))

    def test_ship_needs_every_lens_at_four_and_two_personas_at_the_end(self):
        low = REVIEW.replace("التدفق 4", "التدفق 3")
        self.assertIn("T73", codes(run(board("room", review=low), "room")))
        revise = low.replace("الحكم: SHIP", "الحكم: REVISE\nملاحظة لـcs-copywriter: سلايد 4 لا يشدّ")
        self.assertEqual(run(board("room", review=revise), "room").items, [])
        one_reaches = SWIPE.replace("3,3,3,2,2,3,2,2,3,2", "3,3,3,2").replace("10/10 | 3,3,3,2 | -", "4/10 | 3,3,3,0 | s04").replace("3,3,3,2 |", "3,3,3,0 |", 1)
        self.assertIn("T73", codes(run(board("room", swipe=one_reaches), "room")))

    def test_kill_when_idea_or_hook_is_two_or_less(self):
        killed = REVIEW.replace("الفكرة 4", "الفكرة 2")
        self.assertIn("T73", codes(run(board("room", review=killed), "room")))
        self.assertEqual(run(board("room", review=killed.replace("الحكم: SHIP", "الحكم: KILL")), "room").items, [])

    def test_revise_needs_one_to_three_notes_to_named_agents(self):
        low = REVIEW.replace("الصوت 5", "الصوت 3").replace("الحكم: SHIP", "الحكم: REVISE")
        self.assertIn("T74", codes(run(board("room", review=low), "room")))
        stranger = low + "\nملاحظة لـcs-nobody: غيّر"
        self.assertIn("T74", codes(run(board("room", review=stranger), "room")))
        four = low + "".join("\nملاحظة لـcs-copywriter: ملاحظة %d" % i for i in range(4))
        self.assertIn("T74", codes(run(board("room", review=four), "room")))

    def test_the_final_review_needs_the_cover_the_gates_and_two_stops(self):
        self.assertIn("T75", codes(run(board("final", review=FINAL_REVIEW.replace("\nغلاف 130px: 3 من 3 وقفوا", "")), "final")))
        self.assertIn("T76", codes(run(board("final", review=FINAL_REVIEW.replace("QA: ok", "QA: BLOCK")), "final")))
        self.assertIn("T76", codes(run(board("final", review=FINAL_REVIEW.replace("3 من 3", "1 من 3")), "final")))
        self.assertIn("T70", codes(run(board("final", review=REVIEW), "final")))


class TestHuddleCardsAndLog(unittest.TestCase):
    def test_round_four_requires_design_artifacts_in_order(self):
        self.assertNotIn("T86", codes(run(board("huddle"), "huddle")))
        for line in ("الخطة البصرية — visual-plan.md",
                     "التصميم الحر: free/s02.html + free/s02.css merged into spec.json",
                     "ورقة المراجعة: out-design/sheet.png — Read checked"):
            self.assertIn("T86", codes(run(board("huddle", huddle=HUDDLE.replace(line, "")), "huddle")))
        self.assertIn("T86", codes(run(board("huddle", huddle=HUDDLE.replace(
            "التصميم الحر: free/s02.html + free/s02.css merged into spec.json", "التصميم الحر:")), "huddle")))
        reversed_order = HUDDLE.replace("الخطة البصرية — visual-plan.md", "ورقة المراجعة: sheet.png").replace(
            "ورقة المراجعة: out-design/sheet.png — Read checked", "الخطة البصرية — visual-plan.md")
        self.assertIn("T86", codes(run(board("huddle", huddle=reversed_order), "huddle")))
        self.assertNotIn("T86", codes(run(board("room"), "room")))

    def test_both_roles_name_the_same_focal_element(self):
        other = HUDDLE.replace("عنصر البطل: الرقم 5 | الاستعارة: عدّاد بيقف | الوصفة", "عنصر البطل: العنوان | الاستعارة: عدّاد بيقف | الوصفة")
        self.assertIn("T81", codes(run(board("huddle", huddle=other), "huddle")))
        self.assertIn("T80", codes(run(board("huddle", huddle=HUDDLE.replace(" | مصمم الحركة ✓", "")), "huddle")))

    def test_the_recipe_is_shipped_and_calm_is_flagged(self):
        self.assertIn("T82", codes(run(board("huddle", huddle=HUDDLE.replace("counter", "morph")), "huddle")))
        rep = run(board("huddle", huddle=HUDDLE.replace("counter", "calm")), "huddle")
        self.assertEqual([i["severity"] for i in rep.items if i["code"] == "T82"], ["fix"])

    def test_six_storyboard_lines_at_the_six_times(self):
        self.assertIn("T83", codes(run(board("huddle", huddle=HUDDLE.replace("1.5s —", "2.0s —")), "huddle")))
        self.assertIn("T83", codes(run(board("huddle", huddle="\n".join(HUDDLE.split("\n")[:-1])), "huddle")))

    def test_measured_encoded_frames_do_not_replace_the_six_planned_beats(self):
        measured = "\nاللقطات المقاسة من MP4:\n0.000s — الغلاف\n0.433s — التفكيك\n1.533s — البناء\n3.033s — الحركة\n4.533s — الاستقرار\n5.967s — النهاية"
        self.assertEqual(run(board("huddle", huddle=HUDDLE + measured), "huddle").items, [])
        self.assertIn("T83", codes(run(board("huddle", huddle=HUDDLE.replace("1.5s —", "2.0s —") + measured), "huddle")))

    def test_measured_frames_can_have_a_markdown_heading(self):
        for heading in ("### اللقطات المقاسة من MP4", "## Measured frames from MP4:"):
            measured = "\n" + heading + "\n0.000s — الغلاف\n0.433s — التفكيك\n5.967s — النهاية"
            self.assertEqual(run(board("huddle", huddle=HUDDLE + measured), "huddle").items, [])

    def test_guided_team_slide_budget_is_four_to_ten(self):
        for n in (1, 2, 3, 11, 20):
            self.assertIn("T03", codes(run(board("room").replace("slides: 10", "slides: %d" % n), "room")))
        for n in (4, 6, 10):
            self.assertNotIn("T03", codes(run(board("room").replace("slides: 10", "slides: %d" % n), "room")))

    def test_a_handoff_card_is_complete(self):
        self.assertIn("T94", codes(run(board("pitch", cards=CARDS.replace("ثقتي: عالية", "ثقتي: ممتازة")), "pitch")))
        self.assertIn("T94", codes(run(board("pitch", cards=CARDS.replace("محتاج منك: PASS أو VETO\n", "")), "pitch")))
        self.assertIn("T93", codes(run(board("pitch", cards=CARDS.replace("cs-arabic-editor", "someone")), "pitch")))
        self.assertIn("T92", codes(run(board("pitch", cards=""), "pitch")))

    def test_the_decision_log_gives_reasons(self):
        self.assertIn("T90", codes(run(board("pitch", decisions=""), "pitch")))
        self.assertIn("T91", codes(run(board("pitch", decisions="- R2 · البيتش: جريء"), "pitch")))

    def test_the_team_log_is_short_and_has_one_line_per_key(self):
        long_line = LOG["pitch"] + " " + "كلام " * 40
        rep = run(board("final", log=log_block().replace(LOG["pitch"], long_line)), "final")
        self.assertIn("T96", codes(rep))
        self.assertIn("T97", codes(run(board("final", log=log_block(("director", "pitch", "duel", "swipe", "editor"))), "final")))
        seven = log_block() + "\n- extra: واحد زيادة"
        self.assertTrue({"T95"} <= set(codes(run(board("final", log=seven), "final"))))
        card = log_block().replace(LOG["editor"], "من: cs-copywriter → إلى: cs-arabic-editor")
        self.assertIn("T96", codes(run(board("final", log=card), "final")))

    def test_the_specs_team_log_is_what_the_studio_shows(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "spec.json"
            good = {"ext": {"teamLog": [{"k": k, "t": t} for k, t in LOG.items()]}}
            path.write_text(json.dumps(good, ensure_ascii=False), encoding="utf-8")
            self.assertEqual(run(board("final"), "final", str(path)).items, [])
            path.write_text(json.dumps({"ext": {"teamLog": good["ext"]["teamLog"][:3]}}, ensure_ascii=False), encoding="utf-8")
            self.assertIn("T97", codes(run(board("final"), "final", str(path))))
            path.write_text(json.dumps({}), encoding="utf-8")
            self.assertIn("T98", codes(run(board("final"), "final", str(path))))
            path.write_text(json.dumps({"ext": {"teamLog": "text"}}), encoding="utf-8")
            self.assertIn("T98", codes(run(board("final"), "final", str(path))))


class TestCompactLanes(unittest.TestCase):
    def check(self, stage="fast", entries=None, slides=6, board_text="", format="carousel"):
        if entries is None:
            entries = [("director", "الفكرة: وقت واضح. العدو: التشتت."),
                       ("editor", "PASS — تمت مراجعة اللغة."),
                       ("design", "creator؛ QA: ok؛ المدير الإبداعي: SHIP — الوعد ظاهر.")]
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "spec.json"
            path.write_text(json.dumps({"format": format, "slides": [{"id": "s%02d" % n} for n in range(1, slides + 1)],
                                        "ext": {"teamLog": [{"k": k, "t": t} for k, t in entries]}},
                                       ensure_ascii=False), encoding="utf-8", newline="\n")
            return run(board_text, stage, str(path))

    def test_fast_and_ready_need_only_the_work_they_ran(self):
        self.assertEqual(self.check().items, [])
        ready = [("director", "الكلمات محفوظة."), ("design", "QA: PASS؛ المدير الإبداعي: SHIP")]
        self.assertEqual(self.check("ready", ready).items, [])
        self.assertIn("T97", codes(self.check("fast", ready)))
        self.assertIn("T98", codes(run("", "fast")))

    def test_no_invented_panel_pitch_duel_or_swipe_log(self):
        for key in ("pitch", "duel", "swipe"):
            entries = [("director", "الفكرة واضحة."), ("editor", "PASS"),
                       ("design", "QA: ok؛ المدير الإبداعي: SHIP"), (key, "نتيجة لم تجر.")]
            self.assertIn("T99", codes(self.check(entries=entries)))

    def test_design_names_both_qa_and_the_directors_result(self):
        for result in ("SHIP", "QA: ok", "QA: BLOCK؛ المدير الإبداعي: SHIP",
                       "QA: ok؛ المدير الإبداعي: REVISE", "QA: ok؛ المدير الإبداعي: KILL"):
            entries = [("director", "الفكرة واضحة."), ("editor", "PASS"), ("design", result)]
            self.assertIn("T99", codes(self.check(entries=entries)), result)
        entries = [("director", "الفكرة واضحة."), ("editor", "VETO — لم يحل."),
                   ("design", "QA: ok؛ المدير الإبداعي: SHIP")]
        self.assertIn("T51", codes(self.check(entries=entries)))

    def test_arabic_log_results_check_the_same_substance(self):
        entries = [("director", "الفكرة واضحة."), ("editor", "PASS — النص سليم."),
                   ("design", "الجودة: سليم؛ المدير الإبداعي: جاهز — اكتمل الوعد.")]
        self.assertEqual(self.check(entries=entries).items, [])
        for line in ("الجودة: موقوف؛ المدير الإبداعي: جاهز", "الجودة: سليم؛ المدير الإبداعي: تعديل",
                     "الجودة: سليم؛ المدير الإبداعي: مرفوض", "الجودة: غير سليم؛ المدير الإبداعي: جاهز"):
            self.assertIn("T99", codes(self.check(entries=entries[:2] + [("design", line)])))

    def test_compact_lanes_keep_the_ten_slide_limit(self):
        for stage in ("fast", "ready"):
            self.assertIn("T03", codes(self.check(stage, slides=11)))

    def test_team_fast_needs_four_but_ready_accepts_two_creator_slides(self):
        for n in (2, 3):
            with self.subTest(slides=n):
                self.assertIn("T03", codes(self.check("fast", slides=n)))
                self.assertNotIn("T03", codes(self.check("ready", slides=n)))
        for stage in ("fast", "ready"):
            self.assertIn("T03", codes(self.check(stage, slides=1)))
            for n in (4, 10):
                self.assertNotIn("T03", codes(self.check(stage, slides=n)))
            self.assertNotIn("T03", codes(self.check(stage, slides=1, format="single")))
            self.assertIn("T03", codes(self.check(stage, slides=2, format="single")))

    def test_guided_single_post_reads_its_one_slide_format_from_the_spec(self):
        for stage in ("room", "huddle", "final"):
            with self.subTest(stage=stage):
                text = board(stage).replace("slides: 10", "slides: 1")
                rep = self.check(stage, entries=list(LOG.items()), slides=1, format="single", board_text=text)
                self.assertNotIn("T03", codes(rep))

    def test_compact_cli_accepts_spec_without_a_board(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "spec.json"
            path.write_text(json.dumps({"slides": [{}] * 4, "ext": {"teamLog": [
                {"k": "director", "t": "الفكرة واضحة."}, {"k": "editor", "t": "PASS"},
                {"k": "design", "t": "QA: ok؛ المدير الإبداعي: SHIP"}]}}), encoding="utf-8", newline="\n")
            out = io.StringIO()
            with contextlib.redirect_stdout(out):
                self.assertEqual(BC.main(["--stage", "fast", "--spec", str(path), "--format", "json"]), 0)
            self.assertTrue(json.loads(out.getvalue())["ok"])


class TestFreeBlockMerge(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.post = Path(self.tmp.name)
        self.script = REPO / "plugins/carousel-studio/skills/carousel-design/scripts/merge-free.mjs"
        self.spec = self.post / "spec.json"
        self.free = self.post / "free"
        self.free.mkdir()
        self.doc = {"rev": 8, "cover": {"motion": {"recipe": "stamp"}}, "captionPack": {"body": "آخر تعديل"},
                    "slides": [{"id": "s01", "type": "cover", "headline": "غلاف اختاره المبدع"},
                               {"id": "s02", "type": "item", "body": "نص حديث"},
                               {"id": "s03", "type": "item", "free": {"html": "kept", "css": ""}}]}
        self.spec.write_text(json.dumps(self.doc, ensure_ascii=False), encoding="utf-8", newline="\n")
        for sid in ("s01", "s02", "s03", "s99"):
            (self.free / (sid + ".html")).write_text('<div class="f-root"><p data-field="body"></p></div>', encoding="utf-8", newline="\n")
            (self.free / (sid + ".css")).write_text(".f-root{gap:40px}\n", encoding="utf-8", newline="\n")

    def call(self, *ids):
        return subprocess.run([shutil.which("node") or "node", str(self.script), "--spec", str(self.spec),
                               "--free-dir", str(self.free), "--slides", *ids], capture_output=True, text=True, encoding="utf-8")

    def test_merges_only_named_free_blocks_into_latest_spec(self):
        # Files can outlive the snapshot used to design them; current copy and cover win.
        result = self.call("s02")
        self.assertEqual(result.returncode, 0, result.stderr)
        merged = json.loads(self.spec.read_text(encoding="utf-8"))
        free = merged["slides"][1].pop("free")
        self.assertIn(".f-title", free["css"])
        self.assertTrue(free["css"].endswith(".f-root{gap:40px}"))
        self.assertEqual(merged, self.doc)
        self.assertNotIn(b"\r", self.spec.read_bytes())
        self.assertFalse(self.spec.read_bytes().startswith(b"\xef\xbb\xbf"))
        self.assertEqual(sorted(p.name for p in self.post.iterdir()), ["free", "spec.json"])

    def test_bad_or_missing_inputs_leave_spec_untouched(self):
        original = self.spec.read_bytes()
        for ids, code in ((["s01"], 2), (["s99"], 2), (["s02", "s02"], 64), (["../s02"], 64), ([], 64)):
            self.assertEqual(self.call(*ids).returncode, code, ids)
            self.assertEqual(self.spec.read_bytes(), original)
        (self.free / "s03.css").unlink()
        self.assertEqual(self.call("s02", "s03").returncode, 66)
        self.assertEqual(self.spec.read_bytes(), original)

    def test_respects_the_shared_pen_lock_and_cleans_up_after_errors(self):
        lock = self.post / "spec.json.lock"
        lock.write_text("another writer", encoding="utf-8", newline="\n")
        self.assertEqual(self.call("s02").returncode, 75)
        self.assertEqual(lock.read_text(encoding="utf-8"), "another writer")
        lock.unlink()
        self.spec.write_text("{", encoding="utf-8", newline="\n")
        self.assertEqual(self.call("s02").returncode, 65)
        self.assertFalse(lock.exists())

    def test_rejects_oversize_blocks_before_any_write(self):
        original = self.spec.read_bytes()
        (self.free / "s02.html").write_text("ن" * 6100, encoding="utf-8", newline="\n")
        self.assertEqual(self.call("s02").returncode, 2)
        self.assertEqual(self.spec.read_bytes(), original)

    def test_multiple_named_blocks_merge_without_touching_other_fields(self):
        self.assertEqual(self.call("s02", "s03").returncode, 0)
        merged = json.loads(self.spec.read_text(encoding="utf-8"))
        for i in (1, 2):
            self.assertIn("data-field", merged["slides"][i]["free"]["html"])
        self.assertEqual(merged["slides"][0], self.doc["slides"][0])
        self.assertEqual(merged["cover"], self.doc["cover"])
        self.assertEqual(merged["captionPack"], self.doc["captionPack"])

    def test_css_limit_includes_the_shared_base(self):
        (self.free / "s02.css").write_text("x" * 5900, encoding="utf-8", newline="\n")
        original = self.spec.read_bytes()
        self.assertEqual(self.call("s02").returncode, 2)
        self.assertEqual(self.spec.read_bytes(), original)


class TestCli(unittest.TestCase):
    def call(self, *argv):
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            try:
                code = BC.main(list(argv))
            except SystemExit as exc:
                code = exc.code
        return code, out.getvalue(), err.getvalue()

    def test_exit_codes_and_json(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "board.md"
            path.write_text(board("final"), encoding="utf-8")
            code, out, _ = self.call(str(path), "--stage", "final", "--today", "2026-10-22", "--format", "json")
            self.assertEqual(code, 0)
            self.assertTrue(json.loads(out)["ok"])
            path.write_text(board("final", editor="الحكم: VETO\nالجولة: 1 من 2"), encoding="utf-8")
            code, out, _ = self.call(str(path), "--today", "2026-10-22")
            self.assertEqual(code, 2)
            self.assertIn("T51", out)
            path.write_text(board("room", swipe=SWIPE.replace("s04→s05", "s02→s03", 1)), encoding="utf-8")
            self.assertEqual(self.call(str(path), "--stage", "room", "--today", "2026-10-22")[0], 1)
            self.assertEqual(self.call(str(path), "--today", "soon")[0], 64)
            self.assertEqual(self.call(str(Path(tmp) / "nope.md"))[0], 66)
            self.assertEqual(self.call(str(path), "--stage", "nonsense")[0], 64)


class TestSourcesAgree(unittest.TestCase):
    """The checker's vocabulary is the vocabulary the role files print; a change in one without the other is a bug."""

    @classmethod
    def setUpClass(cls):
        cls.roles = {p.stem: p.read_text(encoding="utf-8") for p in (TEAM / "roles").glob("cs-*.md")}
        cls.charter = (TEAM / "charter.md").read_text(encoding="utf-8")

    def test_the_directors_brief_and_review_use_the_checkers_labels(self):
        cd = self.roles["cs-creative-director"]
        for label in BC.BRIEF_LABELS:
            self.assertIn(label + ":", cd, label)
        for lens in BC.LENSES:
            self.assertRegex(cd, r"(?m)^%s \d — " % lens)
        for move in BC.MOVES:
            self.assertIn("`%s`" % move, cd, move)
        self.assertIn("الحكم: SHIP | REVISE | KILL", cd)
        for token in ("المرحلة: script | final", "ملاحظة لـ<agent slug>:", "غلاف 130px: <n> من 3 وقفوا", "QA: ok | FIX | BLOCK", "المدير الفني: PASS | FIX | BLOCK"):
            self.assertIn(token, cd, token)

    def test_slide_count_docs_and_evals_follow_current_policy(self):
        design = support.SKILLS / "carousel-design"
        free = (design / "references/free-design.md").read_text(encoding="utf-8")
        self.assertNotIn("11-12", free)
        self.assertIn("FIX below 4", free)
        self.assertIn("4 to 10 slides including the cover; 4 to 6 is complete", self.roles["cs-copywriter"])
        self.assertIn("Ready scripts from the creator may have 2 to 10 slides", self.roles["cs-copywriter"])
        for path in (REPO / "docs/CONTRACT.md", support.SKILLS / "carousel-create/references/flow.md"):
            self.assertNotRegex(path.read_text(encoding="utf-8"), r"s01[^\n]{0,6}s20")
        fast = (REPO / "evals/behaviour/bhv-02-fast-mode-valid-spec/case.yaml").read_text(encoding="utf-8")
        warning = (REPO / "evals/behaviour/bhv-22-slide-count-warning/case.yaml").read_text(encoding="utf-8")
        self.assertIn("four-to-ten-slides", fast)
        self.assertIn("between 4 and 10 slides", fast)
        for phrase in ("10-slide limit", "including the cover", "2 to 3", "4 to 6"):
            self.assertIn(phrase, warning)
        self.assertNotIn("8-12", warning)

    def test_dialect_strength_and_clip_cover_handoffs_reach_their_owners(self):
        writer, editor, motion = (self.roles[k] for k in ("cs-copywriter", "cs-arabic-editor", "cs-motion-designer"))
        for text in (writer, editor, (support.SKILLS / "carousel-create/references/brand-lookup.md").read_text(encoding="utf-8")):
            self.assertIn("voice.dialectStrength", text)
            self.assertRegex(text, r"[Aa]bsen(?:t|ce)")
        self.assertIn("silent 6 to 15 second clip cover", motion)
        self.assertIn("never download footage", motion)
        self.assertIn("actual duration", motion)
        skill = (support.SKILLS / "carousel-design/SKILL.md").read_text(encoding="utf-8")
        step6 = next(l for l in skill.splitlines() if l.startswith("6. **Style"))
        step8 = next(l for l in skill.splitlines() if l.startswith("8. **Claude"))
        self.assertIn("cover.motion.clip", step6)
        self.assertIn("shared browser compositor", step8)

    def test_cover_lab_commands_include_their_required_inputs(self):
        paths = list(TEAM.rglob("*.md")) + list(support.SKILLS.rglob("*.md"))
        for path in paths:
            for command in re.findall(r"`([^`\n]*render\.mjs --(?:covers|style-sheet)[^`\n]*)`", path.read_text(encoding="utf-8")):
                with self.subTest(path=path, command=command):
                    self.assertIn("--spec ", command)
                    self.assertIn("--out ", command)
                    if "--covers" in command:
                        self.assertRegex(command, r"--covers [^ -][^ ]*")

    def test_qa_docs_match_counting_and_explicit_kept_endings(self):
        qa = (support.SKILLS / "carousel-design/references/qa-gates.md").read_text(encoding="utf-8")
        override = next(l for l in qa.splitlines() if l.startswith("- **Overridable**"))
        self.assertIn("C4.count", override)
        self.assertIn("C5.skeleton", override)
        count = next(l for l in qa.splitlines() if l.startswith("- **List count (C6)**"))
        self.assertIn("distinct positive integer", count)
        self.assertIn("no `ord`", count)
        ready = (support.SKILLS / "carousel-create/references/ready-script.md").read_text(encoding="utf-8")
        for token in ("reset-record", "--discard-edits", "spec.edits.json.bak"):
            self.assertIn(token, ready)

    def test_plate_docs_name_the_actual_browser_environment_aliases(self):
        plates = (support.SKILLS / "carousel-design/references/plates.md").read_text(encoding="utf-8")
        self.assertIn("CS_CHROMIUM", plates)
        self.assertIn("plates.mjs only", plates)

    def test_the_command_and_skill_have_the_same_ordered_router(self):
        skill = (REPO / "plugins/carousel-studio/skills/carousel-create/SKILL.md").read_text(encoding="utf-8")
        command = (REPO / "plugins/carousel-studio/commands/carousel.md").read_text(encoding="utf-8")
        rows = lambda text: re.search(r"(?m)^\| What the creator brought[^\n]*(?:\n\|[^\n]*)+", text).group(0).splitlines()[2:]
        self.assertEqual(rows(skill), rows(command))
        self.assertIn("existing post", rows(skill)[0])
        self.assertIn("finished script", rows(skill)[1])
        self.assertIn("own Reel", rows(skill)[2])
        self.assertIn("full team", rows(skill)[3])
        self.assertIn("Source material", rows(skill)[4])
        self.assertIn("bare topic", rows(skill)[5])

    def test_the_reviewer_inherits_and_the_artist_can_record_checks(self):
        self.assertIn("\nmodel: inherit\n", self.roles["cs-creative-director"])
        artist = self.roles["cs-visual-artist"]
        tools = re.search(r"(?m)^tools: (.+)$", artist).group(1).split(", ")
        self.assertTrue({"Read", "Write", "Bash"} <= set(tools))
        self.assertIn("لا تُقيَّم: كلمات المبدع", self.roles["cs-creative-director"])
        self.assertIn("اللجنة: لم تُشغَّل", self.roles["cs-creative-director"])

    def test_the_editors_rule_paths_are_real(self):
        for rel in ("scripts/ortho_lint.py", "scripts/bidi_lint.py", "data/rules/ortho.json", "data/rules/copy.json"):
            self.assertTrue((REPO / "plugins/carousel-studio/skills/arabic-proofread" / rel).is_file())

    def test_the_hook_family_codes_the_checker_accepts_are_the_hook_library_s(self):
        families = json.loads((REPO / "plugins/carousel-studio/skills/carousel-create/data/hooks/families.json").read_text(encoding="utf-8"))["families"]
        self.assertEqual({f["code"] for f in families}, BC.FAMILIES)

    def test_the_loop_limits_are_written_in_the_charter(self):
        for name, limit in BC.LOOP_LIMITS.items():
            self.assertRegex(self.charter, r"`%s`[^|\n]*\| %d \|" % (name, limit), name)
        self.assertIn("pitch 1, duel 1, editor 2, swipe 1, script 2, huddle 1, review 2", self.charter)

    def test_the_panels_formats_are_the_checkers(self):
        panel = self.roles["cs-audience-panel"]
        for token in ("| الشخصية | العمق | الجذب | وقفت عند | السبب | النية |", "القراء لكل سلايد:", "أضعف انتقال: s04→s05", "[الأساسي]", "[المتشكك]", "[الامتداد]", "لحظتها:", "بيتضايق من:"):
            self.assertIn(token, panel)

    def test_the_motion_designers_storyboard_uses_the_six_times(self):
        md = self.roles["cs-motion-designer"]
        for t in BC.STORYBOARD_TIMES:
            self.assertIn("%.1fs —" % t, md)
        self.assertIn("المدير الفني ✓", self.roles["cs-art-director"])
        self.assertIn("مصمم الحركة ✓", md)
        for recipe in BC.RECIPES:
            self.assertIn("`%s`" % recipe, self.roles["cs-creative-director"] + md)

    def test_the_new_formats_are_written_in_the_roles_that_print_them(self):
        cd, ad, panel = (self.roles[k] for k in ("cs-creative-director", "cs-art-director", "cs-audience-panel"))
        self.assertIn("حقائق المنصة:", cd)
        self.assertIn("الوعد: <promise> — ✓ | ✗ — <evidence>", cd)
        self.assertIn("وعد:", self.charter)
        self.assertIn("الستايل: <preset> — بدائل:", ad)
        self.assertIn("الهجين:", cd)
        self.assertIn("audience.persona", panel)
        for preset in BC.PRESETS:
            self.assertTrue((REPO / "plugins/carousel-studio/skills/carousel-design/styles" / preset / "preset.json").exists(), preset)

    def test_the_log_keys_and_the_card_fields_are_in_the_charter_and_the_director(self):
        for key in BC.LOG_KEYS:
            self.assertIn("`%s`" % key, self.charter)
            self.assertIn("`%s`" % key, self.roles["cs-creative-director"])
        handoff = self.charter[self.charter.index("<!-- handoff:start -->"):self.charter.index("<!-- handoff:end -->")]
        for label in BC.CARD_LABELS:
            self.assertIn(label, handoff)
        for agent in BC.AGENTS:
            self.assertIn("`%s`" % agent, self.charter)


class TestMemoryEntryDocs(unittest.TestCase):
    def test_the_directors_memory_entry_names_the_fields_the_schema_holds(self):
        schema = json.loads((REPO / "plugins/carousel-studio/skills/carousel-design/schemas/brand.schema.json").read_text(encoding="utf-8"))
        props = schema["properties"]["creativeMemory"]["items"]["properties"]
        for name in ("postId", "date", "idea", "hook", "family", "move", "pitch", "preset", "motion", "intent", "cta", "panel", "verdict", "loved", "rejected", "series"):
            self.assertIn(name, props, name)
        moves = set(props["move"]["enum"])
        self.assertEqual(moves, set(BC.MOVES))
        self.assertEqual(set(props["pitch"]["enum"]), {"safe", "bold", "merged"})


if __name__ == "__main__":
    unittest.main()
