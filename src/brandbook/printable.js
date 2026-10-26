/* brandbook/printable.js · a standalone, credit-free HTML copy of the Brand Book (print it to PDF from any browser).
 * window.print() is blocked inside artifacts, so the book leaves the page as a file the user opens locally. */

function b64(bytes) {
  var s = "", step = 0x8000;
  for (var i = 0; i < bytes.length; i += step) s += String.fromCharCode.apply(null, bytes.subarray(i, i + step));
  return btoa(s);
}

/** Paint a rendered demo slide to a PNG data URI so the printable copy can show it without the Studio runtime. */
function capture(slideEl, rec) {
  if (!(CS.paint && CS.paint.raster) || !slideEl) return;
  CS.paint.raster(slideEl, { type: "png", paintScale: 1 }).then(function (r) { rec.uri = "data:image/png;base64," + b64(r.bytes); }, function () { /* the slide stays a placeholder */ });
}

/** The @font-face rules of the families the book uses, taken from the page's embedded font block. */
function usedFontFaces(families) {
  var node = document.getElementById("cs-fonts");
  if (!node) return "";
  var wanted = families.filter(Boolean);
  var rules = node.textContent.match(/@font-face\s*\{[^}]*\}/g) || [];
  return rules.filter(function (r) {
    var m = /font-family:\s*["']?([^;"']+)["']?/.exec(r);
    return m && wanted.indexOf(m[1].trim()) >= 0;
  }).join("\n");
}

function printableHtml(el, brand, theme, state) {
  var copy = el.cloneNode(true);
  copy.querySelectorAll(".bb-fontrow").forEach(function (n) { n.remove(); });
  var live = el.querySelectorAll(".bb-frame");
  copy.querySelectorAll(".bb-frame").forEach(function (f, i) {
    var rec = state.slides.filter(function (s) { return s.frame === live[i]; })[0];
    if (rec && rec.uri) f.replaceWith(U.h("img", { class: "bb-slideimg", src: rec.uri, alt: "" }));
    else f.remove();
  });
  var faces = usedFontFaces([theme.display, theme.body, theme.latin]);
  var dir = U.uiDir(), lang = U.uiLang();
  return "<!doctype html><html lang=\"" + lang + "\" dir=\"" + dir + "\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>" +
    U.esc(brand.name) + "</title><style>" + faces + "\n" + BB_CSS + "\nbody{margin:0;padding:clamp(12px,3vw,32px);background:" + theme.roles.bg + "}</style></head><body>" + copy.outerHTML + "</body></html>";
}
