/* ui/screen-motion.js · the animated cover: pick a recipe, watch the loop, check that frame 0 equals the last frame.
 * The live preview animates its own render of slide 1; it never touches the shared thumbs. */

function MotionScreen(ctx) {
  var el = h("section", { class: "ui-screen ui-screen--motion", dataset: { csScreen: "motion" }, "aria-labelledby": "ui-h-motion" });
  var stageHost = h("div", { class: "ui-motion-stage" });
  var controls = h("div", { class: "ui-motion-controls" });
  var chipsHost = h("div", { class: "ui-motion-recipes" });
  var infoHost = h("div", { class: "ui-motion-info" });
  var badgeHost = h("div", { class: "ui-loopbadge" });
  var player = null, timeline = null, frame = null, scrub = null, timeLabel = null, playBtn = null;
  var gen = 0;
  var stale = true;
  var fullMotion = false;
  var reduced = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  el.appendChild(h("header", { class: "ui-screen-head" }, h("h1", { class: "ui-h1", id: "ui-h-motion" }, t("motion.title")), h("p", { class: "ui-lede" }, t("motion.lede"))));
  el.appendChild(h("div", { class: "ui-motion" },
    h("div", { class: "ui-motion-left" }, stageHost, controls, badgeHost),
    h("div", { class: "ui-motion-right" }, chipsHost, infoHost)));

  function currentMotion() { return (ctx.spec.cover && ctx.spec.cover.motion) || { recipe: "calm", seconds: 6, fps: 30, source: "internal" }; }

  function recipeList() {
    var list = guard("motion.list", function () { return CS.motion.list({ shippedOnly: true }); }, []);
    if (!list.some(function (r) { return r.id === "none"; })) list = list.concat([{ id: "none", label: { ar: "من غير حركة", en: "No motion" }, feel: "calm" }]);
    return list;
  }

  function teardown() {
    if (player) { try { player.destroy(); } catch (e) { /* already gone */ } }
    player = null; timeline = null;
  }

  function fmtTime(t0) { return (Math.round(t0 * 10) / 10).toFixed(1) + " / " + (timeline ? timeline.duration.toFixed(1) : "6.0") + "s"; }

  async function mountPlayer() {
    var my = ++gen;
    teardown();
    clear(stageHost); clear(controls); clear(badgeHost);
    var first = ctx.slides()[0];
    if (!first) return;
    var c = ctx.canvas();
    var f = makeFrame(c.w, c.h, "ui-motion-frame is-loading");
    frame = f;
    stageHost.appendChild(f.frame);
    var m = currentMotion();
    if (m.recipe === "none") {
      f.frame.classList.remove("is-loading");
      var still = ctx.thumbClone(first.id);
      if (still) f.inner.appendChild(still);
      controls.appendChild(h("p", { class: "ui-note" }, icon("info"), h("span", { html: bidi(t("motion.static")) })));
      return;
    }
    var r;
    try { r = await ctx.renderFresh(0, "thumb"); } catch (e) { reportError("motion render", e); f.frame.classList.add("is-failed"); return; }
    if (my !== gen) return;
    f.inner.appendChild(r.el);
    f.frame.classList.remove("is-loading");
    try {
      timeline = CS.motion.build(r.el, { recipe: m.recipe, seconds: m.seconds || 6, fps: 30, feel: m.feel, reducedMotion: reduced && !fullMotion });
      player = CS.motion.mount(r.el, timeline, { loop: true, autoplay: !(reduced && !fullMotion) });
    } catch (e) {
      reportError("motion build", e);
      stageHost.appendChild(h("p", { class: "ui-note ui-note--warn" }, icon("triangle-alert"), h("span", { html: bidi(t("motion.failed")) })));
      return;
    }
    playBtn = h("button", { type: "button", class: "ui-btn ui-btn--secondary ui-btn--icon", "aria-label": t("motion.play-pause"), onclick: function () { player.toggle(); paintPlay(); } });
    scrub = h("input", {
      type: "range", class: "ui-range", min: 0, max: timeline.duration, step: 1 / 30, value: 0, "aria-label": t("motion.scrub"),
      oninput: function () { player.pause(); player.seek(+scrub.value); paintPlay(); timeLabel.textContent = fmtTime(+scrub.value); }
    });
    timeLabel = h("span", { class: "ui-time", dir: "ltr" }, fmtTime(0));
    var replay = h("button", { type: "button", class: "ui-btn ui-btn--ghost ui-btn--icon", "aria-label": t("motion.restart"), onclick: function () { player.seek(0); player.play(); paintPlay(); } }, icon("rotate-ccw"));
    controls.appendChild(h("div", { class: "ui-transport", dir: "ltr" }, playBtn, replay, scrub, timeLabel));
    player.onframe = function (tm) { scrub.value = tm; timeLabel.textContent = fmtTime(tm); };
    paintPlay();
    if (reduced) controls.appendChild(switchBox(t("motion.reduced"), fullMotion, function (on) { fullMotion = on; mountPlayer(); }, t("motion.reduced.hint")));
    setTimeout(function () { if (my === gen) checkLoop(my); }, 500);
  }

  function paintPlay() {
    if (!playBtn || !player) return;
    clear(playBtn);
    playBtn.appendChild(icon(player.playing ? "pause" : "play"));
  }

  async function checkLoop(my) {
    clear(badgeHost);
    if (!player || !frame) return;
    badgeHost.appendChild(h("div", { class: "ui-verdict" }, h("span", { class: "ui-spinner", "aria-hidden": "true" }), h("span", {}, t("motion.loop.checking"))));
    var slideEl = frame.inner.querySelector(".cs-slide");
    var wasPlaying = player.playing, at = player.time;
    var res = null;
    try {
      player.pause();
      var scale = 0.25;
      player.seekFrame(0);
      await raf();
      var c0 = await CS.paint.toCanvas(slideEl, { scale: scale });
      player.seekFrame(timeline.frames - 1);
      await raf();
      var c1 = await CS.paint.toCanvas(slideEl, { scale: scale });
      var posterHost = ctx.thumbClone(ctx.slides()[0].id);
      var tmp = h("div", { class: "ui-offscreen" }, posterHost);
      ctx.root.appendChild(tmp);
      var cp = await CS.paint.toCanvas(posterHost, { scale: scale });
      tmp.remove();
      res = CS.qa.loopCheck(c0, c1, cp);
    } catch (e) { reportError("loop check", e); }
    try { player.seek(at); if (wasPlaying) player.play(); } catch (e) { /* player destroyed meanwhile */ }
    paintPlay();
    if (my !== gen) return;
    clear(badgeHost);
    if (!res) { badgeHost.appendChild(h("p", { class: "ui-hint" }, icon("info"), t("motion.loop.unavailable"))); return; }
    badgeHost.appendChild(h("div", { class: "ui-verdict-main ui-verdict--" + (res.ok ? "ok" : "bad") },
      icon(res.ok ? "circle-check" : "circle-alert"),
      h("div", {}, h("strong", {}, res.ok ? t("motion.loop.ok") : t("motion.loop.bad")),
        h("p", { class: "ui-hint", dir: "ltr" }, "SSIM " + res.ssim.toFixed(3) + " · PSNR " + Math.round(res.psnr) + " dB"))));
  }

  function paintRecipes() {
    clear(chipsHost); clear(infoHost);
    var m = currentMotion();
    var preset = ctx.preset();
    var allowed = preset && preset.motion && preset.motion.allowed;
    var rec = guard("motion.recommend", function () { return CS.motion.recommend(ctx.spec); }, null);
    chipsHost.appendChild(h("h2", { class: "ui-h2" }, t("motion.recipes")));
    var list = h("div", { class: "ui-recipes" });
    recipeList().forEach(function (r) {
      var ok = r.id === "none" || !allowed || allowed.indexOf(r.id) >= 0;
      list.appendChild(h("button", {
        type: "button", class: "ui-recipe", "aria-pressed": String(m.recipe === r.id), disabled: !ok, title: ok ? "" : t("motion.not-allowed"),
        onclick: function () { ctx.setMotion({ recipe: r.id, feel: r.feel || "calm", source: "internal" }); }
      }, h("strong", {}, msgOf(r.label)), h("small", {}, r.id === "none" ? t("motion.feel.none") : t("motion.feel." + (r.feel || "calm"))),
        rec && rec.recipe === r.id ? pill(t("motion.recommended"), "ok", "sparkles") : null));
    });
    chipsHost.appendChild(list);
    if (rec) infoHost.appendChild(h("p", { class: "ui-note" }, icon("lightbulb"), h("span", { html: bidi(msgOf(rec.why)) })));
    infoHost.appendChild(h("div", { class: "ui-label" }, t("motion.seconds")));
    infoHost.appendChild(segmented([{ value: "5", label: t("motion.seconds.n", { n: 5 }) }, { value: "6", label: t("motion.seconds.n", { n: 6 }) }], String(m.seconds || 6), function (v) { ctx.setMotion({ seconds: +v }); }));
    infoHost.appendChild(h("div", { class: "ui-card ui-card--quiet" }, h("strong", {}, t("motion.plate")), h("p", { class: "ui-hint", html: bidi(t("motion.plate.text")) })));
    infoHost.appendChild(h("p", { class: "ui-hint" }, icon("info"), t("motion.poster-first")));
  }

  ctx.bus.on("spec", function (d) {
    var motionChanged = d.path === "/cover/motion" || d.slides === "all" || d.structure || (d.slides && d.slides.indexOf((ctx.slides()[0] || {}).id) >= 0);
    if (!motionChanged) return;
    stale = true;
    if (!el.hidden) { paintRecipes(); mountPlayer(); stale = false; }
  });

  return {
    el: el,
    show: function () { if (stale || !player) { paintRecipes(); mountPlayer(); stale = false; } else if (player) { player.play(); paintPlay(); } },
    hide: function () { teardown(); gen++; releaseFrames(stageHost); stale = true; }
  };
}
