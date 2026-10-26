/* ui/state.js · the working state: spec, undo history, selection; every mutation goes through ctx.commit(). */

var ADDABLE_TYPES = ["item", "step", "stat", "compare", "myth-fact", "quote", "story-beat", "checklist", "summary", "setup", "proof", "share", "grid", "timeline"];

function addableTypes() {
  return ADDABLE_TYPES.filter(function (type) {
    return (type !== "grid" && type !== "timeline") || typeof CS.ui._.editors.items === "function";
  });
}
var HISTORY_LIMIT = 60;

/** Fields editable as text for each slide type, in reading order. "number" and "cta.text" are composite editors. */
var FIELDS_BY_TYPE = {
  cover: ["kicker", "headline", "sub"],
  rehook: ["headline", "sub", "bridge"],
  item: ["title", "body", "bridge"],
  step: ["title", "body", "bridge"],
  stat: ["number", "title", "body", "bridge"],
  compare: ["title", "sides", "bridge"],
  "myth-fact": ["title", "sides", "bridge"],
  quote: ["body", "attribution"],
  "story-beat": ["title", "body", "bridge"],
  checklist: ["title", "bullets", "bridge"],
  summary: ["title", "bullets"],
  setup: ["title", "bullets", "bridge"],
  proof: ["title", "body", "number", "bridge"],
  share: ["headline", "sub"],
  cta: ["title", "body", "cta"],
  offer: ["title", "bullets", "number", "cta"],
  testimonial: ["body", "attribution"],
  poster: ["kicker", "headline", "sub", "bullets", "cta"],
  grid: ["title", "bridge"],
  timeline: ["title", "bridge"]
};

function blankSlideFor(type) {
  switch (type) {
    case "stat": return { number: { value: "0" } };
    case "compare": case "myth-fact": return { sides: [{ text: "" }, { text: "" }] };
    case "checklist": case "summary": case "setup": return { bullets: [""] };
    default: return {};
  }
}

function readPlatform() {
  var rules = readJsonBlock("cs-rules");
  return (rules && rules.platform) || null;
}

function slideIndex(spec, id) {
  for (var i = 0; i < spec.slides.length; i++) if (spec.slides[i].id === id) return i;
  return -1;
}

/** Re-align per-slide caption/alt arrays after slides were added, removed or moved (matched by slide id). */
function realignCaption(oldSpec, newSpec) {
  var cp = newSpec.captionPack;
  var old = oldSpec.captionPack;
  if (!cp || !old || (!old.perSlide && !old.alt)) return newSpec;
  var byId = {};
  oldSpec.slides.forEach(function (s, i) { byId[s.id] = { per: (old.perSlide || [])[i], alt: (old.alt || [])[i] }; });
  var next = Object.assign({}, cp);
  if (old.perSlide) next.perSlide = newSpec.slides.map(function (s) { return (byId[s.id] && byId[s.id].per) || ""; });
  if (old.alt) next.alt = newSpec.slides.map(function (s) { return (byId[s.id] && byId[s.id].alt) || ""; });
  return Object.assign({}, newSpec, { captionPack: next });
}

