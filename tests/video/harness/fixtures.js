/* Specs used by the B3 tests (shape follows spec.schema.json for the fields the exporter and motion engine read). */
window.CS_FIXTURES = (function () {
  function slides(cover, rest) {
    var list = [Object.assign({ id: "s01", n: 1, type: "cover" }, cover)];
    (rest || []).forEach(function (s, i) { list.push(Object.assign({ id: "s0" + (i + 2), n: i + 2 }, s)); });
    return list;
  }
  var rest = [
    { type: "item", title: "غلاف من غير وعد", body: "لو الغلاف ما قالش القارئ هياخد إيه، مش هيسحب. اكتب النتيجة في 6 كلمات أو أقل، حتى لو بتكتب بـ ChatGPT." },
    { type: "item", title: "نص صغير يتقري", body: "خلّي الجملة تتقري من الموبايل من غير ما تقرّب الصورة." },
    { type: "cta", title: "احفظ البوست", body: "وابعته لحد بيعمل كاروسيل وهيستفيد منه.", cta: { kind: "save", text: "احفظ وارجعله" } }
  ];
  function make(id, cover, extra) {
    return Object.assign({
      specVersion: 1, id: id, rev: 1, format: "carousel", mode: "fast", checkpoint: "design",
      locale: { dialect: "eg", register: "dialect", digits: "western", appLanguage: "ar", swipeCue: "arrow-rtl" },
      style: { presetId: "swiss@1.0", metaLabel: "دليل سريع" },
      compat: { paint: "auto", mp4: "auto", hfRuntime: "auto" },
      cover: { motion: { recipe: "calm", feel: "calm", seconds: 6, fps: 30, source: "internal" } },
      slides: slides(cover, rest),
      captionPack: { firstLine: "غلاف يخلّي الناس تسحب.", keywordLine: "اعمل كاروسيل بالعربي من غير مصمم.", body: "1. غلاف واضح\n2. نص صغير يتقري", cta: "احفظ البوست.",
        hashtags: ["#كاروسيل", "#تصميم"], perSlide: ["الغلاف", "غلاف من غير وعد", "نص صغير يتقري", "احفظ"], alt: ["غلاف: العنوان الرئيسي", "نقطة 1", "نقطة 2", "احفظ البوست"] },
      meta: { createdAt: "2026-10-22T10:00:00Z", updatedAt: "2026-10-22T10:06:00Z", updatedBy: "claude" }
    }, extra || {});
  }
  return {
    // number-led list -> counter
    counter: make("fx-counter", { kicker: "للمبتدئين", headline: "6 أدوات ببلاش… بتغنيك عن ==المصمم==", sub: "من غير اشتراكات ولا خبرة." },
      { hook: { id: "P1", family: "P1", cover: "6 أدوات ببلاش… بتغنيك عن المصمم" }, architecture: "listicle", brief: { topic: "أدوات مجانية بتغنيك عن المصمم" } }),
    // mistakes + number -> story / heartbeat (the approved prototype cover)
    mistakes: make("fx-mistakes", { kicker: "دليل سريع للكاروسيل", headline: "5 ==أخطاء== بتموّت الكاروسيل", sub: "قبل ما حد يسحب للسلايد التانية." },
      { hook: { id: "P2", family: "P2", cover: "5 أخطاء بتموّت الكاروسيل" }, architecture: "listicle", brief: { topic: "أخطاء الكاروسيل" } }),
    // urgency -> racing clock
    urgent: make("fx-urgent", { kicker: "عاجل", headline: "العرض ينتهي ==الليلة== والوقت بيجري", sub: "آخر فرصة قبل ما يفوتك." },
      { hook: { id: "P3", family: "P3", cover: "العرض ينتهي الليلة والوقت بيجري" }, architecture: "news", brief: { topic: "آخر فرصة للعرض" } }),
    // spread -> map dots
    spread: make("fx-spread", { kicker: "انتشار", headline: "الفكرة وصلت لـ ==كل المدن== العربية", sub: "من القاهرة للدار البيضاء." },
      { hook: { id: "P5", family: "P5", cover: "الفكرة وصلت لكل المدن" }, architecture: "story", brief: { topic: "انتشار الفكرة في المدن" } }),
    // decision -> stamp
    myth: make("fx-myth", { kicker: "صح ولا غلط؟", headline: "الحقيقة: الغلاف ==أهم== من الباقي", sub: "خرافة شائعة بتضيّع السحب." },
      { hook: { id: "P4", family: "P4", cover: "الحقيقة الغلاف أهم" }, architecture: "myth-fact", brief: { topic: "خرافة الغلاف" } }),
    // steps -> reorder
    steps: make("fx-steps", { kicker: "نظام جاهز", headline: "ترتيب ==الكاروسيل== في خطوات بسيطة", sub: "اتبعها بالترتيب." },
      { hook: { id: "P6", family: "P6", cover: "ترتيب الكاروسيل في خطوات" }, architecture: "steps", brief: { topic: "نظام الكاروسيل" } }),
    // opinion / default -> highlight sweep (word cascade)
    opinion: make("fx-opinion", { kicker: "رأي", headline: "التصميم الجميل ==مش كفاية== لوحده", sub: "الفكرة قبل الشكل." },
      { hook: { id: "F17", family: "F17", cover: "التصميم الجميل مش كفاية" }, architecture: "opinion", brief: { topic: "رأي في التصميم" } }),
    // an English post: left-to-right, the swipe cue points right
    english: make("fx-english", { kicker: "Quick guide", headline: "5 ==mistakes== that kill your carousel", sub: "Before anyone swipes to slide two." },
      { locale: { dialect: "en", register: "dialect", digits: "western", appLanguage: "en", swipeCue: "arrow-ltr" }, hook: { id: "P2", family: "P2", cover: "5 mistakes that kill your carousel" }, architecture: "listicle", brief: { topic: "carousel mistakes" } }),
    heritage: make("fx-heritage", { kicker: "تراث", headline: "5 ==أخطاء== بتموّت الكاروسيل", sub: "قبل ما حد يسحب للسلايد التانية." },
      { style: { presetId: "heritage@1.0", metaLabel: "دليل سريع" }, hook: { id: "P2", family: "P2", cover: "5 أخطاء بتموّت الكاروسيل" }, architecture: "listicle", brief: { topic: "أخطاء الكاروسيل" } })
  };
})();
