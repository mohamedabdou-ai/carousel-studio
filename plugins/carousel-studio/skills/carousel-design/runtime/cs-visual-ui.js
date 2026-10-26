/*! Carousel Studio runtime chunk cs-visual-ui.js · cs-1.1.0 · Apache-2.0 */
(function () {
  "use strict";
  var CS = (window.CS = window.CS || {});
  /* ---- file: panel.js ---- */
/* U2a: Visual plan controls and editor helpers. */
CS.vui = CS.vui || {};
(function () {
  var U = CS.ui && CS.ui._;
  if (!U) return;
  var V = CS.vui, h = U.h, t = U.t, icon = U.icon;
  var KINDS = ["auto", "none", "icon", "numeral", "chart", "mock", "rows", "word", "field"];
  /* Builder payloads: anchor-icon, numeral/chart, rows, field. */
  var GLYPH = "icon object size treatment badge mirror captions";
  var OWN = { icon: GLYPH, numeral: "value unit companion of filled treatment icon object", chart: "chart", mock: "mock", rows: "icons treatment captions", word: "word wordStyle", field: "word wordStyle value unit icons " + GLYPH };
  function fieldType(a) { return a.value ? "numeral" : a.word ? "word" : a.icon || a.object ? "icon" : "panel"; }

  function planner() { return CS.visual && typeof CS.visual.plan === "function" ? CS.visual.plan : null; }

  function kinds() {
    var art = (CS.visual && CS.visual.art && CS.visual.art.caps && CS.visual.art.caps().art) || {};
    return KINDS.filter(function (k) { return k === "auto" || k === "none" || art[k]; });
  }

  /** `o` with `p` over it; undefined or "" drops a key (except `keep`). */
  function merge(o, p, keep) {
    var r = Object.assign({}, o, p);
    Object.keys(p).forEach(function (k) { if ((p[k] === undefined || p[k] === "") && k !== keep) delete r[k]; });
    return r;
  }

  /** Form edits preserve the caret and run text QA. */
  function put(ctx, id, patch) {
    ctx.setSlide(id, patch, { origin: "form" });
    if (ctx.runTextQa) ctx.runTextQa();
  }

  function anchor(ctx, id, patch) {
    var v = (ctx.slide(id) || {}).visual || {};
    put(ctx, id, { visual: merge(v, { anchor: merge(v.anchor, patch) }) });
  }

  function box(label, value, max, ltr, onChange) {
    var el = h("input", {
      class: "ui-input", type: "text", maxlength: max, dir: ltr ? "ltr" : null, placeholder: label, "aria-label": label,
      onchange: function () { onChange(el, U.cleanText(el.value)); }
    });
    el.value = value == null ? "" : String(value);
    return el;
  }

  function digits(x) {
    return String(x).replace(/[٠-٩٫٬]/g, function (d) { return d === "٫" ? "." : d === "٬" ? "," : d.charCodeAt(0) - 0x660; }).trim();
  }

  function cfg(ctx) { return (ctx.plugin && ctx.plugin.visual) || {}; }

  /** limit = [group, key] into plugin.visual.words. */
  function text(ctx, label, field, i, max, limit, get, commit) {
    var n = limit && ((cfg(ctx).words || {})[limit[0]] || {})[limit[1]];
    return U.textEditor(ctx, { label: label, field: field, index: i, max: max, rows: 1, limit: n ? { soft: n } : null, getValue: get, commit: commit });
  }

  /** Invalid number: show err and preserve the value. */
  function numBox(label, value, max, err, commit) {
    return box(label, value, max, true, function (el, x) {
      x = digits(x);
      err.hidden = !x || /^(\d{1,3}(,\d{3})+|\d+)(\.\d+)?$/.test(x);
      if (err.hidden) { el.value = x; commit(x); }
    });
  }

  function source(ctx, s) {
    var list = (ctx.spec.sources || []).map(function (x) { return { value: x.id, label: x.id + (x.excerpt ? " · " + String(x.excerpt).slice(0, 36) : "") }; });
    return U.selectBox([{ value: "", label: t("edit.source.none") }].concat(list), (s.sourceIds || [])[0] || "",
      function (v) { put(ctx, s.id, { sourceIds: v ? [v] : undefined }); }, t("edit.source"));
  }

  /** Plan seeds; other slides stay locked. Pin keeps the chosen kind. */
  function plan(ctx, seeds, pin) {
    var P = planner(), ids = Object.keys(seeds), out = {}, res = null;
    if (!ids.length) return 0;
    if (P) {
      var work = Object.assign({}, ctx.spec, { slides: ctx.spec.slides.map(function (s) {
        var w = Object.assign({}, s), k = seeds[s.id];
        if (k === undefined) w.visual = Object.assign({}, s.visual, { lock: true });
        else if (k) w.visual = k; else delete w.visual;
        return w;
      }) });
      res = U.guard("plan", function () { return P(work, ctx.brand, ctx.preset(), null, { caps: CS.visual.caps && CS.visual.caps() }); }, null);
    }
    ((res && res.slides) || []).forEach(function (r) { if (r.visual && seeds[r.id] !== undefined) out[r.id] = r.visual; });
    ids.forEach(function (id) {
      var v = out[id], seed = seeds[id];
      if (pin && seed && (!v || !v.anchor || v.anchor.kind !== seed.anchor.kind)) out[id] = seed;
    });
    var done = Object.keys(out), planV = res && res.style && res.style.planV;
    if (!done.length) return 0;
    ctx.commit(function (sp) {
      var next = Object.assign({}, sp, { slides: sp.slides.map(function (s) { return out[s.id] ? Object.assign({}, s, { visual: out[s.id] }) : s; }) });
      if (planV) next.style = Object.assign({}, sp.style, { planV: planV });
      return next;
    }, { origin: "visual", path: "/slides", slides: done });
    return done.length;
  }

  /** A level-2 pick preserves recipe, tone and marks (spec 5.6). */
  function choose(ctx, id, kind) {
    var s = ctx.slide(id), v = (s && s.visual) || {}, a = v.anchor || {}, n = { kind: kind }, seeds = {};
    if (!s || kind === a.kind || (kind === "auto" && !v.anchor)) return 0;
    (OWN[kind] || "").split(" ").forEach(function (k) { if (a[k] !== undefined) n[k] = a[k]; });
    seeds[id] = merge(v, { anchor: kind === "auto" ? "" : n, why: "", alt: "", relax: "", rowIcons: kind === "rows" ? v.rowIcons : "" });
    return plan(ctx, seeds, kind !== "auto");
  }

  function button(label, ic, action, disabled, onclick) {
    return h("button", { type: "button", class: "ui-btn ui-btn--secondary", dataset: { visAction: action }, disabled: disabled, onclick: onclick }, icon(ic), label);
  }

  function section(ctx, s) {
    if (!planner() || s.type === "cover" || CS.visual.free?.active(s)) return null;
    var id = s.id, v = s.visual || {}, a = v.anchor || {}, locked = !!v.lock, cur = a.kind || "auto";
    var held = locked || !!(s.media && s.media.assetId);   /* an own file or a lock wins */
    function run(seeds) {
      if (plan(ctx, seeds)) U.toast(t("vis.note.planned"), "ok", { action: { label: t("common.undo"), fn: function () { ctx.undo(); } } });
    }
    var chips = h("div", { class: "ui-chips ui-chips--pick", role: "group", "aria-label": t("vis.tab.kind") }, kinds().map(function (k) {
      return h("button", {
        type: "button", class: "ui-chip-btn", dataset: { kind: k }, "aria-pressed": String(k === cur), disabled: held,
        onclick: function () { choose(ctx, id, k); }
      }, t("vis.tab.kind." + k));
    }));
    /** Plan unanchored slides, or all unlocked slides. */
    function deck(again) {
      var d = {};
      ctx.slides().forEach(function (x) {
        var w = x.visual || {};
        if (x.type !== "cover" && !CS.visual.free?.active(x) && !(x.media && x.media.assetId) && !(again ? w.lock : w.anchor || w.lock)) d[x.id] = again ? null : x.visual || null;
      });
      run(d);
    }
    var actions = h("div", { class: "ui-actions-grid" },
      button(t("vis.tab.plan.slide"), "wand-sparkles", "plan-slide", held, function () { var d = {}; d[id] = null; run(d); }),
      button(t("vis.tab.plan"), "sparkles", "plan-deck", false, function () { deck(false); }),
      button(t("vis.tab.replan"), "refresh-cw", "replan", false, function () { deck(true); }));
    return U.sec(t("vis.tab.kind"), ctx.spec.style.planV ? t("vis.note.planned") + ". " + t("vis.note.planned.hint") : null, [
      chips,
      a.kind === "word" || (a.kind === "field" && /^(word|panel)$/.test(fieldType(a)))
        ? U.field(t("vis.tab.word"), box(t("vis.tab.word"), a.word, 40, ctx.isEn(), function (el, x) { anchor(ctx, id, { word: x }); })) : null,
      actions,
      h("p", { class: "ui-hint" }, t("vis.tab.replan.hint")),
      a.kind ? U.switchBox(t("vis.tab.lock"), locked, function (on) { ctx.setSlide(id, { visual: merge(ctx.slide(id).visual, { lock: on || "" }) }, { origin: "visual" }); }, t("vis.tab.lock.hint")) : null,
      locked ? U.pill(t("vis.tab.locked"), "info", "lock") : null
    ]);
  }

  V.fieldType = fieldType;
  V.merge = merge; V.put = put; V.anchor = anchor; V.box = box; V.cfg = cfg; V.text = text; V.numBox = numBox;
  V.source = source; V.plan = plan;
  (U.panels.visual = U.panels.visual || {}).plan = section;
})();

  /* ---- file: editors.js ---- */
/* src/visual-ui/editors.js - owned by U2a - items and demo editors (text surfaces; `items` unlocks grid and timeline in the Studio),
 * numeral and chart editors (Visual tab). Helpers come from panel.js. */
(function () {
  var V = CS.vui, U = CS.ui && CS.ui._;
  if (!U || !V || !V.merge) return;
  var h = U.h, t = U.t, icon = U.icon, merge = V.merge, put = V.put, box = V.box, text = V.text, numBox = V.numBox, conf = V.cfg;
  function narrow(el) { el.style.flex = "0 0 30%"; return el; }
  function errNode() { return h("p", { class: "ui-hint ui-hint--bad", hidden: true }, t("edit.number.invalid")); }
  var DEMO_TYPES = ["step", "story-beat", "setup", "share", "testimonial", "cta", "quote"];

  /** The icon for what was typed: a pack name, else the best lookup hit, else null. */
  function iconName(ctx, x) {
    var I = CS.visual && CS.visual.icons, d = ctx.spec.locale.dialect;
    x = String(x || "").trim().toLowerCase();
    if (!x) return "";
    if (!I) return /^[a-z0-9-]+$/.test(x) ? x : null;
    return U.guard("icon lookup", function () {
      var hit = I.has(x) ? { name: x } : I.find(x, { dialect: d.replace(/^(lev|msa).*/, "$1"), k: 1 })[0];
      return hit ? hit.name : null;
    }, null);
  }

  /** Rows with add, remove and reorder; a row edits through edit(patch), structure changes rebuild. cfg.req: the key a row keeps. */
  function listEditor(cfg) {
    var wrap = h("div", { class: "ui-field ui-field--group" });
    function commit(list) { cfg.set(list); build(); }
    function ctl(ic, label, disabled, fn) {
      return h("button", { type: "button", class: "ui-btn ui-btn--icon ui-btn--ghost ui-btn--xs", "aria-label": t(label), disabled: disabled, onclick: fn }, icon(ic));
    }
    function build() {
      var list = cfg.get(), n = list.length, tail = cfg.after && cfg.after();
      U.clear(wrap);
      wrap.appendChild(h("div", { class: "ui-field-head" }, h("span", { class: "ui-label" }, cfg.title),
        h("span", { class: "ui-hint" + (n < cfg.min || n > cfg.max ? " ui-hint--bad" : ""), html: U.bidi(t(cfg.count, { n: n, max: cfg.max })) })));
      if (cfg.hint) wrap.appendChild(h("p", { class: "ui-hint" }, cfg.hint));
      list.forEach(function (item, i) {
        function edit(patch) {
          var l = cfg.get().slice();
          l[i] = merge(l[i], patch, cfg.req);
          cfg.set(l);
        }
        function move(d) { var l = cfg.get().slice(), x = l[i]; l[i] = l[i + d]; l[i + d] = x; commit(l); }
        wrap.appendChild(h("div", { class: "ui-bullet-edit" }, cfg.row(item, i, edit), h("div", { class: "ui-bullet-ctl" },
          ctl("arrow-up", "common.move-up", i === 0, function () { move(-1); }),
          ctl("arrow-down", "common.move-down", i === n - 1, function () { move(1); }),
          ctl("trash-2", "common.delete", false, function () { var l = cfg.get().slice(); l.splice(i, 1); commit(l); }))));
      });
      wrap.appendChild(h("button", {
        type: "button", class: "ui-btn ui-btn--ghost ui-btn--sm", dataset: { visAction: "add" }, disabled: n >= cfg.max,
        onclick: function () { var l = cfg.get(); commit(l.concat([cfg.blank(l)])); }
      }, icon("plus"), cfg.add));
      if (tail) wrap.appendChild(tail);
    }
    build();
    return wrap;
  }

  /** grid, timeline and rows read slide.items. */
  function items(ctx, s) {
    var id = s.id, a = s.visual && s.visual.anchor, valid = (conf(ctx).plan || {}).valid || {}, range = (valid.itemsByType || {})[s.type] || [0, valid.itemsMax || 6];
    if (s.type !== "grid" && s.type !== "timeline" && !(s.items || []).length && !(a && a.kind === "rows")) return null;
    function cur() { return (ctx.slide(id) || {}).items || []; }
    function field(i, k) { return function () { return (cur()[i] || {})[k]; }; }
    return listEditor({
      title: t("vis.items.title"), add: t("vis.items.add"), count: "vis.items.count", min: range[0], max: range[1], req: "title",
      get: cur, set: function (l) { put(ctx, id, { items: l.length ? l : undefined }); }, blank: function () { return { title: "" }; },
      row: function (it, i, edit) {
        return h("div", { class: "ui-side-edit" },
          text(ctx, t("vis.items.item", { n: i + 1 }), "items", i, 40, ["art", "cardTitle"], field(i, "title"), function (x) { edit({ title: x }); }),
          text(ctx, t("field.side-text"), "items-text", i, 80, ["art", "cardText"], field(i, "text"), function (x) { edit({ text: x }); }),
          h("div", { class: "ui-row" },
            narrow(box(t("vis.items.value"), it.value, 12, true, function (el, x) { edit({ value: x }); })),
            box(t("vis.items.icon"), it.icon, 48, true, function (el, x) {
              var n = iconName(ctx, x);
              el.setAttribute("aria-invalid", String(n === null));
              if (n !== null) { el.value = n; edit({ icon: n }); }
            })));
      }
    });
  }

  /** The words of a chat or notes mock: up to three lines, me or them, and a caption. */
  function demo(ctx, s) {
    var id = s.id, a = s.visual && s.visual.anchor, dm = (conf(ctx).words || {}).demo || {};
    if (DEMO_TYPES.indexOf(s.type) < 0 && !s.demo && !(a && a.kind === "mock")) return null;
    function cur() { return (ctx.slide(id) || {}).demo || {}; }
    function set(patch) {
      var d = merge(cur(), patch);
      put(ctx, id, { demo: d.lines && d.lines.length ? d : undefined });
    }
    return listEditor({
      title: t("vis.demo.title"), hint: t("vis.demo.hint"), add: t("vis.demo.add"), count: "vis.demo.count", min: 1, max: dm.lines || 3, req: "text",
      get: function () { return cur().lines || []; }, set: function (l) { set({ lines: l }); },
      blank: function (l) { return { who: l.length && l[l.length - 1].who === "me" ? "them" : "me", text: "" }; },
      row: function (ln, i, edit) {
        return h("div", { class: "ui-side-edit" },
          U.segmented([{ value: "me", label: t("vis.demo.me") }, { value: "them", label: t("vis.demo.them") }], ln.who || "", function (w) { edit({ who: w }); }),
          text(ctx, t("vis.demo.title") + " " + (i + 1), "demo", i, 90, ["demo", "lineWords"], function () { return ((cur().lines || [])[i] || {}).text; }, function (x) { edit({ text: x }); }));
      },
      after: function () {
        return (cur().lines || []).length
          ? text(ctx, t("vis.demo.caption"), "demo-caption", undefined, 60, ["demo", "captionWords"], function () { return cur().caption; }, function (x) { set({ caption: x }); })
          : null;
      }
    });
  }

  /** The big figure (anchor.value and unit; empty falls back to slide.number) and its source. */
  function numeral(ctx, s) {
    var id = s.id, a = (s.visual && s.visual.anchor) || {};
    if (a.kind !== "numeral" && !(a.kind === "field" && V.fieldType(a) === "numeral")) return null;
    var err = errNode(), n = s.number || {};
    var value = numBox(t("field.number"), a.value, 10, err, function (x) { V.anchor(ctx, id, { value: x }); });
    var unit = box(t("field.unit"), a.unit, 16, false, function (el, x) { V.anchor(ctx, id, { unit: x }); });
    value.placeholder = n.value || value.placeholder;
    unit.placeholder = n.unit || unit.placeholder;
    return U.sec(t("vis.numeral.title"), t("vis.numeral.hint"), [h("div", { class: "ui-row" }, value, unit), err, U.field(t("edit.source"), V.source(ctx, s))]);
  }

  /** Chart values, source, and the illustrative switch for figures without one. */
  function chart(ctx, s) {
    var id = s.id, a = (s.visual && s.visual.anchor) || {};
    if (a.kind !== "chart") return null;
    var err = errNode(), range = ((((conf(ctx).plan || {}).valid || {}).chartValues) || {})["bars-h"] || [1, 7];
    function cur() { return (((ctx.slide(id) || {}).visual || {}).anchor || {}).chart || {}; }
    function set(patch) {
      var c = merge(Object.assign({ kind: "bars-h" }, cur()), patch);
      V.anchor(ctx, id, { chart: c.values && c.values.length ? c : undefined });
    }
    return listEditor({
      title: t("vis.chart.title"), add: t("vis.chart.add"), count: "vis.chart.count", min: range[0], max: range[1], req: "label",
      get: function () { return cur().values || []; }, set: function (l) { set({ values: l }); }, blank: function () { return { label: "", value: 0 }; },
      row: function (v, i, edit) {
        return h("div", { class: "ui-side-edit" },
          text(ctx, t("vis.chart.label"), "chart", i, 24, ["art", "chartLabel"], function () { return ((cur().values || [])[i] || {}).label; }, function (x) { edit({ label: x }); }),
          numBox(t("vis.chart.value"), v.value, 12, err, function (x) { edit({ value: Number(x.replace(/,/g, "")) || 0 }); }));
      },
      after: function () {
        return h("div", { class: "ui-side-edit" }, err,
          U.field(t("vis.chart.source"), V.source(ctx, ctx.slide(id)), t("vis.chart.source.hint")),
          (cur().values || []).length ? U.switchBox(t("vis.chart.illustrative"), !!cur().illustrative, function (on) { set({ illustrative: on ? true : undefined }); }) : null);
      }
    });
  }

  U.editors.items = items;
  U.editors.demo = demo;
  U.panels.visual = U.panels.visual || {};
  U.panels.visual.numeral = numeral;
  U.panels.visual.chart = chart;
})();

  /* ---- file: picker.js ---- */
/* src/visual-ui/picker.js - owned by U2 - stub */

  /* ---- file: bake.js ---- */
/* src/visual-ui/bake.js - owned by U2 - stub */

  /* ---- file: remix-ui.js ---- */
/* src/visual-ui/remix-ui.js - owned by U4 - stub */

  /* ---- file: strip.js ---- */
/* src/visual-ui/strip.js - owned by U4 - stub */

  /* ---- file: free.js ---- */
/* Free slides reuse the Studio slot editors; literal edits rewrite the sanitized source tree. */
(function () {
  var U = CS.ui?._; if (!U) return;
  var V = CS.vui = CS.vui || {};
  V.commitFree = function (ctx, slide, slot, text) {
    var F = CS.visual.free, field = slot.field || "", path = field.split(".");
    if (field.startsWith("free-edit.")) {
      var html = F.edit(slide.free.html, path[1], text);
      if (html === slide.free.html) return false;
      ctx.setSlide(slide.id, { free: Object.assign({}, slide.free, { html: html }) }, { origin: "inplace" });
    } else {
      if (!F.field(field) || F.value(slide, field) === text) return false;
      // number is the established value/unit block; editing the displayed value keeps the unit separate.
      if (field === "number" && typeof slide.number === "object") {
        var unit = slide.number.unit || "", val = unit && text.endsWith(" " + unit) ? text.slice(0, -unit.length - 1) : text;
        ctx.setSlide(slide.id, { number: Object.assign({}, slide.number, { value: val }) }, { origin: "inplace" });
      } else {
        var key = path.shift(), patch = {};
        patch[key] = path.length ? U.setPath(slide[key], path.map(function (p) { return /^\d+$/.test(p) ? +p : p; }), text) : text;
        ctx.setSlide(slide.id, patch, { origin: "inplace" });
      }
    }
    ctx.runTextQa(); return true;
  };
  (U.panels.slide = U.panels.slide || []).push(function (ctx, s) {
    if (!CS.visual.free.active(s)) return null;
    return U.sec("تصميم حر", null, U.h("button", { type: "button", class: "ui-btn ui-btn--secondary", "data-free-reset": "", onclick: function () {
      ctx.setSlide(s.id, { free: undefined }, { origin: "visual" }); ctx.runTextQa();
    } }, "رجّع للتصميم التلقائي"));
  });
})();
})();
