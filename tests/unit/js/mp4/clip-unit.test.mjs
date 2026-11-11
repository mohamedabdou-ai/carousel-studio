import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { loadLib, readJson } from "../lib/load-lib.mjs";

const code = fs.readFileSync("src/mp4/mp4.js", "utf8") + "\n" + (fs.existsSync("src/mp4/clip.js") ? fs.readFileSync("src/mp4/clip.js", "utf8") : "");
const sandbox = { CS: { export: {} }, Uint8Array, Uint32Array, Blob, console };
vm.createContext(sandbox);
vm.runInContext(code, sandbox);
const clip = () => sandbox.CS.export.mp4.clip;
const motion = (patch = {}) => ({ seconds: 12, recipe: "calm", clip: { file: "assets/demo.mp4", in: 1, out: 5, fit: "cover", focus: { x: 0.5, y: 0.5 }, ending: "auto" }, ...patch });

test("clip config rejects remote, absolute and escaping paths and invalid trims", () => {
  assert.equal(clip()?.validate(motion()).seconds, 12);
  for (const file of ["../a.mp4", "assets/../../a.mp4", "/a.mp4", "C:/a.mp4", "https://a/a.mp4", "a\\b.mp4", "a%2fb.mp4", "//server/a.mp4"]) {
    assert.throws(() => clip().validate(motion({ clip: { ...motion().clip, file } })), e => e.code === "E_SCHEMA", file);
  }
  for (const patch of [{ seconds: 5.9 }, { seconds: 15.1 }, { clip: { ...motion().clip, out: 0.5 } }, { clip: { ...motion().clip, focus: { x: 2, y: 0 } } }]) {
    assert.throws(() => clip().validate(motion(patch)), e => e.code === "E_SCHEMA");
  }
});

test("clip timing holds the poster at both ends and uses the entire chosen segment once", () => {
  const c = clip();
  assert.ok(c, "clip compositor API exists");
  const m = motion();
  assert.equal(c.at(m, 0).poster, true);
  assert.equal(c.at(m, 0.39).poster, true);
  assert.equal(c.at(m, 11.6).poster, true);
  assert.equal(c.at(m, 11.99).poster, true);
  assert.equal(c.at(m, 0.4).time, 1);
  assert.equal(c.at(m, 11.6 - 1 / 30).time, 5 - (4 / 11.2 / 30));
  assert.equal(c.at(m, 6).time, 3);
  assert.ok(c.at(m, 11.4).returning > 0.5);
});

test("fit respects focus for cover crops and contain letterboxing", () => {
  const c = clip();
  assert.ok(c, "clip compositor API exists");
  const r = JSON.parse(JSON.stringify(c.fitRect(1920, 1080, 800, 800, "cover", { x: 1, y: 0.5 })));
  assert.deepEqual(r, { sx: 840, sy: 0, sw: 1080, sh: 1080, dx: 0, dy: 0, dw: 800, dh: 800 });
  const p = c.fitRect(1920, 1080, 800, 800, "contain", { x: 0.5, y: 1 });
  assert.deepEqual([p.dx, p.dy, p.dw, p.dh], [0, 350, 800, 450]);
});

test("ending auto uses a wipe for one-way footage and a dissolve for similar endpoints", () => {
  const c = clip();
  assert.ok(c, "clip compositor API exists");
  assert.equal(c.ending("auto", 0.7), "wipe");
  assert.equal(c.ending("auto", 0.99), "dissolve");
  assert.equal(c.ending("wipe", 1), "wipe");
  assert.equal(c.ending("dissolve", 0.1), "wipe", "a one-way clip cannot force a ghosting dissolve");
});

test("cover schema admits 6..15 second clips but preserves the internal 5..6 second range", () => {
  const CS = loadLib();
  CS.core.schema.register("spec", readJson("plugins/carousel-studio/skills/carousel-design/schemas/spec.schema.json"));
  const spec = readJson("docs/examples/spec.example.json");
  spec.cover = { motion: motion() };
  assert.equal(CS.core.schema.validate("spec", spec).ok, true);
  for (const seconds of [5.9, 15.1]) {
    spec.cover.motion.seconds = seconds;
    assert.equal(CS.core.schema.validate("spec", spec).ok, false, String(seconds));
  }
  spec.cover.motion = { recipe: "calm", seconds: 12 };
  assert.equal(CS.core.schema.validate("spec", spec).ok, false);
  spec.cover.motion.seconds = 6;
  assert.equal(CS.core.schema.validate("spec", spec).ok, true);
});


