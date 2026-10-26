"""Tests for tools/font_coverage.py. Run: python -m unittest discover -s tests/unit/py -p "test_*.py"."""

from __future__ import annotations

import contextlib
import hashlib
import io
import json
import struct
import tempfile
import unittest
from pathlib import Path

import b7_support as support

REPO = Path(__file__).resolve().parents[3]
fc = support.load_tool("font_coverage.py")

DESIGN = REPO / "plugins" / "carousel-studio" / "skills" / "carousel-design"
FONTS = DESIGN / "fonts"


# ---------------------------------------------------------------------------------------------------------------------
# Synthetic fonts: just enough sfnt to exercise the readers
# ---------------------------------------------------------------------------------------------------------------------


def sfnt(tables: dict[bytes, bytes]) -> bytes:
    directory = b""
    body = b""
    start = 12 + 16 * len(tables)
    for tag, data in tables.items():
        directory += struct.pack(">4sIII", tag, 0, start + len(body), len(data))
        body += data + b"\0" * (-len(data) % 4)
    return struct.pack(">4sHHHH", b"\x00\x01\x00\x00", len(tables), 0, 0, 0) + directory + body


def cmap_format4() -> bytes:
    """A-C by delta, U+0627 U+0629 U+062A through glyphIdArray with a .notdef hole at U+0628, then the 0xFFFF sentinel."""
    ends, starts, deltas, offsets = [0x43, 0x62A, 0xFFFF], [0x41, 0x627, 0xFFFF], [-0x40, 0, 1], [0, 4, 0]
    seg_x2 = 6
    body = b"".join(struct.pack(">H", v) for v in ends) + struct.pack(">H", 0)
    body += b"".join(struct.pack(">H", v) for v in starts)
    body += b"".join(struct.pack(">h", v) for v in deltas)
    body += b"".join(struct.pack(">H", v) for v in offsets)
    body += b"".join(struct.pack(">H", v) for v in (5, 0, 7, 8))  # glyphIdArray
    return struct.pack(">HHHHHHH", 4, 14 + len(body), 0, seg_x2, 4, 1, 2) + body


def cmap_format12() -> bytes:
    """A group that starts at .notdef (U+0020-0022) and a supplementary-plane group."""
    groups = struct.pack(">III", 0x20, 0x22, 0) + struct.pack(">III", 0x10000, 0x10002, 3)
    return struct.pack(">HHIII", 12, 0, 16 + len(groups), 0, 2) + groups


def cmap_table(*records: tuple[int, int, bytes]) -> bytes:
    head = struct.pack(">HH", 0, len(records))
    offset = 4 + 8 * len(records)
    index = b""
    data = b""
    for platform, encoding, sub in records:
        index += struct.pack(">HHI", platform, encoding, offset + len(data))
        data += sub
    return head + index + data


def name_table(family: str) -> bytes:
    raw = family.encode("utf-16-be")
    return struct.pack(">HHH", 0, 1, 18) + struct.pack(">HHHHHH", 3, 1, 0x409, 1, len(raw), 0) + raw


def os2_table(weight: int) -> bytes:
    return struct.pack(">HhH", 4, 0, weight) + b"\0" * 64


def fvar_table(*axes: tuple[bytes, float, float, float]) -> bytes:
    head = struct.pack(">HHHHHHHH", 1, 0, 16, 2, len(axes), 20, 0, 0)
    return head + b"".join(struct.pack(">4siiiHH", t, int(lo * 65536), int(d * 65536), int(hi * 65536), 0, 256) for t, lo, d, hi in axes)


