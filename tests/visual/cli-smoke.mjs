#!/usr/bin/env node
// V6c acceptance. All generated inputs, private chunks and images live below TEMP/cs-r3/V6c.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loadPlanner, planSpec, savePlanSpec } from "../../plugins/carousel-studio/skills/carousel-design/scripts/plan.mjs";
import { contactHTML, drawContact } from "../../plugins/carousel-studio/skills/carousel-design/scripts/render_contact.mjs";
import { launchChromium } from "../../plugins/carousel-studio/skills/carousel-design/scripts/cover_video.mjs";
import { preset } from "./expected/support.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.."), SK = path.join(ROOT, "plugins/carousel-studio/skills/carousel-design");
const WORK = path.join(os.tmpdir(), "cs-r3/V6c"), runtimeDir = path.join(WORK, "runtime");
fs.mkdirSync(WORK, { recursive: true });
execFileSync(process.execPath, [path.join(ROOT, "tools/build.mjs"), "--module", "core", "--module", "art", "--module", "visual", "--out", runtimeDir], { stdio: "pipe" });
const runtime = loadPlanner({ runtimeDir }), cap = runtime.caps;
assert.match(cap.hash, /^[0-9a-f]{16}$/);
assert.deepEqual(cap, loadPlanner({ runtimeDir }).caps);
assert.ok(cap.art.word?.includes("solid"), "the art chunk must register the fallback");
const { hash, ...capBody } = cap;
assert.equal(runtime.CS.core.canon.fnv1a64(runtime.CS.core.canon.canonicalJSON(capBody)), hash);
const capsGolden = path.join(ROOT, "tests/visual/expected/caps.json");
if (fs.existsSync(capsGolden)) {
  const expected = JSON.parse(fs.readFileSync(capsGolden, "utf8"));
  for (let i = 0; i < 2; i++) assert.deepEqual(loadPlanner({ runtimeDir }).caps, expected);
} else console.log("SKIP caps golden: tests/visual/expected/caps.json is not supplied by C1/lead yet");
const geometry = runtime.CS.core.registry.geometry(1440, { inner: true, presetId: "poster" });
assert.equal(geometry.body.h, 998); assert.equal(geometry.footer.y, 1275); assert.equal(geometry.zone.h, 950);
const rules = runtime.CS.core.registry.rules();
assert.deepEqual(Object.keys(rules.dialects).sort(), ["eg", "en", "gulf", "levant", "msa-white"]);
assert.ok(rules.qaRules && rules.copy && rules.ortho && rules.locale);

