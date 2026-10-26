/* ui/screen-export.js · «حزمة النشر» (the publishing kit), single files, save-to-photos on phones and the posting guide. */

var SINGLE_EXPORTS = [
  ["png", "image", "export.single.png"], ["png-one", "image", "export.single.png-one"], ["mp4", "film", "export.single.mp4"], ["mp4-4x5", "film", "export.single.mp4-4x5"],
  ["jpeg", "crop", "export.single.jpeg"], ["pdf", "file-text", "export.single.pdf"], ["source", "square-pen", "export.single.source"],
  ["text:caption", "message-square-text", "export.single.caption"], ["text:hashtags", "hash", "export.single.hashtags"],
  ["text:slideCaptions", "list-checks", "export.single.slideCaptions"], ["text:alt", "eye", "export.single.alt"], ["text:postingGuide", "book-open", "export.single.postingGuide"]
];

function isTouchDevice() {
  var viaUtil = guard("util.isTouch", function () { return CS.util.isTouch(); }, null);
  if (viaUtil !== null) return !!viaUtil;
  return !!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches);
}

/** Tiny renderer for the posting guide Markdown: "# title", intro text, "## n. card" sections and "- file" bullets. */
function renderGuide(md, aiCard) {
  var wrap = h("div", { class: "ui-guide-cards" });
  var cur = null, intro = [], title = "", files = h("ul", { class: "ui-guide-files" });
  md.split(/\r?\n/).forEach(function (line) {
    var m;
    if ((m = /^#\s+(.*)$/.exec(line))) title = m[1];
    else if ((m = /^##\s+(?:(\d+)\.\s*)?(.*)$/.exec(line))) {
      cur = h("article", { class: "ui-gcard" }, h("span", { class: "ui-gcard-n", dir: "ltr" }, m[1] || ""), h("div", { class: "ui-gcard-body" }, h("h3", { class: "ui-h3" }, m[2])));
      wrap.appendChild(cur);
    } else if ((m = /^[-*]\s+(.*)$/.exec(line))) {
      var isFile = /^`?[\w.\-\/]+\.(png|jpe?g|mp4|txt|md|pdf|json|html|zip)/i.test(m[1]);
      if (cur && !isFile) cur.lastChild.appendChild(h("p", { class: "ui-gcard-text", html: bidi(m[1]) }));
      else files.appendChild(h("li", {}, h("code", { dir: "ltr" }, m[1].replace(/`/g, ""))));
    } else if (line.trim()) {
      if (cur) cur.lastChild.appendChild(h("p", { class: "ui-gcard-text", html: bidi(line.trim()) })); else intro.push(line.trim());
    }
  });
  if (aiCard && wrap.lastChild) {
    /* the AI-label card is the last card of the guide text itself (posting-guide.json); it only gets its own look here */
    wrap.lastChild.classList.add("ui-gcard--ai");
    var num = wrap.lastChild.querySelector(".ui-gcard-n");
    if (num) { clear(num); num.appendChild(icon("sparkles")); }
  }
  return { title: title, intro: intro.join(" "), cards: wrap, files: files.children.length ? files : null };
}

