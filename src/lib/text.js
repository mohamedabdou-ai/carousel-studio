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
