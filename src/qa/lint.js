/* Carousel Studio · cs-qa · lint
 *
 * The text-matching engine behind gates C1, C3, C4, C8, O1, SEN1 (word lists
 * and dialect markers, CONTRACT 7.4) and the built-in Arabic checks used by
 * N1, B1 and the orthography rules (CONTRACT 7.4 "CheckName").
 *
 * Offsets in this file are UTF-16 code-unit offsets into the string that was
 * passed in. Matching runs on a "folded" copy of the text with tashkeel,
 * superscript alef and tatweel removed; offsets map back to the original.
 */

const LINT_CLITICS = ["و", "ف", "ب", "ل", "ك", "ال", "وال", "بال", "كال", "فال", "لل", "ولل"];
const LINT_BIND_LABELS = ["الخطوة", "رقم", "نصيحة", "الجزء"];
const LTR_SKIP_KINDS = { url: 1, email: 1, handle: 1, tag: 1, phone: 1 };
const AR_L =
  "\\u0621-\\u064A\\u066E-\\u06D3\\u06D5\\u06FA-\\u06FF\\u0750-\\u077F\\u08A0-\\u08FF\\uFB50-\\uFDFF\\uFE70-\\uFEFF";
const AR_MARKS = "\\u064B-\\u065F\\u0670";
const WS_SPLIT = /[ \t\n\r\f\v\u00A0\u202F]+/;

const isMarkCode = (c) => (c >= 0x064b && c <= 0x065f) || c === 0x0670 || c === 0x0640;
const isLatinStart = (s) => /^[A-Za-z\u00C0-\u024F]/.test(s);

/* ------------------------------------------------------------------ folding */

/** Remove U+064B–065F, U+0670 and U+0640; `map[i]` is the original offset of
 *  folded char i (and `map[len]` is the original length). */
function foldMarks(s) {
  const out = [];
  const map = [];
  for (let i = 0; i < s.length; i++) {
    if (isMarkCode(s.charCodeAt(i))) continue;
    out.push(s.charAt(i));
    map.push(i);
  }
  map.push(s.length);
  return { text: out.join(""), map, orig: s };
}

/** Original range of the folded range [a, b); trailing marks join the word. */
function foldedRange(f, a, b) {
  const start = f.map[a];
  let end = f.map[Math.max(a, b - 1)] + 1;
  while (end < f.orig.length && isMarkCode(f.orig.charCodeAt(end))) end++;
  return [start, end];
}

function wordTokens(folded) {
  const re = new RegExp("[" + AR_L + "]+|[A-Za-z\\u00C0-\\u024F][A-Za-z0-9\\u00C0-\\u024F'\\u2019]*|[0-9\\u0660-\\u0669]+", "g");
  const out = [];
  let m;
  while ((m = re.exec(folded))) out.push({ text: m[0], start: m.index, end: m.index + m[0].length });
  return out;
}

/* --------------------------------------------------------- entry matching */

const entryApplies = (entry, dialect) =>
  !Array.isArray(entry.dialects) || entry.dialects.indexOf("*") >= 0 || !dialect || entry.dialects.indexOf(dialect) >= 0;

function wordEq(token, ew, useClitics, clitics) {
  const lat = isLatinStart(token);
  const a = lat ? token.toLowerCase() : toWesternDigits(token);
  const b = isLatinStart(ew) ? ew.toLowerCase() : toWesternDigits(ew);
  if (a === b) return true;
  if (useClitics && !lat) {
    for (let i = 0; i < clitics.length; i++) if (a === clitics[i] + b) return true;
  }
  return false;
}

/** CONTRACT 7.4 matching. `entries` are copy.json / dialect entries. Returns
 *  [{ id, start, end, text, entry }] sorted by start. `ctx`: dialect, clitics. */
