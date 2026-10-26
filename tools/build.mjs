#!/usr/bin/env node
// tools/build.mjs · builds the browser runtime chunks (CONTRACT 4.0 and 9.3).
//
//   node tools/build.mjs [--module NAME ... | --all] [--out DIR] [--check] [--list] [--report [--format text|json]]
//
// Every src/<module>/manifest.json is { "module", "chunk", "order", "files": [...] }. Modules that name the same chunk are
// concatenated in `order` (src/lib then src/core make cs-core.js); each chunk is wrapped in one strict IIFE that declares the
// shared CS namespace, so the files of a chunk share one scope and the chunks share window.CS. A chunk name is cs-<word>.js with
// optional hyphenated words (cs-qa-visual.js).
//
//   --module NAME  build the chunk(s) that contain module NAME (repeatable); default is --all
//   --out DIR      write the chunks to DIR (default plugins/carousel-studio/skills/carousel-design/runtime)
//   --check        write nothing; exit 2 when the committed chunks differ from a fresh build
//   --list         print the chunks and their modules, then exit
//   --report       print a size table without writing; with explicit --out, also build there; with --check, also compare
//   --format       text (default) or json; json needs --report and prints one JSON document instead of the per-chunk lines
//
// A build fails (exit 70) when a chunk is over its ceiling (CHUNK_CEILINGS, IS-1), is larger than 200 KiB, does not parse as a
// script, or contains a closing script tag or an HTML comment opener (build_studio.py inlines chunks in <script> elements and
// refuses both). Every chunk is built before anything is written, so a failure writes nothing. Output is not minified.
// Exit codes: 0 ok · 2 --check found a difference · 64 usage · 66 manifest or source file missing · 70 internal / limits · 73 cannot write.
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");
const DEFAULT_OUT = join(ROOT, "plugins", "carousel-studio", "skills", "carousel-design", "runtime");
const ENGINE = "cs-1.1.0";
const KIB = 1024;
const MAX_CHUNK_BYTES = 200 * KIB;
const CHUNK_NAME = /^cs-[a-z0-9]+(-[a-z0-9]+)*\.js$/;
const CLOSING_SCRIPT = new RegExp("</" + "script", "i");
const COMMENT_OPENER = "<" + "!--";

// The CI ceiling of each chunk in bytes (IS-1). A chunk over its ceiling fails the build; the 200 KiB limit stays the last line.
const DEFAULT_CEILING = 190 * KIB;
const CHUNK_CEILINGS = {
  "cs-core.js": 203400,
  "cs-qa.js": 176000,
  "cs-ui.js": 201000,
  "cs-visual.js": 190 * KIB,
  "cs-art.js": 190 * KIB,
  "cs-visual-ui.js": 190 * KIB,
  "cs-qa-visual.js": 190 * KIB
};
// cs-ui.js is 203,991 B today, above its 201,000 B ceiling, until U1 moves exportflow.js into cs-export.js (spec 10.2). Until then
// its enforced ceiling is its size today, so it cannot grow. U1 (or the final integration) deletes this entry.
const INTERIM_CEILINGS = { "cs-ui.js": 203991 };
// The hard planning caps of the four new chunks (IS-1). The report flags a chunk above its cap; the build does not fail on it.
const PLANNING_CAPS = { "cs-visual.js": 120 * KIB, "cs-art.js": 150 * KIB, "cs-visual-ui.js": 60 * KIB, "cs-qa-visual.js": 60 * KIB };

class BuildError extends Error {
  constructor(code, message) { super(message); this.exitCode = code; }
}

const USAGE = "usage: node tools/build.mjs [--module NAME ... | --all] [--out DIR] [--check] [--list] [--report [--format text|json]]\n";

function usage(code, message) {
  if (message) process.stderr.write(`cs-error: E_USAGE: ${message}\n`);
  (code === 0 ? process.stdout : process.stderr).write(USAGE);
  process.exit(code);
}