def gsub_table(script: bytes, feature: bytes) -> bytes:
    """GSUB 1.0 with one script (default language system) that enables one feature."""
    script_list = struct.pack(">H", 1) + struct.pack(">4sH", script, 8)
    script_table = struct.pack(">HH", 4, 0) + struct.pack(">HHHH", 0, 0xFFFF, 1, 0)
    feature_list = struct.pack(">H", 1) + struct.pack(">4sH", feature, 8) + struct.pack(">HH", 0, 0)
    scripts = script_list + script_table
    return struct.pack(">IHHH", 0x00010000, 10, 10 + len(scripts), 10 + len(scripts) + len(feature_list)) + scripts + feature_list


def cmap_format4_range(start: int, end: int) -> bytes:
    """One segment start..end with glyph = code point - start + 1, then the 0xFFFF sentinel segment."""
    body = struct.pack(">HH", end, 0xFFFF) + struct.pack(">H", 0) + struct.pack(">HH", start, 0xFFFF)
    body += struct.pack(">hh", 1 - start, 1) + struct.pack(">HH", 0, 0)
    return struct.pack(">HHHHHHH", 4, 14 + len(body), 0, 4, 4, 1, 0) + body


def basic_font(weight: int = 400, family: str = "Test Sans") -> bytes:
    """A font that maps printable ASCII."""
    return sfnt({b"cmap": cmap_table((3, 1, cmap_format4_range(0x20, 0x7E))), b"OS/2": os2_table(weight), b"name": name_table(family)})


class RangeArithmeticTest(unittest.TestCase):
    def test_merge_joins_overlapping_and_touching_spans(self) -> None:
        self.assertEqual(fc.merge([(10, 12), (1, 3), (4, 5), (11, 20)]), [(1, 5), (10, 20)])
        self.assertEqual(fc.merge([]), [])

    def test_intersect_keeps_only_shared_code_points(self) -> None:
        a = [(1, 10), (20, 30)]
        b = [(5, 25)]
        self.assertEqual(fc.intersect(a, b), [(5, 10), (20, 25)])
        self.assertEqual(fc.intersect(a, []), [])

    def test_covers_needs_each_span_inside_one_range(self) -> None:
        ranges = [(0x20, 0x7E), (0x660, 0x669)]
        self.assertTrue(fc.covers(ranges, ((0x30, 0x39), (0x660, 0x669))))
        self.assertFalse(fc.covers(ranges, ((0x30, 0x80),)))
        self.assertFalse(fc.covers(ranges, ((0x66A, 0x66A),)))

    def test_count(self) -> None:
        self.assertEqual(fc.count([(1, 3), (10, 10)]), 4)


class CmapTest(unittest.TestCase):
    def parse(self, *records: tuple[int, int, bytes]) -> list[tuple[int, int]]:
        data = sfnt({b"cmap": cmap_table(*records)})
        return fc.parse_cmap(data, fc._tables(data))

    def test_format4_follows_delta_glyph_array_and_skips_notdef(self) -> None:
        self.assertEqual(self.parse((3, 1, cmap_format4())), [(0x41, 0x43), (0x627, 0x627), (0x629, 0x62A)])

    def test_format12_covers_the_supplementary_plane_and_skips_a_notdef_start(self) -> None:
        self.assertEqual(self.parse((3, 10, cmap_format12())), [(0x21, 0x22), (0x10000, 0x10002)])

    def test_unicode_subtables_are_united(self) -> None:
        got = self.parse((3, 1, cmap_format4()), (3, 10, cmap_format12()))
        self.assertEqual(got, [(0x21, 0x22), (0x41, 0x43), (0x627, 0x627), (0x629, 0x62A), (0x10000, 0x10002)])

    def test_symbol_and_macintosh_subtables_are_ignored(self) -> None:
        with self.assertRaises(fc.FontError):
            self.parse((3, 0, cmap_format4()), (1, 0, cmap_format4()))

    def test_errors_name_the_problem(self) -> None:
        with self.assertRaisesRegex(fc.FontError, "bad sfnt version"):
            fc._tables(b"wOFF" + b"\0" * 20)
        with self.assertRaisesRegex(fc.FontError, r"\.ttc"):
            fc._tables(b"ttcf" + b"\0" * 20)
        data = sfnt({b"cmap": cmap_table((3, 1, cmap_format4()))})
        with self.assertRaises(fc.FontError):
            fc._tables(data[:-40])  # a table runs past the end of the file


