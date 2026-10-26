#!/usr/bin/env node
// tools/make_examples.mjs · builds the example Studios and renders the sample images and covers (git-ignored output in examples/).
//
//   node tools/make_examples.mjs [--only studios|renders|videos|kit|previews ...] [--out DIR] [--presets swiss,creator,...]
//
// studios  build_studio.py on three fixture specs: «5 أخطاء بتموّت الكاروسيل» (eg, swiss), the Modern Standard post with Arabic-Indic
//          digits (poster) and the English post (interface)          -> <out>/studio-<name>.html
// renders  every shipped preset x the eighteen slides of tools/examples/showcase.spec.json (every archetype family), painted by the
//          Studio's own engine and exporter in headless Chromium     -> <out>/renders/<preset>/<NN>-<type>.png, <out>/renders/index.html
// videos   the animated cover of every shipped preset (swiss, creator, notebook, poster, interface, heritage), each on its own fixture post,
//          in the preset's own colours and faces and with the recipe that suits the post, rendered through HyperFrames and checked with
//          check_video.mjs                                            -> <out>/videos/<preset>-cover.mp4, <out>/videos/index.html
// kit      the 5-mistakes publishing kit (3:4 and 4:5, with the source files), as the Claude Code lane writes it with render.mjs
//                                                                     -> <out>/kit-5-mistakes/
// previews styles/<id>/preview.png (540x720, the preset's cover with the showcase hook) for every shipped preset, then
//          preset_lint.py --write-index records them. Writes into the plugin, so it only runs when asked: --only previews.
// Needs: Python 3.11, Node 22, playwright-core (devDependency) and a Chromium already on the machine; FFmpeg for the videos.
// Nothing is uploaded; the browser loads only the page it is served from loopback (the MP4 encoder of the Studio lane is not used here).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { buildStudioPage, launchChromium, openStudio, renderCoverVideo, HYPERFRAMES_VERSION } from "../plugins/carousel-studio/skills/carousel-design/scripts/cover_video.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPTS = path.join(ROOT, "plugins/carousel-studio/skills/carousel-design/scripts");
const FIX = path.join(ROOT, "tests/fixtures");

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  process.stdout.write("usage: node tools/make_examples.mjs [--only studios|renders|videos|kit|previews ...] [--out DIR] [--presets swiss,creator,...]\n" +
    "Builds the example Studios, the sample renders, the animated covers and the 5-mistakes kit into examples/ (git-ignored). previews writes into the plugin and runs only when named.\n");
  process.exit(0);
}
const flag = (name) => { const i = args.indexOf("--" + name); return i >= 0 ? args[i + 1] : null; };
const only = (() => { const i = args.indexOf("--only"); if (i < 0) return []; const out = []; for (let k = i + 1; k < args.length && !args[k].startsWith("--"); k++) out.push(args[k]); return out; })();
const OUT = path.resolve(flag("out") || path.join(ROOT, "examples"));
const want = (step) => (only.length ? only.includes(step) : step !== "previews");
const log = (m) => process.stderr.write(m + "\n");

const STUDIOS = [
  { name: "5-mistakes", spec: "spec.eg.8slides.json", brand: "brand.eg.creator.json" },
  { name: "msa-indic", spec: "spec.msa-white.indic.8slides.json", brand: "brand.msa.indic.json" },
  { name: "english", spec: "spec.en.8slides.json", brand: "brand.en.minimal.json" }
];
/** One cover per preset, with a recipe the preset allows and the cover's words suit (CS.motion.recommend, motion-recipes.md section 3).
 *  `poster` and `interface` show a fixture post of their own register; the other four re-skin the 5-mistakes post. check_video.mjs judges every
 *  cover and this script exits 1 when one fails. Known, in the HyperFrames lane: the textured presets `notebook` and `heritage` land at
 *  SSIM 0.988 for frame 0 against the poster (floor 0.99; a lower CRF gives the same, so it is the two renderers, not the codec), and the
 *  Levantine fixture in `notebook` also sits one headline line about 7 px off the poster (25 dB), so the fixtures for those two are not used. */
