#!/usr/bin/env node
// tests/conformance/run_js.mjs · the JavaScript half of the JS/Python conformance run (CONTRACT 3 and 7, Appendix C item 4).
//
//   node tests/conformance/run_js.mjs [--out verdicts.js.json]
//
// Feeds one corpus to the library half of cs-core.js (src/lib), to cs-qa.js (text gates, lintText) and to cs-qa-visual.js (the gates it
// registers into CS.qa._.gates) and writes the verdicts as canonical JSON. tests/conformance/run_py.py does the same with scripts/_cs;
// `run_py.py --compare verdicts.js.json` fails when they differ, and when a gate was executed zero times.
//
// The qa-visual gates read the capabilities of the art engine (CS.visual.caps() from src/art and src/visual) and the icon data blocks
// (pack, index, concepts, stem, objects); without them VA3 skips its kind, recipe and variant checks and VA7 returns early, so the
// gates would run and find nothing. This runner loads both modules and the five blocks, and stops when they did not arrive.
//
// The corpus is every *.json under tests/conformance/corpus/ and tests/conformance/visual/ (arrays of one key are concatenated in path
// order: strings, similarityPairs, kashida, numbers, colors, mutations, slides, requireExecuted; other keys belong to other readers),
// the string, spec and brand fixtures of tests/fixtures and the zero-override decks of tests/fixtures/auto.
//  - A mutation may carry `expect`: [{gate, el | slide, rule?, sev?, absent?}], findings planted on purpose (or, with absent, clean
//    controls); `slide` names a finding that has a slide but no element key (C2.demo-missing, C2.figure-repeat).
//    This runner checks them against this engine's own unfiltered findings (an entry for a check this engine does not implement is
//    skipped); the cross-engine comparison alone sees the filtered ones. A miss exits 1 after the verdicts are written, so two engines
//    that both miss a planted defect cannot agree their way to a pass.
//  - `verdict.executed` counts, per gate, how many times the gate ran over every text-gate run. `requireExecuted` lists ids that must
//    have run (run_py.py --compare fails on a count of zero).
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SKILL = join(ROOT, "plugins/carousel-studio/skills/carousel-design");
const args = process.argv.slice(2);
const outIdx = args.indexOf("--out");
const out = outIdx >= 0 ? args[outIdx + 1] : null;

const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));

/* ---- load src/lib, src/qa, src/art, src/visual and src/qa-visual into one bare context -------------------------------- */
function loadModules(names, extra = {}) {
  const parts = [];
  const add = (m, f) => parts.push(`/* ---- file: ${m}/${f} ---- */\n` + readFileSync(join(ROOT, "src", m, f), "utf8").replace(/\r\n/g, "\n"));
  for (const m of names) for (const f of readJson(join(ROOT, "src", m, "manifest.json")).files) add(m, f);
  for (const [m, files] of Object.entries(extra)) files.forEach((f) => add(m, f)); /* single pure files of a module: spec.js */
  const sandbox = { console, TextEncoder, TextDecoder, setTimeout, clearTimeout, Intl };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(`(function () {\n"use strict";\nvar CS = (window.CS = window.CS || {});\n${parts.join("\n")}\n})();`, sandbox, { filename: "conformance" });
  return sandbox.CS;
}

