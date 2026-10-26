/* tests/unit/js/art/support/page.js - in-page half of the art harness. harness.mjs injects window.__ART_PRESETS first, then this file.
 *   __art.ctx(o)                 -> a builder ctx (IS-3) for { preset, tone, rtl, slideId, part, box, zone, recipe, size, labelsOnly }
 *   __art.render(anchor, o)      -> { sel, html, rect, boxes, labels } | null    builds CS.art.build(anchor, ctx) on a 1080 x 1440 slide at the zone, fills the labels
 *   __art.mount(fnSource, arg, o)  -> the same record for any node (fn(CS, ctx, arg) returns it)
 *   __art.sheet({ cols, cw, ch, rows, items })  -> { sel, w, h }                 a contact sheet; an item is { kind: icon|object|anchor, name|id|anchor, opts, preset, tone, rtl, label, x, y }
 * Labels always use the real CS.core.compose.label pipeline, registered rules, slide keys and fit floors. */
(function () {
  if (!CS.core.compose || typeof CS.core.compose.label !== "function") throw new Error("art harness requires real CS.core.compose.label");
  var P = window.__ART_PRESETS, seq = 0, ZONE = { x: 114, y: 261, w: 852, h: 998 };
  function mix(a, b, t) { return CS.core.color.mix(a, b, t); }

  function ctxFor(o) {
    o = o || {};
    var p = P[o.preset || "swiss"], t = p.tones[o.tone || "base"], id = o.slideId || (o.slide && o.slide.id) || "s05", rtl = o.rtl !== false;
    var tokens = { bg: t[0], surface: t[1], ink: t[2], inkMuted: t[3], accent: t[4], accent2: t[4], onAccent: CS.core.color.onColor(t[4]), line: mix(t[0], t[2], 0.14), support: p.art.colors.support.slice(), note: p.art.colors.note };
    function freeze(v) { if (v && typeof v === "object") { Object.keys(v).forEach(function (k) { freeze(v[k]); }); Object.freeze(v); } return v; }
    var slide = freeze(JSON.parse(JSON.stringify(o.slide || { id: id, type: "item" })));
    return { id: id, rules: CS.core.registry.rules(), slideId: id, seed: CS.core.canon.fnv1a64(id + (o.part || "anchor")), rtl: rtl, lang: rtl ? "ar" : "en", digits: o.digits || "western", dialect: o.dialect || (rtl ? "eg" : "en"), tokens: tokens, art: p.art,
      zone: o.zone || ZONE, box: o.box || { w: ZONE.w, h: 420 }, recipe: o.recipe || "under", tone: o.tone || "base", size: o.size, labelsOnly: !!o.labelsOnly,
      slide: slide, visual: slide.visual || {}, brand: o.brand || null, sources: o.sources || {}, data: { pack: CS.visual._.block("cs-icon-pack"), objects: CS.visual._.block("cs-icon-objects"), marks: CS.visual._.block("cs-art-marks") } };
  }

  function rootVars(c) {
    var t = c.tokens;
    return "--cs-bg:" + t.bg + ";--cs-surface:" + t.surface + ";--cs-ink:" + t.ink + ";--cs-ink-muted:" + t.inkMuted + ";--cs-accent:" + t.accent + ";--cs-accent-2:" + t.accent2 + ";--cs-on-accent:" + t.onAccent + ";--cs-line:" + t.line + ";background-color:" + t.bg + ";color:" + t.ink;
  }
  function clear() { var s = document.getElementById("art-stage"); if (s) s.innerHTML = ""; }
  function host() { var s = document.getElementById("art-stage"); if (!s) { s = document.createElement("div"); s.id = "art-stage"; s.style.cssText = "position:absolute;left:0;top:0"; document.body.appendChild(s); } return s; }

  function fill(labels, c) {
    labels.forEach(function (l) {
      if (!l.el) return;
      CS.core.compose.label(l.el, l.text, c, { role: l.role, index: l.index });
      if (l.el.getAttribute("data-slot-key") !== c.id + ".art." + l.index || !(+l.el.getAttribute("data-floor") > 0)) throw new Error("real art label missing slide key or floor");
    });
  }

  function rect(el) { var r = el.getBoundingClientRect(); return { x: Math.round(r.left * 100) / 100, y: Math.round(r.top * 100) / 100, w: Math.round(r.width * 100) / 100, h: Math.round(r.height * 100) / 100 }; }

  /** Puts a built node on a 1080 x 1440 slide at the zone (and the box offset); returns the render record. */
  function mountNode(res, c, o) {
    var root = document.createElement("section"), id = "art-" + (++seq), zone = document.createElement("div");
    root.className = "cs-slide"; root.id = id; root.setAttribute("data-preset", o.preset || "swiss"); root.setAttribute("data-tone", c.tone); root.setAttribute("dir", c.rtl ? "rtl" : "ltr"); root.setAttribute("lang", c.lang);
    root.setAttribute("style", rootVars(c));
    zone.className = "cs-zone"; zone.style.cssText = "left:" + c.zone.x + "px;top:" + c.zone.y + "px;width:" + c.zone.w + "px;height:" + c.zone.h + "px";
    if (res.el) { var slot = document.createElement("div"); slot.style.cssText = "position:absolute;left:" + (c.box.x || 0) + "px;top:" + (c.box.y || 0) + "px;width:" + c.box.w + "px;height:" + c.box.h + "px"; slot.appendChild(res.el); zone.appendChild(slot); }
    root.appendChild(zone); host().appendChild(root);
    fill(res.labels || [], c);
    return { sel: "#" + id, html: res.el ? res.el.outerHTML : "", rect: res.el ? rect(res.el) : null, boxes: res.boxes || [], labels: (res.labels || []).map(function (l) { return { text: l.text, role: l.role, index: l.index }; }) };
  }
  function render(anchor, o) {
    o = o || {};
    if (!o.keep) clear();
    var c = ctxFor(o), res = CS.art.build(anchor, c);
    return res ? mountNode(res, c, o) : null;
  }
  /** fn source (CS, ctx, arg) -> a node; mounted like an anchor (for kit-level tests). */
  function mount(src, arg, o) {
    o = o || {};
    if (!o.keep) clear();
    var c = ctxFor(o), node = new Function("CS", "ctx", "arg", "return (" + src + ")(CS, ctx, arg)")(CS, c, arg);
    return mountNode({ el: node, boxes: [], labels: [] }, c, o);
  }

  function sheet(spec) {
    if (!spec.keep) clear();
    var cw = spec.cw || 300, ch = spec.ch || 300, cols = spec.cols || 6, items = spec.items, el = document.createElement("div"), id = "art-sheet-" + (++seq), rows = Math.ceil(items.length / cols), top = spec.title ? 34 : 0;
    el.className = "cs-sheet"; el.id = id; el.setAttribute("data-bg", spec.bg || ""); el.style.cssText = "width:" + cols * cw + "px;height:" + (rows * ch + top) + "px" + (spec.bg ? ";background-color:" + spec.bg : "");
    if (spec.title) { var tt = document.createElement("div"); tt.className = "row-title"; tt.setAttribute("data-sheet", "1"); tt.style.top = "8px"; tt.textContent = spec.title; el.appendChild(tt); }
    items.forEach(function (it, i) {
      var c = ctxFor(it), cell = document.createElement("div"), node = null, x = (i % cols) * cw, y = Math.floor(i / cols) * ch + top, o = Object.assign({ ctx: c }, it.opts);
      cell.className = "cell"; cell.setAttribute("dir", c.rtl ? "rtl" : "ltr");
      cell.style.cssText = "left:" + x + "px;top:" + y + "px;width:" + cw + "px;height:" + ch + "px;" + rootVars(c);
      if (it.kind === "icon") node = CS.art.icon(it.name, o);
      else if (it.kind === "object") node = CS.art.object(it.id, o);
      else if (it.kind === "anchor") { c.box = it.box || { w: cw - 24, h: ch - 24 }; var res = CS.art.build(it.anchor, c); if (res) { node = res.el; fill(res.labels || [], c); } }
      if (node) cell.appendChild(node);
      else { var miss = document.createElement("span"); miss.textContent = "MISSING " + (it.name || it.id || ""); miss.setAttribute("data-sheet", "1"); cell.appendChild(miss); }
      if (it.label) { var cap = document.createElement("span"); cap.className = "cap"; cap.setAttribute("data-sheet", "1"); cap.textContent = it.label; cell.appendChild(cap); }
      el.appendChild(cell);
    });
    host().appendChild(el);
    return { sel: "#" + id, w: cols * cw, h: rows * ch + top };
  }

  window.__art = { ctx: ctxFor, render: render, mount: mount, sheet: sheet, clear: clear };
})();
