"""E1 (round 3): the schema definitions of the visual language (spec 5.2, 5.5, 6.0; IS-5; r2 1.1 row 5), checked on the Python validator.

What it holds the four edited schemas (spec, preset, brand, qa-report) to:
  * the layout: tools/add_type.py rewrites spec.schema.json and preset.schema.json with json.dumps(indent=2, ensure_ascii=False) and refuses any
    other layout, so the files must be exactly that;
  * the CONTRACT 3.1 subset: no keyword outside it, no `patternProperties`, `propertyNames`, `if/then`, no `\\d \\w \\s \\b` in a pattern, every
    pattern anchored, every `$ref` resolvable, every name in `x-sharedDefs` defined and byte-identical in every schema that lists it (CONTRACT 3.1);
  * the documents: the old and new examples, the old fixtures and the six shipped presets validate; the new gate ids of IS-8 are admitted;
  * agreement: the same documents, valid and invalid, give the same (path, keyword) verdicts in this validator and in the JavaScript one
    (src/lib/schema.js, run through node), the way tests/conformance holds the two engines together;
  * sizes: GR-5 (every file under 256 KiB); the budget as the lead amended it (wave 2b, fix-plan-2b card 9, decision r3b-1: spec <= 52 KB and preset <= 26 KB
    on disk, brand within its card +2 KB), measured on the bytes on disk, plus on-disk ceilings so nothing creeps;
  * authored Arabic: the new examples carry no tashkeel and pass the Egyptian lint (GR-7), so schema validity alone cannot hide a violation;
  * tone expressions: the numeric bounds of spec 5.5 hold in both engines; the tuple positions the subset cannot express are checked by a
    reference checker here and handed to preset_lint (E4b) and the resolver (E2b);
  * determinism: a second run gives the same verdicts.

Run: python -X utf8 -m unittest tests.unit.py.test_schema_defs
"""
from __future__ import annotations

import copy
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

try:
    import b7_support as support
except ImportError:  # `python -X utf8 -m unittest tests.unit.py.test_schema_defs`: the folder is a package here
    from . import b7_support as support

REPO = Path(__file__).resolve().parents[3]
DESIGN = REPO / "plugins" / "carousel-studio" / "skills" / "carousel-design"
SCHEMA_DIR = DESIGN / "schemas"
EXAMPLES = REPO / "docs" / "examples"
KINDS = ("brand", "spec", "preset", "occasion", "hook", "plan", "qa-report")
EDITED = ("spec", "preset", "brand", "qa-report")
# ---- budgets (GR-9: every budget on the card is a hard limit) ----------------------------------------------------------------
# The card (13-build-plan.md section 5.3, E1 "Budget") gave spec.schema.json +8 KB, preset +3 KB and brand +2 KB over the files F2 and IB0 left (hashes in
# R3B/manifest-ib0-post.json; BASELINE is their size on disk). The visual vocabulary had to live in the schemas, so the spec grew +16,560 B (47,920) and the
# preset +9,680 B (23,640). The lead accepted that in wave 2b (fix-plan-2b card 9, E1 MUST, decision r3b-1): spec <= 52 KB, preset <= 26 KB, the brand unchanged
# (it grew +840 B against its +2 KB). BUDGET is exactly that, in bytes on disk (1 KB = 1,000 B, the unit the card was written in); there is no pending
# allowance and no compact-JSON sizing any more.
BASELINE = {"spec": 31_360, "preset": 13_960, "brand": 33_459, "qa-report": 8_767}  # bytes on disk
BUDGET = {"spec": 52_000, "preset": 26_000, "brand": BASELINE["brand"] + 2_000}
# On-disk ceilings, rounded up to the next 50 bytes above what the fix round measured. They are not budgets; they only make growth visible. Raising one is a
# decision to record. qa-report is not on the card: 8,850 became 9,350 for the optional top-level `stats` (the executed-gate counts, wave 2b), then 9,400 when the lead let a
# gate count 0 (minimum 1 became 0) and the schema description said why (round 3). The spec went 47,950 -> 48,650 for slide.free, the free design lane
# (html, css, locked: +718 B on disk, round 3 close; the budget of 52,000 is untouched).

# WP7: cover.logo and the documented larger asset cap add 964 B; the 52 KB budget stays unchanged.
DISK_CEILING = {"spec": 49_600, "preset": 23_750, "brand": BUDGET["brand"], "qa-report": 9_400}
TASHKEEL = re.compile("[\u064b-\u065f\u0670]")  # U+064B..U+065F and the dagger alef: the marks GR-7 forbids in authored copy (U+0640 is the lint's)
ARABIC = re.compile("[\u0600-\u06ff]")
ENV = {**os.environ, "PYTHONIOENCODING": "utf-8", "PYTHONUTF8": "1"}
DEL = object()
STATS = {"gates": {"C2": 3, "D9.band": 16, "VA2.anchor-size": 15, "VA9.anchor-unbuilt": 16, "D8.tone-flat": 1}}  # what a run of the creator slice counts, in shape
schema = None
lint = None


def setUpModule() -> None:
    global schema, lint
    support.prepare("carousel-design")
    from _cs import lint as _lint, schema as _schema  # noqa: PLC0415
    schema, lint = _schema, _lint


def tearDownModule() -> None:
    support.cleanup()


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def load(path: Path):
    return json.loads(read(path))


def put(doc, path, value):
    """A deep copy of doc with the value at path (a list of keys and indexes) set, or removed when value is DEL."""
    out = copy.deepcopy(doc)
    node = out
    for key in path[:-1]:
        node = node[key]
    if value is DEL:
        del node[path[-1]]
    else:
        node[path[-1]] = value
    return out


def slide_index(doc, sid):
    return next(i for i, s in enumerate(doc["slides"]) if s["id"] == sid)


def verdict(kind, doc):
    return [[e["path"], e["keyword"]] for e in schema.validate_named(kind, doc)]


class SchemaDefsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.visual = load(EXAMPLES / "spec.visual.example.json")
        cls.spec = load(EXAMPLES / "spec.example.json")
        cls.preset = load(EXAMPLES / "preset.example.json")
        cls.brand = load(EXAMPLES / "brand.example.json")
        cls.qa = load(EXAMPLES / "qa-report.example.json")
        cls.schemas = {k: load(SCHEMA_DIR / f"{k}.schema.json") for k in KINDS}

    def test_picture_asset_cap_and_cover_logo(self) -> None:
        spec = copy.deepcopy(self.spec)
        spec["assets"] = [{"id": "news-logo", "kind": "image", "ref": "data:image/png;base64," + "A" * 120000, "aiGenerated": False}]
        spec.setdefault("cover", {})["logo"] = {"assetId": "news-logo", "ground": "light"}
        self.assertEqual(verdict("spec", spec), [])
        for logo in [{}, {"assetId": "news-logo", "ground": "transparent"}, {"assetId": "../logo"}, {"assetId": "news-logo", "width": 600}]:
            self.assertTrue(verdict("spec", put(spec, ["cover", "logo"], logo)), logo)
        cap = self.schemas["spec"]["$defs"]["asset"]["properties"]["ref"]["maxLength"]
        prefix = "data:image/png;base64,"
        spec["assets"][0]["ref"] = prefix + "A" * (cap - len(prefix))
        self.assertEqual(verdict("spec", spec), [])
        spec["assets"][0]["ref"] += "A"
        self.assertIn(["/assets/0/ref", "maxLength"], verdict("spec", spec))

    def test_dialect_strength_is_optional_and_explicit(self) -> None:
        self.assertEqual(verdict("brand", self.brand), [])
        for strength in ["light", "full"]:
            self.assertEqual(verdict("brand", put(self.brand, ["voice", "dialectStrength"], strength)), [])
        for strength in ["white", "medium", "", None, 1]:
            self.assertIn(["/voice/dialectStrength", "enum"], verdict("brand", put(self.brand, ["voice", "dialectStrength"], strength)))

    # ---- layout, subset, references, shared definitions ------------------------------------------------------------------

    def test_the_layout_is_the_canonical_one_that_add_type_requires(self) -> None:
        for kind in KINDS:
            text = read(SCHEMA_DIR / f"{kind}.schema.json")
            self.assertEqual(text, json.dumps(json.loads(text), indent=2, ensure_ascii=False) + "\n", kind)
            self.assertEqual(list(self.schemas[kind]["$defs"]), sorted(self.schemas[kind]["$defs"]), f"{kind}: $defs stay sorted")

    def test_no_keyword_outside_the_subset_and_portable_anchored_patterns(self) -> None:
        banned = {"patternProperties", "propertyNames", "if", "then", "else", "dependentRequired", "dependentSchemas", "prefixItems", "contains", "not",
                  "unevaluatedProperties", "unevaluatedItems", "additionalItems", "$dynamicRef", "$anchor"}

        def walk(node, where):
            if isinstance(node, list):
                for i, item in enumerate(node):
                    walk(item, f"{where}/{i}")
            elif isinstance(node, dict):
                for key, value in node.items():
                    if key in ("properties", "$defs"):
                        for name, sub in value.items():
                            walk(sub, f"{where}/{key}/{name}")
                        continue
                    if key in ("enum", "const", "default", "examples", "required"):
                        continue
                    self.assertNotIn(key, banned, f"{where}: {key}")
                    if key == "pattern":
                        self.assertTrue(value.startswith("^") and value.endswith("$"), f"{where}: {value} is anchored")
                        self.assertIsNone(re.search(r"\\[dDwWsSbB]", value), f"{where}: {value} has no \\d \\w \\s \\b")
                        self.assertIsNone(re.search(r"\(\?", value), f"{where}: {value} has no lookaround, named group or flag")
                    walk(value, f"{where}/{key}")

        for kind in KINDS:
            self.assertEqual(schema.unsupported_keywords(self.schemas[kind]), [], kind)
            walk(self.schemas[kind], kind)

    def test_every_ref_resolves_and_the_shared_definitions_are_byte_identical(self) -> None:
        owners: dict[str, list[str]] = {}
        for kind, doc in self.schemas.items():
            text = json.dumps(doc)
            for name in re.findall(r'"\$ref": "#/\$defs/([A-Za-z0-9_.-]+)"', text):
                self.assertIn(name, doc["$defs"], f"{kind}: {name} resolves")
            for name in doc.get("x-sharedDefs", []):
                self.assertIn(name, doc["$defs"], f"{kind} lists {name} as shared and defines it")
                owners.setdefault(name, []).append(kind)
            self.assertEqual(doc.get("x-sharedDefs", []), sorted(doc.get("x-sharedDefs", [])), f"{kind}: x-sharedDefs sorted")
        for name, kinds in owners.items():
            copies = {json.dumps(self.schemas[k]["$defs"][name]) for k in kinds}
            self.assertEqual(len(copies), 1, f"{name} differs between {kinds}")
        self.assertEqual(sorted(owners["iconName"]), ["brand", "spec"])
        self.assertEqual(sorted(owners["qaResult"]), ["qa-report", "spec"])
        self.assertEqual(sorted(owners["slideType"]), ["preset", "spec"])

    def test_the_vocabulary_of_spec_5_2_is_in_the_schema(self) -> None:
        d = self.schemas["spec"]["$defs"]
        anchor = d["anchor"]["properties"]
        self.assertEqual(anchor["kind"]["enum"], ["none", "icon", "scene", "rows", "numeral", "chart", "mock", "photo", "field", "word", "pattern"])
        self.assertEqual(len(anchor["template"]["enum"]), 23)
        self.assertNotIn("numeral", anchor, "S-20: value and unit, not numeral")
        self.assertIn("value", anchor)
        self.assertIn("unit", anchor)
        self.assertEqual(d["anchor"]["required"], ["kind"])
        self.assertEqual(len(d["chart"]["properties"]["kind"]["enum"]), 12)
        self.assertEqual(d["chart"]["properties"]["values"]["maxItems"], 8)
        self.assertEqual(len(d["mock"]["properties"]["kind"]["enum"]), 14)
        self.assertEqual(d["demo"]["properties"]["lines"]["maxItems"], 3)
        self.assertEqual(d["world"]["properties"]["artefact"]["enum"][-3:], ["notes", "chat", "generic"])
        self.assertEqual(d["visual"]["properties"]["recipe"]["enum"], ["under", "over", "start", "end", "full", "band", "corner", "center", "half"])
        slide = d["slide"]["properties"]
        self.assertEqual(slide["items"]["maxItems"], 6)
        self.assertTrue({"visual", "items", "demo"} <= set(slide))
        self.assertTrue({"frame", "zoom", "backdropAssetId"} <= set(d["media"]["properties"]))
        style = self.schemas["spec"]["properties"]["style"]["properties"]
        self.assertTrue({"visualMode", "planV", "world", "motif", "rail", "thread", "panorama"} <= set(style))
        self.assertIn("remix", self.schemas["spec"]["properties"])
        frozen = self.schemas["spec"]["properties"]["frozen"]["properties"]
        self.assertEqual(frozen["sizes"]["additionalProperties"]["maximum"], 640)
        self.assertIn("visual", frozen)
        self.assertNotIn("marks", frozen)
        preset = self.schemas["preset"]["properties"]
        self.assertTrue({"art", "tones"} <= set(preset))
        self.assertEqual(set(preset["tones"]["properties"]), {"invert", "field"})
        self.assertIn("art", self.schemas["brand"]["properties"]["visual"]["properties"])

    # ---- documents -------------------------------------------------------------------------------------------------------

    def test_the_examples_fixtures_and_shipped_presets_validate(self) -> None:
        for kind, path in [("spec", "spec.example.json"), ("spec", "spec.visual.example.json"), ("preset", "preset.example.json"),
                           ("brand", "brand.example.json"), ("qa-report", "qa-report.example.json")]:
            self.assertEqual(verdict(kind, load(EXAMPLES / path)), [], path)
        fixtures = sorted((REPO / "tests" / "fixtures").glob("spec.*.json")) + sorted((REPO / "tests" / "fixtures").glob("brand.*.json"))
        self.assertGreaterEqual(len(fixtures), 8)
        for path in fixtures:
            self.assertEqual(verdict(path.name.split(".")[0], load(path)), [], path.name)
        self.assertEqual(verdict("spec", load(REPO / "tools" / "examples" / "showcase.spec.json")), [])
        presets = sorted((DESIGN / "styles").glob("*/preset.json"))
        self.assertEqual(len(presets), 6)
        for path in presets:
            self.assertEqual(verdict("preset", load(path)), [], path.parent.name)

    def test_the_visual_example_carries_the_new_fields(self) -> None:
        samples = self.visual["slides"] + self.visual["ext"]["visualExamples"]
        kinds = {s["visual"]["anchor"]["kind"] for s in samples if "visual" in s}
        self.assertEqual(kinds, {"none", "icon", "scene", "rows", "numeral", "chart", "mock", "word", "pattern"})
        self.assertTrue(any("items" in s for s in self.visual["slides"]))
        self.assertTrue(any("demo" in s for s in self.visual["slides"]))
        self.assertTrue(any("frame" in s.get("media", {}) for s in self.visual["slides"]))
        self.assertEqual(sorted(self.visual["style"])[:3], ["metaLabel", "motif", "panorama"])
        self.assertIn("remix", self.visual)

    def test_the_gate_ids_of_is_8_are_admitted_by_the_qa_report(self) -> None:
        rules = ["D9.band", "D9.rect", "D9.fill", "D9.container-fill", "D9.plate-calm", "VA1", "VA2", "VA3", "VA4.chart-honesty", "VA5.relaxed", "VA5.no-bold",
                 "VA6", "VA7", "VA8.constraints", "D8.anchor-run", "D8.tone-run", "D10.nesting", "D10.icon-tile-stack", "D10.side-border", "D10.icon-system",
                 "D10.stroke-feed", "D10.art-label", "D10.glyph-icon", "D10.edge-fragment", "D10.squint", "D11.tokens", "D11.thread-drift", "D11.seam",
                 "C2.body-with-art", "C2.demo-words", "C2.demo-missing", "C2.demo-duplicate", "C2.figure-repeat", "RX1.visual-distance",
                 "C2.text-dropped", "C2.text-duplicated", "C2.word-echo", "D8.tone-flat", "VA9.anchor-unbuilt"]
        results = [{"gate": r.split(".")[0], "rule": r, "sev": "NOTE", "msg": {"ar": "ملاحظة", "en": "Note"}, **({"prospect": True} if i % 2 else {})}
                   for i, r in enumerate(rules)]
        self.assertEqual(verdict("qa-report", put(self.qa, ["results"], results)), [])
        spec = put(self.visual, ["qa"], {"status": "pass", "results": results})
        self.assertEqual(verdict("spec", spec), [])
        self.assertEqual(verdict("qa-report", put(self.qa, ["results"], [{**results[0], "gate": "D9.band"}])), [["/results/0/gate", "pattern"]])
        self.assertEqual(verdict("qa-report", put(self.qa, ["results"], [{**results[0], "prospect": 1}])), [["/results/0/prospect", "type"]])

    def test_the_qa_report_has_a_home_for_the_executed_gate_counts(self) -> None:
        """wave 2b: `stats.gates` is optional, a closed object of integer counts >= 0 (a registered gate that had nothing to check counts 0, the lead's decision); the report stays closed to any other key."""
        self.assertEqual(verdict("qa-report", self.qa), [], "the example has no stats and stays valid")
        self.assertEqual(verdict("qa-report", put(self.qa, ["stats"], STATS)), [])
        self.assertEqual(verdict("qa-report", put(self.qa, ["stats"], {"gates": {}})), [])
        self.assertEqual(verdict("qa-report", put(self.qa, ["stats"], {"gates": {"C2": 0}})), [], "a registered gate with nothing to check counts 0")
        self.assertEqual(verdict("qa-report", put(self.qa, ["stats"], {"gates": {"C2": -1}})), [["/stats/gates/C2", "minimum"]])
        self.assertEqual(verdict("qa-report", put(self.qa, ["stats"], {"gates": {"C2": 1.5}})), [["/stats/gates/C2", "type"]])
        self.assertEqual(verdict("qa-report", put(self.qa, ["stats"], {"gates": {"C2": "3"}})), [["/stats/gates/C2", "type"]])
        self.assertEqual(verdict("qa-report", put(self.qa, ["stats"], {})), [["/stats/gates", "required"]])
        self.assertEqual(verdict("qa-report", put(self.qa, ["stats"], {"gates": {"C2": 1}, "slides": 16})), [["/stats/slides", "additionalProperties"]])
        self.assertEqual(verdict("qa-report", put(self.qa, ["gates"], {"C2": 1})), [["/gates", "additionalProperties"]], "an unknown top-level key is still refused")
        doc = load(SCHEMA_DIR / "qa-report.schema.json")
        self.assertNotIn("stats", doc["required"])
        self.assertEqual(doc["properties"]["stats"]["properties"]["gates"]["additionalProperties"], {"type": "integer", "minimum": 0})

    def test_validate_py_reads_a_report_with_stats_and_refuses_an_unknown_key(self) -> None:
        script = DESIGN / "scripts" / "validate.py"
        with tempfile.TemporaryDirectory(prefix="cs-qa-stats-") as tmp:
            good, bad = Path(tmp) / "good.json", Path(tmp) / "bad.json"
            good.write_text(json.dumps(put(self.qa, ["stats"], STATS), ensure_ascii=False), encoding="utf-8")
            bad.write_text(json.dumps(put(put(self.qa, ["stats"], STATS), ["bogus"], 1), ensure_ascii=False), encoding="utf-8")
            ok = subprocess.run([sys.executable, "-X", "utf8", str(script), "qa-report", str(good)], capture_output=True, text=True, encoding="utf-8", env=ENV, timeout=120)
            self.assertEqual(ok.returncode, 0, ok.stdout + ok.stderr)
            self.assertIn("OK", ok.stdout)
            no = subprocess.run([sys.executable, "-X", "utf8", str(script), "qa-report", str(bad)], capture_output=True, text=True, encoding="utf-8", env=ENV, timeout=120)
            self.assertEqual(no.returncode, 2, no.stdout + no.stderr)
            self.assertIn("INVALID", no.stdout)

    # ---- agreement with the JavaScript validator -------------------------------------------------------------------------

    def vectors(self) -> list:
        v, s, p, b, q = json.loads(json.dumps(self.visual)), self.spec, self.preset, self.brand, self.qa
        v["slides"] = [sl for sl in v["slides"] if sl["id"] not in ("s02", "s13")] + [sl for sl in v["ext"]["visualExamples"] if sl["id"] != "s11"]
        for j, sl in enumerate(v["slides"]):
            sl["n"] = j + 1
        i = lambda sid: ["slides", slide_index(v, sid)]  # noqa: E731
        frozen = put(v, ["frozen"], {"engine": "cs-1.1.1", "tokensHash": "0123456789abcdef", "approvedAt": "2026-10-23T11:00:00Z",
                                     "lines": {"s03.title": ["نسبة", "الحفظ"]}, "sizes": {"s03.number": 520},
                                     "visual": {"marks": {"s02": [{"id": "circle-1", "x": 1.5, "y": 2.5}]}, "anchors": {"s03": {"w": 852, "h": 560.5}}}})
        art = lambda pth, val: put(p, ["art"] + pth, val)  # noqa: E731
        tone = lambda role, val: put(p, ["tones", "field", "roles", role], val)  # noqa: E731
        brand_art = put(b, ["visual", "art"], {"constraints": {"figures": "faceless", "animals": "none"}, "prefer": ["numeral"], "avoid": ["scene"],
                                                "motifIcon": "bookmark", "chartAxis": {"categories": "rtl", "time": "ltr"}, "support": ["#FF8FB1", "#6EC6FF"],
                                                "numerals": "western"})
        out = [
            ("example visual", "spec", v), ("example spec", "spec", s), ("example preset", "preset", p), ("example brand", "brand", b), ("example qa", "qa-report", q),
            ("frozen ok", "spec", frozen), ("brand art ok", "brand", brand_art),
            ("size 640", "spec", put(frozen, ["frozen", "sizes", "s03.number"], 640)),
            ("size 641", "spec", put(frozen, ["frozen", "sizes", "s03.number"], 641)),
            ("size 11", "spec", put(frozen, ["frozen", "sizes", "s03.number"], 11)),
            ("frozen.marks", "spec", put(frozen, ["frozen", "marks"], {})),
            ("frozen mark empty", "spec", put(frozen, ["frozen", "visual", "marks", "s02"], [{}])),
            ("frozen mark string", "spec", put(frozen, ["frozen", "visual", "marks", "s02"], ["circle"])),
            ("frozen marks 9", "spec", put(frozen, ["frozen", "visual", "marks", "s02"], [{"id": "circle-1"}] * 9)),
            ("anchors without h", "spec", put(frozen, ["frozen", "visual", "anchors", "s03"], {"w": 1})),
            ("anchor kind", "spec", put(v, i("s03") + ["visual", "anchor", "kind"], "diagram")),
            ("anchor without kind", "spec", put(v, i("s03") + ["visual", "anchor", "kind"], DEL)),
            ("anchor.numeral", "spec", put(v, i("s03") + ["visual", "anchor", "numeral"], "74")),
            ("items 7", "spec", put(v, i("s08") + ["items"], [{"title": "ا"}] * 7)),
            ("items 6", "spec", put(v, i("s08") + ["items"], [{"title": "ا"}] * 6)),
            ("item without title", "spec", put(v, i("s08") + ["items", 0, "title"], DEL)),
            ("item mark", "spec", put(v, i("s08") + ["items", 0, "mark"], "star")),
            ("icon upper", "spec", put(v, i("s04") + ["visual", "anchor", "icon"], "LightBulb")),
            ("icon prefix", "spec", put(v, i("s04") + ["visual", "anchor", "icon"], "tb-bookmark")),
            ("icon 7 words", "spec", put(v, i("s04") + ["visual", "anchor", "icon"], "a-b-c-d-e-f-g")),
            ("icon empty", "spec", put(v, i("s04") + ["visual", "anchor", "icon"], "")),
            ("icon underscore", "spec", put(v, i("s04") + ["visual", "anchor", "icon"], "hour_glass")),
            ("demo 4 lines", "spec", put(v, i("s06") + ["demo", "lines"], [{"text": "ا"}] * 4)),
            ("demo no lines", "spec", put(v, i("s06") + ["demo", "lines"], [])),
            ("demo who", "spec", put(v, i("s06") + ["demo", "lines", 0, "who"], "you")),
            ("chart 9 values", "spec", put(v, i("s09") + ["visual", "anchor", "chart", "values"], [{"label": "ج", "value": 1}] * 9)),
            ("chart no values", "spec", put(v, i("s09") + ["visual", "anchor", "chart", "values"], DEL)),
            ("chart kind", "spec", put(v, i("s09") + ["visual", "anchor", "chart", "kind"], "radar")),
            ("chart value type", "spec", put(v, i("s09") + ["visual", "anchor", "chart", "values", 0, "value"], "41")),
            ("mock kind", "spec", put(v, i("s06") + ["visual", "anchor", "mock", "kind"], "tweet")),
            ("mock highlight", "spec", put(v, i("s06") + ["visual", "anchor", "mock", "highlight"], 6)),
            ("mock artefact", "spec", put(v, i("s12") + ["visual", "anchor", "mock", "artefact"], "invoice")),
            ("world artefact", "spec", put(v, ["style", "world", "artefact"], "invoice")),
            ("world bias", "spec", put(v, ["style", "world", "toneBias"], "loud")),
            ("world prefer 5", "spec", put(v, ["style", "world", "mockPrefer"], ["chat", "dm", "notes", "poll", "card"])),
            ("recipe", "spec", put(v, i("s03") + ["visual", "recipe"], "left")),
            ("marks 4", "spec", put(v, i("s03") + ["visual", "marks"], ["arrow", "circle", "strike", "stars"])),
            ("marks repeat", "spec", put(v, i("s03") + ["visual", "marks"], ["arrow", "arrow"])),
            ("relax 9", "spec", put(v, i("s03") + ["visual", "relax"], 9)),
            ("relax 2.5", "spec", put(v, i("s03") + ["visual", "relax"], 2.5)),
            ("rowIcons 9", "spec", put(v, i("s07") + ["visual", "rowIcons"], ["eye"] * 9)),
            ("span id", "spec", put(v, i("s05") + ["visual", "span", "with"], "6")),
            ("span kind", "spec", put(v, i("s05") + ["visual", "span", "kind"], "wave")),
            ("alt 161", "spec", put(v, i("s03") + ["visual", "alt"], "ا" * 161)),
            ("frame", "spec", put(v, i("s10") + ["media", "frame"], "laptop")),
            ("zoom 1.5", "spec", put(v, i("s10") + ["media", "zoom", "w"], 1.5)),
            ("zoom no h", "spec", put(v, i("s10") + ["media", "zoom", "h"], DEL)),
            ("backdrop id", "spec", put(v, i("s10") + ["media", "backdropAssetId"], "Bad Id")),
            ("visualMode", "spec", put(v, ["style", "visualMode"], "on")),
            ("rail", "spec", put(v, ["style", "rail"], "bars")),
            ("thread", "spec", put(v, ["style", "thread"], "yes")),
            ("panorama", "spec", put(v, ["style", "panorama", "enabled"], DEL)),
            ("motif", "spec", put(v, ["style", "motif"], "Book Mark")),
            ("planV 61", "spec", put(v, ["style", "planV"], "x" * 61)),
            ("remix mode", "spec", put(v, ["remix", "mode"], DEL)),
            ("remix hash", "spec", put(v, ["remix", "coverHash"], "112233445566778")),
            ("remix lineage", "spec", put(v, ["remix", "lineage"], ["a1b2c3d4e5f60718"] * 6)),
            ("remix refresh", "spec", put(v, ["remix", "refresh"], ["body"])),
            ("tone unknown role", "preset", tone("bg", "ink2")),
            ("tone unknown form", "preset", tone("bg", {"blend": ["ink", "bg", 0.5]})),
            ("tone mix short", "preset", tone("bg", {"mix": ["ink", "bg"]})),
            ("tone mix ok", "preset", tone("bg", {"mix": ["ink", "bg", 0.1]})),
            ("tone lightness", "preset", tone("accent", {"lightness": ["accent", 0.72]})),
            ("tone muted", "preset", tone("inkMuted", {"muted": 4.5})),
            ("tone muted high", "preset", tone("inkMuted", {"muted": 30})),
            ("tone pick long", "preset", tone("accent", {"pick": [["ink"], 3, 1]})),
            # the numeric bounds of spec 5.5, one vector per boundary: a mix fraction and an OKLCH lightness are 0..1, a contrast floor is 1..21
            ("tone mix 0", "preset", tone("bg", {"mix": ["ink", "bg", 0]})),
            ("tone mix 1", "preset", tone("bg", {"mix": ["ink", "bg", 1]})),
            ("tone mix above 1", "preset", tone("bg", {"mix": ["ink", "bg", 1.01]})),
            ("tone mix 20", "preset", tone("bg", {"mix": ["ink", "bg", 20]})),
            ("tone mix below 0", "preset", tone("bg", {"mix": ["ink", "bg", -0.01]})),
            ("tone lightness 0", "preset", tone("accent", {"lightness": ["accent", 0]})),
            ("tone lightness 1", "preset", tone("accent", {"lightness": ["accent", 1]})),
            ("tone lightness above 1", "preset", tone("accent", {"lightness": ["accent", 1.01]})),
            ("tone lightness 21", "preset", tone("accent", {"lightness": ["accent", 21]})),
            ("tone lightness below 0", "preset", tone("accent", {"lightness": ["accent", -0.1]})),
            ("tone muted 1", "preset", tone("inkMuted", {"muted": 1})),
            ("tone muted 21", "preset", tone("inkMuted", {"muted": 21})),
            ("tone muted below 1", "preset", tone("inkMuted", {"muted": 0.99})),
            ("tone muted above 21", "preset", tone("inkMuted", {"muted": 21.01})),
            ("tone pick 1", "preset", tone("accent", {"pick": [["ink", "surface"], 1]})),
            ("tone pick 21", "preset", tone("accent", {"pick": [["ink", "surface"], 21]})),
            ("tone pick below 1", "preset", tone("accent", {"pick": [["ink", "surface"], 0.99]})),
            ("tone pick above 21", "preset", tone("accent", {"pick": [["ink", "surface"], 21.01]})),
            ("tone pick 5 roles", "preset", tone("accent", {"pick": [["ink", "surface", "bg", "accent", "accent2"], 3]})),
            ("tone pick no roles", "preset", tone("accent", {"pick": [[], 3]})),
            ("tone missing role", "preset", put(p, ["tones", "invert", "roles", "surface"], DEL)),
            ("tone base", "preset", put(p, ["tones", "base"], {"roles": {}})),
            ("shadow kind", "preset", art(["shadow", "kind"], "glow")),
            ("shadow ok", "preset", art(["shadow"], {"kind": "hard", "dx": 6, "dy": 6})),
            ("objectOutline hi", "preset", art(["objectOutline"], 0.05)),
            ("objectOutline lo", "preset", art(["objectOutline"], 0.02)),
            ("cap", "preset", art(["cap"], "flat")),
            ("container", "preset", art(["container"], "plate")),
            ("support 1", "preset", art(["colors", "support"], ["#1D4ED8"])),
            ("note hex", "preset", art(["colors", "note"], "FFE88A")),
            ("affinity key", "preset", art(["affinity", "mocks"], 0.4)),
            ("affinity hi", "preset", art(["affinity", "mock"], 1.2)),
            ("radius key", "preset", art(["radius", "pill"], 4)),
            ("retrace str", "preset", art(["retrace"], "yes")),
            ("retrace true", "preset", art(["retrace"], True)),
            ("retrace obj", "preset", art(["retrace"], {"dx": 0.5, "dy": 0.4, "rot": 0.8, "tint": "accent2"})),
            ("hand partial", "preset", art(["hand"], {"family": "playpen-sans-arabic"})),
            ("hand ok", "preset", art(["hand"], {"family": "playpen-sans-arabic", "wght": 400})),
            ("outlineColor", "preset", art(["outlineColor"], "navy")),
            ("art key", "preset", art(["surprise"], 1)),
            ("numeral scale", "preset", put(p, ["type", "scale", "numeral"], [280, 520])),
            ("numeral 700", "preset", put(p, ["type", "scale", "numeral"], [280, 700])),
            ("variants 5", "preset", put(p, ["variants", "compare"], ["columns", "stacked", "versus", "table", "before-after"])),
            ("variants 9", "preset", put(p, ["variants", "compare"], ["columns"] * 9)),
            ("showOn 20", "preset", put(p, ["chrome", "savePill", "showOn"], ["cta"] * 20)),
            ("showOn 21", "preset", put(p, ["chrome", "savePill", "showOn"], ["cta"] * 21)),
            ("brand figures", "brand", put(brand_art, ["visual", "art", "constraints", "figures"], "some")),
            ("brand animals bool", "brand", put(brand_art, ["visual", "art", "constraints", "animals"], True)),
            ("brand prefer", "brand", put(brand_art, ["visual", "art", "prefer"], ["diagram"])),
            ("brand avoid dup", "brand", put(brand_art, ["visual", "art", "avoid"], ["scene", "scene"])),
            ("brand motif", "brand", put(brand_art, ["visual", "art", "motifIcon"], "Book")),
            ("brand axis", "brand", put(brand_art, ["visual", "art", "chartAxis", "time"], "up")),
            ("brand support", "brand", put(brand_art, ["visual", "art", "support"], ["#FF8FB1", "blue"])),
            ("brand numerals", "brand", put(brand_art, ["visual", "art", "numerals"], "roman")),
            ("qa prospect", "qa-report", put(q, ["results", 0, "prospect"], True)),
            ("qa prospect str", "qa-report", put(q, ["results", 0, "prospect"], "yes")),
            ("qa gate lower", "qa-report", put(q, ["results", 0, "gate"], "d9")),
            ("qa rule", "qa-report", put(q, ["results", 0, "rule"], "D9.band")),
            ("qa stats", "qa-report", put(q, ["stats"], STATS)),
            ("qa stats empty gates", "qa-report", put(q, ["stats"], {"gates": {}})),
            ("qa stats zero", "qa-report", put(q, ["stats"], {"gates": {"C2": 0}})),
            ("qa stats float", "qa-report", put(q, ["stats"], {"gates": {"C2": 1.5}})),
            ("qa stats string", "qa-report", put(q, ["stats"], {"gates": {"C2": "3"}})),
            ("qa stats no gates", "qa-report", put(q, ["stats"], {})),
            ("qa stats extra key", "qa-report", put(q, ["stats"], {"gates": {"C2": 1}, "slides": 16})),
            ("qa stats array", "qa-report", put(q, ["stats"], [])),
            ("qa unknown key", "qa-report", put(q, ["gates"], {"C2": 1})),
        ]
        return out

    def test_the_python_and_the_javascript_validators_agree_on_every_vector(self) -> None:
        node = shutil.which("node")
        if not node:
            self.skipTest("node is not installed; the JavaScript half of the agreement is checked by tests/unit/js/lib/schema-visual.test.mjs")
        vectors = self.vectors()
        self.assertGreaterEqual(len(vectors), 100)
        python = {name: verdict(kind, doc) for name, kind, doc in vectors}
        self.assertEqual(python, {name: verdict(kind, doc) for name, kind, doc in vectors}, "run twice, compare")
        code = (
            "const { loadLib, readJson } = await import(process.env.CS_LOAD_LIB);\n"
            "const CS = loadLib();\n"
            "const kinds = " + json.dumps(list(KINDS)) + ";\n"
            "kinds.forEach((k) => CS.core.schema.register(k, readJson('plugins/carousel-studio/skills/carousel-design/schemas/' + k + '.schema.json')));\n"
            "let raw = ''; for await (const chunk of process.stdin) raw += chunk;\n"
            "const out = JSON.parse(raw).map(([name, kind, doc]) => [name, CS.core.schema.validate(kind, doc).errors.map((e) => [e.path, e.keyword])]);\n"
            "process.stdout.write(JSON.stringify(out));\n"
        )
        load_lib = (REPO / "tests" / "unit" / "js" / "lib" / "load-lib.mjs").as_uri()
        res = subprocess.run([node, "--input-type=module", "-e", code], input=json.dumps(vectors, ensure_ascii=False), capture_output=True, text=True,
                             encoding="utf-8", env={**ENV, "CS_LOAD_LIB": load_lib}, cwd=str(REPO), timeout=120)
        self.assertEqual(res.returncode, 0, res.stderr)
        js = {name: errs for name, errs in json.loads(res.stdout)}
        for name in python:
            self.assertEqual(js[name], python[name], name)
        # the vectors are not all valid and not all invalid
        self.assertGreater(sum(1 for e in python.values() if not e), 15)
        self.assertGreater(sum(1 for e in python.values() if e), 60)

    def test_validate_py_accepts_the_examples_the_way_the_card_runs_it(self) -> None:
        script = DESIGN / "scripts" / "validate.py"
        for kind, name in [("spec", "spec.example.json"), ("spec", "spec.visual.example.json"), ("preset", "preset.example.json")]:
            res = subprocess.run([sys.executable, str(script), kind, str(EXAMPLES / name)], capture_output=True, text=True, encoding="utf-8", env=ENV, timeout=120)
            self.assertEqual(res.returncode, 0, name + res.stdout + res.stderr)
            self.assertIn("OK", res.stdout)
        res = subprocess.run([sys.executable, str(script), "spec", str(EXAMPLES / "spec.visual.example.json"), "--checkpoint", "script"], capture_output=True,
                             text=True, encoding="utf-8", env=ENV, timeout=120)
        self.assertEqual(res.returncode, 0, res.stdout + res.stderr)

    # ---- sizes ------------------------------------------------------------------------------------------------------------

    @staticmethod
    def measured(kind: str) -> tuple[int, int]:
        """(bytes on disk, bytes of the compact serialisation) of one schema file."""
        raw = (SCHEMA_DIR / f"{kind}.schema.json").read_bytes()
        compact = json.dumps(json.loads(raw.decode("utf-8")), separators=(",", ":"), ensure_ascii=False).encode("utf-8")
        return len(raw), len(compact)

    def test_gr_5_every_schema_and_example_is_under_256_kib(self) -> None:
        for kind in KINDS:
            self.assertLess(self.measured(kind)[0], 256 * 1024, kind)
        for name in ("spec.visual.example.json", "preset.example.json"):
            self.assertLess(len((EXAMPLES / name).read_bytes()), 20_000, name)

    def test_the_amended_budget_holds_on_disk(self) -> None:
        """Spec <= 52 KB, preset <= 26 KB, brand within the card's +2 KB: the limits the lead recorded (wave 2b), measured on the file as it is written."""
        self.assertEqual(BUDGET, {"spec": 52_000, "preset": 26_000, "brand": 35_459})
        for kind, limit in BUDGET.items():
            size = self.measured(kind)[0]
            self.assertLessEqual(size, limit, f"{kind}: {size} bytes on disk, limit {limit}")
        brand = self.measured("brand")[0] - BASELINE["brand"]
        self.assertLessEqual(brand, 2_000, f"brand: +{brand} bytes on disk against the card's +2,000")

    def test_growth_on_disk_is_visible(self) -> None:
        """The layout of tools/add_type.py (json.dumps indent=2) is why the spec and the preset are far over the card on disk: these ceilings only stop creep."""
        for kind, ceiling in DISK_CEILING.items():
            size = self.measured(kind)[0]
            self.assertLessEqual(size, ceiling, f"{kind}: {size} bytes on disk")

    def test_the_example_is_in_the_canonical_layout_with_nbsp_escaped(self) -> None:
        text = read(EXAMPLES / "spec.visual.example.json")
        again = json.dumps(json.loads(text), indent=2, ensure_ascii=False) + "\n"
        self.assertEqual(text, again.replace(chr(0xA0), chr(92) + "u00a0"))

    # ---- authored Arabic (GR-7) --------------------------------------------------------------------------------------------

    @staticmethod
    def strings(value, path=""):
        if isinstance(value, str):
            yield path, value
        elif isinstance(value, dict):
            for key, item in value.items():
                yield from SchemaDefsTests.strings(item, f"{path}/{key}")
        elif isinstance(value, list):
            for i, item in enumerate(value):
                yield from SchemaDefsTests.strings(item, f"{path}/{i}")

    def test_the_new_examples_carry_no_tashkeel_and_pass_the_egyptian_lint(self) -> None:
        """Schema validity says nothing about the words in a valid document: GR-7 wants authored Arabic without tashkeel, proofread in its dialect.
        The raw text is scanned too, so a mark in a key or an escaped form cannot slip past the string walk."""
        for name in ("spec.visual.example.json", "preset.example.json"):
            raw = read(EXAMPLES / name)
            self.assertIsNone(TASHKEEL.search(raw), f"{name}: a tashkeel mark in the file text")
            self.assertIsNone(re.search(r"\\u06(4[b-f]|5[0-9a-f]|70)", raw, re.I), f"{name}: an escaped tashkeel mark")
            doc = json.loads(raw)
            dialect = (doc.get("locale") or {}).get("dialect", "eg")
            self.assertEqual(dialect, "eg", name)
            walked = 0
            for where, text in self.strings(doc):
                if not ARABIC.search(text):
                    continue
                walked += 1
                self.assertIsNone(TASHKEEL.search(text), f"{name}{where}: tashkeel in {text[:30]}")
                found = [(i["rule"], i["sev"], text[i["start"]:i["end"]]) for i in lint.lint_text(text, dialect=dialect, digits="western")
                         if i["sev"] in ("BLOCK", "FIX")]
                self.assertEqual(found, [], f"{name}{where}: {text[:40]}")
            self.assertGreaterEqual(walked, 3 if name.startswith("preset") else 100, f"{name}: the walk saw its Arabic strings")

    # ---- tone expressions (spec 5.5) -----------------------------------------------------------------------------------------

    def test_tone_numbers_are_bounded_where_the_grammar_bounds_them(self) -> None:
        tone = lambda role, val: put(self.preset, ["tones", "field", "roles", role], val)  # noqa: E731
        bad = [["/tones/field/roles/bg", "oneOf"]]
        self.assertEqual(verdict("preset", tone("bg", {"mix": ["ink", "bg", 0]})), [])
        self.assertEqual(verdict("preset", tone("bg", {"mix": ["ink", "bg", 1]})), [])
        for number in (1.01, 20, 21, -0.01):
            self.assertEqual(verdict("preset", tone("bg", {"mix": ["ink", "bg", number]})), bad, f"mix {number}")
        for number in (0, 1):
            self.assertEqual(verdict("preset", tone("accent", {"lightness": ["accent", number]})), [], f"lightness {number}")
        for number in (1.01, 21, -0.1):
            self.assertEqual(verdict("preset", tone("accent", {"lightness": ["accent", number]})), [["/tones/field/roles/accent", "oneOf"]], f"lightness {number}")
        for number in (1, 4.7, 21):
            self.assertEqual(verdict("preset", tone("inkMuted", {"muted": number})), [], f"muted {number}")
            self.assertEqual(verdict("preset", tone("accent", {"pick": [["ink", "surface"], number]})), [], f"pick {number}")
        for number in (0.99, 21.01, 30, -1):
            self.assertEqual(verdict("preset", tone("inkMuted", {"muted": number})), [["/tones/field/roles/inkMuted", "oneOf"]], f"muted {number}")
            self.assertEqual(verdict("preset", tone("accent", {"pick": [["ink", "surface"], number]})), [["/tones/field/roles/accent", "oneOf"]], f"pick {number}")
        self.assertEqual(verdict("preset", tone("accent", {"pick": [["ink", "surface", "bg", "accent", "accent2"], 3]})), [["/tones/field/roles/accent", "oneOf"]])
        self.assertEqual(verdict("preset", tone("accent", {"pick": [[], 3]})), [["/tones/field/roles/accent", "oneOf"]])

    @staticmethod
    def tone_shape_errors(value) -> list[str]:
        """The reference checker for what the restricted schema subset cannot say: which array position holds a role and which a number
        (CONTRACT 3.1 has no prefixItems). preset_lint.lint_tones (E4b) and the resolver (E2b) are the owners of this check; these are its vectors."""
        names = ("bg", "surface", "ink", "inkMuted", "accent", "accent2")
        role = lambda x: isinstance(x, str) and x in names  # noqa: E731
        num = lambda x, lo, hi: isinstance(x, (int, float)) and not isinstance(x, bool) and lo <= x <= hi  # noqa: E731
        if isinstance(value, str):
            return [] if role(value) else ["role"]
        if not isinstance(value, dict) or len(value) != 1:
            return ["form"]
        (key, args), = value.items()
        if key == "mix":
            ok = isinstance(args, list) and len(args) == 3 and role(args[0]) and role(args[1]) and num(args[2], 0, 1)
        elif key == "lightness":
            ok = isinstance(args, list) and len(args) == 2 and role(args[0]) and num(args[1], 0, 1)
        elif key == "muted":
            ok = num(args, 1, 21)
        elif key == "pick":
            ok = (isinstance(args, list) and len(args) == 2 and isinstance(args[0], list) and 1 <= len(args[0]) <= 4
                  and all(role(r) for r in args[0]) and num(args[1], 1, 21))
        else:
            ok = False
        return [] if ok else [f"{key} position"]

    TONE_POSITION_GAP = (
        {"mix": [0.1, 0.2, 0.3]}, {"mix": ["bg", "ink", "bg"]}, {"mix": [0.5, "ink", "bg"]}, {"mix": ["ink", 0.5, "bg"]},
        {"lightness": [0.5, "ink"]}, {"lightness": ["ink", "bg"]},
        {"pick": [3, 3]}, {"pick": [3, ["ink"]]}, {"pick": [["ink"], ["bg"]]},
    )

    def test_tuple_positions_are_a_lint_job_and_the_gap_is_pinned(self) -> None:
        """Hand-off (review round 1, finding 1). The subset has `items` as one schema, so [role, role, number] cannot be written; the shapes below are
        accepted by the schema in both engines and refused by the reference checker. If this test starts failing because the schema now refuses them,
        the check has moved into the schema: delete the pin, keep the checker for the lint. The data that exists is held to the positions today."""
        for value in self.TONE_POSITION_GAP:
            doc = put(self.preset, ["tones", "field", "roles", "bg"], value)
            self.assertEqual(verdict("preset", doc), [], f"the schema (the subset) accepts {value}")
            self.assertNotEqual(self.tone_shape_errors(value), [], f"the reference checker refuses {value}")
        shipped = [self.preset] + [load(path) for path in sorted((DESIGN / "styles").glob("*/preset.json"))]
        seen = 0
        for preset in shipped:
            for tone_name, tone in (preset.get("tones") or {}).items():
                for role, value in tone["roles"].items():
                    seen += 1
                    self.assertEqual(self.tone_shape_errors(value), [], f"{preset.get('id')} {tone_name}.{role}")
        self.assertGreaterEqual(seen, 10, "the example preset alone defines two tones of five roles")

    def test_the_marks_a_frozen_deck_stores_are_never_empty(self) -> None:
        frozen = put(self.visual, ["frozen"], {"engine": "cs-1.1.1", "tokensHash": "0123456789abcdef", "approvedAt": "2026-10-23T11:00:00Z",
                                               "lines": {"s03.title": ["نسبة", "الحفظ"]}, "sizes": {"s03.number": 520},
                                               "visual": {"marks": {"s02": [{"id": "circle-1", "x": 1.5, "y": 2.5}]}, "anchors": {}}})
        self.assertEqual(verdict("spec", frozen), [])
        self.assertEqual(verdict("spec", put(frozen, ["frozen", "visual", "marks", "s02"], [{}])), [["/frozen/visual/marks/s02/0", "minProperties"]])
        self.assertEqual(verdict("spec", put(frozen, ["frozen", "visual", "marks", "s02"], ["circle"])), [["/frozen/visual/marks/s02/0", "type"]])


if __name__ == "__main__":
    unittest.main()