const CS = loadModules(["lib", "qa", "art", "visual", "qa-visual"], { core: ["spec.js"] });
const waiting = CS.qav && CS.qav.flush ? CS.qav.flush() : 0; /* gates queued by CS.qav.add that found no hook */
if (waiting) throw new Error(`conformance: ${waiting} qa-visual gate(s) wait for a hook that never came`);
/* The data blocks of the Studio page (<script type="application/json" id="cs-icon-...">), as the node shim of CS.visual._.block reads them. */
const ICON_BLOCKS = { "cs-icon-pack": "pack", "cs-icon-index": "index", "cs-icon-concepts": "concepts", "cs-icon-stem": "stem", "cs-icon-objects": "objects" };
CS.visual._.blocks = Object.fromEntries(Object.entries(ICON_BLOCKS).map(([id, file]) => [id, readJson(join(SKILL, "data/icons", file + ".json"))]));
{ /* the gates must see real capabilities and lookup data, or VA3 and VA7 skip their checks and still count as executed */
  const caps = CS.visual.caps(), packed = Object.keys(CS.visual._.blocks["cs-icon-pack"].icons || {}).length, objects = (CS.visual._.blocks["cs-icon-objects"].objects || []).length;
  if (!caps || !caps.art || !Object.keys(caps.art).length || !caps.recipes.length || !Object.keys(caps.variants).length) throw new Error("conformance: CS.visual.caps() is empty; src/art did not load");
  if (!packed || !objects || !CS.visual.icons || !CS.visual.icons.find("كاميرا", { dialect: "eg", k: 3 }).length) throw new Error("conformance: the icon data blocks did not load");
}
const bundle = {
  qaRules: readJson(join(SKILL, "data/qa-rules.json")),
  copy: readJson(join(SKILL, "data/rules/copy.json")),
  ortho: readJson(join(SKILL, "data/rules/ortho.json")),
  dialects: Object.fromEntries(["eg", "gulf", "levant", "msa-white", "en"].map((d) => [d, readJson(join(SKILL, "data/dialects", d + ".json"))])),
  platform: readJson(join(SKILL, "data/platform-instagram.json")),
  locale: readJson(join(SKILL, "data/locale-defaults.json"))
};
CS.core.registry = { rules: () => bundle };
const QAJS = CS.qa;
const T = CS.core.text;

/* A finding is compared when both engines implement its check. qa-rules.json marks a check "deferred" for an engine until that twin
   exists (Q6 owns the Python twins of VA1, C2.demo-words ...); those findings stay out of the verdict, and the executed counts prove
   that the JavaScript gates still ran. When the flag is removed the finding joins the comparison with no change here.
   `owns(engine, gate, rule)` is the one question behind it: does this engine implement the check (a rule id that is no check id, such
   as O1.ortho-hamza-001, follows its gate)? The comparison keeps what both own; a planted `expect` is checked against what this
   engine owns, from its unfiltered findings. */
const gateOf = Object.fromEntries(bundle.qaRules.gates.map((g) => [g.id, g]));
const checkOf = {};
bundle.qaRules.gates.forEach((g) => (g.checks || []).forEach((c) => { checkOf[c.id] = c; }));
const owns = (engine, gate, rule) => {
  const g = gateOf[gate], c = checkOf[rule];
  if (!g) return false;
  const gone = (c && c.deferred && c.deferred.engines) || [];
  return ((c && c.engines) || g.engines || []).filter((e) => !gone.includes(e)).includes(engine);
};
const isShared = (f) => owns("py", f.gate, f.rule) && owns("js", f.gate, f.rule);

