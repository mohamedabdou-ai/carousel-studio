#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""bidi_lint.py - text-level digit and bidirectional-text checks (gates N1 and B1, text scope).

    bidi_lint.py (--text STRING | --file F | --spec FILE) [--digits western|arabic-indic]
                 [--dialect D] [--fix] [--no-autofix] [--format table|json] [--out F]

Runs the built-in checks mixed-digits, persian-digits, percent-sign, lam-latin-stranded,
hidden controls, unassigned characters and digit-glued-to-word of data/rules/ortho.json, plus one check of its
own: the digit system must equal the locale's (N1.system). Findings carry the QA gate they
belong to:

    N1.mixed        two digit systems in one text            (BLOCK, autofix)
    N1.persian      U+06F0-06F9 digits                       (BLOCK, autofix)
    N1.system       digits differ from locale.digits         (BLOCK, autofix)
    N1.percent      % beside Arabic-Indic or the reverse     (BLOCK, autofix)
    B1.stranded-lam a prefix (لـ/بـ/الـ) split from its Latin word (BLOCK, autofix)
    O1.ortho-enc-007 hidden control characters             (BLOCK, autofix)
    O1.ortho-enc-008 unassigned characters or surrogates    (BLOCK, review)
    O1.glued-digit  a digit glued to an Arabic word          (FIX, autofix)

Rendered-isolation checks (contiguous <bdi> runs, bound pairs on one line) need the Studio
and are not run here. Plain spaces are valid number/noun copy. --fix runs the shared safe repair/check loop (spec: patched copy to --out); --no-autofix disables it.

JSON: {issues:[{gate,gateRule,rule,sev,confidence,original,fix,start,end,slide?,el?,autofix,msg}],
fixed?, applied:[{before,after,rules,slide?,el?}], summary:{status,counts,exitCode}, digits}. Exit codes: 0 clean, 1 FIX pending,
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
    "invalid-codepoint": ("O1", "O1.ortho-enc-007"),
    "unassigned-codepoint": ("O1", "O1.ortho-enc-008"),
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
    for sid, el, value, _kw in lint.iter_spec_fields(spec):
        yield sid, el, value


def set_spec_field(spec, slide_id, el, value):
    lint.set_spec_field(spec, slide_id, el, value)


def bidi_rule_map():
    """Rule ids of the supported built-in checks, read from ortho.json."""
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
    issues, fixed, applied = [], None, []
    if spec is not None:
        patched = json.loads(json.dumps(spec))
        for slide_id, el, text in iter_spec_fields(spec):
            checked = lint.check_text(text, autofix=args.fix, checker=lambda value: [f for f in check_text(value, digits, dialect, rule_checks) if lint.copy_field(slide_id, el) or f["gateRule"] in ("O1.ortho-enc-007", "O1.ortho-enc-008")])
            found = checked["issues"]
            applied += [{**change, "el": el, **({"slide": slide_id} if slide_id else {})} for change in checked["applied"]]
            for f in found:
                f["el"] = el
                if slide_id:
                    f["slide"] = slide_id
            if args.fix:
                new = checked["fixed"]
                if new != text:
                    set_spec_field(patched, slide_id, el, new)
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
        checked = lint.check_text(text, autofix=args.fix, checker=lambda value: check_text(value, digits, dialect, rule_checks))
        fixed = checked["fixed"] if args.fix else None
        issues, applied = checked["issues"], checked["applied"]
    return {"issues": issues, "applied": applied, "fixed": fixed, "summary": summarize(issues), "digits": digits}


def render_table(result):
    rows = ["| gate | sev | original | fix | where |", "|---|---|---|---|---|"]
    for i in result["issues"]:
        where = "%s·%s" % (i.get("slide", "-"), i["el"]) if "el" in i else "%d-%d" % (i["start"], i["end"])
        rows.append("| %s | %s | %s | %s | %s |" % (i["gateRule"], i["sev"], (i["original"] or "").replace("|", "\\|"),
                                                   (i["fix"] or "").replace("|", "\\|"), where))
    s = result["summary"]
    rows.append("Applied %d safe repairs." % len(result.get("applied", [])))
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
    ap.add_argument("--no-autofix", action="store_true", help="disable safe repairs, including with --fix")
    ap.add_argument("--format", choices=("table", "json"), default="table")
    ap.add_argument("--out", help="write the fixed text (or patched spec) here")
    args = ap.parse_args(argv)
    args.fix = args.fix and not args.no_autofix
    try:
        result = run(args)
        if args.fix and args.spec and not args.out:
            raise Fail("E_USAGE", "--fix with --spec needs --out (the input spec is never overwritten)", 64)
        if args.out and args.fix:
            try:
                if isinstance(result["fixed"], dict):
                    paths.write_text(args.out, lint.json_text(result["fixed"], indent=2) + "\n")
                else:
                    paths.write_text(args.out, result["fixed"] if result["fixed"].endswith("\n") else result["fixed"] + "\n")
            except OSError as exc:
                raise Fail("E_ABORTED", "cannot write %s: %s" % (args.out, exc), 73)
    except Fail as exc:
        sys.stderr.write("cs-error: %s: %s\n" % (exc.code, exc))
        return exc.exit_code
    if args.format == "json":
        print(lint.json_text({k: v for k, v in result.items() if not (k == "fixed" and v is None)}))
    else:
        print(render_table(result))
        if isinstance(result["fixed"], str) and not args.out:
            print("\n" + result["fixed"])
    return result["summary"]["exitCode"]


if __name__ == "__main__":
    sys.exit(main())
