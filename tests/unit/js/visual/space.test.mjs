// tests/unit/js/visual/space.test.mjs · V1b (re-opens V1): CS.visual.deadSpace (spec 7.1-7.2) and CS.visual.geometry (spec 4.1-4.2) under the
// measurement contract v2 (build plan r2 1.1 row 8): units declared in the headers, opts.strict (an owner with no measured fill or border does not
// qualify), rows capped at five in both languages (S-21).
// The 28 Appendix B cases come from the oracle (tests/visual/cases/oracle.py, run once by make_cases.py), the recipe vectors are worked out
// by hand from the spec, the fuzz file pins the JavaScript result for the Python twin (tests/unit/py/test_space.py reads the same files).
// The source files are loaded one by one into a bare vm context, so other packages filling their own files of cs-visual change nothing here.
// Run: node --test tests/unit/js/visual/space.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { CASES, ROOT, loadVisual, readJson } from "../../../visual/cases/load.mjs";

const CS = loadVisual();
const ds = CS.visual.deadSpace;
const geo = CS.visual.geometry;
const plain = (v) => JSON.parse(JSON.stringify(v === undefined ? null : v));
const appendix = readJson("appendix-b.json").cases;
const byName = (name) => appendix.find((c) => c.name === name);
const run = (boxes, zone = { w: 852, h: 888 }, opts) => plain(ds(boxes, zone, opts));
const T = (x, y, w, h, extra) => Object.assign({ kind: "text", x, y, w, h }, extra);
const I = (x, y, w, h, extra) => Object.assign({ kind: "ink", x, y, w, h }, extra);
const O = (id, x, y, w, h, extra) => Object.assign({ kind: "owner", id, x, y, w, h, fill: 1 }, extra);   // a measured owner: fill is an opacity 0-1
const U = (id, x, y, w, h, extra) => Object.assign({ kind: "owner", id, x, y, w, h }, extra);           // an unmeasured owner: no fill, no border
const deepFreeze = (v) => { if (v && typeof v === "object") { Object.values(v).forEach(deepFreeze); Object.freeze(v); } return v; };

/* ---- shape, budget, rules ------------------------------------------------------------------------------------------------ */

test("space.js and geometry.js stay inside their budgets (8 and 6 KiB) and follow the build rules", () => {
  const sizes = { "space.js": 8 * 1024, "geometry.js": 6 * 1024 };
  for (const [file, cap] of Object.entries(sizes)) {
    const path = join(ROOT, "src", "visual", file);
    assert.ok(statSync(path).size <= cap, `${file} is ${statSync(path).size} bytes, the budget is ${cap}`);
    const text = readFileSync(path, "utf8");
    assert.ok(text.startsWith(`/* src/visual/${file} - owned by V1b`), file);
    assert.ok(/\(function \(\) \{[\s\S]*\}\)\(\);\s*$/.test(text), `${file} wraps itself in an IIFE`);
    const banned = new RegExp(["Math\\.random", "\\bDate\\b", "\\bperformance\\b", "analy" + "tics", "<\\/" + "script", "<" + "!--", "\\bfetch\\(", "XMLHttpRequest", "getBoundingClientRect", "\\bdocument\\b"].join("|"));
    assert.ok(!banned.test(text), `${file} contains a banned token`);
  }
});

test("the members are registered through CS.visual._.register", () => {
  assert.equal(typeof ds, "function");
  assert.equal(typeof ds.strokeBoxes, "function");
  assert.deepEqual(Object.keys(geo).sort(), ["G", "GAP", "limits", "recipe", "recipes", "rowsMax", "zone"]);
  assert.deepEqual(plain(geo.recipes), ["under", "over", "start", "end", "full", "band", "corner", "center", "half"]);
});

/* ---- the oracle cases ---------------------------------------------------------------------------------------------------- */

test("the 28 cases: cells exactly, band, rectangle, empty cells and anchor share to 0.1, owner verdicts", () => {
  assert.equal(appendix.length, 28);
  for (const c of appendix) {
    const r = run(c.boxes, c.zone);
    assert.deepEqual(r.cells, c.expect.cells, `${c.id}: cells`);
    for (const k of ["band", "rect", "fill", "anchorShare"]) assert.ok(Math.abs(r[k] - c.expect[k]) <= 0.1, `${c.id}: ${k} ${r[k]} vs ${c.expect[k]}`);
    assert.deepEqual(r.owners.map((o) => o.ok), c.expect.ownerOk, `${c.id}: owner verdicts`);
  }
});

