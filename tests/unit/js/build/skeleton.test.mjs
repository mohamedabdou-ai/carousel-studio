// tests/unit/js/build/skeleton.test.mjs · the four Round 3 chunk skeletons: manifests (the file allocation table), the three real
// root files (CS.visual, CS.art, CS.qav) and the stubs. The root files are loaded from src/ one by one in a bare vm context, so
// other packages filling their own files never changes these verdicts.
// Run: node --test "tests/unit/js/build/*.test.mjs"
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import { REAL_ROOT } from "./fixture.mjs";

const SRC = join(REAL_ROOT, "src");
const plain = (v) => JSON.parse(JSON.stringify(v === undefined ? null : v));

/* The file allocation table of the build plan (section 4): module -> chunk, [file, owner, planned KiB] in load order. */
const FAT = {
  visual: ["cs-visual.js", [["root.js", "F3", 1.5], ["api.js", "A1", 1.5], ["hooks.js", "E2a", 4], ["stem.js", "D3", 6], ["icons.js", "D3", 12], ["space.js", "V1", 8], ["geometry.js", "V1", 6],
    ["plan-features.js", "V2", 7], ["plan-score.js", "V2", 8], ["plan-emit.js", "V2", 6], ["plan-api.js", "V2", 3], ["remix.js", "V4", 8], ["fix.js", "V5", 10], ["settle.js", "A9", 4], ["sketch.js", "V6b", 5], ["free.js", "free", 20]]],
  art: ["cs-art.js", [["root.js", "F3", 1.5], ["kit.js", "A1", 17], ["icon.js", "A1", 6], ["object.js", "A1", 3], ["anchor-icon.js", "A1", 4], ["index.js", "A1", 1], ["scene.js", "A2", 12],
    ["scene-more.js", "A3", 7], ["diagram.js", "A3", 8], ["mock.js", "A4", 20], ["mock-more.js", "A5", 8], ["artefact.js", "A5b", 9], ["chart.js", "A6", 10], ["numeral.js", "A6", 5],
    ["chart-more.js", "A7", 6], ["rows.js", "A8", 4], ["field.js", "A8", 3], ["marks.js", "A9", 8], ["word.js", "A10", 5], ["frames.js", "A11", 3], ["pattern.js", "A11", 2], ["bg.js", "A11", 1.5]]],
  "visual-ui": ["cs-visual-ui.js", [["panel.js", "U2", 14], ["editors.js", "U2", 11], ["picker.js", "U2", 6], ["bake.js", "U2", 3], ["remix-ui.js", "U4", 15], ["strip.js", "U4", 8], ["free.js", "free", 3]]],
  "qa-visual": ["cs-qa-visual.js", [["register.js", "F3", 1], ["deadspace-gates.js", "Q3", 14], ["text-integrity.js", "Q3", 5], ["d10.js", "Q3", 8], ["d11.js", "Q3", 4], ["squint.js", "Q3", 6], ["spec-gates.js", "Q4", 10]]]
};
const PLANNED = { visual: 110, art: 144, "visual-ui": 60, "qa-visual": 48 };
/* GR-3 and GR-5 as one pattern (the telemetry word and the script tag are spelled in two pieces, as the build tool does). */
const BANNED = new RegExp(["Math\\.random", "\\bDate\\b", "\\bperformance\\b", "analy" + "tics", "<\\/" + "script", "<" + "!--", "\\bfetch\\(", "XMLHttpRequest"].join("|"));
const F3_FILES = [["visual", "root.js", 1536], ["art", "root.js", 1536], ["qa-visual", "register.js", 1024]];

const manifest = (m) => JSON.parse(readFileSync(join(SRC, m, "manifest.json"), "utf8"));
const source = (m, f) => readFileSync(join(SRC, m, f), "utf8");

test("the four manifests list exactly the files of the allocation table, in load order", () => {
  for (const [module, [chunk, files]] of Object.entries(FAT)) {
    const m = manifest(module);
    assert.equal(m.module, module);
    assert.equal(m.chunk, chunk);
    assert.equal(m.order, 0);
    assert.deepEqual(m.files, files.map((f) => f[0]), module);
    for (const [file] of files) assert.ok(existsSync(join(SRC, module, file)), `${module}/${file}`);
  }
});

test("the planned KiB of each chunk add up to the allocation table (110, 144, 60, 48 with free design)", () => {
  for (const [module, [, files]] of Object.entries(FAT)) assert.equal(files.reduce((s, f) => s + f[2], 0), PLANNED[module], module);
});

