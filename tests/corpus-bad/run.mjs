#!/usr/bin/env node
// tests/corpus-bad/run.mjs · the JavaScript half of the defect and clean corpora (draft 13.2, CONTRACT Appendix C; round 3 package Q7a).
//
//   node tests/corpus-bad/run.mjs [--only ID] [--list] [--baseline] [--text-only] [--png DIR] [--floor]
//
// corpus-bad/defects.json    one broken post per case: a fixture spec plus a JSON patch that plants a defect, and the findings the text gates
//                            MUST report for it (100% recall: a missed rule fails the run).
// corpus-bad/rendered.json   eight planted visual defects (spec 7.6): the spec-scope ones (R5 six-row list, R7 chart without source) are judged here by
//                            the text gates of cs-qa and cs-qa-visual in a vm; the rendered ones (R1-R4, R6, R8) are judged by rendered.mjs in Chromium.
// corpus-clean/posts.json    posts that are written correctly: the text gates must report no BLOCK on any of them (zero false BLOCKs); every
//                            FIX or NOTE they do report is printed so a noisy rule shows up.
// corpus-clean/slice.json    four clean slice decks (zero-override fixtures plus a stored plan): no BLOCK and no FIX from the text gates here, and the
//                            same, plus every rendered gate, in rendered.mjs.
// Every gate of `requireExecuted` (build plan r2 3.2) must have run: a gate that never ran proves nothing (r2 1.1 row 10). The eight planted defects, the four
// clean slice decks and the required gates are fixed lists held in fixed.mjs (run.py keeps a copy): the corpus files are checked against them, so a case
// cannot disappear by being deleted from the JSON. The Python half is run.py (same corpora, scripts/_cs). Both must pass. After the text part this script runs rendered.mjs (a headless
// Chromium; --text-only skips it, --png and --floor are passed on to it).
// Exit code 0 = pass, 1 = a defect was missed, a clean post or deck was flagged, a gate never ran.
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { checkCorpusShape } from "./fixed.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SKILL = join(ROOT, "plugins/carousel-studio/skills/carousel-design");
const args = process.argv.slice(2);
const opt = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : null);
const only = opt("--only");
const readJson = (p) => JSON.parse(readFileSync(p, "utf8").replace(/^﻿/, ""));

/* cs-core's library half, cs-qa, the planner and art chunks (VA3 reads the capabilities) and cs-qa-visual, as one bare context. Same load as
   tests/conformance/run_js.mjs; the icon and art-direction data blocks are given the way plan.mjs gives them, so VA3, VA7 and VA8 really check names. */
function loadModules(names, extra = {}) {
  const parts = [];
  const add = (m, f) => parts.push(`/* ---- file: ${m}/${f} ---- */\n` + readFileSync(join(ROOT, "src", m, f), "utf8").replace(/\r\n/g, "\n"));
  for (const m of names) for (const f of readJson(join(ROOT, "src", m, "manifest.json")).files) add(m, f);
  for (const [m, files] of Object.entries(extra)) files.forEach((f) => add(m, f));
  const sandbox = { console, TextEncoder, TextDecoder, setTimeout, clearTimeout, Intl };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(`(function () {\n"use strict";\nvar CS = (window.CS = window.CS || {});\n${parts.join("\n")}\n})();`, sandbox, { filename: "corpus" });
  return sandbox.CS;
}

const CS = loadModules(["lib", "qa", "art", "visual", "qa-visual"], { core: ["spec.js"] });
const waiting = CS.qav && CS.qav.flush ? CS.qav.flush() : 0;
if (waiting) throw new Error(`corpus: ${waiting} qa-visual gate(s) wait for a hook that never came`);
const BLOCKS = { "cs-icon-pack": "icons/pack.json", "cs-icon-index": "icons/index.json", "cs-icon-concepts": "icons/concepts.json", "cs-icon-objects": "icons/objects.json", "cs-icon-stem": "icons/stem.json", "cs-art-direction": "art-direction.json" };
CS.visual._.blocks = Object.fromEntries(Object.entries(BLOCKS).map(([id, f]) => [id, readJson(join(SKILL, "data", f))]));
const bundle = {
  qaRules: readJson(join(SKILL, "data/qa-rules.json")),
  copy: readJson(join(SKILL, "data/rules/copy.json")),
  ortho: readJson(join(SKILL, "data/rules/ortho.json")),
  dialects: Object.fromEntries(["eg", "gulf", "levant", "msa-white", "en"].map((d) => [d, readJson(join(SKILL, "data/dialects", d + ".json"))])),
  platform: readJson(join(SKILL, "data/platform-instagram.json")),
  locale: readJson(join(SKILL, "data/locale-defaults.json"))
};
CS.core.registry = { rules: () => bundle };

