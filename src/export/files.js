/*
 * CS.export · slides, cover video, PDF and the kit.
 * Everything is derived from the spec: the exporter renders its own deck (CS.core.render.deck, mode "export", frozen layout)
 * and never reads the Studio's on-screen DOM, so an export is the same whatever the user is looking at.
 */

var FPS_EXPORT = 30;
var JPEG_QUALITY = 0.92;
var JPEG_MAX_BYTES = 8000000;
var BLANK_DELTA = 6;              // luma levels a pixel must differ from the frame's median to count as content
var BLANK_PIXELS = 3;             // a frame with fewer such pixels (of 108 x 144) carries nothing but the background
var FLASH_DELTA = 24;             // mean-luma change between two frames that counts as a flash (same numbers as check_video.mjs)
var STILL_DELTA = 0.03;           // mean luma change from the frame before under which a frame repeats it (plugin.motion.stillDeltaLuma)
var THIN_SHARE = 0.25;            // a frame holding under this share of frame 0's content is thin (plugin.motion.thinShare)

function abortIf(signal) { if (signal && signal.aborted) throw exportError("E_ABORTED", "The export was cancelled."); }

function reportProgress(o, p) {
  if (o && typeof o.onProgress === "function") o.onProgress(p);
  if (typeof CS.emit === "function") CS.emit("cs:export-progress", p);
}

function applyPainterPreference(spec) {
  var pref = spec.compat && spec.compat.paint;
  CS.paint.setPainter(pref === "svg" || pref === "replay" ? pref : "auto");
}

function motionOf(spec) { return (spec.cover && spec.cover.motion) || null; }

/* ------------------------------------------------------------------ the kit's file list */

function kitDefaults(spec, opts) {
  opts = opts || {};
  var carousel = spec.format !== "single", motion = motionOf(spec);
  var exportsList = spec.canvas && spec.canvas.exports;
  return {
    carousel: carousel,
    video: opts.video !== undefined ? !!opts.video : carousel && !!motion && (!!motion.clip || motion.recipe !== "none") && !(spec.compat && spec.compat.mp4 === "off"),
    variants4x5: opts.variants4x5 !== undefined ? !!opts.variants4x5 : !exportsList || exportsList.indexOf("4x5") >= 0,
    pdf: opts.pdf !== undefined ? !!opts.pdf : true,
    source: opts.source !== undefined ? !!opts.source : false,        // the editable source files (about 12 MB) are an opt-in: the default kit is made to travel to a phone
    zip: opts.zip !== undefined ? !!opts.zip : true
  };
}

function slideStem(spec, i, carousel) { return carousel ? (i === 0 ? "01-cover" : nn(i)) : "post"; }

/** Relative paths the kit is expected to contain (also what gate X1 checks). */
function kitFilesOf(spec, opts) {
  var o = kitDefaults(spec, opts), n = (spec.slides || []).length, out = [], i;
  if (o.video) out.push("3x4/01-cover.mp4");
  for (i = 0; i < n; i++) out.push("3x4/" + slideStem(spec, i, o.carousel) + ".png");
  if (o.variants4x5) {
    if (o.video) out.push("4x5/01-cover.mp4");
    for (i = 0; i < n; i++) out.push("4x5/" + slideStem(spec, i, o.carousel) + ".jpg");
  }
  out.push("caption.txt", "hashtags.txt", "slide-captions.txt", "alt-text.txt", "posting-guide.md");
  if (o.pdf) out.push("carousel.pdf");
  if (o.source) out = out.concat(sourceFilesOf(spec, opts));
  out.push("qa-report.md", "qa-report.json");
  return out;
}

/** Relative paths of the optional source files: the spec, the cover composition (carousels with motion) and the Studio page. */
function sourceFilesOf(spec, opts) {
  var o = kitDefaults(spec, opts), out = ["spec.json"];
  if (o.carousel && motionOf(spec) && !motionOf(spec).clip && motionOf(spec).recipe !== "none") out.push("cover.hf.html");
  out.push("studio-source.html");
  return out;
}

