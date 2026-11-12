/* ui/editors.js · form editors for one slide's text fields, shared by the Script screen and the Design "Text" tab.
 * Every editor commits on change (blur), so one edit is one undo step. Word meters update while typing. */

function cleanText(s) {
  return String(s === undefined || s === null ? "" : s).normalize("NFC")
    .replace(/[\u200E\u200F]/g, "").replace(/\r/g, "")
    .replace(/[ \t\f\v\u00A0]+/g, " ").replace(/ ?\n ?/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Word limits for one field of one slide (soft = FIX, hard = BLOCK). Numbers come from platform-instagram.json. */
function fieldLimit(ctx, slide, field) {
  var p = ctx.plugin;
  if (!p) return null;
  var type = slide.type;
  if (field === "headline") {
    if (type === "cover" || type === "poster") return { soft: p.cover.heroMaxWords };
    if (type === "share") return { soft: p.text.shareMaxWords };
    if (slide.n === 2) return { soft: p.slide2.maxWords };
    return null;
  }
  if (field === "title") return { soft: p.text.titleMaxWords };
  if (field === "body") return { soft: p.text.bodyMaxWords, hard: p.text.bodyHardMaxWords };
  if (field === "bridge") return { soft: p.text.bridgeMaxWords };
  return null;
}

/** Total words of a slide and the limit that applies to it as a whole. */
function slideTotals(ctx, slide) {
  var words = 0;
  function add(s) { words += ctx.words(s); }
  ["kicker", "headline", "sub", "title", "body", "bridge", "attribution"].forEach(function (k) { if (slide[k]) add(slide[k]); });
  (slide.bullets || []).forEach(add);
  (slide.sides || []).forEach(function (s) { add(s.label); add(s.text); });
  if (slide.cta && slide.cta.text) add(slide.cta.text);
  var p = ctx.plugin, limit = null;
  if (p) {
    if (slide.type === "cover") limit = p.cover.totalMaxWords;
    else if (slide.n === 2) limit = p.slide2.maxWords;
    else if (p.text.denseTypes.indexOf(slide.type) >= 0) limit = p.text.denseMaxWords;
    else limit = p.text.slideMaxWords;
  }
  return { words: words, limit: limit };
}

function autosize(ta) {
  ta.style.height = "auto";
  ta.style.height = Math.min(ta.scrollHeight + 2, 260) + "px";
}

/** Toggle the ==emphasis== span on the selected words (or the word at the caret) of a textarea. Returns the new value. */
function toggleEmphasis(ta) {
  var v = ta.value;
  if (v.indexOf("==") >= 0) return v.replace(/==/g, "");
  var a = ta.selectionStart, b = ta.selectionEnd;
  if (a === b) {
    while (a > 0 && !/\s/.test(v.charAt(a - 1))) a--;
    while (b < v.length && !/\s/.test(v.charAt(b))) b++;
  } else {
    while (a > 0 && !/\s/.test(v.charAt(a - 1)) && a < ta.selectionStart) a--;
    while (/\s/.test(v.charAt(a)) && a < b) a++;
    while (b > a && /\s/.test(v.charAt(b - 1))) b--;
  }
  if (a >= b) return v;
  return v.slice(0, a) + "==" + v.slice(a, b) + "==" + v.slice(b);
}

/** One multi-line text editor. opts: {label, field, index, getValue, commit(value), limit, emphasis, rows} */
function textEditor(ctx, o) {
  var id = uid("f");
  var ta = h("textarea", {
    class: "ui-input ui-text", id: id, rows: o.rows || 1, maxlength: o.max || 400, spellcheck: "false",
    dir: ctx.isEn() ? "ltr" : "rtl", lang: ctx.isEn() ? "en" : "ar", "aria-label": o.label,
    dataset: { field: o.field, index: o.index === undefined ? "" : o.index }
  });
  ta.value = o.getValue() || "";
  var meterHost = h("span", { class: "ui-meter-host" });
  function paintMeter() {
    clear(meterHost);
    var plain = (o.coverHero && CS.qa && typeof CS.qa.splitCover === "function" ? CS.qa.splitCover(ta.value).hero : ta.value).replace(/==/g, "");
    var n = ctx.words(plain);
    if (o.limit || n) meterHost.appendChild(meter(n, o.limit && o.limit.soft, o.limit && o.limit.hard));
  }
  ta.addEventListener("input", function () { autosize(ta); paintMeter(); });
  ta.addEventListener("change", function () { o.commit(cleanText(ta.value)); });
  ta.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !o.multiline && !e.shiftKey) { e.preventDefault(); ta.blur(); }
  });
  requestAnimationFrame(function () { autosize(ta); });
  paintMeter();
  var tools = h("div", { class: "ui-field-tools" }, meterHost);
  if (o.emphasis) {
    tools.insertBefore(h("button", {
      type: "button", class: "ui-btn ui-btn--ghost ui-btn--xs", title: t("edit.emphasis.hint"),
      onclick: function () { ta.value = toggleEmphasis(ta); autosize(ta); paintMeter(); ta.dispatchEvent(new Event("change")); }
    }, icon("highlighter"), t("edit.emphasis")), meterHost);
  }
  var wrap = h("div", { class: "ui-field" },
    h("div", { class: "ui-field-head" }, h("label", { class: "ui-label", for: id }, o.label), tools), ta);
  wrap.focusInput = function () { ta.focus(); };
  return wrap;
}

