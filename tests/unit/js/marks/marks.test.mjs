// tests/unit/js/marks/marks.test.mjs · the hand-authored mark library (SK/data/art/marks.json, spec 3.5, package D7).
// Run: node --test "tests/unit/js/marks/*.test.mjs"
// Covers: shape of the file, the path grammar, bounds of every template, arrow anchors, closed brush polygons with the fixed
// taper, the size budget, determinism (the file equals what the authored source builds) and the placement maths.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  MARKS_PATH, loadMarks, parsePath, formatPath, flatten, curveBox, brushPolygon, polygonArea, profileAt, place, renderMark, widthFor,
  contentSize, jitter, applyJitter, fnv1a64,
} from "./lib.mjs";
import { buildMarks, serialise } from "./author.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const lib = loadMarks();
const byId = new Map(lib.marks.map((m) => [m.id, m]));
const fam = (f) => lib.marks.filter((m) => m.family === f);

const REQUIRED = {
  arrow: ["arrow-curve", "arrow-loop", "arrow-double", "arrow-scribble", "arrow-hook", "arrow-down", "arrow-dashed", "arrow-bracket"],
  circle: ["circle-scribble", "circle-rough-rect", "circle-double", "circle-open"],
  underline: ["underline-straight", "underline-wavy", "underline-double", "underline-brush"],
  strike: ["strike-line", "strike-cross", "strike-scribble", "strike-double"],
  kashida: ["kashida-bar"],
};

/* ---- shape --------------------------------------------------------------------------------------------------- */

test("header: version, box, families and the brush profile", () => {
  assert.equal(lib.schemaVersion, 1);
  assert.equal(lib.dataVersion, "1.1.0");
  assert.equal(lib.box, 100);
  assert.deepEqual(lib.families, ["arrow", "circle", "underline", "strike", "doodle", "kashida"]);
  for (const form of ["line", "brush"]) {
    const r = lib[form];
    assert.ok(r.wRatio > 0 && r.wMin > 0 && r.wMax >= r.wMin, form + " width rule");
  }
  const prof = lib.brush.profile;
  assert.ok(prof.length >= 4);
  assert.equal(prof[0][0], 0);
  assert.equal(prof[prof.length - 1][0], 1);
  for (let i = 0; i < prof.length; i++) {
    assert.ok(prof[i][1] > 0 && prof[i][1] <= 1, "profile width in (0, 1]");
    if (i) assert.ok(prof[i][0] > prof[i - 1][0], "profile t strictly increases");
  }
  assert.ok(prof[0][1] < 0.5 && prof[prof.length - 1][1] < 0.1, "both ends taper");
  assert.equal(Math.max(...prof.map((p) => p[1])), 1, "the widest point is the base width");
});

test("the library has every required template, ids are unique and carry their family", () => {
  for (const [f, ids] of Object.entries(REQUIRED)) {
    assert.deepEqual(fam(f).map((m) => m.id).filter((id) => ids.includes(id)).sort(), [...ids].sort(), f + " templates");
    if (f !== "kashida") assert.equal(fam(f).length, ids.length, f + " count");
  }
  assert.equal(fam("arrow").length, 8);
  assert.equal(fam("circle").length, 4);
  assert.equal(fam("underline").length, 4);
  assert.equal(fam("strike").length, 4);
  assert.ok(fam("doodle").length >= 5, "the doodle family of the 3.5 table");
  assert.equal(new Set(lib.marks.map((m) => m.id)).size, lib.marks.length, "unique ids");
  for (const m of lib.marks) {
    assert.ok(lib.families.includes(m.family), m.id + " family");
    assert.ok(typeof m.id === "string" && /^[a-z]+(-[a-z]+)*$/.test(m.id), m.id + " id form");
    assert.ok(typeof m.d === "string" && m.d.length > 8, m.id + " has a path");
    assert.ok(Number.isFinite(m.aspect) && m.aspect > 0.1 && m.aspect < 60, m.id + " aspect");
    assert.ok(["box", "uniform", "pair"].includes(m.fit), m.id + " fit");
    if (["arrow", "circle", "underline", "strike", "kashida"].includes(m.family)) assert.ok(m.id.startsWith(m.family + "-"), m.id + " names its family");
  }
});

