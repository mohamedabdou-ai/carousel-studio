#!/usr/bin/env node
// tests/geometry/sheet.mjs · contact sheets of the layout sheet itself (package E3): what the recipes, the grid and timeline layouts and the staged
// variants look like in a real preset, with a dashed stand-in where an art builder will draw. Nothing here is art; it is the way to look at geometry.
//
//   node tests/geometry/sheet.mjs [--preset creator] [--kind recipes|items|variants|all] [--canvas 1440|1350] [--scale 0.4] [--out DIR]
//
// Writes sheet-<preset>-<kind>-<canvas>.png into DIR (default: the OS temp folder) and prints the paths. Needs playwright-core and a Chromium.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildStudioPage, launchChromium, openStudio } from "../../plugins/carousel-studio/skills/carousel-design/scripts/cover_video.mjs";
process.env.CS_ALL_PRESETS = "1";   // the test also covers the presets held back for a later release (ships 1.2)

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf("--" + n); return i >= 0 ? args[i + 1] : d; };
const preset = flag("preset", "creator"), kind = flag("kind", "all"), canvasH = +flag("canvas", "1440"), scale = +flag("scale", "0.4");
const outDir = path.resolve(flag("out", os.tmpdir()));
fs.mkdirSync(outDir, { recursive: true });

const showcase = JSON.parse(fs.readFileSync(path.join(ROOT, "tools/examples/showcase.spec.json"), "utf8"));
const work = fs.mkdtempSync(path.join(os.tmpdir(), "cs-sheet-"));
const specFile = path.join(work, "spec.json");
fs.writeFileSync(specFile, JSON.stringify(showcase));
const studioFile = buildStudioPage({ specFile, brandFile: path.join(ROOT, "tests/fixtures/brand.eg.creator.json"), outFile: path.join(work, "studio.html") });
const browser = await launchChromium({});
const studio = await openStudio({ browser, studioFile });
await studio.page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, "tests/geometry/layout-probe.js"), "utf8") });
const written = [];

async function sheet(name, cases, columns) {
  const meta = await studio.page.evaluate(async ({ showcase, preset, cases, canvasH, scale, columns }) => {
    const P = window.CSLayoutProbe;
    const brand = JSON.parse(document.getElementById("cs-brand").textContent);
    if (brand.visual) { delete brand.visual.palette; delete brand.visual.fonts; }
    const spec = JSON.parse(JSON.stringify(showcase)); spec.style.presetId = preset + "@1.0";
    const old = document.getElementById("cs-sheet"); if (old) old.remove();
    const host = document.createElement("div");
    host.id = "cs-sheet";
    const w = Math.round(1080 * scale), h = Math.round(canvasH * scale), gap = 14, label = 22;
    host.style.cssText = "position:absolute;left:0;top:0;z-index:99999;background:#7a7a7a;padding:" + gap + "px;display:grid;grid-template-columns:repeat(" + columns + "," + w + "px);gap:" + gap + "px;direction:ltr;";
    document.body.appendChild(host);
    const problems = [];
    for (const c of cases) {
      const index = spec.slides.findIndex((s) => s.type === c.type);
      const restore = c.variant ? P.withVariant(preset, c.type, c.variant) : () => {};
      const o = { recipe: c.recipe || null, canvasH, variant: c.variant || null, anchor: c.recipe ? true : false, label: c.label || null };
      if (c.items) { o.items = c.type === "compare" ? P.makeTable(c.items[0]) : P.makeItems(c.type, c.items[0], c.items[1]); o.itemOpts = c.itemOpts; }
      if (c.items && !c.recipe) { o.recipe = "full"; if (c.type === "compare") { o.short = false; o.anchor = false; } }
      const r = await P.run(spec, brand, index, o);
      restore();
      if (c.recipe) problems.push(...P.checkRecipe(r)); else if (c.items && c.type !== "compare") problems.push(...P.checkItems(r, c.type === "grid" ? "bento" : "rail", c.items[0], c.items[1]));
      const cell = document.createElement("div");
      cell.style.cssText = "width:" + w + "px;";
      const cap = document.createElement("div");
      cap.style.cssText = "font:600 13px/" + label + "px sans-serif;color:#fff;height:" + label + "px;overflow:hidden;white-space:nowrap;";
      cap.textContent = c.title;
      const frame = document.createElement("div");
      frame.style.cssText = "width:" + w + "px;height:" + h + "px;overflow:hidden;position:relative;background:#000;";
      r.el.style.transform = "scale(" + scale + ")"; r.el.style.transformOrigin = "top left"; r.el.style.position = "absolute"; r.el.style.left = "0"; r.el.style.top = "0";
      frame.appendChild(r.el); cell.appendChild(cap); cell.appendChild(frame); host.appendChild(cell);
    }
    const rect = host.getBoundingClientRect();
    return { w: Math.ceil(rect.width), h: Math.ceil(rect.height), problems };
  }, { showcase, preset, cases, canvasH, scale, columns });
  await studio.page.setViewportSize({ width: meta.w, height: meta.h });
  await studio.page.evaluate(() => document.fonts.ready);
  const file = path.join(outDir, `sheet-${preset}-${name}-${canvasH}.png`);
  await studio.page.screenshot({ path: file, clip: { x: 0, y: 0, width: meta.w, height: meta.h } });
  await studio.page.evaluate(() => { const h = document.getElementById("cs-sheet"); if (h) h.remove(); });
  written.push(file);
  console.log(`${file} (${meta.w}x${meta.h})${meta.problems.length ? "  problems: " + meta.problems.join(" | ") : ""}`);
}

