#!/usr/bin/env python3
"""tests/conformance/run_py.py: the Python half of the JS/Python conformance run (CONTRACT 3 and 7, Appendix C item 4).

    python tests/conformance/run_py.py [--out verdicts.py.json] [--compare verdicts.js.json]

Feeds the same corpus as run_js.mjs to the shared ``_cs`` package (text model, canonical JSON, colour, patch, schema validator, lint,
text gates) and writes the verdicts as canonical JSON. With ``--compare`` it also loads the JavaScript verdicts and exits 2 when the
two engines disagree anywhere (floats within 1e-9), printing the first differences, or when a gate that must run was executed zero
times. The corpus is every ``*.json`` under ``corpus/`` and ``visual/`` (see run_js.mjs); a mutation's ``expect`` entries are planted
findings (or, with ``absent``, clean controls) this runner must see itself, from its own unfiltered findings and only for the checks
it implements: a miss exits 1 after the verdicts are written. The cross-engine comparison alone sees the shared findings.
"""
import argparse
import copy
import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SKILL = ROOT / "plugins" / "carousel-studio" / "skills" / "carousel-design"
sys.path.insert(0, str(SKILL / "scripts"))

from _cs import CSError, canon, color, lint, patch, paths, qa, report, schema, text as T  # noqa: E402

paths.ensure_utf8_stdio()

CORPUS_KEYS = ("strings", "similarityPairs", "kashida", "numbers", "colors", "mutations", "slides", "requireExecuted")
CORPUS_DIRS = ("corpus", "visual")
TEXT_SCOPES = ("text", "spec")                       # scopes whose checks run as text gates
COMPOSITE_SCOPES = ("text+model", "text+rendered")   # a text half and another half


def read_json(p):
    return json.loads(Path(p).read_text(encoding="utf-8-sig"))


def fixtures(name):
    return read_json(ROOT / "tests" / "fixtures" / name)


def load_corpus() -> dict:
    """Every ``*.json`` under corpus/ and visual/ in path order; arrays of one key are concatenated, other keys are ignored."""
    base = ROOT / "tests" / "conformance"
    names = sorted(p.relative_to(base).as_posix() for d in CORPUS_DIRS if (base / d).is_dir() for p in (base / d).rglob("*.json"))
    merged: dict = {k: [] for k in CORPUS_KEYS}
    for name in names:
        doc = read_json(base / name)
        for k in CORPUS_KEYS:
            if isinstance(doc.get(k), list):
                merged[k] += doc[k]
    seen: set = set()
    for m in merged["mutations"]:
        if m["id"] in seen:
            raise SystemExit(f"conformance: mutation id {m['id']} appears twice")
        seen.add(m["id"])
    merged["files"] = names
    return merged


def collect(corpus):
    strings = list(corpus["strings"])
    strings += [c["text"] for c in fixtures("bidi-strings.json")["cases"]]
    ortho = fixtures("ortho-seeded-errors.json")
    strings += [c["text"] for c in ortho["cases"]]
    strings += [c if isinstance(c, str) else c["text"] for c in ortho.get("controls", [])]
    fixture_files = sorted(f.name for f in (ROOT / "tests" / "fixtures").iterdir()
                           if f.name.startswith(("spec.", "brand.")) and f.name.endswith(".json"))
    for f in [x for x in fixture_files if x.startswith("spec.")]:
        spec = fixtures(f)
        for s in spec.get("slides", []):
            for k in ("kicker", "headline", "sub", "title", "body", "bridge", "attribution"):
                if isinstance(s.get(k), str):
                    strings.append(s[k])
            strings += list(s.get("bullets", []))
        pack = spec.get("captionPack")
        if pack:
            strings += [pack[k] for k in ("firstLine", "keywordLine", "body", "cta") if pack.get(k)]
    for slide in corpus["slides"]:  # the visible additions of the visual language
        strings += [text for _key, text in T.visual_fields(slide)]
    return list(dict.fromkeys(strings)), fixture_files


