// Browser-only operations, driven by plates.mjs through the same engine as render.mjs.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { planFit } from "./plates-lib.mjs";

export async function measureSlots(page, spec, brand) {
  return page.evaluate(async ({ spec, brand }) => {
    const probe = structuredClone(spec), rows = [], canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const ref = canvas.toDataURL("image/png");
    const ids = [];
    for (const s of probe.slides) {
      const suggestion = { type: "proof", variant: "screenshot", slot: "screenshot", calmZone: "bottom" };
      if (s.type === "cover" || s.type === "poster") Object.assign(suggestion, { type: s.type, variant: "split", slot: "photo" });
      const row = { slideId: s.id, type: s.type, requestedVariant: s.variant || null, supported: false, suggestion };
      rows.push(row);
      if (s.free) { row.reason = "free layouts bypass media; choose an engine layout explicitly (proof/screenshot for a whole illustration)"; continue; }
      const arch = CS.core.registry.getArchetype(s.type);
      if (!arch.template.content.querySelector('[data-kind="media"]')) { row.reason = "this archetype has no media slot; use proof/screenshot"; continue; }
      const id = "plate-probe-" + s.id, current = s.media || {};
      // A prospective slot must exist before fit. Supplying media also prevents an
      // automatic graphic from occupying the same space. The caller's spec is untouched.
      s.media = { ...current, slot: !current.slot || ["none", "icon"].includes(current.slot) ? s.type === "proof" ? "screenshot" : "photo" : current.slot, assetId: id };
      probe.assets ||= []; probe.assets.push({ id, kind: "image", ref, mime: "image/png", width: 1, height: 1, aiGenerated: false });
      ids.push(s.id);
    }
    if (!ids.length) return rows;
    const deck = await CS.core.render.deck(probe, brand, { mode: "export", useFrozen: false, slideIds: ids });
    try {
      for (const r of deck.slides) {
        const row = rows.find(x => x.slideId === r.id), root = r.el.getBoundingClientRect();
        const mat = r.el.querySelector('.cs-media-slot[data-slot="media"]'), image = mat?.querySelector("img");
        const el = image || mat;
        if (!el || r.el.querySelector(".cs-free")) { row.reason = "the current layout ignores media; use proof/screenshot"; continue; }
        const box = el.getBoundingClientRect(), css = getComputedStyle(el), scale = root.width / spec.canvas.w;
        const px = name => parseFloat(css[name]) || 0;
        const left = px("borderLeftWidth") + px("paddingLeft"), top = px("borderTopWidth") + px("paddingTop");
        const width = box.width / scale - left - px("borderRightWidth") - px("paddingRight"), height = box.height / scale - top - px("borderBottomWidth") - px("paddingBottom");
        row.variant = r.el.dataset.variant; row.slot = mat.dataset.mediaKind;
        if (width < 1 || height < 1 || css.display === "none" || css.visibility === "hidden") { row.reason = "picture frame has no visible area with this text and variant; shorten the text or use proof/screenshot"; continue; }
        row.supported = true;
        row.frame = { x: (box.x - root.x) / scale + left, y: (box.y - root.y) / scale + top, width, height };
        row.ratio = width / height;
        row.objectFit = css.objectFit;
        row.subjectBand = { x: .08, y: .225, w: .84, h: .55 };
        row.prompt = `Frame ${width.toFixed(1)} x ${height.toFixed(1)} px, ratio ${row.ratio.toFixed(4)}:1. Wide low composition when landscape; subject within the central 55% horizontal band, at least 8% clear at each side. No text, no letters, no numbers, no logos, no watermark.`;
        row.warnings = r.fit.warnings || [];
      }
      return rows;
    } finally { deck.dispose(); }
  }, { spec, brand });
}

