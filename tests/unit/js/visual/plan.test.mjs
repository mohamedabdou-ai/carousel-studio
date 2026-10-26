// tests/unit/js/visual/plan.test.mjs · V2 PLAN-LITE: CS.visual.plan (spec 5.1-5.6, build plan V2 and r2 3.2).
// The planner is loaded the way the chunk wraps it (src/lib canon, then src/visual files) with the real data blocks (tests/visual/expected/support.mjs).
// Groups: shape, rules and budget of the sources, the empty cases, determinism, "never invents", numbers read whole (sign, grouping, decimals, ratios, series), the hard
// constraints H1-H8 (floors and fixed icons included) and every rung of the relaxation ladder (data overrides force each rung), the integer score and its terms,
// capabilities, worlds, brand, locks and stored partial anchors, tones, autoPreview and its invalidation, the stored visual against the spec schema, the ten golden plans
// (UPDATE_EXPECTED=1 rewrites them) and the build of the real chunk.
// Run: node --test tests/unit/js/visual/plan.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import vm from "node:vm";
import { EXPECTED, PLAN_FILES, ROOT, SK, SLICE, apply, boot, clone, decks, fixture, plain, preset, readJson, specSchema, visualErrors } from "../../../visual/expected/support.mjs";

const CS = boot();
const V = CS.visual;
const DK = decks();
const DATA = readJson(join(SK, "data", "art-direction.json"));
const INDEX = readJson(join(SK, "data", "icons", "index.json"));
const PACK = readJson(join(SK, "data", "icons", "pack.json")).icons;
const OBJECTS = new Set(readJson(join(SK, "data", "icons", "objects.json")).objects.map((o) => o.id));
const FLAGS = Object.fromEntries(INDEX.map((r) => [r[0], r[4] || {}]));
const P = Object.fromEntries(["creator", "poster"].map((id) => [id, preset(id)]));
const plan = (spec, pid = "creator", opts = {}, brand = null, memory = null) => V.plan(spec, brand, opts.preset || P[pid], memory, { caps: SLICE, ...opts });
const kinds = (out) => out.slides.map((s) => s.visual.anchor.kind);
const deepFreeze = (v) => { if (v && typeof v === "object" && !Object.isFrozen(v)) { Object.freeze(v); Object.values(v).forEach(deepFreeze); } return v; };
const rich = (name) => clone(DK[name]);
const runs = (a, n) => a.some((x, i) => i >= n - 1 && a.slice(i - n + 1, i + 1).every((y) => y === x));

/** A throw-away deck: slides given as [type, fields]; ids and ordinals are numbered; the cover comes first. */
function mk(slides, o = {}) {
  const d = clone(DK["eg-creator-rich"]);
  d.style = { presetId: (o.preset || "creator") + "@1.0", ...(o.style || {}) };
  d.slides = [{ id: "s01", n: 1, type: "cover", headline: "غلاف ==تجريبي==" }, ...slides.map(([type, f], i) => ({ id: "s" + String(i + 2).padStart(2, "0"), n: i + 2, type, ...f }))];
  return d;
}
const cycle = (type, f, n) => Array.from({ length: n }, (_, i) => [type, { ord: i + 1, ...f }]);

// A capture of the choices (ch) of the last plan: P.run is wrapped once, the wrapper is transparent.
const PL = V._.pl, run0 = PL.run;
let last = null;
PL.run = function (Fs, X) { const ch = run0.call(this, Fs, X); last = { Fs, ch, X }; return ch; };
const relaxOf = (out) => Object.fromEntries(out.slides.map((s) => [s.id, s.visual.relax || 0]));
// Synthetic tables: the candidates of a type are replaced by floors (a floor is kept whatever the fit says), so a ladder test does not depend on the geometry model.
const cand = (id, kind, sub, o = {}) => ({ id, fit: 50, kind, sub, recipe: "under", sizes: [], needs: [], floor: true, ...o });
const synth = (map, hard = {}) => { const D = clone(DATA); for (const [t, list] of Object.entries(map)) D.anchorTable.types[t].candidates = list; for (const [k, v] of Object.entries(hard)) Object.assign(D.rhythm.hard[k], v); return D; };
const BODY = "كل أسبوع نحمّص دفعة صغيرة ونرسلها لك في نفس اليوم عشان تفضل طازجة.";
const items = (n, extra = {}) => cycle("item", { title: "تحميص طازج كل أسبوع", body: BODY, ...extra }, n);

/* ---- the sources ------------------------------------------------------------------------------------------------------- */

// r3b-1's existing allocation is 48 KiB for the planner (plan-choice.test.mjs).
// Keep per-file ceilings within that allocation and show the original card for comparison.
const CARD = { "plan-features.js": 7 * 1024, "plan-score.js": 8 * 1024, "plan-emit.js": 6 * 1024, "plan-api.js": 3 * 1024 };
const PINNED = { "plan-features.js": 11 * 1024, "plan-score.js": 22 * 1024, "plan-emit.js": 9 * 1024, "plan-api.js": 5 * 1024 };

