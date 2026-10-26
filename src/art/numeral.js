
(() => {
  const art = CS.art, kit = art.kit, K = art.chart, M = Math, G = 40;
  if (!K) throw Object.assign(new Error("numeral.js needs chart.js loaded first"), { code: "E_ART_REGISTER" });

  const s = (v) => (v == null ? "" : String(v).trim());
  const build = (anchor, ctx) => {
    const sl = ctx.slide || {}, nb = sl.number || {}, val = s(anchor.value != null ? anchor.value : nb.value), unit = s(anchor.unit != null ? anchor.unit : nb.unit);
    let sub = art._.sub(anchor), ul, cl;
    if (!val) return null;
    const p = K.share(anchor, val, unit), ordinal = /^(item|step)$/.test(sl.type || "") && !unit && val === String(sl.ord) && !nb.value, pr = ordinal ? null : K.proof(ctx, false), nl = kit.label("numeral", 0, val), L = [nl];
    if (((sub === "waffle" || sub === "bar") && p == null) || (sub === "icon" && !(anchor.object || anchor.icon))) sub = "none";
    if (sub === "none" && pr && !pr.src && p != null) sub = "waffle";
    if (unit) L.push((ul = kit.label("title", 1, unit)));
    if (pr) L.push((cl = kit.label("chip", L.length, pr.text)));
    if (ctx.labelsOnly) return { el: null, boxes: [], labels: L };
    const x = kit.session({ ctx }), dna = x.dna, rtl = x.rtl, box = ctx.box || ctx.zone || { w: 852, h: 420 }, W = box.w, H = box.h, ox = box.x || 0, oy = box.y || 0, ew = K.ew(val);
    const uw = unit ? M.ceil(K.ew(unit) * 72) + 8 : 0, want = anchor.treatment ? /^(badge|sticker|giant)$/.test(anchor.treatment) : dna.container === "disc" && dna.mark === "outline", cap = M.floor(W * 0.7), chip = pr ? K.cw(pr) : 0;
    const lo = M.ceil((206 * K.ew(val, true)) / ew);
    const fit = (w, h, bu) => {
      const rh = h - (pr ? 80 : 0);
      let best = { s: 0, u: 0, d: 0 };
      if (chip > w) return best;
      [0, 1].forEach((u) => {
        if ((u && (!unit || uw > w)) || (bu && !u && unit)) return;
        const uh = unit && u ? 96 : 0, d = M.min(w, rh - uh), v = M.floor(M.min(520, cap / ew, bu ? M.min(d * 0.85, (d * 0.72) / ew) : M.min((w - (unit && !u ? uw + 24 : 0)) / ew, (rh - uh) / 0.9)));
        if (v > best.s * 1.1) best = { s: v, u, d };
      });
      return best;
    };
    let lay, comp, row, cw, ch, burst;
    [[1, want], [1, 0], [0, want], [0, 0]].some((t, i) => {
      const use = t[0] && sub !== "none";
      let b = { l: { s: 0 }, w: W, h: H, c: null };
      (use ? (sub === "bar" ? [0] : [1, 0]) : [0]).forEach((rw) => {
        const c = use ? K.comp(sub, anchor, ctx, x, p, W, H, rw) : null, w = c ? (rw ? W - c.w - G : W) : W, h = c ? (rw ? H : H - c.h - G) : H, l = fit(w, h, t[1]);
        if (l.s > b.l.s) b = { l, c, rw, w, h };
      });
      ({ l: lay, c: comp, rw: row, w: cw, h: ch } = b); burst = t[1];
      return lay.s >= 280 || (i === 3 && lay.s >= lo);
    });
    if (lay.s < lo) return null;
    const S = lay.s, d = M.round(lay.d), nw = M.floor(S * ew), fh = M.round(S * 0.9), un = lay.u && unit ? 96 : 0, bh = burst ? d : fh, nbw = burst ? d : nw, y0 = (ch - bh - un - (pr ? 80 : 0)) / 2, cx = comp && row && rtl ? W - cw : 0;
    const bd = un || !unit ? 0 : uw + 24, l0 = cx + (cw - nbw - bd) / 2, nx = rtl ? l0 + bd : l0, kids = [], boxes = [], b = burst && K.burst(x, d);
    const B = (l, t, w, h, kind, o) => ({ x: ox + l, y: oy + t, w, h, kind, ...o }), put = (l, t, w, h, el, kind, o) => { kids.push(K.at(l, t, w, h, el)); boxes.push(B(l, t, w, h, kind, o)); };
    nl.el.setAttribute("style", K.sty(nw, fh, S, 0.9) + (b ? `color:${kit.on(b.fill, x.tk)};` : ""));
    if (b) { const bs = M.round(1.1 * (d / 2 - 10)); kids.push(K.at(nx, y0, d, d, b.el)); boxes.push(B(nx + (d - bs) / 2, y0 + (d - bs) / 2, bs, bs, "owner", { id: "b", fill: 1, border: b.bw })); }
    put(nx + (nbw - nw) / 2, y0 + (bh - fh) / 2, nw, fh, nl.el, "text", { anchor: true, ...(b && { ownerOf: "b" }) });
    if (ul) { ul.el.setAttribute("style", K.sty(uw, 96, 72, "96px")); put(un ? cx + (cw - uw) / 2 : rtl ? l0 : l0 + nbw + 24, un ? y0 + bh : y0 + (bh - 96) / 2, uw, 96, ul.el, "text"); }
    if (cl) { const cp = K.chip(x, pr, cl); put(cx + (cw - cp.w) / 2, y0 + bh + un + 24, cp.w, 56, cp.el, "text"); }
    const out = [K.div({ position: "absolute", left: 0, top: 0, width: W, height: H }, kids, { "data-part": "figure" })];
    if (comp) {
      const bx = row ? (rtl ? 0 : W - comp.w) : (W - comp.w) / 2, by = row ? (H - comp.h) / 2 : ch + G;
      out.push(K.at(bx, by, comp.w, comp.h, comp.el));
      boxes.push(B(bx, by, comp.w, comp.h, "ink"));
    }
    return { el: kit.wrap("numeral", `${x.seed}|${ctx.slideId || ""}`, out, { style: { position: "relative", width: W, height: H } }), boxes, labels: L };
  };
  art.register("numeral", build, ["none", "waffle", "bar", "icon"]);
})();
