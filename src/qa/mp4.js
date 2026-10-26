/* Carousel Studio · cs-qa · MP4 inspection
 *
 * A small ISO-BMFF reader that fills a VideoInfo (CONTRACT 4.4) from the bytes
 * of an exported cover: box order (faststart), track size, frame count and
 * rate, keyframes, codec string, audio track and author-style metadata atoms.
 * It does not decode video, so closed-GOP and blank-frame facts stay unknown
 * and are left to the exporter or to check_video.mjs.
 */

const MP4_CONTAINERS = { moov: 1, trak: 1, mdia: 1, minf: 1, stbl: 1, udta: 1, ilst: 1, edts: 1, dinf: 1, mvex: 1 };
const MP4_PERSONAL = ["\u00A9ART", "\u00A9aut", "\u00A9cpy", "\u00A9own", "\u00A9wrt", "auth", "perf", "cprt"];

function inspectMp4(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const cc4 = (o) => String.fromCharCode(bytes[o], bytes[o + 1], bytes[o + 2], bytes[o + 3]);
  const u32 = (o) => dv.getUint32(o);
  const u16 = (o) => dv.getUint16(o);
  const res = {
    ok: false,
    topBoxes: [],
    personalAtoms: [],
    moovBeforeMdat: undefined,
    tracks: [],
    brand: ""
  };
  let track = null;

  function walk(start, end, depth) {
    let o = start;
    while (o + 8 <= end) {
      let size = u32(o);
      const type = cc4(o + 4);
      let head = 8;
      if (size === 1 && o + 16 <= end) {
        size = u32(o + 8) * 4294967296 + u32(o + 12);
        head = 16;
      } else if (size === 0) {
        size = end - o;
      }
      if (size < head || o + size > end) break;
      const body = o + head;
      const stop = o + size;
      if (depth === 0) res.topBoxes.push(type);
      if (MP4_PERSONAL.indexOf(type) >= 0) res.personalAtoms.push(type);
      if (type === "ftyp") res.brand = cc4(body);
      if (type === "trak") {
        track = { handler: "", width: 0, height: 0, frames: 0, timescale: 0, duration: 0, deltas: [], sync: null, format: "", profile: null };
        res.tracks.push(track);
      }
      if (track) leaf(type, body, stop);
      if (type === "meta") walk(body + 4, stop, depth + 1);
      else if (MP4_CONTAINERS[type]) walk(body, stop, depth + 1);
      o += size;
    }
  }

  function leaf(type, b, stop) {
    if (type === "tkhd") {
      const v = bytes[b];
      track.width = Math.round(u32(b + (v === 1 ? 88 : 76)) / 65536);
      track.height = Math.round(u32(b + (v === 1 ? 92 : 80)) / 65536);
    } else if (type === "mdhd") {
      const v = bytes[b];
      track.timescale = u32(b + (v === 1 ? 20 : 12));
      track.duration = v === 1 ? u32(b + 24) * 4294967296 + u32(b + 28) : u32(b + 16);
    } else if (type === "hdlr") {
      track.handler = cc4(b + 8);
    } else if (type === "stts") {
      const n = u32(b + 4);
      for (let i = 0; i < n && b + 8 + i * 8 + 8 <= stop; i++) {
        track.deltas.push({ count: u32(b + 8 + i * 8), delta: u32(b + 12 + i * 8) });
      }
    } else if (type === "stsz") {
      track.frames = u32(b + 8);
    } else if (type === "stss") {
      const n = u32(b + 4);
      track.sync = [];
      for (let i = 0; i < n && b + 8 + i * 4 + 4 <= stop; i++) track.sync.push(u32(b + 8 + i * 4));
    } else if (type === "stsd") {
      const e = b + 8;
      track.format = cc4(e + 4);
      if (track.format === "avc1" || track.format === "avc3") {
        let o = e + 86;
        while (o + 8 <= stop) {
          const sz = u32(o);
          if (sz < 8) break;
          if (cc4(o + 4) === "avcC") {
            track.profile = { profile: bytes[o + 9], compat: bytes[o + 10], level: bytes[o + 11] };
            break;
          }
          o += sz;
        }
      }
    }
  }

  try {
    walk(0, bytes.length, 0);
  } catch (e) {
    return res;
  }
  const iMoov = res.topBoxes.indexOf("moov");
  const iMdat = res.topBoxes.indexOf("mdat");
  res.moovBeforeMdat = iMoov >= 0 && iMdat >= 0 ? iMoov < iMdat : undefined;
  res.ok = iMoov >= 0 && res.tracks.length > 0;
  return res;
}

/** VideoInfo (CONTRACT 4.4) derived from the bytes of an MP4. */
function videoInfoFromMp4(bytes) {
  const m = inspectMp4(bytes);
  const v = m.tracks.find((t) => t.handler === "vide");
  const info = { codec: undefined, moovBeforeMdat: m.moovBeforeMdat, audio: m.tracks.some((t) => t.handler === "soun") ? "silent-aac" : "none" };
  if (!v) return info;
  const hex2 = (n) => ("0" + n.toString(16)).slice(-2);
  info.width = v.width;
  info.height = v.height;
  info.frames = v.frames;
  info.seconds = v.timescale ? v.duration / v.timescale : undefined;
  info.fps = info.seconds ? v.frames / info.seconds : undefined;
  info.constantRate = v.deltas.length <= 1;
  info.codec = v.profile ? v.format + "." + hex2(v.profile.profile) + hex2(v.profile.compat) + hex2(v.profile.level) : v.format;
  info.keyframeAtZero = v.sync === null ? true : v.sync.length > 0 && v.sync[0] === 1;
  if (v.sync && v.sync.length) {
    let gap = 0;
    for (let i = 1; i < v.sync.length; i++) gap = Math.max(gap, v.sync[i] - v.sync[i - 1]);
    info.maxKeyframeGap = Math.max(gap, v.frames - v.sync[v.sync.length - 1] + 1);
  }
  info.personalAtoms = m.personalAtoms;
  return info;
}
