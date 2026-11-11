"use strict";
/* Text-scope gates of cs-qa: C1-C10, O1, N1, B1 (text), SRC1, SEN1, A1. */

const test = require("node:test");
const assert = require("node:assert/strict");
const { load, cleanSpec, clone } = require("./support/env.cjs");

const { CS } = load();
// Results come from another realm (vm context); a JSON round trip makes deepEqual usable.
const plain = (v) => JSON.parse(JSON.stringify(v));
const run = (spec, extra) => plain(CS.qa.runText(Object.assign({ spec }, extra || {})));
const ids = (res) => res.map((r) => r.rule);
const find = (res, rule) => res.filter((r) => r.rule === rule);
const words = (n, w) => Array.from({ length: n }, () => w || "كلمة").join(" ");
const slide = (spec, id) => spec.slides.find((s) => s.id === id);

test("C6: an unnumbered list falls back to the other list layout", () => {
  for (const [architecture, type] of [["steps", "item"], ["listicle", "step"]]) {
    const spec = cleanSpec();
    spec.architecture = architecture;
    spec.slides.forEach((s) => { if (s.type === "item") s.type = type; delete s.ord; });
    spec.slides[0].headline = "4 خطوات لصفحة مشروعك";
    assert.equal(find(run(spec, { gates: ["C6"] }), "C6.list-count")[0]?.sev, "BLOCK", architecture);
    spec.slides[0].headline = "5 خطوات لصفحة مشروعك";
    assert.equal(find(run(spec, { gates: ["C6"] }), "C6.list-count").length, 0, architecture);
  }
});

test("C5: 10 slides pass, 11 block, and 4 through 6 never raise a count FIX", () => {
  for (const n of [4, 5, 6, 10, 11]) {
    const spec = cleanSpec();
    spec.slides = Array.from({ length: n }, (_, i) => ({ id: "s" + String(i + 1).padStart(2, "0"), n: i + 1, type: i === 0 ? "cover" : i === n - 1 ? "cta" : "summary" }));
    const res = run(spec, { gates: ["C5"] }).filter((r) => r.rule.startsWith("C5.slide-count"));
    assert.equal(res.some((r) => r.sev === "BLOCK"), n > 10, String(n));
    assert.equal(res.some((r) => r.sev === "FIX"), false, String(n));
  }
});

test("C6: four numbered proof members exclude context before and after the list", () => {
  const spec = cleanSpec();
  spec.architecture = "steps";
  spec.slides[0].headline = "4 خطوات لصفحة مشروعك";
  spec.slides.forEach((s) => { delete s.ord; });
  spec.slides.slice(2, 6).forEach((s, i) => { s.type = "proof"; s.ord = i + 1; });
  for (const type of ["item", "step", "grid", "timeline"]) {
    spec.slides[1].type = type; // unnumbered context before the list
    spec.slides[6].type = type; // unnumbered context after it
    assert.equal(find(run(spec), "C6.list-count").length, 0, type);
  }
  spec.slides[0].headline = "5 خطوات لصفحة مشروعك";
  assert.equal(find(run(spec), "C6.list-count")[0].sev, "BLOCK");
  spec.slides[6].ord = 4; // a continuation of member 4 is not a fifth member
  assert.equal(find(run(spec), "C6.list-count")[0].sev, "BLOCK");
});

test("C7: creator-script variety findings are NOTE; team-written copy stays FIX", () => {
  const spec = cleanSpec(), history = [{ cta: "save", family: "P1" }];
  const variety = (s) => run(s, { history }).filter((r) => ["C7.cta-repeat", "C7.family-repeat"].includes(r.rule));
  assert.deepEqual(variety(spec).map((r) => r.sev), ["FIX", "FIX"]);
  spec.ext = { source: "creator-script" };
  assert.deepEqual(variety(spec).map((r) => r.sev), ["NOTE", "NOTE"]);
});

test("C1: all cover gates use the first beat as hero and retain the whole total", () => {
  for (const separator of ["؟ ", "? ", "… ", "... ", ": ", "\n"]) {
    const spec = cleanSpec();
    spec.slides[0].headline = "صورة منتجك ثابتة" + separator + "حركها داخل الأداة بخطوة بسيطة الآن";
    delete spec.slides[0].kicker;
    assert.equal(find(run(spec), "C1.hero-words").length, 0, separator);
    spec.slides[0].sub = words(5);
    assert.equal(find(run(spec), "C1.total-words")[0].sev, "BLOCK", separator);
  }
});

test("a clean carousel produces no findings", () => {
  assert.deepEqual(run(cleanSpec()), []);
});

