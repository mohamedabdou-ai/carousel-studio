/* src/art/icon.js - owned by A1b. CS.art.icon(name, o) -> <svg class="cs-icon"> | null (spec 3.1); o: see support/API.txt, plus retrace. icon.full -> { el, w, S, pad, g, fill, glyph };
 * icon.measure(o) sizes one. Also art._.retrace / retraceG, which object.js shares (S-2). */
(function () {
  var art = CS.art, kit = art.kit, n = kit.n;
  function xf(cx, cy, g, flip) { var k = g / 24; return "translate(" + n(flip ? cx + g / 2 : cx - g / 2) + " " + n(cy - g / 2) + ") scale(" + n(flip ? -k : k) + " " + n(k) + ")"; }

  /* S-2 retrace: art.retrace (true | { dx, dy, rot, tint }; o.retrace overrides, false = off): a second stroke pass under the drawing, offset dx dy (24-unit space), turned rot degrees,
   * in a solid tint. The drawing shrinks by f (about 1%) so the pass stays inside the box: S, pad and the svg do not change. */
  function lim(v, lo, hi, d) { return typeof v === "number" && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; }
  art._.retrace = function (o, tk, sw) {   // sw: the stroke in 24-unit space
    var r = o.retrace != null ? o.retrace : (o.art || (o.ctx || {}).art || {}).retrace, dx, dy, rot;
    if (!r) return null;
    if (r === true) r = {};
    dx = lim(r.dx, -2, 2, 0.5); dy = lim(r.dy, -2, 2, 0.4); rot = lim(r.rot, -5, 5, 0.8);
    return { dx: dx, dy: dy, rot: rot, tint: typeof r.tint === "string" ? kit.role(tk, r.tint, null) : null, f: Math.min(1, (12 - Math.hypot(dx, dy) - 0.3 * Math.abs(rot) + 0.1 * sw) / 11.5) };
  };
  art._.retraceG = function (rt, ds, sc, sw, tint) {   // sc: grid units per 24 (icon 1, object 2); sw: the main stroke in grid units
    var m = 12 * sc;
    return kit.g(ds.map(function (d) { return kit.path(d, { fill: "none", stroke: tint, "stroke-width": sw * 0.85, "stroke-linecap": "round", "stroke-linejoin": "round" }); }), { "data-part": "retrace", transform: "translate(" + n(rt.dx * sc) + " " + n(rt.dy * sc) + ") rotate(" + n(rt.rot) + " " + m + " " + m + ")" });
  };

  /* a glyph in 24-unit space: tinted closed subpaths (f) first, the retrace, then every stroke; dots (s) grow to the stroke's diameter (they are r = 1) */
  function glyph(rec, a) {
    var kids = [], s = rec.s || [];
    if (a.tint) (rec.f || []).forEach(function (i) { kids.push(kit.path(rec.d[i], { fill: a.tint })); });
    if (a.rt) kids.push(art._.retraceG(a.rt, rec.d.filter(function (d, i) { return s.indexOf(i) < 0; }), 1, a.sw, a.rt.tint || kit.tint(a.ink, a.ground, 0.5)));
    rec.d.forEach(function (d, i) {
      if (s.indexOf(i) >= 0) kids.push(kit.path(d, { fill: a.ink, stroke: a.sw > 2 ? a.ink : null, "stroke-width": a.sw > 2 ? a.sw - 2 : null, "stroke-linejoin": "round" }));
      else kids.push(kit.path(d, { fill: "none", stroke: a.ink, "stroke-width": a.sw, "stroke-linecap": a.cap, "stroke-linejoin": a.join, "stroke-miterlimit": a.join === "miter" ? 2.4 : null, pathLength: a.drawOn ? 1 : null, "data-m": a.drawOn ? "stroke" : null, "data-m-i": a.drawOn ? i : null }));
    });
    return kit.g(kids, { transform: xf(a.cx, a.cy, a.g, a.mirror) });
  }

  /* slash: a knock-out stroke under an ink stroke; cross plus check question: a corner badge (10.4 units); sparkle: a star at the top corner. Never mirrored. */
  function modifier(m, a) {
    var sw = a.sw, bx = a.rtl ? 5.4 : 18.6, by = 18.6, sym;
    if (m === "slash") return [kit.path("M3.5 3.5L20.5 20.5", { fill: "none", stroke: a.ground, "stroke-width": sw * 2.6, "stroke-linecap": "round" }), kit.path("M3.5 3.5L20.5 20.5", { fill: "none", stroke: a.ink, "stroke-width": sw, "stroke-linecap": "round" })];
    if (m === "sparkle") return [kit.path(kit.star(a.rtl ? 6 : 18, 6, 5, 1.3, 4), { fill: a.badge, stroke: a.ground, "stroke-width": 1.4, "stroke-linejoin": "round" })];
    sym = { check: "M" + (bx - 2.6) + " " + by + "l1.9 1.9 3.3-3.7", cross: "M" + (bx - 2.2) + " " + (by - 2.2) + "l4.4 4.4M" + (bx + 2.2) + " " + (by - 2.2) + "l-4.4 4.4", plus: "M" + bx + " " + (by - 2.6) + "v5.2M" + (bx - 2.6) + " " + by + "h5.2", question: "M" + (bx - 1.7) + " " + (by - 1.3) + "a1.7 1.7 0 1 1 2.5 1.5c-.7.4-.8.8-.8 1.4" }[m];
    if (!sym) return [];
    return [kit.path(kit.disc(bx, by, 5.2), { fill: a.ground }), kit.path(kit.disc(bx, by, 4.2), { fill: a.badge }), kit.path(sym, { fill: "none", stroke: a.onBadge, "stroke-width": Math.max(1.6, sw * 0.8), "stroke-linecap": "round", "stroke-linejoin": "round" })].concat(m === "question" ? kit.path(kit.disc(bx, by + 2.5, 0.8), { fill: a.onBadge }) : []);
  }

  function resolve(o) {
    var x = kit.session(o), size = o.size == null ? "md" : o.size, tr = o.treatment || "bare";
    if (!kit.MULT[tr]) kit.fail('unknown treatment "' + tr + '"', "E_USAGE");
    return { x: x, size: size, tr: tr, g: kit.gOf(size), sw: kit.units(size, o.stroke != null ? o.stroke : x.dna.stroke), fo: Object.assign({}, o, { dna: x.dna, tk: x.tk, rtl: x.rtl, seed: x.seed + "|" + (o.name || ""), ink: o.ink && kit.role(x.tk, o.ink) }) };
  }

  function make(name, o) {
    o = o || {};
    var p = o.pack || (CS.visual && CS.visual._ && CS.visual._.block("cs-icon-pack")), rec = p && p.icons && p.icons[name], r, m, sw, tk, rt;
    if (!rec) return null;
    r = resolve(Object.assign({ name: name }, o)); m = o.modifier || o.badge; tk = r.x.tk; sw = r.sw; rt = art._.retrace(o, tk, sw);
    r.fo.attrs = { "data-icon": name, "data-treatment": r.tr, "data-size": kit.SIZES[r.size] ? r.size : r.g, "data-m": "decor-item" };
    return kit.frame(r.tr, r.g, r.fo, function (cx, cy, g, ink, x) {
      var f = rt ? rt.f : 1, out = [glyph(rec, { cx: cx, cy: cy, g: g * f, ink: ink, sw: sw / f, cap: r.x.dna.cap, join: r.x.dna.join, tint: x.tint, mirror: !!o.mirror, drawOn: !!o.drawOn, rt: rt, ground: x.ground })], bf;
      if (m) {   // the badge takes the accent unless it vanishes on its ground (1.8:1), then a support hue, then the ink
        bf = [tk.accent, tk.support[0], tk.support[1], tk.ink].filter(function (c) { return CS.core.color.contrast(c, x.ground) >= 1.8; })[0] || tk.ink;
        out.push(kit.g(modifier(m, { sw: sw, ink: ink, ground: x.ground, rtl: r.x.rtl, badge: bf, onBadge: kit.on(bf, tk) }), { transform: xf(cx, cy, g, false) }));
      }
      return out;
    });
  }
  function icon(name, o) { var r = make(name, o); return r && r.el; }
  icon.full = make;
  icon.measure = function measure(o) { o = o || {}; var r = resolve(o); return kit.measure(r.tr, r.g, r.fo); };
  art.icon = icon;
})();
