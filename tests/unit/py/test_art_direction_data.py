"""D11 and D11b: data/art-direction.json, the tables the planner reads (CS.visual.plan, _cs/art_plan.py) and the Art Director applies by hand.

Checks what the data promises to its readers: every enum value is one the schema (spec 5.2, IS-5) allows, every type has a floor candidate that
needs no data, every world's artefact has a row in the artefact map (spec 9.4), every score is an integer, the numbers equal the spec's tables
(4.3 shares, 5.3 weights and hard rules, 5.5 tones, 6.0 affinity), the Arabic templates pass the plugin's own proofreading, and a second load
gives the same bytes. The file is plain data: no code, no network, no owner name.

D11b (13-build-plan-r2 section 3.2 and the spec amendments S-3, S-12, S-21, S-22): rows take 3 to 5; the price tag is drawn only at xl and hero;
first-noun cliches carry a penalty; scenes need honest concept hits; numeral, word, stamp and UI mock rank above icon scenes; no candidate uses
half, lettermark or hollow; and the data is read against the capabilities of the slice (SLICE_* below, a mirror of r2 section 3.1 that is
checked against tests/visual/expected/caps.json as soon as that golden exists), so the slice can plan every type, its target slides and its two worlds.
"""
from __future__ import annotations

import hashlib
import json
import re
import unittest
from pathlib import Path

try:
    import b7_support as support
except ImportError:  # `python -X utf8 -m unittest tests.unit.py.test_art_direction_data`: the folder is a package here
    from . import b7_support as support

REPO = Path(__file__).resolve().parents[3]
SKILLS = REPO / "plugins" / "carousel-studio" / "skills"
DESIGN = SKILLS / "carousel-design"
DATA = DESIGN / "data" / "art-direction.json"
MAX_BYTES = 70_000  # IS-4 cap was 60 KB; build amendment r3b-1 raises it to 70 KB for the wave-2b candidates (field icon plates, cta/setup mocks, offer rows) and the tone costs
lint = None


def setUpModule() -> None:
    global lint
    support.prepare("carousel-design")
    from _cs import lint as _lint  # noqa: PLC0415
    lint = _lint


def tearDownModule() -> None:
    support.cleanup()


# ---- the contract the data is written against (spec 5.2 schema excerpt, 4.3 matrix, 6.0 tables; IS-5) ----
TYPES = ["cover", "rehook", "item", "step", "stat", "compare", "myth-fact", "quote", "story-beat", "checklist", "summary", "setup",
         "proof", "share", "cta", "offer", "testimonial", "poster", "grid", "timeline"]
PEAKS = {"cover", "rehook", "stat", "share", "cta", "offer", "poster"}
OPERATE = {"checklist", "summary", "setup"}
H8_TYPES = ["rehook", "stat", "share", "cta", "offer"]
KINDS = ["icon", "scene", "rows", "numeral", "chart", "mock", "photo", "field", "word", "pattern"]
RECIPES = {"under", "over", "start", "end", "full", "band", "corner", "center", "half"}
TREATMENTS = {"bare", "chip", "tile", "ring", "duo", "sticker", "badge", "giant"}
SIZES = {"sm", "md", "lg", "xl", "hero"}
TEMPLATES = {"solo", "trio", "duo-stack", "orbit", "ground", "staircase", "scatter", "hub", "versus", "layers", "matrix2", "venn", "formula",
             "cycle", "flow", "iceberg", "pyramid", "sheet", "pile", "cluster", "specimen", "widgets", "niche"}
SIGNATURES = {"sheet", "pile", "cluster", "specimen", "widgets", "niche"}
CHARTS = {"bars-h", "columns", "donut", "ring", "meter", "line", "waffle", "pictogram", "funnel", "compare-bars", "icon-bars", "delta"}
MOCKS = {"chat", "dm", "browser", "phone", "post", "notification", "search", "notes", "poll", "profile", "card", "receipt", "calendar", "artefact"}
ARTEFACTS = {"exam", "ticket", "sign", "ledger", "label", "menu", "generic"}
WORLD_ARTEFACTS = {"exam", "ticket", "sign", "ledger", "label", "menu", "receipt", "notes", "chat", "generic"}
COMPANIONS = {"none", "waffle", "pictogram", "ring", "bar", "icon", "delta"}
PATTERNS = {"icon-wall", "stripes", "bold-dots", "lattice", "grid-paper"}
WORDSTYLES = {"solid", "hollow", "sticker", "struck", "lettermark"}
FRAMES = {"none", "phone", "browser", "polaroid", "tape", "arch", "disc", "torn"}
FIELD_SUBS = {"word", "numeral", "panel", "half", "icon"}  # builder-level names (A8, A10; icon: anchor-icon.js on a plate); the schema has no sub-enum for field
ROWS_SUBS = {"list", "bento", "tiles", "rail"}      # builder-level names (A8); bento and tiles are the grid type, rail the timeline type
MARKS = {"arrow", "underline", "circle", "strike", "sparkle", "stars", "burst", "squiggle", "tape", "sticker", "kashida"}
TONES = {"base", "invert", "field"}
TONE_BIAS = {"calm", "balanced", "drenched"}
PRESETS = ["swiss", "creator", "notebook", "poster", "interface", "heritage"]
DIALECTS = ["eg", "gulf", "levant", "msa-white", "en"]
ARABIC_DIALECTS = ["eg", "gulf", "levant", "msa-white"]
CTA_KINDS = {"save", "send", "question", "keyword-dm", "follow"}
CATEGORIES = {"finance", "business", "marketing", "sales", "real-estate", "social", "creator", "tech-ai", "education", "productivity", "arrows-ui",
              "shapes-symbols", "emotions", "health-fitness", "food", "travel", "family", "beauty-fashion", "nature-weather", "mena", "brands"}
FAMILIES = {"printed", "screens", "signage", "stationery", "packaging", "documents"}
PRIMITIVES = {"sheet", "perforation", "stamp", "tab", "rule", "column", "redact", "boxes", "barcode", "tape",
              "bubble", "toast", "avatar", "arrow", "leader", "chip", "numeral"}
WORLD_IDS = ["receipt", "exam-paper", "metro-board", "chat-confession", "price-board", "ledger", "ticket", "notebook-page"]
ICON_NAME = re.compile(r"^(tb-|cs-)?[a-z0-9]+(-[a-z0-9]+){0,5}$")
OBJECT_ID = re.compile(r"^[a-z0-9]+(-[a-z0-9]+){0,3}$")
NEEDS_PARAM = re.compile(r"^(?:(items|bullets):([0-9])-([0-9])|hit:([1-7]))$")
CANDIDATE_ID = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*\.[a-z0-9]+(-[a-z0-9]+)*$")
PLACEHOLDER = re.compile(r"\{([a-z]+)\}")
TASHKEEL = re.compile("[ً-ٰٟـ]")
NON_WESTERN_DIGITS = re.compile("[٠-٩۰-۹]")
ARABIC = re.compile("[؀-ۿ]")

LEGAL_VARIANTS = {
    "cover": {"top", "center", "split", "photo", "number"}, "rehook": {"base", "split", "big-number", "statement"},
    "item": {"base", "ghost-number", "side-number", "media", "numeral"}, "step": {"base", "ghost-number", "pill", "track"},
    "stat": {"base", "bar", "icon", "chart"}, "compare": {"columns", "stacked", "versus", "table", "before-after"},
    "myth-fact": {"stacked", "columns", "stamp"}, "quote": {"base", "mark", "photo", "bubble", "statement"},
    "story-beat": {"base", "panel", "media", "scene"}, "checklist": {"base", "boxes", "ruled", "icons", "hub"},
    "summary": {"list", "grid"}, "setup": {"base", "cards"}, "proof": {"screenshot", "base"}, "share": {"base", "big-word", "chat"},
    "cta": {"base", "pill", "keyword", "action"}, "offer": {"base", "card"}, "testimonial": {"base", "photo", "card", "review"},
    "poster": {"top", "center", "split", "photo"}, "grid": {"bento", "tiles"}, "timeline": {"rail"},
}
# spec 4.3: (min, target) share of the body zone in percent; compare is 12% of the canvas per side; cover and poster follow the canvas rules (13c)
SHARES = {"rehook": (35, 45), "item": (24, 32), "step": (28, 38), "stat": (38, 50), "myth-fact": (28, 40), "quote": (28, 36), "story-beat": (28, 40),
          "checklist": (30, 45), "summary": (30, 45), "setup": (30, 45), "proof": (35, 50), "share": (35, 50), "cta": (35, 55), "offer": (35, 50),
          "testimonial": (30, 45), "grid": (40, 60), "timeline": (40, 60)}
