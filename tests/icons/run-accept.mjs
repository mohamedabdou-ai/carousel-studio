#!/usr/bin/env node
// D14: independent acceptance of integrated Arabic lookup data (spec 3.1, IS-9).
// A private visual build is mandatory; no silent source/data fallbacks. Only dev
// misses are disclosed; official H1 gets aggregate classes, H2 rates only.
// Custom --file diagnostics may list H1, but always hide each H2 item. Primitives use
// the FIRST concept (the planner checks primitives before selecting icons).
// Exit: 0 gates met; 2 gates failed; 64 usage; 65 invalid input; 66 missing; 70 internal.
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const COMMITTED = join(ROOT, "plugins", "carousel-studio", "skills", "carousel-design", "data", "icons");
const DIALECTS = ["eg", "gulf", "lev", "mag", "msa"];
const PRIMITIVES = ["versus", "before-after", "myth-fact", "track", "numeral", "staircase", "rows"];
// All 40 labels of spec 3.1.1 remain valid before deferred drawings ship.
const OBJECTS = new Set(("coin-stack banknote-bundle wallet piggy-bank price-tag phone laptop camera mic megaphone lightbulb rocket trophy calendar clock " +
  "hourglass key lock shield shopping-bag cart gift box book notebook pencil magnifier heart star chat-bubble bell flag target bar-chart gear " +
  "plant coffee-cup house car map-pin").split(" "));
const GATES = { overall: 85, dialect: 80, homograph: 100 };
const USAGE = "usage: node tests/icons/run-accept.mjs [--corpus dev|heldout] [--slice H1|H2] [--dialect eg|gulf|lev|mag|msa] [--file CORPUS.json] [--data DIR] [--chunk FILE] [--format text|json] [--misses N|all] [--no-topic-tags] [--gate] [--self-test]\nCustom --file: gates affect exit only with --gate; H2 items are never listed.\nCustom --data: pack/index/concepts required; absent stem.json uses the integrated stem (reported explicitly).\n";
class RunError extends Error {
  constructor(code, message) { super(message); this.exitCode = code; }
}
function fail(code, message) { throw new RunError(code, message); }
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
function read(file) {
  if (!existsSync(file)) fail(66, `${file} is missing`);
  return readFileSync(file, "utf8");
}
function json(text, name) {
  try { return JSON.parse(text); } catch { fail(65, `${name}: invalid JSON`); }
}
function parse(argv) {
  const o = { corpus: "dev", format: "text", misses: Infinity, topicTags: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => { const v = argv[++i]; if (!v || v.startsWith("--")) fail(64, `${a} needs a value`); return v; };
    if (a === "--help" || a === "-h") o.help = true;
    else if (a === "--corpus") o.corpus = val();
    else if (a === "--slice") o.slice = val();
    else if (a === "--dialect") o.dialect = val();
    else if (a === "--file") o.file = resolve(val());
    else if (a === "--data") o.data = resolve(val());
    else if (a === "--chunk") o.chunk = resolve(val());
    else if (a === "--format") o.format = val();
    else if (a === "--misses") {
      const v = val();
      if (v !== "all" && !/^\d+$/.test(v)) fail(64, "--misses is a nonnegative integer or all");
      o.misses = v === "all" ? Infinity : Number(v);
      if (v !== "all" && !Number.isSafeInteger(o.misses)) fail(64, "--misses is too large");
    }
    else if (a === "--no-topic-tags") o.topicTags = false;
    else if (a === "--gate") o.gate = true;
    else if (a === "--self-test") o.selfTest = true;
    else fail(64, `unknown argument ${a}`);
  }
  if (!["dev", "heldout"].includes(o.corpus)) fail(64, "--corpus is dev or heldout");
  if (!["text", "json"].includes(o.format)) fail(64, "--format is text or json");
  if (o.dialect && !DIALECTS.includes(o.dialect)) fail(64, `--dialect is one of ${DIALECTS.join(", ")}`);
  if (o.slice && !["H1", "H2"].includes(o.slice)) fail(64, "--slice is H1 or H2");
  if (!o.help && o.corpus === "heldout" && !o.slice) fail(64, "heldout requires --slice H1 or H2; never combine blind slices");
  if (o.corpus === "dev" && o.slice && !o.file) fail(64, "--slice requires --corpus heldout or --file");
  return o;
}

