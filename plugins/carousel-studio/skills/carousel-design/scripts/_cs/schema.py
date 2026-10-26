"""The JSON Schema subset both engines implement (CONTRACT 3.1). Twin of ``src/lib/schema.js``.

Keywords: type enum const properties required additionalProperties minProperties items minItems maxItems uniqueItems minLength
maxLength pattern minimum maximum oneOf anyOf allOf $ref ($defs, local references only). ``format`` is an annotation and is never
enforced. Lengths count Unicode code points. ``integer`` accepts 3 and 3.0, never True. Errors are
``{"path": JSON Pointer, "keyword", "message"}`` sorted by path then keyword; ``required`` reports the missing property's own path;
a ``oneOf`` failure is a single error at the ``oneOf`` path.
"""
from __future__ import annotations

import math
import re
from functools import lru_cache

from . import CSError
from . import paths
from .canon import canonical_json
from .text import portable_regex

_KEYWORDS = {
    "type", "enum", "const", "properties", "required", "additionalProperties", "minProperties", "items", "minItems", "maxItems",
    "uniqueItems", "minLength", "maxLength", "pattern", "minimum", "maximum", "oneOf", "anyOf", "allOf", "$ref", "$defs",
    "format", "title", "description", "examples", "default", "$comment", "$schema", "$id",
}
_REF = re.compile(r"^#/\$defs/([A-Za-z0-9_.-]+)$")
KINDS = ("brand", "spec", "preset", "occasion", "hook", "plan", "qa-report")


def _is_number(v) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)


def _type_ok(kind: str, v) -> bool:
    if kind == "null":
        return v is None
    if kind == "boolean":
        return isinstance(v, bool)
    if kind == "string":
        return isinstance(v, str)
    if kind == "array":
        return isinstance(v, list)
    if kind == "object":
        return isinstance(v, dict)
    if kind == "number":
        return _is_number(v)
    if kind == "integer":
        return _is_number(v) and (isinstance(v, int) or float(v).is_integer())
    return False


def _show(v) -> str:
    text = canonical_json(v)
    return text if len(text) <= 60 else text[:57] + "..."


def _child(path: str, key) -> str:
    return path + "/" + str(key).replace("~", "~0").replace("/", "~1")


def _resolve(ref: str, root: dict):
    m = _REF.match(ref)
    target = (root.get("$defs") or {}).get(m.group(1)) if m else None
    if target is None:
        raise CSError("E_SCHEMA", f"unresolvable $ref {ref}")
    return target


def _same(a, b) -> bool:
    return canonical_json(a) == canonical_json(b)


