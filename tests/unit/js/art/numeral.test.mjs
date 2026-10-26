// tests/unit/js/art/numeral.test.mjs · the numeral anchor (package A6a): subs none | waffle | bar | icon over the six DNAs and three tones, the waffle geometry (28-38 px cells, box 316-416,
// RTL growth from the start edge, cell counts of every share notation), the share parser (28/30 is 93%, never 28%), the boundary rules G1/G2 on filled AND empty marks, the 70% width budget,
// the honesty paths (source chip, «رسم توضيحي» tag, an unsourced share drawn as an illustrative waffle, a companion dropped rather than faked, a bounded source chip), the measurement
// interface through the real CS.visual.deadSpace, label roles and floors, the load order of chart.js and numeral.js, determinism, painter parity and the contact sheets of the package acceptance:
//   node tests/unit/js/art/run.mjs --only numeral [--out DIR]   (numeral.png and numeral-130.png land in DIR/art when --out is given).
// The helpers both anchors share are published by chart.js as CS.art.chart (div at sty ol ew cw mixTo pal bar share proof chip waffle comp burst); numeral.js reads them when it loads, so
// src/art/manifest.json must list chart.js first (test "load order").
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PRESETS } from "./support/dna.mjs";

const ART_SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../src/art");

const STAT = { id: "s05", type: "stat" }, SRC = { id: "s05", type: "stat", sourceIds: ["s1"] }, SOURCES = { s1: "WHO 2024" };
const TONES = ["base", "invert", "field"], WIDE = { w: 852, h: 460 }, TALL = { w: 852, h: 720 };
const ANCHORS = {
  none: { kind: "numeral", value: "30%", companion: "none" },
  waffle: { kind: "numeral", value: "8", unit: "من كل 100", companion: "waffle" },
  bar: { kind: "numeral", value: "72", unit: "ساعة", companion: "bar", filled: 72 },
  icon: { kind: "numeral", value: "3", unit: "مكالمات", companion: "icon", object: "phone" }
};

/** In-page stand-in for the engine around a label (E2a is not wired into the harness): the role rules of primitives.css as inline styles (so both painters keep them, also on a cropped region),
 *  then fit.js's job: each word slot shrinks, never grows, until its words sit inside its box or its data-floor is reached. */
export function settle(sel) {
  const ROLE = { numeral: "font-family:Alexandria;font-weight:800;line-height:.9;", title: "font-family:Alexandria;font-weight:700;font-size:72px;line-height:1.2;", chip: "font-family:Alexandria;font-weight:700;font-size:36px;line-height:1.2;", chart: "font-family:Alexandria;font-weight:700;font-size:38px;line-height:1.2;" };
  for (const l of document.querySelectorAll(sel + " .cs-art-label")) {
    if (!l.dataset.styled) { l.setAttribute("style", (ROLE[l.dataset.role] || "") + (l.getAttribute("style") || "")); if (!l.style.color) l.style.color = getComputedStyle(l).color; l.dataset.styled = "1"; }
    const floor = +l.dataset.floor || 12, wide = () => { const ws = [...l.querySelectorAll(".w")].map((w) => w.getBoundingClientRect()), b = l.getBoundingClientRect(); return ws.length && Math.max(...ws.map((r) => r.right)) - Math.min(...ws.map((r) => r.left)) > b.width + 0.75; };
    let px = parseFloat(getComputedStyle(l).fontSize);
    while (wide() && px > floor) { px -= 1; l.style.fontSize = px + "px"; }
  }
}
export const draw = async (t, anchor, o = {}) => {
  const r = await t.art.render(anchor, { png: false, slide: STAT, box: WIDE, ...o });
  if (r && o.fit !== false) await t.art.evaluate(settle, r.sel);
  return r;
};

/** In-page: every label (role, floor, key, computed size, text, ink rect = union of its .w words) and every svg, relative to the anchor root. */
export function geo(sel) {
  const root = document.querySelector(sel + " .cs-art"), rr = root.getBoundingClientRect();
  const rel = (r) => ({ x: +(r.left - rr.left).toFixed(2), y: +(r.top - rr.top).toFixed(2), w: +r.width.toFixed(2), h: +r.height.toFixed(2) });
  const labels = [...root.querySelectorAll(".cs-art-label")].map((l) => {
    const ws = [...l.querySelectorAll(".w")].map((w) => w.getBoundingClientRect()), u = ws.length ? { left: Math.min(...ws.map((r) => r.left)), top: Math.min(...ws.map((r) => r.top)), right: Math.max(...ws.map((r) => r.right)), bottom: Math.max(...ws.map((r) => r.bottom)) } : l.getBoundingClientRect();
    const cs = getComputedStyle(l), ink = rel({ left: u.left, top: u.top, width: u.right - u.left, height: u.bottom - u.top });
    return { role: l.dataset.role, index: +l.dataset.index, floor: +l.dataset.floor, key: l.dataset.slotKey, px: parseFloat(cs.fontSize), text: l.textContent.trim(), html: l.innerHTML, ink, box: rel(l.getBoundingClientRect()), over: ink.w > l.getBoundingClientRect().width + 1, ls: cs.letterSpacing, fs: cs.fontStyle, op: cs.opacity, ta: cs.textAlign, jus: cs.textJustify };
  });
  const svgs = [...root.querySelectorAll("svg")].map((s) => ({ ...rel(s.getBoundingClientRect()), fig: !!s.closest('[data-part="figure"]'), paths: [...s.querySelectorAll("path")].map((p) => ({ d: p.getAttribute("d"), fill: p.getAttribute("fill") })) }));
  return { W: +rr.width.toFixed(2), H: +rr.height.toFixed(2), labels, svgs, owners: root.querySelectorAll("[data-owner]").length };
}
const hit = (a, b) => a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5;
const inside = (a, W, H) => a.x >= -1 && a.y >= -1 && a.x + a.w <= W + 1 && a.y + a.h <= H + 1;
const waffleOf = (g) => g.svgs.find((s) => s.paths.length === 2 && s.w >= 316 && s.w <= 416 && Math.abs(s.w - s.h) < 0.5);
/** In-page: every svg of the anchor with its paths (cells, fill, stroke, stroke width) and the contrasts of fill and stroke against the ground of the preset and tone; cOO = on against off. */
export function marksG([sel, preset, tone]) {
  const root = document.querySelector(sel + " .cs-art"), tk = __art.ctx({ preset, tone }).tokens, ct = (a, b) => +CS.core.color.contrast(a, b).toFixed(3), cr = (c) => (c && c !== "none" ? ct(c, tk.bg) : null);
  return [...root.querySelectorAll("svg")].map((s) => {
    const paths = [...s.querySelectorAll("path")].map((p) => ({ n: (p.getAttribute("d").match(/M/g) || []).length, fill: p.getAttribute("fill"), stroke: p.getAttribute("stroke"), sw: +p.getAttribute("stroke-width") || 0, cf: cr(p.getAttribute("fill")), cs: cr(p.getAttribute("stroke")) }));
    return { w: +s.getBoundingClientRect().width.toFixed(1), paths, cOO: paths.length === 2 && paths[0].fill !== "none" && paths[1].fill !== "none" ? ct(paths[0].fill, paths[1].fill) : null };
  });
}
/** Rule G1/G2: a mark with a 3 px outline needs the outline at 3:1 on its ground, one without needs its fill at 3:1. */
export const boundaryOk = (p) => (p.sw >= 3 && p.stroke && p.stroke !== "none" ? p.cs >= 3 : p.cf >= 3);
/** In-page: the rect of the [data-part=chip] pill relative to the anchor root. */
export function chipRect(sel) {
  const root = document.querySelector(sel + " .cs-art").getBoundingClientRect(), c = document.querySelector(sel + ' [data-part="chip"]');
  if (!c) return null;
  const r = c.getBoundingClientRect();
  return { x: +(r.left - root.left).toFixed(2), y: +(r.top - root.top).toFixed(2), w: +r.width.toFixed(2), h: +r.height.toFixed(2) };
}