/* ------------------------------------------------------------------ slides */

function deckOptions(ctx, extra) {
  return Object.assign({ mode: "export", useFrozen: true, assets: ctx && ctx.assets, signal: ctx && ctx.signal }, extra || {});
}

async function exportSlides(spec, ctx, opts) {
  opts = opts || {};
  ctx = ctx || {};
  var signal = opts.signal || ctx.signal, format = opts.format === "jpeg4x5" ? "jpeg4x5" : "png";
  applyPainterPreference(spec);
  var clip = motionOf(spec) && motionOf(spec).clip;
  var deck = await CS.core.render.deck(clip ? X.mp4.clip.layoutSpec(spec) : spec, ctx.brand || null, deckOptions(ctx, { slideIds: opts.only, signal: signal })), files = [], i, s, r, carousel = spec.format !== "single", cover = null;
  try {
    for (i = 0; i < deck.slides.length; i++) {
      abortIf(signal);
      s = deck.slides[i];
      if (clip && s.index === 0) {
        cover = cover || await renderClipCover(spec, ctx, { variants: ["3x4", "4x5"], signal: signal });
        files.push(cover.stills.find(function (f) { return f.path.indexOf(format === "png" ? "3x4/" : "4x5/") === 0; }));
        continue;
      }
      r = await CS.paint.raster(s.el, format === "png" ? { type: "png", crop: "3x4" } : { type: "jpeg", crop: "4x5", quality: JPEG_QUALITY, maxBytes: JPEG_MAX_BYTES });
      files.push(makeFile((format === "png" ? "3x4/" : "4x5/") + slideStem(spec, s.index, carousel) + (format === "png" ? ".png" : ".jpg"), r.bytes, { w: r.w, h: r.h }));
      reportProgress(opts, { job: "slides", done: i + 1, total: deck.slides.length, file: files[files.length - 1].path });
    }
  } finally { deck.dispose(); }
  return files;
}

/* ------------------------------------------------------------------ cover video */

/** Mean luma, median luma, the number of pixels that differ from the median and the grey copy itself, on a 108 x 144 copy of the frame. */
function lumaStats(canvas, small) {
  var sctx = small.getContext("2d", { willReadFrequently: true });
  sctx.imageSmoothingQuality = "medium";
  sctx.drawImage(canvas, 0, 0, small.width, small.height);
  var d = sctx.getImageData(0, 0, small.width, small.height).data, n = small.width * small.height, hist = new Uint32Array(256), grey = new Uint8Array(n), i, v, sum = 0, acc = 0, median = 0, deviating = 0;
  for (i = 0; i < n; i++) { v = Math.round(0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]); grey[i] = v; hist[v]++; sum += v; }
  for (v = 0; v < 256; v++) { acc += hist[v]; if (acc >= n / 2) { median = v; break; } }
  for (v = 0; v < 256; v++) if (Math.abs(v - median) > BLANK_DELTA) deviating += hist[v];
  return { mean: sum / n, median: median, deviating: deviating, grey: grey };
}

/** How much of the loop is a held picture (share of frames that repeat the one before) and the longest run of "thin" frames in seconds
 *  (between the hold-in and settle times, under THIN_SHARE of frame 0's content). */
function motionMetrics(stats, fps, holdIn, settleBy) {
  var frames = stats.length, still = 0, i, j, diff, run = 0, longest = 0, a, b, n, floor = THIN_SHARE * stats[0].deviating, last = Math.min(frames - 1, Math.round(settleBy * fps));
  for (i = 1; i < frames; i++) {
    a = stats[i].grey; b = stats[i - 1].grey; n = a.length; diff = 0;
    for (j = 0; j < n; j++) diff += a[j] > b[j] ? a[j] - b[j] : b[j] - a[j];
    if (diff / n < STILL_DELTA) still++;
  }
  for (i = Math.round(holdIn * fps); i <= last; i++) { if (stats[i].deviating < floor) { run++; if (run > longest) longest = run; } else run = 0; }
  return { stillShare: Math.round(still / Math.max(1, frames - 1) * 1000) / 1000, thinRunSeconds: Math.round(longest / fps * 100) / 100 };
}

