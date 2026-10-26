#!/usr/bin/env node
// tools/build-icons.mjs · the icon pipeline of Carousel Studio 1.1 (spec 3.1, 13e section 9, build plan D1).
//
//   node tools/build-icons.mjs [--out DIR] [--check] [--strict] [--merge-index] [--merge-concepts] [--merge-objects]
//                              [--cheatsheet] [--all] [--no-shards] [--with-brands] [--src DIR] [--vendor DIR]
//                              [--lock FILE] [--format text|json] [--verbose]
//
// WHAT IT DOES
//   Turns two pinned, vendored JSON files (Lucide icon-nodes.json, Tabler tabler-nodes-outline.json) plus the reviewed sources in
//   tools/icons-src/ into the shipped icon data. It never reads an .svg, never runs a package script and never touches the network.
//   Before anything is read the SHA-256 of both tarballs and of both JSON files is compared with tools/icons.lock.json.
//   Elements and attributes are whitelisted: anything else stops the build. Every primitive becomes a path (rule A14), every
//   degenerate dot becomes a filled circle path and is listed in "s", closed sub-paths that may take the duo tint are listed in "f".
//
// OUTPUTS (all written atomically, UTF-8, LF; --out DIR writes them flat into DIR, the default writes data/icons/* and
//   references/icons.md under plugins/carousel-studio/skills/carousel-design/; builders and tests always use --out)
//   pack.json        {"schemaVersion":2,"dataVersion","viewBox":24,"sources":{lucide,tabler},"icons":{name:{d:[path...],f?:[idx],s?:[idx]}}}   <= 85,000 B
//                    d = path data, one entry per drawn element (compound paths with a dot or a closed + open mix are split);
//                    f = indices of entries that are fully closed (the duo tint; tools/icons-src/duo.json overrides for ~60 scene icons);
//                    s = indices of solid dots: draw them with fill = ink and no stroke (a filled circle of the stroke's diameter).
//   index.json       [[name, category, [en...], [ar...], {d,m,p,h,a,o,c}], ...]  Arabic keywords stored folded (spec 3.1)  <= 70,000 B
//                    flags: d detail l|m|h, m mirror in RTL (from mirror.json only), p neg|warn, h human figure or face, a animal,
//                    o occasion/heritage gated, c currency glyph. A top-level array, sorted by category order then name.
//   concepts.json    {"schemaVersion":1,"dataVersion","concepts":[{id,cat,forms:{eg,gulf,lev,mag,msa,loan},icons,object,primitive,pol,home}]}
//                    COMPACT: an empty dialect list and a null object/primitive/pol/home are omitted; read absent as []/null.   <= 140,000 B
//   objects.json     {"schemaVersion":1,"dataVersion","viewBox":48,"objects":[{id,viewBox:48,paths:[{d,role}]}]}               <= 60,000 B
//   emoji-map.json   {"schemaVersion":1,"dataVersion","map":{emoji: iconName}}  (keys carry no U+FE0F)                        <= 2,000 B
//   icons.md         the cheat sheet a model reads whole: names by category and the usage rules
//   brands.json      only with --with-brands: the opt-in brand glyph pack (pack + index entries); never part of the default set
//
// SOURCES (tools/icons-src/, override with --src)
//   candidates.json  array of {name, category, en[], ar[], detail?, source?, source_name?, optional?}  the reviewed candidate list
//                    (Lucide names as they are, "tb-" = Tabler, "cs-" = custom). 'optional' marks the opt-in brand glyphs.
//   mirror.json      {mirror:[names], keep:{name: reason}}   the directional review (flag m)
//   duo.json         {icons:{name:{f:[indices], n: expected number of entries}}}   hand-reviewed duo tint indices
//   emoji-map.json   {map:{emoji: iconName}}
//   custom.json      (optional, D2) array or {icons:[...]} of {name:"cs-...", d:[path...], flags?:{o,h,a,c,p,d}}; path-only, coordinates
//                    1..23, no dots, no fill. Missing icons get a visible placeholder and a warning (an error with --strict).
//   index.<shard>.json   (D8-D10, D15) a patch over the candidate keywords: {icons:{ "<name>": {ar:[...add], remove:[...], replace:[...],
//                    en:[...add], removeEn, replaceEn, flags:{d,p,h,a,o,c}} }}. 'ar' ADDS (deduplicated); 'remove' deletes; 'replace' replaces.
//                    A bare map {name: entry} or an array of {name, ...} also works; d p h a o c may sit on the entry itself.
//   concepts.<shard>.json  {concepts:[...]} or a bare array of IS-9 concepts. Forms must already be folded (no ة أ إ آ ى ؤ ئ, no tashkeel,
//                    no tatweel), at least 8 forms in total, at most 3 tokens each; icons must exist; ids are unique across shards.
//   objects.<name>.json  {objects:[...]} or a bare array of {id, viewBox:48, paths:[{d, role: base|shade|hi}]}: closed paths only, inside 0..48,
//                    at most 12 paths and 1.5 KB of path data, ids from the 40 of spec 3.1.1.
//
// FLAGS
//   --check          write nothing; compare a fresh build with the files in the output folder; exit 2 on any difference.
//                    An output that does not exist yet is "absent" (fine before the integration beat, an error with --strict).
//                    Without the vendored packages the committed outputs are validated on their own.
//   --strict         the final gate: placeholders, absent outputs, no shard of a kind, fewer than 12 objects are errors.
//   --merge-index / --merge-concepts / --merge-objects   require at least one shard of that kind and print the per-shard counts
//                    (shards are merged whenever they exist; the flags only make their presence mandatory and loud).
//   --all            the three merge flags plus --cheatsheet.   --cheatsheet  always write icons.md (it is written by default).
//   --no-shards      ignore every index/concepts/objects shard (an isolated base build).
//   --with-brands    also write brands.json.   --verbose   list every warning.
// Exit codes (CONTRACT 0.4): 0 ok · 2 invalid data, integrity failure or --check difference · 64 usage · 65 unparseable JSON ·
// 66 input missing · 70 internal · 73 cannot write.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SK = join(ROOT, "plugins", "carousel-studio", "skills", "carousel-design");
export const DEFAULTS = {
  src: join(ROOT, "tools", "icons-src"),
  lock: join(ROOT, "tools", "icons.lock.json"),
  vendor: resolve(ROOT, "..", "research", "vendor"),
  out: join(SK, "data", "icons"),
  refs: join(SK, "references"),
};
export const DATA_VERSION = "1.1.0";
export const CAPS = { "pack.json": 85000, "index.json": 70000, "concepts.json": 140000, "objects.json": 60000, "emoji-map.json": 2000 };
export const DOT_RADIUS = 1;                       // a dot is a filled circle of the base stroke's diameter (24-unit grid, stroke 2)
const MAX_CUSTOM_BYTES = 1200;
const MAX_OBJECT_PATHS = 12;
const MAX_OBJECT_BYTES = 1536;
export const DIALECTS = ["eg", "gulf", "lev", "mag", "msa", "loan"];
export const PRIMITIVES = ["versus", "before-after", "myth-fact", "track", "numeral", "staircase", "rows"];
export const ROLES = ["base", "shade", "hi"];
export const OBJECT_IDS = ["coin-stack", "banknote-bundle", "wallet", "piggy-bank", "price-tag", "phone", "laptop", "camera", "mic", "megaphone",
  "lightbulb", "rocket", "trophy", "calendar", "clock", "hourglass", "key", "lock", "shield", "shopping-bag", "cart", "gift", "box", "book",
  "notebook", "pencil", "magnifier", "heart", "star", "chat-bubble", "bell", "flag", "target", "bar-chart", "gear", "plant", "coffee-cup",
  "house", "car", "map-pin"];
const OBJECT_ALIASES = { bag: "shopping-bag" };
export const HERO_OBJECTS = ["coin-stack", "phone", "lightbulb", "megaphone", "trophy", "calendar", "hourglass", "key", "shopping-bag", "bar-chart", "book", "chat-bubble"];
// Candidates retired when the six failing custom slots were respent (spec 10.5 decision 5). A shard may still mention them; that is a warning.
export const RETIRED = new Set(["cs-date", "cs-person-ghutra", "cs-mabkhara", "cs-oud", "cs-abaya", "cs-falcon", "cs-aed"]);
// Defaults for the flags the shards may override. Every name must be a candidate (checked).
export const DEFAULT_FLAGS = {
  h: ["users", "user-plus", "user-check", "circle-user-round", "users-round", "user-round", "baby", "scan-face", "face-slightly-smiling", "face-grinning",
    "face-slightly-frowning", "face-neutral", "face-angry", "face-slightly-smiling-plus", "cs-person-hijab"],
  a: ["fish", "tb-horse", "cs-camel"],
  o: ["mosque", "dome", "moon-star", "tb-building-mosque", "cs-fanous", "cs-dallah", "cs-camel", "cs-dunes"],
  c: ["dollar-sign", "circle-dollar-sign", "badge-dollar-sign", "pound-sterling", "bitcoin", "saudi-riyal", "turkish-lira", "currency",
    "tb-currency-dirham", "tb-currency-dinar", "cs-egp"],
  neg: ["circle-x", "heart-crack", "thumbs-down", "trending-down", "face-angry", "face-slightly-frowning", "banknote-arrow-down"],
  warn: ["triangle-alert", "circle-alert"],
};
// 13e section 3: never in the bundle.
const BLOCK_EXACT = new Set(["wine", "wine-off", "bottle-wine", "beer", "beer-off", "hop", "hop-off", "martini", "ham", "cigarette", "cigarette-off",
  "cannabis", "cannabis-off", "dices", "spade", "club", "church", "cross", "skull", "biohazard", "pray", "jewish-star", "star-of-david", "yin-yang", "om",
  "smoking", "vape", "bong", "hookah", "cigar", "champagne", "cocktail", "whisky", "bacon", "pig", "slot-machine", "roulette", "poker", "candy-cane"]);
