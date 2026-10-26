"""Q1 (rules + rollout): the visual checks of spec 7.4 in data/qa-rules.json and their thresholds in data/platform-instagram.json
(plugin.visual, geometry.inner), under the contract sheet v2 of build plan r2 (1.2) and the rollout stage 0 of CX 13.

What is pinned here: every id of the table is present once with its end-state severity, engines and scope; the retired D9.dead-zone; every
$platform reference resolves in the real resolver; every placeholder of a message is a declared variable in both languages; the Arabic strings
lint clean through _cs.lint.lint_text; the thresholds of plugin.visual reproduce the verdicts of spec Appendix B through the Python dead-space
measure (tests/visual/cases); the numbers shared with art-direction.json agree; the stage-0 cap, the BLOCK switches and the deferred marks;
the inner footer geometry of S-1; no number of a new visual check is written inline in the rules (every one is read from plugin.visual, spec 7,
IS-8), so a change of platform policy reaches the rule; D2.chrome-drift measures each chrome element inside the band of its own slide (S-1), pinned
by a reference of the rule's formula that engines follow. Run: python -X utf8 -m unittest tests.unit.py.test_qa_rules_visual
"""
from __future__ import annotations

import copy
import json
import re
import unittest
from pathlib import Path

try:
    import b7_support as support
except ImportError:  # `python -m unittest tests.unit.py.test_qa_rules_visual`: the folder is a package here, not a search-path entry
    from . import b7_support as support

REPO = Path(__file__).resolve().parents[3]
SK = REPO / "plugins" / "carousel-studio" / "skills" / "carousel-design"
CASES = REPO / "tests" / "visual" / "cases"
lint = rules = space = report = None


def setUpModule() -> None:
    global lint, rules, space, report
    support.prepare("carousel-design")
    from _cs import lint as _lint, report as _report, rules as _rules, space as _space  # noqa: PLC0415
    lint, rules, space, report = _lint, _rules, _space, _report


def tearDownModule() -> None:
    support.cleanup()


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


SEV_RANK = {"NOTE": 0, "FIX": 1, "BLOCK": 2}
J, PJ = ["js"], ["py", "js"]

# spec 7.4, end state: id -> (sev, every severity a finding of the check can carry, engines, scope).  Q1's card: VA2 and all D9, D10, D11 checks are js only.
EXPECT = {
    "D9.band": ("FIX", ["NOTE", "FIX"], J, "rendered"),
    "D9.rect": ("FIX", ["NOTE", "FIX"], J, "rendered"),
    "D9.fill": ("FIX", ["NOTE", "FIX"], J, "rendered"),
    "D9.container-fill": ("FIX", ["NOTE", "FIX"], J, "rendered"),
    "D9.plate-calm": ("FIX", ["FIX"], J, "rendered"),
    "VA1.anchor-present": ("FIX", ["NOTE", "FIX"], PJ, "spec"),
    "VA2.anchor-size": ("FIX", ["NOTE", "FIX"], J, "rendered"),
    "VA3.valid": ("FIX", ["FIX"], PJ, "spec"),
    "VA4.chart-honesty": ("BLOCK", ["FIX", "BLOCK"], PJ, "spec"),
    "VA5.variety": ("FIX", ["FIX"], PJ, "spec"),
    "VA5.relaxed": ("NOTE", ["NOTE"], PJ, "spec"),
    "VA5.no-bold": ("NOTE", ["NOTE"], PJ, "spec"),
    "VA6.pause": ("FIX", ["FIX"], PJ, "spec"),
    "VA7.agreement": ("FIX", ["NOTE", "FIX"], PJ, "spec"),
    "VA8.constraints": ("BLOCK", ["BLOCK"], PJ, "spec"),
    "D8.anchor-run": ("FIX", ["FIX"], PJ, "spec"),
    "D8.tone-run": ("FIX", ["FIX"], PJ, "spec"),
    "D10.nesting": ("FIX", ["FIX"], J, "rendered"),
    "D10.icon-tile-stack": ("FIX", ["FIX"], J, "rendered"),
    "D10.side-border": ("FIX", ["FIX"], J, "rendered"),
    "D10.icon-system": ("FIX", ["FIX"], J, "rendered"),
    "D10.stroke-feed": ("NOTE", ["NOTE"], J, "rendered"),
    "D10.art-label": ("FIX", ["FIX"], J, "rendered"),
    "D10.glyph-icon": ("FIX", ["FIX"], J, "text"),
    "D10.edge-fragment": ("NOTE", ["NOTE"], J, "rendered"),
    "D10.squint": ("NOTE", ["NOTE"], J, "rendered"),
    "D11.tokens": ("FIX", ["FIX"], J, "rendered"),
    "D11.thread-drift": ("BLOCK", ["BLOCK"], J, "rendered"),
    "D11.seam": ("FIX", ["FIX"], J, "rendered"),
    "C2.body-with-art": ("FIX", ["NOTE", "FIX"], PJ, "text"),
    "C2.demo-words": ("FIX", ["FIX"], PJ, "text"),
    "C2.demo-missing": ("NOTE", ["NOTE"], PJ, "text"),
    "C2.demo-duplicate": ("NOTE", ["NOTE"], PJ, "text"),
    "C2.figure-repeat": ("NOTE", ["NOTE"], PJ, "text"),
    "RX1.visual-distance": ("NOTE", ["NOTE"], PJ, "spec"),
    # round 3, wave 2b (DATA-TONES-LINT): the gates the slice verdict showed missing. text-dropped and text-duplicated read the rendered text, so only
    # the JavaScript engine can run them; tone-flat and word-echo are spec checks whose Python twins wait for Q6 like their neighbours
    "C2.text-dropped": ("BLOCK", ["BLOCK"], J, "rendered"),
    "C2.text-duplicated": ("BLOCK", ["BLOCK"], J, "rendered"),  # copy drawn twice is as broken as copy lost: BLOCK, like text-dropped
    "C2.word-echo": ("NOTE", ["NOTE"], PJ, "spec"),
    "D8.tone-flat": ("FIX", ["NOTE", "FIX"], PJ, "spec"),
    "VA9.anchor-unbuilt": ("FIX", ["NOTE", "FIX"], J, "rendered"),
}
NEW_GATES = ["D10", "D11", "VA1", "VA2", "VA3", "VA4", "VA5", "VA6", "VA7", "VA8", "VA9", "RX1"]
# spec 7.3 / 7.6 stage 0: every D9.*, VA1, VA2 and the D8 additions ship at NOTE; findings carry prospect
CAPPED = {"D9.band", "D9.rect", "D9.fill", "D9.container-fill", "D9.plate-calm", "VA1.anchor-present", "VA2.anchor-size", "VA9.anchor-unbuilt", "D8.anchor-run", "D8.tone-run",
          "D8.tone-flat"}
# r2 3.1: gates built in the slice. Everything else is deferred, and the Python twins of the spec-scope gates wait for Q6.
DEFERRED_JS = {"D9.plate-calm", "D10.side-border", "D10.icon-system", "D10.edge-fragment", "D10.squint", "D11.tokens", "D11.thread-drift", "D11.seam",
               "VA5.variety", "VA5.relaxed", "VA5.no-bold", "RX1.visual-distance"}
DEFERRED_PY = {"VA1.anchor-present", "VA3.valid", "VA4.chart-honesty", "VA5.variety", "VA5.relaxed", "VA5.no-bold", "VA6.pause", "VA7.agreement", "VA8.constraints",
               "D8.anchor-run", "D8.tone-run", "D8.tone-flat", "C2.body-with-art", "C2.demo-words", "C2.demo-missing", "C2.demo-duplicate", "C2.figure-repeat", "C2.word-echo",
               "RX1.visual-distance"}
