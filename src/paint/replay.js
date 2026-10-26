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
