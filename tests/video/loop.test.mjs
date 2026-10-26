// Gate V1 as the exporter can measure it before encoding: every recipe loops on the poster (frame 0 = last frame = the exported PNG),
// never shows an empty frame between 0.4 s and 5.6 s, never flashes. Runs the style driver over all 180 frames.
const CASES = [["mistakes", "story"], ["counter", "counter"], ["urgent", "drop-clock"], ["spread", "map-dots"], ["myth", "stamp"], ["steps", "reorder"], ["opinion", "highlight-sweep"], ["opinion", "calm"], ["heritage", "story"], ["heritage", "counter"]];

export default {
  module: "video",
  tests: CASES.map(([fx, recipe]) => ({
    name: `${recipe} on ${fx}: frame 0 and the last frame equal the poster, no blank frame, at most 3 flashes a second`,
    async run(t) {
      const r = await t.page.evaluate(async ([fx, recipe]) => {
        const deck = await CS.core.render.deck(CS_FIXTURES[fx], null, { slideIds: ["s01"] });
        const el = deck.slides[0].el, poster = await CS.paint.toCanvas(el, { scale: 1 });
        const tl = CS.motion.build(el, { recipe }), ctrl = CS.motion.hf.install(el, tl, "cs-cover");
        await ctrl.ready;
        const small = document.createElement("canvas"); small.width = 108; small.height = 144;
        const sctx = small.getContext("2d", { willReadFrequently: true }); sctx.imageSmoothingQuality = "medium";
        const canvas = document.createElement("canvas"); canvas.width = 1080; canvas.height = 1440;
        const stats = [], frames = tl.frames;
        let first = null, last = null;
        for (let i = 0; i < frames; i++) {
          ctrl.seek(i / 30);
          await CS.paint.toCanvas(el, { scale: 1, canvas, settle: i === 0 });
          sctx.drawImage(canvas, 0, 0, 108, 144);
          const d = sctx.getImageData(0, 0, 108, 144).data, hist = new Uint32Array(256); let sum = 0;
          for (let p = 0; p < d.length; p += 4) { const v = Math.round(0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2]); hist[v]++; sum += v; }
          let acc = 0, median = 0; for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= 7776) { median = v; break; } }
          let dev = 0; for (let v = 0; v < 256; v++) if (Math.abs(v - median) > 6) dev += hist[v];
          stats.push({ mean: sum / 15552, dev });
          if (i === 0 || i === frames - 1) { const c = document.createElement("canvas"); c.width = 1080; c.height = 1440; c.getContext("2d").drawImage(canvas, 0, 0); if (i === 0) first = c; else last = c; }
        }
        let blank = [], maxFlash = 0; const jumps = [];
        for (let i = 12; i <= 168; i++) if (stats[i].dev < 3) blank.push(i);
        for (let i = 1; i < frames; i++) if (Math.abs(stats[i].mean - stats[i - 1].mean) > 24) jumps.push(i);
        for (let i = 0; i < frames; i++) maxFlash = Math.max(maxFlash, jumps.filter((j) => j > i - 30 && j <= i).length);
        const m = CS.paint.metrics, out = { frame0: [m.ssim(first, poster), m.psnr(first, poster)], last: [m.ssim(last, poster), m.psnr(last, poster)], blank, maxFlash, frames,
          minDev: Math.min(...stats.slice(12, 169).map((s) => s.dev)) };
        ctrl.destroy(); deck.dispose();
        return out;
      }, [fx, recipe]);
      t.eq(r.frames, 180); t.eq(r.frame0, [1, 100], "frame 0 equals the poster"); t.eq(r.last, [1, 100], "the last frame equals the poster: a seamless loop");
      t.eq(r.blank, [], "blank frames between 0.4 s and 5.6 s"); t.lte(r.maxFlash, 3, "flashes per second");
    }
  }))
};
