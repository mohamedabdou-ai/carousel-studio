import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { chromium } from "playwright-core";
import { checkVideo } from "../../../../plugins/carousel-studio/skills/carousel-design/scripts/check_video.mjs";
import { serveDirectory } from "../../../../plugins/carousel-studio/skills/carousel-design/scripts/cover_video.mjs";

const skill = "plugins/carousel-studio/skills/carousel-design", script = `${skill}/scripts/check_video.mjs`;
const root = process.env.CS_CLIP_TEST_OUT || fs.mkdtempSync(path.join(os.tmpdir(), "cs-package-c-checker-")), file = path.join(root, "clip.mp4");
fs.mkdirSync(root, { recursive: true });
const cmd = (name, args) => spawnSync(name, args, { encoding: "utf8", windowsHide: true });
test.after(() => { if (!process.env.CS_CLIP_TEST_OUT) fs.rmSync(root, { recursive: true, force: true }); });
test.before(async () => {
  fs.writeFileSync(path.join(root, "index.html"), "<!doctype html><title>Offline decoded posters</title>");
  const server = await serveDirectory(root), browser = await chromium.launch({ executablePath: process.env.CS_CHROME, headless: true });
  try {
    const page = await browser.newPage(); await page.goto(server.url + "/index.html");
    // A deterministic colour texture in a real cover-sized media window exercises JPEG chroma reconstruction.
    const source = await page.evaluate(() => {
      const c = document.createElement("canvas"); c.width = 1080; c.height = 1350;
      const x = c.getContext("2d"); x.fillStyle = "#f4f4f2"; x.fillRect(0, 0, 1080, 1350); x.fillStyle = "#151515"; x.fillRect(114, 180, 600, 65);
      const d = x.createImageData(852, 480);
      for (let y = 0; y < 480; y++) for (let a = 0; a < 852; a++) {
        const i = (y * 852 + a) * 4;
        d.data[i] = 128 + 50 * Math.sin(a / 1.5) + 30 * Math.sin(y / 7);
        d.data[i + 1] = 128 + 45 * Math.sin((a + y) / 11);
        d.data[i + 2] = 128 + 50 * Math.cos(a / 8) + 20 * Math.sin(y / 6); d.data[i + 3] = 255;
      }
      x.putImageData(d, 114, 350); return c.toDataURL("image/png").split(",")[1];
    });
    const png = path.join(root, "source.png"); fs.writeFileSync(png, Buffer.from(source, "base64"));
    const r = cmd("ffmpeg", ["-v", "error", "-y", "-loop", "1", "-framerate", "30", "-i", png, "-t", "6", "-vf", "scale=in_range=pc:out_range=tv:out_color_matrix=bt709,format=yuv420p", "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-g", "180", "-bf", "0", "-color_range", "tv", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-movflags", "+faststart", file]);
    assert.equal(r.status, 0, r.stderr);
    const posters = await page.evaluate(async url => {
      const video = document.createElement("video"); video.muted = true;
      await new Promise((ok, fail) => { video.onloadeddata = ok; video.onerror = () => fail(new Error("Cannot decode fixture")); video.src = url; });
      const c = document.createElement("canvas"); c.width = 1080; c.height = 1350;
      const x = c.getContext("2d"); x.drawImage(video, 0, 0);
      const png = c.toDataURL("image/png"), jpeg = c.toDataURL("image/jpeg", .92), pixels = x.getImageData(0, 0, 1080, 1350);
      // One-level noise in the flat background puts this PNG between the JPEG and PNG floors.
      for (let y = 0; y < 1350; y++) for (let a = 0; a < 1080; a++) {
        if (a >= 114 && a < 966 && y >= 350 && y < 830) continue;
        const i = (y * 1080 + a) * 4, delta = (a + y) % 2 ? 1 : -1;
        for (let k = 0; k < 3; k++) pixels.data[i + k] += delta;
      }
      x.putImageData(pixels, 0, 0);
      return [png, jpeg, c.toDataURL("image/png")];
    }, server.url + "/clip.mp4");
    for (const [i, name] of ["poster.png", "poster.jpg", "renamed-png.jpg"].entries()) fs.writeFileSync(path.join(root, name), Buffer.from(posters[i].split(",")[1], "base64"));
    fs.copyFileSync(path.join(root, "poster.jpg"), path.join(root, "poster.bin"));
  } finally { await browser.close(); await server.close(); }
});

test("C1: a PNG renamed to jpg retains the stricter PNG poster floor", () => {
  const r = checkVideo(file, { kind: "clip", seconds: 6, poster: path.join(root, "renamed-png.jpg") });
  assert.ok(r.loop.frame0VsPoster.ssim >= .98 && r.loop.frame0VsPoster.ssim < .99, JSON.stringify(r.loop));
  assert.equal(r.results.some(f => f.rule === "V1.loop"), true, "a filename cannot relax the PNG floor");
});

test("C1: the clip's own 4x5 JPEG and PNG posters pass without weakening the decoded loop", () => {
  const checks = [];
  for (const poster of ["poster.jpg", "poster.bin", "poster.png"]) {
    const r = checkVideo(file, { kind: "clip", seconds: 6, poster: path.join(root, poster) });
    assert.ok(r.loop.lastVsFrame0.ssim >= .995 && r.loop.lastVsFrame0.psnr >= 45, JSON.stringify(r.loop));
    checks.push({ poster, loop: r.loop, blocked: r.results.some(f => f.rule === "V1.loop") });
  }
  assert.ok(checks.every(r => !r.blocked), JSON.stringify(checks));
  const wrong = path.join(root, "wrong.jpg"), r = cmd("ffmpeg", ["-v", "error", "-y", "-i", path.join(root, "poster.jpg"), "-vf", "negate", "-frames:v", "1", wrong]);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(checkVideo(file, { kind: "clip", seconds: 6, poster: wrong }).results.some(f => f.rule === "V1.loop" && f.sev === "BLOCK"));
});

test("C9: missing and malformed spec files report input/data errors with their documented exits", () => {
  const bad = path.join(root, "bad.json"); fs.writeFileSync(bad, "{broken");
  for (const [spec, status, code] of [[path.join(root, "missing.json"), 66, "E_NOINPUT"], [bad, 65, "E_SCHEMA"]]) {
    const r = cmd(process.execPath, [script, file, "--spec", spec]);
    assert.equal(r.status, status, r.stderr); assert.match(r.stderr, new RegExp(`cs-error: ${code}:`));
    assert.doesNotMatch(r.stderr, /ENOENT|\n\s+at /);
  }
});

test("C5: the documented standalone clip command and usage require a kit poster", () => {
  const docs = fs.readFileSync(`${skill}/references/export-kit.md`, "utf8");
  assert.match(docs, /--kind clip --seconds N --poster FILE/);
  const help = cmd(process.execPath, [script, "--help"]);
  assert.match(help.stdout, /--kind clip --seconds N --poster FILE/);
  const missing = cmd(process.execPath, [script, file, "--kind", "clip", "--seconds", "6"]);
  assert.equal(missing.status, 65); assert.match(missing.stderr, /needs --poster/);
  const valid = cmd(process.execPath, [script, file, "--kind", "clip", "--seconds", "6", "--poster", path.join(root, "poster.jpg")]);
  assert.ok(valid.status === 0 || valid.status === 1, valid.stderr || valid.stdout);
});

test("C13: platform motion ranges distinguish engine loops and clip covers", () => {
  const m = JSON.parse(fs.readFileSync(`${skill}/data/platform-instagram.json`, "utf8")).plugin.motion;
  assert.equal(m.clipMinSeconds, 6); assert.equal(m.clipMaxSeconds, 15);
  assert.equal(m.minSeconds, 5); assert.equal(m.maxSeconds, 6);
  assert.match(m._note, /engine loops/i);
  const docs = fs.readFileSync(`${skill}/references/motion-recipes.md`, "utf8");
  assert.match(docs, /engine loops 5–6 s \(clip covers 6–15 s\)/);
});