test("fit follows the family: arrows pair, ring/underline/strike/kashida box, doodles uniform", () => {
  for (const m of fam("arrow")) assert.equal(m.fit, "pair", m.id);
  for (const f of ["circle", "underline", "strike", "kashida"]) for (const m of fam(f)) assert.equal(m.fit, "box", m.id);
  for (const m of fam("doodle")) assert.equal(m.fit, "uniform", m.id);
});

/* ---- grammar and bounds ---------------------------------------------------------------------------------------- */

test("path grammar: absolute M L C Z, at most one decimal, every subpath opens with M", () => {
  for (const m of lib.marks) {
    for (const key of ["d", "centreline"]) {
      if (m[key] === undefined) continue;
      assert.match(m[key], /^[MLCZ0-9 .\-]+$/, m.id + "." + key + " characters");
      assert.ok(!/\d\.\d\d/.test(m[key]), m.id + "." + key + " one decimal at most");
      assert.ok(m[key].startsWith("M"), m.id + "." + key + " starts with M");
      const subs = parsePath(m[key]);
      assert.ok(subs.length >= 1);
      for (const s of subs) {
        assert.ok(s.segs.length >= 1, m.id + " subpath draws something");
        assert.ok([s.start, ...s.segs.map((g) => g.p)].every((p) => p.every(Number.isFinite)));
      }
      assert.equal(formatPath(subs, 1), m[key], m.id + "." + key + " round-trips");
    }
  }
});

test("bounds: the drawn curve stays inside the 100 x 100 box and fills it", () => {
  for (const m of lib.marks) {
    const subs = parsePath(m.d);
    const b = curveBox(subs, 32);
    assert.ok(b.x0 >= -0.6 && b.y0 >= -0.6 && b.x1 <= 100.6 && b.y1 <= 100.6, `${m.id} curve inside the box (${b.x0.toFixed(1)},${b.y0.toFixed(1)} - ${b.x1.toFixed(1)},${b.y1.toFixed(1)})`);
    for (const s of subs) for (const p of [s.start, ...s.segs.flatMap((g) => (g.t === "C" ? [g.c1, g.c2, g.p] : [g.p]))]) {
      assert.ok(p[0] >= -14 && p[0] <= 114 && p[1] >= -14 && p[1] <= 114, m.id + " control point near the box");
    }
    if (m.fit === "box") {
      assert.ok(b.w >= 98.5 && b.h >= 98.5, `${m.id} box fit spans the box (${b.w.toFixed(1)} x ${b.h.toFixed(1)})`);
    } else {
      assert.ok(Math.max(b.w, b.h) >= 98.5, m.id + " long side spans the box");
      const cx = b.x0 + b.w / 2, cy = b.y0 + b.h / 2;
      assert.ok(Math.abs(cx - 50) <= 1.5 && Math.abs(cy - 50) <= 1.5, m.id + " content is centred");
    }
    const natural = b.w / b.h;
    if (m.fit === "box") assert.ok(m.aspect > 0, m.id);
    else assert.ok(Math.abs(natural - m.aspect) / m.aspect < 0.03, `${m.id} aspect ${m.aspect} matches the content ${natural.toFixed(2)}`);
  }
});

test("arrows: tail and tip are real stroke ends, far apart, inside the box", () => {
  for (const m of fam("arrow")) {
    assert.ok(Array.isArray(m.tail) && Array.isArray(m.tip) && m.tail.length === 2 && m.tip.length === 2, m.id);
    const dist = Math.hypot(m.tip[0] - m.tail[0], m.tip[1] - m.tail[1]);
    assert.ok(dist >= 40, `${m.id} tail to tip is ${dist.toFixed(1)}`);
    const subs = parsePath(m.d);
    const starts = subs.map((s) => s.start), ends = subs.map((s) => (s.segs.length ? s.segs[s.segs.length - 1].p : s.start));
    const near = (p, list) => Math.min(...list.map((q) => Math.hypot(p[0] - q[0], p[1] - q[1])));
    if (m.id !== "arrow-bracket") assert.ok(near(m.tail, starts) <= 1.2, m.id + " tail is the start of a stroke");
    assert.ok(near(m.tip, ends) <= 1.2, m.id + " tip is the end of a stroke");
    const tipCount = ends.filter((e) => Math.hypot(e[0] - m.tip[0], e[1] - m.tip[1]) <= 1.2).length;
    assert.ok(tipCount >= 3, `${m.id}: the shaft and two barbs meet at the tip (${tipCount})`);
    for (const p of [m.tail, m.tip]) assert.ok(p.every((v) => v >= 0 && v <= 100));
  }
});

