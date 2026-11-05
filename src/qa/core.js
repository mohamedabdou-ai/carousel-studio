/* Carousel Studio · cs-qa · core
 *
 * Shared plumbing for every gate: access to the rule registry (qa-rules.json
 * through CS.core.registry), the finding factory, text-field enumeration and
 * a few small string helpers. Nothing here is public; CS.qa is assembled in
 * api.js. All files of this chunk share one IIFE scope, so every top-level
 * name below is unique across the chunk.
 */

const QA = {
  ENGINE: "cs-1.1.1",
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