test("the four sources: header, IIFE, banned tokens and the r3b-1 size budget", (t) => {
  let total = 0;
  for (const f of PLAN_FILES) {
    const text = readFileSync(join(ROOT, "src", "visual", f), "utf8"), size = Buffer.byteLength(text);
    total += size;
    t.diagnostic(`${f}: ${size} bytes, card ${CARD[f]}, pinned ${PINNED[f]}`);
    assert.ok(text.startsWith(`/* src/visual/${f} - owned by V2`), f);
    assert.ok(/\(function \(\) \{[\s\S]*\}\)\(\);\s*$/.test(text), `${f} wraps itself in an IIFE`);
    const banned = [/Math\.random/, /\bDate\b/, /\bperformance\b/, /\bfetch\(/, /XMLHttpRequest/, /getBoundingClientRect/, /\bdocument\b/, /localStorage/, new RegExp("analy" + "tics"), new RegExp("<" + "/" + "script"), new RegExp("<" + "!--")];
    for (const re of banned) assert.ok(!re.test(text), `${f} contains ${re}`);
    assert.ok(size <= PINNED[f], `${f} is ${size} bytes, pinned at ${PINNED[f]} (the card says ${CARD[f]})`);
  }
  const card = Object.values(CARD).reduce((a, b) => a + b, 0);
  t.diagnostic(`total ${total} bytes; original card ${card}; r3b-1 cap ${48 * 1024}`);
  assert.ok(total <= Object.values(PINNED).reduce((a, b) => a + b, 0));
});

test("the members are registered through CS.visual._.register", () => {
  assert.equal(typeof V.plan, "function");
  assert.equal(typeof V.autoPreview, "function");
  assert.throws(() => V._.register("version", () => 0));
});

/* ---- the empty cases ---------------------------------------------------------------------------------------------------- */

test("a preset without an art block, visualMode off and missing tables plan nothing", () => {
  const spec = rich("eg-creator-rich"), bare = clone(P.creator);
  delete bare.art;
  const none = V.plan(spec, null, bare, null, { caps: SLICE });
  assert.deepEqual(plain(none.slides), []);
  assert.equal(none.notes[0].code, "plan.off");
  assert.match(none.style.planV, /^1\.1\.0\+[0-9a-f]{8}\+[0-9a-f]{8}$/);
  const off = clone(spec); off.style.visualMode = "off";
  assert.deepEqual(plain(plan(off).slides), []);
  const empty = boot({ blocks: { "cs-art-direction": null } });
  assert.equal(empty.visual.plan(spec, null, P.creator, null, { caps: SLICE }).notes[0].code, "plan.no-tables");
});

test("a deck with only a cover plans nothing and a single poster slide plans the poster", () => {
  assert.deepEqual(plain(plan(mk([])).slides), []);
  const single = fixture("spec.eg.single.json"), out = plan(single, "creator");
  assert.equal(out.slides.length, 1);
  assert.equal(out.slides[0].id, single.slides[0].id);
});

/* ---- determinism and purity ------------------------------------------------------------------------------------------------ */

test("two runs are equal, a permuted slide order gives the same plan, nothing is mutated", () => {
  for (const name of Object.keys(DK)) for (const pid of ["creator", "poster"]) {
    const spec = rich(name), a = plan(spec, pid), b = plan(spec, pid);
    assert.equal(JSON.stringify(a), JSON.stringify(b), `${name} ${pid}`);
    const shuffled = clone(spec); shuffled.slides.reverse();
    assert.equal(JSON.stringify(plan(shuffled, pid)), JSON.stringify(a), `${name} ${pid} permuted`);
  }
  const frozen = deepFreeze(rich("eg-creator-rich"));
  assert.doesNotThrow(() => V.plan(frozen, deepFreeze({ visual: { art: { prefer: ["word"] } } }), deepFreeze(clone(P.creator)), deepFreeze({ posts: [["icon"]] }), { caps: deepFreeze(clone(SLICE)) }));
});

/* ---- the planner never invents --------------------------------------------------------------------------------------------- */

const strings = (v, out = []) => { if (typeof v === "string") out.push(v); else if (v && typeof v === "object") Object.values(v).forEach((x) => strings(x, out)); return out; };
const bare = (s) => s.replace(/==/g, "");

test("every word, figure and name written into a plan comes from the slide or the lookup", () => {
  for (const name of Object.keys(DK)) for (const pid of ["creator", "poster"]) {
    const spec = rich(name), out = plan(spec, pid), by = Object.fromEntries(spec.slides.map((s) => [s.id, s]));
    for (const { id, visual: v } of out.slides) {
      const s = by[id], text = bare(strings({ ...s, visual: undefined }).join(" ")), a = v.anchor, digits = text.replace(/[٠-٩]/g, (d) => d.charCodeAt(0) - 1632).replace(/٫/g, ".").replace(/٬/g, ",").replace(/[−‑‒]/g, "-");
      if (a.word) for (const w of a.word.split(/\s+/)) assert.ok(text.includes(w), `${name} ${pid} ${id}: word «${w}» is not in the slide`);
      if (a.unit) assert.ok(text.includes(a.unit), `${name} ${pid} ${id}: unit «${a.unit}»`);
      if (a.value) assert.ok(digits.includes(a.value) || /^[0-9]$/.test(a.value) || a.value === String(s.ord), `${name} ${pid} ${id}: value ${a.value}`);
      if (a.chart) {
        const items = s.items.map((i) => i.title), nums = s.items.map((i) => Number(i.value));
        assert.ok(a.chart.values.every((x) => items.includes(x.label) && nums.includes(x.value)), `${name} ${id}: chart values come from items`);
        assert.equal(a.chart.illustrative === true, !(s.sourceIds || []).length, "the illustrative flag follows the sources");
      }
      for (const n of [a.icon, a.object, ...(a.icons || []), ...(v.rowIcons || [])].filter(Boolean)) assert.ok(PACK[n] || OBJECTS.has(n), `${id}: ${n} is neither a pack icon nor an object`);
      if (a.mock) assert.ok(SLICE.art.mock.includes(a.mock.kind));
      if (v.rowIcons) assert.ok(v.rowIcons.length <= (s.bullets || s.items || []).length);
    }
  }
});

test("a slide with a user media asset is skipped and still counts in the sequence", () => {
  const out = plan(rich("eg-poster-rich"), "poster");
  assert.ok(!out.slides.some((s) => s.id === "s07"), "the proof slide has no plan");
  assert.ok(out.notes.some((n) => n.slide === "s07" && n.code === "plan.media"));
  assert.ok(out.slides.length >= 6);
  const kindsAt = last.ch.map((x) => x && x.c.kind);
  assert.equal(kindsAt[last.Fs.findIndex((F) => F.id === "s07")], "photo");
});

/* ---- numbers: read whole (sign, grouping, decimals), never cut out of a range, ratio, date or word ------------------------------------------------ */

const stat = (f, pid = "creator", o = {}) => { const out = plan(mk([["stat", f]]), pid, o); return { out, F: last.Fs[1], a: out.slides.find((s) => s.id === "s02")?.visual.anchor }; };
const fig = (f) => { const n = stat(f).F.num; return n && plain({ v: n.v, u: n.u, pct: n.pct, of: n.of, fill: n.fill }); };
const items2 = (...v) => ({ title: "x", items: v.map((value, i) => ({ title: "صنف " + (i + 1), value })) });

test("a figure keeps its sign, grouping and decimals: -12% is not 12%, 12,500,000 is not 12500", () => {
  assert.deepEqual(fig({ headline: "Revenue fell -12%" }), { v: "-12", u: "%", pct: false }, "a hyphen-minus in front");
  assert.deepEqual(fig({ headline: "نزل −8% في الشهر" }), { v: "-8", u: "%", pct: false }, "a real minus sign");
  assert.deepEqual(fig({ headline: "ارتفع 12,500,000 جنيه" }), { v: "12,500,000", u: "جنيه", pct: false }, "grouped millions are not cut at the first group");
  assert.deepEqual(fig({ headline: "12,500 جنيه في الشهر" }), { v: "12,500", u: "جنيه", pct: false });
  assert.deepEqual(fig({ headline: "نمو ٣٫٥ مليون" }), { v: "3.5", u: "مليون", pct: false }, "Arabic-Indic digits with the Arabic decimal mark");
  assert.deepEqual(fig({ headline: "0.5 كيلو" }), { v: "0.5", u: "كيلو", pct: false });
  assert.deepEqual(fig({ headline: "+12% نمو" }), { v: "+12", u: "%", pct: false }, "an explicit plus is a change, not a share of a whole");
  assert.deepEqual(fig({ headline: "500+ عميل" }), { v: "500+", u: "عميل", pct: false }, "500+ is not 500");
  assert.deepEqual(fig({ headline: "10K متابع" }), { v: "10K", u: "متابع", pct: false }, "10K is not 10");
  assert.deepEqual(fig({ headline: "٧٤٪ من الناس" }), { v: "74", u: "%", pct: true, of: 100, fill: 74 });
  assert.deepEqual(fig({ headline: "150% زيادة" }), { v: "150", u: "%", pct: false }, "over 100 percent is no waffle");
  assert.deepEqual(fig({ headline: "74 من الناس" }), { v: "74", u: "", pct: false }, "the word «من» is not a unit");
  assert.deepEqual(fig({ number: { value: "-12", unit: "%" }, title: "t" }), { v: "-12", u: "%", pct: false }, "slide.number is read the same way");
  assert.deepEqual(fig({ number: { value: "12,500,000", unit: "جنيه" }, title: "t" }), { v: "12,500,000", u: "جنيه", pct: false });
});

test("ratios: «x من y» and «x of y» fill y cells; a slash or colon ratio, a range, a date, a time, a list or a code is no figure", () => {
  assert.deepEqual(fig({ headline: "3 من 4 بيقولوا" }), { v: "3", u: "من 4", pct: false, of: 4, fill: 3 });
  assert.deepEqual(fig({ headline: "3 out of 4 people" }), { v: "3", u: "out of 4", pct: false, of: 4, fill: 3 });
  assert.deepEqual(fig({ headline: "8 of 100 readers" }), { v: "8", u: "of 100", pct: true, of: 100, fill: 8 });
  assert.deepEqual(fig({ number: { value: "3.5", unit: "of 10" }, title: "t" }), { v: "3.5", u: "of 10", pct: false }, "a fraction of a cell is not drawn");
  for (const t of ["3/4 من الناس", "1:3 نسبة", "الفترة 10-20 يوم", "من 10–20 جنيه", "من 5 - 10 دقايق", "نسبة 3 / 4", "الأسعار 100 -50", "COVID-19 غير كل حاجة", "iPhone15 جديد", "12/10/2024 تاريخ", "وقت 10:30 الصبح", "عدد 1,2,3 خطوات", "حوالي 3,5 مرات", "2026 عام", "1,234,567,890 مشاهدة"]) assert.equal(fig({ headline: t }), undefined, t);
  assert.deepEqual(fig({ headline: "الفترة 10-20 يوم و40% منهم" }), { v: "40", u: "%", pct: true, of: 100, fill: 40 }, "the next whole figure is used");
  assert.equal(fig({ number: { value: "abc", unit: "x" }, title: "t" }), undefined);
  assert.equal(fig({ number: { value: "1,234,567,890", unit: "x" }, title: "t" }), undefined, "wider than anchor.value allows (10)");
});

test("a negative or ratio-less figure gets no waffle, bar, ring or fill; the numeral keeps its value, grouped", () => {
  for (const f of [{ headline: "Revenue fell -12%" }, { number: { value: "-12", unit: "%" }, title: "t" }, { headline: "+12% نمو" }]) {
    const { F, a } = stat(f);
    assert.ok(!F.cs.some((c) => /waffle|bar|ring|pictogram/.test(c.id)), `${JSON.stringify(f)}: ${F.cs.map((c) => c.id)}`);
    if (a) assert.ok(a.of === undefined && a.filled === undefined && !/waffle|bar|ring|pictogram/.test(a.companion || ""), JSON.stringify(a));
  }
  const only = { ...SLICE, art: { numeral: ["none"] } }, grouped = stat({ headline: "ارتفع 1,100 جنيه" }, "creator", { caps: only });
  assert.equal(grouped.a.kind, "numeral");
  assert.equal(grouped.a.value, "1,100");
  assert.equal(grouped.a.unit, "جنيه");
  const neg = stat({ headline: "نزل -12% عن الشهر اللي فات" }, "creator", { caps: only });
  assert.equal(neg.a.kind, "numeral");
  assert.equal(neg.a.value, "-12");
  assert.equal(neg.a.unit, "%");
});

test("a figure too wide for the numeral builder (it draws at 200 px at least) is no numeral candidate: the slide falls back honestly", () => {
  const wide = stat({ headline: "ارتفع 12,500,000 جنيه", body: "جملة" }), narrow = stat({ headline: "ارتفع 1,100 جنيه", body: "جملة" });
  assert.equal(wide.F.num.v, "12,500,000");
  assert.ok(wide.F.num.v.length <= 10 && wide.F.ew * 200 > 852, "about 5 em: 1000 px at 200 px");
  assert.ok(!wide.F.cs.some((c) => c.kind === "numeral"), wide.F.cs.map((c) => c.id).join());
  assert.notEqual(wide.a.kind, "numeral");
  assert.ok(narrow.F.cs.some((c) => c.kind === "numeral") && narrow.F.ew * 200 <= 852, "3 em: 600 px");
  // the same figure from slide.number
  assert.ok(!stat({ number: { value: "12,500,000", unit: "جنيه" }, title: "t" }).F.cs.some((c) => c.kind === "numeral"));
});

test("S-13 counts a figure by its whole value: 12,500 twice is twice, 12 is not found inside it", () => {
  assert.equal(stat({ headline: "12,500 جنيه", body: "يعني 12,500 كل شهر" }).F.reps, 2);
  assert.equal(stat({ headline: "12,500 جنيه", body: "في 12 شهر" }).F.reps, 1);
  assert.equal(stat({ headline: "-12% نزول", body: "بدل 12 زيادة" }).F.reps, 1, "-12 and 12 are two figures");
});

test("a chart series is read whole: signed, grouped, decimal and percent values keep their meaning, and what bars cannot draw is dropped", () => {
  const ser = (...v) => { const x = stat(items2(...v)).F.ser; return x && plain({ v: x.map((q) => q.value), u: x.u || undefined }); };
  assert.deepEqual(ser("12", "8"), { v: [12, 8] });
  assert.deepEqual(ser("12,500,000", "8,250,000"), { v: [12500000, 8250000] }, "grouped millions");
  assert.deepEqual(ser("3.5", "2.25"), { v: [3.5, 2.25] });
  assert.deepEqual(ser("٣٫٥", "٢"), { v: [3.5, 2] });
  assert.deepEqual(ser("12%", "8%"), { v: [12, 8], u: "%" }, "the shared unit is kept");
  assert.equal(ser("-12", "8"), null, "a negative bar cannot start at zero: no chart");
  assert.equal(ser("−12", "8"), null);
  assert.deepEqual(ser("15 دقيقة", "60 دقيقة"), { v: [15, 60], u: "دقيقة" }, "a word unit shared by all");
  assert.deepEqual(ser("$120", "$105"), { v: [120, 105], u: "$" }, "a currency sign in front");
  assert.deepEqual(ser("1.2M", "3M"), { v: [1.2, 3], u: "M" }, "a magnitude letter is kept as the unit, never multiplied away");
  assert.equal(ser("12%", "8"), null, "a unit on some values only");
  assert.equal(ser("15 دقيقة", "60 ساعة"), null, "two units");
  assert.equal(ser("$5", "5 ريال"), null);
  assert.equal(ser("الأسبوع 1", "الأسبوع 2"), null, "week numbers are labels, not data");
  assert.equal(ser("Day 1", "Day 2", "Day 3"), null);
  assert.equal(ser("12 to 15", "8"), null);
  assert.equal(ser("1e3", "5"), null);
  assert.equal(ser("12", "8", "5", "4", "3", "2", "1", "9"), null, "more than 7 bars");
  assert.equal(stat({ title: "x", items: [{ title: "عنوان أطول من أربعة وعشرين حرفا بكتير", value: "5" }, { title: "ب", value: "3" }] }).F.ser, null, "a label the schema would cut");
  const caps = { ...SLICE, art: { chart: ["bars-h"], word: ["solid"], field: ["word"] } }, out = stat(items2("12,500,000", "8,250,000"), "creator", { caps });
  assert.equal(out.a.kind, "chart");
  assert.deepEqual(plain(out.a.chart.values.map((q) => q.value)), [12500000, 8250000]);
  assert.equal(stat(items2("12%", "8%"), "creator", { caps }).a.chart.unit, "%");
});

/* ---- invariants: what the pass guarantees at each relax level ------------------------------------------------------------------- */

function invariants(out, spec, label) {
  // the whole inner sequence: a slide without a plan (a user asset, a lock) stays in the sequence as a different kind of its own
  const by = Object.fromEntries(out.slides.map((s) => [s.id, s])), inner = spec.slides.filter((s) => s.type !== "cover");
  const sl = inner.map((s) => by[s.id] || { id: s.id, visual: { anchor: { kind: "unplanned:" + s.id }, recipe: "-", tone: "base" }, gap: true });
  const typeOf = (s) => spec.slides.find((x) => x.id === s.id);
  const key = (s) => [typeOf(s).type, s.variant || typeOf(s).variant || "", s.visual.recipe, s.visual.anchor.kind].join("|");
  const rl = sl.map((s) => s.visual.relax || 0), ks = sl.map((s) => s.visual.anchor.kind), kk = sl.map(key), name = (s) => s.visual.anchor.icon || s.visual.anchor.object;
  sl.forEach((s, i) => {
    if (s.gap) return;
    if (i >= 2 && ks[i] === ks[i - 1] && ks[i] === ks[i - 2]) assert.ok(rl[i] >= 6, `${label} ${s.id}: three ${ks[i]} anchors in a row at relax ${rl[i]}: ${ks.join()} (${inner.map((q) => q.id + ":" + q.type).join()})`);
    if (i >= 2 && kk[i] === kk[i - 1] && kk[i] === kk[i - 2]) assert.ok(rl[i] >= 5, `${label} ${s.id}: three identical keys at relax ${rl[i]}`);
    if (i >= 5 && kk[i] === kk[i - 2] && kk[i] === kk[i - 4] && kk[i - 1] === kk[i - 3] && kk[i - 1] === kk[i - 5] && kk[i] !== kk[i - 1]) assert.ok(rl[i] >= 8, `${label} ${s.id}: ABABAB at relax ${rl[i]}`);
    if (name(s)) {
      if (i && name(sl[i - 1]) === name(s)) assert.ok(rl[i] >= 8, `${label} ${s.id}: the same icon on adjacent slides`);
      if (sl.slice(0, i).some((x) => name(x) === name(s)) && name(s) !== out.style.motif) assert.ok(rl[i] >= 7, `${label} ${s.id}: ${name(s)} used twice at relax ${rl[i]}`);
    }
    if (s.visual.pause) {
      assert.ok(!sl[i + 1] || !sl[i + 1].visual.pause, `${label}: adjacent pauses`);
      assert.ok(!sl[i + 1] || typeOf(sl[i + 1]).type !== "cta" || rl[i] >= 8, `${label}: a pause before the cta`);
    }
  });
  const tones = sl.map((s) => s.visual.tone);
  for (let i = 2; i < tones.length; i++) assert.ok(!(tones[i] !== "base" && tones[i - 1] !== "base" && tones[i - 2] !== "base"), `${label}: three non-base tones in a row`);
  if (tones.length >= 6) assert.ok(!tones.some((t, i) => i >= 2 && t === tones[i - 1] && t === tones[i - 2]), `${label}: no three identical tones`);
  assert.ok(tones.filter((t) => t !== "base").length * 100 <= 50 * tones.length, `${label}: non-base share`);
}

test("the invariants hold on every deck and preset", () => {
  for (const name of Object.keys(DK)) for (const pid of ["creator", "poster"]) { const spec = rich(name); invariants(plan(spec, pid), spec, `${name} ${pid}`); }
  for (const f of ["spec.eg.8slides.json", "spec.gulf.9slides.json", "spec.levant.10slides.json", "spec.en.8slides.json", "spec.msa-white.indic.8slides.json"]) for (const pid of ["creator", "poster"]) { const spec = fixture(f); invariants(plan(spec, pid), spec, `${f} ${pid}`); }
});

test("the invariants hold on 16 seeded random decks", () => {
  let seed = 20261023;
  const rnd = (n) => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % n; };
  const TYPES = ["rehook", "item", "step", "stat", "compare", "myth-fact", "quote", "checklist", "summary", "setup", "share", "testimonial", "offer", "story-beat"];
  const sample = [...Object.values(DK).flatMap((d) => d.slides), ...fixture("spec.gulf.9slides.json").slides, ...fixture("spec.levant.10slides.json").slides];
  for (let k = 0; k < 16; k++) {
    const n = 4 + rnd(9), slides = [];
    for (let i = 0; i < n; i++) { let pool; do pool = sample.filter((s) => s.type === TYPES[rnd(TYPES.length)]); while (!pool.length); const s = clone(pool[rnd(pool.length)]); delete s.visual; slides.push([s.type, (({ id, n: _n, type, ...f }) => f)(s)]); }
    slides.push(["cta", { title: "احفظ", cta: { kind: "save", text: "احفظ البوست" } }]);
    const spec = mk(slides);
    for (const pid of ["creator", "poster"]) invariants(plan(spec, pid), spec, `random ${k} ${pid}`);
  }
});