function cropCanvas(src, y, h) {
  var c = makeCanvas(src.width, h), cx = opaqueContext(c);
  cx.imageSmoothingEnabled = false;
  cx.drawImage(src, 0, y, src.width, h, 0, 0, src.width, h);
  return c;
}

function loopMetrics(a, b) {
  var m = CS.paint.metrics;
  return { ssim: Math.round(m.ssim(a, b) * 100000) / 100000, psnr: Math.round(m.psnr(a, b) * 100) / 100 };
}

/** Slide 1 of the deck, its motion timeline and, when `withComposition` is set, its HyperFrames composition (built before any motion
 *  touches the DOM; it inlines every font, which is most of its weight and none of the video's, so only the source export asks for it). */
async function prepareCover(spec, ctx, signal, withComposition) {
  var motion = motionOf(spec) || { recipe: "calm" }, firstId = spec.slides && spec.slides[0] && spec.slides[0].id;
  var deck = await CS.core.render.deck(spec, ctx.brand || null, deckOptions(ctx, { slideIds: firstId ? [firstId] : undefined, signal: signal }));
  try {
    var slideEl = deck.slides[0].el, rec = CS.motion.recommend(spec), composition = null;
    var timeline = CS.motion.build(slideEl, { recipe: motion.recipe, seconds: motion.seconds || 6, feel: motion.feel, metaphor: motion.recipe === "story" ? rec.metaphor : undefined, topics: rec.tags });
    if (withComposition) { try { composition = await CS.motion.hf.composition({ slideEl: slideEl, tokens: deck.tokens, timeline: timeline, variant: "3x4" }); } catch (e) { composition = null; } }
    return { deck: deck, slideEl: slideEl, timeline: timeline, composition: composition };
  } catch (e) { deck.dispose(); throw e; }
}

/** What the encoded file says about itself (pixel format, range, level, colour tags), measured from its own headers for gate V1. */
function headerFacts(bytes) {
  var m = X.mp4.inspect(bytes);
  return m ? { pixFmt: m.pixFmt, range: m.range, level: m.level, colour: m.colour } : {};
}

/** cover.hf.html alone (needs no video encoder). Null when the cover has no motion or the template is missing. */
async function coverComposition(spec, ctx, signal) {
  var motion = motionOf(spec);
  if (!motion || motion.recipe === "none" || !spec.slides || !spec.slides.length) return null;
  var prep = await prepareCover(spec, ctx || {}, signal, true);
  try { return prep.composition; } finally { prep.deck.dispose(); }
}

/**
 * Renders the animated cover once and encodes it for every requested variant (`o.composition` also builds cover.hf.html).
 * Returns { files, info (one VideoInfo extension per file), composition, timeline }. Throws E_ENCODER_UNSUPPORTED when
 * the device has no H.264 encoder and E_NO_CAPABILITY for covers the Studio lane cannot render (external motion plates).
 */
