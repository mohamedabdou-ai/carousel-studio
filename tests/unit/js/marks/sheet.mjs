// tests/unit/js/marks/sheet.mjs · renders the contact sheet of the mark library (line and brush form) to a PNG, for the eye.
//   node tests/unit/js/marks/sheet.mjs [--out <png>] [--rtl] [--dark] [--scale 1]
// Not part of the unit tests: it starts a headless Chromium. Output is only for reading back (GR-12).
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadMarks, markSvg, contentSize } from "./lib.mjs";

const args = process.argv.slice(2);
const val = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const out = resolve(val("--out", "marks-sheet.png"));
const rtl = args.includes("--rtl");
const dark = args.includes("--dark");
const scale = Number(val("--scale", "1"));
const MAX = Number(val("--max", "0"));
const ONLY = val("--family", "").split(",").filter(Boolean);

const lib = loadMarks();
const paper = dark ? "#16161A" : "#FBF5E8";
const ink = dark ? "#F4F0E6" : "#1B1B20";
const accent = dark ? "#FF8A5B" : "#E4493B";
const mute = dark ? "#8A8A94" : "#7A7468";

const CELL = { w: 280, h: 150 };
function cell(m, form) {
  let w, h;
  const ar = m.aspect;
  const maxW = MAX || 250, maxH = MAX || 112;
  if (ar >= maxW / maxH) { w = maxW; h = maxW / ar; } else { h = maxH; w = maxH * ar; }
  if (m.fit === "uniform") { const cs = contentSize(ar); const s = Math.min(maxW / cs.w, maxH / cs.h); w = cs.w * s; h = cs.h * s; }
  w = Math.round(w); h = Math.round(h);
  const x = Math.round((CELL.w - w) / 2), y = Math.round((CELL.h - 30 - h) / 2) + 6;
  let target;
  if (m.fit === "pair") {
    // draw the arrow in its own orientation: the 100 x 100 box scaled so the content fits the cell, centred
    const cs = contentSize(ar), sc = Math.min(maxW / cs.w, maxH / cs.h);
    const bx = CELL.w / 2 - 50 * sc, by = (CELL.h - 24) / 2 - 50 * sc;
    target = { from: [bx + m.tail[0] * sc, by + m.tail[1] * sc], to: [bx + m.tip[0] * sc, by + m.tip[1] * sc] };
  } else {
    target = { x, y, w, h };
  }
  const color = m.family === "doodle" || m.family === "kashida" ? accent : ink;
  const svg = markSvg(lib, m, target, { form, color, rtl });
  return `<svg width="${CELL.w}" height="${CELL.h}" viewBox="0 0 ${CELL.w} ${CELL.h}" xmlns="http://www.w3.org/2000/svg">${svg}</svg>`;
}

const rows = [];
for (const fam of lib.families.filter((f) => !ONLY.length || ONLY.includes(f))) {
  const ms = lib.marks.filter((m) => m.family === fam);
  rows.push(`<h2>${fam} (${ms.length})</h2><div class="grid">` + ms.map((m) => {
    const forms = m.form === "fill" ? ["fill"] : ["line", "brush"];
    return `<div class="card"><div class="id">${m.id} <span>${m.aspect}</span></div><div class="pair">${forms.map((f) => `<div>${cell(m, f)}</div>`).join("")}</div></div>`;
  }).join("") + `</div>`);
}

const html = `<!doctype html><meta charset="utf-8"><style>
body{margin:0;padding:18px 20px;background:${paper};color:${ink};font:13px/1.3 system-ui,Segoe UI,sans-serif}
h2{margin:18px 0 8px;font-size:15px;letter-spacing:.04em;text-transform:uppercase;color:${mute}}
.grid{display:grid;grid-template-columns:repeat(3,${CELL.w * 2 + 24}px);gap:10px}
.card{border:1px solid ${mute}55;border-radius:8px;padding:6px 8px;background:${dark ? "#1E1E24" : "#FFFDF7"}}
.id{font-weight:600;margin-bottom:2px}.id span{color:${mute};font-weight:400;margin-left:6px}
.pair{display:flex;gap:4px}
</style>${rows.join("")}`;

const { chromium } = await import("playwright-core");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
let installed = null;
try {
  const m = await import(pathToFileURL(resolve(root, "plugins/carousel-studio/skills/carousel-design/scripts/cover_video.mjs")).href);
  installed = m.findInstalledChromium ? m.findInstalledChromium() : null;
} catch { /* fall back to playwright's own browser */ }
const browser = await chromium.launch({ headless: true, ...(installed ? { executablePath: installed } : {}) });
const page = await browser.newPage({ viewport: { width: 1900, height: 900 }, deviceScaleFactor: scale });
await page.setContent(html);
mkdirSync(dirname(out), { recursive: true });
const buf = await page.screenshot({ fullPage: true });
writeFileSync(out, buf);
await browser.close();
console.log("sheet written " + out);
