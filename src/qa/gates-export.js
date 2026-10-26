/* Carousel Studio · cs-qa · export gates
 *
 * D1 (file format), V1 (cover video) and X1 (clean export) run on the files
 * the exporter produced: PNG, JPEG, PDF, MP4 and the kit's text files. Image
 * headers are read directly, so the checks need no decoder and run the same
 * in the Studio and in Node.
 */

/* ------------------------------------------------------------ file helpers */

const LATIN1_CHUNK = 8192;

function bytesToLatin1(b) {
  let s = "";
  for (let i = 0; i < b.length; i += LATIN1_CHUNK) s += String.fromCharCode.apply(null, b.subarray(i, i + LATIN1_CHUNK));
  return s;
}

function bytesToUtf8(b) {
  return typeof TextDecoder !== "undefined" ? new TextDecoder("utf-8", { fatal: false }).decode(b) : bytesToLatin1(b);
}

const extOf = (path) => {
  const m = /\.([A-Za-z0-9]+)$/.exec(path || "");
  return m ? m[1].toLowerCase() : "";
};

const TEXT_EXT = { txt: 1, md: 1, json: 1, html: 1, htm: 1, css: 1, js: 1, mjs: 1, svg: 1, csv: 1, xml: 1 };
const FONT_EXT = { ttf: 1, otf: 1, woff: 1, woff2: 1 };

/** png | jpeg | pdf | mp4 | font | text | binary, with `broken` set when the
 *  extension promises an image the bytes do not deliver. */
function fileKind(f) {
  const b = f.bytes || new Uint8Array(0);
  const ext = extOf(f.path || f.name);
  const png = b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
  const jpg = b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  const pdf = b.length > 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46;
  const mp4 = b.length > 12 && b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70;
  if (png) return { kind: "png" };
  if (jpg) return { kind: "jpeg" };
  if (pdf) return { kind: "pdf" };
  if (mp4) return { kind: "mp4" };
  if (ext === "png" || ext === "jpg" || ext === "jpeg") return { kind: ext === "png" ? "png" : "jpeg", broken: true };
  if (FONT_EXT[ext]) return { kind: "font" };
  if (TEXT_EXT[ext] || /^text\//.test(f.mime || "") || /json/.test(f.mime || "")) return { kind: "text" };
  return { kind: "binary" };
}

function pngInfo(b) {
  const info = { ok: false, w: 0, h: 0, colorType: -1, trns: false, srgb: false, iccp: null, textChunks: [] };
  if (b.length < 33) return info;
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let o = 8;
  while (o + 12 <= b.length) {
    const len = dv.getUint32(o);
    const type = String.fromCharCode(b[o + 4], b[o + 5], b[o + 6], b[o + 7]);
    const d = o + 8;
    if (type === "IHDR") {
      info.w = dv.getUint32(d);
      info.h = dv.getUint32(d + 4);
      info.colorType = b[d + 9];
      info.ok = true;
    } else if (type === "tRNS") info.trns = true;
    else if (type === "sRGB") info.srgb = true;
    else if (type === "iCCP") {
      let e = d;
      while (e < d + len && e < b.length && b[e] !== 0) e++;
      info.iccp = bytesToLatin1(b.subarray(d, e));
    } else if (type === "tEXt" || type === "zTXt" || type === "iTXt" || type === "eXIf") info.textChunks.push(type);
    else if (type === "IEND") break;
    o += 12 + len;
  }
  return info;
}

function jpegInfo(b) {
  const info = { ok: false, w: 0, h: 0, components: 0, meta: [], icc: false, iccSrgb: false };
  let o = 2;
  while (o + 4 <= b.length) {
    if (b[o] !== 0xff) {
      o++;
      continue;
    }
    const m = b[o + 1];
    if (m === 0xff) {
      o++;
      continue;
    }
    if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) {
      o += 2;
      continue;
    }
    if (m === 0xd9 || m === 0xda) break;
    const len = (b[o + 2] << 8) | b[o + 3];
    const d = o + 4;
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      info.h = (b[d + 1] << 8) | b[d + 2];
      info.w = (b[d + 3] << 8) | b[d + 4];
      info.components = b[d + 5];
      info.ok = true;
    } else if (m >= 0xe0 && m <= 0xef) {
      const head = bytesToLatin1(b.subarray(d, Math.min(d + 24, o + 2 + len)));
      if (m === 0xe1) info.meta.push(/^Exif/.test(head) ? "EXIF" : "XMP");
      if (m === 0xed) info.meta.push("IPTC");
      if (m === 0xe2 && /^ICC_PROFILE/.test(head)) {
        info.icc = true;
        /* v4 profiles (Chrome writes one) name themselves in UTF-16BE, "\u0000s\u0000R\u0000G\u0000B": drop the NULs before looking for the name */
        if (/srgb/i.test(bytesToLatin1(b.subarray(d + 14, Math.min(d + 4096, o + 2 + len))).replace(/\u0000/g, ""))) info.iccSrgb = true;
      }
    } else if (m === 0xfe) info.meta.push("COM");
    o += 2 + len;
  }
  return info;
}

