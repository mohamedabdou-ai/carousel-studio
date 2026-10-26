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
