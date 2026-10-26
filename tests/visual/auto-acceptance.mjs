#!/usr/bin/env node
// tests/visual/auto-acceptance.mjs · acceptance of the AUTO path (spec 5.9 as amended by build plan r2 3.2 V2): the floor of the product, measured on decks with zero overrides.
//
//   node tests/visual/auto-acceptance.mjs [--plan-only] [--out DIR] [--presets own|creator,poster] [--decks DIR] [--caps FILE] [--data FILE] [--json]
//
// Decks: tests/fixtures/auto/*.json (X1/X2: a spec, an array of specs, or {decks: [...]}) when they exist, else the base fixtures tests/fixtures/spec.*.json plus the rich
// planner decks of tests/visual/expected/decks. Capabilities: the slice of the wave-2 plan unless --caps names a JSON file. Tables: the shipped art-direction block unless --data names a JSON file (to try an amended table before it lands). --plan-only writes each planned spec to
// DIR/<deck>.<preset>.json (so SK/scripts/render.mjs can render it) and still prints the gates. Exit status 1 when a gate fails.
//
// Gates (per deck unless noted): at least 3 anchor kinds on a deck of 4 or more planned slides; no run of 3 equal kinds (demo slides break the run); never two icon or scene anchors in a row; at least
// 40 percent of the non-peak anchors are neither an icon nor a scene; zero VA1 (a planned slide that is not a pause and not a grid or timeline has an anchor); a demo-bearing
// slide is offered a mock candidate (before the fit pass) when caps hold one for its type; every visual validates against the spec schema; two runs are byte-equal;
// across decks: relax 0 on at least 90 percent of them and never above 4.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { EXPECTED, ROOT, SLICE, apply, boot, clone, decks as richDecks, preset, readJson, specSchema, visualErrors } from "./expected/support.mjs";

