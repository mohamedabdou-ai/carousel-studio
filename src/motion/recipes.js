/*
 * CS.motion · the recipes.
 *
 * Recipes share a poster-first envelope, authored against 6 s (build maps it onto 5 s covers).
 * The rebuild itself may be a word cascade, a curtain, a camera move, a message or two sides meeting:
 *
 *   0.00 - 0.40   the finished poster holds (frame 0 = the exported PNG = the grid thumbnail)
 *   0.40 - 0.75   the content breaks apart (each piece goes back to where it entered from, in reading order)
 *   0.75 - 3.70   the story rebuilds it: kicker, hero, symbol, sub line (the first piece enters at 0.75, never later)
 *   3.70 - 5.60   the finished poster holds; the swipe cue nudges, then everything is at rest
 *   5.60 - 6.00   rest: the last frame is the first frame, so the loop is seamless
 *
 * Header and footer stay visible. A readable opening hero line also survives reset and rebuild: chrome alone cannot
 * make an otherwise blank cover acceptable. The video gate owner measures near-blank content separately from decoration.
 *
 * A recipe returns data only. Arabic is animated by whole words or lines, opacity sits on whole words / slots, nothing is ever
 * split into letters, nothing wobbles: one overshoot of at most 6 % per move, no oscillation.
 */

var RECIPE_REGISTRY = {};

function defineRecipe(meta, build) {
  RECIPE_REGISTRY[meta.id] = { id: meta.id, label: meta.label, feel: meta.feel, ships: meta.ships || "1.0", topics: meta.topics || [], requires: meta.requires || [], build: build || null };
}

/* ------------------------------------------------------------------ reusable pieces */

function headlineWords(ctx) { return ctx.words(ctx.heroSlot); }

function inEmphasis(el) { return !!(el.closest && el.closest("mark.cs-em")); }

function pKicker(ctx, P, at, covered) {
  if (ctx.has('[data-m="kicker"]')) P.add("kicker", '[data-m="kicker"]', { at: at, dur: 0.45, from: { opacity: 0, x: ctx.startX(70) }, resetTo: covered ? { opacity: 0, x: 0 } : undefined, ease: "out-cubic" });
}

function pSub(ctx, P, at) {
  if (ctx.has('[data-m="sub"]')) P.add("sub", '[data-m="sub"]', { at: at, dur: 0.55, from: { opacity: 0, y: 44 }, ease: "out-cubic" });
}

function pMedia(ctx, P, at) {
  if (ctx.has('[data-m="media"]')) P.add("media", '[data-m="media"]', { at: at, dur: 0.6, from: { opacity: 0, scale: 0.94 }, ease: "out-cubic", origin: "center" });
}

function pBullets(ctx, P, at) {
  if (ctx.has('[data-m="bullet"]')) P.add("bullets", '[data-m="bullet"]', { at: at, dur: 0.45, from: { opacity: 0, y: 30 }, ease: "out-cubic", stagger: { each: 0.1 } });
}

/** The swipe cue leans toward the next slide twice and settles. Skipped when it would not fit before the poster must be at rest. */
function pNudge(ctx, P, at) {
  if (ctx.swipe === "neutral" || !ctx.has('[data-m="swipe"]')) return;
  var d = ctx.swipe === "arrow-ltr" ? 22 : -22;
  if (at + 1.1 > DEFAULT_TIMES.settleBy - 0.05) return;
  P.add("swipe-nudge", '[data-m="swipe"]', {
    at: at, dur: 0.24, from: { x: 0 }, to: { x: d }, ease: "in-out-quad", delay: 0,
    then: [{ dt: 0.3, to: { x: 0 }, ease: "in-out-quad" }, { dt: 0.24, to: { x: d * 0.7 }, ease: "in-out-quad" }, { dt: 0.3, to: { x: 0 }, ease: "in-out-quad" }]
  });
}

/** Decorative items (motif shapes) drift a few pixels and return. */
function pDrift(ctx, P) {
  if (!ctx.has('[data-m="decor-item"]')) return;
  P.add("decor-drift", '[data-m="decor-item"]', {
    at: 0.9, dur: 1.9, from: { x: 0, y: 0 }, to: { x: ctx.startX(-24), y: -14 }, ease: "in-out-quad", delay: 0, stagger: { each: 0.06 },
    then: [{ dt: 1.9, to: { x: 0, y: 0 }, ease: "in-out-quad" }]
  });
}

/** Words arrive one by one in reading order. */
function pCascade(ctx, P, words, o) {
  words.forEach(function (w, i) {
    if (o.skip && o.skip(w)) return;
    var from = { opacity: 0, y: o.y };
    if (o.rotate) from.rotate = ctx.rtl ? o.rotate : -o.rotate;
    P.add("word-" + i, ctx.sel(w), { at: o.at + (o.index ? o.index(w, i) : i) * o.each, dur: o.dur, from: from, ease: o.ease, origin: "center" });
  });
}

/** The emphasis mark is revealed from the reading start with its highlight. Returns the authored time it is fully drawn. */
function pEmphasisWipe(ctx, P, at, dur, keepWords) {
  var marks = ctx.q("mark.cs-em");
  marks.forEach(function (m, i) {
    // A camera/message/curtain already showed the marked words. Retrace their underline without clipping their ink away.
    if (keepWords) {
      var r = boundsOf(ctx, Array.prototype.slice.call(m.querySelectorAll(".w")), true);
      if (!r) return;
      var id = "em-trace-" + i, h = Math.max(4, Math.min(9, r.h * 0.06));
      P.overlays.push({ id: id, layer: "below", z: contentZ(ctx, false), rect: { x: r.x, y: r.y + r.h + 3, w: r.w, h: h }, html: panelMarkup(r.w, h, ctx.colors.accent, h / 2) });
      P.add(id, '[data-m-ov="' + id + '"]', { at: at, dur: dur, from: { opacity: 1, clipInset: revealClip(ctx) }, to: { opacity: 1, clipInset: [0, 0, 0, 0] },
        rest: { opacity: 0, clipInset: revealClip(ctx) }, resetTo: { opacity: 0, clipInset: revealClip(ctx) }, delay: 0, ease: "in-out-cubic",
        then: [{ dt: 0.3, to: { opacity: 1, clipInset: [0, 0, 0, 0] } }, { dt: 0.3, to: { opacity: 0, clipInset: [0, 0, 0, 0] } }] });
      return;
    }
    P.add("em-" + i, ctx.sel(m), {
      at: at, dur: dur, ease: "in-out-cubic",
      from: { clipInset: ctx.rtl ? [-20, 0, -20, 100] : [-20, 100, -20, 0] }, to: { clipInset: [-20, 0, -20, 0] }
    });
  });
  return marks.length ? at + dur : at;
}

