"""Canonical JSON and hashes (CONTRACT 3.2). Twin of ``src/lib/canon.js``: both print the same bytes for the same document.

``canonical_json``  sorted keys, no whitespace, NFC strings escaped minimally, shortest round-trip numbers.
``fnv1a64``         FNV-1a 64-bit over the UTF-8 bytes, 16 lowercase hex digits.
``hash16``          ``fnv1a64(canonical_json(obj))``. Hashes detect change; they are not security features.
"""
from __future__ import annotations

import copy
import math
import unicodedata
from decimal import Decimal

from . import CSError

_FNV_OFFSET = 0xCBF29CE484222325
_FNV_PRIME = 0x100000001B3
_MASK = 0xFFFFFFFFFFFFFFFF
_SHORT = {8: "\\b", 9: "\\t", 10: "\\n", 12: "\\f", 13: "\\r"}


def _string(value: str) -> str:
    out = ['"']
    for ch in unicodedata.normalize("NFC", value):
        code = ord(ch)
        if ch == '"':
            out.append('\\"')
        elif ch == "\\":
            out.append("\\\\")
        elif code < 0x20:
            out.append(_SHORT.get(code) or "\\u%04x" % code)
        else:
            out.append(ch)
    out.append('"')
    return "".join(out)


def _number(value) -> str:
    if isinstance(value, int):
        if abs(value) >= 10 ** 21:
            raise CSError("E_SCHEMA", f"canonical_json: magnitude out of range ({value})")
        return str(value)
    if not math.isfinite(value):
        raise CSError("E_SCHEMA", f"canonical_json: {value} is not representable")
    if value == 0:
        return "0"
    magnitude = abs(value)
    if magnitude >= 1e21 or magnitude < 1e-6:
        raise CSError("E_SCHEMA", f"canonical_json: magnitude out of range ({value})")
    # repr() gives the shortest round-trip digits; JavaScript prints them without an exponent in [1e-6, 1e21).
    text = format(Decimal(repr(value)), "f")
    if "." in text:
        text = text.rstrip("0").rstrip(".")
    return text


def _sort_key(key: str):
    return [ord(c) for c in key]


def canonical_json(obj) -> str:
    """The canonical text of a JSON value (CONTRACT 3.2)."""
    if obj is None:
        return "null"
    if obj is True:
        return "true"
    if obj is False:
        return "false"
    if isinstance(obj, (int, float)):
        return _number(obj)
    if isinstance(obj, str):
        return _string(obj)
    if isinstance(obj, (list, tuple)):
        return "[" + ",".join(canonical_json(x) for x in obj) + "]"
    if isinstance(obj, dict):
        parts = []
        for key in sorted(obj, key=_sort_key):
            parts.append(_string(str(key)) + ":" + canonical_json(obj[key]))
        return "{" + ",".join(parts) + "}"
    raise CSError("E_SCHEMA", f"canonical_json: unsupported value of type {type(obj).__name__}")


def fnv1a64(text: str) -> str:
    """FNV-1a 64-bit of the UTF-8 bytes of ``text`` as 16 lowercase hex digits."""
    h = _FNV_OFFSET
    for byte in text.encode("utf-8"):
        h ^= byte
        h = (h * _FNV_PRIME) & _MASK
    return "%016x" % h


def hash16(obj) -> str:
    return fnv1a64(canonical_json(obj))


def brand_snapshot(brand: dict) -> dict:
    """The brand without ``updatedAt createdAt ext onboarding creativeMemory hooks.history visual.logo.dataUri`` (a copy)."""
    snap = copy.deepcopy(brand)
    for key in ("updatedAt", "createdAt", "ext", "onboarding", "creativeMemory"):
        snap.pop(key, None)
    hooks = snap.get("hooks")
    if isinstance(hooks, dict):
        hooks.pop("history", None)
    visual = snap.get("visual")
    logo = visual.get("logo") if isinstance(visual, dict) else None
    if isinstance(logo, dict):
        logo.pop("dataUri", None)
    return snap


def hashable(tokens: dict) -> dict:
    """Resolved tokens without ``provenance adjustments css hash`` (CONTRACT 3.2.1)."""
    return {k: v for k, v in tokens.items() if k not in ("provenance", "adjustments", "css", "hash")}
