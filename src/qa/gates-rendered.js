/* Carousel Studio · cs-qa · rendered gates
 *
 * D1 (preview size), D2 layout, D3 sizes, D4 contrast, D5 Arabic rules,
 * D6 composition, D7 default look, T1 thumbnail and B1 (rendered part).
 * They read the real slide DOM (.cs-slide, CONTRACT 5.1), so every length is
 * converted back to canvas pixels with the slide's own scale. Text under
 * aria-hidden (background, decoration) is never measured.
 */

const ZONE_NAMES = {
  "top-left": { ar: "أعلى اليسار", en: "top-left" },
  "top-right": { ar: "أعلى اليمين", en: "top-right" },
  "bottom-left": { ar: "أسفل اليسار", en: "bottom-left" },
  "bottom-right": { ar: "أسفل اليمين", en: "bottom-right" }
};
const CHROME_SLOTS = ["handle", "meta", "counter", "swipe", "savepill", "rail"];
const chromeNode = (S, name) => S.el.querySelector(name === "rail" ? ".cs-rail" : '[data-slot="' + name + '"]');
const chromeHidden = (el, S, name) => hiddenWithin(name === "rail" ? el.parentElement : el, S.el) ||
  getComputedStyle(el).display === "none" || getComputedStyle(el).visibility === "hidden";
const chromeBand = (S, el, p) => el.closest(".cs-header") ? p.header :
  p.innerFooter && S.tokens && S.tokens.art && (p.coverTypes || ["cover", "poster"]).indexOf(S.type) < 0 ? p.innerFooter : p.footer;
const INVISIBLE_CODES = new Set([0x00a0, 0x200b, 0x200c, 0x200d, 0x200e, 0x200f, 0x2060, 0xfe0f, 0x0a, 0x09, 0x20, 0x202f]);

/* ------------------------------------------------------------ colour maths */

