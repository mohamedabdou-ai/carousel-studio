/* src/visual/space.js - owned by V1b. CS.visual.deadSpace(boxes, zone, opts): the dead-space measure of the planner, the sketch and the gates (spec 7.1-7.2).
 * UNITS: lengths px (body-zone origin); results band, rect, fill, anchorShare, owners[].rows|cols are PERCENT 0-100 to one decimal (band of the 1440 canvas
 * height, the rest of the zone); opts occ min big bigShare fill are percent (65; 0.65 reads as 65, so 1 is 100); halos, border px; box.fill an OPACITY 0-1.
 * Box {x, y, w, h, kind: text|ink|owner|pattern|image|mark|decor (else ink), id?, ownerOf? (id of its owner), fill?, border?, anchor? (true|false overrides:
 * every kind but text is an anchor), path? ([[x, y], ...]: a 48 px ink box per 32 px), ground?, ghost?, lettermark?, contrast? (< 0.35 never counts)}.
 * An owner (owner|pattern) owns its interior only if fill >= 35% opacity or border >= 3 px AND 65% (80% above 60% of the zone) of its rows AND columns hold
 * content. opts.strict (default true): no valid fill and no valid border = not an owner; strict:false lets it qualify. owners[]: {id, rows, cols, ok, need,
 * meta "ok"|"weak"|"none"}. 36 x 37 grid, 4 x 4 samples, 30% occupied, integers: _cs/space.py agrees to the cell. opts: flat keys or nested grid/halo/owner. */
