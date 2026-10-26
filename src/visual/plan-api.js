/* src/visual/plan-api.js - owned by V2. CS.visual.plan(spec, brand, preset, memory, opts) -> {slides: [{id, visual, variant?}], style: {planV, motif?}, notes} (IS-10). Pure.
 * Tables: block cs-art-direction (opts.data); capabilities: opts.caps, else CS.visual.caps(); memory = {posts: [[{kind, treatment?}] by slide, newest first], priors: {kind: points}}.
 * autoPreview(spec, brand, preset) -> [visual | null] aligned with spec.slides, never over a stored plan. */
(function () {
  const V = CS.visual, SIG = /^(?:pile|cluster|specimen|sheet|widgets|niche)$/, SLICE = ["arrow", "underline", "circle", "strike", "sparkle", "kashida"];
  let last;

  function plan(spec, brand, preset, memory, opts) {
    const c = CS.core.canon, st = spec.style || {}, dia = spec.locale?.dialect || "eg", g = brand?.visual?.art || {}, H = spec.canvas?.h || 1440, w = st.world, zones = {}, objs = {};
    opts = opts || {}; memory = memory || opts.memory || {};
    const D = opts.data || V._.block("cs-art-direction"), caps = opts.caps || V.caps?.() || { v: 1, art: {} }, pid = preset?.id || `${st.presetId}`.split("@")[0], aff = preset?.art?.affinity || D?.affinity?.[pid] || {};
    const planV = () => "1.1.0+" + c.fnv1a64(c.canonicalJSON(D)).slice(0, 8) + "+" + `${caps.hash || c.fnv1a64(c.canonicalJSON(caps))}`.slice(0, 8), none = (code) => ({ slides: [], style: { planV: D ? planV() : "" }, notes: [{ slide: "", code }] });
    if (!D?.anchorTable) return none("plan.no-tables");
    if (!preset?.art || st.visualMode === "off") return none("plan.off");
    const cur = w && D.worlds?.find((q) => q.id === w.id), X = {
      D, caps, preset, art: g, mem: (memory.posts || []).slice(0, 3).map((p) => (p || []).map((e) => (typeof e === "string" ? { kind: e } : e || {}))), objs, aff: {},
      avoid: [g.constraints?.figures === "none" && "h", g.constraints?.animals === "none" && "a"].filter(Boolean), pri: opts.priors || memory.priors || {}, rtl: dia !== "en", lang: dia === "en" ? "en" : "ar", dk: dia,
      ld: { levant: "lev", "msa-white": "msa" }[dia] || dia, fnv: c.fnv1a64, tok: { invert: !!preset.tones?.invert, field: !!preset.tones?.field }, sig: (preset.art.templates || []).find((t) => SIG.test(t)) || "",
      motif: st.motif || g.motifIcon || "", n: (spec.slides || []).filter((s) => s.type !== "cover").length, has: (k, s) => !!caps.art?.[k]?.includes(s), marks: (D.marks?.presets?.[pid]?.allow || []).filter((m) => (caps.marks || SLICE).includes(m)) };
    for (const o of V._.block("cs-icon-objects")?.objects || []) objs[o.id] = 1;
    for (const k of Object.keys(aff)) X.aff[k] = aff[k] <= 1 ? (aff[k] * 100 + 0.5) | 0 : aff[k];
    X.zone = (type) => {                      // the computed body zone; the inner one (S-1) on a slide that is not a cover or poster
      const z = V.geometry.zone(preset, H, type), r = CS.core.registry;
      let d = 110;
      try { d = r.geometry(H, { inner: true }).body.h - r.geometry(H).body.h; } catch (e) { d = 110; }
      return (zones[type] = zones[type] || (type === "cover" || type === "poster" ? z : { ...z, h: z.h + d }));
    };
    X.w = w && { ...(cur && Object.values(cur.sequence || {}).flat().every((e) => !e?.sub || X.has(e.kind, e.sub)) ? cur : {}), ...w };
    const input = { ...spec, slides: (spec.slides || []).filter(s => !V.free?.active(s)) };
    const Fs = V._.pl.feat(input, X), out = V._.pl.emit(Fs, V._.pl.run(Fs, X), X), style = { planV: planV() };
    if (!st.motif && (g.motifIcon || out.motif)) style.motif = g.motifIcon || out.motif;
    return { slides: out.slides, style, notes: out.notes };
  }

  /** The preview of the slides without a stored visual, kept only while nothing it was planned from changes: the deck, the whole effective preset, the brand art, the canvas, the capabilities and the art-direction table (by identity). */
  const ids = new WeakMap();
  let seq = 0;
  function autoPreview(spec, brand, preset) {
    const D = V._.block("cs-art-direction"), key = JSON.stringify([spec.id, preset, brand?.visual?.art, spec.slides, spec.locale, spec.style, spec.canvas, V.caps?.(), D && (ids.get(D) || (ids.set(D, ++seq), seq))]), byId = {};
    if (last?.key === key) return last.out;
    for (const s of plan(spec, brand, preset, null).slides) byId[s.id] = s.visual;
    last = { key, out: (spec.slides || []).map((s) => (s.visual || V.free?.active(s) ? null : byId[s.id] || null)) };
    return last.out;
  }

  V._.register("plan", plan);
  V._.register("autoPreview", autoPreview);
})();
