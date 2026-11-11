import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { resolveCoverClip } from "../../../../plugins/carousel-studio/skills/carousel-design/scripts/cover_video.mjs";
import { checkVideo } from "../../../../plugins/carousel-studio/skills/carousel-design/scripts/check_video.mjs";

test("CLI accepts only an existing post-local cover file", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cs-clip-local-"));
  try {
    const specFile = path.join(root, "spec.json"), file = "assets/own.mp4";
    fs.mkdirSync(path.join(root, "assets")); fs.writeFileSync(path.join(root, file), "synthetic");
    const spec = { cover: { motion: { clip: { file } } } };
    assert.equal(resolveCoverClip(specFile, spec).file, fs.realpathSync(path.join(root, file)));
    for (const bad of ["../own.mp4", "https://example.test/a.mp4", "C:/a.mp4", "a%2fb", "a\\b.mp4", "./a.mp4"]) {
      assert.throws(() => resolveCoverClip(specFile, { cover: { motion: { clip: { file: bad } } } }), e => e.code === "E_SCHEMA");
    }
    assert.throws(() => resolveCoverClip(specFile, { cover: { motion: { clip: { file: "gone.mp4" } } } }), e => e.exit === 66);
    assert.equal(resolveCoverClip(specFile, {}), null);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});


test("checker rejects an unknown cover kind before requiring a file or codec tools", () => {
  const result = spawnSync(process.execPath, ["plugins/carousel-studio/skills/carousel-design/scripts/check_video.mjs", "missing.mp4", "--kind", "other"], { encoding: "utf8", windowsHide: true });
  assert.equal(result.status, 64);
  assert.match(result.stderr, /kind/);
});

test("dark moving clips do not inherit the engine loop's whole-frame still-hold advice", t => {
  if (spawnSync("ffmpeg", ["-version"], { windowsHide: true }).status !== 0) return t.skip("ffmpeg is not installed");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cs-clip-dark-"));
  try {
    const file = path.join(root, "dark.mp4"), poster = path.join(root, "poster.png");
    const graph = "color=c=0x13171c:s=1080x1440:r=30:d=6[bg];testsrc2=s=852x480:r=30:d=6,lutyuv=y=val*0.015[demo];[bg][demo]overlay=114:350,drawbox=x=114:y=180:w=600:h=65:color=white:t=fill[v]";
    let r = spawnSync("ffmpeg", ["-v", "error", "-y", "-filter_complex", graph, "-map", "[v]", "-an", "-c:v", "libx264", "-preset", "veryfast", "-profile:v", "high", "-level:v", "4.0", "-pix_fmt", "yuv420p", "-color_range", "tv", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-movflags", "+faststart", file], { encoding: "utf8", windowsHide: true });
    assert.equal(r.status, 0, r.stderr);
    r = spawnSync("ffmpeg", ["-v", "error", "-y", "-i", file, "-frames:v", "1", "-vf", "scale=in_range=tv:out_range=pc:in_color_matrix=bt709:out_color_matrix=bt709,format=rgb24", poster], { encoding: "utf8", windowsHide: true });
    assert.equal(r.status, 0, r.stderr);
    const engine = checkVideo(file, { poster, seconds: 6 });
    assert.ok(engine.results.some(r => r.rule === "V1.still-hold"), "whole-frame downsampling mistakes this dark playback for a hold");
    const clip = checkVideo(file, { poster, kind: "clip", seconds: 6 });
    assert.equal(clip.results.some(r => r.rule === "V1.still-hold"), false);
    assert.equal(clip.stillShare, null, "an unmeasured media-window hold is not reported as a full-frame statistic");
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
