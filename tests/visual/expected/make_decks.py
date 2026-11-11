"""Builds the four rich planner decks of tests/visual/expected/decks/ from the shell of tests/fixtures/spec.eg.8slides.json.

The decks carry what the planner reads and the base fixtures lack: demo lines, sides, items with values, bullets, figures with sources, a user screenshot (the planner
must skip that slide) and a pause-length statement. Every word is the deck's own copy (the planner copies, it never writes). Run from the repository root:

    python -X utf8 tests/visual/expected/make_decks.py            # rewrite the decks
    python -X utf8 tests/visual/expected/make_decks.py --check    # exit 1 when a deck on disk differs
"""
import copy
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).resolve().parent / "decks"
FIX = ROOT / "tests" / "fixtures"
SHELLS = {"eg": "spec.eg.8slides.json", "gulf": "spec.gulf.9slides.json", "en": "spec.en.8slides.json"}   # hook, angle and caption pack come from the fixture of the same dialect
NB = chr(0xA0)   # number and noun are bound with a no-break space (S-10); ortho_lint wants it


def deck(id_, dialect, preset, topic, slides, sources=None, digits="western", register=None, cue="arrow-rtl", app="ar"):
    d = copy.deepcopy(json.loads((FIX / SHELLS[dialect]).read_text(encoding="utf-8")))
    d["id"] = id_
    d["brief"] = {"topic": topic, "input": "idea"}
    d["locale"] = {"dialect": dialect, "register": register or ("msa" if dialect in ("msa-white", "en") else "dialect"), "digits": digits, "appLanguage": app, "swipeCue": cue}
    if dialect == "en":
        d["locale"]["register"] = "white"
    d["style"] = {"presetId": preset + "@1.0"}
    d["slides"] = []
    for i, s in enumerate(slides, 1):
        s = dict(s)
        s = {"id": "s%02d" % i, "n": i, **s}
        d["slides"].append(s)
    d["sources"] = sources or []
    d["captionPack"]["perSlide"] = [("line %d" % i) for i, _ in enumerate(slides, 1)]
    d["captionPack"]["alt"] = [("alt %d" % i) for i, _ in enumerate(slides, 1)]
    d["qa"] = {"status": "pass", "runAt": "2026-10-22T09:20:00Z", "engine": "cs-1.1.1", "results": []}
    return d


SRC_EG = [{"id": "src1", "kind": "user", "ref": "أرقام حسابي على إنستجرام", "excerpt": "74% من الزوار يقفون عند السلايدين الأولين", "verified": True},
          {"id": "src2", "kind": "user", "ref": "موافقة المتابعة على نشر رأيها", "excerpt": "زاد الحفظ عندي 3 أضعاف", "verified": True}]

EG_CREATOR = deck("post-plan-eg-creator", "eg", "creator", "إزاي تكتب هوك يخلي الناس تقف", [
    {"type": "cover", "kicker": "دليل سريع", "headline": "إزاي تكتب ==هوك== يخلي الناس تقف", "sub": "في ثواني", "media": {"slot": "none", "ai": False}},
    {"type": "rehook", "headline": "أول سلايدتين هما ==كل== اللعبة", "sub": "وده ليه", "bridge": "اسحب وشوف"},
    {"type": "stat", "number": {"value": "74", "unit": "%", "sourceId": "src1"}, "title": "من الناس بتقرا أول سلايدين بس", "body": "عشان كده التانية مهمة زي الغلاف.", "sourceIds": ["src1"], "bridge": "يعني؟"},
    {"type": "step", "ord": 1, "variant": "track", "title": "اكتب الهوك قبل أي حاجة", "body": "افتح ورقة واكتب 5" + NB + "هوكات.", "bridge": "والخطوة الجاية تفرق معاك",
     "demo": {"lines": [{"text": "5 نصايح للكتابة"}, {"text": "ليه محدش بيكمّل بوستك؟", "hi": True}, {"text": "دليل الكابشن الكامل"}], "caption": "ده اللي بيوقّف الإبهام"}},
    {"type": "compare", "title": "هوك ضعيف وهوك بيشدّ", "sides": [{"label": "قبل", "text": "نصايح عن الكتابة"}, {"label": "بعد", "text": "ليه محدش بيكمّل بوستك؟"}]},
    {"type": "myth-fact", "title": "خرافة: لازم مصمم", "sides": [{"label": "خرافة", "text": "لازم أشتغل مع مصمم"}, {"label": "حقيقة", "text": "قالب واحد وكفاية"}], "bridge": "والتالتة أشيع"},
    {"type": "quote", "title": "اللي بيسأله متابعينك", "body": "هتاخد كام على الكاروسيل ده؟", "attribution": "متابع", "variant": "base"},
    {"type": "checklist", "title": "قبل ما تنشر", "bullets": ["الهوك في أول سطر", "كلمة واحدة بتتكبر", "صورة واحدة تحكي", "دعوة واحدة في الآخر"]},
    {"type": "item", "ord": 2, "title": "الأرقام بتشدّ العين", "body": "رقم واحد كبير أحسن من فقرة كاملة.", "bridge": "وكمان؟"},
    {"type": "testimonial", "body": "زاد الحفظ عندي 3" + NB + "أضعاف", "attribution": "منى، مصممة", "sourceIds": ["src2"],
     "demo": {"lines": [{"who": "them", "text": "كنت بكتب كاروسيل ومحدش بيحفظه"}, {"who": "me", "text": "جرّبتي الهوك؟"}], "caption": "رسالة بعد أسبوع"}},
    {"type": "cta", "title": "احفظ البوست ده", "cta": {"kind": "save", "text": "احفظه لما تيجي تكتب الهوك الجاي"}},
], SRC_EG)

