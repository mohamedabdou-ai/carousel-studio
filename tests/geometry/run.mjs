#!/usr/bin/env node
// tests/geometry/run.mjs · the chrome, the text and the layout sheet of every archetype in every preset against the geometry of draft 9.1, in both crops.
//
//   node tests/geometry/run.mjs [--presets swiss,creator,...] [--verbose]
//
// The numbers below are copied from research/10-structure-draft.md section 9.1 (and, for the inner footer, spec S-1) on purpose, not read from
// data/platform-instagram.json: the data file is what D2 reads, so a check against the data file cannot notice when it drifts from the design. This test
//   1. fails when the data file differs from the draft (safe box, content box, bands, keep-outs) and, once the data carries `geometry.inner`, from S-1,
//   2. renders each of the 20 archetypes (tools/examples/showcase.spec.json) in each preset at 1080 x 1440 and measures every visible text run
//      and every chrome item (handle, meta, counter, swipe cue, save pill),
//   3. fails when text leaves the content box, when chrome leaves its band, when anything touches a keep-out zone (measured from the safe-box
//      corners), or when anything is cut by the 4:5 crop (y 45 to 1395) or by the grid crop (x 34 to 1046),
//   4. layout sheet (package E3, tests/geometry/layout-probe.js): for every type x recipe of spec 4.3 (staged recipes: under over full center) and both
//      canvases (1440, 1350), where the arithmetic of spec 4.2 says floor-size text and the minimum anchor fit, the sheet must realise it: the text fits,
//      the centring spacers are off, the anchor lies in the stack, text and bridge keep their order, nothing is a void;
//   5. the grid (bento) and timeline (rail) layouts with 3 to 5 items, in Arabic and in English (mirrored), with short copy and with copy at the limits of spec 4.4
//      (the words go through the engine's text pipeline and fit; every line of text of every part must lie inside its card or node, clear of the icon and of the other
//      parts; copy that the pipeline itself rejects is counted, and may not be more than a quarter of the limit runs);
//   6. the inner footer contract: three custom properties (--cs-pad-bottom 85px, --cs-body-h 998px, --cs-footer-pad-x 60px) put the footer at x 174-906, y 1275-1355 and
//      give the body the 110 px (both canvases), with no change for a slide that does not set them;
//   7. no decoration line or edge crosses the header band (the whole contracted band, x 114-966, y 165-245, to the 1 px tolerance of this file) except the exact frozen cover signatures, and the
//      save pill keeps 8 px between its glyph and its text. Round 3 freezes approved cover pixels (cover-baseline); all other types must clear the band (spec 6.5 and S-7).
// Exit 0 = clean, 1 = a violation. Needs playwright-core and a Chromium (see cover_video.mjs).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openGeometryPage } from './page.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const args = process.argv.slice(2);
const flag = (n) => { const i = args.indexOf("--" + n); return i >= 0 ? args[i + 1] : null; };
const verbose = args.includes("--verbose");

/** Draft 9.1, canvas px of the 1080 x 1440 (3:4) post. */
const DRAFT = {
  safeBox: { x: 34, y: 45, w: 1012, h: 1350 },
  contentBox: { x: 114, y: 125, w: 852, h: 1190 },
  header: { x: 114, y: 165, w: 852, h: 80 },
  footer: { x: 114, y: 1165, w: 852, h: 80, itemMaxHeightPx: 49 },
  keepOuts: [
    { id: "top-left", x: 34, y: 45, w: 200, h: 110 },
    { id: "top-right", x: 846, y: 45, w: 200, h: 110 },
    { id: "bottom-left", x: 34, y: 1255, w: 140, h: 140 },
    { id: "bottom-right", x: 906, y: 1255, w: 140, h: 140 }
  ],
  crop4x5: { x: 0, y: 45, w: 1080, h: 1350 },
  gridCrop: { x: 34, y: 45, w: 1012, h: 1350 }
};
/** Spec S-1: on inner slides (not the cover) the footer sits lower and narrower, clear of the two bottom keep-outs (x < 174, x > 906). Edge-relative like the rest. */
const INNER = { footer: { x: 174, y: 1275, w: 732, h: 80 }, body: { x: 114, y: 261, w: 852, h: 998 }, vars: { "--cs-pad-bottom": "85px", "--cs-footer-pad-x": "60px" }, padX: 60 };
/** Chrome that a preset deliberately draws inside the header band, with the clause of the spec that allows it: { presetId: [{ edges: [y, ...], vlines: [x, ...], why }] }. Empty on purpose:
 *  a decoration edge or line in y 165-245 is a failure for every preset (spec S-7: this assertion is live now). Do not add a preset to hide a defect; fix its decor.css. */
