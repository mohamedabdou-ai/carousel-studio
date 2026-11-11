/*
 * CS.motion · build(): slide DOM + options -> Timeline.
 * The only code that reads the slide. Everything a recipe needs is measured here once and handed over as a RecipeContext.
 */

var NUMBER_RE = /^[$€£]?[0-9٠-٩][0-9٠-٩.,٫٬]*(?:%|٪)?$/;
var ALIASES = { "counter-roll": "counter", "heartbeat": "story", "heartbeat-flatline": "story", "racing-clock": "drop-clock", "word-cascade": "highlight-sweep", "cinemagraph": "calm" };

function isShipped(recipe) { return !!recipe && recipe.ships === "1.0" && (typeof recipe.build === "function"); }

/** The first headline word that is a plain number ("6", "88%", "$20", "٤١٣"); years and codes are not counted up. */
function findNumber(ctx) {
  var words = ctx.words(ctx.heroSlot), i, w, holder, text, walker, node, m;
  for (i = 0; i < words.length; i++) {
    w = words[i];
    walker = document.createTreeWalker(w, 4, null);
    while ((node = walker.nextNode())) {
      text = node.nodeValue.trim();
      if (!text || !NUMBER_RE.test(text)) continue;
      holder = node.parentNode;
      if (/^(19|20)[0-9]{2}$/.test(text.replace(/[٠-٩]/g, function (c) { return "٠١٢٣٤٥٦٧٨٩".indexOf(c); }))) return null;
      m = /^[$€£]?([0-9٠-٩][0-9٠-٩.,٫٬]*)/.exec(text);
      var western = m[1].replace(/[٠-٩]/g, function (c) { return "٠١٢٣٤٥٦٧٨٩".indexOf(c); }).replace(/٫/g, ".").replace(/[٬,]/g, "");
      var value = parseFloat(western);
      if (!isFinite(value) || value <= 0 || value > 1e7) return null;
      return { word: w, holder: holder, value: value, decimals: western.indexOf(".") >= 0 ? western.length - western.indexOf(".") - 1 : 0 };
    }
  }
  return null;
}

function makeContext(root, opts, times) {
  var rtl = (root.getAttribute("dir") || window.getComputedStyle(root).direction) !== "ltr", counter = 0, i;
  var stale = root.querySelectorAll("[data-m-id],[data-m-count],[data-m-layer]");
  for (i = 0; i < stale.length; i++) { stale[i].removeAttribute("data-m-id"); stale[i].removeAttribute("data-m-count"); stale[i].removeAttribute("data-m-layer"); }
  var seed = opts.seed !== undefined ? opts.seed >>> 0 : fnv32((root.textContent || "") + "|" + (opts.recipe || "")) >>> 0;
  var engine = hfEngine();
  var ctx = {
    root: root, rtl: rtl, dir: rtl ? "rtl" : "ltr", digits: root.getAttribute("data-digits") === "arabic-indic" ? "arabic-indic" : "western",
    swipe: root.getAttribute("data-swipe") || (root.querySelector('[data-m="swipe"]') ? (rtl ? "arrow-rtl" : "arrow-ltr") : "neutral"),
    seed: seed, rng: engine.rng(seed), reducedMotion: !!opts.reducedMotion, plate: opts.plate, times: times,
    colors: { accent: trimCssVar(root, "--cs-accent", DEFAULT_COLORS.accent), ink: trimCssVar(root, "--cs-ink", DEFAULT_COLORS.ink), muted: trimCssVar(root, "--cs-ink-muted", DEFAULT_COLORS.muted) },
    metaphor: opts.metaphor || null, topics: opts.topics || [],
    q: function (sel) { return Array.prototype.slice.call(root.querySelectorAll(sel)); },
    has: function (sel) { return !!root.querySelector(sel); },
    words: function (slot) { return ctx.q('.w[data-m-slot="' + slot + '"]'); },
    lines: function (slot) { return ctx.q('.cs-ln[data-m-slot="' + slot + '"]'); },
    startX: function (px) { return rtl ? px : -px; },
    rect: function (el) { return slideRect(root, el); },
    sel: function (el) {
      var id = el.getAttribute("data-m-id");
      if (!id) { counter += 1; id = String(counter); el.setAttribute("data-m-id", id); }
      return '[data-m-id="' + id + '"]';
    }
  };
  ["headline", "title", "body"].some(function (slot) { ctx.heroSlot = slot; return ctx.words(slot).length > 0; });
  if (!ctx.words(ctx.heroSlot).length) ctx.heroSlot = "headline";
  var content = root.querySelector(".cs-content");
  if (content) content.setAttribute("data-m-layer", "content");
  ctx.number = findNumber(ctx);
  if (ctx.number) ctx.number.holder.setAttribute("data-m-count", "1");
  return ctx;
}