function matchEntries(entries, text, ctx) {
  ctx = ctx || {};
  if (!Array.isArray(entries) || !entries.length || !nonEmpty(text)) return [];
  const f = foldMarks(text);
  const words = wordTokens(f.text);
  const clitics = ctx.clitics || LINT_CLITICS;
  const out = [];
  entries.forEach((entry) => {
    if (!isObj(entry) || !entryApplies(entry, ctx.dialect)) return;
    const kind = entry.match || (entry.pattern ? "regex" : "word");
    if (kind === "regex") {
      if (!nonEmpty(entry.pattern)) return;
      let re;
      try {
        re = new RegExp(entry.pattern, "g" + (/i/.test(entry.flags || "") ? "i" : "") + "u");
      } catch (e) {
        return;
      }
      let m;
      while ((m = re.exec(f.text))) {
        if (m[0] === "") {
          re.lastIndex++;
          continue;
        }
        let a = m.index;
        let b = m.index + m[0].length;
        while (a < b && !/[\u0621-\u064AA-Za-z0-9\u066E-\u06D3]/.test(f.text.charAt(a))) a++;
        while (b > a && !/[\u0621-\u064AA-Za-z0-9\u066E-\u06D3]/.test(f.text.charAt(b - 1))) b--;
        if (a >= b) continue;
        const r = foldedRange(f, a, b);
        out.push({ id: entry.id, start: r[0], end: r[1], text: text.slice(r[0], r[1]), entry });
      }
      return;
    }
    const ew = foldMarks(String(entry.text || "")).text.trim().split(WS_SPLIT).filter(Boolean);
    if (!ew.length) return;
    for (let i = 0; i + ew.length <= words.length; i++) {
      let ok = true;
      for (let j = 0; j < ew.length && ok; j++) {
        const w = words[i + j];
        if (j > 0) {
          const gap = f.text.slice(words[i + j - 1].end, w.start);
          if (gap === "" || gap.split(WS_SPLIT).join("") !== "") ok = false;
        }
        if (ok && !wordEq(w.text, ew[j], j === 0 && entry.clitics === true, clitics)) ok = false;
      }
      if (ok) {
        const r = foldedRange(f, words[i].start, words[i + ew.length - 1].end);
        out.push({ id: entry.id, start: r[0], end: r[1], text: text.slice(r[0], r[1]), entry });
      }
    }
  });
  return out.sort((a, b) => a.start - b.start || b.end - a.end);
}

/** Entries of a copy.json list (empty when the list or copy.json is missing). */
function listEntries(bundleObj, name) {
  const c = bundleObj && bundleObj.copy;
  const l = c && c.lists && c.lists[name];
  return l && Array.isArray(l.entries) ? l.entries : [];
}

/* ----------------------------------------------------------------- digits */

/** Text with URLs, e-mails, @handles, #tags, phone numbers and every token that
 *  carries a Latin letter (GPT4, 4K) blanked out, same length as the input. */
function maskLtr(text) {
  const toks = TX().tokenize(text);
  if (!toks.length) return text;
  const off = cpOffsets(text);
  const chars = text.split("");
  toks.forEach((t) => {
    const hide =
      LTR_SKIP_KINDS[t.kind] ||
      (t.kind === "number" && /[A-Za-z]/.test(t.text)) ||
      (t.kind === "latin" && /[0-9]/.test(t.text));
    if (!hide) return;
    for (let i = off[t.start]; i < off[t.end]; i++) chars[i] = " ";
  });
  return chars.join("");
}

function digitSystems(text) {
  const masked = maskLtr(text);
  return {
    masked,
    western: /[0-9]/.test(masked),
    arabicIndic: /[\u0660-\u0669]/.test(masked),
    persian: /[\u06F0-\u06F9]/.test(masked)
  };
}

function mapDigitChar(ch, to) {
  const c = ch.charCodeAt(0);
  let n;
  if (c >= 0x30 && c <= 0x39) n = c - 0x30;
  else if (c >= 0x0660 && c <= 0x0669) n = c - 0x0660;
  else if (c >= 0x06f0 && c <= 0x06f9) n = c - 0x06f0;
  else return ch;
  return to === "arabic-indic" ? DIGIT_AI.charAt(n) : String(n);
}