test("the verdicts of the Appendix B table: FIX and NOTE counts under the thresholds of 7.3", () => {
  const spec = readJson("verdicts.json");
  for (const row of spec.rows) {
    const c = byName(row.name);
    assert.ok(c, row.name);
    const r = run(c.boxes, c.zone);
    const lim = spec.classes[row.class || "working"];
    let fix = 0, note = 0;
    for (const k of ["band", "rect", "fill"]) { if (r[k] >= lim[k][1]) fix++; else if (r[k] >= lim[k][0]) note++; }
    assert.deepEqual({ fix, note }, { fix: row.fix, note: row.note }, row.name);
  }
});

test("the five cheats fail: empty card, lone icon on a panel, drenched ground, scattered marks, pattern over dead area", () => {
  const names = ["cheat: empty card 852x344", "cheat: lone 300 px icon on a 852x344 panel", "cheat: drenched ground (owner 100% of zone), text only",
    "cheat: three 80 px marks scattered", "cheat: bold-dots wall over dead area, no content on it"];
  for (const n of names) {
    const r = run(byName(n).boxes);
    assert.ok(r.band >= 12 || r.rect >= 20 || r.fill >= 50, `${n} must reach FIX`);
  }
  const owners = (n) => run(byName(n).boxes).owners;
  assert.deepEqual(owners("cheat: empty card 852x344").map((o) => o.ok), [false]);
  assert.deepEqual(owners("cheat: lone 300 px icon on a 852x344 panel").map((o) => o.ok), [false]);
  assert.deepEqual(owners("cheat: drenched ground (owner 100% of zone), text only").map((o) => [o.ok, o.need]), [[false, 80]]);
  assert.deepEqual(owners("cheat: bold-dots wall over dead area, no content on it").map((o) => o.ok), [false]);
});

test("the lone icon on a wide panel: rows 100%, columns 43% (the example of 7.2)", () => {
  const o = run(byName("cheat: lone 300 px icon on a 852x344 panel").boxes).owners[0];
  assert.equal(o.rows, 100);
  assert.ok(o.cols > 40 && o.cols < 47, "columns " + o.cols);
  assert.equal(o.need, 65);
});

/* ---- what counts, what never does ---------------------------------------------------------------------------------------- */

test("marks, decoration, tone grounds, ghost numerals, lettermarks and faint text never count", () => {
  const base = byName("recipe under: anchor fills the remainder (scene 852x430)");
  const noise = [{ kind: "mark", x: 0, y: 400, w: 852, h: 400 }, { kind: "decor", x: 0, y: 0, w: 852, h: 888 }, I(0, 0, 852, 888, { ground: true }),
    T(0, 460, 852, 400, { ghost: true }), T(0, 460, 852, 400, { lettermark: true }), T(0, 460, 852, 400, { contrast: 0.2 }), null, {}, T(5, 5, 0, 40), I(5, 5, 40, -3)];
  assert.deepEqual(run(base.boxes.concat(noise), base.zone), run(base.boxes, base.zone));
  assert.notDeepEqual(run(base.boxes.concat([T(0, 460, 852, 400, { contrast: 0.5 })]), base.zone), run(base.boxes, base.zone));
});

test("halos: text 16 px, anchor ink 32 px, images and owners none", () => {
  const text = run([T(300, 300, 100, 50)]);
  assert.deepEqual(run([I(316, 316, 68, 18)]).cells, text.cells);
  assert.deepEqual(run([{ kind: "image", x: 300, y: 300, w: 100, h: 100 }]).cells, run([I(332, 332, 36, 36)]).cells);
  assert.notDeepEqual(run([T(300, 300, 100, 50)]).cells, run([T(300, 300, 100, 50)], undefined, { halo: { text: 40, ink: 32, owner: 0 } }).cells);
});

test("an empty list is all empty; boxes outside the zone paint nothing; boxes are clipped to it", () => {
  const empty = run([]);
  assert.deepEqual([empty.band, empty.rect, empty.fill, empty.anchorShare, empty.owners], [61.7, 100, 100, 0, []]);
  assert.equal(empty.cells.length, 37);
  assert.ok(empty.cells.every((r) => r === ".".repeat(36)));
  assert.deepEqual(run([T(1000, 1000, 100, 100), T(-500, -500, 100, 100)]), empty);
  assert.deepEqual(run([T(-300, -300, 1500, 1500)]).cells, run([T(0, 0, 852, 888)]).cells);
});

