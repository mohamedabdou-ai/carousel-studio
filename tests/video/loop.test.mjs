// Gate V1 as the exporter can measure it before encoding: every recipe loops on the poster (frame 0 = last frame = the exported PNG),
// never shows an empty frame between 0.4 s and 5.6 s, never flashes. Runs the style driver over all 180 frames.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { checkVideo } from "../../plugins/carousel-studio/skills/carousel-design/scripts/check_video.mjs";
const CASES = [["mistakes", "story"], ["counter", "counter"], ["urgent", "drop-clock"], ["spread", "map-dots"], ["myth", "stamp"], ["steps", "reorder"], ["opinion", "highlight-sweep"], ["opinion", "calm"], ["heritage", "story"], ["heritage", "counter"], ["opinion", "curtain"], ["opinion", "zoom"], ["counter", "notify"], ["english", "split"]];
CASES.push(...["curtain", "zoom", "notify", "split"].map((id) => ["bare", id]));

export default {
  module: "video",
  tests: [...CASES.map(([fx, recipe]) => ({
    name: `${recipe} on ${fx}: frame 0 and the last frame equal the poster, no blank frame, at most 3 flashes a second`,
    async run(t) {
      const r = await t.page.evaluate(async ([fx, recipe]) => {
        const spec = JSON.parse(JSON.stringify(CS_FIXTURES[fx === "bare" ? "opinion" : fx]));
        if (fx === "bare") { spec.slides[0] = { id: "s01", n: 1, type: "cover", headline: spec.slides[0].headline.split(" ")[0] }; spec.locale.swipeCue = "neutral"; }
        const deck = await CS.core.render.deck(spec, null, { slideIds: ["s01"] });
        const el = deck.slides[0].el, poster = await CS.paint.toCanvas(el, { scale: 1 });
        const tl = CS.motion.build(el, { recipe }), ctrl = CS.motion.hf.install(el, tl, "cs-cover");
        await ctrl.ready;
        const small = document.createElement("canvas"); small.width = 108; small.height = 144;
        const sctx = small.getContext("2d", { willReadFrequently: true }); sctx.imageSmoothingQuality = "medium";
        const canvas = document.createElement("canvas"); canvas.width = 1080; canvas.height = 1440;
        const stats = [], frames = tl.frames;
        let first = null, last = null, previous = null, still = 0;
        for (let i = 0; i < frames; i++) {
          ctrl.seek(i / 30);
          await CS.paint.toCanvas(el, { scale: 1, canvas, settle: i === 0 });
          sctx.drawImage(canvas, 0, 0, 108, 144);
          const d = sctx.getImageData(0, 0, 108, 144).data, hist = new Uint32Array(256), grey = new Uint8Array(15552); let sum = 0, change = 0;
          for (let p = 0, k = 0; p < d.length; p += 4, k++) { const v = Math.round(0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2]); hist[v]++; sum += v; grey[k] = v; if (previous) change += Math.abs(v - previous[k]); }
          if (previous && change / 15552 < 0.03) still++; previous = grey;
          let acc = 0, median = 0; for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= 7776) { median = v; break; } }
          let dev = 0; for (let v = 0; v < 256; v++) if (Math.abs(v - median) > 6) dev += hist[v];
          stats.push({ mean: sum / 15552, dev });
          if (i === 0 || i === frames - 1) { const c = document.createElement("canvas"); c.width = 1080; c.height = 1440; c.getContext("2d").drawImage(canvas, 0, 0); if (i === 0) first = c; else last = c; }
        }
        let blank = [], maxFlash = 0, run = 0, longest = 0; const jumps = [];
        for (let i = 12; i <= 168; i++) if (stats[i].dev < 3) blank.push(i);
        for (let i = 12; i <= 168; i++) { if (stats[i].dev < stats[0].dev * 0.25) { run++; longest = Math.max(longest, run); } else run = 0; }
        for (let i = 1; i < frames; i++) if (Math.abs(stats[i].mean - stats[i - 1].mean) > 24) jumps.push(i);
        for (let i = 0; i < frames; i++) maxFlash = Math.max(maxFlash, jumps.filter((j) => j > i - 30 && j <= i).length);
        const m = CS.paint.metrics, out = { frame0: [m.ssim(first, poster), m.psnr(first, poster)], last: [m.ssim(last, poster), m.psnr(last, poster)], blank, maxFlash, frames,
          minDev: Math.min(...stats.slice(12, 169).map((s) => s.dev)), stillShare: still / (frames - 1), thinRunSeconds: longest / 30 };
        ctrl.destroy(); deck.dispose();
        return out;
      }, [fx, recipe]);
      t.eq(r.frames, 180); t.eq(r.frame0, [1, 100], "frame 0 equals the poster"); t.eq(r.last, [1, 100], "the last frame equals the poster: a seamless loop");
      t.eq(r.blank, [], "blank frames between 0.4 s and 5.6 s"); t.lte(r.maxFlash, 3, "flashes per second");
      if (["curtain", "zoom", "notify", "split"].includes(recipe)) { t.lte(r.stillShare, 0.6, "at least 40% moves, including bare covers with a neutral cue"); t.lte(r.thinRunSeconds, 0.6); }
    }
  })), ...["curtain", "zoom", "notify", "split"].map((recipe) => ({
    name: `${recipe}: decoded H.264 passes V1 including motion share and thin-frame duration`,
    async run(t) {
      for (const tool of ["ffprobe", "ffmpeg"]) { const p = spawnSync(tool, ["-version"], { windowsHide: true }); if (p.error || p.status) t.skip(tool + " unavailable: encoded V1 unverified"); }
      if (!(await t.page.evaluate(() => CS.export.mp4.support(1080, 1440, 30))).supported) t.skip("no H.264 encoder: encoded V1 unverified");
      const work = fs.mkdtempSync(path.join(os.tmpdir(), "cs-motion-encode-"));
      try {
        const encoded = await t.page.evaluate(async (recipe) => {
          const spec = JSON.parse(JSON.stringify(CS_FIXTURES[recipe === "notify" ? "counter" : "opinion"]));
          spec.cover.motion = { recipe, feel: "story", seconds: 6, fps: 30, source: "internal" };
          const deck = await CS.core.render.deck(spec, null, { slideIds: ["s01"] }), poster = await CS.paint.raster(deck.slides[0].el, { type: "png" }); deck.dispose();
          const file = await CS.export.cover(spec, { brand: null, assets: () => null });
          const b64 = (u) => { let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
          return { video: b64(file.bytes), poster: b64(poster.bytes) };
        }, recipe);
        const file = path.join(work, recipe + ".mp4"), poster = path.join(work, recipe + ".png");
        fs.writeFileSync(file, Buffer.from(encoded.video, "base64")); fs.writeFileSync(poster, Buffer.from(encoded.poster, "base64"));
        const r = checkVideo(file, { poster, expect: "1080x1440", seconds: 6, fps: 30 });
        console.log(`# encoded ${recipe}: ${JSON.stringify({ counts: r.counts, stillShare: r.stillShare, thinRunSeconds: r.thinRunSeconds, loop: r.loop })}`);
        t.eq(r.counts.block, 0, recipe + " V1 BLOCKs: " + JSON.stringify(r.results)); t.eq(r.counts.fix, 0, recipe + " V1 FIXes");
        t.eq(r.blankFrames, 0); t.lte(r.flashesPerSecondMax, 3); t.lte(r.stillShare, 0.6, "at least 40% of the encoded loop moves"); t.lte(r.thinRunSeconds, 0.6, "no near-empty stretch");
        t.gte(r.loop.lastVsFrame0.ssim, 0.995); t.gte(r.loop.lastVsFrame0.psnr, 45); t.gte(r.loop.frame0VsPoster.ssim, 0.99); t.gte(r.loop.frame0VsPoster.psnr, 32);
      } finally { fs.rmSync(work, { recursive: true, force: true }); }
    }
  }))]
};
