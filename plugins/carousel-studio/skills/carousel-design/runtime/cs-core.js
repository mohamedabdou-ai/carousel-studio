/*! Carousel Studio runtime chunk cs-core.js · cs-1.1.1 · Apache-2.0 */
(function () {
  "use strict";
  var CS = (window.CS = window.CS || {});
  /* ---- file: root.js ---- */
/* lib/root.js · the root of window.CS (CONTRACT 4.0 and 4.2).
 *
 * First file of the chunk cs-core.js. Everything else in the runtime hangs off the namespace created here:
 * the version, CSError, the tiny event bus (CS.on / once / off / emit), CS.util and the empty CS.core object that
 * lib/*.js and core/*.js fill. Nothing in this file touches the DOM at load time.
 */
CS.version = "cs-1.1.1";

/** Error with a machine-readable code (CONTRACT 0.4): E_SCHEMA, E_FONT_MISSING, E_FIT_OVERFLOW, E_PAINT_TAINTED, ... */
class CSError extends Error {
  constructor(code, message, detail) {
    super(message || code);
    this.name = "CSError";
    this.code = code;
    if (detail !== undefined) this.detail = detail;
  }
}
CS.CSError = CSError;

/* ---- events ------------------------------------------------------------------------------------------------ */

const LISTENERS = Object.create(null);

/** Subscribe. `fn(detail, event)`. Returns an unsubscribe function. */
CS.on = function on(type, fn) {
  (LISTENERS[type] = LISTENERS[type] || []).push(fn);
  return function off() { CS.off(type, fn); };
};

/** Subscribe for one delivery only. */
CS.once = function once(type, fn) {
  const off = CS.on(type, function (detail, ev) { off(); fn(detail, ev); });
  return off;
};

CS.off = function off(type, fn) {
  const list = LISTENERS[type];
  if (!list) return;
  LISTENERS[type] = list.filter(function (f) { return f !== fn; });
};

/** Deliver to subscribers, then dispatch a CustomEvent(type, {detail}) on document. A throwing subscriber never stops the others. */
CS.emit = function emit(type, detail) {
  let ev = null;
  try { ev = new CustomEvent(type, { detail: detail }); } catch (e) { ev = null; }
  (LISTENERS[type] || []).slice().forEach(function (fn) {
    try { fn(detail, ev); } catch (e) { if (typeof console !== "undefined" && console.error) console.error("[cs] listener for " + type + " failed:", e); }
  });
  if (ev && typeof document !== "undefined" && document.dispatchEvent) document.dispatchEvent(ev);
};

/* ---- util -------------------------------------------------------------------------------------------------- */

let uidCounter = 0;

CS.util = {
  /** Short unique id with an optional prefix: "cs-3k9x2a". */
  uid: function uid(prefix) {
    uidCounter += 1;
    return (prefix || "cs") + "-" + Date.now().toString(36).slice(-4) + (uidCounter).toString(36) + Math.random().toString(36).slice(2, 5);
  },
  clamp: function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); },
  sleep: function sleep(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); },
  /** Resolves after two animation frames (layout and paint have both happened). */
  raf2: function raf2() {
    return new Promise(function (resolve) {
      if (typeof requestAnimationFrame !== "function") { setTimeout(resolve, 32); return; }
      requestAnimationFrame(function () { requestAnimationFrame(function () { resolve(); }); });
    });
  },
  /** Safari / iOS and every WebKit engine on iOS. Used only to choose the default painter (feature detection does the rest). */
  isWebKit: function isWebKit() {
    const ua = typeof navigator !== "undefined" ? navigator.userAgent || "" : "";
    if (/(iPhone|iPad|iPod)/.test(ua)) return true;
    return /AppleWebKit/.test(ua) && !/(Chrome|Chromium|CriOS|Edg|OPR|Android)/.test(ua);
  },
  isTouch: function isTouch() {
    if (typeof window === "undefined") return false;
    return ("ontouchstart" in window) || (typeof navigator !== "undefined" && navigator.maxTouchPoints > 0);
  },
  /**
   * Create an element. `attrs`: `class`/`className`, `style` (string or object), `dataset` (object), `text`, `html`,
   * `onclick`-style handlers (functions), `true` for boolean attributes, anything else as an attribute.
   * `children`: nodes, strings or arrays of them; null and false are skipped.
   */
  el: function el(tag, attrs) {
    const node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        const v = attrs[k];
        if (v === undefined || v === null || v === false) return;
        if (k === "class" || k === "className") node.className = v;
        else if (k === "style" && typeof v === "object") Object.assign(node.style, v);
        else if (k === "dataset" && typeof v === "object") Object.keys(v).forEach(function (d) { node.dataset[d] = v[d]; });
        else if (k === "text") node.textContent = v;
        else if (k === "html") node.innerHTML = v;
        else if (k.slice(0, 2) === "on" && typeof v === "function") node.addEventListener(k.slice(2).toLowerCase(), v);
        else node.setAttribute(k, v === true ? "" : String(v));
      });
    }
    const add = function (child) {
      if (child === undefined || child === null || child === false) return;
      if (Array.isArray(child)) { child.forEach(add); return; }
      node.appendChild(typeof child === "object" && child.nodeType ? child : document.createTextNode(String(child)));
    };
    for (let i = 2; i < arguments.length; i++) add(arguments[i]);
    return node;
  }
};

/* ---- CS.core, CS.core.format ------------------------------------------------------------------------------------ */

CS.core = CS.core || {};

/** `{name}` placeholders (CONTRACT 3.6). An unknown placeholder is left as it is. */
CS.core.format = function format(template, params) {
  const p = params || {};
  return String(template).replace(/\{([A-Za-z0-9_.-]+)\}/g, function (m, key) {
    return Object.prototype.hasOwnProperty.call(p, key) && p[key] !== undefined && p[key] !== null ? String(p[key]) : m;
  });
};

  /* ---- file: canon.js ---- */
/* lib/canon.js · canonical JSON and the hashes built on it (CONTRACT 3.2).
 *
 * canonicalJSON(value)   sorted keys, no whitespace, NFC strings escaped minimally, shortest round-trip numbers.
 * fnv1a64(string)        FNV-1a, 64 bit, over the UTF-8 bytes; 16 lowercase hex digits.
 * hash(value)            fnv1a64(canonicalJSON(value)) ("hash16"). Hashes detect change; they are not security features.
 * brandSnapshot(brand)   the brand without the fields that change on every save.
 * hashable(tokens)       resolved tokens without provenance, adjustments, css and hash.
 *
 * The Python twin is scripts/_cs/canon.py; both must print the same bytes for the same document.
 */