test("odd input never throws: empty and missing fields, long text, Arabic-Indic digits, every type, both dialects", () => {
  const schema = specSchema(), TYPES = Object.keys(DATA.anchorTable.types), long = "كلمة ".repeat(60).trim();
  const shapes = [{}, { title: long, body: long, headline: "==", kicker: "k" }, { title: "٧٤٪ من الناس", number: { value: "0", unit: "" }, bullets: ["", "a", "b", "c", "d", "e", "f", "g"] },
    { number: { value: "8", unit: "من 100" }, items: [{ title: "x", value: "abc" }, { title: "y", value: "5" }], bridge: long }, { sides: [{ text: "a" }, { text: "b" }], demo: { lines: [{ text: "x" }] }, cta: { kind: "follow", text: "x" } },
    { title: "2026 عام", body: "1999", number: { value: "100", unit: "%" }, ord: 99, attribution: "a" },
    { headline: "Revenue fell -12%", number: { value: "-12", unit: "%" }, items: [{ title: "a", value: "-12" }, { title: "b", value: "8" }] },
    { title: "12,500,000 جنيه و3/4 و10-20", number: { value: "12,500,000", unit: "جنيه" }, items: [{ title: "x", value: "12,500,000" }, { title: "y", value: "8,250,000" }, { title: "z", value: "3.5" }] },
    { headline: "3 من 4 في 2026 بنسبة +12% و500+ و10K", number: { value: "3", unit: "من 4" }, items: [{ title: "x", value: "12%" }, { title: "y", value: "8%" }], bullets: ["1.2M", "COVID-19", "iPhone15", "1,234,567,890"] }];
  let n = 0;
  for (const [i, f] of shapes.entries()) for (const type of TYPES) {
    const spec = mk([[type, f]]); spec.locale.dialect = i % 2 ? "en" : "eg";
    const a = plan(spec, "creator"), b = plan(spec, "poster");
    if (n++ % 3 === 0) assert.equal(JSON.stringify(a), JSON.stringify(plan(spec, "creator")), `${type} shape ${i}`);
    for (const out of [a, b]) for (const s of out.slides) assert.deepEqual(visualErrors(s.visual, schema), [], `${type} shape ${i}`);
  }
});