async function renderCover(spec, ctx, o) {
  o = o || {};
  ctx = ctx || {};
  var signal = o.signal || ctx.signal, motion = motionOf(spec) || { recipe: "calm" }, variants = o.variants || ["3x4"], fps = FPS_EXPORT;
  if (motion.clip) { applyPainterPreference(spec); return renderClipCover(spec, ctx, o); }
  if (motion.source === "external") throw exportError("E_NO_CAPABILITY", "External motion plates are rendered in Claude Code (HyperFrames), not in the Studio.", { reason: "external-plate" });
  if (motion.recipe === "none") throw exportError("E_NO_CAPABILITY", "This cover has no motion.", { reason: "motion-off" });
  applyPainterPreference(spec);
  var support = await X.mp4.support(CANVAS_W, CANVAS_H, fps);
  if (!support.supported) throw exportError("E_ENCODER_UNSUPPORTED", support.reason || "No H.264 encoder", { reason: "no-encoder" });
  var prep = await prepareCover(spec, ctx, signal, !!o.composition), deck = prep.deck;
  try {
    abortIf(signal);
    var slideEl = prep.slideEl, timeline = prep.timeline, composition = prep.composition;
    var canvas = makeCanvas(CANVAS_W, CANVAS_H);                       // always the full paint; the 4:5 video encodes rows 45 to 1395 of it
    var poster = await CS.paint.toCanvas(slideEl, { scale: 1 });
    var driver = spec.compat && spec.compat.hfRuntime === "native-waapi" ? "waapi" : "style";
    var ctrl = CS.motion.hf.install(slideEl, timeline, "cs-cover", { driver: driver });
    await ctrl.ready;
    var frames = timeline.frames, T = timeline.times, small = makeCanvas(108, 144);
    var stats = [], first = null, last = null;
    var order = variants.filter(function (v) { return v === "3x4" || v === "4x5"; }), targets = order.map(function (v) { return v === "4x5" ? { canvas: canvas, y: CROP_4X5.y, height: CROP_4X5.h } : canvas; });
    var bytesList = await X.mp4.encodeMany({
      canvases: targets, frames: frames, fps: fps, signal: signal,
      onProgress: function (p) { reportProgress(o, p); },
      drawFrame: async function (i) {
        ctrl.seek(i / fps);
        await CS.paint.toCanvas(slideEl, { scale: 1, canvas: canvas, settle: i === 0 });
        stats[i] = lumaStats(canvas, small);
        if (i === 0) first = cropCanvas(canvas, 0, CANVAS_H);
        if (i === frames - 1) last = cropCanvas(canvas, 0, CANVAS_H);
      }
    });
    ctrl.destroy();
    var blank = 0, i, flashes = 0, windowFlashes = [], maxFlashes = 0;
    for (i = Math.round(T.holdIn * fps); i <= Math.min(frames - 1, Math.round(T.settleBy * fps)); i++) if (stats[i].deviating < BLANK_PIXELS) blank++;
    for (i = 1; i < frames; i++) {
      if (Math.abs(stats[i].mean - stats[i - 1].mean) > FLASH_DELTA) windowFlashes.push(i);
      flashes = windowFlashes.filter(function (f) { return f > i - fps && f <= i; }).length;
      if (flashes > maxFlashes) maxFlashes = flashes;
    }
    var infoBase = Object.assign({ blankFrames: blank, flashesPerSecondMax: maxFlashes, constantRate: true, audio: "none" }, motionMetrics(stats, fps, T.holdIn, T.settleBy));
    var files = [], infos = [];
    order.forEach(function (v, k) {
      var path = v + "/01-cover.mp4", crop = v === "4x5", a = crop ? cropCanvas(first, CROP_4X5.y, CROP_4X5.h) : first, z = crop ? cropCanvas(last, CROP_4X5.y, CROP_4X5.h) : last, p = crop ? cropCanvas(poster, CROP_4X5.y, CROP_4X5.h) : poster;
      files.push(makeFile(path, bytesList[k], { w: CANVAS_W, h: crop ? CROP_4X5.h : CANVAS_H }));
      infos.push(Object.assign({ file: path, loop: { frame0VsPoster: loopMetrics(a, p), lastVsFrame0: loopMetrics(z, a) } }, infoBase, headerFacts(bytesList[k])));
    });
    return { files: files, info: infos, composition: composition, timeline: timeline };
  } finally { deck.dispose(); }
}

async function exportCover(spec, ctx, opts) {
  opts = opts || {};
  var r = await renderCover(spec, ctx, { variants: [opts.variant === "4x5" ? "4x5" : "3x4"], onProgress: opts.onProgress, signal: opts.signal });
  return r.files[0];
}

/* ------------------------------------------------------------------ PDF */

