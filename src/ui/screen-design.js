/* ui/screen-design.js · checkpoint 3: the big editable slide, the filmstrip in the audience's app order, and the Style / Text / Visual / Slide panel. */

var DESIGN_TABS = ["style", "text", "visual", "slide"];

/** Direction of the filmstrip: the way the audience's Instagram lays slides out (Arabic UI: slide 2 sits on the left). */
function filmDirection(ctx) {
  var cue = ctx.spec.locale && ctx.spec.locale.swipeCue;
  if (cue === "arrow-ltr") return "ltr";
  if (cue === "arrow-rtl") return "rtl";
  return uiDir();
}

/**
 * Previous / counter / next controls laid out in the audience's order (Arabic UI: the next slide is on the left).
 * Returns {el, update(index, total)}; onStep(delta) is called with -1 or 1.
 */
function makeStageNav(ctx, onStep) {
  var prevBtn = h("button", { type: "button", class: "ui-btn ui-btn--icon ui-btn--secondary", "aria-label": t("design.prev"), onclick: function () { onStep(-1); } });
  var nextBtn = h("button", { type: "button", class: "ui-btn ui-btn--icon ui-btn--secondary", "aria-label": t("design.next"), onclick: function () { onStep(1); } });
  var count = h("span", { class: "ui-stage-count", dir: uiDir(), "aria-live": "polite" });
  var el = h("div", { class: "ui-stage-nav" }, prevBtn, count, nextBtn);
  function update(i, n) {
    var dir = filmDirection(ctx);
    el.setAttribute("dir", dir);
    clear(prevBtn); clear(nextBtn);
    prevBtn.appendChild(icon(dir === "rtl" ? "chevron-right" : "chevron-left"));
    nextBtn.appendChild(icon(dir === "rtl" ? "chevron-left" : "chevron-right"));
    count.textContent = t("design.count", { i: i + 1, n: n });
    prevBtn.disabled = i <= 0;
    nextBtn.disabled = i >= n - 1;
  }
  return { el: el, update: update };
}

function fitIssues(render) {
  var out = [];
  var slots = render && render.fit && render.fit.slots;
  if (!slots) return out;
  Object.keys(slots).forEach(function (k) {
    var s = slots[k];
    if (s.status === "floor" || s.status === "overflow") out.push({ key: k, role: s.role, status: s.status, lines: s.lines });
  });
  return out;
}

