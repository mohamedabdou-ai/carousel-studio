"use strict";
/*
 * Loads the cs-qa chunk into a clean vm context together with the stubbed
 * CS.core libraries and returns { CS, ctx, bundle }. `bundleOverrides` swaps
 * parts of the rule bundle (for example a tiny ortho.json) per test file.
 */

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { text, color, loadBundle, DESIGN, REPO } = require("./stub-core.cjs");

const CHUNK = process.env.CS_QA_CHUNK || path.join(DESIGN, "runtime/cs-qa.js");

function load(bundleOverrides, extraGlobals) {
  const bundle = loadBundle(bundleOverrides);
  const sandbox = Object.assign({ console, TextDecoder, TextEncoder, Uint8Array, DataView }, extraGlobals || {});
  sandbox.window = sandbox;
  sandbox.CS = {
    version: "cs-1.2.0",
    emit() {},
    core: { text, color, registry: { rules: () => bundle } }
  };
  const ctx = vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(REPO, "src/lib/text.js"), "utf8"), ctx);
  sandbox.CS.core.text = Object.assign({}, text, { visualFields: sandbox.CS.core.text.visualFields });
  vm.runInContext(fs.readFileSync(CHUNK, "utf8"), ctx, { filename: "cs-qa.js" });
  return { CS: sandbox.CS, ctx, bundle };
}

/** A small valid carousel that passes every text gate. */
function cleanSpec() {
  const slides = [];
  const mk = (n, extra) => slides.push(Object.assign({ id: "s" + String(n).padStart(2, "0"), n }, extra));
  mk(1, { type: "cover", headline: "5\u00A0أدوات ببلاش تغنيك عن ==المصمم==", kicker: "للمبتدئين" });
  mk(2, { type: "rehook", headline: "5 أدوات، والأولى توفر لك وقتًا", bridge: "والتالية أحلى" });
  const names = ["مصمم الشرائح", "كاتب الكابشن", "مدقق الإملاء", "مولد الأفكار", "مرتب الجدول"];
  for (let i = 0; i < 5; i++) {
    mk(3 + i, { type: "item", variant: ["side-number", "ghost-number", "base", "side-number", "base"][i], ord: i + 1, title: names[i], body: "تكتب الفكرة وتطلع لك سلايدات جاهزة.", bridge: "كمّل للي بعده" });
  }
  mk(8, { type: "summary", title: "الخلاصة", bullets: ["أداة التصميم", "أداة الكتابة", "أداة المراجعة"] });
  mk(9, { type: "cta", title: "احفظ البوست", cta: { kind: "save", text: "احفظه للمرة الجاية" } });
  return {
    specVersion: 1,
    id: "post-20261022-clean",
    rev: 1,
    brand: { slug: "demo-brand" },
    format: "carousel",
    mode: "guided",
    checkpoint: "script",
    canvas: { preset: "ig-3x4", w: 1080, h: 1440, safe: [34, 45, 1012, 1350], exports: ["3x4", "4x5"] },
    locale: { dialect: "eg", digits: "western", appLanguage: "ar", swipeCue: "arrow-rtl" },
    intent: "save",
    contentType: "value",
    architecture: "listicle",
    hook: { id: "P1-LIST-clean", family: "P1", cover: "5\u00A0أدوات ببلاش تغنيك عن المصمم" },
    style: { presetId: "swiss@1.0" },
    slides,
    sources: [],
    assets: []
  };
}

const clone = (v) => JSON.parse(JSON.stringify(v));

module.exports = { load, cleanSpec, clone };