/* ---- every rung of the ladder (the data thresholds are changed so one constraint binds) ---------------------------------------------- */

const withHard = (patch, extra = (D) => D) => { const D = clone(DATA); for (const [k, v] of Object.entries(patch)) Object.assign(D.rhythm.hard[k], v); return extra(D); };
const wordOnly = { ...SLICE, art: { word: ["solid"], field: ["word"] } };

test("R0: a plain deck plans at relax 0 and `relax` is omitted", () => {
  const out = plan(rich("eg-creator-rich"));
  assert.ok(out.slides.every((s) => !("relax" in s.visual)));
  assert.ok(!out.notes.some((n) => n.code === "VA5.relaxed"));
});

test("R1: the bold slide leaves its bold candidates once the neighbours' kind run makes them illegal", () => {
  const W = cand("b.bold", "word", "solid", { bold: true, fit: 90 }), N = cand("b.plain", "field", "word", { fit: 10 });
  const spec = mk(items(3));
  spec.style.world = { id: "w", boldMove: { slide: "s03" } };
  for (const i of [1, 3]) spec.slides[i].visual = { lock: true, anchor: { kind: "word" }, recipe: "under" };
  const out = plan(spec, "creator", { data: synth({ item: [W, N] }) });
  assert.equal(last.Fs[2].id, "s03");
  assert.equal(last.X.bold, 2);
  assert.deepEqual(plain(relaxOf(out)), { s03: 1 });
  assert.equal(out.slides[0].visual.anchor.kind, "field");
});

test("R2: fewer than three kinds in a deck of six inner slides ends in a VA5.variety note and relax 2", () => {
  const out = plan(mk(items(7)), "creator", { data: synth({ item: [cand("v.a", "word", "solid")] }, { H1: { maxRunKind: 9 }, H2: { maxRunKey: 9 } }) });
  assert.ok(out.notes.some((n) => n.code === "VA5.variety"));
  assert.equal(out.slides[0].visual.relax, 2);
  assert.deepEqual([...new Set(kinds(out))], ["word"]);
});

test("H4: the repair swaps one slide to an unused kind when the pass leaves fewer than three", () => {
  const D = synth({ item: [cand("v.a", "word", "solid", { fit: 100 }), cand("v.b", "field", "word", { fit: 80 }), cand("v.c", "numeral", "none", { fit: 10 })] }, { H1: { maxRunKind: 9 }, H2: { maxRunKey: 9 } });
  const out = plan(mk(items(7)), "creator", { data: D });
  assert.ok(new Set(kinds(out)).size >= 3, kinds(out).join());
  assert.ok(!out.notes.some((n) => n.code === "VA5.variety"));
  assert.ok(out.slides.every((s) => !s.visual.relax));
});

test("R4 and R8: a peak under 35 percent anchor share, a floor included, takes the 28 percent rung; under 28 only the last rung lets it through", () => {
  const body = ["stat", { number: { value: "74", unit: "%" }, title: "من الناس بتقرا", body: "جملة" }];
  for (const floor of [false, true]) {
    const out = plan(mk([body]), "creator", { data: synth({ stat: [cand("s.a", "field", "word", { field: true, floor })] }, { H8: { minShare: 99 } }) });
    assert.equal(out.slides[0].visual.relax, 4, `floor ${floor}`);
    assert.deepEqual(plain(out.notes.filter((n) => n.code === "VA5.relaxed").map((n) => n.level)), [4]);
  }
  // a centred field floor on a share slide: the headline length sets its geometric share (the centre recipe holds a square of 440 to 560 px)
  const share = (headline, sub, recipe = "center") => { const out = plan(mk([["share", { headline, ...(sub ? { sub } : {}) }]]), "creator", { data: synth({ share: [cand("sh.f", "field", "word", { field: true, recipe })] }) }); return { out, share: last.Fs[1].cs[0].share }; };
  const roomy = share("ابعتها لزميلك اللي بيبدأ", ""), tight = share("ابعتها لزميلك اللي بيبدأ يومه", "هيشكرك"), cramped = share("ابعتها لزميلك اللي بيبدأ يومه بالرسايل", "هيشكرك بعدين");
  assert.ok(roomy.share >= 35 && !("relax" in roomy.out.slides[0].visual), "35 or more: no relaxation");
  assert.ok(tight.share >= 28 && tight.share < 35 && tight.out.slides[0].visual.relax === 4, `28 to 34 (${tight.share}): rung 4`);
  assert.ok(cramped.share < 28 && cramped.out.slides[0].visual.relax === 8, `under 28 (${cramped.share}): the unconditional fallback, recorded as 8`);
  assert.deepEqual(plain(cramped.out.notes.filter((n) => n.code === "VA5.relaxed")), [{ slide: "s02", code: "VA5.relaxed", level: 8 }]);
  const under = share("ابعتها لزميلك اللي بيبدأ يومه بالرسايل", "هيشكرك بعدين", "under");
  assert.ok(under.share >= 35 && !("relax" in under.out.slides[0].visual), "the same text with room: no relaxation");
});

test("R5: a repeated (type, variant, recipe, kind) key beyond the run limit needs the 3-run rung", () => {
  const out = plan(mk(items(3)), "creator", { data: synth({ item: [cand("k.a", "word", "solid")] }, { H2: { maxRunKey: 1 }, H1: { maxRunKind: 9 } }) });
  assert.deepEqual(plain(relaxOf(out)), { s02: 0, s03: 5, s04: 5 });
});

test("R6: a third anchor of one kind in a row needs the kind-run rung", () => {
  const out = plan(mk(items(4)), "creator", { data: synth({ item: [cand("k.a", "word", "solid")] }, { H1: { maxRunKind: 1 }, H2: { maxRunKey: 9 } }) });
  assert.deepEqual(plain(relaxOf(out)), { s02: 0, s03: 6, s04: 6, s05: 8 }, "three of a kind at R6, a fourth only when every rule is dropped");
});

test("R7: an icon used twice in a deck needs the repeat rung, and still never on adjacent slides", () => {
  const out = plan(mk(items(3)), "creator", { data: synth({ item: [cand("k.i", "icon", "icon", { sizes: ["xl"] })] }, { H3: { maxUses: 0 }, H1: { maxRunKind: 9 }, H2: { maxRunKey: 9 } }) });
  assert.deepEqual(plain(relaxOf(out)), { s02: 7, s03: 7, s04: 7 });
  const names = out.slides.map((s) => s.visual.anchor.icon || s.visual.anchor.object);
  names.forEach((n, i) => i && assert.notEqual(n, names[i - 1], "adjacent"));
});