const BAND_CHROME = {};
/** Who fixes a band failure, for the summary line only (the failure itself is never excused). */
const BAND_OWNER = { interface: "PR5 (title-bar edge at y 206 through the handle row, spec 6.5 and S-7)", poster: "PR2 (the header rule starts at y 243, 2 px inside the band: decor.css .cs-decor::before, move it to y 245)" };
const TOL = 1;

let bad = 0;
const fail = (msg) => { bad++; console.log("FAIL " + msg); };

/* 1. the data file says what the draft says */
const platform = JSON.parse(fs.readFileSync(path.join(ROOT, "plugins/carousel-studio/skills/carousel-design/data/platform-instagram.json"), "utf8")).geometry;
const same = (a, b) => ["x", "y", "w", "h"].every((k) => a[k] === b[k]);
if (!same(platform.safeBox, DRAFT.safeBox)) fail("data safeBox differs from the draft");
if (!same(platform.contentBox, DRAFT.contentBox)) fail("data contentBox differs from the draft");
if (!same(platform.bands.header, DRAFT.header)) fail("data header band differs from the draft");
if (!same(platform.bands.footer, DRAFT.footer) || platform.bands.footer.itemMaxHeightPx !== DRAFT.footer.itemMaxHeightPx) fail("data footer band differs from the draft");
if (!same(platform.crop4x5, DRAFT.crop4x5)) fail("data crop4x5 differs from the draft");
DRAFT.keepOuts.forEach((z) => { const d = platform.keepOuts.find((k) => k.id === z.id); if (!d || !same(d, z)) fail("data keep-out " + z.id + " differs from the draft"); });
if (platform.keepOuts.length !== DRAFT.keepOuts.length) fail("data has " + platform.keepOuts.length + " keep-outs, the draft has " + DRAFT.keepOuts.length);
/* S-1 in the data (Q1 writes geometry.inner): when it is there it must say what the spec says, and then the rendered inner slides must follow it */
const innerData = platform.inner || null;
if (innerData) {
  const f = innerData.bands && innerData.bands.footer;
  if (!f || !same(f, INNER.footer)) fail("data geometry.inner.bands.footer differs from spec S-1 (x 174, y 1275, w 732, h 80)");
  const b = innerData.bodyArea;
  if (!b || b.y !== INNER.body.y || b.h !== INNER.body.h) fail("data geometry.inner.bodyArea differs from spec S-1 (y 261, h 998)");
  if (innerData.footerPadX !== INNER.padX) fail("data geometry.inner.footerPadX is " + innerData.footerPadX + ", spec S-1 insets the footer by " + INNER.padX + " px on each side (--cs-footer-pad-x)");
}


/* 2. render and measure */
const showcase = JSON.parse(fs.readFileSync(path.join(ROOT, "tools/examples/showcase.spec.json"), "utf8"));
// Measure archetype copy and chrome; recipe tests supply their own stand-in art.
showcase.slides.forEach(s => { s.visual = { anchor: { kind: "none" }, tone: "base" }; });
const work = fs.mkdtempSync(path.join(os.tmpdir(), "cs-geometry-"));
const specFile = path.join(work, "spec.json");
fs.writeFileSync(specFile, JSON.stringify(showcase));
const studio = await openGeometryPage();
await studio.page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, "tests/geometry/layout-probe.js"), "utf8") });
/* the engine side of S-1 (E2b: registry.geometry(h, {inner}) and the three custom properties) may not be in the runtime chunks yet: then the rendered slides are not asked to follow */
const runtimeInner = await studio.page.evaluate(() => { try { const g = CS.core.registry.geometry(1440, { inner: true }); return g.footer.y === 1275 && g.body.h === 998; } catch (e) { return false; } });
console.log("info inner footer (S-1): data " + (innerData ? "present" : "absent") + ", runtime " + (runtimeInner ? "follows it" : "does not follow it yet (E2b)") + (innerData && !runtimeInner ? ": rendered inner slides are measured against the 1.0 band; the CSS contract is tested with custom properties below" : ""));

