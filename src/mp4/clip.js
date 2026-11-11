/* Local clip covers. No clip bytes enter the spec; the host attaches a File/Blob by its post-relative name. */
var clipFiles = new Map();
var CLIP_HOLD = 0.4, CLIP_RETURN = 0.6, CLIP_MIN = 6, CLIP_MAX = 15;

function localClipPath(file) {
  return typeof file === "string" && file.length <= 512 && file.length > 0 &&
    !/^[\/]|[\\:%?#\x00-\x1f]/.test(file) && !file.split("/").some(function (s) { return !s || s.charAt(0) === "."; });
}

function validateClip(motion) {
  var c = motion && motion.clip, seconds = motion && motion.seconds;
  var finite = function (n) { return typeof n === "number" && isFinite(n); };
  if (!c || !localClipPath(c.file)) throw mp4Error("E_SCHEMA", "cover.motion.clip.file must name a file inside the post folder.");
  if (!finite(seconds) || seconds < CLIP_MIN || seconds > CLIP_MAX) throw mp4Error("E_SCHEMA", "A clip cover must last 6 to 15 seconds.");
  if (!finite(c.in) || !finite(c.out) || c.in < 0 || c.out <= c.in) throw mp4Error("E_SCHEMA", "The clip out point must be after its non-negative in point.");
  if (["cover", "contain"].indexOf(c.fit) < 0) throw mp4Error("E_SCHEMA", "Clip fit must be cover or contain.");
  if (!c.focus || !finite(c.focus.x) || !finite(c.focus.y) || c.focus.x < 0 || c.focus.x > 1 || c.focus.y < 0 || c.focus.y > 1) throw mp4Error("E_SCHEMA", "Clip focus x and y must be between 0 and 1.");
  if (["auto", "wipe", "dissolve"].indexOf(c.ending) < 0) throw mp4Error("E_SCHEMA", "Clip ending must be auto, wipe or dissolve.");
  return motion;
}

function clipAt(m, t) {
  var end = m.seconds - CLIP_HOLD, live = end - CLIP_HOLD;
  return { poster: t < CLIP_HOLD || t >= end, time: m.clip.in + (m.clip.out - m.clip.in) * Math.max(0, Math.min(1, (t - CLIP_HOLD) / live)),
    returning: Math.max(0, Math.min(1, (t - (end - CLIP_RETURN)) / CLIP_RETURN)) };
}

function clipFitRect(sw, sh, dw, dh, fit, focus) {
  var scale = fit === "contain" ? Math.min(dw / sw, dh / sh) : Math.max(dw / sw, dh / sh);
  if (fit === "contain") return { sx: 0, sy: 0, sw: sw, sh: sh, dx: (dw - sw * scale) * focus.x, dy: (dh - sh * scale) * focus.y, dw: sw * scale, dh: sh * scale };
  var w = dw / scale, h = dh / scale;
  return { sx: (sw - w) * focus.x, sy: (sh - h) * focus.y, sw: w, sh: h, dx: 0, dy: 0, dw: dw, dh: dh };
}

function clipEnding(request, similarity) { return request === "wipe" || similarity < 0.985 ? "wipe" : "dissolve"; }

/** Give the engine a media slot when the original cover had none. Typography and chrome remain engine-owned. */
function clipLayoutSpec(spec) {
  if (!(spec.cover && spec.cover.motion && spec.cover.motion.clip)) return spec;
  var slides = spec.slides.slice(), s = slides[0];
  slides[0] = Object.assign({}, s, { media: Object.assign({}, s.media || {}, { slot: s.media && s.media.slot && s.media.slot !== "none" ? s.media.slot : "screenshot" }) });
  return Object.assign({}, spec, { slides: slides });
}

function attachClipFile(name, blob) {
  if (!localClipPath(name) || !(blob instanceof Blob)) throw mp4Error("E_USAGE", "Attach the local clip as a File or Blob under its post-relative name.");
  clipFiles.set(name, blob);
  if (typeof clipPosterCache !== "undefined") clipPosterCache.clear();
  if (typeof CS.emit === "function") CS.emit("cs:cover-clip", { file: name });
}

/** Native browser decoders via the same pinned MP4 library used by the encoder. */
async function openClip(blob, signal) {
  var mb = await loadMediabunny(), input = new mb.Input({ source: new mb.BlobSource(blob), formats: mb.ALL_FORMATS }), codec = "unknown";
  try {
    var track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error("no video track");
    codec = await track.getCodecParameterString();
    if (!await track.canDecode()) throw new Error("no browser decoder");
    var sink = new mb.VideoSampleSink(track), duration = await (typeof track.computeDuration === "function" ? track.computeDuration() : input.computeDuration());
    return {
      codec: codec, duration: duration,
      sample: async function (time) {
        if (signal && signal.aborted) throw mp4Error("E_ABORTED", "The export was cancelled.");
        try {
          var sample = await sink.getSample(time);
          if (!sample) throw new Error("no frame at " + time.toFixed(3) + " s");
          return sample;
        } catch (e) {
          if (e && e.code === "E_ABORTED") throw e;
          throw mp4Error("E_NO_CAPABILITY", "Cannot decode clip codec " + codec + ". Save your clip as an H.264 MP4 (8-bit SDR), then attach it again.", { codec: codec, cause: String(e.message || e) });
        }
      },
      close: function () { input.dispose(); }
    };
  } catch (e) {
    input.dispose();
    throw mp4Error("E_NO_CAPABILITY", "Cannot decode clip codec " + codec + ". Save your clip as an H.264 MP4 (8-bit SDR), then attach it again.", { codec: codec, cause: String(e.message || e) });
  }
}

function clipCanvas(w, h) { var c = document.createElement("canvas"); c.width = w; c.height = h; return c; }
function clipPixels(canvas) { return canvas.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height); }

