#!/usr/bin/env node
// tests/golden/run.mjs · golden hashes of what the engine builds, for every preset and every archetype (draft 13.2).
//
//   node tests/golden/run.mjs            compare with tests/golden/manifest.json (exit 1 on any difference)
//   node tests/golden/run.mjs --update   rewrite the manifest after a change you meant to make
//
// Pictures differ a little from one machine to the next (font rasterisation), so the manifest holds what does not: for each preset the hash of
// its resolved design tokens, and for each of the 18 archetypes of tools/examples/showcase.spec.json the hash of the composed slide markup
// (the DOM the engine builds from the spec and the tokens, before the browser lays it out). A template, a token or a rule that changes
// without the manifest changing with it fails here, so a visual change is always a deliberate, reviewed one. The pixel comparison of the
// painters against the browser is tests/parity; the rendered gates on every archetype are tests/mobile-e2e/preset-matrix.mjs.
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildStudioPage, launchChromium, openStudio } from "../../plugins/carousel-studio/skills/carousel-design/scripts/cover_video.mjs";
process.env.CS_ALL_PRESETS = "1";   // the test also covers the presets held back for a later release (ships 1.2)

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const MANIFEST = path.join(ROOT, "tests/golden/manifest.json");
const update = process.argv.includes("--update");
const sha = (s) => crypto.createHash("sha256").update(s, "utf8").digest("hex").slice(0, 16);

const showcase = JSON.parse(fs.readFileSync(path.join(ROOT, "tools/examples/showcase.spec.json"), "utf8"));
const work = fs.mkdtempSync(path.join(os.tmpdir(), "cs-golden-"));
const specFile = path.join(work, "spec.json");
fs.writeFileSync(specFile, JSON.stringify(showcase));
const studioFile = buildStudioPage({ specFile, brandFile: path.join(ROOT, "tests/fixtures/brand.eg.creator.json"), outFile: path.join(work, "studio.html") });
if (showcase.ext?.archetypeSamples) showcase.slides = Object.values(showcase.ext.archetypeSamples); // layout catalogue, separate from the publishable 10-slide example
const browser = await launchChromium({});
const studio = await openStudio({ browser, studioFile });

const result = { schemaVersion: 1, engine: null, presets: {} };
try {
  const raw = await studio.page.evaluate(async (showcase) => {
    const brand = JSON.parse(document.getElementById("cs-brand").textContent);
    if (brand.visual) { delete brand.visual.palette; delete brand.visual.fonts; }
    const out = { engine: CS.version, presets: {} };
    for (const p of CS.core.registry.listPresets()) {
      const spec = JSON.parse(JSON.stringify(showcase));
      spec.style.presetId = p.id + "@" + p.version;
      const post = CS.core.resolve.post(spec, brand);
      const slides = {};
      spec.slides.forEach((s) => {
        const el = CS.core.compose.slide(spec, s, CS.core.resolve.slide(post, s), brand, { mode: "export" });
        slides[s.type] = el.outerHTML;
      });
      out.presets[p.id] = { tokens: post.hash || JSON.stringify(post.roles) + JSON.stringify(post.type), slides };
    }
    return out;
  }, showcase);
  result.engine = raw.engine;
  for (const [id, p] of Object.entries(raw.presets)) {
    result.presets[id] = { tokens: sha(String(p.tokens)), slides: Object.fromEntries(Object.entries(p.slides).map(([type, html]) => [type, sha(html)])) };
  }
  if (studio.errors.length) throw new Error("page errors: " + studio.errors.slice(0, 3).join(" | "));
} finally {
  await studio.close(); await browser.close();
  fs.rmSync(work, { recursive: true, force: true });
}

const text = JSON.stringify(result, null, 1) + "\n";
if (update) {
  fs.writeFileSync(MANIFEST, text, "utf8");
  console.log(`wrote ${path.relative(ROOT, MANIFEST)}: ${Object.keys(result.presets).length} presets x ${Object.keys(Object.values(result.presets)[0].slides).length} archetypes`);
  process.exit(0);
}
if (!fs.existsSync(MANIFEST)) { console.error("tests/golden/manifest.json is missing; run with --update to create it"); process.exit(1); }
const want = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
let bad = 0;
for (const id of new Set([...Object.keys(want.presets), ...Object.keys(result.presets)])) {
  const a = want.presets[id], b = result.presets[id], before = bad;
  if (!a || !b) { bad++; console.log(`FAIL ${id}: ${a ? "no longer shipped" : "not in the manifest"}`); continue; }
  if (a.tokens !== b.tokens) { bad++; console.log(`FAIL ${id}: the resolved tokens changed`); }
  for (const type of new Set([...Object.keys(a.slides), ...Object.keys(b.slides)])) {
    if (a.slides[type] !== b.slides[type]) { bad++; console.log(`FAIL ${id} ${type}: the composed markup changed`); }
  }
  if (bad === before) console.log(`ok   ${id.padEnd(10)} tokens and ${Object.keys(b.slides).length} archetypes unchanged`);
}
if (bad) console.error(`\n${bad} difference(s). If the change is intended, run: node tests/golden/run.mjs --update`);
process.exit(bad ? 1 : 0);
