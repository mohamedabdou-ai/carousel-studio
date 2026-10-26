#!/usr/bin/env node
// tests/fixtures/auto/extract.mjs · print one zero-override fixture deck, list the set, or check and refresh its manifest.
// (Round 3, package X2; spec 5.9: the planner's floor is measured on decks that carry no `visual` and no `style.world`.)
//
//   node tests/fixtures/auto/extract.mjs <file-stem> <index> [--types item,stat,step,checklist,cta]    print one spec as JSON
//   node tests/fixtures/auto/extract.mjs <deck-id> [--types ...]                                       the same, with an id such as gulf-0
//   node tests/fixtures/auto/extract.mjs --list [--format text|json]                                   the decks of manifest.json
//   node tests/fixtures/auto/extract.mjs --check [--strict] [--format text|json]                       manifest and files agree, decks are clean
//   node tests/fixtures/auto/extract.mjs --write-manifest                                              refresh the derived fields of manifest.json
//   node tests/fixtures/auto/extract.mjs --self-test                                                   negative cases on in-memory copies of a deck (exit 1 if the checker misses one)
//
// <file-stem> is a file of this folder without ".json" (eg, gulf, levant, en); <index> counts from 0 inside that file. A file holds a JSON
// array of full specs. Without --types the deck is printed exactly as stored, so it pipes into validate.py:
//   node tests/fixtures/auto/extract.mjs gulf 0 | python -X utf8 SK/scripts/validate.py spec - --lint
// --types keeps only the slides of the named types (the vertical slice reduces a deck to the types it can draw): `n` is renumbered, ids stay,
// captionPack.perSlide and captionPack.alt keep the entries of the kept slides, and ext.slice records where the slice came from. A slice is
// not a whole carousel, so its gates may report a missing cover or call to action; name `cover` or `cta` in the list to keep them.
// --check reads manifest.json and every file it names: ids, counts, dialects, types, zero overrides (no visual, overrides, world, frozen,
// remix), `demo` on step story-beat setup share testimonial and keyword calls to action, `items` on grid and timeline, the type coverage
// (every type at least twice, every topic category at least once and six decks with a `statement` pause over the decks that exist), `number.sourceId` and
// `sourceIds` naming a source that `spec.sources` really holds, and the file size (at most 200,000 bytes). Decks whose file is not there yet are
// "pending": a warning, and an error with --strict. --write-manifest recomputes slides, types, demoOn, itemsOn, pause, sources, preset,
// topic, architecture and intent from the files and rewrites coverage, keeping every hand-written field (category, brand, note).
// Exit codes: 0 ok · 1 --check found a problem · 64 usage · 65 unparseable JSON · 66 file or deck not found · 70 internal.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MANIFEST = path.join(HERE, "manifest.json");
const TYPES = ["cover", "rehook", "item", "step", "stat", "compare", "myth-fact", "quote", "story-beat", "checklist", "summary", "setup",
  "proof", "share", "cta", "offer", "testimonial", "poster", "grid", "timeline"];
const NEEDS_DEMO = ["step", "story-beat", "setup", "share", "testimonial"];
const FORBIDDEN = ["visual", "overrides", "frozen", "remix"];
const MAX_BYTES = 200000;
const MIN_STATEMENT_DECKS = 6; // build plan 5.9 (X1/X2 card): 6 decks carry a `statement` pause
const ENGINE = "cs-1.1.0";

function die(code, message) {
  process.stderr.write("cs-error: " + (code === 64 ? "E_USAGE" : code === 65 ? "E_SCHEMA" : code === 66 ? "E_USAGE" : "E_INTERNAL") + ": " + message + "\n");
  process.exit(code);
}
function usage(code, message) {
  if (message) process.stderr.write("cs-error: E_USAGE: " + message + "\n");
  (code ? process.stderr : process.stdout).write(
    "usage: node tests/fixtures/auto/extract.mjs <file-stem> <index> [--types a,b] | <deck-id> [--types a,b] | --list | --check [--strict] | --write-manifest | --self-test\n" +
    "       [--format text|json]   (file stems and ids come from manifest.json; types: " + TYPES.join(" ") + ")\n");
  process.exit(code);
}

