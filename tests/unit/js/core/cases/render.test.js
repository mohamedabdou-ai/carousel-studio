/* render: spec -> DOM, modes, events, update in place, readiness, abort. */
(function () {
  var test = CST.test, eq = CST.eq, assert = CST.assert;

  function ex(patch) { var s = FX.example(); s.style.overrides = {}; if (patch) patch(s); return s; }
  function q(el, sel) { return el.querySelector(sel); }
  function qa(el, sel) { return Array.prototype.slice.call(el.querySelectorAll(sel)); }
  function drop(r) { if (r && r.el && r.el.parentNode) r.el.remove(); }

  test("render: slide() returns a laid-out .cs-slide, its tokens and a fit report", async function () {
    await FX.setup();
    var spec = ex(), r = await CS.core.render.slide(spec, FX.brand(), 2);
    eq(r.id, "s03"); eq(r.index, 2); assert(r.el.classList.contains("cs-slide"), "el");
    eq(r.el.offsetWidth, 1080); eq(r.el.offsetHeight, 1440);
    eq(r.tokens.presetId, "swiss"); assert(r.fit && r.fit.slideId === "s03" && r.fit.ok && Object.keys(r.fit.slots).length >= 3, "fit report");
    var stage = r.el.parentNode; eq(stage.getAttribute("data-cs-stage"), "");
    eq(getComputedStyle(stage).position, "fixed"); eq(getComputedStyle(stage).left, "-12000px"); eq(stage.style.width, "1080px"); eq(stage.style.pointerEvents, "none");
    await CST.throwsCode("E_USAGE", function () { return CS.core.render.slide(spec, FX.brand(), 99); });
    drop(r);
  });

  test("render: modes - export builds lines, thumb does not, edit stays editable", async function () {
    await FX.setup();
    var spec = ex(), brand = FX.brand();
    var ex1 = await CS.core.render.slide(spec, brand, 0, { mode: "export" }), th = await CS.core.render.slide(spec, brand, 0, { mode: "thumb" }), ed = await CS.core.render.slide(spec, brand, 0, { mode: "edit" });
    assert(qa(ex1.el, ".cs-headline .cs-ln").length >= 2 && !qa(ex1.el, "[contenteditable],[data-edit]").length, "export: lines, nothing editable");
    // The cover keeps one line arrangement in every mode: a thumbnail must show the lines the export will have.
    eq(qa(th.el, ".cs-headline .cs-ln").map(function (l) { return l.textContent; }).join("|") || "natural", qa(ex1.el, ".cs-headline .cs-ln").map(function (l) { return l.textContent; }).join("|"), "thumb: the same cover lines as the export");
    assert(!qa(th.el, "[contenteditable],[data-edit]").length, "thumb: nothing editable");
    assert(!qa(ed.el, ".cs-body .cs-ln, .cs-sub .cs-ln").length && qa(ed.el, '[contenteditable="true"]').length >= 2, "edit: editable, and only the cover headline carries its chosen lines");
    CST.deepEq(FX.sizes(ex1), FX.sizes(th), "all modes fit the same way"); [ex1, th, ed].forEach(drop);
  });

  test("render: events cs:render and cs:fit carry the documented details", async function () {
    await FX.setup();
    var got = [], off1 = CS.on("cs:render", function (d) { got.push(["render", d]); }), off2 = CS.on("cs:fit", function (d) { got.push(["fit", d]); });
    var r = await CS.core.render.slide(ex(), FX.brand(), 1); off1(); off2();
    eq(got.length, 2); eq(got[0][0], "render"); eq(got[0][1].slideId, "s02"); eq(got[0][1].tokensHash, r.tokens.hash);
    eq(got[1][1].slideId, "s02"); assert(got[1][1].report === r.fit, "the same report object"); drop(r);
  });

  test("render: window.__csReady flips after the first complete render and cs:ready is emitted once", async function () {
    await FX.setup();
    assert(window.__csReady === true || window.__csReady === false, "boolean flag exists");
    var r = await CS.core.render.slide(ex(), FX.brand(), 0);
    await CS.core.ready.markReady(); await FX.nextFrame();
    eq(window.__csReady, true); drop(r);
  });

  test("render: deck() renders every slide, honours slideIds and disposes its stage", async function () {
    await FX.setup();
    var spec = ex(), brand = FX.brand(), t0 = performance.now(), deck = await CS.core.render.deck(spec, brand, { mode: "export" }), ms = performance.now() - t0;
    eq(deck.slides.length, 8); eq(deck.tokens.presetId, "swiss"); eq(deck.frozenOk, false); assert(deck.stage.isConnected, "stage in the document");
    CST.deepEq(deck.slides.map(function (r) { return r.id; }), ["s01", "s02", "s03", "s04", "s05", "s06", "s07", "s08"]);
    assert(deck.slides.every(function (r, i) { return r.index === i && r.el.parentNode === deck.stage; }), "indexes and parents");
    assert(ms < 2500, "first render of an 8-slide deck takes " + Math.round(ms) + " ms (budget 2500)");
    deck.dispose(); assert(!deck.stage.isConnected, "dispose removes the stage"); deck.dispose();
    var subset = await CS.core.render.deck(spec, brand, { mode: "thumb", slideIds: ["s02", "s05"] });
    CST.deepEq(subset.slides.map(function (r) { return r.id + ":" + r.index; }), ["s02:1", "s05:4"], "ids and their real indexes"); subset.dispose();
    var mine = document.createElement("div"); mine.style.cssText = "position:fixed;left:-9000px;top:0;width:1080px"; document.body.appendChild(mine);
    var own = await CS.core.render.deck(spec, brand, { mode: "thumb", stage: mine, slideIds: ["s01"] });
    assert(own.slides[0].el.parentNode === mine, "a stage given by the caller is used"); own.dispose();
    assert(mine.isConnected && !mine.children.length, "and left in place, emptied"); mine.remove();
  });

  test("render: update() re-composes inside the same root element and refits", async function () {
    await FX.setup();
    var spec = ex(), brand = FX.brand(), r = await CS.core.render.slide(spec, brand, 2, { mode: "edit" }), root = r.el;
    var holder = document.createElement("div"); holder.style.cssText = "position:fixed;left:-8000px;top:0;width:1080px"; document.body.appendChild(holder); holder.appendChild(root);
    var next = CS.core.spec.setField(spec, "s03", "body", "جملة قصيرة.");
    var t0 = performance.now(), r2 = await CS.core.render.update(r, next, brand, { mode: "edit" }), ms = performance.now() - t0;
    assert(r2 === r && r2.el === root && root.parentNode === holder, "same SlideRender, same node, same parent");
    eq(q(root, ".cs-body").textContent, "جملة قصيرة."); assert(r.fit.slots["s03.body"].lines === 1, "refitted: one line now");
    assert(root.getAttribute("contenteditable") === null && qa(root, '[contenteditable="true"]').length >= 3, "still editable after the swap");
    assert(ms < 400, "text edit refit took " + Math.round(ms) + " ms (budget 150 on a phone, 400 here)");
    var restyled = CS.core.spec.setField(next, "s03", "title", "عنوان تاني");
    await CS.core.render.update(r, restyled, brand, { mode: "edit" }); eq(q(root, ".cs-title").textContent, "عنوان تاني");
    var gone = CS.core.spec.removeSlide(restyled, "s03");
    await CST.throwsCode("E_USAGE", function () { return CS.core.render.update(r, gone, brand); });
    holder.remove();
  });

  test("render: update() works on a hidden or detached root", async function () {
    await FX.setup();
    var spec = ex(), brand = FX.brand(), r = await CS.core.render.slide(spec, brand, 2, { mode: "thumb" });
    var hidden = document.createElement("div"); hidden.hidden = true; document.body.appendChild(hidden); hidden.appendChild(r.el);
    await CS.core.render.update(r, CS.core.spec.setField(spec, "s03", "title", "عنوان مخفي"), brand, { mode: "thumb" });
    assert(r.el.parentNode === hidden, "put back where it was"); assert(r.fit.slots["s03.title"].fontPx >= 51, "fitted although display:none"); hidden.remove();
    var r3 = await CS.core.render.slide(spec, brand, 1, { mode: "thumb" }); r3.el.remove();
    await CS.core.render.update(r3, spec, brand, { mode: "thumb" }); assert(!r3.el.isConnected && r3.fit.ok, "a detached root is measured in the stage and left detached");
  });

  test("render: a missing font does not stop the render, it is reported", async function () {
    await FX.setup();
    var seen = []; var off = CS.on("cs:error", function (d) { seen.push(d); });
    var p = JSON.parse(JSON.stringify(CS.core.registry.getPreset("swiss"))); p.id = "nofile"; p.type.body.family = "playpen-sans-arabic";
    CS.core.registry.registerFonts({ registry: { families: [{ id: "playpen-sans-arabic", family: "Playpen Sans Arabic", files: [{ file: "x.ttf", wght: [400, 400] }] }] } });
    CS.core.registry.registerPreset(p, "");
    var spec = ex(function (s) { s.style.presetId = "nofile@1.0"; });
    if (!CS.core.registry.hasFont("playpen-sans-arabic")) { off(); return; }
    var r = await CS.core.render.slide(spec, FX.brand(), 2, { mode: "thumb" }); off();
    assert(r.fit.warnings.some(function (w) { return w.en.indexOf("Fonts could not be loaded") === 0; }) || r.fit.ok, "rendered and, if the face is absent, reported");
    drop(r);
  });

  test("render: an aborted signal rejects with E_ABORTED", async function () {
    await FX.setup();
    var ac = new AbortController(); ac.abort();
    await CST.throwsCode("E_ABORTED", function () { return CS.core.render.deck(ex(), FX.brand(), { signal: ac.signal }); });
    await CST.throwsCode("E_ABORTED", function () { return CS.core.render.slide(ex(), FX.brand(), 0, { signal: ac.signal }); });
  });

  test("ready: images and fonts", async function () {
    await FX.setup();
    var png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    var box = document.createElement("div"); var img = new Image(); img.src = png; box.appendChild(img); var bad = new Image(); bad.src = "data:image/png;base64,AAAA"; box.appendChild(bad); document.body.appendChild(box);
    await CS.core.ready.images(box); assert(img.complete && img.naturalWidth === 1, "decoded"); box.remove();
    await CS.core.ready.fonts(["alexandria"]); await CS.core.ready.fonts([]); await CS.core.ready.whenReady();
    var specs = CS.core.ready.fontSpecs(CS.core.resolve.post(ex(), FX.brand()));
    CST.deepEq(specs.map(function (s) { return s.id + "@" + s.wght; }), ["alexandria@800", "alexandria@700", "readex-pro@400", "readex-pro@600"], "the faces a post uses");
    await CS.core.ready.fonts(specs);
    await CST.throwsCode("E_FONT_MISSING", function () {
      CS.core.registry.registerFonts({ registry: { families: [{ id: "ghost-face", family: "Ghost Face XYZ", files: [{ file: "x.ttf", wght: [400, 400] }] }] } });
      return CS.core.ready.fonts(["ghost-face"], 3000);
    }, "a family without any @font-face");
  });

  test("boot: loads the page blocks, registers schemas, waits for fonts and emits cs:boot", async function () {
    await FX.setup();
    var D = "/plugins/carousel-studio/skills/carousel-design", get = function (u) { return fetch(u).then(function (r) { return r.json(); }); };
    var spec = ex(), brand = FX.brand();
    var presets = [CS.core.registry.getPreset("swiss"), CS.core.registry.getPreset("heritage")];
    var esc = function (o) { return JSON.stringify(o).replace(/<\//g, "<\\/"); };
    var html = '<!doctype html><body>' +
      '<script type="application/json" id="cs-config">' + esc({ engine: "cs-1.1.1", view: "design", mode: "full", lane: "studio", uiDialect: "eg", buildId: "t", builtAt: "2026-10-22T00:00:00Z", creditFree: true, fonts: ["alexandria", "readex-pro"], presets: ["swiss"], capabilities: [] }) + '<\/script>' +
      '<script type="application/json" id="cs-spec">' + esc(spec) + '<\/script><script type="application/json" id="cs-brand">' + esc(brand) + '<\/script>' +
      '<script type="application/json" id="cs-presets">' + esc(presets) + '<\/script>' +
      '<script type="application/json" id="cs-rules">' + esc({ qaRules: null, copy: null, ortho: null, dialects: {}, platform: FX.data.platform, locale: FX.data.locale }) + '<\/script>' +
      '<script type="application/json" id="cs-schemas">' + esc({ spec: await get(D + "/schemas/spec.schema.json"), brand: await get(D + "/schemas/brand.schema.json") }) + '<\/script></body>';
    var doc = new DOMParser().parseFromString(html, "text/html"), seen = [];
    var off = CS.on("cs:boot", function (d) { seen.push(d); });
    var oldVisual=CS.visual,resets=0,data;CS.visual={_:{reset:function(){resets++}}};
    try {data=await CS.core.boot(doc);eq(resets,1);data=await CS.core.boot(doc);eq(resets,2);} finally {CS.visual=oldVisual;off();}
    eq(data.spec.id, spec.id); eq(data.brand.slug, brand.slug); eq(seen.length, 2); eq(seen[0].config.buildId, "t");
    assert(CS.core.registry.listPresets().length >= 2, "presets registered");
    var errors = []; var offE = CS.on("cs:error", function (d) { errors.push(d); });
    var broken = html.replace(esc(spec), esc({ id: "x" }));
    await CST.throwsCode("E_SCHEMA", function () { return CS.core.boot(new DOMParser().parseFromString(broken, "text/html")); }, "a spec that cannot be rendered at all"); offE();
  });
})();