test("anchor share: half the zone is 51.4% (19 of 37 rows by 36); anchor false removes a box, anchor true adds text", () => {
  assert.equal(run([I(0, 0, 852, 444)]).anchorShare, 51.4);
  assert.equal(run([I(0, 0, 852, 444, { anchor: false })]).anchorShare, 0);
  assert.equal(run([T(0, 0, 852, 444)]).anchorShare, 0);
  assert.equal(run([T(0, 0, 852, 444, { anchor: true })]).anchorShare, 51.4);
  assert.equal(run([O("a", 0, 0, 852, 444, { fill: 1 })]).anchorShare, 51.4, "a failing container still counts as anchor");
});

/* ---- owners -------------------------------------------------------------------------------------------------------------- */

test("an owner must qualify: a fill of 35% opacity or a border of 3 px", () => {
  const content = [T(10, 10, 832, 280, { ownerOf: "c" })];
  const ok = (extra) => run([U("c", 0, 0, 852, 300, extra)].concat(content)).owners[0].ok;
  assert.equal(ok({ fill: 0.2 }), false);
  assert.equal(ok({ fill: 0.35 }), true);
  assert.equal(ok({ fill: 1 }), true);
  assert.equal(ok({ fill: 0.1, border: 3 }), true);
  assert.equal(ok({ fill: 0.1, border: 2 }), false);
  assert.equal(ok({ border: 4 }), true);
  assert.equal(ok({ fill: 0, border: 0 }), false);
});

/* ---- units and strict (contract v2) -------------------------------------------------------------------------------------- */

test("the headers declare the units: percent 0-100 out, fill an opacity, border and lengths px, and the strict switch", () => {
  const space = readFileSync(join(ROOT, "src", "visual", "space.js"), "utf8").split("*/")[0];
  for (const word of ["PERCENT 0-100", "OPACITY 0-1", "px", "strict", "ownerOf", "anchor?", "path?", "meta"]) assert.ok(space.includes(word), `space.js header lacks "${word}"`);
  const geometry = readFileSync(join(ROOT, "src", "visual", "geometry.js"), "utf8").split("*/")[0];
  for (const word of ["UNITS", "px", "percent 0-100", "rowsMax = 5", "S-21"]) assert.ok(geometry.includes(word), `geometry.js header lacks "${word}"`);
  const py = readFileSync(join(ROOT, "plugins", "carousel-studio", "skills", "carousel-design", "scripts", "_cs", "space.py"), "utf8").split('"""')[1];
  for (const word of ["PERCENT 0-100", "OPACITY 0-1", "px", "strict", "ownerOf", "ROWS_MAX = 5"]) assert.ok(py.includes(word), `space.py docstring lacks "${word}"`);
});

test("units out: every result is a percent on a 0-100 scale to one decimal; the thresholds in opts are percent, a fraction up to 1 reads as percent", () => {
  for (const c of appendix) {
    const r = run(c.boxes, c.zone);
    for (const k of ["band", "rect", "fill", "anchorShare"]) {
      assert.ok(r[k] >= 0 && r[k] <= 100, `${c.id}: ${k} ${r[k]}`);
      assert.equal(Math.round(r[k] * 10) / 10, r[k], `${c.id}: ${k} has one decimal`);
    }
    for (const o of r.owners) assert.ok(o.rows >= 0 && o.rows <= 100 && o.cols >= 0 && o.cols <= 100, c.id);
  }
  const card = [O("c", 0, 0, 852, 500), T(10, 10, 832, 500, { ownerOf: "c" })];
  const same = (a, b) => assert.deepEqual(run(card, undefined, a), run(card, undefined, b));
  same({ owner: { min: 0.65 } }, { owner: { min: 65 } });
  same({ owner: { min: 1 } }, { owner: { min: 100 } });
  same({ occ: 0.3 }, { occ: 30 });
  same({ owner: { fill: 0.35, border: 3 } }, {});
  assert.equal(run(card, undefined, { owner: { min: 100 } }).owners[0].need, 100, "need echoes the threshold in percent");
  const half = [O("c", 0, 0, 852, 300, { fill: 0.5 }), T(10, 10, 832, 280, { ownerOf: "c" })];
  assert.equal(run(half, undefined, { owner: { fill: 0.6 } }).owners[0].ok, false, "an opacity of 0.5 against a 60% threshold");
  assert.equal(run(half, undefined, { owner: { fill: 50 } }).owners[0].ok, true, "and against a 50% threshold");
});

