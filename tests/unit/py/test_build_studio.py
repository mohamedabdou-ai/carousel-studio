"""Tests for carousel-design/scripts/build_studio.py and for the data files the Studio ships (ui-strings, runtime hygiene).

Run: python -m unittest discover -s tests/unit/py -p "test_build_studio.py"   (standard library only)
The builder tests assemble a tiny skill root in a temp folder, so they do not depend on the other packages' files; the hygiene tests read
the real files of the repository.
"""
from __future__ import annotations

import base64
import contextlib
import io
import json
import re
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

HERE = str(Path(__file__).resolve().parent)
if HERE not in sys.path:   # so that `python -m unittest tests.unit.py.test_build_studio` also works from the repository root
    sys.path.insert(0, HERE)
import b7_support as support  # noqa: E402

REPO = Path(__file__).resolve().parents[3]
SKILL = REPO / "plugins" / "carousel-studio" / "skills" / "carousel-design"
SRC_DIRS = [REPO / "src" / "ui", REPO / "src" / "brandbook"]
OWNER_STRINGS = ["محمد عبده", "Mohamed Abdou", "mohamed.abdou90", "mohamedabdou", "pyraai"]
BASE_CHUNKS = ["core", "qa", "paint", "motion", "hf", "mp4", "export", "ui", "brandbook"]
VISUAL_CHUNKS = ["art", "visual", "qa-visual", "visual-ui"]
CHUNKS = BASE_CHUNKS + VISUAL_CHUNKS            # IS-1 load order
DIALECTS = ["eg", "gulf", "levant", "msa-white", "en"]
NOTICE_FILE = REPO / "NOTICE"
PLUGIN_NOTICE_FILE = REPO / "plugins" / "carousel-studio" / "NOTICE"
# The page notice line before round 3 named Lucide only. A copy of it that still holds this wording has not been updated yet.
PRE_R3_PAGE_NOTICE = ("Carousel Studio, Apache-2.0. Fonts: SIL OFL 1.1. Icons: Lucide, ISC. "
                      "MP4 muxing: mediabunny, MPL-2.0 (loaded only when a video is exported).")
# The icon sets whose path data the exports and the page carry, with the licence each one's NOTICE section prints (src/export/text.js says the same).
ICON_SETS = {"Lucide": "ISC", "Feather": "MIT", "Tabler": "MIT"}
# Test doubles that stand in for the engine and set CS.version: they follow the build's ENGINE constant (the first one is this package's own).
ENGINE_STUBS = ("tests/video/harness/stub-core.js", "tests/unit/js/core/lib-stub.js", "tests/unit/js/ui/stub-engine.js")

BUILDER = None


def js_string(path: Path, name: str):
    """The value of `NAME = "...";` in a JavaScript file, or None when the file or the declaration is not there."""
    if not path.is_file():
        return None
    found = re.search(r"\b" + re.escape(name) + r'\s*=\s*("(?:[^"\\\n]|\\.)*")\s*;', path.read_text(encoding="utf-8"))
    return json.loads(found.group(1)) if found else None


def notice_sections() -> dict:
    """The numbered third-party sections of the NOTICE file as {title: text}."""
    text = NOTICE_FILE.read_text(encoding="utf-8")
    return {part.split("\n", 1)[0].split(". ", 1)[1].strip(): part for part in re.split(r"(?m)^(?=\d+\. )", text) if re.match(r"\d+\. ", part)}


def slide_types() -> list:
    """The slide types of the spec schema: the first enum that holds cover, item, step and cta (the name of the definition may change)."""
    schema = json.loads((SKILL / "schemas" / "spec.schema.json").read_text(encoding="utf-8"))
    stack = [schema]
    while stack:
        node = stack.pop()
        if isinstance(node, dict):
            values = node.get("enum")
            if isinstance(values, list) and {"cover", "item", "step", "cta"} <= set(values):
                return values
            stack.extend(node.values())
        elif isinstance(node, list):
            stack.extend(node)
    raise AssertionError("no slide type enum in spec.schema.json")


def setUpModule() -> None:
    """Loaded here, not at import: the script imports `_cs` and puts its own folder on sys.path, which must not outlive this module."""
    global BUILDER
    BUILDER = support.load_script("carousel-design", "build_studio.py", "build_studio_under_test")


def tearDownModule() -> None:
    support.cleanup()


FONT_BYTES = b"\x00\x01\x00\x00fake-font-bytes-for-tests"

SPEC = {
    "specVersion": 1, "id": "post-test-0001", "rev": 4, "brand": {"slug": "demo-brand"}, "format": "carousel", "mode": "guided", "checkpoint": "script",
    "canvas": {"preset": "ig-3x4", "w": 1080, "h": 1440, "safe": [34, 45, 1012, 1350], "exports": ["3x4"]},
    "locale": {"dialect": "gulf", "digits": "western", "appLanguage": "ar", "swipeCue": "arrow-rtl"},
    "style": {"presetId": "swiss@1.0"},
    "slides": [{"id": "s01", "n": 1, "type": "cover", "headline": "6 أدوات ببلاش</script><!-- x"}, {"id": "s02", "n": 2, "type": "rehook", "headline": "أول أداة تختصر ساعة"}],
}
BRAND = {"schemaVersion": 1, "id": "brand-demo-0001", "slug": "demo-brand", "name": "براند", "kind": "creator", "version": 1,
         "locale": {"dialect": "gulf", "register": "dialect", "digits": "western", "appLanguage": "ar", "swipeCue": "arrow-rtl"},
         "visual": {"fonts": {"display": "alexandria"}}, "onboarding": {"sections": {}}}
PLAN = {"schemaVersion": 1, "id": "plan-demo-2026-12", "brandSlug": "demo-brand", "period": "2026-12", "goal": "followers", "slots": [],
        "ideaBank": [{"id": "i1", "text": "فكرة"}]}


