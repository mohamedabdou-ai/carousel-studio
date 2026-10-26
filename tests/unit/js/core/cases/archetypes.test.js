/* archetypes: the 20 partials against the table of CONTRACT 5.3, and every type x variant rendered and fitted; the layout sheet of round 3 (package E3):
   the anchor and media slots of IS-6, the staged recipes (under over full center), the grid and timeline layouts, the inner footer contract and the staged
   variants, measured with tests/geometry/layout-probe.js (the same probe tests/geometry/run.mjs runs in the six real presets). */
(function () {
  var test = CST.test, eq = CST.eq, assert = CST.assert;

  /* type: [variants, chrome, slots in DOM order as "slot:role"] -- CONTRACT 5.3 */
  var TABLE = {
    "cover": [["top", "center", "split", "photo", "number"], "handle meta counter swipe savepill", ["kicker:small", "headline:hero", "sub:body", "media:", "anchor:"]],
    "rehook": [["base", "split", "big-number", "statement"], "handle meta counter swipe", ["headline:h1", "sub:body", "media:", "anchor:", "bridge:small"]],
    "item": [["base", "ghost-number", "side-number", "media", "numeral"], "handle meta counter swipe", ["ord:small", "title:title", "body:body", "media:", "anchor:", "bridge:small"]],
    "step": [["base", "ghost-number", "pill", "track"], "handle meta counter swipe", ["ord:small", "title:title", "body:body", "media:", "anchor:", "bridge:small"]],
    "stat": [["base", "bar", "icon", "chart"], "handle meta counter swipe", ["number:number", "title:title", "body:body", "media:", "anchor:", "bridge:small"]],
    "compare": [["columns", "stacked", "versus", "table", "before-after"], "handle meta counter swipe", ["title:title", "sides:body", "items:body", "media:", "anchor:", "bridge:small"]],
    "myth-fact": [["stacked", "columns", "stamp"], "handle meta counter swipe", ["title:title", "sides:body", "media:", "anchor:", "bridge:small"]],
    "quote": [["base", "mark", "photo", "statement"], "handle meta counter swipe", ["body:h2", "attribution:small", "media:", "anchor:"]],
    "story-beat": [["base", "panel", "media"], "handle meta counter swipe", ["ord:small", "title:title", "body:body", "media:", "anchor:", "bridge:small"]],
    "checklist": [["base", "boxes", "ruled"], "handle meta counter swipe", ["title:title", "bullets:body", "media:", "anchor:", "bridge:small"]],
    "summary": [["list", "grid"], "handle meta counter swipe", ["title:title", "bullets:body", "media:", "anchor:"]],
    "setup": [["base", "cards"], "handle meta counter swipe", ["title:title", "bullets:body", "media:", "anchor:", "bridge:small"]],
    "proof": [["screenshot", "base"], "handle meta counter swipe", ["media:", "anchor:", "number:number", "title:title", "body:body", "bridge:small"]],
    "share": [["base", "big-word"], "handle meta counter", ["headline:h1", "sub:body", "media:", "anchor:"]],
    "cta": [["base", "pill", "keyword", "action"], "handle meta counter savepill", ["title:h1", "body:body", "media:", "anchor:", "cta:body"]],
    "offer": [["base", "card"], "handle meta counter savepill", ["title:h1", "number:number", "bullets:body", "media:", "anchor:", "cta:body"]],
    "testimonial": [["base", "photo", "card"], "handle meta counter", ["body:h2", "attribution:small", "number:number", "media:", "anchor:"]],
    "poster": [["top", "center", "split", "photo"], "handle meta", ["kicker:small", "headline:hero", "sub:body", "bullets:body", "media:", "anchor:", "cta:small"]],
    "grid": [["bento"], "handle meta counter swipe", ["title:title", "items:body", "media:", "anchor:", "bridge:small"]],
    "timeline": [["rail"], "handle meta counter swipe", ["title:title", "items:body", "media:", "anchor:", "bridge:small"]]
  };

  test("archetypes: variants, chrome and slot order match CONTRACT 5.3", async function () {
    await FX.setup();
    var reg = CS.core.registry, types = Object.keys(TABLE);
    eq(types.length, 20); CST.deepEq(types, CS.core.constants.SLIDE_TYPES, "the 20 types in contract order");
    types.forEach(function (type) {
      var a = reg.getArchetype(type), want = TABLE[type];
      CST.deepEq(a.variants, want[0], type + " variants");
      eq(a.defaultVariant, want[0][0], type + " default variant is the first");
      eq(a.chrome.join(" "), want[1], type + " chrome");
      var main = a.template.content.firstElementChild;
      eq(main.tagName, "MAIN"); assert(main.classList.contains("cs-content") && main.classList.contains("cs-a-" + type), type + " main classes");
      var slots = Array.prototype.map.call(main.querySelectorAll(":scope > [data-slot]"), function (n) { return n.getAttribute("data-slot") + ":" + (n.getAttribute("data-role") || ""); });
      CST.deepEq(slots, want[2], type + " slots in DOM order");
      Array.prototype.forEach.call(main.querySelectorAll(":scope > [data-slot]"), function (n) {
        if (n.getAttribute("data-slot") === "anchor") return;   /* checked in its own test: IS-6 gives it no field and no kind */
        ["data-field", "data-kind"].forEach(function (k) { assert(n.hasAttribute(k), type + "." + n.getAttribute("data-slot") + " has " + k); });
        assert(n.classList.contains("cs-slot"), "cs-slot class");
        if (n.getAttribute("data-kind") === "text") assert(n.hasAttribute("data-max-lines") && /^\d+$/.test(n.getAttribute("data-max-lines")), "text slots carry data-max-lines");
      });
      eq(a.template.getAttribute("data-version"), "1");
    });
    var css = reg.archetypeCss();
    assert(!/letter-spacing\s*:\s*[^0;\s]/.test(css) && !/text-align\s*:\s*justify/.test(css) && !/font-style\s*:\s*(italic|oblique)/.test(css), "no tracking, justification or italics in the layout sheet");
    assert(!/(filter|backdrop-filter|mix-blend-mode|mask|writing-mode)\s*:/.test(css), "inside the paintable subset");
    assert(!/\b\d+(\.\d+)?(vw|vh|vmin|vmax)\b/.test(css), "no viewport units");
    assert(!/(border-radius|box-shadow)\s*:/.test(css), "no radius or shadow: those are the preset's");
    assert(!/#[0-9a-fA-F]{3,8}\b/.test(css.replace(/\/\*[\s\S]*?\*\//g, "")), "no colour literals");
  });

  test("archetypes: every type x every variant renders, fits and keeps its text inside the content box", async function () {
    await FX.setup();
    var preset = CS.core.registry.getPreset("swiss"), K = CS.core.constants, count = 0, problems = [];
    for (var type of K.SLIDE_TYPES) {
      var variants = preset.variants[type];
      for (var variant of variants) {
        var spec = FX.variantSpec(type, variant), index = FX.indexOfType(spec, type);
        var r = await CS.core.render.slide(spec, FX.brand(), index, { mode: "export" });
        var label = type + "/" + variant;
        if (r.el.getAttribute("data-variant") !== variant) problems.push(label + ": data-variant " + r.el.getAttribute("data-variant"));
        if (!r.fit.ok) problems.push(label + ": overflow " + Object.keys(r.fit.slots).filter(function (k) { return r.fit.slots[k].status === "overflow"; }).join(","));
        var sr = r.el.getBoundingClientRect();
        Array.prototype.forEach.call(r.el.querySelectorAll("main .w"), function (w) {
          var b = w.getBoundingClientRect(), x = b.left - sr.left, y = b.top - sr.top;
          if (x < K.CONTENT.x - 1 || x + b.width > K.CONTENT.x + K.CONTENT.w + 1 || y < K.CONTENT.y - 1 || y + b.height > K.CONTENT.y + K.CONTENT.h + 1) problems.push(label + ": word outside the content box");
        });
        var empty = Array.prototype.filter.call(r.el.querySelectorAll("main [data-slot-key]"), function (n) { return n.getAttribute("data-fit") !== "css" && !n.textContent.trim() && n.getAttribute("data-kind") !== "number"; });
        if (empty.length) problems.push(label + ": empty text slots " + empty.map(function (n) { return n.getAttribute("data-slot-key"); }).join(","));
        r.el.remove(); count++;
      }
    }
    assert(count >= 50, "rendered " + count + " type/variant pairs");
    assert(!problems.length, problems.slice(0, 8).join(" | "));
  });

  test("archetypes: chrome per type (poster has no counter, closing slides have no swipe, cta has the save pill)", async function () {
    await FX.setup();
    var spec = FX.makeSpec(["cover", "item", "share", "cta", "testimonial"].map(function (t) { return FX.slideFor(t); }));
    var has = function (i, c) { return !!FX.build(spec, i).querySelector("." + c); };
    [[0, "cs-savepill", true], [0, "cs-swipe", true], [1, "cs-savepill", false], [1, "cs-swipe", true], [2, "cs-swipe", false], [2, "cs-counter", true], [3, "cs-savepill", true],
      [3, "cs-swipe", false], [4, "cs-swipe", false], [4, "cs-counter", true]].forEach(function (c) { eq(has(c[0], c[1]), c[2], "slide " + c[0] + " " + c[1]); });
  });

  test("archetypes: the same deck renders in both presets, in English, with Arabic-Indic digits and neutral cue", async function () {
    await FX.setup();
    var combos = [{ preset: "heritage" }, { dialect: "en", swipe: "arrow-ltr" }, { digits: "arabic-indic" }, { swipe: "neutral" }, { canvasH: 1350 }];
    for (var o of combos) {
      var spec = FX.makeSpec(CS.core.constants.SLIDE_TYPES.filter(function (t) { return t !== "poster"; }).map(function (t) { return FX.slideFor(t); }), o);
      var deck = await CS.core.render.deck(spec, FX.brand(), { mode: "thumb" });
      try {
        var bad = deck.slides.filter(function (r) { return !r.fit.ok; }).map(function (r) { return r.id + ":" + r.el.getAttribute("data-type"); });
        assert(!bad.length, JSON.stringify(o) + " overflow in " + bad.join(","));
      } finally { deck.dispose(); }
    }
  });

  /* ---- the layout sheet of round 3 (E3) ------------------------------------------------------------------------------------------ */

  var TYPES_NO_MEDIA_BEFORE = ["stat", "compare", "myth-fact", "checklist", "summary", "setup", "share", "cta", "offer"];

  async function probe() {
    if (!window.CSLayoutProbe) await new Promise(function (ok, no) { var el = document.createElement("script"); el.src = "/tests/geometry/layout-probe.js"; el.onload = ok; el.onerror = function () { no(new Error("cannot load layout-probe.js")); }; document.head.appendChild(el); });
    return window.CSLayoutProbe;
  }
  function deck(o) { return FX.makeSpec(CS.core.constants.SLIDE_TYPES.filter(function (t) { return t !== "poster"; }).map(function (t) { return FX.slideFor(t); }), o); }
  function near(a, b, tol, what) { assert(Math.abs(a - b) <= (tol === undefined ? 1.5 : tol), what + ": " + Math.round(a * 10) / 10 + " is not " + Math.round(b * 10) / 10); }

  test("archetypes: every template has the IS-6 anchor slot and a media slot, and a slide that fills neither is built exactly as before", async function () {
    await FX.setup();
    var reg = CS.core.registry;
    CS.core.constants.SLIDE_TYPES.forEach(function (type) {
      var main = reg.getArchetype(type).template.content.firstElementChild, anchor = main.querySelector(':scope > [data-slot="anchor"]'), media = main.querySelector(':scope > [data-slot="media"]');
      assert(anchor, type + " has an anchor slot");
      eq(anchor.className, "cs-slot cs-anchor-slot", type + " anchor classes");
      eq(anchor.getAttribute("data-m"), "media", type + " anchor data-m"); assert(anchor.hasAttribute("data-optional"), type + " anchor is optional");
      assert(!anchor.hasAttribute("data-kind") && !anchor.hasAttribute("data-field") && !anchor.children.length && !anchor.textContent, type + " anchor is the empty element of IS-6");
      assert(media && media.getAttribute("data-kind") === "media" && media.getAttribute("data-field") === "media" && media.classList.contains("cs-media-slot"), type + " has the user-asset media slot");
      eq(media.hasAttribute("data-optional"), type !== "proof", type + " media slot is optional except on proof");
      assert(media.compareDocumentPosition(anchor) & Node.DOCUMENT_POSITION_FOLLOWING, type + " the anchor slot follows the media slot");
      var tail = ["bridge", "cta"].map(function (n) { return main.querySelector(':scope > [data-slot="' + n + '"]'); }).filter(Boolean)[0];
      if (tail) assert(anchor.compareDocumentPosition(tail) & Node.DOCUMENT_POSITION_FOLLOWING, type + " the anchor slot comes before the " + tail.getAttribute("data-slot"));
      /* the new slots sit on the line of the slot before them: a slot compose removes leaves no text node behind (the golden manifest hashes the markup) */
      assert(!/>\s+<div class="cs-slot cs-anchor-slot"/.test(main.outerHTML), type + ": the anchor slot has no whitespace in front of it");
    });
    TYPES_NO_MEDIA_BEFORE.forEach(function (type) { assert(reg.getArchetype(type).template.content.querySelector('[data-slot="media"]'), type + " gained its media slot"); });
    var spec = deck();
    spec.slides.forEach(function (sl, i) {
      var el = FX.build(spec, i);
      assert(!el.querySelector('[data-slot="anchor"], .cs-anchor-slot'), sl.type + ": no anchor slot in the markup");
      eq(!!el.querySelector('[data-slot="media"]'), sl.type === "proof", sl.type + ": the media slot is only there when it is filled");
    });
  });

  test("archetypes: recipes (under over full center): where floor-size text and the minimum anchor fit, the layout realises the box, in both canvases", async function () {
    await FX.setup();
    var P = await probe(), brand = FX.brand(), feasible = 0, runs = 0, problems = [];
    var spec = deck();
    for (var type of Object.keys(P.ALLOWED)) {
      var index = FX.indexOfType(spec, type);
      for (var recipe of P.ALLOWED[type]) for (var canvasH of [1440, 1350]) {
        var variant = P.VARIANT[type + ":" + recipe] || null, restore = variant ? P.withVariant("swiss", type, variant) : function () {};
        var t0 = await P.run(spec, brand, index, { recipe: recipe, anchor: false, canvasH: canvasH, variant: variant, floors: true, noFit: true }), f = P.fits(recipe, t0); P.dispose(t0);
        var r = await P.run(spec, brand, index, { recipe: recipe, canvasH: canvasH, variant: variant });
        restore(); runs++;
        if (f.ok) { feasible++; P.checkRecipe(r).forEach(function (m) { problems.push(m); }); }
        P.dispose(r);
      }
    }
    assert(feasible >= 24, "only " + feasible + " of " + runs + " runs can carry their recipe (the test would be vacuous)");
    assert(!problems.length, problems.slice(0, 6).join(" | "));
    var control = await P.run(spec, brand, FX.indexOfType(spec, "stat"), {});
    assert(control.spacers.before !== "none" && control.spacers.after !== "none", "a slide without data-recipe keeps its centring spacers (the 1.0 layout)"); P.dispose(control);
    var a = await P.run(spec, brand, FX.indexOfType(spec, "item"), { recipe: "under" }), b = await P.run(spec, brand, FX.indexOfType(spec, "item"), { recipe: "under" });
    eq(JSON.stringify(a.anchor), JSON.stringify(b.anchor), "two runs, one anchor box"); P.dispose(a); P.dispose(b);
  });

  test("archetypes: the anchor slot takes the free height, text first: longer text shrinks the anchor to its floor, never below; the slot hooks work", async function () {
    await FX.setup();
    var P = await probe(), brand = FX.brand(), spec = deck(), index = FX.indexOfType(spec, "item");
    var roomy = await P.run(spec, brand, index, { recipe: "under" });
    var tight = await P.run(spec, brand, index, { recipe: "under", short: false, mutate: function (s) { s.title = "عنوان طويل جدا جدا جدا جدا جدا يملأ ثلاثة أسطر كاملة في الشريحة"; s.body = "هذا نص أطول من المعتاد لكي يأخذ مساحة أكبر من الشريحة كلها ويترك للمرساة أقل ما يمكن في هذه الشريحة."; } });
    assert(roomy.anchor.h > tight.anchor.h + 40, "the anchor gave way to the text (" + Math.round(roomy.anchor.h) + " against " + Math.round(tight.anchor.h) + ")");
    assert(tight.anchor.h >= 280 - 1.5, "and stopped at its floor of 280 (" + Math.round(tight.anchor.h) + ")");
    P.dispose(roomy); P.dispose(tight);
    var capped = await P.run(spec, brand, index, { recipe: "under" }), slot = capped.el.querySelector(".cs-anchor-slot");
    slot.style.setProperty("--cs-anchor-max", "320px"); await FX.nextFrame();
    near(slot.getBoundingClientRect().height, 320, 1, "--cs-anchor-max caps the slot");
    slot.style.removeProperty("--cs-anchor-max"); slot.style.setProperty("--cs-anchor-min", "340px"); await FX.nextFrame();
    assert(slot.getBoundingClientRect().height >= 340 - 1, "--cs-anchor-min raises the floor"); P.dispose(capped);
    var over = await P.run(spec, brand, FX.indexOfType(spec, "stat"), { recipe: "over" }), start = over.anchor.y;
    over.el.querySelector(".cs-content").style.setProperty("--cs-anchor-seam", "24px"); await FX.nextFrame();
    near(over.el.querySelector(".cs-anchor-slot").getBoundingClientRect().top - over.el.getBoundingClientRect().top, start + 24, 1, "--cs-anchor-seam moves an over anchor down"); P.dispose(over);
  });

  test("archetypes: grid:bento and timeline:rail lay their items out, and their words stay inside the cards and nodes (3 to 5 items, short copy and copy at the limits, both canvases, Arabic and English)", async function () {
    await FX.setup();
    var P = await probe(), brand = FX.brand(), problems = [], cases = [["grid", 3, 0], ["grid", 3, -1], ["grid", 3, 2], ["grid", 4, 1], ["timeline", 3, -1], ["timeline", 4, 1], ["timeline", 5, -1]], count = 0, limitRuns = 0, flagged = [], lines = 0;
    CST.deepEq(P.boundaryProblems(), [], "the boundary copy is exactly at the limits of spec 4.4 (title 3 / text 5 words per card; title 2 / text 4 words / label 2 words and 12 characters per node; one-line text on five nodes)");
    for (var dialect of ["eg", "en"]) {
      var spec = deck(dialect === "en" ? { dialect: "en", swipe: "arrow-ltr" } : {});
      for (var c of cases) for (var canvasH of (c[1] > 4 ? [1440] : [1440, 1350])) for (var copy of ["short", "limit"]) {
        var items = P.makeItems(c[0], c[1], c[2], { boundary: copy === "limit", lang: dialect === "en" ? "en" : "ar" });
        var r = await P.run(spec, brand, FX.indexOfType(spec, c[0]), { recipe: "full", anchor: false, short: false, canvasH: canvasH, items: items, drop: c[1] > 4 ? ["bridge"] : [] });
        /* the words go through the text pipeline and the three text parts are fit slots: copy that fit itself rejects is the author's to shorten (counted below); what fit accepts must lie inside its cell */
        P.checkItems(r, c[0] === "grid" ? "bento" : "rail", c[1], c[2], { allowFlagged: copy === "limit" }).forEach(function (m) { problems.push(dialect + " " + copy + " " + m); });
        if (copy === "limit") { limitRuns++; if (r.flagged) flagged.push(c[0] + c[1] + "@" + canvasH + " " + dialect); }
        r.itemNodes.forEach(function (n) { Object.keys(n.texts).forEach(function (k) { lines += n.texts[k].length; }); });
        assert(r.el.querySelectorAll(".cs-item [data-slot-key] .w").length >= c[1] * 2, "the item words went through the text pipeline (fit slots with word spans)");
        eq(r.el.getAttribute("dir"), dialect === "en" ? "ltr" : "rtl"); count++; P.dispose(r);
      }
    }
    eq(count, 52, "layouts run");
    assert(lines > 400, "the containment check measured " + lines + " lines of text inside cells");
    assert(flagged.length <= limitRuns * 0.25, "fit rejected " + flagged.length + " of " + limitRuns + " runs of copy at the limits (" + flagged.slice(0, 4).join(", ") + "): too few are left to prove the cells hold it");
    assert(!problems.length, problems.length + " problem(s): " + problems.slice(0, 14).join(" | "));
    var ar = await P.run(deck(), brand, FX.indexOfType(deck(), "grid"), { recipe: "full", anchor: false, short: false, items: P.makeItems("grid", 3, 0) });
    assert(ar.itemNodes[0].rect.x > ar.itemNodes[1].rect.x, "Arabic: the key card is on the right"); P.dispose(ar);
    var en = await P.run(deck({ dialect: "en", swipe: "arrow-ltr" }), brand, FX.indexOfType(deck(), "grid"), { recipe: "full", anchor: false, short: false, items: P.makeItems("grid", 3, 0) });
    assert(en.itemNodes[0].rect.x < en.itemNodes[1].rect.x, "English: the key card is on the left"); P.dispose(en);
    /* the checks can fail, so a green run means something: a card title far past the limit is an overflow in fit (flagged, with its slot keys, not a layout fact) ... */
    var wordy = P.makeItems("grid", 4, -1).map(function (it) { return { title: it.title + " " + it.title + " " + it.title + " " + it.title, text: it.text }; });
    var rej = await P.run(deck(), brand, FX.indexOfType(deck(), "grid"), { recipe: "full", anchor: false, short: false, items: wordy });
    assert(!rej.fit.ok && P.checkItems(rej, "bento", 4, -1).length > 0, "a twelve-word card title is an overflow in fit");
    eq(P.checkItems(rej, "bento", 4, -1, { allowFlagged: true }).length, 0, "and counts as flagged"); assert(rej.flagged && rej.flagged.length, "with its slot keys");
    var nodes=rej.itemNodes;rej.itemNodes=[];var broken=P.checkItems(rej,"bento",4,-1,{allowFlagged:true});CST.deepEq(broken,P.checkItems(rej,"bento",4,-1,{allowFlagged:true}),"structural check deterministic");assert(broken.some(m=>m.includes("items laid out, expected 4")),"flagged text never exempts missing cards");rej.itemNodes=nodes;P.dispose(rej);
    /* ... and the same copy at fixed sizes (no fit) spills out of the cards, which the containment check reports */
    var spill = await P.run(deck(), brand, FX.indexOfType(deck(), "grid"), { recipe: "full", anchor: false, short: false, canvasH: 1350, itemsAsText: false, items: wordy });
    assert(P.checkItemText(spill, "bento", "planted").length > 0, "text that does not fit its card is caught by the containment check"); P.dispose(spill);
  });

  test("archetypes: timeline labels at body size clear titles and row icons stay 64 px", async function () {
    await FX.setup();
    var P = await probe(), brand = FX.brand();
    for (var dialect of ["eg", "en"]) for (var canvasH of [1440, 1350]) {
      var spec = deck({ dialect: dialect }), items = P.makeItems("timeline", 3, -1);
      items.forEach(function (item, i) { item.value = dialect === "en" ? "Week " + (i + 1) : "الأسبوع " + (i + 1); });
      var out = await P.run(spec, brand, FX.indexOfType(spec, "timeline"), { anchor: false, items: items, canvasH: canvasH });
      try {
        out.el.querySelectorAll('.cs-item > [data-part="value"]').forEach(function (n) { n.style.fontSize = "56px"; });
        out.el.querySelectorAll('.cs-item > [data-part="icon"]').forEach(function (n) { n.style.removeProperty("inline-size"); n.style.removeProperty("block-size"); });
        await FX.nextFrame();
        out.el.querySelectorAll(".cs-item").forEach(function (n) {
          var value = n.querySelector('[data-part="value"]'), box = value.getBoundingClientRect();
          var title = n.querySelector('[data-part="title"]').getBoundingClientRect(), range = document.createRange();
          range.selectNodeContents(value); var text = range.getBoundingClientRect();
          assert(text.left >= box.left - 1 && text.right <= box.right + 1, "label text stays in its own column");
          assert(box.right <= title.left || title.right <= box.left, "label column clears the title");
          var icon = n.querySelector('[data-part="icon"]').getBoundingClientRect();
          near(icon.width, 64, 1, "row icon width"); near(icon.height, 64, 1, "row icon height");
        });
      } finally { P.dispose(out); }
    }
  });

  test("archetypes: the inner footer contract (S-1): three custom properties move the footer and give the body 110 px, and nothing moves without them", async function () {
    await FX.setup();
    var P = await probe(), brand = FX.brand(), spec = deck(), index = FX.indexOfType(spec, "item");
    for (var canvasH of [1440, 1350]) {
      var dh = canvasH - 1440, base = await P.run(spec, brand, index, { recipe: "under", canvasH: canvasH });
      var inner = await P.run(spec, brand, index, { recipe: "under", canvasH: canvasH, rootVars: { "--cs-pad-bottom": "85px", "--cs-body-h": 998 + dh + "px", "--cs-footer-pad-x": "60px" } });
      var foot = function (o) { return o.chrome.filter(function (c) { return !c.header; }); };
      assert(foot(base).length && foot(inner).length, "footer chrome measured");
      foot(base).forEach(function (c) { near(c.rect.y, 1165 + dh, 1, "1.0 footer y (" + c.name + ")"); assert(c.rect.x >= 114 - 1 && c.rect.x + c.rect.w <= 966 + 1, "1.0 footer x"); });
      foot(inner).forEach(function (c) { near(c.rect.y, 1275 + dh, 1, "inner footer y (" + c.name + ")"); assert(c.rect.x >= 174 - 1 && c.rect.x + c.rect.w <= 906 + 1, "inner footer x (" + c.name + " " + Math.round(c.rect.x) + "-" + Math.round(c.rect.x + c.rect.w) + ")"); });
      near(inner.content.h, 998 + dh, 1, "inner body height"); near(inner.anchor.h - base.anchor.h, 110, 1.5, "the anchor takes the 110 px");
      assert(inner.fit.ok && !P.checkRecipe(inner).length, "the inner slide fits: " + P.checkRecipe(inner).join(","));
      P.dispose(base); P.dispose(inner);
    }
  });

  test("archetypes: the staged variants have their structure (statement, numeral, side-number pill, track, chart, before-after, table)", async function () {
    await FX.setup();
    var P = await probe(), brand = FX.brand(), spec = deck();
    function px(out, key) { return parseFloat(getComputedStyle(out.el.querySelector('[data-slot-key="' + key + '"]')).fontSize); }
    async function run(type, variant, o) { var restore = P.withVariant("swiss", type, variant), r = await P.run(spec, brand, FX.indexOfType(spec, type), Object.assign({ variant: variant }, o || {})); restore(); return r; }
    var want = { rehook: "statement", item: "numeral", step: "track", stat: "icon chart", compare: "table before-after", quote: "statement", cta: "action" };
    Object.keys(want).forEach(function (t) { want[t].split(" ").forEach(function (v) { assert(CS.core.registry.getArchetype(t).variants.indexOf(v) >= 0, t + ":" + v + " is an archetype variant"); }); });
    /* statement (rehook, quote) is a pause in the hero role (spec 4.4): the slot's role, size range, fit priority and line limit are the hero's, through data-role-by-variant and
       data-max-lines-by-variant (four lines); the other variants keep the roles and the limits they had, so the markup of the older variants is untouched */
    var SEVEN = "غيّرت الغلاف بس، وبقى البوست يتحفظ أكتر", EIGHT = "مش لازم تبقى مصمم عشان تطلّع تصميم كويس";           /* the spec's own pause, and one word more */
    var TWELVE = "اللي بيبدأ بسيط بيوصل أسرع من اللي بيستنى الكمال دايما وبيكسب كتير";                                 /* the ceiling of VA6.pause: does not fit four lines of hero type */
    eq(SEVEN.split(/\s+/).length, 7); eq(EIGHT.split(/\s+/).length, 8); eq(TWELVE.split(/\s+/).length, 12);
    for (var t of ["rehook", "quote"]) {
      var field = t === "rehook" ? "headline" : "body", baseRole = t === "rehook" ? "h1" : "h2", baseLines = t === "rehook" ? "3" : "6";
      for (var canvasH of [1440, 1350]) {
        var base = await P.run(spec, brand, FX.indexOfType(spec, t), { canvasH: canvasH }), st = await run(t, "statement", { canvasH: canvasH });
        var id = base.el.getAttribute("data-cs-slide") + "." + field, baseEl = base.el.querySelector('[data-slot-key="' + id + '"]'), stEl = st.el.querySelector('[data-slot-key="' + id + '"]'), label = t + ":statement@" + canvasH;
        eq(baseEl.getAttribute("data-role"), baseRole, t + " base keeps its role (" + baseRole + "): the markup of the older variants is untouched");
        eq(baseEl.getAttribute("data-max-lines"), baseLines, t + " base keeps its line limit");
        eq(stEl.getAttribute("data-role"), "hero", label + " is set in the hero role");
        eq(stEl.getAttribute("data-max-lines"), "4", label + " allows four lines of hero type");
        var hero = st.tokens.type.scale.hero, floorHero = st.tokens.floors.hero;
        assert(px(st, id) >= floorHero - 0.5 && px(st, id) <= hero[1] + 0.5, label + ": the size " + px(st, id) + " is inside the hero range (floor " + floorHero + ", nominal " + hero.join("-") + ")");
        assert(px(st, id) >= px(base, id) * 1.3, label + " is set larger than the base (" + px(st, id) + " against " + px(base, id) + ")");
        var heroProbe = document.createElement("span"); heroProbe.setAttribute("data-role", "hero"); st.el.querySelector("main").appendChild(heroProbe);
        eq(getComputedStyle(stEl).fontFamily, getComputedStyle(heroProbe).fontFamily, label + " uses the face of the hero role"); eq(getComputedStyle(stEl).fontWeight, getComputedStyle(heroProbe).fontWeight, label + " uses the weight of the hero role"); heroProbe.remove();
        assert(st.fit.ok, label + " fits: " + JSON.stringify(st.fit.slots[id]));
        P.dispose(base); P.dispose(st);
        /* pauses of 7 and 8 words fit four lines at no less than the hero floor, in the same stack as the rest of the slide */
        for (var copy of [SEVEN, EIGHT]) {
          var words = copy.split(/\s+/).length, pause = await run(t, "statement", { canvasH: canvasH, mutate: function (sl) { sl[field] = copy; } }), pel = pause.el.querySelector('[data-slot-key="' + id + '"]');
          assert(pause.fit.ok, label + ": a " + words + "-word pause overflows: " + JSON.stringify(pause.fit.slots[id]));
          assert(FX.linesOf(pel).length <= 4, label + ": a " + words + "-word pause runs to " + FX.linesOf(pel).length + " lines");
          assert(px(pause, id) >= floorHero - 0.5 && px(pause, id) <= hero[1] + 0.5, label + ": a " + words + "-word pause is set at " + px(pause, id) + " (hero floor " + floorHero + ")");
          P.dispose(pause);
        }
        /* twelve words: either four lines at no less than the floor, or fit says so: the limit is never exceeded without a flag */
        var long = await run(t, "statement", { canvasH: canvasH, mutate: function (sl) { sl[field] = TWELVE; } }), lel = long.el.querySelector('[data-slot-key="' + id + '"]');
        if (long.fit.ok) assert(FX.linesOf(lel).length <= 4 && px(long, id) >= floorHero - 0.5, label + ": twelve words passed fit with " + FX.linesOf(lel).length + " lines at " + px(long, id));
        else eq(long.fit.slots[id].status, "overflow", label + ": twelve words that do not fit are reported as an overflow of the statement");
        P.dispose(long);
      }
    }
    var num = await run("item", "numeral"), ord = num.el.querySelector(".cs-ord");
    assert(parseFloat(getComputedStyle(ord).fontSize) >= 280 && getComputedStyle(ord).position !== "absolute", "item:numeral: a large ordinal in the flow"); P.dispose(num);
    var side = await run("item", "side-number", { mutate: function (s) { s.media = { slot: "icon" }; } }), pill = side.el.querySelector(".cs-ord").getBoundingClientRect(), icon = side.el.querySelector(".cs-media-slot");
    near(pill.height, 96, 1, "side-number pill height"); assert(pill.width >= 96 - 1, "side-number pill width");
    assert(icon && icon.getBoundingClientRect().height < 200, "the icon slot of side-number is not a 400 px frame (" + (icon && Math.round(icon.getBoundingClientRect().height)) + ")"); P.dispose(side);
    var tr = await run("step", "track"); assert(parseFloat(getComputedStyle(tr.el.querySelector(".cs-ord")).minHeight) >= 66 - 0.5, "step:track row height"); P.dispose(tr);
    var sb = await P.run(spec, brand, FX.indexOfType(spec, "stat"), {}), sc = await run("stat", "chart"), sid = sb.el.getAttribute("data-cs-slide") + ".number";
    assert(px(sc, sid) <= px(sb, sid) * 0.5, "stat:chart figure is " + px(sc, sid) + " against " + px(sb, sid));
    assert(sc.el.querySelector(".cs-title").getBoundingClientRect().top < sc.el.querySelector(".cs-number").getBoundingClientRect().top, "stat:chart: the title is above the figure"); P.dispose(sb); P.dispose(sc);
    var ba = await run("compare", "before-after"), after = getComputedStyle(ba.el.querySelector(".cs-sides"), "::after");
    eq(after.position, "absolute"); near(parseFloat(after.width), 56, 0.5, "arrow badge width"); near(parseFloat(after.height), 44, 0.5, "arrow badge height"); P.dispose(ba);
    var tb = await run("compare", "table", { items: P.makeTable(4) }), left = tb.el.getBoundingClientRect().left;
    var sides = Array.prototype.map.call(tb.el.querySelectorAll(".cs-side"), function (n) { var r = n.getBoundingClientRect(); return { x: r.left - left, r: r.right - left }; }).sort(function (a, b) { return a.x - b.x; });
    assert(tb.itemNodes.length === 4 && sides.length === 2, "table: 4 rows under 2 heads");
    tb.itemNodes.forEach(function (rw, i) {
      var cols = [rw.parts.text, rw.parts.value].sort(function (a, b) { return a.x - b.x; });
      near(cols[0].x, sides[0].x, 2.5, "row " + i + " first verdict column"); near(cols[1].x, sides[1].x, 2.5, "row " + i + " second verdict column");
      assert(rw.parts.title.x >= sides[1].r - 4, "row " + i + ": the criterion is in the key column, beside the heads");
    });
    P.dispose(tb);
  });

  test("archetypes: row icons sit in the bullet indent (checklist rows and setup:cards, Arabic and English), and a user asset on a type that never had a media slot outweighs the centring spacers", async function () {
    await FX.setup();
    /* the contract: --cs-bullet-indent is the room before the text for a row icon (96 px with icons, 56 px without). In a plain row it is the start padding of the row; in a
       card the card keeps its own 24 px padding and the icon sits inside it, so the indent is added to the padding and the same value works in both. */
    var EN = { checklist: { title: "Before you post", bullets: ["The cover makes a clear promise", "Slide two pays it off", "Every number has a source"], bridge: "Save it" }, setup: { title: "What you need", bullets: ["A Claude account", "A phone or a laptop", "Ten free minutes"], bridge: "Ready?" } };
    var CASES = [
      { type: "checklist", variant: null, lang: "ar", cardPad: 0 }, { type: "checklist", variant: null, lang: "en", cardPad: 0 },
      { type: "setup", variant: "cards", lang: "ar", cardPad: 24 }, { type: "setup", variant: "cards", lang: "en", cardPad: 24 },
      { type: "setup", variant: "base", lang: "ar", cardPad: 0 }
    ];
    for (var c of CASES) {
      var en = c.lang === "en", label = c.type + (c.variant ? ":" + c.variant : "") + " " + c.lang;
      var target = FX.slideFor(c.type, Object.assign({}, en ? EN[c.type] : {}, c.variant ? { variant: c.variant } : {}));
      var spec = FX.makeSpec([FX.slideFor("cover"), target, FX.slideFor("cta")], en ? { dialect: "en", swipe: "arrow-ltr" } : {});
      var r = await FX.render(spec, 1, { mode: "export" }), ul = r.el.querySelector(".cs-bullets"), li = ul.querySelector(".cs-bullet"), rtl = r.el.getAttribute("dir") === "rtl";
      eq(r.el.getAttribute("dir"), en ? "ltr" : "rtl", label + " direction");
      eq(r.el.getAttribute("data-variant"), c.variant || r.el.getAttribute("data-variant"), label + " variant");
      var cs0 = getComputedStyle(li), padBefore = [cs0.paddingTop, cs0.paddingBottom, cs0.paddingInlineStart, cs0.paddingInlineEnd].map(parseFloat);
      if (c.cardPad) { padBefore.forEach(function (p, i) { near(p, c.cardPad, 0.5, label + ": the card keeps its 24 px padding without icons (side " + i + ")"); }); }
      else near(padBefore[2], 56, 0.5, label + ": the 1.0 bullet indent");
      var chip = document.createElement("span"); chip.setAttribute("data-part", "icon"); chip.setAttribute("aria-hidden", "true"); chip.style.cssText = "inline-size:64px;block-size:64px;"; li.insertBefore(chip, li.firstChild);
      ul.style.setProperty("--cs-bullet-indent", "96px"); ul.style.setProperty("--cs-bullet-h", "128px");
      await FX.nextFrame();
      near(parseFloat(getComputedStyle(li).paddingInlineStart), 96 + c.cardPad, 0.5, label + ": --cs-bullet-indent makes the room 96 px" + (c.cardPad ? " inside the card padding" : ""));
      assert(li.getBoundingClientRect().height >= 128 - 1, label + ": --cs-bullet-h is the row height");
      var lb = li.getBoundingClientRect(), cb = chip.getBoundingClientRect(), ws = Array.prototype.map.call(li.querySelectorAll(".w"), function (w) { return w.getBoundingClientRect(); });
      assert(ws.length >= 2, label + ": the row has words");
      /* the chip sits at the start edge (inside the card padding in a card), and the text starts after it: no overlap, the gap is the indent less the chip */
      near(rtl ? lb.right - cb.right : cb.left - lb.left, c.cardPad, 1.5, label + ": the chip sits " + c.cardPad + " px from the start edge");
      near(cb.top - lb.top, c.cardPad, 1.5, label + ": the chip sits " + c.cardPad + " px from the top");
      var textStart = rtl ? Math.max.apply(null, ws.map(function (w) { return w.right; })) : Math.min.apply(null, ws.map(function (w) { return w.left; }));
      var gap = rtl ? cb.left - textStart : textStart - cb.right;
      near(gap, 32, 2, label + ": 32 px between the chip and the text (" + Math.round(gap) + ")");
      ws.forEach(function (w) { assert(!(w.left < cb.right - 0.5 && w.right > cb.left + 0.5 && w.top < cb.bottom - 0.5 && w.bottom > cb.top + 0.5), label + ": a word runs into the icon"); });
      r.el.remove();
    }
    var spec = FX.makeSpec([FX.slideFor("cover"), FX.slideFor("checklist"), FX.slideFor("share", { media: { slot: "screenshot" } }), FX.slideFor("cta")]);
    var st = await FX.render(spec, 2, { mode: "export" }), media = st.el.querySelector(".cs-media-slot");
    assert(media && media.getAttribute("data-media-kind") === "screenshot" && media.getBoundingClientRect().height >= 240 - 1, "share now carries a user asset slot, " + (media && Math.round(media.getBoundingClientRect().height)) + " px high");
    eq(getComputedStyle(media).flexGrow, "6", "it outweighs the two centring spacers (grow 1 each): text first, then the asset takes the free height, not a third of it");
    st.el.remove();
    var it = await FX.render(FX.makeSpec([FX.slideFor("cover"), FX.slideFor("item", { media: { slot: "screenshot" } })]), 1, { mode: "export" });
    eq(getComputedStyle(it.el.querySelector(".cs-media-slot")).flexGrow, "1", "a type that already had the slot keeps its 1.0 rule"); it.el.remove();
  });
})();
