#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""ortho_lint.py - deterministic Arabic orthography, punctuation, digit and dialect lint.

    ortho_lint.py (--text STRING | --file F | --spec FILE) [--dialect D] [--digits western|arabic-indic]
                  [--brand FILE] [--allow w1,w2] [--allow-file F] [--fix] [--no-autofix]
                  [--format table|json] [--out F]

A thin wrapper over _cs.lint.lint_text: it runs every rule of data/rules/ortho.json (hamza, taa
marbuta, yaa, merged words, hidden characters, digits, punctuation, bidi spacing, tatweel) plus
the dialect deny and warn lists of data/dialects/<dialect>.json.

* --spec FILE lints every text field of a spec (hook, slides, caption pack) and reports the
  slide id and the field (`el`) of each finding. The dialect and digits default to the spec's
  locale. With --fix the patched spec is written to --out (the input is never overwritten).
* --brand FILE adds brand.voice.allow to the allow-list and supplies the dialect and digits.
* --allow adds words the lint must not flag (the brand allow-list; «اللهجة كده صح»).
* --fix applies only issues marked autofix (Persian letters and digits, spacing, punctuation,
  mixed digits, tatweel, ellipsis dots, repeated marks, lam-Latin attach, hidden controls and direction marks).
  Hamza, taa marbuta, yaa, translationese and dialect words are suggestions: never applied.

