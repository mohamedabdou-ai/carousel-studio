/* core/registry.js · everything the engine knows about the page it runs in. */
(function () {
  var core = (CS.core = CS.core || {});

  var SLIDE_TYPES = ["cover", "rehook", "item", "step", "stat", "compare", "myth-fact", "quote", "story-beat", "checklist", "summary", "setup", "proof", "share", "cta", "offer", "testimonial", "poster", "grid", "timeline"];
  var DIALECTS = ["eg", "gulf", "levant", "msa-white", "en"];
  var RECIPES = ["calm", "counter", "highlight-sweep", "stamp", "reorder", "story", "morph", "split", "map-dots", "cash-wipe", "drop-clock", "scale", "none"];
  var ROLE_KEYS = ["bg", "surface", "ink", "inkMuted", "accent", "accent2"];
  // Matches styles/index.json; the default is a shipped preset.
  core.DEFAULT_PRESET = "creator";

  /** Geometry of ig-3x4 (platform-instagram.json -> geometry); used until rules are registered. */
  var DEFAULT_GEOMETRY = {
    canvas: { w: 1080, h: 1440 },
    safeBox: { x: 34, y: 45, w: 1012, h: 1350 },
    crop4x5: { x: 0, y: 45, w: 1080, h: 1350 },
    contentBox: { x: 114, y: 125, w: 852, h: 1190 },
    bands: { header: { x: 114, y: 165, w: 852, h: 80, itemMaxHeightPx: 49 }, footer: { x: 114, y: 1165, w: 852, h: 80, itemMaxHeightPx: 49 } },
    keepOuts: [
      { id: "top-left", x: 34, y: 45, w: 200, h: 110 },
      { id: "top-right", x: 846, y: 45, w: 200, h: 110 },
      { id: "bottom-left", x: 34, y: 1255, w: 140, h: 140 },
      { id: "bottom-right", x: 906, y: 1255, w: 140, h: 140 }
    ],
    grid: { columns: 12, columnWidthPx: 56, gutterPx: 16, widthPx: 848, baselinePx: 8, mirrorForRtl: true },
    bodyArea: { x: 114, y: 261, w: 852, h: 888 }
  };

  var state = {
    presets: [],            // [{preset, decor}] in registration order
    presetIndex: {},        // id -> index
    occasions: [],
    occasionIndex: {},
    fonts: [],              // registry.families[]
    fontIndex: {},
    coverage: {},           // id -> coverage entry
    archetypes: {},
    archetypeCss: "",
    rules: null,
    decor: {},              // presetId -> {parts: [{css, ph}]}
    decorLocal: {},         // "presetId|key" -> {key, css}
    constants: null
  };

  function err(code, message, detail) { return new CS.CSError(code, message, detail); }
  function clone(v) { return v === undefined ? v : JSON.parse(JSON.stringify(v)); }
  function rect(o) { return Object.freeze({ x: o.x, y: o.y, w: o.w, h: o.h }); }

  /* ---- geometry / constants --------------------------------------------------------------------------- */

  function platformGeometry() {
    var p = state.rules && state.rules.platform;
    return (p && p.geometry) || DEFAULT_GEOMETRY;
  }

  function canvasSize() {
    var p = state.rules && state.rules.platform;
    var c = p && p.canvases && p.canvases[p.defaultCanvas || "ig-3x4"];
    return c ? { w: c.w, h: c.h } : DEFAULT_GEOMETRY.canvas;
  }

  /** Edge-relative canvas geometry, with optional inner bands and zone padding. */
  function geometry(h, opts) {
    var g = platformGeometry(), base = canvasSize();
    opts = opts || {};
    if (opts.inner && g.inner) g = Object.assign({}, g, { bands: Object.assign({}, g.bands, g.inner.bands), bodyArea: g.inner.bodyArea });
    h = h || base.h;
    var dh = h - base.h;
    var content = { x: g.contentBox.x, y: g.contentBox.y, w: g.contentBox.w, h: g.contentBox.h + dh };
    var header = { x: g.bands.header.x, y: g.bands.header.y, w: g.bands.header.w, h: g.bands.header.h };
    var footer = { x: g.bands.footer.x, y: g.bands.footer.y + dh, w: g.bands.footer.w, h: g.bands.footer.h };
    var body = { x: g.bodyArea.x, y: g.bodyArea.y, w: g.bodyArea.w, h: g.bodyArea.h + dh };
    var plugin = state.rules && state.rules.platform.plugin, pads = plugin && plugin.visual && plugin.visual.zone && plugin.visual.zone.padEnd;
    var key = opts.presetId, ownPad = pads && Object.prototype.hasOwnProperty.call(pads, key);
    var padEnd = opts.padEnd === undefined ? ownPad ? pads[opts.type === "poster" ? "posterType" : key] : 0 : opts.padEnd;
    var keep = g.keepOuts.map(function (k) { return { id: k.id, x: k.x, y: k.y >= base.h / 2 ? k.y + dh : k.y, w: k.w, h: k.h }; });
    return {
      canvas: { w: base.w, h: h }, content: content, header: header, footer: footer, body: body, keepOuts: keep,
      zone: { x: body.x, y: body.y, w: body.w, h: Math.max(0, body.h - padEnd) },
      itemMax: g.bands.footer.itemMaxHeightPx || 49, grid: g.grid
    };
  }

  function buildConstants() {
    var g = platformGeometry(), c = canvasSize();
    var rules = state.rules || {};
    var keep = g.keepOuts.map(function (k) { return Object.freeze({ id: k.id, x: k.x, y: k.y, w: k.w, h: k.h }); });
    return Object.freeze({
      CANVAS: Object.freeze({ w: c.w, h: c.h }),
      SAFE: rect(g.safeBox), CROP_4X5: rect(g.crop4x5), CONTENT: rect(g.contentBox),
      HEADER: rect(g.bands.header), FOOTER: rect(g.bands.footer), BODY: rect(g.bodyArea),
      KEEP_OUTS: Object.freeze(keep), GRID: Object.freeze(clone(g.grid)),
      SLIDE_TYPES: Object.freeze(SLIDE_TYPES.slice()), DIALECTS: Object.freeze(DIALECTS.slice()), RECIPES: Object.freeze(RECIPES.slice()),
      PLATFORM: rules.platform || null, LOCALE: rules.locale || null
    });
  }

  /* The identity of CS.core.constants is stable; its members are re-read after registerRules. */
  var constants = {};
  ["CANVAS", "SAFE", "CROP_4X5", "CONTENT", "HEADER", "FOOTER", "BODY", "KEEP_OUTS", "GRID", "SLIDE_TYPES", "DIALECTS", "RECIPES", "PLATFORM", "LOCALE"].forEach(function (k) {
    Object.defineProperty(constants, k, { enumerable: true, get: function () { return (state.constants || (state.constants = buildConstants()))[k]; } });
  });
  Object.freeze(constants);
  core.constants = constants;

  /* ---- JSON blocks ----------------------------------------------------------------------------------- */

  /** Reads a JSON script block and reverses the builder's comment escape. */
  function readBlock(doc, id) {
    doc = doc || document;
    var el = doc.getElementById ? doc.getElementById(id) : doc.querySelector("#" + id);
    if (!el) return null;
    var text = (el.textContent || "").split("<\\!" + "--").join("<!" + "--");
    if (!text.trim()) return null;
    try { return JSON.parse(text); }
    catch (e) { throw err("E_SCHEMA", "The embedded block #" + id + " is not valid JSON (" + e.message + ").", { block: id }); }
  }

  function defaultConfig() {
    return { engine: CS.version, view: "design", mode: "full", lane: "studio", uiDialect: "eg", buildId: "dev", builtAt: new Date(0).toISOString(), creditFree: false, fonts: [], presets: [], capabilities: [] };
  }

  /** Schema validation is B4's; the engine only asks for it when a validator for the kind is registered. */
  function schemaCheck(kind, value, what) {
    var s = core.schema;
    if (!s || typeof s.validate !== "function") return;
    var res;
    try { res = s.validate(kind, value); } catch (e) { return; }
    if (res && res.ok === false) {
      throw err("E_SCHEMA", what + " is not a valid " + kind + ": " + (res.errors && res.errors[0] ? res.errors[0].path + " " + res.errors[0].message : "invalid"), { errors: res.errors });
    }
  }

  /* ---- presets ----------------------------------------------------------------------------------------- */

  var HEX = /^#[0-9A-Fa-f]{6}$/;

  function lightPreset(p) {
    var bad = [];
    if (!p || typeof p !== "object") bad.push("not an object");
    else {
      if (typeof p.id !== "string" || !p.id) bad.push("id");
      ["bg", "ink", "inkMuted", "accent"].forEach(function (r) { if (!p.roles || !HEX.test(p.roles[r] || "")) bad.push("roles." + r); });
      ["display", "heading", "body", "latin"].forEach(function (r) { if (!p.type || !p.type[r] || typeof p.type[r].family !== "string") bad.push("type." + r + ".family"); });
      ["hero", "h1", "h2", "title", "body", "small", "micro"].forEach(function (r) { if (!p.type || !p.type.scale || p.type.scale[r] === undefined) bad.push("type.scale." + r); });
      if (!p.layout || !Array.isArray(p.layout.headlineWidth)) bad.push("layout.headlineWidth");
      if (!p.floors || typeof p.floors.hero !== "number") bad.push("floors");
    }
    if (bad.length) throw err("E_SCHEMA", "Preset" + (p && p.id ? " " + p.id : "") + " is incomplete: " + bad.join(", ") + ".", { missing: bad });
  }

  var PH_OPEN = "\uE000", PH_CLOSE = "\uE001";
  var PH_RE = /\{\{\s*(bg|surface|ink|inkMuted|accent|accent2)\s*\}\}/g;

  /** Splits a flat stylesheet into top-level rules, respecting strings, comments and nested blocks. */
  function splitRules(css) {
    var out = [], depth = 0, start = 0, i = 0, n = css.length, q = null, c;
    while (i < n) {
      c = css.charAt(i);
      if (q) { if (c === "\\") i++; else if (c === q) q = null; }
      else if (c === '"' || c === "'") q = c;
      else if (c === "/" && css.charAt(i + 1) === "*") { var e = css.indexOf("*/", i + 2); i = e < 0 ? n : e + 1; }
      else if (c === "{") depth++;
      else if (c === "}") { depth--; if (depth === 0) { out.push(css.slice(start, i + 1)); start = i + 1; } }
      i++;
    }
    var rest = css.slice(start).trim();
    if (rest) out.push(rest);
    return out;
  }

  function prepareDecor(css) {
    css = String(css || "").replace(PH_RE, function (m, name) { return PH_OPEN + name + PH_CLOSE; });
    return splitRules(css).map(function (r) { return { css: r, ph: r.indexOf(PH_OPEN) >= 0 }; });
  }

  function fillPlaceholders(text, roles) {
    return text.replace(new RegExp(PH_OPEN + "(bg|surface|ink|inkMuted|accent|accent2)" + PH_CLOSE, "g"), function (m, name) { return encodeURIComponent(roles[name] || roles.accent || "#000000"); });
  }

  /** Colour roles of a preset with the defaults of CONTRACT 6.2 filled in (surface, accent2). */
  function presetRoles(preset) {
    var r = preset.roles, C = core.color;
    var surface = r.surface || (C ? C.mix(r.bg, r.ink, 0.04) : r.bg);
    return { bg: r.bg, surface: surface, ink: r.ink, inkMuted: r.inkMuted, accent: r.accent, accent2: r.accent2 || r.accent };
  }

  function registerPreset(preset, decorCss) {
    lightPreset(preset);
    schemaCheck("preset", preset, "Preset " + preset.id);
    var entry = { preset: preset, decor: String(decorCss || "") };
    if (Object.prototype.hasOwnProperty.call(state.presetIndex, preset.id)) state.presets[state.presetIndex[preset.id]] = entry;
    else { state.presetIndex[preset.id] = state.presets.length; state.presets.push(entry); }
    state.decor[preset.id] = prepareDecor(entry.decor);
    Object.keys(state.decorLocal).forEach(function (k) { if (k.indexOf(preset.id + "|") === 0) delete state.decorLocal[k]; });
    ensureDecorStyle(preset.id);
  }

  /** Supplies a preset's decor sheet when the host has not embedded it. */
  function ensureDecorStyle(id) {
    if (typeof document === "undefined" || !document.head) return;
    var list = document.querySelectorAll("style[data-cs-decor]"), el = null, i;
    for (i = 0; i < list.length; i++) { if (list[i].getAttribute("data-cs-decor") === id) { el = list[i]; break; } }
    if (el && !el.hasAttribute("data-cs-decor-auto")) return;
    if (!el) { el = document.createElement("style"); el.setAttribute("data-cs-decor", id); el.setAttribute("data-cs-decor-auto", ""); document.head.appendChild(el); }
    el.textContent = decorCss(id);
  }

  function getPreset(id) {
    var i = state.presetIndex[id];
    if (i === undefined) throw err("E_USAGE", "Unknown style preset \"" + id + "\".", { id: id });
    return state.presets[i].preset;
  }

  function hasPreset(id) { return Object.prototype.hasOwnProperty.call(state.presetIndex, id); }
  function listPresets() { return state.presets.map(function (e) { return e.preset; }); }

  /** The preset's decor.css with every colour placeholder filled from the preset's own roles (valid CSS for hosts that style by preset id). */
  function decorCss(presetId) {
    var parts = state.decor[presetId];
    if (!parts) return "";
    var roles = presetRoles(getPreset(presetId));
    return parts.map(function (p) { return p.ph ? fillPlaceholders(p.css, roles) : p.css; }).join("\n");
  }

  /** Resolves colour placeholders in decor rules and scopes them to these roles. */
  function decorLocal(presetId, roles) {
    var parts = state.decor[presetId];
    if (!parts || !parts.some(function (p) { return p.ph; })) return { key: "", css: "" };
    var key = core.canon ? core.canon.hash(ROLE_KEYS.map(function (k) { return roles[k] || ""; })) : ROLE_KEYS.map(function (k) { return roles[k]; }).join("").replace(/#/g, "");
    var ck = presetId + "|" + key;
    if (state.decorLocal[ck]) return state.decorLocal[ck];
    var scope = new RegExp("\\.cs-slide\\[data-preset\\s*=\\s*([\"']?)" + presetId.replace(/[^a-z0-9-]/gi, "") + "\\1\\s*\\]", "g");
    var css = parts.filter(function (p) { return p.ph; }).map(function (p) {
      return fillPlaceholders(p.css, roles).replace(scope, function (m) { return m + '[data-decor-key="' + key + '"]'; });
    }).join("\n");
    return (state.decorLocal[ck] = { key: key, css: css });
  }

  /* ---- occasions ------------------------------------------------------------------------------------------ */

  function registerOccasion(pack) {
    if (!pack || typeof pack.id !== "string") throw err("E_SCHEMA", "An occasion pack needs an id.");
    schemaCheck("occasion", pack, "Occasion " + pack.id);
    if (Object.prototype.hasOwnProperty.call(state.occasionIndex, pack.id)) state.occasions[state.occasionIndex[pack.id]] = pack;
    else { state.occasionIndex[pack.id] = state.occasions.length; state.occasions.push(pack); }
  }
  function getOccasion(id) { var i = id == null ? undefined : state.occasionIndex[id]; return i === undefined ? null : state.occasions[i]; }
  function listOccasions() { return state.occasions.slice(); }

  /* ---- fonts ---------------------------------------------------------------------------------------------- */

  /** Merges font metadata ({registry, coverage}); callable again at runtime for an uploaded user font. */
  function registerFonts(meta) {
    var fams = (meta && meta.registry && meta.registry.families) || [];
    fams.forEach(function (f) {
      if (!f || typeof f.id !== "string") return;
      if (Object.prototype.hasOwnProperty.call(state.fontIndex, f.id)) state.fonts[state.fontIndex[f.id]] = f;
      else { state.fontIndex[f.id] = state.fonts.length; state.fonts.push(f); }
    });
    var cov = (meta && meta.coverage && meta.coverage.families) || {};
    Object.keys(cov).forEach(function (id) { state.coverage[id] = cov[id]; });
  }

  function hasFont(id) { return Object.prototype.hasOwnProperty.call(state.fontIndex, id); }
  function fontEntry(id) { return hasFont(id) ? state.fonts[state.fontIndex[id]] : null; }
  function fontIds() { return state.fonts.map(function (f) { return f.id; }); }
  /** CSS family name of a registry id ("" for an unknown id). */
  function fontCss(id) { var f = fontEntry(id); return f ? f.family : ""; }

  function inRanges(ranges, cp) {
    var lo = 0, hi = ranges.length - 1;
    while (lo <= hi) {
      var mid = (lo + hi) >> 1, r = ranges[mid];
      if (cp < r[0]) hi = mid - 1; else if (cp > r[1]) lo = mid + 1; else return true;
    }
    return false;
  }

  /** True when the font covers the code point; true as well when no coverage data is registered for the font (cannot be judged). */
  function fontHas(id, cp) {
    var c = state.coverage[id];
    if (!c || !Array.isArray(c.ranges)) return true;
    return inRanges(c.ranges, cp);
  }

  function isInvisibleOrEmoji(cp) {
    return cp < 0x20 || (cp >= 0x7f && cp <= 0x9f) || cp === 0x20 || cp === 0xa0 || cp === 0x202f ||
      (cp >= 0x200b && cp <= 0x200f) || (cp >= 0x2028 && cp <= 0x202e) || (cp >= 0x2060 && cp <= 0x2064) ||
      (cp >= 0xfe00 && cp <= 0xfe0f) || cp === 0xfeff ||
      (cp >= 0x2600 && cp <= 0x27bf) || cp === 0x2b50 || cp === 0x2b55 || (cp >= 0x1f000 && cp <= 0x1faff);
  }

  /**
   * Code points of `text` that the font lacks. Whitespace, zero-width and bidi controls and emoji (drawn by the system emoji
   * font inside .cs-emoji) are not judged.
   */
  function missingGlyphs(id, text) {
    var seen = {}, out = [];
    for (var ch of String(text == null ? "" : text)) {
      var cp = ch.codePointAt(0);
      if (seen[cp] || isInvisibleOrEmoji(cp)) continue;
      seen[cp] = true;
      if (!fontHas(id, cp)) out.push(cp);
    }
    return out.sort(function (a, b) { return a - b; });
  }

  /* ---- archetypes --------------------------------------------------------------------------------------- */

  function words(s) { return String(s || "").split(/[ \t\n\r\f]+/).filter(Boolean); }

  /** Registers the <template data-archetype> partials found under `root` and makes sure their layout sheet is in the document. */
  function registerArchetypes(root) {
    root = root || document;
    var found = 0;
    var css = root.querySelector ? root.querySelector("#cs-archetype-css") : null;
    root.querySelectorAll("template[data-archetype]").forEach(function (t) {
      var type = t.getAttribute("data-archetype");
      if (SLIDE_TYPES.indexOf(type) < 0) throw err("E_SCHEMA", "Unknown archetype \"" + type + "\".", { type: type });
      var main = t.content && t.content.firstElementChild;
      if (!main || !main.classList.contains("cs-content")) throw err("E_SCHEMA", "Archetype \"" + type + "\" must start with <main class=\"cs-content\">.", { type: type });
      var variants = words(t.getAttribute("data-variants"));
      var def = t.getAttribute("data-default-variant") || variants[0];
      state.archetypes[type] = { type: type, variants: variants, defaultVariant: def, chrome: words(t.getAttribute("data-chrome")), template: t };
      found++;
    });
    if (css) state.archetypeCss = css.textContent || "";
    if (state.archetypeCss && !document.getElementById("cs-archetype-css")) {
      var style = document.createElement("style");
      style.id = "cs-archetype-css";
      style.textContent = state.archetypeCss;
      (document.head || document.documentElement).appendChild(style);
    }
    layerLayoutBelowDecor();
    return found;
  }

  /** Keeps layout below decor so equal-specificity preset rules win. */
  function layerLayoutBelowDecor() {
    if (typeof document === "undefined") return;
    var layout = document.getElementById("cs-archetype-css"), firstDecor = document.querySelector("style[data-cs-decor]");
    if (!layout || !firstDecor || !firstDecor.parentNode) return;
    if (firstDecor.compareDocumentPosition(layout) & 4 /* Node.DOCUMENT_POSITION_FOLLOWING */) firstDecor.parentNode.insertBefore(layout, firstDecor);
  }

  function getArchetype(type) {
    var a = state.archetypes[type];
    if (!a) throw err("E_USAGE", "No archetype registered for slide type \"" + type + "\".", { type: type });
    return a;
  }

  function archetypeCss() { return state.archetypeCss; }

  /* ---- rules ------------------------------------------------------------------------------------------------ */

  function registerRules(bundle) {
    if (!bundle || !bundle.platform || !bundle.locale) throw err("E_SCHEMA", "registerRules needs at least the platform and locale blocks.");
    state.rules = {
      qaRules: bundle.qaRules || null, copy: bundle.copy || null, ortho: bundle.ortho || null,
      dialects: bundle.dialects || {}, platform: bundle.platform, locale: bundle.locale
    };
    state.constants = null;
  }

  function rules() {
    if (!state.rules) throw err("E_USAGE", "Rule data is not registered (CS.core.registry.registerRules or loadPage).");
    return state.rules;
  }

  /* ---- the page ----------------------------------------------------------------------------------------------- */

  /** Loads embedded page data and registers its rules, fonts, presets and occasions. */
  function loadPage(doc) {
    doc = doc || document;
    var rulesBlock = readBlock(doc, "cs-rules");
    if (rulesBlock) registerRules(rulesBlock);
    var fonts = readBlock(doc, "cs-fonts-meta");
    if (fonts) registerFonts(fonts);

    var decor = {};
    doc.querySelectorAll("style[data-cs-decor]").forEach(function (s) { decor[s.getAttribute("data-cs-decor")] = s.textContent || ""; });
    (readBlock(doc, "cs-presets") || []).forEach(function (p) { registerPreset(p, decor[p.id] || ""); });
    (readBlock(doc, "cs-occasions") || []).forEach(registerOccasion);
    registerArchetypes(doc);

    return {
      spec: readBlock(doc, "cs-spec"), brand: readBlock(doc, "cs-brand"), plan: readBlock(doc, "cs-plan"),
      ideas: readBlock(doc, "cs-ideas") || [], posts: readBlock(doc, "cs-posts") || [],
      config: readBlock(doc, "cs-config") || defaultConfig()
    };
  }

  core.registry = {
    loadPage: loadPage, readBlock: readBlock, defaultConfig: defaultConfig,
    registerPreset: registerPreset, getPreset: getPreset, hasPreset: hasPreset, listPresets: listPresets,
    registerOccasion: registerOccasion, getOccasion: getOccasion, listOccasions: listOccasions,
    registerFonts: registerFonts, fontCss: fontCss, fontHas: fontHas, missingGlyphs: missingGlyphs, hasFont: hasFont, fontEntry: fontEntry, fontIds: fontIds,
    registerArchetypes: registerArchetypes, getArchetype: getArchetype,
    registerRules: registerRules, rules: rules,
    archetypeCss: archetypeCss, decorCss: decorCss, decorLocal: decorLocal,
    presetRoles: presetRoles, geometry: geometry
  };
})();
