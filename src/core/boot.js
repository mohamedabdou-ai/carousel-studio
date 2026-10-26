/* core/boot.js · CS.core.boot: from an HTML page that embeds its data to an engine that is ready to render.
 *
 *   schemas (registered with the validator) -> registry.loadPage (rules, fonts, presets, occasions, archetypes) -> light checks of
 *   the spec and the brand -> fonts loaded -> cs:boot
 *
 * A broken spec that cannot be rendered at all (no slides array, no locale, no style) rejects with E_SCHEMA; anything the schema
 * merely dislikes is reported through cs:error and the page still opens, so the owner can fix it in the Studio.
 */
(function () {
  var core = (CS.core = CS.core || {});

  var REQUIRED = ["text", "color", "canon", "schema"];

  function assertLibraries() {
    var missing = REQUIRED.filter(function (k) { return !core[k]; });
    if (missing.length) throw new CS.CSError("E_USAGE", "The engine needs CS.core." + missing.join(", CS.core.") + " (the library half of cs-core.js) and did not find it.", { missing: missing });
  }

  function report(code, message, detail) { CS.emit("cs:error", { code: code, message: message, detail: detail }); }

  function checkSpec(spec) {
    if (!spec) return;
    if (!Array.isArray(spec.slides) || !spec.locale || !spec.style || !spec.style.presetId) {
      throw new CS.CSError("E_SCHEMA", "The embedded spec has no slides, locale or style and cannot be rendered.", { keys: Object.keys(spec) });
    }
    var res = core.spec.validate(spec);
    if (!res.ok) report("E_SCHEMA", "The spec does not match its schema (" + (res.errors[0] ? res.errors[0].path + " " + res.errors[0].message : res.structure[0].path + " " + res.structure[0].message) + ").", { errors: res.errors, structure: res.structure });
  }

  async function boot(doc) {
    doc = doc || document;
    assertLibraries();
    var schemas = core.registry.readBlock(doc, "cs-schemas");
    if (schemas && typeof core.schema.register === "function") Object.keys(schemas).forEach(function (k) { core.schema.register(k, schemas[k]); });
    var data = core.registry.loadPage(doc);
    CS.visual?._?.reset?.();
    checkSpec(data.spec);
    if (data.brand) {
      try { var b = core.schema.validate("brand", data.brand); if (b && b.ok === false) report("E_SCHEMA", "The brand does not match its schema (" + b.errors[0].path + " " + b.errors[0].message + ").", { errors: b.errors }); }
      catch (e) { /* no brand schema registered */ }
    }
    /* the faces the opening post uses first; the other embedded families load when a render asks for them (the Style tab) */
    var ids = null;
    try { if (data.spec) ids = core.ready.fontSpecs(core.resolve.post(data.spec, data.brand)); } catch (e) { ids = null; }
    if (!ids) ids = data.config.fonts && data.config.fonts.length ? data.config.fonts : core.registry.fontIds();
    try { await core.ready.fonts(ids, 10000); }
    catch (e) { report((e && e.code) || "E_FONT_MISSING", (e && e.message) || "fonts did not load", e && e.detail); }
    CS.emit("cs:boot", { config: data.config });
    return data;
  }

  core.boot = boot;
})();
