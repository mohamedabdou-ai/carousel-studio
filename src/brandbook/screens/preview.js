/* ui/screen-preview.js · how the post will look: the phone feed, the profile grid, the 130 px tile test and the guide overlays. */

var PREVIEW_VIEWS = ["feed", "grid", "tile", "guides"];

function monogram(ctx) {
  var name = (ctx.brand && ctx.brand.name) || (ctx.brand && ctx.brand.handle) || "?";
  return String(name).replace(/^@/, "").trim().charAt(0).toUpperCase();
}

function brandAvatar(ctx) {
  var logo = ctx.assets("logo");
  if (logo) return h("img", { class: "ui-avatar", src: logo.url, alt: "" });
  return h("span", { class: "ui-avatar ui-avatar--mono", "aria-hidden": "true" }, monogram(ctx));
}

function handleOf(ctx) {
  var hnd = (ctx.brand && ctx.brand.handle) || "";
  return hnd ? (hnd.charAt(0) === "@" ? hnd : "@" + hnd) : "";
}

function PreviewScreen(ctx) {
  var el = h("section", { class: "ui-screen ui-screen--preview", dataset: { csScreen: "preview" }, "aria-labelledby": "ui-h-preview" });
  var view = "feed";
  var body = h("div", { class: "ui-preview-body" });
  var switcher = segmented(PREVIEW_VIEWS.map(function (v) { return { value: v, label: t("preview." + v) }; }), view, function (v) { view = v; paint(); }, "ui-seg--wide");
  var stale = true;
  var guideSel = null;

  el.appendChild(h("header", { class: "ui-screen-head" }, h("h1", { class: "ui-h1", id: "ui-h-preview" }, t("preview.title")), h("p", { class: "ui-lede" }, t("preview.lede"))));
  el.appendChild(switcher);
  el.appendChild(body);

  /* ---- feed ------------------------------------------------------------------------------------------------- */
  function captionPreview() {
    var full = guard("assembleCaption", function () { return CS.core.spec.assembleCaption(ctx.spec); }, "");
    var fold = ctx.plugin ? ctx.plugin.caption.firstLineMaxChars : 125;
    var chars = Array.from(full);
    var head = chars.slice(0, fold).join("");
    var tail = chars.slice(fold).join("");
    var expanded = false;
    var cap = h("div", { class: "ui-phone-cap" });
    function paint() {
      clear(cap);
      var handle = handleOf(ctx);
      var line = h("p", { class: "ui-cap-text", dir: ctx.isEn() ? "ltr" : "rtl" });
      if (handle) line.appendChild(h("strong", { class: "ui-cap-handle" }, ltr(handle)));
      line.appendChild(document.createTextNode(" " + (expanded ? full : head)));
      if (!expanded && tail) {
        line.appendChild(document.createTextNode("… "));
        line.appendChild(h("button", { type: "button", class: "ui-cap-more", onclick: function () { expanded = true; paint(); } }, t("preview.more")));
      }
      cap.appendChild(line);
      if (tail && !expanded) cap.appendChild(h("p", { class: "ui-hint" }, icon("info"), t("preview.fold", { n: fold })));
      if (!full) cap.appendChild(h("p", { class: "ui-hint" }, t("preview.nocaption")));
    }
    paint();
    return cap;
  }

  function feed() {
    var dir = filmDirection(ctx);
    var slides = ctx.slides();
    var scroller = h("div", { class: "ui-phone-scroll", dir: dir, tabindex: "0", "aria-label": t("preview.feed.scroll") });
    slides.forEach(function (s) {
      var f = ctx.slideFrame(s.id, "ui-phone-slide");
      scroller.appendChild(h("div", { class: "ui-phone-cell" }, f.frame));
    });
    var dots = h("div", { class: "ui-dots", "aria-hidden": "true" }, slides.map(function () { return h("span", { class: "ui-dot" }); }));
    function paintDots() {
      var w = scroller.clientWidth || 1;
      var i = Math.round(Math.abs(scroller.scrollLeft) / w);
      Array.prototype.forEach.call(dots.children, function (d, k) { d.classList.toggle("is-on", k === i); });
    }
    scroller.addEventListener("scroll", paintDots, { passive: true });
    requestAnimationFrame(paintDots);
    var phone = h("div", { class: "ui-phone" },
      h("div", { class: "ui-phone-head" }, brandAvatar(ctx), h("div", { class: "ui-phone-who" }, h("strong", {}, handleOf(ctx) ? ltr(handleOf(ctx)) : (ctx.brand && ctx.brand.name) || ""), h("small", {}, t("preview.sponsor")))),
      scroller, dots,
      h("div", { class: "ui-phone-actions", "aria-hidden": "true" }, icon("heart"), icon("message-circle"), icon("send"), h("span", { class: "ui-grow" }), icon("bookmark")),
      captionPreview());
    return h("div", { class: "ui-preview-center" }, phone,
      h("p", { class: "ui-note" }, icon("info"), h("span", { html: bidi(t("preview.feed.note", { dir: dir === "rtl" ? t("preview.dir.rtl") : t("preview.dir.ltr") })) })));
  }

  /* ---- grid ------------------------------------------------------------------------------------------------- */
  function grid() {
    var first = ctx.slides()[0];
    var g = h("div", { class: "ui-grid3", dir: filmDirection(ctx) === "ltr" ? "ltr" : "rtl" });
    for (var i = 0; i < 9; i++) {
      if (i === 0 && first) { var f = ctx.slideFrame(first.id, "ui-grid-tile"); f.frame.classList.add("is-mine"); g.appendChild(f.frame); }
      else g.appendChild(h("div", { class: "ui-grid-ghost", "aria-hidden": "true" }, h("span", {})));
    }
    return h("div", { class: "ui-preview-center" },
      h("div", { class: "ui-phone ui-phone--grid" }, h("div", { class: "ui-phone-head" }, brandAvatar(ctx), h("div", { class: "ui-phone-who" }, h("strong", {}, handleOf(ctx) ? ltr(handleOf(ctx)) : ""), h("small", {}, t("preview.profile")))), g),
      h("p", { class: "ui-note" }, icon("info"), h("span", { html: bidi(t("preview.grid.note")) })));
  }

  /* ---- tile ------------------------------------------------------------------------------------------------- */
  function tile() {
    var first = ctx.slides()[0];
    var width = ctx.plugin ? ctx.plugin.thumbnail.widthPx : 130;
    var f = first ? ctx.slideFrame(first.id, "ui-tile-frame") : null;
    var verdict = h("div", { class: "ui-verdict" }, h("span", { class: "ui-spinner", "aria-hidden": "true" }), h("span", {}, t("preview.tile.checking")));
    var box = h("div", { class: "ui-tile-box" }, f ? h("div", { class: "ui-tile-slot", style: { width: width + "px" } }, f.frame) : null);
    if (f) {
      // the QA thumbnail test needs a laid-out slide, so wait for the clone to be in the frame
      setTimeout(function () { runTileTest(f, verdict); }, 120);
    }
    return h("div", { class: "ui-preview-center ui-tile-view" },
      h("div", { class: "ui-card" }, h("h2", { class: "ui-h2" }, t("preview.tile.title")), h("p", { class: "ui-lede" }, t("preview.tile.lede", { px: width })), h("div", { class: "ui-tile-row" }, box, verdict)));
  }

  async function runTileTest(f, host) {
    var slideEl = f.inner.querySelector(".cs-slide");
    if (!slideEl) { clear(host); host.appendChild(h("p", { class: "ui-hint" }, t("preview.tile.unavailable"))); return; }
    var res = null;
    try { res = await CS.qa.thumbnail(slideEl); } catch (e) { reportError("qa.thumbnail", e); }
    if (!host.isConnected) return;
    clear(host);
    if (!res) { host.appendChild(h("p", { class: "ui-hint" }, t("preview.tile.unavailable"))); return; }
    var kind = res.pass ? "ok" : res.fix ? "warn" : "bad";
    host.appendChild(h("div", { class: "ui-verdict-main ui-verdict--" + kind },
      icon(kind === "ok" ? "circle-check" : kind === "warn" ? "triangle-alert" : "circle-alert"),
      h("div", {}, h("strong", {}, t("preview.tile.verdict." + kind)), h("p", { class: "ui-hint" }, t("preview.tile.verdict." + kind + ".text")))));
    host.appendChild(h("dl", { class: "ui-facts" },
      h("div", {}, h("dt", {}, t("preview.tile.hero")), h("dd", { dir: "ltr" }, (Math.round(res.heroPx * 10) / 10) + " px")),
      h("div", {}, h("dt", {}, t("preview.tile.contrast")), h("dd", { dir: "ltr" }, (Math.round(res.localContrast * 10) / 10) + ":1"))));
    if (!res.pass) host.appendChild(h("button", { type: "button", class: "ui-btn ui-btn--secondary ui-btn--sm", onclick: function () { ctx.select(ctx.slides()[0].id); ctx.go("design"); } }, icon("palette"), t("preview.tile.fix")));
  }

  /* ---- guides ----------------------------------------------------------------------------------------------- */
  function guideView() {
    if (!guideSel || !ctx.slide(guideSel)) guideSel = ctx.slides()[0] && ctx.slides()[0].id;
    var c = ctx.canvas();
    var f = ctx.slideFrame(guideSel, "ui-guide-frame");
    f.inner.appendChild(guidesLayer(ctx, ctx.guides));
    var toggles = h("div", { class: "ui-toggles" },
      [["safe", "guides.safe"], ["crop", "guides.crop"], ["content", "guides.content"], ["keepouts", "guides.keepouts"]].map(function (g) {
        return switchBox(t(g[1]), ctx.guides[g[0]], function (on) { ctx.guides[g[0]] = on; paint(); });
      }));
    var idx = ctx.index(guideSel);
    var nav = makeStageNav(ctx, function (d) { var list = ctx.slides(); guideSel = list[Math.max(0, Math.min(list.length - 1, idx + d))].id; paint(); });
    nav.update(idx, ctx.slides().length);
    return h("div", { class: "ui-guides-view" },
      h("div", { class: "ui-guides-stage" }, nav.el, h("div", { class: "ui-guides-frame" }, f.frame)),
      h("div", { class: "ui-card" }, h("h2", { class: "ui-h2" }, t("guides.title")), h("p", { class: "ui-hint" }, t("guides.lede", { w: c.w, h: c.h })), toggles));
  }

  function paint() {
    releaseFrames(body);
    clear(body);
    switcher.setValue(view);
    if (!ctx.slides().length) { body.appendChild(h("p", { class: "ui-empty" }, t("preview.empty"))); return; }
    body.appendChild(view === "feed" ? feed() : view === "grid" ? grid() : view === "tile" ? tile() : guideView());
    stale = false;
  }

  ctx.bus.on("spec", function () { stale = true; if (!el.hidden) paint(); });
  ctx.bus.on("thumbs", function () { /* frames repaint themselves */ });

  return {
    el: el,
    show: function () { if (stale || !body.firstChild) paint(); },
    hide: function () { releaseFrames(body); stale = true; }
  };
}