const VIDEOS = [
  { name: "swiss", spec: "spec.eg.8slides.json", brand: "brand.eg.creator.json" },
  { name: "creator", spec: "spec.eg.8slides.json", brand: "brand.eg.creator.json", recipe: "highlight-sweep" },
  { name: "notebook", spec: "spec.eg.8slides.json", brand: "brand.eg.creator.json", recipe: "counter" },
  { name: "poster", spec: "spec.msa-white.indic.8slides.json", brand: "brand.msa.indic.json" },
  { name: "interface", spec: "spec.en.8slides.json", brand: "brand.en.minimal.json" },
  { name: "heritage", spec: "spec.eg.8slides.json", brand: "brand.eg.creator.json" }
];
const FEEL = { story: "story", stamp: "story", reorder: "story", "drop-clock": "story", "map-dots": "story" };   // every other recipe is calm

function build(entry) {
  const out = path.join(OUT, `studio-${entry.name}.html`);
  buildStudioPage({ specFile: path.join(FIX, entry.spec), brandFile: path.join(FIX, entry.brand), outFile: out });
  log(`studio   ${path.relative(ROOT, out)}  ${(fs.statSync(out).size / 1048576).toFixed(1)} MiB`);
  return out;
}

/** Paints every slide of the showcase in every preset with the page's own engine; returns { preset: [{ n, type, b64 }] }. */
async function paintShowcase(page, presets) {
  const showcase = JSON.parse(fs.readFileSync(path.join(ROOT, "tools/examples/showcase.spec.json"), "utf8"));
  return page.evaluate(async ({ showcase, presets }) => {
    const brand = JSON.parse(document.getElementById("cs-brand").textContent);
    if (brand.visual) { delete brand.visual.palette; delete brand.visual.fonts; } // each preset shows its own colours and faces
    const result = {};
    for (const presetId of presets) {
      const spec = JSON.parse(JSON.stringify(showcase));
      spec.style.presetId = presetId + "@1.0";
      const deck = await CS.core.render.deck(spec, brand, { mode: "export", useFrozen: false });
      result[presetId] = [];
      for (const s of deck.slides) {
        const r = await CS.paint.raster(s.el, { type: "png", crop: "3x4" });
        let bin = "";
        for (let i = 0; i < r.bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, r.bytes.subarray(i, i + 0x8000));
        const slide = spec.slides[s.index];
        result[presetId].push({ n: s.index + 1, type: slide.type, b64: btoa(bin), fit: s.fit.ok, w: r.w, h: r.h });
      }
      deck.dispose();
    }
    return result;
  }, { showcase, presets });
}

function writeIndex(dir, sheet) {
  const types = sheet[Object.keys(sheet)[0]].map((s) => `${String(s.n).padStart(2, "0")}-${s.type}`);
  const rows = Object.keys(sheet).map((p) => `<h2>${p}</h2><div class="row">${types.map((t) => `<figure><img loading="lazy" src="${p}/${t}.png" alt="${p} ${t}"><figcaption>${t}</figcaption></figure>`).join("")}</div>`).join("\n");
  fs.writeFileSync(path.join(dir, "index.html"), `<!doctype html><html lang="en" dir="ltr"><head><meta charset="utf-8"><title>Carousel Studio renders</title><style>body{font:14px system-ui;margin:24px;background:#f4f4f2;color:#111}h2{margin:32px 0 8px}.row{display:flex;gap:12px;overflow-x:auto;padding-bottom:8px}figure{margin:0;flex:none}img{width:270px;height:360px;display:block;border:1px solid #0002}figcaption{font-size:12px;color:#555;padding-top:4px}</style></head><body><h1>Sample renders: every preset, every archetype family</h1>${rows}</body></html>\n`, "utf8");
}

async function renders() {
  const studioFile = build(STUDIOS[0]);
  const browser = await launchChromium({});
  const studio = await openStudio({ browser, studioFile });
  try {
    const presets = (flag("presets") || (await studio.page.evaluate(() => CS.core.registry.listPresets().map((p) => p.id)).then((a) => a.join(",")))).split(",");
    const sheet = await paintShowcase(studio.page, presets);
    const dir = path.join(OUT, "renders");
    let count = 0, overflow = 0;
    for (const [preset, slides] of Object.entries(sheet)) {
      fs.rmSync(path.join(dir, preset), { recursive: true, force: true });   // the file names follow the showcase: a slide added or moved must not leave its old file behind
      fs.mkdirSync(path.join(dir, preset), { recursive: true });
      for (const s of slides) {
        fs.writeFileSync(path.join(dir, preset, `${String(s.n).padStart(2, "0")}-${s.type}.png`), Buffer.from(s.b64, "base64"));
        count++; if (!s.fit) overflow++;
      }
    }
    writeIndex(dir, sheet);
    log(`renders  ${count} PNG in ${path.relative(ROOT, dir)} (${presets.length} presets x ${count / presets.length} slides; ${overflow} with a fit warning)`);
    if (studio.errors.length) log("page errors: " + studio.errors.slice(0, 3).join(" | "));
  } finally { await studio.close(); await browser.close(); }
}

