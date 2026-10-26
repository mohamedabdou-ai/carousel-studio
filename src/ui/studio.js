/* ui/studio.js · the Studio shell: top bar, navigation, screens and the StudioController (CONTRACT 4.8). */

/** Screens in navigation order. The secondary screens are registered by cs-brandbook.js (CS.ui._.screens) and built on first use. */
function lateScreen(id) {
  return function (ctx) {
    var build = CS.ui._.screens[id];
    if (!build) throw new CS.CSError("E_DEP_LOAD", "screen " + id + " is not loaded (cs-brandbook.js)");
    if (id === "export") ensureExport(ctx);
    return build(ctx);
  };
}

/** Export can arrive after the core editor; missing optional chunks do not prevent editing. */
function ensureExport(ctx) {
  if (ctx.exp) return;
  var attach = CS.ui._.attachExport;
  if (!attach) throw new CS.CSError("E_DEP_LOAD", "export flow is not loaded (cs-brandbook.js)");
  attach(ctx);
}
var SCREENS = [
  { id: "script", icon: "file-text", build: ScriptScreen },
  { id: "design", icon: "palette", build: DesignScreen },
  { id: "preview", icon: "smartphone", build: lateScreen("preview") },
  { id: "motion", icon: "clapperboard", build: lateScreen("motion") },
  { id: "copy", icon: "message-square-text", build: lateScreen("copy") },
  { id: "check", icon: "shield-check", build: CheckScreen },
  { id: "export", icon: "package-open", build: lateScreen("export") },
  { id: "about", icon: "info", build: lateScreen("about") }
];
var MORE_NAV = ["motion", "copy", "about"];

function applyTheme(mode) {
  var r = document.documentElement;
  if (mode === "light" || mode === "dark") r.setAttribute("data-theme", mode); else r.removeAttribute("data-theme");
  local.set("cs-theme", mode);
}

function currentTheme() {
  var attr = document.documentElement.getAttribute("data-theme");
  return attr === "light" || attr === "dark" ? attr : "auto";
}

function initialUiDialect(data) {
  var pref = local.get("cs-ui-dialect", null);
  if (pref && UI_DIALECTS.indexOf(pref) >= 0) return pref;
  var cfg = data.config && data.config.uiDialect;
  if (cfg && UI_DIALECTS.indexOf(cfg) >= 0) return cfg;
  var spec = data.spec, brand = data.brand;
  return (spec && spec.locale && spec.locale.uiDialect) || (brand && brand.locale && brand.locale.uiDialect) || (spec && spec.locale && spec.locale.dialect) || "msa-white";
}