/** The hero number counts up (CounterTrack), pops in and lands with one 6 % tick. Returns the authored time the tick ends. */
function pNumber(ctx, P, at, count) {
  var n = ctx.number;
  if (!n) return at;
  var unit = Math.pow(10, n.decimals), start = n.value > 9 ? Math.round(n.value / 3 * unit) / unit : 0;
  P.counter("count", '[data-m-count="1"]', { at: at, dur: count, from: start, to: n.value, decimals: n.decimals, ease: "in-quad" });
  P.add("number", ctx.sel(n.word), {
    at: at, dur: 0.5, from: { opacity: 0, scale: 0.72 }, to: { opacity: 1, scale: 1 }, ease: "out-back", origin: "center",
    then: [{ dt: Math.max(0.01, count - 0.5), to: { opacity: 1, scale: 1 }, ease: "linear" }, { dt: 0.12, to: { scale: 1.06 }, ease: "out-quad" }, { dt: 0.24, to: { scale: 1 }, ease: "in-out-quad" }]
  });
  return at + count + 0.36;
}

/** Find where a symbol can sit without covering final text: the tallest vertical gap in the body area. */
function freeBand(ctx, minH) {
  var top = 222, bottom = 1218, spans = [];
  ctx.q('.cs-content .w, .cs-content [data-m="media"], .cs-content [data-m="kicker"]').forEach(function (el) {
    var r = ctx.rect(el);
    if (r.h > 0) spans.push([r.y, r.y + r.h]);
  });
  spans.sort(function (a, b) { return a[0] - b[0]; });
  var gaps = [], cursor = top;
  spans.forEach(function (s) { if (s[0] - cursor >= minH) gaps.push({ y: cursor, h: s[0] - cursor }); cursor = Math.max(cursor, s[1]); });
  if (bottom - cursor >= minH) gaps.push({ y: cursor, h: bottom - cursor });
  gaps.sort(function (a, b) { return b.h - a.h; });
  return gaps[0] || null;
}

/** The visible height of a word, not its line box: Arabic display type is set at a line height of 1.3, so the box is about a third taller than the ink. */
function inkBox(ctx, el) {
  var r = ctx.rect(el), fs = parseFloat(window.getComputedStyle(el).fontSize) || r.h / 1.3, h = Math.min(r.h, fs * 0.85), cy = r.y + r.h / 2;
  return { x: r.x, y: cy - h / 2, w: r.w, h: h };
}

/** Ring that gets stamped around the emphasised words (or the hero number, or the first word). It is drawn around the ink and keeps at least
 *  12 px between itself and every other word on the slide and the header rules: the padding shrinks (to 2 px at the least) wherever a
 *  neighbour is close, so the ring never lands on the next line or on the rule above, and it is centred on the words. */
function stampTarget(ctx) {
  var em = ctx.q("mark.cs-em .w"), els = em.length ? em : ctx.number ? [ctx.number.word] : headlineWords(ctx).slice(0, 1);
  if (!els.length) return null;
  var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  els.forEach(function (e) {
    var r = inkBox(ctx, e), run = e.querySelector('.cs-ltr[data-run="number"]');
    // A block numeral owns a whole layout row. Its text range owns only the painted digit.
    if (run && getComputedStyle(run).display === "block") {
      var range = document.createRange(); range.selectNodeContents(run);
      var glyph = ctx.rect(range); r.x = glyph.x; r.w = glyph.w;
    }
    x0 = Math.min(x0, r.x); y0 = Math.min(y0, r.y); x1 = Math.max(x1, r.x + r.w); y1 = Math.max(y1, r.y + r.h);
  });
  var gap = 12, padL = 24, padR = 24, padV = 24;
  ctx.q(".cs-content .w").forEach(function (w) {
    if (els.indexOf(w) >= 0) return;
    var r = inkBox(ctx, w);
    if (r.h <= 0 || r.w <= 0) return;
    var sameLine = r.y < y1 && r.y + r.h > y0, overX = r.x < x1 + padR + gap && r.x + r.w > x0 - padL - gap;
    if (sameLine) {
      if (r.x + r.w <= x0 + 1) padL = Math.min(padL, Math.max(2, x0 - (r.x + r.w) - gap));
      else if (r.x >= x1 - 1) padR = Math.min(padR, Math.max(2, r.x - x1 - gap));
    } else if (overX) {
      if (r.y + r.h <= y0 + 1) padV = Math.min(padV, Math.max(2, y0 - (r.y + r.h) - gap));
      else if (r.y >= y1 - 1) padV = Math.min(padV, Math.max(2, r.y - y1 - gap));
    }
  });
  padV = Math.min(padV, Math.max(2, y0 - 270 - gap));                  // the header rules end by y 270 in every preset
  return { els: els, rect: { x: x0 - padL, y: y0 - padV, w: x1 - x0 + padL + padR, h: y1 - y0 + padV * 2 } };
}

function ringMarkup(w, h, colors, rtl) {
  var r = Math.min(h / 2, 44), d = "M" + r + " 3H" + (w - r) + "A" + (r - 3) + " " + (r - 3) + " 0 0 1 " + (w - 3) + " " + r + "V" + (h - r) + "A" + (r - 3) + " " + (r - 3) + " 0 0 1 " + (w - r) + " " + (h - 3) +
    "H" + r + "A" + (r - 3) + " " + (r - 3) + " 0 0 1 3 " + (h - r) + "V" + r + "A" + (r - 3) + " " + (r - 3) + " 0 0 1 " + r + " 3Z";
  return '<svg xmlns="' + SVG_NS + '" viewBox="0 0 ' + Math.round(w) + " " + Math.round(h) + '" width="100%" height="100%" preserveAspectRatio="none" fill="none" ' +
    'stroke-linecap="round" stroke-linejoin="round" style="display:block;overflow:visible"><path data-m="stroke" pathLength="1" d="' + d + '" stroke="' + colors.accent + '" stroke-width="9"' +
    (rtl ? ' transform="translate(' + Math.round(w) + ' 0) scale(-1 1)"' : "") + "/></svg>";
}

/** Geometry is in unscaled slide pixels, including on a scaled Studio preview. */
function boundsOf(ctx, els, ink) {
  if (!els.length) return null;
  var x = Infinity, y = Infinity, right = -Infinity, bottom = -Infinity;
  els.forEach(function (el) { var r = ink ? inkBox(ctx, el) : ctx.rect(el); x = Math.min(x, r.x); y = Math.min(y, r.y); right = Math.max(right, r.x + r.w); bottom = Math.max(bottom, r.y + r.h); });
  return { x: x, y: y, w: right - x, h: bottom - y };
}