/** Opacity-only version of a timeline for people who asked their system for less motion (live preview only). */
function reduceTimeline(tl) {
  var keep = function (o) { return o && o.opacity !== undefined ? { opacity: o.opacity } : o ? {} : o; };
  tl.tracks = tl.tracks.filter(function (t) { return (t.from && t.from.opacity !== undefined) && t.sel.indexOf("data-m-ov") < 0; }).map(function (t) {
    var r = { id: t.id, sel: t.sel, from: keep(t.from), t0: t.t0, t1: t.t1, ease: "out-quad", reset: { ease: "in-quad", delay: t.reset ? t.reset.delay : 0 } };
    if (t.to) r.to = keep(t.to);
    return r;
  });
  tl.counters = []; tl.overlays = []; delete tl.contentClip;
  return tl;
}

/**
 * Checks a built timeline against the slide: every window sits inside [resetEnd, settleBy] after stagger and `then`,
 * break-apart targets are invisible, selectors match something. Returns a list of problems (empty = fine).
 */
function validateTimeline(root, tl) {
  var problems = [], T = tl.times, eps = 0.0005;
  var scratch = root.cloneNode(true);
  (tl.overlays || []).forEach(function (ov) { var d = document.createElement("div"); d.setAttribute("data-m-ov", ov.id); d.innerHTML = ov.html || ""; scratch.appendChild(d); });
  tl.tracks.forEach(function (t) {
    var els;
    try { els = scratch.querySelectorAll(t.sel); } catch (e) { problems.push(t.id + ": invalid selector " + t.sel); return; }
    if (!els.length) { problems.push(t.id + ": selector matches nothing (" + t.sel + ")"); return; }
    var extra = (t.then || []).reduce(function (s, x) { return s + x.dt; }, 0), delays = 0;
    if (t.stagger && t.stagger.each) delays = t.stagger.each * (els.length - 1);
    if (t.t0 < T.resetEnd - eps) problems.push(t.id + ": starts before resetEnd");
    if (t.t1 + extra + delays > T.settleBy + eps) problems.push(t.id + ": ends at " + round3(t.t1 + extra + delays) + " after settleBy " + T.settleBy);
    if (t.t1 <= t.t0) problems.push(t.id + ": empty window");
    if (t.reset && t.reset.to && t.reset.to.opacity !== undefined && t.reset.to.opacity !== 0 && JSON.stringify(t.reset.to) !== JSON.stringify(t.from)) problems.push(t.id + ": break-apart target must be invisible");
  });
  (tl.counters || []).forEach(function (c) {
    if (!scratch.querySelector(c.sel)) problems.push(c.id + ": counter selector matches nothing");
    if (c.t1 > T.settleBy + eps) problems.push(c.id + ": counter ends after settleBy");
  });
  return problems;
}

/**
 * No dead air: the first piece that enters starts exactly when the break-apart ends. Every track that starts at or after
 * that piece moves earlier by the same amount, so the choreography keeps its shape and only loses the empty beat.
 */
function alignEntrance(tl) {
  var T = tl.times, entering = tl.tracks.filter(function (t) { var c = t.from && t.from.clipInset;
    return t.from && (t.from.opacity === 0 || c && (c[1] + c[3] >= 99.9 || c[0] + c[2] >= 99.9)); });
  // A curtain already covering the poster, or the camera's opening shot, is itself the first piece.
  // Moving later word tracks alone would desynchronise their reveal from that visible opening.
  if (tl.tracks.some(function (t) { return t.t0 <= T.resetEnd + 0.001 && t.from && t.from.opacity !== 0 &&
    (tl.contentClip || t.from.opacity === 1 && t.sel.indexOf("data-m-ov") >= 0); })) return;
  if (!entering.length) return;
  var first = Math.min.apply(null, entering.map(function (t) { return t.t0; })), shift = round3(first - T.resetEnd);
  if (shift <= 0.001) return;
  tl.tracks.forEach(function (t) { if (t.t0 >= first - 1e-6) { t.t0 = round3(t.t0 - shift); t.t1 = round3(t.t1 - shift); } });
  tl.counters.forEach(function (c) { if (c.t0 >= first - 1e-6) { c.t0 = round3(c.t0 - shift); c.t1 = round3(c.t1 - shift); } });
}

function resolveRecipe(id) {
  var wanted = ALIASES[id] || id || "calm", recipe = RECIPE_REGISTRY[wanted];
  if (isShipped(recipe)) return { recipe: recipe, fallbackFrom: null };
  return { recipe: RECIPE_REGISTRY.calm, fallbackFrom: wanted };
}