test("strict (the default): an owner with no valid fill and no valid border does not qualify; strict:false is the old reading", () => {
  const content = [T(10, 10, 832, 280, { ownerOf: "c" })];
  const owner = (extra, opts) => run([U("c", 0, 0, 852, 300, extra)].concat(content), undefined, opts).owners[0];
  const pair = (o) => [o.ok, o.meta];
  assert.deepEqual(pair(owner({})), [false, "none"]);
  assert.deepEqual(pair(owner({}, { strict: true })), [false, "none"]);
  assert.deepEqual(pair(owner({}, { strict: false })), [true, "none"]);
  // only an explicit false switches it off
  for (const v of [undefined, null, 0, "", "false"]) assert.equal(owner({}, { strict: v }).ok, false, `strict ${JSON.stringify(v)}`);
  // measured metadata gives the same verdict in both modes
  for (const strict of [true, false]) {
    assert.deepEqual(pair(owner({ fill: 0.5 }, { strict })), [true, "ok"]);
    assert.deepEqual(pair(owner({ fill: 0.2 }, { strict })), [false, "weak"]);
    assert.deepEqual(pair(owner({ border: 3 }, { strict })), [true, "ok"]);
    assert.deepEqual(pair(owner({ border: 2 }, { strict })), [false, "weak"]);
    assert.deepEqual(pair(owner({ fill: 0, border: 0 }, { strict })), [false, "weak"]);
  }
  // a wrong unit or type is not metadata: a percent fill, a negative border, a string, a boolean, NaN
  for (const bad of [{ fill: 35 }, { fill: 100 }, { fill: -0.5 }, { fill: "0.5" }, { fill: true }, { fill: NaN }, { border: -1 }, { border: "4" }, { border: null }, { fill: 35, border: "3" }]) {
    assert.deepEqual(pair(owner(bad)), [false, "none"], JSON.stringify(bad));
    assert.deepEqual(pair(owner(bad, { strict: false })), [true, "none"], JSON.stringify(bad));
  }
  assert.deepEqual(pair(owner({ fill: 35, border: 4 })), [true, "ok"], "a valid border rescues an invalid fill");
  // strict changes only the owners that carry no metadata; boxes of every other kind do not move
  const loose = [T(0, 0, 400, 100), I(0, 150, 200, 200)];
  assert.deepEqual(run(loose), run(loose, undefined, { strict: false }));
});

test("an unmeasured owner counts only through its content, like any failing owner", () => {
  const boxes = (extra) => [U("c", 0, 0, 852, 344, extra), T(212, 20, 640, 120, { ownerOf: "c" })];
  const strict = run(boxes({}));
  assert.equal(strict.owners[0].ok, false);
  assert.deepEqual(strict.cells, run(boxes({ fill: 0.1 })).cells, "the same as an owner with a faint fill");
  assert.deepEqual(run(boxes({}), undefined, { strict: false }).cells, run(boxes({ fill: 1 })).cells);
  assert.ok(strict.rect >= 20, "the empty card cheat still fails: " + strict.rect);
});

test("the Appendix B cases without their metadata: strict rejects every owner, strict:false reproduces the oracle", () => {
  const bare = (boxes) => boxes.map((b) => { const { fill, border, ...rest } = b; return rest; });
  let owners = 0;
  for (const c of appendix) {
    const legacy = run(bare(c.boxes), c.zone, { strict: false });
    const measured = run(c.boxes, c.zone);
    assert.deepEqual(legacy.cells, measured.cells, `${c.id}: cells`);
    assert.deepEqual(legacy.owners.map((o) => o.ok), measured.owners.map((o) => o.ok), `${c.id}: owner verdicts`);
    assert.ok(legacy.owners.every((o) => o.meta === "none") && measured.owners.every((o) => o.meta === "ok"), c.id);
    const strict = run(bare(c.boxes), c.zone);
    assert.ok(strict.owners.every((o) => o.ok === false && o.meta === "none"), `${c.id}: strict`);
    owners += strict.owners.length;
  }
  assert.ok(owners >= 20, "owners in the cases: " + owners);
});