test("R8: a pause before the cta stays illegal until every rule is dropped", () => {
  const D = synth({ quote: [cand("q.pause", "word", "solid", { pause: true })], cta: [cand("c.w", "word", "solid")] });
  const out = plan(mk([["quote", { title: "جملة", body: "كلمة" }], ["cta", { title: "احفظ", cta: { kind: "save", text: "احفظ" } }]]), "creator", { data: D });
  assert.equal(out.slides[0].visual.pause, true);
  assert.equal(out.slides[0].visual.relax, 8);
  assert.equal(out.slides[1].visual.relax, undefined);
});

test("H5: at most one pause per five inner slides, none adjacent, none right before the cta", () => {
  const D = synth({ quote: [cand("q.pause", "word", "solid", { pause: true, fit: 90 }), cand("q.plain", "field", "word", { fit: 10 }), cand("q.num", "numeral", "none", { fit: 5 })], cta: [cand("c.w", "word", "solid")] }, { H1: { maxRunKind: 9 }, H2: { maxRunKey: 9 } });
  const spec = mk([...cycle("quote", { title: "جملة", body: "كلمة" }, 9), ["cta", { title: "احفظ", cta: { kind: "save", text: "احفظ" } }]]);
  const out = plan(spec, "creator", { data: D }), p = out.slides.map((s) => !!s.visual.pause);
  assert.equal(p.filter(Boolean).length, 2, "10 inner slides allow two pauses");
  assert.ok(p.every((v, i) => !v || !p[i - 1]) && !p[p.length - 2], "never adjacent, never right before the cta");
  assert.ok(out.slides.every((s) => !s.visual.relax));
});

test("R3 never shows: the pass has nothing to relax at that rung (tones are balanced by demotion)", () => {
  for (const name of Object.keys(DK)) for (const pid of ["creator", "poster"]) assert.ok(!plan(rich(name), pid).slides.some((s) => s.visual.relax === 3));
});

test("the ladder is total: an impossible deck still has an entry per planned slide", () => {
  const out = plan(mk(items(8)), "creator", { data: synth({ item: [cand("k.a", "word", "solid")] }, { H1: { maxRunKind: 0 }, H2: { maxRunKey: 0 }, H3: { maxUses: 0 } }) });
  assert.equal(out.slides.length, 8);
  assert.ok(out.slides.every((s) => s.visual.relax === 6 || s.visual.relax === 5 || s.visual.relax === 8 || s.visual.relax > 0));
});

/* ---- H3: icons, H4: kinds, H5: pauses, H6: tones, H7: bold, H8: peaks ----------------------------------------------------------------- */

test("H3: no icon or object twice in a deck, none on adjacent slides, the motif may recur", () => {
  const caps = { ...SLICE, art: { icon: ["icon"] } }, spec = mk(items(6, { title: "الوقت والفلوس والحسابات" }));
  const out = plan(spec, "creator", { caps });
  const names = out.slides.map((s) => s.visual.anchor.icon || s.visual.anchor.object).filter(Boolean), free = out.slides.filter((s) => !s.visual.relax).map((s) => s.visual.anchor.icon || s.visual.anchor.object).filter(Boolean);
  assert.ok(names.length >= 2, "icons were planned");
  assert.equal(new Set(free).size, free.length, "no repeats without a relax level");
  out.slides.forEach((s, i) => i && !s.visual.relax && assert.notEqual(s.visual.anchor.icon || s.visual.anchor.object, out.slides[i - 1].visual.anchor.icon || out.slides[i - 1].visual.anchor.object));
});

test("H3 holds a candidate's fixed icon too: once per deck, never on adjacent slides, repeats only on the ladder", () => {
  const open = { H1: { maxRunKind: 9 }, H2: { maxRunKey: 9 } }, send = cand("f.send", "icon", "icon", { icon: "send", sizes: ["xl"] });
  // only the fixed icon on offer: a neighbour is impossible until the last rung (rung 7 allows a repeat, never next to itself)
  const adj = plan(mk(items(4)), "creator", { data: synth({ item: [send] }, open) });
  assert.deepEqual(plain(relaxOf(adj)), { s02: 0, s03: 8, s04: 8, s05: 8 });
  assert.deepEqual(plain(adj.slides.map((s) => s.visual.anchor.icon)), ["send", "send", "send", "send"], "the fixed icon is still what is drawn once the rules are dropped");
  // a locked slide between two uses: the repeat is not adjacent, so rung 7 is enough
  const spec = mk(items(3));
  spec.slides[2].visual = { lock: true, anchor: { kind: "word", word: "x" }, recipe: "under" };
  assert.deepEqual(plain(relaxOf(plan(spec, "creator", { data: synth({ item: [send] }, open) }))), { s02: 0, s04: 7 });
  // an alternative keeps the rungs at 0: the second slide takes the word, the icon is used once
  const alt = plan(mk(items(4)), "creator", { data: synth({ item: [cand("f.send", "icon", "icon", { icon: "send", sizes: ["xl"], fit: 90 }), cand("f.word", "word", "solid", { fit: 10 })] }, open) });
  assert.ok(alt.slides.every((s) => !s.visual.relax));
  assert.equal(alt.slides.filter((s) => s.visual.anchor.icon === "send").length, 1);
  // @cta resolves to the icon of the cta kind: «send» was just used by the share slide, so the cta takes its field candidate (peak slides: the giant icon and the field both clear the 35 percent minimum)
  const giant = (id, icon, o = {}) => cand(id, "icon", "icon", { icon, sizes: ["hero"], treatment: "giant", recipe: "center", ...o });
  const D = synth({ share: [giant("sh.send", "send", { fit: 90 })], cta: [giant("c.giant", "@cta", { fit: 90 }), cand("c.field", "field", "word", { fit: 10, field: true, recipe: "center" })] }, open);
  const out = plan(mk([["share", { headline: "ابعتها لزميلك" }], ["cta", { title: "ابعتها لزميلك", cta: { kind: "send", text: "ابعتها لزميلك" } }]]), "creator", { data: D });
  assert.equal(out.slides[0].visual.anchor.icon, "send");
  assert.equal(out.slides[1].visual.anchor.kind, "field");
  assert.ok(out.slides.every((s) => !s.visual.relax));
  const only = plan(mk([["share", { headline: "ابعتها" }], ["cta", { title: "ابعتها", cta: { kind: "send", text: "ابعتها" } }]]), "creator", { data: synth({ share: D.anchorTable.types.share.candidates, cta: [giant("c.giant", "@cta")] }, open) });
  assert.deepEqual(plain(relaxOf(only)), { s02: 0, s03: 8 }, "with nothing else on offer the repeat waits for the last rung");
  // the motif may recur, fixed or not
  const motif = mk(items(2)); motif.style.motif = "send";
  assert.ok(plan(motif, "creator", { data: synth({ item: [send] }, open) }).slides.every((s) => !s.visual.relax && s.visual.anchor.icon === "send"));
});

test("H4 and S4: a deck of six or more inner slides shows at least three kinds when the data allows", () => {
  for (const name of ["eg-creator-rich", "eg-poster-rich"]) for (const pid of ["creator", "poster"]) assert.ok(new Set(kinds(plan(rich(name), pid))).size >= 3, `${name} ${pid}`);
});

test("H6: tones follow the role, never run three non-base slides, return to base at the end, and honour toneBias", () => {
  const peaks = [["rehook", { headline: "ألف ==كلمة==", bridge: "اسحب" }], ["stat", { number: { value: "9", unit: "مرات" }, title: "من الناس" }], ["share", { headline: "ابعتها" }], ["offer", { title: "عرض", number: { value: "5", unit: "جنيه" } }], ["rehook", { headline: "كمان ==كلمة==" }], ["stat", { number: { value: "7", unit: "مرات" }, title: "مرة" }]];
  const spec = mk([...peaks, ["cta", { title: "احفظ", cta: { kind: "save", text: "احفظ" } }]]);
  const out = plan(spec, "poster"), tones = out.slides.map((s) => s.visual.tone);
  assert.ok(tones.includes("field") && tones.includes("invert"));
  assert.ok(tones.filter((t) => t !== "base").length * 100 <= 40 * 7, "balanced is 40 percent");
  for (const [bias, cap] of [["calm", 20], ["drenched", 50]]) {
    const o = plan({ ...clone(spec), style: { presetId: "poster@1.0", world: { id: "x", toneBias: bias } } }, "poster");
    assert.ok(o.slides.filter((s) => s.visual.tone !== "base").length <= Math.max(2, Math.floor(cap * 7 / 100)) || o.notes.some((n) => n.code === "plan.tones-relaxed"), bias);
  }
  const noTones = clone(P.poster); delete noTones.tones;
  assert.ok(plan(spec, "poster", { preset: noTones }).slides.every((s) => s.visual.tone === "base"), "a preset without tones plans base only");
});