// An isolated skill copy uses the proposed art presets only while PR1/PR2 are not integrated.
const copy = fs.mkdtempSync(path.join(WORK, "skill-"));
fs.cpSync(path.join(SK, "scripts"), path.join(copy, "scripts"), { recursive: true });
fs.cpSync(path.join(SK, "data"), path.join(copy, "data"), { recursive: true });
fs.cpSync(path.join(SK, "schemas"), path.join(copy, "schemas"), { recursive: true });
for (const id of ["creator", "poster"]) {
  fs.mkdirSync(path.join(copy, "styles", id), { recursive: true });
  fs.writeFileSync(path.join(copy, "styles", id, "preset.json"), JSON.stringify(preset(id)));
}
for (const id of ["swiss", "notebook", "interface", "heritage"]) {
  fs.mkdirSync(path.join(copy, "styles", id), { recursive: true });
  fs.copyFileSync(path.join(SK, "styles", id, "preset.json"), path.join(copy, "styles", id, "preset.json"));
}
const env = { ...process.env, CS_RUNTIME_DIR: runtimeDir, TEMP: WORK, TMP: WORK, TMPDIR: WORK };
function run(script, args, code = 0) {
  const r = spawnSync(process.execPath, [path.join(copy, "scripts", script), ...args], { cwd: ROOT, env, encoding: "utf8", windowsHide: true, timeout: 120000 });
  assert.equal(r.status, code, `${script}: ${r.error || r.stderr}`);
  return r;
}
let fixtures = 0;
for (const [name, id, golden] of [["spec.eg.8slides.json", "creator", "eg.8slides@creator.json"], ["spec.gulf.9slides.json", "poster"], ["spec.levant.10slides.json", "poster", "levant.10slides@poster.json"]]) {
  const file = path.join(copy, name), input = JSON.parse(fs.readFileSync(path.join(ROOT, "tests/fixtures", name), "utf8"));
  input.style.presetId = `${id}@1.0`;
  fs.writeFileSync(file, JSON.stringify(input, null, 2) + "\n");
  const args = ["--spec", file, "--format", "json"];
  const before = fs.readFileSync(file, "utf8"), a = run("plan.mjs", args).stdout, b = run("plan.mjs", args).stdout;
  assert.equal(a, b); assert.equal(fs.readFileSync(file, "utf8"), before);
  const p = JSON.parse(a); assert.equal(p.capsHash, cap.hash); assert.ok(p.slides.length > 0);
  if (golden) {
    const expected = JSON.parse(fs.readFileSync(path.join(ROOT, "tests/visual/expected/plans", golden), "utf8"));
    const visuals = (plan) => plan.slides.map(({ id, visual }) => ({ id, visual }));
    for (const output of [a, b]) assert.deepEqual(visuals(JSON.parse(output)), visuals(expected), golden);
  }
  assert.ok(p.style.planV.endsWith(cap.hash.slice(0, 8)));
  const saved = JSON.parse(run("plan.mjs", [...args, "--save-plan"]).stdout);
  assert.equal(saved.saved, true);
  const once = fs.readFileSync(file, "utf8"), twice = JSON.parse(run("plan.mjs", [...args, "--save-plan"]).stdout);
  assert.equal(twice.saved, false); assert.equal(fs.readFileSync(file, "utf8"), once);
  const spec = JSON.parse(once), schema = JSON.parse(fs.readFileSync(path.join(SK, "schemas/spec.schema.json"), "utf8"));
  assert.equal(runtime.CS.core.schema.validateAgainst(schema, spec).errors.length, 0);
  // Compact JSON and escaped U+00A0 must survive a saved-plan replay byte for byte.
  const escaped = JSON.stringify(spec).replace(/\u00a0/g, "\\u00a0");
  assert.ok(escaped.includes("\\u00a0"));
  fs.writeFileSync(file, escaped);
  for (let i = 0; i < 2; i++) {
    assert.equal(JSON.parse(run("plan.mjs", [...args, "--save-plan"]).stdout).saved, false);
    assert.equal(fs.readFileSync(file, "utf8"), escaped);
  }
  const extended = structuredClone(spec);
  delete extended.slides.find((s) => s.visual).visual;
  extended.style.planV = "1.1.0+00000000+00000000";
  const extra = path.join(copy, `extended-${id}.json`);
  fs.writeFileSync(extra, JSON.stringify(extended, null, 2) + "\n");
  run("plan.mjs", ["--spec", extra, "--save-plan"]);
  const filled = fs.readFileSync(extra, "utf8");
  assert.ok(JSON.parse(filled).style.planV.endsWith(cap.hash.slice(0, 8)));
  run("plan.mjs", ["--spec", extra, "--save-plan"]);
  assert.equal(fs.readFileSync(extra, "utf8"), filled);
  const locked = spec.slides.find((s) => s.visual);
  locked.visual.lock = true;
  fs.writeFileSync(file, JSON.stringify(spec, null, 2) + "\n");
  run("plan.mjs", [...args, "--save-plan"]);
  assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf8")).slides.find((s) => s.id === locked.id).visual, locked.visual);
  fixtures++;
}
for (let i = 0; i < 2; i++) {
  const missing = path.join(copy, "missing.json"), absent = run("plan.mjs", ["--spec", missing], 66);
  assert.ok(absent.stderr.includes("E_USAGE") && absent.stderr.includes(missing) && absent.stderr.includes("ENOENT"));
  run("plan.mjs", ["--spec", "--save-plan"], 64);
  run("plan.mjs", ["--help"]);
  run("render.mjs", ["--help"]);
  run("render_contact.mjs", ["--help"]);
  const bad = path.join(copy, "bad.json"); fs.writeFileSync(bad, "{}");
  run("plan.mjs", ["--spec", bad, "--save-plan"], 65); assert.equal(fs.readFileSync(bad, "utf8"), "{}");
  fs.writeFileSync(bad, "{");
  const invalid = run("plan.mjs", ["--spec", bad], 65);
  let parseMessage; try { JSON.parse("{"); } catch (e) { parseMessage = e.message; }
  assert.ok(invalid.stderr.includes(bad) && invalid.stderr.includes(parseMessage));
  const renderMissing = run("render.mjs", ["--spec", missing, "--out", path.join(WORK, "missing-out")], 66);
  assert.ok(renderMissing.stderr.includes("E_USAGE") && renderMissing.stderr.includes(missing));
  const renderInvalid = run("render.mjs", ["--spec", bad, "--out", path.join(WORK, "missing-out")], 65);
  assert.ok(renderInvalid.stderr.includes(bad) && renderInvalid.stderr.includes(parseMessage));
  const conflict = path.join(copy, "conflict.json"); fs.writeFileSync(conflict, "new\n");
  assert.throws(() => savePlanSpec(conflict, {}, "old\n"), (e) => e.exit === 75);
  assert.equal(fs.readFileSync(conflict, "utf8"), "new\n");
}
for (const id of ["swiss", "notebook", "interface", "heritage"]) {
  const file = path.join(copy, `off-${id}.json`), input = JSON.parse(fs.readFileSync(path.join(ROOT, "tests/fixtures/spec.eg.8slides.json"), "utf8"));
  input.style.presetId = `${id}@1.0`;
  const original = JSON.stringify(input);
  fs.writeFileSync(file, original);
  for (let i = 0; i < 2; i++) {
    const result = JSON.parse(run("plan.mjs", ["--spec", file, "--save-plan"]).stdout);
    assert.equal(result.saved, false); assert.equal(result.style.planV, "");
    assert.ok(result.notes.some((n) => n.code === "plan.off"));
    const text = run("plan.mjs", ["--spec", file, "--save-plan", "--preset", id, "--format", "text"]).stdout;
    assert.match(text, /saved false/); assert.match(text, /note plan.off/);
    assert.equal(fs.readFileSync(file, "utf8"), original);
  }
}
console.log(`PASS CLI: ${fixtures} decks; two V2 goldens, geometry, semantic no-op, off presets, errors and conflicts (each repeated)`);

