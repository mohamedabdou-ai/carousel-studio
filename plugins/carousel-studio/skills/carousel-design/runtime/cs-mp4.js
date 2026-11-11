/*! Carousel Studio runtime chunk cs-mp4.js · cs-1.1.1 · Apache-2.0 */
(function () {
  "use strict";
  var CS = (window.CS = window.CS || {});
  /* ---- file: mp4.js ---- */
/*
 * CS.export.mp4 · H.264 in MP4 from canvas frames (CONTRACT 4.7).
 *
 * Frames are drawn by the caller into one canvas. Each frame is converted here, once, from the canvas's sRGB pixels to I420 with the
 * BT.709 matrix at limited (TV) range, wrapped in a VideoFrame that says so (colorSpace bt709/bt709/bt709, fullRange false), handed
 * to the browser's own WebCodecs H.264 encoder and muxed with mediabunny into a fast-start MP4 (moov before mdat, keyframe at frame 0
 * and at least once a second, constant 30 fps, no audio).
 *
 * Why the conversion is ours: a browser converts a canvas frame to YUV with a matrix, a range and a transfer tag of its own
 * choosing, and they differ between builds and encoders (the same canvas came out BT.709 limited in one Chromium and BT.601
 * or full range in another, and tagged "sRGB transfer" in a third). With our own planes the pixels are exactly what the tags
 * say. The encoder's headers are then checked and made explicit (see normaliseAvcRecord): level 4.0 when the stream fits it
 * (hardware encoders write 5.0), and BT.709 limited range written into the SPS and the container.
 *
 * mediabunny is the only third-party code involved; it is loaded on demand from jsDelivr at an exact version.
 */

var MEDIABUNNY_VERSION = "1.61.0";
var DEPS = {                                   // exact versions, written out in full: nothing else is ever requested
  mediabunny: { version: MEDIABUNNY_VERSION, url: "https://cdn.jsdelivr.net/npm/mediabunny@1.61.0/+esm" }
};
var H264_CODECS = ["avc1.640028", "avc1.4d0028", "avc1.42E028"];   // High 4.0, Main 4.0, Constrained Baseline 4.0
var DEFAULT_BITRATE = 8000000;
var KEYFRAME_SECONDS = 1;
var COLOUR = { primaries: "bt709", transfer: "bt709", matrix: "bt709", fullRange: false };   // HD video as everyone tags it: BT.709, limited range
var COLOUR_CODES = { primaries: 1, transfer: 1, matrix: 1, fullRange: false };                // the same in the VUI's numbers (ITU-T H.273)
var TARGET_LEVEL = 40;                                            // level_idc 40 = level 4.0, what the codec string above asks for
var LEVEL_4_0 = { mbps: 245760, fs: 8192, dpb: 32768, br: 20000 };  // Table A-1: macroblocks per second, per frame, DPB macroblocks, kbit/s (x1.25 for High)

function mp4Error(code, message, detail) {
  var E = CS.CSError;
  if (E) return new E(code, message, detail);
  var e = new Error(message || code);
  e.code = code;
  if (detail !== undefined) e.detail = detail;
  return e;
}

var mediabunnyPromise = null;

/** Share a successful load; retry transient failures three times before releasing the cache. */
function loadMediabunny() {
  if (!mediabunnyPromise) {
    mediabunnyPromise = (async function () {
      for (var attempt = 0; attempt < 3; attempt++) {
        try { return await import(DEPS.mediabunny.url); }
        catch (e) {
          if (attempt === 2) throw e;
          await new Promise(function (resolve) { setTimeout(resolve, 250 * (attempt + 1)); });
        }
      }
    })().catch(function (e) {
      mediabunnyPromise = null;
      throw mp4Error("E_DEP_LOAD", "The MP4 writer (mediabunny " + MEDIABUNNY_VERSION + ") could not be loaded after 3 attempts. Check the internet connection and try again.", { attempts: 3, cause: String(e && e.message || e) });
    });
  }
  return mediabunnyPromise;
}

/** Is there an H.264 encoder for w x h at fps? Tries High, then Main, then Baseline at level 4.0. */
async function mp4Support(w, h, fps) {
  if (typeof VideoEncoder === "undefined" || typeof VideoEncoder.isConfigSupported !== "function") {
    return { supported: false, codec: null, reason: "WebCodecs VideoEncoder is not available in this browser" };
  }
  var i, result;
  for (i = 0; i < H264_CODECS.length; i++) {
    try {
      result = await VideoEncoder.isConfigSupported({ codec: H264_CODECS[i], width: w, height: h, bitrate: DEFAULT_BITRATE, framerate: fps });
      if (result && result.supported) return { supported: true, codec: H264_CODECS[i] };
    } catch (e) { /* try the next profile */ }
  }
  return { supported: false, codec: null, reason: "No H.264 encoder for " + w + "x" + h + " at " + fps + " fps on this device" };
}

/* ------------------------------------------------------------------ H.264 headers: read, check, rewrite */

var AVC_HIGH_PROFILES = [100, 110, 122, 244, 44, 83, 86, 118, 128, 138, 139, 134, 135];
var CODE_NAMES = { 1: "bt709", 2: "unknown", 5: "bt470bg", 6: "smpte170m", 13: "iec61966-2-1" };

function codeName(n) { return n === null || n === undefined ? null : CODE_NAMES[n] || "code-" + n; }

/** Reads bits from a byte array (an RBSP: emulation-prevention bytes already removed). Throws RangeError past the end. */
function BitReader(bytes) { this.b = bytes; this.pos = 0; this.end = bytes.length * 8; }
BitReader.prototype.bit = function () {
  if (this.pos >= this.end) throw new RangeError("the parameter set ended early");
  var v = (this.b[this.pos >> 3] >> (7 - (this.pos & 7))) & 1;
  this.pos++;
  return v;
};
BitReader.prototype.bits = function (n) { var v = 0, i; for (i = 0; i < n; i++) v = v * 2 + this.bit(); return v; };
BitReader.prototype.ue = function () {
  var zeros = 0;
  while (this.bit() === 0) { if (++zeros > 32) throw new RangeError("bad Exp-Golomb code"); }
  return zeros ? Math.pow(2, zeros) - 1 + this.bits(zeros) : 0;
};
BitReader.prototype.se = function () { var k = this.ue(); return k & 1 ? (k + 1) / 2 : -(k / 2); };

/** NAL payload without its emulation-prevention bytes (00 00 03 -> 00 00). */
function unescapeNal(bytes) {
  var out = [], zeros = 0, i, b;
  for (i = 0; i < bytes.length; i++) {
    b = bytes[i];
    if (zeros >= 2 && b === 3) { zeros = 0; continue; }
    out.push(b);
    zeros = b === 0 ? zeros + 1 : 0;
  }
  return Uint8Array.from(out);
}

/** Puts the emulation-prevention bytes back (a 03 after any 00 00 that is followed by 00..03). */
function escapeNal(bytes) {
  var out = [], zeros = 0, i, b;
  for (i = 0; i < bytes.length; i++) {
    b = bytes[i];
    if (zeros >= 2 && b <= 3) { out.push(3); zeros = 0; }
    out.push(b);
    zeros = b === 0 ? zeros + 1 : 0;
  }
  return Uint8Array.from(out);
}

/** hrd_parameters(): returns the first bit rate in bit/s (scaled), 0 when none is given. */
function readHrd(r) {
  var n = r.ue() + 1, rateScale = r.bits(4), rate = 0, i, v;
  r.bits(4);
  for (i = 0; i < n; i++) { v = (r.ue() + 1) * Math.pow(2, 6 + rateScale); if (i === 0) rate = v; r.ue(); r.bit(); }
  r.bits(20);
  return rate;
}

/** Skips a scaling list so the reader stays in step. */
function skipScalingList(r, size) {
  var last = 8, next = 8, j;
  for (j = 0; j < size; j++) {
    if (next !== 0) next = (last + r.se() + 256) % 256;
    if (next !== 0) last = next;
  }
}

/**
 * Reads a sequence parameter set NAL unit (header byte included). Besides the facts it records the bit positions the rewrite needs:
 * where vui_parameters_present_flag sits, and where the VUI's video_signal_type block starts and ends.
 */
function parseSps(nal) {
  var rbsp = unescapeNal(nal.subarray(1)), r = new BitReader(rbsp), s = { nalHeader: nal[0], rbsp: rbsp }, i, n, pocType, hMap, crop, cx, cy;
  s.profile = r.bits(8); s.compat = r.bits(8); s.level = r.bits(8); r.ue();
  s.chromaFormat = 1; s.bitDepth = 8; s.profileType = AVC_HIGH_PROFILES.indexOf(s.profile) >= 0;
  if (s.profileType) {
    s.chromaFormat = r.ue();
    if (s.chromaFormat === 3) r.bit();
    s.bitDepth = 8 + r.ue(); r.ue(); r.bit();
    if (r.bit()) { n = s.chromaFormat !== 3 ? 8 : 12; for (i = 0; i < n; i++) if (r.bit()) skipScalingList(r, i < 6 ? 16 : 64); }
  }
  r.ue();
  pocType = r.ue();
  if (pocType === 0) r.ue();
  else if (pocType === 1) { r.bit(); r.se(); r.se(); n = r.ue(); for (i = 0; i < n; i++) r.se(); }
  s.numRefFrames = r.ue(); r.bit();
  s.widthMbs = r.ue() + 1; hMap = r.ue() + 1; s.frameMbsOnly = r.bit();
  s.heightMbs = s.frameMbsOnly ? hMap : hMap * 2;
  if (!s.frameMbsOnly) r.bit();
  r.bit();
  crop = r.bit() ? [r.ue(), r.ue(), r.ue(), r.ue()] : [0, 0, 0, 0];
  cx = s.chromaFormat === 0 || s.chromaFormat === 3 ? 1 : 2;
  cy = (s.chromaFormat === 1 ? 2 : 1) * (2 - s.frameMbsOnly);
  s.width = s.widthMbs * 16 - cx * (crop[0] + crop[1]);
  s.height = s.heightMbs * 16 - cy * (crop[2] + crop[3]);
  s.vuiFlagPos = r.pos;
  s.vui = null;
  if (r.bit()) {
    var v = { start: r.pos, signalStart: 0, signalEnd: 0, end: 0, signal: null, maxDecFrameBuffering: null, bitRate: 0 }, nalHrd, vclHrd, rate;
    if (r.bit() && r.bits(8) === 255) r.bits(32);                        // aspect ratio (extended SAR carries two 16-bit numbers)
    if (r.bit()) r.bit();                                                // overscan
    v.signalStart = r.pos;
    if (r.bit()) {                                                       // video_signal_type
      v.signal = { format: r.bits(3), fullRange: r.bit(), described: r.bit(), primaries: 2, transfer: 2, matrix: 2 };
      if (v.signal.described) { v.signal.primaries = r.bits(8); v.signal.transfer = r.bits(8); v.signal.matrix = r.bits(8); }
    }
    v.signalEnd = r.pos;
    if (r.bit()) { r.ue(); r.ue(); }                                     // chroma sample location
    if (r.bit()) { r.bits(32); r.bits(32); r.bit(); }                    // timing
    nalHrd = r.bit(); if (nalHrd) v.bitRate = readHrd(r);
    vclHrd = r.bit(); if (vclHrd) { rate = readHrd(r); v.bitRate = v.bitRate || rate; }
    if (nalHrd || vclHrd) r.bit();
    r.bit();                                                             // pic_struct_present_flag
    if (r.bit()) { r.bit(); r.ue(); r.ue(); r.ue(); r.ue(); r.ue(); v.maxDecFrameBuffering = r.ue(); }
    v.end = r.pos;
    s.vui = v;
  }
  return s;
}

/** What a parsed SPS says, in the terms ffprobe and the V1 gate use. `fullRange` and the colour codes are null when the stream does not say. */
function spsFacts(s) {
  var sig = s.vui && s.vui.signal, described = !!(sig && sig.described);
  var fullRange = sig ? !!sig.fullRange : null;
  return {
    profile: s.profile, compat: s.compat, level: s.level, width: s.width, height: s.height, numRefFrames: s.numRefFrames,
    chromaFormat: s.chromaFormat, bitDepth: s.bitDepth, fullRange: fullRange,
    primaries: described ? sig.primaries : null, transfer: described ? sig.transfer : null, matrix: described ? sig.matrix : null
  };
}

function BitWriter() { this.bits = []; }
BitWriter.prototype.put = function (n, v) { var i; for (i = n - 1; i >= 0; i--) this.bits.push(Math.floor(v / Math.pow(2, i)) % 2); };
BitWriter.prototype.copy = function (bytes, from, to) { var p; for (p = from; p < to; p++) this.bits.push((bytes[p >> 3] >> (7 - (p & 7))) & 1); };
BitWriter.prototype.bytes = function () {                               // rbsp_trailing_bits: a one, then zeros up to the byte
  var b = this.bits.slice(), out, i;
  b.push(1);
  while (b.length % 8) b.push(0);
  out = new Uint8Array(b.length / 8);
  for (i = 0; i < b.length; i++) out[i >> 3] |= b[i] << (7 - (i & 7));
  return out;
};

/** Does a stream with this SPS stay inside `limits` (frame size, macroblock rate, DPB, bit rate)? Never guesses in favour of the stream. */
function fitsLevel(s, limits, fps, bitrate) {
  var mbs = s.widthMbs * s.heightMbs, frames = Math.max(s.numRefFrames, s.vui && s.vui.maxDecFrameBuffering || 0);
  var maxRate = limits.br * 1000 * (s.profile >= 100 ? 1.25 : 1), rate = s.vui && s.vui.bitRate ? s.vui.bitRate : (bitrate || DEFAULT_BITRATE) * 1.5;
  return mbs <= limits.fs && mbs * (fps || 30) <= limits.mbps && frames * mbs <= limits.dpb && rate <= maxRate;
}

/**
 * Rewrites one SPS NAL unit: level_idc (only ever lowered, and only to a level the stream fits) and the VUI's video_signal_type block
 * (video_full_range_flag and the colour description). Everything else is copied bit for bit. Like ffmpeg's h264_metadata filter.
 */
function rewriteSps(nal, o) {
  var s = parseSps(nal), w = new BitWriter(), rb = s.rbsp, level = s.level, c = o.colour, body, out;
  if (o.level && s.level > o.level && fitsLevel(s, o.limits, o.fps, o.bitrate)) level = o.level;
  w.copy(rb, 0, 16); w.put(8, level);
  w.copy(rb, 24, s.vuiFlagPos);
  w.put(1, 1);
  function signal() { w.put(1, 1); w.put(3, 5); w.put(1, c.fullRange ? 1 : 0); w.put(1, 1); w.put(8, c.primaries); w.put(8, c.transfer); w.put(8, c.matrix); }
  if (s.vui) { w.copy(rb, s.vui.start, s.vui.signalStart); signal(); w.copy(rb, s.vui.signalEnd, s.vui.end); }
  else { w.put(2, 0); signal(); w.put(6, 0); }                          // no aspect, no overscan | signal | no chroma loc, timing, HRDs, pic_struct, restriction
  body = escapeNal(w.bytes());
  out = new Uint8Array(body.length + 1);
  out[0] = s.nalHeader;
  out.set(body, 1);
  return out;
}

/** Splits an AVCDecoderConfigurationRecord into its SPS list, PPS list and the bytes that follow (High profile extension fields). */
function readAvcRecord(rec) {
  if (rec.length < 7 || rec[0] !== 1) throw new RangeError("not an AVCDecoderConfigurationRecord");
  var sps = [], pps = [], o = 6, n = rec[5] & 31, i, len;
  for (i = 0; i < n; i++) { len = (rec[o] << 8) | rec[o + 1]; sps.push(rec.subarray(o + 2, o + 2 + len)); o += 2 + len; }
  n = rec[o++];
  for (i = 0; i < n; i++) { len = (rec[o] << 8) | rec[o + 1]; pps.push(rec.subarray(o + 2, o + 2 + len)); o += 2 + len; }
  if (o > rec.length) throw new RangeError("the record is cut short");
  return { lengthByte: rec[4], sps: sps, pps: pps, tail: rec.subarray(o) };
}

function writeAvcRecord(parts, spsList) {
  var size = 7 + parts.tail.length, out, o = 6, i;
  spsList.forEach(function (x) { size += 2 + x.length; });
  parts.pps.forEach(function (x) { size += 2 + x.length; });
  out = new Uint8Array(size);
  out[0] = 1; out[1] = spsList[0][1]; out[2] = spsList[0][2]; out[3] = spsList[0][3]; out[4] = parts.lengthByte; out[5] = 0xE0 | spsList.length;
  spsList.forEach(function (x) { out[o++] = x.length >> 8; out[o++] = x.length & 255; out.set(x, o); o += x.length; });
  out[o++] = parts.pps.length;
  parts.pps.forEach(function (x) { out[o++] = x.length >> 8; out[o++] = x.length & 255; out.set(x, o); o += x.length; });
  out.set(parts.tail, o);
  return out;
}

/**
 * normaliseAvcRecord(description, { fps, bitrate }) -> { record, before, after }
 * `description` is the avcC payload the encoder reports. The result says BT.709, limited range, and level 4.0 when the stream fits
 * level 4.0 (its level is left alone when it already is 4.0 or lower, or when it does not fit). `before` and `after` are spsFacts.
 */
function normaliseAvcRecord(description, o) {
  o = o || {};
  var parts = readAvcRecord(description), before = null;
  var list = parts.sps.map(function (nal) {
    if (!before) before = spsFacts(parseSps(nal));
    return rewriteSps(nal, { level: TARGET_LEVEL, limits: LEVEL_4_0, fps: o.fps, bitrate: o.bitrate, colour: COLOUR_CODES });
  });
  if (!list.length) throw new RangeError("the record holds no SPS");
  return { record: writeAvcRecord(parts, list), before: before, after: spsFacts(parseSps(list[0])) };
}

/* ------------------------------------------------------------------ reading a finished MP4 */

function toBytes(x) { return x instanceof Uint8Array ? x : x && x.buffer ? new Uint8Array(x.buffer, x.byteOffset, x.byteLength) : new Uint8Array(x); }

/** The first video track's avcC payload and colr box, found by walking the boxes (no decoding). */
function findVideoBoxes(bytes) {
  var dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), found = { avcC: null, colr: null };
  function cc(o) { return String.fromCharCode(bytes[o], bytes[o + 1], bytes[o + 2], bytes[o + 3]); }
  function walk(start, end) {
    var o = start, size, head, type, body, stop;
    while (o + 8 <= end) {
      size = dv.getUint32(o); head = 8; type = cc(o + 4);
      if (size === 1 && o + 16 <= end) { size = dv.getUint32(o + 8) * 4294967296 + dv.getUint32(o + 12); head = 16; }
      else if (size === 0) size = end - o;
      if (size < head || o + size > end) break;
      body = o + head; stop = o + size;
      if (type === "moov" || type === "trak" || type === "mdia" || type === "minf" || type === "stbl") walk(body, stop);
      else if (type === "stsd") walk(body + 8, stop);
      else if (type === "avc1" || type === "avc3") walk(body + 78, stop);
      else if (type === "avcC" && !found.avcC) found.avcC = bytes.subarray(body, stop);
      else if (type === "colr" && !found.colr && stop - body >= 10) {
        found.colr = { type: cc(body), primaries: dv.getUint16(body + 4), transfer: dv.getUint16(body + 6), matrix: dv.getUint16(body + 8), fullRange: stop - body >= 11 ? !!(bytes[body + 10] & 128) : null };
      }
      o += size;
    }
  }
  walk(0, bytes.length);
  return found;
}

/**
 * inspect(mp4Bytes) -> what the file says about itself, in ffprobe's words: { codec, profile, level (35 = 3.5 ... 40 = 4.0), width,
 * height, pixFmt, range ("tv" | "pc" | "unspecified"), colour: { primaries, transfer, matrix } (names or null), colr, numRefFrames }.
 * Null when the bytes hold no H.264 track.
 */
function mp4Inspect(input) {
  var bytes = toBytes(input), boxes, parts, f, hex = function (n) { return ("0" + n.toString(16)).slice(-2); }, pix;
  try {
    boxes = findVideoBoxes(bytes);
    if (!boxes.avcC) return null;
    parts = readAvcRecord(boxes.avcC);
    f = spsFacts(parseSps(parts.sps[0]));
  } catch (e) { return null; }
  pix = f.chromaFormat === 1 && f.bitDepth === 8 ? (f.fullRange ? "yuvj420p" : "yuv420p") : "yuv4" + ["00", "20", "22", "44"][f.chromaFormat] + "p" + (f.bitDepth > 8 ? f.bitDepth + "le" : "");
  return {
    codec: "avc1." + hex(f.profile) + hex(f.compat) + hex(f.level), profile: f.profile, level: f.level, width: f.width, height: f.height, numRefFrames: f.numRefFrames,
    pixFmt: pix, range: f.fullRange === null ? "unspecified" : f.fullRange ? "pc" : "tv",
    colour: { primaries: codeName(f.primaries), transfer: codeName(f.transfer), matrix: codeName(f.matrix) },
    colr: boxes.colr ? { type: boxes.colr.type, primaries: codeName(boxes.colr.primaries), transfer: codeName(boxes.colr.transfer), matrix: codeName(boxes.colr.matrix), fullRange: boxes.colr.fullRange } : null
  };
}

/* ------------------------------------------------------------------ canvas pixels -> I420 (BT.709, limited range) */

var LITTLE_ENDIAN = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;
var SHIFT_R = LITTLE_ENDIAN ? 0 : 24, SHIFT_G = LITTLE_ENDIAN ? 8 : 16, SHIFT_B = LITTLE_ENDIAN ? 16 : 8;
var KR = 0.2126, KB = 0.0722, KG = 1 - KR - KB;                          // BT.709 luma weights
var Y_R = Math.round(219 / 255 * KR * 65536), Y_G = Math.round(219 / 255 * KG * 65536), Y_B = Math.round(219 / 255 * KB * 65536);
var CB_R = Math.round(-224 / 255 * 0.5 * KR / (1 - KB) * 65536), CB_G = Math.round(-224 / 255 * 0.5 * KG / (1 - KB) * 65536), CB_B = Math.round(224 / 255 * 0.5 * 65536);
var CR_R = CB_B, CR_G = Math.round(-224 / 255 * 0.5 * KG / (1 - KR) * 65536), CR_B = Math.round(-224 / 255 * 0.5 * KB / (1 - KR) * 65536);
var Y_OFFSET = 16 * 65536 + 32768, C_OFFSET = 128 * 65536 + 32768;       // black at 16, neutral chroma at 128, plus half a unit to round

/**
 * A window of `height` rows starting at row `y0` of a canvas that is `width` pixels wide, kept as I420 planes between frames.
 * convert() rewrites only the 2x2 blocks that differ from the previous frame of the same canvas (a still cover costs almost nothing).
 */
function YuvView(width, y0, height) {
  this.w = width; this.h = height; this.y0 = y0;
  this.buf = new Uint8Array(width * height * 3 / 2);
  this.Y = this.buf.subarray(0, width * height);
  this.U = this.buf.subarray(width * height, width * height * 5 / 4);
  this.V = this.buf.subarray(width * height * 5 / 4);
}

YuvView.prototype.convert = function (px, prev) {                       // px, prev: Uint32Array of the whole canvas (RGBA bytes); prev may be null
  var W = this.w, H = this.h, Y = this.Y, U = this.U, V = this.V, cw = W >> 1, all = !prev, y, x, p0, p1, yo0, yo1, co, a, b, c, d;
  var ar, ag, ab, br, bg, bb, cr, cg, cb, dr, dg, db, r, g, bl;
  for (y = 0; y < H; y += 2) {
    p0 = (this.y0 + y) * W; p1 = p0 + W; yo0 = y * W; yo1 = yo0 + W; co = (y >> 1) * cw;
    for (x = 0; x < W; x += 2) {
      a = px[p0]; b = px[p0 + 1]; c = px[p1]; d = px[p1 + 1];
      if (all || a !== prev[p0] || b !== prev[p0 + 1] || c !== prev[p1] || d !== prev[p1 + 1]) {
        ar = (a >>> SHIFT_R) & 255; ag = (a >>> SHIFT_G) & 255; ab = (a >>> SHIFT_B) & 255;
        br = (b >>> SHIFT_R) & 255; bg = (b >>> SHIFT_G) & 255; bb = (b >>> SHIFT_B) & 255;
        cr = (c >>> SHIFT_R) & 255; cg = (c >>> SHIFT_G) & 255; cb = (c >>> SHIFT_B) & 255;
        dr = (d >>> SHIFT_R) & 255; dg = (d >>> SHIFT_G) & 255; db = (d >>> SHIFT_B) & 255;
        Y[yo0] = (Y_R * ar + Y_G * ag + Y_B * ab + Y_OFFSET) >> 16;
        Y[yo0 + 1] = (Y_R * br + Y_G * bg + Y_B * bb + Y_OFFSET) >> 16;
        Y[yo1] = (Y_R * cr + Y_G * cg + Y_B * cb + Y_OFFSET) >> 16;
        Y[yo1 + 1] = (Y_R * dr + Y_G * dg + Y_B * db + Y_OFFSET) >> 16;
        r = (ar + br + cr + dr + 2) >> 2; g = (ag + bg + cg + dg + 2) >> 2; bl = (ab + bb + cb + db + 2) >> 2;
        U[co] = (CB_R * r + CB_G * g + CB_B * bl + C_OFFSET) >> 16;
        V[co] = (CR_R * r + CR_G * g + CR_B * bl + C_OFFSET) >> 16;
      }
      p0 += 2; p1 += 2; yo0 += 2; yo1 += 2; co++;
    }
  }
};

/** The converted planes as a VideoFrame that states its colour space. A browser that ignores the colorSpace member still gets the right pixels. */
YuvView.prototype.frame = function (timestamp, duration) {
  var init = { format: "I420", codedWidth: this.w, codedHeight: this.h, timestamp: timestamp, duration: duration, colorSpace: COLOUR };
  try { return new VideoFrame(this.buf, init); }
  catch (e) {
    delete init.colorSpace;
    try { return new VideoFrame(this.buf, init); }
    catch (e2) { throw mp4Error("E_ENCODER_UNSUPPORTED", "This browser cannot build I420 video frames.", { cause: String(e2 && e2.message || e2) }); }
  }
};

/** All pixels of a canvas as a Uint32Array of RGBA bytes (sRGB). Draws through a scratch canvas when the canvas has no 2D context. */
function readCanvas(entry) {
  var c = entry.canvas, ctx = entry.ctx;
  if (!ctx) {
    ctx = c.getContext && c.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      entry.scratch = entry.scratch || document.createElement("canvas");
      entry.scratch.width = c.width; entry.scratch.height = c.height;
      ctx = entry.scratch.getContext("2d", { willReadFrequently: true });
    }
    entry.ctx = ctx;
  }
  if (entry.scratch) ctx.drawImage(c, 0, 0);
  var data = ctx.getImageData(0, 0, c.width, c.height, { colorSpace: "srgb" }).data;
  return new Uint32Array(data.buffer, data.byteOffset, data.byteLength >> 2);
}

