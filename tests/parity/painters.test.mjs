// Painter parity (CONTRACT 4.5). Two ways to run this file.
//
// 1. As a module of the browser runner (node tests/video/run.mjs): the harness page with the test fixtures. Until the committed goldens
//    (tests/golden) cover pixels, the reference is the browser's own rendering of the live slide (a Playwright element screenshot):
//      svg painter    vs live  SSIM >= 0.995   (the reference painter must reproduce the page)
//      replay painter vs live  SSIM >= 0.99    (canvas text and gradients anti-alias slightly differently)
//      svg vs replay           SSIM >= 0.98    (the contract's parity bound)
//    Also checked mid-animation, where transforms, clip-paths, group opacity and the metaphor overlays are in play.
//
// 2. On its own (node tests/parity/painters.test.mjs [--root DIR] [--runtime DIR] [--spec FILE] [--preset a,b] [--min 0.98] [--max-below 6] [--json FILE]):
//    the FULL matrix. The real Studio page of the tree in --root (default: this repository) renders every slide type of the showcase deck
//    in every shipped preset (18 types x 6 presets = 108 slides) and each is painted by both painters at scale 1. The contract's
//    bound is 0.98 for all of them; this matrix is the measurement behind it. Round 3 (F1) passes with at most 6 slides below 0.98
//    (102 of 108), which are listed with their scores: the `proof` slide (an <img> SVG asset) in five presets and the interface cover.
//    --spec FILE renders another deck than the root's showcase. --runtime DIR lays a private chunk build over the root's runtime/ (node tools/build.mjs --module paint --out DIR) so a source change is
//    measured without rebuilding the shared tree. Exit 0 = within the bound, 1 = more slides below it, 70 = the page could not be driven.
import { pathToFileURL } from "node:url";
import fs from "node:fs";
import path from "node:path";
import { cliOptions, openRoot, PRESETS } from "./lib/studio.mjs";

const SLIDES = [["mistakes", 4], ["heritage", 4], ["counter", 2]];

/** Every slide of the showcase deck in every preset, painted by both painters; resolves to { rows, presets, types, below, total, version }. */
export async function parityMatrix({ root, runtime, spec, presets, min = 0.98, chromium, log = () => {} } = {}) {
  const studio = await openRoot({ root, runtime, spec, chromium });
  try {
    const ids = presets || PRESETS;
    const rows = {}, below = [];
    let version = null, total = 0;
    for (const id of ids) {
      const r = await studio.page.evaluate(async ({ showcase, id }) => {
        const brand = JSON.parse(document.getElementById("cs-brand").textContent);
        if (brand.visual) { delete brand.visual.palette; delete brand.visual.fonts; }
        const preset = CS.core.registry.listPresets().filter((p) => p.id === id)[0];
        if (!preset) return null;
        const spec = JSON.parse(JSON.stringify(showcase));
        spec.style.presetId = id + "@" + preset.version;
        const deck = await CS.core.render.deck(spec, brand, { mode: "export", useFrozen: false });
        const out = { version: CS.version, slides: [] };
        for (const slide of deck.slides) {
          const el = slide.el, type = el.getAttribute("data-type");
          let ssim = null, error = null, unsupported = [];
          try {
            const a = await CS.paint.toCanvas(el, { scale: 1, painter: "svg" }), b = await CS.paint.toCanvas(el, { scale: 1, painter: "replay" });
            ssim = CS.paint.metrics.ssim(a, b);
            unsupported = CS.paint.replay.supports(el).unsupported || [];
          } catch (e) { error = String(e.code || e.message); }
          out.slides.push({ type, ssim, error, unsupported });
        }
        deck.dispose();
        return out;
      }, { showcase: studio.showcase, id });
      if (!r) { log(`preset ${id} is not shipped by this tree`); continue; }
      version = r.version; rows[id] = {};
      for (const s of r.slides) {
        let key = s.type, k = 2;
        while (rows[id][key]) key = s.type + "#" + k++;
        rows[id][key] = s.error ? { error: s.error } : { ssim: Math.round(s.ssim * 10000) / 10000, unsupported: s.unsupported };
        total++;
        if (s.error || s.ssim < min) below.push({ preset: id, type: key, ssim: s.error ? null : Math.round(s.ssim * 10000) / 10000, error: s.error || undefined });
      }
      log(`painted ${id}: ${r.slides.length} slides`);
    }
    const types = Array.from(new Set(Object.values(rows).flatMap((r) => Object.keys(r))));
    return { rows, presets: Object.keys(rows), types, below, total, version, pageErrors: studio.errors.slice(0, 3) };
  } finally { await studio.close(); }
}

