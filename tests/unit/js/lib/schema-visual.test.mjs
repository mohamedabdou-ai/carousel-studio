// tests/unit/js/lib/schema-visual.test.mjs · E1 (round 3): the visual-language fields in the four schemas (spec 5.2, 5.5, 6.0, IS-5; r2 1.1 row 5).
// Run: node --test tests/unit/js/lib/schema-visual.test.mjs
// The JS validator here is the production one (src/lib/schema.js in a bare vm); tests/unit/py/test_schema_defs.py feeds the same kind of
// documents to the Python twin and to this validator (through node) and requires the same verdicts.
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadLib, readJson, ROOT } from "./load-lib.mjs";

const CS = loadLib();
const { schema } = CS.core;
const KINDS = ["brand", "spec", "preset", "occasion", "hook", "plan", "qa-report"];
const SCHEMA_DIR = "plugins/carousel-studio/skills/carousel-design/schemas/";
const SCHEMAS = Object.fromEntries(KINDS.map((k) => [k, readJson(`${SCHEMA_DIR}${k}.schema.json`)]));
KINDS.forEach((k) => schema.register(k, SCHEMAS[k]));

/* The library runs in its own realm: compare plain JSON. */
const plain = (v) => JSON.parse(JSON.stringify(v === undefined ? null : v));
const eq = (actual, expected, message) => assert.deepEqual(plain(actual), plain(expected), message);
const clone = (v) => JSON.parse(JSON.stringify(v));
const verdict = (kind, doc) => plain(schema.validate(kind, doc).errors.map((e) => [e.path, e.keyword]));
const valid = (kind, doc, message) => eq(verdict(kind, doc), [], message);

const VISUAL = readJson("docs/examples/spec.visual.example.json");
const SPEC = readJson("docs/examples/spec.example.json");
const PRESET = readJson("docs/examples/preset.example.json");
const BRAND = readJson("docs/examples/brand.example.json");
const QA = readJson("docs/examples/qa-report.example.json");
const slide = (doc, id) => doc.slides.find((s) => s.id === id);

/** The approved-deck variant: frozen sizes up to 640 px and the visual block of r2 1.1 row 5. */
function withFrozen(spec) {
  const s = clone(spec);
  s.frozen = {
    engine: "cs-1.1.1", tokensHash: "0123456789abcdef", approvedAt: "2026-10-23T11:00:00Z",
    lines: { "s03.title": ["نسبة الحفظ", "مع هوك واضح"] },
    sizes: { "s03.title": 68, "s03.number": 520, "s03.art.0": 640 },
    visual: {
      marks: { s02: [{ id: "underline-brush", target: "s02.headline", x: 112.5, y: 408, w: 301, h: 24 }] },
      anchors: { s03: { w: 852, h: 560.5 } }
    }
  };
  return s;
}

/** A preset that uses what swiss does not: a lifted shadow, a hand face, a retrace, fills, a lightness tone and a numeral scale. */
function notebookLike() {
  const p = clone(PRESET);
  p.type.scale.numeral = [280, 520];
  Object.assign(p.art, {
    stroke: 2.0, cap: "round", join: "round", container: "hand-circle", fill: "tint", wobble: 0.6, tilt: 3, stampTilt: -8, mark: "outline", badge: "scallop",
    outline: 3, outlineColor: "#1D2B5A", chipOffset: 2, texture: "ruled", doodle: "pencil",
    shadow: { kind: "soft", dx: 0, dy: 4, blur: 14 },
    retrace: { dx: 0.5, dy: 0.4, rot: 0.8, tint: "accent2" },
    fills: { chip: "accent", tile: "#F4B63F", sticker: "surface" },
    hand: { family: "playpen-sans-arabic", wght: 400, lh: 1.5 },
    radius: { chip: 999, tile: 14, card: 10, panel: 10, window: 10 }
  });
  p.tones.invert.roles.accent = { lightness: ["accent", 0.72] };
  return p;
}

function brandWithArt() {
  const b = clone(BRAND);
  b.visual.art = {
    constraints: { figures: "faceless", animals: "none", music: "none", maps: "allow" },
    prefer: ["numeral", "mock"], avoid: ["scene", "photo"], motifIcon: "bookmark",
    chartAxis: { categories: "rtl", time: "ltr" }, support: ["#FF8FB1", "#6EC6FF"], numerals: "western"
  };
  return b;
}

/* ---- coverage walkers: which property paths a schema offers and which a set of documents uses ------------------------ */

