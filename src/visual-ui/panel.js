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
