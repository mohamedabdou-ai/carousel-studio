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
