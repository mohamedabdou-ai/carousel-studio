#!/usr/bin/env node
// tests/corpus-bad/rendered.mjs · the Chromium half of the defect and clean corpora (round 3, package Q7a; spec 7.6, build plan r2 3.2 and 1.1 row 10).
//
//   node tests/corpus-bad/rendered.mjs [--only ID] [--list] [--png DIR] [--floor]
//   (node tests/corpus-bad/run.mjs runs this after its text part; pass --text-only there to skip the browser)
//
// What it does, in one headless page that holds privately built cs-core, cs-qa, cs-art, cs-visual and cs-qa-visual (never runtime/), the preset
// sheets, the archetype sheet with primitives.css appended, the real fonts, rule data and icon data (the same blocks build_studio.py embeds). The fonts
// are those of both presets AND of every brand a rendered fixture names (build_studio.py wanted_fonts embeds the brand's fonts, and the resolver ignores a
// brand font that is not registered, so leaving them out would draw every deck in the preset's families and measure the wrong text):
//   1. corpus-clean/slice.json: each clean slice deck is rendered by the real engine from its stored plan and put through every text and rendered
//      gate. No BLOCK and no FIX at the shipped rollout; no BLOCK at stage 1 either (stage 1 promotes D9 and VA2 to FIX: the number of slides that
//      would trip is printed, not asserted); the resolved font families of every slide are the `fonts` of the deck and their faces loaded; two runs
//      agree on findings, counters, families and the normalized markup of every slide (labels, anchor geometry, generated SVG); every id of
//      `requireExecuted` ran at least once (a gate that never ran is a failure, not a pass).
//   2. corpus-bad/rendered.json, scope "rendered": the slide of a clean deck is rendered, the defect is planted into its anchor slot, and the gates
//      run on that slide at stage 1 (promoted severities) and at stage 0 (D9 and VA2 stay at NOTE). Each `expect` rule must be found with its
//      severity and must have executed; each `absent` rule must stay quiet; two runs agree as above. Scope "spec" cases are judged by run.mjs (text gates in a
//      vm). The case ids, the clean deck ids and the required gates are compared with the fixed lists of fixed.mjs, not with the lists of the JSON files.
//   3. --floor (report only): the 12 zero-override decks of tests/fixtures/auto, planned by V2 with the slice caps and rendered in creator and
//      poster; prints what the gates say about the AUTO floor. It never fails.
// --png DIR writes one PNG per planted case and one contact sheet per clean deck. Exit 0 = pass, 1 = a miss, a false finding, a gate that never ran.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { launchChromium } from "../../plugins/carousel-studio/skills/carousel-design/scripts/cover_video.mjs";
import { checkCorpusShape } from "./fixed.mjs";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SK = path.join(ROOT, "plugins/carousel-studio/skills/carousel-design");
const MODULES = ["core", "qa", "art", "visual", "qa-visual"];
const PRESETS = ["creator", "poster"];
const BLOCKS = { "cs-icon-pack": "icons/pack.json", "cs-icon-index": "icons/index.json", "cs-icon-concepts": "icons/concepts.json", "cs-icon-objects": "icons/objects.json",
  "cs-icon-stem": "icons/stem.json", "cs-emoji-map": "icons/emoji-map.json", "cs-art-marks": "art/marks.json", "cs-art-direction": "art-direction.json" };
