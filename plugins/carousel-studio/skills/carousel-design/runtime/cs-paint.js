/*! Carousel Studio runtime chunk cs-paint.js · cs-1.1.1 · Apache-2.0 */
(function () {
  "use strict";
  var CS = (window.CS = window.CS || {});
  /* ---- file: core.js ---- */
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

  /* ---- file: css.js ---- */
/*
 * CS.paint · fonts, slide CSS and image inlining.
 * A foreignObject SVG is a separate document: it sees none of the page's fonts, stylesheets or object URLs.
 * Everything the slide needs is therefore copied into the markup.
 */

var GENERIC_FAMILIES = { "serif": 1, "sans-serif": 1, "monospace": 1, "cursive": 1, "fantasy": 1, "system-ui": 1, "ui-sans-serif": 1,
  "ui-serif": 1, "ui-monospace": 1, "emoji": 1, "math": 1, "fangsong": 1, "inherit": 1, "initial": 1, "unset": 1 };

function embeddedFontCss() {
  var el = document.getElementById("cs-fonts");
  return el ? el.textContent || "" : "";
}

function splitFontFaces(css) {
  var faces = [], re = /@font-face\s*\{[^}]*\}/g, m, fam;
  while ((m = re.exec(css))) {
    fam = /font-family\s*:\s*(?:"([^"]+)"|'([^']+)'|([^;}\s][^;}]*))/.exec(m[0]);
    faces.push({ css: m[0], family: fam ? (fam[1] || fam[2] || fam[3] || "").trim().toLowerCase() : "" });
  }
  return faces;
}