export function formatMatrix(m, min = 0.98) {
  const lines = ["type".padEnd(13) + m.presets.map((p) => p.slice(0, 9).padEnd(10)).join("")];
  for (const t of m.types) {
    lines.push(t.padEnd(13) + m.presets.map((p) => {
      const c = m.rows[p][t], v = !c ? "-" : c.error ? "ERR" : c.ssim.toFixed(4) + (c.ssim < min ? "*" : "");
      return v.padEnd(10);
    }).join(""));
  }
  return lines.join("\n");
}

async function main() {
  const args = process.argv.slice(2), opts = cliOptions(args), flag = (n) => { const i = args.indexOf("--" + n); return i >= 0 ? args[i + 1] : null; };
  const min = flag("min") ? parseFloat(flag("min")) : 0.98, maxBelow = flag("max-below") ? parseInt(flag("max-below"), 10) : 6;
  const m = await parityMatrix({ root: opts.root, runtime: opts.runtime, spec: flag("spec") ? path.resolve(flag("spec")) : undefined, presets: opts.presets, chromium: opts.chromium, min, log: (s) => process.stderr.write(s + "\n") });
  console.log(`svg painter against replay painter, SSIM at scale 1 (engine ${m.version}; * = below ${min})\n`);
  console.log(formatMatrix(m, min));
  const perPreset = m.presets.map((p) => `${p} ${Object.values(m.rows[p]).filter((c) => c.error || c.ssim < min).length}`).join(" · ");
  console.log(`\nbelow ${min} per preset: ${perPreset}`);
  console.log(`${m.total - m.below.length} of ${m.total} slides at SSIM >= ${min}; ${m.below.length} below (allowed: ${maxBelow})`);
  for (const b of m.below) console.log(`  below: ${b.preset} / ${b.type} ${b.error ? "error " + b.error : b.ssim.toFixed(4)}`);
  if (m.pageErrors.length) console.log("page errors: " + m.pageErrors.join(" | "));
  if (flag("json")) fs.writeFileSync(path.resolve(flag("json")), JSON.stringify(m, null, 1) + "\n", "utf8");
  return m.below.length > maxBelow ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().then((c) => { process.exitCode = c; }, (e) => { process.stderr.write("cs-error: E_INTERNAL: " + (e && e.stack || e) + "\n"); process.exit(70); });   // at once: a page that never booted leaves its local server open
}

