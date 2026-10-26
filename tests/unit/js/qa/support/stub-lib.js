/*
 * Test double for the CS.core libraries that cs-qa codes against (CONTRACT
 * 4.3.1): text and color. It follows CONTRACT 3.3 and exists only so the QA
 * unit tests run before, and independently of, the real src/lib build. The
 * conformance corpus (tests/conformance) checks the real library against the
 * Python engine. Pure code: loads in Node (require) and in a browser page.
 */
(function (root) {
  "use strict";
const WS = "[ \\t\\n\\r\\f\\v\\u00A0\\u202F]";
  const NOT_WS = "[^ \\t\\n\\r\\f\\v\\u00A0\\u202F<>\"]";
  const PATTERNS = [
    ["url", [new RegExp("https?:\\/\\/" + NOT_WS + "+", "yu"), new RegExp("www\\." + NOT_WS + "+", "yu")]],
    ["email", [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/yu]],
    ["handle", [/@[A-Za-z0-9._]{1,30}/yu]],
    ["tag", [new RegExp("#[^ \\t\\n\\r\\f\\v\\u00A0\\u202F#<>]+", "yu")]],
    ["phone", [/\+?[0-9][0-9\u00A0 ()-]{7,}[0-9]/yu]],
    ["number", [/[$\u20AC\u00A3]?[0-9]+(?:[.,][0-9]+)*(?:%|[A-Za-z]{1,6})?/yu, /[\u0660-\u0669]+(?:[\u066B\u066C][\u0660-\u0669]+)*٪?/yu, /[\u06F0-\u06F9]+/yu]],
    ["latin", [/[A-Za-z\u00C0-\u024F][A-Za-z0-9\u00C0-\u024F'\u2019._\-+/&]*/yu]],
    ["emoji", [/[\u2600-\u27BF\u2B50\u2B55\u{1F000}-\u{1FAFF}][\uFE0F\u200D\u2600-\u27BF\u{1F000}-\u{1FAFF}]*/yu]],
    ["ar", [/[\u0621-\u064A\u064B-\u0652\u0640\u066E-\u06D3\u06D5\u06FA-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]+/yu]],
    ["space", [new RegExp(WS + "+", "yu")]]
  ];
  const DOMAIN = /[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[a-z]{2,24}(?:\/[^ \t\n\r\f\v\u00A0\u202F<>"]*)?/yu;
  
  function tokenize(s) {
    const toks = [];
    let pos = 0;
    let cp = 0;
    while (pos < s.length) {
      let hit = null;
      // domain-form URL: only if the last label is letters only
      DOMAIN.lastIndex = pos;
      const d = DOMAIN.exec(s);
      if (d && !/[A-Za-z0-9-]/.test(s.charAt(pos + d[0].length) || " ")) hit = ["url", d[0]];
      for (let i = 0; !hit && i < PATTERNS.length; i++) {
        for (const re of PATTERNS[i][1]) {
          re.lastIndex = pos;
          const m = re.exec(s);
          if (m && m[0].length) {
            hit = [PATTERNS[i][0], m[0]];
            break;
          }
        }
      }
      if (hit && hit[0] === "latin") hit[1] = hit[1].replace(/[.\-_/&']+$/, "") || hit[1];
      if (!hit) hit = ["punct", String.fromCodePoint(s.codePointAt(pos))];
      const text = hit[1];
      const len = Array.from(text).length;
      const kind = hit[0];
      let ltr = false;
      if (kind === "tag") ltr = !/[\u0600-\u06FF]/.test(text);
      else if (kind === "number") ltr = /^[$\u20AC\u00A3]?[0-9]/.test(text);
      else ltr = ["url", "email", "handle", "phone", "latin"].indexOf(kind) >= 0;
      toks.push({ kind, text, start: cp, end: cp + len, ltr });
      pos += text.length;
      cp += len;
    }
    return toks;
  }
  
  function parseMarkup(s) {
    const breaks = [];
    let plain = "";
    const spans = [];
    const m = /==([^=\n][^\n]*?)==/.exec(s);
    let src = s;
    if (m) {
      const before = s.slice(0, m.index);
      plain = before + m[1] + s.slice(m.index + m[0].length);
      spans.push({ start: Array.from(before).length, end: Array.from(before + m[1]).length });
      src = plain;
    } else plain = s;
    for (let i = 0; i < src.length; i++) if (src.charAt(i) === "\n") breaks.push(i);
    return { plain, spans, breaks };
  }
  const stripMarkup = (s) => parseMarkup(String(s)).plain.replace(/\n/g, " ");
  
  function wordCount(s) {
    return stripMarkup(s)
      .split(new RegExp(WS + "+"))
      .filter((t) => /[\p{L}\p{N}]/u.test(t)).length;
  }
  const charCount = (s) => Array.from(String(s).normalize("NFC")).length;
  
  function skeleton(s) {
    let t = String(s).normalize("NFC").replace(/[A-Z]/g, (c) => c.toLowerCase());
    t = t.replace(/[\u064B-\u065F\u0670\u0640]/g, "");
    t = t.replace(/[\u0623\u0625\u0622\u0671]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/ؤ/g, "و").replace(/ئ/g, "ي");
    t = t.replace(/[\u0660-\u0669\u06F0-\u06F9]/g, (c) => String(c.charCodeAt(0) >= 0x6f0 ? c.charCodeAt(0) - 0x6f0 : c.charCodeAt(0) - 0x660));
    return t.replace(/[^\p{L}\p{N}]/gu, "");
  }
  function similarity(a, b) {
    const grams = (s) => {
      const cps = Array.from(skeleton(s));
      const set = new Set();
      if (cps.length < 3) {
        if (cps.length) set.add(cps.join(""));
        return set;
      }
      for (let i = 0; i + 3 <= cps.length; i++) set.add(cps.slice(i, i + 3).join(""));
      return set;
    };
    const A = grams(a);
    const B = grams(b);
    if (!A.size && !B.size) return 1;
    if (!A.size || !B.size) return 0;
    let inter = 0;
    A.forEach((g) => B.has(g) && inter++);
    return (2 * inter) / (A.size + B.size);
  }
  
  const AI = "٠١٢٣٤٥٦٧٨٩";
  function convertDigits(s, to) {
    const skipKinds = { handle: 1, tag: 1, url: 1, email: 1, phone: 1 };
    return tokenize(s)
      .map((t) => {
        if (skipKinds[t.kind] || t.kind !== "number" || /[A-Za-z]/.test(t.text)) return t.text;
        let x = t.text.replace(/[\u0660-\u0669\u06F0-\u06F9]/g, (c) => String(c.charCodeAt(0) >= 0x6f0 ? c.charCodeAt(0) - 0x6f0 : c.charCodeAt(0) - 0x660));
        x = x.replace(/٫/g, ".").replace(/٬/g, ",").replace(/٪/g, "%");
        if (to === "arabic-indic") {
          x = x.replace(/([0-9]),(?=[0-9]{3}(?![0-9]))/g, "$1٬").replace(/\./g, "٫").replace(/%/g, "٪");
          x = x.replace(/[0-9]/g, (c) => AI.charAt(+c));
        }
        return x;
      })
      .join("");
  }
  
  const RIGHT = new Set("اأإآدذرزوؤةء".split("").map((c) => c.codePointAt(0)));
  function joiningType(cp) {
    if (cp >= 0x064b && cp <= 0x065f) return "T";
    if (cp === 0x0670) return "T";
    if (cp === 0x0640) return "C";
    if (RIGHT.has(cp)) return "R";
    if ((cp >= 0x0621 && cp <= 0x064a) || (cp >= 0x066e && cp <= 0x06d3)) return "D";
    return "U";
  }
  
  function hasTashkeel(s) {
    return /[\u064B-\u0652\u0670]/.test(s);
  }
  
  const text = {
    normalize: (s) => String(s).normalize("NFC"),
    parseMarkup,
    stripMarkup,
    tokenize,
    wordCount,
    charCount,
    digits: { convert: convertDigits },
    similarity,
    skeleton,
    arabic: { hasArabic: (s) => /[\u0600-\u06FF]/.test(s), hasTashkeel, joiningType }
  };
  
  /* ---------------------------------------------------------------- colour */
  function parse(hex) {
    const h = hex.replace("#", "");
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
  }
  function lin(c) {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
  function luminance(hex) {
    const c = parse(hex);
    return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
  }
  function toOklch(hex) {
    const c = parse(hex);
    const r = lin(c.r);
    const g = lin(c.g);
    const b = lin(c.b);
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
    const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
    const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
    return { L, C: Math.sqrt(A * A + B * B), h: ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360 };
  }
  const color = {
    parse,
    luminance,
    toOklch,
    contrast(a, b) {
      const x = luminance(a);
      const y = luminance(b);
      return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
    }
  };

  var lib = { text: text, color: color };
  if (typeof module === "object" && module.exports) module.exports = lib;
  else root.StubLib = lib;
})(typeof globalThis !== "undefined" ? globalThis : this);