test("an owner above 60% of the zone needs 80% of its rows and columns, a smaller one 65%", () => {
  const rows = (h, ownerOf = "c") => [O("c", 0, 0, 852, h), T(10, 10, 832, 500, { ownerOf })];
  const r700 = run(rows(700)).owners[0];
  assert.deepEqual([r700.ok, r700.need, r700.rows], [false, 80, 73.3]);
  const r500 = run(rows(500)).owners[0];
  assert.deepEqual([r500.ok, r500.need, r500.rows], [true, 65, 100]);
  assert.equal(run(rows(700), undefined, { big: 70 }).owners[0].ok, true, "flat key");
  assert.equal(run(rows(700), undefined, { owner: { big: 0.7 } }).owners[0].ok, true, "nested key, fraction");
  assert.equal(run(rows(700), undefined, { owner: { big: 70 } }).owners[0].ok, true, "nested key, percent");
});

test("a failing owner counts only through its content; a passing one counts whole", () => {
  const filled = run([O("c", 0, 0, 852, 344), T(212, 20, 640, 120, { ownerOf: "c" })]);
  assert.equal(filled.owners[0].ok, false);
  const wall = run([O("c", 0, 400, 852, 488, { pattern: true }), I(100, 420, 200, 200, { ownerOf: "c" })]);
  assert.equal(wall.owners[0].ok, false);
  assert.ok(wall.fill > 50, "a wall with one small thing on it is dead area");
});

test("nested owners: a passing child counts whole in its parent, a failing child hands its content up", () => {
  const child = (extra) => [O("o2", 10, 10, 600, 260, Object.assign({ ownerOf: "o1" }, extra)), T(30, 30, 560, 220, { ownerOf: "o2" })];
  const passing = run([O("o1", 0, 0, 852, 300)].concat(child({})));
  assert.deepEqual(passing.owners.map((o) => [o.id, o.ok]), [["o1", true], ["o2", true]]);
  assert.deepEqual([passing.owners[0].rows, passing.owners[0].cols], [84.6, 72.2]);
  const failing = run([O("o1", 0, 0, 852, 300)].concat(child({ fill: 0.1 })));
  assert.deepEqual(failing.owners.map((o) => [o.id, o.ok]), [["o1", true], ["o2", false]]);
  assert.deepEqual([failing.owners[0].rows, failing.owners[0].cols], [84.6, 72.2]);   // rows 0-10 of 13 (row 11 gets 2 of 24 px), columns 0-25 of 36
});

test("owners that name each other terminate", () => {
  const r = run([O("a", 0, 0, 400, 400, { ownerOf: "b" }), O("b", 0, 0, 400, 400, { ownerOf: "a" }), T(10, 10, 300, 300, { ownerOf: "a" })]);
  assert.equal(r.owners.length, 2);
});

test("a ring of owners, an owner naming itself and a path owner (dozens of boxes with one id) terminate at once", () => {
  const ring = Array.from({ length: 30 }, (_, i) => O("r" + i, i * 20, 0, 300, 300, { ownerOf: "r" + ((i + 1) % 30) }));
  assert.equal(run(ring.concat([T(10, 10, 200, 100, { ownerOf: "r0" })])).owners.length, 30);
  const loop = run([O("p", 0, 0, 10, 10, { ownerOf: "p", path: [[0, 0], [700, 800]] }), T(0, 0, 100, 100, { ownerOf: "p" })], undefined, { strict: false });
  assert.ok(loop.owners.length > 20, "a path makes one box per 32 px: " + loop.owners.length);
  assert.equal(JSON.stringify(run(ring)), JSON.stringify(run(ring)), "and the same twice");
});

/* ---- strokes ------------------------------------------------------------------------------------------------------------- */

