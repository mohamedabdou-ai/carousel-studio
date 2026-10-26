import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { loadLib, readJson } from "./load-lib.mjs";

const { text } = loadLib().core;
const plain = (v) => JSON.parse(JSON.stringify(v));
const slide = {
  type: "grid", title: "Title", items: [{ title: "Item", text: "Text", value: "2,500" }],
  demo: { lines: [{ who: "ignored", text: "Demo" }], caption: "Caption" },
  visual: { idea: "ignored", why: "ignored", alt: "ignored", anchor: {
    captions: ["Label"], word: "Word", unit: "Unit", chart: { values: [{ label: "Chart", value: 99 }] },
    mock: { title: "Mock", lines: [{ text: "Line" }], items: ["Choice"], caption: "Note", stamp: "Stamp" }
  } }
};

test("visual text: stable order, canonical keys and exclusion of instructions and numeric data", () => {
  const expected = [
    ["items.0", "Item"], ["items-text.0", "Text"], ["items-value.0", "2,500"],
    ["demo.0", "Demo"], ["demo-caption", "Caption"], ["anchor.captions.0", "Label"],
    ["anchor.word", "Word"], ["anchor.unit", "Unit"], ["chart.0.label", "Chart"],
    ["mock.title", "Mock"], ["mock.lines.0", "Line"], ["mock.items.0", "Choice"],
    ["mock.caption", "Note"], ["mock.stamp", "Stamp"]
  ];
  for (let i = 0; i < 2; i++) {
    assert.deepEqual(plain(text.visualFields(slide)), expected);
    assert.deepEqual(plain(text.slideText(slide)), ["Title", ...expected.map((f) => f[1])]);
  }
  assert.deepEqual(plain(text.slideText({ ...slide, type: "quote", body: "Quote" })), ["Quote", ...expected.map((f) => f[1])]);
});

test("visual text: grouped numbers form one isolate, bind their noun and retain existing NBSP", () => {
  const source = "2,500 خطوة";
  const rendered = text.toHTML(source);
  assert.equal(rendered, text.toHTML(source));
  assert.equal((rendered.match(/<bdi dir="ltr"/g) || []).length, 1);
  assert.match(rendered, />2,500<\/bdi><\/span>\u00a0/);
  assert.equal(text.bind(source), "2,500\u00a0خطوة");
  assert.equal(text.toHTML("2,500\u00a0خطوة"), rendered);
  assert.deepEqual(plain(text.slideText({ items: [{ value: "2,500" }] }, "arabic-indic")), ["٢٬٥٠٠"]);
});

function engine() {
  const CS = loadLib({ coreFiles: ["registry.js", "resolve.js", "fit.js", "freeze.js", "spec.js"], document: { fonts: null } });
  const root = "plugins/carousel-studio/skills/carousel-design/";
  CS.core.registry.registerRules({ platform: readJson(root + "data/platform-instagram.json"), locale: readJson(root + "data/locale-defaults.json") });
  CS.core.registry.registerFonts({ registry: readJson(root + "fonts/registry.json"), coverage: readJson(root + "fonts/coverage.json") });
  CS.core.registry.registerPreset(readJson("docs/examples/preset.example.json"), "");
  return CS;
}

