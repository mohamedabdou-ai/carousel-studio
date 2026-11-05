#!/usr/bin/env python3
"""build_studio.py - inline the Studio (or Brand Home) into ONE self-contained HTML page.

The page holds the runtime chunks (the nine of 1.0 and, once built, the four of the visual language), all shipped presets, the
archetype partials with the primitives sheet appended into their layout sheet, the rule data, the schemas, the fonts (unmodified files,
base64), the UI strings, the optional icon, art and scene data blocks and the post data. It makes no network request on load, and the
Artifact tool wraps the file in its own document skeleton, so the output is a page fragment (title, meta, styles, content), not a full document.

Usage (CONTRACT 9.2):
  build_studio.py --spec FILE [--brand FILE] (--view script|design | --brand-home) [--mode full|shell]
                  [--plan FILE] [--ideas FILE] [--posts FILE] [--ui-dialect eg|gulf|levant|msa-white|en]
                  [--fonts auto|current] [--credit-free] [--no-validate] [--out FILE] [--format text|json]
Extras: --standalone wraps the fragment in a full HTML document for local use (the render lane), --skill-root DIR builds from another
skill folder (tests). Exit codes: 0 ok, 2 invalid input, 64 usage, 65 unparseable data, 66 missing file, 70 internal, 73 cannot write.
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import html
import json
import os
import re
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

try:  # _cs belongs to the validation package; the builder must still start without it
    from _cs import paths as _cs_paths  # type: ignore

    _cs_paths.ensure_utf8_stdio()
except Exception:  # pragma: no cover - exercised only when _cs is absent
    for _stream in (sys.stdout, sys.stderr):
        try:
            _stream.reconfigure(encoding="utf-8")
        except Exception:
            pass

ENGINE = "cs-1.1.1"
# IS-1 load order. The four visual chunks follow qa and ui because they register into CS.qa._ and CS.ui._ at load. The nine of 1.0 must exist;
# the four of 1.1 are embedded when their file exists, so a tree built before them still makes a page that behaves as 1.0 (the absence rule),
# and the build says so on stderr instead of failing.
BASE_CHUNKS = ["core", "qa", "paint", "motion", "hf", "mp4", "export", "ui", "brandbook"]
VISUAL_CHUNKS = ["art", "visual", "qa-visual", "visual-ui"]
CHUNKS = BASE_CHUNKS + VISUAL_CHUNKS
# IS-4: optional data blocks as (block id, path under the skill root, cap in KiB). A block is embedded when its file exists, so partial trees
# build; a file over its cap only warns (the owner's own test holds the cap), a file that is not JSON stops the build.
DATA_BLOCKS = [
    ("cs-icon-pack", "data/icons/pack.json", 85), ("cs-icon-index", "data/icons/index.json", 70), ("cs-icon-concepts", "data/icons/concepts.json", 140),
    ("cs-icon-objects", "data/icons/objects.json", 60), ("cs-icon-stem", "data/icons/stem.json", 10), ("cs-emoji-map", "data/icons/emoji-map.json", 2),
    ("cs-art-marks", "data/art/marks.json", 20), ("cs-art-direction", "data/art-direction.json", 60), ("cs-art-scenes", "data/art/scenes.json", 40),
    ("cs-free-design", "data/free-design.json", 12),
]
VISUAL_STRINGS = "runtime/ui-strings-visual.json"
PRIMITIVES = "templates/primitives.css"
PRIMITIVES_CAP = 30 * 1024            # rule A11: the sheet is serialised into every painted frame
ARCHETYPE_STYLE = re.compile(r'<style id="cs-archetype-css"[^>]*>(.*?)</style>', re.S)
DIALECTS = ["eg", "gulf", "levant", "msa-white", "en"]
SCHEMA_KINDS = ["brand", "spec", "preset", "occasion", "hook", "plan", "qa-report"]
UI_FONT_IDS = ["readex-pro", "alexandria"]
MIB = 1024 * 1024
LIMIT_WARN = 12 * MIB
LIMIT_FAIL = 15 * MIB
CHUNK_LIMIT = 200 * 1024
FONT_MIME = {".ttf": ("font/ttf", "truetype"), ".otf": ("font/otf", "opentype"), ".woff": ("font/woff", "woff"), ".woff2": ("font/woff2", "woff2")}
# The one notice line at the top of the page. NOTICE_TEXT in src/ui/serialize.js (the Studio's own save-as-HTML) repeats it byte for byte;
# test_notice_agreement holds the two together, and the licence texts behind the names are in the NOTICE file at the repository root.
NOTICE = ("Carousel Studio, Apache-2.0. Fonts: SIL OFL 1.1. Icons: Lucide, ISC; Feather and Tabler, MIT. "
          "MP4 muxing: mediabunny, MPL-2.0 (loaded only when a video is exported).")

EX_OK, EX_INVALID, EX_USAGE, EX_DATA, EX_MISSING, EX_INTERNAL, EX_WRITE = 0, 2, 64, 65, 66, 70, 73


class BuildError(Exception):
    """A failure with a contract error code and process exit code."""

    def __init__(self, code: str, message: str, exit_code: int):
        super().__init__(message)
        self.code = code
        self.exit_code = exit_code


# ---- input helpers -----------------------------------------------------------------------------------------------------------------

def read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except FileNotFoundError:
        raise BuildError("E_USAGE", f"file not found: {path}", EX_MISSING)
    except UnicodeDecodeError as exc:
        raise BuildError("E_SCHEMA", f"{path} is not valid UTF-8 ({exc})", EX_DATA)
    except OSError as exc:
        raise BuildError("E_USAGE", f"cannot read {path}: {exc}", EX_MISSING)


def read_json(path: Path):
    text = read_text(path)
    if text.startswith("\ufeff"):
        text = text[1:]
    try:
        return json.loads(text)
    except json.JSONDecodeError as exc:
        raise BuildError("E_SCHEMA", f"{path} is not valid JSON ({exc})", EX_DATA)


def script_json(value) -> str:
    """JSON for a <script type="application/json"> block (CONTRACT 8.4). '<!--' uses the valid escape \\u0021 (the draft's '<\\!--' is not JSON)."""
    text = json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    return (text.replace("</", "<\\/").replace("<!--", "<\\u0021--").replace("\u2028", "\\u2028").replace("\u2029", "\\u2029"))


def json_block(block_id: str, value) -> str:
    return f'<script type="application/json" id="{block_id}">{script_json(value)}</script>'


def js_safe(text: str, label: str, allow_markers: bool = False) -> str:
    """Refuse script text that would end or confuse its <script> element.

    allow_markers lets balanced HTML comments through (the cover.hf.html template carries '<!--CS:FONTS-->' style markers that
    CS.motion.hf.composition fills in); an unbalanced comment opener would swallow the closing tag, so that is still refused."""
    if re.search(r"</script", text, re.I):
        raise BuildError("E_USAGE", f"{label} contains a closing script tag; rebuild the runtime chunk", EX_INTERNAL)
    if "<!--" in text and not (allow_markers and text.count("<!--") == text.count("-->")):
        raise BuildError("E_USAGE", f"{label} contains an HTML comment opener; rebuild the runtime chunk", EX_INTERNAL)
    return text


def html_comment(text: str) -> str:
    return "<!-- " + text.replace("--", "- -") + " -->"


# ---- skill data --------------------------------------------------------------------------------------------------------------------

def pick_ui_dialect(args, spec, brand, locale_defaults) -> str:
    if args.ui_dialect:
        return args.ui_dialect
    if spec:
        loc = spec.get("locale", {})
        if loc.get("uiDialect") in DIALECTS:
            return loc["uiDialect"]
    if brand:
        loc = brand.get("locale", {})
        if loc.get("uiDialect") in DIALECTS:
            return loc["uiDialect"]
    dialect = (spec or {}).get("locale", {}).get("dialect") or (brand or {}).get("locale", {}).get("dialect")
    info = (locale_defaults.get("dialects") or {}).get(dialect or "", {})
    return info.get("uiDialect") if info.get("uiDialect") in DIALECTS else "msa-white"


def load_ui_strings(root: Path, credit_free: bool) -> dict:
    """ui-strings.json plus, when the file exists, ui-strings-visual.json (same shape). The two must not define the same key."""
    doc = read_json(root / "runtime" / "ui-strings.json")
    strings = dict(doc.get("strings", {}))
    extra_path = root / VISUAL_STRINGS
    if extra_path.is_file():
        extra = read_json(extra_path)
        added = extra.get("strings") if isinstance(extra, dict) else None
        if not isinstance(added, dict):
            raise BuildError("E_SCHEMA", f"{VISUAL_STRINGS} needs a \"strings\" object like ui-strings.json", EX_DATA)
        clash = sorted(key for key in added if key in strings)
        if clash:
            more = f" and {len(clash) - 5} more" if len(clash) > 5 else ""
            raise BuildError("E_SCHEMA", f"{VISUAL_STRINGS} redefines keys of ui-strings.json: {', '.join(clash[:5])}{more}", EX_INVALID)
        strings.update(added)
    if credit_free:
        strings = {k: v for k, v in strings.items() if not k.startswith("about.")}
    doc = dict(doc)
    doc["strings"] = strings
    return doc


def ui_text(strings: dict, key: str, dialect: str) -> str:
    entry = strings.get(key, {})
    return entry.get(dialect) or entry.get("msa-white") or entry.get("en") or key


def fill_template(template: str, strings: dict, dialect: str, brand_name: str = "") -> str:
    """Substitute {{dir}} {{lang}} {{brand}} {{t:key}} (HTML text) and {{js:key}} (JS string body)."""
    lang = "en" if dialect == "en" else "ar"
    out = template.replace("{{dir}}", "ltr" if lang == "en" else "rtl").replace("{{lang}}", lang).replace("{{brand}}", html.escape(brand_name, quote=False))
    out = re.sub(r"\{\{t:([a-z0-9.\-]+)\}\}", lambda m: html.escape(ui_text(strings, m.group(1), dialect), quote=False), out)
    out = re.sub(r"\{\{js:([a-z0-9.\-]+)\}\}", lambda m: json.dumps(ui_text(strings, m.group(1), dialect), ensure_ascii=False)[1:-1], out)
    return out


def load_presets(root: Path):
    index = read_json(root / "styles" / "index.json")
    presets, decors, order = [], [], []
    every = os.environ.get("CS_ALL_PRESETS") == "1"   # tests only: also load the presets held back for a later release
    for entry in index.get("presets", []):
        if entry.get("ships", "1.0") != "1.0" and not every:
            continue
        directory = root / "styles" / entry["dir"]
        preset = read_json(directory / "preset.json")
        css = read_text(directory / "decor.css")
        presets.append(preset)
        decors.append((preset["id"], css))
        order.append(entry)
    return index, presets, decors, order


def load_occasions(root: Path):
    path = root / "occasions" / "index.json"
    if not path.exists():
        return []
    packs = []
    for entry in read_json(path).get("packs", []):
        packs.append(read_json(root / "occasions" / entry["dir"] / "pack.json"))
    return packs


def load_rules(root: Path) -> dict:
    data = root / "data"
    dialects = {code: read_json(data / "dialects" / f"{code}.json") for code in DIALECTS}
    return {
        "qaRules": read_json(data / "qa-rules.json"),
        "copy": read_json(data / "rules" / "copy.json"),
        "ortho": read_json(data / "rules" / "ortho.json"),
        "dialects": dialects,
        "platform": read_json(data / "platform-instagram.json"),
        "locale": read_json(data / "locale-defaults.json"),
        "postingGuide": read_json(data / "posting-guide.json") if (data / "posting-guide.json").is_file() else None,
    }


def load_schemas(root: Path) -> dict:
    return {kind: read_json(root / "schemas" / f"{kind}.schema.json") for kind in SCHEMA_KINDS}


# ---- fonts -------------------------------------------------------------------------------------------------------------------------

def preset_font_ids(preset: dict, index_entry: dict | None) -> list[str]:
    if index_entry and index_entry.get("fonts"):
        return list(index_entry["fonts"])
    ids = []
    for role in ("display", "heading", "body", "latin"):
        fam = preset.get("type", {}).get(role, {}).get("family")
        if fam and fam not in ids:
            ids.append(fam)
    return ids


def wanted_fonts(mode: str, spec, brand, presets, order) -> list[str]:
    ids: list[str] = []

    def add(font_id):
        if font_id and font_id not in ids:
            ids.append(font_id)

    if mode == "current" and spec:
        current = str(spec.get("style", {}).get("presetId", "")).split("@")[0]
        for preset, entry in zip(presets, order):
            if preset["id"] == current:
                for font_id in preset_font_ids(preset, entry):
                    add(font_id)
    else:
        for preset, entry in zip(presets, order):
            for font_id in preset_font_ids(preset, entry):
                add(font_id)
    fonts = ((brand or {}).get("visual") or {}).get("fonts") or {}
    for key in ("display", "body", "latin"):
        add(fonts.get(key))
    return ids


def font_face_css(family: dict, fonts_dir: Path, check_hash: bool) -> str:
    rules = []
    for item in family.get("files", []):
        path = fonts_dir / item["file"]
        if not path.exists():
            raise BuildError("E_FONT_MISSING", f"font file missing: {path}", EX_MISSING)
        data = path.read_bytes()
        digest = item.get("sha256")
        if check_hash and digest and hashlib.sha256(data).hexdigest() != digest.lower():
            raise BuildError("E_FONT_MISSING", f"{item['file']} does not match its registry sha256 (fonts must stay unmodified)", EX_INVALID)
        mime, fmt = FONT_MIME.get(path.suffix.lower(), ("font/ttf", "truetype"))
        wght = item.get("wght", 400)
        weight = f"{wght[0]} {wght[1]}" if isinstance(wght, (list, tuple)) and len(wght) == 2 else str(wght if not isinstance(wght, (list, tuple)) else wght[0])
        style = item.get("style", "normal")
        rules.append(
            f'@font-face{{font-family:"{family["family"]}";font-style:{style};font-weight:{weight};font-display:block;'
            f'src:url(data:{mime};base64,{base64.b64encode(data).decode("ascii")}) format("{fmt}")}}'
        )
    return "\n".join(rules)


def build_fonts(root: Path, ids: list[str], check_hash: bool):
    fonts_dir = root / "fonts"
    registry = read_json(fonts_dir / "registry.json")
    coverage_path = fonts_dir / "coverage.json"
    coverage = read_json(coverage_path) if coverage_path.exists() else {"schemaVersion": 1, "families": {}}
    by_id = {fam["id"]: fam for fam in registry.get("families", [])}
    used, css = [], []
    # fonts the presets and the brand name are required; the Studio's own chrome fonts are added when the registry has them
    for font_id in ids + [f for f in UI_FONT_IDS if f not in ids and f in by_id]:
        fam = by_id.get(font_id)
        if not fam:
            raise BuildError("E_FONT_MISSING", f"font id '{font_id}' is not in fonts/registry.json", EX_INVALID)
        css.append(font_face_css(fam, fonts_dir, check_hash))
        used.append(font_id)
    meta = {
        "registry": {**{k: v for k, v in registry.items() if k != "families"}, "families": [by_id[i] for i in used]},
        "coverage": {**{k: v for k, v in coverage.items() if k != "families"}, "families": {i: coverage.get("families", {}).get(i) for i in used if i in coverage.get("families", {})}},
    }
    return "\n".join(css), meta, used


# ---- validation --------------------------------------------------------------------------------------------------------------------

def validate_docs(pairs):
    try:
        from _cs import schema  # type: ignore
    except Exception as exc:
        raise BuildError("E_SCHEMA", f"schema validation needs the _cs package ({exc}); pass --no-validate to skip", EX_INTERNAL)
    problems = []
    for kind, doc in pairs:
        for err in schema.validate_named(kind, doc):
            problems.append(f"{kind}{err['path']}: {err['message']}")
    if problems:
        shown = "\n  ".join(problems[:12])
        more = f"\n  ... and {len(problems) - 12} more" if len(problems) > 12 else ""
        raise BuildError("E_SCHEMA", f"input does not match its schema:\n  {shown}{more}", EX_INVALID)


# ---- assembly ----------------------------------------------------------------------------------------------------------------------

def icon_symbols(root: Path) -> str:
    svg = read_text(root / "runtime" / "icons.svg")
    match = re.search(r"<svg\b[^>]*>(.*)</svg>", svg, re.S)
    if not match:
        raise BuildError("E_SCHEMA", "runtime/icons.svg has no <svg> root", EX_DATA)
    return match.group(1).strip()


def read_chunks(root: Path, warnings: list[str] | None = None) -> list[tuple[str, str]]:
    """The runtime chunks in load order. A missing 1.0 chunk is an error; a missing visual chunk is a warning (the page then behaves as 1.0)."""
    out, absent = [], []
    for name in CHUNKS:
        path = root / "runtime" / f"cs-{name}.js"
        if name in VISUAL_CHUNKS and not path.is_file():
            absent.append(path.name)
            continue
        text = read_text(path)
        if len(text.encode("utf-8")) > CHUNK_LIMIT:
            raise BuildError("E_USAGE", f"{path.name} is larger than 200 KiB", EX_INVALID)
        out.append((name, js_safe(text, path.name)))
    if absent and warnings is not None:
        warnings.append(f"runtime/{', '.join(absent)} not built yet, so the page is made without {'it' if len(absent) == 1 else 'them'} and behaves as 1.0 (run node tools/build.mjs)")
    return out


def read_data_blocks(root: Path, warnings: list[str] | None = None) -> list[tuple[str, object]]:
    """The optional data blocks of IS-4 whose file exists, in table order, as (block id, parsed JSON)."""
    out = []
    for block_id, rel, cap_kib in DATA_BLOCKS:
        path = root / rel
        if not path.is_file():
            continue
        size = path.stat().st_size
        if warnings is not None and size > cap_kib * 1024:
            warnings.append(f"{rel} is {size / 1024:.1f} KiB; its cap is {cap_kib} KiB")
        out.append((block_id, read_json(path)))
    return out


def load_primitives(root: Path) -> str | None:
    """templates/primitives.css (rule A11) or None when it does not exist yet. It travels inside a <style>, so it must not close it."""
    path = root / PRIMITIVES
    if not path.is_file():
        return None
    text = read_text(path).lstrip("\ufeff").strip()
    size = len(text.encode("utf-8"))
    if size > PRIMITIVES_CAP:
        raise BuildError("E_USAGE", f"{PRIMITIVES} is {size / 1024:.1f} KiB; the cap is {PRIMITIVES_CAP // 1024} KiB (the sheet is serialised into every painted frame)", EX_INVALID)
    if re.search(r"</style", text, re.I) or "<!--" in text:
        raise BuildError("E_USAGE", f"{PRIMITIVES} contains a closing style tag or an HTML comment opener", EX_INVALID)
    return text + "\n" if text else None


def append_primitives(archetypes: str, css: str | None) -> str:
    """Put the primitives sheet at the end of the existing #cs-archetype-css element (rule A11), so the registry, the painter and the
    serializer, which all read that one element, need no change. Appending twice is a no-op."""
    if not css:
        return archetypes
    match = ARCHETYPE_STYLE.search(archetypes)
    if not match:
        raise BuildError("E_USAGE", f"templates/archetypes.html has no <style id=\"cs-archetype-css\"> to append {PRIMITIVES} to", EX_INTERNAL)
    body = match.group(1)
    if css.strip() in body:
        return archetypes
    end = match.end(1)
    return archetypes[:end] + ("" if body.endswith("\n") else "\n") + css + archetypes[end:]


def build_page(args) -> tuple[str, dict]:
    root = Path(args.skill_root).resolve() if args.skill_root else Path(__file__).resolve().parent.parent
    home = bool(args.brand_home)
    spec = read_json(Path(args.spec)) if args.spec else None
    brand = read_json(Path(args.brand)) if args.brand else None
    plan = read_json(Path(args.plan)) if args.plan else None
    ideas = read_json(Path(args.ideas)) if args.ideas else (plan or {}).get("ideaBank", [])
    posts = read_json(Path(args.posts)) if args.posts else []
    if home and not brand:
        raise BuildError("E_USAGE", "--brand-home needs --brand", EX_USAGE)
    if not home and not spec:
        raise BuildError("E_USAGE", "--spec is required unless --brand-home is used", EX_USAGE)
    if args.mode == "shell":
        raise BuildError("E_USAGE", "--mode shell (the thin runtime-from-CDN shell) is not available in v1; use --mode full", EX_USAGE)

    if not home:
        if not isinstance(spec.get("slides"), list) or not spec["slides"]:
            raise BuildError("E_SCHEMA", "the Studio needs at least one slide in spec.slides (a stub at checkpoint 'angle' cannot be opened)", EX_INVALID)
    if not args.no_validate:
        pairs = []
        if spec is not None:
            pairs.append(("spec", spec))
        if brand is not None:
            pairs.append(("brand", brand))
        if plan is not None:
            pairs.append(("plan", plan))
        validate_docs(pairs)

    rules = load_rules(root)
    strings_doc = load_ui_strings(root, args.credit_free)
    dialect = pick_ui_dialect(args, spec, brand, rules["locale"])
    index, presets, decors, order = load_presets(root)
    if not presets:
        raise BuildError("E_USAGE", "styles/index.json lists no v1 presets", EX_INVALID)
    wanted = str(((spec or {}).get("style") or {}).get("presetId", "")).split("@")[0]
    if wanted and wanted not in [p["id"] for p in presets]:
        raise BuildError("E_SCHEMA", f"style.presetId '{wanted}' is not in this release; use one of: {', '.join(p['id'] for p in presets)} "
                         "(references/presets.md lists the stand-ins)", EX_INVALID)
    font_ids = wanted_fonts(args.fonts, spec, brand, presets, order)
    fonts_css, fonts_meta, used_fonts = build_fonts(root, font_ids, check_hash=not args.no_validate)
    warnings: list[str] = []
    chunks = read_chunks(root, warnings)
    data_blocks = read_data_blocks(root, warnings)
    primitives = load_primitives(root)
    studio_css = read_text(root / "runtime" / "studio.css")
    templates = root / "templates"
    template = read_text(templates / ("brand-home.html" if home else "studio.html"))
    archetypes = read_text(templates / "archetypes.html")
    hf_template = read_text(templates / "cover.hf.html")
    archetype_sheet = append_primitives(archetypes, primitives)

    build_hash = hashlib.sha256()
    for part in (template, studio_css, archetypes, hf_template, json.dumps(strings_doc, sort_keys=True), "".join(text for _, text in chunks), "".join(css for _, css in decors)):
        build_hash.update(part.encode("utf-8"))
    # what the 1.1 data adds joins the hash only when it exists, so a tree without it keeps the 1.0 buildId
    for extra in ([primitives] if primitives else []) + [json.dumps(value, sort_keys=True) for _, value in data_blocks]:
        build_hash.update(extra.encode("utf-8"))
    epoch = os.environ.get("SOURCE_DATE_EPOCH")
    built = datetime.fromtimestamp(int(epoch), tz=timezone.utc) if epoch else datetime.now(timezone.utc)
    capabilities = {"downloads": True, "assets": {}, "user": {}, "artifact": {}}
    if not home:
        capabilities["sample"] = {}
    config = {
        "engine": ENGINE, "view": "brand-home" if home else args.view, "mode": args.mode, "lane": "studio", "uiDialect": dialect,
        "buildId": build_hash.hexdigest()[:12], "builtAt": built.strftime("%Y-%m-%dT%H:%M:%SZ"), "creditFree": bool(args.credit_free),
        "fonts": used_fonts, "presets": [p["id"] for p in presets], "capabilities": sorted(capabilities),
    }

    blocks = [json_block("cs-config", config)]
    if spec is not None:
        blocks.append(json_block("cs-spec", spec))
    blocks.append(json_block("cs-brand", brand))
    if home:
        blocks += [json_block("cs-plan", plan), json_block("cs-ideas", ideas), json_block("cs-posts", posts)]
    blocks.append(json_block("cs-presets", presets))
    for preset_id, css in decors:
        blocks.append(f'<style data-cs-decor="{preset_id}">{css}</style>')
    blocks.append(archetype_sheet.strip())
    blocks += [
        json_block("cs-occasions", load_occasions(root)), json_block("cs-rules", rules), json_block("cs-schemas", load_schemas(root)),
        json_block("cs-fonts-meta", fonts_meta), json_block("cs-ui-strings", strings_doc),
    ]
    blocks += [json_block(block_id, value) for block_id, value in data_blocks]
    blocks += [
        '<script type="text/plain" id="cs-hf-template">' + js_safe(hf_template.replace("</", "<\\/"), "cover.hf.html", allow_markers=True) + "</script>",
    ]
    scripts = [f'<script id="cs-chunk-{name}">\n{text}</script>' for name, text in chunks]

    page = fill_template(template, strings_doc["strings"], dialect, (brand or {}).get("name", ""))
    for marker, value in (
        ("<!--CS:NOTICE-->", html_comment(NOTICE)), ("<!--CS:STUDIO_CSS-->", studio_css), ("<!--CS:ICONS-->", icon_symbols(root)),
        ("<!--CS:FONTS-->", fonts_css), ("<!--CS:BLOCKS-->", "\n".join(blocks)), ("<!--CS:CHUNKS-->", "\n".join(scripts)),
    ):
        if marker not in page:
            raise BuildError("E_USAGE", f"template is missing the marker {marker}", EX_INTERNAL)
        page = page.replace(marker, value)
    if not page.endswith("\n"):
        page += "\n"
    if args.standalone:
        lang = "en" if dialect == "en" else "ar"
        page = (f'<!doctype html>\n<html lang="{lang}" dir="{"ltr" if lang == "en" else "rtl"}">\n<head><meta charset="utf-8">'
                '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
                "<style>body{margin:0}</style></head>\n<body>\n" + page + "</body>\n</html>\n")

    info = {
        "view": config["view"], "rev": (spec or {}).get("rev"), "fonts": used_fonts, "presets": config["presets"], "buildId": config["buildId"],
        "capabilities": capabilities, "chunks": [name for name, _ in chunks], "dataBlocks": [block_id for block_id, _ in data_blocks],
        "primitivesBytes": len(primitives.encode("utf-8")) if primitives else 0, "warnings": warnings,
    }
    return page, info


def write_atomic(path: Path, text: str) -> None:
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        fd, tmp = tempfile.mkstemp(prefix=path.name + ".", suffix=".tmp", dir=str(path.parent))
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as handle:
            handle.write(text)
        os.replace(tmp, path)
    except OSError as exc:
        raise BuildError("E_USAGE", f"cannot write {path}: {exc}", EX_WRITE)


class Parser(argparse.ArgumentParser):
    def error(self, message):  # argparse would exit 2; the contract says 64
        raise BuildError("E_USAGE", message, EX_USAGE)


def make_parser() -> argparse.ArgumentParser:
    p = Parser(prog="build_studio.py", description="Build the self-contained Studio or Brand Home page.")
    p.add_argument("--spec", help="spec.json of the post (not needed with --brand-home)")
    p.add_argument("--brand", help="brand.json (logo data URI included)")
    group = p.add_mutually_exclusive_group()
    group.add_argument("--view", choices=["script", "design"], help="which screen opens first")
    group.add_argument("--brand-home", action="store_true", help="build Brand Home instead of a Post Studio")
    p.add_argument("--mode", choices=["full", "shell"], default="full")
    p.add_argument("--plan", help="plan-YYYY-MM.json (Brand Home)")
    p.add_argument("--ideas", help="ideas JSON array (Brand Home); defaults to plan.ideaBank")
    p.add_argument("--posts", help="posts JSON array (Brand Home)")
    p.add_argument("--ui-dialect", choices=DIALECTS, help="language of the Studio chrome")
    p.add_argument("--fonts", choices=["auto", "current"], default="auto", help="auto = fonts of every shipped preset; current = this post's preset only")
    p.add_argument("--credit-free", action="store_true", help="omit the About/credit strings (used for the kit's studio-source.html)")
    p.add_argument("--no-validate", action="store_true", help="skip schema and font-hash checks")
    p.add_argument("--out", help="output file (default studio.html or brand-home.html in the current folder)")
    p.add_argument("--format", choices=["text", "json"], default="text")
    p.add_argument("--standalone", action="store_true", help="wrap the page in a full HTML document (local use; do not publish this form)")
    p.add_argument("--skill-root", help="build from another carousel-design folder (tests)")
    return p


def main(argv=None) -> int:
    parser = make_parser()
    try:
        args = parser.parse_args(argv)
        if not args.brand_home and not args.view:
            raise BuildError("E_USAGE", "one of --view or --brand-home is required", EX_USAGE)
        page, info = build_page(args)
        out = Path(args.out or ("brand-home.html" if args.brand_home else "studio.html"))
        size = len(page.encode("utf-8"))
        if size > LIMIT_FAIL:
            raise BuildError("E_USAGE", f"the page is {size / MIB:.1f} MiB; the hard limit is 15 MiB (try --fonts current)", EX_INVALID)
        write_atomic(out, page)
    except BuildError as exc:
        print(f"cs-error: {exc.code}: {exc}", file=sys.stderr)
        return exc.exit_code
    except Exception as exc:  # pragma: no cover - defensive
        print(f"cs-error: E_USAGE: unexpected failure: {exc!r}", file=sys.stderr)
        return EX_INTERNAL
    if size > LIMIT_WARN:
        print(f"cs-warning: the page is {size / MIB:.1f} MiB (target 12 MiB); consider --fonts current", file=sys.stderr)
    for message in info["warnings"]:
        print(f"cs-warning: {message}", file=sys.stderr)
    result = {"out": str(out), "bytes": size, **info}
    if args.format == "json":
        print(json.dumps(result, ensure_ascii=False))
    else:
        print(f"تم بناء الصفحة: {out} ({size / MIB:.1f} MiB)")
        print(f"view={info['view']} rev={info['rev']} fonts={len(info['fonts'])} presets={len(info['presets'])} chunks={len(info['chunks'])} build={info['buildId']}")
        print("publish with capabilities: " + json.dumps(info["capabilities"]))
    return EX_OK


if __name__ == "__main__":
    sys.exit(main())
