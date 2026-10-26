/*
 * CS.export.save · getting the files to the user.
 *
 * Order (mode "auto"): Web Share with files (touch device, inside a user gesture) -> the host's `downloads` capability
 * (a single ZIP when there are more than three files) -> a plain <a download>. A cancelled share or save is not an error.
 */

var downloadsPromise = null;

function downloadsCapability() {
  if (!downloadsPromise) {
    downloadsPromise = (window.claude && typeof window.claude.use === "function")
      ? Promise.resolve().then(function () { return window.claude.use("downloads"); }).catch(function () { return null; })
      : Promise.resolve(null);
  }
  return downloadsPromise;
}

function isTouchDevice() {
  if (CS.util && typeof CS.util.isTouch === "function") return CS.util.isTouch();
  return !!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches);
}

function hasUserActivation() { var ua = navigator.userActivation; return !ua || ua.isActive; }

function mimeBase(mime) { return String(mime).split(";")[0]; }

function asBlob(file) { return new Blob([file.bytes], { type: mimeBase(file.mime) }); }

function shareFiles(list) { return list.map(function (f) { return new File([f.bytes], f.name, { type: mimeBase(f.mime) }); }); }

function canShareFiles(list) {
  try { return !!(navigator.canShare && navigator.share && navigator.canShare({ files: shareFiles(list) })); } catch (e) { return false; }
}

async function saveViaShare(list, result) {
  try {
    await navigator.share({ files: shareFiles(list) });
    list.forEach(function (f) { result.saved.push(f.name); });
    result.mode = "share";
    return true;
  } catch (e) {
    if (e && e.name === "AbortError") { list.forEach(function (f) { result.declined.push(f.name); }); result.mode = "share"; return true; }
    return false;
  }
}

async function saveOneViaDownloads(dl, file, result) {
  try {
    var r = await dl.save({ filename: file.name, data: asBlob(file) });
    if (r && r.status === "declined") result.declined.push(file.name); else result.saved.push(file.name);
  } catch (e) {
    if (e && e.code === "declined") result.declined.push(file.name);
    else if (e && e.code === "extension_not_enabled") throw e;
    else result.failed.push({ name: file.name, error: String(e && e.message || e) });
  }
}

async function saveViaDownloads(dl, list, result, onStatus) {
  result.mode = "downloads";
  var i;
  if (list.length > 3) {
    var zip = exportZip(list, { name: "carousel-kit.zip", root: "carousel-kit" });
    try {
      if (onStatus) onStatus(zip.name);
      await saveOneViaDownloads(dl, zip, result);
      if (result.saved.indexOf(zip.name) >= 0) { result.saved = list.map(function (f) { return f.name; }); }
      return true;
    } catch (e) {
      if (!(e && e.code === "extension_not_enabled")) throw e;      // the host does not allow archives: send the files one by one
    }
  }
  for (i = 0; i < list.length; i++) {
    if (onStatus) onStatus(list[i].name);
    try { await saveOneViaDownloads(dl, list[i], result); }
    catch (e) { result.failed.push({ name: list[i].name, error: String(e && e.message || e) }); }
  }
  return true;
}

function saveViaAnchor(list, result, onStatus) {
  result.mode = "anchor";
  return list.reduce(function (chain, file) {
    return chain.then(function () {
      return new Promise(function (resolve) {
        try {
          var url = URL.createObjectURL(asBlob(file)), a = document.createElement("a");
          a.href = url; a.download = file.name; a.style.display = "none";
          document.body.appendChild(a);
          if (onStatus) onStatus(file.name);
          a.click();
          result.saved.push(file.name);
          setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); resolve(); }, 250);
        } catch (e) { result.failed.push({ name: file.name, error: String(e && e.message || e) }); resolve(); }
      });
    });
  }, Promise.resolve());
}

/** save(files, { mode?: "auto"|"downloads"|"share"|"anchor", onStatus? }) -> SaveResult */
async function saveFiles(files, opts) {
  opts = opts || {};
  var list = Array.isArray(files) ? files : [files], mode = opts.mode || "auto", result = { mode: "downloads", saved: [], declined: [], failed: [] };
  if (!list.length) return result;
  if ((mode === "share" || (mode === "auto" && isTouchDevice() && hasUserActivation())) && canShareFiles(list)) {
    if (await saveViaShare(list, result)) return result;
    if (mode === "share") { list.forEach(function (f) { result.failed.push({ name: f.name, error: "share failed" }); }); return result; }
  } else if (mode === "share") {
    list.forEach(function (f) { result.failed.push({ name: f.name, error: "Web Share with files is not available" }); });
    result.mode = "share";
    return result;
  }
  if (mode === "auto" || mode === "downloads") {
    var dl = await downloadsCapability();
    if (dl && await saveViaDownloads(dl, list, result, opts.onStatus)) return result;
  }
  await saveViaAnchor(list, result, opts.onStatus);
  return result;
}