/** Paint two probe colours through the real DOM. Their difference is the media coverage, including occluding type and rounded edges. */
async function clipLayer(slide, media, rect, mask) {
  var red, blue;
  media.style.background = "#ff0000";
  red = clipPixels(await CS.paint.toCanvas(slide, { scale: 1, mask: mask }));
  media.style.background = "#0000ff";
  blue = clipPixels(await CS.paint.toCanvas(slide, { scale: 1, mask: mask }));
  var alpha = new Float32Array(rect.w * rect.h), base = new Uint8ClampedArray(rect.w * rect.h * 4), k = 0, x, y, j;
  for (y = 0; y < rect.h; y++) for (x = 0; x < rect.w; x++, k++) {
    j = ((rect.y + y) * red.width + rect.x + x) * 4;
    alpha[k] = Math.max(0, Math.min(1, (red.data[j] - blue.data[j]) / 255));
    base.set(red.data.subarray(j, j + 4), k * 4);
  }
  return { full: red, base: base, alpha: alpha };
}

function clipComposite(layer, pixels, dest) {
  var d = dest.data, a = layer.alpha, b = layer.base, s = pixels.data, i, j;
  for (i = 0; i < a.length; i++) {
    j = i * 4;
    d[j] = b[j] + a[i] * (s[j] - 255); d[j + 1] = b[j + 1] + a[i] * s[j + 1]; d[j + 2] = b[j + 2] + a[i] * s[j + 2]; d[j + 3] = 255;
  }
}