test("every finding is shaped like the qaResult schema", () => {
  const spec = cleanSpec();
  slide(spec, "s01").headline = words(9);
  const res = run(spec);
  assert.ok(res.length > 0);
  res.forEach((r) => {
    assert.match(r.gate, /^[A-Z]{1,3}[0-9]{1,2}$/);
    assert.match(r.rule, /^[A-Z]{1,3}[0-9]{1,2}(\.[a-z0-9-]+)?$/);
    assert.ok(["BLOCK", "FIX", "NOTE"].includes(r.sev));
    assert.ok(r.msg.ar && r.msg.en);
    assert.equal(r.autofixed, false);
    assert.equal(/\{[a-z]+\}/i.test(r.msg.ar + r.msg.en), false, "unresolved placeholder in " + r.rule);
  });
});

/* ---------------------------------------------------------------- C1 */

test("C1: hero, total, lines and spelled-out numbers", () => {
  const spec = cleanSpec();
  const s = slide(spec, "s01");
  s.headline = words(7);
  s.kicker = words(6);
  let res = run(spec);
  assert.deepEqual(ids(res).filter((x) => x.startsWith("C1")), ["C1.hero-words", "C1.total-words"]);
  assert.equal(find(res, "C1.hero-words")[0].sev, "BLOCK");

  s.headline = "سطر\nسطر\nسطر\nسطر";
  s.kicker = "";
  res = run(spec);
  assert.ok(ids(res).includes("C1.lines"));

  s.headline = "خمسة أدوات ببلاش";
  s.kicker = "";
  res = run(spec);
  assert.ok(ids(res).includes("C1.number-words"));
  assert.match(find(res, "C1.number-words")[0].msg.ar, /خمسة/);
});

/* ---------------------------------------------------------------- C2 */

test("C2: body 26-35 words is a FIX, above 35 a BLOCK", () => {
  const spec = cleanSpec();
  const s = slide(spec, "s03");
  s.body = words(30);
  let res = run(spec);
  assert.deepEqual(ids(res), ["C2.body-words"]);
  assert.equal(res[0].sev, "FIX");
  s.body = words(36);
  res = run(spec);
  assert.deepEqual(ids(res), ["C2.body-hard"]);
  assert.equal(res[0].sev, "BLOCK");
});

test("C2: bullets, dense lists, bridge, share and cta length", () => {
  const spec = cleanSpec();
  slide(spec, "s03").bullets = ["a1", "b2", "c3", "d4", "e5"].map((x) => "نقطة " + x);
  slide(spec, "s08").bullets = Array.from({ length: 8 }, (_, i) => words(6, "ب" + i));
  slide(spec, "s04").bridge = words(10);
  const res = run(spec);
  assert.ok(ids(res).includes("C2.bullets"));
  assert.ok(ids(res).includes("C2.dense-words"));
  assert.ok(ids(res).includes("C2.bridge-words"));
  assert.ok(ids(res).includes("C2.slide-words") === false);
  slide(spec, "s09").body = words(12);
  assert.ok(ids(run(spec)).includes("C2.cta-words"));
});

test("C2: more than 50 words on a slide", () => {
  const spec = cleanSpec();
  const s = slide(spec, "s03");
  s.body = words(25);
  s.bullets = [words(14), words(14), words(14)];
  assert.ok(ids(run(spec)).includes("C2.slide-words"));
});

/* ---------------------------------------------------------------- C3 */

test("C3: slide 2 length, intro phrases and type", () => {
  const spec = cleanSpec();
  const s2 = slide(spec, "s02");
  s2.headline = words(13);
  assert.ok(ids(run(spec)).includes("C3.words"));
  s2.headline = "قبل ما نبدأ في الموضوع";
  assert.ok(ids(run(spec)).includes("C3.intro"));
  s2.headline = "الأداة الأولى";
  s2.type = "story-beat";
  s2.body = "نص";
  assert.ok(ids(run(spec)).includes("C3.type"));
});

/* ---------------------------------------------------------------- C4 */

