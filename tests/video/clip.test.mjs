// These tests exercise composition with synthetic decoded native VideoFrames. No external library or footage is fetched.
import fs from "node:fs";
const source = fs.readFileSync("src/mp4/mp4.js", "utf8") + "\n" + fs.readFileSync("src/mp4/clip.js", "utf8");

async function fixture(page, options = {}) {
  return page.evaluate(({ source, options }) => {
    window.__clipClosed = 0;
    class Input {
      async getPrimaryVideoTrack() { return { getCodecParameterString: () => "vp09.00.10.08", canDecode: async () => !options.unsupported }; }
      async computeDuration() { return 20; }
      dispose() { window.__clipClosed++; }
    }
    class VideoSampleSink {
      async getSample(time) {
        const c = document.createElement("canvas"); c.width = 640; c.height = 360;
        const x = c.getContext("2d");
        x.fillStyle = options.contrast ? (time < 2 ? "#111111" : "#ffffff") : "#205070";
        x.fillRect(0, 0, 640, 360);
        if (!options.contrast) { x.fillStyle = "#e5a020"; x.fillRect(Math.min(550, time * 80), 30, 90, 300); }
        return { toVideoFrame: () => new VideoFrame(c, { timestamp: Math.round(time * 1e6) }), close() {} };
      }
    }
    const MB = { Input, BlobSource: class {}, ALL_FORMATS: [], VideoSampleSink };
    window.__clipApi = new Function("CS", "MB", source + "\nloadMediabunny = () => Promise.resolve(MB); return X.mp4.clip;")(CS, MB);
    const slide = document.createElement("div");
    slide.className = "cs-slide"; slide.setAttribute("dir", "ltr");
    slide.style.cssText = "position:relative;width:1080px;height:1440px;background:#faf8f2;overflow:hidden";
    slide.innerHTML = '<div data-slot="media" style="position:absolute;left:118px;top:550px;width:844px;height:435px;border-radius:32px;overflow:hidden"></div>' +
      '<h1 data-slot="headline" data-kind="text" style="position:absolute;left:120px;top:' + (options.contrast ? 620 : 150) + 'px;font:700 100px Arial;color:' + (options.contrast ? '#ffffff' : '#101820') + ';margin:0"><span class="w">Fresh product</span></h1>';
    document.body.appendChild(slide); window.__clipSlide = slide;
    window.__clipSpec = { cover: { motion: { recipe: "calm", seconds: 12, clip: { file: "assets/fresh-demo.mp4", in: 0, out: 6, fit: "cover", focus: { x: 0.5, y: 0.5 }, ending: "auto" } } } };
    __clipApi.attachFile("assets/fresh-demo.mp4", new Blob(["synthetic decoded source"]));
  }, { source, options });
}

export default { module: "clip", tests: [
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
  { name: "unsupported decoder names the codec and gives a local conversion action", async run(t) {
    await fixture(t.page, { unsupported: true });
    const r = await t.page.evaluate(async () => {
      try { await __clipApi.prepare(__clipSpec, __clipSlide, {}); return null; }
      catch (e) { return { code: e.code, message: e.message, closed: __clipClosed }; }
    });
    t.eq(r.code, "E_NO_CAPABILITY"); t.ok(r.message.includes("vp09.00.10.08")); t.ok(r.message.includes("H.264 MP4")); t.eq(r.closed, 1);
  } }
] };