function parseArgs(argv) {
  const opts = { modules: [], all: false, out: DEFAULT_OUT, outExplicit: false, check: false, list: false, report: false, format: "text" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") usage(0);
    else if (a === "--all") opts.all = true;
    else if (a === "--check") opts.check = true;
    else if (a === "--list") opts.list = true;
    else if (a === "--report") opts.report = true;
    else if (a === "--module" || a === "--out" || a === "--format") {
      const v = argv[++i];
      if (!v || v.startsWith("--")) usage(64, `${a} needs a value`);
      if (a === "--module") opts.modules.push(v);
      else if (a === "--out") { opts.out = resolve(v); opts.outExplicit = true; }
      else if (v === "text" || v === "json") opts.format = v;
      else usage(64, `--format is text or json, not "${v}"`);
    } else usage(64, `unknown argument ${a}`);
  }
  if (opts.all && opts.modules.length) usage(64, "--all and --module cannot be combined");
  if (opts.format === "json" && !opts.report) usage(64, "--format json needs --report");
  return opts;
}

function readManifests() {
  if (!existsSync(SRC)) throw new BuildError(66, `${SRC} does not exist`);
  const out = [];
  for (const entry of readdirSync(SRC, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const file = join(SRC, entry.name, "manifest.json");
    if (!existsSync(file)) continue;
    let m;
    try { m = JSON.parse(readFileSync(file, "utf8")); } catch (e) { throw new BuildError(70, `${file}: ${e.message}`); }
    if (!m.module || !m.chunk || !Array.isArray(m.files) || typeof m.order !== "number") throw new BuildError(70, `${file}: needs module, chunk, order and files`);
    if (m.module !== entry.name) throw new BuildError(70, `${file}: module "${m.module}" does not match its folder`);
    if (!CHUNK_NAME.test(m.chunk)) throw new BuildError(70, `${file}: chunk "${m.chunk}" is not cs-<name>.js (lowercase words joined by hyphens)`);
    out.push({ ...m, dir: join(SRC, entry.name) });
  }
  return out;
}

function groupByChunk(manifests) {
  const chunks = new Map();
  for (const m of manifests) {
    if (!chunks.has(m.chunk)) chunks.set(m.chunk, []);
    chunks.get(m.chunk).push(m);
  }
  for (const list of chunks.values()) list.sort((a, b) => a.order - b.order || a.module.localeCompare(b.module));
  return chunks;
}

function sourceText(dir, name) {
  const file = join(dir, name);
  if (!existsSync(file)) throw new BuildError(66, `${file} is listed in a manifest but does not exist`);
  return readFileSync(file, "utf8").replace(/^﻿/, "").replace(/\r\n?/g, "\n").replace(/\s+$/, "\n");
}

function buildChunk(chunk, modules) {
  const parts = [];
  for (const m of modules) {
    for (const f of m.files) parts.push(`  /* ---- file: ${f} ---- */\n${sourceText(m.dir, f)}`);
  }
  const text = `/*! Carousel Studio runtime chunk ${chunk} · ${ENGINE} · Apache-2.0 */\n(function () {\n  "use strict";\n  var CS = (window.CS = window.CS || {});\n${parts.join("\n")}})();\n`;
  const bytes = Buffer.byteLength(text, "utf8");
  if (bytes > MAX_CHUNK_BYTES) throw new BuildError(70, `${chunk} is ${(bytes / KIB).toFixed(1)} KiB; the limit is 200 KiB`);
  if (CLOSING_SCRIPT.test(text)) throw new BuildError(70, `${chunk} contains a closing script tag; spell it in two pieces`);
  if (text.includes(COMMENT_OPENER)) throw new BuildError(70, `${chunk} contains an HTML comment opener; spell it in two pieces`);
  try { new vm.Script(text, { filename: chunk }); } catch (e) { throw new BuildError(70, `${chunk} does not parse: ${e.message}`); }
  return { text, bytes };
}

function writeAtomic(file, text) {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, text, "utf8");
  renameSync(tmp, file);
}

/* ---- ceilings and the size report -------------------------------------------------------------------------------- */

/** Size of the chunk committed in the default runtime folder (line endings normalised like --check), or null. */
function committedBytes(name) {
  const file = join(DEFAULT_OUT, name);
  if (!existsSync(file)) return null;
  return Buffer.byteLength(readFileSync(file, "utf8").replace(/\r\n?/g, "\n"), "utf8");
}

function reportRow(name, bytes) {
  const target = CHUNK_CEILINGS[name] ?? DEFAULT_CEILING;
  const ceiling = INTERIM_CEILINGS[name] ?? target;
  const cap = PLANNING_CAPS[name] ?? null;
  const committed = committedBytes(name);
  const status = bytes > ceiling ? "OVER" : cap !== null && bytes > cap ? "over cap" : "ok";
  return {
    chunk: name, bytes, ceiling, targetCeiling: target, interim: ceiling !== target, headroom: ceiling - bytes,
    planningCap: cap, committed, delta: committed === null ? null : bytes - committed, status
  };
}