const argv = process.argv.slice(2);
if (argv.includes("--help") || argv.includes("-h")) usage(0);
const VALUE_FLAGS = new Set(["--types", "--format"]);
const BOOL_FLAGS = new Set(["--list", "--check", "--strict", "--write-manifest", "--self-test"]);
const flags = {}, positional = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (VALUE_FLAGS.has(a)) {
    if (i + 1 >= argv.length || argv[i + 1].startsWith("--")) usage(64, a + " needs a value");
    flags[a] = argv[++i];
  } else if (BOOL_FLAGS.has(a)) flags[a] = true;
  else if (a.startsWith("--")) usage(64, "unknown option " + a);
  else positional.push(a);
}
const format = flags["--format"] || "text";
if (format !== "text" && format !== "json") usage(64, "--format is text or json");
const modes = ["--list", "--check", "--write-manifest", "--self-test"].filter((m) => flags[m]);
if (modes.length > 1) usage(64, "give one of --list, --check, --write-manifest and --self-test");

function readJson(file, what) {
  let raw;
  try { raw = fs.readFileSync(file, "utf8"); } catch (e) { die(66, what + " not found: " + file); }
  try { return JSON.parse(raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw); } catch (e) { die(65, what + " is not valid JSON: " + e.message); }
}
function writeAtomic(file, text) {
  const tmp = file + ".tmp-" + process.pid;
  fs.writeFileSync(tmp, text, "utf8");
  fs.renameSync(tmp, file);
}
const loadManifest = () => readJson(MANIFEST, "manifest.json");
const deckFile = (stem) => path.join(HERE, stem + ".json");

// ---- one deck ------------------------------------------------------------------------------------------------------------------------
function pickDeck(manifest, a, b) {
  let stem = a, index = null;
  if (b === undefined) {
    const m = /^([a-z][a-z-]*)-([0-9]+)$/.exec(a);
    if (!m) usage(64, "give <file-stem> <index> or a deck id such as gulf-0");
    stem = m[1]; index = Number(m[2]);
  } else {
    if (!/^[0-9]+$/.test(b)) usage(64, "<index> is a whole number counted from 0");
    index = Number(b);
  }
  const known = Object.keys(manifest.files || {});
  if (!known.includes(stem)) die(66, "unknown file stem '" + stem + "' (known: " + known.join(", ") + ")");
  const file = deckFile(stem);
  if (!fs.existsSync(file)) die(66, stem + ".json is not in this folder yet");
  const decks = readJson(file, stem + ".json");
  if (!Array.isArray(decks)) die(65, stem + ".json must hold an array of specs");
  if (index >= decks.length) die(66, stem + ".json holds " + decks.length + " deck(s); index " + index + " does not exist");
  return { stem, index, spec: decks[index] };
}

function reduce(spec, stem, index, types) {
  const bad = types.filter((t) => !TYPES.includes(t));
  if (bad.length) usage(64, "unknown slide type(s): " + bad.join(", "));
  const keep = [];
  spec.slides.forEach((s, i) => { if (types.includes(s.type)) keep.push(i); });
  const out = JSON.parse(JSON.stringify(spec));
  out.slides = keep.map((i, k) => ({ ...spec.slides[i], n: k + 1 }));
  if (out.captionPack) {
    for (const f of ["perSlide", "alt"]) if (Array.isArray(out.captionPack[f])) out.captionPack[f] = keep.map((i) => spec.captionPack[f][i]).filter((x) => x !== undefined);
  }
  out.ext = { ...(out.ext || {}), slice: { from: stem + "-" + index, types: types.slice(), kept: keep.map((i) => spec.slides[i].id) } };
  return out;
}

