/* Free slides reuse the Studio slot editors; literal edits rewrite the sanitized source tree. */
(function () {
  var U = CS.ui?._; if (!U) return;
  var V = CS.vui = CS.vui || {};
  V.commitFree = function (ctx, slide, slot, text) {
    var F = CS.visual.free, field = slot.field || "", path = field.split(".");
    if (field.startsWith("free-edit.")) {
      var html = F.edit(slide.free.html, path[1], text);
      if (html === slide.free.html) return false;
      ctx.setSlide(slide.id, { free: Object.assign({}, slide.free, { html: html }) }, { origin: "inplace" });
    } else {
      if (!F.field(field) || F.value(slide, field) === text) return false;
      // number is the established value/unit block; editing the displayed value keeps the unit separate.
      if (field === "number" && typeof slide.number === "object") {
        var unit = slide.number.unit || "", val = unit && text.endsWith(" " + unit) ? text.slice(0, -unit.length - 1) : text;
        ctx.setSlide(slide.id, { number: Object.assign({}, slide.number, { value: val }) }, { origin: "inplace" });
      } else {
        var key = path.shift(), patch = {};
        patch[key] = path.length ? U.setPath(slide[key], path.map(function (p) { return /^\d+$/.test(p) ? +p : p; }), text) : text;
        ctx.setSlide(slide.id, patch, { origin: "inplace" });
      }
    }
    ctx.runTextQa(); return true;
  };
  (U.panels.slide = U.panels.slide || []).push(function (ctx, s) {
    if (!CS.visual.free.active(s)) return null;
    return U.sec("تصميم حر", null, U.h("button", { type: "button", class: "ui-btn ui-btn--secondary", "data-free-reset": "", onclick: function () {
      ctx.setSlide(s.id, { free: undefined }, { origin: "visual" }); ctx.runTextQa();
    } }, "رجّع للتصميم التلقائي"));
  });
})();