const defOf = (root, ref) => root.$defs[ref.slice("#/$defs/".length)];

function offered(sch, root, path, out, stack) {
  if (!sch || typeof sch !== "object") return;
  if (sch.$ref) { if (!stack.includes(sch.$ref)) offered(defOf(root, sch.$ref), root, path, out, stack.concat(sch.$ref)); return; }
  if (sch.oneOf) { sch.oneOf.forEach((alt) => offered(alt, root, path, out, stack)); return; }
  if (sch.items) offered(sch.items, root, path + "[]", out, stack);
  Object.keys(sch.properties || {}).forEach((k) => { out.add(`${path}.${k}`); offered(sch.properties[k], root, `${path}.${k}`, out, stack); });
  if (sch.additionalProperties && typeof sch.additionalProperties === "object") { out.add(`${path}.*`); offered(sch.additionalProperties, root, `${path}.*`, out, stack); }
}

function used(sch, val, root, path, out) {
  if (!sch || typeof sch !== "object") return;
  if (sch.$ref) { used(defOf(root, sch.$ref), val, root, path, out); return; }
  if (sch.oneOf) { sch.oneOf.forEach((alt) => { if (schema.validateAgainst(alt, val, root).ok) used(alt, val, root, path, out); }); return; }
  if (Array.isArray(val)) { if (sch.items) val.forEach((v) => used(sch.items, v, root, `${path}[]`, out)); return; }
  if (val && typeof val === "object") {
    Object.keys(val).forEach((k) => {
      if (sch.properties && sch.properties[k]) { out.add(`${path}.${k}`); used(sch.properties[k], val[k], root, `${path}.${k}`, out); }
      else if (sch.additionalProperties && typeof sch.additionalProperties === "object") { out.add(`${path}.*`); used(sch.additionalProperties, val[k], root, `${path}.*`, out); }
    });
  }
}

/** The two tones share one grammar: .tones.invert.roles.bg.mix and .tones.field.roles.ink.mix are the same path. */
const norm = (p) => p.replace(/^\.tones\.(invert|field)\.roles\.[A-Za-z0-9]+/, ".tones.*.roles.*");

function uncovered(kind, docs, prefixes) {
  const all = new Set(); const seen = new Set();
  offered(SCHEMAS[kind], SCHEMAS[kind], "", all, []);
  docs.forEach((d) => used(SCHEMAS[kind], d, SCHEMAS[kind], "", seen));
  const have = new Set([...seen].map(norm));
  return [...new Set([...all].map(norm))].filter((p) => prefixes.some((x) => p === x || p.startsWith(x + ".") || p.startsWith(x + "["))).filter((p) => !have.has(p)).sort();
}

/* ---- the documents ----------------------------------------------------------------------------------------------- */

test("the documents validate: the full visual example, the approved variant, the old examples, the old fixtures and the six shipped presets", () => {
  valid("spec", VISUAL, "spec.visual.example.json");
  valid("spec", withFrozen(VISUAL), "the approved deck (frozen.visual, a 640 px size)");
  valid("spec", SPEC, "spec.example.json");
  valid("preset", PRESET, "preset.example.json with art and tones");
  valid("preset", notebookLike(), "a preset with a hand face, a retrace, fills and a numeral scale");
  valid("brand", BRAND, "brand.example.json");
  valid("brand", brandWithArt(), "brand.visual.art");
  valid("qa-report", QA, "qa-report.example.json");
  const fixtures = readdirSync(join(ROOT, "tests/fixtures")).filter((f) => /^(spec|brand)\..*\.json$/.test(f));
  assert.ok(fixtures.length >= 8, "the fixture decks and brands are there");
  fixtures.forEach((f) => valid(f.startsWith("spec.") ? "spec" : "brand", readJson(`tests/fixtures/${f}`), f));
  valid("spec", readJson("tools/examples/showcase.spec.json"), "the showcase deck");
  const styles = readdirSync(join(ROOT, "plugins/carousel-studio/skills/carousel-design/styles"), { withFileTypes: true }).filter((e) => e.isDirectory());
  assert.equal(styles.length, 6);
  styles.forEach((e) => valid("preset", readJson(`plugins/carousel-studio/skills/carousel-design/styles/${e.name}/preset.json`), e.name));
});

