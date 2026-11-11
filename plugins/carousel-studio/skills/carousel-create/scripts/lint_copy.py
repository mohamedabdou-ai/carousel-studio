#!/usr/bin/env python3
"""lint_copy.py: run the text quality gates on a whole spec or on one piece of copy.

A thin wrapper over `_cs.qa.run_text_gates` (the same engine that
`validate.py spec --lint` and the Studio's Check screen use), so a verdict here
matches the verdict anywhere else.  The rules and word lists live in
data/qa-rules.json and data/rules/*.json; this script holds no rule of its own.

Usage
    lint_copy.py --spec FILE [--dialect D] [--digits western|arabic-indic]
                 [--brand FILE] [--history FILE] [--gates C1,C2,...] [--fast]
    lint_copy.py --text STRING --role cover|rehook|title|body|bullet|caption|alt
                 [--dialect D] [--digits ...] [--gates ...] [--fast]
    common: [--format text|json] [--lang ar|en]

--spec     lints the whole post (every text gate: C1-C9, O1, N1, B1, SRC1, SEN1).
--text     lints one fragment in isolation.  The fragment is placed in a throw-away
           spec and only the gates that make sense for that role run (cover: C1,
           C8, O1, N1, B1, SEN1 ...), so structural findings about a post that does
           not exist are never reported.  Number sources (SRC1) need a real spec.
--history  a JSON file: a brand.json (its hooks.history is used), an object with a
           "history" list, or the list itself (last posts, newest last).
--fast     fast mode: the caption may be short (flagged as a NOTE, not a FIX).

JSON output: {"results": [QAResult], "summary": {"status", "counts", "exitCode"}}.
Exit codes: 0 pass (NOTEs allowed), 1 FIX pending, 2 BLOCK, 64 usage error,
65 unreadable JSON, 66 input missing, 70 the shared _cs package is unavailable.
"""
import argparse
import copy
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
try:
    from _cs import paths
except ImportError as exc:      # the shared package is synced next to the scripts; say so plainly
    sys.stderr.write("cs-error: E_DEP_LOAD: the shared _cs package is missing next to this script: %s\n" % exc)
    sys.exit(70)

paths.ensure_utf8_stdio()

ROLES = ("cover", "rehook", "title", "body", "bullet", "caption", "alt")
DIALECTS = ("eg", "gulf", "levant", "msa-white", "en")
DIGIT_SYSTEMS = ("western", "arabic-indic")

TEXT_GATES = ("C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8", "C9", "C10", "O1", "N1", "B1", "SRC1", "SEN1")

# Gates that are meaningful for one fragment.  C4-C7 need a whole post; SRC1 needs sources.
ROLE_GATES = {
    "cover": ["C1", "C8", "O1", "N1", "B1", "SEN1"],
    "rehook": ["C3", "C8", "O1", "N1", "B1", "SEN1"],
    "title": ["C2", "C8", "O1", "N1", "B1", "SEN1"],
    "body": ["C2", "C8", "O1", "N1", "B1", "SEN1"],
    "bullet": ["C2", "C8", "O1", "N1", "B1", "SEN1"],
    "caption": ["C9", "C8", "O1", "N1", "B1", "SEN1"],
    "alt": ["C9", "O1", "N1", "B1"],
}
# Inside C9 a fragment can only answer some questions: a caption alone cannot be compared
# with a cover, and neither a caption nor an alt text can say which slides are missing theirs.
C9_RULES_FOR_ROLE = {
    "caption": {"C9.length", "C9.short-caption", "C9.length-hard", "C9.first-line", "C9.keyword-line",
                "C9.hashtags", "C9.hashtags-form"},
    "alt": {"C9.alt-length", "C9.alt-length-hard"},
}
# The slide the fragment is written into (s01 for a cover, s02 for everything else).
TARGET_SLIDE = {"cover": "s01", "rehook": "s02", "title": "s02", "body": "s02", "bullet": "s02"}

HASHTAG_RE = re.compile(r"#[^\s#<>]+")


class _Parser(argparse.ArgumentParser):
    def error(self, message):
        sys.stderr.write("cs-error: E_USAGE: %s\n" % message)
        sys.exit(64)


