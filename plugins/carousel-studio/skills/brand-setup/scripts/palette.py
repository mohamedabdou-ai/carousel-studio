#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""palette.py - build accessible OKLCH role palettes from one colour.

    palette.py --seed "#RRGGBB" [--mood bold|calm|warm|cool|earthy|playful|luxury]
               [--bg light|dark|auto] [--count 1-3] [--format text|json]

Each palette is {name, label, mode, seed, roles:{bg, surface, ink, inkMuted, accent, accent2},
contrast:{inkOnBg, inkOnSurface, inkMutedOnBg, inkMutedOnSurface, onAccent, onAccentColor,
accentOnBg, accent2OnBg}, notes}.

* The seed is the brand colour: it is kept exactly as `accent` whenever text on it (white or
  the dark ink) reaches 4.5:1. If it does not, only its lightness moves; the hue stays.
* Every text pair (ink and inkMuted on bg and surface, onAccent on accent) reaches WCAG 4.5:1.
* accent2 reaches 3:1 against the background so it can carry large text and decoration.
* A light brand colour (yellow, for example) stays the accent and is flagged
  "accent-fill-only" in `notes` when it is too light to be used as text colour.
* The roles map one-to-one onto brand.visual.palette and the preset roles.

Nothing here touches the network.

Exit codes: 0 ok, 2 a palette could not reach the contrast floor, 64 usage.
"""

import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _cs import color, paths  # noqa: E402

paths.ensure_utf8_stdio()

TEXT_MIN = 4.5
ACCENT_MIN = 3.0
WHITE = "#FFFFFF"

# neutral_hue None = follow the seed hue; acc_c scales the seed chroma; a2 = accent2 rule
MOODS = {
    "bold": {"ar": "جريء", "neutral_hue": None, "neutral_c": 0.006, "acc_c": 1.25, "acc_min_c": 0.14, "a2": ("analogous", 35)},
    "calm": {"ar": "هادئ", "neutral_hue": None, "neutral_c": 0.014, "acc_c": 0.65, "acc_min_c": 0.05, "a2": ("analogous", -25)},
    "warm": {"ar": "دافئ", "neutral_hue": 75, "neutral_c": 0.016, "acc_c": 1.0, "acc_min_c": 0.10, "a2": ("analogous", 40)},
    "cool": {"ar": "بارد", "neutral_hue": 250, "neutral_c": 0.012, "acc_c": 1.0, "acc_min_c": 0.09, "a2": ("analogous", -40)},
    "earthy": {"ar": "ترابي", "neutral_hue": 80, "neutral_c": 0.018, "acc_c": 0.6, "acc_min_c": 0.06, "a2": ("analogous", 30)},
    "playful": {"ar": "مرح", "neutral_hue": None, "neutral_c": 0.010, "acc_c": 1.3, "acc_min_c": 0.16, "a2": ("triadic", 120)},
    "luxury": {"ar": "فاخر", "neutral_hue": None, "neutral_c": 0.020, "acc_c": 0.8, "acc_min_c": 0.07, "a2": ("gold", 85)},
}
VARIANTS = (
    ("tinted", "ملوّن بلمسة", "Tinted"),
    ("paper", "ورقي", "Paper"),
    ("mono", "تباين عالٍ", "High contrast"),
)
MODE_LABEL = {"light": ("فاتح", "light"), "dark": ("داكن", "dark")}


class Parser(argparse.ArgumentParser):
    def error(self, message):
        sys.stderr.write("cs-error: E_USAGE: %s\n" % message)
        raise SystemExit(64)


def clamp(v, lo, hi):
    return max(lo, min(hi, v))


def oklch_hex(L, C, h):
    """OKLCH -> in-gamut hex; chroma is reduced (hue and lightness kept) until the round trip is stable."""
    L = clamp(L, 0.0, 1.0)
    hx = color.from_oklch(L, C, h)
    for _ in range(40):
        _l, c2, _h = color.to_oklch(hx)
        if C - c2 < 0.003 or C < 0.002:
            break
        C *= 0.95
        hx = color.from_oklch(L, C, h)
    return hx


def normalize_seed(raw):
    s = raw.strip().lstrip("#")
    if re.fullmatch(r"[0-9A-Fa-f]{3}", s):
        s = "".join(c * 2 for c in s)
    if not re.fullmatch(r"[0-9A-Fa-f]{6}", s):
        raise ValueError("--seed must be a hex colour such as #E3262B")
    return "#" + s.upper()


def pick_mood(L, C, h):
    if C >= 0.18:
        return "bold"
    if C < 0.04:
        return "calm"
    if 20 <= h <= 110:
        return "warm"
    if 180 <= h <= 290:
        return "cool"
    return "bold"


def tune_fill(h, c, start_l, bg, dark_on):
    """Find a fill: text on it >= 4.5 and the fill >= 3 against the background; minimal lightness move.

    The text on the fill is white or `dark_on` (the ink in light mode, the background in dark mode).
    """
    best = None
    for on in (WHITE, dark_on):
        step = -0.01 if on == WHITE else 0.01
        L = start_l
        for _ in range(110):
            fill = oklch_hex(L, c, h)
            if color.contrast(on, fill) >= TEXT_MIN and color.contrast(fill, bg) >= ACCENT_MIN:
                shift = abs(L - start_l)
                if best is None or shift < best[0]:
                    best = (shift, fill, on)
                break
            L += step
            if not 0.0 < L < 1.0:
                break
    if best is None:
        raise RuntimeError("no accent reaches the contrast floor for hue %.0f" % h)
    return best[1], best[2]


def keep_or_tune(seed, L0, C0, h0, bg, dark_on):
    """Use the seed itself whenever text on it reaches 4.5:1; otherwise move only its lightness."""
    ok = [(color.contrast(on, seed), on) for on in (WHITE, dark_on) if color.contrast(on, seed) >= TEXT_MIN]
    if ok:
        return seed, max(ok)[1]
    return tune_fill(h0, C0, L0, bg, dark_on)


def build(seed, mood_name, mode, index):
    mood = MOODS[mood_name]
    L0, C0, h0 = color.to_oklch(seed)
    variant, v_ar, v_en = VARIANTS[index]
    n_hue = mood["neutral_hue"] if mood["neutral_hue"] is not None else h0
    n_c = mood["neutral_c"]
    if variant == "paper":
        n_hue, n_c = 90, max(n_c, 0.014)
    elif variant == "mono":
        n_c = 0.003

    if mode == "light":
        bg_l = {"tinted": 0.962, "paper": 0.968, "mono": 0.985}[variant]
        surf_l = {"tinted": 0.992, "paper": 0.930, "mono": 0.950}[variant]
        ink_l = {"tinted": 0.20, "paper": 0.22, "mono": 0.12}[variant]
        muted_l = 0.46 if variant != "mono" else 0.40
    else:
        bg_l = {"tinted": 0.175, "paper": 0.16, "mono": 0.13}[variant]
        surf_l = bg_l + {"tinted": 0.05, "paper": 0.06, "mono": 0.05}[variant]
        ink_l = {"tinted": 0.955, "paper": 0.94, "mono": 0.98}[variant]
        muted_l = 0.74
        if variant == "paper":
            n_hue = 260

    chroma_floor = 0.0 if mode == "light" else 0.012
    bg = oklch_hex(bg_l, max(n_c, chroma_floor), n_hue)
    surface = oklch_hex(surf_l, max(n_c * (0.5 if mode == "light" else 1.0), chroma_floor), n_hue)
    ink = oklch_hex(ink_l, max(n_c * 1.3, 0.008), n_hue)
    muted = oklch_hex(muted_l, max(n_c, 0.008), n_hue)
    # text pairs: only the lightness moves, the hue stays
    ink = color.ensure_contrast(ink, bg, TEXT_MIN)["hex"]
    ink = color.ensure_contrast(ink, surface, TEXT_MIN)["hex"]
    muted = color.ensure_contrast(muted, bg, TEXT_MIN)["hex"]
    muted = color.ensure_contrast(muted, surface, TEXT_MIN)["hex"]

    dark_on = ink if mode == "light" else bg
    neutral_seed = C0 < 0.02
    # the brand colour is kept exactly when it already works; otherwise only its lightness moves
    accent, on_accent = keep_or_tune(seed, L0, C0, h0, bg, dark_on)
    acc_c = C0 if neutral_seed else clamp(C0 * mood["acc_c"], mood["acc_min_c"], 0.30)

    # accent2: the mood's own rule for the first palette, a calm complement for the second,
    # a deeper shade of the accent for the high-contrast one
    rule, amount = mood["a2"]
    l2 = color.to_oklch(accent)[0]
    if neutral_seed:
        h2, c2 = h0, acc_c
    elif variant == "paper":
        h2, c2 = (h0 + 180) % 360, acc_c * 0.6
    elif variant == "mono":
        h2, c2 = h0, acc_c * 0.9
        l2 = l2 - 0.16 if mode == "light" else l2 + 0.14
    elif rule == "gold":
        h2, c2 = 85, 0.11
        l2 = 0.78 if mode == "dark" else 0.60
    elif rule == "triadic":
        h2, c2 = (h0 + amount) % 360, acc_c * 0.9
    else:
        h2, c2 = (h0 + amount) % 360, acc_c * 0.85
    accent2, _on2 = tune_fill(h2, c2, l2, bg, dark_on)

    contrast = {
        "inkOnBg": round(color.contrast(ink, bg), 2),
        "inkOnSurface": round(color.contrast(ink, surface), 2),
        "inkMutedOnBg": round(color.contrast(muted, bg), 2),
        "inkMutedOnSurface": round(color.contrast(muted, surface), 2),
        "onAccent": round(color.contrast(on_accent, accent), 2),
        "onAccentColor": on_accent,
        "accentOnBg": round(color.contrast(accent, bg), 2),
        "accent2OnBg": round(color.contrast(accent2, bg), 2),
    }
    floor_pairs = ("inkOnBg", "inkOnSurface", "inkMutedOnBg", "inkMutedOnSurface", "onAccent")
    if any(contrast[k] < TEXT_MIN - 1e-9 for k in floor_pairs):
        raise RuntimeError("palette %s-%s missed the 4.5:1 floor: %s" % (mood_name, variant, contrast))
    mood_ar, mood_en = mood["ar"], mood_name.capitalize()
    notes = []
    if contrast["accentOnBg"] < ACCENT_MIN:
        notes.append({"code": "accent-fill-only",
                      "ar": "لون الأكسنت فاتح على هذه الخلفية: استعمله تعبئة أو خلفية للكلمة، لا لونَ نص.",
                      "en": "The accent is light on this background: use it as a fill behind text, not as text colour."})
    return {
        "name": "%s-%s" % (mood_name, variant),
        "label": {"ar": "%s · %s" % (mood_ar, v_ar), "en": "%s · %s" % (mood_en, v_en)},
        "mode": mode,
        "seed": seed,
        "roles": {"bg": bg, "surface": surface, "ink": ink, "inkMuted": muted, "accent": accent, "accent2": accent2},
        "contrast": contrast,
        "notes": notes,
    }


def render_text(palettes):
    lines = []
    for p in palettes:
        r, c = p["roles"], p["contrast"]
        lines.append("%s (%s)  %s" % (p["name"], MODE_LABEL[p["mode"]][1], p["label"]["ar"]))
        lines.append("  bg %s  surface %s  ink %s  inkMuted %s  accent %s  accent2 %s"
                     % (r["bg"], r["surface"], r["ink"], r["inkMuted"], r["accent"], r["accent2"]))
        lines.append("  ink/bg %s  muted/bg %s  onAccent %s (%s)  accent/bg %s"
                     % (c["inkOnBg"], c["inkMutedOnBg"], c["onAccent"], c["onAccentColor"], c["accentOnBg"]))
    return "\n".join(lines)


def main(argv=None):
    ap = Parser(prog="palette.py", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--seed", required=True, help="brand colour, #RRGGBB")
    ap.add_argument("--mood", choices=sorted(MOODS), help="default: chosen from the seed's hue and chroma")
    ap.add_argument("--bg", choices=("light", "dark", "auto"), default="auto")
    ap.add_argument("--count", type=int, choices=(1, 2, 3), default=3)
    ap.add_argument("--format", choices=("text", "json"), default="text")
    args = ap.parse_args(argv)
    try:
        seed = normalize_seed(args.seed)
    except ValueError as exc:
        sys.stderr.write("cs-error: E_USAGE: %s\n" % exc)
        return 64
    L0, C0, h0 = color.to_oklch(seed)
    mood = args.mood or pick_mood(L0, C0, h0)
    mode = args.bg if args.bg != "auto" else ("dark" if mood == "luxury" else "light")
    try:
        palettes = [build(seed, mood, mode, i) for i in range(args.count)]
    except RuntimeError as exc:
        sys.stderr.write("cs-error: E_SCHEMA: %s\n" % exc)
        return 2
    if args.format == "json":
        print(json.dumps(palettes, ensure_ascii=False))
    else:
        print(render_text(palettes))
    return 0


if __name__ == "__main__":
    sys.exit(main())