(function () {
  const core = (CS.core = CS.core || {});

  const MIN_MAGNITUDE = 1e-6;
  const MAX_MAGNITUDE = 1e21;
  const SHORT_ESCAPES = { 8: "\\b", 9: "\\t", 10: "\\n", 12: "\\f", 13: "\\r" };

  function canonString(s) {
    const text = String(s).normalize("NFC");
    let out = '"';
    for (let i = 0; i < text.length; i++) {
      const c = text.charCodeAt(i);
      if (c === 0x22) out += '\\"';
      else if (c === 0x5c) out += "\\\\";
      else if (c < 0x20) out += SHORT_ESCAPES[c] || "\\u" + ("0000" + c.toString(16)).slice(-4);
      else out += text.charAt(i);
    }
    return out + '"';
  }

  function canonNumber(n) {
    if (!isFinite(n)) throw new CS.CSError("E_SCHEMA", "canonicalJSON: " + n + " is not representable");
    if (n === 0) return "0"; /* -0 prints 0 */
    const a = Math.abs(n);
    if (a >= MAX_MAGNITUDE || a < MIN_MAGNITUDE) throw new CS.CSError("E_SCHEMA", "canonicalJSON: magnitude out of range (" + n + ")");
    return String(n);
  }

  function sortedKeys(obj) {
    /* All hashed keys are ASCII, so the default string order equals code point order. For non-ASCII keys compare code points. */
    return Object.keys(obj).sort(function (a, b) {
      if (a === b) return 0;
      const la = Array.from(a), lb = Array.from(b);
      const n = Math.min(la.length, lb.length);
      for (let i = 0; i < n; i++) {
        const d = la[i].codePointAt(0) - lb[i].codePointAt(0);
        if (d) return d;
      }
      return la.length - lb.length;
    });
  }

  function canonicalJSON(value) {
    if (value === null) return "null";
    switch (typeof value) {
      case "boolean": return value ? "true" : "false";
      case "number": return canonNumber(value);
      case "string": return canonString(value);
      case "undefined": return "null"; /* only reachable inside arrays: object members that are undefined are omitted below */
      case "object": break;
      default: throw new CS.CSError("E_SCHEMA", "canonicalJSON: unsupported value of type " + typeof value);
    }
    if (Array.isArray(value)) return "[" + value.map(canonicalJSON).join(",") + "]";
    const parts = [];
    sortedKeys(value).forEach(function (k) {
      if (value[k] === undefined) return;
      parts.push(canonString(k) + ":" + canonicalJSON(value[k]));
    });
    return "{" + parts.join(",") + "}";
  }

  /* FNV-1a 64 on two 32-bit halves. prime = 2^40 + 0x1b3, so h*prime = h*0x1b3 + (h << 40). */
  function utf8Bytes(s) {
    if (typeof TextEncoder === "function") return new TextEncoder().encode(s);
    const out = [];
    for (const ch of s) {
      const c = ch.codePointAt(0);
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
      else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return out;
  }

  function hex8(n) { return ("00000000" + (n >>> 0).toString(16)).slice(-8); }

  function fnv1a64(s) {
    const bytes = utf8Bytes(String(s));
    let hi = 0xcbf29ce4, lo = 0x84222325;
    for (let i = 0; i < bytes.length; i++) {
      lo = (lo ^ bytes[i]) >>> 0;
      const loProd = lo * 0x1b3;
      const carry = Math.floor(loProd / 4294967296);
      const newLo = loProd % 4294967296;
      const newHi = (hi * 0x1b3 + carry + ((lo * 256) % 4294967296)) % 4294967296;
      lo = newLo >>> 0;
      hi = newHi >>> 0;
    }
    return hex8(hi) + hex8(lo);
  }

  function hash(value) { return fnv1a64(canonicalJSON(value)); }

  function clone(v) { return v === undefined ? v : JSON.parse(JSON.stringify(v)); }

  /** The brand without updatedAt createdAt ext onboarding creativeMemory hooks.history visual.logo.dataUri. */
  function brandSnapshot(brand) {
    const b = clone(brand) || {};
    ["updatedAt", "createdAt", "ext", "onboarding", "creativeMemory"].forEach(function (k) { delete b[k]; });
    if (b.hooks && typeof b.hooks === "object") delete b.hooks.history;
    if (b.visual && b.visual.logo && typeof b.visual.logo === "object") delete b.visual.logo.dataUri;
    return b;
  }

  /** ResolvedTokens without provenance, adjustments, css and hash (3.2.1). */
  function hashable(tokens) {
    const t = Object.assign({}, tokens);
    ["provenance", "adjustments", "css", "hash"].forEach(function (k) { delete t[k]; });
    return t;
  }

  core.canon = { canonicalJSON: canonicalJSON, fnv1a64: fnv1a64, hash: hash, brandSnapshot: brandSnapshot, hashable: hashable };
})();

  /* ---- file: patch.js ---- */
/* lib/patch.js · JSON patch, the RFC 6902 subset the Studio needs (CONTRACT 4.3.1 and 8.6).
 *
 * Operations: add, remove, replace, test. Paths are JSON Pointers ("/slides/2/title", "-" appends to an array).
 * apply() returns a NEW document and never touches its input; a failing `test` throws CSError("E_CONFLICT"), and so does a
 * path that no longer exists (the document moved on since the patch was made). Malformed operations are E_USAGE.
 */
(function () {
  const core = (CS.core = CS.core || {});
  const OPS = { add: 1, remove: 1, replace: 1, test: 1 };

  function clone(v) { return v === undefined ? v : JSON.parse(JSON.stringify(v)); }
  function isObject(v) { return v !== null && typeof v === "object" && !Array.isArray(v); }

  function parsePointer(path) {
    if (typeof path !== "string" || (path !== "" && path.charAt(0) !== "/")) throw new CS.CSError("E_USAGE", "bad JSON pointer: " + String(path));
    if (path === "") return [];
    return path.slice(1).split("/").map(function (seg) { return seg.replace(/~1/g, "/").replace(/~0/g, "~"); });
  }

  function escapeSegment(seg) { return String(seg).replace(/~/g, "~0").replace(/\//g, "~1"); }

  function conflict(op, why) { return new CS.CSError("E_CONFLICT", "patch " + op.op + " " + op.path + ": " + why, { op: op }); }

  function arrayIndex(seg, length, allowEnd, op) {
    if (seg === "-" && allowEnd) return length;
    if (!/^(0|[1-9][0-9]*)$/.test(seg)) throw conflict(op, "not an array index");
    const i = Number(seg);
    if (i > length || (!allowEnd && i === length)) throw conflict(op, "index out of range");
    return i;
  }

  function resolveParent(doc, segs, op) {
    let node = doc;
    for (let i = 0; i < segs.length - 1; i++) {
      const seg = segs[i];
      if (Array.isArray(node)) node = node[arrayIndex(seg, node.length, false, op)];
      else if (isObject(node) && Object.prototype.hasOwnProperty.call(node, seg)) node = node[seg];
      else throw conflict(op, "path does not exist");
      if (node === undefined) throw conflict(op, "path does not exist");
    }
    return node;
  }

  function sameValue(a, b) { return core.canon ? core.canon.canonicalJSON(a) === core.canon.canonicalJSON(b) : JSON.stringify(a) === JSON.stringify(b); }

  function applyOne(doc, op) {
    if (!isObject(op) || !OPS[op.op]) throw new CS.CSError("E_USAGE", "unsupported patch operation", { op: op });
    const segs = parsePointer(op.path);
    if (segs.length === 0) {
      if (op.op === "test") { if (!sameValue(doc, op.value)) throw conflict(op, "value differs"); return doc; }
      if (op.op === "remove") throw new CS.CSError("E_USAGE", "cannot remove the document root");
      return clone(op.value);
    }
    const parent = resolveParent(doc, segs, op);
    const last = segs[segs.length - 1];
    if (Array.isArray(parent)) {
      if (op.op === "add") { parent.splice(arrayIndex(last, parent.length, true, op), 0, clone(op.value)); return doc; }
      const i = arrayIndex(last, parent.length, false, op);
      if (op.op === "remove") parent.splice(i, 1);
      else if (op.op === "replace") parent[i] = clone(op.value);
      else if (!sameValue(parent[i], op.value)) throw conflict(op, "value differs");
      return doc;
    }
    if (!isObject(parent)) throw conflict(op, "path does not exist");
    const has = Object.prototype.hasOwnProperty.call(parent, last);
    if (op.op === "add") parent[last] = clone(op.value);
    else if (!has) { if (op.op === "test" && op.value === undefined) return doc; throw conflict(op, "path does not exist"); }
    else if (op.op === "remove") delete parent[last];
    else if (op.op === "replace") parent[last] = clone(op.value);
    else if (!sameValue(parent[last], op.value)) throw conflict(op, "value differs");
    return doc;
  }

  /** Apply `ops` in order to a copy of `doc`. */
  function apply(doc, ops) {
    if (!Array.isArray(ops)) throw new CS.CSError("E_USAGE", "a patch is an array of operations");
    let out = clone(doc);
    ops.forEach(function (op) { out = applyOne(out, op); });
    return out;
  }

  function sortedKeys(o) { return Object.keys(o).sort(); }

  function diffInto(a, b, path, out) {
    if (sameValue(a, b)) return;
    if (Array.isArray(a) && Array.isArray(b)) {
      const n = Math.min(a.length, b.length);
      for (let i = 0; i < n; i++) diffInto(a[i], b[i], path + "/" + i, out);
      for (let i = n; i < b.length; i++) out.push({ op: "add", path: path + "/" + i, value: clone(b[i]) });
      for (let i = a.length - 1; i >= b.length; i--) out.push({ op: "remove", path: path + "/" + i });
      return;
    }
    if (isObject(a) && isObject(b)) {
      sortedKeys(a).forEach(function (k) {
        if (!Object.prototype.hasOwnProperty.call(b, k) || b[k] === undefined) out.push({ op: "remove", path: path + "/" + escapeSegment(k) });
      });
      sortedKeys(b).forEach(function (k) {
        if (b[k] === undefined) return;
        const p = path + "/" + escapeSegment(k);
        if (!Object.prototype.hasOwnProperty.call(a, k)) out.push({ op: "add", path: p, value: clone(b[k]) });
        else diffInto(a[k], b[k], p, out);
      });
      return;
    }
    out.push({ op: "replace", path: path, value: clone(b) });
  }

  /** Operations that turn `a` into `b`. Arrays are compared by index, objects by key. */
  function diff(a, b) {
    const out = [];
    diffInto(a, b, "", out);
    return out;
  }

  /** The text a user pastes in chat: the patch plus a `test` on /rev so a stale patch is refused instead of merged blindly. */
  function envelope(spec, ops) {
    const baseRev = spec && typeof spec.rev === "number" ? spec.rev : 0;
    return {
      carouselStudioPatch: 1,
      specId: spec && spec.id,
      baseRev: baseRev,
      patch: [{ op: "test", path: "/rev", value: baseRev }].concat(ops || [])
    };
  }

  core.patch = { apply: apply, diff: diff, envelope: envelope };
})();

  /* ---- file: color.js ---- */
/* lib/color.js · colour maths (CONTRACT 4.3.1).
 *
 * sRGB hex <-> OKLCH, WCAG contrast, linear-light mixing, and `ensureContrast`, which moves a foreground along OKLCH
 * lightness only (hue kept, chroma lowered only to stay inside the sRGB gamut). Colours are opaque "#RRGGBB" strings; results
 * are upper-case. The Python twin is scripts/_cs/color.py; both use the same constants and the same rounding.
 */
(function () {
  const core = (CS.core = CS.core || {});

  const HEX3 = /^#?([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/;
  const HEX6 = /^#?([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/;

  function parse(hex) {
    const s = String(hex).trim();
    let m = HEX6.exec(s);
    if (m) return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
    m = HEX3.exec(s);
    if (m) return { r: parseInt(m[1] + m[1], 16), g: parseInt(m[2] + m[2], 16), b: parseInt(m[3] + m[3], 16) };
    throw new CS.CSError("E_USAGE", "not a hex colour: " + hex);
  }

  function byteHex(v) {
    const n = Math.max(0, Math.min(255, Math.floor(v + 0.5)));
    return (n < 16 ? "0" : "") + n.toString(16).toUpperCase();
  }

  function toHex(rgb) { return "#" + byteHex(rgb.r) + byteHex(rgb.g) + byteHex(rgb.b); }

  function toLinear(c) { const v = c / 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
  function fromLinear(v) { const c = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055; return c * 255; }

  function luminance(hex) {
    const c = parse(hex);
    return 0.2126 * toLinear(c.r) + 0.7152 * toLinear(c.g) + 0.0722 * toLinear(c.b);
  }

  function contrast(fg, bg) {
    const a = luminance(fg), b = luminance(bg);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  }

  /* Oklab (Bjorn Ottosson). */
  function toOklab(hex) {
    const c = parse(hex), r = toLinear(c.r), g = toLinear(c.g), b = toLinear(c.b);
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return {
      L: 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
      a: 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
      b: 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
    };
  }

  function oklabToLinear(L, a, b) {
    const l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * b, 3);
    const m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * b, 3);
    const s = Math.pow(L - 0.0894841775 * a - 1.2914855480 * b, 3);
    return [
      4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
    ];
  }

  function toOklch(hex) {
    const o = toOklab(hex);
    // Neutral sRGB has no hue. Truncated matrix coefficients leave tiny a/b
    // residuals whose atan2 amplifies platform-dependent cube-root rounding.
    const rgb = parse(hex);
    if (rgb.r === rgb.g && rgb.g === rgb.b) return { L: o.L, C: 0, h: 0 };
    let h = Math.atan2(o.b, o.a) * 180 / Math.PI;
    if (h < 0) h += 360;
    const C = Math.sqrt(o.a * o.a + o.b * o.b);
    return { L: o.L, C: C, h: C < 1e-9 ? 0 : h };
  }

  const EPS = 0.0005;
  function inGamut(v) { return v[0] >= -EPS && v[0] <= 1 + EPS && v[1] >= -EPS && v[1] <= 1 + EPS && v[2] >= -EPS && v[2] <= 1 + EPS; }

  function fromOklch(c) {
    const L = Math.max(0, Math.min(1, c.L)), hr = (c.h * Math.PI) / 180;
    const at = function (chroma) { return oklabToLinear(L, chroma * Math.cos(hr), chroma * Math.sin(hr)); };
    let chroma = Math.max(0, c.C);
    let lin = at(chroma);
    if (!inGamut(lin)) {
      let lo = 0, hi = chroma;
      for (let i = 0; i < 28; i++) {
        const mid = (lo + hi) / 2;
        if (inGamut(at(mid))) lo = mid; else hi = mid;
      }
      chroma = lo;
      lin = at(chroma);
    }
    const q = function (v) { return fromLinear(Math.max(0, Math.min(1, v))); };
    return toHex({ r: q(lin[0]), g: q(lin[1]), b: q(lin[2]) });
  }

  /** sRGB linear-light mix; t = 0 gives `a`, t = 1 gives `b`. */
  function mix(a, b, t) {
    const x = parse(a), y = parse(b);
    const m = function (p, q) { return fromLinear(toLinear(p) * (1 - t) + toLinear(q) * t); };
    return toHex({ r: m(x.r, y.r), g: m(x.g, y.g), b: m(x.b, y.b) });
  }

  /** "#111111" or "#FFFFFF", whichever reads better on `bg`. */
  function onColor(bg) { return contrast("#111111", bg) >= contrast("#FFFFFF", bg) ? "#111111" : "#FFFFFF"; }

  const STEP = 0.005;

  /**
   * Smallest lightness move (steps of 0.005) that gives `fg` a contrast of at least `min` on `bg`. Direction: away from the
   * background first; the other way when that cannot reach `min`; white or black as the last resort.
   */
  function ensureContrast(fg, bg, min) {
    if (contrast(fg, bg) >= min) return { hex: toHex(parse(fg)), changed: false, steps: 0 };
    const lch = toOklch(fg);
    const awayFirst = luminance(bg) > 0.18 ? -1 : 1;
    const dirs = [awayFirst, -awayFirst];
    let total = 0;
    for (let d = 0; d < dirs.length; d++) {
      for (let k = 1; ; k++) {
        const L = lch.L + dirs[d] * STEP * k;
        if (L < 0 || L > 1) break;
        total++;
        const hex = fromOklch({ L: L, C: lch.C, h: lch.h });
        if (contrast(hex, bg) >= min) return { hex: hex, changed: true, steps: total };
      }
    }
    const best = contrast("#000000", bg) >= contrast("#FFFFFF", bg) ? "#000000" : "#FFFFFF";
    return { hex: best, changed: true, steps: total };
  }

  core.color = { parse: parse, toHex: toHex, toOklch: toOklch, fromOklch: fromOklch, luminance: luminance, contrast: contrast, mix: mix, ensureContrast: ensureContrast, onColor: onColor };
})();

  /* ---- file: schema.js ---- */
/* lib/schema.js · the JSON Schema subset both engines implement (CONTRACT 3.1).
 *
 * Keywords: type enum const properties required additionalProperties minProperties items minItems maxItems uniqueItems
 * minLength maxLength pattern minimum maximum oneOf anyOf allOf $ref ($defs, local references only).
 * `format` is an annotation and is never enforced. Lengths count Unicode code points. `integer` accepts 3 and 3.0, never true.
 * Errors are { path: JSON Pointer, keyword, message }, sorted by path then keyword; `required` reports the missing
 * property's own path; a oneOf failure is one error at the oneOf path. The Python twin is scripts/_cs/schema.py.
 */
(function () {
  const core = (CS.core = CS.core || {});

  const SCHEMAS = Object.create(null);
  const KINDS = ["brand", "spec", "preset", "occasion", "hook", "plan", "qa-report"];
  const KEYWORDS = {
    type: 1, enum: 1, const: 1, properties: 1, required: 1, additionalProperties: 1, minProperties: 1, items: 1, minItems: 1, maxItems: 1,
    uniqueItems: 1, minLength: 1, maxLength: 1, pattern: 1, minimum: 1, maximum: 1, oneOf: 1, anyOf: 1, allOf: 1, $ref: 1, $defs: 1,
    format: 1, title: 1, description: 1, examples: 1, default: 1, $comment: 1, $schema: 1, $id: 1
  };
  const REGEX_CACHE = Object.create(null);

  function codePoints(s) {
    let n = 0;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length && (s.charCodeAt(i + 1) & 0xfc00) === 0xdc00) i++;
      n++;
    }
    return n;
  }
  function isObject(v) { return v !== null && typeof v === "object" && !Array.isArray(v); }
  function same(a, b) { return core.canon.canonicalJSON(a) === core.canon.canonicalJSON(b); }
  function show(v) { const s = core.canon.canonicalJSON(v); return s.length > 60 ? s.slice(0, 57) + "..." : s; }

  function regexFor(pattern) {
    let re = REGEX_CACHE[pattern];
    if (!re) {
      try { re = new RegExp(pattern, "u"); } catch (e) { re = new RegExp(pattern); } /* "\-" outside a class is legal in the portable subset only without the u flag */
      REGEX_CACHE[pattern] = re;
    }
    return re;
  }

  function typeMatches(type, v) {
    switch (type) {
      case "null": return v === null;
      case "boolean": return typeof v === "boolean";
      case "string": return typeof v === "string";
      case "array": return Array.isArray(v);
      case "object": return isObject(v);
      case "number": return typeof v === "number" && isFinite(v);
      case "integer": return typeof v === "number" && isFinite(v) && Math.floor(v) === v;
      default: return false;
    }
  }

  function resolveRef(ref, root) {
    const m = /^#\/\$defs\/([A-Za-z0-9_.-]+)$/.exec(ref);
    const target = m && root && root.$defs ? root.$defs[m[1]] : undefined;
    if (!target) throw new CS.CSError("E_SCHEMA", "unresolvable $ref " + ref);
    return target;
  }

  function child(path, key) { return path + "/" + String(key).replace(/~/g, "~0").replace(/\//g, "~1"); }

  function check(schema, v, path, root, errs) {
    if (schema === true || schema === undefined) return;
    if (schema === false) { errs.push({ path: path, keyword: "false", message: "is not allowed" }); return; }
    const add = function (keyword, message) { errs.push({ path: path, keyword: keyword, message: message }); };

    if (schema.$ref) check(resolveRef(schema.$ref, root), v, path, root, errs);
    if (schema.allOf) schema.allOf.forEach(function (s) { check(s, v, path, root, errs); });
    if (schema.anyOf) {
      const ok = schema.anyOf.some(function (s) { const e = []; check(s, v, path, root, e); return e.length === 0; });
      if (!ok) add("anyOf", "must match at least one of the allowed alternatives");
    }
    if (schema.oneOf) {
      const n = schema.oneOf.filter(function (s) { const e = []; check(s, v, path, root, e); return e.length === 0; }).length;
      if (n !== 1) add("oneOf", "must match exactly one of the allowed alternatives (matched " + n + ")");
    }
    if (Object.prototype.hasOwnProperty.call(schema, "const") && !same(schema.const, v)) add("const", "must equal " + show(schema.const));
    if (schema.enum && !schema.enum.some(function (x) { return same(x, v); })) {
      add("enum", "must be one of: " + schema.enum.slice(0, 12).map(function (x) { return typeof x === "string" ? x : show(x); }).join(", ") + (schema.enum.length > 12 ? ", ..." : ""));
    }
    if (schema.type !== undefined) {
      const types = Array.isArray(schema.type) ? schema.type : [schema.type];
      if (!types.some(function (t) { return typeMatches(t, v); })) { add("type", "must be of type " + types.join(" or ")); return; }
    }

    if (typeof v === "string") {
      const len = (schema.minLength !== undefined || schema.maxLength !== undefined) ? codePoints(v) : 0;
      if (schema.minLength !== undefined && len < schema.minLength) add("minLength", "must have at least " + schema.minLength + " characters");
      if (schema.maxLength !== undefined && len > schema.maxLength) add("maxLength", "must have at most " + schema.maxLength + " characters");
      if (schema.pattern !== undefined && !regexFor(schema.pattern).test(v)) add("pattern", "does not match the pattern " + schema.pattern);
    } else if (typeof v === "number") {
      if (schema.minimum !== undefined && v < schema.minimum) add("minimum", "must be at least " + schema.minimum);
      if (schema.maximum !== undefined && v > schema.maximum) add("maximum", "must be at most " + schema.maximum);
    } else if (Array.isArray(v)) {
      if (schema.minItems !== undefined && v.length < schema.minItems) add("minItems", "must have at least " + schema.minItems + " items");
      if (schema.maxItems !== undefined && v.length > schema.maxItems) add("maxItems", "must have at most " + schema.maxItems + " items");
      if (schema.uniqueItems) {
        const seen = Object.create(null);
        const dup = v.some(function (x) { const k = core.canon.canonicalJSON(x); if (seen[k]) return true; seen[k] = true; return false; });
        if (dup) add("uniqueItems", "items must be unique");
      }
      if (schema.items) v.forEach(function (x, i) { check(schema.items, x, child(path, i), root, errs); });
    } else if (isObject(v)) {
      const keys = Object.keys(v).filter(function (k) { return v[k] !== undefined; });
      if (schema.required) schema.required.forEach(function (k) { if (keys.indexOf(k) < 0) errs.push({ path: child(path, k), keyword: "required", message: "is required" }); });
      if (schema.minProperties !== undefined && keys.length < schema.minProperties) add("minProperties", "must have at least " + schema.minProperties + " properties");
      keys.forEach(function (k) {
        if (schema.properties && Object.prototype.hasOwnProperty.call(schema.properties, k)) check(schema.properties[k], v[k], child(path, k), root, errs);
        else if (schema.additionalProperties === false) errs.push({ path: child(path, k), keyword: "additionalProperties", message: "is not allowed" });
        else if (isObject(schema.additionalProperties)) check(schema.additionalProperties, v[k], child(path, k), root, errs);
      });
    }
  }

  function sortErrors(errs) {
    return errs.map(function (e, i) { return { e: e, i: i }; }).sort(function (a, b) {
      if (a.e.path !== b.e.path) return a.e.path < b.e.path ? -1 : 1;
      if (a.e.keyword !== b.e.keyword) return a.e.keyword < b.e.keyword ? -1 : 1;
      return a.i - b.i;
    }).map(function (x) { return x.e; });
  }

  /** Validate `value` against a schema object directly (`root` resolves $ref; defaults to the schema itself). */
  function validateAgainst(schema, value, root) {
    const errs = [];
    check(schema, value, "", root || schema, errs);
    const sorted = sortErrors(errs);
    return { ok: sorted.length === 0, errors: sorted };
  }

  function register(kind, schema) {
    if (!isObject(schema)) throw new CS.CSError("E_USAGE", "register(kind, schema): schema must be an object");
    SCHEMAS[kind] = schema;
  }

  function validate(kind, value, opts) {
    const alias = kind === "hook-library" ? { kind: "hook", def: "library" } : null;
    const root = SCHEMAS[alias ? alias.kind : kind];
    if (!root) throw new CS.CSError("E_USAGE", "no schema registered for \"" + kind + "\"");
    const def = (opts && opts.def) || (alias && alias.def) || null;
    const schema = def ? (root.$defs && root.$defs[def]) : root;
    if (!schema) throw new CS.CSError("E_USAGE", "schema \"" + kind + "\" has no definition \"" + def + "\"");
    return validateAgainst(schema, value, root);
  }

  /** Keywords outside the subset (and not annotations) make a schema invalid. Returns the offending "path: keyword" strings. */
  function unsupportedKeywords(schema) {
    const bad = [];
    (function walk(node, path) {
      if (Array.isArray(node)) { node.forEach(function (x, i) { walk(x, path + "/" + i); }); return; }
      if (!isObject(node)) return;
      Object.keys(node).forEach(function (k) {
        if (k === "properties" || k === "$defs") { Object.keys(node[k]).forEach(function (n) { walk(node[k][n], path + "/" + k + "/" + n); }); return; }
        if (k === "enum" || k === "const" || k === "default" || k === "examples" || k === "required") return;
        if (!KEYWORDS[k] && k.slice(0, 2) !== "x-") bad.push(path + ": " + k);
        walk(node[k], path + "/" + k);
      });
    })(schema, "");
    return bad;
  }

  core.schema = { validate: validate, register: register, validateAgainst: validateAgainst, unsupportedKeywords: unsupportedKeywords, KINDS: KINDS };
})();

  /* ---- file: text.js ---- */
/* lib/text.js · the text model of Carousel Studio (CONTRACT 3.3).
 *
 * One definition of a word, a token, a digit system and a bidi isolation, shared by the engine, the QA gates and the Python
 * scripts (scripts/_cs/text.py is the twin; both must give the same verdicts). Offsets are Unicode code points.
 *
 *   normalize  parseMarkup  stripMarkup      NFC; ==emphasis== and forced line breaks
 *   tokenize                                 url email handle tag phone number latin emoji ar space punct
 *   wordCount  charCount                     countable words (a letter or a number inside); code points
 *   toHTML  bind                             the slide-text renderer: LTR isolation, NBSP bindings, .w word spans, <mark>
 *   digits.{detect,convert,formatNumber,counter,remaining}
 *   similarity  skeleton                     Dice over character trigrams of the normalised skeleton
 *   arabic.{hasArabic,hasTashkeel,joiningType,kashida}
 *   slideText                                the visible text of a slide in reading order
 *
 * Where the contract leaves room, the tokenizer is deliberately a little smarter than its literal patterns, and the Python
 * twin does the same: a domain-form URL must end on a label boundary (so "john.doe@x.com" stays an e-mail), a handle does not
 * swallow the sentence's final dot, and a hashtag does not swallow trailing punctuation.
 */
(function () {
  const core = (CS.core = CS.core || {});

  /* ---- character classes (explicit; never \s \d \w) ------------------------------------------------------------- */
  const WS = " \\t\\n\\r\\f\\v\\u00A0\\u202F";
  const AR_CHARS = "\\u0621-\\u064A\\u064B-\\u0652\\u0640\\u066E-\\u06D3\\u06D5\\u06FA-\\u06FF\\u0750-\\u077F\\u08A0-\\u08FF\\uFB50-\\uFDFF\\uFE70-\\uFEFF";
  const NBSP = " ";
  const TATWEEL = "ـ";
  const AI_DIGITS = "٠١٢٣٤٥٦٧٨٩";
  const RE_WS_RUN = new RegExp("[" + WS + "]+");
  const RE_COUNTABLE = /[\p{L}\p{N}]/u;
  const RE_ARABIC = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;
  const RE_TASHKEEL = /[ً-ٰٟ]/;

  const RE_URL_HTTP = new RegExp("https?:\\/\\/[^" + WS + "<>\"]+", "uy");
  const RE_URL_WWW = new RegExp("www\\.[^" + WS + "<>\"]+", "uy");
  const RE_URL_DOMAIN = new RegExp("[A-Za-z0-9-]+(?:\\.[A-Za-z0-9-]+)*\\.[a-z]{2,24}(?:\\/[^" + WS + "<>\"]*)?", "uy");
  const RE_EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/uy;
  const RE_HANDLE = /@[A-Za-z0-9._]{1,30}/uy;
  const RE_TAG = new RegExp("#[^" + WS + "#<>]+", "uy");
  const RE_PHONE = new RegExp("\\+?[0-9][0-9\\u00A0 ()-]{7,}[0-9]", "uy");
  const RE_NUMBER_W = /[$€£]?[0-9]+(?:[.,][0-9]+)*(?:%|[A-Za-z]{1,6})?/uy;
  const RE_NUMBER_AI = /[٠-٩]+(?:[٫٬][٠-٩]+)*٪?/uy;
  const RE_NUMBER_FA = /[۰-۹]+/uy;
  const RE_LATIN = /[A-Za-zÀ-ɏ][A-Za-z0-9À-ɏ'’._\-+/&]*/uy;
  const RE_EMOJI = /[☀-➿⭐⭕\u{1F000}-\u{1FAFF}][️‍☀-➿\u{1F000}-\u{1FAFF}]*/uy;
  const RE_AR = new RegExp("[" + AR_CHARS + "]+", "uy");
  const RE_SPACE = new RegExp("[" + WS + "]+", "uy");
  const RE_DOMAIN_NEXT = /[A-Za-z0-9_%+@-]/;
  const RE_TAG_TRAIL = /[.,;:!?،؛؟)\]}»”…]+$/;
  const RE_TAG_ARABIC = /[ء-يٮ-ۓەۺ-ۿݐ-ݿ]/;

  const LTR_KINDS = { url: 1, email: 1, handle: 1, phone: 1, latin: 1, tag: 1, number: 1 };
  const NO_DIGIT_CONVERSION = { handle: 1, tag: 1, url: 1, email: 1, phone: 1 };

  /* ---- basics ------------------------------------------------------------------------------------------------- */

  function normalize(s) { return String(s === undefined || s === null ? "" : s).normalize("NFC"); }

  function cpLength(s) {
    let n = 0;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length && (s.charCodeAt(i + 1) & 0xfc00) === 0xdc00) i++;
      n++;
    }
    return n;
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"]/g, function (c) { return c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&quot;"; });
  }

  /* ---- markup: ==emphasis== and \n ---------------------------------------------------------------------------- */

  /**
   * `==span==` marks the emphasis span (one per field, not nested, not across a newline); an unmatched `==` is literal.
   * Returns the text without the markers (newlines kept), the span as code point offsets into `plain`, and the offsets of
   * every "\n" in `plain`.
   */
  function parseMarkup(input) {
    const cps = Array.from(normalize(input));
    let open = -1, close = -1;
    for (let i = 0; i + 1 < cps.length && open < 0; i++) {
      if (cps[i] !== "=" || cps[i + 1] !== "=") continue;
      for (let j = i + 2; j + 1 < cps.length; j++) {
        if (cps[j] === "\n") break;
        if (cps[j] === "=" && cps[j + 1] === "=" && j > i + 2) { open = i; close = j; break; }
      }
    }
    let plain, spans = [];
    if (open >= 0) {
      plain = cps.slice(0, open).concat(cps.slice(open + 2, close), cps.slice(close + 2)).join("");
      spans = [{ start: open, end: close - 2 }];
    } else {
      plain = cps.join("");
    }
    const breaks = [];
    const out = Array.from(plain);
    for (let i = 0; i < out.length; i++) if (out[i] === "\n") breaks.push(i);
    return { plain: plain, spans: spans, breaks: breaks };
  }

  /** The text without markers; a newline becomes a space. */
  function stripMarkup(s) { return parseMarkup(s).plain.replace(/\n/g, " "); }

  /* ---- tokenizer ---------------------------------------------------------------------------------------------- */

  function sticky(re, s, pos) { re.lastIndex = pos; const m = re.exec(s); return m && m.index === pos && m[0].length ? m[0] : null; }

  function matchAt(s, pos) {
    let t = sticky(RE_URL_HTTP, s, pos) || sticky(RE_URL_WWW, s, pos);
    if (t) return ["url", t];
    t = sticky(RE_URL_DOMAIN, s, pos);
    if (t && !RE_DOMAIN_NEXT.test(s.charAt(pos + t.length))) return ["url", t];
    t = sticky(RE_EMAIL, s, pos);
    if (t) return ["email", t];
    t = sticky(RE_HANDLE, s, pos);
    if (t) { const trimmed = t.replace(/\.+$/, ""); return ["handle", trimmed.length > 1 ? trimmed : t]; }
    t = sticky(RE_TAG, s, pos);
    if (t) { const trimmed = t.replace(RE_TAG_TRAIL, ""); return ["tag", trimmed.length > 1 ? trimmed : t]; }
    t = sticky(RE_PHONE, s, pos);
    if (t) return ["phone", t];
    t = sticky(RE_NUMBER_W, s, pos) || sticky(RE_NUMBER_AI, s, pos) || sticky(RE_NUMBER_FA, s, pos);
    if (t) return ["number", t];
    t = sticky(RE_LATIN, s, pos);
    if (t) return ["latin", t.replace(/[.\-_/&']+$/, "")];
    t = sticky(RE_EMOJI, s, pos);
    if (t) return ["emoji", t];
    t = sticky(RE_AR, s, pos);
    if (t) return ["ar", t];
    t = sticky(RE_SPACE, s, pos);
    if (t) return ["space", t];
    return ["punct", String.fromCodePoint(s.codePointAt(pos))];
  }

  function isLtrToken(kind, text) {
    if (kind === "tag") return !RE_TAG_ARABIC.test(text);
    if (kind === "number") return /^[$€£]?[0-9]/.test(text);
    return kind === "url" || kind === "email" || kind === "handle" || kind === "phone" || kind === "latin";
  }

  /** Left-to-right scan, first matching pattern wins (CONTRACT 3.3). Offsets are code points of the NFC text. */
  function tokenize(input) {
    const s = normalize(input);
    const out = [];
    let pos = 0, cp = 0;
    while (pos < s.length) {
      const hit = matchAt(s, pos);
      const text = hit[1], n = cpLength(text);
      out.push({ kind: hit[0], text: text, start: cp, end: cp + n, ltr: isLtrToken(hit[0], text) });
      pos += text.length;
      cp += n;
    }
    return out;
  }

  /* ---- counting ----------------------------------------------------------------------------------------------- */

  function words(s) { return stripMarkup(s).split(RE_WS_RUN).filter(function (t) { return t && RE_COUNTABLE.test(t); }); }
  function wordCount(s) { return words(s).length; }
  function charCount(s) { return cpLength(normalize(s)); }

  /* ---- digits ------------------------------------------------------------------------------------------------- */

  function digitsExcluded(tok) { return !!NO_DIGIT_CONVERSION[tok.kind] || (tok.kind === "number" && /[A-Za-z]/.test(tok.text)); }

  /** Western, Arabic-Indic and Persian digits of one number string -> `to`, with the matching separators. */
  function convertNumberText(t, to) {
    if (to === "arabic-indic") {
      let w = t.replace(/[۰-۹]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0x06f0 + 0x0660); });
      w = w.replace(/([0-9])\.(?=[0-9])/g, "$1٫").replace(/([0-9]),(?=[0-9]{3}(?![0-9]))/g, "$1٬");
      return w.replace(/[0-9]/g, function (d) { return AI_DIGITS.charAt(Number(d)); }).replace(/%/g, "٪");
    }
    return t
      .replace(/[٠-٩]/g, function (c) { return String(c.charCodeAt(0) - 0x0660); })
      .replace(/[۰-۹]/g, function (c) { return String(c.charCodeAt(0) - 0x06f0); })
      .replace(/٫/g, ".").replace(/٬/g, ",").replace(/٪/g, "%");
  }

  function detectDigits(s) {
    let western = false, indic = false, persian = false;
    tokenize(s).forEach(function (t) {
      if (t.kind !== "number" || digitsExcluded(t)) return;
      if (/[0-9]/.test(t.text)) western = true;
      if (/[٠-٩]/.test(t.text)) indic = true;
      if (/[۰-۹]/.test(t.text)) persian = true;
    });
    if (persian) return "persian";
    if (western && indic) return "mixed";
    if (western) return "western";
    if (indic) return "arabic-indic";
    return "none";
  }

  function convertDigits(s, to) {
    const target = to === "arabic-indic" ? "arabic-indic" : "western";
    return tokenize(s).map(function (t) { return t.kind === "number" && !digitsExcluded(t) ? convertNumberText(t.text, target) : t.text; }).join("");
  }

  function formatNumber(value, to) { return convertNumberText(String(value), to === "arabic-indic" ? "arabic-indic" : "western"); }

  function digitsOnly(n, to) { return convertNumberText(String(n), to === "arabic-indic" ? "arabic-indic" : "western"); }

  /** "3 من 8" (Arabic) or "3/8" (English). */
  function counter(i, n, to, lang) {
    const a = digitsOnly(i, to), b = digitsOnly(n, to);
    return lang === "en" ? a + "/" + b : a + " من " + b;
  }

  /** "باقي 2" (Arabic) or "2 left" (English). */
  function remaining(k, to, lang) {
    const a = digitsOnly(k, to);
    return lang === "en" ? a + " left" : "باقي " + a;
  }

  /* ---- similarity ---------------------------------------------------------------------------------------------- */

  /** NFC, lower-case Latin, no marks/tatweel, folded hamza/ya/ta marbuta, Western digits, letters and numbers only. */
  function skeleton(s) {
    let t = normalize(s).replace(/[A-Z]/g, function (c) { return c.toLowerCase(); });
    t = t.replace(/[ً-ٰٟـ]/g, "");
    t = t.replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/ؤ/g, "و").replace(/ئ/g, "ي");
    t = t.replace(/[٠-٩]/g, function (c) { return String(c.charCodeAt(0) - 0x0660); }).replace(/[۰-۹]/g, function (c) { return String(c.charCodeAt(0) - 0x06f0); });
    let out = "";
    for (const ch of t) if (RE_COUNTABLE.test(ch)) out += ch;
    return out;
  }

  function trigrams(sk) {
    const cps = Array.from(sk), set = new Set();
    if (cps.length < 3) { set.add(cps.join("")); return set; }
    for (let i = 0; i + 3 <= cps.length; i++) set.add(cps.slice(i, i + 3).join(""));
    return set;
  }

  /** Dice coefficient of the trigram sets of the two skeletons: 1 for two empty skeletons, 0 for one empty. */
  function similarity(a, b) {
    const x = skeleton(a), y = skeleton(b);
    if (!x && !y) return 1;
    if (!x || !y) return 0;
    const A = trigrams(x), B = trigrams(y);
    let inter = 0;
    A.forEach(function (g) { if (B.has(g)) inter++; });
    return (2 * inter) / (A.size + B.size);
  }

  /* ---- Arabic helpers ------------------------------------------------------------------------------------------ */

  function inRanges(cp, ranges) {
    for (let i = 0; i < ranges.length; i += 2) if (cp >= ranges[i] && cp <= ranges[i + 1]) return true;
    return false;
  }

  /* Joining types after ArabicShaping.txt, for U+0621-064A, U+066E-06D3 and U+0750-077F. */
  const JT_RIGHT = [0x0622, 0x0625, 0x0627, 0x0627, 0x0629, 0x0629, 0x062F, 0x0632, 0x0648, 0x0648, 0x0671, 0x0673, 0x0675, 0x0677, 0x0688, 0x0699, 0x06C0, 0x06C0,
    0x06C2, 0x06CB, 0x06CD, 0x06CD, 0x06CF, 0x06CF, 0x06D2, 0x06D3, 0x0759, 0x075B, 0x076B, 0x076C, 0x0771, 0x0771, 0x0773, 0x0774, 0x0778, 0x0779];
  const JT_DUAL = [0x0626, 0x0626, 0x0628, 0x0628, 0x062A, 0x062E, 0x0633, 0x063F, 0x0641, 0x0647, 0x0649, 0x064A, 0x066E, 0x066F, 0x0678, 0x0687, 0x069A, 0x06BF,
    0x06C1, 0x06C1, 0x06CC, 0x06CC, 0x06CE, 0x06CE, 0x06D0, 0x06D1, 0x0750, 0x0758, 0x075C, 0x076A, 0x076D, 0x0770, 0x0772, 0x0772, 0x0775, 0x0777, 0x077A, 0x077F];
  const JT_TRANSPARENT = [0x064B, 0x065F, 0x0670, 0x0670, 0x06D6, 0x06DC, 0x06DF, 0x06E4, 0x06E7, 0x06E8, 0x06EA, 0x06ED];

  function joiningType(cp) {
    if (cp === 0x0640) return "C";
    if (inRanges(cp, JT_TRANSPARENT)) return "T";
    if (inRanges(cp, JT_RIGHT)) return "R";
    if (inRanges(cp, JT_DUAL)) return "D";
    return "U";
  }

  function hasArabic(s) { return RE_ARABIC.test(String(s)); }
  function hasTashkeel(s) { return RE_TASHKEEL.test(String(s)); }

  /** Insertion indices (in code points) after a dual-joining letter and its marks, before a dual- or right-joining letter. */
  function kashidaPositions(word) {
    const cps = Array.from(String(word)), out = [];
    for (let i = 0; i < cps.length; i++) {
      if (joiningType(cps[i].codePointAt(0)) !== "D") continue;
      let k = i + 1;
      while (k < cps.length && joiningType(cps[k].codePointAt(0)) === "T") k++;
      if (k < cps.length) {
        const nt = joiningType(cps[k].codePointAt(0));
        if (nt === "D" || nt === "R") out.push(k);
      }
    }
    return out;
  }

  const KASHIDA_PREFER = "سشصضبنيت";

  /** `count` tatweels at the single best position: after س ش ص ض ب ن ي ت in that order, else the first eligible one. */
  function kashidaApply(word, count) {
    const n = count === undefined ? 3 : count;
    const cps = Array.from(String(word));
    const letters = cps.filter(function (c) { const t = joiningType(c.codePointAt(0)); return t === "D" || t === "R" || t === "U"; }).length;
    if (letters < 3 || cps.indexOf(TATWEEL) >= 0) return String(word);
    const pos = kashidaPositions(word);
    if (!pos.length) return String(word);
    const afterLetter = function (p) {
      let k = p - 1;
      while (k > 0 && joiningType(cps[k].codePointAt(0)) === "T") k--;
      return cps[k];
    };
    let best = pos[0];
    for (let r = 0; r < KASHIDA_PREFER.length; r++) {
      const hit = pos.filter(function (p) { return afterLetter(p) === KASHIDA_PREFER.charAt(r); })[0];
      if (hit !== undefined) { best = hit; break; }
    }
    cps.splice(best, 0, new Array(n + 1).join(TATWEEL));
    return cps.join("");
  }

  const arabic = { hasArabic: hasArabic, hasTashkeel: hasTashkeel, joiningType: joiningType, kashida: { positions: kashidaPositions, apply: kashidaApply } };

  /* ---- NBSP bindings -------------------------------------------------------------------------------------------- */

  const DEFAULT_CLITICS = ["و", "ف", "ب", "ل", "ك", "ال", "وال", "بال", "كال", "فال", "لل", "ولل"];
  const DEFAULT_BIND_LABELS = ["خطوة", "رقم", "نصيحة", "جزء", "حلقة", "فكرة", "أداة", "مرحلة", "درس", "قاعدة", "فصل", "سلايد", "صفحة", "خيار", "طريقة", "غلطة", "خطأ", "مثال", "نسخة", "إصدار", "يوم", "أسبوع", "مستوى", "مرتبة", "ترتيب"];
  let bindCache = { source: null, set: null };

  function bindLabelSet() {
    let entries = null, clitics = DEFAULT_CLITICS;
    try {
      const rules = core.registry && typeof core.registry.rules === "function" ? core.registry.rules() : null;
      if (rules && rules.copy && rules.copy.lists && rules.copy.lists.bindLabels) entries = rules.copy.lists.bindLabels.entries || null;
      if (rules && rules.ortho && Array.isArray(rules.ortho.clitics)) clitics = rules.ortho.clitics;
    } catch (e) { entries = null; }
    if (bindCache.set && bindCache.source === entries) return bindCache.set;
    const set = new Set();
    const add = function (text, withClitics) {
      set.add(text);
      if (withClitics) clitics.forEach(function (c) { set.add(c + text); });
    };
    if (entries) {
      entries.forEach(function (e) {
        if (!e || !e.text || !RE_ARABIC.test(e.text)) return;
        add(e.text.replace(/[ً-ٰٟـ]/g, ""), e.clitics !== false);
      });
    } else {
      DEFAULT_BIND_LABELS.forEach(function (w) { add(w, true); });
    }
    bindCache = { source: entries, set: set };
    return set;
  }

  function isBindLabel(text) { return bindLabelSet().has(text.replace(/[ً-ٰٟـ]/g, "")); }

  /** In place: the single ordinary space between "number + Arabic word" and "bind-label + number" becomes U+00A0. */
  function bindTokens(tokens) {
    for (let i = 0; i + 2 < tokens.length; i++) {
      const a = tokens[i], sp = tokens[i + 1], b = tokens[i + 2];
      if (sp.kind !== "space" || sp.text !== " ") continue;
      if ((a.kind === "number" && b.kind === "ar") || (a.kind === "ar" && b.kind === "number" && isBindLabel(a.text))) sp.text = NBSP;
    }
    return tokens;
  }

  /** Applies the NBSP bindings only; returns plain text. */
  function bind(s) { return bindTokens(tokenize(s)).map(function (t) { return t.text; }).join(""); }

  /* ---- toHTML --------------------------------------------------------------------------------------------------- */

  /**
   * Renders one text field (CONTRACT 3.3, "LTR isolation and binding"). Options: digits ("western"|"arabic-indic"),
   * lang ("ar"|"en"), markup (true), wordSpans (true), indexBase (0), kashidaWord + allowKashida.
   *
   * Arabic context: every LTR run is a <bdi dir="ltr" class="cs-ltr" data-run=...>; consecutive LTR words separated by one
   * ordinary space form ONE run, so their order survives. A run that carries Arabic or punctuation glued to its first or
   * last word keeps that glue in its own .w (a .w cannot open inside a <bdi> and close outside it).
   * English context: Latin and numbers need no isolation; Arabic-script words and phrases are isolated with class cs-rtl.
   */
  function toHTML(input, opts) {
    const o = opts || {};
    const digits = o.digits === "arabic-indic" ? "arabic-indic" : "western";
    const english = o.lang === "en";
    const markup = o.markup !== false;
    const wordSpans = o.wordSpans !== false;
    let widx = o.indexBase || 0;

    const pm = markup ? parseMarkup(input) : { plain: normalize(input), spans: [], breaks: [] };
    const span = pm.spans.length ? pm.spans[0] : null;
    const tokens = tokenize(pm.plain);

    /* digits first: the direction of a number depends on the system it is shown in */
    tokens.forEach(function (t) {
      if (t.kind === "number" && !digitsExcluded(t)) {
        t.text = convertNumberText(t.text, digits);
        t.ltr = digits === "western";
      }
    });
    if (!english) bindTokens(tokens);

    /* foreign = needs its own isolate in this paragraph direction; rtlTag = an Arabic hashtag in an Arabic paragraph */
    const foreign = function (t) {
      if (english) return t.kind === "ar" || (t.kind === "tag" && !t.ltr);
      return t.ltr && !!LTR_KINDS[t.kind];
    };
    const isolate = function (t, text) {
      const body = escapeHtml(text);
      if (english) return '<bdi dir="rtl" class="cs-rtl" data-run="' + (t.kind === "tag" ? "tag" : "ar") + '">' + body + "</bdi>";
      if (t.kind === "tag" && !t.ltr) return '<bdi dir="rtl" class="cs-rtl" data-run="tag">' + body + "</bdi>";
      return '<bdi dir="ltr" class="cs-ltr" data-run="' + t.kind + '">' + body + "</bdi>";
    };
    const plainTag = function (t) { return !english && t.kind === "tag" && !t.ltr; };

    /* kashida: one exact word, never anywhere else */
    let kashidaDone = !(o.kashidaWord && o.allowKashida);
    const kashidaBare = o.kashidaWord ? String(o.kashidaWord).replace(/ـ/g, "") : "";

    /* units: runs of non-space tokens; separators: space tokens */
    const items = [];
    let cur = null;
    tokens.forEach(function (t) {
      if (t.kind === "space") {
        cur = null;
        items.push({ sep: t });
      } else {
        if (!cur) { cur = { tokens: [] }; items.push({ unit: cur }); }
        cur.tokens.push(t);
      }
    });
    const em = function (tokensOf) {
      if (!span || !tokensOf.length) return false;
      const start = tokensOf[0].start, end = tokensOf[tokensOf.length - 1].end;
      return start < span.end && end > span.start;
    };

    const wrap = function (inner, cls) {
      if (!wordSpans) return inner;
      return '<span class="' + (cls || "w") + '" data-w="' + (widx++) + '">' + inner + "</span>";
    };

    const renderTokens = function (toks, kashida) {
      return toks.map(function (t) {
        if (t.kind === "emoji") return '<span class="cs-emoji">' + escapeHtml(t.text) + "</span>";
        if (kashida && t.kind === "ar" && t.text.replace(/ـ/g, "") === kashidaBare) return escapeHtml(kashidaApply(t.text, 3));
        if (foreign(t) || plainTag(t)) return isolate(t, t.text);
        return escapeHtml(t.text);
      }).join("");
    };

    /* a candidate for a merged run: exactly one foreign token, with optional glue before and after it */
    const analyse = function (unit) {
      const idx = [];
      unit.tokens.forEach(function (t, i) { if (foreign(t) && !plainTag(t)) idx.push(i); });
      if (idx.length !== 1) return null;
      return { k: idx[0], before: unit.tokens.slice(0, idx[0]), core: unit.tokens[idx[0]], after: unit.tokens.slice(idx[0] + 1) };
    };

    const nodes = []; /* {t:"sep"|"br"|"w"|"run", ...} */
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.sep) {
        const text = it.sep.text;
        const nl = (text.match(/\n/g) || []).length;
        if (nl) { for (let b = 0; b < nl; b++) nodes.push({ t: "br" }); } else nodes.push({ t: "sep", text: text });
        continue;
      }
      const a = analyse(it.unit);
      if (a) {
        /* try to grow a run over following units */
        const group = [{ unit: it.unit, a: a }];
        let j = i;
        while (!group[group.length - 1].a.after.length && items[j + 1] && items[j + 1].sep && items[j + 1].sep.text === " " && items[j + 2] && items[j + 2].unit) {
          const b = analyse(items[j + 2].unit);
          if (!b || b.before.length) break;
          group.push({ unit: items[j + 2].unit, a: b });
          j += 2;
        }
        if (group.length > 1) {
          const first = group[0].a, last = group[group.length - 1].a;
          if (first.before.length) nodes.push({ t: "w", html: wrap(renderTokens(first.before), "w"), em: em(first.before) });
          const kinds = group.map(function (g) { return g.a.core.kind; });
          const kind = kinds.every(function (k) { return k === kinds[0]; }) ? kinds[0] : "latin";
          const inner = [];
          group.forEach(function (g, gi) {
            if (gi) inner.push({ t: "sep", text: " " });
            inner.push({ t: "w", html: wrap(escapeHtml(g.a.core.text), "w"), em: em([g.a.core]) });
          });
          const emAll = inner.every(function (n) { return n.t === "sep" || n.em; });
          nodes.push({ t: "run", kind: kind, rtl: english, inner: inner, emAll: emAll, em: emAll });
          if (last.after.length) nodes.push({ t: "w", html: wrap(renderTokens(last.after), "w"), em: em(last.after) });
          i = j;
          continue;
        }
      }
      let cls = "w";
      let kashida = false;
      if (!kashidaDone && it.unit.tokens.some(function (t) { return t.kind === "ar" && t.text.replace(/ـ/g, "") === kashidaBare; })) {
        kashidaDone = true;
        kashida = true;
        cls = "w cs-kashida";
      }
      nodes.push({ t: "w", html: wrap(renderTokens(it.unit.tokens, kashida), cls), em: em(it.unit.tokens) });
    }

    const attrs = function (n) {
      return n.rtl ? '<bdi dir="rtl" class="cs-rtl" data-run="ar">' : '<bdi dir="ltr" class="cs-ltr" data-run="' + n.kind + '">';
    };
    const nodeHtml = function (n, insideMark) {
      if (n.t === "sep") return n.text;
      if (n.t === "br") return "<br>";
      if (n.t === "w") return n.html;
      return attrs(n) + renderNodes(n.inner, insideMark || n.emAll) + "</bdi>";
    };
    function renderNodes(list, noMarks) {
      let out = "";
      let i = 0;
      while (i < list.length) {
        if (!noMarks && list[i].em) {
          let j = i, last = i;
          while (j + 1 < list.length) {
            if (list[j + 1].em) { j++; last = j; } else if (list[j + 1].t === "sep") j++; else break;
          }
          out += '<mark class="cs-em" data-m="em">' + list.slice(i, last + 1).map(function (n) { return nodeHtml(n, true); }).join("") + "</mark>";
          i = last + 1;
        } else {
          out += nodeHtml(list[i], noMarks);
          i++;
        }
      }
      return out;
    }
    return renderNodes(nodes, false);
  }

  /* ---- slide text ----------------------------------------------------------------------------------------------- */

  const SLIDE_ORDER = {
    quote: ["body", "attribution"],
    testimonial: ["body", "attribution", "number"],
    offer: ["title", "number", "bullets", "cta"],
    _: ["kicker", "headline", "number", "title", "sub", "body", "bullets", "sides", "attribution", "bridge", "cta"]
  };

  /** All visible text of a slide in reading order, markup removed, digits shown in `digits` when given. */
  function slideText(slide, digits) {
    const s = slide || {};
    const free = CS.visual?.free?.active(s);
    const order = free ? SLIDE_ORDER._.concat("ord") : SLIDE_ORDER[s.type] || SLIDE_ORDER._;
    const out = [];
    const push = function (v) {
      if (typeof v !== "string" && typeof v !== "number") return;
      const t = stripMarkup(String(v)).trim();
      if (t) out.push(digits ? convertDigits(t, digits) : t);
    };
    order.forEach(function (field) {
      const v = s[field];
      if (v === undefined || v === null) return;
      if (field === "bullets") { if (Array.isArray(v)) v.forEach(push); return; }
      if (field === "sides") { if (Array.isArray(v)) v.forEach(function (side) { if (side) { push(side.label); push(side.text); } }); return; }
      if (field === "number") {
        if (v && v.value !== undefined && v.value !== null && String(v.value) !== "") {
          const unit = v.unit ? String(v.unit) : "";
          const raw = String(v.value) + (unit ? (/^[\p{L}]/u.test(unit) ? " " : "") + unit : "");
          out.push(digits ? convertDigits(raw, digits) : raw); /* "74%" in Arabic-Indic digits is "٧٤٪" */
        }
        return;
      }
      if (field === "cta") { if (v && typeof v === "object") push(v.text); return; }
      push(v);
    });
    visualFields(s).forEach(function (f) { push(f[1]); });
    return out;
  }

  // Visible additions, in the same order as the Python text twin; keys are relative to the slide.
  function visualFields(s) {
    const out = [], add = function (key, v) { if (typeof v === "string") out.push([key, v]); };
    (s.items || []).forEach(function (v, i) { add("items." + i, v.title); add("items-text." + i, v.text); add("items-value." + i, v.value); });
    const d = s.demo || {}, free = CS.visual?.free?.active(s), a = free ? {} : (s.visual || {}).anchor || {}, m = a.mock || {};
    if (free) CS.visual.free.literals(s.free.html).forEach(function (v, i) { add("free." + i, v); });
    (d.lines || []).forEach(function (v, i) { add("demo." + i, v.text); }); add("demo-caption", d.caption);
    (a.captions || []).forEach(function (v, i) { add("anchor.captions." + i, v); });
    add("anchor.word", a.word); add("anchor.unit", a.unit);
    ((a.chart || {}).values || []).forEach(function (v, i) { add("chart." + i + ".label", v.label); });
    add("mock.title", m.title);
    (m.lines || []).forEach(function (v, i) { add("mock.lines." + i, v.text); });
    (m.items || []).forEach(function (v, i) { add("mock.items." + i, v); });
    add("mock.caption", m.caption); add("mock.stamp", m.stamp);
    return out;
  }

  core.text = {
    normalize: normalize, parseMarkup: parseMarkup, stripMarkup: stripMarkup, tokenize: tokenize,
    wordCount: wordCount, charCount: charCount,
    toHTML: toHTML, bind: bind,
    digits: { detect: detectDigits, convert: convertDigits, formatNumber: formatNumber, counter: counter, remaining: remaining },
    similarity: similarity, skeleton: skeleton,
    arabic: arabic,
    slideText: slideText, visualFields: visualFields
  };
})();

  /* ---- file: registry.js ---- */
