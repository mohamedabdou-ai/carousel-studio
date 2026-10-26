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
