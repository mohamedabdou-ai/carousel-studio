// tests/unit/js/art/harness.mjs · the shared art harness (IS-11, package A1). One headless page that holds privately built cs-core, cs-paint, cs-art and cs-visual,
// the test fonts and the in-page helpers of support/; every art package (A1-A11) tests its builders here.
//
//   import { withArt } from "./harness.mjs";
//   await withArt(async (art) => {
//     const r = await art.render({ kind: "icon", icon: "clock", treatment: "duo" }, { preset: "creator", tone: "base", rtl: true, box: { w: 852, h: 420 } });
//     // r = { sel, html, rect, boxes, labels: [{ text, role, index }], png: Buffer }      (o.png === false skips the screenshot)
//     const s = await art.safe(r);                                                           // { ok, violations: [{ rule, node, msg }] }   rules A1-A14 (support/safe.js)
//     const p = await art.paintBoth(r);                                                      // { svgPng, replayPng, ssim }                  the svg and the replay painter (F1's lib)
//     const sh = await art.sheet({ cols: 4, cw: 300, ch: 300, items: [{ kind: "icon", name: "clock", opts: { treatment: "chip", size: "lg" }, preset: "swiss", label: "x" }] });
//   }, { data: "fixtures" | "real" | { pack, objects } });
//
// art.mount(fn, arg, o) mounts any node that fn(CS, ctx, arg) builds in the page (kit tests); render(anchor, o): o = { preset, tone, rtl, slideId, part, box, zone, recipe, size, labelsOnly, keep, png }; art.ctx(o) returns the builder ctx without building.
// art.sheet items: { kind: "icon" | "object" | "anchor", name | id | anchor, opts, preset, tone, rtl, label, box }. art.shot(target, file) / art.small(png, width) / art.save(rel, buf).
// Data: "fixtures" (default) loads tests/unit/js/art/fixtures; "real" reads the shipped icon pack and objects (art.real is false when unavailable).
// Chunks are built privately (node tools/build.mjs --module ... --out tmp), never from runtime/. Any build failure stops the suite; the real core is required in every mode.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { launchChromium, serveDirectory } from "../../../../plugins/carousel-studio/skills/carousel-design/scripts/cover_video.mjs";
import { REPO, tempDir } from "../../../parity/lib/studio.mjs";
import { paintBothScored } from "../../../parity/lib/painters.mjs";
import { pagePresets } from "./support/dna.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SUP = path.join(HERE, "support");
const FONTS = path.join(REPO, "tests/video/harness/fonts");
const ORDER = ["core", "paint", "art", "visual"];
const FACES = [
  ["Readex Pro", "400 600", "ReadexPro-arabic.woff2", "U+0600-06FF,U+0750-077F,U+0870-088E,U+0890-0891,U+0897-08E1,U+08E3-08FF,U+200C-200E,U+2010-2011,U+204F,U+2E41,U+FB50-FDFF,U+FE70-FE74,U+FE76-FEFC"],
  ["Readex Pro", "400 600", "ReadexPro-latin.woff2", "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD"],
  ["Alexandria", "700 800", "Alexandria-arabic.woff2", "U+0600-06FF,U+0750-077F,U+0870-088E,U+0890-0891,U+0897-08E1,U+08E3-08FF,U+200C-200E,U+2010-2011,U+204F,U+2E41,U+FB50-FDFF,U+FE70-FE74,U+FE76-FEFC"],
  ["Alexandria", "700 800", "Alexandria-latin.woff2", "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD"]
];

const readJson = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
export const fixtures = () => ({ pack: readJson(path.join(HERE, "fixtures/pack-sample.json")), objects: readJson(path.join(HERE, "fixtures/objects-sample.json")) });

