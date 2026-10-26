// tests/corpus-bad/fixed.mjs · what the corpora MUST contain, held in code and not in the corpus files (round 3, package Q7a; review round 1, finding 2).
//
// rendered.json lists its own `ids` and holds its own cases, and slice.json holds its own decks: a list checked against the file it came from cannot
// notice a case that was deleted from both. The eight planted visual defects (spec 7.6), the four clean slice decks and the gates the slice must run
// are therefore written out here, and run.mjs, rendered.mjs and run.py (which keeps a literal copy, checked against this file) compare the corpus with them.
// Taking a case, a deck or a gate out is a deliberate edit of this file and of run.py, never a side effect of editing a JSON file.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SK = path.join(ROOT, "plugins/carousel-studio/skills/carousel-design");
const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8").replace(/^﻿/, ""));

/** The eight planted defects: the scope that judges each, and the finding that names it (rule and severity at rollout stage 1). */
export const FIXED_CASES = {
  "R1.empty-card": { scope: "rendered", rule: "D9.container-fill", sev: "FIX" },
  "R2.lone-icon-panel": { scope: "rendered", rule: "D9.container-fill", sev: "FIX" },
  "R3.nested-frames": { scope: "rendered", rule: "D10.nesting", sev: "FIX" },
  "R4.icon-tile-stack": { scope: "rendered", rule: "D10.icon-tile-stack", sev: "FIX" },
  "R5.six-row-list": { scope: "spec", rule: "VA3.valid", sev: "FIX" },
  "R6.under-floor-label": { scope: "rendered", rule: "D10.art-label", sev: "FIX" },
  "R7.chart-without-source": { scope: "spec", rule: "VA4.chart-honesty", sev: "BLOCK" },
  "R8.one-sided-chat": { scope: "rendered", rule: "D9.rect", sev: "FIX" }
};
export const FIXED_IDS = Object.keys(FIXED_CASES);
/** The four clean slice decks (two presets, two dialects). */
export const FIXED_DECKS = ["eg2-creator", "eg4-poster", "en1-creator", "en1-poster"];
/** The gates of build plan r2 3.1: slice.json may name more in `requireExecuted`, never fewer. */
export const FIXED_GATES = ["D9.band", "D9.rect", "D9.fill", "D9.container-fill", "VA1.anchor-present", "VA2.anchor-size", "VA3.valid", "VA4.chart-honesty", "VA6.pause",
  "VA7.agreement", "VA8.constraints", "D8.anchor-run", "D8.tone-run", "D10.nesting", "D10.icon-tile-stack", "D10.stroke-feed", "D10.art-label", "D10.glyph-icon",
  "C2.body-with-art", "C2.demo-words", "C2.demo-missing", "C2.demo-duplicate", "C2.figure-repeat"];

const SEVS = ["BLOCK", "FIX", "NOTE"], ROLES = ["display", "heading", "body", "latin"], PRESETS = ["creator", "poster"];
const dupes = (list) => list.filter((x, i) => list.indexOf(x) !== i);

/**
 * The registry id of each font role that the Studio resolves for a clean deck: the preset's own fonts, and, when the preset binds the `fonts` role,
 * the fonts of the deck's brand that the registry holds (display also sets heading). It mirrors resolve.js applyBrand and build_studio.py wanted_fonts,
 * which embeds the brand's fonts; it exists to check the hand-written `fonts` of slice.json against the files.
 */
export function expectedFonts(deck) {
  const preset = readJson(path.join(SK, "styles", deck.preset, "preset.json")), reg = new Set(readJson(path.join(SK, "fonts/registry.json")).families.map((f) => f.id));
  const out = Object.fromEntries(ROLES.map((r) => [r, preset.type?.[r]?.family]));
  const f = deck.brand ? readJson(path.join(ROOT, deck.brand)).visual?.fonts || {} : {};
  if ((preset.brandBindings || []).includes("fonts")) {
    if (f.display && reg.has(f.display)) out.display = out.heading = f.display;
    if (f.body && reg.has(f.body)) out.body = f.body;
    if (f.latin && reg.has(f.latin)) out.latin = f.latin;
  }
  return out;
}

