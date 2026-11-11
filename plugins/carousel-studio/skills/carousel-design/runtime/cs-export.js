/*! Carousel Studio runtime chunk cs-export.js · cs-1.1.1 · Apache-2.0 */
(function () {
  "use strict";
  var CS = (window.CS = window.CS || {});
  /* ---- file: core.js ---- */
/*
 * CS.export · shared helpers of the export chunk.
 * (CS.export.mp4 and CS.export.DEPS are defined by cs-mp4.js, which loads first; this chunk only adds to the namespace.)
 */

var X = (CS.export = CS.export || {});
var CANVAS_W = 1080;
var CANVAS_H = 1440;
var CROP_4X5 = { x: 0, y: 45, w: 1080, h: 1350 };

function exportError(code, message, detail) {
  var E = CS.CSError;
  if (E) return new E(code, message, detail);
  var e = new Error(message || code);
  e.code = code;
  if (detail !== undefined) e.detail = detail;
  return e;
}

function utf8Encode(text) { return new TextEncoder().encode(String(text)); }

function makeCanvas(w, h) {
  var c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

function opaqueContext(canvas) {
  var ctx = canvas.getContext("2d", { alpha: false, colorSpace: "srgb", willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  return ctx;
}

function encodeBytes(canvas, mime, quality) { return CS.paint.encode(canvas, mime === "image/jpeg" ? "jpeg" : "png", quality); }

  /* ---- file: zip.js ---- */
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

  /* ---- file: pdf.js ---- */
/*
 * CS.export · PDF writer.
 * One page per slide, each page one full-bleed JPEG (DCTDecode) - nothing else. The document carries a Title and the
 * producer "Carousel Studio"; no author, no creator, no dates, nothing that names a person.
 */

/** Width, height and component count of a baseline or progressive JPEG. */
function jpegInfo(bytes) {
  var i = 2, marker, len;
  if (bytes[0] !== 0xFF || bytes[1] !== 0xD8) throw exportError("E_USAGE", "A PDF page needs a JPEG image.");
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xFF) { i++; continue; }
    marker = bytes[i + 1];
    if (marker === 0xFF) { i++; continue; }
    if (marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC) {
      return { h: (bytes[i + 5] << 8) | bytes[i + 6], w: (bytes[i + 7] << 8) | bytes[i + 8], components: bytes[i + 9] };
    }
    len = (bytes[i + 2] << 8) | bytes[i + 3];
    i += 2 + len;
  }
  throw exportError("E_USAGE", "The JPEG has no frame header.");
}

function pdfText(text) {                        // UTF-16BE hex string: safe for Arabic and for any other script
  var hex = "FEFF", i, c;
  for (i = 0; i < text.length; i++) { c = text.charCodeAt(i); hex += ("000" + c.toString(16)).slice(-4).toUpperCase(); }
  return "<" + hex + ">";
}

/** pdfBytes(pages: [{ jpeg: Uint8Array, w, h }], title) -> Uint8Array */
function pdfBytes(pages, title) {
  var chunks = [], offsets = [], length = 0, n = pages.length;
  var push = function (part) { var b = typeof part === "string" ? latin1Bytes(part) : part; chunks.push(b); length += b.length; };
  var begin = function (id) { offsets[id] = length; push(id + " 0 obj\n"); };
  push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  // object ids: 1 catalog, 2 pages, 3 info, then per page: page, contents, image
  begin(1); push("<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  var kids = [], i, id;
  for (i = 0; i < n; i++) kids.push((4 + i * 3) + " 0 R");
  begin(2); push("<< /Type /Pages /Kids [" + kids.join(" ") + "] /Count " + n + " >>\nendobj\n");
  begin(3); push("<< /Title " + pdfText(title || "") + " /Producer (Carousel Studio) >>\nendobj\n");
  pages.forEach(function (pg, k) {
    id = 4 + k * 3;
    var content = "q " + pg.w + " 0 0 " + pg.h + " 0 0 cm /Im0 Do Q\n";
    begin(id); push("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + pg.w + " " + pg.h + "] /Resources << /XObject << /Im0 " + (id + 2) + " 0 R >> >> /Contents " + (id + 1) + " 0 R >>\nendobj\n");
    begin(id + 1); push("<< /Length " + content.length + " >>\nstream\n" + content + "endstream\nendobj\n");
    begin(id + 2);
    push("<< /Type /XObject /Subtype /Image /Width " + pg.w + " /Height " + pg.h + " /ColorSpace " + (pg.components === 1 ? "/DeviceGray" : "/DeviceRGB") +
      " /BitsPerComponent 8 /Filter /DCTDecode /Length " + pg.jpeg.length + " >>\nstream\n");
    push(pg.jpeg);
    push("\nendstream\nendobj\n");
  });
  var xrefAt = length, total = 4 + n * 3, rows = "xref\n0 " + total + "\n0000000000 65535 f \n";
  for (id = 1; id < total; id++) rows += ("0000000000" + offsets[id]).slice(-10) + " 00000 n \n";
  push(rows + "trailer\n<< /Size " + total + " /Root 1 0 R /Info 3 0 R >>\nstartxref\n" + xrefAt + "\n%%EOF\n");
  var out = new Uint8Array(length), pos = 0;
  chunks.forEach(function (c) { out.set(c, pos); pos += c.length; });
  return out;
}

function latin1Bytes(text) {
  var out = new Uint8Array(text.length), i;
  for (i = 0; i < text.length; i++) out[i] = text.charCodeAt(i) & 0xFF;
  return out;
}

  /* ---- file: text.js ---- */
/*
 * CS.export.text · the text files of the publishing kit.
 * Plain UTF-8, LF newlines, no BOM. Labels that are technical (slide numbers) always use Western digits.
 * Nothing here ever prints the tool's author or any credit line; credits live in tool screens only.
 */

var MIME_BY_EXT = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", mp4: "video/mp4", txt: "text/plain;charset=utf-8", md: "text/markdown;charset=utf-8",
  json: "application/json", html: "text/html;charset=utf-8", svg: "image/svg+xml", pdf: "application/pdf", zip: "application/zip" };

/** The one line that HTML and SVG exports end with. The ISC and MIT licences of the icon sets ask that their notice goes with copies of the
 *  icons; a PNG, JPEG, PDF or MP4 is a picture of them, not a copy, and carries nothing. It is a notice, not a credit: no name, no link. */
var LICENCE_NOTICE = "icons: Lucide ISC / Feather MIT / Tabler MIT, see NOTICE";

function mimeOf(path) { var m = /\.([a-z0-9]+)$/i.exec(path); return (m && MIME_BY_EXT[m[1].toLowerCase()]) || "application/octet-stream"; }

function makeFile(path, bytes, extra) {
  var f = { path: path, name: path.split("/").pop(), mime: mimeOf(path), bytes: bytes };
  if (extra) { if (extra.w) f.w = extra.w; if (extra.h) f.h = extra.h; }
  return f;
}

/** `body` with the licence comment as its last line when `path` is an HTML or SVG file (once: a body that already holds it is left alone).
 *  At the end, so that a doctype, an XML declaration and a file's own licence header stay first. */
function withLicenceNotice(path, body) {
  var m = /\.([a-z0-9]+)$/i.exec(path), ext = m && m[1].toLowerCase();
  if ((ext !== "html" && ext !== "htm" && ext !== "svg") || body.indexOf(LICENCE_NOTICE) >= 0) return body;
  return (body.endsWith("\n") ? body : body + "\n") + "<" + "!-- " + LICENCE_NOTICE + " -->";
}

function textFile(path, text) {
  var body = withLicenceNotice(path, String(text).replace(/\r\n?/g, "\n"));
  return makeFile(path, utf8Encode(body.endsWith("\n") ? body : body + "\n"));
}

function nn(i) { return ("0" + (i + 1)).slice(-2); }

function assembleCaptionText(spec) {
  var core = CS.core && CS.core.spec;
  if (core && typeof core.assembleCaption === "function") return core.assembleCaption(spec);
  var c = spec.captionPack || {};
  return [[c.firstLine, c.keywordLine].filter(Boolean).join("\n"), c.body, c.cta, (c.hashtags || []).join(" ")].filter(Boolean).join("\n\n");
}

function labelled(list, count) {
  var lines = [], i;
  for (i = 0; i < Math.max(count || 0, (list || []).length); i++) lines.push(nn(i) + ": " + String((list && list[i]) || "").replace(/\s*\n\s*/g, " ").trim());
  return lines.join("\n");
}

/* ------------------------------------------------------------------ posting guide */

/** Used only when the page carries no posting-guide.json block. */
var BUILTIN_GUIDE = {
  title: { eg: "دليل النشر", "msa-white": "دليل النشر", en: "Posting guide" },
  intro: { eg: "الملفات مترتبة زي ما هتنزّلها. اتبع الخطوات دي في Instagram.", "msa-white": "الملفات مرتّبة كما تُنشر. اتبع الخطوات التالية على Instagram.", en: "The files are in posting order. Follow these steps in Instagram." },
  cards: [
    { id: "pick-order", title: { eg: "اختار الملفات بالترتيب", "msa-white": "اختر الملفات بالترتيب", en: "Pick the files in order" },
      body: { eg: "ابدأ بوست جديد واختار ملفات فولدر 3x4 بالترتيب: الفيديو الأول وبعدين الصور من 02 لآخر صورة.", "msa-white": "ابدأ منشورًا جديدًا واختر ملفات المجلد 3x4 بالترتيب: الفيديو أولًا ثم الصور من 02 إلى آخر صورة.", en: "Start a new post and pick the files of the 3x4 folder in order: the video first, then the images from 02 to the last one." } },
    { id: "keep-ratio", title: { eg: "سيب المقاس 3:4", "msa-white": "حافظ على مقاس 3:4", en: "Keep the 3:4 ratio" },
      body: { eg: "سيب المقاس زي ما هو (1080×1440) وماتخليش Instagram يقص الصور.", "msa-white": "اترك المقاس كما هو (1080×1440) ولا تدع Instagram يقصّ الصور.", en: "Leave the size as it is (1080×1440) and do not let Instagram crop the images." } },
    { id: "caption", title: { eg: "الصق الوصف", "msa-white": "الصق الوصف", en: "Paste the caption" },
      body: { eg: "انسخ النص من caption.txt زي ما هو. الهاشتاجات في hashtags.txt.", "msa-white": "انسخ النص من caption.txt كما هو. الوسوم في hashtags.txt.", en: "Copy the text of caption.txt as it is. The tags are in hashtags.txt." } },
    { id: "alt-text", title: { eg: "ضيف النص البديل", "msa-white": "أضف النص البديل", en: "Add the alt text" },
      body: { eg: "من الإعدادات المتقدمة ضيف النص البديل لكل صورة من alt-text.txt.", "msa-white": "من الخيارات المتقدمة أضف النص البديل لكل صورة من alt-text.txt.", en: "In the advanced options add each image's alt text from alt-text.txt." } }
  ],
  aiLabel: { id: "ai-label", title: { eg: "فعّل علامة الذكاء الاصطناعي", "msa-white": "فعّل علامة الذكاء الاصطناعي", en: "Switch on the AI label" },
    body: { eg: "في البوست ده صورة اتعملت بالذكاء الاصطناعي. من «الإعدادات المتقدمة» فعّل علامة الذكاء الاصطناعي قبل ما تنشر.", "msa-white": "يتضمن هذا المنشور صورة أُنشئت بالذكاء الاصطناعي. فعّل علامة الذكاء الاصطناعي من «الإعدادات المتقدمة» قبل النشر.", en: "This post contains an AI-generated image. Switch on the AI label in the advanced settings before you post." } },
  kit: { title: { eg: "محتويات الحزمة", "msa-white": "محتويات الحزمة", en: "What is in the kit" }, files: [
    { path: "3x4/01-cover.mp4", note: { "msa-white": "الغلاف المتحرك (الملف الأول)", en: "The animated cover (first file)" } },
    { path: "3x4/01-cover.png", note: { "msa-white": "صورة الغلاف الثابتة", en: "The still cover" } },
    { path: "3x4/", note: { "msa-white": "كل السلايدات بمقاس 3:4", en: "All slides at 3:4" } },
    { path: "4x5/", note: { "msa-white": "نسخة 4:5 للجدولة والنشر عبر الأدوات", en: "A 4:5 copy for schedulers" } },
    { path: "caption.txt", note: { "msa-white": "الوصف", en: "The caption" } },
    { path: "alt-text.txt", note: { "msa-white": "النص البديل لكل سلايد", en: "Alt text per slide" } },
    { path: "carousel.pdf", note: { "msa-white": "كل السلايدات في ملف واحد", en: "All slides in one file" } }
  ] },
  videoMissing: { eg: "الفيديو ماتعملش على الجهاز ده. صدّر الفيديو من الكمبيوتر وحطه أول ملف في البوست.", "msa-white": "لم يُنشأ الفيديو على هذا الجهاز. صدّر الفيديو من الكمبيوتر ثم ضعه أول ملف في المنشور.", en: "The video could not be made on this device. Export it from a computer and put it first in the post." }
};

function postingGuideData() {
  if (X.postingGuideData) return X.postingGuideData;
  var el = document.getElementById("cs-posting-guide");
  if (el) { try { return JSON.parse(el.textContent); } catch (e) { /* fall through to the other sources */ } }
  try { var rules = CS.core && CS.core.registry && CS.core.registry.rules && CS.core.registry.rules(); if (rules && rules.postingGuide) return rules.postingGuide; } catch (e) { /* none */ }
  return BUILTIN_GUIDE;
}

function pick5(obj, dialect) {
  if (!obj) return "";
  if (typeof obj === "string") return obj;
  return obj[dialect] || obj["msa-white"] || obj.en || "";
}

/** True when the post uses AI imagery: an asset flagged aiGenerated, or a slide whose media is marked ai. */
function specUsesAi(spec) {
  return !!spec && ((spec.assets || []).some(function (a) { return a && a.aiGenerated === true; }) || (spec.slides || []).some(function (s) { return s && s.media && s.media.ai === true; }));
}

/** posting-guide.md for `dialect`. `info` (optional): { present: string[] paths in the kit, videoSkipped: boolean, anyAi: boolean }.
 *  With anyAi the guide gets its AI-label card as the last numbered card (the aiLabel block of posting-guide.json). */
function postingGuideFile(dialect, info) {
  var g = postingGuideData(), d = dialect || "msa-white", lines = [], present = info && info.present;
  var cards = (g.cards || []).slice();
  if (info && info.anyAi && g.aiLabel) cards.push(g.aiLabel);
  lines.push("# " + pick5(g.title, d), "", pick5(g.intro, d), "");
  cards.forEach(function (card, i) { lines.push("## " + (i + 1) + ". " + pick5(card.title, d), "", pick5(card.body, d), ""); });
  if (g.kit && g.kit.files) {
    var items = g.kit.files.filter(function (f) {
      if (!present) return true;
      return present.some(function (p) { return f.path.endsWith("/") ? p.indexOf(f.path) === 0 : p === f.path; });
    });
    if (items.length) {
      lines.push("## " + pick5(g.kit.title, d), "");
      items.forEach(function (f) { lines.push("- `" + f.path + "` — " + pick5(f.note, d)); });
      lines.push("");
    }
  }
  if (info && info.videoSkipped && g.videoMissing) lines.push(pick5(g.videoMissing, d), "");
  return textFile("posting-guide.md", lines.join("\n"));
}

/* ------------------------------------------------------------------ the text namespace */

var textApi = {
  caption: function (spec) { return textFile("caption.txt", assembleCaptionText(spec)); },
  hashtags: function (spec) { return textFile("hashtags.txt", ((spec.captionPack && spec.captionPack.hashtags) || []).join(" ")); },
  slideCaptions: function (spec) { return textFile("slide-captions.txt", labelled(spec.captionPack && spec.captionPack.perSlide, (spec.slides || []).length)); },
  alt: function (spec) { return textFile("alt-text.txt", labelled(spec.captionPack && spec.captionPack.alt, (spec.slides || []).length)); },
  postingGuide: function (dialect, info) { return postingGuideFile(dialect, info); },
  usesAi: specUsesAi,
  file: textFile,                                        // any text file of the kit; HTML and SVG ones get the licence comment
  licenceNotice: LICENCE_NOTICE,
  qaMarkdown: function (report, lang) {
    var qa = CS.qa && CS.qa.report && CS.qa.report.toMarkdown;
    if (!qa) throw exportError("E_NO_CAPABILITY", "The QA module (cs-qa.js) is not loaded.");
    return textFile("qa-report.md", qa(report, lang || "ar"));
  }
};

  /* ---- file: files.js ---- */
/*
 * CS.export · slides, cover video, PDF and the kit.
 * Everything is derived from the spec: the exporter renders its own deck (CS.core.render.deck, mode "export", frozen layout)
 * and never reads the Studio's on-screen DOM, so an export is the same whatever the user is looking at.
 */

var FPS_EXPORT = 30;
var JPEG_QUALITY = 0.92;
var JPEG_MAX_BYTES = 8000000;
var BLANK_DELTA = 6;              // luma levels a pixel must differ from the frame's median to count as content
var BLANK_PIXELS = 3;             // a frame with fewer such pixels (of 108 x 144) carries nothing but the background
var FLASH_DELTA = 24;             // mean-luma change between two frames that counts as a flash (same numbers as check_video.mjs)
var STILL_DELTA = 0.03;           // mean luma change from the frame before under which a frame repeats it (plugin.motion.stillDeltaLuma)
var THIN_SHARE = 0.25;            // a frame holding under this share of frame 0's content is thin (plugin.motion.thinShare)

function abortIf(signal) { if (signal && signal.aborted) throw exportError("E_ABORTED", "The export was cancelled."); }

function reportProgress(o, p) {
  if (o && typeof o.onProgress === "function") o.onProgress(p);
  if (typeof CS.emit === "function") CS.emit("cs:export-progress", p);
}

function applyPainterPreference(spec) {
  var pref = spec.compat && spec.compat.paint;
  CS.paint.setPainter(pref === "svg" || pref === "replay" ? pref : "auto");
}

function motionOf(spec) { return (spec.cover && spec.cover.motion) || null; }

/* ------------------------------------------------------------------ the kit's file list */

function kitDefaults(spec, opts) {
  opts = opts || {};
  var carousel = spec.format !== "single", motion = motionOf(spec);
  if (!carousel && motion && motion.clip) throw exportError("E_SCHEMA", "A single post cannot carry a clip cover. Choose a carousel for a video cover.");
  var exportsList = spec.canvas && spec.canvas.exports;
  return {
    carousel: carousel,
    video: opts.video !== undefined ? !!opts.video : carousel && !!motion && (!!motion.clip || motion.recipe !== "none") && !(spec.compat && spec.compat.mp4 === "off"),
    variants4x5: opts.variants4x5 !== undefined ? !!opts.variants4x5 : !exportsList || exportsList.indexOf("4x5") >= 0,
    pdf: opts.pdf !== undefined ? !!opts.pdf : true,
    source: opts.source !== undefined ? !!opts.source : false,        // the editable source files (about 12 MB) are an opt-in: the default kit is made to travel to a phone
    zip: opts.zip !== undefined ? !!opts.zip : true
  };
}

function slideStem(spec, i, carousel) { return carousel ? (i === 0 ? "01-cover" : nn(i)) : "post"; }

/** Relative paths the kit is expected to contain (also what gate X1 checks). */
function kitFilesOf(spec, opts) {
  var o = kitDefaults(spec, opts), n = (spec.slides || []).length, out = [], i;
  if (o.video) out.push("3x4/01-cover.mp4");
  for (i = 0; i < n; i++) out.push("3x4/" + slideStem(spec, i, o.carousel) + ".png");
  if (o.variants4x5) {
    if (o.video) out.push("4x5/01-cover.mp4");
    for (i = 0; i < n; i++) out.push("4x5/" + slideStem(spec, i, o.carousel) + ".jpg");
  }
  out.push("caption.txt", "hashtags.txt", "slide-captions.txt", "alt-text.txt", "posting-guide.md");
  if (o.pdf) out.push("carousel.pdf");
  if (o.source) out = out.concat(sourceFilesOf(spec, opts));
  out.push("qa-report.md", "qa-report.json");
  return out;
}

/** Relative paths of the optional source files: the spec, the cover composition (carousels with motion) and the Studio page. */
function sourceFilesOf(spec, opts) {
  var o = kitDefaults(spec, opts), out = ["spec.json"];
  if (o.carousel && motionOf(spec) && !motionOf(spec).clip && motionOf(spec).recipe !== "none") out.push("cover.hf.html");
  out.push("studio-source.html");
  return out;
}

/* ------------------------------------------------------------------ slides */

function deckOptions(ctx, extra) {
  return Object.assign({ mode: "export", useFrozen: true, assets: ctx && ctx.assets, signal: ctx && ctx.signal }, extra || {});
}

async function exportSlides(spec, ctx, opts) {
  opts = opts || {};
  ctx = ctx || {};
  var signal = opts.signal || ctx.signal, format = opts.format === "jpeg4x5" ? "jpeg4x5" : "png";
  applyPainterPreference(spec);
  var clip = motionOf(spec) && motionOf(spec).clip;
  var deck = await CS.core.render.deck(clip ? X.mp4.clip.layoutSpec(spec) : spec, ctx.brand || null, deckOptions(ctx, { slideIds: opts.only, signal: signal })), files = [], i, s, r, carousel = spec.format !== "single", cover = null;
  try {
    for (i = 0; i < deck.slides.length; i++) {
      abortIf(signal);
      s = deck.slides[i];
      if (clip && s.index === 0) {
        cover = cover || await renderClipCover(spec, ctx, { variants: ["3x4", "4x5"], signal: signal });
        files.push(cover.stills.find(function (f) { return f.path.indexOf(format === "png" ? "3x4/" : "4x5/") === 0; }));
        continue;
      }
      r = await CS.paint.raster(s.el, format === "png" ? { type: "png", crop: "3x4" } : { type: "jpeg", crop: "4x5", quality: JPEG_QUALITY, maxBytes: JPEG_MAX_BYTES });
      files.push(makeFile((format === "png" ? "3x4/" : "4x5/") + slideStem(spec, s.index, carousel) + (format === "png" ? ".png" : ".jpg"), r.bytes, { w: r.w, h: r.h }));
      reportProgress(opts, { job: "slides", done: i + 1, total: deck.slides.length, file: files[files.length - 1].path });
    }
  } finally { deck.dispose(); }
  return files;
}

/* ------------------------------------------------------------------ cover video */

/** Mean luma, median luma, the number of pixels that differ from the median and the grey copy itself, on a 108 x 144 copy of the frame. */
function lumaStats(canvas, small) {
  var sctx = small.getContext("2d", { willReadFrequently: true });
  sctx.imageSmoothingQuality = "medium";
  sctx.drawImage(canvas, 0, 0, small.width, small.height);
  var d = sctx.getImageData(0, 0, small.width, small.height).data, n = small.width * small.height, hist = new Uint32Array(256), grey = new Uint8Array(n), i, v, sum = 0, acc = 0, median = 0, deviating = 0;
  for (i = 0; i < n; i++) { v = Math.round(0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]); grey[i] = v; hist[v]++; sum += v; }
  for (v = 0; v < 256; v++) { acc += hist[v]; if (acc >= n / 2) { median = v; break; } }
  for (v = 0; v < 256; v++) if (Math.abs(v - median) > BLANK_DELTA) deviating += hist[v];
  return { mean: sum / n, median: median, deviating: deviating, grey: grey };
}

/** How much of the loop is a held picture (share of frames that repeat the one before) and the longest run of "thin" frames in seconds
 *  (between the hold-in and settle times, under THIN_SHARE of frame 0's content). */
function motionMetrics(stats, fps, holdIn, settleBy) {
  var frames = stats.length, still = 0, i, j, diff, run = 0, longest = 0, a, b, n, floor = THIN_SHARE * stats[0].deviating, last = Math.min(frames - 1, Math.round(settleBy * fps));
  for (i = 1; i < frames; i++) {
    a = stats[i].grey; b = stats[i - 1].grey; n = a.length; diff = 0;
    for (j = 0; j < n; j++) diff += a[j] > b[j] ? a[j] - b[j] : b[j] - a[j];
    if (diff / n < STILL_DELTA) still++;
  }
  for (i = Math.round(holdIn * fps); i <= last; i++) { if (stats[i].deviating < floor) { run++; if (run > longest) longest = run; } else run = 0; }
  return { stillShare: Math.round(still / Math.max(1, frames - 1) * 1000) / 1000, thinRunSeconds: Math.round(longest / fps * 100) / 100 };
}

function cropCanvas(src, y, h) {
  var c = makeCanvas(src.width, h), cx = opaqueContext(c);
  cx.imageSmoothingEnabled = false;
  cx.drawImage(src, 0, y, src.width, h, 0, 0, src.width, h);
  return c;
}

function loopMetrics(a, b) {
  var m = CS.paint.metrics;
  return { ssim: Math.round(m.ssim(a, b) * 100000) / 100000, psnr: Math.round(m.psnr(a, b) * 100) / 100 };
}

/** Slide 1 of the deck, its motion timeline and, when `withComposition` is set, its HyperFrames composition (built before any motion
 *  touches the DOM; it inlines every font, which is most of its weight and none of the video's, so only the source export asks for it). */
async function prepareCover(spec, ctx, signal, withComposition) {
  var motion = motionOf(spec) || { recipe: "calm" }, firstId = spec.slides && spec.slides[0] && spec.slides[0].id;
  var deck = await CS.core.render.deck(spec, ctx.brand || null, deckOptions(ctx, { slideIds: firstId ? [firstId] : undefined, signal: signal }));
  try {
    var slideEl = deck.slides[0].el, rec = CS.motion.recommend(spec), composition = null;
    var timeline = CS.motion.build(slideEl, { recipe: motion.recipe, seconds: motion.seconds || 6, feel: motion.feel, metaphor: motion.recipe === "story" ? rec.metaphor : undefined, topics: rec.tags });
    if (withComposition) { try { composition = await CS.motion.hf.composition({ slideEl: slideEl, tokens: deck.tokens, timeline: timeline, variant: "3x4" }); } catch (e) { composition = null; } }
    return { deck: deck, slideEl: slideEl, timeline: timeline, composition: composition };
  } catch (e) { deck.dispose(); throw e; }
}

/** What the encoded file says about itself (pixel format, range, level, colour tags), measured from its own headers for gate V1. */
function headerFacts(bytes) {
  var m = X.mp4.inspect(bytes);
  return m ? { pixFmt: m.pixFmt, range: m.range, level: m.level, colour: m.colour } : {};
}

/** cover.hf.html alone (needs no video encoder). Null when the cover has no motion or the template is missing. */
async function coverComposition(spec, ctx, signal) {
  var motion = motionOf(spec);
  if (!motion || motion.recipe === "none" || !spec.slides || !spec.slides.length) return null;
  var prep = await prepareCover(spec, ctx || {}, signal, true);
  try { return prep.composition; } finally { prep.deck.dispose(); }
}

/**
 * Renders the animated cover once and encodes it for every requested variant (`o.composition` also builds cover.hf.html).
 * Returns { files, info (one VideoInfo extension per file), composition, timeline }. Throws E_ENCODER_UNSUPPORTED when
 * the device has no H.264 encoder and E_NO_CAPABILITY for covers the Studio lane cannot render (external motion plates).
 */
async function renderCover(spec, ctx, o) {
  o = o || {};
  ctx = ctx || {};
  var signal = o.signal || ctx.signal, motion = motionOf(spec) || { recipe: "calm" }, variants = o.variants || ["3x4"], fps = FPS_EXPORT;
  if (motion.clip) { applyPainterPreference(spec); return renderClipCover(spec, ctx, o); }
  if (motion.source === "external") throw exportError("E_NO_CAPABILITY", "External motion plates are rendered in Claude Code (HyperFrames), not in the Studio.", { reason: "external-plate" });
  if (motion.recipe === "none") throw exportError("E_NO_CAPABILITY", "This cover has no motion.", { reason: "motion-off" });
  applyPainterPreference(spec);
  var support = await X.mp4.support(CANVAS_W, CANVAS_H, fps);
  if (!support.supported) throw exportError("E_ENCODER_UNSUPPORTED", support.reason || "No H.264 encoder", { reason: "no-encoder" });
  var prep = await prepareCover(spec, ctx, signal, !!o.composition), deck = prep.deck;
  try {
    abortIf(signal);
    var slideEl = prep.slideEl, timeline = prep.timeline, composition = prep.composition;
    var canvas = makeCanvas(CANVAS_W, CANVAS_H);                       // always the full paint; the 4:5 video encodes rows 45 to 1395 of it
    var poster = await CS.paint.toCanvas(slideEl, { scale: 1 });
    var driver = spec.compat && spec.compat.hfRuntime === "native-waapi" ? "waapi" : "style";
    var ctrl = CS.motion.hf.install(slideEl, timeline, "cs-cover", { driver: driver });
    await ctrl.ready;
    var frames = timeline.frames, T = timeline.times, small = makeCanvas(108, 144);
    var stats = [], first = null, last = null;
    var order = variants.filter(function (v) { return v === "3x4" || v === "4x5"; }), targets = order.map(function (v) { return v === "4x5" ? { canvas: canvas, y: CROP_4X5.y, height: CROP_4X5.h } : canvas; });
    var bytesList = await X.mp4.encodeMany({
      canvases: targets, frames: frames, fps: fps, signal: signal,
      onProgress: function (p) { reportProgress(o, p); },
      drawFrame: async function (i) {
        ctrl.seek(i / fps);
        await CS.paint.toCanvas(slideEl, { scale: 1, canvas: canvas, settle: i === 0 });
        stats[i] = lumaStats(canvas, small);
        if (i === 0) first = cropCanvas(canvas, 0, CANVAS_H);
        if (i === frames - 1) last = cropCanvas(canvas, 0, CANVAS_H);
      }
    });
    ctrl.destroy();
    var blank = 0, i, flashes = 0, windowFlashes = [], maxFlashes = 0;
    for (i = Math.round(T.holdIn * fps); i <= Math.min(frames - 1, Math.round(T.settleBy * fps)); i++) if (stats[i].deviating < BLANK_PIXELS) blank++;
    for (i = 1; i < frames; i++) {
      if (Math.abs(stats[i].mean - stats[i - 1].mean) > FLASH_DELTA) windowFlashes.push(i);
      flashes = windowFlashes.filter(function (f) { return f > i - fps && f <= i; }).length;
      if (flashes > maxFlashes) maxFlashes = flashes;
    }
    var infoBase = Object.assign({ blankFrames: blank, flashesPerSecondMax: maxFlashes, constantRate: true, audio: "none" }, motionMetrics(stats, fps, T.holdIn, T.settleBy));
    var files = [], infos = [];
    order.forEach(function (v, k) {
      var path = v + "/01-cover.mp4", crop = v === "4x5", a = crop ? cropCanvas(first, CROP_4X5.y, CROP_4X5.h) : first, z = crop ? cropCanvas(last, CROP_4X5.y, CROP_4X5.h) : last, p = crop ? cropCanvas(poster, CROP_4X5.y, CROP_4X5.h) : poster;
      files.push(makeFile(path, bytesList[k], { w: CANVAS_W, h: crop ? CROP_4X5.h : CANVAS_H }));
      infos.push(Object.assign({ file: path, loop: { frame0VsPoster: loopMetrics(a, p), lastVsFrame0: loopMetrics(z, a) } }, infoBase, headerFacts(bytesList[k])));
    });
    return { files: files, info: infos, composition: composition, timeline: timeline };
  } finally { deck.dispose(); }
}

async function exportCover(spec, ctx, opts) {
  opts = opts || {};
  var r = await renderCover(spec, ctx, { variants: [opts.variant === "4x5" ? "4x5" : "3x4"], onProgress: opts.onProgress, signal: opts.signal });
  return r.files[0];
}

/* ------------------------------------------------------------------ PDF */

async function decodeToJpeg(file) {
  if (file.mime === "image/jpeg") return file.bytes;
  var bitmap = await createImageBitmap(new Blob([file.bytes], { type: file.mime })), c = makeCanvas(bitmap.width, bitmap.height), cx = opaqueContext(c);
  cx.fillStyle = "#FFFFFF"; cx.fillRect(0, 0, c.width, c.height); cx.drawImage(bitmap, 0, 0);
  if (bitmap.close) bitmap.close();
  return encodeBytes(c, "image/jpeg", JPEG_QUALITY);
}

async function exportPdf(files, opts) {
  var pages = [], i, bytes, info;
  for (i = 0; i < files.length; i++) {
    bytes = await decodeToJpeg(files[i]);
    info = jpegInfo(bytes);
    pages.push({ jpeg: bytes, w: info.w, h: info.h, components: info.components });
  }
  return makeFile("carousel.pdf", pdfBytes(pages, opts && opts.title));
}

/* ------------------------------------------------------------------ source files (opt-in) */

/**
 * The editable source: spec.json, cover.hf.html (carousels with motion; `opts.composition` reuses one already built) and
 * studio-source.html (the Studio page, serialised credit-free by ctx.sourceHtml). `opts.check` runs gate X1 on them first and
 * throws E_QA_BLOCK on a finding. Returns { files, skipped }. These are the heavy
 * files of an export (about 12 MB, nearly all of it embedded fonts), so they are an opt-in and never part of the default kit.
 */
async function exportSource(spec, ctx, opts) {
  opts = opts || {};
  ctx = ctx || {};
  var files = [textFile("spec.json", JSON.stringify(spec, null, 2))], skipped = [], wantsHf = sourceFilesOf(spec).indexOf("cover.hf.html") >= 0, composition = opts.composition || null;
  if (wantsHf && !composition) { try { composition = await coverComposition(spec, ctx, opts.signal || ctx.signal); } catch (e) { if (e && e.code === "E_ABORTED") throw e; composition = null; } }
  if (composition) files.push(textFile("cover.hf.html", composition));
  else if (wantsHf) skipped.push({ path: "cover.hf.html", reason: "the cover composition template is not part of this page" });
  if (typeof ctx.sourceHtml === "function") files.push(textFile("studio-source.html", ctx.sourceHtml()));
  else skipped.push({ path: "studio-source.html", reason: "no credit-free Studio source was provided" });
  if (opts.check && CS.qa && typeof CS.qa.runExport === "function") {         // a standalone source export is held to gate X1 like a kit (the kit's own QA run covers the files it holds)
    var blocks = (await CS.qa.runExport({ spec: spec, brand: ctx.brand || null, files: files, expected: [] }, { gates: ["X1"] })).filter(function (r) { return r.sev === "BLOCK"; });
    if (blocks.length) throw exportError("E_QA_BLOCK", "The source files failed the clean-export check (" + blocks[0].rule + ").", { rules: blocks.map(function (r) { return r.rule; }) });
  }
  return { files: files, skipped: skipped };
}

/* ------------------------------------------------------------------ ZIP */

function exportZip(files, opts) {
  var root = opts && opts.root !== undefined ? opts.root : "carousel-kit", name = (opts && opts.name) || "carousel-kit.zip";
  var entries = files.map(function (f) { return { name: (root ? root + "/" : "") + f.path, bytes: f.bytes }; });
  return makeFile(name, zipBytes(entries, opts && opts.date));
}

/* ------------------------------------------------------------------ the kit */

async function buildKit(spec, ctx, opts) {
  opts = opts || {};
  if (motionOf(spec) && motionOf(spec).clip) opts = Object.assign({}, opts, { videoFiles: undefined, videoErrors: undefined });
  ctx = ctx || {};
  var signal = opts.signal || ctx.signal, o = kitDefaults(spec, opts), dialect = opts.dialect || ctx.dialect || (spec.locale && spec.locale.dialect) || "msa-white";
  var files = [], skipped = [], videoInfos = [], carousel = o.carousel, n = (spec.slides || []).length, composition = null, clipCover = null, clipFailed = false;
  var steps = n + (o.video ? 1 : 0) + 3, done = 0;
  var bump = function (label, file) { done += 1; reportProgress(opts, { job: "kit", done: Math.min(done, steps), total: steps, label: label, file: file }); };
  applyPainterPreference(spec);

  if (o.video && opts.videoErrors && opts.videoErrors.length) {
    skipped = skipped.concat(opts.videoErrors);
  }
  if (o.video && opts.videoFiles && opts.videoFiles.length && !(motionOf(spec) && motionOf(spec).clip)) {
    // the cover was already rendered elsewhere (Claude Code lane: HyperFrames); its bytes and measurements are used as they are
    opts.videoFiles.forEach(function (v) { files.push(makeFile(v.path, v.bytes, v.w ? { w: v.w, h: v.h } : undefined)); if (v.info) videoInfos.push(Object.assign({ file: v.path }, v.info)); });
    bump("video");
  } else if (o.video && !(opts.videoErrors && opts.videoErrors.length)) {
    try {
      var cover = await renderCover(spec, ctx, { variants: o.variants4x5 ? ["3x4", "4x5"] : ["3x4"], composition: o.source, onProgress: opts.onProgress, signal: signal });
      files = files.concat(cover.files); videoInfos = cover.info; composition = cover.composition;
      if (motionOf(spec) && motionOf(spec).clip) clipCover = cover;
    } catch (e) {
      if (e && e.code === "E_ABORTED") throw e;
      var why = e && e.code === "E_ENCODER_UNSUPPORTED" ? "no H.264 encoder" : e && e.code === "E_DEP_LOAD" ? "the MP4 writer could not be loaded" :
        e && e.detail && e.detail.reason === "external-plate" ? "external motion plate (Claude Code)" : String(e && e.message || e);
      if (motionOf(spec) && motionOf(spec).clip) { clipFailed = true; skipped.push({ path: "clip-cover", reason: why }); }
      skipped.push({ path: "3x4/01-cover.mp4", reason: why });
      if (o.variants4x5) skipped.push({ path: "4x5/01-cover.mp4", reason: why });
    }
    bump("video");
  }

  // A still-only export of a clip cover still takes its poster from an encoded frame.
  if (!o.video && motionOf(spec) && motionOf(spec).clip) {
    try { clipCover = await renderClipCover(spec, ctx, { variants: o.variants4x5 ? ["3x4", "4x5"] : ["3x4"], signal: signal, onProgress: opts.onProgress }); }
    catch (e) {
      if (e && e.code === "E_ABORTED") throw e;
      clipFailed = true; skipped.push({ path: "clip-cover", reason: String(e && e.message || e) });
    }
  }
  var deck = await CS.core.render.deck(clipCover ? X.mp4.clip.layoutSpec(spec) : spec, ctx.brand || null, deckOptions(ctx, { signal: signal })), png = [], jpg = [], pdfSources = [], i, s, outs, r;
  try {
    if (clipCover && clipCover.mediaPoster) {
      var media = deck.slides[0].el.querySelector('[data-slot="media"]');
      if (media) {
        var image = document.createElement("img"); image.src = clipCover.mediaPoster; image.alt = "";
        image.style.cssText = "width:100%;height:100%;object-fit:fill"; media.replaceChildren(image);
        if (image.decode) await image.decode();
      }
    }
    for (i = 0; i < deck.slides.length; i++) {
      abortIf(signal);
      s = deck.slides[i];
      if (clipFailed && s.index === 0) { bump("slides", "3x4/01-cover.png"); continue; }
      if (clipCover && s.index === 0) {
        png.push(clipCover.stills.find(function (f) { return f.path === "3x4/01-cover.png"; }));
        if (o.variants4x5) jpg.push(clipCover.stills.find(function (f) { return f.path === "4x5/01-cover.jpg"; }));
        if (o.pdf) pdfSources.push(makeFile("3x4/01-cover.jpg", await encodeBytes(clipCover.posters["3x4"], "image/jpeg", JPEG_QUALITY), { w: 1080, h: 1440 }));
        bump("slides", "3x4/01-cover.png");
        continue;
      }
      outs = [{ type: "png", crop: "3x4" }];
      if (o.variants4x5) outs.push({ type: "jpeg", crop: "4x5", quality: JPEG_QUALITY, maxBytes: JPEG_MAX_BYTES });
      if (o.pdf) outs.push({ type: "jpeg", crop: "3x4", quality: JPEG_QUALITY });
      r = await CS.paint.rasterMany(s.el, outs, { paintScale: 2 });
      var stem = slideStem(spec, s.index, carousel);
      png.push(makeFile("3x4/" + stem + ".png", r[0].bytes, { w: r[0].w, h: r[0].h }));
      if (o.variants4x5) jpg.push(makeFile("4x5/" + stem + ".jpg", r[1].bytes, { w: r[1].w, h: r[1].h }));
      if (o.pdf) pdfSources.push(makeFile("3x4/" + stem + ".jpg", r[outs.length - 1].bytes, { w: r[outs.length - 1].w, h: r[outs.length - 1].h }));
      bump("slides", "3x4/" + stem + ".png");
    }
  files = files.concat(png, jpg);

  files.push(textApi.caption(spec), textApi.hashtags(spec), textApi.slideCaptions(spec), textApi.alt(spec));
  if (o.pdf && !clipFailed) files.push(await exportPdf(pdfSources, { title: (spec.hook && spec.hook.cover) || (spec.brief && spec.brief.topic) || "" }));
  bump("pdf");
  if (o.source) {
    var source = await exportSource(spec, ctx, { composition: composition, signal: signal });
    files = files.concat(source.files);
    skipped = skipped.concat(source.skipped);
  }
  files.push(postingGuideFile(dialect, { present: files.map(function (f) { return f.path; }), anyAi: specUsesAi(spec), videoSkipped: skipped.some(function (k) { return k.path === "3x4/01-cover.mp4"; }) }));

  var expected = kitFilesOf(spec, opts).filter(function (p) { return p !== "qa-report.md" && p !== "qa-report.json"; });
  var report;
  if (CS.qa && typeof CS.qa.run === "function") {
    // the live deck goes in too: the rendered gates (sizes, contrast, the 130 px tile, the dead zone, the chrome) belong to the kit's report, not only to the Studio's Check screen
    report = await CS.qa.run({ spec: spec, brand: ctx.brand || null, tokens: deck.tokens, deck: deck, files: files, video: videoInfos, skipped: skipped, expected: expected, checkpoint: "exported", lane: ctx.lane || "studio" });
    files.push(textApi.qaMarkdown(report, dialect === "en" ? "en" : "ar"), textFile("qa-report.json", JSON.stringify(report, null, 2)));
  } else {
    skipped.push({ path: "qa-report.md", reason: "the QA module is not loaded" }, { path: "qa-report.json", reason: "the QA module is not loaded" });
    report = null;
  }
  bump("qa");

  var order = kitFilesOf(spec, opts), rank = function (p) { var k = order.indexOf(p); return k < 0 ? order.length : k; };
  files.sort(function (a, b) { return rank(a.path) - rank(b.path); });
  var zipFile = null;
  if (o.zip) { zipFile = exportZip(files, { name: spec.id + "-kit.zip", root: "carousel-kit", date: spec.meta && spec.meta.updatedAt ? new Date(spec.meta.updatedAt) : undefined }); }
  bump("zip");
  if (typeof CS.emit === "function") CS.emit("cs:export-done", { files: files.map(function (f) { return { path: f.path, bytes: f.bytes.length }; }) });
  return { files: files, zip: zipFile, report: report, skipped: skipped };
  } finally { deck.dispose(); }
}

  /* ---- file: clip.js ---- */
/* Clip covers use the browser compositor in every lane. The encoded first frame supplies every still. */
async function clipDeck(spec, ctx, signal) {
  var first = spec.slides && spec.slides[0];
  return CS.core.render.deck(X.mp4.clip.layoutSpec(spec), ctx.brand || null,
    deckOptions(ctx, { slideIds: first ? [first.id] : undefined, signal: signal }));
}

async function renderClipCover(spec, ctx, o) {
  var signal = o.signal || ctx.signal, deck = await clipDeck(spec, ctx, signal), prep;
  var started = performance.now();
  try {
    prep = await X.mp4.clip.prepare(spec, deck.slides[0].el, deck.tokens, signal);
    var variants = o.variants || ["3x4"], small = makeCanvas(108, 144), stats = [], firstContent;
    var bytes = await X.mp4.encodeMany({
      canvases: variants.map(function (v) { return v === "4x5" ? { canvas: prep.canvas, y: 45, height: 1350 } : prep.canvas; }),
      frames: prep.frames, fps: FPS_EXPORT, signal: signal,
      loopHoldFrame: prep.finalHoldFrame,
      onProgress: function (p) { reportProgress(o, p); },
      drawFrame: async function (i) {
        await prep.drawFrame(i);
        var s = lumaStats(prep.canvas, small); stats.push(s);
        if (i === 0) firstContent = s.deviating;
        if (s.deviating < Math.max(BLANK_PIXELS, firstContent * THIN_SHARE)) throw exportError("E_NO_CAPABILITY",
          "Clip frame " + i + " (" + (i / FPS_EXPORT).toFixed(3) + " s) is blank or nearly blank. Choose a different clip segment.", { reason: "clip-blank", frame: i });
      }
    });
    var files = [], info = [], posters = {}, stills = [];
    for (var k = 0; k < variants.length; k++) {
      var v = variants[k], file = v + "/01-cover.mp4";
      var poster = await X.mp4.clip.decodePoster(bytes[k]), last = await X.mp4.clip.decodePoster(bytes[k], (prep.frames - 1) / FPS_EXPORT);
      posters[v] = poster;
      files.push(makeFile(file, bytes[k], { w: 1080, h: poster.height }));
      // Both metrics compare decoded pixels. The PNG never takes a second colour trip through the encoder.
      info.push(Object.assign({ file: file, kind: "clip", ending: prep.ending, endpointSsim: prep.endpointSsim,
        loop: { frame0VsPoster: loopMetrics(poster, poster), lastVsFrame0: loopMetrics(last, poster) }, blankFrames: 0,
        constantRate: true, audio: "none", flashesPerSecondMax: clipFlashes(stats),
        composeSeconds: Math.round((performance.now() - started) / 10) / 100 }, headerFacts(bytes[k])));
      var type = v === "4x5" ? "jpeg" : "png";
      stills.push(makeFile(v + "/01-cover." + (type === "png" ? "png" : "jpg"), await encodeBytes(poster, type === "png" ? "image/png" : "image/jpeg", JPEG_QUALITY), { w: 1080, h: poster.height }));
    }
    return { files: files, info: info, stills: stills, posters: posters, composition: null,
      mediaPoster: prep.mediaPoster.toDataURL("image/png"), timeline: { duration: prep.duration, frames: prep.frames, fps: FPS_EXPORT, recipe: "clip", ending: prep.ending } };
  } finally { if (prep) prep.close(); deck.dispose(); }
}

function clipFlashes(stats) {
  var jumps = [], max = 0;
  stats.forEach(function (s, i) {
    if (i && Math.abs(s.mean - stats[i - 1].mean) > FLASH_DELTA) jumps.push(i);
    max = Math.max(max, jumps.filter(function (j) { return j > i - FPS_EXPORT; }).length);
  });
  return max;
}

/** A one-frame encode is enough for a preview with the same encoder colour path as the full cover. */
async function previewClipCover(spec, ctx) {
  ctx = ctx || {};
  var deck = await clipDeck(spec, ctx, ctx.signal), prep;
  try {
    prep = await X.mp4.clip.prepare(spec, deck.slides[0].el, deck.tokens, ctx.signal);
    var bytes = await X.mp4.encode({ canvas: prep.canvas, frames: 1, fps: FPS_EXPORT, signal: ctx.signal, drawFrame: prep.drawFrame });
    return X.mp4.clip.decodePoster(bytes);
  } finally { if (prep) prep.close(); deck.dispose(); }
}

X.clipPoster = previewClipCover;

  /* ---- file: save.js ---- */
/*
 * CS.export.save · getting the files to the user.
 *
 * Order (mode "auto"): Web Share with files (touch device, inside a user gesture) -> the host's `downloads` capability
 * (a single ZIP when there are more than three files) -> a plain <a download>. A cancelled share or save is not an error.
 */

var downloadsPromise = null;

function downloadsCapability() {
  if (!downloadsPromise) {
    downloadsPromise = (window.claude && typeof window.claude.use === "function")
      ? Promise.resolve().then(function () { return window.claude.use("downloads"); }).catch(function () { return null; })
      : Promise.resolve(null);
  }
  return downloadsPromise;
}

function isTouchDevice() {
  if (CS.util && typeof CS.util.isTouch === "function") return CS.util.isTouch();
  return !!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches);
}

function hasUserActivation() { var ua = navigator.userActivation; return !ua || ua.isActive; }

function mimeBase(mime) { return String(mime).split(";")[0]; }

function asBlob(file) { return new Blob([file.bytes], { type: mimeBase(file.mime) }); }

function shareFiles(list) { return list.map(function (f) { return new File([f.bytes], f.name, { type: mimeBase(f.mime) }); }); }

function canShareFiles(list) {
  try { return !!(navigator.canShare && navigator.share && navigator.canShare({ files: shareFiles(list) })); } catch (e) { return false; }
}

async function saveViaShare(list, result) {
  try {
    await navigator.share({ files: shareFiles(list) });
    list.forEach(function (f) { result.saved.push(f.name); });
    result.mode = "share";
    return true;
  } catch (e) {
    if (e && e.name === "AbortError") { list.forEach(function (f) { result.declined.push(f.name); }); result.mode = "share"; return true; }
    return false;
  }
}

async function saveOneViaDownloads(dl, file, result) {
  try {
    var r = await dl.save({ filename: file.name, data: asBlob(file) });
    if (r && r.status === "declined") result.declined.push(file.name); else result.saved.push(file.name);
  } catch (e) {
    if (e && e.code === "declined") result.declined.push(file.name);
    else if (e && e.code === "extension_not_enabled") throw e;
    else result.failed.push({ name: file.name, error: String(e && e.message || e) });
  }
}

async function saveViaDownloads(dl, list, result, onStatus) {
  result.mode = "downloads";
  var i;
  if (list.length > 3) {
    var zip = exportZip(list, { name: "carousel-kit.zip", root: "carousel-kit" });
    try {
      if (onStatus) onStatus(zip.name);
      await saveOneViaDownloads(dl, zip, result);
      if (result.saved.indexOf(zip.name) >= 0) { result.saved = list.map(function (f) { return f.name; }); }
      return true;
    } catch (e) {
      if (!(e && e.code === "extension_not_enabled")) throw e;      // the host does not allow archives: send the files one by one
    }
  }
  for (i = 0; i < list.length; i++) {
    if (onStatus) onStatus(list[i].name);
    try { await saveOneViaDownloads(dl, list[i], result); }
    catch (e) { result.failed.push({ name: list[i].name, error: String(e && e.message || e) }); }
  }
  return true;
}

function saveViaAnchor(list, result, onStatus) {
  result.mode = "anchor";
  return list.reduce(function (chain, file) {
    return chain.then(function () {
      return new Promise(function (resolve) {
        try {
          var url = URL.createObjectURL(asBlob(file)), a = document.createElement("a");
          a.href = url; a.download = file.name; a.style.display = "none";
          document.body.appendChild(a);
          if (onStatus) onStatus(file.name);
          a.click();
          result.saved.push(file.name);
          setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); resolve(); }, 250);
        } catch (e) { result.failed.push({ name: file.name, error: String(e && e.message || e) }); resolve(); }
      });
    });
  }, Promise.resolve());
}

