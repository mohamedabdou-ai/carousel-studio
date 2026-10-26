// tests/unit/js/marks/author.mjs · the hand-drawn source of the mark library (spec 3.5) and the tool that writes marks.json.
// Every mark is a list of pen strokes: key points the pen passes through, drawn in a natural canvas (any size). The tool
// smooths them into cubic Beziers, normalises the result into the 100 x 100 template box and writes the compact JSON.
// Nothing here runs at export time and nothing is random: the irregularity of a circle or a wave is the authored point
// list itself, so a mark that looks wrong is redrawn here and rebuilt, never jittered.
//   node tests/unit/js/marks/author.mjs            write SK/data/art/marks.json
//   node tests/unit/js/marks/author.mjs --check    exit 1 if the file on disk differs from the source
//   node tests/unit/js/marks/author.mjs --out <f>  write somewhere else
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MARKS_PATH, curveBox, flatten, formatPath, mapSubs, brushPolygon, polygonPath, resample, num } from "./lib.mjs";

/* ---- the library header: families, brush recipe, default widths --------------------------------------------- */

export const HEADER = {
  schemaVersion: 1,
  dataVersion: "1.1.0",
  box: 100,
  grammar: "d uses absolute M L C Z only. x is logical (0 = reading start, 100 = reading end): mirror x for rtl. fit box: stretch the 100 x 100 box to the target rect. fit uniform: scale the content (size from aspect, centred in the box) to fit. fit pair: similarity that maps tail to the start point and tip to the end point.",
  families: ["arrow", "circle", "underline", "strike", "doodle", "kashida"],
  line: { wRatio: 0.032, wMin: 3, wMax: 7, cap: "round", join: "round" },
  brush: {
    wRatio: 0.062,
    wMin: 7,
    wMax: 19,
    profile: [[0, 0.34], [0.07, 0.78], [0.2, 1], [0.62, 0.96], [0.84, 0.6], [1, 0.05]],
    note: "taper each stroke of d (or of centreline when present) into one closed polygon: width = base x profile(arc length fraction); the base is wRatio x sqrt(w x h) of the placed rect, clamped to wMin..wMax",
  },
};

/* ---- smoothing: key points -> cubic Beziers ------------------------------------------------------------------- */

const unit = (a, b) => {
  const dx = b[0] - a[0], dy = b[1] - a[1], m = Math.hypot(dx, dy) || 1;
  return [dx / m, dy / m];
};
const mix = (u, v, f) => {
  const x = u[0] * (1 - f) + v[0] * f, y = u[1] * (1 - f) + v[1] * f, m = Math.hypot(x, y) || 1;
  return [x / m, y / m];
};

/** pts: [x, y] smooth or [x, y, 1] corner. Returns { start, segs } (open stroke). k is the handle length / chord. */
export function smooth(pts, k = 0.36) {
  const n = pts.length;
  if (n < 2) throw new Error("a stroke needs two points");
  const dIn = [], dOut = [];
  for (let i = 0; i < n; i++) {
    const corner = pts[i][2] === 1;
    if (i === 0) {
      dOut[i] = n > 2 ? mix(unit(pts[0], pts[1]), unit(pts[0], pts[2]), 0.35) : unit(pts[0], pts[1]);
      dIn[i] = dOut[i];
    } else if (i === n - 1) {
      dIn[i] = n > 2 ? mix(unit(pts[n - 2], pts[n - 1]), unit(pts[n - 3], pts[n - 1]), 0.35) : unit(pts[n - 2], pts[n - 1]);
      dOut[i] = dIn[i];
    } else if (corner) {
      dIn[i] = unit(pts[i - 1], pts[i]);
      dOut[i] = unit(pts[i], pts[i + 1]);
    } else {
      dIn[i] = dOut[i] = unit(pts[i - 1], pts[i + 1]);
    }
  }
  const segs = [];
  for (let i = 0; i < n - 1; i++) {
    const a = pts[i], b = pts[i + 1], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (n === 2) { segs.push({ t: "L", p: [b[0], b[1]] }); continue; }
    segs.push({
      t: "C",
      c1: [a[0] + dOut[i][0] * len * k, a[1] + dOut[i][1] * len * k],
      c2: [b[0] - dIn[i + 1][0] * len * k, b[1] - dIn[i + 1][1] * len * k],
      p: [b[0], b[1]],
    });
  }
  return { start: [pts[0][0], pts[0][1]], segs, closed: false };
}