/**
 * encodeMany({ canvases, frames, fps, drawFrame(i), bitrate?, onProgress?, signal? }) -> one MP4 per entry of `canvases`.
 * An entry is a canvas, or { canvas, y, height } for a full-width window of one (so a 4:5 crop of the 3:4 paint costs no second read).
 * `drawFrame(i)` must leave frame i on every canvas (it is awaited before the frames are read), so one paint feeds several crops of the
 * same cover. Canvases must be opaque (the exporter's are).
 */
async function mp4EncodeMany(opts) {
  var entries = opts.canvases, frames = opts.frames, fps = opts.fps || 30, signal = opts.signal, bitrate = opts.bitrate || DEFAULT_BITRATE;
  if (!entries || !entries.length || !(frames > 0) || typeof opts.drawFrame !== "function") throw mp4Error("E_USAGE", "mp4.encode needs canvases, a frame count and a drawFrame function.");
  var views = entries.map(function (e) { var c = e && e.canvas ? e.canvas : e; return { canvas: c, y: e && e.canvas ? e.y || 0 : 0, h: e && e.canvas ? e.height || c.height : c.height }; });
  var support = await mp4Support(views[0].canvas.width, views[0].h, fps);
  if (!support.supported) throw mp4Error("E_ENCODER_UNSUPPORTED", support.reason || "H.264 encoding is not supported here.", { codec: null });
  var mb = await loadMediabunny();
  if (signal && signal.aborted) throw mp4Error("E_ABORTED", "The export was cancelled.");
  var reads = [], yuv = views.map(function (v) {
    var at = -1, k;
    for (k = 0; k < reads.length; k++) if (reads[k].canvas === v.canvas) at = k;
    if (at < 0) { reads.push({ canvas: v.canvas, ctx: null, scratch: null, prev: null }); at = reads.length - 1; }
    return { read: reads[at], view: new YuvView(v.canvas.width, v.y, v.h) };
  });
  function hook(packet, meta) {                                         // runs just before the muxer reads the decoder config
    var dc = meta && meta.decoderConfig;
    if (!dc || !dc.description) return;
    try {
      dc.description = normaliseAvcRecord(toBytes(dc.description), { fps: fps, bitrate: bitrate }).record.buffer;
      dc.colorSpace = { primaries: COLOUR.primaries, transfer: COLOUR.transfer, matrix: COLOUR.matrix, fullRange: COLOUR.fullRange };
    } catch (e) { /* headers this reader cannot parse stay as the encoder wrote them; gate V1 reports what the file says */ }
  }
  var outputs = yuv.map(function () { return new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: "in-memory" }), target: new mb.BufferTarget() }); });
  var sources = yuv.map(function () {
    return new mb.VideoSampleSource({ codec: "avc", fullCodecString: support.codec, bitrate: bitrate, keyFrameInterval: KEYFRAME_SECONDS, onEncodedPacket: hook });
  });
  outputs.forEach(function (out, k) { out.addVideoTrack(sources[k], { frameRate: fps }); });
  await Promise.all(outputs.map(function (out) { return out.start(); }));
  var i, step = Math.max(1, Math.round(frames / 30));
  try {
    for (i = 0; i < frames; i++) {
      if (signal && signal.aborted) throw mp4Error("E_ABORTED", "The export was cancelled.");
      await opts.drawFrame(i);
      reads.forEach(function (rd) { rd.cur = readCanvas(rd); });
      yuv.forEach(function (y) { y.view.convert(y.read.cur, y.read.prev); });
      reads.forEach(function (rd) { if (rd.prev) rd.prev.set(rd.cur); else rd.prev = new Uint32Array(rd.cur); rd.cur = null; });
      await Promise.all(sources.map(function (src, k) {
        var sample = new mb.VideoSample(yuv[k].view.frame(Math.round(i * 1e6 / fps), Math.round(1e6 / fps)), { timestamp: i / fps, duration: 1 / fps });
        return src.add(sample).then(function () { sample.close(); }, function (e) { sample.close(); throw e; });
      }));
      if (opts.onProgress && (i % step === 0 || i === frames - 1)) opts.onProgress({ job: "mp4", done: i + 1, total: frames, label: "frames" });
    }
    await Promise.all(outputs.map(function (out) { return out.finalize(); }));
  } catch (e) {
    await Promise.all(outputs.map(function (out) { return Promise.resolve().then(function () { return out.cancel(); }).catch(function () { /* already closed */ }); }));
    throw e;
  }
  return outputs.map(function (out) { return new Uint8Array(out.target.buffer); });
}