const read = (p) => fs.readFileSync(p, "utf8");
export const readJson = (p) => JSON.parse(read(p).replace(/^﻿/, ""));
const safeJson = (v) => JSON.stringify(v).replace(/<\//g, "<\\/").replace(/<!--/g, "<\\u0021--").replace(/[\u2028\u2029]/g, (c) => "\\u" + c.charCodeAt(0).toString(16));

/** A corpus base: "name.json" is a file of tests/fixtures, a path with a slash is relative to the repository, "#n" picks element n of an array file. */
export function resolveRef(ref) {
  const [file, index] = String(ref).split("#");
  const doc = readJson(file.includes("/") ? path.join(ROOT, file) : path.join(ROOT, "tests/fixtures", file));
  return index === undefined ? doc : doc[Number(index)];
}
export const loadSlice = () => readJson(path.join(ROOT, "tests/corpus-clean/slice.json"));
export const loadRenderedCases = () => readJson(path.join(ROOT, "tests/corpus-bad/rendered.json"));

/* ---- the fonts --------------------------------------------------------------------------------------------------------------------- */
const ROLES = ["display", "heading", "body", "latin"];

/**
 * Every font id the page must carry, in a fixed order: the fonts of both presets, then the display, body and latin fonts of the brand of every deck that is
 * rendered (clean slice decks, and the zero-override decks when `floor` is set), then every `*.family` override of a rendered spec or patch. The resolver
 * ignores a brand font that is not registered (resolve.js applyBrand), while build_studio.py embeds the fonts of the brand (wanted_fonts): a page with the
 * preset fonts alone draws, and measures, a different deck than the Studio does. An id that the registry does not hold is an error, not a skip.
 */
export function neededFontIds({ floor = false } = {}) {
  const reg = readJson(path.join(SK, "fonts/registry.json")), known = new Set(reg.families.map((f) => f.id)), ids = [];
  const add = (id, from) => {
    if (typeof id !== "string" || !id) return;
    if (!known.has(id)) throw new Error(`the font "${id}" (${from}) is not in fonts/registry.json`);
    if (!ids.includes(id)) ids.push(id);
  };
  const family = (o, from) => { for (const [k, v] of Object.entries(o)) if (/\.family$/.test(k)) add(v, from); };
  const scan = (n, from) => {                                  // a style or slide `overrides` object, or a patch operation that sets one
    if (Array.isArray(n)) return n.forEach((x) => scan(x, from));
    if (!n || typeof n !== "object") return;
    if (typeof n.path === "string" && /\.family$/.test(n.path)) add(n.value, from);
    if (typeof n.path === "string" && /\/overrides$/.test(n.path) && n.value && typeof n.value === "object") family(n.value, from);
    for (const [k, v] of Object.entries(n)) { if (k === "overrides" && v && typeof v === "object") family(v, from); scan(v, from); }
  };
  for (const id of PRESETS) for (const role of ROLES) add(readJson(path.join(SK, "styles", id, "preset.json")).type?.[role]?.family, `preset ${id}`);
  const brand = (ref, from) => { if (ref) { const f = readJson(path.join(ROOT, ref)).visual?.fonts || {}; for (const k of ["display", "body", "latin"]) add(f[k], `brand ${ref} (${from})`); } };
  for (const d of loadSlice().decks) { brand(d.brand, d.id); scan(resolveRef(d.base), d.id); scan(d.patch, d.id); }
  for (const c of loadRenderedCases().cases) if (c.scope === "rendered") scan(c.patch || [], c.id);
  if (floor) {
    const man = readJson(path.join(ROOT, "tests/fixtures/auto/manifest.json"));
    for (const d of man.decks) { brand(d.brand, d.id); scan(readJson(path.join(ROOT, "tests/fixtures/auto", d.file))[d.index], d.id); }
  }
  return ids;
}

/* ---- the page ---------------------------------------------------------------------------------------------------------------------- */
function pageHtml(opts) {
  const reg = readJson(path.join(SK, "fonts/registry.json")), cov = readJson(path.join(SK, "fonts/coverage.json"));
  const presets = PRESETS.map((id) => ({ preset: readJson(path.join(SK, "styles", id, "preset.json")), css: read(path.join(SK, "styles", id, "decor.css")) }));
  const byId = Object.fromEntries(reg.families.map((f) => [f.id, f])), ids = neededFontIds(opts);
  const faces = ids.flatMap((i) => byId[i].files.map((f) => {
    const w = Array.isArray(f.wght) ? f.wght.join(" ") : f.wght;
    return `@font-face{font-family:"${byId[i].family}";font-style:${f.style || "normal"};font-weight:${w};font-display:block;src:url(data:font/woff2;base64,${fs.readFileSync(path.join(SK, "fonts", f.file)).toString("base64")}) format("woff2")}`;
  })).join("\n");
  const fontsMeta = { registry: { ...reg, families: ids.map((i) => byId[i]) }, coverage: { ...cov, families: Object.fromEntries(ids.filter((i) => cov.families?.[i]).map((i) => [i, cov.families[i]])) } };
  const data = (f) => readJson(path.join(SK, "data", f));
  const rules = { qaRules: data("qa-rules.json"), copy: data("rules/copy.json"), ortho: data("rules/ortho.json"),
    dialects: Object.fromEntries(["eg", "gulf", "levant", "msa-white", "en"].map((d) => [d, data(`dialects/${d}.json`)])), platform: data("platform-instagram.json"), locale: data("locale-defaults.json"), postingGuide: null };
  // build_studio.py appends templates/primitives.css to the end of #cs-archetype-css
  const prim = read(path.join(SK, "templates/primitives.css")).replace(/^﻿/, "").trim() + "\n";
  const archetypes = read(path.join(SK, "templates/archetypes.html")).replace(/(<style id="cs-archetype-css"[^>]*>)([\s\S]*?)(<\/style>)/, (m, a, b, c) => a + b + (b.endsWith("\n") ? "" : "\n") + prim + c);
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><style id="cs-fonts">body{margin:0}${faces}</style>
${presets.map((p) => `<style data-cs-decor="${p.preset.id}">${p.css}</style>`).join("\n")}
<script type="application/json" id="cs-presets">${safeJson(presets.map((p) => p.preset))}</script>
<script type="application/json" id="cs-rules">${safeJson(rules)}</script>
<script type="application/json" id="cs-fonts-meta">${safeJson(fontsMeta)}</script>
${Object.entries(BLOCKS).map(([id, f]) => `<script type="application/json" id="${id}">${safeJson(data(f))}</script>`).join("\n")}
${archetypes}</head><body><main id="stage"></main></body></html>`;
}

/** Opens the page. `close()` removes the private build. `floor` also embeds the fonts of the brands of the zero-override decks. */
export async function openPage(opts = {}) {
  const work = fs.mkdtempSync(path.join(process.env.CS_TMP || os.tmpdir(), "cs-q7a-"));
  const browser = await launchChromium();
  const close = async () => { await browser.close(); fs.rmSync(work, { recursive: true, force: true }); };
  try {
    for (const m of MODULES) execFileSync(process.execPath, [path.join(ROOT, "tools/build.mjs"), "--module", m, "--out", work], { stdio: "pipe", windowsHide: true });
    const page = await browser.newPage({ viewport: { width: 1200, height: 1500 }, deviceScaleFactor: 1 });
    await page.route("**/*", (r) => r.abort().catch(() => {}));            // no network, ever
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.setContent(pageHtml(opts));
    for (const m of MODULES) await page.addScriptTag({ content: read(path.join(work, `cs-${m}.js`)) });
    await page.evaluate(() => {
      CS.core.registry.loadPage(document);
      CS.qav.flush();
      window.__rules = structuredClone(CS.core.registry.rules());
      window.__q7a = {
        /**
         * Renders spec (with its stored plan) and returns { findings, stats, fonts, unloaded, fontWarnings, markup }; plant = { mode: replace|append, into?, html, slide } is
         * put into the slide after render. `fonts` holds the registry id each slide resolved for every font role, `unloaded` the resolved families that have no loaded
         * face, `fontWarnings` the slides whose fit report says that fonts could not be loaded, `markup` the serialized markup of every slide (plant included), by slide id.
         */
        async run({ spec, brand, slides, stage, plant }) {
          const rules = structuredClone(window.__rules);
          if (stage != null) rules.platform.plugin.visual.rollout.stage = stage;
          CS.core.registry.registerRules(rules);
          const host = document.getElementById("stage"); host.textContent = "";
          const deck = await CS.core.render.deck(spec, brand, { stage: host });
          await document.fonts.ready;
          if (plant) {
            const el = deck.slides.find((s) => s.id === plant.slide).el;
            const target = el.querySelector(plant.into || '[data-slot="anchor"]') || el.querySelector(".cs-content");
            if (plant.mode === "append") target.insertAdjacentHTML("beforeend", plant.html); else target.innerHTML = plant.html;
          }
          const opts = slides ? { slides } : {};
          const text = CS.qa.runText({ spec, brand }, opts), rendered = await CS.qa.runRendered({ spec, deck }, opts);
          const gates = {};
          for (const r of [text, rendered]) for (const [k, v] of Object.entries(r.stats.gates)) gates[k] = (gates[k] || 0) + v;
          const roles = ["display", "heading", "body", "latin"];
          const fonts = deck.slides.map((s) => Object.assign({ slide: s.id }, ...roles.map((r) => ({ [r]: s.tokens.type[r].family }))));
          const used = [...new Set(deck.slides.flatMap((s) => roles.map((r) => s.tokens.type[r].cssFamily)))];
          const loaded = new Set([...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family.replace(/^["']|["']$/g, "")));
          const fontWarnings = deck.slides.filter((s) => ((s.fit && s.fit.warnings) || []).some((w) => /Fonts could not be loaded/.test((w && w.en) || ""))).length;
          const markup = Object.fromEntries(deck.slides.map((s) => [s.id, s.el.outerHTML]));
          const slim = (f) => ({ rule: f.rule, sev: f.sev, slide: f.slide || null, el: f.el || null, prospect: f.prospect == null ? null : f.prospect, msg: f.msg && f.msg.en });
          return { findings: Array.from(text).concat(Array.from(rendered)).filter((f) => !f.overridden).map(slim), stats: gates, fonts, unloaded: used.filter((f) => !loaded.has(f)), fontWarnings, markup };
        },
        patch: (base, ops) => CS.core.patch.apply(base, ops),
        /** The V2 plan merged into a copy of the spec the way plan.mjs --save-plan stores it. */
        plan(spec, brand, presetId) {
          const s = structuredClone(spec); s.style = Object.assign({}, s.style, { presetId: presetId + "@1.0" });
          const plan = CS.visual.plan(s, brand, CS.core.registry.getPreset(presetId), null);
          const by = Object.fromEntries(plan.slides.map((p) => [p.id, p]));
          for (const sl of s.slides) { const p = by[sl.id]; if (p) { sl.visual = p.visual; if (p.variant && !sl.variant) sl.variant = p.variant; } }
          Object.assign(s.style, plan.style);
          return s;
        }
      };
    });
    await page.evaluate(() => document.fonts.ready);
    return { page, browser, errors, work, close };
  } catch (e) { await close(); throw e; }
}

/** One 300 px contact sheet of every slide on the page. */
async function sheet(browser, page, file) {
  const n = await page.locator(".cs-slide").count(), shots = [];
  for (let i = 0; i < n; i++) shots.push((await page.locator(".cs-slide").nth(i).screenshot()).toString("base64"));
  const mp = await browser.newPage({ viewport: { width: 1800, height: 400 } }), cols = Math.min(n, 9), cell = 300;
  await mp.setContent(`<body style="margin:0;background:#888;display:grid;grid-template-columns:repeat(${cols},${cell}px);gap:4px">${shots.map((s) => `<img style="width:${cell}px" src="data:image/png;base64,${s}">`).join("")}</body>`);
  await mp.setViewportSize({ width: cols * (cell + 4), height: Math.ceil(n / cols) * (cell * 4 / 3 + 4) });
  await mp.screenshot({ path: file, fullPage: true });
  await mp.close();
}

/** Where two runs of the same input part ways: findings, counters, resolved families, then the markup of each slide; "" when they agree. */
function diffRuns(a, b) {
  for (const k of ["findings", "stats", "fonts", "unloaded", "fontWarnings"]) if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) return `${k} differ`;
  const ids = Object.keys(a.markup);
  if (!ids.length) return "no slide was rendered";
  if (JSON.stringify(ids) !== JSON.stringify(Object.keys(b.markup))) return "the rendered slides differ";
  for (const id of ids) {
    const x = a.markup[id], y = b.markup[id];
    if (!x) return `slide ${id} has no markup`;
    if (x === y) continue;
    let i = 0;
    while (i < x.length && x[i] === y[i]) i++;
    return `the markup of ${id} differs at offset ${i}: ${JSON.stringify(x.slice(Math.max(0, i - 50), i + 70))} against ${JSON.stringify(y.slice(Math.max(0, i - 50), i + 70))}`;
  }
  return "";
}

/** The families a run resolved on every slide against the `fonts` of the deck in slice.json, and whether their faces loaded. */
function fontProblems(tag, deck, r) {
  const out = [], want = ROLES.map((k) => deck.fonts?.[k]), name = (v) => v.join("/");
  for (const f of r.fonts) if (JSON.stringify(ROLES.map((k) => f[k])) !== JSON.stringify(want)) out.push(`FONTS ${tag}: slide ${f.slide} resolved ${name(ROLES.map((k) => f[k]))} (${ROLES.join("/")}) but slice.json expects ${name(want)}`);
  if (r.unloaded.length) out.push(`FONTS ${tag}: no loaded face for ${r.unloaded.join(", ")}`);
  if (r.fontWarnings) out.push(`FONTS ${tag}: the fit report of ${r.fontWarnings} slide(s) says fonts could not be loaded`);
  return out;
}

const isSev = (f, ...s) => s.includes(f.sev);
const label = (f) => `${f.rule}${f.slide ? "@" + f.slide : ""}`;
const sum = (into, add) => { for (const [k, v] of Object.entries(add)) into[k] = (into[k] || 0) + v; return into; };

/** The whole rendered corpus. Returns { problems, lines, executed } and never throws for a corpus failure. */
export async function runRenderedCorpus({ only = null, png = null, floor = false, shape = true } = {}) {
  const problems = [], lines = [], executed = {};
  const slice = loadSlice(), rendered = loadRenderedCases();
  if (shape) problems.push(...checkCorpusShape(rendered, slice));   // run.mjs checks this itself and passes shape: false
  const { page, browser, errors, close } = await openPage({ floor });
  try {
    if (png) fs.mkdirSync(png, { recursive: true });
    const brandOf = (d) => (d.brand ? readJson(path.join(ROOT, d.brand)) : null);
    const specOf = async (d, extra = []) => page.evaluate(({ base, patch }) => __q7a.patch(base, patch), { base: resolveRef(d.base), patch: [...d.patch, ...extra] });

    /* ---- 1. the clean slice decks -------------------------------------------------------------------------------------------------- */
    for (const d of slice.decks) {
      if (only && d.id !== only) continue;
      const spec = await specOf(d), brand = brandOf(d);
      const a = await page.evaluate((x) => __q7a.run(x), { spec, brand });
      const b = await page.evaluate((x) => __q7a.run(x), { spec, brand });
      const apart = diffRuns(a, b);
      if (apart) problems.push(`${d.id}: two runs differ, ${apart} (the engine or a gate is not deterministic)`);
      problems.push(...fontProblems(d.id, d, a));
      for (const f of a.findings) if (isSev(f, "BLOCK", "FIX")) problems.push(`FALSE ${f.sev} ${d.id}: ${label(f)} ${f.msg || ""}`.trim());
      const one = await page.evaluate((x) => __q7a.run(x), { spec, brand, stage: 1 });
      for (const f of one.findings) if (isSev(f, "BLOCK")) problems.push(`FALSE BLOCK at stage 1 ${d.id}: ${label(f)}`);
      const would = new Set(one.findings.filter((f) => f.sev === "FIX" && /^D9\.|^VA2\./.test(f.rule)).map((f) => f.slide)).size;
      sum(executed, a.stats);
      lines.push(`clean ${d.id}: ${spec.slides.length} slides, ${a.findings.length} findings (${a.findings.filter((f) => f.sev === "NOTE").length} notes), ${would} slide(s) would trip a D9 or VA2 FIX at stage 1`);
      if (png) { await page.evaluate((x) => __q7a.run(x), { spec, brand }); await sheet(browser, page, path.join(png, `clean-${d.id}.png`)); }
    }

    /* ---- 2. the planted rendered defects ------------------------------------------------------------------------------------------- */
    const planted = rendered.cases.filter((c) => c.scope === "rendered");
    for (const c of planted) {
      if (only && c.id !== only) continue;
      const deck = slice.decks.find((x) => x.id === c.deck);
      if (!deck) { problems.push(`${c.id}: deck ${c.deck} is not in corpus-clean/slice.json`); continue; }
      const spec = await specOf(deck, c.patch || []), brand = brandOf(deck), plant = { ...c.plant, html: [].concat(c.plant.html).join(""), slide: c.slide };
      const run = (stage) => page.evaluate((x) => __q7a.run(x), { spec, brand, stage, slides: [c.slide], plant });
      const s1 = await run(1), again = await run(1), s0 = await run(0);
      const apart = diffRuns(s1, again);
      if (apart) problems.push(`${c.id}: two runs differ, ${apart}`);
      problems.push(...fontProblems(c.id, deck, s1));
      const mine = (r) => r.findings.filter((f) => f.slide === c.slide);
      for (const want of c.expect) {
        const hit = mine(s1).find((f) => f.rule === want.rule && f.sev === want.sev);
        if (!hit) problems.push(`MISSED ${c.id}: expected ${want.sev} ${want.rule}@${c.slide}, got ${mine(s1).map((f) => f.sev[0] + ":" + f.rule).join(", ") || "nothing"}`);
        if (!(s1.stats[want.rule] > 0)) problems.push(`NOT EXECUTED ${c.id}: ${want.rule} ran ${s1.stats[want.rule] || 0} times`);
      }
      for (const id of c.absent || []) if (mine(s1).some((f) => f.rule === id)) problems.push(`FALSE ${c.id}: ${id} fired but must stay quiet for this defect`);
      for (const f of mine(s0)) if (/^D9\.|^VA2\./.test(f.rule) && f.sev !== "NOTE") problems.push(`${c.id}: ${label(f)} is ${f.sev} at rollout stage 0 (D9 and VA2 stay at NOTE until stage 1)`);
      for (const f of mine(s1)) if (f.sev === "BLOCK" && /^(D9|D10)\./.test(f.rule)) problems.push(`${c.id}: unexpected BLOCK ${label(f)} (the BLOCK switches of D9 and D10 ship off)`);
      lines.push(`planted ${c.id}: ${c.expect.map((w) => w.sev + " " + w.rule).join(", ")} found; ${mine(s1).length} finding(s) on ${c.slide}`);
      if (png) await page.locator(`.cs-slide[data-cs-slide="${c.slide}"]`).screenshot({ path: path.join(png, `${c.id}.png`) });
    }

    /* ---- 3. every gate the card names ran at least once ---------------------------------------------------------------------------- */
    if (!only) {
      for (const id of slice.requireExecuted) if (!(executed[id] > 0)) problems.push(`gate ${id} was executed 0 times over the clean slice decks`);
    }

    /* ---- 4. the AUTO floor, report only -------------------------------------------------------------------------------------------- */
    if (floor) {
      const man = readJson(path.join(ROOT, "tests/fixtures/auto/manifest.json"));
      for (const d of man.decks) for (const preset of PRESETS) {
        const base = readJson(path.join(ROOT, "tests/fixtures/auto", d.file))[d.index], brand = d.brand ? readJson(path.join(ROOT, d.brand)) : null;
        const spec = await page.evaluate((x) => __q7a.plan(x.base, x.brand, x.preset), { base, brand, preset });
        const r = await page.evaluate((x) => __q7a.run(x), { spec, brand });
        const bad = r.findings.filter((f) => isSev(f, "BLOCK", "FIX"));
        lines.push(`floor ${d.id} ${preset}: ${bad.length ? [...new Set(bad.map(label))].join(" ") : "no BLOCK or FIX"}`);
      }
    }
    if (errors.length) problems.push(`page errors: ${errors.slice(0, 3).join(" | ")}`);
  } finally { await close(); }
  return { problems, lines, executed };
}

async function main(argv) {
  const opt = (n) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : null);
  if (argv.includes("--list")) {
    const r = loadRenderedCases(), s = loadSlice();
    console.log(`${r.cases.filter((c) => c.scope === "rendered").length} rendered defects (${r.cases.length} planted in all), ${s.decks.length} clean slice decks`);
    return 0;
  }
  const { problems, lines } = await runRenderedCorpus({ only: opt("--only"), png: opt("--png"), floor: argv.includes("--floor") });
  for (const l of lines) console.log(l);
  for (const p of problems) console.error(p);
  console.log(`corpus rendered (chromium): ${problems.length ? problems.length + " problem(s)" : "every planted defect found, every clean deck clean, every required gate executed"}`);
  return problems.length ? 1 : 0;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2)).then((c) => process.exit(c), (e) => { console.error(e.stack || e); process.exit(1); });
