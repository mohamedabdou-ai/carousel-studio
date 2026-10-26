/* src/art/object.js - owned by A1b. CS.art.object(id, o) -> <svg class="cs-icon"> | null (spec 3.1.1): a filled object on a 48 grid, roles base / shade (base 18% toward the outline
 * colour) / hi (surface). S-2: outline = art.objectOutline (0.03-0.04, default 0.035) of the glyph box, 4-20 px, in art.outlineColor (ink), miter limit 2; art.retrace adds a second pass.
 * treatment "bare", "sticker" (die-cut keyline, then the lift) or a container. o as CS.art.icon plus base, objectOutline, outlineColor. */
(function () {
  var art = CS.art, kit = art.kit, n = kit.n, maps = new WeakMap();
  function block(o) { var b = o.objects || (CS.visual && CS.visual._ && CS.visual._.block("cs-icon-objects")); return b && (b.objects || b); }
  function find(o, id) {
    var l = block(o), m;
    if (!l) return null;
    if (!(m = maps.get(l))) { m = {}; l.forEach(function (r) { m[r.id] = r; }); maps.set(l, m); }
    return m[id] || null;
  }
  function raw(o) { return o.art || (o.ctx || {}).art || {}; }
  function paths(rec, fills, stroke, sw, dna) {
    return rec.paths.map(function (p) { return kit.path(p.d, { fill: fills ? fills[p.role] || fills.base : stroke, stroke: stroke, "stroke-width": sw, "stroke-linecap": dna.cap, "stroke-linejoin": dna.join, "stroke-miterlimit": dna.join === "miter" ? 2 : null, "data-m": fills ? "decor-item" : null }); });
  }
  function make(id, o) {
    o = o || {};
    var rec = find(o, id), x, tr, size, g, px, k, sw, fo, m, dna, tk, rt, oc, vb, f;
    if (!rec) return null;
    x = kit.session(o); dna = x.dna; tk = x.tk; tr = o.treatment || "bare"; size = o.size == null ? "lg" : o.size; g = kit.gOf(size); vb = rec.viewBox || 48;
    if (!kit.MULT[tr]) kit.fail('unknown treatment "' + tr + '"', "E_USAGE");
    px = object.outline(size, o); rt = art._.retrace(o, tk, px * 24 / g); f = rt ? rt.f : 1; k = g * f / vb; sw = px / k;
    oc = kit.role(tk, o.outlineColor || o.ink || raw(o).outlineColor, tk.ink);
    fo = Object.assign({}, o, { dna: dna, tk: tk, rtl: x.rtl, seed: x.seed + "|" + id, ink: o.ink && kit.role(tk, o.ink), attrs: { "data-object": id, "data-treatment": tr, "data-size": kit.SIZES[size] ? size : g, "data-m": "decor-item" } });
    function body(ground) {   // retrace (if any) under the filled paths; base (supplied or derived) never equals the outline colour or vanishes on the ground
      var C = CS.core.color, base = kit.role(tk, o.base) || kit.base(Object.assign({}, tk, { ink: oc }), ground, dna.outline >= 3), c;
      if (C.contrast(base, oc) < 1.8) base = [tk.support[0], tk.support[1], tk.surface, tk.bg, tk.ink].filter(function (v) { return C.contrast(v, oc) >= 1.8; })[0] || base;   // no hue clears the outline colour: any that does
      c = { base: base, shade: kit.tint(base, oc, 0.18), hi: tk.surface };
      return (rt ? [art._.retraceG(rt, rec.paths.map(function (p) { return p.d; }), vb / 24, sw, rt.tint || kit.tint(oc, ground, 0.5))] : []).concat(paths(rec, c, oc, sw, dna));
    }
    if (tr === "sticker") {   // die-cut: the paper keyline follows the silhouette, the lift sits under it
      fo.outline = px; m = kit.measure("die", g, fo);
      var W = m.w, c = W / 2, kw = sw + 2 * m.paper / k, ink = fo.ink || tk.ink, s = m.sh, i, nodes = [], T = function (ox, oy) { return "translate(" + n(c - g * f / 2 + ox * k) + " " + n(c - g * f / 2 + oy * k) + ") scale(" + n(k) + ")"; };
      var at = T((x.rtl ? -1 : 1) * s.dx / k, s.dy / k);
      if (m.lift === "hard") nodes.push(kit.g(paths(rec, null, ink, kw, dna), { transform: at }));
      else if (m.lift === "soft") for (i = 0; i < 6; i++) nodes.push(kit.g(rec.paths.map(function (p) { return kit.path(p.d, { fill: "#000000", stroke: "#000000", "stroke-width": kw + i / 10 * s.blur / k, "stroke-linejoin": "round", "fill-opacity": 0.035, "stroke-opacity": 0.035 }); }), { transform: at }));
      nodes.push(kit.g(paths(rec, null, tk.paper, kw, { cap: "round", join: "round" }), { transform: T(0, 0) }), kit.g(body(tk.bg), { transform: T(0, 0) }));
      if (m.tilt) nodes = [kit.g(nodes, { transform: "rotate(" + n(m.tilt) + " " + n(c) + " " + n(c) + ")" })];
      return { el: kit.svg(W, W, nodes, Object.assign({ class: "cs-icon" }, fo.attrs)), w: W, S: g, pad: m.pad, g: g };
    }
    return kit.frame(tr, g, fo, function (cx, cy, gg, ink, y) {
      return [kit.g(body(y.fill || o.ground || tk.bg), { transform: "translate(" + n(cx - gg * f / 2) + " " + n(cy - gg * f / 2) + ") scale(" + n(gg * f / vb) + ")" })];
    });
  }
  function object(id, o) { var r = make(id, o); return r && r.el; }
  object.full = make;
  object.ids = function ids(o) { var l = block(o || {}); return l ? l.map(function (r) { return r.id; }) : []; };
  object.outline = function outline(size, o) {
    var r = o && o.objectOutline != null ? o.objectOutline : o && raw(o).objectOutline;
    r = typeof r === "number" && isFinite(r) ? Math.min(0.04, Math.max(0.03, r)) : 0.035;
    return Math.min(20, Math.max(4, Math.round(r * kit.gOf(size))));
  };
  art.object = object;
})();