/** encode({ canvas, frames, fps, drawFrame(i), bitrate?, onProgress?, signal? }) -> MP4 bytes. */
async function mp4Encode(opts) {
  var list = await mp4EncodeMany(Object.assign({}, opts, { canvases: [opts.canvas] }));
  return list[0];
}

var X = (CS.export = CS.export || {});
X.DEPS = DEPS;
X.mp4 = { support: mp4Support, encode: mp4Encode, encodeMany: mp4EncodeMany, inspect: mp4Inspect, normalise: normaliseAvcRecord, COLOUR: COLOUR };

  /* ---- file: clip.js ---- */
/* Local clip covers. No clip bytes enter the spec; the host attaches a File/Blob by its post-relative name. */
var clipFiles = new Map();
var CLIP_HOLD = 0.4, CLIP_RETURN = 0.6, CLIP_MIN = 6, CLIP_MAX = 15;

function localClipPath(file) {
  return typeof file === "string" && file.length <= 512 && file.length > 0 &&
    !/^[\/]|[\\:%?#\x00-\x1f]/.test(file) && !file.split("/").some(function (s) { return !s || s.charAt(0) === "."; });
}

function validateClip(motion) {
  var c = motion && motion.clip, seconds = motion && motion.seconds;
  var finite = function (n) { return typeof n === "number" && isFinite(n); };
  if (!c || !localClipPath(c.file)) throw mp4Error("E_SCHEMA", "cover.motion.clip.file must name a file inside the post folder.");
  if (!finite(seconds) || seconds < CLIP_MIN || seconds > CLIP_MAX) throw mp4Error("E_SCHEMA", "A clip cover must last 6 to 15 seconds.");
  if (!finite(c.in) || !finite(c.out) || c.in < 0 || c.out <= c.in) throw mp4Error("E_SCHEMA", "The clip out point must be after its non-negative in point.");
  if (["cover", "contain"].indexOf(c.fit) < 0) throw mp4Error("E_SCHEMA", "Clip fit must be cover or contain.");
  if (!c.focus || !finite(c.focus.x) || !finite(c.focus.y) || c.focus.x < 0 || c.focus.x > 1 || c.focus.y < 0 || c.focus.y > 1) throw mp4Error("E_SCHEMA", "Clip focus x and y must be between 0 and 1.");
  if (["auto", "wipe", "dissolve"].indexOf(c.ending) < 0) throw mp4Error("E_SCHEMA", "Clip ending must be auto, wipe or dissolve.");
  return motion;
}

function clipAt(m, t) {
  var end = m.seconds - CLIP_HOLD, live = end - CLIP_HOLD;
  return { poster: t < CLIP_HOLD || t >= end, time: m.clip.in + (m.clip.out - m.clip.in) * Math.max(0, Math.min(1, (t - CLIP_HOLD) / live)),
    returning: Math.max(0, Math.min(1, (t - (end - CLIP_RETURN)) / CLIP_RETURN)) };
}

function clipFitRect(sw, sh, dw, dh, fit, focus) {
  var scale = fit === "contain" ? Math.min(dw / sw, dh / sh) : Math.max(dw / sw, dh / sh);
  if (fit === "contain") return { sx: 0, sy: 0, sw: sw, sh: sh, dx: (dw - sw * scale) * focus.x, dy: (dh - sh * scale) * focus.y, dw: sw * scale, dh: sh * scale };
  var w = dw / scale, h = dh / scale;
  return { sx: (sw - w) * focus.x, sy: (sh - h) * focus.y, sw: w, sh: h, dx: 0, dy: 0, dw: dw, dh: dh };
}

function clipEnding(request, similarity) { return request === "wipe" || similarity < 0.985 ? "wipe" : "dissolve"; }

/** Give the engine a media slot when the original cover had none. Typography and chrome remain engine-owned. */
function clipLayoutSpec(spec) {
  if (!(spec.cover && spec.cover.motion && spec.cover.motion.clip)) return spec;
  var slides = spec.slides.slice(), s = slides[0];
  slides[0] = Object.assign({}, s, { media: Object.assign({}, s.media || {}, { slot: s.media && s.media.slot && s.media.slot !== "none" ? s.media.slot : "screenshot" }) });
  return Object.assign({}, spec, { slides: slides });
}

function attachClipFile(name, blob) {
  if (!localClipPath(name) || !(blob instanceof Blob)) throw mp4Error("E_USAGE", "Attach the local clip as a File or Blob under its post-relative name.");
  clipFiles.set(name, blob);
  if (typeof clipPosterCache !== "undefined") clipPosterCache.clear();
  if (typeof CS.emit === "function") CS.emit("cs:cover-clip", { file: name });
}

/** Native browser decoders via the same pinned MP4 library used by the encoder. */
async function openClip(blob, signal) {
  var mb = await loadMediabunny(), input = new mb.Input({ source: new mb.BlobSource(blob), formats: mb.ALL_FORMATS }), codec = "unknown";
  try {
    var track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error("no video track");
    codec = await track.getCodecParameterString();
    if (!await track.canDecode()) throw new Error("no browser decoder");
    var sink = new mb.VideoSampleSink(track), duration = await (typeof track.computeDuration === "function" ? track.computeDuration() : input.computeDuration());
    return {
      codec: codec, duration: duration,
      sample: async function (time) {
        if (signal && signal.aborted) throw mp4Error("E_ABORTED", "The export was cancelled.");
        try {
          var sample = await sink.getSample(time);
          if (!sample) throw new Error("no frame at " + time.toFixed(3) + " s");
          return sample;
        } catch (e) {
          if (e && e.code === "E_ABORTED") throw e;
          throw mp4Error("E_NO_CAPABILITY", "Cannot decode clip codec " + codec + ". Save your clip as an H.264 MP4 (8-bit SDR), then attach it again.", { codec: codec, cause: String(e.message || e) });
        }
      },
      close: function () { input.dispose(); }
    };
  } catch (e) {
    input.dispose();
    throw mp4Error("E_NO_CAPABILITY", "Cannot decode clip codec " + codec + ". Save your clip as an H.264 MP4 (8-bit SDR), then attach it again.", { codec: codec, cause: String(e.message || e) });
  }
}

function clipCanvas(w, h) { var c = document.createElement("canvas"); c.width = w; c.height = h; return c; }
function clipPixels(canvas) { return canvas.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height); }