test("H7: the bold slide takes a candidate flagged bold, and spec.style.world.boldMove.slide names it", () => {
  const spec = rich("eg-creator-rich");
  plan(spec, "creator");
  const bold = last.ch[last.X.bold];
  assert.ok(bold && (bold.c.bold || bold.rl >= 1), "a bold slide exists and takes a bold candidate");
  const named = clone(spec); named.style.world = { id: "w", boldMove: { slide: "s05" } };
  plan(named, "creator");
  assert.equal(last.Fs[last.X.bold].id, "s05", "the named slide");
  assert.ok(last.ch[last.X.bold].c.bold || last.ch[last.X.bold].rl >= 1);
  const out = plan(mk(items(3)), "creator", { data: synth({ item: [cand("n.a", "word", "solid")] }) });
  assert.equal(last.X.bold, -1);
  assert.ok(out.notes.some((n) => n.code === "VA5.no-bold"), "no bold candidate: a quiet note, the plan is not touched");
  assert.equal(out.slides.length, 3);
});

test("H8: a peak never takes a candidate under 35 percent anchor share, a floor included, until the ladder says so (28 from rung 4, none at rung 8)", () => {
  let floors = 0;
  for (const name of Object.keys(DK)) for (const pid of ["creator", "poster"]) {
    plan(rich(name), pid);
    for (const x of last.ch) if (x && !x.lock && !x.skip && DATA.rhythm.hard.H8.types.includes(x.F.type)) {
      const min = x.rl >= 8 ? 0 : x.rl >= 4 ? 28 : 35;
      assert.ok(x.c.share >= min, `${name} ${pid} ${x.F.id} share ${x.c.share} at relax ${x.rl}`);
      if (x.c.floor) floors++;
    }
  }
  assert.ok(floors > 0, "the decks put floors on peaks, so the rule was exercised");
});

/* ---- the integer score ---------------------------------------------------------------------------------------------------------- */

const one = (slide, o = {}, pid = "creator") => { const out = plan(mk([slide]), pid, o, o.brand || null, o.memory || null); return { out, x: last.ch[1] }; };

test("score = 30 typeFit + 40 evidence + 15 presetFit + 10 novelty + 5 textFit, all integers", () => {
  const { x } = one(["stat", { number: { value: "74", unit: "%" }, title: "من الناس", body: "جملة" }]);
  const c = x.c, aff = Math.round(P.creator.art.affinity[c.kind] * 100);
  const figureBonus = c.kind === "numeral" ? /^(waffle|bar)$/.test(c.sub) ? 2200 : c.sub === "none" ? 1200 : 0 : 0;
  assert.equal(c.s, 30 * c.fit + 40 * 100 + 15 * aff + 10 * 100 + 5 * c.f.tf - 3000 * c.f.lvl + figureBonus);
  assert.ok(Number.isInteger(c.s));
});

test("evidence is the larger of dataFit and conceptFit for every kind", () => {
  const D = synth({ item: [cand("e.concept", "icon", "icon", { fit: 50, needs: ["hit:1"], sizes: ["xl"] }), cand("e.data", "numeral", "none", { fit: 50, needs: ["ordinal"] }), cand("e.none", "word", "solid", { fit: 50 })] });
  plan(mk([["item", { title: "الفلوس والحسابات", body: BODY, ord: 1 }]]), "creator", { data: D });
  const F = last.Fs[1], by = Object.fromEntries(F.cs.map((c) => [c.id, c])), aff = (k) => Math.round(P.creator.art.affinity[k] * 100);
  const expect = (c, ev) => 30 * c.fit + 40 * ev + 15 * aff(c.kind) + 10 * 100 + 5 * c.f.tf - 3000 * c.f.lvl;
  assert.ok(F.hits[0].n > 0 && F.hits[0].n < 100);
  assert.equal(by["e.concept"].s, expect(by["e.concept"], F.hits[0].n) + DATA.rhythm.scoring.adjust.lone, "conceptFit counts for an icon, with the lone-icon penalty");
  assert.equal(by["e.data"].s, expect(by["e.data"], 100), "dataFit counts for a numeral");
  assert.equal(by["e.none"].s, expect(by["e.none"], 0), "a floor has no evidence");
});

test("world +2500 for mockPrefer, brand prefer +2000, priors clamp at 1500, novelty from memory", () => {
  const spec = rich("eg-creator-rich");
  const score = (o, brand, memory) => { plan(spec, "creator", o, brand, memory); return Object.fromEntries(last.Fs[3].cs.map((c) => [c.id, c.s])); };
  const base = score({}), id = "step.mock-notes";
  assert.ok(base[id] > 0, "the notes mock passes the fit on the rich step");
  spec.style.world = { id: "w", mockPrefer: ["notes"] };
  assert.equal(score({})[id] - base[id], 2500);
  spec.style.world = { id: "chat-confession" };
  assert.ok(score({})[id] - base[id] >= 0, "a curated world adds its prior on the stages it names");
  delete spec.style.world;
  assert.equal(score({}, { visual: { art: { prefer: ["mock"] } } })[id] - base[id], 2000);
  assert.equal(score({ priors: { mock: 9999 } })[id] - base[id], 1500);
  assert.equal(score({ priors: { mock: -9999 } })[id] - base[id], -1500);
  assert.equal(score({}, null, { posts: [["x", "mock"], ["mock"], ["mock"]] })[id] - base[id], -10 * Math.floor((200 * 3 + 4) / 8));
  assert.equal(score({}, null, { posts: [] })[id], base[id]);
});

test("the cliche penalty applies when a topic default (rung 7) picked the icon", () => {
  const spec = mk([["item", { title: "ساعة", body: "قصة", ord: 1 }]]);
  plan(spec, "creator");
  const F = last.Fs[1], c = F.cs.find((q) => q.kind === "icon");
  if (!c) return;
  const D = clone(DATA); D.rhythm.scoring.cliche.fromRung = 0; D.rhythm.scoring.cliche.icons = [F.pool[0].name];
  plan(spec, "creator", { data: D });
  const c2 = last.Fs[1].cs.find((q) => q.kind === "icon");
  assert.equal(c2.s - c.s, D.rhythm.scoring.cliche.points);
});

test("tie-break: higher score, then larger share, then the lower hash", () => {
  const flat = clone(P.creator); flat.art.affinity = Object.fromEntries(Object.keys(flat.art.affinity).map((k) => [k, 0.5]));
  const spec = mk([["item", { title: "تحميص طازج كل أسبوع", body: BODY, ord: 1 }]]), F0 = () => last.Fs[1];
  plan(spec, "creator", { data: synth({ item: [cand("a.one", "word", "solid"), cand("a.two", "word", "solid")] }), preset: flat });
  const [a, b] = F0().cs;
  assert.equal(a.s, b.s); assert.equal(a.share, b.share);
  assert.equal(last.ch[1].c.id, a.h < b.h ? a.id : b.id, "the lower hash wins an exact tie");
  assert.equal(a.h, CS.core.canon.fnv1a64("s02|a.one"));
  plan(spec, "creator", { data: synth({ item: [cand("b.small", "word", "solid"), cand("b.big", "field", "word", { field: true })] }), preset: flat });
  const [small, big] = F0().cs;
  assert.equal(small.s, big.s); assert.ok(big.share > small.share);
  assert.equal(last.ch[1].c.id, "b.big", "the larger share beats the hash");
  plan(spec, "creator", { data: synth({ item: [cand("c.low", "word", "solid", { fit: 40 }), cand("c.high", "field", "word", { fit: 80, field: true })] }), preset: flat });
  assert.equal(last.ch[1].c.id, "c.high", "the higher score first");
});

/* ---- capabilities ----------------------------------------------------------------------------------------------------------------- */

test("a candidate without a builder, recipe or variant in caps is dropped", () => {
  const spec = rich("eg-creator-rich");
  const noMock = plan(spec, "creator", { caps: { ...SLICE, art: { ...SLICE.art, mock: [] } } });
  assert.ok(!kinds(noMock).includes("mock"));
  assert.ok(kinds(plan(spec, "creator")).includes("mock"), "with the mocks in caps they are planned");
  const noNum = plan(spec, "creator", { caps: { ...SLICE, art: { ...SLICE.art, numeral: [] } } });
  assert.ok(!kinds(noNum).includes("numeral"));
  const onlyUnder = plan(spec, "creator", { caps: { ...SLICE, recipes: ["under"] } });
  assert.ok(onlyUnder.slides.every((s) => s.visual.recipe === "under"));
  const noVariants = plan(spec, "creator", { caps: { ...SLICE, variants: {} } });
  assert.ok(noVariants.slides.every((s) => !s.variant || ["cards", "grid", "stamp"].includes(s.variant)), "new variants only when caps list them");
  const noTrack = plan(spec, "creator", { caps: { ...SLICE, art: { ...SLICE.art, mock: ["chat"] } } });
  assert.ok(!noTrack.slides.some((s) => s.visual.anchor.mock?.kind === "notes"));
});