/* ---- authoring helpers -------------------------------------------------------------------------------------- */

const rot = (v, deg) => {
  const r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  return [v[0] * c - v[1] * s, v[0] * s + v[1] * c];
};

/** The two barbs of an arrow head, drawn outside -> tip, so both strokes end in the sharp tip. */
function barbs(tip, from, o) {
  const dir = unit(from, tip), back = [-dir[0], -dir[1]];
  const one = (deg, len, bow) => {
    const v = rot(back, deg);
    const outer = [tip[0] + v[0] * len, tip[1] + v[1] * len];
    const mid = [(outer[0] + tip[0]) / 2 + -v[1] * bow, (outer[1] + tip[1]) / 2 + v[0] * bow];
    return [outer, mid, tip];
  };
  return [one(o.a, o.la, o.ba || 0), one(-o.b, o.lb, o.bb || 0)];
}

/** Points on a hand-drawn ellipse: a start angle, a sweep (negative = counter-clockwise on screen), a radial drift and wobble. */
function loop(o) {
  const out = [];
  const steps = Math.max(2, Math.round(Math.abs(o.sweep) / Math.abs(o.step)));
  const tilt = ((o.tilt || 0) * Math.PI) / 180, ct = Math.cos(tilt), st = Math.sin(tilt);
  for (let i = 0; i <= steps; i++) {
    const f = i / steps, th = ((o.a0 + o.sweep * f) * Math.PI) / 180;
    const r = (o.r0 + (o.r1 - o.r0) * f) * o.wob[i % o.wob.length];
    const x = o.rx * r * Math.cos(th), y = o.ry * r * Math.sin(th);
    out.push([o.cx + (o.dx || 0) * f + x * ct - y * st, o.cy + (o.dy || 0) * f + x * st + y * ct]);
  }
  return out;
}

/** Short dashes along a smooth curve; the last dash ends at the curve end. Each dash is a 3-point stroke. */
function dashes(curvePts, dash, gap) {
  const dense = flatten({ start: smooth(curvePts).start, segs: smooth(curvePts).segs, closed: false }, 24);
  const { pts, length } = resample(dense, 400);
  const at = (s) => pts[Math.max(0, Math.min(pts.length - 1, Math.round((s / length) * (pts.length - 1))))];
  const out = [];
  let s = 0, i = 0;
  while (s < length - 2) {
    let e = Math.min(length, s + dash[i % dash.length]);
    if (length - e < 11) e = length;
    out.push([at(s), at((s + e) / 2), at(e)]);
    s = e + gap[i % gap.length];
    i++;
  }
  return out;
}

/** A star-like or rayed polygon: corners are corner points, with an optional gentle bow on each side. */
function sides(corners, bow) {
  const out = [[corners[0][0], corners[0][1], 1]];
  for (let i = 1; i < corners.length; i++) {
    const a = corners[i - 1], b = corners[i], dx = b[0] - a[0], dy = b[1] - a[1], m = Math.hypot(dx, dy) || 1;
    const sgn = bow[i % bow.length];
    out.push([(a[0] + b[0]) / 2 - (dy / m) * sgn, (a[1] + b[1]) / 2 + (dx / m) * sgn]);
    out.push([b[0], b[1], 1]);
  }
  return out;
}

const polar = (cx, cy, r, deg) => [cx + r * Math.cos((deg * Math.PI) / 180), cy + r * Math.sin((deg * Math.PI) / 180)];

/* ---- the marks ------------------------------------------------------------------------------------------------ */
// def: { id, family, fit, use, strokes: [pts...], tail?, tip?, bw?, lw?, form?, profile? }. Natural canvas sizes in the comments.

