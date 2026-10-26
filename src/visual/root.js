/* src/visual/root.js - owned by F3. CS.visual (IS-2): members arrive through _.register; the hooks below are
 * no-op defaults that hooks.js (E2a) and settle.js (A9) replace. */
(function () {
  var V = (CS.visual = CS.visual || {}), cache = Object.create(null), none = function () { return null; };
  V.version = "1.1.0";
  V._ = V._ || {};
  V._.errors = {};

  /** Parsed JSON block (cs-icon-pack ...) or null. Node tests set V._.blocks = { id: value }, which wins. */
  V._.block = function block(id) {
    var shim = V._.blocks, reg = CS.core && CS.core.registry;
    if (shim && Object.prototype.hasOwnProperty.call(shim, id)) return shim[id];
    if (!(id in cache)) {
      cache[id] = null;
      try { if (reg && typeof document !== "undefined") cache[id] = reg.readBlock(document, id); }
      catch (e) { V._.errors[id] = String(e.message || e); }
    }
    return cache[id];
  };
  V._.reset = function reset() { cache = Object.create(null); V._.errors = {}; };
  V._.register = function register(name, member) {
    if (typeof name !== "string" || !/^[a-z][A-Za-z0-9]*$/.test(name) || name === "version") throw new Error("CS.visual: bad member " + name);
    return (V[name] = member);
  };

  V.fill = none;
  V.decorate = function () {};
  V.chrome = function () { return { rail: null, motif: null }; };
  V.settle = function () { return { marks: [] }; };
  V.expected = none;
  V.autoPreview = function () { return []; };
})();