def build_parser():
    p = _Parser(prog="lint_copy.py", description="Run the Carousel Studio text gates on a spec or on one piece of copy.",
                epilog="Spec forms: validate.py spec <file> --lint; cta.kind: save, send, question, keyword-dm, follow (sharing is send). "
                       "sources[].kind: url, file, user, ownData, calc. style.overrides: dotted token paths to scalar string/number/boolean, not [min,max]. "
                       "captionPack keys: firstLine, keywordLine, body, cta, hashtags, perSlide, alt, asset; sourceIds belong on slides.")
    src = p.add_mutually_exclusive_group(required=True)
    src.add_argument("--spec", help="spec.json to lint")
    src.add_argument("--text", help="one fragment (needs --role); cover hero is the first beat before ?, ؟, !, …, ..., : or a newline")
    p.add_argument("--role", choices=ROLES, help="what the --text fragment is")
    p.add_argument("--dialect", choices=DIALECTS, help="override the spec's dialect (default: the spec's; eg for --text)")
    p.add_argument("--digits", choices=DIGIT_SYSTEMS, help="override the digit system (default: the spec's; western for --text)")
    p.add_argument("--brand", help="brand.json (voice allow-list, history, dialect)")
    p.add_argument("--history", help="recent posts for the repetition gate (see --help header)")
    p.add_argument("--gates", help="comma-separated gate ids to run, for example C1,C2,N1")
    p.add_argument("--fast", action="store_true", help="fast mode: a short caption is allowed")
    p.add_argument("--format", choices=("text", "json"), default="text", help="output format (default: text)")
    p.add_argument("--lang", choices=("ar", "en"), default="ar", help="language of the messages in text output (default: ar)")
    return p


# --------------------------------------------------------------------------
# input
# --------------------------------------------------------------------------


def fail(code, message, exit_code):
    sys.stderr.write("cs-error: %s: %s\n" % (code, message))
    sys.exit(exit_code)


def load_json(path, what):
    p = Path(path)
    if not p.is_file():
        fail("E_USAGE", "%s not found: %s" % (what, path), 66)
    try:
        return paths.read_json(p)
    except ValueError as exc:
        fail("E_USAGE", "%s is not valid JSON: %s" % (what, exc), 65)


def load_history(path):
    data = load_json(path, "history file")
    if isinstance(data, list):
        return {"history": data}
    if isinstance(data, dict) and isinstance(data.get("history"), list):
        return {"history": data["history"]}
    if isinstance(data, dict) and isinstance(data.get("hooks"), dict):
        return {"history": list(data["hooks"].get("history") or [])}
    fail("E_USAGE", "history file must be a list, an object with 'history', or a brand.json", 65)


# --------------------------------------------------------------------------
# the throw-away spec for --text
# --------------------------------------------------------------------------


def skeleton_spec(dialect, digits, fast):
    english = dialect == "en"
    return {
        "specVersion": 1, "id": "post-lint-text-0001", "rev": 1, "brand": {"slug": "lint-text"},
        "format": "carousel", "mode": "fast" if fast else "guided", "checkpoint": "script",
        "canvas": {"preset": "ig-3x4", "w": 1080, "h": 1440, "safe": [34, 45, 1012, 1350], "exports": ["3x4", "4x5"]},
        "locale": {"dialect": dialect, "register": "dialect" if dialect in ("eg", "gulf", "levant") else "white",
                   "digits": digits, "appLanguage": "en" if english else "ar",
                   "swipeCue": "arrow-ltr" if english else "arrow-rtl"},
        "style": {"presetId": "swiss@1.0"},
        "slides": [], "sources": [],
    }


def split_caption(text):
    """Caption fragment to captionPack fields: line 1, line 2, the rest, hashtags."""
    tags = HASHTAG_RE.findall(text)
    stripped = HASHTAG_RE.sub("", text)
    lines = [ln.strip() for ln in stripped.split("\n") if ln.strip()]
    pack = {"firstLine": lines[0] if lines else "", "keywordLine": lines[1] if len(lines) > 1 else "",
            "body": "\n".join(lines[2:]), "cta": "", "hashtags": list(dict.fromkeys(tags))[:5]}
    return pack


def spec_for_text(text, role, dialect, digits, fast):
    spec = skeleton_spec(dialect, digits, fast)
    filler_cover = {"id": "s01", "n": 1, "type": "cover", "headline": "x"}
    filler_item = {"id": "s02", "n": 2, "type": "item", "title": "x", "body": "x"}
    if role == "cover":
        spec["slides"] = [{"id": "s01", "n": 1, "type": "cover", "headline": text}, filler_item]
    elif role == "rehook":
        spec["slides"] = [filler_cover, {"id": "s02", "n": 2, "type": "rehook", "headline": text}]
    elif role == "title":
        spec["slides"] = [filler_cover, {"id": "s02", "n": 2, "type": "item", "title": text, "body": "x"}]
    elif role == "body":
        spec["slides"] = [filler_cover, {"id": "s02", "n": 2, "type": "item", "title": "x", "body": text}]
    elif role == "bullet":
        bullets = [ln.strip() for ln in text.split("\n") if ln.strip()] or [text]
        spec["slides"] = [filler_cover, {"id": "s02", "n": 2, "type": "item", "title": "x", "bullets": bullets}]
    else:
        spec["slides"] = [filler_cover, filler_item]
        if role == "caption":
            spec["captionPack"] = split_caption(text)
        else:
            spec["captionPack"] = {"alt": [text]}
    return spec


