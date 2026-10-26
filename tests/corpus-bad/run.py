#!/usr/bin/env python3
"""tests/corpus-bad/run.py: the Python half of the defect and clean corpora (see run.mjs for the JavaScript half; round 3 package Q7a).

    python tests/corpus-bad/run.py [--only ID] [--baseline] [--list]

corpus-bad/defects.json: every expected finding must be reported by the text gates of ``_cs`` (100% recall).
corpus-bad/rendered.json: the eight planted visual defects. The ids, scopes and primary findings are compared with the FIXED lists below (a literal copy of
    fixed.mjs, which is checked against this file), not with the lists of the JSON file, so a case cannot disappear by being deleted from the JSON. Every case
    must resolve (deck, slide, patched spec valid against spec.schema.json, every expected rule a real check of qa-rules.json). A planted finding is looked for here when ``_cs`` implements its
    check; a check that only JavaScript implements (rendered gates, and the spec gates whose Python twin is Q6's: qa-rules.json marks them
    ``deferred`` for py) is JavaScript's to find, and the number skipped is printed. When Q6 removes the flag the case joins this run unchanged.
corpus-clean/posts.json: no BLOCK may be reported for any post (zero false BLOCKs); lesser findings are counted.
corpus-clean/slice.json: four clean slice decks (a fixed list, with the families their fonts resolve to): valid specs, no BLOCK and no FIX; every gate of
    ``requireExecuted`` (at least the fixed gates) that Python implements must have run.
Exit code 0 = pass, 1 = a defect was missed, a clean post or deck was flagged, a gate never ran.
"""
import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SKILL = ROOT / "plugins" / "carousel-studio" / "skills" / "carousel-design"
sys.path.insert(0, str(SKILL / "scripts"))

from _cs import patch, paths, qa, schema  # noqa: E402

paths.ensure_utf8_stdio()


def read_json(p):
    return json.loads(Path(p).read_text(encoding="utf-8-sig"))


def fixture(name):
    """A bare name is a file of tests/fixtures; a path with a slash is relative to the repository root; ``#n`` picks element n of an array file."""
    name, _, index = name.partition("#")
    doc = read_json(ROOT / name if "/" in name else ROOT / "tests" / "fixtures" / name)
    return doc if not index else doc[int(index)]


EXECUTED: dict = {}   # gate id -> times it ran over every text run of this script

# ---- what the corpora MUST contain: a literal copy of tests/corpus-bad/fixed.mjs (drift between the two files fails the run) -------------------------
FIXED_CASES = {
    "R1.empty-card": ("rendered", "D9.container-fill", "FIX"),
    "R2.lone-icon-panel": ("rendered", "D9.container-fill", "FIX"),
    "R3.nested-frames": ("rendered", "D10.nesting", "FIX"),
    "R4.icon-tile-stack": ("rendered", "D10.icon-tile-stack", "FIX"),
    "R5.six-row-list": ("spec", "VA3.valid", "FIX"),
    "R6.under-floor-label": ("rendered", "D10.art-label", "FIX"),
    "R7.chart-without-source": ("spec", "VA4.chart-honesty", "BLOCK"),
    "R8.one-sided-chat": ("rendered", "D9.rect", "FIX"),
}
FIXED_IDS = list(FIXED_CASES)
FIXED_DECKS = ["eg2-creator", "eg4-poster", "en1-creator", "en1-poster"]
FIXED_GATES = ["D9.band", "D9.rect", "D9.fill", "D9.container-fill", "VA1.anchor-present", "VA2.anchor-size", "VA3.valid", "VA4.chart-honesty", "VA6.pause",
               "VA7.agreement", "VA8.constraints", "D8.anchor-run", "D8.tone-run", "D10.nesting", "D10.icon-tile-stack", "D10.stroke-feed", "D10.art-label", "D10.glyph-icon",
               "C2.body-with-art", "C2.demo-words", "C2.demo-missing", "C2.demo-duplicate", "C2.figure-repeat"]
SEVS = ("BLOCK", "FIX", "NOTE")
ROLES = ("display", "heading", "body", "latin")
PRESETS = ("creator", "poster")


def run(spec, brand, case=None):
    case = case or {}
    history = {"history": case["history"]} if case.get("history") else None
    results = qa.run_text_gates(spec, brand, history=history, family_limits=case.get("familyLimits"), fast=bool(case.get("fast")))
    for gate, n in results.stats["gates"].items():
        EXECUTED[gate] = EXECUTED.get(gate, 0) + n
    return [r for r in results if not r.get("overridden")]


def findings(case):
    spec = patch.apply_patch(fixture(case["base"]), case.get("patch") or [])
    brand = patch.apply_patch(fixture(case["brand"]), case.get("brandPatch") or []) if case.get("brand") else None
    return run(spec, brand, case)


