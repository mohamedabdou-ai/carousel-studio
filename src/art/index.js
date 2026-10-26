/* src/art/index.js - owned by A1. The public face of cs-art: version and the enumerations every package reads (sizes, treatments, modifiers). */
(function () {
  var art = CS.art, kit = art.kit;
  art.version = "1.1.0";
  art.sizes = kit.SIZES;
  art.treatments = Object.keys(kit.MULT);
  art.modifiers = ["slash", "cross", "plus", "check", "question", "sparkle"];
  art.describe = function describe() { return { version: art.version, kinds: art.kinds(), treatments: art.treatments, modifiers: art.modifiers, sizes: art.sizes }; };
})();
