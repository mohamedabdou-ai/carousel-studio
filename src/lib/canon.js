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
