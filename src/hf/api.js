/*
 * CS.motion.hf · public API of the cover timeline runtime (CONTRACT 4.6, 5.8).
 *
 *   install()        evaluate a Timeline on a slide and register it for HyperFrames (window.__timelines[id])
 *   composition()    the exported cover.hf.html: slide DOM + CSS + fonts + timeline + this runtime, one file
 *   runtimeSource()  the runtime's own source text (what the composition inlines)
 * The engine itself lives in runtime.js as a single function so that its text can be shipped inside the composition.
 */

var HF = hfRuntime(window, document);
var OPEN = "<" + "!--";                  // an HTML comment opener may not appear literally in a chunk that is inlined in a <script> element

function hfError(code, message, detail) {
  var E = CS.CSError;
  if (E) return new E(code, message, detail);
  var e = new Error(message || code);
  e.code = code;
  if (detail !== undefined) e.detail = detail;
  return e;
}

/** Source text of the runtime: running it defines CS.motion.hf (engine + install) in a page that has no other CS code. */
function runtimeSource() {
  return "window.CS = window.CS || {};\nCS.motion = CS.motion || {};\nCS.motion.hf = (" + hfRuntime.toString() + ")(window, document);\n";
}

function templateText() {
  var el = document.getElementById("cs-hf-template");
  if (!el) throw hfError("E_DEP_LOAD", "The cover composition template (#cs-hf-template) is not part of this page.");
  return (el.textContent || "").replace(/<\\\//g, "</");           // build_studio.py stores every "</" as "<\/"
}

function jsonForScript(value) {
  return JSON.stringify(value).replace(/<\//g, "<\\/").replace(new RegExp(OPEN, "g"), "<\\u0021--").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}

function fillMarker(text, marker, value) { return text.split(marker).join(value); }

/** The font families an @font-face stylesheet embeds, in order, for the licence header ("--" is not allowed inside an HTML comment). */
function embeddedFamilies(css) {
  var seen = {}, out = [], re = /font-family:\s*"([^"]+)"/g, m;
  while ((m = re.exec(css))) { if (!seen[m[1]]) { seen[m[1]] = 1; out.push(m[1]); } }
  return out.join(", ").replace(/--+/g, "-") || "none";
}

/**
 * The cover as one HyperFrames composition file. `slideEl` must be the finished (poster) slide: the composition
 * shows it at frame 0 and again at the last frame. Fonts, CSS and images are embedded; there is no network access.
 */
async function composition(args) {
  var slideEl = args.slideEl, timeline = args.timeline, variant = args.variant === "4x5" ? "4x5" : "3x4", id = args.id || "cs-cover";
  var template = templateText(), clone = slideEl.cloneNode(true), i, ov;
  ov = clone.querySelectorAll("[data-m-ov]");
  for (i = 0; i < ov.length; i++) ov[i].parentNode.removeChild(ov[i]);
  clone.removeAttribute("contenteditable");
  Array.prototype.forEach.call(clone.querySelectorAll("[contenteditable]"), function (n) { n.removeAttribute("contenteditable"); });
  await CS.paint.inline(clone);
  var families = args.tokens && args.tokens.fonts && args.tokens.fonts.length ? args.tokens.fonts : CS.paint.usedFamilies(slideEl);
  var fonts = args.embedFonts === false ? "" : CS.paint.fontCss(families);
  var h = variant === "4x5" ? 1350 : 1440, offset = variant === "4x5" ? -45 : 0;
  var out = template;
  out = fillMarker(out, OPEN + "CS:FONTS-->", fonts);
  // the HyperFrames linter reserves `data-layer`; the composition is a derived copy, so the hook is renamed there (markup and CSS alike)
  out = fillMarker(out, OPEN + "CS:CSS-->", CS.paint.slideCss(slideEl).replace(/\[data-layer/g, "[data-cs-layer"));
  out = fillMarker(out, OPEN + "CS:SLIDE-->", clone.outerHTML.replace(/\sdata-layer=/g, " data-cs-layer="));
  out = fillMarker(out, OPEN + "CS:TIMELINE-->", jsonForScript(timeline));
  out = fillMarker(out, OPEN + "CS:RUNTIME-->", runtimeSource().replace(/<\/script/gi, "<\\/script"));
  out = fillMarker(out, "{{CS_FONT_FAMILIES}}", embeddedFamilies(fonts));
  out = fillMarker(out, "{{CS_ID}}", id);
  out = fillMarker(out, "{{CS_DURATION}}", String(timeline.duration));
  out = fillMarker(out, "{{CS_WIDTH}}", "1080");
  out = fillMarker(out, "{{CS_HEIGHT}}", String(h));
  out = fillMarker(out, "{{CS_OFFSET_Y}}", String(offset));
  out = fillMarker(out, "{{CS_LANG}}", slideEl.getAttribute("lang") || "ar");
  out = fillMarker(out, "{{CS_DIR}}", slideEl.getAttribute("dir") || "rtl");
  return out;
}

CS.motion = CS.motion || {};
CS.motion.hf = {
  VERSION: HF.VERSION,
  engine: HF,
  install: HF.install,
  composition: composition,
  runtimeSource: runtimeSource
};