/* core/registry.js · everything the engine knows about the page it runs in. */
(function () {
  var core = (CS.core = CS.core || {});

  var SLIDE_TYPES = ["cover", "rehook", "item", "step", "stat", "compare", "myth-fact", "quote", "story-beat", "checklist", "summary", "setup", "proof", "share", "cta", "offer", "testimonial", "poster", "grid", "timeline"];
  var DIALECTS = ["eg", "gulf", "levant", "msa-white", "en"];
  var RECIPES = ["calm", "counter", "highlight-sweep", "stamp", "reorder", "story", "morph", "split", "map-dots", "cash-wipe", "drop-clock", "curtain", "zoom", "notify", "scale", "none"];
  var ROLE_KEYS = ["bg", "surface", "ink", "inkMuted", "accent", "accent2"];
  // Matches styles/index.json; the default is a shipped preset.
  core.DEFAULT_PRESET = "creator";

  /** Geometry of ig-3x4 (platform-instagram.json -> geometry); used until rules are registered. */
  var DEFAULT_GEOMETRY = {
    canvas: { w: 1080, h: 1440 },
    safeBox: { x: 34, y: 45, w: 1012, h: 1350 },
    crop4x5: { x: 0, y: 45, w: 1080, h: 1350 },
    contentBox: { x: 114, y: 125, w: 852, h: 1190 },
    bands: { header: { x: 114, y: 165, w: 852, h: 80, itemMaxHeightPx: 49 }, footer: { x: 114, y: 1165, w: 852, h: 80, itemMaxHeightPx: 49 } },
    keepOuts: [
      { id: "top-left", x: 34, y: 45, w: 200, h: 110 },
      { id: "top-right", x: 846, y: 45, w: 200, h: 110 },
      { id: "bottom-left", x: 34, y: 1255, w: 140, h: 140 },
      { id: "bottom-right", x: 906, y: 1255, w: 140, h: 140 }
    ],
    grid: { columns: 12, columnWidthPx: 56, gutterPx: 16, widthPx: 848, baselinePx: 8, mirrorForRtl: true },
    bodyArea: { x: 114, y: 261, w: 852, h: 888 }
  };

  var state = {
    presets: [],            // [{preset, decor}] in registration order
    presetIndex: {},        // id -> index
    occasions: [],
    occasionIndex: {},
    fonts: [],              // registry.families[]
    fontIndex: {},
    coverage: {},           // id -> coverage entry
    archetypes: {},
    archetypeCss: "",
    rules: null,
    decor: {},              // presetId -> {parts: [{css, ph}]}
    decorLocal: {},         // "presetId|key" -> {key, css}
    constants: null
  };

  function err(code, message, detail) { return new CS.CSError(code, message, detail); }
  function clone(v) { return v === undefined ? v : JSON.parse(JSON.stringify(v)); }
  function rect(o) { return Object.freeze({ x: o.x, y: o.y, w: o.w, h: o.h }); }

  /* ---- geometry / constants --------------------------------------------------------------------------- */

  function platformGeometry() {
    var p = state.rules && state.rules.platform;
    return (p && p.geometry) || DEFAULT_GEOMETRY;
  }

  function canvasSize() {
    var p = state.rules && state.rules.platform;
    var c = p && p.canvases && p.canvases[p.defaultCanvas || "ig-3x4"];
    return c ? { w: c.w, h: c.h } : DEFAULT_GEOMETRY.canvas;
  }

  /** Edge-relative canvas geometry, with optional inner bands and zone padding. */
  function geometry(h, opts) {
    var g = platformGeometry(), base = canvasSize();
    opts = opts || {};
    if (opts.inner && g.inner) g = Object.assign({}, g, { bands: Object.assign({}, g.bands, g.inner.bands), bodyArea: g.inner.bodyArea });
    h = h || base.h;
    var dh = h - base.h;
    var content = { x: g.contentBox.x, y: g.contentBox.y, w: g.contentBox.w, h: g.contentBox.h + dh };
    var header = { x: g.bands.header.x, y: g.bands.header.y, w: g.bands.header.w, h: g.bands.header.h };
    var footer = { x: g.bands.footer.x, y: g.bands.footer.y + dh, w: g.bands.footer.w, h: g.bands.footer.h };
    var body = { x: g.bodyArea.x, y: g.bodyArea.y, w: g.bodyArea.w, h: g.bodyArea.h + dh };
    var plugin = state.rules && state.rules.platform.plugin, pads = plugin && plugin.visual && plugin.visual.zone && plugin.visual.zone.padEnd;
    var key = opts.presetId, ownPad = pads && Object.prototype.hasOwnProperty.call(pads, key);
    var padEnd = opts.padEnd === undefined ? ownPad ? pads[opts.type === "poster" ? "posterType" : key] : 0 : opts.padEnd;
    var keep = g.keepOuts.map(function (k) { return { id: k.id, x: k.x, y: k.y >= base.h / 2 ? k.y + dh : k.y, w: k.w, h: k.h }; });
    return {
      canvas: { w: base.w, h: h }, content: content, header: header, footer: footer, body: body, keepOuts: keep,
      zone: { x: body.x, y: body.y, w: body.w, h: Math.max(0, body.h - padEnd) },
      itemMax: g.bands.footer.itemMaxHeightPx || 49, grid: g.grid
    };
  }

  function buildConstants() {
    var g = platformGeometry(), c = canvasSize();
    var rules = state.rules || {};
    var keep = g.keepOuts.map(function (k) { return Object.freeze({ id: k.id, x: k.x, y: k.y, w: k.w, h: k.h }); });
    return Object.freeze({
      CANVAS: Object.freeze({ w: c.w, h: c.h }),
      SAFE: rect(g.safeBox), CROP_4X5: rect(g.crop4x5), CONTENT: rect(g.contentBox),
      HEADER: rect(g.bands.header), FOOTER: rect(g.bands.footer), BODY: rect(g.bodyArea),
      KEEP_OUTS: Object.freeze(keep), GRID: Object.freeze(clone(g.grid)),
      SLIDE_TYPES: Object.freeze(SLIDE_TYPES.slice()), DIALECTS: Object.freeze(DIALECTS.slice()), RECIPES: Object.freeze(RECIPES.slice()),
      PLATFORM: rules.platform || null, LOCALE: rules.locale || null
    });
  }

  /* The identity of CS.core.constants is stable; its members are re-read after registerRules. */
  var constants = {};
  ["CANVAS", "SAFE", "CROP_4X5", "CONTENT", "HEADER", "FOOTER", "BODY", "KEEP_OUTS", "GRID", "SLIDE_TYPES", "DIALECTS", "RECIPES", "PLATFORM", "LOCALE"].forEach(function (k) {
    Object.defineProperty(constants, k, { enumerable: true, get: function () { return (state.constants || (state.constants = buildConstants()))[k]; } });
  });
  Object.freeze(constants);
  core.constants = constants;

  /* ---- JSON blocks ----------------------------------------------------------------------------------- */

  /** Reads a JSON script block and reverses the builder's comment escape. */
  function readBlock(doc, id) {
    doc = doc || document;
    var el = doc.getElementById ? doc.getElementById(id) : doc.querySelector("#" + id);
    if (!el) return null;
    var text = (el.textContent || "").split("<\\!" + "--").join("<!" + "--");
    if (!text.trim()) return null;
    try { return JSON.parse(text); }
    catch (e) { throw err("E_SCHEMA", "The embedded block #" + id + " is not valid JSON (" + e.message + ").", { block: id }); }
  }

  function defaultConfig() {
    return { engine: CS.version, view: "design", mode: "full", lane: "studio", uiDialect: "eg", buildId: "dev", builtAt: new Date(0).toISOString(), creditFree: false, fonts: [], presets: [], capabilities: [] };
  }

  /** Schema validation is B4's; the engine only asks for it when a validator for the kind is registered. */
  function schemaCheck(kind, value, what) {
    var s = core.schema;
    if (!s || typeof s.validate !== "function") return;
    var res;
    try { res = s.validate(kind, value); } catch (e) { return; }
    if (res && res.ok === false) {
      throw err("E_SCHEMA", what + " is not a valid " + kind + ": " + (res.errors && res.errors[0] ? res.errors[0].path + " " + res.errors[0].message : "invalid"), { errors: res.errors });
    }
  }

  /* ---- presets ----------------------------------------------------------------------------------------- */

  var HEX = /^#[0-9A-Fa-f]{6}$/;

  function lightPreset(p) {
    var bad = [];
    if (!p || typeof p !== "object") bad.push("not an object");
    else {
      if (typeof p.id !== "string" || !p.id) bad.push("id");
      ["bg", "ink", "inkMuted", "accent"].forEach(function (r) { if (!p.roles || !HEX.test(p.roles[r] || "")) bad.push("roles." + r); });
      ["display", "heading", "body", "latin"].forEach(function (r) { if (!p.type || !p.type[r] || typeof p.type[r].family !== "string") bad.push("type." + r + ".family"); });
      ["hero", "h1", "h2", "title", "body", "small", "micro"].forEach(function (r) { if (!p.type || !p.type.scale || p.type.scale[r] === undefined) bad.push("type.scale." + r); });
      if (!p.layout || !Array.isArray(p.layout.headlineWidth)) bad.push("layout.headlineWidth");
      if (!p.floors || typeof p.floors.hero !== "number") bad.push("floors");
    }
    if (bad.length) throw err("E_SCHEMA", "Preset" + (p && p.id ? " " + p.id : "") + " is incomplete: " + bad.join(", ") + ".", { missing: bad });
  }

  var PH_OPEN = "\uE000", PH_CLOSE = "\uE001";
  var PH_RE = /\{\{\s*(bg|surface|ink|inkMuted|accent|accent2)\s*\}\}/g;

  /** Splits a flat stylesheet into top-level rules, respecting strings, comments and nested blocks. */
  function splitRules(css) {
    var out = [], depth = 0, start = 0, i = 0, n = css.length, q = null, c;
    while (i < n) {
      c = css.charAt(i);
      if (q) { if (c === "\\") i++; else if (c === q) q = null; }
      else if (c === '"' || c === "'") q = c;
      else if (c === "/" && css.charAt(i + 1) === "*") { var e = css.indexOf("*/", i + 2); i = e < 0 ? n : e + 1; }
      else if (c === "{") depth++;
      else if (c === "}") { depth--; if (depth === 0) { out.push(css.slice(start, i + 1)); start = i + 1; } }
      i++;
    }
    var rest = css.slice(start).trim();
    if (rest) out.push(rest);
    return out;
  }

  function prepareDecor(css) {
    css = String(css || "").replace(PH_RE, function (m, name) { return PH_OPEN + name + PH_CLOSE; });
    return splitRules(css).map(function (r) { return { css: r, ph: r.indexOf(PH_OPEN) >= 0 }; });
  }

  function fillPlaceholders(text, roles) {
    return text.replace(new RegExp(PH_OPEN + "(bg|surface|ink|inkMuted|accent|accent2)" + PH_CLOSE, "g"), function (m, name) { return encodeURIComponent(roles[name] || roles.accent || "#000000"); });
  }

  /** Colour roles of a preset with the defaults of CONTRACT 6.2 filled in (surface, accent2). */
  function presetRoles(preset) {
    var r = preset.roles, C = core.color;
    var surface = r.surface || (C ? C.mix(r.bg, r.ink, 0.04) : r.bg);
    return { bg: r.bg, surface: surface, ink: r.ink, inkMuted: r.inkMuted, accent: r.accent, accent2: r.accent2 || r.accent };
  }

  function registerPreset(preset, decorCss) {
    lightPreset(preset);
    schemaCheck("preset", preset, "Preset " + preset.id);
    var entry = { preset: preset, decor: String(decorCss || "") };
    if (Object.prototype.hasOwnProperty.call(state.presetIndex, preset.id)) state.presets[state.presetIndex[preset.id]] = entry;
    else { state.presetIndex[preset.id] = state.presets.length; state.presets.push(entry); }
    state.decor[preset.id] = prepareDecor(entry.decor);
    Object.keys(state.decorLocal).forEach(function (k) { if (k.indexOf(preset.id + "|") === 0) delete state.decorLocal[k]; });
    ensureDecorStyle(preset.id);
  }

  /** Supplies a preset's decor sheet when the host has not embedded it. */
  function ensureDecorStyle(id) {
    if (typeof document === "undefined" || !document.head) return;
    var list = document.querySelectorAll("style[data-cs-decor]"), el = null, i;
    for (i = 0; i < list.length; i++) { if (list[i].getAttribute("data-cs-decor") === id) { el = list[i]; break; } }
    if (el && !el.hasAttribute("data-cs-decor-auto")) return;
    if (!el) { el = document.createElement("style"); el.setAttribute("data-cs-decor", id); el.setAttribute("data-cs-decor-auto", ""); document.head.appendChild(el); }
    el.textContent = decorCss(id);
  }

  function getPreset(id) {
    var i = state.presetIndex[id];
    if (i === undefined) throw err("E_USAGE", "Unknown style preset \"" + id + "\".", { id: id });
    return state.presets[i].preset;
  }

  function hasPreset(id) { return Object.prototype.hasOwnProperty.call(state.presetIndex, id); }
  function listPresets() { return state.presets.map(function (e) { return e.preset; }); }

  /** The preset's decor.css with every colour placeholder filled from the preset's own roles (valid CSS for hosts that style by preset id). */
  function decorCss(presetId) {
    var parts = state.decor[presetId];
    if (!parts) return "";
    var roles = presetRoles(getPreset(presetId));
    return parts.map(function (p) { return p.ph ? fillPlaceholders(p.css, roles) : p.css; }).join("\n");
  }

  /** Resolves colour placeholders in decor rules and scopes them to these roles. */
  function decorLocal(presetId, roles) {
    var parts = state.decor[presetId];
    if (!parts || !parts.some(function (p) { return p.ph; })) return { key: "", css: "" };
    var key = core.canon ? core.canon.hash(ROLE_KEYS.map(function (k) { return roles[k] || ""; })) : ROLE_KEYS.map(function (k) { return roles[k]; }).join("").replace(/#/g, "");
    var ck = presetId + "|" + key;
    if (state.decorLocal[ck]) return state.decorLocal[ck];
    var scope = new RegExp("\\.cs-slide\\[data-preset\\s*=\\s*([\"']?)" + presetId.replace(/[^a-z0-9-]/gi, "") + "\\1\\s*\\]", "g");
    var css = parts.filter(function (p) { return p.ph; }).map(function (p) {
      return fillPlaceholders(p.css, roles).replace(scope, function (m) { return m + '[data-decor-key="' + key + '"]'; });
    }).join("\n");
    return (state.decorLocal[ck] = { key: key, css: css });
  }

  /* ---- occasions ------------------------------------------------------------------------------------------ */

  function registerOccasion(pack) {
    if (!pack || typeof pack.id !== "string") throw err("E_SCHEMA", "An occasion pack needs an id.");
    schemaCheck("occasion", pack, "Occasion " + pack.id);
    if (Object.prototype.hasOwnProperty.call(state.occasionIndex, pack.id)) state.occasions[state.occasionIndex[pack.id]] = pack;
    else { state.occasionIndex[pack.id] = state.occasions.length; state.occasions.push(pack); }
  }
  function getOccasion(id) { var i = id == null ? undefined : state.occasionIndex[id]; return i === undefined ? null : state.occasions[i]; }
  function listOccasions() { return state.occasions.slice(); }

  /* ---- fonts ---------------------------------------------------------------------------------------------- */

  /** Merges font metadata ({registry, coverage}); callable again at runtime for an uploaded user font. */
  function registerFonts(meta) {
    var fams = (meta && meta.registry && meta.registry.families) || [];
    fams.forEach(function (f) {
      if (!f || typeof f.id !== "string") return;
      if (Object.prototype.hasOwnProperty.call(state.fontIndex, f.id)) state.fonts[state.fontIndex[f.id]] = f;
      else { state.fontIndex[f.id] = state.fonts.length; state.fonts.push(f); }
    });
    var cov = (meta && meta.coverage && meta.coverage.families) || {};
    Object.keys(cov).forEach(function (id) { state.coverage[id] = cov[id]; });
  }

  function hasFont(id) { return Object.prototype.hasOwnProperty.call(state.fontIndex, id); }
  function fontEntry(id) { return hasFont(id) ? state.fonts[state.fontIndex[id]] : null; }
  function fontIds() { return state.fonts.map(function (f) { return f.id; }); }
  /** CSS family name of a registry id ("" for an unknown id). */
  function fontCss(id) { var f = fontEntry(id); return f ? f.family : ""; }

  function inRanges(ranges, cp) {
    var lo = 0, hi = ranges.length - 1;
    while (lo <= hi) {
      var mid = (lo + hi) >> 1, r = ranges[mid];
      if (cp < r[0]) hi = mid - 1; else if (cp > r[1]) lo = mid + 1; else return true;
    }
    return false;
  }

  /** True when the font covers the code point; true as well when no coverage data is registered for the font (cannot be judged). */
  function fontHas(id, cp) {
    var c = state.coverage[id];
    if (!c || !Array.isArray(c.ranges)) return true;
    return inRanges(c.ranges, cp);
  }

  function isInvisibleOrEmoji(cp) {
    return cp < 0x20 || (cp >= 0x7f && cp <= 0x9f) || cp === 0x20 || cp === 0xa0 || cp === 0x202f ||
      (cp >= 0x200b && cp <= 0x200f) || (cp >= 0x2028 && cp <= 0x202e) || (cp >= 0x2060 && cp <= 0x2064) ||
      (cp >= 0xfe00 && cp <= 0xfe0f) || cp === 0xfeff ||
      (cp >= 0x2600 && cp <= 0x27bf) || cp === 0x2b50 || cp === 0x2b55 || (cp >= 0x1f000 && cp <= 0x1faff);
  }

  /**
   * Code points of `text` that the font lacks. Whitespace, zero-width and bidi controls and emoji (drawn by the system emoji
   * font inside .cs-emoji) are not judged.
   */
  function missingGlyphs(id, text) {
    var seen = {}, out = [];
    for (var ch of String(text == null ? "" : text)) {
      var cp = ch.codePointAt(0);
      if (seen[cp] || isInvisibleOrEmoji(cp)) continue;
      seen[cp] = true;
      if (!fontHas(id, cp)) out.push(cp);
    }
    return out.sort(function (a, b) { return a - b; });
  }

  /* ---- archetypes --------------------------------------------------------------------------------------- */

  function words(s) { return String(s || "").split(/[ \t\n\r\f]+/).filter(Boolean); }

  /** Registers the <template data-archetype> partials found under `root` and makes sure their layout sheet is in the document. */
  function registerArchetypes(root) {
    root = root || document;
    var found = 0;
    var css = root.querySelector ? root.querySelector("#cs-archetype-css") : null;
    root.querySelectorAll("template[data-archetype]").forEach(function (t) {
      var type = t.getAttribute("data-archetype");
      if (SLIDE_TYPES.indexOf(type) < 0) throw err("E_SCHEMA", "Unknown archetype \"" + type + "\".", { type: type });
      var main = t.content && t.content.firstElementChild;
      if (!main || !main.classList.contains("cs-content")) throw err("E_SCHEMA", "Archetype \"" + type + "\" must start with <main class=\"cs-content\">.", { type: type });
      var variants = words(t.getAttribute("data-variants"));
      var def = t.getAttribute("data-default-variant") || variants[0];
      state.archetypes[type] = { type: type, variants: variants, defaultVariant: def, chrome: words(t.getAttribute("data-chrome")), template: t };
      found++;
    });
    if (css) state.archetypeCss = css.textContent || "";
    if (state.archetypeCss && !document.getElementById("cs-archetype-css")) {
      var style = document.createElement("style");
      style.id = "cs-archetype-css";
      style.textContent = state.archetypeCss;
      (document.head || document.documentElement).appendChild(style);
    }
    layerLayoutBelowDecor();
    return found;
  }

  /** Keeps layout below decor so equal-specificity preset rules win. */
  function layerLayoutBelowDecor() {
    if (typeof document === "undefined") return;
    var layout = document.getElementById("cs-archetype-css"), firstDecor = document.querySelector("style[data-cs-decor]");
    if (!layout || !firstDecor || !firstDecor.parentNode) return;
    if (firstDecor.compareDocumentPosition(layout) & 4 /* Node.DOCUMENT_POSITION_FOLLOWING */) firstDecor.parentNode.insertBefore(layout, firstDecor);
  }

  function getArchetype(type) {
    var a = state.archetypes[type];
    if (!a) throw err("E_USAGE", "No archetype registered for slide type \"" + type + "\".", { type: type });
    return a;
  }

  function archetypeCss() { return state.archetypeCss; }

  /* ---- rules ------------------------------------------------------------------------------------------------ */

  function registerRules(bundle) {
    if (!bundle || !bundle.platform || !bundle.locale) throw err("E_SCHEMA", "registerRules needs at least the platform and locale blocks.");
    state.rules = {
      qaRules: bundle.qaRules || null, copy: bundle.copy || null, ortho: bundle.ortho || null,
      dialects: bundle.dialects || {}, platform: bundle.platform, locale: bundle.locale
    };
    state.constants = null;
  }

  function rules() {
    if (!state.rules) throw err("E_USAGE", "Rule data is not registered (CS.core.registry.registerRules or loadPage).");
    return state.rules;
  }

  /* ---- the page ----------------------------------------------------------------------------------------------- */

  /** Loads embedded page data and registers its rules, fonts, presets and occasions. */
  function loadPage(doc) {
    doc = doc || document;
    var rulesBlock = readBlock(doc, "cs-rules");
    if (rulesBlock) registerRules(rulesBlock);
    var fonts = readBlock(doc, "cs-fonts-meta");
    if (fonts) registerFonts(fonts);

    var decor = {};
    doc.querySelectorAll("style[data-cs-decor]").forEach(function (s) { decor[s.getAttribute("data-cs-decor")] = s.textContent || ""; });
    (readBlock(doc, "cs-presets") || []).forEach(function (p) { registerPreset(p, decor[p.id] || ""); });
    (readBlock(doc, "cs-occasions") || []).forEach(registerOccasion);
    registerArchetypes(doc);

    return {
      spec: readBlock(doc, "cs-spec"), brand: readBlock(doc, "cs-brand"), plan: readBlock(doc, "cs-plan"),
      ideas: readBlock(doc, "cs-ideas") || [], posts: readBlock(doc, "cs-posts") || [],
      config: readBlock(doc, "cs-config") || defaultConfig()
    };
  }

  core.registry = {
    loadPage: loadPage, readBlock: readBlock, defaultConfig: defaultConfig,
    registerPreset: registerPreset, getPreset: getPreset, hasPreset: hasPreset, listPresets: listPresets,
    registerOccasion: registerOccasion, getOccasion: getOccasion, listOccasions: listOccasions,
    registerFonts: registerFonts, fontCss: fontCss, fontHas: fontHas, missingGlyphs: missingGlyphs, hasFont: hasFont, fontEntry: fontEntry, fontIds: fontIds,
    registerArchetypes: registerArchetypes, getArchetype: getArchetype,
    registerRules: registerRules, rules: rules,
    archetypeCss: archetypeCss, decorCss: decorCss, decorLocal: decorLocal,
    presetRoles: presetRoles, geometry: geometry
  };
})();

  /* ---- file: resolve.js ---- */
/* core/resolve.js · the layer model (CONTRACT 6.4). */
(function () {
  var core = (CS.core = CS.core || {});

  var ROLE_KEYS = ["bg", "surface", "ink", "inkMuted", "accent", "accent2"];
  var FONT_ROLES = ["display", "heading", "body"];
  var SCALE_KEYS = ["hero", "heroTarget", "h1", "h2", "title", "body", "small", "micro", "numeral"];

  /** The closed set of token paths a post or slide override may touch (CONTRACT 6.4 step 4-5). */
  var OVERRIDE_PATHS = (function () {
    var p = [];
    ROLE_KEYS.forEach(function (r) { p.push("roles." + r); });
    FONT_ROLES.forEach(function (f) { ["family", "wght", "lh"].forEach(function (k) { p.push("type." + f + "." + k); }); });
    p.push("type.latin.family", "type.latin.wght");
    SCALE_KEYS.forEach(function (k) { p.push("type.scale." + k); });
    p.push("layout.align", "layout.coverAnchor", "layout.headlineWidth", "decor.highlight", "decor.numbering", "decor.texture", "decor.motif", "background.kind", "chrome.counter.format", "chrome.swipe.style");
    return p;
  })();

  var ENUMS = {
    "layout.align": ["start", "center"], "layout.coverAnchor": ["top", "center"],
    "decor.highlight": ["bar", "underline", "marker", "color"], "decor.numbering": ["ghost", "pill", "plain"],
    "decor.texture": ["none", "grain", "ruled", "grid", "dots", "paper", "pattern"],
    "background.kind": ["solid", "gradient", "paper", "photo", "pattern"],
    "chrome.counter.format": ["{i} من {n}", "{i}/{n}", "{i}"], "chrome.swipe.style": ["label+chevron", "chevron", "label", "none"]
  };

  var LAYERS = {
    preset: { ar: "الستايل", en: "the style" }, brand: { ar: "البراند", en: "the brand" }, occasion: { ar: "المناسبة", en: "the occasion" },
    post: { ar: "تعديل على البوست", en: "a post override" }, slide: { ar: "تعديل على السلايد", en: "a slide override" }, floor: { ar: "حدّ الجودة", en: "a quality floor" }
  };

  var NAMES = {
    "roles.ink": { ar: "لون النص", en: "text colour" }, "roles.inkMuted": { ar: "لون النص الثانوي", en: "muted text colour" },
    "roles.accent": { ar: "لون التمييز", en: "accent colour" }, "derived.onAccent": { ar: "لون النص فوق التمييز", en: "text colour on the accent" },
    "roles.bg": { ar: "لون الخلفية", en: "background colour" }, "roles.surface": { ar: "لون السطح", en: "surface colour" }, "roles.accent2": { ar: "لون التمييز الثاني", en: "second accent colour" }
  };

  var CSS_TO_PATH = {
    "--cs-bg": "roles.bg", "--cs-surface": "roles.surface", "--cs-ink": "roles.ink", "--cs-ink-muted": "roles.inkMuted", "--cs-accent": "roles.accent", "--cs-accent-2": "roles.accent2",
    "--cs-on-accent": "derived.onAccent", "--cs-line": "derived.line", "--cs-scrim-from": "derived.scrimFrom", "--cs-scrim-to": "derived.scrimTo"
  };

  var RAW = typeof WeakMap === "function" ? new WeakMap() : null;       // tokens -> pre-floor state, so slide() can re-run the floors

  /* ---- small helpers ---------------------------------------------------------------------------------- */

  function clone(v) { return v === undefined ? v : JSON.parse(JSON.stringify(v)); }
  function isNum(n) { return typeof n === "number" && isFinite(n); }
  function num(n) { return +(+n).toFixed(3); }

  function fmt(tpl, params) {
    if (typeof core.format === "function") return core.format(tpl, params);
    return String(tpl).replace(/\{(\w+)\}/g, function (m, k) { return Object.prototype.hasOwnProperty.call(params, k) ? params[k] : m; });
  }
  function M(ar, en, params) { return { ar: fmt(ar, params || {}), en: fmt(en, params || {}) }; }

  function normHex(v) {
    if (typeof v !== "string") return null;
    var m = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(v.trim());
    if (!m) return null;
    var h = m[1];
    if (h.length === 3) h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
    return ("#" + h).toUpperCase();
  }

  function getPath(obj, path) {
    var parts = path.split("."), cur = obj;
    for (var i = 0; i < parts.length; i++) { if (cur == null) return undefined; cur = cur[parts[i]]; }
    return cur;
  }

  function setPath(obj, path, value) {
    var parts = path.split("."), cur = obj;
    for (var i = 0; i < parts.length - 1; i++) {
      if (cur[parts[i]] == null || typeof cur[parts[i]] !== "object") cur[parts[i]] = {};
      cur = cur[parts[i]];
    }
    cur[parts[parts.length - 1]] = value;
  }

  function show(v) { return v && typeof v === "object" ? JSON.stringify(v) : String(v); }

  /** Size range within 12..400 (numeral: 640), or null. */
  function parseRange(v, max) {
    var a;
    if (isNum(v)) a = [v, v];
    else if (Array.isArray(v) && v.length === 2) a = [+v[0], +v[1]];
    else if (typeof v === "string") {
      var m = v.trim().split(/[\s,;\-–—]+/).filter(Boolean).map(Number);
      if (m.length === 1) a = [m[0], m[0]]; else if (m.length === 2) a = m;
    }
    if (!a || !isFinite(a[0]) || !isFinite(a[1])) return null;
    a = [Math.round(Math.min(a[0], a[1])), Math.round(Math.max(a[0], a[1]))];
    if (a[0] < 12 || a[1] > (max || 400)) return null;
    return a;
  }

  function parseSize(v) {
    var n = typeof v === "string" ? parseFloat(v) : v;
    if (!isNum(n)) return null;
    n = Math.round(n);
    return n >= 12 && n <= 400 ? n : null;
  }

  /** Validates and normalises one override value for `path`; returns undefined when it is not acceptable. */
  function sanitize(path, value) {
    var m;
    if ((m = /^roles\.(\w+)$/.exec(path))) return normHex(value) || undefined;
    if (/\.family$/.test(path)) return typeof value === "string" && core.registry.hasFont(value) ? value : undefined;
    if (/\.wght$/.test(path)) { var w = typeof value === "string" ? parseFloat(value) : value; return isNum(w) && w >= 100 && w <= 900 ? Math.round(w) : undefined; }
    if (/\.lh$/.test(path)) { var l = typeof value === "string" ? parseFloat(value) : value; return isNum(l) && l >= 1 && l <= 2.2 ? num(l) : undefined; }
    if (path === "type.scale.heroTarget" || path === "type.scale.small" || path === "type.scale.micro") return parseSize(value) || undefined;
    if (/^type\.scale\./.test(path)) return parseRange(value, path === "type.scale.numeral" ? 640 : 400) || undefined;
    if (path === "layout.headlineWidth") {
      var r = typeof value === "string" ? value.trim().split(/[\s,;]+/).map(Number) : value;
      if (Array.isArray(r) && r.length === 2 && isNum(+r[0]) && isNum(+r[1]) && r[0] >= 0.5 && r[1] <= 1 && r[0] <= r[1]) return [num(+r[0]), num(+r[1])];
      return undefined;
    }
    if (path === "decor.motif") { if (value === "none" || value === "" || value === false) return null; return typeof value === "string" && /^[a-z0-9][a-z0-9-]{0,39}$/.test(value) ? value : undefined; }
    if (ENUMS[path]) return ENUMS[path].indexOf(value) >= 0 ? value : undefined;
    return undefined;
  }

  /* ---- state: the layers, before the floors -------------------------------------------------------- */

  function lineHeights() {
    var t = null;
    try { t = core.registry.rules().platform.plugin.type.lineHeight; } catch (e) { t = null; }
    return { display: (t && t.display) || 1.3, heading: (t && t.heading) || 1.35, body: (t && t.body) || 1.6 };
  }

  function stateFromPreset(preset, ctx) {
    var p = clone(preset), lh = lineHeights(), s = p.type.scale;
    function font(f, def) { return { family: f.family, wght: f.wght || 400, lh: isNum(f.lh) ? f.lh : def }; }
    var hero = parseRange(s.hero) || [120, 180];
    var st = {
      ctx: ctx, presetId: p.id, presetVersion: p.version,
      roles: { bg: p.roles.bg, surface: p.roles.surface || null, ink: p.roles.ink, inkMuted: p.roles.inkMuted, accent: p.roles.accent, accent2: p.roles.accent2 || null },
      type: {
        display: font(p.type.display, lh.display), heading: font(p.type.heading, lh.heading), body: font(p.type.body, lh.body),
        latin: { family: p.type.latin.family, wght: p.type.latin.wght || 400 },
        scale: {
          hero: hero, heroTarget: parseSize(s.heroTarget) || Math.round((hero[0] + hero[1]) / 2),
          h1: parseRange(s.h1), h2: parseRange(s.h2), title: parseRange(s.title), body: parseRange(s.body),
          small: Array.isArray(s.small) ? Math.max.apply(null, s.small) : s.small, micro: Array.isArray(s.micro) ? Math.max.apply(null, s.micro) : s.micro
        }
      },
      layout: clone(p.layout),
      decor: { highlight: p.decor.highlight, numbering: p.decor.numbering, texture: p.decor.texture || "none", motif: p.decor.motif || null, kashida: { allowed: !!(p.decor.kashida && p.decor.kashida.allowed), maxWords: 1 } },
      background: { kind: p.background.kind, params: clone(p.background.params || {}) },
      chrome: clone(p.chrome), variants: clone(p.variants || {}), motion: clone(p.motion), floors: clone(p.floors),
      art: clone(p.art || null), tones: clone(p.tones || {}),
      brandBindings: (p.brandBindings || []).slice(),
      locked: {}, prov: {}, hist: {}, notes: []
    };
    if (s.numeral) st.type.scale.numeral = parseRange(s.numeral, 640) || [280, 520];
    OVERRIDE_PATHS.forEach(function (path) {
      var v = getPath(st, path);
      st.prov[path] = "preset";
      st.hist[path] = [{ layer: "preset", value: clone(v) }];
    });
    return st;
  }

  function isLocked(st, path) {
    var keys = Object.keys(st.locked);
    for (var i = 0; i < keys.length; i++) { if (path === keys[i] || path.indexOf(keys[i] + ".") === 0) return true; }
    return false;
  }

  function assign(st, path, value, layer) {
    setPath(st, path, value);
    st.prov[path] = layer;
    (st.hist[path] = st.hist[path] || []).push({ layer: layer, value: clone(value) });
  }

  var IGNORED = {
    locked: { ar: "مقفول من البراند", en: "is locked by the brand" },
    unknown: { ar: "غير مدعوم", en: "is not a supported setting" },
    invalid: { ar: "قيمته غير صالحة", en: "has an invalid value" },
    variant: { ar: "الستايل لا يدعمه", en: "is not supported by the style" }
  };

  /** Records, as an adjustment, a requested change that the layer model refused (locked, unknown, invalid or unsupported). */
  function note(st, path, from, to, why) {
    var r = IGNORED[why] || IGNORED.invalid;
    st.notes.push({
      path: path, from: show(from), to: show(to), reason: "clamp",
      msg: { ar: "تم تجاهل التعديل على " + path + " لأنه " + r.ar + ".", en: "The change to " + path + " was ignored because it " + r.en + "." }
    });
  }

  function applyBrand(st, brand) {
    if (!brand) return;
    var vis = brand.visual || {}, pal = vis.palette || {}, bind = st.brandBindings;
    st.artSupport = clone(vis.art && vis.art.support);
    var given = {};
    ROLE_KEYS.forEach(function (role) {
      var hex = bind.indexOf(role) >= 0 ? normHex(pal[role]) : null;
      if (hex) { assign(st, "roles." + role, hex, "brand"); given[role] = true; }
    });
    /* a surface or second accent that the brand did not choose must follow the colours it did choose, not keep the preset's literal */
    if ((given.bg || given.ink) && !given.surface && st.roles.surface) assign(st, "roles.surface", null, "brand");
    if (given.accent && !given.accent2 && st.roles.accent2) assign(st, "roles.accent2", null, "brand");
    if (bind.indexOf("fonts") >= 0 && vis.fonts) {
      var f = vis.fonts, reg = core.registry;
      if (f.display && reg.hasFont(f.display)) { assign(st, "type.display.family", f.display, "brand"); assign(st, "type.heading.family", f.display, "brand"); }
      if (f.body && reg.hasFont(f.body)) assign(st, "type.body.family", f.body, "brand");
      if (f.latin && reg.hasFont(f.latin)) assign(st, "type.latin.family", f.latin, "brand");
    }
    (vis.locks || []).forEach(function (p) { st.locked[p] = true; });
  }

  var OVERLAY_KEYS = { "roles.accent2": "roles.accent2", "background.texture": "decor.texture", "decor.motif": "decor.motif" };

  /** Applies the overlay of an occasion pack; false when the pack does not allow this preset (then it is as if no occasion were set). */
  function applyOccasion(st, occ) {
    if (!occ || !occ.overlay) return false;
    var ov = occ.overlay, allowedPresets = ov.presetsAllowed || [];
    if (allowedPresets.length && allowedPresets.indexOf(st.presetId) < 0) return false;
    (ov.allowedKeys || []).forEach(function (key) {
      var target = OVERLAY_KEYS[key];
      if (!target || !ov.tokens || ov.tokens[key] === undefined) return;
      if (isLocked(st, key) || isLocked(st, target)) { note(st, target, ov.tokens[key], getPath(st, target), "locked"); return; }
      var v = sanitize(target, ov.tokens[key]);
      if (v === undefined) { note(st, target, ov.tokens[key], getPath(st, target), "invalid"); return; }
      assign(st, target, v, "occasion");
    });
    return true;
  }

  function applyOverrides(st, overrides, layer) {
    if (!overrides) return;
    Object.keys(overrides).sort().forEach(function (path) {
      var raw = overrides[path];
      if (OVERRIDE_PATHS.indexOf(path) < 0) { note(st, path, raw, "", "unknown"); return; }
      if (isLocked(st, path)) { note(st, path, raw, getPath(st, path), "locked"); return; }
      var v = sanitize(path, raw);
      if (v === undefined) { note(st, path, raw, getPath(st, path), "invalid"); return; }
      assign(st, path, v, layer);
    });
  }

  /* ---- floors and derivation ---------------------------------------------------------------------------- */

  function backgroundColors(st, roles) {
    var b = st.background || {}, params = b.params || {};
    function colour(x) { return roles[x] || normHex(x) || null; }
    if (b.kind === "solid" && params.role && params.role !== "bg") return [colour(params.role) || roles.bg];
    if (b.kind === "gradient" && Array.isArray(params.stops) && params.stops.length) {
      var cs = params.stops.map(function (s) { return colour(s[0]); }).filter(Boolean);
      if (cs.length) return cs;
    }
    return [roles.bg];
  }

  function backgroundImage(st, roles) {
    var b = st.background || {}, params = b.params || {};
    function colour(x) { return roles[x] || normHex(x) || roles.bg; }
    if (b.kind === "solid" && params.role && params.role !== "bg") { var c = colour(params.role); return "linear-gradient(" + c + "," + c + ")"; }
    if (b.kind === "gradient" && Array.isArray(params.stops) && params.stops.length > 1) {
      var stops = params.stops.map(function (s) { return colour(s[0]) + (isNum(+s[1]) ? " " + (+s[1]) + "%" : ""); });
      return "linear-gradient(" + (isNum(+params.angle) ? +params.angle : 160) + "deg," + stops.join(",") + ")";
    }
    return "none";
  }

  function onAccentOf(accent, floor) {
    var C = core.color, ink = C.onColor(accent);
    return C.contrast(ink, accent) < floor ? C.ensureContrast(ink, accent, floor).hex : ink;
  }

  // Tone references read base roles; floors use the tone's grounds.
  function resolveArt(t, st) {
    /* a brand accent keeps the preset's own support hues (no rotation: a red brand once got a green and an indigo); a preset without any gets [accent, accent2] */
    var C = core.color, a = t.art, base = t.roles, colors = a.colors || {}, support = st.artSupport || colors.support || [base.accent, base.accent2];
    function ref(v) { return base[v] || normHex(v) || base.ink; }
    function floor(fg, grounds, min) {
      for (var p = 0; p < 3; p++) grounds.forEach(function (bg) { fg = C.ensureContrast(fg, bg, min).hex; });
      return fg;
    }
    function value(v, tone) {
      if (typeof v === "string") return ref(v);
      if (v.mix) return C.mix(ref(v.mix[0]), ref(v.mix[1]), v.mix[2]);
      if (v.lightness) { var c = C.toOklch(ref(v.lightness[0])); c.L = v.lightness[1]; return C.fromOklch(c); }
      if (v.pick) return ref(v.pick[0].filter(function (r) { return C.contrast(ref(r), tone.bg) >= v.pick[1]; })[0] || v.pick[0].slice(-1)[0]);
      if (v.muted) {
        for (var i = 1000; i >= 0; i--) {
          var m = C.mix(tone.ink, tone.bg, i / 1000);
          if (C.contrast(m, tone.bg) >= v.muted && C.contrast(m, tone.surface) >= v.muted) return m;
        }
        return tone.ink;
      }
      return base.ink;
    }
    t.tones = {};
    ["base", "invert", "field"].forEach(function (name) {
      var tone = Object.assign({}, base), raw = (st.tones[name] || {}).roles || {};
      ROLE_KEYS.forEach(function (k) { if (raw[k]) tone[k] = value(raw[k], tone); });
      var grounds = [tone.bg, tone.surface], textMin = Math.max(4.5, t.floors.contrastBody);
      tone.ink = floor(tone.ink, grounds, textMin); tone.inkMuted = floor(tone.inkMuted, grounds, textMin);
      ["ink", "inkMuted"].forEach(function (k) {
        if (grounds.some(function (bg) { return C.contrast(tone[k], bg) < textMin; })) t.adjustments.push({ path: "tones." + name + "." + k, reason: "contrast", from: tone[k], to: tone[k], msg: M("تعذّر بلوغ حد التباين على الخلفيتين.", "The contrast floor could not be reached on both grounds.") });
      });
      if (t.decor.highlight === "color" || a.mark !== "outline" || a.outline < 3) tone.accent = floor(tone.accent, grounds, t.decor.highlight === "color" ? textMin : 3);
      tone.onAccent = onAccentOf(tone.accent, textMin); tone.line = C.mix(tone.ink, tone.bg, 0.82);
      tone.support = support.map(function (s) { return a.mark === "outline" && a.outline >= 3 ? ref(s) : floor(ref(s), grounds, 3); });
      tone.note = ref(colors.note || "surface");
      t.tones[name] = tone;
      ["bg", "surface", "ink", "inkMuted", "accent", "accent2", "onAccent", "line"].forEach(function (k) {
        var cssKey = k.replace(/[A-Z]/g, function (c) { return "-" + c.toLowerCase(); }).replace("accent2", "accent-2");
        t.css["--cs-tone-" + name + "-" + cssKey] = tone[k];
      });
    });
    a.colors = { note: t.tones.base.note, support: t.tones.base.support };
    // Keep outlineColor as a role reference: the art kit resolves it in the selected tone.
    function css(k, v, unit) { t.css["--cs-art-" + k] = String(v == null ? 0 : v) + (unit || ""); }
    ["stroke", "cap", "join", "wobble"].forEach(function (k) { css(k, a[k]); });
    Object.keys(a.radius || {}).forEach(function (k) { css("r-" + k, a.radius[k], "px"); });
    css("outline", a.outline, "px"); css("tilt", a.tilt, "deg");
    css("note", a.colors.note); css("s1", a.colors.support[0]); css("s2", a.colors.support[1]);
    var sh = a.shadow || { kind: "none" };
    css("shadow", sh.kind === "none" ? "none" : (sh.dx || 0) + "px " + (sh.dy || 0) + "px " + (sh.kind === "hard" ? 0 : sh.blur || 0) + "px " + base.ink);
  }

  function finalize(st) {
    var C = core.color, F = clone(st.floors), ctx = st.ctx, adj = st.notes.slice(), prov = clone(st.prov);
    var type = clone(st.type), roles = clone(st.roles);

    /* roles: defaults, then contrast */
    roles.surface = roles.surface || C.mix(roles.bg, roles.ink, 0.04);
    roles.accent2 = roles.accent2 || roles.accent;
    var bgs = backgroundColors(st, roles);

    function shift(path, fg, against, min, nameKey, againstName) {
      var cur = fg, before = C.contrast(fg, against[0]);
      for (var pass = 0; pass < 3; pass++) {
        var okAll = true;
        for (var i = 0; i < against.length; i++) {
          if (C.contrast(cur, against[i]) < min - 1e-6) { cur = C.ensureContrast(cur, against[i], min).hex; okAll = false; }
        }
        if (okAll) break;
      }
      if (cur !== fg) {
        var worst = Math.min.apply(null, against.map(function (a) { return C.contrast(cur, a); }));
        var nm = NAMES[nameKey] || { ar: path, en: path };
        adj.push({
          path: path, from: fg, to: cur, reason: "contrast",
          msg: {
            ar: "عُدّل " + nm.ar + " قليلًا ليصل التباين مع " + againstName.ar + " إلى " + worst.toFixed(1) + " (كان " + before.toFixed(1) + ") والحد المطلوب " + min + ".",
            en: "The " + nm.en + " was nudged lighter or darker so its contrast with " + againstName.en + " reaches " + worst.toFixed(1) + " (it was " + before.toFixed(1) + "; the floor is " + min + ")."
          }
        });
      }
      return cur;
    }

    var BGNAME = { ar: "الخلفية", en: "the background" }, BGSURF = { ar: "الخلفية والسطح", en: "the background and the surface" };
    var inkNew = shift("roles.ink", roles.ink, bgs.concat([roles.surface]), F.contrastBody, "roles.ink", BGSURF);
    if (inkNew !== roles.ink) { roles.ink = inkNew; prov["roles.ink"] = "floor"; }
    var mutedNew = shift("roles.inkMuted", roles.inkMuted, bgs, F.contrastBody, "roles.inkMuted", BGNAME);
    if (mutedNew !== roles.inkMuted) { roles.inkMuted = mutedNew; prov["roles.inkMuted"] = "floor"; }
    if (st.decor.highlight === "color") {
      var accNew = shift("roles.accent", roles.accent, bgs, F.contrastBody, "roles.accent", BGNAME);
      if (accNew !== roles.accent) { roles.accent = accNew; prov["roles.accent"] = "floor"; if (!st.roles.accent2) roles.accent2 = accNew; }
    }

    /* sizes */
    var sc = type.scale;
    [["hero", F.hero], ["body", F.body]].forEach(function (pair) {
      var key = pair[0], min = pair[1], r = sc[key];
      if (r[0] < min) {
        var from = r.slice();
        r[0] = min; if (r[1] < r[0]) r[1] = r[0];
        prov["type.scale." + key] = "floor";
        adj.push({ path: "type.scale." + key, from: show(from), to: show(r), reason: "floor", msg: M("رُفع الحد الأدنى لحجم {key} إلى {min} بكسل.", "The minimum size of {key} was raised to {min} px.", { key: key, min: min }) });
      }
    });
    ["small", "micro"].forEach(function (key) {
      if (sc[key] < F.meta) {
        adj.push({ path: "type.scale." + key, from: String(sc[key]), to: String(F.meta), reason: "floor", msg: M("رُفع حجم {key} إلى {min} بكسل (الحد الأدنى للنص الصغير).", "The {key} size was raised to {min} px (the floor for small text).", { key: key, min: F.meta }) });
        sc[key] = F.meta; prov["type.scale." + key] = "floor";
      }
    });
    ["h1", "h2", "title"].forEach(function (key) { var r = sc[key]; if (r[1] < r[0]) r[1] = r[0]; });
    sc.heroTarget = Math.max(sc.hero[0], Math.min(sc.hero[1], sc.heroTarget));

    /* English posts: a display family without Latin glyphs gives way to the preset's Latin family */
    if (ctx.dialect === "en") {
      FONT_ROLES.forEach(function (role) {
        var f = type[role];
        if (!core.registry.fontHas(f.family, 65)) {
          adj.push({ path: "type." + role + ".family", from: f.family, to: type.latin.family, reason: "floor", msg: M("خط {from} لا يحتوي الحروف اللاتينية، فاستُخدم {to} للنص الإنجليزي.", "{from} has no Latin glyphs, so {to} is used for English text.", { from: f.family, to: type.latin.family }) });
          f.family = type.latin.family; prov["type." + role + ".family"] = "floor";
        }
      });
    }

    /* derived solids */
    var onAcc = C.onColor(roles.accent), onAccFixed = onAccentOf(roles.accent, F.contrastBody);
    if (onAccFixed !== onAcc) adj.push({ path: "derived.onAccent", from: onAcc, to: onAccFixed, reason: "contrast", msg: M("عُدّل لون النص فوق التمييز ليصل التباين إلى {min}.", "The text colour on the accent was adjusted to reach a contrast of {min}.", { min: F.contrastBody }) });
    var scrim = C.mix(roles.bg, roles.ink, 0.55), rgb = C.parse(scrim);
    var derived = { onAccent: onAccFixed, line: C.mix(roles.ink, roles.bg, 0.82), scrimFrom: scrim, scrimTo: "rgba(" + rgb.r + "," + rgb.g + "," + rgb.b + ",0)" };
    prov["derived.onAccent"] = onAccFixed !== onAcc ? "floor" : "preset";
    prov["derived.line"] = prov["derived.scrimFrom"] = prov["derived.scrimTo"] = "preset";

    /* fonts in use */
    var fontIds = [];
    ["display", "heading", "body", "latin"].forEach(function (r) { if (fontIds.indexOf(type[r].family) < 0) fontIds.push(type[r].family); });
    fontIds.forEach(function (id) {
      if (!core.registry.hasFont(id)) throw new CS.CSError("E_FONT_MISSING", "The font \"" + id + "\" is not in the font registry.", { id: id });
    });
    function fontOut(r) { var f = type[r]; return { family: f.family, cssFamily: core.registry.fontCss(f.family), wght: f.wght, lh: f.lh }; }
    var tokens = {
      presetId: st.presetId, presetVersion: st.presetVersion, occasionId: ctx.occasionId || null, digits: ctx.digits, dialect: ctx.dialect,
      roles: roles, derived: derived,
      type: { display: fontOut("display"), heading: fontOut("heading"), body: fontOut("body"), latin: { family: type.latin.family, cssFamily: core.registry.fontCss(type.latin.family), wght: type.latin.wght, lh: type.body.lh }, scale: sc },
      layout: clone(st.layout),
      background: { kind: st.background.kind, params: clone(st.background.params), image: backgroundImage(st, roles) },
      decor: clone(st.decor), chrome: clone(st.chrome), variants: variantMap(st), motion: clone(st.motion), floors: F,
      fonts: fontIds, css: null, provenance: prov, adjustments: adj, hash: ""
    };
    if (st.art) {
      tokens.art = ctx.visualMode === "off" ? null : clone(st.art);
      tokens.visualMode = tokens.art ? ctx.visualMode || "auto" : "off";
    }
    tokens.css = buildCss(tokens, ctx);
    if (tokens.art) resolveArt(tokens, st);
    tokens.hash = core.canon.hash(core.canon.hashable(tokens));
    if (RAW) RAW.set(tokens, st);
    return tokens;
  }

  /** Preset variants, with an archetype default for every registered type. */
  function variantMap(st) {
    var out = {};
    core.constants.SLIDE_TYPES.forEach(function (type) {
      var list = st.variants[type];
      if (!Array.isArray(list) || !list.length) {
        var def = null;
        try { def = core.registry.getArchetype(type).defaultVariant; } catch (e) { def = null; }
        list = def ? [def] : [];
      }
      out[type] = list.slice();
    });
    return out;
  }

  function buildCss(t, ctx) {
    var g = core.registry.geometry(ctx.canvasH, { inner: ctx.inner });
    var css = {}, r = t.roles, d = t.derived, ty = t.type, sc = ty.scale;
    function q(f) { return '"' + f.cssFamily + '"'; }
    css["--cs-bg"] = r.bg; css["--cs-surface"] = r.surface; css["--cs-ink"] = r.ink; css["--cs-ink-muted"] = r.inkMuted; css["--cs-accent"] = r.accent; css["--cs-accent-2"] = r.accent2;
    css["--cs-on-accent"] = d.onAccent; css["--cs-line"] = d.line; css["--cs-scrim-from"] = d.scrimFrom; css["--cs-scrim-to"] = d.scrimTo;
    css["--cs-bg-image"] = t.background.image;
    css["--cs-font-display"] = q(ty.display); css["--cs-font-heading"] = q(ty.heading); css["--cs-font-body"] = q(ty.body); css["--cs-font-latin"] = q(ty.latin);
    css["--cs-wght-display"] = String(ty.display.wght); css["--cs-wght-heading"] = String(ty.heading.wght); css["--cs-wght-body"] = String(ty.body.wght); css["--cs-wght-latin"] = String(ty.latin.wght);
    css["--cs-lh-display"] = String(num(ty.display.lh)); css["--cs-lh-heading"] = String(num(ty.heading.lh)); css["--cs-lh-body"] = String(num(ty.body.lh));
    css["--cs-fs-hero"] = sc.hero[1] + "px"; css["--cs-fs-h1"] = sc.h1[1] + "px"; css["--cs-fs-h2"] = sc.h2[1] + "px"; css["--cs-fs-title"] = sc.title[1] + "px";
    css["--cs-fs-body"] = sc.body[1] + "px"; css["--cs-fs-small"] = sc.small + "px"; css["--cs-fs-micro"] = sc.micro + "px";
    css["--cs-fs-hero-min"] = sc.hero[0] + "px"; css["--cs-fs-hero-max"] = sc.hero[1] + "px";
    css["--cs-fs-title-min"] = sc.title[0] + "px"; css["--cs-fs-title-max"] = sc.title[1] + "px";
    css["--cs-fs-body-min"] = sc.body[0] + "px"; css["--cs-fs-body-max"] = sc.body[1] + "px"; css["--cs-hero-target"] = sc.heroTarget + "px";
    css["--cs-text-align"] = t.layout.align === "center" ? "center" : "start";
    css["--cs-cover-justify"] = t.layout.coverAnchor === "center" ? "center" : "flex-start";
    css["--cs-headline-w-min"] = num(t.layout.headlineWidth[0] * 100) + "%"; css["--cs-headline-w-max"] = num(t.layout.headlineWidth[1] * 100) + "%";
    var grid = g.grid || {};
    css["--cs-w"] = g.canvas.w + "px"; css["--cs-h"] = g.canvas.h + "px";
    css["--cs-pad-x"] = g.content.x + "px"; css["--cs-pad-top"] = g.header.y + "px"; css["--cs-pad-bottom"] = (g.canvas.h - (g.footer.y + g.footer.h)) + "px";
    css["--cs-header-h"] = g.header.h + "px"; css["--cs-footer-h"] = g.footer.h + "px"; css["--cs-footer-item-h"] = g.itemMax + "px";
    css["--cs-body-top"] = g.body.y + "px"; css["--cs-body-h"] = g.body.h + "px";
    if (ctx.inner) css["--cs-footer-pad-x"] = (g.footer.x - g.content.x) + "px";
    css["--cs-gap"] = "16px"; css["--cs-unit"] = (grid.baselinePx || 8) + "px"; css["--cs-col"] = (grid.columnWidthPx || 59) + "px"; css["--cs-gutter"] = (grid.gutterPx || 16) + "px";
    return css;
  }

  /* ---- public API ----------------------------------------------------------------------------------------- */

  function post(spec, brand, opts) {
    opts = opts || {};
    var reg = core.registry, style = (spec && spec.style) || {}, locale = (spec && spec.locale) || {};
    var pin = String(style.presetId || ""), pinParts = pin.split("@");
    var want = String(opts.presetId || pinParts[0] || (brand && brand.visual && brand.visual.presetId) || core.DEFAULT_PRESET).split("@")[0];
    var notes = [], preset;
    if (reg.hasPreset(want)) preset = reg.getPreset(want);
    else {
      var all = reg.listPresets();
      if (!all.length) throw new CS.CSError("E_USAGE", "No style preset is registered.");
      if (!reg.hasPreset(core.DEFAULT_PRESET)) throw new CS.CSError("E_USAGE", "The default style preset is not registered: " + core.DEFAULT_PRESET);
      preset = reg.getPreset(core.DEFAULT_PRESET);
      notes.push({ path: "presetId", from: want, to: preset.id, reason: "clamp", msg: { ar: "الستايل " + want + " غير مثبّت فاستُخدم " + preset.id + ".", en: "The style " + want + " is not installed, so " + preset.id + " is used." } });
    }
    var occId = opts.occasionId === undefined ? style.occasionId : opts.occasionId;
    var ctx = {
      dialect: locale.dialect || "eg", digits: locale.digits || "western", occasionId: null,
      canvasH: (spec && spec.canvas && spec.canvas.h) || core.constants.CANVAS.h, visualMode: style.visualMode
    };
    var st = stateFromPreset(preset, ctx);
    st.notes = notes;
    if (pinParts[1] && pinParts[1] !== preset.version && want === preset.id) {
      st.notes.push({ path: "presetVersion", from: pinParts[1], to: preset.version, reason: "clamp", msg: { ar: "البوست مبني على نسخة " + pinParts[1] + " من الستايل والمثبّت " + preset.version + ".", en: "The post was built on style version " + pinParts[1] + "; version " + preset.version + " is installed." } });
    }
    applyBrand(st, brand);
    var occ = reg.getOccasion(occId);
    if (occ && applyOccasion(st, occ)) ctx.occasionId = occ.id;
    applyOverrides(st, style.overrides, "post");
    return finalize(st);
  }

  /** The variant a slide really uses: its own when the preset styles it, else the preset's default for the type. */
  function variantFor(tokens, slide) {
    var list = (tokens.variants && tokens.variants[slide.type]) || [];
    var def = list[0] || null;
    if (!def) { try { def = core.registry.getArchetype(slide.type).defaultVariant; } catch (e) { def = "base"; } }
    if (slide.variant && slide.variant !== def && list.indexOf(slide.variant) < 0) return { variant: def, fellBack: true, requested: slide.variant };
    return { variant: slide.variant || def, fellBack: false, requested: slide.variant || null };
  }

  function stateOf(tokens) {
    var st = RAW && RAW.get(tokens);
    if (st) return st;
    /* tokens that did not come from post() (for example parsed from JSON): rebuild a state from the values they carry */
    var ctx = { dialect: tokens.dialect, digits: tokens.digits, occasionId: tokens.occasionId, visualMode: tokens.visualMode, canvasH: parseInt(tokens.css && tokens.css["--cs-h"], 10) || core.constants.CANVAS.h };
    var preset = core.registry.getPreset(tokens.presetId);
    st = stateFromPreset(preset, ctx);
    ROLE_KEYS.forEach(function (k) { if (tokens.roles[k]) st.roles[k] = tokens.roles[k]; });
    return st;
  }

  function slideTokens(tokens, slide) {
    var v = variantFor(tokens, slide), has = slide.overrides && Object.keys(slide.overrides).length;
    var inner = !!tokens.art && ["cover", "poster"].indexOf(slide.type) < 0;
    if (!has && !v.fellBack && !inner) return tokens;
    var st = clone(stateOf(tokens));
    st.ctx = Object.assign({}, stateOf(tokens).ctx, { inner: inner });
    if (has) applyOverrides(st, slide.overrides, "slide");
    if (v.fellBack) note(st, "variant", v.requested, v.variant, "variant");
    return finalize(st);
  }

  function lookup(tokens, path) {
    if (CSS_TO_PATH[path]) path = CSS_TO_PATH[path];
    if (/^--cs-/.test(path)) return tokens.css ? tokens.css[path] : undefined;
    return getPath(tokens, path);
  }

  /** «ليه اللون ده؟»: where a token came from and what changed it on the way. */
  function explain(tokens, path) {
    if (CSS_TO_PATH[path]) path = CSS_TO_PATH[path];
    var value = lookup(tokens, path), st = RAW && RAW.get(tokens);
    var layer = (tokens.provenance && tokens.provenance[path]) || "preset";
    var steps = [];
    var hist = st && st.hist[path];
    if (hist) hist.forEach(function (h) { steps.push(LAYERS[h.layer].ar + ": " + show(h.value)); });
    (tokens.adjustments || []).forEach(function (a) { if (a.path === path) steps.push(LAYERS[a.reason === "contrast" || a.reason === "floor" ? "floor" : "slide"].ar + ": " + a.from + " ← " + a.to); });
    if (!steps.length) steps.push(LAYERS[layer].ar + ": " + show(value));
    var nm = NAMES[path] || { ar: path, en: path };
    var adjust = (tokens.adjustments || []).filter(function (a) { return a.path === path; }).pop();
    var msg;
    if (/^derived\./.test(path) && !adjust) {
      msg = { ar: nm.ar + " (" + show(value) + ") يُحسب تلقائيًا من ألوان الستايل.", en: "The " + nm.en + " (" + show(value) + ") is derived automatically from the style's colours." };
    } else {
      msg = { ar: nm.ar + " " + show(value) + " جاي من " + LAYERS[layer].ar + ".", en: "The " + nm.en + " " + show(value) + " comes from " + LAYERS[layer].en + "." };
      if (adjust) { msg.ar += " " + adjust.msg.ar; msg.en += " " + adjust.msg.en; }
    }
    return { path: path, value: value === undefined ? "" : show(value), layer: layer, steps: steps, msg: msg };
  }

  core.resolve = {
    post: post,
    slide: slideTokens,
    explain: explain,
    variantFor: variantFor,
    OVERRIDE_PATHS: OVERRIDE_PATHS
  };
})();

  /* ---- file: compose.js ---- */

(function () {
  var core = (CS.core = CS.core || {});

  var AR_CH = "\\u0621-\\u064A\\u064B-\\u0652\\u0640\\u066E-\\u06D3\\u06D5\\u06FA-\\u06FF\\u0750-\\u077F\\u08A0-\\u08FF\\uFB50-\\uFDFF\\uFE70-\\uFEFF";
  var WS = " \\t\\n\\r\\f\\v\\u00A0\\u202F";
  var RE_LATIN_PUNCT = new RegExp("([" + AR_CH + "])[" + WS + "]*([,;?])(?=[" + WS + "]|$|\\u2026)", "g");
  var RE_SPACE_BEFORE = new RegExp("[" + WS + "]+([\\u060C\\u061B\\u061F])", "g");
  var AR_PUNCT = { ",": "،", ";": "؛", "?": "؟" };

  function T() { return core.text; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function el(tag, cls) { var e = document.createElement(tag); if (cls) e.className = cls; return e; }
  function set(e, attrs) { Object.keys(attrs).forEach(function (k) { if (attrs[k] !== null && attrs[k] !== undefined) e.setAttribute(k, String(attrs[k])); }); return e; }
  function fmt(tpl, params) {
    if (typeof core.format === "function") return core.format(tpl, params);
    return String(tpl).replace(/\{(\w+)\}/g, function (m, k) { return Object.prototype.hasOwnProperty.call(params, k) ? params[k] : m; });
  }

  function slotKey(slideId, slot, index) {
    return slideId + "." + slot + (index === undefined || index === null ? "" : "." + index);
  }

  

  function makeContext(spec, slide, tokens, brand, opts) {
    var locale = spec.locale || {}, slides = spec.slides || [], rules = core.registry.rules();
    var dialect = tokens.dialect || locale.dialect || "eg";
    var lang = dialect === "en" ? "en" : "ar";
    var index = slides.indexOf(slide);
    if (index < 0) index = slides.findIndex(function (s) { return s.id === slide.id; });
    if (index < 0) index = Math.max(0, (slide.n || 1) - 1);
    var swipe = locale.swipeCue || (rules.locale.swipeCue.byAppLanguage || {})[locale.appLanguage || "ar"] || "arrow-rtl";
    var kashidaOwner = null;
    for (var i = 0; i < slides.length; i++) { if (slides[i].kashidaWord) { kashidaOwner = slides[i].id; break; } }
    var steps = slides.filter(function (s) { return s.type === "step"; }).length;
    var archetype = core.registry.getArchetype(slide.type);
    return {
      spec: spec, slide: slide, tokens: tokens, brand: brand || null, opts: opts || {}, rules: rules, locale: rules.locale,
      id: slide.id, type: slide.type, index: index, total: Math.max(slides.length, 1), dialect: dialect, lang: lang, dir: lang === "en" ? "ltr" : "rtl",
      digits: tokens.digits || locale.digits || "western", swipe: swipe, archetype: archetype,
      variant: core.resolve.variantFor(tokens, slide).variant, kashidaOwner: kashidaOwner, steps: steps,
      isEdit: (opts && opts.mode) === "edit", kashida: false
    };
  }

  

  
  function prepText(value, cx) {
    var s = T().normalize(String(value === undefined || value === null ? "" : value));
    s = s.replace(/\.{3,}/g, "…");
    if (cx.lang === "ar") {
      s = s.replace(RE_LATIN_PUNCT, function (m, ch, p) { return ch + AR_PUNCT[p]; });
      s = s.replace(RE_SPACE_BEFORE, "$1");
    }
    return s;
  }

  function html(value, cx, o) {
    o = o || {};
    var opts = { digits: cx.digits, lang: cx.lang, markup: o.markup !== false, wordSpans: o.words !== false };
    if (o.kashidaWord) { opts.kashidaWord = o.kashidaWord; opts.allowKashida = !!cx.tokens.decor.kashida.allowed; }
    return T().toHTML(prepText(value, cx), opts);
  }

  function tagWords(root, slotName) {
    var ws = root.querySelectorAll(".w");
    for (var i = 0; i < ws.length; i++) ws[i].setAttribute("data-m-slot", slotName);
  }

  function lineHeightFor(role, text) {
    if (!T().arabic.hasTashkeel(text)) return null;
    if (role === "hero" || role === "h1") return "calc(var(--cs-lh-display) + 0.15)";
    if (role === "title" || role === "h2") return "calc(var(--cs-lh-heading) + 0.15)";
    return "calc(var(--cs-lh-body) + 0.2)";
  }

  
  function roleFor(node, variant) {
    var by = node.getAttribute("data-role-by-variant");
    if (by) {
      var pairs = by.split(/[ \t]+/);
      for (var i = 0; i < pairs.length; i++) { var kv = pairs[i].split(":"); if (kv[0] === variant && kv[1]) return kv[1]; }
    }
    return node.getAttribute("data-role");
  }

  
  function applyMaxLines(node, variant) {
    var by = node.getAttribute("data-max-lines-by-variant");
    if (!by) return;
    by.split(/[ \t]+/).forEach(function (pair) { var kv = pair.split(":"); if (kv[0] === variant && /^[0-9]+$/.test(kv[1] || "")) node.setAttribute("data-max-lines", kv[1]); });
  }

  function markFit(node, cx, slot, index, role) {
    set(node,{"data-slot-key":slotKey(cx.id,slot,index),"data-role":role});
  }

  
  function vis(kind,cx,arg){var v=(cx.tokens.art||CS.visual?.free?.active(cx.slide))&&cx.type!=="cover"&&CS.visual;return v?.[kind]?.(...kind==="fill"?[arg.kind,cx,arg.index]:kind==="decorate"?[arg,cx]:[cx,arg]);}

  
  function label(n,text,cx,o) {
    o=o||{};
    var s=o.slot||"art",r=o.role||"small",f=cx.rules.platform.plugin.visual.artLabel;
    set(n,{"data-slot":s,"data-index":o.index,"data-kind":"text","data-floor":s==="art"?f[/^(numeral|word|chart)$/.test(r)?r:T().arabic.hasArabic(text)?"arabic":r==="tool"?r:"latin"]:null});
    markFit(n,cx,s,o.index,r);n.innerHTML=html(text,cx);tagWords(n,s);return n;
  }

  

  var FILL = {
    text: function (node, value, cx) {
      var raw = value === undefined || value === null ? "" : String(value);
      var slot = node.getAttribute("data-slot"), role = roleFor(node, cx.variant);
      markFit(node, cx, slot, null, role);
      applyMaxLines(node, cx.variant);
      if(cx.variant==="statement"&&slot===(cx.type==="rehook"?"headline":"body")){role="hero";node.dataset.role=role;node.dataset.maxLines=4;}
      if (!raw.trim()) return false;
      var kw = null;
      if (node.getAttribute("data-field") === "headline" && cx.kashidaOwner === cx.slide.id && cx.slide.kashidaWord && cx.tokens.decor.kashida.allowed) kw = cx.slide.kashidaWord;
      node.innerHTML = html(raw, cx, { kashidaWord: kw });
      tagWords(node, slot);
      if (node.querySelector(".cs-kashida")) cx.kashida = true;
      var lh = lineHeightFor(role, raw);
      if (lh) node.style.lineHeight = lh;
      return true;
    },

    list: function (node, items, cx) {
      if (!Array.isArray(items) || !items.length) return false;
      var slot = node.getAttribute("data-slot"), role = node.getAttribute("data-role"), max = node.getAttribute("data-max-lines"), any = false;
      items.forEach(function (text, i) {
        if (typeof text !== "string" || !text.trim()) return;
        var li = el("li", "cs-bullet");
        set(li, { "data-m": "bullet", "data-m-i": i, "data-slot": slot, "data-field": "bullets", "data-index": i, "data-kind": "text", "data-max-lines": max, "data-edit": "text" });
        markFit(li, cx, slot, i, role);
        li.innerHTML = html(text, cx);
        var icon=vis("fill",cx,{kind:"rowicon",index:i});
        if(icon){icon.setAttribute("data-part","icon");li.insertBefore(icon,li.firstChild);}
        tagWords(li, slot);
        var lh = lineHeightFor(role, text);
        if (lh) li.style.lineHeight = lh;
        if (li.querySelector(".cs-kashida")) cx.kashida = true;
        node.appendChild(li);
        any = true;
      });
      node.removeAttribute("data-edit");
      return any;
    },

    sides: function (node, sides, cx) {
      if (!Array.isArray(sides) || !sides.length) return false;
      var S = cx.locale.slideStrings, defaults = ["", ""];
      if (cx.type === "myth-fact") defaults = [S.mythLabel[cx.dialect], S.factLabel[cx.dialect]];
      var slot = node.getAttribute("data-slot"), role = node.getAttribute("data-role"), max = node.getAttribute("data-max-lines");
      for (var i = 0; i < 2; i++) {
        var s = sides[i] || {}, side = el("div", "cs-side");
        set(side, { "data-side": i, "data-m": "side", "data-m-i": i });
        var label = (s.label && String(s.label).trim()) || defaults[i];
        if (label) {
          var lab = el("span", "cs-side-label");
          lab.innerHTML = html(label, cx, { markup: false, words: false });
          side.appendChild(lab);
        }
        var p = el("p", "cs-side-text");
        set(p, { "data-slot": slot, "data-field": "sides", "data-index": i, "data-kind": "text", "data-max-lines": max, "data-edit": "text" });
        markFit(p, cx, slot, i, role);
        if (s.text) {
          p.innerHTML = html(s.text, cx);
          tagWords(p, slot);
          var lh = lineHeightFor(role, s.text);
          if (lh) p.style.lineHeight = lh;
        }
        side.appendChild(p);
        node.appendChild(side);
      }
      if (cx.type === "compare") node.setAttribute("data-vs", S.versusLabel[cx.dialect]);
      node.removeAttribute("data-edit");
      return true;
    },

    number: function (node, number, cx) {
      if (!number || number.value === undefined || number.value === null || String(number.value) === "") return false;
      var value = String(number.value), decimals = (value.split(".")[1] || "").length;
      markFit(node, cx, node.getAttribute("data-slot"), null, roleFor(node, cx.variant));
      var shown = T().digits.formatNumber(value, cx.digits);
      
      var num = '<bdi dir="ltr" class="' + (cx.digits === "arabic-indic" ? "cs-num" : "cs-ltr cs-num") + '" data-m="num" data-run="number" data-value="' + esc(value) + '" data-decimals="' + decimals + '">' + esc(shown) + "</bdi>";
      var unit = "", unitText = number.unit ? String(number.unit).trim() : "";
      if (unitText === "%" && cx.digits === "arabic-indic") unitText = "٪";
      if (unitText) unit = '<span class="cs-unit" data-m="unit">' + html(unitText, cx, { markup: false, words: false }) + "</span>";
      
      if (unit && cx.dir === "rtl" && !/[\u0600-\u06FF]/.test(unitText)) node.innerHTML = '<bdi dir="ltr" data-unit-join>' + num + unit + "</bdi>";
      else node.innerHTML = num + unit;
      return true;
    },

    ord: function (node, _value, cx) {
      var s = cx.slide, slides = cx.spec.slides || [], n = 0;
      if (typeof s.ord === "number") n = s.ord;
      else if (cx.type !== "story-beat") { for (var i = 0; i <= cx.index; i++) { if (slides[i] && slides[i].type === s.type) n++; } }
      if (!n) return false;
      markFit(node, cx, node.getAttribute("data-slot"), null, roleFor(node, cx.variant));
      var conv = function (x) { return T().digits.convert(String(x), cx.digits); };
      var asLabel = cx.type === "step" && cx.variant !== "ghost-number" && cx.steps > 0;
      var label = asLabel ? fmt(cx.locale.slideStrings.stepLabel[cx.dialect], { i: conv(n), n: conv(cx.steps) }) : conv(n);
      node.setAttribute("data-ord", n);
      node.innerHTML = T().toHTML(prepText(label, cx), { digits: cx.digits, lang: cx.lang, markup: false, wordSpans: false });
      return true;
    },

    cta: function (node, cta, cx) {
      if (!cta || !cta.text || !String(cta.text).trim()) return false;
      var slot = node.getAttribute("data-slot"), role = node.getAttribute("data-role");
      node.setAttribute("data-cta", cta.kind || "");
      var text = el("span", "cs-cta-text");
      set(text, { "data-slot": slot, "data-field": "cta", "data-kind": "text", "data-max-lines": node.getAttribute("data-max-lines"), "data-edit": "text" });
      markFit(text, cx, slot, null, role);
      text.innerHTML = html(cta.text, cx);
      tagWords(text, slot);
      var icon = el("span", "cs-cta-icon");
      icon.setAttribute("aria-hidden", "true");
      node.appendChild(text);
      node.appendChild(icon);
      return true;
    },

    media: function (node, media, cx) {
      if (!media || !media.slot || media.slot === "none") return false;
      var kind = media.slot, asset = findAsset(cx, media.assetId);
      node.setAttribute("data-media-kind", kind);
      if (media.calmZone) node.setAttribute("data-calm", media.calmZone);
      if (media.ai) node.setAttribute("data-ai", "1");
      if (media.assetId) node.setAttribute("data-asset", media.assetId);
      if (!asset) { node.setAttribute("data-media-state", "missing"); return true; }
      if (asset.mirror === "auto" && kind === "icon" && cx.dir === "rtl") node.setAttribute("data-mirror", "1");
      if (asset.aiGenerated) node.setAttribute("data-ai", "1");
      var isVideo = /^video\//.test(asset.mime || "") || asset.kind === "video";
      var inline = kind === "icon" ? inlineSvg(asset) : null;
      if (inline) node.appendChild(inline);
      else if (isVideo) {
        var v = el("video");
        set(v, { src: asset.url, muted: "", playsinline: "", loop: "", preload: "auto", "aria-hidden": "true" });
        v.muted = true;
        node.appendChild(v);
      } else {
        var img = el("img");
        set(img, { src: asset.url, alt: "", decoding: "async", draggable: "false" });
        if (/^https?:/i.test(asset.url)) img.setAttribute("crossorigin", "anonymous");
        node.appendChild(img);
      }
      return true;
    }
  };

  
  function findAsset(cx, id) {
    if (!id) return null;
    var a = null, spec = cx.spec;
    var rec = (spec.assets || []).filter(function (x) { return x.id === id; })[0] || null;
    if (typeof cx.opts.assets === "function") {
      var r = cx.opts.assets(id);
      if (r && r.url) a = { url: r.url, mime: r.mime || (rec && rec.mime) || "", w: r.w, h: r.h };
    }
    if (!a && rec && /^data:/i.test(rec.ref || "")) a = { url: rec.ref, mime: rec.mime || (/^data:([^;,]+)/i.exec(rec.ref) || [])[1] || "" };
    if (!a) return null;
    if (rec) { a.kind = rec.kind; a.mirror = rec.mirror; a.aiGenerated = !!rec.aiGenerated; }
    return a;
  }

  
  function inlineSvg(asset) {
    var m = /^data:image\/svg\+xml(;base64)?,(.*)$/is.exec(asset.url || "");
    if (!m) return null;
    var text;
    try {
      if (m[1]) { var bin = atob(m[2]), bytes = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); text = new TextDecoder("utf-8").decode(bytes); }
      else text = decodeURIComponent(m[2]);
    } catch (e) { return null; }
    var doc = new DOMParser().parseFromString(text, "image/svg+xml");
    var svg = doc.documentElement;
    if (!svg || svg.nodeName.toLowerCase() !== "svg" || doc.getElementsByTagName("parsererror").length) return null;
    var all = Array.prototype.slice.call(svg.querySelectorAll("*")), i2;
    all.unshift(svg);
    for (i2 = all.length - 1; i2 >= 0; i2--) {
      var n = all[i2], tag = n.nodeName.toLowerCase();
      if (n !== svg && (tag === "script" || tag === "foreignobject")) { n.remove(); continue; }
      for (var j = n.attributes.length - 1; j >= 0; j--) {
        var an = n.attributes[j].name, av = n.attributes[j].value;
        if (/^on/i.test(an) || ((an === "href" || an === "xlink:href") && /^\s*javascript:/i.test(av))) n.removeAttribute(an);
      }
    }
    var node = document.importNode(svg, true);
    node.setAttribute("aria-hidden", "true");
    node.setAttribute("focusable", "false");
    return node;
  }

  

  function parseSlot(name, fallback) {
    var m = /^(header|footer)-(start|center|end)$/.exec(name || fallback);
    return m ? { band: m[1], pos: m[2] } : parseSlot(fallback, "header-start");
  }

  function chromeItem(cx, cls, name, slotName, fallback) {
    var p = parseSlot(slotName, fallback), e = el("span", cls);
    set(e, { "data-slot": name, "data-m": name, "data-pos": p.pos });
    return { name: name, band: p.band, pos: p.pos, el: e };
  }

  function counterText(cx) {
    var cfg = cx.tokens.chrome.counter || {}, fmtStr = cfg.format || cx.locale.counter.formats[cx.lang];
    if (cx.lang === "en" && /[\u0600-\u06FF]/.test(fmtStr)) fmtStr = cx.locale.counter.formats.en;
    var conv = function (x) { return T().digits.convert(String(x), cx.digits); };
    return fmt(fmtStr, { i: conv(cx.index + 1), n: conv(cx.total) });
  }

  
  var ARROW_PATHS = { left: "M19 12H5M11 6l-6 6 6 6", right: "M5 12h14M13 6l6 6-6 6" };

  function arrowSvg(dir) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" data-dir="' + dir + '"><path d="' + ARROW_PATHS[dir] + '"/></svg>';
  }

  
  function swipeCue(cx) {
    var style = (cx.tokens.chrome.swipe || {}).style || "label+chevron";
    if (style === "none") return null;
    var label = (cx.locale.swipeCue.labels[cx.swipe] || {})[cx.dialect];
    if (!label) return null;
    var glyph = (/[\u2190\u2192]\s*$/.exec(label) || [""])[0].trim();
    var arrow = glyph === "\u2190" ? "left" : glyph === "\u2192" ? "right" : null;
    var word = label.replace(/\s*[\u2190\u2192]\s*$/, "");
    var i = cx.index + 1, k = cx.total - i, from = cx.locale.counter.remainingFromSlideCount || 2;
    if (i > 1 && k >= 1 && k <= from) word = T().digits.remaining(k, cx.digits, cx.lang);
    if (style === "chevron") return arrow ? { word: null, arrow: arrow } : null;
    if (style === "label") return { word: word, arrow: null };
    return { word: word, arrow: arrow };
  }

  function buildChrome(cx) {
    var t = cx.tokens, ch = t.chrome || {}, brand = cx.brand, arch = cx.archetype.chrome, items = [];
    var isLast = cx.index === cx.total - 1, multi = cx.total > 1;

    if (arch.indexOf("handle") >= 0 && brand && brand.handle) {
      var h = chromeItem(cx, "cs-handle", "handle", ch.handle && ch.handle.slot, "header-start");
      var logoUrl = null;
      if (!ch.handle || ch.handle.logo !== "never") {
        var logo = typeof cx.opts.assets === "function" ? cx.opts.assets("logo") : null;
        logoUrl = (logo && logo.url) || (brand.visual && brand.visual.logo && brand.visual.logo.dataUri) || null;
      }
      var inner = "";
      if (logoUrl) inner += '<img alt="" data-logo decoding="async" draggable="false" src="' + esc(logoUrl) + '">';
      inner += T().toHTML("@" + String(brand.handle).replace(/^@/, ""), { digits: cx.digits, lang: cx.lang, markup: false, wordSpans: false });
      h.el.innerHTML = inner;
      items.push(h);
    }
    var meta = cx.spec.style && cx.spec.style.metaLabel;
    if (arch.indexOf("meta") >= 0 && meta && String(meta).trim()) {
      var m = chromeItem(cx, "cs-meta", "meta", ch.meta && ch.meta.slot, "header-end");
      m.el.innerHTML = html(meta, cx, { markup: false, words: false });
      items.push(m);
    }
    var pill = ch.savePill;
    var showOn = (pill && pill.showOn) || ["cover", "cta"];
    if (arch.indexOf("savepill") >= 0 && pill && showOn.indexOf(cx.type) >= 0) {
      var sp = chromeItem(cx, "cs-savepill", "savepill", pill.slot, "footer-start");
      
      sp.el.innerHTML = "<span>" + html(cx.locale.slideStrings.savePill[cx.dialect], cx, { markup: false, words: false }) + "</span>";
      items.push(sp);
    }
    if (arch.indexOf("counter") >= 0 && multi) {
      var c = chromeItem(cx, "cs-counter", "counter", ch.counter && ch.counter.slot, "footer-center");
      var ctext = counterText(cx);
      
      c.el.innerHTML = /[\u0600-\u06FF]/.test(ctext) ? html(ctext, cx, { markup: false, words: false }) : '<bdi dir="ltr" class="cs-ltr" data-run="number">' + esc(ctext) + "</bdi>";
      items.push(c);
    }
    if (arch.indexOf("swipe") >= 0 && multi && !isLast && cx.swipe !== "neutral") {
      var cue = swipeCue(cx);
      if (cue) {
        var sw = chromeItem(cx, "cs-swipe", "swipe", ch.swipe && ch.swipe.slot, "footer-end");
        sw.el.innerHTML = (cue.word ? html(cue.word, cx, { markup: false, words: false }) : "") + (cue.arrow ? arrowSvg(cue.arrow) : "");
        items.push(sw);
      }
    }

    var header = set(el("header", "cs-header"), { "data-layer": "chrome", "data-m": "chrome" });
    var footer = set(el("footer", "cs-footer"), { "data-layer": "chrome", "data-m": "footer", "data-swipe": cx.swipe });
    var order = ["handle", "meta", "savepill", "counter", "swipe"];
    items.sort(function (a, b) { return order.indexOf(a.name) - order.indexOf(b.name); });
    items.forEach(function (it) { (it.band === "header" ? header : footer).appendChild(it.el); });
    var r=vis("chrome",cx);
    if(r&&r.rail&&c){r=r.rail;var x=el("span","cs-rail");set(x,{"aria-hidden":true,"data-style":r.style});for(var j=0;j<r.n;j++)x.appendChild(set(el("i","cs-rail-seg"),{"data-on":j<=r.on?1:0}));c.el.appendChild(x);}
    return { header: header, footer: footer };
  }

  

  function slide(spec, slideSpec, tokens, brand, opts) {
    opts = opts || {};
    var cx = makeContext(spec, slideSpec, tokens, brand, opts);
    var root = el("section", "cs-slide");
    var canvas = spec.canvas || {};
    set(root, {
      dir: cx.dir, lang: cx.lang, "data-cs-slide": cx.id, "data-n": cx.index + 1, "data-total": cx.total, "data-last": cx.index === cx.total - 1 ? 1 : 0,
      "data-type": cx.type, "data-variant": cx.variant, "data-preset": tokens.presetId, "data-occasion": tokens.occasionId || "",
      "data-dialect": cx.dialect, "data-digits": cx.digits, "data-swipe": cx.swipe, "data-align": tokens.layout.align, "data-cover-anchor": tokens.layout.coverAnchor,
      "data-hl": tokens.decor.highlight, "data-numbering": tokens.decor.numbering, "data-kashida": 0, "data-bgkind": tokens.background.kind,
      "data-texture": tokens.decor.texture && tokens.decor.texture !== "none" ? tokens.decor.texture : null, "data-motif": tokens.decor.motif || null
    });
    Object.keys(tokens.css).forEach(function (k) { root.style.setProperty(k, tokens.css[k]); });
    root.style.width = (canvas.w || core.constants.CANVAS.w) + "px";
    root.style.height = (canvas.h || core.constants.CANVAS.h) + "px";

    var bg = set(el("div", "cs-bg"), { "data-layer": "bg", "data-m": "bg", "aria-hidden": "true" });
    var decor = set(el("div", "cs-decor"), { "data-layer": "decor", "data-m": "decor", "aria-hidden": "true" });
    var bar = buildChrome(cx);

    var main = CS.visual?.free?.compose(cx) || cx.archetype.template.content.firstElementChild.cloneNode(true);
    // bridge is shared spec copy, including on types whose base template has no
    // bridge slot. Keep the template contract and materialize it when supplied.
    if (!main.classList.contains("cs-free") && cx.slide.bridge && !main.querySelector('[data-slot="bridge"]')) {
      main.appendChild(set(el("p", "cs-slot cs-bridge"), { "data-slot": "bridge", "data-field": "bridge", "data-kind": "text", "data-role": "small", "data-max-lines": "2", "data-m": "bridge", "data-optional": "", "data-edit": "text" }));
    }
    vis("begin",cx);
    var bgMedia = (cx.slide.media && cx.slide.media.slot === "plate") || (cx.variant === "photo" && ["cover", "quote", "poster"].indexOf(cx.type) >= 0);
    if (!main.classList.contains("cs-free")) main.querySelectorAll("[data-slot]").forEach(function (node) {
      var kind = node.getAttribute("data-kind"), field = node.getAttribute("data-field");
      var filled = FILL[kind] ? FILL[kind](node, cx.slide[field], cx) : vis("slot",cx,node);
      if (!filled && node.hasAttribute("data-optional")) node.remove();
    });
    var media = main.querySelector(".cs-media-slot");
    if (bgMedia && media) { media.removeAttribute("data-optional"); bg.appendChild(media); }

    root.appendChild(bg);
    root.appendChild(decor);
    root.appendChild(bar.header);
    root.appendChild(main);
    root.appendChild(bar.footer);
    vis("decorate",cx,root);

    var local = core.registry.decorLocal(tokens.presetId, tokens.roles);
    if (local.css) {
      var style = el("style");
      style.setAttribute("data-cs-decor-local", "");
      style.textContent = local.css;
      root.appendChild(style);
      root.setAttribute("data-decor-key", local.key);
    }
    if (cx.kashida) root.setAttribute("data-kashida", "1");

    if (cx.isEdit) {
      root.querySelectorAll('[data-edit="text"]').forEach(function (n) { n.setAttribute("contenteditable", "true"); n.setAttribute("spellcheck", "false"); });
    } else {
      root.querySelectorAll("[data-edit]").forEach(function (n) { n.removeAttribute("data-edit"); });
    }
    return root;
  }

  function chrome(spec, slideSpec, tokens, brand) {
    var cx = makeContext(spec, slideSpec, tokens, brand, {});
    return buildChrome(cx);
  }

  
  function slots(slideEl) {
    var out = [];
    slideEl.querySelectorAll("[data-slot-key]").forEach(function (n) {
      var idx = n.getAttribute("data-index");
      out.push({
        key: n.getAttribute("data-slot-key"), slot: n.getAttribute("data-slot"), el: n, role: n.getAttribute("data-role"),
        field: n.getAttribute("data-field"), index: idx === null ? null : parseInt(idx, 10)
      });
    });
    return out;
  }

  
  function prepare(value, spec) {
    var dialect = ((spec && spec.locale) || {}).dialect || "eg";
    return prepText(value, { lang: dialect === "en" ? "en" : "ar" });
  }

  core.compose = { slide: slide, chrome: chrome, slotKey: slotKey, slots: slots, prepare: prepare, html: html, label: label, context: makeContext };
})();

  /* ---- file: fit.js ---- */