function bodyBounds(ctx) {
  var header = ctx.q('[data-m="chrome"], .cs-header')[0], footer = ctx.q('[data-m="footer"], .cs-footer')[0];
  var a = header ? ctx.rect(header) : { y: 110, h: 80 }, b = footer ? ctx.rect(footer) : { y: 1250 };
  // Preset rules can extend below the header's text row. The content's allocated top respects those rules.
  var content = ctx.q('[data-m-layer="content"]')[0], c = content ? ctx.rect(content) : { y: 222, h: 996 };
  var y = Math.max(a.y + a.h + 12, c.y), end = Math.min(b.y - 12, c.y + c.h);
  return { x: 45, y: y, w: 990, h: Math.max(1, end - y) };
}

/** Real engine lines, with a measured-word fallback for inline/notebook runs and the isolated test core. */
function heroRows(ctx) {
  var lines = ctx.lines(ctx.heroSlot), words = headlineWords(ctx), rows = [];
  if (lines.length) lines.forEach(function (line) {
    var members = words.filter(function (w) { return line.contains(w); });
    if (members.length) rows.push({ el: line, words: members, rect: ctx.rect(line) });
  });
  if (rows.length) return rows.sort(function (a, b) { return a.rect.y - b.rect.y; });
  words.forEach(function (w) {
    var r = ctx.rect(w), row = rows.filter(function (a) { return Math.abs(a.rect.y + a.rect.h / 2 - r.y - r.h / 2) < Math.min(a.rect.h, r.h) * 0.45; })[0];
    if (!row) rows.push({ words: [w], rect: r });
    else { row.words.push(w); row.rect = boundsOf(ctx, row.words); }
  });
  return rows.sort(function (a, b) { return a.rect.y - b.rect.y; });
}

/** Pad a measured panel, then trim its edges against other ink/media and the chrome. Reserve room for a growing bubble too. */
function clearPanel(ctx, rect, members, pad, grow) {
  var safe = bodyBounds(ctx), gap = 12, g = grow || 0;
  var reserveX = rect.w * g + 2, reserveY = rect.h * g + 2;
  var left = Math.max(safe.x + reserveX, rect.x - pad), right = Math.min(safe.x + safe.w - reserveX, rect.x + rect.w + pad);
  var top = Math.max(safe.y + reserveY, rect.y - pad), bottom = Math.min(safe.y + safe.h - reserveY, rect.y + rect.h + pad);
  ctx.q('.cs-content .w, .cs-content [data-m="media"]').forEach(function (w) {
    if (members.some(function (m) { return m === w || m.contains(w); })) return;
    var r = w.matches(".w") ? inkBox(ctx, w) : ctx.rect(w);
    if (!r.w || !r.h) return;
    if (r.y < bottom + gap + reserveY && r.y + r.h > top - gap - reserveY) {
      if (r.x + r.w <= rect.x + 1) left = Math.max(left, r.x + r.w + gap + reserveX);
      else if (r.x >= rect.x + rect.w - 1) right = Math.min(right, r.x - gap - reserveX);
    }
    if (r.x < right + gap + reserveX && r.x + r.w > left - gap - reserveX) {
      if (r.y + r.h <= rect.y + 1) top = Math.max(top, r.y + r.h + gap + reserveY);
      else if (r.y >= rect.y + rect.h - 1) bottom = Math.min(bottom, r.y - gap - reserveY);
    }
  });
  return { x: left, y: top, w: Math.max(1, right - left), h: Math.max(1, bottom - top) };
}

function panelMarkup(w, h, fill, radius) {
  return '<svg xmlns="' + SVG_NS + '" viewBox="0 0 ' + num1(w) + ' ' + num1(h) + '" width="100%" height="100%" preserveAspectRatio="none" style="display:block"><rect width="' + num1(w) + '" height="' + num1(h) + '" rx="' + num1(radius || 0) + '" fill="' + fill + '"/></svg>';
}

function revealClip(ctx) { return ctx.rtl ? [0, 0, 0, 100] : [0, 100, 0, 0]; }
function retreatClip(ctx) { return ctx.rtl ? [0, 100, 0, 0] : [0, 0, 0, 100]; }
function contentZ(ctx, above) {
  var layer = ctx.q('[data-m-layer="content"]')[0], z = layer ? parseInt(window.getComputedStyle(layer).zIndex, 10) : 0;
  return (isFinite(z) ? z : 0) + (above ? 1 : 0);
}
function bareCover(ctx) { return !ctx.has('[data-m="kicker"], [data-m="sub"], [data-m="media"], [data-m="bullet"]'); }

/** Compress only the center symbol's choreography, leaving the recipe's authored word times untouched. */
function shortSymbol(P, made, id, win) {
  made.choreo({ add: function (key, sel, o) {
    var fast = Object.assign({}, o, { at: 0.75 + (o.at - 0.75) * 0.4, dur: o.dur * 0.4 });
    if (o.then) fast.then = o.then.map(function (s) { return Object.assign({}, s, { dt: s.dt * 0.4 }); });
    if (o.stagger) fast.stagger = Object.assign({}, o.stagger, { each: o.stagger.each * 0.4 });
    return P.add(key, sel, fast);
  } }, id, win);
}

/* ------------------------------------------------------------------ calm: the cinemagraph preset */
defineRecipe({ id: "calm", label: { ar: "هادئ", en: "Calm" }, feel: "calm", topics: ["default"], requires: ["headline"] }, function (ctx, P) {
  var words = headlineWords(ctx);
  P.add("content-settle", '[data-m-layer="content"]', { at: 0.75, dur: 3.7, from: { scale: 1.03 }, ease: "out-quad", origin: "center", delay: 0 });
  pKicker(ctx, P, 0.75);
  pCascade(ctx, P, words, { at: 0.9, each: 0.07, dur: 0.6, y: 26, ease: "out-cubic", skip: function (w) { return ctx.number && w === ctx.number.word; } });
  if (ctx.number) P.add("number", ctx.sel(ctx.number.word), { at: 1.0, dur: 0.6, from: { opacity: 0, scale: 0.92 }, ease: "out-back", origin: "center" });
  pEmphasisWipe(ctx, P, 1.65, 0.65);
  pMedia(ctx, P, 1.9);
  pSub(ctx, P, 2.1);
  pBullets(ctx, P, 2.4);
  pNudge(ctx, P, 4.0);
  pDrift(ctx, P);
});

/* ------------------------------------------------------------------ counter ("counter roll") */
defineRecipe({ id: "counter", label: { ar: "عدّاد", en: "Counter" }, feel: "calm", topics: ["numbers", "lists"], requires: ["headline", "number"] }, function (ctx, P) {
  var words = headlineWords(ctx);
  pKicker(ctx, P, 0.75);
  var each = Math.min(0.06, 0.6 / Math.max(1, words.length - 1));
  pCascade(ctx, P, words, { at: 0.75, each: each, dur: 0.45, y: 54, rotate: 3, ease: "out-back", skip: function (w) { return ctx.number && w === ctx.number.word; } });
  pEmphasisWipe(ctx, P, 0.75, 0.6);
  pNumber(ctx, P, Math.max(1.35, 0.75 + (words.length - 1) * each + 0.45), 0.9);
  pMedia(ctx, P, 2.5);
  pSub(ctx, P, 2.65);
  pBullets(ctx, P, 2.9);
  pNudge(ctx, P, 3.9);
  pDrift(ctx, P);
});

