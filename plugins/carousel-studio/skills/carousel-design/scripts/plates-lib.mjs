// Pure picture geometry and records. The browser owns decoding and JPEG encoding.
import path from "node:path";
import { fileURLToPath } from "node:url";
const ID = /^[a-z0-9][a-z0-9_-]{0,31}$/;
const SLIDE = /^s[0-9]{2}$/;
const JPEG = "data:image/jpeg;base64,";
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const object = v => v !== null && typeof v === "object" && !Array.isArray(v);
const keysOnly = (v, keys) => object(v) && Object.keys(v).every(k => keys.includes(k));
const positive = n => Number.isFinite(n) && n > 0;

export function frameRatio(width, height) {
  if (!positive(width) || !positive(height)) throw new Error("frame dimensions must be positive and finite");
  return width / height;
}

function validFocus(f) {
  return keysOnly(f, ["x", "y", "w", "h"]) && [f.x, f.y, f.w, f.h].every(Number.isFinite) &&
    f.x >= 0 && f.y >= 0 && f.w > 0 && f.h > 0 && f.x + f.w <= 1 && f.y + f.h <= 1;
}

/** Focus is a box in the unflipped original, normalized to 0..1. Without one,
 * the prompt's central 55% subject band and 8% side margins are the assumption,
 * not subject detection. Any loss of that box selects padding in auto mode. */
export function planFit({ width, height, ratio, mode = "auto", gravity = "center", focus, flip = false }) {
  frameRatio(width, height); frameRatio(ratio, 1);
  if (!["auto", "crop", "pad"].includes(mode) || !["center", "top", "bottom"].includes(gravity) || typeof flip !== "boolean" || (focus && !validFocus(focus))) throw new Error("invalid fit options");
  const f = focus || { x: .08, y: .225, w: .84, h: .55 };
  const w = Math.min(width, height * ratio), h = Math.min(height, width / ratio);
  const cx = focus ? (f.x + f.w / 2) * width : width / 2;
  const cy = focus ? (f.y + f.h / 2) * height : gravity === "top" ? h / 2 : gravity === "bottom" ? height - h / 2 : height / 2;
  const crop = { x: clamp(cx - w / 2, 0, width - w), y: clamp(cy - h / 2, 0, height - h), w, h };
  const overlapW = Math.max(0, Math.min(crop.x + w, (f.x + f.w) * width) - Math.max(crop.x, f.x * width));
  const overlapH = Math.max(0, Math.min(crop.y + h, (f.y + f.h) * height) - Math.max(crop.y, f.y * height));
  const lost = clamp(1 - overlapW * overlapH / (f.w * width * f.h * height), 0, 1);
  const subjectLoss = lost < 1e-9 ? 0 : lost;
  const chosen = mode === "auto" ? subjectLoss > 1e-9 ? "pad" : "crop" : mode;
  if (chosen === "crop") return { mode: chosen, crop, canvas: { width: w, height: h }, draw: { x: 0, y: 0, w, h }, flip, subjectLoss };
  const cw = Math.max(width, height * ratio), ch = Math.max(height, width / ratio);
  return { mode: chosen, crop: { x: 0, y: 0, w: width, h: height }, canvas: { width: cw, height: ch }, draw: { x: (cw - width) / 2, y: (ch - height) / 2, w: width, h: height }, flip, subjectLoss: 0 };
}

function isoTime(s) {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(s)) return false;
  const d = new Date(s);
  return Number.isFinite(d.valueOf()) && d.toISOString() === s.replace(/(?<=:\d{2})Z$/, ".000Z");
}

export function validateManifest(manifest, slideIds) {
  const errors = [];
  if (!keysOnly(manifest, ["version", "plates"]) || manifest.version !== 1 || !Array.isArray(manifest.plates) || manifest.plates.length > 20) return ["manifest: expected {version: 1, plates: [...]} (at most 20)"];
  const seen = new Set();
  for (const [i, r] of manifest.plates.entries()) {
    const p = `plates[${i}]`, add = m => errors.push(`${p}: ${m}`);
    if (!keysOnly(r, ["slideId", "source", "gravity", "mode", "pad", "flip", "focus", "promptId", "tool", "textCheck", "layout", "aiGenerated"])) { add("unknown fields or invalid record"); continue; }
    if (!SLIDE.test(r.slideId)) add("invalid slideId");
    if (seen.has(r.slideId)) add("duplicate slideId");
    seen.add(r.slideId);
    if (slideIds && !slideIds.includes(r.slideId)) add("unknown slide " + r.slideId);
    if (typeof r.source !== "string" || !/^[^\\:\u0000-\u001f]+\.(png|jpe?g|webp)$/i.test(r.source) || r.source.startsWith("/") || r.source.split("/").some(s => !s || s === "." || s === "..")) add("source must be a relative PNG, JPEG or WebP path inside plates/");
    if (!ID.test(r.promptId) || typeof r.promptId !== "string") add("invalid promptId");
    if (typeof r.tool !== "string" || !r.tool.trim() || r.tool.length > 120) add("tool is required (1..120 characters)");
    if (r.gravity !== undefined && !["center", "top", "bottom"].includes(r.gravity)) add("invalid gravity");
    if (r.mode !== undefined && !["auto", "crop", "pad"].includes(r.mode)) add("invalid mode");
    if (r.pad !== undefined && typeof r.pad !== "boolean") add("pad must be boolean");
    if (r.pad !== undefined && r.mode !== undefined) add("use mode or pad, not both");
    if (r.flip !== undefined && typeof r.flip !== "boolean") add("flip must be boolean");
    if (r.aiGenerated !== undefined && typeof r.aiGenerated !== "boolean") add("aiGenerated must be boolean");
    if (r.focus !== undefined && !validFocus(r.focus)) add("focus must fit inside the normalized original");
    if (!keysOnly(r.textCheck, ["textChecked", "at", "sha256"]) || r.textCheck.textChecked !== true || !isoTime(r.textCheck.at) || (r.textCheck.sha256 !== undefined && !/^[a-f0-9]{64}$/.test(r.textCheck.sha256))) add("textCheck requires textChecked: true and an ISO UTC at time after viewing this original");
    if (r.layout !== undefined && (!keysOnly(r.layout, ["type", "variant", "slot"]) ||
        (r.layout.type !== undefined && !/^[a-z][a-z-]{0,23}$/.test(r.layout.type)) ||
        (r.layout.variant !== undefined && !/^[a-z][a-z0-9-]{0,23}$/.test(r.layout.variant)) ||
        (r.layout.slot !== undefined && !["photo", "cutout", "screenshot", "ui", "plate"].includes(r.layout.slot)))) add("invalid layout (type, variant, slot)");
  }
  return errors;
}

