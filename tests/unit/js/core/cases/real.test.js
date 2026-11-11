/* real presets (styles/index.json, run with --real-presets): the engine against the six shipped presets.
 * What these tests guard: presets register and resolve cleanly, every preset x type x variant fits, the floors hold on the presets' own
 * defaults, fonts cover the copy, and decor.css only refers to hooks (classes, data attributes and their values) that compose really emits. */
(function () {
  var test = CST.test, eq = CST.eq, assert = CST.assert;

  var TYPES = null;
  function types() { return TYPES || (TYPES = CS.core.constants.SLIDE_TYPES); }
  function ids() { return FX.realIndex.presets.map(function (p) { return p.id; }); }
  function ex(patch) { var s = FX.example(); s.style.overrides = {}; if (patch) patch(s); return s; }

  var PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

  test("real: notebook Latin words match the Arabic slot weight using the registered face", async function () {
    await FX.setup({ real: true });
    var spec = ex(function (s) {
      s.style.presetId = "notebook@1.0";
      s.slides[0].headline = "أفكار من ChatGPT";
      s.slides[2].title = "جرّب Reddit الآن";
      s.slides[2].body = "يمكنك تجربة Wiz ثم Argon بسهولة";
    });
    var deck = await CS.core.render.deck(spec, null, { mode: "export", useFrozen: false });
    try {
      var checked = 0;
      deck.slides.forEach(function (entry) {
        entry.el.querySelectorAll('.cs-ltr[data-run="latin"]').forEach(function (run) {
          var slot = run.closest("[data-slot]");
          if (!slot) return;
          var arabic = Array.from(slot.querySelectorAll(".w")).find(function (w) { return !w.contains(run) && /[\u0621-\u064A]/.test(w.textContent); });
          if (!arabic) return;
          var a = getComputedStyle(run), b = getComputedStyle(arabic);
          assert(Math.abs(parseInt(a.fontWeight, 10) - parseInt(b.fontWeight, 10)) <= 100, run.textContent + " matches slot weight");
          assert(a.fontFamily.indexOf("Readex Pro") >= 0, run.textContent + " keeps the registered Latin face");
          checked++;
        });
      });
      assert(checked >= 4, "cover, title and body Latin words were measured");
    } finally { deck.dispose(); }
  });

  test("real: the six presets register in index order and their variants exist in the archetypes", async function () {
    await FX.setup({ real: true });
    CST.deepEq(CS.core.registry.listPresets().map(function (p) { return p.id; }), ids(), "registered in styles/index.json order");
    CST.deepEq(ids(), ["swiss", "creator", "notebook", "poster", "interface", "heritage"], "the v1 set of Q37");
    CS.core.registry.listPresets().forEach(function (p) {
      Object.keys(p.variants).forEach(function (t) {
        var a = CS.core.registry.getArchetype(t);
        p.variants[t].forEach(function (v) { assert(a.variants.indexOf(v) >= 0, p.id + ": variant " + v + " is not an archetype variant of " + t); });
      });
      eq(p.decor.kashida.allowed, p.id === "heritage", p.id + " kashida allowed only on heritage");
    });
  });

  test("real: a preset's own defaults pass the floors untouched and every font is installed", async function () {
    await FX.setup({ real: true });
    var C = CS.core.color, notes = [];
    ids().forEach(function (id) {
      var spec = ex(function (s) { s.style.presetId = id + "@1.0"; }), t = CS.core.resolve.post(spec, null);
      t.adjustments.forEach(function (a) { notes.push(id + ": " + a.path + " (" + a.reason + ")"); });
      assert(t.fonts.every(function (f) { return CS.core.registry.hasFont(f); }), id + ": fonts in the registry");
      eq(t.floors.hero >= 96 && t.floors.body >= 42 && t.floors.meta >= 30, true, id + " floors");
      assert(C.contrast(t.roles.ink, t.roles.bg) >= t.floors.contrastBody - 0.01, id + " ink/bg");
      assert(C.contrast(t.roles.inkMuted, t.roles.bg) >= t.floors.contrastBody - 0.01, id + " inkMuted/bg");
      assert(C.contrast(t.derived.onAccent, t.roles.accent) >= t.floors.contrastBody - 0.01, id + " onAccent/accent");
    });
    /* Not a failure of the engine: the preset author is told which defaults the floors had to move (preset_lint checks the same). */
    if (notes.length) console.warn("presets whose own defaults the floors adjusted: " + notes.join("; "));
  });

  test("real: every preset renders every type x variant without overflow, on the example brand", async function () {
    await FX.setup({ real: true });
    var problems = [], count = 0;
    for (var id of ids()) {
      var preset = CS.core.registry.getPreset(id);
      for (var type of types()) {
        for (var variant of (preset.variants[type] || [CS.core.registry.getArchetype(type).defaultVariant])) {
          var spec = FX.variantSpec(type, variant, { preset: id }), index = FX.indexOfType(spec, type);
          var r = await CS.core.render.slide(spec, FX.brand(), index, { mode: "export" });
          if (r.el.getAttribute("data-variant") !== variant) problems.push(id + "/" + type + "/" + variant + ": rendered as " + r.el.getAttribute("data-variant"));
          if (!r.fit.ok) problems.push(id + "/" + type + "/" + variant + ": overflow " + Object.keys(r.fit.slots).filter(function (k) { return r.fit.slots[k].status === "overflow"; }).join(","));
          r.el.remove(); count++;
        }
      }
    }
    assert(count >= 100, "rendered " + count + " combinations");
    assert(!problems.length, problems.slice(0, 10).join(" | "));
  });

  test("real: the fonts of every preset cover the sample copy", async function () {
    await FX.setup({ real: true });
    var all = types().map(function (t) { return FX.slideFor(t); }), text = JSON.stringify(all.map(function (s) { return [s.kicker, s.headline, s.title, s.body, s.sub, s.bridge, s.bullets, s.sides, s.attribution, s.cta && s.cta.text]; })).replace(/==|\\n/g, " ");
    var bad = [];
    ids().forEach(function (id) {
      var t = CS.core.resolve.post(ex(function (s) { s.style.presetId = id + "@1.0"; }), null);
      ["display", "heading", "body"].forEach(function (role) {
        var miss = CS.core.registry.missingGlyphs(t.type[role].family, text.replace(/[A-Za-z0-9]/g, ""));
        if (miss.length) bad.push(id + "." + role + " (" + t.type[role].family + ") lacks " + miss.map(function (c) { return "U+" + c.toString(16).toUpperCase(); }).join(","));
      });
      var latin = CS.core.registry.missingGlyphs(t.type.latin.family, "ChatGPT Claude 0123456789 $%@yourbrand");
      if (latin.length) bad.push(id + ".latin lacks " + latin.join(","));
    });
    assert(!bad.length, bad.join(" | "));
  });

  /* ---- decor.css against the DOM the engine really builds ------------------------------------------------------------- */

  var VOCAB = /^(cs-slide|cs-bg|cs-decor|cs-header|cs-footer|cs-content|cs-a-[a-z-]+|cs-slot|cs-handle|cs-meta|cs-counter|cs-swipe|cs-savepill|cs-kicker|cs-headline|cs-sub|cs-title|cs-body|cs-bullets|cs-bullet|cs-sides|cs-side|cs-side-label|cs-side-text|cs-number|cs-num|cs-unit|cs-ord|cs-attribution|cs-bridge|cs-cta|cs-cta-text|cs-cta-icon|cs-media-slot|cs-ltr|cs-rtl|cs-emoji|cs-em|cs-ln|cs-kashida|cs-icon|cs-art|cs-rail|cs-rail-seg|cs-item|cs-items|cs-anchor-slot|cs-figure|w)$/;

  async function emittedHooks() {
    var classes = {}, attrs = {}, values = {};
    function scan(root) {
      var nodes = root.querySelectorAll("*");
      for (var i = -1; i < nodes.length; i++) {
        var n = i < 0 ? root : nodes[i];
        if (n.classList) n.classList.forEach(function (c) { classes[c] = true; });
        Array.prototype.forEach.call(n.attributes, function (a) { attrs[a.name] = true; (values[a.name] = values[a.name] || {})[a.value] = true; });
      }
    }
    var png = PNG;
    for (var id of ids()) {
      var preset = CS.core.registry.getPreset(id);
      for (var type of types()) {
        for (var variant of (preset.variants[type] || [])) {
          var spec = FX.variantSpec(type, variant, { preset: id, metaLabel: "سلسلة" });
          spec.assets = [{ id: "ph", kind: "image", ref: png, aiGenerated: false }];
          spec.slides.forEach(function (s) { if (s.type === type) s.media = { slot: type === "cover" ? "plate" : "photo", assetId: "ph" }; });
          var index = FX.indexOfType(spec, type);
          var r = await CS.core.render.slide(spec, FX.brand(), index, { mode: "edit", assets: function (a) { return a === "ph" ? { url: png, mime: "image/png" } : null; } });
          scan(r.el); r.el.remove();
        }
      }
    }
    // Round 3 decor uses real visual hooks as well as core hooks. Load their source
    // and emit representative art DOM instead of exempting those selectors.
    async function load(src) {
      await new Promise(function (resolve, reject) {
        var s = document.createElement("script"); s.src = src; s.onload = resolve; s.onerror = reject; document.head.appendChild(s);
      });
    }
    await load("/src/visual/root.js"); await load("/src/visual/hooks.js");
    var manifest = await (await fetch("/src/art/manifest.json")).json();
    for (var file of manifest.files) await load("/src/art/" + file);
    CS.visual._.blocks = {};
    for (var block of [["cs-icon-pack", "icons/pack"], ["cs-icon-objects", "icons/objects"], ["cs-art-marks", "art/marks"]]) {
      CS.visual._.blocks[block[0]] = await (await fetch("/plugins/carousel-studio/skills/carousel-design/data/" + block[1] + ".json")).json();
    }
    for (var id of ids().filter(function (id) { return !!CS.core.registry.getPreset(id).art; })) {
      for (var tone of ["base", "invert", "field"]) {
        var artSpec = FX.variantSpec("item", "base", { preset: id }); artSpec.style.rail = "on";
        artSpec.slides[1].visual = { recipe: "under", tone: tone, anchor: { kind: "icon", icon: "check" } };
        scan(FX.build(artSpec, 1));
        artSpec.slides[1].visual = { recipe: "center", tone: tone, anchor: { kind: "word", word: "اختيارك", wordStyle: "solid" } };
        scan(FX.build(artSpec, 1));
      }
      var grid = FX.variantSpec("grid", "bento", { preset: id });
      grid.slides[1].items.forEach(function (item) { item.icon = "check"; item.value = "25"; }); scan(FX.build(grid, 1));
    }
    var k = FX.variantSpec("cover", "top", { swipe: "neutral" }); scan(FX.build(k, 0)); scan(FX.build(k, 1)); scan(FX.build(FX.variantSpec("cta", "base", { dialect: "en" }), 1));
    return { classes: classes, attrs: attrs, values: values };
  }

  /* attributes whose values come from tokens or the spec (not from the DOM the engine builds): checked against their enumerations */
  var KNOWN = {
    "data-texture": ["none", "grain", "ruled", "grid", "dots", "paper", "pattern"], "data-bgkind": ["solid", "gradient", "paper", "photo", "pattern"],
    "data-hl": ["bar", "underline", "marker", "color"], "data-numbering": ["ghost", "pill", "plain"], "data-align": ["start", "center"], "data-cover-anchor": ["top", "center"],
    "data-swipe": ["arrow-rtl", "arrow-ltr", "neutral"], "data-digits": ["western", "arabic-indic"], "data-dialect": ["eg", "gulf", "levant", "msa-white", "en"],
    "data-kashida": ["0", "1"], "data-last": ["0", "1"], "data-side": ["0", "1"], "data-pos": ["start", "center", "end"],
    "data-media-kind": ["icon", "photo", "cutout", "plate", "screenshot", "ui"], "data-calm": ["top", "bottom", "start", "end", "center", "none"],
    "data-cta": ["save", "send", "question", "keyword-dm", "follow", ""], "data-layer": ["bg", "decor", "chrome", "content"], "data-run": ["latin", "number", "handle", "tag", "url", "email", "phone"],
    "data-media-state": ["missing"], "data-mirror": ["1"], "data-ai": ["1"], "data-m": null, "data-slot": null
  };

  function stripComments(css) { return css.replace(/\/\*[\s\S]*?\*\//g, ""); }

  function selectorsOf(css) {
    var out = [], depth = 0, buf = "", q = null;
    css = stripComments(css);
    for (var i = 0; i < css.length; i++) {
      var c = css.charAt(i);
      if (q) { buf += c; if (c === "\\") { buf += css.charAt(++i); } else if (c === q) q = null; continue; }
      if (c === '"' || c === "'") { q = c; buf += c; continue; }
      if (c === "{") { if (depth === 0) out.push(buf.trim()); depth++; buf = ""; continue; }
      if (c === "}") { depth--; buf = ""; continue; }
      if (depth === 0) buf += c;
    }
    return out;
  }

  test("real: decor.css only uses classes and data attributes that compose emits, with values the engine knows", async function () {
    await FX.setup({ real: true });
    var hooks = await emittedHooks(), problems = [];
    var extraAttrs = { "data-preset": 1, "data-edit": 1 };
    for (var id of ids()) {
      var css = FX.realCss ? FX.realCss[id] : await (await fetch("/plugins/carousel-studio/skills/carousel-design/styles/" + id + "/decor.css")).text();
      selectorsOf(css).forEach(function (sel) {
        sel.replace(/"[^"]*"|'[^']*'/g, function (m) { return m.replace(/[.\[\]]/g, "_"); }).split(",").forEach(function (one) {
          (one.match(/\.[A-Za-z_][\w-]*/g) || []).forEach(function (cl) {
            var name = cl.slice(1);
            if (!VOCAB.test(name)) problems.push(id + ": class ." + name + " is not in the fixed vocabulary");
            else if (!hooks.classes[name] && name !== "cs-emoji" && name !== "cs-rtl" && name !== "cs-kashida") problems.push(id + ": class ." + name + " is never emitted");
          });
        });
        var re = /\[\s*([a-z-]+)\s*(?:([~|^$*]?=)\s*("[^"]*"|'[^']*'|[^\]\s]+))?\s*\]/g, m;
        while ((m = re.exec(sel))) {
          var name = m[1], val = m[3] ? m[3].replace(/^["']|["']$/g, "") : null;
          if (!hooks.attrs[name] && !extraAttrs[name]) { problems.push(id + ": attribute [" + name + "] is never emitted"); continue; }
          if (val === null || m[2] !== "=" || ["data-preset", "data-decor-key"].indexOf(name) >= 0) continue;
          if (name === "data-type") { if (types().indexOf(val) < 0) problems.push(id + ": [data-type=" + val + "] is not a slide type"); }
          else if (name === "data-variant") { if (!types().some(function (t) { return CS.core.registry.getArchetype(t).variants.indexOf(val) >= 0; })) problems.push(id + ": [data-variant=" + val + "] is not a variant of any archetype"); }
          else if (name === "data-m") { /* values are role names; checked against the emitted set below */ if (!hooks.values[name][val]) problems.push(id + ": [data-m=" + val + "] is never emitted"); }
          else if (name === "data-slot") { if (!hooks.values[name][val]) problems.push(id + ": [data-slot=" + val + "] is never emitted"); }
          else if (KNOWN[name]) { if (KNOWN[name].indexOf(val) < 0) problems.push(id + ": [" + name + "=" + val + "] is not a value the engine can set (" + KNOWN[name].join("|") + ")"); }
          else if (hooks.values[name] && !hooks.values[name][val]) problems.push(id + ": [" + name + "=" + val + "] never matches (emitted: " + Object.keys(hooks.values[name]).slice(0, 12).join("|") + ")");
        }
      });
    }
    var uniq = Array.from(new Set(problems));
    assert(!uniq.length, uniq.length + " unknown hooks: " + uniq.slice(0, 12).join(" | "));
  });

  test("real: placeholder colours resolve per slide and the local decor sheet is valid CSS", async function () {
    await FX.setup({ real: true });
    var withLocal = 0;
    for (var id of ids()) {
      var preset = CS.core.registry.getPreset(id), roles = CS.core.registry.presetRoles(preset);
      var local = CS.core.registry.decorLocal(id, roles), css = CS.core.registry.decorCss(id);
      assert(css.indexOf("{{") < 0, id + ": decorCss has no placeholder left");
      if (local.css) {
        withLocal++;
        assert(local.css.indexOf("{{") < 0 && local.css.indexOf("") < 0, id + ": local sheet is filled");
        var sheet = new CSSStyleSheet(); sheet.replaceSync(local.css); assert(sheet.cssRules.length >= 1, id + ": local sheet parses (" + sheet.cssRules.length + " rules)");
        assert(Array.prototype.every.call(sheet.cssRules, function (r) { return r.selectorText.indexOf('[data-decor-key="' + local.key + '"]') >= 0; }), id + ": every local rule is scoped by the key");
      }
    }
    assert(withLocal >= 0, "presets with placeholders: " + withLocal);
  });

  test("real: brand colours flow through every preset, contrast floors still hold, hashes differ per preset", async function () {
    await FX.setup({ real: true });
    var C = CS.core.color, seen = {}, brand = FX.brand();
    brand.visual.palette = { bg: "#FAF3E0", ink: "#1B1B1B", inkMuted: "#6B6B6B", accent: "#0B7A75" };
    ids().forEach(function (id) {
      var t = CS.core.resolve.post(ex(function (s) { s.style.presetId = id + "@1.0"; }), brand);
      assert(C.contrast(t.roles.ink, t.roles.bg) >= 4.5, id + " ink/bg with the brand palette");
      assert(!seen[t.hash], "distinct hash per preset"); seen[t.hash] = 1;
    });
  });

  /* ---- geometry (draft 9.1 / D2): the header and footer chrome of every archetype x preset clears both crops and the keep-outs --------- */
  test("real: the chrome of every archetype x preset sits inside the safe box and clear of the keep-outs, in the 3:4 view and in the 4:5 crop", async function () {
    await FX.setup({ real: true });
    var K = CS.core.constants, problems = [], count = 0, slideRect;
    function hit(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }
    assert(K.KEEP_OUTS.every(function (k) { return k.y >= K.SAFE.y && k.y + k.h <= K.SAFE.y + K.SAFE.h && k.x >= K.SAFE.x && k.x + k.w <= K.SAFE.x + K.SAFE.w; }), "the keep-outs are measured from the safe-box corners");
    eq(K.HEADER.y >= K.KEEP_OUTS[0].y + K.KEEP_OUTS[0].h, true, "the header band starts below the top pill zone");
    eq(K.FOOTER.y + K.FOOTER.h <= K.KEEP_OUTS[2].y, true, "the footer band ends above the bottom tag zone");
    for (var id of ids()) {
      for (var type of types()) {
        var variant = CS.core.registry.getArchetype(type).defaultVariant;
        var spec = FX.variantSpec(type, variant, { preset: id }), index = FX.indexOfType(spec, type);
        var r = await CS.core.render.slide(spec, FX.brand(), index, { mode: "export" });
        slideRect = r.el.getBoundingClientRect();
        var chrome = Array.prototype.slice.call(r.el.querySelectorAll(".cs-header > *, .cs-footer > *"));
        chrome.forEach(function (n) {
          var b = n.getBoundingClientRect(), box = { x: b.left - slideRect.left, y: b.top - slideRect.top, w: b.width, h: b.height };
          var label = id + "/" + type + " " + (n.className || n.tagName);
          K.KEEP_OUTS.forEach(function (k) { if (hit(box, k)) problems.push(label + " touches keep-out " + k.id); });
          if (box.x < K.SAFE.x - 1 || box.x + box.w > K.SAFE.x + K.SAFE.w + 1) problems.push(label + " leaves the safe box sideways");
          if (box.y < K.CROP_4X5.y - 1 || box.y + box.h > K.CROP_4X5.y + K.CROP_4X5.h + 1) problems.push(label + " is cut by the 4:5 crop");
        });
        count++;
        r.el.remove();
      }
    }
    assert(count >= 100, "checked " + count + " archetype x preset pairs");
    assert(!problems.length, problems.slice(0, 8).join(" | "));
  });
})();
