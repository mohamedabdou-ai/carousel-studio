#!/usr/bin/env node
// tests/cover-baseline/run.mjs · the cover pixel baseline of Carousel Studio 1.0, and the check that no later change moves a cover.
// (Round 3, package F1; spec 10.4 S0: "take the cover pixel baseline, asserted at SSIM >= 0.995 in CI".)
//
//   node tests/cover-baseline/run.mjs --check   [--preset swiss,creator] [--root DIR] [--runtime DIR] [--out DIR] [--baseline DIR] [--chromium PATH]
//   node tests/cover-baseline/run.mjs --capture [--root DIR] [--baseline DIR]         (once, from the PRISTINE 1.0 tree; see below)
//
// What is measured, for each of the six presets, from one frozen input (baseline/input/: the 1.0 showcase spec and the creator brand
// fixture, so later edits of the showcase deck cannot move the baseline):
//   cover            slide 1 in its default variant, painted by the svg painter at 540 x 720 (scale 0.5)      SSIM >= 0.995
//   cover@<variant>  the same for every variant the preset styles for the cover (top, number, center, ...)  SSIM >= 0.995
//                    (a variant that paints exactly like another entry is stored once and listed with "sameAs")
//   frame0           frame 0 of the cover's motion timeline, painted the way the Studio's MP4 export paints it (CS.export.renderCover:
//                    timeline built, controller installed, seek(0), full paint at scale 1, then reduced 2x to 540 x 720)   SSIM >= 0.99
//                    and, inside the same run, frame 0 against its own still poster (the loop gate V1's frame0VsPoster)   SSIM >= 0.99
// The MP4 itself is not encoded: the writer (mediabunny) is loaded from a CDN at export time, which this offline test never does. Frame 0
// is what the encoder is handed, so a cover whose frame 0 matches the baseline is a cover whose video starts the same. The manifest records
// whether this machine could encode H.264 at all.
//
// Capture from the pristine tree, never from a tree under edit:  node tests/cover-baseline/run.mjs --capture --root <pristine 1.0 copy>
// It then writes baseline/ (PNGs, manifest.json, input/) into THIS repository. --check measures --root (default: this repository), and with
// --runtime DIR a private chunk build laid over that root's runtime/ (see tests/parity/lib/studio.mjs): the way to ask "does my change
// move a cover?" without running `npm run build`. A failing cover is saved to --out (default: the system temp folder) for a look.
// Exit codes: 0 all within threshold · 1 a cover moved · 2 no baseline · 64 usage · 70 the page could not be driven.
import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cliOptions, openRoot, PRESETS, tempDir } from "../parity/lib/studio.mjs";
import { decodePng, ssim } from "../parity/lib/ssim.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (n) => { const i = args.indexOf("--" + n); return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : null; };
const COVER_MIN = 0.995, FRAME0_MIN = 0.99, W = 540, H = 720;

function usage(code, message) {
  if (message) process.stderr.write("cs-error: E_USAGE: " + message + "\n");
  (code ? process.stderr : process.stdout).write("usage: node tests/cover-baseline/run.mjs (--check | --capture) [--preset a,b] [--root DIR] [--runtime DIR] [--out DIR] [--baseline DIR] [--chromium PATH]\n");
  process.exit(code);
}
if (args.includes("--help") || args.includes("-h")) usage(0);
const capture = args.includes("--capture"), check = args.includes("--check");
if (capture === check) usage(64, "give exactly one of --capture and --check");
const opts = cliOptions(args);
const baselineDir = path.resolve(flag("baseline") || path.join(HERE, "baseline"));
const sha = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex").slice(0, 16);

