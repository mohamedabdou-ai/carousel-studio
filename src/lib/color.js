/* lib/color.js · colour maths (CONTRACT 4.3.1).
 *
 * sRGB hex <-> OKLCH, WCAG contrast, linear-light mixing, and `ensureContrast`, which moves a foreground along OKLCH
 * lightness only (hue kept, chroma lowered only to stay inside the sRGB gamut). Colours are opaque "#RRGGBB" strings; results
 * are upper-case. The Python twin is scripts/_cs/color.py; both use the same constants and the same rounding.
 */
(function () {
  const core = (CS.core = CS.core || {});

  const HEX3 = /^#?([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/;
  const HEX6 = /^#?([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/;

  function parse(hex) {
    const s = String(hex).trim();
    let m = HEX6.exec(s);
    if (m) return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
    m = HEX3.exec(s);
    if (m) return { r: parseInt(m[1] + m[1], 16), g: parseInt(m[2] + m[2], 16), b: parseInt(m[3] + m[3], 16) };
    throw new CS.CSError("E_USAGE", "not a hex colour: " + hex);
  }

  function byteHex(v) {
    const n = Math.max(0, Math.min(255, Math.floor(v + 0.5)));
    return (n < 16 ? "0" : "") + n.toString(16).toUpperCase();
  }

  function toHex(rgb) { return "#" + byteHex(rgb.r) + byteHex(rgb.g) + byteHex(rgb.b); }

  function toLinear(c) { const v = c / 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
  function fromLinear(v) { const c = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055; return c * 255; }

  function luminance(hex) {
    const c = parse(hex);
    return 0.2126 * toLinear(c.r) + 0.7152 * toLinear(c.g) + 0.0722 * toLinear(c.b);
  }

  function contrast(fg, bg) {
    const a = luminance(fg), b = luminance(bg);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  }

  /* Oklab (Bjorn Ottosson). */
  function toOklab(hex) {
    const c = parse(hex), r = toLinear(c.r), g = toLinear(c.g), b = toLinear(c.b);
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return {
      L: 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
      a: 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
      b: 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
    };
  }

  function oklabToLinear(L, a, b) {
    const l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * b, 3);
    const m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * b, 3);
    const s = Math.pow(L - 0.0894841775 * a - 1.2914855480 * b, 3);
    return [
      4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
    ];
  }

  function toOklch(hex) {
    const o = toOklab(hex);
    let h = Math.atan2(o.b, o.a) * 180 / Math.PI;
    if (h < 0) h += 360;
    const C = Math.sqrt(o.a * o.a + o.b * o.b);
    return { L: o.L, C: C, h: C < 1e-9 ? 0 : h };
  }

  const EPS = 0.0005;
  function inGamut(v) { return v[0] >= -EPS && v[0] <= 1 + EPS && v[1] >= -EPS && v[1] <= 1 + EPS && v[2] >= -EPS && v[2] <= 1 + EPS; }

  function fromOklch(c) {
    const L = Math.max(0, Math.min(1, c.L)), hr = (c.h * Math.PI) / 180;
    const at = function (chroma) { return oklabToLinear(L, chroma * Math.cos(hr), chroma * Math.sin(hr)); };
    let chroma = Math.max(0, c.C);
    let lin = at(chroma);
    if (!inGamut(lin)) {
      let lo = 0, hi = chroma;
      for (let i = 0; i < 28; i++) {
        const mid = (lo + hi) / 2;
        if (inGamut(at(mid))) lo = mid; else hi = mid;
      }
      chroma = lo;
      lin = at(chroma);
    }
    const q = function (v) { return fromLinear(Math.max(0, Math.min(1, v))); };
    return toHex({ r: q(lin[0]), g: q(lin[1]), b: q(lin[2]) });
  }

  /** sRGB linear-light mix; t = 0 gives `a`, t = 1 gives `b`. */
  function mix(a, b, t) {
    const x = parse(a), y = parse(b);
    const m = function (p, q) { return fromLinear(toLinear(p) * (1 - t) + toLinear(q) * t); };
    return toHex({ r: m(x.r, y.r), g: m(x.g, y.g), b: m(x.b, y.b) });
  }

  /** "#111111" or "#FFFFFF", whichever reads better on `bg`. */
  function onColor(bg) { return contrast("#111111", bg) >= contrast("#FFFFFF", bg) ? "#111111" : "#FFFFFF"; }

  const STEP = 0.005;

  /**
   * Smallest lightness move (steps of 0.005) that gives `fg` a contrast of at least `min` on `bg`. Direction: away from the
   * background first; the other way when that cannot reach `min`; white or black as the last resort.
   */
  function ensureContrast(fg, bg, min) {
    if (contrast(fg, bg) >= min) return { hex: toHex(parse(fg)), changed: false, steps: 0 };
    const lch = toOklch(fg);
    const awayFirst = luminance(bg) > 0.18 ? -1 : 1;
    const dirs = [awayFirst, -awayFirst];
    let total = 0;
    for (let d = 0; d < dirs.length; d++) {
      for (let k = 1; ; k++) {
        const L = lch.L + dirs[d] * STEP * k;
        if (L < 0 || L > 1) break;
        total++;
        const hex = fromOklch({ L: L, C: lch.C, h: lch.h });
        if (contrast(hex, bg) >= min) return { hex: hex, changed: true, steps: total };
      }
    }
    const best = contrast("#000000", bg) >= contrast("#FFFFFF", bg) ? "#000000" : "#FFFFFF";
    return { hex: best, changed: true, steps: total };
  }

  core.color = { parse: parse, toHex: toHex, toOklch: toOklch, fromOklch: fromOklch, luminance: luminance, contrast: contrast, mix: mix, ensureContrast: ensureContrast, onColor: onColor };
})();
