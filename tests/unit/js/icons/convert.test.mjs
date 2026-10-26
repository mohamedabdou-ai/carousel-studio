// tests/unit/js/icons/convert.test.mjs · the path engine and the fold of tools/build-icons.mjs (no vendored packages needed).
// Run: node --test "tests/unit/js/icons/*.test.mjs"
import test from "node:test";
import assert from "node:assert/strict";
import { TATWEEL, tool, withFatha } from "./helpers.mjs";

const { fold, isFolded, parsePathData, serializeGroups, entriesFromD, entriesFromElement, pathBounds, buildIcon, checkBlocklist, fmt } = tool;
const norm = (d) => serializeGroups(parsePathData(d));

test("fold: the spec 3.1 normalisation, nothing more", () => {
  assert.equal(fold("أإآ"), "ااا");
  assert.equal(fold("مدرسة"), "مدرسه");
  assert.equal(fold("على"), "علي");
  assert.equal(fold("مؤتمر"), "مو" + "تمر");
  assert.equal(fold("شائع"), "شايع");
  assert.equal(fold(withFatha("كتب")), "كتب");
  assert.equal(fold(["م", TATWEEL, TATWEEL, TATWEEL, "درسة"].join("")), "مدرسه");
  assert.equal(fold("  توفير   الوقت "), "توفير الوقت");
  assert.equal(fold("ساعة"), fold(fold("ساعة")), "idempotent");
});

test("isFolded accepts folded Arabic words and rejects everything else", () => {
  assert.ok(isFolded("توفير الوقت"));
  assert.ok(!isFolded("ساعة"), "ة is not folded");
  assert.ok(!isFolded("أفكار"), "أ is not folded");
  assert.ok(!isFolded(withFatha("كتب")), "tashkeel");
  assert.ok(!isFolded("time"), "Latin");
  assert.ok(!isFolded("سعر 5"), "digit");
  assert.ok(!isFolded(""), "empty");
});

test("parsePathData handles implicit repeats, compressed arc flags, exponents and refuses garbage", () => {
  assert.deepEqual(parsePathData("M1 2 3 4").map((g) => g.c), ["M", "L"]);
  assert.deepEqual(parsePathData("m1 2 3 4").map((g) => g.c), ["m", "l"]);
  const arc = parsePathData("M0 0a1 1 0 011 1");
  assert.deepEqual(arc[1].a, [1, 1, 0, 0, 1, 1, 1]);
  assert.deepEqual(parsePathData("M1e1 2E0")[0].a, [10, 2]);
  assert.throws(() => parsePathData("L1 2"), /moveto/);
  assert.throws(() => parsePathData("M1"), /number expected/);
  assert.throws(() => parsePathData("M1 2 X"), /unexpected/);
  assert.throws(() => parsePathData("M1 2 a1 1 0 2 1 3 3"), /arc flag/);
  assert.throws(() => parsePathData(""), /empty/);
});

test("serialiser output is compact and re-parses to the same numbers", () => {
  assert.equal(fmt(0.5), ".5");
  assert.equal(fmt(-0.5), "-.5");
  assert.equal(fmt(12), "12");
  assert.equal(fmt(2.0004), "2");
  assert.equal(fmt(-0), "0");
  assert.equal(norm("M12 6 v6 l4 2"), "M12 6v6l4 2");
  assert.equal(norm("M 2,12 a 10,10 0 1,0 20,0"), "M2 12a10 10 0 1 0 20 0");
  assert.equal(norm("M1 2l3 -4 .5 .5"), "M1 2l3-4 .5.5");
  for (const d of ["M12 6v6l4 2", "M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3", "M5 12h14", "m12 5 7 7-7 7"]) {
    const again = parsePathData(norm(d));
    assert.deepEqual(again.flatMap((g) => g.a), parsePathData(d).flatMap((g) => g.a), d);
  }
});

