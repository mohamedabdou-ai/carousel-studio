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
