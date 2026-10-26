"""V1b (re-opens V1): the Python twin of the dead-space measure and the recipe geometry (carousel-design/scripts/_cs/space.py) under the measurement
contract v2 (build plan r2 1.1 row 8): units declared in the headers, opts.strict (an owner with no measured fill or border does not qualify), rows
capped at five (S-21).

It reads the same vector files as the JavaScript test (tests/unit/js/visual/space.test.mjs): the 28 Appendix B cases produced by the oracle
(tests/visual/cases/oracle.py), the verdicts typed from the spec table, the recipe vectors worked out by hand, and the fuzz file that pins
the JavaScript result for 32 seeded box sets. Cells must agree exactly. Run: python -X utf8 -m unittest tests.unit.py.test_space
"""
from __future__ import annotations

import copy
import importlib.util
import json
import unittest
from pathlib import Path

try:
    import b7_support as support
except ImportError:  # `python -m unittest tests.unit.py.test_space`: the folder is a package here, not a search-path entry
    from . import b7_support as support

REPO = Path(__file__).resolve().parents[3]
CASES = REPO / "tests" / "visual" / "cases"
sp = None


def setUpModule() -> None:
    global sp
    support.prepare("carousel-design")
    from _cs import space  # noqa: PLC0415
    sp = space


def tearDownModule() -> None:
    support.cleanup()


def load(name: str):
    return json.loads((CASES / name).read_text(encoding="utf-8"))


def T(x, y, w, h, **extra):
    return {"kind": "text", "x": x, "y": y, "w": w, "h": h, **extra}


def I(x, y, w, h, **extra):  # noqa: E743
    return {"kind": "ink", "x": x, "y": y, "w": w, "h": h, **extra}


def O(id, x, y, w, h, **extra):  # noqa: E741
    """A measured owner: fill is an opacity 0-1."""
    return {"kind": "owner", "id": id, "x": x, "y": y, "w": w, "h": h, "fill": 1, **extra}


def U(id, x, y, w, h, **extra):  # noqa: E741
    """An unmeasured owner: no fill, no border."""
    return {"kind": "owner", "id": id, "x": x, "y": y, "w": w, "h": h, **extra}


ZONE = {"w": 852, "h": 888}


def run(boxes, zone=ZONE, opts=None):
    return sp.dead_space(boxes, zone, opts)


class OracleCases(unittest.TestCase):
    def setUp(self) -> None:
        self.cases = load("appendix-b.json")["cases"]

    def test_28_cases_match_the_oracle_cell_for_cell(self) -> None:
        self.assertEqual(len(self.cases), 28)
        for c in self.cases:
            r = run(c["boxes"], c["zone"])
            self.assertEqual(r["cells"], c["expect"]["cells"], c["id"])
            for k in ("band", "rect", "fill", "anchorShare"):
                self.assertLessEqual(abs(r[k] - c["expect"][k]), 0.1, "%s: %s" % (c["id"], k))
            self.assertEqual([o["ok"] for o in r["owners"]], c["expect"]["ownerOk"], c["id"])

    def test_cases_file_is_what_the_oracle_produces(self) -> None:
        spec = importlib.util.spec_from_file_location("make_cases_under_test", CASES / "make_cases.py")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        self.assertEqual(module.dump(module.build()), (CASES / "appendix-b.json").read_text(encoding="utf-8"))

    def test_verdicts_of_the_appendix_b_table(self) -> None:
        spec = load("verdicts.json")
        by_name = {c["name"]: c for c in self.cases}
        for row in spec["rows"]:
            c = by_name[row["name"]]
            r = run(c["boxes"], c["zone"])
            lim = spec["classes"][row.get("class", "working")]
            fix = sum(1 for k in ("band", "rect", "fill") if r[k] >= lim[k][1])
            note = sum(1 for k in ("band", "rect", "fill") if lim[k][0] <= r[k] < lim[k][1])
            self.assertEqual((fix, note), (row["fix"], row["note"]), row["name"])

    def test_the_five_cheats_fail(self) -> None:
        by_name = {c["name"]: c for c in self.cases}
        for name in ("cheat: empty card 852x344", "cheat: lone 300 px icon on a 852x344 panel", "cheat: drenched ground (owner 100% of zone), text only",
                     "cheat: three 80 px marks scattered", "cheat: bold-dots wall over dead area, no content on it"):
            r = run(by_name[name]["boxes"])
            self.assertTrue(r["band"] >= 12 or r["rect"] >= 20 or r["fill"] >= 50, name)
        lone = run(by_name["cheat: lone 300 px icon on a 852x344 panel"]["boxes"])["owners"][0]
        self.assertEqual((lone["ok"], lone["rows"], lone["need"]), (False, 100, 65))
        self.assertTrue(40 < lone["cols"] < 47)