/* core/fit.js · auto-fit text into its box by size, never by tracking (CONTRACT 4.3.2, "Fit algorithm"). */
(function () {
  var core = (CS.core = CS.core || {});

  var PRIORITY = { hero: 0, numeral: 1, word: 1, number: 1, h1: 2, title: 3, h2: 4, body: 5, small: 6, micro: 7 };
  var DEFAULT_LINES = { hero: 3, h1: 3, title: 3, h2: 3, body: 6, number: 1, numeral: 1 };
  var EPS = 0.75;
  var LONE_RATIO = 0.35, BALANCE_RATIO = 0.3, LONE_SEARCH = 0.8;

  function M(ar, en) { return { ar: ar, en: en }; }
  function r2(n) { return Math.round(n * 100) / 100; }

  /* ---- role sizes ------------------------------------------------------------------------------------------ */

  /** {min,max}: the nominal range of a role in px at 1080 wide. */
  function rangeFor(role, tokens) {
    var sc = tokens.type.scale;
    switch (role) {
      case "numeral": var nr = sc.numeral || [280, 520]; return { min: nr[0], max: nr[1] };
      case "word": return { min: 220, max: 520 };
      case "chart": return { min: 38, max: 48 };
      case "hero": return { min: sc.hero[0], max: sc.hero[1] };
      case "number": return { min: Math.round(sc.hero[0] * 1.5), max: sc.hero[1] * 2 };
      case "h1": case "h2": case "title": case "body": return { min: sc[role][0], max: sc[role][1] };
      case "micro": return { min: sc.micro, max: sc.micro };
      default: return { min: sc.small, max: sc.small };
    }
  }

  /* The smallest size a role may reach: hero = floors.hero (96); body and bullets = floors.body (42); small, micro, kicker, bridge, attribution, labels = floors.meta (30); h1/h2/title = round(0.8 x range.min). */
  function floorPx(role, tokens) {
    var F = tokens.floors, sc = tokens.type.scale;
    switch (role) {
      case "numeral": return 200;
      case "word": return 220;
      case "chart": return 38;
      case "hero": case "number": return F.hero;
      case "body": return F.body;
      case "h1": case "h2": case "title": return Math.round(0.8 * sc[role][0]);
      default: return F.meta;
    }
  }

  function slotFloor(el, role, tokens) {
    var floor = parseFloat(el.getAttribute("data-floor"));
    return floor > 0 && isFinite(floor) ? Math.max(12, floor) : Math.min(floorPx(role, tokens), rangeFor(role, tokens).min);
  }

  /* ---- geometry helpers -------------------------------------------------------------------------------------- */

  function slideOf(node) { return node.closest ? node.closest(".cs-slide") : null; }

  function makeCtx(slideEl, tokens) {
    var rr = slideEl.getBoundingClientRect(), ow = slideEl.offsetWidth;
    if (!ow || !rr.width) throw new CS.CSError("E_USAGE", "fit needs a slide that is laid out (attached to the page and not display:none).");
    var scale = rr.width / ow;
    var geo = core.registry.geometry(slideEl.offsetHeight || core.constants.CANVAS.h, { inner: !!(tokens && tokens.art && ["cover", "poster"].indexOf(slideEl.getAttribute("data-type")) < 0) });
    var content = slideEl.querySelector(".cs-content");
    var ctx = { slide: slideEl, tokens: tokens, left: rr.left, top: rr.top, scale: scale, geo: geo, content: content, flow: [], contentBox: null, native: false };
    try { ctx.native = !!(window.CSS && CSS.supports && CSS.supports("text-wrap", "balance")); } catch (e) { ctx.native = false; }
    if (content) {
      /* the stack is measured inside the block padding of the content box: the room an archetype keeps above and below its stack is never spent on text */
      var cb = rel(content.getBoundingClientRect(), ctx), ccs = getComputedStyle(content);
      var padT = parseFloat(ccs.paddingTop) || 0, padB = parseFloat(ccs.paddingBottom) || 0;
      ctx.contentBox = { x: cb.x, y: cb.y + padT, w: cb.w, h: Math.max(0, cb.h - padT - padB) };
      Array.prototype.forEach.call(content.children, function (c) { if (getComputedStyle(c).position !== "absolute") ctx.flow.push(c); });
    }
    return ctx;
  }

  function rel(r, ctx) { return { x: (r.left - ctx.left) / ctx.scale, y: (r.top - ctx.top) / ctx.scale, w: r.width / ctx.scale, h: r.height / ctx.scale }; }

  function intersects(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }

  /** Word boxes of a slot grouped into physical lines (a new line starts when the vertical centre moves by more than 0.6 of the font size). */
  function measure(node, ctx, px, words) {
    var units = words || wordsOf(node), lines = [], cur = null, thr = 0.6 * px * ctx.scale;
    var minL = Infinity, maxR = -Infinity;
    for (var i = 0; i < units.length; i++) {
      var rs = units[i].getClientRects();
      if (!rs.length) continue;
      var r = rs[0], l = r.left, rt = r.right, t = r.top, b = r.bottom, j;
      for (j = 1; j < rs.length; j++) { l = Math.min(l, rs[j].left); rt = Math.max(rt, rs[j].right); t = Math.min(t, rs[j].top); b = Math.max(b, rs[j].bottom); }
      var cy = (t + b) / 2;
      if (!cur || Math.abs(cy - cur.cy) > thr) { cur = { cy: cy, n: 0, l: Infinity, r: -Infinity, t: Infinity, b: -Infinity, words: [] }; lines.push(cur); }
      cur.n++; cur.words.push(units[i]);
      cur.l = Math.min(cur.l, l); cur.r = Math.max(cur.r, rt); cur.t = Math.min(cur.t, t); cur.b = Math.max(cur.b, b);
      minL = Math.min(minL, l); maxR = Math.max(maxR, rt);
    }
    return { lines: lines, minL: minL, maxR: maxR };
  }

  function wordsOf(node) {
    var w = node.querySelectorAll(".w");
    if (w.length) return Array.prototype.slice.call(w);
    var parts = node.querySelectorAll(".cs-num, .cs-unit");
    return parts.length ? Array.prototype.slice.call(parts) : [node];
  }

  function contentBoxOf(node, ctx) {
    var cs = getComputedStyle(node), r = rel(node.getBoundingClientRect(), ctx);
    var pl = parseFloat(cs.paddingLeft) || 0, pr = parseFloat(cs.paddingRight) || 0, bl = parseFloat(cs.borderLeftWidth) || 0, br = parseFloat(cs.borderRightWidth) || 0;
    return { l: r.x + bl + pl, r: r.x + r.w - br - pr, rect: r };
  }

  function lineWidth(l) { return l.r - l.l; }

  function isLone(m) {
    var L = m.lines;
    if (L.length < 2) return false;
    var last = L[L.length - 1];
    if (last.n >= 2) return false;
    var widest = 0;
    L.forEach(function (x) { widest = Math.max(widest, lineWidth(x)); });
    return lineWidth(last) < LONE_RATIO * widest;
  }

  function isUnbalanced(m, boxWidthPx, ctx) {
    var L = m.lines;
    if (L.length < 3) return false;
    var mx = 0, mn = Infinity;
    for (var i = 0; i < L.length - 1; i++) { var w = lineWidth(L[i]); mx = Math.max(mx, w); mn = Math.min(mn, w); }
    return (mx - mn) / ctx.scale > BALANCE_RATIO * boxWidthPx;
  }

  /* ---- fit units ---- */

  /** Groups bullets of one list and the two sides of a comparison into one unit: they share one size, scaled by --cs-fit-ratio. */
  function buildUnits(slots, tokens) {
    var units = [], byGroup = {};
    slots.forEach(function (s, order) {
      var grouped = (s.field === "bullets" || s.field === "sides") && s.index !== null;
      var gk = grouped ? s.slot + ":" + s.field : s.key;
      var u = byGroup[gk];
      if (!u) {
        var role = s.role || "body", rg = rangeFor(role, tokens);
        u = byGroup[gk] = { key: gk, role: role, min: rg.min, max: rg.max, floor: slotFloor(s.el, role, tokens), css: s.el.getAttribute("data-fit") === "css", members: [], order: order };
        units.push(u);
      }
      u.floor = Math.max(u.floor, slotFloor(s.el, s.role || "body", tokens));
      var ratio = parseFloat(getComputedStyle(s.el).getPropertyValue("--cs-fit-ratio")) || 1;
      var ml = parseInt(s.el.getAttribute("data-max-lines"), 10) || DEFAULT_LINES[s.role] || 2;
      u.members.push({ slot: s, el: s.el, key: s.key, ratio: ratio, maxLines: ml, words: wordsOf(s.el), hasWords: !!s.el.querySelector(".w") });
    });
    units.sort(function (a, b) { return (PRIORITY[a.role] !== undefined ? PRIORITY[a.role] : 6) - (PRIORITY[b.role] !== undefined ? PRIORITY[b.role] : 6) || a.order - b.order; });
    return units;
  }

  function memberPx(u, m, S) { return Math.max(u.floor, Math.round(S * m.ratio)); }

  function stackOK(ctx) {
    if (!ctx.contentBox) return true;
    var cb = ctx.contentBox;
    for (var i = 0; i < ctx.flow.length; i++) {
      var r = rel(ctx.flow[i].getBoundingClientRect(), ctx);
      if (r.y + r.h > cb.y + cb.h + EPS || r.y < cb.y - EPS || r.x + r.w > cb.x + cb.w + EPS || r.x < cb.x - EPS) return false;
    }
    return true;
  }

  /** Line limits, capped heights, slot containment and keep-outs. */
  function ownOK(m, mm, ctx) {
    if (mm.lines.length > m.maxLines) return false;
    if (mm.lines.length) {
      var box = contentBoxOf(m.el, ctx);
      if (mm.minL < box.l * ctx.scale + ctx.left - EPS * ctx.scale || mm.maxR > box.r * ctx.scale + ctx.left + EPS * ctx.scale) return false;
      var cs = getComputedStyle(m.el), cap = parseFloat(cs.maxHeight);
      if (m.el.classList.contains("cs-art-label") && cap > 0 && mm.lines.length * parseFloat(cs.lineHeight) > cap + EPS) return false;
      var c = ctx.geo.content, sr = box.rect;
      // Fixed art-label boxes must contain the real font's vertical extents too,
      // including the changed baseline after export wraps Arabic-Indic digits.
      if (m.el.classList.contains("cs-art-label") && m.el.style.height && mm.lines.some(function (l) { return (l.t - ctx.top) / ctx.scale < sr.y - EPS || (l.b - ctx.top) / ctx.scale > sr.y + sr.h + EPS; })) return false;
      if (sr.x < c.x - EPS || sr.y < c.y - EPS || sr.x + sr.w > c.x + c.w + EPS || sr.y + sr.h > c.y + c.h + EPS) return false;
      for (var i = 0; i < ctx.geo.keepOuts.length; i++) { if (intersects(sr, ctx.geo.keepOuts[i])) return false; }
    }
    return true;
  }

  /** Widens eligible headlines to the content width after fitting fails. */
  function widen(u) {
    var did = false;
    u.members.forEach(function (m) {
      if (m.el.hasAttribute("data-fit-widen") && !m.el.hasAttribute("data-widened")) { m.el.style.inlineSize = "100%"; m.el.setAttribute("data-widened", "1"); did = true; }
    });
    return did;
  }

  /** Undo widen() when it did not help, so a headline only loses its preset width when that is what makes the slide fit. */
  function unwiden(u) {
    u.members.forEach(function (m) {
      if (m.el.hasAttribute("data-widened")) { m.el.style.removeProperty("inline-size"); m.el.removeAttribute("data-widened"); }
    });
  }

  function searchUnit(u, ctx) {
    var cache = {}, floor = u.floor, max = Math.max(u.max, floor);
    function apply(S) { u.members.forEach(function (m) { m.el.style.fontSize = memberPx(u, m, S) + "px"; }); }
    function probe(S) {
      if (cache[S]) return cache[S];
      apply(S);
      var p = { S: S, own: true, lone: false, ms: [] };
      u.members.forEach(function (m) {
        var px = memberPx(u, m, S), mm = measure(m.el, ctx, px, m.words);
        p.ms.push(mm);
        if (!ownOK(m, mm, ctx)) p.own = false;
        if (isLone(mm)) p.lone = true;
      });
      p.stack = stackOK(ctx);
      p.hard = p.own && p.stack;
      return (cache[S] = p);
    }
    var result = { size: floor, overflow: false, stackLimited: false, loneWord: false };
    var pf = probe(floor);
    if (!pf.own && widen(u)) { cache = {}; pf = probe(floor); }
    else if (pf.own && !pf.stack && widen(u)) {
      /* every slot sits at its floor and the stack is still too tall: a wider headline may need fewer lines */
      cache = {};
      var wider = probe(floor);
      if (wider.own && wider.stack) pf = wider; else { unwiden(u); cache = {}; pf = probe(floor); }
    }
    if (!pf.own) { result.overflow = true; apply(floor); return result; }
    if (!pf.stack) { result.stackLimited = true; apply(floor); return result; }
    var s0;
    if (probe(max).hard) s0 = max;
    else {
      var lo = floor, hi = max;
      while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (probe(mid).hard) lo = mid; else hi = mid; }
      s0 = lo;
    }
    var chosen = null, lowest = Math.max(floor, Math.ceil(s0 * LONE_SEARCH));
    for (var S = s0; S >= lowest; S--) {
      var p = probe(S);
      if (!p.hard) continue;
      if (!p.lone) { chosen = S; break; }
    }
    if (chosen === null) { chosen = s0; result.loneWord = true; }
    apply(chosen);
    result.size = chosen;
    return result;
  }

  function statusOf(px, u, ratio, overflow) {
    if (overflow) return "overflow";
    if (px >= Math.round(u.min * ratio)) return "fit";
    if (px <= u.floor) return "floor";
    return "shrunk";
  }

  /* ---- public: fitSlide / fitSlot ---- */

  function collect(u, ctx, report, forceOverflow, loneWord) {
    u.members.forEach(function (m) {
      var px = parseFloat(m.el.style.fontSize) || parseFloat(getComputedStyle(m.el).fontSize) || u.max;
      var mm = measure(m.el, ctx, px, m.words), box = rel(m.el.getBoundingClientRect(), ctx);
      var overflow = forceOverflow || (!u.css && (m.hasWords || mm.lines.length > 0) && !ownOK(m, mm, ctx));
      var lone = loneWord && isLone(mm);
      var res = {
        key: m.key, role: u.role, fontPx: Math.round(px), minPx: Math.round(u.min * m.ratio), maxPx: Math.round(u.max * m.ratio),
        lines: mm.lines.length, words: m.el.querySelectorAll(".w").length, box: { x: r2(box.x), y: r2(box.y), w: r2(box.w), h: r2(box.h) },
        loneWord: !!lone, status: statusOf(Math.round(px), u, m.ratio, overflow)
      };
      report.slots[m.key] = res;
      if (res.status === "overflow") report.warnings.push(M("النص في «" + m.key + "» لا يتسع في مكانه حتى بأصغر حجم مسموح (" + Math.round(px) + " بكسل).", "The text in " + m.key + " does not fit its place even at the smallest allowed size (" + Math.round(px) + " px)."));
      else if (res.loneWord) report.warnings.push(M("آخر سطر في «" + m.key + "» كلمة وحيدة.", "The last line of " + m.key + " is a single word."));
      if (!ctx.native && isUnbalanced(mm, box.w, ctx)) report.warnings.push(M("أسطر «" + m.key + "» غير متوازنة.", "The lines of " + m.key + " are not balanced."));
    });
  }

  /** Fits a slide synchronously with loaded fonts, optionally replaying frozen sizes. */
  function fitSlide(slideEl, tokens, opts) {
    opts = opts || {};
    var ctx = makeCtx(slideEl, tokens), slots = core.compose.slots(slideEl), units = buildUnits(slots, tokens);
    var report = { slideId: slideEl.getAttribute("data-cs-slide") || "", ok: true, slots: {}, warnings: [] };
    var frozen = opts.frozenSizes || null, lone = {};

    units.forEach(function (u) {
      if (u.css) { u.members.forEach(function (m) { m.el.style.removeProperty("font-size"); }); return; }
      u.members.forEach(function (m) {
        var fz = frozen && frozen[m.key];
        m.el.style.fontSize = (fz ? fz : memberPx(u, m, u.floor)) + "px";
      });
    });
    if (!frozen) {
      units.forEach(function (u) {
        if (u.css) return;
        var r = searchUnit(u, ctx);
        u.result = r;
        lone[u.key] = r.loneWord;
      });
    } else {
      /* a frozen headline that was wider than its preset width keeps the width it needed */
      units.forEach(function (u) {
        if (u.css) return;
        var bad = u.members.some(function (m) { return !ownOK(m, measure(m.el, ctx, parseFloat(m.el.style.fontSize) || u.max, m.words), ctx); });
        if (bad) widen(u);
      });
    }
    var stackBad = !stackOK(ctx);
    units.forEach(function (u) {
      collect(u, ctx, report, !!(stackBad && u.result && (u.result.stackLimited || u.result.overflow)), !!lone[u.key]);
    });
    report.ok = !Object.keys(report.slots).some(function (k) { return report.slots[k].status === "overflow"; });
    return report;
  }

  /** Fits one slot in the slide's current layout (the other slots stay as they are). */
  function fitSlot(slotEl, role, tokens) {
    var slideEl = slideOf(slotEl);
    if (!slideEl) throw new CS.CSError("E_USAGE", "fitSlot needs a slot inside a .cs-slide.");
    var ctx = makeCtx(slideEl, tokens), r = role || slotEl.getAttribute("data-role") || "body", rg = rangeFor(r, tokens);
    var key = slotEl.getAttribute("data-slot-key") || "";
    var member = { el: slotEl, key: key, ratio: 1, maxLines: parseInt(slotEl.getAttribute("data-max-lines"), 10) || DEFAULT_LINES[r] || 2, words: wordsOf(slotEl), hasWords: !!slotEl.querySelector(".w") };
    var u = { key: key, role: r, min: rg.min, max: rg.max, floor: slotFloor(slotEl, r, tokens), members: [member] };
    var res = searchUnit(u, ctx), report = { slots: {}, warnings: [] };
    collect(u, ctx, report, res.overflow || (res.stackLimited && !stackOK(ctx)), res.loneWord);
    return report.slots[key];
  }

  /* ---- lines ------------------------------------------------------------------------------------------------------- */

  function lineText(words) {
    var out = "";
    for (var i = 0; i < words.length; i++) {
      if (i) out += separator(words[i - 1], words[i]);
      out += words[i].textContent;
    }
    return out;
  }

  /** "" | " " | U+00A0: what separates two word units in the DOM (a number is bound to its noun with U+00A0). */
  function separator(a, b) {
    var rg = document.createRange();
    try { rg.setStartAfter(a); rg.setEndBefore(b); } catch (e) { return " "; }
    var t = rg.toString();
    if (t.indexOf("\u00A0") >= 0) return "\u00A0";
    return /[ \t\n\r\f]/.test(t) ? " " : "";
  }

  /** Physical lines of a slot, from the boxes of its words: [[word text]], one rect per line (slide coordinates), and the text of each line. */
  function measureLines(slotEl) {
    var slideEl = slideOf(slotEl), ctx = makeCtx(slideEl, null);
    var px = parseFloat(getComputedStyle(slotEl).fontSize) || 16, m = measure(slotEl, ctx, px);
    return {
      lines: m.lines.map(function (l) { return l.words.map(function (w) { return w.textContent; }); }),
      rects: m.lines.map(function (l) { return rel({ left: l.l, top: l.t, width: l.r - l.l, height: l.b - l.t }, ctx); }),
      text: m.lines.map(function (l) { return lineText(l.words); })
    };
  }

  function chainOf(w, root) {
    var chain = [], n = w.parentNode;
    while (n && n !== root) { chain.unshift(n); n = n.parentNode; }
    return chain;
  }

  /** Regroups the .w units of a slot into <span class="cs-ln"> blocks of the given sizes (counts of words per line). Wrappers (emphasis, LTR runs) are cloned per line. */
  function wrapLinesBy(slotEl, counts) {
    var all = Array.prototype.slice.call(slotEl.querySelectorAll(".w"));
    var total = counts.reduce(function (a, b) { return a + b; }, 0);
    if (!all.length || total !== all.length) return null;
      slotEl.querySelectorAll('[data-mark-target]:not([data-mark-id])').forEach(function(n,i){n.dataset.markId=slotEl.getAttribute('data-slot-key')+'-m'+i;});
    var slotName = slotEl.getAttribute("data-slot") || "";
    var chains = all.map(function (w) { return chainOf(w, slotEl); });
    var seps = all.map(function (w, i) { return i < all.length - 1 ? separator(w, all[i + 1]) : ""; });
    var frag = document.createDocumentFragment(), out = [], at = 0;
    counts.forEach(function (n, li) {
      var ln = document.createElement("span");
      ln.className = "cs-ln";
      ln.setAttribute("data-m", "ln"); ln.setAttribute("data-m-i", li); ln.setAttribute("data-m-slot", slotName);
      var open = [];
      for (var k = 0; k < n; k++, at++) {
        var chain = chains[at], common = 0;
        if (k > 0) {
          while (common < open.length && common < chain.length && open[common].orig === chain[common]) common++;
          open.length = common;
          var host = common ? open[common - 1].clone : ln;
          if (seps[at - 1]) host.appendChild(document.createTextNode(seps[at - 1]));
        } else open.length = 0;
        for (var d = common; d < chain.length; d++) {
          var c = chain[d].cloneNode(false);
          (d ? open[d - 1].clone : ln).appendChild(c);
          open[d] = { orig: chain[d], clone: c };
        }
        (chain.length ? open[chain.length - 1].clone : ln).appendChild(all[at]);
      }
      frag.appendChild(ln);
      out.push(ln);
    });
    slotEl.textContent = "";
    slotEl.appendChild(frag);
    return out;
  }

  /** Idempotent: groups the .w units of a slot into physical lines as they are laid out now. Used by motion and freeze. */
  function wrapLines(slotEl) {
    var existing = Array.prototype.filter.call(slotEl.children, function (c) { return c.classList && c.classList.contains("cs-ln"); });
    if (existing.length) return existing;
    var slideEl = slideOf(slotEl);
    if (!slideEl || !slotEl.querySelector(".w")) return [];
    var ctx = makeCtx(slideEl, null), px = parseFloat(getComputedStyle(slotEl).fontSize) || 16;
    var m = measure(slotEl, ctx, px);
    return wrapLinesBy(slotEl, m.lines.map(function (l) { return l.n; })) || [];
  }

  /** Settles frozen lines when Arabic shaping changes their measured width. */
  function settleLines(slideEl, tokens, report) {
    var ctx = makeCtx(slideEl, tokens);
    core.compose.slots(slideEl).forEach(function (s) {
      var el = s.el;
      if (el.getAttribute("data-fit") === "css" || !el.querySelector(".cs-ln")) return;
      var role = s.role || "body", floor = slotFloor(el, role, tokens);
      var px = parseFloat(el.style.fontSize) || 0, member = { el: el, maxLines: 99 }, start = px;
      if (!px) return;
      var mm = measure(el, ctx, px);
      while (!ownOK(member, mm, ctx) && px > floor) {
        px -= 1;
        el.style.fontSize = px + "px";
        mm = measure(el, ctx, px);
      }
      var rs = report && report.slots && report.slots[s.key];
      if (!rs) return;
      var bad = !ownOK(member, mm, ctx);
      if (px !== start) {
        rs.fontPx = Math.round(px);
        if (rs.status === "fit" && rs.fontPx < rs.minPx) rs.status = rs.fontPx <= floor ? "floor" : "shrunk";
      }
      if (bad && rs.status !== "overflow") {
        rs.status = "overflow";
        report.ok = false;
        report.warnings.push(M("النص في «" + s.key + "» لا يتسع في مكانه حتى بأصغر حجم مسموح (" + Math.round(px) + " بكسل).", "The text in " + s.key + " does not fit its place even at the smallest allowed size (" + Math.round(px) + " px)."));
      }
    });
  }

  core.fit = {
    fitSlide: fitSlide, fitSlot: fitSlot, measureLines: measureLines, wrapLines: wrapLines, floorPx: function (role, tokens) { return floorPx(role, tokens); },
    rangeFor: rangeFor, wrapLinesBy: wrapLinesBy, settleLines: settleLines
  };
})();

  /* ---- file: freeze.js ---- */