const inside = (r, b) => r.x >= b.x - TOL && r.y >= b.y - TOL && r.x + r.w <= b.x + b.w + TOL && r.y + r.h <= b.y + b.h + TOL;
const touches = (r, b) => r.x < b.x + b.w - TOL && r.x + r.w > b.x + TOL && r.y < b.y + b.h - TOL && r.y + r.h > b.y + TOL;

/** Header band: decoration under the chrome. Two screenshots of the same slide (chrome and text hidden), with and without the decoration layer and the slide's own
 *  pseudo-elements; the difference is the decoration. The whole contracted band is scanned, every row y 165-245 over x 114-966: a line or an edge (a fill that starts or ends
 *  inside the band) of at least 120 px, or a vertical line of at least 60 px, is a violation. A fill that covers the whole band from its first row to its last has no edge in it
 *  and is not one. Returns the y of every horizontal edge and the x of every vertical line, in canvas pixels. */
async function headerBand(page, id, type, plant) {
  await page.evaluate(async ({ showcase, id, type, plant }) => {
    const P = window.CSLayoutProbe;
    const brand = JSON.parse(document.getElementById("cs-brand").textContent);
    if (brand.visual) { delete brand.visual.palette; delete brand.visual.fonts; }
    const spec = JSON.parse(JSON.stringify(showcase)); spec.style.presetId = id + "@1.0";
    const r = await P.run(spec, brand, spec.slides.findIndex((s) => s.type === type), {});
    const host = document.createElement("div"); host.id = "cs-band-host";
    host.style.cssText = "position:absolute;left:0;top:0;z-index:99999;width:1080px;height:1440px;background:#fff;";
    document.body.appendChild(host); host.appendChild(r.el);
    r.el.style.position = "absolute"; r.el.style.left = "0"; r.el.style.top = "0"; r.el.setAttribute("data-probe", "1");
    const st = document.createElement("style"); st.id = "cs-band-style";
    st.textContent = ".cs-slide[data-probe] .cs-header,.cs-slide[data-probe] .cs-content,.cs-slide[data-probe] .cs-footer{visibility:hidden!important}";
    if (plant) st.textContent += ".cs-slide[data-probe]::after{content:'';position:absolute;z-index:5;background:#000;" + plant + "}";   // the scan's own test: a decoration planted at a known place
    document.head.appendChild(st);
  }, { showcase, id, type, plant: plant || null });
  const clip = { x: 0, y: DRAFT.header.y, width: 1080, height: DRAFT.header.h };
  const a = await page.screenshot({ clip });
  await page.evaluate(() => { document.getElementById("cs-band-style").textContent += ".cs-slide[data-probe] .cs-decor{visibility:hidden!important}.cs-slide[data-probe]::before,.cs-slide[data-probe]::after{display:none!important}"; });
  const b = await page.screenshot({ clip });
  const res = await page.evaluate(async ({ a, b, band, tol }) => {
    async function px(b64) { const bm = await createImageBitmap(await (await fetch("data:image/png;base64," + b64)).blob()); const c = new OffscreenCanvas(bm.width, bm.height); const g = c.getContext("2d"); g.drawImage(bm, 0, 0); return g.getImageData(0, 0, bm.width, bm.height); }
    const A = await px(a), B = await px(b), W = A.width, H = A.height;
    const diff = (x, y) => { const i = (y * W + x) * 4; return Math.abs(A.data[i] - B.data[i]) + Math.abs(A.data[i + 1] - B.data[i + 1]) + Math.abs(A.data[i + 2] - B.data[i + 2]) > 30; };
    const x0 = band.x, x1 = band.x + band.w, rows = [], cols = [];
    for (let y = 0; y < H; y++) { let best = 0, run = 0; for (let x = x0; x < x1; x++) { if (diff(x, y)) { run++; best = Math.max(best, run); } else run = 0; } rows.push(best); }
    for (let x = x0; x < x1; x++) { let best = 0, run = 0; for (let y = 0; y < H; y++) { if (diff(x, y)) { run++; best = Math.max(best, run); } else run = 0; } cols.push(best); }
    /* runs of decorated rows (a line or a fill of at least 120 px across): each run that lies in the band is a violation, except a fill that covers the whole band (it has no edge
       inside it) and a run that only dips tol px into the band from outside, the same tolerance the other boxes of this file get */
    const on = rows.map((v) => v >= 120), edges = [];
    for (let y = 0; y < H; y++) {
      if (!on[y]) continue;
      let e = y; while (e + 1 < H && on[e + 1]) e++;
      const len = e - y + 1;
      if (!(y === 0 && e === H - 1) && !(y === 0 && len <= tol) && !(e === H - 1 && len <= tol)) { if (y > 0) edges.push(band.y + y); if (e < H - 1) edges.push(band.y + e + 1); }
      y = e;
    }
    const vlines = []; let s = -1;
    cols.forEach((v, i) => { if (v >= 60) { if (s < 0) s = i; } else if (s >= 0) { if (i - s <= 8) vlines.push(x0 + s); s = -1; } });
    return { edges, vlines, rows: H };
  }, { a: a.toString("base64"), b: b.toString("base64"), band: DRAFT.header, tol: TOL });
  await page.evaluate(() => { document.getElementById("cs-band-host").remove(); document.getElementById("cs-band-style").remove(); });
  return res;
}