test("resolve v2 without a browser: grammar, tone floors, CSS equality, inner geometry and off", () => {
  const { core } = engine(), spec = readJson("docs/examples/spec.example.json");
  const p = readJson("docs/examples/preset.example.json"); spec.style = { presetId: p.id + "@" + p.version };
  const t = core.resolve.post(spec, null), again = core.resolve.post(spec, null), C = core.color;
  assert.equal(t.hash, again.hash); assert.deepEqual(plain(t.css), plain(again.css));
  for (const name of ["base", "invert", "field"]) {
    const tone = t.tones[name];
    for (const k of ["bg", "surface", "ink", "inkMuted", "accent", "accent2", "onAccent", "line"]) {
      const css = k.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase()).replace("accent2", "accent-2");
      assert.equal(t.css["--cs-tone-" + name + "-" + css], tone[k]);
    }
    assert.ok(C.contrast(tone.onAccent, tone.accent) >= 4.5);
    for (const bg of [tone.bg, tone.surface]) {
      assert.ok(C.contrast(tone.ink, bg) >= 4.5, name + " ink");
      assert.ok(C.contrast(tone.inkMuted, bg) >= 4.5, name + " muted");
    }
  }
  assert.equal(t.tones.invert.surface, C.mix(t.roles.ink, t.roles.bg, 0.03));
  assert.ok(C.contrast(t.tones.invert.inkMuted, t.tones.invert.surface) >= 4.7);
  assert.equal(core.resolve.slide(t, { type: "item" }).css["--cs-body-h"], "998px");
  assert.equal(core.resolve.slide(t, { type: "item" }).css["--cs-footer-pad-x"], "60px");
  assert.equal(core.resolve.slide(t, { type: "cover" }).css["--cs-body-h"], "888px");
  for (const h of [1440, 1350]) {
    const g = core.registry.geometry(h, { inner: true, padEnd: 48 });
    assert.equal(g.footer.y, 1275 + h - 1440); assert.equal(g.zone.h, 950 + h - 1440);
    assert.deepEqual(plain(g), plain(core.registry.geometry(h, { inner: true, padEnd: 48 })));
  }
  spec.style.visualMode = "off"; const off = core.resolve.post(spec, null);
  assert.equal(off.art, null); assert.equal(off.visualMode, "off"); assert.equal(off.css["--cs-tone-invert-bg"], undefined);
});

test("resolve v2 without a browser: lightness, brand supports and all shipped presets", () => {
  const { core } = engine(), spec = readJson("docs/examples/spec.example.json"), C = core.color;
  const p = readJson("docs/examples/preset.example.json");
  p.tones.invert.roles.surface = { lightness: ["ink", 0.25] }; core.registry.registerPreset(p, "");
  spec.style = { presetId: p.id + "@" + p.version };
  const t = core.resolve.post(spec, null), lch = C.toOklch(t.roles.ink); lch.L = 0.25;
  assert.equal(t.tones.invert.surface, C.fromOklch(lch));
  const brand = readJson("docs/examples/brand.example.json"); brand.visual.art = { support: ["#114488", "#336600"] };
  assert.equal(core.resolve.post(spec, brand).tones.base.support[0], "#114488");
  delete brand.visual.art;
  // Round 3 keeps the preset support hues unless the brand explicitly supplies them.
  assert.deepEqual(plain(core.resolve.post(spec, brand).tones.base.support), plain(t.tones.base.support));
  brand.visual.palette.accent = "#FFFF00";
  const yellow = core.resolve.post(spec, brand);
  assert.ok(C.contrast(yellow.tones.base.accent, yellow.tones.base.bg) >= 3, "unoutlined graphic boundary");
  const root = "plugins/carousel-studio/skills/carousel-design/styles/";
  for (const entry of readJson(root + "index.json").presets) {
    const preset = readJson(root + entry.dir + "/preset.json"); core.registry.registerPreset(preset, "");
    spec.style = { presetId: preset.id + "@" + preset.version };
    const a = core.resolve.post(spec, null); assert.equal(a.hash, core.resolve.post(spec, null).hash);
    // Legacy presets retain their golden token shape; only art presets add these fields.
    if (!preset.art) { assert.equal(a.art, undefined); assert.equal(a.visualMode, undefined); continue; }
    for (const tone of Object.values(a.tones)) assert.ok(C.contrast(tone.onAccent, tone.accent) >= 4.5);
  }
});

test("resolve regression: legacy presets keep golden tokens and the original footer", () => {
  const { core } = engine(), spec = readJson("tools/examples/showcase.spec.json");
  const root = "plugins/carousel-studio/skills/carousel-design/styles/";
  const golden = readJson("tests/golden/manifest.json"), brand = readJson("tests/fixtures/brand.eg.creator.json");
  delete brand.visual.palette; delete brand.visual.fonts;
  for (const entry of readJson(root + "index.json").presets) {
    const preset = readJson(root + entry.dir + "/preset.json");
    if (preset.art) continue;
    core.registry.registerPreset(preset, ""); spec.style = { presetId: preset.id + "@" + preset.version };
    const t = core.resolve.post(spec, brand);
    assert.equal(createHash("sha256").update(t.hash).digest("hex").slice(0, 16), golden.presets[preset.id].tokens, preset.id);
    for (const type of ["testimonial", "offer", "share", "cta"]) {
      const inner = core.resolve.slide(t, { type, overrides: { "layout.align": "start" } });
      assert.equal(inner.css["--cs-pad-bottom"], "195px", preset.id + "/" + type);
      assert.equal(inner.css["--cs-body-h"], "888px");
      assert.equal(inner.css["--cs-footer-pad-x"], undefined);
    }
  }
});

