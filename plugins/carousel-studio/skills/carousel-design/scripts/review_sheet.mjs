#!/usr/bin/env node
// One review sheet of every rendered slide, so a reviewer opens a single image instead of each PNG at full size.
// usage: node review_sheet.mjs --dir OUT/3x4 --out sheet.png [--cols 4] [--width 270] [--format json|text]
// Tiles keep the slide's ratio, carry its number, and sit on a neutral grey so a white or black slide edge stays visible.
// 8 slides at 4 columns of 270 px make a 1080 x 776 image: layout, balance, empty bands and overlaps read at a glance;
// open a single slide at full size only when the sheet shows a problem on it.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { launchChromium, LaneError, EXIT } from "./cover_video.mjs";

const PNG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

export function slideFiles(dir) {
  let names;
  try { names = fs.readdirSync(dir); } catch { throw new LaneError("E_NOINPUT", `no slide folder at ${dir}`, EXIT.NOINPUT); }
  const files = names.filter((n) => /^\d{2}(-[a-z0-9-]+)?\.png$/i.test(n)).sort();
  if (!files.length) throw new LaneError("E_NOINPUT", `no slide PNGs (01-cover.png, 02.png, …) in ${dir}`, EXIT.NOINPUT);
  if (files.length > 20) throw new LaneError("E_SCHEMA", "a review sheet holds 1-20 slides", EXIT.DATA);
  return files.map((n) => path.join(dir, n));
}

export function sheetHTML(files, { cols = 4, width = 270 } = {}) {
  const tiles = files.map((f) => {
    const bytes = fs.readFileSync(f);
    if (!bytes.subarray(0, 8).equals(PNG)) throw new LaneError("E_SCHEMA", `${path.basename(f)} is not a PNG`, EXIT.DATA);
    const n = path.basename(f).slice(0, 2);
    return `<figure><img src="data:image/png;base64,${bytes.toString("base64")}"><figcaption>${n}</figcaption></figure>`;
  }).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'">
<style>html,body{margin:0;background:#8a8a8a}main{display:grid;grid-template-columns:repeat(${cols},${width}px);gap:8px;padding:8px;width:max-content}
figure{margin:0;position:relative}img{display:block;width:${width}px;height:auto}
figcaption{position:absolute;top:4px;left:4px;font:bold 13px/18px monospace;color:#fff;background:#000c;padding:0 5px;border-radius:3px}</style>
</head><body><main>${tiles}</main></body></html>`;
}

export async function drawSheet(dir, out, opts = {}) {
  const files = slideFiles(dir);
  const cols = Math.min(opts.cols || 4, files.length), width = opts.width || 270;
  const html = sheetHTML(files, { cols, width });
  const browser = opts.browser || await launchChromium();
  let page;
  try {
    page = await browser.newPage({ viewport: { width: 16 + cols * (width + 8), height: 800 }, deviceScaleFactor: 1 });
    await page.setContent(html);
    await page.evaluate(async () => { for (const img of Array.from(document.images)) await img.decode(); });
    const png = await page.locator("main").screenshot({ type: "png", animations: "disabled" });
    const target = path.resolve(out);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, png);
    return { path: target, slides: files.length, cols, tileWidth: width, bytes: png.length };
  } catch (e) {
    if (e instanceof LaneError) throw e;
    throw new LaneError("E_SHEET", `review sheet failed: ${e.message}`, EXIT.INTERNAL);
  } finally {
    if (page) await page.close();
    if (!opts.browser) await browser.close();
  }
}

async function main(args) {
  const o = { format: "text" };
  for (let i = 0; i < args.length; i++) {
    if (["--help", "-h"].includes(args[i])) {
      process.stdout.write("usage: node review_sheet.mjs --dir OUT/3x4 --out sheet.png [--cols 4] [--width 270] [--format json|text]\n");
      return;
    }
    const k = args[i];
    if (!["--dir", "--out", "--cols", "--width", "--format"].includes(k) || !args[i + 1] || args[i + 1].startsWith("--")) throw new LaneError("E_USAGE", `invalid argument ${k}`, EXIT.USAGE);
    o[k.slice(2)] = args[++i];
  }
  if (!o.dir || !o.out || !["json", "text"].includes(o.format)) throw new LaneError("E_USAGE", "--dir and --out are required", EXIT.USAGE);
  const cols = Number(o.cols || 4), width = Number(o.width || 270);
  if (!(cols >= 1 && cols <= 6) || !(width >= 120 && width <= 540)) throw new LaneError("E_USAGE", "--cols 1-6, --width 120-540", EXIT.USAGE);
  const r = await drawSheet(o.dir, o.out, { cols, width });
  process.stdout.write(o.format === "json" ? JSON.stringify(r) + "\n" : `${r.path}: ${r.slides} slides, ${r.cols} columns of ${r.tileWidth} px\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2)).catch((e) => {
  process.stderr.write(`cs-error: ${e.code || "E_INTERNAL"}: ${e.message}\n`); process.exitCode = e.exit || EXIT.INTERNAL;
});