const mapDigits = (s, to) => s.replace(/[0-9\u0660-\u0669\u06F0-\u06F9]/g, (ch) => mapDigitChar(ch, to));

/* ------------------------------------------------------- built-in checks */

const BUILTIN = {};

function scanRegex(text, re, make) {
  const out = [];
  let m;
  re.lastIndex = 0;
  while ((m = re.exec(text))) {
    if (m[0] === "") {
      re.lastIndex++;
      continue;
    }
    const r = make(m);
    if (r) out.push(Object.assign({ start: m.index, end: m.index + m[0].length, original: m[0] }, r));
  }
  return out;
}

BUILTIN["persian-digits"] = (text, ctx) =>
  scanRegex(maskLtr(text), /[\u06F0-\u06F9]+/g, (m) => ({ fix: mapDigits(m[0], ctx.digits || "western") }));

BUILTIN["mixed-digits"] = (text, ctx) => {
  const info = digitSystems(text);
  const used = (info.western ? 1 : 0) + (info.arabicIndic ? 1 : 0) + (info.persian ? 1 : 0);
  if (used < 2) return [];
  const expected = ctx.digits || (info.western ? "western" : "arabic-indic");
  return scanRegex(info.masked, /[0-9]+|[\u0660-\u0669]+|[\u06F0-\u06F9]+/g, (m) => {
    const isW = /[0-9]/.test(m[0].charAt(0));
    const isA = /[\u0660-\u0669]/.test(m[0].charAt(0));
    if ((expected === "western" && isW) || (expected === "arabic-indic" && isA)) return null;
    return { fix: mapDigits(m[0], expected) };
  });
};

BUILTIN["percent-sign"] = (text, ctx) => {
  /* Two ways a percent sign can be wrong (CONTRACT 7.2 N1.percent): it does not belong to the digits beside it (% next to
   * Arabic-Indic digits, ٪ next to Western ones), or it is not the sign of the post's digit system. The second wins when both apply. */
  const expected = ctx.digits || "western";
  const AI = "[\u0660-\u0669\u06F0-\u06F9]";
  const masked = maskLtr(text);
  const found = new Map();
  const collect = (digits, bad, good) => {
    const re = new RegExp(digits + "[ \u00A0]?" + bad + "|" + bad + "[ \u00A0]?" + digits, "g");
    scanRegex(masked, re, (m) => {
      const i = m[0].indexOf(bad);
      found.set(m.index + i, { start: m.index + i, end: m.index + i + 1, original: bad, fix: good });
      return null;
    });
  };
  collect(AI, "%", "٪");
  collect("[0-9]", "٪", "%");
  collect("[0-9\u0660-\u0669\u06F0-\u06F9]", expected === "arabic-indic" ? "%" : "٪", expected === "arabic-indic" ? "٪" : "%");
  return Array.from(found.values()).sort((a, b) => a.start - b.start);
};

BUILTIN["persian-letters"] = (text) =>
  scanRegex(text, /[\u06CC\u06A9\u06BE]/g, (m) => ({ fix: { "ی": "ي", "ک": "ك", "ھ": "ه" }[m[0]] }));

BUILTIN["space-before-punct"] = (text) => {
  const re = new RegExp("([" + AR_L + AR_MARKS + "\\u0640])([ \\t\\u00A0]+)([\\u060C\\u061B\\u061F:!.,;?])", "g");
  return scanRegex(text, re, (m) => ({
    start: m.index + m[1].length,
    end: m.index + m[1].length + m[2].length,
    original: m[2],
    fix: ""
  }));
};

BUILTIN["missing-space-after-punct"] = (text) => {
  const re = new RegExp("[\\u060C\\u061B\\u061F](?=[" + AR_L + "A-Za-z0-9\\u0660-\\u0669])", "g");
  return scanRegex(text, re, (m) => ({ fix: m[0] + " " }));
};

