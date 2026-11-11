import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { frameRatio, planFit, validateManifest, refCap, jpegByteCap, makeAsset, attachPlate, plateFindings } from "../../../../plugins/carousel-studio/skills/carousel-design/scripts/plates-lib.mjs";
import { loadLib } from "./load-lib.mjs";
import { parseArgs, runPlates, fitOutputPath } from "../../../../plugins/carousel-studio/skills/carousel-design/scripts/plates.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const schema = JSON.parse(fs.readFileSync(path.join(root, "plugins/carousel-studio/skills/carousel-design/schemas/spec.schema.json"), "utf8"));
const record = () => ({ slideId: "s02", source: "original.png", promptId: "p2", tool: "image-tool", textCheck: { textChecked: true, at: "2026-11-11T08:00:00Z" } });
const manifest = () => ({ version: 1, plates: [record()] });

test("frame ratios reject empty or non-finite geometry", () => {
  assert.equal(frameRatio(817, 380), 2.15);
  for (const dims of [[0, 1], [1, 0], [-2, 3], [Infinity, 1], [1, NaN]]) assert.throws(() => frameRatio(...dims));
});

test("crop uses gravity and a normalized subject box without stretching", () => {
  const top = planFit({ width: 1200, height: 800, ratio: 3, mode: "crop", gravity: "top" });
  assert.deepEqual(top.crop, { x: 0, y: 0, w: 1200, h: 400 });
  assert.equal(planFit({ width: 1200, height: 800, ratio: 3, mode: "crop", gravity: "bottom" }).crop.y, 400);
  const focus = planFit({ width: 1200, height: 800, ratio: 3, mode: "crop", focus: { x: .2, y: .7, w: .4, h: .2 } });
  assert.equal(focus.crop.y, 400);
  assert.equal(focus.subjectLoss, 0);
  const portrait = planFit({ width: 1200, height: 800, ratio: 1, mode: "crop" });
  assert.deepEqual(portrait.crop, { x: 200, y: 0, w: 800, h: 800 });
});

test("automatic fit protects the subject band and forced pad preserves every pixel", () => {
  assert.equal(planFit({ width: 1000, height: 1000, ratio: 1.5 }).mode, "crop");
  const p = planFit({ width: 1000, height: 1000, ratio: 2.5, flip: true });
  assert.equal(p.mode, "pad");
  assert.deepEqual(p.canvas, { width: 2500, height: 1000 });
  assert.deepEqual(p.draw, { x: 750, y: 0, w: 1000, h: 1000 });
  assert.equal(p.flip, true);
  assert.equal(planFit({ width: 1000, height: 1000, ratio: 2, focus: { x: .1, y: .1, w: .8, h: .8 } }).mode, "pad");
  const tall = planFit({ width: 1200, height: 800, ratio: 1, mode: "pad" });
  assert.deepEqual(tall.canvas, { width: 1200, height: 1200 });
  assert.deepEqual(tall.draw, { x: 0, y: 200, w: 1200, h: 800 });
});

test("manifest validation rejects unsafe paths, duplicate slides and invented confirmations", () => {
  assert.deepEqual(validateManifest(manifest(), ["s02"]), []);
  for (const source of ["../original.png", "a/../../b.jpg", "C:\\photos\\a.png", "https://host/a.png", "/a.png", "a\\b.png"]) {
    const m = manifest(); m.plates[0].source = source;
    assert.ok(validateManifest(m, ["s02"]).some(x => x.includes("source")), source);
  }
  const duplicate = manifest(); duplicate.plates.push(record());
  assert.ok(validateManifest(duplicate, ["s02"]).some(x => x.includes("duplicate")));
  assert.ok(validateManifest(manifest(), ["s03"]).some(x => x.includes("unknown slide")));
  for (const change of [r => r.textCheck.textChecked = false, r => r.textCheck.at = "yesterday", r => r.textCheck.at = "2026-02-30T00:00:00Z", r => r.focus = { x: .9, y: 0, w: .2, h: 1 }, r => r.typo = true, r => r.flip = "false", r => r.mode = "stretch", r => r.tool = ""]) {
    const m = manifest(); change(m.plates[0]); assert.notEqual(validateManifest(m, ["s02"]).length, 0);
  }
});

test("cap comes from the schema and includes the data URI header and base64 padding", () => {
  assert.equal(refCap(schema), 90000);
  const other = structuredClone(schema); other.$defs.asset.properties.ref.maxLength = 103;
  assert.equal(refCap(other), 103);
  assert.equal(jpegByteCap(103), 60);
  assert.ok("data:image/jpeg;base64,".length + 4 * Math.ceil(jpegByteCap(103) / 3) <= 103);
  assert.throws(() => jpegByteCap(10));
  assert.throws(() => refCap({}));
});

test("embedded asset shape satisfies the real schema and records dimensions and provenance", () => {
  const image = { ref: "data:image/jpeg;base64,/9j/2Q==", width: 1000, height: 500, bytes: 4 };
  const asset = makeAsset(record(), image, refCap(schema));
  assert.equal(loadLib().core.schema.validateAgainst(schema.$defs.asset, asset, schema).ok, true);
  assert.deepEqual(asset, { id: "plate-s02", kind: "image", ref: image.ref, mime: "image/jpeg", width: 1000, height: 500, bytes: 4, aiGenerated: true, tool: "image-tool", promptId: "p2" });
  assert.throws(() => makeAsset(record(), { ...image, width: undefined }, refCap(schema)));
  assert.throws(() => makeAsset(record(), image, 24));
});