function mountStudio(root, data, opts) {
  if (!data || !data.spec) throw new CS.CSError("E_SCHEMA", "mountStudio needs a spec");
  var startedAt = performance.now();
  captureBoot(root);
  loadUiStrings();
  var saved = local.get("cs-theme", null);
  if (saved && !document.documentElement.getAttribute("data-theme")) applyTheme(saved);
  setUiDialect(initialUiDialect(data));

  var ctx = createCtx(root, data, opts);
  ctx.startedAt = startedAt;
  var current = null;
  var built = {};
  var chrome = {};
  var disposers = [];

  attachRender(ctx);
  attachQa(ctx);
  attachPersist(ctx);
  ctx.exportKit = function () { ensureExport(ctx); return ctx.exportKit.apply(ctx, arguments); };
  if (CS.ui._.attachExport) ensureExport(ctx);
  attachRegen(ctx);
  attachActions(ctx);

  var readyDone = false;
  ctx.markReady = function () {
    if (readyDone) return;
    readyDone = true;
    var done = function () {
      if (window.__csReady) return;
      window.__csReady = true;
      CS.emit("cs:ready", { ms: Math.round(performance.now() - startedAt) });
    };
    var fonts = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
    fonts.then(function () { return raf(); }).then(function () { return raf(); }).then(done, done);
  };

  /* ---- top bar ---------------------------------------------------------------------------------------------- */
  function buildTop() {
    chrome.title = h("span", { class: "ui-doc-title" });
    chrome.state = h("span", { class: "ui-doc-state" });
    chrome.undo = h("button", { type: "button", class: "ui-btn ui-btn--icon ui-btn--ghost", "aria-label": t("top.undo"), title: t("top.undo"), onclick: function () { ctx.undo(); } }, icon("undo-2", "ui-i-dir"));
    chrome.redo = h("button", { type: "button", class: "ui-btn ui-btn--icon ui-btn--ghost", "aria-label": t("top.redo"), title: t("top.redo"), onclick: function () { ctx.redo(); } }, icon("redo-2", "ui-i-dir"));
    chrome.qa = h("button", { type: "button", class: "ui-qachip", onclick: function () { ctx.go("check"); } });
    chrome.save = h("button", { type: "button", class: "ui-btn ui-btn--primary", dataset: { csAction: "save" }, onclick: function () { ctx.save("manual"); } });
    chrome.menu = h("button", { type: "button", class: "ui-btn ui-btn--icon ui-btn--ghost", "aria-label": t("top.menu"), "aria-haspopup": "menu", onclick: function () { openTopMenu(); } }, icon("ellipsis"));
    var credit = hasStr("about.credit")
      ? h("button", { type: "button", class: "ui-credit", dataset: { csCredit: "", csAction: "open-about" }, onclick: function () { ctx.go("about"); } }, t("about.credit"))
      : null;
    chrome.credit = credit;
    return h("header", { class: "ui-top" },
      h("div", { class: "ui-top-in" },
        h("div", { class: "ui-wordmark" }, markSvg(), h("span", { class: "ui-wordmark-text" }, t("app.name"))),
        h("div", { class: "ui-doc" }, chrome.title, chrome.state),
        h("div", { class: "ui-top-actions" }, chrome.undo, chrome.redo, chrome.qa, chrome.save, chrome.menu)));
  }

  function openTopMenu() {
    var theme = currentTheme();
    var next = theme === "auto" ? "light" : theme === "light" ? "dark" : "auto";
    openMenu(chrome.menu, [
      { label: t("menu.theme", { mode: t("theme." + theme) }), hint: t("theme." + next), icon: theme === "dark" ? "moon" : "sun", onSelect: function () { applyTheme(next); } },
      { label: uiDialect === "en" ? t("menu.lang.ar") : t("menu.lang.en"), icon: "languages", onSelect: toggleLanguage },
      { divider: true },
      { label: t("menu.copy-patch"), icon: "copy", action: "copy-patch", onSelect: function () { ctx.copyPatch(); } },
      { label: t("menu.about"), icon: "info", action: "open-about", onSelect: function () { ctx.go("about"); } }
    ]);
  }

  function toggleLanguage() {
    var home = initialUiDialect(data);
    var target = uiDialect === "en" ? (home === "en" ? "msa-white" : home) : "en";
    local.set("cs-ui-dialect", target);
    setUiDialect(target);
    rebuild();
  }

  var DOC_STATE = { angle: "angle", script: "script", design: "design", ready: "ready", exported: "exported" };
  function paintTop() {
    var topic = (ctx.spec.brief && ctx.spec.brief.topic) || (ctx.brand && ctx.brand.name) || t("app.name");
    chrome.title.textContent = topic;
    chrome.title.title = topic;
    clear(chrome.state);
    chrome.state.appendChild(document.createTextNode(t("state." + (DOC_STATE[ctx.spec.checkpoint] || "design"))));
    if (ctx.dirty) chrome.state.appendChild(h("span", { class: "ui-dirty", title: t("top.unsaved") }, t("top.unsaved")));
    chrome.undo.disabled = !ctx.canUndo();
    chrome.redo.disabled = !ctx.canRedo();
    var sum = ctx.summary();
    chrome.qa.className = "ui-qachip ui-qachip--" + sum.status;
    clear(chrome.qa);
    chrome.qa.appendChild(icon(sum.status === "pass" ? "shield-check" : sum.status === "fix" ? "triangle-alert" : "circle-alert"));
    chrome.qa.appendChild(h("span", {}, sum.status === "pass" ? t("top.qa.pass") : sum.status === "fix" ? t("top.qa.fix", { n: sum.counts.fix + sum.counts.block }) : t("top.qa.block", { n: sum.counts.block })));
    chrome.qa.title = t("top.qa.open");
    var canPub = ctx.caps.publish !== false && ctx.writer;
    clear(chrome.save);
    var saveLabel = canPub ? t("top.save") : t("top.copy-changes");
    chrome.save.appendChild(icon(canPub ? "save" : "copy"));
    chrome.save.appendChild(h("span", { class: "ui-btn-label" }, saveLabel));
    chrome.save.setAttribute("aria-label", saveLabel);
    chrome.save.disabled = !!ctx.busy.save;
    chrome.save.classList.toggle("is-dirty", ctx.dirty);
    paintNavBadges();
  }

  /* ---- navigation ------------------------------------------------------------------------------------------- */
  function buildNav() {
    chrome.navBtns = {};
    function navBtn(id) {
      var def = SCREENS.filter(function (s) { return s.id === id; })[0];
      var b = h("button", {
        type: "button", class: "ui-nav-btn", dataset: { screen: id }, "aria-label": t("nav." + id),
        onclick: function () { ctx.go(id); }
      }, icon(def.icon), h("span", { class: "ui-nav-label" }, t("nav." + id)), h("span", { class: "ui-nav-badge", hidden: true }));
      chrome.navBtns[id] = b;
      return b;
    }
    var all = SCREENS.filter(function (s) { return s.id !== "about"; }).map(function (s) { return navBtn(s.id); });
    chrome.more = h("button", { type: "button", class: "ui-nav-btn ui-nav-more", "aria-haspopup": "menu", "aria-label": t("nav.more"), onclick: function () {
      openMenu(chrome.more, MORE_NAV.map(function (id) {
        var def = SCREENS.filter(function (s) { return s.id === id; })[0];
        return { label: t("nav." + id), icon: def.icon, onSelect: function () { ctx.go(id); } };
      }), { up: true });
    } }, icon("ellipsis"), h("span", { class: "ui-nav-label" }, t("nav.more")));
    var aboutBtn = navBtn("about");
    return h("nav", { class: "ui-nav", "aria-label": t("nav.label") },
      h("div", { class: "ui-nav-main" }, all),
      chrome.more,
      h("div", { class: "ui-nav-foot" }, aboutBtn));
  }

  function paintNav() {
    Object.keys(chrome.navBtns).forEach(function (id) {
      var on = id === ctx.screen;
      chrome.navBtns[id].setAttribute("aria-current", on ? "page" : "false");
      if (!on) chrome.navBtns[id].removeAttribute("aria-current");
    });
    var moreActive = MORE_NAV.indexOf(ctx.screen) >= 0;
    chrome.more.classList.toggle("is-active", moreActive);
    root.setAttribute("data-ui-screen", ctx.screen);
  }

  function paintNavBadges() {
    var sum = ctx.summary();
    function badge(id, text, kind) {
      var b = chrome.navBtns[id] && chrome.navBtns[id].querySelector(".ui-nav-badge");
      if (!b) return;
      b.hidden = !text;
      b.textContent = text || "";
      b.className = "ui-nav-badge" + (kind ? " ui-nav-badge--" + kind : "");
    }
    badge("check", sum.counts.block ? String(sum.counts.block) : sum.counts.fix ? String(sum.counts.fix) : "", sum.counts.block ? "bad" : "warn");
    badge("script", ctx.spec.approvals && ctx.spec.approvals.script ? "✓" : "", "ok");
    badge("design", ctx.spec.frozen ? "✓" : "", "ok");
  }

  /* ---- screens ---------------------------------------------------------------------------------------------- */
  function screenObj(id) {
    if (built[id]) return built[id];
    var def = SCREENS.filter(function (s) { return s.id === id; })[0];
    ctx.bus.group("screens");
    var s = def.build(ctx);
    ctx.bus.group(null);
    s.el.hidden = true;
    chrome.main.insertBefore(s.el, chrome.foot);
    built[id] = s;
    return s;
  }

  function showScreen(id) {
    if (current && current !== id && built[current]) { built[current].hide(); built[current].el.hidden = true; }
    var s = screenObj(id);
    s.el.hidden = false;
    current = id;
    paintNav();
    s.show();
    if (!isFirstShow) window.scrollTo(0, 0);
    isFirstShow = false;
  }
  var isFirstShow = true;

  /* ---- build / rebuild -------------------------------------------------------------------------------------- */
  function buildShell() {
    clear(root);
    root.className = "ui-app";
    root.setAttribute("dir", uiDir());
    root.setAttribute("lang", uiLang());
    built = {};
    current = null;
    ctx.bus.drop("screens");
    var topEl = buildTop();
    chrome.foot = h("footer", { class: "ui-foot" }, chrome.credit || null);
    chrome.main = h("main", { class: "ui-main", id: "ui-main", tabindex: "-1" }, chrome.foot);
    var layer = h("div", { class: "ui-layer" });
    root.appendChild(h("a", { class: "ui-skip", href: "#ui-main", onclick: function (e) { e.preventDefault(); chrome.main.focus(); } }, t("a11y.skip")));
    root.appendChild(topEl);
    root.appendChild(h("div", { class: "ui-body" }, buildNav(), chrome.main));
    root.appendChild(layer);
    if (ctx.holder) root.appendChild(ctx.holder);
    setLayer(layer);
    paintTop();
  }

  function rebuild() {
    var screen = ctx.screen;
    buildShell();
    showScreen(screen);
  }

  /* ---- events ----------------------------------------------------------------------------------------------- */
  ctx.bus.on("screen", function (d) { showScreen(d.screen); paintTop(); });
  ctx.bus.on("spec", function () { paintTop(); });
  ctx.bus.on("qa", function () { paintTop(); });
  ctx.bus.on("busy", function () { paintTop(); });
  ctx.bus.on("export", function () { /* export screen repaints itself */ });
  ctx.bus.on("select", function () { paintTop(); });

  function onKey(e) {
    var mod = e.ctrlKey || e.metaKey;
    if (!mod) return;
    var tag = (e.target && e.target.tagName) || "";
    var editing = tag === "INPUT" || tag === "TEXTAREA" || (e.target && e.target.isContentEditable);
    var k = e.key.toLowerCase();
    if (k === "s") { e.preventDefault(); ctx.save("manual"); }
    else if (k === "z" && !editing) { e.preventDefault(); if (e.shiftKey) ctx.redo(); else ctx.undo(); }
    else if (k === "y" && !editing) { e.preventDefault(); ctx.redo(); }
  }
  document.addEventListener("keydown", onKey);
  disposers.push(function () { document.removeEventListener("keydown", onKey); });

  /* ---- start ------------------------------------------------------------------------------------------------ */
  buildShell();
  var cfgView = data.config && data.config.view;
  var firstScreen = cfgView === "script" ? "script" : cfgView === "design" ? "design" : (ctx.spec.mode === "fast" || ctx.checkpointRank() >= 2 ? "design" : "script");
  ctx.screen = firstScreen;
  ctx.view = firstScreen === "script" ? "script" : "design";
  showScreen(firstScreen);

  ctx.runTextQa();
  ctx.renderAll().then(function () { ctx.markReady(); });
  capabilities().then(function (c) {
    ctx.caps = c;
    paintTop();
    ctx.bus.emit("caps");
  });
  isOwner().then(function (o) { ctx.owner = o; if (built.design && ctx.tab === "slide") built.design.refreshTab(); });
  ctx.restoreStash();

  /* ---- controller ------------------------------------------------------------------------------------------- */
  var controller = {
    getSpec: function () { return ctx.spec; },
    setSpec: async function (spec, o) {
      var source = (o && o.source) || "claude";
      var res = guard("schema.validate", function () { return CS.core.schema.validate("spec", spec); }, { ok: true, errors: [] });
      if (!res.ok) throw new CS.CSError("E_SCHEMA", "spec does not match the schema", res.errors);
      ctx.replaceSpec(spec, { source: source, origin: "external", rebase: source !== "studio" && source !== "user" });
      await ctx.flushRender();
    },
    get view() { return ctx.view; },
    setView: function (v) { ctx.go(v === "script" ? "script" : "design"); },
    select: function (id) { ctx.select(id); },
    applyPreset: async function (id) { ctx.applyPreset(id); await ctx.flushRender(); },
    applyOccasion: async function (id) { ctx.applyOccasion(id); await ctx.flushRender(); },
    runQa: function () { return ctx.runQa(); },
    autoFix: async function () { await ctx.autoFix(); },
    approve: function (cp) { return ctx.approve(cp); },
    regenerate: function (slideId, mode) { return ctx.regenerate(slideId, mode); },
    save: function () { return ctx.save("manual"); },
    copyPatch: function () { return ctx.copyPatch(); },
    exportKit: function () { return ctx.exportKit(); },
    destroy: function () {
      disposers.forEach(function (d) { d(); });
      Object.keys(built).forEach(function (id) { built[id].hide(); });
      clear(root);
      if (CS.ui.current === controller) CS.ui.current = null;
    },
    _ctx: ctx
  };
  CS.ui.current = controller;

  // action hooks for the stable automation attributes (CONTRACT 4.8)
  root.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("[data-cs-action]");
    if (!a || a.getAttribute("data-cs-action") !== "open-about") return;
    ctx.go("about");
  });

  return controller;
}
