/*! Carousel Studio runtime chunk cs-motion.js · cs-1.1.0 · Apache-2.0 */
(function () {
  "use strict";
  var CS = (window.CS = window.CS || {});
  /* ---- file: util.js ---- */
/*
 * CS.motion · shared helpers (chunk-private).
 *
 * Motion never changes copy or layout. It reads the finished slide, decides a choreography and returns it as data (a Timeline,
 * CONTRACT 5.6). The same Timeline is evaluated by the live preview, by the Studio exporter and by HyperFrames.
 */

var FPS = 30;
var DEFAULT_SECONDS = 6;
var DEFAULT_TIMES = { holdIn: 0.4, resetEnd: 0.75, settleBy: 5.6 };   // platform-instagram.json -> plugin.motion
var AUTHORED_SPAN = DEFAULT_TIMES.settleBy - DEFAULT_TIMES.resetEnd;   // recipes are authored against a 6 s timeline

function motionError(code, message, detail) {
  var E = CS.CSError;
  if (E) return new E(code, message, detail);
  var e = new Error(message || code);
  e.code = code;
  if (detail !== undefined) e.detail = detail;
  return e;
}

function hfEngine() {
  var hf = CS.motion && CS.motion.hf;
  if (!hf || !hf.engine) throw motionError("E_DEP_LOAD", "cs-hf.js must be loaded before the motion engine is used.");
  return hf.engine;
}

function clampNum(n, a, b) { return n < a ? a : n > b ? b : n; }

function round3(n) { return Math.round(n * 1000) / 1000; }

/** 32-bit FNV-1a of a string (seeds only; not a security feature). */
function fnv32(text) {
  var h = 0x811c9dc5, i;
  for (i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

/** Arabic normalisation for keyword spotting: no marks, one alef, one ya, one ha, lower-case Latin, digits dropped. */
function normalizeAr(text) {
  return String(text || "").toLowerCase()
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/ؤ/g, "و").replace(/ئ/g, "ي")
    .replace(/\s+/g, " ").trim();
}

function trimCssVar(el, name, fallback) {
  var v = el.style.getPropertyValue(name) || window.getComputedStyle(el).getPropertyValue(name);
  v = (v || "").trim();
  return v || fallback;
}

/** Rectangle of `el` in slide pixels (undoes the Studio's preview scale). */
function slideRect(root, el) {
  var rr = root.getBoundingClientRect(), sc = root.offsetWidth ? rr.width / root.offsetWidth : 1, r = el.getBoundingClientRect();
  return { x: (r.left - rr.left) / sc, y: (r.top - rr.top) / sc, w: r.width / sc, h: r.height / sc };
}

/**
 * Collects the tracks of one recipe. Recipes are authored in seconds against the default 6 s timeline; `t()` and `d()`
 * map authored times and durations onto the real build window [resetEnd, settleBy] (5 s covers shrink, never overflow).
 */
function Plan(times) {
  this.times = times;
  this.k = (times.settleBy - times.resetEnd) / AUTHORED_SPAN;
  this.tracks = [];
  this.counters = [];
  this.overlays = [];
  this.order = 0;
}

Plan.prototype.t = function (authored) { return round3(this.times.resetEnd + (authored - DEFAULT_TIMES.resetEnd) * this.k); };
Plan.prototype.d = function (authored) { return round3(authored * this.k); };

/**
 * add(id, sel, { at, dur, from, to, ease, origin, stagger, rest, then, resetTo, resetEase, delay })
 * `then` entries are { dt, to?, ease? } in authored seconds. The break-apart delay follows reading order unless given.
 */
Plan.prototype.add = function (id, sel, o) {
  var self = this, t0 = this.t(o.at), tr = { id: id, sel: sel, from: o.from, t0: t0, t1: round3(t0 + this.d(o.dur)), ease: o.ease || "out-cubic" };
  if (o.to) tr.to = o.to;
  if (o.origin) tr.origin = o.origin;
  if (o.stagger) tr.stagger = { each: round3(this.d(o.stagger.each)), from: o.stagger.from || "start", seed: o.stagger.seed };
  if (o.rest) tr.rest = o.rest;
  if (o.then) tr.then = o.then.map(function (s) { var x = { dt: self.d(s.dt) }; if (s.to) x.to = s.to; if (s.ease) x.ease = s.ease; return x; });
  tr.reset = { ease: o.resetEase || "in-cubic", delay: o.delay !== undefined ? o.delay : round3(Math.min(0.1, this.order * 0.012)) };
  if (o.resetTo) tr.reset.to = o.resetTo;
  if (o.delay === undefined) this.order += 1;
  this.tracks.push(tr);
  return tr;
};

Plan.prototype.counter = function (id, sel, o) {
  var t0 = this.t(o.at);
  this.counters.push({ id: id, sel: sel, from: o.from, to: o.to, t0: t0, t1: round3(t0 + this.d(o.dur)), ease: o.ease || "in-quad", decimals: o.decimals || 0 });
};

  /* ---- file: topics.js ---- */
/*
 * CS.motion · topic spotting and the topic -> motion map (CONTRACT 5.7, decisions "Motion default").
 *
 * The cover text, the brief and the hook family give a few topic tags; the tags choose the recipe and, for the story recipe,
 * the metaphor. This is a deterministic keyword match, not a model: the same spec always gets the same motion.
 * Entries are normalised Arabic or lower-case English tokens; a trailing * means "starts with"; entries with a space match as phrases.
 */

var TOPIC_LEXICON = {
  mistakes: ["اخطاء", "خطا", "غلط", "اغلاط", "غلطه", "تموت*", "يموت*", "تقتل*", "يقتل*", "قاتل*", "تدمر*", "يدمر*", "تخرب*", "يخرب*", "فشل*", "تفشل*", "يفشل*",
    "تضيع*", "يضيع*", "خساير*", "خساره", "تخسر*", "يخسر*", "mistake*", "wrong", "kill*", "fail*", "ruin*", "wreck*", "destroy*", "blunder*"],
  urgency: ["عاجل", "فورا", "حالا", "دلوقتي", "دلوقت", "الان", "الحين", "هالحين", "هلق", "هسا", "ينتهي*", "تنتهي*", "يفوت*", "تفوت*", "ساعات", "دقايق", "دقائق", "ثواني", "سباق",
    "متاخر*", "تاخر*", "محدود*", "سارع*", "اخر فرصه", "ينتهي الوقت", "الوقت بينتهي", "الوقت يمر", "الوقت ينفد", "ضيق الوقت", "قبل فوات الوقت", "urgent", "deadline", "hurry", "hours",
    "minutes", "seconds", "race", "running out", "last chance"],
  spread: ["انتشار", "ينتشر*", "تنتشر*", "انتشرت", "عالمي*", "العالم", "دول العالم", "كل الدول", "عدة دول", "دوله", "مدن", "مدينه", "محافظات", "فروع", "كل مكان", "حول العالم", "spread*",
    "global*", "worldwide", "countries", "cities", "everywhere"],
  decision: ["قرار", "قرارات", "احسم*", "حسم*", "اختار*", "اختيار", "الحقيقه", "خرافه", "خرافات", "اسطوره", "ايهما", "الافضل", "مقابل", "ضد", "الحكم", "صح ولا غلط",
    "vs", "versus", "myth*", "truth", "decide*", "decision*", "choose*", "verdict", "better"],
  money: ["فلوس", "مال", "ربح*", "ارباح", "ادفع*", "تدفع*", "سعر", "اسعار", "ميزانيه", "رخيص*", "غالي*", "ببلاش", "مجاني*", "تكلفه", "دخل", "راتب", "ثروه", "اموال", "مصاري", "مصروف*", "ريال*", "درهم", "دراهم", "دينار*", "دولار*", "جنيه",
    "money", "cash", "profit*", "price*", "cost*", "budget", "free", "paid", "income", "salary", "revenue"],
  growth: ["نمو", "تنمو", "زياده", "ارتفاع", "تضاعف*", "مضاعف*", "اضعاف", "ضعف", "ارتفع*", "يرتفع*", "تزيد*", "يزيد*", "مبيعات", "نتايج", "نتائج", "growth", "grow*",
    "double*", "rise*", "increase*", "boost*", "results", "sales"],
  steps: ["خطوه", "خطوات", "طريقه", "طرق", "كيف", "ازاي", "شلون", "كيفيه", "دليل", "شرح", "نظام", "اسلوب", "framework", "steps", "step", "how", "guide", "system", "method"],
  news: ["خبر", "اخبار", "جديد", "اطلاق", "اطلقت", "تحديث", "اعلان", "اعلنت", "launch*", "new", "announced", "update", "released", "breaking"],
  story: ["قصه", "قصتي", "حكايه", "تجربتي", "تجربه", "رحلتي", "story", "journey", "case"]
};

var TOPIC_METAPHOR = { mistakes: "heartbeat", urgency: "clock", spread: "dots", growth: "bars", money: "coins", decision: "check", news: "spark", story: "spark" };
var CLITIC_RE = /^(?:وال|بال|كال|فال|لل|ال|بي|و|ف|ب|ل|ك|ه|ح)/;   // proclitics and the colloquial present / future prefixes (بيتموت، هتموت، حيموت)

function stemMatches(token, entry) {
  var prefix = entry.charAt(entry.length - 1) === "*", stem = prefix ? entry.slice(0, -1) : entry;
  if (prefix ? token.indexOf(stem) === 0 : token === stem) return true;
  var bare = token.replace(CLITIC_RE, "");
  return bare !== token && (prefix ? bare.indexOf(stem) === 0 : bare === stem);
}

/** Scores every topic for `text`; returns { tags: [names, strongest first], scores }. */
function detectTopics(text) {
  var norm = normalizeAr(text), tokens = norm.split(/[^a-z0-9ء-ي]+/).filter(Boolean), padded = " " + norm + " ";
  var scores = {}, tag, list, i, j, entry;
  for (tag in TOPIC_LEXICON) {
    list = TOPIC_LEXICON[tag]; scores[tag] = 0;
    for (i = 0; i < list.length; i++) {
      entry = list[i];
      if (entry.indexOf(" ") >= 0) { if (padded.indexOf(" " + entry + " ") >= 0) scores[tag] += 2; continue; }
      for (j = 0; j < tokens.length; j++) if (stemMatches(tokens[j], entry)) { scores[tag] += 1; break; }
    }
  }
  var tags = Object.keys(scores).filter(function (t) { return scores[t] > 0; }).sort(function (a, b) { return scores[b] - scores[a] || (a < b ? -1 : 1); });
  return { tags: tags, scores: scores };
}

function metaphorForTags(tags) {
  for (var i = 0; i < tags.length; i++) if (TOPIC_METAPHOR[tags[i]]) return TOPIC_METAPHOR[tags[i]];
  return null;
}

var WHY = {
  counter: { ar: "الغلاف يبدأ برقم، فيعدّ الرقم صعودًا ثم يستقر في مكانه.", en: "The cover leads with a number, so it counts up and lands." },
  heartbeat: { ar: "الموضوع عن أخطاء تضرّ، فنبض القلب يتسارع ثم يتوقف.", en: "The topic is about mistakes that hurt, so a heartbeat races and flatlines." },
  clock: { ar: "الموضوع عاجل، فعقرب الساعة يتسارع قبل أن يظهر العنوان.", en: "The topic is urgent, so a clock hand races before the title lands." },
  dots: { ar: "الموضوع عن انتشار، فنقاط تضيء الخريطة واحدة بعد أخرى.", en: "The topic is about spread, so dots light up a map one by one." },
  stamp: { ar: "الموضوع قرار أو حكم، فتُختم الكلمة المهمة بختم واضح.", en: "A decision or verdict gets a stamp on the key word." },
  reorder: { ar: "المحتوى خطوات ونظام، فتنتظم الكلمات في أماكنها.", en: "The content is a method, so the words fall into order." },
  story: { ar: "المحتوى خبر أو قصة، فتبدأ الحركة برمز قصير ثم يظهر العنوان.", en: "News or a story opens with a short symbol before the title builds." },
  cascade: { ar: "لا رمز بصريًا أقوى من الكلمات نفسها، فتنزل الكلمات واحدة واحدة ويُظلَّل المهم.", en: "No visual symbol beats the words, so they drop in one by one and the key phrase is highlighted." },
  calm: { ar: "حركة هادئة تُبقي الغلاف كما صُمّم.", en: "A calm move that keeps the cover as designed." }
};

function firstSlide(spec) {
  var s = spec && spec.slides, i;
  if (!s) return null;
  for (i = 0; i < s.length; i++) if (s[i].type === "cover" || s[i].type === "poster") return s[i];
  return s[0] || null;
}

/** The topic -> motion decision (CS.motion.recommend). Order follows CONTRACT 5.7 and the "Motion default" decision. */
function recommendMotion(spec) {
  var cover = firstSlide(spec) || {}, hook = (spec && spec.hook) || {}, parts = [hook.cover, hook.text, spec && spec.brief && spec.brief.topic,
    spec && spec.angle && spec.angle.title, cover.kicker, cover.headline, cover.sub, spec && spec.captionPack && spec.captionPack.firstLine];
  var text = parts.filter(Boolean).join(" ").replace(/==/g, "");
  var found = detectTopics(text), tags = found.tags, arch = spec && spec.architecture, family = hook.family || "";
  var coverText = (hook.cover || cover.headline || "").replace(/==/g, "");
  var numeral = /[0-9٠-٩]/.test(coverText.replace(/\b(19|20)[0-9]{2}\b/g, "")) || (spec && spec.slides || []).some(function (s) { return s.type === "stat" || (s.number && s.number.value); });
  var has = function (t) { return tags.indexOf(t) >= 0; };
  var pick = function (recipe, feel, why, metaphor) { return { recipe: recipe, feel: feel, why: why, metaphor: metaphor || null, tags: tags }; };
  if (has("urgency") && found.scores.urgency >= 2) return pick("drop-clock", "story", WHY.clock, "clock");
  if (has("spread") && found.scores.spread >= 2) return pick("map-dots", "story", WHY.dots, "dots");
  if (arch === "myth-fact" || family === "P4" || (has("decision") && found.scores.decision >= 2)) return pick("stamp", "story", WHY.stamp);
  if (has("mistakes")) return pick("story", "story", WHY.heartbeat, "heartbeat");
  if (numeral) return pick("counter", "calm", WHY.counter);
  if (has("urgency")) return pick("drop-clock", "story", WHY.clock, "clock");
  if (has("spread")) return pick("map-dots", "story", WHY.dots, "dots");
  if (arch === "steps" || arch === "framework" || has("steps")) return pick("reorder", "story", WHY.reorder);
  if (arch === "news" || arch === "story" || arch === "case-study" || has("news") || has("story")) {
    var m = metaphorForTags(tags) || "spark";
    return pick("story", "story", WHY.story, m);
  }
  return pick("highlight-sweep", "calm", WHY.cascade);
}

  /* ---- file: metaphors.js ---- */
/*
 * CS.motion · story metaphors.
 *
 * A metaphor is a short drawn symbol that plays while the poster is broken apart and fades before the title is finished
 * (CONTRACT 5.7, `story`). Each one is plain inline SVG in an 884 x 300 box: paths use pathLength="1" and data-m="stroke" so
 * the engine can draw them with `dash`; repeated parts carry data-m-i for staggering. Colours are resolved when the timeline
 * is built, so the overlay needs no CSS variables and renders the same in every painter and in HyperFrames.
 * No text is ever drawn inside a metaphor.
 */

var SVG_NS = "http://www.w3.org/2000/svg";
var MV_W = 884;
var MV_H = 300;
var DEFAULT_COLORS = { accent: "#E3262B", ink: "#111111", muted: "#8A8A8A" };

function svgWrap(inner) {
  return '<svg xmlns="' + SVG_NS + '" viewBox="0 0 ' + MV_W + " " + MV_H + '" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" ' +
    'fill="none" stroke-linecap="round" stroke-linejoin="round" style="display:block;overflow:visible">' + inner + "</svg>";
}

function num1(n) { return String(Math.round(n * 10) / 10); }

/** Fade the whole overlay in at `at`, hold until `hold`, fade out (all authored seconds). */
function overlayFade(plan, id, at, hold) {
  plan.add(id + ".fade", '[data-m-ov="' + id + '"]', {
    at: at, dur: 0.28, from: { opacity: 0 }, to: { opacity: 1 }, rest: { opacity: 0 }, ease: "out-quad", delay: 0,
    then: [{ dt: Math.max(0.05, hold - at - 0.28), to: { opacity: 1 }, ease: "linear" }, { dt: 0.4, to: { opacity: 0 }, ease: "in-out-quad" }]
  });
}

/* ---- heartbeat: two beats, then a flat line (mistakes, things that hurt) ---- */
function ecgPoints() {
  var B = 170, pts = [[0, B]];
  [120, 380].forEach(function (t0) {
    pts.push([t0, B], [t0 + 30, B - 16], [t0 + 60, B], [t0 + 80, B], [t0 + 90, B + 14], [t0 + 110, B - 120], [t0 + 135, B + 80], [t0 + 155, B], [t0 + 185, B - 30], [t0 + 225, B]);
  });
  pts.push([MV_W, B]);
  return pts;
}

function makeHeartbeat(o) {
  var c = o.colors, d = ecgPoints().map(function (p, i) { return (i ? "L" : "M") + num1(o.rtl ? MV_W - p[0] : p[0]) + " " + p[1]; }).join(" ");
  var html = svgWrap('<path d="M0 170H' + MV_W + '" stroke="' + c.muted + '" stroke-width="3" opacity="0.35"/>' +
    '<path data-m="stroke" pathLength="1" d="' + d + '" stroke="' + c.accent + '" stroke-width="12"/>');
  return {
    html: html,
    choreo: function (plan, id, win) {
      overlayFade(plan, id, win.at, win.hold);
      plan.add(id + ".line", '[data-m-ov="' + id + '"] [data-m="stroke"]', {
        at: win.at + 0.12, dur: Math.min(1.5, win.hold - win.at - 0.75), from: { dash: 0 }, to: { dash: 1 }, rest: { dash: 1 }, ease: "in-out-quad", delay: 0
      });
    }
  };
}

/* ---- clock: a hand that accelerates over two laps, an arc that fills (urgency, deadlines) ---- */
function makeClock(o) {
  var c = o.colors, cx = MV_W / 2, cy = 150, ticks = "", i, a, r0, r1;
  for (i = 0; i < 12; i++) {
    a = i * Math.PI / 6; r0 = i % 3 === 0 ? 84 : 94; r1 = 108;
    ticks += "M" + num1(cx + Math.sin(a) * r0) + " " + num1(cy - Math.cos(a) * r0) + "L" + num1(cx + Math.sin(a) * r1) + " " + num1(cy - Math.cos(a) * r1);
  }
  var html = svgWrap('<g data-m="ring"><circle cx="' + cx + '" cy="' + cy + '" r="124" stroke="' + c.ink + '" stroke-width="12"/>' +
    '<path d="' + ticks + '" stroke="' + c.muted + '" stroke-width="6"/>' +
    '<circle data-m="stroke" pathLength="1" cx="' + cx + '" cy="' + cy + '" r="124" stroke="' + c.accent + '" stroke-width="12" transform="rotate(-90 ' + cx + " " + cy + ')"/>' +
    '<g data-m="hand"><path d="M' + cx + " " + (cy - 88) + "V" + (cy + 88) + '" stroke="none"/><path d="M' + cx + " " + cy + "V" + (cy - 80) + '" stroke="' + c.accent + '" stroke-width="12"/>' +
    '<circle cx="' + cx + '" cy="' + cy + '" r="11" fill="' + c.accent + '" stroke="none"/></g></g>');
  return {
    html: html,
    choreo: function (plan, id, win) {
      var base = '[data-m-ov="' + id + '"] ', a = win.at + 0.1, run = Math.min(1.7, win.hold - win.at - 0.95);
      overlayFade(plan, id, win.at, win.hold);
      plan.add(id + ".hand", base + '[data-m="hand"]', { at: a, dur: run, from: { rotate: 0 }, to: { rotate: 720 }, rest: { rotate: 0 }, ease: "in-quad", origin: "center", delay: 0 });
      plan.add(id + ".arc", base + '[data-m="stroke"]', { at: a, dur: run, from: { dash: 0 }, to: { dash: 1 }, rest: { dash: 1 }, ease: "in-quad", delay: 0 });
      plan.add(id + ".ring", base + '[data-m="ring"]', {
        at: a + run, dur: 0.14, from: { scale: 1 }, to: { scale: 1.07 }, ease: "out-quad", origin: "center", delay: 0, then: [{ dt: 0.28, to: { scale: 1 }, ease: "in-out-quad" }]
      });
    }
  };
}

/* ---- dots: a dotted map that lights up from one edge (spread, reach) ---- */
function dotField(rtl) {
  var pts = [], row, col, x, y, ex, ey, ox = rtl ? 700 : 184, oy = 130;
  for (row = 0; row < 9; row++) {
    for (col = 0; col < 29; col++) {
      x = 24 + col * 30 + (row % 2) * 15; y = 22 + row * 32;
      ex = (x - 442) / 425; ey = (y - 150) / 136;
      if (ex * ex + ey * ey > 1) continue;
      if (Math.sin(x * 0.021 + 1.3) * Math.cos(y * 0.037 + 0.4) > 0.7) continue;      // holes: seas and gaps, fixed pattern
      pts.push({ x: x, y: y, d: Math.hypot(x - ox, y - oy) });
    }
  }
  pts.sort(function (a, b) { return a.d - b.d || a.x - b.x || a.y - b.y; });
  return pts;
}

function makeDots(o) {
  var c = o.colors, pts = dotField(o.rtl), base = "", lit = "";
  pts.forEach(function (p, i) {
    base += '<circle cx="' + num1(p.x) + '" cy="' + num1(p.y) + '" r="4.5" fill="' + c.muted + '" stroke="none" opacity="0.4"/>';
    lit += '<circle data-m="dot" data-m-i="' + i + '" cx="' + num1(p.x) + '" cy="' + num1(p.y) + '" r="7.5" fill="' + c.accent + '" stroke="none"/>';
  });
  return {
    html: svgWrap(base + lit), count: pts.length,
    choreo: function (plan, id, win) {
      overlayFade(plan, id, win.at, win.hold);
      plan.add(id + ".dots", '[data-m-ov="' + id + '"] [data-m="dot"]', {
        at: win.at + 0.12, dur: 0.4, from: { scale: 0, opacity: 0 }, rest: { scale: 1, opacity: 1 }, ease: "out-back", origin: "center", delay: 0,
        stagger: { each: Math.min(0.014, 1.25 / Math.max(1, pts.length)) }
      });
    }
  };
}

/* ---- bars: five bars grow from a baseline (growth, results) ---- */
function makeBars(o) {
  var c = o.colors, heights = [64, 104, 146, 196, 256], w = 96, gap = 44, x0 = (MV_W - (5 * w + 4 * gap)) / 2, bars = "", i, x;
  for (i = 0; i < 5; i++) {
    x = o.rtl ? x0 + (4 - i) * (w + gap) : x0 + i * (w + gap);
    bars += '<rect data-m="bar" data-m-i="' + i + '" x="' + num1(x) + '" y="' + (286 - heights[i]) + '" width="' + w + '" height="' + heights[i] + '" rx="12" fill="' + (i === 4 ? c.accent : c.muted) + '" stroke="none"' + (i === 4 ? "" : ' opacity="0.55"') + "/>";
  }
  return {
    html: svgWrap(bars + '<path d="M0 290H' + MV_W + '" stroke="' + c.ink + '" stroke-width="5"/>'),
    choreo: function (plan, id, win) {
      overlayFade(plan, id, win.at, win.hold);
      plan.add(id + ".bars", '[data-m-ov="' + id + '"] [data-m="bar"]', {
        at: win.at + 0.15, dur: 0.6, from: { scaleY: 0 }, rest: { scaleY: 1 }, ease: "out-expo", origin: "bottom", delay: 0, stagger: { each: 0.13 }
      });
    }
  };
}

/* ---- coins: a stack that builds up (money, price, cost) ---- */
function makeCoins(o) {
  var c = o.colors, coins = "", i, y, off;
  for (i = 0; i < 6; i++) {
    y = 258 - i * 38; off = (i % 2 ? 10 : -10) * (o.rtl ? -1 : 1);
    coins += '<rect data-m="coin" data-m-i="' + i + '" x="' + num1(MV_W / 2 - 130 + off) + '" y="' + y + '" width="260" height="34" rx="17" fill="' + c.accent + '" stroke="' + c.ink + '" stroke-width="6"/>';
  }
  return {
    html: svgWrap(coins),
    choreo: function (plan, id, win) {
      overlayFade(plan, id, win.at, win.hold);
      plan.add(id + ".coins", '[data-m-ov="' + id + '"] [data-m="coin"]', {
        at: win.at + 0.1, dur: 0.55, from: { y: -230, opacity: 0 }, rest: { y: 0, opacity: 1 }, ease: "out-back", delay: 0, stagger: { each: 0.14 }
      });
    }
  };
}

/* ---- check: a ring closes, a tick is drawn (a decision, a verdict, a fix) ---- */
function makeCheck(o) {
  var c = o.colors, cx = MV_W / 2, cy = 150;
  var tick = o.rtl ? "M" + (cx + 52) + " " + (cy + 4) + "L" + (cx + 14) + " " + (cy + 44) + "L" + (cx - 56) + " " + (cy - 38) : "M" + (cx - 52) + " " + (cy + 4) + "L" + (cx - 14) + " " + (cy + 44) + "L" + (cx + 56) + " " + (cy - 38);
  return {
    html: svgWrap('<g data-m="ring"><circle data-m="stroke" data-m-i="0" pathLength="1" cx="' + cx + '" cy="' + cy + '" r="112" stroke="' + c.ink + '" stroke-width="12" transform="rotate(-90 ' + cx + " " + cy + ')"/>' +
      '<path data-m="stroke" data-m-i="1" pathLength="1" d="' + tick + '" stroke="' + c.accent + '" stroke-width="18"/></g>'),
    choreo: function (plan, id, win) {
      var base = '[data-m-ov="' + id + '"] ';
      overlayFade(plan, id, win.at, win.hold);
      plan.add(id + ".ring", base + '[data-m="stroke"][data-m-i="0"]', { at: win.at + 0.1, dur: 0.6, from: { dash: 0 }, to: { dash: 1 }, rest: { dash: 1 }, ease: "in-out-quad", delay: 0 });
      plan.add(id + ".tick", base + '[data-m="stroke"][data-m-i="1"]', { at: win.at + 0.62, dur: 0.4, from: { dash: 0 }, to: { dash: 1 }, rest: { dash: 1 }, ease: "out-cubic", delay: 0 });
      plan.add(id + ".pop", base + '[data-m="ring"]', {
        at: win.at + 1.0, dur: 0.14, from: { scale: 1 }, to: { scale: 1.06 }, ease: "out-quad", origin: "center", delay: 0, then: [{ dt: 0.26, to: { scale: 1 }, ease: "in-out-quad" }]
      });
    }
  };
}

/* ---- spark: twelve rays burst from a point (news, launches, ideas) ---- */
function makeSpark(o) {
  var c = o.colors, cx = MV_W / 2, cy = 150, rays = "", i, a, r0, r1;
  for (i = 0; i < 12; i++) {
    a = i * Math.PI / 6 + Math.PI / 12; r0 = 54; r1 = i % 2 ? 108 : 138;
    rays += '<path data-m="stroke" data-m-i="' + i + '" pathLength="1" d="M' + num1(cx + Math.sin(a) * r0) + " " + num1(cy - Math.cos(a) * r0) + "L" + num1(cx + Math.sin(a) * r1) + " " + num1(cy - Math.cos(a) * r1) +
      '" stroke="' + (i % 2 ? c.muted : c.accent) + '" stroke-width="11"/>';
  }
  return {
    html: svgWrap(rays + '<circle data-m="core" cx="' + cx + '" cy="' + cy + '" r="26" fill="' + c.accent + '" stroke="none"/>'),
    choreo: function (plan, id, win) {
      var base = '[data-m-ov="' + id + '"] ';
      overlayFade(plan, id, win.at, win.hold);
      plan.add(id + ".core", base + '[data-m="core"]', { at: win.at + 0.1, dur: 0.4, from: { scale: 0 }, rest: { scale: 1 }, ease: "out-back", origin: "center", delay: 0 });
      plan.add(id + ".rays", base + '[data-m="stroke"]', { at: win.at + 0.28, dur: 0.5, from: { dash: 0 }, to: { dash: 1 }, rest: { dash: 1 }, ease: "out-cubic", delay: 0, stagger: { each: 0.035 } });
    }
  };
}

var METAPHOR_BUILDERS = {
  heartbeat: { make: makeHeartbeat, label: { ar: "نبض القلب", en: "Heartbeat" }, topics: ["mistakes"] },
  clock: { make: makeClock, label: { ar: "ساعة تتسارع", en: "Racing clock" }, topics: ["urgency"] },
  dots: { make: makeDots, label: { ar: "نقاط على خريطة", en: "Map dots" }, topics: ["spread"] },
  bars: { make: makeBars, label: { ar: "أعمدة صاعدة", en: "Rising bars" }, topics: ["growth"] },
  coins: { make: makeCoins, label: { ar: "عملات متراصّة", en: "Coin stack" }, topics: ["money"] },
  check: { make: makeCheck, label: { ar: "علامة صح", en: "Check mark" }, topics: ["decision"] },
  spark: { make: makeSpark, label: { ar: "شرارة", en: "Spark burst" }, topics: ["news", "story"] }
};

/** Public registry (CS.motion.metaphors): id -> { id, label, topics, svg, make }. `svg` is the default LTR drawing. */
function metaphorRegistry() {
  var out = {}, id;
  for (id in METAPHOR_BUILDERS) {
    out[id] = { id: id, label: METAPHOR_BUILDERS[id].label, topics: METAPHOR_BUILDERS[id].topics, svg: METAPHOR_BUILDERS[id].make({ rtl: false, colors: DEFAULT_COLORS }).html, make: METAPHOR_BUILDERS[id].make };
  }
  return out;
}

  /* ---- file: recipes.js ---- */
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

  /* ---- file: build.js ---- */
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
  tl.counters = []; tl.overlays = [];
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
  var T = tl.times, entering = tl.tracks.filter(function (t) { return t.from && t.from.opacity === 0; });
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
  if (recipe.id !== "none") recipe.build(ctx, P);
  tl = {
    v: 1, recipe: recipe.id, feel: opts.feel === "calm" || opts.feel === "story" ? opts.feel : recipe.feel, seed: ctx.seed,
    duration: seconds, fps: FPS, frames: Math.round(seconds * FPS), times: times, tracks: P.tracks, counters: P.counters
  };
  if (P.overlays.length) tl.overlays = P.overlays;
  if (P.metaphor) tl.metaphor = P.metaphor;
  if (P.mode) tl.mode = P.mode;
  if (resolved.fallbackFrom) tl.fallbackFrom = resolved.fallbackFrom;
  alignEntrance(tl);
  if (opts.reducedMotion) reduceTimeline(tl);
  return tl;
}

  /* ---- file: player.js ---- */
/*
 * CS.motion · mount(): a live player for the Studio's Motion screen.
 * It drives the same engine the exporter uses (inline styles, driver "style"), so what the user previews is what gets exported.
 */

function mountPlayer(slideEl, timeline, opts) {
  opts = opts || {};
  var engine = hfEngine().attach(slideEl, timeline, { driver: "style" });
  var duration = timeline.duration, fps = timeline.fps || FPS, frames = timeline.frames || Math.round(duration * fps);
  var st = { t: 0, playing: false, loop: opts.loop !== false, raf: 0, last: 0, destroyed: false };
  var player = {
    get duration() { return duration; },
    get fps() { return fps; },
    get frames() { return frames; },
    get time() { return st.t; },
    set time(v) { player.seek(v); },
    get playing() { return st.playing; },
    get loop() { return st.loop; },
    set loop(v) { st.loop = !!v; },
    onframe: null,
    seek: function (t) {
      if (st.destroyed) return;
      st.t = clampNum(Number(t) || 0, 0, duration);
      engine.seek(st.t);
      emitFrame();
    },
    seekFrame: function (i) { player.seek(clampNum(Math.round(i), 0, frames - 1) / fps); },
    play: function () {
      if (st.destroyed || st.playing) return;
      if (st.t >= duration) st.t = 0;
      st.playing = true; st.last = 0;
      st.raf = requestAnimationFrame(tick);
    },
    pause: function () { st.playing = false; if (st.raf) cancelAnimationFrame(st.raf); st.raf = 0; },
    toggle: function () { if (st.playing) player.pause(); else player.play(); },
    poster: function () { player.seek(0); },
    destroy: function () {
      if (st.destroyed) return;
      player.pause(); st.destroyed = true; engine.destroy();
    }
  };

  function emitFrame() {
    if (typeof player.onframe === "function") player.onframe(st.t);
    if (typeof CS.emit === "function") CS.emit("cs:motion-frame", { t: st.t });
  }

  function tick(now) {
    if (!st.playing) return;
    var dt = st.last ? (now - st.last) / 1000 : 0;
    st.last = now;
    st.t += Math.min(dt, 0.1);
    if (st.t >= duration) {
      if (st.loop) st.t = st.t % duration;
      else { st.t = duration; engine.seek(duration); emitFrame(); player.pause(); return; }
    }
    engine.seek(st.t);
    emitFrame();
    st.raf = requestAnimationFrame(tick);
  }

  engine.seek(0);
  if (opts.autoplay) player.play();
  return player;
}

  /* ---- file: api.js ---- */
/*
 * CS.motion · public API (CONTRACT 4.6).
 *
 *   recipes / list() / register()   what can be chosen
 *   recommend(spec)                 topic -> recipe (+ metaphor and a bilingual reason)
 *   build(slideEl, opts)            slide -> Timeline (data)
 *   mount(slideEl, timeline)        live player
 *   tween                           ease / lerp / counter (the engine's own helpers)
 *   metaphors                       the drawn symbols of the story recipe
 */

function registerRecipe(recipe) {
  if (!recipe || typeof recipe.id !== "string" || typeof recipe.build !== "function") throw motionError("E_USAGE", "A recipe needs an id and a build(ctx) function.");
  defineRecipe({ id: recipe.id, label: recipe.label || { ar: recipe.id, en: recipe.id }, feel: recipe.feel === "story" ? "story" : "calm", ships: recipe.ships || "1.0", topics: recipe.topics, requires: recipe.requires }, function (ctx, P) {
    var out = recipe.build(ctx) || {};
    (out.tracks || []).forEach(function (t) { P.tracks.push(t); });
    (out.counters || []).forEach(function (c) { P.counters.push(c); });
    (out.overlays || []).forEach(function (o) { P.overlays.push(o); });
  });
  CS.motion.recipes[recipe.id] = metaOf(RECIPE_REGISTRY[recipe.id]);
}

function metaOf(r) { return { id: r.id, label: r.label, feel: r.feel, ships: r.ships, topics: r.topics.slice(), requires: r.requires.slice() }; }

function listRecipes(opts) {
  var out = [], id;
  for (id in RECIPE_REGISTRY) if (!(opts && opts.shippedOnly) || isShipped(RECIPE_REGISTRY[id])) out.push(metaOf(RECIPE_REGISTRY[id]));
  return out;
}

var publicRecipes = {};
Object.keys(RECIPE_REGISTRY).forEach(function (id) { publicRecipes[id] = metaOf(RECIPE_REGISTRY[id]); });

CS.motion = CS.motion || {};
CS.motion.FPS = FPS;
CS.motion.TIMES = DEFAULT_TIMES;
CS.motion.alias = ALIASES;
CS.motion.recipes = publicRecipes;
CS.motion.register = registerRecipe;
CS.motion.list = listRecipes;
CS.motion.recommend = recommendMotion;
CS.motion.detectTopics = detectTopics;
CS.motion.build = buildTimeline;
CS.motion.validate = validateTimeline;
CS.motion.mount = mountPlayer;
CS.motion.metaphors = metaphorRegistry();
CS.motion.tween = {
  ease: function (name, t) { return hfEngine().ease(name, t); },
  lerp: function (a, b, t) { return a + (b - a) * t; },
  counter: function (from, to, t, decimals) { return hfEngine().counter(from, to, t, decimals); }
};
})();
