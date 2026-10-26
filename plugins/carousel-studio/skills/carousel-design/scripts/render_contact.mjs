#!/usr/bin/env node
// V6c: offline 130 px contact strip; metadata comes from the supplied saved or preview plan, without a smell score.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { launchChromium, LaneError, EXIT } from "./cover_video.mjs";
const escape = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function contactHTML(renders, plan) {
  if (!Array.isArray(renders) || !renders.length || renders.length > 20) throw new LaneError("E_SCHEMA", "contact sheet needs 1-20 slide renders", EXIT.DATA);
  const byId = new Map((plan.slides || []).map((s) => [s.id, s.visual || {}]));
  const tiles = renders.map((r) => {
    const bytes = r.bytes ? Buffer.from(r.bytes) : fs.readFileSync(r.path);
    if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new LaneError("E_SCHEMA", "contact images must be PNG", EXIT.DATA);
    const v = byId.get(r.id) || {};
    return `<article><img alt="${escape(r.id)}" src="data:image/png;base64,${bytes.toString("base64")}"><div dir="ltr"><bdi dir="ltr">${escape(r.id)}</bdi></div>${[v.anchor?.kind || "none", v.recipe || "none", v.tone || "base"].map((s) => `<div dir="ltr"><bdi dir="ltr">${escape(s)}</bdi></div>`).join("")}</article>`;
  }).join("");
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'"><style>html,body{margin:0;background:#eee;color:#111}main{display:flex;gap:8px;padding:8px;width:max-content}article{width:130px;flex:none}img{display:block;width:130px;height:174px;object-fit:contain;background:#fff}article div{font:12px/18px monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:center}</style></head><body><main>${tiles}</main></body></html>`;
}

export async function drawContact(renders, plan, out, { browser: supplied } = {}) {
  const html = contactHTML(renders, plan), browser = supplied || await launchChromium();
  let page, scratch;
  try {
    page = await browser.newPage({ viewport: { width: 16 + renders.length * 138 - 8, height: 262 }, deviceScaleFactor: 1 });
    await page.setContent(html);
    // Rasterise once at integer CSS pixels. Fractional object-fit scaling can differ between Chromium processes.
    await page.evaluate(async () => {
      for (const img of Array.from(document.images)) {
        await img.decode();
        const canvas = document.createElement("canvas"); canvas.width = 130; canvas.height = 174;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, 130, 174);
        ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
        const scale = Math.min(130 / img.naturalWidth, 174 / img.naturalHeight);
        const w = Math.max(1, Math.round(img.naturalWidth * scale)), h = Math.max(1, Math.round(img.naturalHeight * scale));
        ctx.drawImage(img, Math.round((130 - w) / 2), Math.round((174 - h) / 2), w, h);
        img.src = canvas.toDataURL("image/png");
        await img.decode();
      }
    });
    await page.evaluate(async () => {
      await document.fonts.ready;
      await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
    });
    const png = await page.locator("main").screenshot({ type: "png", animations: "disabled" });
    const target = path.resolve(out);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    scratch = fs.mkdtempSync(path.join(path.dirname(target), ".cs-contact-"));
    const tmp = path.join(scratch, "strip.png");
    fs.writeFileSync(tmp, png); fs.renameSync(tmp, target);
    return { path: target, bytes: png.length, slides: renders.length, tileWidth: 130, rows: ["kind", "recipe", "tone"] };
  } catch (e) {
    if (e instanceof LaneError) throw e;
    throw new LaneError("E_CONTACT", `contact sheet failed: ${e.message}`, EXIT.INTERNAL);
  } finally {
    if (page) await page.close();
    if (!supplied) await browser.close();
    if (scratch) fs.rmSync(scratch, { recursive: true, force: true });
  }
}

async function main(args) {
  const o = { format: "json" };
  for (let i = 0; i < args.length; i++) {
    if (["--help", "-h"].includes(args[i])) { process.stdout.write("usage: node render_contact.mjs --renders FILE.json --plan FILE.json --out FILE.png [--format json|text]\n"); return; }
    const k = args[i];
    if (!["--renders", "--plan", "--out", "--format"].includes(k) || !args[i + 1] || args[i + 1].startsWith("--")) throw new LaneError("E_USAGE", "invalid contact arguments", EXIT.USAGE);
    o[k.slice(2)] = args[++i];
  }
  if (!o.renders || !o.plan || !o.out || !["json", "text"].includes(o.format)) throw new LaneError("E_USAGE", "--renders, --plan and --out are required", EXIT.USAGE);
  const { readPlanJson } = await import("./plan.mjs");
  const renders = readPlanJson(o.renders).map((r) => ({ ...r, path: path.resolve(path.dirname(o.renders), r.path) }));
  const result = await drawContact(renders, readPlanJson(o.plan), o.out);
  process.stdout.write(o.format === "json" ? JSON.stringify(result) + "\n" : `${result.path}: ${result.slides} slides at 130 px\n`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2)).catch((e) => {
  process.stderr.write(`cs-error: ${e.code || "E_INTERNAL"}: ${e.message}\n`); process.exitCode = e.exit || EXIT.INTERNAL;
});