def vec(rgb):
    return {"r": rgb[0], "g": rgb[1], "b": rgb[2]}


def lch(t):
    return {"L": t[0], "C": t[1], "h": t[2]}


def ensure(r):
    return {"hex": r["hex"], "changed": r["changed"], "steps": r["steps"]}


def schema_result(kind, doc):
    errs = schema.validate_named(kind, doc)
    return {"ok": not errs, "errors": errs}


# ---- which findings both engines own --------------------------------------------------------------------------------------
def qa_rules() -> dict:
    return read_json(SKILL / "data" / "qa-rules.json")


def engine_owner(rules: dict):
    """``owns(engine, gate, rule=None)``: does this engine implement the check? qa-rules.json marks a check ``deferred`` for an engine
    until that twin exists (Q6 owns the Python twins of VA1, C2.demo-words ...). A rule id that is no check id (O1.ortho-hamza-001)
    follows its gate. Same rule as ``owns`` in run_js.mjs."""
    gate_of = {g["id"]: g for g in rules["gates"]}
    check_of = {c["id"]: c for g in rules["gates"] for c in g.get("checks", [])}

    def owns(engine: str, gate: str, rule=None) -> bool:
        g, c = gate_of.get(gate), check_of.get(rule)
        if not g:
            return False
        gone = ((c or {}).get("deferred") or {}).get("engines") or []
        return engine in [e for e in ((c or {}).get("engines") or g.get("engines") or []) if e not in gone]

    return owns


def shared_filter(rules: dict):
    """A finding is compared when both engines implement its check; the other findings stay out of the verdict, and the executed counts
    prove that the other engine's gates still ran. Same rule as ``isShared`` in run_js.mjs."""
    owns = engine_owner(rules)
    return lambda f: owns("py", f["gate"], f["rule"]) and owns("js", f["gate"], f["rule"])


def check_table(rules: dict) -> dict:
    """What each check is, per check and not per gate: ``{check id: {gate, engines, text}}``.

    ``engines`` are the engines that implement it now (its own list, else its gate's, minus the engines it is deferred for). ``text``
    says it runs as a text gate in this run. The scope is the check's own when it has one (``D10.glyph-icon`` is ``text`` inside the
    ``rendered`` gate D10; ``D8.anchor-run`` is ``spec`` inside the ``text`` gate D8), else its gate's. A composite scope
    (``text+rendered``, ``text+model``) has a text half that both engines implement; a check only JavaScript has there
    (``B1.isolation``) belongs to the other half."""
    table = {}
    for gate in rules["gates"]:
        for c in gate.get("checks", []):
            declared = c.get("engines") or gate.get("engines") or []
            gone = (c.get("deferred") or {}).get("engines") or []
            scope = c.get("scope") or gate.get("scope")
            text = scope in TEXT_SCOPES or (scope in COMPOSITE_SCOPES and "py" in declared and "js" in declared)
            table[c["id"]] = {"gate": gate["id"], "engines": [e for e in declared if e not in gone], "text": text}
    return table


def check_expectations(corpus: dict, rules: dict) -> None:
    """An ``expect`` entry that names no gate would pass as a clean control for ever: stop the run instead."""
    gates = {g["id"] for g in rules["gates"]}
    for m in corpus["mutations"]:
        for e in m.get("expect") or []:
            if e.get("gate") not in gates or (e.get("rule") and not e["rule"].startswith(e["gate"] + ".")):
                raise SystemExit(f"conformance: {m['id']} expects {e.get('gate')} {e.get('rule') or ''}, which is no gate or rule of qa-rules.json")
            if e.get("el") is None and not e.get("slide"):
                raise SystemExit(f"conformance: {m['id']} expects {e['gate']} with neither el nor slide")


