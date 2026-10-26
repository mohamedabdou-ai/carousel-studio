/*
 * CS.paint · PNG writer.
 *
 * The browser's own PNG encoder writes RGBA (colour type 6) for a CPU-backed canvas and RGB for a GPU-backed one, and it varies
 * between engines. CONTRACT 4.5 wants one thing everywhere: 8-bit RGB, no alpha channel, no metadata, the same bytes for the same
 * pixels. So the pixels are read back and written here: IHDR, one IDAT, IEND.
 * Compression is the browser's own zlib (CompressionStream "deflate", which is exactly the zlib wrapper PNG needs); a browser
 * without it gets stored blocks, which is bigger but still a valid, alpha-free PNG.
 */

var crcTable = null;

function pngCrcTable() {
  if (crcTable) return crcTable;
  crcTable = new Uint32Array(256);
  for (var n = 0, c, k; n < 256; n++) {
    c = n;
    for (k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    crcTable[n] = c >>> 0;
  }
  return crcTable;
}

function pngCrc(bytes, start, end) {
  var t = pngCrcTable(), c = 0xFFFFFFFF, i;
  for (i = start; i < end; i++) c = t[(c ^ bytes[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function pngAdler(bytes) {
  var a = 1, b = 0, i = 0, end, n = bytes.length;
  while (i < n) {
    end = Math.min(i + 5552, n);
    for (; i < end; i++) { a += bytes[i]; b += a; }
    a %= 65521; b %= 65521;
  }
  return ((b << 16) | a) >>> 0;
}

function pngChunk(type, data) {
  var out = new Uint8Array(12 + data.length), dv = new DataView(out.buffer), i;
  dv.setUint32(0, data.length);
  for (i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  dv.setUint32(8 + data.length, pngCrc(out, 4, 8 + data.length));
  return out;
}

/** Scanlines of an RGBA image as 8-bit RGB with a per-row filter (None, Sub or Up, whichever sums smallest). */
function pngScanlines(rgba, w, h) {
  var stride = w * 3, out = new Uint8Array(h * (stride + 1)), cur = new Uint8Array(stride), prev = new Uint8Array(stride), swap;
  var y, i, j, o, v, left, sNone, sSub, sUp, type;
  for (y = 0; y < h; y++) {
    j = y * w * 4;
    for (i = 0; i < stride; i += 3, j += 4) { cur[i] = rgba[j]; cur[i + 1] = rgba[j + 1]; cur[i + 2] = rgba[j + 2]; }
    sNone = 0; sSub = 0; sUp = 0;
    for (i = 0; i < stride; i++) {
      v = cur[i]; sNone += v < 128 ? v : 256 - v;
      left = i >= 3 ? cur[i - 3] : 0;
      v = (cur[i] - left) & 255; sSub += v < 128 ? v : 256 - v;
      v = (cur[i] - prev[i]) & 255; sUp += v < 128 ? v : 256 - v;
    }
    type = sUp <= sSub && sUp <= sNone ? 2 : sSub <= sNone ? 1 : 0;
    o = y * (stride + 1);
    out[o++] = type;
    if (type === 0) out.set(cur, o);
    else if (type === 1) for (i = 0; i < stride; i++) out[o + i] = (cur[i] - (i >= 3 ? cur[i - 3] : 0)) & 255;
    else for (i = 0; i < stride; i++) out[o + i] = (cur[i] - prev[i]) & 255;
    swap = prev; prev = cur; cur = swap;
  }
  return out;
}

/** zlib stream made of stored (uncompressed) deflate blocks. */
function zlibStored(raw) {
  var blocks = Math.max(1, Math.ceil(raw.length / 65535)), out = new Uint8Array(2 + raw.length + blocks * 5 + 4), dv = new DataView(out.buffer), o = 2, p = 0, len, last;
  out[0] = 0x78; out[1] = 0x01;
  while (p < raw.length || o === 2) {
    len = Math.min(65535, raw.length - p);
    last = p + len >= raw.length ? 1 : 0;
    out[o++] = last; out[o++] = len & 255; out[o++] = len >> 8; out[o++] = ~len & 255; out[o++] = (~len >> 8) & 255;
    out.set(raw.subarray(p, p + len), o);
    o += len; p += len;
    if (last) break;
  }
  dv.setUint32(o, pngAdler(raw));
  return out.subarray(0, o + 4);
}

async function zlibCompress(raw) {
  if (typeof CompressionStream === "function" && typeof Blob === "function" && typeof Response === "function") {
    try {
      var stream = new Blob([raw]).stream().pipeThrough(new CompressionStream("deflate"));
      return new Uint8Array(await new Response(stream).arrayBuffer());
    } catch (e) { /* fall through to stored blocks */ }
  }
  return zlibStored(raw);
}

/** Bytes of an 8-bit RGB PNG of the canvas, or null when the canvas has no readable 2D context (the caller then uses the browser's encoder). */
async function encodePngRgb(canvas) {
  var ctx = canvas.getContext("2d");
  if (!ctx) return null;
  var w = canvas.width, h = canvas.height, img;
  try { img = ctx.getImageData(0, 0, w, h); }
  catch (e) { throw csError("E_PAINT_TAINTED", "The canvas is tainted and cannot be exported.", { cause: String(e && e.message || e) }); }
  var z = await zlibCompress(pngScanlines(img.data, w, h)), head = new Uint8Array(13), dv = new DataView(head.buffer);
  dv.setUint32(0, w); dv.setUint32(4, h);
  head[8] = 8; head[9] = 2; head[10] = 0; head[11] = 0; head[12] = 0;       // 8-bit, RGB, deflate, adaptive filter, no interlace
  var parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk("IHDR", head), pngChunk("IDAT", z), pngChunk("IEND", new Uint8Array(0))];
  var out = new Uint8Array(parts.reduce(function (n, p) { return n + p.length; }, 0)), o = 0;
  parts.forEach(function (p) { out.set(p, o); o += p.length; });
  return out;
}