test("every file is either a one-line stub that names its owner, or real code", () => {
  for (const [module, [, files]] of Object.entries(FAT)) {
    for (const [file, owner] of files) {
      const text = source(module, file);
      const stub = `/* src/${module}/${file} - owned by ${owner} - stub */\n`;
      if (text === stub) continue;
      assert.ok(text.trim().length > 0, `${module}/${file} is empty`);
      assert.ok(!/ - stub \*\/\s*$/.test(text), `${module}/${file} is neither the stub of ${owner} nor filled`);
    }
  }
});

test("the three F3 files are real code that wraps itself, and stay inside their budgets (1.5, 1.5 and 1 KiB)", () => {
  for (const planted of ["x = Math.random()", "new Date()", "performance.now()", "var analy" + "tics = 1", "</" + "script>", "<" + "!-- x", "fetch(u)", "new XMLHttpRequest()"]) assert.ok(BANNED.test(planted), planted);
  for (const [module, file, budget] of F3_FILES) {
    const text = source(module, file);
    assert.ok(text.includes("(function () {") && /\}\)\(\);\s*$/.test(text), `${module}/${file} wraps itself`);
    assert.ok(Buffer.byteLength(text, "utf8") <= budget, `${module}/${file} is ${Buffer.byteLength(text, "utf8")} B; budget ${budget}`);
    assert.ok(text.includes(module === "art" ? "C1:" : " - owned by F3"), `${module}/${file} names its current owner`);
    assert.ok(!BANNED.test(text), `${module}/${file} breaks a global rule`);
  }
});

/* ---- loading a root file ------------------------------------------------------------------------------------------------ */

/** Runs src/<module>/<file> the way the chunk wrapper does. `before` is script text that runs first (a fake CS.core, a document ...). */
function load(module, file, before = "") {
  const sandbox = {};
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  if (before) vm.runInContext(before, sandbox);
  vm.runInContext(`(function () {\n  "use strict";\n  var CS = (window.CS = window.CS || {});\n${source(module, file)}})();`, sandbox);
  return sandbox;
}

/* ---- CS.visual ---------------------------------------------------------------------------------------------------------- */

const FAKE_REGISTRY = `
  var reads = [];
  var document = {};
  window.CS = { core: { registry: { readBlock: function (doc, id) {
    reads.push(id);
    if (id === "cs-broken") throw new Error("not JSON");
    return id === "cs-icon-pack" ? { icons: 3 } : null;
  } } } };`;

test("CS.visual: the version, the namespace and the IS-2 hooks as harmless defaults", () => {
  const { CS } = load("visual", "root.js");
  assert.equal(CS.visual.version, "1.1.0");
  assert.equal(typeof CS.visual._.block, "function");
  assert.equal(typeof CS.visual._.register, "function");
  assert.equal(CS.visual.fill("anchor", {}, null), null);
  assert.equal(CS.visual.fill("rowicon", {}, 0), null);
  assert.equal(CS.visual.decorate({}, {}), undefined);
  assert.deepEqual(plain(CS.visual.chrome({})), { rail: null, motif: null });
  assert.deepEqual(plain(CS.visual.settle({}, {})), { marks: [] });
  assert.equal(CS.visual.expected({}, "s01.art.0"), null);
  assert.deepEqual(plain(CS.visual.autoPreview({}, {}, {})), []);
});

test("CS.visual._.block: the Node shim wins, then the DOM block through the registry; nothing without either", () => {
  assert.equal(load("visual", "root.js").CS.visual._.block("cs-icon-pack"), null, "no document, no registry: null");
  const { CS } = load("visual", "root.js", FAKE_REGISTRY);
  assert.deepEqual(plain(CS.visual._.block("cs-icon-pack")), { icons: 3 });
  CS.visual._.blocks = { "cs-icon-pack": { icons: 99 }, "cs-zero": 0 };
  assert.deepEqual(plain(CS.visual._.block("cs-icon-pack")), { icons: 99 }, "the shim is read first");
  assert.equal(CS.visual._.block("cs-zero"), 0, "a falsy shim value is still a value");
  delete CS.visual._.blocks;
  assert.deepEqual(plain(CS.visual._.block("cs-icon-pack")), { icons: 3 });
});