test("a tall arrow stays tall, a long underline stays long: aspect orders the families", () => {
  assert.ok(byId.get("arrow-down").aspect < 0.5);
  for (const m of fam("underline")) assert.ok(m.aspect >= 8, m.id);
  for (const m of fam("circle")) assert.ok(m.aspect >= 1 && m.aspect <= 3, m.id);
  assert.ok(byId.get("kashida-bar").aspect >= 8);
});

/* ---- brush polygons ------------------------------------------------------------------------------------------- */

function targetFor(m) {
  if (m.fit === "pair") return { from: [40, 220], to: [260, 70] };
  if (m.fit === "uniform") return { x: 0, y: 0, w: 160, h: 160 };
  const w = 320;
  return { x: 10, y: 10, w, h: Math.max(60, Math.round(w / m.aspect)) };
}

test("brush form: one closed polygon per stroke, tapered by the fixed profile, no glitch geometry", () => {
  for (const m of lib.marks) {
    if (m.form === "fill") continue;
    const target = targetFor(m);
    const r = renderMark(lib, m, target, { form: "brush" });
    const subs = parsePath(m.d);
    assert.equal(r.polys.length, subs.length, m.id + " one polygon per stroke");
    assert.equal((r.d.match(/M/g) || []).length, subs.length, m.id + " M count");
    assert.equal((r.d.match(/Z/g) || []).length, subs.length, m.id + " Z count (every polygon is closed)");
    assert.match(r.d, /^M[-\d. LZM]+$/, m.id + " polygon uses M L Z only");
    const base = r.width;
    for (const poly of r.polys) {
      assert.ok(poly.length >= 24 && poly.length % 2 === 0, m.id + " polygon has a left and a right side");
      assert.ok(poly.every((p) => Number.isFinite(p[0]) && Number.isFinite(p[1])), m.id + " finite points");
      assert.ok(Math.abs(polygonArea(poly)) > 4, m.id + " polygon has an area");
      const half = poly.length / 2;
      for (const i of [0, Math.floor(half / 4), Math.floor(half / 2), half - 1]) {
        const w = Math.hypot(poly[i][0] - poly[poly.length - 1 - i][0], poly[i][1] - poly[poly.length - 1 - i][1]);
        const expect = base * profileAt(m.profile || lib.brush.profile, i / (half - 1));
        assert.ok(Math.abs(w - expect) < 0.02, `${m.id} width ${w.toFixed(3)} follows the profile ${expect.toFixed(3)} at ${i}`);
      }
      const end = Math.hypot(poly[half - 1][0] - poly[half][0], poly[half - 1][1] - poly[half][1]);
      const start = Math.hypot(poly[0][0] - poly[poly.length - 1][0], poly[0][1] - poly[poly.length - 1][1]);
      assert.ok(end < base * 0.12 && start < base * 0.4, m.id + " both ends are tapered");
    }
  }
});

test("brush polygons stay near their strokes: the ink box is the stroke box plus half the width", () => {
  for (const m of lib.marks) {
    if (m.form === "fill") continue;
    const target = targetFor(m);
    const r = renderMark(lib, m, target, { form: "brush" });
    const stroke = curveBox(place(m, target), 32);
    const ink = curveBox(r.polys.map((p) => ({ start: p[0], segs: p.slice(1).map((q) => ({ t: "L", p: q })), closed: true })));
    const pad = r.width / 2 + 0.5;
    assert.ok(ink.x0 >= stroke.x0 - pad && ink.y0 >= stroke.y0 - pad && ink.x1 <= stroke.x1 + pad && ink.y1 <= stroke.y1 + pad, m.id + " ink box");
  }
});

