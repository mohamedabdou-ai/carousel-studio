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
      const primary = ctx.spec.architecture === "steps" ? "step" : "item";
      const items = numbered.size || ctx.slides.filter((s) => s.type === primary).length;
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
    const recent = hist.slice(-Math.max(0, lim.posts - 1)).filter((e) => e.family === family).length;
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