(function () {
  var SUB = 4, KIND = { text: "t", image: "g", owner: "o", pattern: "o" };
  var D = { cols: 36, rows: 37, occ: 30, canvasH: 1440, hText: 16, hInk: 32, hOwn: 0, min: 65, big: 80, bigShare: 60, fill: 35, border: 3 };

  function pc(v) { return v <= 1 ? Math.round(v * 100) : v; }
  function pct(n, d) { return d ? Math.floor((2000 * n + d) / (2 * d)) / 10 : 0; }

  function cfg(o) {
    var c = {}, k, g, h, w;
    o = o || {}; g = o.grid || {}; h = o.halo || {}; w = o.owner || {};
    for (k in D) c[k] = typeof o[k] === "number" ? o[k] : D[k];
    c.cols = g.cols || g[0] || c.cols; c.rows = g.rows || g[1] || c.rows; c.strict = o.strict !== false;
    [["hText", h.text], ["hInk", h.ink], ["hOwn", h.owner], ["min", w.min], ["big", w.big], ["bigShare", w.bigShare], ["fill", w.fill], ["border", w.border]].forEach(function (p) { if (p[1] != null) c[p[0]] = p[1]; });
    ["occ", "min", "big", "bigShare", "fill"].forEach(function (q) { c[q] = pc(c[q]); });
    return c;
  }

  function strokeBoxes(path, step, size) {
    var s = step || 32, z = size || 48, out = [], cum = [0], n = path.length, i, k, d, t, a, b, len, dx, dy;
    for (i = 1; i < n; i++) { dx = path[i][0] - path[i - 1][0]; dy = path[i][1] - path[i - 1][1]; cum.push(cum[i - 1] + Math.sqrt(dx * dx + dy * dy)); }
    len = cum[n - 1];
    for (k = 0; k === 0 || k * s < len; k++) {
      d = (k * s + Math.min((k + 1) * s, len)) / 2;
      for (i = 1; i < n - 1 && cum[i] < d; i++);
      a = path[i - 1]; b = path[i] || a;
      t = cum[i] > cum[i - 1] ? (d - cum[i - 1]) / (cum[i] - cum[i - 1]) : 0;
      out.push({ x: Math.floor(a[0] + t * (b[0] - a[0]) - z / 2 + 0.5), y: Math.floor(a[1] + t * (b[1] - a[1]) - z / 2 + 0.5), w: z, h: z, kind: "ink" });
    }
    return out;
  }

  function expand(boxes) {
    var out = [];
    boxes.forEach(function (b) {
      var k = b && b.kind || "ink";
      if (!b || k === "mark" || k === "decor" || b.ground || b.ghost || b.lettermark || (b.contrast != null && b.contrast < 0.35)) return;
      (b.path && b.path.length ? strokeBoxes(b.path) : [b]).forEach(function (q) {
        if (q.w > 0 && q.h > 0) {
          out.push({ k: KIND[k] || "i", r: [q.x, q.y, q.x + q.w, q.y + q.h],
            id: b.id == null ? "#" + out.length : b.id, up: b.ownerOf, an: b.anchor, fill: b.fill, border: b.border });
        }
      });
    });
    return out;
  }

  function infl(m, c) { var h = m.k === "t" ? c.hText : m.k === "i" ? c.hInk : c.hOwn; return [m.r[0] - h, m.r[1] - h, m.r[2] + h, m.r[3] + h]; }

  function held(m, c, x) {
    var out = m.hd;
    if (out) return out;
    out = [];
    m.busy = 1;
    x.items.forEach(function (k) {
      if (k === m || k.busy || k.up == null || k.up !== m.id) return;
      if (k.k === "o") judge(k, c, x);
      (k.k !== "o" ? [infl(k, c)] : k.ok ? [k.r] : held(k, c, x)).forEach(function (r) { if (out.indexOf(r) < 0) out.push(r); });
    });
    m.busy = 0;
    return (m.hd = out);
  }

  function meta(m, c) {
    var f = typeof m.fill === "number" && m.fill >= 0 && m.fill <= 1 ? m.fill : -1, b = typeof m.border === "number" && m.border >= 0 ? m.border : -1;
    return f < 0 && b < 0 ? "none" : f >= c.fill / 100 || b >= c.border ? "ok" : "weak";
  }

  function judge(m, c, x) {
    if (m.done) return;
    m.done = 1;
    var W = x.W, H = x.H, C = c.cols, R = c.rows, X0 = Math.max(0, m.r[0]), Y0 = Math.max(0, m.r[1]), X1 = Math.min(W, m.r[2]), Y1 = Math.min(H, m.r[3]),
        cont = held(m, c, x), rh = 0, ch = 0, rn = 0, cn = 0, ra, ca, i;
    if (X1 > X0 && Y1 > Y0) {
      ra = Math.floor(Y0 * R / H); ca = Math.floor(X0 * C / W);
      rn = Math.floor((Y1 - 1) * R / H) - ra + 1; cn = Math.floor((X1 - 1) * C / W) - ca + 1;
      for (i = ra; i < ra + rn; i++) if (cont.some(function (q) { return (Math.min(q[3] * R, (i + 1) * H) - Math.max(q[1] * R, i * H)) * 100 >= c.occ * H; })) rh++;
      for (i = ca; i < ca + cn; i++) if (cont.some(function (q) { return (Math.min(q[2] * C, (i + 1) * W) - Math.max(q[0] * C, i * W)) * 100 >= c.occ * W; })) ch++;
    }
    m.need = (X1 - X0) * (Y1 - Y0) * 100 > c.bigShare * W * H ? c.big : c.min;
    m.rs = pct(rh, rn); m.cs = pct(ch, cn); m.meta = meta(m, c);
    m.ok = rn > 0 && cn > 0 && rh * 100 >= m.need * rn && ch * 100 >= m.need * cn && (m.meta === "ok" || (m.meta === "none" && !c.strict));
  }

  function at(v, S, n) { var i = 0; while (i < n && S * (2 * i + 1) < v * 2 * n) i++; return i; }

  function cover(rs, c, W, H) {
    var C = c.cols, R = c.rows, nx = C * SUB, ny = R * SUB, need = (SUB * SUB * c.occ + 99) / 100 | 0, g = [], o = [], n = 0, y, r, k, s, a, b;
    for (y = 0; y < ny; y++) g.push(new Uint8Array(nx));
    rs.forEach(function (q) {
      var x0 = Math.max(0, q[0]), y0 = Math.max(0, q[1]), x1 = Math.min(W, q[2]), y1 = Math.min(H, q[3]), i0, i1, j, j1;
      if (x1 <= x0 || y1 <= y0) return;
      i0 = at(x0, W, nx); i1 = at(x1, W, nx); j1 = at(y1, H, ny);
      for (j = at(y0, H, ny); j < j1; j++) g[j].fill(1, i0, i1);
    });
    for (r = 0; r < R; r++) {
      o.push([]);
      for (k = 0; k < C; k++) {
        for (s = 0, a = 0; a < SUB; a++) for (b = 0; b < SUB; b++) s += g[r * SUB + a][k * SUB + b];
        o[r].push(s >= need ? 1 : 0); n += o[r][k];
      }
    }
    return { o: o, n: n };
  }

  function bigRect(o, R, C) {
    var h = [], best = 0, r, i, j, m;
    for (i = 0; i < C; i++) h.push(0);
    for (r = 0; r < R; r++) {
      for (i = 0; i < C; i++) h[i] = o[r][i] ? 0 : h[i] + 1;
      for (i = 0; i < C; i++) for (j = i, m = h[i]; j < C && h[j]; j++) { m = Math.min(m, h[j]); best = Math.max(best, m * (j - i + 1)); }
    }
    return best;
  }

  function deadSpace(boxes, zone, opts) {
    var c = cfg(opts), W = (zone && zone.w) || 852, H = (zone && zone.h) || 888, x = { items: expand(boxes || []), W: W, H: H },
        rects = [], anch = [], owners = [], g, a, run = 0, best = 0;
    x.items.forEach(function (m) {
      if (m.k === "o") {
        judge(m, c, x);
        owners.push({ id: m.id, rows: m.rs, cols: m.cs, ok: m.ok, need: m.need, meta: m.meta });
        if (m.ok) rects.push(m.r);
      } else rects.push(infl(m, c));
      if (m.an == null ? m.k !== "t" : m.an) anch.push(m.r);
    });
    g = cover(rects, c, W, H); a = cover(anch, c, W, H);
    g.o.forEach(function (row) {
      if (row.reduce(function (p, v) { return p + v; }, 0) <= 1) best = Math.max(best, ++run); else run = 0;
    });
    return {
      band: pct(best * H, c.rows * c.canvasH), rect: pct(bigRect(g.o, c.rows, c.cols), c.rows * c.cols),
      fill: pct(c.rows * c.cols - g.n, c.rows * c.cols), anchorShare: pct(a.n, c.rows * c.cols),
      cells: g.o.map(function (row) { return row.map(function (v) { return v ? "#" : "."; }).join(""); }), owners: owners
    };
  }

  deadSpace.strokeBoxes = strokeBoxes;
  CS.visual._.register("deadSpace", deadSpace);
})();