/** A bare name is a file of tests/fixtures; a path with a slash is relative to the repository root; "#n" picks element n of an array file. */
const fixture = (ref) => {
  const [name, index] = ref.split("#");
  const doc = readJson(name.includes("/") ? join(ROOT, name) : join(ROOT, "tests/fixtures", name));
  return index === undefined ? doc : doc[Number(index)];
};
const BAD = readJson(join(ROOT, "tests/corpus-bad/defects.json")).cases;
const CLEAN = readJson(join(ROOT, "tests/corpus-clean/posts.json")).posts;
const RENDERED = readJson(join(ROOT, "tests/corpus-bad/rendered.json"));
const SLICE = readJson(join(ROOT, "tests/corpus-clean/slice.json"));
const executed = {};   // gate or check id -> times it ran over every text run of this script

function run(spec, brand, c = {}) {
  const ctx = { spec, brand, history: c.history ? { history: c.history } : undefined, familyLimits: c.familyLimits || null };
  const r = CS.qa.runText(ctx, c.fast ? { fast: true } : {});
  for (const [id, n] of Object.entries(r.stats.gates)) executed[id] = (executed[id] || 0) + n;
  return r.filter((x) => !x.overridden);
}
function findings(c) {
  const spec = CS.core.patch.apply(fixture(c.base), c.patch || []);
  const brand = c.brand ? CS.core.patch.apply(fixture(c.brand), c.brandPatch || []) : null;
  return run(spec, brand, c);
}
const sliceSpec = (d, extra = []) => CS.core.patch.apply(fixture(d.base), [...d.patch, ...extra]);
const sliceBrand = (d) => (d.brand ? fixture(d.brand) : null);

const label = (r) => r.rule + (r.slide ? "@" + r.slide : "");
let failed = 0;
const fail = (msg) => { failed++; console.error(msg); };

if (args.includes("--baseline")) {
  for (const c of [...BAD, ...CLEAN]) { if (only && c.id !== only) continue; console.log(c.id + ": " + findings(c).map((r) => r.sev[0] + ":" + label(r)).join(" ")); }
  process.exit(0);
}
if (args.includes("--list")) {
  console.log(`${BAD.length} defect cases, ${CLEAN.length} clean posts, ${RENDERED.cases.length} planted visual defects (${RENDERED.cases.filter((c) => c.scope === "spec").length} spec-scope), ${SLICE.decks.length} clean slice decks`);
  process.exit(0);
}

/* ---- defects: every expected rule must fire -------------------------------------------------------------------- */
let missed = 0, expectedTotal = 0;
for (const c of BAD) {
  if (only && c.id !== only) continue;
  const got = findings(c), have = new Set(got.map(label)), haveRules = new Set(got.map((r) => r.rule));
  for (const want of c.expect) {
    expectedTotal++;
    if (!(want.includes("@") ? have.has(want) : haveRules.has(want))) { missed++; fail(`MISSED ${c.id}: expected ${want}, got ${got.map(label).join(", ") || "nothing"}`); }
  }
}
console.log(`corpus-bad (js): ${BAD.length} cases, ${expectedTotal - missed} of ${expectedTotal} expected findings reported`);