test("C4: count, kinds, position, early, intent, bait and keyword-dm", () => {
  let spec = cleanSpec();
  delete slide(spec, "s09").cta;
  assert.ok(ids(run(spec)).includes("C4.count"));

  spec = cleanSpec();
  slide(spec, "s08").cta = { kind: "send", text: "ابعته لصاحبك اللي محتاجه" };
  let res = run(spec);
  assert.ok(ids(res).includes("C4.multiple"));
  assert.equal(find(res, "C4.multiple")[0].msg.en.includes("2"), true);

  spec = cleanSpec();
  slide(spec, "s03").cta = { kind: "save", text: "احفظه" };
  res = run(spec);
  assert.ok(ids(res).includes("C4.position"));
  assert.ok(ids(res).includes("C4.early"));

  spec = cleanSpec();
  spec.intent = "reach";
  res = run(spec);
  assert.ok(ids(res).includes("C4.intent"));
  assert.match(find(res, "C4.intent")[0].msg.ar, /حفظ/);

  spec = cleanSpec();
  slide(spec, "s09").cta = { kind: "question", text: "اكتب نعم لو عجبك" };
  assert.ok(ids(run(spec)).includes("C4.bait"));

  spec = cleanSpec();
  spec.intent = "sell";
  slide(spec, "s09").cta = { kind: "keyword-dm", text: "ابعت الكلمة" };
  assert.ok(ids(run(spec)).includes("C4.keyword-asset"));
  spec.captionPack = { asset: { keyword: "دليل", delivery: "instant" } };
  assert.equal(ids(run(spec)).includes("C4.keyword-asset"), false);
});

test("C4: an offer slide and the closing slide may share one CTA kind", () => {
  const spec = cleanSpec();
  const o = slide(spec, "s03");
  o.type = "offer";
  o.cta = { kind: "save", text: "احفظ العرض" };
  const res = run(spec);
  assert.equal(ids(res).includes("C4.early"), false);
  assert.equal(ids(res).includes("C4.multiple"), false);
});

/* ---------------------------------------------------------------- C5 / C6 */

test("C5: slide count tiers, skeleton and bridges", () => {
  const spec = cleanSpec();
  spec.slides = spec.slides.slice(0, 1).concat(spec.slides.slice(-1));
  let res = run(spec);
  assert.ok(ids(res).includes("C5.slide-count-low"));
  assert.equal(find(res, "C5.slide-count-low")[0].sev, "FIX");

  const six = cleanSpec();
  six.slides = six.slides.slice(0, 5).concat(six.slides.slice(-1));
  res = run(six);
  assert.equal(find(res, "C5.slide-count-range").length, 0);
  assert.equal(ids(res).includes("C5.slide-count-low"), false);

  const one = cleanSpec();
  one.slides = one.slides.slice(0, 1);
  assert.equal(find(run(one), "C5.slide-count")[0].sev, "BLOCK");

  const noBridge = cleanSpec();
  delete slide(noBridge, "s04").bridge;
  assert.deepEqual(find(run(noBridge), "C5.bridge").map((r) => r.slide), ["s04"]);

  const odd = cleanSpec();
  slide(odd, "s09").type = "summary";
  slide(odd, "s09").bullets = ["a"];
  delete slide(odd, "s09").cta;
  assert.ok(ids(run(odd)).includes("C5.skeleton"));
});

test("C5: a post with no slides yet (checkpoint angle) raises nothing", () => {
  const spec = cleanSpec();
  spec.slides = [];
  spec.checkpoint = "angle";
  assert.deepEqual(run(spec), []);
});

test("C6: the cover number must equal the item slides", () => {
  const spec = cleanSpec();
  slide(spec, "s01").headline = "7\u00A0أدوات ببلاش تغنيك";
  const res = run(spec);
  assert.deepEqual(ids(res), ["C6.list-count", "C6.slide2-promise"], "slide 2 still says 5");
  assert.equal(res[0].sev, "BLOCK");
  slide(spec, "s01").headline = "5\u00A0أدوات بدل 7\u00A0برامج";
  assert.deepEqual(run(spec), []);
  slide(spec, "s01").headline = "أدوات ببلاش بلا رقم";
  assert.deepEqual(run(spec), []);
});

test("C6: slide 2 must carry the cover's count or name the first item (a viewer re-served from slide 2 never saw the cover)", () => {
  const spec = cleanSpec();
  slide(spec, "s02").headline = "الأداة الأولى توفر لك وقتًا";
  let res = run(spec);
  assert.deepEqual(ids(res), ["C6.slide2-promise"]);
  assert.equal(res[0].sev, "FIX");
  assert.equal(res[0].slide, "s02");
  assert.match(res[0].msg.ar, /5/);

  slide(spec, "s02").headline = "الأداة الأولى: مصمم الشرائح توفر لك وقتًا";
  assert.deepEqual(run(spec), [], "naming the first item's title is enough");

  slide(spec, "s02").headline = "الأداة الأولى توفر لك وقتًا";
  slide(spec, "s02").sub = "٥ أدوات";
  assert.deepEqual(ids(run(spec)).filter((x) => x === "C6.slide2-promise"), [], "Arabic-Indic digits count as the same number");

  const item = cleanSpec();
  item.slides[1] = Object.assign({}, item.slides[1], { type: "item", title: "أول أداة", body: "تكتب الفكرة وتطلع لك سلايدات جاهزة." });
  assert.deepEqual(ids(run(item)).filter((x) => x === "C6.slide2-promise"), [], "an item slide in position 2 is the first item");

  const other = cleanSpec();
  other.architecture = "comparison";
  slide(other, "s02").headline = "الأداة الأولى توفر لك وقتًا";
  assert.deepEqual(ids(run(other)).filter((x) => x === "C6.slide2-promise"), [], "only counted architectures are checked");

  const none = cleanSpec();
  slide(none, "s01").headline = "أدوات ببلاش بلا رقم";
  slide(none, "s02").headline = "الأداة الأولى توفر لك وقتًا";
  assert.deepEqual(run(none), [], "a cover that promises no count has nothing to repeat");
});

