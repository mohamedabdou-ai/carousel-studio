/* ui/qa.js · quality gates in the Studio: fast text checks on every edit, a full rendered run on demand,
 * overrides, auto-fix and the two approvals (script, design). */

var SEV_RANK = { BLOCK: 0, FIX: 1, NOTE: 2 };

function sortFindings(list, spec) {
  var order = {};
  (spec.slides || []).forEach(function (s, i) { order[s.id] = i; });
  return list.slice().sort(function (a, b) {
    return (SEV_RANK[a.sev] - SEV_RANK[b.sev]) ||
      ((order[a.slide] === undefined ? -1 : order[a.slide]) - (order[b.slide] === undefined ? -1 : order[b.slide])) ||
      String(a.rule || a.gate).localeCompare(String(b.rule || b.gate));
  });
}

function summarizeFindings(list) {
  var c = { block: 0, fix: 0, note: 0 };
  list.forEach(function (r) {
    if (r.overridden) return;
    if (r.sev === "BLOCK") c.block++; else if (r.sev === "FIX") c.fix++; else c.note++;
  });
  return { status: c.block ? "block" : c.fix ? "fix" : "pass", counts: c, exitCode: c.block ? 2 : c.fix ? 1 : 0 };
}

/** The cover's length rules are one decision («keep my 7-word hook»): an override of one covers the others on that slide. */
var COVER_LENGTH = ["C1.hero-words", "C1.total-words", "C1.lines"];

/** Copy "overridden" flags from the previous results onto fresh ones. An override covers one rule on one slide (CS.qa.override takes {slide}). */
function carryOverrides(prev, fresh) {
  var map = {}, length = {};
  (prev || []).forEach(function (r) {
    if (!r.overridden) return;
    map[(r.rule || r.gate) + "|" + (r.slide || "")] = r.overridden;
    if (COVER_LENGTH.indexOf(r.rule) >= 0) length[r.slide || ""] = r.overridden;
  });
  return fresh.map(function (r) {
    if (r.overridden) return r;
    var o = map[(r.rule || r.gate) + "|" + (r.slide || "")] || (COVER_LENGTH.indexOf(r.rule) >= 0 ? length[r.slide || ""] : null);
    return o ? Object.assign({}, r, { overridden: o }) : r;
  });
}

/** The open siblings that an override of `r` also covers (see COVER_LENGTH). */
function lengthSiblings(results, r) {
  if (!r || COVER_LENGTH.indexOf(r.rule) < 0) return [];
  return (results || []).filter(function (o) {
    return o !== r && o.slide === r.slide && !o.overridden && o.rule !== r.rule && COVER_LENGTH.indexOf(o.rule) >= 0;
  });
}