test("every new field is used by the examples (spec 5.2: visual, items, demo, media, style, remix, frozen.visual; preset art and tones; brand visual.art)", () => {
  const specNew = [".slides[].visual", ".slides[].items", ".slides[].demo", ".slides[].media.frame", ".slides[].media.zoom", ".slides[].media.backdropAssetId",
    ".style.visualMode", ".style.planV", ".style.world", ".style.motif", ".style.rail", ".style.thread", ".style.panorama", ".remix", ".frozen.visual"];
  eq(uncovered("spec", [VISUAL, withFrozen(VISUAL), SPEC], specNew), [], "spec");
  eq(uncovered("preset", [PRESET, notebookLike()], [".art", ".tones", ".type.scale.numeral"]), [], "preset");
  eq(uncovered("brand", [brandWithArt()], [".visual.art"]), [], "brand");
  // the walker is not vacuous: it does see an unused field
  const thin = clone(VISUAL); thin.slides.forEach((s) => { delete s.demo; });
  assert.ok(uncovered("spec", [thin], [".slides[].demo"]).includes(".slides[].demo.caption"));
});

test("the example spreads the anchor kinds and both mock families over its slides", () => {
  const kinds = new Set(VISUAL.slides.filter((s) => s.visual).map((s) => s.visual.anchor.kind));
  ["none", "icon", "scene", "rows", "numeral", "chart", "mock", "word", "pattern"].forEach((k) => assert.ok(kinds.has(k), k));
  const mocks = new Set(VISUAL.slides.filter((s) => s.visual && s.visual.anchor.mock).map((s) => s.visual.anchor.mock.kind));
  assert.deepEqual([...mocks].sort(), ["artefact", "chat"]);
});

/* ---- the negatives the card names ------------------------------------------------------------------------------- */

function neg(name, mutate, expected, kind = "spec", base = VISUAL) {
  const doc = clone(base);
  mutate(doc);
  eq(verdict(kind, doc), expected, name);
}

test("spec negatives: an unknown anchor kind, items above 6, an uppercase icon name, a demo with 4 lines, a chart with 9 values, a world artefact outside its enum", () => {
  const i = (id) => VISUAL.slides.findIndex((s) => s.id === id);
  neg("unknown anchor kind", (d) => { slide(d, "s03").visual.anchor.kind = "diagram"; }, [[`/slides/${i("s03")}/visual/anchor/kind`, "enum"]]);
  neg("items above 6", (d) => { const g = slide(d, "s08"); while (g.items.length < 7) g.items.push({ title: "عنصر" }); }, [[`/slides/${i("s08")}/items`, "maxItems"]]);
  neg("an icon name with an uppercase letter", (d) => { slide(d, "s04").visual.anchor.icon = "LightBulb"; }, [[`/slides/${i("s04")}/visual/anchor/icon`, "pattern"]]);
  neg("a demo with 4 lines", (d) => { const s = slide(d, "s06"); while (s.demo.lines.length < 4) s.demo.lines.push({ text: "سطر" }); }, [[`/slides/${i("s06")}/demo/lines`, "maxItems"]]);
  neg("a chart with 9 values", (d) => { const c = slide(d, "s09").visual.anchor.chart; while (c.values.length < 9) c.values.push({ label: "ج", value: 1 }); },
    [[`/slides/${i("s09")}/visual/anchor/chart/values`, "maxItems"]]);
  neg("a world artefact outside its enum", (d) => { d.style.world.artefact = "invoice"; }, [["/style/world/artefact", "enum"]]);
});

