/* lib/schema.js · the JSON Schema subset both engines implement (CONTRACT 3.1).
 *
 * Keywords: type enum const properties required additionalProperties minProperties items minItems maxItems uniqueItems
 * minLength maxLength pattern minimum maximum oneOf anyOf allOf $ref ($defs, local references only).
 * `format` is an annotation and is never enforced. Lengths count Unicode code points. `integer` accepts 3 and 3.0, never true.
 * Errors are { path: JSON Pointer, keyword, message }, sorted by path then keyword; `required` reports the missing
 * property's own path; a oneOf failure is one error at the oneOf path. The Python twin is scripts/_cs/schema.py.
 */
(function () {
  const core = (CS.core = CS.core || {});

  const SCHEMAS = Object.create(null);
  const KINDS = ["brand", "spec", "preset", "occasion", "hook", "plan", "qa-report"];
  const KEYWORDS = {
    type: 1, enum: 1, const: 1, properties: 1, required: 1, additionalProperties: 1, minProperties: 1, items: 1, minItems: 1, maxItems: 1,
    uniqueItems: 1, minLength: 1, maxLength: 1, pattern: 1, minimum: 1, maximum: 1, oneOf: 1, anyOf: 1, allOf: 1, $ref: 1, $defs: 1,
    format: 1, title: 1, description: 1, examples: 1, default: 1, $comment: 1, $schema: 1, $id: 1
  };
  const REGEX_CACHE = Object.create(null);

  function codePoints(s) {
    let n = 0;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length && (s.charCodeAt(i + 1) & 0xfc00) === 0xdc00) i++;
      n++;
    }
    return n;
  }
  function isObject(v) { return v !== null && typeof v === "object" && !Array.isArray(v); }
  function same(a, b) { return core.canon.canonicalJSON(a) === core.canon.canonicalJSON(b); }
  function show(v) { const s = core.canon.canonicalJSON(v); return s.length > 60 ? s.slice(0, 57) + "..." : s; }

  function regexFor(pattern) {
    let re = REGEX_CACHE[pattern];
    if (!re) {
      try { re = new RegExp(pattern, "u"); } catch (e) { re = new RegExp(pattern); } /* "\-" outside a class is legal in the portable subset only without the u flag */
      REGEX_CACHE[pattern] = re;
    }
    return re;
  }

  function typeMatches(type, v) {
    switch (type) {
      case "null": return v === null;
      case "boolean": return typeof v === "boolean";
      case "string": return typeof v === "string";
      case "array": return Array.isArray(v);
      case "object": return isObject(v);
      case "number": return typeof v === "number" && isFinite(v);
      case "integer": return typeof v === "number" && isFinite(v) && Math.floor(v) === v;
      default: return false;
    }
  }

  function resolveRef(ref, root) {
    const m = /^#\/\$defs\/([A-Za-z0-9_.-]+)$/.exec(ref);
    const target = m && root && root.$defs ? root.$defs[m[1]] : undefined;
    if (!target) throw new CS.CSError("E_SCHEMA", "unresolvable $ref " + ref);
    return target;
  }

  function child(path, key) { return path + "/" + String(key).replace(/~/g, "~0").replace(/\//g, "~1"); }

  function check(schema, v, path, root, errs) {
    if (schema === true || schema === undefined) return;
    if (schema === false) { errs.push({ path: path, keyword: "false", message: "is not allowed" }); return; }
    const add = function (keyword, message) { errs.push({ path: path, keyword: keyword, message: message }); };

    if (schema.$ref) check(resolveRef(schema.$ref, root), v, path, root, errs);
    if (schema.allOf) schema.allOf.forEach(function (s) { check(s, v, path, root, errs); });
    if (schema.anyOf) {
      const ok = schema.anyOf.some(function (s) { const e = []; check(s, v, path, root, e); return e.length === 0; });
      if (!ok) add("anyOf", "must match at least one of the allowed alternatives");
    }
    if (schema.oneOf) {
      const n = schema.oneOf.filter(function (s) { const e = []; check(s, v, path, root, e); return e.length === 0; }).length;
      if (n !== 1) add("oneOf", "must match exactly one of the allowed alternatives (matched " + n + ")");
    }
    if (Object.prototype.hasOwnProperty.call(schema, "const") && !same(schema.const, v)) add("const", "must equal " + show(schema.const));
    if (schema.enum && !schema.enum.some(function (x) { return same(x, v); })) {
      add("enum", "must be one of: " + schema.enum.slice(0, 12).map(function (x) { return typeof x === "string" ? x : show(x); }).join(", ") + (schema.enum.length > 12 ? ", ..." : ""));
    }
    if (schema.type !== undefined) {
      const types = Array.isArray(schema.type) ? schema.type : [schema.type];
      if (!types.some(function (t) { return typeMatches(t, v); })) { add("type", "must be of type " + types.join(" or ")); return; }
    }

    if (typeof v === "string") {
      const len = (schema.minLength !== undefined || schema.maxLength !== undefined) ? codePoints(v) : 0;
      if (schema.minLength !== undefined && len < schema.minLength) add("minLength", "must have at least " + schema.minLength + " characters");
      if (schema.maxLength !== undefined && len > schema.maxLength) add("maxLength", "must have at most " + schema.maxLength + " characters");
      if (schema.pattern !== undefined && !regexFor(schema.pattern).test(v)) add("pattern", "does not match the pattern " + schema.pattern);
    } else if (typeof v === "number") {
      if (schema.minimum !== undefined && v < schema.minimum) add("minimum", "must be at least " + schema.minimum);
      if (schema.maximum !== undefined && v > schema.maximum) add("maximum", "must be at most " + schema.maximum);
    } else if (Array.isArray(v)) {
      if (schema.minItems !== undefined && v.length < schema.minItems) add("minItems", "must have at least " + schema.minItems + " items");
      if (schema.maxItems !== undefined && v.length > schema.maxItems) add("maxItems", "must have at most " + schema.maxItems + " items");
      if (schema.uniqueItems) {
        const seen = Object.create(null);
        const dup = v.some(function (x) { const k = core.canon.canonicalJSON(x); if (seen[k]) return true; seen[k] = true; return false; });
        if (dup) add("uniqueItems", "items must be unique");
      }
      if (schema.items) v.forEach(function (x, i) { check(schema.items, x, child(path, i), root, errs); });
    } else if (isObject(v)) {
      const keys = Object.keys(v).filter(function (k) { return v[k] !== undefined; });
      if (schema.required) schema.required.forEach(function (k) { if (keys.indexOf(k) < 0) errs.push({ path: child(path, k), keyword: "required", message: "is required" }); });
      if (schema.minProperties !== undefined && keys.length < schema.minProperties) add("minProperties", "must have at least " + schema.minProperties + " properties");
      keys.forEach(function (k) {
        if (schema.properties && Object.prototype.hasOwnProperty.call(schema.properties, k)) check(schema.properties[k], v[k], child(path, k), root, errs);
        else if (schema.additionalProperties === false) errs.push({ path: child(path, k), keyword: "additionalProperties", message: "is not allowed" });
        else if (isObject(schema.additionalProperties)) check(schema.additionalProperties, v[k], child(path, k), root, errs);
      });
    }
  }

  function sortErrors(errs) {
    return errs.map(function (e, i) { return { e: e, i: i }; }).sort(function (a, b) {
      if (a.e.path !== b.e.path) return a.e.path < b.e.path ? -1 : 1;
      if (a.e.keyword !== b.e.keyword) return a.e.keyword < b.e.keyword ? -1 : 1;
      return a.i - b.i;
    }).map(function (x) { return x.e; });
  }

  /** Validate `value` against a schema object directly (`root` resolves $ref; defaults to the schema itself). */
  function validateAgainst(schema, value, root) {
    const errs = [];
    check(schema, value, "", root || schema, errs);
    const sorted = sortErrors(errs);
    return { ok: sorted.length === 0, errors: sorted };
  }

  function register(kind, schema) {
    if (!isObject(schema)) throw new CS.CSError("E_USAGE", "register(kind, schema): schema must be an object");
    SCHEMAS[kind] = schema;
  }

  function validate(kind, value, opts) {
    const alias = kind === "hook-library" ? { kind: "hook", def: "library" } : null;
    const root = SCHEMAS[alias ? alias.kind : kind];
    if (!root) throw new CS.CSError("E_USAGE", "no schema registered for \"" + kind + "\"");
    const def = (opts && opts.def) || (alias && alias.def) || null;
    const schema = def ? (root.$defs && root.$defs[def]) : root;
    if (!schema) throw new CS.CSError("E_USAGE", "schema \"" + kind + "\" has no definition \"" + def + "\"");
    return validateAgainst(schema, value, root);
  }

  /** Keywords outside the subset (and not annotations) make a schema invalid. Returns the offending "path: keyword" strings. */
  function unsupportedKeywords(schema) {
    const bad = [];
    (function walk(node, path) {
      if (Array.isArray(node)) { node.forEach(function (x, i) { walk(x, path + "/" + i); }); return; }
      if (!isObject(node)) return;
      Object.keys(node).forEach(function (k) {
        if (k === "properties" || k === "$defs") { Object.keys(node[k]).forEach(function (n) { walk(node[k][n], path + "/" + k + "/" + n); }); return; }
        if (k === "enum" || k === "const" || k === "default" || k === "examples" || k === "required") return;
        if (!KEYWORDS[k] && k.slice(0, 2) !== "x-") bad.push(path + ": " + k);
        walk(node[k], path + "/" + k);
      });
    })(schema, "");
    return bad;
  }

  core.schema = { validate: validate, register: register, validateAgainst: validateAgainst, unsupportedKeywords: unsupportedKeywords, KINDS: KINDS };
})();