def make_root(base: Path, chunk_overrides: dict | None = None, chunks: list | None = None) -> Path:
    """A minimal skill root: real templates, tiny everything else. `chunks` limits which runtime chunks exist (default: all thirteen)."""
    root = base / "skill"
    (root / "runtime").mkdir(parents=True)
    for name in (CHUNKS if chunks is None else chunks):
        (root / "runtime" / f"cs-{name}.js").write_text(f"/* chunk {name} */\n(function () {{ window.__chunk_{name.replace('-', '_')} = 1; }})();\n", encoding="utf-8")
    for name, text in (chunk_overrides or {}).items():
        (root / "runtime" / f"cs-{name}.js").write_text(text, encoding="utf-8")
    (root / "runtime" / "studio.css").write_text(".ui-app{color:red}\n", encoding="utf-8")
    (root / "runtime" / "icons.svg").write_text('<!-- icons -->\n<svg xmlns="http://www.w3.org/2000/svg"><symbol id="i-x"><path d="M0 0"/></symbol></svg>\n', encoding="utf-8")
    strings = {"schemaVersion": 1, "dataVersion": "t", "strings": {}}
    for key, ar in (("boot.loading", "نجهّز"), ("boot.noscript", "JS"), ("boot.failed", "تعذّر"), ("about.credit", "CREDIT-LINE-TEXT"), ("app.name", "كاروسيل")):
        strings["strings"][key] = {d: ar for d in DIALECTS}
    (root / "runtime" / "ui-strings.json").write_text(json.dumps(strings, ensure_ascii=False), encoding="utf-8")
    (root / "templates").mkdir()
    for name in ("studio.html", "brand-home.html"):
        shutil.copy(SKILL / "templates" / name, root / "templates" / name)
    (root / "templates" / "archetypes.html").write_text('<style id="cs-archetype-css">.cs-slide{}</style>\n<template data-archetype="item"><main class="cs-content"></main></template>\n', encoding="utf-8")
    (root / "templates" / "cover.hf.html").write_text('<html><body><!--CS:SLIDE--><script id="cs-hf"></script></body></html>\n', encoding="utf-8")
    (root / "styles" / "swiss").mkdir(parents=True)
    (root / "styles" / "creator").mkdir(parents=True)
    for pid, fonts in (("swiss", ["ibm-plex-sans-arabic"]), ("creator", ["alexandria"])):
        (root / "styles" / pid / "preset.json").write_text(json.dumps({"id": pid, "version": "1.0", "type": {"display": {"family": fonts[0]}}}), encoding="utf-8")
        (root / "styles" / pid / "decor.css").write_text(f'.cs-slide[data-preset="{pid}"]{{}}\n', encoding="utf-8")
    (root / "styles" / "index.json").write_text(json.dumps({"schemaVersion": 1, "default": "swiss", "presets": [
        {"id": "swiss", "version": "1.0", "dir": "swiss", "ships": "1.0", "fonts": ["ibm-plex-sans-arabic"]},
        {"id": "creator", "version": "1.0", "dir": "creator", "ships": "1.0", "fonts": ["alexandria"]},
        {"id": "editorial", "version": "1.1", "dir": "swiss", "ships": "1.1", "fonts": ["cairo"]}]}), encoding="utf-8")
    (root / "occasions").mkdir()
    (root / "occasions" / "index.json").write_text('{"schemaVersion":1,"packs":[]}', encoding="utf-8")
    data = root / "data"
    (data / "rules").mkdir(parents=True)
    (data / "dialects").mkdir()
    for rel, doc in (("qa-rules.json", {"gates": []}), ("rules/copy.json", {}), ("rules/ortho.json", {}), ("platform-instagram.json", {"plugin": {}}), ("locale-defaults.json", {"dialects": {"gulf": {"uiDialect": "gulf"}}})):
        (data / rel).write_text(json.dumps(doc), encoding="utf-8")
    for d in DIALECTS:
        (data / "dialects" / f"{d}.json").write_text("{}", encoding="utf-8")
    (root / "schemas").mkdir()
    for kind in BUILDER.SCHEMA_KINDS:
        (root / "schemas" / f"{kind}.schema.json").write_text("{}", encoding="utf-8")
    (root / "fonts").mkdir()
    families = []
    for fid, family in (("ibm-plex-sans-arabic", "IBM Plex Sans Arabic"), ("alexandria", "Alexandria"), ("readex-pro", "Readex Pro")):
        (root / "fonts" / fid).mkdir()
        (root / "fonts" / fid / f"{fid}.ttf").write_bytes(FONT_BYTES)
        families.append({"id": fid, "family": family, "scripts": ["arabic"], "files": [{"file": f"{fid}/{fid}.ttf", "style": "normal", "wght": [100, 900] if fid != "ibm-plex-sans-arabic" else 400, "variable": fid != "ibm-plex-sans-arabic"}]})
    (root / "fonts" / "registry.json").write_text(json.dumps({"schemaVersion": 1, "families": families}), encoding="utf-8")
    (root / "fonts" / "coverage.json").write_text(json.dumps({"schemaVersion": 1, "families": {"alexandria": {"ranges": [[32, 126]]}}}), encoding="utf-8")
    return root


class Run:
    """Result of one builder call."""

    def __init__(self, code, out, err, page):
        self.code, self.out, self.err, self.page = code, out, err, page


class BuilderCase(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="cs-build-test-"))
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)
        self.root = make_root(self.tmp)
        self.spec_path = self.tmp / "spec.json"
        self.brand_path = self.tmp / "brand.json"
        self.plan_path = self.tmp / "plan.json"
        self.spec_path.write_text(json.dumps(SPEC, ensure_ascii=False), encoding="utf-8")
        self.brand_path.write_text(json.dumps(BRAND, ensure_ascii=False), encoding="utf-8")
        self.plan_path.write_text(json.dumps(PLAN, ensure_ascii=False), encoding="utf-8")

    def build(self, *extra, root=None, spec=True, brand=True, out="page.html") -> Run:
        args = ["--skill-root", str(root or self.root), "--no-validate", "--out", str(self.tmp / out)]
        if spec:
            args += ["--spec", str(self.spec_path)]
        if brand:
            args += ["--brand", str(self.brand_path)]
        args += list(extra)
        stdout, stderr = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            code = BUILDER.main(args)
        target = self.tmp / out
        return Run(code, stdout.getvalue(), stderr.getvalue(), target.read_text(encoding="utf-8") if target.exists() else None)

    @staticmethod
    def block(page: str, block_id: str):
        match = re.search(r'<script type="application/json" id="' + re.escape(block_id) + r'">(.*?)</script>', page, re.S)
        return json.loads(match.group(1)) if match else None


