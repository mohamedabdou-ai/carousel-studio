/* ui/design-tabs.js · the four tabs of the Design panel: Style, Text, Visual, Slide. */

function sec(title, hint, children, cls) {
  return h("section", { class: "ui-sec" + (cls ? " " + cls : "") },
    h("header", { class: "ui-sec-head" }, h("h3", { class: "ui-h3" }, title), hint ? h("p", { class: "ui-hint", html: bidi(hint) }) : null),
    children);
}

function swatch(hex, label, active, disabled, onPick) {
  return h("button", {
    type: "button", class: "ui-swatch" + (active ? " is-active" : ""), style: { background: hex }, disabled: !!disabled,
    "aria-pressed": String(!!active), "aria-label": label + " " + hex, title: label, onclick: onPick
  }, active ? icon("check") : null);
}

function lockedByBrand(ctx, path) {
  return !!(ctx.brand && ctx.brand.visual && (ctx.brand.visual.locks || []).indexOf(path) >= 0);
}

function radioCards(options, value, onPick, cls) {
  var wrap = h("div", { class: "ui-radios" + (cls ? " " + cls : ""), role: "radiogroup" });
  options.forEach(function (o) {
    wrap.appendChild(h("button", {
      type: "button", role: "radio", class: "ui-radio", "aria-checked": String(o.value === value), disabled: !!o.disabled, dataset: { value: o.value },
      onclick: function () { onPick(o.value); }
    }, h("span", { class: "ui-radio-dot", "aria-hidden": "true" }), h("span", { class: "ui-radio-body" }, h("strong", { html: bidi(o.label) }), o.sub ? h("small", { html: bidi(o.sub) }) : null)));
  });
  return wrap;
}