/* ---- corpus ------------------------------------------------------------------------------------------------------- */
const CORPUS_KEYS = ["strings", "similarityPairs", "kashida", "numbers", "colors", "mutations", "slides", "requireExecuted"];
const CORPUS_DIRS = ["corpus", "visual"];
function walkJson(dir, rel = "") {
  const here = rel ? join(dir, rel) : dir;
  if (!existsSync(here)) return [];
  const found = [];
  for (const name of readdirSync(here)) {
    const sub = rel ? rel + "/" + name : name;
    if (statSync(join(dir, sub)).isDirectory()) found.push(...walkJson(dir, sub));
    else if (name.endsWith(".json")) found.push(sub);
  }
  return found;
}
function loadCorpus() {
  const merged = Object.fromEntries(CORPUS_KEYS.map((k) => [k, []]));
  const files = CORPUS_DIRS.flatMap((d) => walkJson(join(ROOT, "tests/conformance", d)).map((f) => d + "/" + f)).sort();
  for (const f of files) {
    const doc = readJson(join(ROOT, "tests/conformance", f));
    for (const k of CORPUS_KEYS) if (Array.isArray(doc[k])) merged[k].push(...doc[k]);
  }
  const seen = new Set();
  for (const m of merged.mutations) {
    if (seen.has(m.id)) throw new Error(`conformance: mutation id ${m.id} appears twice`);
    seen.add(m.id);
    for (const e of m.expect || []) { /* an entry that names no gate would pass as a clean control for ever */
      if (!gateOf[e.gate] || (e.rule && !e.rule.startsWith(e.gate + "."))) throw new Error(`conformance: ${m.id} expects ${e.gate} ${e.rule || ""}, which is no gate or rule of qa-rules.json`);
      if (e.el === undefined && !e.slide) throw new Error(`conformance: ${m.id} expects ${e.gate} with neither el nor slide`);
    }
  }
  merged.files = files;
  return merged;
}
const corpus = loadCorpus();
const fixtures = (name) => readJson(join(ROOT, "tests/fixtures", name));
const strings = [...corpus.strings];
fixtures("bidi-strings.json").cases.forEach((c) => strings.push(c.text));
fixtures("ortho-seeded-errors.json").cases.forEach((c) => strings.push(c.text));
(fixtures("ortho-seeded-errors.json").controls || []).forEach((c) => strings.push(typeof c === "string" ? c : c.text));
const fixtureFiles = readdirSync(join(ROOT, "tests/fixtures")).filter((f) => /^(spec|brand)\..*\.json$/.test(f)).sort();
for (const f of fixtureFiles.filter((x) => x.startsWith("spec."))) {
  const spec = fixtures(f);
  for (const s of spec.slides || []) {
    for (const k of ["kicker", "headline", "sub", "title", "body", "bridge", "attribution"]) if (typeof s[k] === "string") strings.push(s[k]);
    (s.bullets || []).forEach((b) => strings.push(b));
  }
  if (spec.captionPack) for (const k of ["firstLine", "keywordLine", "body", "cta"]) if (spec.captionPack[k]) strings.push(spec.captionPack[k]);
}
corpus.slides.forEach((slide) => T.visualFields(slide).forEach((f) => strings.push(f[1]))); /* the visible additions of the visual language */
const unique = Array.from(new Set(strings));

const cps = (s, i) => Array.from(s.slice(0, i)).length; /* UTF-16 offset -> code point offset */
const verdict = {};

/* text */
verdict.text = unique.map((s) => {
  const markup = T.parseMarkup(s);
  return {
    s,
    tokens: T.tokenize(s).map((t) => [t.kind, t.text, t.start, t.end, t.ltr]),
    markup, strip: T.stripMarkup(s),
    wc: T.wordCount(s), cc: T.charCount(s), digits: T.digits.detect(s),
    toWestern: T.digits.convert(s, "western"), toIndic: T.digits.convert(s, "arabic-indic"),
    skeleton: T.skeleton(s), bind: T.bind(s),
    html: {
      "ar-w": T.toHTML(s, { digits: "western", lang: "ar" }),
      "ar-i": T.toHTML(s, { digits: "arabic-indic", lang: "ar" }),
      "en-w": T.toHTML(s, { digits: "western", lang: "en" }),
      "ar-plain": T.toHTML(s, { digits: "western", lang: "ar", markup: false, wordSpans: false }),
      "ar-base5": T.toHTML(s, { digits: "western", lang: "ar", indexBase: 5 })
    },
    hasArabic: T.arabic.hasArabic(s), hasTashkeel: T.arabic.hasTashkeel(s)
  };
});
verdict.similarity = corpus.similarityPairs.map(([a, b]) => [a, b, T.similarity(a, b)]);
verdict.kashida = corpus.kashida.map((w) => [w, T.arabic.kashida.positions(w), T.arabic.kashida.apply(w), T.arabic.kashida.apply(w, 1)]);
verdict.kashidaHtml = ["مرحبا بكم في السلام", "الإبداع يبدأ بـChatGPT"].map((s) => [s, T.toHTML(s, { kashidaWord: s.split(" ")[0], allowKashida: true })]);
verdict.counters = [[1, 8], [3, 12], [10, 12]].flatMap(([i, n]) => ["western", "arabic-indic"].flatMap((d) => ["ar", "en"].map((l) => [i, n, d, l, T.digits.counter(i, n, d, l), T.digits.remaining(n - i, d, l), T.digits.formatNumber(String(n) + ".5", d)])));
verdict.joining = [0x0621, 0x0622, 0x0627, 0x0628, 0x062F, 0x0640, 0x064E, 0x0670, 0x0679, 0x06CC, 0x06D2, 0x0750, 0x0759, 0x0041].map((c) => [c, T.arabic.joiningType(c)]);

