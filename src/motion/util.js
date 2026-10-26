/*
 * CS.motion · shared helpers (chunk-private).
 *
 * Motion never changes copy or layout. It reads the finished slide, decides a choreography and returns it as data (a Timeline,
 * CONTRACT 5.6). The same Timeline is evaluated by the live preview, by the Studio exporter and by HyperFrames.
 */

var FPS = 30;
var DEFAULT_SECONDS = 6;
var DEFAULT_TIMES = { holdIn: 0.4, resetEnd: 0.75, settleBy: 5.6 };   // platform-instagram.json -> plugin.motion
var AUTHORED_SPAN = DEFAULT_TIMES.settleBy - DEFAULT_TIMES.resetEnd;   // recipes are authored against a 6 s timeline

function motionError(code, message, detail) {
  var E = CS.CSError;
  if (E) return new E(code, message, detail);
  var e = new Error(message || code);
  e.code = code;
  if (detail !== undefined) e.detail = detail;
  return e;
}

function hfEngine() {
  var hf = CS.motion && CS.motion.hf;
  if (!hf || !hf.engine) throw motionError("E_DEP_LOAD", "cs-hf.js must be loaded before the motion engine is used.");
  return hf.engine;
}

function clampNum(n, a, b) { return n < a ? a : n > b ? b : n; }

function round3(n) { return Math.round(n * 1000) / 1000; }

/** 32-bit FNV-1a of a string (seeds only; not a security feature). */
function fnv32(text) {
  var h = 0x811c9dc5, i;
  for (i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

/** Arabic normalisation for keyword spotting: no marks, one alef, one ya, one ha, lower-case Latin, digits dropped. */
function normalizeAr(text) {
  return String(text || "").toLowerCase()
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/ؤ/g, "و").replace(/ئ/g, "ي")
    .replace(/\s+/g, " ").trim();
}

function trimCssVar(el, name, fallback) {
  var v = el.style.getPropertyValue(name) || window.getComputedStyle(el).getPropertyValue(name);
  v = (v || "").trim();
  return v || fallback;
}

/** Rectangle of `el` in slide pixels (undoes the Studio's preview scale). */
function slideRect(root, el) {
  var rr = root.getBoundingClientRect(), sc = root.offsetWidth ? rr.width / root.offsetWidth : 1, r = el.getBoundingClientRect();
  return { x: (r.left - rr.left) / sc, y: (r.top - rr.top) / sc, w: r.width / sc, h: r.height / sc };
}

/**
 * Collects the tracks of one recipe. Recipes are authored in seconds against the default 6 s timeline; `t()` and `d()`
 * map authored times and durations onto the real build window [resetEnd, settleBy] (5 s covers shrink, never overflow).
 */
function Plan(times) {
  this.times = times;
  this.k = (times.settleBy - times.resetEnd) / AUTHORED_SPAN;
  this.tracks = [];
  this.counters = [];
  this.overlays = [];
  this.order = 0;
}

Plan.prototype.t = function (authored) { return round3(this.times.resetEnd + (authored - DEFAULT_TIMES.resetEnd) * this.k); };
Plan.prototype.d = function (authored) { return round3(authored * this.k); };

/**
 * add(id, sel, { at, dur, from, to, ease, origin, stagger, rest, then, resetTo, resetEase, delay })
 * `then` entries are { dt, to?, ease? } in authored seconds. The break-apart delay follows reading order unless given.
 */
Plan.prototype.add = function (id, sel, o) {
  var self = this, t0 = this.t(o.at), tr = { id: id, sel: sel, from: o.from, t0: t0, t1: round3(t0 + this.d(o.dur)), ease: o.ease || "out-cubic" };
  if (o.to) tr.to = o.to;
  if (o.origin) tr.origin = o.origin;
  if (o.stagger) tr.stagger = { each: round3(this.d(o.stagger.each)), from: o.stagger.from || "start", seed: o.stagger.seed };
  if (o.rest) tr.rest = o.rest;
  if (o.then) tr.then = o.then.map(function (s) { var x = { dt: self.d(s.dt) }; if (s.to) x.to = s.to; if (s.ease) x.ease = s.ease; return x; });
  tr.reset = { ease: o.resetEase || "in-cubic", delay: o.delay !== undefined ? o.delay : round3(Math.min(0.1, this.order * 0.012)) };
  if (o.resetTo) tr.reset.to = o.resetTo;
  if (o.delay === undefined) this.order += 1;
  this.tracks.push(tr);
  return tr;
};

Plan.prototype.counter = function (id, sel, o) {
  var t0 = this.t(o.at);
  this.counters.push({ id: id, sel: sel, from: o.from, to: o.to, t0: t0, t1: round3(t0 + this.d(o.dur)), ease: o.ease || "in-quad", decimals: o.decimals || 0 });
};