test("resolve v2 regression: mid-luminance brand accents keep tone and base onAccent consistent", () => {
  const { core } = engine(), spec = readJson("docs/examples/spec.example.json"), C = core.color;
  const p = readJson("docs/examples/preset.example.json"); spec.style = { presetId: p.id + "@" + p.version };
  const accents = ["#966E78", "#966E64", "#967814", "#9B6E3C", "#7E8C98"];
  for (let r = 0; r <= 255; r += 17) for (let g = 0; g <= 255; g += 17) for (let b = 0; b <= 255; b += 17) {
    const hex = "#" + [r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("");
    if (C.luminance(hex) >= 0.17 && C.luminance(hex) <= 0.21) accents.push(hex);
  }
  let misses = 0;
  for (const accent of accents) {
    const brand = readJson("docs/examples/brand.example.json"); brand.visual.palette = { accent };
    const t = core.resolve.post(spec, brand);
    assert.equal(t.tones.base.onAccent, t.derived.onAccent, accent);
    assert.equal(t.css["--cs-on-accent"], t.css["--cs-tone-base-on-accent"], accent);
    for (const [name, tone] of Object.entries(t.tones)) {
      assert.ok(C.contrast(tone.onAccent, tone.accent) >= 4.5, accent + "/" + name);
      for (const k of ["ink", "inkMuted"]) if ([tone.bg, tone.surface].some((bg) => C.contrast(tone[k], bg) < t.floors.contrastBody)) {
        misses++;
        assert.ok(t.adjustments.some((a) => a.path === "tones." + name + "." + k && a.reason === "contrast" && a.msg.ar && a.msg.en));
      }
    }
  }
  assert.ok(accents.length > 100 && misses > 0);
  console.log(`E2b sweep: ${accents.length} accents, ${3 * accents.length} tones, ${misses} unreachable ink floors reported`);
});

test("resolve v2 regression: 18 executable spec tone vectors need no floor adjustments", () => {
  const { core } = engine(), spec = readJson("docs/examples/spec.example.json"), vectors = readJson("tests/preset-lint/spec-6.0.json");
  for (const [id, input] of Object.entries(vectors.presets)) {
    const p = readJson("docs/examples/preset.example.json");
    p.id = "vector-" + id; p.roles = input.roles; p.tones = input.tones;
    for (const k of ["container", "mark", "outline", "objectOutline", "colors"]) p.art[k] = input.art[k];
    p.decor.highlight = input.highlight;
    core.registry.registerPreset(p, ""); spec.style = { presetId: p.id + "@" + p.version };
    const t = core.resolve.post(spec, null);
    assert.equal(t.adjustments.length, 0, id);
    for (const row of vectors.rows.filter((row) => row.preset === id)) for (const k of ["bg", "surface", "ink", "inkMuted", "accent"]) {
      // Executable expressions are canonical; the table retains older rounded muted colours and a heritage accent.
      let want = id === "heritage" && row.tone === "invert" && k === "accent" ? "#845A00" : row[k];
      if (id === "heritage" && row.tone === "invert" && k === "inkMuted") want = "#636C63";
      if (k === "inkMuted") {
        const a = core.color.parse(t.tones[row.tone][k]), b = core.color.parse(want);
        for (const c of ["r", "g", "b"]) assert.ok(Math.abs(a[c] - b[c]) <= 1, id + "/" + row.tone + "/" + k);
      } else assert.equal(t.tones[row.tone][k], want, id + "/" + row.tone + "/" + k);
    }
  }
});

test("resolve v2 regression: numeral alone can override above 400 px; zone padding ignores inherited names", () => {
  const { core } = engine(), spec = readJson("docs/examples/spec.example.json");
  spec.style.overrides = { "type.scale.body": 600, "type.scale.numeral": 600 };
  const t = core.resolve.post(spec, null);
  assert.ok(t.type.scale.body[1] <= 400); assert.deepEqual(plain(t.type.scale.numeral), [600, 600]);
  for (const h of [1440, 1350]) {
    for (const id of ["swiss", "constructor", "toString", "__proto__"]) assert.equal(core.registry.geometry(h, { presetId: id, type: "poster" }).zone.h, 888 + h - 1440);
    for (const id of ["poster", "heritage"]) assert.equal(core.registry.geometry(h, { presetId: id, type: "poster" }).zone.h, 864 + h - 1440);
    assert.equal(core.registry.geometry(h, { inner: true, presetId: "poster" }).zone.h, 950 + h - 1440);
  }
});

test("freeze v2 without a browser: canonical keys, 520 px, state copies and visual hash invalidation", () => {
  const CS = engine(), { core } = CS, spec = readJson("docs/examples/spec.example.json");
  spec.slides[2] = { id: "s03", n: 3, ...slide }; const s = spec.slides[2];
  for (const [key, value] of core.text.visualFields(s)) assert.equal(core.freeze.expectedText(spec, s.id + "." + key), value);
  assert.equal(core.spec.wordCounts(s).total, 15);
  CS.visual = { expected: (_s, key) => key.endsWith(".art.0") ? "Word" : null };
  assert.equal(core.freeze.expectedText(spec, s.id + ".art.0"), "Word");
  const tokens = core.resolve.post(spec, null), F = core.freeze;
  for (const key of ["visual", "items", "demo"]) {
    const changed = structuredClone(spec); delete changed.slides[2][key];
    assert.notEqual(F.tokensHash(tokens, changed), F.tokensHash(tokens, spec), key);
  }
  F.visual.set(s.id, { anchor: { w: 852, h: 620, x: 114, y: 261, owner: true } });
  F.visual.set(s.id, { marks: Array.from({ length: 9 }, () => ({ id: "underline" })) });
  const state = F.visual.get(s.id); state.anchor.w = 1;
  assert.equal(F.visual.get(s.id).anchor.w, 852); assert.equal(F.visual.get(s.id).marks[0].id, "underline");
  const el = { getAttribute: (k) => k === "data-cs-slide" ? s.id : null };
  const label = { style: { fontSize: "520px" }, getAttribute: () => null, querySelector: () => null };
  core.compose = { slots: () => [{ key: s.id + ".art.0", el: label }] };
  const frozen = F.capture([{ id: s.id, el }], spec, tokens);
  assert.equal(frozen.sizes[s.id + ".art.0"], 520); assert.deepEqual(plain(frozen.visual.anchors[s.id]), { w: 852, h: 620 });
  assert.equal(frozen.visual.marks[s.id].length, 8);
  core.schema.register("spec", readJson("plugins/carousel-studio/skills/carousel-design/schemas/spec.schema.json"));
  const valid = readJson("docs/examples/spec.example.json"); valid.frozen = frozen;
  const result = core.schema.validate("spec", valid); assert.ok(result.ok, JSON.stringify(result.errors));
  const second = F.capture([{ id: s.id, el }], spec, tokens); delete second.approvedAt;
  const first = plain(frozen); delete first.approvedAt; assert.deepEqual(first, plain(second));
  label.style.fontSize = "200px"; F.apply(el, frozen); assert.equal(label.style.fontSize, "520px");
  F.apply(el, frozen); assert.equal(label.style.fontSize, "520px");
  const noArt = { ...frozen }; delete noArt.visual; F.apply(el, noArt);
  assert.equal(F.capture([{ id: s.id, el }], spec, tokens).visual, undefined, "new deck reusing ids inherits no marks or anchors");
  const calls = []; CS.visual.expected = (_spec, key) => { calls.push(key); throw new Error("missing art builder"); };
  assert.equal(F.expectedText(spec, "s03.title"), slide.title); assert.equal(calls.length, 0);
  assert.equal(F.expectedText(spec, "s03.art.0"), null); assert.deepEqual(calls, ["s03.art.0"]);
  assert.deepEqual(plain(core.fit.rangeFor("numeral", tokens)), { min: 280, max: 520 });
  assert.equal(core.fit.floorPx("numeral", tokens), 200);
  assert.equal(F.tokensHash(tokens, spec), F.tokensHash(tokens, spec));
});
