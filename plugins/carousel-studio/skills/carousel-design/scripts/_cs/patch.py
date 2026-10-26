"""JSON patch, the RFC 6902 subset of CONTRACT 4.3.1 / 8.6: ``add remove replace test`` on JSON Pointers. Twin of ``src/lib/patch.js``.

``apply_patch`` returns a NEW document. A failing ``test`` or a path that no longer exists raises ``CSError("E_CONFLICT")`` (the
document moved on since the patch was made); malformed operations raise ``E_USAGE``.
"""
from __future__ import annotations

import copy
import re

from . import CSError
from .canon import canonical_json

_OPS = ("add", "remove", "replace", "test")
_INDEX = re.compile(r"^(0|[1-9][0-9]*)$")


def _pointer(path) -> list[str]:
    if not isinstance(path, str) or (path != "" and not path.startswith("/")):
        raise CSError("E_USAGE", f"bad JSON pointer: {path!r}")
    if path == "":
        return []
    return [seg.replace("~1", "/").replace("~0", "~") for seg in path[1:].split("/")]


def _escape(segment) -> str:
    return str(segment).replace("~", "~0").replace("/", "~1")


def _conflict(op, why) -> CSError:
    return CSError("E_CONFLICT", f"patch {op.get('op')} {op.get('path')}: {why}", {"op": op})


def _index(seg: str, length: int, allow_end: bool, op) -> int:
    if seg == "-" and allow_end:
        return length
    if not _INDEX.match(seg):
        raise _conflict(op, "not an array index")
    i = int(seg)
    if i > length or (not allow_end and i == length):
        raise _conflict(op, "index out of range")
    return i


def _same(a, b) -> bool:
    return canonical_json(a) == canonical_json(b)


def _apply_one(doc, op):
    if not isinstance(op, dict) or op.get("op") not in _OPS:
        raise CSError("E_USAGE", "unsupported patch operation", {"op": op})
    segs = _pointer(op.get("path"))
    if not segs:
        if op["op"] == "test":
            if not _same(doc, op.get("value")):
                raise _conflict(op, "value differs")
            return doc
        if op["op"] == "remove":
            raise CSError("E_USAGE", "cannot remove the document root")
        return copy.deepcopy(op.get("value"))
    parent = doc
    for seg in segs[:-1]:
        if isinstance(parent, list):
            parent = parent[_index(seg, len(parent), False, op)]
        elif isinstance(parent, dict) and seg in parent:
            parent = parent[seg]
        else:
            raise _conflict(op, "path does not exist")
    last = segs[-1]
    value = copy.deepcopy(op.get("value"))
    if isinstance(parent, list):
        if op["op"] == "add":
            parent.insert(_index(last, len(parent), True, op), value)
            return doc
        i = _index(last, len(parent), False, op)
        if op["op"] == "remove":
            del parent[i]
        elif op["op"] == "replace":
            parent[i] = value
        elif not _same(parent[i], op.get("value")):
            raise _conflict(op, "value differs")
        return doc
    if not isinstance(parent, dict):
        raise _conflict(op, "path does not exist")
    if op["op"] == "add":
        parent[last] = value
    elif last not in parent:
        raise _conflict(op, "path does not exist")
    elif op["op"] == "remove":
        del parent[last]
    elif op["op"] == "replace":
        parent[last] = value
    elif not _same(parent[last], op.get("value")):
        raise _conflict(op, "value differs")
    return doc


def apply_patch(doc, ops: list[dict]):
    """Apply ``ops`` in order to a copy of ``doc``."""
    if not isinstance(ops, list):
        raise CSError("E_USAGE", "a patch is a list of operations")
    out = copy.deepcopy(doc)
    for op in ops:
        out = _apply_one(out, op)
    return out


def _diff_into(a, b, path: str, out: list) -> None:
    if _same(a, b):
        return
    if isinstance(a, list) and isinstance(b, list):
        n = min(len(a), len(b))
        for i in range(n):
            _diff_into(a[i], b[i], f"{path}/{i}", out)
        for i in range(n, len(b)):
            out.append({"op": "add", "path": f"{path}/{i}", "value": copy.deepcopy(b[i])})
        for i in range(len(a) - 1, len(b) - 1, -1):
            out.append({"op": "remove", "path": f"{path}/{i}"})
        return
    if isinstance(a, dict) and isinstance(b, dict):
        for key in sorted(a):
            if key not in b:
                out.append({"op": "remove", "path": f"{path}/{_escape(key)}"})
        for key in sorted(b):
            p = f"{path}/{_escape(key)}"
            if key not in a:
                out.append({"op": "add", "path": p, "value": copy.deepcopy(b[key])})
            else:
                _diff_into(a[key], b[key], p, out)
        return
    out.append({"op": "replace", "path": path, "value": copy.deepcopy(b)})


def diff(a, b) -> list[dict]:
    """Operations that turn ``a`` into ``b``; arrays by index, objects by key."""
    out: list[dict] = []
    _diff_into(a, b, "", out)
    return out


def envelope(spec: dict, ops: list[dict]) -> dict:
    """The paste-in-chat wrapper: ``{"carouselStudioPatch":1,"specId","baseRev","patch":[test /rev, ...ops]}``."""
    rev = spec.get("rev")
    rev = rev if isinstance(rev, (int, float)) and not isinstance(rev, bool) else 0
    return {
        "carouselStudioPatch": 1,
        "specId": spec.get("id"),
        "baseRev": rev,
        "patch": [{"op": "test", "path": "/rev", "value": rev}] + list(ops or []),
    }
