/*! Carousel Studio runtime chunk cs-qa.js · cs-1.2.0 · Apache-2.0 */
(function () {
  "use strict";
  var CS = (window.CS = window.CS || {});
  /* ---- file: core.js ---- */
/* Carousel Studio · cs-qa · core
 *
 * Shared plumbing for every gate: access to the rule registry (qa-rules.json
 * through CS.core.registry), the finding factory, text-field enumeration and
 * a few small string helpers. Nothing here is public; CS.qa is assembled in
 * api.js. All files of this chunk share one IIFE scope, so every top-level
 * name below is unique across the chunk.
 */

const QA = {
  ENGINE: "cs-1.2.0",
  SEV_RANK: { BLOCK: 0, FIX: 1, NOTE: 2 },
  CHECKPOINTS: ["angle", "script", "design", "ready", "exported"],
  /* Where the Studio records the user's «تأكدت» tap for an AI asset (gate A1):
   * spec.ext.assetChecks[assetId] = { textChecked: true, at }. The spec schema
   * has no field for it, and `ext` is the schema's reserved extension space. */
  ASSET_CHECKS_KEY: "assetChecks",
  cache: null,
  gates: { text: [], rendered: [] }
};

/* ------------------------------------------------------------------ errors */

function qaError(code, message, detail) {
  const E = CS.CSError;
  if (typeof E === "function") return new E(code, message, detail);
  const e = new Error(message || code);
  e.code = code;
  e.detail = detail;
  return e;
}

/* ------------------------------------------------------------ text helpers */

function TX() {
  const t = CS.core && CS.core.text;
  if (!t) throw qaError("E_USAGE", "CS.core.text is not available; load cs-core before cs-qa");
  return t;
}

const wc = (s) => TX().wordCount(s || "");
const cc = (s) => TX().charCount(s || "");
const strip = (s) => TX().stripMarkup(s || "");
/** Text as the spelling and bidi checks see it: a caption keeps its line breaks (a blank line is not a double space). */
const lintPlain = (f) => (String(f.key).indexOf("caption.") === 0 ? String(f.text) : strip(f.text));

/** Replace {name} placeholders; unknown placeholders stay as written. */
function fmt(template, params) {
  return String(template).replace(/\{([A-Za-z0-9_]+)\}/g, (m, k) =>
    params && params[k] !== undefined && params[k] !== null ? String(params[k]) : m
  );
}

/** At most `n` code points of `s`, single-line, with an ellipsis when cut. */
function snippet(s, n) {
  const t = String(s == null ? "" : s).replace(/\s+/g, " ").trim();
  const cps = Array.from(t);
  return cps.length > n ? cps.slice(0, n - 1).join("") + "…" : t;
}

/** Code-unit offset of every code point (plus the end offset). */
function cpOffsets(s) {
  const out = [];
  for (let i = 0; i < s.length; ) {
    out.push(i);
    const c = s.codePointAt(i);
    i += c > 0xffff ? 2 : 1;
  }
  out.push(s.length);
  return out;
}

const ARABIC_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
const hasArabic = (s) => ARABIC_RE.test(s || "");
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const deepClone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
const nonEmpty = (s) => typeof s === "string" && s.trim() !== "";

const DIGIT_AI = "٠١٢٣٤٥٦٧٨٩";

/** Arabic-Indic and Persian digits to Western, nothing else touched. */
function toWesternDigits(s) {
  return String(s).replace(/[\u0660-\u0669\u06F0-\u06F9]/g, (ch) => {
    const c = ch.charCodeAt(0);
    return String(c >= 0x06f0 ? c - 0x06f0 : c - 0x0660);
  });
}

/** Canonical numeric string: Western digits, '.' decimal, no group separators. */
function normNumber(raw) {
  let s = toWesternDigits(raw).replace(/٫/g, ".");
  s = s.replace(/[\u066C,\u00A0\u202F ](?=[0-9]{3}(?:[^0-9]|$))/g, "");
  s = s.replace(/[^0-9.]/g, "");
  s = s.replace(/^0+(?=[0-9])/, "");
  if (s.indexOf(".") >= 0) s = s.replace(/0+$/, "").replace(/\.$/, "");
  return s;
}

const ckptIndex = (cp) => Math.max(0, QA.CHECKPOINTS.indexOf(cp));

/* ------------------------------------------------------------ rule registry */

function bundle() {
  const reg = CS.core && CS.core.registry;
  if (!reg || typeof reg.rules !== "function") {
    throw qaError("E_USAGE", "CS.core.registry.rules() is not available; load cs-core before cs-qa");
  }
  const b = reg.rules();
  if (!b || !b.qaRules) {
    throw qaError("E_USAGE", "qa-rules.json is not registered (CS.core.registry.registerRules)");
  }
  return b;
}

/** Deep copy of `node` in which every {"$platform": "dot.path"} is replaced by
 *  the value found in platform-instagram.json. An unknown path is a load error. */
function resolveRefs(node, platform) {
  if (Array.isArray(node)) return node.map((n) => resolveRefs(n, platform));
  if (!isObj(node)) return node;
  const keys = Object.keys(node);
  if (keys.length === 1 && keys[0] === "$platform") {
    let cur = platform;
    String(node.$platform)
      .split(".")
      .forEach((part) => {
        cur = cur === undefined || cur === null ? undefined : cur[part];
      });
    if (cur === undefined) throw qaError("E_SCHEMA", "qa-rules.json: unknown $platform path " + node.$platform);
    return deepClone(cur);
  }
  const out = {};
  keys.forEach((k) => {
    out[k] = resolveRefs(node[k], platform);
  });
  return out;
}

/** Loaded and indexed rules, cached per registered bundle. */
function loadRules() {
  const b = bundle();
  const c = QA.cache;
  if (c && c.source === b.qaRules && c.platform === b.platform) return c;
  const doc = resolveRefs(b.qaRules, b.platform || {});
  const gates = {};
  const checks = {};
  const order = Array.isArray(doc.order) ? doc.order.slice() : (doc.gates || []).map((g) => g.id);
  (doc.gates || []).forEach((g) => {
    gates[g.id] = g;
    (g.checks || []).forEach((k) => {
      checks[k.id] = { def: k, gate: g };
    });
  });
  QA.cache = { source: b.qaRules, platform: b.platform, doc, gates, checks, order, bundle: b };
  return QA.cache;
}

const checkEngines = (e) => e.def.engines || e.gate.engines || ["py", "js"];
const checkApplies = (e) => e.def.appliesTo || e.gate.appliesTo || {};

function isOverridableRule(R, ruleId) {
  const e = R.checks[ruleId];
  if (e) return e.def.overridable !== undefined ? e.def.overridable === true : e.gate.overridable === true;
  const g = R.gates[String(ruleId).split(".")[0]];
  return !!(g && g.dynamicRules === true && g.overridable === true);
}

/* ------------------------------------------------------------------ context */

function normHistory(input, spec, brand) {
  let h = input && input.history;
  if (!h && brand && brand.hooks) h = brand.hooks.history;
  if (h && !Array.isArray(h)) h = h.posts || h.history || [];
  if (!Array.isArray(h)) return [];
  return h.filter((e) => isObj(e) && e.postId !== spec.id);
}

/** Everything a text gate needs, computed once per run. */
function buildContext(input, opts) {
  opts = opts || {};
  const spec = input && input.spec;
  if (!isObj(spec)) throw qaError("E_USAGE", "QA needs a spec object");
  const R = loadRules();
  const loc = spec.locale || {};
  const slides = Array.isArray(spec.slides) ? spec.slides.filter(isObj) : [];
  const pos = {};
  slides.forEach((s, i) => {
    pos[s.id] = i;
  });
  const brand = input.brand || null;
  const executed = {};
  Object.values(R.gates).forEach(g=>{
    executed[g.id]=0;
    (g.checks||[]).forEach(k=>{
      if (/^(spec|rendered)$/.test(k.scope)||/^(D9|D10|D11|VA\d+)$/.test(g.id)) executed[k.id]=0;
    });
  });
  QA.gates.text.concat(QA.gates.rendered).forEach(g=>{executed[g.id]=0;});
  return {
    spec,
    brand,
    R,
    bundle: R.bundle,
    slides,
    pos,
    format: spec.format || "carousel",
    mode: spec.mode || "guided",
    fast: opts.fast === true || spec.mode === "fast",
    dialect: loc.dialect || "msa-white",
    digits: loc.digits || "western",
    checkpoint: input.checkpoint || spec.checkpoint || "script",
    history: normHistory(input, spec, brand),
    familyLimits: input.familyLimits || null,
    gates: opts.gates ? new Set(opts.gates) : null,
    slideFilter: opts.slides ? new Set(opts.slides) : null,
    stats: { gates: executed }
  };
}

const wantGate = (ctx, id) => !ctx.gates || ctx.gates.has(id);

/** Does JS run this check for this post (and slide)? */
function active(ctx, id, slide) {
  const e = ctx.R.checks[id];
  if (!e || checkEngines(e).indexOf("js") < 0) return false;
  const a = checkApplies(e);
  if (a.formats && a.formats.indexOf(ctx.format) < 0) return false;
  if (a.dialects && a.dialects.indexOf(ctx.dialect) < 0) return false;
  if (a.modes && a.modes.indexOf(ctx.fast ? "fast" : "guided") < 0) return false;
  if (slide) {
    if (a.slideTypes && a.slideTypes.indexOf(slide.type) < 0) return false;
    if (a.slidePositions && a.slidePositions.indexOf(ctx.pos[slide.id] + 1) < 0) return false;
  }
  return true;
}

const param = (ctx, id) => (ctx.R.checks[id] && ctx.R.checks[id].def.params) || {};

/** Build one finding from a check's templates. `o`: slide, el, vars, sev,
 *  rule (dynamic rule id), msg / fix (override templates). */
function makeFinding(R, id, o) {
  o = o || {};
  const e = R.checks[id];
  if (!e) throw qaError("E_USAGE", "unknown check " + id);
  const v = {};
  Object.keys(o.vars || {}).forEach((k) => {
    v[k] = o.vars[k];
  });
  if (v.text !== undefined) v.text = snippet(v.text, 40);
  const sev = o.sev && QA.SEV_RANK[o.sev] !== undefined ? o.sev : e.def.sev;
  const f = { gate: e.gate.id, rule: o.rule || id, sev };
  if (o.slide) f.slide = o.slide;
  if (o.el) f.el = o.el;
  const mt = o.msg || e.def.msg;
  f.msg = { ar: fmt(mt.ar, v), en: fmt(mt.en, v) };
  const ft = o.fix || e.def.fix;
  if (ft) f.fix = { ar: fmt(ft.ar, v), en: fmt(ft.en, v) };
  f.autofixed = false;
  return f;
}

const emit = (ctx, out, id, o) => {
  out.push(makeFinding(ctx.R, id, o));
};

/* --------------------------------------------------------- text-field model */

/** Free-text fields of one slide in reading order, each with a stable element
 *  key (s03.title, s03.bullets.2, s06.sides.1, s06.sides.1.label …). */
function slideFields(slide) {
  const id = slide.id || "s00";
  const out = [];
  const add = (field, text, index, key) => {
    if (!nonEmpty(text)) return;
    out.push({
      key: key || (index === undefined ? id + "." + field : id + "." + field + "." + index),
      slide: id,
      field,
      index: index === undefined ? null : index,
      text
    });
  };
  add("kicker", slide.kicker);
  add("headline", slide.headline);
  add("title", slide.title);
  if (isObj(slide.number) && nonEmpty(slide.number.unit)) add("number", slide.number.unit, undefined, id + ".number");
  add("sub", slide.sub);
  add("body", slide.body);
  (slide.bullets || []).forEach((b, i) => add("bullets", b, i));
  (slide.sides || []).forEach((s, i) => {
    if (!isObj(s)) return;
    add("sides", s.text, i);
    add("sides.label", s.label, i, id + ".sides." + i + ".label");
  });
  add("attribution", slide.attribution);
  add("bridge", slide.bridge);
  if (CS.visual?.free?.active(slide)) add("ord", String(slide.ord ?? ""));
  if (isObj(slide.cta)) add("cta", slide.cta.text);
  (TX().visualFields ? TX().visualFields(slide) : []).forEach(([key, text]) => add(key, text));
  return out;
}

/** Caption-pack text fields. `withAlt` adds the alt texts. */
function captionFields(spec, withAlt) {
  const p = spec.captionPack;
  if (!isObj(p)) return [];
  const slides = Array.isArray(spec.slides) ? spec.slides : [];
  const out = [];
  const add = (key, field, text, slideIdx) => {
    if (!nonEmpty(text)) return;
    out.push({ key, field, text, slide: slideIdx !== undefined && slides[slideIdx] ? slides[slideIdx].id : null });
  };
  add("caption.firstLine", "firstLine", p.firstLine);
  add("caption.keywordLine", "keywordLine", p.keywordLine);
  add("caption.body", "body", p.body);
  add("caption.cta", "cta", p.cta);
  (p.perSlide || []).forEach((t, i) => add("caption.perSlide." + i, "perSlide", t, i));
  if (withAlt) (p.alt || []).forEach((t, i) => add("caption.alt." + i, "alt", t, i));
  return out;
}

/** The number block as the text a viewer sees: "5 ساعات". */
function numberText(slide) {
  if (!isObj(slide.number) || !nonEmpty(slide.number.value)) return "";
  return slide.number.value + (nonEmpty(slide.number.unit) ? " " + slide.number.unit : "");
}

/** Visible slide copy, one string per field. `withBridge` / `withCta` add the
 *  bridge line and the CTA pill text. Order is fixed (see qa-gates.md). */
function slideStrings(slide, withBridge, withCta) {
  const out = [];
  const push = (s) => {
    if (nonEmpty(s)) out.push(strip(s));
  };
  push(slide.kicker);
  push(slide.headline);
  push(slide.title);
  push(numberText(slide));
  push(slide.sub);
  push(slide.body);
  (slide.bullets || []).forEach(push);
  (slide.sides || []).forEach((s) => {
    if (isObj(s)) {
      push(s.label);
      push(s.text);
    }
  });
  push(slide.attribution);
  (TX().visualFields ? TX().visualFields(slide) : []).forEach((f) => push(f[1]));
  if (withBridge) push(slide.bridge);
  if (withCta && isObj(slide.cta)) push(slide.cta.text);
  return out;
}

const slideWords = (slide, withBridge, withCta) =>
  slideStrings(slide, withBridge, withCta).reduce((n, s) => n + wc(s), 0);

/** Caption exactly as assembled for posting (CONTRACT 4.3.2 assembleCaption). */
function assembleCaption(spec) {
  const p = spec.captionPack || {};
  const head = [p.firstLine, p.keywordLine].filter(nonEmpty).join("\n");
  const tags = Array.isArray(p.hashtags) ? p.hashtags.join(" ") : "";
  return [head, p.body, p.cta, tags].filter(nonEmpty).join("\n\n");
}

/** Cover text used for similarity: the hook's cover line, else the cover slide. */
function coverText(spec) {
  if (isObj(spec.hook) && nonEmpty(spec.hook.cover)) return strip(spec.hook.cover);
  const s = (spec.slides || []).find((x) => x && (x.type === "cover" || x.type === "poster"));
  return s ? strip(s.headline || "") : "";
}

/* -------------------------------------------------- field get / set by key */

/** Resolve an element key to { holder, prop } inside `spec`, or null. */
function locateKey(spec, key) {
  let v = /^(s[0-9]{2})\.(items(?:-text|-value)?\.[0-9]+|demo(?:\.[0-9]+|-caption)|anchor\.(?:word|unit|captions\.[0-9]+)|chart\.[0-9]+\.label|mock\.(?:title|caption|stamp|lines\.[0-9]+|items\.[0-9]+))$/.exec(key);
  if (v) {
    let path = v[2].replace(/^items(-text|-value)?\.([0-9]+)$/, (_, part, i) => "items." + i + "." + (part ? part.slice(1) : "title"))
      .replace(/^demo\.([0-9]+)$/, "demo.lines.$1.text").replace(/^demo-caption$/, "demo.caption")
      .replace(/^chart\./, "visual.anchor.chart.values.").replace(/^anchor\./, "visual.anchor.")
      .replace(/^mock\./, "visual.anchor.mock.").replace(/(mock\.lines\.[0-9]+)$/, "$1.text").split(".");
    const prop = path.pop();
    const holder = path.reduce((o, p) => o && o[p], (spec.slides || []).find((s) => s.id === v[1]));
    return holder && typeof holder[prop] === "string" ? { holder, prop } : null;
  }
  let m = /^(s[0-9]{2})\.(kicker|headline|sub|title|body|attribution|bridge)$/.exec(key);
  if (m) {
    const s = (spec.slides || []).find((x) => x.id === m[1]);
    return s ? { holder: s, prop: m[2] } : null;
  }
  m = /^(s[0-9]{2})\.bullets\.([0-9]+)$/.exec(key);
  if (m) {
    const s = (spec.slides || []).find((x) => x.id === m[1]);
    return s && Array.isArray(s.bullets) && s.bullets[+m[2]] !== undefined ? { holder: s.bullets, prop: +m[2] } : null;
  }
  m = /^(s[0-9]{2})\.sides\.([0-9]+)(\.label)?$/.exec(key);
  if (m) {
    const s = (spec.slides || []).find((x) => x.id === m[1]);
    const side = s && Array.isArray(s.sides) ? s.sides[+m[2]] : null;
    return side ? { holder: side, prop: m[3] ? "label" : "text" } : null;
  }
  m = /^(s[0-9]{2})\.cta$/.exec(key);
  if (m) {
    const s = (spec.slides || []).find((x) => x.id === m[1]);
    return s && isObj(s.cta) ? { holder: s.cta, prop: "text" } : null;
  }
  m = /^(s[0-9]{2})\.number$/.exec(key);
  if (m) {
    const s = (spec.slides || []).find((x) => x.id === m[1]);
    return s && isObj(s.number) ? { holder: s.number, prop: "unit" } : null;
  }
  m = /^caption\.(firstLine|keywordLine|body|cta)$/.exec(key);
  if (m) return isObj(spec.captionPack) ? { holder: spec.captionPack, prop: m[1] } : null;
  m = /^caption\.(perSlide|alt)\.([0-9]+)$/.exec(key);
  if (m) {
    const arr = isObj(spec.captionPack) ? spec.captionPack[m[1]] : null;
    return Array.isArray(arr) && arr[+m[2]] !== undefined ? { holder: arr, prop: +m[2] } : null;
  }
  return null;
}

/* ------------------------------------------------------------ result order */

/** Severity, gate order of qa-rules.json, slide position, element key, rule. */
function sortResults(R, spec, results) {
  const gateIdx = {};
  R.order.forEach((g, i) => {
    gateIdx[g] = i;
  });
  const pos = {};
  ((spec && spec.slides) || []).forEach((s, i) => {
    pos[s.id] = i;
  });
  const sp = (f) => (f.slide && pos[f.slide] !== undefined ? pos[f.slide] : f.slide ? 999 : -1);
  return results
    .map((r, i) => ({ r, i }))
    .sort((a, b) => {
      const A = a.r;
      const B = b.r;
      return (
        QA.SEV_RANK[A.sev] - QA.SEV_RANK[B.sev] ||
        (gateIdx[A.gate] === undefined ? 99 : gateIdx[A.gate]) - (gateIdx[B.gate] === undefined ? 99 : gateIdx[B.gate]) ||
        sp(A) - sp(B) ||
        (A.el || "").localeCompare(B.el || "", "en") ||
        (A.rule || "").localeCompare(B.rule || "", "en") ||
        a.i - b.i
      );
    })
    .map((x) => x.r);
}

const findingKey = (f) => [f.gate, f.rule, f.slide || "", f.el || ""].join("|");

/** Drop findings that repeat the same gate / rule / slide / element / message. */
function dedupeResults(results) {
  const seen = new Set();
  return results.filter((f) => {
    const k = findingKey(f) + "|" + f.msg.en;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Copy `overridden` marks from an earlier run (spec.qa.results) onto new findings. */
function carryOverrides(R, spec, results) {
  const prior = spec && spec.qa && Array.isArray(spec.qa.results) ? spec.qa.results : [];
  const marks = {};
  const len = {}; // one cover-length override covers its siblings on that slide
  const L = /^C1\.(hero-words|total-words|lines)$/;
  prior.forEach((p) => {
    if (isObj(p) && isObj(p.overridden)) {
      marks[findingKey(p)] = p.overridden;
      if (L.test(p.rule)) len[p.slide] = p.overridden;
    }
  });
  if (!Object.keys(marks).length) return results;
  return results.map((f) => {
    const m = marks[findingKey(f)] || (L.test(f.rule) && len[f.slide]);
    return m && isOverridableRule(R, f.rule) && !f.overridden ? Object.assign({}, f, { overridden: { reason: m.reason, at: m.at } }) : f;
  });
}

  /* ---- file: lint.js ---- */
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

const BUILTIN = {};

BUILTIN["invalid-codepoint"] = (text) => scanRegex(text, /[\p{Cc}]/gu, (m) => {
  if (/^[\t\n\r]$/.test(m[0])) return null;
  return { fix: "" };
});

BUILTIN["unassigned-codepoint"] = (text) => scanRegex(text, /[\p{Cn}\p{Cs}]/gu, () => ({}));

function specStrings(spec) {
  const out = [];
  function walk(v, path, slide) {
    if (typeof v === "string") { out.push({ text: v, key: path, slide }); return; }
    if (!v || typeof v !== "object") return;
    Object.keys(v).forEach((k) => {

      if (!path && (k === "qa" || k === "frozen")) return;
      const sid = path === "/slides" && v[k] ? v[k].id : slide;
      walk(v[k], path + "/" + k.replace(/~/g, "~0").replace(/\//g, "~1"), sid);
    });
  }
  walk(spec, "", undefined);
  return out;
}

function cliticPrefix(s) { return /^[وف]?(?:بال|كال|ال|لل|[بلك])$/.test(foldKey(s)); }
function connectorTatweels(text) {
  return text.replace(/(^|[^\p{L}\p{M}\u0640])([وفبلكال\u064B-\u065F\u0670]+)\u0640(?=["'«“]*[A-Za-zÀ-ɏ0-9\u0660-\u0669@#%\u066A$€£])/gu,
    (m, edge, prefix) => cliticPrefix(prefix) ? edge + prefix : m);
}

/* ------------------------------------------------------- built-in checks */
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
    const re = new RegExp(digits + "[ \u00A0\u2009\u202F]?" + bad + "|" + bad + "[ \u00A0\u2009\u202F]?" + digits, "g");
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
    if (m[0].length === 1) {
      const head = text.slice(0, m.index + 1).replace(/[\u064B-\u065F\u0670]/g, ""), tail = text.slice(m.index + 1);
      if (/(?:^|[^\p{L}\p{M}\u0640])[وف]?(?:بال|كال|ال|لل|[بلك])\u0640$/u.test(head) &&
          /^["'«“]*[A-Za-zÀ-ɏ0-9\u0660-\u0669@#%\u066A$\u20AC\u00A3]/.test(tail)) return null;
    }
    const prev = text.charAt(m.index - 1);
    const next = text.charAt(m.index + m[0].length);
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
    "(^|[^" + AR_L + "])([وفبلكال\\u064B-\\u065F\\u0670]+)\\u0640([ \\t\\u00A0\\u2009\\u202F]+)(?=[\"'«“]*[A-Za-zÀ-ɏ0-9\\u0660-\\u0669@#%٪$\\u20AC\\u00A3])",
    "g"
  );
  return scanRegex(text, re, (m) => {
    if (!cliticPrefix(m[2])) return null;
    const keep = m[1].length + m[2].length + 1;
    return { start: m.index + keep, end: m.index + m[0].length, original: m[3], fix: "" };
  });
};

BUILTIN["number-noun-unbound"] = () => []; // The renderer binds plain copy.

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
            if (Array.isArray(rule.exceptions) && rule.exceptions.some((s) => m.text.normalize("NFC") === s.normalize("NFC"))) return;
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

  const offsets = cpOffsets(text), ids = issues.length ? TX().tokenize(text).filter(t => ["url", "email", "handle", "tag", "phone"].includes(t.kind)) : [];
  return issues
    .filter((it) => /^ORTHO-ENC-00[4-8]$/.test(it.rule) || !ids.some(t => it.start < offsets[t.end] && it.end > offsets[t.start]) && !allow.has(foldKey(it.original).toLowerCase().trim()))
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

function gateInput(value) {
  if (typeof value === "string") return value.normalize("NFC").replace(/[\u00A0\u2009\u202F]/g, " ")
    .replace(/[\u00AD\u061C\u200B\u200E\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/g, "")
    .replace(/[\p{Cc}\p{Cn}\p{Cs}]/gu, ch => /[\t\n\r]/.test(ch) ? ch : "");
  if (Array.isArray(value)) return value.map(gateInput);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k,v]) => [k,gateInput(v)]));
  return value;
}
const rawContext = buildContext;
buildContext = function(input, opts) {
  const ctx = rawContext(input, opts), raw = ctx.spec;
  ctx.rawSpec = raw; ctx.spec = {...raw};
  ["captionPack", "hook"].forEach(k => { if (raw[k] !== undefined) ctx.spec[k] = gateInput(raw[k]); });
  ctx.slides = gateInput(ctx.slides); ctx.spec.slides = ctx.slides; return ctx;
};

  /* ---- file: gates-copy.js ---- */
/* Copy gates; thresholds and severities come from qa-rules.json. */

const CTA_KIND_NAMES = {
  save: { ar: "حفظ", en: "save" },
  send: { ar: "إرسال", en: "send" },
  question: { ar: "سؤال", en: "question" },
  "keyword-dm": { ar: "كلمة مفتاحية", en: "keyword" },
  follow: { ar: "متابعة", en: "follow" }
};
const INTENT_NAMES = {
  reach: { ar: "الوصول", en: "reach" },
  save: { ar: "الحفظ", en: "save" },
  send: { ar: "الإرسال", en: "send" },
  sell: { ar: "البيع", en: "sell" }
};
const kindName = (k, lang) => (CTA_KIND_NAMES[k] ? CTA_KIND_NAMES[k][lang] : k);
const intentName = (k, lang) => (INTENT_NAMES[k] ? INTENT_NAMES[k][lang] : k);

function emitOver(ctx, out, id, slide, el, count, extra) {
  if (!active(ctx, id, slide)) return false;
  const p = param(ctx, id);
  if (!(count > p.max)) return false;
  emit(ctx, out, id, { slide: slide && slide.id, el, vars: Object.assign({ count, max: p.max }, extra) });
  return true;
}

function proseFields(ctx) {
  const out = [];
  ctx.slides.forEach((s) => {
    slideFields(s).forEach((f) => {
      if (f.field !== "number" && f.field !== "sides.label") out.push(f);
    });
  });
  captionFields(ctx.spec, false).forEach((f) => {
    if (f.field !== "perSlide") out.push(f);
  });
  return out;
}

function lintFields(ctx) {
  const out = [];
  ctx.slides.forEach((s) => {
    slideFields(s).forEach((f) => {
      if (f.field !== "number") out.push(f);
    });
  });
  captionFields(ctx.spec, false).forEach((f) => out.push(f));
  return out;
}

const matchCtx = (ctx) => ({
  dialect: ctx.dialect,
  clitics: ctx.bundle.ortho && Array.isArray(ctx.bundle.ortho.clitics) ? ctx.bundle.ortho.clitics : undefined
});

/* ------------------------------------------------------------------- C1 */

function splitCover(cover) {
  const s = String(cover || "").normalize("NFC").replace(/\r/g, "").trim();
  const m = /…|\.{3}|[؟?!:](?=[ \t\n\f\v\u00A0\u202F]|$)|\n/.exec(s);
  if (!m) return { hero: s, sub: "" };
  const sub = s.slice(m.index + m[0].length).replace(/^[…. \t\n\f\v\u00A0\u202F]+/, "").trim();
  if (!sub || (s.slice(0, m.index).match(/==/g) || []).length % 2) return { hero: s, sub: "" };
  const hero = s.slice(0, m.index + (/[؟?!]/.test(m[0]) ? m[0].length : 0)).trim();
  return hero ? { hero, sub } : { hero: s, sub: "" };
}

function gateC1(ctx, out) {
  ctx.slides.forEach((s) => {
    if (s.type !== "cover" && s.type !== "poster") return;
    const el = s.id + ".headline";
    const hero = wc(splitCover(s.headline).hero);
    const total = wc(s.headline) + wc(s.kicker) + wc(s.sub);
    emitOver(ctx, out, "C1.hero-words", s, el, hero, { text: strip(s.headline || "") });
    emitOver(ctx, out, "C1.total-words", s, el, total, {});
    if (nonEmpty(s.headline)) {
      emitOver(ctx, out, "C1.lines", s, el, TX().parseMarkup(s.headline).breaks.length + 1, {});
    }
    if (active(ctx, "C1.number-words", s)) {
      const entries = listEntries(ctx.bundle, param(ctx, "C1.number-words").list);
      const text = [s.kicker, s.headline, s.sub].filter(nonEmpty).map(strip).join(" ");
      const m = matchEntries(entries, text, matchCtx(ctx))[0];
      if (m) emit(ctx, out, "C1.number-words", { slide: s.id, el, vars: { text: m.text } });
    }
  });
}

/* ------------------------------------------------------------------- C2 */

function gateC2(ctx, out) {
  ctx.slides.forEach((s) => {
    if (nonEmpty(s.title)) emitOver(ctx, out, "C2.title-words", s, s.id + ".title", wc(s.title), { text: strip(s.title) });

    const bodies = [];
    if (nonEmpty(s.body)) bodies.push({ el: s.id + ".body", text: s.body });
    (s.sides || []).forEach((side, i) => {
      if (isObj(side) && nonEmpty(side.text)) bodies.push({ el: s.id + ".sides." + i, text: side.text });
    });
    bodies.forEach((b) => {
      const n = wc(b.text);
      const extra = { text: strip(b.text) };
      if (active(ctx, "C2.body-hard", s) && n > param(ctx, "C2.body-hard").max) {
        emit(ctx, out, "C2.body-hard", { slide: s.id, el: b.el, vars: Object.assign({ count: n, max: param(ctx, "C2.body-hard").max }, extra) });
      } else if (active(ctx, "C2.body-words", s)) {
        const p = param(ctx, "C2.body-words");
        if (n > p.max && n <= p.hardMax) emit(ctx, out, "C2.body-words", { slide: s.id, el: b.el, vars: Object.assign({ count: n, max: p.max }, extra) });
      }
    });

    const bullets = Array.isArray(s.bullets) ? s.bullets : [];
    if (bullets.length) {
      const dense = param(ctx, "C2.bullets").denseTypes.indexOf(s.type) >= 0;
      emitOver(ctx, out, dense ? "C2.bullets-dense" : "C2.bullets", s, s.id + ".bullets", bullets.length, {});
      if (dense) {
        const n = wc(s.title) + bullets.reduce((a, b) => a + wc(b), 0) + wc(s.bridge);
        emitOver(ctx, out, "C2.dense-words", s, s.id + ".bullets", n, {});
      }
    }

    emitOver(ctx, out, "C2.slide-words", s, s.id, slideWords(s, true, true), {});
    if (nonEmpty(s.bridge)) emitOver(ctx, out, "C2.bridge-words", s, s.id + ".bridge", wc(s.bridge), { text: strip(s.bridge) });
    if (s.type === "cta") {
      emitOver(ctx, out, "C2.cta-words", s, s.id, wc(s.title) + wc(s.body) + wc(isObj(s.cta) ? s.cta.text : ""), {});
    }
    if (s.type === "share") emitOver(ctx, out, "C2.share-words", s, s.id, wc(s.headline) + wc(s.sub), {});
  });
}

/* ------------------------------------------------------------------- C3 */

function gateC3(ctx, out) {
  const s = ctx.slides[1];
  if (!s) return;
  emitOver(ctx, out, "C3.words", s, s.id, slideWords(s, false, false), {});
  if (active(ctx, "C3.intro", s)) {
    const entries = listEntries(ctx.bundle, param(ctx, "C3.intro").list);
    const m = matchEntries(entries, slideStrings(s, false, false).join("\n"), matchCtx(ctx))[0];
    if (m) emit(ctx, out, "C3.intro", { slide: s.id, el: s.id, vars: { text: m.text } });
  }
  if (active(ctx, "C3.type", s) && param(ctx, "C3.type").allowed.indexOf(s.type) < 0) {
    emit(ctx, out, "C3.type", { slide: s.id, el: s.id, vars: { type: s.type } });
  }
}

/* ------------------------------------------------------------------- C4 */

const ctaSlides = (ctx) => ctx.slides.filter((s) => isObj(s.cta));

function gateC4(ctx, out) {
  const withCta = ctaSlides(ctx);
  const kinds = Array.from(new Set(withCta.map((s) => s.cta.kind)));
  const n = ctx.slides.length;

  if (n > 0 && active(ctx, "C4.count") && !withCta.length) emit(ctx, out, "C4.count", {});
  if (active(ctx, "C4.multiple") && kinds.length > 1) emit(ctx, out, "C4.multiple", { vars: { count: kinds.length } });

  withCta.forEach((s) => {
    const idx = ctx.pos[s.id];
    if (active(ctx, "C4.position", s) && idx < n - 2) emit(ctx, out, "C4.position", { slide: s.id, el: s.id + ".cta" });
    if (active(ctx, "C4.early", s) && s.type !== "offer" && idx + 1 <= Math.floor(n / 2)) {
      emit(ctx, out, "C4.early", { slide: s.id, el: s.id + ".cta", vars: { n: idx + 1 } });
    }
    if (active(ctx, "C4.intent", s) && ctx.spec.intent) {
      const allowed = param(ctx, "C4.intent").allowedByIntent[ctx.spec.intent];
      if (Array.isArray(allowed) && allowed.indexOf(s.cta.kind) < 0) {
        emit(ctx, out, "C4.intent", {
          slide: s.id,
          el: s.id + ".cta",
          vars: {
            kindAr: kindName(s.cta.kind, "ar"),
            kindEn: kindName(s.cta.kind, "en"),
            intentAr: intentName(ctx.spec.intent, "ar"),
            intentEn: intentName(ctx.spec.intent, "en"),
            allowedAr: allowed.map((k) => kindName(k, "ar")).join("، "),
            allowedEn: allowed.map((k) => kindName(k, "en")).join(", ")
          }
        });
      }
    }
  });

  if (active(ctx, "C4.bait")) {
    const entries = listEntries(ctx.bundle, param(ctx, "C4.bait").list);
    const targets = withCta.map((s) => ({ slide: s.id, el: s.id + ".cta", text: s.cta.text }));
    if (isObj(ctx.spec.captionPack) && nonEmpty(ctx.spec.captionPack.cta)) {
      targets.push({ slide: null, el: "caption.cta", text: ctx.spec.captionPack.cta });
    }
    targets.forEach((t) => {
      const m = matchEntries(entries, strip(t.text), matchCtx(ctx))[0];
      if (m) emit(ctx, out, "C4.bait", { slide: t.slide || undefined, el: t.el, vars: { text: m.text } });
    });
  }

  if (active(ctx, "C4.keyword-asset")) {
    const kw = withCta.find((s) => s.cta.kind === "keyword-dm");
    const asset = ctx.spec.captionPack && ctx.spec.captionPack.asset;
    if (kw && !(isObj(asset) && asset.delivery === "instant")) {
      emit(ctx, out, "C4.keyword-asset", { slide: kw.id, el: kw.id + ".cta" });
    }
  }
}

/* ------------------------------------------------------------------- C5 */

function gateC5(ctx, out) {
  const n = ctx.slides.length;
  if (n === 0) return;
  if (active(ctx, "C5.slide-count")) {
    const p = param(ctx, "C5.slide-count");
    if (n < p.min || n > p.max) emit(ctx, out, "C5.slide-count", { vars: { count: n, min: p.min, max: p.max } });
  }
  if (active(ctx, "C5.slide-count-low")) {
    const p = param(ctx, "C5.slide-count-low");
    if (n >= p.hardMin && n < p.min) {
      emit(ctx, out, "C5.slide-count-low", { vars: { count: n, min: p.min, recMin: p.recMin, recMax: p.recMax } });
    }
  }
  if (active(ctx, "C5.slide-count-range")) {
    const p = param(ctx, "C5.slide-count-range");
    if (n >= p.warnBelow && n <= p.hardMax && (n < p.min || n > p.max)) {
      emit(ctx, out, "C5.slide-count-range", { vars: { count: n, min: p.min, max: p.max } });
    }
  }
  if (active(ctx, "C5.skeleton")) {
    const p = param(ctx, "C5.skeleton");
    if (p.first.indexOf(ctx.slides[0].type) < 0 || p.last.indexOf(ctx.slides[n - 1].type) < 0) {
      emit(ctx, out, "C5.skeleton", { slide: ctx.slides[0].id, el: ctx.slides[0].id });
    }
  }
  if (active(ctx, "C5.bridge")) {
    const types = param(ctx, "C5.bridge").types;
    ctx.slides.forEach((s, i) => {
      if (i < n - 1 && types.indexOf(s.type) >= 0 && !nonEmpty(s.bridge)) {
        emit(ctx, out, "C5.bridge", { slide: s.id, el: s.id + ".bridge" });
      }
    });
  }
}

/* ------------------------------------------------------------------- C6 */

function countedNumbers(text, min, max) {
  const toks = TX().tokenize(text);
  const found = [];
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t.kind !== "number" || /[%A-Za-z$\u20AC\u00A3\u066A]/.test(t.text)) continue;
    const v = parseInt(toWesternDigits(t.text), 10);
    if (!(v >= min && v <= max) || !/^[0-9\u0660-\u0669]+$/.test(t.text)) continue;
    let j = i + 1;
    if (toks[j] && toks[j].kind === "space") j++;
    if (toks[j] && (toks[j].kind === "ar" || toks[j].kind === "latin")) found.push(v);
  }
  return found;
}

const containsKey = (s) => foldKey(strip(s)).toLowerCase().replace(/\s+/g, " ").trim();

function gateC6(ctx, out) {
  const cover = ctx.slides.find((s) => s.type === "cover");
  if (!cover) return;
  const text = [cover.kicker, cover.headline, cover.sub].filter(nonEmpty).map(strip).join(" ");

  if (active(ctx, "C6.list-count")) {
    const p = param(ctx, "C6.list-count");
    if (p.architectures.indexOf(ctx.spec.architecture) >= 0) {
      const nums = countedNumbers(text, p.min, p.max);
      const numbered = new Set(ctx.slides.filter((s) => Number.isInteger(s.ord) && s.ord > 0).map((s) => s.ord));
      const items = numbered.size || ctx.slides.filter((s) => s.type === "item" || s.type === "step").length;
      if (nums.length && items > 0 && nums.indexOf(items) < 0) {
        emit(ctx, out, "C6.list-count", { slide: cover.id, el: cover.id + ".headline", vars: { count: nums[0], n: items } });
      }
    }
  }

  /* Slide 2 repeats the count or names the first member. */
  const s2 = ctx.slides[1];
  if (s2 && s2 !== cover && active(ctx, "C6.slide2-promise", s2)) {
    const q = param(ctx, "C6.slide2-promise");
    if (q.architectures.indexOf(ctx.spec.architecture) >= 0 && q.itemTypes.indexOf(s2.type) < 0) {
      const nums = countedNumbers(text, q.min, q.max);
      if (nums.length) {
        const body = slideStrings(s2, false, false).join("\n");
        const have = numbersIn(body);
        const first = ctx.slides.find((s, i) => i >= 2 && q.itemTypes.indexOf(s.type) >= 0);
        const title = first && nonEmpty(first.title) ? containsKey(first.title) : "";
        const counted = nums.some((n) => have.has(normNumber(String(n))));
        const named = title !== "" && containsKey(body).indexOf(title) >= 0;
        if (!counted && !named) emit(ctx, out, "C6.slide2-promise", { slide: s2.id, el: s2.id, vars: { count: nums[0] } });
      }
    }
  }
}

/* ------------------------------------------------------------------- D8 */

const layoutKey = (s) => CS.visual?.free?.active(s) ? "free|" + s.id : s.type + "|" + (nonEmpty(s.variant) ? s.variant : "");

function gateD8(ctx, out) {
  if (!active(ctx, "D8.rhythm")) return;
  const max = param(ctx, "D8.rhythm").max;
  let i = 0;
  while (i < ctx.slides.length) {
    let j = i;
    while (j + 1 < ctx.slides.length && layoutKey(ctx.slides[j + 1]) === layoutKey(ctx.slides[i])) j++;
    const n = j - i + 1;
    if (n > max) {
      const at = ctx.slides[i + max];
      emit(ctx, out, "D8.rhythm", { slide: at.id, el: at.id, vars: { count: n, type: ctx.slides[i].type, max } });
    }
    i = j + 1;
  }
}

/* ------------------------------------------------------------------- C7 */

function postCtaKind(ctx) {
  const withCta = ctaSlides(ctx);
  return withCta.length ? withCta[withCta.length - 1].cta.kind : null;
}

function gateC7(ctx, out) {
  const hist = ctx.history;
  if (!hist.length) return;
  const kind = postCtaKind(ctx);
  const family = isObj(ctx.spec.hook) ? ctx.spec.hook.family : null;
  const varietySev = ctx.spec.ext && ctx.spec.ext.source === "creator-script" ? "NOTE" : undefined;

  if (kind && active(ctx, "C7.cta-repeat")) {
    const recent = hist.slice(-param(ctx, "C7.cta-repeat").window);
    if (recent.some((e) => e.cta === kind)) {
      emit(ctx, out, "C7.cta-repeat", { sev: varietySev, vars: { kindAr: kindName(kind, "ar"), kindEn: kindName(kind, "en") } });
    }
  }
  if (family && active(ctx, "C7.family-repeat")) {
    const recent = hist.slice(-param(ctx, "C7.family-repeat").window);
    if (recent.some((e) => e.family === family)) emit(ctx, out, "C7.family-repeat", { sev: varietySev, vars: { family } });
  }
  if (active(ctx, "C7.hook-similar")) {
    const cover = coverText(ctx.spec);
    let best = 0;
    if (cover) {
      hist.forEach((e) => {
        const t = nonEmpty(e.cover) ? e.cover : nonEmpty(e.text) ? e.text : "";
        if (t) best = Math.max(best, TX().similarity(cover, strip(t)));
      });
    }
    if (best >= param(ctx, "C7.hook-similar").max) {
      emit(ctx, out, "C7.hook-similar", { vars: { score: Math.round(best * 100) } });
    }
  }
  if (family && ctx.familyLimits && isObj(ctx.familyLimits[family]) && active(ctx, "C7.max-use")) {
    const lim = ctx.familyLimits[family];
    const take = Math.max(0, lim.posts - 1);
    const recent = (take ? hist.slice(-take) : []).filter((e) => e.family === family).length;
    if (recent + 1 > lim.count) emit(ctx, out, "C7.max-use", { vars: { family } });
  }
}

/* ------------------------------------------------------------------- C8 */

function startsText(plain, m) {
  const lead = plain.search(/[\p{L}\p{N}]/u);
  return lead < 0 || m.start <= lead;
}

function gateC8(ctx, out) {
  const fields = proseFields(ctx);
  ["C8.ai-words", "C8.stock-opener", "C8.translationese", "C8.stiff-msa", "C8.hype", "C8.abstract"].forEach((id) => {
    if (!active(ctx, id)) return;
    const entries = listEntries(ctx.bundle, param(ctx, id).list);
    if (!entries.length) return;
    fields.forEach((f) => {
      const slide = f.slide ? ctx.slides.find((s) => s.id === f.slide) : null;
      if (id === "C8.stock-opener") {
        const opener = slide
          ? (slide.type === "cover" || slide.type === "poster" || ctx.pos[slide.id] === 1) && f.field === "headline"
          : f.key === "caption.firstLine";
        if (!opener) return;
      }
      const plain = strip(f.text);
      matchEntries(entries, plain, matchCtx(ctx)).forEach((m) => {
        if (id === "C8.stock-opener" && !startsText(plain, m)) return;
        emit(ctx, out, id, { slide: f.slide || undefined, el: f.key, sev: m.entry.sev, vars: { text: m.text } });
      });
    });
  });
}

/* ------------------------------------------------------------------ C10 */

function originalityWords(s) {
  let t = foldMarks(String(s)).text.toLowerCase();
  t = t
    .replace(/[\u0623\u0625\u0622\u0671]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي");
  return toWesternDigits(t).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

function wordGrams(words, n) {
  const set = new Set();
  for (let i = 0; i + n <= words.length; i++) set.add(words.slice(i, i + n).join(" "));
  return set;
}

function gateC10(ctx, out) {
  if (!active(ctx, "C10.overlap-block") && !active(ctx, "C10.overlap")) return;
  const p = param(ctx, "C10.overlap-block");
  const sources = (ctx.spec.sources || []).filter((x) => isObj(x) && (x.kind === "url" || x.kind === "file") && nonEmpty(x.excerpt));
  if (!sources.length) return;
  const src = new Set();
  sources.forEach((x) => wordGrams(originalityWords(x.excerpt), p.ngram).forEach((g) => src.add(g)));
  if (!src.size) return;

  const units = ctx.slides.map((s) => ({ slide: s.id, el: s.id, text: slideStrings(s, false, false).join(" ") }));
  const pack = ctx.spec.captionPack;
  if (isObj(pack)) {
    units.push({
      slide: null,
      el: "caption",
      text: [pack.firstLine, pack.keywordLine, pack.body, pack.cta].filter(nonEmpty).join(" ")
    });
  }
  units.forEach((u) => {
    const g = wordGrams(originalityWords(u.text), p.ngram);
    if (g.size < p.minGrams) return;
    let hit = 0;
    g.forEach((x) => {
      if (src.has(x)) hit++;
    });
    const ratio = hit / g.size;
    const id = ratio >= p.blockAt ? "C10.overlap-block" : ratio >= p.fixAt ? "C10.overlap" : null;
    if (id && active(ctx, id)) emit(ctx, out, id, { slide: u.slide || undefined, el: u.el, vars: { el: u.el, pct: Math.round(ratio * 100) } });
  });
}

  /* ---- file: gates-caption.js ---- */
/* Carousel Studio · cs-qa · gate C9 (caption pack)
 *
 * Runs once a caption pack exists, or from checkpoint "design" on (when the
 * pack must be complete). Lengths follow the CONTRACT: the 300-900 band is
 * counted in code points after NFC, Instagram's hard cap in UTF-16 units.
 */

function gateC9(ctx, out) {
  const spec = ctx.spec;
  const hasPack = isObj(spec.captionPack);
  if (!hasPack && ckptIndex(ctx.checkpoint) < ckptIndex("design")) return;
  const pack = hasPack ? spec.captionPack : {};
  const slides = ctx.slides;
  const caption = assembleCaption(spec);
  const chars = cc(caption);

  if (active(ctx, "C9.length")) {
    const p = param(ctx, "C9.length");
    const lo = p.range[0];
    const hi = p.range[1];
    if (chars < lo || chars > hi) {
      const inFastBand = ctx.fast && chars >= p.fastRange[0] && chars <= p.fastRange[1];
      if (inFastBand) {
        if (active(ctx, "C9.short-caption")) emit(ctx, out, "C9.short-caption", { el: "caption", vars: { count: chars, min: lo } });
      } else {
        emit(ctx, out, "C9.length", { el: "caption", vars: { count: chars, min: lo, max: hi } });
      }
    }
  }

  if (active(ctx, "C9.length-hard")) {
    const units = caption.normalize("NFC").length;
    const max = param(ctx, "C9.length-hard").max;
    if (units > max) emit(ctx, out, "C9.length-hard", { el: "caption", vars: { count: units, max } });
  }

  if (active(ctx, "C9.first-line") && nonEmpty(pack.firstLine)) {
    const n = cc(pack.firstLine);
    const max = param(ctx, "C9.first-line").max;
    if (n > max) emit(ctx, out, "C9.first-line", { el: "caption.firstLine", vars: { count: n, max } });
  }
  if (active(ctx, "C9.first-line-similarity") && nonEmpty(pack.firstLine)) {
    const cover = coverText(spec);
    if (cover) {
      const sim = TX().similarity(strip(pack.firstLine), cover);
      if (sim >= param(ctx, "C9.first-line-similarity").max) {
        emit(ctx, out, "C9.first-line-similarity", { el: "caption.firstLine", vars: { score: Math.round(sim * 100) } });
      }
    }
  }
  if (active(ctx, "C9.keyword-line") && !nonEmpty(pack.keywordLine)) {
    emit(ctx, out, "C9.keyword-line", { el: "caption.keywordLine" });
  }

  if (active(ctx, "C9.hashtags")) {
    const n = TX().tokenize(caption).filter((t) => t.kind === "tag").length;
    const max = param(ctx, "C9.hashtags").max;
    if (n > max) emit(ctx, out, "C9.hashtags", { el: "caption.hashtags", vars: { count: n, max } });
  }
  if (active(ctx, "C9.hashtags-form") && Array.isArray(pack.hashtags)) {
    const seen = new Set();
    pack.hashtags.forEach((h, i) => {
      const key = String(h).normalize("NFC").toLowerCase();
      if (!/^#[^\s\u00A0#]+$/.test(String(h)) || seen.has(key)) {
        emit(ctx, out, "C9.hashtags-form", { el: "caption.hashtags." + i, vars: { text: String(h) } });
      }
      seen.add(key);
    });
  }

  const per = Array.isArray(pack.perSlide) ? pack.perSlide : [];
  const alt = Array.isArray(pack.alt) ? pack.alt : [];
  slides.forEach((s, i) => {
    const n = i + 1;
    if (active(ctx, "C9.per-slide", s) && param(ctx, "C9.per-slide").required !== false) {
      if (!nonEmpty(per[i])) {
        emit(ctx, out, "C9.per-slide", { slide: s.id, el: "caption.perSlide." + i, vars: { n } });
      } else if (active(ctx, "C9.per-slide-length", s)) {
        const len = cc(per[i]);
        const max = param(ctx, "C9.per-slide-length").max;
        if (len > max) emit(ctx, out, "C9.per-slide-length", { slide: s.id, el: "caption.perSlide." + i, vars: { n, count: len, max } });
      }
    }
    if (active(ctx, "C9.alt-missing", s) && param(ctx, "C9.alt-missing").required !== false) {
      if (!nonEmpty(alt[i])) {
        emit(ctx, out, "C9.alt-missing", { slide: s.id, el: "caption.alt." + i, vars: { n } });
      } else {
        const len = cc(alt[i]);
        const hard = param(ctx, "C9.alt-length-hard").max;
        const soft = param(ctx, "C9.alt-length");
        if (len > hard) {
          emit(ctx, out, "C9.alt-length-hard", { slide: s.id, el: "caption.alt." + i, vars: { n, count: len, max: hard } });
        } else if (len > soft.max && active(ctx, "C9.alt-length", s)) {
          emit(ctx, out, "C9.alt-length", { slide: s.id, el: "caption.alt." + i, vars: { n, count: len, max: soft.max } });
        }
      }
    }
  });
}

  /* ---- file: gates-lang.js ---- */
/* Carousel Studio · cs-qa · language and safety gates (text scope)
 *
 * O1 orthography and dialect, N1 digits, B1 bidi (text part), B2 placeholder
 * chrome, SRC1 sources, SEN1 sensitivities and A1 AI imagery (the spec-level flags).
 */


/* Built-in checks that N1 and B1 own; O1 leaves them out so nothing is
 * reported twice when ortho.json also lists them. */
const O1_SKIP_CHECKS = ["mixed-digits", "persian-digits", "percent-sign", "lam-latin-stranded", "number-noun-unbound"];

const ruleSlug = (id) => String(id).toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");

const bindLabelSet = (bundleObj) =>
  bindLabelMatcher(bundleObj, bundleObj && bundleObj.ortho && Array.isArray(bundleObj.ortho.clitics) ? bundleObj.ortho.clitics : undefined);

/* ------------------------------------------------------------------- O1 */

function gateO1(ctx, out) {
  if (ctx.rawSpec) ctx = Object.assign({}, ctx, { spec: ctx.rawSpec, slides: Array.isArray(ctx.rawSpec.slides) ? ctx.rawSpec.slides.filter(isObj) : [] });
  if (!active(ctx, "O1.ortho") && !active(ctx, "O1.deny-marker") && !active(ctx, "O1.warn-marker")) return;
  const allow = allowSet(ctx.brand && ctx.brand.voice && ctx.brand.voice.allow);
  const skip = new Set(O1_SKIP_CHECKS);
  const encoding = ((ctx.bundle.ortho || {}).rules || []).filter((r) => /^ORTHO-ENC-00[4-8]$/.test(r.id));
  specStrings(ctx.spec).forEach((f) => {
    lintText(f.text, { ortho: { rules: encoding }, dialectData: null }).forEach((it) => {
      if (!active(ctx, "O1.ortho")) return;
      emit(ctx, out, "O1.ortho", { slide: f.slide, el: f.key, sev: it.sev,
        rule: "O1." + ruleSlug(it.rule), msg: it.msg,
        vars: { original: it.original, fix: it.fix || "", text: it.original } });
    });
  });
  encoding.forEach((r) => skip.add(r.id));
  lintFields(ctx).forEach((f) => {
    const slide = f.slide ? ctx.slides.find((s) => s.id === f.slide) : null;
    const plain = lintPlain(f);
    const issues = lintText(plain, {
      bundle: ctx.bundle,
      dialect: ctx.dialect,
      digits: ctx.digits,
      allowSet: allow,
      skip,
      kashidaWord: slide && f.field === "headline" ? slide.kashidaWord : ""
    });
    const seen = new Set();
    issues.forEach((it) => {
      const key = it.rule + "|" + it.original;
      if (seen.has(key)) return;
      seen.add(key);
      if (it.kind === "dialect") {
        const id = it.rule === "deny-marker" ? "O1.deny-marker" : "O1.warn-marker";
        if (!active(ctx, id)) return;
        emit(ctx, out, id, {
          slide: f.slide || undefined,
          el: f.key,
          sev: it.sev,
          vars: { text: it.original, suggest: it.fix ? " («" + it.fix + "»)" : "" }
        });
        return;
      }
      if (!active(ctx, "O1.ortho")) return;
      const vars = { original: it.original, fix: it.fix === undefined ? "" : it.fix, text: it.original };
      const o = { slide: f.slide || undefined, el: f.key, sev: it.sev, rule: "O1." + ruleSlug(it.rule), vars };
      if (isObj(it.msg) && nonEmpty(it.msg.ar) && nonEmpty(it.msg.en)) o.msg = it.msg;
      if (it.fix === undefined) o.fix = { ar: "راجع الكلمة وصح\u0651حها.", en: "Review the word and correct it." };
      emit(ctx, out, "O1.ortho", o);
    });
  });
}

/* ------------------------------------------------------------------- N1 */

const DIGIT_SYSTEM_NAMES = {
  western: { ar: "أرقام غربية 123", en: "Western digits 123" },
  "arabic-indic": { ar: "أرقام هندية ١٢٣", en: "Arabic-Indic digits ١٢٣" }
};

function gateN1(ctx, out) {
  const fields = [];
  ctx.slides.forEach((s) => slideFields(s).forEach((f) => fields.push(f)));
  captionFields(ctx.spec, true).forEach((f) => fields.push(f));
  const names = DIGIT_SYSTEM_NAMES[ctx.digits] || DIGIT_SYSTEM_NAMES.western;
  fields.forEach((f) => {
    const plain = strip(f.text);
    const info = digitSystems(plain);
    const base = { slide: f.slide || undefined, el: f.key };
    const count = (info.western ? 1 : 0) + (info.arabicIndic ? 1 : 0) + (info.persian ? 1 : 0);
    if (info.persian) {
      if (active(ctx, "N1.persian")) emit(ctx, out, "N1.persian", base);
    } else if (count > 1) {
      if (active(ctx, "N1.mixed")) emit(ctx, out, "N1.mixed", base);
    } else if (count === 1) {
      const sys = info.western ? "western" : "arabic-indic";
      if (sys !== ctx.digits && active(ctx, "N1.system")) {
        emit(ctx, out, "N1.system", Object.assign({ vars: { systemAr: names.ar, systemEn: names.en } }, base));
      }
    }
    if (active(ctx, "N1.percent") && BUILTIN["percent-sign"](plain, { digits: ctx.digits }).length) {
      emit(ctx, out, "N1.percent", base);
    }
  });
}

/* ------------------------------------------------------------- B1 (text) */

function gateB1Text(ctx, out) {
  if (!active(ctx, "B1.stranded-lam") && !active(ctx, "B1.unbound-pair")) return;
  const labels = bindLabelSet(ctx.bundle);
  lintFields(ctx).forEach((f) => {
    const plain = lintPlain(f);
    const base = { slide: f.slide || undefined, el: f.key };
    if (active(ctx, "B1.stranded-lam")) {
      BUILTIN["lam-latin-stranded"](plain, {}).forEach((it) => {
        emit(ctx, out, "B1.stranded-lam", Object.assign({ vars: { text: plain.slice(Math.max(0, it.start - 4), it.end + 12) } }, base));
      });
    }
    // Number/noun bindings are measured in the rendered scope, never in stored copy.
  });
}

/* ------------------------------------------------------------------- B2 */

/** A handle, name or label as the placeholder lists compare it: NFC, lower case, marks and punctuation folded away. */
function placeholderKey(s) {
  return String(s == null ? "" : s)
    .normalize("NFC")
    .toLowerCase()
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** True when a chrome string is a stock example (a value the tool ships as an example, a template token, or an empty label). */
function isPlaceholderChrome(raw, kind, P) {
  const text = String(raw);
  if (P.templateTokens.some((t) => text.indexOf(t) >= 0)) return true;
  const key = placeholderKey(text);
  if (!key) return true;
  const squashed = key.replace(/ /g, "");
  if (P.contains.some((c) => squashed.indexOf(c) >= 0)) return true;
  if (kind === "handle") return P.handles.indexOf(squashed) >= 0;
  if (kind === "name") return P.names.indexOf(key) >= 0;
  return P.labels.indexOf(key) >= 0;
}

/** The handle, brand name and series label are printed in the header of every slide, the MP4 and the PDF, and no other gate reads them:
 *  a copied example («@yourbrand») would ship on every export. */
function gateB2(ctx, out) {
  if (!active(ctx, "B2.placeholder-chrome")) return;
  const P = param(ctx, "B2.placeholder-chrome");
  const fields = [
    { kind: "handle", raw: ctx.brand && ctx.brand.handle, ar: "الحساب", en: "handle" },
    { kind: "name", raw: ctx.brand && ctx.brand.name, ar: "اسم البراند", en: "brand name" },
    { kind: "label", raw: ctx.spec.style && ctx.spec.style.metaLabel, ar: "عنوان السلسلة", en: "series label" }
  ];
  fields.forEach((f) => {
    if (!nonEmpty(f.raw)) return;
    if (isPlaceholderChrome(f.raw, f.kind, P)) emit(ctx, out, "B2.placeholder-chrome", { vars: { fieldAr: f.ar, fieldEn: f.en, text: f.raw } });
  });
}

/* ----------------------------------------------------------------- SRC1 */

function unitIndex(units) {
  const idx = new Map();
  Object.keys(units || {}).forEach((cat) => {
    (units[cat] || []).forEach((w) => idx.set(foldKey(w).toLowerCase().replace(/\s+/g, " "), cat));
  });
  return idx;
}

const UNIT_PREFIXES = ["وبال", "وال", "بال", "كال", "فال", "ولل", "لل", "ال", "و", "ف", "ب", "ل", "ك"];

function wordUnit(word, idx) {
  if (idx.has(word)) return idx.get(word);
  for (let i = 0; i < UNIT_PREFIXES.length; i++) {
    const p = UNIT_PREFIXES[i];
    if (word.length > p.length + 1 && word.indexOf(p) === 0 && idx.has(word.slice(p.length))) return idx.get(word.slice(p.length));
  }
  return null;
}

/** Claimed numbers in `text`: [{ text, value, why }]. */
function findClaims(text, P, idx, labels) {
  const toks = TX().tokenize(text);
  const out = [];
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t.kind !== "number") continue;
    const value = normNumber(t.text);
    if (!value) continue;
    // ordinals and step labels: «الخطوة 3»
    let p = i - 1;
    if (toks[p] && toks[p].kind === "space") p--;
    if (toks[p] && toks[p].kind === "ar" && labels.has(toks[p].text)) continue;

    let why = null;
    let unitText = "";
    let glued = false;
    if (/[%\u066A]$/.test(t.text)) why = "percent";
    else if (/^[$\u20AC\u00A3]/.test(t.text)) why = "currency";
    else {
      const sfx = /[A-Za-z]+$/.exec(t.text);
      if (sfx) {
        const cat = idx.get(sfx[0].toLowerCase());
        if (cat && (cat !== "magnitude" || Number(value) >= P.magnitudeMinValue)) why = cat;
      }
    }
    if (!why) {
      let j = i + 1;
      if (toks[j] && toks[j].kind === "space") j++;
      const n1 = toks[j];
      if (n1 && n1.kind === "punct" && (n1.text === "٪" || n1.text === "%")) {
        why = "percent";
        glued = true;
        unitText = n1.text;
      } else if (n1 && (n1.kind === "ar" || n1.kind === "latin")) {
        const w1 = foldKey(n1.text).toLowerCase();
        let cat = wordUnit(w1, idx);
        if (cat) unitText = n1.text;
        if (!cat && toks[j + 1] && toks[j + 1].kind === "space" && toks[j + 2] && toks[j + 2].kind === "ar") {
          const phrase = w1 + " " + foldKey(toks[j + 2].text).toLowerCase();
          cat = idx.get(phrase) || null;
          if (cat) unitText = n1.text + " " + toks[j + 2].text;
        }
        if (cat) why = cat;
      }
    }
    if (!why) continue;
    const intVal = /^[0-9]+$/.test(value) ? parseInt(value, 10) : NaN;
    if (why === "time" && intVal >= P.yearMin && intVal <= P.yearMax) continue;
    out.push({ text: (t.text + (unitText ? (glued ? "" : " ") + unitText : "")).trim(), value, why });
  }
  return out;
}

function numbersIn(text) {
  const t = toWesternDigits(String(text)).replace(/([0-9])[,\u066C](?=[0-9]{3}(?![0-9]))/g, "$1");
  const set = new Set();
  (t.match(/[0-9]+(?:[.\u066B][0-9]+)?/g) || []).forEach((m) => set.add(normNumber(m)));
  return set;
}

/** Text of a source that can be searched for numbers (never a URL). */
function sourceMaterial(x) {
  const parts = [x.excerpt, x.location, x.formula];
  if (x.kind === "user" || x.kind === "ownData") parts.push(x.ref);
  return parts.filter(nonEmpty).join(" ");
}

function gateSRC1(ctx, out) {
  if (!active(ctx, "SRC1.missing") && !active(ctx, "SRC1.mismatch") && !active(ctx, "SRC1.unverified")) return;
  const P = param(ctx, "SRC1.missing");
  const idx = unitIndex(P.units);
  const labels = bindLabelSet(ctx.bundle);
  const sources = (ctx.spec.sources || []).filter(isObj);
  const byId = {};
  sources.forEach((x) => {
    byId[x.id] = x;
  });
  const anyMaterial = sources.map((x) => numbersIn(sourceMaterial(x)));
  const inAnySource = (v) => anyMaterial.some((set) => set.has(v));
  const sourcedValues = new Set();

  ctx.slides.forEach((s) => {
    const claims = [];
    if (isObj(s.number) && nonEmpty(s.number.value)) {
      claims.push({ text: numberText(s), value: normNumber(s.number.value), el: s.id + ".number" });
    }
    slideFields(s).forEach((f) => {
      if (f.field === "number" || f.field === "sides.label") return;
      findClaims(strip(f.text), P, idx, labels).forEach((c) => claims.push({ text: c.text, value: c.value, el: f.key }));
    });
    if (!claims.length) return;
    const ids = (s.sourceIds || []).concat(isObj(s.number) && s.number.sourceId ? [s.number.sourceId] : []);
    const linked = ids.map((id) => byId[id]).filter(Boolean);
    const reported = new Set();
    claims.forEach((c) => {
      const base = { slide: s.id, el: c.el, vars: { text: c.text } };
      if (!linked.length) {
        if (inAnySource(c.value)) {
          sourcedValues.add(c.value);
        } else if (!reported.has("m" + c.value) && active(ctx, "SRC1.missing")) {
          reported.add("m" + c.value);
          emit(ctx, out, "SRC1.missing", base);
        }
        return;
      }
      sourcedValues.add(c.value);
      linked.forEach((x) => {
        if (x.verified === false && !reported.has("u" + x.id) && active(ctx, "SRC1.unverified")) {
          reported.add("u" + x.id);
          emit(ctx, out, "SRC1.unverified", base);
        }
      });
      const readable = linked
        .filter((x) => x.kind !== "calc")
        .map((x) => numbersIn(sourceMaterial(x)))
        .filter((set) => set.size > 0);
      if (readable.length && !readable.some((set) => set.has(c.value)) && !reported.has("x" + c.value) && active(ctx, "SRC1.mismatch")) {
        reported.add("x" + c.value);
        emit(ctx, out, "SRC1.mismatch", base);
      }
    });
  });

  captionFields(ctx.spec, false).forEach((f) => {
    if (f.field === "perSlide") return;
    findClaims(strip(f.text), P, idx, labels).forEach((c) => {
      if (!sourcedValues.has(c.value) && !inAnySource(c.value) && active(ctx, "SRC1.missing")) {
        emit(ctx, out, "SRC1.missing", { el: f.key, vars: { text: c.text } });
      }
    });
  });
}

/* ----------------------------------------------------------------- SEN1 */

function gateSEN1(ctx, out) {
  const fields = proseFields(ctx);
  if (active(ctx, "SEN1.gulf-name")) {
    const p = param(ctx, "SEN1.gulf-name");
    const countries = (ctx.brand && ctx.brand.locale && ctx.brand.locale.countries) || [];
    const gcc = ctx.dialect === "gulf" || countries.some((c) => p.countries.indexOf(c) >= 0);
    if (gcc) {
      const entries = p.terms.map((t, i) => ({ id: "t" + i, text: t, match: "phrase" }));
      fields.forEach((f) => {
        const m = matchEntries(entries, strip(f.text), matchCtx(ctx))[0];
        if (m) emit(ctx, out, "SEN1.gulf-name", { slide: f.slide || undefined, el: f.key, vars: { text: m.text } });
      });
    }
  }
  if (active(ctx, "SEN1.conspiracy")) {
    const entries = listEntries(ctx.bundle, param(ctx, "SEN1.conspiracy").list);
    fields.forEach((f) => {
      const m = matchEntries(entries, strip(f.text), matchCtx(ctx))[0];
      if (m) emit(ctx, out, "SEN1.conspiracy", { slide: f.slide || undefined, el: f.key, vars: { text: m.text } });
    });
  }
  if (active(ctx, "SEN1.fear-stacking")) {
    const p = param(ctx, "SEN1.fear-stacking");
    const entries = listEntries(ctx.bundle, p.list);
    if (entries.length) {
      const groups = {};
      fields.forEach((f) => {
        const g = f.slide || "caption";
        matchEntries(entries, strip(f.text), matchCtx(ctx)).forEach((m) => {
          (groups[g] = groups[g] || new Set()).add(m.entry.id || foldKey(m.text));
        });
      });
      Object.keys(groups).forEach((g) => {
        if (groups[g].size >= p.minDistinct) {
          emit(ctx, out, "SEN1.fear-stacking", { slide: g === "caption" ? undefined : g, el: g, vars: { el: g, count: groups[g].size } });
        }
      });
    }
  }
  if (active(ctx, "SEN1.religious-promo") && (ctx.spec.contentType === "soft-sell" || ctx.spec.intent === "sell")) {
    const res = param(ctx, "SEN1.religious-promo").patterns.map((p) => new RegExp(p));
    fields.forEach((f) => {
      if (res.some((re) => re.test(strip(f.text)))) {
        emit(ctx, out, "SEN1.religious-promo", { slide: f.slide || undefined, el: f.key });
      }
    });
  }
}

/* ------------------------------------------------------------------- A1 */

const slideHasText = (s) => slideFields(s).some((f) => f.field !== "number");

function a1Media(s,spec) {
  const refs=isObj(s.media)&&s.media.slot!=="none"?[[s.media,s.id+".media"]]:[];
  const add=(id,key)=>{if (id&&!refs.some(r=>r[0].assetId===id)) refs.push([{slot:"photo",assetId:id,calmZone:"bottom"},s.id+"."+key]);};
  if (s.type==="cover") add(spec.cover?.logo?.assetId,"logo");
  else if (typeof s.free?.html==="string") for (const m of s.free.html.matchAll(/<div\b[^>]*?\sdata-picture\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)) {
    const id=(m[1] ?? m[2] ?? m[3]).replace(/&#(x[0-9a-f]+|[0-9]+);/gi,(_,n)=>String.fromCodePoint(Math.min(1114111,+("0"+n))));
    add(id,"picture."+id);
  }
  return refs;
}

function gateA1(ctx,out) {
  const assets=new Map((ctx.spec.assets||[]).filter(isObj).map(a=>[a.id,a]));
  const checks=ctx.spec.ext?.[QA.ASSET_CHECKS_KEY]||{};
  ctx.slides.forEach(s=>a1Media(s,ctx.spec).forEach(([m,el])=>{
    const a=assets.get(m.assetId),flagged=a?.aiGenerated===true,ai=m.ai===true||flagged;
    const put=r=>active(ctx,"A1."+r,s)&&emit(ctx,out,"A1."+r,{slide:s.id,el,vars:{el,asset:m.assetId}});
    if (m.assetId&&!assets.has(m.assetId)) put("asset-missing");
    if (m.ai===true&&!flagged) put("flag");
    if (ai&&m.assetId&&!(isObj(checks[m.assetId])&&checks[m.assetId].textChecked===true)) put("text-check");
    if ((m.slot==="plate"||ai)&&slideHasText(s)&&(!m.calmZone||m.calmZone==="none")) put("calm-zone");
  }));
}

  /* ---- file: gates-rendered.js ---- */
/* Carousel Studio · cs-qa · rendered gates
 *
 * D1 (preview size), D2 layout, D3 sizes, D4 contrast, D5 Arabic rules,
 * D6 composition, D7 default look, T1 thumbnail and B1 (rendered part).
 * They read the real slide DOM (.cs-slide, CONTRACT 5.1), so every length is
 * converted back to canvas pixels with the slide's own scale. Text under
 * aria-hidden (background, decoration) is never measured.
 */


const ZONE_NAMES = {
  "top-left": { ar: "أعلى اليسار", en: "top-left" },
  "top-right": { ar: "أعلى اليمين", en: "top-right" },
  "bottom-left": { ar: "أسفل اليسار", en: "bottom-left" },
  "bottom-right": { ar: "أسفل اليمين", en: "bottom-right" }
};
const CHROME_SLOTS = ["handle", "meta", "counter", "swipe", "savepill", "rail"];
const chromeNode = (S, name) => S.el.querySelector(name === "rail" ? ".cs-rail" : '[data-slot="' + name + '"]');
const chromeHidden = (el, S, name) => hiddenWithin(name === "rail" ? el.parentElement : el, S.el) ||
  getComputedStyle(el).display === "none" || getComputedStyle(el).visibility === "hidden";
const chromeBand = (S, el, p) => el.closest(".cs-header") ? p.header :
  p.innerFooter && S.tokens && S.tokens.art && (p.coverTypes || ["cover", "poster"]).indexOf(S.type) < 0 ? p.innerFooter : p.footer;
const INVISIBLE_CODES = new Set([0x00a0, 0x200b, 0x200c, 0x200d, 0x200e, 0x200f, 0x2060, 0xfe0f, 0x0a, 0x09, 0x20, 0x202f]);



/* ------------------------------------------------------------ colour maths */
const SRGB_LUT = (() => {
  const t = new Float64Array(256);
  for (let i = 0; i < 256; i++) {
    const c = i / 255;
    t[i] = c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
  return t;
})();

const lumOf = (r, g, b) => 0.2126 * SRGB_LUT[r] + 0.7152 * SRGB_LUT[g] + 0.0722 * SRGB_LUT[b];
const lumRatio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
const toHex2 = (n) => ("0" + Math.round(n).toString(16)).slice(-2);
const rgbHex = (c) => "#" + toHex2(c.r) + toHex2(c.g) + toHex2(c.b);

/** Also reads computed color-mix(in srgb ...), serialized as color(srgb ...). */
function parseCssColor(s) {
  if (!s) return null;
  s = String(s).trim().toLowerCase();
  if (s === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
  if (/^color\(srgb\s/.test(s)) {
    const parts = s.slice(11, -1).trim().split(/\s*\/\s*|\s+/);
    if (!s.endsWith(")") || parts.length < 3 || parts.length > 4 ||
        parts.some((v) => !/^[+-]?(?:[0-9]+\.?[0-9]*|\.[0-9]+)(?:e[+-]?[0-9]+)?%?$/.test(v))) return null;
    const n = parts.map((v) => parseFloat(v) / (v.endsWith("%") ? 100 : 1));
    if (!n.every(Number.isFinite)) return null;
    const clamp = (v) => Math.max(0, Math.min(1, v));
    return { r: Math.round(clamp(n[0]) * 255), g: Math.round(clamp(n[1]) * 255), b: Math.round(clamp(n[2]) * 255), a: clamp(n[3] === undefined ? 1 : n[3]) };
  }
  let m = /^rgba?\(\s*([0-9.]+)[ ,]+([0-9.]+)[ ,]+([0-9.]+)(?:[ ,/]+([0-9.%]+))?\s*\)$/.exec(s);
  if (m) {
    let a = 1;
    if (m[4] !== undefined) a = /%$/.test(m[4]) ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    return { r: Math.round(+m[1]), g: Math.round(+m[2]), b: Math.round(+m[3]), a };
  }
  m = /^#([0-9a-f]{3,8})$/.exec(s);
  if (m) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = h.split("").map((c) => c + c).join("");
    if (h.length === 6 || h.length === 8) {
      return {
        r: parseInt(h.slice(0, 2), 16),
        g: parseInt(h.slice(2, 4), 16),
        b: parseInt(h.slice(4, 6), 16),
        a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1
      };
    }
  }
  return null;
}

/** `top` composited over an opaque `bottom`. */
function colorOver(top, bottom) {
  const a = top.a === undefined ? 1 : top.a;
  return {
    r: Math.round(top.r * a + bottom.r * (1 - a)),
    g: Math.round(top.g * a + bottom.g * (1 - a)),
    b: Math.round(top.b * a + bottom.b * (1 - a)),
    a: 1
  };
}

const hexToRgb = (h) => parseCssColor(h) || { r: 255, g: 255, b: 255, a: 1 };
const fmt1 = (n) => (Math.round(n * 10) / 10).toFixed(1);

function chromaOf(c) {
  const col = CS.core && CS.core.color;
  if (col && typeof col.toOklch === "function") return col.toOklch(rgbHex(c)).C;
  const mx = Math.max(c.r, c.g, c.b);
  const mn = Math.min(c.r, c.g, c.b);
  return (mx - mn) / 255 / 2.5;
}



/* ------------------------------------------------------------- DOM helpers */
function hiddenWithin(el, root) {
  for (let e = el; e; e = e.parentElement) {
    if (e.getAttribute && e.getAttribute("aria-hidden") === "true") return true;
    if (e === root) break;
  }
  return false;
}

/** Element key in the CONTRACT vocabulary (s03.title, s03.bullets.2 …). */
function domKey(S, el) {
  const id = S.id;
  const keyed = el.closest ? el.closest("[data-slot-key]") : null;
  if (keyed && S.el.contains(keyed)) return keyed.getAttribute("data-slot-key");
  const li = el.closest ? el.closest(".cs-bullet") : null;
  if (li && S.el.contains(li)) {
    const i = li.getAttribute("data-m-i");
    return id + ".bullets." + (i !== null ? i : Array.prototype.indexOf.call(li.parentElement.children, li));
  }
  const side = el.closest ? el.closest(".cs-side") : null;
  if (side && S.el.contains(side)) {
    const i = side.getAttribute("data-side");
    const idx = i !== null ? i : Array.prototype.indexOf.call(side.parentElement.children, side);
    return id + ".sides." + idx + (el.closest(".cs-side-label") ? ".label" : "");
  }
  const slot = el.closest ? el.closest("[data-slot]") : null;
  if (slot && S.el.contains(slot)) return id + "." + slot.getAttribute("data-slot");
  return id;
}

function slideInfo(sr, ctx) {
  const el = sr.el;
  const box = el.getBoundingClientRect();
  const cv = ctx.spec.canvas || {};
  const W = cv.w || el.offsetWidth || 1080;
  const H = cv.h || el.offsetHeight || 1440;
  const scale = box.width / (el.offsetWidth || W) || 1;
  const id = sr.id || el.getAttribute("data-cs-slide") || "";
  const slide = (ctx.spec.slides || []).find((s) => s.id === id) || {};
  const S = {
    sr,
    el,
    id,
    slide,
    type: slide.type || el.getAttribute("data-type") || "",
    box,
    W,
    H,
    scale,
    tokens: sr.tokens || ctx.tokens || null,
    rel(r) {
      return { x: (r.left - box.left) / scale, y: (r.top - box.top) / scale, w: r.width / scale, h: r.height / scale };
    }
  };
  return S;
}

/** One entry per element that directly holds visible text. */
function collectTexts(S) {
  if (S._texts) return S._texts;
  const items = new Map();
  const walker = document.createTreeWalker(S.el, NodeFilter.SHOW_TEXT, null);
  let n;
  while ((n = walker.nextNode())) {
    const v = n.nodeValue.replace(/[\u00AD\u061C\u200B\u200E\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, "");
    if (!/\S/.test(v)) continue;
    const el = n.parentElement;
    if (!el || /^(STYLE|SCRIPT|TEMPLATE)$/.test(el.tagName) || hiddenWithin(el, S.el)) continue;
    let it = items.get(el);
    if (!it) {
      it = { el, key: domKey(S, el), text: "", rects: [], inkRects: [], cs: getComputedStyle(el) };
      items.set(el, it);
    }
    // Inline boxes follow the font's content area; the line box is what the
    // layout reserves, so a taller content area is trimmed to the line height.
    const lh = parseFloat(it.cs.lineHeight);
    const range = document.createRange();
    const chunks = n.nodeValue.matchAll(/[^\s\u00AD\u061C\u200B\u200E\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]+/gu);
    const rects = [];
    for (const chunk of chunks) {
      range.setStart(n, chunk.index); range.setEnd(n, chunk.index + chunk[0].length);
    Array.prototype.forEach.call(range.getClientRects(), (r) => {
      if (r.width <= 0.5 || r.height <= 0.5) return;
      const rr = S.rel(r);
        const ink = glyphInk(S, it.cs, chunk[0], rr);
        if (ink) it.inkRects.push(ink);
      if (lh > 0 && rr.h > lh) {
        rr.y += (rr.h - lh) / 2;
        rr.h = lh;
      }
      rects.push(rr);
    });
    }
    if (!rects.length) {
      if (!it.text) items.delete(el);
      continue;
    }
    it.text += v;
    rects.forEach((r) => it.rects.push(r));
  }
  S._texts = Array.from(items.values()).map((it) => {
    it.chrome = !!it.el.closest(".cs-header, .cs-footer");
    const roleEl = it.el.closest("[data-role]");

    /* a side label sits inside the "sides" slot (role body) but is set small by design */
    it.role = it.chrome ? "micro" : it.el.closest(".cs-side-label") ? "small" : roleEl ? roleEl.getAttribute("data-role") : "";
    it.fontPx = parseFloat(it.cs.fontSize) || 0;
    it.weight = parseInt(it.cs.fontWeight, 10) || 400;
    return it;
  });
  return S._texts;
}

const intersects = (a, b, tol) => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > tol && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > tol;

/** Group word rects into visual lines (same vertical centre ± half a line). */
function groupLines(rects) {
  const sorted = rects.slice().sort((a, b) => a.y + a.h / 2 - (b.y + b.h / 2));
  const lines = [];
  sorted.forEach((r) => {
    const cy = r.y + r.h / 2;
    const last = lines[lines.length - 1];
    if (last && Math.abs(cy - last.cy) < Math.min(r.h, last.h) * 0.5) {
      last.rects.push(r);
      last.cy = (last.cy * (last.rects.length - 1) + cy) / last.rects.length;
    } else {
      lines.push({ cy, h: r.h, rects: [r] });
    }
  });
  return lines.map((l) => {
    const x0 = Math.min.apply(null, l.rects.map((r) => r.x));
    const x1 = Math.max.apply(null, l.rects.map((r) => r.x + r.w));
    return { cy: l.cy, words: l.rects.length, width: x1 - x0, rects: l.rects };
  });
}



/* ------------------------------------------------------------------- D1 */
function gateD1Render(rc, out) {
  if (!active(rc, "D1.render-size")) return;
  rc.S.forEach((S) => {
    const ew = S.W;
    const eh = S.H;
    const w = Math.round(S.el.offsetWidth);
    const h = Math.round(S.el.offsetHeight);
    if (w !== ew || h !== eh) emit(rc, rc.out, "D1.render-size", { slide: S.id, el: S.id, vars: { w, h, ew, eh } });
  });
}



/* ------------------------------------------------------------------- D2 */
function gateD2(rc) {
  const out = rc.out;
  const tolOver = param(rc, "D2.overflow").tolerancePx;
  rc.S.forEach((S) => {
    gatePaintedLayout(rc, S);
    const texts = collectTexts(S);
    const reported = new Set();
    const once = (id, key, extra) => {
      const k = id + "|" + key + "|" + (extra || "");
      if (reported.has(k)) return false;
      reported.add(k);
      return true;
    };

    if (active(rc, "D2.overflow", S.slide)) {
      const slots = (S.sr.fit && S.sr.fit.slots) || {};
      Object.keys(slots).forEach((key) => {
        if (slots[key] && slots[key].status === "overflow" && once("D2.overflow", key)) {
          emit(rc, out, "D2.overflow", { slide: S.id, el: key, vars: { el: key } });
        }
      });
      texts.forEach((it) => {
        const slot = it.chrome || it.el.closest(".cs-side-label") ? null : it.el.closest("[data-slot][data-kind]");
        if (!slot || !S.el.contains(slot) || slot.getAttribute("data-kind") === "media") return;
        const sr = S.rel(slot.getBoundingClientRect());
        if (sr.w <= 0 || sr.h <= 0) return;
        const over = it.rects.reduce(
          (m, r) => Math.max(m, r.x + r.w - (sr.x + sr.w), sr.x - r.x, r.y + r.h - (sr.y + sr.h), sr.y - r.y),
          0
        );
        const key = domKey(S, slot);
        if (over > tolOver && once("D2.overflow", key)) emit(rc, out, "D2.overflow", { slide: S.id, el: key, vars: { el: key } });
      });
      texts.forEach((it) => {
        const beyond = it.rects.some((r) => r.x < -tolOver || r.y < -tolOver || r.x + r.w > S.W + tolOver || r.y + r.h > S.H + tolOver);
        if (beyond && once("D2.overflow", it.key)) emit(rc, out, "D2.overflow", { slide: S.id, el: it.key, vars: { el: it.key } });
      });
    }

    if (active(rc, "D2.outside-content", S.slide)) {
      const p = param(rc, "D2.outside-content");
      texts.forEach((it) => {
        const b = it.chrome ? (p.chromeBox || p.box) : p.box;
        const bad = it.rects.some(
          (r) => r.x < b.x - p.tolerancePx || r.y < b.y - p.tolerancePx || r.x + r.w > b.x + b.w + p.tolerancePx || r.y + r.h > b.y + b.h + p.tolerancePx
        );
        if (bad && once("D2.outside-content", it.key)) emit(rc, out, "D2.outside-content", { slide: S.id, el: it.key, vars: { el: it.key } });
      });
    }

    if (active(rc, "D2.keep-out", S.slide)) {
      const p = param(rc, "D2.keep-out");
      texts.forEach((it) => {
        (p.zones || []).forEach((z) => {
          if (it.rects.some((r) => intersects(r, z, p.tolerancePx)) && once("D2.keep-out", it.key, z.id)) {
            const nm = ZONE_NAMES[z.id] || { ar: z.id, en: z.id };
            emit(rc, out, "D2.keep-out", { slide: S.id, el: it.key, vars: { el: it.key, zoneAr: nm.ar, zoneEn: nm.en } });
          }
        });
      });
    }

    if (active(rc, "D2.chrome-band", S.slide)) {
      const p = param(rc, "D2.chrome-band");
      CHROME_SLOTS.forEach((name) => {
        const el = chromeNode(S, name);
        if (!el || chromeHidden(el, S, name)) return;
        const r = S.rel(el.getBoundingClientRect());
        if (r.w <= 0 || r.h <= 0) return;
        const inHeader = !!el.closest(".cs-header");
        const band = chromeBand(S, el, p);
        const t = p.tolerancePx;
        let bad = r.x < band.x - t || r.x + r.w > band.x + band.w + t || r.y < band.y - t || r.y + r.h > band.y + band.h + t;
        if (!inHeader && band.itemMaxHeightPx && r.h > band.itemMaxHeightPx + t) bad = true;
        if (bad && once("D2.chrome-band", name)) emit(rc, out, "D2.chrome-band", { slide: S.id, el: S.id + "." + name, vars: { el: S.id + "." + name } });
      });
    }

    if (active(rc, "D2.accent-count", S.slide) && S.tokens) {
      const p = param(rc, "D2.accent-count");
      const palette = new Set();
      const roles = S.tokens.roles || {};
      ["bg", "surface", "ink", "inkMuted"].forEach((k) => roles[k] && palette.add(String(roles[k]).toLowerCase()));
      const dv = S.tokens.derived || {};
      ["onAccent", "line"].forEach((k) => dv[k] && palette.add(String(dv[k]).toLowerCase()));
      const seen = new Set();
      const consider = (css) => {
        const c = parseCssColor(css);
        if (!c || c.a === 0) return;
        const hex = rgbHex(c);
        if (palette.has(hex) || chromaOf(c) < p.minChroma) return;
        seen.add(hex);
      };
      texts.forEach((it) => {
        consider(it.cs.color);
        if (it.el.closest("mark")) consider(getComputedStyle(it.el.closest("mark")).backgroundColor);
        if (/underline/.test(it.cs.textDecorationLine || "")) consider(it.cs.textDecorationColor);
      });
      if (seen.size > p.max) emit(rc, out, "D2.accent-count", { slide: S.id, el: S.id, vars: { count: seen.size, max: p.max } });
    }
  });

  if (active(rc, "D2.chrome-drift") && rc.S.length > 1) {
    const p = param(rc, "D2.chrome-drift"), maxPx = p.maxPx;
    CHROME_SLOTS.forEach((name) => {
      const rows = [];
      rc.S.forEach((S) => {
        const el = chromeNode(S, name);
        if (!el || chromeHidden(el, S, name)) return;
        const r = S.rel(el.getBoundingClientRect());
        const band = chromeBand(S, el, p) || { x: 0, y: 0, w: S.W, h: S.H };
        r.x -= band.x; r.y -= band.y;
        if (r.w > 0 && r.h > 0) rows.push({ S, r, band });
      });
      if (rows.length < 2) return;
      const spread = (f) => Math.max.apply(null, rows.map(f)) - Math.min.apply(null, rows.map(f));
      const at = [(o) => o.r.x, (o) => o.r.x + o.r.w - o.band.w, (o) => o.r.x + o.r.w / 2 - o.band.w / 2, (o) => o.r.y, (o) => o.r.y + o.r.h - o.band.h, (o) => o.r.y + o.r.h / 2 - o.band.h / 2], sp = at.map(spread);
      const dx = Math.min(sp[0], sp[1], sp[2]), dy = Math.min(sp[3], sp[4], sp[5]);
      if (dx > maxPx || dy > maxPx) {
        // Blame the outlier on the steadiest anchor of the drifting axis.
        const ax = dx > maxPx ? [0, 1, 2] : [3, 4, 5], g = at[ax.reduce((b, i) => (sp[i] < sp[b] ? i : b), ax[0])];
        const mid = rows.map(g).sort((a, b) => a - b)[Math.floor(rows.length / 2)];
        const worst = rows.slice().sort((a, b) => Math.abs(g(b) - mid) - Math.abs(g(a) - mid))[0];
        emit(rc, out, "D2.chrome-drift", { slide: worst.S.id, el: worst.S.id + "." + name, vars: { el: name, max: maxPx } });
      }
    });
  }
}

function paintVisible(el, root) {
  if (el.closest('.cs-bg,.cs-decor,.cs-marks,.cs-header,.cs-footer,defs,clipPath,mask,symbol')) return false;
  for (let e = el; e; e = e.parentElement) {
    const c = getComputedStyle(e);
    if (c.display === "none" || c.visibility === "hidden" || +c.opacity === 0) return false;
    if (e === root) break;
  }
  return true;
}

function paintedBox(el) {
  const c = getComputedStyle(el), bg = parseCssColor(c.backgroundColor);
  return bg && bg.a > 0 || c.backgroundImage && c.backgroundImage !== "none" ||
  ["Top", "Right", "Bottom", "Left"].some(s => parseFloat(c["border" + s + "Width"]) > 0 && parseCssColor(c["border" + s + "Color"])?.a > 0);
}

function gatePaintedLayout(rc, S) {
  if (!["D2.text-padding", "D2.block-gap", "D2.clipped-paint"].some(id => active(rc, id, S.slide))) return;
  const texts = collectTexts(S).filter(it => !it.chrome), seen = new Set();
  const emitOnce = (id, el, sev) => {
    const key = domKey(S, el), k = id + key;
    if (!active(rc, id, S.slide) || seen.has(k)) return;
    seen.add(k); emit(rc, rc.out, id, { slide: S.id, el: key, sev, vars: { el: key } });
  };
  const padRule = param(rc, "D2.text-padding"), gapRule = param(rc, "D2.block-gap"), p = param(rc, "D2.clipped-paint");
  const unit = parseFloat(getComputedStyle(S.el).getPropertyValue("--cs-unit")) || padRule.unit || gapRule.unit || p.tolerancePx;
  const padding = (padRule.minUnits - padRule.toleranceUnits) * unit, gap = (gapRule.minUnits - gapRule.toleranceUnits) * unit;
  // Padding, sibling gaps and cut shapes are judged on free designs, which an author lays out by hand. The engine's own layouts come from
  // tested templates: every shipped style would otherwise fail these checks on its own cards (the preset matrix found 278 such findings).
  const free = !!S.el.querySelector(".cs-content.cs-free"), containers = new Set();
  texts.forEach(it => {
    if (!free) return;
    // A compact text tag paints emphasis; it is not a body panel.
    if ((padRule.compactRoles || []).includes(it.role)) return;
    for (let e = it.el; e && e !== S.el; e = e.parentElement) {
      if (e.matches('mark,.cs-em,.w,bdi,.cs-content')) continue;
      if (!paintedBox(e)) continue;
      const b = S.rel(e.getBoundingClientRect()), ink = it.inkRects.length ? it.inkRects : it.rects;
      if (ink.some(r => Math.min(r.x - b.x, r.y - b.y, b.x + b.w - r.x - r.w, b.y + b.h - r.y - r.h) < padding)) emitOnce("D2.text-padding", it.el);
      containers.add(e); break;
    }
  });
  const list = Array.from(containers);
  list.forEach((a, i) => list.slice(i + 1).forEach(b => {
    if (a.parentElement !== b.parentElement) return;
    const frame = getComputedStyle(a.parentElement);
    // Adjoining cells belong to one enclosing frame; their internal padding still counts.
    if (["Top", "Right", "Bottom", "Left"].some(s => parseFloat(frame["border" + s + "Width"]) > 0 && parseCssColor(frame["border" + s + "Color"])?.a > 0)) return;
    const x = S.rel(a.getBoundingClientRect()), y = S.rel(b.getBoundingClientRect());
    const dx = Math.max(x.x, y.x) - Math.min(x.x + x.w, y.x + y.w), dy = Math.max(x.y, y.y) - Math.min(x.y + x.h, y.y + y.h);
    if (dx < 0 && dy < gap || dy < 0 && dx < gap) emitOnce("D2.block-gap", a);
  }));
  const tol = unit * p.toleranceShare;
  S.el.querySelectorAll('.cs-content *').forEach(e => {
    if (!paintVisible(e, S.el)) return;
    const c = getComputedStyle(e), svg = e.namespaceURI === "http://www.w3.org/2000/svg";
    const stroke = svg && parseCssColor(c.stroke)?.a > 0 && +c.strokeOpacity > 0 ? parseFloat(c.strokeWidth) || 0 : 0;
    const shape = svg && /^(path|circle|ellipse|rect|line|polyline|polygon|use)$/.test(e.localName);
    const text = texts.find(it => it.el === e);
    const glyph = text && (parseCssColor(c.webkitTextFillColor || c.color)?.a > 0 || parseFloat(c.webkitTextStrokeWidth) > 0 || c.backgroundClip === "text" || c.webkitBackgroundClip === "text");
    if (!glyph && !paintedBox(e) && !e.matches('img,video') && !(shape && (stroke || parseCssColor(c.fill)?.a > 0 && +c.fillOpacity > 0))) return;
    const rs = glyph ? text.inkRects.length ? text.inkRects : text.rects : [S.rel(e.getBoundingClientRect())];
    const mt = stroke && e.getScreenCTM(), sw = mt ? stroke * (c.vectorEffect === "non-scaling-stroke" ? 1 : Math.max(Math.hypot(mt.a, mt.b), Math.hypot(mt.c, mt.d))) / S.scale / 2 : 0;
    for (let a = glyph ? e : e.parentElement; a; a = a.parentElement) {
      const ac = getComputedStyle(a), clipX = /^(hidden|clip|scroll|auto)$/.test(ac.overflowX), clipY = /^(hidden|clip|scroll|auto)$/.test(ac.overflowY);
      if (clipX || clipY) {
        const b = S.rel(a.getBoundingClientRect()), left = parseFloat(ac.borderLeftWidth) || 0, top = parseFloat(ac.borderTopWidth) || 0;
        b.x += left; b.y += top; b.w -= left + (parseFloat(ac.borderRightWidth) || 0); b.h -= top + (parseFloat(ac.borderBottomWidth) || 0);
        if (rs.some(r => r.w > 0 && r.h > 0 && (clipX && (r.x - sw < b.x - tol || r.x + r.w + sw > b.x + b.w + tol) || clipY && (r.y - sw < b.y - tol || r.y + r.h + sw > b.y + b.h + tol)))) {
          // Cut text, icons and pictures lose meaning. A drawn shape cut by its frame is often a deliberate bleed (rings running off a panel
          // on published posts), so it is reported for review instead of stopping the export.
          const content = glyph || e.closest('.cs-icon,[data-icon],[data-object],[data-picture],.cs-media-slot,img,video');
          if (content || free) emitOnce("D2.clipped-paint", e, content ? "BLOCK" : "FIX");
          break;
        }
      }
      if (a === S.el) break;
    }
  });
}

/* ------------------------------------------------------------------- D3 */
function gateD3(rc) {
  const out = rc.out;
  rc.S.forEach((S) => {
    const floors = (S.tokens && S.tokens.floors) || {};
    const bodyMin = floors.body || param(rc, "D3.body-floor").min;
    const metaMin = floors.meta || param(rc, "D3.meta-floor").min;
    const heroMin = floors.hero || param(rc, "D3.hero-floor").min;
    const seen = new Set();
    collectTexts(S).forEach((it) => {
      if (!it.fontPx) return;
      let id = null;
      let min = 0;
      if (it.role === "hero" && (S.type === "cover" || S.type === "poster")) {
        id = "D3.hero-floor";
        min = heroMin;
      } else if (it.role === "body") {
        id = "D3.body-floor";
        min = bodyMin;
      } else if (it.role === "small" || it.role === "micro" || it.chrome) {
        id = "D3.meta-floor";
        min = metaMin;
      }
      if (CS.visual?.free?.active(S.slide) && !it.chrome) { id = it.role === "body" ? "D3.body-floor" : "D3.meta-floor"; min = it.role === "body" ? 42 : 30; }
      const label = it.el.closest('.cs-art-label,[data-slot="art"]');
      const floor = label && Number(it.el.closest('[data-floor]')?.getAttribute('data-floor'));
      if (floor > 0 && Number.isFinite(floor)) min = floor;
      if (!id || !active(rc, id, S.slide) || it.fontPx >= min - 0.01 || seen.has(id + it.key)) return;
      seen.add(id + it.key);
      emit(rc, out, id, { slide: S.id, el: it.key, vars: { el: it.key, px: Math.round(it.fontPx * 10) / 10, min } });
    });
  });
}

/* ------------------------------------------------------------------- D4 */


/** Backgrounds under an element from the DOM: { kind, colors:[rgb] }. */
function domBackground(el, S) {
  let translucent = [];
  let e = el;
  for (;;) {
    const c = getComputedStyle(e);
    if (e === S.el) {
      const layer = S.el.querySelector('.cs-bg');
      if (layer && layer !== el) {
        const lc = getComputedStyle(layer), col = parseCssColor(lc.backgroundColor);
        if (layer.querySelector('img,video') || /url\(/.test(lc.backgroundImage)) return { kind: "image", colors: [] };
        if (col?.a > 0 || /gradient/.test(lc.backgroundImage)) {
          const under = domBackground(layer, { el: layer, tokens: S.tokens });
          return { kind: under.kind, colors: under.colors.map(bg => translucent.reduceRight((acc, t) => colorOver(t, acc), bg)) };
        }
      }
    }
    const bg = parseCssColor(c.backgroundColor);
    const img = c.backgroundImage || "none";
    if (/url\(/.test(img)) return { kind: "image", colors: [] };
    if (/gradient/.test(img)) {
      const stops = (img.match(/rgba?\([^)]*\)|color\(srgb[^)]*\)|#[0-9a-fA-F]{3,8}/g) || []).map(parseCssColor).filter(Boolean);
      const under = hexToRgb((S.tokens && S.tokens.roles && S.tokens.roles.bg) || "#ffffff");
      if (stops.length) return { kind: "gradient", colors: stops.map((s) => (s.a < 1 ? colorOver(s, under) : s)) };
    }
    if (bg && bg.a > 0) {
      if (bg.a >= 1) return { kind: "solid", colors: [translucent.reduceRight((acc, t) => colorOver(t, acc), bg)] };
      translucent.push(bg);
    }
    if (e === S.el || !e.parentElement) break;
    e = e.parentElement;
  }
  const layer = S.el.querySelector(".cs-bg");
  if (layer && layer !== el) return domBackground(layer, { el: layer, tokens: S.tokens });
  const bgHex = S.tokens && S.tokens.roles && S.tokens.roles.bg;
  return { kind: "solid", colors: [translucent.reduceRight((acc, t) => colorOver(t, acc), hexToRgb(bgHex || "#ffffff"))] };
}

/** Ratios of one text item against the pixels of the text-mask canvas. */
function maskRatios(mask, S, it, fg, painted) {
  const ms = mask.width / S.W;
  const g = mask.getContext("2d", { willReadFrequently: true });
  const fgL = lumOf(fg.r, fg.g, fg.b);
  const ratios = [];
  it.rects.forEach((r) => {
    const x = Math.max(0, Math.floor(r.x * ms));
    const y = Math.max(0, Math.floor(r.y * ms));
    const w = Math.min(mask.width - x, Math.max(1, Math.ceil(r.w * ms)));
    const h = Math.min(mask.height - y, Math.max(1, Math.ceil(r.h * ms)));
    if (w <= 0 || h <= 0) return;
    const d = g.getImageData(x, y, w, h).data;
    const ink = painted && painted.getContext('2d', { willReadFrequently: true }).getImageData(x, y, w, h).data;
    const step = Math.max(1, Math.floor((w * h) / 500));
    for (let p = 0; p < w * h; p += step) {
      const o = p * 4;
      if (d[o + 3] < 8) continue;
      if (ink && Math.max(Math.abs(ink[o] - d[o]), Math.abs(ink[o + 1] - d[o + 1]), Math.abs(ink[o + 2] - d[o + 2])) < 24) continue;
      ratios.push(lumRatio(fgL, lumOf(d[o], d[o + 1], d[o + 2])));
    }
  });
  return ratios;
}

function summarizeRatios(ratios, decile) {
  const s = ratios.slice().sort((a, b) => a - b);
  return {
    min: s[0],
    decile: s[Math.min(s.length - 1, Math.floor(s.length * decile))],
    mean: s.reduce((a, b) => a + b, 0) / s.length
  };
}

/** Contrast of every text item of one slide. Uses CS.paint.textMask when it
 *  exists (pixel path) and the DOM background otherwise. */
async function measureSlide(S, decile) {
  let mask = null;
  const paint = CS.paint;
  if (paint && typeof paint.textMask === "function") {
    try {
      mask = await paint.textMask(S.el);
      mask.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, 1, 1);
    } catch (e) {
      mask = null;
    }
  }
  let painted = null;
  if (mask && paint && typeof paint.toCanvas === 'function') {
    try { painted = await paint.toCanvas(S.el, { scale: 1 }); } catch (e) {}
  }
  const items = [];
  collectTexts(S).forEach((it) => {

    /* the oversized ghost numeral is ornament behind the copy (the item's title carries its meaning): it is meant to be faint */
    if (S.el.getAttribute("data-variant") === "ghost-number" && it.el.closest(".cs-ord")) return;
    const fg0 = parseCssColor(it.cs.color);
    if (!fg0) return;
    let res = null;
    let kind = "dom";
    if (mask) {
      try {
        const rs = maskRatios(mask, S, it, fg0, painted);
        if (rs.length) {
          res = summarizeRatios(rs, decile);
          kind = "pixel";
        }
      } catch (e) {
        res = null;
      }
    }
    if (!res) {
      const bg = domBackground(it.el, S);
      if (bg.kind === "image" || !bg.colors.length) {
        kind = "unknown";
      } else {
        const rs = bg.colors.map((c) => lumRatio(lumOf(fg0.r, fg0.g, fg0.b), lumOf(c.r, c.g, c.b)));
        res = summarizeRatios(rs, 0);
        res.mean = rs.reduce((a, b) => a + b, 0) / rs.length;
        kind = bg.kind;
      }
    }
    items.push({
      key: it.key,
      fontPx: it.fontPx,
      weight: it.weight,
      role: it.role,
      res,
      kind
    });
  });
  return items;
}

function isLargeText(fontPx, weight, p) {
  return fontPx >= p.largeMinPx || (fontPx >= p.largeBoldMinPx && weight >= 700);
}

async function gateD4(rc) {
  const out = rc.out;
  const p = param(rc, "D4.contrast");
  for (let i = 0; i < rc.S.length; i++) {
    const S = rc.S[i];
    if (rc.signal && rc.signal.aborted) throw qaError("E_ABORTED", "QA aborted");
    const items = await measureSlide(S, p.decile);
    const byKey = {};
    items.forEach((it) => {
      const large = isLargeText(it.fontPx, it.weight, p);
      const cur = byKey[it.key];
      if (!cur || (it.res && (!cur.res || it.res.decile < cur.res.decile))) byKey[it.key] = Object.assign({}, it, { large });
    });
    Object.keys(byKey).forEach((key) => {
      const it = byKey[key];
      if (!it.res) {
        if (it.kind === "unknown" && active(rc, "D4.unmeasured", S.slide)) emit(rc, out, "D4.unmeasured", { slide: S.id, el: key, vars: { el: key } });
        return;
      }
      const need = it.large ? p.large : p.body;
      const ratio = it.res.decile;
      const vars = { el: key, ratio: fmt1(ratio), need: fmt1(need) };
      if (ratio < p.hardBlockBelow) {
        if (active(rc, "D4.hard", S.slide)) emit(rc, out, "D4.hard", { slide: S.id, el: key, vars });
      } else if (ratio < need && active(rc, "D4.contrast", S.slide)) {
        emit(rc, out, "D4.contrast", { slide: S.id, el: key, vars });
      }
    });
  }
}



/* ------------------------------------------------------------------- D5 */
function firstFamily(cssFamily) {
  const m = /^\s*(?:"([^"]+)"|'([^']+)'|([^,]+))/.exec(cssFamily || "");
  return m ? (m[1] || m[2] || m[3] || "").trim() : "";
}

/** Loaded faces of `family` (FontFace objects), or null when none are known. */
function loadedFaces(family) {
  const faces = [];
  try {
    document.fonts.forEach((f) => {
      if (firstFamily(f.family) === family && f.status === "loaded") faces.push(f);
    });
  } catch (e) {
    return null;
  }
  return faces.length ? faces : null;
}

const faceUpper = (f) => {
  const m = String(f.weight).match(/[0-9]+/g);
  if (!m) return /bold/.test(String(f.weight)) ? 700 : 400;
  return Math.max.apply(null, m.map(Number));
};

/** True when the engine resolved this family (tokens.fonts) or its face failed
 *  to load, yet no loaded @font-face backs it: the browser is substituting. */
function lacksLoadedFace(rc, family) {
  if (loadedFaces(family)) return false;
  let failed = false;
  try {
    document.fonts.forEach((f) => {
      if (firstFamily(f.family) === family && f.status === "error") failed = true;
    });
  } catch (e) {
    failed = false;
  }
  return failed || fontIdByFamily(rc, family) !== null;
}

function fontIdByFamily(rc, family) {
  const reg = CS.core && CS.core.registry;
  if (!reg || typeof reg.fontCss !== "function") return null;
  const ids = (rc.tokens && rc.tokens.fonts) || [];
  for (let i = 0; i < ids.length; i++) {
    try {
      if (firstFamily(reg.fontCss(ids[i])) === family) return ids[i];
    } catch (e) {

      /* unknown id */
    }
  }
  return null;
}

function gateD5(rc) {
  const out = rc.out;
  const arabicType = TX().arabic;
  let kashidaWords = 0;
  const kashidaSeen = new Set();
  const fontsUsed = new Set();
  const marksBySlot = {};
  rc.S.forEach((S) => {
    const reported = new Set();
    const once = (id, key) => {
      const k = id + "|" + key;
      if (reported.has(k)) return false;
      reported.add(k);
      return true;
    };
    collectTexts(S).forEach((it) => {
      if (!hasArabic(it.text)) return;
      const cs = it.cs;
      const base = { slide: S.id, el: it.key, vars: { el: it.key } };
      const fam = firstFamily(cs.fontFamily);
      fontsUsed.add(fam);

      if (parseFloat(cs.letterSpacing) && active(rc, "D5.letter-spacing", S.slide) && once("D5.letter-spacing", it.key)) emit(rc, out, "D5.letter-spacing", base);
      const justified = cs.textAlign === "justify" || cs.textAlignLast === "justify";
      if (justified && active(rc, "D5.justify", S.slide) && once("D5.justify", it.key)) emit(rc, out, "D5.justify", base);
      if (/italic|oblique/.test(cs.fontStyle) && active(rc, "D5.italic", S.slide) && once("D5.italic", it.key)) emit(rc, out, "D5.italic", base);

      if (active(rc, "D5.font-synthesis", S.slide) && it.weight >= 600) {
        const syn = cs.fontSynthesis || cs.getPropertyValue("font-synthesis") || "";
        const faces = loadedFaces(fam);
        if (/weight/.test(syn) && faces && !faces.some((f) => faceUpper(f) >= 600) && once("D5.font-synthesis", it.key)) {
          emit(rc, out, "D5.font-synthesis", base);
        }
      }

      if (active(rc, "D5.text-opacity", S.slide)) {
        const col = parseCssColor(cs.color);
        let bad = !!(col && col.a < 1);
        for (let e = it.el; e && !bad; e = e.parentElement) {
          if (e.getAttribute && (e.getAttribute("data-m-group") === "opacity" || e.getAttribute("aria-hidden") === "true")) break;
          if (parseFloat(getComputedStyle(e).opacity) < 1) bad = true;
          if (e === S.el) break;
        }
        if (bad && once("D5.text-opacity", it.key)) emit(rc, out, "D5.text-opacity", base);
      }

      if (it.text.indexOf("\u0640") >= 0 && connectorTatweels(it.el.closest('[data-cs-bind="clitic"]')?.textContent || it.text).includes("\u0640")) {
        it.text.split(/\s+/).forEach((w) => {
          if (w.indexOf("\u0640") < 0) return;
          if (/^[^\u0640]*[\u0644\u0628\u0643]\u0640([^\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\u0640][^\u0640]*)?$/.test(w)) return; // ORTHO-BIDI-001: a clitic before Latin, a digit or a mark
          const id = S.id + "|" + w;
          if (!kashidaSeen.has(id)) {
            kashidaSeen.add(id);
            kashidaWords++;
          }
          const isHeadline = (S.type === "cover" || S.type === "poster") && /\.headline$/.test(it.key);
          if (!isHeadline && active(rc, "D5.kashida-body", S.slide) && once("D5.kashida-body", it.key)) emit(rc, out, "D5.kashida-body", base);
          const kashidaRule = rc.tokens && rc.tokens.decor && rc.tokens.decor.kashida;
          if (kashidaRule && kashidaRule.allowed === false && active(rc, "D5.kashida-preset", S.slide) && once("D5.kashida-preset", it.key)) {
            emit(rc, out, "D5.kashida-preset", base);
          }
          if (arabicType && typeof arabicType.joiningType === "function" && active(rc, "D5.kashida-joining", S.slide)) {
            const cps = Array.from(w);
            for (let i = 0; i < cps.length; i++) {
              if (cps[i] !== "\u0640") continue;
              let a = i - 1;
              while (a >= 0 && (cps[a] === "\u0640" || arabicType.joiningType(cps[a].codePointAt(0)) === "T")) a--;
              let b = i + 1;
              while (b < cps.length && (cps[b] === "\u0640" || arabicType.joiningType(cps[b].codePointAt(0)) === "T")) b++;
              const jb = a >= 0 ? arabicType.joiningType(cps[a].codePointAt(0)) : "U";
              const ja = b < cps.length ? arabicType.joiningType(cps[b].codePointAt(0)) : "U";
              if (!(jb === "D" && (ja === "D" || ja === "R")) && once("D5.kashida-joining", it.key)) {
                emit(rc, out, "D5.kashida-joining", base);
                break;
              }
            }
          }
        });
      }

      if (active(rc, "D5.glyph-missing", S.slide)) {
        const id = fontIdByFamily(rc, fam);
        const reg = CS.core && CS.core.registry;
        if (id && reg && typeof reg.missingGlyphs === "function") {
          try {
            const miss = reg.missingGlyphs(id, it.text).filter((c) => !INVISIBLE_CODES.has(c));
            if (miss.length && once("D5.glyph-missing", it.key)) {
              emit(rc, out, "D5.glyph-missing", {
                slide: S.id,
                el: it.key,
                vars: { el: it.key, text: miss.slice(0, 6).map((c) => String.fromCodePoint(c)).join(" ") }
              });
            }
          } catch (e) {

            /* font not in the registry: nothing to compare against */
          }
        }
      }

      if (active(rc, "D5.fallback-font", S.slide) && fam && lacksLoadedFace(rc, fam) && once("D5.fallback-font", it.key)) {
        emit(rc, out, "D5.fallback-font", { slide: S.id, el: it.key, vars: { el: it.key, font: fam } });
      }

      const t = marksBySlot[S.id + "|" + it.key] || (marksBySlot[S.id + "|" + it.key] = { slide: S.id, key: it.key, letters: 0, marks: 0 });
      t.letters += (it.text.match(new RegExp("[" + AR_L + "]", "g")) || []).length;
      t.marks += (it.text.match(/[\u064B-\u0652\u0670]/g) || []).length;
    });
  });
  if (active(rc, "D5.tashkeel")) {
    const p = param(rc, "D5.tashkeel");
    Object.keys(marksBySlot).forEach((k) => {
      const t = marksBySlot[k];
      if (t.letters >= p.minLetters && t.marks / t.letters >= p.ratio) emit(rc, out, "D5.tashkeel", { slide: t.slide, el: t.key, vars: { el: t.key } });
    });
  }
  if (active(rc, "D5.kashida-count") && kashidaWords > param(rc, "D5.kashida-count").max) {
    emit(rc, out, "D5.kashida-count", { vars: { count: kashidaWords, max: param(rc, "D5.kashida-count").max } });
  }
  rc.fontsUsed = fontsUsed;
}

/* ------------------------------------------------------------------- D6 */


/** Slots whose visual lines D6.lines counts, by slide type (default: body). */
const LINE_SLOTS = {
  cover: ["headline"],
  poster: ["headline"],
  rehook: ["headline", "sub"],
  cta: ["title", "body"],
  checklist: ["title", "bullets"],
  summary: ["title", "bullets"]
};

function slotWordRects(S, slotName, skipAnchor) {
  const slot = S.el.querySelector('[data-slot="' + slotName + '"]');
  if (!slot) return [];
  const words = slot.querySelectorAll(".w");
  const rects = [];
  Array.prototype.forEach.call(words, (w) => {

    /* a leading numeral set as a block-level anchor ("number" cover, "big-number" re-hook) is a graphic, not a line of copy */
    const run = skipAnchor && w.getAttribute("data-w") === "0" && (w.querySelector('.cs-ltr[data-run="number"]') || w.closest('.cs-ltr[data-run="number"]'));
    if (run && run.textContent.trim() === w.textContent.trim() && getComputedStyle(run).display === "block") return;
    const r = S.rel(w.getBoundingClientRect());
    if (r.w > 0 && r.h > 0) rects.push(r);
  });
  return rects;
}

function gateD6(rc) {
  const out = rc.out;
  const families = new Set();
  rc.S.forEach((S) => {
    const texts = collectTexts(S);
    const cover = S.type === "cover" || S.type === "poster";
    if (active(rc, "D6.orphan-connector", S.slide)) {
      const p = param(rc, "D6.orphan-connector"), checked = new Set();
      S.el.querySelectorAll('.cs-content [data-slot][data-kind="text"]').forEach(slot => {
        const key = domKey(S, slot), words = Array.from(slot.querySelectorAll('.w'));
        if (checked.has(key) || hiddenWithin(slot, S.el)) return;
        checked.add(key);
        const rects = words.map((w, i) => Object.assign(S.rel(w.getBoundingClientRect()), { text: w.textContent, order: i })).filter(r => r.w > 0 && r.h > 0);
        const lines = groupLines(rects);
        const orphan = lines.some((line, i) => {
          const last = line.rects.reduce((a, b) => a.order > b.order ? a : b), t = last.text.replace(/[ً-ٰٟ]/g, '');
          return /^[\u0621-\u064A]+$/.test(t) && (t.length <= p.maxLetters || p.connectors.includes(t)) && (i < lines.length - 1 || line.words === 1 && lines.length > 1);
        });
        if (orphan) emit(rc, out, "D6.orphan-connector", { slide: S.id, el: key, vars: { el: key } });
      });
    }
    texts.forEach((it) => {
      if (hasArabic(it.text)) families.add(firstFamily(it.cs.fontFamily));
    });

    if (cover && active(rc, "D6.headline-width", S.slide) && S.tokens && S.tokens.layout && S.tokens.layout.headlineWidth) {
      const p = param(rc, "D6.headline-width");
      const lines = groupLines(slotWordRects(S, "headline"));
      if (lines.length) {
        const share = Math.max.apply(null, lines.map((l) => l.width)) / p.contentWidth;
        const lo = S.tokens.layout.headlineWidth[0];
        const hi = S.tokens.layout.headlineWidth[1];
        if (share < lo - p.tolerance || share > hi + p.tolerance) {
          emit(rc, out, "D6.headline-width", {
            slide: S.id,
            el: S.id + ".headline",
            vars: { pct: Math.round(share * 100), min: Math.round(lo * 100), max: Math.round(hi * 100) }
          });
        }
      }
    }

    if (active(rc, "D6.lone-word", S.slide)) {
      const p = param(rc, "D6.lone-word");
      ["headline", "title", "body", "sub"].forEach((name) => {
        const lines = groupLines(slotWordRects(S, name));
        if (lines.length < 2) return;
        const widest = Math.max.apply(null, lines.map((l) => l.width));
        const last = lines[lines.length - 1];
        if (last.words === 1 && last.width < p.minShare * widest) {
          emit(rc, out, "D6.lone-word", { slide: S.id, el: S.id + "." + name, vars: { el: S.id + "." + name } });
        }
      });
    }

    if (active(rc, "D6.lines", S.slide)) {
      const lim = param(rc, "D6.lines").limits;
      const slots = LINE_SLOTS[S.type] || ["body"];
      const rects = [];
      slots.forEach((name) => slotWordRects(S, name, true).forEach((r) => rects.push(r)));
      const count = groupLines(rects).length;
      const max = lim[S.type] !== undefined ? lim[S.type] : lim.default;
      if (count > max) emit(rc, out, "D6.lines", { slide: S.id, el: S.id, vars: { count, max } });
    }

    if (cover && active(rc, "D6.rows", S.slide)) {
      const rects = [];
      texts.forEach((it) => {
        if (!it.chrome) it.rects.forEach((r) => rects.push(r));
      });
      const rows = groupLines(rects).length;
      const max = param(rc, "D6.rows").max;
      if (rows > max) emit(rc, out, "D6.rows", { slide: S.id, el: S.id, vars: { count: rows, max } });
    }

    if (active(rc, "D6.latin-match", S.slide)) {
      const tol = param(rc, "D6.latin-match").weightTolerance;
      const reported = new Set();
      Array.prototype.forEach.call(S.el.querySelectorAll('.cs-ltr[data-run="latin"]'), (run) => {
        if (hiddenWithin(run, S.el)) return;
        const slot = run.closest("[data-slot]");
        if (!slot) return;
        const words = Array.prototype.slice.call(slot.querySelectorAll(".w")).filter((w) => !run.contains(w) && !w.contains(run) && hasArabic(w.textContent));
        if (!words.length) return;
        const before = words.filter((w) => w.compareDocumentPosition(run) & Node.DOCUMENT_POSITION_FOLLOWING);
        const neighbour = before.length ? before[before.length - 1] : words[0];
        const a = getComputedStyle(run);
        const b = getComputedStyle(neighbour);
        const sameState = !!run.closest("mark") === !!neighbour.closest("mark");
        const key = domKey(S, run);
        if (sameState && (Math.abs((parseInt(a.fontWeight, 10) || 400) - (parseInt(b.fontWeight, 10) || 400)) > tol || a.color !== b.color) && !reported.has(key)) {
          reported.add(key);
          emit(rc, out, "D6.latin-match", { slide: S.id, el: key, vars: { text: run.textContent, el: key } });
        }
      });
    }
  });

  if (active(rc, "D6.families")) {
    families.delete("");
    const max = param(rc, "D6.families").max;
    if (families.size > max) emit(rc, out, "D6.families", { vars: { count: families.size, max } });
  }
}



/* ------------------------------------------------------------------- D7 */
function gateD7(rc) {
  const out = rc.out;
  const t = rc.tokens;
  if (!t) return;
  const prov = t.provenance;
  if (isObj(prov) && active(rc, "D7.no-brand")) {
    const fromBrand = Object.keys(prov).some((k) => prov[k] === "brand");
    if (!fromBrand) emit(rc, out, "D7.no-brand", {});
  }
  if (isObj(prov) && active(rc, "D7.default-fonts") && t.type) {
    const list = param(rc, "D7.default-fonts").families;
    const seen = new Set();
    [["display", "type.display.family"], ["heading", "type.heading.family"], ["body", "type.body.family"]].forEach((pair) => {
      const f = t.type[pair[0]] && t.type[pair[0]].family;
      if (f && list.indexOf(f) >= 0 && prov[pair[1]] !== "brand" && !seen.has(f)) {
        seen.add(f);
        emit(rc, out, "D7.default-fonts", { vars: { font: f } });
      }
    });
  }
  if (active(rc, "D7.default-layout") && rc.slides.length) {
    const defaults = rc.slides.filter((s) => {
      const list = t.variants && t.variants[s.type];
      const plain = !s.variant || (Array.isArray(list) && list.length && s.variant === list[0]);
      return !CS.visual?.free?.active(s) && plain && !(isObj(s.overrides) && Object.keys(s.overrides).length);
    }).length;
    const share = defaults / rc.slides.length;
    if (share > param(rc, "D7.default-layout").share) emit(rc, out, "D7.default-layout", { vars: { pct: Math.round(share * 100) } });
  }
}

/* ------------------------------------------------------------------- T1 */


/** Hero size and local contrast of a cover at thumbnail size. */
async function thumbnailOf(slideEl, tokens, ctxLike) {
  const spec = (ctxLike && ctxLike.spec) || { canvas: {}, slides: [] };
  const thumbW = ctxLike && ctxLike.R ? param(ctxLike, "T1.hero-small").widthPx : 130;
  const S = slideInfo({ el: slideEl, id: slideEl.getAttribute("data-cs-slide") || "", tokens }, { spec, tokens });
  const hero = slideEl.querySelector('[data-slot="headline"]') || slideEl.querySelector('[data-role="hero"]');
  if (!hero) return { heroPx: 0, pass: false, fix: false, localContrast: 0 };
  const heroPx = (parseFloat(getComputedStyle(hero).fontSize) || 0) * (thumbW / S.W);
  const items = (await measureSlide(S, 0.1)).filter((it) => it.role === "hero" || it.key.indexOf(".headline") > 0);
  const means = items.filter((it) => it.res).map((it) => it.res.mean);
  const localContrast = means.length ? Math.min.apply(null, means) : 0;
  const pass = heroPx >= 14;
  return { heroPx: Math.round(heroPx * 100) / 100, pass, fix: !pass && heroPx >= 11.5, localContrast: Math.round(localContrast * 100) / 100 };
}

async function gateT1(rc) {
  const out = rc.out;
  const cover = rc.S.find((S) => S.type === "cover" || S.type === "poster");
  if (!cover) return;
  const p = param(rc, "T1.hero-small");
  const info = await thumbnailOf(cover.el, cover.tokens, rc);
  rc.thumbnail = info;
  if (info.heroPx >= p.fixMin && info.heroPx < p.pass && active(rc, "T1.hero-small", cover.slide)) {
    emit(rc, out, "T1.hero-small", { slide: cover.id, el: cover.id + ".headline", vars: { px: fmt1(info.heroPx), min: p.pass } });
  }
  const lc = param(rc, "T1.local-contrast").min;
  if (info.localContrast > 0 && info.localContrast < lc && active(rc, "T1.local-contrast", cover.slide)) {
    emit(rc, out, "T1.local-contrast", { slide: cover.id, el: cover.id + ".headline", vars: { ratio: fmt1(info.localContrast), min: lc } });
  }
}



/* ------------------------------------------------------- B1 (rendered) */
function gateB1Rendered(rc) {
  const out = rc.out;
  if (rc.dialect === "en") return;
  rc.S.forEach((S) => {
    const reported = new Set();
    if (active(rc, "B1.unbound-pair", S.slide)) {
      const labels = bindLabelSet(rc.bundle), number = /^[0-9٠-٩]+(?:[.,٫][0-9٠-٩]+)*[%٪]?$/;
      S.el.querySelectorAll('.cs-content [data-slot][data-kind="text"]').forEach(slot => {
        const words = Array.from(slot.querySelectorAll('.w'));
        words.forEach((a, i) => {
          const b = words[i + 1]; if (!b) return;
          const x = a.textContent.trim(), y = b.textContent.trim();
          const pair = number.test(x) && /^[\u0621-\u064A]/.test(y) || labels.has(x) && number.test(y) || /^[A-Za-z][A-Za-z0-9._-]*$/.test(x) && number.test(y);
          if (!pair) return;
          // The big numeral of a number cover is a line of its own by design.
          const run = a.closest('[data-run="number"]') || a.querySelector('[data-run="number"]');
          if (i === 0 && (run && getComputedStyle(run).display === "block" || S.el.getAttribute("data-type") === "cover" && S.el.getAttribute("data-variant") === "number")) return;
          const ra = S.rel(a.getBoundingClientRect()), rb = S.rel(b.getBoundingClientRect()), key = domKey(S, slot);
          if (Math.abs(ra.y + ra.h / 2 - rb.y - rb.h / 2) > Math.min(ra.h, rb.h) / 2 && !reported.has(key)) {
            reported.add(key); emit(rc, out, "B1.unbound-pair", { slide: S.id, el: key });
          }
        });
      });
    }
    if (active(rc, "B1.isolation", S.slide)) {
      Array.prototype.forEach.call(S.el.querySelectorAll(".cs-ltr"), (run) => {
        if (hiddenWithin(run, S.el)) return;
        const rects = Array.prototype.filter.call(run.getClientRects(), (r) => r.width > 0.5 && r.height > 0.5).map((r) => S.rel(r));
        // A phrase may wrap inside its isolate; atomic URLs/numbers may not.
        const atomic = run.getAttribute('data-run') !== 'latin' || !/[ \u00A0]/.test(run.textContent);
        if (atomic && rects.length > 1 && groupLines(rects).length > 1) {
          const key = domKey(S, run);
          if (!reported.has(key + run.textContent)) {
            reported.add(key + run.textContent);
            emit(rc, out, "B1.isolation", { slide: S.id, el: key, vars: { text: run.textContent } });
          }
        }
      });
      Array.prototype.forEach.call(S.el.querySelectorAll(".w"), (a) => {
        const n = a.nextSibling;
        const b = n && n.nodeType === 3 && n.nodeValue === "\u00A0" ? n.nextSibling : null;
        if (!b || b.nodeType !== 1 || !b.classList.contains("w") || hiddenWithin(a, S.el)) return;
        const ra = S.rel(a.getBoundingClientRect());
        const rb = S.rel(b.getBoundingClientRect());
        if (Math.abs(ra.y + ra.h / 2 - (rb.y + rb.h / 2)) > Math.min(ra.h, rb.h) * 0.5) {
          const key = domKey(S, a);
          if (!reported.has(key + a.textContent)) {
            reported.add(key + a.textContent);
            emit(rc, out, "B1.isolation", { slide: S.id, el: key, vars: { text: a.textContent + " " + b.textContent } });
          }
        }
      });
    }
    if (active(rc, "B1.raw-ltr", S.slide)) {
      collectTexts(S).forEach((it) => {
        if (it.el.closest(".cs-ltr") || it.el.closest(".cs-emoji")) return;
        const m = /[A-Za-z\u00C0-\u024F]+/.exec(it.text);
        if (m && hasArabic(it.el.closest("[data-slot]") ? it.el.closest("[data-slot]").textContent : it.text) && !reported.has("raw" + it.key)) {
          reported.add("raw" + it.key);
          emit(rc, out, "B1.raw-ltr", { slide: S.id, el: it.key, vars: { text: m[0] } });
        }
      });
    }
  });
}



/* ------------------------------------------------------------ entry point */
async function runRenderedGates(input, opts) {
  opts = opts || {};
  const base = buildContext(input, opts);
  const deck = input.deck;
  const tokens = input.tokens || (deck && deck.tokens) || null;
  const g = base.bundle.platform && base.bundle.platform.geometry;
  const rc = Object.assign(base, {
    out: [],
    tokens,
    signal: opts.signal || null,
    geometry: g || {},
    S: [],
    thumbnail: null
  });
  if (typeof document === "undefined") throw qaError("E_USAGE", "Rendered gates need a browser DOM");
  rc.S = ((deck && deck.slides) || []).filter((sr) => sr && sr.el).map((sr) => slideInfo(sr, rc));

  const step = async (id, fn, selected) => {
    if (!selected && !wantGate(rc, id)) return;
    if (rc.signal && rc.signal.aborted) throw qaError("E_ABORTED", "QA aborted");
    countGate(rc, id);
    await fn(rc, rc.out);
  };
  await step("D1", gateD1Render);
  await step("D2", gateD2);
  await step("D3", gateD3);
  await step("D4", gateD4);
  await step("D5", gateD5);
  await step("D6", gateD6);
  await step("D7", gateD7);
  await step("T1", gateT1);
  await step("B1", gateB1Rendered);
  await step("A1", gateA1);
  for (const g of extraGates("rendered", rc)) {
    await step(g.id, async () => rc.out.push(...(await g.run(rc) || [])), true);
  }
  return rc;
}

  /* ---- file: metrics.js ---- */
/* Carousel Studio · cs-qa · pixel metrics
 *
 * SSIM and PSNR for the loop check of gate V1 (frame 0 against the poster,
 * last frame against frame 0). Accepts canvases, ImageData and plain
 * { data, width, height } objects, so the same code runs in the Studio and
 * in tests.
 */
/* Pixel comparisons and painted glyph bounds for QA. */
function pixelsOf(src) {
  if (!src) throw qaError("E_USAGE", "metrics need an image");
  if (src.data && src.width && src.height) return src;
  if (typeof src.getContext === "function") {
    const g = src.getContext("2d", { willReadFrequently: true });
    return g.getImageData(0, 0, src.width, src.height);
  }
  throw qaError("E_USAGE", "unsupported image type for metrics");
}


/** Peak signal-to-noise ratio over the RGB channels, in dB (99 when identical). */
function psnrOf(a, b) {
  const A = pixelsOf(a);
  const B = pixelsOf(b);
  if (A.width !== B.width || A.height !== B.height) return 0;
  const n = A.width * A.height;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const dr = A.data[o] - B.data[o];
    const dg = A.data[o + 1] - B.data[o + 1];
    const db = A.data[o + 2] - B.data[o + 2];
    sum += dr * dr + dg * dg + db * db;
  }
  const mse = sum / (n * 3);
  return mse === 0 ? 99 : 10 * Math.log10((255 * 255) / mse);
}

function grayOf(img) {
  const n = img.width * img.height;
  const g = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    g[i] = 0.299 * img.data[o] + 0.587 * img.data[o + 1] + 0.114 * img.data[o + 2];
  }
  return g;
}


/** Mean SSIM of the luma channel over 8x8 blocks (1 when identical). */
function ssimOf(a, b) {
  const A = pixelsOf(a);
  const B = pixelsOf(b);
  if (A.width !== B.width || A.height !== B.height) return 0;
  const ga = grayOf(A);
  const gb = grayOf(B);
  const C1 = (0.01 * 255) * (0.01 * 255);
  const C2 = (0.03 * 255) * (0.03 * 255);
  const W = A.width;
  const H = A.height;
  const N = 8;
  let total = 0;
  let blocks = 0;
  for (let by = 0; by + N <= H; by += N) {
    for (let bx = 0; bx + N <= W; bx += N) {
      let sa = 0;
      let sb = 0;
      let saa = 0;
      let sbb = 0;
      let sab = 0;
      for (let y = 0; y < N; y++) {
        const row = (by + y) * W + bx;
        for (let x = 0; x < N; x++) {
          const va = ga[row + x];
          const vb = gb[row + x];
          sa += va;
          sb += vb;
          saa += va * va;
          sbb += vb * vb;
          sab += va * vb;
        }
      }
      const cnt = N * N;
      const ma = sa / cnt;
      const mb = sb / cnt;
      const va = saa / cnt - ma * ma;
      const vb = sbb / cnt - mb * mb;
      const cov = sab / cnt - ma * mb;
      total += ((2 * ma * mb + C1) * (2 * cov + C2)) / ((ma * ma + mb * mb + C1) * (va + vb + C2));
      blocks++;
    }
  }
  return blocks ? total / blocks : 1;
}


/** V1 loop check: worst SSIM and PSNR of (frame 0 vs poster) and (last frame
 *  vs frame 0). Thresholds come from the V1.loop check when rules are loaded. */
function loopCheckOf(frame0, last, poster) {
  let ssimMin = 0.995;
  let psnrMin = 45;
  try {
    const p = loadRules().checks["V1.loop"].def.params;
    ssimMin = p.ssim;
    psnrMin = p.psnr;
  } catch (e) {

    /* rules not registered: use the platform defaults above */
  }
  const pairs = [[frame0, poster], [last, frame0]];
  let ssim = 1;
  let psnr = 99;
  pairs.forEach((p) => {
    ssim = Math.min(ssim, ssimOf(p[0], p[1]));
    psnr = Math.min(psnr, psnrOf(p[0], p[1]));
  });
  return { ssim: Math.round(ssim * 100000) / 100000, psnr: Math.round(psnr * 100) / 100, ok: ssim >= ssimMin && psnr >= psnrMin };
}

function glyphInk(S, c, text, r) {
  const g = S._ink || (S._ink = document.createElement("canvas").getContext("2d"));
  g.font = c.fontStyle + " " + c.fontWeight + " " + c.fontSize + " " + c.fontFamily;
  g.direction = c.direction; g.textAlign = "left";
  const m = g.measureText(text);
  if (!Number.isFinite(m.fontBoundingBoxAscent) || !Number.isFinite(m.actualBoundingBoxAscent)) return r;
  return { x: r.x - m.actualBoundingBoxLeft, y: r.y + m.fontBoundingBoxAscent - m.actualBoundingBoxAscent,
    w: m.actualBoundingBoxLeft + m.actualBoundingBoxRight, h: m.actualBoundingBoxAscent + m.actualBoundingBoxDescent };
}

  /* ---- file: mp4.js ---- */
/* Carousel Studio · cs-qa · MP4 inspection
 *
 * A small ISO-BMFF reader that fills a VideoInfo (CONTRACT 4.4) from the bytes
 * of an exported cover: box order (faststart), track size, frame count and
 * rate, keyframes, codec string, audio track and author-style metadata atoms.
 * It does not decode video, so closed-GOP and blank-frame facts stay unknown
 * and are left to the exporter or to check_video.mjs.
 */

const MP4_CONTAINERS = { moov: 1, trak: 1, mdia: 1, minf: 1, stbl: 1, udta: 1, ilst: 1, edts: 1, dinf: 1, mvex: 1 };
const MP4_PERSONAL = ["\u00A9ART", "\u00A9aut", "\u00A9cpy", "\u00A9own", "\u00A9wrt", "auth", "perf", "cprt"];

function inspectMp4(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const cc4 = (o) => String.fromCharCode(bytes[o], bytes[o + 1], bytes[o + 2], bytes[o + 3]);
  const u32 = (o) => dv.getUint32(o);
  const u16 = (o) => dv.getUint16(o);
  const res = {
    ok: false,
    topBoxes: [],
    personalAtoms: [],
    moovBeforeMdat: undefined,
    tracks: [],
    brand: ""
  };
  let track = null;

  function walk(start, end, depth) {
    let o = start;
    while (o + 8 <= end) {
      let size = u32(o);
      const type = cc4(o + 4);
      let head = 8;
      if (size === 1 && o + 16 <= end) {
        size = u32(o + 8) * 4294967296 + u32(o + 12);
        head = 16;
      } else if (size === 0) {
        size = end - o;
      }
      if (size < head || o + size > end) break;
      const body = o + head;
      const stop = o + size;
      if (depth === 0) res.topBoxes.push(type);
      if (MP4_PERSONAL.indexOf(type) >= 0) res.personalAtoms.push(type);
      if (type === "ftyp") res.brand = cc4(body);
      if (type === "trak") {
        track = { handler: "", width: 0, height: 0, frames: 0, timescale: 0, duration: 0, deltas: [], sync: null, format: "", profile: null };
        res.tracks.push(track);
      }
      if (track) leaf(type, body, stop);
      if (type === "meta") walk(body + 4, stop, depth + 1);
      else if (MP4_CONTAINERS[type]) walk(body, stop, depth + 1);
      o += size;
    }
  }

  function leaf(type, b, stop) {
    if (type === "tkhd") {
      const v = bytes[b];
      track.width = Math.round(u32(b + (v === 1 ? 88 : 76)) / 65536);
      track.height = Math.round(u32(b + (v === 1 ? 92 : 80)) / 65536);
    } else if (type === "mdhd") {
      const v = bytes[b];
      track.timescale = u32(b + (v === 1 ? 20 : 12));
      track.duration = v === 1 ? u32(b + 24) * 4294967296 + u32(b + 28) : u32(b + 16);
    } else if (type === "hdlr") {
      track.handler = cc4(b + 8);
    } else if (type === "stts") {
      const n = u32(b + 4);
      for (let i = 0; i < n && b + 8 + i * 8 + 8 <= stop; i++) {
        track.deltas.push({ count: u32(b + 8 + i * 8), delta: u32(b + 12 + i * 8) });
      }
    } else if (type === "stsz") {
      track.frames = u32(b + 8);
    } else if (type === "stss") {
      const n = u32(b + 4);
      track.sync = [];
      for (let i = 0; i < n && b + 8 + i * 4 + 4 <= stop; i++) track.sync.push(u32(b + 8 + i * 4));
    } else if (type === "stsd") {
      const e = b + 8;
      track.format = cc4(e + 4);
      if (track.format === "avc1" || track.format === "avc3") {
        let o = e + 86;
        while (o + 8 <= stop) {
          const sz = u32(o);
          if (sz < 8) break;
          if (cc4(o + 4) === "avcC") {
            track.profile = { profile: bytes[o + 9], compat: bytes[o + 10], level: bytes[o + 11] };
            break;
          }
          o += sz;
        }
      }
    }
  }

  try {
    walk(0, bytes.length, 0);
  } catch (e) {
    return res;
  }
  const iMoov = res.topBoxes.indexOf("moov");
  const iMdat = res.topBoxes.indexOf("mdat");
  res.moovBeforeMdat = iMoov >= 0 && iMdat >= 0 ? iMoov < iMdat : undefined;
  res.ok = iMoov >= 0 && res.tracks.length > 0;
  return res;
}

/** VideoInfo (CONTRACT 4.4) derived from the bytes of an MP4. */
function videoInfoFromMp4(bytes) {
  const m = inspectMp4(bytes);
  const v = m.tracks.find((t) => t.handler === "vide");
  const info = { codec: undefined, moovBeforeMdat: m.moovBeforeMdat, audio: m.tracks.some((t) => t.handler === "soun") ? "silent-aac" : "none" };
  if (!v) return info;
  const hex2 = (n) => ("0" + n.toString(16)).slice(-2);
  info.width = v.width;
  info.height = v.height;
  info.frames = v.frames;
  info.seconds = v.timescale ? v.duration / v.timescale : undefined;
  info.fps = info.seconds ? v.frames / info.seconds : undefined;
  info.constantRate = v.deltas.length <= 1;
  info.codec = v.profile ? v.format + "." + hex2(v.profile.profile) + hex2(v.profile.compat) + hex2(v.profile.level) : v.format;
  info.keyframeAtZero = v.sync === null ? true : v.sync.length > 0 && v.sync[0] === 1;
  if (v.sync && v.sync.length) {
    let gap = 0;
    for (let i = 1; i < v.sync.length; i++) gap = Math.max(gap, v.sync[i] - v.sync[i - 1]);
    info.maxKeyframeGap = Math.max(gap, v.frames - v.sync[v.sync.length - 1] + 1);
  }
  info.personalAtoms = m.personalAtoms;
  return info;
}

  /* ---- file: gates-export.js ---- */
/* Carousel Studio · cs-qa · export gates
 *
 * D1 (file format), V1 (cover video) and X1 (clean export) run on the files
 * the exporter produced: PNG, JPEG, PDF, MP4 and the kit's text files. Image
 * headers are read directly, so the checks need no decoder and run the same
 * in the Studio and in Node.
 */

/* ------------------------------------------------------------ file helpers */

const LATIN1_CHUNK = 8192;

function bytesToLatin1(b) {
  let s = "";
  for (let i = 0; i < b.length; i += LATIN1_CHUNK) s += String.fromCharCode.apply(null, b.subarray(i, i + LATIN1_CHUNK));
  return s;
}

function bytesToUtf8(b) {
  return typeof TextDecoder !== "undefined" ? new TextDecoder("utf-8", { fatal: false }).decode(b) : bytesToLatin1(b);
}

const extOf = (path) => {
  const m = /\.([A-Za-z0-9]+)$/.exec(path || "");
  return m ? m[1].toLowerCase() : "";
};

const TEXT_EXT = { txt: 1, md: 1, json: 1, html: 1, htm: 1, css: 1, js: 1, mjs: 1, svg: 1, csv: 1, xml: 1 };
const FONT_EXT = { ttf: 1, otf: 1, woff: 1, woff2: 1 };

/** png | jpeg | pdf | mp4 | font | text | binary, with `broken` set when the
 *  extension promises an image the bytes do not deliver. */
function fileKind(f) {
  const b = f.bytes || new Uint8Array(0);
  const ext = extOf(f.path || f.name);
  const png = b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
  const jpg = b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  const pdf = b.length > 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46;
  const mp4 = b.length > 12 && b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70;
  if (png) return { kind: "png" };
  if (jpg) return { kind: "jpeg" };
  if (pdf) return { kind: "pdf" };
  if (mp4) return { kind: "mp4" };
  if (ext === "png" || ext === "jpg" || ext === "jpeg") return { kind: ext === "png" ? "png" : "jpeg", broken: true };
  if (FONT_EXT[ext]) return { kind: "font" };
  if (TEXT_EXT[ext] || /^text\//.test(f.mime || "") || /json/.test(f.mime || "")) return { kind: "text" };
  return { kind: "binary" };
}

function pngInfo(b) {
  const info = { ok: false, w: 0, h: 0, colorType: -1, trns: false, srgb: false, iccp: null, textChunks: [] };
  if (b.length < 33) return info;
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let o = 8;
  while (o + 12 <= b.length) {
    const len = dv.getUint32(o);
    const type = String.fromCharCode(b[o + 4], b[o + 5], b[o + 6], b[o + 7]);
    const d = o + 8;
    if (type === "IHDR") {
      info.w = dv.getUint32(d);
      info.h = dv.getUint32(d + 4);
      info.colorType = b[d + 9];
      info.ok = true;
    } else if (type === "tRNS") info.trns = true;
    else if (type === "sRGB") info.srgb = true;
    else if (type === "iCCP") {
      let e = d;
      while (e < d + len && e < b.length && b[e] !== 0) e++;
      info.iccp = bytesToLatin1(b.subarray(d, e));
    } else if (type === "tEXt" || type === "zTXt" || type === "iTXt" || type === "eXIf") info.textChunks.push(type);
    else if (type === "IEND") break;
    o += 12 + len;
  }
  return info;
}

function jpegInfo(b) {
  const info = { ok: false, w: 0, h: 0, components: 0, meta: [], icc: false, iccSrgb: false };
  let o = 2;
  while (o + 4 <= b.length) {
    if (b[o] !== 0xff) {
      o++;
      continue;
    }
    const m = b[o + 1];
    if (m === 0xff) {
      o++;
      continue;
    }
    if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) {
      o += 2;
      continue;
    }
    if (m === 0xd9 || m === 0xda) break;
    const len = (b[o + 2] << 8) | b[o + 3];
    const d = o + 4;
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      info.h = (b[d + 1] << 8) | b[d + 2];
      info.w = (b[d + 3] << 8) | b[d + 4];
      info.components = b[d + 5];
      info.ok = true;
    } else if (m >= 0xe0 && m <= 0xef) {
      const head = bytesToLatin1(b.subarray(d, Math.min(d + 24, o + 2 + len)));
      if (m === 0xe1) info.meta.push(/^Exif/.test(head) ? "EXIF" : "XMP");
      if (m === 0xed) info.meta.push("IPTC");
      if (m === 0xe2 && /^ICC_PROFILE/.test(head)) {
        info.icc = true;
        /* v4 profiles (Chrome writes one) name themselves in UTF-16BE, "\u0000s\u0000R\u0000G\u0000B": drop the NULs before looking for the name */
        if (/srgb/i.test(bytesToLatin1(b.subarray(d + 14, Math.min(d + 4096, o + 2 + len))).replace(/\u0000/g, ""))) info.iccSrgb = true;
      }
    } else if (m === 0xfe) info.meta.push("COM");
    o += 2 + len;
  }
  return info;
}

/** Author, producer, creator and XMP presence of a PDF written by CS.export.pdf. */
function pdfInfo(b) {
  const s = bytesToLatin1(b);
  const str = (name) => {
    const m = new RegExp("/" + name + "\\s*(?:\\(([^)]*)\\)|<([0-9A-Fa-f\\s]+)>)").exec(s);
    if (!m) return null;
    if (m[1] !== undefined) return m[1];
    const hex = m[2].replace(/\s+/g, "");
    let t = "";
    for (let i = hex.indexOf("FEFF") === 0 ? 4 : 0; i + 4 <= hex.length; i += 4) t += String.fromCharCode(parseInt(hex.slice(i, i + 4), 16));
    return t;
  };
  return { author: str("Author"), producer: str("Producer"), creator: str("Creator"), xmp: /\/Type\s*\/Metadata/.test(s) };
}

/* -------------------------------------------------------- needle searching */

const foldLetters = (s) =>
  String(s).normalize("NFC").toLowerCase().replace(/\u0640/g, "").replace(/[^\p{L}\p{N}]+/gu, "");

function loadNeedles(P) {
  const mk = (list) =>
    (list || [])
      .map((n) => ({ id: n.id, s: foldLetters(String.fromCodePoint.apply(null, n.cp)) }))
      .filter((n) => n.s);
  return { lines: mk(P.lines), names: mk(P.names).concat(mk(P.brands)) };
}

const stripDataUris = (s) => s.replace(/data:[^,;"'()\s]{0,80};base64,[A-Za-z0-9+/=]+/g, "");

/** Folded text variants of a file worth searching for needles. */
function needleHaystacks(f, kind) {
  const b = f.bytes;
  const out = [];
  if (kind === "text") {
    out.push(foldLetters(stripDataUris(bytesToUtf8(b))));
    return out;
  }
  const ends = kind === "pdf" ? b : b.length > 262144 ? null : b;
  const parts = ends ? [b] : [b.subarray(0, 131072), b.subarray(b.length - 131072)];
  parts.forEach((p) => {
    out.push(foldLetters(bytesToLatin1(p)));
    out.push(foldLetters(bytesToUtf8(p)));
  });
  if (kind === "pdf") {
    const s = bytesToLatin1(b);
    const re = /<FEFF([0-9A-Fa-f]+)>/g;
    let m;
    while ((m = re.exec(s))) {
      let t = "";
      for (let i = 0; i + 4 <= m[1].length; i += 4) t += String.fromCharCode(parseInt(m[1].slice(i, i + 4), 16));
      out.push(foldLetters(t));
    }
  }
  return out;
}

function findNeedle(haystacks, N, masks) {
  for (let h = 0; h < haystacks.length; h++) {
    for (let i = 0; i < N.lines.length; i++) if (haystacks[h].indexOf(N.lines[i].s) >= 0) return N.lines[i].id;
  }
  for (let h = 0; h < haystacks.length; h++) {
    let rest = haystacks[h];
    masks.forEach((m) => {
      if (rest.indexOf(m) >= 0) rest = rest.split(m).join("");
    });
    for (let i = 0; i < N.names.length; i++) if (rest.indexOf(N.names[i].s) >= 0) return N.names[i].id;
  }
  return null;
}

/** Strings the user typed into their own brand; they are not tool credits. */
function userMasks(spec, brand) {
  const list = [];
  const add = (v) => {
    if (nonEmpty(v)) list.push(v);
  };
  if (brand) {
    add(brand.name);
    add(brand.handle);
    add(brand.slug);
    add(brand.homeUrl);
    ((brand.identity && brand.identity.otherNames) || []).forEach((n) => add(String(n).replace(/^#/, "")));
  }
  if (isObj(spec.brand)) add(spec.brand.slug);
  return list.map(foldLetters).filter((s) => s.length >= 4);
}

function fontsMetaOf(input) {
  if (input.fonts && input.fonts.registry) return input.fonts;
  try {
    if (typeof document !== "undefined") {
      const el = document.getElementById("cs-fonts-meta");
      if (el) return JSON.parse(el.textContent);
    }
  } catch (e) {
    /* no embedded registry */
  }
  return null;
}

const stripScriptsAndStyles = (s) => s.replace(/<script\b[\s\S]*?<\/script>/gi, "").replace(/<style\b[\s\S]*?<\/style>/gi, "");

/* ------------------------------------------------------------- export gates */

function runD1Export(ec, files, out) {
  const png = [];
  const jpg = [];
  const plat = (id) => param(ec, id);
  files.forEach((f) => {
    const k = fileKind(f);
    if (k.kind !== "png" && k.kind !== "jpeg") return;
    if (k.broken || !f.bytes || !f.bytes.length) {
      if (active(ec, "D1.decode")) emit(ec, out, "D1.decode", { vars: { path: f.path } });
      return;
    }
    if (k.kind === "png") {
      const i = pngInfo(f.bytes);
      if (!i.ok) {
        if (active(ec, "D1.decode")) emit(ec, out, "D1.decode", { vars: { path: f.path } });
        return;
      }
      png.push({ f, i });
      const cv = ec.spec.canvas || {};
      const ew = cv.w || plat("D1.png-size").w;
      const eh = cv.h || plat("D1.png-size").h;
      if ((i.w !== ew || i.h !== eh) && active(ec, "D1.png-size")) emit(ec, out, "D1.png-size", { vars: { path: f.path, w: i.w, h: i.h, ew, eh } });
      if ((i.colorType === 4 || i.colorType === 6 || i.trns) && active(ec, "D1.alpha")) emit(ec, out, "D1.alpha", { vars: { path: f.path } });
      if (i.iccp !== null && !/srgb/i.test(i.iccp) && active(ec, "D1.srgb")) emit(ec, out, "D1.srgb", { vars: { path: f.path } });
    } else {
      const i = jpegInfo(f.bytes);
      if (!i.ok) {
        if (active(ec, "D1.decode")) emit(ec, out, "D1.decode", { vars: { path: f.path } });
        return;
      }
      jpg.push({ f, i });
      const p = plat("D1.jpeg-size");
      if ((i.w !== p.w || i.h !== p.h) && active(ec, "D1.jpeg-size")) emit(ec, out, "D1.jpeg-size", { vars: { path: f.path, w: i.w, h: i.h, ew: p.w, eh: p.h } });
      if (((i.components !== 3) || (i.icc && !i.iccSrgb)) && active(ec, "D1.srgb")) emit(ec, out, "D1.srgb", { vars: { path: f.path } });
      const max = plat("D1.jpeg-bytes").max;
      if (f.bytes.length > max && active(ec, "D1.jpeg-bytes")) emit(ec, out, "D1.jpeg-bytes", { vars: { path: f.path, count: f.bytes.length, max } });
    }
  });
  const mixed = (list) => new Set(list.map((x) => x.i.w + "x" + x.i.h)).size > 1;
  if ((mixed(png) || mixed(jpg)) && active(ec, "D1.ratio")) emit(ec, out, "D1.ratio", {});
}

/** Facts the bytes of an MP4 settle; the exporter's own report cannot overrule them. */
const MP4_DERIVED = ["width", "height", "frames", "seconds", "fps", "codec", "moovBeforeMdat", "keyframeAtZero", "audio", "constantRate"];

/** VideoInfo for one MP4 file: what the exporter reported (loop metrics, blank
 *  frames, flashes, closed GOP …) completed and corrected from the bytes. */
function resolveVideoInfo(f, idx, provided) {
  const inspected = videoInfoFromMp4(f.bytes);
  let given = null;
  if (Array.isArray(provided)) given = provided.find((v) => v && v.file === f.path) || provided[idx] || null;
  else if (isObj(provided) && idx === 0) given = provided;
  const info = Object.assign({}, given || {});
  Object.keys(inspected).forEach((k) => {
    const settled = inspected.width !== undefined && MP4_DERIVED.indexOf(k) >= 0;
    if (inspected[k] !== undefined && (settled || info[k] === undefined)) info[k] = inspected[k];
  });
  return info;
}

/** H.264 level_idc from an avc1.PPCCLL codec string (40 for avc1.640028), or null. */
function levelOfCodec(codec) {
  const m = /^avc[13]\.[0-9a-f]{4}([0-9a-f]{2})$/i.exec(codec || "");
  return m ? parseInt(m[1], 16) : null;
}

/** "4.1" -> 41 */
function levelNumber(text) {
  return Math.round(parseFloat(text) * 10);
}

function runV1(ec, files, provided, out) {
  const motion = ec.spec.cover && ec.spec.cover.motion;
  const motionOff = !motion || motion.recipe === "none" || (ec.spec.compat && ec.spec.compat.mp4 === "off");
  const mp4s = files.filter((f) => fileKind(f).kind === "mp4");
  if ((!mp4s.length || motionOff) && active(ec, "V1.static")) emit(ec, out, "V1.static", {});
  mp4s.forEach((f, idx) => {
    const info = resolveVideoInfo(f, idx, provided);
    if (ec.sink) ec.sink.videos.push(Object.assign({ file: f.path }, info));
    const is45 = /(^|\/)4x5\//.test(f.path || "") || (ec.spec.canvas && ec.spec.canvas.preset === "ig-4x5");
    const sz = param(ec, "V1.size");
    const ew = sz.w;
    const eh = is45 ? sz.h4x5 : sz.h3x4;
    const el = f.path;
    const fx = (id, extra) => emit(ec, out, id, { el, vars: extra || {} });

    if (info.codec && active(ec, "V1.codec") && info.codec.indexOf(param(ec, "V1.codec").prefix) !== 0) fx("V1.codec", { codec: info.codec });
    else if (info.codec && active(ec, "V1.profile") && !/^avc1\.64/i.test(info.codec)) fx("V1.profile", { codec: info.codec });
    // pixel format, range, colour tags and level: the H.264 level comes from the file's own bytes (the codec string above); the rest is
    // what the exporter read from the SPS and reports as pixFmt, range and colour (check_video.mjs reports the same fields from ffprobe)
    const level = levelOfCodec(info.codec) !== null ? levelOfCodec(info.codec) : info.level;
    const maxLevel = param(ec, "V1.level").max;
    if (typeof level === "number" && active(ec, "V1.level") && level > levelNumber(maxLevel)) fx("V1.level", { level: (level / 10).toFixed(1), max: maxLevel });
    const pixfmt = info.pixFmt ? String(info.pixFmt) : "";
    const wantPix = param(ec, "V1.pixfmt").expected;
    if (pixfmt && active(ec, "V1.pixfmt") && pixfmt.replace(/^yuvj/, "yuv") !== wantPix) fx("V1.pixfmt", { pixfmt, expected: wantPix });
    if ((info.range === "pc" || /^yuvj/.test(pixfmt)) && active(ec, "V1.range")) fx("V1.range", { range: info.range === "pc" ? "pc" : pixfmt, expected: param(ec, "V1.range").expected });
    const wantColour = param(ec, "V1.colour").expected;
    const odd = isObj(info.colour) ? ["primaries", "transfer", "matrix"].filter((k) => info.colour[k] && ["unknown", "unspecified", wantColour].indexOf(info.colour[k]) < 0).map((k) => k + " " + info.colour[k]) : [];
    if (odd.length && active(ec, "V1.colour")) fx("V1.colour", { tags: odd.join(", "), expected: wantColour });
    if (info.width && active(ec, "V1.size") && (info.width !== ew || info.height !== eh)) fx("V1.size", { w: info.width, h: info.height, ew, eh });
    const fps = param(ec, "V1.fps").fps;
    if (info.fps && active(ec, "V1.fps") && (Math.abs(info.fps - fps) > 0.05 || info.constantRate === false)) {
      fx("V1.fps", { fps: Math.round(info.fps * 100) / 100, ef: fps });
    }
    if (info.frames && active(ec, "V1.frames")) {
      const secs = (motion && motion.seconds) || param(ec, "V1.frames").defaultSeconds;
      const expected = Math.round(secs * fps);
      if (Math.abs(info.frames - expected) > 1) fx("V1.frames", { count: info.frames, n: expected });
    }
    const expAudio = param(ec, "V1.audio").expected;
    if (info.audio && active(ec, "V1.audio") && info.audio !== expAudio) fx("V1.audio", { audio: info.audio, expected: expAudio });
    if (info.moovBeforeMdat === false && active(ec, "V1.faststart")) fx("V1.faststart");
    if (info.keyframeAtZero === false && active(ec, "V1.keyframe")) fx("V1.keyframe");
    if (info.closedGop === false && active(ec, "V1.closed-gop")) fx("V1.closed-gop");

    const L = param(ec, "V1.loop");
    const loop = isObj(info.loop) ? info.loop : null;
    let ssim = info.loopSsim;
    let psnr = info.loopPsnr;
    if (loop) {
      const parts = [loop.frame0VsPoster, loop.lastVsFrame0].filter(isObj);
      if (parts.length) {
        ssim = Math.min.apply(null, parts.map((p) => p.ssim));
        psnr = Math.min.apply(null, parts.map((p) => p.psnr));
      }
    }
    if (typeof ssim === "number" && active(ec, "V1.loop") && (ssim < L.ssim || (typeof psnr === "number" && psnr < L.psnr))) {
      fx("V1.loop", { ssim: Math.round(ssim * 1000) / 1000, psnr: typeof psnr === "number" ? Math.round(psnr * 10) / 10 : "—" });
    }
    if (info.blankFrames > 0 && active(ec, "V1.blank")) fx("V1.blank", { count: info.blankFrames });
    const maxFlash = param(ec, "V1.flashes").max;
    if (info.flashesPerSecondMax > maxFlash && active(ec, "V1.flashes")) fx("V1.flashes", { count: info.flashesPerSecondMax, max: maxFlash });
    // frame metrics (NOTE): how much of the loop is a held picture, and how long only the chrome is on screen
    if (!(motion && motion.clip) && info.kind !== "clip" && typeof info.stillShare === "number" && active(ec, "V1.still-hold") && info.stillShare > param(ec, "V1.still-hold").maxShare) {
      const secs = (motion && motion.seconds) || param(ec, "V1.frames").defaultSeconds;
      fx("V1.still-hold", { pct: Math.round(info.stillShare * 100), sec: Math.round(info.stillShare * secs * 10) / 10 });
    }
    if (typeof info.thinRunSeconds === "number" && active(ec, "V1.thin-frames") && info.thinRunSeconds > param(ec, "V1.thin-frames").maxSeconds) {
      fx("V1.thin-frames", { sec: Math.round(info.thinRunSeconds * 10) / 10 });
    }
  });
}

function runX1(ec, files, input, out) {
  const P = param(ec, "X1.credit");
  const N = loadNeedles(P);
  const masks = userMasks(ec.spec, input.brand || null);
  const secrets = (param(ec, "X1.secrets").patterns || []).map((p) => ({ id: p.id, re: new RegExp(p.pattern, p.flags || "") }));
  const fontsMeta = fontsMetaOf(input);
  const okFamilies = new Set();
  if (fontsMeta && fontsMeta.registry && Array.isArray(fontsMeta.registry.families)) {
    const allowed = param(ec, "X1.font-license").allowedLicenses;
    fontsMeta.registry.families.forEach((fam) => {
      if (allowed.indexOf(fam.license) >= 0) okFamilies.add(String(fam.family).toLowerCase());
    });
  }
  const userFamilies = new Set();
  const uf = ec.brandFonts || [];
  uf.forEach((x) => nonEmpty(x.family) && userFamilies.add(String(x.family).toLowerCase()));

  files.forEach((f) => {
    const k = fileKind(f);
    const path = f.path;
    if (!f.bytes) return;

    if (active(ec, "X1.credit")) {
      const id = findNeedle(needleHaystacks(f, k.kind), N, masks);
      if (id) emit(ec, out, "X1.credit", { vars: { path, needle: id } });
    }

    if (k.kind === "font" && active(ec, "X1.font-license")) emit(ec, out, "X1.font-license", { vars: { path, font: path } });

    if (k.kind === "text") {
      const text = bytesToUtf8(f.bytes);
      if (active(ec, "X1.credit-markup") && /\.html?$/i.test(path || "")) {
        const markers = param(ec, "X1.credit-markup").markers;
        const markup = stripScriptsAndStyles(text);
        if (markers.some((m) => new RegExp("\\s" + m + "(?:[\\s=>/]|$)").test(markup))) emit(ec, out, "X1.credit-markup", { vars: { path } });
      }
      if (active(ec, "X1.secrets")) {
        const clean = stripDataUris(text);
        const hit = secrets.find((s) => s.re.test(clean));
        if (hit) emit(ec, out, "X1.secrets", { vars: { path, kind: hit.id } });
      }
      if (active(ec, "X1.font-license") && (okFamilies.size || userFamilies.size)) {
        const re = /@font-face\s*\{([^}]*)\}/g;
        let m;
        const bad = new Set();
        while ((m = re.exec(text))) {
          const fm = /font-family\s*:\s*(?:"([^"]+)"|'([^']+)'|([^;}\n]+))/.exec(m[1]);
          if (!fm) continue;
          const fam = (fm[1] || fm[2] || fm[3] || "").trim().toLowerCase();
          if (fam && (userFamilies.has(fam) || (okFamilies.size && !okFamilies.has(fam)))) bad.add(fam);
        }
        bad.forEach((fam) => emit(ec, out, "X1.font-license", { vars: { path, font: fam } }));
      }
    }

    if (active(ec, "X1.metadata")) {
      const md = (kind) => emit(ec, out, "X1.metadata", { vars: { path, kind } });
      if (k.kind === "png") {
        const i = pngInfo(f.bytes);
        if (i.textChunks.length) md(i.textChunks[0]);
      } else if (k.kind === "jpeg") {
        const i = jpegInfo(f.bytes);
        if (i.meta.length) md(i.meta[0]);
      } else if (k.kind === "pdf") {
        const i = pdfInfo(f.bytes);
        const ok = String(param(ec, "X1.metadata").producer).toLowerCase();
        if (i.author !== null) md("Author");
        else if (i.producer !== null && i.producer.toLowerCase() !== ok) md("Producer");
        else if (i.creator !== null && i.creator.toLowerCase() !== ok) md("Creator");
        else if (i.xmp) md("XMP");
      } else if (k.kind === "mp4") {
        const m = inspectMp4(f.bytes);
        if (m.personalAtoms.length) md(m.personalAtoms[0].replace(/©/g, "(c)"));
      }
    }
  });

  if (active(ec, "X1.complete")) {
    const norm = (p) => String(p).replace(/^carousel-kit\//, "");
    let expected = input.expected;
    if (!expected && CS.export && typeof CS.export.kitFiles === "function") {
      try {
        expected = CS.export.kitFiles(ec.spec, input.kitOptions || {});
      } catch (e) {
        expected = null;
      }
    }
    if (Array.isArray(expected)) {
      const have = new Set(files.map((f) => norm(f.path)));
      const skipped = new Set((input.skipped || []).map((s) => norm(s.path)));
      expected.map(norm).forEach((p) => {
        if (!have.has(p) && (!skipped.has(p) || /\.mp4$/i.test(p))) emit(ec, out, "X1.complete", { vars: { path: p } });
      });
    }
  }
}

/** Export-scope gates over `input.files`. */
function runExportGates(input, opts) {
  opts = opts || {};
  const ec = buildContext(input, opts);
  ec.sink = input._sink || null;
  ec.brandFonts = (input.brand && input.brand.visual && input.brand.visual.fonts && input.brand.visual.fonts.userFonts) || [];
  const files = (input.files || []).filter((f) => f && f.bytes);
  const out = [];
  if (wantGate(ec, "D1")) { countGate(ec, "D1"); runD1Export(ec, files, out); }
  if (wantGate(ec, "V1")) { countGate(ec, "V1"); runV1(ec, files, input.video, out); }
  if (wantGate(ec, "X1")) { countGate(ec, "X1"); runX1(ec, files, input, out); }
  if (wantGate(ec, "A1")) { countGate(ec, "A1"); gateA1(ec, out); }
  ec.out = out;
  return ec;
}

  /* ---- file: autofix.js ---- */
/* Carousel Studio · cs-qa · auto-fix and overrides
 *
 * Deterministic text repairs only (CONTRACT 4.4): digits (N1), bindings (B1)
 * and the auto-fixable rules of ortho.json (punctuation, spacing, tatweel,
 * ellipsis, Persian letters …). Layout repairs (refit, split, scrim, oklch)
 * belong to the engine and stay in `remaining`. Fixes are recomputed from the
 * spec, so a result only needs its rule and element key (the fields the
 * qaResult schema allows).
 */
/* Deterministic text repairs and QA overrides. */

const TEXT_FIX_KINDS = { digits: 1, bind: 1, ortho: 1 };
const KIND_BUILTINS = { bind: ["lam-latin-stranded", "number-noun-unbound"] };

/** Fix kind of a finding, or null. O1 rules are dynamic: they map to "ortho". */
function fixKindOf(R, f) {
  const e = R.checks[f.rule];
  if (e && e.def.autofix && e.def.autofix.kind) return e.def.autofix.kind;
  if (f.gate === "O1" && f.rule !== "O1.deny-marker" && f.rule !== "O1.warn-marker") return "ortho";
  return null;
}

/** Can CS.qa.autofix repair this finding? */
function isAutofixable(f) {
  const R = loadRules();
  if (!f || f.overridden || /^s[0-9]{2}\.free(?:-edit)?\./.test(f.el || "")) return false;
  const kind = fixKindOf(R, f);
  if (!kind || !TEXT_FIX_KINDS[kind]) return false;
  if (f.gate === "O1" && R.checks[f.rule] === undefined) {
    const ortho = R.bundle.ortho;
    const rules = (ortho && ortho.rules) || [];
    return rules.some((r) => "O1." + ruleSlug(r.id) === f.rule && r.autofix === true);
  }
  return true;
}

function copyPointer(key) {
  if (!key.startsWith("/")) return true;
  const slide = /^\/slides\/[0-9]+\//.test(key), p = key.slice(1).replace(/^slides\/[0-9]+\//, "").replace(/\//g, ".");
  return /^(captionPack\.(firstLine|keywordLine|body|cta|(perSlide|alt|hashtags)\.[0-9]+)|hook\.(cover|text|slide2))$/.test(p) || slide && /^(kicker|headline|sub|title|body|bridge|attribution|quote|bullets\.[0-9]+|sides\.[0-9]+\.(label|text)|cta\.text|number\.(value|unit)|items\.[0-9]+\.(title|text|value)|demo\.(caption|lines\.[0-9]+\.text)|visual\.anchor\.(word|unit|captions\.[0-9]+|chart\.values\.[0-9]+\.label|mock\.(title|caption|stamp|lines\.[0-9]+\.text|items\.[0-9]+)))$/.test(p);
}

function fixText(text, kinds, fc) {
  let cur = text;
  const opts = { bundle: fc.bundle, dialect: fc.dialect, digits: fc.digits, allowSet: fc.allow,
    skip: new Set(O1_SKIP_CHECKS), kashidaWord: fc.kashidaWord };
  for (let pass = 0; pass < 4; pass++) {
    const before = cur, all = kinds.has("ortho") ? lintText(cur, opts) : [];
    let repairs = all.filter(i => i.autofix && /^ORTHO-ENC-/.test(i.rule) && (!fc.encodingOnly || /^ORTHO-ENC-00[4-8]$/.test(i.rule)));
    if (!repairs.length && !fc.encodingOnly) {
      if (BUILTIN["unassigned-codepoint"](cur, {}).length || all.some(i => i.rule === "ORTHO-ENC-003")) break;
      if (kinds.has("bind") || kinds.has("ortho")) {
        KIND_BUILTINS.bind.forEach(n => BUILTIN[n](cur, fc).forEach(i => repairs.push({...i, autofix: true})));
      }
      if (!repairs.length) {
        if (kinds.has("digits")) cur = TX().digits.convert(cur, fc.digits);
        if (kinds.has("ortho")) repairs = lintText(cur, opts);
        if (kinds.has("digits")) BUILTIN["percent-sign"](cur, fc).forEach(i => repairs.push({...i, autofix: true}));
      }
    }
    cur = applyFixes(cur, repairs);
    if (cur === before) break;
  }
  return cur;
}


/** autofix(spec, results, ctx?) -> { spec, applied, remaining }. */
function autofixSpec(spec, results, c) {
  if (c && c.autofix === false) return { spec: deepClone(spec), applied: [], remaining: results.slice() };
  const R = loadRules();
  const next = deepClone(spec);
  const brand = (c && c.brand) || null;
  const fc = {
    bundle: R.bundle,
    dialect: (next.locale && next.locale.dialect) || "msa-white",
    digits: (next.locale && next.locale.digits) || "western",
    allow: allowSet(brand && brand.voice && brand.voice.allow),
    bindLabels: bindLabelSet(R.bundle),
    kashidaWord: ""
  };

  const targets = {};
  results.forEach((f) => {
    if (!isAutofixable(f) || !f.el) return;
    const kind = fixKindOf(R, f);
    (targets[f.el] = targets[f.el] || new Set()).add(kind);
  });

  Object.keys(targets).forEach((el) => {
    const loc = el.startsWith("/") ? pointerText(next, el) : locateKey(next, el);
    if (!loc || typeof loc.holder[loc.prop] !== "string") return;
    const slideId = /^(s[0-9]{2})\./.exec(el);
    const slide = slideId ? (next.slides || []).find((s) => s.id === slideId[1]) : null;
    const local = Object.assign({}, fc, { encodingOnly: !copyPointer(el), kashidaWord: slide && /\.headline$/.test(el) ? slide.kashidaWord || "" : "" });
    loc.holder[loc.prop] = fixText(loc.holder[loc.prop], targets[el], local);
  });

  const after = runTextGates({ spec: next, brand, history: c && c.history }, {});
  const still = new Set(after.map(findingKey));
  const applied = [];
  const remaining = [];
  results.forEach((f) => {
    if (isAutofixable(f) && f.el && targets[f.el] && !still.has(findingKey(f))) applied.push(Object.assign({}, f, { autofixed: true }));
    else remaining.push(f);
  });
  return { spec: next, applied, remaining };
}

function pointerText(spec, key) {
  const parts = key.slice(1).split("/").map((p) => p.replace(/~1/g, "/").replace(/~0/g, "~"));
  const prop = parts.pop(), holder = parts.reduce((v, p) => v && Object.hasOwn(v, p) ? v[p] : null, spec);
  return holder && Object.hasOwn(holder, prop) ? { holder, prop } : null;
}

/** override(spec, gateOrRule, { slide?, reason, at? }) -> new spec. */
function overrideSpec(spec, gate, o) {
  o = o || {};
  if (!nonEmpty(o.reason)) throw qaError("E_USAGE", "An override needs a reason");
  const R = loadRules();
  const prior = spec.qa && Array.isArray(spec.qa.results) ? spec.qa.results : [];
  const at = o.at || new Date().toISOString();
  let marked = 0;
  let locked = 0;
  const results = prior.map((r) => {
    const hit = (r.gate === gate || r.rule === gate) && (!o.slide || r.slide === o.slide) && !r.overridden && r.sev !== "NOTE";
    if (!hit) return r;
    if (!isOverridableRule(R, r.rule)) {
      locked++;
      return r;
    }
    marked++;
    return Object.assign({}, r, { overridden: { reason: String(o.reason).slice(0, 300), at } });
  });
  if (!marked) {
    throw qaError("E_USAGE", locked ? gate + " cannot be overridden" : "Nothing to override for " + gate, { gate, locked });
  }
  const next = deepClone(spec);
  next.qa = Object.assign({}, next.qa, { results, status: summarizeResults(results).status });
  return next;
}

  /* ---- file: report.js ---- */
/* Carousel Studio · cs-qa · summary, report and the seven errors
 *
 * summarizeResults decides pass / fix / block and the CLI exit code (0, 1, 2).
 * reportJSON builds qa-report.json; reportMarkdown renders the same report
 * for people. The Markdown template is fixed (see references/qa-gates.md) so
 * the Python engine can produce byte-identical output.
 */

const isOverriddenBy = (r, list) =>
  isObj(r.overridden) ||
  (list || []).some((o) => isObj(o) && (o.gate === r.gate || o.rule === r.rule) && (!o.slide || o.slide === r.slide));

function summarizeResults(results, overrides) {
  let R = null;
  try {
    R = loadRules();
  } catch (e) {
    R = null;
  }
  const counts = { block: 0, fix: 0, note: 0 };
  results.forEach((r) => {
    const ext = (overrides || []).length && (!R || isOverridableRule(R, r.rule)) ? isOverriddenBy(r, overrides) : isObj(r.overridden);
    if (ext) return;
    counts[String(r.sev).toLowerCase()]++;
  });
  const status = counts.block ? "block" : counts.fix ? "fix" : "pass";
  return { status, counts, exitCode: counts.block ? 2 : counts.fix ? 1 : 0 };
}

const CAP_RESULTS = 600;

/** qa-report.json (qa-report.schema.json). `env` may carry: checkpoint, lane,
 *  painter, userAgent, fonts, thumbnail, video, files, createdAt. */
function reportJSON(spec, results, env) {
  env = env || {};
  const sum = summarizeResults(results);
  const rep = {
    schemaVersion: 1,
    specId: spec.id,
    rev: spec.rev,
    engine: QA.ENGINE
  };
  rep.createdAt = env.createdAt || new Date().toISOString();
  const checkpoint = env.checkpoint || spec.checkpoint;
  if (checkpoint) rep.checkpoint = checkpoint;
  if (env.lane) rep.lane = env.lane;
  rep.status = sum.status;
  rep.exitCode = sum.exitCode;
  rep.counts = sum.counts;
  rep.results = results.slice(0, CAP_RESULTS).map((r) => deepClone(r));
  rep.stats = deepClone(results.stats || env.stats || { gates: {} });
  if (results.stats) rep.results.stats = deepClone(results.stats);
  const ov = results
    .filter((r) => isObj(r.overridden))
    .map((r) => {
      const o = { gate: r.gate };
      if (r.slide) o.slide = r.slide;
      o.reason = r.overridden.reason;
      o.at = r.overridden.at;
      return o;
    })
    .slice(0, 100);
  if (ov.length) rep.overrides = ov;
  const e = {};
  if (["svg", "replay", "dom"].indexOf(env.painter) >= 0) e.painter = env.painter;
  if (nonEmpty(env.userAgent)) e.userAgent = String(env.userAgent).slice(0, 300);
  if (Array.isArray(env.fonts) && env.fonts.length) e.fonts = env.fonts.slice(0, 20).map((f) => String(f).slice(0, 80));
  if (spec.locale && spec.locale.dialect) e.dialect = spec.locale.dialect;
  if (spec.locale && spec.locale.digits) e.digits = spec.locale.digits;
  if (Object.keys(e).length) rep.environment = e;
  if (isObj(env.thumbnail)) {
    rep.thumbnail = { heroPx: env.thumbnail.heroPx, pass: !!env.thumbnail.pass, localContrast: env.thumbnail.localContrast };
  }
  if (isObj(env.video)) rep.video = env.video;
  if (Array.isArray(env.files) && env.files.length) rep.files = env.files.slice(0, 200);
  return rep;
}

const MD_LABELS = {
  ar: {
    title: "تقرير الجودة",
    status: "الحالة",
    rev: "المراجعة",
    checkpoint: "المرحلة",
    level: "المستوى",
    count: "العدد",
    none: "لا توجد ملاحظات.",
    overrides: "تجاوزات",
    environment: "البيئة",
    painter: "الرس\u0651ام",
    dialect: "اللهجة",
    digits: "الأرقام",
    fonts: "الخطوط",
    statusText: { pass: "ناجح", fix: "يحتاج تعديلات", block: "محظور" },
    digitNames: { western: "غربية (123)", "arabic-indic": "هندية (١٢٣)" }
  },
  en: {
    title: "QA report",
    status: "Status",
    rev: "Revision",
    checkpoint: "Checkpoint",
    level: "Level",
    count: "Count",
    none: "No findings.",
    overrides: "Overrides",
    environment: "Environment",
    painter: "Painter",
    dialect: "Dialect",
    digits: "Digits",
    fonts: "Fonts",
    statusText: { pass: "Pass", fix: "Needs fixes", block: "Blocked" },
    digitNames: { western: "Western (123)", "arabic-indic": "Arabic-Indic (١٢٣)" }
  }
};

/** qa-report.md. Same report, same lang -> same bytes. */
function reportMarkdown(report, lang) {
  const L = MD_LABELS[lang === "en" ? "en" : "ar"];
  const code = lang === "en" ? "en" : "ar";
  const lines = [];
  lines.push("# " + L.title + " — " + report.specId);
  lines.push("");
  let head = "**" + L.status + ":** " + L.statusText[report.status] + " · **" + L.rev + ":** " + report.rev;
  if (report.checkpoint) head += " · **" + L.checkpoint + ":** " + report.checkpoint;
  lines.push(head);
  lines.push("");
  lines.push("| " + L.level + " | " + L.count + " |");
  lines.push("|---|---|");
  lines.push("| BLOCK | " + report.counts.block + " |");
  lines.push("| FIX | " + report.counts.fix + " |");
  lines.push("| NOTE | " + report.counts.note + " |");
  lines.push("");
  const open = report.results.filter((r) => !isObj(r.overridden));
  if (!open.length) {
    lines.push(L.none);
    lines.push("");
  }
  ["BLOCK", "FIX", "NOTE"].forEach((sev) => {
    const list = open.filter((r) => r.sev === sev);
    if (!list.length) return;
    lines.push("## " + sev);
    lines.push("");
    list.forEach((r) => {
      let s = "- " + (r.slide || "—") + " · " + r.rule + " · " + r.msg[code];
      if (r.fix) s += " — " + r.fix[code];
      lines.push(s);
    });
    lines.push("");
  });
  const ov = report.overrides || [];
  if (ov.length) {
    lines.push("## " + L.overrides);
    lines.push("");
    ov.forEach((o) => lines.push("- " + o.gate + " · " + (o.slide || "—") + " · " + o.reason + " (" + o.at + ")"));
    lines.push("");
  }
  const env = report.environment || {};
  const envLines = [];
  if (env.painter) envLines.push("- " + L.painter + ": " + env.painter);
  if (env.dialect) envLines.push("- " + L.dialect + ": " + env.dialect);
  if (env.digits) envLines.push("- " + L.digits + ": " + (L.digitNames[env.digits] || env.digits));
  if (env.fonts && env.fonts.length) envLines.push("- " + L.fonts + ": " + env.fonts.join(", "));
  if (envLines.length) {
    lines.push("## " + L.environment);
    lines.push("");
    envLines.forEach((l) => lines.push(l));
    lines.push("");
  }
  while (lines.length && lines[lines.length - 1] === "") lines.pop();
  return lines.join("\n") + "\n";
}

/* ----------------------------------------------------------- seven errors */

const SEVEN_ERRORS = [
  { id: "small-text", title: { ar: "خط صغير", en: "Small text" }, rules: ["D3.body-floor", "D3.meta-floor", "D3.hero-floor", "T1.hero-small"], scope: "rendered" },
  { id: "wrong-ratio", title: { ar: "نسبة أبعاد خاطئة", en: "Wrong ratio" }, gates: ["D1"], scope: "rendered" },
  { id: "generic-design", title: { ar: "تصميم عام بلا هوية", en: "Generic design" }, gates: ["D7", "D8", "D9"], scope: "rendered" },
  { id: "crowding", title: { ar: "ازدحام", en: "Crowding" }, gates: ["C2", "D6"], scope: "text" },
  { id: "static-cover", title: { ar: "غلاف ثابت", en: "Static cover" }, gates: ["V1"], scope: "export" },
  {
    id: "random-structure",
    title: { ar: "بنية عشوائية", en: "Random structure" },
    rules: ["C5.skeleton", "C5.bridge", "C5.voice-drift", "C6.list-count", "C6.slide2-promise"],
    scope: "text"
  },
  { id: "repeated-cta", title: { ar: "دعوة مكررة", en: "Repeated CTA" }, rules: ["C7.cta-repeat", "C4.multiple"], scope: "text" }
];
const SLIDE_COUNT_RULES = ["C5.slide-count", "C5.slide-count-low", "C5.slide-count-range"];

const SEV_TO_STATUS = { BLOCK: "block", FIX: "fix", NOTE: "note" };

/** The /audit report: one verdict per error plus the slide count. `ran` tells
 *  which scopes were run; an error whose scope was not run reports "n/a". */
function sevenErrorsOf(results, spec, ran) {
  ran = Object.assign({ text: true, rendered: true, export: true }, ran || {});
  const open = results.filter((r) => !isObj(r.overridden));
  const verdict = (list) => {
    if (!list.length) return "pass";
    return SEV_TO_STATUS[list.slice().sort((a, b) => QA.SEV_RANK[a.sev] - QA.SEV_RANK[b.sev])[0].sev];
  };
  const errors = SEVEN_ERRORS.map((e) => {
    const findings = open.filter((r) => (e.gates && e.gates.indexOf(r.gate) >= 0) || (e.rules && e.rules.indexOf(r.rule) >= 0));
    const na = !ran[e.scope] && !findings.length;
    return { id: e.id, title: e.title, status: na ? "n/a" : verdict(findings), findings };
  });
  const countFindings = open.filter((r) => SLIDE_COUNT_RULES.indexOf(r.rule) >= 0);
  return {
    errors,
    slideCount: { n: ((spec && spec.slides) || []).length, status: ran.text ? verdict(countFindings) : "n/a", findings: countFindings }
  };
}

  /* ---- file: api.js ---- */
/* Carousel Studio · cs-qa · public API (CS.qa)
 *
 * Assembles the module of CONTRACT 4.4 from the gate runners above. Scopes:
 *   runText      text      C1-C10, O1, N1, B1 (text), B2, SRC1, SEN1, D8  (any lane)
 *   runRendered  rendered  D1-D7, T1, B1 (rendered), A1              (needs a DOM)
 *   runExport    export    D1, V1, X1, A1                            (needs the files)
 * `run` merges the scopes that the given inputs allow and returns a QAReport.
 */

const TEXT_GATES = [
  ["C1", gateC1],
  ["C2", gateC2],
  ["C3", gateC3],
  ["C4", gateC4],
  ["C5", gateC5],
  ["C6", gateC6],
  ["C7", gateC7],
  ["C8", gateC8],
  ["C9", gateC9],
  ["C10", gateC10],
  ["O1", gateO1],
  ["N1", gateN1],
  ["B1", gateB1Text],
  ["B2", gateB2],
  ["SRC1", gateSRC1],
  ["SEN1", gateSEN1],
  ["D8", gateD8]
];

/** Post-process a scope's raw findings: dedupe, carry overrides, sort. */
function finishResults(ctx, raw, slideFilter) {
  let results = dedupeResults(raw);
  if (slideFilter) results = results.filter((f) => f.slide && slideFilter.has(f.slide));
  results = carryOverrides(ctx.R, ctx.spec, results);
  results = sortResults(ctx.R, ctx.spec, results);
  results.stats = ctx.stats;
  return results;
}

/** Counts executions, including clean runs; no module-global counters. */
function countGate(ctx, id) {
  ctx.stats.gates[id] = (ctx.stats.gates[id] || 0) + 1;
}

function extraGates(scope, ctx) {
  if (CS.qav && CS.qav.flush) CS.qav.flush();
  return QA.gates[scope].slice().filter((g) => !ctx.gates || [g.id].concat(g.ids || []).some((id) =>
    ctx.gates.has(id) || ctx.gates.has(id.split(".")[0])));
}

function runTextGates(input, opts) {
  const ctx = buildContext(input, opts);
  const out = [];
  TEXT_GATES.forEach((g) => {
    if (wantGate(ctx, g[0])) { countGate(ctx, g[0]); g[1](ctx, out); }
  });
  extraGates("text", ctx).forEach((g) => { countGate(ctx, g.id); out.push(...(g.run(ctx) || [])); });
  return finishResults(ctx, out, ctx.slideFilter);
}

async function runRenderedAll(input, opts) {
  const rc = await runRenderedGates(input, opts);
  return { results: finishResults(rc, rc.out, rc.slideFilter), rc };
}

function runExportAll(input, opts) {
  const sink = { videos: [] };
  const ec = runExportGates(Object.assign({}, input, { _sink: sink }), opts);
  return { results: finishResults(ec, ec.out, ec.slideFilter), sink };
}

const VIDEO_REPORT_KEYS = [
  "file", "width", "height", "fps", "seconds", "codec", "moovBeforeMdat", "keyframeAtZero", "closedGop",
  "audio", "loopSsim", "loopPsnr", "flashesPerSecondMax", "blankFrames", "stillShare", "thinRunSeconds"
];

function videoForReport(info) {
  const v = {};
  VIDEO_REPORT_KEYS.forEach((k) => {
    if (info[k] !== undefined && info[k] !== null && !(typeof info[k] === "number" && !isFinite(info[k]))) v[k] = info[k];
  });
  if (typeof v.fps === "number") v.fps = Math.round(v.fps * 100) / 100;
  if (typeof v.seconds === "number") v.seconds = Math.round(v.seconds * 1000) / 1000;
  return v;
}

function filesForReport(files) {
  return (files || []).map((f) => {
    const o = { path: String(f.path).slice(0, 200), bytes: f.bytes ? f.bytes.length : 0 };
    if (f.mime) o.mime = String(f.mime).slice(0, 60);
    const k = f.bytes ? fileKind(f).kind : "";
    if (k === "png") {
      const i = pngInfo(f.bytes);
      if (i.ok) {
        o.width = i.w;
        o.height = i.h;
      }
    } else if (k === "jpeg") {
      const i = jpegInfo(f.bytes);
      if (i.ok) {
        o.width = i.w;
        o.height = i.h;
      }
    }
    return o;
  });
}

async function runAll(input, opts) {
  opts = opts || {};
  if (!input || !isObj(input.spec)) throw qaError("E_USAGE", "CS.qa.run needs { spec }");
  const parts = [];
  const ran = { text: true, rendered: false, export: false };
  let ctx = null;
  let thumbnail = null;
  let fonts = null;
  let videos = [];

  ctx = buildContext(input, opts);
  const textResults = runTextGates(input, opts);
  ctx.stats = textResults.stats;
  textResults.forEach((f) => parts.push(f));
  if (input.deck) {
    const r = await runRenderedAll(input, opts);
    r.results.forEach((f) => parts.push(f));
    Object.keys(r.rc.stats.gates).forEach((id) => {
      ctx.stats.gates[id] = (ctx.stats.gates[id] || 0) + r.rc.stats.gates[id];
    });
    thumbnail = r.rc.thumbnail;
    fonts = r.rc.fontsUsed ? Array.from(r.rc.fontsUsed).filter(Boolean) : null;
    ran.rendered = true;
  }
  if (Array.isArray(input.files) && input.files.length) {
    const e = runExportAll(input, opts);
    e.results.forEach((f) => parts.push(f));
    Object.keys(e.results.stats.gates).forEach((id) => {
      ctx.stats.gates[id] = (ctx.stats.gates[id] || 0) + e.results.stats.gates[id];
    });
    videos = e.sink.videos;
    ran.export = true;
  }
  const results = finishResults(ctx, parts, null);
  const report = reportJSON(input.spec, results, {
    checkpoint: input.checkpoint,
    lane: input.lane,
    painter: input.painter || (ran.rendered ? "dom" : undefined),
    userAgent: input.includeUserAgent === true && typeof navigator !== "undefined" ? navigator.userAgent : undefined,
    fonts,
    thumbnail,
    video: videos.length ? videoForReport(videos[0]) : undefined,
    files: ran.export ? filesForReport(input.files) : undefined,
    createdAt: opts.createdAt
  });
  if (typeof CS.emit === "function") CS.emit("cs:qa", { report });
  return report;
}

/* ----------------------------------------------- contrast / thumbnail API */

async function contrastMeasure(slideEl, tokens) {
  let p = { decile: 0.1, largeMinPx: 66, largeBoldMinPx: 52 };
  try {
    p = loadRules().checks["D4.contrast"].def.params;
  } catch (e) {
    /* rules not registered: platform defaults */
  }
  const S = slideInfo({ el: slideEl, id: slideEl.getAttribute("data-cs-slide") || "", tokens }, { spec: { canvas: {}, slides: [] }, tokens });
  const items = await measureSlide(S, p.decile);
  const byKey = {};
  items.forEach((it) => {
    if (!it.res) return;
    const cur = byKey[it.key];
    if (!cur || it.res.decile < cur.ratio) {
      byKey[it.key] = {
        key: it.key,
        ratio: Math.round(it.res.decile * 100) / 100,
        large: isLargeText(it.fontPx, it.weight, p),
        min: it.res.min
      };
    }
  });
  const list = Object.keys(byKey).map((k) => byKey[k]);
  return {
    ratioMin: list.length ? Math.round(Math.min.apply(null, list.map((x) => x.min)) * 100) / 100 : 0,
    worstDecile: list.length ? Math.min.apply(null, list.map((x) => x.ratio)) : 0,
    byElement: list.map((x) => ({ key: x.key, ratio: x.ratio, large: x.large }))
  };
}

/* ------------------------------------------------------------------ CS.qa */

CS.qa = {
  splitCover: splitCover,
  version: QA.ENGINE,
  _: { gates: QA.gates, slideFields },

  /** qa-rules.json with every $platform reference resolved. */
  rules() {
    return loadRules().doc;
  },

  runText(input, opts) {
    return runTextGates(input, opts);
  },

  async runRendered(input, opts) {
    return (await runRenderedAll(input, opts)).results;
  },

  async runExport(input, opts) {
    return runExportAll(input, opts).results;
  },

  run: runAll,

  summarize: summarizeResults,

  autofix: autofixSpec,

  override: overrideSpec,

  contrast: { measure: contrastMeasure },

  /** T1: hero size at 130 px wide and local contrast of a cover slide. */
  thumbnail(slideEl) {
    return thumbnailOf(slideEl, null, null);
  },

  /** V1 loop: frame 0 against the poster and the last frame against frame 0. */
  loopCheck: loopCheckOf,

  report: { toJSON: reportJSON, toMarkdown: reportMarkdown },

  /* ---- additions beyond CONTRACT 4.4 (documented in references/qa-gates.md) */

  /** The spec.qa block for a report: { status, runAt, engine, results (max 400) }. */
  specQa(report) {
    return { status: report.status, runAt: report.createdAt, engine: report.engine, results: report.results.slice(0, 400) };
  },

  /** Lint one text: ortho.json rules, built-in checks and dialect markers. */
  lintText,

  /** True when autofix can repair the finding. */
  isAutofixable,

  /** Rule definition for the Check screen: gate, severity, conditions, messages. */
  describe(ruleId) {
    const R = loadRules();
    const gateId = String(ruleId).split(".")[0];
    const dynamic = R.gates[gateId] && R.gates[gateId].dynamicRules === true;
    const e = R.checks[ruleId] || (dynamic ? R.checks[gateId + ".ortho"] : null);
    if (!e) return null;
    return {
      gate: e.gate.id,
      rule: ruleId,
      title: e.gate.title,
      sev: e.def.sev,
      overridable: isOverridableRule(R, ruleId),
      autofix: e.def.autofix || null,
      when: e.def.when,
      msg: e.def.msg,
      fix: e.def.fix || null
    };
  },

  /** The /audit report: seven verdicts and the slide count. */
  sevenErrors: sevenErrorsOf,

  /** Fill a VideoInfo from the bytes of an MP4 (box order, size, frames, keyframes). */
  inspectMp4: videoInfoFromMp4,

  metrics: { ssim: ssimOf, psnr: psnrOf }
};
})();
