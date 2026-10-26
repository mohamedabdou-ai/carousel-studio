// tests/mobile-e2e/preset-matrix.mjs · every shipped preset x every archetype family, through the real engine and the rendered QA gates.
//
//   node tests/mobile-e2e/preset-matrix.mjs [--spec FILE] [--presets swiss,creator,...] [--digits western|arabic-indic] [--dialect eg|gulf|levant|msa-white|en] [--variants] [--verbose]
//
// Builds the Studio page, renders the slides of --spec (default: the twenty of tools/examples/showcase.spec.json: cover, rehook, item, step, stat,
// compare, myth-fact, quote, story-beat, proof, checklist, summary, setup, grid, timeline, testimonial, offer, share, poster, cta) in each preset, and
// runs the rendered gates
// (D1-D7, T1, B1) plus the text gates on each deck. Rendered gates never have false BLOCKs by contract (CONTRACT 7.1), so any BLOCK or
// FIX from them fails the run. --variants also renders, per preset, every variant the preset styles for each slide type (one deck per
// variant index), so the oversized numerals, panels, stamps and cards are all exercised. Then, for each preset, the variants of the layout sheet that the preset does
// not style yet (the staged variants of round 3: rehook:statement item:numeral step:track stat:icon stat:chart compare:table compare:before-after quote:statement
// cta:action, and whatever a later round adds) are listed and rendered in layout-only rounds through the same gates (--no-layout-variants skips them), and the run
// fails when one of the staged variants is missing from the layout sheet. Exit 0 = clean, 1 = findings. Needs playwright-core and a Chromium (see cover_video.mjs).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildStudioPage, launchChromium, openStudio } from "../../plugins/carousel-studio/skills/carousel-design/scripts/cover_video.mjs";
process.env.CS_ALL_PRESETS = "1";   // the test also covers the presets held back for a later release (ships 1.2)

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const args = process.argv.slice(2);
const flag = (n) => { const i = args.indexOf("--" + n); return i >= 0 ? args[i + 1] : null; };
const verbose = args.includes("--verbose");
const layoutVariants = !args.includes("--no-layout-variants");
/** The staged variants of plan r2 3.1 plus the two types of F2: the layout sheet (templates/archetypes.html) must list every one. */
const STAGED = { "rehook": ["statement"], "item": ["numeral"], "step": ["track"], "stat": ["icon", "chart"], "compare": ["table", "before-after"], "quote": ["statement"], "cta": ["action"], "grid": ["bento"], "timeline": ["rail"] };

const showcase = JSON.parse(fs.readFileSync(flag("spec") ? path.resolve(flag("spec")) : path.join(ROOT, "tools/examples/showcase.spec.json"), "utf8"));
if (flag("digits")) showcase.locale.digits = flag("digits");
if (flag("dialect")) { showcase.locale.dialect = flag("dialect"); if (showcase.locale.dialect === "en") { showcase.locale.appLanguage = "en"; showcase.locale.swipeCue = "arrow-ltr"; } }