BUILTIN["latin-punct-in-arabic"] = (text) => {
  const re = new RegExp("([" + AR_L + AR_MARKS + "])([,;?])(?=[ \\t\\n\\u00A0]|$|[" + AR_L + "])", "g");
  return scanRegex(text, re, (m) => ({
    start: m.index + m[1].length,
    end: m.index + m[0].length,
    original: m[2],
    fix: { ",": "،", ";": "؛", "?": "؟" }[m[2]]
  }));
};

BUILTIN["digit-glued-to-word"] = (text) => {
  const m = maskLtr(text);
  const re = new RegExp("[" + AR_L + "]");
  const isL = { test: (c) => c !== "\u0640" && re.test(c) };
  const out = [];
  for (let i = 1; i < m.length; i++) {
    const a = m.charAt(i - 1);
    const b = m.charAt(i);
    if (isL.test(a) && /[0-9]/.test(b)) {
      const before = i >= 2 ? m.charAt(i - 2) : "";
      if ("\u0628\u0644\u0643".includes(a) && (before === "\u0648" || before === "\u0641") && !(i >= 3 && isL.test(m.charAt(i - 3)))) {
        // a conjunction and a preposition standing together in front of a number («وب3»): the connector keeps both letters attached
        out.push({ start: i - 1, end: i + 1, original: a + b, fix: a + "\u0640" + b });
        continue;
      }
      if ("\u0648\u0641\u0628\u0644\u0643".includes(a) && !(before && isL.test(before))) {
        // a one-letter proclitic standing on its own in front of a number: «و12 تفاعل» is ordinary Arabic and stays;
        // ب ل ك take the connector («بـ5 دقايق»), never a space that would strand the letter
        if (a !== "\u0648" && a !== "\u0641") out.push({ start: i - 1, end: i + 1, original: a + b, fix: a + "\u0640" + b });
        continue;
      }
      out.push({ start: i - 1, end: i + 1, original: a + b, fix: a + " " + b });
    } else if (/[0-9]/.test(a) && isL.test(b)) {
      out.push({ start: i - 1, end: i + 1, original: a + b, fix: a + " " + b });
    }
  }
  return out;
};

BUILTIN["double-space"] = (text) => scanRegex(text, /[ \t]{2,}/g, () => ({ fix: " " }));

BUILTIN["programmatic-tatweel"] = (text, ctx) => {
  const kw = ctx.kashidaWord ? foldMarks(ctx.kashidaWord).text : "";
  const isL = new RegExp("[" + AR_L + "]");
  return scanRegex(text, /\u0640+/g, (m) => {
    const prev = text.charAt(m.index - 1);
    const next = text.charAt(m.index + m[0].length);
    if (isL.test(prev) && /[A-Za-z0-9$\u20AC\u00A3]/.test(next)) return null;
    let a = m.index;
    let b = m.index + m[0].length;
    const inWord = (c) => isL.test(c) || c === "\u0640" || isMarkCode(c.charCodeAt(0));
    while (a > 0 && inWord(text.charAt(a - 1))) a--;
    while (b < text.length && inWord(text.charAt(b))) b++;
    if (kw && foldMarks(text.slice(a, b)).text === kw) return null;
    return { fix: "" };
  });
};

BUILTIN["ellipsis-dots"] = (text) =>
  scanRegex(maskLtr(text), /\.{3,}|\.(?: \.){2,}/g, () => ({ fix: "…" }));

BUILTIN["repeated-punct"] = (text) => scanRegex(text, /([\u061F!\u060C\u061B])\1+/g, (m) => ({ fix: m[1] }));

