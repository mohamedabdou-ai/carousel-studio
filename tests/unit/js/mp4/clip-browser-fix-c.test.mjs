import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright-core";
import { openGeometryPage } from "../../../geometry/page.mjs";
import { fixture } from "../../../video/clip.test.mjs";
import { checkVideo } from "../../../../plugins/carousel-studio/skills/carousel-design/scripts/check_video.mjs";
import { serveDirectory } from "../../../../plugins/carousel-studio/skills/carousel-design/scripts/cover_video.mjs";

test("C12: real translucent text ink over footage fails the calm-zone floor", async () => {
  const h = await openGeometryPage();
  try {
    await h.page.addScriptTag({ content: fs.readFileSync("plugins/carousel-studio/skills/carousel-design/runtime/cs-paint.js", "utf8") });
    for (const mode of ["rgba", "ancestors", "faint"]) {
      await fixture(h.page, { contrast: true });
      const result = await h.page.evaluate(async mode => {
        const headline = __clipSlide.querySelector('[data-slot="headline"]');
        if (mode === "rgba") headline.style.color = "rgba(255,255,255,.25)";
        else if (mode === "faint") headline.style.color = "rgba(255,255,255,.1)";
        else { headline.style.opacity = ".5"; headline.querySelector(".w").style.opacity = ".5"; }
        try { const c = await __clipApi.prepare(__clipSpec, __clipSlide, {}); c.close(); return { passed: true }; }
        catch (e) { return { code: e.code, ...e.detail }; }
      }, mode);
      assert.equal(result.code, "E_NO_CAPABILITY", `${mode}: ${JSON.stringify(result)}`);
      assert.equal(result.reason, "clip-contrast"); assert.equal(result.frame, 0);
      assert.ok(result.ratio < result.need, JSON.stringify(result));
    }
  } finally { await h.close(); }
});

test("C11: a noisy synthetic clip returns to its decoded first frame at the existing loop floor", async () => {
  const bundle = process.env.CS_TEST_MEDIABUNNY;
  assert.ok(bundle && fs.existsSync(bundle), "Set CS_TEST_MEDIABUNNY to an existing offline mediabunny bundle");
  const browser = await chromium.launch({ executablePath: process.env.CS_CHROME, headless: true }), root = fs.mkdtempSync(path.join(os.tmpdir(), "cs-package-c-noise-"));
  fs.writeFileSync(path.join(root, "index.html"), "<!doctype html><title>Offline noisy clip</title>");
  const server = await serveDirectory(root);
  try {
    const page = await browser.newPage();
    await page.goto(server.url + "/index.html");
    await page.addScriptTag({ type: "module", content: fs.readFileSync(bundle, "utf8") + "\nwindow.__testMB = { Input, BlobSource, ALL_FORMATS, VideoSampleSink, Output, Mp4OutputFormat, BufferTarget, VideoSampleSource, VideoSample, EncodedVideoPacketSource, EncodedPacketSink };" });
    await page.waitForFunction(() => window.__testMB);
    const code = ["src/mp4/mp4.js", "src/mp4/clip.js"].map(p => fs.readFileSync(p, "utf8")).join("\n");
    const exportCode = ["src/export/core.js", "src/export/text.js", "src/export/files.js", "src/export/clip.js"].map(p => fs.readFileSync(p, "utf8")).join("\n");
    const result = await page.evaluate(async ({ code, exportCode }) => {
      window.CS = { export: {} };
      new Function("CS", code + "\nloadMediabunny = () => Promise.resolve(window.__testMB);")(CS);
      const c = document.createElement("canvas"); c.width = 1080; c.height = 1440;
      const ctx = c.getContext("2d", { alpha: false }), poster = ctx.createImageData(1080, 1440);
      let seed = 12345;
      for (let i = 0; i < poster.data.length; i += 4) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        const v = 32 + (seed >>> 25); poster.data[i] = poster.data[i + 1] = poster.data[i + 2] = v; poster.data[i + 3] = 255;
      }
      ctx.putImageData(poster, 0, 0);
      const prep = { canvas: c, frames: 180, duration: 6, finalHoldFrame: 168, ending: "wipe", endpointSsim: .5, mediaPoster: c,
        async drawFrame(i) {
          ctx.putImageData(poster, 0, 0);
          if (i >= 12 && i < 168) { ctx.fillStyle = "#f0f0f0"; ctx.fillRect((i * 11) % 900, 400, 180, 400); }
        }, close() {} };
      CS.export.mp4.clip.prepare = async () => prep;
      CS.paint = { encode: async (canvas, type) => new Uint8Array(await (await new Promise(ok => canvas.toBlob(ok, "image/" + type, .92))).arrayBuffer()) };
      const run = new Function("CS", exportCode + `
        clipDeck = async function () { return { slides: [{ el: {} }], tokens: {}, dispose() {} }; };
        lumaStats = function () { return { mean: 60, deviating: 1000 }; };
        headerFacts = function () { return {}; }; loopMetrics = function () { return {}; };
        return renderClipCover;
      `)(CS);
      const kit = await run({ cover: { motion: { seconds: 6, clip: {} } } }, {}, { variants: ["3x4", "4x5"] });
      return kit.files.concat(kit.stills).map(f => { let s = ""; for (const b of f.bytes) s += String.fromCharCode(b); return { path: f.path, base64: btoa(s) }; });
    }, { code, exportCode });
    for (const f of result) { fs.mkdirSync(path.dirname(path.join(root, f.path)), { recursive: true }); fs.writeFileSync(path.join(root, f.path), Buffer.from(f.base64, "base64")); }
    for (const variant of ["3x4", "4x5"]) {
      const r = checkVideo(path.join(root, variant, "01-cover.mp4"), { kind: "clip", seconds: 6, poster: path.join(root, variant, variant === "3x4" ? "01-cover.png" : "01-cover.jpg") });
      console.log(`# ${variant} noisy hold: SSIM ${r.loop.lastVsFrame0.ssim}, PSNR ${r.loop.lastVsFrame0.psnr} dB`);
      assert.ok(r.loop.lastVsFrame0.ssim >= .995 && r.loop.lastVsFrame0.psnr >= 45, JSON.stringify({ variant, loop: r.loop }));
      assert.equal(r.results.some(f => f.rule === "V1.loop"), false, JSON.stringify({ variant, loop: r.loop }));
      assert.equal(r.info.frames, 180); assert.equal(r.info.constantRate, true); assert.equal(r.info.moovBeforeMdat, true);
      assert.equal(r.info.keyframeAtZero, true); assert.equal(r.info.closedGop, true); assert.equal(r.info.audio, "none");
    }
  } finally { await browser.close(); await server.close(); fs.rmSync(root, { recursive: true, force: true }); }
});
