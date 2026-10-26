// tests/preset-lint/replay-probe.mjs · E4b. Runs the real replaySupportCheck (src/paint/replay.js, rule A6) on planted computed styles and prints the flags it raises,
// so tests/unit/py/test_preset_lint.py can hold the strict lint to the painter: every construct the painter refuses is a strict error, every construct it draws is not.
//   stdin   {"cases": [{"id": "...", "computed": {computed style of the element}, "pseudo": {"before": {...}, "after": {...}}}]}
//   stdout  {"flags": [every flag("...") name in replaySupportCheck], "results": [{"id": "...", "unsupported": ["box-shadow-inset", ...]}]}
// No browser: the painter file is a script of function declarations, loaded into a bare vm with a stub window whose getComputedStyle returns the planted values.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const source = fs.readFileSync(path.join(ROOT, "src/paint/replay.js"), "utf8");
const body = /function replaySupportCheck\(el\) \{[\s\S]*?\n\}\n/.exec(source);
const flags = body ? [...new Set([...body[0].matchAll(/flag\("([a-z0-9-]+)"\)/g)].map((m) => m[1]))].sort() : [];

let current;
const none = { content: "none", display: "inline" };
const win = { getComputedStyle: (el, pseudo) => (pseudo ? (current.pseudo || {})[pseudo === "::before" ? "before" : "after"] || none : current.computed) };
// DOMMatrix: the painter asks is2D of a matrix3d(): a planted matrix3d is a real 3D transform (Chromium reports a 2D one as matrix())
const cx = vm.createContext({ window: win, DOMMatrix: class { constructor(text) { this.is2D = !/^matrix3d/.test(text); } }, console });
vm.runInContext(source + "\nthis.__check = replaySupportCheck;", cx, { filename: "src/paint/replay.js" });
const el = { querySelectorAll: () => [], closest: () => null };

const { cases } = JSON.parse(fs.readFileSync(0, "utf8"));
const results = cases.map((c) => {
  current = { computed: { display: "block", ...c.computed }, pseudo: c.pseudo };
  return { id: c.id, unsupported: cx.__check(el).unsupported.sort() };
});
process.stdout.write(JSON.stringify({ flags, results }));