AUTOFIX_IDS = {"anchor-size", "layout", "rows", "anchor-add", "field", "split", "refit"}
# spec 7.4 "Autofix" column: the strategies a check names (the chain may add the emptiness strategies of 7.5)
AUTOFIX_SPEC = {
    "D9.band": ["anchor-size", "layout"], "D9.rect": ["anchor-size", "layout", "rows"], "D9.fill": ["anchor-size"], "D9.container-fill": ["layout"],
    "VA1.anchor-present": ["anchor-add"], "VA2.anchor-size": ["anchor-size"], "VA5.variety": ["anchor-add"], "D8.anchor-run": ["layout"],
    "D10.icon-tile-stack": ["layout", "rows"], "D10.icon-system": ["anchor-size"], "D10.stroke-feed": ["anchor-size"], "D10.art-label": ["refit"],
    "D11.thread-drift": ["refit"], "D11.seam": ["refit"], "C2.body-with-art": ["split"],
}
VISUAL_KEYS = {"zone", "grid", "halo", "owner", "classes", "band", "rect", "fill", "plate", "anchorShare", "artLabel", "strokeFeed", "smell", "words", "block", "rollout",
               "rhythm", "plan", "craft", "continuity", "tones", "wordEcho"}
# the groups added for the limits that had no table of their own: one object per check, the param of a rule carries the name of its key
POLICY_GROUPS = ("rhythm", "plan", "craft", "continuity")
# gates whose checks are all new in round 3, and the new checks inside older gates, plus D2.chrome-drift (rewritten for S-1): no number is written inline
NEW_GATE_IDS = ("D9", "D10", "D11", "VA1", "VA2", "VA3", "VA4", "VA5", "VA6", "VA7", "VA8", "VA9", "RX1")
NEW_CHECK_IDS = ("D8.anchor-run", "D8.tone-run", "D8.tone-flat", "C2.body-with-art", "C2.demo-words", "C2.demo-missing", "C2.demo-duplicate", "C2.figure-repeat", "C2.dense-words",
                 "C2.text-dropped", "C2.text-duplicated", "C2.word-echo", "D2.chrome-drift")
# the only inline numbers a new check may carry: code points of a symbol set (a vocabulary, not a limit)
INLINE_NUMBERS_ALLOWED = {("D10.glyph-icon", "glyphs")}
PLACEHOLDER = re.compile(r"\{([A-Za-z0-9_]+)\}")


def load():
    return read_json(SK / "data" / "qa-rules.json"), read_json(SK / "data" / "platform-instagram.json")


def checks_of(doc):
    return {c["id"]: (g, c) for g in doc["gates"] for c in g["checks"]}


def engines_of(g, c):
    return c.get("engines") or g.get("engines") or ["py", "js"]


def scope_of(g, c):
    return c.get("scope") or g.get("scope")


def refs_of(node, out=None):
    out = [] if out is None else out
    if isinstance(node, dict):
        if set(node) == {"$platform"}:
            out.append(node["$platform"])
        else:
            for v in node.values():
                refs_of(v, out)
    elif isinstance(node, list):
        for v in node:
            refs_of(v, out)
    return out


def walk_path(doc, path):
    cur = doc
    for part in path.split("."):
        cur = cur.get(part) if isinstance(cur, dict) else None
        if cur is None:
            return None
    return cur


class Presence(unittest.TestCase):
    def setUp(self) -> None:
        self.doc, self.platform = load()
        self.checks = checks_of(self.doc)

    def test_every_id_of_the_table_is_present_once(self) -> None:
        all_ids = [c["id"] for g in self.doc["gates"] for c in g["checks"]]
        self.assertEqual(len(all_ids), len(set(all_ids)), "duplicate check ids")
        self.assertEqual(sorted(set(EXPECT) - set(all_ids)), [])
        for cid in EXPECT:
            self.assertTrue(cid.startswith(self.checks[cid][0]["id"] + "."), cid)
            self.assertRegex(cid, r"^[A-Z]{1,3}[0-9]{1,2}(\.[a-z0-9-]+)?$")
        self.assertEqual(len(EXPECT), 40)

    def test_gate_order_and_titles(self) -> None:
        self.assertEqual(self.doc["order"], [g["id"] for g in self.doc["gates"]])
        order = self.doc["order"]
        self.assertEqual(order[order.index("D8"):order.index("T1") + 1], ["D8", "D9", "D10", "D11", "VA1", "VA2", "VA3", "VA4", "VA5", "VA6", "VA7", "VA8", "VA9", "RX1", "T1"])
        for gid in NEW_GATES:
            gate = next(g for g in self.doc["gates"] if g["id"] == gid)
            self.assertTrue(gate["title"]["ar"].strip() and gate["title"]["en"].strip(), gid)
            self.assertRegex(gid, r"^[A-Z]{1,3}[0-9]{1,2}$")

    def test_d9_dead_zone_is_retired_but_still_renders(self) -> None:
        self.assertNotIn("D9.dead-zone", self.checks)
        d9 = next(g for g in self.doc["gates"] if g["id"] == "D9")
        self.assertEqual([c["id"] for c in d9["checks"]], ["D9.band", "D9.rect", "D9.fill", "D9.container-fill", "D9.plate-calm"])
        retired = {r["id"]: r for r in self.doc["retired"]}
        self.assertEqual(list(retired), ["D9.dead-zone"])
        r = retired["D9.dead-zone"]
        self.assertEqual((r["gate"], r["replacedBy"], r["sev"]), ("D9", ["D9.band"], "FIX"))
        self.assertTrue(r["msg"]["ar"].strip() and r["msg"]["en"].strip() and r["fix"]["ar"].strip())
        self.assertEqual(r["vars"], ["pct", "from", "to", "max"])
        self.assertIn("D9.band", self.checks)
        # a 1.0 finding keeps its own messages, so an old report still renders without the check
        sample = {"pct": 31, "from": 480, "to": 900, "max": 25}
        self.assertNotIn("{", report.format_msg(r["msg"]["ar"], sample))
        self.assertIn("31%", report.format_msg(r["msg"]["en"], sample))

    def test_severities_engines_and_scope_are_the_end_state(self) -> None:
        for cid, (sev, sevs, engines, scope) in EXPECT.items():
            g, c = self.checks[cid]
            self.assertEqual(c["sev"], sev, cid)
            self.assertEqual(c.get("sevs") or [c["sev"]], sevs, cid)
            self.assertEqual(max(sevs, key=SEV_RANK.get), sev, cid + ": sev is the highest severity the check can carry")
            self.assertEqual(engines_of(g, c), engines, cid)
            self.assertEqual(scope_of(g, c), scope, cid)
            self.assertTrue(c["when"].strip() and c["fix"]["ar"].strip() and c["fix"]["en"].strip(), cid)

    def test_the_card_engine_rule(self) -> None:
        for cid in EXPECT:
            g, c = self.checks[cid]
            want = ["js"] if cid in ("VA2.anchor-size", "VA9.anchor-unbuilt", "C2.text-dropped", "C2.text-duplicated") or cid.split(".")[0] in ("D9", "D10", "D11") else ["py", "js"]
            self.assertEqual(engines_of(g, c), want, cid)

    def test_no_check_is_overridable_by_accident(self) -> None:
        for cid in EXPECT:
            g, c = self.checks[cid]
            self.assertFalse(c.get("overridable") or g.get("overridable"), cid)

    def test_the_gates_that_list_types_carry_the_new_types(self) -> None:
        # the test_sweeps rule: every list of slide types that names story-beat names grid and timeline too
        def walk(node):
            if isinstance(node, dict):
                for key, value in node.items():
                    if key in ("slideTypes", "types") and isinstance(value, list) and "story-beat" in value:
                        for t in ("grid", "timeline"):
                            self.assertIn(t, value, key)
                    walk(value)
            elif isinstance(node, list):
                for item in node:
                    walk(item)
        walk(self.doc)
        dense = self.checks["C2.dense-words"][1]
        self.assertEqual(dense["appliesTo"]["slideTypes"], ["checklist", "summary", "grid", "timeline"])
        for cid in ("VA1.anchor-present", "VA2.anchor-size", "VA9.anchor-unbuilt"):
            types = self.checks[cid][1]["appliesTo"]["slideTypes"]
            self.assertNotIn("cover", types)
            self.assertNotIn("poster", types)
            self.assertEqual(len(types), 18, cid)


