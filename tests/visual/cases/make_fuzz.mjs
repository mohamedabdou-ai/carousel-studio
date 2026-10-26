// tests/visual/cases/make_fuzz.mjs · writes fuzz.json: 32 seeded box sets (nesting, strokes, ignored kinds, fractional px, other zones and
// options) with the JavaScript result of CS.visual.deadSpace. The Python twin must reproduce every cell, so this file is the parity pin
// between the two implementations (the Appendix B cases are the pin against the oracle). A linear congruential generator with a fixed
// seed makes the file reproducible: node make_fuzz.mjs [--check]
// Owners are measured the way the collector reports them (strict mode, V1b): most carry a fill (opacity 0-1) and some a border (px);
// one in eight carries nothing, one a wrong unit (fill 35, a percent) and one a border that is a string, so the files pin "ok", "weak" and
// "none" in both languages; some options set strict: false, the old reading in which an owner with no metadata qualifies.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CASES, loadVisual } from "./load.mjs";

const FILE = join(CASES, "fuzz.json");
let state = 20261023;
const rnd = (n) => { state = (state * 1103515245 + 12345) % 2147483648; return Math.floor((state / 2147483648) * n); };
const pick = (list) => list[rnd(list.length)];
const frac = (v, on) => (on ? v + pick([0, 0.25, 0.5, 0.75]) : v);

function makeCase(i) {
  const zone = { w: 852, h: pick([888, 888, 840, 844, 798]) };
  const wild = i % 4 === 3;
  const boxes = [];
  const box = (kind, extra = {}) => {
    const w = 40 + rnd(420), h = 24 + rnd(300);
    return Object.assign({ kind, x: frac(rnd(zone.w - 40) - (kind === "owner" && rnd(4) === 0 ? 60 : 0), wild), y: frac(rnd(zone.h - 30), wild), w: frac(w, wild), h: frac(h, wild) }, extra);
  };
  for (let k = 0, n = 1 + rnd(4); k < n; k++) boxes.push(box("text"));
  for (let k = 0, n = rnd(3); k < n; k++) boxes.push(box("ink"));
  const owners = [];
  for (let k = 0, n = rnd(3); k < n; k++) {
    const o = box(pick(["owner", "owner", "pattern"]), { id: "o" + (k + 1) });
    const m = rnd(8);
    if (m === 1) o.fill = 35; else if (m === 2) o.border = "4"; else if (m > 2) { o.fill = pick([0.2, 0.5, 1]); if (rnd(3) === 0) o.border = pick([2, 3, 4]); }
    if (k > 0 && rnd(2) === 0) o.ownerOf = "o1";
    boxes.push(o); owners.push(o);
    for (let c = 0, m = 1 + rnd(4); c < m; c++) {
      const inner = box(pick(["text", "text", "ink"]), { ownerOf: o.id });
      inner.x = Math.max(0, Math.min(zone.w - inner.w, o.x + rnd(Math.max(1, Math.floor(o.w / 2)))));
      inner.y = Math.max(0, o.y + rnd(Math.max(1, Math.floor(o.h / 2))));
      boxes.push(inner);
    }
  }
  if (rnd(3) === 0) boxes.push(box("image"));
  if (rnd(3) === 0) boxes.push(box("mark"), box("decor"));
  if (rnd(4) === 0) boxes.push(box("ink", { ground: true }));
  if (rnd(4) === 0) boxes.push(box("text", { ghost: true }), box("text", { contrast: 0.2 }));
  if (rnd(3) === 0) boxes.push(box("ink", { anchor: false }));
  if (rnd(3) === 0) boxes.push(box("text", { anchor: true }));
  if (rnd(3) === 0) boxes.push({ kind: "ink", path: [[rnd(300), rnd(300)], [300 + rnd(500), 300 + rnd(500)], [rnd(800), rnd(zone.h)]] });
  if (rnd(8) === 0) boxes.push({ kind: "ink", path: [[rnd(200), rnd(200)]] });
  const opts = pick([undefined, undefined, {}, { canvasH: 1350 }, { halo: { text: 8, ink: 16, owner: 0 } }, { grid: { cols: 24, rows: 25 } }, { owner: { min: 0.5, big: 0.7, fill: 0.2 } }, { occ: 40 }, { strict: false }, { strict: false }, { strict: true, owner: { border: 2 } }]);
  return { id: "fuzz-" + String(i + 1).padStart(2, "0"), zone, opts, boxes };
}

export function build() {
  const CS = loadVisual();
  state = 20261023;
  const cases = [];
  for (let i = 0; i < 32; i++) {
    const c = makeCase(i);
    c.expect = CS.visual.deadSpace(c.boxes, c.zone, c.opts);
    cases.push(c);
  }
  const line = (v) => JSON.stringify(v);
  return '{"schema": 1, "note": "JavaScript results of CS.visual.deadSpace on seeded box sets: the parity pin for _cs/space.py", "cases": [\n'
    + cases.map((c) => " " + line({ id: c.id, zone: c.zone, opts: c.opts ?? null, boxes: c.boxes, expect: c.expect })).join(",\n") + "\n]}\n";
}

if (process.argv[1] && process.argv[1].endsWith("make_fuzz.mjs")) {
  const text = build();
  if (process.argv.includes("--check")) {
    const same = readFileSync(FILE, "utf8") === text;
    console.log(same ? "fuzz.json is current" : "fuzz.json differs from a fresh run");
    process.exit(same ? 0 : 1);
  }
  writeFileSync(FILE, text, "utf8");
  console.log(`wrote ${FILE} (${text.length} bytes)`);
}