function DesignScreen(ctx) {
  var el = h("section", { class: "ui-screen ui-screen--design", dataset: { csScreen: "design" }, "aria-labelledby": "ui-h-design" });
  var built = false;
  var editGen = 0;
  var pendingRefresh = false;
  var focusedSlot = null;

  /* ---- stage ------------------------------------------------------------------------------------------------ */
  var c = ctx.canvas();
  var big = makeFrame(c.w, c.h, "ui-big");
  var guides = null;
  var editbar = h("div", { class: "ui-editbar", hidden: true, role: "toolbar", "aria-label": t("design.editbar") });
  var fitNotes = h("div", { class: "ui-fitnotes", "aria-live": "polite" });
  var stageNav = makeStageNav(ctx, function (d) { step(d); });
  var guideBtn = h("button", { type: "button", class: "ui-btn ui-btn--ghost ui-btn--sm", "aria-haspopup": "menu", onclick: function () { openGuideMenu(); } }, icon("ruler"), t("design.guides"));
  var approveHost = h("div", { class: "ui-stage-approve" });
  var stagebar = h("div", { class: "ui-stagebar" }, stageNav.el, guideBtn, approveHost);
  var film = h("div", { class: "ui-film", dataset: { csFilmstrip: "" }, role: "listbox", "aria-label": t("design.film"), tabindex: "-1" });
  var hint = h("p", { class: "ui-hint ui-stage-hint" }, icon("pencil"), t("design.hint"));

  var clipNote = CS.export?.mp4?.clip?.picker(ctx, uiLang()) || h("span");
  var stage = h("div", { class: "ui-stage" }, stagebar, clipNote, h("div", { class: "ui-bigwrap" }, big.frame), editbar, fitNotes, film, hint, teamLogCard(ctx.spec));

  /* ---- panel ------------------------------------------------------------------------------------------------ */
  var tabs = {};
  var panelBody = h("div", { class: "ui-panel-body", role: "tabpanel" });
  var tablist = h("div", { class: "ui-tabs", role: "tablist", "aria-label": t("design.panel") });
  DESIGN_TABS.forEach(function (name) {
    tablist.appendChild(h("button", {
      type: "button", role: "tab", class: "ui-tab", id: "ui-tab-" + name, dataset: { csTab: name }, "aria-selected": String(ctx.tab === name),
      onclick: function () { ctx.setTab(name); }
    }, icon(name === "style" ? "palette" : name === "text" ? "type" : name === "visual" ? "image" : "layers"), h("span", {}, t("tab." + name))));
  });
  var panel = h("aside", { class: "ui-panel" }, tablist, panelBody);

  el.appendChild(h("h1", { class: "ui-sr", id: "ui-h-design" }, t("design.title")));
  el.appendChild(h("div", { class: "ui-design" }, stage, panel));

  function tabFor(name) {
    if (tabs[name]) return tabs[name];
    tabs[name] = name === "style" ? StyleTab(ctx) : name === "text" ? TextTab(ctx) : name === "visual" ? VisualTab(ctx) : SlideTab(ctx);
    return tabs[name];
  }

  function showTab() {
    DESIGN_TABS.forEach(function (n) {
      var b = tablist.querySelector('[data-cs-tab="' + n + '"]');
      b.setAttribute("aria-selected", String(n === ctx.tab));
      b.tabIndex = n === ctx.tab ? 0 : -1;
    });
    var tab = tabFor(ctx.tab);
    clear(panelBody);
    panelBody.setAttribute("aria-labelledby", "ui-tab-" + ctx.tab);
    tab.refresh();
    panelBody.appendChild(tab.el);
  }

  tablist.addEventListener("keydown", function (e) {
    var i = DESIGN_TABS.indexOf(ctx.tab);
    var rtl = uiDir() === "rtl";
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      var d = (e.key === "ArrowRight") === rtl ? -1 : 1;
      var n = DESIGN_TABS[(i + d + DESIGN_TABS.length) % DESIGN_TABS.length];
      ctx.setTab(n);
      var b = tablist.querySelector('[data-cs-tab="' + n + '"]');
      if (b) b.focus();
    }
  });

  /* ---- stage controls --------------------------------------------------------------------------------------- */
  function step(d) {
    var i = ctx.index() + d, list = ctx.slides();
    if (i >= 0 && i < list.length) ctx.select(list[i].id);
  }

  function paintCounter() {
    stageNav.update(ctx.index(), ctx.slides().length);
    if (clipNote.update) clipNote.update();
    var s = ctx.slide();
    stageNav.el.setAttribute("title", s ? typeLabel(s.type) : "");
  }

  function openGuideMenu() {
    var items = [
      ["safe", "guides.safe"], ["crop", "guides.crop"], ["content", "guides.content"], ["keepouts", "guides.keepouts"]
    ].map(function (g) {
      return { label: t(g[1]), icon: ctx.guides[g[0]] ? "check" : "eye", onSelect: function () { ctx.guides[g[0]] = !ctx.guides[g[0]]; paintGuides(); } };
    });
    openMenu(guideBtn, items);
  }

  function paintGuides() {
    if (guides) guides.remove();
    guides = null;
    if (!(ctx.guides.safe || ctx.guides.crop || ctx.guides.content || ctx.guides.keepouts)) return;
    guides = guidesLayer(ctx, ctx.guides);
    big.inner.appendChild(guides);
  }

  function paintApprove() {
    clear(approveHost);
    var s = ctx.spec;
    var frozen = !!s.frozen;
    if (frozen) {
      approveHost.appendChild(pill(t("design.approved"), "ok", "lock"));
      approveHost.appendChild(h("button", { type: "button", class: "ui-btn ui-btn--primary ui-btn--sm", onclick: function () { ctx.go("export"); } }, t("design.to-export"), icon("arrow-left", "ui-i-dir")));
    } else {
      approveHost.appendChild(h("button", {
        type: "button", class: "ui-btn ui-btn--primary ui-btn--sm", dataset: { csAction: "approve-design" },
        onclick: function () { ctx.approve("design"); }
      }, icon("lock-open"), t("design.approve")));
    }
  }

  /* ---- filmstrip -------------------------------------------------------------------------------------------- */
  function buildFilm() {
    releaseFrames(film);
    clear(film);
    var dir = filmDirection(ctx);
    film.setAttribute("dir", dir);
    ctx.slides().forEach(function (s, i) {
      var f = ctx.slideFrame(s.id, "ui-film-frame");
      var fs = ctx.findingsOf(s.id).filter(function (x) { return !x.overridden; });
      var sev = fs.some(function (x) { return x.sev === "BLOCK"; }) ? "bad" : fs.some(function (x) { return x.sev === "FIX"; }) ? "warn" : "";
      var item = h("button", {
        type: "button", class: "ui-film-item", role: "option", dataset: { csSlideId: s.id },
        "aria-selected": String(s.id === ctx.sel), "aria-current": s.id === ctx.sel ? "true" : null,
        "aria-label": t("slide.n", { n: i + 1 }) + " · " + typeLabel(s.type),
        onclick: function () { ctx.select(s.id); }
      }, f.frame, h("span", { class: "ui-film-n", dir: "ltr" }, String(i + 1)), sev ? h("span", { class: "ui-film-dot ui-film-dot--" + sev, "aria-hidden": "true" }) : null);
      film.appendChild(item);
    });
    scrollFilmToSelected();
  }

  function paintFilmSelection() {
    Array.prototype.forEach.call(film.children, function (b) {
      var on = b.dataset.csSlideId === ctx.sel;
      b.setAttribute("aria-selected", String(on));
      if (on) b.setAttribute("aria-current", "true"); else b.removeAttribute("aria-current");
    });
    scrollFilmToSelected();
  }

  function scrollFilmToSelected() {
    var b = film.querySelector('[aria-current="true"]');
    if (b && b.scrollIntoView) { try { b.scrollIntoView({ block: "nearest", inline: "center" }); } catch (e) { /* older engines */ } }
  }

  film.addEventListener("keydown", function (e) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    var rtl = film.getAttribute("dir") === "rtl";
    var forward = (e.key === "ArrowLeft") === rtl;
    e.preventDefault();
    step(forward ? 1 : -1);
    var b = film.querySelector('[aria-current="true"]');
    if (b) b.focus();
  });

  /* ---- big editable slide ----------------------------------------------------------------------------------- */
  function currentValue(slide, field, index) {
    if (field === "bullets") return (slide.bullets || [])[index];
    if (field === "sides") return ((slide.sides || [])[index] || {}).text;
    return slide[field];
  }

  function commitSlot(slot) {
    var slide = ctx.slide();
    if (!slide) return false;
    var text = cleanText(readSlotText(slot.el));
    if (CS.vui?.commitFree && slide.free) return CS.vui.commitFree(ctx, slide, slot, text);
    var cur = currentValue(slide, slot.field, slot.index === null ? undefined : slot.index);
    if (text === (cur || "")) return false;
    if (slot.field === "bullets" && !text) {
      var list = (slide.bullets || []).slice();
      list.splice(slot.index, 1);
      ctx.setSlide(slide.id, { bullets: list.length ? list : [""] }, { origin: "inplace" });
    } else {
      ctx.setField(slide.id, slot.field, text, slot.index === null ? undefined : slot.index, { origin: "inplace" });
    }
    ctx.runTextQa();
    return true;
  }

  function slotLimit(slot) {
    var s = ctx.slide();
    return s ? fieldLimit(ctx, s, slot.field) : null;
  }

  function paintEditbar() {
    clear(editbar);
    if (!focusedSlot) { editbar.hidden = true; return; }
    editbar.hidden = false;
    var slot = focusedSlot;
    var text = readSlotText(slot.el).replace(/==/g, "");
    var n = ctx.words(text);
    var lim = slotLimit(slot);
    editbar.appendChild(h("span", { class: "ui-editbar-label" }, t("field." + slot.field)));
    editbar.appendChild(meter(n, lim && lim.soft, lim && lim.hard));
    if (lim && n > lim.soft) {
      editbar.appendChild(h("button", {
        type: "button", class: "ui-btn ui-btn--ghost ui-btn--xs", onmousedown: function (e) { e.preventDefault(); },
        onclick: function () { commitSlot(slot); ctx.setTab("slide"); ctx.regenerate(ctx.sel, "shorter"); }
      }, icon("sparkles"), t("design.shorten")));
    }
    editbar.appendChild(h("button", {
      type: "button", class: "ui-btn ui-btn--ghost ui-btn--xs", title: t("edit.emphasis.hint"),
      onmousedown: function (e) { e.preventDefault(); },
      onclick: function () { toggleEmphasisDom(slot.el); commitSlot(slot); }
    }, icon("highlighter"), t("edit.emphasis")));
  }

  function toggleEmphasisDom(slotEl) {
    var marks = slotEl.querySelectorAll("mark.cs-em");
    if (marks.length) {
      marks.forEach(function (m) { while (m.firstChild) m.parentNode.insertBefore(m.firstChild, m); m.remove(); });
      return;
    }
    var sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    try {
      if (sel.isCollapsed && sel.modify) { sel.modify("move", "backward", "word"); sel.modify("extend", "forward", "word"); }
    } catch (e) { /* selection.modify unsupported */ }
    if (sel.isCollapsed) return;
    var range = sel.getRangeAt(0);
    if (!slotEl.contains(range.commonAncestorContainer)) return;
    var mark = document.createElement("mark");
    mark.className = "cs-em";
    mark.appendChild(range.extractContents());
    range.insertNode(mark);
  }

  function bindEditing(render) {
    var slots = listSlots(render.el);
    slots.forEach(function (slot) {
      var node = slot.el;
      node.setAttribute("contenteditable", "true");
      node.setAttribute("spellcheck", "false");
      node.setAttribute("enterkeyhint", "done");
      node.setAttribute("role", "textbox");
      node.setAttribute("aria-label", t("field." + slot.field));
      node.addEventListener("focus", function () { focusedSlot = slot; paintEditbar(); });
      node.addEventListener("input", function () { paintEditbar(); });
      node.addEventListener("blur", function () {
        var changed = commitSlot(slot);
        setTimeout(function () {
          var a = document.activeElement;
          if (!(a && big.inner.contains(a) && a.isContentEditable)) {
            focusedSlot = null; paintEditbar();
            if (pendingRefresh && !changed) { pendingRefresh = false; loadEditor(); }
          }
        }, 60);
      });
      node.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
          e.preventDefault();
          if (slot.field === "headline") document.execCommand("insertLineBreak"); else node.blur();
        }
        if (e.key === "Escape") { e.preventDefault(); node.blur(); }
      });
      node.addEventListener("paste", function (e) {
        e.preventDefault();
        var txt = ((e.clipboardData || window.clipboardData).getData("text/plain") || "").replace(/\s*\n\s*/g, " ");
        insertPlain(txt);
      });
    });
  }

  function paintFitNotes(render) {
    clear(fitNotes);
    var issues = fitIssues(render);
    if (!issues.length) return;
    var s = ctx.slide();
    issues.slice(0, 2).forEach(function (x) {
      fitNotes.appendChild(h("div", { class: "ui-note ui-note--warn" }, icon("triangle-alert"),
        h("span", { html: bidi(t(x.status === "overflow" ? "design.fit.overflow" : "design.fit.floor", { role: t("role." + (x.role || "body")) })) }),
        h("span", { class: "ui-note-actions" },
          h("button", { type: "button", class: "ui-btn ui-btn--ghost ui-btn--xs", onclick: function () { ctx.setTab("slide"); ctx.regenerate(ctx.sel, "shorter"); } }, icon("sparkles"), t("design.shorten")),
          s ? h("button", { type: "button", class: "ui-btn ui-btn--ghost ui-btn--xs", onclick: function () { if (ctx.splitSlide(s.id)) toast(t("slide.split.done"), "ok"); } }, icon("scissors"), t("slide.split")) : null)));
    });
  }

  async function loadEditor() {
    var id = ctx.sel;
    if (!id || ctx.screen !== "design") { pendingRefresh = true; return; }
    var gen = ++editGen;
    big.frame.classList.add("is-loading");
    var r;
    try { r = await ctx.renderEditor(id); }
    catch (e) {
      if (gen !== editGen) return;
      big.frame.classList.remove("is-loading");
      big.frame.classList.add("is-failed");
      reportError("editor render", e);
      return;
    }
    if (gen !== editGen) return;
    big.frame.classList.remove("is-loading", "is-failed");
    var old = big.inner.querySelector(".cs-slide");
    if (old) old.remove();
    big.inner.insertBefore(r.el, big.inner.firstChild);
    big.frame.dataset.sid = id;
    ctx.editRender = r;
    focusedSlot = null;
    paintEditbar();
    bindEditing(r);
    paintGuides();
    paintFitNotes(r);
    if (ctx.pendingFocus) { var pf = ctx.pendingFocus; ctx.pendingFocus = null; setTimeout(function () { ctx.focusSlot(pf); }, 60); }
    if (ctx.markReady) ctx.markReady();
  }

  /** Move the caret into the slot that a QA finding points at (key like "s03.title"). */
  ctx.focusSlot = function (key) {
    if (!ctx.editRender) return false;
    var slots = listSlots(ctx.editRender.el);
    var hit = slots.filter(function (s) { return s.key === key; })[0] || slots.filter(function (s) { return key.indexOf("." + s.field) >= 0; })[0];
    if (!hit) return false;
    hit.el.scrollIntoView({ block: "nearest" });
    hit.el.focus();
    hit.el.classList.add("is-pulse");
    setTimeout(function () { hit.el.classList.remove("is-pulse"); }, 1600);
    return true;
  };

  /* ---- events ----------------------------------------------------------------------------------------------- */
  function refreshEditorSoon() {
    setTimeout(function () {
      var a = document.activeElement;
      if (a && big.inner.contains(a) && a.isContentEditable) { pendingRefresh = true; return; }
      loadEditor();
    }, 90);
  }

  ctx.bus.on("select", function () {
    paintCounter();
    paintFilmSelection();
    if (built) { if (ctx.screen === "design") loadEditor(); else pendingRefresh = true; if (ctx.tab !== "style") showTab(); }
  });
  ctx.bus.on("tab", function () { if (built) showTab(); });
  ctx.bus.on("spec", function (d) {
    if (!built) return;
    paintCounter();
    paintApprove();
    var selChanged = d.slides === "all" || d.structure || (d.slides && d.slides.indexOf(ctx.sel) >= 0);
    if (d.structure || d.slides === "all") buildFilm();
    if (selChanged && ctx.screen === "design") refreshEditorSoon(); else if (selChanged) pendingRefresh = true;
    if (d.origin !== "form" && d.origin !== "inplace" && !(Array.isArray(d.slides) && !d.slides.length)) showTab();
    else if (d.origin === "inplace" && ctx.tab === "text") { /* the Text tab edits the same fields: leave it alone while typing */ }
  });
  ctx.bus.on("thumbs", function () { if (built) { /* frames repaint themselves; refresh the dots */ refreshDots(); } });
  ctx.bus.on("qa", function () { if (built) refreshDots(); });
  ctx.bus.on("render-error", function () { big.frame.classList.add("is-failed"); });

  function refreshDots() {
    Array.prototype.forEach.call(film.children, function (item) {
      var id = item.dataset.csSlideId;
      var fs = ctx.findingsOf(id).filter(function (x) { return !x.overridden; });
      var sev = fs.some(function (x) { return x.sev === "BLOCK"; }) ? "bad" : fs.some(function (x) { return x.sev === "FIX"; }) ? "warn" : "";
      var dot = item.querySelector(".ui-film-dot");
      if (dot) dot.remove();
      if (sev) item.appendChild(h("span", { class: "ui-film-dot ui-film-dot--" + sev, "aria-hidden": "true" }));
    });
  }

  return {
    el: el,
    show: function () {
      if (!built) {
        built = true;
        buildFilm();
        showTab();
      }
      paintCounter();
      paintApprove();
      paintFilmSelection();
      loadEditor();
      pendingRefresh = false;
    },
    hide: function () { focusedSlot = null; },
    refreshTab: showTab
  };
}
