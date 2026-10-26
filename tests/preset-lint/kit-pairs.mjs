// tests/preset-lint/kit-pairs.mjs · E4b. Runs the real kit.frame (src/art/kit.js) on a list of cases and prints the plate fill and the glyph colour it chose, so
// tests/unit/py/test_preset_lint.py can hold preset_lint.plate_pair (G3, G6) to the renderer instead of to a copy of its rules.
//   stdin   {"cases": [{"id": "...", "treatment": "giant", "art": {preset.art}, "tokens": {bg, surface, ink, inkMuted, accent, accent2, onAccent, line, support: [a, b], note}}]}
//   stdout  [{"id": "...", "fill": "#RRGGBB", "glyph": "#RRGGBB"}]
import fs from "node:fs";
import { loadArt } from "./art-env.mjs";

const kit = loadArt(["root.js", "kit.js"]).art.kit;
const { cases } = JSON.parse(fs.readFileSync(0, "utf8"));
const out = cases.map((c) => {
  const r = kit.frame(c.treatment, 160, { dna: kit.dna(c.art), tk: kit.palette(c.tokens), rtl: true, seed: String(c.id) }, () => []);
  return { id: c.id, fill: r.fill, glyph: r.glyph };
});
process.stdout.write(JSON.stringify(out));