/* ------------------------------------------------------------------ highlight-sweep (the word cascade) */
defineRecipe({ id: "highlight-sweep", label: { ar: "كلمات متتابعة", en: "Word cascade" }, feel: "calm", topics: ["opinion", "default"], requires: ["headline"] }, function (ctx, P) {
  var words = headlineWords(ctx), count = words.length, firstEm = -1;
  words.forEach(function (w, i) { if (firstEm < 0 && inEmphasis(w)) firstEm = i; });
  pKicker(ctx, P, 0.75);
  pCascade(ctx, P, words, { at: 0.9, each: 0.095, dur: 0.58, y: 62, rotate: 4, ease: "out-back", skip: inEmphasis });
  var sweepAt = firstEm >= 0 ? 0.9 + firstEm * 0.095 : 0.9 + count * 0.095;
  var done = pEmphasisWipe(ctx, P, sweepAt + 0.1, 0.62);
  if (firstEm >= 0) {                                                  // the emphasised words pulse once when the highlight lands
    ctx.q("mark.cs-em .w").forEach(function (w, i) {
      P.add("pulse-" + i, ctx.sel(w), { at: done - 0.05, dur: 0.14, from: { scale: 1 }, to: { scale: 1.05 }, ease: "out-quad", origin: "center", delay: 0, then: [{ dt: 0.26, to: { scale: 1 }, ease: "in-out-quad" }] });
    });
  }
  pMedia(ctx, P, 2.2);
  pSub(ctx, P, Math.max(2.4, Math.min(2.8, done + 0.1)));
  pBullets(ctx, P, 2.9);
  pNudge(ctx, P, 3.9);
  pDrift(ctx, P);
});

/* ------------------------------------------------------------------ stamp */
function buildStamp(ctx, P) {
  var words = headlineWords(ctx), target = stampTarget(ctx), emWords = ctx.q("mark.cs-em .w");
  pKicker(ctx, P, 0.75);
  pCascade(ctx, P, words, { at: 0.9, each: 0.07, dur: 0.5, y: 44, ease: "out-expo", skip: function (w) { return inEmphasis(w) || (!emWords.length && target && w === target.els[0]); } });
  var slamAt = 0.9 + Math.min(words.length, 7) * 0.07 + 0.3;
  var slamEls = emWords.length ? emWords : target ? target.els : [];
  // the drop: scale 1.55 to 1 in 0.4 s, then one small squash on impact (0.97, back to 1): a hit, not a wobble
  slamEls.forEach(function (w, i) {
    P.add("slam-" + i, ctx.sel(w), { at: slamAt, dur: 0.4, from: { opacity: emWords.length ? 1 : 0, scale: 1.55 }, to: { opacity: 1, scale: 1 }, ease: "out-expo", origin: "center",
      then: [{ dt: 0.1, to: { scale: 0.97 }, ease: "out-quad" }, { dt: 0.18, to: { scale: 1 }, ease: "in-out-quad" }] });
  });
  ctx.q("mark.cs-em").forEach(function (m, i) { P.add("mark-" + i, ctx.sel(m), { at: slamAt, dur: 0.18, from: { opacity: 0 }, ease: "out-quad" }); });
  if (target) {
    // the ring stays through the whole story and the first part of the final hold, and is gone (0.4 s fade) before the poster rests, so the last frame is still frame 0
    var id = "stamp-ring", win = { at: slamAt + 0.2, hold: Math.max(slamAt + 2.4, 4.7) };
    P.overlays.push({ id: id, layer: "above", z: contentZ(ctx, true), rect: target.rect, html: ringMarkup(target.rect.w, target.rect.h, ctx.colors, ctx.rtl) });
    overlayFade(P, id, win.at, win.hold);
    P.add(id + ".draw", '[data-m-ov="' + id + '"] [data-m="stroke"]', { at: win.at + 0.08, dur: 0.5, from: { dash: 0 }, to: { dash: 1 }, rest: { dash: 1 }, ease: "out-cubic", delay: 0 });
  }
  pMedia(ctx, P, slamAt + 0.4);
  pSub(ctx, P, slamAt + 0.6);
  pBullets(ctx, P, slamAt + 0.85);
  pNudge(ctx, P, 3.9);
  pDrift(ctx, P);
}
defineRecipe({ id: "stamp", label: { ar: "ختم", en: "Stamp" }, feel: "story", topics: ["decision", "myth-fact"], requires: ["headline"] }, buildStamp);

/* ------------------------------------------------------------------ reorder: chaos falls into order */
defineRecipe({ id: "reorder", label: { ar: "ترتيب", en: "Reorder" }, feel: "story", topics: ["steps", "framework"], requires: ["headline"] }, function (ctx, P) {
  var words = headlineWords(ctx), n = words.length, rects = words.map(function (w) { return ctx.rect(w); }), perm = [], i, j, tmp;
  for (i = 0; i < n; i++) perm.push(i);
  for (i = n - 1; i > 0; i--) { j = Math.floor(ctx.rng() * (i + 1)); tmp = perm[i]; perm[i] = perm[j]; perm[j] = tmp; }
  for (i = 0; i < n && n > 1; i++) if (perm[i] === i) { j = (i + 1) % n; tmp = perm[i]; perm[i] = perm[j]; perm[j] = tmp; }
  var lineOf = [], rows = [];
  rects.forEach(function (r, k) {
    var cy = r.y + r.h / 2, row = -1, q;
    for (q = 0; q < rows.length; q++) if (Math.abs(rows[q] - cy) < r.h * 0.5) { row = q; break; }
    if (row < 0) { rows.push(cy); row = rows.length - 1; }
    lineOf[k] = row;
  });
  var order = {};
  pKicker(ctx, P, 0.75);
  words.forEach(function (w, k) {
    var a = rects[perm[k]], b = rects[k], seen = order[lineOf[k]] = (order[lineOf[k]] || 0) + 1;
    P.add("word-" + k, ctx.sel(w), {
      at: 0.9 + lineOf[k] * 0.22 + (seen - 1) * 0.045, dur: 0.75, ease: "out-expo", origin: "center",
      from: { opacity: 0, x: (a.x + a.w / 2) - (b.x + b.w / 2), y: (a.y + a.h / 2) - (b.y + b.h / 2), rotate: round3((ctx.rng() - 0.5) * 12) }
    });
  });
  var end = 0.9 + (rows.length - 1) * 0.22 + 0.8;
  pEmphasisWipe(ctx, P, end - 0.3, 0.5);
  pMedia(ctx, P, end);
  pSub(ctx, P, end + 0.05);
  pBullets(ctx, P, end + 0.25);
  pNudge(ctx, P, 3.9);
  pDrift(ctx, P);
});

