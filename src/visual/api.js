/* C1: guarded art API and DOM-free slice capabilities. */
(function () {
  function A() { return CS.art || null; }
  CS.visual._.register("art", {
    caps: function () { var a = A(); return a ? a.caps() : { v: 1, art: {} }; },
    has: function (kind, sub) { var a = A(); return !!(a && a.has(kind, sub)); },
    kinds: function () { var a = A(); return a ? a.kinds() : []; },
    build: function (anchor, ctx) { var a = A(); return a ? a.build(anchor, ctx) : null; },
    icon: function (name, o) { var a = A(); return a && a.icon ? a.icon(name, o) : null; },
    object: function (id, o) { var a = A(); return a && a.object ? a.object(id, o) : null; },
    measure: function (o) { var a = A(); return a && a.icon ? a.icon.measure(o) : null; }
  });
  
  CS.visual.caps = function caps() {
    var c = CS.visual.art.caps();
    c.recipes = ["under", "over", "full", "center"];
    c.variants = { stat: ["icon", "chart"], compare: ["table", "before-after"], quote: ["statement"], rehook: ["statement"], step: ["track"], cta: ["action"], item: ["numeral"], grid: ["bento"], timeline: ["rail"] };
    c.types = "cover rehook item step stat compare myth-fact quote story-beat checklist summary setup proof share cta offer testimonial poster grid timeline".split(" ");
    c.tones = ["base", "invert", "field"];
    c.hash = CS.core.canon.fnv1a64(CS.core.canon.canonicalJSON(c));
    return c;
  };
})();