test("CS.visual._.block: a block is read once (a miss too), reset forgets, and a broken block is null with the reason kept", () => {
  const sandbox = load("visual", "root.js", FAKE_REGISTRY);
  const { CS } = sandbox;
  CS.visual._.block("cs-icon-pack"); CS.visual._.block("cs-icon-pack"); CS.visual._.block("cs-missing"); CS.visual._.block("cs-missing");
  assert.deepEqual(plain(vm.runInContext("reads", sandbox)), ["cs-icon-pack", "cs-missing"]);
  assert.equal(CS.visual._.block("cs-broken"), null);
  assert.equal(CS.visual._.errors["cs-broken"], "not JSON");
  const before = vm.runInContext("reads.length", sandbox);
  CS.visual._.reset();
  assert.deepEqual(plain(CS.visual._.errors), {});
  CS.visual._.block("cs-icon-pack");
  assert.equal(vm.runInContext("reads.length", sandbox), before + 1, "after reset the block is read again");
  assert.equal(CS.visual._.block("constructor"), null, "ids that are Object.prototype names are ordinary ids");
});

test("CS.visual._.block: a shim set before the chunk loads survives it", () => {
  const { CS } = load("visual", "root.js", `window.CS = { visual: { _: { blocks: { "cs-art-direction": { v: 1 } } } } };`);
  assert.deepEqual(plain(CS.visual._.block("cs-art-direction")), { v: 1 });
});

test("CS.visual._.register: sets and returns the member, replaces a hook, refuses bad names", () => {
  const { CS } = load("visual", "root.js");
  const icons = { has() { return true; } };
  assert.equal(CS.visual._.register("icons", icons), icons);
  assert.equal(CS.visual.icons, icons);
  const fill = () => "node";
  CS.visual._.register("fill", fill);
  assert.equal(CS.visual.fill("anchor"), "node");
  for (const bad of ["", "_", "Version", "version", "has space", "9a", "a-b", undefined, null, 5]) assert.throws(() => CS.visual._.register(bad, {}), /bad member/, String(bad));
  assert.equal(CS.visual.version, "1.1.0");
});

/* ---- CS.art ------------------------------------------------------------------------------------------------------------- */

test("CS.art: the IS-3 shape, and an unregistered kind builds null", () => {
  const { CS } = load("art", "root.js");
  assert.deepEqual(Object.keys(CS.art).sort(), ["_", "build", "caps", "has", "kinds", "kit", "register"]);
  assert.deepEqual(plain(CS.art.caps()), { v: 1, art: {} });
  assert.deepEqual(plain(CS.art.kit), {});
  assert.equal(CS.art.build({ kind: "icon", icon: "clock" }, {}), null);
  assert.equal(CS.art.build(null, {}), null);
  assert.equal(CS.art.build({}, {}), null);
  assert.equal(CS.art.has("icon"), false);
  assert.deepEqual(plain(CS.art.kinds()), []);
});

test("CS.art: a builder gets (anchor, ctx), its result passes through, a falsy result is null", () => {
  const { CS } = load("art", "root.js");
  const seen = [];
  const result = { el: {}, boxes: [], labels: [] };
  CS.art.register("icon", (a, ctx) => { seen.push([a, ctx]); return result; }, ["icon"]);
  CS.art.register("field", () => undefined, ["panel"]);
  const anchor = { kind: "icon", icon: "clock" }, ctx = { slideId: "s01" };
  assert.equal(CS.art.build(anchor, ctx), result);
  assert.deepEqual(seen, [[anchor, ctx]]);
  assert.equal(CS.art.build({ kind: "field" }, ctx), null);
  assert.deepEqual(plain(CS.art.kinds()), ["field", "icon"]);
  assert.equal(CS.art.has("icon"), true);
});

test("CS.art: sub-kinds let several files share a kind, and has(kind, sub) tells the planner what exists", () => {
  const { CS } = load("art", "root.js");
  const tag = (name) => () => ({ name });
  CS.art.register("chart", tag("core6"), ["bars-h", "columns", "donut", "ring", "meter", "waffle"]);
  CS.art.register("chart", tag("more"), ["line", "funnel"]);
  CS.art.register("scene", tag("scene-mvp"), ["solo", "trio"]);
  CS.art.register("mock", tag("mock-mvp"), ["chat", "notes"]);
  CS.art.register("pattern", tag("patterns"), ["stripes"]);
  assert.equal(CS.art.has("chart"), true);
  assert.equal(CS.art.has("chart", "donut"), true);
  assert.equal(CS.art.has("chart", "line"), true);
  assert.equal(CS.art.has("chart", "icon-bars"), false);
  assert.equal(CS.art.has("scene", "orbit"), false);
  assert.equal(CS.art.has("mock", "chat"), true);
  const name = (anchor) => plain(CS.art.build(anchor, {})).name;
  assert.equal(name({ kind: "chart", chart: { kind: "donut" } }), "core6");
  assert.equal(name({ kind: "chart", chart: { kind: "funnel" } }), "more");
  assert.equal(name({ kind: "scene", template: "trio" }), "scene-mvp");
  assert.equal(name({ kind: "mock", mock: { kind: "notes" } }), "mock-mvp");
  assert.equal(name({ kind: "pattern", pattern: "stripes" }), "patterns");
  assert.equal(CS.art.build({ kind: "chart", chart: { kind: "icon-bars" } }, {}), null, "no builder declares it");
  assert.equal(CS.art.build({ kind: "scene", template: "orbit" }, {}), null);
  assert.equal(CS.art.build({ kind: "chart" }, {}), null, "an incomplete chart has no canonical sub-kind");
  assert.equal(CS.art._.sub({ kind: "chart", chart: { kind: "ring" } }), "ring");
  assert.equal(CS.art._.sub({ kind: "icon", icon: "clock" }), "icon");
});