async function decodeToJpeg(file) {
  if (file.mime === "image/jpeg") return file.bytes;
  var bitmap = await createImageBitmap(new Blob([file.bytes], { type: file.mime })), c = makeCanvas(bitmap.width, bitmap.height), cx = opaqueContext(c);
  cx.fillStyle = "#FFFFFF"; cx.fillRect(0, 0, c.width, c.height); cx.drawImage(bitmap, 0, 0);
  if (bitmap.close) bitmap.close();
  return encodeBytes(c, "image/jpeg", JPEG_QUALITY);
}

async function exportPdf(files, opts) {
  var pages = [], i, bytes, info;
  for (i = 0; i < files.length; i++) {
    bytes = await decodeToJpeg(files[i]);
    info = jpegInfo(bytes);
    pages.push({ jpeg: bytes, w: info.w, h: info.h, components: info.components });
  }
  return makeFile("carousel.pdf", pdfBytes(pages, opts && opts.title));
}

/* ------------------------------------------------------------------ source files (opt-in) */

/**
 * The editable source: spec.json, cover.hf.html (carousels with motion; `opts.composition` reuses one already built) and
 * studio-source.html (the Studio page, serialised credit-free by ctx.sourceHtml). `opts.check` runs gate X1 on them first and
 * throws E_QA_BLOCK on a finding. Returns { files, skipped }. These are the heavy
 * files of an export (about 12 MB, nearly all of it embedded fonts), so they are an opt-in and never part of the default kit.
 */
async function exportSource(spec, ctx, opts) {
  opts = opts || {};
  ctx = ctx || {};
  var files = [textFile("spec.json", JSON.stringify(spec, null, 2))], skipped = [], wantsHf = sourceFilesOf(spec).indexOf("cover.hf.html") >= 0, composition = opts.composition || null;
  if (wantsHf && !composition) { try { composition = await coverComposition(spec, ctx, opts.signal || ctx.signal); } catch (e) { if (e && e.code === "E_ABORTED") throw e; composition = null; } }
  if (composition) files.push(textFile("cover.hf.html", composition));
  else if (wantsHf) skipped.push({ path: "cover.hf.html", reason: "the cover composition template is not part of this page" });
  if (typeof ctx.sourceHtml === "function") files.push(textFile("studio-source.html", ctx.sourceHtml()));
  else skipped.push({ path: "studio-source.html", reason: "no credit-free Studio source was provided" });
  if (opts.check && CS.qa && typeof CS.qa.runExport === "function") {         // a standalone source export is held to gate X1 like a kit (the kit's own QA run covers the files it holds)
    var blocks = (await CS.qa.runExport({ spec: spec, brand: ctx.brand || null, files: files, expected: [] }, { gates: ["X1"] })).filter(function (r) { return r.sev === "BLOCK"; });
    if (blocks.length) throw exportError("E_QA_BLOCK", "The source files failed the clean-export check (" + blocks[0].rule + ").", { rules: blocks.map(function (r) { return r.rule; }) });
  }
  return { files: files, skipped: skipped };
}

/* ------------------------------------------------------------------ ZIP */

function exportZip(files, opts) {
  var root = opts && opts.root !== undefined ? opts.root : "carousel-kit", name = (opts && opts.name) || "carousel-kit.zip";
  var entries = files.map(function (f) { return { name: (root ? root + "/" : "") + f.path, bytes: f.bytes }; });
  return makeFile(name, zipBytes(entries, opts && opts.date));
}

/* ------------------------------------------------------------------ the kit */