test("kashida bar is a closed filled polygon with a flat start and a tapered flourish", () => {
  const k = byId.get("kashida-bar");
  assert.equal(k.form, "fill");
  const subs = parsePath(k.d);
  assert.equal(subs.length, 1);
  assert.equal(subs[0].closed, true);
  assert.match(k.d, /Z$/);
  assert.ok(subs[0].segs.length >= 24, "enough points for a smooth taper");
  assert.ok(typeof k.centreline === "string" && parsePath(k.centreline).length === 1, "centreline kept for a re-draw at another weight");
  assert.ok(Array.isArray(k.profile) && k.profile[0][1] === 1 && k.profile[k.profile.length - 1][1] < 0.1);
  const poly = [subs[0].start, ...subs[0].segs.map((g) => g.p)];
  assert.ok(Math.abs(polygonArea(poly)) > 100, "the bar has body");
  const r = renderMark(lib, k, { x: 0, y: 0, w: 520, h: 50 }, { form: "brush" });
  assert.equal(r.form, "fill");
  assert.match(r.d, /^M[-\d. LZ]+Z$/);
  assert.ok(brushPolygon(parsePath(k.centreline)[0], 8, k.profile, 12).length === 24);
});

/* ---- size and determinism -------------------------------------------------------------------------------------- */

test("size: the library is at most 20 KB and every template is lean", () => {
  const bytes = statSync(MARKS_PATH).size;
  assert.ok(bytes <= 20 * 1024, `marks.json is ${bytes} bytes`);
  for (const m of lib.marks) assert.ok(m.d.length <= 1800, `${m.id} path is ${m.d.length} characters`);
  const paths = lib.marks.reduce((n, m) => n + m.d.length, 0);
  assert.ok(paths <= 14000, "path data total " + paths);
});

test("determinism: the file on disk is exactly what the authored source builds, twice over", () => {
  const a = serialise(buildMarks()), b = serialise(buildMarks());
  assert.equal(a, b);
  assert.equal(readFileSync(MARKS_PATH, "utf8"), a, "run: node tests/unit/js/marks/author.mjs");
  assert.equal(readFileSync(MARKS_PATH, "utf8").includes("\r"), false, "LF only");
});

test("no randomness or clock in the library or its source (rule A8)", () => {
  for (const f of ["lib.mjs", "author.mjs"]) {
    const src = readFileSync(resolve(here, f), "utf8").replace(/\/\/.*$/gm, "");
    assert.ok(!/Math\.random|Date\.|new Date|performance\./.test(src), f);
  }
});

/* ---- placement -------------------------------------------------------------------------------------------------- */

test("pair fit maps the tail to the start point and the tip to the end point for every arrow", () => {
  for (const m of fam("arrow")) {
    for (const [from, to] of [[[40, 220], [260, 70]], [[300, 40], [60, 120]], [[0, 0], [0, 200]]]) {
      const subs = place(m, { from, to });
      const probe = place({ ...m, d: `M${m.tail[0]} ${m.tail[1]}L${m.tip[0]} ${m.tip[1]}` }, { from, to })[0];
      assert.ok(Math.hypot(probe.start[0] - from[0], probe.start[1] - from[1]) < 1e-6, m.id + " tail");
      assert.ok(Math.hypot(probe.segs[0].p[0] - to[0], probe.segs[0].p[1] - to[1]) < 1e-6, m.id + " tip");
      assert.equal(subs.length, parsePath(m.d).length);
    }
    const flip = place({ ...m, d: `M${m.tail[0]} ${m.tail[1]}L${m.tip[0]} ${m.tip[1]}` }, { from: [10, 10], to: [210, 10] }, { bow: true })[0];
    assert.ok(Math.hypot(flip.start[0] - 10, flip.start[1] - 10) < 1e-6 && Math.hypot(flip.segs[0].p[0] - 210, flip.segs[0].p[1] - 10) < 1e-6, m.id + " bow keeps the ends");
    /* the shaft really bows the other way: every point mirrors across the horizontal axis y = 10 */
    const plain = flatten(place(m, { from: [10, 10], to: [210, 10] })[0], 8), bowed = flatten(place(m, { from: [10, 10], to: [210, 10] }, { bow: true })[0], 8);
    for (let i = 0; i < plain.length; i++) assert.ok(Math.abs(plain[i][0] - bowed[i][0]) < 1e-6 && Math.abs(plain[i][1] + bowed[i][1] - 20) < 1e-6, m.id + " bow mirrors the shaft");
  }
});

