/*
 * CS.paint · public API (CONTRACT 4.5).
 *
 *   detect()      which painter works in this browser
 *   toCanvas()    slide element -> canvas
 *   raster()      slide element -> PNG / JPEG bytes at the production sizes (paint at 2x, downscale)
 *   encode() downscale() svgMarkup() fontCss() textMask() metrics replay
 */

/* ------------------------------------------------------------------ downscale */

/** Step-halving, then one final high-quality draw. An exact 2x reduction is a pure 2x2 box average. */
function downscaleCanvas(canvas, w, h) {
  var cur = canvas, next, nctx;
  while (cur.width / 2 >= w && cur.height / 2 >= h) {
    next = makeCanvas(Math.ceil(cur.width / 2), Math.ceil(cur.height / 2)); nctx = opaqueContext(next);
    nctx.imageSmoothingQuality = "medium";
    nctx.drawImage(cur, 0, 0, next.width, next.height);
    cur = next;
  }
  if (cur.width === w && cur.height === h) return cur;
  next = makeCanvas(w, h); nctx = opaqueContext(next);
  nctx.imageSmoothingQuality = "high";
  nctx.drawImage(cur, 0, 0, w, h);
  return next;
}

/** Region of `canvas` (source pixels) drawn onto a new canvas of w x h, with the same step-halving. */
function downscaleRegion(canvas, sx, sy, sw, sh, w, h) {
  if (sx === 0 && sy === 0 && sw === canvas.width && sh === canvas.height) return downscaleCanvas(canvas, w, h);
  var part = makeCanvas(sw, sh), pctx = opaqueContext(part);
  pctx.imageSmoothingEnabled = false;
  pctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
  return downscaleCanvas(part, w, h);
}

/* ------------------------------------------------------------------ painter choice */

async function detectPainter(opts) {
  if (state.detected && !(opts && opts.force)) return state.detected;
  var engine = engineName(), painter = "svg", reason = "foreignObject drawing is readable on this browser";
  try {
    var c = makeCanvas(8, 8), ctx = c.getContext("2d");
    var markup = '<svg xmlns="' + NS_SVG + '" width="8" height="8"><foreignObject width="8" height="8"><div xmlns="' + NS_XHTML +
      '" style="width:8px;height:8px;background:#ff0000"></div></foreignObject></svg>';
    var img = await loadImage(svgDataUrl(markup));
    ctx.drawImage(img, 0, 0);
    var px = ctx.getImageData(4, 4, 1, 1).data;                  // throws SecurityError when the canvas is tainted
    if (!(px[0] > 200 && px[1] < 60 && px[2] < 60)) { painter = "replay"; reason = "foreignObject rendered blank"; }
  } catch (e) {
    painter = "replay";
    reason = e && e.name === "SecurityError" ? "foreignObject taints the canvas (SecurityError)" : "foreignObject drawing failed: " + (e && e.message || e);
  }
  state.detected = { painter: painter, engine: engine, reason: reason };
  emitEvent("cs:painter", { painter: painter, reason: reason });
  return state.detected;
}

async function pickPainter(requested) {
  var want = requested && requested !== "auto" ? requested : state.preference;
  if (want === "svg" || want === "replay") return want;
  return (await detectPainter()).painter;
}

function setPainterPreference(p) {
  if (p !== "auto" && p !== "svg" && p !== "replay") throw csError("E_USAGE", 'setPainter expects "auto", "svg" or "replay".');
  state.preference = p;
}

/* ------------------------------------------------------------------ toCanvas */

function backgroundOf(el, requested) {
  if (requested) return requested;
  var bg = window.getComputedStyle(el).backgroundColor;
  if (!isTransparent(bg)) return bg;
  var token = el.style.getPropertyValue("--cs-bg").trim();
  return /^#|^rgb/.test(token) ? token : "#FFFFFF";
}

