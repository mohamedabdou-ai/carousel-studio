// tests/unit/js/lib/load-lib.mjs
// Loads src/lib (the library half of cs-core.js) into a bare vm context, the way the chunk wrapper does, without a browser.
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

export function loadLib({ rules, coreFiles = [], document } = {}) {
  const manifest = JSON.parse(readFileSync(join(ROOT, "src/lib/manifest.json"), "utf8"));
  const parts = manifest.files.map((f) => `/* ---- file: ${f} ---- */\n` + readFileSync(join(ROOT, "src/lib", f), "utf8"));
  coreFiles.forEach((f) => parts.push(readFileSync(join(ROOT, "src/core", f), "utf8")));
  const code = `(function () {\n"use strict";\nvar CS = (window.CS = window.CS || {});\n${parts.join("\n")}\n})();`;
  const sandbox = { console, TextEncoder, TextDecoder, setTimeout, clearTimeout };
  if (document) sandbox.document = document;
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: "src/lib" });
  const CS = sandbox.CS;
  if (rules) CS.core.registry = { rules: () => rules };
  return CS;
}

export function readJson(rel) {
  return JSON.parse(readFileSync(join(ROOT, rel), "utf8"));
}