/** Paint two probe colours through the real DOM. Their difference is the media coverage, including occluding type and rounded edges. */
async function clipLayer(slide, media, rect, mask) {
  var red, blue;
  media.style.background = "#ff0000";
  red = clipPixels(await CS.paint.toCanvas(slide, { scale: 1, mask: mask }));
  media.style.background = "#0000ff";
  blue = clipPixels(await CS.paint.toCanvas(slide, { scale: 1, mask: mask }));
  var alpha = new Float32Array(rect.w * rect.h), base = new Uint8ClampedArray(rect.w * rect.h * 4), k = 0, x, y, j;
  for (y = 0; y < rect.h; y++) for (x = 0; x < rect.w; x++, k++) {
    j = ((rect.y + y) * red.width + rect.x + x) * 4;
    alpha[k] = Math.max(0, Math.min(1, (red.data[j] - blue.data[j]) / 255));
    base.set(red.data.subarray(j, j + 4), k * 4);
  }
  return { full: red, base: base, alpha: alpha };
}

function clipComposite(layer, pixels, dest) {
  var d = dest.data, a = layer.alpha, b = layer.base, s = pixels.data, i, j;
  for (i = 0; i < a.length; i++) {
    j = i * 4;
    d[j] = b[j] + a[i] * (s[j] - 255); d[j + 1] = b[j + 1] + a[i] * s[j + 1]; d[j + 2] = b[j + 2] + a[i] * s[j + 2]; d[j + 3] = 255;
  }
}