test("a stroke is sampled into one 48 px box per 32 px of path", () => {
  const flat = ds.strokeBoxes([[0, 0], [320, 0]]);
  assert.equal(flat.length, 10);
  assert.deepEqual(plain(flat[0]), { x: -8, y: -24, w: 48, h: 48, kind: "ink" });
  assert.deepEqual(plain(flat[9]), { x: 280, y: -24, w: 48, h: 48, kind: "ink" });
  const diagonal = plain(ds.strokeBoxes([[0, 0], [300, 400]]));
  assert.equal(diagonal.length, 16);
  assert.deepEqual([diagonal[0].x, diagonal[0].y, diagonal[15].x, diagonal[15].y], [-14, -11, 270, 368]);
  assert.equal(ds.strokeBoxes([[100, 100]]).length, 1);
  assert.equal(ds.strokeBoxes([[0, 0], [0, 0]]).length, 1);
  assert.equal(ds.strokeBoxes([[0, 0], [10, 0]]).length, 1);
});

test("a diagonal stroke fills a diagonal, not its bounding rectangle", () => {
  const stroke = run([{ kind: "ink", path: [[0, 0], [800, 800]] }]);
  const rectangle = run([I(0, 0, 800, 800)]);
  const count = (r) => r.cells.join("").split("#").length - 1;
  assert.ok(count(stroke) < count(rectangle) / 2, `${count(stroke)} vs ${count(rectangle)}`);
  assert.ok(count(stroke) > 0);
});

/* ---- options, determinism ------------------------------------------------------------------------------------------------ */

test("options: the nested grid, halo and owner forms equal the flat ones; canvasH rescales the band", () => {
  const c = byName("today swiss setup (text only)");
  assert.equal(run(c.boxes, c.zone).band, 30);
  assert.equal(run(c.boxes, c.zone, { canvasH: 1350 }).band, 32);
  const grid = run(c.boxes, c.zone, { grid: [18, 18] });
  assert.deepEqual([grid.cells.length, grid.cells[0].length], [18, 18]);
  assert.deepEqual(run(c.boxes, c.zone, { grid: { cols: 18, rows: 18 } }), grid);
  assert.deepEqual(run(c.boxes, c.zone, { cols: 18, rows: 18 }), grid);
  assert.deepEqual(run(c.boxes, c.zone, { halo: { text: 0, ink: 0, owner: 0 } }), run(c.boxes, c.zone, { hText: 0, hInk: 0, hOwn: 0 }));
  assert.notDeepEqual(run(c.boxes, c.zone, { occ: 90 }).cells, run(c.boxes, c.zone).cells);
});

test("determinism: twice the same bytes; the inputs are never written to", () => {
  for (const c of appendix) {
    const boxes = deepFreeze(JSON.parse(JSON.stringify(c.boxes)));
    const opts = deepFreeze({ grid: { cols: 36, rows: 37 }, owner: { min: 65 } });
    assert.equal(JSON.stringify(ds(boxes, c.zone, opts)), JSON.stringify(ds(boxes, c.zone, opts)), c.id);
  }
});

test("the fuzz file: 32 seeded box sets reproduce cell for cell (the parity pin for the Python twin)", () => {
  const fuzz = readJson("fuzz.json").cases;
  assert.equal(fuzz.length, 32);
  for (const c of fuzz) assert.deepEqual(run(c.boxes, c.zone, c.opts ?? undefined), c.expect, c.id);
  assert.equal(readFileSync(join(CASES, "fuzz.json"), "utf8").includes("Math.random"), false);
  // the pin must exercise the contract: every meta value, owners that pass and fail, and both strict readings
  const owners = fuzz.flatMap((c) => c.expect.owners.map((o) => ({ ...o, loose: c.opts?.strict === false })));
  assert.deepEqual([...new Set(owners.map((o) => o.meta))].sort(), ["none", "ok", "weak"]);
  assert.ok(owners.some((o) => o.ok) && owners.some((o) => !o.ok));
  assert.ok(owners.some((o) => o.loose && o.meta === "none" && o.ok), "strict:false lets an unmeasured owner qualify");
  assert.ok(owners.some((o) => !o.loose && o.meta === "none" && !o.ok), "strict rejects it");
});

/* ---- geometry ------------------------------------------------------------------------------------------------------------ */

test("zone: the computed body zone, with poster 840 and heritage 844 high", () => {
  for (const z of readJson("recipes.json").zones) assert.deepEqual(plain(geo.zone(z.preset, z.h ?? undefined, z.type)), z.expect, JSON.stringify(z));
});