def expectation_hit(results, e: dict) -> bool:
    """Does a finding match the planted ``expect`` entry? ``slide`` names a finding that has a slide but no element key."""
    return any(r["gate"] == e["gate"] and (e.get("el") is None or r.get("el") == e["el"]) and (not e.get("slide") or r.get("slide") == e["slide"])
               and (not e.get("rule") or r["rule"] == e["rule"]) and (not e.get("sev") or r["sev"] == e["sev"]) for r in results)


def compute():
    corpus = load_corpus()
    unique, fixture_files = collect(corpus)
    rules = qa_rules()
    check_expectations(corpus, rules)
    owns = engine_owner(rules)
    shared = shared_filter(rules)
    verdict = {}

    verdict["text"] = []
    for s in unique:
        toks = T.tokenize(s)
        verdict["text"].append({
            "s": s,
            "tokens": [[t["kind"], t["text"], t["start"], t["end"], t["ltr"]] for t in toks],
            "markup": T.parse_markup(s), "strip": T.strip_markup(s),
            "wc": T.word_count(s), "cc": T.char_count(s), "digits": T.detect_digits(s),
            "toWestern": T.convert_digits(s, "western"), "toIndic": T.convert_digits(s, "arabic-indic"),
            "skeleton": T.skeleton(s), "bind": T.bind(s),
            "html": {
                "ar-w": T.to_html(s, digits="western", lang="ar"),
                "ar-i": T.to_html(s, digits="arabic-indic", lang="ar"),
                "en-w": T.to_html(s, digits="western", lang="en"),
                "ar-plain": T.to_html(s, digits="western", lang="ar", markup=False, word_spans=False),
                "ar-base5": T.to_html(s, digits="western", lang="ar", index_base=5),
            },
            "hasArabic": T.has_arabic(s), "hasTashkeel": T.has_tashkeel(s),
        })
    verdict["similarity"] = [[a, b, T.similarity(a, b)] for a, b in corpus["similarityPairs"]]
    verdict["kashida"] = [[w, T.kashida_positions(w), T.kashida_apply(w), T.kashida_apply(w, 1)] for w in corpus["kashida"]]
    verdict["kashidaHtml"] = [[s, T.to_html(s, kashida_word=s.split(" ")[0], allow_kashida=True)]
                              for s in ("مرحبا بكم في السلام", "الإبداع يبدأ بـChatGPT")]
    verdict["counters"] = []
    for i, n in ((1, 8), (3, 12), (10, 12)):
        for d in ("western", "arabic-indic"):
            for lang in ("ar", "en"):
                verdict["counters"].append([i, n, d, lang, T.counter(i, n, d, lang), T.remaining(n - i, d, lang), T.format_number(str(n) + ".5", d)])
    verdict["joining"] = [[c, T.joining_type(c)] for c in (0x0621, 0x0622, 0x0627, 0x0628, 0x062F, 0x0640, 0x064E, 0x0670, 0x0679, 0x06CC, 0x06D2, 0x0750, 0x0759, 0x0041)]

    # the visible fields of a slide: the visual additions, the text a viewer reads in each digit system, the keyed QA fields, the counts
    verdict["slides"] = [{
        "id": s.get("id") or f"slide-{i}",
        "fields": T.visual_fields(s),
        "text": {"raw": T.slide_text(s, None), "western": T.slide_text(s, "western"), "indic": T.slide_text(s, "arabic-indic")},
        "qa": [[f["key"], f["field"], f["index"], f["slide"], f["text"]] for f in qa.slide_fields(s)],
        "counts": T.word_counts(s),
    } for i, s in enumerate(corpus["slides"])]

    numbers = []
    for n in corpus["numbers"]:
        try:
            numbers.append([n, canon.canonical_json(n)])
        except CSError as exc:
            numbers.append([n, "error:" + exc.code])
    docs = {}
    for f in fixture_files:
        doc = fixtures(f)
        entry = {"canon": canon.canonical_json(doc), "hash": canon.hash16(doc)}
        if f.startswith("brand."):
            entry["snapshot"] = canon.hash16(canon.brand_snapshot(doc))
        docs[f] = entry
    verdict["canon"] = {"numbers": numbers, "fnv": [[s, canon.fnv1a64(s)] for s in ("", "a", "foobar", "الكاروسيل", "😀")], "docs": docs}

    verdict["color"] = []
    for a, b in corpus["colors"]:
        verdict["color"].append({
            "a": a, "b": b, "parse": vec(color.parse(a)), "hex": color.to_hex(color.parse(a)), "luminance": color.luminance(a),
            "contrast": color.contrast(a, b), "mix": color.mix(a, b, 0.3), "mix55": color.mix(a, b, 0.55), "on": color.on_color(a),
            "oklch": lch(color.to_oklch(a)), "round": color.from_oklch(*color.to_oklch(a)),
            "ensure45": ensure(color.ensure_contrast(a, b, 4.5)), "ensure3": ensure(color.ensure_contrast(a, b, 3)),
        })

    base = fixtures("spec.eg.8slides.json")
    edited = copy.deepcopy(base)
    edited["slides"][2]["title"] = "عنوان جديد"
    del edited["slides"][4]
    edited["slides"].append({"id": "s09", "n": 8, "type": "share", "headline": "ابعتها لصاحبك"})
    edited["captionPack"]["hashtags"] = ["#أ"]
    edited["meta"]["updatedBy"] = "studio"
    del edited["compat"]
    edited["rev"] = 2
    ops = patch.diff(base, edited)
    try:
        patch.apply_patch(edited, [{"op": "test", "path": "/rev", "value": 1}])
        conflict = "applied"
    except CSError as exc:
        conflict = exc.code
    verdict["patch"] = {"ops": ops, "roundTrip": canon.hash16(patch.apply_patch(base, ops)), "target": canon.hash16(edited),
                        "envelope": patch.envelope(base, ops[:2]), "conflict": conflict}

    kinds = ("brand", "spec", "preset", "occasion", "hook", "plan", "qa-report")
    docs_for_schema = [(k, f"docs/examples/{k}.example.json", read_json(ROOT / "docs" / "examples" / f"{k}.example.json")) for k in kinds]
    docs_for_schema += [("spec" if f.startswith("spec.") else "brand", "tests/fixtures/" + f, fixtures(f)) for f in fixture_files]
    verdict["schema"] = []
    for kind, file, doc in docs_for_schema:
        broken = copy.deepcopy(doc)
        broken["zzUnknown"] = 1
        if isinstance(broken.get("id"), str):
            broken["id"] = "BAD ID"
        if broken.get("slides"):
            broken["slides"][0]["type"] = "nope"
            broken["slides"][0]["headline"] = 5
        if "rev" in broken:
            broken["rev"] = 0
        broken.pop("brand", None)
        verdict["schema"].append({"kind": kind, "file": file, "ok": schema_result(kind, doc), "broken": schema_result(kind, broken)})

    verdict["lint"] = {}
    for dialect in ("eg", "gulf", "levant", "msa-white", "en"):
        verdict["lint"][dialect] = [[[it["rule"], it["sev"], it["confidence"], it["start"], it["end"], it["original"], it["fix"], it["autofix"],
                                      it["kind"], it.get("entry")] for it in lint.lint_text(s, dialect=dialect, digits="western")] for s in unique]
    verdict["lintIndic"] = [[[it["rule"], it["start"], it["end"], it["fix"]] for it in lint.lint_text(s, dialect="msa-white", digits="arabic-indic")]
                            for s in unique]

    def flat(results):
        return [[r["gate"], r["rule"], r["sev"], r.get("slide"), r.get("el"), r["msg"]["ar"], r["msg"]["en"],
                 r["fix"]["ar"] if r.get("fix") else None, r["fix"]["en"] if r.get("fix") else None, bool(r.get("overridden"))] for r in results]

    executed: dict = {}

    def run_text(spec, brand, **kw):
        """(everything this engine found, the part both engines implement): only the second goes into the verdict."""
        results = qa.run_text_gates(spec, brand, **kw)
        for gate_id, n in results.stats["gates"].items():
            executed[gate_id] = executed.get(gate_id, 0) + n
        return results, [f for f in results if shared(f)]

    verdict["qa"] = {}
    missed: list = []
    for m in corpus["mutations"]:
        spec = patch.apply_patch(fixtures(m["base"]), m["patch"])
        brand = fixtures(m["brand"]) if m.get("brand") else None
        if brand and m.get("brandPatch"):
            brand = patch.apply_patch(brand, m["brandPatch"])
        history = {"history": m["history"]} if m.get("history") else None
        found, results = run_text(spec, brand, history=history)
        verdict["qa"][m["id"]] = {"results": flat(results), "summary": report.summarize(results)}
        verdict["qa"][m["id"] + ":fast"] = {"results": flat(run_text(spec, brand, history=history, fast=True)[1]), "summary": None}
        for e in m.get("expect") or []:
            if not owns("py", e["gate"], e.get("rule")):  # a check only JavaScript implements is JavaScript's to find
                continue
            if expectation_hit(found, e) == bool(e.get("absent")):
                missed.append(f"{m['id']}: {'unexpected' if e.get('absent') else 'missing'} {e['gate']} at {e.get('el') or e.get('slide')}"
                              + (f" ({e['rule']})" if e.get("rule") else ""))

    verdict["auto"] = {}
    auto_dir = ROOT / "tests" / "fixtures" / "auto"
    if (auto_dir / "manifest.json").is_file():
        files = read_json(auto_dir / "manifest.json").get("files") or {}
        for stem in sorted(files):
            path = auto_dir / files[stem]["file"]
            if not path.is_file():
                continue
            for i, spec in enumerate(read_json(path)):
                verdict["auto"][f"{stem}-{i}"] = {"results": flat(run_text(spec, None)[1]), "summary": None}
    verdict["executed"] = executed
    verdict["requireExecuted"] = corpus["requireExecuted"]
    return verdict, missed, corpus