class Parity(unittest.TestCase):
    def test_fuzz_file_reproduces_the_javascript_result(self) -> None:
        fuzz = load("fuzz.json")["cases"]
        self.assertEqual(len(fuzz), 32)
        for c in fuzz:
            self.assertEqual(run(c["boxes"], c["zone"], c["opts"]), c["expect"], c["id"])
        # the pin must exercise the contract: every meta value, owners that pass and fail, and both strict readings
        owners = [(o, (c["opts"] or {}).get("strict") is False) for c in fuzz for o in c["expect"]["owners"]]
        self.assertEqual({o["meta"] for o, _ in owners}, {"ok", "weak", "none"})
        self.assertTrue(any(o["ok"] for o, _ in owners) and any(not o["ok"] for o, _ in owners))
        self.assertTrue(any(loose and o["meta"] == "none" and o["ok"] for o, loose in owners))
        self.assertTrue(any(not loose and o["meta"] == "none" and not o["ok"] for o, loose in owners))

    def test_determinism_and_inputs_untouched(self) -> None:
        for c in load("appendix-b.json")["cases"]:
            boxes = copy.deepcopy(c["boxes"])
            first = run(boxes, c["zone"])
            self.assertEqual(first, run(boxes, c["zone"]), c["id"])
            self.assertEqual(boxes, c["boxes"], c["id"])


