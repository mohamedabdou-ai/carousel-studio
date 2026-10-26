#!/usr/bin/env python3
"""Compute fonts/coverage.json from the TTF files that ship in carousel-design/fonts/.

The Studio and the QA gates must know which code points a font can draw (CONTRACT 6.5):
gate D5 blocks a design whose text uses a code point the resolved font lacks, and
CS.core.registry.fontHas() answers from the same data. This tool reads the Unicode `cmap`
of every font file with the standard library only (subtable formats 4 and 12) and writes
the result as coverage.json, so the file is reproducible from the fonts and never edited
by hand.

    fonts/
      registry.json          hand-curated metadata (B11), read here only to be verified
      coverage.json          written by this tool
      <family-id>/*.ttf      unmodified upstream OFL files, plus OFL.txt

Per family the tool writes
    file     the face that stands for the family (the upright face whose weight range
             contains 400 and is narrowest: Regular for a static family, the single file
             for a variable one)
    ranges   sorted, merged, inclusive code-point ranges that EVERY face of the family
             covers, so a design is safe at any weight it picks
and these flags, true when the family can draw the whole set:
    arabicLetters      U+0621-063A and U+0641-064A (hamza through yaa)
    arabicDiacritics   U+064B-0652 (the tashkeel marks, fathatan through sukun)
    arabicIndicDigits  U+0660-0669
    arabicPunctuation  U+060C comma, U+061B semicolon, U+061F question mark
    westernDigits      U+0030-0039
    tatweel            U+0640
    lamAlef            lam and the four alef forms are mapped, and the font forms the ligature:
                       a GSUB `rlig` feature for the Arabic script, or the presentation forms
                       U+FEFB and U+FEFC (the only flag that reads a table other than cmap)
    persianLetters     U+067E U+0686 U+0698 U+06A9 U+06AF U+06CC
    latinBasic         U+0020-007E, the whole printable ASCII block
    latinExt           the accented letters of Latin-1 Supplement, U+00C0-00FF without the
                       multiplication and division signs (French, Spanish, German, Nordic names)

When fonts/registry.json exists the tool also checks it against the fonts (codes R00-R12 in
the report): every listed file exists, every TTF is listed, bytes, sha256, weight range,
variable flag, axes and family name agree with the font itself, `upstreamBlob` (the git
blob id that google/fonts lists for the file) matches the bytes, each licence file exists,
a family that claims the Arabic script covers the letters, digits (Arabic-Indic and Western),
punctuation and tatweel, and its `latin` tier matches the cmap. Any mismatch makes the exit
code 2.

Usage:
    python tools/font_coverage.py [--fonts DIR] [--out FILE] [--registry FILE]
                                  [--check] [--format text|json]

    --fonts     the fonts folder (default: plugins/carousel-studio/skills/carousel-design/fonts)
    --out       where coverage.json is written (default: <fonts>/coverage.json)
    --registry  the registry to verify (default: <fonts>/registry.json; skipped when absent)
    --check     write nothing; exit 2 when coverage.json differs from what the fonts produce

Exit codes (CONTRACT 0.4):
    0   coverage.json written (or already current) and the registry agrees with the fonts
    2   --check found drift, or the registry disagrees with the fonts
    64  usage error
    65  a font or the registry cannot be parsed
    66  the fonts folder is missing or holds no TTF
    73  coverage.json could not be written

Python 3.11, standard library only.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import struct
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Sequence

EXIT_OK = 0
EXIT_DRIFT = 2
EXIT_USAGE = 64
EXIT_DATA = 65
EXIT_NO_INPUT = 66
EXIT_CANT_WRITE = 73

SCHEMA_VERSION = 1
GENERATOR = "tools/font_coverage.py"
FONTS_REL = Path("plugins/carousel-studio/skills/carousel-design/fonts")
REGISTRY_NAME = "registry.json"
COVERAGE_NAME = "coverage.json"
RANGES_PER_LINE = 10

Range = tuple[int, int]

# ---------------------------------------------------------------------------------------------------------------------
# What each flag asks for. A flag is true when every listed span lies inside the font's coverage.
# ---------------------------------------------------------------------------------------------------------------------

FLAGS: tuple[tuple[str, tuple[Range, ...]], ...] = (
    ("arabicLetters", ((0x0621, 0x063A), (0x0641, 0x064A))),
    ("arabicDiacritics", ((0x064B, 0x0652),)),
    ("arabicIndicDigits", ((0x0660, 0x0669),)),
    ("arabicPunctuation", ((0x060C, 0x060C), (0x061B, 0x061B), (0x061F, 0x061F))),
    ("westernDigits", ((0x0030, 0x0039),)),
    ("tatweel", ((0x0640, 0x0640),)),
    ("lamAlef", ()),  # computed by lam_alef(), which also needs the GSUB features
    ("persianLetters", ((0x067E, 0x067E), (0x0686, 0x0686), (0x0698, 0x0698), (0x06A9, 0x06A9), (0x06AF, 0x06AF), (0x06CC, 0x06CC))),
    ("latinBasic", ((0x0020, 0x007E),)),
    ("latinExt", ((0x00C0, 0x00D6), (0x00D8, 0x00F6), (0x00F8, 0x00FF))),
)

# lam (U+0644) with alef (U+0627) and the three hamza/madda alefs (U+0622, U+0623, U+0625)
LAM_ALEF_LETTERS: tuple[Range, ...] = ((0x0622, 0x0623), (0x0625, 0x0625), (0x0627, 0x0627), (0x0644, 0x0644))
# Presentation forms of lam + plain alef, isolated and final: fonts that draw the ligature without GSUB map them
LAM_ALEF_FORMS: tuple[Range, ...] = ((0xFEFB, 0xFEFC),)


class FontError(Exception):
    """A font file or the registry cannot be read."""


# ---------------------------------------------------------------------------------------------------------------------
# Range arithmetic: lists of inclusive (start, end) pairs, sorted and merged.
# ---------------------------------------------------------------------------------------------------------------------


def merge(spans: Iterable[Range]) -> list[Range]:
    """Sort spans and join the ones that overlap or touch."""
    out: list[Range] = []
    for start, end in sorted(spans):
        if out and start <= out[-1][1] + 1:
            if end > out[-1][1]:
                out[-1] = (out[-1][0], end)
        else:
            out.append((start, end))
    return out


def intersect(a: Sequence[Range], b: Sequence[Range]) -> list[Range]:
    """Code points present in both merged range lists."""
    out: list[Range] = []
    i = j = 0
    while i < len(a) and j < len(b):
        lo = max(a[i][0], b[j][0])
        hi = min(a[i][1], b[j][1])
        if lo <= hi:
            out.append((lo, hi))
        if a[i][1] < b[j][1]:
            i += 1
        else:
            j += 1
    return out


def covers(ranges: Sequence[Range], wanted: Iterable[Range]) -> bool:
    """True when every wanted span lies inside one merged range."""
    return all(any(r[0] <= lo and hi <= r[1] for r in ranges) for lo, hi in wanted)


def count(ranges: Iterable[Range]) -> int:
    return sum(end - start + 1 for start, end in ranges)


# ---------------------------------------------------------------------------------------------------------------------
# sfnt reading
# ---------------------------------------------------------------------------------------------------------------------

SFNT_VERSIONS = (b"\x00\x01\x00\x00", b"true", b"OTTO")


def _u16(data: bytes, offset: int) -> int:
    return struct.unpack_from(">H", data, offset)[0]


def _tables(data: bytes) -> dict[str, tuple[int, int]]:
    """Table directory: tag -> (offset, length)."""
    if len(data) < 12:
        raise FontError("file is too short to be a font")
    if data[:4] == b"ttcf":
        raise FontError("font collections (.ttc) are not supported")
    if data[:4] not in SFNT_VERSIONS:
        raise FontError("not a TrueType or OpenType font (bad sfnt version)")
    tables: dict[str, tuple[int, int]] = {}
    for i in range(_u16(data, 4)):
        tag, _checksum, offset, length = struct.unpack_from(">4sIII", data, 12 + 16 * i)
        if offset + length > len(data):
            raise FontError(f"table {tag.decode('latin-1')!r} runs past the end of the file")
        tables[tag.decode("latin-1")] = (offset, length)
    return tables


def _cmap_format4(t: bytes, o: int) -> list[Range]:
    seg_x2 = _u16(t, o + 6)
    seg_count = seg_x2 // 2
    end_o = o + 14
    start_o = end_o + seg_x2 + 2  # skip reservedPad
    delta_o = start_o + seg_x2
    range_o = delta_o + seg_x2
    spans: list[Range] = []
    for i in range(seg_count):
        end = _u16(t, end_o + 2 * i)
        start = _u16(t, start_o + 2 * i)
        delta = _u16(t, delta_o + 2 * i)
        offset = _u16(t, range_o + 2 * i)
        if start > end:
            raise FontError("cmap format 4 segment ends before it starts")
        run: int | None = None
        for cp in range(start, end + 1):
            gid = 0
            if cp != 0xFFFF:  # the closing segment maps the noncharacter U+FFFF to .notdef
                if offset == 0:
                    gid = (cp + delta) & 0xFFFF
                else:
                    at = range_o + 2 * i + offset + 2 * (cp - start)
                    if at + 2 <= len(t):
                        raw = _u16(t, at)
                        gid = (raw + delta) & 0xFFFF if raw else 0
            if gid:
                if run is None:
                    run = cp
            elif run is not None:
                spans.append((run, cp - 1))
                run = None
        if run is not None:
            spans.append((run, end))
    return spans


def _cmap_format12(t: bytes, o: int) -> list[Range]:
    groups = struct.unpack_from(">I", t, o + 12)[0]
    spans: list[Range] = []
    for i in range(groups):
        start, end, gid = struct.unpack_from(">III", t, o + 16 + 12 * i)
        if end < start or end > 0x10FFFF:
            raise FontError("cmap format 12 group is out of range")
        if gid == 0:
            start += 1  # the first code point of the group maps to .notdef
        if start <= end:
            spans.append((start, end))
    return spans


def parse_cmap(data: bytes, tables: dict[str, tuple[int, int]]) -> list[Range]:
    """Merged code-point ranges that the font maps to a real glyph (Unicode subtables, formats 4 and 12)."""
    if "cmap" not in tables:
        raise FontError("no cmap table")
    offset, length = tables["cmap"]
    t = data[offset : offset + length]
    spans: list[Range] = []
    found = False
    try:
        for i in range(_u16(t, 2)):
            platform, encoding, sub = struct.unpack_from(">HHI", t, 4 + 8 * i)
            if not (platform == 0 or (platform == 3 and encoding in (1, 10))):
                continue  # symbol, Macintosh and other legacy encodings
            fmt = _u16(t, sub)
            if fmt == 4:
                spans += _cmap_format4(t, sub)
            elif fmt == 12:
                spans += _cmap_format12(t, sub)
            else:
                continue
            found = True
    except struct.error as exc:
        raise FontError(f"cmap table is truncated ({exc})") from exc
    if not found:
        raise FontError("no Unicode cmap subtable in format 4 or 12")
    return merge(spans)


def _fixed(value: int) -> int | float:
    number = value / 65536
    return int(number) if number == int(number) else round(number, 4)


def parse_axes(data: bytes, tables: dict[str, tuple[int, int]]) -> list[dict[str, object]]:
    """Variation axes from fvar: [{tag, min, default, max}], empty for a static font."""
    if "fvar" not in tables:
        return []
    offset, _ = tables["fvar"]
    try:
        axes_at, _reserved, axis_count, axis_size = struct.unpack_from(">HHHH", data, offset + 4)
        axes = []
        for i in range(axis_count):
            tag, lo, default, hi = struct.unpack_from(">4siii", data, offset + axes_at + axis_size * i)
            axes.append({"tag": tag.decode("latin-1"), "min": _fixed(lo), "default": _fixed(default), "max": _fixed(hi)})
        return axes
    except struct.error as exc:
        raise FontError(f"fvar table is truncated ({exc})") from exc


def layout_features(data: bytes, tables: dict[str, tuple[int, int]], table: str, script: bytes = b"arab") -> frozenset[str]:
    """Feature tags that a GSUB or GPOS table enables for one script (any language system), e.g. {"rlig", "init", "mark"}."""
    if table not in tables:
        return frozenset()
    base = tables[table][0]
    try:
        script_list, feature_list = struct.unpack_from(">HH", data, base + 4)
        feature_at = base + feature_list
        tags = [data[feature_at + 2 + 6 * i : feature_at + 6 + 6 * i].decode("latin-1") for i in range(_u16(data, feature_at))]
        scripts_at = base + script_list
        found: set[str] = set()
        for i in range(_u16(data, scripts_at)):
            tag, offset = struct.unpack_from(">4sH", data, scripts_at + 2 + 6 * i)
            if tag != script:
                continue
            script_at = scripts_at + offset
            default_lang, lang_count = struct.unpack_from(">HH", data, script_at)
            lang_offsets = [default_lang] if default_lang else []
            lang_offsets += [struct.unpack_from(">4sH", data, script_at + 4 + 6 * j)[1] for j in range(lang_count)]
            for lang_offset in lang_offsets:
                lang_at = script_at + lang_offset
                required, index_count = struct.unpack_from(">HH", data, lang_at + 2)
                indices = [_u16(data, lang_at + 6 + 2 * k) for k in range(index_count)]
                if required != 0xFFFF:
                    indices.append(required)
                found.update(tags[k] for k in indices if k < len(tags))
        return frozenset(found)
    except struct.error as exc:
        raise FontError(f"{table} table is truncated ({exc})") from exc


def lam_alef(ranges: Sequence[Range], features: frozenset[str]) -> bool:
    """The font maps lam and the alef forms and draws their ligature (GSUB `rlig`, or the presentation forms in the cmap)."""
    return covers(ranges, LAM_ALEF_LETTERS) and ("rlig" in features or covers(ranges, LAM_ALEF_FORMS))


def _weight_range(data: bytes, tables: dict[str, tuple[int, int]], axes: list[dict[str, object]]) -> tuple[int, int]:
    for axis in axes:
        if axis["tag"] == "wght":
            return round(axis["min"]), round(axis["max"])  # type: ignore[arg-type]
    if "OS/2" in tables:
        weight = _u16(data, tables["OS/2"][0] + 4)
        return weight, weight
    return 400, 400


def _is_italic(data: bytes, tables: dict[str, tuple[int, int]]) -> bool:
    if "head" not in tables or tables["head"][1] < 46:
        return False
    return bool(_u16(data, tables["head"][0] + 44) & 0b10)  # macStyle bit 1


def _family_name(data: bytes, tables: dict[str, tuple[int, int]]) -> str:
    """The typographic family (name id 16) or, failing that, the family (name id 1)."""
    if "name" not in tables:
        return ""
    base = tables["name"][0]
    try:
        count_, string_at = struct.unpack_from(">HH", data, base + 2)
        found: dict[int, str] = {}
        for i in range(count_):
            platform, _enc, _lang, name_id, size, at = struct.unpack_from(">HHHHHH", data, base + 6 + 12 * i)
            if name_id not in (1, 16) or name_id in found:
                continue
            raw = data[base + string_at + at : base + string_at + at + size]
            if platform in (0, 3):
                found[name_id] = raw.decode("utf-16-be", "replace")
            elif platform == 1:
                found[name_id] = raw.decode("mac_roman", "replace")
    except struct.error as exc:
        raise FontError(f"name table is truncated ({exc})") from exc
    return found.get(16) or found.get(1) or ""


@dataclass(frozen=True)
class Face:
    """Everything this tool needs to know about one font file."""

    path: Path
    rel: str  # POSIX path relative to the fonts folder
    size: int
    sha256: str
    git_blob: str  # SHA-1 of "blob <size>\0<bytes>", the id git (and so the google/fonts tree) gives the file
    ranges: list[Range]
    axes: list[dict[str, object]]
    weight: tuple[int, int]
    italic: bool
    family: str  # the font's own family name (name id 16, else 1)
    features: frozenset[str]  # GSUB features enabled for the Arabic script


def read_face(path: Path, fonts_dir: Path) -> Face:
    data = path.read_bytes()
    rel = path.relative_to(fonts_dir).as_posix()
    try:
        tables = _tables(data)
        axes = parse_axes(data, tables)
        return Face(
            path=path,
            rel=rel,
            size=len(data),
            sha256=hashlib.sha256(data).hexdigest(),
            git_blob=hashlib.sha1(b"blob %d\0" % len(data) + data).hexdigest(),
            ranges=parse_cmap(data, tables),
            axes=axes,
            weight=_weight_range(data, tables, axes),
            italic=_is_italic(data, tables),
            family=_family_name(data, tables),
            features=layout_features(data, tables, "GSUB"),
        )
    except (FontError, struct.error) as exc:
        raise FontError(f"{rel}: {exc}") from exc


# ---------------------------------------------------------------------------------------------------------------------
# Families
# ---------------------------------------------------------------------------------------------------------------------


def scan(fonts_dir: Path) -> dict[str, list[Face]]:
    """family id -> faces, for every sub-folder of the fonts folder that holds TTF files."""
    families: dict[str, list[Face]] = {}
    for folder in sorted(p for p in fonts_dir.iterdir() if p.is_dir()):
        files = sorted((f for f in folder.iterdir() if f.is_file() and f.suffix.lower() == ".ttf"), key=lambda p: p.name.lower())
        if files:
            families[folder.name] = [read_face(f, fonts_dir) for f in files]
    return families


def primary_face(faces: Sequence[Face]) -> Face:
    """The upright face whose weight range contains 400 and is narrowest; ties go to the first file."""
    def rank(item: tuple[int, Face]) -> tuple[bool, bool, int, int]:
        index, face = item
        lo, hi = face.weight
        return (face.italic, not lo <= 400 <= hi, hi - lo, index)

    return min(enumerate(faces), key=rank)[1]


def family_coverage(faces: Sequence[Face]) -> dict[str, object]:
    ranges = list(faces[0].ranges)
    for face in faces[1:]:
        ranges = intersect(ranges, face.ranges)
    features = frozenset.intersection(*(face.features for face in faces))
    entry: dict[str, object] = {"file": primary_face(faces).rel, "ranges": ranges}
    for name, wanted in FLAGS:
        entry[name] = lam_alef(ranges, features) if name == "lamAlef" else covers(ranges, wanted)
    return entry


def latin_tier(entry: dict[str, object]) -> str:
    """How much Latin a family covers: extended (accented letters too), basic (printable ASCII) or none."""
    if not entry["latinBasic"]:
        return "none"
    return "extended" if entry["latinExt"] else "basic"


def build_coverage(families: dict[str, list[Face]]) -> dict[str, object]:
    return {
        "schemaVersion": SCHEMA_VERSION,
        "generator": GENERATOR,
        "families": {fid: family_coverage(faces) for fid, faces in families.items()},
    }


def render(coverage: dict[str, object]) -> str:
    """coverage.json text: two-space indent, ranges packed ten to a line so the file stays small and diffable."""
    lines = ["{", f'  "schemaVersion": {coverage["schemaVersion"]},', f'  "generator": {json.dumps(coverage["generator"])},', '  "families": {']
    families: dict[str, dict[str, object]] = coverage["families"]  # type: ignore[assignment]
    for n, (fid, entry) in enumerate(families.items()):
        lines.append(f"    {json.dumps(fid)}: {{")
        lines.append(f'      "file": {json.dumps(entry["file"], ensure_ascii=False)},')
        pairs = [f"[{a},{b}]" for a, b in entry["ranges"]]  # type: ignore[union-attr]
        lines.append('      "ranges": [')
        for i in range(0, len(pairs), RANGES_PER_LINE):
            tail = "," if i + RANGES_PER_LINE < len(pairs) else ""
            lines.append("        " + ",".join(pairs[i : i + RANGES_PER_LINE]) + tail)
        lines.append("      ],")
        flags = [name for name, _ in FLAGS]
        for k, name in enumerate(flags):
            lines.append(f'      "{name}": {json.dumps(entry[name])}' + ("," if k < len(flags) - 1 else ""))
        lines.append("    }" + ("," if n < len(families) - 1 else ""))
    lines += ["  }", "}", ""]
    return "\n".join(lines)


# ---------------------------------------------------------------------------------------------------------------------
# Registry verification
# ---------------------------------------------------------------------------------------------------------------------


@dataclass(frozen=True)
class Problem:
    code: str
    scope: str
    message: str


def _axes_key(axes: Iterable[dict[str, object]]) -> list[tuple[object, ...]]:
    return [(a.get("tag"), a.get("min"), a.get("default"), a.get("max")) for a in axes]


ARABIC_REQUIRED = ("arabicLetters", "arabicIndicDigits", "arabicPunctuation", "westernDigits", "tatweel")


def verify_registry(
    fonts_dir: Path, registry: dict[str, object], families: dict[str, list[Face]], coverage: dict[str, object]
) -> list[Problem]:
    """Compare registry.json with the files on disk and with the coverage they produce. Pure: writes nothing."""
    problems: list[Problem] = []
    entries = registry.get("families")
    if not isinstance(entries, list) or not all(isinstance(f, dict) for f in entries):
        return [Problem("R00", REGISTRY_NAME, '"families" must be an array of objects')]
    by_rel = {face.rel: face for faces in families.values() for face in faces}
    covered: dict[str, dict[str, object]] = coverage["families"]  # type: ignore[assignment]
    listed: set[str] = set()
    seen_ids: set[str] = set()
    for fam in entries:
        fid = str(fam.get("id", "?"))
        if fid in seen_ids:
            problems.append(Problem("R00", fid, "duplicate family id"))
        seen_ids.add(fid)
        if fid not in families:
            problems.append(Problem("R01", fid, f"no folder {fid}/ with TTF files"))
        license_file = fam.get("licenseFile")
        if not license_file or not (fonts_dir / str(license_file)).is_file():
            problems.append(Problem("R08", fid, f"licenseFile {license_file!r} does not exist"))
        for entry in fam.get("files", []):
            rel = str(entry.get("file"))
            listed.add(rel)
            face = by_rel.get(rel)
            if face is None:
                problems.append(Problem("R01", rel, "listed in the registry but missing on disk"))
                continue
            if entry.get("bytes") != face.size:
                problems.append(Problem("R03", rel, f"bytes {entry.get('bytes')} != {face.size} on disk"))
            if entry.get("sha256") != face.sha256:
                problems.append(Problem("R04", rel, "sha256 differs from the file on disk"))
            if entry.get("upstreamBlob", face.git_blob) != face.git_blob:
                problems.append(Problem("R13", rel, "upstreamBlob differs from the git blob id of the file: it is not the upstream file"))
            if bool(entry.get("variable")) != bool(face.axes):
                problems.append(Problem("R05", rel, f"variable is {entry.get('variable')} but the font has {len(face.axes)} axes"))
            if list(entry.get("wght", [])) != list(face.weight):
                problems.append(Problem("R06", rel, f"wght {entry.get('wght')} != {list(face.weight)} read from the font"))
            if _axes_key(entry.get("axes", [])) != _axes_key(face.axes):
                problems.append(Problem("R07", rel, "axes differ from the font's fvar table"))
            if face.family and face.family != fam.get("family"):
                problems.append(Problem("R09", rel, f'family "{fam.get("family")}" but the font names itself "{face.family}"'))
        cov = covered.get(fid)
        if cov is None:
            continue
        scripts = fam.get("scripts", [])
        if "arabic" in scripts:
            lacking = [flag for flag in ARABIC_REQUIRED if not cov[flag]]
            if lacking:
                problems.append(Problem("R10", fid, "scripts include arabic but the font lacks " + ", ".join(lacking)))
        if "latin" in scripts and not cov["latinBasic"]:
            problems.append(Problem("R11", fid, "scripts include latin but the font lacks printable ASCII"))
        if fam.get("latin") != latin_tier(cov):
            problems.append(Problem("R12", fid, f'latin is "{fam.get("latin")}" but the cmap gives "{latin_tier(cov)}"'))
    for rel in sorted(set(by_rel) - listed):
        problems.append(Problem("R02", rel, "TTF on disk but not listed in the registry"))
    for fid in sorted(set(families) - seen_ids):
        problems.append(Problem("R02", fid, "folder has TTF files but no registry entry"))
    return problems


# ---------------------------------------------------------------------------------------------------------------------
# Command line
# ---------------------------------------------------------------------------------------------------------------------


def _read_text(path: Path) -> str | None:
    try:
        return path.read_text(encoding="utf-8")  # text mode reads CRLF as LF, so a Windows checkout compares equal
    except FileNotFoundError:
        return None


def _write_atomic(dst: Path, text: str) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    tmp = dst.with_name(dst.name + ".tmp")
    tmp.write_bytes(text.encode("utf-8"))
    tmp.replace(dst)


def _report_text(fonts_dir: Path, out: Path, status: str, coverage: dict[str, object], checked: str, problems: list[Problem]) -> str:
    families: dict[str, dict[str, object]] = coverage["families"]  # type: ignore[assignment]
    lines = [f"{fonts_dir.as_posix()}: {len(families)} families"]
    width = max((len(fid) for fid in families), default=0)
    for fid, entry in families.items():
        off = [name for name, _ in FLAGS if not entry[name]]
        lines.append(f"  {fid:<{width}}  {count(entry['ranges']):>5} code points  " + ("all flags set" if not off else "no " + ", ".join(off)))  # type: ignore[arg-type]
    lines.append(f"{out.name}: {status}")
    lines.append(f"{REGISTRY_NAME}: {checked}")
    for p in problems:
        lines.append(f"  {p.code} {p.scope}: {p.message}")
    return "\n".join(lines)


def _report_json(
    fonts_dir: Path, out: Path, status: str, coverage: dict[str, object], checked: str, problems: list[Problem], ok: bool
) -> str:
    families: dict[str, dict[str, object]] = coverage["families"]  # type: ignore[assignment]
    return json.dumps(
        {
            "ok": ok,
            "fonts": fonts_dir.as_posix(),
            "out": out.as_posix(),
            "status": status,
            "registry": checked,
            "families": [
                {
                    "id": fid,
                    "file": entry["file"],
                    "codePoints": count(entry["ranges"]),  # type: ignore[arg-type]
                    "flags": {name: entry[name] for name, _ in FLAGS},
                }
                for fid, entry in families.items()
            ],
            "problems": [{"code": p.code, "scope": p.scope, "message": p.message} for p in problems],
        },
        ensure_ascii=False,
        indent=2,
    )


def _ensure_utf8_stdio() -> None:
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if reconfigure is not None:
            reconfigure(encoding="utf-8")


def _error(code: str, message: str) -> None:
    print(f"cs-error: {code}: {message}", file=sys.stderr)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="font_coverage.py",
        description="Write fonts/coverage.json from the cmap of every shipped TTF and verify fonts/registry.json against the files.",
    )
    parser.add_argument("--fonts", help=f"fonts folder (default: <repo>/{FONTS_REL.as_posix()})")
    parser.add_argument("--out", help=f"coverage file to write (default: <fonts>/{COVERAGE_NAME})")
    parser.add_argument("--registry", help=f"registry to verify (default: <fonts>/{REGISTRY_NAME}; skipped when absent)")
    parser.add_argument("--check", action="store_true", help="write nothing; exit 2 when coverage.json differs from what the fonts produce")
    parser.add_argument("--format", choices=("text", "json"), default="text", help="output format (default: text)")
    return parser


def main(argv: list[str] | None = None) -> int:
    _ensure_utf8_stdio()
    try:
        args = build_parser().parse_args(argv)
    except SystemExit as exc:  # argparse exits 0 for --help and 2 for bad usage
        return EXIT_OK if exc.code == 0 else EXIT_USAGE

    fonts_dir = Path(args.fonts) if args.fonts else Path(__file__).resolve().parent.parent / FONTS_REL
    if not fonts_dir.is_dir():
        _error("E_FONT_MISSING", f"fonts folder not found: {fonts_dir}")
        return EXIT_NO_INPUT
    out = Path(args.out) if args.out else fonts_dir / COVERAGE_NAME
    registry_path = Path(args.registry) if args.registry else fonts_dir / REGISTRY_NAME

    try:
        families = scan(fonts_dir)
    except FontError as exc:
        _error("E_SCHEMA", str(exc))
        return EXIT_DATA
    if not families:
        _error("E_FONT_MISSING", f"no TTF files under {fonts_dir}")
        return EXIT_NO_INPUT

    coverage = build_coverage(families)
    problems: list[Problem] = []
    checked = "not found, not verified"
    if registry_path.is_file():
        try:
            registry = json.loads(registry_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError) as exc:
            _error("E_SCHEMA", f"{registry_path.name} is not valid JSON: {exc}")
            return EXIT_DATA
        problems = verify_registry(fonts_dir, registry, families, coverage)
        files = sum(len(faces) for faces in families.values())
        checked = f"{'agrees' if not problems else 'disagrees'} with {files} files in {len(families)} families"
    elif args.registry:
        _error("E_FONT_MISSING", f"registry not found: {registry_path}")
        return EXIT_NO_INPUT

    text = render(coverage)
    current = _read_text(out)
    if args.check:
        status = "in sync" if current == text else ("missing" if current is None else "differs from the fonts")
    elif current == text:
        status = "already current"
    else:
        try:
            _write_atomic(out, text)
        except OSError as exc:
            _error("E_ABORTED", f"cannot write {exc.filename}: {exc.strerror}")
            return EXIT_CANT_WRITE
        status = "written"

    drift = args.check and current != text
    ok = not drift and not problems
    if args.format == "json":
        print(_report_json(fonts_dir, out, status, coverage, checked, problems, ok))
    else:
        print(_report_text(fonts_dir, out, status, coverage, checked, problems))
    return EXIT_OK if ok else EXIT_DRIFT


if __name__ == "__main__":
    sys.exit(main())