/** save(files, { mode?: "auto"|"downloads"|"share"|"anchor", onStatus? }) -> SaveResult */
async function saveFiles(files, opts) {
  opts = opts || {};
  var list = Array.isArray(files) ? files : [files], mode = opts.mode || "auto", result = { mode: "downloads", saved: [], declined: [], failed: [] };
  if (!list.length) return result;
  if ((mode === "share" || (mode === "auto" && isTouchDevice() && hasUserActivation())) && canShareFiles(list)) {
    if (await saveViaShare(list, result)) return result;
    if (mode === "share") { list.forEach(function (f) { result.failed.push({ name: f.name, error: "share failed" }); }); return result; }
  } else if (mode === "share") {
    list.forEach(function (f) { result.failed.push({ name: f.name, error: "Web Share with files is not available" }); });
    result.mode = "share";
    return result;
  }
  if (mode === "auto" || mode === "downloads") {
    var dl = await downloadsCapability();
    if (dl && await saveViaDownloads(dl, list, result, opts.onStatus)) return result;
  }
  await saveViaAnchor(list, result, opts.onStatus);
  return result;
}

  /* ---- file: automation.js ---- */
/*
 * CS.automation · the hook the Claude Code lane uses (render.mjs).
 * Active only when the page URL has automation=1 (or window.__CS_AUTOMATION is true). It never runs in a normal Studio session.
 * Files stay in memory (window.__csFiles) and are pulled out in base64 slices, so nothing is written or sent anywhere by the page.
 */

