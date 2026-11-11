// These tests exercise composition with synthetic decoded native VideoFrames. No external library or footage is fetched.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { checkVideo } from "../../plugins/carousel-studio/skills/carousel-design/scripts/check_video.mjs";
import { openGeometryPage } from "../geometry/page.mjs";
import * as lane from "../../plugins/carousel-studio/skills/carousel-design/scripts/cover_video.mjs";
const source = fs.readFileSync("src/mp4/mp4.js", "utf8") + "\n" + fs.readFileSync("src/mp4/clip.js", "utf8");

export async function fixture(page, options = {}) {
  return page.evaluate(({ source, options }) => {
    window.__clipClosed = 0;
    class Input {
      async getPrimaryVideoTrack() { return { getCodecParameterString: () => "vp09.00.10.08", canDecode: async () => !options.unsupported, getFirstTimestamp: async () => 0 }; }
      async computeDuration() { return 20; }
      dispose() { window.__clipClosed++; }
    }
    class VideoSampleSink {
      async getSample(time) {
        const c = document.createElement("canvas"); c.width = 640; c.height = 360;
        const x = c.getContext("2d");
        x.fillStyle = options.contrast ? (time < 2 ? "#111111" : "#ffffff") : options.below ? "#101820" : "#205070";
        x.fillRect(0, 0, 640, 360);
        if (!options.contrast && !options.below) { x.fillStyle = "#e5a020"; x.fillRect(Math.min(550, time * 80), 30, 90, 300); }
        return { toVideoFrame: () => new VideoFrame(c, { timestamp: Math.round(time * 1e6) }), close() {} };
      }
    }
    const MB = { Input, BlobSource: class {}, ALL_FORMATS: [], VideoSampleSink };
    window.__clipApi = new Function("CS", "MB", source + "\nloadMediabunny = () => Promise.resolve(MB); return X.mp4.clip;")(CS, MB);
    const slide = document.createElement("div");
    slide.className = "cs-slide"; slide.setAttribute("dir", "ltr");
    slide.style.cssText = "position:relative;width:1080px;height:1440px;background:#faf8f2;overflow:hidden";
    slide.innerHTML = '<div data-slot="media" style="position:absolute;left:118px;top:550px;width:844px;height:435px;border-radius:32px;overflow:hidden"></div>' +
      '<h1 data-slot="headline" data-kind="text" style="position:absolute;left:120px;top:' + (options.contrast ? 620 : 150) + 'px;font:700 100px Arial;color:' + (options.contrast ? '#ffffff' : '#101820') + ';margin:0"><span class="w">Fresh product</span></h1>' +
      (options.below ? '<p data-slot="sub" data-kind="text" style="position:absolute;left:120px;top:1000px;font:700 80px Arial;color:#101820;margin:0"><span class="w" style="display:inline-block;margin-top:-60px;padding-top:60px">Below it</span></p>' : "");
    document.body.appendChild(slide); window.__clipSlide = slide;
    window.__clipSpec = { cover: { motion: { recipe: "calm", seconds: 12, clip: { file: "assets/fresh-demo.mp4", in: 0, out: 6, fit: "cover", focus: { x: 0.5, y: 0.5 }, ending: "auto" } } } };
    __clipApi.attachFile("assets/fresh-demo.mp4", new Blob(["synthetic decoded source"]));
  }, { source, options });
}