EG_POSTER = deck("post-plan-eg-poster", "eg", "poster", "كام بتكلّف خدمة تصميم فعلاً", [
    {"type": "cover", "kicker": "حسبة", "headline": "سعر ==التصميم== مش اللي في دماغك", "media": {"slot": "none", "ai": False}},
    {"type": "rehook", "headline": "هتدفع كام فعلاً؟", "sub": "الحسبة في 5" + NB + "سلايدات", "bridge": "اسحب"},
    {"type": "stat", "variant": "chart", "title": "سعر التصميم حسب الخدمة", "body": "بالجنيه المصري.", "sourceIds": ["src1"],
     "items": [{"title": "شعار", "value": "1500"}, {"title": "هوية كاملة", "value": "8000", "hi": True}, {"title": "قالب سوشيال", "value": "3000"}]},
    {"type": "setup", "title": "اللي هتدفعه", "bullets": ["التصميم نفسه", "التعديلات", "ملفات المصدر"],
     "demo": {"lines": [{"text": "تصميم: 8000"}, {"text": "تعديلات: 2 فقط"}, {"text": "ملفات المصدر: 500"}], "caption": "الإجمالي 8500"}},
    {"type": "timeline", "title": "مراحل المشروع", "items": [{"title": "بريف", "value": "يوم 1"}, {"title": "مسودة", "value": "يوم 4", "hi": True}, {"title": "تعديل", "value": "يوم 7"}]},
    {"type": "grid", "title": "اللي في الباقة", "items": [{"title": "شعار", "text": "3 نسخ"}, {"title": "ألوان", "text": "باليت كامل"}, {"title": "خطوط", "text": "اتنين"}, {"title": "قالب", "text": "سوشيال", "hi": True}]},
    {"type": "proof", "title": "نتيجة فعلية", "media": {"slot": "screenshot", "assetId": "a001"}},
    {"type": "offer", "title": "باقة الهوية", "number": {"value": "8000", "unit": "جنيه", "sourceId": "src1"}, "bullets": ["شعار", "هوية بصرية", "قالب"], "cta": {"kind": "send", "text": "ابعت بريفك"}, "sourceIds": ["src1"]},
    {"type": "quote", "title": "قبل ما تسأل", "body": "ليه مفيش سعر ثابت؟"},
    {"type": "cta", "title": "ابعتها لصاحبك", "cta": {"kind": "send", "text": "ابعتها لحد بيسأل عن سعر التصميم"}},
], [{"id": "src1", "kind": "user", "ref": "قائمة الأسعار", "excerpt": "هوية كاملة 8000 جنيه", "verified": True}])
EG_POSTER["assets"] = [{"id": "a001", "kind": "image", "ref": "asset:a001", "mime": "image/png", "width": 1080, "height": 1440, "aiGenerated": False, "alt": "لقطة شاشة"}]