/* ---------------------------------------------------------------- D8 */

test("D8: no run of more than three slides with the same type and variant", () => {
  const spec = cleanSpec();
  spec.slides.forEach((s) => { if (s.type === "item") delete s.variant; });
  let res = run(spec);
  assert.deepEqual(ids(res), ["D8.rhythm"], "five identical item slides in a row");
  assert.equal(res[0].sev, "FIX");
  assert.equal(res[0].slide, "s06", "reported on the first slide past the limit of three");
  assert.match(res[0].msg.en, /^5 slides in a row/);

  slide(spec, "s05").variant = "ghost-number";
  assert.deepEqual(run(spec), [], "3 + 1 + 1: no run is longer than three");

  const four = cleanSpec();
  four.slides.forEach((s) => { if (s.type === "item") s.variant = "base"; });
  slide(four, "s07").variant = "ghost-number";
  assert.deepEqual(ids(run(four)), ["D8.rhythm"], "four identical slides, then a different one");

  const single = cleanSpec();
  single.format = "single";
  assert.deepEqual(ids(run(single)).filter((x) => x === "D8.rhythm"), [], "carousels only");
});

/* ---------------------------------------------------------------- B2 */

test("B2: a copied example handle, name or series label in the header is a BLOCK", () => {
  const brand = { slug: "demo-brand", name: "ورشة المحتوى", handle: "@content.workshop.demo" };
  assert.deepEqual(ids(run(cleanSpec(), { brand })), [], "a real brand passes");
  assert.deepEqual(ids(run(cleanSpec())), [], "no brand, nothing to judge");

  ["@yourbrand", "@YourBrand", "your_brand", "@your.handle", "yourbrand", "@<handle>", "@", "@example", "@username", "@brand_name"].forEach((h) => {
    const res = run(cleanSpec(), { brand: Object.assign({}, brand, { handle: h }) });
    assert.deepEqual(ids(res), ["B2.placeholder-chrome"], h);
    assert.equal(res[0].sev, "BLOCK");
    assert.match(res[0].msg.en, /handle/);
  });
  ["براند تجريبي", "اسم البراند", "Your Brand", "{{name}}"].forEach((n) => {
    assert.deepEqual(ids(run(cleanSpec(), { brand: Object.assign({}, brand, { name: n }) })), ["B2.placeholder-chrome"], n);
  });
  const spec = cleanSpec();
  spec.style = { presetId: "swiss@1.0", metaLabel: "Meta label" };
  assert.deepEqual(ids(run(spec, { brand })), ["B2.placeholder-chrome"]);
  spec.style.metaLabel = "فحص قبل النشر";
  assert.deepEqual(ids(run(spec, { brand })), []);
  assert.deepEqual(ids(run(cleanSpec(), { brand: Object.assign({}, brand, { handle: "@mybrand.eg" }) })), [], "a real handle that merely starts like an example word");
  assert.deepEqual(ids(run(cleanSpec(), { brand: Object.assign({}, brand, { handle: "" }) })), [], "an empty handle is fine: the slot is left out");
});

/* ---------------------------------------------------------------- C7 */

test("C7: repeated CTA kind, hook family and hook text", () => {
  const spec = cleanSpec();
  const history = [
    { postId: "post-old-000001", family: "P4", cta: "send", cover: "شيء مختلف تماما هنا" },
    { postId: "post-old-000002", family: "P1", cta: "save", cover: "5 أدوات ببلاش تغنيك عن المصمم" }
  ];
  const res = run(spec, { history });
  ["C7.cta-repeat", "C7.family-repeat", "C7.hook-similar"].forEach((r) => assert.ok(ids(res).includes(r), r));
  assert.equal(ids(run(spec, { history: history.slice(0, 1) })).includes("C7.cta-repeat"), false);
  const lim = run(spec, { history, familyLimits: { P1: { posts: 5, count: 1 } } });
  assert.ok(ids(lim).includes("C7.max-use"));
});

/* ---------------------------------------------------------------- C8 */

