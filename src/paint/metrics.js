/*
 * CS.paint.metrics · image similarity used by the loop gate (V1), the painter parity tests and the goldens.
 *
 *   ssim(a, b)  structural similarity of the luma channel, mean over 8x8 windows moved in steps of 4
 *               (Wang et al. 2004: K1 = 0.01, K2 = 0.03, L = 255); 1 means identical.
 *   psnr(a, b)  peak signal-to-noise ratio over R, G and B in dB, capped at 100 for identical images.
 */

function pixelsOf(canvas) {
  return canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height);
}

function lumaOf(canvas, maxWidth) {
  var c = canvas;
  if (maxWidth && canvas.width > maxWidth) c = downscaleCanvas(canvas, maxWidth, Math.max(1, Math.round(canvas.height * maxWidth / canvas.width)));
  var img = pixelsOf(c), d = img.data, n = c.width * c.height, y = new Float32Array(n), i;
  for (i = 0; i < n; i++) y[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
  return { w: c.width, h: c.height, y: y };
}

function ssimOf(a, b, opts) {
  opts = opts || {};
  var A = lumaOf(a, opts.downscaleTo), B = lumaOf(b, opts.downscaleTo);
  if (A.w !== B.w || A.h !== B.h) throw csError("E_USAGE", "ssim needs two canvases of the same size.");
  var win = 8, step = 4, C1 = 6.5025, C2 = 58.5225, w = A.w, h = A.h, sum = 0, count = 0, x, y, i, j, xi, ya, yb, ma, mb, va, vb, cov, n = win * win;
  for (y = 0; y + win <= h; y += step) {
    for (x = 0; x + win <= w; x += step) {
      ma = 0; mb = 0;
      for (j = 0; j < win; j++) { xi = (y + j) * w + x; for (i = 0; i < win; i++) { ma += A.y[xi + i]; mb += B.y[xi + i]; } }
      ma /= n; mb /= n; va = 0; vb = 0; cov = 0;
      for (j = 0; j < win; j++) {
        xi = (y + j) * w + x;
        for (i = 0; i < win; i++) { ya = A.y[xi + i] - ma; yb = B.y[xi + i] - mb; va += ya * ya; vb += yb * yb; cov += ya * yb; }
      }
      va /= n - 1; vb /= n - 1; cov /= n - 1;
      sum += ((2 * ma * mb + C1) * (2 * cov + C2)) / ((ma * ma + mb * mb + C1) * (va + vb + C2));
      count++;
    }
  }
  return count ? sum / count : 1;
}

function psnrOf(a, b) {
  if (a.width !== b.width || a.height !== b.height) throw csError("E_USAGE", "psnr needs two canvases of the same size.");
  var da = pixelsOf(a).data, db = pixelsOf(b).data, n = a.width * a.height, i, e, mse = 0;
  for (i = 0; i < n; i++) {
    e = da[i * 4] - db[i * 4]; mse += e * e;
    e = da[i * 4 + 1] - db[i * 4 + 1]; mse += e * e;
    e = da[i * 4 + 2] - db[i * 4 + 2]; mse += e * e;
  }
  mse /= n * 3;
  return mse === 0 ? 100 : Math.min(100, 10 * Math.log10(65025 / mse));
}
