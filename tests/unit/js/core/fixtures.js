/* tests/unit/js/core/fixtures.js · everything the engine tests need to put a page together:
 * rule data and schemas from the repo, fixture presets, the archetype partials, fonts, a brand and sample specs. */
(function () {
  "use strict";
  var DESIGN = "/plugins/carousel-studio/skills/carousel-design";
  var FX = (window.FX = {});
  var ready = null;

  function get(url, type) {
    return fetch(url).then(function (r) { if (!r.ok) throw new Error(url + " -> " + r.status); return type === "text" ? r.text() : r.json(); });
  }
  function opt(url, type) { return get(url, type).catch(function () { return null; }); }

  /* ---- fonts: the real ones when B11 has delivered them, the prototype's two families otherwise --------------------- */

  var ARABIC = "U+0600-06FF,U+0750-077F,U+0870-088E,U+0890-0891,U+0897-08E1,U+08E3-08FF,U+200C-200E,U+2010-2011,U+204F,U+2E41,U+FB50-FDFF,U+FE70-FE74,U+FE76-FEFC";
  var LATIN = "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD";
  var RANGES = [[32, 126], [160, 255], [1536, 1791], [1872, 1919], [8192, 8303], [8364, 8364], [64336, 65023], [65136, 65279]];

  async function fontsMeta() {
    var real = await opt(DESIGN + "/fonts/registry.json");
    var cov = real && (await opt(DESIGN + "/fonts/coverage.json"));
    if (real && cov && real.families && real.families.some(function (f) { return f.id === "alexandria"; })) {
      var css = real.families.map(function (f) {
        return f.files.map(function (file) {
          var w = Array.isArray(file.wght) ? file.wght[0] + " " + file.wght[1] : String(file.wght);
          return '@font-face{font-family:"' + f.family + '";font-style:' + (file.style || "normal") + ";font-weight:" + w + ";font-display:block;src:url(\"" + DESIGN + "/fonts/" + encodeURI(file.file) + "\");}";
        }).join("");
      }).join("\n");
      return { registry: real, coverage: cov, css: css, source: "repo-fonts" };
    }
    var faces = [["Alexandria", "700 800", "Alexandria-arabic.woff2", ARABIC], ["Alexandria", "700 800", "Alexandria-latin.woff2", LATIN], ["Readex Pro", "400 600", "ReadexPro-arabic.woff2", ARABIC], ["Readex Pro", "400 600", "ReadexPro-latin.woff2", LATIN]];
    var css2 = faces.map(function (f) { return '@font-face{font-family:"' + f[0] + '";font-style:normal;font-weight:' + f[1] + ";font-display:block;src:url(/__proto_fonts__/" + f[2] + ') format("woff2");unicode-range:' + f[3] + ";}"; }).join("\n");
    return {
      registry: { schemaVersion: 1, families: [
        { id: "alexandria", family: "Alexandria", scripts: ["arabic", "latin"], files: [{ file: "Alexandria-arabic.woff2", style: "normal", wght: [700, 800], variable: true }] },
        { id: "readex-pro", family: "Readex Pro", scripts: ["arabic", "latin"], files: [{ file: "ReadexPro-arabic.woff2", style: "normal", wght: [400, 600], variable: true }] }
      ] },
      coverage: { schemaVersion: 1, families: { alexandria: { ranges: RANGES }, "readex-pro": { ranges: RANGES } } },
      css: css2, source: "prototype-fonts"
    };
  }

  /* ---- setup ------------------------------------------------------------------------------------------------------ */

  /** FX.real = true (query ?presets=real) registers the presets of styles/index.json instead of the fixture presets. */
  FX.real = false;

  FX.setup = function (o) {
    if (ready) return ready;
    o = o || {};
    if (o.real !== undefined) FX.real = !!o.real;
    ready = (async function () {
      var CS = window.CS, core = CS.core;
      var [platform, locale, qaRules, copy, ortho, brand, example, swiss, heritage, swissCss, heritageCss, arche, fm] = await Promise.all([
        get(DESIGN + "/data/platform-instagram.json"), get(DESIGN + "/data/locale-defaults.json"), opt(DESIGN + "/data/qa-rules.json"),
        opt(DESIGN + "/data/rules/copy.json"), opt(DESIGN + "/data/rules/ortho.json"),
        get("/docs/examples/brand.example.json"), get("/docs/examples/spec.example.json"),
        get("/tests/unit/js/core/fixtures/swiss.preset.json"), get("/tests/unit/js/core/fixtures/heritage.preset.json"),
        get("/tests/unit/js/core/fixtures/swiss.decor.css", "text"), get("/tests/unit/js/core/fixtures/heritage.decor.css", "text"),
        get(DESIGN + "/templates/archetypes.html", "text"), fontsMeta()
      ]);
      var dialects = {};
      for (var d of ["eg", "gulf", "levant", "msa-white", "en"]) dialects[d] = await opt(DESIGN + "/data/dialects/" + d + ".json");
      for (var kind of ["brand", "spec", "preset", "occasion", "hook", "plan", "qa-report"]) {
        if (kind === "preset" && o.gallery && !FX.real) continue;     // the gallery preset lists every variant, more than a shipped preset may
        var sc = await opt(DESIGN + "/schemas/" + kind + ".schema.json");
        if (sc) core.schema.register(kind, sc);
      }
      document.getElementById("cs-test-fonts").textContent = fm.css;
      var reg = core.registry;
      reg.registerRules({ qaRules: qaRules, copy: copy, ortho: ortho, dialects: dialects, platform: platform, locale: locale });
      reg.registerFonts({ registry: fm.registry, coverage: fm.coverage });
      reg.registerArchetypes(new DOMParser().parseFromString(arche, "text/html"));
      if (FX.real) {
        var index = await get(DESIGN + "/styles/index.json");
        for (var entry of index.presets) {
          var pj = await get(DESIGN + "/styles/" + entry.dir + "/preset.json"), css = await get(DESIGN + "/styles/" + entry.dir + "/decor.css", "text");
          reg.registerPreset(pj, css);
        }
        FX.realIndex = index;
      } else {
        if (o.gallery) core.constants.SLIDE_TYPES.forEach(function (t) { swiss.variants[t] = reg.getArchetype(t).variants.slice(); });
        reg.registerPreset(swiss, swissCss);
        reg.registerPreset(heritage, heritageCss);
      }
      await core.ready.fonts(["alexandria", "readex-pro"], 15000);
      FX.data = { brand: brand, example: example, fontSource: fm.source, platform: platform, locale: locale };
    })();
    return ready;
  };

  /** The example brand; its font choices are dropped so that the engine tests do not depend on which fonts are installed. */
  FX.brand = function (patch) {
    var b = JSON.parse(JSON.stringify(FX.data.brand));
    delete b.visual.fonts;
    return Object.assign(b, patch || {});
  };
  FX.example = function () { return JSON.parse(JSON.stringify(FX.data.example)); };

  /* ---- content ---------------------------------------------------------------------------------------------------- */

  var SINK = {
    "cover": { kicker: "للمبتدئين", headline: "6 أدوات ببلاش…\nبتغنيك عن ==المصمم==", kashidaWord: "المصمم", sub: "جرّبتها كلها بنفسي" },
    "rehook": { headline: "الأداة الأولى بتختصر ساعة كاملة", sub: "من غير ما تفتح أي برنامج تصميم.", bridge: "والتانية أحلى" },
    "item": { title: "أداة التصميم", body: "تكتب الفكرة بالعربي، وتطلعلك السلايدات جاهزة بخطوطها وألوان براندك.", bridge: "الأداة اللي بعدها" },
    "step": { title: "افتح Claude وابعت الفكرة", body: "اكتب الموضوع في سطر واحد، وسيب الباقي على الأداة.", bridge: "الخطوة اللي بعدها" },
    "stat": { number: { value: "413", unit: "%" }, title: "زيادة في عدد الحفظ", body: "خلال 30 يوم بعد ما غيّرنا شكل الغلاف.", bridge: "إزاي؟", sourceIds: ["src1"] },
    "compare": { title: "مصمم ولا أداة؟", sides: [{ label: "مصمم", text: "3 أيام وتكلفة عالية" }, { label: "أداة", text: "ساعة واحدة وبلاش" }], bridge: "الفرق واضح" },
    "myth-fact": { title: "خرافة شايعة", sides: [{ text: "لازم مصمم عشان الشكل يطلع محترف" }, { text: "المحرك بيظبط الخطوط والألوان بدالك" }], bridge: "كمّل" },
    "quote": { body: "اللي بيبدأ بسيط بيوصل أسرع من اللي بيستنى الكمال", attribution: "صاحب مشروع صغير" },
    "story-beat": { ord: 2, title: "اللحظة اللي اتغير فيها كل حاجة", body: "قعدت ساعتين على سلايد واحد. وبعدين جربت أداة واحدة وخلصت الكاروسيل كله في عشر دقايق.", bridge: "وبعدها؟" },
    "checklist": { title: "قبل ما تنزّل البوست", bullets: ["الغلاف فيه وعد واضح", "السلايد التانية بتدفع الوعد", "الأرقام معاها مصدر", "في خطوة واحدة في الآخر", "الكابشن فيه كلمة مفتاحية"], bridge: "احفظها" },
    "summary": { title: "الخلاصة", bullets: ["أداة التصميم", "أداة الكتابة", "أداة المراجعة", "أداة النشر"] },
    "setup": { title: "هتحتاج إيه؟", bullets: ["حساب Claude", "موبايل أو لابتوب", "10 دقايق فاضية"], bridge: "جاهز؟" },
    "proof": { media: { slot: "screenshot" }, number: { value: "5", unit: "ساعات" }, title: "النتيجة بعد أسبوع", body: "وفّرت وقت التصميم من يوم كامل لساعة.", bridge: "شوف الفرق" },
    "share": { headline: "ابعتها لصاحبك اللي لسه بيدفع لمصمم", sub: "هيشكرك بعدين." },
    "cta": { title: "احفظ البوست", body: "وابعته لصاحبك.", cta: { kind: "save", text: "احفظه لما تيجي تعمل البوست الجاي" } },
    "offer": { title: "كورس الكاروسيل", number: { value: "199", unit: "$" }, bullets: ["8 دروس", "قوالب جاهزة", "دعم مباشر"], cta: { kind: "keyword-dm", text: "اكتب «كاروسيل» في الخاص" } },
    "testimonial": { body: "غيّر طريقتي في الشغل تمامًا.", attribution: "سارة، مصممة", number: { value: "3", unit: "أضعاف" } },
    "poster": { kicker: "دليل سريع", headline: "أدوات الذكاء الاصطناعي للشغل", sub: "اختصرت علينا أسبوع.", bullets: ["كتابة", "تصميم"], cta: { kind: "follow", text: "تابعنا" } },  /* a poster with every optional slot and three bullets is past the 888 px body at floor sizes; the gate reports it and the Slide tab offers «shorter» */
    "grid": { title: "أدوات الكاروسيل", items: [{ title: "الكتابة", text: "فكرة واحدة", hi: true }, { title: "التصميم", text: "ألوان البراند" }, { title: "المراجعة", text: "عين تانية" }], bridge: "شوف التالي" },
    "timeline": { title: "رحلة البوست", items: [{ title: "الفكرة", text: "جملة واحدة", value: "يوم 1" }, { title: "الكتابة", text: "عشر دقايق", value: "يوم 2", hi: true }, { title: "النشر", text: "وقت الذروة", value: "يوم 3" }], bridge: "ونبدأ" }
  };
  FX.SINK = SINK;

  FX.slideFor = function (type, patch) { return Object.assign({ type: type }, JSON.parse(JSON.stringify(SINK[type])), patch || {}); };

  /** A spec around the given slide objects (ids and positions are assigned). */
  FX.makeSpec = function (slideList, o) {
    o = o || {};
    var spec = FX.example();
    spec.format = slideList.length === 1 && slideList[0].type === "poster" ? "single" : "carousel";
    spec.slides = slideList.map(function (s, i) { return Object.assign({}, s, { id: "s" + (i + 1 < 10 ? "0" : "") + (i + 1), n: i + 1 }); });
    spec.captionPack = undefined; delete spec.captionPack;
    spec.style = { presetId: (o.preset || "swiss") + "@1.0" };
    if (o.overrides) spec.style.overrides = o.overrides;
    if (o.metaLabel) spec.style.metaLabel = o.metaLabel;
    if (o.dialect) spec.locale.dialect = o.dialect;
    if (o.digits) spec.locale.digits = o.digits;
    if (o.swipe) spec.locale.swipeCue = o.swipe;
    if (o.canvasH) { spec.canvas.h = o.canvasH; spec.canvas.preset = o.canvasH === 1350 ? "ig-4x5" : "ig-3x4"; }
    spec.sources = [{ id: "src1", kind: "user", ref: "user-attested", excerpt: "x", verified: true }];
    return spec;
  };

  /** cover - slide under test - cta: chrome and counter behave as in a real carousel. */
  FX.variantSpec = function (type, variant, o) {
    var target = FX.slideFor(type, variant ? { variant: variant } : {});
    var list = type === "cover" || type === "poster" ? [target, FX.slideFor("item"), FX.slideFor("cta")] : [FX.slideFor("cover"), target, FX.slideFor("cta")];
    if (type === "poster") list = [target];
    return FX.makeSpec(list, o);
  };

  /** compose.slide for slide `i` of a spec: detached, unfitted (structure tests). */
  FX.build = function (spec, i, o) {
    o = o || {};
    var brand = o.brand === undefined ? FX.brand() : o.brand, post = CS.core.resolve.post(spec, brand), tokens = CS.core.resolve.slide(post, spec.slides[i]);
    return CS.core.compose.slide(spec, spec.slides[i], tokens, brand, o);
  };

  /** render.slide with the shared stage; returns the SlideRender. */
  FX.render = function (spec, i, o) { return CS.core.render.slide(spec, FX.brand(), i, o || { mode: "export" }); };

  FX.indexOfType = function (spec, type) { return spec.slides.findIndex(function (s) { return s.type === type; }); };

  FX.nextFrame = function () { return new Promise(function (r) { requestAnimationFrame(function () { requestAnimationFrame(r); }); }); };

  /** Words per line, as the engine sees them, of a rendered slot. */
  FX.linesOf = function (slotEl) { return CS.core.fit.measureLines(slotEl).text; };

  /** Every fit slot of a rendered slide with its font size in px. */
  FX.sizes = function (r) {
    var out = {};
    CS.core.compose.slots(r.el).forEach(function (s) { out[s.key] = parseFloat(s.el.style.fontSize) || parseFloat(getComputedStyle(s.el).fontSize); });
    return out;
  };

  /* ---- gallery (visual check: every archetype x variant) --------------------------------------------------------------- */

  FX.gallery = async function (container, q) {
    var core = CS.core, types = (q.get("types") || core.constants.SLIDE_TYPES.join(",")).split(","), brand = FX.brand();
    var o = { preset: q.get("preset") || "swiss", dialect: q.get("dialect") || undefined, swipe: q.get("swipe") || undefined, digits: q.get("digits") || undefined, canvasH: q.get("h") ? +q.get("h") : undefined };
    var big = q.get("big") === "1";
    for (var t = 0; t < types.length; t++) {
      var arche = core.registry.getArchetype(types[t]);
      var preset = core.registry.getPreset(o.preset);
      var variants = (preset.variants[types[t]] || arche.variants).filter(function (v) { return arche.variants.indexOf(v) >= 0; });
      for (var v = 0; v < variants.length; v++) {
        var spec = FX.variantSpec(types[t], variants[v], o);
        var index = FX.indexOfType(spec, types[t]);
        var r = await core.render.slide(spec, brand, index, { mode: "thumb" });
        var cell = document.createElement("div"), frame = document.createElement("div"), label = document.createElement("small");
        cell.className = "cell"; frame.className = "frame"; if (big) { frame.setAttribute("data-big", ""); cell.style.width = "540px"; }
        var bad = Object.keys(r.fit.slots).filter(function (k) { return r.fit.slots[k].status === "overflow"; });
        if (bad.length) frame.classList.add("bad");
        label.textContent = types[t] + " / " + variants[v] + (bad.length ? "  OVERFLOW " + bad.join(",") : "") + "  " + Object.keys(r.fit.slots).map(function (k) { return k.split(".").slice(1).join(".") + ":" + r.fit.slots[k].fontPx; }).join(" ");
        frame.appendChild(r.el); cell.appendChild(label); cell.appendChild(frame); container.appendChild(cell);
      }
    }
  };
})();