export async function fitImage(page, source, frame, record, { cap, png = false } = {}) {
  const size = await page.evaluate(async source => {
    const im = new Image(); im.src = source; await im.decode();
    return { width: im.naturalWidth, height: im.naturalHeight };
  }, source);
  if (size.width > 16384 || size.height > 16384 || size.width * size.height > 64 * 1024 * 1024) throw new Error("original exceeds the canvas size limit (16384 per side, 64 megapixels)");
  const geometry = planFit({ ...size, ratio: frame.ratio, gravity: record.gravity, mode: record.mode || (record.pad === true ? "pad" : record.pad === false ? "crop" : "auto"), focus: record.focus, flip: record.flip });
  const encoded = await page.evaluate(async ({ source, geometry: g, cap, png }) => {
    const im = new Image(); im.src = source; await im.decode();
    const ratio = g.canvas.width / g.canvas.height;
    const w = Math.max(1, Math.round(Math.min(1600, g.canvas.width, 1600 * ratio))), h = Math.max(1, Math.round(w / ratio));
    let canvas = document.createElement("canvas"); canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true }), sx = w / g.canvas.width, sy = h / g.canvas.height;
    const d = { x: g.draw.x * sx, y: g.draw.y * sy, w: g.draw.w * sx, h: g.draw.h * sy };
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h);
    if (g.mode === "pad") {
      // Average a narrow edge strip to a single column/row, then extend its
      // colours. Only the new canvas gets seeded grain; the subject is intact.
      const edge = document.createElement("canvas");
      if (d.x > 0) {
        edge.width = 1; edge.height = h; const ec = edge.getContext("2d");
        ec.drawImage(im, 0, 0, Math.min(6, im.width), im.height, 0, 0, 1, h); ctx.drawImage(edge, 0, 0, d.x + 1, h);
        ec.clearRect(0, 0, 1, h); ec.drawImage(im, Math.max(0, im.width - 6), 0, Math.min(6, im.width), im.height, 0, 0, 1, h); ctx.drawImage(edge, d.x + d.w - 1, 0, w - d.x - d.w + 1, h);
      }
      if (d.y > 0) {
        edge.width = w; edge.height = 1; const ec = edge.getContext("2d");
        ec.drawImage(im, 0, 0, im.width, Math.min(6, im.height), 0, 0, w, 1); ctx.drawImage(edge, 0, 0, w, d.y + 1);
        ec.clearRect(0, 0, w, 1); ec.drawImage(im, 0, Math.max(0, im.height - 6), im.width, Math.min(6, im.height), 0, 0, w, 1); ctx.drawImage(edge, 0, d.y + d.h - 1, w, h - d.y - d.h + 1);
      }
      const pixels = ctx.getImageData(0, 0, w, h); let seed = 3;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if (x >= d.x && x < d.x + d.w && y >= d.y && y < d.y + d.h) continue;
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        const grain = ((seed >>> 24) / 255 - .5) * 4, i = (y * w + x) * 4;
        for (let k = 0; k < 3; k++) pixels.data[i + k] += grain;
      }
      ctx.putImageData(pixels, 0, 0);
    }
    ctx.drawImage(im, g.crop.x, g.crop.y, g.crop.w, g.crop.h, d.x, d.y, d.w, d.h);
    if (g.flip) {
      const flipped = document.createElement("canvas"); flipped.width = w; flipped.height = h;
      const fc = flipped.getContext("2d"); fc.translate(w, 0); fc.scale(-1, 1); fc.drawImage(canvas, 0, 0); canvas = flipped;
    }
    if (png) return { ref: canvas.toDataURL("image/png"), width: w, height: h };
    // Test the actual URI length, including header and base64 padding. Reducing
    // dimensions after quality keeps even noisy originals below the schema cap.
    for (let width = w; ; width = Math.max(1, Math.floor(width * .8))) {
      const height = Math.max(1, Math.round(width / ratio)), c = document.createElement("canvas"); c.width = width; c.height = height;
      c.getContext("2d").drawImage(canvas, 0, 0, width, height);
      for (const quality of [.86, .78, .7, .62, .54, .46]) {
        const ref = c.toDataURL("image/jpeg", quality);
        if (ref.length <= cap) {
          const body = ref.slice(ref.indexOf(",") + 1), padding = (body.match(/=+$/) || [""])[0].length;
          return { ref, width, height, quality, bytes: body.length * 3 / 4 - padding };
        }
      }
      if (width === 1) break;
    }
    throw new Error("cannot encode a JPEG within the schema asset cap");
  }, { source, geometry, cap, png });
  return { ...encoded, geometry, original: size };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) && process.argv.includes("--help")) process.stdout.write("usage: import measureSlots or fitImage from plates-browser.mjs; run node plates.mjs --help for the picture commands\n");
