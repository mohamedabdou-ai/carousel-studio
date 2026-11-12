/* tests/unit/js/core/lib-stub.js
 *
 * A compact stand-in for the library half of cs-core.js (src/lib/, owned by B4) so the engine's unit tests run before the two
 * halves are merged. It implements CS.core.{text, color, canon, schema, format}, CS.CSError, CS.emit/on and CS.util to the
 * letter of CONTRACT 3.1-3.3 and 4.0-4.3.1 as far as the engine uses them. The harness loads src/lib/ instead when it exists
 * (query "?lib=real"), and the same tests must pass with either.
 */
(function () {
  "use strict";
  var CS = (window.CS = window.CS || {});
  var core = (CS.core = CS.core || {});

  /* ---- root --------------------------------------------------------------------------------------------- */
  CS.version = "cs-1.2.0";
  class CSError extends Error {
    constructor(code, message, detail) { super(message || code); this.name = "CSError"; this.code = code; if (detail !== undefined) this.detail = detail; }
  }
  CS.CSError = CSError;
  var listeners = {};
  CS.on = function (type, fn) { (listeners[type] = listeners[type] || []).push(fn); return function () { CS.off(type, fn); }; };
  CS.once = function (type, fn) { var off = CS.on(type, function (d, e) { off(); fn(d, e); }); return off; };
  CS.off = function (type, fn) { listeners[type] = (listeners[type] || []).filter(function (f) { return f !== fn; }); };
  CS.emit = function (type, detail) {
    var ev = new CustomEvent(type, { detail: detail });
    (listeners[type] || []).slice().forEach(function (f) { f(detail, ev); });
    document.dispatchEvent(ev);
  };
  CS.util = {
    uid: function (p) { return (p || "id") + "-" + Math.random().toString(36).slice(2, 8); },
    clamp: function (n, a, b) { return Math.max(a, Math.min(b, n)); },
    sleep: function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); },
    raf2: function () { return new Promise(function (r) { requestAnimationFrame(function () { requestAnimationFrame(function () { r(); }); }); }); },
    isWebKit: function () { return /AppleWebKit/.test(navigator.userAgent) && !/Chrome|Chromium|Edg/.test(navigator.userAgent); },
    isTouch: function () { return "ontouchstart" in window; },
    el: function (tag, attrs) { var e = document.createElement(tag); Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); }); return e; }
  };
  core.format = function (tpl, params) { return String(tpl).replace(/\{(\w+)\}/g, function (m, k) { return Object.prototype.hasOwnProperty.call(params || {}, k) ? params[k] : m; }); };

  /* ---- colour ---------------------------------------------------------------------------------------------- */
  var C = {};
  function lin(c) { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  function gam(c) { c = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055; return c; }
  C.parse = function (hex) { var h = hex.replace("#", ""); return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) }; };
  C.toHex = function (o) { return "#" + [o.r, o.g, o.b].map(function (v) { v = Math.max(0, Math.min(255, Math.round(v))); return (v < 16 ? "0" : "") + v.toString(16); }).join("").toUpperCase(); };
  function toLab(hex) {
    var c = C.parse(hex), r = lin(c.r), g = lin(c.g), b = lin(c.b);
    var l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return { L: 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s, a: 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s, b: 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s };
  }
  function fromLabRaw(L, a, b) {
    var l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * b, 3), m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * b, 3), s = Math.pow(L - 0.0894841775 * a - 1.2914855480 * b, 3);
    return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s];
  }
  C.toOklch = function (hex) { var o = toLab(hex); var h = Math.atan2(o.b, o.a) * 180 / Math.PI; if (h < 0) h += 360; return { L: o.L, C: Math.hypot(o.a, o.b), h: h }; };
  C.fromOklch = function (c) {
    var Cc = c.C, hr = c.h * Math.PI / 180;
    function rgb(ch) { var v = fromLabRaw(c.L, ch * Math.cos(hr), ch * Math.sin(hr)); return v; }
    function inGamut(v) { return v.every(function (x) { return x >= -0.0005 && x <= 1.0005; }); }
    var v = rgb(Cc);
    if (!inGamut(v)) { var lo = 0, hi = Cc; for (var i = 0; i < 24; i++) { var mid = (lo + hi) / 2; if (inGamut(rgb(mid))) lo = mid; else hi = mid; } v = rgb(lo); }
    return C.toHex({ r: gam(Math.max(0, Math.min(1, v[0]))) * 255, g: gam(Math.max(0, Math.min(1, v[1]))) * 255, b: gam(Math.max(0, Math.min(1, v[2]))) * 255 });
  };
  C.luminance = function (hex) { var c = C.parse(hex); return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b); };
  C.contrast = function (a, b) { var x = C.luminance(a), y = C.luminance(b), hi = Math.max(x, y), lo = Math.min(x, y); return (hi + 0.05) / (lo + 0.05); };
  C.mix = function (a, b, t) {
    var x = C.parse(a), y = C.parse(b);
    function m(p, q) { return gam(lin(p) * (1 - t) + lin(q) * t) * 255; }
    return C.toHex({ r: m(x.r, y.r), g: m(x.g, y.g), b: m(x.b, y.b) });
  };
  C.onColor = function (bg) { return C.contrast("#111111", bg) >= C.contrast("#FFFFFF", bg) ? "#111111" : "#FFFFFF"; };
  C.ensureContrast = function (fg, bg, min) {
    if (C.contrast(fg, bg) >= min) return { hex: fg, changed: false, steps: 0 };
    var lch = C.toOklch(fg), dir = C.luminance(bg) > 0.18 ? -1 : 1, steps = 0, best = fg;
    for (var L = lch.L; L >= 0 && L <= 1; L += dir * 0.005) {
      steps++;
      best = C.fromOklch({ L: L, C: lch.C, h: lch.h });
      if (C.contrast(best, bg) >= min) return { hex: best, changed: true, steps: steps };
    }
    return { hex: best, changed: true, steps: steps };
  };
  core.color = C;

  /* ---- canonical JSON and hashes -------------------------------------------------------------------------- */
  function canonicalJSON(v) {
    if (v === null) return "null";
    if (typeof v === "boolean") return v ? "true" : "false";
    if (typeof v === "number") {
      if (!isFinite(v) || Math.abs(v) >= 1e21 || (v !== 0 && Math.abs(v) < 1e-6)) throw new CSError("E_SCHEMA", "number not hashable: " + v);
      return Object.is(v, -0) ? "0" : String(v);
    }
    if (typeof v === "string") return JSON.stringify(v.normalize("NFC")).replace(/[\u007f-￿]/g, function (c) { return c; }).replace(/\\u([0-9A-F]{4})/g, function (m, h) { return "\\u" + h.toLowerCase(); });
    if (Array.isArray(v)) return "[" + v.map(function (x) { return x === undefined ? "null" : canonicalJSON(x); }).join(",") + "]";
    return "{" + Object.keys(v).filter(function (k) { return v[k] !== undefined; }).sort().map(function (k) { return JSON.stringify(k) + ":" + canonicalJSON(v[k]); }).join(",") + "}";
  }
  function fnv1a64(s) {
    var h = 0xcbf29ce484222325n, p = 0x100000001b3n, mask = 0xffffffffffffffffn, bytes = new TextEncoder().encode(s);
    for (var i = 0; i < bytes.length; i++) { h ^= BigInt(bytes[i]); h = (h * p) & mask; }
    return h.toString(16).padStart(16, "0");
  }
  function omit(o, keys) { var c = Object.assign({}, o); keys.forEach(function (k) { delete c[k]; }); return c; }
  core.canon = {
    canonicalJSON: canonicalJSON, fnv1a64: fnv1a64, hash: function (v) { return fnv1a64(canonicalJSON(v)); },
    brandSnapshot: function (b) {
      var c = omit(b, ["updatedAt", "createdAt", "ext", "onboarding"]);
      if (c.hooks) c.hooks = omit(c.hooks, ["history"]);
      if (c.visual && c.visual.logo) c.visual = Object.assign({}, c.visual, { logo: omit(c.visual.logo, ["dataUri"]) });
      return c;
    },
    hashable: function (t) { return omit(t, ["provenance", "adjustments", "css", "hash"]); }
  };

  /* ---- schema (the subset of CONTRACT 3.1) ------------------------------------------------------------------- */
  var schemas = {};
  function cpLen(s) { return Array.from(s).length; }
  function validateNode(sc, v, path, root, errs) {
    if (sc.$ref) { var name = sc.$ref.replace("#/$defs/", ""); return validateNode(root.$defs[name], v, path, root, errs); }
    function err(keyword, message) { errs.push({ path: path, keyword: keyword, message: message }); }
    if (sc.allOf) sc.allOf.forEach(function (s) { validateNode(s, v, path, root, errs); });
    if (sc.anyOf && !sc.anyOf.some(function (s) { var e = []; validateNode(s, v, path, root, e); return !e.length; })) err("anyOf", "no alternative matches");
    if (sc.oneOf) { var n = sc.oneOf.filter(function (s) { var e = []; validateNode(s, v, path, root, e); return !e.length; }).length; if (n !== 1) err("oneOf", "must match exactly one alternative"); }
    if ("const" in sc && JSON.stringify(sc.const) !== JSON.stringify(v)) err("const", "must equal " + JSON.stringify(sc.const));
    if (sc.enum && !sc.enum.some(function (x) { return JSON.stringify(x) === JSON.stringify(v); })) err("enum", "must be one of " + sc.enum.join(", "));
    if (sc.type) {
      var types = Array.isArray(sc.type) ? sc.type : [sc.type];
      var ok = types.some(function (t) {
        if (t === "null") return v === null; if (t === "array") return Array.isArray(v); if (t === "object") return v !== null && typeof v === "object" && !Array.isArray(v);
        if (t === "integer") return typeof v === "number" && isFinite(v) && Math.floor(v) === v; if (t === "number") return typeof v === "number" && isFinite(v);
        return typeof v === t;
      });
      if (!ok) { err("type", "must be " + types.join(" or ")); return; }
    }
    if (typeof v === "string") {
      if (sc.minLength !== undefined && cpLen(v) < sc.minLength) err("minLength", "too short");
      if (sc.maxLength !== undefined && cpLen(v) > sc.maxLength) err("maxLength", "too long");
      if (sc.pattern && !new RegExp(sc.pattern, "u").test(v)) err("pattern", "does not match " + sc.pattern);
    }
    if (typeof v === "number") {
      if (sc.minimum !== undefined && v < sc.minimum) err("minimum", "below " + sc.minimum);
      if (sc.maximum !== undefined && v > sc.maximum) err("maximum", "above " + sc.maximum);
    }
    if (Array.isArray(v)) {
      if (sc.minItems !== undefined && v.length < sc.minItems) err("minItems", "too few items");
      if (sc.maxItems !== undefined && v.length > sc.maxItems) err("maxItems", "too many items");
      if (sc.uniqueItems && new Set(v.map(function (x) { return JSON.stringify(x); })).size !== v.length) err("uniqueItems", "items must be unique");
      if (sc.items) v.forEach(function (x, i) { validateNode(sc.items, x, path + "/" + i, root, errs); });
    } else if (v !== null && typeof v === "object") {
      if (sc.required) sc.required.forEach(function (k) { if (!(k in v)) errs.push({ path: path + "/" + k, keyword: "required", message: "is required" }); });
      if (sc.minProperties !== undefined && Object.keys(v).length < sc.minProperties) err("minProperties", "too few properties");
      Object.keys(v).forEach(function (k) {
        if (sc.properties && sc.properties[k]) validateNode(sc.properties[k], v[k], path + "/" + k, root, errs);
        else if (sc.additionalProperties === false) errs.push({ path: path + "/" + k, keyword: "additionalProperties", message: "is not allowed" });
        else if (sc.additionalProperties && typeof sc.additionalProperties === "object") validateNode(sc.additionalProperties, v[k], path + "/" + k, root, errs);
      });
    }
  }
  core.schema = {
    register: function (kind, schema) { schemas[kind] = schema; },
    validate: function (kind, value, opts) {
      var root = schemas[kind]; if (!root) throw new CSError("E_USAGE", "no schema registered for " + kind);
      var sc = opts && opts.def ? root.$defs[opts.def] : root, errs = [];
      validateNode(sc, value, "", root, errs);
      errs.sort(function (a, b) { return a.path < b.path ? -1 : a.path > b.path ? 1 : a.keyword < b.keyword ? -1 : 1; });
      return { ok: errs.length === 0, errors: errs };
    }
  };

  /* ---- text (CONTRACT 3.3) ----------------------------------------------------------------------------------- */
  var WS = " \\t\\n\\r\\f\\v\\u00A0\\u202F", NS = "[^" + WS + "]";
  var BIND_LABELS = ["الخطوة", "رقم", "نصيحة", "الجزء", "الفصل", "المرحلة", "الدرس", "المركز"];
  var AR_RANGE = "\\u0621-\\u064A\\u064B-\\u0652\\u0640\\u066E-\\u06D3\\u06D5\\u06FA-\\u06FF\\u0750-\\u077F\\u08A0-\\u08FF\\uFB50-\\uFDFF\\uFE70-\\uFEFF";
  var TOKEN_DEFS = [
    ["url", new RegExp("https?:\\/\\/[^" + WS + "<>\"]+|www\\.[^" + WS + "<>\"]+|[A-Za-z0-9-]+(?:\\.[A-Za-z0-9-]+)*\\.[a-z]{2,24}(?:\\/[^" + WS + "<>\"]*)?", "uy")],
    ["email", /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/uy],
    ["handle", /@[A-Za-z0-9._]{1,30}/uy],
    ["tag", new RegExp("#[^" + WS + "#<>]+", "uy")],
    ["phone", new RegExp("\\+?[0-9][0-9\\u00A0 ()-]{7,}[0-9]", "uy")],
    ["number", /[$€£]?[0-9]+(?:[.,][0-9]+)*(?:%|[A-Za-z]{1,6})?|[٠-٩]+(?:[٫٬][٠-٩]+)*٪?|[۰-۹]+/uy],
    ["latin", /[A-Za-zÀ-ɏ][A-Za-z0-9À-ɏ'’._\-+/&]*/uy],
    ["emoji", /[☀-➿⭐⭕\u{1F000}-\u{1FAFF}][\uFE0F\u200D☀-➿\u{1F000}-\u{1FAFF}]*/uy],
    ["ar", new RegExp("[" + AR_RANGE + "]+", "uy")],
    ["space", new RegExp("[" + WS + "]+", "uy")]
  ];
  function isAr(s) { return new RegExp("[\\u0600-\\u06FF\\u0750-\\u077F\\uFB50-\\uFDFF\\uFE70-\\uFEFF]").test(s); }
  function normalize(s) { return String(s == null ? "" : s).normalize("NFC"); }
  function cpOffsets(s) { var map = [], n = 0; for (var i = 0; i < s.length; i++) { map[i] = n; var c = s.charCodeAt(i); if (c >= 0xd800 && c <= 0xdbff) { map[++i] = n; } n++; } map[s.length] = n; return map; }

  function tokenize(s) {
    s = normalize(s);
    var out = [], pos = 0, off = cpOffsets(s);
    while (pos < s.length) {
      var hit = null;
      for (var i = 0; i < TOKEN_DEFS.length && !hit; i++) {
        var re = TOKEN_DEFS[i][1]; re.lastIndex = pos;
        var m = re.exec(s);
        if (m && m.index === pos && m[0].length) {
          var kind = TOKEN_DEFS[i][0], text = m[0];
          if (kind === "latin") text = text.replace(/[.\-_/&']+$/, "");
          if (!text) continue;
          hit = { kind: kind, text: text };
        }
      }
      if (!hit) { var cp = String.fromCodePoint(s.codePointAt(pos)); hit = { kind: "punct", text: cp }; }
      var ltr = hit.kind === "tag" ? !isAr(hit.text) : (hit.kind === "number" ? /^[$€£]?[0-9]/.test(hit.text) : ["url", "email", "handle", "phone", "latin"].indexOf(hit.kind) >= 0);
      out.push({ kind: hit.kind, text: hit.text, start: off[pos], end: off[pos + hit.text.length], ltr: ltr });
      pos += hit.text.length;
    }
    return out;
  }

  function parseMarkup(s) {
    s = normalize(s);
    var plain = "", spans = [], breaks = [], i = 0, open = -1, spanDone = false;
    var cps = Array.from(s);
    for (i = 0; i < cps.length; i++) {
      var c = cps[i];
      if (c === "=" && cps[i + 1] === "=" && !spanDone) {
        if (open < 0) {
          var rest = cps.slice(i + 2), close = -1;
          for (var j = 0; j < rest.length - 1; j++) { if (rest[j] === "\n") break; if (rest[j] === "=" && rest[j + 1] === "=" && j > 0) { close = j; break; } }
          if (close > 0) { open = Array.from(plain).length; i++; continue; }
        } else { spans.push({ start: open, end: Array.from(plain).length }); open = -1; spanDone = true; i++; continue; }
      }
      if (c === "\n") breaks.push(Array.from(plain).length);
      plain += c;
    }
    return { plain: plain, spans: spans, breaks: breaks };
  }
  function stripMarkup(s) { return parseMarkup(s).plain.replace(/\n/g, " "); }

  function words(s) { return stripMarkup(s).split(new RegExp("[" + WS + "]+")).filter(function (t) { return /[\p{L}\p{N}]/u.test(t); }); }

  var DIG_AI = "٠١٢٣٤٥٦٧٨٩";
  function excluded(t) { return t.kind === "handle" || t.kind === "tag" || t.kind === "url" || t.kind === "email" || t.kind === "phone" || (t.kind === "number" && /[A-Za-z]/.test(t.text)); }
  function convNumber(text, to) {
    var out = "";
    if (to === "arabic-indic") {
      text = text.replace(/[۰-۹]/g, function (c) { return String(c.charCodeAt(0) - 0x06f0); });
      out = text.replace(/[0-9]/g, function (d) { return DIG_AI.charAt(+d); }).replace(/([٠-٩])\.(?=[٠-٩])/g, "$1٫").replace(/([٠-٩]),(?=[٠-٩]{3}(?![٠-٩]))/g, "$1٬").replace(/%/g, "٪");
    } else {
      text = text.replace(/[۰-۹]/g, function (c) { return String(c.charCodeAt(0) - 0x06f0); });
      out = text.replace(/[٠-٩]/g, function (d) { return String(DIG_AI.indexOf(d)); }).replace(/٫/g, ".").replace(/٬/g, ",").replace(/٪/g, "%");
    }
    return out;
  }
  var digits = {
    detect: function (s) {
      var seen = {};
      tokenize(s).forEach(function (t) {
        if (t.kind !== "number" || excluded(t)) return;
        if (/[0-9]/.test(t.text)) seen.western = 1; if (/[٠-٩]/.test(t.text)) seen["arabic-indic"] = 1; if (/[۰-۹]/.test(t.text)) seen.persian = 1;
      });
      var k = Object.keys(seen);
      return !k.length ? "none" : seen.persian ? "persian" : k.length > 1 ? "mixed" : k[0];
    },
    convert: function (s, to) { return tokenize(s).map(function (t) { return t.kind === "number" && !excluded(t) ? convNumber(t.text, to) : t.text; }).join(""); },
    formatNumber: function (v, to) { return convNumber(String(v), to); },
    counter: function (i, n, to, lang) { var a = digits.convert(String(i), to), b = digits.convert(String(n), to); return lang === "en" ? a + "/" + b : a + " من " + b; },
    remaining: function (k, to, lang) { var a = digits.convert(String(k), to); return lang === "en" ? a + " left" : "باقي " + a; }
  };

  /* Arabic joining: just enough of the table for kashida placement */
  var DUAL = "بتثجحخسشصضطظعغفقكلمنهيئ" + "ةىپچڤگ".slice(0, 0) + "ـ";
  var RIGHT = "ادذرزوؤأإآةىء";
  var PREFER = "سشصضبنيت";
  var arabic = {
    hasArabic: function (s) { return isAr(s); },
    hasTashkeel: function (s) { return /[ً-ٰٟ]/.test(s); },
    joiningType: function (cp) {
      var ch = String.fromCodePoint(cp);
      if (cp >= 0x064b && cp <= 0x065f || cp === 0x0670) return "T";
      if (cp === 0x0640) return "C";
      if (DUAL.indexOf(ch) >= 0) return "D"; if (RIGHT.indexOf(ch) >= 0) return "R"; return "U";
    },
    kashida: {
      positions: function (word) {
        var cps = Array.from(word), out = [];
        for (var i = 0; i < cps.length - 1; i++) {
          var a = arabic.joiningType(cps[i].codePointAt(0)), b = arabic.joiningType(cps[i + 1].codePointAt(0));
          if (a === "D" && (b === "D" || b === "R")) out.push(i + 1);
        }
        return out;
      },
      apply: function (word, count) {
        count = count === undefined ? 3 : count;
        var cps = Array.from(word);
        if (cps.filter(function (c) { return isAr(c); }).length < 3) return word;
        var pos = arabic.kashida.positions(word); if (!pos.length) return word;
        var best = pos.filter(function (p) { return PREFER.indexOf(cps[p - 1]) >= 0; })[0] || pos[0];
        cps.splice(best, 0, new Array(count + 1).join("ـ"));
        return cps.join("");
      }
    }
  };

  function esc(s) { return s.replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  var LTR_KINDS = { latin: 1, number: 1, handle: 1, url: 1, email: 1, phone: 1, tag: 1 };

  function toHTML(input, opts) {
    opts = opts || {};
    var markup = opts.markup !== false, wordSpans = opts.wordSpans !== false, to = opts.digits || "western", base = opts.indexBase || 0;
    var pm = markup ? parseMarkup(input) : { plain: normalize(input), spans: [], breaks: [] };
    var span = pm.spans[0] || null, lines = pm.plain.split("\n"), gpos = 0, idx = base, html = [];
    lines.forEach(function (line, li) {
      var toks = tokenize(line).map(function (t) { t.start += gpos; t.end += gpos; return t; });
      var units = [], cur = null;
      toks.forEach(function (t) {
        if (t.kind === "space") { cur = null; units.push({ sep: t.text, start: t.start, end: t.end }); return; }
        if (!cur) { cur = { toks: [], start: t.start }; units.push(cur); }
        cur.toks.push(t); cur.end = t.end;
      });
      /* bindings with NBSP */
      for (var u = 0; u < units.length - 2; u++) {
        var a = units[u], sep = units[u + 1], b = units[u + 2];
        if (!a.toks || !sep.sep || !b.toks || sep.sep !== " ") continue;
        var aLast = a.toks[a.toks.length - 1], bFirst = b.toks[0];
        if ((aLast.kind === "number" && a.toks.length === 1 && bFirst.kind === "ar") || (aLast.kind === "ar" && BIND_LABELS.indexOf(aLast.text) >= 0 && bFirst.kind === "number")) sep.sep = "\u00A0";
      }
      /* merge LTR-only units separated by one ordinary space into runs */
      var out = [], k = 0;
      function unitLtr(x) { return x.toks && x.toks.length === 1 && x.toks[0].ltr && LTR_KINDS[x.toks[0].kind]; }
      function render1(tok) {
        var text = tok.text;
        if (tok.kind === "number" && !excluded(tok)) text = convNumber(text, to);
        if (tok.kind === "ar" || tok.kind === "punct") return esc(text);
        if (tok.kind === "emoji") return '<span class="cs-emoji">' + esc(text) + "</span>";
        if (tok.ltr) return '<bdi dir="ltr" class="cs-ltr" data-run="' + tok.kind + '">' + esc(text) + "</bdi>";
        if (tok.kind === "tag") return '<bdi dir="rtl" class="cs-rtl" data-run="tag">' + esc(text) + "</bdi>";
        return esc(text);
      }
      function inSpan(x) { return span && x.start < span.end && x.end > span.start; }
      var pieces = [];
      while (k < units.length) {
        var x = units[k];
        if (x.sep !== undefined) { pieces.push({ sep: x.sep }); k++; continue; }
        if (unitLtr(x)) {
          var run = [x], kk = k;
          while (units[kk + 1] && units[kk + 1].sep === " " && units[kk + 2] && unitLtr(units[kk + 2])) { run.push(units[kk + 2]); kk += 2; }
          var kind = x.toks[0].kind;
          if (run.length > 1) kind = "latin";
          var inner = run.map(function (r) {
            var w = r.toks[0], text = w.kind === "number" ? convNumber(w.text, to) : w.text;
            return (wordSpans ? '<span class="w" data-w="' + (idx++) + '">' + esc(text) + "</span>" : esc(text));
          }).join(" ");
          pieces.push({ html: '<bdi dir="ltr" class="cs-ltr" data-run="' + kind + '">' + inner + "</bdi>", em: run.some(inSpan), unit: true, raw: run.map(function (r) { return r.toks[0].text; }).join(" ") });
          k = kk + 1; continue;
        }
        var cls = "w", kw = opts.kashidaWord && opts.allowKashida ? opts.kashidaWord.replace(/[ً-ْـ]/g, "") : null;
        var body = x.toks.map(function (tok) {
          if (kw && tok.kind === "ar" && tok.text.replace(/[ً-ْـ]/g, "") === kw) { cls = "w cs-kashida"; return esc(arabic.kashida.apply(tok.text, 3)); }
          return render1(tok);
        }).join(""), em = inSpan(x);
        pieces.push({ html: wordSpans ? '<span class="' + cls + '" data-w="' + (idx++) + '">' + body + "</span>" : body, em: em, unit: true });
        k++;
      }
      /* emphasis wraps whole units and the spaces between them */
      var res = "", emOpen = false;
      pieces.forEach(function (p, pi) {
        if (p.sep !== undefined) { var nextEm = pieces[pi + 1] && pieces[pi + 1].em && emOpen; res += (emOpen && !nextEm ? "</mark>" : "") + p.sep; if (emOpen && !nextEm) emOpen = false; return; }
        if (p.em && !emOpen) { res += '<mark class="cs-em" data-m="em">'; emOpen = true; }
        if (!p.em && emOpen) { res += "</mark>"; emOpen = false; }
        res += p.html;
      });
      if (emOpen) res += "</mark>";
      html.push(res);
      gpos += Array.from(line).length + 1;
    });
    return html.join("<br>");
  }

  function skeleton(s) {
    s = normalize(s).toLowerCase().replace(/[ً-ٰٟـ]/g, "").replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/ؤ/g, "و").replace(/ئ/g, "ي");
    s = digits.convert(s, "western");
    return s.replace(/[^\p{L}\p{N}]/gu, "");
  }
  function grams(s) { var cps = Array.from(s); if (cps.length < 3) return [cps.join("")]; var g = []; for (var i = 0; i <= cps.length - 3; i++) g.push(cps.slice(i, i + 3).join("")); return g; }
  function similarity(a, b) {
    var x = skeleton(a), y = skeleton(b);
    if (!x && !y) return 1; if (!x || !y) return 0;
    var A = new Set(grams(x)), B = new Set(grams(y)), inter = 0;
    A.forEach(function (g) { if (B.has(g)) inter++; });
    return (2 * inter) / (A.size + B.size);
  }

  core.text = {
    normalize: normalize, parseMarkup: parseMarkup, stripMarkup: stripMarkup, tokenize: tokenize,
    wordCount: function (s) { return words(s).length; }, charCount: function (s) { return Array.from(normalize(s)).length; },
    toHTML: toHTML, bind: function (s) { return s; }, digits: digits, similarity: similarity, skeleton: skeleton, arabic: arabic,
    slideText: function (slide) { return [slide.kicker, slide.headline, slide.title, slide.sub, slide.body].filter(Boolean).concat(slide.bullets || []).map(stripMarkup); }
  };
})();