function arrowDefs() {
  const out = [];
  const arrow = (id, use, shaft, hd, extra = {}) => {
    const tip = shaft[shaft.length - 1];
    const strokes = [shaft];
    for (const s of extra.more || []) strokes.push(s);
    for (const b of barbs(tip, extra.headFrom || shaft[shaft.length - 2], hd)) strokes.push(b);
    out.push({ id, family: "arrow", fit: "pair", use, strokes, tail: extra.tail || shaft[0], tip, bw: extra.bw, lw: extra.lw });
  };

  // curve: a long, gently bowed swoosh (canvas 300 x 150)
  arrow("arrow-curve", "from a sentence to the anchor across the slide",
    [[12, 118], [48, 129], [96, 125], [148, 105], [198, 73], [238, 46], [274, 25]],
    { a: 27, b: 31, la: 47, lb: 41, ba: 3, bb: -2 });

  // loop: a cursive loop-the-loop in the shaft (canvas 310 x 140)
  arrow("arrow-loop", "playful link, creator and notebook",
    [[8, 112], [46, 118], [88, 114], [124, 104], [152, 96], [176, 80], [186, 52], [172, 24], [146, 14], [122, 28], [120, 58], [140, 82],
      [172, 94], [212, 90], [250, 74], [290, 56]],
    { a: 29, b: 26, la: 42, lb: 46, ba: -3, bb: 2 }, { bw: 0.8 });

  // double: the shaft retraced (two strokes), one head (canvas 290 x 130)
  arrow("arrow-double", "an emphasised pointer, marker feel",
    [[10, 82], [66, 64], [132, 55], [196, 63], [242, 82], [274, 104]],
    { a: 30, b: 28, la: 46, lb: 42, ba: 2, bb: -3 },
    { more: [[[34, 94], [86, 77], [140, 68], [198, 74], [240, 92], [270, 101]]], bw: 0.82 });

  // scribble: a coiled shaft (canvas 290 x 120)
  arrow("arrow-scribble", "energetic pointer, notebook",
    [[8, 70], [26, 50], [45, 90], [65, 48], [86, 91], [107, 50], [128, 88], [150, 54], [171, 84], [196, 63], [232, 61], [270, 58]],
    { a: 28, b: 27, la: 40, lb: 44, ba: 2, bb: 2 }, { bw: 0.72, lw: 0.9 });

  // hook: up, over and down onto the anchor below (canvas 230 x 170)
  arrow("arrow-hook", "an arch from the text over to an anchor at the same height, on the end side",
    [[14, 160], [15, 112], [32, 62], [74, 30], [130, 21], [182, 40], [207, 78], [212, 114], [211, 140]],
    { a: 29, b: 27, la: 40, lb: 38, ba: 2, bb: -2 });

  // down: a short, slightly wavering down arrow (canvas 70 x 150)
  arrow("arrow-down", "directly below, one step further",
    [[22, 6], [28, 38], [20, 74], [26, 108], [22, 142]],
    { a: 30, b: 26, la: 36, lb: 33, ba: 2, bb: -2 });

  // dashed trail: dabs along a curve, head at the end (canvas 270 x 130)
  {
    const curve = [[10, 104], [62, 116], [120, 104], [174, 76], [218, 46], [254, 28]];
    const dabs = dashes(curve, [30, 27, 33, 25, 30, 28, 34, 26, 30], [14, 16, 13, 17, 14, 15, 16, 13]);
    const tip = curve[curve.length - 1];
    const strokes = dabs.concat(barbs(tip, curve[curve.length - 2], { a: 28, b: 30, la: 40, lb: 36, ba: 2, bb: -2 }));
    out.push({ id: "arrow-dashed", family: "arrow", fit: "pair", use: "a path, a journey, a soft hint", strokes, tail: curve[0], tip, bw: 0.55, lw: 0.9 });
  }

  // bracket: a curly brace over a group, the arrow leaves from its point (canvas 250 x 130)
  arrow("arrow-bracket", "one comment for a group of lines",
    [[50, 64], [112, 60], [172, 66], [222, 60]],
    { a: 29, b: 27, la: 38, lb: 36, ba: 2, bb: -2 },
    { more: [[[6, 6], [24, 10], [32, 26], [33, 47], [37, 59], [50, 64, 1], [37, 69], [33, 81], [33, 102], [24, 118], [6, 122]]], tail: [50, 64] });
  return out;
}