function kitHarness() {
  const manifests = JSON.parse(fs.readFileSync("src/export/manifest.json", "utf8"));
  const ctx = { CS: { export: {}, core: {}, paint: { setPainter() {} } }, window: {}, TextEncoder, TextDecoder, Uint8Array, DataView, console };
  ctx.window.CS = ctx.CS;
  vm.createContext(ctx);
  vm.runInContext(manifests.files.map(f => fs.readFileSync("src/export/" + f, "utf8")).join("\n"), ctx);
  vm.runInContext(`
    var composedStyles = [];
    CS.core.render = { deck: async function () { return { slides: [{ id: "s01", index: 0, el: {} }], tokens: {}, dispose() {} }; } };
    CS.export.mp4 = { clip: { layoutSpec: function (s) { return s; } } };
    CS.paint.rasterMany = function () { throw new Error("The cover must use its decoded video still."); };
    renderCover = async function (s) {
      composedStyles.push(s.style.presetId);
      return { files: [makeFile("3x4/01-cover.mp4", new Uint8Array([42]))],
        stills: [makeFile("3x4/01-cover.png", new Uint8Array([43]))], info: [], posters: {}, composition: null };
    };
    textApi = Object.fromEntries(["caption", "hashtags", "slideCaptions", "alt"].map(function (k) { return [k, function () { return makeFile(k + ".txt", new Uint8Array()); }]; }));
    postingGuideFile = function () { return makeFile("posting-guide.md", new Uint8Array()); };
  `, ctx);
  return ctx;
}

test("kit exports recompose an attached clip after restyling and ignore engine-loop replacement files", async () => {
  const ctx = kitHarness();
  const s = { id: "fresh-kit", format: "carousel", style: { presetId: "creator@1.0" }, slides: [{ id: "s01", type: "cover" }], cover: { motion: motion() } };
  const options = { video: true, videoFiles: [{ path: "3x4/01-cover.mp4", bytes: new Uint8Array([99]) }], variants4x5: false, pdf: false, zip: false };
  for (const presetId of ["creator@1.0", "poster@1.0"]) {
    s.style.presetId = presetId;
    const r = await ctx.CS.export.kit(s, {}, options);
    assert.equal(r.files.find(f => f.path.endsWith(".mp4")).bytes[0], 42);
    assert.equal(r.files.find(f => f.path.endsWith(".png")).bytes[0], 43);
  }
  assert.deepEqual(Array.from(ctx.composedStyles), ["creator@1.0", "poster@1.0"]);
});


test("a failed clip still export retains no engine poster and writes its QA reports", async () => {
  const ctx = kitHarness();
  ctx.renderCover = async () => { throw Object.assign(new Error("offline MP4 writer"), { code: "E_DEP_LOAD" }); };
  ctx.renderClipCover = ctx.renderCover;
  ctx.CS.qa = { run: async input => {
    assert.ok(input.expected.includes("3x4/01-cover.png"));
    assert.equal(input.files.some(f => f.path === "3x4/01-cover.png"), false);
    return { status: "block", counts: { block: 1, fix: 0, note: 0 }, results: [] };
  } };
  ctx.textApi.qaMarkdown = () => ({ path: "qa-report.md", bytes: new Uint8Array() });
  const spec = { id: "fresh-failure", format: "carousel", style: { presetId: "creator@1.0" }, slides: [{ id: "s01", type: "cover" }], cover: { motion: motion() } };
  for (const video of [false, true]) {
    const kit = await ctx.CS.export.kit(spec, {}, { video, pdf: true, variants4x5: false, zip: false });
    assert.equal(kit.report.status, "block");
    assert.ok(kit.files.some(f => f.path === "qa-report.md"));
    assert.ok(kit.files.some(f => f.path === "qa-report.json"));
    assert.equal(kit.files.some(f => /01-cover[.]/.test(f.path) || f.path === "carousel.pdf"), false);
    assert.ok(kit.skipped.some(f => f.path === "clip-cover"));
  }
});