const scratch = [];
function tmp() {
  const parent = join(tmpdir(), "cs-r3", "D14");
  mkdirSync(parent, { recursive: true });
  const dir = mkdtempSync(join(parent, "accept-")); scratch.push(dir); return dir;
}
function cleanup() {
  for (const dir of scratch) { try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ } }
}
function loadData(o, evidence) {
  const dir = o.data || COMMITTED, blocks = {};
  evidence.data = { source: o.data ? dir : "integrated SK/data/icons", sha256: {} };
  for (const [name, id] of [["pack", "cs-icon-pack"], ["index", "cs-icon-index"], ["concepts", "cs-icon-concepts"], ["stem", "cs-icon-stem"]]) {
    const file = join(dir, `${name}.json`);
    const defaultStem = name === "stem" && o.data && !existsSync(file);
    const text = read(defaultStem ? join(COMMITTED, "stem.json") : file);
    if (name === "stem") evidence.data.stemSource = defaultStem ? "integrated SK/data/icons/stem.json (custom stem absent)" : file;
    blocks[id] = json(text, `${name}.json`);
    evidence.data.sha256[`${name}.json`] = sha(text);
  }
  if (!blocks["cs-icon-pack"]?.icons || !Array.isArray(blocks["cs-icon-index"]) ||
      !Array.isArray(blocks["cs-icon-concepts"]?.concepts) || !blocks["cs-icon-concepts"].concepts.length ||
      !blocks["cs-icon-stem"] || typeof blocks["cs-icon-stem"] !== "object") fail(65, "incomplete merged lookup data");
  return blocks;
}
function loadChunk(o, evidence) {
  let file = o.chunk;
  if (!file) {
    const out = tmp();
    const r = spawnSync(process.execPath, [join(ROOT, "tools", "build.mjs"), "--module", "visual", "--out", out],
      { cwd: ROOT, encoding: "utf8", timeout: 60000 });
    if (r.error || r.status !== 0) fail(70, `private visual build failed (${r.error?.code || r.status}): ${(r.stderr || r.stdout || "").trim()}`);
    file = join(out, "cs-visual.js");
  }
  const text = read(file);
  evidence.chunk = { source: o.chunk || "tools/build.mjs --module visual (private)", bytes: Buffer.byteLength(text), sha256: sha(text) };
  const sb = {}; sb.window = sb; vm.createContext(sb);
  vm.runInContext(text, sb, { filename: "cs-visual.js", timeout: 10000 });
  if (!sb.CS?.visual?._ || !["find", "concepts", "topic", "has"].every((key) => typeof sb.CS?.visual?.icons?.[key] === "function"))
    fail(70, "the chunk does not publish the lookup API");
  return sb.CS.visual;
}