/* ------------------------------------------------------------------ story: a symbol, then the title (and its two named variants) */
function buildStory(ctx, P, forced) {
  var id = "story-" + (forced || ctx.metaphor || "spark");
  var key = forced || ctx.metaphor || "spark", meta = CS.motion.metaphors[key] || CS.motion.metaphors.spark;
  var made = meta.make({ rtl: ctx.rtl, colors: ctx.colors }), words = headlineWords(ctx);
  var band = freeBand(ctx, 190), mode = band ? "band" : "center", rect, win, t;
  if (band) {
    var h = Math.min(300, band.h - 28);
    rect = { x: 114, y: Math.round(band.y + (band.h - h) / 2), w: 852, h: Math.round(h) };
    win = { at: 1.45, hold: 3.4 };
    t = { kicker: 0.75, number: 0.8, words: 0.95, sub: 2.7, nudge: 4.0 };
  } else {
    rect = { x: 114, y: 430, w: 852, h: 300 };
    win = { at: 0.75, hold: 2.55 };
    t = { kicker: 1.15, number: 0.95, words: 1.15, sub: 2.5, nudge: 4.0 };
  }
  P.overlays.push({ id: id, layer: "above", z: contentZ(ctx, true), rect: rect, html: made.html });
  if (mode === "center") shortSymbol(P, made, id, win); else made.choreo(P, id, win);
  pKicker(ctx, P, t.kicker);
  var wordsAt = t.words;
  pCascade(ctx, P, words, { at: wordsAt, each: 0.09, dur: 0.55, y: 58, rotate: 3, ease: "out-back",
    skip: function (w) { return (mode !== "center" && inEmphasis(w)) || (ctx.number && w === ctx.number.word); } });
  pEmphasisWipe(ctx, P, wordsAt + 0.5, 0.6, mode === "center");
  if (ctx.number) pNumber(ctx, P, Math.max(t.number, wordsAt + (words.length - 1) * 0.09 + 0.55, mode === "band" ? wordsAt + 1.1 : 0), 0.9);
  pMedia(ctx, P, t.sub - 0.2);
  pSub(ctx, P, t.sub);
  pBullets(ctx, P, t.sub + 0.2);
  pNudge(ctx, P, t.nudge);
  pDrift(ctx, P);
  P.mode = mode;
  P.metaphor = key;
}
defineRecipe({ id: "story", label: { ar: "رمز ثم عنوان", en: "Symbol, then title" }, feel: "story", topics: ["news", "story", "mistakes", "case-study"], requires: ["headline"] },
  function (ctx, P) { buildStory(ctx, P, null); });
defineRecipe({ id: "map-dots", label: { ar: "خريطة نقاط", en: "Map dots" }, feel: "story", topics: ["spread"], requires: ["headline"] }, function (ctx, P) { buildStory(ctx, P, "dots"); });
defineRecipe({ id: "drop-clock", label: { ar: "ساعة تتسارع", en: "Racing clock" }, feel: "story", topics: ["urgency"], requires: ["headline"] }, function (ctx, P) { buildStory(ctx, P, "clock"); });

/* ------------------------------------------------------------------ curtain: the poster is covered, then pulled out by its own lines */
defineRecipe({ id: "curtain", ships: "1.0", label: { ar: "ستارة", en: "Curtain" }, feel: "story", topics: ["launch", "news"], requires: ["headline"] }, function (ctx, P) {
  var rows = heroRows(ctx), bare = bareCover(ctx), end = bare ? 4.0 : 3.1, heroDur = end - 0.75 - Math.max(0, rows.length - 1) * 0.18, wipeEase = bare ? "in-out-cubic" : "in-out-expo";
  function uncover(id, members, rect, at, row) {
    var panel = clearPanel(ctx, rect, members, 16), sel = '[data-m-ov="' + id + '"]', dur = id.indexOf("curtain-hero-") === 0 ? heroDur : 0.9;
    P.overlays.push({ id: id, layer: "above", z: contentZ(ctx, true), rect: panel, html: panelMarkup(panel.w, panel.h, ctx.colors.accent, 2) });
    P.add(id, sel, { at: at, dur: dur, from: { opacity: 1, clipInset: [0, 0, 0, 0] }, to: { opacity: 1, clipInset: retreatClip(ctx) },
      rest: { opacity: 0, clipInset: revealClip(ctx) }, ease: wipeEase, resetEase: "out-cubic", delay: Math.min(0.1, row * 0.018), then: [{ dt: 0.01, to: { opacity: 0, clipInset: retreatClip(ctx) } }] });
    // Move the real line as one unit: notebook's connected inline runs must never be promoted/reflowed word by word.
    var line = members.length === 1 && !members[0].matches(".w") ? members[0] : members.length ? members[0].closest(".cs-ln") : null;
    if (line && members.every(function (w) { return line === w || line.contains(w); })) {
      var r = ctx.rect(line), x = ctx.startX(line.matches(".cs-ln") ? 30 : 0);
      var a = (panel.x + (ctx.rtl ? panel.w : 0) - r.x - x) / r.w * 100, b = (panel.x + (ctx.rtl ? 0 : panel.w) - r.x) / r.w * 100;
      var from = ctx.rtl ? [-20, -20, -20, a] : [-20, 100 - a, -20, -20], to = ctx.rtl ? [-20, -20, -20, b] : [-20, 100 - b, -20, -20];
      P.add(id + ".reveal", ctx.sel(line), { at: at, dur: dur, from: { opacity: 1, x: x, clipInset: from }, to: { opacity: 1, x: 0, clipInset: to },
        resetTo: { opacity: 0, x: 0, clipInset: [-20, -20, -20, -20] }, delay: Math.min(0.1, row * 0.018), ease: wipeEase });
      return;
    }
    members.forEach(function (w, i) {
      // Each word's clip uses the bar's slide-space edge, compensating for its 30 px slide. Same progress/ease = exact reveal.
      var r = ctx.rect(w), x = ctx.startX(w.matches(".w") ? 30 : 0), a = (panel.x + (ctx.rtl ? panel.w : 0) - r.x - x) / r.w * 100;
      var b = (panel.x + (ctx.rtl ? 0 : panel.w) - r.x) / r.w * 100;
      var from = ctx.rtl ? [-20, -20, -20, a] : [-20, 100 - a, -20, -20], to = ctx.rtl ? [-20, -20, -20, b] : [-20, 100 - b, -20, -20];
      P.add(id + ".word-" + i, ctx.sel(w), { at: at, dur: dur, from: { opacity: 1, x: x, clipInset: from }, to: { opacity: 1, x: 0, clipInset: to },
        resetTo: { opacity: 0, x: 0, clipInset: [-20, -20, -20, -20] }, delay: Math.min(0.1, row * 0.018), ease: wipeEase });
    });
  }
  rows.forEach(function (row, i) { uncover("curtain-hero-" + i, row.words, row.rect, 0.75 + i * 0.18, i); });
  pEmphasisWipe(ctx, P, end, bare ? 0.4 : 0.85, true);
  ctx.q('[data-m="sub"], [data-m="media"]').forEach(function (slot, i) { uncover("curtain-slot-" + i, [slot], ctx.rect(slot), end + 0.18 + i * 0.16, rows.length + i); });
  pKicker(ctx, P, end + 0.42, true); pBullets(ctx, P, end + 0.65); pNudge(ctx, P, 4.0);
});