export default {
  module: "numeral",
  tests: [
    {
      name: "FIX-A: item and step percentages and quantities retain their proof; only actual ordinals are exempt, twice",
      async run(t) {
        for (const type of ["item", "step"]) for (const sourced of [false, true]) for (const [value, unit] of [["30%", ""], ["30", "جنيه"]]) {
          const slide = { id: "s05", type, ord: 3, ...(sourced ? { sourceIds: ["s1"] } : {}) }, a = { kind: "numeral", value, unit, companion: "none" }, out = [];
          for (let i = 0; i < 2; i++) {
            const r = await draw(t, a, { slide, sources: SOURCES, box: TALL });
            t.ok(r);
            t.ok(r.labels.some((l) => l.role === "chip" && l.text.includes(sourced ? "المصدر" : "رسم توضيحي")));
            if (value === "30%" && !sourced) t.ok((await t.art.evaluate(geo, r.sel)).svgs.length > 0, "the unsourced percentage draws a waffle");
            out.push({ html: r.html, boxes: r.boxes, labels: r.labels });
          }
          t.eq(out[0], out[1]);
        }
      }
    },
    {
      name: "registration: subs none, waffle, bar, icon are owned and reachable; ring, pictogram and delta are not claimed; no value, no anchor",
      async run(t) {
        const c = await t.art.evaluate(() => ({ caps: CS.art.caps().art.numeral, has: ["none", "waffle", "bar", "icon", "ring", "pictogram", "delta"].map((s) => CS.art.has("numeral", s)), sub: ["none", "waffle", "bar", "icon"].map((s) => CS.art._.sub({ kind: "numeral", companion: s })) }));
        t.eq(c.caps, ["bar", "icon", "none", "waffle"], "caps list the four subs, sorted");
        t.eq(c.has, [true, true, true, true, false, false, false]);
        t.eq(c.sub, ["none", "waffle", "bar", "icon"], "_.sub reaches every registered sub");
        t.eq(await t.art.evaluate(() => CS.art.build({ kind: "numeral", companion: "ring", value: "8" }, __art.ctx({ box: { w: 852, h: 460 } }))), null, "an unregistered companion builds nothing");
        t.eq(await draw(t, { kind: "numeral", companion: "none" }, { slide: { id: "s05", type: "stat" } }), null, "no value and no slide.number: no anchor");
        t.eq(await draw(t, { kind: "numeral", companion: "none", value: "  " }), null, "a blank value draws nothing");
      }
    },
    {
      name: "every sub x six DNAs x three tones: builds, safe() (A1-A17), painter-safe words, the figure 200-520 px (280+ with a companion), nothing outside the box, the figure and its companion apart",
      async run(t) {
        for (const [sub, anchor] of Object.entries(ANCHORS)) for (const preset of PRESETS) for (const tone of TONES) for (const box of [WIDE, sub === "bar" ? { w: 852, h: 520 } : TALL]) {
          const id = [sub, preset, tone, box.h].join("/"), r = await draw(t, anchor, { preset, tone, box, slide: SRC, sources: SOURCES });
          t.ok(r, id + ": builds");
          const s = await t.art.safe(r); t.eq(s.violations, [], id + ": safe() " + JSON.stringify(s.violations.slice(0, 2)));
          const g = await t.art.evaluate(geo, r.sel), fig = g.labels[0];
          t.eq(fig.role, "numeral"); t.gte(fig.px, 200, id + ": figure floor"); t.lte(fig.px, 520, id + ": figure ceiling"); t.eq(fig.floor, 200, id + ": data-floor 200");
          const comp = g.svgs.find((v) => !v.fig && v.w > 100 && v.h > 20 && v.paths.length) || null;
          if (comp) t.gte(fig.px, 280, id + ": paired with a companion the figure keeps 280 px"); else t.gte(fig.px, 200, id + ": alone it keeps the 200 px floor");
          t.lte(fig.box.w, g.W * 0.7 + 0.01, id + ": the figure box is at most 70% of the box width (" + fig.box.w + " of " + g.W + ")");
          for (const l of g.labels) { t.ok(inside(l.ink, g.W, g.H), id + ": label inside the box " + JSON.stringify(l.ink)); t.ok(!l.over, id + ": the words of " + l.role + " fit their own box once fit has run (" + l.px + " px, floor " + l.floor + ")"); }
          for (const v of g.svgs) t.ok(inside(v, g.W, g.H), id + ": drawing inside the box " + JSON.stringify(v));
          if (comp) { t.ok(!hit(fig.ink, comp), id + ": the figure does not touch its companion"); t.ok(r.boxes.some((b) => b.kind === "ink" || b.kind === "owner"), id + ": the companion has a box"); }
          t.ok(g.labels.every((l) => l.ls === "normal" || parseFloat(l.ls) === 0) && g.labels.every((l) => l.fs === "normal" && l.op === "1"), id + ": no letter-spacing, italic or opacity on any word");
        }
      }
    },
    {
      name: "waffle: 100 cells of 28-38 px, a box of 316-416 px, the first n filled from the start edge (right in RTL, left in LTR); n from the figure, a percent, or filled of `of`",
      async run(t) {
        const probe = async (anchor, o) => {
          const r = await draw(t, anchor, o), g = await t.art.evaluate(geo, r.sel), w = waffleOf(g);
          t.ok(w, "a waffle svg of 316-416 px is drawn");
          const [off, on] = w.paths, cells = (d) => (d.d.match(/M/g) || []).length, first = parseFloat(on.d.slice(1));
          return { w, on: cells(on), off: cells(off), first, g };
        };
        for (const preset of PRESETS) {
          const a = await probe(ANCHORS.waffle, { preset });
          t.eq([a.on, a.off], [8, 92], preset + ": 8 of 100 filled");
          t.gte(a.w.w, 316); t.lte(a.w.w, 416); const cell = (a.w.w + 4) / 10 - 4; t.gte(cell, 28 - 0.01); t.lte(cell, 38 + 0.01);
          t.ok(a.first > a.w.w / 2, preset + ": RTL fills from the right edge (first cell x " + a.first + ")");
          const l = await probe(ANCHORS.waffle, { preset, rtl: false });
          t.ok(l.first < l.w.w / 2, preset + ": LTR fills from the left edge (first cell x " + l.first + ")");
        }
        const cases = [[{ value: "30%" }, 30], [{ value: "٤٠٪" }, 40], [{ value: "7", filled: 3, of: 10 }, 30], [{ value: "9", of: 20 }, 45], [{ value: "100", unit: "%" }, 100], [{ value: "0", unit: "%" }, 0], [{ value: "8.5", unit: "%" }, 9], [{ value: "30", unit: "%" }, 30],
          [{ value: "8/10" }, 80], [{ value: "4/5" }, 80], [{ value: "3/4" }, 75], [{ value: "7/8" }, 88], [{ value: "1/3" }, 33], [{ value: "٨/١٠" }, 80], [{ value: "9", filled: 28, of: 30 }, 93], [{ value: "7", unit: "من كل 10" }, 70], [{ value: "8", unit: "من كل 100" }, 8]];
        for (const [extra, n] of cases) {
          const r = await draw(t, { kind: "numeral", companion: "waffle", ...extra }, { box: TALL }), g = await t.art.evaluate(geo, r.sel), w = waffleOf(g), [off, on] = w.paths, c = (p) => (p.d.match(/M/g) || []).length;
          t.eq([c(on) || 0, c(off) || 0], [n, 100 - n], JSON.stringify(extra) + " draws " + n + " cells");
        }
        for (const extra of [{ value: "30" }, { value: "12", unit: "ساعة" }, { value: "12 ساعة" }, { value: "150%" }, { value: "7/5" }, { value: "5/0" }, { value: "1,5", unit: "%" }, { value: "7", unit: "من كل 100x" }]) {
          const r = await draw(t, { kind: "numeral", companion: "waffle", ...extra }, { box: TALL, slide: SRC, sources: SOURCES });
          t.ok(!r || (await t.art.evaluate(geo, r.sel)).svgs.length === 0, JSON.stringify(extra) + ": no share is said, so no waffle is drawn (the figure stays, or is too wide for its box)");
        }
      }
    },
    {
      name: "bar companion: a 28 px meter the width of the box, the share filled from the start edge; icon companion: the counted thing as a sticker beside the figure",
      async run(t) {
        for (const rtl of [true, false]) {
          const r = await draw(t, ANCHORS.bar, { rtl, box: { w: 852, h: 520 }, preset: "poster" }), g = await t.art.evaluate(geo, r.sel), m = g.svgs.find((s) => s.w === 852 && s.paths.length === 2);
          t.ok(m, "a meter svg 852 px wide"); t.near(m.h, 28, 0.01, "28 px high without an outline");
          const f = await t.art.evaluate(([sel]) => [...document.querySelectorAll(sel + " svg")].map((s) => [...s.querySelectorAll("path")].map((p) => p.getAttribute("d"))).find((p) => p.length === 2), [r.sel]);
          const nums = (d) => d.match(/-?\d+(\.\d+)?/g).map(Number), x0 = nums(f[1])[0];
          t.ok(rtl ? x0 > 852 * 0.2 : x0 < 20, (rtl ? "RTL: the fill starts after the empty part (x " + x0 + ")" : "LTR: the fill starts at the left edge (x " + x0 + ")"));
        }
        const i = await draw(t, ANCHORS.icon, { preset: "creator", slide: SRC, sources: SOURCES }), g = await t.art.evaluate(geo, i.sel);
        t.ok(g.svgs.some((s) => s.w >= 250), "an xl sticker when the box allows it");
        const small = await draw(t, ANCHORS.icon, { preset: "creator", box: { w: 600, h: 400 } }), gs = await t.art.evaluate(geo, small.sel);
        t.ok(gs.svgs.every((s) => s.w <= 400), "a smaller box takes the lg sticker or drops the companion");
        const gl = await draw(t, { kind: "numeral", companion: "icon", icon: "clock", value: "12" }, { preset: "creator" }), gg = await t.art.evaluate(geo, gl.sel);
        t.ok(gg.svgs.length >= 1 && gg.owners >= 1, "a Lucide glyph on its container when there is no object");
        const none = await draw(t, { kind: "numeral", companion: "icon", value: "12" }), gn = await t.art.evaluate(geo, none.sel);
        t.eq(gn.svgs.length, 0, "an icon companion with nothing to draw is dropped, the figure stays");
      }
    },
    {
      name: "honesty: an unsourced figure carries the «رسم توضيحي» tag (36 px), a sourced one a quiet «المصدر» chip with the first source, an ordinal numeral neither; a share that cannot be drawn drops the waffle",
      async run(t) {
        const chip = async (o, a = ANCHORS.waffle) => { const r = await draw(t, a, o), g = await t.art.evaluate(geo, r.sel); return { g, chip: g.labels.find((l) => l.role === "chip") || null, r }; };
        let c = await chip({});
        t.eq(c.chip && c.chip.text, "رسم توضيحي", "no source: the illustrative tag"); t.gte(c.chip.px, 34, "visible tag, at least 34 px"); t.gte(c.chip.floor, 36, "Arabic label floor 36");
        c = await chip({ slide: SRC, sources: SOURCES }); t.eq(c.chip.text, "المصدر: WHO 2024", "sourced: the first source's short label");
        c = await chip({ slide: { ...SRC, sourceIds: ["s1", "s2"] }, sources: { s1: "WHO", s2: "UN" } }); t.eq(c.chip.text, "المصدر: WHO", "two sources: the first one");
        c = await chip({ slide: SRC, sources: {} }); t.eq(c.chip.text, "المصدر: s1", "a source with no short label shows its id");
        c = await chip({ rtl: false, slide: SRC, sources: SOURCES }); t.eq(c.chip.text, "Source: WHO 2024", "English source chip");
        c = await chip({ rtl: false }); t.eq(c.chip.text, "Illustrative", "English tag");
        c = await chip({ slide: { id: "s05", type: "item", ord: 3 } }, { kind: "numeral", value: "3", companion: "none" }); t.eq(c.chip, null, "an ordinal numeral on an item slide is not a claim: no chip");
        c = await chip({ slide: { id: "s05", type: "stat" } }, { kind: "numeral", value: "3", companion: "none" }); t.ok(c.chip, "the same numeral on a stat slide is a claim and is tagged");
        c = await chip({}, { kind: "numeral", value: "250", unit: "جنيه", companion: "waffle" });
        t.eq(c.g.svgs.length, 0, "250 جنيه cannot be a share of 100: no waffle is drawn"); t.eq(c.g.labels.map((l) => l.role), ["numeral", "title", "chip"], "the figure, its unit and the tag stay");
        c = await chip({}, { kind: "numeral", value: "20", companion: "bar", of: 10 }); t.eq(c.g.svgs.length, 0, "20 of 10 is not a share: no bar");
      }
    },
    {
      name: "data: anchor.value and unit, else slide.number; labels keep their order and texts in labelsOnly mode; Western digits sit in an LTR run; a given Arabic-Indic digit string is kept",
      async run(t) {
        const r = await draw(t, { kind: "numeral", companion: "none" }, { slide: { id: "s05", type: "stat", number: { value: "40", unit: "ألف" } }, rtl: true }), g = await t.art.evaluate(geo, r.sel);
        t.eq(g.labels.map((l) => [l.role, l.text, l.index]), [["numeral", "40", 0], ["title", "ألف", 1], ["chip", "رسم توضيحي", 2]], "slide.number is the fallback");
        t.ok(/<bdi dir="ltr"/.test(g.labels[0].html), "the digits are an isolated LTR run");
        t.eq(g.labels.map((l) => l.key), ["s05.art.0", "s05.art.1", "s05.art.2"], "keys sNN.art.<i> in order");
        const win = await draw(t, { kind: "numeral", companion: "none", value: "9", unit: "x" }, { slide: { id: "s05", type: "stat", number: { value: "40", unit: "ألف" } } }), gw = await t.art.evaluate(geo, win.sel);
        t.eq([gw.labels[0].text, gw.labels[1].text], ["9", "x"], "the anchor's own value wins over slide.number");
        const ar = await draw(t, { kind: "numeral", companion: "none", value: "٣٠" }, { digits: "arabic-indic" }), ga = await t.art.evaluate(geo, ar.sel);
        t.eq(ga.labels[0].text, "٣٠", "Arabic-Indic digits are kept, one digit system");
        for (const a of Object.values(ANCHORS)) {
          const full = await draw(t, a, { slide: SRC, sources: SOURCES }), only = await t.art.evaluate(([a, o]) => { const c = __art.ctx(Object.assign({ slide: o.slide, sources: o.sources, labelsOnly: true })); c.labelsOnly = true; const r = CS.art.build(a, c); return { el: r.el, boxes: r.boxes, labels: r.labels.map((l) => [l.role, l.text, l.index]) }; }, [a, { slide: SRC, sources: SOURCES }]);
          t.eq(only.labels, full.labels.map((l) => [l.role, l.text, l.index]), "labelsOnly returns the same labels in the same order");
          t.eq([only.el, only.boxes], [null, []], "labelsOnly builds no geometry");
        }
      }
    },
    {
      name: "size rules: a lone figure 360-520 px and at most the box width, the burst only where it leaves 280 px, an impossible box builds nothing; no letter-spacing, justify, italic or opacity on any word",
      async run(t) {
        const px = async (a, o) => { const r = await draw(t, a, o); return r ? (await t.art.evaluate(geo, r.sel)).labels[0].px : null; };
        const lone = { slide: SRC, sources: SOURCES, preset: "swiss" };
        t.ok((await px({ kind: "numeral", value: "8", companion: "none" }, { ...lone, box: { w: 852, h: 560 } })) >= 360, "a one-digit figure is large");
        t.ok((await px({ kind: "numeral", value: "100", companion: "none" }, lone)) >= 280, "three digits: the 70% width budget leaves about 284 px, above the 280 range floor");
        t.ok((await px({ kind: "numeral", value: "30%", companion: "none" }, lone)) >= 200, "30% keeps the 200 px floor inside 70% of the box");
        t.eq(await px({ kind: "numeral", value: "1234567890", companion: "none" }, { ...lone, box: { w: 852, h: 300 } }), null, "ten digits in a 300 px box: below the 200 px floor, no anchor");
        t.eq(await draw(t, ANCHORS.waffle, { box: { w: 852, h: 150 } }), null, "a 150 px box holds nothing");
        const tall = await draw(t, ANCHORS.waffle, { preset: "creator", box: { w: 852, h: 600 } }), gt = await t.art.evaluate(geo, tall.sel);
        t.ok(gt.owners >= 1, "creator on a 600 px box: the starburst sticker is an owner behind the figure"); t.gte(gt.labels[0].px, 280);
        const thin = await draw(t, ANCHORS.waffle, { preset: "creator", box: WIDE }), gn = await t.art.evaluate(geo, thin.sel);
        t.eq(gn.owners, 0, "on a 460 px box the burst would squeeze the figure below 280 px: it is dropped, not shrunk");
        const forced = await draw(t, { ...ANCHORS.none, value: "8", treatment: "badge" }, { preset: "swiss", box: { w: 852, h: 560 } }), gf = await t.art.evaluate(geo, forced.sel);
        t.ok(gf.owners >= 1, "treatment badge asks for the burst on any preset"); const bare = await draw(t, { ...ANCHORS.none, value: "8", treatment: "bare" }, { preset: "creator", box: { w: 852, h: 560 } });
        t.eq((await t.art.evaluate(geo, bare.sel)).owners, 0, "treatment bare removes the creator default burst");
        const roles = await draw(t, ANCHORS.waffle, { slide: SRC, sources: SOURCES, preset: "poster" }), gr = await t.art.evaluate(geo, roles.sel);
        t.eq(gr.labels.map((l) => l.role), ["numeral", "title", "chip"]); t.ok(gr.labels.every((l) => l.jus !== "inter-word" && l.jus !== "distribute"), "no justification");
      }
    },
    {
      name: "share: only a figure that says a share draws one (n%, n/m, filled of, a % or من N unit): 28/30 is 93%, never 28%, 8/10 is 80%; anything ambiguous gives none",
      async run(t) {
        const S = (a, v, u, want) => [a, v, u, want];
        const cases = [
          S({}, "28/30", "", 28 / 30), S({}, "8/10", "", 0.8), S({}, "1/3", "", 1 / 3), S({}, "28 / 30", "", 28 / 30), S({}, "٢٨/٣٠", "", 28 / 30), S({}, "30%", "", 0.3), S({}, "٣٠٪", "", 0.3), S({}, "8.5%", "", 0.085),
          S({}, "30", "%", 0.3), S({}, "74", "٪", 0.74), S({}, "30", "percent", 0.3), S({}, "30", "بالمية", 0.3), S({}, "8", "من كل 100", 0.08), S({}, "7", "من كل 10", 0.7), S({}, "7", "من 10", 0.7), S({}, "7", "out of 10", 0.7),
          S({ of: 20 }, "9", "", 0.45), S({ of: 20 }, "9", "ساعة", 0.45), S({ filled: 3, of: 10 }, "7", "", 0.3), S({ filled: 72 }, "72", "ساعة", 0.72), S({ filled: 28, of: 30 }, "28/30", "", 28 / 30),
          S({}, "30", "", null), S({}, "12", "ساعة", null), S({}, "12 ساعة", "", null), S({}, "2,500", "", null), S({}, "1,5", "%", null), S({}, "30%x", "", null), S({}, "abc", "", null), S({}, "150%", "", null),
          S({}, "5/0", "", null), S({}, "7/5", "", null), S({}, "-3", "%", null), S({}, "", "", null), S({ filled: 12, of: 10 }, "x", "", null), S({ filled: "x" }, "3", "", null), S({}, "8", "من كل 100x", null)
        ];
        const out = await t.art.evaluate((cs) => cs.map(([a, v, u]) => CS.art.chart.share(a, v, u)), cases.map((c) => c.slice(0, 3)));
        cases.forEach(([a, v, u, want], i) => { const id = JSON.stringify([a, v, u]); if (want == null) t.eq(out[i], null, id + " says no share"); else t.near(out[i], want, 1e-9, id + " is " + want); });
      }
    },
    {
      name: "boundary rules G1/G2: every mark of the waffle and the bar companion, filled and empty, has a 3 px outline at 3:1 or its fill at 3:1 on the ground (six DNAs x three tones), and the filled marks differ from the empty ones",
      async run(t) {
        for (const preset of PRESETS) for (const tone of TONES) for (const [sub, a, box] of [["waffle", ANCHORS.waffle, WIDE], ["bar", ANCHORS.bar, { w: 852, h: 520 }]]) {
          const id = [sub, preset, tone].join("/"), r = await draw(t, a, { preset, tone, box, slide: SRC, sources: SOURCES }), svgs = await t.art.evaluate(marksG, [r.sel, preset, tone]);
          const m = svgs.find((v) => v.paths.length === 2 && (sub === "waffle" ? v.w >= 316 && v.w <= 416 : v.w === 852));
          t.ok(m, id + ": the marks svg");
          m.paths.forEach((p, k) => t.ok(boundaryOk(p), id + ": " + (k ? "filled" : "empty") + " marks pass G1/G2 " + JSON.stringify(p)));
          t.gte(m.cOO, 1.5, id + ": the filled marks differ from the empty ones (" + m.cOO + ":1)");
        }
      }
    },
    {
      name: "width budget: the figure box is at most 70% of the box whatever the width or DNA, a value that cannot keep 200 px inside it builds nothing (1000 gets a 594 px box, 12345 and 28/30 get none)",
      async run(t) {
        for (const W of [852, 700, 560]) for (const preset of ["swiss", "creator", "poster"]) for (const v of ["8", "30", "30%", "100", "1000", "250", "3.5%", "8/10"]) {
          const id = W + "/" + preset + "/" + v, r = await draw(t, { kind: "numeral", value: v, companion: "none" }, { preset, slide: SRC, sources: SOURCES, box: { w: W, h: 720 } });
          const need = await t.art.evaluate((s) => CS.art.chart.ew(s, true) * 206, v), cap = Math.floor(W * 0.7);
          if (!r) { t.ok(need > cap - 2, id + ": refused only because 200 px does not fit " + cap + " px (" + need + ")"); continue; }
          t.ok(need <= cap + 2, id + ": built, so 200 px fits");
          const g = await t.art.evaluate(geo, r.sel), fig = g.labels[0];
          t.lte(fig.box.w, cap + 0.01, id + ": figure box " + fig.box.w + " <= 70% of " + W); t.gte(fig.px, 200, id + ": 200 px floor"); t.ok(!fig.over, id + ": the figure fits its own box once fit has run");
          t.lte(r.boxes[0].w, cap + 0.01, id + ": the measured box agrees");
        }
        const wide = await draw(t, { kind: "numeral", value: "1000", companion: "none" }, { slide: SRC, sources: SOURCES, box: { w: 852, h: 720 } }), gw = await t.art.evaluate(geo, wide.sel);
        t.lte(gw.labels[0].box.w, 596.4, "1000 in an 852 px zone: at most 596.4 px (it was 852)");
        for (const v of ["12345", "2,500", "28/30", "123456789"]) t.eq(await draw(t, { kind: "numeral", value: v, companion: "none" }, { slide: SRC, sources: SOURCES, box: { w: 852, h: 720 } }), null, v + ": cannot keep 200 px inside 70% of 852 px: no anchor");
        const burst = await draw(t, { kind: "numeral", value: "8", companion: "none", treatment: "badge" }, { preset: "creator", slide: SRC, sources: SOURCES, box: { w: 560, h: 720 } }), gb = await t.art.evaluate(geo, burst.sel);
        t.ok(gb.owners >= 1 && gb.labels[0].box.w <= 392.01, "the figure in a burst keeps the budget too");
      }
    },
    {
      name: "unsourced share: a figure that says a share and has no source is drawn as an illustrative waffle with the «رسم توضيحي» tag; where the waffle cannot fit or the data is no share the figure stays alone with the tag; sourced, ordinal and explicit-companion figures are left alone",
      async run(t) {
        const cells = async (a, o) => { const r = await draw(t, a, o), g = await t.art.evaluate(geo, r.sel), w = waffleOf(g); return { g, w, n: w ? (w.paths[1].d.match(/M/g) || []).length : 0, off: w ? (w.paths[0].d.match(/M/g) || []).length : 0, tag: g.labels.find((l) => l.role === "chip") || null }; };
        for (const preset of PRESETS) {
          const a = await cells({ kind: "numeral", value: "8", unit: "من كل 100", companion: "none" }, { preset, box: WIDE });
          t.eq([a.n, a.off], [8, 92], preset + ": 8 of 100 is drawn as a waffle"); t.eq(a.tag && a.tag.text, "رسم توضيحي", preset + ": with the tag"); t.gte(a.tag.px, 34, "the tag is at least 34 px");
        }
        let c = await cells({ kind: "numeral", value: "30%", companion: "none" }, { box: TALL });
        t.eq([c.n, c.off, c.tag && c.tag.text], [30, 70, "رسم توضيحي"], "30% in a 720 px box: 30 of 100 cells, tagged");
        c = await cells({ kind: "numeral", value: "3/4", companion: "none" }, { box: TALL }); t.eq([c.n, c.off], [75, 25], "3/4: 75 cells");
        c = await cells({ kind: "numeral", value: "30", unit: "%", companion: "none" }, { box: TALL }); t.eq(c.n, 30, "value 30 with the unit %: 30 cells");
        c = await cells({ kind: "numeral", value: "30%", companion: "none" }, { box: TALL, rtl: false }); t.eq([c.n, c.tag.text], [30, "Illustrative"], "an English deck: tagged Illustrative");
        c = await cells({ kind: "numeral", value: "30%", companion: "none" }, { box: WIDE });
        t.ok(!c.w && c.g.svgs.length === 0 && c.tag && c.tag.text === "رسم توضيحي", "30% in a 460 px box: the waffle would leave the figure under 280 px, so the figure stays alone with the tag");
        c = await cells({ kind: "numeral", value: "40", unit: "ألف", companion: "none" }, { box: TALL }); t.ok(!c.w && c.tag, "not a share (40 ألف): no waffle, the tag stays");
        c = await cells({ kind: "numeral", value: "12", companion: "none" }, { box: TALL }); t.ok(!c.w && c.tag, "a bare 12 says no share: no waffle, the tag stays");
        c = await cells({ kind: "numeral", value: "30%", companion: "none" }, { box: TALL, slide: SRC, sources: SOURCES }); t.ok(!c.w && c.tag.text === "المصدر: WHO 2024", "sourced: the figure alone with its source chip");
        c = await cells({ kind: "numeral", value: "3", companion: "none" }, { box: TALL, slide: { id: "s05", type: "item", ord: 3 } }); t.ok(!c.w && !c.tag, "an ordinal on an item slide is no claim: no waffle, no tag");
        c = await cells({ kind: "numeral", value: "30%", companion: "bar" }, { box: TALL, preset: "swiss" }); t.ok(!c.w && c.g.svgs.some((v) => v.w === 852 && v.paths.length === 2) && c.tag, "an explicit bar companion stays a bar (tagged)");
        c = await cells({ kind: "numeral", value: "3", unit: "مكالمات", companion: "icon", object: "phone" }, { box: TALL, preset: "creator" }); t.ok(!c.w && c.g.svgs.length >= 1 && c.tag, "an explicit icon companion stays an icon (tagged)");
        const a1 = await draw(t, { kind: "numeral", value: "30%", companion: "none" }, { box: TALL }), a2 = await draw(t, { kind: "numeral", value: "30%", companion: "waffle" }, { box: TALL });
        t.eq(a1.html, a2.html, "the unsourced figure is byte for byte the explicit waffle");
      }
    },
    {
      name: "measurement interface: the real CS.visual.deadSpace sees a lone numeral as an anchor, a burst as an owner holding the figure (fill, border, ownerOf), unit and chip as text; each box is where the DOM puts its label",
      async run(t) {
        const ZONE = { w: 852, h: 888 }, ORG = { x: 0, y: 100 };
        const probe = async (anchor, o) => {
          const box = { ...(o.box || WIDE), ...ORG }, r = await draw(t, anchor, { slide: SRC, sources: SOURCES, ...o, box });
          return { r, g: await t.art.evaluate(geo, r.sel), chip: await t.art.evaluate(chipRect, r.sel), ds: await t.art.evaluate(([b, z]) => CS.visual.deadSpace(b, z), [r.boxes, ZONE]) };
        };
        const near = (a, b, id) => { for (const k of ["x", "y", "w", "h"]) t.near(a[k], b[k], 1.6, id + " " + k); };
        const textBoxes = (r) => r.boxes.filter((b) => b.kind === "text");
        for (const rtl of [true, false]) for (const preset of ["swiss", "creator", "poster"]) {
          for (const [name, a] of [["lone", { kind: "numeral", value: "3", unit: "مكالمات", companion: "none" }], ["under", { kind: "numeral", value: "8", unit: "من كل 100", companion: "waffle" }], ["30%", ANCHORS.none]]) {
            const id = [rtl ? "rtl" : "ltr", preset, name].join("/"), { r, g, chip, ds } = await probe(a, { preset, rtl, box: name === "30%" ? WIDE : TALL }), tb = textBoxes(r);
            const fig = tb[0], texts = g.labels.filter((l) => l.role !== "chip");
            t.eq([fig.kind, fig.anchor], ["text", true], id + ": the figure is an anchor");
            t.gte(ds.anchorShare, 5, id + ": the real measure counts the figure (" + ds.anchorShare + "% anchored)");
            texts.forEach((l, i) => near(tb[i], { x: l.box.x + 0, y: l.box.y + ORG.y, w: l.box.w, h: l.box.h }, id + ": " + l.role + " box = its label"));
            near(tb[tb.length - 1], { x: chip.x, y: chip.y + ORG.y, w: chip.w, h: chip.h }, id + ": the chip box = its pill");
            const unit = g.labels.find((l) => l.role === "title");
            if (unit) { const f = g.labels[0].box, u = unit.box, side = u.y + u.h <= f.y + 0.5 || u.y >= f.y + f.h - 0.5 ? "under" : "beside"; if (side === "beside") t.ok(rtl ? u.x + u.w <= f.x + 0.5 : u.x >= f.x + f.w - 0.5, id + ": the unit follows the figure in reading order"); }
          }
        }
        for (const [preset, v] of [["creator", "8"], ["creator", "30"], ["poster", "8"]]) {
          const id = "burst/" + preset + "/" + v, { r, g, ds } = await probe({ kind: "numeral", value: v, companion: "none", treatment: "badge" }, { preset, box: { w: 852, h: 720 } });
          const own = r.boxes.find((b) => b.kind === "owner"), num = r.boxes.find((b) => b.kind === "text" && b.anchor);
          t.ok(own && own.id === "b" && own.fill === 1 && own.border >= 3, id + ": an owner with its fill and border " + JSON.stringify(own));
          t.eq([num.ownerOf, num.anchor], ["b", true], id + ": the figure is held by the owner and anchors");
          const star = g.svgs.find((s) => s.fig && s.paths.length >= 1 && s.w > 150);
          t.ok(own.x - 0 >= star.x - 0.5 && own.x + own.w <= star.x + star.w + 0.5 && own.y - ORG.y >= star.y - 0.5 && own.y - ORG.y + own.h <= star.y + star.h + 0.5, id + ": the owner lies inside the drawn star");
          t.eq(ds.owners.map((o) => [o.id, o.ok, o.meta]), [["b", true, "ok"]], id + ": the real measure agrees the star's core is owned " + JSON.stringify(ds.owners));
          t.gte(ds.owners[0].rows, 65, id + ": rows held"); t.gte(ds.owners[0].cols, 65, id + ": columns held"); t.gte(ds.anchorShare, 5, id + ": anchored");
        }
        for (const [name, a, o, kind] of [["waffle", ANCHORS.waffle, { preset: "poster", box: WIDE }, "ink"], ["bar", ANCHORS.bar, { preset: "swiss", box: { w: 852, h: 520 } }, "ink"], ["icon", ANCHORS.icon, { preset: "creator", box: WIDE }, "ink"]]) {
          const { r, g, ds } = await probe(a, o), comp = r.boxes.filter((b) => b.kind === kind).pop(), svg = g.svgs.find((s) => !s.fig && s.w > 100 && s.paths.length);
          t.ok(comp && svg, name + ": the companion has a box"); near(comp, { x: svg.x, y: svg.y + ORG.y, w: svg.w, h: svg.h }, name + ": companion box = its drawing"); t.ok(ds.anchorShare > 0 && ds.owners.length === 0, name + ": an ink mark, no owner claimed");
        }
      }
    },
    {
      name: "source chip: a short label shows whole, a long one gives way to the source id, an id too long for any chip refuses the anchor; the chip stays inside its column and apart from the companion, both directions and layouts",
      async run(t) {
        const LONG = "WHO Global Health Observatory annual statistical report 2024 edition", MID = "المصدر الإحصائي السنوي للصحة العالمية والبيانات";
        const hit2 = (a, b) => a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5;
        for (const rtl of [true, false]) for (const [label, whole] of [["WHO 2024", true], ["UN 2023", true], [MID, false], [LONG, false]]) for (const [name, a, box] of [["row", ANCHORS.waffle, WIDE], ["under", { kind: "numeral", value: "30%", companion: "waffle" }, TALL], ["lone", { kind: "numeral", value: "30%", companion: "none" }, WIDE]]) {
          const id = [rtl ? "rtl" : "ltr", name, label.slice(0, 12)].join("/"), r = await draw(t, a, { rtl, box, slide: SRC, sources: { s1: label } });
          t.ok(r, id + ": builds"); const g = await t.art.evaluate(geo, r.sel), chip = await t.art.evaluate(chipRect, r.sel), tag = g.labels.find((l) => l.role === "chip");
          const pre = rtl ? "المصدر: " : "Source: ";
          t.eq(tag.text, whole ? pre + label : pre + "s1", id + ": the label whole, or the id when it would not fit a chip");
          t.ok(chip.x >= -0.5 && chip.x + chip.w <= g.W + 0.5, id + ": the chip is inside the box " + JSON.stringify(chip)); t.ok(!tag.over, id + ": its words fit");
          const comp = g.svgs.find((s) => !s.fig && s.w > 100 && s.paths.length); if (comp) t.ok(!hit2(chip, comp), id + ": the chip does not touch the companion");
          t.ok(r.boxes.filter((b) => b.kind === "text").every((b) => b.x >= -0.5 && b.x + b.w <= g.W + 0.5), id + ": every measured text box is inside the box");
        }
        const sourceIds = ["s".repeat(32)];
        for (const a of [ANCHORS.none, ANCHORS.waffle]) t.eq(await draw(t, a, { slide: { id: "s05", type: "stat", sourceIds }, sources: {} }), null, "a 32-character source id fits no chip: the numeral builds nothing (never a chip beyond the box)");
        const narrow = await draw(t, ANCHORS.waffle, { slide: SRC, sources: { s1: "WHO 2024 Global Reports" }, box: WIDE }), gn = await t.art.evaluate(geo, narrow.sel);
        t.ok(gn.svgs.some((s) => !s.fig && s.w > 100), "a chip wider than the figure column but not than the box: the waffle stays and the label gives way to the id or the layout changes, never an overlap");
      }
    },
    {
      name: "fuzz: 600 seeded numerals (values, units, companions, treatments, sources, boxes 300-1000 x 150-950, both directions): none throws, every box is finite and inside the box, the figure is at most 70% wide, no text box meets another or a companion; 30 drawn ones keep their words inside their boxes after fit",
      async run(t) {
        const gen = (seed) => {
          let q = seed; const rnd = () => (q = (q * 1103515245 + 12345) % 2147483648) / 2147483648, pick = (a) => a[Math.floor(rnd() * a.length)], out = [];
          const vals = ["8", "30%", "٣٠٪", "100", "1000", "28/30", "8/10", "3/4", "2,500", "12345", "0", "0%", "150%", "7.5", "abc", "12 ساعة", "5/0", "99.9%", "1"], units = ["", "%", "من كل 100", "ساعة", "من كل 10", "جنيه مصري كامل", "x"];
          for (let i = 0; i < 600; i++) {
            const comp = pick(["none", "waffle", "bar", "icon"]);
            out.push({ a: { kind: "numeral", value: pick(vals), unit: pick(units), companion: comp, ...(comp === "icon" ? { icon: "clock" } : {}), ...(rnd() < 0.3 ? { treatment: "badge" } : {}), ...(rnd() < 0.2 ? { filled: Math.floor(rnd() * 100), of: pick([10, 100, 20]) } : {}) },
              W: 300 + Math.floor(rnd() * 700), H: 150 + Math.floor(rnd() * 800), preset: pick(PRESETS), rtl: rnd() < 0.5, slide: pick([STAT, SRC, { id: "s05", type: "item" }]), label: pick(["WHO 2024", "A very long source label that goes on and on and on and on"]) });
          }
          return out;
        };
        const cases = gen(7), res = await t.art.evaluate((cs) => {
          const bad = []; let built = 0;
          cs.forEach((k, i) => {
            const c = __art.ctx({ preset: k.preset, rtl: k.rtl, box: { w: k.W, h: k.H, x: 0, y: 100 }, slide: k.slide, sources: { s1: k.label } });
            let r; try { r = CS.art.build(k.a, c); } catch (e) { bad.push([i, "throws " + e.message]); return; }
            if (!r) return; built++;
            const inside = (b) => [b.x, b.y, b.w, b.h].every(Number.isFinite) && b.x >= -1 && b.y >= 99 && b.x + b.w <= k.W + 1 && b.y + b.h <= 100 + k.H + 1, hitb = (A, B) => A.x < B.x + B.w - 1 && B.x < A.x + A.w - 1 && A.y < B.y + B.h - 1 && B.y < A.y + A.h - 1;
            r.boxes.forEach((b) => { if (!inside(b)) bad.push([i, "outside", b]); });
            const fig = r.boxes.find((b) => b.kind === "text" && b.anchor); if (fig && fig.w > Math.floor(k.W * 0.7) + 0.01) bad.push([i, "wider than 70%", fig.w, k.W]);
            const tx = r.boxes.filter((b) => b.kind === "text"), ink = r.boxes.filter((b) => b.kind === "ink");
            tx.forEach((A, p) => { tx.slice(p + 1).forEach((B) => { if (hitb(A, B)) bad.push([i, "text meets text", A, B]); }); ink.forEach((B) => { if (hitb(A, B)) bad.push([i, "text meets companion", A, B]); }); });
          });
          return { built, bad: bad.slice(0, 5), nbad: bad.length };
        }, cases);
        t.eq(res.nbad, 0, "no fuzz case misbehaves " + JSON.stringify(res.bad)); t.gte(res.built, 100, "the sweep builds plenty of anchors (" + res.built + ")");
        let drawn = 0;
        for (const k of cases) {
          if (drawn >= 30) break;
          const r = await draw(t, k.a, { preset: k.preset, rtl: k.rtl, slide: k.slide, sources: { s1: k.label }, box: { w: k.W, h: k.H } });
          if (!r) continue; drawn++;
          const g = await t.art.evaluate(geo, r.sel), id = JSON.stringify([k.a.value, k.a.unit, k.a.companion, k.W, k.H, k.preset, k.rtl]);
          for (const l of g.labels) { t.ok(!l.over, id + ": the words of " + l.role + " fit their box after fit (" + l.px + " px)"); t.ok(l.ink.x >= -1 && l.ink.y >= -1 && l.ink.x + l.ink.w <= g.W + 1 && l.ink.y + l.ink.h <= g.H + 1, id + ": " + l.role + " inside the box " + JSON.stringify(l.ink)); }
          t.lte(g.labels[0].box.w, Math.floor(k.W * 0.7) + 0.01, id + ": the figure keeps the 70% budget");
        }
        t.gte(drawn, 20, "enough drawn cases (" + drawn + ")");
      }
    },
    {
      name: "load order: manifest.json lists chart.js before numeral.js; numeral.js throws E_ART_REGISTER without CS.art.chart and registers its four subs with it",
      async run(t) {
        const files = JSON.parse(fs.readFileSync(path.join(ART_SRC, "manifest.json"), "utf8")).files;
        t.ok(files.indexOf("chart.js") >= 0 && files.indexOf("chart.js") < files.indexOf("numeral.js"), "chart.js comes first in the manifest");
        const r = await t.art.evaluate((code) => {
          const reg = [], fake = (chart) => ({ art: { kit: CS.art.kit, chart, _: CS.art._, register: (k, b, s) => reg.push([k, s]) } });
          let err = null;
          try { new Function("CS", code)(fake(undefined)); } catch (e) { err = { code: e.code, msg: e.message }; }
          new Function("CS", code)(fake(CS.art.chart));
          return { err, reg };
        }, fs.readFileSync(path.join(ART_SRC, "numeral.js"), "utf8"));
        t.eq(r.err && r.err.code, "E_ART_REGISTER", "no helpers, no load"); t.eq(r.reg, [["numeral", ["none", "waffle", "bar", "icon"]]], "with the helpers it registers its four subs");
      }
    },
    {
      name: "deterministic: the same anchor builds the same bytes twice, in a fresh page state, with no clock or random read",
      async run(t) {
        for (const [sub, a] of Object.entries(ANCHORS)) for (const preset of ["creator", "poster", "heritage"]) {
          const x = await draw(t, a, { preset, slide: SRC, sources: SOURCES }), y = await draw(t, a, { preset, slide: SRC, sources: SOURCES });
          t.eq(x.html, y.html, sub + "/" + preset + ": identical markup"); t.eq(x.boxes, y.boxes, sub + "/" + preset + ": identical boxes");
        }
        for (const f of ["chart.js", "numeral.js"]) {   // GR-3: nothing that feeds markup reads a clock or a random source, no network, no telemetry
          const code = fs.readFileSync(path.join(ART_SRC, f), "utf8");
          t.ok(!/Math\.random|Date|performance\.|fetch\(|XMLHttpRequest|localStorage|sendBeacon|analytics/.test(code), f + ": no clock, random, network or telemetry");
        }
      }
    },
    {
      name: "contact sheets: the four subs on the six DNAs (base), the field and invert tones, the burst on a tall creator box and the honesty variants; one sheet parity >= 0.98 in both painters (numeral.png at 1x and the 130 px profile size)",
      async run(t) {
        const items = [];
        for (const preset of PRESETS) for (const sub of ["waffle", "none", "bar", "icon"]) items.push({ kind: "anchor", anchor: ANCHORS[sub], slide: sub === "none" || sub === "bar" ? SRC : STAT, sources: SOURCES, preset, box: sub === "bar" ? { w: 852, h: 520 } : WIDE, label: preset + " " + sub });
        const sh = await t.art.sheet({ cols: 4, cw: 880, ch: 560, items, title: "A6a numeral: none, waffle, bar and icon on the six DNAs (base tone); waffle and icon are tagged illustrative, none and bar carry a source" });
        await t.art.evaluate(settle, sh.sel); t.eq((await t.art.safe(sh)).violations, [], "numeral sheet is painter-safe");
        const png = await t.art.shot(sh, "art/numeral.png"); t.art.save("art/numeral-130.png", await t.art.small(png, Math.round(sh.w * 130 / 1080)));
        const p = await t.art.paintBoth(sh); t.gte(p.ssim, 0.98, "sheet: svg and replay painters agree (" + p.ssim.toFixed(4) + ")");
        const more = [];
        for (const [preset, tone] of [["creator", "field"], ["poster", "field"], ["swiss", "invert"], ["heritage", "base"], ["notebook", "invert"], ["interface", "field"]]) more.push({ kind: "anchor", anchor: ANCHORS.waffle, slide: STAT, preset, tone, box: WIDE, label: preset + " " + tone + " waffle" }, { kind: "anchor", anchor: ANCHORS.none, slide: SRC, sources: SOURCES, preset, tone, box: WIDE, label: preset + " " + tone + " none" });
        for (const preset of ["creator", "creator"]) more.push({ kind: "anchor", anchor: ANCHORS.waffle, slide: STAT, preset, box: { w: 852, h: 600 }, label: "creator burst 600" });
        more.push({ kind: "anchor", anchor: ANCHORS.waffle, slide: SRC, sources: { s1: "WHO Global Health Observatory annual statistical report 2024 edition" }, preset: "interface", box: WIDE, label: "long source -> its id" },
          { kind: "anchor", anchor: { kind: "numeral", value: "1000", companion: "none" }, slide: SRC, sources: SOURCES, preset: "heritage", box: WIDE, label: "1000: 70% width budget" });
        more.push({ kind: "anchor", anchor: { kind: "numeral", value: "8", companion: "none" }, slide: STAT, preset: "creator", box: { w: 852, h: 560 }, label: "creator burst alone" }, { kind: "anchor", anchor: { ...ANCHORS.waffle }, slide: STAT, preset: "creator", rtl: false, box: WIDE, label: "creator LTR (English) waffle" });
        const ms = await t.art.sheet({ cols: 4, cw: 880, ch: 620, items: more, title: "field and invert tones, the starburst sticker, an LTR deck" });
        await t.art.evaluate(settle, ms.sel); t.eq((await t.art.safe(ms)).violations, [], "tones sheet is painter-safe"); const png2 = await t.art.shot(ms, "art/numeral-tones.png"); t.art.save("art/numeral-tones-130.png", await t.art.small(png2, Math.round(ms.w * 130 / 1080)));
        const up = [{ kind: "anchor", anchor: { kind: "numeral", value: "30%", companion: "none" }, slide: STAT, preset: "poster", box: TALL, label: "unsourced 30% -> illustrative waffle" },
          { kind: "anchor", anchor: { kind: "numeral", value: "3/4", companion: "none" }, slide: STAT, preset: "swiss", tone: "invert", box: TALL, label: "unsourced 3/4 -> 75 cells" },
          { kind: "anchor", anchor: { kind: "numeral", value: "4/5", companion: "none" }, slide: STAT, preset: "interface", box: TALL, label: "unsourced 4/5 -> 80 cells" },
          { kind: "anchor", anchor: { kind: "numeral", value: "30%", companion: "none" }, slide: STAT, preset: "heritage", box: WIDE, label: "unsourced 30% in 460 px: the figure alone, tagged" },
          { kind: "anchor", anchor: { kind: "numeral", value: "8", companion: "none", treatment: "badge" }, slide: SRC, sources: SOURCES, preset: "creator", box: TALL, label: "creator burst: its core is the owner" },
          { kind: "anchor", anchor: { kind: "numeral", value: "30%", companion: "none" }, slide: STAT, preset: "notebook", rtl: false, box: TALL, label: "LTR (English) unsourced 30%" }];
        const us = await t.art.sheet({ cols: 3, cw: 880, ch: 770, items: up, title: "an unsourced share becomes an illustrative waffle (tall boxes), the fallback in a short box, the burst owner" });
        await t.art.evaluate(settle, us.sel); t.eq((await t.art.safe(us)).violations, [], "upgrade sheet is painter-safe"); const png3 = await t.art.shot(us, "art/numeral-upgrade.png"); t.art.save("art/numeral-upgrade-130.png", await t.art.small(png3, Math.round(us.w * 130 / 1080)));
        t.gte((await t.art.paintBoth(us)).ssim, 0.98, "upgrade sheet: svg and replay painters agree");
        const r = await draw(t, ANCHORS.waffle, { preset: "poster", slide: SRC, sources: SOURCES, png: true, box: WIDE });
        const pb = await t.art.paintBoth(r, { regions: [r.sel + " .cs-art", r.sel + " [data-role=numeral]", r.sel + " [data-role=chip]"] });
        for (const [preset, tone] of [["creator", "field"], ["swiss", "invert"]]) { const q = await draw(t, ANCHORS.waffle, { preset, tone, box: { w: 852, h: 600 } }), c = await t.art.paintBoth(q, { regions: [q.sel + " .cs-art"] }); t.gte(c.ssim, 0.98, preset + " " + tone + " slide parity"); t.gte(c.regions[0].ssim, 0.98, preset + " " + tone + " anchor region parity (" + c.regions[0].ssim.toFixed(4) + ")"); }
        t.gte(pb.ssim, 0.98, "complete slide parity (" + pb.ssim.toFixed(4) + ")"); for (const g of pb.regions) t.gte(g.ssim, 0.98, g.selector + " parity (" + g.ssim.toFixed(4) + ")");
      }
    }
  ]
};