function validate(slides, blocks, o) {
  if (!Array.isArray(slides) || !slides.length) fail(65, "selection contains no slides");
  const ids = new Set(), names = new Set(Object.keys(blocks["cs-icon-pack"].icons));
  const categories = new Set(blocks["cs-icon-index"].map((r) => r[1]));
  for (let i = 0; i < slides.length; i++) {
    const s = slides[i], bad = (why) => fail(65, `selected entry ${i + 1}: ${why}`);
    // Positions, not heldout ids or text, in diagnostics preserve blind slices.
    if (!s || typeof s !== "object" || typeof s.id !== "string" || !s.id || ids.has(s.id)) bad("missing or duplicate id");
    ids.add(s.id);
    if (s.slice !== undefined && !["H1", "H2"].includes(s.slice)) bad("unknown slice");
    if (!DIALECTS.includes(s.dialect)) bad("unknown dialect (use eg/gulf/lev/mag/msa)");
    if (!["title", "body"].every((k) => typeof s[k] === "string") || !(s.title.trim() || s.body.trim())) bad("missing title/body text");
    for (const key of ["accept", "acceptObject", "tags"]) {
      if (!Array.isArray(s[key]) || s[key].some((x) => typeof x !== "string" || !x) || new Set(s[key]).size !== s[key].length) bad(`invalid ${key}`);
    }
    if (!o.file && s.accept.some((n) => !names.has(n))) bad("accept contains an unavailable or retired icon name");
    if (s.acceptObject.some((n) => !OBJECTS.has(n))) bad("unknown object label");
    if (s.primitive !== null && !PRIMITIVES.includes(s.primitive)) bad("unknown primitive");
    if (typeof s.noIcon !== "boolean") bad("noIcon must be boolean");
    if (s.noIcon ? s.accept.length || s.acceptObject.length || s.primitive : !s.accept.length && !s.acceptObject.length && !s.primitive) bad("contradictory or missing expected answer");
    const values = (prefix) => s.tags.filter((t) => t.startsWith(prefix)).map((t) => t.slice(prefix.length));
    // D0b heldout uses cat:<category>; dev uses topic:<category>. Both are
    // explicit deck topics, not extra slide-text hints. home/sense are dev-only.
    const topics = values("topic:").concat(values("cat:"));
    if (topics.length > 1 || topics.some((t) => !categories.has(t))) bad("invalid topic/cat tag");
    if (s.tags.includes("homograph") && topics.length !== 1) bad("homograph requires a topic/cat tag");
    if (s.tags.includes("structural") && !s.primitive) bad("structural label requires a primitive (accept [] is valid)");
    if (s.tags.some((t) => t.startsWith("neg:") && t !== "neg:slash")) bad("unknown negation tag");
    if (s.tags.includes("neg:slash") && !s.tags.includes("negation")) bad("neg:slash requires negation tag");
  }
}
const pct = (n, d) => d ? Math.round(n * 1000 / d) / 10 : null;
const tally = () => ({ n: 0, pass: 0 });
function bump(t, ok) { t.n++; if (ok) t.pass++; }
const rate = (t) => ({ ...t, rate: pct(t.pass, t.n) });
const acceptable = (r, s) => !!r && (s.accept.includes(r.name) || !!r.object && s.acceptObject.includes(r.object));
function evaluate(slides, icons, o) {
  const overall = tally(), top3 = tally(), by = Object.fromEntries(DIALECTS.map((d) => [d, tally()]));
  const subsets = Object.fromEntries(["homograph", "negation", "primitive", "noIcon", "loanword", "polarity", "verb", "plural", "gap"].map((key) => [key, tally()]));
  const negBound = tally(), classes = {}, misses = [];
  let hiddenH2 = 0;
  for (const s of slides) {
    const fields = [{ text: s.title, w: 100 }, { text: s.body, w: 60 }];
    const tag = o.topicTags && s.tags.find((t) => t.startsWith("topic:") || t.startsWith("cat:"));
    const topic = tag ? [tag.slice(tag.indexOf(":") + 1)] : icons.topic(fields, { dialect: s.dialect });
    const opts = { dialect: s.dialect, topic, k: 5 };
    const res = icons.find(fields, opts), cs = icons.concepts(fields, opts);
    const real = res.filter((r) => r.rung <= 6), top = real[0];
    const primOk = !!s.primitive && cs[0]?.primitive === s.primitive;
    const ok = s.noIcon ? real.length === 0 : acceptable(top, s) || primOk;
    bump(overall, ok); bump(by[s.dialect], ok);
    if (!s.noIcon) bump(top3, primOk || real.slice(0, 3).some((r) => acceptable(r, s)));
    for (const k of ["homograph", "negation", "loanword", "polarity", "verb", "plural", "gap"])
      if (s.tags.includes(k) || k === "polarity" && s.tags.includes("warn") || k === "gap" && s.tags.includes("gap-word")) bump(subsets[k], ok);
    if (s.primitive) bump(subsets.primitive, ok);
    if (s.noIcon) bump(subsets.noIcon, ok);
    if (s.tags.includes("negation")) bump(negBound, !!top?.neg);
    if (!ok) {
      const kind = s.noIcon ? "unexpected-icon" : s.primitive && !s.accept.length && !s.acceptObject.length ?
        "primitive-not-top1" : !top ? "no-lexical-hit" : acceptable(real[1], s) || acceptable(real[2], s) ? "ranking-top1" : "outside-top3";
      if (s.slice !== "H2") classes[kind] = (classes[kind] || 0) + 1;
      else hiddenH2++;
      if (o.corpus === "dev" && s.slice !== "H2") misses.push({ id: s.id, dialect: s.dialect, title: s.title, body: s.body, tags: s.tags,
        expected: { icons: s.accept, objects: s.acceptObject, primitive: s.primitive, noIcon: s.noIcon },
        got: real.slice(0, 3), conceptTop1: cs[0] || null, class: kind, topic });
    }
  }
  return { overall: rate(overall), top3: rate(top3), byDialect: Object.fromEntries(DIALECTS.map((d) => [d, rate(by[d])])),
    subsets: Object.fromEntries(Object.entries(subsets).map(([k, v]) => [k, rate(v)])),
    negationSlashOnTop1: rate(negBound), missCount: overall.n - overall.pass,
    ...(o.slice === "H2" ? {} : { missClasses: classes }),
    misses, hiddenMisses: overall.n - overall.pass - misses.length, hiddenH2 };
}
function gates(report, o) {
  const failed = [], check = (name, t, floor) => {
    if (!t.n) failed.push(`${name}: no cases executed`);
    else if (t.pass * 100 < floor * t.n) failed.push(`${name}: ${t.pass}/${t.n} < ${floor}%`);
  };
  check("overall", report.overall, GATES.overall);
  for (const d of o.dialect ? [o.dialect] : DIALECTS) check(d, report.byDialect[d], GATES.dialect);
  check("homograph", report.subsets.homograph, GATES.homograph);
  return { thresholds: GATES, passed: !failed.length, enforced: !o.file || !!o.gate || o.corpus === "heldout",
    scope: o.dialect ? "dialect-only diagnostic" : "all dialects", failed };
}