const num = (n) => (n === null ? "-" : String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ","));
const signed = (n) => (n === null ? "-" : (n > 0 ? "+" : "") + num(n));

function reportText(rows) {
  const head = ["chunk", "bytes", "KiB", "ceiling", "headroom", "cap", "committed", "delta", "status"];
  const body = rows.map((r) => [r.chunk, num(r.bytes), (r.bytes / KIB).toFixed(1), num(r.ceiling) + (r.interim ? "*" : ""), num(r.headroom),
    r.planningCap === null ? "-" : num(r.planningCap), num(r.committed), signed(r.delta), r.status]);
  const w = head.map((h, i) => Math.max(h.length, ...body.map((b) => b[i].length)));
  const line = (cells) => cells.map((c, i) => (i === 0 || i === cells.length - 1 ? c.padEnd(w[i]) : c.padStart(w[i]))).join("  ").trimEnd();
  const notes = rows.filter((r) => r.interim).map((r) => `* ${r.chunk}: interim ceiling ${num(r.ceiling)} B (its size when the ceilings began); the target is ${num(r.targetCeiling)} B`);
  return [line(head), ...body.map(line), ...notes].join("\n");
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const chunks = groupByChunk(readManifests());
  if (opts.list) {
    for (const [name, list] of chunks) console.log(`${name}  <-  ${list.map((m) => `src/${m.module} (${m.files.length} files)`).join(" + ")}`);
    return 0;
  }
  let wanted = [...chunks.keys()];
  if (opts.modules.length) {
    wanted = [];
    for (const name of opts.modules) {
      const hit = [...chunks.entries()].find(([, list]) => list.some((m) => m.module === name));
      if (!hit) throw new BuildError(64, `no module named "${name}" (modules: ${[...chunks.values()].flat().map((m) => m.module).join(", ")})`);
      if (!wanted.includes(hit[0])) wanted.push(hit[0]);
    }
  }
  const built = wanted.map((name) => ({ name, ...buildChunk(name, chunks.get(name)) }));
  const rows = built.map((b) => reportRow(b.name, b.bytes));
  const json = opts.report && opts.format === "json";
  const emitReport = () => {
    if (opts.report) process.stdout.write((json ? JSON.stringify({ engine: ENGINE, chunks: rows }, null, 2) : reportText(rows)) + "\n");
  };
  const over = rows.filter((r) => r.status === "OVER");
  if (over.length) {
    emitReport();
    throw new BuildError(70, over.map((r) => `${r.chunk} is ${num(r.bytes)} B (${(r.bytes / KIB).toFixed(1)} KiB), over its ceiling of ${num(r.ceiling)} B (${(r.ceiling / KIB).toFixed(1)} KiB)`).join("; "));
  }
  if (opts.report && !opts.outExplicit && !opts.check) {
    emitReport();
    return 0;
  }
  let differing = 0;
  for (const { name, text, bytes } of built) {
    const target = join(opts.out, name);
    if (opts.check) {
      const current = existsSync(target) ? readFileSync(target, "utf8").replace(/\r\n?/g, "\n") : null;   // a checkout may have converted the line endings
      const same = current === text;
      if (!same) differing++;
      if (!json) console.log(`${same ? "ok      " : "DIFFERS "} ${name}`);
    } else {
      try { writeAtomic(target, text); } catch (e) { throw new BuildError(73, `cannot write ${target}: ${e.message}`); }
      if (!json) console.log(`wrote ${name}  ${(bytes / KIB).toFixed(1)} KiB`);
    }
  }
  emitReport();
  if (opts.check && differing) {
    process.stderr.write(`cs-error: E_CONFLICT: ${differing} chunk(s) differ from a fresh build; run node tools/build.mjs\n`);
    return 2;
  }
  return 0;
}

try {
  process.exitCode = main();
} catch (e) {
  if (e instanceof BuildError) {
    process.stderr.write(`cs-error: ${e.exitCode === 64 ? "E_USAGE" : e.exitCode === 66 ? "E_USAGE" : "E_INTERNAL"}: ${e.message}\n`);
    process.exitCode = e.exitCode;
  } else {
    process.stderr.write(`cs-error: E_INTERNAL: ${e && e.stack ? e.stack : e}\n`);
    process.exitCode = 70;
  }
}