function clipLuminance(r, g, b) {
  function linear(v) { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

function clipCalmRules() {
  var p = { body: 4.5, large: 3, largeMinPx: 66, largeBoldMinPx: 52, decile: 0.1 };
  if (CS.qa && typeof CS.qa.rules === "function") {
    var rules = CS.qa.rules(), gate = (rules.gates || []).find(function (g) { return g.id === "D4"; });
    var check = gate && gate.checks.find(function (c) { return c.id === "D4.contrast"; });
    Object.keys(p).forEach(function (k) { if (check && check.params && typeof check.params[k] === "number") p[k] = check.params[k]; });
  }
  return p;
}

/** Same worst-decile contrast floors as D4/calm zones, measured against the text-free composite on EVERY output frame. */
function clipTextRegions(slide, rect) {
  var rules = clipCalmRules();
  var origin = slide.getBoundingClientRect(), scale = origin.width / (slide.offsetWidth || 1080), out = [], nodes = slide.querySelectorAll(".w, .cs-handle, .cs-meta, .cs-counter, .cs-swipe");
  Array.prototype.forEach.call(nodes, function (node) {
    if (node.querySelector(".w")) return;
    var r = node.getBoundingClientRect(), cs = getComputedStyle(node), rgb = cs.color.match(/[\d.]+/g), size = parseFloat(cs.fontSize), weight = parseInt(cs.fontWeight, 10) || 400;
    var x = Math.max(rect.x, Math.floor((r.left - origin.left) / scale)), y = Math.max(rect.y, Math.floor((r.top - origin.top) / scale));
    var right = Math.min(rect.x + rect.w, Math.ceil((r.right - origin.left) / scale)), bottom = Math.min(rect.y + rect.h, Math.ceil((r.bottom - origin.top) / scale));
    if (!rgb || right <= x || bottom <= y || cs.visibility === "hidden") return;
    var slot = node.closest("[data-slot]");
    out.push({ x: x - rect.x, y: y - rect.y, w: right - x, h: bottom - y, lum: clipLuminance(+rgb[0], +rgb[1], +rgb[2]),
      need: size >= rules.largeMinPx || (size >= rules.largeBoldMinPx && weight >= 700) ? rules.large : rules.body, decile: rules.decile, el: slot ? slot.getAttribute("data-slot") : node.className });
  });
  return out;
}

/**
 * An inline box is taller than its glyphs, so a headline that sits just below the window still has a box that reaches into it.
 * Keep, per text box, only the part whose ink covers footage: there the text-free probe shows the media and the painted one does not.
 */
function clipInkRegions(regions, rect, painted, textless) {
  var pad = 2;
  return regions.map(function (r) {
    var x0 = r.x + r.w, y0 = r.y + r.h, x1 = -1, y1 = -1, x, y, k;
    for (y = r.y; y < r.y + r.h; y++) for (x = r.x; x < r.x + r.w; x++) {
      k = y * rect.w + x;
      if (textless[k] - painted[k] > 0.2) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    if (x1 < 0) return null;
    x0 = Math.max(r.x, x0 - pad); y0 = Math.max(r.y, y0 - pad); x1 = Math.min(r.x + r.w - 1, x1 + pad); y1 = Math.min(r.y + r.h - 1, y1 + pad);
    return Object.assign({}, r, { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 });
  }).filter(Boolean);
}

function clipContrast(pixels, regions, frame, fps) {
  var data = pixels.data, w = pixels.width;
  for (var r of regions) {
    var ratios = [];
    for (var y = r.y; y < r.y + r.h; y += 3) for (var x = r.x; x < r.x + r.w; x += 3) {
      var j = (y * w + x) * 4, l = clipLuminance(data[j], data[j + 1], data[j + 2]);
      ratios.push((Math.max(r.lum, l) + 0.05) / (Math.min(r.lum, l) + 0.05));
    }
    ratios.sort(function (a, b) { return a - b; });
    var n = Math.max(1, Math.ceil(ratios.length * r.decile)), ratio = ratios.slice(0, n).reduce(function (a, b) { return a + b; }, 0) / n;
    if (ratio < r.need) throw mp4Error("E_NO_CAPABILITY", "Clip frame " + frame + " (" + (frame / fps).toFixed(3) + " s) breaks the calm zone behind " + r.el + ": contrast " + ratio.toFixed(2) + ", required " + r.need + ". Move the media window away from the text or add an opaque text panel.", { reason: "clip-contrast", frame: frame, seconds: frame / fps, el: r.el, ratio: ratio, need: r.need });
  }
}

/** Prepared poster and drawFrame share the engine's layout. Only pixels inside its measured media window change. */
async function prepareClipCover(spec, slide, tokens, signal) {
  var m = validateClip(spec.cover.motion), cfg = m.clip, blob = clipFiles.get(cfg.file);
  if (!blob) throw mp4Error("E_NO_CAPABILITY", "Attach the local cover clip " + cfg.file + " from the post folder before exporting.", { reason: "clip-missing", file: cfg.file });
  var reader = await openClip(blob, signal), media = slide.querySelector('[data-slot="media"]');
  try {
    if (cfg.out > reader.duration + 0.001) throw mp4Error("E_SCHEMA", "Clip out point " + cfg.out + " exceeds its duration " + reader.duration.toFixed(3) + " s.");
    if (!media) throw mp4Error("E_SCHEMA", "The cover needs a media window for the clip.");
    var sr = slide.getBoundingClientRect(), mr = media.getBoundingClientRect(), scale = sr.width / (slide.offsetWidth || 1080);
    var rect = { x: Math.max(0, Math.floor((mr.left - sr.left) / scale)), y: Math.max(0, Math.floor((mr.top - sr.top) / scale)) };
    rect.w = Math.min(1080, Math.ceil((mr.right - sr.left) / scale)) - rect.x;
    rect.h = Math.min(1440, Math.ceil((mr.bottom - sr.top) / scale)) - rect.y;
    if (rect.w < 2 || rect.h < 2) throw mp4Error("E_SCHEMA", "The cover media window has no usable area. Choose a cover layout with room for footage.");
    var children = Array.prototype.slice.call(media.childNodes), style = media.getAttribute("style"), fullLayer, background;
    var regions = clipTextRegions(slide, rect);
    try {
      media.replaceChildren();
      fullLayer = await clipLayer(slide, media, rect, false);
      if (regions.length) background = await clipLayer(slide, media, rect, true);
    } finally {
      media.replaceChildren.apply(media, children);
      if (style === null) media.removeAttribute("style"); else media.setAttribute("style", style);
    }
    if (regions.length) regions = clipInkRegions(regions, rect, fullLayer.alpha, background.alpha);
    var windowCanvas = clipCanvas(rect.w, rect.h), wc = windowCanvas.getContext("2d", { alpha: false, willReadFrequently: true });
    var full = clipCanvas(1080, 1440), fc = full.getContext("2d", { alpha: false, willReadFrequently: true });
    var composed = wc.createImageData(rect.w, rect.h), textless = regions.length ? wc.createImageData(rect.w, rect.h) : null;
    fc.putImageData(fullLayer.full, 0, 0);
    async function windowAt(time) {
      var sample = await reader.sample(time);
      try {
        wc.fillStyle = tokens && tokens.roles && tokens.roles.bg || "#000000"; wc.fillRect(0, 0, rect.w, rect.h);
        var source = sample.toVideoFrame(), fit;
        try {
          fit = clipFitRect(source.displayWidth, source.displayHeight, rect.w, rect.h, cfg.fit, cfg.focus);
          wc.drawImage(source, fit.sx, fit.sy, fit.sw, fit.sh, fit.dx, fit.dy, fit.dw, fit.dh);
        } finally { source.close(); }
        return clipPixels(windowCanvas);
      } finally { sample.close(); }
    }
    var firstWindow = await windowAt(cfg.in), endpoint = await windowAt(Math.max(cfg.in, cfg.out - 1 / 120));
    var ca = clipCanvas(rect.w, rect.h), cz = clipCanvas(rect.w, rect.h);
    ca.getContext("2d").putImageData(firstWindow, 0, 0); cz.getContext("2d").putImageData(endpoint, 0, 0);
    var similarity = CS.paint.metrics.ssim(ca, cz), ending = clipEnding(cfg.ending, similarity);
    var frames = Math.round(m.seconds * 30);
    async function drawFrame(i) {
      if (signal && signal.aborted) throw mp4Error("E_ABORTED", "The export was cancelled.");
      var at = clipAt(m, i / 30), pixels = at.poster ? firstWindow : await windowAt(at.time);
      if (!at.poster && at.returning > 0) {
        var p = at.returning * at.returning * (3 - 2 * at.returning), d = pixels.data, b = firstWindow.data;
        var edge = Math.round(rect.w * (slide.getAttribute("dir") === "rtl" ? 1 - p : p));
        for (var y = 0; y < rect.h; y++) for (var x = 0; x < rect.w; x++) {
          var j = (y * rect.w + x) * 4, reveal = slide.getAttribute("dir") === "rtl" ? x >= edge : x < edge;
          for (var k = 0; k < 3; k++) d[j + k] = ending === "dissolve" ? d[j + k] * (1 - p) + b[j + k] * p : reveal ? b[j + k] : d[j + k];
        }
      }
      if (regions.length) { clipComposite(background, pixels, textless); clipContrast(textless, regions, i, 30); }
      clipComposite(fullLayer, pixels, composed); fc.putImageData(composed, rect.x, rect.y);
      return full;
    }
    await drawFrame(0);
    var poster = clipCanvas(1080, 1440); poster.getContext("2d").drawImage(full, 0, 0);
    return { canvas: full, poster: poster, frames: frames, duration: frames / 30, ending: ending, endpointSsim: similarity,
      rect: rect, mediaPoster: ca, drawFrame: drawFrame, close: reader.close };
  } catch (e) { reader.close(); throw e; }
}

/** Decode an encoded output frame. Stills use these pixels, never a second RGB/YUV conversion of a different poster. */
async function decodeClipPoster(bytes, time) {
  var reader = await openClip(new Blob([bytes], { type: "video/mp4" }));
  try {
    var sample = await reader.sample(time || 0), frame;
    try {
      frame = sample.toVideoFrame();
      var c = clipCanvas(frame.displayWidth, frame.displayHeight);
      c.getContext("2d", { alpha: false }).drawImage(frame, 0, 0);
      return c;
    } finally { if (frame) frame.close(); sample.close(); }
  } finally { reader.close(); }
}

X.mp4.clip = { validate: validateClip, at: clipAt, fitRect: clipFitRect, ending: clipEnding, localPath: localClipPath,
  attachFile: attachClipFile, hasFile: function (name) { return clipFiles.has(name); }, detachFile: function (name) { clipFiles.delete(name); }, layoutSpec: clipLayoutSpec,
  prepare: prepareClipCover, decodePoster: decodeClipPoster };

/* Video-specific Studio adapters. The core UI calls these only for cover previews and local file choice. */
var clipPosterCache = new Map();
X.mp4.clip.preview = async function (spec, ctx, render, index) {
  var m = spec.cover && spec.cover.motion;
  if (index || !m || !m.clip || !X.clipPoster) return render;
  render.el.setAttribute("data-cover-video", clipFiles.has(m.clip.file) ? "attached" : "missing");
  if (!clipFiles.has(m.clip.file)) return render;
  var key = JSON.stringify([spec.rev, spec.style, spec.slides[0], m, ctx.brand && ctx.brand.rev]), job = clipPosterCache.get(key);
  if (!job) {
    job = X.clipPoster(spec, { brand: ctx.brand, assets: ctx.assets }).then(function (c) { return c.toDataURL("image/png"); });
    clipPosterCache.set(key, job);
    if (clipPosterCache.size > 4) clipPosterCache.delete(clipPosterCache.keys().next().value);
  }
  try {
    var image = document.createElement("img"); image.src = await job; image.alt = "";
    image.setAttribute("aria-hidden", "true"); image.setAttribute("data-cover-poster", "");
    image.style.cssText = "position:absolute;inset:0;width:100%;height:100%;z-index:100;pointer-events:none";
    render.el.appendChild(image);
    render.el.addEventListener("focusin", function () { image.hidden = true; });
    render.el.addEventListener("focusout", function () { image.hidden = false; });
  } catch (e) {
    clipPosterCache.delete(key); render.el.setAttribute("data-cover-video", "failed");
    if (CS.emit) CS.emit("cs:error", { code: e.code, message: e.message });
  }
  return render;
};

X.mp4.clip.picker = function (ctx, lang) {
  var host = document.createElement("div"); host.className = "ui-note"; host.setAttribute("aria-live", "polite");
  var text = function (ar, en) { return lang === "en" ? en : ar; };
  host.update = function () {
    host.replaceChildren(); host.hidden = ctx.index() !== 0;
    var c = ctx.spec.cover && ctx.spec.cover.motion && ctx.spec.cover.motion.clip;
    if (c) {
      var label = document.createElement("span"), name = document.createElement("bdi"); name.dir = "ltr"; name.textContent = c.file;
      label.textContent = text("فيديو مرفق: ", "Video attached: "); label.appendChild(name); host.appendChild(label);
    }
    var input = document.createElement("input"), button = document.createElement("button");
    input.type = "file"; input.accept = "video/*"; input.hidden = true;
    input.setAttribute("aria-label", text("اختر فيديو الغلاف", "Choose cover video"));
    button.type = "button"; button.className = "ui-btn ui-btn--ghost ui-btn--sm";
    button.textContent = text(c ? "اختر الملف للمعاينة" : "أرفق فيديو الغلاف", c ? "Choose file to preview" : "Attach cover video");
    button.onclick = function () { input.click(); };
    input.onchange = async function () {
      var file = input.files[0]; if (!file) return;
      var url = URL.createObjectURL(file), video = document.createElement("video");
      video.preload = "metadata";
      try {
        await new Promise(function (ok, fail) { video.onloadedmetadata = ok; video.onerror = fail; video.src = url; });
        var name = c ? c.file : file.name;
        var m = { recipe: "calm", source: "internal", seconds: Math.max(6, Math.min(15, video.duration + 0.8)),
          clip: { file: name, in: 0, out: video.duration, fit: "cover", focus: { x: 0.5, y: 0.5 }, ending: "auto" } };
        if (c) m = Object.assign({}, ctx.spec.cover.motion, { clip: Object.assign({}, c) });
        validateClip(m); attachClipFile(name, file); clipPosterCache.clear(); ctx.setMotion(m);
      } catch (e) {
        var error = document.createElement("span"); error.setAttribute("role", "alert");
        if (lang === "en") error.textContent = "Cannot open video. Choose an H.264 MP4.";
        else {
          var format = document.createElement("bdi"), codec = document.createElement("bdi");
          format.dir = codec.dir = "ltr"; format.textContent = "MP4"; codec.textContent = "H.264";
          error.append("تعذر فتح الفيديو. اختر ملف ", format, " بترميز ", codec, ".");
        }
        host.appendChild(error);
      }
      finally { video.removeAttribute("src"); video.load(); URL.revokeObjectURL(url); }
    };
    host.appendChild(button); host.appendChild(input);
  };
  return host;
};