const BLOCK_PREFIX = ["dice-", "playing-card", "zodiac-", "wine-", "beer-"];
const BLOCK_TOKENS = new Set(["kaaba", "quran", "koran", "mushaf", "rehal", "prayer", "worship", "mecca", "allah", "rosary", "menorah", "buddha", "hindu", "pentagram", "swastika",
  "gambling", "casino", "alcohol", "tobacco", "crucifix", "zodiac"]);   // whole name parts, so "dallah" is not "allah"

export class ToolError extends Error {
  constructor(exitCode, code, message) { super(message); this.exitCode = exitCode; this.code = code; }
}
function bad(message) { return new ToolError(2, "E_SCHEMA", message); }

class Problems {
  constructor() { this.list = []; }
  add(message) { this.list.push(message); }
  throwIfAny(prefix) {
    if (!this.list.length) return;
    const shown = this.list.slice(0, 40).map((m) => `  - ${m}`).join("\n");
    const more = this.list.length > 40 ? `\n  ...and ${this.list.length - 40} more` : "";
    throw bad(`${prefix}: ${this.list.length} problem(s)\n${shown}${more}`);
  }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Arabic fold (spec 3.1): strip tashkeel and tatweel; أ إ آ -> ا, ى -> ي, ة -> ه, ؤ -> و, ئ -> ي                           */
/* ------------------------------------------------------------------------------------------------------------------ */

const U = (code) => String.fromCharCode(code);
const span = (from, to) => `${U(from)}-${U(to)}`;
const LETTERS = `${span(0x621, 0x63A)}${span(0x641, 0x64A)}`;            // the Arabic letters the index allows (13e), no tashkeel, no tatweel
const TASHKEEL = new RegExp(`[${span(0x64B, 0x65F)}${U(0x670)}${U(0x640)}]`, "g");
const FOLD = [[new RegExp(`[${U(0x623)}${U(0x625)}${U(0x622)}]`, "g"), U(0x627)], [new RegExp(U(0x649), "g"), U(0x64A)], [new RegExp(U(0x629), "g"), U(0x647)],
  [new RegExp(U(0x624), "g"), U(0x648)], [new RegExp(U(0x626), "g"), U(0x64A)]];

export function fold(text) {
  let t = String(text).replace(TASHKEEL, "");
  for (const [re, to] of FOLD) t = t.replace(re, to);
  return t.replace(/\s+/g, " ").trim();
}
const ARABIC_WORDS = new RegExp(`^[${LETTERS}]+(?: [${LETTERS}]+)*$`);
const ENGLISH_WORDS = /^[a-z0-9][a-z0-9 -]*$/;
export function isFolded(form) { return typeof form === "string" && fold(form) === form && ARABIC_WORDS.test(form); }

/* ------------------------------------------------------------------------------------------------------------------ */
/* Path engine: strict tokenizer, analysis (sub-paths, closed, dots, extremes) and a compact serialiser                    */
/* ------------------------------------------------------------------------------------------------------------------ */

const ARITY = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };
const NUM_RE = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/y;

export function parsePathData(d) {
  const s = String(d);
  const n = s.length;
  let i = 0;
  const out = [];
  const skip = () => { while (i < n && (s[i] === " " || s[i] === "," || s[i] === "\t" || s[i] === "\n" || s[i] === "\r")) i++; };
  const number = () => {
    skip();
    NUM_RE.lastIndex = i;
    const m = NUM_RE.exec(s);
    if (!m) throw new Error(`number expected at ${i} in "${s.slice(0, 60)}"`);
    i = NUM_RE.lastIndex;
    return Number(m[0]);
  };
  const flag = () => {
    skip();
    const c = s[i];
    if (c !== "0" && c !== "1") throw new Error(`arc flag expected at ${i} in "${s.slice(0, 60)}"`);
    i++;
    return Number(c);
  };
  skip();
  while (i < n) {
    const c = s[i];
    if (!/[MmLlHhVvCcSsQqTtAaZz]/.test(c)) throw new Error(`unexpected "${c}" at ${i} in "${s.slice(0, 60)}"`);
    i++;
    const up = c.toUpperCase();
    const arity = ARITY[up];
    if (arity === 0) { out.push({ c, a: [] }); skip(); continue; }
    let first = true;
    for (;;) {
      skip();
      if (!first && (i >= n || /[A-Za-z]/.test(s[i]))) break;
      if (first && (i >= n || /[A-Za-z]/.test(s[i]))) throw new Error(`missing arguments after "${c}" in "${s.slice(0, 60)}"`);
      const a = [];
      for (let k = 0; k < arity; k++) a.push(up === "A" && (k === 3 || k === 4) ? flag() : number());
      let cmd = c;
      if (!first) cmd = c === "M" ? "L" : c === "m" ? "l" : c;
      out.push({ c: cmd, a });
      first = false;
    }
  }
  if (!out.length) throw new Error("empty path data");
  if (out[0].c !== "M" && out[0].c !== "m") throw new Error(`path data must start with a moveto: "${s.slice(0, 60)}"`);
  return out;
}

export function fmt(n) {
  let s = Number(n).toFixed(3);
  if (s.includes(".")) s = s.replace(/0+$/, "").replace(/\.$/, "");
  if (s === "-0") s = "0";
  return s.replace(/^(-?)0\./, "$1.");
}

export function serializeGroups(groups) {
  let out = "";
  let prev = null;
  let lastTok = "";
  let lastFlag = false;
  for (const g of groups) {
    const up = g.c.toUpperCase();
    const same = prev === g.c && up !== "M" && up !== "Z";
    if (!same) { out += g.c; lastTok = ""; lastFlag = false; }
    g.a.forEach((v, k) => {
      const isFlag = up === "A" && (k === 3 || k === 4);
      const tok = isFlag ? String(v) : fmt(v);
      if (lastTok) {
        // a separator is needed unless the next number starts with "-" or with "." after a number that already has a "."; arc flags always get one
        const glue = !isFlag && !lastFlag && (tok.startsWith("-") || (tok.startsWith(".") && lastTok.includes(".")));
        out += glue ? "" : " ";
      }
      out += tok;
      lastTok = tok;
      lastFlag = isFlag;
    });
    prev = g.c;
    if (!g.a.length) { lastTok = ""; lastFlag = false; }
  }
  return out;
}

function arcExtremes(x1, y1, rx, ry, phiDeg, fa, fs, x2, y2) {
  if (rx === 0 || ry === 0 || (x1 === x2 && y1 === y2)) return [[x2, y2]];
  rx = Math.abs(rx); ry = Math.abs(ry);
  const phi = ((phiDeg % 360) * Math.PI) / 180, cosP = Math.cos(phi), sinP = Math.sin(phi);
  const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
  const x1p = cosP * dx + sinP * dy, y1p = -sinP * dx + cosP * dy;
  const lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lam > 1) { const k = Math.sqrt(lam); rx *= k; ry *= k; }
  const sign = fa === fs ? -1 : 1;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const co = den === 0 ? 0 : sign * Math.sqrt(Math.max(0, num / den));
  const cxp = co * ((rx * y1p) / ry), cyp = co * ((-ry * x1p) / rx);
  const cx = cosP * cxp - sinP * cyp + (x1 + x2) / 2, cy = sinP * cxp + cosP * cyp + (y1 + y2) / 2;
  const ang = (ux, uy, vx, vy) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const th1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dth = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!fs && dth > 0) dth -= 2 * Math.PI; else if (fs && dth < 0) dth += 2 * Math.PI;
  const pts = [[x2, y2]];
  const TAU = 2 * Math.PI;
  for (const base of [Math.atan2(-ry * sinP, rx * cosP), Math.atan2(ry * cosP, rx * sinP)]) {
    for (const t of [base, base + Math.PI]) {
      const rel = dth >= 0 ? (((t - th1) % TAU) + TAU) % TAU : (((th1 - t) % TAU) + TAU) % TAU;
      if (rel <= Math.abs(dth)) pts.push([cx + rx * Math.cos(t) * cosP - ry * Math.sin(t) * sinP, cy + rx * Math.cos(t) * sinP + ry * Math.sin(t) * cosP]);
    }
  }
  return pts;
}