async function toCanvasImpl(el, opts) {
  opts = opts || {};
  var scale = opts.scale || 1, W = el.offsetWidth || CANVAS_W, H = el.offsetHeight || CANVAS_H;
  var crop = opts.crop || { x: 0, y: 0, w: W, h: H };
  var cw = Math.round(crop.w * scale), ch = Math.round(crop.h * scale);
  var painter = await pickPainter(opts.painter);
  if (document.fonts && document.fonts.ready) await document.fonts.ready;
  var canvas = opts.canvas || makeCanvas(cw, ch);
  if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
  var ctx = opaqueContext(canvas);
  var fill = function () {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = backgroundOf(el, opts.background);
    ctx.fillRect(0, 0, cw, ch);
  };
  var geom = { scale: scale, sx: crop.x * scale, sy: crop.y * scale, sw: crop.w * scale, sh: crop.h * scale, dw: cw, dh: ch };
  fill();
  if (painter === "svg") {
    var drawOpts = { css: opts.css, fontCss: opts.fontCss, mask: opts.mask };
    await drawSvg(el, ctx, geom, drawOpts);
    if (opts.settle !== false && !state.settled) { fill(); await drawSvg(el, ctx, geom, drawOpts); }   // fonts inside the SVG image need one warm-up
  } else {
    await replayDraw(el, canvas, geom, { skipText: !!opts.mask });
  }
  state.settled = true;
  return canvas;
}

/* ------------------------------------------------------------------ encode / raster */

async function encodeCanvas(canvas, type, quality) {
  var mime = type === "jpeg" || type === "image/jpeg" ? "image/jpeg" : "image/png";
  if (mime === "image/png") {
    var png = await encodePngRgb(canvas);           // 8-bit RGB, no alpha, no metadata, the same on every engine
    if (png) return png;
  }
  var blob = await canvasToBlob(canvas, mime, mime === "image/jpeg" ? (quality === undefined ? 0.92 : quality) : undefined);
  return blobBytes(blob);
}

/**
 * One paint, several outputs. outputs: [{ type: "png"|"jpeg", crop?: "3x4"|"4x5", quality?, maxBytes? }].
 * 3x4 = 1080x1440, 4x5 = 1080x1350 taken from y 45. A JPEG with maxBytes lowers its quality in 0.02 steps until it fits.
 */
async function rasterMany(el, outputs, opts) {
  opts = opts || {};
  var scale = opts.paintScale === 1 ? 1 : 2, painted = await toCanvasImpl(el, { scale: scale, painter: opts.painter, background: opts.background, css: opts.css });
  var info = await pickPainter(opts.painter), results = [], i, o, w, h, region, out, q, bytes;
  for (i = 0; i < outputs.length; i++) {
    o = outputs[i];
    w = CANVAS_W; h = o.crop === "4x5" ? CROP_4X5.h : CANVAS_H;
    region = o.crop === "4x5" ? [0, CROP_4X5.y * scale, CANVAS_W * scale, CROP_4X5.h * scale] : [0, 0, CANVAS_W * scale, CANVAS_H * scale];
    out = downscaleRegion(painted, region[0], region[1], region[2], region[3], w, h);
    if (o.type === "jpeg") {
      q = o.quality === undefined ? 0.92 : o.quality;
      bytes = await encodeCanvas(out, "jpeg", q);
      while (o.maxBytes && bytes.length > o.maxBytes && q > 0.5) { q = Math.round((q - 0.02) * 100) / 100; bytes = await encodeCanvas(out, "jpeg", q); }
    } else bytes = await encodeCanvas(out, "png");
    results.push({ bytes: bytes, w: w, h: h, painter: info });
  }
  return results;
}

async function rasterOne(el, o) {
  var r = await rasterMany(el, [{ type: o.type, crop: o.crop, quality: o.quality, maxBytes: o.maxBytes }], { paintScale: o.paintScale });
  return r[0];
}

/* ------------------------------------------------------------------ namespace */

CS.paint = {
  detect: detectPainter,
  setPainter: setPainterPreference,
  toCanvas: toCanvasImpl,
  raster: rasterOne,
  rasterMany: rasterMany,
  encode: encodeCanvas,
  downscale: downscaleCanvas,
  svgMarkup: function (el, opts) { return buildSvgMarkup(el, opts); },
  fontCss: fontCss,
  usedFamilies: usedFamilies,
  slideCss: slideCss,
  prepare: prepareImages,
  inline: inlineImages,
  clearCache: function () { state.images.clear(); state.settled = false; },
  textMask: function (el) { return toCanvasImpl(el, { scale: 1, mask: true }); },
  metrics: { ssim: ssimOf, psnr: psnrOf },
  replay: { supports: replaySupportCheck }
};