test("scene candidates need their template in caps, solo scenes read the signature of the preset", () => {
  const item = mk([["item", { title: "الفلوس والوقت والحساب", body: "قصة", ord: 1 }]]);
  const none = plan(item, "creator");
  assert.ok(!kinds(none).includes("scene"));
  const caps = { ...SLICE, art: { ...SLICE.art, scene: ["solo", "pile", "trio"] } };
  const wide = plan(item, "creator", { caps });
  wide.slides.forEach((s) => s.visual.anchor.kind === "scene" && assert.ok(["solo", "pile", "trio"].includes(s.visual.anchor.template)));
});

/* ---- worlds, brand, locks -------------------------------------------------------------------------------------------------------------- */

test("a curated world whose artefacts are not in caps is ignored; spec.style.world fields still count", () => {
  const spec = rich("eg-creator-rich"), a = plan(spec, "creator");
  spec.style.world = { id: "receipt" };
  assert.equal(JSON.stringify(plan(spec, "creator").slides), JSON.stringify(a.slides), "the receipt world needs a receipt mock");
  spec.style.world = { id: "chat-confession" };
  const w = plan(spec, "creator");
  assert.ok(w.slides.filter((s) => s.visual.anchor.kind === "mock").length >= a.slides.filter((s) => s.visual.anchor.kind === "mock").length, "chat-confession favours the chat and notes mocks");
});

test("S-13: a figure the slide already shows twice gets no numeral anchor (it would show three times)", () => {
  const once = mk([["stat", { number: { value: "74", unit: "%" }, title: "74% من الناس بتقرا", body: "جملة تانية عن الموضوع ده", sourceIds: [] }]]);
  assert.ok(kinds(plan(once)).includes("numeral") || kinds(plan(once)).includes("field"), "twice is allowed");
  assert.ok(plan(once).slides.some((s) => s.visual.anchor.kind === "numeral"), "once in the text, once as the numeral");
  const thrice = mk([["stat", { number: { value: "74", unit: "%" }, title: "74% من الناس بتقرا", body: "يعني 74 من كل 100 في الفيد", sourceIds: [] }]]);
  assert.ok(!kinds(plan(thrice)).includes("numeral"), "twice in the text: the numeral would be the third");
});

test("brand: prefer adds, avoid removes, figures none keeps human icons out", () => {
  const spec = rich("eg-creator-rich");
  const prefer = plan(spec, "creator", {}, { visual: { art: { prefer: ["word"] } } });
  assert.ok(kinds(prefer).filter((k) => k === "word").length >= kinds(plan(spec, "creator")).filter((k) => k === "word").length);
  const avoid = plan(spec, "creator", {}, { visual: { art: { avoid: ["numeral", "icon"] } } });
  assert.ok(!kinds(avoid).includes("numeral") && !kinds(avoid).includes("icon"));
  const people = mk([["item", { title: "العميل والمتابع والمصمم", body: "ناس", ord: 1 }], ["item", { title: "الفريق والزبون", body: "ناس", ord: 2 }]]);
  const none = plan(people, "creator", { caps: { ...SLICE, art: { icon: ["icon"] } } }, { visual: { art: { constraints: { figures: "none" } } } });
  for (const s of none.slides) { const n = s.visual.anchor.icon; if (n && FLAGS[n]) assert.ok(!FLAGS[n].h, `${n} is a human figure`); }
});

test("a locked slide is kept out of the plan; a partial visual keeps its fields and the planner completes the rest", () => {
  const spec = rich("eg-creator-rich");
  spec.slides[3].visual = { lock: true, anchor: { kind: "word", word: "اكتب" }, recipe: "under", tone: "invert" };
  const out = plan(spec, "creator");
  assert.ok(!out.slides.some((s) => s.id === "s04"), "the locked slide has no entry");
  assert.ok(out.slides.length >= 8);
  const partial = rich("eg-creator-rich");
  partial.slides[3].visual = { anchor: { kind: "mock", mock: { kind: "chat" } } };
  const p = plan(partial, "creator").slides.find((s) => s.id === "s04").visual;
  assert.equal(p.anchor.kind, "mock");
  assert.equal(p.anchor.mock.kind, "chat", "the stored mock kind wins");
  assert.ok(p.recipe && p.tone && p.why, "the rest is completed");
  const recipe = rich("eg-creator-rich");
  recipe.slides[3].visual = { recipe: "full" };
  assert.equal(plan(recipe, "creator").slides.find((s) => s.id === "s04").visual.recipe, "full");
});

test("a stored partial anchor is held to the capabilities: its sub picks the candidate, an unsupported one is skipped with a note", () => {
  const caps = { ...SLICE, art: { ...SLICE.art, mock: ["chat", "notes"] } }, why = (sub) => DATA.labels["mock." + sub].ar;
  const withMock = (anchor) => { const spec = rich("eg-creator-rich"); spec.slides[3].visual = { anchor }; return plan(spec, "creator", { caps }); };
  const at = (out) => out.slides.find((s) => s.id === "s04"), notes = (out) => out.notes.filter((n) => n.slide === "s04" && n.code !== "plan.demo-undrawn");
  // a receipt is not in caps: nothing is planned for the slide, the stored visual stays as it is, and the note names what was asked
  for (const kind of ["receipt", "browser"]) {
    const out = withMock({ kind: "mock", mock: { kind } });
    assert.equal(at(out), undefined, `${kind}: no planned anchor`);
    assert.deepEqual(plain(notes(out)), [{ slide: "s04", code: "plan.unsupported", want: `mock:${kind}` }]);
    assert.ok(!out.slides.some((s) => JSON.stringify(s.visual).includes('"' + kind + '"')), `${kind} is nowhere in the plan`);
  }
  // a supported sub is planned as that sub, and the rationale names it (the step table has a notes mock only: chat is the stored intent)
  for (const sub of ["chat", "notes"]) {
    const v = at(withMock({ kind: "mock", mock: { kind: sub } })).visual;
    assert.equal(v.anchor.mock.kind, sub);
    assert.ok(v.why.includes(why(sub)) && !v.why.includes(why(sub === "chat" ? "notes" : "chat")), `${sub}: ${v.why}`);
    assert.ok(v.recipe && v.tone, "the rest is completed");
  }
  // no sub asked for: the best candidate of the kind
  assert.equal(at(withMock({ kind: "mock" })).visual.anchor.mock.kind, "notes");
  // the same rule for the other kinds
  for (const [anchor, want] of [[{ kind: "chart", chart: { kind: "donut", values: [] } }, "chart:donut"], [{ kind: "numeral", companion: "ring" }, "numeral:ring"], [{ kind: "scene", template: "trio" }, "scene:trio"], [{ kind: "photo" }, "photo"]]) {
    const out = withMock(anchor);
    assert.equal(at(out), undefined, want);
    assert.deepEqual(plain(notes(out)), [{ slide: "s04", code: "plan.unsupported", want }]);
  }
  assert.equal(at(withMock({ kind: "icon", icon: "pencil" })).visual.anchor.icon, "pencil", "a supported kind the table cannot place is carried as stored");
  // every emitted anchor is one a builder is registered for, whatever was stored
  for (const sub of ["receipt", "chat", "notes", undefined]) for (const pid of ["creator", "poster"]) {
    const spec = rich("eg-creator-rich"); spec.slides[3].visual = { anchor: { kind: "mock", ...(sub ? { mock: { kind: sub } } : {}) } };
    for (const s of plan(spec, pid, { caps }).slides) { const a = s.visual.anchor; assert.ok(a.kind === "none" || caps.art[a.kind]?.includes(V._.pl.sub(a)), `${pid} ${sub} ${s.id} ${JSON.stringify(a)}`); }
  }
});

test("notes: C2.demo-missing for a step without demo, VA5.relaxed with the level", () => {
  const out = plan(mk([["step", { title: "اكتب", body: "ورقة", ord: 1 }]]), "creator");
  assert.deepEqual(plain(out.notes.filter((n) => n.code === "C2.demo-missing").map((n) => n.slide)), ["s02"]);
  const relaxed = plan(mk(items(3)), "creator", { data: synth({ item: [cand("k.a", "word", "solid")] }, { H2: { maxRunKey: 1 }, H1: { maxRunKind: 9 } }) });
  assert.deepEqual(plain(relaxed.notes.filter((n) => n.code === "VA5.relaxed")), [{ slide: "s03", code: "VA5.relaxed", level: 5 }, { slide: "s04", code: "VA5.relaxed", level: 5 }]);
});

/* ---- autoPreview ------------------------------------------------------------------------------------------------------------------------ */