// ---- facts derived from a deck ---------------------------------------------------------------------------------------------------------
function facts(spec) {
  const slides = spec.slides || [];
  const demoOn = slides.filter((s) => s.demo).map((s) => s.id);
  const itemsOn = slides.filter((s) => Array.isArray(s.items) && s.items.length).map((s) => s.id);
  const pause = slides.filter((s) => s.variant === "statement").map((s) => s.id);
  return {
    specId: spec.id, dialect: spec.locale && spec.locale.dialect, preset: spec.style && spec.style.presetId,
    topic: spec.brief && spec.brief.topic, architecture: spec.architecture, intent: spec.intent,
    slides: slides.length, types: slides.map((s) => s.type), demoOn, itemsOn, pause, sources: (spec.sources || []).length,
  };
}
function deckProblems(spec, where) {
  const out = [];
  const add = (m) => out.push(where + ": " + m);
  if (spec.specVersion !== 1) add("specVersion is not 1");
  if (!Array.isArray(spec.slides) || spec.slides.length < 2) { add("fewer than two slides"); return out; }
  if (spec.slides.length > 10) add("more than 10 slides (" + spec.slides.length + ")");
  if (spec.slides.length < 8) add("fewer than 8 slides (" + spec.slides.length + ")");
  if (!spec.qa || spec.qa.engine !== ENGINE) add("qa.engine is not " + ENGINE);
  for (const k of FORBIDDEN) if (spec[k] !== undefined) add("top-level '" + k + "' is an override");
  if (spec.style && (spec.style.world !== undefined || spec.style.overrides !== undefined || spec.style.planV !== undefined)) add("style carries world, overrides or planV");
  spec.slides.forEach((s, i) => {
    const id = s.id + "(" + s.type + ")";
    if (s.n !== i + 1) add(id + " has n " + s.n + ", expected " + (i + 1));
    if (!TYPES.includes(s.type)) add(id + " has an unknown type");
    for (const k of FORBIDDEN) if (s[k] !== undefined) add(id + " carries '" + k + "'");
    const kw = s.type === "cta" && s.cta && s.cta.kind === "keyword-dm";
    if ((NEEDS_DEMO.includes(s.type) || kw) && !s.demo) add(id + " has no demo");
    if (s.type === "grid" && !(Array.isArray(s.items) && s.items.length >= 3 && s.items.length <= 6)) add(id + " needs 3 to 6 items");
    if (s.type === "timeline" && !(Array.isArray(s.items) && s.items.length >= 3 && s.items.length <= 5)) add(id + " needs 3 to 5 items");
    const known = (sid) => (spec.sources || []).some((x) => x && x.id === sid);
    if (s.number) {
      if (s.number.sourceId) { if (!known(s.number.sourceId)) add(id + " number cites unknown source " + s.number.sourceId); }
      else if (!(s.sourceIds && s.sourceIds.length)) add(id + " has a number without a source");
    }
    for (const sid of s.sourceIds || []) if (!known(sid)) add(id + " cites unknown source " + sid);
  });
  const pack = spec.captionPack || {};
  for (const f of ["perSlide", "alt"]) if (!Array.isArray(pack[f]) || pack[f].length !== spec.slides.length) add("captionPack." + f + " needs one entry per slide");
  return out;
}

