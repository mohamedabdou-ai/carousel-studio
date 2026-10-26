// tests/unit/js/icons/helpers.mjs · shared by the icon pipeline tests (build plan D1).
// Everything here is plain Node: the tool is run as a child process (the way the lead and CI run it) and its functions are imported
// for unit tests. The fixture "world" is a tiny vendored package pair, a lock and a source folder written to a temp directory, so the
// pipeline is tested without the real research/vendor packages (those are only needed by data.test.mjs).
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
export const TOOL = join(ROOT, "tools", "build-icons.mjs");
export const tool = await import(pathToFileURL(TOOL).href);

/* Characters that are invisible in source, built from code points so nobody edits them by accident. */
export const FATHA = String.fromCharCode(0x64E);
export const TATWEEL = String.fromCharCode(0x640);
export const VS16 = String.fromCharCode(0xFE0F);
export const withFatha = (word) => [...word].join(FATHA) + FATHA;

const made = [];
export function tmp(label = "icons") {
  const dir = mkdtempSync(join(tmpdir(), `cs-${label}-`));
  made.push(dir);
  return dir;
}
export function cleanup() { for (const d of made.splice(0)) { try { rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ } } }

export function run(args, opts = {}) {
  const r = spawnSync(process.execPath, [TOOL, ...args], { encoding: "utf8", env: { ...process.env, ...(opts.env || {}) }, cwd: opts.cwd || ROOT });
  return { status: r.status, stdout: r.stdout || "", stderr: r.stderr || "" };
}

export function readJson(file) { return JSON.parse(readFileSync(file, "utf8")); }
export function writeJson(file, value) { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, JSON.stringify(value, null, 1) + "\n", "utf8"); }
export function sha(bytes) { return createHash("sha256").update(bytes).digest("hex"); }

/* ---- the real vendored packages (data.test.mjs only) ------------------------------------------------------------- */

export function hasVendor() {
  try {
    const lock = readJson(tool.DEFAULTS.lock);
    const vendor = process.env.CS_ICON_VENDOR ? resolve(process.env.CS_ICON_VENDOR) : tool.DEFAULTS.vendor;
    return ["lucide", "tabler"].every((k) => existsSync(join(vendor, lock.sources[k].dir, lock.sources[k].nodes.file)) && existsSync(join(vendor, lock.sources[k].dir, lock.sources[k].tarball.file)));
  } catch { return false; }
}

/* ---- the fixture world ------------------------------------------------------------------------------------------ */

export const FIXTURE_CANDIDATES = [
  { name: "circle-check", category: "social", en: ["check", "done", "ok"], ar: ["تمام", "انجاز", "تم"], detail: "low" },
  { name: "heart", category: "social", en: ["heart", "love", "like"], ar: ["قلب", "حب", "اعجاب"], detail: "low" },
  { name: "search", category: "productivity", en: ["search", "find", "lens"], ar: ["بحث", "ابحث", "عدسة"], detail: "low" },
  { name: "ellipsis", category: "arrows-ui", en: ["more", "menu", "dots"], ar: ["المزيد", "قائمة", "نقاط"], detail: "low" },
  { name: "arrow-right", category: "arrows-ui", en: ["next", "right", "go"], ar: ["التالي", "يمين", "اذهب"], detail: "low" },
  { name: "server", category: "tech-ai", en: ["server", "host", "rack"], ar: ["سيرفر", "خادم", "استضافة"], detail: "low" },
  { name: "scale", category: "business", en: ["balance", "law", "scale"], ar: ["ميزان", "عدل", "قانون"], detail: "mid" },
  { name: "palette", category: "creator", en: ["palette", "colour", "paint"], ar: ["الوان", "لوحة", "رسم"], detail: "mid" },
  { name: "tb-currency-dirham", category: "mena", en: ["dirham", "aed", "currency"], ar: ["درهم", "دراهم", "عملة"], source: "tabler", source_name: "currency-dirham", detail: "mid" },
  { name: "cs-egp", category: "mena", en: ["pound", "egp", "currency"], ar: ["جنيه", "جنيه مصري", "عملة"], source: "custom" },
  { name: "tb-brand-x", category: "brands", en: ["x", "twitter", "social"], ar: ["اكس", "تويتر", "تواصل"], source: "tabler", source_name: "brand-x", optional: true, detail: "low" },
];

