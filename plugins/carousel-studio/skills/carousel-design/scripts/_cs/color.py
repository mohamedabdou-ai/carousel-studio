"""Colour maths (CONTRACT 9.4). Twin of ``src/lib/color.js``: same constants, same rounding, so both print the same hex.

sRGB hex <-> OKLCH, WCAG contrast, linear-light mixing, and ``ensure_contrast``, which moves a foreground along OKLCH lightness
only (hue kept, chroma lowered only to stay inside the sRGB gamut). Colours are opaque ``#RRGGBB`` strings; results are upper-case.
"""
from __future__ import annotations

import math
import re

from . import CSError

_HEX6 = re.compile(r"^#?([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$")
_HEX3 = re.compile(r"^#?([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$")
_EPS = 0.0005
_STEP = 0.005


def parse(hex_color: str) -> tuple[int, int, int]:
    s = str(hex_color).strip()
    m = _HEX6.match(s)
    if m:
        return int(m.group(1), 16), int(m.group(2), 16), int(m.group(3), 16)
    m = _HEX3.match(s)
    if m:
        return int(m.group(1) * 2, 16), int(m.group(2) * 2, 16), int(m.group(3) * 2, 16)
    raise CSError("E_USAGE", f"not a hex colour: {hex_color}")


def _byte(v: float) -> int:
    return max(0, min(255, int(math.floor(v + 0.5))))


def to_hex(rgb) -> str:
    return "#%02X%02X%02X" % (_byte(rgb[0]), _byte(rgb[1]), _byte(rgb[2]))


def _to_linear(c: float) -> float:
    v = c / 255
    return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4


def _from_linear(v: float) -> float:
    c = 12.92 * v if v <= 0.0031308 else 1.055 * (v ** (1 / 2.4)) - 0.055
    return c * 255


def luminance(hex_color: str) -> float:
    r, g, b = parse(hex_color)
    return 0.2126 * _to_linear(r) + 0.7152 * _to_linear(g) + 0.0722 * _to_linear(b)


def contrast(fg: str, bg: str) -> float:
    a, b = luminance(fg), luminance(bg)
    return (max(a, b) + 0.05) / (min(a, b) + 0.05)


def _to_oklab(hex_color: str):
    r, g, b = (_to_linear(c) for c in parse(hex_color))
    l_ = math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
    m_ = math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
    s_ = math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
    return (
        0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
        1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
        0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_,
    )


def _oklab_to_linear(L: float, a: float, b: float):
    l_ = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
    m_ = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
    s_ = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3
    return (
        4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
        -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
        -0.0041960863 * l_ - 0.7034186147 * m_ + 1.7076147010 * s_,
    )


def to_oklch(hex_color: str) -> tuple[float, float, float]:
    """``(L 0-1, C 0-0.4, h 0-360)``."""
    L, a, b = _to_oklab(hex_color)
    h = math.degrees(math.atan2(b, a))
    if h < 0:
        h += 360
    chroma = math.sqrt(a * a + b * b)
    return L, chroma, (0.0 if chroma < 1e-9 else h)


def _in_gamut(v) -> bool:
    return all(-_EPS <= x <= 1 + _EPS for x in v)


def from_oklch(L: float, C: float, h: float) -> str:
    """Hex of an OKLCH colour, gamut-mapped by reducing chroma."""
    L = max(0.0, min(1.0, L))
    hr = math.radians(h)

    def at(chroma):
        return _oklab_to_linear(L, chroma * math.cos(hr), chroma * math.sin(hr))

    chroma = max(0.0, C)
    lin = at(chroma)
    if not _in_gamut(lin):
        lo, hi = 0.0, chroma
        for _ in range(28):
            mid = (lo + hi) / 2
            if _in_gamut(at(mid)):
                lo = mid
            else:
                hi = mid
        chroma = lo
        lin = at(chroma)
    return to_hex([_from_linear(max(0.0, min(1.0, v))) for v in lin])


def mix(a: str, b: str, t: float) -> str:
    """sRGB linear-light mix; ``t`` = 0 gives ``a``, 1 gives ``b``."""
    x, y = parse(a), parse(b)
    return to_hex([_from_linear(_to_linear(p) * (1 - t) + _to_linear(q) * t) for p, q in zip(x, y)])


def on_color(bg: str) -> str:
    """``#111111`` or ``#FFFFFF``, whichever reads better on ``bg``."""
    return "#111111" if contrast("#111111", bg) >= contrast("#FFFFFF", bg) else "#FFFFFF"


def ensure_contrast(fg: str, bg: str, minimum: float) -> dict:
    """Smallest lightness move (steps of 0.005) that gives ``fg`` a contrast of at least ``minimum`` on ``bg``.

    Direction: away from the background first; the other way when that cannot reach ``minimum``; black or white as the last resort.
    Returns ``{"hex", "changed", "steps"}``.
    """
    if contrast(fg, bg) >= minimum:
        return {"hex": to_hex(parse(fg)), "changed": False, "steps": 0}
    L0, C0, h0 = to_oklch(fg)
    away = -1 if luminance(bg) > 0.18 else 1
    total = 0
    for direction in (away, -away):
        k = 1
        while True:
            L = L0 + direction * _STEP * k
            if L < 0 or L > 1:
                break
            total += 1
            candidate = from_oklch(L, C0, h0)
            if contrast(candidate, bg) >= minimum:
                return {"hex": candidate, "changed": True, "steps": total}
            k += 1
    best = "#000000" if contrast("#000000", bg) >= contrast("#FFFFFF", bg) else "#FFFFFF"
    return {"hex": best, "changed": True, "steps": total}