EN_CREATOR = deck("post-plan-en-creator", "en", "creator", "Write a hook that stops the scroll", [
    {"type": "cover", "kicker": "Quick guide", "headline": "Write a ==hook== people stop for"},
    {"type": "rehook", "headline": "Slide two is ==half== the game", "sub": "Here is why", "bridge": "Swipe"},
    {"type": "step", "ord": 1, "title": "Read it at thumbnail size", "body": "Shrink it. If you cannot read it in a glance, enlarge the text.",
     "demo": {"lines": [{"text": "5 tips for writing"}, {"text": "Why does nobody finish your post?", "hi": True}], "caption": "This is what stops the thumb"}},
    {"type": "stat", "number": {"value": "8", "unit": "of 100"}, "title": "readers reach the last slide", "body": "Make slide two count."},
    {"type": "quote", "title": "What readers ask", "body": "How much for one carousel?", "attribution": "A follower"},
    {"type": "summary", "title": "The four checks", "bullets": ["Read it small", "Pay off on slide two", "One idea per slide", "One call to action"]},
    {"type": "cta", "title": "Save this post", "cta": {"kind": "save", "text": "Save it for your next hook"}},
])

GULF_POSTER = deck("post-plan-gulf-poster", "gulf", "poster", "اشتراك قهوة أسبوعي", [
    {"type": "cover", "kicker": "قهوة", "headline": "قهوة ==طازجة== كل أسبوع", "media": {"slot": "none", "ai": False}},
    {"type": "item", "ord": 1, "title": "تحميص طازج", "body": "كل أسبوع نحمّص دفعة صغيرة ونرسلها لك في نفس اليوم.", "bridge": "وبعدها؟"},
    {"type": "item", "ord": 2, "title": "اختيار يناسبك", "body": "نكهات خفيفة أو غامقة، وأنت تختار.", "bridge": "والسعر؟"},
    {"type": "compare", "title": "قهوة السوبرماركت وقهوتنا", "variant": "table", "items": [{"title": "التحميص", "text": "قديم / هذا الأسبوع"}, {"title": "التوصيل", "text": "مرة / كل أسبوع"}, {"title": "السعر", "text": "مرتفع / أقل"}]},
    {"type": "testimonial", "body": "أول مرة أشرب قهوة بهالطعم في بيتي.", "attribution": "عميلة من الرياض", "sourceIds": ["src2"],
     "demo": {"lines": [{"who": "them", "text": "أول مرة أشرب قهوة بهالطعم في بيتي."}]}},
    {"type": "offer", "title": "اشتراك الأسبوع الأول بسعر خاص", "number": {"value": "99", "unit": "ريال", "sourceId": "src1"}, "bullets": ["شحنة أسبوعية طازجة", "توصيل مجاني داخل الرياض", "إيقاف الاشتراك بأي وقت"], "sourceIds": ["src1"],
     "cta": {"kind": "keyword-dm", "text": "اكتب «اشتراك» بالتعليقات ويوصلك رابط الطلب على الخاص مباشرة"}},
    {"type": "cta", "title": "اطلب اشتراكك", "cta": {"kind": "keyword-dm", "text": "اكتب «اشتراك» بالتعليقات ويوصلك رابط الطلب على الخاص مباشرة"}, "demo": {"lines": [{"who": "me", "text": "اشتراك"}]}},
], [{"id": "src1", "kind": "user", "ref": "قائمة أسعار العميل", "excerpt": "اشتراك الأسبوع الأول: 99 ريال", "verified": True},
    {"id": "src2", "kind": "user", "ref": "موافقة العميلة على نشر رأيها", "excerpt": "أول مرة أشرب قهوة بهالطعم في بيتي", "verified": True}])

DECKS = {"eg-creator-rich": EG_CREATOR, "eg-poster-rich": EG_POSTER, "en-creator": EN_CREATOR, "gulf-poster": GULF_POSTER}


def render(d):
    return json.dumps(d, ensure_ascii=False, indent=2) + "\n"


def main(argv):
    check = "--check" in argv
    OUT.mkdir(parents=True, exist_ok=True)
    bad = 0
    for name, d in DECKS.items():
        path = OUT / (name + ".json")
        text = render(d)
        if check:
            if not path.is_file() or path.read_text(encoding="utf-8") != text:
                print("differs:", path)
                bad = 1
        else:
            path.write_text(text, encoding="utf-8", newline="\n")
            print("wrote", path)
    return bad


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
