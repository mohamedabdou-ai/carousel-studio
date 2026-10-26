/* tests/mobile-e2e/mock-claude.js
 * The capabilities a published Studio page would get from Claude (window.claude.use(name)), mocked for browser tests. Injected with
 * context.addInitScript when the smoke test runs on the real engine chunks; the stub engine carries the same block itself.
 * Query flags: mock=noPublish,viewer,noDownloads,noSample,noAssets,noClaude,declineSave,conflict,identity. Calls are logged in window.__mockLog;
 * the last published document is window.__lastPublished, the data of every saved file is in window.__saved[filename].
 */
(function () {
  var flags = (/mock=([a-zA-Z,]+)/.exec(location.search) || [, ""])[1].split(",");
  var has = function (f) { return flags.indexOf(f) >= 0; };
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  window.__mockLog = [];
  /* mock=identity: a viewer who has a name, an e-mail and an id. Every read of the namespace is logged, so tests/privacy can prove the page
   * asks only the three yes/no questions and that none of the identity reaches a spec, a kit or a published page. */
  function identityUser() {
    var who = window.__viewer = { name: "Privacy Tester", email: "privacy.tester@example.test", id: "user-7f3a9c2e41" };
    var base = { isOwner: function () { return Promise.resolve(true); }, canEdit: function () { return Promise.resolve(true); }, can: function () { return Promise.resolve(null); },
      name: who.name, displayName: who.name, email: who.email, id: who.id, info: function () { return Promise.resolve(who); }, profile: function () { return Promise.resolve(who); } };
    return new Proxy(base, { get: function (target, prop) { if (typeof prop === "string") window.__mockLog.push({ cap: "user." + prop }); return target[prop]; } });
  }
  var mocks = {
    downloads: has("noDownloads") ? null : { save: function (r) { (window.__saved = window.__saved || {})[r.filename] = r.data; window.__mockLog.push({ cap: "downloads.save", filename: r.filename, size: r.data && (r.data.length || r.data.size) }); return has("declineSave") ? Promise.reject({ code: "declined", message: "no" }) : Promise.resolve({ status: "saved" }); } },
    artifact: has("noPublish") ? null : { publish: function (html) { window.__mockLog.push({ cap: "artifact.publish", bytes: html.length, head: html.slice(0, 330) }); window.__lastPublished = html; return has("conflict") ? Promise.reject({ code: "conflict", message: "newer version" }) : Promise.resolve({ version: "v2" }); } },
    sample: has("noSample") ? null : Object.assign(function () { return Promise.resolve({ text: "", truncated: false }); }, {
      json: function (prompt) {
        window.__mockLog.push({ cap: "sample.json", prompt: prompt.slice(0, 200) });
        var keys = ((/<slide>: ([a-zA-Z, ]+)\./.exec(prompt) || [, "title"])[1]).split(/, */);
        return sleep(900).then(function () {
          return [1, 2, 3].map(function (n) {
            var o = {};
            keys.forEach(function (k) { o[k] = k === "bullets" ? ["نقطة بديلة " + n, "نقطة ثانية " + n] : k === "sides" ? [{ label: "أ", text: "جانب أول " + n }, { label: "ب", text: "جانب ثان " + n }] : k === "cta" ? { text: "احفظ الآن " + n } : "صياغة بديلة رقم " + n; });
            return o;
          });
        });
      },
      limits: function () { return Promise.resolve({ maxPromptBytes: 262144 }); }
    }),
    user: has("identity") ? identityUser() : { isOwner: function () { return Promise.resolve(!has("viewer")); }, canEdit: function () { return Promise.resolve(!has("viewer")); }, can: function () { return Promise.resolve(null); } },
    assets: has("noAssets") ? null : { upload: function (blob) { return Promise.resolve({ id: "0123456789abcdef0123456789abcdef", url: URL.createObjectURL(blob), sizeBytes: blob.size, contentType: blob.type }); } }
  };
  window.claude = { use: function (name) { return Promise.resolve(Object.prototype.hasOwnProperty.call(mocks, name) ? mocks[name] : null); } };
  if (has("noClaude")) delete window.claude;
})();