// ---- manifest ----------------------------------------------------------------------------------------------------------------------------
function collapse(text) { // short arrays of strings and numbers on one line, as the other fixtures are not written but read more easily
  return text.replace(/\[\n(\s+)((?:"(?:[^"\\\n]|\\.)*"|-?[0-9.]+)(?:,\n\s+(?:"(?:[^"\\\n]|\\.)*"|-?[0-9.]+))*)\n\s*\]/g, (m, _ind, body) => {
    const one = "[" + body.split(/,\n\s+/).join(", ") + "]";
    return one.length <= 110 ? one : m;
  });
}
function coverageOf(entries, categories) {
  const counts = Object.fromEntries(TYPES.map((t) => [t, 0]));
  for (const e of entries) for (const t of e.types || []) counts[t] = (counts[t] || 0) + 1;
  const cats = Object.fromEntries((categories || []).map((c) => [c, 0]));
  for (const e of entries) if (e.category && e.category in cats) cats[e.category]++;
  return {
    types: counts, belowTwo: TYPES.filter((t) => counts[t] < 2),
    categories: cats, categoriesMissing: Object.keys(cats).filter((c) => cats[c] === 0),
    statementDecks: entries.filter((e) => (e.pause || []).length > 0).length,
  };
}
function coverageGaps(cov) {
  const gaps = [];
  if (cov.belowTwo.length) gaps.push("types below two decks: " + cov.belowTwo.join(", "));
  if (cov.categoriesMissing.length) gaps.push("topic categories with no deck: " + cov.categoriesMissing.join(", "));
  if (cov.statementDecks < MIN_STATEMENT_DECKS) gaps.push("fewer than " + MIN_STATEMENT_DECKS + " decks carry a statement pause (" + cov.statementDecks + ")");
  return gaps;
}
function loadAll(manifest) {
  const files = {}, pending = [];
  for (const [stem, info] of Object.entries(manifest.files || {})) {
    const f = path.join(HERE, info.file || stem + ".json");
    if (fs.existsSync(f)) files[stem] = { path: f, bytes: fs.statSync(f).size, decks: readJson(f, info.file) };
    else files[stem] = null;
  }
  const rows = (manifest.decks || []).map((d) => {
    const f = files[d.file.replace(/\.json$/, "")];
    const spec = f && Array.isArray(f.decks) ? f.decks[d.index] : undefined;
    if (!spec) pending.push(d.id);
    return { entry: d, spec };
  });
  return { files, rows, pending };
}

function runCheck() {
  const manifest = loadManifest();
  const { files, rows, pending } = loadAll(manifest);
  const errors = [], warnings = [];
  const entries = (manifest.decks || []);
  if (manifest.counts && manifest.counts.decks !== entries.length) errors.push("manifest counts.decks is " + manifest.counts.decks + " but it lists " + entries.length + " decks");
  const per = {};
  for (const d of entries) per[d.dialect] = (per[d.dialect] || 0) + 1;
  for (const [dia, n] of Object.entries((manifest.counts && manifest.counts.perDialect) || {})) if ((per[dia] || 0) !== n) errors.push("manifest says " + n + " " + dia + " deck(s) but lists " + (per[dia] || 0));
  const ids = new Set();
  for (const d of entries) { if (ids.has(d.id)) errors.push("duplicate deck id " + d.id); ids.add(d.id); }
  for (const [stem, f] of Object.entries(files)) {
    if (!f) continue;
    if (!Array.isArray(f.decks)) { errors.push(stem + ".json is not an array"); continue; }
    if (f.bytes > MAX_BYTES) errors.push(stem + ".json is " + f.bytes + " bytes; the limit is " + MAX_BYTES);
    const want = (manifest.files[stem] || {}).decks;
    if (want !== undefined && f.decks.length !== want) errors.push(stem + ".json holds " + f.decks.length + " deck(s); the manifest says " + want);
    const listed = entries.filter((d) => d.file === stem + ".json").length;
    if (listed !== f.decks.length) errors.push(stem + ".json holds " + f.decks.length + " deck(s) but the manifest lists " + listed);
  }
  const seen = [];
  const cats = manifest.categories || [];
  for (const d of entries) if (d.category && !cats.includes(d.category)) errors.push(d.id + ": category '" + d.category + "' is not in the manifest's list");
  for (const { entry, spec } of rows) {
    if (!spec) { warnings.push(entry.id + ": pending (" + entry.file + " has no deck at index " + entry.index + " yet)"); continue; }
    const fa = facts(spec);
    for (const k of ["specId", "dialect", "preset", "topic", "architecture", "intent", "slides"]) if (entry[k] !== undefined && entry[k] !== null && entry[k] !== fa[k]) errors.push(entry.id + ": manifest " + k + " is " + JSON.stringify(entry[k]) + " but the deck has " + JSON.stringify(fa[k]));
    for (const k of ["types", "demoOn", "itemsOn", "pause"]) if (JSON.stringify(entry[k] || []) !== JSON.stringify(fa[k])) errors.push(entry.id + ": manifest " + k + " differs from the deck (run --write-manifest)");
    errors.push(...deckProblems(spec, entry.id));
    seen.push({ ...fa, category: entry.category });
  }
  const cov = coverageOf(seen, cats);
  const gaps = coverageGaps(cov);
  for (const g of gaps) (pending.length ? warnings : errors).push(g + (pending.length ? " (so far: " + seen.length + " of " + entries.length + " decks present)" : ""));
  if (flags["--strict"] && pending.length) errors.push(pending.length + " deck(s) pending: " + pending.join(", "));
  const report = { ok: errors.length === 0, decks: entries.length, present: seen.length, pending, errors, warnings, coverage: cov };
  if (format === "json") process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  else {
    process.stdout.write("fixtures/auto: " + (report.ok ? "OK" : "PROBLEMS") + " (" + seen.length + " of " + entries.length + " decks present)\n");
    for (const e of errors) process.stdout.write("  error    " + e + "\n");
    for (const w of warnings) process.stdout.write("  warning  " + w + "\n");
  }
  process.exitCode = report.ok ? 0 : 1;
}

