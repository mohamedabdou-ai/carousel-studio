// C1: actual manifest load, strict ownership and browser/DOM-free capability parity.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
function bare(files) {
  const cx = vm.createContext({ CS: {} });
  for (const file of files) vm.runInContext(read(file), cx, { filename: file });
  return cx;
}
const plain = (x) => JSON.parse(JSON.stringify(x));
// Every advertised sub must be constructible through the canonical anchor fields.
const REACH = {
  icon: (sub) => { assert.equal(sub, "icon"); return {}; },
  scene: (sub) => ({ template: sub }), chart: (sub) => ({ chart: { kind: sub } }),
  mock: (sub) => ({ mock: { kind: sub } }), pattern: (sub) => ({ pattern: sub }),
  numeral: (sub) => ({ companion: sub }), word: (sub) => ({ wordStyle: sub }),
  rows: (sub) => { assert.equal(sub, "list"); return {}; },
  field: (sub) => {
    const fields = { panel: {}, numeral: { value: "1" }, word: { word: "x" }, icon: { icon: "clock" } };
    assert.ok(Object.hasOwn(fields, sub), "unreachable field sub " + sub); return fields[sub];
  }
};
function reachable(a, kind, sub) {
  assert.ok(Object.hasOwn(REACH, kind), "no canonical sub rule for " + kind);
  const anchor = { kind, ...REACH[kind](sub) };
  assert.equal(a._.sub(anchor), sub, "unreachable capability " + kind + ":" + sub);
  return anchor;
}
export function registryChecks() {
  for (let run = 0; run < 2; run++) {
    const cx = bare(["src/art/root.js"]), a = cx.CS.art, fn = (anchor) => ({ tag: a._.sub(anchor) });
    for (const subs of [undefined, null, [], "solo", [""], [1]]) assert.throws(() => a.register("scene", fn, subs), { code: "E_ART_REGISTER" });
    a.register("scene", fn, ["solo", "pair"]);
    const original = JSON.stringify(a.caps());
    assert.throws(() => a.register("scene", () => null, ["trio", "pair"]), { code: "E_ART_DUPLICATE" });
    assert.equal(a.has("scene", "trio"), false, "a failed registration is atomic");
    assert.equal(JSON.stringify(a.caps()), original);
    assert.throws(() => a.register("chart", fn, ["bars-h", "bars-h"]), { code: "E_ART_DUPLICATE" });
    assert.equal(a.has("chart"), false);
    assert.equal(a.build({ kind: "scene" }, {}).tag, "solo");
    assert.equal(a.build({ kind: "scene", template: "unknown" }, {}), null);
    assert.equal(a.build(null, {}), null);
    const cases = [
      [{ kind: "icon" }, "icon"], [{ kind: "scene" }, "solo"], [{ kind: "scene", template: "pair" }, "pair"],
      [{ kind: "chart", chart: { kind: "bars-h" } }, "bars-h"], [{ kind: "mock", mock: { kind: "chat" } }, "chat"],
      [{ kind: "pattern", pattern: "dots" }, "dots"], [{ kind: "rows" }, "list"], [{ kind: "word" }, "solid"],
      [{ kind: "word", wordStyle: "struck" }, "struck"], [{ kind: "numeral" }, "none"], [{ kind: "numeral", companion: "waffle" }, "waffle"],
      [{ kind: "field", value: "0", word: "x", icon: "clock" }, "numeral"], [{ kind: "field", word: "x" }, "word"],
      [{ kind: "field", object: "clock" }, "icon"], [{ kind: "field" }, "panel"]
    ];
    for (const [input, expected] of cases) assert.equal(a._.sub(input), expected);
    const cap = a.caps(); cap.art.scene.push("fake"); assert.equal(a.has("scene", "fake"), false);
    assert.equal(JSON.stringify(a.caps()), original, "caps snapshots cannot mutate the registry");
    a.register("rows", fn, ["bento"]);
    assert.throws(() => reachable(a, "rows", "bento"), "the reachability audit catches an unreachable registered sub");
    assert.throws(() => reachable(a, "photo", "image"), "photo has no canonical sub rule");
  }
}
export function manifestChecks() {
  let last;
  for (let run = 0; run < 2; run++) {
    const cx = bare(["src/lib/canon.js"]), manifest = JSON.parse(read("src/art/manifest.json"));
    let previous = { art: {} }, owners = new Map(), probe = {};
    for (const file of manifest.files) {
      if (file === "numeral.js") assert.equal(typeof cx.CS.art.chart?.comp, "function", "chart.js publishes before numeral consumes");
      if (file === "field.js") for (const key of ["lab", "card", "mark"]) assert.equal(typeof cx.CS.art._[key], "function", "rows.js publishes " + key + " before field consumes");
      vm.runInContext(read("src/art/" + file), cx, { filename: "src/art/" + file });
      const a = cx.CS.art, next = a.caps();
      for (const [kind, subs] of Object.entries(previous.art)) for (const sub of subs) assert.ok(next.art[kind].includes(sub), "caps only grows at " + file);
      for (const [kind, subs] of Object.entries(next.art)) for (const sub of subs) {
        const anchor = reachable(a, kind, sub);
        // Probe actual dispatch without drawing: earlier builders must keep winning.
        assert.equal(a.has(kind, sub), true);
        assert.equal(a.build(anchor, probe), owners.get(kind + ":" + sub), "builder identity at " + file);
      }
      // Temporarily wrap new builders when they register; subsequent files must never replace them.
      if (file === "root.js") {
        const register = a.register;
        a.register = function (kind, fn, subs) {
          const result = register(kind, function (anchor, ctx) { return ctx === probe ? fn : fn(anchor, ctx); }, subs);
          for (const sub of subs) { const key = kind + ":" + sub; assert.equal(owners.has(key), false); owners.set(key, fn); }
          return result;
        };
      }
      previous = plain(next);
    }
    vm.runInContext(read("src/visual/root.js"), cx);
    vm.runInContext(read("src/visual/api.js"), cx);
    const cap = plain(cx.CS.visual.caps()), { hash, ...payload } = cap;
    assert.equal(hash, cx.CS.core.canon.fnv1a64(cx.CS.core.canon.canonicalJSON(payload)));
    assert.equal(typeof cx.document, "undefined", "cs-art loads with no document");
    assert.equal(cap.types.length, 20);
    assert.deepEqual(cap.recipes, ["under", "over", "full", "center"]);
    if (last) assert.deepEqual(cap, last, "two fresh VM loads have identical caps");
    last = cap;
  }
  return last;
}
export default {
  module: "registry",
  tests: [
    { name: "strict registry: atomic duplicates, canonical subs, immutable snapshots, twice", async run() { registryChecks(); } },
    { name: "manifest loads without DOM; caps grows and browser/VM hashes match, twice", async run(t) {
      const expected = manifestChecks();
      t.eq(await t.art.evaluate(() => CS.visual.caps()), expected);
      t.eq(await t.art.evaluate(() => CS.visual.caps()), expected);
    } }
  ]
};
if (process.argv.includes("--vm-only")) {
  registryChecks(); console.log("strict registry checks passed (twice)");
  console.log("bare VM manifest: " + JSON.stringify(manifestChecks()));
}