test("spec negatives: icon names, the numeral spelling (S-20), anchor and chart and mock and demo shapes", () => {
  const i = (id) => VISUAL.slides.findIndex((s) => s.id === id);
  const icon = (name) => { const d = clone(VISUAL); slide(d, "s04").visual.anchor.icon = name; return verdict("spec", d); };
  eq(icon("tb-bookmark"), []); eq(icon("cs-qalam"), []); eq(icon("a-b-c-d-e-f"), []);
  [["a-b-c-d-e-f-g", "pattern"], ["hour_glass", "pattern"], ["Hourglass", "pattern"], ["-x", "pattern"], ["x-", "pattern"], ["", "pattern"]]
    .forEach(([name, kw]) => eq(icon(name), [[`/slides/${i("s04")}/visual/anchor/icon`, kw]], JSON.stringify(name)));
  neg("anchor.numeral is gone, value and unit are the fields", (d) => { slide(d, "s03").visual.anchor.numeral = "74"; }, [[`/slides/${i("s03")}/visual/anchor/numeral`, "additionalProperties"]]);
  neg("an anchor without a kind", (d) => { delete slide(d, "s03").visual.anchor.kind; }, [[`/slides/${i("s03")}/visual/anchor/kind`, "required"]]);
  neg("more than 7 icons in a scene", (d) => { const a = slide(d, "s05").visual.anchor; while (a.icons.length < 8) a.icons.push("star"); }, [[`/slides/${i("s05")}/visual/anchor/icons`, "maxItems"]]);
  neg("a caption of 25 characters", (d) => { slide(d, "s05").visual.anchor.captions[0] = "ا".repeat(25); }, [[`/slides/${i("s05")}/visual/anchor/captions/0`, "maxLength"]]);
  neg("a numeral of a different shape: of below 2", (d) => { slide(d, "s03").visual.anchor.of = 1; }, [[`/slides/${i("s03")}/visual/anchor/of`, "minimum"]]);
  neg("an unknown chart kind", (d) => { slide(d, "s09").visual.anchor.chart.kind = "radar"; }, [[`/slides/${i("s09")}/visual/anchor/chart/kind`, "enum"]]);
  neg("a chart without values", (d) => { delete slide(d, "s09").visual.anchor.chart.values; }, [[`/slides/${i("s09")}/visual/anchor/chart/values`, "required"]]);
  neg("a chart value without a label", (d) => { delete slide(d, "s09").visual.anchor.chart.values[0].label; }, [[`/slides/${i("s09")}/visual/anchor/chart/values/0/label`, "required"]]);
  neg("an unknown mock kind", (d) => { slide(d, "s06").visual.anchor.mock.kind = "tweet"; }, [[`/slides/${i("s06")}/visual/anchor/mock/kind`, "enum"]]);
  neg("a mock highlight above 5", (d) => { slide(d, "s06").visual.anchor.mock.highlight = 6; }, [[`/slides/${i("s06")}/visual/anchor/mock/highlight`, "maximum"]]);
  neg("an unknown artefact", (d) => { slide(d, "s12").visual.anchor.mock.artefact = "invoice"; }, [[`/slides/${i("s12")}/visual/anchor/mock/artefact`, "enum"]]);
  neg("a demo line without text", (d) => { delete slide(d, "s06").demo.lines[0].text; }, [[`/slides/${i("s06")}/demo/lines/0/text`, "required"]]);
  neg("a demo line spoken by nobody known", (d) => { slide(d, "s06").demo.lines[0].who = "you"; }, [[`/slides/${i("s06")}/demo/lines/0/who`, "enum"]]);
  neg("an item without a title", (d) => { delete slide(d, "s08").items[0].title; }, [[`/slides/${i("s08")}/items/0/title`, "required"]]);
  neg("an item mark outside its enum", (d) => { slide(d, "s08").items[0].mark = "star"; }, [[`/slides/${i("s08")}/items/0/mark`, "enum"]]);
  neg("an unknown field on an item", (d) => { slide(d, "s08").items[0].color = "red"; }, [[`/slides/${i("s08")}/items/0/color`, "additionalProperties"]]);
});

