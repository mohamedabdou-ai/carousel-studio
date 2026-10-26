/* lib/patch.js · JSON patch, the RFC 6902 subset the Studio needs (CONTRACT 4.3.1 and 8.6).
 *
 * Operations: add, remove, replace, test. Paths are JSON Pointers ("/slides/2/title", "-" appends to an array).
 * apply() returns a NEW document and never touches its input; a failing `test` throws CSError("E_CONFLICT"), and so does a
 * path that no longer exists (the document moved on since the patch was made). Malformed operations are E_USAGE.
 */
(function () {
  const core = (CS.core = CS.core || {});
  const OPS = { add: 1, remove: 1, replace: 1, test: 1 };

  function clone(v) { return v === undefined ? v : JSON.parse(JSON.stringify(v)); }
  function isObject(v) { return v !== null && typeof v === "object" && !Array.isArray(v); }

  function parsePointer(path) {
    if (typeof path !== "string" || (path !== "" && path.charAt(0) !== "/")) throw new CS.CSError("E_USAGE", "bad JSON pointer: " + String(path));
    if (path === "") return [];
    return path.slice(1).split("/").map(function (seg) { return seg.replace(/~1/g, "/").replace(/~0/g, "~"); });
  }

  function escapeSegment(seg) { return String(seg).replace(/~/g, "~0").replace(/\//g, "~1"); }

  function conflict(op, why) { return new CS.CSError("E_CONFLICT", "patch " + op.op + " " + op.path + ": " + why, { op: op }); }

  function arrayIndex(seg, length, allowEnd, op) {
    if (seg === "-" && allowEnd) return length;
    if (!/^(0|[1-9][0-9]*)$/.test(seg)) throw conflict(op, "not an array index");
    const i = Number(seg);
    if (i > length || (!allowEnd && i === length)) throw conflict(op, "index out of range");
    return i;
  }

  function resolveParent(doc, segs, op) {
    let node = doc;
    for (let i = 0; i < segs.length - 1; i++) {
      const seg = segs[i];
      if (Array.isArray(node)) node = node[arrayIndex(seg, node.length, false, op)];
      else if (isObject(node) && Object.prototype.hasOwnProperty.call(node, seg)) node = node[seg];
      else throw conflict(op, "path does not exist");
      if (node === undefined) throw conflict(op, "path does not exist");
    }
    return node;
  }

  function sameValue(a, b) { return core.canon ? core.canon.canonicalJSON(a) === core.canon.canonicalJSON(b) : JSON.stringify(a) === JSON.stringify(b); }

  function applyOne(doc, op) {
    if (!isObject(op) || !OPS[op.op]) throw new CS.CSError("E_USAGE", "unsupported patch operation", { op: op });
    const segs = parsePointer(op.path);
    if (segs.length === 0) {
      if (op.op === "test") { if (!sameValue(doc, op.value)) throw conflict(op, "value differs"); return doc; }
      if (op.op === "remove") throw new CS.CSError("E_USAGE", "cannot remove the document root");
      return clone(op.value);
    }
    const parent = resolveParent(doc, segs, op);
    const last = segs[segs.length - 1];
    if (Array.isArray(parent)) {
      if (op.op === "add") { parent.splice(arrayIndex(last, parent.length, true, op), 0, clone(op.value)); return doc; }
      const i = arrayIndex(last, parent.length, false, op);
      if (op.op === "remove") parent.splice(i, 1);
      else if (op.op === "replace") parent[i] = clone(op.value);
      else if (!sameValue(parent[i], op.value)) throw conflict(op, "value differs");
      return doc;
    }
    if (!isObject(parent)) throw conflict(op, "path does not exist");
    const has = Object.prototype.hasOwnProperty.call(parent, last);
    if (op.op === "add") parent[last] = clone(op.value);
    else if (!has) { if (op.op === "test" && op.value === undefined) return doc; throw conflict(op, "path does not exist"); }
    else if (op.op === "remove") delete parent[last];
    else if (op.op === "replace") parent[last] = clone(op.value);
    else if (!sameValue(parent[last], op.value)) throw conflict(op, "value differs");
    return doc;
  }

  /** Apply `ops` in order to a copy of `doc`. */
  function apply(doc, ops) {
    if (!Array.isArray(ops)) throw new CS.CSError("E_USAGE", "a patch is an array of operations");
    let out = clone(doc);
    ops.forEach(function (op) { out = applyOne(out, op); });
    return out;
  }

  function sortedKeys(o) { return Object.keys(o).sort(); }

  function diffInto(a, b, path, out) {
    if (sameValue(a, b)) return;
    if (Array.isArray(a) && Array.isArray(b)) {
      const n = Math.min(a.length, b.length);
      for (let i = 0; i < n; i++) diffInto(a[i], b[i], path + "/" + i, out);
      for (let i = n; i < b.length; i++) out.push({ op: "add", path: path + "/" + i, value: clone(b[i]) });
      for (let i = a.length - 1; i >= b.length; i--) out.push({ op: "remove", path: path + "/" + i });
      return;
    }
    if (isObject(a) && isObject(b)) {
      sortedKeys(a).forEach(function (k) {
        if (!Object.prototype.hasOwnProperty.call(b, k) || b[k] === undefined) out.push({ op: "remove", path: path + "/" + escapeSegment(k) });
      });
      sortedKeys(b).forEach(function (k) {
        if (b[k] === undefined) return;
        const p = path + "/" + escapeSegment(k);
        if (!Object.prototype.hasOwnProperty.call(a, k)) out.push({ op: "add", path: p, value: clone(b[k]) });
        else diffInto(a[k], b[k], p, out);
      });
      return;
    }
    out.push({ op: "replace", path: path, value: clone(b) });
  }

  /** Operations that turn `a` into `b`. Arrays are compared by index, objects by key. */
  function diff(a, b) {
    const out = [];
    diffInto(a, b, "", out);
    return out;
  }

  /** The text a user pastes in chat: the patch plus a `test` on /rev so a stale patch is refused instead of merged blindly. */
  function envelope(spec, ops) {
    const baseRev = spec && typeof spec.rev === "number" ? spec.rev : 0;
    return {
      carouselStudioPatch: 1,
      specId: spec && spec.id,
      baseRev: baseRev,
      patch: [{ op: "test", path: "/rev", value: baseRev }].concat(ops || [])
    };
  }

  core.patch = { apply: apply, diff: diff, envelope: envelope };
})();