async function buildKit(spec, ctx, opts) {
  opts = opts || {};
  if (motionOf(spec) && motionOf(spec).clip) opts = Object.assign({}, opts, { videoFiles: undefined, videoErrors: undefined });
  ctx = ctx || {};
  var signal = opts.signal || ctx.signal, o = kitDefaults(spec, opts), dialect = opts.dialect || ctx.dialect || (spec.locale && spec.locale.dialect) || "msa-white";
  var files = [], skipped = [], videoInfos = [], carousel = o.carousel, n = (spec.slides || []).length, composition = null, clipCover = null, clipFailed = false;
  var steps = n + (o.video ? 1 : 0) + 3, done = 0;
  var bump = function (label, file) { done += 1; reportProgress(opts, { job: "kit", done: Math.min(done, steps), total: steps, label: label, file: file }); };
  applyPainterPreference(spec);

  if (o.video && opts.videoErrors && opts.videoErrors.length) {
    skipped = skipped.concat(opts.videoErrors);
  }
  if (o.video && opts.videoFiles && opts.videoFiles.length && !(motionOf(spec) && motionOf(spec).clip)) {
    // the cover was already rendered elsewhere (Claude Code lane: HyperFrames); its bytes and measurements are used as they are
    opts.videoFiles.forEach(function (v) { files.push(makeFile(v.path, v.bytes, v.w ? { w: v.w, h: v.h } : undefined)); if (v.info) videoInfos.push(Object.assign({ file: v.path }, v.info)); });
    bump("video");
  } else if (o.video && !(opts.videoErrors && opts.videoErrors.length)) {
    try {
      var cover = await renderCover(spec, ctx, { variants: o.variants4x5 ? ["3x4", "4x5"] : ["3x4"], composition: o.source, onProgress: opts.onProgress, signal: signal });
      files = files.concat(cover.files); videoInfos = cover.info; composition = cover.composition;
      if (motionOf(spec) && motionOf(spec).clip) clipCover = cover;
    } catch (e) {
      if (e && e.code === "E_ABORTED") throw e;
      var why = e && e.code === "E_ENCODER_UNSUPPORTED" ? "no H.264 encoder" : e && e.code === "E_DEP_LOAD" ? "the MP4 writer could not be loaded" :
        e && e.detail && e.detail.reason === "external-plate" ? "external motion plate (Claude Code)" : String(e && e.message || e);
      if (motionOf(spec) && motionOf(spec).clip) { clipFailed = true; skipped.push({ path: "clip-cover", reason: why }); }
      skipped.push({ path: "3x4/01-cover.mp4", reason: why });
      if (o.variants4x5) skipped.push({ path: "4x5/01-cover.mp4", reason: why });
    }
    bump("video");
  }

  // A still-only export of a clip cover still takes its poster from an encoded frame.
  if (!o.video && motionOf(spec) && motionOf(spec).clip) {
    try { clipCover = await renderClipCover(spec, ctx, { variants: o.variants4x5 ? ["3x4", "4x5"] : ["3x4"], signal: signal, onProgress: opts.onProgress }); }
    catch (e) {
      if (e && e.code === "E_ABORTED") throw e;
      clipFailed = true; skipped.push({ path: "clip-cover", reason: String(e && e.message || e) });
    }
  }
  var deck = await CS.core.render.deck(clipCover ? X.mp4.clip.layoutSpec(spec) : spec, ctx.brand || null, deckOptions(ctx, { signal: signal })), png = [], jpg = [], pdfSources = [], i, s, outs, r;
  try {
    if (clipCover && clipCover.mediaPoster) {
      var media = deck.slides[0].el.querySelector('[data-slot="media"]');
      if (media) {
        var image = document.createElement("img"); image.src = clipCover.mediaPoster; image.alt = "";
        image.style.cssText = "width:100%;height:100%;object-fit:fill"; media.replaceChildren(image);
        if (image.decode) await image.decode();
      }
    }
    for (i = 0; i < deck.slides.length; i++) {
      abortIf(signal);
      s = deck.slides[i];
      if (clipFailed && s.index === 0) { bump("slides", "3x4/01-cover.png"); continue; }
      if (clipCover && s.index === 0) {
        png.push(clipCover.stills.find(function (f) { return f.path === "3x4/01-cover.png"; }));
        if (o.variants4x5) jpg.push(clipCover.stills.find(function (f) { return f.path === "4x5/01-cover.jpg"; }));
        if (o.pdf) pdfSources.push(makeFile("3x4/01-cover.jpg", await encodeBytes(clipCover.posters["3x4"], "image/jpeg", JPEG_QUALITY), { w: 1080, h: 1440 }));
        bump("slides", "3x4/01-cover.png");
        continue;
      }
      outs = [{ type: "png", crop: "3x4" }];
      if (o.variants4x5) outs.push({ type: "jpeg", crop: "4x5", quality: JPEG_QUALITY, maxBytes: JPEG_MAX_BYTES });
      if (o.pdf) outs.push({ type: "jpeg", crop: "3x4", quality: JPEG_QUALITY });
      r = await CS.paint.rasterMany(s.el, outs, { paintScale: 2 });
      var stem = slideStem(spec, s.index, carousel);
      png.push(makeFile("3x4/" + stem + ".png", r[0].bytes, { w: r[0].w, h: r[0].h }));
      if (o.variants4x5) jpg.push(makeFile("4x5/" + stem + ".jpg", r[1].bytes, { w: r[1].w, h: r[1].h }));
      if (o.pdf) pdfSources.push(makeFile("3x4/" + stem + ".jpg", r[outs.length - 1].bytes, { w: r[outs.length - 1].w, h: r[outs.length - 1].h }));
      bump("slides", "3x4/" + stem + ".png");
    }
  files = files.concat(png, jpg);

  files.push(textApi.caption(spec), textApi.hashtags(spec), textApi.slideCaptions(spec), textApi.alt(spec));
  if (o.pdf && !clipFailed) files.push(await exportPdf(pdfSources, { title: (spec.hook && spec.hook.cover) || (spec.brief && spec.brief.topic) || "" }));
  bump("pdf");
  if (o.source) {
    var source = await exportSource(spec, ctx, { composition: composition, signal: signal });
    files = files.concat(source.files);
    skipped = skipped.concat(source.skipped);
  }
  files.push(postingGuideFile(dialect, { present: files.map(function (f) { return f.path; }), anyAi: specUsesAi(spec), videoSkipped: skipped.some(function (k) { return k.path === "3x4/01-cover.mp4"; }) }));

  var expected = kitFilesOf(spec, opts).filter(function (p) { return p !== "qa-report.md" && p !== "qa-report.json"; });
  var report;
  if (CS.qa && typeof CS.qa.run === "function") {
    // the live deck goes in too: the rendered gates (sizes, contrast, the 130 px tile, the dead zone, the chrome) belong to the kit's report, not only to the Studio's Check screen
    report = await CS.qa.run({ spec: spec, brand: ctx.brand || null, tokens: deck.tokens, deck: deck, files: files, video: videoInfos, skipped: skipped, expected: expected, checkpoint: "exported", lane: ctx.lane || "studio" });
    files.push(textApi.qaMarkdown(report, dialect === "en" ? "en" : "ar"), textFile("qa-report.json", JSON.stringify(report, null, 2)));
  } else {
    skipped.push({ path: "qa-report.md", reason: "the QA module is not loaded" }, { path: "qa-report.json", reason: "the QA module is not loaded" });
    report = null;
  }
  bump("qa");

  var order = kitFilesOf(spec, opts), rank = function (p) { var k = order.indexOf(p); return k < 0 ? order.length : k; };
  files.sort(function (a, b) { return rank(a.path) - rank(b.path); });
  var zipFile = null;
  if (o.zip) { zipFile = exportZip(files, { name: spec.id + "-kit.zip", root: "carousel-kit", date: spec.meta && spec.meta.updatedAt ? new Date(spec.meta.updatedAt) : undefined }); }
  bump("zip");
  if (typeof CS.emit === "function") CS.emit("cs:export-done", { files: files.map(function (f) { return { path: f.path, bytes: f.bytes.length }; }) });
  return { files: files, zip: zipFile, report: report, skipped: skipped };
  } finally { deck.dispose(); }
}