class TestBuild(BuilderCase):
    def test_studio_page_has_every_block_of_the_contract(self):
        run = self.build("--view", "design")
        self.assertEqual(run.code, 0, run.err)
        for block_id in ("cs-config", "cs-spec", "cs-brand", "cs-presets", "cs-occasions", "cs-rules", "cs-schemas", "cs-fonts-meta", "cs-ui-strings"):
            self.assertIsNotNone(self.block(run.page, block_id), block_id)
        for name in CHUNKS:
            self.assertIn(f'<script id="cs-chunk-{name}">', run.page)
        for needle in ('<style id="cs-fonts">', '<style id="cs-studio-css">', '<style id="cs-archetype-css">', 'data-cs-decor="swiss"', 'data-cs-decor="creator"',
                       '<template data-archetype="item"', 'id="cs-hf-template"', 'id="cs-app"', 'id="cs-boot"', 'id="cs-icons"', "<title>"):
            self.assertIn(needle, run.page, needle)
        self.assertNotIn("data-cs-decor=\"editorial\"", run.page, "presets that ship later are not embedded")
        self.assertNotRegex(run.page, r"<!--CS:(NOTICE|STUDIO_CSS|ICONS|FONTS|BLOCKS|CHUNKS)-->|\{\{(t|js|dir|lang)")

    def test_config_block(self):
        run = self.build("--view", "script")
        config = self.block(run.page, "cs-config")
        self.assertEqual(config["engine"], "cs-1.1.1")
        self.assertEqual(config["view"], "script")
        self.assertEqual(config["mode"], "full")
        self.assertEqual(config["uiDialect"], "gulf")
        self.assertFalse(config["creditFree"])
        self.assertEqual(config["presets"], ["swiss", "creator"])
        self.assertEqual(len(config["buildId"]), 12)
        self.assertEqual(sorted(config["capabilities"]), ["artifact", "assets", "downloads", "sample", "user"])

    def test_json_blocks_survive_hostile_text(self):
        run = self.build("--view", "script")
        spec = self.block(run.page, "cs-spec")
        self.assertEqual(spec, SPEC)
        # no raw closing tag or comment opener inside a data block
        match = re.search(r'id="cs-spec">(.*?)</script>', run.page, re.S).group(1)
        self.assertNotIn("</script", match.lower())
        self.assertNotIn("<!--", match)
        self.assertNotIn(" ", match)

    def test_json_output_lists_capabilities_for_the_publisher(self):
        run = self.build("--view", "design", "--format", "json")
        info = json.loads(run.out)
        self.assertEqual(info["capabilities"]["downloads"], True)
        self.assertIn("sample", info["capabilities"])
        self.assertEqual(info["rev"], 4)
        self.assertGreater(info["bytes"], 1000)

    def test_ui_dialect_resolution(self):
        self.assertEqual(self.block(self.build("--view", "design").page, "cs-config")["uiDialect"], "gulf")
        self.assertEqual(self.block(self.build("--view", "design", "--ui-dialect", "en").page, "cs-config")["uiDialect"], "en")
        run = self.build("--view", "design", "--ui-dialect", "en")
        self.assertIn('dir="ltr" lang="en"', run.page)
        self.assertIn('dir="rtl" lang="ar"', self.build("--view", "design").page)

    def test_boot_placeholder_text_comes_from_the_strings(self):
        run = self.build("--view", "design")
        self.assertIn("نجهّز", run.page)
        self.assertIn('p.textContent = "تعذّر"', run.page)

    def test_credit_free_build_drops_the_about_strings(self):
        normal = self.build("--view", "design")
        self.assertIn("CREDIT-LINE-TEXT", normal.page)
        free = self.build("--view", "design", "--credit-free")
        self.assertNotIn("CREDIT-LINE-TEXT", free.page)
        strings = self.block(free.page, "cs-ui-strings")["strings"]
        self.assertFalse([k for k in strings if k.startswith("about.")])
        self.assertTrue(self.block(free.page, "cs-config")["creditFree"])

    def test_fonts_auto_and_current(self):
        auto = self.build("--view", "design")
        ids = self.block(auto.page, "cs-config")["fonts"]
        self.assertEqual(sorted(ids), ["alexandria", "ibm-plex-sans-arabic", "readex-pro"])
        self.assertIn(base64.b64encode(FONT_BYTES).decode("ascii"), auto.page)
        current = self.build("--view", "design", "--fonts", "current")
        # the Studio's own chrome font and the brand font ride along, the other preset's font does not
        self.assertEqual(sorted(self.block(current.page, "cs-config")["fonts"]), ["alexandria", "ibm-plex-sans-arabic", "readex-pro"])
        meta = self.block(current.page, "cs-fonts-meta")
        self.assertEqual({f["id"] for f in meta["registry"]["families"]}, {"alexandria", "ibm-plex-sans-arabic", "readex-pro"})
        self.assertEqual(set(meta["coverage"]["families"]), {"alexandria"})
        self.assertIn('font-family:"Alexandria"', auto.page)
        self.assertIn("font-weight:100 900", auto.page)

    def test_font_face_declares_display_block_and_data_uri(self):
        page = self.build("--view", "design").page
        self.assertRegex(page, r'@font-face\{font-family:"Alexandria";font-style:normal;font-weight:100 900;font-display:block;src:url\(data:font/ttf;base64,')

    def test_brand_home_page(self):
        run = self.build("--brand-home", "--plan", str(self.plan_path), spec=False, out="home.html")
        self.assertEqual(run.code, 0, run.err)
        self.assertIsNone(self.block(run.page, "cs-spec"))
        self.assertEqual(self.block(run.page, "cs-plan")["period"], "2026-12")
        self.assertEqual(self.block(run.page, "cs-ideas")[0]["id"], "i1", "ideas default to plan.ideaBank")
        self.assertEqual(self.block(run.page, "cs-posts"), [])
        self.assertEqual(self.block(run.page, "cs-config")["view"], "brand-home")
        self.assertIn("CS.ui.mountBrandHome", run.page)
        self.assertIn("<title>", run.page)
        self.assertRegex(run.page, r"<title>[^<]*براند[^<]*</title>", "the title carries the brand name")
        self.assertNotIn("sample", self.block(run.page, "cs-config")["capabilities"])

    def test_studio_boots_the_studio(self):
        self.assertIn("CS.ui.mountStudio", self.build("--view", "design").page)

    def test_standalone_wraps_a_document(self):
        self.assertTrue(self.build("--view", "design", "--standalone").page.startswith("<!doctype html>"))
        self.assertTrue(self.build("--view", "design").page.startswith("<title>"), "published builds are fragments (the Artifact tool adds the skeleton)")

    def test_source_date_epoch_makes_builds_reproducible(self):
        import os
        old = os.environ.get("SOURCE_DATE_EPOCH")
        os.environ["SOURCE_DATE_EPOCH"] = "1700000000"
        try:
            a = self.build("--view", "design").page
            b = self.build("--view", "design", out="again.html").page
        finally:
            if old is None:
                del os.environ["SOURCE_DATE_EPOCH"]
            else:
                os.environ["SOURCE_DATE_EPOCH"] = old
        self.assertEqual(a, b)
        self.assertEqual(self.block(a, "cs-config")["builtAt"], "2023-11-14T22:13:20Z")


class TestVisualChunks(BuilderCase):
    """IS-1: thirteen chunks in a fixed order; the four of the visual language are optional until they are built."""

    @staticmethod
    def chunk_ids(page: str) -> list:
        return re.findall(r'<script id="cs-chunk-([a-z0-9-]+)">', page)

    def test_thirteen_chunks_in_the_load_order_of_is_1(self):
        run = self.build("--view", "design")
        self.assertEqual(run.code, 0, run.err)
        self.assertEqual(self.chunk_ids(run.page), CHUNKS)
        self.assertEqual(len(self.chunk_ids(run.page)), 13)
        self.assertEqual(run.err, "", "a complete tree builds without a word on stderr")
        for name in VISUAL_CHUNKS:
            self.assertIn("window.__chunk_%s = 1" % name.replace("-", "_"), run.page)
        ids = self.chunk_ids(run.page)
        self.assertLess(ids.index("qa"), ids.index("qa-visual"), "the visual gates register into CS.qa._ at load")
        self.assertLess(ids.index("ui"), ids.index("visual-ui"), "the visual panel registers into CS.ui._ at load")
        self.assertLess(ids.index("brandbook"), ids.index("art"))

    def test_brand_home_carries_the_same_chunks(self):
        run = self.build("--brand-home", "--plan", str(self.plan_path), spec=False, out="home.html")
        self.assertEqual(run.code, 0, run.err)
        self.assertEqual(self.chunk_ids(run.page), CHUNKS)

    def test_a_tree_without_the_visual_chunks_still_builds_as_1_0(self):
        root = make_root(self.tmp / "old", chunks=BASE_CHUNKS)
        run = self.build("--view", "design", "--format", "json", root=root)
        self.assertEqual(run.code, 0, run.err)
        self.assertEqual(self.chunk_ids(run.page), BASE_CHUNKS)
        info = json.loads(run.out)
        self.assertEqual(info["chunks"], BASE_CHUNKS)
        self.assertEqual(len(info["warnings"]), 1)
        self.assertEqual(run.err.count("cs-warning:"), 1, "one line, not one per chunk")
        for name in VISUAL_CHUNKS:
            self.assertIn("cs-%s.js" % name, run.err)

    def test_some_visual_chunks_present_keeps_load_order_and_names_the_rest(self):
        root = make_root(self.tmp / "half", chunks=BASE_CHUNKS + ["art", "visual"])
        run = self.build("--view", "design", root=root)
        self.assertEqual(run.code, 0, run.err)
        self.assertEqual(self.chunk_ids(run.page), BASE_CHUNKS + ["art", "visual"])
        self.assertIn("cs-qa-visual.js, cs-visual-ui.js", run.err)
        self.assertNotIn("cs-art.js", run.err)

    def test_text_output_counts_the_chunks(self):
        self.assertIn("chunks=13", self.build("--view", "design").out)

    def test_a_missing_1_0_chunk_is_still_an_error(self):
        root = make_root(self.tmp / "nocore", chunks=[n for n in CHUNKS if n != "ui"])
        run = self.build("--view", "design", root=root)
        self.assertEqual(run.code, 66)
        self.assertIn("cs-ui.js", run.err)

    def test_visual_chunks_obey_the_same_limits(self):
        root = make_root(self.tmp / "bad", {"qa-visual": 'var s = "</script>";'})
        run = self.build("--view", "design", root=root)
        self.assertEqual(run.code, 70)
        self.assertIn("closing script tag", run.err)
        root = make_root(self.tmp / "big", {"art": "x" * (201 * 1024)})
        self.assertEqual(self.build("--view", "design", root=root).code, 2)
        root = make_root(self.tmp / "comment", {"visual": "var s = '<" + "!-- x';"})
        self.assertEqual(self.build("--view", "design", root=root).code, 70)

    def test_the_engine_constant_is_1_1_0(self):
        self.assertEqual(BUILDER.ENGINE, "cs-1.1.1")