function circleDefs() {
  const o = [];
  // scribble ellipse: counter-clockwise, overshoots its start, drifts outward (about 236 x 108)
  o.push({ id: "circle-scribble", family: "circle", fit: "box", use: "ring a word or an object",
    strokes: [loop({ cx: 120, cy: 58, rx: 106, ry: 46, a0: -58, sweep: -418, step: -27, r0: 0.97, r1: 1.11, tilt: -3,
      wob: [1, 1.03, 0.985, 1.04, 1.012, 0.97, 1.02, 1.045, 0.99, 1.0, 0.975, 1.03, 1.01, 0.99, 1.02] })] });
  // rough rectangle, one stroke, rounded corners, the top retraced at the end (about 224 x 100)
  o.push({ id: "circle-rough-rect", family: "circle", fit: "box", use: "frame a line, a number or a block",
    strokes: [[[186, 9], [132, 6], [72, 8], [30, 11], [11, 24], [8, 58], [12, 90], [30, 102], [80, 105], [150, 102], [206, 99], [222, 86], [224, 50], [219, 22], [200, 8], [168, 5], [140, 8]]] });
  // double loop: one stroke, two turns, the second tighter (about 230 x 106)
  o.push({ id: "circle-double", family: "circle", fit: "box", use: "emphasis that insists",
    strokes: [loop({ cx: 118, cy: 56, rx: 106, ry: 47, a0: -35, sweep: -700, step: -30, r0: 1.07, r1: 0.86, tilt: -5, dx: 5, dy: 1,
      wob: [1, 0.98, 1.035, 1.0, 0.97, 1.03, 1.0, 1.04, 0.985, 1.015, 0.97, 1.025] })] });
  // open ring: a C with a gap at the top end and an outward flick (about 118 x 108)
  o.push({ id: "circle-open", family: "circle", fit: "box", use: "ring that stays light, for icons and numbers",
    strokes: [loop({ cx: 60, cy: 54, rx: 56, ry: 50, a0: -64, sweep: -300, step: -30, r0: 1.0, r1: 1.12, tilt: 4,
      wob: [1, 1.025, 0.985, 1.03, 0.99, 1.02, 0.97, 1.015, 1.0, 1.02, 1.0] })] });
  return o;
}

function underlineDefs() {
  return [
    // straight: a little droop in the middle, a rise and a flick at the end (canvas 300 x 26)
    { id: "underline-straight", family: "underline", fit: "box", use: "quiet emphasis under one span",
      strokes: [[[3, 16], [44, 14.5], [110, 13], [180, 13.5], [240, 11], [282, 7.5], [297, 5]]] },
    // wavy: the wave is uneven on purpose (canvas 300 x 26)
    { id: "underline-wavy", family: "underline", fit: "box", use: "playful emphasis, creator and notebook", bw: 0.75,
      strokes: [[[3, 17], [24, 7], [50, 21], [77, 9], [105, 22], [135, 8], [166, 21], [198, 10], [229, 20], [262, 9], [297, 15]]] },
    // double: a long stroke and a shorter one under it, offset (canvas 300 x 30)
    { id: "underline-double", family: "underline", fit: "box", use: "strong emphasis, exam and notebook", bw: 0.6,
      strokes: [[[4, 8], [60, 6], [130, 7], [200, 5.5], [262, 6], [296, 4]], [[30, 22], [90, 24], [160, 23], [226, 21.5], [276, 20]]] },
    // brush: a smile-shaped swash, made to be drawn with the brush (canvas 300 x 30)
    { id: "underline-brush", family: "underline", fit: "box", use: "marker swash, creator", bw: 1.25,
      strokes: [[[2, 6], [34, 16], [90, 23], [160, 24], [226, 18], [272, 9], [298, 2]]] },
  ];
}

