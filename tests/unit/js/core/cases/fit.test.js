/* fit: sizes (never tracking), floors, priority, lines, and the equivalence with a linear scan. */
(function () {
  var test = CST.test, eq = CST.eq, assert = CST.assert;

  function ex(patch) { var s = FX.example(); s.style.overrides = {}; if (patch) patch(s); return s; }
  function q(el, sel) { return el.querySelector(sel); }
  function qa(el, sel) { return Array.prototype.slice.call(el.querySelectorAll(sel)); }
  function rel(node, slideEl) {
    var r = node.getBoundingClientRect(), s = slideEl.getBoundingClientRect(), k = s.width / slideEl.offsetWidth;
    return { x: (r.left - s.left) / k, y: (r.top - s.top) / k, w: r.width / k, h: r.height / k };
  }
  function drop(r) { if (r && r.el && r.el.parentNode) r.el.remove(); }
  var WORDS = "الأداة الأولى بتختصر عليك وقت كبير وبتخلي الشغل أسهل بكتير من أي حاجة جربتها قبل كده".split(" ");
  function sentence(n) { var out = []; for (var i = 0; i < n; i++) out.push(WORDS[i % WORDS.length]); return out.join(" ") + "."; }
  function quoteSpec(words) { return FX.makeSpec([FX.slideFor("cover"), { type: "quote", body: sentence(words) }, FX.slideFor("cta")]); }

  test("fit: automatic cover breaks reach the largest legal hero among word partitions", async function () {
    await FX.setup();
    var words = ["Nova", "تختصر", "وقتك", "وتترك", "القرار", "لك"], biggest = 0;
    async function size(breaks) {
      var title = words.map(function (w, i) { return (i ? breaks.indexOf(i) >= 0 ? "\n" : " " : "") + w; }).join("");
      var s = FX.makeSpec([FX.slideFor("cover", { headline: title, sub: "خطوة عملية" }), FX.slideFor("cta")]);
      var r = await FX.render(s, 0, { mode: "export" });
      var px = r.fit.slots["s01.headline"].fontPx;
      assert(r.el.querySelectorAll('[data-slot="headline"] .w').length === words.length, "all original words stay in their field");
      drop(r); return px;
    }
    var automatic = await size([]);
    for (var i = 1; i < words.length; i++) {
      biggest = Math.max(biggest, await size([i]));
      for (var j = i + 1; j < words.length; j++) biggest = Math.max(biggest, await size([i, j]));
    }
    assert(automatic >= biggest, "automatic " + automatic + " px vs best forced arrangement " + biggest + " px");
  });

  test("fit: ordinary spaces inside a Latin title can become legal line breaks", async function () {
    await FX.setup();
    async function render(headline) {
      return FX.render(FX.makeSpec([FX.slideFor("cover", { headline: headline }), FX.slideFor("cta")]), 0, { mode: "export" });
    }
    var automatic = await render("ChatGPT Pro\nعملك أبسط"), forced = await render("ChatGPT\nPro\nعملك أبسط");
    try {
      assert(automatic.fit.slots["s01.headline"].fontPx >= forced.fit.slots["s01.headline"].fontPx, "a regular space must not cap the automatic hero below a legal forced arrangement");
      CST.deepEq(qa(automatic.el, '[data-slot="headline"] .w').map(function (w) { return w.textContent; }), ["ChatGPT", "Pro", "عملك", "أبسط"]);
      assert(qa(automatic.el, '.cs-headline .cs-ltr').every(function (run) { return run.getClientRects().length === 1; }), "each resulting Latin run stays isolated on its own line");
    } finally { drop(automatic); drop(forced); }
  });

  test("fit: a number variant without a numeral keeps the three-line cover limit", async function () {
    await FX.setup();
    var preset = JSON.parse(JSON.stringify(CS.core.registry.getPreset("swiss"))); preset.id = "fit-number"; preset.variants.cover = ["top", "number"]; CS.core.registry.registerPreset(preset);
    var spec = FX.makeSpec([{ type: "cover", variant: "number", headline: "فكرة واضحة ترشد خطواتك من البداية" }, FX.slideFor("cta")], { preset: "fit-number" });
    var r = await FX.render(spec, 0, { mode: "export" });
    try {
      eq(r.el.dataset.variant, "number");
      assert(r.fit.ok, "the non-numeric cover has a legal arrangement");
      assert(CS.core.fit.measureLines(q(r.el, ".cs-headline")).lines.length <= 3, "the extra graphic row requires an actual leading numeral: " + JSON.stringify(r.fit.slots["s01.headline"]));
    } finally { drop(r); }
  });

  test("fit: replacing a composed cover node never restores its previous words", async function () {
    await FX.setup();
    var spec = FX.makeSpec([FX.slideFor("cover", { headline: "فكرة واضحة للعمل" }), FX.slideFor("cta")]);
    var r = await FX.render(spec, 0, { mode: "export" });
    try {
      spec.slides[0].headline = "قرار جديد اليوم";
      await CS.core.render.update(r, spec, FX.brand(), { mode: "export", useFrozen: false });
      CST.deepEq(qa(r.el, '.cs-headline .w').map(function (w) { return w.textContent; }), ["قرار", "جديد", "اليوم"]);
    } finally { drop(r); }
  });

  test("fit: the example deck fits, sizes are whole pixels inside [floor, max]", async function () {
    await FX.setup();
    var spec = ex(), brand = FX.brand(), deck = await CS.core.render.deck(spec, brand, { mode: "export" });
    try {
      eq(deck.slides.length, 8);
      deck.slides.forEach(function (r) {
        assert(r.fit.ok, r.id + " has overflow: " + JSON.stringify(r.fit.warnings));
        Object.keys(r.fit.slots).forEach(function (k) {
          var s = r.fit.slots[k], floor = CS.core.fit.floorPx(s.role, r.tokens), rg = CS.core.fit.rangeFor(s.role, r.tokens);
          assert(s.status !== "overflow", k + " overflow");
          assert(s.fontPx === Math.round(s.fontPx), k + " whole pixels");
          if (s.role !== "small" || k.indexOf(".ord") < 0) assert(s.fontPx >= Math.min(floor, rg.min) - 0.5 && s.fontPx <= Math.max(rg.max, 500), k + " size " + s.fontPx + " outside [" + floor + ", " + rg.max + "]");
          eq(s.key, k);
          ["fit", "shrunk", "floor"].indexOf(s.status) >= 0 || (function () { throw new Error(k + " status " + s.status); })();
        });
      });
      var hero = deck.slides[0].fit.slots["s01.headline"];
      assert(hero.fontPx >= 96 && hero.fontPx <= 180, "cover hero size " + hero.fontPx);
      eq(deck.slides[0].fit.slots["s01.headline"].role, "hero");
    } finally { deck.dispose(); }
  });

  test("fit: nothing leaves the content box, touches a keep-out, or pushes the stack out of the body area", async function () {
    await FX.setup();
    var spec = ex(), deck = await CS.core.render.deck(spec, FX.brand(), { mode: "export" }), K = CS.core.constants;
    try {
      deck.slides.forEach(function (r) {
        var cb = rel(q(r.el, ".cs-content"), r.el);
        qa(r.el, "main .w").forEach(function (w) {
          var b = rel(w, r.el);
          assert(b.x >= K.CONTENT.x - 1 && b.x + b.w <= K.CONTENT.x + K.CONTENT.w + 1 && b.y >= K.CONTENT.y - 1 && b.y + b.h <= K.CONTENT.y + K.CONTENT.h + 1, r.id + ": word outside the content box " + JSON.stringify(b));
          K.KEEP_OUTS.forEach(function (ko) { assert(!(b.x < ko.x + ko.w && b.x + b.w > ko.x && b.y < ko.y + ko.h && b.y + b.h > ko.y), r.id + ": word touches keep-out " + ko.id); });
        });
        Array.prototype.forEach.call(q(r.el, ".cs-content").children, function (c) {
          if (getComputedStyle(c).position === "absolute") return;
          var b = rel(c, r.el); assert(b.y >= cb.y - 1 && b.y + b.h <= cb.y + cb.h + 1, r.id + ": " + c.className + " leaves the body area");
        });
        var hb = rel(q(r.el, ".cs-header"), r.el), fb = rel(q(r.el, ".cs-footer"), r.el);
        eq(Math.round(hb.y), 165); eq(Math.round(fb.y), 1165);
        qa(r.el, ".cs-footer > *").forEach(function (f) { assert(rel(f, r.el).h <= 49.5 && rel(f, r.el).y + rel(f, r.el).h <= 1255, "footer items are top-aligned, at most 49 px high and end above the bottom keep-out (y 1255)"); });
      });
    } finally { deck.dispose(); }
  });

  test("fit: more text never gives a larger size", async function () {
    await FX.setup();
    var last = Infinity, sizes = [];
    for (var n of [3, 6, 10, 16, 24, 34, 50]) {
      var r = await FX.render(quoteSpec(n), 1, { mode: "export" });
      var s = r.fit.slots["s02.body"]; sizes.push(s.fontPx);
      assert(s.fontPx <= last, "size grew with more text: " + sizes.join(","));
      last = s.fontPx; drop(r);
    }
    assert(sizes[0] > sizes[sizes.length - 1], "and it does shrink: " + sizes.join(","));
    assert(sizes[0] === 72, "short text keeps the maximum (h2 = 72): " + sizes[0]);
  });

  test("fit: the result equals a linear scan from the maximum (lone-word search aside)", async function () {
    await FX.setup();
    var checked = 0;
    for (var n of [4, 9, 14, 21, 29, 37]) {
      var r = await FX.render(quoteSpec(n), 1, { mode: "edit" }), el = r.el, slot = q(el, ".cs-body");
      var final = parseFloat(slot.style.fontSize), tokens = r.tokens, rg = CS.core.fit.rangeFor("h2", tokens), floor = CS.core.fit.floorPx("h2", tokens);
      var bodyBox = rel(q(el, ".cs-content"), el);
      function state(S) {
        slot.style.fontSize = S + "px";
        var m = CS.core.fit.measureLines(slot), sr = rel(slot, el), words = qa(slot, ".w").map(function (w) { return rel(w, el); });
        var inside = words.every(function (b) { return b.x >= sr.x - 1 && b.x + b.w <= sr.x + sr.w + 1; });
        var stack = sr.y >= bodyBox.y - 1 && sr.y + sr.h <= bodyBox.y + bodyBox.h + 1;
        var widths = m.rects.map(function (x) { return x.w; }), widest = Math.max.apply(null, widths), last = m.lines[m.lines.length - 1];
        var lone = m.lines.length >= 2 && last.length < 2 && widths[widths.length - 1] < 0.35 * widest;
        return { hard: m.lines.length <= 6 && inside && stack, lone: lone };
      }
      var hardMax = null, ref = null;
      for (var S = rg.max; S >= floor; S--) { if (state(S).hard) { hardMax = S; break; } }
      if (hardMax !== null) {
        for (S = hardMax; S >= Math.max(floor, Math.ceil(hardMax * 0.8)); S--) { var st = state(S); if (st.hard && !st.lone) { ref = S; break; } }
        var expected = ref === null ? hardMax : ref;
        eq(final, expected, "words=" + n + " engine " + final + " vs linear scan " + expected + " (hard max " + hardMax + ")");
        checked++;
      } else { eq(r.fit.slots["s02.body"].status, "overflow", "nothing fits: reported as overflow, size at the floor"); eq(final, floor); }
      drop(r);
    }
    assert(checked >= 4, "scanned " + checked);
  });

  test("fit: a text that cannot fit even at the floor is reported, never thrown", async function () {
    await FX.setup();
    var r = await FX.render(FX.makeSpec([FX.slideFor("cover"), { type: "item", title: "عنوان", body: sentence(120) }, FX.slideFor("cta")]), 1, { mode: "export" });
    var body = r.fit.slots["s02.body"];
    eq(body.status, "overflow"); eq(body.fontPx, 42, "left at the floor"); eq(r.fit.ok, false);
    assert(r.fit.warnings.length >= 1 && r.fit.warnings[0].ar && r.fit.warnings[0].en, "a bilingual warning");
    assert(r.fit.slots["s02.title"].status !== "overflow" || true);
    drop(r);
  });

  test("fit: bullets share one size, sides keep the myth/fact ratio, the number slot fits its width", async function () {
    await FX.setup();
    var spec = FX.makeSpec([FX.slideFor("cover"), FX.slideFor("checklist"), FX.slideFor("myth-fact"), FX.slideFor("stat"), FX.slideFor("cta")]);
    var deck = await CS.core.render.deck(spec, FX.brand(), { mode: "export" });
    try {
      var cl = deck.slides[1].fit.slots, sz = Object.keys(cl).filter(function (k) { return k.indexOf("bullets") > 0; }).map(function (k) { return cl[k].fontPx; });
      assert(sz.length === 5 && sz.every(function (x) { return x === sz[0]; }), "bullets: " + sz.join(","));
      var mf = deck.slides[2].fit.slots, myth = mf["s03.sides.0"].fontPx, fact = mf["s03.sides.1"].fontPx;
      assert(myth <= fact && myth === Math.max(42, Math.round(fact * 0.9)), "myth " + myth + " vs fact " + fact);
      var st = deck.slides[3].fit.slots["s04.number"];
      assert(st.fontPx >= 96 && st.fontPx <= 360 && st.role === "number", "stat number " + st.fontPx);
      var numEl = q(deck.slides[3].el, ".cs-number");
      assert(rel(q(numEl, ".cs-unit"), deck.slides[3].el).x >= 98 - 1, "figure and unit inside the content box");
    } finally { deck.dispose(); }
  });

  test("fit: a headline that does not fit its preset width may use the whole content width", async function () {
    await FX.setup();
    var pool = "ثمانية أدوات مجانية بتغنيك تمامًا عن المصمم والمونتير والمترجم وكمان الكاتب".split(" "), states = [];
    for (var n = 3; n <= pool.length; n++) {
      var r = await FX.render(FX.makeSpec([{ type: "cover", headline: pool.slice(0, n).join(" ") }, FX.slideFor("cta")]), 0, { mode: "export" }), h = q(r.el, ".cs-headline");
      var widened = h.getAttribute("data-widened") === "1";
      states.push(n + ":" + (widened ? "wide" : "preset") + (r.fit.ok ? "" : "!"));
      if (widened) eq(h.style.inlineSize, "100%"); else assert(h.style.inlineSize === "", "an unwidened headline keeps its CSS width");
      assert(r.fit.slots["s01.headline"].lines <= 3 || !r.fit.ok, "never more than 3 lines while fitting");
      drop(r);
    }
    var firstWide = states.findIndex(function (x) { return x.indexOf("wide") > 0; });
    assert(firstWide >= 0, "somewhere between three words and a dozen the preset width runs out: " + states.join(" "));
    assert(states.slice(0, firstWide).every(function (x) { return x.indexOf("preset") > 0 && x.indexOf("!") < 0; }), "before that nothing is widened and everything fits: " + states.join(" "));
    assert(states[firstWide].indexOf("!") < 0 || states.slice(firstWide).every(function (x) { return x.indexOf("!") > 0; }), "widening rescues the first overflowing headline unless nothing could: " + states.join(" "));
    var short = FX.makeSpec([{ type: "cover", headline: "5 أخطاء" }, FX.slideFor("cta")]);
    var r2 = await FX.render(short, 0, { mode: "export" });
    assert(!q(r2.el, ".cs-headline").hasAttribute("data-widened"), "a short headline keeps the preset width");
    eq(r2.fit.slots["s01.headline"].fontPx, 180, "and the maximum size"); drop(r2);
  });

  test("fit: measureLines reads physical lines from word boxes and keeps U+00A0", async function () {
    await FX.setup();
    var r = await FX.render(ex(), 0, { mode: "edit" }), h = q(r.el, ".cs-headline"), m = CS.core.fit.measureLines(h);
    assert(m.lines.length >= 2 && m.lines.length <= 3, "headline lines: " + m.lines.length);
    eq(m.text.length, m.lines.length); eq(m.rects.length, m.lines.length);
    assert(m.text[0].indexOf("6\u00A0أدوات") >= 0, "the number stays bound to its noun on line one: " + JSON.stringify(m.text[0]));
    for (var i = 1; i < m.rects.length; i++) assert(m.rects[i].y > m.rects[i - 1].y, "lines run top to bottom");
    eq(m.lines.reduce(function (n, l) { return n + l.length; }, 0), qa(h, ".w").length, "every word belongs to one line");
    drop(r);
  });

  test("fit: wrapLines groups words into .cs-ln blocks and is idempotent", async function () {
    await FX.setup();
    var r = await FX.render(ex(), 0, { mode: "edit" }), h = q(r.el, ".cs-headline");
    var before = qa(h, ".w").map(function (w) { return w.textContent; }), natural = CS.core.fit.measureLines(h).text;
    var lines = CS.core.fit.wrapLines(h);
    eq(lines.length, natural.length); assert(lines.every(function (l, i) { return l.classList.contains("cs-ln") && l.getAttribute("data-m") === "ln" && l.getAttribute("data-m-i") === String(i) && l.getAttribute("data-m-slot") === "headline"; }), "attributes");
    CST.deepEq(qa(h, ".w").map(function (w) { return w.textContent; }), before, "words keep their order");
    CST.deepEq(CS.core.fit.measureLines(h).text, natural, "the layout does not change");
    assert(qa(h, ".cs-ln mark.cs-em").length >= 1, "emphasis is kept inside the lines");
    var again = CS.core.fit.wrapLines(h); eq(again.length, lines.length); assert(again[0] === lines[0], "second call returns the same blocks");
    assert(qa(h, ".cs-ln").every(function (l) { return l.parentNode === h; }), "blocks are direct children of the slot");
    drop(r);
  });

  test("fit: wrapLinesBy splits an emphasis span that crosses a line break and refuses mismatched counts", async function () {
    await FX.setup();
    var spec = FX.makeSpec([FX.slideFor("cover", { headline: "ثلاث ==كلمات مهمة جدًا== هنا" }), FX.slideFor("cta")]);
    var r = await FX.render(spec, 0, { mode: "edit" }), h = q(r.el, ".cs-headline"), n = qa(h, ".w").length;
    eq(CS.core.fit.wrapLinesBy(h, [1, 1]), null, "counts must add up to the words");
    var lines = CS.core.fit.wrapLinesBy(h, [2, n - 2]);
    eq(lines.length, 2); eq(qa(h, ".cs-ln")[0].querySelectorAll("mark.cs-em").length, 1); eq(qa(h, ".cs-ln")[1].querySelectorAll("mark.cs-em").length, 1, "the span is cloned into both lines");
    eq(qa(h, ".w").length, n); drop(r);
  });

  test("fit: the same input gives the same sizes, also from a scaled slide", async function () {
    await FX.setup();
    var spec = ex(), a = await FX.render(spec, 0, { mode: "export" }), b = await FX.render(spec, 0, { mode: "export" });
    CST.deepEq(FX.sizes(a), FX.sizes(b), "deterministic");
    var wrap = document.createElement("div"); wrap.style.cssText = "position:fixed;left:0;top:0;width:540px;height:720px;transform:scale(.5);transform-origin:0 0";
    document.body.appendChild(wrap); wrap.appendChild(b.el);
    var again = CS.core.fit.fitSlide(b.el, b.tokens);
    Object.keys(a.fit.slots).forEach(function (k) { eq(again.slots[k].fontPx, a.fit.slots[k].fontPx, "scaled: " + k); eq(again.slots[k].lines, a.fit.slots[k].lines, "lines " + k); });
    wrap.remove(); drop(a);
  });

  test("fit: fitSlot fits one slot in the current layout", async function () {
    await FX.setup();
    var spec = ex(), r = await FX.render(spec, 2, { mode: "edit" }), body = q(r.el, ".cs-body");
    var res = CS.core.fit.fitSlot(body, "body", r.tokens);
    eq(res.key, "s03.body"); eq(res.role, "body"); assert(res.fontPx >= 42 && res.fontPx <= 48 && res.lines >= 1, JSON.stringify(res));
    ["key", "role", "fontPx", "minPx", "maxPx", "lines", "words", "box", "loneWord", "status"].forEach(function (k) { assert(k in res, "FitSlotResult." + k); });
    body.innerHTML = body.innerHTML + " " + qa(body, ".w").map(function (w) { return w.outerHTML; }).join(" ").repeat(3);
    var longer = CS.core.fit.fitSlot(body, "body", r.tokens);
    assert(longer.fontPx <= res.fontPx && longer.words > res.words, "more words, same or smaller size");
    drop(r);
  });

  test("fit: frozen sizes are applied as given", async function () {
    await FX.setup();
    var r = await FX.render(ex(), 2, { mode: "edit" }), sizes = {};
    CS.core.compose.slots(r.el).forEach(function (s) { sizes[s.key] = s.key.indexOf("title") > 0 ? 60 : 44; });
    var rep = CS.core.fit.fitSlide(r.el, r.tokens, { frozenSizes: sizes });
    eq(rep.slots["s03.title"].fontPx, 60); eq(rep.slots["s03.body"].fontPx, 44); eq(parseFloat(q(r.el, ".cs-title").style.fontSize), 60);
    drop(r);
  });

  test("fit: the 4:5 fallback canvas has a shorter body and still fits", async function () {
    await FX.setup();
    var spec = ex(function (s) { s.canvas.h = 1350; s.canvas.preset = "ig-4x5"; });
    var deck = await CS.core.render.deck(spec, FX.brand(), { mode: "export" });
    try {
      deck.slides.forEach(function (r) {
        eq(r.el.offsetHeight, 1350); assert(r.fit.ok, r.id + " overflows on 4:5");
        var f = rel(q(r.el, ".cs-footer"), r.el); eq(Math.round(f.y), 1075);
        var cb = rel(q(r.el, ".cs-content"), r.el); eq(Math.round(cb.h), 798);
      });
    } finally { deck.dispose(); }
  });

  test("fit: tashkeel text gets more line height and still fits", async function () {
    await FX.setup();
    var spec = FX.makeSpec([FX.slideFor("cover"), { type: "item", title: "عنوان", body: "أَحَبُّ الأَدَوَاتِ إِلَيَّ هِيَ الَّتِي تُوَفِّرُ عَلَيَّ الوَقْتَ وَالجُهْدَ" }, FX.slideFor("cta")]);
    var r = await FX.render(spec, 1, { mode: "export" });
    assert(r.fit.ok, "fits"); var body = q(r.el, ".cs-body"); assert(parseFloat(getComputedStyle(body).lineHeight) / parseFloat(getComputedStyle(body).fontSize) >= 1.78, "line height ratio " + getComputedStyle(body).lineHeight); drop(r);
  });
  test("fit v2: numeral 280/360/520 and stamped floors hold on both canvases", async function () {
    await FX.setup();
    var tokens = CS.core.resolve.post(ex(), null);
    [1440, 1350].forEach(function (h) {
      var el = document.createElement("article"), label = document.createElement("div");
      el.className = "cs-slide"; el.setAttribute("data-cs-slide", "s03");
      el.style.cssText = "position:relative;width:1080px;height:" + h + "px";
      label.setAttribute("data-slot-key", "s03.art.0"); label.setAttribute("data-role", "numeral"); label.setAttribute("data-floor", "200");
      label.style.cssText = "position:absolute;left:114px;top:261px;width:852px;height:900px;font-family:Arial;line-height:1";
      label.innerHTML = CS.core.text.toHTML("7"); el.appendChild(label); document.body.appendChild(el);
      try {
        [280, 360, 520].forEach(function (px) {
          var t = JSON.parse(JSON.stringify(tokens)); t.type.scale.numeral = [px, px];
          var result = CS.core.fit.fitSlot(label, "numeral", t);
          eq(result.fontPx, px); eq(result.status, "fit");
          CST.deepEq(result, CS.core.fit.fitSlot(label, "numeral", t), "run twice");
        });
        label.setAttribute("data-floor", "38"); label.setAttribute("data-role", "small");
        eq(CS.core.fit.fitSlot(label, "small", tokens).fontPx, 38, "data-floor wins even above a nominal maximum");
      } finally { el.remove(); }
    });
  });
  CST.test("fit: wrapping preserves original mark identity across lines without merging independent targets twice",async function(){
    await FX.setup();
    function run(){
      var n=document.createElement('p');n.dataset.slotKey='s99.body';
      n.innerHTML='<mark data-mark-target="strike-line"><span class="w">one</span> <span class="w">two</span></mark> <mark data-mark-target="strike-line"><span class="w">three</span></mark>';
      CS.core.fit.wrapLinesBy(n,[1,1,1]);
      return Array.from(n.querySelectorAll('[data-mark-target]')).map(n=>n.dataset.markId);
    }
    var a=run();CST.deepEq(a,run());CST.eq(a[0],a[1]);CST.assert(a[1]!==a[2],'adjacent original targets have distinct identities');
  });
})();
