
(function () {
  var art = CS.art, kit = art.kit, n = kit.n, h = kit.html, own = kit.owner, K = 0.56, LH = { body: 63, small: 52 }, CH = 60, GAP = 16, PX = 30, PY = 12, TXT = "text-align:start;white-space:normal;flex:1;min-width:0;";
  var BG = "background-color", BR = "border-radius", BS = "box-shadow", FD = "flex-direction", JC = "justify-content", AI = "align-items", MH = "min-height";

  function norm(s) { return String(s == null ? "" : s).replace(/\s+/g, " ").trim(); }
  function cnt(s) { s = norm(s); return s ? s.split(" ").length : 0; }
  function runs(L) {
    return L.map(function (l, i) { var a = i, b = i; while (a && L[a - 1].who === l.who) a--; while (L[b + 1] && L[b + 1].who === l.who) b++; return b > a ? i - a + 1 : 0; });
  }
  function words(a, ctx, notes) {
    var m = a.mock || {}, s = ctx.slide || {}, d = s.demo || {}, q = s.quote, si = s.sides || [], it = s.items || [], prev, L, g = function (l, k) { return (l || []).map(function (x) { return x && x[k]; }); };
    q = (q && q.body) || (typeof q === "string" ? q : "") || (s.type === "quote" ? s.body : "");
    var p = [d.caption, q].concat(s.bullets || [], g(d.lines, "text"), g(si, "text"), g(si, "label"), g(it, "title"), g(it, "text")).map(norm).filter(Boolean);
    var ok = function (t) { return p.indexOf(norm(t)) >= 0; }, fit = function (t) { return ok(t) && cnt(t) <= 12; }, keep = function (l) { return !!l && fit(l.text); };
    var tot = function (A, c) { var u = runs(A), t = cnt(c); A.forEach(function (l, i) { t += cnt(l.text) + (u[i] && !notes ? 1 : 0); }); return t; };
    var demo = !m.lines && (d.lines || []).length, dl = d.lines || [];
    if (demo && (dl.length > (notes ? 5 : 4) || dl.some(function (l) { return !keep(l); }))) return { lines: [], caption: "" };
    L = (m.lines || []).filter(keep);
    if (!L.length) L = (d.lines || []).filter(keep);
    if (!L.length && notes) [m.items, g(it, "title"), s.bullets].some(function (l) { L = (l || []).filter(fit).map(function (t) { return { text: t }; }); return L.length; });
    if (!L.length && !notes) L = (q ? [{ who: "them", text: q }] : si.length > 1 ? si.slice(0, 2).map(function (x, i) { return { who: i ? "me" : "them", text: x.text }; }) : []).filter(keep);
    L = L.slice(0, notes ? 5 : 4).map(function (l, i) { var w = l.who === "me" || l.who === "them" ? l.who : prev === "them" ? "me" : "them"; prev = w; return { who: w, text: String(l.text), hi: !!l.hi || m.highlight === i }; });
    if (demo && tot(L, m.caption || d.caption) > 24) return { lines: [], caption: "" };
    while (L.length && tot(L) > 24) L.pop();
    q = runs(L); L.forEach(function (l, i) { l.n = notes ? 0 : q[i]; });
    var caption = m.caption == null ? d.caption : m.caption;
    return { lines: L, caption: ok(caption) && tot(L, caption) <= 24 ? String(caption) : "" };
  }

  function env(ctx) {
    var x = kit.session({ ctx: ctx }), tk = x.tk, dna = x.dna, c = CS.core.color, ow = dna.outline, sh = dna.shadow, bw = ow || 3;
    return { tk: tk, dna: dna, rtl: x.rtl, bw: bw, L: [], seed: x.seed, bd: bw + "px solid " + (ow ? tk.ink : tk.line), ink: bw + "px solid " + tk.ink,
      soft: function (v) { for (var i = 0; i < 14 && c.contrast(tk.ink, v) < 4.5; i++) v = c.mix(v, tk.surface, 0.12); return v; },
      lift: function (k) { return sh.kind === "hard" ? n((x.rtl ? -sh.dx : sh.dx) * k) + "px " + n(sh.dy * k) + "px 0 " + tk.ink : sh.kind === "soft" ? "0 " + n(sh.dy) + "px " + n(sh.blur) + "px rgba(0,0,0,0.14)" : null; } };
  }
  function fx(s, al) { return Object.assign({ display: "flex", [AI]: al || "center", "box-sizing": "border-box" }, al === "stretch" ? { [FD]: "column" } : null, s); }
  function lab(E, role, text, color, css) {
    var l = kit.label(role, E.L.length, text);
    E.L.push(l); l.el.setAttribute("style", "color:" + color + ";" + (css || TXT) + (LH[role] ? "line-height:" + LH[role] + "px;" : ""));
    return l.el;
  }
  function chip(E, fill, kid) {
    return own(h("div", {}, fx({ width: CH, height: CH, flex: "none", [BR]: Math.min(E.dna.radius.chip, CH / 2), [BG]: fill, border: E.bd, [JC]: "center" }), kid));
  }
  function avatar(E, who) {
    var fill = who === "me" ? E.tk.accent : E.tk.surface, g = kit.on(fill, E.tk);
    return chip(E, fill, kit.svg(34, 34, [kit.path(kit.disc(17, 12, 7), { fill: g }), kit.path("M4 32a13 11 0 0 1 26 0z", { fill: g })]));
  }
  function nl(t, w, z) { return Math.max(1, Math.ceil(t.length * z * K / w)); }

  function chat(w, E, box, cap) {
    var tk = E.tk, dna = E.dna, rtl = E.rtl, bw = E.bw, W = box.w, ox = box.x || 0, avail = box.h - cap, ground = E.soft(tk.support[1]), me = E.soft(tk.support[0]), f = kit.flip(rtl, W), P, y, col = [];
    var rows = w.lines.slice(), Rb = Math.min(40, Math.max(14, dna.radius.card)), pad = 34, R = W - 2 * pad, bm = Math.round(R * 0.72);
    if (rows.every(function (r) { return r.who === rows[0].who; })) rows.push({ who: rows[0].who === "me" ? "them" : "me", typing: true });
    function plan(ro) {
      var z = ro === "body" ? 44 : 36, lh = LH[ro], H = 20 + 2 * bw, out = rows.map(function (r) {
        var b = r.typing ? 150 : Math.round(Math.min(bm, Math.max(360, r.text.length * z * K + 2 * PX + 2 * bw)));
        return Object.assign({}, r, { b: b, ln: r.typing ? 1 : nl(r.text, b - 2 * PX - 2 * bw, z) });
      });
      out.forEach(function (r, q) { r.h = r.typing ? 76 : r.ln * lh + 2 * PY + 2 * bw; H += r.h + (q ? GAP : 0); });
      return { rows: out, H: H, ro: ro, lh: lh };
    }
    P = plan("body");
    if (P.H > avail) P = plan("small");
    if (P.H > avail) return null;
    var pt = Math.floor((box.h - P.H - cap) / 2), top = (box.y || 0) + pt, boxes = [{ x: ox, y: top, w: W, h: P.H, kind: "owner", id: "w", fill: 1, border: bw }];
    y = top + bw + 10;
    P.rows.forEach(function (r) {
      var mine = r.who === "me", bx = pad + (mine ? R - (CH + GAP + r.b) : CH + GAP), cx = pad + (mine ? R - CH : 0), fill = r.hi ? tk.accent : mine ? me : tk.surface, tw = r.b - 2 * PX - 2 * bw, q4 = [Rb, Rb, Rb, Rb], cc, bub;
      cc = r.n ? chip(E, tk.accent, lab(E, "chip", r.n + "", kit.on(tk.accent, tk), "text-align:center;white-space:nowrap;")) : avatar(E, r.who);
      q4[(r.who === "them") === rtl ? 2 : 3] = 4;
      bub = h("div", { "data-part": r.typing ? "typing" : "bubble" }, fx(Object.assign(r.typing ? { width: 150, height: 76 } : { width: r.b, padding: PY + "px " + PX + "px" },
        { flex: "none", [BG]: r.typing ? me : fill, border: E.bd, [BR]: q4.join("px ") + "px", [BS]: E.lift(0.8), [JC]: "center" })),
        r.typing ? kit.svg(70, 18, [9, 35, 61].map(function (x) { return kit.path(kit.disc(x, 9, 8), { fill: tk.ink }); })) : lab(E, P.ro, r.text, kit.on(fill, tk), TXT + (r.hi ? "font-weight:700;" : "")));
      col.push(h("div", { "data-part": "row", "data-who": r.who }, fx({ gap: GAP, "align-self": mine ? "flex-end" : "flex-start", flex: "none" }, r.n ? "center" : "flex-end"), mine ? [bub, cc] : [cc, bub]));
      boxes.push(r.typing ? { x: ox + f(bx + 40, 70), y: y + 29, w: 70, h: 18, kind: "ink", ownerOf: "w" } : { x: ox + f(bx + PX + bw, tw), y: y + PY + bw, w: tw, h: r.ln * P.lh, kind: "text", ownerOf: "w" },
        { x: ox + f(cx, CH), y: y + (r.n ? (r.h - CH) / 2 : r.h - CH), w: CH, h: CH, kind: "ink", ownerOf: "w" });
      y += r.h + GAP;
    });
    var win = own(h("div", { class: "cs-art-panel" }, fx({ width: W, [MH]: P.H, [BG]: ground, border: E.bd, [BR]: dna.radius.window, [BS]: E.lift(1) }, "stretch"),
      h("div", {}, fx({ [JC]: "space-evenly", "row-gap": GAP, flex: 1, padding: "10px " + pad + "px" }, "stretch"), col)));
    return { kids: [win], boxes: boxes, below: top + P.H, pt: pt, minHeight: plan("small").H + cap + 8 };
  }

  function note(w, E, box, cap) {
    var tk = E.tk, dna = E.dna, rtl = E.rtl, bw = E.bw, W = box.w, ox = box.x || 0, rows = w.lines, avail = box.h - cap, TOP = 30, CK = 48, pad = 40, vp = 16, ry = 10, P, y, col = [];
    var tl = dna.tilt ? Math.min(1.5, dna.tilt * 0.22) * kit.rng(E.seed + "tilt").sign() : 0, p = tl ? Math.ceil(W * Math.sin(Math.abs(tl) * Math.PI / 180) / 2) + 4 : 0, PW = W - 2 * p, band = E.soft(tk.support[0]);
    function plan(ro) {
      var z = ro === "body" ? 44 : 36, lh = LH[ro], H = TOP + 2 * (vp + bw), hs = rows.map(function (r) { return Math.max(CK, nl(r.text, PW - 2 * pad - 8 - CK - 62, z) * lh) + 2 * ry; });
      hs.forEach(function (v, q) { H += v + (q ? 18 : 0); });
      return { hs: hs, H: H, ro: ro };
    }
    P = plan("body");
    if (P.H + p > avail) P = plan("small");
    if (P.H + p > avail) return null;
    var pt = Math.floor((box.h - P.H - p - cap) / 2), top = (box.y || 0) + pt, tx = Math.round(rtl ? W * 0.18 : W * 0.82 - 190), rw = PW - 2 * (pad + 4 + bw), rx = ox + p + bw + pad + 4;
    var boxes = [{ x: ox + p, y: top + TOP, w: PW, h: P.H - TOP, kind: "owner", id: "p", fill: 1, border: bw }, { x: ox + tx, y: top + 6, w: 190, h: 50, kind: "decor" }];
    y = top + TOP + bw + vp;
    rows.forEach(function (r, q) {
      var b = r.hi ? bw : 0, mark = kit.svg(CK, CK, [kit.path(kit.rrect(6, 6, 36, 36, Math.min(10, dna.radius.tile)), { fill: tk.surface, stroke: tk.ink, "stroke-width": 4, "stroke-linejoin": "round" })]
        .concat(r.hi ? [kit.path("M13 25l8 9 15-19", { fill: "none", stroke: tk.ink, "stroke-width": 6, "stroke-linecap": "round", "stroke-linejoin": "round" })] : []));
      col.push(h("div", { "data-part": "row" }, fx(Object.assign({ gap: 22, padding: (ry - b) + "px " + (20 - b) + "px", flex: "none" }, r.hi ? { [BG]: band, border: E.ink, [BR]: Math.max(10, dna.radius.tile), [BS]: E.lift(0.6) } : null)),
        [mark, lab(E, P.ro, r.text, kit.on(r.hi ? band : tk.note, tk), TXT + (r.hi ? "font-weight:700;" : ""))]));
      boxes.push({ x: rx, y: y, w: rw, h: P.hs[q], kind: "text", ownerOf: "p" });
      y += P.hs[q] + 18;
    });
    var paper = own(h("div", { class: "cs-art-panel" }, fx({ [JC]: "space-evenly", "row-gap": 18, width: PW, [MH]: P.H - TOP, margin: TOP + "px auto 0", padding: vp + "px " + (pad + 4) + "px",
      [BG]: tk.note, border: E.ink, [BR]: dna.radius.card, [BS]: E.lift(1), transform: tl ? "rotate(" + n(tl) + "deg)" : null }, "stretch"), col));
    var tape = h("div", {}, { position: "absolute", top: 6, left: tx, width: 190, height: 50, [BG]: tk.support[1], border: E.ink, "box-sizing": "border-box", transform: "rotate(3deg)" });
    return { kids: [h("div", {}, { position: "relative", width: W, flex: "none", "padding-bottom": p }, [paper, tape])], boxes: boxes, below: top + P.H + p, pt: pt, minHeight: plan("small").H + p + cap + 8 };
  }

  function build(a, ctx) {
    var kind = a.mock && a.mock.kind, notes = kind === "notes", w = words(a, ctx, notes);
    if (!w.lines.length) return null;
    if (ctx.labelsOnly) {
      var labels = [], add = function (role, text) { labels.push(kit.label(role, labels.length, text)); };
      w.lines.forEach(function (l) { if (l.n) add("chip", String(l.n)); add("body", l.text); });
      if (w.caption) add("small", w.caption);
      return { el: null, boxes: [], labels: labels };
    }
    // The inner body extends 4px into the bottom keep-outs; inset full-width captions.
    var E = env(ctx), box = ctx.box || ctx.zone || { w: 852, h: 560 }, cap = w.caption ? 24 + nl(w.caption, box.w, 36) * LH.small : 0, b = (notes ? note : chat)(w, E, Object.assign({}, box, { h: box.h - 8 }), cap);
    if (!b) return null;
    if (w.caption) { b.kids.push(lab(E, "small", w.caption, E.tk.ink, TXT + "align-self:stretch;flex:none;height:" + (cap - 24) + "px;")); b.boxes.push({ x: box.x || 0, y: b.below + 24, w: box.w, h: cap - 24, kind: "text" }); }
    var el = kit.wrap("mock", E.seed, b.kids, { style: fx({ [FD]: "column", gap: 24, position: "relative", width: box.w, [MH]: box.h, "padding-top": b.pt }) });
    el.setAttribute("data-mock", kind); el.setAttribute("dir", E.rtl ? "rtl" : "ltr");
    return { el: el, boxes: b.boxes, labels: E.L, minHeight: b.minHeight };
  }

  art.mock = { words: words };
  art.register("mock", build, ["chat", "notes"]);
})();