async function previews() {
  const styles = path.join(ROOT, "plugins/carousel-studio/skills/carousel-design/styles");
  const studioFile = build(STUDIOS[0]);
  const browser = await launchChromium({});
  const studio = await openStudio({ browser, studioFile });
  try {
    const showcase = JSON.parse(fs.readFileSync(path.join(ROOT, "tools/examples/showcase.spec.json"), "utf8"));
    const out = await studio.page.evaluate(async (showcase) => {
      const brand = JSON.parse(document.getElementById("cs-brand").textContent);
      if (brand.visual) { delete brand.visual.palette; delete brand.visual.fonts; }
      const res = {};
      for (const preset of CS.core.registry.listPresets()) {
        const spec = JSON.parse(JSON.stringify(showcase));
        spec.style.presetId = preset.id + "@" + preset.version;
        delete spec.style.metaLabel;
        const r = await CS.core.render.slide(spec, brand, 0, { mode: "export" });
        const canvas = await CS.paint.toCanvas(r.el, { scale: 1 });
        const bytes = await CS.paint.encode(CS.paint.downscale(canvas, 540, 720), "png");
        let bin = "";
        for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
        res[preset.id] = btoa(bin);
      }
      return res;
    }, showcase);
    for (const [id, b64] of Object.entries(out)) {
      const file = path.join(styles, id, "preview.png"), bytes = Buffer.from(b64, "base64");
      fs.writeFileSync(file, bytes);
      log(`preview  ${path.relative(ROOT, file)}  ${(bytes.length / 1024).toFixed(0)} KiB${bytes.length > 200 * 1024 ? "  (over the 200 KiB budget)" : ""}`);
    }
    const lint = spawnSync(process.platform === "win32" ? "python" : "python3", [path.join(SCRIPTS, "preset_lint.py"), "--all", "--write-index"], { encoding: "utf8" });
    log(lint.stdout.trim().split("\n").slice(-3).join("\n"));
  } finally { await studio.close(); await browser.close(); }
}

/** The fixture post of a video as files: the preset is the video's name, the brand keeps its handle but gives up its palette and fonts so
 *  the cover shows the preset's own look (as the renders do), and a recipe override is written into the cover block. */
function videoInputs(v, dir) {
  const spec = JSON.parse(fs.readFileSync(path.join(FIX, v.spec), "utf8")), brand = JSON.parse(fs.readFileSync(path.join(FIX, v.brand), "utf8"));
  spec.style = { ...spec.style, presetId: v.name + "@1.0" };
  if (v.recipe) spec.cover = { motion: { ...((spec.cover || {}).motion || {}), recipe: v.recipe, feel: FEEL[v.recipe] || "calm" } };
  if (brand.visual) { delete brand.visual.palette; delete brand.visual.fonts; }
  const specFile = path.join(dir, `spec-${v.name}.json`), brandFile = path.join(dir, `brand-${v.name}.json`);
  fs.writeFileSync(specFile, JSON.stringify(spec), "utf8");
  fs.writeFileSync(brandFile, JSON.stringify(brand), "utf8");
  return { specFile, brandFile };
}

