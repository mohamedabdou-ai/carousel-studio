/* Q4 acceptance: real QA runner + a private build; portable vectors for Q6 live in TEMP. */
import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const temp = path.join(os.tmpdir(), "cs-r3", "Q4");
const build = spawnSync(process.execPath, ["tools/build.mjs", "--module", "qa", "--module", "qa-visual", "--module", "art", "--out", temp], { cwd: root, encoding: "utf8" });
assert.equal(build.status, 0, build.stdout + build.stderr);
process.env.CS_QA_CHUNK = path.join(temp, "cs-qa.js");
const require = createRequire(import.meta.url);
const { load } = require("../qa/support/env.cjs");
const copy = (v) => JSON.parse(JSON.stringify(v));
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
const data = (f) => JSON.parse(read("plugins/carousel-studio/skills/carousel-design/data/" + f));
const blocks = { "cs-icon-pack": data("icons/pack.json"), "cs-icon-index": data("icons/index.json"), "cs-icon-objects": data("icons/objects.json") };
function capabilities(CS, ctx) {
  for (const file of ["src/lib/canon.js", "src/visual/root.js"]) vm.runInContext(read(file), ctx);
  vm.runInContext(fs.readFileSync(path.join(temp, "cs-art.js"), "utf8"), ctx);
  vm.runInContext(read("src/visual/api.js"), ctx);
  CS.visual._.blocks = blocks;
}
const capEnv = load(); capabilities(capEnv.CS, capEnv.ctx);
const caps = copy(capEnv.CS.visual.caps());
function slide(i = 2, extra = {}) { return { id: "s" + String(i).padStart(2, "0"), n: i, type: "item", title: "فكرة واضحة", visual: { anchor: { kind: "word", word: "فكرة" }, recipe: "under", tone: "base" }, ...extra }; }
function spec(slides = [slide()]) { return { id: "post-q4-test", format: "carousel", locale: { dialect: "eg", appLanguage: "ar" }, style: {}, sources: [], slides }; }
function env(stage = 0) {
  const { CS, ctx, bundle } = load();
  bundle.platform.plugin.visual.rollout.stage = stage;
  capabilities(CS, ctx);
  assert.deepEqual(copy(CS.visual.caps()), caps);
  vm.runInContext(fs.readFileSync(path.join(temp, "cs-qa-visual.js"), "utf8"), ctx);
  return { CS, ctx, bundle };
}
const vectors = [];
function vector(CS, s, id, label, extra = {}, overrides = {}) {
  const result = run(CS, s, id, extra);
  vectors.push({ id, label, spec: copy(s), ...copy(extra), ...overrides, expected: copy(result) });
  return result;
}
function run(CS, s, id, extra = {}) {
  const input = { spec: s, ...extra }, before = JSON.stringify(input);
  const a = CS.qa.runText(input, { gates: [id] }), b = CS.qa.runText(input, { gates: [id] });
  assert.deepEqual(copy(a), copy(b), "same input, same findings");
  assert.deepEqual(copy(a.stats), copy(b.stats), "same execution counts");
  assert.equal(JSON.stringify(input), before, "QA must not mutate its input");
  assert.equal(a.stats.gates[id], 1, "a clean gate must still execute");
  return a.filter((f) => f.rule === id);
}
function pair(id, pass, fail, setup) {
  test(id + ": passing/failing vectors, stable verdicts and counters", () => {
    const { CS } = env(); const extra = setup?.(CS) || {};
    for (const [label, s, expected] of [["pass", pass, false], ["fail", fail, true]]) {
      const results = vector(CS, s, id, label, extra);
      assert.equal(results.length > 0, expected, label + ": " + JSON.stringify(results));
    }
  });
}
const changed = (f) => { const s = spec(); f(s.slides[0], s); return s; };
const words = (n) => Array(n).fill("كلمة").join(" ");
const chart = (illustrative = false) => ({ kind: "chart", chart: { kind: "bars-h", values: [{ label: "الأولى", value: 30 }], illustrative } });