export function refCap(schema) {
  const cap = schema?.$defs?.asset?.properties?.ref?.maxLength;
  if (!Number.isInteger(cap) || cap <= JPEG.length) throw new Error("asset ref maxLength is missing from the spec schema");
  return cap;
}

export function jpegByteCap(cap) {
  const n = 3 * Math.floor((cap - JPEG.length) / 4);
  if (!Number.isInteger(cap) || n < 1) throw new Error("asset cap cannot hold a JPEG data URI");
  return n;
}

export function makeAsset(record, image, cap) {
  if (typeof image.ref !== "string" || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(image.ref) || image.ref.length > cap) throw new Error("JPEG data URI exceeds the asset cap or is invalid");
  if (![image.width, image.height].every(n => Number.isInteger(n) && n > 0 && n <= 16384) || !Number.isInteger(image.bytes) || image.bytes < 1) throw new Error("encoded image dimensions and bytes are required");
  return { id: "plate-" + record.slideId, kind: "image", ref: image.ref, mime: "image/jpeg", width: image.width, height: image.height, bytes: image.bytes, aiGenerated: record.aiGenerated !== false, tool: record.tool, promptId: record.promptId };
}

/** Explicit layout.type is the durable opt-in to leave a free layout. All copy
 * fields remain intact; callers measure the chosen layout before writing. */
export function attachPlate(spec, record, asset) {
  const out = structuredClone(spec), slide = out.slides.find(s => s.id === record.slideId);
  if (!slide) throw new Error("unknown slide " + record.slideId);
  if (slide.free && !record.layout?.type) throw new Error("free slides ignore media; set an explicit layout.type after choosing an engine layout");
  if (record.layout?.type) { slide.type = record.layout.type; delete slide.free; }
  if (record.layout?.variant) slide.variant = record.layout.variant;
  const slot = record.layout?.slot || (slide.type === "proof" ? "screenshot" : "photo");
  if (out.slides.some(s => s.id !== record.slideId && (s.media?.assetId === asset.id || s.media?.backdropAssetId === asset.id))) throw new Error("plate asset is used by another slide; give that picture its own asset first");
  slide.media = { slot, assetId: asset.id, promptId: record.promptId, ai: asset.aiGenerated, calmZone: "bottom" };
  out.assets ||= [];
  const index = out.assets.findIndex(a => a.id === asset.id);
  if (index < 0) out.assets.push(asset); else out.assets[index] = asset;
  out.ext ||= {}; out.ext.assetChecks ||= {};
  out.ext.assetChecks[asset.id] = { ...record.textCheck };
  return out;
}

export function plateFindings(spec, frames, cap) {
  const out = [], byId = new Map((frames || []).map(f => [f.slideId, f]));
  const add = (slideId, code, message, severity = "BLOCK") => out.push({ slideId, code, severity, message });
  for (const slide of Array.isArray(spec?.slides) ? spec.slides : []) {
    const m = slide?.media;
    if (!m?.assetId || ["none", "icon"].includes(m.slot)) continue;
    const f = byId.get(slide.id), a = (Array.isArray(spec.assets) ? spec.assets : []).find(a => a?.id === m.assetId);
    if (frames && !f?.supported) add(slide.id, "ignored", f?.reason || "picture has no rendered frame");
    if (!a) { add(slide.id, "asset", "picture asset is missing"); continue; }
    if (a.ref?.length > cap) add(slide.id, "cap", `asset ref exceeds ${cap} characters`);
    if (!/^data:image\//.test(a.ref || "")) add(slide.id, "ref", "local rendering needs an embedded image data URI");
    if (!positive(a.width) || !positive(a.height)) add(slide.id, "dimensions", "asset width and height are missing");
    else if (f?.supported && Math.abs(a.width / a.height / f.ratio - 1) > Math.max(.005, 1 / a.height)) add(slide.id, "ratio", "picture ratio differs from the current frame; run restyle", "FIX");
    if (m.ai === true && a.aiGenerated !== true) add(slide.id, "flag", "AI picture lacks aiGenerated: true");
    if ((m.ai || a.aiGenerated) && (!a.tool || !a.promptId)) add(slide.id, "provenance", "AI picture needs tool and promptId");
    if ((m.ai || a.aiGenerated) && !(spec.ext?.assetChecks?.[a.id]?.textChecked === true && isoTime(spec.ext.assetChecks[a.id].at))) add(slide.id, "text-check", "dated no-text confirmation is missing");
    if ((m.ai || a.aiGenerated || m.slot === "plate") && (!m.calmZone || m.calmZone === "none")) add(slide.id, "calm-zone", "picture needs a legal calmZone");
  }
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) && process.argv.includes("--help")) process.stdout.write("usage: import the pure helpers from plates-lib.mjs; run node plates.mjs --help for the picture commands\n");
