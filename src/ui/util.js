/* ui/util.js · DOM, text and storage helpers shared by the Studio and Brand Home shells.
 * Plain ES2020, no modules: every file of this chunk shares one IIFE scope (CONTRACT 4.0). */

CS.ui = CS.ui || {};

var SVGNS = "http://www.w3.org/2000/svg";
var FORM_PROPS = { value: 1, checked: 1, disabled: 1, selected: 1, hidden: 1, indeterminate: 1, readOnly: 1 };

/** Create an element: h("button", {class: "ui-btn", onclick: fn}, child, [children], "text"). */
function h(tag, attrs) {
  var el = document.createElement(tag);
  var i = 2;
  if (attrs !== undefined && attrs !== null && (typeof attrs !== "object" || attrs.nodeType || Array.isArray(attrs))) {
    i = 1;
    attrs = null;
  }
  if (attrs) {
    Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === undefined || v === null || v === false) return;
      if (k === "class") el.className = Array.isArray(v) ? v.filter(Boolean).join(" ") : v;
      else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
      else if (k === "dataset") Object.keys(v).forEach(function (d) { if (v[d] !== null && v[d] !== undefined) el.dataset[d] = v[d]; });
      else if (k === "html") el.innerHTML = v;
      else if (k === "text") el.textContent = v;
      else if (FORM_PROPS[k]) el[k] = v;
      else if (k.slice(0, 2) === "on" && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (v === true) el.setAttribute(k, "");
      else el.setAttribute(k, v);
    });
  }
  for (; i < arguments.length; i++) appendTo(el, arguments[i]);
  return el;
}

function appendTo(el, c) {
  if (c === undefined || c === null || c === false) return;
  if (Array.isArray(c)) c.forEach(function (x) { appendTo(el, x); });
  else el.appendChild(c.nodeType ? c : document.createTextNode(String(c)));
}

/** Isolate optional UI extensions so one failed panel cannot disable the editor. */
function runExtensions(host, factories, ctx, slide, opts) {
  Object.keys(factories || {}).forEach(function (key) {
    var build = factories[key];
    if (typeof build !== "function") return;
    var result = guard("ui-extension:" + key, function () { return build(ctx, slide, opts); }, null);
    function append(part) {
      if (Array.isArray(part)) part.forEach(append);
      else if (part && (part.el || part).nodeType) host.appendChild(part.el || part);
    }
    append(result);
  });
}

function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

/** Icon from the inlined sprite (runtime/icons.svg). Directional icons mirror in RTL via CSS (.ui-i-dir). */
function icon(name, cls) {
  var s = document.createElementNS(SVGNS, "svg");
  s.setAttribute("class", "ui-i" + (cls ? " " + cls : ""));
  s.setAttribute("aria-hidden", "true");
  var u = document.createElementNS(SVGNS, "use");
  u.setAttribute("href", "#i-" + name);
  s.appendChild(u);
  return s;
}

/** The product mark (symbol #cs-mark in the page's icon block). */
function markSvg(cls) {
  var s = document.createElementNS(SVGNS, "svg");
  s.setAttribute("class", "ui-mark" + (cls ? " " + cls : ""));
  s.setAttribute("viewBox", "0 0 32 32");
  s.setAttribute("aria-hidden", "true");
  var u = document.createElementNS(SVGNS, "use");
  u.setAttribute("href", "#cs-mark");
  s.appendChild(u);
  return s;
}

