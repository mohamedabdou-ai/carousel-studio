// tests/preset-lint/chart-gap.mjs · E4b. G4 relies on a promise of the chart builders: neighbouring marks of one chart are separated (a 3 px gap, tests/preset-lint/chart-separation.json).
// This measures it on the real builders: it runs the registered chart builders of src/art (no browser) on the six presets' tokens and prints the smallest gap between two
// neighbouring marks, so tests/unit/py/test_preset_lint.py can hold preset_lint.CHART_GAP_PX to what the charts really draw.
//   stdin   {"cases": [{"id": "...", "strategy": "chart:bars-h" | "numeral:waffle", "rtl": true, "tone": "base", "tokens": {...}, "art": {preset.art}, "box": {"w": 852, "h": 420}}], "plant": "waffle-gap-1" (optional)}
//   stdout  {"registered": {"chart": [...subs], "numeral": [...subs]}, "strategies": [...], "results": [{"id": "...", "built": true, "marks": 100, "minGap": 4}]}
// A mark is what the builder says it is: the "ink" boxes it returns for bars; the cells of the 10 x 10 grid for the waffle (read from the svg paths it draws, arcs flattened,
// the stroke added). Marks of other chart kinds are measured when a strategy for them is added here; the test lists the registered kinds that have none.
import fs from "node:fs";
import { loadArt } from "./art-env.mjs";

const CS = loadArt(["root.js", "kit.js", "icon.js", "object.js", "chart.js", "numeral.js", "chart-more.js"]);
const art = CS.art;

function flattenArc(x1, y1, rx, ry, large, sweep, x2, y2, push) {   // SVG arc, no x-axis rotation (the kit draws none), as 16 steps per half turn
  if (!rx || !ry) return push(x2, y2);
  const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2, lam = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry);
  if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam); }
  let co = Math.sqrt(Math.max(0, (rx * rx * ry * ry - rx * rx * dy * dy - ry * ry * dx * dx) / (rx * rx * dy * dy + ry * ry * dx * dx)));
  if (large === sweep) co = -co;
  const cxp = co * (rx * dy / ry), cyp = co * -(ry * dx / rx), cx = cxp + (x1 + x2) / 2, cy = cyp + (y1 + y2) / 2;
  const a1 = Math.atan2((dy - cyp) / ry, (dx - cxp) / rx);
  let da = Math.atan2((-dy - cyp) / ry, (-dx - cxp) / rx) - a1;
  if (!sweep && da > 0) da -= 2 * Math.PI; else if (sweep && da < 0) da += 2 * Math.PI;
  const steps = Math.max(4, Math.ceil(Math.abs(da) / (Math.PI / 16)));
  for (let k = 1; k <= steps; k++) push(cx + rx * Math.cos(a1 + da * k / steps), cy + ry * Math.sin(a1 + da * k / steps));
}

function subpaths(d) {   // [[x, y], ...] per subpath; the commands the kit writes (M L H V A Z, absolute and relative); anything else is an error, never a guess
  const toks = String(d).match(/[A-Za-z]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) || [];
  const out = []; let cur = null, x = 0, y = 0, sx = 0, sy = 0, cmd = null, i = 0;
  const num = () => { const v = parseFloat(toks[i++]); if (!isFinite(v)) throw new Error("path: a number was expected in " + d.slice(0, 60)); return v; };
  const at = (px, py) => { x = px; y = py; cur.push([x, y]); };
  while (i < toks.length) {
    if (/[A-Za-z]/.test(toks[i])) cmd = toks[i++];
    const rel = cmd === cmd.toLowerCase();
    switch (cmd.toUpperCase()) {
      case "M": { const nx = num(), ny = num(); cur = []; out.push(cur); at(rel ? x + nx : nx, rel ? y + ny : ny); sx = x; sy = y; cmd = rel ? "l" : "L"; break; }
      case "L": { const nx = num(), ny = num(); at(rel ? x + nx : nx, rel ? y + ny : ny); break; }
      case "H": { const nx = num(); at(rel ? x + nx : nx, y); break; }
      case "V": { const ny = num(); at(x, rel ? y + ny : ny); break; }
      case "A": { const rx = num(), ry = num(); num(); const large = num(), sweep = num(), nx = num(), ny = num(), ex = rel ? x + nx : nx, ey = rel ? y + ny : ny; flattenArc(x, y, Math.abs(rx), Math.abs(ry), large, sweep, ex, ey, at); break; }
      case "Z": at(sx, sy); cmd = "M"; if (i < toks.length && !/[A-Za-z]/.test(toks[i])) throw new Error("path: numbers after Z"); break;
      default: throw new Error("path command " + cmd + " is not measured");
    }
  }
  return out;
}