let realCache;
/** Read shipped data (or an explicit private data directory); never regenerate shared assets. */
export function realData() {
  if (realCache !== undefined) return realCache;
  const dir = process.env.CS_ART_ICONS || path.join(REPO, "plugins/carousel-studio/skills/carousel-design/data/icons");
  try { realCache = { pack: readJson(path.join(dir, "pack.json")), objects: readJson(path.join(dir, "objects.json")) }; }
  catch { realCache = null; }
  return realCache;
}

/** Match scripts/plan.mjs loadPlanner: compose.label must see the real registered rules. */
function pageRules() {
  const dir = path.join(REPO, "plugins/carousel-studio/skills/carousel-design/data"), data = (f) => readJson(path.join(dir, f));
  return {
    qaRules: data("qa-rules.json"), copy: data("rules/copy.json"), ortho: data("rules/ortho.json"),
    dialects: Object.fromEntries(["eg", "gulf", "levant", "msa-white", "en"].map((id) => [id, data(`dialects/${id}.json`)])),
    platform: data("platform-instagram.json"), locale: data("locale-defaults.json"),
    postingGuide: fs.existsSync(path.join(dir, "posting-guide.json")) ? data("posting-guide.json") : null
  };
}

/** Builds the four real chunks privately; coreFallback stays false for harness consumers. */
export function buildChunks(dir, { final = false } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  try {
    execFileSync(process.execPath, [path.join(REPO, "tools/build.mjs"), ...ORDER.flatMap((m) => ["--module", m]), "--out", dir], { stdio: "pipe" });
  } catch (e) {
    const err = String((e.stderr || e.message || "")).trim();
    throw new Error((final ? "--final requires real chunks; " : "") + "tools/build.mjs failed: " + err);
  }
  return { files: ORDER.map((m) => path.join(dir, `cs-${m}.js`)), coreFallback: false };
}