def keep_result(result, role):
    """For --text: drop findings about the filler slides and about fields the fragment cannot have."""
    target = TARGET_SLIDE.get(role)
    slide = result.get("slide")
    if target is not None and slide not in (None, target):
        return False
    if target is None and slide is not None:          # caption / alt findings belong to the pack, not to a slide
        return False
    if result.get("gate") == "C9":
        return result.get("rule") in C9_RULES_FOR_ROLE.get(role, set())
    return True


# --------------------------------------------------------------------------
# run and report
# --------------------------------------------------------------------------


def summarize(qa, results):
    try:
        return qa.summarize(results)
    except Exception:                                  # keep the CLI usable if the helper's shape changes
        counts = {"BLOCK": 0, "FIX": 0, "NOTE": 0}
        for r in results:
            if not r.get("overridden"):
                counts[r.get("sev", "NOTE")] = counts.get(r.get("sev", "NOTE"), 0) + 1
        status = "block" if counts["BLOCK"] else "fix" if counts["FIX"] else "pass"
        return {"status": status, "counts": counts, "exitCode": {"pass": 0, "fix": 1, "block": 2}[status]}


def pick_msg(msg, lang):
    if isinstance(msg, dict):
        return msg.get(lang) or msg.get("en") or msg.get("ar") or ""
    return str(msg or "")


def render_text(results, summary, lang):
    c = summary["counts"]
    head = "lint_copy  status=%s  BLOCK=%d FIX=%d NOTE=%d" % (summary["status"], c.get("BLOCK", 0), c.get("FIX", 0), c.get("NOTE", 0))
    lines = [head]
    order = {"BLOCK": 0, "FIX": 1, "NOTE": 2}
    for r in sorted(results, key=lambda r: (order.get(r.get("sev"), 3), r.get("slide") or "", r.get("rule") or r.get("gate", ""))):
        where = " ".join(x for x in (r.get("slide"), r.get("el")) if x)
        lines.append("%-5s %s %s : %s" % (r.get("sev"), r.get("rule") or r.get("gate"), where, pick_msg(r.get("msg"), lang)))
        fix = pick_msg(r.get("fix"), lang)
        if fix:
            lines.append("      -> %s" % fix)
        if r.get("overridden"):
            lines.append("      (overridden: %s)" % r["overridden"].get("reason", ""))
    return "\n".join(lines) + "\n"


def main(argv=None):
    args = build_parser().parse_args(argv)
    if args.text is not None and not args.role:
        fail("E_USAGE", "--text needs --role", 64)
    if args.spec and args.role:
        fail("E_USAGE", "--role is only for --text", 64)

    try:
        from _cs import qa
    except ImportError as exc:
        fail("E_DEP_LOAD", "the shared _cs package (qa module) is not available: %s" % exc, 70)

    gates = [g.strip().upper() for g in args.gates.split(",") if g.strip()] if args.gates else None
    if gates:
        unknown = [g for g in gates if g not in TEXT_GATES]
        if unknown:
            fail("E_USAGE", "unknown text gate(s): %s (text gates: %s)" % (", ".join(unknown), ", ".join(TEXT_GATES)), 64)

    brand = load_json(args.brand, "brand file") if args.brand else None
    history = load_history(args.history) if args.history else None

    if args.spec:
        spec = copy.deepcopy(load_json(args.spec, "spec file"))
        locale = spec.setdefault("locale", {})
        if args.dialect:
            locale["dialect"] = args.dialect
        if args.digits:
            locale["digits"] = args.digits
        role = None
    else:
        role = args.role
        spec = spec_for_text(args.text, role, args.dialect or "eg", args.digits or "western", args.fast)
        if gates is None:
            gates = list(ROLE_GATES[role])

    results = qa.run_text_gates(spec, brand, gates=gates, fast=args.fast, history=history)
    if role:
        results = [r for r in results if keep_result(r, role)]
    summary = summarize(qa, results)

    if args.format == "json":
        sys.stdout.write(json.dumps({"results": results, "summary": summary}, ensure_ascii=False, indent=2) + "\n")
    else:
        sys.stdout.write(render_text(results, summary, args.lang))
    return summary["exitCode"]


if __name__ == "__main__":
    sys.exit(main())
