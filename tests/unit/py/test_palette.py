"""Tests for brand-setup/scripts/palette.py. Contrast is recomputed here from the WCAG formula,
independently of the module under test."""

import json
import os
import subprocess
import sys
import unittest
from pathlib import Path

import b7_support as support

ROOT = Path(__file__).resolve().parents[3]
SKILLS = Path(os.environ.get("CS_TEST_SKILLS") or ROOT / "plugins" / "carousel-studio" / "skills")
SCRIPT = SKILLS / "brand-setup" / "scripts" / "palette.py"
FALLBACK = SKILLS / "carousel-design" / "scripts"
ENV = {**os.environ, "PYTHONIOENCODING": "utf-8", "PYTHONUTF8": "1",
       "PYTHONPATH": os.pathsep.join(filter(None, [str(FALLBACK), os.environ.get("PYTHONPATH", "")]))}
MOODS = ("bold", "calm", "warm", "cool", "earthy", "playful", "luxury")
SEEDS = ("#E3262B", "#FFD400", "#1F6F5C", "#3B1E8F", "#7A7A7A", "#00B3FF", "#F2F2F2", "#0A0A0A")

HAVE_CS = any((p / "_cs" / "__init__.py").exists() for p in (SCRIPT.parent, FALLBACK))
NEEDS_CS = unittest.skipUnless(HAVE_CS, "the _cs package is not in place yet (run tools/sync_shared.py)")


def lum(hex_):
    def lin(c):
        c /= 255.0
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = (int(hex_[i:i + 2], 16) for i in (1, 3, 5))
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)


def contrast(a, b):
    la, lb = lum(a), lum(b)
    return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)


PALETTE = None


def setUpModule() -> None:
    """Import palette.py in-process (the sweep below would be far too slow as 100+ subprocesses). The search path and the `_cs` copy
    belong to this module only; tearDownModule puts both back for the next one."""
    global PALETTE
    if HAVE_CS:
        support.enter(SCRIPT.parent, FALLBACK)
        PALETTE = support.load_module(SCRIPT, "cs_palette_under_test")


def tearDownModule() -> None:
    support.cleanup()


def build_all(seed, mood, mode, count=3):
    return [PALETTE.build(PALETTE.normalize_seed(seed), mood, mode, i) for i in range(count)]


def run(*args):
    p = subprocess.run([sys.executable, str(SCRIPT), *args], capture_output=True, text=True, encoding="utf-8", env=ENV)
    return p.returncode, p.stdout, p.stderr


def palettes(*args):
    code, out, err = run(*args, "--format", "json")
    assert code == 0, err
    return json.loads(out)


@NEEDS_CS
class PaletteTests(unittest.TestCase):
    def test_every_text_pair_reaches_4_5(self):
        for seed in SEEDS:
            for mood in MOODS:
                for bg in ("light", "dark"):
                    for p in build_all(seed, mood, bg):
                        r = p["roles"]
                        on = p["contrast"]["onAccentColor"]
                        pairs = {"ink/bg": (r["ink"], r["bg"]), "ink/surface": (r["ink"], r["surface"]),
                                 "muted/bg": (r["inkMuted"], r["bg"]), "muted/surface": (r["inkMuted"], r["surface"]),
                                 "onAccent": (on, r["accent"])}
                        for name, (fg, back) in pairs.items():
                            self.assertGreaterEqual(contrast(fg, back) + 1e-9, 4.5,
                                                    "%s %s %s %s %s" % (seed, mood, bg, p["name"], name))
                        self.assertGreaterEqual(contrast(r["accent2"], r["bg"]) + 1e-9, 3.0, (seed, mood, bg, p["name"]))

    def test_reported_contrast_matches_the_formula(self):
        p = palettes("--seed", "#E3262B", "--count", "1")[0]
        r = p["roles"]
        self.assertAlmostEqual(p["contrast"]["inkOnBg"], contrast(r["ink"], r["bg"]), places=1)
        self.assertAlmostEqual(p["contrast"]["inkMutedOnBg"], contrast(r["inkMuted"], r["bg"]), places=1)

    def test_the_brand_colour_is_kept_when_it_already_works(self):
        for seed in ("#E3262B", "#1F6F5C", "#3B1E8F"):
            for p in palettes("--seed", seed):
                self.assertEqual(p["roles"]["accent"], seed)

    def test_light_brand_colour_stays_and_is_flagged_fill_only(self):
        p = palettes("--seed", "#FFD400", "--mood", "bold", "--count", "1")[0]
        self.assertEqual(p["roles"]["accent"], "#FFD400")
        self.assertTrue(any(n["code"] == "accent-fill-only" for n in p["notes"]))
        self.assertGreaterEqual(p["contrast"]["onAccent"], 4.5)

    def test_count_modes_and_names(self):
        self.assertEqual(len(palettes("--seed", "#E3262B")), 3)
        two = palettes("--seed", "#E3262B", "--count", "2")
        self.assertEqual([p["name"].split("-")[1] for p in two], ["tinted", "paper"])
        self.assertEqual(len({p["roles"]["bg"] for p in palettes("--seed", "#E3262B")}), 3)

    def test_luxury_is_dark_by_default_and_others_light(self):
        self.assertEqual(palettes("--seed", "#1F6F5C", "--mood", "luxury", "--count", "1")[0]["mode"], "dark")
        self.assertEqual(palettes("--seed", "#1F6F5C", "--mood", "calm", "--count", "1")[0]["mode"], "light")
        self.assertEqual(palettes("--seed", "#1F6F5C", "--mood", "calm", "--bg", "dark", "--count", "1")[0]["mode"], "dark")

    def test_roles_are_opaque_hex(self):
        for p in palettes("--seed", "#00B3FF"):
            for value in p["roles"].values():
                self.assertRegex(value, r"^#[0-9A-F]{6}$")

    def test_usage_errors(self):
        self.assertEqual(run("--seed", "nope")[0], 64)
        self.assertEqual(run("--seed", "#E3262B", "--mood", "gloomy")[0], 64)
        self.assertEqual(run("--seed", "#E3262B", "--count", "9")[0], 64)
        self.assertEqual(run()[0], 64)

    def test_three_digit_seed_is_accepted(self):
        self.assertEqual(palettes("--seed", "#f00", "--count", "1")[0]["seed"], "#FF0000")


if __name__ == "__main__":
    unittest.main()