const RECIPE_CASES = [];
const ALLOWED = await studio.page.evaluate(() => window.CSLayoutProbe.ALLOWED);
const VARIANT = await studio.page.evaluate(() => window.CSLayoutProbe.VARIANT);
for (const [type, recipes] of Object.entries(ALLOWED)) for (const recipe of recipes) RECIPE_CASES.push({ type, recipe, variant: VARIANT[type + ":" + recipe] || null, title: `${type} / ${recipe}${VARIANT[type + ":" + recipe] ? " : " + VARIANT[type + ":" + recipe] : ""}` });
const ITEM_CASES = [
  { type: "grid", items: [3, 0], title: "grid bento 3, key card first" }, { type: "grid", items: [3, -1], title: "grid bento 3, no key card" }, { type: "grid", items: [4, 1], title: "grid bento 4, key card 2" },
  { type: "timeline", items: [3, -1], title: "timeline rail 3" }, { type: "timeline", items: [4, 1], title: "timeline rail 4, key node 2" }, { type: "timeline", items: [5, -1], title: "timeline rail 5" }
];
const VARIANT_CASES = [
  { type: "rehook", variant: "statement", title: "rehook : statement" }, { type: "quote", variant: "statement", title: "quote : statement" },
  { type: "item", variant: "numeral", title: "item : numeral" }, { type: "item", variant: "side-number", title: "item : side-number" }, { type: "step", variant: "track", title: "step : track" },
  { type: "stat", variant: "chart", title: "stat : chart" }, { type: "stat", variant: "icon", title: "stat : icon" }, { type: "cta", variant: "action", title: "cta : action" },
  { type: "compare", variant: "before-after", title: "compare : before-after" }, { type: "compare", variant: "table", items: [4, -1], title: "compare : table, 4 criteria" }
];
try {
  if (kind === "recipes" || kind === "all") await sheet("recipes", RECIPE_CASES, 6);
  if (kind === "items" || kind === "all") await sheet("items", ITEM_CASES, 3);
  if (kind === "variants" || kind === "all") await sheet("variants", VARIANT_CASES, 5);
  if (studio.errors.length) console.log("page errors: " + studio.errors.slice(0, 3).join(" | "));
} finally {
  await studio.close(); await browser.close();
  fs.rmSync(work, { recursive: true, force: true });
}
process.exitCode = studio.errors.length ? 1 : 0;