test("C8: AI words, stock openers, hype and abstract words", () => {
  const spec = cleanSpec();
  slide(spec, "s03").body = "أطلق العنان لقدراتك وحقق نقلة نوعية";
  slide(spec, "s02").headline = "هل تساءلت يوما عن الأدوات";
  slide(spec, "s04").body = "الحقيقة الصادمة عن الشرائح";
  slide(spec, "s05").body = "رحلة شغف مع الأداة";
  const res = run(spec);
  ["C8.ai-words", "C8.stock-opener", "C8.hype", "C8.abstract"].forEach((r) => assert.ok(ids(res).includes(r), r));
  assert.equal(find(res, "C8.abstract")[0].sev, "NOTE");
});

test("C8: a stock opener in the middle of a sentence is not flagged", () => {
  const spec = cleanSpec();
  slide(spec, "s02").headline = "اسأل نفسك هل تساءلت يوما";
  assert.equal(ids(run(spec)).includes("C8.stock-opener"), false);
});

/* ---------------------------------------------------------------- C9 */

function captioned() {
  const spec = cleanSpec();
  const n = spec.slides.length;
  spec.captionPack = {
    firstLine: "مش لازم تدفع لمصمم عشان بوستك يطلع محترف",
    keywordLine: "جمعتلك أدوات ببلاش لتصميم الكاروسيل بالعربي.",
    body: ["الأولى", "الثانية", "الثالثة", "الرابعة", "الخامسة", "السادسة", "السابعة", "الثامنة", "التاسعة", "العاشرة", "الحادية", "الأخيرة"]
      .map((n) => "الفقرة " + n + " فيها فكرة كاملة تستحق الحفظ والمشاركة")
      .join("\n"),
    cta: "احفظ البوست وابعته لصاحبك.",
    hashtags: ["#كاروسيل", "#تصميم"],
    perSlide: Array.from({ length: n }, (_, i) => "كابشن " + (i + 1)),
    alt: Array.from({ length: n }, (_, i) => "وصف السلايد " + (i + 1))
  };
  return spec;
}

test("C9: a complete caption pack passes", () => {
  const spec = captioned();
  assert.deepEqual(run(spec), []);
});

test("C9: length band, hard cap, first line, hashtags and per-slide texts", () => {
  let spec = captioned();
  spec.captionPack.body = "قصير";
  let res = run(spec);
  assert.ok(ids(res).includes("C9.length"));
  spec.mode = "fast";
  spec.captionPack.body = "x".repeat(60);
  spec.captionPack.firstLine = "";
  res = run(spec);
  assert.equal(find(res, "C9.length").length + find(res, "C9.short-caption").length >= 1, true);

  spec = captioned();
  spec.captionPack.body = "ن".repeat(2300);
  assert.equal(find(run(spec), "C9.length-hard")[0].sev, "BLOCK");

  spec = captioned();
  spec.captionPack.firstLine = "ك".repeat(130);
  assert.ok(ids(run(spec)).includes("C9.first-line"));

  spec = captioned();
  spec.captionPack.hashtags = ["#أ", "#ب", "#ج", "#د", "#هـ", "#و"];
  assert.ok(ids(run(spec)).includes("C9.hashtags"));
  spec.captionPack.hashtags = ["#أ", "#أ"];
  assert.ok(ids(run(spec)).includes("C9.hashtags-form"));

  spec = captioned();
  spec.captionPack.perSlide[2] = "";
  spec.captionPack.alt.pop();
  spec.captionPack.keywordLine = "";
  res = run(spec);
  assert.deepEqual(find(res, "C9.per-slide").map((r) => r.slide), ["s03"]);
  assert.deepEqual(find(res, "C9.alt-missing").map((r) => r.slide), ["s09"]);
  assert.ok(ids(res).includes("C9.keyword-line"));
});

test("C9: first line that repeats the cover", () => {
  const spec = captioned();
  spec.captionPack.firstLine = "5 أدوات ببلاش تغنيك عن المصمم";
  assert.ok(ids(run(spec)).includes("C9.first-line-similarity"));
});

test("C9: from checkpoint design a missing caption pack is reported", () => {
  const spec = cleanSpec();
  spec.checkpoint = "design";
  const res = run(spec);
  assert.ok(ids(res).includes("C9.length"));
  assert.equal(find(res, "C9.per-slide").length, spec.slides.length);
});

/* --------------------------------------------------------------- C10 */