function strikeDefs() {
  return [
    // strike-through: one line with a slight rise and overshoot (canvas 300 x 20)
    { id: "strike-line", family: "strike", fit: "box", use: "cross out the wrong option",
      strokes: [[[2, 14], [76, 11.5], [150, 9], [226, 6.5], [298, 3]]] },
    // cross-out: two curved strokes, the second longer and bowed more (canvas 100 x 92)
    { id: "strike-cross", family: "strike", fit: "box", use: "cross out a block or a thing",
      strokes: [[[4, 9], [34, 33], [62, 58], [95, 86]], [[97, 3], [66, 32], [36, 62], [17, 82], [3, 95]]] },
    // scribble-out: a tight, sharp zigzag that blacks a word out, heights and slants uneven (canvas 300 x 60)
    { id: "strike-scribble", family: "strike", fit: "box", use: "scribble out a word, rect = the word box", bw: 0.55, lw: 0.8,
      strokes: [[[3, 44, 1], [19, 6, 1], [33, 52, 1], [52, 10, 1], [66, 56, 1], [86, 4, 1], [99, 50, 1], [120, 9, 1], [134, 55, 1], [154, 5, 1], [168, 52, 1],
        [190, 11, 1], [203, 57, 1], [224, 6, 1], [238, 50, 1], [259, 12, 1], [271, 47, 1], [297, 20, 1]]] },
    // double slash: two quick strokes across (canvas 300 x 44)
    { id: "strike-double", family: "strike", fit: "box", use: "firm cancel, two quick lines",
      strokes: [[[2, 22], [90, 14], [200, 9], [298, 4]], [[16, 42], [110, 35], [210, 29], [284, 22]]] },
  ];
}

function doodleDefs() {
  const o = [];
  // squiggle: a lively wave (canvas 200 x 40)
  o.push({ id: "squiggle", family: "doodle", fit: "uniform", use: "divider or filler line, creator and notebook",
    strokes: [[[2, 23], [18, 7], [36, 35], [56, 8], [77, 33], [98, 10], [119, 35], [141, 12], [161, 31], [181, 14], [198, 24]]] });

  // sparkle: a four-point star in one stroke, concave sides (canvas 100 x 100)
  o.push({ id: "sparkle", family: "doodle", fit: "uniform", use: "shine on the lift edge of an anchor",
    strokes: [[[51, 1, 1], [58, 41], [99, 49, 1], [59, 60], [50, 99, 1], [41, 59], [1, 52, 1], [42, 41], [51, 1, 1]]] });

  // star: a pentagram in one stroke with bowed sides and a small overshoot (canvas 100 x 96)
  {
    const R = [48, 46, 49, 47, 48], base = -96;
    const corners = [0, 1, 2, 3, 4, 5].map((k) => polar(50, 52, R[k % 5], base + k * 144));
    corners.push([corners[1][0] * 0.35 + corners[0][0] * 0.65, corners[1][1] * 0.35 + corners[0][1] * 0.65]);
    o.push({ id: "star", family: "doodle", fit: "uniform", use: "rating, praise, a favourite", strokes: [sides(corners, [1.6, -1.4, 1.8, -1.2, 1.5, -1])] });
  }

  // tick: a check with a lead-in and an upward flick (canvas 104 x 98)
  o.push({ id: "tick", family: "doodle", fit: "uniform", use: "done, correct, yes",
    strokes: [[[5, 52], [19, 62], [33, 78], [41, 93, 1], [54, 66], [76, 33], [97, 8], [104, 4]]] });

  // heart: one stroke, starts at the point, overshoots when it closes (canvas 100 x 96)
  o.push({ id: "heart", family: "doodle", fit: "uniform", use: "love, saves, care",
    strokes: [[[50, 95], [27, 76], [8, 51], [7, 24], [25, 8], [44, 15], [50, 32, 1], [58, 15], [77, 8], [94, 24], [93, 51], [75, 76], [53, 97], [45, 90]]] });

  // burst: 14 short rays around an empty centre, lengths alternate (canvas 100 x 100)
  {
    const lens = [1, 0.72, 0.94, 0.7, 1, 0.76, 0.92, 0.68, 1, 0.74, 0.96, 0.71, 0.93, 0.75];
    const wob = [0, 2.5, -1.5, 3, -2, 1, -3, 2, 0, -2.5, 2, -1, 3, -2];
    const rays = [];
    for (let k = 0; k < 14; k++) {
      const ang = k * (360 / 14) + wob[k] - 90;
      const a = polar(50, 50, 31 + (k % 3), ang), b = polar(50, 50, 31 + (k % 3) + 18 * lens[k], ang + wob[(k + 5) % 14] * 0.2);
      rays.push([a, b]);
    }
    o.push({ id: "burst", family: "doodle", fit: "uniform", use: "behind a sticker or a numeral", bw: 0.85, strokes: rays });
  }

  // spark ticks: three short strokes fanning from a point (canvas 100 x 92)
  {
    const rays = [[-58, 34, 46], [-4, 30, 62], [48, 34, 42]].map(([ang, r0, len]) => [polar(10, 46, r0, ang), polar(10, 46, r0 + len, ang)]);
    o.push({ id: "spark-ticks", family: "doodle", fit: "uniform", use: "a small shine, at most two per slide", bw: 0.8, strokes: rays });
  }
  return o;
}