/** Keep a complete opening line readable during the reset and rebuild. Chrome/footer decoration cannot stand in for cover copy. */
function keepHeroVisible(ctx, plan) {
  var rows = heroRows(ctx), total = rows.reduce(function (n, row) { return n + row.rect.w * row.rect.h; }, 0), area = 0, keep = [];
  rows.some(function (row) { keep = keep.concat(row.words); area += row.rect.w * row.rect.h; return area >= total * 0.4; });
  plan.tracks = plan.tracks.filter(function (track) {
    var hosts = ctx.q(track.sel), c = track.from && track.from.clipInset;
    var hides = track.from && track.from.opacity === 0 || c && (c[1] + c[3] >= 99 || c[0] + c[2] >= 99);
    return !hides || !hosts.some(function (host) { return keep.some(function (word) { return host === word || host.contains(word); }); });
  });
  if (plan.mode !== "center" || !keep.length) return;
  // The short story symbol may use the space of later text, never that of the retained title.
  var symbol = plan.overlays.find(function (o) { return /^story-/.test(o.id); });
  if (!symbol) return;
  var body = bodyBounds(ctx), boxes = keep.map(function (word) { return ctx.rect(word); });
  var top = Math.min.apply(null, boxes.map(function (r) { return r.y; })), bottom = Math.max.apply(null, boxes.map(function (r) { return r.y + r.h; }));
  var gaps = [{ y: body.y, h: top - body.y - 16 }, { y: bottom + 16, h: body.y + body.h - bottom - 16 }];
  gaps.sort(function (a, b) { return b.h - a.h; });
  if (gaps[0].h < 80) throw motionError("E_FIT_OVERFLOW", "The story symbol needs clear space. Use another recipe or reduce the title height.");
  var gap = gaps[0], height = Math.min(300, gap.h);
  symbol.rect = { x: body.x, y: gap.y + (gap.h - height) / 2, w: body.w, h: height };
  var reveal = plan.tracks.filter(function (track) {
    var clip = track.from && track.from.clipInset, hides = track.from && track.from.opacity === 0 || clip && (clip[1] + clip[3] >= 99);
    return hides && ctx.q(track.sel).some(function (node) {
      if (!node.closest(".cs-content")) return false;
      var r = ctx.rect(node), s = symbol.rect;
      return r.x < s.x + s.w && r.x + r.w > s.x && r.y < s.y + s.h && r.y + r.h > s.y;
    });
  });
  var shift = Math.max(0, plan.t(1.8) - Math.min.apply(null, reveal.map(function (track) { return track.t0; })));
  reveal.forEach(function (track) { track.t0 = round3(track.t0 + shift); track.t1 = round3(track.t1 + shift); });
}

/**
 * CS.motion.build(slideEl, { recipe, seconds, fps, feel, seed, plate, reducedMotion, metaphor, topics }) -> Timeline.
 * The slide is read, never changed, except for the data-m-id / data-m-count / data-m-layer hooks the tracks select by.
 */
function buildTimeline(slideEl, opts) {
  opts = opts || {};
  var resolved = resolveRecipe(opts.recipe), recipe = resolved.recipe;
  var seconds = clampNum(Number(opts.seconds) || DEFAULT_SECONDS, 5, 6);
  var times = { holdIn: DEFAULT_TIMES.holdIn, resetEnd: DEFAULT_TIMES.resetEnd, settleBy: round3(Math.min(DEFAULT_TIMES.settleBy, seconds - 0.4)) };
  var P = new Plan(times), tl;
  var ctx = makeContext(slideEl, { recipe: recipe.id, seed: opts.seed, reducedMotion: opts.reducedMotion, plate: opts.plate, metaphor: opts.metaphor, topics: opts.topics }, times);
  if (!ctx.metaphor && (recipe.id === "story")) {
    var found = detectTopics((slideEl.textContent || "").replace(/\s+/g, " "));
    ctx.metaphor = metaphorForTags(found.tags) || "spark";
  }
  if (ctx.metaphor && !CS.motion.metaphors[ctx.metaphor]) throw motionError("E_USAGE", "Unknown cover symbol. Use one of: " + Object.keys(CS.motion.metaphors).join(", "));
  if (recipe.id !== "none") recipe.build(ctx, P);
  if (["stamp", "highlight-sweep", "story", "counter", "map-dots", "drop-clock", "calm", "reorder"].indexOf(recipe.id) >= 0) keepHeroVisible(ctx, P);
  tl = {
    v: 1, recipe: recipe.id, feel: opts.feel === "calm" || opts.feel === "story" ? opts.feel : recipe.feel, seed: ctx.seed,
    duration: seconds, fps: FPS, frames: Math.round(seconds * FPS), times: times, tracks: P.tracks, counters: P.counters
  };
  if (P.overlays.length) tl.overlays = P.overlays;
  if (P.contentClip) tl.contentClip = P.contentClip;
  if (P.metaphor) tl.metaphor = P.metaphor;
  if (P.mode) tl.mode = P.mode;
  if (resolved.fallbackFrom) tl.fallbackFrom = resolved.fallbackFrom;
  alignEntrance(tl);
  if (opts.reducedMotion) reduceTimeline(tl);
  return tl;
}