class LayoutAndAxesTest(unittest.TestCase):
    def test_gsub_features_are_read_per_script(self) -> None:
        data = sfnt({b"GSUB": gsub_table(b"arab", b"rlig")})
        tables = fc._tables(data)
        self.assertEqual(fc.layout_features(data, tables, "GSUB"), frozenset({"rlig"}))
        self.assertEqual(fc.layout_features(data, tables, "GSUB", script=b"latn"), frozenset())
        self.assertEqual(fc.layout_features(data, tables, "GPOS"), frozenset())

    def test_fvar_axes_and_weight_range(self) -> None:
        data = sfnt({b"fvar": fvar_table((b"wght", 100, 400, 900), (b"wdth", 62.5, 100, 100))})
        tables = fc._tables(data)
        axes = fc.parse_axes(data, tables)
        self.assertEqual([(a["tag"], a["min"], a["default"], a["max"]) for a in axes], [("wght", 100, 400, 900), ("wdth", 62.5, 100, 100)])
        self.assertEqual(fc._weight_range(data, tables, axes), (100, 900))

    def test_static_weight_comes_from_os2(self) -> None:
        data = basic_font(weight=700)
        tables = fc._tables(data)
        self.assertEqual(fc._weight_range(data, tables, []), (700, 700))
        self.assertEqual(fc._family_name(data, tables), "Test Sans")

    def test_lam_alef_needs_the_letters_and_either_rlig_or_the_forms(self) -> None:
        letters = [(0x622, 0x623), (0x625, 0x625), (0x627, 0x627), (0x644, 0x644)]
        self.assertTrue(fc.lam_alef(letters, frozenset({"rlig"})))
        self.assertTrue(fc.lam_alef(fc.merge([*letters, (0xFEFB, 0xFEFC)]), frozenset()))
        self.assertFalse(fc.lam_alef(letters, frozenset({"init"})))
        self.assertFalse(fc.lam_alef([(0x627, 0x627)], frozenset({"rlig"})))


