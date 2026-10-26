/*
 * CS.motion · the recipes.
 *
 * Every recipe follows the same poster-first story, authored against a 6 s timeline (build maps it onto 5 s covers):
 *
 *   0.00 - 0.40   the finished poster holds (frame 0 = the exported PNG = the grid thumbnail)
 *   0.40 - 0.75   the content breaks apart (each piece goes back to where it entered from, in reading order)
 *   0.75 - 3.70   the story rebuilds it: kicker, hero, symbol, sub line (the first piece enters at 0.75, never later)
 *   3.70 - 5.60   the finished poster holds; the swipe cue nudges, then everything is at rest
 *   5.60 - 6.00   rest: the last frame is the first frame, so the loop is seamless
 *
 * The header and footer (handle, meta, counter, save pill, swipe cue) never leave the screen, so no frame is ever empty
 * (gate V1: no blank frame between 0.4 s and 5.6 s); only the swipe cue moves, in the final hold.
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

function pKicker(ctx, P, at) {
  if (ctx.has('[data-m="kicker"]')) P.add("kicker", '[data-m="kicker"]', { at: at, dur: 0.45, from: { opacity: 0, x: ctx.startX(70) }, ease: "out-cubic" });
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
function pEmphasisWipe(ctx, P, at, dur) {
  var marks = ctx.q("mark.cs-em");
  marks.forEach(function (m, i) {
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
  P.counter("count", '[data-m-count="1"]', { at: at, dur: count, from: 0, to: n.value, decimals: n.decimals, ease: "in-quad" });
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
  els.forEach(function (e) { var r = inkBox(ctx, e); x0 = Math.min(x0, r.x); y0 = Math.min(y0, r.y); x1 = Math.max(x1, r.x + r.w); y1 = Math.max(y1, r.y + r.h); });
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
  var landed = pNumber(ctx, P, 0.8, 0.9);
  pCascade(ctx, P, words, { at: ctx.number ? landed - 0.55 : 0.95, each: 0.085, dur: 0.55, y: 54, rotate: 3, ease: "out-back", skip: function (w) { return ctx.number && w === ctx.number.word; } });
  pEmphasisWipe(ctx, P, landed - 0.1, 0.6);
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
    P.overlays.push({ id: id, layer: "above", rect: target.rect, html: ringMarkup(target.rect.w, target.rect.h, ctx.colors, ctx.rtl) });
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
    t = { kicker: 2.4, number: 2.55, words: 2.6, sub: 3.6, nudge: 4.4 };
  }
  P.overlays.push({ id: id, layer: "above", rect: rect, html: made.html });
  made.choreo(P, id, win);
  pKicker(ctx, P, t.kicker);
  var landed = pNumber(ctx, P, t.number, 0.9), wordsAt = ctx.number ? Math.max(t.words, landed - 0.55) : t.words;
  pCascade(ctx, P, words, { at: wordsAt, each: 0.09, dur: 0.55, y: 58, rotate: 3, ease: "out-back",
    skip: function (w) { return inEmphasis(w) || (ctx.number && w === ctx.number.word); } });
  pEmphasisWipe(ctx, P, wordsAt + 0.5, 0.6);
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

/* ------------------------------------------------------------------ none, and the ids that ship in v1.1 */
defineRecipe({ id: "none", label: { ar: "بدون حركة", en: "No motion" }, feel: "calm", topics: [] }, function () { /* nothing moves */ });
defineRecipe({ id: "morph", label: { ar: "تحوّل", en: "Morph" }, feel: "story", ships: "1.1", topics: ["old-vs-new"] }, null);
defineRecipe({ id: "split", label: { ar: "شاشة منقسمة", en: "Split" }, feel: "story", ships: "1.1", topics: ["race"] }, null);
defineRecipe({ id: "cash-wipe", label: { ar: "نقود تُمسح", en: "Cash wipe" }, feel: "story", ships: "1.1", topics: ["cost"] }, null);
defineRecipe({ id: "scale", label: { ar: "ميزان", en: "Scale" }, feel: "story", ships: "1.1", topics: ["growth"] }, null);
