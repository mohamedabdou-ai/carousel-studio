/* C1: strict (kind, sub) registry. */
(function () {
var a = CS.art = CS.art || {}, t = Object.create(null);
a.kit = a.kit || {}; a._ = a._ || {};
a._.sub = function (v) {
var k = v.kind;
return k === "icon" ? k : k === "scene" ? v.template || "solo" : k === "chart" || k === "mock" ? (v[k] || {}).kind : k === "pattern" ? v.pattern : k === "numeral" ? v.companion || "none" : k === "word" ? v.wordStyle || "solid" : k === "rows" ? "list" : k === "field" ? v.value ? "numeral" : v.word ? "word" : v.icon || v.object ? "icon" : "panel" : undefined;
};
function fail(code) { var e = new Error(code); e.code = code; throw e; }
a.register = function (k, f, s) {
var seen = Object.create(null), r = /^[a-z][a-z0-9-]*$/;
if (typeof k !== "string" || !r.test(k) || typeof f !== "function" || !Array.isArray(s) || !s.length || Array.from(s).some(function (v) { return typeof v !== "string" || !r.test(v); })) fail("E_ART_REGISTER");
s.forEach(function (v) { if (seen[v] || t[k] && t[k][v]) fail("E_ART_DUPLICATE"); seen[v] = 1; });
t[k] = t[k] || Object.create(null); s.forEach(function (v) { t[k][v] = f; }); return f;
};
a.has = function (k, s) { return !!(t[k] && (s === undefined || t[k][s])); };
a.kinds = function () { return Object.keys(t).sort(); };
a.caps = function () { var c = {}; a.kinds().forEach(function (k) { c[k] = Object.keys(t[k]).sort(); }); return { v: 1, art: c }; };
a.build = function (v, c) { var s = v && a._.sub(v), f = v && s !== undefined && t[v.kind] && t[v.kind][s]; return f ? f(v, c) || null : null; };
})();