/** Splits parsed path data into sub-paths with absolute start and end, the points that bound the shape, closed and dot flags. */
export function analyzePath(groups) {
  const subs = [];
  let cur = null;
  let x = 0, y = 0, sx = 0, sy = 0;
  let last = null;                    // {kind: "c"|"q", x, y} the last control point, for S and T
  let first = true;
  for (const g of groups) {
    const rel = g.c === g.c.toLowerCase();
    const C = g.c.toUpperCase();
    const a = g.a;
    if (C === "M") {
      const nx = rel && !first ? x + a[0] : a[0], ny = rel && !first ? y + a[1] : a[1];
      cur = { groups: [g], start: [nx, ny], end: [nx, ny], pts: [[nx, ny]], z: false };
      subs.push(cur);
      x = nx; y = ny; sx = nx; sy = ny; last = null; first = false;
      continue;
    }
    if (!cur) throw new Error("path data must start with a moveto");
    if (cur.z && C === "Z") continue;                      // a repeated z closes nothing new
    if (cur.z) {                                           // SVG: a drawing command after z starts a new sub-path at the old start point
      cur = { groups: [{ c: "M", a: [sx, sy], implicit: true }], start: [sx, sy], end: [sx, sy], pts: [[sx, sy]], z: false };
      subs.push(cur);
    }
    cur.groups.push(g);
    if (C === "Z") { cur.z = true; x = sx; y = sy; last = null; cur.end = [x, y]; continue; }
    const X = (v) => (rel ? x + v : v), Y = (v) => (rel ? y + v : v);
    if (C === "L" || C === "T") {
      if (C === "T") {
        const ctrl = last && last.kind === "q" ? [2 * x - last.x, 2 * y - last.y] : [x, y];
        cur.pts.push(ctrl);
        last = { kind: "q", x: ctrl[0], y: ctrl[1] };
      } else last = null;
      x = X(a[0]); y = Y(a[1]); cur.pts.push([x, y]);
    } else if (C === "H") { x = X(a[0]); cur.pts.push([x, y]); last = null; }
    else if (C === "V") { y = Y(a[0]); cur.pts.push([x, y]); last = null; }
    else if (C === "C") {
      const c1 = [X(a[0]), Y(a[1])], c2 = [X(a[2]), Y(a[3])];
      x = X(a[4]); y = Y(a[5]);
      cur.pts.push(c1, c2, [x, y]); last = { kind: "c", x: c2[0], y: c2[1] };
    } else if (C === "S") {
      const c1 = last && last.kind === "c" ? [2 * x - last.x, 2 * y - last.y] : [x, y];
      const c2 = [X(a[0]), Y(a[1])];
      x = X(a[2]); y = Y(a[3]);
      cur.pts.push(c1, c2, [x, y]); last = { kind: "c", x: c2[0], y: c2[1] };
    } else if (C === "Q") {
      const c1 = [X(a[0]), Y(a[1])];
      x = X(a[2]); y = Y(a[3]);
      cur.pts.push(c1, [x, y]); last = { kind: "q", x: c1[0], y: c1[1] };
    } else if (C === "A") {
      const nx = X(a[5]), ny = Y(a[6]);
      for (const p of arcExtremes(x, y, a[0], a[1], a[2], a[3], a[4], nx, ny)) cur.pts.push(p);
      x = nx; y = ny; last = null;
    }
    cur.end = [x, y];
  }
  for (const sub of subs) {
    const xs = sub.pts.map((p) => p[0]), ys = sub.pts.map((p) => p[1]);
    sub.bbox = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    const w = sub.bbox[2] - sub.bbox[0], h = sub.bbox[3] - sub.bbox[1];
    sub.empty = sub.groups.length < 2;                         // a lone moveto draws nothing
    sub.dot = !sub.empty && w < 0.05 && h < 0.05;
    sub.closed = !sub.dot && !sub.empty && (sub.z || Math.hypot(sub.end[0] - sub.start[0], sub.end[1] - sub.start[1]) < 0.01);
  }
  return subs;
}

function circleGroups(cx, cy, rx, ry) {
  return [{ c: "M", a: [cx - rx, cy] }, { c: "a", a: [rx, ry, 0, 1, 0, 2 * rx, 0] }, { c: "a", a: [rx, ry, 0, 1, 0, -2 * rx, 0] }, { c: "z", a: [] }];
}

/** Path data of some sub-paths of one element. A relative moveto is kept only when the sub-path before it in the original is the one emitted before it. */
function emitSubs(subs, all) {
  const groups = [];
  subs.forEach((sub, k) => {
    const g = sub.groups.slice();
    const contiguous = k > 0 && all.indexOf(sub) === all.indexOf(subs[k - 1]) + 1;
    if (k === 0 || !contiguous) g[0] = { c: "M", a: sub.start.slice() };
    else if (g[0].implicit) g.shift();                      // the original continued after a z without a moveto
    groups.push(...g);
  });
  return serializeGroups(groups);
}

/** One path-data string -> entries [{d, closed, solid}]. Splits only when a dot or a closed + open mix must be addressable. */
export function entriesFromD(d) {
  const all = analyzePath(parsePathData(d));
  const subs = all.filter((s) => !s.empty);
  if (!subs.length) throw new Error("path data draws nothing");
  const dots = subs.filter((s) => s.dot);
  const body = subs.filter((s) => !s.dot);
  const closedSubs = body.filter((s) => s.closed), openSubs = body.filter((s) => !s.closed);
  if (!dots.length && (!closedSubs.length || !openSubs.length)) return [{ d: emitSubs(subs, all), closed: closedSubs.length > 0, solid: false }];
  const parts = [];
  const seen = new Set();
  for (const sub of subs) {
    if (seen.has(sub)) continue;
    if (sub.dot) {
      const cx = (sub.bbox[0] + sub.bbox[2]) / 2, cy = (sub.bbox[1] + sub.bbox[3]) / 2;
      parts.push({ d: serializeGroups(circleGroups(cx, cy, DOT_RADIUS, DOT_RADIUS)), closed: false, solid: true });
      seen.add(sub);
      continue;
    }
    const mates = closedSubs.includes(sub) ? closedSubs : openSubs;
    mates.forEach((m) => seen.add(m));
    parts.push({ d: emitSubs(mates, all), closed: mates === closedSubs, solid: false });
  }
  return parts;
}

const NUMERIC = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;
const ELEMENTS = {
  path: ["d"], circle: ["cx", "cy", "r"], ellipse: ["cx", "cy", "rx", "ry"], rect: ["x", "y", "width", "height", "rx", "ry"],
  line: ["x1", "y1", "x2", "y2"], polyline: ["points"], polygon: ["points"],
};

/** One vendored element -> entries. Whitelist: the elements above, their geometry attributes, and fill only when exactly "currentColor". */
export function entriesFromElement(tag, attrs, where = "icon") {
  const allowed = ELEMENTS[tag];
  if (!allowed) throw bad(`${where}: element <${tag}> is not on the whitelist`);
  let solid = false;
  const v = {};
  for (const [k, val] of Object.entries(attrs || {})) {
    if (k === "fill") {
      if (val !== "currentColor") throw bad(`${where}: <${tag}> fill="${val}" is not allowed (only currentColor)`);
      solid = true;
    } else if (!allowed.includes(k)) throw bad(`${where}: <${tag}> attribute "${k}" is not on the whitelist`);
    else {
      if (k !== "d" && k !== "points" && !NUMERIC.test(String(val))) throw bad(`${where}: <${tag} ${k}="${val}"> is not numeric`);
      if (k === "points" && !/^[\d\s.,+-eE]+$/.test(String(val))) throw bad(`${where}: points "${val}" is not numeric`);
      if (k === "d" && !/^[MmLlHhVvCcSsQqTtAaZz\d\s.,+-eE]+$/.test(String(val))) throw bad(`${where}: path data has a character outside the path grammar`);
      v[k] = k === "d" || k === "points" ? String(val) : Number(val);
    }
  }
  if (solid && tag !== "circle") throw bad(`${where}: fill="currentColor" is only understood on <circle>`);
  const need = tag === "path" ? ["d"] : tag === "circle" ? ["cx", "cy", "r"] : tag === "ellipse" ? ["cx", "cy", "rx", "ry"] : tag === "rect" ? ["width", "height"]
    : tag === "line" ? ["x1", "y1", "x2", "y2"] : ["points"];
  for (const k of need) if (v[k] === undefined) throw bad(`${where}: <${tag}> needs ${k}`);
  try {
    if (tag === "path") return entriesFromD(v.d);
    if (tag === "circle") {
      if (solid) return [{ d: serializeGroups(circleGroups(v.cx, v.cy, v.r + DOT_RADIUS, v.r + DOT_RADIUS)), closed: false, solid: true }];
      return [{ d: serializeGroups(circleGroups(v.cx, v.cy, v.r, v.r)), closed: true, solid: false }];
    }
    if (tag === "ellipse") return [{ d: serializeGroups(circleGroups(v.cx, v.cy, v.rx, v.ry)), closed: true, solid: false }];
    if (tag === "line") return entriesFromD(`M${v.x1} ${v.y1}L${v.x2} ${v.y2}`);
    if (tag === "polyline" || tag === "polygon") {
      const nums = v.points.trim().split(/[\s,]+/).map(Number);
      if (nums.length < 4 || nums.length % 2 || nums.some((n) => !Number.isFinite(n))) throw new Error(`bad points "${v.points}"`);
      const g = [{ c: "M", a: [nums[0], nums[1]] }];
      for (let i = 2; i < nums.length; i += 2) g.push({ c: "L", a: [nums[i], nums[i + 1]] });
      if (tag === "polygon") g.push({ c: "z", a: [] });
      return [{ d: serializeGroups(g), closed: tag === "polygon", solid: false }];
    }
    // rect
    const x = v.x || 0, y = v.y || 0, w = v.width, h = v.height;
    let rx = v.rx, ry = v.ry;
    if (rx === undefined && ry !== undefined) rx = ry;
    if (ry === undefined && rx !== undefined) ry = rx;
    rx = Math.min(rx || 0, w / 2); ry = Math.min(ry || 0, h / 2);
    const g = [{ c: "M", a: [x + rx, y] }];
    if (w - 2 * rx > 0) g.push({ c: "h", a: [w - 2 * rx] });
    if (rx && ry) g.push({ c: "a", a: [rx, ry, 0, 0, 1, rx, ry] });
    if (h - 2 * ry > 0) g.push({ c: "v", a: [h - 2 * ry] });
    if (rx && ry) g.push({ c: "a", a: [rx, ry, 0, 0, 1, -rx, ry] });
    if (w - 2 * rx > 0) g.push({ c: "h", a: [-(w - 2 * rx)] });
    if (rx && ry) g.push({ c: "a", a: [rx, ry, 0, 0, 1, -rx, -ry] });
    if (h - 2 * ry > 0) g.push({ c: "v", a: [-(h - 2 * ry)] });
    if (rx && ry) g.push({ c: "a", a: [rx, ry, 0, 0, 1, rx, -ry] });
    g.push({ c: "z", a: [] });
    return [{ d: serializeGroups(g), closed: true, solid: false }];
  } catch (e) {
    if (e instanceof ToolError) throw e;
    throw bad(`${where}: ${e.message}`);
  }
}