test("attachment preserves unrelated content, requires explicit free conversion and writes the A1 check", () => {
  const spec = { slides: [{ id: "s02", type: "step", body: "جرّب فكرة واحدة", free: { html: "<p>فكرة واحدة</p>" } }], assets: [], ext: { edits: { keep: true } } };
  const r = record(), a = makeAsset(r, { ref: "data:image/jpeg;base64,/9j/2Q==", width: 1000, height: 500, bytes: 4 }, 100);
  assert.throws(() => attachPlate(spec, r, a));
  r.layout = { type: "proof", variant: "screenshot" };
  const out = attachPlate(spec, r, a);
  assert.equal(spec.slides[0].type, "step");
  assert.equal(out.slides[0].type, "proof");
  assert.equal(out.slides[0].free, undefined);
  assert.equal(out.slides[0].body, "جرّب فكرة واحدة");
  assert.deepEqual(out.ext.edits, { keep: true });
  assert.deepEqual(out.ext.assetChecks["plate-s02"], r.textCheck);
  assert.deepEqual(out.slides[0].media, { slot: "screenshot", assetId: "plate-s02", promptId: "p2", ai: true, calmZone: "bottom" });
  assert.deepEqual(attachPlate(out, r, a), out);
});

test("check reports stale ratios, cap violations, absent checks and ignored media", () => {
  const r = record(), a = makeAsset(r, { ref: "data:image/jpeg;base64,/9j/2Q==", width: 1000, height: 500, bytes: 4 }, 100);
  const spec = attachPlate({ slides: [{ id: "s02", type: "proof" }], assets: [] }, r, a);
  const rows = [{ slideId: "s02", supported: true, ratio: 2 }];
  assert.deepEqual(plateFindings(spec, rows, 100), []);
  assert.ok(plateFindings(spec, [{ ...rows[0], ratio: 3 }], 100).some(x => x.code === "ratio"));
  assert.ok(plateFindings(spec, rows, 24).some(x => x.code === "cap"));
  delete spec.ext.assetChecks;
  assert.ok(plateFindings(spec, rows, 100).some(x => x.code === "text-check"));
  assert.ok(plateFindings(spec, [{ slideId: "s02", supported: false, reason: "free" }], 100).some(x => x.code === "ignored"));
});

test("bad arguments use the house usage exit code", () => {
  for (const argv of [[], ["stretch"], ["apply", "--flip"], ["fit"], ["slots", "--timeout", "NaN"], ["fit", "--slide", "s02", "--pad", "--crop"], ["slots", "--format", "yaml"]]) {
    assert.throws(() => parseArgs(argv), e => e.exit === 64);
  }
});

test("schema-invalid check reports cap errors without launching a browser", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cs-plates-unit-"));
  try {
    const s = JSON.parse(fs.readFileSync(path.join(root, "tests/fixtures/plates.json"), "utf8"));
    s.assets.push({ id: "too-large", kind: "image", ref: "data:image/jpeg;base64," + "A".repeat(90000), aiGenerated: true });
    s.slides[1].media = { slot: "screenshot", assetId: "too-large", ai: true };
    const file = path.join(dir, "spec.json"), bytes = JSON.stringify(s); fs.writeFileSync(file, bytes);
    const out = await runPlates(["check", "--dir", dir], { log() { assert.fail("browser should not start"); } });
    assert.equal(out.code, 2); assert.equal(out.result.framesMeasured, false);
    assert.ok(out.result.findings.some(f => f.code === "cap"));
    assert.equal(fs.readFileSync(file, "utf8"), bytes);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("invalid manifest roots fail as input errors before any write or browser launch", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cs-plates-unit-"));
  try {
    const bytes = fs.readFileSync(path.join(root, "tests/fixtures/plates.json"));
    fs.writeFileSync(path.join(dir, "spec.json"), bytes); fs.mkdirSync(path.join(dir, "plates"));
    for (const value of [null, [], { version: 1, plates: "wrong" }]) {
      fs.writeFileSync(path.join(dir, "plates/plates.json"), JSON.stringify(value));
      await assert.rejects(runPlates(["embed", "--dir", dir, "--slide", "s02"], { log() { assert.fail("browser should not start"); } }), e => e.exit === 2);
      assert.deepEqual(fs.readFileSync(path.join(dir, "spec.json")), bytes);
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("check tolerates malformed container shapes while returning schema diagnostics", () => {
  assert.deepEqual(plateFindings({ slides: [null], assets: {} }, null, 100), []);
  assert.deepEqual(plateFindings(null, null, 100), []);
});

test("replacing an asset used by another slide is refused", () => {
  const r = record(), asset = makeAsset(r, { ref: "data:image/jpeg;base64,/9j/2Q==", width: 1000, height: 500, bytes: 4 }, 100);
  const spec = { slides: [{ id: "s02", type: "proof" }, { id: "s03", type: "proof", media: { slot: "screenshot", assetId: asset.id } }], assets: [asset] };
  assert.throws(() => attachPlate(spec, r, asset), /another slide/);
});

test("fitted outputs cannot overwrite any manifest original or leave the output folder", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cs-plates-path-"));
  try {
    fs.mkdirSync(path.join(dir, "fitted"));
    const otherOriginal = path.join(dir, "fitted/other.png"); fs.writeFileSync(otherOriginal, "original pixels");
    const dest = path.join(dir, "fitted/s02.png");
    assert.equal(fitOutputPath(dir, dest, [otherOriginal]), dest);
    assert.throws(() => fitOutputPath(dir, otherOriginal, [otherOriginal]), /original/);
    assert.throws(() => fitOutputPath(dir, path.join(dir, "original.png"), []), /fitted/);
    assert.throws(() => fitOutputPath(dir, path.join(dir, "../outside.png"), []), /fitted/);
    assert.equal(fs.readFileSync(otherOriginal, "utf8"), "original pixels");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
