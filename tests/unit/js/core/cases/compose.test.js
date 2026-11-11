/* compose: the slide DOM contract (CONTRACT 5.1), the text pipeline, chrome, media, edit mode. */
(function () {
  var test = CST.test, eq = CST.eq, assert = CST.assert;

  function ex(patch) { var s = FX.example(); s.style.overrides = {}; if (patch) patch(s); return s; }
  function q(el, sel) { return el.querySelector(sel); }
  function qa(el, sel) { return Array.prototype.slice.call(el.querySelectorAll(sel)); }
  function text(el, sel) { var n = q(el, sel); return n ? n.textContent : null; }

  test("compose: root attributes, layers and fixed vocabulary", async function () {
    await FX.setup();
    var spec = ex(), el = FX.build(spec, 2);
    eq(el.tagName, "SECTION"); assert(el.classList.contains("cs-slide"), "cs-slide");
    eq(el.getAttribute("dir"), "rtl"); eq(el.getAttribute("lang"), "ar");
    var want = { "data-cs-slide": "s03", "data-n": "3", "data-total": "8", "data-last": "0", "data-type": "item", "data-variant": "ghost-number", "data-preset": "swiss", "data-occasion": "",
      "data-dialect": "eg", "data-digits": "western", "data-swipe": "arrow-rtl", "data-align": "start", "data-cover-anchor": "top", "data-hl": "bar", "data-numbering": "ghost", "data-kashida": "0", "data-bgkind": "solid" };
    Object.keys(want).forEach(function (k) { eq(el.getAttribute(k), want[k], k); });
    assert(el.style.getPropertyValue("--cs-bg") === "#F4F4F2" && el.style.getPropertyValue("--cs-font-display") === '"Alexandria"', "tokens are inline custom properties");
    eq(el.style.width, "1080px"); eq(el.style.height, "1440px");
    var kids = Array.prototype.map.call(el.children, function (c) { return c.tagName.toLowerCase() + "." + c.className.split(" ")[0]; });
    CST.deepEq(kids, ["div.cs-bg", "div.cs-decor", "header.cs-header", "main.cs-content", "footer.cs-footer"], "bg, decor, header, content, footer (and no style for a preset without placeholders)");
    eq(q(el, ".cs-bg").getAttribute("aria-hidden"), "true"); eq(q(el, ".cs-decor").getAttribute("data-m"), "decor");
    eq(q(el, "main").className, "cs-content cs-a-item"); eq(q(el, "main").getAttribute("data-layer"), "content");
    eq(q(el, "footer").getAttribute("data-swipe"), "arrow-rtl");
    var allowed = /^(cs-slide|cs-bg|cs-decor|cs-header|cs-footer|cs-content|cs-a-[a-z-]+|cs-slot|cs-handle|cs-meta|cs-counter|cs-swipe|cs-savepill|cs-kicker|cs-headline|cs-sub|cs-title|cs-body|cs-bullets|cs-bullet|cs-sides|cs-side|cs-side-label|cs-side-text|cs-number|cs-num|cs-unit|cs-ord|cs-attribution|cs-bridge|cs-cta|cs-cta-text|cs-cta-icon|cs-media-slot|cs-art|cs-art-panel|cs-art-svg|cs-art-label|cs-icon|cs-items|cs-item|cs-rail|cs-rail-seg|cs-marks|cs-thread|cs-anchor-slot|cs-ltr|cs-rtl|cs-emoji|cs-em|cs-ln|cs-kashida|w)$/;
    FX.SINK && Object.keys(FX.SINK).forEach(function (type) {
      var s2 = FX.variantSpec(type), n = FX.build(s2, FX.indexOfType(s2, type));
      qa(n, "[class]").concat([n]).forEach(function (node) { node.className.split(" ").forEach(function (c) { if (c) assert(allowed.test(c), "class outside the fixed vocabulary: " + c + " on " + type); }); });
    });
  });

  test("compose: slots carry keys, roles, fields and the data-m hooks", async function () {
    await FX.setup();
    var el = FX.build(ex(), 2), slots = CS.core.compose.slots(el);
    CST.deepEq(slots.map(function (s) { return s.key; }), ["s03.ord", "s03.title", "s03.body", "s03.bridge"]);
    var title = slots[1];
    eq(title.slot, "title"); eq(title.role, "title"); eq(title.field, "title"); eq(title.index, null); assert(title.el === q(el, ".cs-title"), "el is the slot element");
    eq(title.el.getAttribute("data-m"), "title");
    eq(CS.core.compose.slotKey("s03", "bullets", 2), "s03.bullets.2"); eq(CS.core.compose.slotKey("s03", "title"), "s03.title");
    var s7 = FX.build(ex(), 6), bl = CS.core.compose.slots(s7);
    CST.deepEq(bl.map(function (s) { return s.key; }), ["s07.title", "s07.bullets.0", "s07.bullets.1", "s07.bullets.2"]);
    eq(bl[2].field, "bullets"); eq(bl[2].index, 1); eq(bl[2].el.tagName, "LI"); eq(bl[2].el.getAttribute("data-m"), "bullet"); eq(bl[2].el.getAttribute("data-m-i"), "1");
    var s6 = FX.build(ex(), 5), sd = CS.core.compose.slots(s6);
    CST.deepEq(sd.map(function (s) { return s.key; }), ["s06.title", "s06.sides.0", "s06.sides.1"]);
    assert(sd[2].el.classList.contains("cs-side-text") && sd[2].el.parentNode.getAttribute("data-side") === "1" && sd[2].el.parentNode.getAttribute("data-m") === "side", "sides: .cs-side[data-side] > .cs-side-text");
    eq(text(s6, '.cs-side[data-side="0"] .cs-side-label'), "خرافة", "labels come from the spec");
    var s5 = FX.build(ex(), 4);
    eq(q(s5, ".cs-num").getAttribute("data-value"), "5"); eq(q(s5, ".cs-num").getAttribute("data-decimals"), "0"); eq(q(s5, ".cs-unit").textContent, "ساعات");
    CST.deepEq(CS.core.compose.slots(s5).map(function (s) { return s.key; }), ["s05.number", "s05.title"]);
  });

  test("compose: words are wrapped, isolated and bound; emphasis wraps whole words", async function () {
    await FX.setup();
    var el = FX.build(ex(), 0), h = q(el, ".cs-headline");
    var ws = qa(h, ".w");
    assert(ws.length >= 6, "one .w per word: " + ws.length);
    ws.forEach(function (w, i) { eq(w.getAttribute("data-m-slot"), "headline", "data-m-slot on word " + i); assert(w.hasAttribute("data-w"), "data-w"); });
    assert(q(h, '.cs-ltr[data-run="number"]'), "the numeral is an isolated LTR run");
    eq(q(h, '.cs-ltr[data-run="number"]').getAttribute("dir"), "ltr");
    var mark = q(h, "mark.cs-em");
    assert(mark && mark.getAttribute("data-m") === "em", "emphasis is a <mark class=cs-em data-m=em>");
    eq(mark.textContent, "المصمم", "the emphasis marks come off"); assert(mark.querySelector(".w") && !/ /.test(mark.textContent), "it wraps whole word units");
    assert(h.textContent.indexOf("==") < 0, "no raw markup");
    assert(h.textContent.indexOf("6\u00A0أدوات") >= 0, "number and noun are bound with U+00A0");
    assert(h.querySelector("br"), "the forced line break is kept");
    var item = FX.build(ex(function (s) { s.slides[2].body = "جرّب ChatGPT Plus مع بـ$20 شهريًا."; }), 2);
    var runs = qa(q(item, ".cs-body"), ".cs-ltr");
    assert(runs.some(function (r) { return /ChatGPT/.test(r.textContent) && /Plus/.test(r.textContent); }), "two Latin words form one run");
    assert(runs.some(function (r) { return r.textContent === "$20"; }), "$20 is its own run");
    assert(!/(^|[^؀-ۿ])ChatGPT/.test(q(item, ".cs-body").innerHTML.replace(/<bdi[^>]*>.*?<\/bdi>/g, "")), "no Latin letters outside .cs-ltr");
  });

  test("compose: punctuation becomes Arabic after Arabic text, wording is untouched", async function () {
    await FX.setup();
    var spec = ex(), P = function (s) { return CS.core.compose.prepare(s, spec); };
    eq(P("ليه? طيب, ماشي ; خلاص"), "ليه؟ طيب، ماشي؛ خلاص");
    eq(P("هل تعرف ؟"), "هل تعرف؟", "no space before ؟");
    eq(P("استنى... وشوف"), "استنى… وشوف");
    eq(P("1,200 and 3.5?"), "1,200 and 3.5?", "numbers and Latin sentences are left alone");
    var en = ex(function (s) { s.locale.dialect = "en"; });
    eq(CS.core.compose.prepare("why, then?", en), "why, then?", "English keeps its punctuation");
  });

  test("compose: digits follow the post's system in one pass", async function () {
    await FX.setup();
    var spec = ex(function (s) { s.locale.digits = "arabic-indic"; });
    var stat = FX.build(spec, 4), cover = FX.build(spec, 0);
    eq(text(stat, ".cs-num"), "٥"); eq(q(stat, ".cs-num").getAttribute("data-value"), "5", "data-value stays Western");
    assert(text(cover, ".cs-counter").indexOf("١") >= 0 && text(cover, ".cs-counter").indexOf("٨") >= 0, "counter: " + text(cover, ".cs-counter"));
    assert(text(cover, ".cs-headline").indexOf("٦") >= 0 && !/[0-9]/.test(text(cover, ".cs-headline")), "headline digits converted");
    var pct = ex(function (s) { s.locale.digits = "arabic-indic"; s.slides[4].number = { value: "41.5", unit: "%" }; });
    var n = FX.build(pct, 4);
    eq(text(n, ".cs-num"), "٤١٫٥", "decimal separator"); eq(text(n, ".cs-unit"), "٪", "percent sign");
    var west = FX.build(ex(), 4);
    eq(text(west, ".cs-num"), "5");
  });

  test("compose: a symbol unit reads left to right with its figure", async function () {
    await FX.setup();
    var spec = ex(function (s) { s.slides[4].number = { value: "413", unit: "%" }; });
    var n = FX.build(spec, 4), box = q(n, ".cs-number");
    assert(box.querySelector('bdi[data-unit-join][dir="ltr"] > .cs-num'), "figure and % share one LTR isolate");
    var ar = FX.build(ex(), 4);
    assert(!ar.querySelector("[data-unit-join]"), "an Arabic unit keeps the natural order");
  });

  test("compose: kashida only where the preset allows, on one word", async function () {
    await FX.setup();
    var sw = FX.build(ex(), 0);
    assert(!q(sw, ".cs-kashida") && text(sw, ".cs-headline").indexOf("ـ") < 0, "swiss never stretches"); eq(sw.getAttribute("data-kashida"), "0");
    var spec = ex(function (s) { s.style.presetId = "heritage@1.0"; s.slides[1].kashidaWord = "الأولى"; });
    var h = FX.build(spec, 0), second = FX.build(spec, 1);
    eq(h.getAttribute("data-kashida"), "1"); eq(qa(h, ".cs-kashida").length, 1, "exactly one stretched word");
    assert(q(h, ".cs-kashida").textContent.indexOf("ـ") > 0, "tatweel inside the word");
    assert(!q(second, ".cs-kashida") && second.getAttribute("data-kashida") === "0", "the second kashidaWord of the post is ignored");
  });

  test("compose: chrome content, swipe cue, counter and the last slides", async function () {
    await FX.setup();
    var spec = ex(function (s) { s.style.metaLabel = "سلسلة الأدوات"; });
    var cover = FX.build(spec, 0), item = FX.build(spec, 2), n7 = FX.build(spec, 6), last = FX.build(spec, 7);
    eq(text(cover, '.cs-handle bdi[data-run="handle"]'), "@yourbrand"); eq(q(cover, ".cs-handle bdi").getAttribute("dir"), "ltr");
    eq(text(cover, ".cs-meta"), "سلسلة الأدوات");
    assert(q(cover, ".cs-header .cs-handle") && q(cover, ".cs-header .cs-meta") && q(cover, ".cs-footer .cs-counter"), "handle and meta in the header, counter in the footer");
    assert(/^1[ \u00A0]من[ \u00A0]8$/.test(text(cover, ".cs-counter")), "cover counter: " + text(cover, ".cs-counter"));
    assert(/^3[ \u00A0]من[ \u00A0]8$/.test(text(item, ".cs-counter")), "item counter: " + text(item, ".cs-counter"));
    eq(text(item, ".cs-swipe"), "اسحب", "Arabic-UI audience: the label"); assert(q(item, '.cs-swipe > svg[data-dir="left"]'), "the cue points left, drawn as an icon and never typed as a glyph");
    eq(text(n7, ".cs-swipe"), "باقي 1", "second to last: the remaining count replaces the label"); assert(q(n7, '.cs-swipe > svg[data-dir="left"]'), "and keeps the arrow");
    assert(!/[←-↓]/.test(item.textContent), "no arrow character anywhere in the slide text (the Arabic faces do not carry one)");
    assert(!q(last, ".cs-swipe"), "no cue on the last slide"); assert(q(last, ".cs-counter"), "but the counter stays");
    assert(q(cover, ".cs-savepill") && text(cover, ".cs-savepill").indexOf("احفظ البوست") >= 0, "save pill on the cover");
    assert(q(last, ".cs-savepill") && !q(item, ".cs-savepill"), "and on the cta, not on an item");
    assert(!q(cover, ".cs-savepill svg"), "the preset draws the bookmark (::before); the engine adds no second icon");
    ["cs-handle", "cs-meta", "cs-counter", "cs-swipe", "cs-savepill"].forEach(function (c) {
      var node = q(cover, "." + c) || q(item, "." + c); assert(node && node.hasAttribute("data-slot") && node.hasAttribute("data-m") && node.hasAttribute("data-pos"), c + " has data-slot, data-m and data-pos");
    });
    var noMeta = FX.build(ex(), 0); assert(!q(noMeta, ".cs-meta"), "empty metaLabel omits the slot");
  });

  test("compose: neutral cue has no arrow and no edge cards, arrow-ltr and English", async function () {
    await FX.setup();
    var neutral = ex(function (s) { s.locale.swipeCue = "neutral"; }), a = FX.build(neutral, 2), z = FX.build(neutral, 7);
    assert(!q(a, ".cs-swipe"), "no .cs-swipe for neutral");
    var gone = [".cs-" + "peek", '[data-m="' + "peek" + '"]', "[data-" + "edge]"].join(", ");   /* the 1.0 edge cards, spelled in pieces so tools/remove_peek.py --check does not flag the guard itself */
    eq(qa(a, gone).length, 0, "no edge cards on a neutral deck (removed in 1.1.0)"); eq(qa(z, gone).length, 0, "and none on the last slide");
    eq(a.getAttribute("data-swipe"), "neutral");
    var ltr = FX.build(ex(function (s) { s.locale.swipeCue = "arrow-ltr"; }), 2);
    eq(text(ltr, ".cs-swipe"), "اسحب"); assert(q(ltr, '.cs-swipe > svg[data-dir="right"]'), "arrow-ltr points right");
    var en = FX.build(ex(function (s) { s.locale.dialect = "en"; s.locale.swipeCue = "arrow-ltr"; }), 2);
    eq(en.getAttribute("dir"), "ltr"); eq(en.getAttribute("lang"), "en"); eq(en.getAttribute("data-dialect"), "en");
    eq(text(en, ".cs-swipe"), "Swipe"); assert(q(en, '.cs-swipe > svg[data-dir="right"]'), "English cue points right"); eq(text(en, ".cs-counter"), "3/8");
  });

  test("compose: the counter follows the preset format and stays one LTR figure when it has no Arabic", async function () {
    await FX.setup();
    var h = FX.build(ex(function (s) { s.style.presetId = "heritage@1.0"; }), 2);
    eq(text(h, ".cs-counter"), "3/8"); assert(q(h, '.cs-counter > bdi[dir="ltr"]'), "one isolated run");
  });

  test("compose: poster and single posts carry no counter or swipe", async function () {
    await FX.setup();
    var spec = FX.variantSpec("poster", "top"), el = FX.build(spec, 0);
    assert(!q(el, ".cs-counter") && !q(el, ".cs-swipe") && !q(el, ".cs-savepill") && q(el, ".cs-handle"), "handle only: " + el.querySelector("footer").innerHTML);
    var one = FX.makeSpec([FX.slideFor("cover")]), c = FX.build(one, 0);
    assert(!q(c, ".cs-counter") && !q(c, ".cs-swipe"), "a one-slide spec has nothing to count");
  });

  test("compose: edit mode makes text slots editable, export mode does not", async function () {
    await FX.setup();
    var spec = ex(), edit = FX.build(spec, 6, { mode: "edit" }), out = FX.build(spec, 6, { mode: "export" });
    var ed = qa(edit, '[data-edit="text"]');
    assert(ed.length >= 4 && ed.every(function (n) { return n.getAttribute("contenteditable") === "true" && n.getAttribute("spellcheck") === "false"; }), "contenteditable on every text slot");
    CST.deepEq(ed.map(function (n) { return n.tagName; }).slice(0, 2), ["H2", "LI"], "title and bullet items; the <ul> itself is not editable");
    assert(!qa(out, "[data-edit],[contenteditable]").length, "an export has no editing attributes");
    assert(CS.core.compose.slots(edit).every(function (s) { return s.el.getAttribute("data-edit") === "text"; }), "slots() returns the editable elements");
  });

  test("compose: tashkeel raises the line height of its slot", async function () {
    await FX.setup();
    var spec = ex(function (s) { s.slides[2].body = "أَحَبُّ الأدوات"; });
    var el = FX.build(spec, 2);
    assert(q(el, ".cs-body").style.lineHeight.indexOf("+ 0.2") > 0, "body: " + q(el, ".cs-body").style.lineHeight);
    assert(!q(el, ".cs-title").style.lineHeight, "other slots keep the token line height");
  });

  test("compose: plain mixed phrases keep punctuation, prefixes and versions in reading order", async function () {
    await FX.setup();
    var spec = ex(), cx = CS.core.compose.context(spec, spec.slides[2], CS.core.resolve.post(spec, FX.brand()), FX.brand(), {});
    ["Google Search & Other", "\"Yes, and don't ask again\"", "Opus\u00a05.5", "Opus\u202f5.5", "Opus\u20095.5"].forEach(function (text) {
      var p = document.createElement("p"); p.dir = "rtl";
      p.innerHTML = CS.core.compose.html("جرّب " + text + " اليوم", cx);
      var runs = Array.from(p.querySelectorAll('.cs-ltr,[data-cs-bind="pair"]'));
      assert(runs.some(function (r) { return r.textContent.replace(/\u00a0/g, " ") === text.replace(/[\u00a0\u202f\u2009]/g, " "); }), "ordered phrase: " + text + " => " + p.innerHTML);
    });
    ["وGoogle", "وAI Mode", "وMax 5x", "الـAPI،", "بـ50%", "بـ@الاسم", "وَAI Mode", "و«Google Search & Other»", "وÉlan"].forEach(function (text) {
      var p = document.createElement("p"); p.innerHTML = CS.core.compose.html(text, cx);
      assert(p.querySelector('[data-cs-bind="clitic"]'), "bound prefix: " + text);
      eq(p.textContent, text, "creator wording stays intact");
      if (text === "الـAPI،") eq(p.querySelector(".cs-ltr").textContent, "API", "Arabic comma stays outside the Latin isolate");
    });
    eq(CS.core.compose.prepare("\u2066Opus\u0001\u202f5.5\u2069", spec), "Opus 5.5");
    eq(CS.core.compose.prepare("نص\u200c\u200d", spec), "نص\u200c\u200d");
  });

  test("compose: generic display labels get mixed-script line height", async function () {
    await FX.setup();
    var spec = ex(), cx = CS.core.compose.context(spec, spec.slides[2], CS.core.resolve.post(spec, FX.brand()), FX.brand(), {});
    var h = document.createElement('h2'); CS.core.compose.label(h, 'Google في التصميم', cx, { role:'h2', slot:'title' });
    assert(h.style.lineHeight.includes('--cs-lh-heading'), 'free-lane display labels use the same line-height policy');
  });

  test("compose: a prefix stays with the first fragment of a wrapping Latin phrase", async function () {
    await FX.setup();
    var spec=ex(function(s){s.slides[2].body='وGoogle Search & Other useful tools';}), root=FX.build(spec,2), slot=q(root,'.cs-body');
    slot.style.width='320px'; slot.style.fontSize='44px';
    var words=Array.from(slot.querySelectorAll('.w')), prefix=words.find(w=>w.textContent==='و'), first=words.find(w=>w.textContent==='Google');
    assert(prefix&&first,'both scripts are present');
    var a=prefix.getBoundingClientRect(), b=first.getBoundingClientRect();
    assert(Math.abs(a.y+a.height/2-b.y-b.height/2)<22,'the clitic is not stranded');
    assert(slot.scrollWidth<=slot.clientWidth+1,'the phrase can wrap without overflowing');
  });

  test("compose: currency binding does not lock the preceding Arabic sentence", async function () {
    await FX.setup();
    var spec=ex(function(s){s.slides[2].body='جرّب هذه الفكرة مع فريقك بسعر $20 شهريًا في Google';}), root=FX.build(spec,2),slot=q(root,'.cs-body');
    slot.style.width='400px';slot.style.fontSize='44px';
    assert(slot.scrollWidth<=slot.clientWidth+1,'only the number/noun gap binds');
    assert(slot.textContent.includes('$20\u00a0شهريًا'),'currency stays with its noun');
    var cx=CS.core.compose.context(spec,spec.slides[2],CS.core.resolve.post(spec,FX.brand()),FX.brand(),{});
    var node=document.createElement('p');node.innerHTML=CS.core.compose.html('🎯 جرّب Opus 5.5 في عملك',cx);
    assert(node.querySelector('[data-cs-bind="pair"]').textContent.includes('Opus 5.5'),'astral text cannot shift the name/version pair');
  });

  test("compose: mixed kashida is added to one occurrence only", async function () {
    await FX.setup();
    var spec = ex(function (s) { s.style.presetId = "heritage@1.0"; s.slides[0].headline = "المصمم المصمم مع Google"; s.slides[0].kashidaWord = "المصمم"; });
    var h = q(FX.build(spec, 0), '.cs-headline');
    eq((h.textContent.match(/ـ/g) || []).length, 3, 'only one occurrence is stretched');
  });

  test("compose: short Arabic connectors bind forward and mixed display lines reserve air", async function () {
    await FX.setup();
    var spec = ex(function (s) { s.slides[0].headline = "التصميم في Google"; s.slides[2].body = "هذه فكرة ولا تجربة في التصميم"; });
    var cover = FX.build(spec, 0), inner = FX.build(spec, 2);
    assert(q(cover, '.cs-headline [data-cs-bind="words"]'), "في stays with Google");
    assert(q(cover, ".cs-headline").style.lineHeight, "mixed display line-height is explicit");
    assert(q(inner, '.cs-body [data-cs-bind="words"]'), "ولا and في keep a neighbour");
  });

  test("compose: media (plate in the background, icons inline and sanitised, missing assets)", async function () {
    await FX.setup();
    var png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    var spec = ex(function (s) {
      s.assets = [{ id: "bg1", kind: "image", ref: png, aiGenerated: false }, { id: "ic1", kind: "svg", mime: "image/svg+xml", ref: "data:image/svg+xml;base64," + btoa('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" onload="x()"><script>alert(1)</script><path d="M0 0h10v10z" onclick="y()"/></svg>'), aiGenerated: false, mirror: "auto" }];
      s.slides[0].media = { slot: "plate", assetId: "bg1", ai: true };
      s.slides[2].media = { slot: "icon", assetId: "ic1" };
      s.slides[3].media = { slot: "photo", assetId: "nothing" };
    });
    var cover = FX.build(spec, 0), item = FX.build(spec, 2), miss = FX.build(spec, 3);
    var bgImg = q(cover, ".cs-bg > .cs-media-slot > img");
    assert(bgImg && bgImg.getAttribute("src") === png, "a plate sits in the bg layer"); eq(q(cover, ".cs-bg > .cs-media-slot").getAttribute("data-media-kind"), "plate"); eq(q(cover, ".cs-bg > .cs-media-slot").getAttribute("data-ai"), "1");
    assert(!q(cover, "main .cs-media-slot"), "and not in the content");
    var svg = q(item, ".cs-media-slot svg");
    assert(svg && !svg.querySelector("script") && !svg.hasAttribute("onload") && !svg.querySelector("[onclick]"), "inline SVG without script or handlers");
    eq(q(item, ".cs-media-slot").getAttribute("data-mirror"), "1", "mirror:auto on an icon in an RTL slide");
    eq(q(miss, ".cs-media-slot").getAttribute("data-media-state"), "missing"); eq(q(miss, ".cs-media-slot").getAttribute("data-media-kind"), "photo");
    var viaResolver = FX.build(ex(function (s) { s.slides[3].media = { slot: "photo", assetId: "p1", calmZone: "top" }; }), 3, { assets: function (id) { return id === "p1" ? { url: png, mime: "image/png" } : null; } });
    var im = q(viaResolver, ".cs-media-slot > img"); assert(im && im.getAttribute("src") === png && im.getAttribute("alt") === "", "AssetResolver");
    eq(q(viaResolver, ".cs-media-slot").getAttribute("data-calm"), "top");
  });

  test("compose: logo, and the logo never mirrors", async function () {
    await FX.setup();
    var png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    var brand = FX.brand(); brand.visual.logo = { dataUri: png, mirror: "never" };
    var el = FX.build(ex(), 0, { brand: brand });
    var img = q(el, ".cs-handle > img[data-logo]"); assert(img && img.getAttribute("src") === png, "logo before the handle");
    assert(img.compareDocumentPosition(q(el, ".cs-handle bdi")) & Node.DOCUMENT_POSITION_FOLLOWING, "logo comes first");
    var noLogo = JSON.parse(JSON.stringify(CS.core.registry.getPreset("swiss"))); noLogo.id = "nologo"; noLogo.chrome.handle.logo = "never";
    CS.core.registry.registerPreset(noLogo, "");
    assert(!q(FX.build(ex(function (s) { s.style.presetId = "nologo@1.0"; }), 0, { brand: brand }), "img[data-logo]"), "preset.chrome.handle.logo = never");
    var viaAssets = FX.build(ex(), 0, { brand: FX.brand(), assets: function (id) { return id === "logo" ? { url: png, mime: "image/png" } : null; } });
    assert(q(viaAssets, "img[data-logo]"), "the AssetResolver supplies the logo");
  });

  test("compose: per-slide decor placeholders live inside the slide and survive cloning", async function () {
    await FX.setup();
    var spec = ex(function (s) { s.style.presetId = "heritage@1.0"; });
    var r = await FX.render(spec, 0, { mode: "export" }), el = r.el;
    var st = el.lastElementChild; eq(st.tagName, "STYLE"); assert(st.hasAttribute("data-cs-decor-local"), "local decor style is the last child");
    var key = el.getAttribute("data-decor-key"); assert(/^[0-9a-f]{16}$/.test(key), "decor key");
    var accent = r.tokens.roles.accent.slice(1).toUpperCase();
    assert(st.textContent.indexOf("%23" + accent) >= 0, "the slide's accent is baked into the placeholder rules");
    var holder = document.createElement("div"); holder.style.cssText = "position:absolute;left:0;top:0"; document.body.appendChild(holder);
    var clone = el.cloneNode(true); holder.appendChild(clone);
    var bgi = getComputedStyle(clone.querySelector(".cs-decor")).backgroundImage;
    assert(bgi.indexOf("%23" + accent) >= 0 || bgi.indexOf("%23" + accent.toLowerCase()) >= 0, "a clone paints with the slide's own colours: " + bgi.slice(0, 160));
    holder.remove(); el.remove();
  });

  test("compose: compose.chrome returns the two bands; unknown archetypes fail clearly", async function () {
    await FX.setup();
    var spec = ex(), post = CS.core.resolve.post(spec, FX.brand());
    var c = CS.core.compose.chrome(spec, spec.slides[2], CS.core.resolve.slide(post, spec.slides[2]), FX.brand());
    eq(c.header.tagName, "HEADER"); eq(c.footer.tagName, "FOOTER"); assert(c.header.querySelector(".cs-handle") && c.footer.querySelector(".cs-counter"));
    var bad = ex(function (s) { s.slides[2].type = "nonsense"; });
    await CST.throwsCode("E_USAGE", function () { FX.build(bad, 2); });
  });
})();
