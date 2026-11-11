/* core/spec.js · pure helpers on spec.json (CONTRACT 4.3.2). */
(function () {
  var core = (CS.core = CS.core || {});

  var HARD_MAX = 10;
  var SENTENCE_END = /[.!?\u061F\u2026]/;
  var WS_CHAR = /[ \t\n\r\f\v\u00A0\u202F]/;

  function usage(message, detail) { return new CS.CSError("E_USAGE", message, detail); }
  function T() { return core.text; }
  function pad2(n) { return (n < 10 ? "0" : "") + n; }
  function hasOwn(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }

  function indexOf(spec, id) {
    var i = (spec.slides || []).findIndex(function (s) { return s.id === id; });
    if (i < 0) throw usage("There is no slide " + id + " in this spec.", { id: id });
    return i;
  }

  function withSlides(spec, slides) { return Object.assign({}, spec, { slides: slides }); }

  function editSlide(spec, id, fn) {
    var i = indexOf(spec, id), slides = spec.slides.slice();
    slides[i] = fn(Object.assign({}, slides[i]));
    return withSlides(spec, slides);
  }

  /* ---- fields ----------------------------------------------------------------------------------------------- */

  /** Sets a slide property or dotted field, optionally at an array index. */
  function setField(spec, slideId, field, value, index) {
    return editSlide(spec, slideId, function (s) {
      var parts = String(field).split("."), head = parts[0], sub = parts[1], hasIndex = index !== undefined && index !== null;
      if (head === "bullets") {
        if (!hasIndex) { if (Array.isArray(value)) s.bullets = value.slice(); else if (value == null) delete s.bullets; return s; }
        var arr = (s.bullets || []).slice();
        if (value === null || value === undefined) arr.splice(index, 1); else arr[index] = String(value);
        if (arr.length) s.bullets = arr; else delete s.bullets;
        return s;
      }
      if (head === "sides") {
        if (!hasIndex) { if (Array.isArray(value)) s.sides = value.map(function (x) { return Object.assign({}, x); }); else if (value == null) delete s.sides; return s; }
        var sides = (s.sides || [{ text: "" }, { text: "" }]).map(function (x) { return Object.assign({}, x); });
        var prop = sub === "label" ? "label" : "text";
        sides[index] = Object.assign({ text: "" }, sides[index]);
        if (prop === "label" && (value === "" || value == null)) delete sides[index].label; else sides[index][prop] = value == null ? "" : String(value);
        s.sides = sides;
        return s;
      }
      if (head === "number" || head === "cta" || head === "media") {
        if (value && typeof value === "object" && !sub) { s[head] = Object.assign({}, value); return s; }
        if (value === null && !sub) { delete s[head]; return s; }
        var key = sub || (head === "number" ? "value" : head === "cta" ? "text" : "slot");
        var obj = Object.assign({}, s[head]);
        if ((value === "" || value == null) && (key === "unit" || key === "sourceId" || key === "assetId")) delete obj[key]; else obj[key] = head === "number" ? String(value) : value;
        s[head] = obj;
        return s;
      }
      if (value === null || value === undefined) delete s[head]; else s[head] = value;
      return s;
    });
  }

  /* ---- structure --------------------------------------------------------------------------------------------- */

  /** n = position; ord = running count per type for item and step slides. Ids are untouched. */
  function renumber(spec) {
    var counts = {}, changed = false;
    var slides = (spec.slides || []).map(function (s, i) {
      var next = s, n = i + 1;
      counts[s.type] = (counts[s.type] || 0) + 1;
      var wantOrd = s.type === "item" || s.type === "step" ? counts[s.type] : s.ord;
      if (s.n !== n || s.ord !== wantOrd) {
        next = Object.assign({}, s, { n: n });
        if (wantOrd === undefined) delete next.ord; else next.ord = wantOrd;
        changed = true;
      }
      return next;
    });
    return changed ? withSlides(spec, slides) : spec;
  }

  function idHighWater(spec) {
    var max = (spec.ext && spec.ext.cs && spec.ext.cs.slideIdMax) || 0;
    (spec.slides || []).forEach(function (s) { var n = parseInt(String(s.id).slice(1), 10); if (n > max) max = n; });
    return max;
  }

  function stampIds(spec, max) {
    var ext = Object.assign({}, spec.ext), cs = Object.assign({}, ext.cs);
    cs.slideIdMax = Math.max(cs.slideIdMax || 0, max);
    ext.cs = cs;
    return Object.assign({}, spec, { ext: ext });
  }

  /** s01..s99, never reusing an id that was ever used in this spec while a fresh one exists. */
  function nextId(spec) {
    var used = {};
    (spec.slides || []).forEach(function (s) { used[s.id] = true; });
    var cand = idHighWater(spec) + 1;
    if (cand <= 99) return "s" + pad2(cand);
    for (var i = 1; i <= 99; i++) { if (!used["s" + pad2(i)]) return "s" + pad2(i); }
    throw usage("No free slide id is left.");
  }

  function insertSlide(spec, type, at, init) {
    var slides = (spec.slides || []).slice();
    if (slides.length >= HARD_MAX) throw usage("A carousel has at most " + HARD_MAX + " slides, including the cover.", { max: HARD_MAX });
    if (core.constants.SLIDE_TYPES.indexOf(type) < 0) throw usage("Unknown slide type \"" + type + "\".", { type: type });
    var id = nextId(spec), pos = Math.max(0, Math.min(slides.length, at === undefined || at === null ? slides.length : at | 0));
    var fresh = Object.assign({}, init || {}, { id: id, n: pos + 1, type: type });
    slides.splice(pos, 0, fresh);
    return renumber(stampIds(withSlides(spec, slides), parseInt(id.slice(1), 10)));
  }

  function removeSlide(spec, slideId) {
    var i = indexOf(spec, slideId), slides = spec.slides.slice();
    var stamped = stampIds(spec, idHighWater(spec));
    slides.splice(i, 1);
    return renumber(withSlides(stamped, slides));
  }

  function moveSlide(spec, slideId, to) {
    var i = indexOf(spec, slideId), slides = spec.slides.slice(), dest = Math.max(0, Math.min(slides.length - 1, to | 0));
    if (dest === i) return spec;
    var moved = slides.splice(i, 1)[0];
    slides.splice(dest, 0, moved);
    return renumber(withSlides(spec, slides));
  }

  /** Finds a sentence split near halfway with at least a quarter of the words on each side. */
  function splitPoint(text) {
    var total = T().wordCount(text);
    if (total < 2) return -1;
    var tiers = [[], [], []], i, quarter = Math.max(1, Math.floor(total / 4));
    function mark(idx, tier) {
      var before = text.slice(0, idx), spans = (before.match(/==/g) || []).length;
      if (spans % 2 !== 0 || !before.trim() || !text.slice(idx).trim()) return;
      var w = T().wordCount(before);
      if (tier < 2 && (w < quarter || total - w < quarter)) return;
      tiers[tier].push({ idx: idx, words: w });
    }
    for (i = 0; i < text.length; i++) {
      var c = text.charAt(i), next = text.charAt(i + 1);
      if (SENTENCE_END.test(c) && (next === "" || WS_CHAR.test(next))) mark(i + 1, 0);
      else if ((c === "\u060C" || c === "," || c === "\u061B" || c === ";") && WS_CHAR.test(next)) mark(i + 1, 1);
      else if (WS_CHAR.test(c) && next && !WS_CHAR.test(next)) mark(i, 2);
    }
    var half = total / 2;
    for (var t = 0; t < 3; t++) {
      if (!tiers[t].length) continue;
      tiers[t].sort(function (x, y) { return Math.abs(x.words - half) - Math.abs(y.words - half); });
      return tiers[t][0].idx;
    }
    return -1;
  }

  /** «قسّمها لسلايدين»: bullets or the body are halved; the second slide has a fresh id, keeps the title, and takes the bridge, the CTA and the closing media. */
  function splitSlide(spec, slideId) {
    var i = indexOf(spec, slideId), slides = spec.slides.slice();
    if (slides.length >= HARD_MAX) throw usage("A carousel has at most " + HARD_MAX + " slides, including the cover.", { max: HARD_MAX });
    var s = slides[i], a = Object.assign({}, s), b = Object.assign({}, s), id = nextId(spec);
    if (Array.isArray(s.bullets) && s.bullets.length >= 2) {
      var half = Math.ceil(s.bullets.length / 2);
      a.bullets = s.bullets.slice(0, half);
      b.bullets = s.bullets.slice(half);
    } else if (typeof s.body === "string" && splitPoint(s.body) > 0) {
      var cut = splitPoint(s.body);
      a.body = s.body.slice(0, cut).trim();
      b.body = s.body.slice(cut).trim();
    } else throw usage("Slide " + slideId + " has no body or list that can be split.", { id: slideId });
    b.id = id;
    delete a.bridge;
    ["ord", "kashidaWord", "sourceIds", "media", "number", "notes", "variant", "overrides"].forEach(function (k) { delete b[k]; });
    if (s.variant) b.variant = s.variant;
    if (s.overrides) b.overrides = Object.assign({}, s.overrides);
    delete a.cta;
    slides[i] = a;
    slides.splice(i + 1, 0, b);
    return renumber(stampIds(withSlides(spec, slides), parseInt(id.slice(1), 10)));
  }

  /* ---- derived text --------------------------------------------------------------------------------------------- */

  /** [firstLine + "\n" + keywordLine, body, cta, hashtags] without the empty parts, separated by a blank line. */
  function assembleCaption(spec) {
    var c = spec.captionPack || {}, head = [c.firstLine, c.keywordLine].filter(Boolean).join("\n");
    return [head, c.body, c.cta, (c.hashtags || []).join(" ")].filter(function (x) { return x && String(x).trim(); }).join("\n\n");
  }

  function wordCounts(slide) {
    var wc = function (s) { return typeof s === "string" && s ? T().wordCount(s) : 0; };
    var bullets = (slide.bullets || []).map(wc);
    var total = wc(slide.kicker) + wc(slide.headline) + wc(slide.sub) + wc(slide.title) + wc(slide.body) + wc(slide.attribution) + wc(slide.bridge);
    bullets.forEach(function (n) { total += n; });
    (slide.sides || []).forEach(function (x) { total += wc(x && x.label) + wc(x && x.text); });
    if (slide.cta) total += wc(slide.cta.text);
    if (slide.number) total += wc(slide.number.value) + wc(slide.number.unit);
    if (T().visualFields) T().visualFields(slide).forEach(function (f) { total += wc(f[1]); });
    return { hero: wc(slide.headline), title: wc(slide.title), body: wc(slide.body), total: total, bullets: bullets };
  }

  /* ---- new and changed specs ----------------------------------------------------------------------------------- */

  function merge(base, over) {
    if (!over) return base;
    var out = Array.isArray(base) ? base.slice() : Object.assign({}, base);
    Object.keys(over).forEach(function (k) {
      var v = over[k];
      out[k] = v && typeof v === "object" && !Array.isArray(v) && out[k] && typeof out[k] === "object" && !Array.isArray(out[k]) ? merge(out[k], v) : v;
    });
    return out;
  }

  function stamp() { return new Date().toISOString().replace(/\.\d+Z$/, "Z"); }

  /** A valid stub at checkpoint "angle": no slides yet, the brand's locale and look. */
  function blank(brand, init) {
    var now = stamp(), loc = (brand && brand.locale) || {}, vis = (brand && brand.visual) || {};
    var C = core.constants.CANVAS, S = core.constants.SAFE, presetId = vis.presetId || core.DEFAULT_PRESET, version = "1.0";
    if (core.registry.hasPreset(presetId)) version = core.registry.getPreset(presetId).version;
    var spec = {
      specVersion: 1,
      id: "post-" + now.slice(0, 10).replace(/-/g, "") + "-" + Math.floor(Math.random() * 0x10000).toString(16).padStart(4, "0"),
      rev: 1,
      brand: { slug: (brand && brand.slug) || "brand" },
      format: "carousel", mode: "guided", checkpoint: "angle",
      canvas: { preset: "ig-3x4", w: C.w, h: C.h, safe: [S.x, S.y, S.w, S.h], exports: ["3x4", "4x5"] },
      locale: {
        dialect: loc.dialect || "eg", register: loc.register || "dialect", digits: loc.digits || "western",
        appLanguage: loc.appLanguage || "ar", swipeCue: loc.swipeCue || "arrow-rtl"
      },
      style: { presetId: presetId + "@" + version },
      slides: [],
      meta: { createdAt: now, updatedAt: now, updatedBy: "tool" }
    };
    if (brand && core.canon) spec.brand.snapshotHash = core.canon.hash(core.canon.brandSnapshot(brand));
    return init ? merge(spec, init) : spec;
  }

  /** rev + 1 and who wrote it. */
  function bump(spec, by) {
    var meta = Object.assign({}, spec.meta, { updatedAt: stamp(), updatedBy: by });
    return Object.assign({}, spec, { rev: (spec.rev || 0) + 1, meta: meta });
  }

  /** Light check: schema validation (when a validator is registered) plus the structural promises helpers rely on. */
  function validate(spec) {
    var res = { ok: true, errors: [], structure: [] };
    if (core.schema && typeof core.schema.validate === "function") {
      try { var r = core.schema.validate("spec", spec); res.errors = r.errors || []; } catch (e) { /* schema not registered: structure checks still run */ }
    }
    var seen = {};
    (spec && Array.isArray(spec.slides) ? spec.slides : []).forEach(function (s, i) {
      if (seen[s.id]) res.structure.push({ path: "/slides/" + i + "/id", message: "duplicate slide id " + s.id });
      seen[s.id] = true;
      if (s.n !== i + 1) res.structure.push({ path: "/slides/" + i + "/n", message: "n must equal the position (" + (i + 1) + ")" });
    });
    if (spec && Array.isArray(spec.slides) && spec.slides.length > HARD_MAX) res.structure.push({ path: "/slides", message: "more than " + HARD_MAX + " slides" });
    res.ok = !res.errors.length && !res.structure.length;
    return res;
  }

  core.spec = {
    setField: setField, insertSlide: insertSlide, removeSlide: removeSlide, moveSlide: moveSlide, splitSlide: splitSlide,
    renumber: renumber, assembleCaption: assembleCaption, wordCounts: wordCounts, blank: blank, bump: bump, validate: validate
  };
})();
