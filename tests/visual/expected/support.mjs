// tests/visual/expected/support.mjs · shared by tests/unit/js/visual/plan.test.mjs and tests/visual/auto-acceptance.mjs (V2).
// Loads the planner exactly as the chunk wraps it (src/lib canon, then the src/visual files it needs) into a bare Node vm, with the real data blocks, and builds the
// preset objects, the slice capabilities and a small JSON-schema checker for the stored `visual` objects. Nothing here touches the document or the network.
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
export const SK = join(ROOT, "plugins", "carousel-studio", "skills", "carousel-design");
export const EXPECTED = dirname(fileURLToPath(import.meta.url));
export const readJson = (f) => JSON.parse(readFileSync(f, "utf8"));
export const plain = (v) => JSON.parse(JSON.stringify(v === undefined ? null : v));
export const clone = plain;

export const PLAN_FILES = ["plan-features.js", "plan-score.js", "plan-emit.js", "plan-api.js"];
const BASE = ["root.js", "stem.js", "icons.js", "space.js", "geometry.js"];

/** A fresh vm with CS.core.canon and CS.visual (planner included) plus the real data blocks. `dir` overrides where the plan-*.js files come from. */
export function boot({ dir = join(ROOT, "src", "visual"), blocks = {}, extra = [] } = {}) {
  const sb = {};
  sb.window = sb;
  vm.createContext(sb);
  const run = (base, files) => vm.runInContext(`(function(){"use strict";var CS=(window.CS=window.CS||{});\n${files.map((f) => readFileSync(join(base, f), "utf8")).join("\n")}\n})();`, sb, { filename: base });
  run(join(ROOT, "src", "lib"), ["root.js", "canon.js"]);
  run(join(ROOT, "src", "visual"), BASE);
  if (extra.length) run(join(ROOT, "src", "visual"), extra);
  run(dir, PLAN_FILES);
  const D = join(SK, "data");
  sb.CS.visual._.blocks = {
    "cs-icon-pack": readJson(join(D, "icons", "pack.json")), "cs-icon-index": readJson(join(D, "icons", "index.json")), "cs-icon-concepts": readJson(join(D, "icons", "concepts.json")),
    "cs-icon-stem": readJson(join(D, "icons", "stem.json")), "cs-icon-objects": readJson(join(D, "icons", "objects.json")), "cs-art-direction": readJson(join(D, "art-direction.json")), ...blocks };
  return sb.CS;
}

/** The capabilities of the wave-2 slice (build plan r2 3.1): what the planner may draw. */
export const SLICE = {
  v: 1,
  art: { icon: ["icon"], field: ["icon", "numeral", "panel", "word"], numeral: ["bar", "icon", "none", "waffle"], chart: ["bars-h"], mock: ["chat", "notes"], rows: ["list"], word: ["solid", "sticker", "struck"] },
  recipes: ["under", "over", "full", "center"],
  variants: { stat: ["icon", "chart"], compare: ["table", "before-after"], quote: ["statement"], rehook: ["statement"], step: ["track"], cta: ["action"], item: ["numeral"], grid: ["bento"], timeline: ["rail"] },
  hash: "5a1ce000",
};

const SIGNATURE = { creator: ["pile", "staircase", "versus"], poster: ["specimen", "staircase", "versus"], notebook: ["cluster", "staircase", "versus"], swiss: ["sheet", "staircase", "versus"], interface: ["widgets", "staircase", "versus"], heritage: ["niche", "staircase", "versus"] };

/** A preset object for the planner: the real preset.json, with an art block (affinity from the data table) and the two tones when the file has none yet. */
export function preset(id) {
  const p = readJson(join(SK, "styles", id, "preset.json")), aff = readJson(join(SK, "data", "art-direction.json")).affinity[id];
  if (!p.art) p.art = { affinity: Object.fromEntries(Object.entries(aff).map(([k, v]) => [k, v / 100])), templates: SIGNATURE[id] };
  if (!p.tones) p.tones = { invert: { roles: {} }, field: { roles: {} } };
  return p;
}

export function decks() {
  const dir = join(EXPECTED, "decks");
  return Object.fromEntries(readdirSync(dir).filter((f) => f.endsWith(".json")).sort().map((f) => [f.replace(/\.json$/, ""), readJson(join(dir, f))]));
}
export const fixture = (name) => readJson(join(ROOT, "tests", "fixtures", name));

/** Merge a plan into a copy of the spec the way the Studio saves it: slides[i].visual, slides[i].variant (only when the slide has none), style.planV and style.motif. */
export function apply(spec, plan) {
  const out = clone(spec), by = Object.fromEntries(plan.slides.map((s) => [s.id, s]));
  for (const s of out.slides) { const p = by[s.id]; if (p) { s.visual = p.visual; if (p.variant && !s.variant) s.variant = p.variant; } }
  out.style = { ...out.style, ...plan.style };
  return out;
}

/* ---- a small JSON-schema checker for the closed subset the spec schema uses (type, enum, properties, additionalProperties, required, items, min/max, pattern, $ref) ---- */
export function check(schema, root, value, path = "") {
  const errs = [];
  const fail = (m) => errs.push(`${path || "/"}: ${m}`);
  if (schema.$ref) return check(schema.$ref.replace(/^#\//, "").split("/").reduce((o, k) => o[k], root), root, value, path);
  const t = schema.type, is = (x) => (x === "integer" ? Number.isInteger(value) : x === "number" ? typeof value === "number" : x === "array" ? Array.isArray(value) : x === "object" ? value && typeof value === "object" && !Array.isArray(value) : typeof value === x);
  if (t && !(Array.isArray(t) ? t.some(is) : is(t))) { fail(`type ${t}`); return errs; }
  if (schema.enum && !schema.enum.includes(value)) fail(`${JSON.stringify(value)} not in enum`);
  if (schema.const !== undefined && value !== schema.const) fail("const");
  if (typeof value === "string") {
    if (schema.maxLength != null && [...value].length > schema.maxLength) fail(`longer than ${schema.maxLength}`);
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) fail(`pattern ${schema.pattern}`);
  }
  if (typeof value === "number") {
    if (schema.minimum != null && value < schema.minimum) fail(`below ${schema.minimum}`);
    if (schema.maximum != null && value > schema.maximum) fail(`above ${schema.maximum}`);
  }
  if (Array.isArray(value)) {
    if (schema.maxItems != null && value.length > schema.maxItems) fail(`more than ${schema.maxItems} items`);
    if (schema.minItems != null && value.length < schema.minItems) fail(`fewer than ${schema.minItems} items`);
    if (schema.uniqueItems && new Set(value.map((v) => JSON.stringify(v))).size !== value.length) fail("duplicates");
    if (schema.items) value.forEach((v, i) => errs.push(...check(schema.items, root, v, `${path}/${i}`)));
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const k of schema.required || []) if (!(k in value)) fail(`missing ${k}`);
    for (const [k, v] of Object.entries(value)) {
      if (schema.properties?.[k]) errs.push(...check(schema.properties[k], root, v, `${path}/${k}`));
      else if (schema.additionalProperties === false) fail(`unknown key ${k}`);
    }
  }
  return errs;
}
export const specSchema = () => readJson(join(SK, "schemas", "spec.schema.json"));
/** Errors of one stored `visual` object against $defs/visual of the spec schema. */
export const visualErrors = (visual, schema = specSchema()) => check(schema.$defs.visual, schema, visual, "visual");
