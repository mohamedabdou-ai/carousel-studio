import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import * as render from "../../../../plugins/carousel-studio/skills/carousel-design/scripts/render.mjs";
import { buildStudioPage } from "../../../../plugins/carousel-studio/skills/carousel-design/scripts/cover_video.mjs";

const scripts = "plugins/carousel-studio/skills/carousel-design/scripts/";
const root = fs.mkdtempSync(path.join(os.tmpdir(), "cs-package-c-cli-"));
test.after(() => fs.rmSync(root, { recursive: true, force: true }));
const spec = JSON.parse(fs.readFileSync("tests/fixtures/spec.eg.8slides.json", "utf8"));
spec.style = { presetId: "creator@1.0" }; delete spec.frozen;
spec.cover = { motion: { recipe: "calm", seconds: 6, source: "internal", clip: { file: "missing.mp4", in: 0, out: 4, fit: "cover", focus: { x: .5, y: .5 }, ending: "auto" } } };
const specFile = path.join(root, "spec.json"); fs.writeFileSync(specFile, JSON.stringify(spec));

function run(script, args) {
  return spawnSync(process.execPath, [scripts + script + ".mjs", ...args], { encoding: "utf8", windowsHide: true, timeout: 60000, env: { ...process.env, PYTHONIOENCODING: "utf-8" } });
}

test("C4: clip failure advice asks for a repaired clip, while engine failure offers still-only export", () => {
  const studio = path.join(root, "failed-export.html");
  fs.writeFileSync(studio, `<!doctype html><script>
    window.__csReady = true;
    window.CS = { on() {}, export: { mp4: { clip: { attachFile() {} } } }, automation: {
      setSpec() {}, exportAll() { return { ok: false, files: [], report: { status: 'block', counts: { block: 1, fix: 0, note: 0 } },
        skipped: [{ path: '3x4/01-cover.mp4', reason: 'Clip out point exceeds its duration.' }] }; }
    } };
  </script>`);
  fs.writeFileSync(path.join(root, "missing.mp4"), "attached local source");
  const args = ["--spec", specFile, "--studio", studio, "--out", path.join(root, "failed"), "--variants", "3x4", "--formats", "qa"];
  try {
    const clip = run("render", args);
    assert.equal(clip.status, 2, clip.stderr);
    assert.match(clip.stderr, /E_VIDEO_MISSING:.*Fix the clip in\/out points, the file or its codec/);
    assert.doesNotMatch(clip.stderr, /Use --video none/);
    const engineSpec = path.join(root, "engine.json"), engine = structuredClone(spec); delete engine.cover.motion.clip;
    fs.writeFileSync(engineSpec, JSON.stringify(engine));
    const result = run("render", ["--spec", engineSpec, ...args.slice(2)]);
    assert.equal(result.status, 2, result.stderr); assert.match(result.stderr, /Use --video none/);
  } finally { fs.unlinkSync(path.join(root, "missing.mp4")); }
});

test("C8: browser clip errors retain schema/capability codes and omit the Playwright stack", () => {
  const studio = path.join(root, "error.html");
  fs.writeFileSync(path.join(root, "missing.mp4"), "attached local source");
  try {
    for (const code of ["E_SCHEMA", "E_NO_CAPABILITY"]) {
      fs.writeFileSync(studio, `<!doctype html><script>
        window.__csReady = true; window.CS = { on() {}, export: { mp4: { clip: { attachFile() {} } } }, automation: {
          setSpec() {}, cover() { const e = new Error('The clip failed with its original reason.'); e.name = 'CSError'; e.code = '${code}'; throw e; }
        } };
      </script>`);
      const result = run("cover_video", ["--spec", specFile, "--studio", studio, "--out", path.join(root, "failed.mp4")]);
      assert.equal(result.status, 65, result.stderr);
      assert.match(result.stderr, new RegExp(`cs-error: ${code}: The clip failed with its original reason`));
      assert.doesNotMatch(result.stderr, /page\.evaluate|\n\s+at /);
    }
  } finally { fs.unlinkSync(path.join(root, "missing.mp4")); }
});

test("C10/C15: styling previews need no clip bytes", () => {
  const studio = buildStudioPage({ specFile, outFile: path.join(root, "studio.html") });
  const covers = path.join(root, "covers.json");
  fs.writeFileSync(covers, '[{"headline":"فكرة جديدة لمشروعك"}]');
  for (const mode of [["--style-sheet"], ["--covers", covers]]) {
    const out = path.join(root, mode[0].slice(2));
    const result = run("render", ["--spec", specFile, "--studio", studio, "--out", out, "--presets", "creator", ...mode]);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    assert.equal(report.exported, false); assert.equal(report.ok, true);
    assert.ok(fs.statSync(path.join(out, report.files[0].path)).size > 1000);
  }
});

test("C14: BOM covers and brand JSON reach preview rendering", () => {
  const covers = path.join(root, "covers-bom.json"), brand = path.join(root, "brand-bom.json"), noClip = structuredClone(spec);
  delete noClip.cover.motion.clip;
  const file = path.join(root, "no-clip.json"); fs.writeFileSync(file, JSON.stringify(noClip));
  const studio = buildStudioPage({ specFile: file, outFile: path.join(root, "no-clip.html") });
  fs.writeFileSync(covers, '\uFEFF[{"headline":"فكرة جديدة لمشروعك"}]');
  fs.writeFileSync(brand, "\uFEFF" + fs.readFileSync("tests/fixtures/brand.eg.creator.json", "utf8"));
  const result = run("render", ["--spec", file, "--studio", studio, "--brand", brand, "--covers", covers, "--out", path.join(root, "bom"), "--presets", "creator"]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(JSON.parse(result.stdout).ok, true);
});

test("C16: oversized candidate-preset sheets fail before rendering with a split-file usage error", async () => {
  assert.equal(render.coverCandidates(Array.from({ length: 86 }, () => ({ headline: "A fresh hook" })), 3).length, 86);
  assert.throws(() => render.coverCandidates(Array.from({ length: 87 }, () => ({ headline: "A fresh hook" })), 3), e => e.code === "E_USAGE" && e.exit === 64);
  const candidates = Array.from({ length: 100 }, () => ({ headline: "A fresh hook" }));
  const preset = id => ({ id, version: "1.0", ships: "1.0" });
  const context = { CS: { core: { registry: { listPresets: () => [preset("a"), preset("b"), preset("c")] }, render: { deck() { throw new Error("must reject before rendering"); } } }, motion: { recommend: () => ({ recipe: "calm" }) } } };
  const page = { evaluate(fn, args) { return import("node:vm").then(({ default: vm }) => vm.runInNewContext(`(${fn})(${JSON.stringify(args)})`, context)); } };
  await assert.rejects(render.coverLab(page, spec, null, { presets: ["all"], candidates }), e => e.code === "E_USAGE" && /split.*covers/i.test(e.message));
});