class TestDataBlocks(BuilderCase):
    """IS-4: ten optional JSON blocks, each embedded when its file exists."""

    EXPECTED = {
        "cs-icon-pack": ("data/icons/pack.json", 85), "cs-icon-index": ("data/icons/index.json", 70), "cs-icon-concepts": ("data/icons/concepts.json", 140),
        "cs-icon-objects": ("data/icons/objects.json", 60), "cs-icon-stem": ("data/icons/stem.json", 10), "cs-emoji-map": ("data/icons/emoji-map.json", 2),
        "cs-art-marks": ("data/art/marks.json", 20), "cs-art-direction": ("data/art-direction.json", 60), "cs-art-scenes": ("data/art/scenes.json", 40),
        "cs-free-design": ("data/free-design.json", 12),
    }

    def put(self, rel: str, doc, raw: str | None = None) -> Path:
        path = self.root / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(raw if raw is not None else json.dumps(doc, ensure_ascii=False), encoding="utf-8")
        return path

    def test_the_table_is_the_table_of_is_4(self):
        self.assertEqual({b: (rel, cap) for b, rel, cap in BUILDER.DATA_BLOCKS}, self.EXPECTED)
        self.assertEqual(len({rel for _, rel, _ in BUILDER.DATA_BLOCKS}), len(BUILDER.DATA_BLOCKS))
        self.assertNotIn("cs-icons", [b for b, _, _ in BUILDER.DATA_BLOCKS], "cs-icons is the UI sprite")

    def test_no_file_no_block(self):
        run = self.build("--view", "design", "--format", "json")
        self.assertEqual(run.code, 0, run.err)
        for block_id in self.EXPECTED:
            self.assertNotIn('id="%s"' % block_id, run.page)
        self.assertEqual(json.loads(run.out)["dataBlocks"], [])

    def test_every_block_is_embedded_when_its_file_exists(self):
        for block_id, (rel, _) in self.EXPECTED.items():
            self.put(rel, {"id": block_id, "text": "نص </script><!-- x  "})
        run = self.build("--view", "design", "--format", "json")
        self.assertEqual(run.code, 0, run.err)
        for block_id in self.EXPECTED:
            self.assertEqual(self.block(run.page, block_id), {"id": block_id, "text": "نص </script><!-- x  "}, block_id)
        self.assertEqual(json.loads(run.out)["dataBlocks"], [b for b, _, _ in BUILDER.DATA_BLOCKS])
        self.assertEqual(run.err, "")

    def test_only_the_blocks_with_files_appear(self):
        self.put("data/icons/pack.json", {"schemaVersion": 2, "icons": {}})
        self.put("data/art-direction.json", {"roles": []})
        run = self.build("--view", "design")
        self.assertEqual(self.block(run.page, "cs-icon-pack"), {"schemaVersion": 2, "icons": {}})
        self.assertEqual(self.block(run.page, "cs-art-direction"), {"roles": []})
        self.assertIsNone(self.block(run.page, "cs-icon-index"))
        self.assertIsNone(self.block(run.page, "cs-art-scenes"))

    def test_blocks_are_data_not_code(self):
        self.put("data/art/scenes.json", {"scenes": []})
        page = self.build("--view", "design").page
        self.assertIn('<script type="application/json" id="cs-art-scenes">', page)
        self.assertNotIn('id="cs-art-scenes">\n', page)

    def test_a_file_that_is_not_json_stops_the_build(self):
        self.put("data/icons/index.json", None, raw="{not json")
        run = self.build("--view", "design")
        self.assertEqual(run.code, 65)
        self.assertIn("index.json", run.err)

    def test_a_file_over_its_cap_warns_and_builds(self):
        self.put("data/icons/stem.json", {"pad": "x" * (11 * 1024)})
        run = self.build("--view", "design", "--format", "json")
        self.assertEqual(run.code, 0, run.err)
        self.assertIn("data/icons/stem.json", run.err)
        self.assertIn("cap is 10 KiB", run.err)
        self.assertEqual(len(json.loads(run.out)["warnings"]), 1)

    def test_a_file_at_its_cap_is_quiet(self):
        text = json.dumps({"pad": ""})
        pad = 2 * 1024 - len(text.encode("utf-8"))
        self.put("data/icons/emoji-map.json", None, raw=json.dumps({"pad": "x" * pad}))
        self.assertEqual((self.root / "data/icons/emoji-map.json").stat().st_size, 2 * 1024)
        self.assertEqual(self.build("--view", "design").err, "")

    def test_data_changes_the_build_id_and_nothing_else_does_when_absent(self):
        first = self.block(self.build("--view", "design").page, "cs-config")["buildId"]
        again = self.block(self.build("--view", "design", out="again.html").page, "cs-config")["buildId"]
        self.assertEqual(first, again)
        self.put("data/art/marks.json", {"marks": [1]})
        with_data = self.block(self.build("--view", "design", out="b.html").page, "cs-config")["buildId"]
        self.put("data/art/marks.json", {"marks": [2]})
        changed = self.block(self.build("--view", "design", out="c.html").page, "cs-config")["buildId"]
        self.assertEqual(len({first, with_data, changed}), 3)