/** Problems of the corpus files against the fixed lists, as strings; [] when the corpus is what the card says it is. */
export function checkCorpusShape(rendered, slice) {
  const p = [], cases = Array.isArray(rendered?.cases) ? rendered.cases : [], decks = Array.isArray(slice?.decks) ? slice.decks : [];
  if (new Set(FIXED_IDS).size !== 8) p.push("fixed.mjs does not hold eight distinct planted defects");

  /* ---- the eight planted defects ---------------------------------------------------------------------------------------------------- */
  const have = cases.map((c) => c && c.id);
  for (const id of dupes(have)) p.push(`rendered.json holds the case ${id} twice`);
  for (const id of FIXED_IDS) if (!have.includes(id)) p.push(`rendered.json has no case ${id} (the eight planted defects are a fixed list, see fixed.mjs)`);
  for (const id of have) if (!FIXED_IDS.includes(id)) p.push(`rendered.json holds ${id}, which is not one of the eight planted defects of fixed.mjs`);
  if (JSON.stringify(rendered?.ids) !== JSON.stringify(FIXED_IDS)) p.push(`rendered.json lists ids ${[].concat(rendered?.ids ?? []).join(",")} but the fixed list is ${FIXED_IDS.join(",")}`);
  for (const c of cases) {
    const fixed = FIXED_CASES[c && c.id];
    if (!fixed) continue;
    const at = (msg) => p.push(`${c.id}: ${msg}`);
    if (!["rendered", "spec"].includes(c.scope)) at(`scope "${c.scope}" is neither rendered nor spec`);
    else if (c.scope !== fixed.scope) at(`scope is "${c.scope}", the fixed list says "${fixed.scope}"`);
    if (!FIXED_DECKS.includes(c.deck)) at(`deck "${c.deck}" is not one of the four clean slice decks`);
    else if (!decks.some((d) => d.id === c.deck)) at(`deck ${c.deck} is not in corpus-clean/slice.json`);
    if (!/^s\d{2}$/.test(c.slide || "")) at(`slide "${c.slide}" is not a slide id`);
    const expect = Array.isArray(c.expect) ? c.expect : [];
    if (!expect.length) at("expect is empty (a planted defect must name the finding that proves it)");
    for (const w of expect) if (!w || typeof w.rule !== "string" || !w.rule || !SEVS.includes(w.sev)) at(`an expect entry needs a rule and a severity (${SEVS.join(", ")}): ${JSON.stringify(w)}`);
    if (!expect.some((w) => w && w.rule === fixed.rule && w.sev === fixed.sev)) at(`expect must still name ${fixed.sev} ${fixed.rule}`);
    if (c.absent !== undefined && !(Array.isArray(c.absent) && c.absent.every((x) => typeof x === "string" && x))) at("absent must be a list of rule ids");
    if (c.scope === "rendered") {
      const html = c.plant && [].concat(c.plant.html ?? []).join("");
      if (!html || !html.trim()) at("a rendered case needs plant.html");
      if (!c.plant || !["replace", "append"].includes(c.plant.mode)) at('plant.mode must be "replace" or "append"');
      if (c.plant && c.plant.mode === "append" && !(typeof c.plant.into === "string" && c.plant.into)) at("an appended plant needs plant.into");
    } else if (c.scope === "spec" && !(Array.isArray(c.patch) && c.patch.length)) at("a spec case needs a non-empty patch");
  }

  /* ---- the four clean slice decks and the gates they must run ----------------------------------------------------------------------- */
  const deckIds = decks.map((d) => d && d.id);
  for (const id of dupes(deckIds)) p.push(`slice.json holds the deck ${id} twice`);
  for (const id of FIXED_DECKS) if (!deckIds.includes(id)) p.push(`slice.json has no deck ${id} (the four clean slice decks are a fixed list, see fixed.mjs)`);
  for (const id of deckIds) if (!FIXED_DECKS.includes(id)) p.push(`slice.json holds ${id}, which is not one of the four clean slice decks of fixed.mjs`);
  for (const d of decks) {
    if (!d || !FIXED_DECKS.includes(d.id)) continue;
    const at = (msg) => p.push(`${d.id}: ${msg}`);
    if (!PRESETS.includes(d.preset)) { at(`preset "${d.preset}" is neither creator nor poster`); continue; }
    if (typeof d.base !== "string" || !d.base) at("base is missing");
    if (!(Array.isArray(d.patch) && d.patch.length)) at("patch is empty (a clean deck is a fixture plus its stored plan)");
    const want = expectedFonts(d), got = d.fonts;
    if (!got || typeof got !== "object") at("fonts is missing (the resolved families are asserted, see the description of slice.json)");
    else if (JSON.stringify(ROLES.map((r) => got[r])) !== JSON.stringify(ROLES.map((r) => want[r]))) at(`fonts ${JSON.stringify(got)} differ from what the preset and the brand give: ${JSON.stringify(want)}`);
  }
  const req = Array.isArray(slice?.requireExecuted) ? slice.requireExecuted : [];
  for (const id of dupes(req)) p.push(`requireExecuted names ${id} twice`);
  for (const id of FIXED_GATES) if (!req.includes(id)) p.push(`requireExecuted dropped the gate ${id} (the gates of build plan r2 3.1 are a fixed list, see fixed.mjs)`);
  return p;
}