test("C10: text copied from a source excerpt", () => {
  const spec = cleanSpec();
  const excerpt = "سلاسل متصلة من الأدوات الذكية تساعد المصممين المبتدئين على إنتاج شرائح متقنة في وقت قصير جدا";
  spec.sources = [{ id: "src1", kind: "url", ref: "https://example.com/a", excerpt }];
  slide(spec, "s03").body = excerpt;
  const res = run(spec);
  assert.deepEqual(find(res, "C10.overlap-block").map((r) => r.slide), ["s03"]);
  assert.equal(find(res, "C10.overlap-block")[0].sev, "BLOCK");
  slide(spec, "s03").body = "سلاسل متصلة من الأدوات الذكية تساعد المصممين المبتدئين ثم أضفت رأيي الشخصي وتجربتي فيها";
  assert.ok(ids(run(spec)).some((r) => r.startsWith("C10.overlap")));
});

/* ---------------------------------------------------------------- O1 */

test("O1: dialect deny markers follow the post dialect", () => {
  const spec = cleanSpec();
  slide(spec, "s03").body = "شنو كل أداة تنفع";
  let res = run(spec);
  assert.ok(ids(res).includes("O1.deny-marker"));
  assert.equal(find(res, "O1.deny-marker")[0].sev, "BLOCK");
  spec.locale.dialect = "gulf";
  res = run(spec);
  assert.equal(find(res, "O1.deny-marker").length, 0);
});

test("O1: words in brand.voice.allow are not flagged", () => {
  const spec = cleanSpec();
  slide(spec, "s03").body = "شنو كل أداة تنفع";
  const res = run(spec, { brand: { voice: { allow: ["شنو"] } } });
  assert.equal(find(res, "O1.deny-marker").length, 0);
});

test("O1: ortho.json word-map rules become O1.<rule id> findings", () => {
  const { CS: C } = load({
    ortho: {
      clitics: ["و", "ب", "ال"],
      rules: [{ id: "ORTHO-HAMZA-001", kind: "word-map", sev: "FIX", confidence: 0.95, autofix: false, clitics: true, map: { انشاء: "إنشاء" }, msg: { ar: "همزة: «{original}» ← «{fix}»", en: "Hamza: {original} -> {fix}" } }]
    }
  });
  const spec = cleanSpec();
  slide(spec, "s03").body = "انشاء المحتوى وبانشاء الحساب";
  const res = C.qa.runText({ spec });
  const o = res.filter((r) => r.rule === "O1.ortho-hamza-001");
  assert.equal(o.length, 1, "one finding per distinct word");
  assert.equal(o[0].gate, "O1");
  assert.equal(o[0].el, "s03.body");
  assert.match(o[0].msg.en, /Hamza: انشاء -> إنشاء/);
  assert.equal(C.qa.isAutofixable(o[0]), false);
});

/* ---------------------------------------------------------------- N1 */

test("N1: mixed, Persian, wrong system and percent signs", () => {
  const spec = cleanSpec();
  slide(spec, "s03").body = "وفر 5 ساعات و٣ أيام";
  assert.ok(ids(run(spec)).includes("N1.mixed"));

  const p = cleanSpec();
  slide(p, "s03").body = "وفر ۵ ساعات";
  assert.ok(ids(run(p)).includes("N1.persian"));

  const a = cleanSpec();
  slide(a, "s03").body = "وفر ٥\u00A0ساعات";
  const res = run(a);
  assert.ok(ids(res).includes("N1.system"));
  assert.match(find(res, "N1.system")[0].msg.ar, /غربية/);

  const ai = cleanSpec();
  ai.locale.digits = "arabic-indic";
  slide(ai, "s03").body = "وفر ٥\u00A0ساعات";
  const res2 = run(ai);
  assert.deepEqual(find(res2, "N1.system").map((r) => r.el), ["s01.headline", "s02.headline"], "only the Western cover and slide-2 digits break an Arabic-Indic post");

  const pct = cleanSpec();
  slide(pct, "s03").body = "زادت 50٪ في شهر";
  assert.ok(ids(run(pct)).includes("N1.percent"));
});

test("N1: digits inside handles, tags and Latin tokens are ignored", () => {
  const spec = cleanSpec();
  slide(spec, "s03").body = "تابع @user_1990 على #tag٣ مع GPT4 و4K";
  assert.equal(ids(run(spec)).filter((r) => r.startsWith("N1")).length, 0);
});

/* ---------------------------------------------------------------- B1 */

test("B1: caption text is not NBSP-bound (it is posted as plain text)", () => {
  const spec = captioned();
  spec.captionPack.body = spec.captionPack.body + "\nوفر 5 ساعات كل أسبوع";
  assert.equal(ids(run(spec)).includes("B1.unbound-pair"), false);
  slide(spec, "s03").body = "وفر 5 ساعات كل أسبوع";
  assert.equal(ids(run(spec)).includes("B1.unbound-pair"), true);
});