test("zone reads registry.geometry(h).body when the core is present and falls back when it is not", () => {
  const body = (h) => ({ x: 100, y: 200, w: 800, h: 700 + (h - 1440) });
  const withCore = loadVisual({ core: { registry: { geometry: (h) => ({ body: body(h) }) } } }).visual.geometry;
  assert.deepEqual(plain(withCore.zone("poster", 1350)), { x: 100, y: 200, w: 800, h: 700 - 90 - 48 });
  const broken = loadVisual({ core: { registry: { geometry: () => { throw new Error("no rules yet"); } } } }).visual.geometry;
  assert.deepEqual(plain(broken.zone("heritage", 1440)), { x: 114, y: 261, w: 852, h: 844 });
});

test("recipe: the nine recipes of 4.2 against the hand-worked vectors", () => {
  const vectors = readJson("recipes.json").vectors;
  assert.ok(vectors.length >= 40);
  const seen = new Set();
  for (const v of vectors) {
    const got = plain(geo.recipe(v.name, v.opts));
    seen.add(v.name);
    for (const k of Object.keys(v.expect)) assert.deepEqual(got[k], v.expect[k], `${v.id}: ${k}`);
    assert.equal("caption" in got, "caption" in v.expect, `${v.id}: caption`);
  }
  for (const name of geo.recipes) assert.ok(seen.has(name), `no vector for ${name}`);
});

test("rows are capped at five in every recipe (S-21): six to eight rows are a plain list, so recipe() says rows-max and limits() answers for five", () => {
  assert.equal(geo.rowsMax, 5);
  for (let n = 1; n <= 9; n++) assert.deepEqual(plain(geo.limits("rows", n)), [128 * Math.min(n, 5), 128 * Math.min(n, 5) + 40], `limits rows ${n}`);
  assert.deepEqual(plain(geo.limits("rows")), plain(geo.limits("rows", 3)), "no count means three");
  for (const name of geo.recipes) {
    for (const n of [3, 4, 5]) assert.notEqual(geo.recipe(name, { kind: "rows", n, T: 100 }).reason, "rows-max", `${name} with ${n} rows`);
    for (const n of [6, 7, 8, 9]) {
      const r = geo.recipe(name, { kind: "rows", n, T: 100 });
      assert.deepEqual([r.ok, r.reason], [false, "rows-max"], `${name} with ${n} rows`);
    }
  }
  assert.equal(geo.recipe("under", { kind: "icon", n: 8, T: 100 }).ok, true, "n only counts for rows");
  const six = geo.recipe("under", { kind: "rows", n: 6, T: 200 }), five = geo.recipe("under", { kind: "rows", n: 5, T: 200 });
  assert.deepEqual(plain(six.anchor), plain(five.anchor), "the same geometry as five rows; only the verdict differs");
  assert.equal(five.ok, true);
});

test("recipe: determinism, a missing zone defaults to 852 x 888, rows limits", () => {
  const a = geo.recipe("under", { T: 300 });
  assert.deepEqual(plain(a), plain(geo.recipe("under", { T: 300 })));
  assert.deepEqual(plain(a.anchor), { x: 0, y: 340, w: 852, h: 548 });
  assert.deepEqual(plain(geo.limits("rows", 5)), [640, 680]);
  assert.deepEqual(plain(geo.limits("rows", 9)), [640, 680]);
  assert.deepEqual(plain(geo.limits("icon")), [280, 560]);
  assert.deepEqual(plain(geo.limits("unknown")), [280, 0]);
  assert.equal(geo.recipe("under").ok, true);
});

test("recipe and measure agree: a recipe that passes leaves no FIX-level dead space for a text block that fills its column", () => {
  // under, scene, T 300: the text block and a scene that spans its panel take the whole zone (a panel above 60% of it needs 80% of its columns)
  const r = geo.recipe("under", { T: 300, kind: "scene", zone: geo.zone("swiss") });
  const boxes = [O("s", r.anchor.x, r.anchor.y, r.anchor.w, r.anchor.h), I(r.anchor.x + 56, r.anchor.y + 40, 740, r.anchor.h - 80, { ownerOf: "s" }),
    T(100, 0, 700, 140), T(100, 160, 700, 140)];
  const m = run(boxes);
  assert.ok(r.ok && m.owners[0].ok && m.band < 8 && m.rect < 15 && m.fill < 40, JSON.stringify([m.band, m.rect, m.fill]));
});
