/* ui/caps.js · artifact runtime capabilities (downloads, assets, sample, user, page self-publishing).
 * Names verified against runtime contract 0.2.88: the page self-publish namespace is "artifact"
 * (its former spelling "self" still resolves). Change a name here and nowhere else (CONTRACT 4.8). */

var CAPABILITY_NAMES = { downloads: "downloads", assets: "assets", sample: "sample", user: "user", publish: "artifact" };
var capCache = {};

/** Resolve a capability namespace or null. Never rejects; may take up to 10 s outside a viewer, so callers must not block first paint on it. */
function useCap(key) {
  if (capCache[key]) return capCache[key];
  var p;
  try {
    p = window.claude && typeof window.claude.use === "function"
      ? Promise.resolve(window.claude.use(CAPABILITY_NAMES[key])).then(function (ns) { return ns || null; }, function () { return null; })
      : Promise.resolve(null);
  } catch (e) { p = Promise.resolve(null); }
  capCache[key] = p;
  return p;
}

/** Which capabilities this view can run. Cached; resolves quickly in a viewer and after 10 s elsewhere. */
function capabilities() {
  return Promise.all([useCap("downloads"), useCap("assets"), useCap("sample"), useCap("user"), useCap("publish")]).then(function (r) {
    return { downloads: !!r[0], assets: !!r[1], sample: !!r[2], user: !!r[3], publish: !!r[4] };
  });
}

/** True when the viewer owns the artifact (regenerate chips are owner-only because sample bills the viewer). */
async function isOwner() {
  var u = await useCap("user");
  if (!u || typeof u.isOwner !== "function") return false;
  try { return !!(await u.isOwner()); } catch (e) { return false; }
}

/** True when the viewer may publish new versions of this page (null from the host counts as "try and see"). */
async function canPublish() {
  var a = await useCap("publish");
  if (!a || typeof a.publish !== "function") return false;
  var u = await useCap("user");
  if (u && typeof u.canEdit === "function") {
    try { return !!(await u.canEdit()); } catch (e) { return true; }
  }
  return true;
}