/* ------------------------------------------------------------------ zoom: a word is the opening shot, then the camera reveals its context */
defineRecipe({ id: "zoom", ships: "1.0", label: { ar: "زووم على الكلمة", en: "Word zoom" }, feel: "story", topics: ["emphasis", "opinion"], requires: ["headline"] }, function (ctx, P) {
  var words = headlineWords(ctx), target = ctx.q('mark.cs-em .w').filter(function (w) { return words.indexOf(w) >= 0; });
  if (!target.length) target = ctx.number ? [ctx.number.word] : words.slice(0, 1);
  var r = boundsOf(ctx, target), layer = ctx.q('[data-m-layer="content"]')[0];
  if (!r || !layer) return;
  var safe = bodyBounds(ctx), box = ctx.rect(layer), ox = box.x + box.w / 2, oy = box.y + box.h / 2;
  var scale = Math.max(1, Math.min(3.2 / 1.04, safe.w * 0.8 / Math.max(1, r.w), safe.h * 0.8 / Math.max(1, r.h)));
  function shot(s) { return { scale: s, x: safe.x + safe.w / 2 - ox - (r.x + r.w / 2 - ox) * s, y: safe.y + safe.h / 2 - oy - (r.y + r.h / 2 - oy) * s }; }
  var bare = bareCover(ctx), push = bare ? 1.2 : 0.8, pull = bare ? 1.7 : 1.0, end = 0.75 + push + pull;
  P.contentClip = safe;              // a fixed viewport outside the transformed layer, also during the break-apart
  P.add("zoom-camera", '[data-m-layer="content"]', { at: 0.75, dur: push, from: shot(scale), to: shot(scale * 1.04), origin: "center", delay: 0,
    ease: "linear", then: [{ dt: pull, to: { scale: 1, x: 0, y: 0 }, ease: "in-out-cubic" }] });
  words.forEach(function (w, i) {
    if (target.indexOf(w) >= 0) return;
    P.add("zoom-context-" + i, ctx.sel(w), { at: 0.75, dur: push, from: { opacity: 0 }, to: { opacity: 0 }, delay: 0,
      then: [{ dt: pull, to: { opacity: 1 }, ease: "in-out-cubic" }] });
  });
  pEmphasisWipe(ctx, P, end, 0.5, true); pSub(ctx, P, end + 0.15); pMedia(ctx, P, end + 0.25); pKicker(ctx, P, end + 0.3); pBullets(ctx, P, end + 0.45); pNudge(ctx, P, 4.0);
});

/* ------------------------------------------------------------------ notify: typing, word delivery, then the bubble leaves the poster */

/** Use the browser's full font bounds, including mixed-script runs and Arabic dots/descenders, rather than the 0.85em estimate. */
function notifyBounds(ctx, words) {
  var r = boundsOf(ctx, words), range = document.createRange();
  if (!r) return null;
  function include(b) {
    var right = Math.max(r.x + r.w, b.x + b.w), bottom = Math.max(r.y + r.h, b.y + b.h);
    r.x = Math.min(r.x, b.x); r.y = Math.min(r.y, b.y); r.w = right - r.x; r.h = bottom - r.y;
  }
  function measure(root, members) { members.forEach(function (word) { include(slideRect(root, word)); range.selectNodeContents(word); include(slideRect(root, range)); }); }
  measure(ctx.root, words);
  // The driver promotes inline words during their 6 px rise. Measure that layout on an offscreen clone; never reflow the poster.
  var clone = ctx.root.cloneNode(true);
  clone.style.cssText += ";position:absolute;left:-100000px;top:0;transform:none;visibility:hidden;width:" + ctx.root.offsetWidth + "px;height:" + ctx.root.offsetHeight + "px";
  ctx.root.parentNode.appendChild(clone);
  try {
    var animated = Array.prototype.slice.call(clone.querySelectorAll('.w[data-m-slot="' + ctx.heroSlot + '"]'));
    animated.forEach(function (word) { if (window.getComputedStyle(word).display === "inline") word.style.display = "inline-block"; });
    measure(clone, animated);
  } finally { clone.remove(); }
  r.h += 6;
  return r;
}

/** Clearance is preferred; the padded ink is a hard minimum. Include the tail and the anchored 1.03 dissolve in edge tests. */
function notifyPanel(ctx, ink, words, tail, outline) {
  var slide = ctx.rect(ctx.root), growth = 0.03, padding = 14;
  function padded(pad) {
    var p = pad + outline;
    return { x: ink.x - p, y: ink.y - p, w: ink.w + 2 * p, h: ink.h + 2 * p + 1 + growth * (tail + outline) };
  }
  function fits(r) {
    var x = r.x - (ctx.rtl ? r.w * growth : 0), y = r.y - (r.h + tail) * growth;
    return x >= 16 && x + r.w * 1.03 <= slide.w - 16 && y >= 16 && r.y + r.h + tail <= slide.h - 16;
  }
  function between(a, b, k) { return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, w: a.w + (b.w - a.w) * k, h: a.h + (b.h - a.h) * k }; }
  var minimum = padded(padding), lo, hi, mid, i;
  if (!fits(minimum)) {
    outline = 1; minimum = padded(padding);  // retain 14 px before sacrificing padding
    if (!fits(minimum)) {
      lo = 0; hi = padding;
      for (i = 0; i < 20; i++) { mid = (lo + hi) / 2; if (fits(padded(mid))) lo = mid; else hi = mid; }
      padding = Math.floor(lo * 10) / 10; minimum = padded(padding);
      // Even pathological ink already outside the slide must never be trimmed out of its own bubble.
      if (!fits(minimum) && padding === 0) { outline = 0; minimum = padded(0); }
    }
  }
  var preferred = clearPanel(ctx, ink, words, 26, 0.035);
  var right = Math.max(preferred.x + preferred.w, minimum.x + minimum.w), bottom = Math.max(preferred.y + preferred.h, minimum.y + minimum.h);
  var wanted = { x: Math.min(preferred.x, minimum.x), y: Math.min(preferred.y, minimum.y) };
  wanted.w = right - wanted.x; wanted.h = bottom - wanted.y;
  lo = 0; hi = 1;
  for (i = 0; i < 20; i++) { mid = (lo + hi) / 2; if (fits(between(minimum, wanted, mid))) lo = mid; else hi = mid; }
  return { body: between(minimum, wanted, lo), padding: padding, outline: outline };
}