test("box fit stretches the box to the rect; rtl mirrors x exactly; flipY mirrors y", () => {
  const m = byId.get("circle-scribble");
  const rect = { x: 30, y: 50, w: 400, h: 160 };
  const a = curveBox(place(m, rect), 32);
  assert.ok(Math.abs(a.x0 - rect.x) < 1 && Math.abs(a.y0 - rect.y) < 1 && Math.abs(a.x1 - (rect.x + rect.w)) < 1 && Math.abs(a.y1 - (rect.y + rect.h)) < 1);
  const f = (p) => p;
  const ltr = flatten(place(m, rect)[0], 6), rtl = flatten(place(m, rect, { rtl: true })[0], 6);
  for (let i = 0; i < ltr.length; i++) {
    assert.ok(Math.abs(ltr[i][0] + rtl[i][0] - (2 * rect.x + rect.w)) < 1e-6, "x mirrors about the rect centre");
    assert.ok(Math.abs(ltr[i][1] - rtl[i][1]) < 1e-6, "y is unchanged");
  }
  const flipped = flatten(place(m, rect, { flipY: true })[0], 6);
  for (let i = 0; i < ltr.length; i++) assert.ok(Math.abs(ltr[i][1] + flipped[i][1] - (2 * rect.y + rect.h)) < 1e-6);
  void f;
});

test("uniform fit keeps the proportions and centres the content", () => {
  const m = byId.get("squiggle");
  const rect = { x: 100, y: 100, w: 300, h: 300 };
  const b = curveBox(place(m, rect), 32);
  const cs = contentSize(m.aspect);
  assert.ok(Math.abs(b.w / b.h - cs.w / cs.h) / (cs.w / cs.h) < 0.03);
  assert.ok(Math.abs(b.x0 + b.w / 2 - 250) < 5 && Math.abs(b.y0 + b.h / 2 - 250) < 5);
  assert.ok(b.w <= 300.5 && b.h <= 300.5 && b.w >= 295);
});

test("widths come from the library ratios and are clamped", () => {
  const small = widthFor(lib, "brush", { x: 0, y: 0, w: 40, h: 40 });
  const big = widthFor(lib, "brush", { x: 0, y: 0, w: 900, h: 900 });
  assert.equal(small, lib.brush.wMin);
  assert.equal(big, lib.brush.wMax);
  assert.ok(widthFor(lib, "line", { from: [0, 0], to: [200, 0] }) >= lib.line.wMin);
});

test("seeded jitter stays inside the spec bounds and is repeatable", () => {
  const seen = new Set();
  for (let i = 0; i < 200; i++) {
    const j = jitter("slide-" + i + "|circle");
    assert.ok(Math.abs(j.rot) <= 3 && Math.abs(j.scale - 1) <= 0.04 && Math.abs(j.skew) <= 2, "within 3 deg, 4 percent, 2 deg");
    assert.deepEqual(j, jitter("slide-" + i + "|circle"));
    seen.add(j.rot.toFixed(3));
  }
  assert.ok(seen.size > 150, "the seed actually varies the result");
  assert.equal(fnv1a64("").toString(16), "cbf29ce484222325");
  assert.equal(fnv1a64("a").toString(16), "af63dc4c8601ec8c");
  const m = byId.get("underline-wavy");
  const subs = place(m, { x: 0, y: 0, w: 300, h: 30 });
  const j = applyJitter(subs, jitter("x"));
  assert.equal(JSON.stringify(applyJitter(subs, jitter("x"))), JSON.stringify(j));
  const b = curveBox(j, 16), b0 = curveBox(subs, 16);
  assert.ok(Math.abs(b.w - b0.w) / b0.w < 0.08, "jitter does not change the size noticeably");
});
