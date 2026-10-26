/* core/resolve.js · the layer model (CONTRACT 6.4). */
(function () {
  var core = (CS.core = CS.core || {});

  var ROLE_KEYS = ["bg", "surface", "ink", "inkMuted", "accent", "accent2"];
  var FONT_ROLES = ["display", "heading", "body"];
  var SCALE_KEYS = ["hero", "heroTarget", "h1", "h2", "title", "body", "small", "micro", "numeral"];

  /** The closed set of token paths a post or slide override may touch (CONTRACT 6.4 step 4-5). */
  var OVERRIDE_PATHS = (function () {
    var p = [];
    ROLE_KEYS.forEach(function (r) { p.push("roles." + r); });
    FONT_ROLES.forEach(function (f) { ["family", "wght", "lh"].forEach(function (k) { p.push("type." + f + "." + k); }); });
    p.push("type.latin.family", "type.latin.wght");
    SCALE_KEYS.forEach(function (k) { p.push("type.scale." + k); });
    p.push("layout.align", "layout.coverAnchor", "layout.headlineWidth", "decor.highlight", "decor.numbering", "decor.texture", "decor.motif", "background.kind", "chrome.counter.format", "chrome.swipe.style");
    return p;
  })();

  var ENUMS = {
    "layout.align": ["start", "center"], "layout.coverAnchor": ["top", "center"],
    "decor.highlight": ["bar", "underline", "marker", "color"], "decor.numbering": ["ghost", "pill", "plain"],
    "decor.texture": ["none", "grain", "ruled", "grid", "dots", "paper", "pattern"],
    "background.kind": ["solid", "gradient", "paper", "photo", "pattern"],
    "chrome.counter.format": ["{i} من {n}", "{i}/{n}", "{i}"], "chrome.swipe.style": ["label+chevron", "chevron", "label", "none"]
  };

  var LAYERS = {
    preset: { ar: "الستايل", en: "the style" }, brand: { ar: "البراند", en: "the brand" }, occasion: { ar: "المناسبة", en: "the occasion" },
    post: { ar: "تعديل على البوست", en: "a post override" }, slide: { ar: "تعديل على السلايد", en: "a slide override" }, floor: { ar: "حدّ الجودة", en: "a quality floor" }
  };

  var NAMES = {
    "roles.ink": { ar: "لون النص", en: "text colour" }, "roles.inkMuted": { ar: "لون النص الثانوي", en: "muted text colour" },
    "roles.accent": { ar: "لون التمييز", en: "accent colour" }, "derived.onAccent": { ar: "لون النص فوق التمييز", en: "text colour on the accent" },
    "roles.bg": { ar: "لون الخلفية", en: "background colour" }, "roles.surface": { ar: "لون السطح", en: "surface colour" }, "roles.accent2": { ar: "لون التمييز الثاني", en: "second accent colour" }
  };

  var CSS_TO_PATH = {
    "--cs-bg": "roles.bg", "--cs-surface": "roles.surface", "--cs-ink": "roles.ink", "--cs-ink-muted": "roles.inkMuted", "--cs-accent": "roles.accent", "--cs-accent-2": "roles.accent2",
    "--cs-on-accent": "derived.onAccent", "--cs-line": "derived.line", "--cs-scrim-from": "derived.scrimFrom", "--cs-scrim-to": "derived.scrimTo"
  };

  var RAW = typeof WeakMap === "function" ? new WeakMap() : null;       // tokens -> pre-floor state, so slide() can re-run the floors

  /* ---- small helpers ---------------------------------------------------------------------------------- */

  function clone(v) { return v === undefined ? v : JSON.parse(JSON.stringify(v)); }
  function isNum(n) { return typeof n === "number" && isFinite(n); }
  function num(n) { return +(+n).toFixed(3); }

  function fmt(tpl, params) {
    if (typeof core.format === "function") return core.format(tpl, params);
    return String(tpl).replace(/\{(\w+)\}/g, function (m, k) { return Object.prototype.hasOwnProperty.call(params, k) ? params[k] : m; });
  }
  function M(ar, en, params) { return { ar: fmt(ar, params || {}), en: fmt(en, params || {}) }; }

  function normHex(v) {
    if (typeof v !== "string") return null;
    var m = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(v.trim());
    if (!m) return null;
    var h = m[1];
    if (h.length === 3) h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
    return ("#" + h).toUpperCase();
  }

  function getPath(obj, path) {
    var parts = path.split("."), cur = obj;
    for (var i = 0; i < parts.length; i++) { if (cur == null) return undefined; cur = cur[parts[i]]; }
    return cur;
  }

  function setPath(obj, path, value) {
    var parts = path.split("."), cur = obj;
    for (var i = 0; i < parts.length - 1; i++) {
      if (cur[parts[i]] == null || typeof cur[parts[i]] !== "object") cur[parts[i]] = {};
      cur = cur[parts[i]];
    }
    cur[parts[parts.length - 1]] = value;
  }

  function show(v) { return v && typeof v === "object" ? JSON.stringify(v) : String(v); }

  /** Size range within 12..400 (numeral: 640), or null. */
  function parseRange(v, max) {
    var a;
    if (isNum(v)) a = [v, v];
    else if (Array.isArray(v) && v.length === 2) a = [+v[0], +v[1]];
    else if (typeof v === "string") {
      var m = v.trim().split(/[\s,;\-–—]+/).filter(Boolean).map(Number);
      if (m.length === 1) a = [m[0], m[0]]; else if (m.length === 2) a = m;
    }
    if (!a || !isFinite(a[0]) || !isFinite(a[1])) return null;
    a = [Math.round(Math.min(a[0], a[1])), Math.round(Math.max(a[0], a[1]))];
    if (a[0] < 12 || a[1] > (max || 400)) return null;
    return a;
  }

  function parseSize(v) {
    var n = typeof v === "string" ? parseFloat(v) : v;
    if (!isNum(n)) return null;
    n = Math.round(n);
    return n >= 12 && n <= 400 ? n : null;
  }

  /** Validates and normalises one override value for `path`; returns undefined when it is not acceptable. */
  function sanitize(path, value) {
    var m;
    if ((m = /^roles\.(\w+)$/.exec(path))) return normHex(value) || undefined;
    if (/\.family$/.test(path)) return typeof value === "string" && core.registry.hasFont(value) ? value : undefined;
    if (/\.wght$/.test(path)) { var w = typeof value === "string" ? parseFloat(value) : value; return isNum(w) && w >= 100 && w <= 900 ? Math.round(w) : undefined; }
    if (/\.lh$/.test(path)) { var l = typeof value === "string" ? parseFloat(value) : value; return isNum(l) && l >= 1 && l <= 2.2 ? num(l) : undefined; }
    if (path === "type.scale.heroTarget" || path === "type.scale.small" || path === "type.scale.micro") return parseSize(value) || undefined;
    if (/^type\.scale\./.test(path)) return parseRange(value, path === "type.scale.numeral" ? 640 : 400) || undefined;
    if (path === "layout.headlineWidth") {
      var r = typeof value === "string" ? value.trim().split(/[\s,;]+/).map(Number) : value;
      if (Array.isArray(r) && r.length === 2 && isNum(+r[0]) && isNum(+r[1]) && r[0] >= 0.5 && r[1] <= 1 && r[0] <= r[1]) return [num(+r[0]), num(+r[1])];
      return undefined;
    }
    if (path === "decor.motif") { if (value === "none" || value === "" || value === false) return null; return typeof value === "string" && /^[a-z0-9][a-z0-9-]{0,39}$/.test(value) ? value : undefined; }
    if (ENUMS[path]) return ENUMS[path].indexOf(value) >= 0 ? value : undefined;
    return undefined;
  }

  /* ---- state: the layers, before the floors -------------------------------------------------------- */

  function lineHeights() {
    var t = null;
    try { t = core.registry.rules().platform.plugin.type.lineHeight; } catch (e) { t = null; }
    return { display: (t && t.display) || 1.3, heading: (t && t.heading) || 1.35, body: (t && t.body) || 1.6 };
  }

  function stateFromPreset(preset, ctx) {
    var p = clone(preset), lh = lineHeights(), s = p.type.scale;
    function font(f, def) { return { family: f.family, wght: f.wght || 400, lh: isNum(f.lh) ? f.lh : def }; }
    var hero = parseRange(s.hero) || [120, 180];
    var st = {
      ctx: ctx, presetId: p.id, presetVersion: p.version,
      roles: { bg: p.roles.bg, surface: p.roles.surface || null, ink: p.roles.ink, inkMuted: p.roles.inkMuted, accent: p.roles.accent, accent2: p.roles.accent2 || null },
      type: {
        display: font(p.type.display, lh.display), heading: font(p.type.heading, lh.heading), body: font(p.type.body, lh.body),
        latin: { family: p.type.latin.family, wght: p.type.latin.wght || 400 },
        scale: {
          hero: hero, heroTarget: parseSize(s.heroTarget) || Math.round((hero[0] + hero[1]) / 2),
          h1: parseRange(s.h1), h2: parseRange(s.h2), title: parseRange(s.title), body: parseRange(s.body),
          small: Array.isArray(s.small) ? Math.max.apply(null, s.small) : s.small, micro: Array.isArray(s.micro) ? Math.max.apply(null, s.micro) : s.micro
        }
      },
      layout: clone(p.layout),
      decor: { highlight: p.decor.highlight, numbering: p.decor.numbering, texture: p.decor.texture || "none", motif: p.decor.motif || null, kashida: { allowed: !!(p.decor.kashida && p.decor.kashida.allowed), maxWords: 1 } },
      background: { kind: p.background.kind, params: clone(p.background.params || {}) },
      chrome: clone(p.chrome), variants: clone(p.variants || {}), motion: clone(p.motion), floors: clone(p.floors),
      art: clone(p.art || null), tones: clone(p.tones || {}),
      brandBindings: (p.brandBindings || []).slice(),
      locked: {}, prov: {}, hist: {}, notes: []
    };
    if (s.numeral) st.type.scale.numeral = parseRange(s.numeral, 640) || [280, 520];
    OVERRIDE_PATHS.forEach(function (path) {
      var v = getPath(st, path);
      st.prov[path] = "preset";
      st.hist[path] = [{ layer: "preset", value: clone(v) }];
    });
    return st;
  }

  function isLocked(st, path) {
    var keys = Object.keys(st.locked);
    for (var i = 0; i < keys.length; i++) { if (path === keys[i] || path.indexOf(keys[i] + ".") === 0) return true; }
    return false;
  }

  function assign(st, path, value, layer) {
    setPath(st, path, value);
    st.prov[path] = layer;
    (st.hist[path] = st.hist[path] || []).push({ layer: layer, value: clone(value) });
  }

  var IGNORED = {
    locked: { ar: "مقفول من البراند", en: "is locked by the brand" },
    unknown: { ar: "غير مدعوم", en: "is not a supported setting" },
    invalid: { ar: "قيمته غير صالحة", en: "has an invalid value" },
    variant: { ar: "الستايل لا يدعمه", en: "is not supported by the style" }
  };

  /** Records, as an adjustment, a requested change that the layer model refused (locked, unknown, invalid or unsupported). */
  function note(st, path, from, to, why) {
    var r = IGNORED[why] || IGNORED.invalid;
    st.notes.push({
      path: path, from: show(from), to: show(to), reason: "clamp",
      msg: { ar: "تم تجاهل التعديل على " + path + " لأنه " + r.ar + ".", en: "The change to " + path + " was ignored because it " + r.en + "." }
    });
  }

  function applyBrand(st, brand) {
    if (!brand) return;
    var vis = brand.visual || {}, pal = vis.palette || {}, bind = st.brandBindings;
    st.artSupport = clone(vis.art && vis.art.support);
    var given = {};
    ROLE_KEYS.forEach(function (role) {
      var hex = bind.indexOf(role) >= 0 ? normHex(pal[role]) : null;
      if (hex) { assign(st, "roles." + role, hex, "brand"); given[role] = true; }
    });
    /* a surface or second accent that the brand did not choose must follow the colours it did choose, not keep the preset's literal */
    if ((given.bg || given.ink) && !given.surface && st.roles.surface) assign(st, "roles.surface", null, "brand");
    if (given.accent && !given.accent2 && st.roles.accent2) assign(st, "roles.accent2", null, "brand");
    if (bind.indexOf("fonts") >= 0 && vis.fonts) {
      var f = vis.fonts, reg = core.registry;
      if (f.display && reg.hasFont(f.display)) { assign(st, "type.display.family", f.display, "brand"); assign(st, "type.heading.family", f.display, "brand"); }
      if (f.body && reg.hasFont(f.body)) assign(st, "type.body.family", f.body, "brand");
      if (f.latin && reg.hasFont(f.latin)) assign(st, "type.latin.family", f.latin, "brand");
    }
    (vis.locks || []).forEach(function (p) { st.locked[p] = true; });
  }

  var OVERLAY_KEYS = { "roles.accent2": "roles.accent2", "background.texture": "decor.texture", "decor.motif": "decor.motif" };

  /** Applies the overlay of an occasion pack; false when the pack does not allow this preset (then it is as if no occasion were set). */
  function applyOccasion(st, occ) {
    if (!occ || !occ.overlay) return false;
    var ov = occ.overlay, allowedPresets = ov.presetsAllowed || [];
    if (allowedPresets.length && allowedPresets.indexOf(st.presetId) < 0) return false;
    (ov.allowedKeys || []).forEach(function (key) {
      var target = OVERLAY_KEYS[key];
      if (!target || !ov.tokens || ov.tokens[key] === undefined) return;
      if (isLocked(st, key) || isLocked(st, target)) { note(st, target, ov.tokens[key], getPath(st, target), "locked"); return; }
      var v = sanitize(target, ov.tokens[key]);
      if (v === undefined) { note(st, target, ov.tokens[key], getPath(st, target), "invalid"); return; }
      assign(st, target, v, "occasion");
    });
    return true;
  }

  function applyOverrides(st, overrides, layer) {
    if (!overrides) return;
    Object.keys(overrides).sort().forEach(function (path) {
      var raw = overrides[path];
      if (OVERRIDE_PATHS.indexOf(path) < 0) { note(st, path, raw, "", "unknown"); return; }
      if (isLocked(st, path)) { note(st, path, raw, getPath(st, path), "locked"); return; }
      var v = sanitize(path, raw);
      if (v === undefined) { note(st, path, raw, getPath(st, path), "invalid"); return; }
      assign(st, path, v, layer);
    });
  }

  /* ---- floors and derivation ---------------------------------------------------------------------------- */

  function backgroundColors(st, roles) {
    var b = st.background || {}, params = b.params || {};
    function colour(x) { return roles[x] || normHex(x) || null; }
    if (b.kind === "solid" && params.role && params.role !== "bg") return [colour(params.role) || roles.bg];
    if (b.kind === "gradient" && Array.isArray(params.stops) && params.stops.length) {
      var cs = params.stops.map(function (s) { return colour(s[0]); }).filter(Boolean);
      if (cs.length) return cs;
    }
    return [roles.bg];
  }

  function backgroundImage(st, roles) {
    var b = st.background || {}, params = b.params || {};
    function colour(x) { return roles[x] || normHex(x) || roles.bg; }
    if (b.kind === "solid" && params.role && params.role !== "bg") { var c = colour(params.role); return "linear-gradient(" + c + "," + c + ")"; }
    if (b.kind === "gradient" && Array.isArray(params.stops) && params.stops.length > 1) {
      var stops = params.stops.map(function (s) { return colour(s[0]) + (isNum(+s[1]) ? " " + (+s[1]) + "%" : ""); });
      return "linear-gradient(" + (isNum(+params.angle) ? +params.angle : 160) + "deg," + stops.join(",") + ")";
    }
    return "none";
  }

  function onAccentOf(accent, floor) {
    var C = core.color, ink = C.onColor(accent);
    return C.contrast(ink, accent) < floor ? C.ensureContrast(ink, accent, floor).hex : ink;
  }

  // Tone references read base roles; floors use the tone's grounds.
  function resolveArt(t, st) {
    /* a brand accent keeps the preset's own support hues (no rotation: a red brand once got a green and an indigo); a preset without any gets [accent, accent2] */
    var C = core.color, a = t.art, base = t.roles, colors = a.colors || {}, support = st.artSupport || colors.support || [base.accent, base.accent2];
    function ref(v) { return base[v] || normHex(v) || base.ink; }
    function floor(fg, grounds, min) {
      for (var p = 0; p < 3; p++) grounds.forEach(function (bg) { fg = C.ensureContrast(fg, bg, min).hex; });
      return fg;
    }
    function value(v, tone) {
      if (typeof v === "string") return ref(v);
      if (v.mix) return C.mix(ref(v.mix[0]), ref(v.mix[1]), v.mix[2]);
      if (v.lightness) { var c = C.toOklch(ref(v.lightness[0])); c.L = v.lightness[1]; return C.fromOklch(c); }
      if (v.pick) return ref(v.pick[0].filter(function (r) { return C.contrast(ref(r), tone.bg) >= v.pick[1]; })[0] || v.pick[0].slice(-1)[0]);
      if (v.muted) {
        for (var i = 1000; i >= 0; i--) {
          var m = C.mix(tone.ink, tone.bg, i / 1000);
          if (C.contrast(m, tone.bg) >= v.muted && C.contrast(m, tone.surface) >= v.muted) return m;
        }
        return tone.ink;
      }
      return base.ink;
    }
    t.tones = {};
    ["base", "invert", "field"].forEach(function (name) {
      var tone = Object.assign({}, base), raw = (st.tones[name] || {}).roles || {};
      ROLE_KEYS.forEach(function (k) { if (raw[k]) tone[k] = value(raw[k], tone); });
      var grounds = [tone.bg, tone.surface], textMin = Math.max(4.5, t.floors.contrastBody);
      tone.ink = floor(tone.ink, grounds, textMin); tone.inkMuted = floor(tone.inkMuted, grounds, textMin);
      ["ink", "inkMuted"].forEach(function (k) {
        if (grounds.some(function (bg) { return C.contrast(tone[k], bg) < textMin; })) t.adjustments.push({ path: "tones." + name + "." + k, reason: "contrast", from: tone[k], to: tone[k], msg: M("تعذّر بلوغ حد التباين على الخلفيتين.", "The contrast floor could not be reached on both grounds.") });
      });
      if (t.decor.highlight === "color" || a.mark !== "outline" || a.outline < 3) tone.accent = floor(tone.accent, grounds, t.decor.highlight === "color" ? textMin : 3);
      tone.onAccent = onAccentOf(tone.accent, textMin); tone.line = C.mix(tone.ink, tone.bg, 0.82);
      tone.support = support.map(function (s) { return a.mark === "outline" && a.outline >= 3 ? ref(s) : floor(ref(s), grounds, 3); });
      tone.note = ref(colors.note || "surface");
      t.tones[name] = tone;
      ["bg", "surface", "ink", "inkMuted", "accent", "accent2", "onAccent", "line"].forEach(function (k) {
        var cssKey = k.replace(/[A-Z]/g, function (c) { return "-" + c.toLowerCase(); }).replace("accent2", "accent-2");
        t.css["--cs-tone-" + name + "-" + cssKey] = tone[k];
      });
    });
    a.colors = { note: t.tones.base.note, support: t.tones.base.support };
    // Keep outlineColor as a role reference: the art kit resolves it in the selected tone.
    function css(k, v, unit) { t.css["--cs-art-" + k] = String(v == null ? 0 : v) + (unit || ""); }
    ["stroke", "cap", "join", "wobble"].forEach(function (k) { css(k, a[k]); });
    Object.keys(a.radius || {}).forEach(function (k) { css("r-" + k, a.radius[k], "px"); });
    css("outline", a.outline, "px"); css("tilt", a.tilt, "deg");
    css("note", a.colors.note); css("s1", a.colors.support[0]); css("s2", a.colors.support[1]);
    var sh = a.shadow || { kind: "none" };
    css("shadow", sh.kind === "none" ? "none" : (sh.dx || 0) + "px " + (sh.dy || 0) + "px " + (sh.kind === "hard" ? 0 : sh.blur || 0) + "px " + base.ink);
  }

  function finalize(st) {
    var C = core.color, F = clone(st.floors), ctx = st.ctx, adj = st.notes.slice(), prov = clone(st.prov);
    var type = clone(st.type), roles = clone(st.roles);

    /* roles: defaults, then contrast */
    roles.surface = roles.surface || C.mix(roles.bg, roles.ink, 0.04);
    roles.accent2 = roles.accent2 || roles.accent;
    var bgs = backgroundColors(st, roles);

    function shift(path, fg, against, min, nameKey, againstName) {
      var cur = fg, before = C.contrast(fg, against[0]);
      for (var pass = 0; pass < 3; pass++) {
        var okAll = true;
        for (var i = 0; i < against.length; i++) {
          if (C.contrast(cur, against[i]) < min - 1e-6) { cur = C.ensureContrast(cur, against[i], min).hex; okAll = false; }
        }
        if (okAll) break;
      }
      if (cur !== fg) {
        var worst = Math.min.apply(null, against.map(function (a) { return C.contrast(cur, a); }));
        var nm = NAMES[nameKey] || { ar: path, en: path };
        adj.push({
          path: path, from: fg, to: cur, reason: "contrast",
          msg: {
            ar: "عُدّل " + nm.ar + " قليلًا ليصل التباين مع " + againstName.ar + " إلى " + worst.toFixed(1) + " (كان " + before.toFixed(1) + ") والحد المطلوب " + min + ".",
            en: "The " + nm.en + " was nudged lighter or darker so its contrast with " + againstName.en + " reaches " + worst.toFixed(1) + " (it was " + before.toFixed(1) + "; the floor is " + min + ")."
          }
        });
      }
      return cur;
    }

    var BGNAME = { ar: "الخلفية", en: "the background" }, BGSURF = { ar: "الخلفية والسطح", en: "the background and the surface" };
    var inkNew = shift("roles.ink", roles.ink, bgs.concat([roles.surface]), F.contrastBody, "roles.ink", BGSURF);
    if (inkNew !== roles.ink) { roles.ink = inkNew; prov["roles.ink"] = "floor"; }
    var mutedNew = shift("roles.inkMuted", roles.inkMuted, bgs, F.contrastBody, "roles.inkMuted", BGNAME);
    if (mutedNew !== roles.inkMuted) { roles.inkMuted = mutedNew; prov["roles.inkMuted"] = "floor"; }
    if (st.decor.highlight === "color") {
      var accNew = shift("roles.accent", roles.accent, bgs, F.contrastBody, "roles.accent", BGNAME);
      if (accNew !== roles.accent) { roles.accent = accNew; prov["roles.accent"] = "floor"; if (!st.roles.accent2) roles.accent2 = accNew; }
    }

    /* sizes */
    var sc = type.scale;
    [["hero", F.hero], ["body", F.body]].forEach(function (pair) {
      var key = pair[0], min = pair[1], r = sc[key];
      if (r[0] < min) {
        var from = r.slice();
        r[0] = min; if (r[1] < r[0]) r[1] = r[0];
        prov["type.scale." + key] = "floor";
        adj.push({ path: "type.scale." + key, from: show(from), to: show(r), reason: "floor", msg: M("رُفع الحد الأدنى لحجم {key} إلى {min} بكسل.", "The minimum size of {key} was raised to {min} px.", { key: key, min: min }) });
      }
    });
    ["small", "micro"].forEach(function (key) {
      if (sc[key] < F.meta) {
        adj.push({ path: "type.scale." + key, from: String(sc[key]), to: String(F.meta), reason: "floor", msg: M("رُفع حجم {key} إلى {min} بكسل (الحد الأدنى للنص الصغير).", "The {key} size was raised to {min} px (the floor for small text).", { key: key, min: F.meta }) });
        sc[key] = F.meta; prov["type.scale." + key] = "floor";
      }
    });
    ["h1", "h2", "title"].forEach(function (key) { var r = sc[key]; if (r[1] < r[0]) r[1] = r[0]; });
    sc.heroTarget = Math.max(sc.hero[0], Math.min(sc.hero[1], sc.heroTarget));

    /* English posts: a display family without Latin glyphs gives way to the preset's Latin family */
    if (ctx.dialect === "en") {
      FONT_ROLES.forEach(function (role) {
        var f = type[role];
        if (!core.registry.fontHas(f.family, 65)) {
          adj.push({ path: "type." + role + ".family", from: f.family, to: type.latin.family, reason: "floor", msg: M("خط {from} لا يحتوي الحروف اللاتينية، فاستُخدم {to} للنص الإنجليزي.", "{from} has no Latin glyphs, so {to} is used for English text.", { from: f.family, to: type.latin.family }) });
          f.family = type.latin.family; prov["type." + role + ".family"] = "floor";
        }
      });
    }

    /* derived solids */
    var onAcc = C.onColor(roles.accent), onAccFixed = onAccentOf(roles.accent, F.contrastBody);
    if (onAccFixed !== onAcc) adj.push({ path: "derived.onAccent", from: onAcc, to: onAccFixed, reason: "contrast", msg: M("عُدّل لون النص فوق التمييز ليصل التباين إلى {min}.", "The text colour on the accent was adjusted to reach a contrast of {min}.", { min: F.contrastBody }) });
    var scrim = C.mix(roles.bg, roles.ink, 0.55), rgb = C.parse(scrim);
    var derived = { onAccent: onAccFixed, line: C.mix(roles.ink, roles.bg, 0.82), scrimFrom: scrim, scrimTo: "rgba(" + rgb.r + "," + rgb.g + "," + rgb.b + ",0)" };
    prov["derived.onAccent"] = onAccFixed !== onAcc ? "floor" : "preset";
    prov["derived.line"] = prov["derived.scrimFrom"] = prov["derived.scrimTo"] = "preset";

    /* fonts in use */
    var fontIds = [];
    ["display", "heading", "body", "latin"].forEach(function (r) { if (fontIds.indexOf(type[r].family) < 0) fontIds.push(type[r].family); });
    fontIds.forEach(function (id) {
      if (!core.registry.hasFont(id)) throw new CS.CSError("E_FONT_MISSING", "The font \"" + id + "\" is not in the font registry.", { id: id });
    });
    function fontOut(r) { var f = type[r]; return { family: f.family, cssFamily: core.registry.fontCss(f.family), wght: f.wght, lh: f.lh }; }
    var tokens = {
      presetId: st.presetId, presetVersion: st.presetVersion, occasionId: ctx.occasionId || null, digits: ctx.digits, dialect: ctx.dialect,
      roles: roles, derived: derived,
      type: { display: fontOut("display"), heading: fontOut("heading"), body: fontOut("body"), latin: { family: type.latin.family, cssFamily: core.registry.fontCss(type.latin.family), wght: type.latin.wght, lh: type.body.lh }, scale: sc },
      layout: clone(st.layout),
      background: { kind: st.background.kind, params: clone(st.background.params), image: backgroundImage(st, roles) },
      decor: clone(st.decor), chrome: clone(st.chrome), variants: variantMap(st), motion: clone(st.motion), floors: F,
      fonts: fontIds, css: null, provenance: prov, adjustments: adj, hash: ""
    };
    if (st.art) {
      tokens.art = ctx.visualMode === "off" ? null : clone(st.art);
      tokens.visualMode = tokens.art ? ctx.visualMode || "auto" : "off";
    }
    tokens.css = buildCss(tokens, ctx);
    if (tokens.art) resolveArt(tokens, st);
    tokens.hash = core.canon.hash(core.canon.hashable(tokens));
    if (RAW) RAW.set(tokens, st);
    return tokens;
  }

  /** Preset variants, with an archetype default for every registered type. */
  function variantMap(st) {
    var out = {};
    core.constants.SLIDE_TYPES.forEach(function (type) {
      var list = st.variants[type];
      if (!Array.isArray(list) || !list.length) {
        var def = null;
        try { def = core.registry.getArchetype(type).defaultVariant; } catch (e) { def = null; }
        list = def ? [def] : [];
      }
      out[type] = list.slice();
    });
    return out;
  }

  function buildCss(t, ctx) {
    var g = core.registry.geometry(ctx.canvasH, { inner: ctx.inner });
    var css = {}, r = t.roles, d = t.derived, ty = t.type, sc = ty.scale;
    function q(f) { return '"' + f.cssFamily + '"'; }
    css["--cs-bg"] = r.bg; css["--cs-surface"] = r.surface; css["--cs-ink"] = r.ink; css["--cs-ink-muted"] = r.inkMuted; css["--cs-accent"] = r.accent; css["--cs-accent-2"] = r.accent2;
    css["--cs-on-accent"] = d.onAccent; css["--cs-line"] = d.line; css["--cs-scrim-from"] = d.scrimFrom; css["--cs-scrim-to"] = d.scrimTo;
    css["--cs-bg-image"] = t.background.image;
    css["--cs-font-display"] = q(ty.display); css["--cs-font-heading"] = q(ty.heading); css["--cs-font-body"] = q(ty.body); css["--cs-font-latin"] = q(ty.latin);
    css["--cs-wght-display"] = String(ty.display.wght); css["--cs-wght-heading"] = String(ty.heading.wght); css["--cs-wght-body"] = String(ty.body.wght); css["--cs-wght-latin"] = String(ty.latin.wght);
    css["--cs-lh-display"] = String(num(ty.display.lh)); css["--cs-lh-heading"] = String(num(ty.heading.lh)); css["--cs-lh-body"] = String(num(ty.body.lh));
    css["--cs-fs-hero"] = sc.hero[1] + "px"; css["--cs-fs-h1"] = sc.h1[1] + "px"; css["--cs-fs-h2"] = sc.h2[1] + "px"; css["--cs-fs-title"] = sc.title[1] + "px";
    css["--cs-fs-body"] = sc.body[1] + "px"; css["--cs-fs-small"] = sc.small + "px"; css["--cs-fs-micro"] = sc.micro + "px";
    css["--cs-fs-hero-min"] = sc.hero[0] + "px"; css["--cs-fs-hero-max"] = sc.hero[1] + "px";
    css["--cs-fs-title-min"] = sc.title[0] + "px"; css["--cs-fs-title-max"] = sc.title[1] + "px";
    css["--cs-fs-body-min"] = sc.body[0] + "px"; css["--cs-fs-body-max"] = sc.body[1] + "px"; css["--cs-hero-target"] = sc.heroTarget + "px";
    css["--cs-text-align"] = t.layout.align === "center" ? "center" : "start";
    css["--cs-cover-justify"] = t.layout.coverAnchor === "center" ? "center" : "flex-start";
    css["--cs-headline-w-min"] = num(t.layout.headlineWidth[0] * 100) + "%"; css["--cs-headline-w-max"] = num(t.layout.headlineWidth[1] * 100) + "%";
    var grid = g.grid || {};
    css["--cs-w"] = g.canvas.w + "px"; css["--cs-h"] = g.canvas.h + "px";
    css["--cs-pad-x"] = g.content.x + "px"; css["--cs-pad-top"] = g.header.y + "px"; css["--cs-pad-bottom"] = (g.canvas.h - (g.footer.y + g.footer.h)) + "px";
    css["--cs-header-h"] = g.header.h + "px"; css["--cs-footer-h"] = g.footer.h + "px"; css["--cs-footer-item-h"] = g.itemMax + "px";
    css["--cs-body-top"] = g.body.y + "px"; css["--cs-body-h"] = g.body.h + "px";
    if (ctx.inner) css["--cs-footer-pad-x"] = (g.footer.x - g.content.x) + "px";
    css["--cs-gap"] = "16px"; css["--cs-unit"] = (grid.baselinePx || 8) + "px"; css["--cs-col"] = (grid.columnWidthPx || 59) + "px"; css["--cs-gutter"] = (grid.gutterPx || 16) + "px";
    return css;
  }

  /* ---- public API ----------------------------------------------------------------------------------------- */

  function post(spec, brand, opts) {
    opts = opts || {};
    var reg = core.registry, style = (spec && spec.style) || {}, locale = (spec && spec.locale) || {};
    var pin = String(style.presetId || ""), pinParts = pin.split("@");
    var want = String(opts.presetId || pinParts[0] || (brand && brand.visual && brand.visual.presetId) || core.DEFAULT_PRESET).split("@")[0];
    var notes = [], preset;
    if (reg.hasPreset(want)) preset = reg.getPreset(want);
    else {
      var all = reg.listPresets();
      if (!all.length) throw new CS.CSError("E_USAGE", "No style preset is registered.");
      if (!reg.hasPreset(core.DEFAULT_PRESET)) throw new CS.CSError("E_USAGE", "The default style preset is not registered: " + core.DEFAULT_PRESET);
      preset = reg.getPreset(core.DEFAULT_PRESET);
      notes.push({ path: "presetId", from: want, to: preset.id, reason: "clamp", msg: { ar: "الستايل " + want + " غير مثبّت فاستُخدم " + preset.id + ".", en: "The style " + want + " is not installed, so " + preset.id + " is used." } });
    }
    var occId = opts.occasionId === undefined ? style.occasionId : opts.occasionId;
    var ctx = {
      dialect: locale.dialect || "eg", digits: locale.digits || "western", occasionId: null,
      canvasH: (spec && spec.canvas && spec.canvas.h) || core.constants.CANVAS.h, visualMode: style.visualMode
    };
    var st = stateFromPreset(preset, ctx);
    st.notes = notes;
    if (pinParts[1] && pinParts[1] !== preset.version && want === preset.id) {
      st.notes.push({ path: "presetVersion", from: pinParts[1], to: preset.version, reason: "clamp", msg: { ar: "البوست مبني على نسخة " + pinParts[1] + " من الستايل والمثبّت " + preset.version + ".", en: "The post was built on style version " + pinParts[1] + "; version " + preset.version + " is installed." } });
    }
    applyBrand(st, brand);
    var occ = reg.getOccasion(occId);
    if (occ && applyOccasion(st, occ)) ctx.occasionId = occ.id;
    applyOverrides(st, style.overrides, "post");
    return finalize(st);
  }

  /** The variant a slide really uses: its own when the preset styles it, else the preset's default for the type. */
  function variantFor(tokens, slide) {
    var list = (tokens.variants && tokens.variants[slide.type]) || [];
    var def = list[0] || null;
    if (!def) { try { def = core.registry.getArchetype(slide.type).defaultVariant; } catch (e) { def = "base"; } }
    if (slide.variant && slide.variant !== def && list.indexOf(slide.variant) < 0) return { variant: def, fellBack: true, requested: slide.variant };
    return { variant: slide.variant || def, fellBack: false, requested: slide.variant || null };
  }

  function stateOf(tokens) {
    var st = RAW && RAW.get(tokens);
    if (st) return st;
    /* tokens that did not come from post() (for example parsed from JSON): rebuild a state from the values they carry */
    var ctx = { dialect: tokens.dialect, digits: tokens.digits, occasionId: tokens.occasionId, visualMode: tokens.visualMode, canvasH: parseInt(tokens.css && tokens.css["--cs-h"], 10) || core.constants.CANVAS.h };
    var preset = core.registry.getPreset(tokens.presetId);
    st = stateFromPreset(preset, ctx);
    ROLE_KEYS.forEach(function (k) { if (tokens.roles[k]) st.roles[k] = tokens.roles[k]; });
    return st;
  }

  function slideTokens(tokens, slide) {
    var v = variantFor(tokens, slide), has = slide.overrides && Object.keys(slide.overrides).length;
    var inner = !!tokens.art && ["cover", "poster"].indexOf(slide.type) < 0;
    if (!has && !v.fellBack && !inner) return tokens;
    var st = clone(stateOf(tokens));
    st.ctx = Object.assign({}, stateOf(tokens).ctx, { inner: inner });
    if (has) applyOverrides(st, slide.overrides, "slide");
    if (v.fellBack) note(st, "variant", v.requested, v.variant, "variant");
    return finalize(st);
  }

  function lookup(tokens, path) {
    if (CSS_TO_PATH[path]) path = CSS_TO_PATH[path];
    if (/^--cs-/.test(path)) return tokens.css ? tokens.css[path] : undefined;
    return getPath(tokens, path);
  }

  /** «ليه اللون ده؟»: where a token came from and what changed it on the way. */
  function explain(tokens, path) {
    if (CSS_TO_PATH[path]) path = CSS_TO_PATH[path];
    var value = lookup(tokens, path), st = RAW && RAW.get(tokens);
    var layer = (tokens.provenance && tokens.provenance[path]) || "preset";
    var steps = [];
    var hist = st && st.hist[path];
    if (hist) hist.forEach(function (h) { steps.push(LAYERS[h.layer].ar + ": " + show(h.value)); });
    (tokens.adjustments || []).forEach(function (a) { if (a.path === path) steps.push(LAYERS[a.reason === "contrast" || a.reason === "floor" ? "floor" : "slide"].ar + ": " + a.from + " ← " + a.to); });
    if (!steps.length) steps.push(LAYERS[layer].ar + ": " + show(value));
    var nm = NAMES[path] || { ar: path, en: path };
    var adjust = (tokens.adjustments || []).filter(function (a) { return a.path === path; }).pop();
    var msg;
    if (/^derived\./.test(path) && !adjust) {
      msg = { ar: nm.ar + " (" + show(value) + ") يُحسب تلقائيًا من ألوان الستايل.", en: "The " + nm.en + " (" + show(value) + ") is derived automatically from the style's colours." };
    } else {
      msg = { ar: nm.ar + " " + show(value) + " جاي من " + LAYERS[layer].ar + ".", en: "The " + nm.en + " " + show(value) + " comes from " + LAYERS[layer].en + "." };
      if (adjust) { msg.ar += " " + adjust.msg.ar; msg.en += " " + adjust.msg.en; }
    }
    return { path: path, value: value === undefined ? "" : show(value), layer: layer, steps: steps, msg: msg };
  }

  core.resolve = {
    post: post,
    slide: slideTokens,
    explain: explain,
    variantFor: variantFor,
    OVERRIDE_PATHS: OVERRIDE_PATHS
  };
})();
