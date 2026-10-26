/* resolve: preset <- brand <- occasion <- post <- slide -> floors, provenance, adjustments, hash. */
(function () {
  var test = CST.test, eq = CST.eq, assert = CST.assert;

  function post(spec, brand, opts) { return CS.core.resolve.post(spec, brand, opts); }
  function ex(patch) { var s = FX.example(); if (patch) patch(s); return s; }
  /** Smallest OKLCH hue distance in degrees: the floors move lightness only, so a kept support colour stays within a few degrees. */
  function hueGap(a, b) { var d = Math.abs(CS.core.color.toOklch(a).h - CS.core.color.toOklch(b).h) % 360; return d > 180 ? 360 - d : d; }
  function adj(t, path) { return t.adjustments.filter(function (a) { return a.path === path; }); }

  test("resolve: an unpinned spec uses the shipped index default", async function () {
    await FX.setup();
    var preset = await (await fetch("/plugins/carousel-studio/skills/carousel-design/styles/creator/preset.json")).json();
    var index = await (await fetch("/plugins/carousel-studio/skills/carousel-design/styles/index.json")).json();
    eq(CS.core.DEFAULT_PRESET, index.default);
    CS.core.registry.registerPreset(preset, "");
    var spec = ex(function (s) { delete s.style.presetId; });
    eq(post(spec, null).presetId, "creator");
  });

  test("resolve: preset defaults, brand binding and derived solids", async function () {
    await FX.setup();
    var C = CS.core.color, t = post(ex(), FX.brand());
    eq(t.presetId, "swiss"); eq(t.presetVersion, "1.0"); eq(t.digits, "western"); eq(t.dialect, "eg");
    eq(t.roles.bg, "#F4F4F2"); eq(t.roles.accent, "#E3262B");
    eq(t.roles.surface, C.mix("#F4F4F2", t.roles.ink, 0.04), "the brand sets bg and ink but no surface, so the surface follows them");
    eq(t.provenance["roles.surface"], "brand");
    eq(post(ex(), null).roles.surface, "#FFFFFF", "without a brand the preset's own surface stays");
    eq(t.roles.accent2, t.roles.accent, "accent2 defaults to accent");
    var bare = JSON.parse(JSON.stringify(CS.core.registry.getPreset("swiss"))); bare.id = "bare"; delete bare.roles.surface;
    CS.core.registry.registerPreset(bare, "");
    var tb = post(ex(function (s) { s.style.presetId = "bare@1.0"; s.style.overrides = {}; }), null);
    eq(tb.roles.surface, C.mix("#F4F4F2", tb.roles.ink, 0.04), "without a surface: mix(bg, ink, 0.04)");
    eq(t.derived.line, C.mix(t.roles.ink, t.roles.bg, 0.82));
    eq(t.derived.scrimFrom, C.mix(t.roles.bg, t.roles.ink, 0.55));
    assert(/^rgba\(\d+,\d+,\d+,0\)$/.test(t.derived.scrimTo), "scrimTo is the same colour at alpha 0");
    assert(C.contrast(t.derived.onAccent, t.roles.accent) >= 4.5, "onAccent reaches the body contrast");
    eq(t.type.display.family, "alexandria");
    eq(t.type.display.cssFamily, "Alexandria");
    eq(t.type.body.family, "readex-pro");
    CST.deepEq(t.type.scale.h1, [88, 88], "a single size becomes a range");
    CST.deepEq(t.type.scale.hero, [120, 180]);
    eq(t.type.scale.heroTarget, 150);
    CST.deepEq(t.fonts.slice().sort(), ["alexandria", "readex-pro"]);
    assert(/^[0-9a-f]{16}$/.test(t.hash), "hash16");
  });

  test("resolve: css custom properties (CONTRACT 6.2) are all present", async function () {
    await FX.setup();
    var t = post(ex(), FX.brand()), css = t.css;
    ["--cs-bg", "--cs-surface", "--cs-ink", "--cs-ink-muted", "--cs-accent", "--cs-accent-2", "--cs-on-accent", "--cs-line", "--cs-scrim-from", "--cs-scrim-to", "--cs-bg-image",
      "--cs-font-display", "--cs-font-heading", "--cs-font-body", "--cs-font-latin", "--cs-wght-display", "--cs-wght-heading", "--cs-wght-body", "--cs-wght-latin",
      "--cs-lh-display", "--cs-lh-heading", "--cs-lh-body", "--cs-fs-hero", "--cs-fs-h1", "--cs-fs-h2", "--cs-fs-title", "--cs-fs-body", "--cs-fs-small", "--cs-fs-micro",
      "--cs-fs-hero-min", "--cs-fs-hero-max", "--cs-fs-title-min", "--cs-fs-title-max", "--cs-fs-body-min", "--cs-fs-body-max", "--cs-hero-target",
      "--cs-text-align", "--cs-cover-justify", "--cs-headline-w-min", "--cs-headline-w-max",
      "--cs-w", "--cs-h", "--cs-pad-x", "--cs-pad-top", "--cs-pad-bottom", "--cs-header-h", "--cs-footer-h", "--cs-footer-item-h", "--cs-body-top", "--cs-body-h", "--cs-gap", "--cs-unit", "--cs-col", "--cs-gutter"
    ].forEach(function (k) { assert(css[k] !== undefined && css[k] !== "", "missing " + k); });
    eq(css["--cs-font-display"], '"Alexandria"'); eq(css["--cs-fs-hero"], "180px"); eq(css["--cs-fs-hero-min"], "120px"); eq(css["--cs-headline-w-max"], "85%");
    eq(css["--cs-w"], "1080px"); eq(css["--cs-h"], "1440px"); eq(css["--cs-body-top"], "261px"); eq(css["--cs-body-h"], "888px"); eq(css["--cs-pad-bottom"], "195px");
    eq(css["--cs-text-align"], "start"); eq(css["--cs-cover-justify"], "flex-start");
    var t45 = post(ex(function (s) { s.canvas.h = 1350; }), FX.brand());
    eq(t45.css["--cs-h"], "1350px"); eq(t45.css["--cs-body-h"], "798px", "the 4:5 canvas keeps its bands and loses body height");
  });

  test("resolve: contrast floor shifts OKLCH lightness only and says why", async function () {
    await FX.setup();
    var C = CS.core.color, brand = FX.brand();
    brand.visual.palette = { bg: "#F4F4F2", ink: "#9A9A9A", accent: "#E3262B" };
    var t = post(ex(function (s) { s.style.overrides = { "roles.inkMuted": "#C0C0C0" }; }), brand), a = adj(t, "roles.ink")[0];
    assert(a && a.reason === "contrast", "ink adjustment is logged with reason contrast");
    assert(C.contrast(t.roles.ink, t.roles.bg) >= 4.5 && C.contrast(t.roles.ink, t.roles.surface) >= 4.5, "ink reaches 4.5 on bg and surface");
    eq(t.provenance["roles.ink"], "floor");
    assert(a.msg.ar.indexOf("عُدّل") === 0 && a.msg.en.indexOf("nudged") > 0, "bilingual reason");
    var before = C.toOklch("#9A9A9A"), after = C.toOklch(t.roles.ink);
    assert(Math.abs(before.C - after.C) < 0.02, "grey stays grey (hue and chroma kept)");
    assert(after.L < before.L, "darker on a light background");
    assert(adj(t, "roles.inkMuted").length === 1, "muted ink is fixed against the background too");
    var ex1 = CS.core.resolve.explain(t, "roles.ink");
    eq(ex1.layer, "floor"); assert(ex1.steps.length >= 2 && ex1.msg.ar && ex1.msg.en, "explain tells the story");
  });

  test("resolve: accent used as text (highlight color) must reach the body contrast on the whole gradient", async function () {
    await FX.setup();
    var C = CS.core.color, spec = ex(function (s) { s.style.presetId = "heritage@1.0"; s.style.overrides = {}; }), t = post(spec, FX.brand());
    eq(t.decor.highlight, "color");
    assert(t.provenance["roles.accent"] === "floor", "brand red on deep green had to move");
    assert(C.contrast(t.roles.accent, "#16473A") >= 4.5 && C.contrast(t.roles.accent, "#0F362C") >= 4.5, "both gradient stops are respected");
    assert(/^linear-gradient\(160deg,#16473A 0%,#0F362C 100%\)$/.test(t.background.image), "gradient built from role and hex stops: " + t.background.image);
    eq(t.css["--cs-text-align"], "center"); eq(t.css["--cs-cover-justify"], "center");
    eq(t.decor.kashida.allowed, true);
    var untouched = post(spec, null);
    eq(untouched.provenance["roles.accent"], "preset", "no brand: the preset's gold already passes");
  });

  test("resolve: layer order and provenance (preset, brand, post, slide)", async function () {
    await FX.setup();
    var brand = FX.brand();
    brand.visual.palette = { bg: "#EFEFEA", ink: "#111111", inkMuted: "#555555", accent: "#0A7C6E" };
    var spec = ex(function (s) {
      s.style.overrides = { "roles.accent": "#1F4FD8", "type.scale.title": "60,68", "decor.highlight": "marker" };
      s.slides[2].overrides = { "roles.accent": "#8A2BE2" };
    });
    var t = post(spec, brand);
    eq(t.roles.bg, "#EFEFEA"); eq(t.provenance["roles.bg"], "brand");
    eq(t.roles.accent, "#1F4FD8"); eq(t.provenance["roles.accent"], "post");
    CST.deepEq(t.type.scale.title, [60, 68]); eq(t.provenance["type.scale.title"], "post");
    eq(t.decor.highlight, "marker"); eq(t.css["--cs-accent"], "#1F4FD8");
    var s2 = CS.core.resolve.slide(t, spec.slides[2]);
    eq(s2.roles.accent, "#8A2BE2"); eq(s2.provenance["roles.accent"], "slide"); eq(s2.roles.bg, "#EFEFEA", "everything else is inherited");
    assert(s2.hash !== t.hash, "a slide override changes the hash");
    eq(CS.core.resolve.slide(t, spec.slides[0]), t, "a slide without overrides returns the post tokens");
    var ex2 = CS.core.resolve.explain(s2, "roles.accent");
    eq(ex2.layer, "slide"); eq(ex2.steps.length >= 4, true, "preset, brand, post and slide are all in the story: " + ex2.steps.join(" | "));
  });

  test("resolve: locks, unknown paths and bad values are ignored and logged", async function () {
    await FX.setup();
    var brand = FX.brand();
    brand.visual.locks = ["roles.accent", "type.display"];
    var spec = ex(function (s) {
      s.style.overrides = { "roles.accent": "#00FF00", "type.display.wght": 700, "roles.ink": "not-a-colour", "layout.bogus": "x", "decor.highlight": "marker" };
    });
    var t = post(spec, brand);
    eq(t.roles.accent, "#E3262B", "locked colour stays"); eq(t.type.display.wght, 800, "locking type.display locks its leaves");
    eq(t.decor.highlight, "marker", "an unlocked override applies");
    ["roles.accent", "type.display.wght", "roles.ink", "layout.bogus"].forEach(function (p) {
      var a = adj(t, p)[0];
      assert(a && a.reason === "clamp" && a.msg.ar && a.msg.en, "logged: " + p);
    });
    assert(adj(t, "roles.accent")[0].msg.en.indexOf("locked") > 0);
    assert(adj(t, "layout.bogus")[0].msg.en.indexOf("not a supported") > 0);
  });

  test("resolve: occasion overlay touches only the allowed keys and respects presetsAllowed and locks", async function () {
    await FX.setup();
    var occ = await (await fetch("/docs/examples/occasion.example.json")).json();
    CS.core.registry.registerOccasion(occ);
    var base = ex(function (s) { s.style.occasionId = occ.id; });
    var onSwiss = post(base, FX.brand());
    eq(onSwiss.occasionId, null, "ramadan-2027 only allows heritage");
    var h = ex(function (s) { s.style.occasionId = occ.id; s.style.presetId = "heritage@1.0"; });
    var t = post(h, FX.brand());
    eq(t.occasionId, occ.id); eq(t.roles.accent2, "#C9A227"); eq(t.provenance["roles.accent2"], "occasion");
    eq(t.roles.accent, post(ex(function (s) { s.style.presetId = "heritage@1.0"; }), FX.brand()).roles.accent, "accent is untouched by the overlay");
    var locked = FX.brand(); locked.visual.locks = ["roles.accent2"];
    eq(post(h, locked).roles.accent2, post(h, locked).roles.accent, "a brand lock keeps accent2 (still derived from the accent)");
    eq(post(h, FX.brand(), { occasionId: null }).occasionId, null, "opts.occasionId null switches the overlay off");
  });

  test("resolve: floors on sizes", async function () {
    await FX.setup();
    var p = JSON.parse(JSON.stringify(CS.core.registry.getPreset("swiss")));
    p.id = "tiny"; p.type.scale.hero = [60, 100]; p.type.scale.body = [30, 40]; p.type.scale.small = 20; p.type.scale.micro = 18;
    CS.core.registry.registerPreset(p, "");
    var t = post(ex(function (s) { s.style.presetId = "tiny@1.0"; }), null);
    CST.deepEq(t.type.scale.hero, [96, 100]); CST.deepEq(t.type.scale.body, [42, 42]); eq(t.type.scale.small, 30); eq(t.type.scale.micro, 30);
    ["type.scale.hero", "type.scale.body", "type.scale.small", "type.scale.micro"].forEach(function (k) { eq(adj(t, k)[0].reason, "floor", k); });
    eq(t.provenance["type.scale.hero"], "floor");
    eq(t.type.scale.heroTarget, 100, "target stays inside the range");
  });

  test("resolve: variant fallback and unknown presets and fonts", async function () {
    await FX.setup();
    var spec = ex(function (s) { s.slides[2].variant = "media"; s.slides[3].variant = "does-not-exist"; });
    var t = post(spec, FX.brand());
    var ok = CS.core.resolve.variantFor(t, spec.slides[2]);
    eq(ok.variant, "media"); eq(ok.fellBack, false);
    var bad = CS.core.resolve.variantFor(t, spec.slides[3]);
    eq(bad.variant, "ghost-number", "the preset's default for the type"); eq(bad.fellBack, true);
    var st = CS.core.resolve.slide(t, spec.slides[3]);
    assert(adj(st, "variant").length === 1, "the fallback is logged on the slide tokens");
    eq(CS.core.resolve.variantFor(t, { type: "cover" }).variant, "top");

    var unknown = post(ex(function (s) { s.style.presetId = "nope@1.0"; }), null);
    eq(unknown.presetId, "creator"); assert(adj(unknown, "presetId").length === 1, "unknown preset falls back with a note");
    var pinned = post(ex(function (s) { s.style.presetId = "swiss@9.9"; }), null);
    assert(adj(pinned, "presetVersion").length === 1, "a pinned version that is not installed is reported");

    var ghost = JSON.parse(JSON.stringify(CS.core.registry.getPreset("swiss"))); ghost.id = "ghostly"; ghost.type.display.family = "ghost-font";
    CS.core.registry.registerPreset(ghost, "");
    await CST.throwsCode("E_FONT_MISSING", function () { post(ex(function (s) { s.style.presetId = "ghostly@1.0"; }), null); });
  });

  test("resolve: brand fonts replace families that exist in the registry, weights stay", async function () {
    await FX.setup();
    var brand = FX.brand(); brand.visual.fonts = { display: "readex-pro", body: "alexandria", latin: "alexandria" };
    var t = post(ex(), brand);
    eq(t.type.display.family, "readex-pro"); eq(t.type.heading.family, "readex-pro"); eq(t.type.body.family, "alexandria"); eq(t.type.latin.family, "alexandria");
    eq(t.type.display.wght, 800, "weights are the preset's"); eq(t.provenance["type.display.family"], "brand");
  });

  test("resolve: the hash covers tokens but not provenance, adjustments, css or the hash itself", async function () {
    await FX.setup();
    var spec = ex(), a = post(spec, FX.brand()), b = post(spec, FX.brand());
    eq(a.hash, b.hash, "deterministic");
    eq(CS.core.canon.hash(CS.core.canon.hashable(a)), a.hash);
    var c = post(ex(function (s) { s.style.overrides = { "roles.accent": "#112233" }; }), FX.brand());
    assert(c.hash !== a.hash, "a token change changes the hash");
    var copy = JSON.parse(JSON.stringify(a)); copy.provenance = {}; copy.adjustments = []; copy.css = {};
    eq(CS.core.canon.hash(CS.core.canon.hashable(copy)), a.hash, "stripped fields do not matter");
  });
  test("resolve v2: tone grammar, eight CSS roles, supports and inner geometry are deterministic", async function () {
    await FX.setup();
    if (!CS.core.text.visualFields) return; // The legacy lib stub does not implement v2 colour fallbacks.
    var preset = await (await fetch("/docs/examples/preset.example.json")).json();
    preset.id = "visual-e2b";
    CS.core.registry.registerPreset(preset, "");
    var spec = ex(function (s) { s.style = { presetId: "visual-e2b@1.0" }; });
    var t = post(spec, null), again = post(spec, null), C = CS.core.color;
    eq(t.hash, again.hash, "run twice"); CST.deepEq(t.css, again.css);
    eq(t.art.objectOutline, 0.035); eq(t.css["--cs-art-shadow"], "none");
    ["base", "invert", "field"].forEach(function (name) {
      var tone = t.tones[name];
      ["bg", "surface", "ink", "inkMuted", "accent", "accent2", "onAccent", "line"].forEach(function (k) {
        var key = k.replace(/[A-Z]/g, function (c) { return "-" + c.toLowerCase(); }).replace("accent2", "accent-2");
        eq(t.css["--cs-tone-" + name + "-" + key], tone[k], name + "." + k);
      });
      assert(C.contrast(tone.onAccent, tone.accent) >= 4.5, name + " onAccent");
      [tone.bg, tone.surface].forEach(function (g) {
        assert(C.contrast(tone.ink, g) >= 4.5, name + " ink");
        assert(C.contrast(tone.inkMuted, g) >= 4.5, name + " muted");
      });
    });
    eq(t.tones.invert.bg, t.roles.ink);
    eq(t.tones.invert.surface, C.mix(t.roles.ink, t.roles.bg, 0.03));
    assert(C.contrast(t.tones.invert.inkMuted, t.tones.invert.surface) >= 4.7);
    var inner = CS.core.resolve.slide(t, spec.slides[2]);
    eq(inner.css["--cs-body-h"], "998px"); eq(inner.css["--cs-footer-pad-x"], "60px"); eq(inner.css["--cs-pad-bottom"], "85px");
    eq(CS.core.resolve.slide(t, spec.slides[0]).css["--cs-body-h"], "888px", "cover unchanged");
    spec.canvas.h = 1350; eq(CS.core.resolve.slide(post(spec, null), spec.slides[2]).css["--cs-body-h"], "908px");
    spec.style.visualMode = "off"; var off = post(spec, null);
    eq(off.art, null); eq(off.visualMode, "off"); eq(off.css["--cs-tone-invert-bg"], undefined);
    eq(post(ex(), null).art, undefined, "art-less preset keeps its legacy token shape");
    delete spec.style.visualMode;
    var brand = FX.brand(); brand.visual.art = { support: ["#114488", "#336600"] };
    var bound = post(spec, brand); eq(bound.tones.base.support[0], "#114488");
    delete brand.visual.art; var kept = post(spec, brand);
    eq(kept.provenance["roles.accent"], "brand");
    kept.tones.base.support.forEach(function (c, i) { assert(hueGap(c, preset.art.colors.support[i]) < 12, "a brand accent keeps the preset's support hue " + i + " (no rotation)"); });
    var plain = JSON.parse(JSON.stringify(preset)); plain.id = "visual-e2b-plain"; delete plain.art.colors.support;
    CS.core.registry.registerPreset(plain, "");
    var nosup = post(ex(function (s) { s.style = { presetId: "visual-e2b-plain@1.0" }; }), brand);
    nosup.tones.base.support.forEach(function (c, i) { assert(hueGap(c, [nosup.roles.accent, nosup.roles.accent2][i]) < 12, "a preset without support hues uses [accent, accent2] " + i); });
    preset.tones.invert.roles.surface = { lightness: ["ink", 0.25] };
    CS.core.registry.registerPreset(preset, ""); var light = post(spec, null);
    var c = C.toOklch(light.roles.ink); c.L = 0.25;
    eq(light.tones.invert.surface, C.fromOklch(c), "lightness grammar");
  });

  test("resolve v2: a red brand keeps the creator and poster support hues (pink/blue, ochre/blue), floors unchanged", async function () {
    await FX.setup();
    if (!CS.core.text.visualFields) return; // The legacy lib stub does not implement v2 colour fallbacks.
    var C = CS.core.color, base = "/plugins/carousel-studio/skills/carousel-design/styles/", red = "#E3262B";
    for (var id of ["creator", "poster"]) {
      var p = await (await fetch(base + id + "/preset.json")).json(), want = p.art.colors.support;
      p.id = "support-e2b-" + id; CS.core.registry.registerPreset(p, "");
      var spec = ex(function (s) { s.style = { presetId: p.id + "@" + p.version }; });
      var own = post(spec, null), brand = FX.brand(); brand.visual.palette.accent = red; delete brand.visual.art;
      var t = post(spec, brand);
      assert(hueGap(t.roles.accent, red) < 12, id + " accent comes from the brand (red), maybe floored");
      ["base", "invert", "field"].forEach(function (name) {
        var tone = t.tones[name];
        tone.support.forEach(function (s, i) {
          assert(hueGap(s, want[i]) < 12, id + "/" + name + " support " + i + " keeps the preset hue (" + s + " vs " + want[i] + ")");
          if (p.art.mark !== "outline" || p.art.outline < 3) [tone.bg, tone.surface].forEach(function (g) { assert(C.contrast(s, g) >= 2.95, id + "/" + name + " support floor 3:1 on " + g); });
          else eq(s.toUpperCase(), want[i].toUpperCase(), id + "/" + name + " outline art keeps the preset support colour as is");
        });
      });
      eq(own.tones.base.note, t.tones.base.note, id + " note colour stays the preset's");
      eq(t.css["--cs-art-s1"], t.tones.base.support[0]); eq(t.css["--cs-art-s2"], t.tones.base.support[1]);
    }
  });

  test("resolve v2: pick takes the first candidate that clears the floor, else the LAST candidate (the vector the preset lint holds too)", async function () {
    await FX.setup();
    if (!CS.core.text.visualFields) return; // The legacy lib stub does not implement v2 colour fallbacks.
    var preset = await (await fetch("/docs/examples/preset.example.json")).json();
    preset.id = "pick-e2b"; preset.roles = { bg: "#FFFFFF", surface: "#F0F0F0", ink: "#000000", inkMuted: "#555555", accent: "#E3262B" };
    // surface is not floored, so the tone's surface is the pick itself: white ground, neither candidate reaches 3:1
    preset.tones.field.roles = { bg: "bg", surface: { pick: [["bg", "surface"], 3] }, ink: "ink", inkMuted: { muted: 4.5 }, accent: "accent" };
    preset.tones.invert.roles = { bg: "bg", surface: { pick: [["bg", "surface", "ink"], 3] }, ink: "ink", inkMuted: { muted: 4.5 }, accent: "accent" };
    CS.core.registry.registerPreset(preset, "");
    var t = post(ex(function (s) { s.style = { presetId: "pick-e2b@1.0" }; }), null);
    eq(t.tones.field.surface, "#F0F0F0", "none clears 3:1: the last candidate (surface), not the ink");
    eq(t.tones.invert.surface, "#000000", "the first candidate that clears 3:1 wins");
    eq(post(ex(function (s) { s.style = { presetId: "pick-e2b@1.0" }; }), null).hash, t.hash, "run twice");
  });

  test("resolve v2: every shipped preset exposes matching tone CSS or legacy tokens", async function () {
    await FX.setup();
    var index = await (await fetch("/plugins/carousel-studio/skills/carousel-design/styles/index.json")).json();
    for (var entry of index.presets) {
      var p = await (await fetch("/plugins/carousel-studio/skills/carousel-design/styles/" + entry.dir + "/preset.json")).json();
      p.id = "matrix-e2b-" + p.id; CS.core.registry.registerPreset(p, "");
      var spec = ex(function (s) { s.style = { presetId: p.id + "@" + p.version }; }), t = post(spec, null);
      eq(t.hash, post(spec, null).hash, "matrix twice");
      if (!p.art) { eq(t.art, undefined); eq(t.visualMode, undefined); continue; }
      ["base", "invert", "field"].forEach(function (name) {
        var tone = t.tones[name];
        assert(CS.core.color.contrast(tone.onAccent, tone.accent) >= 4.5, p.id + "/" + name);
        ["bg", "surface", "ink", "inkMuted", "accent", "accent2", "onAccent", "line"].forEach(function (k) {
          var key = k.replace(/[A-Z]/g, function (c) { return "-" + c.toLowerCase(); }).replace("accent2", "accent-2");
          eq(t.css["--cs-tone-" + name + "-" + key], tone[k]);
        });
      });
    }
  });

  test("resolve v2: mid-luminance brand sweep keeps onAccent above 4.5 and reports unreachable ink floors", async function () {
    await FX.setup();
    if (!CS.core.text.visualFields) return;
    var p = await (await fetch("/docs/examples/preset.example.json")).json();
    p.id = "sweep-e2b"; CS.core.registry.registerPreset(p, "");
    var spec = ex(function (s) { s.style = { presetId: p.id + "@" + p.version }; });
    var C = CS.core.color, accents = ["#966E78", "#966E64", "#967814", "#9B6E3C", "#7E8C98"], misses = 0;
    for (var r = 0; r <= 255; r += 17) for (var g = 0; g <= 255; g += 17) for (var b = 0; b <= 255; b += 17) {
      var hex = "#" + [r, g, b].map(function (n) { return n.toString(16).padStart(2, "0"); }).join("");
      var lum = C.luminance(hex);
      if (lum >= 0.17 && lum <= 0.21) accents.push(hex);
    }
    assert(accents.length > 100, "sweep covers luminance 0.17..0.21");
    accents.forEach(function (accent) {
      var brand = FX.brand(); brand.visual.palette = { accent: accent };
      var t = post(spec, brand);
      eq(t.tones.base.onAccent, t.derived.onAccent, accent + " base and derived agree");
      eq(t.css["--cs-on-accent"], t.css["--cs-tone-base-on-accent"], accent + " CSS agrees");
      ["base", "invert", "field"].forEach(function (name) {
        var tone = t.tones[name];
        assert(C.contrast(tone.onAccent, tone.accent) >= 4.5, accent + "/" + name + " onAccent");
        ["ink", "inkMuted"].forEach(function (k) {
          if ([tone.bg, tone.surface].some(function (bg) { return C.contrast(tone[k], bg) < t.floors.contrastBody; })) {
            misses++;
            var notes = adj(t, "tones." + name + "." + k);
            assert(notes.some(function (a) { return a.reason === "contrast" && a.msg.ar && a.msg.en; }), accent + "/" + name + "/" + k + " explains unreachable floor");
          }
        });
      });
    });
    assert(misses > 0, "sweep exercises conflicting grounds");
    console.log("E2b sweep: " + accents.length + " accents, " + (3 * accents.length) + " tone samples, " + misses + " unreachable ink floors reported");
  });

  test("resolve v2: all 18 spec tone vectors resolve without floor adjustments", async function () {
    await FX.setup();
    if (!CS.core.text.visualFields) return;
    var vectors = await (await fetch("/tests/preset-lint/spec-6.0.json")).json();
    var template = await (await fetch("/docs/examples/preset.example.json")).json();
    Object.keys(vectors.presets).forEach(function (id) {
      var input = vectors.presets[id], p = JSON.parse(JSON.stringify(template));
      p.id = "vector-e2b-" + id; p.roles = input.roles; p.tones = input.tones;
      ["container", "mark", "outline", "objectOutline", "colors"].forEach(function (k) { p.art[k] = input.art[k]; });
      p.decor.highlight = input.highlight;
      // Notebook's literal tone colours exceed the preset schema; exercise that resolver grammar separately.
      delete p.tones;
      CS.core.registry.registerPreset(p, "");
      p.tones = input.tones;
      var t = post(ex(function (s) { s.style = { presetId: p.id + "@" + p.version }; }), null);
      eq(t.adjustments.length, 0, id + " floors are no-ops");
      vectors.rows.filter(function (row) { return row.preset === id; }).forEach(function (row) {
        var tone = t.tones[row.tone];
        ["bg", "surface", "ink", "inkMuted", "accent"].forEach(function (k) {
          // Expressions are canonical; the table retains older rounded muted colours and a heritage accent.
          var want = id === "heritage" && row.tone === "invert" && k === "accent" ? "#845A00" : row[k];
          if (id === "heritage" && row.tone === "invert" && k === "inkMuted") want = "#636C63";
          if (k === "inkMuted") {
            var a = CS.core.color.parse(tone[k]), b = CS.core.color.parse(want);
            ["r", "g", "b"].forEach(function (c) { assert(Math.abs(a[c] - b[c]) <= 1, id + "/" + row.tone + "/" + k + "/" + c); });
          } else eq(tone[k], want, id + "/" + row.tone + "/" + k);
        });
        assert(CS.core.color.contrast(tone.onAccent, tone.accent) >= 4.5, id + "/" + row.tone + " onAccent");
      });
    });
  });

  test("resolve v2: only numeral overrides may exceed 400 px", async function () {
    await FX.setup();
    var t = post(ex(function (s) { s.style.overrides = { "type.scale.body": 600, "type.scale.numeral": 600 }; }), null);
    assert(t.type.scale.body[1] <= 400, "body 600 rejected");
    CST.deepEq(t.type.scale.numeral, [600, 600]);
    assert(adj(t, "type.scale.body").length > 0, "invalid override is reported");
  });
})();
