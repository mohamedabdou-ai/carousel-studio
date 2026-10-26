/* ui/overlay.js · toasts, modal dialogs and popover menus.
 * The viewer frame never shows alert()/confirm()/prompt(), so every confirmation is built into the page. */

var layerEl = null;

function setLayer(el) { layerEl = el; }
function getLayer() { return layerEl || document.body; }

var TOAST_ICON = { ok: "circle-check", warn: "triangle-alert", error: "circle-alert", info: "info" };

/** Show a short message. opts: {ttl, action: {label, fn}}. Returns a dismiss function. */
function toast(message, kind, opts) {
  kind = kind || "info";
  opts = opts || {};
  var layer = getLayer();
  var host = layer.querySelector(".ui-toasts");
  if (!host) {
    host = h("div", { class: "ui-toasts", "aria-live": "polite" });
    layer.appendChild(host);
  }
  var timer = null;
  var node = h("div", { class: "ui-toast ui-toast--" + kind, role: kind === "error" ? "alert" : "status" },
    icon(TOAST_ICON[kind] || "info"),
    h("span", { class: "ui-toast-msg", html: bidi(message) }),
    opts.action ? h("button", { class: "ui-toast-act", type: "button", onclick: function () { dismiss(); opts.action.fn(); } }, opts.action.label) : null,
    h("button", { class: "ui-toast-x", type: "button", "aria-label": t("common.close"), onclick: function () { dismiss(); } }, icon("x")));
  function dismiss() {
    clearTimeout(timer);
    node.classList.add("is-out");
    setTimeout(function () { node.remove(); }, 200);
  }
  host.appendChild(node);
  while (host.children.length > 3) host.firstElementChild.remove();
  timer = setTimeout(dismiss, opts.ttl || (kind === "error" ? 9000 : kind === "warn" ? 6500 : 3600));
  return dismiss;
}

var FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Modal dialog. opts: {title, body: Node|string, actions: [{label, value, kind: "primary"|"danger"|"ghost"}], dismissible}.
 * Resolves with the chosen action's value, or null when dismissed.
 */
