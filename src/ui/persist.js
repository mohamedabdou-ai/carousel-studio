/* ui/persist.js · saving the Studio (CONTRACT 8.6).
 *
 *  A. Publish: the page republishes itself through the "artifact" capability with rev+1 (the viewer reloads to the new version).
 *  C. Patch:   when publishing is not possible, "copy changes" puts a JSON patch envelope on the clipboard for the chat.
 *
 * Unsaved edits are stashed in sessionStorage so a reload (our own publish, a conflict, a host update) never loses work. */

function stashKey(specId) { return "cs-stash:" + specId; }

function attachPersist(ctx) {

  /** The spec that a save would write: current spec, rev+1, updatedBy studio. */
  function bumped() {
    return guard("spec.bump", function () { return CS.core.spec.bump(ctx.spec, "studio"); }, null) ||
      Object.assign({}, ctx.spec, { rev: ctx.spec.rev + 1, meta: Object.assign({}, ctx.spec.meta, { updatedAt: isoNow(), updatedBy: "studio" }) });
  }

  function opsSinceBase(next) {
    return diffSpec(ctx.base, next).filter(function (op) { return op.op !== "test"; });
  }

  /** Write the stash. final: true when a publish is about to reload the page. */
  ctx.stash = function (final) {
    try {
      if (!ctx.dirty && !final) { session.del(stashKey(ctx.spec.id)); return; }
      var next = final ? final : ctx.spec;
      var payload = {
        v: 1, specId: ctx.spec.id, baseRev: ctx.base.rev, nextRev: final ? final.rev : null, at: isoNow(),
        ops: opsSinceBase(next),
        ui: { screen: ctx.screen, view: ctx.view, tab: ctx.tab, sel: ctx.sel }
      };
      session.set(stashKey(ctx.spec.id), JSON.stringify(payload));
    } catch (e) { /* storage full or blocked: nothing else to do */ }
  };
  var stashSoon = debounce(function () { ctx.stash(); }, 700);
  ctx.bus.on("spec", function () { stashSoon(); });
  ctx.bus.on("screen", function () { stashSoon(); });

  /** Put back what a reload dropped. Called once after mount. */
  ctx.restoreStash = async function () {
    var raw = session.get(stashKey(ctx.spec.id), null);
    if (!raw) return;
    var st;
    try { st = JSON.parse(raw); } catch (e) { session.del(stashKey(ctx.spec.id)); return; }
    function ui() {
      if (st.ui && st.ui.sel && ctx.slide(st.ui.sel)) ctx.select(st.ui.sel, { origin: "restore" });
      if (st.ui && st.ui.tab) ctx.setTab(st.ui.tab);
      if (st.ui && st.ui.screen) ctx.go(st.ui.screen);
    }
    var ours = st.nextRev && ctx.spec.rev === st.nextRev && ctx.spec.meta && ctx.spec.meta.updatedBy === "studio";
    if (ours) {
      session.del(stashKey(ctx.spec.id));
      ui();
      toast(t("save.done"), "ok");
      CS.emit("cs:save-result", { ok: true, mode: "publish", rev: ctx.spec.rev });
      return;
    }
    if (!st.ops || !st.ops.length) { session.del(stashKey(ctx.spec.id)); return; }
    function apply() {
      var content = st.ops.filter(function (op) { return !/^\/(rev|meta)(\/|$)/.test(op.path); });
      var next = guard("patch.apply", function () { return CS.core.patch.apply(ctx.spec, content); }, null);
      if (!next) return false;
      ctx.commit(function () { return next; }, { origin: "restore" });
      ui();
      return true;
    }
    if (ctx.spec.rev === st.baseRev) {
      if (apply()) toast(t("save.restored"), "info");
      session.del(stashKey(ctx.spec.id));
      return;
    }
    if (ctx.spec.rev > st.baseRev) {
      var yes = await dialog({
        title: t("save.conflict.title"), body: t("save.conflict.text"),
        actions: [{ label: t("save.conflict.drop"), value: false, kind: "ghost" }, { label: t("save.conflict.restore"), value: true, kind: "primary" }]
      });
      session.del(stashKey(ctx.spec.id));
      if (yes) {
        if (apply()) toast(t("save.restored"), "ok");
        else { toast(t("save.conflict.failed"), "warn"); }
      }
    }
  };

  /** Publish the page with the current spec. Resolves a PublishResult; never throws. */
  ctx.save = async function (reason) {
    reason = reason || "manual";
    if (ctx.busy.save) return { ok: false, mode: "publish", rev: ctx.spec.rev };
    ctx.busy.save = true;
    ctx.bus.emit("busy");
    var result = { ok: false, mode: "patch", rev: ctx.spec.rev };
    try {
      var next = bumped();
      CS.emit("cs:save-request", { spec: next, reason: reason });
      var pub = await useCap("publish");
      var can = pub ? await canPublish() : false;
      if (pub && can && ctx.writer) {
        ctx.stash(next);
        try {
          await pub.publish(serializeForPublish(next));
          ctx.spec = next;
          ctx.base = clone(next);
          ctx.dirty = false;
          result = { ok: true, mode: "publish", rev: next.rev };
          toast(t("save.done"), "ok");
        } catch (e) {
          var code = e && e.code;
          if (code === "conflict") {
            result = { ok: false, mode: "publish", rev: ctx.spec.rev, conflict: true };
            toast(t("save.conflict.toast"), "warn");
          } else if (code === "not_writer" || code === "not_granted" || code === "consent_required" || code === "capability_disabled" || code === "capability_removed" || code === "not_declared") {
            ctx.writer = false;
            session.del(stashKey(ctx.spec.id));
            result = null;
          } else {
            session.del(stashKey(ctx.spec.id));
            reportError("save", e);
            toast(t("save.failed"), "error");
          }
        }
      } else result = null;
      if (result === null) {
        if (reason === "approve") result = { ok: false, mode: "patch", rev: ctx.spec.rev };
        else {
          await ctx.copyPatch();
          result = { ok: true, mode: "patch", rev: next.rev };
        }
      }
    } finally {
      ctx.busy.save = false;
      ctx.bus.emit("busy");
    }
    CS.emit("cs:save-result", result);
    return result;
  };

  /** After an approval: publish silently when we can, otherwise leave the work marked unsaved (no clipboard side effects). */
  ctx.requestSave = function (reason) {
    useCap("publish").then(function (pub) { if (pub) ctx.save(reason); });
  };

  /** Copy the JSON patch envelope that turns the saved version into this one (for pasting into the chat). */
  ctx.copyPatch = async function () {
    var next = bumped();
    var env = patchEnvelope(ctx.base, opsSinceBase(next));
    var text = JSON.stringify(env);
    await copyWithFeedback(text, t("save.patch.label"));
    return text;
  };
}
