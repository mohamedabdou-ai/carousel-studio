/* Test double of the engine chunks (cs-core, cs-qa, cs-paint, cs-motion, cs-export) for exercising cs-ui.js and cs-brandbook.js.
 *
 * It implements just enough of CONTRACT 4.3-4.7 to drive the Studio in a browser: real archetype templates and real preset CSS are used,
 * so slides look close to the real engine, but there is no fitting, no real painter and no real encoder. Never shipped. */
(function () {
  "use strict";
  var CS = (window.CS = window.CS || {});
  CS.version = "cs-1.1.0";

  function CSError(code, message, detail) { var e = new Error(message || code); e.name = "CSError"; e.code = code; e.detail = detail; return e; }
  CSError.prototype = Object.create(Error.prototype);
  CS.CSError = CSError;

  var listeners = {};
  CS.on = function (type, fn) { (listeners[type] = listeners[type] || []).push(fn); return function () { listeners[type] = listeners[type].filter(function (f) { return f !== fn; }); }; };
  CS.emit = function (type, detail) { (listeners[type] || []).slice().forEach(function (fn) { fn(detail); }); document.dispatchEvent(new CustomEvent(type, { detail: detail })); };
  CS.util = { isTouch: function () { return /touch=1/.test(location.search); }, isWebKit: function () { return false; } };

  function block(id) { var n = document.getElementById(id); return n ? JSON.parse(n.textContent) : null; }
  function clone(v) { return v === undefined ? v : JSON.parse(JSON.stringify(v)); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  /* ---- colour ---------------------------------------------------------------------------------------------------- */
  function rgb(h) { h = h.replace("#", ""); return [0, 2, 4].map(function (i) { return parseInt(h.substr(i, 2), 16); }); }
  function hex(c) { return "#" + c.map(function (v) { return Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0"); }).join("").toUpperCase(); }
  function mix(a, b, t) { var x = rgb(a), y = rgb(b); return hex(x.map(function (v, i) { return v + (y[i] - v) * t; })); }
  function lum(h) { var c = rgb(h).map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; }
  function contrast(a, b) { var x = lum(a), y = lum(b); if (x < y) { var t = x; x = y; y = t; } return (x + 0.05) / (y + 0.05); }
  function onColor(bg) { return contrast("#111111", bg) >= contrast("#FFFFFF", bg) ? "#111111" : "#FFFFFF"; }

  /* ---- text ------------------------------------------------------------------------------------------------------ */
  var T = {};
  T.stripMarkup = function (s) { return String(s || "").replace(/==/g, "").replace(/\n/g, " "); };
  T.wordCount = function (s) { return T.stripMarkup(s).split(/[ \t\n\r ]+/).filter(function (w) { return /[\p{L}\p{N}]/u.test(w); }).length; };
  T.hasArabic = function (s) { return /[؀-ۿ]/.test(s); };
  T.digits = {
    convert: function (s, to) {
      var toIndic = function (d) { return String.fromCharCode(0x660 + +d); };
      var toWest = function (d) { return String(d.charCodeAt(0) - 0x660); };
      return to === "arabic-indic" ? String(s).replace(/[0-9]/g, toIndic) : String(s).replace(/[٠-٩]/g, toWest);
    },
    counter: function (i, n, to, lang) { return T.digits.convert(lang === "en" ? i + "/" + n : i + " من " + n, to); },
    detect: function (s) { var w = /[0-9]/.test(s), a = /[٠-٩]/.test(s); return w && a ? "mixed" : w ? "western" : a ? "arabic-indic" : "none"; }
  };
  T.toHTML = function (s, o) {
    o = o || {};
    var out = [], idx = o.indexBase || 0, inEm = false;
    var lines = String(s || "").split("\n");
    lines.forEach(function (line, li) {
      if (li) out.push("<br>");
      var words = line.split(/ +/).filter(Boolean);
      words.forEach(function (w, wi) {
        var open = false, close = false;
        if (/^==/.test(w) && !inEm) { open = true; inEm = true; w = w.replace(/^==/, ""); }
        if (/==$/.test(w) && inEm) { close = true; w = w.replace(/==$/, ""); }
        var esc = w.replace(/&/g, "&amp;").replace(/</g, "&lt;");
        if (/[A-Za-z0-9]/.test(w)) esc = esc.replace(/([A-Za-z0-9][A-Za-z0-9._\-+\/%$]*)/g, '<bdi dir="ltr" class="cs-ltr" data-run="latin">$1</bdi>');
        if (o.digits) esc = T.digits.convert(esc, o.digits);
        var html = '<span class="w" data-w="' + (idx++) + '">' + esc + "</span>";
        if (open) html = '<mark class="cs-em" data-m="em">' + html;
        if (close || (inEm && wi === words.length - 1 && li === lines.length - 1)) { html += "</mark>"; inEm = false; }
        out.push(html + (wi < words.length - 1 ? " " : ""));
      });
    });
    return out.join("");
  };
  function format(tpl, p) { return String(tpl).replace(/\{([A-Za-z0-9_]+)\}/g, function (m, k) { return p && p[k] !== undefined ? p[k] : m; }); }

  /* ---- registry ---------------------------------------------------------------------------------------------------- */
  var R = { presets: [], fonts: null, rulesBundle: null };
  R.getPreset = function (id) { return R.presets.filter(function (p) { return p.id === id; })[0] || null; };
  R.listPresets = function () { return R.presets.slice(); };
  R.listOccasions = function () { return []; };
  R.rules = function () { return R.rulesBundle; };
  R.fontCss = function (id) { var f = R.fonts && R.fonts.registry.families.filter(function (x) { return x.id === id; })[0]; return f ? f.family : null; };
  R.fontIds = function () { return R.fonts ? R.fonts.registry.families.map(function (x) { return x.id; }) : []; };
  R.fontEntry = function (id) { return (R.fonts && R.fonts.registry.families.filter(function (x) { return x.id === id; })[0]) || null; };
  R.getArchetype = function (type) { return document.querySelector('template[data-archetype="' + type + '"]'); };

  /* ---- tokens -------------------------------------------------------------------------------------------------------- */
  function resolvePost(spec, brand) {
    var preset = R.getPreset(String(spec.style.presetId).split("@")[0]) || R.presets[0];
    var roles = Object.assign({}, preset.roles);
    var pal = brand && brand.visual && brand.visual.palette;
    if (pal) ["bg", "ink", "accent", "inkMuted"].forEach(function (k) { if (pal[k] && (preset.brandBindings || []).indexOf(k) >= 0) roles[k] = pal[k]; });
    var ov = spec.style.overrides || {};
    Object.keys(ov).forEach(function (k) { if (k.indexOf("roles.") === 0) roles[k.slice(6)] = ov[k]; });
    roles.surface = roles.surface || mix(roles.bg, roles.ink, 0.04);
    roles.accent2 = roles.accent2 || roles.accent;
    var adjustments = [];
    if (contrast(roles.ink, roles.bg) < 4.5) { adjustments.push({ path: "roles.ink", from: roles.ink, to: "#111111", reason: "contrast", msg: { ar: "غيّرنا لون الحبر لأن التباين كان ضعيفاً.", en: "Ink was adjusted because the contrast was too low." } }); roles.ink = "#111111"; }
    var t = preset.type, sc = t.scale;
    var fam = function (id) { var f = R.fontCss(id); return f ? '"' + f + '"' : "sans-serif"; };
    var css = {
      "--cs-bg": roles.bg, "--cs-surface": roles.surface, "--cs-ink": roles.ink, "--cs-ink-muted": roles.inkMuted, "--cs-accent": roles.accent, "--cs-accent-2": roles.accent2,
      "--cs-on-accent": onColor(roles.accent), "--cs-line": mix(roles.ink, roles.bg, 0.82), "--cs-scrim-from": mix(roles.bg, roles.ink, 0.55), "--cs-scrim-to": "rgba(0,0,0,0)", "--cs-bg-image": "none",
      "--cs-font-display": fam(t.display.family), "--cs-font-heading": fam(t.heading.family), "--cs-font-body": fam(t.body.family), "--cs-font-latin": fam(t.latin.family),
      "--cs-wght-display": t.display.wght, "--cs-wght-heading": t.heading.wght, "--cs-wght-body": t.body.wght, "--cs-wght-latin": t.latin.wght,
      "--cs-lh-display": t.display.lh, "--cs-lh-heading": t.heading.lh, "--cs-lh-body": t.body.lh,
      "--cs-fs-hero": sc.heroTarget + "px", "--cs-fs-h1": sc.h1 + "px", "--cs-fs-h2": sc.h2 + "px", "--cs-fs-title": sc.title[1] + "px", "--cs-fs-body": sc.body[0] + "px", "--cs-fs-small": sc.small + "px", "--cs-fs-micro": sc.micro + "px",
      "--cs-text-align": preset.layout.align, "--cs-cover-justify": preset.layout.align === "center" ? "center" : "flex-start", "--cs-headline-w-min": "65%", "--cs-headline-w-max": "85%",
      "--cs-w": "1080px", "--cs-h": "1440px", "--cs-pad-x": "98px", "--cs-pad-top": "110px", "--cs-pad-bottom": "110px", "--cs-header-h": "80px", "--cs-footer-h": "80px", "--cs-footer-item-h": "49px",
      "--cs-body-top": "206px", "--cs-body-h": "1028px", "--cs-gap": "16px", "--cs-unit": "8px", "--cs-col": "59px", "--cs-gutter": "16px"
    };
    return { presetId: preset.id, presetVersion: preset.version, occasionId: null, digits: spec.locale.digits, dialect: spec.locale.dialect, roles: roles, derived: {},
      type: t, layout: preset.layout, decor: preset.decor, chrome: preset.chrome, variants: preset.variants, motion: preset.motion, floors: preset.floors, css: css, provenance: {}, adjustments: adjustments, hash: "stub" };
  }

  /* ---- compose + render ------------------------------------------------------------------------------------------ */
  var LOCALE = function () { return R.rulesBundle.locale; };
  function slotKey(id, slot, index) { return id + "." + slot + (index !== undefined && index !== null ? "." + index : ""); }

  function compose(spec, slide, tokens, brand, opts) {
    var el = document.createElement("section");
    var rtl = spec.locale.dialect !== "en";
    var total = spec.slides.length, last = slide.n === total;
    el.className = "cs-slide";
    el.setAttribute("dir", rtl ? "rtl" : "ltr");
    el.setAttribute("lang", rtl ? "ar" : "en");
    var attrs = { "data-cs-slide": slide.id, "data-n": slide.n, "data-total": total, "data-last": last ? 1 : 0, "data-type": slide.type, "data-variant": slide.variant || (tokens.variants[slide.type] || ["base"])[0],
      "data-preset": tokens.presetId, "data-dialect": spec.locale.dialect, "data-digits": spec.locale.digits, "data-swipe": spec.locale.swipeCue, "data-align": tokens.layout.align,
      "data-cover-anchor": tokens.layout.coverAnchor, "data-hl": tokens.decor.highlight, "data-numbering": tokens.decor.numbering, "data-kashida": "0", "data-bgkind": "solid" };
    Object.keys(attrs).forEach(function (k) { el.setAttribute(k, attrs[k]); });
    Object.keys(tokens.css).forEach(function (k) { el.style.setProperty(k, tokens.css[k]); });
    el.style.width = "1080px"; el.style.height = "1440px";
    var digits = spec.locale.digits;
    var strings = LOCALE();
    var bg = document.createElement("div"); bg.className = "cs-bg"; bg.setAttribute("data-layer", "bg"); bg.setAttribute("aria-hidden", "true");
    var decor = document.createElement("div"); decor.className = "cs-decor"; decor.setAttribute("data-layer", "decor"); decor.setAttribute("aria-hidden", "true");
    var header = document.createElement("header"); header.className = "cs-header";
    var handle = document.createElement("span"); handle.className = "cs-handle"; handle.setAttribute("data-pos", "start"); handle.innerHTML = '<bdi dir="ltr" class="cs-ltr">' + ((brand && brand.handle) || "@yourbrand") + "</bdi>";
    header.appendChild(handle);
    if (spec.style.metaLabel) { var meta = document.createElement("span"); meta.className = "cs-meta"; meta.setAttribute("data-pos", "end"); meta.textContent = spec.style.metaLabel; header.appendChild(meta); }
    var tpl = R.getArchetype(slide.type) || R.getArchetype("item");
    var main = tpl.content.firstElementChild.cloneNode(true);
    fill(main, slide, spec, tokens, opts, digits);
    var footer = document.createElement("footer"); footer.className = "cs-footer"; footer.setAttribute("data-swipe", spec.locale.swipeCue);
    var counter = document.createElement("span"); counter.className = "cs-counter"; counter.setAttribute("data-pos", "center");
    counter.textContent = slide.type === "poster" ? "" : T.digits.counter(slide.n, total, digits, rtl ? "ar" : "en");
    footer.appendChild(counter);
    if (!last && slide.type !== "poster" && spec.locale.swipeCue !== "neutral") {
      var sw = document.createElement("span"); sw.className = "cs-swipe"; sw.setAttribute("data-pos", "end");
      sw.textContent = strings.swipeCue.labels[spec.locale.swipeCue][spec.locale.dialect] || strings.swipeCue.labels[spec.locale.swipeCue]["msa-white"]; footer.appendChild(sw);
    }
    if ((tokens.chrome.savePill.showOn || []).indexOf(slide.type) >= 0) {
      var sp = document.createElement("span"); sp.className = "cs-savepill"; sp.setAttribute("data-pos", "start"); sp.textContent = strings.slideStrings.savePill[spec.locale.dialect]; footer.appendChild(sp);
    }
    [bg, decor, header, main, footer].forEach(function (n) { el.appendChild(n); });
    return el;
  }

  function fill(main, slide, spec, tokens, opts, digits) {
    main.querySelectorAll("[data-slot]").forEach(function (node) {
      var field = node.getAttribute("data-field"), kind = node.getAttribute("data-kind"), optional = node.hasAttribute("data-optional");
      var v = slide[field];
      if (kind === "text") {
        if (!v && optional) { node.remove(); return; }
        node.innerHTML = T.toHTML(v || "", { digits: digits });
        if (!(opts && opts.mode === "edit")) node.removeAttribute("data-edit");
        else { node.setAttribute("contenteditable", "true"); }
      } else if (kind === "list") {
        (slide.bullets || []).forEach(function (b, i) {
          var li = document.createElement("li"); li.className = "cs-bullet"; li.setAttribute("data-m", "bullet"); li.setAttribute("data-m-i", i);
          li.innerHTML = T.toHTML(b, { digits: digits });
          if (opts && opts.mode === "edit") { li.setAttribute("data-edit", "text"); li.setAttribute("contenteditable", "true"); }
          node.appendChild(li);
        });
      } else if (kind === "sides") {
        (slide.sides || []).forEach(function (s, i) {
          var d = document.createElement("div"); d.className = "cs-side"; d.setAttribute("data-side", i); d.setAttribute("data-m", "side");
          var l = document.createElement("span"); l.className = "cs-side-label"; l.textContent = s.label || "";
          var p = document.createElement("p"); p.className = "cs-side-text"; p.innerHTML = T.toHTML(s.text, { digits: digits });
          if (opts && opts.mode === "edit") { p.setAttribute("data-edit", "text"); p.setAttribute("contenteditable", "true"); }
          d.appendChild(l); d.appendChild(p); node.appendChild(d);
        });
      } else if (kind === "number") {
        if (!v) { node.remove(); return; }
        node.innerHTML = '<bdi dir="ltr" class="cs-ltr cs-num" data-m="num" data-value="' + v.value + '">' + T.digits.convert(v.value, digits) + "</bdi>" + (v.unit ? '<span class="cs-unit" data-m="unit">' + v.unit + "</span>" : "");
      } else if (kind === "ord") {
        if (!slide.ord) { node.remove(); return; }
        node.textContent = T.digits.convert(String(slide.ord), digits);
      } else if (kind === "cta") {
        if (!slide.cta) { node.remove(); return; }
        node.innerHTML = '<span class="cs-cta-text">' + T.toHTML(slide.cta.text, { digits: digits }) + '</span><span class="cs-cta-icon" aria-hidden="true"></span>';
      } else if (kind === "media") {
        var a = slide.media && slide.media.assetId && opts && opts.assets ? opts.assets(slide.media.assetId) : null;
        if (!a) { node.remove(); return; }
        node.setAttribute("data-media-kind", slide.media.slot);
        node.innerHTML = '<img alt="" src="' + a.url + '">';
      }
    });
  }

  var stage = null;
  function getStage() {
    if (stage && stage.isConnected) return stage;
    stage = document.createElement("div");
    stage.setAttribute("data-cs-stage", "");
    stage.style.cssText = "position:fixed;left:-12000px;top:0;width:1080px;pointer-events:none;contain:layout paint";
    document.body.appendChild(stage);
    return stage;
  }

  function renderSlide(spec, brand, index, opts) {
    opts = opts || {};
    return document.fonts.ready.then(function () {
      var slide = spec.slides[index];
      var tokens = resolvePost(spec, brand);
      var el = compose(spec, slide, tokens, brand, opts);
      getStage().appendChild(el);
      var fit = { slideId: slide.id, ok: true, slots: {}, warnings: [] };
      el.querySelectorAll('[data-role="hero"],[data-role="h1"],[data-role="title"]').forEach(function (n) {
        var words = T.wordCount(n.textContent);
        if (words > 9) { fit.ok = false; fit.slots[slotKey(slide.id, n.getAttribute("data-slot"))] = { key: slotKey(slide.id, n.getAttribute("data-slot")), role: n.getAttribute("data-role"), status: "floor", fontPx: 60, lines: 4 }; }
      });
      CS.emit("cs:render", { slideId: slide.id, tokensHash: "stub" });
      return sleep(opts.mode === "thumb" ? 5 : 15).then(function () { return { id: slide.id, index: index, el: el, tokens: tokens, fit: fit }; });
    });
  }

  function renderDeck(spec, brand, opts) {
    var out = [];
    var p = Promise.resolve();
    spec.slides.forEach(function (s, i) { p = p.then(function () { return renderSlide(spec, brand, i, opts).then(function (r) { out.push(r); }); }); });
    return p.then(function () { return { tokens: resolvePost(spec, brand), slides: out, stage: getStage(), frozenOk: false, dispose: function () { out.forEach(function (r) { if (r.el.parentNode === getStage()) r.el.remove(); }); } }; });
  }

  /* ---- spec helpers ----------------------------------------------------------------------------------------------- */
  var S = {};
  S.setField = function (spec, id, field, value, index) {
    var n = clone(spec); var s = n.slides.filter(function (x) { return x.id === id; })[0];
    if (!s) return spec;
    if (field === "bullets" && index !== undefined) s.bullets[index] = value;
    else if (field === "sides" && index !== undefined) s.sides[index].text = value;
    else if (value === "" && ["kicker", "sub", "bridge", "attribution"].indexOf(field) >= 0) delete s[field]; else s[field] = value;
    return n;
  };
  S.renumber = function (spec) { var n = clone(spec); n.slides.forEach(function (s, i) { s.n = i + 1; }); return n; };
  S.insertSlide = function (spec, type, at, init) {
    var n = clone(spec); var used = n.slides.map(function (s) { return +s.id.slice(1); }); var next = Math.max.apply(null, used.concat([0])) + 1;
    var s = Object.assign({ id: "s" + String(next).padStart(2, "0"), n: at + 1, type: type }, init || {});
    if (type === "item" || type === "step") { s.title = s.title || "عنوان جديد"; s.body = s.body || "اكتب هنا الشرح."; }
    n.slides.splice(at, 0, s);
    return n;
  };
  S.removeSlide = function (spec, id) { var n = clone(spec); n.slides = n.slides.filter(function (s) { return s.id !== id; }); return n; };
  S.moveSlide = function (spec, id, to) { var n = clone(spec); var i = n.slides.findIndex(function (s) { return s.id === id; }); var s = n.slides.splice(i, 1)[0]; n.slides.splice(to, 0, s); return n; };
  S.splitSlide = function (spec, id) {
    var n = clone(spec); var i = n.slides.findIndex(function (s) { return s.id === id; }); var s = n.slides[i];
    var parts = String(s.body || "").split(/(?<=[.؟!])\s+/); if (parts.length < 2) return spec;
    var half = Math.ceil(parts.length / 2); s.body = parts.slice(0, half).join(" ");
    var used = n.slides.map(function (x) { return +x.id.slice(1); }); var copy = Object.assign({}, s, { id: "s" + String(Math.max.apply(null, used) + 1).padStart(2, "0"), body: parts.slice(half).join(" ") });
    n.slides.splice(i + 1, 0, copy); return n;
  };
  S.assembleCaption = function (spec) {
    var c = spec.captionPack || {};
    return [[c.firstLine, c.keywordLine].filter(Boolean).join("\n"), c.body, c.cta, (c.hashtags || []).join(" ")].filter(Boolean).join("\n\n");
  };
  S.bump = function (spec, by) { var n = clone(spec); n.rev += 1; n.meta = Object.assign({}, n.meta, { updatedAt: new Date().toISOString().replace(/\.\d+Z/, "Z"), updatedBy: by }); return n; };
  S.blank = function (brand, init) { return Object.assign({ specVersion: 1, id: "blank-0001", rev: 1, brand: { slug: (brand && brand.slug) || "demo" }, format: "carousel", mode: "fast", checkpoint: "angle", canvas: { preset: "ig-3x4", w: 1080, h: 1440, safe: [34, 45, 1012, 1350], exports: ["3x4"] }, locale: { dialect: (brand && brand.locale.dialect) || "eg", digits: "western", appLanguage: "ar", swipeCue: "arrow-rtl" }, style: { presetId: "swiss@1.0" }, slides: [] }, init || {}); };

  /* ---- patch ---------------------------------------------------------------------------------------------------------- */
  function ptr(path) { return path.split("/").slice(1).map(function (p) { return p.replace(/~1/g, "/").replace(/~0/g, "~"); }); }
  var P = {
    apply: function (doc, ops) {
      var d = clone(doc);
      ops.forEach(function (op) {
        var parts = ptr(op.path), last = parts.pop(), cur = d;
        parts.forEach(function (k) { cur = cur[k]; });
        if (op.op === "test") { var v = parts.length || last !== undefined ? cur[last] : cur; if (JSON.stringify(v) !== JSON.stringify(op.value)) throw new CSError("E_CONFLICT", "test failed " + op.path); }
        else if (op.op === "remove") { if (Array.isArray(cur)) cur.splice(+last, 1); else delete cur[last]; }
        else if (op.op === "add") { if (Array.isArray(cur)) cur.splice(last === "-" ? cur.length : +last, 0, op.value); else cur[last] = op.value; }
        else if (op.op === "replace") cur[last] = op.value;
      });
      return d;
    },
    diff: function (a, b, base) {
      base = base || ""; var ops = [];
      if (JSON.stringify(a) === JSON.stringify(b)) return ops;
      var isObj = function (x) { return x && typeof x === "object"; };
      if (!isObj(a) || !isObj(b) || Array.isArray(a) !== Array.isArray(b)) return [{ op: "replace", path: base, value: b }];
      if (Array.isArray(a)) {
        var n = Math.max(a.length, b.length);
        for (var i = 0; i < n; i++) {
          if (i >= a.length) ops.push({ op: "add", path: base + "/" + i, value: b[i] });
          else if (i >= b.length) { ops.push({ op: "remove", path: base + "/" + (a.length - 1 - (i - b.length)) }); }
          else ops = ops.concat(P.diff(a[i], b[i], base + "/" + i));
        }
        return ops;
      }
      Object.keys(b).forEach(function (k) { if (!(k in a)) ops.push({ op: "add", path: base + "/" + k, value: b[k] }); else ops = ops.concat(P.diff(a[k], b[k], base + "/" + k)); });
      Object.keys(a).forEach(function (k) { if (!(k in b)) ops.push({ op: "remove", path: base + "/" + k }); });
      return ops;
    },
    envelope: function (spec, ops) { return { carouselStudioPatch: 1, specId: spec.id, baseRev: spec.rev, patch: [{ op: "test", path: "/rev", value: spec.rev }].concat(ops) }; }
  };

  /* ---- freeze ------------------------------------------------------------------------------------------------------------ */
  var F = {
    capture: function (slides, spec) { var lines = {}, sizes = {}; slides.forEach(function (r) { sizes[r.id + ".title"] = 64; lines[r.id + ".title"] = ["x"]; }); return { engine: "cs-1.1.0", tokensHash: "0123456789abcdef", lines: lines, sizes: sizes, approvedAt: new Date().toISOString().replace(/\.\d+Z/, "Z") }; },
    verify: function (spec) { return { ok: !!spec.frozen, reasons: spec.frozen ? [] : ["tokens"] }; }
  };

  /* ---- core ----------------------------------------------------------------------------------------------------------------- */
  CS.core = {
    text: T, format: format, registry: R, patch: P, freeze: F, spec: S,
    schema: { validate: function () { return { ok: true, errors: [] }; } },
    color: { contrast: contrast, mix: mix, onColor: onColor },
    resolve: { post: resolvePost, explain: function (tokens, path) { return { path: path, value: tokens.roles.accent, layer: "preset", steps: ["Style default"], msg: { ar: "اللون جاي من الستايل الحالي.", en: "The colour comes from the current style." } }; } },
    compose: { slots: function (el) { return Array.prototype.map.call(el.querySelectorAll('[data-edit="text"]'), function (n) { var holder = n.closest("[data-field]"); var field = holder.getAttribute("data-field"); var index = null; var li = n.closest("[data-m-i]"); if (field === "bullets" && li) index = +li.getAttribute("data-m-i"); var side = n.closest("[data-side]"); if (side) index = +side.getAttribute("data-side"); return { key: slotKey(el.getAttribute("data-cs-slide"), field, index), slot: field, el: n, role: n.getAttribute("data-role"), field: field, index: index }; }); } },
    render: { slide: renderSlide, deck: renderDeck },
    constants: { CANVAS: { w: 1080, h: 1440 }, SAFE: { x: 34, y: 45, w: 1012, h: 1350 }, CROP_4X5: { x: 0, y: 45, w: 1080, h: 1350 }, CONTENT: { x: 98, y: 110, w: 884, h: 1220 },
      KEEP_OUTS: [{ id: "tl", x: 0, y: 0, w: 200, h: 110 }, { id: "tr", x: 880, y: 0, w: 200, h: 110 }, { id: "bl", x: 0, y: 1300, w: 140, h: 140 }, { id: "br", x: 940, y: 1300, w: 140, h: 140 }] },
    boot: function () {
      R.presets = block("cs-presets") || [];
      R.rulesBundle = block("cs-rules");
      R.fonts = block("cs-fonts-meta");
      var plan = block("cs-plan");
      var data = { spec: block("cs-spec"), brand: block("cs-brand"), plan: plan, ideas: block("cs-ideas") || (plan && plan.ideaBank) || [], posts: block("cs-posts") || [], config: block("cs-config") };
      CS.emit("cs:boot", { config: data.config });
      return document.fonts.ready.then(function () { return data; });
    }
  };

  /* ---- qa ------------------------------------------------------------------------------------------------------------------ */
  function msg(ar, en) { return { ar: ar, en: en }; }
  function finding(gate, rule, sev, slide, el, m, f) { return { gate: gate, rule: rule, sev: sev, slide: slide, el: el, msg: m, fix: f }; }
  function textResults(spec) {
    var out = [];
    var all = [];
    spec.slides.forEach(function (s) {
      var hero = s.type === "cover" || s.type === "poster" ? T.wordCount(s.headline) : 0;
      if (hero > 6) out.push(finding("C1", "C1.hero-words", "BLOCK", s.id, s.id + ".headline", msg("العنوان الرئيسي " + hero + " كلمات والحد 6.", "The cover hero has " + hero + " words; the limit is 6."), msg("اختصر العنوان إلى 6 كلمات أو أقل.", "Cut the headline to 6 words or fewer.")));
      if (s.title && T.wordCount(s.title) > 6) out.push(finding("C2", "C2.title-words", "FIX", s.id, s.id + ".title", msg("العنوان أطول من 6 كلمات.", "The title is over 6 words."), msg("اختصره.", "Shorten it.")));
      if (s.body && T.wordCount(s.body) > 25) out.push(finding("C2", "C2.body-words", "FIX", s.id, s.id + ".body", msg("الشرح أطول من 25 كلمة.", "The body is over 25 words."), msg("اختصره أو قسّمه.", "Shorten or split it.")));
      if (s.body && T.wordCount(s.body) > 35) out.push(finding("C2", "C2.body-hard", "BLOCK", s.id, s.id + ".body", msg("الشرح أطول من 35 كلمة.", "The body is over 35 words."), msg("قسّم السلايد.", "Split the slide.")));
      all.push(JSON.stringify([s.kicker, s.headline, s.sub, s.title, s.body, s.bullets, s.sides, s.cta]));
    });
    var joined = all.join(" ");
    if (/[0-9]/.test(joined) && /[٠-٩]/.test(joined)) out.push(finding("N1", "N1.mixed", "BLOCK", null, null, msg("في أكثر من نظام أرقام.", "More than one digit system is used."), msg("وحّد الأرقام.", "Use one digit system.")));
    var cp = spec.captionPack;
    if (cp && cp.alt && cp.alt.some(function (a) { return !a; })) out.push(finding("C9", "C9.alt-missing", "BLOCK", null, "caption.alt", msg("نص بديل ناقص لسلايد.", "Alt text is missing for a slide."), msg("اكتب نصاً بديلاً.", "Write alt text.")));
    var prior = (spec.qa && spec.qa.results || []).filter(function (r) { return r.overridden; });
    return out.map(function (r) { var o = prior.filter(function (p) { return p.rule === r.rule && p.slide === r.slide; })[0]; return o ? Object.assign({}, r, { overridden: o.overridden }) : r; });
  }
  CS.qa = {
    rules: function () { return R.rulesBundle.qaRules; },
    runText: function (input) { return textResults(input.spec); },
    run: function (input) {
      var res = textResults(input.spec);
      res.push(finding("T1", "T1.hero-px", "NOTE", input.spec.slides[0].id, null, msg("الغلاف يُقرأ على المصغّر.", "The cover reads at thumbnail size."), msg("لا شيء مطلوب.", "Nothing to do.")));
      return sleep(500).then(function () {
        var sum = CS.qa.summarize(res);
        return { schemaVersion: 1, specId: input.spec.id, rev: input.spec.rev, engine: "cs-1.1.0", createdAt: new Date().toISOString().replace(/\.\d+Z/, "Z"), checkpoint: input.spec.checkpoint, lane: "studio", status: sum.status, exitCode: sum.exitCode, counts: sum.counts, results: res, environment: { painter: "svg" } };
      });
    },
    summarize: function (results) { var c = { block: 0, fix: 0, note: 0 }; results.forEach(function (r) { if (r.overridden) return; c[r.sev.toLowerCase()]++; }); return { status: c.block ? "block" : c.fix ? "fix" : "pass", counts: c, exitCode: c.block ? 2 : c.fix ? 1 : 0 }; },
    autofix: function (spec, results) {
      var n = clone(spec), applied = [];
      results.filter(function (r) { return r.rule === "N1.mixed"; }).forEach(function (r) { n.slides.forEach(function (s) { ["headline", "title", "body", "sub"].forEach(function (k) { if (s[k]) s[k] = T.digits.convert(s[k], spec.locale.digits); }); }); applied.push(r); });
      return { spec: n, applied: applied, remaining: results.filter(function (r) { return applied.indexOf(r) < 0; }) };
    },
    override: function (spec, rule, o) {
      if (!/^(C1|C3|O1)\./.test(rule) && !/^C2\.(body-hard|title-words|body-words|bullets|dense-words|slide-words|cta-words|share-words)$/.test(rule)) throw new CSError("E_USAGE", "not overridable");
      var n = clone(spec); n.qa = n.qa || { status: "fix", results: [] };
      n.qa.results = (n.qa.results || []).concat([{ gate: rule.split(".")[0], rule: rule, sev: "BLOCK", slide: o.slide, msg: msg("تجاوز", "Overridden"), overridden: { reason: o.reason, at: o.at } }]);
      return n;
    },
    thumbnail: function () { return sleep(300).then(function () { return { heroPx: 17.2, pass: true, fix: false, localContrast: 9.4 }; }); },
    loopCheck: function () { return { ssim: 0.999, psnr: 58, ok: true }; },
    report: { toMarkdown: function () { return "# QA\n"; } }
  };

  /* ---- paint, motion ------------------------------------------------------------------------------------------------------- */
  CS.paint = {
    toCanvas: function (el, o) { var c = document.createElement("canvas"); var s = (o && o.scale) || 1; c.width = 1080 * s; c.height = 1440 * s; return Promise.resolve(c); },
    raster: function () { return Promise.resolve({ bytes: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), w: 1080, h: 1440, painter: "svg" }); }
  };
  var RECIPES = [["calm", "هادئة", "Calm", "calm"], ["counter", "عدّاد", "Counter", "calm"], ["highlight-sweep", "مسح التمييز", "Highlight sweep", "calm"], ["stamp", "ختم", "Stamp", "story"], ["reorder", "ترتيب", "Reorder", "story"], ["story", "قصة", "Story", "story"]];
  CS.motion = {
    list: function () { return RECIPES.map(function (r) { return { id: r[0], label: { ar: r[1], en: r[2] }, feel: r[3], ships: "1.0", topics: [], requires: [] }; }); },
    recommend: function (spec) { return { recipe: "counter", feel: "calm", why: { ar: "على الغلاف رقم، فالعدّاد يناسبه.", en: "The cover has a number, so the counter suits it." } }; },
    build: function (el, o) { var d = o.seconds || 6; return { v: 1, recipe: o.recipe, feel: o.feel || "calm", seed: 1, duration: d, fps: 30, frames: d * 30, tracks: [], counters: [] }; },
    mount: function (el, tl, o) {
      var words = Array.prototype.slice.call(el.querySelectorAll(".w"));
      var player = { duration: tl.duration, fps: 30, frames: tl.frames, time: 0, playing: false, loop: true };
      function apply(t) { player.time = t; words.forEach(function (w, i) { var a = Math.min(1, Math.max(0, (t - 0.8 - i * 0.12) / 0.4)); if (t < 0.4 || t > 5.6) a = 1; w.style.opacity = a; w.style.transform = "translateY(" + (1 - a) * 24 + "px)"; w.style.display = "inline-block"; }); if (player.onframe) player.onframe(t); }
      var last = 0;
      function tick(ts) { if (!player.playing) return; if (!last) last = ts; var t = player.time + (ts - last) / 1000; last = ts; if (t > tl.duration) t = 0; apply(t); requestAnimationFrame(tick); }
      player.seek = function (t) { apply(t); }; player.seekFrame = function (i) { apply(i / 30); };
      player.play = function () { if (player.playing) return; player.playing = true; last = 0; requestAnimationFrame(tick); };
      player.pause = function () { player.playing = false; }; player.toggle = function () { if (player.playing) player.pause(); else player.play(); };
      player.poster = function () { apply(0); }; player.destroy = function () { player.playing = false; };
      apply(0); if (!o || o.autoplay !== false) player.play();
      return player;
    }
  };

  /* ---- export ------------------------------------------------------------------------------------------------------------------ */
  function file(path, mime, size) { return { path: path, name: path.split("/").pop(), mime: mime, bytes: new Uint8Array(size || 16) }; }
  function progress(ctx, job, total, label) {
    var p = Promise.resolve();
    for (var i = 1; i <= total; i++) (function (k) { p = p.then(function () { if (ctx.signal && ctx.signal.aborted) throw new CSError("E_ABORTED"); return sleep(140).then(function () { if (ctx.onProgress) ctx.onProgress({ job: job, done: k, total: total, label: label }); }); }); })(i);
    return p;
  }
  CS.export = {
    DEPS: { mediabunny: { version: "1.61.0", url: "https://cdn.jsdelivr.net/npm/mediabunny@1.61.0/+esm" } },
    capabilities: function () { return Promise.resolve({ downloads: true, webShare: false, webShareFiles: false, videoEncoder: !/novideo=1/.test(location.search), h264: !/novideo=1/.test(location.search), painter: "svg", mediabunny: true }); },
    slides: function (spec, ctx, o) { return progress(ctx, "slides", 4, "slides").then(function () { return (o.only ? spec.slides.filter(function (s) { return o.only.indexOf(s.id) >= 0; }) : spec.slides).map(function (s, i) { return file("3x4/" + String(i + 1).padStart(2, "0") + ".png", "image/png", 2048); }); }); },
    cover: function (spec, ctx) { return progress(ctx, "cover", 8, "cover").then(function () { return file("3x4/01-cover.mp4", "video/mp4", 4096); }); },
    pdf: function (files) { return Promise.resolve(file("carousel.pdf", "application/pdf", 1024)); },
    text: { caption: function (s) { return file("caption.txt", "text/plain", 64); }, hashtags: function () { return file("hashtags.txt", "text/plain", 16); }, slideCaptions: function () { return file("slide-captions.txt", "text/plain", 64); }, alt: function () { return file("alt-text.txt", "text/plain", 64); },
      postingGuide: function (d) { var enc = new TextEncoder(); return { path: "posting-guide.md", name: "posting-guide.md", mime: "text/markdown", bytes: enc.encode("# دليل النشر\nأربع خطوات قبل ما تنشر.\n\n## 1. اختر الملفات بالترتيب\nابدأ بفيديو الغلاف ثم الصور.\n\n## 2. خلّي المقاس 3:4\nما تخلّيش Instagram يقص الصور.\n\n## 3. الصق الكابشن\nانسخ الكابشن من حزمة النشر.\n\n## 4. أضف النص البديل\nلكل سلايد نص بديل.\n\n- 3x4/01-cover.mp4\n- caption.txt\n") }; } },
    kit: function (spec, ctx, o) { return progress(ctx, "kit", 12, "kit").then(function () { return { files: [file("carousel-kit/caption.txt", "text/plain")], zip: file(spec.id + "-kit.zip", "application/zip", 65536), report: CS.qa.run({ spec: spec }).then(function (r) { return r; }), skipped: o.video === false ? [] : (/novideo=1/.test(location.search) ? [{ path: "3x4/01-cover.mp4", reason: "no H.264 encoder" }] : []) }; }).then(function (k) { return Promise.resolve(k.report).then(function (rep) { k.report = rep; return k; }); }); },
    save: function (files, o) {
      var list = Array.isArray(files) ? files : [files];
      return window.claude.use("downloads").then(function (dl) {
        var saved = [], declined = [], failed = [];
        var p = Promise.resolve();
        list.forEach(function (f) { p = p.then(function () { return dl.save({ filename: f.name, data: f.bytes }).then(function () { saved.push(f.name); }, function (e) { if (e && e.code === "declined") declined.push(f.name); else failed.push({ name: f.name, error: String(e && e.code) }); }); }); });
        return p.then(function () { return { mode: "downloads", saved: saved, declined: declined, failed: failed }; });
      });
    }
  };

  /* ---- mock capabilities (query: mock=noPublish,viewer,noDownloads,noSample,declineSave,conflict) ---------------------------------------- */
  var flags = (/mock=([a-zA-Z,]+)/.exec(location.search) || [, ""])[1].split(",");
  var has = function (f) { return flags.indexOf(f) >= 0; };
  window.__mockLog = [];
  var mocks = {
    downloads: has("noDownloads") ? null : { save: function (r) { window.__mockLog.push({ cap: "downloads.save", filename: r.filename, size: r.data && (r.data.length || r.data.size) }); return has("declineSave") ? Promise.reject({ code: "declined", message: "no" }) : Promise.resolve({ status: "saved" }); } },
    artifact: has("noPublish") ? null : { publish: function (html) { window.__mockLog.push({ cap: "artifact.publish", bytes: html.length, head: html.slice(0, 330) }); window.__lastPublished = html; return has("conflict") ? Promise.reject({ code: "conflict", message: "newer version" }) : Promise.resolve({ version: "v2" }); } },
    sample: has("noSample") ? null : Object.assign(function () { return Promise.resolve({ text: "", truncated: false }); }, { json: function (prompt) { window.__mockLog.push({ cap: "sample.json", prompt: prompt.slice(0, 200) }); var keys = ((/<slide>: ([a-zA-Z, ]+)\./.exec(prompt) || [, "title"])[1]).split(/, */);
        return sleep(900).then(function () { return [1, 2, 3].map(function (n) { var o = {}; keys.forEach(function (k) { o[k] = k === "bullets" ? ["نقطة بديلة " + n, "نقطة ثانية " + n] : k === "sides" ? [{ label: "أ", text: "جانب أول " + n }, { label: "ب", text: "جانب ثان " + n }] : k === "cta" ? { text: "احفظ الآن " + n } : "صياغة بديلة رقم " + n; }); return o; }); }); }, limits: function () { return Promise.resolve({ maxPromptBytes: 262144 }); } }),
    user: { isOwner: function () { return Promise.resolve(!has("viewer")); }, canEdit: function () { return Promise.resolve(!has("viewer")); }, can: function () { return Promise.resolve(null); } },
    assets: has("noAssets") ? null : { upload: function (blob) { return Promise.resolve({ id: "0123456789abcdef0123456789abcdef", url: URL.createObjectURL(blob), sizeBytes: blob.size, contentType: blob.type }); } }
  };
  window.claude = { use: function (name) { return Promise.resolve(Object.prototype.hasOwnProperty.call(mocks, name) ? mocks[name] : null); } };
  if (has("noClaude")) delete window.claude;
})();