/** Build the working context of one Studio instance. */
function createCtx(root, data, opts) {
  var bus = makeBus();
  var ctx = {
    root: root, data: data, opts: opts || {}, bus: bus,
    config: data.config || {},
    brand: data.brand || null,
    spec: data.spec,
    base: clone(data.spec),
    dirty: false,
    view: "design",
    screen: "design",
    tab: "style",
    sel: data.spec.slides && data.spec.slides[0] ? data.spec.slides[0].id : null,
    past: [], future: [],
    guides: { safe: false, crop: false, keepouts: false, content: false },
    qa: { text: [], rendered: [], report: null, running: false, at: 0, stale: true },
    thumbs: new Map(),
    thumbGen: 0,
    caps: { downloads: null, assets: null, sample: null, user: null, publish: null },
    owner: false,
    writer: true,
    busy: {}
  };

  /* ---- reads ------------------------------------------------------------------------------------------------ */
  ctx.slides = function () { return ctx.spec.slides || []; };
  ctx.slide = function (id) { return ctx.slides().filter(function (s) { return s.id === (id || ctx.sel); })[0] || null; };
  ctx.index = function (id) { return slideIndex(ctx.spec, id || ctx.sel); };
  ctx.platform = readPlatform();
  ctx.plugin = ctx.platform && ctx.platform.plugin ? ctx.platform.plugin : null;
  ctx.isEn = function () { return ctx.spec.locale && ctx.spec.locale.dialect === "en"; };
  ctx.canvas = function () { return { w: (ctx.spec.canvas && ctx.spec.canvas.w) || 1080, h: (ctx.spec.canvas && ctx.spec.canvas.h) || 1440 }; };
  ctx.checkpointRank = function () { return ["angle", "script", "design", "ready", "exported"].indexOf(ctx.spec.checkpoint); };

  ctx.preset = function (id) {
    id = id || String(ctx.spec.style.presetId || "").split("@")[0];
    return guard("registry.getPreset", function () { return CS.core.registry.getPreset(id); }, null);
  };
  ctx.presets = function () { return guard("registry.listPresets", function () { return CS.core.registry.listPresets(); }, []); };

  /** Resolver for media assets and the brand logo (CONTRACT 4.1 AssetResolver). */
  ctx.assets = function (assetId) {
    if (assetId === "logo") {
      var uri = ctx.brand && ctx.brand.visual && ctx.brand.visual.logo && ctx.brand.visual.logo.dataUri;
      return uri ? { url: uri, mime: (/^data:([^;]+);/.exec(uri) || [])[1] || "image/png" } : null;
    }
    var a = (ctx.spec.assets || []).filter(function (x) { return x.id === assetId; })[0];
    if (!a) return null;
    if (/^data:/.test(a.ref)) return { url: a.ref, mime: a.mime || (/^data:([^;]+);/.exec(a.ref) || [])[1] || "", w: a.width, h: a.height };
    var m = /^asset:(.+)$/.exec(a.ref);
    return m ? { url: "/_blob/" + m[1], mime: a.mime || "", w: a.width, h: a.height } : null;
  };

  /* ---- mutation core ---------------------------------------------------------------------------------------- */

  /** Drop the approved layout when something that affects pixels changed (CONTRACT 8.1: ready needs a verifying freeze). */
  function invalidateLayout(spec) {
    if (!spec.frozen && !(spec.approvals && spec.approvals.design) && ["ready", "exported"].indexOf(spec.checkpoint) < 0) return spec;
    var next = Object.assign({}, spec);
    delete next.frozen;
    if (next.approvals && next.approvals.design) { next.approvals = Object.assign({}, next.approvals); delete next.approvals.design; }
    if (next.checkpoint === "ready" || next.checkpoint === "exported") next.checkpoint = "design";
    return next;
  }

  /**
   * Apply a change. fn(spec) must return a NEW spec. opts: {origin, path, slides: [ids] | "all", layout: false, history: false, quiet: true}.
   * Returns true when the spec changed.
   */
  ctx.commit = function (fn, o) {
    o = o || {};
    var prev = ctx.spec;
    var next = fn(prev);
    if (!next || next === prev || same(prev, next)) return false;
    if (o.layout !== false) next = invalidateLayout(next);
    if (o.history !== false) {
      ctx.past.push(prev);
      if (ctx.past.length > HISTORY_LIMIT) ctx.past.shift();
      ctx.future = [];
    }
    ctx.spec = next;
    if (!o.quiet) ctx.dirty = true;
    if (o.layout !== false) ctx.qa.stale = true;
    if (ctx.sel && slideIndex(next, ctx.sel) < 0) {
      var at = Math.min(Math.max(slideIndex(prev, ctx.sel), 0), next.slides.length - 1);
      ctx.sel = next.slides[at] ? next.slides[at].id : null;
    }
    var detail = { origin: o.origin || "studio", slides: o.slides || "all", path: o.path || "", layout: o.layout !== false, structure: !!o.structure };
    bus.emit("spec", detail);
    guard("emit spec-change", function () { CS.emit("cs:spec-change", { spec: next, path: detail.path, source: "studio" }); });
    return true;
  };

  function restore(spec, from, to) {
    ctx.spec = spec;
    ctx.dirty = !same(spec, ctx.base);
    ctx.qa.stale = true;
    if (ctx.sel && slideIndex(spec, ctx.sel) < 0) ctx.sel = spec.slides[0] ? spec.slides[0].id : null;
    bus.emit("spec", { origin: "history", slides: "all", path: "", layout: true, structure: true });
    guard("emit spec-change", function () { CS.emit("cs:spec-change", { spec: spec, path: "", source: "studio" }); });
  }
  ctx.canUndo = function () { return ctx.past.length > 0; };
  ctx.canRedo = function () { return ctx.future.length > 0; };
  ctx.undo = function () {
    if (!ctx.past.length) return false;
    ctx.future.push(ctx.spec);
    restore(ctx.past.pop());
    return true;
  };
  ctx.redo = function () {
    if (!ctx.future.length) return false;
    ctx.past.push(ctx.spec);
    restore(ctx.future.pop());
    return true;
  };

  /** Replace the whole spec (setSpec from Claude, automation, or restored edits). */
  ctx.replaceSpec = function (spec, o) {
    o = o || {};
    ctx.spec = spec;
    if (o.rebase) { ctx.base = clone(spec); ctx.dirty = false; ctx.past = []; ctx.future = []; }
    else { ctx.dirty = !same(spec, ctx.base); }
    ctx.qa.stale = true;
    if (!ctx.slide(ctx.sel)) ctx.sel = spec.slides[0] ? spec.slides[0].id : null;
    bus.emit("spec", { origin: o.origin || "external", slides: "all", path: "", layout: true, structure: true });
    guard("emit spec-change", function () { CS.emit("cs:spec-change", { spec: spec, path: "", source: o.source || "claude" }); });
  };

  /* ---- navigation ------------------------------------------------------------------------------------------- */
  ctx.select = function (id, o) {
    if (!id || id === ctx.sel || !ctx.slide(id)) return;
    ctx.sel = id;
    bus.emit("select", { id: id, origin: (o && o.origin) || "ui" });
    CS.emit("cs:select", { slideId: id });
  };
  ctx.go = function (screen, o) {
    if (screen !== ctx.screen) {
      ctx.screen = screen;
      if (screen === "script" || screen === "design") {
        if (ctx.view !== screen) { ctx.view = screen; CS.emit("cs:view-change", { view: screen }); }
      }
      bus.emit("screen", { screen: screen, opts: o || {} });
    } else if (o) bus.emit("screen", { screen: screen, opts: o });
  };
  ctx.setTab = function (tab) { ctx.tab = tab; bus.emit("tab", { tab: tab }); };

  /* ---- spec helpers ----------------------------------------------------------------------------------------- */
  ctx.setSlide = function (id, patch, o) {
    return ctx.commit(function (spec) {
      var i = slideIndex(spec, id);
      if (i < 0) return spec;
      var next = Object.assign({}, spec.slides[i], patch);
      Object.keys(patch).forEach(function (k) { if (patch[k] === undefined) delete next[k]; });
      return setPath(spec, ["slides", i], next);
    }, Object.assign({ slides: [id], path: "/slides/" + id }, o || {}));
  };

  /** Set one text field (index for bullets[i] / sides[i].text). Uses CS.core.spec.setField so the engine owns the semantics. */
  ctx.setField = function (id, field, value, index, o) {
    return ctx.commit(function (spec) {
      return guard("spec.setField", function () { return CS.core.spec.setField(spec, id, field, value, index); }, spec);
    }, Object.assign({ slides: [id], path: "/slides/" + id + "/" + field }, o || {}));
  };

  ctx.setStyle = function (patch, o) {
    return ctx.commit(function (spec) {
      var style = Object.assign({}, spec.style, patch);
      Object.keys(patch).forEach(function (k) { if (patch[k] === undefined || patch[k] === "") delete style[k]; });
      return Object.assign({}, spec, { style: style });
    }, Object.assign({ path: "/style" }, o || {}));
  };

  /** Set several style overrides in one revision (a null or empty value removes the path). */
  ctx.setOverrides = function (map, o) {
    return ctx.commit(function (spec) {
      var ov = Object.assign({}, spec.style.overrides || {});
      Object.keys(map).forEach(function (path) { var value = map[path]; if (value === undefined || value === null || value === "") delete ov[path]; else ov[path] = value; });
      var style = Object.assign({}, spec.style);
      if (Object.keys(ov).length) style.overrides = ov; else delete style.overrides;
      return Object.assign({}, spec, { style: style });
    }, Object.assign({ path: "/style/overrides" }, o || {}));
  };

  ctx.setOverride = function (path, value, o) {
    var map = {};
    map[path] = value;
    return ctx.setOverrides(map, o);
  };

  ctx.setLocale = function (patch, o) {
    return ctx.commit(function (spec) { return Object.assign({}, spec, { locale: Object.assign({}, spec.locale, patch) }); }, Object.assign({ path: "/locale" }, o || {}));
  };

  ctx.setCaption = function (patch, o) {
    return ctx.commit(function (spec) {
      return Object.assign({}, spec, { captionPack: Object.assign({}, spec.captionPack || {}, patch) });
    }, Object.assign({ path: "/captionPack", layout: false, slides: [] }, o || {}));
  };

  ctx.setMotion = function (patch, o) {
    return ctx.commit(function (spec) {
      var motion = Object.assign({}, (spec.cover && spec.cover.motion) || {}, patch);
      return Object.assign({}, spec, { cover: Object.assign({}, spec.cover || {}, { motion: motion }) });
    }, Object.assign({ path: "/cover/motion", slides: [(ctx.slides()[0] || {}).id] }, o || {}));
  };

  ctx.insertSlide = function (type, at, init, o) {
    var newId = null;
    var changed = ctx.commit(function (spec) {
      var made = guard("spec.insertSlide", function () { return CS.core.spec.insertSlide(spec, type, at, Object.assign(blankSlideFor(type), init || {})); }, spec);
      if (made === spec) return spec;
      made = guard("spec.renumber", function () { return CS.core.spec.renumber(made); }, made);
      var oldIds = {};
      spec.slides.forEach(function (s) { oldIds[s.id] = 1; });
      made.slides.forEach(function (s) { if (!oldIds[s.id]) newId = s.id; });
      return realignCaption(spec, made);
    }, Object.assign({ structure: true, path: "/slides" }, o || {}));
    if (changed && newId) ctx.sel = newId;
    return changed ? newId : null;
  };

  ctx.removeSlide = function (id) {
    if (ctx.slides().length <= 1) return false;
    return ctx.commit(function (spec) {
      var next = guard("spec.removeSlide", function () { return CS.core.spec.removeSlide(spec, id); }, spec);
      next = guard("spec.renumber", function () { return CS.core.spec.renumber(next); }, next);
      return realignCaption(spec, next);
    }, { structure: true, path: "/slides" });
  };

  ctx.moveSlide = function (id, delta) {
    var i = slideIndex(ctx.spec, id), to = i + delta;
    if (i < 0 || to < 0 || to >= ctx.slides().length) return false;
    return ctx.commit(function (spec) {
      var next = guard("spec.moveSlide", function () { return CS.core.spec.moveSlide(spec, id, to); }, spec);
      next = guard("spec.renumber", function () { return CS.core.spec.renumber(next); }, next);
      return realignCaption(spec, next);
    }, { structure: true, path: "/slides" });
  };

  ctx.splitSlide = function (id) {
    var before = ctx.slides().length;
    var ok = ctx.commit(function (spec) {
      var next = guard("spec.splitSlide", function () { return CS.core.spec.splitSlide(spec, id); }, spec);
      next = guard("spec.renumber", function () { return CS.core.spec.renumber(next); }, next);
      return realignCaption(spec, next);
    }, { structure: true, path: "/slides" });
    return ok && ctx.slides().length > before;
  };

  ctx.duplicateSlide = function (id) {
    var i = slideIndex(ctx.spec, id);
    var src = ctx.spec.slides[i];
    if (!src) return null;
    var init = clone(src);
    delete init.id; delete init.n;
    return ctx.insertSlide(src.type, i + 1, init);
  };

  /** Number of words of a slide field, markup stripped. */
  ctx.words = function (text) {
    return guard("text.wordCount", function () { return CS.core.text.wordCount(text || ""); }, String(text || "").trim().split(/\s+/).filter(Boolean).length);
  };

  return ctx;
}
