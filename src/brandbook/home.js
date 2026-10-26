/* ui/brand-home.js · Brand Home: the long-lived page of one brand (Brand Book, Plan, Ideas, Posts). CONTRACT 8.7. */

var HOME_TABS = ["book", "plan", "ideas", "posts", "team"];
var STATUS_ORDER = ["idea", "angled", "scripted", "designed", "exported", "posted"];

function mountBrandHome(root, data) {
  if (!data || !data.brand) throw new CS.CSError("E_SCHEMA", "mountBrandHome needs a brand");
  U.captureBoot(root);
  U.loadUiStrings();
  var saved = U.local.get("cs-theme", null);
  if (saved && !document.documentElement.getAttribute("data-theme")) U.applyTheme(saved);
  var pref = U.local.get("cs-ui-dialect", null);
  var brandDialect = data.brand.locale && (data.brand.locale.uiDialect || data.brand.locale.dialect);
  U.setUiDialect(pref && U.UI_DIALECTS.indexOf(pref) >= 0 ? pref : (data.config && data.config.uiDialect) || brandDialect || "msa-white");

  var state = {
    brand: clone(data.brand), base: clone(data.brand), dirty: false, tab: U.local.get("cs-home-tab", "book"), writer: true,
    plan: data.plan || null, ideas: data.ideas || (data.plan && data.plan.ideaBank) || [], posts: data.posts || [],
    filter: { pillar: "", intent: "" }
  };
  if (HOME_TABS.indexOf(state.tab) < 0) state.tab = "book";
  var chrome = {};
  var book = null;

  function paintTop() {
    var b = state.brand;
    chrome.title.textContent = b.name;
    clear(chrome.state);
    chrome.state.appendChild(document.createTextNode(b.approvedAt ? t("home.approved", { v: b.version, date: fmtDate(b.approvedAt, uiLang()) }) : t("home.draft")));
    if (state.dirty) chrome.state.appendChild(h("span", { class: "ui-dirty" }, t("top.unsaved")));
    chrome.save.disabled = !state.dirty;
  }

  /* ---- publishing ------------------------------------------------------------------------------------------- */
  async function save() {
    var pub = await U.useCap("publish");
    var can = pub ? await U.canPublish() : false;
    var next = clone(state.brand);
    next.updatedAt = isoNow();
    if (pub && can && state.writer) {
      try {
        await pub.publish(U.serializeBrandHome(next));
        state.brand = next; state.base = clone(next); state.dirty = false; paintTop();
        toast(t("save.done"), "ok");
        return { ok: true, mode: "publish", rev: next.version };
      } catch (e) {
        if (e && e.code === "conflict") { toast(t("save.conflict.toast"), "warn"); return { ok: false, mode: "publish", rev: state.brand.version, conflict: true }; }
        if (["not_writer", "not_granted", "consent_required", "capability_disabled", "capability_removed", "not_declared"].indexOf(e && e.code) >= 0) state.writer = false;
        else { reportError("brand save", e); toast(t("save.failed"), "error"); return { ok: false, mode: "publish", rev: state.brand.version }; }
      }
    }
    await downloadBrand();
    return { ok: true, mode: "patch", rev: state.brand.version };
  }

  async function downloadBrand() {
    var dl = await U.useCap("downloads");
    var text = JSON.stringify(state.brand, null, 2) + "\n";
    if (!dl) { await copyWithFeedback(text, t("home.brand-json")); return; }
    try { await dl.save({ filename: (state.brand.slug || "brand") + ".brand.json", data: text }); toast(t("export.saved", { n: 1 }), "ok"); }
    catch (e) { if (!(e && e.code === "declined")) toast(t("export.failed", { n: 1 }), "error"); }
  }

  async function approveBook() {
    var ok = await dialog({
      title: t("home.approve.title"), body: t("home.approve.text"),
      actions: [{ label: t("common.cancel"), value: false, kind: "ghost" }, { label: t("home.approve"), value: true, kind: "primary" }]
    });
    if (!ok) return null;
    var now = isoNow();
    state.brand.version = (state.brand.version || 0) + 1;
    state.brand.approvedAt = now;
    state.brand.onboarding = Object.assign({}, state.brand.onboarding, { bookApprovedAt: now });
    state.dirty = true;
    paintTop();
    CS.emit("cs:approve", { checkpoint: "design", rev: state.brand.version });
    return save();
  }

  function capsule() {
    var b = state.brand, l = b.locale || {}, v = b.visual || {}, p = v.palette || {}, f = v.fonts || {};
    var use = ((b.voice && b.voice.use) || []).slice(0, 8).join("، ");
    var avoid = ((b.voice && b.voice.avoid) || []).slice(0, 8).join("، ");
    var lines = [
      "[Carousel Studio brand capsule v1]",
      "brand: " + b.name + " (" + b.slug + ") | dialect: " + l.dialect + " | register: " + l.register + " | digits: " + l.digits + " | swipe: " + l.swipeCue,
      ("voice: " + (use ? "use " + use : "") + (avoid ? " ; avoid " + avoid : "")).slice(0, 210),
      "palette: bg " + (p.bg || "-") + " ink " + (p.ink || "-") + " accent " + (p.accent || "-") + " | fonts: " + [f.display, f.body, f.latin].filter(Boolean).join(" / ") + " | preset: " + (v.presetId || "-"),
      "home: " + (b.homeUrl || "-")
    ];
    return lines.join("\n");
  }

  /* ---- tabs ------------------------------------------------------------------------------------------------- */
  function paintBook() {
    clear(chrome.panel);
    var host = h("div", { class: "ui-bookhost" });
    chrome.panel.appendChild(host);
    chrome.panel.appendChild(h("div", { class: "ui-actionbar" },
      h("div", { class: "ui-actionbar-info" }, state.brand.approvedAt ? pill(t("home.approved", { v: state.brand.version, date: fmtDate(state.brand.approvedAt, uiLang()) }), "ok", "circle-check") : pill(t("home.draft"), "mute")),
      h("div", { class: "ui-row ui-row--wrap" },
        h("button", { type: "button", class: "ui-btn ui-btn--ghost ui-home-secondary", onclick: function () { copyWithFeedback(capsule(), t("home.capsule")); } }, icon("copy"), t("home.capsule.copy")),
        h("button", { type: "button", class: "ui-btn ui-btn--ghost ui-home-secondary", onclick: printable }, icon("download"), t("home.print")),
        h("button", { type: "button", class: "ui-btn ui-btn--primary", dataset: { csAction: "approve-brand" }, onclick: approveBook }, icon("badge-check"), t("home.approve")))));
    if (CS.ui.brandBook && CS.ui.brandBook.mount) {
      if (book) { try { book.destroy(); } catch (e) { /* ignore */ } }
      book = CS.ui.brandBook.mount(host, state.brand, {
        sampleHook: pickSampleHook(),
        onChange: function (patch) {
          state.brand = deepMerge(state.brand, patch);
          state.dirty = !same(state.brand, state.base);
          paintTop();
        }
      });
    } else host.appendChild(h("p", { class: "ui-empty" }, t("home.book.unavailable")));
  }

  function pickSampleHook() {
    var b = state.brand;
    return (b.voice && b.voice.samples && b.voice.samples[0] && String(b.voice.samples[0]).split(/[.\n؟?!]/)[0].trim().slice(0, 60)) || b.name;
  }

  async function printable() {
    if (!book) return;
    var html = book.toPrintableHtml();
    var dl = await U.useCap("downloads");
    if (!dl) { toast(t("export.no-downloads"), "warn"); return; }
    try { await dl.save({ filename: (state.brand.slug || "brand") + "-brand-book.html", data: html }); toast(t("home.print.saved"), "ok"); }
    catch (e) { if (!(e && e.code === "declined")) toast(t("export.failed", { n: 1 }), "error"); }
  }

  function statusPill(s) {
    var kind = s === "posted" || s === "exported" ? "ok" : s === "designed" || s === "scripted" ? "info" : "mute";
    return pill(t("status." + s), kind);
  }

  function paintPlan() {
    clear(chrome.panel);
    var plan = state.plan;
    if (!plan) { chrome.panel.appendChild(emptyState("calendar", t("home.plan.empty"), t("home.plan.empty.hint"))); return; }
    var slots = (plan.slots || []).slice().sort(function (a, b) { return (a.date + (a.time || "")).localeCompare(b.date + (b.time || "")); });
    var counts = {};
    slots.forEach(function (s) { counts[s.status] = (counts[s.status] || 0) + 1; });
    var head = h("div", { class: "ui-card ui-card--hero" },
      h("div", { class: "ui-eyebrow" }, t("home.plan.period")),
      h("p", { class: "ui-topic", dir: "ltr" }, plan.period),
      h("div", { class: "ui-chips" },
        h("span", { class: "ui-chip" }, h("span", { class: "ui-chip-k" }, t("home.plan.goal")), h("span", { class: "ui-chip-v" }, t("goal." + plan.goal))),
        plan.cadence ? h("span", { class: "ui-chip" }, h("span", { class: "ui-chip-k" }, t("home.plan.cadence")), h("span", { class: "ui-chip-v" }, t("home.plan.perweek", { n: plan.cadence.perWeek }))) : null,
        plan.cadence && plan.cadence.tz ? h("span", { class: "ui-chip" }, h("span", { class: "ui-chip-k" }, t("home.plan.tz")), h("bdi", { class: "ui-chip-v", dir: "ltr" }, plan.cadence.tz)) : null),
      h("div", { class: "ui-chips" }, STATUS_ORDER.filter(function (s) { return counts[s]; }).map(function (s) { return h("span", { class: "ui-chip" }, statusPill(s), h("span", { class: "ui-chip-v", dir: "ltr" }, String(counts[s]))); })));
    chrome.panel.appendChild(head);
    if (!slots.length) { chrome.panel.appendChild(emptyState("calendar", t("home.plan.noslots"), "")); return; }
    var list = h("div", { class: "ui-slots" });
    slots.forEach(function (s) {
      var d = new Date(s.date + "T00:00:00");
      var wd = d.toLocaleDateString(uiLang() === "en" ? "en-GB" : "ar-EG-u-nu-latn", { weekday: "long" });
      var pillar = ((state.brand.strategy && state.brand.strategy.pillars) || []).filter(function (p) { return p.id === s.pillarId; })[0];
      list.appendChild(h("article", { class: "ui-slot" },
        h("div", { class: "ui-slot-date" }, h("strong", { dir: "ltr" }, s.date.slice(8)), h("small", {}, wd)),
        h("div", { class: "ui-slot-body" },
          h("p", { class: "ui-slot-title", html: bidi(s.title || (s.architecture ? t("arch." + s.architecture) : t("home.plan.untitled"))) }),
          h("div", { class: "ui-chips" },
            s.time ? h("span", { class: "ui-chip" }, h("bdi", { class: "ui-chip-v", dir: "ltr" }, s.time)) : null,
            pillar ? h("span", { class: "ui-chip" }, h("span", { class: "ui-chip-v" }, pillar.name)) : null,
            h("span", { class: "ui-chip" }, h("span", { class: "ui-chip-v" }, t("intent." + s.intent))),
            h("span", { class: "ui-chip" }, h("span", { class: "ui-chip-v" }, t("format." + s.format))),
            statusPill(s.status)),
          s.note ? h("p", { class: "ui-hint", html: bidi(s.note) }) : null),
        s.studioUrl ? h("a", { class: "ui-btn ui-btn--secondary ui-btn--sm", href: s.studioUrl, target: "_blank", rel: "noopener noreferrer" }, icon("external-link"), t("home.open-studio")) : null));
    });
    chrome.panel.appendChild(list);
  }

  function emptyState(ic, title, text) {
    return h("div", { class: "ui-empty" }, icon(ic), h("strong", {}, title), text ? h("p", { class: "ui-hint" }, text) : null);
  }

  function paintIdeas() {
    clear(chrome.panel);
    var ideas = state.ideas || [];
    if (!ideas.length) { chrome.panel.appendChild(emptyState("lightbulb", t("home.ideas.empty"), t("home.ideas.empty.hint"))); return; }
    var pillars = (state.brand.strategy && state.brand.strategy.pillars) || [];
    var bar = h("div", { class: "ui-chips ui-chips--pick" });
    bar.appendChild(h("button", { type: "button", class: "ui-chip-btn", "aria-pressed": String(!state.filter.pillar), onclick: function () { state.filter.pillar = ""; paintIdeas(); } }, t("home.ideas.all")));
    pillars.forEach(function (p) {
      bar.appendChild(h("button", { type: "button", class: "ui-chip-btn", "aria-pressed": String(state.filter.pillar === p.id), onclick: function () { state.filter.pillar = p.id; paintIdeas(); } }, p.name));
    });
    chrome.panel.appendChild(bar);
    var shown = ideas.filter(function (i) { return !state.filter.pillar || i.pillarId === state.filter.pillar; });
    var list = h("div", { class: "ui-ideas" });
    shown.forEach(function (i) {
      var pillar = pillars.filter(function (p) { return p.id === i.pillarId; })[0];
      list.appendChild(h("article", { class: "ui-idea" },
        h("p", { class: "ui-idea-text", html: bidi(i.text) }),
        h("div", { class: "ui-chips" },
          pillar ? h("span", { class: "ui-chip" }, h("span", { class: "ui-chip-v" }, pillar.name)) : null,
          (i.intents || []).map(function (n) { return h("span", { class: "ui-chip" }, h("span", { class: "ui-chip-v" }, t("intent." + n))); }),
          i.source ? h("span", { class: "ui-chip" }, h("span", { class: "ui-chip-k" }, t("home.ideas.source")), h("span", { class: "ui-chip-v" }, t("source." + i.source))) : null),
        h("button", { type: "button", class: "ui-btn ui-btn--ghost ui-btn--sm", onclick: function () { copyWithFeedback(t("home.ideas.prompt", { idea: i.text }), t("home.ideas.copy")); } }, icon("copy"), t("home.ideas.start"))));
    });
    chrome.panel.appendChild(list);
  }

  function paintPosts() {
    clear(chrome.panel);
    var posts = state.posts || [];
    if (!posts.length) { chrome.panel.appendChild(emptyState("layout-grid", t("home.posts.empty"), t("home.posts.empty.hint"))); return; }
    var list = h("div", { class: "ui-slots" });
    posts.forEach(function (p) {
      list.appendChild(h("article", { class: "ui-slot" },
        h("div", { class: "ui-slot-date" }, p.date ? [h("strong", { dir: "ltr" }, p.date.slice(8)), h("small", {}, p.date.slice(0, 7))] : icon("layers")),
        h("div", { class: "ui-slot-body" }, h("p", { class: "ui-slot-title", html: bidi(p.title) }), h("div", { class: "ui-chips" }, statusPill(p.status))),
        p.studioUrl ? h("a", { class: "ui-btn ui-btn--secondary ui-btn--sm", href: p.studioUrl, target: "_blank", rel: "noopener noreferrer" }, icon("external-link"), t("home.open-studio")) : null));
    });
    chrome.panel.appendChild(list);
  }

  /** The values the last two posts shared: a third time would repeat the same family, move or recipe three posts running. */
  function teamRest(memory) {
    var out = [];
    if (memory.length < 2) return out;
    var a = memory[memory.length - 2], b = memory[memory.length - 1];
    [["family", "team.k.family", function (v) { return v; }], ["move", "team.k.move", function (v) { return t("team.move." + v); }],
      ["motion", "team.k.motion", function (v) { return v; }], ["preset", "team.k.preset", function (v) { return v; }],
      ["intent", "team.k.intent", function (v) { return t("intent." + v); }]].forEach(function (k) {
      if (a[k[0]] && a[k[0]] === b[k[0]]) out.push(t(k[1]) + ": " + k[2](b[k[0]]));
    });
    return out;
  }

  function paintTeam() {
    clear(chrome.panel);
    var memory = (state.brand.creativeMemory || []).slice();
    chrome.panel.appendChild(h("div", { class: "ui-card ui-card--hero" },
      h("div", { class: "ui-eyebrow" }, t("home.team.title")),
      h("p", { class: "ui-hint" }, t("home.team.hint", { n: 30 }))));
    if (!memory.length) { chrome.panel.appendChild(emptyState("users", t("home.team.empty"), t("home.team.empty.hint"))); return; }
    var rest = teamRest(memory);
    if (rest.length) chrome.panel.appendChild(h("p", { class: "ui-note", dataset: { csTeamRest: "" } }, icon("info"), h("span", { html: bidi(t("home.team.rest") + " " + rest.join("، ")) })));
    var ctas = [];
    memory.slice(-2).forEach(function (e) { if (e.cta && ctas.indexOf(t("cta.kind." + e.cta)) < 0) ctas.push(t("cta.kind." + e.cta)); });
    if (ctas.length) chrome.panel.appendChild(h("p", { class: "ui-note", dataset: { csTeamCta: "" } }, icon("info"), h("span", { html: bidi(t("home.team.cta") + " " + ctas.join("، ")) })));
    var list = h("div", { class: "ui-slots" });
    memory.slice().reverse().forEach(function (e) {
      list.appendChild(h("article", { class: "ui-slot", dataset: { csMemory: e.postId } },
        h("div", { class: "ui-slot-date" }, e.date ? [h("strong", { dir: "ltr" }, e.date.slice(8)), h("small", {}, e.date.slice(0, 7))] : icon("users")),
        h("div", { class: "ui-slot-body" },
          h("p", { class: "ui-slot-title", html: bidi(e.idea) }),
          e.hook ? h("p", { class: "ui-hint" }, t("team.hook") + ": ", h("span", { html: bidi(e.hook) })) : null,
          h("div", { class: "ui-chips" },
            e.family ? h("span", { class: "ui-chip" }, h("span", { class: "ui-chip-k" }, t("team.k.family")), h("bdi", { class: "ui-chip-v", dir: "ltr" }, e.family)) : null,
            e.move ? h("span", { class: "ui-chip" }, h("span", { class: "ui-chip-k" }, t("team.k.move")), h("span", { class: "ui-chip-v" }, t("team.move." + e.move))) : null,
            e.preset ? h("span", { class: "ui-chip" }, h("span", { class: "ui-chip-k" }, t("team.k.preset")), h("bdi", { class: "ui-chip-v", dir: "ltr" }, e.preset)) : null,
            e.motion ? h("span", { class: "ui-chip" }, h("span", { class: "ui-chip-k" }, t("team.k.motion")), h("bdi", { class: "ui-chip-v", dir: "ltr" }, e.motion)) : null,
            e.intent ? h("span", { class: "ui-chip" }, h("span", { class: "ui-chip-v" }, t("intent." + e.intent))) : null,
            e.pitch ? h("span", { class: "ui-chip" }, h("span", { class: "ui-chip-k" }, t("team.k.pitch")), h("span", { class: "ui-chip-v" }, t("team.pitch." + e.pitch))) : null,
            e.cta ? h("span", { class: "ui-chip" }, h("span", { class: "ui-chip-k" }, t("team.k.cta")), h("span", { class: "ui-chip-v" }, t("cta.kind." + e.cta))) : null,
            e.series ? h("span", { class: "ui-chip" }, h("span", { class: "ui-chip-k" }, t("team.k.series")), h("span", { class: "ui-chip-v", html: bidi(e.series) })) : null,
            e.panel ? h("span", { class: "ui-chip", dataset: { csPanel: "" } }, h("span", { class: "ui-chip-k" }, t("team.k.panel")), h("span", { class: "ui-chip-v" }, t("team.panel", { n: e.panel.stops }) + (e.panel.depth && e.panel.slides ? " · " + t("team.panel.depth", { d: e.panel.depth, n: e.panel.slides }) : ""))) : null,
            e.verdict ? statusChip(t("team.verdict." + e.verdict), e.verdict) : null),
          e.loved ? h("p", { class: "ui-hint" }, icon("heart"), " " + t("team.loved") + ": ", h("span", { html: bidi(e.loved) })) : null,
          e.rejected ? h("p", { class: "ui-hint" }, icon("x"), " " + t("team.rejected") + ": ", h("span", { html: bidi(e.rejected) })) : null)));
    });
    chrome.panel.appendChild(list);
  }

  function statusChip(label, verdict) {
    return pill(label, verdict === "ship" ? "ok" : verdict === "killed" ? "bad" : "info");
  }

  function paintTab() {
    HOME_TABS.forEach(function (n) {
      var b = chrome.tabs.querySelector('[data-cs-tab="' + n + '"]');
      b.setAttribute("aria-selected", String(n === state.tab));
    });
    if (state.tab === "book") paintBook(); else if (state.tab === "plan") paintPlan(); else if (state.tab === "ideas") paintIdeas(); else if (state.tab === "team") paintTeam(); else paintPosts();
  }

  function openMenu2() {
    var theme = U.currentTheme();
    var next = theme === "auto" ? "light" : theme === "light" ? "dark" : "auto";
    openMenu(chrome.menu, [
      { label: t("menu.theme", { mode: t("theme." + theme) }), hint: t("theme." + next), icon: theme === "dark" ? "moon" : "sun", onSelect: function () { U.applyTheme(next); } },
      { label: U.dialect() === "en" ? t("menu.lang.ar") : t("menu.lang.en"), icon: "languages", onSelect: function () {
        var target = U.dialect() === "en" ? ((data.config && data.config.uiDialect && data.config.uiDialect !== "en") ? data.config.uiDialect : "msa-white") : "en";
        U.local.set("cs-ui-dialect", target); U.setUiDialect(target); build();
      } },
      { divider: true },
      ...(window.matchMedia("(max-width:759px)").matches ? [
        { label: t("home.capsule.copy"), icon: "copy", onSelect: function () { copyWithFeedback(capsule(), t("home.capsule")); } },
        { label: t("home.print"), icon: "download", onSelect: printable }
      ] : []),
      { label: t("home.brand-json"), icon: "download", onSelect: downloadBrand }
    ]);
  }

  function build() {
    clear(root);
    root.className = "ui-app ui-app--home";
    root.setAttribute("dir", uiDir());
    root.setAttribute("lang", uiLang());
    chrome.title = h("span", { class: "ui-doc-title" });
    chrome.state = h("span", { class: "ui-doc-state" });
    chrome.save = h("button", { type: "button", class: "ui-btn ui-btn--primary", dataset: { csAction: "save" }, onclick: save }, icon("save"), h("span", {}, t("top.save")));
    chrome.menu = h("button", { type: "button", class: "ui-btn ui-btn--icon ui-btn--ghost", "aria-label": t("top.menu"), "aria-haspopup": "menu", onclick: openMenu2 }, icon("ellipsis"));
    chrome.tabs = h("div", { class: "ui-tabs ui-tabs--page", role: "tablist", "aria-label": t("home.tabs") },
      HOME_TABS.map(function (n) {
        return h("button", { type: "button", role: "tab", class: "ui-tab", dataset: { csTab: n }, onclick: function () { state.tab = n; U.local.set("cs-home-tab", n); paintTab(); } },
          icon(n === "book" ? "book-open" : n === "plan" ? "calendar" : n === "ideas" ? "lightbulb" : n === "team" ? "users" : "layout-grid"), h("span", {}, t("home.tab." + n)));
      }));
    chrome.panel = h("section", { class: "ui-screen ui-home-panel", role: "tabpanel" });
    var foot = h("footer", { class: "ui-foot" }, hasStr("about.credit") ? h("span", { class: "ui-credit", dataset: { csCredit: "" } }, t("about.credit")) : null);
    var layer = h("div", { class: "ui-layer" });
    root.appendChild(h("header", { class: "ui-top" }, h("div", { class: "ui-top-in" },
      h("div", { class: "ui-wordmark" }, markSvg(), h("span", { class: "ui-wordmark-text" }, t("home.app"))),
      h("div", { class: "ui-doc" }, chrome.title, chrome.state),
      h("div", { class: "ui-top-actions" }, chrome.save, chrome.menu))));
    root.appendChild(h("main", { class: "ui-main ui-main--home", id: "ui-main" }, chrome.tabs, chrome.panel, foot));
    root.appendChild(layer);
    U.setLayer(layer);
    paintTop();
    paintTab();
  }

  build();
  window.__csReady = false;
  var fonts = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
  fonts.then(function () { return raf(); }).then(function () { return raf(); }).then(function () { window.__csReady = true; CS.emit("cs:ready", { ms: 0 }); });

  var controller = {
    getBrand: function () { return state.brand; },
    setBrand: function (brand) { state.brand = clone(brand); state.dirty = !same(state.brand, state.base); paintTop(); paintTab(); },
    setTab: function (n) { if (HOME_TABS.indexOf(n) >= 0) { state.tab = n; paintTab(); } },
    approveBook: approveBook,
    save: save,
    copyCapsule: async function () { var c = capsule(); await copyWithFeedback(c, t("home.capsule")); return c; },
    destroy: function () { if (book) { try { book.destroy(); } catch (e) { /* ignore */ } } clear(root); }
  };
  CS.ui.currentHome = controller;
  return controller;
}

/** Deep merge for plain JSON objects; arrays and scalars in `patch` replace. */
function deepMerge(base, patch) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return patch;
  var out = Object.assign({}, base);
  Object.keys(patch).forEach(function (k) {
    out[k] = patch[k] && typeof patch[k] === "object" && !Array.isArray(patch[k]) && base && typeof base[k] === "object" && base[k] ? deepMerge(base[k], patch[k]) : patch[k];
  });
  return out;
}