/* The page side: one function that paints every wanted entry of one preset and returns PNG bytes (the engine's own 8-bit RGB writer). */
async function paintPreset(page, spec0, presetId, want) {
  return page.evaluate(async ({ spec0, presetId, want, W, H }) => {
    const b64 = (u8) => { let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
    const brand = JSON.parse(document.getElementById("cs-brand").textContent);
    if (brand.visual) { delete brand.visual.palette; delete brand.visual.fonts; }
    const reg = CS.core.registry, preset = reg.listPresets().filter((p) => p.id === presetId)[0];
    if (!preset) return { missing: true };
    const covers = ((reg.getPreset(presetId).variants || {}).cover || []);
    const make = () => { const s = JSON.parse(JSON.stringify(spec0)); s.style.presetId = presetId + "@" + preset.version; return s; };
    const out = { version: CS.version, preset: preset.id + "@" + preset.version, variants: covers.slice(), entries: {}, h264: null };
    try { const sup = await CS.export.mp4.support(1080, 1440, 30); out.h264 = !!sup.supported; } catch (e) { out.h264 = false; }
    const paint = async (spec) => {
      const deck = await CS.core.render.deck(spec, brand, { mode: "export", useFrozen: false, slideIds: [spec.slides[0].id] });
      try { const canvas = await CS.paint.toCanvas(deck.slides[0].el, { scale: W / 1080, painter: "svg" }); return b64(await CS.paint.encode(canvas, "png")); }
      finally { deck.dispose(); }
    };
    if (want.cover) out.entries.cover = { png: await paint(make()) };
    for (const v of covers) {
      if (!want.variants) break;
      const s = make(); s.slides[0].variant = v;
      out.entries["cover@" + v] = { png: await paint(s), variant: v };
    }
    if (want.frame0) {
      const spec = make(), motion = (spec.cover && spec.cover.motion) || { recipe: "calm" };
      if (motion.recipe === "none") { out.entries.frame0 = { skipped: "the cover has no motion" }; return out; }
      const deck = await CS.core.render.deck(spec, brand, { mode: "export", useFrozen: false, slideIds: [spec.slides[0].id] });
      try {
        const el = deck.slides[0].el, rec = CS.motion.recommend(spec);
        const timeline = CS.motion.build(el, { recipe: motion.recipe, seconds: motion.seconds || 6, feel: motion.feel, metaphor: motion.recipe === "story" ? rec.metaphor : undefined, topics: rec.tags });
        const poster = await CS.paint.toCanvas(el, { scale: 1 });
        const ctrl = CS.motion.hf.install(el, timeline, "cs-cover", { driver: "style" });
        await ctrl.ready; ctrl.seek(0);
        const canvas = document.createElement("canvas");
        await CS.paint.toCanvas(el, { scale: 1, canvas, settle: true });
        const f0 = CS.paint.downscale(canvas, W, H), ps = CS.paint.downscale(poster, W, H);
        out.entries.frame0 = { png: b64(await CS.paint.encode(f0, "png")), vsPoster: CS.paint.metrics.ssim(f0, ps), recipe: timeline.recipe };
        ctrl.destroy();
      } finally { deck.dispose(); }
    }
    return out;
  }, { spec0, presetId, want, W, H });
}

const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const inputDir = path.join(baselineDir, "input");

async function main() {
  const presets = (opts.presets || PRESETS).filter((p) => PRESETS.includes(p));
  if (!presets.length) usage(64, "--preset names none of: " + PRESETS.join(", "));
  let spec0, brandFile;
  if (capture) {
    spec0 = read(path.join(opts.root, "tools/examples/showcase.spec.json"));
    fs.mkdirSync(inputDir, { recursive: true });
    fs.copyFileSync(path.join(opts.root, "tests/fixtures/brand.eg.creator.json"), path.join(inputDir, "brand.json"));
    fs.writeFileSync(path.join(inputDir, "spec.json"), JSON.stringify(spec0, null, 1) + "\n", "utf8");
    brandFile = path.join(inputDir, "brand.json");
  } else {
    if (!fs.existsSync(path.join(baselineDir, "manifest.json"))) { process.stderr.write(`no baseline at ${baselineDir}: capture one from the pristine 1.0 tree first\n`); return 2; }
    spec0 = read(path.join(inputDir, "spec.json"));
    brandFile = path.join(inputDir, "brand.json");
  }
  const studio = await openRoot({ root: opts.root, runtime: opts.runtime, spec: spec0, brand: brandFile, chromium: opts.chromium });
  const results = {};
  try {
    for (const id of presets) {
      const r = await paintPreset(studio.page, spec0, id, { cover: true, variants: true, frame0: true });
      if (r.missing) { process.stderr.write(`the preset ${id} is not shipped by ${opts.root}\n`); return 70; }
      results[id] = r;
    }
    if (studio.errors.length) process.stderr.write("page errors: " + studio.errors.slice(0, 3).join(" | ") + "\n");
  } finally { await studio.close(); }

  if (capture) {
    const manifest = fs.existsSync(path.join(baselineDir, "manifest.json")) ? read(path.join(baselineDir, "manifest.json")) : { schemaVersion: 1, thresholds: { cover: COVER_MIN, frame0: FRAME0_MIN, frame0VsPoster: FRAME0_MIN }, size: [W, H], presets: {} };
    manifest.capturedFrom = { engine: Object.values(results)[0].version, tree: "pristine 1.0 (backups/carousel-studio-before-round3.tar)", painter: "svg", note: "covers: svg painter at 540x720; frame0: the Studio MP4 export's first canvas, reduced 2x; the MP4 writer is not run (it needs the network)" };
    for (const [id, r] of Object.entries(results)) {
      const entries = {}, seen = {};
      fs.rmSync(path.join(baselineDir, id), { recursive: true, force: true });
      fs.mkdirSync(path.join(baselineDir, id), { recursive: true });
      for (const [name, e] of Object.entries(r.entries)) {
        if (!e.png) { entries[name] = { skipped: e.skipped }; continue; }
        const bytes = Buffer.from(e.png, "base64"), file = path.join(id, name.replace("@", "-") + ".png"), digest = sha(bytes);
        if (name !== "frame0" && seen[digest]) { entries[name] = { sameAs: seen[digest], variant: e.variant, sha256: digest }; continue; }
        if (name !== "frame0") seen[digest] = name;
        fs.writeFileSync(path.join(baselineDir, file), bytes);
        entries[name] = { file: file.replace(/\\/g, "/"), bytes: bytes.length, sha256: sha(bytes), ...(e.vsPoster !== undefined ? { frame0VsPoster: Math.round(e.vsPoster * 1e5) / 1e5, recipe: e.recipe } : {}), ...(e.variant ? { variant: e.variant } : {}) };
      }
      manifest.presets[id] = { preset: r.preset, coverVariants: r.variants, h264EncoderHere: r.h264, entries };
      console.log(`captured ${id.padEnd(10)} ${Object.keys(entries).join(", ")}`);
    }
    fs.writeFileSync(path.join(baselineDir, "manifest.json"), JSON.stringify(manifest, null, 1) + "\n", "utf8");
    console.log(`baseline written to ${baselineDir}`);
    return 0;
  }

  const manifest = read(path.join(baselineDir, "manifest.json"));
  const outDir = flag("out") ? path.resolve(flag("out")) : null;
  let bad = 0, total = 0, worst = 1;
  for (const id of presets) {
    const base = manifest.presets[id], r = results[id];
    if (!base) { console.log(`FAIL ${id}: not in the baseline`); bad++; continue; }
    for (const [name, b0] of Object.entries(base.entries)) {
      const b = b0.sameAs ? base.entries[b0.sameAs] : b0;
      if (!b || !b.file) continue;
      total++;
      const fresh = r.entries[name];
      const min = name === "frame0" ? FRAME0_MIN : COVER_MIN;
      if (!fresh || !fresh.png) { console.log(`FAIL ${id.padEnd(10)} ${name.padEnd(16)} not produced now`); bad++; continue; }
      const bytes = Buffer.from(fresh.png, "base64"), score = ssim(decodePng(fs.readFileSync(path.join(baselineDir, b.file))), decodePng(bytes));
      worst = Math.min(worst, score);
      let line = `${id.padEnd(10)} ${name.padEnd(16)} ssim ${score.toFixed(5)} (>= ${min})`, ok = score >= min;
      if (name === "frame0") { line += `  frame 0 vs its poster ${fresh.vsPoster.toFixed(5)} (>= ${FRAME0_MIN})`; ok = ok && fresh.vsPoster >= FRAME0_MIN; }
      console.log((ok ? "ok   " : "FAIL ") + line);
      if (!ok) { bad++; const dir = outDir || tempDir("cs-cover-"); fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, `${id}-${name.replace("@", "-")}.now.png`), bytes); console.log(`       saved ${path.join(dir, `${id}-${name.replace("@", "-")}.now.png`)}`); }
    }
  }
  console.log(bad ? `\n${bad} of ${total} cover images moved.` : `\nall ${total} cover images within threshold (worst SSIM ${worst.toFixed(5)}).`);
  return bad ? 1 : 0;
}

main().then((c) => { process.exitCode = c; }, (e) => { process.stderr.write("cs-error: E_INTERNAL: " + (e && e.stack || e) + "\n"); process.exit(70); });   // at once: a page that never booted leaves its local server open
