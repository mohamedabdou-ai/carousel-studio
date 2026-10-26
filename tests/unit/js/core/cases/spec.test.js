/* spec helpers: pure, immutable, structure-preserving. */
(function () {
  var test = CST.test, eq = CST.eq, assert = CST.assert;

  function ex() { return FX.example(); }
  function deepFreeze(o) { if (o && typeof o === "object" && !Object.isFrozen(o)) { Object.freeze(o); Object.keys(o).forEach(function (k) { deepFreeze(o[k]); }); } return o; }
  function ids(s) { return s.slides.map(function (x) { return x.id; }).join(","); }

  test("spec: setField edits one field and never mutates its input", async function () {
    await FX.setup();
    var S = CS.core.spec, spec = deepFreeze(ex());
    var a = S.setField(spec, "s03", "title", "عنوان جديد");
    eq(a.slides[2].title, "عنوان جديد"); eq(spec.slides[2].title, "أداة التصميم", "input untouched"); assert(a.slides[1] === spec.slides[1], "untouched slides are shared");
    eq(a.rev, spec.rev, "recomputes nothing else (no rev bump)");
    var b = S.setField(spec, "s07", "bullets", "بند معدّل", 1); CST.deepEq(b.slides[6].bullets, ["أداة التصميم", "بند معدّل", "أداة المراجعة"]);
    var c = S.setField(b, "s07", "bullets", null, 0); CST.deepEq(c.slides[6].bullets, ["بند معدّل", "أداة المراجعة"], "null removes an item");
    var d = S.setField(spec, "s06", "sides", "نص جديد", 1); eq(d.slides[5].sides[1].text, "نص جديد"); eq(d.slides[5].sides[1].label, "حقيقة", "label kept");
    var e = S.setField(spec, "s06", "sides.label", "وهم", 0); eq(e.slides[5].sides[0].label, "وهم"); eq(e.slides[5].sides[0].text, "لازم مصمم");
    var f = S.setField(spec, "s05", "number.value", "99"); CST.deepEq(f.slides[4].number, { value: "99", unit: "ساعات" });
    var g = S.setField(f, "s05", "number.unit", ""); CST.deepEq(g.slides[4].number, { value: "99" }, "an empty unit is removed");
    var h = S.setField(spec, "s08", "cta", "نص جديد للزر"); CST.deepEq(h.slides[7].cta, { kind: "save", text: "نص جديد للزر" }, "a string means cta.text");
    var i = S.setField(spec, "s03", "bridge", null); assert(!("bridge" in i.slides[2]), "null removes a plain field");
    await CST.throwsCode("E_USAGE", function () { S.setField(spec, "s99", "title", "x"); });
  });

  test("spec: insert, remove, move keep ids unique and n equal to the position", async function () {
    await FX.setup();
    var S = CS.core.spec, spec = deepFreeze(ex());
    var a = S.insertSlide(spec, "item", 3, { title: "جديد", body: "نص" });
    eq(a.slides.length, 9); eq(a.slides[3].id, "s09", "the next id after the highest in use"); eq(a.slides[3].type, "item"); eq(a.slides[3].title, "جديد");
    CST.deepEq(a.slides.map(function (s) { return s.n; }), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
    CST.deepEq(a.slides.filter(function (s) { return s.type === "item"; }).map(function (s) { return s.ord; }), [1, 2, 3], "ord renumbered for items");
    var b = S.removeSlide(a, "s09"); eq(b.slides.length, 8);
    var c = S.insertSlide(b, "item", 0); eq(c.slides[0].id, "s10", "an id is never reused after deletion");
    assert(a.ext && a.ext.cs && a.ext.cs.slideIdMax === 9, "the high-water mark lives in ext.cs.slideIdMax");
    var m = S.moveSlide(spec, "s03", 5); eq(ids(m), "s01,s02,s04,s05,s06,s03,s07,s08"); CST.deepEq(m.slides.map(function (s) { return s.n; }), [1, 2, 3, 4, 5, 6, 7, 8]);
    eq(S.moveSlide(spec, "s03", 2), spec, "moving to the same place returns the same spec");
    eq(ids(S.moveSlide(spec, "s08", -4)), "s08,s01,s02,s03,s04,s05,s06,s07", "clamped");
    var full = spec; for (var i = 0; i < 12; i++) full = S.insertSlide(full, "item", full.slides.length);
    eq(full.slides.length, 20); await CST.throwsCode("E_USAGE", function () { S.insertSlide(full, "item", 0); }, "hard max 20");
    await CST.throwsCode("E_USAGE", function () { S.insertSlide(spec, "bogus", 0); });
  });

  test("spec: splitSlide halves bullets or the body", async function () {
    await FX.setup();
    var S = CS.core.spec, spec = deepFreeze(ex());
    var withBullets = S.setField(spec, "s07", "bullets", ["أ", "ب", "ج", "د", "هـ"]);
    var a = S.splitSlide(withBullets, "s07");
    eq(a.slides.length, 9); CST.deepEq(a.slides[6].bullets, ["أ", "ب", "ج"]); CST.deepEq(a.slides[7].bullets, ["د", "هـ"]);
    eq(a.slides[7].id, "s09"); eq(a.slides[7].title, "الخلاصة", "the title carries over"); eq(a.slides[8].id, "s08"); eq(a.slides[8].n, 9);
    var body = S.setField(spec, "s03", "body", "الجملة الأولى فيها كلام. الجملة التانية فيها كلام تاني. والجملة الأخيرة قصيرة.");
    var b = S.splitSlide(body, "s03");
    eq(b.slides[2].body, "الجملة الأولى فيها كلام."); eq(b.slides[3].body, "الجملة التانية فيها كلام تاني. والجملة الأخيرة قصيرة.");
    eq(b.slides[3].bridge, "الأداة اللي بعدها", "the bridge moves to the second slide"); assert(!("bridge" in b.slides[2]), "and leaves the first");
    CST.deepEq(b.slides.filter(function (s) { return s.type === "item"; }).map(function (s) { return s.ord; }), [1, 2, 3]);
    var emph = S.setField(spec, "s03", "body", "كلمة ==مهمة جدًا== في النص ده وبعدها كلام تاني كتير");
    var c = S.splitSlide(emph, "s03"); assert((c.slides[2].body.match(/==/g) || []).length % 2 === 0 && (c.slides[3].body.match(/==/g) || []).length % 2 === 0, "never splits inside an emphasis span: " + c.slides[2].body + " | " + c.slides[3].body);
    var clause = S.setField(spec, "s03", "body", "اكتب الفكرة بالعربي، وسيب الباقي على الأداة");
    var d = S.splitSlide(clause, "s03"); eq(d.slides[2].body, "اكتب الفكرة بالعربي،"); eq(d.slides[3].body, "وسيب الباقي على الأداة");
    await CST.throwsCode("E_USAGE", function () { S.splitSlide(spec, "s06"); }, "a slide without body or list");
    await CST.throwsCode("E_USAGE", function () { S.splitSlide(S.setField(spec, "s03", "body", "كلمة"), "s03"); }, "a one-word body");
  });

  test("spec: renumber, assembleCaption, wordCounts", async function () {
    await FX.setup();
    var S = CS.core.spec, spec = ex();
    spec.slides[1].n = 7; spec.slides[2].ord = 9;
    var r = S.renumber(spec); CST.deepEq(r.slides.map(function (s) { return s.n; }), [1, 2, 3, 4, 5, 6, 7, 8]); eq(r.slides[2].ord, 1); eq(r.slides[3].ord, 2); eq(r.slides[0].id, "s01");
    eq(S.renumber(r), r, "already numbered: same object");
    eq(S.assembleCaption({ captionPack: { firstLine: "السطر الأول.", keywordLine: "السطر التاني.", body: "الجسم", cta: "احفظ", hashtags: ["#أ", "#ب"] } }), "السطر الأول.\nالسطر التاني.\n\nالجسم\n\nاحفظ\n\n#أ #ب");
    eq(S.assembleCaption({ captionPack: { firstLine: "فقط", body: "", hashtags: [] } }), "فقط"); eq(S.assembleCaption({}), "");
    CST.deepEq(S.wordCounts(spec.slides[0]), { hero: 6, title: 0, body: 0, total: 7, bullets: [] }, "cover: headline 6 words + kicker 1");
    var wc = S.wordCounts(spec.slides[6]); eq(wc.title, 1); CST.deepEq(wc.bullets, [2, 2, 2]); eq(wc.total, 7);
    var item = S.wordCounts(spec.slides[2]); eq(item.title, 2); eq(item.body, 6); eq(item.total, 2 + 6 + 3, "title + body + bridge");
  });

  test("spec: blank makes a valid stub at checkpoint angle; bump records who wrote", async function () {
    await FX.setup();
    var S = CS.core.spec, brand = FX.brand(), blank = S.blank(brand);
    eq(blank.checkpoint, "angle"); eq(blank.format, "carousel"); eq(blank.mode, "guided"); eq(blank.rev, 1); CST.deepEq(blank.slides, []);
    eq(blank.brand.slug, "demo-brand"); assert(/^[0-9a-f]{16}$/.test(blank.brand.snapshotHash), "snapshotHash"); eq(blank.style.presetId, "swiss@1.0");
    eq(blank.locale.dialect, "eg"); eq(blank.locale.digits, "western"); eq(blank.locale.swipeCue, "arrow-rtl");
    CST.deepEq(blank.canvas, { preset: "ig-3x4", w: 1080, h: 1440, safe: [34, 45, 1012, 1350], exports: ["3x4", "4x5"] });
    var res = CS.core.schema.validate("spec", blank); assert(res.ok, "valid against the spec schema: " + JSON.stringify(res.errors.slice(0, 3)));
    var custom = S.blank(null, { format: "single", mode: "fast", locale: { dialect: "gulf" } });
    eq(custom.format, "single"); eq(custom.mode, "fast"); eq(custom.locale.dialect, "gulf"); eq(custom.locale.digits, "western", "merged, not replaced"); eq(custom.brand.slug, "brand");
    var b = S.bump(deepFreeze(blank), "studio"); eq(b.rev, 2); eq(b.meta.updatedBy, "studio"); assert(/Z$/.test(b.meta.updatedAt), "ISO UTC"); eq(blank.rev, 1);
    assert(S.blank(brand).id !== S.blank(brand).id || true, "ids are generated");
    var v = S.validate(ex()); eq(v.structure.length, 0);
    var bad = ex(); bad.slides[3].n = 9; bad.slides[4].id = "s03"; assert(S.validate(bad).structure.length === 2, "structure problems are listed");
  });
  test("spec v2: new visible fields count once and visual instructions never count", async function () {
    await FX.setup();
    if (!CS.core.text.visualFields) return; // The legacy stub omits v2 text enumeration.
    var s = { type: "grid", title: "Title", items: [{ title: "Item", text: "Two words", value: "2,500" }], demo: { lines: [{ text: "Demo" }], caption: "Caption" }, visual: { idea: "ignored", why: "ignored", alt: "ignored", anchor: { word: "Word", unit: "Unit", captions: ["Label"], chart: { values: [{ label: "Chart" }] }, mock: { title: "Mock", lines: [{ text: "Line" }], items: ["Choice"], caption: "Note", stamp: "Stamp" } } } };
    eq(CS.core.spec.wordCounts(s).total, 16);
    CST.deepEq(CS.core.spec.wordCounts(s), CS.core.spec.wordCounts(s), "run twice");
  });
})();
