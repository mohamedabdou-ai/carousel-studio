/* src/visual/plan-features.js - owned by V2. Planner steps 1-2 (spec 5.3): slide features, text blocks, concept lookup. V._.pl.feat(spec, X) -> [F] sorted by n. */
(function () {
  const V = CS.visual, P = (V._.pl = V._.pl || {});
  const PCT = /^(?:%|٪|percent|في ال(?:مية|مئة)|بال(?:مية|مئة))$/i, OF = /^(?:من|of|out of) ([0-9]{1,3})$/, ALN = /[A-Za-z0-9ء-ي]/;
  const UNIT = /^(\s*[%٪])?(?:\s+((?:من|of|out\s+of)\s+[0-9]{1,3}(?![0-9.,])|(?!(?:من|of)\s)[^\s0-9.,;:!?"()،؛؟«»=%٪-]{1,16}))?/, SER = /^([$€£¥])?\s*([-−‑‒+]?)([0-9]{1,3}(?:,[0-9]{3})+|[0-9]+)(\.[0-9]+)?(?:\s*([%٪]|[^\s0-9.,;:!?"()،؛؟«»=%٪-]{1,16}))?$/;
  const SPLIT = /[\s،,.:;!?؟…"()«»]+/, TAIL = /^[\s.,;:!?…،؛؟"'«»()-]+|[\s.,;:!?…،؛؟"'«»()-]+$/g;
  const clean = (s) => `${s ?? ""}`.replace(/==|\*/g, "").replace(/\s+/g, " ").trim(), two = (s) => clean(s).split(" ").slice(0, 2).join(" "), lines = (s, n) => Math.ceil(clean(s).length / n);
  const fold = (s) => `${s ?? ""}`.replace(/[٠-٩۰-۹]/g, (d) => d.charCodeAt(0) - (d.charCodeAt(0) > 1775 ? 1776 : 1632)).replace(/٫/g, ".").replace(/٬/g, ","), span = (s) => (/==(.+?)==/.exec(`${s ?? ""}`) || [])[1]?.replace(TAIL, "") || null;

  /** Number tokens of a digit-folded text: v as written for anchor.value (sign, grouping, decimals, a stuck unit letter or +; at most 10 characters), k the plain number, s the suffix, c a currency sign in front.
   * A token glued to a word, a range, a ratio, a date, a time or a list is bad: a figure is never cut out of those. */
  function nums(t) {
    const out = [];
    for (const m of t.matchAll(/[0-9]{1,3}(?:,[0-9]{3})+(?:\.[0-9]+)?|[0-9]+(?:\.[0-9]+)?/g)) {
      const d = m[0], i = m.index, s = (/^(?:[A-Za-z]{1,3}(?![A-Za-z])|\+)/.exec(t.slice(i + d.length)) || [""])[0], e = i + d.length + s.length, pre = t.slice(Math.max(0, i - 8), i), post = t.slice(e, e + 8), p = pre.slice(-1);
      const g = /[-−‑‒+]/.test(p) && !ALN.test(pre.slice(-2, -1)) ? (p === "+" ? "+" : "-") : "";
      const bad = /[A-Za-z.,]$/.test(pre) || /[A-Za-z0-9ء-ي][-−‑‒+–—]$/.test(pre) || /[0-9]\s*[-−‑‒–—\/:]\s*$/.test(pre) || /^[A-Za-z]|^[ء-ي]|^\s*[-−‑‒–—\/:]\s*[0-9]|^[.,][0-9]/.test(post) || (g + d + s).length > 10;   // glued to a word, in a range, ratio, date, time or list
      out.push({ v: g + d + s, k: (g === "-" ? "-" : "") + d.replace(/,/g, ""), s, e, c: /[$€£¥]/.test(p) ? p : "", bad });
    }
    return out;
  }

  /** slide.number, else the first whole number of headline, title, sub, kicker (never a year); a percent or "x of y" unit gives of/fill for the waffle, a negative, signed or suffixed figure never does. */
  function figure(s) {
    const n = s.number, own = n?.value != null;
    for (const f of own ? [n.value] : [s.headline, s.title, s.sub, s.body, s.kicker]) {
      const t = fold(clean(f));
      for (const x of nums(t)) {
        const m = UNIT.exec(t.slice(x.e)), pc = !!m[1], u = pc ? "%" : own ? clean(n.unit) : x.c || (/^(?:بدل|instead|than)$/.test(m[2]) ? "" : m[2]) || "", v = +x.k, of = PCT.test(u) ? 100 : +(OF.exec(u) || [])[1], ok = !x.s && /^[0-9]/.test(x.v);
        if (x.bad || (!own && !pc && !x.s && v >= 1900 && v <= 2100)) continue;
        const r = { v: x.v, k: x.k, s: x.s, u, src: (own && n.sourceId) || s.sourceIds?.[0], own: +own, pct: ok && of === 100 && v <= 100 };
        if (ok && of >= 2 && of <= 100 && v <= of && (of === 100 || Number.isInteger(v))) { r.of = of; r.fill = (v + 0.5) | 0; }
        return r;
      }
    }
  }

  /** The values of a numeric series in items: whole numbers (sign, grouping, decimals) with one unit shared by all or none (a suffix or a currency sign), none negative (bars start at zero), 2 to 7, labels of at most 24 characters; else null. */
  function series(s) {
    const out = [];
    for (const it of s.items || []) {
      const m = SER.exec(fold(clean(it.value))), w = clean(it.title), d = m && m[3].replace(/,/g, ""), x = m && Number((/[-−‑‒]/.test(m[2]) ? "-" : "") + d + (m[4] || "")), u = m ? m[1] || (m[5] === "٪" ? "%" : m[5]) || "" : "";
      if (!m || d.length > 15 || !(x >= 0) || !w || w.length > 24 || (m[1] && m[5]) || (out.length && out.u !== u)) return null;
      if (!out.length) out.u = u;
      out.push({ label: it.title, value: x, hi: !!it.hi });
    }
    return out.length > 1 && out.length < 8 ? out : null;
  }

  function keywords(t) {
    const S = V._.stem, st = S ? S.tbl().stop : {}, skip = /^(?:و|ف)?(?:عايز|عاوز|محتاج|احفظها|احفظ|ابعت|اكتب|ابدأ|حط|اقطع|الخلاصة|لازم|مفيش|اللي|عشان|علشان|كده|أول|آخر|أقل|أكتر|ده|دي|بس|مش|the|and|your|this|that|with|want|save|send|start|write)$/i;
    return clean(t).split(SPLIT).filter((x) => x.length > 2 && !skip.test(x) && !S.cands(S.norm(x)).some((w) => st[w] || skip.test(w)) && !/^[0-9]+$/.test(x)).sort((a, b) => b.length - a.length);
  }

  /** The lookup fields, weighted: title 100, number 120, sides 80, bullets 70, body 60, demo 70, bridge 20. */
  function fields(s) {
    const f = [], add = (t, w) => { t = clean(t); if (t) f.push({ text: t, w }); };
    add(s.title, 100); add(s.headline, 100); add(s.kicker, 40); add(s.sub, 60); add(s.body, 60); add(s.number?.unit, 120); add(s.bridge, 20);
    for (const x of s.sides || []) { add(x.label, 80); add(x.text, 80); }
    for (const x of s.bullets || []) add(x, 70);
    for (const x of s.items || []) { add(x.title, 70); add(x.text, 60); }
    for (const l of s.demo?.lines || []) add(l.text, 70);
    return f;
  }

  P.feat = function (spec, X) {
    const D = X.D, I = V.icons;
    let ord = 0;
    const out = (spec.slides || []).slice().sort((a, b) => (a.n || 0) - (b.n || 0)).map((s, i) => {
      const t = s.type, b = s.bullets || [], it = s.items || [], sd = s.sides || [], d = s.demo?.lines || [], q = t === "quote" && s.body ? 1 : 0;
      if (t === "item" || t === "step") ord++;
      const F = { s, id: s.id, type: t, i, v: s.variant || "", fields: fields(s), bridge: !!s.bridge, ord: s.ord || ord, num: figure(s), ser: series(s), n: { demo: d.length, sides: sd.length, items: it.length, bullets: b.length },
        role: D.roles.variants?.[s.variant] || D.roles.types?.[t] || "read", main: `${s.title || s.headline || ""}`, sub: `${s.body || s.sub || s.cta?.text || ""}`, asset: !!(s.media?.assetId || /^(?:photo|cutout|plate|screenshot|ui)$/.test(s.media?.slot)),
        span: span(s.headline) || span(s.title) || span(s.sub) || span(s.body) || span(s.bridge), rowsN: b.length >= 3 && b.length <= 5 ? b.length : it.length >= 3 && it.length <= 5 ? it.length : 0,
        list: b.length ? b.map(clean) : sd.map((x) => clean(x.text)), mwc: d.length + q + (sd.length === 2 ? 2 : 0), mwn: d.length + it.length + b.length + q };
      F.words = clean(F.main + " " + F.sub).split(" ").filter(Boolean).length;
      F.span = F.span || s.em || (/\*([^*]+)\*/.exec([s.headline, s.title, s.sub, s.body].join("\n")) || [])[1] || null;
      F.wts = [...new Set([t === "cta" && s.cta?.keyword, F.span && two(F.span), ...keywords(F.sub), ...keywords(F.main)].filter(Boolean))]; F.key = F.wts[0] || "";
      F.ew = F.num ? Array.from(F.num.v).reduce((w, c) => w + (c === "1" ? 0.4 : /[0-9]/.test(c) ? 0.58 : /[%٪]/.test(c) ? 0.84 : /[.,]/.test(c) ? 0.28 : 0.6), 0) : 0;   // the width of the figure in em, as the numeral builder counts it: it draws at 200 px at least
      F.reps = F.num ? nums(fold(F.fields.map((f) => f.text).join(" "))).filter((q) => !q.bad && q.k + q.s === F.num.k + F.num.s).length : 0;   // S-13: a figure shows at most twice on a slide
      F.wt = t === "cta" && s.cta?.keyword || (F.span ? two(F.span) : F.num ? F.num.v + (F.num.u ? (F.num.pct ? "" : "\u00a0") + F.num.u : "") : F.key);
      if (F.wt && !F.num && !(t === "cta" && s.cta?.keyword) && clean(F.main).includes(F.wt)) F.wt = F.wts.find((w) => !clean(F.main).includes(w)) || F.wt;
      return F;
    });
    X.topic = I ? I.topic([].concat(...out.map((F) => F.fields)), { dialect: X.ld }) : [];
    for (const F of out) {
      const seen = {};
      F.pool = I && F.fields.length ? I.find(F.fields, { dialect: X.ld, topic: X.topic, k: 12, hero: true, avoid: X.avoid }) : [];
      F.hits = F.pool.filter((e) => e.concept && !seen[e.concept] && (seen[e.concept] = 1)).map((e) => ({ n: Math.min(100, ((e.score * 100 + 17) / 35) | 0), via: e.via, obj: e.object || e.name }));
    }
    return out;
  };

  /** Text blocks beside a candidate: title 68 px (25 chars a line, pitch 92), body 46 px (40, 74), hero 84 px (18, 112); a full recipe keeps its body as a caption. */
  P.blocks = function (F, c) {
    const hero = /^(?:cover|rehook|share|poster)$/.test(F.type), out = [], add = (x, cpl, k, h, g) => out.push({ w: Math.min(852, Math.min(clean(x).length, cpl) * k), h: lines(x, cpl) * h, g });
    if (F.main) add(F.main, hero ? 18 : 25, hero ? 42 : 34, hero ? 112 : 92, 24);
    if (F.sub && !(c.kind === "mock" && F.type === "quote") && c.recipe !== "full") add(F.sub, 40, 21, 74, 40);
    if (c.kind !== "rows" && c.kind !== "mock" && c.sub !== "panel" && !c.own) for (const x of F.list) add(x, 40, 21, 74, 24);
    return out;
  };
  P.height = (b) => b.reduce((h, x, i) => h + x.h + (i < b.length - 1 ? x.g : 0), 0);
  P.clean = clean;
  P.demoFits = (s, notes) => {
    const wc = (t) => String(t ?? "").split(/\s+/).filter(Boolean).length;
    let prev, total = wc(s.demo?.caption);
    const lines = s.demo?.lines || [], speakers = lines.map((l) => (prev = /^(?:me|them)$/.test(l.who) ? l.who : prev === "them" ? "me" : "them"));
    return lines.length > 0 && lines.length <= (notes ? 5 : 4) && lines.every((l, i) => {
      const n = wc(l.text);
      total += n + (!notes && (speakers[i] === speakers[i - 1] || speakers[i] === speakers[i + 1]) ? 1 : 0);
      return n > 0 && n <= 12;
    }) && total <= 24;
  };
  /** The sub an anchor asks for in so many words ("" when it leaves it open), and its canonical sub (IS-3 v2 `_.sub`). */
  P.want = (a) => ({ icon: "icon", scene: a.template, chart: a.chart?.kind, mock: a.mock?.kind, pattern: a.pattern, numeral: a.companion, word: a.wordStyle, field: a.value ? "numeral" : a.word ? "word" : a.icon || a.object ? "icon" : "" })[a.kind] || "";
  P.sub = (a) => P.want(a) || ({ scene: "solo", numeral: "none", word: "solid", rows: "list", field: "panel" })[a.kind] || "";
})();