test("spec negatives: visual, media, style and remix", () => {
  const i = (id) => VISUAL.slides.findIndex((s) => s.id === id);
  neg("a recipe outside the nine", (d) => { slide(d, "s03").visual.recipe = "left"; }, [[`/slides/${i("s03")}/visual/recipe`, "enum"]]);
  neg("four marks", (d) => { slide(d, "s03").visual.marks = ["arrow", "circle", "strike", "stars"]; }, [[`/slides/${i("s03")}/visual/marks`, "maxItems"]]);
  neg("a repeated mark", (d) => { slide(d, "s03").visual.marks = ["arrow", "arrow"]; }, [[`/slides/${i("s03")}/visual/marks`, "uniqueItems"]]);
  neg("relax above 8", (d) => { slide(d, "s03").visual.relax = 9; }, [[`/slides/${i("s03")}/visual/relax`, "maximum"]]);
  neg("nine row icons", (d) => { slide(d, "s07").visual.rowIcons = Array(9).fill("eye"); }, [[`/slides/${i("s07")}/visual/rowIcons`, "maxItems"]]);
  neg("a span to a malformed slide id", (d) => { slide(d, "s05").visual.span.with = "6"; }, [[`/slides/${i("s05")}/visual/span/with`, "pattern"]]);
  neg("an alt of 161 characters", (d) => { slide(d, "s03").visual.alt = "ا".repeat(161); }, [[`/slides/${i("s03")}/visual/alt`, "maxLength"]]);
  neg("a media frame outside the enum", (d) => { slide(d, "s10").media.frame = "laptop"; }, [[`/slides/${i("s10")}/media/frame`, "enum"]]);
  neg("a zoom above 1", (d) => { slide(d, "s10").media.zoom.w = 1.5; }, [[`/slides/${i("s10")}/media/zoom/w`, "maximum"]]);
  neg("a zoom without a height", (d) => { delete slide(d, "s10").media.zoom.h; }, [[`/slides/${i("s10")}/media/zoom/h`, "required"]]);
  neg("a visual mode outside the three", (d) => { d.style.visualMode = "on"; }, [["/style/visualMode", "enum"]]);
  neg("a rail outside the four", (d) => { d.style.rail = "bars"; }, [["/style/rail", "enum"]]);
  neg("a panorama without enabled", (d) => { delete d.style.panorama.enabled; }, [["/style/panorama/enabled", "required"]]);
  neg("a panorama direction", (d) => { d.style.panorama.dir = "up"; }, [["/style/panorama/dir", "enum"]]);
  neg("a motif that is not an icon name", (d) => { d.style.motif = "Book Mark"; }, [["/style/motif", "pattern"]]);
  neg("a bold move slide id of 9 characters", (d) => { d.style.world.boldMove.slide = "s0000000x"; }, [["/style/world/boldMove/slide", "maxLength"]]);
  neg("a remix without a mode", (d) => { delete d.remix.mode; }, [["/remix/mode", "required"]]);
  neg("a remix hash of 15 digits", (d) => { d.remix.coverHash = "112233445566778"; }, [["/remix/coverHash", "pattern"]]);
  neg("a lineage of 6", (d) => { d.remix.lineage = Array(6).fill("a1b2c3d4e5f60718"); }, [["/remix/lineage", "maxItems"]]);
  neg("a refresh outside the three", (d) => { d.remix.refresh = ["body"]; }, [["/remix/refresh/0", "enum"]]);
});

test("row 5 of the contract review: frozen sizes reach 640, frozen.visual exists, frozen.marks does not", () => {
  const f = withFrozen(VISUAL);
  valid("spec", f);
  const at = (mutate) => { const d = clone(f); mutate(d); return verdict("spec", d); };
  eq(at((d) => { d.frozen.sizes["s03.number"] = 640; }), []);
  eq(at((d) => { d.frozen.sizes["s03.number"] = 641; }), [["/frozen/sizes/s03.number", "maximum"]]);
  eq(at((d) => { d.frozen.sizes["s03.number"] = 11; }), [["/frozen/sizes/s03.number", "minimum"]]);
  eq(at((d) => { d.frozen.marks = { s02: [] }; }), [["/frozen/marks", "additionalProperties"]], "marks live under frozen.visual");
  eq(at((d) => { d.frozen.visual.anchors.s03 = { w: 852 }; }), [["/frozen/visual/anchors/s03/h", "required"]]);
  eq(at((d) => { d.frozen.visual.anchors.s03.h = -1; }), [["/frozen/visual/anchors/s03/h", "minimum"]]);
  eq(at((d) => { d.frozen.visual.marks.s02 = Array(9).fill({ id: "circle-1" }); }), [["/frozen/visual/marks/s02", "maxItems"]]);
  eq(at((d) => { d.frozen.visual.marks.s02 = ["circle"]; }), [["/frozen/visual/marks/s02/0", "type"]]);
  eq(at((d) => { d.frozen.visual.marks.s02 = [{}]; }), [["/frozen/visual/marks/s02/0", "minProperties"]], "a stored mark is never the empty object (the full record waits for A9)");
  eq(at((d) => { d.frozen.visual.extra = 1; }), [["/frozen/visual/extra", "additionalProperties"]]);
});

