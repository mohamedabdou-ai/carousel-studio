/* src/art/marks.js - owned by A9. CS.art.marks: the cs-art-marks library as geometry (px, rounded to 0.5) and painter-safe nodes (spec 3.5). Text-bound marks: CS.visual.settle; anchor-bound:
 * make(id, {x,y,w,h} | {from,to}, ctx, {form,color,rot,bow}) -> { el, rec, box } | null; entry { id, f: line|brush|fill, d, w, c: colour role, k, A: ink px2 }. */
(function () {
  var kit = CS.art.kit, M = (CS.art.marks = {}), Z = Math, D = Z.PI / 180;
  function R(v) { return Z.round(v * 2) / 2; }
  function P(p) { return R(p[0]) + " " + R(p[1]); }
  function hy(a, b) { return Z.hypot(b[0] - a[0], b[1] - a[1]); }
  M.lib = function (c) { var V = CS.visual; return (c && c.data && c.data.marks) || (V && V._.block("cs-art-marks")) || null; };
  function parse(d) {
    var t = d.match(/[MLCZ]|-?\d*\.?\d+/g), i = 0, s = [], c, k, n, a;
    while (i < t.length) {
      k = t[i++];
      if (k === "Z") c.z = 1;
      else { for (a = [], n = k === "C" ? 3 : 1; n--;) a.push([+t[i++], +t[i++]]); if (k === "M") s.push(c = { p: a[0], g: [] }); else c.g.push({ t: k, p: a }); }
    }
    return s;
  }
  function map(s, f) { return s.map(function (c) { return { p: f(c.p), z: c.z, g: c.g.map(function (q) { return { t: q.t, p: q.p.map(f) }; }) }; }); }
  function flat(c) {
    var o = [c.p], p = c.p;
    c.g.forEach(function (q) {
      var n = q.t === "L" ? 1 : 5, k, t, Q;
      for (k = 1; k <= n; k++) { for (t = k / n, Q = [p].concat(q.p); Q.length > 1;) Q = Q.slice(1).map(function (b, i) { return [Q[i][0] + (b[0] - Q[i][0]) * t, Q[i][1] + (b[1] - Q[i][1]) * t]; }); o.push(Q[0]); }
      p = q.p[q.p.length - 1];
    });
    return o;
  }
  function len(p) { return p.reduce(function (a, v, i) { return i ? a + hy(p[i - 1], v) : 0; }, 0); }
  function brush(p, w, f) {   // centreline widened by profile f
    var a = [], b = [], n = p.length, L = len(p) || 1, s = 0, i, j, u, h, x, y, m, v;
    for (i = 0; i < n; i++) {
      s += i ? hy(p[i - 1], p[i]) : 0;
      for (j = 1; j < f.length - 1 && s / L > f[j][0];) j++;
      u = Z.min(1, Z.max(0, (s / L - f[j - 1][0]) / (f[j][0] - f[j - 1][0] || 1))); h = w * (f[j - 1][1] + (f[j][1] - f[j - 1][1]) * u) / 2;
      v = p[Z.max(0, i - 1)]; x = p[Z.min(n - 1, i + 1)][0] - v[0]; y = p[Z.min(n - 1, i + 1)][1] - v[1]; m = Z.hypot(x, y) || 1;
      a.push([p[i][0] - y / m * h, p[i][1] + x / m * h]); b.push([p[i][0] + y / m * h, p[i][1] - x / m * h]);
    }
    return a.concat(b.reverse());
  }
  function poly(p) {
    var o = "M" + P(p[0]), x = R(p[0][0]), y = R(p[0][1]), i, a, b;
    for (i = 1; i < p.length; i++) { a = R(p[i][0]); b = R(p[i][1]); if (a !== x || b !== y) o += "l" + (a - x) + " " + (b - y); x = a; y = b; }
    return o + "z";
  }
  function area(p) { var s = 0, i, a, b; for (i = 0; i < p.length; i++) { a = p[i]; b = p[(i + 1) % p.length]; s += a[0] * b[1] - b[0] * a[1]; } return Z.abs(s) / 2; }
  M.jitter = function (seed, deck, k) {
    var r = kit.rng(seed + "|j"), g = kit.rng("hand|" + (deck || "")).sign();
    k = k || 1;
    return { rot: g * (0.3 + 0.7 * r()) * 3 * k, sc: 1 + (r() * 2 - 1) * 0.04, sk: g * (0.3 + 0.7 * r()) * 2 * k, dx: (r() * 2 - 1) * 6, dy: (r() * 2 - 1) * 6 };
  };
  /* place(template, target, ctx, {form, rtl, seed, deck, bow, rot, color, k}) -> entry; the deck fixes the lean */
  M.place = function (m, t, c, o) {
    o = o || {};
    var L = M.lib(c), F = m.form === "fill" ? "fill" : o.form === "brush" ? "brush" : "line", B = F === "brush", rt = B ? L.brush : L.line, j = M.jitter(o.seed || m.id, o.deck, t.w && Z.min(1, 4 * t.h / t.w)), d = "", A = 0, s = parse(m.d);
    var at, lim = 1, z, k, f, w, e, l, g, jc = Z.cos(j.rot * D) * j.sc, js = Z.sin(j.rot * D) * j.sc, jk = Z.tan(j.sk * D), rc = Z.cos((o.rot || 0) * D), rs = Z.sin((o.rot || 0) * D);
    if (m.fit === "pair") {
      e = [m.tip[0] - m.tail[0], m.tip[1] - m.tail[1]]; l = Z.hypot(e[0], e[1]) || 1; z = hy(t.from, t.to); at = t.to; lim = 0;
      g = Z.atan2(t.to[1] - t.from[1], t.to[0] - t.from[0]) - Z.atan2(e[1], e[0]);
      f = function (p) { var x = p[0] - m.tail[0], y = p[1] - m.tail[1], q = 2 * (x * e[0] + y * e[1]) / l / l; if (o.bow) { x = q * e[0] - x; y = q * e[1] - y; } return [t.from[0] + (x * Z.cos(g) - y * Z.sin(g)) * z / l, t.from[1] + (x * Z.sin(g) + y * Z.cos(g)) * z / l]; };
    } else {
      z = Z.sqrt(t.w * t.h); at = [t.x + t.w / 2, t.y + t.h / 2]; lim = Z.min(1, Z.min(t.w, t.h) / 50); g = m.aspect || 1;
      k = m.fit === "uniform" ? Z.min(t.w / (g >= 1 ? 100 : 100 * g), t.h / (g >= 1 ? 100 / g : 100)) : 0;
      f = function (p) { var x = o.rtl === false ? p[0] : 100 - p[0]; return k ? [at[0] + (x - 50) * k, at[1] + (p[1] - 50) * k] : [t.x + x * t.w / 100, t.y + p[1] * t.h / 100]; };
    }
    s = map(s, function (p) {
      var q = f(p), x = q[0] - at[0], y = q[1] - at[1];
      x += y * jk; q = [at[0] + x * jc - y * js + j.dx * lim, at[1] + x * js + y * jc + j.dy * lim];
      return [q[0] * rc - q[1] * rs, q[0] * rs + q[1] * rc];
    });
    w = Z.max(rt.wMin, Z.min(rt.wMax, z * rt.wRatio) * (m[B ? "bw" : "lw"] || 1));
    s.forEach(function (c) {
      var p = flat(c);
      if (B) { p = brush(p, w, m.profile || L.brush.profile); d += poly(p); A += area(p); }
      else { d += "M" + P(c.p) + c.g.map(function (v) { return v.t + v.p.map(P).join(" "); }).join("") + (c.z ? "Z" : ""); A += F === "line" ? w * len(p) : area(p); }
    });
    return { id: m.id, f: F, d: d, w: R(w), c: o.color || "accent", k: o.k || 0, A: Z.round(A) };
  };
  /* preset art.marks: the families or ids it draws (none = all); art.doodle marker or brush = brush marks */
  M.allow = function (art, m, want) {
    var l = art && art.marks;
    if (Array.isArray(l) && l.indexOf(m.family) < 0 && l.indexOf(m.id) < 0) return null;
    return want || (art && /marker|brush/.test(art.doodle) ? "brush" : "line");
  };
  M.pick = function (L, key, seed, art) {   // an id, or a family without its hand-placed cousins (open ring, cross, bracket, down, hook); only what the preset's art.marks allows, before the seeded choice
    var l = L.marks.filter(function (m) { return (m.id === key || m.family === key && !/cross|open|bracket|down|hook/.test(m.id)) && M.allow(art, m); });
    return l.length ? kit.rng(seed).pick(l) : null;
  };
  M.color = function (tk, role) {
    var p = kit.palette(tk), C = CS.core.color;
    return (role === "ink" ? [] : [p.accent, p.accent2, p.support[0], p.support[1]]).filter(function (c) { return C.contrast(c, p.bg) >= 3 && C.contrast(c, p.surface) >= 3; })[0] || p.ink;
  };
  M.nodes = function (e, tk) {
    var c = /^#[0-9a-f]{6}$/i.test(e.c || "") ? e.c : M.color(tk, e.c);
    return kit.path(e.d, Object.assign({ "data-mark": e.id }, e.f === "line" ? { fill: "none", stroke: c, "stroke-width": e.w, "stroke-linecap": "round", "stroke-linejoin": "round", pathLength: 1, "data-m": "stroke" } : { fill: c, "data-m": "decor-item" }));
  };
  M.layer = function (es, tk, W, H) {
    var s = kit.svg(W, H, es.map(function (e) { return M.nodes(e, tk); }), { class: "cs-marks", "data-m": "decor-item" });
    s.setAttribute("style", "position:absolute;left:0;top:0;pointer-events:none");
    return s;
  };
  /* At most 3 marks, 1 arrow, ink under 8%; sets k. */
  M.limit = function (es, zone) {
    var o = [], ar = 0, b, i;
    es.forEach(function (e) { var x = /^arrow/.test(e.id); if (o.length < 3 && !(x && ar)) { o.push(e); ar += x; } });
    while (o.length && o.reduce(function (a, e) { return a + e.A; }, 0) >= 0.08 * zone) { for (b = i = 0; ++i < o.length;) if (o[i].A >= o[b].A) b = i; o.splice(b, 1); }
    o.forEach(function (e, n) { e.k = n; });
    return { kept: o, dropped: es.length - o.length };
  };
  M.make = function (id, t, c, o) {
    var L = M.lib(c), seed = o?.seed || (c.slideId || "") + "|" + id, m = L && M.pick(L, id, seed, c.art), f = m && M.allow(c.art, m, o && o.form), e;
    if (!f) return null;
    e = M.place(m, t, c, Object.assign({ rtl: c.rtl, seed: (c.slideId || "") + "|" + id }, o, { form: f }));
    return { el: M.nodes(e, c.tokens), rec: e, box: Object.assign({ kind: "mark" }, t.from ? { x: Z.min(t.from[0], t.to[0]), y: Z.min(t.from[1], t.to[1]), w: Z.abs(t.to[0]-t.from[0]), h: Z.abs(t.to[1]-t.from[1]) } : t) };
  };
})();