test("A14: circle, ellipse, rect, line, polyline and polygon become paths", () => {
  const one = (tag, attrs) => { const e = entriesFromElement(tag, attrs); assert.equal(e.length, 1); return e[0]; };
  assert.deepEqual(one("circle", { cx: "12", cy: "12", r: "10" }), { d: "M2 12a10 10 0 1 0 20 0 10 10 0 1 0 -20 0z", closed: true, solid: false });
  assert.equal(one("ellipse", { cx: "12", cy: "12", rx: "10", ry: "5" }).d, "M2 12a10 5 0 1 0 20 0 10 5 0 1 0 -20 0z");
  assert.equal(one("rect", { x: "2", y: "2", width: "20", height: "8", rx: "2" }).d, "M4 2h16a2 2 0 0 1 2 2v4a2 2 0 0 1 -2 2h-16a2 2 0 0 1 -2-2v-4a2 2 0 0 1 2-2z");
  assert.equal(one("rect", { x: "3", y: "3", width: "18", height: "18" }).d, "M3 3h18v18h-18v-18z");
  assert.equal(one("rect", { width: "4", height: "4", rx: "9" }).d, "M2 0a2 2 0 0 1 2 2 2 2 0 0 1 -2 2 2 2 0 0 1 -2-2 2 2 0 0 1 2-2z", "rx is clamped to half the side");
  assert.deepEqual(one("line", { x1: "4", y1: "4", x2: "20", y2: "20" }), { d: "M4 4L20 20", closed: false, solid: false });
  assert.deepEqual(one("polyline", { points: "3 17 9 11 13 15 21 7" }), { d: "M3 17L9 11 13 15 21 7", closed: false, solid: false });
  assert.deepEqual(one("polygon", { points: "12 2 22 22 2 22" }), { d: "M12 2L22 22 2 22z", closed: true, solid: false });
});

test("A14: a degenerate segment is a filled circle of the stroke's diameter, a currentColor circle keeps its look", () => {
  const dot = entriesFromD("M12 17h.01");
  assert.equal(dot.length, 1);
  assert.equal(dot[0].solid, true);
  assert.equal(dot[0].d, "M11.005 17a1 1 0 1 0 2 0 1 1 0 1 0 -2 0z");
  const t = entriesFromD("M11 13.01v-.01");
  assert.equal(t[0].solid, true);
  assert.equal(t[0].d, "M10 13.005a1 1 0 1 0 2 0 1 1 0 1 0 -2 0z");
  // r=.5 with fill and the inherited stroke 2 is a disc of radius 1.5
  const lucideDot = entriesFromElement("circle", { cx: "13.5", cy: "6.5", r: ".5", fill: "currentColor" });
  assert.deepEqual(lucideDot, [{ d: "M12 6.5a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0 -3 0z", closed: false, solid: true }]);
  // a zero-length line is a dot too
  assert.equal(entriesFromElement("line", { x1: "6", y1: "6", x2: "6.01", y2: "6" })[0].solid, true);
  // a compound path keeps its body and gives the dot its own entry
  const mixed = entriesFromD("M5 5h14 M12 12h.01");
  assert.deepEqual(mixed.map((e) => [e.solid, e.closed]), [[false, false], [true, false]]);
  assert.equal(mixed[0].d, "M5 5h14");
});

test("closed sub-paths are found (z, or back to the start) and split from open ones", () => {
  const split = entriesFromD("M3 3h18v18H3z M12 8v8");
  assert.deepEqual(split.map((e) => [e.d, e.closed]), [["M3 3h18v18H3z", true], ["M12 8v8", false]]);
  const back = entriesFromD("M4 4h8v8H4V4");
  assert.equal(back.length, 1);
  assert.equal(back[0].closed, true, "ends where it started, so it can take the tint");
  assert.equal(entriesFromD("M4 4h8v8").length, 1);
  assert.equal(entriesFromD("M4 4h8v8")[0].closed, false);
  // a relative moveto after a split keeps its meaning: the open group starts at the absolute point
  const rel = entriesFromD("M1 1h4v4H1z m10 0 h3");
  assert.deepEqual(rel.map((e) => e.d), ["M1 1h4v4H1z", "M11 1h3"]);
  // SVG: a command after z continues from the old start point (Lucide "scale")
  const cont = entriesFromD("m5 8 3 8a5 5 0 0 1-6 0zV7");
  assert.deepEqual(cont.map((e) => [e.d, e.closed]), [["M5 8l3 8a5 5 0 0 1 -6 0z", true], ["M5 8V7", false]]);
  // the all-open and all-closed cases are never split
  assert.equal(entriesFromD("M1 1h2 M5 5h2 M9 9h2").length, 1);
  assert.equal(entriesFromD("M1 1h2v2z M5 5h2v2z").length, 1);
});