def compare(a, b, path="", out=None, limit=40):
    out = [] if out is None else out
    if len(out) >= limit:
        return out
    if isinstance(a, bool) or isinstance(b, bool) or a is None or b is None:
        if a != b:
            out.append((path, a, b))
    elif isinstance(a, (int, float)) and isinstance(b, (int, float)):
        if not math.isclose(a, b, rel_tol=1e-9, abs_tol=1e-12):
            out.append((path, a, b))
    elif isinstance(a, dict) and isinstance(b, dict):
        for k in sorted(set(a) | set(b)):
            if k not in a or k not in b:
                out.append((f"{path}/{k}", "missing" if k not in a else "present", "missing" if k not in b else "present"))
            else:
                compare(a[k], b[k], f"{path}/{k}", out, limit)
    elif isinstance(a, list) and isinstance(b, list):
        if len(a) != len(b):
            out.append((path + "[len]", len(a), len(b)))
        for i, (x, y) in enumerate(zip(a, b)):
            compare(x, y, f"{path}[{i}]", out, limit)
    elif a != b:
        out.append((path, a, b))
    return out


def executed_problems(js: dict, py: dict, rules: dict) -> list:
    """A gate that never ran proves nothing: a clean verdict from a gate that was not loaded would pass the comparison. Returns the
    problems, resolved per check (``check_table``), not per gate:
      * a gate with a text check both engines implement must have run in the JavaScript engine, counted under the gate id or, for a
        qa-visual gate, under a check id of the gate (``VA3.valid``);
      * a text check only JavaScript runs (deferred for py until Q6 lands its twin, or JavaScript by design like ``D10.glyph-icon``,
        whose gate D10 is a rendered gate) must have a count of its own, whatever its gate did;
      * an id in ``requireExecuted`` (the corpus lists them) must have a count in the JavaScript run;
      * every Python text gate must have run in the Python engine."""
    out = []
    js_ex, py_ex = js.get("executed") or {}, py.get("executed") or {}

    def ran(ex: dict, gate_id: str) -> bool:
        return any(k == gate_id or k.startswith(gate_id + ".") for k, n in ex.items() if n > 0)

    rows = [(cid, row) for cid, row in check_table(rules).items() if row["text"] and "js" in row["engines"]]
    gates = list(dict.fromkeys(row["gate"] for _cid, row in rows if "py" in row["engines"]))
    out += [f"gate {gate_id} was executed 0 times by the JavaScript engine" for gate_id in gates if not ran(js_ex, gate_id)]
    out += [f"check {cid} (only the JavaScript engine runs it) was executed 0 times by the JavaScript engine"
            for cid, row in rows if "py" not in row["engines"] and not js_ex.get(cid)]
    for gate_id in sorted(set(js.get("requireExecuted") or []) | set(py.get("requireExecuted") or [])):
        if not js_ex.get(gate_id):
            out.append(f"required gate {gate_id} was executed 0 times by the JavaScript engine")
    for gate_id, _runner in qa.TEXT_GATES:
        if not py_ex.get(gate_id):
            out.append(f"gate {gate_id} was executed 0 times by the Python engine")
    return out


