// tests/unit/js/marks/demo.mjs · marks in context: Arabic words from the bundled fonts, marks placed from the real word rects
// (what the settle pass of spec 3.5 will do), once in the brush form on a creator-like ground and once in the line form on a
// notebook-like ground. A visual check and a copy-paste example of the placement calls, not a unit test.
//   node tests/unit/js/marks/demo.mjs [--out <png>]
import { createServer } from "node:http";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadMarks, renderMark } from "./lib.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../../..");
const fonts = resolve(root, "plugins/carousel-studio/skills/carousel-design/fonts");
const args = process.argv.slice(2);
const out = resolve(args.includes("--out") ? args[args.indexOf("--out") + 1] : "marks-in-context.png");
const lib = loadMarks();
const byId = Object.fromEntries(lib.marks.map((m) => [m.id, m]));

let pageHtml = "";
const server = createServer((req, res) => {
  if (req.url === "/") { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); res.end(pageHtml); return; }
  const f = join(fonts, decodeURIComponent(req.url.split("?")[0]));
  if (!f.startsWith(fonts) || !existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": "font/ttf" });
  res.end(readFileSync(f));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;

const words = ["غيّرت", "الغلاف", "بس", "وبقى", "البوست", "يتحفظ", "أكتر"];
const slide = (cls, a) => `<section class="s ${cls}" id="${cls}">
  <div class="kick">${a.kick}</div>
  <h1 dir="rtl" lang="ar">${words.map((w, i) => `<span class="w" data-i="${i}">${w}</span>`).join(" ")}</h1>
  <div class="card" dir="rtl" lang="ar"><span class="hand">${a.note}</span></div>
  <svg class="marks" width="1080" height="1440" viewBox="0 0 1080 1440"></svg>
</section>`;

const html = `<!doctype html><meta charset="utf-8"><style>
@font-face{font-family:Kufi;src:url(${base}/noto-kufi-arabic/NotoKufiArabic[wght].ttf);font-weight:100 900}
@font-face{font-family:Playpen;src:url(${base}/playpen-sans-arabic/PlaypenSansArabic[wght].ttf);font-weight:100 800}
body{margin:0;display:flex;gap:24px;background:#888}
.s{position:relative;width:1080px;height:1440px;overflow:hidden;font-family:Kufi}
.creator{background:#FFE9A8;color:#161616}
.notebook{background:#FBF8EF;color:#26354A;background-image:repeating-linear-gradient(#FBF8EF 0 63px,#C8D7E8 63px 65px)}
h1{position:absolute;inset:340px 114px auto 114px;margin:0;font-size:108px;line-height:1.7;font-weight:800;text-align:start}
.notebook h1{font-weight:500;font-size:100px}
.w{display:inline-block;line-height:1.25}
.kick{position:absolute;left:114px;top:96px;font:600 30px/1 system-ui;color:#555}
.card{position:absolute;left:150px;top:1060px;width:520px;padding:34px 40px;border-radius:36px;font-size:54px}
.creator .card{background:#fff;border:6px solid #161616;box-shadow:10px 10px 0 #161616}
.notebook .card{background:#fff;border:3px solid #26354A;transform:rotate(-2deg)}
.hand{font-family:Playpen;font-weight:700;line-height:1.5}
.marks{position:absolute;inset:0;pointer-events:none}
</style>
${slide("creator", { kick: "creator, brush", note: "ده السر كله" })}
${slide("notebook", { kick: "notebook, line", note: "جرّبها بنفسك" })}`;

const { chromium } = await import("playwright-core");
const m = await import(pathToFileURL(resolve(root, "plugins/carousel-studio/skills/carousel-design/scripts/cover_video.mjs")).href);
const exe = m.findInstalledChromium ? m.findInstalledChromium() : null;
const browser = await chromium.launch({ headless: true, ...(exe ? { executablePath: exe } : {}) });
const page = await browser.newPage({ viewport: { width: 2232, height: 1440 } });
pageHtml = html;
await page.goto(base + "/");   // served from the same origin as the fonts
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(400);

// word and card rects in slide coordinates
const rects = await page.evaluate(() => {
  const pick = (id) => {
    const s = document.getElementById(id), o = s.getBoundingClientRect();
    const r = (e) => { const b = e.getBoundingClientRect(); return { x: b.x - o.x, y: b.y - o.y, w: b.width, h: b.height }; };
    return { words: [...s.querySelectorAll(".w")].map(r), card: r(s.querySelector(".card")) };
  };
  return { creator: pick("creator"), notebook: pick("notebook") };
});

const grow = (r, fx, fy) => ({ x: r.x - r.w * fx, y: r.y - r.h * fy, w: r.w * (1 + 2 * fx), h: r.h * (1 + 2 * fy) });
function svgFor(id, plan, form, ink, accent) {
  const R = rects[id];
  const parts = [];
  const put = (markId, target, color, o = {}) => {
    const r = renderMark(lib, byId[markId], target, { form, rtl: true, ...o });
    parts.push(r.form === "line"
      ? `<path d="${r.d}" fill="none" stroke="${color}" stroke-width="${r.width}" stroke-linecap="round" stroke-linejoin="round"/>`
      : `<path d="${r.d}" fill="${color}"/>`);
  };
  const w = (i) => R.words[i];
  // circle on a word: 120-130 percent of the target
  put(plan.circle, grow(w(1), 0.12, 0.16), accent);
  // underline: 85 percent of the word width, just under the baseline area
  const u = w(5); put(plan.underline, { x: u.x + u.w * 0.075, y: u.y + u.h * 0.8, w: u.w * 0.85, h: Math.max(26, u.h * 0.22) }, ink);
  // strike: width of the target, through the middle
  const s = w(2); put(plan.strike, plan.strikeBox(s), accent);
  // an arrow from the sentence to the card
  const a = w(6), c = R.card;
  put(plan.arrow, { from: [a.x + a.w * 0.5, a.y + a.h * 1.0], to: [c.x + c.w * 0.5, c.y - 16] }, accent);
  // a kashida bar under the title, 85 percent of the line width
  put("kashida-bar", { x: 114 + 852 * 0.15, y: 250, w: 852 * 0.85, h: 38 }, accent);
  // doodles at the lift edge of the card
  put(plan.d1, { x: c.x + c.w - 40, y: c.y - 40, w: 110, h: 110 }, accent);
  put(plan.d2, { x: c.x - 90, y: c.y + c.h - 40, w: 110, h: 100 }, ink);
  return parts.join("");
}
await page.evaluate(({ a, b }) => {
  document.querySelector("#creator .marks").innerHTML = a;
  document.querySelector("#notebook .marks").innerHTML = b;
}, {
  a: svgFor("creator", { circle: "circle-scribble", underline: "underline-brush", strike: "strike-line", arrow: "arrow-curve", d1: "sparkle", d2: "spark-ticks", strikeBox: (s) => ({ x: s.x - 6, y: s.y + s.h * 0.4, w: s.w + 12, h: 22 }) }, "brush", "#161616", "#E4433A"),
  b: svgFor("notebook", { circle: "circle-double", underline: "underline-double", strike: "strike-scribble", arrow: "arrow-down", d1: "star", d2: "tick", strikeBox: (s) => ({ x: s.x - 6, y: s.y + s.h * 0.12, w: s.w + 12, h: s.h * 0.76 }) }, "line", "#26354A", "#D2412F"),
});
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, await page.screenshot());
await browser.close();
server.close();
console.log("written " + out);