pair("VA1.anchor-present", spec(), changed((s) => { s.visual.anchor.kind = "none"; }));
pair("VA3.valid", spec(), changed((s) => { s.visual.recipe = "half"; }));
test("VA3.valid counts item rows and still rejects excess row icons", () => {
  const { CS } = env();
  const s = spec([slide(2, { type: "grid", variant: "bento", items: [{ title: "One" }, { title: "Two" }, { title: "Three" }], visual: { anchor: { kind: "none" }, recipe: "full", tone: "base", rowIcons: ["circle", "circle", "circle"] } })]);
  assert.equal(run(CS, s, "VA3.valid").length, 0);
  s.slides[0].visual.rowIcons.push("circle");
  assert.ok(run(CS, s, "VA3.valid").some(f => f.detail === "row icon count" || f.vars?.detail === "row icon count" || f.el === "s02.rowIcons"));
});
pair("VA4.chart-honesty", changed((s, p) => { s.visual.anchor = chart(); s.sourceIds = ["source1"]; p.sources = [{ id: "source1", kind: "ownData" }]; }), changed((s) => { s.visual.anchor = chart(); }));
pair("VA6.pause", spec(), spec([slide(2, { visual: { pause: true } }), slide(3, { type: "cta" })]));
pair("VA7.agreement", changed((s) => { s.visual.anchor = { kind: "icon", icon: "camera" }; }), changed((s) => { s.visual.anchor = { kind: "icon", icon: "face-grinning" }; }), (CS) => {
  CS.visual.icons = { find: () => [{ name: "camera" }], concepts: () => [{ neg: true }] };
  return { lookup: { candidates: [{ name: "camera" }], concepts: [{ neg: true }] } };
});
pair("VA8.constraints", spec(), changed((s) => { s.visual.anchor = { kind: "icon", icon: "cs-camel" }; }), (CS) => {
  return { brand: { visual: { art: { constraints: { animals: "none" } } } } };
});
pair("D8.anchor-run", spec([slide(2), slide(3)]), spec([slide(2), slide(3), slide(4)]));
pair("D8.tone-run", spec(), spec([2, 3, 4].map((i) => slide(i, { visual: { anchor: { kind: "word" }, tone: "field" } }))));
pair("D10.glyph-icon", spec(), changed((s) => { s.items = [{ title: "اختيار ✓" }]; }));
pair("C2.body-with-art", changed((s) => { s.visual.anchor = { kind: "mock", mock: { kind: "notes" } }; s.body = words(15); }), changed((s) => { s.visual.anchor = { kind: "mock", mock: { kind: "notes" } }; s.body = words(16); }));
pair("C2.demo-words", changed((s) => { s.demo = { lines: [{ text: words(12) }] }; }), changed((s) => { s.demo = { lines: [{ text: words(13) }] }; }));
pair("C2.demo-missing", changed((s) => { s.type = "step"; s.demo = { lines: [{ text: "مثال جديد" }] }; }), changed((s) => { s.type = "step"; }));
pair("C2.demo-duplicate", changed((s) => { s.body = "ألف باء"; s.demo = { lines: [{ text: "ألف جيم" }] }; }), changed((s) => { s.body = "ألف باء"; s.demo = { lines: [{ text: "ألف باء جيم" }] }; }));
pair("C2.figure-repeat", changed((s) => { s.title = "28/30"; s.visual.anchor = { kind: "numeral", value: "28/30" }; }), changed((s) => { s.title = "28/30"; s.body = "٢٨/٣٠"; s.visual.anchor = { kind: "numeral", value: "28/30" }; }));