function runWrite() {
  const manifest = loadManifest();
  const { rows } = loadAll(manifest);
  let changed = 0;
  const derived = ["specId", "dialect", "preset", "topic", "architecture", "intent", "slides", "types", "demoOn", "itemsOn", "pause", "sources"];
  const decks = rows.map(({ entry, spec }) => {
    if (!spec) return entry;
    const fa = facts(spec);
    const next = { ...entry };
    for (const k of derived) next[k] = fa[k];
    if (JSON.stringify(next) !== JSON.stringify(entry)) changed++;
    return next;
  });
  const present = rows.filter((r) => r.spec).map((r) => ({ ...facts(r.spec), category: r.entry.category }));
  const out = { ...manifest, decks, coverage: { ...coverageOf(present, manifest.categories), present: present.length } };
  const order = ["id", "file", "index", "specId", "dialect", "register", "brand", "preset", "category", "topic", "architecture", "intent", "slides", "types", "demoOn", "itemsOn", "pause", "sources", "status", "note"];
  out.decks = out.decks.map((d) => { const o = {}; for (const k of order) if (d[k] !== undefined) o[k] = d[k]; for (const k of Object.keys(d)) if (!(k in o)) o[k] = d[k]; return o; });
  writeAtomic(MANIFEST, collapse(JSON.stringify(out, null, 2)) + "\n");
  process.stdout.write("manifest.json refreshed: " + present.length + " of " + decks.length + " decks present, " + changed + " entr" + (changed === 1 ? "y" : "ies") + " changed\n");
}