BUILTIN["lam-latin-stranded"] = (text) => {
  const re = new RegExp(
    "(^|[^" + AR_L + "])([وف]?(?:بال|كال|ال|لل|[بلك]))\\u0640([ \\t\\u00A0]+)(?=[A-Za-z0-9$\\u20AC\\u00A3])",
    "g"
  );
  return scanRegex(text, re, (m) => {
    const keep = m[1].length + m[2].length + 1;
    return { start: m.index + keep, end: m.index + m[0].length, original: m[3], fix: "" };
  });
};

BUILTIN["number-noun-unbound"] = (text, ctx) => {
  const toks = TX().tokenize(text);
  const off = cpOffsets(text);
  const labels = ctx.bindLabels || labelMatcher(LINT_BIND_LABELS, ctx.clitics);
  const out = [];
  for (let i = 0; i + 2 < toks.length; i++) {
    const a = toks[i];
    const s = toks[i + 1];
    const b = toks[i + 2];
    if (s.kind !== "space" || s.text !== " ") continue;
    const numNoun = a.kind === "number" && b.kind === "ar";
    const labelNum = a.kind === "ar" && labels.has(a.text) && b.kind === "number";
    if (numNoun || labelNum) out.push({ start: off[s.start], end: off[s.end], original: " ", fix: "\u00A0" });
  }
  return out;
};

BUILTIN["emoji-edge"] = (text) => {
  const out = [];
  let base = 0;
  text.split("\n").forEach((line) => {
    if (hasArabic(line)) {
      const toks = TX().tokenize(line).filter((t) => t.kind !== "space");
      const off = cpOffsets(line);
      [toks[0], toks[toks.length - 1]].forEach((t, k) => {
        if (t && t.kind === "emoji" && !(k === 1 && toks.length === 1)) {
          out.push({ start: base + off[t.start], end: base + off[t.end], original: t.text, fix: undefined });
        }
      });
    }
    base += line.length + 1;
  });
  return out;
};

/* ---------------------------------------------------------------- lintText */

function foldKey(s) {
  return foldMarks(String(s)).text;
}

/** Matcher for the bindLabels words (الخطوة، رقم، نصيحة …): a token matches a
 *  label with or without one proclitic in front. */
function labelMatcher(texts, clitics) {
  const set = new Set(texts.map(foldKey));
  const cl = clitics || LINT_CLITICS;
  return {
    has(token) {
      const t = foldKey(token);
      if (set.has(t)) return true;
      for (let i = 0; i < cl.length; i++) if (t.indexOf(cl[i]) === 0 && set.has(t.slice(cl[i].length))) return true;
      return false;
    }
  };
}

function bindLabelMatcher(bundleObj, clitics) {
  const texts = listEntries(bundleObj, "bindLabels").map((e) => e.text).filter(nonEmpty);
  return labelMatcher(texts.length ? texts : LINT_BIND_LABELS, clitics);
}

function allowSet(list) {
  const set = new Set();
  (list || []).forEach((w) => {
    if (nonEmpty(w)) set.add(foldKey(w).toLowerCase());
  });
  return set;
}

/** Lint one text with ortho.json rules, built-in checks and the dialect's
 *  deny / warn markers. Mirrors _cs.lint.lint_text.
 *  opts: dialect, digits, allow[], kashidaWord, bundle, ortho, dialectData,
 *        skip (Set of check names or rule ids to leave out).
 *  Returns [{ rule, sev, confidence, start, end, original, fix, autofix, msg,
 *  kind }] sorted by start. */