const work = fs.mkdtempSync(path.join(os.tmpdir(), "cs-matrix-"));
const specFile = path.join(work, "spec.json");
fs.writeFileSync(specFile, JSON.stringify(showcase));
const studioFile = buildStudioPage({ specFile, brandFile: path.join(ROOT, "tests/fixtures/brand.eg.creator.json"), outFile: path.join(work, "studio.html") });
const browser = await launchChromium({});
const studio = await openStudio({ browser, studioFile });
let bad = 0;
try {
  const presets = flag("presets") ? flag("presets").split(",") : await studio.page.evaluate(() => CS.core.registry.listPresets().map((p) => p.id));
  for (const id of presets) {
    const rounds = args.includes("--variants") ? await studio.page.evaluate((id) => Math.max.apply(null, Object.values(CS.core.registry.getPreset(id).variants || {}).map((v) => v.length)), id) : 1;
    for (let round = 0; round < rounds; round++) {
      const out = await studio.page.evaluate(async ({ showcase, id, round }) => {
        const brand = JSON.parse(document.getElementById("cs-brand").textContent);
        if (brand.visual) { delete brand.visual.palette; delete brand.visual.fonts; }
        const spec = JSON.parse(JSON.stringify(showcase));
        spec.style.presetId = id + "@1.0";
        if (round > 0) {
          const vars = CS.core.registry.getPreset(id).variants || {};
          spec.slides.forEach((sl) => { const list = vars[sl.type] || []; if (list[round]) sl.variant = list[round]; });
        }
        const tokens = CS.core.resolve.post(spec, brand);
        const deck = await CS.core.render.deck(spec, brand, { mode: "export", useFrozen: false });
        const rendered = await CS.qa.runRendered({ spec, tokens, deck });
        deck.dispose();
        const pick = (r) => ({ sev: r.sev, rule: r.rule, slide: r.slide || "", msg: r.msg.en });
        return { rendered: rendered.map(pick), adjustments: tokens.adjustments.map((a) => a.path + " (" + a.reason + ")") };
      }, { showcase, id, round });
      const findings = out.rendered.filter((r) => r.sev !== "NOTE");
      bad += findings.length;
      const label = rounds > 1 ? `${id} #${round + 1}` : id;
      console.log(`${findings.length ? "FAIL" : "ok  "} ${label.padEnd(12)} ${findings.length ? findings.length + " finding(s)" : "every archetype passes the rendered gates"}${out.adjustments.length ? "  (token adjustments: " + out.adjustments.join(", ") + ")" : ""}`);
      for (const f of findings) console.log(`       ${f.sev} ${f.rule} ${f.slide} ${f.msg}`);
      if (verbose) for (const f of out.rendered.filter((r) => r.sev === "NOTE")) console.log(`       NOTE ${f.rule} ${f.slide} ${f.msg}`);
    }
  }
  if (layoutVariants) {
    const listed = await studio.page.evaluate((STAGED) => Object.keys(STAGED).flatMap((t) => STAGED[t].filter((v) => CS.core.registry.getArchetype(t).variants.indexOf(v) < 0).map((v) => t + ":" + v)), STAGED);
    if (listed.length) { bad += listed.length; console.log("FAIL the layout sheet does not list the staged variant(s) " + listed.join(", ")); }
    for (const id of presets) {
      const extra = await studio.page.evaluate((id) => {
        const reg = CS.core.registry, p = reg.getPreset(id), out = {};
        for (const t of CS.core.constants.SLIDE_TYPES) { const missing = reg.getArchetype(t).variants.filter((v) => (p.variants[t] || []).indexOf(v) < 0); if (missing.length) out[t] = missing; }
        return out;
      }, id);
      const rounds = Math.max(0, ...Object.values(extra).map((v) => v.length));
      const names = Object.entries(extra).flatMap(([t, vs]) => vs.map((v) => t + ":" + v));
      let found = 0;
      for (let round = 0; round < rounds; round++) {
        const out = await studio.page.evaluate(async ({ showcase, id, round, extra }) => {
          const brand = JSON.parse(document.getElementById("cs-brand").textContent);
          if (brand.visual) { delete brand.visual.palette; delete brand.visual.fonts; }
          const spec = JSON.parse(JSON.stringify(showcase));
          spec.style.presetId = id + "@1.0";
          const p = CS.core.registry.getPreset(id), added = [];
          spec.slides.forEach((sl) => { const list = extra[sl.type] || []; if (list[round]) { sl.variant = list[round]; (p.variants[sl.type] = p.variants[sl.type] || []).push(list[round]); added.push(sl.type + ":" + list[round]); } });
          try {
            const tokens = CS.core.resolve.post(spec, brand);
            const deck = await CS.core.render.deck(spec, brand, { mode: "export", useFrozen: false });
            const rendered = await CS.qa.runRendered({ spec, tokens, deck });
            deck.dispose();
            return { rendered: rendered.map((r) => ({ sev: r.sev, rule: r.rule, slide: r.slide || "", msg: r.msg.en })), added };
          } finally { added.forEach((a) => { const [t, v] = a.split(":"), l = p.variants[t], i = l.lastIndexOf(v); if (i >= 0) l.splice(i, 1); }); }
        }, { showcase, id, round, extra });
        const findings = out.rendered.filter((r) => r.sev !== "NOTE");
        found += findings.length; bad += findings.length;
        for (const f of findings) console.log(`       layout-only ${out.added.join(" ")}: ${f.sev} ${f.rule} ${f.slide} ${f.msg}`);
      }
      console.log(`${found ? "FAIL" : "ok  "} ${id.padEnd(12)} layout-only variants (not styled by the preset yet), ${rounds} round(s): ${names.join(" ") || "none"}`);
    }
  }
  if (studio.errors.length) { console.log("page errors: " + studio.errors.slice(0, 3).join(" | ")); bad++; }
} finally {
  await studio.close(); await browser.close();
  fs.rmSync(work, { recursive: true, force: true });
}
process.exitCode = bad ? 1 : 0;