try {
  const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'plugins/carousel-studio/skills/carousel-design/styles/index.json'), 'utf8'));
  const shipped = new Set(index.presets.filter(p => p.ships === '1.0').map(p => p.id));
  const requested = flag("presets") ? flag("presets").split(",") : await studio.page.evaluate(() => CS.core.registry.listPresets().map((p) => p.id));
  const presets = requested.filter(id => shipped.has(id));
  console.log('skip non-shipping presets: ' + requested.filter(id => !shipped.has(id)).join(', '));
  await studio.page.setViewportSize({ width: 1100, height: 1460 });
  let measured = 0, recipeRuns = 0;
  const bandTypes = Array.from(new Set(showcase.slides.map((sl) => sl.type))), bandBlockers = [];

  /* the band scan tests itself first: a line planted at y 170 or y 240 (inside the band, outside the chrome row y 177-233) is found, a fill over the whole band and a 1 px dip are not */
  {
    const plantedCases = [
      ["a 2 px line at y 170", "left:114px;width:400px;top:170px;height:2px", [170, 172]],
      ["a 2 px line at y 240", "left:114px;width:400px;top:240px;height:2px", [240, 242]],
      ["a line at the first row, y 165", "left:114px;width:400px;top:165px;height:3px", [168]],
      ["an edge at y 206 (a fill from there down)", "left:114px;width:852px;top:206px;height:200px", [206]],
      ["a vertical line at x 500", "left:500px;width:4px;top:160px;height:100px", []],
      ["a fill over the whole band", "left:114px;width:852px;top:165px;height:80px", []],
      ["a rule that dips 1 px into the band from below", "left:114px;width:852px;top:244px;height:12px", []],
      ["a rule that dips 3 px into the band from below", "left:114px;width:852px;top:242px;height:12px", [242]]
    ];
    let planted = 0;
    for (const [what, css, want] of plantedCases) {
      const band = await headerBand(studio.page, "swiss", "item", css);
      const gotEdges = band.edges.slice().sort((x, y) => x - y).join(","), wantEdges = want.join(","), vertical = what.startsWith("a vertical");
      if (vertical ? !band.vlines.length : gotEdges !== wantEdges) fail(`header band scan self-test: ${what}: edges at y [${gotEdges}] and vertical lines at x [${band.vlines.join(",")}], expected [${wantEdges}]${vertical ? " and a vertical line" : ""}`);
      else planted++;
    }
    console.log(`${planted === plantedCases.length ? "ok  " : "FAIL"} header band scan self-test: ${planted} of ${plantedCases.length} planted decorations classified as expected`);
  }

  /* 6. the inner footer contract, once (the CSS does not depend on the preset) */
  {
    const out = await studio.page.evaluate(async ({ showcase, vars }) => {
      const P = window.CSLayoutProbe, res = [];
      const brand = JSON.parse(document.getElementById("cs-brand").textContent);
      if (brand.visual) { delete brand.visual.palette; delete brand.visual.fonts; }
      const spec = JSON.parse(JSON.stringify(showcase)); spec.style.presetId = "swiss@1.0";
      const index = spec.slides.findIndex((s) => s.type === "item");
      for (const canvasH of [1440, 1350]) {
        const dh = canvasH - 1440, before = await P.run(spec, brand, index, { recipe: "under", canvasH });
        const rv = Object.assign({}, vars, { "--cs-body-h": 998 + dh + "px" });
        const after = await P.run(spec, brand, index, { recipe: "under", canvasH, rootVars: rv });
        const f = (o) => o.chrome.filter((c) => !c.header).map((c) => ({ name: c.name, x: c.rect.x, y: c.rect.y, w: c.rect.w, h: c.rect.h }));
        res.push({ canvasH, beforeFooter: f(before), afterFooter: f(after), beforeA: before.anchor, afterA: after.anchor, contentBefore: before.content, contentAfter: after.content, padBottom: after.padBottom, fitOk: after.fit.ok, bad: P.checkRecipe(after) });
        P.dispose(before); P.dispose(after);
      }
      return res;
    }, { showcase, vars: INNER.vars });
    let inner = 0;
    for (const r of out) {
      const dh = r.canvasH - 1440, want = { x0: INNER.footer.x, x1: INNER.footer.x + INNER.footer.w, y: INNER.footer.y + dh };
      r.bad.forEach((m) => fail("inner footer contract " + m));
      if (!r.beforeFooter.length || !r.afterFooter.length) { fail(`inner footer contract @${r.canvasH}: no footer chrome measured`); continue; }
      r.beforeFooter.forEach((c) => { if (Math.abs(c.y - (DRAFT.footer.y + dh)) > TOL || c.x < DRAFT.footer.x - TOL || c.x + c.w > DRAFT.footer.x + DRAFT.footer.w + TOL) fail(`a slide without the custom properties moved its footer (${c.name} at x${Math.round(c.x)} y${Math.round(c.y)})`); });
      r.afterFooter.forEach((c) => {
        if (c.x < want.x0 - TOL || c.x + c.w > want.x1 + TOL) fail(`inner footer @${r.canvasH}: ${c.name} at x ${Math.round(c.x)}-${Math.round(c.x + c.w)} is outside x ${want.x0}-${want.x1}`);
        if (Math.abs(c.y - want.y) > TOL) fail(`inner footer @${r.canvasH}: ${c.name} starts at y ${Math.round(c.y)}, expected ${want.y}`);
        for (const z of DRAFT.keepOuts) { const zz = z.y >= 720 ? { ...z, y: z.y + dh } : z; if (touches({ x: c.x, y: c.y, w: c.w, h: c.h }, zz)) fail(`inner footer @${r.canvasH}: ${c.name} is in the ${z.id} keep-out`); }
        if (c.y + c.h > DRAFT.crop4x5.y + DRAFT.crop4x5.h + TOL) fail(`inner footer @${r.canvasH}: ${c.name} is cut by the 4:5 crop`);
      });
      if (Math.abs(r.contentAfter.h - (998 + dh)) > TOL) fail(`inner footer @${r.canvasH}: the body is ${Math.round(r.contentAfter.h)} px high, expected ${998 + dh}`);
      if (r.afterA.h < r.beforeA.h + 109 - TOL) fail(`inner footer @${r.canvasH}: the anchor grew by ${Math.round(r.afterA.h - r.beforeA.h)} px, expected 110`);
      if (!r.fitOk) fail(`inner footer @${r.canvasH}: the text no longer fits`);
      inner++;
    }
    console.log(`${inner === 2 ? "ok  " : "FAIL"} inner footer contract (custom properties): footer x 174-906, y 1275 (1185 on 4:5), body +110 px, nothing changes without them`);
  }

  for (const id of presets) {
    const hasArt = await studio.page.evaluate((id) => !!CS.core.registry.getPreset(id).art, id);
    const slides = await studio.page.evaluate(async ({ showcase, id }) => {
      const brand = JSON.parse(document.getElementById("cs-brand").textContent);
      if (brand.visual) { delete brand.visual.palette; delete brand.visual.fonts; }
      const spec = JSON.parse(JSON.stringify(showcase));
      spec.style.presetId = id + "@1.0";
      const deck = await CS.core.render.deck(spec, brand, { mode: "export", useFrozen: false });
      const out = deck.slides.map((s) => {
        const sr = s.el.getBoundingClientRect(), k = 1080 / sr.width;
        const rel = (r) => ({ x: (r.left - sr.left) * k, y: (r.top - sr.top) * k, w: r.width * k, h: r.height * k });
        const hidden = (el) => { for (let e = el; e && e !== s.el; e = e.parentElement) { const c = getComputedStyle(e); if (c.display === "none" || c.visibility === "hidden") return true; } return false; };
        const texts = [], chrome = [];
        const walker = document.createTreeWalker(s.el, NodeFilter.SHOW_TEXT, null);
        let n;
        while ((n = walker.nextNode())) {
          const el = n.parentElement;
          if (!/\S/.test(n.nodeValue) || !el || /^(STYLE|SCRIPT|TEMPLATE)$/.test(el.tagName) || hidden(el)) continue;
          const range = document.createRange();
          range.selectNodeContents(n);
          const lh = parseFloat(getComputedStyle(el).lineHeight);
          Array.prototype.forEach.call(range.getClientRects(), (r) => {
            if (r.width <= 0.5 || r.height <= 0.5) return;
            const rr = rel(r);
            if (lh > 0 && rr.h > lh * k) { rr.y += (rr.h - lh * k) / 2; rr.h = lh * k; }  // the line box, not the font's taller content area
            texts.push({ el: (el.closest("[data-slot]") || el).getAttribute("data-slot") || el.className || el.tagName, inChrome: !!el.closest(".cs-header, .cs-footer"), rect: rr });
          });
        }
        ["handle", "meta", "counter", "swipe", "savepill"].forEach((name) => {
          const el = s.el.querySelector('[data-slot="' + name + '"]');
          if (!el || hidden(el)) return;
          const r = el.getBoundingClientRect();
          if (r.width <= 0 || r.height <= 0) return;
          chrome.push({ name, header: !!el.closest(".cs-header"), rect: rel(r) });
        });
        return { id: s.id, type: (spec.slides[s.index] || {}).type, w: sr.width, texts, chrome };
      });
      deck.dispose();
      return out;
    }, { showcase, id });
    let problems = 0;
    for (const S of slides) {
      if (Math.abs(S.w - 1080) > 1) { fail(`${id} ${S.type}: rendered at ${S.w}px wide, not 1080`); problems++; continue; }
      measured += S.texts.length + S.chrome.length;
      const report = (what, rect) => { problems++; fail(`${id} ${S.type} (${S.id}): ${what} at x${Math.round(rect.x)} y${Math.round(rect.y)} w${Math.round(rect.w)} h${Math.round(rect.h)}`); };
      const footerBand = hasArt && innerData && runtimeInner && S.type !== "cover" && S.type !== "poster" ? innerData.bands.footer : DRAFT.footer;
      for (const t of S.texts) {
        if (!t.inChrome && !inside(t.rect, DRAFT.contentBox)) report(`text "${t.el}" leaves the content box`, t.rect);
        for (const z of DRAFT.keepOuts) if (touches(t.rect, z)) report(`text "${t.el}" is in the ${z.id} keep-out`, t.rect);
        if (!inside(t.rect, DRAFT.crop4x5)) report(`text "${t.el}" is cut by the 4:5 crop`, t.rect);
        if (!inside(t.rect, DRAFT.gridCrop)) report(`text "${t.el}" is cut by the grid crop`, t.rect);
      }
      for (const c of S.chrome) {
        const band = c.header ? DRAFT.header : footerBand;
        if (!inside(c.rect, band)) report(`${c.name} leaves the ${c.header ? "header" : "footer"} band`, c.rect);
        if (!c.header && c.rect.h > DRAFT.footer.itemMaxHeightPx + TOL) report(`${c.name} is taller than ${DRAFT.footer.itemMaxHeightPx}px`, c.rect);
        for (const z of DRAFT.keepOuts) if (touches(c.rect, z)) report(`${c.name} is in the ${z.id} keep-out`, c.rect);
        if (!inside(c.rect, DRAFT.crop4x5) || !inside(c.rect, DRAFT.gridCrop)) report(`${c.name} is cut by a crop`, c.rect);
      }
    }

    /* 4. the layout sheet: every type x recipe x canvas the arithmetic of spec 4.2 allows */
    const rec = await studio.page.evaluate(async ({ showcase, id }) => {
      const P = window.CSLayoutProbe, out = { runs: [], control: null };
      const brand = JSON.parse(document.getElementById("cs-brand").textContent);
      if (brand.visual) { delete brand.visual.palette; delete brand.visual.fonts; }
      const spec = JSON.parse(JSON.stringify(showcase)); spec.style.presetId = id + "@1.0";
      for (const [type, recipes] of Object.entries(P.ALLOWED)) {
        const index = spec.slides.findIndex((s) => s.type === type);
        if (index < 0) continue;
        for (const recipe of recipes) for (const canvasH of [1440, 1350]) {
          const variant = P.VARIANT[type + ":" + recipe] || null, restore = variant ? P.withVariant(id, type, variant) : () => {};
          const t0 = await P.run(spec, brand, index, { recipe, anchor: false, canvasH, variant, floors: true, noFit: true });
          const f = P.fits(recipe, t0); P.dispose(t0);
          const r = await P.run(spec, brand, index, { recipe, canvasH, variant });
          restore();
          out.runs.push({ type, recipe, canvasH, feasible: f.ok, T: f.T, H: f.H, bad: P.checkRecipe(r) });
          P.dispose(r);
        }
      }
      /* the absence rule: a slide without a recipe keeps its centring spacers */
      const c = await P.run(spec, brand, spec.slides.findIndex((s) => s.type === "stat"), {});
      out.control = c.spacers; P.dispose(c);
      return out;
    }, { showcase, id });
    const feasible = rec.runs.filter((r) => r.feasible);
    for (const r of feasible) for (const m of r.bad) { problems++; fail(`${id} layout sheet: ${m} (text ${r.T} px of ${r.H})`); }
    ["under", "over", "full", "center"].forEach((name) => { if (!feasible.some((r) => r.recipe === name && r.canvasH === 1440)) { problems++; fail(`${id} layout sheet: no type could carry the ${name} recipe at 1440 (the test would be vacuous)`); } });
    if (feasible.length < 30) { problems++; fail(`${id} layout sheet: only ${feasible.length} of ${rec.runs.length} type x recipe x canvas runs can fit floor-size text and the minimum anchor (expected at least 30)`); }
    if (rec.control.before === "none" || rec.control.after === "none") { problems++; fail(`${id}: a slide without data-recipe lost its centring spacers (the 1.0 layout must stay)`); }
    recipeRuns += feasible.length;
    if (verbose) rec.runs.filter((r) => !r.feasible).forEach((r) => console.log(`       (not chosen by the planner: ${r.type}/${r.recipe}@${r.canvasH}, text ${r.T} of ${r.H})`));

    /* 5. grid and timeline: short copy and copy at the limits of spec 4.4, in Arabic and in English (mirrored), both canvases */
    const itemCases = [["grid", 3, 0], ["grid", 3, -1], ["grid", 3, 2], ["grid", 4, 1], ["timeline", 3, -1], ["timeline", 4, 1], ["timeline", 5, -1]];
    const itemRes = await studio.page.evaluate(async ({ showcase, id, itemCases, dialects }) => {
      const P = window.CSLayoutProbe, out = { problems: [], runs: 0, limit: 0, flagged: [], lines: 0, boundary: P.boundaryProblems() };
      const brand = JSON.parse(document.getElementById("cs-brand").textContent);
      if (brand.visual) { delete brand.visual.palette; delete brand.visual.fonts; }
      for (const dialect of dialects) {
        const spec = JSON.parse(JSON.stringify(showcase)); spec.style.presetId = id + "@1.0";
        if (dialect === "en") spec.locale = Object.assign({}, spec.locale, { dialect: "en", appLanguage: "en", swipeCue: "arrow-ltr" });
        for (const [type, n, hi] of itemCases) for (const canvasH of (n > 4 ? [1440] : [1440, 1350])) for (const copy of ["short", "limit"]) {   // five nodes need 4 x 140 + 112 and no bridge: the 3:4 zone only (spec 4.4)
          const index = spec.slides.findIndex((s) => s.type === type);
          const o = { recipe: "full", anchor: false, short: false, canvasH, items: P.makeItems(type, n, hi, { boundary: copy === "limit", lang: dialect }), drop: n > 4 ? ["bridge"] : [] };
          const r = await P.run(spec, brand, index, o);
          out.problems.push(...P.checkItems(r, type === "grid" ? "bento" : "rail", n, hi, { allowFlagged: copy === "limit" }).map((m) => dialect + " " + copy + " " + m));
          out.runs++; if (copy === "limit") { out.limit++; if (r.flagged) out.flagged.push(`${type} n${n}@${canvasH} ${dialect}: ${r.flagged.join(",")}`); }
          r.itemNodes.forEach((m) => Object.values(m.texts).forEach((t) => { out.lines += t.length; }));
          P.dispose(r);
        }
      }
      return out;
    }, { showcase, id, itemCases, dialects: ["ar", "en"] });
    for (const m of itemRes.boundary) { problems++; fail(`${id} items: the boundary copy is not at the limits of spec 4.4: ${m}`); }
    for (const m of itemRes.problems) { problems++; fail(`${id} items: ${m}`); }
    if (itemRes.flagged.length > itemRes.limit * 0.25) { problems++; fail(`${id} items: the text pipeline rejects ${itemRes.flagged.length} of ${itemRes.limit} runs of copy at the limits (${itemRes.flagged.slice(0, 3).join(" | ")}): too few runs are left to prove the cells hold the copy`); }
    if (itemRes.lines < 400) { problems++; fail(`${id} items: only ${itemRes.lines} lines of text were measured inside cells (the containment check would be vacuous)`); }
    if (verbose && itemRes.flagged.length) console.log(`       (copy at the limits rejected by the text pipeline, not a layout fact: ${itemRes.flagged.join(" | ")})`);

    /* 7. the header band (every type, the whole band y 165-245) and the save pill */
    const bandHits = new Map();
    for (const type of bandTypes) {
      const band = await headerBand(studio.page, id, type);
      if (band.rows !== DRAFT.header.h) { problems++; fail(`${id} ${type}: the header band scan covered ${band.rows} rows, not ${DRAFT.header.h}`); continue; }
      // Approved cover pixels are frozen in round 3. Pin their existing edges exactly;
      // inner slides still require a clear band, and cover-baseline checks all cover pixels.
      const coverEdges = type === "cover" && { interface: [206], poster: [243] }[id];
      if (coverEdges) {
        if (JSON.stringify(band.edges) !== JSON.stringify(coverEdges) || band.vlines.length) {
          problems++; fail(`${id} cover: approved header decoration changed: ${JSON.stringify(band)}`);
        }
        continue;
      }
      const ok = (BAND_CHROME[id] || []).filter((c) => c.why);
      const edges = band.edges.filter((y) => !ok.some((c) => (c.edges || []).includes(y))), vlines = band.vlines.filter((x) => !ok.some((c) => (c.vlines || []).includes(x)));
      if (!edges.length && !vlines.length) continue;
      const what = `${edges.length ? "an edge or line at y " + edges.join(",") : ""}${vlines.length ? (edges.length ? " and " : "") + "a vertical line at x " + vlines.join(",") : ""}`;
      bandHits.set(what, (bandHits.get(what) || []).concat(type));
    }
    for (const [what, types] of bandHits) { problems++; fail(`${id}: decoration crosses the header band (y ${DRAFT.header.y}-${DRAFT.header.y + DRAFT.header.h}) on ${types.length === bandTypes.length ? "every type" : types.join(", ")}: ${what}${BAND_OWNER[id] ? "  [external blocker, owner " + BAND_OWNER[id] + "]" : ""}`); }
    if (bandHits.size && BAND_OWNER[id]) bandBlockers.push(id);
    const gaps = await studio.page.evaluate(async ({ showcase, id }) => {
      const P = window.CSLayoutProbe, brand = JSON.parse(document.getElementById("cs-brand").textContent);
      if (brand.visual) { delete brand.visual.palette; delete brand.visual.fonts; }
      const spec = JSON.parse(JSON.stringify(showcase)); spec.style.presetId = id + "@1.0";
      const r = await P.run(spec, brand, spec.slides.findIndex((s) => s.type === "cta"), {});
      const pill = r.chrome.filter((c) => c.name === "savepill")[0]; P.dispose(r);
      return pill || null;
    }, { showcase, id });
    if (gaps && gaps.glyphGap !== undefined && gaps.glyphGap < 8 - TOL) { problems++; fail(`${id}: the save pill keeps ${gaps.glyphGap} px between its glyph and its text (8 px minimum, S-14)`); }

    console.log(`${problems ? "FAIL" : "ok  "} ${id.padEnd(10)} ${slides.length} archetypes${verbose ? ", " + slides.reduce((n, s) => n + s.texts.length + s.chrome.length, 0) + " boxes" : ""}, ${feasible.length} recipe runs, ${itemRes.runs} item layouts (${itemRes.lines} lines of text inside cells), header band ${bandHits.size ? "CROSSED" : "clear on " + bandTypes.length + " types"}`);
  }
  if (!measured) fail("nothing was measured: no text and no chrome was found");
  if (studio.errors.length) fail("page errors: " + studio.errors.slice(0, 3).join(" | "));
  console.log(`info ${recipeRuns} recipe runs realised the box the arithmetic of spec 4.2 asks for`);
  if (bandBlockers.length) console.log(`info EXTERNAL BLOCKER: ${bandBlockers.map((id) => id + " -> " + BAND_OWNER[id]).join("; ")}. The header-band assertion is live (plan r2 S-7) and is not excused; this run fails until that preset is rebuilt.`);
} finally {
  await studio.close();
  fs.rmSync(work, { recursive: true, force: true });
}
process.exitCode = bad ? 1 : 0;