test("stored plans only: unplanned, pause, cover, user media, and visualMode off", () => {
  const { CS } = env();
  CS.visual.plan = () => assert.fail("QA must never plan");
  const s = changed((s) => { delete s.visual; });
  assert.equal(run(CS, s, "VA1.anchor-present")[0].sev, "NOTE");
  for (const edit of [(s) => { s.visual = { pause: true }; }, (s) => { s.type = "cover"; }, (s) => { s.media = { assetId: "mine" }; }]) {
    const p = copy(s); edit(p.slides[0]); assert.equal(run(CS, p, "VA1.anchor-present").length, 0);
  }
  s.style.visualMode = "off"; assert.equal(run(CS, s, "VA1.anchor-present").length, 0);
});
test("rollout caps VA1 and D8, honours disabled BLOCK; stage 1 restores severity", () => {
  const s = spec([2, 3, 4].map((i) => slide(i, { visual: { anchor: { kind: "none" } } })));
  for (const stage of [0, 1]) {
    const { CS, bundle } = env(stage);
    let a = run(CS, s, "VA1.anchor-present");
    assert.ok(a.every((f) => f.sev === (stage ? "FIX" : "NOTE")));
    assert.equal(a[0].prospect, stage ? undefined : true);
    bundle.platform.plugin.visual.block.anchorRun.enabled = true;
    // loadRules caches resolved platform references by identity.
    bundle.platform = copy(bundle.platform);
    a = run(CS, s, "VA1.anchor-present"); assert.ok(a.some((f) => f.sev === (stage ? "BLOCK" : "NOTE")));
  }
});
test("VA3 validates every canonical sub, stored variant, name, count, span and demo", () => {
  const { CS } = env();
  const mutations = [
    (s) => { s.visual.anchor = { kind: "scene", template: "trio" }; },
    (s) => { s.visual.anchor = { kind: "mock", mock: { kind: "poll" } }; },
    (s) => { s.visual.anchor = { kind: "numeral", companion: "ring" }; },
    (s) => { s.visual.anchor = { kind: "word", wordStyle: "hollow" }; },
    (s) => { s.visual.anchor = { kind: "pattern", pattern: "stripes" }; },
    (s) => { s.variant = "missing"; }, (s) => { s.visual.anchor.icon = "missing-icon"; },
    (s) => { s.visual.anchor.object = "missing-object"; }, (s) => { s.visual.rowIcons = ["camera"]; },
    (s) => { s.type = "grid"; s.items = [{ title: "واحد" }]; },
    (s) => { s.type = "timeline"; s.items = []; },
    (s) => { s.type = "grid"; s.variant = "bento"; s.items = Array(5).fill({ title: "بطاقة" }); },
    (s) => { s.type = "timeline"; s.variant = "rail"; s.items = Array(5).fill({ title: "محطة" }); },
    (s) => { s.visual.rowIcons = Array(6).fill("camera"); s.bullets = Array(6).fill("سطر"); },
    (s) => { s.visual.span = { with: "s09", kind: "band" }; },
    (s) => { s.demo = { lines: [{ text: "ا".repeat(91) }] }; },
    (s) => { s.visual.anchor = chart(); s.visual.anchor.chart.values = []; },
    (s) => { s.visual.anchor = chart(); s.visual.anchor.chart.values[0].value = -1; },
    (s) => { s.visual.anchor = { kind: "rows" }; s.bullets = Array(6).fill("سطر"); }
  ];
  for (const [i, m] of mutations.entries()) assert.ok(vector(CS, changed(m), "VA3.valid", "mutation-" + i).length, String(m));
  for (const a of [{ kind: "word" }, { kind: "icon", icon: "camera" }, { kind: "rows" }, { kind: "field", word: "فكرة" }, { kind: "numeral", value: "7" }]) assert.deepEqual(copy(run(CS, changed((s) => { s.visual.anchor = a; }), "VA3.valid")), []);
  assert.equal(run(CS, spec([slide(2, { visual: { span: { with: "s03" }, anchor: { kind: "word" } } }), slide(3)]), "VA3.valid").length, 0);
  delete CS.visual.caps;
  assert.equal(vector(CS, spec([slide(2), slide(3)]), "VA3.valid", "caps-unavailable-clean", {}, { caps: null }).length, 0);
  assert.ok(vector(CS, changed((s) => { s.visual.span = { with: "s99" }; }), "VA3.valid", "caps-unavailable-span", {}, { caps: null }).length);
  delete CS.visual;
  assert.equal(vector(CS, spec(), "VA3.valid", "visual-module-absent", {}, { caps: null }).length, 0);
});
test("VA3 real caps preserve the engine vocabulary and reject unbuilt variants", () => {
  const { CS } = env();
  const templates = read("plugins/carousel-studio/skills/carousel-design/templates/archetypes.html");
  // Every actual archetype variant is a stored-plan input, including 1.0 names absent from caps.
  for (const m of templates.matchAll(/<template\b[^>]*data-archetype="([^"]+)"[^>]*data-variants="([^"]+)"/g)) {
    for (const variant of m[2].split(/\s+/)) {
      const p = changed((s) => { s.type = m[1]; s.variant = variant; if (/^(grid|timeline)$/.test(s.type)) s.items = Array(3).fill({ title: "Item" }); });
      assert.equal(vector(CS, p, "VA3.valid", m[1] + ":" + variant).length, 0, m[1] + ":" + variant);
    }
  }
  for (const [type, variant] of [["grid", "tiles"], ["checklist", "icons"], ["checklist", "hub"], ["quote", "bubble"], ["story-beat", "scene"], ["share", "chat"], ["testimonial", "review"], ["item", "missing"], ["cta", "columns"]]) {
    const p = changed((s) => { s.type = type; s.variant = variant; if (type === "grid") s.items = Array(3).fill({ title: "Item" }); });
    const r = vector(CS, p, "VA3.valid", "unsupported-" + type + ":" + variant);
    assert.equal(r.length, 1); assert.equal(r[0].el, "s02.variant"); assert.equal(r[0].sev, "FIX");
  }
  for (const anchor of [{ kind: "word", wordStyle: "struck" }, { kind: "numeral", companion: "bar" }, { kind: "numeral", companion: "icon", icon: "camera" }]) {
    assert.equal(vector(CS, changed((s) => { s.visual.anchor = anchor; }), "VA3.valid", JSON.stringify(anchor)).length, 0);
  }
});