/** Author, producer, creator and XMP presence of a PDF written by CS.export.pdf. */
function pdfInfo(b) {
  const s = bytesToLatin1(b);
  const str = (name) => {
    const m = new RegExp("/" + name + "\\s*(?:\\(([^)]*)\\)|<([0-9A-Fa-f\\s]+)>)").exec(s);
    if (!m) return null;
    if (m[1] !== undefined) return m[1];
    const hex = m[2].replace(/\s+/g, "");
    let t = "";
    for (let i = hex.indexOf("FEFF") === 0 ? 4 : 0; i + 4 <= hex.length; i += 4) t += String.fromCharCode(parseInt(hex.slice(i, i + 4), 16));
    return t;
  };
  return { author: str("Author"), producer: str("Producer"), creator: str("Creator"), xmp: /\/Type\s*\/Metadata/.test(s) };
}

/* -------------------------------------------------------- needle searching */

const foldLetters = (s) =>
  String(s).normalize("NFC").toLowerCase().replace(/\u0640/g, "").replace(/[^\p{L}\p{N}]+/gu, "");

function loadNeedles(P) {
  const mk = (list) =>
    (list || [])
      .map((n) => ({ id: n.id, s: foldLetters(String.fromCodePoint.apply(null, n.cp)) }))
      .filter((n) => n.s);
  return { lines: mk(P.lines), names: mk(P.names).concat(mk(P.brands)) };
}

