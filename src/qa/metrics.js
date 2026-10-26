/* Carousel Studio · cs-qa · pixel metrics
 *
 * SSIM and PSNR for the loop check of gate V1 (frame 0 against the poster,
 * last frame against frame 0). Accepts canvases, ImageData and plain
 * { data, width, height } objects, so the same code runs in the Studio and
 * in tests.
 */

function pixelsOf(src) {
  if (!src) throw qaError("E_USAGE", "metrics need an image");
  if (src.data && src.width && src.height) return src;
  if (typeof src.getContext === "function") {
    const g = src.getContext("2d", { willReadFrequently: true });
    return g.getImageData(0, 0, src.width, src.height);
  }
  throw qaError("E_USAGE", "unsupported image type for metrics");
}

/** Peak signal-to-noise ratio over the RGB channels, in dB (99 when identical). */
function psnrOf(a, b) {
  const A = pixelsOf(a);
  const B = pixelsOf(b);
  if (A.width !== B.width || A.height !== B.height) return 0;
  const n = A.width * A.height;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const dr = A.data[o] - B.data[o];
    const dg = A.data[o + 1] - B.data[o + 1];
    const db = A.data[o + 2] - B.data[o + 2];
    sum += dr * dr + dg * dg + db * db;
  }
  const mse = sum / (n * 3);
  return mse === 0 ? 99 : 10 * Math.log10((255 * 255) / mse);
}

function grayOf(img) {
  const n = img.width * img.height;
  const g = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    g[i] = 0.299 * img.data[o] + 0.587 * img.data[o + 1] + 0.114 * img.data[o + 2];
  }
  return g;
}

/** Mean SSIM of the luma channel over 8x8 blocks (1 when identical). */
function ssimOf(a, b) {
  const A = pixelsOf(a);
  const B = pixelsOf(b);
  if (A.width !== B.width || A.height !== B.height) return 0;
  const ga = grayOf(A);
  const gb = grayOf(B);
  const C1 = (0.01 * 255) * (0.01 * 255);
  const C2 = (0.03 * 255) * (0.03 * 255);
  const W = A.width;
  const H = A.height;
  const N = 8;
  let total = 0;
  let blocks = 0;
  for (let by = 0; by + N <= H; by += N) {
    for (let bx = 0; bx + N <= W; bx += N) {
      let sa = 0;
      let sb = 0;
      let saa = 0;
      let sbb = 0;
      let sab = 0;
      for (let y = 0; y < N; y++) {
        const row = (by + y) * W + bx;
        for (let x = 0; x < N; x++) {
          const va = ga[row + x];
          const vb = gb[row + x];
          sa += va;
          sb += vb;
          saa += va * va;
          sbb += vb * vb;
          sab += va * vb;
        }
      }
      const cnt = N * N;
      const ma = sa / cnt;
      const mb = sb / cnt;
      const va = saa / cnt - ma * ma;
      const vb = sbb / cnt - mb * mb;
      const cov = sab / cnt - ma * mb;
      total += ((2 * ma * mb + C1) * (2 * cov + C2)) / ((ma * ma + mb * mb + C1) * (va + vb + C2));
      blocks++;
    }
  }
  return blocks ? total / blocks : 1;
}

/** V1 loop check: worst SSIM and PSNR of (frame 0 vs poster) and (last frame
 *  vs frame 0). Thresholds come from the V1.loop check when rules are loaded. */
function loopCheckOf(frame0, last, poster) {
  let ssimMin = 0.995;
  let psnrMin = 45;
  try {
    const p = loadRules().checks["V1.loop"].def.params;
    ssimMin = p.ssim;
    psnrMin = p.psnr;
  } catch (e) {
    /* rules not registered: use the platform defaults above */
  }
  const pairs = [[frame0, poster], [last, frame0]];
  let ssim = 1;
  let psnr = 99;
  pairs.forEach((p) => {
    ssim = Math.min(ssim, ssimOf(p[0], p[1]));
    psnr = Math.min(psnr, psnrOf(p[0], p[1]));
  });
  return { ssim: Math.round(ssim * 100000) / 100000, psnr: Math.round(psnr * 100) / 100, ok: ssim >= ssimMin && psnr >= psnrMin };
}