class References(unittest.TestCase):
    def setUp(self) -> None:
        self.doc, self.platform = load()

    def test_every_platform_reference_resolves(self) -> None:
        refs = refs_of(self.doc)
        self.assertGreater(len(refs), 170)
        for path in refs:
            self.assertIsNotNone(walk_path(self.platform, path), path)
        resolved = rules._resolve_refs(copy.deepcopy(self.doc), self.platform)   # the resolver of every Python caller
        self.assertEqual(refs_of(resolved), [])

    def test_every_visual_key_is_read_by_a_rule(self) -> None:
        used = {p.split(".")[2] for p in refs_of(self.doc) if p.startswith("plugin.visual.")}
        self.assertEqual(used, VISUAL_KEYS)
        self.assertEqual(set(self.platform["plugin"]["visual"]) - {"_note"}, VISUAL_KEYS)

    def test_the_references_of_the_new_checks_stay_in_known_trees(self) -> None:
        checks = checks_of(self.doc)
        for cid in EXPECT:
            for path in refs_of(checks[cid][1]):
                self.assertRegex(path, r"^(plugin\.visual|plugin\.text|plugin\.contrast)\.", cid)
        d9 = next(g for g in self.doc["gates"] if g["id"] == "D9")
        self.assertEqual(sorted(d9["measure"]), ["classes", "grid", "halo", "owner", "zone"])
        for path in refs_of(d9["measure"]):
            self.assertTrue(path.startswith("plugin.visual."), path)

    def test_the_inner_footer_reaches_the_d2_gates(self) -> None:
        checks = checks_of(rules._resolve_refs(copy.deepcopy(self.doc), self.platform))
        band = checks["D2.chrome-band"][1]["params"]
        self.assertEqual(band["innerFooter"], self.platform["geometry"]["inner"]["bands"]["footer"])
        self.assertEqual(band["footer"], self.platform["geometry"]["bands"]["footer"])
        self.assertEqual(checks["D2.outside-content"][1]["params"]["chromeBox"], self.platform["geometry"]["safeBox"])
        self.assertIn("innerFooter", checks["D2.chrome-band"][1]["when"])
        self.assertIn("chromeBox", checks["D2.outside-content"][1]["when"])


class Messages(unittest.TestCase):
    def setUp(self) -> None:
        self.doc, _ = load()
        self.checks = checks_of(self.doc)

    def test_placeholders_match_in_both_languages_and_in_vars(self) -> None:
        for cid in EXPECT:
            g, c = self.checks[cid]
            msg_ar, msg_en = set(PLACEHOLDER.findall(c["msg"]["ar"])), set(PLACEHOLDER.findall(c["msg"]["en"]))
            self.assertEqual(msg_ar, msg_en, cid)
            self.assertEqual(sorted(msg_ar), sorted(c["vars"]), cid + ": every var appears in both messages")
            self.assertEqual(len(c["vars"]), len(set(c["vars"])), cid)
            for lang in ("ar", "en"):
                self.assertLessEqual(set(PLACEHOLDER.findall(c["fix"][lang])), set(c["vars"]), cid + " fix " + lang)
            self.assertEqual(set(PLACEHOLDER.findall(c["fix"]["ar"])), set(PLACEHOLDER.findall(c["fix"]["en"])), cid)

    def test_a_formatted_message_has_no_placeholder_left_and_fits_the_report_schema(self) -> None:
        for cid in EXPECT:
            _, c = self.checks[cid]
            values = {k: "12" for k in c["vars"]}
            for part in ("msg", "fix"):
                for lang in ("ar", "en"):
                    text = report.format_msg(c[part][lang], values)
                    self.assertNotRegex(text, r"[{}]", cid)
                    self.assertLessEqual(len(text), 600, cid)

    def test_arabic_strings_lint_clean(self) -> None:
        texts = []
        for cid in EXPECT:
            _, c = self.checks[cid]
            texts += [(cid + ".msg", c["msg"]["ar"]), (cid + ".fix", c["fix"]["ar"])]
        for gid in NEW_GATES:
            texts.append((gid + ".title", next(g for g in self.doc["gates"] if g["id"] == gid)["title"]["ar"]))
        d9 = next(g for g in self.doc["gates"] if g["id"] == "D9")
        texts.append(("D9.title", d9["title"]["ar"]))
        dense = self.checks["C2.dense-words"][1]
        texts.append(("C2.dense-words.msg", dense["msg"]["ar"]))
        for key, text in texts:
            found = [(i["sev"], i["rule"]) for i in lint.lint_text(text, dialect="msa-white", digits="western") if i["sev"] in ("BLOCK", "FIX")]
            self.assertEqual(found, [], key + ": " + text)
            self.assertIsNone(re.search("[٠-٩۰-۹]", text), key + ": Western digits only")
            self.assertIsNone(re.search("[ٌ-ِْ-ٟـ]", text), key + ": no vowel marks and no tatweel (fathatan on alef and shadda are plain spelling)")
            self.assertIsNone(re.search("[A-Za-z]", PLACEHOLDER.sub("", text)), key + ": no Latin letters in Arabic copy")
            self.assertEqual(text, text.strip(), key)

    def test_english_has_no_trailing_space_and_ends_like_the_old_ones(self) -> None:
        for cid in EXPECT:
            _, c = self.checks[cid]
            for part in ("msg", "fix"):
                self.assertEqual(c[part]["en"], c[part]["en"].strip(), cid)
                self.assertTrue(c[part]["en"].endswith("."), cid + " " + part)
                self.assertTrue(c[part]["ar"].endswith("."), cid + " " + part)

    def test_the_dense_words_message_names_cards(self) -> None:
        dense = self.checks["C2.dense-words"][1]
        self.assertEqual(sorted(PLACEHOLDER.findall(dense["msg"]["ar"])), ["count", "max"])
        self.assertEqual(sorted(PLACEHOLDER.findall(dense["msg"]["en"])), ["count", "max"])
        self.assertIn("items", dense["when"])
        self.assertIn("demo", self.checks["C2.slide-words"][1]["when"])


class Rollout(unittest.TestCase):
    def setUp(self) -> None:
        self.doc, self.platform = load()
        self.checks = checks_of(self.doc)
        self.visual = self.platform["plugin"]["visual"]

    def test_stage_zero_caps_exactly_the_checks_of_the_spec(self) -> None:
        capped = {cid for cid, (g, c) in self.checks.items() if isinstance(c.get("params"), dict) and "rollout" in c["params"]}
        self.assertEqual(capped, CAPPED)
        self.assertEqual(self.visual["rollout"]["stage"], 0)
        self.assertEqual(self.visual["rollout"]["stage0Sev"], "NOTE")
        for cid in CAPPED:
            self.assertEqual(self.checks[cid][1]["params"]["rollout"], {"$platform": "plugin.visual.rollout"}, cid)
            self.assertEqual(self.checks[cid][1]["sev"], "FIX", cid + ": the prospect severity is the end state")

    def test_every_block_switch_is_off(self) -> None:
        switches = {k: v for k, v in self.visual["block"].items() if not k.startswith("_")}
        self.assertEqual(sorted(switches), ["anchorRun", "band", "rect"])
        for name, sw in switches.items():
            self.assertEqual(sw, {"enabled": False}, name)
        for cid, key in (("D9.band", "band"), ("D9.rect", "rect"), ("VA1.anchor-present", "anchorRun")):
            self.assertEqual(self.checks[cid][1]["params"]["block"], {"$platform": "plugin.visual.block." + key}, cid)

    def test_deferred_marks(self) -> None:
        marked = {cid: c["deferred"] for cid, (g, c) in self.checks.items() if "deferred" in c}
        self.assertEqual(set(marked), DEFERRED_JS | DEFERRED_PY)
        for cid, d in marked.items():
            g, c = self.checks[cid]
            self.assertEqual(sorted(d), ["by", "engines"], cid)
            self.assertTrue(d["by"].strip(), cid)
            self.assertTrue(set(d["engines"]) <= set(engines_of(g, c)), cid)
            self.assertEqual("js" in d["engines"], cid in DEFERRED_JS, cid)
            self.assertEqual("py" in d["engines"], cid in DEFERRED_PY, cid)
        for cid in set(EXPECT) - DEFERRED_JS:
            self.assertFalse("js" in marked.get(cid, {}).get("engines", []), cid + " is built in the slice")

    def test_autofix_ids(self) -> None:
        for cid in EXPECT:
            af = self.checks[cid][1]["autofix"]
            if cid not in AUTOFIX_SPEC:
                self.assertIsNone(af, cid)
                continue
            self.assertIn(af["kind"], AUTOFIX_IDS, cid)
            self.assertEqual(af["engines"], ["js"], cid)
            chain = af["chain"]
            self.assertEqual(chain[0], af["kind"], cid)
            self.assertTrue(set(chain) <= AUTOFIX_IDS, cid)
            self.assertEqual([x for x in chain if x in AUTOFIX_SPEC[cid]], AUTOFIX_SPEC[cid], cid + ": the strategies of spec 7.4, in order")
            self.assertEqual(len(chain), len(set(chain)), cid)
        used = {k for cid in AUTOFIX_SPEC for k in self.checks[cid][1]["autofix"]["chain"]}
        self.assertEqual(used, AUTOFIX_IDS, "every autofix id of the card is used")

    def test_old_checks_are_still_there(self) -> None:
        for cid in ("C1.hero-words", "C2.body-hard", "C3.words", "D8.rhythm", "D2.keep-out", "D4.contrast", "V1.loop", "X1.credit", "SRC1.missing", "O1.ortho"):
            self.assertIn(cid, self.checks, cid)
        self.assertEqual(len(self.doc["gates"]), 41)
        self.assertEqual(self.doc["rulesVersion"], "1.1.0")