/** Elements -> one pack icon {d, f?, s?}. */
export function buildIcon(elements, where = "icon") {
  const d = [], f = [], s = [];
  for (const { tag, attrs } of elements) {
    for (const e of entriesFromElement(tag, attrs, where)) {
      const idx = d.length;
      d.push(e.d);
      if (e.solid) s.push(idx); else if (e.closed) f.push(idx);
    }
  }
  const icon = { d };
  if (f.length) icon.f = f;
  if (s.length) icon.s = s;
  return icon;
}

/** Range check helper used for the custom icons (1..23) and the objects (0..48): every point and arc extreme. */
export function pathBounds(d) {
  const subs = analyzePath(parsePathData(d));
  const b = [Infinity, Infinity, -Infinity, -Infinity];
  for (const s of subs) { b[0] = Math.min(b[0], s.bbox[0]); b[1] = Math.min(b[1], s.bbox[1]); b[2] = Math.max(b[2], s.bbox[2]); b[3] = Math.max(b[3], s.bbox[3]); }
  return { bounds: b, subs };
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Reading sources                                                                                                         */
/* ------------------------------------------------------------------------------------------------------------------ */

function sha256File(file) { return createHash("sha256").update(readFileSync(file)).digest("hex"); }

function readJson(file, what = file) {
  if (!existsSync(file)) throw new ToolError(66, "E_USAGE", `${what} does not exist: ${file}`);
  let text;
  try { text = readFileSync(file, "utf8"); if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1); } catch (e) { throw new ToolError(66, "E_USAGE", `cannot read ${file}: ${e.message}`); }
  try { return JSON.parse(text); } catch (e) { throw new ToolError(65, "E_SCHEMA", `${file} is not valid JSON: ${e.message}`); }
}

function isObject(v) { return v !== null && typeof v === "object" && !Array.isArray(v); }

export function loadLock(lockFile) {
  const lock = readJson(lockFile, "the icon lock file");
  const p = new Problems();
  if (!isObject(lock) || !isObject(lock.sources)) throw bad(`${lockFile}: needs a "sources" object`);
  for (const key of ["lucide", "tabler"]) {
    const s = lock.sources[key];
    if (!isObject(s)) { p.add(`sources.${key} is missing`); continue; }
    for (const k of ["version", "dir"]) if (typeof s[k] !== "string") p.add(`sources.${key}.${k} must be a string`);
    for (const k of ["tarball", "nodes"]) {
      if (!isObject(s[k]) || typeof s[k].file !== "string" || !/^[0-9a-f]{64}$/.test(s[k].sha256 || "")) p.add(`sources.${key}.${k} needs file and a 64-hex sha256`);
    }
  }
  p.throwIfAny(`${lockFile}`);
  return lock;
}

/** Verifies both packages against the lock and returns {lucide, tabler} node maps. Throws on any mismatch. */
export function loadVendor(lock, vendorDir) {
  const out = {};
  for (const key of ["lucide", "tabler"]) {
    const s = lock.sources[key];
    const base = join(vendorDir, s.dir);
    for (const part of ["tarball", "nodes"]) {
      const file = join(base, s[part].file);
      if (!existsSync(file)) throw new ToolError(66, "E_USAGE", `${key} ${part} not found: ${file} (use --vendor DIR or CS_ICON_VENDOR)`);
      const got = sha256File(file);
      if (got !== s[part].sha256) throw new ToolError(2, "E_CONFLICT", `${key} ${part} ${s[part].file} does not match tools/icons.lock.json (expected ${s[part].sha256}, got ${got}); nothing was read`);
    }
    out[key] = readJson(join(base, s.nodes.file), `${key} nodes`);
    if (!isObject(out[key])) throw bad(`${key} nodes file is not an object`);
  }
  return out;
}

function sourceOf(c) {
  if (c.name.startsWith("tb-")) return { kind: "tabler", name: c.source_name || c.name.slice(3) };
  if (c.name.startsWith("cs-")) return { kind: "custom", name: c.name };
  return { kind: "lucide", name: c.name };
}

export function checkBlocklist(name) {
  const bare = name.replace(/^(tb|cs)-/, "");
  if (BLOCK_EXACT.has(name) || BLOCK_EXACT.has(bare)) return `"${name}" is on the exclusion list (13e section 3)`;
  if (BLOCK_PREFIX.some((p) => bare.startsWith(p))) return `"${name}" is on the exclusion list (13e section 3)`;
  if (bare.split("-").some((t) => BLOCK_TOKENS.has(t))) return `"${name}" names a religious, gambling or excluded subject (13e section 3)`;
  return null;
}

export function loadCandidates(list) {
  const p = new Problems();
  if (!Array.isArray(list)) throw bad("candidates.json must be an array");
  const seen = new Set();
  const out = [];
  list.forEach((c, i) => {
    const where = `candidates[${i}]${c && c.name ? ` ${c.name}` : ""}`;
    if (!isObject(c)) { p.add(`${where}: not an object`); return; }
    for (const k of Object.keys(c)) if (!["name", "category", "en", "ar", "detail", "source", "source_name", "optional"].includes(k)) p.add(`${where}: unknown key "${k}"`);
    if (typeof c.name !== "string" || !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(c.name)) { p.add(`${where}: bad name`); return; }
    if (seen.has(c.name)) p.add(`${where}: duplicate name`);
    seen.add(c.name);
    if (typeof c.category !== "string" || !/^[a-z][a-z-]*$/.test(c.category)) p.add(`${where}: bad category`);
    if (!Array.isArray(c.en) || !c.en.length || c.en.some((k) => typeof k !== "string" || !ENGLISH_WORDS.test(k))) p.add(`${where}: en must be a non-empty array of lowercase words`);
    if (!Array.isArray(c.ar) || !c.ar.length) p.add(`${where}: ar must be a non-empty array`);
    else for (const k of c.ar) if (typeof k !== "string" || !ARABIC_WORDS.test(fold(k))) p.add(`${where}: Arabic keyword "${k}" has a character outside the Arabic letters`);
    if (c.detail !== undefined && !["low", "mid", "high"].includes(c.detail)) p.add(`${where}: detail must be low, mid or high`);
    const block = checkBlocklist(c.name);
    if (block) p.add(`${where}: ${block}`);
    const src = sourceOf(c);
    if (c.source !== undefined && c.source !== src.kind) p.add(`${where}: source "${c.source}" does not match the name prefix`);
    out.push({ ...c, src });
  });
  p.throwIfAny("candidates.json");
  return out;
}

export function loadMirror(raw, names) {
  const p = new Problems();
  if (!isObject(raw) || !Array.isArray(raw.mirror) || !isObject(raw.keep)) throw bad("mirror.json needs {mirror: [...], keep: {...}}");
  const mirror = new Set(raw.mirror);
  if (mirror.size !== raw.mirror.length) p.add("mirror lists a name twice");
  for (const n of mirror) if (!names.has(n)) p.add(`mirror: "${n}" is not a candidate`);
  for (const [n, why] of Object.entries(raw.keep)) {
    if (!names.has(n)) p.add(`keep: "${n}" is not a candidate`);
    if (mirror.has(n)) p.add(`"${n}" is in both mirror and keep`);
    if (typeof why !== "string" || !why) p.add(`keep: "${n}" needs a reason`);
  }
  p.throwIfAny("mirror.json");
  return { mirror, keep: new Set(Object.keys(raw.keep)) };
}

