/* core/ready.js · "the slide is really ready to be measured and painted".
 *
 * Fonts first (the fit search measures glyphs, so a late font would give wrong lines), then images and video posters, then two
 * animation frames so the browser has laid out and painted what was decoded. The first complete render also flips
 * window.__csReady, the flag that render.mjs waits for (CONTRACT 4.2).
 */
(function () {
  var core = (CS.core = CS.core || {});

  /* Arabic letters, tatweel, Arabic-Indic digits, Latin letters, digits: pulls every unicode-range subset of an embedded face. */
  var SAMPLE = "أبجد هوز ـ ٠١٢٣ ABC abc 0123";
  var loaded = {};

  if (typeof window !== "undefined" && window.__csReady !== true) window.__csReady = false;

  function weightsOf(entry) {
    var out = [];
    (entry.files || []).forEach(function (f) {
      var w = Array.isArray(f.wght) ? f.wght[0] : f.wght;
      if (typeof w === "number" && out.indexOf(w) < 0) out.push(w);
    });
    return out.length ? out : [400];
  }

  function abortError() { return new CS.CSError("E_ABORTED", "Aborted."); }

  /** [{id, all, w}]: a plain id wants every face of the family, {id, wght} only the face for that weight. */
  function normalise(list) {
    var by = {}, order = [];
    (list || []).forEach(function (x) {
      var id = typeof x === "string" ? x : x && x.id;
      if (!id) return;
      if (!by[id]) { by[id] = { id: id, all: false, w: [] }; order.push(id); }
      if (typeof x === "string" || x.wght === undefined || x.wght === null) by[id].all = true;
      else if (by[id].w.indexOf(x.wght) < 0) by[id].w.push(x.wght);
    });
    return order.map(function (id) { return by[id]; });
  }

  /** The faces a set of tokens really uses: [{id, wght}] for display, heading, body and latin. */
  function fontSpecs(tokens) {
    return ["display", "heading", "body", "latin"].map(function (r) { return { id: tokens.type[r].family, wght: tokens.type[r].wght }; });
  }

  /**
   * Loads faces. `ids` holds registry ids (every weight of the family) or {id, wght} (the face that serves that weight, e.g. from
   * fontSpecs(tokens)). Rejects with E_FONT_MISSING when a face is not usable within `timeoutMs` (default 8000).
   */
  function fonts(ids, timeoutMs) {
    if (!document.fonts || typeof document.fonts.load !== "function") return Promise.resolve();
    var jobs = [], names = [];
    normalise(ids).forEach(function (rec) {
      var id = rec.id, entry = core.registry.fontEntry(id);
      if (!entry) return;
      (rec.all ? weightsOf(entry) : rec.w).forEach(function (w) {
        var spec = w + " 1em \"" + entry.family + "\"", key = id + "|" + w;
        if (loaded[key]) return;
        names.push(entry.family);
        jobs.push(document.fonts.load(spec, SAMPLE).then(function (faces) {
          if (!faces || !faces.length) throw new CS.CSError("E_FONT_MISSING", "No @font-face is declared for " + entry.family + " " + w + ".", { id: id, weight: w });
          loaded[key] = true;
        }));
      });
    });
    if (!jobs.length) return Promise.resolve();
    var timer, timeout = new Promise(function (_, reject) {
      timer = setTimeout(function () { reject(new CS.CSError("E_FONT_MISSING", "Fonts did not load in time: " + names.join(", ") + ".", { families: names })); }, timeoutMs || 8000);
    });
    return Promise.race([Promise.all(jobs).then(function () { return document.fonts.ready; }), timeout]).then(
      function () { clearTimeout(timer); },
      function (e) { clearTimeout(timer); throw e; }
    );
  }

  function once(target, names, ms) {
    return new Promise(function (resolve) {
      var done = false, t;
      function fin() { if (done) return; done = true; clearTimeout(t); names.forEach(function (n) { target.removeEventListener(n, fin); }); resolve(); }
      names.forEach(function (n) { target.addEventListener(n, fin); });
      t = setTimeout(fin, ms);
    });
  }

  /** Waits for decoded <img> and for the first frame of <video> inside `root`. Broken images do not block. */
  function images(root) {
    root = root || document;
    var jobs = [];
    root.querySelectorAll("img").forEach(function (img) {
      if (img.complete && img.naturalWidth) return;
      if (typeof img.decode === "function") jobs.push(img.decode().catch(function () { /* a broken image is reported by QA, it must not block the render */ }));
      else jobs.push(once(img, ["load", "error"], 5000));
    });
    root.querySelectorAll("video").forEach(function (v) {
      if (v.readyState >= 2) return;
      jobs.push(once(v, ["loadeddata", "error"], 5000));
    });
    return Promise.all(jobs).then(function () { /* void */ });
  }

  /** Fonts that are being used + images + two animation frames. */
  function whenReady(root) {
    root = root || document;
    if (root.nodeType === 1) void root.offsetHeight;     // force layout so the faces in use are requested
    return Promise.resolve(document.fonts && document.fonts.ready).then(function () { return images(root); }).then(function () { return CS.util.raf2(); });
  }

  var pending = null;
  /** Called after a render completes; the first call flips window.__csReady and emits cs:ready. */
  function markReady() {
    if (window.__csReady === true) return Promise.resolve();
    if (pending) return pending;
    pending = Promise.resolve(document.fonts && document.fonts.ready).then(function () { return CS.util.raf2(); }).then(function () {
      if (window.__csReady === true) return;
      window.__csReady = true;
      CS.emit("cs:ready", { ms: Math.round((window.performance && performance.now()) || 0) });
    });
    return pending;
  }

  function checkAbort(signal) { if (signal && signal.aborted) throw abortError(); }

  core.ready = { fonts: fonts, fontSpecs: fontSpecs, images: images, whenReady: whenReady, markReady: markReady, checkAbort: checkAbort };
})();