class Thresholds(unittest.TestCase):
    def setUp(self) -> None:
        self.doc, self.platform = load()
        self.visual = self.platform["plugin"]["visual"]

    def test_spec_7_3_numbers(self) -> None:
        v = self.visual
        self.assertEqual(v["band"], {"working": {"note": 8, "fix": 12, "block": 22}, "cover": {"note": 10, "fix": 15, "block": 25}, "pause": {"note": 18, "fix": 24, "block": None}})
        self.assertEqual(v["rect"], {"working": {"note": 15, "fix": 20, "block": 34}, "cover": {"note": 20, "fix": 24, "block": 38}, "pause": {"note": 30, "fix": 40, "block": None}})
        self.assertEqual(v["fill"], {"working": {"note": 40, "fix": 50}, "pause": {"note": 60, "fix": 70}})
        self.assertEqual(v["plate"], {"bandMax": 20, "rectMax": 25, "subjectMin": 20})
        self.assertEqual(v["anchorShare"]["cover"], {"bandMax": 12, "rectMax": 15})
        self.assertEqual((v["anchorShare"]["fixFactor"], v["anchorShare"]["peakMin"], v["anchorShare"]["minGlyphPx"], v["anchorShare"]["minMockWidth"]), (80, 35, 160, 60))
        for name in ("band", "rect", "fill"):
            for cls, row in v[name].items():
                self.assertLess(row["note"], row["fix"], name + " " + cls)
                if row.get("block") is not None:
                    self.assertLess(row["fix"], row["block"], name + " " + cls)

    def test_objects_that_callers_loop_over_carry_no_notes(self) -> None:
        v = self.visual
        for key in ("classes", "band", "rect", "fill", "grid", "halo", "owner", "plate", "strokeFeed", "smell", "words"):
            self.assertFalse([k for k in v[key] if k.lower() in ("note", "_note")], key)
        for name, row in v["classes"].items():
            self.assertIsInstance(row, list, "classes." + name + " is a list of slide types")
        for name in ("band", "rect", "fill"):
            for cls, row in v[name].items():
                self.assertTrue(all(isinstance(x, (int, type(None))) for x in row.values()), name + "." + cls)
        for key in ("zone", "anchorShare", "artLabel"):
            self.assertNotIn("note", v[key], key + ": a note is written _note")

    def test_v1_options_are_named_the_way_the_measure_reads_them(self) -> None:
        v = self.visual
        self.assertEqual(sorted(v["grid"]), ["cols", "occ", "rows"])
        self.assertEqual(sorted(v["halo"]), ["ink", "owner", "text"])
        self.assertEqual(sorted(v["owner"]), ["big", "bigShare", "border", "fill", "fixBelow", "min"])
        opts = {"grid": v["grid"], "halo": v["halo"], "owner": v["owner"], "occ": v["grid"]["occ"], "canvasH": v["zone"]["canvasH"]}
        self.assertEqual(space._cfg(opts), space._cfg(None), "the starting values are the measure's defaults")
        self.assertEqual(v["zone"]["padEnd"]["poster"], space.PAD["poster"])
        self.assertEqual(v["zone"]["padEnd"]["heritage"], space.PAD["heritage"])

    def test_thresholds_reproduce_the_verdicts_of_appendix_b(self) -> None:
        v = self.visual
        opts = {"grid": v["grid"], "halo": v["halo"], "owner": v["owner"], "occ": v["grid"]["occ"], "canvasH": v["zone"]["canvasH"]}
        cases = {c["name"]: c for c in read_json(CASES / "appendix-b.json")["cases"]}
        rows = read_json(CASES / "verdicts.json")["rows"]
        self.assertEqual(len(rows), 25)
        results = []
        for row in rows:
            c = cases[row["name"]]
            r = space.dead_space(c["boxes"], c["zone"], opts)
            cls = row.get("class", "working")
            fix = sum(1 for k in ("band", "rect", "fill") if r[k] >= v[k][cls]["fix"])
            note = sum(1 for k in ("band", "rect", "fill") if v[k][cls]["note"] <= r[k] < v[k][cls]["fix"])
            self.assertEqual((fix, note), (row["fix"], row["note"]), row["name"])
            results.append((row["name"], fix, note))
        # run twice, compare
        again = []
        for row in rows:
            c = cases[row["name"]]
            r = space.dead_space(c["boxes"], c["zone"], opts)
            cls = row.get("class", "working")
            again.append((row["name"], sum(1 for k in ("band", "rect", "fill") if r[k] >= v[k][cls]["fix"]),
                          sum(1 for k in ("band", "rect", "fill") if v[k][cls]["note"] <= r[k] < v[k][cls]["fix"])))
        self.assertEqual(results, again)
        by = {n: (f, nt) for n, f, nt in results}
        for name in ("A.1 notebook step (mock:notes)", "A.2 swiss stat (field, numeral 290, waffle 316)", "A.3 interface before/after (two panels)"):
            self.assertEqual(by[name], (0, 0), "a worked slide passes: " + name)
        self.assertEqual(by["today creator item (text + 144 px empty frame)"], (3, 0), "the old empty frame fails every metric")
        for name in ("cheat: empty card 852x344", "cheat: drenched ground (owner 100% of zone), text only", "cheat: three 80 px marks scattered",
                     "cheat: bold-dots wall over dead area, no content on it"):
            self.assertEqual(by[name][0], 3, name)
        lone = by["cheat: lone 300 px icon on a 852x344 panel"]
        self.assertGreaterEqual(lone[0] + lone[1], 2, "the lone icon on a panel fails")
        owner = space.dead_space(cases["cheat: lone 300 px icon on a 852x344 panel"]["boxes"], {"w": 852, "h": 888}, opts)["owners"][0]
        self.assertFalse(owner["ok"])
        self.assertLess(owner["cols"], v["owner"]["fixBelow"])   # the columns share is the smaller one and is below the FIX bar of D9.container-fill

    def test_art_label_floors_and_roles(self) -> None:
        a = self.visual["artLabel"]
        self.assertEqual({k: a[k] for k in ("arabic", "latin", "digits", "chart", "tool", "numeral", "word")},
                         {"arabic": 36, "latin": 34, "digits": 34, "chart": 38, "tool": 30, "numeral": 200, "word": 220})
        self.assertEqual(sorted(a["roles"]), ["body", "chart", "chip", "numeral", "small", "title", "tool", "word"], "the role list of IS-3 v2")
        for role, key in a["roles"].items():
            self.assertTrue(key == "text" or key in a, role)
        stroke = self.visual["strokeFeed"]
        self.assertEqual((stroke["minFeedPx"], stroke["scale"], stroke["minFullPx"]), (1.4, 0.36, 4))
        self.assertLessEqual(abs(stroke["minFeedPx"] / stroke["scale"] - stroke["minFullPx"]), 0.2)

    def test_demo_and_word_limits(self) -> None:
        w = self.visual["words"]
        self.assertEqual(w["demo"], {"lines": 3, "lineWords": 12, "lineChars": 90, "captionWords": 8, "captionChars": 60, "duplicateShare": 50})
        self.assertEqual((w["bodyWithArt"], w["figureRepeatMax"]), (15, 2))
        self.assertEqual(w["art"], {"perSlide": 24, "chartLabel": 3, "rowText": 8, "cardTitle": 3, "cardText": 8, "bubble": 12})
        text = self.platform["plugin"]["text"]
        self.assertGreater(text["slideMaxWords"], w["bodyWithArt"])

    def test_smell_weights_sum_to_100(self) -> None:
        s = self.visual["smell"]
        self.assertEqual(sum(s["weights"].values()), 100)
        self.assertEqual((s["noteBelow"], s["showcaseMin"]), (55, 60))


