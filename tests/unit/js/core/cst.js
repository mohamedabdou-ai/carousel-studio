/* tests/unit/js/core/cst.js · a tiny test runner for the engine tests (runs inside the page; run.mjs reads the results). */
(function () {
  "use strict";
  var tests = [];

  function fmt(v) { try { return typeof v === "string" ? JSON.stringify(v) : JSON.stringify(v); } catch (e) { return String(v); } }

  var CST = (window.CST = {
    test: function (name, fn) { tests.push({ name: name, fn: fn }); },
    assert: function (cond, msg) { if (!cond) throw new Error(msg || "assertion failed"); },
    eq: function (a, b, msg) { if (a !== b) throw new Error((msg || "not equal") + ": got " + fmt(a) + ", expected " + fmt(b)); },
    deepEq: function (a, b, msg) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((msg || "not deep equal") + ": got " + fmt(a) + ", expected " + fmt(b)); },
    near: function (a, b, tol, msg) { if (Math.abs(a - b) > tol) throw new Error((msg || "not near") + ": got " + a + ", expected " + b + " ± " + tol); },
    throwsCode: async function (code, fn, msg) {
      try { await fn(); } catch (e) { if (e && e.code === code) return; throw new Error((msg || "wrong error") + ": got " + (e && (e.code || e.message)) + ", expected " + code); }
      throw new Error((msg || "did not throw") + ": expected " + code);
    },
    run: async function () {
      var results = [];
      for (var i = 0; i < tests.length; i++) {
        var t = tests[i], t0 = performance.now(), r = { name: t.name, ok: true };
        try { await t.fn(); } catch (e) { r.ok = false; r.error = (e && e.stack) ? String(e.message) + "\n" + String(e.stack).split("\n").slice(1, 4).join("\n") : String(e); }
        r.ms = Math.round(performance.now() - t0);
        results.push(r);
      }
      window.__CST_DONE = { lib: window.__CST_LIB, ua: navigator.userAgent, results: results };
      return results;
    }
  });
})();