test("CS.art: required sub-kind lists and duplicate rejection preserve the first builder, twice", () => {
  const { CS } = load("art", "root.js");
  CS.art.register("scene", () => ({ name: "old" }), ["solo"]);
  const caps = JSON.stringify(CS.art.caps());
  for (let i = 0; i < 2; i++) {
    assert.throws(() => CS.art.register("scene", () => ({})), { code: "E_ART_REGISTER" });
    assert.throws(() => CS.art.register("scene", () => ({}), ["solo", "trio"]), { code: "E_ART_DUPLICATE" });
    assert.equal(CS.art.has("scene", "trio"), false, "duplicate registration is atomic");
    assert.equal(plain(CS.art.build({ kind: "scene" }, {})).name, "old");
    assert.equal(JSON.stringify(CS.art.caps()), caps);
  }
});

test("CS.art.register: the kind is a string and the builder a function", () => {
  const { CS } = load("art", "root.js");
  assert.throws(() => CS.art.register(5, () => null, ["icon"]), { code: "E_ART_REGISTER" });
  assert.throws(() => CS.art.register("icon", null, ["icon"]), { code: "E_ART_REGISTER" });
  assert.throws(() => CS.art.register("icon", {}, ["icon"]), { code: "E_ART_REGISTER" });
});

/* ---- CS.qav ------------------------------------------------------------------------------------------------------------- */

const HOOK = `window.CS = { qa: { _: { gates: { text: [], rendered: [] } } } };`;

test("CS.qav.add: with the cs-qa hook present a gate lands at once, in order, once", () => {
  const { CS } = load("qa-visual", "register.js", HOOK);
  const a = ["VA1.anchor-present", () => []], b = ["D9.band", () => []], c = ["D10.nesting", () => []];
  assert.equal(CS.qav.add("text", a), a);
  CS.qav.add("rendered", b);
  CS.qav.add("rendered", c);
  CS.qav.add("rendered", b);
  assert.deepEqual(Array.from(CS.qa._.gates.text), [a]);
  assert.deepEqual(Array.from(CS.qa._.gates.rendered), [b, c]);
  assert.equal(CS.qav.flush(), 0);
});

test("CS.qav.add: without the hook a gate waits, and flush() moves it when the hook appears", () => {
  const { CS } = load("qa-visual", "register.js");
  const a = { id: "VA1" }, b = { id: "D9" };
  CS.qav.add("text", a);
  CS.qav.add("rendered", b);
  assert.equal(CS.qav.flush(), 2, "still waiting");
  CS.qa = { _: {} };
  assert.equal(CS.qav.flush(), 2, "cs-qa without the hook: still waiting");
  CS.qa._.gates = { text: [], rendered: [] };
  assert.equal(CS.qav.flush(), 0);
  assert.deepEqual(Array.from(CS.qa._.gates.text), [a]);
  assert.deepEqual(Array.from(CS.qa._.gates.rendered), [b]);
  assert.equal(CS.qav.flush(), 0);
  assert.deepEqual(Array.from(CS.qa._.gates.text), [a], "nothing is delivered twice");
});

test("CS.qav.add: the next add also delivers the waiting gates, keeping the order they came in", () => {
  const { CS } = load("qa-visual", "register.js");
  const order = [{ n: 1 }, { n: 2 }, { n: 3 }];
  CS.qav.add("rendered", order[0]);
  CS.qav.add("rendered", order[1]);
  CS.qa = { _: { gates: { text: [], rendered: [] } } };
  CS.qav.add("rendered", order[2]);
  assert.deepEqual(CS.qa._.gates.rendered.map((g) => g.n), [1, 2, 3]);
});

test("CS.qav.add: the scope is text or rendered", () => {
  const { CS } = load("qa-visual", "register.js", HOOK);
  for (const bad of ["export", "", undefined, "Text"]) assert.throws(() => CS.qav.add(bad, {}), /scope is text or rendered/, String(bad));
  assert.equal(CS.qav.flush(), 0);
});