test("preset: the tone grammar of 5.5 (a role, mix, lightness, muted, pick), the art block of 6.0 and the r2 additions", () => {
  const at = (mutate, base = PRESET) => { const d = clone(base); mutate(d); return verdict("preset", d); };
  eq(at((d) => { d.tones.field.roles.bg = "ink2"; }), [["/tones/field/roles/bg", "oneOf"]]);
  eq(at((d) => { d.tones.field.roles.bg = { blend: ["ink", "bg", 0.5] }; }), [["/tones/field/roles/bg", "oneOf"]]);
  eq(at((d) => { d.tones.field.roles.bg = { mix: ["ink", "bg"] }; }), [["/tones/field/roles/bg", "oneOf"]], "a mix has three parts");
  eq(at((d) => { d.tones.field.roles.bg = { muted: 30 }; }), [["/tones/field/roles/bg", "oneOf"]]);
  eq(at((d) => { d.tones.field.roles.accent = { pick: [["ink"], 3, 1] }; }), [["/tones/field/roles/accent", "oneOf"]]);
  // the numeric bounds of 5.5, each boundary on both sides: a mix fraction and an OKLCH lightness are 0..1, a contrast floor is 1..21
  const role = (value, name = "bg") => at((d) => { d.tones.field.roles[name] = value; });
  const refused = (name) => [[`/tones/field/roles/${name}`, "oneOf"]];
  [0, 0.03, 1].forEach((n) => { eq(role({ mix: ["ink", "bg", n] }), [], `mix ${n}`); eq(role({ lightness: ["accent", n] }, "accent"), [], `lightness ${n}`); });
  [1.01, 20, 21, -0.01].forEach((n) => eq(role({ mix: ["ink", "bg", n] }), refused("bg"), `mix ${n}`));
  [1.01, 21, -0.1].forEach((n) => eq(role({ lightness: ["accent", n] }, "accent"), refused("accent"), `lightness ${n}`));
  [1, 4.7, 21].forEach((n) => { eq(role({ muted: n }, "inkMuted"), [], `muted ${n}`); eq(role({ pick: [["ink", "surface"], n] }, "accent"), [], `pick ${n}`); });
  [0.99, 21.01, 30, -1].forEach((n) => { eq(role({ muted: n }, "inkMuted"), refused("inkMuted"), `muted ${n}`); eq(role({ pick: [["ink", "surface"], n] }, "accent"), refused("accent"), `pick ${n}`); });
  eq(role({ pick: [["ink", "surface", "bg", "accent", "accent2"], 3] }, "accent"), refused("accent"), "pick takes one to four roles");
  eq(role({ pick: [[], 3] }, "accent"), refused("accent"));
  eq(at((d) => { delete d.tones.invert.roles.surface; }), [["/tones/invert/roles/surface", "required"]], "every tone defines all five roles");
  eq(at((d) => { d.tones.base = { roles: {} }; }), [["/tones/base", "additionalProperties"]], "base is the preset itself");
  eq(at((d) => { d.art.shadow.kind = "glow"; }), [["/art/shadow/kind", "enum"]]);
  eq(at((d) => { d.art.objectOutline = 0.05; }), [["/art/objectOutline", "maximum"]]);
  eq(at((d) => { d.art.objectOutline = 0.02; }), [["/art/objectOutline", "minimum"]]);
  eq(at((d) => { d.art.cap = "flat"; }), [["/art/cap", "enum"]]);
  eq(at((d) => { d.art.container = "plate"; }), [["/art/container", "enum"]]);
  eq(at((d) => { d.art.colors.support = ["#1D4ED8"]; }), [["/art/colors/support", "minItems"]]);
  eq(at((d) => { d.art.colors.note = "FFE88A"; }), [["/art/colors/note", "pattern"]]);
  eq(at((d) => { d.art.affinity.mocks = 0.4; }), [["/art/affinity/mocks", "additionalProperties"]]);
  eq(at((d) => { d.art.affinity.mock = 1.2; }), [["/art/affinity/mock", "maximum"]]);
  eq(at((d) => { d.art.radius.pill = 4; }), [["/art/radius/pill", "additionalProperties"]]);
  eq(at((d) => { d.art.retrace = "yes"; }), [["/art/retrace", "oneOf"]]);
  eq(at((d) => { d.art.hand = { family: "playpen-sans-arabic" }; }), [["/art/hand", "oneOf"]], "a hand face needs family and weight");
  eq(at((d) => { d.art.outlineColor = "navy"; }), [["/art/outlineColor", "oneOf"]]);
  eq(at((d) => { d.art.surprise = 1; }), [["/art/surprise", "additionalProperties"]]);
  eq(at((d) => { d.art.retrace = true; d.art.hand = null; d.art.outlineColor = "#1D2B5A"; }), []);
  eq(at((d) => { d.type.scale.numeral = 520; }), []);
  eq(at((d) => { d.type.scale.numeral = [280, 640]; }), []);
  eq(at((d) => { d.type.scale.numeral = [280, 700]; }), [["/type/scale/numeral", "oneOf"]]);
  eq(at((d) => { d.variants.compare = ["columns", "stacked", "versus", "table", "before-after"]; }), [], "five variants of one type");
  eq(at((d) => { d.variants.compare = Array(9).fill("columns"); }), [["/variants/compare", "maxItems"]]);
  eq(at((d) => { d.chrome.savePill.showOn = Array(20).fill("cta"); }), [], "the save pill can list all twenty types");
  eq(at((d) => { d.chrome.savePill.showOn = Array(21).fill("cta"); }), [["/chrome/savePill/showOn", "maxItems"]]);
});