/** Family names (lower case, unquoted, generics removed) that a computed font-family stack lists. */
function familiesOfStack(stack) {
  var out = [], parts = String(stack || "").split(","), i, f;
  for (i = 0; i < parts.length; i++) {
    f = parts[i].trim().replace(/^["']|["']$/g, "").toLowerCase();
    if (f && !GENERIC_FAMILIES[f]) out.push(f);
  }
  return out;
}

function registryFamilyName(id) {
  try {
    var reg = CS.core && CS.core.registry;
    var name = reg && typeof reg.fontCss === "function" ? reg.fontCss(id) : "";
    return name ? String(name).replace(/^["']|["']$/g, "").toLowerCase() : "";
  } catch (e) { return ""; }
}

/** Families that the text of `el` is actually drawn with (first look at every text node's parent). */
function usedFamilies(el) {
  var seen = {}, out = [];
  var add = function (stack) { familiesOfStack(stack).forEach(function (f) { if (!seen[f]) { seen[f] = 1; out.push(f); } }); };
  add(window.getComputedStyle(el).fontFamily);
  var walker = document.createTreeWalker(el, 4 /* SHOW_TEXT */, null), node, last = null;
  while ((node = walker.nextNode())) {
    if (!node.nodeValue.trim() || node.parentNode === last) continue;
    last = node.parentNode;
    add(window.getComputedStyle(last).fontFamily);
  }
  // pseudo-element text (decor ornaments) can use a family of its own
  ["::before", "::after"].forEach(function (p) {
    var all = el.querySelectorAll("*"), i, cs;
    for (i = 0; i < all.length && i < 400; i++) {
      cs = window.getComputedStyle(all[i], p);
      if (cs.content && cs.content !== "none" && cs.content !== "normal") add(cs.fontFamily);
    }
  });
  return out;
}

/**
 * @font-face rules for the faces in use. `families` may hold registry ids or CSS family names; omitted = every
 * embedded face. Rules are copied verbatim (base64 data: URIs, unicode-range kept).
 */
function fontCss(families) {
  var css = embeddedFontCss();
  if (!families || !families.length) return css;
  var wanted = {}, key;
  families.forEach(function (f) {
    var low = String(f).replace(/^["']|["']$/g, "").toLowerCase();
    wanted[low] = 1;
    var viaRegistry = registryFamilyName(f);
    if (viaRegistry) wanted[viaRegistry] = 1;
  });
  key = css.length + "|" + Object.keys(wanted).sort().join(",");
  if (state.fontKey === key) return state.fontCss;
  var out = splitFontFaces(css).filter(function (face) { return wanted[face.family]; }).map(function (face) { return face.css; }).join("\n");
  state.fontKey = key; state.fontCss = out;
  return out;
}

/** CSS that styles a slide: archetype layout + the preset's decor (+ anything a host registered). */
function slideCss(el, extra) {
  var parts = [], reg = CS.core && CS.core.registry, preset = el.getAttribute && el.getAttribute("data-preset");
  var archetype = "", decor = "";
  try { if (reg && typeof reg.archetypeCss === "function") archetype = reg.archetypeCss() || ""; } catch (e) { archetype = ""; }
  if (!archetype) { var a = document.getElementById("cs-archetype-css"); archetype = a ? a.textContent : ""; }
  try { if (reg && preset && typeof reg.decorCss === "function") decor = reg.decorCss(preset) || ""; } catch (e) { decor = ""; }
  if (!decor && preset) {
    var styles = document.querySelectorAll("style[data-cs-decor]"), i;
    for (i = 0; i < styles.length; i++) if (styles[i].getAttribute("data-cs-decor") === preset) decor += styles[i].textContent;
  }
  parts.push(archetype, decor);
  el.querySelectorAll("style[data-cs-free-css]").forEach(function (n) { parts.push(n.textContent); });
  var host = document.querySelectorAll("style[data-cs-slide-css]"), j;
  for (j = 0; j < host.length; j++) parts.push(host[j].textContent);
  if (extra) parts.push(extra);
  return parts.filter(Boolean).join("\n");
}

/* ------------------------------------------------------------------ images */

function isDataUri(src) { return /^data:/i.test(src); }

function cacheImage(src, uri) {
  if (state.images.size >= MAX_CACHED_IMAGES) state.images.delete(state.images.keys().next().value);
  state.images.set(src, uri);
}

/** Asynchronously turns any image source (blob:, http(s):, relative) into a data: URI, byte for byte. */
async function toDataUri(src) {
  if (isDataUri(src)) return src;
  if (state.images.has(src)) return state.images.get(src);
  var uri;
  try {
    var res = await fetch(src);
    if (!res.ok) throw new Error("HTTP " + res.status);
    uri = await blobDataUri(await res.blob());
  } catch (e) {
    uri = null;
  }
  if (!uri) throw csError("E_PAINT_TAINTED", "An image could not be read for painting (blocked by the browser).", { src: String(src).slice(0, 120) });
  cacheImage(src, uri);
  return uri;
}

/** Synchronous fallback for an already loaded <img>/<video>/<canvas>: redraw it and read it back as PNG. */
function elementToDataUri(el) {
  var w = el.naturalWidth || el.videoWidth || el.width, h = el.naturalHeight || el.videoHeight || el.height;
  if (!w || !h) return null;
  var c = makeCanvas(w, h);
  try {
    c.getContext("2d").drawImage(el, 0, 0, w, h);
    return c.toDataURL("image/png");
  } catch (e) {
    throw csError("E_PAINT_TAINTED", "An image is cross-origin and cannot be copied into the slide.", { src: String(el.currentSrc || el.src || "").slice(0, 120) });
  }
}

function srcOf(img) { return img.currentSrc || img.getAttribute("src") || ""; }

/** Walks `root` and returns every distinct external URL its images and inline styles use. */
function collectImageUrls(root) {
  var urls = {}, all = root.querySelectorAll("*"), i, el, style, m, re;
  var consider = function (u) { if (u && !isDataUri(u)) urls[u] = 1; };
  for (i = 0; i < all.length; i++) {
    el = all[i];
    if (el.tagName === "IMG") consider(srcOf(el));
    if (el.tagName === "image" || el.tagName === "IMAGE") consider(el.getAttribute("href") || el.getAttributeNS("http://www.w3.org/1999/xlink", "href"));
    style = el.getAttribute("style");
    if (style && style.indexOf("url(") >= 0) { re = cssUrlRe(); while ((m = re.exec(style))) consider(m[2]); }
  }
  return Object.keys(urls);
}

/** Fills the image cache for `root` (async, byte-exact). Called by toCanvas before any synchronous markup is built. */
async function prepareImages(root) {
  var urls = collectImageUrls(root), i;
  for (i = 0; i < urls.length; i++) await toDataUri(urls[i]);
}

/** Rewrites image sources of `root` in place to data: URIs (used on clones, for the HyperFrames composition). */
async function inlineImages(root) {
  await prepareImages(root);
  rewriteImages(root, root, false);
}

/** Replaces <img>/<video>/<canvas> sources and style url()s on `clone` using the cache and live elements of `live`. */
function rewriteImages(live, clone, useLive) {
  var liveAll = live.querySelectorAll("*"), cloneAll = clone.querySelectorAll("*"), i, a, b, src, uri, style, re;
  for (i = 0; i < cloneAll.length; i++) {
    a = useLive ? liveAll[i] : cloneAll[i];
    b = cloneAll[i];
    if (b.tagName === "IMG") {
      src = srcOf(a);
      if (src && !isDataUri(src)) {
        uri = state.images.get(src) || (useLive && a.complete ? elementToDataUri(a) : null);
        if (uri) { b.setAttribute("src", uri); b.removeAttribute("srcset"); b.removeAttribute("loading"); }
      }
    } else if (b.tagName === "VIDEO" || b.tagName === "CANVAS") {
      uri = useLive ? elementToDataUri(a) : null;
      if (uri) {
        var img = document.createElement("img");
        img.setAttribute("src", uri);
        img.setAttribute("style", b.getAttribute("style") || "");
        img.setAttribute("class", b.getAttribute("class") || "");
        img.setAttribute("data-m-slot", b.getAttribute("data-m-slot") || "");
        if (b.parentNode) b.parentNode.replaceChild(img, b);
      }
    }
    style = b.getAttribute("style");
    if (style && style.indexOf("url(") >= 0) {
      re = cssUrlRe();
      b.setAttribute("style", style.replace(re, function (all, q, u) {
        var data = isDataUri(u) ? u : state.images.get(u);
        return data ? 'url("' + data + '")' : all;
      }));
    }
  }
}

  /* ---- file: svg.js ---- */
/*
 * CS.paint · the svg painter (reference painter for Blink and Gecko).
 *
 *   slide DOM -> clone -> bake what XMLSerializer cannot see -> <svg><foreignObject> -> Image -> canvas
 *
 * What serialisation cannot see, and what we bake into the clone's inline style:
 *   - Web Animations state (paused cover animations): the sampled computed transform/opacity/clip-path/dash;
 *   - inherited text properties of the slide root (the foreignObject document has no page CSS above the slide);
 *   - external images, <video> frames and <canvas> pixels (turned into data: URIs).
 */

var INHERITED_ROOT_PROPS = ["fontFamily", "fontSize", "fontWeight", "fontStyle", "fontStretch", "color", "direction",
  "textAlign", "unicodeBidi", "whiteSpace", "wordBreak", "overflowWrap", "hyphens", "fontKerning", "fontFeatureSettings",
  "fontVariantLigatures", "fontVariantNumeric", "letterSpacing", "wordSpacing", "textRendering", "textIndent"];
var ANIMATED_PROPS = ["transform", "transformOrigin", "transformBox", "opacity", "clipPath", "strokeDashoffset", "strokeDasharray", "visibility", "display"];

function cssName(prop) { return prop.replace(/[A-Z]/g, function (c) { return "-" + c.toLowerCase(); }); }

/** Elements of `root` that currently have Web Animations attached. */
function animatedElements(root) {
  var set = new Set();
  if (typeof root.getAnimations !== "function") return set;
  var anims = root.getAnimations({ subtree: true }), i, t;
  for (i = 0; i < anims.length; i++) { t = anims[i].effect && anims[i].effect.target; if (t) set.add(t); }
  return set;
}

function cdata(css) { return "<![CDATA[" + String(css).replace(/\]\]>/g, "]]]]><![CDATA[>") + "]]>"; }

/** The clone that gets serialised. `live` is the on-page slide; nothing on the page is modified. */
function cloneForPaint(live) {
  var clone = live.cloneNode(true);
  var liveAll = live.querySelectorAll("*"), cloneAll = clone.querySelectorAll("*");
  var animated = animatedElements(live), i, a, b, cs, p, name;
  for (i = 0; i < cloneAll.length; i++) {
    a = liveAll[i]; b = cloneAll[i];
    b.removeAttribute("contenteditable"); b.removeAttribute("spellcheck");
    if (animated.has(a)) {
      cs = window.getComputedStyle(a);
      for (p = 0; p < ANIMATED_PROPS.length; p++) { name = ANIMATED_PROPS[p]; b.style.setProperty(cssName(name), cs[name]); }
    }
  }
  rewriteImages(live, clone, true);
  // the root: laid out at its own origin, with the text defaults it would have inherited on the page
  var rcs = window.getComputedStyle(live), rs = clone.style;
  clone.removeAttribute("contenteditable");
  for (p = 0; p < INHERITED_ROOT_PROPS.length; p++) { name = INHERITED_ROOT_PROPS[p]; rs.setProperty(cssName(name), rcs[name]); }
  // line-height is resolved to pixels by getComputedStyle; hand it down as the unitless ratio it normally is, so that
  // children with other font sizes keep their own line boxes exactly as on the page
  var lh = parseFloat(rcs.lineHeight), fs = parseFloat(rcs.fontSize);
  if (lh > 0 && fs > 0) rs.setProperty("line-height", String(Math.round(lh / fs * 10000) / 10000));
  rs.setProperty("position", "relative"); rs.setProperty("left", "0"); rs.setProperty("top", "0"); rs.setProperty("margin", "0");
  rs.setProperty("transform", "none"); rs.setProperty("translate", "none"); rs.setProperty("width", live.offsetWidth + "px");
  rs.setProperty("height", live.offsetHeight + "px");
  return clone;
}

/** Inline CSS that makes every glyph invisible while keeping all backgrounds (used by the D4 contrast test). */
var TEXT_MASK_CSS = "*{color:transparent !important;-webkit-text-fill-color:transparent !important;-webkit-text-stroke-color:transparent !important;" +
  "text-shadow:none !important;text-decoration-color:transparent !important;caret-color:transparent !important}";

/**
 * Standalone SVG document for `el`. Synchronous: images must be in the cache already (toCanvas calls
 * prepareImages first); loaded <img>s that are not cached are copied through a canvas.
 */
function buildSvgMarkup(el, opts) {
  opts = opts || {};
  var scale = opts.scale || 1, w = el.offsetWidth || CANVAS_W, h = el.offsetHeight || CANVAS_H;
  var clone = cloneForPaint(el);
  var xhtml = new XMLSerializer().serializeToString(clone);
  var fonts = opts.fontCss !== undefined ? opts.fontCss : fontCss(usedFamilies(el));
  var css = slideCss(el, opts.css) + (opts.mask ? "\n" + TEXT_MASK_CSS : "");
  return '<svg xmlns="' + NS_SVG + '" width="' + (w * scale) + '" height="' + (h * scale) + '" viewBox="0 0 ' + w + " " + h + '">' +
    '<foreignObject x="0" y="0" width="' + w + '" height="' + h + '"><div xmlns="' + NS_XHTML + '" style="width:' + w + "px;height:" + h + 'px;overflow:hidden">' +
    "<style>" + cdata(fonts + "\n" + css) + "</style>" + xhtml + "</div></foreignObject></svg>";
}

/** Draws the svg painter's image of `el` into `ctx` (source rect and destination are in output pixels). */
async function drawSvg(el, ctx, geom, opts) {
  await prepareImages(el);
  var markup = buildSvgMarkup(el, { scale: geom.scale, css: opts.css, fontCss: opts.fontCss, mask: opts.mask });
  var img = await loadImage(svgDataUrl(markup));       // an object URL would taint the canvas: foreignObject images need a data: URL
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, geom.sx, geom.sy, geom.sw, geom.sh, 0, 0, geom.dw, geom.dh);
  ctx.imageSmoothingEnabled = true;
}

  /* ---- file: replay.js ---- */
/*
 * CS.paint · the replay painter (WebKit / iOS, and the fallback whenever foreignObject taints the canvas).
 *
 * It never serialises the slide. It reads the layout the browser already computed and redraws it with the 2D canvas API:
 *   1. snapshot  - one measuring pass: every box, every word rectangle, with all 2D transforms neutralised;
 *   2. preload   - images and inline <svg> graphics are decoded;
 *   3. draw      - boxes in CSS paint order, text per word with ctx.direction, transforms and group opacity re-applied.
 * Supported: solid / linear / repeating-linear / radial gradients, data-URI images, borders and radii, simple shadows,
 * <img>, <video> and <canvas> frames, inline <svg>, 2D transforms, clip-path inset(), overflow clipping, ::before / ::after,
 * text-decoration, -webkit-text-stroke. Anything else is reported by supports().
 *
 * The page is never touched: all measuring happens on a throwaway clone laid out in an off-screen stage, with the state of any
 * running Web Animations baked into it. ::before / ::after become real stand-in elements on that clone.
 */

var REPLAY_PROPS = ["display", "position", "visibility", "opacity", "overflowX", "overflowY", "zIndex", "transformOrigin", "clipPath",
  "backgroundColor", "backgroundImage", "backgroundSize", "backgroundPosition", "backgroundRepeat", "boxSizing",
  "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth", "borderTopStyle", "borderRightStyle", "borderBottomStyle", "borderLeftStyle",
  "borderTopColor", "borderRightColor", "borderBottomColor", "borderLeftColor",
  "borderTopLeftRadius", "borderTopRightRadius", "borderBottomRightRadius", "borderBottomLeftRadius",
  "paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "boxShadow", "color", "webkitTextFillColor", "webkitTextStrokeWidth",
  "webkitTextStrokeColor", "textShadow", "textDecorationLine", "textDecorationColor", "textDecorationThickness", "textUnderlineOffset",
  "fontStyle", "fontWeight", "fontSize", "fontFamily", "fontKerning", "direction", "textAlign", "objectFit", "objectPosition",
  "listStyleType", "lineHeight"];

function pickStyle(cs) {
  var out = {}, i;
  for (i = 0; i < REPLAY_PROPS.length; i++) out[REPLAY_PROPS[i]] = cs[REPLAY_PROPS[i]];
  return out;
}

/* ------------------------------------------------------------------ support check */

function insideInlineSvg(el) { var s = el.closest && el.closest("svg"); return !!(s && s !== el); }

function replaySupportCheck(el) {
  var found = {}, all = [el].concat(Array.prototype.slice.call(el.querySelectorAll("*"))), i, cs, ps, p, m3;
  var flag = function (name) { found[name] = 1; };
  for (i = 0; i < all.length; i++) {
    if (insideInlineSvg(all[i])) continue;
    cs = window.getComputedStyle(all[i]);
    if (cs.display === "none") continue;
    if (cs.filter && cs.filter !== "none") flag("filter");
    if (cs.backdropFilter && cs.backdropFilter !== "none") flag("backdrop-filter");
    if (cs.mixBlendMode && cs.mixBlendMode !== "normal") flag("mix-blend-mode");
    if ((cs.maskImage && cs.maskImage !== "none") || (cs.webkitMaskImage && cs.webkitMaskImage !== "none")) flag("mask");
    if (cs.writingMode && cs.writingMode !== "horizontal-tb") flag("writing-mode");
    if (cs.backgroundBlendMode && cs.backgroundBlendMode.split(",").some(function (m) { return m.trim() !== "normal"; })) flag("background-blend-mode");
    if (cs.clipPath && cs.clipPath !== "none" && !/^inset\(/.test(cs.clipPath)) flag("clip-path");
    if (cs.transform && /^matrix3d/.test(cs.transform)) { m3 = new DOMMatrix(cs.transform); if (!m3.is2D) flag("transform-3d"); }
    if (cs.boxShadow && /inset/.test(cs.boxShadow)) flag("box-shadow-inset");
    if (cs.backgroundImage && /conic-gradient/.test(cs.backgroundImage)) flag("conic-gradient");
    if (cs.listStyleType && cs.listStyleType !== "none" && cs.display === "list-item") flag("list-marker");
    for (p = 0; p < 2; p++) {
      ps = window.getComputedStyle(all[i], p ? "::after" : "::before");
      if (ps.content && ps.content !== "none" && ps.content !== "normal" && ps.display !== "none" && /attr\(|counter\(|url\(/.test(ps.content)) flag("pseudo-element-content");
    }
  }
  var list = Object.keys(found);
  return { ok: list.length === 0, unsupported: list };
}

/* ------------------------------------------------------------------ geometry and paths */

function parseRadius(value, w, h) {
  var parts = String(value).trim().split(/\s+/), a = parts[0], b = parts[1] || parts[0];
  var conv = function (s, base) { return /%$/.test(s) ? parseFloat(s) / 100 * base : pxNum(s); };
  return { h: conv(a, w), v: conv(b, h) };
}

function cornerRadii(st, w, h) {
  var r = [parseRadius(st.borderTopLeftRadius, w, h), parseRadius(st.borderTopRightRadius, w, h),
    parseRadius(st.borderBottomRightRadius, w, h), parseRadius(st.borderBottomLeftRadius, w, h)];
  var f = Math.min(1, w / Math.max(1e-6, r[0].h + r[1].h), w / Math.max(1e-6, r[3].h + r[2].h), h / Math.max(1e-6, r[0].v + r[3].v), h / Math.max(1e-6, r[1].v + r[2].v));
  if (f < 1) r = r.map(function (c) { return { h: c.h * f, v: c.v * f }; });
  return r;
}

function hasRadius(r) { return r.some(function (c) { return c.h > 0.01 || c.v > 0.01; }); }

/** Appends a (rounded) rectangle to the current path. */
function pathInto(ctx, x, y, w, h, r) {
  if (!r || !hasRadius(r)) { ctx.rect(x, y, w, h); return; }
  ctx.moveTo(x + r[0].h, y);
  ctx.lineTo(x + w - r[1].h, y); ctx.ellipse(x + w - r[1].h, y + r[1].v, r[1].h, r[1].v, 0, -Math.PI / 2, 0);
  ctx.lineTo(x + w, y + h - r[2].v); ctx.ellipse(x + w - r[2].h, y + h - r[2].v, r[2].h, r[2].v, 0, 0, Math.PI / 2);
  ctx.lineTo(x + r[3].h, y + h); ctx.ellipse(x + r[3].h, y + h - r[3].v, r[3].h, r[3].v, 0, Math.PI / 2, Math.PI);
  ctx.lineTo(x, y + r[0].v); ctx.ellipse(x + r[0].h, y + r[0].v, r[0].h, r[0].v, 0, Math.PI, Math.PI * 1.5);
  ctx.closePath();
}

function roundedPath(ctx, x, y, w, h, r) { ctx.beginPath(); pathInto(ctx, x, y, w, h, r); }

/** Splits a CSS list at top-level `sep`, honouring parentheses and quotes. */
function splitTop(str, sep) {
  var out = [], depth = 0, cur = "", i, ch, q = null;
  for (i = 0; i < str.length; i++) {
    ch = str.charAt(i);
    if (q) { cur += ch; if (ch === q && str.charAt(i - 1) !== "\\") q = null; continue; }
    if (ch === '"' || ch === "'") { q = ch; cur += ch; continue; }
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === sep && depth === 0) { out.push(cur.trim()); cur = ""; } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/* ------------------------------------------------------------------ gradients */

function parseStops(items, lineLen) {
  var stops = items.map(function (it) {
    var m = /^(.*?)(?:\s+(-?[\d.]+)(%|px))?(?:\s+(-?[\d.]+)(%|px))?$/.exec(it.trim());
    var color = m[1].trim(), pos = null, pos2 = null;
    var toFrac = function (v, unit) { return unit === "%" ? parseFloat(v) / 100 : parseFloat(v) / lineLen; };
    if (m[2] !== undefined) pos = toFrac(m[2], m[3]);
    if (m[4] !== undefined) pos2 = toFrac(m[4], m[5]);
    return { color: color === "transparent" ? "rgba(0,0,0,0)" : color, pos: pos, pos2: pos2 };
  });
  var out = [];
  stops.forEach(function (s) { out.push({ color: s.color, pos: s.pos }); if (s.pos2 !== null) out.push({ color: s.color, pos: s.pos2 }); });
  if (!out.length) return out;
  if (out[0].pos === null) out[0].pos = 0;
  if (out[out.length - 1].pos === null) out[out.length - 1].pos = 1;
  var i = 0, j, k, prev;
  while (i < out.length) {                                  // evenly space the stops that have no position
    if (out[i].pos === null) {
      j = i; while (out[j].pos === null) j++;
      prev = out[i - 1].pos;
      for (k = i; k < j; k++) out[k].pos = prev + (out[j].pos - prev) * (k - i + 1) / (j - i + 1);
      i = j;
    } else i++;
  }
  var floor = -Infinity;
  out.forEach(function (s) { if (s.pos < floor) s.pos = floor; floor = s.pos; });
  return out;
}

function mixColors(a, b, t) {
  var ca = parseColor(a), cb = parseColor(b);
  if (!ca || !cb) return t < 0.5 ? a : b;
  var f = function (x, y) { return x + (y - x) * t; };
  return "rgba(" + Math.round(f(ca.r, cb.r)) + "," + Math.round(f(ca.g, cb.g)) + "," + Math.round(f(ca.b, cb.b)) + "," + f(ca.a, cb.a) + ")";
}

/** Adds `stops` (positions as fractions of the gradient line) to a canvas gradient, repeating them when asked. */
function addColorStops(grad, stops, repeat) {
  if (!stops.length) return;
  var list = stops, first = stops[0].pos, last = stops[stops.length - 1].pos, period = last - first, k, i, a, b;
  if (repeat && period > 1e-6) {
    list = [];
    for (k = -Math.ceil(first / period) - 1; first + k * period < 1; k++) for (i = 0; i < stops.length; i++) list.push({ color: stops[i].color, pos: stops[i].pos + k * period });
  }
  var clipped = [];
  for (i = 0; i < list.length; i++) {
    a = list[i];
    if (a.pos >= 0 && a.pos <= 1) {
      b = list[i - 1];
      if (!clipped.length && a.pos > 0 && b && b.pos < 0) clipped.push({ color: mixColors(b.color, a.color, (0 - b.pos) / (a.pos - b.pos)), pos: 0 });
      clipped.push(a);
    } else if (a.pos > 1) {
      b = list[i - 1];
      if (b && b.pos <= 1 && b.pos < a.pos) clipped.push({ color: mixColors(b.color, a.color, (1 - b.pos) / (a.pos - b.pos)), pos: 1 });
      break;
    }
  }
  if (!clipped.length) clipped.push({ color: list[list.length - 1].color, pos: 0 });
  clipped.forEach(function (s) { try { grad.addColorStop(Math.min(1, Math.max(0, s.pos)), s.color); } catch (e) { /* an unparsable colour is skipped */ } });
}

function gradientArgs(layer) {
  var open = layer.indexOf("("), name = layer.slice(0, open).trim();
  return { name: name, args: splitTop(layer.slice(open + 1, layer.lastIndexOf(")")), ",") };
}

function positionToken(t, base, off) {
  if (t === "left" || t === "top") return off;
  if (t === "right" || t === "bottom") return off + base;
  if (t === "center") return off + base / 2;
  return /%$/.test(t) ? off + parseFloat(t) / 100 * base : off + pxNum(t);
}

/**
 * Canvas paint for one CSS gradient layer inside the tile (x, y, w, h).
 * Returns a CanvasGradient (linear) or { radial, px, py, rx, ry } (drawn in unit space), or null if unsupported.
 */
function makeGradient(ctx, layer, x, y, w, h) {
  var g = gradientArgs(layer), args = g.args.slice(), repeat = /^repeating-/.test(g.name), cx = x + w / 2, cy = y + h / 2;
  if (/linear-gradient$/.test(g.name)) {
    var angle = 180, first = args[0] || "";
    if (/^to\s/.test(first)) {
      var side = first.replace(/^to\s+/, "").trim(), map = { top: 0, right: 90, bottom: 180, left: 270 };
      if (map[side] === undefined) return null;
      angle = map[side]; args.shift();
    } else if (/^-?[\d.]+(deg|rad|turn|grad)$/.test(first)) {
      var v = parseFloat(first);
      angle = /rad$/.test(first) ? v * 180 / Math.PI : /turn$/.test(first) ? v * 360 : /grad$/.test(first) ? v * 0.9 : v;
      args.shift();
    }
    var th = angle * Math.PI / 180, dx = Math.sin(th), dy = -Math.cos(th), len = Math.abs(w * Math.sin(th)) + Math.abs(h * Math.cos(th));
    var grad = ctx.createLinearGradient(cx - dx * len / 2, cy - dy * len / 2, cx + dx * len / 2, cy + dy * len / 2);
    addColorStops(grad, parseStops(args, len), repeat);
    return grad;
  }
  if (/radial-gradient$/.test(g.name)) {
    var head = args[0] || "", isCircle = /circle/.test(head), px = cx, py = cy;
    if (/circle|ellipse|closest|farthest|(?:^|\s)at\s|^-?[\d.]+px/.test(head)) args.shift(); else head = "";
    var at = /(?:^|\s)at\s+(.+)$/.exec(head);
    if (at) { var pp = at[1].trim().split(/\s+/); px = positionToken(pp[0], w, x); py = positionToken(pp[1] || "center", h, y); }
    var nearX = Math.min(Math.abs(px - x), Math.abs(x + w - px)), farX = Math.max(Math.abs(px - x), Math.abs(x + w - px));
    var nearY = Math.min(Math.abs(py - y), Math.abs(y + h - py)), farY = Math.max(Math.abs(py - y), Math.abs(y + h - py));
    var rx, ry, explicit = /(-?[\d.]+)px(?:\s+(-?[\d.]+)px)?/.exec(head.replace(/(?:^|\s)at\s.*$/, ""));
    if (explicit) { rx = parseFloat(explicit[1]); ry = explicit[2] !== undefined ? parseFloat(explicit[2]) : rx; }
    else if (/closest-side/.test(head)) { rx = nearX; ry = nearY; if (isCircle) rx = ry = Math.min(nearX, nearY); }
    else if (/farthest-side/.test(head)) { rx = farX; ry = farY; if (isCircle) rx = ry = Math.max(farX, farY); }
    else if (/closest-corner/.test(head)) { rx = nearX * Math.SQRT2; ry = nearY * Math.SQRT2; if (isCircle) rx = ry = Math.hypot(nearX, nearY); }
    else { rx = farX * Math.SQRT2; ry = farY * Math.SQRT2; if (isCircle) rx = ry = Math.hypot(farX, farY); }
    rx = Math.max(0.01, rx); ry = Math.max(0.01, ry);
    var rg = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    addColorStops(rg, parseStops(args, rx), repeat);
    return { radial: rg, px: px, py: py, rx: rx, ry: ry };
  }
  return null;
}

/* ------------------------------------------------------------------ the snapshot (measuring pass) */

function localRect(r, rootRect) {
  return { x: r.left - rootRect.left, y: r.top - rootRect.top, w: r.width, h: r.height };
}

/** One entry per whitespace-separated word of a text node: its text and the rectangle it occupies. */
function wordRuns(textNode, info) {
  var data = textNode.nodeValue, re = /[^\s]+/g, m, runs = [], range = document.createRange(), rects;
  while ((m = re.exec(data))) {
    range.setStart(textNode, m.index); range.setEnd(textNode, m.index + m[0].length);
    rects = range.getClientRects();
    if (rects.length) runs.push({ text: m[0], rect: localRect(rects[0], info.rootRect) });
  }
  return runs;
}

var NO_STAND_IN_PROPS = /^(content|animation|transition|counter-|will-change|--)/;
var NO_PSEUDO_TAGS = { IMG: 1, VIDEO: 1, CANVAS: 1, SVG: 1, BR: 1, INPUT: 1, IFRAME: 1, HR: 1, STYLE: 1, SCRIPT: 1 };

/** Quoted strings of a computed `content` value, joined. */
function contentText(content) {
  var out = "", re = /"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'/g, m;
  while ((m = re.exec(content))) out += (m[1] !== undefined ? m[1] : m[2]).replace(/\\(.)/g, "$1");
  return out;
}

/** Replaces every ::before / ::after in `root` (a throwaway clone) by a real element carrying the same computed style. */
function materializePseudos(root) {
  var all = [root].concat(Array.prototype.slice.call(root.querySelectorAll("*"))), jobs = [], i, w, el, cs, name, k, span;
  for (i = 0; i < all.length; i++) {
    el = all[i];
    if (NO_PSEUDO_TAGS[el.tagName.toUpperCase()] || insideInlineSvg(el)) continue;
    for (w = 0; w < 2; w++) {
      cs = window.getComputedStyle(el, w ? "::after" : "::before");
      if (!cs.content || cs.content === "none" || cs.content === "normal" || cs.display === "none") continue;
      span = document.createElement("span");
      span.setAttribute("data-cs-px", w ? "after" : "before");
      for (k = 0; k < cs.length; k++) { name = cs[k]; if (!NO_STAND_IN_PROPS.test(name)) span.style.setProperty(name, cs.getPropertyValue(name)); }
      span.textContent = contentText(cs.content);
      jobs.push({ el: el, span: span, after: !!w });
    }
  }
  if (!jobs.length) return;
  var hide = document.createElement("style");
  hide.textContent = "[data-cs-px-b]::before{content:none !important;display:none !important}[data-cs-px-a]::after{content:none !important;display:none !important}";
  root.appendChild(hide);                                     // lives and dies with the clone
  jobs.forEach(function (j) {
    j.el.setAttribute(j.after ? "data-cs-px-a" : "data-cs-px-b", "");
    if (j.after) j.el.appendChild(j.span); else j.el.insertBefore(j.span, j.el.firstChild);
  });
}

var SVG_STYLE_PROPS = ["fill", "stroke", "strokeWidth", "strokeLinecap", "strokeLinejoin", "strokeDasharray", "strokeDashoffset", "opacity",
  "fillOpacity", "strokeOpacity", "visibility", "transform", "transformOrigin", "transformBox", "display"];

/** An inline <svg> as a standalone document: computed paint properties are baked in, currentColor is resolved. */
function serializeInlineSvg(svgEl, rect) {
  var clone = svgEl.cloneNode(true), live = [svgEl].concat(Array.prototype.slice.call(svgEl.querySelectorAll("*")));
  var copy = [clone].concat(Array.prototype.slice.call(clone.querySelectorAll("*"))), i, p, cs;
  for (i = 0; i < live.length; i++) {
    cs = window.getComputedStyle(live[i]);
    for (p = 0; p < SVG_STYLE_PROPS.length; p++) copy[i].style.setProperty(cssName(SVG_STYLE_PROPS[p]), cs[SVG_STYLE_PROPS[p]]);
  }
  clone.setAttribute("width", rect.w); clone.setAttribute("height", rect.h);
  clone.style.setProperty("color", window.getComputedStyle(svgEl).color);
  clone.style.setProperty("transform", "none"); clone.style.setProperty("opacity", "1");
  if (!clone.getAttribute("xmlns")) clone.setAttribute("xmlns", NS_SVG);
  return new XMLSerializer().serializeToString(clone);
}

function snapshotNode(el, info) {
  var cs = window.getComputedStyle(el);
  if (cs.display === "none") return null;
  var tag = el.tagName.toLowerCase();
  var node = { el: el, tag: tag, cs: pickStyle(cs), inline: cs.display === "inline", rects: [], children: [], matrix: null, origin: null };
  if (cs.display !== "contents") {
    node.rects = node.inline ? Array.prototype.map.call(el.getClientRects(), function (r) { return localRect(r, info.rootRect); }) : [localRect(el.getBoundingClientRect(), info.rootRect)];
  }
  var rec = info.transforms.get(el);
  if (rec && !node.inline && node.rects[0]) { node.matrix = rec.matrix; node.origin = { x: node.rects[0].x + rec.ox, y: node.rects[0].y + rec.oy }; }
  if (tag === "svg") { node.svgMarkup = serializeInlineSvg(el, node.rects[0] || { w: 0, h: 0 }); return node; }
  if (tag === "img" || tag === "video" || tag === "canvas") { node.media = info.liveOf.get(el) || el; return node; }
  var i, kid, sub;
  for (i = 0; i < el.childNodes.length; i++) {
    kid = el.childNodes[i];
    if (kid.nodeType === 1) { sub = snapshotNode(kid, info); if (sub) node.children.push(sub); }
    else if (kid.nodeType === 3 && kid.nodeValue.trim() && cs.visibility !== "hidden") node.children.push({ runs: wordRuns(kid, info), cs: node.cs });
  }
  return node;
}

/**
 * Measures `live` on a throwaway clone: running animations are baked in, pseudo-elements become real elements, every 2D
 * transform is recorded and then neutralised so that all rectangles are layout boxes. The page itself is never modified.
 */
function takeSnapshot(live) {
  var host = document.createElement("div"), clone = live.cloneNode(true), tree, i, p, cs, m, o;
  var liveAll = [live].concat(Array.prototype.slice.call(live.querySelectorAll("*")));
  var cloneAll = [clone].concat(Array.prototype.slice.call(clone.querySelectorAll("*"))), liveOf = new Map(), animated = animatedElements(live);
  for (i = 0; i < cloneAll.length; i++) {
    liveOf.set(cloneAll[i], liveAll[i]);
    if (animated.has(liveAll[i])) {
      cs = window.getComputedStyle(liveAll[i]);
      for (p = 0; p < ANIMATED_PROPS.length; p++) cloneAll[i].style.setProperty(cssName(ANIMATED_PROPS[p]), cs[ANIMATED_PROPS[p]]);
    }
  }
  var rs = clone.style;
  rs.setProperty("position", "relative"); rs.setProperty("left", "0"); rs.setProperty("top", "0"); rs.setProperty("margin", "0");
  rs.setProperty("width", live.offsetWidth + "px"); rs.setProperty("height", live.offsetHeight + "px");
  host.setAttribute("style", "position:fixed;left:-12000px;top:0;width:" + live.offsetWidth + "px;pointer-events:none;contain:layout paint");
  host.appendChild(clone);
  document.body.appendChild(host);
  try {
    materializePseudos(clone);
    var transforms = new Map(), all = [clone].concat(Array.prototype.slice.call(clone.querySelectorAll("*")));
    for (i = 0; i < all.length; i++) {
      if (insideInlineSvg(all[i])) continue;
      cs = window.getComputedStyle(all[i]);
      if (cs.transform && cs.transform !== "none" && cs.display !== "inline") {
        m = new DOMMatrix(cs.transform); o = String(cs.transformOrigin).split(/\s+/).map(pxNum);
        transforms.set(all[i], { matrix: m, ox: o[0], oy: o[1] });
      }
    }
    transforms.forEach(function (rec, el) { el.style.setProperty("transform", "none", "important"); });
    tree = snapshotNode(clone, { rootRect: clone.getBoundingClientRect(), transforms: transforms, liveOf: liveOf });
  } finally {
    document.body.removeChild(host);
  }
  return tree;
}

/* ------------------------------------------------------------------ preloading */

function collectAssets(node, out) {
  if (!node || node.runs) return out;
  if (node.svgMarkup) out.svgs.push(node);
  if (node.media && node.tag === "img") out.imgs.push(node.media);
  var bg = node.cs.backgroundImage, re, m;
  if (bg && bg !== "none" && /url\(/.test(bg)) { re = cssUrlRe(); while ((m = re.exec(bg))) out.urls[m[2]] = 1; }
  node.children.forEach(function (c) { collectAssets(c, out); });
  return out;
}

async function preload(tree) {
  var assets = collectAssets(tree, { svgs: [], imgs: [], urls: {} }), res = { svgImages: new Map(), bgImages: new Map() }, i, keys = Object.keys(assets.urls);
  await Promise.all(assets.imgs.map(function (img) { return img.decode ? img.decode().catch(function () { /* a broken image draws nothing */ }) : Promise.resolve(); }));
  await Promise.all(assets.svgs.map(function (n) {
    return loadImage(svgDataUrl(n.svgMarkup)).then(function (img) { res.svgImages.set(n, img); }, function () { /* an unreadable svg is skipped */ });
  }));
  for (i = 0; i < keys.length; i++) {
    try { res.bgImages.set(keys[i], await loadImage(await toDataUri(keys[i]))); } catch (e) { /* background image missing: drawn without it */ }
  }
  return res;
}

/* ------------------------------------------------------------------ drawing */

function boxOf(node) { return node.rects[0] || { x: 0, y: 0, w: 0, h: 0 }; }

function drawShadows(ctx, node, rect, radii, S) {
  var sh = node.cs.boxShadow;
  if (!sh || sh === "none") return;
  var layers = splitTop(sh, ","), i, m, color, nums, colorFirst;
  for (i = layers.length - 1; i >= 0; i--) {
    colorFirst = /^(rgba?\([^)]*\)|#[0-9a-fA-F]+)\s+(.*)$/.exec(layers[i].trim());
    m = colorFirst || /^(.*?)\s+(rgba?\([^)]*\)|#[0-9a-fA-F]+)$/.exec(layers[i].trim());
    if (!m) continue;
    color = colorFirst ? m[1] : m[2];
    nums = (colorFirst ? m[2] : m[1]).split(/\s+/).map(pxNum);
    ctx.save();
    ctx.beginPath(); ctx.rect(-8000, -8000, 24000, 24000); pathInto(ctx, rect.x, rect.y, rect.w, rect.h, radii); ctx.clip("evenodd");
    ctx.shadowColor = color; ctx.shadowOffsetX = nums[0] * S; ctx.shadowOffsetY = nums[1] * S; ctx.shadowBlur = (nums[2] || 0) * S;
    ctx.fillStyle = "#000";
    roundedPath(ctx, rect.x, rect.y, rect.w, rect.h, radii); ctx.fill();
    ctx.restore();
  }
}

function bgSizeOf(sizeStr, tw, th, iw, ih) {
  var s = String(sizeStr).trim();
  if (s === "cover") { var k = Math.max(tw / iw, th / ih); return { w: iw * k, h: ih * k }; }
  if (s === "contain") { var c = Math.min(tw / iw, th / ih); return { w: iw * c, h: ih * c }; }
  var p = s.split(/\s+/), conv = function (t, base) { return t === undefined || t === "auto" ? null : /%$/.test(t) ? parseFloat(t) / 100 * base : pxNum(t); };
  var w = conv(p[0], tw), h = conv(p[1], th);
  if (w === null && h === null) return { w: iw, h: ih };
  if (w === null) w = h * iw / ih;
  if (h === null) h = w * ih / iw;
  return { w: w, h: h };
}

/** Paints one gradient tile of w x h with its corner at the origin. */
function fillGradient(ctx, layer, w, h) {
  var g = makeGradient(ctx, layer, 0, 0, w, h);
  if (!g) return;
  if (g.radial) {
    ctx.save(); ctx.translate(g.px, g.py); ctx.scale(g.rx, g.ry);
    ctx.fillStyle = g.radial; ctx.fillRect(-g.px / g.rx, -g.py / g.ry, w / g.rx, h / g.ry);
    ctx.restore();
  } else { ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); }
}

function drawBackgroundLayer(ctx, layer, rect, node, i, assets, S) {
  var cs = node.cs, sizes = splitTop(cs.backgroundSize, ","), poss = splitTop(cs.backgroundPosition, ","), reps = splitTop(cs.backgroundRepeat, ",");
  var size = sizes[i % sizes.length] || "auto", pos = poss[i % poss.length] || "0% 0%", rep = (reps[i % reps.length] || "repeat").split(/\s+/);
  var isUrl = /^url\(/.test(layer), img = null, iw = rect.w, ih = rect.h;
  if (isUrl) {
    var um = cssUrlRe().exec(layer);
    img = um && assets.bgImages.get(um[2]);
    if (!img) return;
    iw = img.naturalWidth || img.width || 1; ih = img.naturalHeight || img.height || 1;
  }
  var sz = bgSizeOf(size, rect.w, rect.h, iw, ih), pp = pos.split(/\s+/);
  var off = function (t, free) { return t === "left" || t === "top" ? 0 : t === "right" || t === "bottom" ? free : t === "center" ? free / 2 : /%$/.test(t) ? parseFloat(t) / 100 * free : pxNum(t); };
  var ox = off(pp[0] || "0%", rect.w - sz.w), oy = off(pp[1] || "50%", rect.h - sz.h), repX, repY;
  if (rep.length === 1) {
    repX = rep[0] === "repeat" || rep[0] === "repeat-x" || rep[0] === "space" || rep[0] === "round";
    repY = rep[0] === "repeat" || rep[0] === "repeat-y" || rep[0] === "space" || rep[0] === "round";
  } else { repX = rep[0] !== "no-repeat"; repY = rep[1] !== "no-repeat"; }
  if (sz.w >= rect.w - 0.01 && sz.h >= rect.h - 0.01 && ox === 0 && oy === 0) repX = repY = false;   // one tile covers the box: no pattern seams
  ctx.save();
  ctx.beginPath(); ctx.rect(rect.x, rect.y, rect.w, rect.h); ctx.clip();
  if (!repX && !repY) {
    ctx.translate(rect.x + ox, rect.y + oy);
    if (isUrl) ctx.drawImage(img, 0, 0, sz.w, sz.h); else fillGradient(ctx, layer, sz.w, sz.h);
  } else {
    var tile = makeCanvas(Math.max(1, Math.ceil(sz.w * S)), Math.max(1, Math.ceil(sz.h * S))), tctx = tile.getContext("2d", { willReadFrequently: true });
    tctx.scale(tile.width / sz.w, tile.height / sz.h);
    if (isUrl) tctx.drawImage(img, 0, 0, sz.w, sz.h); else fillGradient(tctx, layer, sz.w, sz.h);
    var pat = ctx.createPattern(tile, repX && repY ? "repeat" : repX ? "repeat-x" : "repeat-y");
    pat.setTransform(new DOMMatrix().translate(rect.x + ox, rect.y + oy).scale(sz.w / tile.width, sz.h / tile.height));
    ctx.fillStyle = pat;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  }
  ctx.restore();
}

function drawBorders(ctx, node, rect, radii) {
  var cs = node.cs, sides = ["Top", "Right", "Bottom", "Left"], w = [], c = [], s = [], i, same = true;
  for (i = 0; i < 4; i++) {
    w.push(pxNum(cs["border" + sides[i] + "Width"])); c.push(canvasColor(cs["border" + sides[i] + "Color"])); s.push(cs["border" + sides[i] + "Style"]);
    if (w[i] !== w[0] || c[i] !== c[0] || s[i] !== s[0]) same = false;
  }
  if (w.every(function (v, k) { return v === 0 || s[k] === "none" || s[k] === "hidden"; })) return;
  ctx.save();
  if (same) {
    var inset = w[0] / 2, r2 = radii && hasRadius(radii) ? radii.map(function (q) { return { h: Math.max(0, q.h - inset), v: Math.max(0, q.v - inset) }; }) : null;
    ctx.lineWidth = w[0]; ctx.strokeStyle = c[0];
    if (s[0] === "dashed") ctx.setLineDash([w[0] * 3, w[0] * 3]); else if (s[0] === "dotted") ctx.setLineDash([w[0], w[0]]);
    roundedPath(ctx, rect.x + inset, rect.y + inset, rect.w - w[0], rect.h - w[0], r2);
    ctx.stroke();
  } else {
    if (w[0] > 0) { ctx.fillStyle = c[0]; ctx.fillRect(rect.x, rect.y, rect.w, w[0]); }
    if (w[1] > 0) { ctx.fillStyle = c[1]; ctx.fillRect(rect.x + rect.w - w[1], rect.y, w[1], rect.h); }
    if (w[2] > 0) { ctx.fillStyle = c[2]; ctx.fillRect(rect.x, rect.y + rect.h - w[2], rect.w, w[2]); }
    if (w[3] > 0) { ctx.fillStyle = c[3]; ctx.fillRect(rect.x, rect.y, w[3], rect.h); }
  }
  ctx.restore();
}

function drawBox(ctx, node, rect, assets, S) {
  var cs = node.cs;
  if (cs.visibility === "hidden") return;
  var radii = node.inline ? null : cornerRadii(cs, rect.w, rect.h);
  drawShadows(ctx, node, rect, radii, S);
  var hasBg = !isTransparent(cs.backgroundColor), layers = cs.backgroundImage && cs.backgroundImage !== "none" ? splitTop(cs.backgroundImage, ",") : [], i;
  if (hasBg || layers.length) {
    ctx.save();
    roundedPath(ctx, rect.x, rect.y, rect.w, rect.h, radii); ctx.clip();
    if (hasBg) { ctx.fillStyle = canvasColor(cs.backgroundColor); ctx.fillRect(rect.x, rect.y, rect.w, rect.h); }
    for (i = layers.length - 1; i >= 0; i--) drawBackgroundLayer(ctx, layers[i], rect, node, i, assets, S);
    ctx.restore();
  }
  drawBorders(ctx, node, rect, radii);
}

/** One word of text, drawn at the rectangle the browser laid it out in. */
function drawRun(ctx, run, cs, S) {
  var rtl = cs.direction === "rtl", fill = cs.webkitTextFillColor || cs.color;
  ctx.font = cs.fontStyle + " " + cs.fontWeight + " " + cs.fontSize + " " + cs.fontFamily;
  ctx.direction = rtl ? "rtl" : "ltr";
  ctx.textAlign = rtl ? "right" : "left";
  ctx.textBaseline = "alphabetic";
  try { ctx.fontKerning = cs.fontKerning === "none" ? "none" : "normal"; } catch (e) { /* older engines */ }
  var m = ctx.measureText(run.text), asc = m.fontBoundingBoxAscent !== undefined ? m.fontBoundingBoxAscent : pxNum(cs.fontSize) * 0.9;
  var x = rtl ? run.rect.x + run.rect.w : run.rect.x, y = run.rect.y + asc;
  if (cs.textShadow && cs.textShadow !== "none") {
    var sm = /^(rgba?\([^)]*\))\s+(.*)$/.exec(cs.textShadow.trim());
    if (sm) { var n = sm[2].split(/\s+/).map(pxNum); ctx.shadowColor = sm[1]; ctx.shadowOffsetX = n[0] * S; ctx.shadowOffsetY = n[1] * S; ctx.shadowBlur = (n[2] || 0) * S; }
  }
  if (!isTransparent(fill)) { ctx.fillStyle = canvasColor(fill); ctx.fillText(run.text, x, y); }
  ctx.shadowColor = "transparent"; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
  var sw = pxNum(cs.webkitTextStrokeWidth);
  if (sw > 0) { ctx.lineWidth = sw; ctx.strokeStyle = canvasColor(cs.webkitTextStrokeColor); ctx.lineJoin = "miter"; ctx.miterLimit = 10; ctx.strokeText(run.text, x, y); }
  var line = cs.textDecorationLine;
  if (line && line !== "none") {
    var fs = pxNum(cs.fontSize);
    var thick = !cs.textDecorationThickness || cs.textDecorationThickness === "auto" || cs.textDecorationThickness === "from-font" ? Math.max(1, fs / 14) : pxNum(cs.textDecorationThickness);
    var gap = !cs.textUnderlineOffset || cs.textUnderlineOffset === "auto" ? fs * 0.1 : pxNum(cs.textUnderlineOffset);
    ctx.fillStyle = canvasColor(cs.textDecorationColor || cs.color);
    if (/underline/.test(line)) ctx.fillRect(run.rect.x, y + gap, run.rect.w, thick);
    if (/line-through/.test(line)) ctx.fillRect(run.rect.x, run.rect.y + run.rect.h * 0.55, run.rect.w, thick);
    if (/overline/.test(line)) ctx.fillRect(run.rect.x, run.rect.y, run.rect.w, thick);
  }
}

function drawMedia(ctx, node, rect) {
  var el = node.media, cs = node.cs, iw = el.naturalWidth || el.videoWidth || el.width, ih = el.naturalHeight || el.videoHeight || el.height;
  if (!iw || !ih) return;
  var fit = cs.objectFit || "fill", dw = rect.w, dh = rect.h, k;
  if (fit === "cover") { k = Math.max(rect.w / iw, rect.h / ih); dw = iw * k; dh = ih * k; }
  else if (fit === "contain" || fit === "scale-down") { k = Math.min(rect.w / iw, rect.h / ih); if (fit === "scale-down") k = Math.min(1, k); dw = iw * k; dh = ih * k; }
  else if (fit === "none") { dw = iw; dh = ih; }
  var pos = String(cs.objectPosition || "50% 50%").split(/\s+/), conv = function (t, free) { return /%$/.test(t) ? parseFloat(t) / 100 * free : pxNum(t); };
  var dx = rect.x + conv(pos[0], rect.w - dw), dy = rect.y + conv(pos[1] || "50%", rect.h - dh);
  ctx.save();
  roundedPath(ctx, rect.x, rect.y, rect.w, rect.h, cornerRadii(cs, rect.w, rect.h)); ctx.clip();
  try { ctx.drawImage(el, dx, dy, dw, dh); }
  catch (e) { throw csError("E_PAINT_TAINTED", "A media element could not be drawn (cross-origin).", {}); }
  ctx.restore();
}

/** clip-path: inset(t r b l) in the element's border box -> rectangle, or null. */
function parseInset(cp, rect) {
  var m = /^inset\(([^)]*)\)/.exec(cp);
  if (!m) return null;
  var t = m[1].replace(/\s+round\s.*$/, "").trim().split(/\s+/);
  var top = t[0], right = t.length > 1 ? t[1] : t[0], bottom = t.length > 2 ? t[2] : t[0], left = t.length > 3 ? t[3] : right;
  var conv = function (s, base) { return /%$/.test(s) ? parseFloat(s) / 100 * base : pxNum(s); };
  var T = conv(top, rect.h), R = conv(right, rect.w), B = conv(bottom, rect.h), L = conv(left, rect.w);
  return { x: rect.x + L, y: rect.y + T, w: rect.w - L - R, h: rect.h - T - B };
}

function groupBounds(node, acc) {
  var grow = function (r) {
    if (!r) return;
    acc.x0 = Math.min(acc.x0, r.x); acc.y0 = Math.min(acc.y0, r.y); acc.x1 = Math.max(acc.x1, r.x + r.w); acc.y1 = Math.max(acc.y1, r.y + r.h);
  };
  if (node.runs) { node.runs.forEach(function (r) { grow(r.rect); }); return acc; }
  node.rects.forEach(grow);
  node.children.forEach(function (c) { groupBounds(c, acc); });
  return acc;
}

/** Which paint layer a child belongs to (see paintChildren). */
function layerOf(node) {
  if (node.runs) return { layer: "flow", z: 0 };
  var cs = node.cs, z = cs.zIndex === "auto" ? null : parseInt(cs.zIndex, 10) || 0;
  var layered = cs.position !== "static" || node.matrix || parseFloat(cs.opacity) < 1 || (z !== null && z !== 0);
  if (z !== null && z < 0) return { layer: "neg", z: z };
  if (z !== null && z > 0) return { layer: "pos", z: z };
  return { layer: layered ? "top" : "flow", z: 0 };
}

/**
 * CSS painting order inside a stacking context, simplified: negative z-index, then in-flow content and text in document
 * order, then positioned / z-index 0 / stacking-context children in document order, then positive z-index.
 */
function paintChildren(ctx, node, assets, S, opts) {
  var layers = { neg: [], flow: [], top: [], pos: [] };
  node.children.forEach(function (c, idx) {
    var l = layerOf(c);
    layers[l.layer].push({ c: c, idx: idx, z: l.z });
  });
  var byZ = function (a, b) { return a.z - b.z || a.idx - b.idx; };
  layers.neg.sort(byZ); layers.pos.sort(byZ);
  [layers.neg, layers.flow, layers.top, layers.pos].forEach(function (list) {
    list.forEach(function (e) {
      if (e.c.runs) { if (!opts.skipText) e.c.runs.forEach(function (run) { drawRun(ctx, run, e.c.cs, S); }); }
      else drawNode(ctx, e.c, assets, S, opts);
    });
  });
}

function drawContent(ctx, node, assets, S, opts) {
  var i;
  for (i = 0; i < node.rects.length; i++) { drawBox(ctx, node, node.rects[i], assets, S); if (!node.inline) break; }
  if (node.media) { drawMedia(ctx, node, boxOf(node)); return; }
  if (node.svgMarkup) { var simg = assets.svgImages.get(node), sr = boxOf(node); if (simg) ctx.drawImage(simg, sr.x, sr.y, sr.w, sr.h); return; }
  paintChildren(ctx, node, assets, S, opts);
}

function drawNode(ctx, node, assets, S, opts) {
  var cs = node.cs, op = parseFloat(cs.opacity);
  if (cs.display === "none" || op === 0) return;
  var rect = boxOf(node);
  ctx.save();
  if (node.matrix && node.origin) {
    var m = node.matrix;
    ctx.translate(node.origin.x, node.origin.y); ctx.transform(m.a, m.b, m.c, m.d, m.e, m.f); ctx.translate(-node.origin.x, -node.origin.y);
  }
  if (cs.clipPath && cs.clipPath !== "none") {
    var ci = parseInset(cs.clipPath, rect);
    if (ci) { ctx.beginPath(); ctx.rect(ci.x, ci.y, Math.max(0, ci.w), Math.max(0, ci.h)); ctx.clip(); }
  }
  if ((cs.overflowX !== "visible" || cs.overflowY !== "visible") && !node.inline && !node.media && !node.svgMarkup) {
    var bl = pxNum(cs.borderLeftWidth), bt = pxNum(cs.borderTopWidth);
    ctx.beginPath(); ctx.rect(rect.x + bl, rect.y + bt, rect.w - bl - pxNum(cs.borderRightWidth), rect.h - bt - pxNum(cs.borderBottomWidth)); ctx.clip();
  }
  if (op < 1) {                                    // group opacity: draw the whole subtree once, composite once
    var b = groupBounds(node, { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }), pad = 8;
    if (isFinite(b.x0)) {
      var bx = Math.floor(b.x0 - pad), by = Math.floor(b.y0 - pad), bw = Math.ceil(b.x1 + pad) - bx, bh = Math.ceil(b.y1 + pad) - by;
      var layer = makeCanvas(bw * S, bh * S), lctx = layer.getContext("2d", { willReadFrequently: true });
      lctx.scale(S, S); lctx.translate(-bx, -by);
      drawContent(lctx, node, assets, S, opts);
      ctx.globalAlpha = op;
      ctx.drawImage(layer, bx, by, bw, bh);
    }
  } else drawContent(ctx, node, assets, S, opts);
  ctx.restore();
}

/** Paints `el` onto `canvas` with the replay painter. geom: { scale, sx, sy } in output pixels. */
async function replayDraw(el, canvas, geom, opts) {
  var check = replaySupportCheck(el);
  if (!check.ok) throw csError("E_PAINT_UNSUPPORTED", "The replay painter does not support: " + check.unsupported.join(", "), { unsupported: check.unsupported });
  var tree = takeSnapshot(el), assets = await preload(tree), ctx = canvas.getContext("2d");
  ctx.save();
  ctx.setTransform(geom.scale, 0, 0, geom.scale, -geom.sx, -geom.sy);
  drawNode(ctx, tree, assets, geom.scale, opts || {});
  ctx.restore();
}

  /* ---- file: metrics.js ---- */
/*
 * CS.paint.metrics · image similarity used by the loop gate (V1), the painter parity tests and the goldens.
 *
 *   ssim(a, b)  structural similarity of the luma channel, mean over 8x8 windows moved in steps of 4
 *               (Wang et al. 2004: K1 = 0.01, K2 = 0.03, L = 255); 1 means identical.
 *   psnr(a, b)  peak signal-to-noise ratio over R, G and B in dB, capped at 100 for identical images.
 */

function pixelsOf(canvas) {
  return canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height);
}

function lumaOf(canvas, maxWidth) {
  var c = canvas;
  if (maxWidth && canvas.width > maxWidth) c = downscaleCanvas(canvas, maxWidth, Math.max(1, Math.round(canvas.height * maxWidth / canvas.width)));
  var img = pixelsOf(c), d = img.data, n = c.width * c.height, y = new Float32Array(n), i;
  for (i = 0; i < n; i++) y[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
  return { w: c.width, h: c.height, y: y };
}

function ssimOf(a, b, opts) {
  opts = opts || {};
  var A = lumaOf(a, opts.downscaleTo), B = lumaOf(b, opts.downscaleTo);
  if (A.w !== B.w || A.h !== B.h) throw csError("E_USAGE", "ssim needs two canvases of the same size.");
  var win = 8, step = 4, C1 = 6.5025, C2 = 58.5225, w = A.w, h = A.h, sum = 0, count = 0, x, y, i, j, xi, ya, yb, ma, mb, va, vb, cov, n = win * win;
  for (y = 0; y + win <= h; y += step) {
    for (x = 0; x + win <= w; x += step) {
      ma = 0; mb = 0;
      for (j = 0; j < win; j++) { xi = (y + j) * w + x; for (i = 0; i < win; i++) { ma += A.y[xi + i]; mb += B.y[xi + i]; } }
      ma /= n; mb /= n; va = 0; vb = 0; cov = 0;
      for (j = 0; j < win; j++) {
        xi = (y + j) * w + x;
        for (i = 0; i < win; i++) { ya = A.y[xi + i] - ma; yb = B.y[xi + i] - mb; va += ya * ya; vb += yb * yb; cov += ya * yb; }
      }
      va /= n - 1; vb /= n - 1; cov /= n - 1;
      sum += ((2 * ma * mb + C1) * (2 * cov + C2)) / ((ma * ma + mb * mb + C1) * (va + vb + C2));
      count++;
    }
  }
  return count ? sum / count : 1;
}

function psnrOf(a, b) {
  if (a.width !== b.width || a.height !== b.height) throw csError("E_USAGE", "psnr needs two canvases of the same size.");
  var da = pixelsOf(a).data, db = pixelsOf(b).data, n = a.width * a.height, i, e, mse = 0;
  for (i = 0; i < n; i++) {
    e = da[i * 4] - db[i * 4]; mse += e * e;
    e = da[i * 4 + 1] - db[i * 4 + 1]; mse += e * e;
    e = da[i * 4 + 2] - db[i * 4 + 2]; mse += e * e;
  }
  mse /= n * 3;
  return mse === 0 ? 100 : Math.min(100, 10 * Math.log10(65025 / mse));
}

  /* ---- file: png.js ---- */
/*
 * CS.paint · PNG writer.
 *
 * The browser's own PNG encoder writes RGBA (colour type 6) for a CPU-backed canvas and RGB for a GPU-backed one, and it varies
 * between engines. CONTRACT 4.5 wants one thing everywhere: 8-bit RGB, no alpha channel, no metadata, the same bytes for the same
 * pixels. So the pixels are read back and written here: IHDR, one IDAT, IEND.
 * Compression is the browser's own zlib (CompressionStream "deflate", which is exactly the zlib wrapper PNG needs); a browser
 * without it gets stored blocks, which is bigger but still a valid, alpha-free PNG.
 */

var crcTable = null;

function pngCrcTable() {
  if (crcTable) return crcTable;
  crcTable = new Uint32Array(256);
  for (var n = 0, c, k; n < 256; n++) {
    c = n;
    for (k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    crcTable[n] = c >>> 0;
  }
  return crcTable;
}

function pngCrc(bytes, start, end) {
  var t = pngCrcTable(), c = 0xFFFFFFFF, i;
  for (i = start; i < end; i++) c = t[(c ^ bytes[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function pngAdler(bytes) {
  var a = 1, b = 0, i = 0, end, n = bytes.length;
  while (i < n) {
    end = Math.min(i + 5552, n);
    for (; i < end; i++) { a += bytes[i]; b += a; }
    a %= 65521; b %= 65521;
  }
  return ((b << 16) | a) >>> 0;
}

function pngChunk(type, data) {
  var out = new Uint8Array(12 + data.length), dv = new DataView(out.buffer), i;
  dv.setUint32(0, data.length);
  for (i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  dv.setUint32(8 + data.length, pngCrc(out, 4, 8 + data.length));
  return out;
}

/** Scanlines of an RGBA image as 8-bit RGB with a per-row filter (None, Sub or Up, whichever sums smallest). */
function pngScanlines(rgba, w, h) {
  var stride = w * 3, out = new Uint8Array(h * (stride + 1)), cur = new Uint8Array(stride), prev = new Uint8Array(stride), swap;
  var y, i, j, o, v, left, sNone, sSub, sUp, type;
  for (y = 0; y < h; y++) {
    j = y * w * 4;
    for (i = 0; i < stride; i += 3, j += 4) { cur[i] = rgba[j]; cur[i + 1] = rgba[j + 1]; cur[i + 2] = rgba[j + 2]; }
    sNone = 0; sSub = 0; sUp = 0;
    for (i = 0; i < stride; i++) {
      v = cur[i]; sNone += v < 128 ? v : 256 - v;
      left = i >= 3 ? cur[i - 3] : 0;
      v = (cur[i] - left) & 255; sSub += v < 128 ? v : 256 - v;
      v = (cur[i] - prev[i]) & 255; sUp += v < 128 ? v : 256 - v;
    }
    type = sUp <= sSub && sUp <= sNone ? 2 : sSub <= sNone ? 1 : 0;
    o = y * (stride + 1);
    out[o++] = type;
    if (type === 0) out.set(cur, o);
    else if (type === 1) for (i = 0; i < stride; i++) out[o + i] = (cur[i] - (i >= 3 ? cur[i - 3] : 0)) & 255;
    else for (i = 0; i < stride; i++) out[o + i] = (cur[i] - prev[i]) & 255;
    swap = prev; prev = cur; cur = swap;
  }
  return out;
}

/** zlib stream made of stored (uncompressed) deflate blocks. */
function zlibStored(raw) {
  var blocks = Math.max(1, Math.ceil(raw.length / 65535)), out = new Uint8Array(2 + raw.length + blocks * 5 + 4), dv = new DataView(out.buffer), o = 2, p = 0, len, last;
  out[0] = 0x78; out[1] = 0x01;
  while (p < raw.length || o === 2) {
    len = Math.min(65535, raw.length - p);
    last = p + len >= raw.length ? 1 : 0;
    out[o++] = last; out[o++] = len & 255; out[o++] = len >> 8; out[o++] = ~len & 255; out[o++] = (~len >> 8) & 255;
    out.set(raw.subarray(p, p + len), o);
    o += len; p += len;
    if (last) break;
  }
  dv.setUint32(o, pngAdler(raw));
  return out.subarray(0, o + 4);
}

async function zlibCompress(raw) {
  if (typeof CompressionStream === "function" && typeof Blob === "function" && typeof Response === "function") {
    try {
      var stream = new Blob([raw]).stream().pipeThrough(new CompressionStream("deflate"));
      return new Uint8Array(await new Response(stream).arrayBuffer());
    } catch (e) { /* fall through to stored blocks */ }
  }
  return zlibStored(raw);
}

/** Bytes of an 8-bit RGB PNG of the canvas, or null when the canvas has no readable 2D context (the caller then uses the browser's encoder). */
async function encodePngRgb(canvas) {
  var ctx = canvas.getContext("2d");
  if (!ctx) return null;
  var w = canvas.width, h = canvas.height, img;
  try { img = ctx.getImageData(0, 0, w, h); }
  catch (e) { throw csError("E_PAINT_TAINTED", "The canvas is tainted and cannot be exported.", { cause: String(e && e.message || e) }); }
  var z = await zlibCompress(pngScanlines(img.data, w, h)), head = new Uint8Array(13), dv = new DataView(head.buffer);
  dv.setUint32(0, w); dv.setUint32(4, h);
  head[8] = 8; head[9] = 2; head[10] = 0; head[11] = 0; head[12] = 0;       // 8-bit, RGB, deflate, adaptive filter, no interlace
  var parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk("IHDR", head), pngChunk("IDAT", z), pngChunk("IEND", new Uint8Array(0))];
  var out = new Uint8Array(parts.reduce(function (n, p) { return n + p.length; }, 0)), o = 0;
  parts.forEach(function (p) { out.set(p, o); o += p.length; });
  return out;
}

  /* ---- file: api.js ---- */
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
})();