class CommandLineTest(unittest.TestCase):
    """The tool against a temporary fonts folder with one synthetic family."""

    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.dir = Path(self._tmp.name)
        self.font = self.dir / "test-sans" / "TestSans-Regular.ttf"
        self.font.parent.mkdir()
        self.font.write_bytes(basic_font())
        (self.dir / "test-sans" / "OFL.txt").write_text("licence\n", encoding="utf-8")
        self.out = self.dir / "coverage.json"

    def registry(self, **overrides: object) -> dict[str, object]:
        data = self.font.read_bytes()
        entry = {
            "file": "test-sans/TestSans-Regular.ttf", "style": "normal", "wght": [400, 400], "variable": False, "axes": [],
            "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest(),
            "upstreamBlob": hashlib.sha1(b"blob %d\0" % len(data) + data).hexdigest(),
        }
        family = {"id": "test-sans", "family": "Test Sans", "scripts": ["latin"], "licenseFile": "test-sans/OFL.txt", "files": [entry], "latin": "basic"}
        family.update(overrides)
        return {"schemaVersion": 1, "families": [family]}

    def run_tool(self, *args: str) -> tuple[int, str]:
        out = io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(io.StringIO()):
            code = fc.main(["--fonts", str(self.dir), "--out", str(self.out), *args])
        return code, out.getvalue()

    def write_registry(self, registry: dict[str, object]) -> None:
        (self.dir / "registry.json").write_text(json.dumps(registry), encoding="utf-8")

    def test_writes_then_reports_current_and_check_detects_drift(self) -> None:
        code, text = self.run_tool()
        self.assertEqual(code, 0)
        self.assertIn("written", text)
        data = json.loads(self.out.read_text(encoding="utf-8"))
        entry = data["families"]["test-sans"]
        self.assertEqual(entry["file"], "test-sans/TestSans-Regular.ttf")
        self.assertEqual(entry["ranges"], [[0x20, 0x7E]])
        self.assertTrue(entry["latinBasic"] and entry["westernDigits"])
        self.assertFalse(entry["latinExt"] or entry["arabicLetters"] or entry["lamAlef"])
        self.assertEqual(self.run_tool()[1].splitlines()[-2], "coverage.json: already current")
        self.assertEqual(self.run_tool("--check")[0], 0)
        self.out.write_text(self.out.read_text(encoding="utf-8").replace("126", "125"), encoding="utf-8")
        self.assertEqual(self.run_tool("--check")[0], 2)
        self.assertIn("125", self.out.read_text(encoding="utf-8"))  # --check wrote nothing
        self.assertEqual(self.run_tool()[0], 0)  # a normal run repairs it
        self.assertEqual(json.loads(self.out.read_text(encoding="utf-8"))["families"]["test-sans"]["ranges"], [[0x20, 0x7E]])

    def test_output_is_byte_stable_and_uses_lf(self) -> None:
        self.run_tool()
        first = self.out.read_bytes()
        self.run_tool()
        self.assertEqual(first, self.out.read_bytes())
        self.assertNotIn(b"\r", first)

    def test_a_matching_registry_passes(self) -> None:
        self.write_registry(self.registry())
        code, text = self.run_tool("--format", "json")
        self.assertEqual(code, 0)
        report = json.loads(text)
        self.assertTrue(report["ok"])
        self.assertEqual(report["problems"], [])

    def test_registry_mismatches_are_reported(self) -> None:
        cases = {
            "R03": self.registry(files=[{**self.registry()["families"][0]["files"][0], "bytes": 1}]),
            "R04": self.registry(files=[{**self.registry()["families"][0]["files"][0], "sha256": "0" * 64}]),
            "R13": self.registry(files=[{**self.registry()["families"][0]["files"][0], "upstreamBlob": "0" * 40}]),
            "R05": self.registry(files=[{**self.registry()["families"][0]["files"][0], "variable": True}]),
            "R06": self.registry(files=[{**self.registry()["families"][0]["files"][0], "wght": [100, 900]}]),
            "R08": self.registry(licenseFile="test-sans/MISSING.txt"),
            "R09": self.registry(family="Other Name"),
            "R10": self.registry(scripts=["arabic", "latin"]),
            "R12": self.registry(latin="extended"),
        }
        for code, registry in cases.items():
            with self.subTest(code=code):
                self.write_registry(registry)
                status, text = self.run_tool("--format", "json")
                self.assertEqual(status, 2)
                self.assertIn(code, {p["code"] for p in json.loads(text)["problems"]})

    def test_unlisted_and_missing_files(self) -> None:
        self.write_registry({"schemaVersion": 1, "families": []})
        codes = {p["code"] for p in json.loads(self.run_tool("--format", "json")[1])["problems"]}
        self.assertEqual(codes, {"R02"})
        self.write_registry(self.registry(files=[{"file": "test-sans/Gone.ttf"}]))
        codes = {p["code"] for p in json.loads(self.run_tool("--format", "json")[1])["problems"]}
        self.assertIn("R01", codes)

    def test_exit_codes_for_bad_input(self) -> None:
        with contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(fc.main(["--bogus"]), 64)
            self.assertEqual(fc.main(["--fonts", str(self.dir / "nowhere")]), 66)
            empty = self.dir / "empty"
            empty.mkdir()
            self.assertEqual(fc.main(["--fonts", str(empty), "--out", str(self.out)]), 66)
            self.font.write_bytes(b"not a font at all, only text")
            self.assertEqual(self.run_tool()[0], 65)
            self.font.write_bytes(basic_font())
            (self.dir / "registry.json").write_text("{ nope", encoding="utf-8")
            self.assertEqual(self.run_tool()[0], 65)
            (self.dir / "registry.json").unlink()
            self.assertEqual(self.run_tool("--registry", str(self.dir / "absent.json"))[0], 66)