test("VA3 donut percentage arithmetic is exact for tiny, large and boundary values", () => {
  const { CS } = env(); CS.visual.caps = () => ({ ...copy(caps), art: { ...caps.art, chart: ["donut"] } });
  for (const [values, invalid] of [[[19, 21], false], [[1.9e-308, 2.1e-308], false], [[1e-300, 1.1e-300], true], [[1e300, 1.1e300], true], [[0, 0], true]]) {
    const p = changed((s) => { s.visual.anchor = { kind: "chart", chart: { kind: "donut", values: values.map((value) => ({ label: "جزء", value })) } }; });
    assert.equal(vector(CS, p, "VA3.valid", "donut-" + values.join("-"), {}, { caps: copy(CS.visual.caps()) }).length > 0, invalid, String(values));
  }
});
test("VA4 source checks and predicted tags: rendered visibility remains Q3a responsibility", () => {
  const { CS } = env(); const p = changed((s) => { s.visual.anchor = chart(true); });
  delete CS.art.chart.proof;
  assert.equal(run(CS, p, "VA4.chart-honesty")[0].sev, "FIX");
  p.slides[0].body = "رسم توضيحي"; assert.equal(run(CS, p, "VA4.chart-honesty").length, 0);
  delete p.slides[0].body;
  CS.art.chart = { proof: () => assert.fail("Spec QA must defer generated-tag visibility to Q3a") };
  assert.equal(run(CS, p, "VA4.chart-honesty").length, 0);
  p.slides[0].visual.anchor.chart.illustrative = false; p.slides[0].sourceIds = ["missing"];
  assert.equal(run(CS, p, "VA4.chart-honesty")[0].sev, "BLOCK");
});
test("D8 emits once per maximal identical or alternating run and breaks at unplanned slides", () => {
  const { CS } = env(); const ss = Array.from({ length: 8 }, (_, i) => slide(i + 2));
  assert.equal(run(CS, spec(ss), "D8.anchor-run").length, 1);
  ss.forEach((s, i) => { s.visual.recipe = i % 2 ? "over" : "under"; });
  assert.equal(run(CS, spec(ss), "D8.anchor-run").length, 1);
  delete ss[3].visual; assert.equal(run(CS, spec(ss), "D8.anchor-run").length, 0);
});
test("D8 tone share uses world bias and excludes the cover", () => {
  const { CS } = env(); const p = spec([slide(1, { type: "cover" }), ...[2, 3, 4, 5, 6].map((i) => slide(i))]);
  p.slides[1].visual.tone = "field"; p.style.world = { toneBias: "calm" };
  assert.equal(run(CS, p, "D8.tone-run").length, 0);
  p.slides[3].visual.tone = "invert"; assert.equal(run(CS, p, "D8.tone-run").length, 1);
  p.style.world.toneBias = "drenched"; assert.equal(run(CS, p, "D8.tone-run").length, 0);
});
test("VA6 pause quota, adjacency, CTA boundary and 12-word statement", () => {
  const { CS } = env(); const p = spec([2, 3, 4, 5, 6].map((i) => slide(i)));
  p.slides[0].visual.pause = true; assert.equal(run(CS, p, "VA6.pause").length, 0);
  p.slides[0].variant = "statement"; p.slides[0].title = words(13);
  assert.ok(run(CS, p, "VA6.pause").length);
  p.slides[0].title = "وقفة"; p.slides[1].visual.pause = true;
  assert.ok(run(CS, p, "VA6.pause").length >= 2);
});
test("VA7 manual note permits an unusual pick but never cheerful/negative disagreement", () => {
  const { CS } = env(); CS.visual.icons = { find: () => [], concepts: () => [{ neg: true }] };
  const p = changed((s) => { s.visual.anchor = { kind: "icon", icon: "camera" }; });
  assert.equal(run(CS, p, "VA7.agreement")[0].sev, "NOTE");
  p.slides[0].visual.why = "اختيار مقصود"; assert.equal(run(CS, p, "VA7.agreement").length, 0);
  p.slides[0].visual.anchor.icon = "face-grinning"; assert.equal(run(CS, p, "VA7.agreement")[0].sev, "FIX");
});

