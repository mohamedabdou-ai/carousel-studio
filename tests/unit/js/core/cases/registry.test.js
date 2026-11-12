/* registry: pages, presets, occasions, fonts, archetypes, rules, constants. */
(function () {
  var test = CST.test, eq = CST.eq, assert = CST.assert;

  test("registry: setup registers rules, fonts, presets and the 20 archetypes", async function () {
    await FX.setup();
    var reg = CS.core.registry;
    eq(reg.listPresets().map(function (p) { return p.id; }).join(","), "swiss,heritage", "presets in registration order");
    CS.core.constants.SLIDE_TYPES.forEach(function (t) {
      var a = reg.getArchetype(t);
      assert(a.variants.length >= 1 && a.variants.indexOf(a.defaultVariant) >= 0, t + " has variants and a default among them");
      assert(a.template instanceof HTMLTemplateElement, t + " has a template");
    });
    assert(reg.archetypeCss().indexOf("Carousel Studio") >= 0, "archetype CSS is available");
    assert(document.getElementById("cs-archetype-css"), "the layout sheet was added to the document");
  });

  test("registry: constants follow platform-instagram.json", async function () {
    await FX.setup();
    var k = CS.core.constants;
    CST.deepEq(k.CANVAS, { w: 1080, h: 1440 });
    CST.deepEq(k.SAFE, { x: 34, y: 45, w: 1012, h: 1350 });
    CST.deepEq(k.CONTENT, { x: 114, y: 125, w: 852, h: 1190 });
    CST.deepEq(k.BODY, { x: 114, y: 261, w: 852, h: 888 });
    eq(k.KEEP_OUTS.length, 4);
    eq(k.PLATFORM.defaultCanvas, "ig-3x4");
    assert(Object.isFrozen(k), "constants are frozen");
    var g = CS.core.registry.geometry(1350);
    CST.deepEq(g.body, { x: 114, y: 261, w: 852, h: 798 }, "4:5 body shrinks, bands keep their distance from the edges");
    eq(g.footer.y, 1075);
    eq(g.keepOuts[2].y, 1165);
  });

  test("registry: font coverage and missing glyphs", async function () {
    await FX.setup();
    var reg = CS.core.registry;
    eq(reg.fontCss("alexandria"), "Alexandria");
    eq(reg.fontCss("nope"), "", "unknown id gives an empty family");
    assert(reg.fontHas("alexandria", 0x0627), "alef is covered");
    assert(!reg.fontHas("alexandria", 0x4e2d), "a CJK letter is not");
    CST.deepEq(reg.missingGlyphs("alexandria", "ابت 123 \u200C \u00A0 😀 中"), [0x4e2d], "whitespace, joiners and emoji are not judged");
  });

  test("registry: decor placeholders become exact per-slide colours", async function () {
    await FX.setup();
    var reg = CS.core.registry;
    var css = reg.decorCss("heritage");
    assert(css.indexOf("{{") < 0, "decorCss leaves no placeholder");
    assert(css.indexOf("%23E8B05C") >= 0, "defaults to the preset's own accent, percent-encoded");
    var roles = Object.assign({}, reg.presetRoles(reg.getPreset("heritage")), { accent: "#112233" });
    var local = reg.decorLocal("heritage", roles);
    assert(local.key && /^[0-9a-f]{16}$/.test(local.key), "key is a hash16");
    assert(local.css.indexOf("%23112233") >= 0, "uses the post's accent");
    assert(local.css.indexOf('[data-decor-key="' + local.key + '"]') >= 0, "rules are scoped to the key");
    eq(local.css.indexOf("cs-em"), -1, "only the rules that carry placeholders are in the local sheet");
    eq(reg.decorLocal("swiss", reg.presetRoles(reg.getPreset("swiss"))).css, "", "a preset without placeholders needs no local sheet");
  });

  test("registry: loadPage reads the blocks of the Studio page", async function () {
    await FX.setup();
    var html = '<!doctype html><body>' +
      '<script type="application/json" id="cs-config">{"engine":"cs-1.2.0","view":"design","mode":"full","lane":"studio","uiDialect":"eg","buildId":"t","builtAt":"2026-10-22T00:00:00Z","creditFree":true,"fonts":[],"presets":[],"capabilities":[]}<\/script>' +
      '<script type="application/json" id="cs-spec">{"note":"a comment marker <\\!-- is escaped by the builder, and so is <\\/script>"}<\/script>' +
      '<script type="application/json" id="cs-ideas">[{"id":"i1","text":"x"}]<\/script></body>';
    var doc = new DOMParser().parseFromString(html, "text/html");
    var data = CS.core.registry.loadPage(doc);
    eq(data.config.buildId, "t");
    assert(data.spec.note.indexOf("<!--") >= 0 && data.spec.note.indexOf("</script>") >= 0, "builder escapes are undone");
    eq(data.ideas.length, 1);
    eq(data.brand, null);
    await CST.throwsCode("E_SCHEMA", function () {
      CS.core.registry.loadPage(new DOMParser().parseFromString('<script type="application/json" id="cs-spec">{broken</script>', "text/html"));
    }, "broken JSON is an E_SCHEMA error");
  });

  test("registry: presets are checked on the way in", async function () {
    await FX.setup();
    await CST.throwsCode("E_SCHEMA", function () { CS.core.registry.registerPreset({ id: "half" }, ""); });
    await CST.throwsCode("E_USAGE", function () { CS.core.registry.getPreset("does-not-exist"); });
    await CST.throwsCode("E_USAGE", function () { CS.core.registry.getArchetype("nope"); });
  });
  test("registry v2: inner footer and padded zone follow both canvases without mutating cover", async function () {
    await FX.setup();
    [1440, 1350].forEach(function (h) {
      var g = CS.core.registry.geometry(h, { inner: true, padEnd: 48 });
      eq(g.footer.x, 174); eq(g.footer.w, 732); eq(g.footer.y, 1275 + h - 1440);
      eq(g.body.h, 998 + h - 1440); eq(g.zone.h, g.body.h - 48);
      CST.deepEq(g, CS.core.registry.geometry(h, { inner: true, padEnd: 48 }), "run twice");
      eq(CS.core.registry.geometry(h).footer.y, 1165 + h - 1440);
      ["swiss", "constructor", "toString", "__proto__"].forEach(function (id) {
        eq(CS.core.registry.geometry(h, { presetId: id, type: "poster" }).zone.h, 888 + h - 1440, id + " has no poster padding");
      });
      ["poster", "heritage"].forEach(function (id) {
        eq(CS.core.registry.geometry(h, { presetId: id, type: "poster" }).zone.h, 864 + h - 1440, id + " poster padding");
      });
    });
  });
})();