/** The kashida bar: a filled polygon, flat at the reading start, a rising tapered flourish at the end (canvas 260 x 26). */
function kashidaDef() {
  const centre = [[0, 24], [58, 23.4], [128, 22], [188, 19.5], [224, 14], [252, 4]];
  const profile = [[0, 1], [0.7, 1], [0.86, 0.58], [1, 0.04]];
  return { id: "kashida-bar", family: "kashida", fit: "box", form: "fill", use: "underline or divider for an Arabic title", strokes: [centre], profile, thickness: 8.5 };
}

export function definitions() {
  return [...arrowDefs(), ...circleDefs(), ...underlineDefs(), ...strikeDefs(), ...doodleDefs(), kashidaDef()];
}

/* ---- normalise and serialise -------------------------------------------------------------------------------- */

function strokeSubs(def) {
  return def.strokes.map((pts) => smooth(pts));
}

function build(def) {
  let subs = strokeSubs(def);
  let polySubs = null;
  if (def.form === "fill") {
    const poly = brushPolygon(subs[0], def.thickness, def.profile, 26);
    polySubs = [{ start: poly[0], segs: poly.slice(1).map((p) => ({ t: "L", p })), closed: true }];
  }
  const shown = polySubs || subs;
  const box = curveBox(shown, 32);
  let f, aspect = box.w / box.h;
  if (def.fit === "box") {
    f = (p) => [((p[0] - box.x0) / box.w) * 100, ((p[1] - box.y0) / box.h) * 100];
  } else {
    const s = 100 / Math.max(box.w, box.h);
    const ox = (100 - box.w * s) / 2, oy = (100 - box.h * s) / 2;
    f = (p) => [(p[0] - box.x0) * s + ox, (p[1] - box.y0) * s + oy];
  }
  const outSubs = mapSubs(shown, f);
  const mark = { id: def.id, family: def.family, fit: def.fit, aspect: Math.round(aspect * 100) / 100, d: formatPath(outSubs, 1) };
  if (def.use) mark.use = def.use;
  if (def.tail) { mark.tail = f(def.tail).map((v) => Math.round(v * 10) / 10); mark.tip = f(def.tip).map((v) => Math.round(v * 10) / 10); }
  if (def.form) mark.form = def.form;
  if (def.form === "fill") {
    mark.centreline = formatPath(mapSubs(subs, f), 1);
    mark.profile = def.profile;
  }
  if (def.bw) mark.bw = def.bw;
  if (def.lw) mark.lw = def.lw;
  return mark;
}

export function buildMarks() {
  const marks = definitions().map(build);
  return { ...HEADER, marks };
}

/** Compact, stable JSON: the header on a few lines, one mark per line. */
export function serialise(lib) {
  const { marks, ...head } = lib;
  const headLines = Object.entries(head).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`);
  const markLines = marks.map((m) => "    " + JSON.stringify(m));
  return "{\n" + headLines.join(",\n") + ',\n  "marks": [\n' + markLines.join(",\n") + "\n  ]\n}\n";
}

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const args = process.argv.slice(2);
  const outIdx = args.indexOf("--out");
  const out = outIdx >= 0 ? resolve(args[outIdx + 1]) : MARKS_PATH;
  const text = serialise(buildMarks());
  if (args.includes("--check")) {
    const disk = existsSync(out) ? readFileSync(out, "utf8") : "";
    if (disk !== text) { console.error("marks.json differs from the authored source; run: node tests/unit/js/marks/author.mjs"); process.exit(1); }
    console.log("marks.json matches the source (" + Buffer.byteLength(text) + " bytes)");
  } else {
    mkdirSync(dirname(out), { recursive: true });
    const tmp = out + ".tmp";
    writeFileSync(tmp, text, "utf8");
    renameSync(tmp, out);
    console.log("wrote " + out + " (" + Buffer.byteLength(text) + " bytes, " + buildMarks().marks.length + " marks)");
  }
}
