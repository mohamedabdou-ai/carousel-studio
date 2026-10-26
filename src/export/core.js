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
