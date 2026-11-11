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