/** custom.json -> Map name -> {d: [entries...], flags}. Validates the A14 / 13e custom-icon rules. */
export function loadCustom(raw, candidatesByName) {
  const list = Array.isArray(raw) ? raw : isObject(raw) && Array.isArray(raw.icons) ? raw.icons
    : isObject(raw) ? Object.entries(raw).filter(([k]) => k !== "schemaVersion" && k !== "note").map(([name, v]) => (Array.isArray(v) ? { name, d: v } : { name, ...v })) : null;
  if (!list) throw bad("custom.json must be an array, {icons: [...]} or a map of name -> {d, flags}");
  const p = new Problems();
  const out = new Map();
  for (const e of list) {
    const where = `custom ${e && e.name}`;
    if (!isObject(e) || typeof e.name !== "string" || !/^cs-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(e.name)) { p.add(`${where}: needs a name like cs-name`); continue; }
    if (out.has(e.name)) p.add(`${where}: duplicate`);
    const cand = candidatesByName.get(e.name);
    if (!cand || cand.src.kind !== "custom") { p.add(`${where}: no custom candidate entry with this name (add it to tools/icons-src/candidates.json)`); continue; }
    for (const k of Object.keys(e)) if (!["name", "d", "flags", "note", "_note", "comment"].includes(k)) p.add(`${where}: unknown key "${k}" (custom icons are path-only: {name, d, flags})`);
    if (!Array.isArray(e.d) || !e.d.length || e.d.some((d) => typeof d !== "string")) { p.add(`${where}: d must be a non-empty array of path strings`); continue; }
    const bytes = e.d.reduce((n, d) => n + d.length, 0);
    if (bytes > MAX_CUSTOM_BYTES) p.add(`${where}: ${bytes} bytes of path data, the limit is ${MAX_CUSTOM_BYTES}`);
    const entries = [];
    let ok = true;
    for (const d of e.d) {
      try {
        const { bounds, subs } = pathBounds(d);
        if (subs.some((s) => s.dot)) { p.add(`${where}: a dot (a zero-length segment) is not allowed; draw a small closed circle`); ok = false; }
        if (bounds[0] < 1 - 1e-6 || bounds[1] < 1 - 1e-6 || bounds[2] > 23 + 1e-6 || bounds[3] > 23 + 1e-6) {
          p.add(`${where}: coordinates [${bounds.map((n) => +n.toFixed(2)).join(", ")}] leave the 1..23 box`); ok = false;
        }
        entries.push(...entriesFromD(d));
      } catch (err) { p.add(`${where}: ${err.message}`); ok = false; }
    }
    if (e.flags !== undefined) {
      if (!isObject(e.flags) || Object.keys(e.flags).some((k) => !["d", "p", "h", "a", "o", "c"].includes(k))) p.add(`${where}: flags may only hold d p h a o c`);
    }
    if (ok) out.set(e.name, { entries, flags: e.flags || {} });
  }
  p.throwIfAny("custom.json");
  return out;
}

const PLACEHOLDER = ["M4 4h16v16H4z", "M4 4l16 16"];

/* ------------------------------------------------------------------------------------------------------------------ */
/* Pack                                                                                                                    */
/* ------------------------------------------------------------------------------------------------------------------ */

export function buildPack({ candidates, vendor, custom, duo, warnings, strict }) {
  const icons = {};
  const optional = {};
  const stats = { lucide: 0, tabler: 0, custom: 0, placeholders: [], solid: 0, tinted: 0 };
  const p = new Problems();
  for (const c of candidates) {
    let entries;
    const target = c.optional ? optional : icons;
    if (c.src.kind === "custom") {
      const hit = custom.get(c.name);
      if (hit) entries = hit.entries;
      else {
        stats.placeholders.push(c.name);
        entries = PLACEHOLDER.flatMap((d) => entriesFromD(d));
      }
    } else {
      const nodes = vendor[c.src.kind][c.src.name];
      if (!nodes) { p.add(`${c.name}: no icon "${c.src.name}" in the ${c.src.kind} package`); continue; }
      try {
        const icon = buildIcon(nodes.map(([tag, attrs]) => ({ tag, attrs })), c.name);
        target[c.name] = icon;
        if (!c.optional) stats[c.src.kind]++;
        continue;
      } catch (e) { p.add(e.message); continue; }
    }
    const icon = { d: [], f: [], s: [] };
    entries.forEach((e, i) => { icon.d.push(e.d); if (e.solid) icon.s.push(i); else if (e.closed) icon.f.push(i); });
    if (!icon.f.length) delete icon.f;
    if (!icon.s.length) delete icon.s;
    target[c.name] = icon;
    if (!c.optional) stats.custom++;
  }
  p.throwIfAny("pack");
  if (stats.placeholders.length) {
    const m = `custom icons not drawn yet, placeholders used: ${stats.placeholders.join(", ")}`;
    if (strict) throw bad(m);
    warnings.push(m);
  }
  // duo.json: hand-reviewed tint indices
  const pd = new Problems();
  for (const [name, v] of Object.entries(duo)) {
    const icon = icons[name];
    if (!icon) { pd.add(`duo.json: "${name}" is not a bundled icon`); continue; }
    if (!isObject(v) || !Array.isArray(v.f) || v.f.some((i) => !Number.isInteger(i) || i < 0 || i >= icon.d.length)) { pd.add(`duo.json: "${name}" needs f: [indices into its ${icon.d.length} entries]`); continue; }
    if (v.n !== icon.d.length) { pd.add(`duo.json: "${name}" was reviewed with ${v.n} entries but now has ${icon.d.length}; review it again`); continue; }
    const solid = new Set(icon.s || []);
    if (v.f.some((i) => solid.has(i))) { pd.add(`duo.json: "${name}" tints a solid dot`); continue; }
    if (v.f.length) icon.f = [...new Set(v.f)].sort((a, b) => a - b); else delete icon.f;
  }
  pd.throwIfAny("duo.json");
  for (const icon of Object.values(icons)) { if (icon.s) stats.solid += icon.s.length; if (icon.f) stats.tinted++; }
  const sorted = (m) => Object.fromEntries(Object.keys(m).sort().map((k) => [k, m[k]]));
  return { icons: sorted(icons), optional: sorted(optional), stats };
}

