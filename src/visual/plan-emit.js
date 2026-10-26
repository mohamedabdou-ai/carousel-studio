/* src/visual/plan-emit.js - owned by V2. Planner steps 7-8 (spec 5.3): anchor data, marks, row icons, why and alt in the post's dialect, notes.
 * V._.pl.emit(Fs, ch, X) -> {slides: [{id, visual, variant?}], notes, motif}. Every word, figure and name comes from the slide's own fields or the lookup. */
(function () {
  const V = CS.visual, P = (V._.pl = V._.pl || {});
  const label = (n, X) => { const m = V.icons?.meta(n.n), a = X.lang === "en" ? m?.en : m?.ar; return n.o ? n.e?.via || n.n : a?.[0] || n.n; };
  const tpl = (X, g, k, p) => (X.D.templates[g]?.[k]?.[X.dk] || "").replace(/\{(\w+)\}/g, (m, q) => p[q] ?? "").replace(/\s%/g, "%").trim().slice(0, g === "alt" ? 160 : 200);

  function anchor(x) {
    const F = x.F, c = x.c, N = F.num, k = c.kind, s = c.sub, n = x.nm[0], a = { kind: k };
    if (c.own) return { kind: "none" };
    if (n && (k === "icon" || s === "icon")) a[n.o ? "object" : "icon"] = n.n;
    if (k === "icon") { if (c.treatment && (c.treatment !== "duo" || !a.object)) a.treatment = c.treatment; a.size = c.f.sz; }
    if (k === "scene") { a.template = s; a.icons = x.nm.map((q) => q.n); a.roles = x.nm.map((q, i) => (i ? "support" : "dominant")); if (c.f.sz) a.size = c.f.sz; }
    if (k === "numeral" || (k === "field" && s === "numeral")) { if (c.variant === "numeral" || !N) a.value = `${F.ord}`; else if (!N.own) { a.value = N.v; if (N.u) a.unit = N.u; } }
    if (k === "numeral" && s !== "none") a.companion = s;
    if (k === "numeral" && N?.of && /^(?:waffle|ring|bar)$/.test(s)) { a.of = N.of; a.filled = N.fill; }
    if (k === "chart") a.chart = { kind: s, values: F.ser.map((v) => (v.hi ? v : { label: v.label, value: v.value })), ...(F.ser.u ? { unit: F.ser.u } : {}), ...(F.s.sourceIds?.length ? {} : { illustrative: true }) };
    if (k === "mock") a.mock = { kind: s, ...(F.s.demo?.caption ? { caption: F.s.demo.caption } : {}), ...(c.artefact ? { artefact: c.artefact } : {}) };
    if (k === "word" || (k === "field" && s === "word")) a.word = F.wt;
    if (k === "word" && s !== "solid") a.wordStyle = s;
    return a;
  }

  /** why and alt: the data's templates filled with names and words of the slide. */
  function words(x, X) {
    const F = x.F, c = x.c, n = x.nm, k = c.kind, s = c.sub, L = X.D.labels, g = X.lang, N = F.num, d = F.s.demo?.lines?.[0], o = n[0]?.o ? "object" : "icon", solo = k === "scene" && s === "solo", wd = k === "word" || (k === "field" && s === "word");
    const l = (k === "mock" ? L[s === "artefact" ? "artefact." + c.artefact : "mock." + s] : k === "chart" ? L["chart." + s] : null)?.[g];
    const p = { word: F.wt, count: F.rowsN || F.n.bullets, summary: P.clean(F.main).slice(0, 60), text: P.clean(d?.text || F.list[0] || F.sub || F.main).slice(0, 80), icon: n[0] ? label(n[0], X) : "",
      concept: n[0]?.e?.via || F.hits[0]?.via || F.key, icons: n.map((e) => label(e, X)).join(g === "en" ? ", " : " و"), value: N ? N.v : `${F.ord}`, unit: N ? N.u : "", chart: l, mock: l, artefact: l };
    const why = c.pause ? "pause" : wd ? "field" : k === "mock" && s === "artefact" ? "artefact" : k === "field" ? (s === "numeral" ? "numeral" : s === "icon" ? "icon" : "") : solo ? "icon" : c.own ? "rows" : k;
    const alt = c.own ? "" : k === "field" || k === "word" ? (s === "numeral" ? "numeral" : s === "icon" ? o : s === "panel" ? "" : "word") : k === "icon" || solo ? o : k;
    return { why: why && tpl(X, "why", why, p), alt: alt && tpl(X, "alt", alt, p) };
  }

  /** A stored anchor merged into the plan must still be one a builder is registered for: else the slide is left to its stored visual and a note says what was asked. */
  function ok(F, a, X, notes) {
    const good = !a || a.kind === "none" || X.has(a.kind, P.sub(a));
    if (!good) notes.push({ slide: F.id, code: "plan.unsupported", want: [a.kind, P.sub(a)].filter(Boolean).join(":") });
    return good;
  }

  P.emit = function (Fs, ch, X) {
    const slides = [], notes = ch.notes.slice(), used = [], M = X.D.marks;
    for (const x of ch) for (const n of x?.nm || []) used.push(n.n);
    for (const F of Fs) {
      const x = ch[F.i], sv = F.s.visual;
      if (F.type === "cover" || sv?.lock) continue;
      if (/^(?:step|story-beat|setup|share|testimonial)$/.test(F.type) && !F.n.demo && !(F.type === "story-beat" && F.n.items)) notes.push({ slide: F.id, code: "C2.demo-missing" });
      if (F.asset) { notes.push({ slide: F.id, code: "plan.media" }); continue; }
      if (!x) { if (!ok(F, sv?.anchor, X, notes)) continue; slides.push({ id: F.id, visual: { anchor: { kind: "none" }, recipe: "under", tone: "base", ...sv } }); notes.push({ slide: F.id, code: "plan.no-builder" }); continue; }
      const c = x.c, w = words(x, X), a = anchor(x), st = c.own ? c.variant || c.sub : c.variant, pk = F.role === "peak";
      let v = { anchor: a, recipe: c.recipe, tone: x.tn };
      if (c.field) v.field = true;
      if (c.field && c.recipe === "over") v.bleed = "both";
      if (F.span && !(c.kind === "word" && c.sub === "struck")) {   // one text-bound mark on the emphasis span, as the preset allows; an arrow on a mock, chart or scene
        const m = [(pk ? ["circle", "underline"] : ["underline", "kashida", "circle"]).find((t) => X.marks.includes(t)), M.arrowNeeds.anchorKinds.includes(c.kind) && !pk && "arrow"].filter((t) => t && X.marks.includes(t));
        if (m.length) v.marks = m.slice(0, M.perSlide[c.pause ? "pause" : pk ? "peak" : "read"]);
      }
      if (c.own || c.kind === "rows") {
        const rows = F.s.bullets || (F.s.items || []).map((it) => [it.title, it.text].filter(Boolean).join(" "));
        if (rows.length) v.rowIcons = rows.slice(0, 8).map((b) => {
          const pool = V.icons?.find([{ text: P.clean(b), w: 100 }], { dialect: X.ld, k: 12, avoid: X.avoid }) || [];
          return pool.find((e) => P.noun(e, X))?.name || "circle";
        });
      }
      if (c.pause) v.pause = true;
      if (w.why) v.why = w.why;
      if (w.alt) v.alt = w.alt;
      if (x.rl) v.relax = x.rl;
      if (sv) { v = { ...v, ...sv }; if (sv.anchor) v.anchor = { ...a, ...sv.anchor }; }
      if (!ok(F, sv?.anchor && v.anchor, X, notes)) continue;
      if (x.rl) notes.push({ slide: F.id, code: "VA5.relaxed", level: x.rl });
      slides.push(F.v || !st ? { id: F.id, visual: v } : { id: F.id, visual: v, variant: st });
    }
    return { slides, notes, motif: Fs.find((F) => F.hits[0])?.hits[0].obj || "" };
  };
})();
