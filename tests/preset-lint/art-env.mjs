// tests/preset-lint/art-env.mjs · E4b. Files of the real art chunk (src/art, always in the order of its manifest) on the real library (src/lib: colour, canon) in a bare vm: no browser,
// no build, a few-method DOM stub that records what the builders create. The probes of this folder (kit-pairs, chart-gap) use it to run the renderer's own code on the lint's inputs.
// A probe loads only the files it needs, so a file another package is editing cannot break it.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
const node = (tag) => ({ tag, attrs: {}, kids: [], setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k]; }, appendChild(child) { this.kids.push(child); return child; } });

export function loadArt(only) {
  const document = { createElementNS: (ns, tag) => node(tag), createElement: node, createTextNode: (text) => ({ text }) };
  const cx = vm.createContext({ document, console, TextEncoder, TextDecoder });
  cx.window = cx;
  const lib = JSON.parse(read("src/lib/manifest.json")).files.map((file) => read("src/lib/" + file)).join("\n");
  vm.runInContext(`(function () {\n"use strict";\nvar CS = (window.CS = window.CS || {});\n${lib}\n})();`, cx, { filename: "src/lib" });
  for (const file of JSON.parse(read("src/art/manifest.json")).files.filter((f) => !only || only.includes(f))) vm.runInContext(read("src/art/" + file), cx, { filename: "src/art/" + file });
  return cx.CS;
}
