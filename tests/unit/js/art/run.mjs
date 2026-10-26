// tests/unit/js/art/run.mjs · runner of the art tests (IS-11).
//   node tests/unit/js/art/run.mjs [--only kit,registry] [--out DIR] [--real] [--final] [--list]
// Runner fail-closed guard tests (support/ is not scanned): node --test tests/unit/js/art/support/runner.test.mjs
// Every *.test.mjs of this folder default-exports { module, tests: [{ name, real?, run(t) }] }; t has ok eq near gte lte fail skip (the assertions of tests/parity/lib)
// and t.art, the harness of harness.mjs. `real: true` tests run on the shipped icon pack (built privately; skipped when the vendored packages are missing); --real runs
// every test that way. --only takes file prefixes (icon, kit, scene ...). --out DIR is where t.art.save writes PNG sheets (default: nowhere; CS_ART_OUT also works).
// Exit 0 all tests ran and passed, 1 a test failed or skipped, 70 the page could not be driven.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { assertions } from "../../../parity/lib/barepage.mjs";
import { withArt } from "./harness.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2), flag = (n) => { const i = args.indexOf("--" + n); return i >= 0 ? args[i + 1] : null; };

export async function runCase(tc, art) {
  if (tc.skip) throw new Error("test marked skipped: " + tc.name);
  if (typeof tc.run !== "function") throw new Error("test has no run(): " + tc.name);
  if (art.reset) await art.reset(); // Contact sheets may live outside #art-stage; isolate hit tests between cases.
  await tc.run(Object.assign(assertions(), { art }));
}
export function resultCode({ pass, fail, skip, total }) {
  return fail || skip || !total || pass !== total ? 1 : 0;
}

async function main() {
  if (flag("out")) process.env.CS_ART_OUT = path.resolve(flag("out"));
  const only = flag("only") ? flag("only").split(",").map((s) => s.trim()).filter(Boolean) : null;
  const files = fs.readdirSync(HERE).filter((f) => /\.test\.mjs$/.test(f)).sort().filter((f) => !only || only.some((o) => f === o + ".test.mjs" || f.startsWith(o + ".")));
  if (args.includes("--list")) { console.log(files.join("\n")); return 0; }
  if (!files.length) { console.error("no test file matches --only " + (only || []).join(",")); return 64; }
  const tests = [];
  if (only && only.some((o) => !files.some((f) => f === o + ".test.mjs" || f.startsWith(o + ".")))) throw new Error("unmatched --only suite");
  for (const f of files) {
    const m = (await import(pathToFileURL(path.join(HERE, f)).href)).default;
    if (!Array.isArray(m?.tests) || !m.tests.length) throw new Error(f + " contains no tests");
    for (const tc of m.tests) tests.push({ ...tc, file: f });
  }
  let pass = 0, fail = 0, skip = 0;
  for (const mode of ["fixtures", "real"]) {
    const group = tests.filter((tc) => (args.includes("--real") || args.includes("--final") || tc.real ? "real" : "fixtures") === mode);
    if (!group.length) continue;
    await withArt(async (art) => {
      for (const tc of group) {
        const t = Object.assign(assertions(), { art });
        try {
          if (mode === "real" && !art.real) t.skip("the shipped icon pack could not be read");
          await runCase(tc, art);
          console.log("ok    " + tc.file.replace(".test.mjs", "") + " · " + tc.name); pass++;
        } catch (e) {
          if (e && e.skip && !args.includes("--final")) { console.log("skip  " + tc.file.replace(".test.mjs", "") + " · " + tc.name + " (" + e.message + ")"); skip++; }
          else { console.log("FAIL  " + tc.file.replace(".test.mjs", "") + " · " + tc.name + "\n      " + String(e && e.message || e).split("\n").slice(0, 6).join("\n      ")); fail++; }
        }
      }
      if (art.errors.length) { console.log("page errors: " + art.errors.slice(0, 3).join(" | ")); fail++; }
    }, { data: mode, final: args.includes("--final") });
  }
  console.log(`\n${pass} passed, ${fail} failed, ${skip} skipped`);
  return resultCode({ pass, fail, skip, total: tests.length });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main().then((c) => { process.exitCode = c; }, (e) => { process.stderr.write("cs-error: E_INTERNAL: " + (e && e.stack || e) + "\n"); process.exitCode = 70; });
