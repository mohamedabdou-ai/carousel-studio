/* ui/screen-check.js · the quality gates: every finding with what is wrong, how to fix it, and a jump to the element. */

function CheckScreen(ctx) {
  var el = h("section", { class: "ui-screen ui-screen--check", dataset: { csScreen: "check" }, "aria-labelledby": "ui-h-check" });
  var banner = h("div", { class: "ui-checkbanner" });
  var cueCard = h("div", {});
  var filterHost = h("div", { class: "ui-chips ui-chips--pick" });
  var list = h("div", { class: "ui-findings" });
  var extras = h("div", {});
  var filter = { BLOCK: true, FIX: true, NOTE: true };

  el.appendChild(h("header", { class: "ui-screen-head" }, h("h1", { class: "ui-h1", id: "ui-h-check" }, t("check.title")), h("p", { class: "ui-lede" }, t("check.lede"))));
  el.appendChild(banner);
  el.appendChild(cueCard);
  el.appendChild(filterHost);
  el.appendChild(list);
  el.appendChild(extras);

  function canAutofix() { return ctx.results().some(function (r) { var c = ctx.ruleOf(r); return !r.overridden && c && c.autofix; }); }

  function paintBanner() {
    clear(banner);
    var sum = ctx.summary();
    var running = ctx.qa.running;
    var kind = running ? "info" : sum.status === "block" ? "bad" : sum.status === "fix" ? "warn" : "ok";
    var title = running ? t("check.running") : t("check.status." + sum.status);
    var sub = running ? t("check.running.hint") : ctx.qa.stale ? t("check.partial") : (ctx.qa.at ? t("check.last", { time: new Date(ctx.qa.at).toLocaleTimeString(uiLang() === "en" ? "en-GB" : "ar-EG-u-nu-latn", { hour: "2-digit", minute: "2-digit" }) }) : "");
    banner.className = "ui-checkbanner ui-checkbanner--" + kind;
    banner.appendChild(h("div", { class: "ui-checkbanner-main" },
      running ? h("span", { class: "ui-spinner", "aria-hidden": "true" }) : icon(kind === "ok" ? "shield-check" : kind === "warn" ? "triangle-alert" : "circle-alert"),
      h("div", {}, h("strong", { class: "ui-checkbanner-title" }, title), sub ? h("p", { class: "ui-hint" }, sub) : null)));
    banner.appendChild(h("div", { class: "ui-checkbanner-actions" },
      h("button", { type: "button", class: "ui-btn ui-btn--secondary", disabled: running, onclick: function () { ctx.runQa(); } }, icon("refresh-cw"), t("check.run")),
      h("button", { type: "button", class: "ui-btn ui-btn--primary", dataset: { csAction: "auto-fix" }, disabled: running || !canAutofix(), onclick: function () { ctx.autoFix().then(function () { return ctx.runQa(); }); } }, icon("wand-sparkles"), t("check.autofix"))));
  }

  function paintCue() {
    clear(cueCard);
    var loc = ctx.spec.locale;
    cueCard.appendChild(h("details", { class: "ui-card ui-details ui-cuecard" },
      h("summary", {}, icon("info"), t("check.cue.why")),
      h("p", { class: "ui-hint", html: bidi(t("cue.reason." + loc.swipeCue)) }),
      h("p", { class: "ui-hint", html: bidi(t("cue.verify")) })));
  }

  function paintFilters() {
    clear(filterHost);
    var all = ctx.results();
    ["BLOCK", "FIX", "NOTE"].forEach(function (sev) {
      var n = all.filter(function (r) { return r.sev === sev && !r.overridden; }).length;
      filterHost.appendChild(h("button", {
        type: "button", class: "ui-chip-btn ui-chip-btn--" + sev.toLowerCase(), "aria-pressed": String(filter[sev]),
        onclick: function () { filter[sev] = !filter[sev]; paintFilters(); paintList(); }
      }, t("sev." + sev), h("span", { class: "ui-chip-count" }, String(n))));
    });
  }

  function jump(r) {
    if (r.el && r.el.indexOf("caption.") === 0) {
      ctx.go("copy");
      setTimeout(function () {
        var f = ctx.root.querySelector('[data-cs-screen="copy"] [data-field="' + r.el.slice(8) + '"]');
        if (f) { f.scrollIntoView({ block: "center" }); f.focus(); }
      }, 120);
      return;
    }
    if (r.slide) {
      ctx.select(r.slide);
      var onImage = /^A1\./.test(r.rule || r.gate || "");
      ctx.pendingFocus = onImage ? null : (r.el || null);
      ctx.go("design");
      /* findings about an image (the text check, the AI flag, the calm zone) are settled on the Visual tab */
      if (onImage) ctx.setTab("visual");
    }
  }

  async function doOverride(r) {
    var reason = await askText({
      title: t("check.override.title"), text: t("check.override.text", { gate: r.rule || r.gate }), placeholder: t("check.override.ph"), confirm: t("check.override.confirm")
    });
    if (reason === null) return;
    if (!reason) { toast(t("check.override.need-reason"), "warn"); return; }
    if (ctx.override(r, reason)) toast(t("check.override.done"), "ok");
  }

  function findingCard(r) {
    var c = ctx.ruleOf(r);
    var over = ctx.isOverridable(r);
    var fix = msgOf(r.fix);
    var acts = h("div", { class: "ui-finding-actions" });
    if (r.slide || (r.el && r.el.indexOf("caption.") === 0)) acts.appendChild(h("button", { type: "button", class: "ui-btn ui-btn--ghost ui-btn--sm", onclick: function () { jump(r); } }, icon("arrow-left", "ui-i-dir"), t("check.jump")));
    if ((r.rule || r.gate) === "SRC1.missing" && !r.overridden) acts.appendChild(h("button", { type: "button", class: "ui-btn ui-btn--ghost ui-btn--sm", dataset: { csAction: "attest-number" }, onclick: function () { ctx.attestNumber(r); } }, icon("badge-check"), t("check.attest")));
    if (/^D4/.test(r.rule || r.gate)) acts.appendChild(h("button", { type: "button", class: "ui-btn ui-btn--ghost ui-btn--sm", onclick: function () { ctx.go("design"); ctx.setTab("style"); } }, icon("circle-help"), t("style.accent.why")));
    if (c && c.autofix) acts.appendChild(pill(t("check.autofixable"), "info", "wand-sparkles"));
    if (over && !r.overridden && r.sev !== "NOTE") acts.appendChild(h("button", { type: "button", class: "ui-btn ui-btn--ghost ui-btn--sm", onclick: function () { doOverride(r); } }, icon("lock-open"), t("check.override")));
    return h("article", { class: "ui-finding ui-finding--" + r.sev.toLowerCase(), dataset: { gate: r.gate, rule: r.rule || "", sid: r.slide || "" } },
      h("div", { class: "ui-finding-head" },
        pill(t("sev." + r.sev), r.sev === "BLOCK" ? "bad" : r.sev === "FIX" ? "warn" : "mute"),
        h("code", { class: "ui-finding-gate", dir: "ltr" }, r.rule || r.gate),
        r.slide ? h("button", { type: "button", class: "ui-finding-slide", onclick: function () { jump(r); } }, t("slide.n", { n: ctx.index(r.slide) + 1 })) : null),
      h("p", { class: "ui-finding-msg", html: bidi(msgOf(r.msg)) }),
      fix ? h("p", { class: "ui-finding-fix", html: bidi(fix) }) : null,
      r.overridden ? h("p", { class: "ui-hint" }, icon("lock-open"), t("check.overridden", { reason: r.overridden.reason })) : null,
      acts);
  }

  function paintList() {
    clear(list);
    var all = ctx.results();
    if (ctx.qa.exportBlocks && ctx.qa.exportBlocks.length) all = all.concat(ctx.qa.exportBlocks);
    var active = all.filter(function (r) { return !r.overridden && filter[r.sev]; });
    var over = all.filter(function (r) { return r.overridden; });
    if (!all.length && !ctx.qa.running) {
      list.appendChild(h("div", { class: "ui-empty ui-empty--ok" }, icon("shield-check"), h("strong", {}, t("check.empty.title")), h("p", { class: "ui-hint" }, t("check.empty.text"))));
      return;
    }
    active.forEach(function (r) { list.appendChild(findingCard(r)); });
    if (!active.length && !ctx.qa.running) list.appendChild(h("p", { class: "ui-empty" }, t("check.filtered")));
    if (over.length) {
      list.appendChild(h("h2", { class: "ui-h2 ui-h2--sec" }, t("check.overrides")));
      over.forEach(function (r) { list.appendChild(findingCard(r)); });
    }
  }

  function paint() {
    paintBanner(); paintCue(); paintFilters(); paintList();
    clear(extras);
    runExtensions(extras, CS.ui._.checkExtras, ctx, ctx.slide());
  }

  ctx.bus.on("qa", function () { if (!el.hidden) paint(); });
  ctx.bus.on("spec", function (d) { if (!el.hidden && d.origin !== "qa") paint(); });

  return {
    el: el,
    show: function () {
      paint();
      if ((ctx.qa.stale || !ctx.qa.all) && !ctx.qa.running) { ctx.runTextQa(); ctx.runQa(); }
    },
    hide: function () { }
  };
}
