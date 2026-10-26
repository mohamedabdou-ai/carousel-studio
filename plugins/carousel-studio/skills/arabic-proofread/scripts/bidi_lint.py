#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""bidi_lint.py - text-level digit and bidirectional-text checks (gates N1 and B1, text scope).

    bidi_lint.py (--text STRING | --file F | --spec FILE) [--digits western|arabic-indic]
                 [--dialect D] [--fix] [--format table|json] [--out F]

Runs the built-in checks mixed-digits, persian-digits, percent-sign, lam-latin-stranded,
number-noun-unbound and digit-glued-to-word of data/rules/ortho.json, plus one check of its
own: the digit system must equal the locale's (N1.system). Findings carry the QA gate they
belong to:

    N1.mixed        two digit systems in one text            (BLOCK, autofix)
    N1.persian      U+06F0-06F9 digits                       (BLOCK, autofix)
    N1.system       digits differ from locale.digits         (BLOCK, autofix)
    N1.percent      % beside Arabic-Indic or the reverse     (BLOCK, autofix)
    B1.stranded-lam a prefix (لـ/بـ/الـ) split from its Latin word (BLOCK, autofix)
    B1.unbound-pair number and noun separated by a plain space (FIX, autofix)
    O1.glued-digit  a digit glued to an Arabic word          (FIX, autofix)

Rendered-isolation checks (contiguous <bdi> runs, bound pairs on one line) need the Studio
and are not run here. --fix applies the autofix findings (spec: patched copy to --out).