/* the visible fields of a slide: the visual additions, the text a viewer reads in each digit system, the keyed QA fields, the word counts */
verdict.slides = corpus.slides.map((s, i) => ({
  id: s.id || "slide-" + i,
  fields: T.visualFields(s),
  text: { raw: T.slideText(s), western: T.slideText(s, "western"), indic: T.slideText(s, "arabic-indic") },
  qa: QAJS._.slideFields(s).map((f) => [f.key, f.field, f.index, f.slide, f.text]),
  counts: CS.core.spec.wordCounts(s)
}));

/* canon */
verdict.canon = { numbers: corpus.numbers.map((n) => { try { return [n, CS.core.canon.canonicalJSON(n)]; } catch (e) { return [n, "error:" + e.code]; } }), fnv: ["", "a", "foobar", "الكاروسيل", "😀"].map((s) => [s, CS.core.canon.fnv1a64(s)]) };
verdict.canon.docs = {};
for (const f of fixtureFiles) {
  const doc = fixtures(f);
  const entry = { canon: CS.core.canon.canonicalJSON(doc), hash: CS.core.canon.hash(doc) };
  if (f.startsWith("brand.")) entry.snapshot = CS.core.canon.hash(CS.core.canon.brandSnapshot(doc));
  verdict.canon.docs[f] = entry;
}

/* colour */
const C = CS.core.color;
verdict.color = corpus.colors.map(([a, b]) => ({
  a, b, parse: C.parse(a), hex: C.toHex(C.parse(a)), luminance: C.luminance(a), contrast: C.contrast(a, b), mix: C.mix(a, b, 0.3), mix55: C.mix(a, b, 0.55),
  on: C.onColor(a), oklch: C.toOklch(a), round: C.fromOklch(C.toOklch(a)),
  ensure45: C.ensureContrast(a, b, 4.5), ensure3: C.ensureContrast(a, b, 3)
}));

/* patch */
const P = CS.core.patch;
const base = fixtures("spec.eg.8slides.json");
const edited = JSON.parse(JSON.stringify(base));
edited.slides[2].title = "عنوان جديد";
edited.slides.splice(4, 1);
edited.slides.push({ id: "s09", n: 8, type: "share", headline: "ابعتها لصاحبك" });
edited.captionPack.hashtags = ["#أ"];
edited.meta.updatedBy = "studio";
delete edited.compat;
edited.rev = 2;
const ops = P.diff(base, edited);
verdict.patch = { ops, roundTrip: CS.core.canon.hash(P.apply(base, ops)), target: CS.core.canon.hash(edited), envelope: P.envelope(base, ops.slice(0, 2)), conflict: (() => { try { P.apply(edited, [{ op: "test", path: "/rev", value: 1 }]); return "applied"; } catch (e) { return e.code; } })() };

/* schema: the examples, every fixture, and broken copies */
const SCHEMA_KINDS = ["brand", "spec", "preset", "occasion", "hook", "plan", "qa-report"];
for (const k of SCHEMA_KINDS) CS.core.schema.register(k, readJson(join(SKILL, "schemas", k + ".schema.json")));
const schemaDocs = [];
for (const k of SCHEMA_KINDS) schemaDocs.push([k, `docs/examples/${k}.example.json`, readJson(join(ROOT, "docs/examples", k + ".example.json"))]);
for (const f of fixtureFiles) schemaDocs.push([f.startsWith("spec.") ? "spec" : "brand", "tests/fixtures/" + f, fixtures(f)]);
verdict.schema = schemaDocs.map(([kind, file, doc]) => {
  const broken = JSON.parse(JSON.stringify(doc));
  broken.zzUnknown = 1;
  if (typeof broken.id === "string") broken.id = "BAD ID";
  if (broken.slides && broken.slides[0]) { broken.slides[0].type = "nope"; broken.slides[0].headline = 5; }
  if (broken.rev !== undefined) broken.rev = 0;
  delete broken.brand;
  return { kind, file, ok: CS.core.schema.validate(kind, doc), broken: CS.core.schema.validate(kind, broken) };
});

