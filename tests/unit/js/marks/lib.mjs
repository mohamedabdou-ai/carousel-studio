// tests/unit/js/marks/lib.mjs · reference geometry for the hand-authored mark library (SK/data/art/marks.json, spec 3.5).
// Pure functions, no DOM, no randomness: parse the library paths, map a template onto a target, taper a centreline into a
// brush polygon and build the svg path strings. src/art/marks.js (A9) ports the same maths; the look-dev slides (L1-L4) and
// the sheet renderer use this file as the reference. Exports are small and independent so they can be copied.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const MARKS_PATH = resolve(here, "../../../../plugins/carousel-studio/skills/carousel-design/data/art/marks.json");

export function loadMarks(path = MARKS_PATH) {
  return JSON.parse(readFileSync(path, "utf8"));
}

/* ---- numbers ----------------------------------------------------------------------------------------------- */

export function num(v, digits = 1) {
  const k = 10 ** digits;
  const r = Math.round(v * k) / k;
  return Object.is(r, -0) ? "0" : String(r);
}

/* ---- path grammar: absolute M L C Q Z only ------------------------------------------------------------------ */

const ARITY = { M: 2, L: 2, C: 6, Q: 4 };

/** Parse path data into subpaths: { start:[x,y], segs:[{t:"L",p}|{t:"C",c1,c2,p}|{t:"Q",c,p}], closed }. */
export function parsePath(d) {
  const tokens = String(d).match(/[A-Za-z]|-?\d*\.?\d+(?:e-?\d+)?/g) || [];
  const subs = [];
  let cur = null;
  let i = 0;
  while (i < tokens.length) {
    const cmd = tokens[i++];
    if (cmd === "Z") { if (cur) cur.closed = true; continue; }
    if (!(cmd in ARITY)) throw new Error("path grammar: unsupported command " + cmd);
    const read = () => {
      const n = ARITY[cmd], a = [];
      for (let k = 0; k < n; k++) {
        const v = Number(tokens[i++]);
        if (!Number.isFinite(v)) throw new Error("path grammar: bad number in " + cmd);
        a.push(v);
      }
      return a;
    };
    if (cmd === "M") {
      const a = read();
      cur = { start: [a[0], a[1]], segs: [], closed: false };
      subs.push(cur);
    } else {
      if (!cur) throw new Error("path grammar: draw before M");
      do {
        const a = read();
        if (cmd === "L") cur.segs.push({ t: "L", p: [a[0], a[1]] });
        else if (cmd === "C") cur.segs.push({ t: "C", c1: [a[0], a[1]], c2: [a[2], a[3]], p: [a[4], a[5]] });
        else cur.segs.push({ t: "Q", c: [a[0], a[1]], p: [a[2], a[3]] });
      } while (i < tokens.length && /^[-\d.]/.test(tokens[i]));
    }
  }
  return subs;
}

export function formatPath(subs, digits = 1) {
  const f = (p) => num(p[0], digits) + " " + num(p[1], digits);
  let out = "";
  for (const s of subs) {
    out += "M" + f(s.start);
    for (const g of s.segs) {
      if (g.t === "L") out += "L" + f(g.p);
      else if (g.t === "C") out += "C" + f(g.c1) + " " + f(g.c2) + " " + f(g.p);
      else out += "Q" + f(g.c) + " " + f(g.p);
    }
    if (s.closed) out += "Z";
  }
  return out;
}

/** Map every point of the subpaths through f([x,y]) -> [x,y]. Beziers are affine invariant, so control points map directly. */
export function mapSubs(subs, f) {
  return subs.map((s) => ({
    start: f(s.start),
    closed: s.closed,
    segs: s.segs.map((g) => {
      if (g.t === "L") return { t: "L", p: f(g.p) };
      if (g.t === "C") return { t: "C", c1: f(g.c1), c2: f(g.c2), p: f(g.p) };
      return { t: "Q", c: f(g.c), p: f(g.p) };
    }),
  }));
}

function evalSeg(p0, g, t) {
  const u = 1 - t;
  if (g.t === "L") return [p0[0] + (g.p[0] - p0[0]) * t, p0[1] + (g.p[1] - p0[1]) * t];
  if (g.t === "C") {
    const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
    return [a * p0[0] + b * g.c1[0] + c * g.c2[0] + d * g.p[0], a * p0[1] + b * g.c1[1] + c * g.c2[1] + d * g.p[1]];
  }
  const a = u * u, b = 2 * u * t, c = t * t;
  return [a * p0[0] + b * g.c[0] + c * g.p[0], a * p0[1] + b * g.c[1] + c * g.p[1]];
}

/** Dense points along one subpath (per segment steps), in order. */
export function flatten(sub, steps = 24) {
  const pts = [sub.start.slice()];
  let p0 = sub.start;
  for (const g of sub.segs) {
    const n = g.t === "L" ? 1 : steps;
    for (let k = 1; k <= n; k++) pts.push(evalSeg(p0, g, k / n));
    p0 = g.p;
  }
  return pts;
}

