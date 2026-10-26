/* lib/root.js · the root of window.CS (CONTRACT 4.0 and 4.2).
 *
 * First file of the chunk cs-core.js. Everything else in the runtime hangs off the namespace created here:
 * the version, CSError, the tiny event bus (CS.on / once / off / emit), CS.util and the empty CS.core object that
 * lib/*.js and core/*.js fill. Nothing in this file touches the DOM at load time.
 */
CS.version = "cs-1.1.0";

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
