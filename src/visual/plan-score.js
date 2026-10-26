/* src/visual/plan-score.js - owned by V2. Planner steps 3-7 (spec 5.3-5.5): candidates, the fit pass (CS.visual.deadSpace on predicted boxes), the integer score, H1-H8, the ladder R0-R8, S1-S5 and tones.
 * V._.pl.run(Fs, X) -> [{c nm F rl d tn lock? skip?}] with .notes. Integers only; ties end in a hash. PLAN-CHOICE: a demo goes first, a lone icon must be honest, tones are a rhythm. */
(function () {
  const V = CS.visual, P = (V._.pl = V._.pl || {}), SZ = { xs: 40, sm: 64, md: 96, lg: 160, xl: 240, hero: 320 }, LAD = ["lg", "xl", "hero"], BAND = [[8, 15, 40, 12, 20, 50], [18, 30, 60, 24, 40, 70], [10, 20, 101, 15, 24, 101]];
  const FOOT = { numeral: [62, 66], "numeral:waffle": [100, 72], "numeral:icon": [78, 66], word: [82, 62], "field:word": [82, 62] }, CHAT = /^(?:chat|dm|notification|poll|profile)$/, OWN = /^(?:mock|chart|rows|scene|pattern|photo)$/;
  const demoOK = (F, c) => !/^(chat|notes)$/.test(c.sub) || P.demoFits(F.s, c.sub === "notes");
  const NEED = { number: (F) => !!F.num, ordinal: (F) => /^(?:item|step)$/.test(F.type), percent: (F) => !!F.num?.pct, series: (F) => !!F.ser, demo: (F, c) => F.n.demo > 0 && demoOK(F, c), sides: (F) => F.n.sides === 2,
    rows: (F) => F.rowsN > 0, ordered: (F) => F.rowsN > 0, short: (F) => F.words <= 12, mockwords: (F, c) => (CHAT.test(c.sub) ? F.mwc : F.mwn) > 0 && (!F.n.demo || demoOK(F, c)),
    noun: (F, c, X) => F.pool.some((e) => nounOf(e, X)), objnoun: (F, c, X) => F.pool.some((e) => nounOf(e, X) && X.objs[e.object]) };
  const OLD = /^(?:stamp|grid|cards|keyword)$/;   // variants the 1.0 engine drew: a preset that lists one may use it; a newer variant needs the capabilities to list it
  const icons = (c) => c.kind === "icon" || c.kind === "scene", hitN = (c) => +(c.needs.find((n) => n.startsWith("hit:")) || "hit:0").slice(4), kind = (x) => x.c.kind;
  const iconic = (c) => icons(c) || (/^(?:field|numeral|chart)$/.test(c.kind) && /^icon(?:-bars)?$/.test(c.sub));
  const carries = (c) => c.kind === "mock" && /^(?:chat|notes)$/.test(c.sub) && (c.needs || []).some((n) => n === "demo" || n === "mockwords");   // a mock that draws the demo lines
  const dmo = (F, c) => F.n.demo > 0 && carries(c);
  const has = (t, k) => (`${t}`.replace(/[٠-٩۰-۹]/g, (d) => d.charCodeAt(0) & 15).replace(/٫/g, ".").replace(/٬/g, ",").match(/[0-9]{1,3}(?:,[0-9]{3})+(?:\.[0-9]+)?|[0-9]+(?:\.[0-9]+)?/g) || []).some((m) => m.replace(/,/g, "") === k.replace(/^-/, ""));   // a figure token inside a text, whole: digits and separators folded as plan-features folds them
  const blk = (x) => { const n = P.clean(x).length; return { w: Math.min(852, Math.min(n, 40) * 21), h: Math.ceil(n / 40) * 74, g: 24 }; };   // a native bullet: body 46 px, 40 characters a line

  
  function nounOf(e, X) {
    const S = V._.stem;
    if (e.nn == null) {
      const L = [e.name, e.object].flatMap((n) => { const m = n && V.icons.meta(n); return m ? m.ar.concat(m.en) : []; }).map((x) => S.norm(x));
      e.nn = e.rung < 7 && !!e.via && (L.includes(S.norm(e.via)) || S.tok(e.via).some((t) => S.cands(t.n, X.ld).some((w) => L.includes(w))));
    }
    return e.nn;
  }
  
  const bad = (e, X) => { const cl = X.D.rhythm.scoring.cliche; return !!e && ((cl.metaphorConcepts || []).includes(e.concept) || (e.rung >= 5 && !nounOf(e, X)) || (e.rung >= cl.fromRung && (cl.icons.includes(e.name) || cl.objects.includes(e.object)))); };
  
  const elig = (e, c, X) => nounOf(e, X) && (!c.needs.includes("objnoun") || !!X.objs[e.object]);

  
  function wide(v, w) {
    const K = CS.art?.chart?.ew, cap = ((w * 7) / 10) | 0;
    if (K) { const e = K(v); return Math.floor(Math.min(520, cap / e)) < Math.ceil((206 * K(v, true)) / e); }
    return 206 * Array.from(`${v}`).reduce((a, c) => a + (c === "1" ? 0.55 : /[%٪]/.test(c) ? 1.02 : /[.,٫٬ \/]/.test(c) ? 0.34 : 0.72), 0) > cap;
  }

  function need(n, F, c, X) {
    const m = /^(items|bullets|hit):(\d+)(?:-(\d+))?$/.exec(n), k = m && (m[1] === "hit" ? F.hits.length : F.n[m[1]]);
    return m ? k >= m[2] && k <= (m[3] || 99) : !!NEED[n]?.(F, c, X);
  }

  function cands(F, X) {
    const t = X.D.anchorTable.types[F.type], v = F.s.visual, a = v?.anchor, vs = X.caps.variants?.[F.type] || [], pv = X.preset.variants?.[F.type] || [], rc = X.caps.recipes, out = [];
    const w = a?.kind && P.want(a), sb = (r) => (r.kind === "icon" ? "icon" : r.sub === "@signature" ? X.sig : r.sub), exact = w && t?.candidates?.some((r) => r.kind === a.kind && sb(r) === w);   // the sub the stored anchor asks for
    if (!t || t.planned === false || F.asset) return out;
    if (F.num && F.reps > 1 && F.wt && has(F.wt, F.num.k)) F.wt = [].concat(F.wts || [], F.key || []).find((x) => !has(x, F.num.k)) || "";   // S-13: a word that is the figure would print it a third time
    for (const r of t.candidates) {
      const sub = w && !exact && r.kind === a.kind && X.has(r.kind, w) ? w : sb(r), own = /^(?:bento|tiles|rail)$/.test(r.sub), c = { ...r, sub, own, sizes: r.sizes || [], needs: r.needs || [] };
      if (!a?.kind && r.kind === "icon" && (F.num || F.n.demo || F.rowsN)) continue;
      if (!sub || (rc && !rc.includes(r.recipe)) || X.art.avoid?.includes(r.kind) || (a?.kind && a.kind !== r.kind) || (w && sub !== w) || (v?.recipe && v.recipe !== r.recipe)) continue;
      if (own ? !vs.includes(sub) : !X.has(r.kind, sub) || (r.variant && !vs.includes(r.variant) && !(OLD.test(r.variant) && pv.includes(r.variant)))) continue;
      if (c.needs.some((n) => !need(n, F, c, X)) || ((r.kind === "word" || sub === "word") && !F.wt) || ((r.kind === "numeral" || sub === "numeral") && F.reps > 1)) continue;
      if (r.kind === "numeral" && sub === "icon" && (F.v || r.variant) === "numeral") continue;   // the native ordinal numeral owns that slide: it has no room for a companion icon
      if (r.icon && !(r.icon === "@cta" ? X.D.ctaIcons[F.s.cta?.kind] : V.icons?.has(r.icon))) continue;
      if (F.num && r.kind === "numeral" && c.needs.includes("ordinal") && F.v !== "numeral" && !a?.kind) {
        delete c.variant; c.bold = true;
        if (c.sub === "none" && F.num.pct && X.has("numeral", "waffle")) c.sub = "waffle";
      }
      out.push(c);
    }
    // A demo may use either supported reader, provided every line fits it.
    if (F.n.demo && !w && [-2, -1, 0].some((o) => [0, 1, 2].every((n) => X.Fs?.[F.i + o + n]?.n.demo))) for (const c of out.slice()) if (carries(c)) {
      const sub = c.sub === "notes" ? "chat" : "notes", alt = { ...c, id: c.id + "." + sub, sub, demoAlternative: true };
      if (X.has("mock", sub) && demoOK(F, alt) && !out.some((q) => q.kind === "mock" && q.sub === sub && q.recipe === c.recipe)) out.push(alt);
    }
    return out;
  }

  
  const keep = (F, c) => (F.v === "numeral" && c.kind !== "numeral" ? [{ w: 700, h: 350, g: 24 }] : []).concat(F.n.demo && carries(c) ? (F.s.bullets || []).map(blk).concat(F.type === "testimonial" && F.num && !has(F.s.demo.lines.map((l) => l.text).join(" "), F.num.k) ? [{ w: 600, h: 360, g: 24 }] : []) : []);

  
  function fit(F, c, X) {
    const Z = X.zone(F.type), z = { ...Z, h: Z.h - (F.bridge ? 86 : 0) }, bl = P.blocks(F, c).concat(keep(F, c)), G = V.geometry, k = c.kind, s = c.sub, cap = c.recipe === "full" && F.sub ? 56 : 0, own = OWN.test(k), n = F.rowsN || F.n.items;
    const mn = c.pause ? 0 : X.D.anchorTable.types[F.type].min || 0, cls = BAND[c.pause ? 1 : F.type === "poster" ? 2 : 0], ig = k === "icon" || (k === "scene" && s === "solo") || (k === "field" && s === "icon");
    const lm = c.own ? [0, 0] : k === "rows" && n < 5 ? [164 * n, 200 * n + 40] : G.limits(k, n || 3), q = FOOT[k + ":" + s] || FOOT[k];
    let best = { lvl: 2, sz: null, share: 0, tf: 0 };
    for (const sz of c.sizes.length ? c.sizes : ig ? LAD : [null]) {
      const R = G.recipe(c.recipe, { zone: z, T: P.height(bl), kind: k, n, field: c.field, words: F.words, rtl: X.rtl, captionH: cap }), B = [], at = (kind, x, y, w, h, o) => B.push({ kind, x, y, w, h, ...o });
      const d = R.A - R.anchor.h, ab = d > 0 && d <= 150 && /^(?:under|over)$/.test(c.recipe) ? d : 0, a = { ...R.anchor, h: R.anchor.h + ab };   // up to 150 px left over: the text grows to take it
      let y = R.text.y + (c.recipe === "over" ? ab : 0), w = a.w, h = Math.max(Math.min(lm[1] && a.h - lm[1] > 150 ? lm[1] : a.h, a.h), Math.min(lm[0], a.h));
      if (ig) w = h = ((SZ[sz || "xl"] * (c.treatment === "giant" ? 175 : 160)) / 100) | 0;
      else if (q) { w = ((a.w * q[0]) / 100) | 0; h = Math.min(a.h, Math.max(lm[0], ((a.h * q[1]) / 100) | 0)); }
      for (const b of bl) { at("text", c.recipe === "center" ? ((R.text.w - b.w) / 2) | 0 : X.rtl ? R.text.x + R.text.w - b.w : R.text.x, y, b.w, b.h); y += b.h + b.g; }
      if (own || c.field) {
        const t = ig && c.field, pw = t ? Math.min(a.w, w + 96) : a.w, ph = Math.min(a.h, t ? h + 96 : own ? h : a.h), x = a.x + (((a.w - pw) / 2) | 0), o = a.y + (((a.h - ph) / 2) | 0);
        at("owner", x, o, pw, ph, { id: "a", fill: 1 }); at("ink", x + 36, o + 36, Math.max(1, pw - 72), Math.max(1, ph - 72), { ownerOf: "a" });
      } else at("ink", a.x + (((a.w - w) / 2) | 0), a.y + (((a.h - h) / 2) | 0), w, h);
      const H = R.caption ? R.caption.y : z.h, m = V.deadSpace(B, { w: Z.w, h: H }), share = ((m.anchorShare * H) / Z.h + 0.5) | 0;   // the bridge and the caption line stay outside the measured zone
      const feas = R.ok && w <= a.w && h <= a.h && m.owners.every((o) => o.ok) && !((k === "numeral" || s === "numeral") && wide(c.variant === "numeral" || !F.num ? `${F.ord}` : F.num.v, a.w)), lvl = !feas ? 2 : share >= mn && m.band < cls[0] && m.rect < cls[1] && m.fill < cls[2] ? 0 : share * 5 >= mn * 4 && m.band < cls[3] && m.rect < cls[4] && m.fill < cls[5] ? 1 : 2;
      if (lvl < best.lvl || !best.sz) best = { lvl, feas, sz, share, tf: R.ok ? 100 : 0 };   // level 0: no NOTE-level dead space; 1: FIX-level only; 2: over it
      if (!lvl) break;
    }
    return best;
  }

  
  function base(F, c, X) {
    const sc = X.D.rhythm.scoring, cl = sc.cliche, hn = hitN(c), top = F.pool.find((e) => elig(e, c, X)), w = X.w, mem = [].concat(...X.mem), st = F.i === X.bold ? "reveal" : /^(?:rehook|cta)$/.test(F.type) ? F.type : F.role === "operate" ? "operate" : "read", dm = dmo(F, c);
    const ev = Math.max(c.needs.some((n) => !n.startsWith("hit:")) ? 100 : 0, (hn && F.hits[hn - 1]?.n) || 0), nv = mem.filter((e) => e.kind === c.kind && (!e.treatment || !c.treatment || e.treatment === c.treatment)).length;
    let s = 30 * c.fit + 40 * ev + 15 * (X.aff[c.kind] ?? 50) + 10 * (mem.length ? 100 - Math.floor((200 * nv + mem.length) / (2 * mem.length)) : 100) + 5 * c.f.tf - (dm ? 1500 : 3000) * c.f.lvl + (dm ? sc.adjust.demo : 0);
    if (X.art.prefer?.includes(c.kind)) s += sc.adjust.brandPrefer;
    s += Math.max(-1500, Math.min(1500, X.pri[c.kind] || 0));
    if (iconic(c) && !c.icon && bad(top, X)) s += cl.points;
    if (c.kind === "icon" && !c.field && !c.icon) s += sc.adjust.lone;   // numeral-plain and field-word outrank an icon the lookup picked alone on the page
    if (iconic(c) && top?.object && X.objs[top.object] && !bad(top, X)) s += 1800;
    if (F.num && c.kind === "numeral" && c.variant !== "numeral") s += /^(?:waffle|bar)$/.test(c.sub) ? 2200 : c.sub === "none" ? 1200 : 0;
    if (w && (w.mockPrefer?.some((m) => c.kind === "mock" && (m === c.sub || m === c.artefact)) || [].concat(w.sequence?.[st] || []).some((e) => e.kind === c.kind && (!e.sub || e.sub === c.sub)))) s += sc.adjust.world;
    return s;
  }

  
  function names(F, c, X, ch, R) {
    if (!iconic(c)) return [];
    const used = {}, adj = {}, out = [], seen = {}, mx = R.H3?.maxUses ?? 99, n = c.kind === "scene" ? Math.max(hitN(c), 1) : 1, fx = c.icon === "@cta" ? X.D.ctaIcons[F.s.cta?.kind] : c.icon;
    ch.forEach((x, j) => { if (x && j !== F.i) for (const e of x.nm) { used[e.n] = (used[e.n] || 0) + 1; if (R.H3 && Math.abs(j - F.i) <= 1) adj[e.n] = 1; } });
    const free = (k) => k === X.motif || ((used[k] || 0) < mx && !adj[k]);
    if (fx) return free(fx) ? [{ n: fx }] : null;
    for (const e of F.pool) {
      const o = e.object && X.objs[e.object], k = o ? e.object : e.name;
      if (out.length >= n || seen[e.concept || k] || !free(k) || !elig(e, c, X)) continue;
      seen[e.concept || k] = 1; out.push({ n: k, o: o ? 1 : 0, e });
    }
    return out.length >= n ? out : null;
  }

  function rules(X, L) {
    if (X.RL[L]) return X.RL[L];
    const R = {};
    for (const [k, v] of Object.entries(X.D.rhythm.hard)) R[k] = { ...v };
    for (let i = 0; i <= L; i++) {
      const r = X.D.rhythm.relax[i];
      for (const k of r.drop) delete R[k];
      for (const [k, v] of Object.entries(r.set)) { const q = k.split("."); (R[q[0]] = R[q[0]] || {})[q[1]] = v; }
    }
    return (X.RL[L] = R);
  }

  const key2 = (x) => [x.F.type, x.v, x.c.recipe, x.c.kind].join("|");
  const runKind = (x) => x.F.n.demo ? null : kind(x);
  const runKey = (x) => x.F.n.demo ? null : key2(x);
  function runOf(ch, i, f, w) { let n = 1, j; for (j = i - 1; ch[j] && f(ch[j]) === f(w); j--) n++; for (j = i + 1; ch[j] && f(ch[j]) === f(w); j++) n++; return n; }

  function valid(F, ch, c, X, R, nm, ex) {
    const i = F.i, Fs = X.Fs, w = { c, F, v: F.v || c.variant, nm }, nb = [ch[i - 1], ch[i + 1]], k = [-5, -4, -3, -2, -1, 0].map((o) => (o ? ch[i + o] && key2(ch[i + o]) : key2(w)));
    if (R.H1 && !ex && ((!F.n.demo && runOf(ch, i, runKind, w) > R.H1.maxRunKind) || (R.H1.maxRunKind < 3 && icons(c) && nb.some((x) => x && icons(x.c))))) return false;
    if (R.H2 && !ex && ((!F.n.demo && runOf(ch, i, runKey, w) > R.H2.maxRunKey) || (!k.includes(undefined) && k[0] === k[2] && k[2] === k[4] && k[1] === k[3] && k[3] === k[5] && k[0] !== k[1]))) return false;
    if (R.H5 && c.pause && (nb.some((x) => x?.c.pause) || ch.filter((x, q) => x?.c.pause && q !== i).length + 1 > Math.max(1, (X.n / R.H5.per) | 0) || Fs[i + 1]?.type === "cta")) return false;
    return !(R.H7 && X.bold === i && !c.bold) && !(R.H8 && R.H8.types.includes(F.type) && c.share < R.H8.minShare);
  }

  function dyn(F, c, ch, X) {
    const p = ch[F.i - 1], q = X.D.rhythm.soft, dm = dmo(F, c);   // a drawn demo does not wait for variety
    return c.s + (!dm && p?.c.kind === c.kind ? q.S1 : 0) + (!dm && p?.c.recipe === c.recipe ? q.S2 : 0) + (X.mem[0]?.[F.i]?.kind === c.kind ? q.S3 : 0) + (ch.some((x) => x?.c.kind === c.kind) ? 0 : q.S4)
      + (F.role === "read" && p?.F.role === "peak" && c.share <= (X.D.anchorTable.types[F.type].target ?? -1) ? q.S5 : 0);
  }

  
  function choose(F, ch, X, L, skip, ex) {
    const R = rules(X, L), pool = [];
    for (const c of F.cs) { const nm = names(F, c, X, ch, R), e = { c, nm, d: 0 }; if (nm && !skip?.(e)) { e.d = dyn(F, c, ch, X); pool.push(e); } }
    const sameDemo = (e) => dmo(F, e.c) ? [ch[F.i - 1], ch[F.i + 1]].filter((x) => x && dmo(x.F, x.c) && x.c.sub === e.c.sub).length : 0;
    pool.sort((a, b) => sameDemo(a) - sameDemo(b) || +!!a.c.demoAlternative - +!!b.c.demoAlternative || b.d - a.d || b.c.share - a.c.share || icons(a.c) - icons(b.c) || (a.c.h < b.c.h ? -1 : 1));
    for (const e of pool) if (valid(F, ch, e.c, X, R, e.nm, ex)) return { c: e.c, F, v: F.v || e.c.variant, nm: e.nm, rl: L, d: e.d };
  }

  function bolds(Fs, X) {
    const inner = Fs.filter((F) => F.cs.length), t = ((66 * inner.length + 50) / 100) | 0, b = X.w?.boldMove?.slide, w = b && Fs.find((F) => F.id === b), can = (F) => F && !F.s.visual?.lock && !(F.n.demo && F.cs.some(carries)) && F.cs.some((c) => c.bold);   // a slide whose demo is drawn is not the bold one
    if (can(w)) return w.i;
    for (let d = 0; d < inner.length; d++) for (const F of [inner[t - 1 + d], inner[t - 1 - d]]) if (can(F)) return F.i;
    return -1;
  }

  
  function repair(Fs, ch, X) {
    const H4 = X.D.rhythm.hard.H4, kinds = () => new Set(ch.filter(Boolean).map(kind));
    for (let sw = 0; X.n >= H4.minInner && kinds().size < H4.minKinds && sw < H4.maxSwaps; sw++) {
      const ks = kinds();
      let best = null;
      for (const F of Fs) {
        const x = ch[F.i], y = x && !x.lock && F.role !== "peak" && F.i !== X.bold && !dmo(F, x.c) && choose(F, ch, X, x.rl, (e) => ks.has(e.c.kind));
        if (y && (!best || x.d - y.d < best.l)) best = { y, l: x.d - y.d };
      }
      if (!best) break;
      ch[best.y.F.i] = best.y;
    }
    return X.n >= H4.minInner && kinds().size < H4.minKinds;
  }

  
  function tones(ch, X) {
    const T = X.D.tones, W = T.cost, Q = T.rhythm, S = X.Fs.filter((F) => F.type !== "cover"), n = S.length, tk = X.tok, TN = ["base", tk.field && "field", tk.invert && "invert"].filter(Boolean);
    const R = rules(X, Math.max(0, ...ch.filter(Boolean).map((x) => x.rl))), must = n >= Q.minInner && !!(tk.field && tk.invert), run = R.H6?.maxRunNonBase ?? 99;
    const lim = (add) => Math.max(Q.minNonBase, (((T.toneBias[X.w?.toneBias || "balanced"] + add) * n) / 100) | 0), r3 = X.D.rhythm.relax[3].set;
    const fr = X.preset.tones?.field?.roles || {}, rr = X.preset.roles || {}, hx = (v) => (typeof v === "string" && rr[v]) || "", blind = !!hx(fr.accent) && hx(fr.accent) === hx(fr.bg);   // the field tone paints card 2 in the page colour
    const O = S.map((F) => {
      const x = ch[F.i], st = F.s.visual?.tone;
      if (!x || x.lock || x.skip || st) return [[st || "base", 0]];
      const ps = x.c.pause || F.role === "pause", w0 = T.desire[ps ? "pause" : F.role], want = TN.includes(w0) ? w0 : "base", bd = F.i === X.bold && !ps && want === "base";
      const no = blind && /^(?:compare|myth-fact)$/.test(F.type) && x.c.kind === "field" && x.c.sub === "panel";
      return TN.filter((t) => !(no && t === "field")).map((t) => [t, t === want ? 0 : want === "base" ? (bd && t === T.desire.bold ? W.boldBreak : t === T.breakRun.tone ? W.extra : W.extra + 1) : W.miss + (t === "base" ? +(F.type === "cta") : W.extra)]);
    });
    const solve = (cap, run, must, hard) => {
      let cur = new Map([["|0|0|00", { c: 0, a: [] }]]), best = null;
      S.forEach((F, i) => {
        const nx = new Map();
        for (const [key, st] of cur) {
          const [l, r0, k0, fl] = key.split("|");
          for (const [t, cs] of O[i]) {
            const nb = t !== "base", r = nb ? +r0 + 1 : 0, k = +k0 + nb, e = t[0];
            const tr = must && l === e + e;
            if (r > run || k > cap || (tr && hard)) continue;
            const c = st.c + cs + (tr ? W.triple : 0) + (nb && l.slice(-1) === e ? W.same : 0), f = +(fl[0] === "1" || t === "field"), v = +(fl[1] === "1" || t === "invert"), kk = [(l + e).slice(-2), r, k, "" + f + v].join("|"), old = nx.get(kk);
            if (!old || c < old.c) nx.set(kk, { c, a: st.a.concat(t) });
          }
        }
        cur = nx;
      });
      for (const [key, st] of cur) { const q = key.split("|"); if ((!must || (+q[2] >= Q.minNonBase && q[3] === "11")) && (!best || st.c < best.c)) best = st; }
      return best;
    };
    const c0 = lim(T.shareCapAdd), r3n = r3["H6.maxRunNonBase"] || run;
    let H;
    if (must) for (const r of [run, r3n]) for (let c = c0; !H && c <= n; c++) { const a = solve(c, r, must, 1); if (a) H = { a, c, r }; }   // the share cap yields by the fewest slides the rule needs
    const res = H ? H.a : solve(lim(r3["tones.shareCapAdd"] || 0), r3n, must) || solve(c0, run, false) || solve(99, 99, false);   // else relax level 3, then the field and invert it owes are given up
    if (H && (H.c > c0 || H.r > run)) ch.notes.push({ slide: S[0].id, code: "plan.tones-relaxed", cap: c0, share: H.a.a.filter((t) => t !== "base").length, run: H.r });
    S.forEach((F, i) => { if (ch[F.i]) ch[F.i].tn = res ? res.a[i] : "base"; });
  }

  P.cands = cands; P.wide = wide; P.noun = nounOf;
  P.run = function (Fs, X) {
    const ch = [], fixed = (F, c, nm, o) => (ch[F.i] = { c, F, nm, rl: 0, d: 0, ...o });
    ch.notes = []; X.RL = []; X.Fs = Fs;
    for (const F of Fs) {
      const v = F.s.visual, a = v?.anchor, all = cands(F, X), dm = F.n.demo > 0;
      for (const c of all) { c.f = fit(F, c, X); c.share = c.f.share; c.h = X.fnv(F.id + "|" + c.id); }
      F.cs = all.filter((c) => c.f.lvl < 2 || c.floor || c.own || (c.f.feas && ((dm && carries(c)) || (F.num && c.kind === "numeral"))));
      if (F.cs.some((c) => c.own)) F.cs = F.cs.filter((c) => c.own);   // grid and timeline draw their items themselves: that layout is the anchor
      for (const c of F.cs) if (c.own) c.kind = "none";
      if (F.asset) fixed(F, { kind: "photo", recipe: "under", share: 50 }, [], { skip: 1 });
      else if (v?.lock) fixed(F, { kind: a?.kind || "none", recipe: v.recipe || "under", share: 50, pause: !!v.pause }, [a?.icon, a?.object].filter(Boolean).map((n) => ({ n })), { lock: 1, v: F.v });
    }
    X.bold = bolds(Fs, X);
    for (const F of Fs) for (const c of F.cs) c.s = base(F, c, X);
    const dm = (F) => F.n.demo > 0 && F.cs.some(carries), few = (F) => (dm(F) ? -1 : +(F.cs.filter((c) => !c.floor).length > 1));   // a demo slide, then a slide with one real candidate (or none), is chosen first: the others work around it
    for (const F of Fs.slice().sort((a, b) => few(a) - few(b) || a.i - b.i)) for (const ex of dm(F) ? [1, 0] : [0]) for (let L = 0; L <= 8 && !ch[F.i] && F.cs.length; L++) {
      const x = choose(F, ch, X, L, ex ? ((e) => !carries(e.c)) : undefined, ex);   // a mock that draws the demo first, whatever the kind and key runs say: the note names the ladder level they would have needed
      let l = L;
      if (x) { while (ex && l < 8 && !valid(F, ch, x.c, X, rules(X, l), x.nm)) l++; if (l > L) { x.rl = l; ch.notes.push({ slide: F.id, code: "plan.demo-first", level: l }); } }
      ch[F.i] = x;
    }
    const weak = repair(Fs, ch, X), f0 = Fs.find((F) => F.cs.length)?.id;
    tones(ch, X);
    if (weak) { (ch.find((y) => y && !y.lock && !y.skip) || {}).rl = 2; ch.notes.push({ slide: f0, code: "VA5.variety" }); }
    if (X.bold < 0 && f0) ch.notes.push({ slide: f0, code: "VA5.no-bold" });
    for (const F of Fs) if (F.n.demo && F.type !== "cover" && !F.asset && !ch[F.i]?.lock && !carries(ch[F.i]?.c || {})) ch.notes.push({ slide: F.id, code: "plan.demo-undrawn" });   // the demo lines reach no slide
    return ch;
  };
})();