class Rules(unittest.TestCase):
    def test_what_never_counts(self) -> None:
        base = [c for c in load("appendix-b.json")["cases"] if c["name"].startswith("recipe under: anchor fills")][0]
        noise = [{"kind": "mark", "x": 0, "y": 400, "w": 852, "h": 400}, {"kind": "decor", "x": 0, "y": 0, "w": 852, "h": 888}, I(0, 0, 852, 888, ground=True),
                 T(0, 460, 852, 400, ghost=True), T(0, 460, 852, 400, lettermark=True), T(0, 460, 852, 400, contrast=0.2), None, {}, T(5, 5, 0, 40), I(5, 5, 40, -3)]
        self.assertEqual(run(base["boxes"] + noise, base["zone"]), run(base["boxes"], base["zone"]))
        self.assertNotEqual(run(base["boxes"] + [T(0, 460, 852, 400, contrast=0.5)], base["zone"]), run(base["boxes"], base["zone"]))

    def test_halos(self) -> None:
        self.assertEqual(run([I(316, 316, 68, 18)])["cells"], run([T(300, 300, 100, 50)])["cells"])
        self.assertEqual(run([{"kind": "image", "x": 300, "y": 300, "w": 100, "h": 100}])["cells"], run([I(332, 332, 36, 36)])["cells"])

    def test_empty_and_clipping(self) -> None:
        empty = run([])
        self.assertEqual((empty["band"], empty["rect"], empty["fill"], empty["anchorShare"], empty["owners"]), (61.7, 100, 100, 0, []))
        self.assertEqual(run([T(1000, 1000, 100, 100), T(-500, -500, 100, 100)]), empty)
        self.assertEqual(run([T(-300, -300, 1500, 1500)])["cells"], run([T(0, 0, 852, 888)])["cells"])

    def test_anchor_share(self) -> None:
        self.assertEqual(run([I(0, 0, 852, 444)])["anchorShare"], 51.4)
        self.assertEqual(run([I(0, 0, 852, 444, anchor=False)])["anchorShare"], 0)
        self.assertEqual(run([T(0, 0, 852, 444)])["anchorShare"], 0)
        self.assertEqual(run([T(0, 0, 852, 444, anchor=True)])["anchorShare"], 51.4)
        self.assertEqual(run([O("a", 0, 0, 852, 444, fill=1)])["anchorShare"], 51.4)

    def test_owner_must_qualify(self) -> None:
        content = [T(10, 10, 832, 280, ownerOf="c")]

        def ok(**extra):
            return run([U("c", 0, 0, 852, 300, **extra)] + content)["owners"][0]["ok"]

        self.assertEqual([ok(fill=0.2), ok(fill=0.35), ok(fill=1), ok(fill=0.1, border=3), ok(fill=0.1, border=2), ok(border=4), ok(fill=0, border=0)],
                         [False, True, True, True, False, True, False])

    def test_big_owner_needs_eighty_percent(self) -> None:
        def rows(h):
            return [O("c", 0, 0, 852, h), T(10, 10, 832, 500, ownerOf="c")]

        big = run(rows(700))["owners"][0]
        self.assertEqual((big["ok"], big["need"], big["rows"]), (False, 80, 73.3))
        small = run(rows(500))["owners"][0]
        self.assertEqual((small["ok"], small["need"], small["rows"]), (True, 65, 100))
        self.assertTrue(run(rows(700), opts={"big": 70})["owners"][0]["ok"])
        self.assertTrue(run(rows(700), opts={"owner": {"big": 0.7}})["owners"][0]["ok"])
        self.assertTrue(run(rows(700), opts={"owner": {"big": 70}})["owners"][0]["ok"])

    def test_nested_owners(self) -> None:
        def child(**extra):
            return [O("o2", 10, 10, 600, 260, ownerOf="o1", **extra), T(30, 30, 560, 220, ownerOf="o2")]

        passing = run([O("o1", 0, 0, 852, 300)] + child())["owners"]
        self.assertEqual([(o["id"], o["ok"]) for o in passing], [("o1", True), ("o2", True)])
        self.assertEqual((passing[0]["rows"], passing[0]["cols"]), (84.6, 72.2))
        failing = run([O("o1", 0, 0, 852, 300)] + child(fill=0.1))["owners"]
        self.assertEqual([(o["id"], o["ok"]) for o in failing], [("o1", True), ("o2", False)])
        self.assertEqual((failing[0]["rows"], failing[0]["cols"]), (84.6, 72.2))

    def test_owners_naming_each_other_terminate(self) -> None:
        r = run([O("a", 0, 0, 400, 400, ownerOf="b"), O("b", 0, 0, 400, 400, ownerOf="a"), T(10, 10, 300, 300, ownerOf="a")])
        self.assertEqual(len(r["owners"]), 2)

    def test_a_ring_a_self_owner_and_a_path_owner_terminate_at_once(self) -> None:
        ring = [O("r%d" % i, i * 20, 0, 300, 300, ownerOf="r%d" % ((i + 1) % 30)) for i in range(30)]
        self.assertEqual(len(run(ring + [T(10, 10, 200, 100, ownerOf="r0")])["owners"]), 30)
        loop = run([O("p", 0, 0, 10, 10, ownerOf="p", path=[[0, 0], [700, 800]]), T(0, 0, 100, 100, ownerOf="p")], opts={"strict": False})
        self.assertGreater(len(loop["owners"]), 20)
        self.assertEqual(run(ring), run(ring))

    def test_options(self) -> None:
        c = [x for x in load("appendix-b.json")["cases"] if x["name"] == "today swiss setup (text only)"][0]
        self.assertEqual(run(c["boxes"], c["zone"])["band"], 30)
        self.assertEqual(run(c["boxes"], c["zone"], {"canvasH": 1350})["band"], 32)
        grid = run(c["boxes"], c["zone"], {"grid": [18, 18]})
        self.assertEqual((len(grid["cells"]), len(grid["cells"][0])), (18, 18))
        self.assertEqual(run(c["boxes"], c["zone"], {"grid": {"cols": 18, "rows": 18}}), grid)
        self.assertEqual(run(c["boxes"], c["zone"], {"cols": 18, "rows": 18}), grid)
        self.assertNotEqual(run(c["boxes"], c["zone"], {"occ": 90})["cells"], run(c["boxes"], c["zone"])["cells"])


SRC = REPO / "src" / "visual"


