// tests/parity/lib/ssim.mjs · image similarity in Node, for tests that compare two PNG files (round 3, package F1).
//
//   import { ssim, psnr, decodePng } from "./ssim.mjs";
//   ssim(pngA, pngB)    -> number in (0, 1]; 1 = identical. The arguments are PNG bytes (Buffer / Uint8Array) or decoded images
//                          { width, height, data } (RGBA, 8 bit), or a mix of both.
//   psnr(pngA, pngB)    -> dB over R, G and B, 100 when identical.
//   decodePng(bytes)    -> { width, height, data: Uint8ClampedArray (RGBA) }
//
// The SSIM is the one of src/paint/metrics.js, step for step (luma 0.299 / 0.587 / 0.114 in float32, 8 x 8 windows moved by 4, K1 = 0.01,
// K2 = 0.03, L = 255, unbiased variances), so a number measured here and a number measured in the page by CS.paint.metrics.ssim agree.
// The PNG reader handles what Chromium, Playwright and cs-paint write: 8-bit grey, grey + alpha, RGB, RGBA and palette images, not interlaced.
import zlib from "node:zlib";

function fail(message) { throw new Error("ssim.mjs: " + message); }

/** PNG bytes -> { width, height, data } with data as RGBA. */
export function decodePng(bytes) {
  const b = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (b.length < 33 || b.readUInt32BE(0) !== 0x89504e47 || b.readUInt32BE(4) !== 0x0d0a1a0a) fail("not a PNG file");
  let width = 0, height = 0, depth = 0, colour = 0, interlace = 0, palette = null, trns = null;
  const idat = [];
  for (let o = 8; o + 12 <= b.length;) {
    const len = b.readUInt32BE(o), type = b.toString("latin1", o + 4, o + 8), body = b.subarray(o + 8, o + 8 + len);
    if (type === "IHDR") { width = body.readUInt32BE(0); height = body.readUInt32BE(4); depth = body[8]; colour = body[9]; interlace = body[12]; }
    else if (type === "PLTE") palette = body;
    else if (type === "tRNS") trns = body;
    else if (type === "IDAT") idat.push(body);
    else if (type === "IEND") break;
    o += 12 + len;
  }
  if (!width || !height) fail("PNG has no IHDR");
  if (depth !== 8) fail("only 8-bit PNG files are supported (got " + depth + ")");
  if (interlace) fail("interlaced PNG files are not supported");
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colour];
  if (!channels) fail("unknown PNG colour type " + colour);
  const raw = zlib.inflateSync(Buffer.concat(idat)), stride = width * channels, out = Buffer.alloc(stride * height);
  if (raw.length < (stride + 1) * height) fail("PNG data is truncated");
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)], src = y * (stride + 1) + 1, dst = y * stride, prev = dst - stride;
    for (let x = 0; x < stride; x++) {
      const v = raw[src + x], a = x >= channels ? out[dst + x - channels] : 0, up = y ? out[prev + x] : 0, c = x >= channels && y ? out[prev + x - channels] : 0;
      let r;
      if (f === 0) r = v;
      else if (f === 1) r = v + a;
      else if (f === 2) r = v + up;
      else if (f === 3) r = v + ((a + up) >> 1);
      else if (f === 4) { const p = a + up - c, pa = Math.abs(p - a), pb = Math.abs(p - up), pc = Math.abs(p - c); r = v + (pa <= pb && pa <= pc ? a : pb <= pc ? up : c); }
      else fail("unknown PNG filter " + f);
      out[dst + x] = r & 255;
    }
  }
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0, n = width * height; i < n; i++) {
    const p = i * channels, q = i * 4;
    if (colour === 6) { data[q] = out[p]; data[q + 1] = out[p + 1]; data[q + 2] = out[p + 2]; data[q + 3] = out[p + 3]; }
    else if (colour === 2) { data[q] = out[p]; data[q + 1] = out[p + 1]; data[q + 2] = out[p + 2]; data[q + 3] = 255; }
    else if (colour === 0) { data[q] = data[q + 1] = data[q + 2] = out[p]; data[q + 3] = 255; }
    else if (colour === 4) { data[q] = data[q + 1] = data[q + 2] = out[p]; data[q + 3] = out[p + 1]; }
    else { const k = out[p] * 3; data[q] = palette ? palette[k] : 0; data[q + 1] = palette ? palette[k + 1] : 0; data[q + 2] = palette ? palette[k + 2] : 0; data[q + 3] = trns && out[p] < trns.length ? trns[out[p]] : 255; }
  }
  return { width, height, data };
}

function imageOf(x) {
  if (x && x.data && x.width && x.height) return x;
  if (x && (Buffer.isBuffer(x) || x instanceof Uint8Array)) return decodePng(x);
  return fail("expected PNG bytes or { width, height, data }");
}

function lumaOf(img) {
  const n = img.width * img.height, y = new Float32Array(n), d = img.data;
  for (let i = 0; i < n; i++) y[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
  return y;
}

export function ssim(a, b) {
  const A = imageOf(a), B = imageOf(b);
  if (A.width !== B.width || A.height !== B.height) fail(`ssim needs two images of the same size (${A.width}x${A.height} and ${B.width}x${B.height})`);
  const ya = lumaOf(A), yb = lumaOf(B), win = 8, step = 4, C1 = 6.5025, C2 = 58.5225, w = A.width, h = A.height, n = win * win;
  let sum = 0, count = 0;
  for (let y = 0; y + win <= h; y += step) {
    for (let x = 0; x + win <= w; x += step) {
      let ma = 0, mb = 0;
      for (let j = 0; j < win; j++) { const xi = (y + j) * w + x; for (let i = 0; i < win; i++) { ma += ya[xi + i]; mb += yb[xi + i]; } }
      ma /= n; mb /= n;
      let va = 0, vb = 0, cov = 0;
      for (let j = 0; j < win; j++) {
        const xi = (y + j) * w + x;
        for (let i = 0; i < win; i++) { const da = ya[xi + i] - ma, db = yb[xi + i] - mb; va += da * da; vb += db * db; cov += da * db; }
      }
      va /= n - 1; vb /= n - 1; cov /= n - 1;
      sum += ((2 * ma * mb + C1) * (2 * cov + C2)) / ((ma * ma + mb * mb + C1) * (va + vb + C2));
      count++;
    }
  }
  return count ? sum / count : 1;
}

export function psnr(a, b) {
  const A = imageOf(a), B = imageOf(b);
  if (A.width !== B.width || A.height !== B.height) fail("psnr needs two images of the same size");
  const n = A.width * A.height;
  let mse = 0;
  for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) { const e = A.data[i * 4 + c] - B.data[i * 4 + c]; mse += e * e; }
  mse /= n * 3;
  return mse === 0 ? 100 : Math.min(100, 10 * Math.log10(65025 / mse));
}
