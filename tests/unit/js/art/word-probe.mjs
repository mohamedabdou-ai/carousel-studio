// tests/unit/js/art/word-probe.mjs · the replay-painter probe of the word anchor (package A10a, spec 3.10, risk R4).
//   node tests/unit/js/art/word-probe.mjs [--out DIR] [--quick]
// The sticker is a stack of text layers (ink, paper ring, hard shadow); the two painters must draw it alike or the sticker falls back to the solid word on a sticker tile.
// For each of the six presets x three tones the probe paints a complete slide and the word region with the svg painter and the replay painter and compares them (SSIM, the
// 0.98 floor of the painters' parity). It prints one verdict line per variant of the card (sticker measured; hollow and lettermark are A10b and are not drawn) and exits 1 when
// the verdict differs from CS.art.word.support in src/art/word.js (record a failed probe there: support.sticker = false). The shipped flag is read before either measurement and
// each measurement puts back the value it found (also when a build or a painter throws), so a flag set to false is judged as false. The same functions serve word.test.mjs;
// settleSlide runs the real post-fit settle pass (CS.visual.settle) on a slide, for the struck style, whose strike is a text-bound mark (A13) and not part of the anchor.
// The page of the art harness has no real display role: prepare() adds the rule of primitives.css for role word, the display faces of the six presets and their
// custom properties, so the stack is drawn the way the engine draws it. --quick uses the two faces the harness bundles (Alexandria, Readex Pro) for every preset.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isMain } from "../../../parity/lib/barepage.mjs";
import { ssim, decodePng } from "../../../parity/lib/ssim.mjs";
import { REPO } from "../../../parity/lib/studio.mjs";
import { withArt } from "./harness.mjs";
import { PRESETS } from "./support/dna.mjs";

const FONTS = path.join(REPO, "plugins/carousel-studio/skills/carousel-design/fonts");
const PRIMITIVES = fs.readFileSync(path.join(REPO, "plugins/carousel-studio/skills/carousel-design/templates/primitives.css"), "utf8");
// the display face of each preset (preset.json type.display) and its weight; files are the unmodified upstream fonts
export const FACE = {
  swiss: ["IBM Plex Sans Arabic", 700, "ibm-plex-sans-arabic/IBMPlexSansArabic-Bold.ttf"], creator: ["Alexandria", 800, null], notebook: ["Playpen Sans Arabic", 700, "playpen-sans-arabic/PlaypenSansArabic[wght].ttf"],
  poster: ["Noto Kufi Arabic", 800, "noto-kufi-arabic/NotoKufiArabic[wght].ttf"], interface: ["Readex Pro", 700, null], heritage: ["Reem Kufi", 600, "reem-kufi/ReemKufi[wght].ttf"]
};

