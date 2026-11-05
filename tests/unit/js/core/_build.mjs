// tests/unit/js/core/_build.mjs
// Private build of the cs-core.js chunk for the engine tests (CONTRACT 4.0 and 2.4 rule 4): the same wrapper tools/build.mjs
// writes, applied to src/core (and to src/lib with --lib). The release chunk in runtime/ comes from tools/build.mjs only.
//
//   node tests/unit/js/core/_build.mjs <out.js> [--lib]
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const VERSION = "cs-1.1.1";

export function buildChunk({ withLib = false } = {}) {
  const modules = [];
  if (withLib && existsSync(join(ROOT, "src/lib/manifest.json"))) modules.push("lib");
  modules.push("core");
  const parts = [];
  for (const m of modules) {
    const manifest = JSON.parse(readFileSync(join(ROOT, "src", m, "manifest.json"), "utf8"));
    for (const f of manifest.files) {
      const text = readFileSync(join(ROOT, "src", m, f), "utf8").replace(/\r\n/g, "\n").replace(/\s+$/, "\n");
      parts.push(`  /* ---- file: ${f} ---- */\n${text}`);
    }
  }
  return `/*! Carousel Studio runtime chunk cs-core.js · ${VERSION} · Apache-2.0 */\n(function () {\n  "use strict";\n  var CS = (window.CS = window.CS || {});\n${parts.join("\n")}})();\n`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const out = process.argv[2];
  if (!out) { console.error("usage: node _build.mjs <out.js> [--lib]"); process.exit(64); }
  const text = buildChunk({ withLib: process.argv.includes("--lib") });
  mkdirSync(dirname(resolve(out)), { recursive: true });
  writeFileSync(out, text, "utf8");
  const kib = Buffer.byteLength(text, "utf8") / 1024;
  console.log(`wrote ${out} (${kib.toFixed(1)} KiB)`);
  if (kib > 200) { console.error("chunk exceeds 200 KiB"); process.exit(70); }
}