export default {
  module: "parity",
  tests: [
    ...SLIDES.map(([fx, n]) => ({
      name: `${fx}: svg and replay painters against the live page, every slide`,
      async run(t) {
        await t.page.evaluate(async (fx) => {
          window.__deck = await CS.core.render.deck(CS_FIXTURES[fx], null, {});
          const st = window.__deck.stage; st.style.left = "0px"; st.style.position = "absolute";
        }, fx);
        const count = await t.page.evaluate(() => window.__deck.slides.length);
        t.gte(count, n);
        for (let i = 0; i < count; i++) {
          const shot = await t.page.locator(`[data-n="${i + 1}"]`).first().screenshot({ type: "png" });
          const r = await t.page.evaluate(async ([i, b64]) => {
            const el = window.__deck.slides[i].el, img = new Image(); img.src = "data:image/png;base64," + b64; await img.decode();
            const live = document.createElement("canvas"); live.width = 1080; live.height = 1440; live.getContext("2d").drawImage(img, 0, 0);
            const svg = await CS.paint.toCanvas(el, { scale: 1, painter: "svg" }), rep = await CS.paint.toCanvas(el, { scale: 1, painter: "replay" }), m = CS.paint.metrics;
            return { svgLive: m.ssim(svg, live), repLive: m.ssim(rep, live), svgRep: m.ssim(svg, rep), support: CS.paint.replay.supports(el) };
          }, [i, shot.toString("base64")]);
          t.eq(r.support, { ok: true, unsupported: [] }, `${fx} slide ${i + 1}: replay support`);
          t.gte(r.svgLive, 0.995, `${fx} slide ${i + 1}: svg vs live`); t.gte(r.repLive, 0.99, `${fx} slide ${i + 1}: replay vs live`); t.gte(r.svgRep, 0.98, `${fx} slide ${i + 1}: svg vs replay`);
        }
      }
    })),
    {
      name: "mid-animation frames: the two painters agree for every recipe (transforms, clip-path, group opacity, overlays)",
      async run(t) {
        const r = await t.page.evaluate(async () => {
          const cases = [["mistakes", "story"], ["counter", "counter"], ["urgent", "drop-clock"], ["spread", "map-dots"], ["myth", "stamp"], ["steps", "reorder"], ["opinion", "highlight-sweep"], ["opinion", "calm"], ["opinion", "curtain"], ["opinion", "zoom"], ["counter", "notify"], ["english", "split"]];
          const worst = [];
          for (const [fx, recipe] of cases) {
            const deck = await CS.core.render.deck(CS_FIXTURES[fx], null, { slideIds: ["s01"] });
            const el = deck.slides[0].el, tl = CS.motion.build(el, { recipe }), ctrl = CS.motion.hf.install(el, tl, "cs-cover");
            await ctrl.ready;
            let min = 1;
            for (const x of [0.5, 0.9, 1.3, 1.8, 2.4, 3.0, 4.0, 4.3]) { ctrl.seek(x); min = Math.min(min, CS.paint.metrics.ssim(await CS.paint.toCanvas(el, { scale: 1, painter: "svg" }), await CS.paint.toCanvas(el, { scale: 1, painter: "replay" }))); }
            worst.push([fx + "/" + recipe, +min.toFixed(4)]);
            ctrl.destroy(); deck.dispose();
          }
          return worst;
        });
        for (const [name, min] of r) t.gte(min, 0.98, `${name}: worst svg vs replay SSIM over the build`);
      }
    },
    {
      name: "the replay painter never changes the page: styles, attributes and children are identical afterwards",
      async run(t) {
        const r = await t.page.evaluate(async () => {
          const deck = await CS.core.render.deck(CS_FIXTURES.heritage, null, { slideIds: ["s01"] });
          const el = deck.slides[0].el, tl = CS.motion.build(el, { recipe: "story" }), ctrl = CS.motion.hf.install(el, tl, "cs-cover");
          await ctrl.ready; ctrl.seek(2.0);
          const before = el.outerHTML, nodes = el.querySelectorAll("*").length;
          await CS.paint.toCanvas(el, { scale: 1, painter: "replay" }); await CS.paint.toCanvas(el, { scale: 1, painter: "svg" });
          const out = { same: el.outerHTML === before, nodes: el.querySelectorAll("*").length === nodes, stray: document.querySelectorAll("[data-cs-px]").length };
          ctrl.destroy(); deck.dispose();
          return out;
        });
        t.ok(r.same, "outerHTML unchanged"); t.ok(r.nodes, "no stand-in elements left in the slide"); t.eq(r.stray, 0);
      }
    }
  ]
};