/* ---- planted visual defects, spec scope (the rendered ones are rendered.mjs's) ----------------------------------- */
{
  for (const problem of checkCorpusShape(RENDERED, SLICE)) fail(problem);   // the fixed eight, the fixed four decks, the fixed gates; also in --only runs
  let found = 0, wanted = 0;
  for (const c of RENDERED.cases.filter((x) => x.scope === "spec")) {
    if (only && c.id !== only) continue;
    const deck = SLICE.decks.find((d) => d.id === c.deck);
    if (!deck) { fail(`${c.id}: deck ${c.deck} is not in corpus-clean/slice.json`); continue; }
    const got = run(sliceSpec(deck, c.patch || []), sliceBrand(deck), c);
    for (const w of c.expect) {
      wanted++;
      const hit = got.find((r) => r.rule === w.rule && r.sev === w.sev && (!w.slide || r.slide === w.slide));
      if (hit) found++; else fail(`MISSED ${c.id}: expected ${w.sev} ${w.rule}${w.slide ? "@" + w.slide : ""}, got ${got.filter((r) => r.slide === c.slide).map((r) => r.sev[0] + ":" + label(r)).join(", ") || "nothing"}`);
      if (!(executed[w.rule] > 0)) fail(`NOT EXECUTED ${c.id}: ${w.rule} ran 0 times`);
    }
  }
  console.log(`corpus-bad planted (js): ${RENDERED.cases.filter((c) => c.scope === "spec").length} spec-scope defects of ${RENDERED.cases.length}, ${found} of ${wanted} expected findings reported`);
}

/* ---- clean posts: no BLOCK ----------------------------------------------------------------------------------------- */
let blocked = 0, notes = 0, unplanned = 0;   // a text post carries no stored plan, so VA1 notes "unplanned" on every inner slide; counted apart
for (const c of CLEAN) {
  if (only && c.id !== only) continue;
  const got = findings(c);
  const blocks = got.filter((r) => r.sev === "BLOCK");
  unplanned += got.filter((r) => r.rule === "VA1.anchor-present" && r.sev === "NOTE").length;
  notes += got.length - blocks.length;
  if (blocks.length) { blocked++; fail(`FALSE BLOCK ${c.id}: ${blocks.map(label).join(", ")}`); }
}
console.log(`corpus-clean (js): ${CLEAN.length} posts, ${blocked} blocked, ${notes - unplanned} lesser findings (and ${unplanned} VA1 unplanned notes)`);

/* ---- clean slice decks: no BLOCK and no FIX ------------------------------------------------------------------------ */
let flagged = 0, sliceNotes = 0;
for (const d of SLICE.decks) {
  if (only && d.id !== only) continue;
  const got = run(sliceSpec(d), sliceBrand(d), d), bad = got.filter((r) => r.sev === "BLOCK" || r.sev === "FIX");
  sliceNotes += got.length - bad.length;
  if (bad.length) { flagged++; fail(`FALSE ${bad[0].sev} ${d.id}: ${bad.map(label).join(", ")}`); }
}
console.log(`corpus-clean slice (js): ${SLICE.decks.length} decks, ${flagged} flagged, ${sliceNotes} notes`);

/* ---- every required gate exists, and the text ones ran ---------------------------------------------------------- */
if (!only) {
  const textIds = new Set(CS.qa._.gates.text.map((g) => g.id)), renderedIds = new Set(CS.qa._.gates.rendered.map((g) => g.id));
  const unknown = SLICE.requireExecuted.filter((id) => !textIds.has(id) && !renderedIds.has(id));
  if (unknown.length) fail(`requireExecuted names gates that are not registered: ${unknown.join(", ")}`);
  const never = SLICE.requireExecuted.filter((id) => textIds.has(id) && !(executed[id] > 0));
  if (never.length) fail(`gates executed 0 times over the corpora: ${never.join(", ")}`);
  console.log(`executed (js): ${SLICE.requireExecuted.filter((id) => textIds.has(id)).length} text gates of the slice ran at least once; ${SLICE.requireExecuted.filter((id) => renderedIds.has(id)).length} rendered gates are counted by rendered.mjs`);
}

/* ---- the rendered half, in Chromium -------------------------------------------------------------------------------- */
const names = new Set([...SLICE.decks.map((d) => d.id), ...RENDERED.cases.filter((c) => c.scope === "rendered").map((c) => c.id)]);
if (!args.includes("--text-only") && (!only || names.has(only))) {
  const { runRenderedCorpus } = await import("./rendered.mjs");
  const r = await runRenderedCorpus({ only, png: opt("--png"), floor: args.includes("--floor"), shape: false });
  for (const l of r.lines) console.log(l);
  for (const p of r.problems) fail(p);
  console.log(`corpus rendered (chromium): ${r.problems.length ? r.problems.length + " problem(s)" : "every planted defect found, every clean deck clean, every required gate executed"}`);
}
process.exit(failed ? 1 : 0);
