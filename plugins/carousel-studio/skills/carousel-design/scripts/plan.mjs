#!/usr/bin/env node
// V6c: DOM-free planner CLI. CS_RUNTIME_DIR allows a private integration build.
// --preset with --save-plan also updates style.presetId when a plan is produced.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { isDeepStrictEqual } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";
import { EXIT, LaneError } from "./cover_video.mjs";

const SK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const USAGE = "usage: node plan.mjs --spec FILE [--brand FILE] [--preset ID] [--replan] [--save-plan] [--format json|text]";
export function readPlanSource(file, what = "input") {
  let raw;
  try { raw = fs.readFileSync(file, "utf8"); }
  catch (e) { throw new LaneError(e.code === "ENOENT" ? "E_USAGE" : "E_INPUT", `${what} ${file}: ${e.message}`, e.code === "ENOENT" ? EXIT.NOINPUT : EXIT.DATA); }
  try { return { value: JSON.parse(raw.replace(/^\uFEFF/, "")), raw }; }
  catch (e) { throw new LaneError("E_SCHEMA", `${what} ${file}: invalid JSON (${e.message})`, EXIT.DATA); }
}
export function readPlanJson(file, what = "input") { return readPlanSource(file, what).value; }

export function loadPlanner({ runtimeDir = process.env.CS_RUNTIME_DIR || path.join(SK, "runtime") } = {}) {
  const sandbox = { TextEncoder, TextDecoder, console: { log() {}, warn() {}, error() {} } };
  sandbox.window = sandbox;
  vm.createContext(sandbox, { codeGeneration: { strings: false, wasm: false } });
  for (const chunk of ["core", "art", "visual"]) {
    const file = path.join(runtimeDir, `cs-${chunk}.js`);
    if (!fs.existsSync(file)) throw new LaneError("E_NO_CAPABILITY", `missing runtime chunk cs-${chunk}.js`, EXIT.INTERNAL);
    vm.runInContext(fs.readFileSync(file, "utf8"), sandbox, { filename: file, timeout: 10000 });
  }
  const C = sandbox.CS, V = C.visual;
  if (!V?.plan || !V.caps) throw new LaneError("E_NO_CAPABILITY", "planner/caps unavailable; rebuild core, art and visual together", EXIT.INTERNAL);
  const data = (file) => readPlanJson(path.join(SK, "data", file));
  // Match build_studio.py load_rules: geometry and padEnd depend on the registered platform.
  C.core.registry.registerRules({
    qaRules: data("qa-rules.json"), copy: data("rules/copy.json"), ortho: data("rules/ortho.json"),
    dialects: Object.fromEntries(["eg", "gulf", "levant", "msa-white", "en"].map((id) => [id, data(`dialects/${id}.json`)])),
    platform: data("platform-instagram.json"), locale: data("locale-defaults.json"),
    postingGuide: fs.existsSync(path.join(SK, "data/posting-guide.json")) ? data("posting-guide.json") : null
  });
  const blocks = {};
  for (const [id, file] of Object.entries({
    "cs-icon-pack": "icons/pack.json", "cs-icon-index": "icons/index.json", "cs-icon-concepts": "icons/concepts.json",
    "cs-icon-stem": "icons/stem.json", "cs-icon-objects": "icons/objects.json", "cs-emoji-map": "icons/emoji-map.json",
    "cs-free-design": "free-design.json", "cs-art-marks": "art/marks.json", "cs-art-direction": "art-direction.json"
  })) blocks[id] = readPlanJson(path.join(SK, "data", file), id);
  const scenes = path.join(SK, "data/art/scenes.json");
  if (fs.existsSync(scenes)) blocks["cs-art-scenes"] = readPlanJson(scenes);
  V._.blocks = blocks;
  return { CS: C, caps: JSON.parse(JSON.stringify(V.caps())) };
}