@unittest.skipUnless((FONTS / "registry.json").is_file(), "fonts are not in this checkout")
class ShippedFontsTest(unittest.TestCase):
    """The committed fonts, registry and coverage agree with each other and with the presets."""

    @classmethod
    def setUpClass(cls) -> None:
        cls.registry = json.loads((FONTS / "registry.json").read_text(encoding="utf-8"))
        cls.coverage = json.loads((FONTS / "coverage.json").read_text(encoding="utf-8"))
        cls.by_id = {f["id"]: f for f in cls.registry["families"]}

    def test_coverage_json_is_reproduced_from_the_fonts(self) -> None:
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            code = fc.main(["--fonts", str(FONTS), "--check", "--format", "json"])
        report = json.loads(out.getvalue())
        self.assertEqual((code, report["problems"], report["status"]), (0, [], "in sync"))

    def test_the_twelve_contract_families_ship(self) -> None:
        expected = {"alexandria", "readex-pro", "ibm-plex-sans-arabic", "noto-kufi-arabic", "noto-sans-arabic", "reem-kufi",
                    "el-messiri", "playpen-sans-arabic", "cairo", "rubik", "ibm-plex-sans", "inter"}
        self.assertEqual(set(self.by_id), expected)
        self.assertEqual(set(self.coverage["families"]), expected)
        for fid in expected:
            self.assertTrue((FONTS / fid / "OFL.txt").is_file(), fid)

    def test_every_arabic_family_covers_the_arabic_basics(self) -> None:
        for fid, fam in self.by_id.items():
            if "arabic" not in fam["scripts"]:
                continue
            cov = self.coverage["families"][fid]
            with self.subTest(family=fid):
                for flag in ("arabicLetters", "arabicIndicDigits", "arabicPunctuation", "westernDigits", "tatweel", "lamAlef"):
                    self.assertTrue(cov[flag], flag)

    def test_fonts_are_unmodified_upstream_files(self) -> None:
        for fam in self.registry["families"]:
            for entry in fam["files"]:
                with self.subTest(file=entry["file"]):
                    data = (FONTS / entry["file"]).read_bytes()
                    self.assertEqual(hashlib.sha256(data).hexdigest(), entry["sha256"])
                    self.assertEqual(hashlib.sha1(b"blob %d\0" % len(data) + data).hexdigest(), entry["upstreamBlob"])
                    self.assertTrue(entry["upstreamPath"].startswith("ofl/"))
                    self.assertEqual(entry["style"], "normal")

    def test_presets_only_use_registered_families_in_roles_they_offer(self) -> None:
        index = json.loads((DESIGN / "styles" / "index.json").read_text(encoding="utf-8"))
        for entry in index["presets"]:
            preset = json.loads((DESIGN / "styles" / entry["dir"] / "preset.json").read_text(encoding="utf-8"))
            for role in ("display", "heading", "body", "latin"):
                face = preset["type"][role]
                with self.subTest(preset=entry["id"], role=role):
                    fam = self.by_id[face["family"]]
                    self.assertIn(role, fam["roles"])
                    self.assertIn(entry["id"], fam["presets"])
                    self.assertIn(face["wght"], fam["weights"])
                    if role != "latin":
                        self.assertIn("arabic", fam["scripts"])

    def test_pairings_are_symmetric(self) -> None:
        for fid, fam in self.by_id.items():
            for other in fam["pairsWith"]:
                with self.subTest(pair=f"{fid}+{other}"):
                    self.assertIn(fid, self.by_id[other]["pairsWith"])


if __name__ == "__main__":
    unittest.main()
