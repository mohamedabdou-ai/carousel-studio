// tests/visual/cases/load.mjs · loads the V1 source files (src/visual) into a bare vm context the way the chunk wrapper does, without
// building the chunk: other packages filling their own files of cs-visual never changes these verdicts.
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
export const CASES = dirname(fileURLToPath(import.meta.url));
export const readJson = (name) => JSON.parse(readFileSync(join(CASES, name), "utf8"));

/** Returns the CS namespace after root.js, space.js and geometry.js; `core` (optional) is placed on CS first, as a stub of cs-core. */
export function loadVisual({ core, files = ["root.js", "space.js", "geometry.js"] } = {}) {
  const parts = files.map((f) => `/* ---- file: ${f} ---- */\n` + readFileSync(join(ROOT, "src", "visual", f), "utf8"));
  const code = `(function () {\n"use strict";\nvar CS = (window.CS = window.CS || {});\n${parts.join("\n")}\n})();`;
  const sandbox = { console };
  sandbox.window = sandbox;
  if (core) sandbox.CS = { core };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: "src/visual" });
  return sandbox.CS;
}