defineRecipe({ id: "notify", ships: "1.0", label: { ar: "إشعار", en: "Notification" }, feel: "story", topics: ["product", "question", "news"], requires: ["headline"] }, function (ctx, P) {
  var words = headlineWords(ctx), r = notifyBounds(ctx, words);
  if (!r) return;
  var bare = bareCover(ctx), tail = 16, fitted = notifyPanel(ctx, r, words, tail, bare ? 8 : 3), body = fitted.body, outline = fitted.outline;
  var panel = { x: body.x, y: body.y, w: body.w, h: body.h + tail }, w = panel.w, h = panel.h, radius = Math.min(28, body.h / 4, fitted.padding + outline), inset = outline / 2;
  var dotRadius = bare ? Math.min(14, (w - 24) / 8) : 7, dotGap = bare ? dotRadius * 3 : 28;
  var shape = '<path d="M' + radius + ' ' + inset + 'H' + (w - radius) + 'Q' + (w - inset) + ' ' + inset + ' ' + (w - inset) + ' ' + radius + 'V' + (body.h - radius) + 'Q' + (w - inset) + ' ' + (body.h - inset) + ' ' + (w - radius) + ' ' + (body.h - inset) +
    'H' + (radius + tail) + 'L' + radius / 2 + ' ' + (h - inset) + 'L' + radius + ' ' + (body.h - inset) + 'Q' + inset + ' ' + (body.h - inset) + ' ' + inset + ' ' + (body.h - radius) + 'V' + radius + 'Q' + inset + ' ' + inset + ' ' + radius + ' ' + inset + 'Z" fill="' + trimCssVar(ctx.root, "--cs-card", trimCssVar(ctx.root, "--cs-surface", trimCssVar(ctx.root, "--cs-bg", "#FFFFFF"))) + '" stroke="' + ctx.colors.accent + '" stroke-width="' + outline + '"/>';
  var dots = "";
  for (var i = 0; i < 3; i++) dots += '<circle data-m="typing" data-m-i="' + i + '" cx="' + (w / 2 + (i - 1) * dotGap) + '" cy="' + (body.h / 2) + '" r="' + dotRadius + '" opacity="0" fill="' + ctx.colors.accent + '"/>';
  var pop = bare ? 1.2 : 0.45, dotsAt = bare ? 1.95 : 0.83, typeAt = dotsAt + 0.63;
  var id = "notify-bubble", each = Math.min(0.11, (bare ? 1.0 : 1.5) / Math.max(1, words.length - 1)), done = typeAt + Math.max(0, words.length - 1) * each + 0.08;
  var fade = bare ? 4.55 - done - 0.12 : 1.05, gone = done + 0.12 + fade;
  var html = '<svg xmlns="' + SVG_NS + '" data-body-height="' + num1(body.h) + '" data-padding="' + fitted.padding + '" viewBox="0 0 ' + num1(w) + ' ' + num1(h) + '" width="100%" height="100%" preserveAspectRatio="none" style="display:block"><g' + (ctx.rtl ? ' transform="translate(' + num1(w) + ' 0) scale(-1 1)"' : '') + '>' + shape + '</g>' + dots + '</svg>';
  P.overlays.push({ id: id, layer: "below", z: contentZ(ctx, false), rect: panel, html: html });
  P.add("notify-pop", '[data-m-ov="' + id + '"]', { at: 0.75, dur: pop, from: { opacity: 0, scale: 0.6 }, to: { opacity: 1, scale: 1 }, rest: { opacity: 0, scale: 1 }, origin: "start-bottom", delay: 0, ease: "out-back",
    then: [{ dt: done - 0.75 - pop + 0.12, to: { opacity: 1, scale: 1 }, ease: "linear" }, { dt: fade, to: { opacity: 0, scale: 1.03 }, ease: "in-out-cubic" }] });
  for (var d = 0; d < 3; d++) P.add("notify-dot-" + d, '[data-m-ov="' + id + '"] [data-m-i="' + d + '"]', { at: dotsAt + d * 0.13, dur: 0.15, from: { opacity: 0.25, scale: 0.85 }, to: { opacity: 1, scale: 1 }, rest: { opacity: 0, scale: 1 }, origin: "center", delay: 0,
    then: [{ dt: 0.15, to: { opacity: 0.25, scale: 0.85 }, ease: "in-out-quad" }, { dt: 0.07, to: { opacity: 0, scale: 1 }, ease: "out-quad" }] });
  words.forEach(function (word, i) { P.add("notify-word-" + i, ctx.sel(word), { at: typeAt + i * each, dur: 0.08, from: { opacity: 0, y: 6 }, ease: "out-cubic", delay: Math.min(0.1, i * 0.012) }); });
  ctx.q("mark.cs-em").forEach(function (mark, i) {
    var first = words.findIndex(function (word) { return mark.contains(word); });
    if (first >= 0) P.add("notify-mark-" + i, ctx.sel(mark), { at: typeAt + first * each, dur: 0.08, from: { opacity: 0 }, ease: "out-cubic", delay: 0 });
  });
  pEmphasisWipe(ctx, P, gone + 0.01, bare ? 0.35 : 0.55, true); pSub(ctx, P, gone); pMedia(ctx, P, gone + 0.08); pKicker(ctx, P, gone + 0.16); pBullets(ctx, P, gone + 0.23); pNudge(ctx, P, 4.25);
});