function selectBox(options, value, onChange, label) {
  var sel = h("select", { class: "ui-input ui-select", "aria-label": label || null, onchange: function () { onChange(sel.value); } },
    options.map(function (o) { return h("option", { value: o.value, selected: String(o.value) === String(value) }, o.label); }));
  return sel;
}

var CTA_KINDS = ["save", "send", "question", "keyword-dm", "follow"];

/** All editors of a slide as an array of field groups, in reading order. */
function slideEditors(ctx, slide, o) {
  o = o || {};
  var out = [];
  var id = slide.id;
  var fields = FIELDS_BY_TYPE[slide.type] || [];
  fields.forEach(function (f) {
    if (f === "number") out.push(numberEditor(ctx, slide));
    else if (f === "sides") out.push(sidesEditor(ctx, slide));
    else if (f === "bullets") out.push(bulletsEditor(ctx, slide));
    else if (f === "cta") out.push(ctaEditor(ctx, slide));
    else {
      out.push(textEditor(ctx, {
        label: t("field." + f), field: f, limit: fieldLimit(ctx, slide, f), emphasis: f === "headline" || f === "title" || f === "body" || f === "sub",
        coverHero: f === "headline" && (slide.type === "cover" || slide.type === "poster"),
        multiline: f === "headline", rows: f === "body" ? 2 : 1, max: f === "body" ? 400 : f === "headline" || f === "sub" ? 240 : 160,
        getValue: function () { return (ctx.slide(id) || {})[f]; },
        commit: function (v) { ctx.setField(id, f, v, undefined, { origin: o.origin || "form" }); ctx.runTextQa(); }
      }));
    }
  });
  runExtensions({ appendChild: function (node) { out.push(node); } }, CS.ui._.editors, ctx, slide, o);
  return out;
}

function numberEditor(ctx, slide) {
  var id = slide.id;
  var num = slide.number || { value: "" };
  var vId = uid("n");
  var err = h("p", { class: "ui-hint ui-hint--bad", hidden: true }, t("edit.number.invalid"));
  var val = h("input", {
    class: "ui-input ui-num", id: vId, type: "text", inputmode: "decimal", dir: "ltr", maxlength: 16, "aria-label": t("field.number"),
    onchange: function () {
      var v = val.value.trim().replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 0x660); });
      if (!/^[0-9]+(\.[0-9]+)?$/.test(v)) { err.hidden = false; return; }
      err.hidden = true;
      ctx.setSlide(id, { number: Object.assign({}, (ctx.slide(id) || {}).number, { value: v }) }, { origin: "form" });
      ctx.runTextQa();
    }
  });
  val.value = num.value || "";
  var unit = h("input", {
    class: "ui-input", type: "text", maxlength: 16, "aria-label": t("field.unit"), placeholder: t("field.unit"),
    onchange: function () {
      var u = cleanText(unit.value);
      var cur = Object.assign({}, (ctx.slide(id) || {}).number);
      if (u) cur.unit = u; else delete cur.unit;
      ctx.setSlide(id, { number: cur }, { origin: "form" });
    }
  });
  unit.value = num.unit || "";
  var sources = ctx.spec.sources || [];
  var src = selectBox(
    [{ value: "", label: t("edit.source.none") }].concat(sources.map(function (s) { return { value: s.id, label: s.id + (s.excerpt ? " · " + String(s.excerpt).slice(0, 36) : "") }; })),
    (slide.sourceIds || [])[0] || "",
    function (v) { ctx.setSlide(id, { sourceIds: v ? [v] : undefined }, { origin: "form" }); ctx.runTextQa(); },
    t("edit.source"));
  return h("div", { class: "ui-field ui-field--group" },
    h("div", { class: "ui-field-head" }, h("label", { class: "ui-label", for: vId }, t("field.number"))),
    h("div", { class: "ui-row" }, val, unit), err,
    h("div", { class: "ui-field-head" }, h("span", { class: "ui-label" }, t("edit.source"))), src);
}

function sidesEditor(ctx, slide) {
  var id = slide.id;
  var wrap = h("div", { class: "ui-field ui-field--group" }, h("div", { class: "ui-field-head" }, h("span", { class: "ui-label" }, t("field.sides"))));
  (slide.sides || [{ text: "" }, { text: "" }]).forEach(function (side, i) {
    var label = h("input", {
      class: "ui-input", type: "text", maxlength: 40, placeholder: t("field.side-label"), "aria-label": t("field.side-label") + " " + (i + 1),
      onchange: function () { commitSide(i, { label: cleanText(label.value) || undefined }); }
    });
    label.value = side.label || "";
    wrap.appendChild(h("div", { class: "ui-side-edit" },
      label,
      textEditor(ctx, {
        label: t("field.side-text") + " " + (i + 1), field: "sides", index: i, max: 240, rows: 2,
        getValue: function () { return (((ctx.slide(id) || {}).sides || [])[i] || {}).text; },
        commit: function (v) { commitSide(i, { text: v }); }
      })));
  });
  function commitSide(i, patch) {
    var cur = ((ctx.slide(id) || {}).sides || [{ text: "" }, { text: "" }]).map(function (s) { return Object.assign({}, s); });
    cur[i] = Object.assign({}, cur[i], patch);
    if (cur[i].label === undefined) delete cur[i].label;
    ctx.setSlide(id, { sides: cur }, { origin: "form" });
    ctx.runTextQa();
  }
  return wrap;
}

