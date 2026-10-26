/*
 * CS.paint · shared helpers and state.
 *
 * The painter turns one slide element (the same DOM the editor shows) into pixels. Two engines:
 *   svg    - serialise the slide into <svg><foreignObject>, load it as an image and draw it (reference painter);
 *   replay - walk the DOM and redraw it with the 2D canvas API (WebKit, where foreignObject can taint the canvas).
 * Everything here is chunk-private; the public surface is assembled in api.js.
 */
var NS_SVG = "http://www.w3.org/2000/svg";
var NS_XHTML = "http://www.w3.org/1999/xhtml";
var CANVAS_W = 1080;
var CANVAS_H = 1440;
var CROP_4X5 = { x: 0, y: 45, w: 1080, h: 1350 };
var MAX_CACHED_IMAGES = 48;

var state = {
  preference: "auto",          // "auto" | "svg" | "replay"
  detected: null,              // result of detect()
  settled: false,              // true after the first paint (fonts inside SVG images need one warm-up)
  images: new Map(),           // src -> data: URI
  fontKey: "",                 // memo for fontCss()
  fontCss: ""
};

function csError(code, message, detail) {
  var E = CS.CSError;
  if (E) return new E(code, message, detail);
  var e = new Error(message || code);
  e.code = code;
  if (detail !== undefined) e.detail = detail;
  return e;
}

function emitEvent(type, detail) { if (typeof CS.emit === "function") CS.emit(type, detail); }

function throwIfAborted(signal) {
  if (signal && signal.aborted) throw csError("E_ABORTED", "The operation was aborted.");
}

function engineName() {
  var ua = (typeof navigator !== "undefined" && navigator.userAgent) || "";
  if (/Firefox\//.test(ua)) return "gecko";
  if (/iPhone|iPad|iPod/.test(ua) || (/Safari\//.test(ua) && !/Chrome\/|Chromium\/|Edg\/|OPR\//.test(ua))) return "webkit";
  if (CS.util && typeof CS.util.isWebKit === "function" && CS.util.isWebKit()) return "webkit";
  return "blink";
}

function makeCanvas(w, h) {
  var c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

/** Opaque sRGB 2D context (CONTRACT 4.5: no alpha in anything we export). */
function opaqueContext(canvas) {
  var ctx = canvas.getContext("2d", { alpha: false, colorSpace: "srgb", willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  return ctx;
}

function raf() { return new Promise(function (r) { requestAnimationFrame(function () { r(); }); }); }

function loadImage(url) {
  return new Promise(function (resolve, reject) {
    var img = new Image();
    img.decoding = "sync";
    img.onload = function () { resolve(img); };
    img.onerror = function () { reject(csError("E_PAINT_UNSUPPORTED", "The slide image could not be loaded by this browser.")); };
    img.src = url;
  }).then(function (img) {
    return (typeof img.decode === "function" ? img.decode().catch(function () { /* decode is best effort */ }) : Promise.resolve()).then(function () { return img; });
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise(function (resolve, reject) {
    var done = function (b) { b ? resolve(b) : reject(csError("E_PAINT_TAINTED", "The canvas could not be encoded (blocked or empty).")); };
    try {
      if (typeof canvas.toBlob === "function") canvas.toBlob(done, type, quality);
      else if (typeof canvas.convertToBlob === "function") canvas.convertToBlob({ type: type, quality: quality }).then(done, reject);
      else reject(csError("E_PAINT_UNSUPPORTED", "This browser cannot encode canvases."));
    } catch (e) {
      reject(csError("E_PAINT_TAINTED", "The canvas is tainted and cannot be exported.", { cause: String(e && e.message || e) }));
    }
  });
}

function blobBytes(blob) {
  if (blob.arrayBuffer) return blob.arrayBuffer().then(function (b) { return new Uint8Array(b); });
  return new Promise(function (resolve, reject) {
    var r = new FileReader();
    r.onload = function () { resolve(new Uint8Array(r.result)); };
    r.onerror = function () { reject(r.error); };
    r.readAsArrayBuffer(blob);
  });
}

function blobDataUri(blob) {
  return new Promise(function (resolve, reject) {
    var r = new FileReader();
    r.onload = function () { resolve(String(r.result)); };
    r.onerror = function () { reject(r.error); };
    r.readAsDataURL(blob);
  });
}

function utf8Bytes(text) { return new TextEncoder().encode(text); }

/** Percent-encoded data: URL of an SVG document (the form WebKit accepts without tainting). */
function svgDataUrl(markup) { return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(markup); }

/** url(...) in a computed value, quoted or not. The URL may hold the other kind of quote (a data: SVG whose attributes use '), so it runs to the closing quote and bracket. */
function cssUrlRe() { return /url\(\s*(['"]?)((?:(?!\1\s*\)).)*?)\1\s*\)/g; }

function rectOf(el) {
  var r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
}

/** Preview scale: ratio between the on-screen box and the layout box (Studio shows slides inside a scaled wrapper). */
function previewScale(el) {
  var w = el.offsetWidth;
  return w ? el.getBoundingClientRect().width / w : 1;
}

/** rgb(), rgba() and color(srgb r g b / a) -> { r, g, b, a } with r, g, b in 0..255. Chromium computes color-mix(in srgb ...) to the color(srgb ...) form (channels 0..1). */
function parseColor(str) {
  var s = String(str).trim(), m = /^rgba?\(([^)]+)\)$/.exec(s), k = 1, p;
  if (!m) { m = /^color\(\s*srgb\s+([^)]+)\)$/.exec(s); k = 255; }
  if (!m) return null;
  p = m[1].split(/[\s,\/]+/).filter(Boolean).map(parseFloat);
  return { r: p[0] * k, g: p[1] * k, b: p[2] * k, a: p.length > 3 ? p[3] : 1 };
}

/** The same colour as an rgba() string that every canvas accepts (a colour parseColor cannot read comes back unchanged). */
function canvasColor(str) {
  var c = parseColor(str);
  return c ? "rgba(" + Math.round(c.r) + "," + Math.round(c.g) + "," + Math.round(c.b) + "," + c.a + ")" : str;
}

function isTransparent(str) {
  var c = parseColor(str);
  return !c || c.a === 0;
}

function pxNum(v) { var n = parseFloat(v); return isFinite(n) ? n : 0; }
