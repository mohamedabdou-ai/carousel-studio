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
