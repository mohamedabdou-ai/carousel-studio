/* src/art/anchor-icon.js - owned by A1b. Anchors "icon" and "field" (sub "icon"): one container (an object, else a glyph) centred in ctx.box with an optional caption; "field" sets it on a
 * colour panel (the plate, the owner). kind icon: anchor.size is a ceiling, the largest token that fits the box is drawn, none fits -> null. kind field: the container is sized from the BOX,
 * not from the token ladder: the largest (at most 600 px, a breath short of the inside) that fits once the panel's own border (2 x dna.outline, inside its border-box) and the caption line
 * are taken out; anchor.size is not read. cs-price-tag-ar carries captions[0] in its empty box (24-grid x10 y9 w10 h6) from g 240 up when it fits, else below; role "chip", coloured against
 * what is painted behind it. On a field a bare or ring glyph reads on the panel. The plate marks itself data-plate="1" data-art="icon" (presets paint its pattern). */
(function () {
  var art = CS.art, kit = art.kit, PEAK = { over: 1, center: 1, half: 1, full: 1, band: 1 }, GAP = 24, CAP = 56, SIZES = ["hero", "xl", "lg", "md", "sm"], TAG = "cs-price-tag-ar", MAX = 600, MIN = 64;

  function build(anchor, ctx, field) {
    var iconPanel = !field && ctx.slide?.type !== "cover" && ctx.visual?.field === true;
    field = field || iconPanel;
    var text = anchor.captions && anchor.captions[0] ? String(anchor.captions[0]) : null, tag = !!text && anchor.icon === TAG && !anchor.object;
    var cap = text ? kit.label(tag ? "chip" : "small", 0, text) : null, labels = cap ? [cap] : [];
    if (ctx.labelsOnly) return { el: null, boxes: [], labels: labels };
    var x = kit.session({ ctx: ctx }), tk = x.tk, dna = x.dna, box = ctx.box || ctx.zone || { w: 852, h: 420 }, obj = anchor.object, big = !!PEAK[ctx.recipe], req = anchor.size || ctx.size, q = SIZES.indexOf(req);
    var sizes = req ? q >= 0 ? SIZES.slice(q) : [req] : SIZES, tr = anchor.treatment || (field ? "sticker" : big ? "giant" : obj ? "sticker" : "duo"), bw = field ? dna.outline : 0;
    var iw = box.w - 2 * bw, ih = box.h - 2 * bw;   // the panel's border is inside its border-box: fit and caption width use what is left
    var o = { ctx: ctx, treatment: tr, drawOn: true, modifier: anchor.badge, mirror: anchor.mirror, name: obj || anchor.icon }, r = null, inTag = false, below = false, avail, i, g;
    if (field) { o.fill = tk.surface; o.base = "surface"; if (tr === "bare" || tr === "ring") { o.ink = kit.on(tk.accent, tk); o.ground = tk.accent; } }
    function tagged(g) { return tag && g >= 240 && Array.from(text).length * 0.62 * kit.labelFloor("chip", text) <= g * 10 / 24; }
    function draw(sz) {
      o.size = sz;
      var c = obj ? art.object.full(obj, o) : null;
      return c || (anchor.icon ? art.icon.full(anchor.icon, o) : null);   // no object: the Lucide glyph
    }
    if (field) {   // the largest glyph (px) whose container fits: the container only grows with it, so a bisection finds it
      for (i = 0; i < (tag ? 2 : 1) && !r; i++) {
        inTag = tag && !i; below = !!text && !inTag; avail = Math.min(iw, ih - (below ? CAP + GAP : 0)); avail = Math.min(MAX, avail - 2 * Math.min(14, Math.round(avail * 0.03)));
        if (inTag) o.tilt = 0; else delete o.tilt;   // a tilted sticker would turn under its upright label
        for (var lo = MIN, hi = Math.floor(avail), m, c; lo <= hi;) { m = (lo + hi) >> 1; c = draw(m); if (c && c.w <= avail) { r = c; lo = m + 1; } else hi = m - 1; }
        if (r && inTag && !tagged(r.g)) r = null;
      }
      if (!r) return null;
    } else {
      for (i = 0; i < sizes.length; i++) {   // the named size or smaller, else the largest token whose container fits the box
        g = kit.gOf(sizes[i]); inTag = tagged(g);
        if (inTag) o.tilt = 0; else delete o.tilt;
        below = !!text && !inTag; avail = Math.min(box.w, box.h - (below ? CAP + GAP : 0));
        r = draw(sizes[i]);
        if (!r || r.w <= avail) break;
      }
      if (!r || r.w > avail) return null;   // nothing fits: the caller drops the anchor
    }
    var pw = iconPanel ? Math.min(box.w, Math.max(r.S + 96, below ? Math.min(box.w, 560) + 2 * bw : 0)) : box.w, ph = iconPanel ? Math.min(box.h, r.w + (below ? GAP + CAP : 0) + 48) : box.h;
    var ox = box.x || 0, oy = box.y || 0, bx = ox + (box.w - r.w) / 2, by = oy + (box.h - r.w - (below ? GAP + CAP : 0)) / 2, boxes = [], owned = !!r.fill, own = field ? "f" : owned ? "c" : null, kids = [r.el];   // r.fill: a filled container (a die-cut object has none)
    if (owned && !field) kit.owner(r.el);
    if (field) boxes.push({ x: ox + (box.w - pw) / 2, y: oy + (box.h - ph) / 2, w: pw, h: ph, kind: "owner", id: "f", fill: 1, border: bw });
    boxes.push(Object.assign({ x: bx + r.pad, y: by + r.pad, w: r.S, h: r.S }, field ? { kind: "ink", ownerOf: "f" } : owned ? { kind: "owner", id: "c" } : { kind: "ink" }));
    if (owned && !field) boxes.push({ x: bx + (r.w - r.g) / 2, y: by + (r.w - r.g) / 2, w: r.g, h: r.g, kind: "ink", ownerOf: "c" });
    if (inTag) {   // the label sits in the tag's empty box, in the colour that reads on what is behind it
      var u = r.g / 24, lx = (r.w - r.g) / 2 + (anchor.mirror ? 4 : 10) * u, ly = (r.w - r.g) / 2 + 9 * u, under = tr === "duo" || tr === "giant" ? kit.role(tk, o.tintFill, r.fill === tk.accent ? tk.surface : tk.accent) : r.fill || o.ground || tk.bg;
      cap.el.setAttribute("style", "color:" + kit.on(under, tk) + ";");
      kids = [kit.html("div", { "data-part": "glyph" }, { position: "relative", width: r.w, height: r.w, flex: "none" }, [r.el, kit.html("div", { "data-part": "tag" }, { position: "absolute", left: lx, top: ly, width: 10 * u, height: 6 * u, display: "flex", "align-items": "center", "justify-content": "center" }, cap.el)])];
      boxes.push(Object.assign({ x: bx + lx, y: by + ly, w: 10 * u, h: 6 * u, kind: "text" }, own ? { ownerOf: own } : null));
    } else if (cap) {
      var cw = Math.min(iw, 560);
      cap.el.setAttribute("style", "width:" + kit.n(cw) + "px;height:" + CAP + "px;text-align:center;" + (field ? "color:" + kit.on(tk.accent, tk) + ";" : ""));   // on the panel the caption takes the colour that reads on it
      kids.push(cap.el); boxes.push(Object.assign({ x: ox + (box.w - cw) / 2, y: by + r.w + GAP, w: cw, h: CAP, kind: "text" }, own === "f" ? { ownerOf: "f" } : null));
    }
    var flex = { display: "flex", "flex-direction": "column", "align-items": "center", "justify-content": "center", gap: GAP, "box-sizing": "border-box", width: box.w, height: box.h }, seed = x.seed + "|" + (ctx.slideId || ""), w;
    if (!field) return { el: kit.wrap("icon", seed, kids, { style: flex }), boxes: boxes, labels: labels };
    Object.assign(flex, { width: pw, height: ph, "background-color": tk.accent, "border-radius": dna.radius.panel, border: bw ? bw + "px solid " + tk.ink : null });
    w = kit.wrap("field", seed, kids, { panel: true, panelStyle: flex, style: Object.assign({ display: "flex", width: box.w, height: box.h }, iconPanel ? { "align-items": "center", "justify-content": "center" } : {}) });
    w.firstChild.setAttribute("data-plate", "1"); w.firstChild.setAttribute("data-art", "icon");   // the plate: presets paint [data-plate="1"]
    if (iconPanel) { w.setAttribute("data-art", "icon"); w.setAttribute("data-anchor-kind", "icon"); }
    return { el: w, boxes: boxes, labels: labels };
  }
  art.register("icon", function (anchor, ctx) { return build(anchor, ctx, false); }, ["icon"]);
  art.register("field", function (anchor, ctx) { return build(anchor, ctx, true); }, ["icon"]);
})();