function automationActive() {
  try { return window.__CS_AUTOMATION === true || /[?&]automation=1(?:&|$)/.test(location.search); } catch (e) { return false; }
}

function pageJson(id) {
  var el = document.getElementById(id);
  if (!el) return null;
  try { return JSON.parse(el.textContent); } catch (e) { return null; }
}

function bytesToBase64(bytes) {
  var s = "", i, step = 0x8000;
  for (i = 0; i < bytes.length; i += step) s += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + step, bytes.length)));
  return btoa(s);
}

function base64ToBytes(b64) {
  var bin = atob(b64), out = new Uint8Array(bin.length), i;
  for (i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Resolves asset ids from the spec's inline assets and the brand logo; ids that need the host's asset store stay unresolved. */
function inlineAssetResolver(spec, brand) {
  return function (id) {
    if (id === "logo") {
      var uri = brand && brand.visual && brand.visual.logo && brand.visual.logo.dataUri;
      return uri ? { url: uri, mime: (/^data:([^;,]+)/.exec(uri) || [])[1] || "image/png" } : null;
    }
    var a = (spec.assets || []).filter(function (x) { return x.id === id; })[0];
    if (a && /^data:/.test(a.ref)) return { url: a.ref, mime: a.mime || (/^data:([^;,]+)/.exec(a.ref) || [])[1] || "image/png", w: a.width, h: a.height };
    return null;
  };
}

function createAutomation() {
  var state = { spec: null, brand: null };
  window.__csFiles = window.__csFiles || new Map();
  var ready = new Promise(function (resolve) {
    if (window.__csReady) resolve();
    else if (CS.once) CS.once("cs:ready", function () { resolve(); });
    else document.addEventListener("cs:ready", function () { resolve(); }, { once: true });
  });
  function current() {
    var spec = state.spec || pageJson("cs-spec"), brand = state.brand !== null ? state.brand : pageJson("cs-brand");
    if (!spec) throw exportError("E_USAGE", "No spec is loaded: call CS.automation.setSpec(spec) or open a Studio page that embeds one.");
    return { spec: spec, brand: brand };
  }
  return {
    ready: ready,
    setSpec: async function (spec, brand) {
      state.spec = spec;
      if (brand !== undefined) state.brand = brand;
      if (typeof CS.emit === "function") CS.emit("cs:automation-spec", { specId: spec && spec.id });
    },
    runQa: async function () {
      var c = current(), deck = await CS.core.render.deck(c.spec, c.brand, { mode: "export", useFrozen: true, assets: inlineAssetResolver(c.spec, c.brand) });
      try { return await CS.qa.run({ spec: c.spec, brand: c.brand, tokens: deck.tokens, deck: deck, checkpoint: c.spec.checkpoint || "design", lane: "claude-code" }); }
      finally { deck.dispose(); }
    },
    cover: async function (opts) {
      opts = opts || {};
      var c = current(), result = await renderCover(c.spec, { brand: c.brand, assets: inlineAssetResolver(c.spec, c.brand) },
        { variants: [opts.variant === "4x5" ? "4x5" : "3x4"] });
      var all = result.files.concat(result.stills || []);
      all.forEach(function (f) { window.__csFiles.set(f.path, f.bytes); });
      var results = CS.qa ? await CS.qa.runExport({ spec: c.spec, files: all, video: result.info, expected: [] }, { gates: ["V1"] }) : [];
      return { files: all.map(function (f) { return { path: f.path, bytes: f.bytes.length }; }), info: Object.assign({}, CS.qa ? CS.qa.inspectMp4(result.files[0].bytes) : {}, result.info[0]), timeline: result.timeline, results: results };
    },
    exportAll: async function (opts) {
      opts = opts || {};
      var c = current(), ctx = { brand: c.brand, assets: inlineAssetResolver(c.spec, c.brand), dialect: opts.dialect, lane: "claude-code",
        sourceHtml: CS.ui && typeof CS.ui.serializeSource === "function" ? function () { return CS.ui.serializeSource(); } : undefined };
      var videoFiles = (opts.videos || []).map(function (v) {            // MP4s rendered outside the page: { path, base64, info? }
        return { path: v.path, bytes: base64ToBytes(v.base64), info: v.info };
      });
      var kit = await X.kit(c.spec, ctx, { video: videoFiles.length ? true : opts.video, videoFiles: videoFiles, videoErrors: opts.videoErrors, variants4x5: opts.variants4x5, pdf: opts.pdf, source: opts.source, zip: opts.zip !== false, dialect: opts.dialect });
      window.__csFiles = new Map();
      var all = kit.zip ? kit.files.concat([kit.zip]) : kit.files;
      all.forEach(function (f) { window.__csFiles.set(f.path, f.bytes); });
      return {
        ok: !kit.report || kit.report.status !== "block",
        files: all.map(function (f) { return { path: f.path, bytes: f.bytes.length, mime: f.mime }; }),
        skipped: kit.skipped, report: kit.report
      };
    },
    composition: async function (opts) {
      opts = opts || {};
      var c = current();
      var id = c.spec.slides && c.spec.slides[0] && c.spec.slides[0].id;
      var deck = await CS.core.render.deck(c.spec, c.brand, { mode: "export", useFrozen: true, assets: inlineAssetResolver(c.spec, c.brand), slideIds: id ? [id] : undefined });
      try {
        var motion = (c.spec.cover && c.spec.cover.motion) || { recipe: "calm" }, rec = CS.motion.recommend(c.spec);
        var tl = CS.motion.build(deck.slides[0].el, { recipe: opts.recipe || motion.recipe, seconds: motion.seconds || 6, feel: motion.feel, metaphor: rec.metaphor || undefined, topics: rec.tags });
        var html = await CS.motion.hf.composition({ slideEl: deck.slides[0].el, tokens: deck.tokens, timeline: tl, variant: opts.variant === "4x5" ? "4x5" : "3x4" });
        var poster = await CS.paint.raster(deck.slides[0].el, { type: "png", crop: opts.variant === "4x5" ? "4x5" : "3x4" });
        return { html: html, posterBase64: bytesToBase64(poster.bytes), seconds: tl.duration, frames: tl.frames, recipe: tl.recipe };
      } finally { deck.dispose(); }
    },
    readChunk: async function (path, offset, length) {
      var bytes = window.__csFiles && window.__csFiles.get(path);
      if (!bytes) throw exportError("E_USAGE", "No exported file named " + path);
      return bytesToBase64(bytes.subarray(offset, Math.min(bytes.length, offset + length)));
    }
  };
}

  /* ---- file: api.js ---- */
/*
 * CS.export · public API (CONTRACT 4.7). CS.export.mp4 and CS.export.DEPS come from cs-mp4.js.
 */

async function capabilitiesOf() {
  var painter = await CS.paint.detect(), h264 = await X.mp4.support(CANVAS_W, CANVAS_H, FPS_EXPORT), shareFilesOk = false;
  try { shareFilesOk = !!(navigator.canShare && navigator.canShare({ files: [new File([new Uint8Array(1)], "a.png", { type: "image/png" })] })); } catch (e) { shareFilesOk = false; }
  return {
    downloads: !!(window.claude && typeof window.claude.use === "function") || ("download" in HTMLAnchorElement.prototype),
    webShare: typeof navigator !== "undefined" && typeof navigator.share === "function",
    webShareFiles: shareFilesOk,
    videoEncoder: typeof VideoEncoder !== "undefined",
    h264: h264.supported,
    painter: painter.painter,
    mediabunny: true                       // loaded on demand; a failed load surfaces as E_DEP_LOAD when an MP4 is requested
  };
}

X.capabilities = capabilitiesOf;
X.slides = exportSlides;
X.cover = exportCover;
X.pdf = exportPdf;
X.zip = exportZip;
X.text = textApi;
X.kitFiles = kitFilesOf;
X.sourceFiles = sourceFilesOf;
X.source = exportSource;
X.kit = buildKit;
X.save = saveFiles;
CS.export = X;

if (automationActive()) CS.automation = createAutomation();
})();