class SliceVerdictGates(unittest.TestCase):
    """Round 3, wave 2b (DATA-TONES-LINT): the slice verdict showed four things nothing flagged: the same copy drawn twice, a demo that never reached the
    slide, an anchor planned but not drawn, and a deck of 16 base slides; and the anchor word echoing in the titles. The ids are fixed because QA-RENDERED
    (C2.text-dropped, C2.text-duplicated, VA9.anchor-unbuilt) and QA-SPEC (D8.tone-flat, C2.word-echo) implement them from these entries."""

    def setUp(self) -> None:
        self.doc, self.platform = load()
        self.checks = checks_of(self.doc)
        self.visual = self.platform["plugin"]["visual"]

    def test_the_rendered_pair_and_the_unbuilt_anchor_are_js_only_and_never_overridable(self) -> None:
        for cid, sev, scope in (("C2.text-dropped", "BLOCK", "rendered"), ("C2.text-duplicated", "BLOCK", "rendered"), ("VA9.anchor-unbuilt", "FIX", "rendered")):
            g, c = self.checks[cid]
            self.assertEqual((c["sev"], scope_of(g, c), engines_of(g, c)), (sev, scope, ["js"]), cid)
            self.assertNotIn("deferred", c, cid + ": the Python engine cannot render, so there is nothing to defer")
            self.assertNotIn("overridable", c, cid)
            self.assertIsNone(c["autofix"], cid)
        self.assertEqual(self.checks["C2.text-dropped"][0]["id"], "C2")
        self.assertEqual(self.checks["VA9.anchor-unbuilt"][0]["id"], "VA9")
        self.assertIn("not overridable", self.checks["C2.text-dropped"][1]["when"])

    def test_the_spec_pair_waits_for_the_python_engine_like_its_neighbours(self) -> None:
        for cid, sev in (("D8.tone-flat", "FIX"), ("C2.word-echo", "NOTE")):
            g, c = self.checks[cid]
            self.assertEqual((c["sev"], scope_of(g, c), engines_of(g, c), c["deferred"]), (sev, "spec", ["py", "js"], {"engines": ["py"], "by": "Q6"}), cid)
        self.assertEqual(self.checks["D8.tone-flat"][1]["sevs"], ["NOTE", "FIX"])
        self.assertEqual(self.checks["C2.word-echo"][1]["sevs"] if "sevs" in self.checks["C2.word-echo"][1] else ["NOTE"], ["NOTE"])

    def test_the_rollout_caps_the_two_new_fix_checks_and_the_platform_says_so(self) -> None:
        for cid in ("VA9.anchor-unbuilt", "D8.tone-flat"):
            self.assertEqual(self.checks[cid][1]["params"]["rollout"], {"$platform": "plugin.visual.rollout"}, cid)
        self.assertNotIn("rollout", self.checks["C2.word-echo"][1]["params"], "a NOTE is not capped")
        for cid in ("C2.text-dropped", "C2.text-duplicated"):
            self.assertNotIn("rollout", self.checks[cid][1]["params"], cid + ": a render that lost or doubled copy is never a prospect")
        stage0 = self.visual["rollout"]["stages"]["0"]
        for name in ("VA9", "D8.tone-flat"):
            self.assertIn(name, stage0, name)

    def test_the_limits_live_in_the_platform_and_the_rules_read_them(self) -> None:
        self.assertEqual(self.visual["tones"], {"minInner": 6, "min": 2})
        self.assertEqual(self.visual["wordEcho"], {"max": 3})
        flat, echo = self.checks["D8.tone-flat"][1]["params"], self.checks["C2.word-echo"][1]["params"]
        self.assertEqual(flat["minInner"], {"$platform": "plugin.visual.tones.minInner"})
        self.assertEqual(flat["min"], {"$platform": "plugin.visual.tones.min"})
        self.assertEqual(echo["max"], {"$platform": "plugin.visual.wordEcho.max"})
        changed = copy.deepcopy(self.platform)
        changed["plugin"]["visual"]["tones"].update({"minInner": 8, "min": 3})
        changed["plugin"]["visual"]["wordEcho"]["max"] = 4
        before = checks_of(rules._resolve_refs(copy.deepcopy(self.doc), self.platform))
        after = checks_of(rules._resolve_refs(copy.deepcopy(self.doc), changed))
        self.assertEqual([before["D8.tone-flat"][1]["params"][k] for k in ("minInner", "min")], [6, 2])
        self.assertEqual([after["D8.tone-flat"][1]["params"][k] for k in ("minInner", "min")], [8, 3])
        self.assertEqual((before["C2.word-echo"][1]["params"]["max"], after["C2.word-echo"][1]["params"]["max"]), (3, 4))
        # the engines read the entry's `when`, so it must name the params it uses
        for cid, names in (("D8.tone-flat", ("params.minInner", "params.min")), ("C2.word-echo", ("params.max",))):
            for name in names:
                self.assertIn(name, self.checks[cid][1]["when"], cid)

    def test_the_vars_are_what_the_engines_fill(self) -> None:
        want = {"C2.text-dropped": ["el"], "C2.text-duplicated": ["el"], "VA9.anchor-unbuilt": ["kind"], "D8.tone-flat": ["count", "min"], "C2.word-echo": ["word"]}
        for cid, names in want.items():
            self.assertEqual(self.checks[cid][1]["vars"], names, cid)

    def test_the_new_gate_sits_after_va8_and_is_defined_once(self) -> None:
        order = self.doc["order"]
        self.assertEqual(order.index("VA9"), order.index("VA8") + 1)
        self.assertEqual(sum(1 for g in self.doc["gates"] if g["id"] == "VA9"), 1)
        self.assertEqual([c["id"] for g in self.doc["gates"] if g["id"] == "VA9" for c in g["checks"]], ["VA9.anchor-unbuilt"])
        self.assertEqual([c["id"] for g in self.doc["gates"] if g["id"] == "C2" for c in g["checks"]][-3:], ["C2.text-dropped", "C2.text-duplicated", "C2.word-echo"])
        self.assertEqual([c["id"] for g in self.doc["gates"] if g["id"] == "D8" for c in g["checks"]], ["D8.rhythm", "D8.anchor-run", "D8.tone-run", "D8.tone-flat"])

    def test_a_report_may_carry_the_new_ids(self) -> None:
        # the qa-report schema admits a gate id of the form VA9 and a rule id of the form C2.text-dropped
        schema = read_json(SK / "schemas" / "qa-report.schema.json")["$defs"]
        gate, rule = re.compile(schema["gateId"]["pattern"]), re.compile(schema["ruleId"]["pattern"])
        for cid in ("C2.text-dropped", "C2.text-duplicated", "C2.word-echo", "D8.tone-flat", "VA9.anchor-unbuilt"):
            self.assertTrue(rule.match(cid), cid)
            self.assertTrue(gate.match(cid.split(".")[0]), cid)