function dialog(opts) {
  return new Promise(function (resolve) {
    var prev = document.activeElement;
    var id = uid("dlg");
    var done = false;
    var body = typeof opts.body === "string" ? h("p", { class: "ui-dialog-text", html: bidi(opts.body) }) : opts.body;
    var actions = (opts.actions || [{ label: t("common.ok"), value: true, kind: "primary" }]).map(function (a) {
      return h("button", {
        type: "button", class: "ui-btn" + (a.kind === "primary" ? " ui-btn--primary" : a.kind === "danger" ? " ui-btn--danger" : " ui-btn--ghost"),
        onclick: function () { close(a.value); }
      }, a.label);
    });
    var box = h("div", { class: "ui-dialog", role: "dialog", "aria-modal": "true", "aria-labelledby": id },
      h("h2", { class: "ui-dialog-title", id: id }, opts.title || ""),
      body,
      h("div", { class: "ui-dialog-actions" }, actions));
    var overlay = h("div", { class: "ui-overlay", onmousedown: function (e) { if (e.target === overlay && opts.dismissible !== false) close(null); } }, box);
    function close(v) {
      if (done) return;
      done = true;
      document.removeEventListener("keydown", onKey, true);
      overlay.classList.add("is-out");
      setTimeout(function () { overlay.remove(); }, 160);
      if (prev && prev.focus) { try { prev.focus(); } catch (e) { /* element gone */ } }
      resolve(v);
    }
    function onKey(e) {
      if (e.key === "Escape" && opts.dismissible !== false) { e.stopPropagation(); close(null); }
      if (e.key === "Tab") {
        var f = Array.prototype.filter.call(box.querySelectorAll(FOCUSABLE), function (n) { return n.offsetParent !== null; });
        if (!f.length) return;
        var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener("keydown", onKey, true);
    getLayer().appendChild(overlay);
    var focusTarget = box.querySelector("[data-autofocus]") || actions[actions.length - 1] || box;
    setTimeout(function () { if (focusTarget.focus) focusTarget.focus(); }, 30);
  });
}

/** Ask for a one-line reason (used by "export anyway"). Resolves with the text or null. */
function askText(opts) {
  var input = h("input", { class: "ui-input", type: "text", maxlength: opts.max || 300, placeholder: opts.placeholder || "", dataset: { autofocus: "1" }, "aria-label": opts.title });
  input.setAttribute("data-autofocus", "1");
  return dialog({
    title: opts.title,
    body: h("div", { class: "ui-dialog-body" }, opts.text ? h("p", { class: "ui-dialog-text", html: bidi(opts.text) }) : null, input),
    actions: [{ label: t("common.cancel"), value: null, kind: "ghost" }, { label: opts.confirm || t("common.ok"), value: "__ok", kind: opts.danger ? "danger" : "primary" }]
  }).then(function (v) { return v === "__ok" ? input.value.trim() : null; });
}

/** Show text the clipboard refused to take, selected and ready to copy by hand. */
function showManualCopy(title, text) {
  var ta = h("textarea", { class: "ui-input ui-code", readonly: true, rows: 7, dir: "ltr", "aria-label": title });
  ta.value = text;
  setTimeout(function () { ta.focus(); ta.select(); }, 40);
  return dialog({ title: title, body: h("div", { class: "ui-dialog-body" }, h("p", { class: "ui-dialog-text" }, t("common.copy-manual")), ta), actions: [{ label: t("common.close"), value: true, kind: "primary" }] });
}

/** Copy and tell the user; fall back to a selectable box when the clipboard is blocked. */
async function copyWithFeedback(text, label) {
  var ok = await copyText(text);
  if (ok) toast(t("common.copied", { what: label || "" }), "ok");
  else await showManualCopy(label || t("common.copy"), text);
  return ok;
}

/**
 * Popover menu anchored to an element. items: [{label, icon, onSelect, danger, disabled, divider, hint}].
 * The menu opens toward the inline-start of the anchor so it stays on screen in RTL.
 */
function openMenu(anchor, items, opts) {
  opts = opts || {};
  closeMenus();
  var menu = h("div", { class: "ui-menu", role: "menu" });
  items.forEach(function (it) {
    if (it.divider) { menu.appendChild(h("div", { class: "ui-menu-sep", role: "separator" })); return; }
    menu.appendChild(h("button", {
      type: "button", role: "menuitem", class: "ui-menu-item" + (it.danger ? " is-danger" : ""), disabled: !!it.disabled,
      dataset: it.action ? { csAction: it.action } : null,
      onclick: function () { closeMenus(); if (it.onSelect) it.onSelect(); }
    }, it.icon ? icon(it.icon) : h("span", { class: "ui-i" }), h("span", { class: "ui-menu-label" }, it.label), it.hint ? h("span", { class: "ui-menu-hint" }, it.hint) : null));
  });
  var layer = getLayer();
  layer.appendChild(menu);
  var r = anchor.getBoundingClientRect();
  var mw = menu.offsetWidth, mh = menu.offsetHeight;
  var vw = document.documentElement.clientWidth, vh = window.innerHeight;
  var rtl = document.documentElement.getAttribute("dir") === "rtl";
  var x = rtl ? r.right - mw : r.left;
  x = clamp(x, 8, Math.max(8, vw - mw - 8));
  var y = r.bottom + 6;
  if (y + mh > vh - 8 || opts.up) y = Math.max(8, r.top - mh - 6);
  menu.style.left = x + "px";
  menu.style.top = y + "px";
  var first = menu.querySelector(".ui-menu-item:not([disabled])");
  if (first) first.focus();
  function onDoc(e) { if (!menu.contains(e.target)) closeMenus(); }
  function onKey(e) {
    if (e.key === "Escape") { closeMenus(); if (anchor.focus) anchor.focus(); }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      var list = Array.prototype.slice.call(menu.querySelectorAll(".ui-menu-item:not([disabled])"));
      var i = list.indexOf(document.activeElement);
      i = (i + (e.key === "ArrowDown" ? 1 : -1) + list.length) % list.length;
      list[i].focus();
    }
  }
  setTimeout(function () { document.addEventListener("mousedown", onDoc, true); document.addEventListener("keydown", onKey, true); }, 0);
  menu._cleanup = function () { document.removeEventListener("mousedown", onDoc, true); document.removeEventListener("keydown", onKey, true); };
  return menu;
}

function closeMenus() {
  getLayer().querySelectorAll(".ui-menu").forEach(function (m) { if (m._cleanup) m._cleanup(); m.remove(); });
}

/** Segmented control: options [{value, label, icon?, hint?}] -> element with aria-pressed buttons. */
function segmented(options, value, onChange, cls) {
  var wrap = h("div", { class: "ui-seg" + (cls ? " " + cls : ""), role: "group" });
  function paint(v) {
    Array.prototype.forEach.call(wrap.children, function (b) { b.setAttribute("aria-pressed", String(b.dataset.value === String(v))); });
  }
  options.forEach(function (o) {
    wrap.appendChild(h("button", {
      type: "button", class: "ui-seg-btn", dataset: { value: o.value }, title: o.hint || null,
      onclick: function () { paint(o.value); onChange(o.value); }
    }, o.icon ? icon(o.icon) : null, h("span", { html: bidi(o.label) })));
  });
  paint(value);
  wrap.setValue = paint;
  return wrap;
}

/** Labelled form field wrapper. */
function field(label, control, hint, id) {
  var lab = h("label", { class: "ui-label" }, label);
  if (id) { lab.setAttribute("for", id); control.id = id; }
  return h("div", { class: "ui-field" }, lab, control, hint ? h("p", { class: "ui-hint", html: bidi(hint) }) : null);
}

/** Switch (checkbox styled as a toggle). */
function switchBox(label, checked, onChange, hint) {
  var id = uid("sw");
  var input = h("input", { type: "checkbox", id: id, class: "ui-switch-in", checked: !!checked, onchange: function () { onChange(input.checked); } });
  return h("label", { class: "ui-switch", for: id },
    input, h("span", { class: "ui-switch-track", "aria-hidden": "true" }, h("span", { class: "ui-switch-thumb" })),
    h("span", { class: "ui-switch-text" }, h("span", { html: bidi(label) }), hint ? h("small", { class: "ui-hint", html: bidi(hint) }) : null));
}

/** Small status pill. kind: ok | warn | bad | info | mute. */
function pill(text, kind, iconName) {
  return h("span", { class: "ui-pill ui-pill--" + (kind || "mute") }, iconName ? icon(iconName) : null, h("span", { html: bidi(text) }));
}

/** Word-count meter: soft limit warns, hard limit blocks. */
function meter(count, soft, hard) {
  var state = hard && count > hard ? "bad" : soft && count > soft ? "warn" : "ok";
  var limit = hard && count > soft ? hard : soft;
  return h("span", { class: "ui-meter ui-meter--" + state, dir: "ltr", title: t("meter.words", { n: count, max: limit || "" }) },
    h("span", { class: "ui-meter-n" }, String(count)), limit ? h("span", { class: "ui-meter-max" }, "/" + limit) : null);
}
