/*
 * CS.motion · public API (CONTRACT 4.6).
 *
 *   recipes / list() / register()   what can be chosen
 *   recommend(spec)                 topic -> recipe (+ metaphor and a bilingual reason)
 *   build(slideEl, opts)            slide -> Timeline (data)
 *   mount(slideEl, timeline)        live player
 *   tween                           ease / lerp / counter (the engine's own helpers)
 *   metaphors                       the drawn symbols of the story recipe
 */

function registerRecipe(recipe) {
  if (!recipe || typeof recipe.id !== "string" || typeof recipe.build !== "function") throw motionError("E_USAGE", "A recipe needs an id and a build(ctx) function.");
  defineRecipe({ id: recipe.id, label: recipe.label || { ar: recipe.id, en: recipe.id }, feel: recipe.feel === "story" ? "story" : "calm", ships: recipe.ships || "1.0", topics: recipe.topics, requires: recipe.requires }, function (ctx, P) {
    var out = recipe.build(ctx) || {};
    (out.tracks || []).forEach(function (t) { P.tracks.push(t); });
    (out.counters || []).forEach(function (c) { P.counters.push(c); });
    (out.overlays || []).forEach(function (o) { P.overlays.push(o); });
  });
  CS.motion.recipes[recipe.id] = metaOf(RECIPE_REGISTRY[recipe.id]);
}

function metaOf(r) { return { id: r.id, label: r.label, feel: r.feel, ships: r.ships, topics: r.topics.slice(), requires: r.requires.slice() }; }

function listRecipes(opts) {
  var out = [], id;
  for (id in RECIPE_REGISTRY) if (!(opts && opts.shippedOnly) || isShipped(RECIPE_REGISTRY[id])) out.push(metaOf(RECIPE_REGISTRY[id]));
  return out;
}

var publicRecipes = {};
Object.keys(RECIPE_REGISTRY).forEach(function (id) { publicRecipes[id] = metaOf(RECIPE_REGISTRY[id]); });

CS.motion = CS.motion || {};
CS.motion.FPS = FPS;
CS.motion.TIMES = DEFAULT_TIMES;
CS.motion.alias = ALIASES;
CS.motion.recipes = publicRecipes;
CS.motion.register = registerRecipe;
CS.motion.list = listRecipes;
CS.motion.recommend = recommendMotion;
CS.motion.detectTopics = detectTopics;
CS.motion.build = buildTimeline;
CS.motion.validate = validateTimeline;
CS.motion.mount = mountPlayer;
CS.motion.metaphors = metaphorRegistry();
CS.motion.tween = {
  ease: function (name, t) { return hfEngine().ease(name, t); },
  lerp: function (a, b, t) { return a + (b - a) * t; },
  counter: function (from, to, t, decimals) { return hfEngine().counter(from, to, t, decimals); }
};