JSON: {issues:[{gate,gateRule,rule,sev,confidence,original,fix,start,end,slide?,el?,autofix,msg}],
fixed?, summary:{status,counts,exitCode}, digits}. Exit codes: 0 clean, 1 FIX pending,
2 BLOCK pending, 64 usage, 65 unparseable input, 66 missing input, 73 cannot write.
"""

import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _cs import lint, paths, rules, text as cstext  # noqa: E402

paths.ensure_utf8_stdio()

CHECK_TO_GATE = {
    "mixed-digits": ("N1", "N1.mixed"),
    "persian-digits": ("N1", "N1.persian"),
    "percent-sign": ("N1", "N1.percent"),
    "lam-latin-stranded": ("B1", "B1.stranded-lam"),
    "number-noun-unbound": ("B1", "B1.unbound-pair"),
    "digit-glued-to-word": ("O1", "O1.glued-digit"),
}
SYSTEM_MSG = {
    "ar": "نظام الأرقام لا يطابق نظام البراند: يُحوَّل لنظام واحد.",
    "en": "The digit system differs from the brand's: convert to a single system.",
}
SLIDE_TEXT_KEYS = ("kicker", "headline", "sub", "title", "body", "bridge", "attribution")
_DIGIT_SYSTEM = (("western", "0123456789"), ("arabic-indic", "٠١٢٣٤٥٦٧٨٩"))


class Fail(Exception):
    def __init__(self, code, message, exit_code):
        super().__init__(message)
        self.code, self.exit_code = code, exit_code


class Parser(argparse.ArgumentParser):
    def error(self, message):
        sys.stderr.write("cs-error: E_USAGE: %s\n" % message)
        raise SystemExit(64)


def iter_spec_fields(spec):
    """Same field walk as ortho_lint.py: (slide_id | None, el, text, kashida_word)."""
    hook = spec.get("hook") or {}
    for key in ("cover", "text", "slide2"):
        if isinstance(hook.get(key), str):
            yield None, "hook.%s" % key, hook[key]
    slides = spec.get("slides") or []
    for slide in slides:
        sid = slide.get("id")
        for key in SLIDE_TEXT_KEYS:
            if isinstance(slide.get(key), str):
                yield sid, key, slide[key]
        for i, item in enumerate(slide.get("bullets") or []):
            if isinstance(item, str):
                yield sid, "bullets.%d" % i, item
        for i, side in enumerate(slide.get("sides") or []):
            for key in ("label", "text"):
                if isinstance(side.get(key), str):
                    yield sid, "sides.%d.%s" % (i, key), side[key]
        cta = slide.get("cta")
        if isinstance(cta, dict) and isinstance(cta.get("text"), str):
            yield sid, "cta.text", cta["text"]
        number = slide.get("number")
        if isinstance(number, dict) and isinstance(number.get("unit"), str):
            yield sid, "number.unit", number["unit"]
    pack = spec.get("captionPack") or {}
    for key in ("firstLine", "keywordLine", "body", "cta"):
        if isinstance(pack.get(key), str):
            yield None, "captionPack.%s" % key, pack[key]
    for key in ("perSlide", "alt"):
        for i, item in enumerate(pack.get(key) or []):
            if isinstance(item, str):
                yield (slides[i].get("id") if i < len(slides) else None), "captionPack.%s.%d" % (key, i), item


def set_spec_field(spec, slide_id, el, value):
    parts = el.split(".")
    node = spec if (slide_id is None or parts[0] in ("captionPack", "hook")) else next(
        s for s in spec["slides"] if s.get("id") == slide_id)
    for part in parts[:-1]:
        node = node[int(part)] if isinstance(node, list) else node[part]
    if isinstance(node, list):
        node[int(parts[-1])] = value
    else:
        node[parts[-1]] = value


def bidi_rule_map():
    """rule id -> (check name) for the six built-in checks, read from ortho.json."""
    ortho = rules.load_bundle()["ortho"]
    return {r["id"]: r["check"] for r in ortho["rules"] if r.get("kind") == "check" and r.get("check") in CHECK_TO_GATE}


def token_system(token):
    for name, chars in _DIGIT_SYSTEM:
        if any(c in chars for c in token):
            return name
    return None


def system_issues(text, digits):
    """N1.system: every number token written in the other system (only when the text uses one system)."""
    if cstext.detect_digits(text) not in ("western", "arabic-indic"):
        return []
    out = []
    for tok in cstext.tokenize(text):
        if tok["kind"] != "number" or re.search("[A-Za-z]", tok["text"]):
            continue
        if token_system(tok["text"]) not in (None, digits):
            fix = cstext.convert_digits(tok["text"], digits)
            out.append({"gate": "N1", "gateRule": "N1.system", "rule": "N1.system", "sev": "BLOCK", "confidence": 1.0,
                        "original": tok["text"], "fix": fix, "start": tok["start"], "end": tok["end"],
                        "autofix": True, "msg": SYSTEM_MSG})
    return out


def check_text(text, digits, dialect, rule_checks):
    found = lint.lint_text(text, dialect=dialect, digits=digits)
    out = []
    for f in found:
        check = rule_checks.get(f["rule"])
        if check:
            gate, gate_rule = CHECK_TO_GATE[check]
            out.append({"gate": gate, "gateRule": gate_rule, **f})
    out += system_issues(text, digits)
    return sorted(out, key=lambda i: (i["start"], i["end"], i["rule"]))


def summarize(issues):
    counts = {"BLOCK": 0, "FIX": 0, "NOTE": 0}
    for i in issues:
        counts[i["sev"]] = counts.get(i["sev"], 0) + 1
    code = 2 if counts["BLOCK"] else 1 if counts["FIX"] else 0
    return {"status": ("pass", "fix", "block")[code], "counts": counts, "exitCode": code}


def read_json_file(path, label):
    p = Path(path)
    if not p.exists():
        raise Fail("E_USAGE", "%s %s not found" % (label, p), 66)
    try:
        return paths.read_json(p)
    except ValueError as exc:
        raise Fail("E_SCHEMA", "cannot parse %s: %s" % (p, exc), 65)


def run(args):
    spec = read_json_file(args.spec, "spec") if args.spec else None
    digits = args.digits or ((spec or {}).get("locale") or {}).get("digits") or "western"
    dialect = args.dialect or ((spec or {}).get("locale") or {}).get("dialect") or "msa-white"
    rule_checks = bidi_rule_map()
    issues, fixed = [], None
    if spec is not None:
        patched = json.loads(json.dumps(spec))
        for slide_id, el, text in iter_spec_fields(spec):
            found = check_text(text, digits, dialect, rule_checks)
            for f in found:
                f["el"] = el
                if slide_id:
                    f["slide"] = slide_id
            if args.fix:
                new = lint.apply_fixes(text, found)
                if new != text:
                    set_spec_field(patched, slide_id, el, new)
                    found = [f for f in found if not f["autofix"]]
            issues += found
        fixed = patched if args.fix else None
    else:
        if args.text is not None:
            text = args.text
        else:
            p = Path(args.file)
            if not p.exists():
                raise Fail("E_USAGE", "file %s not found" % p, 66)
            try:
                text = paths.read_text(p)
            except UnicodeDecodeError as exc:
                raise Fail("E_SCHEMA", "%s is not valid UTF-8: %s" % (p, exc), 65)
        issues = check_text(text, digits, dialect, rule_checks)
        if args.fix:
            fixed = lint.apply_fixes(text, issues)
            issues = check_text(fixed, digits, dialect, rule_checks)
    return {"issues": issues, "fixed": fixed, "summary": summarize(issues), "digits": digits}


def render_table(result):
    rows = ["| gate | sev | original | fix | where |", "|---|---|---|---|---|"]
    for i in result["issues"]:
        where = "%s·%s" % (i.get("slide", "-"), i["el"]) if "el" in i else "%d-%d" % (i["start"], i["end"])
        rows.append("| %s | %s | %s | %s | %s |" % (i["gateRule"], i["sev"], (i["original"] or "").replace("|", "\\|"),
                                                   (i["fix"] or "").replace("|", "\\|"), where))
    s = result["summary"]
    rows += ["", "%s  BLOCK=%d FIX=%d  (digits %s)" % (s["status"].upper(), s["counts"]["BLOCK"], s["counts"]["FIX"], result["digits"])]
    return "\n".join(rows)


def main(argv=None):
    ap = Parser(prog="bidi_lint.py", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument("--text")
    src.add_argument("--file")
    src.add_argument("--spec")
    ap.add_argument("--digits", choices=("western", "arabic-indic"))
    ap.add_argument("--dialect", choices=("eg", "gulf", "levant", "msa-white", "en"), help="only needed to select dialect data; default msa-white")
    ap.add_argument("--fix", action="store_true")
    ap.add_argument("--format", choices=("table", "json"), default="table")
    ap.add_argument("--out", help="write the fixed text (or patched spec) here")
    args = ap.parse_args(argv)
    try:
        result = run(args)
        if args.fix and args.spec and not args.out:
            raise Fail("E_USAGE", "--fix with --spec needs --out (the input spec is never overwritten)", 64)
        if args.out and args.fix:
            try:
                if isinstance(result["fixed"], dict):
                    paths.write_json(args.out, result["fixed"])
                else:
                    paths.write_text(args.out, result["fixed"] if result["fixed"].endswith("\n") else result["fixed"] + "\n")
            except OSError as exc:
                raise Fail("E_ABORTED", "cannot write %s: %s" % (args.out, exc), 73)
    except Fail as exc:
        sys.stderr.write("cs-error: %s: %s\n" % (exc.code, exc))
        return exc.exit_code
    if args.format == "json":
        print(json.dumps({k: v for k, v in result.items() if not (k == "fixed" and v is None)}, ensure_ascii=False))
    else:
        print(render_table(result))
        if isinstance(result["fixed"], str) and not args.out:
            print("\n" + result["fixed"])
    return result["summary"]["exitCode"]


if __name__ == "__main__":
    sys.exit(main())
