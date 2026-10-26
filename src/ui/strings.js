/* ui/strings.js · user-interface strings and the UI dialect (CONTRACT 3.6, 6.7).
 * Lookup order for dialect d: d -> msa-white -> en -> key. */

var UI_DIALECTS = ["eg", "gulf", "levant", "msa-white", "en"];
var uiStrings = {};
var uiDialect = "msa-white";

function loadUiStrings(doc) {
  ["cs-ui-strings", "cs-ui-strings-visual"].forEach(function (id) {
    var node = (doc || document).getElementById(id);
    if (!node) return;
    try {
      var strings = JSON.parse(node.textContent).strings || {};
      if (id === "cs-ui-strings") uiStrings = {};
      mergeUiStrings(strings);
    } catch (e) { reportError("ui-strings", e); }
  });
}

/** Merge per dialect so partial extension bundles retain the base language fallbacks. */
function mergeUiStrings(strings) {
  Object.keys(strings || {}).forEach(function (key) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") return;
    uiStrings[key] = Object.assign({}, uiStrings[key], strings[key]);
  });
}

function fillTemplate(template, params) {
  if (!params) return template;
  return String(template).replace(/\{([A-Za-z0-9_]+)\}/g, function (m, k) { return params[k] === undefined || params[k] === null ? m : String(params[k]); });
}

/** The plural category of a count (CLDR): Arabic has zero, one, two, few (3-10), many (11-99) and other; English has one and other. */
function pluralCategory(n) {
  var x = Math.abs(Number(n));
  if (!isFinite(x)) return "other";
  if (uiLang() === "en") return x === 1 ? "one" : "other";
  if (x === 0) return "zero";
  if (x === 1) return "one";
  if (x === 2) return "two";
  var m = x % 100;
  if (m >= 3 && m <= 10) return "few";
  if (m >= 11 && m <= 99) return "many";
  return "other";
}

/** A dialect entry is a string, or an object of plural forms (one, two, few, many, other) chosen by params.n. */
function pickForm(form, params) {
  if (form === undefined || form === null || typeof form === "string") return form;
  var cat = params && params.n !== undefined && params.n !== null ? pluralCategory(params.n) : "other";
  return form[cat] !== undefined ? form[cat] : form.other;
}

/** Translate a key. Missing keys render as the key itself so a gap is visible, never a blank. */
function t(key, params) {
  var e = uiStrings[key];
  var s = pickForm(e && (e[uiDialect] || e["msa-white"] || e.en), params);
  return s === undefined ? key : fillTemplate(s, params);
}

/** True when a key exists (credit-free builds drop the about.* keys). */
function hasStr(key) { return !!uiStrings[key]; }

function uiLang() { return uiDialect === "en" ? "en" : "ar"; }
function uiDir() { return uiDialect === "en" ? "ltr" : "rtl"; }

/** Pick the right language of a bilingual message {ar, en} (QA findings, adjustments, locale labels). */
function msgOf(m) {
  if (m === undefined || m === null) return "";
  if (typeof m === "string") return m;
  return (uiLang() === "en" ? m.en || m.ar : m.ar || m.en) || "";
}

function setUiDialect(d) {
  if (UI_DIALECTS.indexOf(d) < 0) d = "msa-white";
  uiDialect = d;
  var root = document.documentElement;
  root.setAttribute("lang", uiLang());
  root.setAttribute("dir", uiDir());
  var app = document.getElementById("cs-app");
  if (app) { app.setAttribute("lang", uiLang()); app.setAttribute("dir", uiDir()); }
  CS.emit("cs:ui-dialect", { dialect: d });
}

/** Dialect labels for pickers, from locale-defaults.json when the rules bundle is loaded. */
function dialectLabel(code) {
  var rules = guard("rules", function () { return CS.core.registry.rules(); }, null);
  var d = rules && rules.locale && rules.locale.dialects && rules.locale.dialects[code];
  return d ? msgOf(d.label) : code;
}