const SRGB_LUT = (() => {
  const t = new Float64Array(256);
  for (let i = 0; i < 256; i++) {
    const c = i / 255;
    t[i] = c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
  return t;
})();

const lumOf = (r, g, b) => 0.2126 * SRGB_LUT[r] + 0.7152 * SRGB_LUT[g] + 0.0722 * SRGB_LUT[b];
const lumRatio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
const toHex2 = (n) => ("0" + Math.round(n).toString(16)).slice(-2);
const rgbHex = (c) => "#" + toHex2(c.r) + toHex2(c.g) + toHex2(c.b);

/** Also reads computed color-mix(in srgb ...), serialized as color(srgb ...). */
function parseCssColor(s) {
  if (!s) return null;
  s = String(s).trim().toLowerCase();
  if (s === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
  if (/^color\(srgb\s/.test(s)) {
    const parts = s.slice(11, -1).trim().split(/\s*\/\s*|\s+/);
    if (!s.endsWith(")") || parts.length < 3 || parts.length > 4 ||
        parts.some((v) => !/^[+-]?(?:[0-9]+\.?[0-9]*|\.[0-9]+)(?:e[+-]?[0-9]+)?%?$/.test(v))) return null;
    const n = parts.map((v) => parseFloat(v) / (v.endsWith("%") ? 100 : 1));
    if (!n.every(Number.isFinite)) return null;
    const clamp = (v) => Math.max(0, Math.min(1, v));
    return { r: Math.round(clamp(n[0]) * 255), g: Math.round(clamp(n[1]) * 255), b: Math.round(clamp(n[2]) * 255), a: clamp(n[3] === undefined ? 1 : n[3]) };
  }
  let m = /^rgba?\(\s*([0-9.]+)[ ,]+([0-9.]+)[ ,]+([0-9.]+)(?:[ ,/]+([0-9.%]+))?\s*\)$/.exec(s);
  if (m) {
    let a = 1;
    if (m[4] !== undefined) a = /%$/.test(m[4]) ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    return { r: Math.round(+m[1]), g: Math.round(+m[2]), b: Math.round(+m[3]), a };
  }
  m = /^#([0-9a-f]{3,8})$/.exec(s);
  if (m) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = h.split("").map((c) => c + c).join("");
    if (h.length === 6 || h.length === 8) {
      return {
        r: parseInt(h.slice(0, 2), 16),
        g: parseInt(h.slice(2, 4), 16),
        b: parseInt(h.slice(4, 6), 16),
        a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1
      };
    }
  }
  return null;
}

/** `top` composited over an opaque `bottom`. */
function colorOver(top, bottom) {
  const a = top.a === undefined ? 1 : top.a;
  return {
    r: Math.round(top.r * a + bottom.r * (1 - a)),
    g: Math.round(top.g * a + bottom.g * (1 - a)),
    b: Math.round(top.b * a + bottom.b * (1 - a)),
    a: 1
  };
}

const hexToRgb = (h) => parseCssColor(h) || { r: 255, g: 255, b: 255, a: 1 };
const fmt1 = (n) => (Math.round(n * 10) / 10).toFixed(1);

function chromaOf(c) {
  const col = CS.core && CS.core.color;
  if (col && typeof col.toOklch === "function") return col.toOklch(rgbHex(c)).C;
  const mx = Math.max(c.r, c.g, c.b);
  const mn = Math.min(c.r, c.g, c.b);
  return (mx - mn) / 255 / 2.5;
}

/* ------------------------------------------------------------- DOM helpers */

function hiddenWithin(el, root) {
  for (let e = el; e; e = e.parentElement) {
    if (e.getAttribute && e.getAttribute("aria-hidden") === "true") return true;
    if (e === root) break;
  }
  return false;
}

/** Element key in the CONTRACT vocabulary (s03.title, s03.bullets.2 …). */
function domKey(S, el) {
  const id = S.id;
  const keyed = el.closest ? el.closest("[data-slot-key]") : null;
  if (keyed && S.el.contains(keyed)) return keyed.getAttribute("data-slot-key");
  const li = el.closest ? el.closest(".cs-bullet") : null;
  if (li && S.el.contains(li)) {
    const i = li.getAttribute("data-m-i");
    return id + ".bullets." + (i !== null ? i : Array.prototype.indexOf.call(li.parentElement.children, li));
  }
  const side = el.closest ? el.closest(".cs-side") : null;
  if (side && S.el.contains(side)) {
    const i = side.getAttribute("data-side");
    const idx = i !== null ? i : Array.prototype.indexOf.call(side.parentElement.children, side);
    return id + ".sides." + idx + (el.closest(".cs-side-label") ? ".label" : "");
  }
  const slot = el.closest ? el.closest("[data-slot]") : null;
  if (slot && S.el.contains(slot)) return id + "." + slot.getAttribute("data-slot");
  return id;
}

function slideInfo(sr, ctx) {
  const el = sr.el;
  const box = el.getBoundingClientRect();
  const cv = ctx.spec.canvas || {};
  const W = cv.w || el.offsetWidth || 1080;
  const H = cv.h || el.offsetHeight || 1440;
  const scale = box.width / (el.offsetWidth || W) || 1;
  const id = sr.id || el.getAttribute("data-cs-slide") || "";
  const slide = (ctx.spec.slides || []).find((s) => s.id === id) || {};
  const S = {
    sr,
    el,
    id,
    slide,
    type: slide.type || el.getAttribute("data-type") || "",
    box,
    W,
    H,
    scale,
    tokens: sr.tokens || ctx.tokens || null,
    rel(r) {
      return { x: (r.left - box.left) / scale, y: (r.top - box.top) / scale, w: r.width / scale, h: r.height / scale };
    }
  };
  return S;
}

/** One entry per element that directly holds visible text. */
function collectTexts(S) {
  if (S._texts) return S._texts;
  const items = new Map();
  const walker = document.createTreeWalker(S.el, NodeFilter.SHOW_TEXT, null);
  let n;
  while ((n = walker.nextNode())) {
    const v = n.nodeValue;
    if (!/\S/.test(v)) continue;
    const el = n.parentElement;
    if (!el || /^(STYLE|SCRIPT|TEMPLATE)$/.test(el.tagName) || hiddenWithin(el, S.el)) continue;
    let it = items.get(el);
    if (!it) {
      it = { el, key: domKey(S, el), text: "", rects: [], cs: getComputedStyle(el) };
      items.set(el, it);
    }
    // Inline boxes follow the font's content area; the line box is what the
    // layout reserves, so a taller content area is trimmed to the line height.
    const lh = parseFloat(it.cs.lineHeight);
    const range = document.createRange();
    range.selectNodeContents(n);
    const rects = [];
    Array.prototype.forEach.call(range.getClientRects(), (r) => {
      if (r.width <= 0.5 || r.height <= 0.5) return;
      const rr = S.rel(r);
      if (lh > 0 && rr.h > lh) {
        rr.y += (rr.h - lh) / 2;
        rr.h = lh;
      }
      rects.push(rr);
    });
    if (!rects.length) {
      if (!it.text) items.delete(el);
      continue;
    }
    it.text += v;
    rects.forEach((r) => it.rects.push(r));
  }
  S._texts = Array.from(items.values()).map((it) => {
    it.chrome = !!it.el.closest(".cs-header, .cs-footer");
    const roleEl = it.el.closest("[data-role]");
    /* a side label sits inside the "sides" slot (role body) but is set small by design */
    it.role = it.chrome ? "micro" : it.el.closest(".cs-side-label") ? "small" : roleEl ? roleEl.getAttribute("data-role") : "";
    it.fontPx = parseFloat(it.cs.fontSize) || 0;
    it.weight = parseInt(it.cs.fontWeight, 10) || 400;
    return it;
  });
  return S._texts;
}

const intersects = (a, b, tol) => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > tol && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > tol;

/** Group word rects into visual lines (same vertical centre ± half a line). */
function groupLines(rects) {
  const sorted = rects.slice().sort((a, b) => a.y + a.h / 2 - (b.y + b.h / 2));
  const lines = [];
  sorted.forEach((r) => {
    const cy = r.y + r.h / 2;
    const last = lines[lines.length - 1];
    if (last && Math.abs(cy - last.cy) < Math.min(r.h, last.h) * 0.5) {
      last.rects.push(r);
      last.cy = (last.cy * (last.rects.length - 1) + cy) / last.rects.length;
    } else {
      lines.push({ cy, h: r.h, rects: [r] });
    }
  });
  return lines.map((l) => {
    const x0 = Math.min.apply(null, l.rects.map((r) => r.x));
    const x1 = Math.max.apply(null, l.rects.map((r) => r.x + r.w));
    return { cy: l.cy, words: l.rects.length, width: x1 - x0, rects: l.rects };
  });
}

/* ------------------------------------------------------------------- D1 */

function gateD1Render(rc, out) {
  if (!active(rc, "D1.render-size")) return;
  rc.S.forEach((S) => {
    const ew = S.W;
    const eh = S.H;
    const w = Math.round(S.el.offsetWidth);
    const h = Math.round(S.el.offsetHeight);
    if (w !== ew || h !== eh) emit(rc, rc.out, "D1.render-size", { slide: S.id, el: S.id, vars: { w, h, ew, eh } });
  });
}

/* ------------------------------------------------------------------- D2 */

function gateD2(rc) {
  const out = rc.out;
  const tolOver = param(rc, "D2.overflow").tolerancePx;
  rc.S.forEach((S) => {
    const texts = collectTexts(S);
    const reported = new Set();
    const once = (id, key, extra) => {
      const k = id + "|" + key + "|" + (extra || "");
      if (reported.has(k)) return false;
      reported.add(k);
      return true;
    };

    if (active(rc, "D2.overflow", S.slide)) {
      const slots = (S.sr.fit && S.sr.fit.slots) || {};
      Object.keys(slots).forEach((key) => {
        if (slots[key] && slots[key].status === "overflow" && once("D2.overflow", key)) {
          emit(rc, out, "D2.overflow", { slide: S.id, el: key, vars: { el: key } });
        }
      });
      texts.forEach((it) => {
        const slot = it.chrome || it.el.closest(".cs-side-label") ? null : it.el.closest("[data-slot][data-kind]"); /* a side label rides the edge of its card by design */
        if (!slot || !S.el.contains(slot) || slot.getAttribute("data-kind") === "media") return;
        const sr = S.rel(slot.getBoundingClientRect());
        if (sr.w <= 0 || sr.h <= 0) return;
        const over = it.rects.reduce(
          (m, r) => Math.max(m, r.x + r.w - (sr.x + sr.w), sr.x - r.x, r.y + r.h - (sr.y + sr.h), sr.y - r.y),
          0
        );
        const key = domKey(S, slot);
        if (over > tolOver && once("D2.overflow", key)) emit(rc, out, "D2.overflow", { slide: S.id, el: key, vars: { el: key } });
      });
      texts.forEach((it) => {
        const beyond = it.rects.some((r) => r.x < -tolOver || r.y < -tolOver || r.x + r.w > S.W + tolOver || r.y + r.h > S.H + tolOver);
        if (beyond && once("D2.overflow", it.key)) emit(rc, out, "D2.overflow", { slide: S.id, el: it.key, vars: { el: it.key } });
      });
    }

    if (active(rc, "D2.outside-content", S.slide)) {
      const p = param(rc, "D2.outside-content");
      texts.forEach((it) => {
        const b = it.chrome ? (p.chromeBox || p.box) : p.box;
        const bad = it.rects.some(
          (r) => r.x < b.x - p.tolerancePx || r.y < b.y - p.tolerancePx || r.x + r.w > b.x + b.w + p.tolerancePx || r.y + r.h > b.y + b.h + p.tolerancePx
        );
        if (bad && once("D2.outside-content", it.key)) emit(rc, out, "D2.outside-content", { slide: S.id, el: it.key, vars: { el: it.key } });
      });
    }

    if (active(rc, "D2.keep-out", S.slide)) {
      const p = param(rc, "D2.keep-out");
      texts.forEach((it) => {
        (p.zones || []).forEach((z) => {
          if (it.rects.some((r) => intersects(r, z, p.tolerancePx)) && once("D2.keep-out", it.key, z.id)) {
            const nm = ZONE_NAMES[z.id] || { ar: z.id, en: z.id };
            emit(rc, out, "D2.keep-out", { slide: S.id, el: it.key, vars: { el: it.key, zoneAr: nm.ar, zoneEn: nm.en } });
          }
        });
      });
    }

    if (active(rc, "D2.chrome-band", S.slide)) {
      const p = param(rc, "D2.chrome-band");
      CHROME_SLOTS.forEach((name) => {
        const el = chromeNode(S, name);
        if (!el || chromeHidden(el, S, name)) return;
        const r = S.rel(el.getBoundingClientRect());
        if (r.w <= 0 || r.h <= 0) return;
        const inHeader = !!el.closest(".cs-header");
        const band = chromeBand(S, el, p);
        const t = p.tolerancePx;
        let bad = r.x < band.x - t || r.x + r.w > band.x + band.w + t || r.y < band.y - t || r.y + r.h > band.y + band.h + t;
        if (!inHeader && band.itemMaxHeightPx && r.h > band.itemMaxHeightPx + t) bad = true;
        if (bad && once("D2.chrome-band", name)) emit(rc, out, "D2.chrome-band", { slide: S.id, el: S.id + "." + name, vars: { el: S.id + "." + name } });
      });
    }

    if (active(rc, "D2.accent-count", S.slide) && S.tokens) {
      const p = param(rc, "D2.accent-count");
      const palette = new Set();
      const roles = S.tokens.roles || {};
      ["bg", "surface", "ink", "inkMuted"].forEach((k) => roles[k] && palette.add(String(roles[k]).toLowerCase()));
      const dv = S.tokens.derived || {};
      ["onAccent", "line"].forEach((k) => dv[k] && palette.add(String(dv[k]).toLowerCase()));
      const seen = new Set();
      const consider = (css) => {
        const c = parseCssColor(css);
        if (!c || c.a === 0) return;
        const hex = rgbHex(c);
        if (palette.has(hex) || chromaOf(c) < p.minChroma) return;
        seen.add(hex);
      };
      texts.forEach((it) => {
        consider(it.cs.color);
        if (it.el.closest("mark")) consider(getComputedStyle(it.el.closest("mark")).backgroundColor);
        if (/underline/.test(it.cs.textDecorationLine || "")) consider(it.cs.textDecorationColor);
      });
      if (seen.size > p.max) emit(rc, out, "D2.accent-count", { slide: S.id, el: S.id, vars: { count: seen.size, max: p.max } });
    }
  });

  if (active(rc, "D2.chrome-drift") && rc.S.length > 1) {
    const p = param(rc, "D2.chrome-drift"), maxPx = p.maxPx;
    CHROME_SLOTS.forEach((name) => {
      const rows = [];
      rc.S.forEach((S) => {
        const el = chromeNode(S, name);
        if (!el || chromeHidden(el, S, name)) return;
        const r = S.rel(el.getBoundingClientRect());
        const band = chromeBand(S, el, p) || { x: 0, y: 0, w: S.W, h: S.H };
        r.x -= band.x; r.y -= band.y;
        if (r.w > 0 && r.h > 0) rows.push({ S, r, band });
      });
      if (rows.length < 2) return;
      const spread = (f) => Math.max.apply(null, rows.map(f)) - Math.min.apply(null, rows.map(f));
      const at = [(o) => o.r.x, (o) => o.r.x + o.r.w - o.band.w, (o) => o.r.x + o.r.w / 2 - o.band.w / 2, (o) => o.r.y, (o) => o.r.y + o.r.h - o.band.h, (o) => o.r.y + o.r.h / 2 - o.band.h / 2], sp = at.map(spread);
      const dx = Math.min(sp[0], sp[1], sp[2]), dy = Math.min(sp[3], sp[4], sp[5]);
      if (dx > maxPx || dy > maxPx) {
        // Blame the outlier on the steadiest anchor of the drifting axis.
        const ax = dx > maxPx ? [0, 1, 2] : [3, 4, 5], g = at[ax.reduce((b, i) => (sp[i] < sp[b] ? i : b), ax[0])];
        const mid = rows.map(g).sort((a, b) => a - b)[Math.floor(rows.length / 2)];
        const worst = rows.slice().sort((a, b) => Math.abs(g(b) - mid) - Math.abs(g(a) - mid))[0];
        emit(rc, out, "D2.chrome-drift", { slide: worst.S.id, el: worst.S.id + "." + name, vars: { el: name, max: maxPx } });
      }
    });
  }
}

/* ------------------------------------------------------------------- D3 */

function gateD3(rc) {
  const out = rc.out;
  rc.S.forEach((S) => {
    const floors = (S.tokens && S.tokens.floors) || {};
    const bodyMin = floors.body || param(rc, "D3.body-floor").min;
    const metaMin = floors.meta || param(rc, "D3.meta-floor").min;
    const heroMin = floors.hero || param(rc, "D3.hero-floor").min;
    const seen = new Set();
    collectTexts(S).forEach((it) => {
      if (!it.fontPx) return;
      let id = null;
      let min = 0;
      if (it.role === "hero" && (S.type === "cover" || S.type === "poster")) {
        id = "D3.hero-floor";
        min = heroMin;
      } else if (it.role === "body") {
        id = "D3.body-floor";
        min = bodyMin;
      } else if (it.role === "small" || it.role === "micro" || it.chrome) {
        id = "D3.meta-floor";
        min = metaMin;
      }
      if (CS.visual?.free?.active(S.slide) && !it.chrome) { id = it.role === "body" ? "D3.body-floor" : "D3.meta-floor"; min = it.role === "body" ? 42 : 30; }
      const label = it.el.closest('.cs-art-label,[data-slot="art"]');
      const floor = label && Number(it.el.closest('[data-floor]')?.getAttribute('data-floor'));
      if (floor > 0 && Number.isFinite(floor)) min = floor;
      if (!id || !active(rc, id, S.slide) || it.fontPx >= min - 0.01 || seen.has(id + it.key)) return;
      seen.add(id + it.key);
      emit(rc, out, id, { slide: S.id, el: it.key, vars: { el: it.key, px: Math.round(it.fontPx * 10) / 10, min } });
    });
  });
}

/* ------------------------------------------------------------------- D4 */

/** Backgrounds under an element from the DOM: { kind, colors:[rgb] }. */
function domBackground(el, S) {
  let translucent = [];
  let e = el;
  for (;;) {
    const c = getComputedStyle(e);
    const bg = parseCssColor(c.backgroundColor);
    const img = c.backgroundImage || "none";
    if (/url\(/.test(img)) return { kind: "image", colors: [] };
    if (/gradient/.test(img)) {
      const stops = (img.match(/rgba?\([^)]*\)|color\(srgb[^)]*\)|#[0-9a-fA-F]{3,8}/g) || []).map(parseCssColor).filter(Boolean);
      const under = hexToRgb((S.tokens && S.tokens.roles && S.tokens.roles.bg) || "#ffffff");
      if (stops.length) return { kind: "gradient", colors: stops.map((s) => (s.a < 1 ? colorOver(s, under) : s)) };
    }
    if (bg && bg.a > 0) {
      if (bg.a >= 1) return { kind: "solid", colors: [translucent.reduceRight((acc, t) => colorOver(t, acc), bg)] };
      translucent.push(bg);
    }
    if (e === S.el || !e.parentElement) break;
    e = e.parentElement;
  }
  const layer = S.el.querySelector(".cs-bg");
  if (layer && layer !== el) return domBackground(layer, { el: layer, tokens: S.tokens });
  const bgHex = S.tokens && S.tokens.roles && S.tokens.roles.bg;
  return { kind: "solid", colors: [translucent.reduceRight((acc, t) => colorOver(t, acc), hexToRgb(bgHex || "#ffffff"))] };
}

/** Ratios of one text item against the pixels of the text-mask canvas. */
function maskRatios(mask, S, it, fg, painted) {
  const ms = mask.width / S.W;
  const g = mask.getContext("2d", { willReadFrequently: true });
  const fgL = lumOf(fg.r, fg.g, fg.b);
  const ratios = [];
  it.rects.forEach((r) => {
    const x = Math.max(0, Math.floor(r.x * ms));
    const y = Math.max(0, Math.floor(r.y * ms));
    const w = Math.min(mask.width - x, Math.max(1, Math.ceil(r.w * ms)));
    const h = Math.min(mask.height - y, Math.max(1, Math.ceil(r.h * ms)));
    if (w <= 0 || h <= 0) return;
    const d = g.getImageData(x, y, w, h).data;
    const ink = painted && painted.getContext('2d', { willReadFrequently: true }).getImageData(x, y, w, h).data;
    const step = Math.max(1, Math.floor((w * h) / 500));
    for (let p = 0; p < w * h; p += step) {
      const o = p * 4;
      if (d[o + 3] < 8) continue;
      if (ink && Math.max(Math.abs(ink[o] - d[o]), Math.abs(ink[o + 1] - d[o + 1]), Math.abs(ink[o + 2] - d[o + 2])) < 24) continue;
      ratios.push(lumRatio(fgL, lumOf(d[o], d[o + 1], d[o + 2])));
    }
  });
  return ratios;
}

function summarizeRatios(ratios, decile) {
  const s = ratios.slice().sort((a, b) => a - b);
  return {
    min: s[0],
    decile: s[Math.min(s.length - 1, Math.floor(s.length * decile))],
    mean: s.reduce((a, b) => a + b, 0) / s.length
  };
}

/** Contrast of every text item of one slide. Uses CS.paint.textMask when it
 *  exists (pixel path) and the DOM background otherwise. */
async function measureSlide(S, decile) {
  let mask = null;
  const paint = CS.paint;
  if (paint && typeof paint.textMask === "function") {
    try {
      mask = await paint.textMask(S.el);
      mask.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, 1, 1);
    } catch (e) {
      mask = null;
    }
  }
  let painted = null;
  if (mask && paint && typeof paint.toCanvas === 'function') {
    try { painted = await paint.toCanvas(S.el, { scale: 1 }); } catch (e) {}
  }
  const items = [];
  collectTexts(S).forEach((it) => {
    /* the oversized ghost numeral is ornament behind the copy (the item's title carries its meaning): it is meant to be faint */
    if (S.el.getAttribute("data-variant") === "ghost-number" && it.el.closest(".cs-ord")) return;
    const fg0 = parseCssColor(it.cs.color);
    if (!fg0) return;
    let res = null;
    let kind = "dom";
    if (mask) {
      try {
        const rs = maskRatios(mask, S, it, fg0, painted);
        if (rs.length) {
          res = summarizeRatios(rs, decile);
          kind = "pixel";
        }
      } catch (e) {
        res = null;
      }
    }
    if (!res) {
      const bg = domBackground(it.el, S);
      if (bg.kind === "image" || !bg.colors.length) {
        kind = "unknown";
      } else {
        const rs = bg.colors.map((c) => lumRatio(lumOf(fg0.r, fg0.g, fg0.b), lumOf(c.r, c.g, c.b)));
        res = summarizeRatios(rs, 0);
        res.mean = rs.reduce((a, b) => a + b, 0) / rs.length;
        kind = bg.kind;
      }
    }
    items.push({
      key: it.key,
      fontPx: it.fontPx,
      weight: it.weight,
      role: it.role,
      res,
      kind
    });
  });
  return items;
}

function isLargeText(fontPx, weight, p) {
  return fontPx >= p.largeMinPx || (fontPx >= p.largeBoldMinPx && weight >= 700);
}

async function gateD4(rc) {
  const out = rc.out;
  const p = param(rc, "D4.contrast");
  for (let i = 0; i < rc.S.length; i++) {
    const S = rc.S[i];
    if (rc.signal && rc.signal.aborted) throw qaError("E_ABORTED", "QA aborted");
    const items = await measureSlide(S, p.decile);
    const byKey = {};
    items.forEach((it) => {
      const large = isLargeText(it.fontPx, it.weight, p);
      const cur = byKey[it.key];
      if (!cur || (it.res && (!cur.res || it.res.decile < cur.res.decile))) byKey[it.key] = Object.assign({}, it, { large });
    });
    Object.keys(byKey).forEach((key) => {
      const it = byKey[key];
      if (!it.res) {
        if (it.kind === "unknown" && active(rc, "D4.unmeasured", S.slide)) emit(rc, out, "D4.unmeasured", { slide: S.id, el: key, vars: { el: key } });
        return;
      }
      const need = it.large ? p.large : p.body;
      const ratio = it.res.decile;
      const vars = { el: key, ratio: fmt1(ratio), need: fmt1(need) };
      if (ratio < p.hardBlockBelow) {
        if (active(rc, "D4.hard", S.slide)) emit(rc, out, "D4.hard", { slide: S.id, el: key, vars });
      } else if (ratio < need && active(rc, "D4.contrast", S.slide)) {
        emit(rc, out, "D4.contrast", { slide: S.id, el: key, vars });
      }
    });
  }
}

/* ------------------------------------------------------------------- D5 */

function firstFamily(cssFamily) {
  const m = /^\s*(?:"([^"]+)"|'([^']+)'|([^,]+))/.exec(cssFamily || "");
  return m ? (m[1] || m[2] || m[3] || "").trim() : "";
}

/** Loaded faces of `family` (FontFace objects), or null when none are known. */
function loadedFaces(family) {
  const faces = [];
  try {
    document.fonts.forEach((f) => {
      if (firstFamily(f.family) === family && f.status === "loaded") faces.push(f);
    });
  } catch (e) {
    return null;
  }
  return faces.length ? faces : null;
}

const faceUpper = (f) => {
  const m = String(f.weight).match(/[0-9]+/g);
  if (!m) return /bold/.test(String(f.weight)) ? 700 : 400;
  return Math.max.apply(null, m.map(Number));
};

/** True when the engine resolved this family (tokens.fonts) or its face failed
 *  to load, yet no loaded @font-face backs it: the browser is substituting. */
function lacksLoadedFace(rc, family) {
  if (loadedFaces(family)) return false;
  let failed = false;
  try {
    document.fonts.forEach((f) => {
      if (firstFamily(f.family) === family && f.status === "error") failed = true;
    });
  } catch (e) {
    failed = false;
  }
  return failed || fontIdByFamily(rc, family) !== null;
}

function fontIdByFamily(rc, family) {
  const reg = CS.core && CS.core.registry;
  if (!reg || typeof reg.fontCss !== "function") return null;
  const ids = (rc.tokens && rc.tokens.fonts) || [];
  for (let i = 0; i < ids.length; i++) {
    try {
      if (firstFamily(reg.fontCss(ids[i])) === family) return ids[i];
    } catch (e) {
      /* unknown id */
    }
  }
  return null;
}

function gateD5(rc) {
  const out = rc.out;
  const arabicType = TX().arabic;
  let kashidaWords = 0;
  const kashidaSeen = new Set();
  const fontsUsed = new Set();
  const marksBySlot = {};
  rc.S.forEach((S) => {
    const reported = new Set();
    const once = (id, key) => {
      const k = id + "|" + key;
      if (reported.has(k)) return false;
      reported.add(k);
      return true;
    };
    collectTexts(S).forEach((it) => {
      if (!hasArabic(it.text)) return;
      const cs = it.cs;
      const base = { slide: S.id, el: it.key, vars: { el: it.key } };
      const fam = firstFamily(cs.fontFamily);
      fontsUsed.add(fam);

      if (parseFloat(cs.letterSpacing) && active(rc, "D5.letter-spacing", S.slide) && once("D5.letter-spacing", it.key)) emit(rc, out, "D5.letter-spacing", base);
      const justified = cs.textAlign === "justify" || cs.textAlignLast === "justify";
      if (justified && active(rc, "D5.justify", S.slide) && once("D5.justify", it.key)) emit(rc, out, "D5.justify", base);
      if (/italic|oblique/.test(cs.fontStyle) && active(rc, "D5.italic", S.slide) && once("D5.italic", it.key)) emit(rc, out, "D5.italic", base);

      if (active(rc, "D5.font-synthesis", S.slide) && it.weight >= 600) {
        const syn = cs.fontSynthesis || cs.getPropertyValue("font-synthesis") || "";
        const faces = loadedFaces(fam);
        if (/weight/.test(syn) && faces && !faces.some((f) => faceUpper(f) >= 600) && once("D5.font-synthesis", it.key)) {
          emit(rc, out, "D5.font-synthesis", base);
        }
      }

      if (active(rc, "D5.text-opacity", S.slide)) {
        const col = parseCssColor(cs.color);
        let bad = !!(col && col.a < 1);
        for (let e = it.el; e && !bad; e = e.parentElement) {
          if (e.getAttribute && (e.getAttribute("data-m-group") === "opacity" || e.getAttribute("aria-hidden") === "true")) break;
          if (parseFloat(getComputedStyle(e).opacity) < 1) bad = true;
          if (e === S.el) break;
        }
        if (bad && once("D5.text-opacity", it.key)) emit(rc, out, "D5.text-opacity", base);
      }

      if (it.text.indexOf("\u0640") >= 0) {
        it.text.split(/\s+/).forEach((w) => {
          if (w.indexOf("\u0640") < 0) return;
          if (/^[^\u0640]*[\u0644\u0628\u0643]\u0640([^\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\u0640][^\u0640]*)?$/.test(w)) return; // ORTHO-BIDI-001: a clitic before Latin, a digit or a mark
          const id = S.id + "|" + w;
          if (!kashidaSeen.has(id)) {
            kashidaSeen.add(id);
            kashidaWords++;
          }
          const isHeadline = (S.type === "cover" || S.type === "poster") && /\.headline$/.test(it.key);
          if (!isHeadline && active(rc, "D5.kashida-body", S.slide) && once("D5.kashida-body", it.key)) emit(rc, out, "D5.kashida-body", base);
          const kashidaRule = rc.tokens && rc.tokens.decor && rc.tokens.decor.kashida;
          if (kashidaRule && kashidaRule.allowed === false && active(rc, "D5.kashida-preset", S.slide) && once("D5.kashida-preset", it.key)) {
            emit(rc, out, "D5.kashida-preset", base);
          }
          if (arabicType && typeof arabicType.joiningType === "function" && active(rc, "D5.kashida-joining", S.slide)) {
            const cps = Array.from(w);
            for (let i = 0; i < cps.length; i++) {
              if (cps[i] !== "\u0640") continue;
              let a = i - 1;
              while (a >= 0 && (cps[a] === "\u0640" || arabicType.joiningType(cps[a].codePointAt(0)) === "T")) a--;
              let b = i + 1;
              while (b < cps.length && (cps[b] === "\u0640" || arabicType.joiningType(cps[b].codePointAt(0)) === "T")) b++;
              const jb = a >= 0 ? arabicType.joiningType(cps[a].codePointAt(0)) : "U";
              const ja = b < cps.length ? arabicType.joiningType(cps[b].codePointAt(0)) : "U";
              if (!(jb === "D" && (ja === "D" || ja === "R")) && once("D5.kashida-joining", it.key)) {
                emit(rc, out, "D5.kashida-joining", base);
                break;
              }
            }
          }
        });
      }

      if (active(rc, "D5.glyph-missing", S.slide)) {
        const id = fontIdByFamily(rc, fam);
        const reg = CS.core && CS.core.registry;
        if (id && reg && typeof reg.missingGlyphs === "function") {
          try {
            const miss = reg.missingGlyphs(id, it.text).filter((c) => !INVISIBLE_CODES.has(c));
            if (miss.length && once("D5.glyph-missing", it.key)) {
              emit(rc, out, "D5.glyph-missing", {
                slide: S.id,
                el: it.key,
                vars: { el: it.key, text: miss.slice(0, 6).map((c) => String.fromCodePoint(c)).join(" ") }
              });
            }
          } catch (e) {
            /* font not in the registry: nothing to compare against */
          }
        }
      }

      if (active(rc, "D5.fallback-font", S.slide) && fam && lacksLoadedFace(rc, fam) && once("D5.fallback-font", it.key)) {
        emit(rc, out, "D5.fallback-font", { slide: S.id, el: it.key, vars: { el: it.key, font: fam } });
      }

      const t = marksBySlot[S.id + "|" + it.key] || (marksBySlot[S.id + "|" + it.key] = { slide: S.id, key: it.key, letters: 0, marks: 0 });
      t.letters += (it.text.match(new RegExp("[" + AR_L + "]", "g")) || []).length;
      t.marks += (it.text.match(/[\u064B-\u0652\u0670]/g) || []).length;
    });
  });
  if (active(rc, "D5.tashkeel")) {
    const p = param(rc, "D5.tashkeel");
    Object.keys(marksBySlot).forEach((k) => {
      const t = marksBySlot[k];
      if (t.letters >= p.minLetters && t.marks / t.letters >= p.ratio) emit(rc, out, "D5.tashkeel", { slide: t.slide, el: t.key, vars: { el: t.key } });
    });
  }
  if (active(rc, "D5.kashida-count") && kashidaWords > param(rc, "D5.kashida-count").max) {
    emit(rc, out, "D5.kashida-count", { vars: { count: kashidaWords, max: param(rc, "D5.kashida-count").max } });
  }
  rc.fontsUsed = fontsUsed;
}

/* ------------------------------------------------------------------- D6 */

/** Slots whose visual lines D6.lines counts, by slide type (default: body). */
const LINE_SLOTS = {
  cover: ["headline"],
  poster: ["headline"],
  rehook: ["headline", "sub"],
  cta: ["title", "body"],
  checklist: ["title", "bullets"],
  summary: ["title", "bullets"]
};

function slotWordRects(S, slotName, skipAnchor) {
  const slot = S.el.querySelector('[data-slot="' + slotName + '"]');
  if (!slot) return [];
  const words = slot.querySelectorAll(".w");
  const rects = [];
  Array.prototype.forEach.call(words, (w) => {
    /* a leading numeral set as a block-level anchor ("number" cover, "big-number" re-hook) is a graphic, not a line of copy */
    const run = skipAnchor && w.getAttribute("data-w") === "0" && (w.querySelector('.cs-ltr[data-run="number"]') || w.closest('.cs-ltr[data-run="number"]'));
    if (run && run.textContent.trim() === w.textContent.trim() && getComputedStyle(run).display === "block") return;
    const r = S.rel(w.getBoundingClientRect());
    if (r.w > 0 && r.h > 0) rects.push(r);
  });
  return rects;
}

function gateD6(rc) {
  const out = rc.out;
  const families = new Set();
  rc.S.forEach((S) => {
    const texts = collectTexts(S);
    const cover = S.type === "cover" || S.type === "poster";
    texts.forEach((it) => {
      if (hasArabic(it.text)) families.add(firstFamily(it.cs.fontFamily));
    });

    if (cover && active(rc, "D6.headline-width", S.slide) && S.tokens && S.tokens.layout && S.tokens.layout.headlineWidth) {
      const p = param(rc, "D6.headline-width");
      const lines = groupLines(slotWordRects(S, "headline"));
      if (lines.length) {
        const share = Math.max.apply(null, lines.map((l) => l.width)) / p.contentWidth;
        const lo = S.tokens.layout.headlineWidth[0];
        const hi = S.tokens.layout.headlineWidth[1];
        if (share < lo - p.tolerance || share > hi + p.tolerance) {
          emit(rc, out, "D6.headline-width", {
            slide: S.id,
            el: S.id + ".headline",
            vars: { pct: Math.round(share * 100), min: Math.round(lo * 100), max: Math.round(hi * 100) }
          });
        }
      }
    }

    if (active(rc, "D6.lone-word", S.slide)) {
      const p = param(rc, "D6.lone-word");
      ["headline", "title", "body", "sub"].forEach((name) => {
        const lines = groupLines(slotWordRects(S, name));
        if (lines.length < 2) return;
        const widest = Math.max.apply(null, lines.map((l) => l.width));
        const last = lines[lines.length - 1];
        if (last.words === 1 && last.width < p.minShare * widest) {
          emit(rc, out, "D6.lone-word", { slide: S.id, el: S.id + "." + name, vars: { el: S.id + "." + name } });
        }
      });
    }

    if (active(rc, "D6.lines", S.slide)) {
      const lim = param(rc, "D6.lines").limits;
      const slots = LINE_SLOTS[S.type] || ["body"];
      const rects = [];
      slots.forEach((name) => slotWordRects(S, name, true).forEach((r) => rects.push(r)));
      const count = groupLines(rects).length;
      const max = lim[S.type] !== undefined ? lim[S.type] : lim.default;
      if (count > max) emit(rc, out, "D6.lines", { slide: S.id, el: S.id, vars: { count, max } });
    }

    if (cover && active(rc, "D6.rows", S.slide)) {
      const rects = [];
      texts.forEach((it) => {
        if (!it.chrome) it.rects.forEach((r) => rects.push(r));
      });
      const rows = groupLines(rects).length;
      const max = param(rc, "D6.rows").max;
      if (rows > max) emit(rc, out, "D6.rows", { slide: S.id, el: S.id, vars: { count: rows, max } });
    }

    if (active(rc, "D6.latin-match", S.slide)) {
      const tol = param(rc, "D6.latin-match").weightTolerance;
      const reported = new Set();
      Array.prototype.forEach.call(S.el.querySelectorAll('.cs-ltr[data-run="latin"]'), (run) => {
        if (hiddenWithin(run, S.el)) return;
        const slot = run.closest("[data-slot]");
        if (!slot) return;
        const words = Array.prototype.slice.call(slot.querySelectorAll(".w")).filter((w) => !run.contains(w) && !w.contains(run) && hasArabic(w.textContent));
        if (!words.length) return;
        const before = words.filter((w) => w.compareDocumentPosition(run) & Node.DOCUMENT_POSITION_FOLLOWING);
        const neighbour = before.length ? before[before.length - 1] : words[0];
        const a = getComputedStyle(run);
        const b = getComputedStyle(neighbour);
        const sameState = !!run.closest("mark") === !!neighbour.closest("mark");
        const key = domKey(S, run);
        if (sameState && (Math.abs((parseInt(a.fontWeight, 10) || 400) - (parseInt(b.fontWeight, 10) || 400)) > tol || a.color !== b.color) && !reported.has(key)) {
          reported.add(key);
          emit(rc, out, "D6.latin-match", { slide: S.id, el: key, vars: { text: run.textContent, el: key } });
        }
      });
    }
  });

  if (active(rc, "D6.families")) {
    families.delete("");
    const max = param(rc, "D6.families").max;
    if (families.size > max) emit(rc, out, "D6.families", { vars: { count: families.size, max } });
  }
}

/* ------------------------------------------------------------------- D7 */

function gateD7(rc) {
  const out = rc.out;
  const t = rc.tokens;
  if (!t) return;
  const prov = t.provenance;
  if (isObj(prov) && active(rc, "D7.no-brand")) {
    const fromBrand = Object.keys(prov).some((k) => prov[k] === "brand");
    if (!fromBrand) emit(rc, out, "D7.no-brand", {});
  }
  if (isObj(prov) && active(rc, "D7.default-fonts") && t.type) {
    const list = param(rc, "D7.default-fonts").families;
    const seen = new Set();
    [["display", "type.display.family"], ["heading", "type.heading.family"], ["body", "type.body.family"]].forEach((pair) => {
      const f = t.type[pair[0]] && t.type[pair[0]].family;
      if (f && list.indexOf(f) >= 0 && prov[pair[1]] !== "brand" && !seen.has(f)) {
        seen.add(f);
        emit(rc, out, "D7.default-fonts", { vars: { font: f } });
      }
    });
  }
  if (active(rc, "D7.default-layout") && rc.slides.length) {
    const defaults = rc.slides.filter((s) => {
      const list = t.variants && t.variants[s.type];
      const plain = !s.variant || (Array.isArray(list) && list.length && s.variant === list[0]);
      return !CS.visual?.free?.active(s) && plain && !(isObj(s.overrides) && Object.keys(s.overrides).length);
    }).length;
    const share = defaults / rc.slides.length;
    if (share > param(rc, "D7.default-layout").share) emit(rc, out, "D7.default-layout", { vars: { pct: Math.round(share * 100) } });
  }
}

/* ------------------------------------------------------------------- T1 */

/** Hero size and local contrast of a cover at thumbnail size. */
async function thumbnailOf(slideEl, tokens, ctxLike) {
  const spec = (ctxLike && ctxLike.spec) || { canvas: {}, slides: [] };
  const thumbW = ctxLike && ctxLike.R ? param(ctxLike, "T1.hero-small").widthPx : 130;
  const S = slideInfo({ el: slideEl, id: slideEl.getAttribute("data-cs-slide") || "", tokens }, { spec, tokens });
  const hero = slideEl.querySelector('[data-slot="headline"]') || slideEl.querySelector('[data-role="hero"]');
  if (!hero) return { heroPx: 0, pass: false, fix: false, localContrast: 0 };
  const heroPx = (parseFloat(getComputedStyle(hero).fontSize) || 0) * (thumbW / S.W);
  const items = (await measureSlide(S, 0.1)).filter((it) => it.role === "hero" || it.key.indexOf(".headline") > 0);
  const means = items.filter((it) => it.res).map((it) => it.res.mean);
  const localContrast = means.length ? Math.min.apply(null, means) : 0;
  const pass = heroPx >= 14;
  return { heroPx: Math.round(heroPx * 100) / 100, pass, fix: !pass && heroPx >= 11.5, localContrast: Math.round(localContrast * 100) / 100 };
}

async function gateT1(rc) {
  const out = rc.out;
  const cover = rc.S.find((S) => S.type === "cover" || S.type === "poster");
  if (!cover) return;
  const p = param(rc, "T1.hero-small");
  const info = await thumbnailOf(cover.el, cover.tokens, rc);
  rc.thumbnail = info;
  if (info.heroPx >= p.fixMin && info.heroPx < p.pass && active(rc, "T1.hero-small", cover.slide)) {
    emit(rc, out, "T1.hero-small", { slide: cover.id, el: cover.id + ".headline", vars: { px: fmt1(info.heroPx), min: p.pass } });
  }
  const lc = param(rc, "T1.local-contrast").min;
  if (info.localContrast > 0 && info.localContrast < lc && active(rc, "T1.local-contrast", cover.slide)) {
    emit(rc, out, "T1.local-contrast", { slide: cover.id, el: cover.id + ".headline", vars: { ratio: fmt1(info.localContrast), min: lc } });
  }
}

/* ------------------------------------------------------- B1 (rendered) */

function gateB1Rendered(rc) {
  const out = rc.out;
  if (rc.dialect === "en") return;
  rc.S.forEach((S) => {
    const reported = new Set();
    if (active(rc, "B1.isolation", S.slide)) {
      Array.prototype.forEach.call(S.el.querySelectorAll(".cs-ltr"), (run) => {
        if (hiddenWithin(run, S.el)) return;
        const rects = Array.prototype.filter.call(run.getClientRects(), (r) => r.width > 0.5 && r.height > 0.5).map((r) => S.rel(r));
        if (rects.length > 1 && groupLines(rects).length > 1) {
          const key = domKey(S, run);
          if (!reported.has(key + run.textContent)) {
            reported.add(key + run.textContent);
            emit(rc, out, "B1.isolation", { slide: S.id, el: key, vars: { text: run.textContent } });
          }
        }
      });
      Array.prototype.forEach.call(S.el.querySelectorAll(".w"), (a) => {
        const n = a.nextSibling;
        const b = n && n.nodeType === 3 && n.nodeValue === "\u00A0" ? n.nextSibling : null;
        if (!b || b.nodeType !== 1 || !b.classList.contains("w") || hiddenWithin(a, S.el)) return;
        const ra = S.rel(a.getBoundingClientRect());
        const rb = S.rel(b.getBoundingClientRect());
        if (Math.abs(ra.y + ra.h / 2 - (rb.y + rb.h / 2)) > Math.min(ra.h, rb.h) * 0.5) {
          const key = domKey(S, a);
          if (!reported.has(key + a.textContent)) {
            reported.add(key + a.textContent);
            emit(rc, out, "B1.isolation", { slide: S.id, el: key, vars: { text: a.textContent + " " + b.textContent } });
          }
        }
      });
    }
    if (active(rc, "B1.raw-ltr", S.slide)) {
      collectTexts(S).forEach((it) => {
        if (it.el.closest(".cs-ltr") || it.el.closest(".cs-emoji")) return;
        const m = /[A-Za-z\u00C0-\u024F]+/.exec(it.text);
        if (m && hasArabic(it.el.closest("[data-slot]") ? it.el.closest("[data-slot]").textContent : it.text) && !reported.has("raw" + it.key)) {
          reported.add("raw" + it.key);
          emit(rc, out, "B1.raw-ltr", { slide: S.id, el: it.key, vars: { text: m[0] } });
        }
      });
    }
  });
}

/* ------------------------------------------------------------ entry point */

async function runRenderedGates(input, opts) {
  opts = opts || {};
  const base = buildContext(input, opts);
  const deck = input.deck;
  const tokens = input.tokens || (deck && deck.tokens) || null;
  const g = base.bundle.platform && base.bundle.platform.geometry;
  const rc = Object.assign(base, {
    out: [],
    tokens,
    signal: opts.signal || null,
    geometry: g || {},
    S: [],
    thumbnail: null
  });
  if (typeof document === "undefined") throw qaError("E_USAGE", "Rendered gates need a browser DOM");
  rc.S = ((deck && deck.slides) || []).filter((sr) => sr && sr.el).map((sr) => slideInfo(sr, rc));

  const step = async (id, fn, selected) => {
    if (!selected && !wantGate(rc, id)) return;
    if (rc.signal && rc.signal.aborted) throw qaError("E_ABORTED", "QA aborted");
    countGate(rc, id);
    await fn(rc, rc.out);
  };
  await step("D1", gateD1Render);
  await step("D2", gateD2);
  await step("D3", gateD3);
  await step("D4", gateD4);
  await step("D5", gateD5);
  await step("D6", gateD6);
  await step("D7", gateD7);
  await step("T1", gateT1);
  await step("B1", gateB1Rendered);
  await step("A1", gateA1);
  for (const g of extraGates("rendered", rc)) {
    await step(g.id, async () => rc.out.push(...(await g.run(rc) || [])), true);
  }
  return rc;
}
