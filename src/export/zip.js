/*
 * CS.export · ZIP writer.
 * STORE method (no compression: PNG, JPEG, MP4 and PDF are already compressed), CRC-32, UTF-8 file names (general purpose
 * flag bit 11), one pass over the entries. No third-party code, no network.
 */

var CRC_TABLE = (function () {
  var t = new Uint32Array(256), n, c, k;
  for (n = 0; n < 256; n++) {
    c = n;
    for (k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  var c = 0xFFFFFFFF, i;
  for (i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function dosDateTime(date) {
  // UTC getters: the same kit built on two machines (or in two time zones) must give the same bytes.
  var y = Math.max(1980, date.getUTCFullYear());
  return {
    time: (date.getUTCHours() << 11) | (date.getUTCMinutes() << 5) | (date.getUTCSeconds() >> 1),
    date: ((y - 1980) << 9) | ((date.getUTCMonth() + 1) << 5) | date.getUTCDate()
  };
}

/**
 * zipBytes(entries, date) -> Uint8Array. entries: [{ name, bytes }] (names are final, '/'-separated, no leading slash).
 * Entries are written in the given order, so the archive of a given kit is byte-identical for the same date.
 */
function zipBytes(entries, date) {
  var stamp = dosDateTime(date || new Date(Date.UTC(2026, 0, 1))), prepared = [], total = 22, i, e, nameBytes;
  if (entries.length > 65535) throw exportError("E_USAGE", "Too many files for one ZIP archive.");
  for (i = 0; i < entries.length; i++) {
    e = entries[i];
    nameBytes = utf8Encode(e.name);
    if (e.bytes.length >= 0xFFFFFFFF) throw exportError("E_USAGE", "A file is too large for a ZIP archive without ZIP64.", { name: e.name });
    prepared.push({ name: nameBytes, bytes: e.bytes, crc: crc32(e.bytes), offset: total - 22 });
    total += 30 + nameBytes.length + e.bytes.length + 46 + nameBytes.length;
  }
  var out = new Uint8Array(total), dv = new DataView(out.buffer), pos = 0, p;
  for (i = 0; i < prepared.length; i++) {          // local file headers + data
    p = prepared[i]; p.offset = pos;
    dv.setUint32(pos, 0x04034B50, true); dv.setUint16(pos + 4, 20, true); dv.setUint16(pos + 6, 0x0800, true); dv.setUint16(pos + 8, 0, true);
    dv.setUint16(pos + 10, stamp.time, true); dv.setUint16(pos + 12, stamp.date, true); dv.setUint32(pos + 14, p.crc, true);
    dv.setUint32(pos + 18, p.bytes.length, true); dv.setUint32(pos + 22, p.bytes.length, true); dv.setUint16(pos + 26, p.name.length, true); dv.setUint16(pos + 28, 0, true);
    out.set(p.name, pos + 30); out.set(p.bytes, pos + 30 + p.name.length);
    pos += 30 + p.name.length + p.bytes.length;
  }
  var cdStart = pos;
  for (i = 0; i < prepared.length; i++) {          // central directory
    p = prepared[i];
    dv.setUint32(pos, 0x02014B50, true); dv.setUint16(pos + 4, 20, true); dv.setUint16(pos + 6, 20, true); dv.setUint16(pos + 8, 0x0800, true); dv.setUint16(pos + 10, 0, true);
    dv.setUint16(pos + 12, stamp.time, true); dv.setUint16(pos + 14, stamp.date, true); dv.setUint32(pos + 16, p.crc, true);
    dv.setUint32(pos + 20, p.bytes.length, true); dv.setUint32(pos + 24, p.bytes.length, true); dv.setUint16(pos + 28, p.name.length, true);
    dv.setUint16(pos + 30, 0, true); dv.setUint16(pos + 32, 0, true); dv.setUint16(pos + 34, 0, true); dv.setUint16(pos + 36, 0, true); dv.setUint32(pos + 38, 0, true); dv.setUint32(pos + 42, p.offset, true);
    out.set(p.name, pos + 46);
    pos += 46 + p.name.length;
  }
  dv.setUint32(pos, 0x06054B50, true); dv.setUint16(pos + 4, 0, true); dv.setUint16(pos + 6, 0, true);
  dv.setUint16(pos + 8, prepared.length, true); dv.setUint16(pos + 10, prepared.length, true);
  dv.setUint32(pos + 12, pos - cdStart, true); dv.setUint32(pos + 16, cdStart, true); dv.setUint16(pos + 20, 0, true);
  return out;
}