def label(r):
    return r["rule"] + ("@" + r["slide"] if r.get("slide") else "")


def engine_owner(rules: dict):
    """``owns(engine, rule)``: does this engine implement the check? qa-rules.json marks a check ``deferred`` for an engine until its twin exists
    (same rule as run_py.py of the conformance run). A rule id that is no check id follows its gate."""
    gate_of = {g["id"]: g for g in rules["gates"]}
    check_of = {c["id"]: (g, c) for g in rules["gates"] for c in g.get("checks", [])}

    def owns(engine: str, rule: str) -> bool:
        g, c = check_of.get(rule, (gate_of.get(rule.split(".")[0]), None))
        if not g:
            return False
        gone = ((c or {}).get("deferred") or {}).get("engines") or []
        return engine in [e for e in ((c or {}).get("engines") or g.get("engines") or []) if e not in gone]

    return owns, check_of


def slice_spec(deck, extra=()):
    return patch.apply_patch(fixture(deck["base"]), list(deck["patch"]) + list(extra))


def slice_brand(deck):
    return fixture(deck["brand"]) if deck.get("brand") else None


def fixed_drift() -> list:
    """Problems when this file's fixed lists are not the ones of fixed.mjs (the two are kept as literal copies of each other)."""
    src = (ROOT / "tests" / "corpus-bad" / "fixed.mjs").read_text(encoding="utf-8")

    def block(name):
        m = re.search(r"export const " + name + r" = \[(.*?)\];", src, re.S)
        return re.findall(r'"([^"]+)"', m.group(1)) if m else None

    out = []
    cases = {m[0]: (m[1], m[2], m[3]) for m in re.findall(r'"(R\d\.[a-z0-9-]+)": \{ scope: "(\w+)", rule: "([^"]+)", sev: "(\w+)" \}', src)}
    if cases != FIXED_CASES or list(cases) != FIXED_IDS:
        out.append("fixed.mjs and run.py hold different planted defects (FIXED_CASES)")
    if block("FIXED_DECKS") != FIXED_DECKS:
        out.append("fixed.mjs and run.py hold different clean slice decks (FIXED_DECKS)")
    if block("FIXED_GATES") != FIXED_GATES:
        out.append("fixed.mjs and run.py hold different required gates (FIXED_GATES)")
    return out


def expected_fonts(deck: dict) -> dict:
    """Registry id the Studio resolves for each font role of a clean deck (mirrors resolve.js applyBrand and fixed.mjs expectedFonts)."""
    preset = read_json(SKILL / "styles" / deck["preset"] / "preset.json")
    known = {f["id"] for f in read_json(SKILL / "fonts" / "registry.json")["families"]}
    out = {r: (preset.get("type", {}).get(r) or {}).get("family") for r in ROLES}
    fonts = ((read_json(ROOT / deck["brand"]).get("visual") or {}).get("fonts") or {}) if deck.get("brand") else {}
    if "fonts" in (preset.get("brandBindings") or []):
        if fonts.get("display") in known:
            out["display"] = out["heading"] = fonts["display"]
        if fonts.get("body") in known:
            out["body"] = fonts["body"]
        if fonts.get("latin") in known:
            out["latin"] = fonts["latin"]
    return out


