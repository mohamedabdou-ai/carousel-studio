/* core/freeze.js · deterministic layouts (CONTRACT 3.2 and 4.3.2). */
(function () {
  var core = (CS.core = CS.core || {});

  var KEY_RE = /^(s[0-9]{2})\.([a-z0-9-]+)(?:\.([0-9]+))?$/;

  /** Post-level tokens + the per-slide inputs that can change a slide's tokens (variant, overrides): section 3.2. */
  function tokensHash(tokens, spec) {
    var slides = ((spec && spec.slides) || []).map(function (s) { return [s.id, s.variant || null, core.canon.hash(s.overrides || {}), core.canon.hash([s.visual || null, s.items || null, s.demo || null].concat(s.free ? [s.free] : []))]; });
    return core.canon.hash({ post: core.canon.hashable(tokens), slides: slides });
  }

  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

  var visualState = Object.create(null);
  function copy(v) { return v == null ? v : JSON.parse(JSON.stringify(v)); }
  var visual = {
    get: function (id, frozen) {
      var v = frozen && frozen.visual;
      return copy(frozen ? { marks: v && v.marks && v.marks[id], anchor: v && v.anchors && v.anchors[id] } : visualState[id] || {});
    },
    // Start a composition with set(id, null); anchorSync and settle then merge their results.
    set: function (id, value) { visualState[id] = value ? Object.assign({}, visualState[id], copy(value)) : {}; }
  };

  /** What the approved layout looks like: {engine, tokensHash, lines, sizes, approvedAt}. `slides` are rendered slides (export mode). */
  function capture(slides, spec, tokens) {
    var frozen = { engine: CS.version, tokensHash: tokensHash(tokens, spec), lines: {}, sizes: {}, approvedAt: new Date().toISOString() };
    slides.forEach(function (r) {
      var id = r.id || r.el.getAttribute("data-cs-slide"), v = visual.get(id);
      if (v.marks || v.anchor) {
        frozen.visual = frozen.visual || { marks: {}, anchors: {} };
        if (v.marks) frozen.visual.marks[id] = v.marks.slice(0, 8);
        if (v.anchor) frozen.visual.anchors[id] = { w: v.anchor.w, h: v.anchor.h };
      }
      core.compose.slots(r.el).forEach(function (s) {
        var px = parseFloat(s.el.style.fontSize);
        if (px > 0 && s.el.getAttribute("data-fit") !== "css") frozen.sizes[s.key] = clamp(Math.round(px), 12, 640);
        if (s.el.querySelector(".w")) {
          var text = core.fit.measureLines(s.el).text;
          if (text.length && text.length <= 12 && text.every(function (t) { return t.length <= 400; })) frozen.lines[s.key] = text;
        }
      });
    });
    return frozen;
  }

  /** Sets the frozen sizes and rebuilds the frozen lines as .cs-ln blocks. A slot whose words no longer match its frozen lines keeps its natural flow. */
  function apply(slideEl, frozen) {
    if (!frozen) return;
    var id = slideEl.getAttribute("data-cs-slide");
    visual.set(id, null); visual.set(id, visual.get(id, frozen));
    var slots = core.compose.slots(slideEl);
    slots.forEach(function (s) {
      var px = frozen.sizes && frozen.sizes[s.key];
      if (px) s.el.style.fontSize = px + "px";
    });
    slots.forEach(function (s) {
      var lines = frozen.lines && frozen.lines[s.key];
      if (!lines || !lines.length) return;
      var counts = lines.map(function (l) { return l.split(/[ \u00A0]+/).filter(Boolean).length; });
      core.fit.wrapLinesBy(s.el, counts);
    });
  }

  function fontsDeclared(ids) {
    if (!document.fonts || typeof document.fonts.forEach !== "function") return true;
    var have = {};
    document.fonts.forEach(function (face) { if (face.status !== "error") have[String(face.family).replace(/^["']|["']$/g, "").toLowerCase()] = true; });
    return ids.every(function (id) { var f = core.registry.fontCss(id); return f && have[f.toLowerCase()]; });
  }

  function expectedText(spec, key) {
    if (/\.art\./.test(key) && CS.visual && typeof CS.visual.expected === "function") {
      var extra;
      try { extra = CS.visual.expected(spec, key); } catch (e) { extra = null; }
      if (extra != null) return extra;
    }
    var id = key.split(".")[0], s = (spec.slides || []).filter(function (v) { return v.id === id; })[0];
    if (CS.visual?.free?.active(s)) return CS.visual.free.expected(s,key);
    if (s && core.text.visualFields) {
      var fields = core.text.visualFields(s), suffix = key.slice(id.length + 1);
      for (var n = 0; n < fields.length; n++) if (fields[n][0] === suffix) return fields[n][1];
    }
    var m = KEY_RE.exec(key);
    if (!m) return null;
    var slide = (spec.slides || []).filter(function (s) { return s.id === m[1]; })[0];
    if (!slide) return null;
    var field = m[2], i = m[3] === undefined ? null : parseInt(m[3], 10), v;
    if (field === "bullets") v = (slide.bullets || [])[i];
    else if (field === "sides") v = ((slide.sides || [])[i] || {}).text;
    else if (field === "cta") v = slide.cta && slide.cta.text;
    else v = slide[field];
    return typeof v === "string" ? v : null;
  }

  /** Does the frozen layout still describe this spec and these tokens? `reasons` lists what changed. */
  function verify(spec, tokens) {
    var f = spec && spec.frozen, reasons = [];
    if (!f) return { ok: false, reasons: reasons };
    if (f.engine !== CS.version) reasons.push("engine");
    if (f.tokensHash !== tokensHash(tokens, spec)) reasons.push("tokens");
    if (!fontsDeclared(tokens.fonts || [])) reasons.push("fonts");
    var T = core.text, stale = false;
    Object.keys(f.lines || {}).some(function (key) {
      var want = expectedText(spec, key);
      if (want === null || T.skeleton(f.lines[key].join(" ")) !== T.skeleton(T.stripMarkup(want))) { stale = true; return true; }
      return false;
    });
    if (stale) reasons.push("text");
    return { ok: reasons.length === 0, reasons: reasons };
  }

  core.freeze = { capture: capture, apply: apply, verify: verify, tokensHash: tokensHash, expectedText: expectedText, visual: visual };
})();
