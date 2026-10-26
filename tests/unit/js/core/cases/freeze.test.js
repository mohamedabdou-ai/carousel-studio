/* freeze: capture at approval, verify while it still matches, apply for deterministic exports. */
(function () {
  var test = CST.test, eq = CST.eq, assert = CST.assert;

  function ex(patch) { var s = FX.example(); s.style.overrides = {}; if (patch) patch(s); return s; }
  function q(el, sel) { return el.querySelector(sel); }
  function qa(el, sel) { return Array.prototype.slice.call(el.querySelectorAll(sel)); }

  async function frozenDeck(spec) {
    var deck = await CS.core.render.deck(spec, FX.brand(), { mode: "export", useFrozen: false });
    var frozen = CS.core.freeze.capture(deck.slides, spec, deck.tokens);
    return { deck: deck, frozen: frozen, tokens: deck.tokens };
  }

  test("freeze: capture produces a block the spec schema accepts", async function () {
    await FX.setup();
    var spec = ex(), f = await frozenDeck(spec);
    try {
      eq(f.frozen.engine, CS.version); assert(/^[0-9a-f]{16}$/.test(f.frozen.tokensHash), "tokensHash"); assert(/^\d{4}-\d\d-\d\dT[\d:.]+Z$/.test(f.frozen.approvedAt), "approvedAt " + f.frozen.approvedAt);
      assert(f.frozen.sizes["s01.headline"] >= 96 && Object.keys(f.frozen.sizes).every(function (k) { return Number.isInteger(f.frozen.sizes[k]); }), "integer sizes");
      assert(f.frozen.lines["s01.headline"].length >= 2 && f.frozen.lines["s03.body"].length >= 1, "lines of text slots");
      assert(!("s05.number" in f.frozen.lines), "the figure has no words, hence no lines");
      assert(Object.keys(f.frozen.sizes).indexOf("s03.ord") < 0, "css-sized slots are not frozen");
      var res = CS.core.schema.validate("spec", Object.assign({}, spec, { frozen: f.frozen }));
      assert(res.ok, "schema: " + JSON.stringify(res.errors.slice(0, 2)));
    } finally { f.deck.dispose(); }
  });

  test("freeze: verify says why a frozen layout no longer applies", async function () {
    await FX.setup();
    var spec = ex(), f = await frozenDeck(spec);
    try {
      var frozenSpec = Object.assign({}, spec, { frozen: f.frozen });
      CST.deepEq(CS.core.freeze.verify(frozenSpec, f.tokens), { ok: true, reasons: [] });
      CST.deepEq(CS.core.freeze.verify(spec, f.tokens), { ok: false, reasons: [] }, "nothing frozen");

      var edited = CS.core.spec.setField(frozenSpec, "s03", "body", "جملة تانية خالص مختلفة عن الأولى");
      CST.deepEq(CS.core.freeze.verify(edited, f.tokens).reasons, ["text"]);
      var punct = CS.core.spec.setField(frozenSpec, "s03", "body", "تكتب الفكرة  وتطلعلك السلايدات جاهزة بخطوطها"), v = CS.core.freeze.verify(punct, f.tokens);
      assert(v.ok, "punctuation and spacing alone do not invalidate the layout: " + JSON.stringify(v));

      var restyled = Object.assign({}, frozenSpec, { style: Object.assign({}, spec.style, { overrides: { "roles.accent": "#112233" } }) });
      CST.deepEq(CS.core.freeze.verify(restyled, CS.core.resolve.post(restyled, FX.brand())).reasons, ["tokens"]);
      var reslide = Object.assign({}, frozenSpec, { slides: frozenSpec.slides.map(function (s, i) { return i === 2 ? Object.assign({}, s, { overrides: { "roles.accent": "#112233" } }) : s; }) });
      CST.deepEq(CS.core.freeze.verify(reslide, f.tokens).reasons, ["tokens"], "a per-slide override is part of the hash");

      var old = Object.assign({}, frozenSpec, { frozen: Object.assign({}, f.frozen, { engine: "cs-0.9.0" }) });
      CST.deepEq(CS.core.freeze.verify(old, f.tokens).reasons, ["engine"]);
      var noFont = JSON.parse(JSON.stringify(f.tokens)); noFont.fonts = ["alexandria", "not-a-font"];
      assert(CS.core.freeze.verify(frozenSpec, noFont).reasons.indexOf("fonts") >= 0, "a font without any @font-face is reported (the font list is part of the tokens, so tokens differ too)");
    } finally { f.deck.dispose(); }
  });

  test("freeze: tokensHash is the hash of {post, slides} per CONTRACT 3.2", async function () {
    await FX.setup();
    var spec = ex(function (s) { s.slides[2].variant = "base"; s.slides[3].overrides = { "roles.accent": "#445566" }; });
    var tokens = CS.core.resolve.post(spec, FX.brand());
    var expected = CS.core.canon.hash({ post: CS.core.canon.hashable(tokens), slides: spec.slides.map(function (s) { return [s.id, s.variant || null, CS.core.canon.hash(s.overrides || {}), CS.core.canon.hash([s.visual || null, s.items || null, s.demo || null])]; }) });
    eq(CS.core.freeze.tokensHash(tokens, spec), expected);
  });

  test("freeze: a frozen deck is rendered with the approved sizes and lines", async function () {
    await FX.setup();
    var spec = ex(), f = await frozenDeck(spec), sizes = {}, lines = {};
    CS.core.compose.slots(f.deck.slides[0].el).forEach(function (s) { sizes[s.key] = parseFloat(s.el.style.fontSize); });
    var approved = Object.assign({}, spec, { frozen: f.frozen });
    f.deck.dispose();
    var deck = await CS.core.render.deck(approved, FX.brand(), { mode: "export" });
    try {
      eq(deck.frozenOk, true);
      var h = q(deck.slides[0].el, ".cs-headline");
      eq(parseFloat(h.style.fontSize), f.frozen.sizes["s01.headline"], "frozen size applied");
      CST.deepEq(CS.core.fit.measureLines(h).text, f.frozen.lines["s01.headline"], "frozen lines reproduced");
      assert(qa(h, ".cs-ln").length === f.frozen.lines["s01.headline"].length, "built as .cs-ln blocks");
      deck.slides.forEach(function (r) { assert(r.fit.ok, r.id + " report ok"); });
      var other = await CS.core.render.deck(CS.core.spec.setField(approved, "s03", "title", "عنوان جديد"), FX.brand(), { mode: "export" });
      eq(other.frozenOk, false, "an edit switches the frozen layout off"); other.dispose();
      var forced = await CS.core.render.deck(approved, FX.brand(), { mode: "export", useFrozen: false }); eq(forced.frozenOk, false, "useFrozen:false"); forced.dispose();
    } finally { deck.dispose(); }
  });

  test("freeze: explicit lines hold even when the natural flow would differ", async function () {
    await FX.setup();
    var spec = ex(), f = await frozenDeck(spec), approved = Object.assign({}, spec, { frozen: f.frozen });
    f.deck.dispose();
    var narrower = document.createElement("style"); narrower.textContent = '.cs-slide .cs-content{ inset-inline: 200px !important; }'; document.head.appendChild(narrower);
    try {
      var deck = await CS.core.render.deck(approved, FX.brand(), { mode: "export" });
      var h = q(deck.slides[0].el, ".cs-headline");
      CST.deepEq(CS.core.fit.measureLines(h).text, f.frozen.lines["s01.headline"], "same lines in a narrower box");
      var natural = await CS.core.render.deck(approved, FX.brand(), { mode: "export", useFrozen: false });
      assert(CS.core.fit.measureLines(q(natural.slides[0].el, ".cs-headline")).text.length >= f.frozen.lines["s01.headline"].length, "while the natural flow adapts");
      natural.dispose(); deck.dispose();
    } finally { narrower.remove(); }
  });

  test("freeze: apply leaves a slot alone when its words no longer match the frozen lines", async function () {
    await FX.setup();
    var spec = ex(), f = await frozenDeck(spec), broken = JSON.parse(JSON.stringify(f.frozen));
    f.deck.dispose();
    broken.lines["s03.body"] = ["كلمة وحدة"];
    var r = await CS.core.render.slide(spec, FX.brand(), 2, { mode: "edit", useFrozen: false });
    CS.core.freeze.apply(r.el, broken);
    assert(!qa(r.el, ".cs-body .cs-ln").length, "no .cs-ln built from mismatching counts");
    assert(qa(r.el, ".cs-body .w").length > 2, "the words are still there");
    r.el.remove();
  });
  test("freeze v2: new keys resolve, visual state copies and approved 520 px sizes replay", async function () {
    await FX.setup();
    if (!CS.core.text.visualFields) return; // v2 field enumeration belongs to the real library.
    var spec = ex(), slide = spec.slides[2], F = CS.core.freeze, previous = CS.visual;
    slide.items = [{ title: "Item", text: "Text", value: "2,500" }];
    slide.demo = { lines: [{ text: "Demo" }], caption: "Caption" };
    slide.visual = { anchor: { kind: "word", word: "Word", unit: "Unit", captions: ["Label"], chart: { values: [{ label: "Chart" }] }, mock: { title: "Mock", lines: [{ text: "Line" }], items: ["Choice"], caption: "Note", stamp: "Stamp" } } };
    var fields = CS.core.text.visualFields(slide);
    fields.forEach(function (f) { eq(F.expectedText(spec, slide.id + "." + f[0]), f[1]); });
    slide.visual = { recipe: "under", anchor: { kind: "numeral", value: "7", unit: "Unit", captions: ["Label"] } };
    CS.visual = { expected: function (s, key) { return key === "s03.art.0" ? "7" : key === "s03.art.1" ? "==Marked phrase==\nSecond line" : null; } };
    try {
      eq(F.expectedText(spec, "s03.art.0"), "7");
      var tokens = CS.core.resolve.post(spec, FX.brand()), el = document.createElement("article");
      el.className = "cs-slide"; el.setAttribute("data-cs-slide", "s03");
      var label = document.createElement("div");
      label.setAttribute("data-slot", "art"); label.setAttribute("data-index", "0"); label.setAttribute("data-slot-key", "s03.art.0"); label.setAttribute("data-role", "numeral");
      label.style.fontSize = "520px"; label.innerHTML = CS.core.text.toHTML("7"); el.appendChild(label);
      var phrase = label.cloneNode(false); phrase.setAttribute("data-index", "1"); phrase.setAttribute("data-slot-key", "s03.art.1"); phrase.setAttribute("data-role", "body");
      phrase.style.fontSize = "50px"; phrase.innerHTML = CS.core.text.toHTML("==Marked phrase==\nSecond line", { lang: "en" }); el.appendChild(phrase);
      // capture measures text lines; anchor and mark geometry are supplied by anchorSync/settle.
      el.style.cssText = "position:fixed;left:0;top:0;width:1080px;height:1440px"; document.body.appendChild(el);
      F.visual.set("s03", { marks: Array.from({ length: 9 }, function () { return { id: "underline", x: 114, y: 500, w: 320, h: 7 }; }), anchor: { w: 852, h: 620, x: 114, y: 261, owner: true } });
      var snap = F.visual.get("s03"); snap.anchor.w = 1; eq(F.visual.get("s03").anchor.w, 852);
      var frozen = F.capture([{ id: "s03", el: el }], spec, tokens);
      eq(frozen.sizes["s03.art.0"], 520);
      eq(frozen.lines["s03.art.1"].length, 2, "wrapped marked phrase");
      CST.deepEq(frozen.visual.anchors.s03, { w: 852, h: 620 });
      eq(frozen.visual.marks.s03.length, 8, "schema caps marks at eight per slide");
      var validation = CS.core.schema.validate("spec", Object.assign({}, spec, { frozen: frozen }));
      assert(validation.ok, "520 px visual freeze schema: " + JSON.stringify(validation.errors));
      var second = F.capture([{ id: "s03", el: el }], spec, tokens); delete second.approvedAt;
      var first = JSON.parse(JSON.stringify(frozen)); delete first.approvedAt; CST.deepEq(first, second, "capture twice");
      spec.frozen = JSON.parse(JSON.stringify(frozen)); assert(F.verify(spec, tokens).ok, "approved art key is valid");
      label.style.fontSize = "200px"; F.apply(el, spec.frozen); eq(label.style.fontSize, "520px");
      F.apply(el, spec.frozen); eq(label.style.fontSize, "520px", "replay twice");
      CST.deepEq(CS.core.fit.measureLines(phrase).text, frozen.lines["s03.art.1"], "marked phrase replay");
      var noArt = JSON.parse(JSON.stringify(frozen)); delete noArt.visual;
      F.apply(el, noArt);
      var next = F.capture([{ id: "s03", el: el }], spec, tokens);
      eq(next.visual, undefined, "a second deck with the same slide id inherits no visual state");
      ["visual", "items", "demo"].forEach(function (k) {
        var changed = JSON.parse(JSON.stringify(spec)); changed.slides[2][k] = null;
        assert(F.verify(changed, tokens).reasons.indexOf("tokens") >= 0, k + " invalidates geometry");
      });
      el.remove();
    } finally { CS.visual = previous; F.visual.set("s03", null); }
  });

  test("freeze v2: visual text delegation is restricted to art and failure-safe", async function () {
    await FX.setup();
    var previous = CS.visual, calls = [], spec = ex(), F = CS.core.freeze;
    CS.visual = { expected: function (s, key) { calls.push(key); throw new Error("unavailable art builder"); } };
    try {
      eq(F.expectedText(spec, "s03.body"), spec.slides[2].body);
      eq(calls.length, 0, "ordinary text never enters the art resolver");
      eq(F.expectedText(spec, "s03.art.0"), null, "builder failures invalidate art text without throwing");
      CST.deepEq(calls, ["s03.art.0"]);
    } finally { CS.visual = previous; }
  });
})();
