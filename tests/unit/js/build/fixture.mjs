// tests/unit/js/build/fixture.mjs · a throwaway repository root for tools/build.mjs (the tool resolves everything from its own
// location, so a copy of it inside a temporary tree builds that tree and never touches the real src/ or runtime/).
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const REAL_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
export const BUILD = join(REAL_ROOT, "tools", "build.mjs");

/** A source file of exactly n bytes: one comment (n >= 5). */
export const filler = (n) => (n < 5 ? "" : "/*" + "a".repeat(n - 5) + "*/\n");

/** The chunk name a module builds: "qa-visual" -> "cs-qa-visual.js". */
export const chunkOf = (module) => `cs-${module}.js`;

/**
 * modules: [{ module, chunk?, order?, files? }]; files maps a file name to its text, or to a number (a filler of that many bytes).
 * Returns { root, runtime, run(...args), cleanup() }; run() executes the fixture's own copy of build.mjs.
 */
export function makeFixture(modules) {
  const scratch = join(tmpdir(), "cs-r3", "B1");
  mkdirSync(scratch, { recursive: true });
  const root = mkdtempSync(join(scratch, "cs-build-"));
  mkdirSync(join(root, "tools"));
  copyFileSync(BUILD, join(root, "tools", "build.mjs"));
  for (const m of modules) {
    const dir = join(root, "src", m.module);
    mkdirSync(dir, { recursive: true });
    const files = m.files || { "a.js": "var a = 1;\n" };
    for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), typeof body === "number" ? filler(body) : body, "utf8");
    writeFileSync(join(dir, "manifest.json"), JSON.stringify({ module: m.module, chunk: m.chunk || chunkOf(m.module), order: m.order ?? 0, files: Object.keys(files) }), "utf8");
  }
  return {
    root,
    runtime: join(root, "plugins", "carousel-studio", "skills", "carousel-design", "runtime"),
    run: (...args) => spawnSync(process.execPath, [join(root, "tools", "build.mjs"), ...args], { encoding: "utf8" }),
    cleanup: () => rmSync(root, { recursive: true, force: true })
  };
}

/** The bytes a chunk adds around its sources (header, wrapper, file marker), measured on a small fixture of that module. */
export function overheadOf(module) {
  const fx = makeFixture([{ module, files: { "a.js": 100 } }]);
  try {
    const res = fx.run("--report", "--format", "json", "--out", join(fx.root, "out"));
    return JSON.parse(res.stdout).chunks[0].bytes - 100;
  } finally { fx.cleanup(); }
}