class Agreement(unittest.TestCase):
    """The numbers that live in two files (qa rules read platform-instagram.json; the planner reads art-direction.json) must say the same thing."""

    def setUp(self) -> None:
        self.doc, self.platform = load()
        self.checks = checks_of(self.doc)
        self.visual = self.platform["plugin"]["visual"]
        self.art = read_json(SK / "data" / "art-direction.json")

    def test_anchor_share_equals_the_planner_table(self) -> None:
        table = self.art["anchorTable"]["types"]
        mine = self.visual["anchorShare"]["types"]
        with_share = {t for t, row in table.items() if row.get("min") is not None}
        self.assertEqual(set(mine), with_share)
        for t in with_share:
            self.assertEqual((mine[t]["min"], mine[t]["target"]), (table[t]["min"], table[t]["target"]), t)
        self.assertEqual(self.visual["anchorShare"]["compareSideCanvas"], table["compare"]["sideCanvasPct"])
        self.assertTrue(table["cover"]["canvas"] and table["poster"]["canvas"])

    def test_classes_cover_every_type_once(self) -> None:
        classes = {k: v for k, v in self.visual["classes"].items() if isinstance(v, list)}
        flat = [t for v in classes.values() for t in v]
        self.assertEqual(len(flat), len(set(flat)))
        self.assertEqual(set(flat), set(self.art["roles"]["types"]))
        h8 = self.art["rhythm"]["hard"]["H8"]
        self.assertEqual(classes["peak"], h8["types"])
        self.assertEqual(self.visual["anchorShare"]["peakMin"], h8["minShare"])
        self.assertEqual(classes["cover"], ["cover", "poster"])
        for t in classes["peak"]:
            self.assertGreaterEqual(self.visual["anchorShare"]["types"][t]["min"], h8["minShare"], t)

    def test_rhythm_constants_equal_the_planner_rules(self) -> None:
        hard = self.art["rhythm"]["hard"]
        resolved = checks_of(rules._resolve_refs(copy.deepcopy(self.doc), self.platform))
        p = lambda cid: resolved[cid][1]["params"]   # noqa: E731
        self.assertEqual(p("VA5.variety")["kindRun"], hard["H1"]["maxRunKind"] + 1)
        self.assertEqual((p("VA5.variety")["minKinds"], p("VA5.variety")["minInner"]), (hard["H4"]["minKinds"], hard["H4"]["minInner"]))
        self.assertEqual(p("VA5.variety")["iconUses"], hard["H3"]["maxUses"])
        self.assertEqual(p("D8.anchor-run")["run"], hard["H2"]["maxRunKey"] + 1)
        self.assertEqual(p("D8.anchor-run")["altWindow"], hard["H2"]["altWindow"])
        self.assertEqual((p("VA6.pause")["per"], p("VA6.pause")["adjacent"], p("VA6.pause")["beforeCta"]), (hard["H5"]["per"], hard["H5"]["adjacent"], hard["H5"]["beforeCta"]))
        self.assertEqual(p("D8.tone-run")["maxRun"], hard["H6"]["maxRunNonBase"])
        self.assertEqual(p("D8.tone-run")["toneBias"], self.art["tones"]["toneBias"])

    def test_slide_words_budget_is_the_existing_one(self) -> None:
        self.assertEqual(self.platform["plugin"]["text"]["slideMaxWords"], 50)
        self.assertEqual(self.platform["plugin"]["text"]["denseMaxWords"], 45)
        resolved = checks_of(rules._resolve_refs(copy.deepcopy(self.doc), self.platform))
        self.assertEqual(resolved["C2.body-with-art"][1]["params"]["slideMax"], 50)
        self.assertEqual(resolved["C2.body-with-art"][1]["params"]["bodyMax"], 15)
        self.assertEqual(resolved["C2.dense-words"][1]["params"]["max"], 45)


class InnerGeometry(unittest.TestCase):
    def test_s1_inner_footer(self) -> None:
        _, platform = load()
        g = platform["geometry"]
        inner = g["inner"]
        foot, base = inner["bands"]["footer"], g["bands"]["footer"]
        self.assertEqual((foot["x"], foot["y"], foot["w"], foot["h"]), (174, 1275, 732, 80))
        self.assertEqual(foot["x"] - base["x"], inner["footerPadX"])
        self.assertEqual((base["x"] + base["w"]) - (foot["x"] + foot["w"]), inner["footerPadX"])
        self.assertEqual(foot["y"] - base["y"], 110)
        self.assertEqual((foot["itemMaxHeightPx"], foot["itemsAlign"], foot["holds"]), (base["itemMaxHeightPx"], base["itemsAlign"], base["holds"]))
        self.assertEqual(foot["y"] + foot["itemMaxHeightPx"], 1324)
        self.assertEqual(platform["canvases"]["ig-3x4"]["h"], 1440)
        self.assertEqual(1440 - (foot["y"] + foot["h"]), 85)
        body, outer = inner["bodyArea"], g["bodyArea"]
        self.assertEqual((body["x"], body["y"], body["w"]), (outer["x"], outer["y"], outer["w"]))
        self.assertEqual(body["h"], outer["h"] + 110)
        self.assertEqual(body["y"] + body["h"], 1259)
        self.assertEqual(foot["y"] - (body["y"] + body["h"]), 16, "the same 16 px gap as the default body area")
        self.assertEqual(outer["y"] + outer["h"] + 16, base["y"], "the default body area ends 16 px above the default footer")
        # the header, the content box and the safe box do not move; the band stays clear of every keep-out and inside the safe box
        self.assertNotIn("contentBox", inner)
        self.assertNotIn("header", inner["bands"])
        for k in g["keepOuts"]:
            overlap = foot["x"] < k["x"] + k["w"] and k["x"] < foot["x"] + foot["w"] and foot["y"] < k["y"] + k["h"] and k["y"] < foot["y"] + foot["h"]
            self.assertFalse(overlap, k["id"])
        safe = g["safeBox"]
        self.assertTrue(safe["x"] <= foot["x"] and foot["x"] + foot["w"] <= safe["x"] + safe["w"] and foot["y"] + foot["h"] <= safe["y"] + safe["h"])
        # the crop to 4:5 (y 45 to 1395) still holds the whole band
        crop = g["crop4x5"]
        self.assertLessEqual(foot["y"] + foot["h"], crop["y"] + crop["h"])
        self.assertEqual(platform["dataVersion"], "1.1.0")


def numeric_leaves(node, path=()):
    """Every int or float (a bool is not a number here) of a params tree that is not behind a $platform reference, as (path, value)."""
    out = []
    if isinstance(node, dict):
        if set(node) == {"$platform"}:
            return out
        for key, value in node.items():
            out += numeric_leaves(value, path + (key,))
    elif isinstance(node, list):
        for i, value in enumerate(node):
            out += numeric_leaves(value, path + (i,))
    elif isinstance(node, (int, float)) and not isinstance(node, bool):
        out.append((path, node))
    return out


def platform_leaves(node, path=()):
    """The dotted paths of the leaves of a platform subtree (a list is a leaf, a key that starts with an underscore is a note)."""
    if isinstance(node, dict):
        out = []
        for key, value in node.items():
            if not key.startswith("_"):
                out += platform_leaves(value, path + (key,))
        return out
    return [".".join(path)]