/* lint */
const lintOpts = (dialect) => ({ bundle, dialect, digits: "western" });
verdict.lint = {};
for (const dialect of ["eg", "gulf", "levant", "msa-white", "en"]) {
  verdict.lint[dialect] = unique.map((s) => QAJS.lintText(s, lintOpts(dialect)).map((it) => [it.rule, it.sev, it.confidence, cps(s, it.start), cps(s, it.end), it.original, it.fix === undefined ? null : it.fix, it.autofix, it.kind, it.entry || null]));
}
verdict.lintIndic = unique.map((s) => QAJS.lintText(s, { bundle, dialect: "msa-white", digits: "arabic-indic" }).map((it) => [it.rule, cps(s, it.start), cps(s, it.end), it.fix === undefined ? null : it.fix]));

/* QA text gates over the fixtures, the mutations and the zero-override decks; every run adds to the executed counts */
const brandBy = (name) => (name ? fixtures(name) : null);
const flat = (results) => results.map((r) => [r.gate, r.rule, r.sev, r.slide || null, r.el || null, r.msg.ar, r.msg.en, r.fix ? r.fix.ar : null, r.fix ? r.fix.en : null, !!r.overridden]);
const executed = {};
const runText = (input, opts) => {
  const results = QAJS.runText(input, opts);
  for (const [id, n] of Object.entries(results.stats.gates)) executed[id] = (executed[id] || 0) + n;
  return results;
};
verdict.qa = {};
const missed = [];
for (const m of corpus.mutations) {
  const spec = P.apply(fixtures(m.base), m.patch);
  const brand = m.brand && m.brandPatch ? P.apply(brandBy(m.brand), m.brandPatch) : brandBy(m.brand);
  const input = { spec, brand, history: m.history ? { history: m.history } : undefined };
  const found = runText(input, {}); /* everything this engine found; only the comparison below sees the shared part */
  const results = found.filter(isShared);
  verdict.qa[m.id] = { results: flat(results), summary: QAJS.summarize(results) };
  verdict.qa[m.id + ":fast"] = { results: flat(runText(input, { fast: true }).filter(isShared)), summary: null };
  for (const e of m.expect || []) {
    if (!owns("js", e.gate, e.rule)) continue; /* a check only Python implements (C5.voice-drift) is Python's to find */
    const hit = found.some((r) => r.gate === e.gate && (e.el === undefined || r.el === e.el) && (!e.slide || r.slide === e.slide) && (!e.rule || r.rule === e.rule) && (!e.sev || r.sev === e.sev));
    if (hit === !!e.absent) missed.push(`${m.id}: ${e.absent ? "unexpected" : "missing"} ${e.gate} at ${e.el ?? e.slide}${e.rule ? " (" + e.rule + ")" : ""}`);
  }
}
verdict.auto = {};
const autoDir = join(ROOT, "tests/fixtures/auto");
if (existsSync(join(autoDir, "manifest.json"))) {
  const files = readJson(join(autoDir, "manifest.json")).files || {};
  for (const stem of Object.keys(files).sort()) {
    if (!existsSync(join(autoDir, files[stem].file))) continue;
    readJson(join(autoDir, files[stem].file)).forEach((spec, i) => {
      verdict.auto[stem + "-" + i] = { results: flat(runText({ spec, brand: null }, {}).filter(isShared)), summary: null };
    });
  }
}
verdict.executed = executed;
verdict.requireExecuted = corpus.requireExecuted;

const sortKeys = (v) => (Array.isArray(v) ? v.map(sortKeys) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])])) : v === -0 ? 0 : v);
const text = JSON.stringify(sortKeys(verdict), null, 1) + "\n";
if (out) {
  writeFileSync(out, text, "utf8");
  console.log(`wrote ${out} (${(text.length / 1024).toFixed(0)} KiB): ${unique.length} strings, ${corpus.mutations.length} mutations, ${corpus.slides.length} slides, ${Object.keys(verdict.auto).length} decks, ${Object.keys(executed).length} gates executed, ${corpus.files.length} corpus files`);
} else process.stdout.write(text);
if (missed.length) {
  console.error(`conformance: ${missed.length} planted finding(s) not as expected in the JavaScript engine`);
  missed.forEach((m) => console.error("  " + m));
  process.exitCode = 1;
}