test("B1: stranded prefixes and unbound number+noun pairs", () => {
  const spec = cleanSpec();
  slide(spec, "s03").body = "استخدم لـ ChatGPT وبـ 20 دولار";
  const res = run(spec);
  assert.equal(find(res, "B1.stranded-lam").length, 2);

  const u = cleanSpec();
  slide(u, "s03").body = "وفر 5 ساعات كل أسبوع";
  const r2 = run(u);
  assert.deepEqual(ids(r2).filter((r) => r.startsWith("B1")), ["B1.unbound-pair"]);
  assert.equal(r2.find((r) => r.rule === "B1.unbound-pair").sev, "FIX");
});

/* ---------------------------------------------------------------- SRC1 */

test("SRC1: numbers with units need a source", () => {
  const spec = cleanSpec();
  slide(spec, "s03").body = "توفر 5\u00A0ساعات كل أسبوع";
  let res = run(spec);
  assert.ok(ids(res).includes("SRC1.missing"));
  assert.equal(find(res, "SRC1.missing")[0].sev, "BLOCK");

  // counts, steps, years and list sizes are not claims
  const ok = cleanSpec();
  slide(ok, "s03").body = "في عام 2026 جربت الخطوة 3 من 5";
  assert.equal(ids(run(ok)).includes("SRC1.missing"), false);

  // a user attestation clears it
  spec.sources = [{ id: "src1", kind: "user", ref: "user-attested", excerpt: "بيوفر حوالي 5 ساعات", verified: true }];
  slide(spec, "s03").sourceIds = ["src1"];
  assert.equal(ids(run(spec)).some((r) => r.startsWith("SRC1")), false);

  // a linked source that lacks the number
  spec.sources[0].excerpt = "بيوفر حوالي 9 ساعات";
  assert.ok(ids(run(spec)).includes("SRC1.mismatch"));

  // an unverified source
  spec.sources[0].excerpt = "بيوفر حوالي 5 ساعات";
  spec.sources[0].verified = false;
  assert.ok(ids(run(spec)).includes("SRC1.unverified"));
});

test("SRC1: a stat slide always needs a source and Arabic-Indic digits match Western ones", () => {
  const spec = cleanSpec();
  const s = slide(spec, "s03");
  s.type = "stat";
  s.number = { value: "1200", unit: "جنيه" };
  delete s.body;
  let res = run(spec);
  assert.ok(ids(res).includes("SRC1.missing"));
  spec.sources = [{ id: "src1", kind: "file", ref: "report.pdf", excerpt: "بلغ المتوسط ١٬٢٠٠ جنيه" }];
  s.sourceIds = ["src1"];
  res = run(spec);
  assert.equal(ids(res).some((r) => r.startsWith("SRC1")), false);
});

/* ---------------------------------------------------------------- SEN1 */

test("SEN1: Gulf naming, religious text in promotions, conspiracy and fear stacking", () => {
  const spec = cleanSpec();
  spec.locale.dialect = "gulf";
  slide(spec, "s03").body = "سوق الخليج الفارسي يكبر";
  assert.ok(ids(run(spec)).includes("SEN1.gulf-name"));
  spec.locale.dialect = "eg";
  assert.equal(ids(run(spec)).includes("SEN1.gulf-name"), false);
  assert.ok(ids(run(spec, { brand: { locale: { countries: ["AE"] } } })).includes("SEN1.gulf-name"));

  const promo = cleanSpec();
  promo.contentType = "soft-sell";
  slide(promo, "s03").body = "﴿وقل رب زدني علما﴾";
  assert.ok(ids(run(promo)).includes("SEN1.religious-promo"));
  promo.contentType = "value";
  assert.equal(ids(run(promo)).includes("SEN1.religious-promo"), false);

  const c = cleanSpec();
  slide(c, "s03").body = "اللي مش عايزينك تعرفه عن الشرائح";
  assert.ok(ids(run(c)).includes("SEN1.conspiracy"));

  const f = cleanSpec();
  slide(f, "s03").body = "كارثة وخطر وانهيار وفشل";
  assert.ok(ids(run(f)).includes("SEN1.fear-stacking"));
});

/* ---------------------------------------------------------------- A1 */

test("A1: AI media must be flagged, checked by the user and have a calm zone", () => {
  const spec = cleanSpec();
  const s = slide(spec, "s03");
  s.media = { slot: "plate", ai: true, assetId: "plate1" };
  spec.assets = [{ id: "plate1", kind: "image", ref: "asset:plate1", aiGenerated: false }];
  let res = CS.qa.runExport({ spec, files: [] });
  return res.then((r) => {
    assert.ok(ids(r).includes("A1.flag"));
    assert.ok(ids(r).includes("A1.calm-zone"));
    assert.ok(ids(r).includes("A1.text-check"));
    spec.assets[0].aiGenerated = true;
    s.media.calmZone = "top";
    spec.ext = { assetChecks: { plate1: { textChecked: true, at: "2026-10-22T10:00:00Z" } } };
    return CS.qa.runExport({ spec, files: [] }).then((r2) => assert.equal(ids(r2).some((x) => x.startsWith("A1")), false));
  });
});