function clipLuminance(r, g, b) {
  function linear(v) { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

function clipCalmRules() {
  var p = { body: 4.5, large: 3, largeMinPx: 66, largeBoldMinPx: 52, decile: 0.1 };
  if (CS.qa && typeof CS.qa.rules === "function") {
    var rules = CS.qa.rules(), gate = (rules.gates || []).find(function (g) { return g.id === "D4"; });
    var check = gate && gate.checks.find(function (c) { return c.id === "D4.contrast"; });
    Object.keys(p).forEach(function (k) { if (check && check.params && typeof check.params[k] === "number") p[k] = check.params[k]; });
  }
  return p;
}

/** Same worst-decile contrast floors as D4/calm zones, measured against the text-free composite on EVERY output frame. */
function clipTextRegions(slide, rect) {
  var rules = clipCalmRules();
  var origin = slide.getBoundingClientRect(), scale = origin.width / (slide.offsetWidth || 1080), out = [], nodes = slide.querySelectorAll(".w, .cs-handle, .cs-meta, .cs-counter, .cs-swipe");
  Array.prototype.forEach.call(nodes, function (node) {
    if (node.querySelector(".w")) return;
    var r = node.getBoundingClientRect(), cs = getComputedStyle(node), rgb = cs.color.match(/[\d.]+/g), size = parseFloat(cs.fontSize), weight = parseInt(cs.fontWeight, 10) || 400;
    var x = Math.max(rect.x, Math.floor((r.left - origin.left) / scale)), y = Math.max(rect.y, Math.floor((r.top - origin.top) / scale));
    var right = Math.min(rect.x + rect.w, Math.ceil((r.right - origin.left) / scale)), bottom = Math.min(rect.y + rect.h, Math.ceil((r.bottom - origin.top) / scale));
    if (!rgb || right <= x || bottom <= y || cs.visibility === "hidden") return;
    var slot = node.closest("[data-slot]");
    out.push({ x: x - rect.x, y: y - rect.y, w: right - x, h: bottom - y, lum: clipLuminance(+rgb[0], +rgb[1], +rgb[2]),
      need: size >= rules.largeMinPx || (size >= rules.largeBoldMinPx && weight >= 700) ? rules.large : rules.body, decile: rules.decile, el: slot ? slot.getAttribute("data-slot") : node.className });
  });
  return out;
}

/**
 * An inline box is taller than its glyphs, so a headline that sits just below the window still has a box that reaches into it.
 * Keep, per text box, only the part whose ink covers footage: there the text-free probe shows the media and the painted one does not.
 */
function clipInkRegions(regions, rect, painted, textless) {
  var pad = 2;
  return regions.map(function (r) {
    var x0 = r.x + r.w, y0 = r.y + r.h, x1 = -1, y1 = -1, x, y, k;
    for (y = r.y; y < r.y + r.h; y++) for (x = r.x; x < r.x + r.w; x++) {
      k = y * rect.w + x;
      if (textless[k] - painted[k] > 0.2) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    if (x1 < 0) return null;
    x0 = Math.max(r.x, x0 - pad); y0 = Math.max(r.y, y0 - pad); x1 = Math.min(r.x + r.w - 1, x1 + pad); y1 = Math.min(r.y + r.h - 1, y1 + pad);
    return Object.assign({}, r, { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 });
  }).filter(Boolean);
}

function clipContrast(pixels, regions, frame, fps) {
  var data = pixels.data, w = pixels.width;
  for (var r of regions) {
    var ratios = [];
    for (var y = r.y; y < r.y + r.h; y += 3) for (var x = r.x; x < r.x + r.w; x += 3) {
      var j = (y * w + x) * 4, l = clipLuminance(data[j], data[j + 1], data[j + 2]);
      ratios.push((Math.max(r.lum, l) + 0.05) / (Math.min(r.lum, l) + 0.05));
    }
    ratios.sort(function (a, b) { return a - b; });
    var n = Math.max(1, Math.ceil(ratios.length * r.decile)), ratio = ratios.slice(0, n).reduce(function (a, b) { return a + b; }, 0) / n;
    if (ratio < r.need) throw mp4Error("E_NO_CAPABILITY", "Clip frame " + frame + " (" + (frame / fps).toFixed(3) + " s) breaks the calm zone behind " + r.el + ": contrast " + ratio.toFixed(2) + ", required " + r.need + ". Move the media window away from the text or add an opaque text panel.", { reason: "clip-contrast", frame: frame, seconds: frame / fps, el: r.el, ratio: ratio, need: r.need });
  }
}

/** Prepared poster and drawFrame share the engine's layout. Only pixels inside its measured media window change. */
async function prepareClipCover(spec, slide, tokens, signal) {
  var m = validateClip(spec.cover.motion), cfg = m.clip, blob = clipFiles.get(cfg.file);
  if (!blob) throw mp4Error("E_NO_CAPABILITY", "Attach the local cover clip " + cfg.file + " from the post folder before exporting.", { reason: "clip-missing", file: cfg.file });
  var reader = await openClip(blob, signal), media = slide.querySelector('[data-slot="media"]');
  try {
    if (cfg.out > reader.duration + 0.001) throw mp4Error("E_SCHEMA", "Clip out point " + cfg.out + " exceeds its duration " + reader.duration.toFixed(3) + " s.");
    if (!media) throw mp4Error("E_SCHEMA", "The cover needs a media window for the clip.");
    var sr = slide.getBoundingClientRect(), mr = media.getBoundingClientRect(), scale = sr.width / (slide.offsetWidth || 1080);
    var rect = { x: Math.max(0, Math.floor((mr.left - sr.left) / scale)), y: Math.max(0, Math.floor((mr.top - sr.top) / scale)) };
    rect.w = Math.min(1080, Math.ceil((mr.right - sr.left) / scale)) - rect.x;
    rect.h = Math.min(1440, Math.ceil((mr.bottom - sr.top) / scale)) - rect.y;
    if (rect.w < 2 || rect.h < 2) throw mp4Error("E_SCHEMA", "The cover media window has no usable area. Choose a cover layout with room for footage.");
    var children = Array.prototype.slice.call(media.childNodes), style = media.getAttribute("style"), fullLayer, background;
    var regions = clipTextRegions(slide, rect);
    try {
      media.replaceChildren();
      fullLayer = await clipLayer(slide, media, rect, false);
      if (regions.length) background = await clipLayer(slide, media, rect, true);
    } finally {
      media.replaceChildren.apply(media, children);
      if (style === null) media.removeAttribute("style"); else media.setAttribute("style", style);
    }
    if (regions.length) regions = clipInkRegions(regions, rect, fullLayer.alpha, background.alpha);
    var windowCanvas = clipCanvas(rect.w, rect.h), wc = windowCanvas.getContext("2d", { alpha: false, willReadFrequently: true });
    var full = clipCanvas(1080, 1440), fc = full.getContext("2d", { alpha: false, willReadFrequently: true });
    var composed = wc.createImageData(rect.w, rect.h), textless = regions.length ? wc.createImageData(rect.w, rect.h) : null;
    fc.putImageData(fullLayer.full, 0, 0);
    async function windowAt(time) {
      var sample = await reader.sample(time);
      try {
        wc.fillStyle = tokens && tokens.roles && tokens.roles.bg || "#000000"; wc.fillRect(0, 0, rect.w, rect.h);
        var source = sample.toVideoFrame(), fit;
        try {
          fit = clipFitRect(source.displayWidth, source.displayHeight, rect.w, rect.h, cfg.fit, cfg.focus);
          wc.drawImage(source, fit.sx, fit.sy, fit.sw, fit.sh, fit.dx, fit.dy, fit.dw, fit.dh);
        } finally { source.close(); }
        return clipPixels(windowCanvas);
      } finally { sample.close(); }
    }
    var firstWindow = await windowAt(cfg.in), endpoint = await windowAt(Math.max(cfg.in, cfg.out - 1 / 120));
    var ca = clipCanvas(rect.w, rect.h), cz = clipCanvas(rect.w, rect.h);
    ca.getContext("2d").putImageData(firstWindow, 0, 0); cz.getContext("2d").putImageData(endpoint, 0, 0);
    var similarity = CS.paint.metrics.ssim(ca, cz), ending = clipEnding(cfg.ending, similarity);
    var frames = Math.round(m.seconds * 30);
    async function drawFrame(i) {
      if (signal && signal.aborted) throw mp4Error("E_ABORTED", "The export was cancelled.");
      var at = clipAt(m, i / 30), pixels = at.poster ? firstWindow : await windowAt(at.time);
      if (!at.poster && at.returning > 0) {
        var p = at.returning * at.returning * (3 - 2 * at.returning), d = pixels.data, b = firstWindow.data;
        var edge = Math.round(rect.w * (slide.getAttribute("dir") === "rtl" ? 1 - p : p));
        for (var y = 0; y < rect.h; y++) for (var x = 0; x < rect.w; x++) {
          var j = (y * rect.w + x) * 4, reveal = slide.getAttribute("dir") === "rtl" ? x >= edge : x < edge;
          for (var k = 0; k < 3; k++) d[j + k] = ending === "dissolve" ? d[j + k] * (1 - p) + b[j + k] * p : reveal ? b[j + k] : d[j + k];
        }
      }
      if (regions.length) { clipComposite(background, pixels, textless); clipContrast(textless, regions, i, 30); }
      clipComposite(fullLayer, pixels, composed); fc.putImageData(composed, rect.x, rect.y);
      return full;
    }
    await drawFrame(0);
    var poster = clipCanvas(1080, 1440); poster.getContext("2d").drawImage(full, 0, 0);
    return { canvas: full, poster: poster, frames: frames, duration: frames / 30, ending: ending, endpointSsim: similarity,
      rect: rect, mediaPoster: ca, drawFrame: drawFrame, close: reader.close };
  } catch (e) { reader.close(); throw e; }
}

/** Decode an encoded output frame. Stills use these pixels, never a second RGB/YUV conversion of a different poster. */
async function decodeClipPoster(bytes, time) {
  var reader = await openClip(new Blob([bytes], { type: "video/mp4" }));
  try {
    var sample = await reader.sample(time || 0), frame;
    try {
      frame = sample.toVideoFrame();
      var c = clipCanvas(frame.displayWidth, frame.displayHeight);
      c.getContext("2d", { alpha: false }).drawImage(frame, 0, 0);
      return c;
    } finally { if (frame) frame.close(); sample.close(); }
  } finally { reader.close(); }
}

X.mp4.clip = { validate: validateClip, at: clipAt, fitRect: clipFitRect, ending: clipEnding, localPath: localClipPath,
  attachFile: attachClipFile, hasFile: function (name) { return clipFiles.has(name); }, detachFile: function (name) { clipFiles.delete(name); }, layoutSpec: clipLayoutSpec,
  prepare: prepareClipCover, decodePoster: decodeClipPoster };

/* Video-specific Studio adapters. The core UI calls these only for cover previews and local file choice. */
var clipPosterCache = new Map();
X.mp4.clip.preview = async function (spec, ctx, render, index) {
  var m = spec.cover && spec.cover.motion;
  if (index || !m || !m.clip || !X.clipPoster) return render;
  render.el.setAttribute("data-cover-video", clipFiles.has(m.clip.file) ? "attached" : "missing");
  if (!clipFiles.has(m.clip.file)) return render;
  var key = JSON.stringify([spec.rev, spec.style, spec.slides[0], m, ctx.brand && ctx.brand.rev]), job = clipPosterCache.get(key);
  if (!job) {
    job = X.clipPoster(spec, { brand: ctx.brand, assets: ctx.assets }).then(function (c) { return c.toDataURL("image/png"); });
    clipPosterCache.set(key, job);
    if (clipPosterCache.size > 4) clipPosterCache.delete(clipPosterCache.keys().next().value);
  }
  try {
    var image = document.createElement("img"); image.src = await job; image.alt = "";
    image.setAttribute("aria-hidden", "true"); image.setAttribute("data-cover-poster", "");
    image.style.cssText = "position:absolute;inset:0;width:100%;height:100%;z-index:100;pointer-events:none";
    render.el.appendChild(image);
    render.el.addEventListener("focusin", function () { image.hidden = true; });
    render.el.addEventListener("focusout", function () { image.hidden = false; });
  } catch (e) {
    clipPosterCache.delete(key); render.el.setAttribute("data-cover-video", "failed");
    if (CS.emit) CS.emit("cs:error", { code: e.code, message: e.message });
  }
  return render;
};

X.mp4.clip.picker = function (ctx, lang) {
  var host = document.createElement("div"); host.className = "ui-note"; host.setAttribute("aria-live", "polite");
  var text = function (ar, en) { return lang === "en" ? en : ar; };
  host.update = function () {
    host.replaceChildren(); host.hidden = ctx.index() !== 0;
    var c = ctx.spec.cover && ctx.spec.cover.motion && ctx.spec.cover.motion.clip;
    if (c) {
      var label = document.createElement("span"), name = document.createElement("bdi"); name.dir = "ltr"; name.textContent = c.file;
      label.textContent = text("فيديو مرفق: ", "Video attached: "); label.appendChild(name); host.appendChild(label);
    }
    var input = document.createElement("input"), button = document.createElement("button");
    input.type = "file"; input.accept = "video/*"; input.hidden = true;
    input.setAttribute("aria-label", text("اختر فيديو الغلاف", "Choose cover video"));
    button.type = "button"; button.className = "ui-btn ui-btn--ghost ui-btn--sm";
    button.textContent = text(c ? "اختر الملف للمعاينة" : "أرفق فيديو الغلاف", c ? "Choose file to preview" : "Attach cover video");
    button.onclick = function () { input.click(); };
    input.onchange = async function () {
      var file = input.files[0]; if (!file) return;
      var url = URL.createObjectURL(file), video = document.createElement("video");
      video.preload = "metadata";
      try {
        await new Promise(function (ok, fail) { video.onloadedmetadata = ok; video.onerror = fail; video.src = url; });
        var name = c ? c.file : file.name;
        var m = { recipe: "calm", source: "internal", seconds: Math.max(6, Math.min(15, video.duration + 0.8)),
          clip: { file: name, in: 0, out: video.duration, fit: "cover", focus: { x: 0.5, y: 0.5 }, ending: "auto" } };
        if (c) m = Object.assign({}, ctx.spec.cover.motion, { clip: Object.assign({}, c) });
        validateClip(m); attachClipFile(name, file); clipPosterCache.clear(); ctx.setMotion(m);
      } catch (e) {
        var error = document.createElement("span"); error.setAttribute("role", "alert");
        if (lang === "en") error.textContent = "Cannot open video. Choose an H.264 MP4.";
        else {
          var format = document.createElement("bdi"), codec = document.createElement("bdi");
          format.dir = codec.dir = "ltr"; format.textContent = "MP4"; codec.textContent = "H.264";
          error.append("تعذر فتح الفيديو. اختر ملف ", format, " بترميز ", codec, ".");
        }
        host.appendChild(error);
      }
      finally { video.removeAttribute("src"); video.load(); URL.revokeObjectURL(url); }
    };
    host.appendChild(button); host.appendChild(input);
  };
  return host;
};
})();