let browser;
try {
  browser = await launchChromium();
  const page = await browser.newPage();
  for (const chunk of ["core", "art", "visual"]) await page.addScriptTag({ content: fs.readFileSync(path.join(runtimeDir, `cs-${chunk}.js`), "utf8") });
  assert.deepEqual(await page.evaluate(() => CS.visual.caps()), cap);
  assert.deepEqual(await page.evaluate(() => CS.visual.caps()), cap);
  await page.evaluate(({ rules, blocks }) => { CS.core.registry.registerRules(rules); CS.visual._.blocks = blocks; }, { rules, blocks: runtime.CS.visual._.blocks });
  for (const [name, id] of [["spec.eg.8slides.json", "creator"], ["spec.gulf.9slides.json", "poster"]]) {
    const spec = JSON.parse(fs.readFileSync(path.join(ROOT, "tests/fixtures", name), "utf8")), p = preset(id);
    const planned = planSpec(spec, null, { preset: id, runtime }).plan;
    for (let i = 0; i < 2; i++) {
      const preview = await page.evaluate(({ spec, preset }) => CS.visual.autoPreview(spec, null, preset), { spec, preset: p });
      assert.deepEqual(preview.filter(Boolean), JSON.parse(JSON.stringify(planned.slides.map((s) => s.visual))));
    }
  }
  // A native screenshot is only the input fixture. This is a strip-layout test, not engine/painter acceptance.
  await page.setViewportSize({ width: 1080, height: 1440 });
  await page.setContent('<html dir="rtl" lang="ar"><body style="margin:0;background:#eee;color:#111;font:80px sans-serif"><div style="padding:110px">130</div><div style="height:600px;background:#123456"></div></body></html>');
  const png = await page.screenshot();
  const renders = [{ id: "s01", bytes: png }, { id: "s02", bytes: png }], plan = { slides: [{ id: "s02", visual: { anchor: { kind: "word" }, recipe: "full", tone: "field" } }] };
  assert.equal(contactHTML(renders, plan), contactHTML(renders, plan));
  for (let i = 0; i < 2; i++) assert.throws(() => contactHTML([{ id: "x", bytes: Buffer.from("bad") }], plan), /PNG/);
  const out = path.join(WORK, "contact-sheet.png"), out2 = path.join(WORK, "contact-sheet-again.png");
  await drawContact(renders, plan, out, { browser }); await drawContact(renders, plan, out2, { browser });
  assert.deepEqual(fs.readFileSync(out), fs.readFileSync(out2));
  assert.equal(fs.readFileSync(out).readUInt32BE(16), 284);
  await page.close();
  await browser.close();
  browser = null;
  // Exercise render CLI flags with a deterministic automation adapter. The full build_studio.py path belongs to the lead.
  const stub = path.join(copy, "studio.html"), specFile = path.join(copy, "render-input.json");
  const fresh = JSON.parse(fs.readFileSync(path.join(copy, "spec.eg.8slides.json"), "utf8"));
  for (const s of fresh.slides) delete s.visual;
  delete fresh.style.planV;
  fs.writeFileSync(specFile, JSON.stringify(fresh, null, 2) + "\n");
  const base64 = png.toString("base64");
  fs.writeFileSync(stub, `<!doctype html><html lang="ar" dir="rtl"><body><script>window.__csReady=true;let spec;window.CS={automation:{setSpec:async(s)=>{spec=s},exportAll:async()=>({ok:true,files:spec.slides.map((s,i)=>({path:'3x4/'+String(i+1).padStart(2,'0')+'.png',bytes:${png.length}})),report:{status:'pass',exitCode:0,counts:{block:0,fix:0,note:0}}}),readChunk:async(p,o,n)=>{const b=atob('${base64}');return btoa(b.slice(o,o+n))}}};</script></body></html>`);
  const renderOut = path.join(WORK, "export");
  // Without --save-plan the metadata must still describe the browser's automatic preview.
  const beforeRender = fs.readFileSync(specFile, "utf8"), previewPlan = planSpec(fresh, null, { runtime }).plan;
  const expectedStrip = path.join(WORK, "preview-expected.png");
  await drawContact(fresh.slides.map((s) => ({ id: s.id, bytes: png })), previewPlan, expectedStrip);
  for (let i = 0; i < 2; i++) {
    run("render.mjs", ["--spec", specFile, "--studio", stub, "--out", renderOut, "--contact-sheet", "--video", "none", "--formats", "png", "--variants", "3x4"]);
    assert.equal(fs.readFileSync(specFile, "utf8"), beforeRender);
    assert.deepEqual(fs.readFileSync(path.join(renderOut, "contact-sheet.png")), fs.readFileSync(expectedStrip));
  }
  let first;
  for (let i = 0; i < 2; i++) {
    const r = run("render.mjs", ["--spec", specFile, "--studio", stub, "--out", renderOut, "--save-plan", "--contact-sheet", "--video", "none", "--formats", "png", "--variants", "3x4"]);
    assert.equal(JSON.parse(r.stdout).files.filter((f) => f.path === "contact-sheet.png").length, 1);
    const image = fs.readFileSync(path.join(renderOut, "contact-sheet.png"));
    fs.writeFileSync(path.join(WORK, `render-strip-${i}.png`), image);
    if (first) assert.ok(image.equals(first), "render strip PNG bytes changed on repeat"); else first = image;
    assert.equal((r.stderr.match(/اتضافت صور تلقائي/g) || []).length, i === 0 ? 1 : 0);
  }
  console.log(`PASS browser: vm/browser caps equal; 130 px strip and render flags deterministic; PNG ${out}`);
} finally { if (browser) await browser.close(); }
console.log(`PASS V6c; scratch ${WORK}`);