const stripDataUris = (s) => s.replace(/data:[^,;"'()\s]{0,80};base64,[A-Za-z0-9+/=]+/g, "");

/** Folded text variants of a file worth searching for needles. */
function needleHaystacks(f, kind) {
  const b = f.bytes;
  const out = [];
  if (kind === "text") {
    out.push(foldLetters(stripDataUris(bytesToUtf8(b))));
    return out;
  }
  const ends = kind === "pdf" ? b : b.length > 262144 ? null : b;
  const parts = ends ? [b] : [b.subarray(0, 131072), b.subarray(b.length - 131072)];
  parts.forEach((p) => {
    out.push(foldLetters(bytesToLatin1(p)));
    out.push(foldLetters(bytesToUtf8(p)));
  });
  if (kind === "pdf") {
    const s = bytesToLatin1(b);
    const re = /<FEFF([0-9A-Fa-f]+)>/g;
    let m;
    while ((m = re.exec(s))) {
      let t = "";
      for (let i = 0; i + 4 <= m[1].length; i += 4) t += String.fromCharCode(parseInt(m[1].slice(i, i + 4), 16));
      out.push(foldLetters(t));
    }
  }
  return out;
}

function findNeedle(haystacks, N, masks) {
  for (let h = 0; h < haystacks.length; h++) {
    for (let i = 0; i < N.lines.length; i++) if (haystacks[h].indexOf(N.lines[i].s) >= 0) return N.lines[i].id;
  }
  for (let h = 0; h < haystacks.length; h++) {
    let rest = haystacks[h];
    masks.forEach((m) => {
      if (rest.indexOf(m) >= 0) rest = rest.split(m).join("");
    });
    for (let i = 0; i < N.names.length; i++) if (rest.indexOf(N.names[i].s) >= 0) return N.names[i].id;
  }
  return null;
}

/** Strings the user typed into their own brand; they are not tool credits. */
function userMasks(spec, brand) {
  const list = [];
  const add = (v) => {
    if (nonEmpty(v)) list.push(v);
  };
  if (brand) {
    add(brand.name);
    add(brand.handle);
    add(brand.slug);
    add(brand.homeUrl);
    ((brand.identity && brand.identity.otherNames) || []).forEach((n) => add(String(n).replace(/^#/, "")));
  }
  if (isObj(spec.brand)) add(spec.brand.slug);
  return list.map(foldLetters).filter((s) => s.length >= 4);
}

function fontsMetaOf(input) {
  if (input.fonts && input.fonts.registry) return input.fonts;
  try {
    if (typeof document !== "undefined") {
      const el = document.getElementById("cs-fonts-meta");
      if (el) return JSON.parse(el.textContent);
    }
  } catch (e) {
    /* no embedded registry */
  }
  return null;
}

const stripScriptsAndStyles = (s) => s.replace(/<script\b[\s\S]*?<\/script>/gi, "").replace(/<style\b[\s\S]*?<\/style>/gi, "");

/* ------------------------------------------------------------- export gates */

function runD1Export(ec, files, out) {
  const png = [];
  const jpg = [];
  const plat = (id) => param(ec, id);
  files.forEach((f) => {
    const k = fileKind(f);
    if (k.kind !== "png" && k.kind !== "jpeg") return;
    if (k.broken || !f.bytes || !f.bytes.length) {
      if (active(ec, "D1.decode")) emit(ec, out, "D1.decode", { vars: { path: f.path } });
      return;
    }
    if (k.kind === "png") {
      const i = pngInfo(f.bytes);
      if (!i.ok) {
        if (active(ec, "D1.decode")) emit(ec, out, "D1.decode", { vars: { path: f.path } });
        return;
      }
      png.push({ f, i });
      const cv = ec.spec.canvas || {};
      const ew = cv.w || plat("D1.png-size").w;
      const eh = cv.h || plat("D1.png-size").h;
      if ((i.w !== ew || i.h !== eh) && active(ec, "D1.png-size")) emit(ec, out, "D1.png-size", { vars: { path: f.path, w: i.w, h: i.h, ew, eh } });
      if ((i.colorType === 4 || i.colorType === 6 || i.trns) && active(ec, "D1.alpha")) emit(ec, out, "D1.alpha", { vars: { path: f.path } });
      if (i.iccp !== null && !/srgb/i.test(i.iccp) && active(ec, "D1.srgb")) emit(ec, out, "D1.srgb", { vars: { path: f.path } });
    } else {
      const i = jpegInfo(f.bytes);
      if (!i.ok) {
        if (active(ec, "D1.decode")) emit(ec, out, "D1.decode", { vars: { path: f.path } });
        return;
      }
      jpg.push({ f, i });
      const p = plat("D1.jpeg-size");
      if ((i.w !== p.w || i.h !== p.h) && active(ec, "D1.jpeg-size")) emit(ec, out, "D1.jpeg-size", { vars: { path: f.path, w: i.w, h: i.h, ew: p.w, eh: p.h } });
      if (((i.components !== 3) || (i.icc && !i.iccSrgb)) && active(ec, "D1.srgb")) emit(ec, out, "D1.srgb", { vars: { path: f.path } });
      const max = plat("D1.jpeg-bytes").max;
      if (f.bytes.length > max && active(ec, "D1.jpeg-bytes")) emit(ec, out, "D1.jpeg-bytes", { vars: { path: f.path, count: f.bytes.length, max } });
    }
  });
  const mixed = (list) => new Set(list.map((x) => x.i.w + "x" + x.i.h)).size > 1;
  if ((mixed(png) || mixed(jpg)) && active(ec, "D1.ratio")) emit(ec, out, "D1.ratio", {});
}

/** Facts the bytes of an MP4 settle; the exporter's own report cannot overrule them. */
const MP4_DERIVED = ["width", "height", "frames", "seconds", "fps", "codec", "moovBeforeMdat", "keyframeAtZero", "audio", "constantRate"];

/** VideoInfo for one MP4 file: what the exporter reported (loop metrics, blank
 *  frames, flashes, closed GOP …) completed and corrected from the bytes. */
function resolveVideoInfo(f, idx, provided) {
  const inspected = videoInfoFromMp4(f.bytes);
  let given = null;
  if (Array.isArray(provided)) given = provided.find((v) => v && v.file === f.path) || provided[idx] || null;
  else if (isObj(provided) && idx === 0) given = provided;
  const info = Object.assign({}, given || {});
  Object.keys(inspected).forEach((k) => {
    const settled = inspected.width !== undefined && MP4_DERIVED.indexOf(k) >= 0;
    if (inspected[k] !== undefined && (settled || info[k] === undefined)) info[k] = inspected[k];
  });
  return info;
}

/** H.264 level_idc from an avc1.PPCCLL codec string (40 for avc1.640028), or null. */
function levelOfCodec(codec) {
  const m = /^avc[13]\.[0-9a-f]{4}([0-9a-f]{2})$/i.exec(codec || "");
  return m ? parseInt(m[1], 16) : null;
}

/** "4.1" -> 41 */
function levelNumber(text) {
  return Math.round(parseFloat(text) * 10);
}

function runV1(ec, files, provided, out) {
  const motion = ec.spec.cover && ec.spec.cover.motion;
  const motionOff = !motion || motion.recipe === "none" || (ec.spec.compat && ec.spec.compat.mp4 === "off");
  const mp4s = files.filter((f) => fileKind(f).kind === "mp4");
  if ((!mp4s.length || motionOff) && active(ec, "V1.static")) emit(ec, out, "V1.static", {});
  mp4s.forEach((f, idx) => {
    const info = resolveVideoInfo(f, idx, provided);
    if (ec.sink) ec.sink.videos.push(Object.assign({ file: f.path }, info));
    const is45 = /(^|\/)4x5\//.test(f.path || "") || (ec.spec.canvas && ec.spec.canvas.preset === "ig-4x5");
    const sz = param(ec, "V1.size");
    const ew = sz.w;
    const eh = is45 ? sz.h4x5 : sz.h3x4;
    const el = f.path;
    const fx = (id, extra) => emit(ec, out, id, { el, vars: extra || {} });

    if (info.codec && active(ec, "V1.codec") && info.codec.indexOf(param(ec, "V1.codec").prefix) !== 0) fx("V1.codec", { codec: info.codec });
    else if (info.codec && active(ec, "V1.profile") && !/^avc1\.64/i.test(info.codec)) fx("V1.profile", { codec: info.codec });
    // pixel format, range, colour tags and level: the H.264 level comes from the file's own bytes (the codec string above); the rest is
    // what the exporter read from the SPS and reports as pixFmt, range and colour (check_video.mjs reports the same fields from ffprobe)
    const level = levelOfCodec(info.codec) !== null ? levelOfCodec(info.codec) : info.level;
    const maxLevel = param(ec, "V1.level").max;
    if (typeof level === "number" && active(ec, "V1.level") && level > levelNumber(maxLevel)) fx("V1.level", { level: (level / 10).toFixed(1), max: maxLevel });
    const pixfmt = info.pixFmt ? String(info.pixFmt) : "";
    const wantPix = param(ec, "V1.pixfmt").expected;
    if (pixfmt && active(ec, "V1.pixfmt") && pixfmt.replace(/^yuvj/, "yuv") !== wantPix) fx("V1.pixfmt", { pixfmt, expected: wantPix });
    if ((info.range === "pc" || /^yuvj/.test(pixfmt)) && active(ec, "V1.range")) fx("V1.range", { range: info.range === "pc" ? "pc" : pixfmt, expected: param(ec, "V1.range").expected });
    const wantColour = param(ec, "V1.colour").expected;
    const odd = isObj(info.colour) ? ["primaries", "transfer", "matrix"].filter((k) => info.colour[k] && ["unknown", "unspecified", wantColour].indexOf(info.colour[k]) < 0).map((k) => k + " " + info.colour[k]) : [];
    if (odd.length && active(ec, "V1.colour")) fx("V1.colour", { tags: odd.join(", "), expected: wantColour });
    if (info.width && active(ec, "V1.size") && (info.width !== ew || info.height !== eh)) fx("V1.size", { w: info.width, h: info.height, ew, eh });
    const fps = param(ec, "V1.fps").fps;
    if (info.fps && active(ec, "V1.fps") && (Math.abs(info.fps - fps) > 0.05 || info.constantRate === false)) {
      fx("V1.fps", { fps: Math.round(info.fps * 100) / 100, ef: fps });
    }
    if (info.frames && active(ec, "V1.frames")) {
      const secs = (motion && motion.seconds) || param(ec, "V1.frames").defaultSeconds;
      const expected = Math.round(secs * fps);
      if (Math.abs(info.frames - expected) > 1) fx("V1.frames", { count: info.frames, n: expected });
    }
    const expAudio = param(ec, "V1.audio").expected;
    if (info.audio && active(ec, "V1.audio") && info.audio !== expAudio) fx("V1.audio", { audio: info.audio, expected: expAudio });
    if (info.moovBeforeMdat === false && active(ec, "V1.faststart")) fx("V1.faststart");
    if (info.keyframeAtZero === false && active(ec, "V1.keyframe")) fx("V1.keyframe");
    if (info.closedGop === false && active(ec, "V1.closed-gop")) fx("V1.closed-gop");

    const L = param(ec, "V1.loop");
    const loop = isObj(info.loop) ? info.loop : null;
    let ssim = info.loopSsim;
    let psnr = info.loopPsnr;
    if (loop) {
      const parts = [loop.frame0VsPoster, loop.lastVsFrame0].filter(isObj);
      if (parts.length) {
        ssim = Math.min.apply(null, parts.map((p) => p.ssim));
        psnr = Math.min.apply(null, parts.map((p) => p.psnr));
      }
    }
    if (typeof ssim === "number" && active(ec, "V1.loop") && (ssim < L.ssim || (typeof psnr === "number" && psnr < L.psnr))) {
      fx("V1.loop", { ssim: Math.round(ssim * 1000) / 1000, psnr: typeof psnr === "number" ? Math.round(psnr * 10) / 10 : "—" });
    }
    if (info.blankFrames > 0 && active(ec, "V1.blank")) fx("V1.blank", { count: info.blankFrames });
    const maxFlash = param(ec, "V1.flashes").max;
    if (info.flashesPerSecondMax > maxFlash && active(ec, "V1.flashes")) fx("V1.flashes", { count: info.flashesPerSecondMax, max: maxFlash });
    // frame metrics (NOTE): how much of the loop is a held picture, and how long only the chrome is on screen
    if (typeof info.stillShare === "number" && active(ec, "V1.still-hold") && info.stillShare > param(ec, "V1.still-hold").maxShare) {
      const secs = (motion && motion.seconds) || param(ec, "V1.frames").defaultSeconds;
      fx("V1.still-hold", { pct: Math.round(info.stillShare * 100), sec: Math.round(info.stillShare * secs * 10) / 10 });
    }
    if (typeof info.thinRunSeconds === "number" && active(ec, "V1.thin-frames") && info.thinRunSeconds > param(ec, "V1.thin-frames").maxSeconds) {
      fx("V1.thin-frames", { sec: Math.round(info.thinRunSeconds * 10) / 10 });
    }
  });
}

function runX1(ec, files, input, out) {
  const P = param(ec, "X1.credit");
  const N = loadNeedles(P);
  const masks = userMasks(ec.spec, input.brand || null);
  const secrets = (param(ec, "X1.secrets").patterns || []).map((p) => ({ id: p.id, re: new RegExp(p.pattern, p.flags || "") }));
  const fontsMeta = fontsMetaOf(input);
  const okFamilies = new Set();
  if (fontsMeta && fontsMeta.registry && Array.isArray(fontsMeta.registry.families)) {
    const allowed = param(ec, "X1.font-license").allowedLicenses;
    fontsMeta.registry.families.forEach((fam) => {
      if (allowed.indexOf(fam.license) >= 0) okFamilies.add(String(fam.family).toLowerCase());
    });
  }
  const userFamilies = new Set();
  const uf = ec.brandFonts || [];
  uf.forEach((x) => nonEmpty(x.family) && userFamilies.add(String(x.family).toLowerCase()));

  files.forEach((f) => {
    const k = fileKind(f);
    const path = f.path;
    if (!f.bytes) return;

    if (active(ec, "X1.credit")) {
      const id = findNeedle(needleHaystacks(f, k.kind), N, masks);
      if (id) emit(ec, out, "X1.credit", { vars: { path, needle: id } });
    }

    if (k.kind === "font" && active(ec, "X1.font-license")) emit(ec, out, "X1.font-license", { vars: { path, font: path } });

    if (k.kind === "text") {
      const text = bytesToUtf8(f.bytes);
      if (active(ec, "X1.credit-markup") && /\.html?$/i.test(path || "")) {
        const markers = param(ec, "X1.credit-markup").markers;
        const markup = stripScriptsAndStyles(text);
        if (markers.some((m) => new RegExp("\\s" + m + "(?:[\\s=>/]|$)").test(markup))) emit(ec, out, "X1.credit-markup", { vars: { path } });
      }
      if (active(ec, "X1.secrets")) {
        const clean = stripDataUris(text);
        const hit = secrets.find((s) => s.re.test(clean));
        if (hit) emit(ec, out, "X1.secrets", { vars: { path, kind: hit.id } });
      }
      if (active(ec, "X1.font-license") && (okFamilies.size || userFamilies.size)) {
        const re = /@font-face\s*\{([^}]*)\}/g;
        let m;
        const bad = new Set();
        while ((m = re.exec(text))) {
          const fm = /font-family\s*:\s*(?:"([^"]+)"|'([^']+)'|([^;}\n]+))/.exec(m[1]);
          if (!fm) continue;
          const fam = (fm[1] || fm[2] || fm[3] || "").trim().toLowerCase();
          if (fam && (userFamilies.has(fam) || (okFamilies.size && !okFamilies.has(fam)))) bad.add(fam);
        }
        bad.forEach((fam) => emit(ec, out, "X1.font-license", { vars: { path, font: fam } }));
      }
    }

    if (active(ec, "X1.metadata")) {
      const md = (kind) => emit(ec, out, "X1.metadata", { vars: { path, kind } });
      if (k.kind === "png") {
        const i = pngInfo(f.bytes);
        if (i.textChunks.length) md(i.textChunks[0]);
      } else if (k.kind === "jpeg") {
        const i = jpegInfo(f.bytes);
        if (i.meta.length) md(i.meta[0]);
      } else if (k.kind === "pdf") {
        const i = pdfInfo(f.bytes);
        const ok = String(param(ec, "X1.metadata").producer).toLowerCase();
        if (i.author !== null) md("Author");
        else if (i.producer !== null && i.producer.toLowerCase() !== ok) md("Producer");
        else if (i.creator !== null && i.creator.toLowerCase() !== ok) md("Creator");
        else if (i.xmp) md("XMP");
      } else if (k.kind === "mp4") {
        const m = inspectMp4(f.bytes);
        if (m.personalAtoms.length) md(m.personalAtoms[0].replace(/©/g, "(c)"));
      }
    }
  });

  if (active(ec, "X1.complete")) {
    const norm = (p) => String(p).replace(/^carousel-kit\//, "");
    let expected = input.expected;
    if (!expected && CS.export && typeof CS.export.kitFiles === "function") {
      try {
        expected = CS.export.kitFiles(ec.spec, input.kitOptions || {});
      } catch (e) {
        expected = null;
      }
    }
    if (Array.isArray(expected)) {
      const have = new Set(files.map((f) => norm(f.path)));
      const skipped = new Set((input.skipped || []).map((s) => norm(s.path)));
      expected.map(norm).forEach((p) => {
        if (!have.has(p) && !skipped.has(p)) emit(ec, out, "X1.complete", { vars: { path: p } });
      });
    }
  }
}

/** Export-scope gates over `input.files`. */
function runExportGates(input, opts) {
  opts = opts || {};
  const ec = buildContext(input, opts);
  ec.sink = input._sink || null;
  ec.brandFonts = (input.brand && input.brand.visual && input.brand.visual.fonts && input.brand.visual.fonts.userFonts) || [];
  const files = (input.files || []).filter((f) => f && f.bytes);
  const out = [];
  if (wantGate(ec, "D1")) { countGate(ec, "D1"); runD1Export(ec, files, out); }
  if (wantGate(ec, "V1")) { countGate(ec, "V1"); runV1(ec, files, input.video, out); }
  if (wantGate(ec, "X1")) { countGate(ec, "X1"); runX1(ec, files, input, out); }
  if (wantGate(ec, "A1")) { countGate(ec, "A1"); gateA1(ec, out); }
  ec.out = out;
  return ec;
}
