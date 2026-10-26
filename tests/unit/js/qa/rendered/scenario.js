/* Browser scenario for the rendered-scope gates of cs-qa. It is inlined into a
 * temporary page by rendered.test.cjs together with the stubbed CS.core
 * libraries, the rule bundle (window.__BUNDLE) and the cs-qa chunk, then run in
 * headless Chrome. Results go to window.__out as { name: [rule ids] }. */
(async function () {
  "use strict";
  var QA = window.CS.qa;
  var out = {};
  var stage = document.getElementById("stage");

  /* ---- a font family that really resolves here, so fallback tests are honest */
  function resolves(f) {
    var g = document.createElement("canvas").getContext("2d");
    var s = "مرحبا بكم ChatGPT 123";
    g.font = '40px "' + f + '", sans-serif';
    var a = g.measureText(s).width;
    g.font = '40px "' + f + '", serif';
    return Math.abs(a - g.measureText(s).width) < 0.5;
  }
  var FAMILY = ["Tahoma", "Segoe UI", "Arial", "DejaVu Sans", "Noto Sans Arabic", "Noto Sans"].filter(resolves)[0] || "";
  out.__family = FAMILY;

  var WORDS = ["الأداة", "الأولى", "توفر", "لك", "وقتًا", "وجهدًا", "كبيرًا", "كل", "أسبوع"];
  function words(n, from) {
    var arr = [];
    for (var i = 0; i < n; i++) arr.push(WORDS[(i + (from || 0)) % WORDS.length]);
    return arr;
  }
  var w = function (list) {
    return list.map(function (t, i) { return '<span class="w" data-w="' + i + '">' + t + "</span>"; }).join(" ");
  };

  function tokens(over) {
    return Object.assign(
      {
        roles: { bg: "#F4F4F2", surface: "#FFFFFF", ink: "#111111", inkMuted: "#5A5A5A", accent: "#E3262B", accent2: "#E3262B" },
        derived: { onAccent: "#FFFFFF", line: "#D6D6D4" },
        floors: { hero: 96, body: 42, meta: 30, contrastBody: 4.5, contrastLarge: 3 },
        layout: { align: "start", coverAnchor: "top", headlineWidth: [0, 1] },
        decor: { kashida: { allowed: false } },
        type: { display: { family: "alexandria" }, heading: { family: "alexandria" }, body: { family: "readex-pro" } },
        fonts: [],
        provenance: { "roles.accent": "brand" },
        variants: {}
      },
      over || {}
    );
  }

  /* One slide in the vocabulary of CONTRACT 5.1. `o` tweaks it for a scenario. */
  function makeSlide(id, type, o) {
    o = o || {};
    var fam = o.family || FAMILY || "sans-serif";
    var el = document.createElement("section");
    el.className = "cs-slide";
    el.setAttribute("dir", "rtl");
    el.setAttribute("lang", "ar");
    el.setAttribute("data-cs-slide", id);
    el.setAttribute("data-type", type);
    if (o.variant) el.setAttribute("data-variant", o.variant);
    el.style.cssText =
      "position:relative;width:" + (o.width || 1080) + "px;height:1440px;background:" + (o.rootBg || "#F4F4F2") + ";color:#111;overflow:hidden;direction:rtl;font-family:'" + fam + "',sans-serif;font-synthesis:none;margin-bottom:20px";
    var hero = o.heroPx || 150;
    var body = o.bodyPx || 44;
    var meta = o.metaPx || 30;
    var counter = o.counter || "1 من 8";
    el.innerHTML =
      '<div class="cs-bg" data-layer="bg" aria-hidden="true" style="position:absolute;left:0;top:0;right:0;bottom:0;' + (o.bgStyle || "background:#F4F4F2") + '"></div>' +
      '<header class="cs-header" style="position:absolute;top:165px;left:114px;width:852px;height:80px;display:flex;justify-content:space-between;align-items:flex-start">' +
      '<span class="cs-handle" data-slot="handle" style="font-size:' + meta + "px;line-height:40px;" + (o.handleStyle || "") + '"><bdi dir="ltr" class="cs-ltr" data-run="handle">@brand</bdi></span>' +
      '<span class="cs-meta" data-slot="meta" style="font-size:' + meta + 'px;line-height:40px">سلسلة</span></header>' +
      '<main class="cs-content" data-layer="content" style="position:absolute;top:261px;left:114px;width:852px;height:888px">' +
      (type === "cover"
        ? '<h1 class="cs-slot cs-headline" data-slot="headline" data-kind="text" data-role="hero" style="margin:0;font-size:' + hero + "px;line-height:1.3;font-weight:700;" + (o.headStyle || "") + '">' + (o.headHtml || w(["أدوات", "ببلاش"])) + "</h1>"
        : "") +
      '<p class="cs-slot cs-body" data-slot="body" data-kind="text" data-role="body" style="margin:0;font-size:' + body + "px;line-height:1.6;" + (o.bodyStyle || "") + '">' + (o.bodyHtml || w(words(4))) + "</p>" +
      (o.extra || "") +
      "</main>" +
      '<footer class="cs-footer" data-layer="chrome" style="position:absolute;top:1165px;left:114px;width:852px;height:80px;display:flex;justify-content:space-between;align-items:flex-start">' +
      '<span class="cs-savepill" data-slot="savepill" style="font-size:' + meta + 'px;line-height:44px;height:44px">احفظ</span>' +
      '<span class="cs-counter" data-slot="counter" style="font-size:' + meta + 'px;line-height:44px;height:44px">' + counter + "</span>" +
      '<span class="cs-swipe" data-slot="swipe" style="font-size:' + meta + 'px;line-height:44px;height:44px">اسحب ←</span></footer>';
    var inner = window.__BUNDLE.platform.geometry.inner;
    if (o.art && type !== "cover" && type !== "poster" && inner) {
      var band = inner.bands.footer, footer = el.querySelector(".cs-footer");
      footer.style.top = band.y + "px"; footer.style.left = band.x + "px"; footer.style.width = band.w + "px";
    }
    return el;
  }

  function spec(slides) {
    return {
      id: "post-render-test",
      rev: 1,
      locale: { dialect: "eg", digits: "western" },
      canvas: { preset: "ig-3x4", w: 1080, h: 1440 },
      format: "carousel",
      mode: "guided",
      checkpoint: "design",
      style: { presetId: "swiss@1.0" },
      slides: slides.map(function (s) {
        var sl = { id: s.getAttribute("data-cs-slide"), n: 1, type: s.getAttribute("data-type") };
        if (s.getAttribute("data-variant")) sl.variant = s.getAttribute("data-variant");
        return sl;
      })
    };
  }

  async function runCase(name, slides, tok, extraSpec, opts) {
    stage.innerHTML = "";
    slides.forEach(function (s) { stage.appendChild(s); });
    var t = tok || tokens();
    var sp = Object.assign(spec(slides), extraSpec || {});
    var deck = {
      tokens: t,
      slides: slides.map(function (el, i) { return { id: el.getAttribute("data-cs-slide"), index: i, el: el, tokens: t, fit: { slots: {} } }; })
    };
    var res = await QA.runRendered({ spec: sp, tokens: t, deck: deck }, opts || {});
    out[name] = res.map(function (r) { return r.rule + (r.el ? "@" + r.el : ""); });
    out[name + ":sev"] = res.map(function (r) { return r.rule + "=" + r.sev; });
    return res;
  }

  var base = function () {
    var filled = [w(words(1, 0)), w(words(1, 1)), w(words(1, 2))].join("<br>");
    return [makeSlide("s01", "cover", { variant: "top", headHtml: filled }), makeSlide("s02", "item", { counter: "2 من 8", variant: "side-number" }), makeSlide("s03", "cta", { counter: "3 من 8" })];
  };

  /* 1 ---------------------------------------------------------- clean deck */
  await runCase("clean", base());

  /* 2 ---------------------------------------------------------- layout */
  var huge = makeSlide("s01", "item", { bodyHtml: w(words(400)) });
  await runCase("overflow", [huge]);

  var corner = makeSlide("s01", "item", { extra: '<span data-slot="note" style="position:absolute;left:-60px;top:-180px;font-size:40px;line-height:50px">زاوية</span>' });
  await runCase("keepout", [corner]);

  var a = makeSlide("s01", "cover");
  var b = makeSlide("s02", "item", { counter: "2 من 8", handleStyle: "position:relative;top:9px" });
  await runCase("drift", [a, b]);

  var steady = [makeSlide("s01", "cover"), makeSlide("s02", "item", { counter: "10 من 12" }), makeSlide("s03", "item", { counter: "11 من 12" })];
  await runCase("drift-ok", steady);

  var fixedBox = makeSlide("s01", "item", { bodyStyle: "height:90px", bodyHtml: w(words(60)) });
  await runCase("slot-overflow", [fixedBox]);

  var tightLine = makeSlide("s01", "item", { handleStyle: "line-height:1", bodyStyle: "line-height:1" });
  await runCase("tight-line-height", [tightLine]);

  var outsideBand = makeSlide("s01", "item", { handleStyle: "position:relative;top:-60px" });
  await runCase("band", [outsideBand]);

  var chromeOutside = makeSlide("s01", "item", { handleStyle: "position:relative;top:-150px" });
  await runCase("chrome-outside", [chromeOutside], null, null, { gates: ["D2"] });
  await runCase("chrome-outside-repeat", [chromeOutside], null, null, { gates: ["D2"] });
  out["chrome-outside-deterministic"] = JSON.stringify(out["chrome-outside"]) === JSON.stringify(out["chrome-outside-repeat"]);

  for (var footerCase of ["footer-off", "footer-art", "footer-art-misplaced"]) {
    var isArt = footerCase !== "footer-off";
    var footerDeck = [makeSlide("s01", "cover"), makeSlide("s02", "item", { art: footerCase === "footer-art" })];
    var footerTokens = tokens(isArt ? { art: {} } : {});
    await runCase(footerCase, footerDeck, footerTokens, null, { gates: ["D2"] });
    await runCase(footerCase + "-repeat", footerDeck, footerTokens, null, { gates: ["D2"] });
    out[footerCase + "-deterministic"] = JSON.stringify(out[footerCase]) === JSON.stringify(out[footerCase + "-repeat"]);
  }

  function addRail(el, top, hidden) {
    var counterEl = el.querySelector('[data-slot="counter"]');
    counterEl.style.position = "relative";
    counterEl.insertAdjacentHTML("beforeend", '<span class="cs-rail" aria-hidden="true" style="position:absolute;left:0;top:' + top +
      'px;width:180px;height:4px;background:#111;' + (hidden ? 'display:none;' : '') + '"></span>');
    return el;
  }
  var railClean = [addRail(makeSlide("s01", "cover"), 40), addRail(makeSlide("s02", "item"), 40)];
  await runCase("rail-clean", railClean);
    await runCase("rail-repeat", railClean);
  out["rail-deterministic"] = JSON.stringify(out["rail-clean"]) === JSON.stringify(out["rail-repeat"]);
  await runCase("rail-band", [addRail(makeSlide("s01", "cover"), 100)]);
  await runCase("rail-drift", [addRail(makeSlide("s01", "cover"), 40), addRail(makeSlide("s02", "item"), 49)]);
  await runCase("rail-hidden", [addRail(makeSlide("s01", "cover"), 100, true)]);

  /* 3 ---------------------------------------------------------- sizes */
  await runCase("sizes", [makeSlide("s01", "cover", { heroPx: 80, bodyPx: 38, metaPx: 24 })]);
  await runCase("render-size", [makeSlide("s01", "item", { width: 1000 })]);

  /* 4 ---------------------------------------------------------- contrast */
  var faint = makeSlide("s01", "cover", { headStyle: "color:#777777", bodyStyle: "color:#8A8A8A" });
  await runCase("contrast", [faint]);
  await runCase("contrast-srgb", [makeSlide("s01", "item", { bodyStyle: "color:color(srgb 0.96 0.96 0.96)" })]);
  await runCase("contrast-mix", [makeSlide("s01", "item", { bodyStyle: "color:color-mix(in srgb, #ffffff 96%, #000000)" })]);
  await runCase("art-key", [makeSlide("s01", "item", { extra:
    '<div data-slot="anchor"><span data-slot-key="s01.art.2" data-role="body" style="font-size:44px;color:#F0F0EE"><span class="w">كلمة</span></span></div>' })]);
  var invisible = makeSlide("s01", "cover", { headStyle: "color:#E9E9E7", bodyStyle: "color:#F0F0EE" });
  await runCase("contrast-hard", [invisible]);
  var gradient = makeSlide("s01", "item", { rootBg: "transparent", bgStyle: "background:linear-gradient(90deg,#1c1c1c,#F4F4F2)" });
  await runCase("contrast-gradient", [gradient]);
  var mixedGradient = makeSlide("s01", "item", { rootBg: "transparent", bgStyle:
    "background:linear-gradient(90deg,color-mix(in srgb, #000 90%, #fff),#F4F4F2)" });
  await runCase("contrast-gradient-mix", [mixedGradient]);
  await runCase("contrast-gradient-mix-repeat", [mixedGradient]);
  out["contrast-gradient-mix-deterministic"] = JSON.stringify(out["contrast-gradient-mix"]) === JSON.stringify(out["contrast-gradient-mix-repeat"]);
  var photo = makeSlide("s01", "item", { rootBg: "transparent", bgStyle: "background-image:url(data:image/gif;base64,R0lGODlhAQABAAAAACw=)" });
  await runCase("contrast-photo", [photo]);
  var onPill = makeSlide("s01", "item", { bodyStyle: "color:#FFFFFF;background:#E3262B;display:inline-block;padding:0 12px" });
  await runCase("contrast-pill", [onPill]);

  var sample = makeSlide("s01", "cover");
  window.CS.paint = {
    textMask: async function () {
      var c = document.createElement("canvas");
      c.width = 540;
      c.height = 720;
      var g = c.getContext("2d");
      g.fillStyle = "#222222";
      g.fillRect(0, 0, 540, 720);
      return c;
    }
  };
  await runCase("contrast-pixel", [sample]);
  var measure = await QA.contrast.measure(sample, tokens());
  out["measure"] = [measure.byElement.length > 0, measure.worstDecile < 1.5, measure.ratioMin <= measure.worstDecile];
  delete window.CS.paint;

  /* 5 ---------------------------------------------------------- Arabic rules */
  var bad = makeSlide("s01", "item", {
    bodyHtml: w(["نص", "عادي"]) + ' <span class="w" style="letter-spacing:3px">متباعد</span> <span class="w" style="font-style:italic">مائل</span> <span class="w" style="opacity:.6">باهت</span>'
  });
  await runCase("arabic-basic", [bad]);

  var justified = makeSlide("s01", "item", { bodyStyle: "text-align:justify", bodyHtml: w(words(30)) });
  await runCase("arabic-justify", [justified]);

  var rgba = makeSlide("s01", "item", { bodyStyle: "color:rgba(17,17,17,.5)" });
  await runCase("arabic-rgba", [rgba]);

  var groupFade = makeSlide("s01", "item", { extra: '<div data-m-group="opacity" style="opacity:.5"><span class="w" data-slot="x">كلمة</span></div>' });
  await runCase("arabic-group-opacity", [groupFade]);

  var kashida = makeSlide("s01", "item", { bodyHtml: w(["المـــصمم", "والـــكاتب", "اـب"]) });
  await runCase("kashida", [kashida]);
  var okTokens = tokens({ decor: { kashida: { allowed: true } } });
  var kashidaCover = makeSlide("s01", "cover", { headHtml: w(["أدوات", "تغنيك", "عن", "المـــصمم"]) });
  await runCase("kashida-ok", [kashidaCover], okTokens);
  var latinJoin = makeSlide("s01", "item", { bodyHtml: w(["راجع", "صلاحيات", "الـAgent", "قبل", "ما", "تشغّله", "بـClaude", 'الـ<bdi dir="ltr">GPT</bdi>', 'الـ<bdi dir="ltr">Agent</bdi>.', "للـAI،", "كـCEO"]) });
  await runCase("kashida-latin-join", [latinJoin]);

  var tashkeel = makeSlide("s01", "item", { bodyHtml: w(["مُحَمَّدٌ", "رَسُولُ", "اللَّهِ"]) });
  await runCase("tashkeel", [tashkeel]);

  /* a family the engine resolved but nothing loaded for; and one that is loaded */
  var reg = window.CS.core.registry;
  reg.fontCss = function (id) { return id === "ghost" ? '"NoSuchFontXyz"' : id === "known" ? '"TestFace"' : '"x"'; };
  var ghost = makeSlide("s01", "item", { family: "NoSuchFontXyz" });
  await runCase("fallback", [ghost], tokens({ fonts: ["ghost"] }));
  var loadedOk = false;
  try {
    var face = new FontFace("TestFace", "local(" + (FAMILY || "Arial") + ")");
    await face.load();
    document.fonts.add(face);
    loadedOk = true;
  } catch (e) {
    loadedOk = false;
  }
  out.__faceLoaded = loadedOk;
  if (loadedOk) await runCase("fallback-loaded", [makeSlide("s01", "item", { family: "TestFace" })], tokens({ fonts: ["known"] }));
  await runCase("fallback-unknown", [makeSlide("s01", "item", { family: "SomeOtherFont" })], tokens({ fonts: ["known"] }));

  /* 6 ---------------------------------------------------------- composition */
  var lone = makeSlide("s01", "item", { bodyHtml: w(words(5)) + "<br>" + w(["نعم"]) });
  await runCase("lone-word", [lone]);

  var rows = [];
  for (var i = 0; i < 9; i++) rows.push(w(words(1, i)));
  var crowded = makeSlide("s01", "cover", { heroPx: 100, headHtml: rows.join("<br>") });
  await runCase("rows", [crowded]);

  var four = makeSlide("s01", "cover", { heroPx: 110, headHtml: [w(words(1, 0)), w(words(1, 1)), w(words(1, 2)), w(words(1, 3))].join("<br>") });
  var seven = makeSlide("s02", "item", { bodyHtml: [0, 1, 2, 3, 4, 5, 6].map(function (n) { return w(words(1, n)); }).join("<br>") });
  var fourCta = makeSlide("s03", "cta", { bodyHtml: [0, 1, 2, 3].map(function (n) { return w(words(1, n)); }).join("<br>") });
  await runCase("lines", [four, seven, fourCta]);
  var fits = [makeSlide("s01", "cover", { headHtml: [w(words(1, 0)), w(words(1, 1)), w(words(1, 2))].join("<br>"), heroPx: 110 }), makeSlide("s02", "item", { bodyHtml: [0, 1, 2, 3, 4, 5].map(function (n) { return w(words(1, n)); }).join("<br>") })];
  await runCase("lines-ok", fits);

  var narrow = makeSlide("s01", "cover", { headHtml: w(["أدوات"]) });
  await runCase("headline-width", [narrow], tokens({ layout: { headlineWidth: [0.65, 0.85] } }));

  var families = makeSlide("s01", "item", {
    bodyHtml: '<span class="w" style="font-family:Tahoma">أول</span> <span class="w" style="font-family:Arial">ثان</span> <span class="w" style="font-family:Georgia">ثالث</span>'
  });
  await runCase("families", [families]);

  var latin = makeSlide("s01", "item", {
    bodyHtml: w(["استخدم"]) + ' <bdi dir="ltr" class="cs-ltr" data-run="latin" style="font-weight:700;color:#E3262B"><span class="w">ChatGPT</span></bdi> ' + w(["اليوم"])
  });
  await runCase("latin-match", [latin]);

  /* 7 ---------------------------------------------------------- bidi */
  var wrapped = makeSlide("s01", "item", {
    bodyStyle: "width:220px",
    bodyHtml: w(["جرب"]) + ' <bdi dir="ltr" class="cs-ltr" data-run="latin"><span class="w">alpha</span> <span class="w">beta</span> <span class="w">gamma</span> <span class="w">delta</span> <span class="w">epsilon</span></bdi>'
  });
  await runCase("isolation", [wrapped]);

  var raw = makeSlide("s01", "item", { bodyHtml: w(["جرب"]) + " ChatGPT " + w(["اليوم"]) });
  await runCase("raw-ltr", [raw]);

  /* 8 ---------------------------------------------------------- thumbnail */
  var small = makeSlide("s01", "cover", { heroPx: 100 });
  await runCase("thumbnail", [small]);
  var thumb = await QA.thumbnail(small);
  out["thumbnail-api"] = [thumb.heroPx, thumb.pass, thumb.fix, thumb.localContrast > 10];
  var bigEl = makeSlide("s01", "cover");
  stage.innerHTML = "";
  stage.appendChild(bigEl);
  var thumbBig = await QA.thumbnail(bigEl);
  out["thumbnail-big"] = [thumbBig.heroPx, thumbBig.pass, thumbBig.fix];
  await runCase("thumbnail-contrast", [makeSlide("s01", "cover", { heroPx: 150, headStyle: "color:#D0D0CE" })]);

  /* 9 ---------------------------------------------------------- default look */
  var noBrand = tokens({ provenance: {}, type: { display: { family: "cairo" }, heading: { family: "cairo" }, body: { family: "rubik" } } });
  await runCase("default-look", base(), noBrand);
  var brandFont = tokens({ provenance: { "type.display.family": "brand", "type.heading.family": "brand", "roles.accent": "brand" }, type: { display: { family: "cairo" }, heading: { family: "cairo" }, body: { family: "readex-pro" } } });
  await runCase("default-look-brand", base(), brandFont);

  /* 9b ------------------------------------------------------- dead zone (D9) */
  await runCase("dead-zone", [makeSlide("s01", "cover", { heroPx: 150 })]);
  await runCase("dead-zone-filled", [makeSlide("s01", "cover", { headHtml: [w(words(1, 0)), w(words(1, 1)), w(words(1, 2))].join("<br>") })]);
  await runCase("dead-zone-item", [makeSlide("s01", "item")]);
  var plated = makeSlide("s01", "cover", { heroPx: 150 });
  plated.querySelector(".cs-bg").innerHTML = '<div class="cs-media-slot" data-m="media" style="position:absolute;left:0;top:0;right:0;bottom:0"></div>';
  await runCase("dead-zone-plate", [plated]);

  /* 10 -------------------------------------------------------- scope filter */
  await runCase("only-d3", [makeSlide("s01", "cover", { heroPx: 80, bodyPx: 38 })], null, null, { gates: ["D3"] });

  var hookCalls = 0;
  QA._.gates.rendered.push({ id: "VA2", ids: ["VA2.anchor"], run: async function (ctx) {
    hookCalls++;
    return [{ gate: "VA2", rule: "VA2.anchor", sev: "NOTE", prospect: true, slide: ctx.S[0].id, el: ctx.S[0].id,
      msg: { ar: "فحص", en: "Check" }, autofixed: false }];
  } });
  QA._.gates.rendered.push({ id: "VA2.empty", run: async function () {} });
  var hookResults = await runCase("rendered-hook", [makeSlide("s01", "item")], null, null, { gates: ["VA2.anchor"] });
  var reportSlides = [makeSlide("s01", "item")];
  stage.innerHTML = ""; stage.appendChild(reportSlides[0]);
  var reportInput = { spec: spec(reportSlides), deck: { slides: [{ id: "s01", el: reportSlides[0] }] } };
  var reportOpts = { gates: ["VA2"], createdAt: "2026-10-23T00:00:00Z" };
  var reportA = await QA.run(reportInput, reportOpts), reportB = await QA.run(reportInput, reportOpts);
  out["rendered-stats"] = [hookCalls, reportA.results.stats.gates.VA2, JSON.stringify(reportA) === JSON.stringify(reportB), reportA.results.stats.gates["VA2.empty"]];
  out["rendered-prospect"] = [hookResults[0].prospect, reportA.results[0].prospect, reportB.results[0].prospect];
  await runCase("rendered-hook-filtered", reportSlides, null, null, { gates: ["D3"] });

  document.title = "done";
  document.getElementById("out").textContent = btoa(unescape(encodeURIComponent(JSON.stringify(out))));
})().catch(function (e) {
  document.title = "failed";
  document.getElementById("out").textContent = btoa(unescape(encodeURIComponent(JSON.stringify({ __error: String((e && e.stack) || e) }))));
});