test("brand: visual.art (constraints, prefer and avoid, motif icon, chart axis, supports, numerals)", () => {
  const at = (mutate) => { const d = brandWithArt(); mutate(d); return verdict("brand", d); };
  eq(at((d) => { d.visual.art.constraints.figures = "some"; }), [["/visual/art/constraints/figures", "enum"]]);
  eq(at((d) => { d.visual.art.constraints.animals = true; }), [["/visual/art/constraints/animals", "enum"], ["/visual/art/constraints/animals", "type"]], "animals, music and maps take allow or none, like figures");
  eq(at((d) => { d.visual.art.prefer = ["diagram"]; }), [["/visual/art/prefer/0", "enum"]]);
  eq(at((d) => { d.visual.art.avoid = ["scene", "scene"]; }), [["/visual/art/avoid", "uniqueItems"]]);
  eq(at((d) => { d.visual.art.motifIcon = "Book"; }), [["/visual/art/motifIcon", "pattern"]]);
  eq(at((d) => { d.visual.art.chartAxis.time = "up"; }), [["/visual/art/chartAxis/time", "enum"]]);
  eq(at((d) => { d.visual.art.support = ["#FF8FB1"]; }), [["/visual/art/support", "minItems"]]);
  eq(at((d) => { d.visual.art.support = ["#FF8FB1", "blue"]; }), [["/visual/art/support/1", "pattern"]]);
  eq(at((d) => { d.visual.art.numerals = "roman"; }), [["/visual/art/numerals", "enum"]]);
  eq(at((d) => { d.visual.art.palette = {}; }), [["/visual/art/palette", "additionalProperties"]]);
});

test("qa-report and spec.qa: every gate and rule id of IS-8 is admitted; a finding may carry prospect", () => {
  const RULES = ["D9.band", "D9.rect", "D9.fill", "D9.container-fill", "D9.plate-calm", "VA1", "VA2", "VA3", "VA4.chart-honesty", "VA5.relaxed", "VA5.no-bold", "VA6", "VA7", "VA8.constraints",
    "D8.anchor-run", "D8.tone-run", "D10.nesting", "D10.icon-tile-stack", "D10.side-border", "D10.icon-system", "D10.stroke-feed", "D10.art-label", "D10.glyph-icon", "D10.edge-fragment",
    "D10.squint", "D11.tokens", "D11.thread-drift", "D11.seam", "C2.body-with-art", "C2.demo-words", "C2.demo-missing", "C2.demo-duplicate", "C2.figure-repeat", "RX1.visual-distance"];
  const finding = (rule, extra) => Object.assign({ gate: rule.split(".")[0], rule, sev: "NOTE", msg: { ar: "ملاحظة", en: "Note" } }, extra);
  const report = clone(QA); report.results = RULES.map((r, n) => finding(r, n % 2 ? { prospect: true, slide: "s03", el: "s03.art.0" } : {}));
  valid("qa-report", report, "qa-report");
  const spec = clone(VISUAL); spec.qa = { status: "pass", results: report.results };
  valid("spec", spec, "spec.qa.results");
  const bad = (extra) => { const r = clone(QA); r.results = [finding("D9.band", extra)]; return verdict("qa-report", r); };
  eq(bad({ prospect: "yes" }), [["/results/0/prospect", "type"]]);
  eq(bad({ gate: "d9" }), [["/results/0/gate", "pattern"]]);
  eq(bad({ gate: "D9.band" }), [["/results/0/gate", "pattern"]], "the gate id has no suffix; the rule id does");
  eq(bad({ rule: "D9.Band" }), [["/results/0/rule", "pattern"]]);
});