JSON: {issues:[{rule,sev,confidence,original,fix,start,end,slide?,el?,autofix,msg}], fixed?,
summary:{status,counts,exitCode}, dialect, digits}. Exit codes: 0 clean (NOTE only), 1 FIX
findings pending, 2 BLOCK findings pending, 64 usage, 65 unparseable input, 66 missing input,
73 cannot write.
"""

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _cs import lint, paths  # noqa: E402

paths.ensure_utf8_stdio()

DIALECTS = ("eg", "gulf", "levant", "msa-white", "en")
SLIDE_TEXT_KEYS = ("kicker", "headline", "sub", "title", "body", "bridge", "attribution")


class Fail(Exception):
    def __init__(self, code, message, exit_code):
        super().__init__(message)
        self.code, self.exit_code = code, exit_code


class Parser(argparse.ArgumentParser):
    def error(self, message):
        sys.stderr.write("cs-error: E_USAGE: %s\n" % message)
        raise SystemExit(64)


# ----------------------------------------------------------------------------- spec walking
def iter_spec_fields(spec):
    yield from lint.iter_spec_fields(spec)


def set_spec_field(spec, slide_id, el, value):
    lint.set_spec_field(spec, slide_id, el, value)


# ----------------------------------------------------------------------------- core
def lint_text(text, **kwargs):
    """_cs.lint.lint_text, with the dialect-marker issues named after their QA check (O1.deny-marker, O1.warn-marker)."""
    issues = lint.lint_text(text, **kwargs)
    for issue in issues:
        if issue.get("kind") == "dialect" and not issue["rule"].startswith("O1."):
            issue["rule"] = "O1." + issue["rule"]
    return issues


def summarize(issues):
    counts = {"BLOCK": 0, "FIX": 0, "NOTE": 0}
    for i in issues:
        counts[i["sev"]] = counts.get(i["sev"], 0) + 1
    code = 2 if counts["BLOCK"] else 1 if counts["FIX"] else 0
    return {"status": ("block", "fix", "pass")[0 if code == 2 else 1 if code == 1 else 2], "counts": counts, "exitCode": code}


def load_allow(args, brand):
    allow = [w.strip() for w in (args.allow or "").split(",") if w.strip()]
    if args.allow_file:
        p = Path(args.allow_file)
        if not p.exists():
            raise Fail("E_USAGE", "allow file %s not found" % p, 66)
        allow += [ln.strip() for ln in paths.read_text(p).splitlines() if ln.strip() and not ln.startswith("#")]
    if brand:
        allow += list((brand.get("voice") or {}).get("allow") or [])
        allow += list((brand.get("locale") or {}).get("latinTerms") or [])
    return list(dict.fromkeys(allow))


def read_json_file(path, label):
    p = Path(path)
    if not p.exists():
        raise Fail("E_USAGE", "%s %s not found" % (label, p), 66)
    try:
        return paths.read_json(p)
    except ValueError as exc:
        raise Fail("E_SCHEMA", "cannot parse %s: %s" % (p, exc), 65)


def run(args):
    brand = read_json_file(args.brand, "brand") if args.brand else None
    spec = read_json_file(args.spec, "spec") if args.spec else None
    locale = (spec or {}).get("locale") or (brand or {}).get("locale") or {}
    dialect = args.dialect or locale.get("dialect")
    digits = args.digits or locale.get("digits") or "western"
    if not dialect:
        raise Fail("E_USAGE", "--dialect is required (or give --spec / --brand to take it from the locale)", 64)
    allow = load_allow(args, brand)
    issues, fixed, applied = [], None, []

    if spec is not None:
        patched = json.loads(json.dumps(spec))
        for slide_id, el, text, kashida in iter_spec_fields(spec):
            checked = lint.check_text(text, autofix=args.fix, checker=lambda value: lint_text(value, dialect=dialect, digits=digits, allow=allow, kashida_word=kashida) if lint.copy_field(slide_id, el) else lint.encoding_issues(value))
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
        checked = lint.check_text(text, autofix=args.fix, checker=lambda value: lint_text(value, dialect=dialect, digits=digits, allow=allow))
        fixed = checked["fixed"] if args.fix else None
        issues, applied = checked["issues"], checked["applied"]
    return {"issues": issues, "applied": applied, "fixed": fixed, "summary": summarize(issues), "dialect": dialect, "digits": digits}


def where(issue):
    if "el" in issue:
        return "%s·%s" % (issue.get("slide", "-"), issue["el"])
    return "%d-%d" % (issue["start"], issue["end"])


def render_table(result):
    rows = ["| sev | rule | original | fix | conf | where |", "|---|---|---|---|---|---|"]
    for i in result["issues"]:
        rows.append("| %s | %s | %s | %s | %.2f | %s |" % (
            i["sev"], i["rule"], (i["original"] or "").replace("|", "\\|").replace("\n", " "),
            (i["fix"] or "").replace("|", "\\|").replace("\n", " "), i.get("confidence", 1.0), where(i)))
    s = result["summary"]
    rows.append("Applied %d safe repairs." % len(result.get("applied", [])))
    rows.append("")
    rows.append("%s  BLOCK=%d FIX=%d NOTE=%d  (dialect %s, digits %s)"
                % (s["status"].upper(), s["counts"]["BLOCK"], s["counts"]["FIX"], s["counts"]["NOTE"],
                   result["dialect"], result["digits"]))
    return "\n".join(rows)


def main(argv=None):
    ap = Parser(prog="ortho_lint.py", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument("--text", help="the copy to check")
    src.add_argument("--file", help="UTF-8 text file")
    src.add_argument("--spec", help="spec.json: lint every text field")
    ap.add_argument("--dialect", choices=DIALECTS)
    ap.add_argument("--digits", choices=("western", "arabic-indic"))
    ap.add_argument("--brand", help="brand.json: dialect, digits and voice.allow")
    ap.add_argument("--allow", help="comma separated words the lint must not flag")
    ap.add_argument("--allow-file", help="one allowed word per line")
    ap.add_argument("--fix", action="store_true", help="apply safe repairs and re-check the result")
    ap.add_argument("--no-autofix", action="store_true", help="disable safe repairs, including with --fix")
    ap.add_argument("--format", choices=("table", "json"), default="table")
    ap.add_argument("--out", help="write the fixed text (or patched spec) here")
    args = ap.parse_args(argv)
    args.fix = args.fix and not args.no_autofix
    try:
        result = run(args)
        if args.out and args.fix:
            try:
                if isinstance(result["fixed"], dict):
                    paths.write_text(args.out, lint.json_text(result["fixed"], indent=2) + "\n")
                else:
                    paths.write_text(args.out, result["fixed"] if result["fixed"].endswith("\n") else result["fixed"] + "\n")
            except OSError as exc:
                raise Fail("E_ABORTED", "cannot write %s: %s" % (args.out, exc), 73)
        elif args.fix and args.spec and not args.out:
            raise Fail("E_USAGE", "--fix with --spec needs --out (the input spec is never overwritten)", 64)
    except Fail as exc:
        sys.stderr.write("cs-error: %s: %s\n" % (exc.code, exc))
        return exc.exit_code
    if args.format == "json":
        out = {k: v for k, v in result.items() if not (k == "fixed" and v is None)}
        print(lint.json_text(out))
    else:
        print(render_table(result))
        if isinstance(result["fixed"], str) and not args.out:
            print("\n" + result["fixed"])
    return result["summary"]["exitCode"]


if __name__ == "__main__":
    sys.exit(main())
