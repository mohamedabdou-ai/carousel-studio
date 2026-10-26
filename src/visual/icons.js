/* src/visual/icons.js - owned by D3. CS.visual.icons: the lookup ladder of spec 3.1 (integer scores 35 30 30 20, 75% for stems, 10, 5). Pure. */
(function () {
  var V = CS.visual, S = V._.stem, st = null, BITS = { eg: 1, gulf: 2, lev: 4, mag: 8, msa: 16, loan: 32 };

  function dict() { return Object.create(null); }
  function put(m, k, v) { (m[k] = m[k] || []).push(v); }
  function words(s) { return s ? String(s).split(" ") : []; }
  function lt(a, b) { return a < b ? -1 : a > b ? 1 : 0; }

  function build() {
    var b = V._.block, k = [b("cs-icon-pack"), b("cs-icon-index"), b("cs-icon-concepts"), b("cs-icon-stem")], T, K, H, list, w;
    if (st && st.k[0] === k[0] && st.k[1] === k[1] && st.k[2] === k[2] && st.k[3] === k[3]) return st;
    T = S.tbl(); H = T.raw.home || {};
    K = st = { k: k, T: T, P: (k[0] && k[0].icons) || {}, R: dict(), cp: dict(), ct: dict(), kp: dict(), kt: dict(), en: dict(), hk: dict(), hc: dict(), al: dict(), neg: dict(), def: T.raw.def || {} };
    (k[1] || []).forEach(function (r) { K.R[r[0]] = { name: r[0], cat: r[1], en: r[2] || [], ar: r[3] || [], fl: r[4] || {} }; });
    words(T.raw.neg).forEach(function (x) { var p = x.split("@"); K.neg[p[0].split("_").join(" ")] = p[1] || ""; });
    Object.keys(H).forEach(function (key) {
      K.hk[key] = H[key].map(function (s, i) { var c = words(s[0]); return { cats: c, cues: words(s[2]), c: { id: "home:" + key + ":" + i, cat: c[0], icons: words(s[1]), home: key } }; });
    });
    list = ((k[2] && k[2].concepts) || []).slice();
    w = T.raw.warn;
    if (w && !list.some(function (c) { return c.id === "warning"; })) list.push({ id: "warning", cat: "arrows-ui", pol: "warn", icons: words(w.i), forms: { msa: words(w.f) } });
    list = list.map(function (c) {
      var cf = dict(), dn;
      for (dn in BITS) (c.forms && c.forms[dn] || []).forEach(function (x) { var f = S.norm(x); if (f) cf[f] = (cf[f] || 0) | BITS[dn]; });
      return [c, cf, c.home && S.norm(c.home)];
    });
    list.forEach(function (x) {
      var h = x[2];
      if (!h || !K.hk[h]) return;
      put(K.hc, h, x[0]);
      Object.keys(x[1]).forEach(function (f) { if (f.indexOf(" ") < 0 && f !== h && S.cands(f).indexOf(h) > 0) { K.al[f] = h; K.hk[f] = K.hk[h]; } });
    });
    list.forEach(function (x) {
      Object.keys(x[1]).forEach(function (f) { if (f.indexOf(" ") > 0) put(K.cp, f, [x[0], x[1][f]]); else if (!K.hk[f]) put(K.ct, f, [x[0], x[1][f]]); });
    });
    Object.keys(K.R).forEach(function (n) {
      var r = K.R[n];
      r.ar.forEach(function (x) { var f = S.norm(x); if (f.indexOf(" ") > 0) put(K.kp, f, n); else if (f && !K.hk[f]) put(K.kt, f, n); });
      r.en.concat(n.indexOf("-") < 0 || /^(?:cs|tb)-/.test(n) ? [] : [n]).forEach(function (x) { var f = S.norm(x); if (f) put(K.en, f, n); });
    });
    return K;
  }

  function topics(t) { return t ? (typeof t === "string" ? [t] : t.slice()) : []; }
  function negOk(K, key, d) { var v = K.neg[key]; return v !== undefined && (!v || !d || d === "auto" || v === d); }
  function combos(lists) {
    var out = [""];
    lists.forEach(function (c) { var nx = []; out.forEach(function (p) { c.forEach(function (x) { nx.push(p ? p + " " + x : x); }); }); out = nx; });
    return out;
  }
  function firstOf(a, fn) { var i; for (i = 1; i < a.length; i++) if (fn(a[i])) return a[i]; return null; }

  /* Ladder hits {k: c|i, ref, r: rung, s: score, fi, i, e, f: form, rw: as typed, a: dialect, n: negated}. */
  function scan(q, o) {
    var K = build(), T = K.T, d = o.dialect, db = BITS[d] ? BITS[d] | 48 : 0, tp = topics(o.topic), H = [], N = [], bag = S.bag(q);
    (Array.isArray(q) ? q : [q]).forEach(function (fld, fi) {
      var f = fld && typeof fld === "object" ? { text: fld.text, w: fld.w == null ? 100 : fld.w } : { text: fld, w: 100 };
      var tk = S.tok(f.text), n = tk.length, cm = dict(), i, l, ph, t, cc, A, B, a, b;
      function cs(x) { return cm[x] || (cm[x] = S.cands(x, d)); }
      function add(kind, ref, rung, base, bits) {
        var s = Math.floor(base * f.w / 100);
        if (s > 0) H.push({ k: kind, ref: ref, r: rung, s: s, fi: fi, i: i, e: i + l - 1, f: ph, a: bits & db ? 1 : 0, rw: tk.slice(i, i + l).map(function (x) { return x.r; }).join(" ") });
      }
      function adds(list, kind, rung, base) {
        (list || []).forEach(function (x) { if (kind === "c") add("c", x[0], rung, base, x[1]); else add("i", x, rung, base, 0); });
      }
      function sense(key, rung, base) {
        var ss = K.hk[key], hc = K.hc[K.al[key] || key] || [], s = ss[S.pick(ss, bag, tp, cs(K.al[key] || key))], c = s.c, j;
        for (j = 0; j < hc.length; j++) if (s.cats.indexOf(hc[j].cat) >= 0) { c = hc[j]; break; }
        add("c", c, rung, base, 0);
      }
      for (i = 0; i < n; i++) {
        if (S.negIn(tk[i].n)) { tk[i].n = S.negIn(tk[i].n); N.push({ fi: fi, at: i, end: i, own: 1 }); }
        else if (negOk(K, tk[i].n, d)) { tk[i].x = 1; N.push({ fi: fi, at: i, end: i }); }
        else if (i + 1 < n && negOk(K, tk[i].n + " " + tk[i + 1].n, d)) { tk[i].x = tk[i + 1].x = 1; N.push({ fi: fi, at: i, end: i + 1 }); i++; }
      }
      for (i = 0; i < n; i++) tk[i].s = tk[i].x || tk[i].n.length < 2 || T.stop[tk[i].n] || T.stop[S.base(tk[i].n)];
      for (i = 0; i < n; i++) for (l = Math.min(3, n - i); l > 0; l--) {
        ph = tk.slice(i, i + l).map(function (x) { return x.n; }).join(" ");
        adds(K.en[ph] || (l === 1 && K.en[cs(ph)[1]]), "i", 6, 10);
        if (l > 1) {
          adds(K.cp[ph], "c", 1, 35); adds(K.kp[ph], "i", 3, 30);
          if (!K.cp[ph] && !K.kp[ph]) {
            combos(tk.slice(i, i + l).map(function (x) { return cs(x.n).slice(0, 4); })).slice(1).forEach(function (p) { adds(K.cp[p], "c", 5, 26); adds(K.kp[p], "i", 5, 22); });
          }
        } else if (!tk[i].s) {
          t = tk[i].n; cc = cs(t); A = K.ct[t]; B = K.kt[t];
          if (K.hk[t]) sense(t, 2, 30);
          adds(A, "c", 2, 30); adds(B, "i", 4, 20);
          if (!K.hk[t] && !A && !B) {
            a = firstOf(cc, function (c) { return K.ct[c] || K.hk[c]; });
            b = firstOf(cc, function (c) { return K.kt[c]; });
            if (a && K.hk[a]) sense(a, 5, 22); else adds(K.ct[a], "c", 5, 22);
            adds(K.kt[b], "i", 5, 15);
          }
        }
      }
    });
    /* A negation marks the hits of the nearest word after it (3 tokens at most), else before it; a bound one marks its own. */
    N.forEach(function (m) {
      var best = null, bd = 99;
      H.forEach(function (h) {
        var x;
        if (h.fi !== m.fi || (h.k === "c" && h.ref.pol)) return;
        x = m.own ? (h.i <= m.at && h.e >= m.at ? 0 : 99) : h.i > m.end && h.i - m.end <= 3 ? h.i - m.end : h.e < m.at && m.at - h.e <= 3 ? 10 + m.at - h.e : 99;
        if (x < bd || (x === bd && best && h.s > best.s)) { bd = x; best = h; }
      });
      if (best) H.forEach(function (h) { if (h.fi === best.fi && h.i === best.i) h.n = 1; });
    });
    return H;
  }

  /* One entry per concept (best hit, support), best first. */
  function ranked(H) {
    var by = dict(), arr = [];
    H.forEach(function (h) {
      var e;
      if (h.k !== "c") return;
      e = by[h.ref.id] || (by[h.ref.id] = { c: h.ref, s: 0, r: 9, g: 1e9, sup: 0, a: 0, rw: "", neg: false });
      if (!e.sup) arr.push(e);
      e.sup++; e.a = e.a || h.a; e.neg = e.neg || !!h.n;
      if (h.s > e.s || (h.s === e.s && h.fi * 1000 + h.i < e.g)) { e.s = h.s; e.r = h.r; e.g = h.fi * 1000 + h.i; e.rw = h.rw; }
    });
    return arr.sort(function (a, b) { return b.s - a.s || b.neg - a.neg || b.sup - a.sup || b.a - a.a || a.g - b.g || lt(a.c.id, b.c.id); });
  }

  function find(q, o) {
    var K, H, cs, cand = dict(), arr = [], ex = dict(), k, pol, j;
    o = o || {}; K = build(); H = scan(q, o); cs = ranked(H); k = o.k > 0 ? o.k : 5;
    (o.exclude || []).forEach(function (n) { ex[n] = 1; });
    function upd(n, s, r, src, rank, c, sup, via, a, ng, g) {
      var e = cand[n];
      if (!e) { e = cand[n] = { name: n, s: -1, src: 9, rank: 99, sup: 0 }; arr.push(e); }
      e.sup += sup;
      if (s > e.s || (s === e.s && (src < e.src || (src === e.src && rank < e.rank)))) { e.s = s; e.r = r; e.src = src; e.rank = rank; e.c = c; e.via = via; e.a = a; e.ng = ng; e.g = g; }
    }
    cs.forEach(function (e) { (e.c.icons || []).forEach(function (n, i) { upd(n, e.s, e.r, 0, i, e.c, e.sup, e.rw, e.a, e.neg, e.g); }); });
    H.forEach(function (h) { if (h.k === "i") upd(h.ref, h.s, h.r, h.r === 6 ? 2 : 1, 0, null, 1, h.rw, h.a, !!h.n, h.fi * 1000 + h.i); });
    topics(o.topic).forEach(function (cat) { words(K.def[cat]).forEach(function (n) { if (!(K.R[n] && K.R[n].fl.o)) upd(n, 5, 7, 3, 0, null, 0, cat, 0, false, 0); }); });
    pol = cs.some(function (e) { return e.c.pol; });
    arr = arr.filter(function (e) {
      var row = K.R[e.name], fl = row ? row.fl : {};
      if (ex[e.name] || (!row && !K.P[e.name]) || (o.hero && fl.d === "h")) return false;
      for (j = 0; j < (o.avoid || []).length; j++) if (fl[o.avoid[j]]) return false;
      e.fp = pol && fl.p ? 0 : 1;
      return true;
    }).sort(function (a, b) { return a.fp - b.fp || b.s - a.s || b.ng - a.ng || b.sup - a.sup || a.src - b.src || a.rank - b.rank || b.a - a.a || a.g - b.g || lt(a.name, b.name); });
    if (o.avoidCat && arr.length > 1 && K.R[arr[0].name] && K.R[arr[0].name].cat === o.avoidCat) {
      for (j = 1; j < arr.length && arr[j].s >= arr[0].s - 5; j++) if (!K.R[arr[j].name] || K.R[arr[j].name].cat !== o.avoidCat) { arr.unshift(arr.splice(j, 1)[0]); break; }
    }
    return arr.slice(0, k).map(function (e) {
      var c = e.c, row = K.R[e.name], t = K.T.raw.why || {}, tpl = t[o.dialect] || t.msa;
      return {
        name: e.name, score: e.s, rung: e.r, concept: c ? c.id : null, cat: row ? row.cat : null, via: e.via, neg: !!e.ng, primitive: c && c.primitive || null, object: c && c.object || null,
        why: tpl ? tpl.split("{n}").join(row && row.en[0] || e.name).split("{w}").join(e.via.slice(0, 30)) : ""
      };
    });
  }

  function concepts(q, o) {
    return ranked(scan(q, o || {})).map(function (e) {
      var c = e.c;
      return { id: c.id, cat: c.cat, score: e.s, rung: e.r, icons: c.icons || [], object: c.object || null, primitive: c.primitive || null, pol: c.pol || null, neg: e.neg, via: e.rw };
    });
  }
  /** The deck topic: up to two categories of the strongest concepts (homograph senses do not vote). */
  function topic(q, o) {
    var sum = dict(), cats = [];
    ranked(scan(q, o || {})).forEach(function (e) { if (e.c.home) return; if (!(e.c.cat in sum)) { sum[e.c.cat] = 0; cats.push(e.c.cat); } sum[e.c.cat] += e.s; });
    return cats.sort(function (a, b) { return sum[b] - sum[a] || lt(a, b); }).slice(0, 2);
  }
  /** The find entry of one icon for a query (name, rung, score, concept, via, why) or null. */
  function explain(name, q, dialect) {
    var r = find(q, { dialect: dialect, k: 999 }), i;
    for (i = 0; i < r.length; i++) if (r[i].name === name) return r[i];
    return null;
  }
  function has(name) { var K = build(); return !!(K.R[name] || K.P[name]); }
  function meta(name) {
    var K = build(), r = K.R[name], p = K.P[name];
    return r || p ? { name: name, cat: r ? r.cat : null, en: r ? r.en : [], ar: r ? r.ar : [], flags: r ? r.fl : {}, f: p && p.f || [], s: p && p.s || [] } : null;
  }
  /** Path elements in the 24 box: solid dots take o.ink, closed paths o.tint. */
  function markup(name, o) {
    var p = build().P[name], out = [], i;
    o = o || {};
    if (!p) return null;
    for (i = 0; i < p.d.length; i++) out.push('<path d="' + p.d[i] + '"' + ((p.s || []).indexOf(i) >= 0 ? ' fill="' + (o.ink || "currentColor") + '" stroke="none"' : o.tint && (p.f || []).indexOf(i) >= 0 ? ' fill="' + o.tint + '"' : "") + "/>");
    return out.join("");
  }

  V._.register("icons", { has: has, markup: markup, meta: meta, find: find, concepts: concepts, explain: explain, topic: topic });
})();