/* core/freeze.js · deterministic layouts (CONTRACT 3.2 and 4.3.2). */
(function () {
  var core = (CS.core = CS.core || {});

  var KEY_RE = /^(s[0-9]{2})\.([a-z0-9-]+)(?:\.([0-9]+))?$/;

  /** Post-level tokens + the per-slide inputs that can change a slide's tokens (variant, overrides): section 3.2. */
  function tokensHash(tokens, spec) {
    var slides = ((spec && spec.slides) || []).map(function (s) { return [s.id, s.variant || null, core.canon.hash(s.overrides || {}), core.canon.hash([s.visual || null, s.items || null, s.demo || null].concat(s.free ? [s.free] : []))]; });
    return core.canon.hash({ post: core.canon.hashable(tokens), slides: slides });
  }

  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

  var visualState = Object.create(null);
  function copy(v) { return v == null ? v : JSON.parse(JSON.stringify(v)); }
  var visual = {
    get: function (id, frozen) {
      var v = frozen && frozen.visual;
      return copy(frozen ? { marks: v && v.marks && v.marks[id], anchor: v && v.anchors && v.anchors[id] } : visualState[id] || {});
    },
    // Start a composition with set(id, null); anchorSync and settle then merge their results.
    set: function (id, value) { visualState[id] = value ? Object.assign({}, visualState[id], copy(value)) : {}; }
  };

  /** What the approved layout looks like: {engine, tokensHash, lines, sizes, approvedAt}. `slides` are rendered slides (export mode). */
  function capture(slides, spec, tokens) {
    var frozen = { engine: CS.version, tokensHash: tokensHash(tokens, spec), lines: {}, sizes: {}, approvedAt: new Date().toISOString() };
    slides.forEach(function (r) {
      var id = r.id || r.el.getAttribute("data-cs-slide"), v = visual.get(id);
      if (v.marks || v.anchor) {
        frozen.visual = frozen.visual || { marks: {}, anchors: {} };
        if (v.marks) frozen.visual.marks[id] = v.marks.slice(0, 8);
        if (v.anchor) frozen.visual.anchors[id] = { w: v.anchor.w, h: v.anchor.h };
      }
      core.compose.slots(r.el).forEach(function (s) {
        var px = parseFloat(s.el.style.fontSize);
        if (px > 0 && s.el.getAttribute("data-fit") !== "css") frozen.sizes[s.key] = clamp(Math.round(px), 12, 640);
        if (s.el.querySelector(".w")) {
          var text = core.fit.measureLines(s.el).text;
          if (text.length && text.length <= 12 && text.every(function (t) { return t.length <= 400; })) frozen.lines[s.key] = text;
        }
      });
    });
    return frozen;
  }

  /** Sets the frozen sizes and rebuilds the frozen lines as .cs-ln blocks. A slot whose words no longer match its frozen lines keeps its natural flow. */
  function apply(slideEl, frozen) {
    if (!frozen) return;
    var id = slideEl.getAttribute("data-cs-slide");
    visual.set(id, null); visual.set(id, visual.get(id, frozen));
    var slots = core.compose.slots(slideEl);
    slots.forEach(function (s) {
      var px = frozen.sizes && frozen.sizes[s.key];
      if (px) s.el.style.fontSize = px + "px";
    });
    slots.forEach(function (s) {
      var lines = frozen.lines && frozen.lines[s.key];
      if (!lines || !lines.length) return;
      var counts = lines.map(function (l) { return l.split(/[ \u00A0]+/).filter(Boolean).length; });
      core.fit.wrapLinesBy(s.el, counts);
    });
  }

  function fontsDeclared(ids) {
    if (!document.fonts || typeof document.fonts.forEach !== "function") return true;
    var have = {};
    document.fonts.forEach(function (face) { if (face.status !== "error") have[String(face.family).replace(/^["']|["']$/g, "").toLowerCase()] = true; });
    return ids.every(function (id) { var f = core.registry.fontCss(id); return f && have[f.toLowerCase()]; });
  }

  function expectedText(spec, key) {
    if (/\.art\./.test(key) && CS.visual && typeof CS.visual.expected === "function") {
      var extra;
      try { extra = CS.visual.expected(spec, key); } catch (e) { extra = null; }
      if (extra != null) return extra;
    }
    var id = key.split(".")[0], s = (spec.slides || []).filter(function (v) { return v.id === id; })[0];
    if (CS.visual?.free?.active(s)) return CS.visual.free.expected(s,key);
    if (s && core.text.visualFields) {
      var fields = core.text.visualFields(s), suffix = key.slice(id.length + 1);
      for (var n = 0; n < fields.length; n++) if (fields[n][0] === suffix) return fields[n][1];
    }
    var m = KEY_RE.exec(key);
    if (!m) return null;
    var slide = (spec.slides || []).filter(function (s) { return s.id === m[1]; })[0];
    if (!slide) return null;
    var field = m[2], i = m[3] === undefined ? null : parseInt(m[3], 10), v;
    if (field === "bullets") v = (slide.bullets || [])[i];
    else if (field === "sides") v = ((slide.sides || [])[i] || {}).text;
    else if (field === "cta") v = slide.cta && slide.cta.text;
    else v = slide[field];
    return typeof v === "string" ? v : null;
  }

  /** Does the frozen layout still describe this spec and these tokens? `reasons` lists what changed. */
  function verify(spec, tokens) {
    var f = spec && spec.frozen, reasons = [];
    if (!f) return { ok: false, reasons: reasons };
    if (f.engine !== CS.version) reasons.push("engine");
    if (f.tokensHash !== tokensHash(tokens, spec)) reasons.push("tokens");
    if (!fontsDeclared(tokens.fonts || [])) reasons.push("fonts");
    var T = core.text, stale = false;
    Object.keys(f.lines || {}).some(function (key) {
      var want = expectedText(spec, key);
      if (want === null || T.skeleton(f.lines[key].join(" ")) !== T.skeleton(T.stripMarkup(want))) { stale = true; return true; }
      return false;
    });
    if (stale) reasons.push("text");
    return { ok: reasons.length === 0, reasons: reasons };
  }

  core.freeze = { capture: capture, apply: apply, verify: verify, tokensHash: tokensHash, expectedText: expectedText, visual: visual };
})();

  /* ---- file: render.js ---- */
/* core/render.js · the one entry point from spec to DOM.
 *
 *   resolve tokens -> compose the slide -> put it in the stage -> wait for fonts and images -> fit (or apply the frozen layout)
 *   -> emit cs:render and cs:fit
 *
 * The off-screen stage measures at 1080 px. Edit keeps natural text; export wraps physical lines; thumb skips wrapping.
 * Verify once before compose, so visual hooks reuse frozen boxes and the resolved post.
 */
(function () {
  var core = (CS.core = CS.core || {});

  var shared = null;

  function makeStage() {
    var st = document.createElement("div");
    st.setAttribute("data-cs-stage", "");
    st.setAttribute("aria-hidden", "true");
    st.style.cssText = "position:fixed;left:-12000px;top:0;width:" + core.constants.CANVAS.w + "px;pointer-events:none;contain:layout paint;direction:ltr;";
    document.body.appendChild(st);
    return st;
  }

  function sharedStage() {
    if (!shared || !shared.isConnected) shared = makeStage();
    return shared;
  }

  /** Lets the browser breathe between slides; MessageChannel is not throttled in background tabs the way setTimeout is. */
  function tick() {
    return new Promise(function (resolve) {
      if (typeof MessageChannel !== "function") return setTimeout(resolve, 0);
      var mc = new MessageChannel();
      mc.port1.onmessage = function () { mc.port1.close(); resolve(); };
      mc.port2.postMessage(0);
    });
  }

  /** Union of font specs ({id, wght}) over several slides, once each. */
  function unique(lists) {
    var out = [], seen = {};
    lists.forEach(function (l) { (l || []).forEach(function (x) { var k = x.id + "|" + x.wght; if (!seen[k]) { seen[k] = true; out.push(x); } }); });
    return out;
  }

  /** Fonts and images; a font that cannot load is reported in the fit report instead of aborting the render. */
  async function settle(root, fontSpecs, opts, warnings) {
    core.ready.checkAbort(opts.signal);
    try { await core.ready.fonts(fontSpecs, 8000); }
    catch (e) {
      if (e && e.code === "E_ABORTED") throw e;
      warnings.push({ ar: "تعذّر تحميل الخطوط، فقد تكون المقاسات غير دقيقة.", en: "Fonts could not be loaded, so the sizes may be off." });
      CS.emit("cs:error", { code: (e && e.code) || "E_FONT_MISSING", message: (e && e.message) || "font load failed", detail: e && e.detail });
    }
    await core.ready.images(root);
    core.ready.checkAbort(opts.signal);
  }

  function wrapAllLines(el) {
    core.compose.slots(el).forEach(function (s) { if (s.el.querySelector(".w")) core.fit.wrapLines(s.el); });
  }

  /** Fit (or apply the frozen layout) and, for exports, break the text into physical lines. */
  function layout(el, tokens, spec, opts, frozenOk) {
    var mode = opts.mode || "export", report;
    if (frozenOk && mode !== "edit") {
      core.freeze.apply(el, spec.frozen);
      report = core.fit.fitSlide(el, tokens, { frozenSizes: spec.frozen.sizes });
    } else {
      report = core.fit.fitSlide(el, tokens);
    }
    var v=(tokens.art||el.dataset.free)&&el.dataset.type!=="cover"&&CS.visual;
    if(v?.anchorSync?.(el,{frozen:frozenOk&&spec.frozen}))report=core.fit.fitSlide(el,tokens);
    if(v?.anchorFit?.(el,report,{frozen:frozenOk&&spec.frozen}))report=core.fit.fitSlide(el,tokens);
    if(!frozenOk&&mode==="export"){wrapAllLines(el);core.fit.settleLines(el,tokens,report);}
    v?.settle?.(el,{spec:spec,tokens:tokens,frozen:frozenOk&&spec.frozen});
    return report;
  }

  function frozenState(spec, post, opts, brand) {
    return opts.useFrozen !== false && spec.frozen ? (CS.visual?.verify||core.freeze.verify)(spec,post,brand).ok : false;
  }

  function announce(r) {
    CS.emit("cs:render", { slideId: r.id, tokensHash: r.tokens.hash });
    CS.emit("cs:fit", { slideId: r.id, report: r.fit });
  }

  async function slide(spec, brand, index, opts) {
    opts = opts || {};
    core.ready.checkAbort(opts.signal);
    var slideSpec = (spec.slides || [])[index];
    if (!slideSpec) throw new CS.CSError("E_USAGE", "There is no slide at index " + index + ".", { index: index });
    var post = core.resolve.post(spec, brand), tokens = core.resolve.slide(post, slideSpec);
    opts={...opts,frozenOk:frozenState(spec,post,opts,brand)};
    var el = core.compose.slide(spec, slideSpec, tokens, brand, opts), stage = opts.stage || sharedStage(), warnings = [];
    stage.appendChild(el);
    try {
      await settle(el, core.ready.fontSpecs(tokens), opts, warnings);
      var report = layout(el, tokens, spec, opts, opts.frozenOk);
      report.warnings = warnings.concat(report.warnings);
      var r = { id: slideSpec.id, index: index, el: el, tokens: tokens, fit: report };
      announce(r);
      core.ready.markReady();
      return r;
    } catch (e) {
      if (el.parentNode === stage) el.remove();
      throw e;
    }
  }

  async function deck(spec, brand, opts) {
    opts = opts || {};
    core.ready.checkAbort(opts.signal);
    var post = core.resolve.post(spec, brand), stage = opts.stage || makeStage(), owns = !opts.stage, items = [], warnings = [];
    opts={...opts,frozenOk:frozenState(spec,post,opts,brand)};
    var only = opts.slideIds ? opts.slideIds.slice() : null;
    (spec.slides || []).forEach(function (s, i) {
      if (only && only.indexOf(s.id) < 0) return;
      var tokens = core.resolve.slide(post, s), el = core.compose.slide(spec, s, tokens, brand, opts);
      stage.appendChild(el);
      items.push({ id: s.id, index: i, el: el, tokens: tokens, fit: null });
    });
    var dispose = function () {
      items.forEach(function (r) { if (r.el.parentNode === stage) r.el.remove(); });
      if (owns && stage.parentNode) stage.remove();
    };
    try {
      await settle(stage, unique(items.map(function (r) { return core.ready.fontSpecs(r.tokens); })), opts, warnings);
      var frozenOk = opts.frozenOk;
      for (var i = 0; i < items.length; i++) {
        core.ready.checkAbort(opts.signal);
        var r = items[i];
        r.fit = layout(r.el, r.tokens, spec, opts, frozenOk);
        r.fit.warnings = warnings.concat(r.fit.warnings);
        announce(r);
        if (i < items.length - 1) await tick();
      }
      core.ready.markReady();
      return { tokens: post, slides: items, stage: stage, frozenOk: frozenOk, dispose: dispose };
    } catch (e) {
      dispose();
      throw e;
    }
  }

  /** Re-composes a rendered slide inside the same root element (so whoever holds `r.el` keeps a live node) and fits it again. */
  async function update(r, spec, brand, opts) {
    opts = opts || {};
    core.ready.checkAbort(opts.signal);
    var index = (spec.slides || []).findIndex(function (s) { return s.id === r.id; });
    if (index < 0) throw new CS.CSError("E_USAGE", "Slide " + r.id + " is no longer in the spec.", { id: r.id });
    var slideSpec = spec.slides[index], post = core.resolve.post(spec, brand), tokens = core.resolve.slide(post, slideSpec);
    opts={...opts,frozenOk:frozenState(spec,post,opts,brand)};
    var fresh = core.compose.slide(spec, slideSpec, tokens, brand, opts), root = r.el, warnings = [];
    Array.prototype.slice.call(root.attributes).forEach(function (a) { root.removeAttribute(a.name); });
    Array.prototype.slice.call(fresh.attributes).forEach(function (a) { root.setAttribute(a.name, a.value); });
    root.textContent = "";
    while (fresh.firstChild) root.appendChild(fresh.firstChild);
    /* a root that is detached or hidden has no layout: measure it in the stage and put it back afterwards */
    var park = !root.isConnected || !root.offsetWidth, home = root.parentNode, after = root.nextSibling;
    if (park) sharedStage().appendChild(root);
    try {
      await settle(root, core.ready.fontSpecs(tokens), opts, warnings);
      var report = layout(root, tokens, spec, opts, opts.frozenOk);
      report.warnings = warnings.concat(report.warnings);
      r.index = index; r.tokens = tokens; r.fit = report;
      announce(r);
      return r;
    } finally {
      if (park) { root.remove(); if (home) home.insertBefore(root, after && after.parentNode === home ? after : null); }
    }
  }

  core.render = { slide: slide, deck: deck, update: update };
})();

  /* ---- file: spec.js ---- */
/* core/spec.js · pure helpers on spec.json (CONTRACT 4.3.2). */
(function () {
  var core = (CS.core = CS.core || {});

  var HARD_MAX = 10;
  var SENTENCE_END = /[.!?\u061F\u2026]/;
  var WS_CHAR = /[ \t\n\r\f\v\u00A0\u202F]/;

  function usage(message, detail) { return new CS.CSError("E_USAGE", message, detail); }
  function T() { return core.text; }
  function pad2(n) { return (n < 10 ? "0" : "") + n; }
  function hasOwn(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }

  function indexOf(spec, id) {
    var i = (spec.slides || []).findIndex(function (s) { return s.id === id; });
    if (i < 0) throw usage("There is no slide " + id + " in this spec.", { id: id });
    return i;
  }

  function withSlides(spec, slides) { return Object.assign({}, spec, { slides: slides }); }

  function editSlide(spec, id, fn) {
    var i = indexOf(spec, id), slides = spec.slides.slice();
    slides[i] = fn(Object.assign({}, slides[i]));
    return withSlides(spec, slides);
  }

  /* ---- fields ----------------------------------------------------------------------------------------------- */

  /** Sets a slide property or dotted field, optionally at an array index. */
  function setField(spec, slideId, field, value, index) {
    return editSlide(spec, slideId, function (s) {
      var parts = String(field).split("."), head = parts[0], sub = parts[1], hasIndex = index !== undefined && index !== null;
      if (head === "bullets") {
        if (!hasIndex) { if (Array.isArray(value)) s.bullets = value.slice(); else if (value == null) delete s.bullets; return s; }
        var arr = (s.bullets || []).slice();
        if (value === null || value === undefined) arr.splice(index, 1); else arr[index] = String(value);
        if (arr.length) s.bullets = arr; else delete s.bullets;
        return s;
      }
      if (head === "sides") {
        if (!hasIndex) { if (Array.isArray(value)) s.sides = value.map(function (x) { return Object.assign({}, x); }); else if (value == null) delete s.sides; return s; }
        var sides = (s.sides || [{ text: "" }, { text: "" }]).map(function (x) { return Object.assign({}, x); });
        var prop = sub === "label" ? "label" : "text";
        sides[index] = Object.assign({ text: "" }, sides[index]);
        if (prop === "label" && (value === "" || value == null)) delete sides[index].label; else sides[index][prop] = value == null ? "" : String(value);
        s.sides = sides;
        return s;
      }
      if (head === "number" || head === "cta" || head === "media") {
        if (value && typeof value === "object" && !sub) { s[head] = Object.assign({}, value); return s; }
        if (value === null && !sub) { delete s[head]; return s; }
        var key = sub || (head === "number" ? "value" : head === "cta" ? "text" : "slot");
        var obj = Object.assign({}, s[head]);
        if ((value === "" || value == null) && (key === "unit" || key === "sourceId" || key === "assetId")) delete obj[key]; else obj[key] = head === "number" ? String(value) : value;
        s[head] = obj;
        return s;
      }
      if (value === null || value === undefined) delete s[head]; else s[head] = value;
      return s;
    });
  }

  /* ---- structure --------------------------------------------------------------------------------------------- */

  /** n = position; ord = running count per type for item and step slides. Ids are untouched. */
  function renumber(spec) {
    var counts = {}, changed = false;
    var slides = (spec.slides || []).map(function (s, i) {
      var next = s, n = i + 1;
      counts[s.type] = (counts[s.type] || 0) + 1;
      var wantOrd = s.type === "item" || s.type === "step" ? counts[s.type] : s.ord;
      if (s.n !== n || s.ord !== wantOrd) {
        next = Object.assign({}, s, { n: n });
        if (wantOrd === undefined) delete next.ord; else next.ord = wantOrd;
        changed = true;
      }
      return next;
    });
    return changed ? withSlides(spec, slides) : spec;
  }

  function idHighWater(spec) {
    var max = (spec.ext && spec.ext.cs && spec.ext.cs.slideIdMax) || 0;
    (spec.slides || []).forEach(function (s) { var n = parseInt(String(s.id).slice(1), 10); if (n > max) max = n; });
    return max;
  }

  function stampIds(spec, max) {
    var ext = Object.assign({}, spec.ext), cs = Object.assign({}, ext.cs);
    cs.slideIdMax = Math.max(cs.slideIdMax || 0, max);
    ext.cs = cs;
    return Object.assign({}, spec, { ext: ext });
  }

  /** s01..s99, never reusing an id that was ever used in this spec while a fresh one exists. */
  function nextId(spec) {
    var used = {};
    (spec.slides || []).forEach(function (s) { used[s.id] = true; });
    var cand = idHighWater(spec) + 1;
    if (cand <= 99) return "s" + pad2(cand);
    for (var i = 1; i <= 99; i++) { if (!used["s" + pad2(i)]) return "s" + pad2(i); }
    throw usage("No free slide id is left.");
  }

  function insertSlide(spec, type, at, init) {
    var slides = (spec.slides || []).slice();
    if (slides.length >= HARD_MAX) throw usage("A carousel has at most " + HARD_MAX + " slides, including the cover.", { max: HARD_MAX });
    if (core.constants.SLIDE_TYPES.indexOf(type) < 0) throw usage("Unknown slide type \"" + type + "\".", { type: type });
    var id = nextId(spec), pos = Math.max(0, Math.min(slides.length, at === undefined || at === null ? slides.length : at | 0));
    var fresh = Object.assign({}, init || {}, { id: id, n: pos + 1, type: type });
    slides.splice(pos, 0, fresh);
    return renumber(stampIds(withSlides(spec, slides), parseInt(id.slice(1), 10)));
  }

  function removeSlide(spec, slideId) {
    var i = indexOf(spec, slideId), slides = spec.slides.slice();
    var stamped = stampIds(spec, idHighWater(spec));
    slides.splice(i, 1);
    return renumber(withSlides(stamped, slides));
  }

  function moveSlide(spec, slideId, to) {
    var i = indexOf(spec, slideId), slides = spec.slides.slice(), dest = Math.max(0, Math.min(slides.length - 1, to | 0));
    if (dest === i) return spec;
    var moved = slides.splice(i, 1)[0];
    slides.splice(dest, 0, moved);
    return renumber(withSlides(spec, slides));
  }

  /** Finds a sentence split near halfway with at least a quarter of the words on each side. */
  function splitPoint(text) {
    var total = T().wordCount(text);
    if (total < 2) return -1;
    var tiers = [[], [], []], i, quarter = Math.max(1, Math.floor(total / 4));
    function mark(idx, tier) {
      var before = text.slice(0, idx), spans = (before.match(/==/g) || []).length;
      if (spans % 2 !== 0 || !before.trim() || !text.slice(idx).trim()) return;
      var w = T().wordCount(before);
      if (tier < 2 && (w < quarter || total - w < quarter)) return;
      tiers[tier].push({ idx: idx, words: w });
    }
    for (i = 0; i < text.length; i++) {
      var c = text.charAt(i), next = text.charAt(i + 1);
      if (SENTENCE_END.test(c) && (next === "" || WS_CHAR.test(next))) mark(i + 1, 0);
      else if ((c === "\u060C" || c === "," || c === "\u061B" || c === ";") && WS_CHAR.test(next)) mark(i + 1, 1);
      else if (WS_CHAR.test(c) && next && !WS_CHAR.test(next)) mark(i, 2);
    }
    var half = total / 2;
    for (var t = 0; t < 3; t++) {
      if (!tiers[t].length) continue;
      tiers[t].sort(function (x, y) { return Math.abs(x.words - half) - Math.abs(y.words - half); });
      return tiers[t][0].idx;
    }
    return -1;
  }

  /** «قسّمها لسلايدين»: bullets or the body are halved; the second slide has a fresh id, keeps the title, and takes the bridge, the CTA and the closing media. */
  function splitSlide(spec, slideId) {
    var i = indexOf(spec, slideId), slides = spec.slides.slice();
    if (slides.length >= HARD_MAX) throw usage("A carousel has at most " + HARD_MAX + " slides, including the cover.", { max: HARD_MAX });
    var s = slides[i], a = Object.assign({}, s), b = Object.assign({}, s), id = nextId(spec);
    if (Array.isArray(s.bullets) && s.bullets.length >= 2) {
      var half = Math.ceil(s.bullets.length / 2);
      a.bullets = s.bullets.slice(0, half);
      b.bullets = s.bullets.slice(half);
    } else if (typeof s.body === "string" && splitPoint(s.body) > 0) {
      var cut = splitPoint(s.body);
      a.body = s.body.slice(0, cut).trim();
      b.body = s.body.slice(cut).trim();
    } else throw usage("Slide " + slideId + " has no body or list that can be split.", { id: slideId });
    b.id = id;
    delete a.bridge;
    ["ord", "kashidaWord", "sourceIds", "media", "number", "notes", "variant", "overrides"].forEach(function (k) { delete b[k]; });
    if (s.variant) b.variant = s.variant;
    if (s.overrides) b.overrides = Object.assign({}, s.overrides);
    delete a.cta;
    slides[i] = a;
    slides.splice(i + 1, 0, b);
    return renumber(stampIds(withSlides(spec, slides), parseInt(id.slice(1), 10)));
  }

  /* ---- derived text --------------------------------------------------------------------------------------------- */

  /** [firstLine + "\n" + keywordLine, body, cta, hashtags] without the empty parts, separated by a blank line. */
  function assembleCaption(spec) {
    var c = spec.captionPack || {}, head = [c.firstLine, c.keywordLine].filter(Boolean).join("\n");
    return [head, c.body, c.cta, (c.hashtags || []).join(" ")].filter(function (x) { return x && String(x).trim(); }).join("\n\n");
  }

  function wordCounts(slide) {
    var wc = function (s) { return typeof s === "string" && s ? T().wordCount(s) : 0; };
    var bullets = (slide.bullets || []).map(wc);
    var total = wc(slide.kicker) + wc(slide.headline) + wc(slide.sub) + wc(slide.title) + wc(slide.body) + wc(slide.attribution) + wc(slide.bridge);
    bullets.forEach(function (n) { total += n; });
    (slide.sides || []).forEach(function (x) { total += wc(x && x.label) + wc(x && x.text); });
    if (slide.cta) total += wc(slide.cta.text);
    if (slide.number) total += wc(slide.number.value) + wc(slide.number.unit);
    if (T().visualFields) T().visualFields(slide).forEach(function (f) { total += wc(f[1]); });
    return { hero: wc(slide.headline), title: wc(slide.title), body: wc(slide.body), total: total, bullets: bullets };
  }

  /* ---- new and changed specs ----------------------------------------------------------------------------------- */

  function merge(base, over) {
    if (!over) return base;
    var out = Array.isArray(base) ? base.slice() : Object.assign({}, base);
    Object.keys(over).forEach(function (k) {
      var v = over[k];
      out[k] = v && typeof v === "object" && !Array.isArray(v) && out[k] && typeof out[k] === "object" && !Array.isArray(out[k]) ? merge(out[k], v) : v;
    });
    return out;
  }

  function stamp() { return new Date().toISOString().replace(/\.\d+Z$/, "Z"); }

  /** A valid stub at checkpoint "angle": no slides yet, the brand's locale and look. */
  function blank(brand, init) {
    var now = stamp(), loc = (brand && brand.locale) || {}, vis = (brand && brand.visual) || {};
    var C = core.constants.CANVAS, S = core.constants.SAFE, presetId = vis.presetId || core.DEFAULT_PRESET, version = "1.0";
    if (core.registry.hasPreset(presetId)) version = core.registry.getPreset(presetId).version;
    var spec = {
      specVersion: 1,
      id: "post-" + now.slice(0, 10).replace(/-/g, "") + "-" + Math.floor(Math.random() * 0x10000).toString(16).padStart(4, "0"),
      rev: 1,
      brand: { slug: (brand && brand.slug) || "brand" },
      format: "carousel", mode: "guided", checkpoint: "angle",
      canvas: { preset: "ig-3x4", w: C.w, h: C.h, safe: [S.x, S.y, S.w, S.h], exports: ["3x4", "4x5"] },
      locale: {
        dialect: loc.dialect || "eg", register: loc.register || "dialect", digits: loc.digits || "western",
        appLanguage: loc.appLanguage || "ar", swipeCue: loc.swipeCue || "arrow-rtl"
      },
      style: { presetId: presetId + "@" + version },
      slides: [],
      meta: { createdAt: now, updatedAt: now, updatedBy: "tool" }
    };
    if (brand && core.canon) spec.brand.snapshotHash = core.canon.hash(core.canon.brandSnapshot(brand));
    return init ? merge(spec, init) : spec;
  }

  /** rev + 1 and who wrote it. */
  function bump(spec, by) {
    var meta = Object.assign({}, spec.meta, { updatedAt: stamp(), updatedBy: by });
    return Object.assign({}, spec, { rev: (spec.rev || 0) + 1, meta: meta });
  }

  /** Light check: schema validation (when a validator is registered) plus the structural promises helpers rely on. */
  function validate(spec) {
    var res = { ok: true, errors: [], structure: [] };
    if (core.schema && typeof core.schema.validate === "function") {
      try { var r = core.schema.validate("spec", spec); res.errors = r.errors || []; } catch (e) { /* schema not registered: structure checks still run */ }
    }
    var seen = {};
    (spec && Array.isArray(spec.slides) ? spec.slides : []).forEach(function (s, i) {
      if (seen[s.id]) res.structure.push({ path: "/slides/" + i + "/id", message: "duplicate slide id " + s.id });
      seen[s.id] = true;
      if (s.n !== i + 1) res.structure.push({ path: "/slides/" + i + "/n", message: "n must equal the position (" + (i + 1) + ")" });
    });
    if (spec && Array.isArray(spec.slides) && spec.slides.length > HARD_MAX) res.structure.push({ path: "/slides", message: "more than " + HARD_MAX + " slides" });
    res.ok = !res.errors.length && !res.structure.length;
    return res;
  }

  core.spec = {
    setField: setField, insertSlide: insertSlide, removeSlide: removeSlide, moveSlide: moveSlide, splitSlide: splitSlide,
    renumber: renumber, assembleCaption: assembleCaption, wordCounts: wordCounts, blank: blank, bump: bump, validate: validate
  };
})();

  /* ---- file: ready.js ---- */
/* core/ready.js · "the slide is really ready to be measured and painted".
 *
 * Fonts first (the fit search measures glyphs, so a late font would give wrong lines), then images and video posters, then two
 * animation frames so the browser has laid out and painted what was decoded. The first complete render also flips
 * window.__csReady, the flag that render.mjs waits for (CONTRACT 4.2).
 */
(function () {
  var core = (CS.core = CS.core || {});

  /* Arabic letters, tatweel, Arabic-Indic digits, Latin letters, digits: pulls every unicode-range subset of an embedded face. */
  var SAMPLE = "أبجد هوز ـ ٠١٢٣ ABC abc 0123";
  var loaded = {};

  if (typeof window !== "undefined" && window.__csReady !== true) window.__csReady = false;

  function weightsOf(entry) {
    var out = [];
    (entry.files || []).forEach(function (f) {
      var w = Array.isArray(f.wght) ? f.wght[0] : f.wght;
      if (typeof w === "number" && out.indexOf(w) < 0) out.push(w);
    });
    return out.length ? out : [400];
  }

  function abortError() { return new CS.CSError("E_ABORTED", "Aborted."); }

  /** [{id, all, w}]: a plain id wants every face of the family, {id, wght} only the face for that weight. */
  function normalise(list) {
    var by = {}, order = [];
    (list || []).forEach(function (x) {
      var id = typeof x === "string" ? x : x && x.id;
      if (!id) return;
      if (!by[id]) { by[id] = { id: id, all: false, w: [] }; order.push(id); }
      if (typeof x === "string" || x.wght === undefined || x.wght === null) by[id].all = true;
      else if (by[id].w.indexOf(x.wght) < 0) by[id].w.push(x.wght);
    });
    return order.map(function (id) { return by[id]; });
  }

  /** The faces a set of tokens really uses: [{id, wght}] for display, heading, body and latin. */
  function fontSpecs(tokens) {
    return ["display", "heading", "body", "latin"].map(function (r) { return { id: tokens.type[r].family, wght: tokens.type[r].wght }; });
  }

  /**
   * Loads faces. `ids` holds registry ids (every weight of the family) or {id, wght} (the face that serves that weight, e.g. from
   * fontSpecs(tokens)). Rejects with E_FONT_MISSING when a face is not usable within `timeoutMs` (default 8000).
   */
  function fonts(ids, timeoutMs) {
    if (!document.fonts || typeof document.fonts.load !== "function") return Promise.resolve();
    var jobs = [], names = [];
    normalise(ids).forEach(function (rec) {
      var id = rec.id, entry = core.registry.fontEntry(id);
      if (!entry) return;
      (rec.all ? weightsOf(entry) : rec.w).forEach(function (w) {
        var spec = w + " 1em \"" + entry.family + "\"", key = id + "|" + w;
        if (loaded[key]) return;
        names.push(entry.family);
        jobs.push(document.fonts.load(spec, SAMPLE).then(function (faces) {
          if (!faces || !faces.length) throw new CS.CSError("E_FONT_MISSING", "No @font-face is declared for " + entry.family + " " + w + ".", { id: id, weight: w });
          loaded[key] = true;
        }));
      });
    });
    if (!jobs.length) return Promise.resolve();
    var timer, timeout = new Promise(function (_, reject) {
      timer = setTimeout(function () { reject(new CS.CSError("E_FONT_MISSING", "Fonts did not load in time: " + names.join(", ") + ".", { families: names })); }, timeoutMs || 8000);
    });
    return Promise.race([Promise.all(jobs).then(function () { return document.fonts.ready; }), timeout]).then(
      function () { clearTimeout(timer); },
      function (e) { clearTimeout(timer); throw e; }
    );
  }

  function once(target, names, ms) {
    return new Promise(function (resolve) {
      var done = false, t;
      function fin() { if (done) return; done = true; clearTimeout(t); names.forEach(function (n) { target.removeEventListener(n, fin); }); resolve(); }
      names.forEach(function (n) { target.addEventListener(n, fin); });
      t = setTimeout(fin, ms);
    });
  }

  /** Waits for decoded <img> and for the first frame of <video> inside `root`. Broken images do not block. */
  function images(root) {
    root = root || document;
    var jobs = [];
    root.querySelectorAll("img").forEach(function (img) {
      if (img.complete && img.naturalWidth) return;
      if (typeof img.decode === "function") jobs.push(img.decode().catch(function () { /* a broken image is reported by QA, it must not block the render */ }));
      else jobs.push(once(img, ["load", "error"], 5000));
    });
    root.querySelectorAll("video").forEach(function (v) {
      if (v.readyState >= 2) return;
      jobs.push(once(v, ["loadeddata", "error"], 5000));
    });
    return Promise.all(jobs).then(function () { /* void */ });
  }

  /** Fonts that are being used + images + two animation frames. */
  function whenReady(root) {
    root = root || document;
    if (root.nodeType === 1) void root.offsetHeight;     // force layout so the faces in use are requested
    return Promise.resolve(document.fonts && document.fonts.ready).then(function () { return images(root); }).then(function () { return CS.util.raf2(); });
  }

  var pending = null;
  /** Called after a render completes; the first call flips window.__csReady and emits cs:ready. */
  function markReady() {
    if (window.__csReady === true) return Promise.resolve();
    if (pending) return pending;
    pending = Promise.resolve(document.fonts && document.fonts.ready).then(function () { return CS.util.raf2(); }).then(function () {
      if (window.__csReady === true) return;
      window.__csReady = true;
      CS.emit("cs:ready", { ms: Math.round((window.performance && performance.now()) || 0) });
    });
    return pending;
  }

  function checkAbort(signal) { if (signal && signal.aborted) throw abortError(); }

  core.ready = { fonts: fonts, fontSpecs: fontSpecs, images: images, whenReady: whenReady, markReady: markReady, checkAbort: checkAbort };
})();

  /* ---- file: boot.js ---- */
/* core/boot.js · CS.core.boot: from an HTML page that embeds its data to an engine that is ready to render.
 *
 *   schemas (registered with the validator) -> registry.loadPage (rules, fonts, presets, occasions, archetypes) -> light checks of
 *   the spec and the brand -> fonts loaded -> cs:boot
 *
 * A broken spec that cannot be rendered at all (no slides array, no locale, no style) rejects with E_SCHEMA; anything the schema
 * merely dislikes is reported through cs:error and the page still opens, so the owner can fix it in the Studio.
 */
(function () {
  var core = (CS.core = CS.core || {});

  var REQUIRED = ["text", "color", "canon", "schema"];

  function assertLibraries() {
    var missing = REQUIRED.filter(function (k) { return !core[k]; });
    if (missing.length) throw new CS.CSError("E_USAGE", "The engine needs CS.core." + missing.join(", CS.core.") + " (the library half of cs-core.js) and did not find it.", { missing: missing });
  }

  function report(code, message, detail) { CS.emit("cs:error", { code: code, message: message, detail: detail }); }

  function checkSpec(spec) {
    if (!spec) return;
    if (!Array.isArray(spec.slides) || !spec.locale || !spec.style || !spec.style.presetId) {
      throw new CS.CSError("E_SCHEMA", "The embedded spec has no slides, locale or style and cannot be rendered.", { keys: Object.keys(spec) });
    }
    var res = core.spec.validate(spec);
    if (!res.ok) report("E_SCHEMA", "The spec does not match its schema (" + (res.errors[0] ? res.errors[0].path + " " + res.errors[0].message : res.structure[0].path + " " + res.structure[0].message) + ").", { errors: res.errors, structure: res.structure });
  }

  async function boot(doc) {
    doc = doc || document;
    assertLibraries();
    var schemas = core.registry.readBlock(doc, "cs-schemas");
    if (schemas && typeof core.schema.register === "function") Object.keys(schemas).forEach(function (k) { core.schema.register(k, schemas[k]); });
    var data = core.registry.loadPage(doc);
    CS.visual?._?.reset?.();
    checkSpec(data.spec);
    if (data.brand) {
      try { var b = core.schema.validate("brand", data.brand); if (b && b.ok === false) report("E_SCHEMA", "The brand does not match its schema (" + b.errors[0].path + " " + b.errors[0].message + ").", { errors: b.errors }); }
      catch (e) { /* no brand schema registered */ }
    }
    /* the faces the opening post uses first; the other embedded families load when a render asks for them (the Style tab) */
    var ids = null;
    try { if (data.spec) ids = core.ready.fontSpecs(core.resolve.post(data.spec, data.brand)); } catch (e) { ids = null; }
    if (!ids) ids = data.config.fonts && data.config.fonts.length ? data.config.fonts : core.registry.fontIds();
    try { await core.ready.fonts(ids, 10000); }
    catch (e) { report((e && e.code) || "E_FONT_MISSING", (e && e.message) || "fonts did not load", e && e.detail); }
    CS.emit("cs:boot", { config: data.config });
    return data;
  }

  core.boot = boot;
})();
})();
