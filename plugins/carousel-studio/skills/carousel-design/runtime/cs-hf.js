/*! Carousel Studio runtime chunk cs-hf.js · cs-1.1.1 · Apache-2.0 */
(function () {
  "use strict";
  var CS = (window.CS = window.CS || {});
  /* ---- file: runtime.js ---- */
/*
 * Carousel Studio · cs-hf runtime
 *
 * `hfRuntime` is ONE self-contained function. It is evaluated twice:
 *   1. by this chunk at load time (the Studio lane seeks it frame by frame), and
 *   2. inside every exported `cover.hf.html`, where `CS.motion.hf.runtimeSource()` prints its source text
 *      so the HyperFrames renderer (Claude Code lane) runs the very same code.
 * It therefore may not reference anything outside its own body (no CS globals, no closures from the chunk).
 *
 * What it does
 *   - evaluates a Timeline (CONTRACT 5.6) as a pure function of time: `seek(t)` always yields the same pixels;
 *   - writes the result as inline styles (`transform opacity clip-path stroke-dashoffset`), or, with
 *     `driver: "waapi"`, as paused Web Animations sampled once per frame;
 *   - builds overlay graphics (story metaphors, stamp ring) that exist only while the cover is animating;
 *   - drives numeric counters (text only, the box keeps its final width);
 *   - registers a timeline controller on `window.__timelines[id]` and answers the `hf-seek` event, which is how
 *     the HyperFrames renderer moves a composition to an exact time.
 *
 * Poster-first rule (normative, CONTRACT 5.6): at `t <= holdIn` and `t >= settleBy` every element is at rest,
 * i.e. the finished poster. Frame 0 and the last frame are therefore identical.
 */
function hfRuntime(window, document) {
  "use strict";

  var VERSION = "cs-hf-1";
  var RESET_SPREAD = 0.1;            // seconds over which the break-apart is staggered inside [holdIn, resetEnd]

  /* ------------------------------------------------------------------ easing */
  var BACK_C1 = 1.25;                // peak overshoot 5.7 % (CONTRACT: out-back overshoot <= 6 %)
  var BACK_C3 = BACK_C1 + 1;
  var EASES = {
    "linear": function (t) { return t; },
    "in-quad": function (t) { return t * t; },
    "out-quad": function (t) { return 1 - (1 - t) * (1 - t); },
    "in-out-quad": function (t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; },
    "in-cubic": function (t) { return t * t * t; },
    "out-cubic": function (t) { return 1 - Math.pow(1 - t, 3); },
    "in-out-cubic": function (t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; },
    "out-quint": function (t) { return 1 - Math.pow(1 - t, 5); },
    "out-expo": function (t) { return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t); },
    "in-out-expo": function (t) {
      if (t <= 0) return 0;
      if (t >= 1) return 1;
      return t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2;
    },
    "out-back": function (t) { var u = t - 1; return 1 + BACK_C3 * u * u * u + BACK_C1 * u * u; }
  };

  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
  function ease(name, t) { return (EASES[name] || EASES.linear)(clamp01(t)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  /** Counter value at progress `t` (0..1), rounded to `decimals`. Equals `to` exactly at t = 1. */
  function counterValue(from, to, t, decimals) {
    var p = Math.pow(10, decimals || 0);
    return Math.round(lerp(from, to, clamp01(t)) * p) / p;
  }

  /* ------------------------------------------------------------------ property model */
  var DEF = { opacity: 1, x: 0, y: 0, scale: 1, scaleX: 1, scaleY: 1, rotate: 0, clipInset: [0, 0, 0, 0], dash: 1 };
  var PROP_KEYS = ["opacity", "x", "y", "scale", "scaleX", "scaleY", "rotate", "clipInset", "dash"];
  var TRANSFORM_KEYS = { x: 1, y: 1, scale: 1, scaleX: 1, scaleY: 1, rotate: 1 };
  var SAVED_STYLES = ["transform", "transformOrigin", "transformBox", "opacity", "clipPath", "strokeDashoffset",
    "strokeDasharray", "visibility", "display", "minWidth", "textAlign"];

  function keysOf(objs) {
    var seen = {}, out = [], i, k;
    for (i = 0; i < objs.length; i++) {
      if (!objs[i]) continue;
      for (k in objs[i]) if (Object.prototype.hasOwnProperty.call(objs[i], k) && DEF[k] !== undefined && !seen[k]) { seen[k] = 1; out.push(k); }
    }
    return out;
  }

  /** Full state over `keys`: missing values come from `rest`, then from the global defaults. */
  function fill(obj, keys, rest) {
    var st = {}, i, k;
    for (i = 0; i < keys.length; i++) {
      k = keys[i];
      st[k] = obj && obj[k] !== undefined ? obj[k] : rest && rest[k] !== undefined ? rest[k] : DEF[k];
    }
    return st;
  }

  function mix(a, b, u, keys) {
    var out = {}, i, k, av, bv;
    for (i = 0; i < keys.length; i++) {
      k = keys[i]; av = a[k]; bv = b[k];
      out[k] = Array.isArray(av) ? [lerp(av[0], bv[0], u), lerp(av[1], bv[1], u), lerp(av[2], bv[2], u), lerp(av[3], bv[3], u)] : lerp(av, bv, u);
    }
    return out;
  }

  function num(n) { var s = (Math.round(n * 10000) / 10000).toString(); return s.indexOf("e") >= 0 ? n.toFixed(4) : s; }

  function transformOf(st, keys) {
    var parts = [], tx = st.x || 0, ty = st.y || 0;
    var sx = st.scaleX !== undefined ? st.scaleX : st.scale !== undefined ? st.scale : 1;
    var sy = st.scaleY !== undefined ? st.scaleY : st.scale !== undefined ? st.scale : 1;
    if (tx || ty) parts.push("translate(" + num(tx) + "px," + num(ty) + "px)");
    if (st.rotate) parts.push("rotate(" + num(st.rotate) + "deg)");
    if (sx !== 1 || sy !== 1) parts.push("scale(" + num(sx) + "," + num(sy) + ")");
    return parts.length ? parts.join(" ") : "none";
  }

  function originOf(name, rtl) {
    switch (name) {
      case "start": return rtl ? "100% 50%" : "0% 50%";
      case "end": return rtl ? "0% 50%" : "100% 50%";
      case "top": return "50% 0%";
      case "bottom": return "50% 100%";
      default: return "50% 50%";
    }
  }

  /** CSS strings for a state (only the style properties the track uses). */
  function cssOf(st, keys) {
    var out = {}, hasT = false, i;
    for (i = 0; i < keys.length; i++) if (TRANSFORM_KEYS[keys[i]]) { hasT = true; break; }
    if (hasT) out.transform = transformOf(st, keys);
    if (st.opacity !== undefined) out.opacity = num(clamp01(st.opacity));
    if (st.clipInset) out.clipPath = "inset(" + num(st.clipInset[0]) + "% " + num(st.clipInset[1]) + "% " + num(st.clipInset[2]) + "% " + num(st.clipInset[3]) + "%)";
    if (st.dash !== undefined) {
      out.strokeDashoffset = num(1 - clamp01(st.dash));
      out.visibility = st.dash <= 0.0005 ? "hidden" : "";
    }
    return out;
  }

  /* ------------------------------------------------------------------ small helpers */
  function rngFrom(seed) {                       // mulberry32: deterministic, 32-bit
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function staggerDelays(stagger, n) {
    var d = [], i, each, order, rng, j, tmp;
    if (!stagger || !stagger.each || n < 2) { for (i = 0; i < n; i++) d.push(0); return d; }
    each = stagger.each;
    if (stagger.from === "end") { for (i = 0; i < n; i++) d.push((n - 1 - i) * each); }
    else if (stagger.from === "center") { for (i = 0; i < n; i++) d.push(Math.abs(i - (n - 1) / 2) * each); }
    else if (stagger.from === "random") {
      order = []; for (i = 0; i < n; i++) order.push(i);
      rng = rngFrom(stagger.seed || 1);
      for (i = n - 1; i > 0; i--) { j = Math.floor(rng() * (i + 1)); tmp = order[i]; order[i] = order[j]; order[j] = tmp; }
      for (i = 0; i < n; i++) d.push(order[i] * each);
    } else { for (i = 0; i < n; i++) d.push(i * each); }
    return d;
  }

  function slideOf(root) {
    if (!root) return null;
    if (root.nodeType === 9) return root.querySelector(".cs-slide") || root.body;
    if (root.matches && root.matches(".cs-slide")) return root;
    return root.querySelector ? root.querySelector(".cs-slide") || root : root;
  }

  function isSvgChild(el) { return typeof SVGElement !== "undefined" && el instanceof SVGElement && !(el instanceof SVGSVGElement); }

  /* ------------------------------------------------------------------ counters */
  var DIGITS_AR = "٠١٢٣٤٥٦٧٨٩";
  function toWestern(s) { return s.replace(/[٠-٩]/g, function (c) { return String(DIGITS_AR.indexOf(c)); }); }
  function toArabicIndic(s) { return s.replace(/[0-9]/g, function (c) { return DIGITS_AR.charAt(+c); }); }

  /** Splits a text like "88%" / "$1,200" / "٤١٣" into prefix, number, suffix and formatting facts. */
  function parseNumberText(text) {
    var m = /^([^0-9٠-٩]*)([0-9٠-٩][0-9٠-٩.,٫٬]*)([\s\S]*)$/.exec(text);
    if (!m) return null;
    var raw = m[2], arabic = /[٠-٩]/.test(raw), grouped = /[,٬]/.test(raw);
    var western = toWestern(raw).replace(/[٫]/g, ".").replace(/[٬]/g, ",");
    var dec = western.indexOf(".") >= 0 ? western.length - western.indexOf(".") - 1 : 0;
    var value = parseFloat(western.replace(/,/g, ""));
    if (!isFinite(value)) return null;
    return { prefix: m[1], suffix: m[3], value: value, decimals: dec, arabic: arabic, grouped: grouped, decimalMark: /٫/.test(raw) ? "٫" : ".", groupMark: /٬/.test(raw) ? "٬" : "," };
  }

  function formatNumber(v, info) {
    var s = v.toFixed(info.decimals), parts = s.split("."), ip = parts[0];
    if (info.grouped) ip = ip.replace(/\B(?=([0-9]{3})+(?![0-9]))/g, info.groupMark);
    s = parts.length > 1 ? ip + info.decimalMark + parts[1] : ip;
    if (info.arabic) s = toArabicIndic(s);
    return info.prefix + s + info.suffix;
  }

  function firstNumberNode(el) {
    var w = document.createTreeWalker(el, 4 /* SHOW_TEXT */, null), n;
    while ((n = w.nextNode())) if (/[0-9٠-٩]/.test(n.nodeValue)) return n;
    return null;
  }

  /* ------------------------------------------------------------------ the engine */
  /**
   * attach(slide, timeline, options) -> engine
   * options: { driver: "style" | "waapi", rtl?: boolean }
   */
  function attach(slide, timeline, options) {
    options = options || {};
    var rtl = options.rtl !== undefined ? options.rtl : (slide.getAttribute("dir") || (window.getComputedStyle(slide).direction)) === "rtl";
    var T = timeline.times || { holdIn: 0.4, resetEnd: 0.75, settleBy: 5.6 };
    var duration = timeline.duration || 6;
    var fps = timeline.fps || 30;
    var frames = timeline.frames || Math.round(duration * fps);
    var driver = options.driver === "waapi" ? "waapi" : "style";
    var overlays = [], instances = [], counters = [], animations = [], lastT = 0, destroyed = false;
    var resetWindow = Math.max(0.001, T.resetEnd - T.holdIn - RESET_SPREAD);
    var bases = new WeakMap();           // original inline styles, captured once per element
    // Notebook's Playpen shapes/positions inline words differently from atomic inline-blocks.
    // Keep its original inline formatting in the poster holds; other presets keep their frozen output.
    var notebook = slide.getAttribute("data-preset") === "notebook", inlineBoxes = [], inlineUntil = 0;
    var sc = slide.offsetWidth ? slide.getBoundingClientRect().width / slide.offsetWidth : 1;   // Studio preview scale
    function baseOf(el) {
      var b = bases.get(el), i;
      if (!b) {
        b = { hadStyleAttr: el.hasAttribute("style"), group: null };
        for (i = 0; i < SAVED_STYLES.length; i++) b[SAVED_STYLES[i]] = el.style[SAVED_STYLES[i]];
        bases.set(el, b);
      }
      return b;
    }

    /* ---- overlays: graphics that exist only while the cover animates ---- */
    (timeline.overlays || []).forEach(function (ov) {
      var d = document.createElement("div"), r = ov.rect || { x: 0, y: 0, w: 1080, h: 1440 };
      d.setAttribute("data-m-ov", ov.id);
      d.setAttribute("aria-hidden", "true");
      d.style.cssText = "position:absolute;left:" + num(r.x) + "px;top:" + num(r.y) + "px;width:" + num(r.w) + "px;height:" + num(r.h) +
        "px;pointer-events:none;opacity:0;margin:0;padding:0;border:0;overflow:visible";
      d.innerHTML = ov.html || "";
      if (ov.layer === "below") {
        var content = slide.querySelector(".cs-content");
        if (content) slide.insertBefore(d, content); else slide.appendChild(d);
      } else slide.appendChild(d);
      overlays.push(d);
    });

    /* ---- compile tracks into per-element instances ---- */
    (timeline.tracks || []).forEach(function (tr) {
      var els = slide.querySelectorAll(tr.sel);
      if (!els.length) return;
      var thens = tr.then || [];
      var keys = keysOf([tr.from, tr.to, tr.rest, tr.reset && tr.reset.to].concat(thens.map(function (s) { return s.to; })));
      if (!keys.length) return;
      var rest = fill(tr.rest, keys, null);
      var from = fill(tr.from, keys, rest);
      var to = fill(tr.to, keys, rest);
      var resetTo = tr.reset && tr.reset.to ? fill(tr.reset.to, keys, rest) : from;
      var delays = staggerDelays(tr.stagger, els.length);
      var chain = thens.map(function (s) { return { dt: s.dt, ease: s.ease || "in-out-quad", to: fill(s.to, keys, rest) }; });
      var origin = originOf(tr.origin, rtl);
      var wantsTransform = keys.some(function (k) { return TRANSFORM_KEYS[k]; });
      for (var i = 0; i < els.length; i++) {
        var el = els[i], base = baseOf(el);
        if (wantsTransform) {
          if (!isSvgChild(el) && window.getComputedStyle(el).display === "inline") {
            el.style.display = "inline-block";
            if (notebook) inlineBoxes.push(el);
          }
          el.style.transformOrigin = origin;
          if (isSvgChild(el)) el.style.transformBox = "fill-box";
        }
        if (keys.indexOf("dash") >= 0) el.style.strokeDasharray = "1 2";
        if (keys.indexOf("opacity") >= 0 && !el.hasAttribute("data-m-group") && !isSvgChild(el)) { el.setAttribute("data-m-group", "opacity"); base.group = "added"; }
        var rdelay = Math.min(RESET_SPREAD, Math.max(0, ((tr.reset && tr.reset.delay) || 0) + i * ((tr.reset && tr.reset.each) || 0)));
        var a = Math.max(tr.t0 + delays[i], T.resetEnd);
        instances.push({
          el: el, keys: keys, rest: rest, from: from, to: to, resetTo: resetTo, chain: chain, base: base,
          ease: tr.ease || "out-cubic", resetEase: (tr.reset && tr.reset.ease) || "in-cubic",
          a: a, b: a + (tr.t1 - tr.t0), rdelay: rdelay, last: null, css: null
        });
      }
    });

    /* ---- counters ---- */
    (timeline.counters || []).forEach(function (ct) {
      var els = slide.querySelectorAll(ct.sel), i, node, info;
      for (i = 0; i < els.length; i++) {
        node = firstNumberNode(els[i]);
        if (!node) continue;
        info = parseNumberText(node.nodeValue);
        if (!info) continue;
        var holder = node.parentNode, cs = window.getComputedStyle(holder), base = baseOf(holder);
        if (cs.display === "inline" && !isSvgChild(holder)) {
          holder.style.display = "inline-block";
          if (notebook) inlineBoxes.push(holder);
        }
        holder.style.minWidth = num(holder.getBoundingClientRect().width / sc) + "px";
        counters.push({ node: node, holder: holder, info: info, text: node.nodeValue, base: base, from: ct.from, to: ct.to, t0: ct.t0, t1: ct.t1, ease: ct.ease || "in-quad", decimals: ct.decimals || 0, shown: node.nodeValue });
      }
    });

    // Restore the whole inline run together once its last move/count finishes, including the final hold.
    if (notebook) {
      instances.forEach(function (inst) {
        if (inlineBoxes.indexOf(inst.el) >= 0) inlineUntil = Math.max(inlineUntil, inst.b + inst.chain.reduce(function (end, seg) { return end + seg.dt; }, 0));
      });
      counters.forEach(function (c) { if (inlineBoxes.indexOf(c.holder) >= 0) inlineUntil = Math.max(inlineUntil, c.t1); });
    }

    /* ---- state function ---- */
    function stateOf(inst, t) {
      var u, k, seg, cur, ts;
      if (t <= T.holdIn || t >= T.settleBy) return null;
      if (t < T.resetEnd) {
        u = clamp01((t - T.holdIn - inst.rdelay) / resetWindow);
        return u <= 0 ? null : mix(inst.rest, inst.resetTo, ease(inst.resetEase, u), inst.keys);
      }
      if (t < inst.a) return inst.from;
      if (t <= inst.b) return mix(inst.from, inst.to, ease(inst.ease, (t - inst.a) / Math.max(1e-6, inst.b - inst.a)), inst.keys);
      cur = inst.to; ts = inst.b;
      for (k = 0; k < inst.chain.length; k++) {
        seg = inst.chain[k];
        if (t <= ts + seg.dt) return mix(cur, seg.to, ease(seg.ease, (t - ts) / Math.max(1e-6, seg.dt)), inst.keys);
        ts += seg.dt; cur = seg.to;
      }
      return null;
    }

    function writeStyle(inst, st) {
      var el = inst.el, name, css, key;
      if (st === null) {
        if (inst.last === "rest") return;
        inst.last = "rest";
        for (name in inst.css || {}) el.style[name] = inst.base[name] !== undefined ? inst.base[name] : "";
        return;
      }
      css = cssOf(st, inst.keys);
      key = JSON.stringify(css);
      if (key === inst.last) return;
      inst.last = key; inst.css = css;
      for (name in css) el.style[name] = css[name];
    }

    function writeCounters(t) {
      var i, c, v, text;
      for (i = 0; i < counters.length; i++) {
        c = counters[i];
        if (t <= T.holdIn || t >= T.settleBy || t < T.resetEnd) text = c.text;
        else if (t < c.t0) text = formatNumber(c.from, c.info);
        else if (t <= c.t1) { v = counterValue(c.from, c.to, ease(c.ease, (t - c.t0) / Math.max(1e-6, c.t1 - c.t0)), c.decimals); text = formatNumber(v, c.info); }
        else text = c.text;
        if (text !== c.shown) { c.node.nodeValue = text; c.shown = text; }
      }
    }

    /* ---- waapi driver: the same state function, sampled once per frame ---- */
    function buildAnimations() {
      var i, f, inst, st, kfs, css, sigs, samples, a;
      for (i = 0; i < instances.length; i++) {
        inst = instances[i]; kfs = []; sigs = []; samples = [];
        for (f = 0; f <= frames; f++) {
          st = stateOf(inst, f / fps);
          css = cssOf(st === null ? fill(null, inst.keys, inst.rest) : st, inst.keys);
          if (css.visibility === "") css.visibility = "visible";
          if (st === null && css.clipPath) css.clipPath = "none";          // at rest the poster carries no clip at all
          samples.push(css); sigs.push(JSON.stringify(css));
        }
        for (f = 0; f <= frames; f++) {            // keep the first and last frame of every flat run, so a hold stays a hold
          if (f === 0 || f === frames || sigs[f] !== sigs[f - 1] || sigs[f] !== sigs[f + 1]) { samples[f].offset = f / frames; samples[f].easing = "linear"; kfs.push(samples[f]); }
        }
        if (kfs.length < 2) continue;
        a = inst.el.animate(kfs, { duration: duration * 1000, fill: "both", easing: "linear", composite: "replace" });
        a.pause(); a.currentTime = 0;
        animations.push(a);
      }
    }
    if (driver === "waapi" && typeof Element !== "undefined" && typeof Element.prototype.animate === "function") buildAnimations(); else driver = "style";

    function seek(t) {
      if (destroyed) return;
      t = Math.max(0, Math.min(duration, +t || 0));
      lastT = t;
      inlineBoxes.forEach(function (el) { el.style.display = t <= T.holdIn || t >= Math.min(T.settleBy, inlineUntil) ? bases.get(el).display : "inline-block"; });
      if (driver === "waapi") { for (var k = 0; k < animations.length; k++) animations[k].currentTime = t * 1000; }
      else for (var i = 0; i < instances.length; i++) writeStyle(instances[i], stateOf(instances[i], t));
      writeCounters(t);
    }

    function destroy() {
      if (destroyed) return;
      destroyed = true;
      animations.forEach(function (a) { try { a.cancel(); } catch (e) { /* already gone */ } });
      function restore(el) {
        var b = bases.get(el), i;
        if (!b) return;
        for (i = 0; i < SAVED_STYLES.length; i++) el.style[SAVED_STYLES[i]] = b[SAVED_STYLES[i]];
        if (b.group === "added") el.removeAttribute("data-m-group");
        if (!b.hadStyleAttr && el.getAttribute("style") === "") el.removeAttribute("style");
      }
      instances.forEach(function (inst) { restore(inst.el); });
      counters.forEach(function (c) { c.node.nodeValue = c.text; restore(c.holder); });
      overlays.forEach(function (o) { if (o.parentNode) o.parentNode.removeChild(o); });
      animations = []; instances = []; counters = []; overlays = [];
    }

    seek(0);
    return {
      driver: driver, duration: duration, fps: fps, frames: frames,
      get time() { return lastT; },
      seek: seek, destroy: destroy,
      stats: function () { return { instances: instances.length, counters: counters.length, overlays: overlays.length, animations: animations.length }; }
    };
  }

  /* ------------------------------------------------------------------ fonts */
  function loadFonts(slide) {
    var seen = {}, jobs = [];
    var els = slide.querySelectorAll(".w, [data-slot], .cs-handle, .cs-meta, .cs-counter, .cs-swipe, .cs-savepill");
    for (var i = 0; i < els.length; i++) {
      var cs = window.getComputedStyle(els[i]), text = (els[i].textContent || "").replace(/\s+/g, " ").trim().slice(0, 24);
      if (!text) continue;
      var shorthand = cs.fontStyle + " " + cs.fontWeight + " 40px " + cs.fontFamily, key = shorthand + "|" + text;
      if (seen[key]) continue;
      seen[key] = 1;
      jobs.push(document.fonts.load(shorthand, text).catch(function () { return []; }));
    }
    return Promise.all(jobs).then(function () { return document.fonts.ready; });
  }

  /* ------------------------------------------------------------------ HyperFrames registration */
  /**
   * install(root, timeline, id) -> controller
   * The controller has the method set the HyperFrames renderer expects of a timeline registered on
   * `window.__timelines[id]` (duration, time, seek, totalTime, progress, pause, paused, play) and nothing else.
   */
  function install(root, timeline, id, options) {
    id = id || "cs-cover";
    var slide = slideOf(root);
    var engine = attach(slide, timeline, options);
    var onSeek = function (ev) { if (ev && ev.detail && typeof ev.detail.time === "number") engine.seek(ev.detail.time); };
    window.addEventListener("hf-seek", onSeek);
    var ctrl = {
      id: id, engine: engine, version: VERSION,
      duration: function () { return engine.duration; },
      totalDuration: function () { return engine.duration; },
      time: function (t) { if (arguments.length) { engine.seek(t); return ctrl; } return engine.time; },
      seek: function (t) { engine.seek(t); return ctrl; },
      totalTime: function (t) { if (arguments.length) { engine.seek(t); return ctrl; } return engine.time; },
      progress: function (p) { if (arguments.length) { engine.seek(p * engine.duration); return ctrl; } return engine.time / engine.duration; },
      pause: function () { return ctrl; },
      play: function () { return ctrl; },
      paused: function () { return true; },
      destroy: function () {
        window.removeEventListener("hf-seek", onSeek);
        if (window.__timelines && window.__timelines[id] === ctrl) delete window.__timelines[id];
        engine.destroy();
      }
    };
    window.__timelines = window.__timelines || {};
    window.__timelines[id] = ctrl;
    window.__csHfReady = false;
    ctrl.ready = loadFonts(slide).then(function () { engine.seek(0); window.__csHfReady = true; return ctrl; });
    return ctrl;
  }

  return {
    VERSION: VERSION, RESET_SPREAD: RESET_SPREAD,
    ease: ease, lerp: lerp, counter: counterValue, EASE_NAMES: Object.keys(EASES),
    rng: rngFrom, parseNumberText: parseNumberText, formatNumber: formatNumber,
    attach: attach, install: install, loadFonts: loadFonts
  };
}

  /* ---- file: api.js ---- */
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
})();
