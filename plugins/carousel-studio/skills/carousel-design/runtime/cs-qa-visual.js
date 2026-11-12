/*! Carousel Studio runtime chunk cs-qa-visual.js · cs-1.1.1 · Apache-2.0 */
(function () {
  "use strict";
  var CS = (window.CS = window.CS || {});
  /* ---- file: register.js ---- */
/* src/qa-visual/register.js - owned by F3. CS.qav.add(scope, gate) puts a gate into CS.qa._.gates[scope] (text or
 * rendered); until that hook exists the gate waits in a queue that flush() and every add retry. */
(function () {
  var qav = (CS.qav = CS.qav || {}), queue = [];

  /** Moves queued gates into the hook when present; returns how many still wait. */
  qav.flush = function flush() {
    var hook = CS.qa && CS.qa._ && CS.qa._.gates;
    queue = queue.filter(function (q) {
      var l = hook && hook[q.scope];
      if (!l) return true;
      if (l.indexOf(q.gate) < 0) l.push(q.gate);
      return false;
    });
    return queue.length;
  };
  qav.add = function add(scope, gate) {
    if (scope !== "text" && scope !== "rendered") throw new Error("CS.qav.add: scope is text or rendered");
    queue.push({ scope: scope, gate: gate });
    qav.flush();
    return gate;
  };
})();

  /* ---- file: deadspace-gates.js ---- */
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
    function ownerOf(e) { for (var p = e; p && p !== el; p = p.parentElement) if (ownerIds.has(p)) return ownerIds.get(p); }
    function up(e) { return ownerOf(e.parentElement); }
    function add(e, r, kind, props) {
      var b = Object.assign(rect(r), { kind: kind }, props || {}), id = up(e);
      if (id != null) b.ownerOf = id;
      if (kind !== 'owner') b.anchor = !!e.closest(ANCHOR);
      if (b.w > 0 && b.h > 0) boxes.push(b);
      return b;
    }
    // A painted free-lane element is a panel when it holds content (its fill is then measured), or when it is an empty leaf the size of a card
    // (a frame with nothing in it). Every other painted element is a drawn shape: a chart bar, a track, a piece of a scene. Published posts
    // draw whole scenes this way, and a shape is not an empty container.
    var card = o.platform && o.platform.plugin && o.platform.plugin.visual && o.platform.plugin.visual.owner && o.platform.plugin.visual.owner.card || { minW: 40, minH: 160, minArea: 8 };
    function holdsContent(e) { return /\S/.test(e.textContent) || !!e.querySelector('svg,img,video,canvas,[data-icon],[data-object],[data-picture],[data-field],.cs-icon'); }
    function emptyCard(e) {
      if (e.firstElementChild) return false;
      var r = rect(e.getBoundingClientRect());
      return r.w * 100 >= card.minW * z.w && r.h >= card.minH && r.w * r.h * 100 >= card.minArea * z.w * z.h;
    }
    Array.prototype.forEach.call(el.querySelectorAll(OWN + ',.cs-free *'), function (e) {
      if (!visible(e, el)) return;
      var c = getComputedStyle(e), freePanel = !e.closest('svg') && !e.matches('mark,.cs-em,.w,bdi,style') &&
        (alpha(c.backgroundColor) > 0 || c.backgroundImage && c.backgroundImage !== 'none' || Math.max(num(c.borderTopWidth), num(c.borderRightWidth), num(c.borderBottomWidth), num(c.borderLeftWidth)) > 0);
      if (e.matches(OWN) || freePanel && (holdsContent(e) || emptyCard(e))) { ownerIds.set(e, 'owner-' + owners.length); owners.push(e); }
    });
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
        else rs.push(Object.assign(b, { kind: 'text', ownerOf: ownerOf(e), anchor: !!e.closest(ANCHOR) }));
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
          d.owners.forEach(function (o) { if (!o.ok) {
            // Under the minimum is advice; below owner.fixBelow it is a FIX once the rollout enforces dead space. At stage 0 every
            // non-empty panel is reported as advice (real posts hold deliberate panels at 36 to 52 percent).
            var pct = Math.min(o.rows, o.cols), empty = o.rows === 0 && o.cols === 0, sev = empty || pct < c.owner.fixBelow ? 'FIX' : 'NOTE',
                f = finding(ctx, id, S, sev, { el: o.id, pct: pct, min: o.need }, o.id);
            // An empty painted free panel is visible evidence, independent of the visual rollout.
            if (CS.visual?.free?.active(s) && empty) { f.sev = sev; f.prospect = false; }
            out.push(f);
          } });
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

  /* ---- file: text-integrity.js ---- */
/* Rendered text integrity: compare the spec twin with visible words grouped
 * by slot key. Art may replace a native slot, but may not drop or double it. */
(function () {
  var Q = CS.qav;
  function words(text) {
    return CS.core.text.stripMarkup(String(text || '')).normalize('NFKC')
      .replace(/[\u0640\u064b-\u065f\u0670]/g, '')
      .replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/g, '')
      .replace(/[\u0660-\u0669\u06f0-\u06f9]/g, function (d) { return String(d.charCodeAt(0) % 16); })
      .replace(/(?<=[0-9])[,\u066c](?=[0-9]{3}(?:[^0-9]|$))/g, '')
      .match(/[\p{L}\p{M}\p{N}]+/gu) || [];
  }
  function occurrences(hay, needle) {
    var count = 0;
    for (var i = 0; i <= hay.length - needle.length; i++) {
      if (needle.every(function (w, j) { return hay[i + j] === w; })) { count++; i += needle.length - 1; }
    }
    return count;
  }
  function collect(root, numerals) {
    var slots = new Map(), ignored = 'style,script,template,.cs-header,.cs-footer,.cs-decor,.cs-marks,[data-decor],[data-ghost="1"],[aria-hidden="true"]';
    function append(key, text) {
      if (!slots.has(key)) slots.set(key, []);
      slots.get(key).push(text);
    }
    function visit(e, key, figure) {
      // The export stage is aria-hidden; only exclusions inside this slide apply.
      if (e.matches(ignored) || e.hidden) return;
      var c = getComputedStyle(e);
      if (c.display === 'none' || c.visibility === 'hidden' || +c.opacity === 0) return;
      var own = e.getAttribute('data-slot-key'), slot = e.getAttribute('data-slot');
      if (numerals && e.matches('[data-art="numeral"] [data-part="figure"]')) figure = e;
      key = figure || own || (slot ? (root.getAttribute('data-cs-slide') || '') + '.' + slot : key);
      var boundary = own || slot || e.matches('br,.cs-ln') || /^(block|flex|grid|table|list-item)/.test(c.display);
      if (boundary) append(key, ' ');
      for (var n = e.firstChild; n; n = n.nextSibling) {
        if (n.nodeType === 1) { visit(n, key, figure); continue; }
        if (n.nodeType !== 3 || !Q._rendered.alpha(c.color)) continue;
        var range = document.createRange(); range.selectNodeContents(n);
        if (Array.from(range.getClientRects()).some(function (r) { return r.width > 0 && r.height > 0; })) append(key, n.nodeValue);
      }
      if (boundary) append(key, ' ');
    }
    visit(root, (root.getAttribute('data-cs-slide') || '') + '.text');
    return new Map(Array.from(slots, function (pair) { return [pair[0], words(pair[1].join(''))]; }));
  }
  Q.collectSlotWords = collect;
  ['C2.text-dropped', 'C2.text-duplicated'].forEach(function (id) {
    Q.add('rendered', { id: id, ids: [id], run: function (ctx) {
      var out = [];
      (ctx.S || []).forEach(function (S) {
        if (ctx.slideFilter && !ctx.slideFilter.has(S.id)) return;
        // A stored non-mock plan does not promise the optional demo input.
        var anchor = S.slide.visual && S.slide.visual.anchor;
        var inactiveDemo = anchor && anchor.kind !== 'mock' && !CS.visual?.free?.active(S.slide);
        var expected = CS.qa._.slideFields(S.slide).filter(function (f) { return f.field !== 'number' && !(inactiveDemo && /^demo(?:\.|-caption$)/.test(f.field)); });
        var number = S.slide.number;
        if (number && number.value != null) expected.push({ key: S.id + '.number', text: String(number.value) + ' ' + (number.unit || '') });
        if (typeof S.slide.quote === 'string') expected.push({ key: S.id + '.quote', text: S.slide.quote });
        var slots = collect(S.el), actual = Array.from(slots.values()), twins = expected.map(function (f) { return words(f.text); }), seen = new Set();
        // Group numeral components through the same visibility-aware walk.
        var numbers = Array.from(collect(S.el, true).values());
        expected.forEach(function (f, i) {
          var needle = twins[i];
          if (!needle.length) return;
          var sequences = f.key === S.id + '.number' ? numbers : actual;
          var count = sequences.reduce(function (n, ws) { return n + occurrences(ws, needle); }, 0);
          var allowed = twins.reduce(function (n, ws) { return n + occurrences(ws, needle); }, 0);
          var bad = id === 'C2.text-dropped' ? count === 0 : count > allowed;
          var phrase = needle.join('\u0000');
          if (!bad || seen.has(phrase)) return;
          seen.add(phrase);
          // These are engine integrity failures, independent of visual rollout.
          out.push(Q._rendered.finding(ctx, id, S, 'BLOCK', { el: f.key }, f.key));
        });
      });
      return out;
    } });
  });
  Q.add('text', { id: 'D8.tone-flat', ids: ['D8.tone-flat'], run: function (ctx) {
    var entry = ctx.R.checks['D8.tone-flat'], p = entry && entry.def.params;
    if (!p || ctx.spec.style && ctx.spec.style.visualMode === 'off') return [];
    var ss = ctx.slides.filter(function (s) { return s.type !== 'cover' && s.type !== 'poster'; });
    if (ss.length < p.minInner || !ss.some(function (s) { return s.visual; })) return [];
    var count = ss.filter(function (s) { return CS.visual?.free?.active(s) || s.visual && /^(field|invert)$/.test(s.visual.tone); }).length;
    if (count >= p.min) return [];
    var capped = p.rollout && p.rollout.stage === 0;
    var f = Q._rendered.finding(ctx, 'D8.tone-flat', { id: ss[0].id }, capped ? p.rollout.stage0Sev : 'FIX', { count: count, min: p.min });
    f.prospect = !!capped;
    return [f];
  } });
})();

  /* ---- file: d10.js ---- */
/* Q3a: slice craft gates; deferred icon-system/edge-fragment/squint stay unregistered. */
(function () {
  var Q = CS.qav, H = Q._rendered, OWN = '[data-owner="1"]';
  function register(id, check) {
    Q.add('rendered', { id: id, ids: [id], run: function (ctx) {
      return H.slides(ctx, function (S, s, m, out) {
        function emit(sev, vars, el) { out.push(H.finding(ctx, id, S, sev, vars, el && H.key(el, S.el))); }
        check(ctx, S, s, m, emit);
      });
    } });
  }
  register('D10.nesting', function (ctx, S, s, m, emit) {
    var max = H.config(ctx).craft.nesting.maxDepth;
    m.owners.forEach(function (e) {
      var depth = 1;
      for (var p = e.parentElement; p && p !== S.el; p = p.parentElement) if (p.matches(OWN)) depth++;
      if (depth > max) emit('FIX', { depth: depth, max: max }, e);
    });
  });
  register('D10.icon-tile-stack', function (ctx, S, s, m, emit) {
    var min = H.config(ctx).craft.iconTileStack.minSiblings, parents = new Map();
    Array.prototype.forEach.call(S.el.querySelectorAll('.cs-icon'), function (icon) {
      if (!H.visible(icon, S.el)) return;
      var card = icon.closest('.cs-item,[data-tile],.cs-card') || icon.parentElement;
      if (!card || !card.parentElement) return;
      var title = card.querySelector('[data-part="title"],[data-role="title"],h2,h3,h4');
      if (!title || icon.getBoundingClientRect().bottom > title.getBoundingClientRect().top + 2) return;
      var list = parents.get(card.parentElement) || [];
      if (list.indexOf(card) < 0) list.push(card);
      parents.set(card.parentElement, list);
    });
    parents.forEach(function (list, parent) { if (list.length >= min) emit('FIX', { count: list.length, max: min - 1 }, parent); });
  });
  register('D10.stroke-feed', function (ctx, S, s, m, emit) {
    if (S.type === 'cover' || S.type === 'poster') return;
    var c = H.config(ctx).strokeFeed, seen = new Set();
    Array.prototype.forEach.call(S.el.querySelectorAll('.cs-art svg *,svg.cs-icon *'), function (e) {
      if (!H.visible(e, S.el) || !/^(path|line|polyline|polygon|rect|circle|ellipse)$/.test(e.localName)) return;
      var css = getComputedStyle(e), width = H.num(css.strokeWidth), mt = e.getScreenCTM();
      if (!mt || !width || !H.alpha(css.stroke) || !H.num(css.strokeOpacity)) return;
      // Minimum singular value: a thin stroke stays thin under a nonuniform transform.
      var aa = mt.a * mt.a + mt.b * mt.b, bb = mt.c * mt.c + mt.d * mt.d, ab = mt.a * mt.c + mt.b * mt.d,
          scale = Math.sqrt(Math.max(0, (aa + bb - Math.sqrt((aa - bb) * (aa - bb) + 4 * ab * ab)) / 2)),
          px = width * (css.vectorEffect === 'non-scaling-stroke' ? 1 : scale) / m.scale,
          owner = e.closest('.cs-icon') || e.closest('svg');
      if (Math.round(px * c.scale * 1000) < Math.round(c.minFeedPx * 1000) && !seen.has(owner)) { seen.add(owner); emit('NOTE', { px: Math.round(px * c.scale * 100) / 100, min: c.minFeedPx, el: H.key(e, S.el) }, e); }
    });
  });
  register('D10.art-label', function (ctx, S, s, m, emit) {
    var f = H.config(ctx).artLabel;
    Array.prototype.forEach.call(S.el.querySelectorAll('.cs-art-label,[data-slot-key*=".art."]'), function (e) {
      if (!H.visible(e, S.el) || !e.textContent.trim()) return;
      var text = e.textContent, role = e.getAttribute('data-role'), arabic = /[\u0620-\u064a\u066e-\u06d3\u0750-\u077f\u08a0-\u08ff]/.test(text),
          floor = role === 'numeral' ? f.numeral : role === 'word' ? f.word : role === 'chart' ? Math.max(f.chart, arabic ? f.arabic : f.latin) : arabic ? f.arabic : role === 'tool' && /[A-Za-z]/.test(text) ? f.tool : /[A-Za-z]/.test(text) ? f.latin : f.digits,
          px = Infinity, walker = document.createTreeWalker(e, NodeFilter.SHOW_TEXT), n;
      floor = Math.max(floor, H.num(e.getAttribute('data-floor')));
      while ((n = walker.nextNode())) if (/\S/.test(n.nodeValue) && H.visible(n.parentElement, S.el)) px = Math.min(px, H.num(getComputedStyle(n.parentElement).fontSize));
      if (px < floor) emit('FIX', { px: px, min: floor, el: H.key(e, S.el) }, e);
    });
  });
})();

  /* ---- file: d11.js ---- */
/* src/qa-visual/d11.js - owned by Q3 - stub */

  /* ---- file: squint.js ---- */
/* src/qa-visual/squint.js - owned by Q3 - stub */

  /* ---- file: spec-gates.js ---- */
/* Q4 spec gates. */
(function (){
const V=()=>CS.visual||{},T=()=>CS.core.text;const arr=v=>Array.isArray(v)?v:[],vis=s=>V().free?.active(s)?{}:s.visual||{},anc=s=>vis(s).anchor||{};
const old={cover:"top center split photo number",rehook:"base split big-number",item:"base ghost-number side-number media",step:"base ghost-number pill media",stat:"base bar",compare:"columns stacked versus","myth-fact":"stacked columns stamp",quote:"base mark photo","story-beat":"base panel media",checklist:"base boxes ruled media",summary:"list grid media",setup:"base cards",proof:"screenshot base",share:"base big-word",cta:"base pill keyword media",offer:"base card media",testimonial:"base photo card",poster:"top center split photo"};const free=s=>!!V().free?.active(s);const inner=s=>s.type!=="cover"&&s.type!=="poster"&&!free(s),pause=s=>!!vis(s).pause;const words=t=>T().wordCount(t||""),plain=t=>T().stripMarkup(String(t||""));const block=id=>V()._?.block?.(id),fields=s=>CS.qa._.slideFields(s);const west=t=>String(t).replace(/[٠-٩۰-۹]/g,d=>d.charCodeAt(0)-(d>="۰"?1776:1632)).replace(/٫/g,".").replace(/٬/g,",");function emit(c,out,id,s,vars,sev,el){
const e=c.R.checks[id];if(!e||c.gates&&!c.gates.has(id)&&!c.gates.has(e.gate.id)) return;const a=e.def.appliesTo||e.gate.appliesTo||{};if(a.formats&&!a.formats.includes(c.format)||s&&a.slideTypes&&!a.slideTypes.includes(s.type)) return;const format=t=>String(t).replace(/\{([a-zA-Z0-9_]+)\}/g,(m,k)=>vars[k] ?? m);const p=e.def.params||{},next=sev||e.def.sev,r=p.rollout;const f={gate:e.gate.id,rule:id,sev:r?.stage===0?r.stage0Sev:next};if(r?.stage===0) f.prospect=next!==f.sev;if(s) f.slide=s.id;if(el) f.el=el;f.msg={ar:format(e.def.msg.ar),en:format(e.def.msg.en)};if(e.def.fix) f.fix={ar:format(e.def.fix.ar),en:format(e.def.fix.en)};f.autofixed=false;out.push(f);}
function add(id,run){
CS.qav.add("text",{id,ids:[id],run(c){
if(/^VA/.test(id)) c={...c,slides:c.slides.map(s=>free(s)?{id:s.id,type:"cover"}:s)};
const p=c.R.checks[id]?.def.params;if(!p||c.spec.style?.visualMode==="off") return [];const out=[];run(c,out,p,(s,v,sev,key)=>emit(c,out,id,s,v,sev,key));return out;}});}
function demoBad(s,d){
const x=s.demo,out=[],put=(el,count,max)=>{if(count>max) out.push({el:s.id+"."+el,count,max});};if(!x) return out;put("demo",arr(x.lines).length,d.lines);arr(x.lines).forEach((l,i)=>{put("demo."+i,words(l.text),d.lineWords);put("demo."+i,[...plain(l.text)].length,d.lineChars);});put("demo-caption",words(x.caption),d.captionWords);put("demo-caption",[...plain(x.caption)].length,d.captionChars);return out;}
function refs(s){
const a=anc(s),out=[],put=(n,obj,key)=>{if(n) out.push({n,obj,key:s.id+"."+key});};put(a.icon,false,"anchor.icon");put(a.object,true,"anchor.object");arr(a.icons).forEach((n,i)=>put(n,false,"anchor.icons."+i));arr(vis(s).rowIcons).forEach((n,i)=>put(n,false,"rowIcons."+i));arr(s.items).forEach((x,i)=>put(x.icon,false,"items."+i));arr(a.chart?.values).forEach((x,i)=>put(x.icon,false,"chart."+i+".icon"));return out;}
add("VA1.anchor-present",(c,o,p,e)=>{
let run=0;c.slides.forEach(s=>{
if(!inner(s)||pause(s)||s.media?.assetId||anc(s).kind&&anc(s).kind!=="none"){run=0;return;}
run++;e(s,{run},!s.visual?p.unplannedSev:run>=p.runMin&&p.block.enabled?"BLOCK":"FIX");});});
add("VA3.valid",(c,o,p,e)=>{
const caps=V().caps?.(),pack=block("cs-icon-pack"),objects=block("cs-icon-objects");c.slides.forEach((s,i)=>{
if(!s.visual) return;const v=vis(s),a=anc(s),bad=(el,detail)=>e(s,{el:s.id+"."+el,detail},null,s.id+"."+el);if(caps){
const sub=CS.art?._?.sub?.(a);if(a.kind&&a.kind!=="none"&&!(caps.art[a.kind]||[]).includes(sub)) bad("anchor","unknown kind/sub");if(v.recipe&&!caps.recipes.includes(v.recipe)) bad("recipe","unknown recipe");if(s.variant&&!(caps.variants[s.type]||[]).concat((old[s.type]||"").split(" ")).includes(s.variant)) bad("variant","unknown variant");}
refs(s).forEach(r=>{
if(r.obj?objects&&!arr(objects.objects).some(x=>x.id===r.n):pack&&!Object.hasOwn(pack.icons||{},r.n)) bad(r.key.slice(s.id.length+1),"unknown "+(r.obj?"object":"icon"));});const rows=arr(s.bullets).length||arr(s.items).length;if(arr(v.rowIcons).length>rows||arr(v.rowIcons).length>Math.min(5,p.rowIconsMax)) bad("rowIcons","row icon count");const n=arr(s.items).length,range=p.itemsByType[s.type];if(n>p.itemsMax||range&&(n<range[0]||n>range[1])||s.type==="grid"&&s.variant==="bento"&&n>4||s.type==="timeline"&&s.variant==="rail"&&n>4) bad("items","item count");if(a.kind==="rows"&&Math.max(n,arr(s.bullets).length)>5) bad("anchor","icon row count");if(v.span&&![c.slides[i-1]?.id,c.slides[i+1]?.id].includes(v.span.with)) bad("span","non-adjacent span");if(a.mock?.kind==="artefact"&&!a.mock.artefact) bad("mock","artefact missing");demoBad(s,p.demo).forEach(x=>bad(x.el.slice(s.id.length+1),"demo limit"));const ch=a.chart;if(ch){
const vs=arr(ch.values),r=p.chartValues[ch.kind];if(!r||vs.length<r[0]||vs.length>r[1]||vs.some(x=>!Number.isFinite(x.value)||x.value<0)) bad("chart","chart values");if(ch.kind==="pictogram"&&ch.total>p.pictogramMaxIcons) bad("chart","pictogram total");if(ch.kind==="donut"&&vs.every(x=>Number.isFinite(x.value)&&x.value>=0)){
const ns=vs.map(x=>{const [m,e]=String(x.value).split("e");return [BigInt(m.replace(".","")),+(e||0)-(m.split(".")[1]||"").length];});const k=Math.min(...ns.map(x=>x[1])),xs=ns.map(([n,e])=>n*10n**BigInt(e-k)),sum=xs.reduce((a,b)=>a+b,0n);if(!sum||xs.some((x,i)=>xs.slice(i+1).some(y=>(x>y?x-y:y-x)*100n<BigInt(p.donutMinGapPct)*sum))) bad("chart","donut gap");}
}
});});
add("VA4.chart-honesty",(c,o,p,e)=>c.slides.forEach(s=>{
const ch=anc(s).chart;if(!ch||!arr(ch.values).length) return;const el=s.id+".chart";if(!ch.illustrative&&!arr(s.sourceIds).some(id=>arr(c.spec.sources).some(x=>x.id===id))) e(s,{el},"BLOCK",el);else if(ch.illustrative&&!CS.art?.chart?.proof&&!fields(s).some(f=>/رسم توضيحي|illustrative/i.test(f.text))) e(s,{el},p.tagSev,el);}));
add("VA6.pause",(c,o,p,e)=>{
const ss=c.slides.filter(inner),ps=ss.filter(pause);const bad=(s,detail)=>e(s,{detail});if(ps.length*p.per>ss.length*p.max) bad(ps[0],"pause share");ss.forEach((s,i)=>{
if(pause(s)&&(pause(ss[i+1]||{})||ss[i+1]?.type==="cta")) bad(s,"adjacent pause or CTA");if(s.variant==="statement"&&[s.title||s.headline,s.sub,s.body].reduce((n,t)=>n+words(t),0)>p.statementWords) bad(s,"statement words");});});
add("VA7.agreement",(c,o,p,e)=>c.slides.forEach(s=>{
if(!s.visual||!V().icons) return;const text=fields(s).filter(f=>!/^(anchor|mock|chart)\./.test(f.field)).map(f=>f.text).join(" ");const opts={dialect:c.dialect,k:p.topN},picks=V().icons.find(text,opts),hits=V().icons.concepts(text,opts);refs(s).filter(r=>!r.obj).forEach(r=>{
const neg=hits.some(x=>x.neg||x.pol==="neg"||x.pol==="warn");const joy=/(?:smil|grin|laugh|party|confetti|celebrat|thumbs-up)/.test(r.n);if(neg&&joy) e(s,{icon:r.n},"FIX",r.key);else if(!s.notes&&!s.visual.why&&!picks.some(x=>x.name===r.n)) e(s,{icon:r.n},"NOTE",r.key);});}));
add("VA8.constraints",(c,o,p,e)=>{
const rules=c.brand?.visual?.art?.constraints||{},index=arr(block("cs-icon-index"));c.slides.forEach(s=>refs(s).forEach(r=>{
const row=index.find(x=>x[0]===r.n),f=row?.[4]||{},n=r.n;const cats={figures:!!f.h||/person|user|face|smile/.test(n),animals:!!f.a||/camel|falcon|horse|bird|cat$|dog$/.test(n),music:/music|guitar|drum|piano|violin/.test(n),maps:/map|globe|navigation/.test(n)};Object.keys(cats).forEach(k=>{
if(cats[k]&&(rules[k]==="none"||rules[k]===false||rules[k]==="forbid"||k==="figures"&&rules[k]==="faceless"&&/face|smile|laugh/.test(n))) e(s,{icon:n,rule:k},null,r.key);});}));});
add("D8.anchor-run",(c,o,p,e)=>{
const key=s=>inner(s)&&s.visual?[s.type,s.variant||"",vis(s).recipe||"under",anc(s).kind||"none"].join("|"):null;const ss=c.slides,ks=ss.map(key);for(let i=0;i<ss.length;){
let j=i+1;while (ks[i]&&ks[j]===ks[i]) j++;if(j-i>=p.run) e(ss[i],{count:j-i,detail:ks[i]});i=j;}
for(let i=0;i<ss.length;){
let j=i+2;if(ks[i]&&ks[i+1]&&ks[i]!==ks[i+1]) while (j<ss.length&&ks[j]===ks[i+(j-i) % 2]) j++;if(j-i>=p.altWindow){e(ss[i],{count:j-i,detail:"alternation"});i=j;}else i++;}
});
add("D8.tone-run",(c,o,p,e)=>{
const ss=c.slides.filter(s=>s.type!=="cover"&&s.type!=="poster"),bias=p.toneBias[c.spec.style?.world?.toneBias||"balanced"];let count=0,start,total=0;ss.forEach(s=>{
if(!free(s)&&s.visual&&vis(s).tone&&vis(s).tone!=="base"){if(!count) start=s;count++;total++;}
else{if(count>p.maxRun) e(start,{count,max:p.maxRun});count=0;}
});if(count>p.maxRun) e(start,{count,max:p.maxRun});if(total*100>ss.length*bias) e(null,{count:total,max:Math.floor(ss.length*bias/100)});});
add("D10.glyph-icon",(c,o,p,e)=>c.slides.forEach(s=>fields(s).forEach(f=>{
const text=f.text.replace(/<span\b[^>]*class=["'][^"']*\bcs-emoji\b[^"']*["'][^>]*>[\s\S]*?<\/span>/gi,"");const hit=Array.from(plain(text)).find(ch=>p.glyphs.includes(ch.codePointAt(0))||!/[©®™]/u.test(ch)&&/[\p{Extended_Pictographic}\p{Regional_Indicator}\u20e3]/u.test(ch));if(hit) e(s,{text:hit,el:f.key},null,f.key);})));
add("C2.body-with-art",(c,o,p,e)=>c.slides.forEach(s=>{
const a=anc(s);if(a.kind==="mock"||a.kind==="chart"&&arr(a.chart?.values).some(v=>v.label)){
const count=words(s.body);if(count>p.bodyMax) e(s,{count,max:p.bodyMax},"NOTE",s.id+".body");}
}));
add("C2.demo-words",(c,o,p,e)=>c.slides.forEach(s=>demoBad(s,p.demo).forEach(x=>e(s,x,null,x.el))));
add("C2.demo-missing",(c,o,p,e)=>c.slides.forEach(s=>{
if(p.needsDemo.includes(s.type)&&(s.type!=="cta"||s.variant==="keyword"||s.cta?.kind==="keyword-dm")&&!arr(s.demo?.lines).some(x=>plain(x.text).trim())) e(s,{type:s.type});}));
add("C2.demo-duplicate",(c,o,p,e)=>c.slides.forEach(s=>{
const lex=t=>plain(t).toLowerCase().match(/[\p{L}\p{N}]+/gu)||[],body=new Set(lex(s.body));arr(s.demo?.lines).forEach((l,i)=>{
const w=lex(l.text),n=w.filter(x=>body.has(x)).length;if(n*100>w.length*p.demo.duplicateShare){const el=s.id+".demo."+i;e(s,{el,pct:Math.floor(n*100/w.length)},null,el);}
});}));
add("C2.figure-repeat",(c,o,p,e)=>c.slides.forEach(s=>{
const a=anc(s),all=fields(s).map(f=>f.text).concat(s.number?.value||"",a.value||"",arr(a.chart?.values).map(v=>v.value).join(" ")),counts=new Map();all.forEach(t=>{for(const m of west(plain(t)).matchAll(/[0-9]+(?:[,.][0-9]+)*(?:\s*[/∕]\s*[0-9]+)?/g)){const n=m[0].replace(/,/g,"").replace(/\s/g,"").replace(/∕/g,"/");counts.set(n,(counts.get(n)||0)+1);}});counts.forEach((count,text)=>{if(count>p.max) e(s,{text,count,max:p.max});});}));
add("C2.word-echo",(c,o,p,e)=>{
const lex=t=>plain(t).toLowerCase().match(/[\p{L}\p{N}]+/gu)||[],texts=c.slides.flatMap(s=>[s.title,s.headline,s.cta?.text].filter(Boolean));
c.slides.forEach(s=>{const a=anc(s),w=a.kind==="word"?lex(a.word||""):[];if(w.length!==1)return;
const n=texts.reduce((k,t)=>k+lex(t).filter(x=>x===w[0]).length,0);if(n>=p.max) e(s,{word:a.word});});});
})();
})();