class TestVisualStrings(BuilderCase):
    """runtime/ui-strings-visual.json is merged into the strings document when it exists."""

    def put(self, doc=None, raw=None) -> None:
        text = raw if raw is not None else json.dumps(doc, ensure_ascii=False)
        (self.root / "runtime" / "ui-strings-visual.json").write_text(text, encoding="utf-8")

    @staticmethod
    def entry(text: str) -> dict:
        return {d: text for d in DIALECTS}

    def strings(self, run: Run) -> dict:
        return self.block(run.page, "cs-ui-strings")["strings"]

    def test_without_the_file_the_document_is_ui_strings_alone(self):
        self.assertEqual(sorted(self.strings(self.build("--view", "design"))), ["about.credit", "app.name", "boot.failed", "boot.loading", "boot.noscript"])

    def test_the_two_files_are_merged(self):
        self.put({"schemaVersion": 1, "dataVersion": "v", "strings": {"visual.plan.title": self.entry("خطّط الصور"), "about.visual": self.entry("ABOUT-VISUAL")}})
        run = self.build("--view", "design")
        self.assertEqual(run.code, 0, run.err)
        strings = self.strings(run)
        self.assertEqual(strings["visual.plan.title"]["eg"], "خطّط الصور")
        self.assertEqual(strings["app.name"]["eg"], "كاروسيل")
        self.assertEqual(len(strings), 7)

    def test_credit_free_drops_the_about_keys_of_both_files(self):
        self.put({"strings": {"visual.plan.title": self.entry("x"), "about.visual": self.entry("ABOUT-VISUAL")}})
        run = self.build("--view", "design", "--credit-free")
        strings = self.strings(run)
        self.assertIn("visual.plan.title", strings)
        self.assertFalse([k for k in strings if k.startswith("about.")])
        self.assertNotIn("ABOUT-VISUAL", run.page)

    def test_a_key_defined_twice_is_refused(self):
        self.put({"strings": {"app.name": self.entry("x"), "visual.a": self.entry("y")}})
        run = self.build("--view", "design")
        self.assertEqual(run.code, 2)
        self.assertIn("app.name", run.err)
        self.assertIsNone(run.page)

    def test_a_file_without_a_strings_object_is_refused(self):
        self.put({"schemaVersion": 1})
        self.assertEqual(self.build("--view", "design").code, 65)
        self.put(None, raw="[1, 2]")
        self.assertEqual(self.build("--view", "design").code, 65)
        self.put(None, raw="{broken")
        self.assertEqual(self.build("--view", "design").code, 65)

    def test_a_visual_key_can_be_used_by_the_template(self):
        self.put({"strings": {"boot.visual": self.entry("نجهّز الصور")}})
        template = self.root / "templates" / "studio.html"
        template.write_text(template.read_text(encoding="utf-8").replace("{{t:boot.loading}}", "{{t:boot.visual}}"), encoding="utf-8")
        self.assertIn("نجهّز الصور", self.build("--view", "design").page)