def main(argv=None):
    ap = argparse.ArgumentParser(description="Python half of the JS/Python conformance run")
    ap.add_argument("--out", help="write the verdicts here (canonical JSON)")
    ap.add_argument("--compare", help="verdicts of run_js.mjs; exit 2 when they differ or a gate ran zero times")
    args = ap.parse_args(argv)
    verdict, missed, corpus = compute()
    text = json.dumps(verdict, ensure_ascii=False, indent=1, sort_keys=True) + "\n"
    if args.out:
        Path(args.out).write_text(text, encoding="utf-8", newline="\n")
        print(f"wrote {args.out} ({len(text) // 1024} KiB): {len(verdict['text'])} strings, {len(corpus['mutations'])} mutations, "
              f"{len(corpus['slides'])} slides, {len(verdict['auto'])} decks, {len(verdict['executed'])} gates executed, {len(corpus['files'])} corpus files")
    status = 0
    if args.compare:
        theirs = json.loads(Path(args.compare).read_text(encoding="utf-8"))
        mine = json.loads(text)
        # the JavaScript side runs gates that have no Python twin yet; their counts are checked below, not compared.
        # Python also registers those JS-only checks with a count of 0 (stats.gates lists every registered gate),
        # so only the gates Python actually ran are compared.
        their_cmp = {**theirs, "executed": {k: v for k, v in (theirs.get("executed") or {}).items() if mine["executed"].get(k)}}
        mine = {**mine, "executed": {k: v for k, v in mine["executed"].items() if v}}
        diffs = compare(mine, their_cmp)
        problems = executed_problems(theirs, mine, qa_rules())
        if diffs:
            print(f"conformance: the engines disagree ({len(diffs)}+ differences, first shown)")
            for path, mine_v, other in diffs:
                print(f"  {path}\n    py: {json.dumps(mine_v, ensure_ascii=False)[:300]}\n    js: {json.dumps(other, ensure_ascii=False)[:300]}")
        for p in problems:
            print("conformance: " + p)
        if diffs or problems:
            status = 2
        else:
            print(f"conformance: Python and JavaScript agree on every verdict ({len(mine['executed'])} gates executed, "
                  f"{len(theirs.get('executed') or {})} on the JavaScript side)")
    elif not args.out:
        sys.stdout.write(text)
    if missed:
        sys.stderr.write(f"conformance: {len(missed)} planted finding(s) not as expected in the Python engine\n")
        for m in missed:
            sys.stderr.write("  " + m + "\n")
        status = status or 1
    return status


if __name__ == "__main__":
    sys.exit(main())