test("a path that draws nothing is refused", () => {
  assert.throws(() => entriesFromD("M3 3"), /draws nothing/);
});

test("the whitelist: only geometry, and fill only when it is exactly currentColor", () => {
  for (const [tag, attrs] of [
    ["path", { d: "M1 1h2", style: "stroke:red" }], ["path", { d: "M1 1h2", stroke: "red" }], ["path", { d: "M1 1h2", opacity: "0.5" }],
    ["path", { d: "M1 1h2", transform: "rotate(5)" }], ["path", { d: "M1 1h2", class: "x" }], ["path", { d: "M1 1h2", onclick: "x()" }], ["path", { d: "M1 1h2", href: "#a" }],
    ["path", { d: "M1 1h2", fill: "red" }], ["path", { d: "M1 1h2", fill: "none" }], ["rect", { width: "2", height: "2", fill: "currentColor" }],
    ["circle", { cx: "1", cy: "1", r: "x" }], ["path", { d: "M1 1h2 <script>" }], ["circle", { cx: "1", cy: "1" }],
    ["text", {}], ["image", { href: "x" }], ["g", {}], ["use", { href: "#a" }], ["foreignObject", {}], ["style", {}],
  ]) assert.throws(() => entriesFromElement(tag, attrs), /whitelist|only|numeric|needs|grammar|understood/, `${tag} ${JSON.stringify(attrs)}`);
  assert.doesNotThrow(() => entriesFromElement("circle", { cx: "1", cy: "1", r: "1", fill: "currentColor" }));
});

test("buildIcon lists the closed entries in f and the solid dots in s, in entry order", () => {
  const icon = buildIcon([
    { tag: "circle", attrs: { cx: "12", cy: "12", r: "10" } },
    { tag: "path", attrs: { d: "M12 6v6l4 2" } },
    { tag: "path", attrs: { d: "M12 17h.01" } },
    { tag: "rect", attrs: { x: "3", y: "3", width: "4", height: "4" } },
  ]);
  assert.equal(icon.d.length, 4);
  assert.deepEqual(icon.f, [0, 3]);
  assert.deepEqual(icon.s, [2]);
  assert.equal(buildIcon([{ tag: "path", attrs: { d: "M1 1h5" } }]).f, undefined, "no f when nothing is closed");
});

test("pathBounds: arcs contribute their true extremes, not just their end points", () => {
  const { bounds } = pathBounds("M2 12a10 10 0 1 0 20 0 10 10 0 1 0 -20 0z");
  assert.ok(Math.abs(bounds[0] - 2) < 1e-6 && Math.abs(bounds[2] - 22) < 1e-6, String(bounds));
  assert.ok(Math.abs(bounds[1] - 2) < 1e-6 && Math.abs(bounds[3] - 22) < 1e-6, String(bounds));
  const half = pathBounds("M4 12a8 8 0 0 1 16 0").bounds;
  assert.ok(Math.abs(half[1] - 4) < 1e-6 && Math.abs(half[3] - 12) < 1e-6, String(half));
  const rel = pathBounds("M10 10 l5 5 h-2 v-8").bounds;
  assert.deepEqual(rel, [10, 7, 15, 15]);
  assert.equal(pathBounds("M5 5 Q10 0 15 5").bounds[1], 0, "control points count (conservative)");
});

test("the exclusion list of 13e section 3 is enforced by name", () => {
  for (const n of ["wine", "beer", "ham", "cigarette", "cannabis", "dices", "dice-5", "playing-card", "spade", "club", "zodiac-aries", "church", "cross", "skull", "biohazard",
    "tb-pray", "tb-jewish-star", "prayer-beads", "kaaba", "quran-stand", "mushaf", "rehal", "worship", "tb-wine"]) assert.ok(checkBlocklist(n), n);
  for (const n of ["x", "mosque", "dome", "moon-star", "utensils-crossed", "cs-dallah", "tb-building-mosque", "hand-coins", "cross-hair", "shield-check", "tent", "pill"]) assert.equal(checkBlocklist(n), null, n);
});