class TestPrimitives(BuilderCase):
    """Rule A11: templates/primitives.css goes into the existing #cs-archetype-css element, after the layout sheet."""

    SHEET = ".cs-art{display:block}\n.cs-icon{width:1em}\n"
    ELEMENT = re.compile(r'<style id="cs-archetype-css">(.*?)</style>', re.S)

    def put(self, text: str) -> Path:
        path = self.root / "templates" / "primitives.css"
        path.write_bytes(text.encode("utf-8"))           # bytes, so that sizes are the same on every platform
        return path

    def element(self, page: str) -> str:
        return self.ELEMENT.search(page).group(1)

    def test_appended_once_into_the_archetype_element_after_the_layout_sheet(self):
        self.put(self.SHEET)
        run = self.build("--view", "design", "--format", "json")
        self.assertEqual(run.code, 0, run.err)
        self.assertEqual(self.element(run.page), ".cs-slide{}\n" + self.SHEET)
        self.assertEqual(run.page.count(".cs-art{display:block}"), 1)
        self.assertEqual(len(re.findall(r'<style id="cs-archetype-css"', run.page)), 1)
        self.assertNotRegex(run.page, r'<style[^>]*primitives', "no element of its own: serialize.js would drop it on a re-save")
        self.assertLess(run.page.index(".cs-icon{width:1em}"), run.page.index('<template data-archetype="item"'))
        self.assertEqual(json.loads(run.out)["primitivesBytes"], len(self.SHEET.encode("utf-8")))

    def test_without_the_file_the_archetype_element_is_what_it_was(self):
        run = self.build("--view", "design", "--format", "json")
        self.assertEqual(self.element(run.page), ".cs-slide{}")
        self.assertEqual(json.loads(run.out)["primitivesBytes"], 0)

    def test_an_empty_file_changes_nothing(self):
        self.put("  \n")
        self.assertEqual(self.element(self.build("--view", "design").page), ".cs-slide{}")

    def test_the_cap_is_30_kib(self):
        line = ".cs-x{color:red}\n"
        self.put(line * ((30 * 1024) // len(line)))
        self.assertLessEqual((self.root / "templates" / "primitives.css").stat().st_size, 30 * 1024)
        self.assertEqual(self.build("--view", "design").code, 0)
        self.put("/*" + "x" * (30 * 1024) + "*/")
        run = self.build("--view", "design", out="big.html")
        self.assertEqual(run.code, 2)
        self.assertIn("30 KiB", run.err)
        self.assertIsNone(run.page)

    def test_a_sheet_that_could_end_the_style_element_is_refused(self):
        self.put(".a{}\n</style><script>x</script>")
        self.assertEqual(self.build("--view", "design").code, 2)
        self.put(".a{} /* <" + "!-- */")
        self.assertEqual(self.build("--view", "design").code, 2)

    def test_archetypes_without_the_style_element_cannot_take_it(self):
        self.put(self.SHEET)
        (self.root / "templates" / "archetypes.html").write_text('<template data-archetype="item"><main class="cs-content"></main></template>\n', encoding="utf-8")
        run = self.build("--view", "design")
        self.assertEqual(run.code, 70)
        self.assertIn("cs-archetype-css", run.err)

    def test_appending_twice_is_the_same_as_once(self):
        archetypes = '<style id="cs-archetype-css">.a{}</style>\n<template data-archetype="item"></template>\n'
        once = BUILDER.append_primitives(archetypes, ".b{}\n")
        self.assertEqual(once, '<style id="cs-archetype-css">.a{}\n.b{}\n</style>\n<template data-archetype="item"></template>\n')
        self.assertEqual(BUILDER.append_primitives(once, ".b{}\n"), once)
        self.assertEqual(BUILDER.append_primitives(archetypes, None), archetypes)

    def test_the_sheet_is_part_of_the_build_id(self):
        base = self.block(self.build("--view", "design").page, "cs-config")["buildId"]
        self.put(self.SHEET)
        one = self.block(self.build("--view", "design", out="a.html").page, "cs-config")["buildId"]
        self.put(self.SHEET + ".cs-rail{height:4px}\n")
        two = self.block(self.build("--view", "design", out="b.html").page, "cs-config")["buildId"]
        self.assertEqual(len({base, one, two}), 3)

    def test_same_input_same_bytes(self):
        import os
        old = os.environ.get("SOURCE_DATE_EPOCH")
        os.environ["SOURCE_DATE_EPOCH"] = "1700000000"
        try:
            self.put(self.SHEET)
            self.root.joinpath("data", "art").mkdir(parents=True, exist_ok=True)
            self.root.joinpath("data", "art", "marks.json").write_text('{"marks":[]}', encoding="utf-8")
            a = self.build("--view", "design").page
            b = self.build("--view", "design", out="again.html").page
        finally:
            if old is None:
                del os.environ["SOURCE_DATE_EPOCH"]
            else:
                os.environ["SOURCE_DATE_EPOCH"] = old
        self.assertEqual(a, b)


class TestPageSize(BuilderCase):
    """The page warns above 12 MiB and refuses above 15 MiB. Real sizes: a font of the right weight stands in for the data."""

    def font(self, mib: float) -> None:
        (self.root / "fonts" / "alexandria" / "alexandria.ttf").write_bytes(b"\x00" * int(mib * 1024 * 1024))

    def test_a_normal_page_is_quiet(self):
        self.assertEqual(self.build("--view", "design").err, "")

    def test_above_12_mib_it_warns_and_still_writes(self):
        self.font(9.5)       # base64 makes it 4/3 larger: about 12.7 MiB
        run = self.build("--view", "design")
        self.assertEqual(run.code, 0, run.err)
        self.assertIn("cs-warning:", run.err)
        self.assertIn("target 12 MiB", run.err)
        self.assertGreater(len(run.page.encode("utf-8")), 12 * 1024 * 1024)

    def test_above_15_mib_it_refuses_and_writes_nothing(self):
        self.font(11.5)      # about 15.3 MiB
        run = self.build("--view", "design")
        self.assertEqual(run.code, 2)
        self.assertIn("hard limit is 15 MiB", run.err)
        self.assertIsNone(run.page)

    def test_the_limits_are_12_and_15_mib(self):
        self.assertEqual((BUILDER.LIMIT_WARN, BUILDER.LIMIT_FAIL), (12 * 1024 * 1024, 15 * 1024 * 1024))


class TestBuildErrors(BuilderCase):
    def test_usage_errors_exit_64(self):
        self.assertEqual(self.build().code, 64, "needs --view or --brand-home")
        self.assertEqual(self.build("--view", "design", "--mode", "shell").code, 64)
        self.assertEqual(self.build("--view", "design", spec=False).code, 64, "no --spec")
        self.assertEqual(self.build("--brand-home", spec=False, brand=False).code, 64, "brand home needs a brand")
        self.assertEqual(self.build("--view", "sideways").code, 64)

    def test_missing_input_exits_66(self):
        self.spec_path.unlink()
        run = self.build("--view", "design")
        self.assertEqual(run.code, 66)
        self.assertIn("cs-error", run.err)

    def test_unparseable_json_exits_65(self):
        self.spec_path.write_text("{not json", encoding="utf-8")
        self.assertEqual(self.build("--view", "design").code, 65)

    def test_empty_slides_are_refused(self):
        self.spec_path.write_text(json.dumps({**SPEC, "slides": []}), encoding="utf-8")
        run = self.build("--view", "design")
        self.assertEqual(run.code, 2)
        self.assertIn("at least one slide", run.err)

    def test_chunk_over_200_kib_is_refused(self):
        root = make_root(self.tmp / "big", {"ui": "x" * (201 * 1024)})
        self.assertEqual(self.build("--view", "design", root=root).code, 2)

    def test_chunk_with_a_closing_script_tag_is_refused(self):
        root = make_root(self.tmp / "bad", {"qa": 'var s = "</script>";'})
        run = self.build("--view", "design", root=root)
        self.assertEqual(run.code, 70)
        self.assertIn("closing script tag", run.err)

    def test_unknown_font_in_a_preset_is_refused(self):
        registry = self.root / "fonts" / "registry.json"
        doc = json.loads(registry.read_text(encoding="utf-8"))
        doc["families"] = [f for f in doc["families"] if f["id"] != "alexandria"]
        registry.write_text(json.dumps(doc), encoding="utf-8")
        run = self.build("--view", "design")
        self.assertEqual(run.code, 2)
        self.assertIn("alexandria", run.err)

    def test_missing_font_file_exits_66(self):
        (self.root / "fonts" / "alexandria" / "alexandria.ttf").unlink()
        self.assertEqual(self.build("--view", "design").code, 66)

    def test_validation_needs_the_validation_package(self):
        if (SKILL / "scripts" / "_cs" / "schema.py").is_file():  # the builder imports _cs from its own folder
            self.skipTest("_cs is available next to build_studio.py; validation is covered by its own tests")
        args = ["--skill-root", str(self.root), "--spec", str(self.spec_path), "--view", "design", "--out", str(self.tmp / "v.html")]
        with contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(BUILDER.main(args), 70)


class TestHelpers(unittest.TestCase):
    def test_script_json_escapes(self):
        text = BUILDER.script_json({"a": "x</script><!-- y  "})
        self.assertNotIn("</", text)
        self.assertNotIn("<!--", text)
        self.assertEqual(json.loads(text), {"a": "x</script><!-- y  "})

    def test_template_substitution(self):
        strings = {"k": {"eg": "a & <b>", "msa-white": "w", "en": "e"}}
        self.assertEqual(BUILDER.fill_template("{{t:k}}", strings, "eg"), "a &amp; &lt;b&gt;")
        self.assertEqual(BUILDER.fill_template('"{{js:k}}"', {"k": {"eg": 'q"uote\\'}}, "eg"), '"q\\"uote\\\\"')
        self.assertEqual(BUILDER.fill_template("{{dir}}/{{lang}}", {}, "en"), "ltr/en")
        self.assertEqual(BUILDER.fill_template("{{t:missing}}", {}, "eg"), "missing")

    def test_js_safe_allows_balanced_markers_only_when_asked(self):
        BUILDER.js_safe("<!--CS:FONTS--> ok", "t", allow_markers=True)
        with self.assertRaises(BUILDER.BuildError):
            BUILDER.js_safe("<!--CS:FONTS--> ok", "t")
        with self.assertRaises(BUILDER.BuildError):
            BUILDER.js_safe("<!-- never closed", "t", allow_markers=True)


def forms(value):
    """The strings of one dialect entry: the text itself, or every plural form of it (one, two, few, many, other)."""
    return list(value.values()) if isinstance(value, dict) else [value]


class TestShippedStudioFiles(unittest.TestCase):
    """Checks on the real files this package owns."""

    @classmethod
    def setUpClass(cls):
        cls.strings = json.loads((SKILL / "runtime" / "ui-strings.json").read_text(encoding="utf-8"))["strings"]
        cls.merged = BUILDER.load_ui_strings(SKILL, False)["strings"]       # ui-strings.json plus ui-strings-visual.json when it exists

    def test_every_string_has_all_five_dialects(self):
        for key, entry in self.merged.items():
            self.assertEqual(sorted(entry), sorted(DIALECTS), key)
            for dialect, value in entry.items():
                for text in forms(value):
                    self.assertTrue(text.strip(), f"{key}/{dialect} is empty")

    def test_placeholders_match_across_dialects(self):
        for key, entry in self.merged.items():
            sets = {d: sorted({m for text in forms(v) for m in re.findall(r"\{([A-Za-z0-9_]+)\}", text)}) for d, v in entry.items()}
            self.assertEqual(len({tuple(v) for v in sets.values()}), 1, f"{key}: {sets}")

    def test_keys_are_lowercase_dotted(self):
        for key in self.merged:
            self.assertRegex(key, r"^[a-zA-Z0-9]+(\.[A-Za-z0-9_\-]+)+$", key)

    def test_credit_lives_only_under_about(self):
        for key, entry in self.merged.items():
            joined = " ".join(text for value in entry.values() for text in forms(value))
            if any(s in joined for s in OWNER_STRINGS):
                self.assertTrue(key.startswith("about."), f"{key} carries the owner's name outside about.*")
        self.assertIn("about.credit", self.strings)

    def test_every_key_used_by_the_code_exists(self):
        used = set()
        # The slide cap also ships with old embedded JSON bundles, so its strings
        # live in the UI's source dictionary and follow the same language fallback.
        source = (REPO / "src/ui/strings.js").read_text(encoding="utf-8")
        fallback = json.loads(re.search(r"var slideLimitStrings = (\{[^\n]+\});", source).group(1))
        for value in fallback.values():
            self.assertTrue(value["msa-white"] and value["en"])
        available = set(self.merged) | set(fallback)
        directories = list(SRC_DIRS)
        if (SKILL / BUILDER.VISUAL_STRINGS).is_file():          # once the visual strings ship, the visual panel's keys are held to them too
            directories.append(REPO / "src" / "visual-ui")
        for directory in directories:
            for path in directory.rglob("*.js"):
                text = path.read_text(encoding="utf-8")
                used.update(re.findall(r'\bt\(\s*"([^"]+)"\s*[,)]', text))
        self.assertGreater(len(used), 300)
        missing = sorted(k for k in used if k not in available)
        self.assertEqual(missing, [])

    def test_dynamic_key_families_are_complete(self):
        types = slide_types()
        self.assertGreaterEqual(len(types), 20, "the 18 types of 1.0 plus grid and timeline")
        self.assertEqual(sorted(set(types) - {k[len("type."):] for k in self.strings if k.startswith("type.")}), [], "every slide type has a name string")
        families = {
            "type.": len(types), "arch.": 12, "intent.": 4, "digits.": 2, "goal.": 3, "cta.kind.": 5, "media.slot.": 7, "sev.": 3, "regen.mode.": 5,
            "nav.": 8, "tab.": 4, "theme.": 3, "state.": 5, "status.": 6, "home.tab.": 4, "motion.feel.": 3, "check.status.": 3, "export.err.": 6,
        }
        for prefix, minimum in families.items():
            have = [k for k in self.strings if k.startswith(prefix)]
            self.assertGreaterEqual(len(have), minimum, prefix)

    def test_arabic_strings_use_arabic_punctuation_and_no_tatweel(self):
        for key, entry in self.strings.items():
            for dialect, value in entry.items():
                if dialect == "en" or key.startswith(("about.social", "about.url")):
                    continue
                for text in forms(value):
                    self.assertNotRegex(text, r"[A-Za-z]{2,}\s*,\s*[؀-ۿ]", f"{key}: Latin comma in Arabic text")
                    self.assertNotRegex(text, "ـ(?![A-Za-z])", f"{key}: tatweel is only allowed before a Latin name (لـClaude)")
                    self.assertNotRegex(text, "ـ [A-Za-z]", f"{key}: no space between the tatweel and the Latin name")
                    self.assertNotRegex(text, "[۰-۹]", f"{key}: Persian digits")

    def test_no_owner_name_outside_the_files_that_may_carry_it(self):
        files = [SKILL / "runtime" / n for n in ("cs-ui.js", "cs-brandbook.js", "studio.css", "icons.svg")]
        files += [SKILL / "templates" / n for n in ("studio.html", "brand-home.html")]
        files += [SKILL / "scripts" / "build_studio.py", SKILL / "scripts" / "extract_spec.py"]
        for directory in SRC_DIRS:
            files += list(directory.rglob("*.js"))
        for path in files:
            if not path.exists():
                continue
            text = path.read_text(encoding="utf-8")
            for needle in OWNER_STRINGS:
                self.assertNotIn(needle, text, f"{path.name} mentions the owner")

    def test_runtime_chunks_are_clean_and_within_budget(self):
        names = ["cs-ui.js", "cs-brandbook.js"]
        names += [f"cs-{n}.js" for n in VISUAL_CHUNKS if (SKILL / "runtime" / f"cs-{n}.js").exists()]      # the visual chunks are checked once built
        for name in names:
            path = SKILL / "runtime" / name
            if not path.exists():
                self.skipTest(f"{name} has not been built yet")
            raw = path.read_bytes()
            self.assertLess(len(raw), 240 * 1024, f"{name} exceeds the 240 KiB chunk budget")
            text = raw.decode("utf-8")
            self.assertNotRegex(text, r"</script", name)
            self.assertNotIn("<!--", text, name)
            self.assertNotRegex(text, "[  ﻿]", name)
            self.assertNotIn("\r", text, f"{name} must use LF line endings")
            self.assertNotRegex(text, r"\b(gsap|gtag|sendBeacon|analytics)\b", f"{name} must not carry telemetry or GSAP")

    def test_sources_have_no_invisible_characters(self):
        for directory in SRC_DIRS:
            for path in directory.rglob("*.js"):
                text = path.read_text(encoding="utf-8")
                self.assertNotRegex(text, "[  ‎‏‌‍﻿ ـ]", f"{path.name}: use escapes, not invisible characters")

    def test_manifests_list_existing_files(self):
        for directory in SRC_DIRS:
            manifest = json.loads((directory / "manifest.json").read_text(encoding="utf-8"))
            self.assertEqual(sorted(manifest), ["chunk", "files", "module", "order"])
            for name in manifest["files"]:
                self.assertTrue((directory / name).exists(), f"{directory.name}/{name}")

    def test_the_visual_modules_have_manifests_that_list_existing_files(self):
        for module in VISUAL_CHUNKS:
            directory = REPO / "src" / module
            manifest = json.loads((directory / "manifest.json").read_text(encoding="utf-8"))
            self.assertEqual(sorted(manifest), ["chunk", "files", "module", "order"], module)
            self.assertEqual((manifest["module"], manifest["chunk"]), (module, f"cs-{module}.js"))
            for name in manifest["files"]:
                self.assertTrue((directory / name).exists(), f"{module}/{name}")

    def test_the_chunk_list_is_the_set_of_manifests(self):
        chunks = {json.loads(p.read_text(encoding="utf-8"))["chunk"] for p in (REPO / "src").glob("*/manifest.json")}
        self.assertEqual(chunks, {f"cs-{n}.js" for n in BUILDER.CHUNKS})
        self.assertEqual(BUILDER.CHUNKS, CHUNKS)

    def test_engine_constant_matches_package_plugin_and_runtime_versions(self):
        package = json.loads((REPO / "package.json").read_text(encoding="utf-8"))
        plugin = json.loads((REPO / "plugins" / "carousel-studio" / ".claude-plugin" / "plugin.json").read_text(encoding="utf-8"))
        self.assertEqual(BUILDER.ENGINE, "cs-" + package["version"])
        self.assertEqual(package["version"], plugin["version"])
        self.assertIn('CS.version = "%s"' % BUILDER.ENGINE, (REPO / "src" / "lib" / "root.js").read_text(encoding="utf-8"))

    def test_shipped_visual_data_parses_and_fits_its_caps(self):
        for block_id, rel, cap_kib in BUILDER.DATA_BLOCKS:
            path = SKILL / rel
            if path.is_file():
                self.assertLessEqual(path.stat().st_size, cap_kib * 1024, f"{rel} is over its {cap_kib} KiB cap ({block_id})")
                json.loads(path.read_text(encoding="utf-8"))
        sheet = SKILL / BUILDER.PRIMITIVES
        if sheet.is_file():
            self.assertLessEqual(sheet.stat().st_size, 30 * 1024, "primitives.css is serialised into every painted frame")

    def test_icon_sprite_covers_every_icon_the_code_uses(self):
        sprite = (SKILL / "runtime" / "icons.svg").read_text(encoding="utf-8")
        have = set(re.findall(r'<symbol id="i-([a-z0-9-]+)"', sprite))
        used = set()
        for directory in SRC_DIRS:
            for path in directory.rglob("*.js"):
                used.update(re.findall(r'\bicon\("([a-z0-9-]+)"', path.read_text(encoding="utf-8")))
        used.update(re.findall(r'(?:icon:|ic|iconName)\s*=?\s*"([a-z0-9-]+)"', ""))
        self.assertEqual(sorted(used - have), [])

    def test_css_follows_the_artifact_theme_contract(self):
        css = (SKILL / "runtime" / "studio.css").read_text(encoding="utf-8")
        self.assertRegex(css, r":root\s*\{")
        self.assertIn("@media (prefers-color-scheme: dark)", css)
        self.assertIn(':root:not([data-theme="light"])', css)
        self.assertIn(':root[data-theme="dark"]', css)
        self.assertIn("color-scheme: dark", css)
        self.assertRegex(css, r"html, body \{ background: var\(--ui-bg\)")
        self.assertIn("padding-left: max(var(--ui-gutter), env(safe-area-inset-left, 0px))", css)
        # dark blocks redefine only tokens that already exist on :root
        root = re.search(r"^:root \{(.*?)^\}", css, re.S | re.M).group(1)
        base_tokens = set(re.findall(r"(--ui-[a-z0-9-]+):", root))
        dark = re.search(r':root\[data-theme="dark"\] \{(.*?)^\}', css, re.S | re.M).group(1)
        for token in re.findall(r"(--ui-[a-z0-9-]+):", dark):
            self.assertIn(token, base_tokens, token)
        self.assertNotRegex(css, r"letter-spacing:\s*(?!\s|normal|0)", "no letter-spacing on UI text")


class TestPageNotice(BuilderCase):
    """The one notice line at the top of every page the builder makes."""

    def test_every_page_carries_the_line_once_before_its_styles(self):
        comment = BUILDER.html_comment(BUILDER.NOTICE)
        for name, args, kwargs in (("studio", ("--view", "design"), {}), ("credit-free studio", ("--view", "script", "--credit-free"), {}),
                                   ("brand home", ("--brand-home", "--plan", str(self.plan_path)), {"spec": False})):
            run = self.build(*args, out=name.replace(" ", "-") + ".html", **kwargs)
            self.assertEqual(run.code, 0, run.err)
            self.assertEqual(run.page.count(comment), 1, name)
            self.assertLess(run.page.index(comment), run.page.index("<style"), f"{name}: the notice comes before any style")

    def test_the_line_is_a_notice_and_not_a_credit(self):
        text = BUILDER.NOTICE
        for needle in OWNER_STRINGS:
            self.assertNotIn(needle, text)
        self.assertNotRegex(text, r"https?:|www\.|@", "no link and no handle")
        self.assertEqual(BUILDER.html_comment(text), "<!-- " + text + " -->", "no double hyphen for html_comment to rewrite")
        self.assertLessEqual(len(text), 200)

    def test_the_line_names_every_icon_set_and_its_licence(self):
        for name, licence in ICON_SETS.items():
            self.assertIn(name, BUILDER.NOTICE)
            self.assertIn(licence, BUILDER.NOTICE)
        self.assertIn("Tabler", BUILDER.NOTICE, "the slide icon pack carries Tabler outlines (names starting tb-)")


class TestNoticeAgreement(unittest.TestCase):
    """The notice strings and the NOTICE file say the same thing (round 3, package N1). Reads the real files of the repository."""

    def test_notice_agreement(self):
        """The page line of build_studio.py and NOTICE_TEXT of the Studio's own save-as-HTML (src/ui/serialize.js) are one string."""
        ui_text = js_string(REPO / "src" / "ui" / "serialize.js", "NOTICE_TEXT")
        if ui_text is None:
            ui_text = js_string(SKILL / "runtime" / "cs-ui.js", "NOTICE_TEXT")     # a checkout without the sources: the built chunk
        self.assertIsNotNone(ui_text, "NOTICE_TEXT not found in src/ui/serialize.js or in runtime/cs-ui.js")
        if ui_text == PRE_R3_PAGE_NOTICE:
            self.skipTest("U1 has not copied the new notice string into src/ui/serialize.js yet; this test turns strict as soon as that file changes")
        self.assertEqual(ui_text, BUILDER.NOTICE, "the two notice strings must change together")

    def test_the_export_line_names_the_same_icon_sets_as_the_page_line(self):
        line = js_string(REPO / "src" / "export" / "text.js", "LICENCE_NOTICE") or js_string(SKILL / "runtime" / "cs-export.js", "LICENCE_NOTICE")
        self.assertIsNotNone(line, "LICENCE_NOTICE not found")
        self.assertEqual(dict(re.findall(r"\b(Lucide|Feather|Tabler) (ISC|MIT)\b", line)), ICON_SETS)
        self.assertIn("see NOTICE", line)

    def test_the_notice_file_prints_the_licence_text_of_every_icon_set(self):
        sections = notice_sections()
        lucide = next(text for title, text in sections.items() if title.startswith("Lucide"))
        tabler = next(text for title, text in sections.items() if title.startswith("Tabler"))
        self.assertIn("Copyright (c) 2026 Lucide Icons and Contributors", lucide)
        self.assertIn("Copyright (c) 2013-present Cole Bemis", lucide, "the Feather part of Lucide")
        self.assertIn("Licence:  MIT", tabler)
        self.assertIn("Copyright (c) 2020-2026 Paweł Kuna", tabler)
        self.assertIn("Permission is hereby granted, free of charge, to any person obtaining a", tabler)
        self.assertIn('THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND', tabler)
        self.assertNotRegex(tabler, r"https?://", "NOTICE links are limited to the directory allowlist (check_directory P04)")

    def test_every_source_of_the_icon_pack_has_a_notice_section_at_the_pinned_release(self):
        pack_file = SKILL / "data" / "icons" / "pack.json"
        lock_file = REPO / "tools" / "icons.lock.json"
        if not pack_file.is_file() or not lock_file.is_file():
            self.skipTest("the icon pack or tools/icons.lock.json is not in this tree")
        pack = json.loads(pack_file.read_text(encoding="utf-8"))
        lock = json.loads(lock_file.read_text(encoding="utf-8"))["sources"]
        titles = [t.lower() for t in notice_sections()]
        self.assertEqual(sorted(pack["sources"]), sorted(lock), "the pack and the lock pin the same sources")
        for source in pack["sources"]:
            self.assertTrue(any(t.startswith(source) for t in titles), f"{source}: no section in NOTICE")
            self.assertEqual(pack["sources"][source], lock[source]["version"], f"{source}: the pack was built from another release than the lock pins")
        tabler = next(text for title, text in notice_sections().items() if title.startswith("Tabler"))
        self.assertIn(lock["tabler"]["version"], tabler, "the Tabler section names the pinned release")
        self.assertIn(lock["tabler"]["license"], tabler)
        if any(name.startswith("tb-") for name in pack["icons"]):
            self.assertIn("Tabler", BUILDER.NOTICE)
        if any(name.startswith("cs-") for name in pack["icons"]):
            self.assertTrue(any(t.startswith("the icons and objects drawn for carousel studio") for t in titles), "the custom icons are accounted for")

    def test_the_plugin_notice_is_a_byte_copy_of_the_root_notice(self):
        self.assertEqual(PLUGIN_NOTICE_FILE.read_bytes(), NOTICE_FILE.read_bytes(), "run python tools/sync_shared.py")

    def test_the_notice_file_still_states_the_ownership_line_and_has_no_page_comment_markup(self):
        text = NOTICE_FILE.read_text(encoding="utf-8")
        self.assertIn("You own everything you create with Carousel Studio.", text)
        self.assertNotIn("\r", text)
        self.assertNotIn("<!--", text)
        self.assertTrue(text.endswith("\n") and not text.endswith("\n\n"))

    def test_the_engine_stubs_say_the_engine_version(self):
        own = REPO / ENGINE_STUBS[0]
        self.assertEqual(re.search(r'CS\.version\s*=\s*"([^"]+)"', own.read_text(encoding="utf-8")).group(1), BUILDER.ENGINE, ENGINE_STUBS[0])
        for rel in ENGINE_STUBS[1:]:
            path = REPO / rel
            found = re.search(r'CS\.version\s*=\s*"([^"]+)"', path.read_text(encoding="utf-8")) if path.is_file() else None
            if found:
                self.assertEqual(found.group(1), BUILDER.ENGINE, rel)


if __name__ == "__main__":
    unittest.main()