export const FIXTURE_LUCIDE = {
  "circle-check": [["circle", { cx: "12", cy: "12", r: "10" }], ["path", { d: "m9 12 2 2 4-4" }]],
  heart: [["path", { d: "M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5" }]],
  search: [["path", { d: "m21 21-4.34-4.34" }], ["circle", { cx: "11", cy: "11", r: "8" }]],
  ellipsis: [["circle", { cx: "12", cy: "12", r: "1" }], ["circle", { cx: "19", cy: "12", r: "1" }], ["circle", { cx: "5", cy: "12", r: "1" }]],
  "arrow-right": [["path", { d: "M5 12h14" }], ["path", { d: "m12 5 7 7-7 7" }]],
  server: [["rect", { width: "20", height: "8", x: "2", y: "2", rx: "2", ry: "2" }], ["rect", { width: "20", height: "8", x: "2", y: "14", rx: "2", ry: "2" }],
    ["line", { x1: "6", x2: "6.01", y1: "6", y2: "6" }], ["line", { x1: "6", x2: "6.01", y1: "18", y2: "18" }]],
  scale: [["path", { d: "M12 3v18" }], ["path", { d: "m19 8 3 8a5 5 0 0 1-6 0zV7" }], ["path", { d: "M3 7h1a17 17 0 0 0 8-2 17 17 0 0 0 8 2h1" }],
    ["path", { d: "m5 8 3 8a5 5 0 0 1-6 0zV7" }], ["path", { d: "M7 21h10" }]],
  palette: [["path", { d: "M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z" }],
    ["circle", { cx: "13.5", cy: "6.5", r: ".5", fill: "currentColor" }], ["circle", { cx: "6.5", cy: "12.5", r: ".5", fill: "currentColor" }]],
};
export const FIXTURE_TABLER = {
  "currency-dirham": [["path", { d: "M8.5 19h-3.5" }], ["path", { d: "M8.599 16.479a1.5 1.5 0 1 0 -1.099 2.521" }], ["path", { d: "M7 4v9" }],
    ["path", { d: "M15 13h1.888a1.5 1.5 0 0 0 1.296 -2.256l-2.184 -3.744" }], ["path", { d: "M11 13.01v-.01" }]],
  "brand-x": [["path", { d: "M4 4l11.733 16h4.267l-11.733 -16z" }], ["path", { d: "M4 20l6.768 -6.768m2.46 -2.46l6.772 -6.772" }]],
};
export const FIXTURE_CUSTOM = [{ name: "cs-egp", d: ["M9.5 7.5H4v9h5.5", "M4 12h4.5", "M20.5 9a3 3 0 0 0-6 0v9", "M12.5 18h9", "M13 13h6.5"], flags: { c: 1 } }];

/** A valid concept with nine folded forms. */
export function concept(over = {}) {
  return {
    id: "love", cat: "social",
    forms: { eg: ["حب", "عشق", "بحب"], gulf: ["هيام", "غرام"], lev: ["ولع"], msa: ["هوي", "شغف", "ود"], loan: ["لوف"] },
    icons: ["heart", "circle-check", "search"], object: "heart", primitive: null, pol: null, home: null, ...over,
  };
}
export function heartObject(over = {}) {
  return { id: "heart", viewBox: 48, paths: [{ d: "M10 10h28v28H10z", role: "base" }, { d: "M16 16h16v16H16z", role: "hi" }], ...over };
}

/** Writes vendor + lock + src into `dir` and returns the paths and the argument list that points the tool at them. */
export function makeWorld(dir, over = {}) {
  const vendor = join(dir, "vendor");
  const files = {};
  for (const [key, nodes, nodesFile] of [["lucide", over.lucide || FIXTURE_LUCIDE, "package/icon-nodes.json"], ["tabler", over.tabler || FIXTURE_TABLER, "package/tabler-nodes-outline.json"]]) {
    const sub = `${key}-fx-1`;
    const tar = Buffer.from(`fixture tarball ${key}`);
    const body = Buffer.from(JSON.stringify(nodes));
    mkdirSync(join(vendor, sub, "package"), { recursive: true });
    writeFileSync(join(vendor, sub, `${sub}.tgz`), tar);
    writeFileSync(join(vendor, sub, nodesFile), body);
    files[key] = { package: key, version: "0.0.1", license: "ISC", dir: sub, tarball: { file: `${sub}.tgz`, sha256: sha(tar) }, nodes: { file: nodesFile, sha256: sha(body) } };
  }
  const lock = join(dir, "lock.json");
  writeJson(lock, { schemaVersion: 1, sources: files });
  const src = join(dir, "src");
  mkdirSync(src, { recursive: true });
  writeJson(join(src, "candidates.json"), over.candidates || FIXTURE_CANDIDATES);
  writeJson(join(src, "mirror.json"), over.mirror || { mirror: ["arrow-right"], keep: { scale: "object" } });
  writeJson(join(src, "emoji-map.json"), over.emoji || { map: { "✅": "circle-check", "❤": "heart" } });
  if (over.custom !== null) writeJson(join(src, "custom.json"), over.custom || FIXTURE_CUSTOM);
  if (over.duo) writeJson(join(src, "duo.json"), over.duo);
  for (const [name, value] of Object.entries(over.shards || {})) writeJson(join(src, name), value);
  const out = join(dir, "out");
  return { dir, vendor, lock, src, out, args: (extra = []) => ["--vendor", vendor, "--lock", lock, "--src", src, "--out", out, ...extra] };
}

export function build(world, extra = []) {
  const r = run(world.args(extra));
  return r;
}
export function outJson(world, name) { return readJson(join(world.out, name)); }
