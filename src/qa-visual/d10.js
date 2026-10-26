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
