"""The creative team's production board (board_check.py) and the places its rules are written down.

The board is the team's one record per post. These tests build a valid board stage by stage, break one rule at a time and check that
the checker names it, and they keep the role files, the charter and the checker from drifting apart.
"""
from __future__ import annotations

import contextlib
import io
import json
import re
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
                "\nالوعد: الرقم 5 بيتقري على بلاطة 130px — ✓ — «5» واضح على tile.png")

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
             "- وعد: الرقم 5 بيتقري على بلاطة 130px — يتأكد على tile.png")

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
        for stage in BC.STAGES:
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
        no_ledger = FINAL_REVIEW.replace("\nالوعد: الرقم 5 بيتقري على بلاطة 130px — ✓ — «5» واضح على tile.png", "")
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