test('VA7 rejects the cheerful names shipped in the real pack on negative copy', () => {
  const { CS } = env();
  CS.visual.icons = { find: () => [], concepts: () => [{ pol: 'neg' }] };
  for (const icon of ['face-grinning', 'face-slightly-smiling', 'face-slightly-smiling-plus', 'party-popper', 'thumbs-up']) {
    assert.ok(Object.hasOwn(blocks['cs-icon-pack'].icons, icon), icon);
    const p = changed(s => { s.visual.anchor = { kind: 'icon', icon }; s.visual.why = 'اختيار مقصود'; });
    assert.equal(run(CS, p, 'VA7.agreement')[0].sev, 'FIX', icon);
  }
});

test('VA6 statement words exclude bridge, attribution and CTA', () => {
  const { CS } = env();
  const p = changed(s => { s.variant = 'statement'; s.title = words(8); s.sub = words(3); s.bridge = words(3); s.attribution = words(4); s.cta = { text: words(3) }; });
  assert.equal(run(CS, p, 'VA6.pause').length, 0);
  p.slides[0].sub = words(5);
  assert.ok(run(CS, p, 'VA6.pause').some(f => f.msg.en.includes('statement words')));
});

test('D8 detects a flat planned deck, counts both non-base tones and honours rollout', () => {
  for (const stage of [0, 1]) {
    const { CS } = env(stage), p = spec([2, 3, 4, 5, 6, 7].map(i => slide(i)));
    const f = run(CS, p, 'D8.tone-flat');
    assert.equal(f.length, 1);
    assert.equal(f[0].sev, stage ? 'FIX' : 'NOTE');
    p.slides[0].visual.tone = 'invert'; p.slides[1].visual.tone = 'field';
    assert.equal(run(CS, p, 'D8.tone-flat').length, 0);
    p.style.visualMode = 'off'; p.slides[0].visual.tone = 'base'; p.slides[1].visual.tone = 'base';
    assert.equal(run(CS, p, 'D8.tone-flat').length, 0);
  }
});
test("VA8 checks objects, row and chart icons, and scene supports", () => {
  const { CS } = env(); const brand = { visual: { art: { constraints: { figures: "none", animals: "none", music: "none", maps: "none" } } } };
  for (const m of [(s) => { s.visual.anchor.object = "cs-camel"; }, (s) => { s.visual.rowIcons = ["music"]; }, (s) => { s.visual.anchor = { kind: "scene", icons: ["cs-person-hijab"] }; }, (s) => { s.visual.anchor = chart(); s.visual.anchor.chart.values[0].icon = "map"; }]) {
    const r = vector(CS, changed(m), "VA8.constraints", String(m), { brand }); assert.ok(r.length); assert.ok(r.every((f) => f.sev === "BLOCK"));
  }
  brand.visual.art.constraints.figures = "faceless";
  assert.equal(vector(CS, changed((s) => { s.visual.anchor.icon = "cs-person-hijab"; }), "VA8.constraints", "faceless-clean", { brand }).length, 0);
});
test("glyphs and emoji cover new fields while ordinary punctuation remains allowed", () => {
  const { CS } = env();
  for (const m of [(s) => { s.demo = { lines: [{ text: "→" }] }; }, (s) => { s.visual.anchor.word = "⭐"; }, (s) => { s.items = [{ title: "🚀" }]; }, (s) => { s.body = "🇦🇪"; }, (s) => { s.body = "1️⃣"; }]) assert.ok(run(CS, changed(m), "D10.glyph-icon").length);
  for (const t of ["نسبة 30%، وسؤال؟", "Acme ™ tool", "© 2026", "Brand ®", "A <-> B", '<span class="cs-emoji">🚀</span>']) assert.equal(vector(CS, changed((s) => { s.body = t; }), "D10.glyph-icon", "clean-" + t).length, 0);
  // Arrows remain icon glyphs under D10, including U+2194..U+2199.
  for (const text of ["↔", "↕", "↖", "↗", "↘", "↙"]) assert.equal(vector(CS, changed((s) => { s.body = text; }), "D10.glyph-icon", "arrow-" + text).length, 1);
});
test("demo character limits, required keyword CTA and exact duplicate boundary", () => {
  const { CS } = env();
  for (const demo of [{ lines: Array(4).fill({ text: "سطر" }) }, { lines: [{ text: "ا".repeat(91) }] }, { caption: "ا".repeat(61) }, { caption: words(9) }]) assert.ok(run(CS, changed((s) => { s.demo = demo; }), "C2.demo-words").length);
  assert.ok(run(CS, changed((s) => { s.type = "cta"; s.cta = { kind: "keyword-dm" }; }), "C2.demo-missing").length);
  assert.equal(run(CS, changed((s) => { s.type = "cta"; s.cta = { kind: "save" }; }), "C2.demo-missing").length, 0);
});
test("figure repetition folds digit systems, grouping and decimals and includes new fields", () => {
  const { CS } = env();
  const p = changed((s) => { s.title = "2,500"; s.items = [{ title: "٢٬٥٠٠" }]; s.visual.anchor.value = "2500"; });
  const r = run(CS, p, "C2.figure-repeat"); assert.equal(r[0].sev, "NOTE"); assert.match(r[0].msg.en, /2500.*3/);
});
test("family/subcheck filters register once and VA5/RX1 remain deferred", () => {
  const { CS } = env(); const p = spec();
  const regs = CS.qa._.gates.text.map((g) => g.id);
  assert.equal(regs.filter((id) => id === "VA3.valid").length, 1);
  assert.equal(regs.some((id) => /VA5|RX1/.test(id)), false);
  const r = CS.qa.runText({ spec: p }, { gates: ["VA3"] }); assert.equal(r.stats.gates["VA3.valid"], 1);
  assert.ok(!r.some((f) => f.rule.startsWith("VA1")));
});
test("all new checks execute on a clean plan; findings satisfy E1's closed schema and Q4's budget", () => {
  const { CS, ctx } = env(); const p = changed((s) => { s.visual.anchor = { kind: "none" }; s.body = "✓ 7 7 7"; });
  const ids = CS.qa._.gates.text.map((g) => g.id).filter((id) => /^(VA|D8\.|D10\.glyph|C2\.)/.test(id));
  const check = () => CS.qa.runText({ spec: p }, { gates: ids });
  const a = check(), b = check(); assert.deepEqual(copy(a), copy(b)); assert.deepEqual(copy(a.stats), copy(b.stats));
  for (const id of ids) assert.equal(a.stats.gates[id], 1, id);
  for (const file of ["canon", "schema"]) vm.runInContext(read("src/lib/" + file + ".js"), ctx);
  const schema = JSON.parse(read("plugins/carousel-studio/skills/carousel-design/schemas/spec.schema.json"));
  CS.core.schema.register("q4-results", { type: "array", items: { $ref: "#/$defs/qaResult" }, $defs: schema.$defs });
  assert.deepEqual(copy(CS.core.schema.validate("q4-results", copy(a))), { ok: true, errors: [] });
  // Q4 file budget: 10 KiB in the plan, raised to 11 KiB when C2.word-echo got its JavaScript check at round-3 close (the chunk ceiling of cs-qa-visual is unchanged).
  assert.ok(Buffer.byteLength(read("src/qa-visual/spec-gates.js")) <= 11 * 1024, "Q4 exceeds 11 KiB");
});
after(() => {
  const file = path.join(temp, "spec-gates-vectors.json");
  const payload = JSON.stringify({ v: 1, caps, vectors }, null, 2) + "\n";
  fs.writeFileSync(file, payload, "utf8");
  assert.equal(fs.readFileSync(file, "utf8"), payload);
  console.log("Q4 vectors: " + file + " (" + vectors.length + ")");
});
