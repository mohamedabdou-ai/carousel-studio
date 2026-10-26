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