/* ------------------------------------------------------------------ split: the two sides travel together and meet with one impact */
defineRecipe({ id: "split", ships: "1.0", label: { ar: "قبل/بعد", en: "Before / after" }, feel: "story", topics: ["change", "comparison"], requires: ["headline"] }, function (ctx, P) {
  var words = headlineWords(ctx), rows = heroRows(ctx), cut = -1;
  words.some(function (w, i) { if (changeMarker(w.textContent) || /[…،→]|\.{3}/.test(w.textContent)) { cut = i + 1; return true; } return false; });
  if (cut <= 0 || cut >= words.length) cut = rows.length > 1 ? rows[0].words.length : Math.ceil(words.length / 2);
  cut = Math.min(Math.max(1, cut), Math.max(1, words.length - 1));
  var impact = 1.8, movedMarks = [], groups = [words.slice(0, cut), words.slice(cut)], bounds = groups.map(function (group) { return boundsOf(ctx, group, true); });
  var content = ctx.q('[data-m-layer="content"]')[0], area = content ? ctx.rect(content) : bodyBounds(ctx), slide = ctx.rect(ctx.root);
  var travel = groups.map(function (group, i) {
    if (!group.length) return 0;
    var side = ctx.startX(i === 0 ? 1 : -1), box = bounds[i];
    var distance = Math.max(380, side > 0 ? area.x + area.w - box.x + 1 : box.x + box.w - area.x + 1);
    group.forEach(function (word) { var r = inkBox(ctx, word); distance = Math.min(distance, side > 0 ? slide.w - r.x : r.x + r.w); });
    return side * Math.max(0, distance);
  });
  words.forEach(function (w, i) {
    var mark = w.closest("mark.cs-em"), mover = w;
    if (mark) {
      var marked = words.filter(function (word) { return mark.contains(word); });
      if (window.getComputedStyle(mark).display !== "inline" && mark.getClientRects().length === 1 && marked.every(function (word) { return (words.indexOf(word) < cut) === (i < cut); })) {
        if (movedMarks.indexOf(mark) >= 0) return;
        movedMarks.push(mark); mover = mark;  // its poster highlight travels with the words, never an empty box left behind
      }
    }
    var x = travel[i < cut ? 0 : 1], recoil = ctx.startX(i < cut ? 10 : -10);
    P.add("split-visible-" + i, ctx.sel(mover), { at: 0.75, dur: 0.2, from: { opacity: 0 }, ease: "out-cubic", delay: 0 });
    P.add("split-word-" + i, ctx.sel(mover), { at: 0.75, dur: impact - 0.75, from: { x: x, scale: 1 }, to: { x: 0, scale: 1 }, ease: "in-cubic", origin: "center", delay: 0,
      then: [{ dt: 0.1, to: { x: recoil, scale: 1.05 }, ease: "out-quad" }, { dt: 0.25, to: { x: 0, scale: 1 }, ease: "out-cubic" }] });
  });
  ctx.q("mark.cs-em").forEach(function (mark, i) { if (movedMarks.indexOf(mark) < 0) P.add("split-mark-" + i, ctx.sel(mark), { at: 0.75, dur: 0.2, from: { opacity: 0 }, ease: "out-cubic", delay: 0 }); });
  if (words.length > 1) {
    var a = inkBox(ctx, words[cut - 1]), b = inkBox(ctx, words[cut]), vertical = Math.abs(a.y - b.y) < Math.min(a.h, b.h) / 2, panel;
    var first = bounds[0], second = bounds[1];
    if (vertical) panel = { x: (Math.min(a.x + a.w, b.x + b.w) + Math.max(a.x, b.x)) / 2 - 4, y: Math.max(first.y, second.y), w: 8, h: Math.min(first.h, second.h) };
    else panel = { x: Math.max(first.x, second.x), y: (Math.min(a.y + a.h, b.y + b.h) + Math.max(a.y, b.y)) / 2 - 4, w: Math.min(first.w, second.w), h: 8 };
    var edgeMark = words[cut - 1].closest("mark.cs-em");
    if (!vertical && edgeMark && groups[1].every(function (word) { return !edgeMark.contains(word); })) {
      var markBox = ctx.rect(edgeMark); panel.y = Math.max(panel.y, markBox.y + markBox.h + 6);
    }
    var path = vertical ? 'M4 0V' + num1(panel.h) : 'M0 4H' + num1(panel.w);
    P.overlays.push({ id: "split-divider", layer: "above", z: contentZ(ctx, true), rect: panel, html: '<svg xmlns="' + SVG_NS + '" viewBox="0 0 ' + num1(panel.w) + ' ' + num1(panel.h) + '" width="100%" height="100%" style="display:block"><path data-m="stroke" pathLength="1" d="' + path + '" fill="none" stroke="' + ctx.colors.accent + '" stroke-width="8"/></svg>' });
    P.add("split-divider.fade", '[data-m-ov="split-divider"]', { at: 0.75, dur: 0.08, from: { opacity: 0 }, to: { opacity: 1 }, rest: { opacity: 0 }, delay: 0,
      then: [{ dt: impact - 0.75 - 0.08, to: { opacity: 1 } }, { dt: 0.16, to: { opacity: 0 } }] });
    P.add("split-divider.draw", '[data-m-ov="split-divider"] [data-m="stroke"]', { at: 0.75, dur: 0.12, from: { dash: 0 }, to: { dash: 1 }, rest: { dash: 0 }, delay: 0,
      then: [{ dt: impact - 0.75 - 0.12, to: { dash: 1 } }, { dt: 0.16, to: { dash: 0 }, ease: "in-cubic" }] });
  }
  pEmphasisWipe(ctx, P, impact + 0.35, 1.0, true);
  if (bareCover(ctx) && !ctx.has("mark.cs-em")) {
    // A bare, unmarked title has no later entrances to spread. Its accent trace carries that later beat instead of slowing the hit.
    var ink = boundsOf(ctx, words), h = 28;
    P.overlays.push({ id: "split-trace", layer: "below", z: contentZ(ctx, false), rect: { x: ink.x, y: ink.y + ink.h + 3, w: ink.w, h: h }, html: panelMarkup(ink.w, h, ctx.colors.accent, h / 2) });
    P.add("split-trace", '[data-m-ov="split-trace"]', { at: impact + 0.35, dur: 1.0, from: { opacity: 1, clipInset: revealClip(ctx) }, to: { opacity: 1, clipInset: [0, 0, 0, 0] },
      rest: { opacity: 0, clipInset: revealClip(ctx) }, resetTo: { opacity: 0, clipInset: revealClip(ctx) }, delay: 0, ease: "linear",
      then: [{ dt: 0.3, to: { opacity: 1, clipInset: [0, 0, 0, 0] } }, { dt: 0.3, to: { opacity: 0, clipInset: [0, 0, 0, 0] } }] });
  }
  pSub(ctx, P, 3.8); pMedia(ctx, P, 4.05); pKicker(ctx, P, 4.2); pBullets(ctx, P, 4.3); pNudge(ctx, P, 4.44);
});

/* ------------------------------------------------------------------ none, and the ids that ship in v1.1 */
defineRecipe({ id: "none", label: { ar: "بدون حركة", en: "No motion" }, feel: "calm", topics: [] }, function () { /* nothing moves */ });
defineRecipe({ id: "morph", label: { ar: "تحوّل", en: "Morph" }, feel: "story", ships: "1.1", topics: ["old-vs-new"] }, null);
defineRecipe({ id: "cash-wipe", label: { ar: "نقود تُمسح", en: "Cash wipe" }, feel: "story", ships: "1.1", topics: ["cost"] }, null);
defineRecipe({ id: "scale", label: { ar: "ميزان", en: "Scale" }, feel: "story", ships: "1.1", topics: ["growth"] }, null);