// In-memory negative cases: the checker has to catch each broken copy of a good deck (nothing on disk changes).
function runSelfTest() {
  const manifest = loadManifest();
  const { rows } = loadAll(manifest);
  const good = rows.find((r) => r.spec && r.spec.slides.some((s) => s.number && s.number.sourceId));
  if (!good) die(66, "self-test needs a present deck with a number that names a source");
  const clone = () => JSON.parse(JSON.stringify(good.spec));
  const numberSlide = (spec) => spec.slides.find((s) => s.number && s.number.sourceId);
  const cases = [];
  const expect = (name, spec, needle) => {
    const found = deckProblems(spec, "self-test");
    const hit = needle === null ? found.length === 0 : found.some((m) => m.includes(needle));
    cases.push({ name, ok: hit, found });
  };
  expect("the unmodified deck is clean", clone(), null);
  { const d = clone(); const s = numberSlide(d); s.number.sourceId = "missing-source"; s.sourceIds = []; expect("number.sourceId names a source that spec.sources lacks (sourceIds empty)", d, "unknown source missing-source"); }
  { const d = clone(); const s = numberSlide(d); s.number.sourceId = "missing-source"; expect("number.sourceId names a source that spec.sources lacks (sourceIds left as it was)", d, "unknown source missing-source"); }
  { const d = clone(); const s = numberSlide(d); delete s.number.sourceId; s.sourceIds = []; expect("a number with neither sourceId nor sourceIds", d, "number without a source"); }
  { const d = clone(); const s = numberSlide(d); s.sourceIds = ["missing-source"]; expect("sourceIds names a source that spec.sources lacks", d, "cites unknown source missing-source"); }
  { const d = clone(); d.sources = []; expect("spec.sources emptied under a sourced number", d, "unknown source"); }
  { const d = clone(); d.visual = {}; expect("a top-level visual override", d, "'visual' is an override"); }
  { const d = clone(); d.style = { ...d.style, world: "receipt" }; expect("style.world set", d, "world, overrides or planV"); }
  { const d = clone(); const s = d.slides.find((x) => NEEDS_DEMO.includes(x.type) && x.demo); if (s) { delete s.demo; expect("a step/story-beat/setup/share/testimonial slide loses its demo", d, "has no demo"); } }
  { const d = clone(); d.qa = { ...d.qa, engine: "cs-1.0.0" }; expect("an old engine key", d, "qa.engine is not"); }
  const cats = manifest.categories || ["x"];
  const covOf = (n) => coverageOf(Array.from({ length: 12 }, (_, i) => ({ types: TYPES, category: cats[i % cats.length], pause: i < n ? ["s02"] : [] })), manifest.categories);
  for (const [n, wantGap] of [[MIN_STATEMENT_DECKS - 1, true], [MIN_STATEMENT_DECKS, false]]) {
    const gap = coverageGaps(covOf(n)).some((g) => g.includes("statement pause"));
    cases.push({ name: n + " decks with a statement pause " + (wantGap ? "is reported as a gap" : "is enough"), ok: gap === wantGap, found: [] });
  }
  const failed = cases.filter((c) => !c.ok);
  if (format === "json") process.stdout.write(JSON.stringify({ ok: failed.length === 0, cases: cases.map((c) => ({ name: c.name, ok: c.ok })) }, null, 2) + "\n");
  else {
    process.stdout.write("fixtures/auto self-test: " + (failed.length ? "FAILED" : "OK") + " (" + (cases.length - failed.length) + " of " + cases.length + " cases)\n");
    for (const c of cases) process.stdout.write("  " + (c.ok ? "ok      " : "MISSED  ") + c.name + (c.ok ? "" : " -> " + JSON.stringify(c.found)) + "\n");
  }
  process.exitCode = failed.length ? 1 : 0;
}

function runList() {
  const manifest = loadManifest();
  if (format === "json") { process.stdout.write(JSON.stringify(manifest.decks, null, 2) + "\n"); return; }
  for (const d of manifest.decks) {
    const here = fs.existsSync(path.join(HERE, d.file));
    process.stdout.write([d.id.padEnd(9), d.dialect.padEnd(7), String(d.slides == null ? "-" : d.slides).padStart(2) + " slides", (d.category || "-").padEnd(12), (here ? "" : "[pending] ") + (d.topic || "")].join("  ") + "\n");
  }
}

try {
  if (flags["--list"]) runList();
  else if (flags["--check"]) runCheck();
  else if (flags["--write-manifest"]) runWrite();
  else if (flags["--self-test"]) runSelfTest();
  else {
    if (positional.length < 1 || positional.length > 2) usage(64, "give <file-stem> <index> or a deck id, or one of --list, --check, --write-manifest");
    const manifest = loadManifest();
    const { stem, index, spec } = pickDeck(manifest, positional[0], positional[1]);
    const types = flags["--types"] ? flags["--types"].split(",").map((t) => t.trim()).filter(Boolean) : null;
    if (flags["--types"] && !types.length) usage(64, "--types needs at least one slide type");
    process.stdout.write(JSON.stringify(types ? reduce(spec, stem, index, types) : spec, null, 2) + "\n");
  }
} catch (e) {
  die(70, e && e.stack ? e.stack : String(e));
}