/* ---- Style ------------------------------------------------------------------------------------------------------ */
function StyleTab(ctx) {
  var el = h("div", { class: "ui-tabpanel" });

  function presetGallery() {
    var grid = h("div", { class: "ui-presets" });
    var current = String(ctx.spec.style.presetId).split("@")[0];
    var c = ctx.canvas();
    var cover = ctx.slides()[0];
    var sig = [cover && cover.headline, cover && cover.kicker, cover && cover.sub, ctx.spec.locale.dialect, ctx.spec.locale.digits, ctx.spec.style.occasionId || "", ctx.spec.style.metaLabel || "", ctx.spec.rev].join("|");
    ctx.presets().forEach(function (p) {
      var f = makeFrame(c.w, c.h, "ui-preset-frame is-loading");
      var btn = h("button", {
        type: "button", class: "ui-preset", dataset: { preset: p.id }, "aria-pressed": String(p.id === current),
        onclick: function () { ctx.applyPreset(p.id); }
      }, f.frame, h("span", { class: "ui-preset-name" }, msgOf(p.name), p.id === current ? icon("check") : null), h("span", { class: "ui-preset-desc" }, msgOf(p.description)));
      grid.appendChild(btn);
      var variant = Object.assign({}, ctx.spec, { style: { presetId: p.id + "@" + p.version, occasionId: ctx.spec.style.occasionId, metaLabel: ctx.spec.style.metaLabel } });
      if (!variant.style.occasionId) delete variant.style.occasionId;
      if (!variant.style.metaLabel) delete variant.style.metaLabel;
      ctx.renderVariant(p.id + "|" + sig, variant, 0).then(function (node) {
        if (!f.frame.isConnected) return;
        f.inner.appendChild(node.cloneNode(true));
        f.frame.classList.remove("is-loading");
      }, function (e) { reportError("preset thumb", e); f.frame.classList.remove("is-loading"); f.frame.classList.add("is-failed"); });
    });
    return sec(t("style.presets"), t("style.presets.hint"), grid);
  }

  function accentSection() {
    var tokens = ctx.tokens;
    var current = tokens && tokens.roles ? tokens.roles.accent : null;
    var locked = lockedByBrand(ctx, "roles.accent");
    var preset = ctx.preset();
    var choices = [];
    function add(hex, label) { if (hex && !choices.some(function (c0) { return c0.hex.toLowerCase() === hex.toLowerCase(); })) choices.push({ hex: hex, label: label }); }
    if (preset && preset.roles) add(preset.roles.accent, t("style.accent.preset"));
    var pal = ctx.brand && ctx.brand.visual && ctx.brand.visual.palette;
    if (pal) { add(pal.accent, t("style.accent.brand")); add(pal.accent2, t("style.accent.brand2")); add(pal.ink, t("style.accent.ink")); }
    var row = h("div", { class: "ui-swatches" });
    var override = (ctx.spec.style.overrides || {})["roles.accent"];
    choices.forEach(function (ch) {
      row.appendChild(swatch(ch.hex, ch.label, current && current.toLowerCase() === ch.hex.toLowerCase(), locked, function () {
        ctx.setOverride("roles.accent", preset && preset.roles && preset.roles.accent.toLowerCase() === ch.hex.toLowerCase() ? null : ch.hex);
      }));
    });
    var pick = h("input", { type: "color", class: "ui-color", "aria-label": t("style.accent.custom"), disabled: locked, value: /^#[0-9a-f]{6}$/i.test(current || "") ? current : "#0b6b52" });
    pick.addEventListener("change", function () { ctx.setOverride("roles.accent", pick.value.toUpperCase()); });
    row.appendChild(h("label", { class: "ui-swatch ui-swatch--custom", title: t("style.accent.custom") }, icon("palette"), pick));
    var why = h("button", {
      type: "button", class: "ui-link", onclick: function () { explainColor("roles.accent"); }
    }, icon("circle-help"), t("style.accent.why"));
    return sec(t("style.accent"), locked ? t("style.accent.locked") : null, [row,
      h("div", { class: "ui-row ui-row--between" }, override ? h("button", { type: "button", class: "ui-link", onclick: function () { ctx.setOverride("roles.accent", null); } }, icon("rotate-ccw"), t("style.accent.reset")) : h("span"), why)]);
  }

  async function explainColor(path) {
    var ex = ctx.explainColor(path);
    var tokens = ctx.tokens;
    var adj = ((tokens && tokens.adjustments) || []).filter(function (a) { return a.path.indexOf("roles.") === 0 || a.reason === "contrast"; });
    var body = h("div", { class: "ui-dialog-body" });
    if (ex) {
      body.appendChild(h("p", { class: "ui-dialog-text", html: bidi(msgOf(ex.msg) || "") }));
      if (ex.steps && ex.steps.length) body.appendChild(h("ol", { class: "ui-steps" }, ex.steps.map(function (s) { return h("li", { html: bidi(s) }); })));
    }
    if (adj.length) {
      body.appendChild(h("p", { class: "ui-label" }, t("style.accent.adjusted")));
      body.appendChild(h("ul", { class: "ui-steps" }, adj.map(function (a) { return h("li", { html: bidi(msgOf(a.msg) || (a.path + ": " + a.from + " → " + a.to)) }); })));
    }
    if (!ex && !adj.length) body.appendChild(h("p", { class: "ui-dialog-text" }, t("style.accent.why.none")));
    await dialog({ title: t("style.accent.why"), body: body, actions: [{ label: t("common.close"), value: true, kind: "primary" }] });
  }

  var FONT_PATHS = ["type.display.family", "type.heading.family", "type.body.family", "type.latin.family"];

  function fontSection() {
    var reg = CS.core && CS.core.registry;
    if (!reg) return null;
    var families = guard("fonts", function () { return reg.fontIds().map(function (id) { return reg.fontEntry(id); }); }, []);
    var current = String(ctx.spec.style.presetId).split("@")[0];
    var ty = (ctx.preset() || {}).type || {};
    var own = { display: ty.display && ty.display.family, body: ty.body && ty.body.family, latin: ty.latin && ty.latin.family };
    var pairs = fontPairings(families, own, current, false);
    if (pairs.length < 2) return null;
    var ov = ctx.spec.style.overrides || {};
    var locked = FONT_PATHS.some(function (p) { return lockedByBrand(ctx, p); });
    var cover = ctx.slides()[0] || {};
    var hook = guard("stripMarkup", function () { return CS.core.text.stripMarkup(cover.headline || ""); }, cover.headline || "") || t("bb.font.body-sample");
    var picked = ov["type.display.family"] || own.display;
    var grid = h("div", { class: "ui-fontpairs", role: "group", "aria-label": t("style.fonts") });
    function fam(id) { var f = reg.fontEntry(id); return f ? f.family : id; }
    pairs.forEach(function (p, i) {
      var isOwn = p.display === own.display && p.body === own.body;
      grid.appendChild(h("button", {
        type: "button", class: "ui-fontpair", disabled: locked, "aria-pressed": String(p.display === picked), dataset: { display: p.display },
        onclick: function () {
          var map = {};
          FONT_PATHS.forEach(function (path) { map[path] = null; });
          if (!isOwn) { map["type.display.family"] = p.display; map["type.heading.family"] = p.display; map["type.body.family"] = p.body; map["type.latin.family"] = p.latin; }
          ctx.setOverrides(map);
        }
      }, h("span", { class: "ui-fontpair-hook", style: { fontFamily: reg.fontCss(p.display) } }, hook),
      h("span", { class: "ui-fontpair-body", style: { fontFamily: reg.fontCss(p.body) } }, cover.sub || t("bb.font.body-sample")),
      h("span", { class: "ui-fontpair-name" }, h("bdi", { dir: "ltr" }, fam(p.display) + " + " + fam(p.body)), isOwn ? h("em", {}, t("style.fonts.own")) : null)));
    });
    var reset = FONT_PATHS.some(function (p) { return ov[p]; }) ? h("button", { type: "button", class: "ui-link", onclick: function () { var map = {}; FONT_PATHS.forEach(function (path) { map[path] = null; }); ctx.setOverrides(map); } }, icon("rotate-ccw"), t("style.fonts.reset")) : null;
    return sec(t("style.fonts"), locked ? t("style.fonts.locked") : t("style.fonts.hint"), [grid, reset]);
  }

  function cueSection() {
    var loc = ctx.spec.locale;
    var labels = ((CS.core && CS.core.registry && guard("rules", function () { return CS.core.registry.rules(); }, null)) || {}).locale;
    function cueLabel(cue) {
      var l = labels && labels.swipeCue && labels.swipeCue.labels && labels.swipeCue.labels[cue];
      return l ? (l[loc.dialect] || l["msa-white"] || l.en) : t("cue." + cue);
    }
    var app = radioCards(["ar", "en", "mixed"].map(function (v) { return { value: v, label: t("applang." + v), sub: t("applang." + v + ".sub") }; }), loc.appLanguage, function (v) { ctx.setAppLanguage(v); }, "ui-radios--row");
    var cue = radioCards(["arrow-rtl", "arrow-ltr", "neutral"].map(function (v) { return { value: v, label: cueLabel(v), sub: t("cue." + v + ".sub") }; }), loc.swipeCue, function (v) { ctx.setCue(v); }, "ui-radios--row");
    var expected = CUE_BY_APP_LANGUAGE[loc.appLanguage];
    var why = h("p", { class: "ui-note" }, icon("info"), h("span", { html: bidi(t("cue.reason." + loc.swipeCue)) }));
    var mismatch = expected && expected !== loc.swipeCue ? h("p", { class: "ui-note ui-note--warn" }, icon("triangle-alert"), h("span", { html: bidi(t("cue.mismatch")) })) : null;
    var pano = h("details", { class: "ui-details" }, h("summary", {}, t("cue.panorama")), h("p", { class: "ui-hint", html: bidi(t("cue.panorama.text")) }));
    return sec(t("style.cue"), t("style.cue.hint"), [h("div", { class: "ui-label" }, t("style.applang")), app, h("div", { class: "ui-label" }, t("style.cue.pick")), cue, why, mismatch, pano]);
  }

  function metaSection() {
    var input = h("input", {
      class: "ui-input", type: "text", maxlength: 40, placeholder: t("style.meta.ph"), "aria-label": t("style.meta"),
      onchange: function () { ctx.setStyle({ metaLabel: cleanText(input.value) || undefined }); }
    });
    input.value = ctx.spec.style.metaLabel || "";
    return sec(t("style.meta"), t("style.meta.hint"), input);
  }

  function occasionSection() {
    var occ = guard("occasions", function () { return CS.core.registry.listOccasions(); }, []);
    if (!occ.length) return null;
    var cur = ctx.spec.style.occasionId || "";
    var sel = selectBox([{ value: "", label: t("style.occasion.none") }].concat(occ.map(function (o) { return { value: o.id, label: msgOf(o.names) }; })), cur, function (v) { ctx.applyOccasion(v); }, t("style.occasion"));
    return sec(t("style.occasion"), t("style.occasion.hint"), sel);
  }

  function build() {
    clear(el);
    releaseFrames(el);
    [presetGallery(), occasionSection(), accentSection(), fontSection(), cueSection(), metaSection()].forEach(function (s) { if (s) el.appendChild(s); });
    runExtensions(el, CS.ui._.panels.style, ctx, ctx.slide());
  }
  build();
  return { el: el, refresh: build };
}

/* ---- Text ------------------------------------------------------------------------------------------------------- */
function TextTab(ctx) {
  var el = h("div", { class: "ui-tabpanel" });

  function slideSection() {
    var s = ctx.slide();
    if (!s) return null;
    return sec(t("text.slide", { n: s.n, type: typeLabel(s.type) }), t("text.slide.hint"), h("div", { class: "ui-editors" }, slideEditors(ctx, s)));
  }

  function kashidaSection() {
    var tokens = ctx.tokens;
    var allowed = tokens && tokens.decor && tokens.decor.kashida && tokens.decor.kashida.allowed;
    var s = ctx.slide();
    var head = s && s.headline ? guard("stripMarkup", function () { return CS.core.text.stripMarkup(s.headline); }, s.headline) : "";
    var words = head.split(/\s+/).filter(function (w) { return /[ء-ي]{3,}/.test(w); });
    var body;
    if (!allowed) body = h("p", { class: "ui-note" }, icon("info"), h("span", { html: bidi(t("text.kashida.off")) }));
    else if (!words.length) body = h("p", { class: "ui-hint" }, t("text.kashida.none"));
    else {
      var cur = s.kashidaWord || "";
      body = h("div", { class: "ui-chips ui-chips--pick" }, [h("button", { type: "button", class: "ui-chip-btn", "aria-pressed": String(!cur), onclick: function () { ctx.setKashida(s.id, null); } }, t("text.kashida.none-pick"))].concat(
        words.map(function (w) { return h("button", { type: "button", class: "ui-chip-btn", "aria-pressed": String(cur === w), onclick: function () { ctx.setKashida(s.id, w); } }, w); })));
    }
    return sec(t("text.kashida"), allowed ? t("text.kashida.hint") : null, body);
  }

  function digitsSection() {
    var loc = ctx.spec.locale;
    var opts = ["western", "arabic-indic"].map(function (v) {
      var sample = guard("digits.counter", function () { return CS.core.text.digits.counter(3, 8, v, uiLang() === "en" ? "en" : "ar"); }, v === "western" ? "3 من 8" : "٣ من ٨");
      return { value: v, label: v === "western" ? "123" : "١٢٣", sub: sample };
    });
    var cards = radioCards(opts, loc.digits, function (v) { ctx.setDigits(v); }, "ui-radios--row ui-radios--digits");
    return sec(t("text.digits"), t("text.digits.hint"), [cards, h("p", { class: "ui-hint" }, t("text.digits.evidence"))]);
  }

  function dialectSection() {
    var rules = guard("rules", function () { return CS.core.registry.rules(); }, null);
    var dialects = rules && rules.locale && rules.locale.dialects ? Object.keys(rules.locale.dialects) : ["eg", "gulf", "levant", "msa-white", "en"];
    var sel = selectBox(dialects.map(function (d) { return { value: d, label: dialectLabel(d) }; }), ctx.spec.locale.dialect, function (v) { ctx.setDialect(v); }, t("text.dialect"));
    return sec(t("text.dialect"), t("text.dialect.hint"), sel);
  }

  function build() {
    clear(el);
    [slideSection(), kashidaSection(), digitsSection(), dialectSection()].forEach(function (s) { if (s) el.appendChild(s); });
    runExtensions(el, CS.ui._.panels.text, ctx, ctx.slide());
  }
  build();
  return { el: el, refresh: build };
}

/* ---- Visual ----------------------------------------------------------------------------------------------------- */
var MEDIA_SLOTS = ["none", "icon", "photo", "cutout", "plate", "screenshot", "ui"];
var CALM_ZONES = ["none", "top", "bottom", "start", "end", "center"];

function VisualTab(ctx) {
  var el = h("div", { class: "ui-tabpanel" });
  var fileInput = h("input", { type: "file", class: "ui-file", accept: "image/*,video/mp4,video/webm", hidden: true, "aria-hidden": "true", tabindex: "-1" });
  fileInput.addEventListener("change", function () {
    var f = fileInput.files && fileInput.files[0];
    var s = ctx.slide();
    fileInput.value = "";
    if (f && s) ctx.attachFile(s.id, f, (s.media && s.media.slot && s.media.slot !== "none") ? s.media.slot : "photo");
  });

  function build() {
    clear(el);
    var s = ctx.slide();
    if (!s) return;
    var media = s.media || { slot: "none" };
    var slotSel = selectBox(MEDIA_SLOTS.map(function (v) { return { value: v, label: t("media.slot." + v) }; }), media.slot, function (v) {
      ctx.setSlide(s.id, { media: Object.assign({}, s.media, { slot: v }) }, { origin: "form" });
      build();   /* a form edit does not rebuild the tab, but the upload and AI controls depend on the slot */
    }, t("visual.slot"));
    el.appendChild(sec(t("visual.title", { n: s.n }), t("visual.hint"), [slotSel]));
    if (media.slot !== "none") {
      var a = media.assetId ? ctx.assets(media.assetId) : null;
      var asset = (ctx.spec.assets || []).filter(function (x) { return x.id === media.assetId; })[0];
      var preview = a && /^image|^data:image/.test(a.mime || a.url) ? h("img", { class: "ui-asset-img", src: a.url, alt: asset && asset.alt ? asset.alt : "" }) : (a ? h("div", { class: "ui-asset-img ui-asset-img--file" }, icon("film"), a.mime || "") : h("div", { class: "ui-asset-img ui-asset-img--empty" }, icon("image"), t("visual.empty")));
      var controls = h("div", { class: "ui-row ui-row--wrap" },
        h("button", { type: "button", class: "ui-btn ui-btn--secondary", onclick: function () { fileInput.click(); } }, icon("upload"), a ? t("visual.replace") : t("visual.upload")),
        a ? h("button", { type: "button", class: "ui-btn ui-btn--ghost", onclick: function () { ctx.removeMedia(s.id); } }, icon("trash-2"), t("visual.remove")) : null);
      var box = [preview, controls];
      /* The AI switch is available before the upload too, so a file arrives already flagged as AI-generated. */
      box.push(switchBox(t("visual.ai"), !!media.ai, function (on) { ctx.setAiFlag(s.id, on); }, t("visual.ai.hint")));
      if (a) {
        /* Gate A1.text-check: the person looks at the image and confirms there is no letter and no watermark in it. */
        if (media.ai || (asset && asset.aiGenerated)) {
          box.push(h("div", { class: "ui-textcheck", dataset: { csTextCheck: media.assetId } },
            switchBox(t("visual.textcheck"), ctx.textChecked(media.assetId), function (on) { ctx.setTextChecked(media.assetId, on); }, t("visual.textcheck.hint"))));
        }
        var alt = h("input", {
          class: "ui-input", type: "text", maxlength: 300, placeholder: t("visual.alt.ph"), "aria-label": t("visual.alt"),
          onchange: function () {
            var v = cleanText(alt.value);
            ctx.commit(function (spec) { return Object.assign({}, spec, { assets: (spec.assets || []).map(function (x) { if (x.id !== media.assetId) return x; var y = Object.assign({}, x); if (v) y.alt = v; else delete y.alt; return y; }) }); }, { slides: [], layout: false, path: "/assets" });
          }
        });
        alt.value = (asset && asset.alt) || "";
        box.push(field(t("visual.alt"), alt, t("visual.alt.hint")));
        var calm = selectBox(CALM_ZONES.map(function (v) { return { value: v, label: t("calm." + v) }; }), media.calmZone || "none", function (v) {
          ctx.setSlide(s.id, { media: Object.assign({}, (ctx.slide(s.id) || {}).media, { calmZone: v === "none" ? undefined : v }) }, { origin: "form" });
        }, t("visual.calm"));
        box.push(field(t("visual.calm"), calm, t("visual.calm.hint")));
      }
      el.appendChild(sec(t("visual.asset"), null, box));
    }
    if (ctx.anyAi()) el.appendChild(h("p", { class: "ui-note ui-note--warn" }, icon("triangle-alert"), h("span", { html: bidi(t("visual.ai.label")) })));
    el.appendChild(h("p", { class: "ui-hint" }, t("visual.no-ai-text")));
    el.appendChild(fileInput);
    runExtensions(el, CS.ui._.panels.visual, ctx, s);
  }
  build();
  return { el: el, refresh: build };
}

/* ---- Slide ------------------------------------------------------------------------------------------------------ */
function SlideTab(ctx) {
  var el = h("div", { class: "ui-tabpanel" });
  var tray = h("div", { class: "ui-regen-tray", "aria-live": "polite" });

  function variantsSection(s) {
    var preset = ctx.preset();
    var list = (preset && preset.variants && preset.variants[s.type]) || [];
    if (list.length < 2) return null;
    var cur = s.variant || list[0];
    var row = h("div", { class: "ui-chips ui-chips--pick" }, list.map(function (v) {
      return h("button", { type: "button", class: "ui-chip-btn", "aria-pressed": String(cur === v), onclick: function () { ctx.setSlide(s.id, { variant: v === list[0] ? undefined : v }, { origin: "variant" }); } }, t("variant." + v));
    }));
    return sec(t("slide.variant"), t("slide.variant.hint"), row);
  }

  function structureSection(s) {
    var i = ctx.index(s.id), n = ctx.slides().length;
    function btn(label, ic, fn, disabled, danger) {
      return h("button", { type: "button", class: "ui-btn ui-btn--secondary" + (danger ? " ui-btn--danger-ghost" : ""), disabled: !!disabled, onclick: fn }, icon(ic), label);
    }
    var addAnchor = btn(t("slide.add-after"), "plus", function () { openAddMenu(ctx, addAnchor, i + 1); });
    return sec(t("slide.arrange"), null, h("div", { class: "ui-actions-grid" },
      btn(t("slide.move-earlier"), "arrow-up", function () { ctx.moveSlide(s.id, -1); }, i <= 0),
      btn(t("slide.move-later"), "arrow-down", function () { ctx.moveSlide(s.id, 1); }, i >= n - 1),
      btn(t("slide.duplicate"), "copy-plus", function () { var id = ctx.duplicateSlide(s.id); if (id) ctx.select(id); }),
      btn(t("slide.split"), "scissors", function () { if (ctx.slides().length >= 10) { ctx.splitSlide(s.id); return; } if (ctx.splitSlide(s.id)) toast(t("slide.split.done"), "ok", { action: { label: t("common.undo"), fn: function () { ctx.undo(); } } }); else toast(t("slide.split.none"), "info"); }),
      addAnchor,
      btn(t("common.delete"), "trash-2", function () { confirmDelete(ctx, s); }, n <= 1, true)));
  }

  function regenSection(s) {
    var box = h("div", { class: "ui-regen" });
    var chips = h("div", { class: "ui-chips ui-chips--pick" });
    REGEN_MODES.forEach(function (m) {
      chips.appendChild(h("button", {
        type: "button", class: "ui-chip-btn", dataset: { csAction: "regenerate", mode: m },
        onclick: function () { ctx.regenerate(s.id, m); }
      }, icon("sparkles"), t("regen.mode." + m)));
    });
    box.appendChild(chips);
    box.appendChild(tray);
    paintTray();
    return sec(t("slide.regen"), ctx.owner ? t("regen.hint") : t("regen.hint.viewer"), box);
  }

  function chatLine(s) {
    var line = t("regen.chat.line", { n: s.n });
    return sec(t("slide.regen"), t("regen.hint.viewer"), h("div", { class: "ui-copyline" },
      h("code", { class: "ui-code", html: bidi(line) }),
      h("button", { type: "button", class: "ui-btn ui-btn--ghost ui-btn--sm", onclick: function () { copyWithFeedback(line, t("regen.chat.label")); } }, icon("copy"), t("common.copy"))));
  }

  function paintTray() {
    clear(tray);
    var st = ctx.regen;
    if (!st || st.slideId !== ctx.sel) return;
    if (st.status === "loading") {
      tray.appendChild(h("div", { class: "ui-regen-loading" }, h("span", { class: "ui-spinner", "aria-hidden": "true" }), h("span", {}, t("regen.loading")),
        h("button", { type: "button", class: "ui-btn ui-btn--ghost ui-btn--sm", onclick: function () { ctx.cancelRegen(); } }, t("common.cancel"))));
      return;
    }
    if (st.status === "error") {
      tray.appendChild(h("p", { class: "ui-note ui-note--warn" }, icon("triangle-alert"), h("span", { html: bidi(t("regen.err." + (["not_granted", "rate_limited", "invalid_json", "empty", "unavailable", "cancelled"].indexOf(st.error) >= 0 ? st.error : "generic"))) })));
      return;
    }
    st.variants.forEach(function (v, i) {
      var fields = Object.keys(v.patch).map(function (k) {
        var val = v.patch[k];
        var txt = k === "bullets" ? val.join(" · ") : k === "sides" ? val.map(function (x) { return x.text; }).join(" | ") : k === "cta" ? val.text : val;
        return h("p", { class: "ui-variant-line" }, h("span", { class: "ui-variant-k" }, t("field." + k)), h("span", { html: bidi(String(txt).replace(/==/g, "").replace(/\n/g, " ")) }));
      });
      tray.appendChild(h("article", { class: "ui-variant" }, h("div", { class: "ui-variant-text" }, fields),
        h("div", { class: "ui-variant-foot" },
          v.blocks.length ? pill(t("regen.variant.blocks", { n: v.blocks.length }), "bad", "circle-alert") : v.fixes ? pill(t("regen.variant.fixes", { n: v.fixes }), "warn") : pill(t("regen.variant.clean"), "ok", "check"),
          h("button", { type: "button", class: "ui-btn ui-btn--primary ui-btn--sm", onclick: function () { ctx.applyVariant(v); } }, t("regen.use")))));
    });
  }
  ctx.bus.on("regen", paintTray);

  function notesSection(s) {
    var ta = h("textarea", { class: "ui-input", rows: 2, maxlength: 500, "aria-label": t("slide.notes"), placeholder: t("slide.notes.ph"), onchange: function () { ctx.setSlide(s.id, { notes: cleanText(ta.value) || undefined }, { origin: "form", layout: false }); } });
    ta.value = s.notes || "";
    return sec(t("slide.notes"), t("slide.notes.hint"), ta);
  }

  function build() {
    clear(el);
    var s = ctx.slide();
    if (!s) return;
    [variantsSection(s), structureSection(s), ctx.owner && ctx.caps.sample !== false ? regenSection(s) : chatLine(s), notesSection(s)].forEach(function (x) { if (x) el.appendChild(x); });
    runExtensions(el, CS.ui._.panels.slide, ctx, s);
  }
  build();
  return { el: el, refresh: build };
}
