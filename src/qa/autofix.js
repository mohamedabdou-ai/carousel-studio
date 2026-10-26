/* Carousel Studio · cs-qa · auto-fix and overrides
 *
 * Deterministic text repairs only (CONTRACT 4.4): digits (N1), bindings (B1)
 * and the auto-fixable rules of ortho.json (punctuation, spacing, tatweel,
 * ellipsis, Persian letters …). Layout repairs (refit, split, scrim, oklch)
 * belong to the engine and stay in `remaining`. Fixes are recomputed from the
 * spec, so a result only needs its rule and element key (the fields the
 * qaResult schema allows).
 */

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
  if (!f || f.overridden) return false;
  const kind = fixKindOf(R, f);
  if (!kind || !TEXT_FIX_KINDS[kind]) return false;
  if (f.gate === "O1" && R.checks[f.rule] === undefined) {
    const ortho = R.bundle.ortho;
    const rules = (ortho && ortho.rules) || [];
    return rules.some((r) => "O1." + ruleSlug(r.id) === f.rule && r.autofix === true);
  }
  return true;
}

function fixPasses(text, names, ctx) {
  let cur = text;
  for (let pass = 0; pass < 3; pass++) {
    const issues = [];
    names.forEach((n) => {
      BUILTIN[n](cur, ctx).forEach((it) => issues.push(Object.assign({ autofix: it.fix !== undefined }, it)));
    });
    const next = applyFixes(cur, issues);
    if (next === cur) break;
    cur = next;
  }
  return cur;
}

function fixText(text, kinds, fc) {
  let t = text;
  if (kinds.has("digits")) t = TX().digits.convert(t, fc.digits);
  Object.keys(KIND_BUILTINS).forEach((k) => {
    if (kinds.has(k)) t = fixPasses(t, KIND_BUILTINS[k], { digits: fc.digits, kashidaWord: fc.kashidaWord, bindLabels: fc.bindLabels });
  });
  if (kinds.has("ortho")) {
    for (let pass = 0; pass < 3; pass++) {
      const issues = lintText(t, {
        bundle: fc.bundle,
        dialect: fc.dialect,
        digits: fc.digits,
        allowSet: fc.allow,
        skip: new Set(O1_SKIP_CHECKS),
        kashidaWord: fc.kashidaWord
      });
      const next = applyFixes(t, issues);
      if (next === t) break;
      t = next;
    }
  }
  return t;
}

/** autofix(spec, results, ctx?) -> { spec, applied, remaining }. */
function autofixSpec(spec, results, c) {
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
    const loc = locateKey(next, el);
    if (!loc || typeof loc.holder[loc.prop] !== "string") return;
    const slideId = /^(s[0-9]{2})\./.exec(el);
    const slide = slideId ? (next.slides || []).find((s) => s.id === slideId[1]) : null;
    const local = Object.assign({}, fc, { kashidaWord: slide && /\.headline$/.test(el) ? slide.kashidaWord || "" : "" });
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