export function planSpec(spec, brand = null, { preset: presetId, runtime, replan = false } = {}) {
  const { CS, caps } = runtime || loadPlanner();
  const schema = readPlanJson(path.join(SK, "schemas/spec.schema.json"));
  const validate = (s) => {
    const result = CS.core.schema.validateAgainst(schema, s);
    if (!result.ok) throw new LaneError("E_SCHEMA", `spec: ${JSON.stringify(result.errors.slice(0, 3))}`, EXIT.DATA);
  };
  validate(spec);
  if (brand) {
    const result = CS.core.schema.validateAgainst(readPlanJson(path.join(SK, "schemas/brand.schema.json")), brand);
    if (!result.ok) throw new LaneError("E_SCHEMA", "brand does not match brand.schema.json", EXIT.DATA);
  }
  const out = JSON.parse(JSON.stringify(spec));
  // Explicitly discard saved plans for a fresh design; covers and locked slides remain authoritative.
  if (replan) {
    for (const s of out.slides) if (s.type !== "cover" && !s.free && !s.visual?.lock) delete s.visual;
    delete out.style.planV;
  }
  const id = String(presetId || out.style.presetId).split("@")[0];
  if (!/^[a-z][a-z0-9-]*$/.test(id)) throw new LaneError("E_USAGE", "invalid preset ID", EXIT.USAGE);
  const preset = readPlanJson(path.join(SK, "styles", id, "preset.json"), "preset");
  const planned = CS.visual.plan(out, brand, preset, null, { caps });
  if (planned.slides.length && presetId) out.style.presetId = `${preset.id}@${preset.version}`;
  const byId = new Map(planned.slides.map((s) => [s.id, s]));
  let added = false;
  for (const slide of out.slides) {
    const p = byId.get(slide.id);
    if (p && !slide.free && !slide.visual) {
      added = true;
      slide.visual = p.visual;
      if (p.variant && !slide.variant) slide.variant = p.variant;
      if (slide.items && p.visual.rowIcons) slide.items = slide.items.map((item, i) => ({ ...item, icon: item.icon || p.visual.rowIcons[i] }));
    }
  }
  if (planned.slides.length) for (const [key, value] of Object.entries(planned.style)) if (out.style[key] == null || (key === "planV" && added)) out.style[key] = value;
  validate(out);
  return { spec: out, plan: { slides: out.slides.filter((s) => s.visual).map((s) => ({ id: s.id, visual: s.visual, ...(s.variant ? { variant: s.variant } : {}) })),
    style: { planV: out.style.planV || "", ...(out.style.motif ? { motif: out.style.motif } : {}) }, notes: planned.notes, capsHash: caps.hash } };
}

// Same-directory rename is atomic. Refuse to overwrite an edit made since the caller read the spec.
export function savePlanSpec(file, spec, original) {
  const dir = path.dirname(path.resolve(file));
  let scratch;
  try {
    if (fs.readFileSync(file, "utf8") !== original) throw new LaneError("E_CONFLICT", "spec changed while planning", 75);
    // Formatting and JSON escapes are not content changes; preserve the original bytes on replay.
    if (isDeepStrictEqual(JSON.parse(original.replace(/^\uFEFF/, "")), spec)) return false;
    const bytes = JSON.stringify(spec, null, 2) + "\n";
    scratch = fs.mkdtempSync(path.join(dir, ".cs-plan-"));
    const tmp = path.join(scratch, "spec.json");
    fs.writeFileSync(tmp, bytes, { encoding: "utf8", mode: fs.statSync(file).mode });
    if (fs.readFileSync(file, "utf8") !== original) throw new LaneError("E_CONFLICT", "spec changed while planning", 75);
    fs.renameSync(tmp, file);
    return true;
  } catch (e) {
    if (e instanceof LaneError) throw e;
    throw new LaneError("E_WRITE", `cannot save spec: ${e.code}`, EXIT.NOWRITE);
  } finally { if (scratch) fs.rmSync(scratch, { recursive: true, force: true }); }
}

async function main(argv) {
  const o = { format: "json" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (["--help", "-h"].includes(a)) { process.stdout.write(USAGE + "\n"); return; }
    if (a === "--save-plan") { o.save = true; continue; }
    if (a === "--replan") { o.replan = true; continue; }
    if (!["--spec", "--brand", "--preset", "--format"].includes(a) || !argv[i + 1] || argv[i + 1].startsWith("--")) throw new LaneError("E_USAGE", USAGE, EXIT.USAGE);
    o[a.slice(2)] = argv[++i];
  }
  if (!o.spec || !["json", "text"].includes(o.format)) throw new LaneError("E_USAGE", USAGE, EXIT.USAGE);
  if (Number(process.versions.node.split(".")[0]) < 22) throw new LaneError("E_NO_CAPABILITY", "Node.js 22 or newer is required", EXIT.INTERNAL);
  const input = readPlanSource(o.spec, "spec");
  const result = planSpec(input.value, o.brand ? readPlanJson(o.brand, "brand") : null, { preset: o.preset, replan: o.replan });
  const saved = o.save ? savePlanSpec(o.spec, result.spec, input.raw) : false;
  process.stdout.write(o.format === "json" ? JSON.stringify({ ...result.plan, saved }) + "\n" : [
    `caps ${result.plan.capsHash}`, `saved ${saved}`,
    ...result.plan.notes.map((n) => `note ${n.code}${n.slide ? ` (${n.slide})` : ""}`),
    ...result.plan.slides.map((s) => `${s.id}: ${s.visual.anchor?.kind || "none"} / ${s.visual.recipe} / ${s.visual.tone}`)
  ].join("\n") + "\n");
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2)).catch((e) => {
  process.stderr.write(`cs-error: ${e.code || "E_INTERNAL"}: ${e.message}\n`); process.exitCode = e.exit || EXIT.INTERNAL;
});
