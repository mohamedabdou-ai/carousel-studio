/* core/render.js · the one entry point from spec to DOM.
 *
 *   resolve tokens -> compose the slide -> put it in the stage -> wait for fonts and images -> fit (or apply the frozen layout)
 *   -> emit cs:render and cs:fit
 *
 * The off-screen stage measures at 1080 px. Edit keeps natural text; export wraps physical lines; thumb skips wrapping.
 * Verify once before compose, so visual hooks reuse frozen boxes and the resolved post.
 */
(function () {
  var core = (CS.core = CS.core || {});

  var shared = null;

  function makeStage() {
    var st = document.createElement("div");
    st.setAttribute("data-cs-stage", "");
    st.setAttribute("aria-hidden", "true");
    st.style.cssText = "position:fixed;left:-12000px;top:0;width:" + core.constants.CANVAS.w + "px;pointer-events:none;contain:layout paint;direction:ltr;";
    document.body.appendChild(st);
    return st;
  }

  function sharedStage() {
    if (!shared || !shared.isConnected) shared = makeStage();
    return shared;
  }

  /** Lets the browser breathe between slides; MessageChannel is not throttled in background tabs the way setTimeout is. */
  function tick() {
    return new Promise(function (resolve) {
      if (typeof MessageChannel !== "function") return setTimeout(resolve, 0);
      var mc = new MessageChannel();
      mc.port1.onmessage = function () { mc.port1.close(); resolve(); };
      mc.port2.postMessage(0);
    });
  }

  /** Union of font specs ({id, wght}) over several slides, once each. */
  function unique(lists) {
    var out = [], seen = {};
    lists.forEach(function (l) { (l || []).forEach(function (x) { var k = x.id + "|" + x.wght; if (!seen[k]) { seen[k] = true; out.push(x); } }); });
    return out;
  }

  /** Fonts and images; a font that cannot load is reported in the fit report instead of aborting the render. */
  async function settle(root, fontSpecs, opts, warnings) {
    core.ready.checkAbort(opts.signal);
    try { await core.ready.fonts(fontSpecs, 8000); }
    catch (e) {
      if (e && e.code === "E_ABORTED") throw e;
      warnings.push({ ar: "تعذّر تحميل الخطوط، فقد تكون المقاسات غير دقيقة.", en: "Fonts could not be loaded, so the sizes may be off." });
      CS.emit("cs:error", { code: (e && e.code) || "E_FONT_MISSING", message: (e && e.message) || "font load failed", detail: e && e.detail });
    }
    await core.ready.images(root);
    core.ready.checkAbort(opts.signal);
  }

  function wrapAllLines(el) {
    core.compose.slots(el).forEach(function (s) { if (s.el.querySelector(".w")) core.fit.wrapLines(s.el); });
  }

  /** Fit (or apply the frozen layout) and, for exports, break the text into physical lines. */
  function layout(el, tokens, spec, opts, frozenOk) {
    var mode = opts.mode || "export", report;
    if (frozenOk && mode !== "edit") {
      core.freeze.apply(el, spec.frozen);
      report = core.fit.fitSlide(el, tokens, { frozenSizes: spec.frozen.sizes });
    } else {
      report = core.fit.fitSlide(el, tokens);
    }
    var v=(tokens.art||el.dataset.free)&&el.dataset.type!=="cover"&&CS.visual;
    if(v?.anchorSync?.(el,{frozen:frozenOk&&spec.frozen}))report=core.fit.fitSlide(el,tokens);
    if(v?.anchorFit?.(el,report,{frozen:frozenOk&&spec.frozen}))report=core.fit.fitSlide(el,tokens);
    if(!frozenOk&&mode==="export"){wrapAllLines(el);core.fit.settleLines(el,tokens,report);}
    v?.settle?.(el,{spec:spec,tokens:tokens,frozen:frozenOk&&spec.frozen});
    return report;
  }

  function frozenState(spec, post, opts, brand) {
    return opts.useFrozen !== false && spec.frozen ? (CS.visual?.verify||core.freeze.verify)(spec,post,brand).ok : false;
  }

  function announce(r) {
    CS.emit("cs:render", { slideId: r.id, tokensHash: r.tokens.hash });
    CS.emit("cs:fit", { slideId: r.id, report: r.fit });
  }

  async function slide(spec, brand, index, opts) {
    opts = opts || {};
    core.ready.checkAbort(opts.signal);
    var slideSpec = (spec.slides || [])[index];
    if (!slideSpec) throw new CS.CSError("E_USAGE", "There is no slide at index " + index + ".", { index: index });
    var post = core.resolve.post(spec, brand), tokens = core.resolve.slide(post, slideSpec);
    opts={...opts,frozenOk:frozenState(spec,post,opts,brand)};
    var el = core.compose.slide(spec, slideSpec, tokens, brand, opts), stage = opts.stage || sharedStage(), warnings = [];
    stage.appendChild(el);
    try {
      await settle(el, core.ready.fontSpecs(tokens), opts, warnings);
      var report = layout(el, tokens, spec, opts, opts.frozenOk);
      report.warnings = warnings.concat(report.warnings);
      var r = { id: slideSpec.id, index: index, el: el, tokens: tokens, fit: report };
      announce(r);
      core.ready.markReady();
      return r;
    } catch (e) {
      if (el.parentNode === stage) el.remove();
      throw e;
    }
  }

  async function deck(spec, brand, opts) {
    opts = opts || {};
    core.ready.checkAbort(opts.signal);
    var post = core.resolve.post(spec, brand), stage = opts.stage || makeStage(), owns = !opts.stage, items = [], warnings = [];
    opts={...opts,frozenOk:frozenState(spec,post,opts,brand)};
    var only = opts.slideIds ? opts.slideIds.slice() : null;
    (spec.slides || []).forEach(function (s, i) {
      if (only && only.indexOf(s.id) < 0) return;
      var tokens = core.resolve.slide(post, s), el = core.compose.slide(spec, s, tokens, brand, opts);
      stage.appendChild(el);
      items.push({ id: s.id, index: i, el: el, tokens: tokens, fit: null });
    });
    var dispose = function () {
      items.forEach(function (r) { if (r.el.parentNode === stage) r.el.remove(); });
      if (owns && stage.parentNode) stage.remove();
    };
    try {
      await settle(stage, unique(items.map(function (r) { return core.ready.fontSpecs(r.tokens); })), opts, warnings);
      var frozenOk = opts.frozenOk;
      for (var i = 0; i < items.length; i++) {
        core.ready.checkAbort(opts.signal);
        var r = items[i];
        r.fit = layout(r.el, r.tokens, spec, opts, frozenOk);
        r.fit.warnings = warnings.concat(r.fit.warnings);
        announce(r);
        if (i < items.length - 1) await tick();
      }
      core.ready.markReady();
      return { tokens: post, slides: items, stage: stage, frozenOk: frozenOk, dispose: dispose };
    } catch (e) {
      dispose();
      throw e;
    }
  }

  /** Re-composes a rendered slide inside the same root element (so whoever holds `r.el` keeps a live node) and fits it again. */
  async function update(r, spec, brand, opts) {
    opts = opts || {};
    core.ready.checkAbort(opts.signal);
    var index = (spec.slides || []).findIndex(function (s) { return s.id === r.id; });
    if (index < 0) throw new CS.CSError("E_USAGE", "Slide " + r.id + " is no longer in the spec.", { id: r.id });
    var slideSpec = spec.slides[index], post = core.resolve.post(spec, brand), tokens = core.resolve.slide(post, slideSpec);
    opts={...opts,frozenOk:frozenState(spec,post,opts,brand)};
    var fresh = core.compose.slide(spec, slideSpec, tokens, brand, opts), root = r.el, warnings = [];
    Array.prototype.slice.call(root.attributes).forEach(function (a) { root.removeAttribute(a.name); });
    Array.prototype.slice.call(fresh.attributes).forEach(function (a) { root.setAttribute(a.name, a.value); });
    root.textContent = "";
    while (fresh.firstChild) root.appendChild(fresh.firstChild);
    /* a root that is detached or hidden has no layout: measure it in the stage and put it back afterwards */
    var park = !root.isConnected || !root.offsetWidth, home = root.parentNode, after = root.nextSibling;
    if (park) sharedStage().appendChild(root);
    try {
      await settle(root, core.ready.fontSpecs(tokens), opts, warnings);
      var report = layout(root, tokens, spec, opts, opts.frozenOk);
      report.warnings = warnings.concat(report.warnings);
      r.index = index; r.tokens = tokens; r.fit = report;
      announce(r);
      return r;
    } finally {
      if (park) { root.remove(); if (home) home.insertBefore(root, after && after.parentNode === home ? after : null); }
    }
  }

  core.render = { slide: slide, deck: deck, update: update };
})();