# the six kinds that need slide.demo (spec 3.4, 5.9): every candidate that draws a mock for them reads demo
DEMO_TYPES = ["step", "story-beat", "setup", "share", "testimonial"]
# spec 6.0, columns = presets, rows = kinds (x100)
AFFINITY_SPEC = {
    "icon": (50, 80, 60, 70, 60, 80), "scene": (30, 60, 50, 60, 30, 80), "rows": (70, 50, 80, 60, 80, 60), "numeral": (90, 80, 60, 80, 50, 60),
    "chart": (80, 50, 50, 90, 70, 40), "mock": (40, 80, 80, 40, 95, 30), "photo": (40, 70, 50, 40, 30, 40), "field": (90, 70, 30, 70, 40, 60),
    "word": (80, 90, 50, 80, 40, 70), "pattern": (20, 40, 30, 30, 20, 70),
}
# ---- D11b: what the slice can draw (13-build-plan-r2 section 3.1) ----
# A mirror of the caps the wave-2 builders register (CS.visual.caps(): kind -> subs, recipes, variants). The planner drops every candidate the caps do
# not list, so the table must leave the slice a way to plan every type, every target slide of r2 section 3.4 and the two worlds the slice ships.
# The golden tests/visual/expected/caps.json (C1 and V2 write it) is the engine's own record: when it exists, test_slice_mirror_is_inside_the_caps_golden
# compares the two, so a wrong mirror fails instead of passing quietly.
SLICE_ART = {"icon": {None}, "field": {"word", "numeral", "icon", "panel"}, "numeral": {"none", "waffle", "bar", "icon"}, "chart": {"bars-h"},
             "mock": {"chat", "notes"}, "rows": {"list"}, "word": {"solid", "sticker", "struck"}}
SLICE_RECIPES = {"under", "over", "full", "center"}
# the nine staged variants plus grid:bento and timeline:rail; the variants that existed in 1.0 stay legal everywhere
SLICE_VARIANTS = {("stat", "icon"), ("stat", "chart"), ("compare", "table"), ("compare", "before-after"), ("quote", "statement"),
                  ("rehook", "statement"), ("step", "track"), ("cta", "action"), ("item", "numeral"), ("grid", "bento"), ("timeline", "rail")}
DEFERRED_VARIANTS = {("grid", "tiles"), ("checklist", "icons"), ("checklist", "hub"), ("quote", "bubble"), ("story-beat", "scene"),
                     ("share", "chat"), ("testimonial", "review")}
SLICE_WORLDS = {"chat-confession", "notebook-page"}  # the other six need artefact mocks, which are deferred
# the type's own layout, not an art builder: rows:bento is grid:bento and rows:rail is timeline:rail (V2 maps them)
LAYOUT_SUBS = {"bento", "rail"}
# the ten target slides of r2 section 3.4 as the anchor candidate that must be able to draw each of them in the slice
SLICE_TARGETS = {"stat + waffle on a field": "stat.numeral-waffle", "myth + stamp": "myth.stamp-cards", "step + notes": "step.mock-notes",
                 "item + a specific object": "item.icon-duo", "compare before and after": "compare.before-after", "compare table": "compare.table",
                 "quote + chat": "quote.mock-chat", "pause on a word": "quote.statement", "rows card": "checklist.rows", "CTA word sticker": "cta.word-sticker"}
CAPS_GOLDEN = REPO / "tests" / "visual" / "expected" / "caps.json"
# S-12: the scene templates that read as icon clusters (diagram templates are structure, not clip art)
ICON_SCENES = {"solo", "trio", "duo-stack", "orbit", "ground", "scatter", "versus", "staircase", "@signature"} | SIGNATURES
CLICHE_OBJECTS = {"coin-stack", "hourglass", "lightbulb", "key", "megaphone", "chat-bubble", "trophy"}
NON_SCENE_HEADS = {"numeral", "word", "mock", "artefact", "chart", "rows", "type", "variant"}
SAMPLES = {
    "ar": {"icon": "ساعة رملية", "icons": "ساعة رملية وعملات وتقويم", "concept": "الوقت", "value": "74", "unit": "دقيقة", "chart": "أعمدة", "mock": "محادثة",
           "artefact": "ورقة امتحان", "word": "الهوك", "count": "4", "summary": "الفرق بين الخيارين", "text": "اكتب الهوك"},
    "en": {"icon": "hourglass", "icons": "hourglass, coins and calendar", "concept": "time", "value": "74", "unit": "minutes", "chart": "bar chart",
           "mock": "chat", "artefact": "exam paper", "word": "hook", "count": "4", "summary": "the gap between two options", "text": "write the hook"},
}


def load_bytes():
    return DATA.read_bytes()


def leaves(value):
    if isinstance(value, str):
        yield value
    elif isinstance(value, dict):
        for item in value.values():
            yield from leaves(item)
    elif isinstance(value, list):
        for item in value:
            yield from leaves(item)


def walk_numbers(value, path=""):
    if isinstance(value, bool):
        return
    if isinstance(value, (int, float)):
        yield path, value
    elif isinstance(value, dict):
        for key, item in value.items():
            yield from walk_numbers(item, f"{path}/{key}")
    elif isinstance(value, list):
        for i, item in enumerate(value):
            yield from walk_numbers(item, f"{path}[{i}]")


def anchor_problem(kind, sub, artefact=None, treatment=None):
    """None when (kind, sub, artefact, treatment) is a legal anchor reference, else why not."""
    if kind not in KINDS:
        return f"kind {kind!r}"
    if kind == "icon":
        if sub is not None:
            return "an icon takes no sub (its treatment says how it is drawn)"
        if treatment is not None and treatment not in TREATMENTS:
            return f"treatment {treatment!r}"
    elif treatment is not None:
        return f"{kind} takes no treatment"
    allowed = {"scene": TEMPLATES | {"@signature"}, "rows": ROWS_SUBS, "numeral": COMPANIONS, "chart": CHARTS, "mock": MOCKS, "photo": FRAMES,
               "field": FIELD_SUBS, "word": WORDSTYLES, "pattern": PATTERNS}
    if kind != "icon" and sub not in allowed[kind]:
        return f"{kind} sub {sub!r}"
    if kind == "mock" and sub == "artefact":
        if artefact not in ARTEFACTS:
            return f"artefact {artefact!r}"
    elif artefact is not None:
        return "artefact is only for mock:artefact"
    return None


def slice_problem(t, c):
    """None when the slice can draw candidate c of type t, else the first reason it cannot (r2 section 3.1)."""
    kind, sub = c["kind"], c["sub"]
    if kind == "rows" and sub in LAYOUT_SUBS:
        pass  # the type's own layout: it needs the staged variant, which the variant check below reads
    elif kind not in SLICE_ART or (kind != "icon" and sub not in SLICE_ART[kind]):
        return f"{kind}:{sub} is deferred"
    if c["recipe"] not in SLICE_RECIPES:
        return f"recipe {c['recipe']} is deferred"
    if "variant" in c and (t, c["variant"]) in DEFERRED_VARIANTS:
        return f"variant {t}:{c['variant']} is deferred"
    if "asset" in c["needs"]:
        return "needs a user asset (the planner skips such a slide)"
    return None


def ref_in_slice(ref):
    """A world's anchor reference (kind, sub) is one the slice builds."""
    kind, sub = ref["kind"], ref.get("sub")
    if kind == "icon":
        return True
    return kind in SLICE_ART and sub in SLICE_ART[kind]


class ArtDirectionDataTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.raw = load_bytes()
        cls.data = json.loads(cls.raw.decode("utf-8"))
        cls.types = cls.data["anchorTable"]["types"]
        cls.candidates = [(t, c) for t in TYPES for c in cls.types[t]["candidates"]]
        cls.worlds = {w["id"]: w for w in cls.data["worlds"]}

    # ---- file ----
    def test_file_hygiene_and_budget(self):
        raw = self.raw
        self.assertFalse(raw.startswith(b"\xef\xbb\xbf"), "BOM")
        self.assertNotIn(b"\r", raw, "CR characters")
        self.assertTrue(raw.endswith(b"\n"), "trailing newline")
        raw.decode("utf-8")
        self.assertLess(len(raw), MAX_BYTES, f"art-direction.json is {len(raw)} bytes; the cap is {MAX_BYTES}")

    def test_header_and_top_level_keys(self):
        self.assertEqual((self.data["schemaVersion"], self.data["dataVersion"]), (1, "1.1.0"))
        self.assertEqual(set(self.data), {"schemaVersion", "dataVersion", "description", "roles", "anchorTable", "topicPrimitives", "rhythm", "tones",
                                          "affinity", "marks", "ctaIcons", "families", "artefactMap", "worlds", "labels", "templates"})

    def test_safe_to_embed_as_a_json_script_block(self):
        # build_studio.py embeds the file as <script type="application/json" id="cs-art-direction">
        text = self.raw.decode("utf-8")
        for needle in ("</", "<!--", "<script", chr(0x2028), chr(0x2029)):
            self.assertNotIn(needle, text, repr(needle))
        self.assertNotIn("<", text)

    def test_integers_only(self):
        floats = [(p, v) for p, v in walk_numbers(self.data) if isinstance(v, float)]
        self.assertEqual(floats, [], "scores, shares and weights are integers (spec 5.3)")

    def test_run_twice_compare(self):
        again = json.loads(load_bytes().decode("utf-8"))
        canon = lambda d: json.dumps(d, ensure_ascii=False, sort_keys=True, separators=(",", ":"))  # noqa: E731
        self.assertEqual(canon(again), canon(self.data))
        self.assertEqual(hashlib.sha256(load_bytes()).hexdigest(), hashlib.sha256(self.raw).hexdigest())
        order = lambda: {t: [c["id"] for c in sorted(self.types[t]["candidates"], key=lambda c: (-c["fit"], c["id"]))] for t in TYPES}  # noqa: E731
        self.assertEqual(order(), order())

    def test_nothing_that_does_not_belong_in_a_shipped_data_file(self):
        text = self.raw.decode("utf-8")
        for needle in ("analytics", "lucide.dev", "http://", "https://", "محمد عبده", "Mohamed Abdou", "mohamedabdou", "elharm"):
            self.assertNotIn(needle, text, needle)

    # ---- roles ----
    def test_roles(self):
        roles = self.data["roles"]
        self.assertEqual(list(roles["types"]), TYPES)
        self.assertEqual({t for t, r in roles["types"].items() if r == "peak"}, PEAKS)
        self.assertEqual({t for t, r in roles["types"].items() if r == "operate"}, OPERATE)
        self.assertEqual({r for r in roles["types"].values()}, {"peak", "read", "operate"})
        self.assertEqual(roles["variants"], {"statement": "pause"})
        for t in ("grid", "timeline"):
            self.assertEqual(roles["types"][t], "read")

    # ---- anchorTable ----
    def test_every_type_has_an_entry(self):
        self.assertEqual(list(self.types), TYPES)
        self.assertEqual([t for t in TYPES if not self.types[t]["planned"]], ["cover"])
        self.assertEqual(self.types["cover"]["candidates"], [], "the cover look is frozen: the planner never plans it")

    def test_every_candidate_is_legal(self):
        ids = set()
        for t, c in self.candidates:
            where = c["id"]
            self.assertRegex(c["id"], CANDIDATE_ID, where)
            self.assertNotIn(c["id"], ids, f"duplicate id {where}")
            ids.add(c["id"])
            extra = set(c) - {"id", "fit", "kind", "sub", "recipe", "field", "treatment", "sizes", "bold", "needs", "variant", "variantLater", "artefact",
                              "icon", "object", "pause", "floor"}
            self.assertEqual(extra, set(), where)
            self.assertIn(c["recipe"], RECIPES, where)
            self.assertIn(c["fit"], (20, 40, 60, 80, 100), where)
            self.assertIsNone(anchor_problem(c["kind"], c["sub"], c.get("artefact"), c.get("treatment")), where)
            if c["kind"] == "icon":
                self.assertIn(c.get("treatment"), TREATMENTS, f"{where}: an icon anchor names its treatment")
            self.assertIsInstance(c["sizes"], list, where)
            self.assertTrue(set(c["sizes"]) <= SIZES, where)
            if c["kind"] not in ("icon", "scene") and (c["kind"], c["sub"]) != ("field", "icon"):
                self.assertEqual(c["sizes"], [], f"{where}: only icon, scene and icon-plate anchors climb the size ladder")
            for flag in ("field", "bold", "pause", "floor"):
                self.assertIn(c.get(flag, True), (True,), f"{where}: {flag} is omitted or true, never false")
            if "variant" in c:
                self.assertIn(c["variant"], LEGAL_VARIANTS[t], where)
            if "variantLater" in c:
                self.assertIn(c["variantLater"], LEGAL_VARIANTS[t], where)
                self.assertNotIn("variant", c, f"{where}: a candidate carries a variant now or later, not both")
            if c.get("pause"):
                self.assertEqual(self.data["roles"]["variants"].get(c.get("variant")), "pause", where)
                self.assertIn("short", c["needs"], f"{where}: a pause shows at most 12 words (spec 0.1)")
            if "icon" in c:
                self.assertIn(c["kind"], ("icon", "field"), where)
                self.assertTrue(c["icon"] == "@cta" or ICON_NAME.match(c["icon"]), where)
                if c["icon"] == "@cta":
                    self.assertEqual(t, "cta", where)
            if "object" in c:
                self.assertRegex(c["object"], OBJECT_ID, where)

    def test_candidates_are_in_fit_order_and_the_first_is_the_default(self):
        for t in TYPES:
            cands = self.types[t]["candidates"]
            if not cands:
                continue
            fits = [c["fit"] for c in cands]
            self.assertEqual(fits, sorted(fits, reverse=True), f"{t}: candidates run from the default down")
            self.assertEqual(fits[0], 100, f"{t}: the default candidate has typeFit 100")

    def test_needs_are_named_in_the_vocabulary(self):
        vocab = self.data["anchorTable"]["needs"]
        named = {k for k in vocab if ":" not in k}
        self.assertEqual(named, {"number", "ordinal", "percent", "change", "series", "asset", "demo", "mockwords", "sides", "rows", "ordered", "short", "noun", "objnoun"})
        self.assertEqual({k for k in vocab if ":" in k}, {"items:A-B", "bullets:A-B", "hit:N"})
        used = set()
        for _t, c in self.candidates:
            self.assertIsInstance(c["needs"], list, c["id"])
            self.assertEqual(len(set(c["needs"])), len(c["needs"]), c["id"])
            for need in c["needs"]:
                used.add(need)
                m = NEEDS_PARAM.match(need)
                if m:
                    if m.group(1):
                        lo, hi = int(m.group(2)), int(m.group(3))
                        self.assertTrue(1 <= lo <= hi <= 8, f"{c['id']}: {need}")
                else:
                    self.assertIn(need, named, f"{c['id']}: {need}")
        self.assertEqual(named, {n for n in used if ":" not in n}, "every named need is used by some candidate")
        self.assertTrue({"items", "bullets", "hit"} <= {n.split(":")[0] for n in used if ":" in n}, "every parametric need is used")

    def test_every_planned_type_has_a_floor_that_needs_no_data(self):
        for t in TYPES:
            if not self.types[t]["planned"]:
                continue
            floors = [c for c in self.types[t]["candidates"] if c.get("floor")]
            self.assertEqual(len(floors), 1, f"{t}: exactly one floor candidate")
            floor = floors[0]
            self.assertEqual(floor["needs"], [], t)
            self.assertEqual(floor["fit"], 20, t)
            self.assertEqual(floor["kind"], "field" if self.data["roles"]["types"][t] == "peak" else "word", f"{t}: field for a peak, word otherwise (spec 5.3)")
            self.assertIs(self.types[t]["candidates"][-1], floor, f"{t}: the floor is last")
            self.assertEqual(floor["fit"], min(c["fit"] for c in self.types[t]["candidates"]), t)

    def test_every_planned_type_has_a_bold_candidate_for_the_bold_slide(self):
        for t in TYPES:
            if self.types[t]["planned"]:
                self.assertTrue(any(c.get("bold") for c in self.types[t]["candidates"]), f"{t}: H7 needs a bold candidate")

    def test_shares(self):
        for t in TYPES:
            e = self.types[t]
            if t in SHARES:
                self.assertEqual((e["min"], e["target"]), SHARES[t], t)
                self.assertTrue(0 < e["min"] <= e["target"] <= 100, t)
            else:
                self.assertEqual((e["min"], e["target"]), (None, None), t)
        for t in H8_TYPES:
            self.assertGreaterEqual(self.types[t]["min"], self.data["rhythm"]["hard"]["H8"]["minShare"], f"{t}: a peak never plans below the H8 floor")
        self.assertEqual(self.types["compare"]["sideCanvasPct"], 12)
        self.assertTrue(self.types["cover"]["canvas"] and self.types["poster"]["canvas"])
        self.assertEqual({t for t, e in self.types.items() if "canvas" in e}, {"cover", "poster"})
        self.assertEqual({t for t, e in self.types.items() if "note" in e}, {"cover", "compare", "poster"}, "the types that follow other rules say so")
        for t in ("cover", "compare", "poster"):
            self.assertTrue(self.types[t]["note"].isascii() and len(self.types[t]["note"]) > 20, t)

    def test_types_that_need_demo_get_a_mock_that_reads_it(self):
        for t in DEMO_TYPES:
            mocks = [c for c in self.types[t]["candidates"] if c["kind"] == "mock" and c["sub"] not in ("artefact",)]
            self.assertTrue(any("demo" in c["needs"] for c in mocks), f"{t}: a mock candidate needs demo")
        self.assertTrue(any(c["sub"] == "dm" and "demo" in c["needs"] and c.get("variant") == "keyword" for c in self.types["cta"]["candidates"]))

    def test_the_default_of_a_working_type_is_never_a_bare_icon(self):
        # the pencil under the text was the owner's complaint: no read or operate type defaults to a lone icon
        for t in TYPES:
            if self.types[t]["planned"] and self.data["roles"]["types"][t] in ("read", "operate"):
                first = self.types[t]["candidates"][0]
                self.assertFalse(first["kind"] == "icon" and not first.get("field"), f"{t}: {first['id']}")

    # ---- PLAN-CHOICE (wave 2b): demo first, honest icons, plates, offer ----
    def test_every_demo_type_has_a_chat_or_notes_mock_the_slice_builds(self):
        # the planner draws a demo with a mock chat or notes (the two mocks of the slice): every type that carries a demo offers one that needs it
        for t in DEMO_TYPES + ["cta"]:
            mocks = [c for c in self.types[t]["candidates"] if c["kind"] == "mock" and c["sub"] in ("chat", "notes") and "demo" in c["needs"]]
            self.assertTrue(mocks, f"{t}: no chat or notes mock reads the demo")
            self.assertTrue(any(slice_problem(t, c) is None for c in mocks), f"{t}: none of them is inside the slice caps")
        by_id = {c["id"]: c for _t, c in self.candidates}
        self.assertEqual((by_id["cta.mock-chat"]["recipe"], by_id["cta.mock-chat"].get("variant")), ("under", "action"), "the chat sits under the title, the CTA stays an action")
        self.assertEqual((by_id["setup.mock-notes"]["sub"], by_id["setup.mock-notes"]["recipe"]), ("notes", "under"), "bullets stay native, the notes draw the demo")
        self.assertEqual(by_id["share.mock-chat"]["recipe"], "under", "a centre recipe leaves at most 560 x 560 px: 23 to 26 percent, under the 35 of the type")
        self.assertEqual(by_id["share.field-word"]["recipe"], "under", "the share floor reaches the minimum too, so a share without a demo does not fall to the last rung")

    def test_a_lone_icon_is_an_object_the_slide_names_and_ranks_low(self):
        for t, c in self.candidates:
            if c["kind"] == "icon" and not c.get("field") and c["recipe"] == "under":
                self.assertLessEqual(c["fit"], 40, f"{c['id']}: an icon alone on the page ranks below numeral-plain and field-word")
                self.assertIn("objnoun", c["needs"], f"{c['id']}: an object the slide's own noun names")
                self.assertTrue(any(n.startswith("hit:") for n in c["needs"]), c["id"])
        for t in ("item", "step"):
            fits = {c["id"].split(".")[1]: c["fit"] for c in self.types[t]["candidates"]}
            if "icon-duo" in fits:
                self.assertGreaterEqual(fits.get("numeral-plain", fits.get("field-word")), fits["icon-duo"], t)
        for _t, c in self.candidates:
            if c["kind"] == "icon" and c.get("treatment") == "sticker":
                self.assertIn("noun", c["needs"], f"{c['id']}: a sticker is the slide's own noun too")

    def test_icon_plates_for_the_types_that_read_one_object(self):
        plates = {t: [c for c in self.types[t]["candidates"] if (c["kind"], c["sub"]) == ("field", "icon")] for t in TYPES}
        self.assertEqual({t for t, v in plates.items() if v}, {"item", "step", "myth-fact", "quote"})
        for t, lst in plates.items():
            for c in lst:
                self.assertEqual(len(lst), 1, t)
                self.assertTrue(c.get("field") and c.get("bold"), c["id"])
                self.assertEqual(c["sizes"], ["lg", "xl", "hero"], c["id"])
                self.assertEqual(c["recipe"], "under", c["id"])
                self.assertEqual(c["needs"], ["hit:1", "noun"], f"{c['id']}: an icon on a plate names the slide's own noun")
                self.assertIsNone(slice_problem(t, c), c["id"])
                self.assertLess(c["fit"], max(x["fit"] for x in self.types[t]["candidates"]), c["id"])

    def test_an_offer_draws_its_price_or_its_bullets(self):
        ids = {c["id"]: c for c in self.types["offer"]["candidates"]}
        self.assertEqual((ids["offer.numeral-plain"]["kind"], ids["offer.numeral-plain"]["needs"]), ("numeral", ["number"]))
        self.assertEqual((ids["offer.rows"]["kind"], ids["offer.rows"]["needs"], ids["offer.rows"].get("bold")), ("rows", ["rows"], True))
        self.assertIsNone(slice_problem("offer", ids["offer.numeral-plain"]))
        self.assertIsNone(slice_problem("offer", ids["offer.rows"]))

    # ---- topicPrimitives ----
    def test_topic_primitives(self):
        tp = self.data["topicPrimitives"]
        seen = []
        have = {(c["kind"], c["sub"]) for _t, c in self.candidates} | {("icon", c.get("treatment")) for _t, c in self.candidates if c["kind"] == "icon"}
        have |= {("artefact", c["artefact"]) for _t, c in self.candidates if "artefact" in c}
        for row in tp["byCategory"]:
            self.assertTrue(row["cats"] and row["first"], row)
            for cat in row["cats"]:
                self.assertIn(cat, CATEGORIES, cat)
                seen.append(cat)
            for token in row["first"]:
                head, _, rest = token.partition(":")
                if head == "type":
                    self.assertIn(rest, TYPES, token)
                elif head == "variant":
                    t, _, v = rest.partition("/")
                    self.assertIn(v, LEGAL_VARIANTS.get(t, ()), token)
                elif head == "artefact":
                    self.assertIn(rest, ARTEFACTS, token)
                    self.assertIn((head, rest), have, f"{token}: no candidate draws it")
                else:
                    self.assertIsNone(anchor_problem(head, None if head == "icon" else rest, None, rest if head == "icon" else None), token)
                    self.assertTrue((head, rest) in have or (head == "scene" and rest in SIGNATURES), f"{token}: no candidate draws it")
        self.assertEqual(sorted(seen), sorted(CATEGORIES), "every category of the icon index appears once")
        for alias, cat in tp["aliases"].items():
            self.assertIn(cat, CATEGORIES, alias)
        self.assertEqual(tp["aliases"], {"time": "productivity", "tech": "tech-ai", "ai": "tech-ai", "health": "health-fitness",
                                         "fashion": "beauty-fashion", "nature": "nature-weather"})

    # ---- rhythm, tones ----
    def test_rhythm_is_spec_5_3(self):
        r = self.data["rhythm"]
        s = r["scoring"]
        self.assertEqual(s["weights"], {"typeFit": 30, "evidence": 40, "presetFit": 15, "novelty": 10, "textFit": 5})
        self.assertEqual(sum(s["weights"].values()), 100)
        self.assertEqual(s["textFit"], {"fits": 100, "shrink": 50, "none": 0})
        self.assertEqual(s["adjust"], {"world": 2500, "brandPrefer": 2000, "priorsMax": 1500, "demo": 6000, "lone": -4500},
                         "PLAN-CHOICE: a mock that draws the demo +6000 (and half the fit-level penalty); an icon alone on the page -4500, below numeral-plain and field-word")
        self.assertEqual(s["tieBreak"], ["score", "share", "nonIcon", "hash"])
        self.assertEqual((s["memory"], s["boldAtPct"], s["dataFit"]), (3, 66, 100))
        self.assertEqual(r["soft"], {"S1": -3500, "S2": -2500, "S3": -4000, "S4": 1000, "S5": 2000})
        h = r["hard"]
        self.assertEqual(list(h), ["H1", "H2", "H3", "H4", "H5", "H6", "H7", "H8"])
        self.assertEqual(h["H1"], {"maxRunKind": 2})
        self.assertEqual(h["H2"], {"maxRunKey": 2, "altWindow": 6})
        self.assertEqual(h["H3"], {"maxUses": 1, "adjacent": 0})
        self.assertEqual(h["H4"], {"minKinds": 3, "minInner": 6, "maxSwaps": 4})
        self.assertEqual(h["H5"], {"per": 5, "adjacent": 0, "beforeCta": 0})
        self.assertEqual(h["H6"], {"maxRunNonBase": 2, "lastReturnsToCover": True})
        self.assertEqual(h["H7"], {"onlyBold": True, "tieWin": "later"})
        self.assertEqual(h["H8"], {"types": H8_TYPES, "minShare": 35})
        self.assertEqual(r["repair"], {"fitBacktrack": 2})
        self.assertEqual(list(r["glossary"]), [f"H{i}" for i in range(1, 9)] + [f"S{i}" for i in range(1, 6)])
        for key, text in r["glossary"].items():
            self.assertTrue(text.strip() and not ARABIC.search(text), key)

    def test_relaxation_ladder_r0_to_r8(self):
        ladder = self.data["rhythm"]["relax"]
        self.assertEqual([step["level"] for step in ladder], list(range(9)))
        self.assertEqual(ladder[0], {"level": 0, "drop": [], "set": {}})
        self.assertEqual(ladder[1]["drop"], ["H7"])
        self.assertEqual(ladder[2]["drop"], ["H4"])
        self.assertEqual(ladder[3]["set"], {"H6.maxRunNonBase": 3, "tones.shareCapAdd": 10})
        self.assertEqual(ladder[4]["set"], {"H8.minShare": 28})
        self.assertEqual(ladder[5]["set"], {"H2.maxRunKey": 3})
        self.assertEqual(ladder[6]["set"], {"H1.maxRunKind": 3})
        self.assertEqual(ladder[7]["set"], {"H3.maxUses": 99})
        self.assertEqual(ladder[8]["drop"], [f"H{i}" for i in range(1, 9)])
        for step in ladder:
            for key in step["set"]:
                head, _, field = key.partition(".")
                table = self.data["tones"] if head == "tones" else self.data["rhythm"]["hard"].get(head, {})
                self.assertIn(field, table, f"{key}: a relaxation step overrides a field that exists")
            for dropped in step["drop"]:
                self.assertIn(dropped, self.data["rhythm"]["hard"])

    def test_tones_desire_is_spec_5_5(self):
        t = self.data["tones"]
        self.assertEqual(t["desire"], {"peak": "field", "pause": "invert", "bold": "invert", "read": "base", "operate": "base"})
        self.assertEqual(t["byType"], {"cover": "cover", "cta": "cover", "poster": "cover"})
        self.assertEqual(t["toneBias"], {"calm": 20, "balanced": 40, "drenched": 50})
        self.assertEqual(t["breakRun"], {"afterBase": 3, "tone": "invert"}, "no run of three equal tones, base included: the break is an invert unless a peak asks for a field")
        self.assertEqual(t["rhythm"], {"minInner": 6, "minNonBase": 2, "maxEqual": 2})
        self.assertEqual(set(t["cost"]), {"miss", "extra", "boldBreak", "triple", "same"})
        self.assertTrue(all(isinstance(v, int) and not isinstance(v, bool) and v > 0 for v in t["cost"].values()))
        self.assertLess(t["cost"]["boldBreak"], t["cost"]["extra"], "the bold slide is the cheapest place for an invert that breaks a run")
        self.assertGreater(t["cost"]["triple"], t["cost"]["miss"], "three equal tones in a row cost more than a peak that misses its field")
        self.assertEqual(t["shareCapAdd"], 0, "R3 raises the non-base share cap by 10 points from this base")
        self.assertTrue(set(t["desire"].values()) <= TONES)
        self.assertEqual(set(t["toneBias"]), TONE_BIAS)

    # ---- affinity, marks, cta icons ----
    def test_affinity_is_the_spec_6_0_table(self):
        aff = self.data["affinity"]
        self.assertEqual(list(aff), PRESETS)
        for preset in PRESETS:
            self.assertEqual(list(aff[preset]), KINDS, preset)
        for kind, column in AFFINITY_SPEC.items():
            self.assertEqual([aff[p][kind] for p in PRESETS], list(column), kind)
        for p in PRESETS:
            for v in aff[p].values():
                self.assertTrue(isinstance(v, int) and 0 <= v <= 100)

    def test_marks_policy(self):
        m = self.data["marks"]
        self.assertEqual(m["perSlide"], {"read": 2, "peak": 3, "pause": 1})
        self.assertEqual((m["maxArrows"], m["areaPct"]), (1, 8))
        self.assertEqual(m["arrowNeeds"], {"anchorKinds": ["mock", "chart", "scene"], "emphasisSpan": True})
        self.assertEqual(list(m["presets"]), PRESETS)
        for preset, p in m["presets"].items():
            self.assertTrue(p["allow"] and set(p["allow"]) <= MARKS, preset)
            self.assertEqual(len(set(p["allow"])), len(p["allow"]), preset)
            self.assertTrue(p["native"] and all(re.match(r"^[a-z]+(-[a-z]+)*$", n) for n in p["native"]), preset)
        hand = {p for p, v in m["presets"].items() if v["hand"]}
        self.assertEqual(hand, {"creator", "notebook"}, "hand marks are creator and notebook (spec 6.0)")
        self.assertTrue(set(m["presets"]["swiss"]["allow"]) <= {"arrow", "underline", "strike", "kashida"}, "swiss: geometric marks only")
        self.assertTrue(set(m["presets"]["heritage"]["allow"]) <= {"stars", "underline", "kashida"}, "heritage: no hand marks")

    def test_cta_icons(self):
        icons = self.data["ctaIcons"]
        self.assertEqual(set(icons), CTA_KINDS)
        for name in icons.values():
            self.assertRegex(name, ICON_NAME)
        pack = DESIGN / "data" / "icons" / "pack.json"
        if pack.is_file():
            known = json.loads(pack.read_text(encoding="utf-8"))["icons"]
            for name in set(icons.values()) | {c["icon"] for _t, c in self.candidates if c.get("icon", "@cta") != "@cta"}:
                self.assertIn(name, known, f"{name} is not in the icon pack")

    # ---- artefact map and worlds ----
    def test_artefact_map(self):
        rows = self.data["artefactMap"]
        self.assertEqual(set(self.data["families"]), FAMILIES)
        for row in rows:
            self.assertIn(row["family"], FAMILIES, row)
            kind = row["kind"]
            self.assertIn(kind, ("mock", "rows", "icon"), row)
            if kind == "icon":
                self.assertRegex(row["object"], OBJECT_ID)
            else:
                self.assertIsNone(anchor_problem(kind, row["sub"], row.get("artefact")), row)
            if "world" in row:
                self.assertIn(row["world"], WORLD_ARTEFACTS, row)
        mapped = [row["world"] for row in rows if "world" in row]
        self.assertEqual(sorted(mapped), sorted(WORLD_ARTEFACTS), "one row per world artefact value")
        self.assertEqual(len({r["seed"] for r in rows}), len(rows))

    def test_the_eight_worlds(self):
        self.assertEqual([w["id"] for w in self.data["worlds"]], WORLD_IDS)
        have = {(c["kind"], c["sub"], c.get("artefact")) for _t, c in self.candidates}
        row_for = {row["world"]: row for row in self.data["artefactMap"] if "world" in row}
        for w in self.data["worlds"]:
            wid = w["id"]
            self.assertEqual(set(w["names"]), set(DIALECTS), wid)
            self.assertTrue(all(isinstance(v, str) and v.strip() for v in w["names"].values()), wid)
            self.assertTrue(w["brief"].strip() and not ARABIC.search(w["brief"]), wid)
            self.assertIn(w["family"], FAMILIES, wid)
            # every world artefact has a row in the artefact map (spec 9.4), and that row is what the world's reveal slide draws
            self.assertIn(w["artefact"], WORLD_ARTEFACTS, wid)
            row = row_for[w["artefact"]]
            self.assertEqual(row["family"], w["family"], wid)
            reveal = w["sequence"]["reveal"]
            self.assertEqual((reveal["kind"], reveal.get("sub"), reveal.get("artefact")), (row["kind"], row["sub"], row.get("artefact")), wid)
            self.assertTrue(1 <= len(w["mockPrefer"]) <= 4 and set(w["mockPrefer"]) <= MOCKS, wid)
            self.assertIn(w["toneBias"], TONE_BIAS, wid)
            self.assertEqual(w["boldMove"]["at"], "reveal", wid)
            self.assertTrue(w["boldMove"]["kind"] in KINDS or w["boldMove"]["kind"] == "artefact", wid)
            self.assertEqual(list(w["sequence"]), ["rehook", "read", "reveal", "operate", "cta"], wid)
            refs = [w["sequence"]["rehook"], w["sequence"]["reveal"], w["sequence"]["operate"], w["sequence"]["cta"], *w["sequence"]["read"]]
            self.assertTrue(2 <= len(w["sequence"]["read"]) <= 4, wid)
            for r in refs:
                self.assertIsNone(anchor_problem(r["kind"], r.get("sub"), r.get("artefact"), "giant" if r["kind"] == "icon" else None), (wid, r))
                self.assertEqual(set(r) - {"kind", "sub", "artefact", "field", "redact", "object", "sizes"}, set(), (wid, r))
                self.assertIn((r["kind"], r.get("sub"), r.get("artefact")), have, f"{wid}: no candidate draws {r}")
                if "object" in r:
                    self.assertRegex(r["object"], OBJECT_ID)
                if r.get("redact"):
                    self.assertIn(r["sub"], ("receipt", "artefact"), f"{wid}: redact only covers real text on a document")
            self.assertIn(w["sequence"]["rehook"]["kind"], ("numeral", "field", "mock"), f"{wid}: the opener is a total, a claim or a mock")
            tones = w["tones"]
            self.assertEqual(list(tones), ["rehook", "read", "reveal", "operate", "cta"], wid)
            self.assertTrue(set(tones["read"]) <= TONES and len(tones["read"]) >= 2, wid)
            for k in ("rehook", "reveal", "operate"):
                self.assertIn(tones[k], TONES, wid)
            self.assertEqual(tones["cta"], "cover", wid)
            positions = [tones["rehook"], *tones["read"], tones["reveal"], tones["operate"], tones["cta"]]
            non_base = sum(1 for t in positions if t not in ("base", "cover"))
            self.assertLessEqual(non_base * 100, self.data["tones"]["toneBias"][w["toneBias"]] * len(positions), f"{wid}: the storyboard keeps to its own toneBias (H6)")
            run = longest = 0
            for t in positions:
                run = run + 1 if t not in ("base", "cover") else 0
                longest = max(longest, run)
            self.assertLessEqual(longest, self.data["rhythm"]["hard"]["H6"]["maxRunNonBase"], f"{wid}: at most 2 non-base slides in a row (H6)")
            self.assertTrue(2 <= len(w["primitives"]) <= 3 and set(w["primitives"]) <= PRIMITIVES, wid)
            self.assertTrue(1 <= len(w["presets"]) <= 3 and set(w["presets"]) <= set(PRESETS) and len(set(w["presets"])) == len(w["presets"]), wid)
        self.assertEqual(len({w["artefact"] for w in self.data["worlds"]}), 8, "eight worlds, eight artefacts")
        self.assertGreaterEqual(len({w["family"] for w in self.data["worlds"]}), 3, "at least three material families (spec 9.4)")

    # ---- Arabic ----
    def test_templates_have_every_dialect_and_the_same_placeholders(self):
        tpl = self.data["templates"]
        self.assertEqual(set(tpl), {"params", "why", "alt"})
        self.assertEqual(set(tpl["why"]), {"icon", "scene", "numeral", "chart", "mock", "rows", "artefact", "field", "pause", "photo", "homograph"})
        self.assertEqual(set(tpl["alt"]), {"icon", "object", "scene", "numeral", "chart", "mock", "rows", "word", "redact"})
        params = set(tpl["params"])
        for group in ("why", "alt"):
            for key, row in tpl[group].items():
                self.assertEqual(list(row), DIALECTS, f"{group}.{key}")
                holders = {d: PLACEHOLDER.findall(s) for d, s in row.items()}
                reference = holders["eg"]
                self.assertTrue(set(reference) <= params, f"{group}.{key}")
                for d, found in holders.items():
                    self.assertEqual(sorted(found), sorted(reference), f"{group}.{key}.{d}: same placeholders in every dialect")
                    self.assertEqual(len(found), len(set(found)), f"{group}.{key}.{d}")
                    self.assertNotRegex(row[d].replace("{", "").replace("}", ""), r"[{}]", f"{group}.{key}.{d}")
        used = {p for group in ("why", "alt") for row in tpl[group].values() for s in row.values() for p in PLACEHOLDER.findall(s)}
        self.assertEqual(used, params, "every declared parameter is used and every used one is declared")

    def filled(self):
        """Every template as the planner would print it: placeholders replaced by plausible words of the post's dialect."""
        tpl = self.data["templates"]
        for group in ("why", "alt"):
            for key, row in tpl[group].items():
                for d, s in row.items():
                    samples = SAMPLES["en" if d == "en" else "ar"]
                    yield f"{group}.{key}.{d}", d, PLACEHOLDER.sub(lambda m: samples[m.group(1)], s)

    def test_templates_obey_the_text_rules(self):
        for where, d, text in self.filled():
            self.assertEqual(TASHKEEL.findall(text), [], f"{where}: no tashkeel or tatweel")
            self.assertEqual(NON_WESTERN_DIGITS.findall(text), [], f"{where}: Western digits only")
            self.assertLessEqual(len(text), 160 if where.startswith("alt.") else 120, f"{where}: {len(text)} characters")
            self.assertEqual(text, text.strip(), where)
            self.assertNotIn("  ", text, where)
            if d != "en":
                self.assertRegex(text, ARABIC, where)
            else:
                self.assertNotRegex(text, ARABIC, where)

    def test_templates_pass_the_arabic_lint(self):
        found = []
        for where, d, text in self.filled():
            for item in lint.lint_text(text, dialect=d, digits="western"):
                if item["sev"] in ("BLOCK", "FIX"):
                    found.append((where, item["rule"], item["sev"], item["original"]))
        self.assertEqual(found, [], "ortho_lint and the dialect lists, run over every template in its own dialect")

    def test_world_names_and_labels_pass_the_arabic_lint(self):
        found = []
        for w in self.data["worlds"]:
            for d, name in w["names"].items():
                found += [(w["id"], d, i["rule"], i["original"]) for i in lint.lint_text(name, dialect=d, digits="western") if i["sev"] in ("BLOCK", "FIX")]
        labels = self.data["labels"]
        for key, row in labels.items():
            self.assertEqual(set(row), {"ar", "en"}, key)
            self.assertRegex(row["ar"], ARABIC, key)
            self.assertNotRegex(row["en"], ARABIC, key)
            self.assertEqual(TASHKEEL.findall(row["ar"]), [], key)
            for d in ARABIC_DIALECTS:  # a label is dialect-neutral: it must be clean in all four
                found += [(key, d, i["rule"], i["original"]) for i in lint.lint_text(row["ar"], dialect=d, digits="western") if i["sev"] in ("BLOCK", "FIX")]
        self.assertEqual(found, [])

    def test_labels_cover_every_chart_mock_and_artefact(self):
        expected = {f"chart.{k}" for k in CHARTS} | {f"mock.{k}" for k in MOCKS - {"artefact"}} | {f"artefact.{k}" for k in ARTEFACTS}
        self.assertEqual(set(self.data["labels"]), expected)

    def test_the_glossary_forms_to_avoid_are_not_used(self):
        glossary = json.loads((DESIGN / "data" / "glossary.json").read_text(encoding="utf-8"))["terms"]
        text = self.raw.decode("utf-8")
        for key, term in glossary.items():
            for form in term.get("avoid", []):
                self.assertIsNone(re.search(r"(?<![ء-ي])" + re.escape(form) + r"(?![ء-ي])", text), f"{key}: {form}")

    # ---- D11b: rows, price tag, cliches, honest scenes, ranking, no half or lettermark ----
    def test_rows_take_three_to_five(self):
        # S-21: at most 5 rows with icons; 6 to 8 render as a plain list and claim no anchor; the six-row exception is gone
        rule = self.data["anchorTable"]["rowsRule"]
        self.assertEqual(rule, {"min": 3, "max": 5, "plainListMax": 8, "plainListIsAnchor": False})
        text = self.data["anchorTable"]["needs"]["rows"]
        self.assertTrue(text.startswith("3 to 5 bullets or items"), text)
        self.assertIn("6 to 8", text)
        self.assertIn("plain list", text)
        self.assertNotIn("3 to 8", text)
        rows_lists = [c for _t, c in self.candidates if c["kind"] == "rows" and c["sub"] == "list"]
        self.assertTrue(any("rows" in c["needs"] for c in rows_lists))
        for c in rows_lists:
            for need in c["needs"]:
                m = NEEDS_PARAM.match(need)
                if m and m.group(1):
                    self.assertLessEqual(int(m.group(3)), rule["max"], f"{c['id']}: a rows list never claims more than {rule['max']} rows")

    def test_the_price_tag_is_drawn_only_at_xl_and_hero(self):
        # D2: cs-price-tag-ar leaves an empty label box that is about 133 x 80 px at hero 320; smaller sizes cannot hold the HTML currency label
        names = self.data["anchorTable"]["nameSizes"]
        ladder = ["sm", "md", "lg", "xl", "hero"]
        self.assertEqual(names["price-tag"], ["xl", "hero"])
        self.assertEqual(names["cs-price-tag-ar"], ["xl", "hero"])
        for name, sizes in names.items():
            self.assertTrue(ICON_NAME.match(name) or OBJECT_ID.match(name), name)
            self.assertTrue(sizes and set(sizes) <= SIZES and sizes == sorted(sizes, key=ladder.index) and len(set(sizes)) == len(sizes), name)
        pack = DESIGN / "data" / "icons" / "pack.json"
        if pack.is_file():
            self.assertIn("cs-price-tag-ar", json.loads(pack.read_text(encoding="utf-8"))["icons"])
        refs = [r for w in self.data["worlds"] for r in (w["sequence"]["rehook"], w["sequence"]["reveal"], w["sequence"]["operate"], w["sequence"]["cta"],
                                                       *w["sequence"]["read"])]
        refs += [row for row in self.data["artefactMap"] if row["kind"] == "icon"]
        seen = 0
        for ref in refs:
            name = ref.get("object")
            if name in names:
                seen += 1
                self.assertEqual(ref.get("sizes"), names[name], f"every reference to {name} names its sizes: {ref}")
            else:
                self.assertNotIn("sizes", ref, ref)
        self.assertEqual(seen, 2, "the price-board world and the price sticker row")
        for _t, c in self.candidates:
            for key in ("icon", "object"):
                if c.get(key) in names:
                    self.assertTrue(set(c["sizes"]) & set(names[c[key]]), f"{c['id']}: no size is left for {c[key]}")

    def test_first_noun_cliches_carry_a_penalty(self):
        # S-12: hourglass, coin stack, lightbulb, key, megaphone and chat bubble lose 2000 points when the topic category alone picked them (rung 7)
        cliche = self.data["rhythm"]["scoring"]["cliche"]
        self.assertEqual(set(cliche), {"points", "fromRung", "objects", "icons", "metaphorConcepts", "note"})
        self.assertEqual((cliche["points"], cliche["fromRung"]), (-2000, 7))
        self.assertTrue(all(isinstance(cliche[k], int) and not isinstance(cliche[k], bool) for k in ("points", "fromRung")))
        self.assertEqual(set(cliche["objects"]), CLICHE_OBJECTS)
        self.assertEqual(cliche["icons"], ["coins", "hourglass", "lightbulb", "key-round", "megaphone", "message-circle", "target", "trophy", "award", "flag", "circle-check", "chart-line"])
        self.assertEqual(cliche["metaphorConcepts"], ["result", "record-number", "success", "goal", "growth"], "a target for a result, a trophy for a figure: the concept itself is the metaphor")
        concepts = DESIGN / "data" / "icons" / "concepts.json"
        if concepts.is_file():
            known = {c["id"] for c in json.loads(concepts.read_text(encoding="utf-8"))["concepts"]}
            self.assertLessEqual(set(cliche["metaphorConcepts"]), known, "every metaphor concept is a concept of the lookup")
        for group in ("objects", "icons", "metaphorConcepts"):
            self.assertEqual(len(set(cliche[group])), len(cliche[group]), group)
        self.assertTrue(cliche["note"].isascii() and "rung 7" in cliche["note"])
        objects = DESIGN / "data" / "icons" / "objects.json"
        if objects.is_file():
            ids = {o["id"] for o in json.loads(objects.read_text(encoding="utf-8"))["objects"]}
            self.assertLessEqual(set(cliche["objects"]), ids, "a cliche object the pack does not have cannot be penalised")
        pack = DESIGN / "data" / "icons" / "pack.json"
        if pack.is_file():
            self.assertLessEqual(set(cliche["icons"]), set(json.loads(pack.read_text(encoding="utf-8"))["icons"]))
        banned = set(cliche["objects"]) | set(cliche["icons"])
        pinned = [c[k] for _t, c in self.candidates for k in ("icon", "object") if k in c and c[k] != "@cta"]
        pinned += [row["object"] for row in self.data["artefactMap"] if "object" in row]
        for w in self.data["worlds"]:
            seq = w["sequence"]
            pinned += [r["object"] for r in (seq["rehook"], seq["reveal"], seq["operate"], seq["cta"], *seq["read"]) if "object" in r]
        self.assertEqual([n for n in pinned if n in banned], [], "no table row pins a cliche: the penalty is for picks the lookup made")
        # the penalty comes on top of the spec 5.3 adjustments, which stay as they were
        self.assertEqual(self.data["rhythm"]["scoring"]["adjust"], {"world": 2500, "brandPrefer": 2000, "priorsMax": 1500, "demo": 6000, "lone": -4500})

    def test_scenes_need_honest_hits(self):
        # S-12: a scene with supports needs at least 3 distinct concept hits, supports at 60% of the dominant's area, else solo
        rule = self.data["anchorTable"]["sceneHits"]
        self.assertEqual(rule, {"minHits": {"solo": 1, "versus": 2, "trio": 3, "duo-stack": 3, "@signature": 3, "orbit": 4, "ground": 4},
                                "supportAreaPct": 60, "else": "solo"})
        seen = set()
        for _t, c in self.candidates:
            if c["kind"] != "scene" or c["sub"] not in rule["minHits"]:
                continue
            seen.add(c["sub"])
            hit = [int(n.split(":")[1]) for n in c["needs"] if n.startswith("hit:")]
            self.assertEqual(len(hit), 1, f"{c['id']}: an icon scene says how many distinct hits it needs")
            self.assertGreaterEqual(hit[0], rule["minHits"][c["sub"]], f"{c['id']}: {c['sub']} needs {rule['minHits'][c['sub']]} hits or it becomes solo")
        self.assertEqual(seen, set(rule["minHits"]), "every template of the rule is used by some candidate")
        unruled = {c["sub"] for _t, c in self.candidates if c["kind"] == "scene" and c["sub"] in ICON_SCENES and c["sub"] != "staircase"} - set(rule["minHits"])
        self.assertEqual(unruled, set(), "every icon scene template has a hit rule")

    def test_numeral_word_stamp_and_mock_rank_above_icon_scenes(self):
        # S-12 (and the CD review): in a type, no icon scene has a higher typeFit than a UI mock, a numeral, a word or a stamp card.
        # A numeral is judged one by one and whatever it needs: the ordinal numerals of item and step (needs "ordinal") rank like the figure ones,
        # because a mock at 100 in the same type would hide a numeral at 60 from a best-of-group check (D11b review 1).
        for t in TYPES:
            if not self.types[t]["planned"]:
                continue
            cands = self.types[t]["candidates"]
            scenes = [c for c in cands if c["kind"] == "scene" and c["sub"] in ICON_SCENES]
            first = cands[0]
            self.assertFalse(first["kind"] == "scene" and first["sub"] in ICON_SCENES, f"{t}: the default is never an icon scene ({first['id']})")
            if not scenes:
                continue
            top = max(c["fit"] for c in scenes)
            for c in cands:
                if c["kind"] == "numeral":
                    self.assertGreaterEqual(c["fit"], top, f"{t}: numeral {c['id']} (needs {c['needs']}) ranks below an icon scene at {top}")
            groups = {"UI mock": [c for c in cands if c["kind"] == "mock" and c["sub"] != "artefact"],
                      "word": [c for c in cands if c["kind"] == "word" and not c.get("floor")],
                      "stamp card": [c for c in cands if c["kind"] == "field" and c["sub"] == "panel"]}
            for label, group in groups.items():
                if group:
                    self.assertGreaterEqual(max(c["fit"] for c in group), top, f"{t}: a {label} ranks at or above every icon scene")

    def test_item_ordinal_numerals_rank_strictly_above_the_item_icon_scenes(self):
        # the case review 1 found: item.numeral-icon and item.numeral-plain (needs ordinal) sat at 60 under scenes at 80, a 20-point typeFit gap that the
        # weight turns into 600 score points for the scenes. Here the numerals are strictly above every item icon scene and the list still runs from the
        # default down (test_candidates_are_in_fit_order_and_the_first_is_the_default checks the sort for every type).
        cands = self.types["item"]["candidates"]
        numerals = [c for c in cands if c["kind"] == "numeral"]
        scenes = [c for c in cands if c["kind"] == "scene" and c["sub"] in ICON_SCENES]
        self.assertEqual([c["id"] for c in numerals], ["item.numeral-icon", "item.numeral-plain"])
        self.assertTrue(all("ordinal" in c["needs"] for c in numerals), "the ordinal numerals are the ones this test is about")
        self.assertEqual({c["sub"] for c in scenes}, {"@signature", "solo", "trio", "ground", "orbit", "duo-stack"})
        weight = self.data["rhythm"]["scoring"]["weights"]["typeFit"]
        for n in numerals:
            for s in scenes:
                self.assertGreater(n["fit"], s["fit"], f"{n['id']} is above {s['id']}")
                self.assertGreater(weight * (n["fit"] - s["fit"]), 0, f"{n['id']} wins the typeFit term over {s['id']}")
        order = [c["id"] for c in cands]
        self.assertLess(max(order.index(c["id"]) for c in numerals), min(order.index(c["id"]) for c in scenes), "listed before every icon scene")
        # a numeral never ranks below the item's other icon anchor either: the single-object duo is the slice's item target (M0 L1)
        duo = next(c for c in cands if c["id"] == "item.icon-duo")
        self.assertGreaterEqual(min(c["fit"] for c in numerals), duo["fit"])

    def test_topic_primitives_try_icon_scenes_last(self):
        for row in self.data["topicPrimitives"]["byCategory"]:
            heads = [(token.partition(":")[0], token.partition(":")[2]) for token in row["first"]]
            scene_at = [i for i, (h, r) in enumerate(heads) if h == "scene" and r in ICON_SCENES]
            plain_at = [i for i, (h, _r) in enumerate(heads) if h in NON_SCENE_HEADS]
            if scene_at and plain_at:
                self.assertLess(max(plain_at), min(scene_at), f"{row['cats']}: numeral, word, mock, chart, artefact and rows come before icon scenes")

    def test_no_candidate_uses_half_lettermark_or_hollow(self):
        # S-3 (a cropped giant glyph reads as a blob) and S-22 (half is a deferred recipe and field sub): none of them is planned
        banned = {"half", "lettermark", "hollow"}
        self.assertEqual([leaf for leaf in leaves(self.data) if leaf in banned], [])
        for _t, c in self.candidates:
            self.assertNotIn(c["recipe"], banned, c["id"])
            self.assertNotIn(c["sub"], banned, c["id"])
            self.assertNotIn("half", c["id"], c["id"])

    def test_a_variant_is_one_the_engine_draws_now(self):
        # a deferred variant is named in variantLater, so the planner's filter by caps never drops the candidate and no variant is set from it
        later = set()
        for t, c in self.candidates:
            if "variant" in c:
                self.assertNotIn((t, c["variant"]), DEFERRED_VARIANTS, c["id"])
            if "variantLater" in c:
                later.add((t, c["variantLater"]))
                self.assertNotIn("variant", c, c["id"])
        self.assertEqual(later, DEFERRED_VARIANTS, "each deferred variant is named once its candidate exists, and nothing else is deferred")

    # ---- D11b: the table read against the slice ----
    def slice_candidates(self, t):
        return [c for c in self.types[t]["candidates"] if slice_problem(t, c) is None]

    def test_the_slice_can_plan_every_type(self):
        floor_only, kinds = set(), set()
        for t in TYPES:
            if not self.types[t]["planned"]:
                continue
            ok = self.slice_candidates(t)
            self.assertEqual(len([c for c in ok if c.get("floor")]), 1, f"{t}: the floor is inside the slice caps")
            if not [c for c in ok if not c.get("floor")]:
                floor_only.add(t)
            kinds |= {c["kind"] for c in ok}
            self.assertTrue(any(c.get("bold") for c in ok), f"{t}: the bold slide has a candidate the slice can draw")
        self.assertEqual(floor_only, set(), "every type has a candidate beyond its floor: the offer takes a price numeral or its bullets as rows now that card, menu, receipt and post mocks are deferred")
        self.assertEqual(kinds, {"icon", "field", "numeral", "chart", "mock", "rows", "word"}, "the slice plans every kind it builds")

    def test_the_slice_can_draw_the_ten_target_slides(self):
        by_id = {c["id"]: (t, c) for t, c in self.candidates}
        for label, cid in SLICE_TARGETS.items():
            self.assertIn(cid, by_id, label)
            t, c = by_id[cid]
            self.assertIsNone(slice_problem(t, c), f"{label}: {cid} is out of the slice: {slice_problem(t, c)}")
        pauses = [c["id"] for t, c in self.candidates if c.get("pause") and slice_problem(t, c) is None]
        self.assertTrue(pauses, "a pause the slice can draw")
        cta = {c["id"] for c in self.slice_candidates("cta")}
        self.assertTrue({"cta.word-sticker", "cta.icon-giant"} <= cta, "S-9: the CTA word sticker, and the action icon beside it")

    def test_slice_worlds_are_the_two_that_need_only_chat_and_notes(self):
        mock_subs = SLICE_ART["mock"]
        rows = {row["world"]: row for row in self.data["artefactMap"] if "world" in row}
        inside = set()
        for w in self.data["worlds"]:
            seq = w["sequence"]
            refs = [seq["rehook"], seq["reveal"], seq["operate"], seq["cta"], *seq["read"]]
            row = rows[w["artefact"]]
            ok = (all(ref_in_slice(r) for r in refs) and set(w["mockPrefer"]) <= mock_subs and row["kind"] == "mock" and row["sub"] in mock_subs
                  and w["boldMove"]["kind"] != "artefact")
            if ok:
                inside.add(w["id"])
        self.assertEqual(inside, SLICE_WORLDS)

    def test_slice_mirror_is_inside_the_caps_golden(self):
        if not CAPS_GOLDEN.is_file():
            self.skipTest("tests/visual/expected/caps.json does not exist yet (C1 and V2 write it)")
        caps = json.loads(CAPS_GOLDEN.read_text(encoding="utf-8"))
        art = caps.get("art", {})
        missing = []
        for kind, subs in SLICE_ART.items():
            want = {"icon"} if kind == "icon" else subs
            missing += [f"{kind}:{s}" for s in sorted(want - set(art.get(kind, [])))]
        missing += [f"recipe {r}" for r in sorted(SLICE_RECIPES - set(caps.get("recipes", [])))]
        variants = caps.get("variants", {})
        missing += [f"variant {t}:{v}" for t, v in sorted(SLICE_VARIANTS) if v not in variants.get(t, [])]
        self.assertEqual(missing, [], "the SLICE_* mirror in this test lists something the engine caps do not: fix the builder or the mirror")

    # ---- the schema, once E1 has landed it ----
    def test_enums_agree_with_the_spec_schema_when_it_has_the_anchor_definition(self):
        schema = json.loads((DESIGN / "schemas" / "spec.schema.json").read_text(encoding="utf-8"))
        anchor = schema.get("$defs", {}).get("anchor")
        if not anchor:
            self.skipTest("spec.schema.json has no $defs.anchor yet (E1 lands it)")
        props = anchor["properties"]
        self.assertTrue(set(KINDS) <= set(props["kind"]["enum"]))
        self.assertEqual(set(props["template"]["enum"]), TEMPLATES)
        self.assertEqual(set(props["treatment"]["enum"]), TREATMENTS)
        self.assertEqual(set(props["size"]["enum"]), SIZES)
        self.assertEqual(set(props["companion"]["enum"]), COMPANIONS)
        self.assertEqual(set(props["pattern"]["enum"]), PATTERNS)
        self.assertEqual(set(props["wordStyle"]["enum"]), WORDSTYLES)
        defs = schema["$defs"]
        if "chart" in defs:
            self.assertEqual(set(defs["chart"]["properties"]["kind"]["enum"]), CHARTS)
        if "mock" in defs:
            self.assertEqual(set(defs["mock"]["properties"]["kind"]["enum"]), MOCKS)
            self.assertEqual(set(defs["mock"]["properties"]["artefact"]["enum"]), ARTEFACTS)
        if "world" in defs:
            self.assertEqual(set(defs["world"]["properties"]["artefact"]["enum"]), WORLD_ARTEFACTS)
            self.assertEqual(set(defs["world"]["properties"]["toneBias"]["enum"]), TONE_BIAS)


if __name__ == "__main__":
    unittest.main()
