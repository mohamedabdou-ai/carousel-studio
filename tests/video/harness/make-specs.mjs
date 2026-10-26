// Writes the fixture specs as JSON files (./specs/<name>.spec.json) so the CLI scripts can be tested with --spec.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(here, "fixtures.js"), "utf8"), sandbox);
const out = path.join(here, "specs");
fs.mkdirSync(out, { recursive: true });
for (const [name, spec] of Object.entries(sandbox.window.CS_FIXTURES)) fs.writeFileSync(path.join(out, name + ".spec.json"), JSON.stringify(spec, null, 2) + "\n", "utf8");
console.log("specs:", Object.keys(sandbox.window.CS_FIXTURES).join(", "));
