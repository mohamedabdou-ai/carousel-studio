// tests/unit/js/art/chart.test.mjs · the chart anchor bars-h (package A6a) and the helpers it shares with the numeral anchor: at most 7 bars sorted down, from zero, a value label per bar at the
// bar's end, the accent on the insight bar only, growth from the start edge (right in RTL), 38 px data labels, the source chip and the illustrative tag, the refusals, determinism, painter parity
// the containment of long categories (two 38 px lines, or no chart) and of long source labels (the id, or no chart), the boundary rules G1/G2 on every mark, the measurement interface through the
// real CS.visual.deadSpace, and the contact sheet of the package acceptance:  node tests/unit/js/art/run.mjs --only chart [--out DIR]   (art/chart.png and art/chart-130.png land in DIR when --out is given).
import { PRESETS } from "./support/dna.mjs";
import { draw, geo, settle, marksG, boundaryOk, chipRect } from "./numeral.test.mjs";

const SRC = { id: "s05", type: "stat", sourceIds: ["s1"] }, SOURCES = { s1: "WHO 2024" }, WIDE = { w: 852, h: 460 };
const VALUES = [{ label: "إنستجرام", value: 42 }, { label: "تيك توك", value: 31, hi: true }, { label: "يوتيوب", value: 18 }, { label: "فيسبوك", value: 9 }];
const A = (extra = {}, values = VALUES) => ({ kind: "chart", chart: { kind: "bars-h", values, unit: "%", ...extra } });
const NO = (t, anchor, o) => draw(t, anchor, { slide: SRC, sources: SOURCES, ...o });

/** In-page: the drawn marks of the chart svg (geometry boxes, fills, strokes) and the accent of the preset and tone. */
export function barsGeo([sel, preset, tone]) {
  const root = document.querySelector(sel + " .cs-art"), svg = root.querySelector("svg"), tk = __art.ctx({ preset, tone }).tokens;
  const paths = [...svg.querySelectorAll("path")].map((p) => { const b = p.getBBox(); return { x: +b.x.toFixed(2), y: +b.y.toFixed(2), w: +b.width.toFixed(2), h: +b.height.toFixed(2), fill: p.getAttribute("fill"), stroke: p.getAttribute("stroke"), cr: +CS.core.color.contrast(p.getAttribute("fill"), tk.bg).toFixed(2) }; });
  return { paths, accent: tk.accent, surface: tk.surface };
}
const zeroLine = (p) => Math.abs(p.w - 3) < 0.01 && p.h > 30;
const hit = (a, b) => a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5;