export default { module: "clip", tests: [
  { name: "exported clip kit agrees with the standalone checker in both ratios", async run(t) {
    const bundle = process.env.CS_TEST_MEDIABUNNY;
    if (!bundle || !fs.existsSync(bundle)) return t.skip("Set CS_TEST_MEDIABUNNY to an existing mediabunny@1.61.0 ESM bundle for the offline encode");
    if (spawnSync("ffmpeg", ["-version"], { windowsHide: true }).status !== 0) return t.skip("ffmpeg is not installed");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cs-clip-kit-"));
    let h, server;
    try {
      fs.mkdirSync(path.join(dir, "assets"));
      const input = path.join(dir, "assets", "fresh-demo.mp4");
      const source = spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=s=640x360:r=30:d=4", "-an", "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", input], { encoding: "utf8", windowsHide: true });
      t.eq(source.status, 0, source.stderr);
      const spec = JSON.parse(fs.readFileSync("tests/fixtures/spec.eg.8slides.json", "utf8"));
      const brand = JSON.parse(fs.readFileSync("tests/fixtures/brand.eg.creator.json", "utf8"));
      brand.handle = "@fresh.workbench"; brand.name = "Fresh Workbench";
      spec.style = { presetId: "creator@1.0" }; delete spec.frozen;
      spec.slides[0] = { id: "s01", n: 1, type: "cover", headline: "شاهد ==منتجك==\nفي العمل" };
      spec.cover = { motion: { seconds: 12, recipe: "calm", source: "internal", clip: { file: "assets/fresh-demo.mp4", in: 0, out: 4, fit: "cover", focus: { x: .5, y: .5 }, ending: "auto" } } };
      const specFile = path.join(dir, "spec.json"); fs.writeFileSync(specFile, JSON.stringify(spec) + "\n");
      h = await openGeometryPage();
      // WebCodecs needs a secure origin; the geometry helper starts on about:blank.
      fs.writeFileSync(path.join(dir, "engine.html"), await h.page.content());
      server = await lane.serveDirectory(dir);
      await h.page.unroute("**/*");
      await h.page.route("**/*", route => new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort());
      await h.page.goto(server.url + "/engine.html");
      await h.page.evaluate(() => { CS.core.registry.loadPage(document); CS.qav.flush(); });
      await h.page.evaluate(() => { window.__CS_AUTOMATION = true; });
      await h.page.route("https://cdn.jsdelivr.net/npm/mediabunny@1.61.0/+esm", route => route.fulfill({ contentType: "text/javascript", body: fs.readFileSync(bundle), headers: { "access-control-allow-origin": "*" } }));
      for (const name of ["paint", "motion", "hf", "mp4", "export"]) await h.page.addScriptTag({ content: fs.readFileSync("plugins/carousel-studio/skills/carousel-design/runtime/cs-" + name + ".js", "utf8") });
      await h.page.evaluate(([s, b]) => CS.automation.setSpec(s, b), [spec, brand]);
      await lane.attachCoverClip(h.page, specFile, spec);
      const lines = []; await lane.attachExportProgress(h.page, line => lines.push(line));
      const started = performance.now();
      const result = await h.page.evaluate(() => CS.automation.exportAll({ video: true, variants4x5: true, pdf: false, zip: false }));
      const seconds = (performance.now() - started) / 1000;
      console.log(`# 12 s / 360 frames / 3x4 + 4x5 clip kit: ${seconds.toFixed(2)} s`);
      t.ok(lines.some(s => s.includes("100%")), "the real export reports composing progress: " + JSON.stringify(result.skipped));
      for (const variant of ["3x4", "4x5"]) {
        const video = `${variant}/01-cover.mp4`, still = `${variant}/01-cover.${variant === "3x4" ? "png" : "jpg"}`;
        for (const rel of [video, still]) {
          const item = result.files.find(f => f.path === rel); t.ok(item, rel + " is in the exported kit");
          const chunks = [];
          for (let offset = 0; offset < item.bytes; offset += 1024 * 1024) chunks.push(Buffer.from(await h.page.evaluate(([p, o]) => CS.automation.readChunk(p, o, 1024 * 1024), [rel, offset]), "base64"));
          fs.mkdirSync(path.join(dir, variant), { recursive: true }); fs.writeFileSync(path.join(dir, rel), Buffer.concat(chunks));
        }
        const cli = spawnSync(process.execPath, ["plugins/carousel-studio/skills/carousel-design/scripts/check_video.mjs", path.join(dir, video), "--poster", path.join(dir, still), "--kind", "clip", "--spec", specFile, "--format", "json"], { encoding: "utf8", windowsHide: true });
        t.ok(cli.status === 0 || cli.status === 1, cli.stderr || cli.stdout);
        const checked = JSON.parse(cli.stdout);
        t.ok(!checked.results.some(r => r.sev === "BLOCK"), JSON.stringify({ variant, results: checked.results, loop: checked.loop }));
        t.eq(checked.info.frames, 360); t.eq(checked.stillShare, null);
      }
    } finally { if (h) await h.close(); if (server) await server.close(); fs.rmSync(dir, { recursive: true, force: true }); }
  } },
  { name: "checker accepts a browser-decoded first-frame poster without lowering loop floors", async run(t) {
    if (spawnSync("ffmpeg", ["-version"], { windowsHide: true }).status !== 0) return t.skip("ffmpeg is not installed");
    const dir = process.env.CS_CLIP_TEST_OUT || fs.mkdtempSync(path.join(os.tmpdir(), "cs-clip-colour-"));
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, "clip.mp4"), poster = path.join(dir, "poster.png");
    let server;
    try {
      const r = spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "smptebars=s=1080x1440:r=30:d=6,drawgrid=w=8:h=8:t=1:c=0xffe634", "-an", "-c:v", "libx264", "-preset", "veryfast", "-profile:v", "high", "-level:v", "4.0", "-pix_fmt", "yuv420p", "-color_range", "tv", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-movflags", "+faststart", file], { encoding: "utf8", windowsHide: true });
      t.eq(r.status, 0, r.stderr);
      fs.writeFileSync(path.join(dir, "index.html"), "<!doctype html><title>Local clip fixture</title>");
      server = await lane.serveDirectory(dir);
      await t.page.goto(server.url + "/index.html");
      const b64 = await t.page.evaluate(async url => {
        const video = document.createElement("video"); video.muted = true; video.crossOrigin = "anonymous";
        await new Promise((ok, fail) => { video.onloadeddata = ok; video.onerror = () => fail(new Error("Cannot decode synthetic clip")); video.src = url; });
        const frame = new VideoFrame(video, { timestamp: 0 }), canvas = document.createElement("canvas");
        canvas.width = frame.displayWidth; canvas.height = frame.displayHeight;
        canvas.getContext("2d", { alpha: false }).drawImage(frame, 0, 0); frame.close();
        video.removeAttribute("src"); video.load();
        return canvas.toDataURL("image/png").split(",")[1];
      }, server.url + "/clip.mp4");
      fs.writeFileSync(poster, Buffer.from(b64, "base64"));
      const checked = checkVideo(file, { poster, kind: "clip", seconds: 6 });
      t.ok(!checked.results.some(r => r.rule === "V1.loop"), JSON.stringify(checked.loop));
      t.gte(checked.loop.lastVsFrame0.ssim, .995, "same-encode loop floor remains binding");
      t.gte(checked.loop.lastVsFrame0.psnr, 45);
      const wrong = path.join(dir, "wrong-poster.png");
      const changed = spawnSync("ffmpeg", ["-v", "error", "-y", "-i", poster, "-vf", "negate", "-frames:v", "1", wrong], { encoding: "utf8", windowsHide: true });
      t.eq(changed.status, 0, changed.stderr);
      const mismatch = checkVideo(file, { poster: wrong, kind: "clip", seconds: 6 });
      t.ok(mismatch.results.some(r => r.rule === "V1.loop" && r.sev === "BLOCK"), "a different poster still blocks");
    } finally { if (server) await server.close(); if (!process.env.CS_CLIP_TEST_OUT) fs.rmSync(dir, { recursive: true, force: true }); }
  } },
  { name: "CLI composing progress reaches the caller before completion", async run(t) {
    const lines = [];
    await lane.attachExportProgress(t.page, line => lines.push(line));
    await t.page.evaluate(async () => {
      for (const done of [1, 2, 36, 37, 360]) CS.emit("cs:export-progress", { job: "mp4", done, total: 360 });
      await window.__csLaneProgress({ job: "mp4", done: 360, total: 360 });
    });
    t.eq(lines.length, 3, "one line per new 10% step");
    t.ok(lines[0].includes("0%") && lines[1].includes("10%") && lines[2].includes("100%"), lines.join(" | "));
    t.ok(lines[0].includes("1/360"), "frame count makes a running encode visible");
  } },
  { name: "fractional media edges include every antialiased pixel", async run(t) {
    await fixture(t.page);
    const r = await t.page.evaluate(async () => {
      const media = __clipSlide.querySelector('[data-slot="media"]');
      Object.assign(media.style, { left: "118.8px", top: "550.8px", width: "844.4px", height: "435.4px" });
      const c = await __clipApi.prepare(__clipSpec, __clipSlide, {});
      const rect = c.rect; c.close(); return rect;
    });
    t.eq(r, { x: 118, y: 550, w: 846, h: 437 });
  } },
  { name: "configured calm-zone floor is shared with D4", async run(t) {
    await fixture(t.page, { contrast: true });
    const r = await t.page.evaluate(async () => {
      CS.qa = { rules: () => ({ gates: [{ id: "D4", checks: [{ id: "D4.contrast", params: { large: 20, body: 20, largeMinPx: 66, largeBoldMinPx: 52, decile: 0.1 } }] }] }) };
      try { const c = await __clipApi.prepare(__clipSpec, __clipSlide, {}); c.close(); return null; }
      catch (e) { return e.detail; }
    });
    t.ok(r, "the configured D4 floor is applied"); t.eq(r.need, 20); t.eq(r.frame, 0);
  } },
  { name: "native frame composition keeps the window, typography and poster holds", async run(t) {
    await fixture(t.page);
    const r = await t.page.evaluate(async () => {
      const c = await __clipApi.prepare(__clipSpec, __clipSlide, { roles: { bg: "#faf8f2" } });
      const first = c.poster;
      await c.drawFrame(120);
      const middle = CS.paint.metrics.ssim(first, c.canvas);
      const p = (x, y) => Array.from(c.canvas.getContext("2d").getImageData(x, y, 1, 1).data);
      const outside = p(100, 500), corner = p(119, 551);
      await c.drawFrame(359);
      const last = CS.paint.metrics.ssim(first, c.canvas);
      const ending = c.ending, rect = c.rect;
      c.close();
      return { middle, last, outside, corner, ending, rect, restored: !__clipSlide.querySelector('[data-slot="media"]').hasAttribute("style") ? false : __clipSlide.querySelector('[data-slot="media"]').style.background === "", closed: __clipClosed };
    });
    t.eq(r.last, 1); t.ok(r.middle < 0.999, "the footage moves");
    t.eq(r.outside, [250, 248, 242, 255]); t.eq(r.corner, r.outside, "rounded corner stays outside the footage");
    t.eq(r.rect, { x: 118, y: 550, w: 844, h: 435 });
    t.eq(r.ending, "wipe"); t.eq(r.closed, 1); t.ok(r.restored, "probe colours never remain in the live slide");
  } },
  { name: "a bright frame behind white text reports its exact frame and contrast", async run(t) {
    await fixture(t.page, { contrast: true });
    const r = await t.page.evaluate(async () => {
      const c = await __clipApi.prepare(__clipSpec, __clipSlide, { roles: { bg: "#faf8f2" } });
      try { await c.drawFrame(150); return null; }
      catch (e) { return { code: e.code, detail: e.detail }; }
      finally { c.close(); }
    });
    t.eq(r.code, "E_NO_CAPABILITY"); t.eq(r.detail.reason, "clip-contrast"); t.eq(r.detail.frame, 150); t.eq(r.detail.el, "headline"); t.ok(r.detail.ratio < r.detail.need);
  } },
  { name: "a text box that reaches into the window without ink over the footage does not fail the calm zone", async run(t) {
    await fixture(t.page, { below: true });
    const r = await t.page.evaluate(async () => {
      const box = __clipSlide.querySelector('[data-slot="sub"] .w').getBoundingClientRect(), origin = __clipSlide.getBoundingClientRect();
      const c = await __clipApi.prepare(__clipSpec, __clipSlide, { roles: { bg: "#faf8f2" } });
      try { await c.drawFrame(150); return { boxTop: box.top - origin.top, windowBottom: c.rect.y + c.rect.h, frames: c.frames }; }
      catch (e) { return { code: e.code, detail: e.detail }; }
      finally { c.close(); }
    });
    t.ok(r.boxTop < r.windowBottom, "the inline box overlaps the window");
    t.eq(r.code, undefined, "dark footage under an empty part of a dark text box is not a contrast failure");
  } },
  { name: "unsupported decoder names the codec and gives a local conversion action", async run(t) {
    await fixture(t.page, { unsupported: true });
    const r = await t.page.evaluate(async () => {
      try { await __clipApi.prepare(__clipSpec, __clipSlide, {}); return null; }
      catch (e) { return { code: e.code, message: e.message, closed: __clipClosed }; }
    });
    t.eq(r.code, "E_NO_CAPABILITY"); t.ok(r.message.includes("vp09.00.10.08")); t.ok(r.message.includes("H.264 MP4")); t.eq(r.closed, 1);
  } }
] };