/* --------------------------------------------------- slide filter / gates */

test("opts.gates limits the run and opts.slides limits the results", () => {
  const spec = cleanSpec();
  slide(spec, "s01").headline = words(8);
  slide(spec, "s03").body = words(40);
  assert.deepEqual([...new Set(CS.qa.runText({ spec }, { gates: ["C2"] }).map((r) => r.gate))], ["C2"]);
  assert.deepEqual([...new Set(CS.qa.runText({ spec }, { slides: ["s03"] }).map((r) => r.slide))], ["s03"]);
});

test("results are sorted by severity, then gate order, then slide", () => {
  const spec = cleanSpec();
  slide(spec, "s05").body = words(40);
  slide(spec, "s03").body = words(40);
  slide(spec, "s01").headline = words(8);
  const res = run(spec);
  const sevRank = { BLOCK: 0, FIX: 1, NOTE: 2 };
  for (let i = 1; i < res.length; i++) assert.ok(sevRank[res[i - 1].sev] <= sevRank[res[i].sev]);
  assert.equal(res[0].gate, "C1");
});


test("A1: free pictures and cover logos require their own image inspection", async () => {
  const spec = cleanSpec(); spec.slides.forEach(s => { delete s.media; });
  spec.assets = ["free-ai", "logo-ai"].map(id => ({ id, kind: "image", ref: "asset:" + id, aiGenerated: true }));
  spec.cover = Object.assign({}, spec.cover, { logo: { assetId: "logo-ai" } });
  slide(spec, "s03").free = { html: '<div data-picture="free-ai"></div>' };
  const check = async () => plain(await CS.qa.runExport({ spec, files: [] })).filter(r => r.gate === "A1");
  assert.deepEqual((await check()).map(r => r.el).sort(), ["s01.logo", "s03.picture.free-ai"]);
  spec.ext = { assetChecks: { "free-ai": { textChecked: true }, "logo-ai": { textChecked: true } } };
  assert.deepEqual(await check(), []);
});

test("A1: free picture forms decode numeric ids, deduplicate and ignore unused assets", async () => {
  const spec = cleanSpec(); spec.slides.forEach(s => { delete s.media; });
  spec.assets = ["gen-one", "gen-two", "unused"].map(id => ({ id, kind: "image", ref: "asset:" + id, aiGenerated: true }));
  slide(spec, "s03").free = { html: "<div data-picture='gen&#45;one'></div><div data-picture=gen-one></div><DIV\ndata-picture=\"gen-two\"></DIV><p>&lt;div data-picture='unused'&gt;</p>" };
  const res = plain(await CS.qa.runExport({ spec, files: [] })).filter(r => r.gate === "A1");
  assert.deepEqual(res.map(r => r.el), ["s03.picture.gen-one", "s03.picture.gen-two"]);
  assert.equal(res[0].rule, "A1.text-check");
});

test("A1: upload ids do not borrow another asset record's inspection", async () => {
  const spec = cleanSpec(); spec.slides.forEach(s => { delete s.media; });
  spec.assets = [{ id: "view", kind: "image", ref: "asset:uploaded", aiGenerated: true }, { id: "uploaded", kind: "image", ref: "data:image/png;base64,AA==", aiGenerated: true }];
  slide(spec, "s03").free = { html: '<div data-picture="view"></div>' };
  const check = async () => plain(await CS.qa.runExport({ spec, files: [] })).filter(r => r.gate === "A1");
  spec.ext = { assetChecks: { uploaded: { textChecked: true } } };
  assert.equal((await check())[0].rule, "A1.text-check");
  spec.ext.assetChecks.view = { textChecked: true };
  assert.deepEqual(await check(), []);
});

test("A1: a free placeholder keeps the original media checks when it uses that asset", async () => {
  const spec = cleanSpec(), s = slide(spec, "s03");
  s.media = { slot: "photo", ai: true, assetId: "same", calmZone: "none" };
  s.free = { html: '<div data-picture="same"></div><div data-picture="same"></div>' };
  spec.assets = [{ id: "same", kind: "image", ref: "asset:same", aiGenerated: false }];
  const res = plain(await CS.qa.runExport({ spec, files: [] })).filter(r => r.gate === "A1");
  assert.deepEqual(res.map(r => r.rule).sort(), ["A1.calm-zone", "A1.flag", "A1.text-check"]);
});