function packBlock(icons) {
  return { schemaVersion: 2, dataVersion: DATA_VERSION, viewBox: 24, sources: { lucide: "1.53.0", tabler: "3.49.0" }, icons };
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Index                                                                                                                   */
/* ------------------------------------------------------------------------------------------------------------------ */

const FLAG_ORDER = ["d", "m", "p", "h", "a", "o", "c"];
function detailOf(icon) {
  const n = icon.d.reduce((s, d) => s + d.length, 0);
  return n <= 150 ? "l" : n <= 300 ? "m" : "h";
}
function uniq(list) { return [...new Set(list)]; }

function shardFiles(dir, prefix) {
  if (!existsSync(dir)) return [];
  const re = new RegExp(`^${prefix}\\.([a-z0-9-]+)\\.json$`);
  return readdirSync(dir).filter((f) => re.test(f)).sort().map((f) => ({ id: f.match(re)[1], file: join(dir, f), name: f }));
}

function normaliseIndexShard(raw, name) {
  let entries;
  if (Array.isArray(raw)) entries = raw;
  else if (isObject(raw) && Array.isArray(raw.icons)) entries = raw.icons;
  else if (isObject(raw) && isObject(raw.icons)) entries = Object.entries(raw.icons).map(([n, v]) => ({ name: n, ...(Array.isArray(v) ? { ar: v } : v) }));
  else if (isObject(raw)) entries = Object.entries(raw).filter(([k]) => !["schemaVersion", "note", "_note", "comment", "shard"].includes(k)).map(([n, v]) => ({ name: n, ...(Array.isArray(v) ? { ar: v } : v) }));
  else throw bad(`${name}: expected {icons: {...}}, a map or an array`);
  return entries.map((e) => (Array.isArray(e) ? { name: e[0], ar: e[3] || [], en: e[2] || [], flags: e[4] || {} } : e));
}

const PATCH_KEYS = new Set(["name", "icon", "id", "ar", "add", "addAr", "ar_add", "keywords", "arabic", "remove", "removeAr", "ar_remove", "replace", "replaceAr", "ar_replace",
  "en", "addEn", "en_add", "removeEn", "en_remove", "replaceEn", "en_replace", "flags", "d", "p", "h", "a", "o", "c", "note", "_note", "comment", "why"]);

export function buildIndex({ candidates, packIcons, mirror, custom, shards, warnings }) {
  const byName = new Map();
  const p = new Problems();
  for (const c of candidates) {
    const icon = packIcons[c.name];
    const flags = {};
    flags.d = c.detail && c.src.kind !== "custom" ? c.detail[0] : detailOf(icon || { d: [] });
    if (mirror.mirror.has(c.name)) flags.m = 1;
    if (DEFAULT_FLAGS.neg.includes(c.name)) flags.p = "neg"; else if (DEFAULT_FLAGS.warn.includes(c.name)) flags.p = "warn";
    for (const k of ["h", "a", "o", "c"]) if (DEFAULT_FLAGS[k].includes(c.name)) flags[k] = 1;
    const cust = custom.get(c.name);
    if (cust) applyFlags(flags, cust.flags, `custom ${c.name}`, p);
    byName.set(c.name, { c, name: c.name, category: c.category, en: uniq(c.en.map((k) => k.toLowerCase())), ar: uniq(c.ar.map(fold)), flags, optional: !!c.optional });
  }
  const touched = new Map();
  for (const shard of shards) {
    let entries;
    try { entries = normaliseIndexShard(shard.raw, shard.name); } catch (e) { p.add(e.message); continue; }
    for (const e of entries) {
      const where = `${shard.name} ${e && (e.name || e.icon || e.id)}`;
      if (!isObject(e)) { p.add(`${where}: entry is not an object`); continue; }
      for (const k of Object.keys(e)) if (!PATCH_KEYS.has(k)) p.add(`${where}: unknown key "${k}"`);
      const name = e.name || e.icon || e.id;
      if (typeof name !== "string") { p.add(`${where}: needs a name`); continue; }
      const target = byName.get(name);
      if (!target) {
        if (RETIRED.has(name)) warnings.push(`${shard.name}: "${name}" was retired (custom slot respent); its keywords are ignored`);
        else p.add(`${where}: unknown icon`);
        continue;
      }
      const pick = (label, keys, fix, ok, okMessage) => {
        const key = keys.find((k) => e[k] !== undefined);
        if (key === undefined) return null;
        const v = e[key];
        if (!Array.isArray(v) || v.some((s) => typeof s !== "string")) { p.add(`${where}: ${key} must be an array of strings`); return null; }
        const fixed = v.map(fix).filter(Boolean);
        for (const k of fixed) if (ok && !ok.test(k)) p.add(`${where}: ${label} keyword "${k}" ${okMessage}`);
        return fixed;
      };
      const foldAr = (s) => fold(s);
      const lowEn = (s) => s.toLowerCase().trim();
      const arMsg = "has a character outside the Arabic letters";
      const enMsg = "must be lowercase letters, digits, spaces or hyphens";
      const arAdd = pick("Arabic", ["ar", "add", "addAr", "ar_add", "keywords", "arabic"], foldAr, ARABIC_WORDS, arMsg);
      const arReplace = pick("Arabic", ["replace", "replaceAr", "ar_replace"], foldAr, ARABIC_WORDS, arMsg);
      const arRemove = pick("Arabic", ["remove", "removeAr", "ar_remove"], foldAr, null);
      const enAdd = pick("English", ["en", "addEn", "en_add"], lowEn, ENGLISH_WORDS, enMsg);
      const enReplace = pick("English", ["replaceEn", "en_replace"], lowEn, ENGLISH_WORDS, enMsg);
      const enRemove = pick("English", ["removeEn", "en_remove"], lowEn, null);
      if (arReplace) target.ar = uniq(arReplace);
      if (arAdd) target.ar = uniq([...target.ar, ...arAdd]);
      if (arRemove) { const gone = new Set(arRemove); target.ar = target.ar.filter((k) => !gone.has(k)); }
      if (enReplace) target.en = uniq(enReplace);
      if (enAdd) target.en = uniq([...target.en, ...enAdd]);
      if (enRemove) { const gone = new Set(enRemove); target.en = target.en.filter((k) => !gone.has(k)); }
      const inline = {};
      for (const k of ["d", "p", "h", "a", "o", "c"]) if (e[k] !== undefined) inline[k] = e[k];
      applyFlags(target.flags, { ...(isObject(e.flags) ? e.flags : {}), ...inline }, where, p);
      if (!target.ar.length || !target.en.length) p.add(`${where}: the icon would be left with no ${target.ar.length ? "English" : "Arabic"} keyword`);
      if (!touched.has(name)) touched.set(name, []);
      touched.get(name).push(shard.id);
    }
  }
  p.throwIfAny("index");
  for (const [name, ids] of touched) if (ids.length > 1) warnings.push(`index: "${name}" is patched by shards ${ids.join(", ")}`);
  const entries = [...byName.values()];
  const main = entries.filter((e) => !e.optional).map(toIndexRow);
  const brands = entries.filter((e) => e.optional).map(toIndexRow);
  const rank = new Map();
  candidates.forEach((c) => { if (!rank.has(c.category)) rank.set(c.category, rank.size); });
  const order = (rows) => rows.sort((a, b) => (rank.get(a[1]) - rank.get(b[1])) || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return { rows: order(main), brandRows: order(brands), touched: touched.size, keywords: main.reduce((n, r) => n + r[3].length, 0) };
}

function applyFlags(flags, patch, where, p) {
  if (!isObject(patch)) return;
  for (const [k, v] of Object.entries(patch)) {
    if (k === "m") { p.add(`${where}: flag m comes from mirror.json only`); continue; }
    if (!["d", "p", "h", "a", "o", "c"].includes(k)) { p.add(`${where}: unknown flag "${k}"`); continue; }
    if (k === "d") {
      if (!["l", "m", "h"].includes(v)) p.add(`${where}: flag d must be l, m or h`); else flags.d = v;
    } else if (k === "p") {
      if (v === null || v === false || v === 0) delete flags.p;
      else if (v === "neg" || v === "warn") flags.p = v;
      else p.add(`${where}: flag p must be neg, warn or null`);
    } else if (v === null || v === false || v === 0) delete flags[k];
    else if (v === true || v === 1) flags[k] = 1;
    else p.add(`${where}: flag ${k} must be 1, true, 0, false or null`);
  }
}

function toIndexRow(e) {
  const flags = {};
  for (const k of FLAG_ORDER) if (e.flags[k] !== undefined) flags[k] = e.flags[k];
  return [e.name, e.category, e.en, e.ar, flags];
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Concepts                                                                                                                */
/* ------------------------------------------------------------------------------------------------------------------ */

function conceptList(raw, name) {
  if (Array.isArray(raw)) return raw;
  if (isObject(raw) && Array.isArray(raw.concepts)) return raw.concepts;
  throw bad(`${name}: expected {concepts: [...]} or an array of concepts`);
}

export function buildConcepts({ shards, iconNames, optionalNames, categories, withBrands, warnings }) {
  const p = new Problems();
  const ids = new Map();
  const out = [];
  const perShard = {};
  for (const shard of shards) {
    let list;
    try { list = conceptList(shard.raw, shard.name); } catch (e) { p.add(e.message); continue; }
    perShard[shard.id] = list.length;
    list.forEach((c, i) => {
      const where = `${shard.name} concept[${i}] ${isObject(c) && c.id ? c.id : ""}`.trim();
      if (!isObject(c)) { p.add(`${where}: not an object`); return; }
      for (const k of Object.keys(c)) if (!["id", "cat", "forms", "icons", "object", "primitive", "pol", "home", "note", "_note", "comment", "why"].includes(k)) p.add(`${where}: unknown key "${k}"`);
      if (typeof c.id !== "string" || !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(c.id)) { p.add(`${where}: id must be kebab-case ASCII`); return; }
      if (ids.has(c.id)) p.add(`${where}: duplicate concept id (also in ${ids.get(c.id)})`);
      ids.set(c.id, shard.name);
      if (!categories.has(c.cat)) p.add(`${where}: unknown category "${c.cat}"`);
      if (!isObject(c.forms)) { p.add(`${where}: forms must be an object`); return; }
      const forms = {};
      const all = new Set();
      for (const [dialect, list2] of Object.entries(c.forms)) {
        if (!DIALECTS.includes(dialect)) { p.add(`${where}: unknown dialect list "${dialect}" (use ${DIALECTS.join(", ")})`); continue; }
        if (!Array.isArray(list2)) { p.add(`${where}: forms.${dialect} must be an array`); continue; }
        const kept = [];
        for (const f of list2) {
          if (typeof f !== "string" || !f) { p.add(`${where}: forms.${dialect} holds a non-string`); continue; }
          if (!isFolded(f)) { p.add(`${where}: form "${f}" is not normalised (expected "${fold(f)}"; letters only, no ة أ إ آ ى ؤ ئ, no tashkeel or tatweel)`); continue; }
          if (f.length < 2) { p.add(`${where}: form "${f}" is too short`); continue; }
          if (f.split(" ").length > 3) { p.add(`${where}: form "${f}" has more than 3 tokens`); continue; }
          if (!kept.includes(f)) kept.push(f);
          all.add(f);
        }
        if (kept.length) forms[dialect] = kept;
      }
      if (all.size < 8) p.add(`${where}: ${all.size} distinct forms, at least 8 are required`);
      if (!Array.isArray(c.icons) || !c.icons.length) { p.add(`${where}: icons must be a non-empty array`); return; }
      const icons = [];
      for (const n of c.icons) {
        if (typeof n !== "string") { p.add(`${where}: icons holds a non-string`); continue; }
        if (iconNames.has(n)) { if (!icons.includes(n)) icons.push(n); }
        else if (RETIRED.has(n)) warnings.push(`${shard.name} ${c.id}: icon "${n}" was retired and is dropped`);
        else if (optionalNames.has(n)) { if (withBrands && !icons.includes(n)) icons.push(n); else warnings.push(`${shard.name} ${c.id}: "${n}" is an opt-in brand glyph, not bundled by default; dropped`); }
        else p.add(`${where}: unknown icon "${n}"`);
      }
      if (!icons.length) p.add(`${where}: no bundled icon is left`);
      else if (icons.length < 3 || icons.length > 5) warnings.push(`${shard.name} ${c.id}: ${icons.length} icon(s); the spec asks for 3-5 ranked`);
      let object = c.object ?? null;
      if (object !== null) {
        object = OBJECT_ALIASES[object] || object;
        if (!OBJECT_IDS.includes(object)) { p.add(`${where}: unknown object "${c.object}"`); object = null; }
      }
      const primitive = c.primitive ?? null;
      if (primitive !== null && !PRIMITIVES.includes(primitive)) p.add(`${where}: primitive must be one of ${PRIMITIVES.join(", ")} or null`);
      const pol = c.pol ?? null;
      if (pol !== null && pol !== "neg" && pol !== "warn") p.add(`${where}: pol must be neg, warn or null`);
      const home = c.home ?? null;
      if (home !== null && !isFolded(home)) p.add(`${where}: home must be a normalised word`);
      const row = { id: c.id, cat: c.cat, forms, icons };
      if (object) row.object = object;
      if (primitive) row.primitive = primitive;
      if (pol) row.pol = pol;
      if (home) row.home = home;
      out.push(row);
    });
  }
  p.throwIfAny("concepts");
  out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { concepts: out, perShard };
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Objects                                                                                                                 */
/* ------------------------------------------------------------------------------------------------------------------ */

function objectList(raw, name) {
  if (Array.isArray(raw)) return raw;
  if (isObject(raw) && Array.isArray(raw.objects)) return raw.objects;
  throw bad(`${name}: expected {objects: [...]} or an array of objects`);
}

export function buildObjects({ shards, strict, warnings }) {
  const p = new Problems();
  const out = new Map();
  const perShard = {};
  for (const shard of shards) {
    let list;
    try { list = objectList(shard.raw, shard.name); } catch (e) { p.add(e.message); continue; }
    perShard[shard.id] = list.length;
    list.forEach((o, i) => {
      const where = `${shard.name} object[${i}] ${isObject(o) && o.id ? o.id : ""}`.trim();
      if (!isObject(o)) { p.add(`${where}: not an object`); return; }
      for (const k of Object.keys(o)) if (!["id", "viewBox", "paths", "note", "_note", "comment"].includes(k)) p.add(`${where}: unknown key "${k}"`);
      const id = OBJECT_ALIASES[o.id] || o.id;
      if (!OBJECT_IDS.includes(id)) { p.add(`${where}: id is not one of the 40 objects of spec 3.1.1`); return; }
      if (out.has(id)) p.add(`${where}: duplicate object (also in ${out.get(id).shard})`);
      if (o.viewBox !== 48) p.add(`${where}: viewBox must be 48`);
      if (!Array.isArray(o.paths) || !o.paths.length) { p.add(`${where}: paths must be a non-empty array`); return; }
      if (o.paths.length > MAX_OBJECT_PATHS) p.add(`${where}: ${o.paths.length} paths, at most ${MAX_OBJECT_PATHS}`);
      const paths = [];
      let bytes = 0;
      o.paths.forEach((pt, k) => {
        const w = `${where} path[${k}]`;
        if (!isObject(pt) || typeof pt.d !== "string") { p.add(`${w}: needs {d, role}`); return; }
        for (const key of Object.keys(pt)) if (!["d", "role"].includes(key)) p.add(`${w}: unknown key "${key}" (objects take only d and role)`);
        if (!ROLES.includes(pt.role)) p.add(`${w}: role must be base, shade or hi`);
        try {
          const { bounds, subs } = pathBounds(pt.d);
          if (subs.some((s) => !s.closed)) p.add(`${w}: every sub-path must be closed (z or back to its start)`);
          if (bounds[0] < -1e-6 || bounds[1] < -1e-6 || bounds[2] > 48 + 1e-6 || bounds[3] > 48 + 1e-6) p.add(`${w}: coordinates leave the 0..48 grid`);
          const d = serializeGroups(subs.flatMap((s) => s.groups));
          bytes += d.length;
          paths.push({ d, role: pt.role });
        } catch (e) { p.add(`${w}: ${e.message}`); }
      });
      if (bytes > MAX_OBJECT_BYTES) p.add(`${where}: ${bytes} bytes of path data, the limit is ${MAX_OBJECT_BYTES}`);
      out.set(id, { shard: shard.name, row: { id, viewBox: 48, paths } });
    });
  }
  p.throwIfAny("objects");
  const objects = [...out.values()].map((v) => v.row).sort((a, b) => OBJECT_IDS.indexOf(a.id) - OBJECT_IDS.indexOf(b.id));
  if (strict) {
    const missing = HERO_OBJECTS.filter((id) => !out.has(id));
    if (missing.length) throw bad(`objects: the 12 hero objects are required, missing ${missing.join(", ")}`);
  } else if (shards.length && objects.length < HERO_OBJECTS.length) warnings.push(`objects: ${objects.length} of the 12 hero objects so far`);
  return { objects, perShard };
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Emoji map and cheat sheet                                                                                               */
/* ------------------------------------------------------------------------------------------------------------------ */

export function buildEmoji(raw, iconNames) {
  const p = new Problems();
  if (!isObject(raw) || !isObject(raw.map)) throw bad("emoji-map.json needs {map: {emoji: icon}}");
  const map = {};
  for (const [e, name] of Object.entries(raw.map)) {
    if (e.includes(U(0xFE0F))) p.add(`"${e}" carries U+FE0F; keys are stored without it`);
    if (/^[\x00-\x7F]*$/.test(e) || [...e].length !== 1) p.add(`"${e}" is not a single emoji code point`);
    if (!iconNames.has(name)) p.add(`"${e}" maps to "${name}", which is not a bundled icon`);
    map[e] = name;
  }
  p.throwIfAny("emoji-map.json");
  return map;
}

export function buildCheatSheet({ candidates, iconNames, gated }) {
  const groups = new Map();
  for (const c of candidates) {
    if (!iconNames.has(c.name)) continue;
    if (!groups.has(c.category)) groups.set(c.category, []);
    groups.get(c.category).push(c.name);
  }
  const lines = [
    "# Icons",
    `${iconNames.size} icons, exact names (tb- Tabler, cs- custom, the rest Lucide). Search by meaning: python scripts/icon_search.py --query "<arabic or english>".`,
    "Rules",
    "1. Choose for the slide's idea, not its first noun. Each icon once per deck, never on adjacent slides.",
    "2. Warning or negation: triangle-alert or circle-x, or the concept icon with the slash modifier.",
    gated.length ? `3. Heritage and occasion icons (${gated.join(" ")}) only when the slide's own words name them; never as decoration, never beside a person icon.` : "3. Heritage and occasion icons only when the slide's own words name them; never as decoration, never beside a person icon.",
    "4. xl and hero sizes: detail l or m icons or an object; detail h icons stay lg or below.",
    "5. Faceless people only; no brand logos. Never a typed glyph or emoji in place of an icon.",
    "",
  ];
  for (const [cat, names] of groups) lines.push(`${cat}: ${names.join(" ")}`);
  return lines.join("\n") + "\n";
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Orchestration                                                                                                           */
/* ------------------------------------------------------------------------------------------------------------------ */

function minified(obj) { return JSON.stringify(obj) + "\n"; }

function readShards(dir, prefix) {
  return shardFiles(dir, prefix).map((s) => ({ ...s, raw: readJson(s.file, s.name) }));
}

export function buildAll(opts) {
  const warnings = [];
  const src = opts.src;
  const candidatesRaw = readJson(join(src, "candidates.json"), "candidates.json");
  const candidates = loadCandidates(candidatesRaw);
  const byName = new Map(candidates.map((c) => [c.name, c]));
  const names = new Set(byName.keys());
  const mirror = loadMirror(readJson(join(src, "mirror.json"), "mirror.json"), names);
  const duoRaw = existsSync(join(src, "duo.json")) ? readJson(join(src, "duo.json")) : { icons: {} };
  if (!isObject(duoRaw) || !isObject(duoRaw.icons)) throw bad("duo.json needs {icons: {name: {f, n}}}");
  const custom = existsSync(join(src, "custom.json")) ? loadCustom(readJson(join(src, "custom.json")), byName) : new Map();
  const lock = loadLock(opts.lock);
  const vendor = loadVendor(lock, opts.vendor);
  const pack = buildPack({ candidates, vendor, custom, duo: duoRaw.icons, warnings, strict: opts.strict });

  const useShards = !opts.noShards;
  const indexShards = useShards ? readShards(src, "index") : [];
  const conceptShards = useShards ? readShards(src, "concepts") : [];
  const objectShards = useShards ? readShards(src, "objects") : [];
  for (const [flag, kind, list] of [[opts.mergeIndex, "index", indexShards], [opts.mergeConcepts, "concepts", conceptShards], [opts.mergeObjects, "objects", objectShards]]) {
    if ((flag || opts.strict) && !list.length) throw new ToolError(66, "E_USAGE", `no ${kind} shard found in ${src} (${kind}.<name>.json)`);
  }

  const index = buildIndex({ candidates, packIcons: { ...pack.icons, ...pack.optional }, mirror, custom, shards: indexShards, warnings });
  const iconNames = new Set(Object.keys(pack.icons));
  const optionalNames = new Set(Object.keys(pack.optional));
  const categories = new Set(candidates.filter((c) => !c.optional).map((c) => c.category));
  const concepts = buildConcepts({ shards: conceptShards, iconNames, optionalNames, categories, withBrands: opts.withBrands, warnings });
  const objects = buildObjects({ shards: objectShards, strict: opts.strict, warnings });
  const emoji = buildEmoji(readJson(join(src, "emoji-map.json"), "emoji-map.json"), iconNames);

  const files = [
    { name: "pack.json", text: minified(packBlock(pack.icons)) },
    { name: "index.json", text: minified(index.rows) },
    { name: "concepts.json", text: minified({ schemaVersion: 1, dataVersion: DATA_VERSION, concepts: concepts.concepts }) },
    { name: "objects.json", text: minified({ schemaVersion: 1, dataVersion: DATA_VERSION, viewBox: 48, objects: objects.objects }) },
    { name: "emoji-map.json", text: minified({ schemaVersion: 1, dataVersion: DATA_VERSION, map: emoji }) },
    { name: "icons.md", text: buildCheatSheet({ candidates, iconNames, gated: index.rows.filter((r) => r[4].o).map((r) => r[0]) }), refs: true },
  ];
  if (opts.withBrands) files.push({ name: "brands.json", text: minified({ schemaVersion: 1, dataVersion: DATA_VERSION, optional: true, viewBox: 24, icons: pack.optional, index: index.brandRows }) });

  const problems = new Problems();
  for (const f of files) {
    const bytes = Buffer.byteLength(f.text, "utf8");
    f.bytes = bytes;
    if (CAPS[f.name] && bytes > CAPS[f.name]) problems.add(`${f.name} is ${bytes} B, the limit is ${CAPS[f.name]} B`);
    if (/http|<\/script|<!--/i.test(f.text)) problems.add(`${f.name} contains "http", a closing script tag or an HTML comment opener`);
  }
  problems.throwIfAny("output limits");

  const counts = {
    icons: iconNames.size, lucide: pack.stats.lucide, tabler: pack.stats.tabler, custom: pack.stats.custom, placeholders: pack.stats.placeholders.length,
    solidDots: pack.stats.solid, tintedIcons: pack.stats.tinted, keywords: index.keywords, indexPatched: index.touched,
    concepts: concepts.concepts.length, objects: objects.objects.length, emoji: Object.keys(emoji).length, brandGlyphs: optionalNames.size,
  };
  const shards = { index: indexShards.map((s) => s.id), concepts: concepts.perShard, objects: objects.perShard };
  return { files, counts, shards, warnings, pack };
}

function writeAtomic(file, text) {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, text, "utf8");
  renameSync(tmp, file);
}

function target(opts, f) { return f.refs && !opts.outGiven ? join(opts.refs, f.name) : join(opts.out, f.name); }

/** --check without the vendored packages: validates the committed outputs on their own. */
function validateCommitted(opts, problems, report) {
  for (const name of Object.keys(CAPS)) {
    const file = join(opts.out, name);
    if (!existsSync(file)) { report.push({ file: name, status: "absent" }); continue; }
    const text = readFileSync(file, "utf8");
    const bytes = Buffer.byteLength(text, "utf8");
    try { JSON.parse(text); } catch (e) { problems.add(`${name} is not valid JSON: ${e.message}`); continue; }
    if (bytes > CAPS[name]) problems.add(`${name} is ${bytes} B, the limit is ${CAPS[name]} B`);
    if (/http|<\/script|<!--/i.test(text)) problems.add(`${name} contains "http", a closing script tag or an HTML comment opener`);
    report.push({ file: name, status: "ok (standalone)", bytes });
  }
}

export function run(opts) {
  const result = { ok: true, mode: opts.check ? "check" : "build", files: [], counts: null, shards: null, warnings: [] };
  const vendorOk = existsSync(opts.vendor);
  if (opts.check && !vendorOk) {
    const problems = new Problems();
    validateCommitted(opts, problems, result.files);
    result.warnings.push(`vendored packages not found at ${opts.vendor}; the committed outputs were validated on their own`);
    problems.throwIfAny("committed outputs");
    return result;
  }
  const built = buildAll(opts);
  result.counts = built.counts;
  result.shards = built.shards;
  result.warnings = built.warnings;
  const problems = new Problems();
  for (const f of built.files) {
    const file = target(opts, f);
    const row = { file: f.name, bytes: f.bytes, cap: CAPS[f.name] || null };
    if (opts.check) {
      if (!existsSync(file)) { row.status = "absent"; if (opts.strict) problems.add(`${f.name} has not been generated`); }
      else {
        const current = readFileSync(file, "utf8").replace(/\r\n?/g, "\n");
        row.status = current === f.text ? "ok" : "DIFFERS";
        if (current !== f.text) problems.add(`${f.name} differs from a fresh build; run node tools/build-icons.mjs`);
      }
    } else {
      try { writeAtomic(file, f.text); } catch (e) { throw new ToolError(73, "E_IO", `cannot write ${file}: ${e.message}`); }
      row.status = "wrote";
    }
    result.files.push(row);
  }
  if (problems.list.length) {
    const err = new ToolError(2, "E_CONFLICT", `${problems.list.join("\n")}`);
    err.result = result;
    throw err;
  }
  return result;
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* CLI                                                                                                                     */
/* ------------------------------------------------------------------------------------------------------------------ */

function usage(code, message) {
  if (message) process.stderr.write(`cs-error: E_USAGE: ${message}\n`);
  const short = "usage: node tools/build-icons.mjs [--out DIR] [--check] [--strict] [--merge-index] [--merge-concepts] [--merge-objects] [--cheatsheet] [--all]\n"
    + "                                   [--no-shards] [--with-brands] [--src DIR] [--vendor DIR] [--lock FILE] [--format text|json] [--verbose]\n";
  if (code === 0) {
    // --help prints the header of this file: the outputs, the source formats, the flags and the exit codes live in one place
    const lines = readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(1);
    const header = [];
    for (const l of lines) { if (!l.startsWith("//")) break; header.push(l.replace(/^\/\/ ?/, "")); }
    process.stdout.write(`${header.join("\n")}\n`);
  } else process.stderr.write(short);
  process.exit(code);
}

export function parseArgs(argv) {
  const o = { out: DEFAULTS.out, refs: DEFAULTS.refs, outGiven: false, src: DEFAULTS.src, lock: DEFAULTS.lock, vendor: process.env.CS_ICON_VENDOR ? resolve(process.env.CS_ICON_VENDOR) : DEFAULTS.vendor,
    check: false, strict: false, mergeIndex: false, mergeConcepts: false, mergeObjects: false, cheatsheet: false, noShards: false, withBrands: false, format: "text", verbose: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const value = () => { const v = argv[++i]; if (v === undefined || v.startsWith("--")) usage(64, `${a} needs a value`); return v; };
    if (a === "--help" || a === "-h") usage(0);
    else if (a === "--check") o.check = true;
    else if (a === "--strict") o.strict = true;
    else if (a === "--merge-index") o.mergeIndex = true;
    else if (a === "--merge-concepts") o.mergeConcepts = true;
    else if (a === "--merge-objects") o.mergeObjects = true;
    else if (a === "--cheatsheet") o.cheatsheet = true;
    else if (a === "--all") { o.mergeIndex = o.mergeConcepts = o.mergeObjects = o.cheatsheet = true; }
    else if (a === "--no-shards") o.noShards = true;
    else if (a === "--with-brands") o.withBrands = true;
    else if (a === "--verbose") o.verbose = true;
    else if (a === "--out") { o.out = resolve(value()); o.outGiven = true; }
    else if (a === "--src") o.src = resolve(value());
    else if (a === "--vendor") o.vendor = resolve(value());
    else if (a === "--lock") o.lock = resolve(value());
    else if (a === "--format") { o.format = value(); if (!["text", "json"].includes(o.format)) usage(64, "--format must be text or json"); }
    else usage(64, `unknown argument ${a}`);
  }
  if (o.noShards && (o.mergeIndex || o.mergeConcepts || o.mergeObjects)) usage(64, "--no-shards cannot be combined with --merge-*");
  return o;
}

function printText(result, opts) {
  const lines = [];
  for (const f of result.files) {
    const size = f.bytes === undefined ? "" : `${String(f.bytes).padStart(7)} B${f.cap ? ` / ${f.cap}` : ""}`;
    lines.push(`${(f.status || "").padEnd(9)} ${f.file.padEnd(15)} ${size}`);
  }
  if (result.counts) {
    const c = result.counts;
    lines.push(`icons ${c.icons} (lucide ${c.lucide}, tabler ${c.tabler}, custom ${c.custom}${c.placeholders ? `, ${c.placeholders} placeholder` : ""}) · solid dots ${c.solidDots} · duo-tinted ${c.tintedIcons} · keywords ${c.keywords}`);
    lines.push(`concepts ${c.concepts} · objects ${c.objects} · emoji ${c.emoji} · opt-in brand glyphs ${c.brandGlyphs}`);
    const s = result.shards;
    const part = (label, v) => `${label}: ${Array.isArray(v) ? (v.length ? v.join(",") : "none") : (Object.keys(v).length ? Object.entries(v).map(([k, n]) => `${k}=${n}`).join(" ") : "none")}`;
    lines.push(`shards · ${part("index", s.index)} · ${part("concepts", s.concepts)} · ${part("objects", s.objects)}`);
  }
  const shown = opts.verbose ? result.warnings : result.warnings.slice(0, 8);
  for (const w of shown) lines.push(`warning: ${w}`);
  if (result.warnings.length > shown.length) lines.push(`warning: ...and ${result.warnings.length - shown.length} more (--verbose)`);
  process.stdout.write(lines.join("\n") + "\n");
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const result = run(opts);
  if (opts.format === "json") process.stdout.write(JSON.stringify(result, null, 2) + "\n"); else printText(result, opts);
  return 0;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url).toLowerCase() === resolve(process.argv[1]).toLowerCase();
if (isMain) {
  try {
    process.exitCode = main();
  } catch (e) {
    if (e instanceof ToolError) {
      process.stderr.write(`cs-error: ${e.code}: ${e.message}\n`);
      process.exitCode = e.exitCode;
    } else {
      process.stderr.write(`cs-error: E_INTERNAL: ${e && e.stack ? e.stack : e}\n`);
      process.exitCode = 70;
    }
  }
}