test("tone tuples: the positions the subset cannot express are pinned as a known gap and handed to preset_lint (E4b) and the resolver (E2b)", () => {
  // CONTRACT 3.1 has `items` as one schema and no prefixItems, so [role, role, number] cannot be written. These shapes pass the schema in both engines;
  // tests/unit/py/test_schema_defs.py holds the reference checker that refuses each of them. If one starts failing here the check has moved into the schema.
  const gap = [{ mix: [0.1, 0.2, 0.3] }, { mix: ["bg", "ink", "bg"] }, { mix: [0.5, "ink", "bg"] }, { mix: ["ink", 0.5, "bg"] },
    { lightness: [0.5, "ink"] }, { lightness: ["ink", "bg"] }, { pick: [3, 3] }, { pick: [3, ["ink"]] }, { pick: [["ink"], ["bg"]] }];
  gap.forEach((value) => { const d = clone(PRESET); d.tones.field.roles.bg = value; eq(verdict("preset", d), [], JSON.stringify(value)); });
});

test("authored Arabic (GR-7): the new examples carry no tashkeel, in the text or as an escape, and the walk sees their strings", () => {
  const strings = (v, out = []) => { if (typeof v === "string") out.push(v); else if (v && typeof v === "object") Object.values(v).forEach((x) => strings(x, out)); return out; };
  [["spec.visual.example.json", 100], ["preset.example.json", 3]].forEach(([name, least]) => {
    const raw = readFileSync(join(ROOT, "docs/examples", name), "utf8");
    assert.ok(!/[\u064b-\u065f\u0670]/.test(raw), `${name}: a tashkeel mark in the file text`);
    assert.ok(!/\\u06(4[b-f]|5[0-9a-f]|70)/i.test(raw), `${name}: an escaped tashkeel mark`);
    const arabic = strings(JSON.parse(raw)).filter((s) => /[\u0600-\u06ff]/.test(s));
    assert.ok(arabic.length >= least, `${name}: ${arabic.length} Arabic strings`);
    arabic.forEach((s) => assert.ok(!/[\u064b-\u065f\u0670]/.test(s), `${name}: ${s}`));
  });
});

/* ---- the schemas themselves ------------------------------------------------------------------------------------- */

test("the schemas stay inside the subset and keep their shared definitions identical", () => {
  KINDS.forEach((k) => {
    eq(schema.unsupportedKeywords(SCHEMAS[k]), [], k);
    const text = JSON.stringify(SCHEMAS[k]);
    const patterns = [...text.matchAll(/"pattern":"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]);
    patterns.forEach((p) => {
      assert.ok(p.startsWith("^") && p.endsWith("$"), `${k}: ${p} is anchored`);
      assert.ok(!/\\[dDwWsSbB]/.test(p), `${k}: ${p} has no \\d \\w \\s \\b`);
      assert.ok(!/\(\?[<=!]/.test(p), `${k}: ${p} has no lookaround or named group`);
    });
    // every $ref resolves
    [...text.matchAll(/"\$ref":"#\/\$defs\/([A-Za-z0-9_.-]+)"/g)].forEach((m) => assert.ok(SCHEMAS[k].$defs[m[1]], `${k}: ${m[1]} resolves`));
  });
  const owners = {};
  KINDS.forEach((k) => (SCHEMAS[k]["x-sharedDefs"] || []).forEach((name) => {
    assert.ok(SCHEMAS[k].$defs[name], `${k} lists ${name} as shared and defines it`);
    (owners[name] = owners[name] || []).push(k);
  }));
  Object.keys(owners).forEach((name) => {
    const copies = owners[name].map((k) => JSON.stringify(SCHEMAS[k].$defs[name]));
    copies.forEach((c) => assert.equal(c, copies[0], `${name} is byte-identical in ${owners[name].join(", ")}`));
  });
  assert.deepEqual(owners.iconName.sort(), ["brand", "spec"]);
  assert.ok(owners.qaResult.includes("spec") && owners.qaResult.includes("qa-report"));
});

test("determinism: the same documents give the same verdicts twice, and the example is stable text", () => {
  const run = () => plain([["spec", VISUAL], ["spec", withFrozen(VISUAL)], ["preset", notebookLike()], ["brand", brandWithArt()], ["spec", (() => { const d = clone(VISUAL); d.style.rail = "x"; d.slides[3].items = Array(7).fill({}); return d; })()]]
    .map(([k, d]) => schema.validate(k, d).errors));
  eq(run(), run());
  const text = readFileSync(join(ROOT, "docs/examples/spec.visual.example.json"), "utf8");
  assert.equal(text, JSON.stringify(JSON.parse(text), null, 2).replace(/\u00a0/g, "\\u00a0") + "\n", "the example is in the canonical layout");
});
