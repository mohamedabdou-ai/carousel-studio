/* ui/screen-script.js · checkpoint 2: review and edit the whole script as wireframe cards, then approve it. */

function sevPill(sev, n) {
  return pill(String(n), sev === "BLOCK" ? "bad" : sev === "FIX" ? "warn" : "mute", sev === "BLOCK" ? "circle-alert" : sev === "FIX" ? "triangle-alert" : "info");
}

function typeLabel(type) { return t("type." + type); }

/** Where a hook's cover goes on slide 1 (compression.md): all of it in the headline when it fits the hero limit; else the
 * first beat (up to «…») in the headline and the second beat in the sub line, the way the hook engine scored it. */
function placeCover(cover, heroMax, wc) {
  var s = String(cover || "").trim();
  if (!s || !heroMax || wc(s) <= heroMax) return { headline: s };
  var m = /…|\.{3}/.exec(s);
  if (!m) return { headline: s };
  var head = s.slice(0, m.index + m[0].length).trim();
  var rest = s.slice(m.index + m[0].length).replace(/^[\s.…]+/, "").trim();
  if (!rest || wc(head) > heroMax) return { headline: s };
  return { headline: head, sub: rest };
}

/** The creative team's log (spec.ext.teamLog: at most six lines, one per key, each a decision and its reason); read-only, null when the post has none. */
function teamLogCard(spec) {
  var log = ((spec.ext || {}).teamLog || []).filter(function (e) { return e && e.t && hasStr("team.log." + e.k); }).slice(0, 6);
  if (!log.length) return null;
  return h("details", { class: "ui-card ui-team", open: true, dataset: { csTeamLog: "" } },
    h("summary", { class: "ui-eyebrow" }, icon("users"), " " + t("team.log.title")),
    h("ul", { class: "ui-team-list" }, log.map(function (e) { return h("li", {}, h("strong", {}, t("team.log." + e.k) + ": "), h("span", { html: bidi(e.t) })); })));
}

/** Open the "add a slide" menu; `at` is the insertion index. */
function openAddMenu(ctx, anchor, at) {
  openMenu(anchor, addableTypes().map(function (type) {
    return { label: typeLabel(type), icon: "plus", onSelect: function () { var id = ctx.insertSlide(type, at); if (id) { ctx.select(id); toast(t("slide.added"), "ok"); } } };
  }));
}

async function confirmDelete(ctx, slide) {
  var ok = await dialog({
    title: t("slide.delete.title"), body: t("slide.delete.text", { n: slide.n }),
    actions: [{ label: t("common.cancel"), value: false, kind: "ghost" }, { label: t("common.delete"), value: true, kind: "danger" }]
  });
  if (ok && ctx.removeSlide(slide.id)) toast(t("slide.deleted"), "info", { action: { label: t("common.undo"), fn: function () { ctx.undo(); } } });
}

/** Menu shared by the Script cards and the Design "Slide" tab. */
function slideMenu(ctx, anchor, slide) {
  var i = ctx.index(slide.id), n = ctx.slides().length;
  openMenu(anchor, [
    { label: t("slide.move-up"), icon: "arrow-up", disabled: i <= 0, onSelect: function () { ctx.moveSlide(slide.id, -1); } },
    { label: t("slide.move-down"), icon: "arrow-down", disabled: i >= n - 1, onSelect: function () { ctx.moveSlide(slide.id, 1); } },
    { divider: true },
    { label: t("slide.duplicate"), icon: "copy-plus", onSelect: function () { var id = ctx.duplicateSlide(slide.id); if (id) ctx.select(id); } },
    { label: t("slide.split"), icon: "scissors", onSelect: function () { if (ctx.splitSlide(slide.id)) toast(t("slide.split.done"), "ok", { action: { label: t("common.undo"), fn: function () { ctx.undo(); } } }); else toast(t("slide.split.none"), "info"); } },
    { label: t("slide.add-after"), icon: "plus", onSelect: function () { openAddMenu(ctx, anchor, i + 1); } },
    { divider: true },
    { label: t("common.delete"), icon: "trash-2", danger: true, disabled: n <= 1, onSelect: function () { confirmDelete(ctx, slide); } }
  ]);
}

function findingLine(ctx, r) {
  var fix = msgOf(r.fix);
  return h("li", { class: "ui-find ui-find--" + r.sev.toLowerCase() },
    h("span", { class: "ui-find-dot", "aria-hidden": "true" }),
    h("span", { class: "ui-find-gate" }, r.rule || r.gate),
    h("span", { class: "ui-find-msg", html: bidi(msgOf(r.msg)) + (fix ? ' <span class="ui-find-fix">' + bidi(fix) + "</span>" : "") }));
}