// Kept in the owned runner so the privacy and gate regressions remain in the
// repository without changing D3's test file. Uses synthetic H1/H2 only.
function selfTest() {
  const dir = tmp(), file = join(dir, "corpus.json"), chunk = join(dir, "fixture.js"), data = join(dir, "data");
  mkdirSync(data);
  const put = (path, value) => writeFileSync(path, JSON.stringify(value), "utf8");
  const cases = {
    good: { icons: [{ name: "clock", object: "clock", rung: 2 }], concepts: [] },
    wrong: { icons: [{ name: "heart", rung: 2 }], concepts: [] },
    primitive: { icons: [], concepts: [{ primitive: "rows" }] },
    second: { icons: [], concepts: [{ primitive: "versus" }, { primitive: "rows" }] },
    defaults: { icons: [{ name: "clock", rung: 7 }], concepts: [] },
    object: { icons: [{ name: "hourglass", object: "clock", rung: 2 }], concepts: [] }
  };
  writeFileSync(chunk, `window.CS={visual:{_:{},icons:{has:()=>true,topic:()=>['creator'],find:q=>(${JSON.stringify(cases)})[q[0].text]?.icons||[],concepts:q=>(${JSON.stringify(cases)})[q[0].text]?.concepts||[]}}};`, "utf8");
  const blocks = { "cs-icon-pack": { icons: { clock: {}, heart: {}, hourglass: {} } },
    "cs-icon-index": [["clock", "creator"]], "cs-icon-concepts": { concepts: [{ id: "fixture" }] }, "cs-icon-stem": {} };
  for (const [name, id] of [["pack", "cs-icon-pack"], ["index", "cs-icon-index"], ["concepts", "cs-icon-concepts"], ["stem", "cs-icon-stem"]]) put(join(data, `${name}.json`), blocks[id]);
  const row = (id, dialect = "eg", title = "good", extra = {}) =>
    ({ id, dialect, title, body: "synthetic", accept: ["clock"], acceptObject: [], primitive: null, noIcon: false, tags: [], ...extra });
  const base = DIALECTS.map((d) => row(d, d, "good", { tags: ["homograph", "topic:creator"] }));
  let assertions = 0, trials = 0;
  const eq = (a, b, message) => { assert.deepEqual(a, b, message); assertions++; };
  const ok = (value, message) => { assert.ok(value, message); assertions++; };
  const run = (args) => {
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), "--file", file, "--data", data, "--chunk", chunk, "--format", "json", "--gate", ...args],
      { cwd: ROOT, encoding: "utf8", timeout: 60000, maxBuffer: 8 * 1024 * 1024 });
    assert.ifError(r.error); return r;
  };
  function trial(name, rows, args = [], expected = 0) {
    put(file, rows);
    const r = run(args), again = run(args);
    eq([r.status, r.stdout, r.stderr], [again.status, again.stdout, again.stderr], `${name}: deterministic`);
    eq(r.status, expected, `${name}: ${r.stderr}`); trials++;
    return { r, p: r.status === 0 || r.status === 2 ? JSON.parse(r.stdout) : null };
  }
  let { p } = trial("primitive, default noIcon, object", [...base,
    row("structural", "eg", "primitive", { accept: [], primitive: "rows", tags: ["structural"] }),
    row("no-icon", "eg", "defaults", { accept: [], noIcon: true }),
    row("object", "eg", "object", { accept: [], acceptObject: ["clock"] })]);
  eq(p.overall.pass, 8);
  ({ p } = trial("second primitive must fail", [...base, ...[0, 1].map((i) => row(`s${i}`, "eg", "second", { accept: [], primitive: "rows" }))], [], 2));
  eq(p.subsets.primitive.pass, 0);
  trial("missing dialect", base.filter((s) => s.dialect !== "mag"), [], 2);
  trial("missing homograph", base.map((s) => ({ ...s, tags: [] })), [], 2);
  trial("bad homograph", base.map((s, i) => i ? s : { ...s, title: "wrong" }), [], 2);
  trial("unknown dialect", [{ ...base[0], dialect: "levant" }], [], 65);
  assert.throws(() => validate([{ ...base[0], accept: ["not-shipped"] }], blocks, {}), /unavailable or retired/); assertions++;
  trial("custom labels are not required in pack", [...base, row("custom", "eg", "primitive", { accept: ["nothing"], primitive: "rows" })]);
  trial("bad topic", [{ ...base[0], tags: ["topic:no-category"] }], [], 65);
  trial("missing homograph metadata", [{ ...base[0], tags: ["homograph"] }], [], 65);
  trial("empty", [], [], 65);
  trial("empty filtered selection", base, ["--slice", "H2"], 65);
  trial("duplicate id", [...base, base[0]], [], 65);
  trial("noIcon contradiction", [{ ...base[0], noIcon: true }], [], 65);
  trial("unknown slice", [{ ...base[0], slice: "H3" }], [], 65);
  for (const n of ["-1", "1.5", "Infinity", "no", "9007199254740992"]) trial(`invalid misses ${n}`, base, ["--misses", n], 64);
  trial("heldout requires slice", base, ["--corpus", "heldout"], 64);
  for (const slice of ["H1", "H2"]) {
    const rows = [...base, row("SECRET_ID", "eg", "wrong", { body: "SECRET_BODY" })].map((s) => ({ ...s, slice }));
    const args = ["--corpus", "heldout", "--slice", slice];
    const t = trial(`${slice} blind`, rows, args, 2);
    eq([t.p.misses.length, t.p.hiddenMisses], [0, 1]);
    ok(!t.r.stdout.includes("SECRET_ID") && !t.r.stdout.includes("SECRET_BODY"));
    eq("missClasses" in t.p, slice === "H1");
    const text = run([...args, "--format", "text"]);
    eq(text.status, 2);
    ok(!text.stdout.includes("SECRET_ID") && !text.stdout.includes("SECRET_BODY"));
    ok(text.stdout.split("\n")[0].includes("topic mode: topic:/cat: tag, otherwise inferred"));
    const inferred = run([...args, "--no-topic-tags", "--format", "text"]);
    ok(inferred.stdout.split("\n")[0].includes("topic mode: inferred only"));
  }
  const mixed = [...base.map((s) => ({ ...s, slice: "H1" })),
    row("PUBLIC_H1", "eg", "wrong", { slice: "H1" }), row("SECRET_H2", "eg", "wrong", { slice: "H2", body: "SECRET_BODY_H2" })];
  ({ p } = trial("mixed custom privacy", mixed, [], 2));
  eq(p.misses.map((s) => s.id), ["PUBLIC_H1"]); eq(p.hiddenH2, 1);
  const mixedText = run(["--format", "text"]);
  ok(mixedText.stdout.includes("1 on slice H2, never listed") && !mixedText.stdout.includes("SECRET_H2") && !mixedText.stdout.includes("SECRET_BODY_H2"));
  const diagnosticArgs = ["--file", file, "--data", data, "--chunk", chunk, "--format", "json"];
  const diagnostic = spawnSync(process.execPath, [fileURLToPath(import.meta.url), ...diagnosticArgs], { encoding: "utf8" });
  eq(diagnostic.status, 0); eq(JSON.parse(diagnostic.stdout).gate.enforced, false);
  const boundary = Array.from({ length: 2000 }, (_, i) => row(`b${i}`, DIALECTS[i % 5], i < 1699 ? "good" : "wrong",
    { slice: "H2", tags: i < 5 ? ["homograph", "topic:creator"] : [] }));
  ({ p } = trial("84.95 rounds to 85 but fails", boundary, ["--corpus", "heldout", "--slice", "H2"], 2));
  eq(p.overall.rate, 85); eq(p.gate.passed, false);
  trial("missing chunk", base, ["--chunk", join(dir, "missing.js")], 66);
  const broken = join(dir, "broken.js"); writeFileSync(broken, 'throw new Error("fixture broken");', "utf8");
  trial("broken chunk has no source fallback", base, ["--chunk", broken], 70);
  const empty = join(dir, "empty"); mkdirSync(empty);
  trial("missing required data has no fallback", base, ["--data", empty], 66);
  rmSync(join(data, "stem.json"));
  ({ p } = trial("absent custom stem is explicit", base));
  eq(p.evidence.data.stemSource, "integrated SK/data/icons/stem.json (custom stem absent)");
  eq(p.evidence.data.sha256["stem.json"], sha(read(join(COMMITTED, "stem.json"))));
  writeFileSync(join(data, "stem.json"), "{", "utf8");
  trial("invalid custom stem never falls back", base, [], 65);
  writeFileSync(file, '[{"private":"SECRET_BODY",', "utf8");
  const invalid = run([]); eq(invalid.status, 65); ok(!invalid.stderr.includes("SECRET_BODY"));
  process.stdout.write(`D14 self-test: ${trials} trials, ${assertions} assertions passed; synthetic H1/H2 only\n`);
}
function main() {
  const o = parse(process.argv.slice(2));
  if (o.help) { process.stdout.write(USAGE); return; }
  if (o.selfTest) { selfTest(); return; }
  const file = o.file || join(ROOT, "tests", "icons", ...(o.corpus === "dev" ? ["corpus.dev.json"] : ["heldout", "corpus.json"]));
  const raw = json(read(file), "corpus");
  if (!Array.isArray(raw)) fail(65, "corpus must be an array");
  let slides = o.slice ? raw.filter((s) => s?.slice === o.slice) : raw;
  if (o.dialect) slides = slides.filter((s) => s?.dialect === o.dialect);
  const evidence = { corpusSha256: sha(JSON.stringify(slides)) }, blocks = loadData(o, evidence);
  validate(slides, blocks, o);
  const V = loadChunk(o, evidence); V._.blocks = blocks;
  const result = evaluate(slides, V.icons, o), again = evaluate(slides, V.icons, o);
  if (JSON.stringify(result) !== JSON.stringify(again)) fail(70, "lookup results differ on repeat evaluation");
  const report = { corpus: o.file ? file : o.corpus, slice: o.slice || null, dialect: o.dialect || null, slides: slides.length,
    evidence, deterministic: true, topicMode: o.topicTags ? "topic:/cat: tag, otherwise inferred" : "inferred only",
    scoring: "top-1 icon/object OR first concept primitive; noIcon ignores rung-7 defaults", ...result };
  report.gate = gates(report, o);
  // Appendix D describes old probes but supplies no labelled single-word corpus.
  // Slide top3 must never masquerade as that independent 90% secondary check.
  report.singleWord = { status: "not-run", reason: "no labelled legacy single-word fixture supplied", target: 90 };
  if (o.format === "json") process.stdout.write(JSON.stringify(report, null, 1) + "\n");
  else {
    const lines = [`corpus ${o.corpus}${o.slice ? ` slice ${o.slice}` : ""}: ${report.slides} slides; topic mode: ${report.topicMode}`,
      `data: ${evidence.data.source}`, `stem: ${evidence.data.stemSource}`, `chunk: ${evidence.chunk.source}`, "determinism: repeat evaluation identical"];
    const line = (name, r) => `  ${name.padEnd(18)} ${r.pass}/${r.n} (${r.rate === null ? "not executed" : r.rate.toFixed(1) + "%"})`;
    lines.push(line("overall top-1", report.overall), line("slide top-3", report.top3));
    for (const [d, r] of Object.entries(report.byDialect)) lines.push(line(d, r));
    for (const [k, r] of Object.entries(report.subsets)) if (r.n) lines.push(line(k, r));
    if (report.negationSlashOnTop1.n) lines.push(line("slash on top-1", report.negationSlashOnTop1));
    lines.push(report.gate.passed ? `gates: met (${report.gate.scope})` : `gates: NOT MET (${report.gate.failed.join("; ")})`);
    if (report.missClasses) lines.push(`miss classes: ${JSON.stringify(report.missClasses)}`);
    lines.push(`misses: ${report.missCount}; hidden: ${report.hiddenMisses}`);
    if (report.hiddenH2) lines.push(`  ${report.hiddenH2} on slice H2, never listed`);
    for (const m of report.misses.slice(0, o.misses)) lines.push(`  ${m.id} [${m.dialect}] ${m.title}\n    ${m.body}\n    expected ${JSON.stringify(m.expected)} | got ${m.got.map((r) => r.name).join(", ") || "-"} | ${m.class}`);
    if (report.misses.length > o.misses) lines.push("  dev misses truncated; use --misses all");
    lines.push("legacy single-word top-3: NOT RUN (no labelled fixture supplied)");
    process.stdout.write(lines.join("\n") + "\n");
  }
  process.exitCode = report.gate.passed || !report.gate.enforced ? 0 : 2;
}
try { main(); } catch (e) {
  process.stderr.write(`cs-error: ${e.message || e}\n`);
  process.exitCode = e.exitCode || 70;
} finally { cleanup(); }
