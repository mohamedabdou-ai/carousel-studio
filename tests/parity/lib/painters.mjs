// tests/parity/lib/painters.mjs · paint one element with both painters and hand back the two pictures (round 3, package F1).
//
//   import { paintBoth, paintBothScored } from "./painters.mjs";
//   const { svgPng, replayPng } = await paintBoth(page, ".cs-slide");            // PNG Buffers, 1080 x 1440 at scale 1
//   const { svgPng, replayPng, ssim } = await paintBothScored(page, "[data-n='3']", { scale: 0.5 });
//
// `page` is a Playwright page that already holds cs-paint (the Studio page, the video harness or any page with CS.paint). The selector
// names one element (the first match). `opts.scale` is the paint scale (default 1); `opts.background` is passed to CS.paint.toCanvas.
// The painters are forced one after the other (painter: "svg", then "replay"), never "auto", so the two results are always the two engines.
import { ssim as ssimOf } from "./ssim.mjs";

export async function paintBoth(page, selector, opts = {}) {
  const r = await page.evaluate(async ({ selector, scale, background }) => {
    const el = document.querySelector(selector);
    if (!el) throw new Error("paintBoth: no element matches " + selector);
    const o = { scale, painter: "svg" };
    if (background) o.background = background;
    const a = await CS.paint.toCanvas(el, o);
    const svg = a.toDataURL("image/png");
    const b = await CS.paint.toCanvas(el, Object.assign({}, o, { painter: "replay" }));
    return { svg, replay: b.toDataURL("image/png") };
  }, { selector, scale: opts.scale || 1, background: opts.background || null });
  const bytes = (uri) => Buffer.from(uri.slice(uri.indexOf(",") + 1), "base64");
  return { svgPng: bytes(r.svg), replayPng: bytes(r.replay) };
}

export async function paintBothScored(page, selector, opts = {}) {
  const r = await paintBoth(page, selector, opts);
  return { ...r, ssim: ssimOf(r.svgPng, r.replayPng) };
}