/** The role rules of primitives.css (art label, word) exactly as shipped, so a change of E4a's sheet reaches this test. */
export function roleRules() {
  const rules = PRIMITIVES.split("\n").filter((l) => /^\.cs-slide \.cs-art-label(\[data-role="word"\])?\s*\{/.test(l) || /^\.cs-slide \.cs-art-label\[data-role\]\s*\{/.test(l));
  if (rules.length !== 3) throw new Error("primitives.css no longer carries the three art-label rules this probe reads: " + rules.length);
  return rules.join("\n");
}

const bundled = (family) => family === "Alexandria" || family === "Readex Pro";
const faceOf = (p, quick) => (quick && !bundled(FACE[p][0]) ? ["Alexandria", 800, null] : FACE[p]);

/** Adds the role rules, the display faces and the per-preset custom properties to the harness page (once). quick: only the faces the harness bundles. */
export async function prepare(art, { quick = false } = {}) {
  await art.evaluate((m) => { CS.visual._.blocks["cs-art-marks"] = m; }, MARKS);
  // the real CS.core.compose.label (E2a) reads cx.id and cx.rules, which the harness's stand-in context does not carry: add the two when they are missing, nothing else
  await art.evaluate((rules) => {
    const c = CS.core.compose;
    if (!c || typeof c.label !== "function" || c.label.__cx) return;
    const real = c.label, wrapped = (node, text, cx, o) => real(node, text, Object.assign({ id: cx.slideId, rules }, cx), o);
    wrapped.__cx = true; c.label = wrapped;
  }, { platform: { plugin: { visual: { artLabel: PLATFORM.plugin.visual.artLabel } } } });
  const faces = [], vars = [], list = [];
  for (const p of PRESETS) {
    const [family, wght, file] = faceOf(p, quick);
    if (file) faces.push(`@font-face{font-family:"${family}";font-weight:100 900;font-display:block;src:url(data:font/ttf;base64,${fs.readFileSync(path.join(FONTS, file)).toString("base64")}) format("truetype");}`);
    vars.push(`.cs-slide[data-preset="${p}"]{--cs-font-display:"${family}";--cs-wght-display:${wght};--cs-fs-hero:150px;}`);
    list.push([family, wght]);
  }
  await art.evaluate(async ([css, faces, list]) => {
    if (window.__wordReady) return;
    document.getElementById("cs-fonts").textContent += "\n" + faces.join("\n");
    const s = document.createElement("style"); s.setAttribute("data-cs-slide-css", ""); s.textContent = css; document.head.appendChild(s);
    await Promise.all(list.map(([fam, w]) => document.fonts.load(`${w} 64px "${fam}"`, "احفظ")));
    window.__wordReady = true;
  }, [roleRules() + "\n" + vars.join("\n"), faces, list]);
}

const MARKS = JSON.parse(fs.readFileSync(path.join(REPO, "plugins/carousel-studio/skills/carousel-design/data/art/marks.json"), "utf8"));
const PLATFORM = JSON.parse(fs.readFileSync(path.join(REPO, "plugins/carousel-studio/skills/carousel-design/data/platform-instagram.json"), "utf8"));
/** The tokens fit needs (the 1.1 preset scale; only the word role, whose range is fixed in fit.js, is exercised here). */
export const TOKENS = { type: { scale: { hero: [120, 180], h1: 88, h2: 72, title: [64, 72], body: [44, 48], small: 34, micro: 30 } }, floors: { hero: 96, body: 42, meta: 30 }, art: {} };

/** Renders an anchor on a harness slide, then runs the real fit (CS.core.fit.fitSlide) over it: what the engine does between compose and export. null when the builder returns null. */
export async function renderFit(art, anchor, o = {}) {
  const r = await art.render(anchor, { png: false, ...o });
  if (!r) return null;
  r.fit = await art.evaluate(([sel, tok]) => {
    const slide = document.querySelector(sel); slide.setAttribute("data-cs-slide", "s05");
    const rep = CS.core.fit.fitSlide(slide, tok);
    return { ok: rep.ok, warnings: rep.warnings.map((w) => w.en), slots: Object.fromEntries(Object.entries(rep.slots).map(([k, v]) => [k, { px: v.fontPx, status: v.status, lines: v.lines }])) };
  }, [r.sel, TOKENS]);
  return r;
}

/** Tiles PNG buffers into one picture, cols per row, each drawn width px wide (the page's canvas; no dependency). */
export async function montage(art, pngs, { cols = 2, width = 852, gap = 12, bg = "#888888" } = {}) {
  const uri = await art.evaluate(async ([list, cols, width, gap, bg]) => {
    const imgs = await Promise.all(list.map(async (b) => { const i = new Image(); i.src = "data:image/png;base64," + b; await i.decode(); return i; }));
    const hs = imgs.map((i) => Math.round(i.height * width / i.width)), rows = Math.ceil(imgs.length / cols), rowH = [];
    for (let r = 0; r < rows; r++) rowH.push(Math.max(...hs.slice(r * cols, r * cols + cols)));
    const c = document.createElement("canvas"); c.width = cols * width + (cols + 1) * gap; c.height = rowH.reduce((a, b) => a + b, 0) + (rows + 1) * gap;
    const x = c.getContext("2d"); x.fillStyle = bg; x.fillRect(0, 0, c.width, c.height); x.imageSmoothingQuality = "high";
    imgs.forEach((i, k) => { const r = Math.floor(k / cols); x.drawImage(i, gap + (k % cols) * (width + gap), gap + rowH.slice(0, r).reduce((a, b) => a + b, 0) + r * gap, width, hs[k]); });
    return c.toDataURL("image/png");
  }, [pngs.map((b) => b.toString("base64")), cols, width, gap, bg]);
  return Buffer.from(uri.slice(uri.indexOf(",") + 1), "base64");
}

const WORD = { kind: "word", word: "احفظ", wordStyle: "sticker" };

/** SSIM of the same rectangle cut out of two full-slide PNGs (a region painted alone loses the .cs-slide ancestors the role rules need, so crops are cut from complete slides). */
export function cropSsim(pngA, pngB, rect) {
  const a = decodePng(pngA), b = decodePng(pngB), x0 = Math.max(0, Math.floor(rect.x)), y0 = Math.max(0, Math.floor(rect.y)), w = Math.min(a.width - x0, Math.ceil(rect.w)), h = Math.min(a.height - y0, Math.ceil(rect.h));
  const cut = (im) => { const data = new Uint8ClampedArray(w * h * 4); for (let y = 0; y < h; y++) data.set(im.data.subarray(((y0 + y) * im.width + x0) * 4, ((y0 + y) * im.width + x0 + w) * 4), y * w * 4); return { width: w, height: h, data }; };
  return ssim(cut(a), cut(b));
}

/** Paints `r` (a render record) with both painters; the slide and the anchor box (.cs-art plus 40 px for the ring) are compared. */
export async function parity(art, r) {
  const p = await art.paintBoth(r), rect = await art.evaluate((sel) => { const s = document.querySelector(sel).getBoundingClientRect(), e = document.querySelector(sel + " .cs-art").getBoundingClientRect(); return { x: e.left - s.left - 40, y: e.top - s.top - 40, w: e.width + 80, h: e.height + 80 }; }, r.sel);
  return { slide: p.ssim, anchor: cropSsim(p.svgPng, p.replayPng, rect), svgPng: p.svgPng, replayPng: p.replayPng, rect };
}

export const TONES = ["base", "invert", "field"];
const flag = (art) => art.evaluate(() => CS.art.word.support.sticker);
const setFlag = (art, v) => art.evaluate((v) => { CS.art.word.support.sticker = v; }, v);

/** Paints the sticker (or its fallback) of every preset x tone with both painters; returns { cases: [{ preset, tone, slide, anchor }], min: { slide, anchor } }.
 *  The flag the page had before the call is read first and put back in `finally`, whatever happens in between (a throw from the build or from a painter included). */
export async function measure(art, { fallback = false, word = "احفظ", presets = PRESETS, tones = TONES } = {}) {
  const cases = [], before = await flag(art);
  try {
    await setFlag(art, !fallback);
    for (const preset of presets) for (const tone of tones) {
      const r = await renderFit(art, { kind: "word", word, wordStyle: "sticker" }, { preset, tone, recipe: "center", box: { w: 852, h: 560 } });
      if (!r) throw new Error("the word anchor did not build for " + preset + " " + tone);
      const p = await parity(art, r);
      cases.push({ preset, tone, slide: p.slide, anchor: p.anchor });
    }
  } finally { await setFlag(art, before); }
  return { cases, min: { slide: Math.min(...cases.map((c) => c.slide)), anchor: Math.min(...cases.map((c) => c.anchor)) } };
}

export const FLOOR = 0.98;
export const verdict = (m) => (m.min.slide >= FLOOR && m.min.anchor >= FLOOR ? "ok" : "fail");

/** The whole probe on a prepared page: the shipped flag first (what src/art/word.js sets), then the sticker and the tile fallback; the flag is the same after as before. */
export async function probe(art, { quick = false, presets, tones } = {}) {
  await prepare(art, { quick });
  const shipped = await flag(art), sticker = await measure(art, { presets, tones }), tile = await measure(art, { fallback: true, presets, tones });
  return { sticker, tile, shipped };
}

/** Does the probe's verdict for the sticker match the shipped flag (ok <=> support.sticker true)? */
export const agrees = (v, shipped) => (v === "ok") === shipped;

/** Runs CS.visual.settle (the post-fit pass that places text-bound marks, rule A13) on the slide of a render record the way the engine does after fit: stored marks forgotten first.
 *  Returns { marks: [ids], dropped, layers, last, paths: [{ x, y, w, h }] (slide px), lines: [{ x, y, w, h }] (the fitted lines of every target, from its .w units), targets: [data-mark-target values], stored }. */
export async function settleSlide(art, r, { doodle = "marker", deck = "deck" } = {}) {
  return art.evaluate(([sel, doodle, deck]) => {
    const root = document.querySelector(sel), id = root.getAttribute("data-cs-slide") || "s05", tone = root.getAttribute("data-tone"), rtl = root.getAttribute("dir") !== "ltr";
    const c = __art.ctx({ preset: root.getAttribute("data-preset"), tone, rtl }), a = Object.assign({}, c.art, { doodle });
    CS.core.freeze.visual.set(id, null);
    const res = CS.visual.settle(root, { tokens: { tones: { [tone]: c.tokens }, art: a }, art: a, spec: { id: deck }, zone: c.zone, id, tone, data: { marks: CS.visual._.block("cs-art-marks") } });
    const q = root.getBoundingClientRect(), rect = (e) => { const b = e.getBoundingClientRect(); return { x: b.left - q.left, y: b.top - q.top, w: b.width, h: b.height }; };
    const targets = [...root.querySelectorAll("[data-mark-target]")], words = targets.flatMap((e) => [...e.querySelectorAll(".w")].map(rect)), lines = [];
    words.forEach((w) => { const l = lines.find((k) => Math.abs(k.y + k.h / 2 - (w.y + w.h / 2)) < 0.3 * w.h); if (l) { const x = Math.min(l.x, w.x), y = Math.min(l.y, w.y); l.w = Math.max(l.x + l.w, w.x + w.w) - x; l.h = Math.max(l.y + l.h, w.y + w.h) - y; l.x = x; l.y = y; } else lines.push({ ...w }); });
    const layers = root.querySelectorAll("svg.cs-marks");
    return { marks: res.marks.map((m) => m.id), dropped: res.dropped, layers: layers.length, last: layers.length === 1 && root.lastElementChild === layers[0], targets: targets.map((e) => e.getAttribute("data-mark-target")), lines,
      paths: [...root.querySelectorAll("svg.cs-marks path")].map((p) => { const b = p.getBBox(); return { x: b.x, y: b.y, w: b.width, h: b.height }; }), stored: JSON.stringify((CS.core.freeze.visual.get(id) || {}).marks) === JSON.stringify(res.marks) };
  }, [r.sel, doodle, deck]);
}

async function main() {
  const args = process.argv.slice(2), quick = args.includes("--quick"), out = args.includes("--out") ? args[args.indexOf("--out") + 1] : null;
  if (out) process.env.CS_ART_OUT = path.resolve(out);
  const res = await withArt((art) => probe(art, { quick }), { data: "fixtures" });
  const line = (name, v, note) => console.log(name.padEnd(14) + v.padEnd(10) + note);
  const f = (m) => `${m.cases.length} cases, min SSIM slide ${m.min.slide.toFixed(4)}, anchor crop ${m.min.anchor.toFixed(4)} (floor ${FLOOR})`;
  const v = verdict(res.sticker);
  line("sticker", v, f(res.sticker));
  line("sticker-tile", verdict(res.tile), "fallback (solid on a sticker tile): " + f(res.tile));
  line("hollow", "deferred", "not in the slice (A10b); not drawn");
  line("lettermark", "deferred", "not in the slice (A10b, S-3: only when the whole glyph is visible); not drawn");
  const worst = (m) => m.cases.slice().sort((a, b) => a.anchor - b.anchor).slice(0, 3).map((c) => `${c.preset}/${c.tone} ${c.anchor.toFixed(4)}`).join(", ");
  console.log("weakest anchor crops: sticker " + worst(res.sticker) + "; tile " + worst(res.tile));
  const agree = agrees(v, res.shipped);
  console.log(`CS.art.word.support.sticker = ${res.shipped} in src/art/word.js; probe says ${v}` + (agree ? "" : "  ** MISMATCH: set support.sticker to " + (v === "ok") + " **"));
  return agree && verdict(res.tile) === "ok" ? 0 : 1;
}

if (isMain(import.meta.url)) main().then((c) => { process.exitCode = c; }, (e) => { process.stderr.write("cs-error: E_INTERNAL: " + (e && e.stack || e) + "\n"); process.exitCode = 70; });
