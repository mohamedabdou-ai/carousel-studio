/* ui/serialize.js · turn the running page back into publishable HTML.
 *
 * The page never serialises its live DOM (it holds mounted UI, painted slides and host-injected nodes). It re-emits only the
 * blocks that build_studio.py wrote, found by id, and swaps the JSON data blocks for the current state. Publishing sends the
 * document in the shape the Artifact tool itself publishes, so a later publish from Claude replaces it instead of nesting it. */

var PAGE_TITLE = "كاروسيل ستوديو";
var FALLBACK_RESET = ":root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}" +
  "body{margin:0;font:14px/1.5 system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}";

/** Blocks written by build_studio.py, in document order. Titles and metas are re-created from constants. */
var SRC_SELECTOR = [
  "#cs-early", "#cs-studio-css", "#cs-icons", "#cs-app", "#cs-fonts", "#cs-archetype-css", "style[data-cs-decor]",
  "template[data-archetype]", 'script[type="application/json"][id^="cs-"]', "#cs-hf-template", 'script[id^="cs-chunk-"]', "#cs-boot"
].join(",");

var bootSnapshot = null;   // {attrs, html} of the loading placeholder, captured before the first mount replaces it

function htmlComment(text) { return "<" + "!-- " + text + " --" + ">"; }

var NOTICE_TEXT = "Carousel Studio, Apache-2.0. Fonts: SIL OFL 1.1. Icons: Lucide, ISC; Feather and Tabler, MIT. MP4 muxing: mediabunny, MPL-2.0 (loaded only when a video is exported).";

/** JSON that is safe inside an application/json script block (CONTRACT 8.4): a closing tag, an HTML comment opener and the two Unicode line separators are escaped. */
function jsonForScript(value) {
  return JSON.stringify(value)
    .replace(/<\//g, "<\\/")
    .replace(new RegExp("<" + "!--", "g"), "<\\u0021--")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function readJsonBlock(id) {
  var n = document.getElementById(id);
  if (!n) return null;
  try { return JSON.parse(n.textContent); } catch (e) { return null; }
}

function jsonBlock(id, value) {
  return '<script type="application/json" id="' + id + '">' + jsonForScript(value) + "</scr" + "ipt>";
}

function skeletonReset() {
  var styles = document.head ? document.head.querySelectorAll("style") : [];
  for (var i = 0; i < styles.length; i++) {
    var x = styles[i].textContent || "";
    if (x.indexOf("[hidden]") >= 0 && x.indexOf("safe-area-inset") >= 0) return x;
  }
  return FALLBACK_RESET;
}

function captureBoot(root) {
  if (bootSnapshot || !root) return;
  bootSnapshot = { dir: root.getAttribute("dir") || "rtl", lang: root.getAttribute("lang") || "ar", html: root.innerHTML };
}

function appShell() {
  var b = bootSnapshot || { dir: "rtl", lang: "ar", html: "" };
  return '<div id="cs-app" class="ui-app" dir="' + b.dir + '" lang="' + b.lang + '">' + b.html + "</div>";
}

/**
 * Re-emit the page. over: {spec, brand, config} replace the matching JSON blocks; opts.creditFree drops the about.* strings.
 * Returns the page fragment the Artifact tool expects (title, meta, style, content).
 */
function pageFragment(over, opts) {
  over = over || {};
  opts = opts || {};
  var out = ["<title>" + esc(document.title || PAGE_TITLE) + "</title>", '<meta name="claude:viewport-fit-sides" content="cover">', htmlComment(NOTICE_TEXT)];
  var nodes = document.querySelectorAll(SRC_SELECTOR);
  Array.prototype.forEach.call(nodes, function (n) {
    var id = n.id;
    if (id === "cs-app") { out.push(appShell()); return; }
    if (id === "cs-spec" && over.spec) { out.push(jsonBlock("cs-spec", over.spec)); return; }
    if (id === "cs-brand" && over.brand !== undefined) { out.push(jsonBlock("cs-brand", over.brand)); return; }
    if (id === "cs-config") {
      var cfg = clone(over.config || readJsonBlock("cs-config") || {});
      if (opts.creditFree) cfg.creditFree = true;
      out.push(jsonBlock("cs-config", cfg));
      return;
    }
    if (id === "cs-ui-strings" && opts.creditFree) {
      var doc = readJsonBlock("cs-ui-strings");
      if (doc && doc.strings) {
        Object.keys(doc.strings).forEach(function (k) { if (k.indexOf("about.") === 0) delete doc.strings[k]; });
        out.push(jsonBlock("cs-ui-strings", doc));
        return;
      }
    }
    out.push(n.outerHTML);
  });
  return out.join("\n");
}

/** Wrap a fragment in the document skeleton the Artifact tool publishes (no whitespace between the head tags). */
function wrapDocument(fragment) {
  return "<!doctype html><html><head><meta charset=utf8><meta name=viewport content=\"width=device-width,initial-scale=1,viewport-fit=cover\"><style>" +
    skeletonReset() + "</style></head><body>" + fragment + "</body></html>";
}

/** The Studio page with its spec replaced, credits kept. Used by save(). */
function serializeForPublish(spec) {
  return wrapDocument(pageFragment({ spec: spec }));
}

/** Credit-free copy of the running Studio (no [data-cs-credit] nodes, no about.* strings). Goes into the kit as studio-source.html. */
function serializeSource() {
  var current = CS.ui.current && CS.ui.current.getSpec ? CS.ui.current.getSpec() : null;
  return wrapDocument(pageFragment(current ? { spec: current } : {}, { creditFree: true }));
}

/** Brand Home counterpart of serializeForPublish. */
function serializeBrandHome(brand, extra) {
  var over = { brand: brand };
  if (extra && extra.config) over.config = extra.config;
  return wrapDocument(pageFragment(over));
}

/* ---- patches ---------------------------------------------------------------------------------------------------- */

/** Minimal top-level diff, used only when CS.core.patch is not available. */
function fallbackDiff(a, b) {
  var ops = [];
  Object.keys(b).forEach(function (k) {
    if (!(k in a)) ops.push({ op: "add", path: "/" + k, value: b[k] });
    else if (!same(a[k], b[k])) ops.push({ op: "replace", path: "/" + k, value: b[k] });
  });
  Object.keys(a).forEach(function (k) { if (!(k in b)) ops.push({ op: "remove", path: "/" + k }); });
  return ops;
}

/** JSON-patch operations that turn base into next (arrays by index, objects by key). */
function diffSpec(base, next) {
  var patch = guard("patch.diff", function () { return CS.core.patch.diff(base, next); }, null);
  return patch || fallbackDiff(base, next);
}

/** Envelope the user pastes into the chat (CONTRACT 8.6 C). */
function patchEnvelope(base, ops) {
  var env = guard("patch.envelope", function () { return CS.core.patch.envelope(base, ops); }, null);
  if (env) return env;
  return { carouselStudioPatch: 1, specId: base.id, baseRev: base.rev, patch: [{ op: "test", path: "/rev", value: base.rev }].concat(ops) };
}
