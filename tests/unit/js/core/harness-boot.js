/* tests/unit/js/core/harness-boot.js
 * Loads the library half (the real src/lib build when ?lib=real, the stub otherwise), the engine, the fixtures and the
 * test cases, in that order, and runs them. Query: ?lib=stub|real  ?mode=tests|gallery  ?cases=a,b */
(async function () {
  "use strict";
  var q = new URLSearchParams(location.search);
  function load(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = src; s.async = false; s.onload = resolve; s.onerror = function () { reject(new Error("cannot load " + src)); };
      document.head.appendChild(s);
    });
  }
  try {
    var real = q.get("lib") === "real";
    if (real) { await load("/__build__/cs-core.js"); window.__CST_LIB = "real"; }
    else { await load("/tests/unit/js/core/lib-stub.js"); await load("/__build__/cs-core.js"); window.__CST_LIB = "stub"; }
    await load("/tests/unit/js/core/cst.js");
    await load("/tests/unit/js/core/fixtures.js");
    if (q.get("mode") === "gallery") {
      await FX.setup({ gallery: true, real: q.get("presets") === "real" });
      await FX.gallery(document.getElementById("gallery"), q);
      window.__CST_GALLERY_DONE = true;
      return;
    }
    FX.real = q.get("presets") === "real";
    var cases = (q.get("cases") || (FX.real ? "real,mixed-render" : "registry,resolve,compose,fit,freeze,render,spec,archetypes,visual-compose")).split(",");
    for (var i = 0; i < cases.length; i++) await load("/tests/unit/js/core/cases/" + cases[i] + ".test.js");
    await CST.run();
  } catch (e) {
    window.__CST_DONE = { lib: window.__CST_LIB, results: [{ name: "harness boot", ok: false, error: String(e && e.stack || e), ms: 0 }] };
  }
})();