function attachQa(ctx) {
  var ruleIndex = null;
  function rules() {
    if (ruleIndex) return ruleIndex;
    var block = guard("qa.rules", function () { return CS.qa.rules(); }, null) || (readJsonBlock("cs-rules") || {}).qaRules || { gates: [] };
    ruleIndex = {};
    (block.gates || []).forEach(function (g) { (g.checks || []).forEach(function (c) { ruleIndex[c.id] = c; }); });
    return ruleIndex;
  }
  ctx.ruleOf = function (r) { return rules()[r.rule] || null; };
  /** Overridable gates (CONTRACT 7.1): the rule's own flag, else the contract's fixed set C1.*, C2.body-hard, C3.*, O1.*. */
  ctx.isOverridable = function (r) {
    var c = ctx.ruleOf(r);
    if (c && typeof c.overridable === "boolean") return c.overridable;
    var id = r.rule || "";
    return /^(C1|C3|O1)\./.test(id) || id === "C2.body-hard";
  };

  /** All findings currently valid: the last full run while it is fresh, else the fast text run. */
  ctx.results = function () {
    var list = ctx.qa.stale ? ctx.qa.text : (ctx.qa.all || ctx.qa.text);
    return sortFindings(list, ctx.spec);
  };
  ctx.summary = function () { return summarizeFindings(ctx.results()); };
  ctx.findingsOf = function (slideId) { return ctx.results().filter(function (r) { return r.slide === slideId; }); };

  ctx.runTextQa = function () {
    var history = ctx.brand && ctx.brand.hooks ? ctx.brand.hooks.history : undefined;
    var res = guard("qa.runText", function () { return CS.qa.runText({ spec: ctx.spec, brand: ctx.brand, history: history }); }, null);
    if (res) ctx.qa.text = carryOverrides(ctx.spec.qa && ctx.spec.qa.results, res);
    ctx.bus.emit("qa", { kind: "text" });
    return ctx.qa.text;
  };

  /** Full run: text + rendered gates on a fresh export-mode deck. Resolves with the QAReport (or null when the engine is missing). */
  ctx.runQa = function (o) {
    o = o || {};
    if (ctx.qa.promise) return ctx.qa.promise;
    ctx.qa.running = true;
    ctx.bus.emit("qa", { kind: "start" });
    var spec = ctx.spec;
    ctx.qa.promise = (async function () {
      var report = null;
      try {
        report = await ctx.withDeck(spec, "export", function (deck) {
          return CS.qa.run({ spec: spec, brand: ctx.brand, tokens: deck.tokens, deck: deck, checkpoint: spec.checkpoint, lane: "studio" });
        }, o.useFrozen);
      } catch (e) {
        reportError("qa.run", e);
        toast(t("check.run.failed"), "error");
      }
      ctx.qa.running = false;
      ctx.qa.promise = null;
      if (report) {
        var results = carryOverrides(spec.qa && spec.qa.results, report.results || []);
        ctx.qa.report = Object.assign({}, report, { results: results });
        ctx.qa.all = results;
        ctx.qa.text = results.filter(function (r) { return /^(C|O|N|SRC|SEN)/.test(r.gate); });
        ctx.qa.at = Date.now();
        ctx.qa.stale = ctx.spec !== spec && !same(ctx.spec.slides, spec.slides);
        var sum = summarizeFindings(results);
        var stored = { status: sum.status, runAt: report.createdAt || isoNow(), engine: report.engine || (CS.version || "cs-1.1.1"), results: results.slice(0, 400) };
        ctx.commit(function (sp) { return Object.assign({}, sp, { qa: stored }); }, { layout: false, quiet: true, history: false, slides: [], origin: "qa" });
        guard("emit cs:qa", function () { CS.emit("cs:qa", { report: ctx.qa.report }); });
      }
      ctx.bus.emit("qa", { kind: "done" });
      return ctx.qa.report;
    })();
    return ctx.qa.promise;
  };

  ctx.autoFix = async function () {
    var list = ctx.results().filter(function (r) { return !r.overridden; });
    var res = guard("qa.autofix", function () { return CS.qa.autofix(ctx.spec, list, { brand: ctx.brand }); }, null);
    if (!res || !res.applied || !res.applied.length) { toast(t("check.autofix.none"), "info"); return 0; }
    ctx.commit(function () { return res.spec; }, { origin: "qa" });
    ctx.runTextQa();
    toast(t("check.autofix.done", { n: res.applied.length }), "ok", { action: { label: t("common.undo"), fn: function () { ctx.undo(); } } });
    return res.applied.length;
  };

  /** Record a justified override of an overridable finding (CONTRACT 7.1: C1.*, C2.body-hard, C3.*, O1.*). */
  ctx.override = function (r, reason) {
    var next = null;
    var at = isoNow();
    try {
      next = CS.qa.override(ctx.spec, r.rule || r.gate, { slide: r.slide, reason: reason, at: at });
      lengthSiblings(ctx.results(), r).forEach(function (o) {
        try { next = CS.qa.override(next, o.rule, { slide: o.slide, reason: reason, at: at }); } catch (e) { /* not in the saved results: nothing to mark */ }
      });
    }
    catch (e) { reportError("qa.override", e); toast(t("check.override.refused"), "error"); return false; }
    ctx.commit(function () { return next; }, { layout: false, slides: [], origin: "qa" });
    if (ctx.qa.all) ctx.qa.all = carryOverrides(ctx.spec.qa && ctx.spec.qa.results, ctx.qa.all);
    ctx.runTextQa();
    return true;
  };

  /** Findings that stop «حزمة النشر»: BLOCK items nobody overrode. */
  ctx.blockers = function () { return ctx.results().filter(function (r) { return r.sev === "BLOCK" && !r.overridden; }); };
  ctx.hardBlockers = function () { return ctx.blockers().filter(function (r) { return !ctx.isOverridable(r); }); };

  ctx.explainColor = function (path) {
    return guard("resolve.explain", function () { return CS.core.resolve.explain(ctx.tokens || CS.core.resolve.post(ctx.spec, ctx.brand), path); }, null);
  };

  /* ---- approvals --------------------------------------------------------------------------------------------- */

  /** Approve a checkpoint. opts.save === false skips the publish that normally follows (publishing reloads the page, so a running export must not trigger it). */
  ctx.approve = async function (cp, opts) {
    var spec = ctx.spec;
    if (cp === "script") {
      var blocks = ctx.runTextQa().filter(function (r) { return r.sev === "BLOCK" && !r.overridden; });
      if (blocks.length) {
        var go = await dialog({
          title: t("approve.script.blocked.title"), body: t("approve.script.blocked.text", { n: blocks.length }),
          actions: [{ label: t("approve.script.review"), value: "review", kind: "ghost" }, { label: t("approve.script.anyway"), value: "go", kind: "primary" }]
        });
        if (go !== "go") { if (go === "review") ctx.go("check"); return; }
      }
      ctx.commit(function (sp) {
        var next = Object.assign({}, sp, { approvals: Object.assign({}, sp.approvals, { script: { at: isoNow(), rev: sp.rev } }) });
        if (ctx.checkpointRank() < 2) next.checkpoint = "design";
        return next;
      }, { layout: false, slides: [], origin: "approve" });
      CS.emit("cs:approve", { checkpoint: "script", rev: spec.rev });
      ctx.go("design");
      toast(t("approve.script.done"), "ok");
      if (!opts || opts.save !== false) ctx.requestSave("approve");
      return;
    }
    if (cp === "design") {
      toast(t("approve.design.checking"), "info", { ttl: 2200 });
      var report = await ctx.runQa({ useFrozen: false });
      var hard = ctx.blockers();
      if (hard.length) {
        var pick = await dialog({
          title: t("approve.design.blocked.title"), body: t("approve.design.blocked.text", { n: hard.length }),
          actions: [{ label: t("common.cancel"), value: null, kind: "ghost" }, { label: t("approve.design.review"), value: "review", kind: "primary" }]
        });
        if (pick === "review") ctx.go("check");
        return;
      }
      var frozen = null;
      try {
        frozen = await ctx.withDeck(ctx.spec, "export", function (deck) { return CS.core.freeze.capture(deck.slides, ctx.spec, deck.tokens); }, false);
      } catch (e) { reportError("freeze.capture", e); toast(t("approve.design.failed"), "error"); return; }
      ctx.commit(function (sp) {
        return Object.assign({}, sp, {
          frozen: frozen,
          checkpoint: "ready",
          approvals: Object.assign({}, sp.approvals, { design: { at: isoNow(), rev: sp.rev } })
        });
      }, { layout: false, slides: [], origin: "approve" });
      CS.emit("cs:approve", { checkpoint: "design", rev: ctx.spec.rev });
      toast(t("approve.design.done"), "ok");
      if (!opts || opts.save !== false) ctx.requestSave("approve");
      return report;
    }
  };
}