const args = process.argv.slice(2), flag = (n) => args.includes(n), opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
if (flag("--help") || flag("-h")) { console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").filter((l) => l.startsWith("//")).map((l) => l.slice(3)).join("\n")); process.exit(0); }

const presets = opt("--presets", "own").split(",");
const caps = opt("--caps") ? readJson(resolve(opt("--caps"))) : SLICE, data = opt("--data") ? readJson(resolve(opt("--data"))) : undefined;
const out = opt("--out") ? resolve(opt("--out")) : null;
const CS = boot(), V = CS.visual;
const schema = specSchema(), P = {}, presetOf = (id) => P[id] || (P[id] = preset(id)), ownId = (deck) => String(deck.style?.presetId || "creator").split("@")[0];

function load() {
  const dir = resolve(opt("--decks", join(ROOT, "tests", "fixtures", "auto"))), found = [];
  if (existsSync(dir)) {
    for (const f of readdirSync(dir).filter((n) => n.endsWith(".json") && n !== "manifest.json").sort()) {
      const j = readJson(join(dir, f)), list = Array.isArray(j) ? j : j.decks || [j];
      list.forEach((d, i) => found.push([`${f.replace(/\.json$/, "")}-${i}`, d]));
    }
  }
  if (found.length) return { source: dir, decks: found };
  const fixtures = readdirSync(join(ROOT, "tests", "fixtures")).filter((f) => /^spec\..*\.json$/.test(f) && f !== "spec.eg.single.json" && f !== "spec.eg.angle-stub.json").sort();
  return { source: "tests/fixtures/spec.*.json + tests/visual/expected/decks (tests/fixtures/auto has not landed)", decks: [...fixtures.map((f) => [f.replace(/^spec\.|\.json$/g, ""), readJson(join(ROOT, "tests", "fixtures", f))]), ...Object.entries(richDecks())] };
}

const { source, decks } = load();
const results = [], failures = [], capture = { Fs: null, ch: null };
const PL = V._.pl, run0 = PL.run;
PL.run = function (Fs, X) { const ch = run0.call(this, Fs, X); capture.Fs = Fs; capture.ch = ch; capture.X = X; return ch; };
const kindRun = (a, n) => a.some((x, i) => i >= n - 1 && a.slice(i - n + 1, i + 1).every((y) => y === x));

for (const [name, deck] of decks) for (const pid of presets.map((p) => (p === "own" ? ownId(deck) : p))) {
  const spec = clone(deck);
  for (const s of spec.slides) delete s.visual;                         // zero overrides: the floor
  const plan = V.plan(spec, null, presetOf(pid), null, { caps, data }), offered = new Set(capture.Fs.filter((F) => PL.cands(F, capture.X).some((c) => c.kind === "mock")).map((F) => F.id)), again = V.plan(spec, null, presetOf(pid), null, { caps, data });
  const types = Object.fromEntries(spec.slides.map((s) => [s.id, s]));
  const sl = plan.slides, ks = sl.map((s) => s.visual.anchor.kind), relax = Math.max(0, ...sl.map((s) => s.visual.relax || 0));
  const peak = new Set((data || V._.block("cs-art-direction")).rhythm.hard.H8.types), nonPeak = sl.filter((s) => !peak.has(types[s.id].type) && s.visual.anchor.kind !== "none");
  const own = (s) => s.visual.anchor.kind === "none" && /^(?:grid|timeline)$/.test(types[s.id].type);
  const iconish = (k) => k === "icon" || k === "scene";
  const g = [];
  const gate = (id, ok, note = "") => { g.push({ id, ok, note }); if (!ok) failures.push(`${name} ${pid}: ${id} ${note}`); };
  gate("kinds>=3", sl.length < 4 || new Set(ks.filter((k) => k !== "none")).size >= 3, [...new Set(ks)].join(","));
  const rhythmKinds = sl.map((s, i) => types[s.id].demo?.lines?.length ? `demo:${s.id}` : ks[i]);
  gate("no-run-of-3", !kindRun(rhythmKinds, 3), ks.join(","));
  gate("no-two-icons", !ks.some((k, i) => i && iconish(k) && iconish(ks[i - 1])), ks.join(","));
  gate("non-icon>=40%", !nonPeak.length || nonPeak.filter((s) => !iconish(s.visual.anchor.kind)).length * 100 >= 40 * nonPeak.length, `${nonPeak.filter((s) => !iconish(s.visual.anchor.kind)).length}/${nonPeak.length}`);
  gate("VA1", sl.every((s) => s.visual.pause || own(s) || s.visual.anchor.kind !== "none"), sl.filter((s) => !s.visual.pause && !own(s) && s.visual.anchor.kind === "none").map((s) => s.id).join(","));
  const D = (data || V._.block("cs-art-direction")).anchorTable.types, possible = (t) => (D[t]?.candidates || []).some((c) => c.kind === "mock" && c.needs.some((n) => n === "demo" || n === "mockwords") && caps.art.mock?.includes(c.sub) && (!caps.recipes || caps.recipes.includes(c.recipe)));
  const miss = spec.slides.filter((s) => s.demo?.lines?.length && !s.media?.assetId && possible(s.type) && !offered.has(s.id)).map((s) => s.id);
  gate("demo-mock", !miss.length, miss.join(","));
  gate("schema", sl.every((s) => !visualErrors(s.visual, schema).length), sl.flatMap((s) => visualErrors(s.visual, schema)).slice(0, 2).join("; "));
  gate("deterministic", JSON.stringify(plan) === JSON.stringify(again));
  results.push({ name, pid, slides: sl.length, kinds: ks, relax, relaxed: sl.filter((s) => s.visual.relax).map((s) => `${s.id}:${s.visual.relax}`), gates: g, notes: plan.notes.map((n) => n.code + (n.level ? n.level : "")) });
  if (out) { mkdirSync(out, { recursive: true }); writeFileSync(join(out, `${name}.${pid}.json`), JSON.stringify(apply(spec, plan), null, 2) + "\n", "utf8"); }
}

const zero = results.filter((r) => r.relax === 0).length;
if (zero * 100 < 90 * results.length) failures.push(`relax 0 on ${zero} of ${results.length} decks (need 90 percent)`);
if (results.some((r) => r.relax > 4)) failures.push(`relax above 4: ${results.filter((r) => r.relax > 4).map((r) => `${r.name} ${r.pid} (${r.relax})`).join(", ")}`);

if (flag("--json")) console.log(JSON.stringify({ source, results, failures }, null, 2));
else {
  console.log(`decks: ${source}\ncaps: ${opt("--caps") || "the wave-2 slice"}   tables: ${opt("--data") || "shipped"}   presets: ${presets.join(", ")}\n`);
  for (const r of results) console.log(`${r.name.padEnd(28)} ${r.pid.padEnd(8)} ${String(r.slides).padStart(2)} slides  relax ${r.relax}${r.relaxed.length ? ` (${r.relaxed.join(" ")})` : ""}  ${r.gates.every((x) => x.ok) ? "ok  " : "FAIL"}  ${r.kinds.join(" ")}${r.notes.length ? "   [" + r.notes.join(" ") + "]" : ""}`);
  console.log(`\nrelax 0 on ${zero} of ${results.length}; ${failures.length ? failures.length + " failure(s):\n  " + failures.join("\n  ") : "every gate holds"}`);
}
process.exit(failures.length ? 1 : 0);