class NoInlineThresholds(unittest.TestCase):
    """Spec 7 and IS-8: every threshold is a key under plugin.visual and a rule reads it with $platform. A number written in the rule cannot follow a change of
    platform policy (D10.nesting kept its depth of 2 whatever the platform said), so none of the new checks may carry one."""

    def setUp(self) -> None:
        self.doc, self.platform = load()
        self.checks = checks_of(self.doc)
        self.visual = self.platform["plugin"]["visual"]
        self.ids = [c["id"] for g in self.doc["gates"] if g["id"] in NEW_GATE_IDS for c in g["checks"]] + list(NEW_CHECK_IDS)

    def test_no_new_check_writes_a_number_inline(self) -> None:
        self.assertGreaterEqual(len(self.ids), 35)
        for cid in self.ids:
            inline = [(path, value) for path, value in numeric_leaves(self.checks[cid][1].get("params")) if (cid, path[0]) not in INLINE_NUMBERS_ALLOWED]
            self.assertEqual(inline, [], cid + ": move the number to plugin.visual and read it with $platform")
        # the one allowed exception is a vocabulary of code points
        glyphs = self.checks["D10.glyph-icon"][1]["params"]["glyphs"]
        self.assertTrue(glyphs and all(isinstance(c, int) and c > 255 for c in glyphs))

    def test_the_cited_limits_follow_the_platform(self) -> None:
        # the cases of the review: run limit, tone bias, nesting depth, pause limit
        raw = {cid: self.checks[cid][1]["params"] for cid in ("D8.anchor-run", "D8.tone-run", "D10.nesting", "VA6.pause")}
        self.assertEqual(raw["D8.anchor-run"]["run"], {"$platform": "plugin.visual.rhythm.anchorRun.run"})
        self.assertEqual(raw["D8.tone-run"]["toneBias"], {"$platform": "plugin.visual.rhythm.toneRun.toneBias"})
        self.assertEqual(raw["D10.nesting"]["maxDepth"], {"$platform": "plugin.visual.craft.nesting.maxDepth"})
        self.assertEqual(raw["VA6.pause"]["per"], {"$platform": "plugin.visual.rhythm.pause.per"})
        changed = copy.deepcopy(self.platform)
        v = changed["plugin"]["visual"]
        v["craft"]["nesting"]["maxDepth"] = 3
        v["rhythm"]["anchorRun"]["run"] = 4
        v["rhythm"]["toneRun"]["toneBias"]["calm"] = 25
        v["rhythm"]["pause"]["per"] = 6
        v["continuity"]["chromeDrift"]["maxPx"] = 3
        v["plan"]["valid"]["chartValues"]["donut"] = [1, 4]
        before = checks_of(rules._resolve_refs(copy.deepcopy(self.doc), self.platform))
        after = checks_of(rules._resolve_refs(copy.deepcopy(self.doc), changed))
        self.assertEqual((before["D10.nesting"][1]["params"]["maxDepth"], after["D10.nesting"][1]["params"]["maxDepth"]), (2, 3))
        self.assertEqual((before["D8.anchor-run"][1]["params"]["run"], after["D8.anchor-run"][1]["params"]["run"]), (3, 4))
        self.assertEqual((before["D8.tone-run"][1]["params"]["toneBias"]["calm"], after["D8.tone-run"][1]["params"]["toneBias"]["calm"]), (20, 25))
        self.assertEqual((before["VA6.pause"][1]["params"]["per"], after["VA6.pause"][1]["params"]["per"]), (5, 6))
        self.assertEqual((before["D2.chrome-drift"][1]["params"]["maxPx"], after["D2.chrome-drift"][1]["params"]["maxPx"]), (2, 3))
        self.assertEqual(after["VA3.valid"][1]["params"]["chartValues"]["donut"], [1, 4])

    def test_every_number_of_the_groups_reaches_a_rule_param_through_a_reference(self) -> None:
        bumped = copy.deepcopy(self.platform)

        def bump(node):
            for key, value in (node.items() if isinstance(node, dict) else enumerate(node)):
                if isinstance(value, (int, float)) and not isinstance(value, bool):
                    node[key] = value + 1000
                elif isinstance(value, (dict, list)):
                    bump(value)
        for group in POLICY_GROUPS:
            bump(bumped["plugin"]["visual"][group])
        after = checks_of(rules._resolve_refs(copy.deepcopy(self.doc), bumped))
        reached = set()
        for cid in self.ids:
            raw, now = self.checks[cid][1].get("params"), after[cid][1].get("params")
            if not isinstance(raw, dict):
                continue
            for key, value in raw.items():
                if isinstance(value, dict) and set(value) == {"$platform"} and value["$platform"].split(".")[2] in POLICY_GROUPS:
                    reached.add(value["$platform"])
                    flat = numeric_leaves(now[key])
                    self.assertTrue(flat and all(n >= 1000 for _, n in flat), cid + "." + key + " does not follow " + value["$platform"])
        self.assertGreaterEqual(len(reached), 40)

    def test_every_number_of_the_groups_is_read_by_a_rule(self) -> None:
        refs = refs_of(self.doc)
        for group in POLICY_GROUPS:
            leaves = platform_leaves(self.visual[group], ("plugin", "visual", group))
            self.assertGreater(len(leaves), 4, group)
            for leaf in leaves:
                self.assertTrue(any(leaf == r or leaf.startswith(r + ".") for r in refs), leaf + " is read by no rule")

    def test_a_rule_param_carries_the_name_of_its_platform_key(self) -> None:
        for cid in self.ids:
            params = self.checks[cid][1].get("params")
            if not isinstance(params, dict):
                continue
            for key, value in params.items():
                if isinstance(value, dict) and set(value) == {"$platform"}:
                    parts = value["$platform"].split(".")
                    if parts[:2] == ["plugin", "visual"] and parts[2] in POLICY_GROUPS:
                        self.assertEqual(parts[-1], key, cid + "." + key + " -> " + value["$platform"])
                        self.assertEqual(len(parts), 5, cid + "." + key + ": group.check.key")

    def test_the_group_objects_are_one_per_check(self) -> None:
        groups = {g: {k for k in self.visual[g] if not k.startswith("_")} for g in POLICY_GROUPS}
        self.assertEqual(groups["rhythm"], {"anchorRun", "toneRun", "anchorPresent", "variety", "relaxed", "pause"})
        self.assertEqual(groups["plan"], {"valid", "chartHonesty", "agreement", "distance"})
        self.assertEqual(groups["craft"], {"nesting", "iconTileStack", "sideBorder", "iconSystem", "squint"})
        self.assertEqual(groups["continuity"], {"tokens", "threadDrift", "seam", "chromeDrift"})
        for group in POLICY_GROUPS:
            self.assertIsInstance(self.visual[group]["_note"], str, group)
        self.assertEqual(self.visual["continuity"]["tokens"]["of"], len(self.checks["D11.tokens"][1]["params"]["tokens"]), "D11.tokens: 'of' counts the tokens")
        icon_sizes = self.visual["craft"]["iconSystem"]["sizes"]
        self.assertEqual(icon_sizes, sorted(set(icon_sizes)))

    def test_the_old_values_survived_the_move(self) -> None:
        # the starting values the rules carried inline, unchanged: a move of place, not of policy
        v = self.visual
        self.assertEqual({k: x for k, x in v["rhythm"].items() if k != "_note"}, {
            "anchorRun": {"run": 3, "altWindow": 6}, "toneRun": {"maxRun": 2, "toneBias": {"calm": 20, "balanced": 40, "drenched": 50}},
            "anchorPresent": {"runMin": 3}, "variety": {"kindRun": 3, "minKinds": 3, "minInner": 6, "iconUses": 1}, "relaxed": {"max": 0},
            "pause": {"per": 5, "max": 1, "adjacent": 0, "beforeCta": 0, "statementWords": 12}})
        self.assertEqual(v["craft"]["squint"], {"mergePx": 24, "anchorOverlapPct": 60, "thirdMaxPct": 60, "weights": {"text": 35, "anchor": 50},
                                                "pixel": {"cols": 54, "rows": 72, "minDeltaL": 18}})
        self.assertEqual((v["craft"]["nesting"], v["craft"]["iconTileStack"], v["craft"]["sideBorder"]),
                         ({"maxDepth": 2}, {"minSiblings": 3}, {"minPx": 4}))
        valid = v["plan"]["valid"]
        self.assertEqual(valid["chartValues"]["bars-h"], [1, 7])
        self.assertEqual((valid["itemsMax"], valid["rowIconsMax"], valid["donutMinGapPct"], valid["pictogramMaxIcons"]), (6, 8, 5, 10))
        self.assertEqual((v["plan"]["chartHonesty"], v["plan"]["agreement"], v["plan"]["distance"]), ({"tagMinPx": 34}, {"topN": 5}, {"kindShare": 60, "recipeShare": 50}))
        self.assertEqual(v["continuity"]["tokens"], {"minShared": 3, "of": 4})
        self.assertEqual((v["continuity"]["threadDrift"], v["continuity"]["seam"], v["continuity"]["chromeDrift"]), ({"maxPx": 2}, {"tolerancePx": 2}, {"maxPx": 2}))


# ---- D2.chrome-drift under S-1: a reference of the rule's formula, with the vectors an engine must reproduce ------------------------------------------------

def band_of(p, slot, slide_type):
    """The band a chrome element is measured against on its own slide (S-1): the header band, the cover band, or the inner band."""
    if slot.lower() in [h.lower() for h in p["header"]["holds"]]:
        return p["header"]
    return p["footer"] if slide_type in p["coverTypes"] else p["innerFooter"]


def anchors(rect, band):
    """The three anchors of each axis. With a band they are offsets from the band's start edge, end edge and centre; without one, the canvas position."""
    x, y, w, h = rect
    if band is None:
        return (x, x + w, x + w / 2), (y, y + h, y + h / 2)
    return ((x - band["x"], (band["x"] + band["w"]) - (x + w), (x + w / 2) - (band["x"] + band["w"] / 2)),
            (y - band["y"], (band["y"] + band["h"]) - (y + h), (y + h / 2) - (band["y"] + band["h"] / 2)))


