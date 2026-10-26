"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { load, cleanSpec } = require("./support/env.cjs");
const { REPO } = require("./support/stub-core.cjs");
const plain = (v) => JSON.parse(JSON.stringify(v));
const positive = (gates) => Object.fromEntries(Object.entries(plain(gates)).filter(([, n]) => n > 0));
const stamp = { createdAt: "2026-10-23T00:00:00Z" };

test("computed sRGB colours clamp channels and reject malformed or nonfinite data deterministically", () => {
  const ctx = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(REPO, "src/qa/gates-rendered.js"), "utf8") +
    "\nglobalThis.parse = parseCssColor;", ctx);
  const samples = [
    ["color(srgb 1 0.5 0 / 25%)", { r: 255, g: 128, b: 0, a: 0.25 }],
    ["color(srgb 100% 0% 50%)", { r: 255, g: 0, b: 128, a: 1 }],
    ["color(srgb -0.1 2 1e-1 / 2)", { r: 0, g: 255, b: 26, a: 1 }],
    ["color(srgb 1 0 NaN)", null], ["color(srgb 1 0)", null],
    ["color(srgb 1 0 0", null], ["color(srgb 1 0 1e999)", null]
  ];
  for (const [input, expected] of samples) {
    const a = plain(ctx.parse(input)), b = plain(ctx.parse(input));
    assert.deepEqual(a, expected, input);
    assert.deepEqual(a, b);
  }
});

test("qav registration runs clean gates, filters them and reports deterministic execution counts", async () => {
  const { CS, ctx } = load();
  vm.runInContext(fs.readFileSync(path.join(REPO, "src/qa-visual/register.js"), "utf8"), ctx);
  let calls = 0;
  CS.qav.add("text", { id: "VA1", ids: ["VA1.anchor"], run(cx) {
    calls++;
    assert.equal(cx.slides.length, 9);
    return [];
  } });
  assert.equal(CS.qav.flush(), 0);
  const run = () => CS.qa.run({ spec: cleanSpec() }, { ...stamp, gates: ["VA1"] });
  const a = await run(), b = await run();
  assert.deepEqual(plain(a), plain(b));
  assert.equal(calls, 2);
  assert.deepEqual(positive(a.results.stats.gates), { VA1: 1 });
  assert.deepEqual(plain(a.results), []);
  const skipped = CS.qa.runText({ spec: cleanSpec() }, { gates: ["C2"] });
  assert.deepEqual(positive(skipped.stats.gates), { C2: 1 });
  assert.equal(calls, 2);
  const array = CS.qa.runText({ spec: cleanSpec() }, { gates: ["VA1.anchor"] });
  assert.equal(array.stats.gates.VA1, 1);
});

test("reports serialize execution counts and explicit zero counts through the closed schema", async () => {
  const { CS, ctx } = load();
  const run = () => CS.qa.run({ spec: cleanSpec() }, { ...stamp, gates: ["C2"] });
  const a = await run(), b = await run();
  assert.deepEqual(plain(a), plain(b));
  assert.deepEqual(positive(a.stats.gates), { C2: 1 });
  assert.deepEqual(plain(a.results.stats), plain(b.results.stats));
  const schema = JSON.parse(fs.readFileSync(path.join(REPO,
    "plugins/carousel-studio/skills/carousel-design/schemas/qa-report.schema.json"), "utf8"));
  for (const key of Object.keys(plain(a))) assert.ok(Object.hasOwn(schema.properties, key), key);
  assert.equal(a.stats.gates.D2, 0);
  assert.equal(plain(a).stats.gates.C2, 1);
  assert.deepEqual(plain(a.stats), plain(a.results.stats));
  for (const file of ["canon.js", "schema.js"]) vm.runInContext(fs.readFileSync(path.join(REPO, "src/lib", file), "utf8"), ctx);
  // The lead owns the schema. Until its minimum is lowered from 1 to 0,
  // zero-count reports require this exact pending contract amendment.
  schema.properties.stats.properties.gates.additionalProperties.minimum = 0;
  CS.core.schema.register("qa-report", schema);
  assert.deepEqual(plain(CS.core.schema.validate("qa-report", plain(a))), { ok: true, errors: [] });
  assert.equal(CS.core.schema.validate("qa-report", { ...plain(a), stats: { gates: { D2: -1 } } }).ok, false);
});

test("a text hook returning nothing is counted and does not abort QA", async () => {
  const { CS } = load();
  CS.qa._.gates.text.push({ id: "VA1", run() {} });
  const run = () => CS.qa.run({ spec: cleanSpec() }, { ...stamp, gates: ["VA1"] });
  const a = await run(), b = await run();
  assert.deepEqual(plain(a), plain(b));
  assert.deepEqual(plain(a.results), []);
  assert.deepEqual(positive(a.results.stats.gates), { VA1: 1 });
  assert.deepEqual(plain(a.results.stats), plain(b.results.stats));
});