function pageHtml() {
  const faces = FACES.map(([family, weight, file, range]) => `@font-face{font-family:"${family}";font-style:normal;font-weight:${weight};font-display:block;src:url(data:font/woff2;base64,${fs.readFileSync(path.join(FONTS, file)).toString("base64")}) format("woff2");unicode-range:${range};}`).join("\n");
  const css = fs.readFileSync(path.join(SUP, "harness.css"), "utf8");
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>art harness</title><style id="cs-fonts">${faces}</style><style data-cs-slide-css>${css}</style><style>html,body{margin:0;background:#808080}</style></head><body></body></html>`;
}

/** Runs fn(art) on one headless page; closes everything afterwards. */
export async function withArt(fn, { data = "fixtures", chromium, final = false } = {}) {
  if (final && data !== "real") throw new Error("--final requires real data; fixture or custom data is refused");
  const work = tempDir("cs-art-"), built = buildChunks(path.join(work, "chunks"), { final });
  fs.writeFileSync(path.join(work, "harness.html"), pageHtml());
  const server = await serveDirectory(work), browser = await launchChromium({ chromium });
  const context = await browser.newContext({ viewport: { width: 1200, height: 1500 }, deviceScaleFactor: 1 }), page = await context.newPage(), errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/favicon|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  try {
    await page.goto(server.url + "/harness.html");
    for (const f of built.files) await page.addScriptTag({ content: fs.readFileSync(f, "utf8") });
    await page.evaluate((rules) => { CS.core.registry.registerRules(rules); }, pageRules());
    await page.evaluate((p) => { window.__ART_PRESETS = p; }, pagePresets());
    await page.addScriptTag({ content: fs.readFileSync(path.join(SUP, "safe.js"), "utf8") });
    await page.addScriptTag({ content: fs.readFileSync(path.join(SUP, "page.js"), "utf8") });
    await page.evaluate(() => {
      if (!__art.ctx().rules?.platform?.plugin?.visual?.artLabel) throw new Error('art harness ctx requires registered art-label rules');
    });
    const real = data === "real" ? realData() : null, blocks = typeof data === "object" ? data : real || fixtures();
    if (final && data === "real" && !real) throw new Error("--final refuses fixture fallback for real data");
    await page.evaluate((b) => { CS.visual._.reset(); CS.visual._.blocks = { "cs-icon-pack": b.pack, "cs-icon-objects": b.objects }; }, blocks);
    await page.evaluate(() => document.fonts.ready.then(() => Promise.all([document.fonts.load('600 36px "Readex Pro"', "اa1"), document.fonts.load('800 40px "Alexandria"', "اa1")])));
    const target = (t) => (typeof t === "string" ? t : t.sel);
    const art = {
      page, errors, real: data === "real" && !!real, coreFallback: built.coreFallback, blocks, outDir: process.env.CS_ART_OUT || null,
      reset: () => page.evaluate(() => { document.body.replaceChildren(); window.scrollTo(0, 0); }),
      ctx: (o) => page.evaluate((o) => __art.ctx(o), o || {}),
      evaluate: (f, arg) => page.evaluate(f, arg),
      async shot(t, file) {
        const r = await page.evaluate((s) => { const b = document.querySelector(s).getBoundingClientRect(); return { w: Math.ceil(b.right), h: Math.ceil(b.bottom) }; }, target(t));
        await page.setViewportSize({ width: Math.max(1200, r.w), height: Math.max(1500, r.h) });   // a wide sheet is captured whole, not clipped to the window
        const b = await page.locator(target(t)).screenshot({ type: "png" });
        if (file) art.save(file, b);
        return b;
      },
      async render(anchor, o = {}) {
        const r = await page.evaluate(([a, o]) => __art.render(a, o), [anchor, o]);
        if (!r) return null;
        if (o.png !== false) r.png = await art.shot(r);
        return r;
      },
      /** mounts any node a function builds in the page: art.mount((CS, ctx, arg) => node, arg, o) -> render record (no png); for kit-level tests */
      mount: (fn, arg, o) => page.evaluate(([src, arg, o]) => __art.mount(src, arg, o), [fn.toString(), arg, o || {}]),
      safe: (t, o) => page.evaluate(([s, o]) => __artSafe(document.querySelector(s), o), [target(t), o || {}]),
      async paintBoth(t, o = {}) {
        const full = await paintBothScored(page, target(t), o), regions = [];
        for (const s of o.regions || []) regions.push({ selector: s, ...await paintBothScored(page, s, o) });
        return { ...full, regions };
      },
      sheet: (spec) => page.evaluate((s) => __art.sheet(s), spec),
      /** a PNG at `width` px (high-quality downscale in the page); with width = 130 per 1080 px slide this is the profile-grid view */
      async small(png, width) {
        const uri = await page.evaluate(async ([b64, w]) => {
          const img = new Image(); img.src = "data:image/png;base64," + b64; await img.decode();
          let c = document.createElement("canvas"), x, cw = img.width, ch = img.height, src = img;
          while (cw / 2 >= w) { cw = Math.round(cw / 2); ch = Math.round(ch / 2); c = document.createElement("canvas"); c.width = cw; c.height = ch; x = c.getContext("2d"); x.imageSmoothingQuality = "high"; x.drawImage(src, 0, 0, cw, ch); src = c; }
          c = document.createElement("canvas"); c.width = w; c.height = Math.round(img.height * w / img.width); x = c.getContext("2d"); x.imageSmoothingQuality = "high"; x.drawImage(src, 0, 0, c.width, c.height);
          return c.toDataURL("image/png");
        }, [png.toString("base64"), width]);
        return Buffer.from(uri.slice(uri.indexOf(",") + 1), "base64");
      },
      save(rel, buf) { if (!art.outDir) return null; const f = path.join(art.outDir, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, buf); return f; }
    };
    return await fn(art);
  } finally {
    await context.close(); await browser.close(); await server.close();
    try { fs.rmSync(work, { recursive: true, force: true }); } catch { /* temp files */ }
  }
}