function boxOf(points, grow) {
  const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]), x = Math.min(...xs) - grow, y = Math.min(...ys) - grow;
  return { x, y, w: Math.max(...xs) + grow - x, h: Math.max(...ys) + grow - y };
}

function walk(el, fn) { fn(el); (el.kids || []).forEach((k) => k && k.tag && walk(k, fn)); }

const STRATEGY = {
  "chart:bars-h": {
    anchor: () => ({ kind: "chart", chart: { kind: "bars-h", unit: "%", values: [["أمازون", 92], ["نون", 71], ["سوق", 64], ["جملة", 48], ["متجر", 37], ["مزاد", 21]].map(([label, value]) => ({ label, value })) } }),
    marks: (r) => r.boxes.filter((b) => b.kind === "ink").map(({ x, y, w, h }) => ({ x, y, w, h }))
  },
  "numeral:waffle": {
    anchor: () => ({ kind: "numeral", companion: "waffle", value: "47", unit: "%" }),
    marks: (r) => {   // the grid svg is the one whose paths hold 100 cells; a cell's painted box is its outline grown by half the stroke
      let cells = [];
      walk(r.el, (n) => {
        if (n.tag !== "svg") return;
        const found = n.kids.filter((k) => k.tag === "path").flatMap((k) => subpaths(k.attrs.d).map((s) => boxOf(s, (parseFloat(k.attrs["stroke-width"]) || 0) / 2)));
        if (found.length === 100) cells = found;
      });
      return cells;
    }
  }
};

const gap = (a, b) => Math.hypot(Math.max(0, a.x - (b.x + b.w), b.x - (a.x + a.w)), Math.max(0, a.y - (b.y + b.h), b.y - (a.y + a.h)));

const { cases, plant } = JSON.parse(fs.readFileSync(0, "utf8"));
if (plant === "waffle-gap-1") {   // a planted defect for the test of the test: the grid helper numeral.js shares draws its cells 1 px apart, whatever gap the caller asks for
  const waffle = art.chart.waffle;
  art.chart.waffle = (o) => waffle(Object.assign({}, o, { g: 1 }));
}
const results = cases.map((c) => {
  try {
    const s = STRATEGY[c.strategy], box = c.box || { w: 852, h: 420 };
    const ctx = { slideId: "s05", seed: "s05", rtl: !!c.rtl, lang: "ar", tone: c.tone, recipe: "under", size: "xl", zone: { x: 0, y: 0, ...box }, box, tokens: c.tokens, art: c.art,
                  slide: { id: "s05", type: "stat", sourceIds: [] }, sources: {}, labelsOnly: false };
    const r = art.build(s.anchor(), ctx);
    if (!r || !r.el) return { id: c.id, built: false };
    const marks = s.marks(r);
    let min = Infinity;
    for (let i = 0; i < marks.length; i++) for (let j = i + 1; j < marks.length; j++) min = Math.min(min, gap(marks[i], marks[j]));
    return { id: c.id, built: true, marks: marks.length, minGap: isFinite(min) ? Math.round(min * 1000) / 1000 : null };
  } catch (e) {
    return { id: c.id, built: false, error: String(e && e.message || e) };
  }
});
const registered = {};
for (const kind of ["chart", "numeral"]) registered[kind] = (art.caps().art[kind] || []).slice();
process.stdout.write(JSON.stringify({ registered, strategies: Object.keys(STRATEGY), results }));