class Contract(unittest.TestCase):
    """Measurement contract v2: units, strict, the Box type."""

    def test_headers_declare_the_units(self) -> None:
        space = (SRC / "space.js").read_text(encoding="utf-8").split("*/")[0]
        for word in ("PERCENT 0-100", "OPACITY 0-1", "px", "strict", "ownerOf", "anchor?", "path?", "meta"):
            self.assertIn(word, space, "space.js header lacks " + word)
        geometry = (SRC / "geometry.js").read_text(encoding="utf-8").split("*/")[0]
        for word in ("UNITS", "px", "percent 0-100", "rowsMax = 5", "S-21"):
            self.assertIn(word, geometry, "geometry.js header lacks " + word)
        for word in ("PERCENT 0-100", "OPACITY 0-1", "px", "strict", "ownerOf", "ROWS_MAX = 5"):
            self.assertIn(word, sp.__doc__, "space.py docstring lacks " + word)

    def test_results_are_percent_on_a_0_to_100_scale(self) -> None:
        for c in load("appendix-b.json")["cases"]:
            r = run(c["boxes"], c["zone"])
            for k in ("band", "rect", "fill", "anchorShare"):
                self.assertTrue(0 <= r[k] <= 100, "%s: %s %s" % (c["id"], k, r[k]))
                self.assertEqual(round(r[k] * 10) / 10, r[k], "%s: %s has one decimal" % (c["id"], k))
            for o in r["owners"]:
                self.assertTrue(0 <= o["rows"] <= 100 and 0 <= o["cols"] <= 100, c["id"])
        card = [O("c", 0, 0, 852, 500), T(10, 10, 832, 500, ownerOf="c")]
        for a, b in (({"owner": {"min": 0.65}}, {"owner": {"min": 65}}), ({"owner": {"min": 1}}, {"owner": {"min": 100}}), ({"occ": 0.3}, {"occ": 30}),
                     ({"owner": {"fill": 0.35, "border": 3}}, {})):
            self.assertEqual(run(card, opts=a), run(card, opts=b), (a, b))
        self.assertEqual(run(card, opts={"owner": {"min": 100}})["owners"][0]["need"], 100)
        half = [O("c", 0, 0, 852, 300, fill=0.5), T(10, 10, 832, 280, ownerOf="c")]
        self.assertFalse(run(half, opts={"owner": {"fill": 0.6}})["owners"][0]["ok"])
        self.assertTrue(run(half, opts={"owner": {"fill": 50}})["owners"][0]["ok"])

    def test_strict_is_the_default_and_only_false_switches_it_off(self) -> None:
        content = [T(10, 10, 832, 280, ownerOf="c")]

        def owner(opts=None, **extra):
            o = run([U("c", 0, 0, 852, 300, **extra)] + content, opts=opts)["owners"][0]
            return o["ok"], o["meta"]

        self.assertEqual(owner(), (False, "none"))
        self.assertEqual(owner({"strict": True}), (False, "none"))
        self.assertEqual(owner({"strict": False}), (True, "none"))
        for v in (None, 0, "", "false"):
            self.assertEqual(owner({"strict": v}), (False, "none"), repr(v))
        for strict in (True, False):
            o = {"strict": strict}
            self.assertEqual(owner(o, fill=0.5), (True, "ok"))
            self.assertEqual(owner(o, fill=0.2), (False, "weak"))
            self.assertEqual(owner(o, border=3), (True, "ok"))
            self.assertEqual(owner(o, border=2), (False, "weak"))
            self.assertEqual(owner(o, fill=0, border=0), (False, "weak"))
        # a wrong unit or type is not metadata: a percent fill, a negative border, a string, a boolean, NaN
        for bad in ({"fill": 35}, {"fill": 100}, {"fill": -0.5}, {"fill": "0.5"}, {"fill": True}, {"fill": float("nan")}, {"border": -1}, {"border": "4"},
                    {"border": None}, {"fill": 35, "border": "3"}):
            self.assertEqual(owner(**bad), (False, "none"), bad)
            self.assertEqual(owner({"strict": False}, **bad), (True, "none"), bad)
        self.assertEqual(owner(fill=35, border=4), (True, "ok"))
        loose = [T(0, 0, 400, 100), I(0, 150, 200, 200)]
        self.assertEqual(run(loose), run(loose, opts={"strict": False}))

    def test_an_unmeasured_owner_counts_only_through_its_content(self) -> None:
        def boxes(**extra):
            return [U("c", 0, 0, 852, 344, **extra), T(212, 20, 640, 120, ownerOf="c")]

        strict = run(boxes())
        self.assertFalse(strict["owners"][0]["ok"])
        self.assertEqual(strict["cells"], run(boxes(fill=0.1))["cells"])
        self.assertEqual(run(boxes(), opts={"strict": False})["cells"], run(boxes(fill=1))["cells"])
        self.assertGreaterEqual(strict["rect"], 20)

    def test_the_cases_without_their_metadata(self) -> None:
        owners = 0
        for c in load("appendix-b.json")["cases"]:
            bare = [{k: v for k, v in b.items() if k not in ("fill", "border")} for b in c["boxes"]]
            legacy, measured, strict = run(bare, c["zone"], {"strict": False}), run(c["boxes"], c["zone"]), run(bare, c["zone"])
            self.assertEqual(legacy["cells"], measured["cells"], c["id"])
            self.assertEqual([o["ok"] for o in legacy["owners"]], [o["ok"] for o in measured["owners"]], c["id"])
            self.assertTrue(all(o["meta"] == "none" for o in legacy["owners"]) and all(o["meta"] == "ok" for o in measured["owners"]), c["id"])
            self.assertTrue(all(o["ok"] is False and o["meta"] == "none" for o in strict["owners"]), c["id"])
            owners += len(strict["owners"])
        self.assertGreaterEqual(owners, 20)


