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
    exportAll: async function (opts) {
      opts = opts || {};
      var c = current(), ctx = { brand: c.brand, assets: inlineAssetResolver(c.spec, c.brand), dialect: opts.dialect, lane: "claude-code",
        sourceHtml: CS.ui && typeof CS.ui.serializeSource === "function" ? function () { return CS.ui.serializeSource(); } : undefined };
      var videoFiles = (opts.videos || []).map(function (v) {            // MP4s rendered outside the page: { path, base64, info? }
        return { path: v.path, bytes: base64ToBytes(v.base64), info: v.info };
      });
      var kit = await X.kit(c.spec, ctx, { video: videoFiles.length ? true : opts.video, videoFiles: videoFiles, variants4x5: opts.variants4x5, pdf: opts.pdf, source: opts.source, zip: opts.zip !== false, dialect: opts.dialect });
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