function lintText(text, opts) {
  opts = opts || {};
  if (!nonEmpty(text)) return [];
  const b = opts.bundle || (CS.core && CS.core.registry && CS.core.registry.rules ? CS.core.registry.rules() : {}) || {};
  const ortho = opts.ortho !== undefined ? opts.ortho : b.ortho;
  const dd = opts.dialectData !== undefined ? opts.dialectData : b.dialects && b.dialects[opts.dialect];
  const allow = opts.allowSet || allowSet(opts.allow);
  const skip = opts.skip || new Set();
  const clitics = ortho && Array.isArray(ortho.clitics) ? ortho.clitics : LINT_CLITICS;
  const bindLabels = bindLabelMatcher(b, clitics);
  const ctx = { digits: opts.digits || "western", kashidaWord: opts.kashidaWord || "", dialect: opts.dialect, clitics, bindLabels };
  const issues = [];

  const push = (rule, it) => {
    issues.push({
      rule: rule.id,
      sev: rule.sev || "FIX",
      confidence: typeof rule.confidence === "number" ? rule.confidence : 1,
      start: it.start,
      end: it.end,
      original: it.original,
      fix: it.fix,
      autofix: rule.autofix === true && it.fix !== undefined,
      msg: rule.msg,
      kind: rule.kind
    });
  };

  if (ortho && Array.isArray(ortho.rules)) {
    ortho.rules.forEach((rule) => {
      if (!isObj(rule) || skip.has(rule.id)) return;
      if (Array.isArray(rule.dialects) && rule.dialects.indexOf("*") < 0 && opts.dialect && rule.dialects.indexOf(opts.dialect) < 0) return;
      if (rule.kind === "word-map" && isObj(rule.map)) {
        Object.keys(rule.map).forEach((key) => {
          matchEntries([{ id: rule.id, text: key, match: "word", clitics: rule.clitics === true }], text, ctx).forEach((m) => {
            const tok = foldKey(m.text);
            const k = foldKey(key);
            const prefix = tok.length >= k.length && tok.slice(tok.length - k.length) === k ? tok.slice(0, tok.length - k.length) : "";
            push(rule, { start: m.start, end: m.end, original: m.text, fix: prefix + rule.map[key] });
          });
        });
      } else if (rule.kind === "char" && isObj(rule.map)) {
        for (let i = 0; i < text.length; i++) {
          const to = rule.map[text.charAt(i)];
          if (to !== undefined) push(rule, { start: i, end: i + 1, original: text.charAt(i), fix: to });
        }
      } else if (rule.kind === "regex" && nonEmpty(rule.pattern)) {
        let re;
        try {
          re = new RegExp(rule.pattern, "gu");
        } catch (e) {
          return;
        }
        const repl = String(rule.replace === undefined ? "" : rule.replace).replace(/\\([1-9])/g, "$$$1");
        scanRegex(text, re, (m) => ({ fix: rule.replace === undefined ? undefined : m[0].replace(new RegExp(rule.pattern, "u"), repl) })).forEach((it) => push(rule, it));
      } else if (rule.kind === "check" && BUILTIN[rule.check] && !skip.has(rule.check)) {
        BUILTIN[rule.check](text, ctx).forEach((it) => push(rule, it));
      }
    });
  }

  if (dd) {
    [
      ["deny", "deny-marker", "BLOCK"],
      ["warn", "warn-marker", "FIX"]
    ].forEach((spec) => {
      matchEntries(dd[spec[0]], text, ctx).forEach((m) => {
        issues.push({
          rule: spec[1],
          sev: QA.SEV_RANK[m.entry.sev] !== undefined ? m.entry.sev : spec[2],
          confidence: 1,
          start: m.start,
          end: m.end,
          original: m.text,
          fix: m.entry.suggest,
          autofix: false,
          msg: m.entry.note,
          kind: "dialect",
          entry: m.entry.id
        });
      });
    });
  }

  return issues
    .filter((it) => !allow.has(foldKey(it.original).toLowerCase().trim()))
    .sort((a, b) => a.start - b.start || a.end - b.end);
}

/** Apply the autofix issues of `issues` to `text` (right to left, no overlaps). */
function applyFixes(text, issues) {
  const todo = issues
    .filter((it) => it.autofix && it.fix !== undefined)
    .sort((a, b) => b.start - a.start || b.end - a.end);
  let out = text;
  let limit = Infinity;
  todo.forEach((it) => {
    if (it.end > limit) return;
    out = out.slice(0, it.start) + it.fix + out.slice(it.end);
    limit = it.start;
  });
  return out;
}