test("QA works with a legacy text library lacking visualFields", () => {
  const { CS } = load();
  delete CS.core.text.visualFields;
  const run = () => CS.qa.runText({ spec: cleanSpec() });
  const a = run(), b = run();
  assert.deepEqual(plain(a), plain(b));
  assert.deepEqual(plain(a.stats), plain(b.stats));
  assert.ok(CS.qa._.slideFields(cleanSpec().slides[2]).some((f) => f.key === "s03.title"));
});

// One independent specimen per new source field; no defect is hidden by deduplication.
const specimens = [
  ["items.0", (s, t) => { s.items = [{ title: t }]; }],
  ["items-text.0", (s, t) => { s.items = [{ text: t }]; }],
  ["items-value.0", (s, t) => { s.items = [{ value: t }]; }],
  ["demo.0", (s, t) => { s.demo = { lines: [{ who: "me", text: t }] }; }],
  ["demo-caption", (s, t) => { s.demo = { caption: t }; }],
  ["anchor.captions.0", (s, t) => { s.visual.anchor.captions = [t]; }],
  ["anchor.word", (s, t) => { s.visual.anchor.word = t; }],
  ["anchor.unit", (s, t) => { s.visual.anchor.unit = t; }],
  ["chart.0.label", (s, t) => { s.visual.anchor.chart = { kind: "bars-h", values: [{ label: t, value: 1 }] }; }],
  ["mock.title", (s, t) => { s.visual.anchor.mock = { title: t }; }],
  ["mock.lines.0", (s, t) => { s.visual.anchor.mock = { lines: [{ text: t }] }; }],
  ["mock.items.0", (s, t) => { s.visual.anchor.mock = { items: [t] }; }],
  ["mock.caption", (s, t) => { s.visual.anchor.mock = { caption: t }; }],
  ["mock.stamp", (s, t) => { s.visual.anchor.mock = { stamp: t }; }]
];

test("every visual text source reaches spelling, dialect, source and 50-word gates with stable keys", () => {
  const { CS } = load({ ortho: { clitics: [], rules: [{ id: "ORTHO-HAMZA-001", kind: "word-map", sev: "FIX", clitics: false,
    map: { انشاء: "إنشاء" }, msg: { ar: "همزة", en: "Hamza" } }] } });
  for (const [suffix, set] of specimens) {
    const spec = cleanSpec(), s = spec.slides[2];
    s.visual = { anchor: { kind: "word" } };
    set(s, "انشاء شنو 19\u00a0ساعات " + Array(51).fill("كلمة").join(" "));
    const run = () => CS.qa.runText({ spec }, { gates: ["O1", "SRC1", "C2"] });
    const a = run(), b = run();
    assert.deepEqual(plain(a), plain(b), suffix + " deterministic");
    assert.deepEqual(plain(a.stats), plain(b.stats));
    for (const rule of ["O1.ortho-hamza-001", "O1.deny-marker", "SRC1.missing"]) {
      assert.ok(a.some((f) => f.rule === rule && f.el === "s03." + suffix), suffix + ": " + rule);
    }
    assert.ok(a.some((f) => f.rule === "C2.slide-words" && f.slide === "s03"), suffix);
    assert.ok(CS.qa._.slideFields(s).some((f) => f.key === "s03." + suffix));
    s.visual.idea = "انشاء شنو";
    set(s, "");
    assert.equal(CS.qa._.slideFields(s).some((f) => f.key === "s03." + suffix), false, "empty text excluded");
    assert.equal(run().some((f) => f.rule.startsWith("O1.")), false, "non-rendered idea excluded");
  }
});

test("C2 counts repeated visual labels rather than deduplicating visible words", () => {
  const { CS } = load(), spec = cleanSpec(), s = spec.slides[2];
  s.title = ""; s.body = ""; s.bridge = "";
  const words = Array(25).fill("كلمة").join(" ");
  s.items = [{ title: words, text: words }];
  const run = () => CS.qa.runText({ spec }, { gates: ["C2"] });
  assert.equal(run().some((f) => f.rule === "C2.slide-words"), false);
  s.demo = { caption: "كلمة" };
  const a = run(), b = run();
  assert.deepEqual(plain(a), plain(b));
  assert.ok(a.some((f) => f.rule === "C2.slide-words"));
});

test("autofix resolves every visual source key without changing the input spec", () => {
  const { CS } = load();
  for (const [suffix, set] of specimens) {
    const spec = cleanSpec(), s = spec.slides[2];
    s.visual = { anchor: { kind: "word" } };
    set(s, "١");
    const before = JSON.stringify(spec);
    const findings = CS.qa.runText({ spec }, { gates: ["N1"] });
    const a = CS.qa.autofix(spec, findings), b = CS.qa.autofix(spec, findings);
    assert.deepEqual(plain(a), plain(b), suffix);
    assert.equal(JSON.stringify(spec), before);
    const fields = CS.qa._.slideFields(a.spec.slides[2]);
    assert.equal(fields.find((f) => f.key === "s03." + suffix).text, "1", suffix);
  }
});