function bulletsEditor(ctx, slide) {
  var id = slide.id;
  var dense = ctx.plugin && ctx.plugin.text.denseTypes.indexOf(slide.type) >= 0;
  var max = ctx.plugin ? (dense ? ctx.plugin.text.denseBulletsMax : ctx.plugin.text.bulletsMax) : 8;
  var wrap = h("div", { class: "ui-field ui-field--group" });
  function rebuild() {
    clear(wrap);
    var cur = (ctx.slide(id) || {}).bullets || [];
    wrap.appendChild(h("div", { class: "ui-field-head" }, h("span", { class: "ui-label" }, t("field.bullets")), meter(cur.length, max, 8)));
    cur.forEach(function (b, i) {
      wrap.appendChild(h("div", { class: "ui-bullet-edit" },
        textEditor(ctx, {
          label: t("field.bullet") + " " + (i + 1), field: "bullets", index: i, max: 200, rows: 1,
          getValue: function () { return ((ctx.slide(id) || {}).bullets || [])[i]; },
          commit: function (v) {
            var list = ((ctx.slide(id) || {}).bullets || []).slice();
            if (!v) list.splice(i, 1); else list[i] = v;
            ctx.setSlide(id, { bullets: list.length ? list : [""] }, { origin: "form" });
            ctx.runTextQa();
            rebuild();
          }
        }),
        h("div", { class: "ui-bullet-ctl" },
          h("button", { type: "button", class: "ui-btn ui-btn--icon ui-btn--ghost ui-btn--xs", "aria-label": t("common.move-up"), disabled: i === 0, onclick: function () { moveBullet(i, -1); } }, icon("arrow-up")),
          h("button", { type: "button", class: "ui-btn ui-btn--icon ui-btn--ghost ui-btn--xs", "aria-label": t("common.move-down"), disabled: i === cur.length - 1, onclick: function () { moveBullet(i, 1); } }, icon("arrow-down")),
          h("button", { type: "button", class: "ui-btn ui-btn--icon ui-btn--ghost ui-btn--xs", "aria-label": t("common.delete"), disabled: cur.length <= 1, onclick: function () { removeBullet(i); } }, icon("trash-2")))));
    });
    wrap.appendChild(h("button", {
      type: "button", class: "ui-btn ui-btn--ghost ui-btn--sm", disabled: cur.length >= 8,
      onclick: function () { ctx.setSlide(id, { bullets: cur.concat([""]) }, { origin: "form" }); rebuild(); var last = wrap.querySelectorAll("textarea"); if (last.length) last[last.length - 1].focus(); }
    }, icon("plus"), t("edit.bullet.add")));
  }
  function moveBullet(i, d) {
    var list = ((ctx.slide(id) || {}).bullets || []).slice();
    var j = i + d;
    if (j < 0 || j >= list.length) return;
    var x = list[i]; list[i] = list[j]; list[j] = x;
    ctx.setSlide(id, { bullets: list }, { origin: "form" });
    rebuild();
  }
  function removeBullet(i) {
    var list = ((ctx.slide(id) || {}).bullets || []).slice();
    list.splice(i, 1);
    ctx.setSlide(id, { bullets: list.length ? list : [""] }, { origin: "form" });
    ctx.runTextQa();
    rebuild();
  }
  rebuild();
  return wrap;
}

function ctaEditor(ctx, slide) {
  var id = slide.id;
  var cur = slide.cta || { kind: "save", text: "" };
  var kind = selectBox(CTA_KINDS.map(function (k) { return { value: k, label: t("cta.kind." + k) }; }), cur.kind, function (v) {
    ctx.setSlide(id, { cta: Object.assign({}, (ctx.slide(id) || {}).cta || { text: "" }, { kind: v }) }, { origin: "form" });
    ctx.runTextQa();
  }, t("field.cta-kind"));
  return h("div", { class: "ui-field ui-field--group" },
    h("div", { class: "ui-field-head" }, h("span", { class: "ui-label" }, t("field.cta"))),
    kind,
    textEditor(ctx, {
      label: t("field.cta-text"), field: "cta", max: 160, rows: 1,
      limit: ctx.plugin ? { soft: ctx.plugin.text.ctaMaxWords } : null,
      getValue: function () { return ((ctx.slide(id) || {}).cta || {}).text; },
      commit: function (v) {
        ctx.setSlide(id, { cta: Object.assign({ kind: "save" }, (ctx.slide(id) || {}).cta, { text: v }) }, { origin: "form" });
        ctx.runTextQa();
      }
    }));
}