function ScriptScreen(ctx) {
  var el = h("section", { class: "ui-screen ui-screen--script", dataset: { csScreen: "script" }, "aria-labelledby": "ui-h-script" });
  var summary = h("div", { class: "ui-summary" });
  var list = h("div", { class: "ui-script-list" });
  var actions = h("div", { class: "ui-actionbar" });
  var cards = {};
  var built = false;
  var stale = true;

  el.appendChild(h("header", { class: "ui-screen-head" },
    h("h1", { class: "ui-h1", id: "ui-h-script" }, t("script.title")),
    h("p", { class: "ui-lede" }, t("script.lede"))));
  el.appendChild(summary);
  el.appendChild(list);
  el.appendChild(actions);

  /* ---- summary: topic, chips, hook ------------------------------------------------------------------------- */
  function buildSummary() {
    clear(summary);
    var s = ctx.spec;
    var chips = h("div", { class: "ui-chips" });
    function chip(label, value) { if (value) chips.appendChild(h("span", { class: "ui-chip" }, h("span", { class: "ui-chip-k" }, label), h("span", { class: "ui-chip-v", html: bidi(value) }))); }
    chip(t("meta.intent"), s.intent ? t("intent." + s.intent) : "");
    chip(t("meta.architecture"), s.architecture ? t("arch." + s.architecture) : "");
    chip(t("meta.dialect"), dialectLabel(s.locale.dialect));
    chip(t("meta.digits"), t("digits." + s.locale.digits));
    var count = ctx.slides().length;
    var warn = ctx.plugin ? (count < ctx.plugin.slides.warnBelow ? "warn" : count > ctx.plugin.slides.recommendedMax ? "mute" : "ok") : "mute";
    chips.appendChild(pill(t("script.count", { n: count }), warn, count < (ctx.plugin ? ctx.plugin.slides.warnBelow : 6) ? "triangle-alert" : "layers"));

    summary.appendChild(h("div", { class: "ui-card ui-card--hero" },
      h("div", { class: "ui-eyebrow" }, t("script.topic")),
      h("p", { class: "ui-topic", html: bidi((s.brief && s.brief.topic) || "") }),
      chips,
      s.hook ? hookBlock() : null));
    appendTo(summary, teamLogCard(s));
  }

  function hookBlock() {
    var hook = ctx.spec.hook;
    var sc = hook.score;
    var box = h("div", { class: "ui-hook" },
      h("div", { class: "ui-eyebrow" }, t("script.hook")),
      h("div", { class: "ui-hook-main" },
        h("p", { class: "ui-hook-text", html: bidi(String(hook.cover || hook.text || "").replace(/\n/g, " ")) }),
        h("div", { class: "ui-hook-meta" },
          pill(hook.family, "info"),
          sc ? h("span", { class: "ui-score", dir: "ltr", title: t("script.score.hint") }, "R " + (sc.R === undefined ? "–" : sc.R) + " · J " + (sc.J === undefined ? "–" : sc.J) + " · P " + (sc.P === undefined ? "–" : sc.P)) : null)));
    var alts = hook.alternates || [];
    if (alts.length) {
      var row = h("div", { class: "ui-hook-alts" }, h("span", { class: "ui-label" }, t("script.hook.alternates")));
      alts.forEach(function (a) {
        row.appendChild(h("button", {
          type: "button", class: "ui-hook-alt", onclick: function () { swapHook(a); }
        }, h("span", { class: "ui-hook-alt-text", html: bidi(String(a.cover || a.text || "").replace(/\n/g, " ")) }), pill(a.family, "mute"), h("span", { class: "ui-hook-alt-use" }, t("script.hook.use"))));
      });
      box.appendChild(row);
    }
    return box;
  }

  function swapHook(alt) {
    ctx.commit(function (spec) {
      var cur = spec.hook;
      var oldRef = { id: cur.id, family: cur.family, cover: cur.cover };
      ["text", "score", "slide2"].forEach(function (k) { if (cur[k] !== undefined) oldRef[k] = cur[k]; });
      var next = Object.assign({}, alt, { alternates: [oldRef].concat((cur.alternates || []).filter(function (a) { return a.id !== alt.id; })).slice(0, 2) });
      var out = setPath(spec, ["hook"], next);
      var cover = out.slides[0];
      if (cover && (cover.type === "cover" || cover.type === "poster") && alt.cover) {
        var place = placeCover(alt.cover, ctx.plugin && ctx.plugin.cover && ctx.plugin.cover.heroMaxWords, ctx.words);
        out = setPath(out, ["slides", 0, "headline"], place.headline);
        if (place.sub) out = setPath(out, ["slides", 0, "sub"], place.sub);
      }
      return out;
    }, { path: "/hook", slides: [(ctx.slides()[0] || {}).id] });
    ctx.runTextQa();
    toast(t("script.hook.swapped"), "ok", { action: { label: t("common.undo"), fn: function () { ctx.undo(); } } });
  }

  /* ---- cards ------------------------------------------------------------------------------------------------ */
  function cardMeta(card, slide) {
    var host = card.querySelector(".ui-scard-meta");
    var findHost = card.querySelector(".ui-find-list");
    clear(host);
    var tot = slideTotals(ctx, slide);
    host.appendChild(h("span", { class: "ui-scard-words", title: t("script.words.hint") }, icon("type"), meter(tot.words, tot.limit, null)));
    var fs = ctx.findingsOf(slide.id);
    ["BLOCK", "FIX", "NOTE"].forEach(function (sev) {
      var n = fs.filter(function (f) { return f.sev === sev && !f.overridden; }).length;
      if (n) host.appendChild(sevPill(sev, n));
    });
    clear(findHost);
    fs.filter(function (f) { return !f.overridden; }).slice(0, 6).forEach(function (f) { findHost.appendChild(findingLine(ctx, f)); });
    findHost.hidden = !findHost.children.length;
  }

  function buildCard(slide, i) {
    var card = h("article", { class: "ui-scard", dataset: { sid: slide.id, type: slide.type, csSlide: slide.id } });
    var menuBtn = h("button", { type: "button", class: "ui-btn ui-btn--icon ui-btn--ghost", "aria-label": t("slide.menu"), onclick: function () { slideMenu(ctx, menuBtn, ctx.slide(slide.id) || slide); } }, icon("ellipsis"));
    card.appendChild(h("header", { class: "ui-scard-head" },
      h("span", { class: "ui-scard-n", "aria-label": t("slide.n", { n: i + 1 }) }, String(i + 1)),
      h("div", { class: "ui-scard-title" }, h("strong", {}, typeLabel(slide.type)), h("div", { class: "ui-scard-meta" })),
      h("div", { class: "ui-scard-actions" },
        h("button", { type: "button", class: "ui-btn ui-btn--ghost ui-btn--sm", onclick: function () { ctx.select(slide.id); ctx.go("design"); } }, icon("palette"), t("script.open-design")),
        menuBtn)));
    var body = h("div", { class: "ui-scard-body" }, slideEditors(ctx, slide));
    card.appendChild(body);
    card.appendChild(h("ul", { class: "ui-find-list", hidden: true }));
    cardMeta(card, slide);
    cards[slide.id] = card;
    return card;
  }

  function buildList() {
    clear(list);
    cards = {};
    ctx.slides().forEach(function (s, i) { list.appendChild(buildCard(s, i)); });
    var addBtn = h("button", { type: "button", class: "ui-btn ui-btn--dashed", onclick: function () { var n = ctx.slides().length; var last = ctx.slides()[n - 1]; var at = last && (last.type === "cta" || last.type === "offer") ? n - 1 : n; openAddMenu(ctx, addBtn, at); } }, icon("plus"), t("script.add"));
    list.appendChild(addBtn);
  }

  function buildActions() {
    clear(actions);
    var sum = ctx.summary();
    var approved = !!(ctx.spec.approvals && ctx.spec.approvals.script);
    var fast = ctx.spec.mode === "fast";
    actions.appendChild(h("div", { class: "ui-actionbar-info" },
      approved ? pill(t("script.approved"), "ok", "circle-check") : null,
      sum.counts.block ? pill(t("script.blocks", { n: sum.counts.block }), "bad", "circle-alert") : sum.counts.fix ? pill(t("script.fixes", { n: sum.counts.fix }), "warn", "triangle-alert") : pill(t("script.clean"), "ok", "shield-check")));
    actions.appendChild(h("button", {
      type: "button", class: "ui-btn ui-btn--primary ui-btn--lg", dataset: { csAction: "approve-script" },
      onclick: function () { ctx.approve("script"); }
    }, icon("arrow-left", "ui-i-dir"), fast || approved ? t("script.continue") : t("script.approve")));
  }

  function rebuildAll() { buildSummary(); buildList(); buildActions(); built = true; stale = false; }

  ctx.bus.on("spec", function (d) {
    if (!built) { stale = true; return; }
    if (d.origin === "form" && d.slides !== "all" && !d.structure) {
      d.slides.forEach(function (id) { var c = cards[id], s = ctx.slide(id); if (c && s) cardMeta(c, s); });
      buildActions();
      return;
    }
    if (Array.isArray(d.slides) && !d.slides.length && !d.structure) {
      if (!el.hidden) { buildSummary(); buildActions(); }
      return;
    }
    if (el.hidden) { stale = true; return; }
    rebuildAll();
  });
  ctx.bus.on("qa", function () {
    if (!built || el.hidden) { stale = true; return; }
    ctx.slides().forEach(function (s) { if (cards[s.id]) cardMeta(cards[s.id], s); });
    buildActions();
  });

  return {
    el: el,
    show: function () {
      if (!built || stale) rebuildAll();
      if (ctx.qa.stale) ctx.runTextQa();
    },
    hide: function () { releaseFrames(el); }
  };
}
