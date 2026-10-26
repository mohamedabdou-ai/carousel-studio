/* Q3a: DOM -> Box in body-zone px. Only painted content owns space; no layout-slot rectangles.
 * collectBoxes(slideEl, {zone?, canvasW?, canvasH?}) is also usable outside QA. */
(function () {
  var Q = CS.qav, H = Q._rendered = {}, OWN = '[data-owner="1"]';
  var EX = '.cs-bg,.cs-decor,.cs-header,.cs-footer,.cs-rail,.cs-marks,.cs-thread,svg [data-mark],[data-ghost="1"],[data-ground="1"],[data-word-style="lettermark"],[data-wordstyle="lettermark"],[data-slot="handle"],[data-slot="meta"],[data-slot="counter"],[data-slot="swipe"],[data-slot="savepill"]';
  var ANCHOR = '.cs-art,[data-anchor-kind],[data-slot="anchor"],.cs-media-slot,[data-slot="media"],.cs-number,[data-slot="number"],.cs-big-word,.cs-slide[data-variant="numeral"] .cs-ord';
  function num(v) { return parseFloat(v) || 0; }
  function alpha(s) { var m = /rgba?\(([^)]+)\)/.exec(s || ''); return !s || s === 'none' || s === 'transparent' ? 0 : m && m[1].split(/[, /]+/).length > 3 ? num(m[1].split(/[, /]+/)[3]) : 1; }
  function visible(el, root) {
    if (el.closest(EX)) return false;
    for (var p = el; p; p = p.parentElement) {
      var c = getComputedStyle(p);
      if (c.display === 'none' || c.visibility === 'hidden' || num(c.opacity) === 0) return false;
      if (p === root) break;
    }
    return true;
  }
  function key(el, root) { var p = el.closest('[data-slot-key]'); return p ? p.getAttribute('data-slot-key') : root.getAttribute('data-cs-slide') || root.id || 'slide'; }
  function config(ctx) { return ctx.bundle && ctx.bundle.platform && ctx.bundle.platform.plugin && ctx.bundle.platform.plugin.visual || {}; }
  function zoneOf(el, o) {
    if (o.zone) return o.zone;
    var h = o.canvasH || el.offsetHeight || 1440, p = o.platform || {}, g = p.geometry || {}, type = el.getAttribute('data-type'),
        inner = type !== 'cover' && type !== 'poster', b = inner && g.inner && g.inner.bodyArea || g.bodyArea || { x: 114, y: 261, w: 852, h: inner ? 998 : 888 },
        preset = el.getAttribute('data-preset') || o.preset, pads = p.plugin && p.plugin.visual && p.plugin.visual.zone && p.plugin.visual.zone.padEnd || { poster: 48, heritage: 44, posterType: 24 },
        pad = pads[preset] ? type === 'poster' ? pads.posterType : pads[preset] : 0;
    return { x: b.x, y: b.y, w: b.w, h: b.h + h - 1440 - pad };
  }
  function measure(el, o) {
    o = o || {};
    var z = zoneOf(el, o), root = el.getBoundingClientRect(), sx = root.width / (o.canvasW || el.offsetWidth || 1080) || 1,
        sy = root.height / (o.canvasH || el.offsetHeight || 1440) || sx, boxes = [], owners = [], ownerIds = new Map();
    function rect(r) { return { x: Math.round((r.left - root.left) / sx - z.x), y: Math.round((r.top - root.top) / sy - z.y), w: Math.round(r.width / sx), h: Math.round(r.height / sy) }; }
    function up(e) { var p = e.parentElement && e.parentElement.closest(OWN); return ownerIds.get(p); }
    function add(e, r, kind, props) {
      var b = Object.assign(rect(r), { kind: kind }, props || {}), id = up(e);
      if (id != null) b.ownerOf = id;
      if (kind !== 'owner') b.anchor = !!e.closest(ANCHOR);
      if (b.w > 0 && b.h > 0) boxes.push(b);
      return b;
    }
    Array.prototype.forEach.call(el.querySelectorAll(OWN), function (e) { if (visible(e, el)) { ownerIds.set(e, 'owner-' + owners.length); owners.push(e); } });
    owners.forEach(function (e) {
      var c = getComputedStyle(e), border = Math.max(num(c.borderTopWidth), num(c.borderRightWidth), num(c.borderBottomWidth), num(c.borderLeftWidth));
      var fill = c.backgroundImage && c.backgroundImage !== 'none' ? 1 : alpha(c.backgroundColor), op = 1;
      for (var p = e; p && p !== el; p = p.parentElement) op *= num(getComputedStyle(p).opacity);
      if (e.namespaceURI === 'http://www.w3.org/2000/svg') fill = Math.max(fill, alpha(c.fill) * num(c.fillOpacity));
      add(e, e.getBoundingClientRect(), 'owner', { id: ownerIds.get(e), fill: fill * op, border: border * op, anchor: true });
    });
    var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT), n, lines = new Map();
    while ((n = walker.nextNode())) {
      var e = n.parentElement;
      if (!/\S/.test(n.nodeValue) || !e || /^(STYLE|SCRIPT|TEMPLATE)$/.test(e.tagName) || e.closest('svg') || !visible(e, el)) continue;
      var c = getComputedStyle(e), col = c.color.match(/[\d.]+/g), bg = null, fade = alpha(c.color);
      // Resolve the painted local ground; transparent roots are not black backgrounds.
      for (var ground = e; ground; ground = ground.parentElement) {
        var paint = getComputedStyle(ground);
        if (paint.backgroundImage && paint.backgroundImage !== 'none') break;
        if (alpha(paint.backgroundColor) > 0) { bg = paint.backgroundColor.match(/[\d.]+/g); break; }
        if (ground === el) break;
      }
      for (var p = e; p && p !== el; p = p.parentElement) fade *= num(getComputedStyle(p).opacity);
      if (fade < 0.35 || col && bg && Math.max(Math.abs(+col[0] - bg[0]), Math.abs(+col[1] - bg[1]), Math.abs(+col[2] - bg[2])) / 255 < 0.35) continue;
      var range = document.createRange(); range.selectNodeContents(n);
      Array.prototype.forEach.call(range.getClientRects(), function (r) {
        if (r.width < 0.5 || r.height < 0.5) return;
        var line = e.closest('.cs-ln') || e.closest('[data-slot-key],[data-slot]') || e,
            rs = lines.get(line) || [], b = rect(r), hit = rs.find(function (a) { return Math.abs(a.y - b.y) < Math.min(a.h, b.h) / 2; });
        if (hit) { var right = Math.max(hit.x + hit.w, b.x + b.w); hit.x = Math.min(hit.x, b.x); hit.w = right - hit.x; hit.h = Math.max(hit.y + hit.h, b.y + b.h) - Math.min(hit.y, b.y); hit.y = Math.min(hit.y, b.y); }
        else rs.push(Object.assign(b, { kind: 'text', ownerOf: ownerIds.get(e.closest(OWN)), anchor: !!e.closest(ANCHOR) }));
        lines.set(line, rs);
      });
    }
    lines.forEach(function (rs) { rs.forEach(function (b) { if (b.ownerOf == null) delete b.ownerOf; boxes.push(b); }); });
    Array.prototype.forEach.call(el.querySelectorAll('img,video,svg path,svg rect,svg circle,svg ellipse,svg line,svg polyline,svg polygon,svg use'), function (e) {
      if (!visible(e, el) || ownerIds.has(e) || e.closest('defs,clipPath,mask,symbol')) return;
      var svg = e.namespaceURI === 'http://www.w3.org/2000/svg', c = getComputedStyle(e), stroke = svg && alpha(c.stroke) * num(c.strokeOpacity) > 0 && num(c.strokeWidth) > 0,
          filled = svg && alpha(c.fill) * num(c.fillOpacity) > 0;
      if (svg && !stroke && !filled) return;
      if (svg && !filled && stroke && typeof e.getTotalLength === 'function') {
        var matrix = e.getScreenCTM(), len = e.getTotalLength(), path = [], steps = Math.max(1, Math.ceil(len * Math.max(Math.hypot(matrix.a, matrix.b) / sx, Math.hypot(matrix.c, matrix.d) / sy) / 32));
        for (var i = 0; i <= steps; i++) {
          var pt = e.getPointAtLength(len * i / steps), screen = new DOMPoint(pt.x, pt.y).matrixTransform(matrix);
          path.push([Math.round((screen.x - root.left) / sx - z.x), Math.round((screen.y - root.top) / sy - z.y)]);
        }
        var r = rect(e.getBoundingClientRect());
        boxes.push(Object.assign(r, { w: Math.max(1, r.w), h: Math.max(1, r.h), kind: 'ink', path: path, anchor: !!e.closest('.cs-art,[data-slot="anchor"]') }, up(e) == null ? {} : { ownerOf: up(e) }));
      } else add(e, e.getBoundingClientRect(), svg ? 'ink' : 'image');
    });
    return { boxes: boxes, zone: z, owners: owners, scale: sx, rect: rect };
  }
  Q.collectBoxes = function (el, opts) { return measure(el, opts).boxes; };
  function finding(ctx, id, S, sev, vars, el) {
    var entry = ctx.R && ctx.R.checks[id], def = entry && entry.def || {}, v = vars || {}, rollout = config(ctx).rollout || {},
        capped = /^D9\.|^VA[12]\./.test(id), actual = capped && rollout.stage === 0 ? rollout.stage0Sev || 'NOTE' : sev;
    function fmt(t) { return String(t || id).replace(/\{([A-Za-z0-9_]+)\}/g, function (m, k) { return v[k] == null ? m : String(v[k]); }); }
    var f = { gate: entry && entry.gate.id || id.split('.')[0], rule: id, slide: S.id, el: el || S.id, sev: actual, prospect: actual !== sev,
      msg: { ar: fmt(def.msg && def.msg.ar), en: fmt(def.msg && def.msg.en) }, autofixed: false };
    if (def.fix) f.fix = { ar: fmt(def.fix.ar), en: fmt(def.fix.en) };
    return f;
  }
  function slides(ctx, fn) {
    var out = [], p = ctx.bundle && ctx.bundle.platform;
    (ctx.S || []).forEach(function (S) {
      if (ctx.slideFilter && !ctx.slideFilter.has(S.id)) return;
      var s = S.slide || {}, mode = ctx.spec && ctx.spec.style && ctx.spec.style.visualMode;
      if (!CS.visual?.free?.active(s) && (mode === 'off' || S.tokens && S.tokens.art === null)) return;
      var m = measure(S.el, { platform: p, canvasW: S.W, canvasH: S.H, preset: S.tokens && S.tokens.id });
      fn(S, s, m, out);
    });
    return out;
  }
  Object.assign(H, { num: num, alpha: alpha, visible: visible, key: key, config: config, measure: measure, finding: finding, slides: slides });
  function metrics(ctx, m) {
    var c = config(ctx);
    if (!CS.visual || typeof CS.visual.deadSpace !== 'function') return null;
    return CS.visual.deadSpace(m.boxes, m.zone, { grid: c.grid, halo: c.halo, owner: c.owner, occ: c.grid && c.grid.occ, canvasH: ctx.spec.canvas && ctx.spec.canvas.h || 1440 });
  }
  ['D9.band', 'D9.rect', 'D9.fill', 'D9.container-fill', 'VA2.anchor-size'].forEach(function (id) {
    Q.add('rendered', { id: id, ids: [id], run: function (ctx) {
      return slides(ctx, function (S, s, m, out) {
        var c = config(ctx), d = metrics(ctx, m), kind = s.visual && s.visual.anchor && s.visual.anchor.kind, pause = s.visual && s.visual.pause,
            cover = S.type === 'cover' || S.type === 'poster', cls = pause ? 'pause' : cover ? 'cover' : 'working', sev, value, need;
        if (!d) return;
        if (id === 'D9.container-fill') {
          d.owners.forEach(function (o) { if (!o.ok) { var pct = Math.min(o.rows, o.cols); out.push(finding(ctx, id, S, pct < c.owner.fixBelow || o.meta !== 'ok' ? 'FIX' : 'NOTE', { el: o.id, pct: pct, min: o.need }, o.id)); } });
          return;
        }
        if (id === 'VA2.anchor-size') {
          if (pause || cover || CS.visual?.free?.active(s)) return;
          var a = c.anchorShare, min = a.types[S.type] && a.types[S.type].min || 0;
          if ((c.classes.peak || []).indexOf(S.type) >= 0) min = Math.max(min, a.peakMin);
          value = d.anchorShare; need = min;
          sev = value < min * a.fixFactor / 100 ? 'FIX' : value < min ? 'NOTE' : null;
          var inks = m.boxes.filter(function (b) { return b.anchor && b.kind !== 'owner' && b.kind !== 'text'; }), container = d.owners.some(function (o) { return o.ok; });
          var glyph = inks.length ? Math.max.apply(null, inks.map(function (b) { return Math.max(b.w, b.h); })) : 0;
          if (kind === 'icon' && !container && inks.length && glyph < a.minGlyphPx) { sev = 'FIX'; value = glyph; need = a.minGlyphPx; }
          var art = S.el.querySelector('.cs-art');
          var width = art && Math.round(m.rect(art.getBoundingClientRect()).w * 1000 / m.zone.w) / 10;
          if ((kind === 'chart' || kind === 'mock') && art && width < a.minMockWidth) { sev = 'FIX'; value = width; need = a.minMockWidth; }
          if (S.type === 'compare') {
            var sides = S.el.querySelectorAll('.cs-side'), sideMin = a.compareSideCanvas, canvas = (S.W || 1080) * (S.H || 1440);
            // Compare has its own per-side canvas requirement, not a type-wide zone minimum.
            for (var i = 0; i < 2; i++) {
              var r = sides[i] && m.rect(sides[i].getBoundingClientRect()), share = r ? Math.round(r.w * r.h * 1000 / canvas) / 10 : 0;
              if (share < sideMin) out.push(finding(ctx, id, S, share < sideMin * a.fixFactor / 100 ? 'FIX' : 'NOTE', { value: share, need: sideMin }, sides[i] && key(sides[i], S.el)));
            }
            return;
          }
        } else {
          if (s.media && s.media.slot === 'plate') return;
          var metric = id.split('.')[1], t = c[metric] && (c[metric][cls] || (cls !== 'cover' ? c[metric].working : null));
          if (!t) return;
          value = d[metric]; need = t.note;
          sev = value >= t.fix ? 'FIX' : value >= t.note ? 'NOTE' : null;
          if (c.rollout.stage >= 2 && c.block[metric] && c.block[metric].enabled && t.block != null && value >= t.block) sev = 'BLOCK';
        }
        var start = 0, longest = 0, run = 0;
        if (id === 'D9.band') d.cells.forEach(function (row, i) {
          run = (row.match(/#/g) || []).length <= 1 ? run + 1 : 0;
          if (run > longest) { longest = run; start = i + 1 - run; }
        });
        if (sev) out.push(finding(ctx, id, S, sev, { pct: value, value: value, max: need, need: need,
          from: Math.round(m.zone.y + start * m.zone.h / d.cells.length), to: Math.round(m.zone.y + (start + longest) * m.zone.h / d.cells.length) }));
      });
    } });
  });
})();
