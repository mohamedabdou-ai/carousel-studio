/* src/art/chart.js - A6a. Kind "chart", sub "bars-h", and CS.art.chart (div at ol ew cw mixTo pal bar share proof chip waffle comp burst), the helpers numeral.js shares; manifest.json loads this first. */
(() => {
  const art = CS.art, kit = art.kit, K = (art.chart = {}), M = Math, C = () => CS.core.color, T = [[0.4, 0.58, 0.84, 0.28, 0.53, 0.6], [0.55, 0.7, 1.02, 0.34, 0.72, 0.7]];

  K.div = (st, kids, at) => kit.html("div", at || {}, st, kids);
  K.at = (l, t, w, h, kid, mid) => K.div({ position: "absolute", left: l, top: t, width: w, height: h, ...(mid && { display: "flex", alignItems: "center" }) }, kid);
  K.ol = (dna) => (dna.outline > 0 ? M.min(dna.outline, 4) : 0);
  K.ew = (s, hi) => {   // em width in a heavy face: false = a floor (fit never grows past the plan), true = typical (boxes)
    let w = 0;
    for (const c of String(s)) w += T[hi ? 1 : 0][c === "1" ? 0 : /[0-9٠-٩]/.test(c) ? 1 : /[%٪]/.test(c) ? 2 : /[.,٫٬ \/]/.test(c) ? 3 : /[؀-ۿ]/.test(c) ? 4 : 5];
    return w;
  };
  K.sty = (w, h, f, lh) => `display:block;white-space:nowrap;text-align:center;width:${w}px;height:${h}px;font-size:${f}px;line-height:${lh};`;   // a centred figure label
  K.cw = (pr) => M.ceil(K.ew(pr.text, true) * 36 + 50);
  K.mixTo = (bg, ink, min) => { const c = C(); let t = 0.06, v = c.mix(bg, ink, t); while (t < 1 && c.contrast(v, bg) < min) v = c.mix(bg, ink, (t += 0.06)); return v; };
  K.pal = (tk, ol) => {   // G1/G2: outlined marks: paper "off", ink edge; else "on" is 3:1 on the ground, "off" a faint fill with a 3:1 edge tint
    const c = C(), off = ol ? tk.surface : K.mixTo(tk.bg, tk.ink, 1.5), on = [tk.accent, tk.support[0], tk.support[1]].find((v) => c.contrast(v, off) >= 1.5 && (ol || c.contrast(v, tk.bg) >= 3));
    return { on: on || tk.ink, off, edge: ol ? tk.ink : K.mixTo(tk.bg, tk.ink, 3) };
  };
  K.bar = (x, y, w, h, r, fill, ink, ol) => kit.path(kit.rrect(x + ol / 2, y + ol / 2, w - ol, h - ol, M.min(h / 2, r)), { fill, stroke: ol ? ink : null, "stroke-width": ol || null, "stroke-linejoin": ol ? "round" : null });
  K.share = (a, v, u) => {   // 0..1, or null unless filled/of, n%, n/m, or n with a "%" / "من N" unit says a share (28/30 is 93%)
    const f = (s) => (s + "").replace(/[٠-٩]/g, (d) => d.charCodeAt(0) - 1632).replace("٫", ".").trim(), t = f(u), of = +a.of > 0 ? +a.of : 0, q = /^(\d+(?:\.\d+)?)\s*(?:([%٪])|[\/∕]\s*(\d+(?:\.\d+)?))?$/.exec(f(v));
    let n, d;
    if (a.filled != null) { n = +a.filled; d = of || 100; }
    else if (q) { n = +q[1]; d = q[3] ? +q[3] : q[2] || /^(%|٪|percent|(?:في|ب)ال(?:مية|مئة))$/i.test(t) ? 100 : of || +(/(?:من|out of|per|of) (?:كل )?(\d+)$/.exec(t) || [])[1]; }
    return n >= 0 && d > 0 && n <= d ? n / d : null;
  };
  K.proof = (ctx, ill) => {   // sourced: a chip with the first source (its id when the label is too long); else the illustrative tag
    const id = ((ctx.slide && ctx.slide.sourceIds) || [])[0], en = ctx.lang === "en", p = en ? "Source: " : "المصدر: ", t = p + ((ctx.sources || {})[id] || id);
    return ill || !id ? { src: false, text: en ? "Illustrative" : "رسم توضيحي" } : { src: true, text: K.ew(t, true) * 36 + 50 > 440 ? p + id : t };
  };
  K.chip = (x, pr, l) => {   // 36 px text in a 56 px pill: the tag on paper with an ink outline, the source muted
    const tk = x.tk, fill = pr.src ? null : tk.surface;
    l.el.setAttribute("style", `display:block;white-space:nowrap;line-height:44px;color:${pr.src ? tk.inkMuted : kit.on(fill, tk)};`);
    return { w: K.cw(pr), el: K.div({ display: "flex", alignItems: "center", height: 50, padding: "0 22px", border: `3px solid ${pr.src ? tk.line : tk.ink}`, borderRadius: M.min(28, x.dna.radius.chip), backgroundColor: fill }, l.el, { "data-part": "chip" }) };
  };
  const cell = (sh, x, y, z) => (sh === "disc" ? kit.disc(x + z / 2, y + z / 2, z / 2) : sh === "arch" ? kit.arch(x, y, z, z, 0.5, 2) : kit.rrect(x, y, z, z, sh));
  K.waffle = (o) => {   // 10 x 10 cells (size c, gap g), the first n filled from the start edge; outlines (sw filled, so empty, in oc) sit inside their cell
    const p = o.c + o.g, q = 10 * p - o.g, a = [[], o.sw], b = [[], o.so];
    for (let i = 0, g; i < 100; i++) { g = i < o.n ? a : b; g[0].push(cell(o.shape, (o.rtl ? 9 - (i % 10) : i % 10) * p + g[1] / 2, M.floor(i / 10) * p + g[1] / 2, o.c - g[1])); }
    return kit.svg(q, q, [b, a].map(([d, s], k) => kit.path(d.join(""), { fill: k ? o.on : o.off, stroke: s ? (k ? o.line : o.oc) : null, "stroke-width": s || null, "stroke-linejoin": s ? "round" : null })));
  };
  K.comp = (sub, a, ctx, x, p, W, H, rw) => {   // the companion of a row (beside) or column (under) layout: { w, h, el } | null
    const tk = x.tk, dna = x.dna, ol = K.ol(dna), pal = K.pal(tk, !!ol), room = rw ? M.min(H, W * 0.42) : H * 0.42, c = dna.container;
    let e, h, f;
    if (sub === "waffle") {
      e = M.max(28, M.min(38, M.floor((room - 36) / 10))); h = 10 * e + 36;
      return { w: h, h, el: K.waffle({ n: M.round(p * 100), c: e, g: 4, sw: ol ? 3 : 0, so: 3, rtl: x.rtl, on: pal.on, off: pal.off, oc: pal.edge, line: tk.ink, shape: c === "disc" || c === "hand-circle" ? "disc" : c === "arch" ? "arch" : c === "app-tile" ? M.round(e * 0.3) : 0 }) };
    }
    if (sub === "bar") {
      h = 28 + 2 * ol; e = M.max(h, M.round(W * p));
      return { w: W, h, el: kit.svg(W, h, [K.bar(0, 0, W, h, h, pal.off, pal.edge, ol || 3), p ? K.bar(kit.flip(x.rtl, W)(0, e), 0, e, h, h, pal.on, tk.ink, ol) : null]) };
    }
    ["xl", "lg"].some((z) => {   // the counted thing as a sticker (the object, else the glyph): the largest size that fits
      const o = { ctx, treatment: "sticker", size: z, name: a.object || a.icon };
      f = (a.object && art.object.full(a.object, o)) || (a.icon && art.icon.full(a.icon, o));
      return !f || f.w <= room || z === "lg";
    });
    return f && { w: f.w, h: f.w, el: f.fill ? kit.owner(f.el) : f.el };
  };
  K.burst = (x, d) => {   // a starburst sticker of d px: a support hue, the ink outline, the preset's hard shadow
    const tk = x.tk, sh = x.dna.shadow, R = d / 2 - 10, c = d / 2, bw = M.max(K.ol(x.dna), 3), star = (cx, cy) => kit.star(cx, cy, R, R * 0.83, 14), fill = [tk.support[0], tk.accent, tk.surface].find((v) => C().contrast(tk.ink, v) >= 4.5) || tk.surface;
    return { fill, bw, el: kit.owner(kit.svg(d, d, [sh.kind === "hard" ? kit.path(star(c + (x.rtl ? -sh.dx : sh.dx), c + sh.dy), { fill: tk.ink }) : null, kit.path(star(c, c), { fill, stroke: tk.ink, "stroke-width": bw, "stroke-linejoin": "round" })])) };
  };

  const bars = (anchor, ctx) => {
    const ch = anchor.chart || {}, v = ch.values, un = ch.unit ? String(ch.unit) : "", pr = K.proof(ctx, ch.illustrative), L = [], w38 = (s) => K.ew(s, true) * 38;
    if (!Array.isArray(v) || !v.length || v.length > 7) return null;
    const rows = v.map((q, k) => ({ k, label: q && q.label != null ? String(q.label).trim() : "", value: q ? +q.value : NaN, hi: !!(q && q.hi) }));
    if (rows.some((q) => !isFinite(q.value) || q.value < 0 || !q.label)) return null;
    rows.sort((a, b) => b.value - a.value || a.k - b.k);
    if (!rows.some((q) => q.hi)) rows[0].hi = true;
    const n = rows.length;
    let Vw = 0;
    rows.forEach((q, k) => {
      const t = w38(q.label), m = M.max(...q.label.split(/\s+/).map(w38));
      q.t = t + 8; q.n2 = M.max(m, (t + m + 13) / 2) + 8;   // the category on one line, on two (a word never breaks)
      q.text = q.value + (un ? (/^[%٪]/.test(un) ? "" : " ") + un : ""); Vw = M.max(Vw, w38(q.text) + 8);
      L.push((q.l = kit.label("chart", 2 * k, q.label)), (q.v = kit.label("chart", 2 * k + 1, q.text)));
    });
    const cl = kit.label("chip", 2 * n, pr.text);
    L.push(cl);
    if (ctx.labelsOnly) return { el: null, boxes: [], labels: L };
    const x = kit.session({ ctx }), tk = x.tk, dna = x.dna, rtl = x.rtl && (((ctx.brand || {}).art || {}).chartAxis || {}).categories !== "ltr", box = ctx.box || ctx.zone || { w: 852, h: 420 }, W = box.w, H = box.h, ox = box.x || 0, oy = box.y || 0, flip = kit.flip(rtl, W);
    const ol = K.ol(dna), pal = K.pal(tk, !!ol), tint = K.mixTo(tk.bg, tk.ink, 3), pitch = M.min(96, M.floor((H - 80) / n)), mx = (f) => M.ceil(M.max(...rows.map(f))), B = (l, t, w, h, kind) => ({ x: ox + l, y: oy + t, w, h, kind });
    let Lw = mx((q) => q.t), wr = 0;
    Vw = M.ceil(Vw);
    if (Lw > W * 0.42 && (wr = 1)) Lw = mx((q) => q.n2);   // a category wider than 42% of the box takes two 38 px lines
    if (pitch < (wr ? 92 : 54) || K.cw(pr) > W) return null;   // two 38 px lines or the chip would not fit
    const A = W - Lw - 36 - Vw;
    if (A < 120) return null;
    const bt = M.max(30, M.min(56, M.floor(pitch * 0.6))), top = M.floor((H - n * pitch - 80) / 2), sc = M.max(+ch.total || 0, rows[0].value) || 1, kids = [], boxes = [];
    const nodes = [kit.path(kit.rrect(flip(Lw + 17, 3), top, 3, n * pitch, 0), { fill: tint })];   // the zero line: one hairline, no grid
    rows.forEach((q, k) => {
      const len = q.value > 0 ? M.max(6, M.round((A * q.value) / sc)) : 0, y = top + k * pitch, bx = flip(Lw + 20, len), vx = rtl ? bx - 16 - Vw : bx + len + 16;
      if (len) nodes.push(K.bar(bx, y + (pitch - bt) / 2, len, bt, dna.radius.chip, q.hi ? pal.on : ol ? tk.surface : tint, tk.ink, ol));
      q.l.el.setAttribute("style", `display:block;width:${Lw}px;white-space:${wr ? "normal" : "nowrap"};`); q.v.el.setAttribute("style", `display:block;width:${Vw}px;white-space:nowrap;font-variant-numeric:normal;`);
      kids.push(K.at(flip(0, Lw), y, Lw, pitch, q.l.el, 1), K.at(vx, y, Vw, pitch, q.v.el, 1));
      boxes.push(B(bx, y + (pitch - bt) / 2, len, bt, "ink"), B(flip(0, Lw), y, Lw, pitch, "text"), B(vx, y, Vw, pitch, "text"));
    });
    const cp = K.chip(x, pr, cl), cx = rtl ? 0 : W - cp.w, cy = top + n * pitch + 24;
    kids.push(K.at(cx, cy, cp.w, 56, cp.el)); boxes.push(B(cx, cy, cp.w, 56, "text"));
    return { el: kit.wrap("chart", `${x.seed}|${ctx.slideId || ""}`, [K.div({ position: "absolute", left: 0, top: 0 }, kit.svg(W, H, nodes)), ...kids], { style: { position: "relative", width: W, height: H } }), boxes, labels: L };
  };
  art.register("chart", bars, ["bars-h"]);
})();
