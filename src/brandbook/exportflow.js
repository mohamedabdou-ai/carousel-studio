(function () {
var U = CS.ui._;
var guardAsync = U.guardAsync;
var serializeSource = CS.ui.serializeSource;
/* brandbook/exportflow.js · the export operations behind the Export screen: publishing kit, single files and the progress state.
 * Everything is derived from the spec by CS.export; the Studio only gates, reports progress and saves. */

var EXPORT_ERRORS = ["E_ENCODER_UNSUPPORTED", "E_DEP_LOAD", "E_PAINT_TAINTED", "E_PAINT_UNSUPPORTED", "E_FONT_MISSING", "E_FIT_OVERFLOW"];

function attachExport(ctx) {
  ctx.exp = { running: false, done: 0, total: 0, label: "", ctrl: null, last: null, caps: null, options: { video: true, variants4x5: true, pdf: true, source: false } };      // source files are opt-in (CONTRACT 4.7)

  function note() { ctx.bus.emit("export"); }

  function exportCtx(signal) {
    return {
      brand: ctx.brand, assets: ctx.assets, dialect: U.dialect(), signal: signal,
      sourceHtml: function () { return serializeSource(); },
      onProgress: function (p) {
        ctx.exp.done = p.done; ctx.exp.total = p.total;
        ctx.exp.label = p.label || p.job || "";
        note();
      }
    };
  }

  ctx.exportCaps = function () {
    if (ctx.exp.caps) return ctx.exp.caps;
    ctx.exp.caps = guardAsync("export.capabilities", function () { return CS.export.capabilities(); }, null).then(function (c) {
      ctx.exp.caps = Promise.resolve(c);
      ctx.exp.capsValue = c;
      note();
      return c;
    });
    return ctx.exp.caps;
  };

  function explain(e) {
    var code = e && e.code;
    if (code === "E_ABORTED") return null;
    if (EXPORT_ERRORS.indexOf(code) >= 0) return t("export.err." + code);
    return t("export.err.generic");
  }

  /** Run one export job with progress, cancel and uniform error handling. Resolves the job's value or null. */
  async function job(label, fn) {
    if (ctx.exp.running) return null;
    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    ctx.exp.running = true; ctx.exp.ctrl = ctrl; ctx.exp.done = 0; ctx.exp.total = 0; ctx.exp.label = label;
    note();
    try {
      return await fn(exportCtx(ctrl && ctrl.signal), ctrl && ctrl.signal);
    } catch (e) {
      var msg = explain(e);
      if (msg) { reportError("export", e); toast(msg, "error"); CS.emit("cs:export-error", { code: (e && e.code) || "E_USAGE", message: String((e && e.message) || e) }); }
      return null;
    } finally {
      ctx.exp.running = false; ctx.exp.ctrl = null;
      note();
    }
  }

  ctx.cancelExport = function () { if (ctx.exp.ctrl) ctx.exp.ctrl.abort(); };

  /** Save files through CS.export.save and summarise the outcome for the user. */
  async function deliver(files, saveOpts) {
    var list = Array.isArray(files) ? files : [files];
    var res = await CS.export.save(list, Object.assign({ mode: "auto", onStatus: function (s) { ctx.exp.label = s; note(); } }, saveOpts || {}));
    ctx.exp.last = { at: Date.now(), saved: res.saved || [], declined: res.declined || [], failed: res.failed || [], skipped: ctx.exp.last && ctx.exp.last.skipped || [] };
    if ((res.saved || []).length) toast(t("export.saved", { n: res.saved.length }), "ok");
    else if ((res.declined || []).length) toast(t("export.declined"), "info");
    if ((res.failed || []).length) toast(t("export.failed", { n: res.failed.length }), "error");
    CS.emit("cs:export-done", { files: list.map(function (f) { return { path: f.path || f.name, bytes: f.bytes ? f.bytes.length : 0 }; }) });
    note();
    return res;
  }

  /** Make sure the layout is approved and frozen before producing final files. */
  ctx.ensureFrozen = async function () {
    var ok = ctx.spec.frozen && guard("freeze.verify", function () { return CS.core.freeze.verify(ctx.spec, ctx.tokens || CS.core.resolve.post(ctx.spec, ctx.brand)).ok; }, false);
    if (ok) return true;
    await ctx.approve("design", { save: false });
    return !!ctx.spec.frozen;
  };

  /** Everything that must hold before a kit can be written. Returns {ok, reason}. */
  ctx.exportGate = async function () {
    if (ctx.qa.stale || !ctx.qa.all) await ctx.runQa();
    var hard = ctx.blockers();
    if (hard.length) return { ok: false, reason: "blocked", blockers: hard };
    return { ok: true };
  };

  ctx.exportKit = async function (opts) {
    opts = Object.assign({}, ctx.exp.options, opts || {});
    var gate = await ctx.exportGate();
    if (!gate.ok) { toast(t("export.blocked", { n: gate.blockers.length }), "warn"); ctx.go("export"); return { mode: "downloads", saved: [], declined: [], failed: [{ name: "kit", error: "qa-blocked" }] }; }
    if (!(await ctx.ensureFrozen())) return { mode: "downloads", saved: [], declined: [], failed: [{ name: "kit", error: "not-approved" }] };
    var kit = await job(t("export.job.kit"), async function (ectx, signal) {
      return CS.export.kit(ctx.spec, ectx, {
        video: opts.video, variants4x5: opts.variants4x5, pdf: opts.pdf, source: opts.source, zip: true, dialect: U.dialect(),
        onProgress: ectx.onProgress, signal: signal
      });
    });
    if (!kit) return { mode: "downloads", saved: [], declined: [], failed: [{ name: "kit", error: "export-failed" }] };
    var exportBlocks = (kit.report && kit.report.results || []).filter(function (r) { return r.sev === "BLOCK" && !r.overridden; });
    if (exportBlocks.length) {
      ctx.qa.exportBlocks = exportBlocks;
      toast(t("export.kit.blocked", { n: exportBlocks.length }), "error");
      ctx.bus.emit("qa", { kind: "export" });
      return { mode: "downloads", saved: [], declined: [], failed: [{ name: "kit", error: "export-qa" }] };
    }
    ctx.exp.last = { at: Date.now(), saved: [], declined: [], failed: [], skipped: kit.skipped || [] };
    if ((kit.skipped || []).some(function (s) { return /mp4/.test(s.path); })) toast(t("export.video.skipped"), "warn");
    var res = await job(t("export.job.save"), function () { return deliver(kit.zip ? [kit.zip] : kit.files); });
    if (res && (res.saved || []).length) {
      ctx.commit(function (sp) {
        var next = Object.assign({}, sp, { checkpoint: "exported" });
        if (kit.report) next.qa = { status: kit.report.status, runAt: kit.report.createdAt || isoNow(), engine: kit.report.engine || CS.version, results: (kit.report.results || []).slice(0, 400) };
        return next;
      }, { layout: false, slides: [], origin: "export" });
    }
    return res || { mode: "downloads", saved: [], declined: [], failed: [] };
  };

  /** Single-file exports: png | png-one | jpeg | mp4 | mp4-4x5 | pdf | source | text:<name> | photos. */
  ctx.exportFiles = async function (kind, o) {
    o = o || {};
    var spec = ctx.spec;
    return job(t("export.job." + kind.split(":")[0]), async function (ectx, signal) {
      var files, saveOpts;
      if (kind === "png" || kind === "photos") {
        files = await CS.export.slides(spec, ectx, { format: "png", onProgress: ectx.onProgress, signal: signal });
        if (kind === "photos") {
          if (spec.cover && spec.cover.motion && spec.cover.motion.recipe !== "none" && o.video !== false) {
            try { files.unshift(await CS.export.cover(spec, ectx, { variant: "3x4", onProgress: ectx.onProgress, signal: signal })); }
            catch (e) { if (e && e.code === "E_ABORTED") throw e; toast(t("export.video.skipped"), "warn"); }
          }
          saveOpts = { mode: "share" };
        }
      } else if (kind === "png-one") files = await CS.export.slides(spec, ectx, { format: "png", only: [o.slideId || ctx.sel], onProgress: ectx.onProgress, signal: signal });
      else if (kind === "jpeg") files = await CS.export.slides(spec, ectx, { format: "jpeg4x5", onProgress: ectx.onProgress, signal: signal });
      else if (kind === "mp4") files = [await CS.export.cover(spec, ectx, { variant: "3x4", onProgress: ectx.onProgress, signal: signal })];
      else if (kind === "mp4-4x5") files = [await CS.export.cover(spec, ectx, { variant: "4x5", onProgress: ectx.onProgress, signal: signal })];
      else if (kind === "pdf") {
        var pages = await CS.export.slides(spec, ectx, { format: "png", onProgress: ectx.onProgress, signal: signal });
        files = [await CS.export.pdf(pages, { title: (spec.brief && spec.brief.topic) || "carousel" })];
      } else if (kind === "source") {
        var src = await CS.export.source(spec, ectx, { signal: signal, check: true });
        files = [CS.export.zip(src.files, { name: spec.id + "-source.zip", root: "carousel-source" })];
        if (src.skipped.length) toast(t("export.source.partial"), "warn");
      } else if (kind.indexOf("text:") === 0) {
        var name = kind.slice(5);
        var tx = CS.export.text;
        if (name === "caption") files = [tx.caption(spec)];
        else if (name === "hashtags") files = [tx.hashtags(spec)];
        else if (name === "slideCaptions") files = [tx.slideCaptions(spec)];
        else if (name === "alt") files = [tx.alt(spec)];
        else if (name === "postingGuide") files = [tx.postingGuide(U.dialect(), { anyAi: ctx.anyAi() })];
        else throw new CS.CSError("E_USAGE", "unknown text export " + name);
      } else throw new CS.CSError("E_USAGE", "unknown export " + kind);
      var res = await deliver(files, saveOpts);
      if (saveOpts && saveOpts.mode === "share" && res && !(res.saved || []).length && !(res.declined || []).length) res = await deliver(files, { mode: "auto" });
      return res;
    });
  };

  /** The posting guide as Markdown text (the Export screen renders it as cards). */
  ctx.postingGuideText = function () {
    var f = guard("export.text.postingGuide", function () { return CS.export.text.postingGuide(U.dialect(), { anyAi: ctx.anyAi() }); }, null);
    if (!f || !f.bytes) return "";
    try { return new TextDecoder("utf-8").decode(f.bytes); } catch (e) { return ""; }
  };
}

U.attachExport = attachExport;
})();