def _check(schema, v, path: str, root: dict, errs: list) -> None:
    if schema is True or schema is None:
        return
    if schema is False:
        errs.append({"path": path, "keyword": "false", "message": "is not allowed"})
        return

    def add(keyword: str, message: str) -> None:
        errs.append({"path": path, "keyword": keyword, "message": message})

    if "$ref" in schema:
        _check(_resolve(schema["$ref"], root), v, path, root, errs)
    for sub in schema.get("allOf", ()):
        _check(sub, v, path, root, errs)
    if "anyOf" in schema:
        if not any(not _errors(sub, v, path, root) for sub in schema["anyOf"]):
            add("anyOf", "must match at least one of the allowed alternatives")
    if "oneOf" in schema:
        matched = sum(1 for sub in schema["oneOf"] if not _errors(sub, v, path, root))
        if matched != 1:
            add("oneOf", f"must match exactly one of the allowed alternatives (matched {matched})")
    if "const" in schema and not _same(schema["const"], v):
        add("const", f"must equal {_show(schema['const'])}")
    if "enum" in schema and not any(_same(x, v) for x in schema["enum"]):
        shown = ", ".join(x if isinstance(x, str) else _show(x) for x in schema["enum"][:12])
        add("enum", f"must be one of: {shown}{', ...' if len(schema['enum']) > 12 else ''}")
    if "type" in schema:
        kinds = schema["type"] if isinstance(schema["type"], list) else [schema["type"]]
        if not any(_type_ok(k, v) for k in kinds):
            add("type", "must be of type " + " or ".join(kinds))
            return

    if isinstance(v, str):
        if "minLength" in schema and len(v) < schema["minLength"]:
            add("minLength", f"must have at least {schema['minLength']} characters")
        if "maxLength" in schema and len(v) > schema["maxLength"]:
            add("maxLength", f"must have at most {schema['maxLength']} characters")
        if "pattern" in schema and not portable_regex(schema["pattern"]).search(v):
            add("pattern", f"does not match the pattern {schema['pattern']}")
    elif _is_number(v):
        if "minimum" in schema and v < schema["minimum"]:
            add("minimum", f"must be at least {_num(schema['minimum'])}")
        if "maximum" in schema and v > schema["maximum"]:
            add("maximum", f"must be at most {_num(schema['maximum'])}")
    elif isinstance(v, list):
        if "minItems" in schema and len(v) < schema["minItems"]:
            add("minItems", f"must have at least {schema['minItems']} items")
        if "maxItems" in schema and len(v) > schema["maxItems"]:
            add("maxItems", f"must have at most {schema['maxItems']} items")
        if schema.get("uniqueItems"):
            seen = set()
            for item in v:
                key = canonical_json(item)
                if key in seen:
                    add("uniqueItems", "items must be unique")
                    break
                seen.add(key)
        if "items" in schema:
            for i, item in enumerate(v):
                _check(schema["items"], item, _child(path, i), root, errs)
    elif isinstance(v, dict):
        for key in schema.get("required", ()):
            if key not in v:
                errs.append({"path": _child(path, key), "keyword": "required", "message": "is required"})
        if "minProperties" in schema and len(v) < schema["minProperties"]:
            add("minProperties", f"must have at least {schema['minProperties']} properties")
        props = schema.get("properties") or {}
        extra = schema.get("additionalProperties")
        for key, value in v.items():
            if key in props:
                _check(props[key], value, _child(path, key), root, errs)
            elif extra is False:
                errs.append({"path": _child(path, key), "keyword": "additionalProperties", "message": "is not allowed"})
            elif isinstance(extra, dict):
                _check(extra, value, _child(path, key), root, errs)


def _num(n) -> str:
    return str(int(n)) if float(n).is_integer() else repr(n)


def _errors(schema, v, path, root) -> list:
    errs: list = []
    _check(schema, v, path, root, errs)
    return errs


def validate(instance, schema: dict, *, root: dict | None = None) -> list[dict]:
    """Errors of ``instance`` against ``schema`` (``root`` resolves ``$ref``; defaults to ``schema``), sorted by path then keyword."""
    errs = _errors(schema, instance, "", root or schema)
    errs.sort(key=lambda e: (e["path"], e["keyword"]))
    return errs


@lru_cache(maxsize=None)
def _load(name: str) -> dict:
    return paths.read_json(paths.schema_path(name))


def load_schema(name: str) -> dict:
    """The schema document ``name`` (``spec``, ``brand`` ...) of this skill."""
    return _load(name)


def validate_named(kind: str, instance, *, def_name: str | None = None) -> list[dict]:
    """Validate against ``<kind>.schema.json``; ``hook-library`` is ``hook.schema.json#/$defs/library``."""
    if kind == "hook-library":
        kind, def_name = "hook", def_name or "library"
    root = load_schema(kind)
    if def_name:
        target = (root.get("$defs") or {}).get(def_name)
        if target is None:
            raise CSError("E_USAGE", f"schema '{kind}' has no definition '{def_name}'")
        return validate(instance, target, root=root)
    return validate(instance, root, root=root)


def unsupported_keywords(schema: dict) -> list[str]:
    """Keywords outside the subset that are not annotations (``x-*`` is allowed): a schema containing any is invalid."""
    bad: list[str] = []

    def walk(node, path):
        if isinstance(node, list):
            for i, item in enumerate(node):
                walk(item, f"{path}/{i}")
            return
        if not isinstance(node, dict):
            return
        for key, value in node.items():
            if key in ("properties", "$defs"):
                for name, sub in value.items():
                    walk(sub, f"{path}/{key}/{name}")
                continue
            if key in ("enum", "const", "default", "examples", "required"):
                continue
            if key not in _KEYWORDS and not key.startswith("x-"):
                bad.append(f"{path}: {key}")
            walk(value, f"{path}/{key}")

    walk(schema, "")
    return bad