def check_corpus_shape(rendered: dict, sl: dict) -> list:
    """The corpus files against the fixed lists (same checks as checkCorpusShape of fixed.mjs); [] when the corpus is what the card says it is."""
    p = fixed_drift()
    cases = rendered.get("cases") if isinstance(rendered.get("cases"), list) else []
    decks = sl.get("decks") if isinstance(sl.get("decks"), list) else []
    have = [c.get("id") for c in cases]
    p += [f"rendered.json holds the case {i} twice" for i in dict.fromkeys(x for x in have if have.count(x) > 1)]
    p += [f"rendered.json has no case {i} (the eight planted defects are a fixed list, see fixed.mjs)" for i in FIXED_IDS if i not in have]
    p += [f"rendered.json holds {i}, which is not one of the eight planted defects of fixed.mjs" for i in have if i not in FIXED_IDS]
    if rendered.get("ids") != FIXED_IDS:
        p.append(f"rendered.json lists ids {rendered.get('ids')} but the fixed list is {FIXED_IDS}")
    for c in cases:
        if c.get("id") not in FIXED_CASES:
            continue
        scope, rule, sev = FIXED_CASES[c["id"]]

        def at(msg, _id=c["id"]):
            p.append(f"{_id}: {msg}")

        if c.get("scope") not in ("rendered", "spec"):
            at(f'scope "{c.get("scope")}" is neither rendered nor spec')
        elif c["scope"] != scope:
            at(f'scope is "{c["scope"]}", the fixed list says "{scope}"')
        if c.get("deck") not in FIXED_DECKS:
            at(f'deck "{c.get("deck")}" is not one of the four clean slice decks')
        elif not any(d.get("id") == c["deck"] for d in decks):
            at(f"deck {c['deck']} is not in corpus-clean/slice.json")
        if not re.fullmatch(r"s\d{2}", str(c.get("slide") or "")):
            at(f'slide "{c.get("slide")}" is not a slide id')
        expect = c.get("expect") if isinstance(c.get("expect"), list) else []
        if not expect:
            at("expect is empty (a planted defect must name the finding that proves it)")
        for w in expect:
            if not (isinstance(w, dict) and isinstance(w.get("rule"), str) and w["rule"] and w.get("sev") in SEVS):
                at(f"an expect entry needs a rule and a severity ({', '.join(SEVS)}): {w}")
        if not any(isinstance(w, dict) and w.get("rule") == rule and w.get("sev") == sev for w in expect):
            at(f"expect must still name {sev} {rule}")
        if "absent" in c and not (isinstance(c["absent"], list) and all(isinstance(x, str) and x for x in c["absent"])):
            at("absent must be a list of rule ids")
        if c.get("scope") == "rendered":
            plant = c.get("plant") or {}
            html = plant.get("html")
            html = "".join(html) if isinstance(html, list) else (html or "")
            if not html.strip():
                at("a rendered case needs plant.html")
            if plant.get("mode") not in ("replace", "append"):
                at('plant.mode must be "replace" or "append"')
            if plant.get("mode") == "append" and not (isinstance(plant.get("into"), str) and plant["into"]):
                at("an appended plant needs plant.into")
        elif c.get("scope") == "spec" and not (isinstance(c.get("patch"), list) and c["patch"]):
            at("a spec case needs a non-empty patch")
    deck_ids = [d.get("id") for d in decks]
    p += [f"slice.json holds the deck {i} twice" for i in dict.fromkeys(x for x in deck_ids if deck_ids.count(x) > 1)]
    p += [f"slice.json has no deck {i} (the four clean slice decks are a fixed list, see fixed.mjs)" for i in FIXED_DECKS if i not in deck_ids]
    p += [f"slice.json holds {i}, which is not one of the four clean slice decks of fixed.mjs" for i in deck_ids if i not in FIXED_DECKS]
    for d in decks:
        if d.get("id") not in FIXED_DECKS:
            continue

        def at_d(msg, _id=d["id"]):
            p.append(f"{_id}: {msg}")

        if d.get("preset") not in PRESETS:
            at_d(f'preset "{d.get("preset")}" is neither creator nor poster')
            continue
        if not (isinstance(d.get("base"), str) and d["base"]):
            at_d("base is missing")
        if not (isinstance(d.get("patch"), list) and d["patch"]):
            at_d("patch is empty (a clean deck is a fixture plus its stored plan)")
        want, got = expected_fonts(d), d.get("fonts")
        if not isinstance(got, dict):
            at_d("fonts is missing (the resolved families are asserted, see the description of slice.json)")
        elif [got.get(r) for r in ROLES] != [want[r] for r in ROLES]:
            at_d(f"fonts {got} differ from what the preset and the brand give: {want}")
    req = sl.get("requireExecuted") if isinstance(sl.get("requireExecuted"), list) else []
    p += [f"requireExecuted names {i} twice" for i in dict.fromkeys(x for x in req if req.count(x) > 1)]
    p += [f"requireExecuted dropped the gate {i} (the gates of build plan r2 3.1 are a fixed list, see fixed.mjs)" for i in FIXED_GATES if i not in req]
    return p


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--only")
    ap.add_argument("--baseline", action="store_true")
    ap.add_argument("--list", action="store_true")
    args = ap.parse_args(argv)
    bad = read_json(ROOT / "tests" / "corpus-bad" / "defects.json")["cases"]
    clean = read_json(ROOT / "tests" / "corpus-clean" / "posts.json")["posts"]
    rendered = read_json(ROOT / "tests" / "corpus-bad" / "rendered.json")
    sl = read_json(ROOT / "tests" / "corpus-clean" / "slice.json")
    if args.list:
        print(f"{len(bad)} defect cases, {len(clean)} clean posts, {len(rendered['cases'])} planted visual defects, {len(sl['decks'])} clean slice decks")
        return 0
    if args.baseline:
        for c in bad + clean:
            if not args.only or c["id"] == args.only:
                print(c["id"] + ": " + " ".join(r["sev"][0] + ":" + label(r) for r in findings(c)))
        return 0
    failed = missed = expected_total = 0

    def fail(msg):
        nonlocal failed
        failed += 1
        print(msg, file=sys.stderr)

    for c in bad:
        if args.only and c["id"] != args.only:
            continue
        got = findings(c)
        have, have_rules = {label(r) for r in got}, {r["rule"] for r in got}
        for want in c["expect"]:
            expected_total += 1
            if (want in have) if "@" in want else (want in have_rules):
                continue
            missed += 1
            fail(f"MISSED {c['id']}: expected {want}, got {', '.join(label(r) for r in got) or 'nothing'}")
    print(f"corpus-bad (py): {len(bad)} cases, {expected_total - missed} of {expected_total} expected findings reported")

    # ---- the planted visual defects: resolve every case; look for the findings Python implements --------------------------
    rules = read_json(SKILL / "data" / "qa-rules.json")
    owns, check_of = engine_owner(rules)
    decks = {d["id"]: d for d in sl["decks"]}
    for problem in check_corpus_shape(rendered, sl):   # the fixed eight, the fixed four decks, the fixed gates; also in --only runs
        fail(problem)
    looked = skipped = 0
    for c in rendered["cases"]:
        if args.only and c["id"] != args.only:
            continue
        deck = decks.get(c["deck"])
        if not deck:
            fail(f"{c['id']}: deck {c['deck']} is not in corpus-clean/slice.json")
            continue
        spec = slice_spec(deck, c.get("patch") or [])
        if c["slide"] not in {s["id"] for s in spec["slides"]}:
            fail(f"{c['id']}: slide {c['slide']} is not in deck {c['deck']}")
        for e in schema.validate_named("spec", spec):
            fail(f"{c['id']}: the planted spec is invalid: {e['path']} {e['message']} (a planted defect is valid data the gates must judge)")
        if c["scope"] == "rendered" and not (c.get("plant") and c["plant"].get("html")):
            fail(f"{c['id']}: a rendered case needs plant.html")
        got = run(spec, slice_brand(deck), c)
        for w in c["expect"]:
            if w["rule"] not in check_of:
                fail(f"{c['id']}: {w['rule']} is no check of qa-rules.json")
            elif c["scope"] == "rendered" or not owns("py", w["rule"]):
                skipped += 1
            else:
                looked += 1
                if not any(r["rule"] == w["rule"] and r["sev"] == w["sev"] and (not w.get("slide") or r.get("slide") == w["slide"]) for r in got):
                    fail(f"MISSED {c['id']}: expected {w['sev']} {w['rule']}, got {', '.join(label(r) for r in got) or 'nothing'}")
    print(f"corpus-bad planted (py): {len(rendered['cases'])} defects resolved; {looked} expected findings looked for, {skipped} are JavaScript's until their Python twin lands (Q6)")

    blocked = lesser = unplanned = 0
    for c in clean:
        if args.only and c["id"] != args.only:
            continue
        got = findings(c)
        blocks = [r for r in got if r["sev"] == "BLOCK"]
        unplanned += sum(1 for r in got if r["rule"] == "VA1.anchor-present")
        lesser += len(got) - len(blocks)
        if blocks:
            blocked += 1
            fail(f"FALSE BLOCK {c['id']}: {', '.join(label(r) for r in blocks)}")
    print(f"corpus-clean (py): {len(clean)} posts, {blocked} blocked, {lesser - unplanned} lesser findings (and {unplanned} VA1 unplanned notes)")

    flagged = notes = 0
    for d in sl["decks"]:
        if args.only and d["id"] != args.only:
            continue
        spec = slice_spec(d)
        for e in schema.validate_named("spec", spec):
            fail(f"{d['id']}: invalid against spec.schema.json: {e['path']} {e['message']}")
        got = run(spec, slice_brand(d), d)
        bad_ = [r for r in got if r["sev"] in ("BLOCK", "FIX")]
        notes += len(got) - len(bad_)
        if bad_:
            flagged += 1
            fail(f"FALSE {bad_[0]['sev']} {d['id']}: {', '.join(label(r) for r in bad_)}")
    print(f"corpus-clean slice (py): {len(sl['decks'])} decks, {flagged} flagged, {notes} notes")

    if not args.only:
        mine = [i for i in sl["requireExecuted"] if owns("py", i)]
        for i in mine:
            if not (EXECUTED.get(i) or EXECUTED.get(i.split(".")[0])):
                fail(f"gate {i} was executed 0 times by the Python engine")
        unknown = [i for i in sl["requireExecuted"] if i not in check_of]
        if unknown:
            fail(f"requireExecuted names checks that qa-rules.json does not have: {', '.join(unknown)}")
        print(f"executed (py): {len(mine)} of {len(sl['requireExecuted'])} required gates have a Python twin and ran at least once; the rest are JavaScript's until Q6")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