test("autoPreview is aligned with spec.slides, skips the cover and stored plans, and is stable", () => {
  const live = boot();
  live.visual.caps = () => clone(SLICE);                                                    // the capabilities cs-art would report
  const spec = rich("eg-creator-rich");
  spec.slides[4].visual = { anchor: { kind: "field" }, recipe: "full" };
  const a = live.visual.autoPreview(spec, null, P.creator), full = live.visual.plan(spec, null, P.creator, null);
  assert.equal(a.length, spec.slides.length);
  assert.equal(a[0], null, "cover");
  assert.equal(a[4], null, "stored plan");
  spec.slides.forEach((s, i) => { if (i && i !== 4 && full.slides.find((q) => q.id === s.id)) assert.deepEqual(plain(a[i]), plain(full.slides.find((q) => q.id === s.id).visual), s.id); });
  assert.equal(live.visual.autoPreview(spec, null, P.creator), a, "memoised for an unchanged deck");
  const other = clone(spec); other.slides[1].headline += " ";
  assert.notEqual(live.visual.autoPreview(other, null, P.creator), a);
  assert.deepEqual(plain(live.visual.autoPreview({ slides: [] }, null, P.creator)), []);
});

test("autoPreview is invalidated by what the plan was made from: the effective preset under an unchanged id, the canvas, the capabilities, the tables and the brand art", () => {
  const live = boot(), V2 = live.visual;
  let caps = clone(SLICE);
  V2.caps = () => clone(caps);
  const spec = rich("eg-creator-rich"), fresh = (s, p, b = null) => { const out = V2.plan(s, b, p, null); return s.slides.map((q) => (q.visual ? null : plain(out.slides.find((x) => x.id === q.id)?.visual))); };
  const a = V2.autoPreview(spec, null, P.creator);
  assert.ok(a.filter(Boolean).length >= 6);
  assert.equal(V2.autoPreview(spec, null, P.creator), a, "memoised while nothing changes");
  // 1. the preset keeps its id and loses its art block: plan() plans nothing, so must the preview
  const bare = clone(P.creator); delete bare.art;
  assert.equal(bare.id, P.creator.id);
  assert.deepEqual(plain(V2.plan(spec, null, bare, null).slides), []);
  assert.deepEqual(plain(V2.autoPreview(spec, null, bare)), spec.slides.map(() => null));
  assert.deepEqual(plain(V2.autoPreview(spec, null, P.creator)), plain(a), "and back");
  // 2. the same id, other affinities
  const word = clone(P.creator);
  for (const k of Object.keys(word.art.affinity)) word.art.affinity[k] = k === "word" ? 1 : 0;
  const w = V2.autoPreview(spec, null, word);
  assert.deepEqual(plain(w), fresh(spec, word));
  assert.notEqual(w, a, "changing affinities invalidates the memoised preview even if the winning anchors stay the same");
  // 3. capabilities
  caps = { ...SLICE, art: { ...SLICE.art, mock: [] } };
  const c = V2.autoPreview(spec, null, P.creator);
  assert.ok(!c.some((v) => v?.anchor.kind === "mock") && a.some((v) => v?.anchor.kind === "mock"));
  caps = clone(SLICE);
  assert.deepEqual(plain(V2.autoPreview(spec, null, P.creator)), plain(a));
  // 4. the canvas
  const tall = clone(spec); tall.canvas = { ...(spec.canvas || {}), w: 1080, h: 1920 };
  assert.deepEqual(plain(V2.autoPreview(tall, null, P.creator)), fresh(tall, P.creator));
  assert.notDeepEqual(plain(V2.autoPreview(tall, null, P.creator)), plain(a), "a taller canvas changes the shares");
  // 5. the tables: a block loaded afresh is another table, whatever the preset id
  const D = clone(V2._.block("cs-art-direction"));
  for (const t of Object.values(D.anchorTable.types)) t.candidates = (t.candidates || []).filter((q) => q.kind !== "mock");
  V2._.blocks = { ...V2._.blocks, "cs-art-direction": D };
  assert.notDeepEqual(plain(V2.autoPreview(spec, null, P.creator)), plain(a));
  assert.deepEqual(plain(V2.autoPreview(spec, null, P.creator)), fresh(spec, P.creator));
  // 6. the brand art
  const brand = { visual: { art: { avoid: ["numeral", "mock"] } } };
  assert.deepEqual(plain(V2.autoPreview(spec, brand, P.creator)), fresh(spec, P.creator, brand));
});

/* ---- the stored visual is valid against the spec schema ----------------------------------------------------------------------------------------- */

test("every visual, variant and style the planner writes validates against the closed schema", () => {
  const schema = specSchema();
  for (const name of Object.keys(DK)) for (const pid of ["creator", "poster"]) {
    const spec = rich(name), out = plan(spec, pid);
    for (const s of out.slides) assert.deepEqual(visualErrors(s.visual, schema), [], `${name} ${pid} ${s.id}`);
    const merged = apply(spec, out), errs = [];
    for (const k of ["planV", "motif"]) if (merged.style[k] !== undefined) errs.push(...visualErrors({}, schema));
    assert.match(merged.style.planV, /^[0-9.]+\+[0-9a-f]{8}\+[0-9a-f]{8}$/);
    assert.ok(merged.style.planV.length <= 60);
    assert.deepEqual(errs, []);
  }
});

/* ---- the golden plans ----------------------------------------------------------------------------------------------------------------------------- */

const GOLDEN = [
  ["eg-creator-rich", "creator"], ["eg-creator-rich", "poster"], ["eg-poster-rich", "poster"], ["eg-poster-rich", "creator"], ["en-creator", "creator"],
  ["en-creator", "poster"], ["gulf-poster", "poster"], ["gulf-poster", "creator"], ["fixture:spec.eg.8slides.json", "creator"], ["fixture:spec.levant.10slides.json", "poster"],
];

for (const [name, pid] of GOLDEN) {
  test(`golden plan: ${name} on ${pid}`, () => {
    const spec = name.startsWith("fixture:") ? fixture(name.slice(8)) : rich(name), out = plan(spec, pid), file = join(EXPECTED, "plans", `${name.replace(/^fixture:spec\./, "").replace(/\.json$/, "")}@${pid}.json`);
    if (process.env.UPDATE_EXPECTED) { mkdirSync(join(EXPECTED, "plans"), { recursive: true }); writeFileSync(file, JSON.stringify(plain(out), null, 2) + "\n", "utf8"); return; }
    assert.ok(existsSync(file), `${file} is missing: UPDATE_EXPECTED=1 node --test tests/unit/js/visual/plan.test.mjs`);
    assert.deepEqual(plain(out), readJson(file));
  });
}

/* ---- the real chunk ------------------------------------------------------------------------------------------------------------------------------------ */

test("the built chunk: node tools/build.mjs --module visual loads in a vm and CS.visual.caps() feeds the planner", (t) => {
  const tmp = mkdtempSync(join(process.env.CS_TMP || tmpdir(), "cs-plan-"));   // $CS_TMP when set, else the operating system temp folder
  try {
    const built = spawnSync(process.execPath, [join(ROOT, "tools", "build.mjs"), "--module", "visual", "--out", join(tmp, "v")], { encoding: "utf8" });
    assert.equal(built.status, 0, built.stderr || built.stdout);
    const art = spawnSync(process.execPath, [join(ROOT, "tools", "build.mjs"), "--module", "art", "--out", join(tmp, "a")], { encoding: "utf8" });
    const sb = {}; sb.window = sb; vm.createContext(sb);
    const lib = ["root.js", "canon.js"].map((f) => readFileSync(join(ROOT, "src", "lib", f), "utf8")).join("\n");
    vm.runInContext(`(function(){"use strict";var CS=(window.CS=window.CS||{});\n${lib}\n})();`, sb);
    vm.runInContext("CS = window.CS; CS.core.freeze = CS.core.freeze || { visual: {} };", sb);      // cs-visual loads after cs-core in the page; hooks.js reads core.freeze.visual when it loads, so the bare vm gets that one member
    vm.runInContext(readFileSync(join(tmp, "v", "cs-visual.js"), "utf8"), sb);
    if (art.status === 0 && existsSync(join(tmp, "a", "cs-art.js"))) vm.runInContext(readFileSync(join(tmp, "a", "cs-art.js"), "utf8"), sb);
    const live = sb.CS.visual;
    live._.blocks = V._.blocks;
    assert.equal(typeof live.plan, "function");
    const caps = live.caps();
    assert.ok(caps.hash && caps.art, "caps");
    const out = live.plan(rich("eg-creator-rich"), null, P.creator, null);       // default caps: whatever cs-art registers today
    assert.ok(Array.isArray(out.slides));
    assert.match(out.style.planV, /^1\.1\.0\+[0-9a-f]{8}\+[0-9a-f]{8}$/);
    assert.equal(JSON.stringify(plain(live.plan(rich("eg-creator-rich"), null, P.creator, null))), JSON.stringify(plain(out)), "two runs in the built chunk");
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});