class Strokes(unittest.TestCase):
    def test_one_box_per_32_px(self) -> None:
        flat = sp.stroke_boxes([[0, 0], [320, 0]])
        self.assertEqual(len(flat), 10)
        self.assertEqual(flat[0], {"x": -8, "y": -24, "w": 48, "h": 48, "kind": "ink"})
        self.assertEqual(flat[9], {"x": 280, "y": -24, "w": 48, "h": 48, "kind": "ink"})
        diagonal = sp.stroke_boxes([[0, 0], [300, 400]])
        self.assertEqual(len(diagonal), 16)
        self.assertEqual((diagonal[0]["x"], diagonal[0]["y"], diagonal[15]["x"], diagonal[15]["y"]), (-14, -11, 270, 368))
        self.assertEqual(len(sp.stroke_boxes([[100, 100]])), 1)
        self.assertEqual(len(sp.stroke_boxes([[0, 0], [0, 0]])), 1)
        self.assertEqual(len(sp.stroke_boxes([[0, 0], [10, 0]])), 1)

    def test_a_diagonal_is_not_its_bounding_rectangle(self) -> None:
        def count(r):
            return "".join(r["cells"]).count("#")

        stroke, rectangle = run([{"kind": "ink", "path": [[0, 0], [800, 800]]}]), run([I(0, 0, 800, 800)])
        self.assertTrue(0 < count(stroke) < count(rectangle) / 2)


class Geometry(unittest.TestCase):
    def test_zone(self) -> None:
        for z in load("recipes.json")["zones"]:
            self.assertEqual(sp.zone(z["preset"], z["h"], z.get("type")), z["expect"], z)

    def test_recipe_vectors(self) -> None:
        vectors = load("recipes.json")["vectors"]
        self.assertGreaterEqual(len(vectors), 40)
        seen = set()
        for v in vectors:
            got = sp.recipe(v["name"], v["opts"])
            seen.add(v["name"])
            for k, want in v["expect"].items():
                self.assertEqual(got[k], want, "%s: %s" % (v["id"], k))
            self.assertEqual("caption" in got, "caption" in v["expect"], v["id"])
        self.assertEqual(seen, set(sp.RECIPES) | {"bogus"})

    def test_rows_are_capped_at_five_in_every_recipe(self) -> None:
        self.assertEqual(sp.ROWS_MAX, 5)
        for n in range(1, 10):
            k = min(n, 5)
            self.assertEqual(sp.limits("rows", n), (128 * k, 128 * k + 40), n)
        self.assertEqual(sp.limits("rows"), sp.limits("rows", 3))
        for name in sp.RECIPES:
            for n in (3, 4, 5):
                self.assertNotEqual(sp.recipe(name, {"kind": "rows", "n": n, "T": 100})["reason"], "rows-max", (name, n))
            for n in (6, 7, 8, 9):
                r = sp.recipe(name, {"kind": "rows", "n": n, "T": 100})
                self.assertEqual((r["ok"], r["reason"]), (False, "rows-max"), (name, n))
        self.assertTrue(sp.recipe("under", {"kind": "icon", "n": 8, "T": 100})["ok"])
        six, five = sp.recipe("under", {"kind": "rows", "n": 6, "T": 200}), sp.recipe("under", {"kind": "rows", "n": 5, "T": 200})
        self.assertEqual(six["anchor"], five["anchor"])
        self.assertTrue(five["ok"])

    def test_defaults_and_limits(self) -> None:
        self.assertEqual(sp.recipe("under", {"T": 300})["anchor"], {"x": 0, "y": 340, "w": 852, "h": 548})
        self.assertEqual((sp.limits("rows", 5), sp.limits("rows", 9), sp.limits("icon"), sp.limits("unknown")), ((640, 680), (640, 680), (280, 560), (280, 0)))
        self.assertTrue(sp.recipe("under")["ok"])


if __name__ == "__main__":
    unittest.main()