function esc(s) {
  return String(s === undefined || s === null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

var LTR_RUN = /[A-Za-z0-9][A-Za-z0-9._+\-\/%:@#'&]*(?: [A-Za-z0-9][A-Za-z0-9._+\-\/%:@#'&]*)*/g;

/** Escape text and isolate every LTR run (Latin words, numbers, handles) with <bdi dir="ltr">. */
function bidi(s) {
  s = String(s === undefined || s === null ? "" : s);
  var out = "", last = 0, m;
  LTR_RUN.lastIndex = 0;
  while ((m = LTR_RUN.exec(s))) {
    var run = m[0];
    var tail = /[._+\-\/:'&]+$/.exec(run);
    if (tail) run = run.slice(0, run.length - tail[0].length);
    if (!run) continue;
    out += esc(s.slice(last, m.index)) + '<bdi dir="ltr">' + esc(run) + "</bdi>";
    last = m.index + run.length;
    LTR_RUN.lastIndex = last;
  }
  return out + esc(s.slice(last));
}

/** A <bdi dir="ltr"> element holding text that must never be reordered (handles, file names, hex codes). */
function ltr(text, cls) {
  return h("bdi", { dir: "ltr", class: cls || null }, text);
}

function clone(v) { return v === undefined ? v : JSON.parse(JSON.stringify(v)); }
function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function clamp(n, a, b) { return Math.min(b, Math.max(a, n)); }
function raf() { return new Promise(function (r) { requestAnimationFrame(function () { r(); }); }); }
function uid(prefix) { return (prefix || "u") + Math.random().toString(36).slice(2, 9); }
function isoNow() { return new Date().toISOString().replace(/\.\d{3}Z$/, "Z"); }
function pad2(n) { return (n < 10 ? "0" : "") + n; }

function debounce(fn, ms) {
  var timer = null;
  function wrapped() {
    var args = arguments, self = this;
    clearTimeout(timer);
    timer = setTimeout(function () { timer = null; fn.apply(self, args); }, ms);
  }
  wrapped.flush = function () { if (timer) { clearTimeout(timer); timer = null; fn(); } };
  wrapped.cancel = function () { clearTimeout(timer); timer = null; };
  return wrapped;
}

/** Run fn; on a throw report through cs:error and return fallback. Keeps one broken engine call from freezing the UI. */
/**
 * Up to three font pairings {display, body, latin} (registry ids) from the families embedded in the page: the preset's own first,
 * then display faces that list this preset, then the rest, one pairing per display face. `allowDefault` lets the Brand Book offer
 * the stock faces (D7 never fires on a font the brand chose); the Style tab leaves them out.
 */
function fontPairings(families, own, presetId, allowDefault) {
  var by = {}, out = [], seen = {};
  families.forEach(function (f) { by[f.id] = f; });
  function can(id, role, script) { var f = by[id]; return !!f && (f.roles || []).indexOf(role) >= 0 && (f.scripts || []).indexOf(script) >= 0; }
  function pick(f, role, script) { return can(f.id, role, script) ? f.id : ((f.pairsWith || []).filter(function (id) { return can(id, role, script); })[0] || null); }
  function add(p) { if (p.display && p.body && p.latin && !seen[p.display] && out.length < 3) { seen[p.display] = 1; out.push(p); } }
  function rank(f) { return (f.presets || []).indexOf(presetId) >= 0 ? 0 : 1; }
  if (own && by[own.display] && by[own.body] && by[own.latin]) add({ display: own.display, body: own.body, latin: own.latin });
  families.filter(function (f) { return can(f.id, "display", "arabic") && (allowDefault || !f.defaultLook); })
    .map(function (f, i) { return { f: f, k: rank(f) * 100 + i }; }).sort(function (a, b) { return a.k - b.k; })
    .forEach(function (x) { add({ display: x.f.id, body: pick(x.f, "body", "arabic"), latin: pick(x.f, "latin", "latin") }); });
  return out;
}

function guard(label, fn, fallback) {
  try { return fn(); } catch (e) { reportError(label, e); return fallback; }
}
async function guardAsync(label, fn, fallback) {
  try { return await fn(); } catch (e) { reportError(label, e); return fallback; }
}
function reportError(label, e) {
  try { console.error("[carousel-studio] " + label, e); } catch (x) { /* no console */ }
  try { CS.emit("cs:error", { code: (e && e.code) || "E_USAGE", message: String((e && e.message) || e), detail: label }); } catch (x) { /* ignore */ }
}

/** Per-viewer convenience storage. Both stores can be missing or throw in a framed page. */
function makeStore(kind) {
  function area() { try { return window[kind]; } catch (e) { return null; } }
  return {
    get: function (k, d) { try { var a = area(); var v = a ? a.getItem(k) : null; return v === null || v === undefined ? d : v; } catch (e) { return d; } },
    set: function (k, v) { try { var a = area(); if (!a) return false; a.setItem(k, v); return true; } catch (e) { return false; } },
    del: function (k) { try { var a = area(); if (a) a.removeItem(k); } catch (e) { /* ignore */ } }
  };
}
var local = makeStore("localStorage");
var session = makeStore("sessionStorage");

/** Copy text. Falls back to selecting the text when the clipboard API is refused. Resolves true when copied. */
async function copyText(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(text); return true; }
  } catch (e) { /* refused in some frames: fall through */ }
  var ta = h("textarea", { readonly: true, "aria-hidden": "true", style: { position: "fixed", top: "0", left: "-9999px", opacity: "0" } });
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  var ok = false;
  try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
  ta.remove();
  return ok;
}

function fmtDate(iso, lang) {
  if (!iso) return "";
  try { return new Date(iso).toLocaleDateString(lang === "en" ? "en-GB" : "ar-EG-u-nu-latn", { year: "numeric", month: "short", day: "numeric" }); }
  catch (e) { return String(iso).slice(0, 10); }
}

/** Immutable path update: setPath(obj, ["slides", 2, "title"], "x") returns a new object sharing untouched branches. */
function setPath(obj, path, value) {
  if (!path.length) return value;
  var k = path[0];
  var base = obj === undefined || obj === null ? (typeof k === "number" ? [] : {}) : obj;
  var copy = Array.isArray(base) ? base.slice() : Object.assign({}, base);
  if (path.length === 1 && value === undefined) { if (Array.isArray(copy)) copy.splice(k, 1); else delete copy[k]; return copy; }
  copy[k] = setPath(base[k], path.slice(1), value);
  return copy;
}

/** Keep a list of elements' scaled children in sync with their frame width. */
var frameObserver = typeof ResizeObserver !== "undefined"
  ? new ResizeObserver(function (entries) { entries.forEach(function (e) { fitFrame(e.target); }); })
  : null;

function fitFrame(frame) {
  var inner = frame.firstElementChild;
  var w = frame.clientWidth;
  var cw = +frame.dataset.cw || 1080;
  if (inner && w) inner.style.transform = "scale(" + (w / cw) + ")";
}

/** A box that shows a 1080-wide slide scaled to its own width. Physical left/top are intentional: the slide is a fixed pixel canvas. */
function makeFrame(cw, ch, cls) {
  var inner = h("div", { class: "ui-frame-in", style: { width: cw + "px", height: ch + "px" } });
  var frame = h("div", { class: "ui-frame" + (cls ? " " + cls : ""), dataset: { cw: cw }, style: { aspectRatio: cw + " / " + ch } }, inner);
  if (frameObserver) frameObserver.observe(frame);
  requestAnimationFrame(function () { fitFrame(frame); });
  return { frame: frame, inner: inner };
}

function releaseFrames(root) {
  if (!frameObserver || !root) return;
  root.querySelectorAll(".ui-frame").forEach(function (f) { frameObserver.unobserve(f); });
}

/** Minimal event bus used inside one Studio instance. */
function makeBus() {
  var map = {};
  var group = null;
  return {
    /** Handlers registered while a group is set can be dropped together (the shell rebuilds its screens on a language change). */
    group: function (name) { group = name; },
    drop: function (name) { Object.keys(map).forEach(function (k) { map[k] = map[k].filter(function (e) { return e.group !== name; }); }); },
    on: function (type, fn) {
      var entry = { fn: fn, group: group };
      (map[type] = map[type] || []).push(entry);
      return function () { map[type] = (map[type] || []).filter(function (e) { return e !== entry; }); };
    },
    emit: function (type, detail) {
      (map[type] || []).slice().forEach(function (e) { try { e.fn(detail); } catch (err) { reportError("bus:" + type, err); } });
    }
  };
}