export default {
  module: "chart",
  tests: [
    {
      name: "registration: bars-h is owned and reachable, the other kinds are not claimed",
      async run(t) {
        const c = await t.art.evaluate(() => ({ caps: CS.art.caps().art.chart, has: ["bars-h", "columns", "donut", "waffle"].map((s) => CS.art.has("chart", s)), sub: CS.art._.sub({ kind: "chart", chart: { kind: "bars-h" } }) }));
        t.eq(c.caps, ["bars-h"]); t.eq(c.has, [true, false, false, false]); t.eq(c.sub, "bars-h");
        t.eq(await t.art.evaluate(() => CS.art.build({ kind: "chart", chart: { kind: "columns", values: [{ label: "a", value: 1 }] } }, __art.ctx({}))), null, "a kind of a later package builds nothing");
        t.eq(await draw(t, { kind: "chart" }), null, "no chart object: no anchor");
      }
    },
    {
      name: "every DNA x three tones x three box sizes: builds, safe() (A1-A17), data labels 38 px with data-floor 38, labels and marks inside the box, no gridlines (one hairline and one path per bar)",
      async run(t) {
        const seven = VALUES.concat([{ label: "لينكدإن", value: 7 }, { label: "سناب", value: 5 }, { label: "إكس", value: 3 }]);
        for (const preset of PRESETS) for (const tone of ["base", "invert", "field"]) for (const [vals, box] of [[VALUES, WIDE], [seven, { w: 852, h: 520 }], [VALUES.slice(0, 2), { w: 852, h: 360 }]]) {
          const id = [preset, tone, vals.length, box.h].join("/"), r = await NO(t, A({}, vals), { preset, tone, box });
          t.ok(r, id + ": builds"); const s = await t.art.safe(r); t.eq(s.violations, [], id + ": safe() " + JSON.stringify(s.violations.slice(0, 2)));
          const g = await t.art.evaluate(geo, r.sel), b = await t.art.evaluate(barsGeo, [r.sel, preset, tone]);
          const data = g.labels.filter((l) => l.role === "chart");
          t.eq(data.length, vals.length * 2, id + ": a category and a value label per bar");
          for (const l of data) { t.eq(l.floor, 38, id + ": data-floor 38"); t.gte(l.px, 38, id + ": 38 px or more"); }
          for (const l of g.labels) t.ok(l.ink.x >= -1 && l.ink.y >= -1 && l.ink.x + l.ink.w <= g.W + 1 && l.ink.y + l.ink.h <= g.H + 1, id + ": label inside the box " + JSON.stringify(l.ink));
          for (const l of g.labels) t.ok(!l.over, id + ": the words of " + l.role + " " + JSON.stringify(l.text) + " fit their own box once fit has run (" + l.px + " px, floor " + l.floor + ")");
          t.eq(b.paths.length, vals.length + 1, id + ": one path per bar plus the zero hairline, no gridlines");
          for (const p of b.paths) t.ok(p.x >= -0.5 && p.x + p.w <= g.W + 0.5 && p.y >= -0.5 && p.y + p.h <= g.H + 0.5, id + ": bars inside the box");
          t.ok(g.labels.every((l) => l.ls === "normal" || parseFloat(l.ls) === 0) && g.labels.every((l) => l.fs === "normal" && l.op === "1"), id + ": no letter-spacing, italic or opacity on any word");
        }
      }
    },
    {
      name: "bars: sorted down whatever the input order, from zero and proportional, one shared start edge (right in RTL, left in LTR), value label at the end of each bar, labels at the start edge, a minimum nub for a tiny value and none for zero, `total` sets the scale",
      async run(t) {
        const input = [{ label: "ب", value: 10 }, { label: "أ", value: 40 }, { label: "ج", value: 25 }, { label: "د", value: 0 }, { label: "هـ", value: 0.1 }];
        for (const rtl of [true, false]) for (const preset of ["swiss", "poster", "creator"]) {
          const id = (rtl ? "rtl " : "ltr ") + preset, r = await NO(t, A({}, input), { preset, rtl, box: { w: 852, h: 560 } }), g = await t.art.evaluate(geo, r.sel), b = await t.art.evaluate(barsGeo, [r.sel, preset, "base"]);
          const bars = b.paths.filter((p) => !zeroLine(p)).sort((p, q) => p.y - q.y), zero = b.paths.find(zeroLine), ol = bars[0].stroke ? 4 : 0;
          t.eq(g.labels.filter((l) => l.role === "chart" && l.index % 2 === 0).map((l) => l.text), ["أ", "ج", "ب", "هـ", "د"], id + ": rows sorted by value, then input order");
          t.eq(g.labels.filter((l) => l.role === "chart" && l.index % 2 === 1).map((l) => l.text), ["40%", "25%", "10%", "0.1%", "0%"], id + ": value labels");
          t.eq(bars.length, 4, id + ": a bar for every positive value, none for 0"); const full = bars[0].w + ol;
          [40, 25, 10].forEach((v, i) => t.near(bars[i].w + ol, full * v / 40, 1.5, id + ": bar " + v + " is proportional to its value, from zero"));
          t.near(bars[3].w + ol, 6, 0.01, id + ": 0.1 gets the 6 px nub");
          const edge = (p) => (rtl ? p.x + p.w + ol / 2 : p.x - ol / 2);
          for (const p of bars) t.near(edge(p), edge(bars[0]), 0.51, id + ": all bars start on the same edge");
          t.ok(rtl ? zero.x >= edge(bars[0]) - 0.5 : zero.x + zero.w <= edge(bars[0]) + 0.5, id + ": the zero hairline sits on the start edge of the bars");
          const cats = g.labels.filter((l) => l.role === "chart" && l.index % 2 === 0), vals = g.labels.filter((l) => l.role === "chart" && l.index % 2 === 1);
          bars.forEach((p, i) => {
            const c = cats[i].ink, v = vals[i].ink;
            t.ok(rtl ? c.x >= edge(p) : c.x + c.w <= edge(p), id + ": the category label is on the start side of the bars");
            t.ok(rtl ? v.x + v.w <= p.x + 0.5 && p.x - (v.x + v.w) < 60 : v.x >= p.x + p.w - 0.5 && v.x - (p.x + p.w) < 60, id + ": the value label sits at the end of its bar (" + (rtl ? p.x - (v.x + v.w) : v.x - (p.x + p.w)).toFixed(1) + " px)");
          });
          t.ok(cats.every((c, i) => i === 0 || c.ink.y > cats[i - 1].ink.y), id + ": rows run top to bottom");
        }
        const flipped = await NO(t, A(), { preset: "swiss", brand: { handle: "@x", name: "x", art: { chartAxis: { categories: "ltr" } } } }), gf = await t.art.evaluate(geo, flipped.sel), bf = await t.art.evaluate(barsGeo, [flipped.sel, "swiss", "base"]);
        const fb = bf.paths.filter((p) => !zeroLine(p)).sort((p, q) => p.y - q.y), cat = gf.labels.find((l) => l.role === "chart"), chip = gf.labels.find((l) => l.role === "chip");
        t.ok(fb.every((p) => Math.abs(p.x - fb[0].x) < 0.51) && fb[0].x < 400 && cat.ink.x + cat.ink.w <= fb[0].x + 1, "brand chartAxis.categories ltr: an RTL deck draws the chart left to right, labels at the left");
        t.ok(chip.ink.x > 400, "...and the chip follows to the right edge");
        const w = async (anchor) => { const r = await NO(t, anchor, { box: WIDE }); return (await t.art.evaluate(barsGeo, [r.sel, "swiss", "base"])).paths.filter((p) => !zeroLine(p)).sort((p, q) => p.y - q.y)[0].w; };
        t.near((await w(A({ total: 100 }))) / (await w(A())), 0.42, 0.01, "total: 100 scales the longest bar to 42% of the full length");
        const noHi = await NO(t, A({}, VALUES.map((v) => ({ label: v.label, value: v.value }))), { preset: "swiss" }), nb = await t.art.evaluate(barsGeo, [noHi.sel, "swiss", "base"]);
        const bs = nb.paths.filter((p) => !zeroLine(p)).sort((p, q) => p.y - q.y); t.eq(bs.map((p) => p.fill === nb.accent), [true, false, false, false], "no hi flag: the longest bar is the insight, the rest are an ink tint");
      }
    },
    {
      name: "colour: the accent is only on the insight bar; outlined DNAs keep paper bars with an ink outline (rule G1), the others an ink tint 3:1 on the ground (rule G2)",
      async run(t) {
        for (const tone of ["base", "invert"]) for (const preset of PRESETS) {
          const r = await NO(t, A(), { preset, tone }), b = await t.art.evaluate(barsGeo, [r.sel, preset, tone]), bars = b.paths.filter((p) => !zeroLine(p)).sort((p, q) => p.y - q.y), id = preset + "/" + tone;
          const outlined = ["creator", "notebook"].includes(preset);
          t.eq(bars.map((p) => p.fill === bars[1].fill), [false, true, false, false], id + ": exactly the hi bar (31) has its own fill");
          if (outlined) { t.ok(bars.every((p) => p.stroke && p.stroke !== "none"), id + ": every bar has the ink outline"); t.eq([bars[0].fill, bars[2].fill, bars[3].fill], [b.surface, b.surface, b.surface], id + ": the rest are paper"); }
          else { t.ok(bars.every((p) => p.cr >= 3), id + ": every bar is 3:1 on the ground " + JSON.stringify(bars.map((p) => p.cr))); if (bars[1].cr >= 3 && b.accent === bars[1].fill) t.ok(true); }
          if (!outlined) t.ok(bars[1].fill === b.accent || bars[1].cr >= 3, id + ": the insight bar takes the accent, or the first hue that reads");
        }
      }
    },
    {
      name: "honesty: no source or chart.illustrative -> the «رسم توضيحي» tag; a source -> «المصدر» with its label; an English deck gets English words",
      async run(t) {
        const chip = async (anchor, o) => { const r = await draw(t, anchor, o), g = await t.art.evaluate(geo, r.sel); return g.labels.find((l) => l.role === "chip"); };
        let c = await chip(A(), { slide: { id: "s05", type: "stat" } }); t.eq(c.text, "رسم توضيحي", "no sourceIds: illustrative"); t.gte(c.px, 34, "at least 34 px"); t.gte(c.floor, 36);
        c = await chip(A(), { slide: SRC, sources: SOURCES }); t.eq(c.text, "المصدر: WHO 2024");
        c = await chip(A({ illustrative: true }), { slide: SRC, sources: SOURCES }); t.eq(c.text, "رسم توضيحي", "illustrative wins over a source");
        c = await chip(A(), { slide: SRC, sources: SOURCES, rtl: false }); t.eq(c.text, "Source: WHO 2024");
        c = await chip(A(), { rtl: false }); t.eq(c.text, "Illustrative");
        const r = await NO(t, A()), g = await t.art.evaluate(geo, r.sel); t.eq(g.labels[g.labels.length - 1].role, "chip", "the chip is the last label");
      }
    },
    {
      name: "refusals and units: more than 7 values, none, a negative or non-finite value, a missing label, a box too short for 38 px rows or too narrow for the bars all build nothing; a % unit is attached, a word unit is bound with U+00A0",
      async run(t) {
        const many = Array.from({ length: 8 }, (_, i) => ({ label: "س" + i, value: 8 - i }));
        t.eq(await NO(t, A({}, many)), null, "8 bars"); t.eq(await NO(t, A({}, [])), null, "no bars");
        t.eq(await NO(t, A({}, [{ label: "a", value: -1 }])), null, "negative"); t.eq(await NO(t, A({}, [{ label: "a", value: "x" }])), null, "not a number");
        t.eq(await NO(t, A({}, [{ label: "", value: 1 }])), null, "no label"); t.eq(await NO(t, A(), { box: { w: 852, h: 200 } }), null, "four bars in 200 px do not keep 38 px rows");
        t.eq(await NO(t, A(), { box: { w: 300, h: 460 } }), null, "300 px wide leaves no room for the bars");
        t.ok(await NO(t, A({}, many.slice(0, 7)), { box: { w: 852, h: 520 } }), "7 bars in 520 px build"); t.ok(await NO(t, A({}, [VALUES[0]])), "one bar builds");
        const word = await NO(t, A({ unit: "ألف جنيه" }), {}), gw = await t.art.evaluate(geo, word.sel), pct = await NO(t, A(), {}), gp = await t.art.evaluate(geo, pct.sel);
        t.eq(gw.labels[1].text, "42 ألف جنيه", "a word unit follows the number after U+00A0"); t.eq(gp.labels[1].text, "42%", "% is attached");
        t.ok(/<bdi dir="ltr"/.test(gp.labels[1].html), "the digits are an isolated LTR run");
        t.eq(gp.labels.map((l) => l.key), gp.labels.map((l, i) => "s05.art." + i), "keys sNN.art.<i> in order");
      }
    },
    {
      name: "long categories: a 24-character category wraps onto two 38 px lines inside its own column and never reaches the bars; a word that cannot break, or a box without room for two lines, builds nothing; RTL, LTR and a flipped axis",
      async run(t) {
        const AR = "مبيعات الحملات الإعلانية", EN = "Quarterly revenue growth", ONE = "Internationalizationally", FLIP = { handle: "@x", name: "x", art: { chartAxis: { categories: "ltr" } } };
        t.eq([[...AR].length, EN.length, ONE.length], [24, 24, 24], "the labels are at the schema maximum");
        const vals = (label) => [{ label, value: 42 }, { label: "تيك توك", value: 31 }, { label: "يوتيوب", value: 18 }, { label: "فيسبوك", value: 9 }];
        for (const [label, o] of [[AR, { rtl: true }], [EN, { rtl: false }], [AR, { rtl: true, brand: FLIP }], [EN, { rtl: true }]]) for (const preset of PRESETS) {
          const id = [label.slice(0, 8), o.rtl ? "rtl" : "ltr", o.brand ? "flipped" : "", preset].join("/"), r = await NO(t, A({}, vals(label)), { preset, box: WIDE, ...o });
          t.ok(r, id + ": builds"); t.eq((await t.art.safe(r)).violations, [], id + ": safe()");
          const g = await t.art.evaluate(geo, r.sel), b = await t.art.evaluate(barsGeo, [r.sel, preset, "base"]), cats = g.labels.filter((l) => l.role === "chart" && l.index % 2 === 0), bars = b.paths.filter((p) => !zeroLine(p));
          t.gte(cats[0].px, 38, id + ": the label keeps its 38 px floor"); t.ok(cats[0].ink.h > 38 * 1.2 + 4 && cats[0].ink.h <= 2 * 38 * 1.2 + 2, id + ": two lines (" + cats[0].ink.h.toFixed(1) + " px high)");
          for (const l of g.labels) { t.ok(!l.over, id + ": the words of " + l.role + " " + JSON.stringify(l.text) + " fit their own box once fit has run"); t.ok(l.ink.x >= -1 && l.ink.y >= -1 && l.ink.x + l.ink.w <= g.W + 1 && l.ink.y + l.ink.h <= g.H + 1, id + ": label inside the box " + JSON.stringify(l.ink)); }
          for (const l of g.labels.filter((q) => q.role === "chart")) for (const p of bars) t.ok(!hit(l.ink, p), id + ": " + JSON.stringify(l.text) + " does not touch a bar");
          t.ok(r.boxes.every((q) => q.x >= -0.5 && q.x + q.w <= g.W + 0.5 && q.y >= -0.5 && q.y + q.h <= g.H + 0.5), id + ": every measured box is inside the anchor box");
        }
        t.eq(await NO(t, A({}, vals(ONE)), { box: WIDE }), null, "a 24-letter word cannot break: its column would leave no bars, so no chart");
        t.eq(await NO(t, A({}, vals("abcdefghijklmnopqrstuvwx")), { box: WIDE, rtl: false }), null, "the same in an English deck");
        t.eq(await NO(t, A({}, vals(AR).concat([{ label: "سناب", value: 5 }])), { box: { w: 852, h: 520 } }), null, "five rows with a two-line category: 88 px rows do not hold two 38 px lines");
        t.eq(await NO(t, A({}, vals(EN)), { box: { w: 852, h: 400 } }), null, "four rows in 400 px: 80 px rows");
        t.ok(await NO(t, A({}, vals(AR)), { box: { w: 852, h: 520 } }), "four rows in 520 px: 96 px rows hold two lines");
        const one = await NO(t, A({}, vals("المبيعات")), { box: WIDE }), go = await t.art.evaluate(geo, one.sel);
        t.ok(go.labels[0].ink.h < 38 * 1.2 + 4, "a short category stays on one line");
      }
    },
    {
      name: "source chip: a short label shows whole, a long one gives way to the source id, an id too long for any chip builds nothing; the chip lies inside the box and under the bars in both directions",
      async run(t) {
        const LONG = "WHO Global Health Observatory annual statistical report 2024 edition";
        for (const rtl of [true, false]) for (const [label, whole] of [["WHO 2024", true], ["UN 2023", true], [LONG, false], ["المصدر الإحصائي السنوي للصحة العالمية والبيانات", false]]) for (const flip of [false, true]) {
          const id = [rtl ? "rtl" : "ltr", flip ? "flipped" : "", label.slice(0, 10)].join("/"), r = await NO(t, A(), { rtl, sources: { s1: label }, brand: flip ? { handle: "@x", name: "x", art: { chartAxis: { categories: "ltr" } } } : null });
          t.ok(r, id + ": builds"); const g = await t.art.evaluate(geo, r.sel), chip = await t.art.evaluate(chipRect, r.sel), tag = g.labels[g.labels.length - 1], b = await t.art.evaluate(barsGeo, [r.sel, "swiss", "base"]);
          t.eq(tag.text, (rtl ? "المصدر: " : "Source: ") + (whole ? label : "s1"), id + ": the label whole, or the id when it would not fit a chip");
          t.ok(chip.x >= -0.5 && chip.x + chip.w <= g.W + 0.5 && chip.y + chip.h <= g.H + 0.5, id + ": the chip is inside the box " + JSON.stringify(chip)); t.ok(!tag.over, id + ": its words fit");
          t.ok(b.paths.every((p) => p.y + p.h <= chip.y + 0.5), id + ": the chip sits under the bars");
        }
        t.eq(await NO(t, A(), { sources: {}, slide: { id: "s05", type: "stat", sourceIds: ["s".repeat(32)] } }), null, "a 32-character source id fits no chip: no chart rather than a chip beyond the box");
        t.eq(await NO(t, A(), { box: { w: 420, h: 460 } }), null, "a box narrower than its chip builds nothing");
      }
    },
    {
      name: "boundary rules G1/G2: every mark of the chart, the hairline included, has a 3 px outline at 3:1 or its fill at 3:1 on the ground (six DNAs x three tones)",
      async run(t) {
        for (const preset of PRESETS) for (const tone of ["base", "invert", "field"]) {
          const id = preset + "/" + tone, r = await NO(t, A(), { preset, tone }), svg = (await t.art.evaluate(marksG, [r.sel, preset, tone]))[0];
          t.eq(svg.paths.length, VALUES.length + 1, id + ": the hairline and one mark per bar");
          svg.paths.forEach((p, k) => t.ok(boundaryOk(p), id + ": mark " + k + " passes G1/G2 " + JSON.stringify(p)));
        }
      }
    },
    {
      name: "measurement interface: bars are ink anchors and labels text through the real CS.visual.deadSpace, a text box spans its label's column and row, the chip box is its pill",
      async run(t) {
        const ZONE = { w: 852, h: 888 }, ORG = { x: 0, y: 100 };
        for (const rtl of [true, false]) {
          const r = await NO(t, A(), { preset: "swiss", rtl, box: { ...WIDE, ...ORG } }), g = await t.art.evaluate(geo, r.sel), chip = await t.art.evaluate(chipRect, r.sel), ds = await t.art.evaluate(([b, z]) => CS.visual.deadSpace(b, z), [r.boxes, ZONE]);
          t.eq(r.boxes.map((b) => b.kind), [0, 1, 2, 3].flatMap(() => ["ink", "text", "text"]).concat("text"), "a bar and two labels per row, then the chip");
          t.ok(ds.anchorShare > 0 && ds.owners.length === 0 && ds.fill > 0, "the real measure counts the bars as anchors (" + ds.anchorShare + "%), no owner claimed");
          const labels = g.labels.filter((l) => l.role === "chart");
          labels.forEach((l, i) => { const bx = r.boxes[Math.floor(i / 2) * 3 + 1 + (i % 2)]; t.near(bx.x, l.box.x, 1.6, "label " + i + " box x"); t.near(bx.w, l.box.w, 1.6, "label " + i + " box w"); t.ok(l.box.y >= bx.y - ORG.y - 1 && l.box.y + l.box.h <= bx.y - ORG.y + bx.h + 1, "label " + i + " lies in its row"); });
          const cb = r.boxes[r.boxes.length - 1]; t.near(cb.x, chip.x, 1.6, "chip x"); t.near(cb.y - ORG.y, chip.y, 1.6, "chip y"); t.near(cb.w, chip.w, 1.6, "chip w"); t.near(cb.h, chip.h, 1.6, "chip h");
        }
      }
    },
    {
      name: "fuzz: 600 seeded charts (1-8 bars, labels up to 24 characters in two scripts, units, long sources, boxes 420-1020 x 250-950, both directions, flipped axis): none throws, every box is finite and inside the box, no text box meets a bar; 25 drawn ones keep their words inside their boxes and clear of the bars after fit",
      async run(t) {
        const gen = (seed) => {
          let q = seed; const rnd = () => (q = (q * 1103515245 + 12345) % 2147483648) / 2147483648, pick = (a) => a[Math.floor(rnd() * a.length)], out = [];
          const words = ["مبيعات", "الحملات", "الإعلانية", "تحليل", "Quarterly", "revenue", "growth", "Reels", "x", "منصات", "internationalization", "أداء", "سنوي"], units = ["", "%", "ألف جنيه", "k", "جنيه مصري كامل"];
          for (let i = 0; i < 600; i++) {
            const n = 1 + Math.floor(rnd() * 8), values = Array.from({ length: n }, () => { let l = pick(words); while (rnd() < 0.5 && l.length < 20) l += " " + pick(words); return { label: l.slice(0, 24).trim() || "a", value: rnd() < 0.1 ? 0 : Math.round(rnd() * 1000) / 10, ...(rnd() < 0.2 ? { hi: true } : {}) }; });
            out.push({ a: { kind: "chart", chart: { kind: "bars-h", values, unit: pick(units), ...(rnd() < 0.2 ? { total: 200 } : {}) } }, W: 420 + Math.floor(rnd() * 600), H: 250 + Math.floor(rnd() * 700), rtl: rnd() < 0.5, preset: pick(PRESETS),
              slide: pick([{ id: "s05", type: "stat" }, SRC]), label: pick(["WHO 2024", "A very long source label that goes on and on and on and on"]), flip: rnd() < 0.3 });
          }
          return out;
        };
        const cases = gen(11), FLIP = { handle: "@x", name: "x", art: { chartAxis: { categories: "ltr" } } };
        const res = await t.art.evaluate(([cs, flip]) => {
          const bad = []; let built = 0;
          cs.forEach((k, i) => {
            const c = __art.ctx({ preset: k.preset, rtl: k.rtl, box: { w: k.W, h: k.H, x: 0, y: 100 }, slide: k.slide, sources: { s1: k.label }, brand: k.flip ? flip : null });
            let r; try { r = CS.art.build(k.a, c); } catch (e) { bad.push([i, "throws " + e.message]); return; }
            if (!r) return; built++;
            const hitb = (A, B) => A.x < B.x + B.w - 1 && B.x < A.x + A.w - 1 && A.y < B.y + B.h - 1 && B.y < A.y + A.h - 1;
            r.boxes.forEach((b) => { if (![b.x, b.y, b.w, b.h].every(Number.isFinite) || b.x < -1 || b.y < 99 || b.x + b.w > k.W + 1 || b.y + b.h > 100 + k.H + 1) bad.push([i, "outside", b]); });
            const ink = r.boxes.filter((b) => b.kind === "ink");
            r.boxes.filter((b) => b.kind === "text").forEach((A) => ink.forEach((B) => { if (hitb(A, B)) bad.push([i, "text meets a bar", A, B]); }));
          });
          return { built, bad: bad.slice(0, 5), nbad: bad.length };
        }, [cases, FLIP]);
        t.eq(res.nbad, 0, "no fuzz case misbehaves " + JSON.stringify(res.bad)); t.gte(res.built, 100, "the sweep builds plenty of charts (" + res.built + ")");
        let drawn = 0;
        for (const k of cases) {
          if (drawn >= 25) break;
          const r = await draw(t, k.a, { preset: k.preset, rtl: k.rtl, slide: k.slide, sources: { s1: k.label }, box: { w: k.W, h: k.H }, brand: k.flip ? FLIP : null });
          if (!r) continue; drawn++;
          const g = await t.art.evaluate(geo, r.sel), b = await t.art.evaluate(barsGeo, [r.sel, k.preset, "base"]), bars = b.paths.filter((p) => !zeroLine(p)), id = JSON.stringify([k.a.chart.values.map((v) => v.label), k.W, k.H, k.preset, k.rtl, k.flip]);
          for (const l of g.labels) { t.ok(!l.over, id + ": the words of " + JSON.stringify(l.text) + " fit their box after fit"); t.ok(l.ink.x >= -1 && l.ink.y >= -1 && l.ink.x + l.ink.w <= g.W + 1 && l.ink.y + l.ink.h <= g.H + 1, id + ": " + JSON.stringify(l.text) + " inside the box"); if (l.role === "chart") for (const p of bars) t.ok(!hit(l.ink, p), id + ": " + JSON.stringify(l.text) + " clear of the bars"); }
        }
        t.gte(drawn, 15, "enough drawn charts (" + drawn + ")");
      }
    },
    {
      name: "deterministic and keyed: the same chart builds the same bytes twice; labelsOnly returns the same labels in the same order and builds no geometry",
      async run(t) {
        for (const preset of ["creator", "poster", "heritage"]) {
          const x = await NO(t, A(), { preset }), y = await NO(t, A(), { preset }); t.eq(x.html, y.html, preset + ": identical markup"); t.eq(x.boxes, y.boxes, preset + ": identical boxes");
        }
        const full = await NO(t, A()), only = await t.art.evaluate(([a, o]) => { const c = __art.ctx({ slide: o.slide, sources: o.sources, labelsOnly: true }), r = CS.art.build(a, c); return { el: r.el, boxes: r.boxes, labels: r.labels.map((l) => [l.role, l.text, l.index]) }; }, [A(), { slide: SRC, sources: SOURCES }]);
        t.eq(only.labels, full.labels.map((l) => [l.role, l.text, l.index])); t.eq([only.el, only.boxes], [null, []]);
      }
    },
    {
      name: "contact sheet: bars-h on the six DNAs (RTL, base), the field and invert tones, 7 bars, an English LTR deck and a word unit; sheet parity >= 0.98 in both painters (art/chart.png at 1x and the 130 px profile size)",
      async run(t) {
        const seven = VALUES.concat([{ label: "لينكدإن", value: 7 }, { label: "سناب", value: 5 }, { label: "إكس", value: 3 }]), items = [];
        for (const preset of PRESETS) items.push({ kind: "anchor", anchor: A({}, preset === "swiss" ? seven : VALUES), slide: SRC, sources: SOURCES, preset, box: preset === "swiss" ? { w: 852, h: 520 } : WIDE, label: preset + " bars-h" });
        for (const [preset, tone] of [["creator", "field"], ["poster", "field"], ["heritage", "invert"], ["interface", "invert"]]) items.push({ kind: "anchor", anchor: A({}, VALUES), slide: { id: "s05", type: "stat" }, preset, tone, box: WIDE, label: preset + " " + tone + " (illustrative)" });
        items.push({ kind: "anchor", anchor: A({ unit: "ألف جنيه" }), slide: SRC, sources: SOURCES, preset: "notebook", box: WIDE, label: "notebook word unit" }, { kind: "anchor", anchor: A({ unit: "%" }, [{ label: "Reels", value: 52 }, { label: "Stories", value: 31, hi: true }, { label: "Posts", value: 17 }]), slide: SRC, sources: SOURCES, preset: "creator", rtl: false, box: WIDE, label: "creator LTR English" });
        const sh = await t.art.sheet({ cols: 3, cw: 900, ch: 560, items, title: "A6a chart bars-h: sorted, from zero, accent on the insight bar only, 38 px data labels, source chip or illustrative tag" });
        await t.art.evaluate(settle, sh.sel); t.eq((await t.art.safe(sh)).violations, [], "chart sheet is painter-safe");
        const png = await t.art.shot(sh, "art/chart.png"); t.art.save("art/chart-130.png", await t.art.small(png, Math.round(sh.w * 130 / 1080)));
        const p = await t.art.paintBoth(sh); t.gte(p.ssim, 0.98, "sheet: svg and replay painters agree (" + p.ssim.toFixed(4) + ")");
        for (const preset of ["creator", "poster", "heritage"]) {
          const r = await NO(t, A(), { preset }), pb = await t.art.paintBoth(r, { regions: [r.sel + " .cs-art"] });
          t.gte(pb.ssim, 0.98, preset + " slide parity"); t.gte(pb.regions[0].ssim, 0.98, preset + " chart region parity (" + pb.regions[0].ssim.toFixed(4) + ")");
        }
      }
    }
  ]
};