def chrome_drift(slides, p, relative=True):
    """The slots on which D2.chrome-drift fires. Per slot and axis, the spread of each anchor over the slides; the axis drifts when all three anchors spread by
    more than maxPx (a wider text moves one edge only), the slot when either axis drifts. relative=False is the formula before S-1 (canvas positions)."""
    fired = []
    for slot in sorted({s for slide in slides for s in slide["chrome"]}):
        rows = [(slide["type"], slide["chrome"][slot]) for slide in slides if slot in slide["chrome"]]
        if len(rows) < 2:
            continue
        per_axis = []
        for axis in (0, 1):
            columns = [anchors(rect, band_of(p, slot, kind) if relative else None)[axis] for kind, rect in rows]
            per_axis.append(min(max(c[a] for c in columns) - min(c[a] for c in columns) for a in range(3)))
        if max(per_axis) > p["maxPx"]:
            fired.append(slot)
    return fired


CHROME_ITEMS = {"handle": ("start", 300, 50), "meta": ("end", 220, 50), "counter": ("start", 120, 49), "savePill": ("center", 260, 49), "swipe": ("end", 150, 49)}


def chrome_deck(p, types, band_type=None):
    """A deck whose chrome sits at the same place inside the band of every slide; band_type puts one slide's chrome in the band of another type."""
    slides = []
    for i, kind in enumerate(types):
        chrome = {}
        for slot, (where, w, h) in CHROME_ITEMS.items():
            band = band_of(p, slot, (band_type or {}).get(i, kind))
            x = band["x"] if where == "start" else band["x"] + band["w"] - w if where == "end" else band["x"] + (band["w"] - w) / 2
            chrome[slot] = (x, band["y"], w, h)
        slides.append({"type": kind, "chrome": chrome})
    return slides


def moved(slides, index, slot, dx=0, dy=0, dw=0):
    out = copy.deepcopy(slides)
    x, y, w, h = out[index]["chrome"][slot]
    out[index]["chrome"][slot] = (x + dx, y + dy, w + dw, h)
    return out


class ChromeDriftInsideItsBand(unittest.TestCase):
    """S-1 moves the footer of every slide that is not a cover or poster to y 1275 and insets it by 60 px, while the cover keeps y 1165. The first form of
    D2.chrome-drift compared canvas positions, so a deck built exactly to platform-instagram.json drifted by 110 px. The rule now compares each element's
    offset inside the band of its own slide. The vectors below are the contract of the engine change (Q2): the same inputs must give the same slots."""

    TYPES = ["cover", "item", "step", "stat", "cta"]

    def setUp(self) -> None:
        self.doc, self.platform = load()
        resolved = checks_of(rules._resolve_refs(copy.deepcopy(self.doc), self.platform))
        self.p = resolved["D2.chrome-drift"][1]["params"]
        self.deck = chrome_deck(self.p, self.TYPES)

    def raw_check(self, cid: str = "D2.chrome-drift") -> dict:
        return checks_of(self.doc)[cid][1]

    def test_params_carry_the_bands_of_s1(self) -> None:
        g = self.platform["geometry"]
        self.assertEqual(self.p["header"], g["bands"]["header"])
        self.assertEqual(self.p["footer"], g["bands"]["footer"])
        self.assertEqual(self.p["innerFooter"], g["inner"]["bands"]["footer"])
        self.assertEqual(self.p["coverTypes"], self.platform["plugin"]["visual"]["classes"]["cover"])
        self.assertEqual(self.p["maxPx"], self.platform["plugin"]["visual"]["continuity"]["chromeDrift"]["maxPx"])
        when = self.raw_check()["when"]
        for name in ("params.maxPx", "params.header", "params.footer", "params.innerFooter", "params.coverTypes"):
            self.assertIn(name, when)
        self.assertIn("relative to the band", when)
        self.assertEqual(self.raw_check("D2.chrome-band")["params"]["coverTypes"], {"$platform": "plugin.visual.classes.cover"})
        self.assertIn("params.coverTypes", self.raw_check("D2.chrome-band")["when"])

    def test_a_deck_built_to_the_geometry_has_no_drift(self) -> None:
        cover, inner = self.deck[0]["chrome"], self.deck[1]["chrome"]
        self.assertEqual((cover["counter"][1], inner["counter"][1]), (1165, 1275))
        self.assertEqual(inner["counter"][0] - cover["counter"][0], self.platform["geometry"]["inner"]["footerPadX"])
        self.assertEqual(chrome_drift(self.deck, self.p), [])

    def test_the_formula_before_s1_fires_on_the_same_deck(self) -> None:
        # the regression this rule revision removes: canvas positions, the footer 110 px lower on the inner slides
        self.assertEqual(chrome_drift(self.deck, self.p, relative=False), ["counter", "savePill", "swipe"])

    def test_unintended_movement_still_fires(self) -> None:
        self.assertEqual(chrome_drift(moved(self.deck, 4, "counter", dy=6), self.p), ["counter"], "the counter 6 px low on the CTA slide")
        self.assertEqual(chrome_drift(moved(self.deck, 2, "savePill", dx=5), self.p), ["savePill"])
        self.assertEqual(chrome_drift(moved(self.deck, 1, "handle", dy=9), self.p), ["handle"], "header chrome: the band is the same on every slide")
        self.assertEqual(chrome_drift(moved(self.deck, 0, "swipe", dx=-4), self.p), ["swipe"], "a cover whose chrome is off its band against the inner slides")

    def test_a_footer_left_in_the_wrong_band_fires(self) -> None:
        stale = chrome_deck(self.p, self.TYPES, band_type={2: "cover"})
        self.assertEqual(stale[2]["chrome"]["counter"][1], 1165)
        self.assertEqual(chrome_drift(stale, self.p), ["counter", "savePill", "swipe"], "an inner slide that kept the cover band")
        early = chrome_deck(self.p, self.TYPES, band_type={0: "item"})
        self.assertEqual(chrome_drift(early, self.p), ["counter", "savePill", "swipe"], "a cover that took the inner band")

    def test_the_tolerance_is_maxpx_and_a_wider_text_is_not_drift(self) -> None:
        self.assertEqual(chrome_drift(moved(self.deck, 3, "counter", dy=self.p["maxPx"]), self.p), [])
        self.assertEqual(chrome_drift(moved(self.deck, 3, "counter", dy=self.p["maxPx"] + 1), self.p), ["counter"])
        self.assertEqual(chrome_drift(moved(self.deck, 3, "counter", dw=48), self.p), [], "one edge moves; the start edge and the vertical anchors do not")
        self.assertEqual(chrome_drift(moved(self.deck, 3, "savePill", dw=40, dx=-20), self.p), [], "centred text grows both ways")

    def test_posters_and_single_slides(self) -> None:
        deck = chrome_deck(self.p, ["poster", "cover", "item"])
        self.assertEqual(deck[0]["chrome"]["counter"][1], 1165)
        self.assertEqual(chrome_drift(deck, self.p), [])
        self.assertEqual(chrome_drift(deck[:1], self.p), [], "one slide cannot drift")


class Budget(unittest.TestCase):
    def test_sizes(self) -> None:
        self.assertLessEqual((SK / "data" / "qa-rules.json").stat().st_size, 167_000, "qa-rules.json: 134 KB -> about 162 KB, +5.0 KB in wave 2b for the gate VA9 and four checks (r3b-1)")
        self.assertLess((SK / "data" / "platform-instagram.json").stat().st_size, 256 * 1024)

    def test_the_bundle_loads_twice_the_same(self) -> None:
        first = rules.load_bundle(refresh=True)
        a = json.dumps(first["qaRules"], sort_keys=True, ensure_ascii=False)
        second = rules.load_bundle(refresh=True)
        self.assertEqual(a, json.dumps(second["qaRules"], sort_keys=True, ensure_ascii=False))
        idx = rules.index()
        self.assertIn("D9.band", idx["checks"])
        self.assertNotIn("D9.dead-zone", idx["checks"])
        self.assertEqual(idx["order"], [g["id"] for g in first["qaRules"]["gates"]])
        self.assertEqual(rules.check("VA2.anchor-size")["gate"], "VA2")

    def test_the_credit_needles_are_not_in_the_visual_rules(self) -> None:
        raw = (SK / "data" / "qa-rules.json").read_text(encoding="utf-8").lower()
        for cp in ([1605, 1581, 1605, 1583], [109, 111, 104, 97, 109, 101, 100], [97, 98, 100, 111, 117]):
            self.assertNotIn("".join(chr(c) for c in cp), raw)


if __name__ == "__main__":
    unittest.main()