/** Bounding box of the drawn curve (sampled), not of the control polygon. */
export function curveBox(subs, steps = 32) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of subs) for (const p of flatten(s, steps)) {
    if (p[0] < x0) x0 = p[0];
    if (p[0] > x1) x1 = p[0];
    if (p[1] < y0) y0 = p[1];
    if (p[1] > y1) y1 = p[1];
  }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}

/** Resample a dense polyline to n points evenly spaced by arc length. Returns { pts, length }. */
export function resample(dense, n) {
  const cum = [0];
  for (let i = 1; i < dense.length; i++) cum.push(cum[i - 1] + Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1]));
  const length = cum[cum.length - 1];
  if (length === 0) return { pts: [dense[0].slice()], length: 0 };
  const pts = [];
  let j = 1;
  for (let k = 0; k < n; k++) {
    const target = (length * k) / (n - 1);
    while (j < cum.length - 1 && cum[j] < target) j++;
    const span = cum[j] - cum[j - 1] || 1;
    const f = (target - cum[j - 1]) / span;
    pts.push([dense[j - 1][0] + (dense[j][0] - dense[j - 1][0]) * f, dense[j - 1][1] + (dense[j][1] - dense[j - 1][1]) * f]);
  }
  return { pts, length };
}

/* ---- the brush: a centreline tapered into one closed polygon -------------------------------------------------- */

/** Width factor at t in [0,1] from a [[t, w], ...] profile, eased between control points. */
export function profileAt(profile, t) {
  if (t <= profile[0][0]) return profile[0][1];
  for (let i = 1; i < profile.length; i++) {
    if (t <= profile[i][0]) {
      const a = profile[i - 1], b = profile[i];
      const f = (t - a[0]) / (b[0] - a[0] || 1);
      const e = f * f * (3 - 2 * f);
      return a[1] + (b[1] - a[1]) * e;
    }
  }
  return profile[profile.length - 1][1];
}

/**
 * Taper one subpath into a closed polygon (array of points). width is the full stroke width in the caller's unit,
 * profile the width factors along the arc length, samples the number of centreline samples (0 = from the length).
 */
export function brushPolygon(sub, width, profile, samples = 0) {
  const dense = flatten(sub, 24);
  const len0 = resample(dense, 2).length;
  const n = samples > 0 ? samples : Math.max(12, Math.min(90, Math.ceil(len0 / 6)));
  const { pts } = resample(dense, n);
  const left = [], right = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    let tx = b[0] - a[0], ty = b[1] - a[1];
    const m = Math.hypot(tx, ty) || 1;
    tx /= m; ty /= m;
    const half = (width * profileAt(profile, i / (n - 1))) / 2;
    left.push([pts[i][0] - ty * half, pts[i][1] + tx * half]);
    right.push([pts[i][0] + ty * half, pts[i][1] - tx * half]);
  }
  return left.concat(right.reverse());
}

export function polygonPath(poly, digits = 1) {
  return "M" + poly.map((p) => num(p[0], digits) + " " + num(p[1], digits)).join("L") + "Z";
}

export function polygonArea(poly) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

/* ---- placing a template ------------------------------------------------------------------------------------- */

/** Content size of a template inside its 100 x 100 box, from the aspect (w / h). */
export function contentSize(aspect) {
  return aspect >= 1 ? { w: 100, h: 100 / aspect } : { w: 100 * aspect, h: 100 };
}

/**
 * Map a template onto a target and return subpaths in the caller's pixels.
 *   fit "box"     target { x, y, w, h }: the 100 x 100 box is stretched to the rect (underline, circle, strike, kashida)
 *   fit "uniform" target { x, y, w, h }: the content is scaled uniformly to fit the rect and centred (doodles)
 *   fit "pair"    target { from:[x,y], to:[x,y] }: a similarity that maps template tail -> from and tip -> to (arrows)
 * opts.rtl mirrors x for box and uniform fits (logical x: 0 is the reading start); opts.flipY mirrors y; opts.bow for pair
 * mirrors the arrow across its own axis so it bows the other way.
 */