function ExportScreen(ctx) {
  var el = h("section", { class: "ui-screen ui-screen--export", dataset: { csScreen: "export" }, "aria-labelledby": "ui-h-export" });
  var readyHost = h("div", {});
  var kitHost = h("div", {});
  var progressHost = h("div", {});
  var resultHost = h("div", {});
  var singlesHost = h("div", {});
  var guideHost = h("div", {});
  var noteHost = h("div", {});
  var stale = true;

  el.appendChild(h("header", { class: "ui-screen-head" }, h("h1", { class: "ui-h1", id: "ui-h-export" }, t("export.title")), h("p", { class: "ui-lede" }, t("export.lede"))));
  [noteHost, readyHost, kitHost, progressHost, resultHost, singlesHost, guideHost].forEach(function (x) { el.appendChild(x); });

  function verifyOk() {
    return !!ctx.spec.frozen && guard("freeze.verify", function () { return CS.core.freeze.verify(ctx.spec, ctx.tokens || CS.core.resolve.post(ctx.spec, ctx.brand)).ok; }, true);
  }

  function step(ok, title, text, action) {
    return h("li", { class: "ui-step" + (ok ? " is-ok" : "") },
      h("span", { class: "ui-step-mark", "aria-hidden": "true" }, ok ? icon("check") : null),
      h("div", { class: "ui-step-body" }, h("strong", {}, title), h("small", {}, text)), action || null);
  }

  function paintReady() {
    clear(readyHost);
    var sum = ctx.summary();
    var guided = ctx.spec.mode === "guided";
    var scriptOk = !guided || !!(ctx.spec.approvals && ctx.spec.approvals.script);
    var designOk = verifyOk();
    var qaOk = !ctx.blockers().length;
    var list = h("ol", { class: "ui-steps-list" },
      guided ? step(scriptOk, t("export.step.script"), scriptOk ? t("export.step.done") : t("export.step.script.todo"), scriptOk ? null : h("button", { type: "button", class: "ui-btn ui-btn--ghost ui-btn--sm", onclick: function () { ctx.go("script"); } }, t("export.step.go"))) : null,
      step(designOk, t("export.step.design"), designOk ? t("export.step.done") : t("export.step.design.todo"), designOk ? null : h("button", { type: "button", class: "ui-btn ui-btn--ghost ui-btn--sm", dataset: { csAction: "approve-design" }, onclick: function () { ctx.approve("design"); } }, t("design.approve"))),
      step(qaOk, t("export.step.qa"), qaOk ? (sum.counts.fix ? t("export.step.qa.fix", { n: sum.counts.fix }) : t("export.step.done")) : t("export.step.qa.todo", { n: ctx.blockers().length }),
        qaOk ? null : h("button", { type: "button", class: "ui-btn ui-btn--ghost ui-btn--sm", onclick: function () { ctx.go("check"); } }, t("export.step.go"))));
    readyHost.appendChild(h("div", { class: "ui-card" }, h("h2", { class: "ui-h2" }, t("export.ready")), list));
  }

  function paintKit() {
    clear(kitHost);
    var caps = ctx.exp.capsValue;
    var videoOk = !caps || (caps.videoEncoder !== false && caps.h264 !== false);
    var opts = ctx.exp.options;
    if (!videoOk) opts.video = false;
    var blockers = ctx.blockers();
    var hard = ctx.hardBlockers();
    var running = ctx.exp.running;
    var exportBtn;
    if (blockers.length && !hard.length) {
      exportBtn = h("button", { type: "button", class: "ui-btn ui-btn--danger ui-btn--lg", disabled: running, dataset: { csAction: "export-kit" }, onclick: exportAnyway }, icon("lock-open"), t("export.anyway"));
    } else {
      exportBtn = h("button", { type: "button", class: "ui-btn ui-btn--primary ui-btn--lg", disabled: running || blockers.length > 0, dataset: { csAction: "export-kit" }, onclick: function () { ctx.exportKit(); } }, icon("package-open"), t("export.kit.button"));
    }
    var files = [["export.kit.f.slides", true], ["export.kit.f.video", opts.video], ["export.kit.f.crop", opts.variants4x5], ["export.kit.f.pdf", opts.pdf], ["export.kit.f.text", true], ["export.kit.f.guide", true]].concat(opts.source ? [["export.kit.f.source", true]] : []);   // the source files are listed only when asked for
    kitHost.appendChild(h("div", { class: "ui-card ui-card--kit" },
      h("div", { class: "ui-kit-head" }, h("span", { class: "ui-kit-ico" }, icon("package-open")), h("div", {}, h("h2", { class: "ui-h2" }, t("export.kit.title")), h("p", { class: "ui-hint" }, t("export.kit.lede")))),
      h("ul", { class: "ui-kit-files" }, files.map(function (f) { return h("li", { class: f[1] ? "" : "is-off" }, icon(f[1] ? "check" : "x"), t(f[0])); })),
      h("div", { class: "ui-toggles" },
        switchBox(t("export.opt.video"), opts.video && videoOk, function (on) { opts.video = on; paintKit(); }, videoOk ? t("export.opt.video.hint") : t("export.opt.video.no")),
        switchBox(t("export.opt.crop"), opts.variants4x5, function (on) { opts.variants4x5 = on; paintKit(); }, t("export.opt.crop.hint")),
        switchBox(t("export.opt.pdf"), opts.pdf, function (on) { opts.pdf = on; paintKit(); }),
        switchBox(t("export.opt.source"), opts.source, function (on) { opts.source = on; paintKit(); }, t("export.opt.source.hint"))),
      blockers.length ? h("p", { class: "ui-note ui-note--" + (hard.length ? "bad" : "warn") }, icon("circle-alert"), h("span", { html: bidi(hard.length ? t("export.blocked.hard", { n: hard.length }) : t("export.blocked.soft", { n: blockers.length })) })) : null,
      exportBtn));
    if (isTouchDevice()) {
      kitHost.appendChild(h("div", { class: "ui-card ui-card--quiet" },
        h("div", { class: "ui-row ui-row--between" }, h("div", {}, h("strong", {}, t("export.photos.title")), h("p", { class: "ui-hint" }, t("export.photos.text"))),
          h("button", { type: "button", class: "ui-btn ui-btn--secondary", disabled: running, onclick: function () { ctx.exportFiles("photos"); } }, icon("download"), t("export.photos.button")))));
    }
  }

  async function exportAnyway() {
    var list = ctx.blockers();
    var reason = await askText({ title: t("export.anyway.title"), text: t("export.anyway.text", { n: list.length }), placeholder: t("check.override.ph"), confirm: t("export.anyway"), danger: true });
    if (reason === null) return;
    if (!reason) { toast(t("check.override.need-reason"), "warn"); return; }
    list.forEach(function (r) { ctx.override(r, reason); });
    await ctx.runQa();
    if (!ctx.blockers().length) ctx.exportKit(); else paintAll();
  }

  function paintProgress() {
    clear(progressHost);
    if (!ctx.exp.running) return;
    var pct = ctx.exp.total ? Math.round(100 * ctx.exp.done / ctx.exp.total) : null;
    progressHost.appendChild(h("div", { class: "ui-card ui-card--progress", role: "status" },
      h("div", { class: "ui-row ui-row--between" }, h("strong", {}, ctx.exp.label || t("export.working")), pct !== null ? h("span", { class: "ui-time", dir: "ltr" }, pct + "%") : null),
      h("div", { class: "ui-progress" + (pct === null ? " is-indeterminate" : "") }, h("span", { style: pct === null ? {} : { width: pct + "%" } })),
      h("button", { type: "button", class: "ui-btn ui-btn--ghost ui-btn--sm", onclick: function () { ctx.cancelExport(); } }, t("common.cancel"))));
  }

  function paintResult() {
    clear(resultHost);
    var last = ctx.exp.last;
    if (!last) return;
    var card = h("div", { class: "ui-card" }, h("h2", { class: "ui-h2" }, t("export.result")));
    var ul = h("ul", { class: "ui-result" });
    last.saved.forEach(function (n) { ul.appendChild(h("li", { class: "is-ok" }, icon("circle-check"), h("code", { dir: "ltr" }, n))); });
    last.declined.forEach(function (n) { ul.appendChild(h("li", { class: "is-mute" }, icon("circle-help"), h("code", { dir: "ltr" }, n), h("small", {}, t("export.result.declined")))); });
    last.failed.forEach(function (f) { ul.appendChild(h("li", { class: "is-bad" }, icon("circle-alert"), h("code", { dir: "ltr" }, f.name), h("small", {}, f.error))); });
    last.skipped.forEach(function (s) { ul.appendChild(h("li", { class: "is-warn" }, icon("triangle-alert"), h("code", { dir: "ltr" }, s.path), h("small", {}, s.reason))); });
    card.appendChild(ul);
    if (last.saved.length) card.appendChild(h("p", { class: "ui-hint" }, t("export.result.next")));
    resultHost.appendChild(card);
  }

  function paintSingles() {
    clear(singlesHost);
    var caps = ctx.exp.capsValue;
    var running = ctx.exp.running;
    var grid = h("div", { class: "ui-singles" });
    SINGLE_EXPORTS.forEach(function (s) {
      var noVideo = /^mp4/.test(s[0]) && caps && (caps.videoEncoder === false || caps.h264 === false);
      var cover = ctx.slides()[0];
      var off = noVideo || (/^mp4/.test(s[0]) && cover && ctx.spec.cover && ctx.spec.cover.motion && ctx.spec.cover.motion.recipe === "none");
      grid.appendChild(h("button", {
        type: "button", class: "ui-single", disabled: running || !!off, title: off ? t("export.single.off") : "", dataset: { kind: s[0] },
        onclick: function () { ctx.exportFiles(s[0]); }
      }, icon(s[1]), h("span", {}, t(s[2]))));
    });
    singlesHost.appendChild(h("div", { class: "ui-card" }, h("h2", { class: "ui-h2" }, t("export.singles")), h("p", { class: "ui-hint" }, t("export.singles.hint")), grid));
  }

  function paintGuide() {
    clear(guideHost);
    var md = ctx.postingGuideText();
    if (!md) return;
    var g = renderGuide(md, ctx.anyAi());
    guideHost.appendChild(h("div", { class: "ui-card" },
      h("div", { class: "ui-row ui-row--between" }, h("h2", { class: "ui-h2" }, g.title || t("export.guide")), h("button", { type: "button", class: "ui-btn ui-btn--ghost ui-btn--sm", onclick: function () { ctx.exportFiles("text:postingGuide"); } }, icon("download"), t("common.save"))),
      g.intro ? h("p", { class: "ui-hint", html: bidi(g.intro) }) : null, g.cards,
      g.files ? h("details", { class: "ui-details" }, h("summary", {}, t("export.guide.files")), g.files) : null));
  }

  function paintNote() {
    clear(noteHost);
    if (ctx.caps.downloads === false) noteHost.appendChild(h("p", { class: "ui-note ui-note--warn" }, icon("triangle-alert"), h("span", { html: bidi(t("export.no-downloads")) })));
  }

  function paintAll() { paintNote(); paintReady(); paintKit(); paintProgress(); paintResult(); paintSingles(); paintGuide(); stale = false; }

  ctx.bus.on("export", function () { if (el.hidden) return; paintProgress(); paintKit(); paintSingles(); paintResult(); });
  ctx.bus.on("qa", function () { if (!el.hidden) { paintReady(); paintKit(); } });
  ctx.bus.on("spec", function (d) { stale = true; if (!el.hidden && d.origin !== "export") { paintReady(); paintKit(); } });

  return {
    el: el,
    show: function () {
      paintAll();
      ctx.exportCaps();
      if (ctx.qa.stale || !ctx.qa.all) ctx.runQa();
    },
    hide: function () { stale = true; }
  };
}