/** The contact page lists every cover in the folder, so a run that renders only some presets keeps the others' entries (index.json). */
function writeVideoIndex(dir, fresh) {
  const file = path.join(dir, "index.json");
  let known = [];
  try { known = JSON.parse(fs.readFileSync(file, "utf8")); } catch { /* first run */ }
  const byName = new Map(known.map((r) => [r.name, r]));
  fresh.forEach((r) => byName.set(r.name, r));
  const rows = VIDEOS.map((v) => byName.get(v.name)).filter((r) => r && fs.existsSync(path.join(dir, r.file)));
  fs.writeFileSync(file, JSON.stringify(rows, null, 1) + "\n", "utf8");
  const cells = rows.map((r) => `<figure><video src="${r.file}" muted loop autoplay playsinline></video><figcaption><b>${r.name}</b> · ${r.recipe} · ${r.kib} KiB · ${r.frames} frames</figcaption></figure>`).join("");
  fs.writeFileSync(path.join(dir, "index.html"), `<!doctype html><html lang="en" dir="ltr"><head><meta charset="utf-8"><title>Carousel Studio cover videos</title><style>body{font:14px system-ui;margin:24px;background:#f4f4f2;color:#111}.g{display:flex;flex-wrap:wrap;gap:16px}figure{margin:0}video{width:270px;height:360px;display:block;border:1px solid #0002;background:#000}figcaption{font-size:12px;color:#555;padding-top:4px}</style></head><body><h1>Animated covers: one per preset</h1><div class="g">${cells}</div></body></html>\n`, "utf8");
}

async function videos() {
  const dir = path.join(OUT, "videos"), names = flag("presets") ? flag("presets").split(",") : null;
  fs.mkdirSync(dir, { recursive: true });
  const rows = [];
  for (const v of VIDEOS.filter((x) => !names || names.includes(x.name))) {
    const out = path.join(dir, `${v.name}-cover.mp4`), keepDir = path.join(dir, `.work-${v.name}`);
    fs.mkdirSync(keepDir, { recursive: true });
    const inputs = videoInputs(v, keepDir);
    log(`video    ${v.name}: HyperFrames ${HYPERFRAMES_VERSION}`);
    const r = await renderCoverVideo({ specFile: inputs.specFile, brandFile: inputs.brandFile, outFile: out, variant: "3x4", quality: "high", keepDir, log });
    const check = spawnSync(process.execPath, [path.join(SCRIPTS, "check_video.mjs"), out, "--poster", r.poster, "--expect", "1080x1440", "--seconds", String(r.seconds), "--format", "json"], { encoding: "utf8" });
    fs.rmSync(keepDir, { recursive: true, force: true });
    log(`video    ${path.relative(ROOT, out)}  ${(r.bytes / 1024).toFixed(0)} KiB  ${r.frames} frames  ${r.recipe}  check_video exit ${check.status}`);
    if (check.status) { log(check.stdout.trim().slice(0, 600)); process.exitCode = 1; }
    rows.push({ name: v.name, file: path.basename(out), recipe: r.recipe, kib: (r.bytes / 1024).toFixed(0), frames: r.frames });
  }
  if (rows.length) writeVideoIndex(dir, rows);
}

/** The 5-mistakes kit exactly as the Claude Code lane writes it: both crops, the cover video from HyperFrames, the source files. */
function kit() {
  const out = path.join(OUT, "kit-5-mistakes");
  fs.rmSync(out, { recursive: true, force: true });
  log(`kit      render.mjs on the 5-mistakes post (3x4 and 4x5, HyperFrames ${HYPERFRAMES_VERSION})`);
  const r = spawnSync(process.execPath, [path.join(SCRIPTS, "render.mjs"), "--spec", path.join(FIX, STUDIOS[0].spec), "--brand", path.join(FIX, STUDIOS[0].brand), "--out", out,
    "--formats", "png,jpeg,pdf,zip,qa,source", "--variants", "3x4,4x5", "--video", "hyperframes", "--format", "json"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const files = fs.existsSync(out) ? fs.readdirSync(out, { recursive: true }).filter((f) => fs.statSync(path.join(out, f)).isFile()) : [];
  log(`kit      ${path.relative(ROOT, out)}  ${files.length} files  render.mjs exit ${r.status}`);
  if (r.status) { log((r.stderr || r.stdout).trim().slice(0, 800)); process.exitCode = 1; }
}

try {
  fs.mkdirSync(OUT, { recursive: true });
  if (want("studios")) for (const s of STUDIOS) build(s);
  if (want("renders")) await renders();
  if (want("videos")) await videos();
  if (want("kit")) kit();
  if (want("previews")) await previews();
} catch (e) {
  process.stderr.write(`cs-error: ${e.code || "E_INTERNAL"}: ${e.message}\n`);
  process.exitCode = e.exit || 70;
}