export function place(mark, target, opts = {}) {
  const subs = parsePath(mark.d);
  let f;
  if (mark.fit === "pair") {
    const [tx, ty] = mark.tail, [hx, hy] = mark.tip;
    const [fx, fy] = target.from, [ex, ey] = target.to;
    const sdx = hx - tx, sdy = hy - ty, tdx = ex - fx, tdy = ey - fy;
    const s = Math.hypot(tdx, tdy) / (Math.hypot(sdx, sdy) || 1);
    const rot = Math.atan2(tdy, tdx) - Math.atan2(sdy, sdx);
    const c = Math.cos(rot) * s, sn = Math.sin(rot) * s;
    const sl = Math.hypot(sdx, sdy) || 1, ux = sdx / sl, uy = sdy / sl;
    f = (p) => {
      let dx = p[0] - tx, dy = p[1] - ty;
      if (opts.bow) {
        /* reflect across the tail -> tip axis: the ends stay put and the arrow bows the other way */
        const k = 2 * (dx * ux + dy * uy);
        dx = k * ux - dx;
        dy = k * uy - dy;
      }
      return [fx + dx * c - dy * sn, fy + dx * sn + dy * c];
    };
  } else if (mark.fit === "uniform") {
    const cs = contentSize(mark.aspect);
    const s = Math.min(target.w / cs.w, target.h / cs.h);
    /* the content sits centred in the 100 x 100 box, so the box is centred on the rect */
    const ox = target.x + target.w / 2 - 50 * s;
    const oy = target.y + target.h / 2 - 50 * s;
    f = (p) => [ox + (opts.rtl ? 100 - p[0] : p[0]) * s, oy + (opts.flipY ? 100 - p[1] : p[1]) * s];
  } else {
    const sx = target.w / 100, sy = target.h / 100;
    f = (p) => [target.x + (opts.rtl ? 100 - p[0] : p[0]) * sx, target.y + (opts.flipY ? 100 - p[1] : p[1]) * sy];
  }
  return mapSubs(subs, f);
}

/** Stroke or brush width in px for a placed mark, from the library ratios and the geometric mean of the target size. */
export function widthFor(lib, form, target) {
  const rule = lib[form];
  const w = target.from ? Math.hypot(target.to[0] - target.from[0], target.to[1] - target.from[1]) : Math.sqrt(target.w * target.h);
  return Math.max(rule.wMin, Math.min(rule.wMax, w * rule.wRatio));
}

/**
 * Render one mark. form "line" -> { form, d, width } (stroke, round caps and joins); form "brush" -> { form, d } (fill, one
 * closed polygon per stroke); a "fill" mark (the kashida bar) is already a polygon whatever the form.
 */
export function renderMark(lib, mark, target, opts = {}) {
  const subs = place(mark, target, opts);
  if (mark.form === "fill") return { form: "fill", d: formatPath(subs) };
  const form = opts.form || "line";
  const mult = form === "brush" ? (mark.bw || 1) : (mark.lw || 1);
  const width = (opts.width || widthFor(lib, form, target)) * mult;
  if (form === "line") return { form, d: formatPath(subs), width };
  const profile = mark.profile || lib.brush.profile;
  const polys = subs.map((s) => brushPolygon(s, width, profile));
  return { form, d: polys.map((p) => polygonPath(p)).join(""), width, polys };
}

/** A small svg string for one mark (sheet and look-dev use). */
export function markSvg(lib, mark, target, { form = "line", color = "#111", rtl = false, flipY = false, bow = false, width, pad = 0, size } = {}) {
  const r = renderMark(lib, mark, target, { form, rtl, flipY, bow, width });
  const attrs = r.form === "line"
    ? `fill="none" stroke="${color}" stroke-width="${num(r.width)}" stroke-linecap="round" stroke-linejoin="round"`
    : `fill="${color}"`;
  const body = `<path d="${r.d}" ${attrs}/>`;
  if (!size) return body;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size.w}" height="${size.h}" viewBox="${-pad} ${-pad} ${size.w + 2 * pad} ${size.h + 2 * pad}">${body}</svg>`;
}

/* ---- the seeded affine jitter of spec 3.5 (reference; A9 uses CS.core.canon.fnv1a64 for the same hash) ------------ */

export function fnv1a64(str) {
  let h = 0xcbf29ce484222325n;
  for (const b of Buffer.from(String(str), "utf8")) {
    h ^= BigInt(b);
    h = (h * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return h;
}

/** rotation within 3 degrees, scale within 4 percent, skew within 2 degrees, a seeded offset within +-offset px. */
export function jitter(seed, offset = 6) {
  const h = fnv1a64(seed);
  const unit = (shift) => Number((h >> BigInt(shift)) & 0xffffn) / 65535 * 2 - 1;
  return { rot: unit(0) * 3, scale: 1 + unit(16) * 0.04, skew: unit(32) * 2, dx: unit(48) * offset, dy: unit(8) * offset };
}

/** Apply a jitter to placed subpaths about the centre of their box. */
export function applyJitter(subs, j) {
  const b = curveBox(subs, 8);
  const cx = b.x0 + b.w / 2, cy = b.y0 + b.h / 2;
  const r = (j.rot * Math.PI) / 180, k = Math.tan((j.skew * Math.PI) / 180);
  const c = Math.cos(r), s = Math.sin(r);
  return mapSubs(subs, (p) => {
    let x = (p[0] - cx) * j.scale, y = (p[1] - cy) * j.scale;
    x += y * k;
    return [cx + x * c - y * s + j.dx, cy + x * s + y * c + j.dy];
  });
}
