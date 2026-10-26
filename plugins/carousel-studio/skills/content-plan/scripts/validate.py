#!/usr/bin/env python3
"""validate.py: check a Carousel Studio document against its schema, its checkpoint and (for a spec) the text gates.

    validate.py <kind> <file|-> [--checkpoint angle|script|design|ready|exported] [--lint]
                [--brand FILE] [--history FILE] [--def NAME] [--format text|json] [--out FILE]

kind         brand | spec | preset | occasion | hook | hook-library | plan | qa-report
--checkpoint (spec) also check what the checkpoint requires beyond the schema (CONTRACT 8.1)
--lint       (spec) run the text quality gates (needs the qa module of the shared _cs package)
--brand      brand.json, used by the lint (voice allow-list, history) and by the checkpoint check
--history    recent posts for the repetition gate: a list, {"history": [...]} or a brand.json
--def NAME   validate against $defs/NAME of the schema instead of its root
--out FILE   also write the JSON report to FILE

JSON output: {ok, kind, file, errors:[{path,keyword,message}], structure:[{path,message}], notes:[{path,code,message}],
qa?:{status,counts,results}}. A note is advice, never a failure: it changes neither ``ok`` nor the exit code.
A slide with ``free`` (the free design lane, data/free-design.json) is also checked against the contract on every run: a refusal is a
``structure`` finding at ``/slides/N/free/html`` or ``/slides/N/free/css``, badly nested markup is a note.
Exit codes: 0 ok, 1 FIX findings pending, 2 schema or structure invalid / BLOCK findings, 64 usage, 65 unparseable JSON,
66 input missing, 70 internal.
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
try:
    from _cs import CSError, paths, schema, text as cs_text  # noqa: E402
except ImportError as exc:  # the shared package is synced next to the scripts; say so plainly
    sys.stderr.write("cs-error: E_DEP_LOAD: the shared _cs package is missing next to this script: %s\n" % exc)
    sys.exit(70)

paths.ensure_utf8_stdio()

KINDS = ("brand", "spec", "preset", "occasion", "hook", "hook-library", "plan", "qa-report")
CHECKPOINTS = ("angle", "script", "design", "ready", "exported")

# Fields every slide of a type must carry at checkpoint "script" (CONTRACT 5.3, column "req").
REQUIRED_FIELDS = {
    "cover": ("headline",), "rehook": ("headline",), "item": ("title", "body"), "step": ("title",), "stat": ("number", "title"),
    "compare": ("sides",), "myth-fact": ("sides",), "quote": ("body",), "story-beat": ("body",), "checklist": ("title", "bullets"),
    "summary": ("title", "bullets"), "setup": ("title", "bullets"), "proof": ("media",), "share": ("headline",),
    "cta": ("title", "cta"), "offer": ("title", "cta"), "testimonial": ("body", "attribution"), "poster": ("headline",),
    "grid": ("title", "items"),
    "timeline": ("title", "items"),
}

# Rules of the list fields (CONTRACT 5.3 and 8.1; visual language 3.4 and 4.4). They add to REQUIRED_FIELDS, never replace it.
ITEM_COUNT = {"grid": (3, 6), "timeline": (3, 5)}      # outer bounds of the type (plugin.visual.plan.valid.itemsByType)
# A named look narrows the range (visual language 4.4): bento 3 to 4 cards, tiles 5 to 6, rail 3 to 4 nodes. The shipped VA3.valid
# (src/qa-visual/spec-gates.js) refuses more than four items in a bento or a rail the same way. Without a variant the outer bounds apply.
VARIANT_ITEMS = {("grid", "bento"): (3, 4), ("grid", "tiles"): (5, 6), ("timeline", "rail"): (3, 4)}
# A fifth timeline node (pitch 140 where a rail needs 165) is allowed on a timeline without a named look, and only when nothing else
# competes for the height: no bridge, and every node text fits one line: no line break, at most 4 words (the node limit of 4.4) and
# 28 characters (the text column of a node is about 610 px wide: 28 characters at 44 px). The rendered gate D6.lines measures the real line.
COMPACT_NODES = 5
ONE_LINE = {"words": 4, "chars": 28}
ONE_HERO = ("grid", "timeline")                         # at most one item with hi: the hero card, the key node
DEMO_TYPES = ("step", "story-beat", "setup", "share", "testimonial")   # Copywriter output; cta only when its kind is keyword-dm
# Kept equal to params.needsDemo of C2.demo-missing in qa-rules.json (a test reads both). A step without demo is a NOTE at first;
# DEMO_REQUIRED = True makes it a structure problem at checkpoint script (the day the planner no longer falls back to a non-mock anchor).
DEMO_NOTE = "C2.demo-missing"
DEMO_REQUIRED = False


class _Parser(argparse.ArgumentParser):
    def error(self, message):
        sys.stderr.write("cs-error: E_USAGE: %s\n" % message)
        sys.exit(64)


def build_parser():
    p = _Parser(prog="validate.py", description="Validate a Carousel Studio document (schema, checkpoint, text gates).")
    p.add_argument("kind", choices=KINDS, help="document kind")
    p.add_argument("file", help="path of the JSON document, or - for stdin")
    p.add_argument("--checkpoint", choices=CHECKPOINTS, help="spec: also check the completeness required at this checkpoint")
    p.add_argument("--lint", action="store_true", help="spec: run the text quality gates")
    p.add_argument("--brand", help="brand.json for the lint / the checkpoint check")
    p.add_argument("--history", help="recent posts for the repetition gate")
    p.add_argument("--def", dest="def_name", help="validate against $defs/NAME of the schema")
    p.add_argument("--format", choices=("text", "json"), default="text", help="output format (default: text)")
    p.add_argument("--out", help="also write the JSON report to this file")
    return p


def fail(code, message, exit_code):
    sys.stderr.write("cs-error: %s: %s\n" % (code, message))
    sys.exit(exit_code)


def read_document(name, what):
    if name == "-":
        try:
            return json.loads(sys.stdin.read())
        except ValueError as exc:
            fail("E_SCHEMA", "%s on stdin is not valid JSON: %s" % (what, exc), 65)
    p = Path(name)
    if not p.is_file():
        fail("E_USAGE", "%s not found: %s" % (what, name), 66)
    try:
        return paths.read_json(p)
    except ValueError as exc:
        fail("E_SCHEMA", "%s is not valid JSON: %s" % (what, exc), 65)
    except OSError as exc:
        fail("E_USAGE", "%s cannot be read: %s" % (what, exc), 66)


def is_filled(v):
    return isinstance(v, str) and v.strip() != ""


# ---- checkpoint completeness (CONTRACT 8.1) ---------------------------------------------------------------------------------


def one_line(text):
    """Does a node text fit one line of the compact rail? No text at all does."""
    if text is None or text == "":
        return True
    if not isinstance(text, str) or "\n" in text.strip():
        return False
    return cs_text.word_count(text) <= ONE_LINE["words"] and cs_text.char_count(cs_text.strip_markup(text)) <= ONE_LINE["chars"]


def item_count_problem(slide, items):
    """Why the number of items does not suit the slide, or None. The range is the type's, narrowed by a named look (bento, tiles,
    rail); a fifth timeline node is the compact exception and needs no bridge and one-line texts."""
    kind, variant, n = slide.get("type"), slide.get("variant"), len(items)
    named = isinstance(variant, str) and (kind, variant) in VARIANT_ITEMS
    lo, hi = VARIANT_ITEMS[(kind, variant)] if named else ITEM_COUNT[kind]
    if not lo <= n <= hi:
        return "a %s holds %d to %d items, this one holds %d" % ("%s (%s)" % (kind, variant) if named else kind, lo, hi, n)
    if kind == "timeline" and n >= COMPACT_NODES:
        why = []
        if is_filled(slide.get("bridge")):
            why.append("it has a bridge")
        long = [str(j + 1) for j, it in enumerate(items) if isinstance(it, dict) and not one_line(it.get("text"))]
        if long:
            why.append("the text of node %s is longer than one line" % ", ".join(long))
        if why:
            return "a timeline of %d nodes needs one-line texts and no bridge: %s" % (n, "; ".join(why))
    return None


def list_field_rules(slide, base, need):
    """Rules of ``items`` and ``demo`` on any slide, and of the item count on a grid or a timeline (``need(path, ok, message)``)."""
    kind = slide.get("type")
    items = slide.get("items")
    if isinstance(items, list) and items:
        titled = [isinstance(it, dict) and is_filled(it.get("title")) for it in items]
        for j, ok in enumerate(titled):
            need("%s/items/%d/title" % (base, j), ok, "item %d has no title" % (j + 1))
        if kind in ITEM_COUNT and any(titled):  # a list with no titled item is already reported by REQUIRED_FIELDS
            problem = item_count_problem(slide, items)
            need("%s/items" % base, problem is None, problem)
        if kind in ONE_HERO:
            marked = sum(1 for it in items if isinstance(it, dict) and it.get("hi") is True)
            need("%s/items" % base, marked <= 1, "only one item of a %s may be highlighted (hi), this one has %d" % (kind, marked))
    demo = slide.get("demo")
    if isinstance(demo, dict):
        lines = demo.get("lines")
        need("%s/demo/lines" % base, isinstance(lines, list) and len(lines) > 0, "the demo needs at least one line")
        for j, line in enumerate(lines if isinstance(lines, list) else ()):
            need("%s/demo/lines/%d/text" % (base, j), isinstance(line, dict) and is_filled(line.get("text")), "demo line %d has no text" % (j + 1))


def has_demo(slide):
    demo = slide.get("demo")
    lines = demo.get("lines") if isinstance(demo, dict) else None
    return isinstance(lines, list) and any(isinstance(ln, dict) and is_filled(ln.get("text")) for ln in lines)


def needs_demo(slide):
    """A step, story-beat, setup, share or testimonial, or a call to action of kind keyword-dm, is written with a demo."""
    keyword = slide.get("type") == "cta" and isinstance(slide.get("cta"), dict) and slide["cta"].get("kind") == "keyword-dm"
    return slide.get("type") in DEMO_TYPES or keyword


def note_checks(spec, checkpoint):
    """Advice that never fails a document: ``[{path, code, message}]``. From checkpoint script on, a slide whose type needs a
    ``demo`` (a step, a story-beat, a setup, a share, a testimonial, a keyword call to action) and has none gets ``C2.demo-missing``:
    the planner then draws no mock there. The text gate of that name takes over when ``--lint`` reports it. From checkpoint design
    on, an inner slide without ``free.html`` gets ``FREE.planner``: free design is the default and the planner the fallback."""
    out = []
    if CHECKPOINTS.index(checkpoint) < 1:
        return out
    for i, s in enumerate(spec.get("slides") or []):
        if isinstance(s, dict) and needs_demo(s) and not has_demo(s) and not DEMO_REQUIRED:
            out.append({"path": "/slides/%d/demo" % i, "code": DEMO_NOTE,
                        "message": "a %s slide should carry a demo (1 to 3 lines): without it the planner draws no mock" % (
                            "keyword cta" if s.get("type") == "cta" else s.get("type"))})
    if CHECKPOINTS.index(checkpoint) >= CHECKPOINTS.index("design"):
        for i, s in enumerate(spec.get("slides") or []):
            if isinstance(s, dict) and s.get("type") != "cover" and not (isinstance(s.get("free"), dict) and s["free"].get("html")):
                out.append({"path": "/slides/%d/free" % i, "code": "FREE.planner",
                            "message": "this inner slide has no free design, so the automatic planner lays it out (free design is the default: references/free-design.md)"})
    return out


def structure_checks(spec, checkpoint, brand=None):
    """Completeness beyond the schema. Returns [{path, message}]; checkpoints are cumulative."""
    out = []
    level = CHECKPOINTS.index(checkpoint)
    guided = spec.get("mode") != "fast"
    carousel = spec.get("format") != "single"

    def need(path, ok, message):
        if not ok:
            out.append({"path": path, "message": message})

    # angle
    need("/brand/slug", is_filled((spec.get("brand") or {}).get("slug")), "the brand slug is required")
    need("/brief/topic", is_filled((spec.get("brief") or {}).get("topic")), "the brief needs a topic")
    need("/angle", isinstance(spec.get("angle"), dict), "an angle must be chosen")
    if level < 1:
        return out
    slides = spec.get("slides") or []
    # script
    hook = spec.get("hook")
    need("/hook/cover", isinstance(hook, dict) and is_filled(hook.get("cover")), "the hook needs its cover text")
    for field in ("intent", "awareness", "contentType") + (("architecture",) if carousel else ()):
        need("/" + field, is_filled(spec.get(field)), "%s is required at checkpoint script" % field)
    need("/slides", len(slides) >= (2 if carousel else 1), "a %s needs at least %d slide(s)" % ("carousel" if carousel else "single post", 2 if carousel else 1))
    for i, s in enumerate(slides):
        if not isinstance(s, dict):
            continue
        for field in REQUIRED_FIELDS.get(s.get("type"), ()):
            v = s.get(field)
            if field == "sides":
                ok = isinstance(v, list) and len(v) == 2
            elif field == "bullets":
                ok = isinstance(v, list) and any(is_filled(b) for b in v)
            elif field == "items":
                ok = isinstance(v, list) and any(isinstance(it, dict) and is_filled(it.get("title")) for it in v)
            elif field in ("number", "cta", "media"):
                ok = isinstance(v, dict) and bool(v)
            else:
                ok = is_filled(v)
            need("/slides/%d/%s" % (i, field), ok, "a %s slide needs %s" % (s.get("type"), field))
        num = s.get("number")
        if isinstance(num, dict) and is_filled(num.get("value")):
            need("/slides/%d/sourceIds" % i, bool(s.get("sourceIds")) or bool(num.get("sourceId")), "the figure %s needs a source" % num.get("value"))
        list_field_rules(s, "/slides/%d" % i, need)
        if DEMO_REQUIRED and needs_demo(s):
            need("/slides/%d/demo" % i, has_demo(s), "a %s slide needs a demo (1 to 3 lines)" % s.get("type"))
    if guided:
        need("/approvals/angle", isinstance((spec.get("approvals") or {}).get("angle"), dict), "the angle has not been approved")
    if level < 2:
        return out
    # design
    pack = spec.get("captionPack")
    if not isinstance(pack, dict):
        need("/captionPack", False, "the caption pack is required at checkpoint design")
    else:
        for field in ("firstLine", "keywordLine", "body", "cta"):
            need("/captionPack/" + field, is_filled(pack.get(field)), "captionPack.%s is required" % field)
        need("/captionPack/hashtags", isinstance(pack.get("hashtags"), list), "captionPack.hashtags is required")
        for field in ("perSlide", "alt"):
            v = pack.get(field)
            need("/captionPack/" + field, isinstance(v, list) and len(v) == len(slides) and all(is_filled(x) for x in v),
                 "captionPack.%s needs one text per slide (%d)" % (field, len(slides)))
    need("/cover/motion", isinstance((spec.get("cover") or {}).get("motion"), dict), "cover.motion is required at checkpoint design")
    if guided:
        need("/approvals/script", isinstance((spec.get("approvals") or {}).get("script"), dict), "the script has not been approved")
    if level < 3:
        return out
    # ready
    if guided:
        need("/approvals/design", isinstance((spec.get("approvals") or {}).get("design"), dict), "the design has not been approved")
    frozen = spec.get("frozen")
    need("/frozen", isinstance(frozen, dict) and bool(frozen.get("tokensHash")) and bool(frozen.get("lines")) and bool(frozen.get("sizes")),
         "the approved layout is not frozen")
    qa = spec.get("qa")
    need("/qa/status", isinstance(qa, dict) and qa.get("status") in ("pass", "fix"), "the quality check must run and must not be blocked")
    if level < 4:
        return out
    # exported
    need("/qa/runAt", isinstance(qa, dict) and is_filled(qa.get("runAt")), "the export-scope quality check has not run")
    return out


# ---- lint ---------------------------------------------------------------------------------------------------------------------


def load_history(name):
    data = read_document(name, "history file")
    if isinstance(data, dict) and isinstance(data.get("hooks"), dict):
        data = data["hooks"].get("history") or []
    if isinstance(data, dict):
        data = data.get("history") or data.get("posts") or []
    return data if isinstance(data, list) else []


def run_lint(spec, brand, history):
    try:
        from _cs import qa
    except ImportError as exc:
        fail("E_DEP_LOAD", "--lint needs the qa module of the shared _cs package: %s" % exc, 70)
    results = qa.run_text_gates(spec, brand, history=history)
    summary = qa.summarize(results)
    return {"status": summary["status"], "counts": summary["counts"], "exitCode": summary["exitCode"], "results": results}


# ---- the free design lane -----------------------------------------------------------------------------------------------------


def free_checks(spec):
    """``(structure, notes)`` for the slides that carry ``free`` (data/free-design.json): the HTML and CSS of the hand-composed slide
    against the contract, and the rule that a cover never carries one. A spec without a free slide costs nothing."""
    slides = spec.get("slides") if isinstance(spec, dict) else None
    if not isinstance(slides, list) or not any(isinstance(s, dict) and s.get("free") is not None for s in slides):
        return [], []
    try:
        from _cs import free
    except ImportError as exc:
        fail("E_DEP_LOAD", "this spec has a free design slide and needs the free module of the shared _cs package: %s" % exc, 70)
    try:
        return free.check_spec(spec)
    except CSError as exc:
        fail(exc.code, str(exc), 70)


# ---- output -------------------------------------------------------------------------------------------------------------------


def render_text(report):
    lines = []
    head = "%s %s: %s" % (report["kind"], report["file"], "OK" if report["ok"] else "INVALID")
    lines.append(head)
    for e in report["errors"]:
        lines.append("  schema     %s  [%s] %s" % (e["path"] or "/", e["keyword"], e["message"]))
    for s in report["structure"]:
        lines.append("  structure  %s  %s" % (s["path"], s["message"]))
    for n in report.get("notes", ()):
        lines.append("  note       %s  [%s] %s" % (n["path"], n["code"], n["message"]))
    qa = report.get("qa")
    if qa:
        c = qa["counts"]
        lines.append("  quality    %s (BLOCK %d, FIX %d, NOTE %d)" % (qa["status"], c["block"], c["fix"], c["note"]))
        for r in qa["results"]:
            if r.get("overridden"):
                continue
            lines.append("    %-5s %s  %s %s" % (r["sev"], r.get("slide") or "-", r["rule"], r["msg"]["en"]))
    return "\n".join(lines) + "\n"


def main(argv=None):
    args = build_parser().parse_args(argv)
    if (args.checkpoint or args.lint) and args.kind != "spec":
        fail("E_USAGE", "--checkpoint and --lint apply to kind spec only", 64)
    doc = read_document(args.file, "document")
    brand = read_document(args.brand, "brand file") if args.brand else None
    history = load_history(args.history) if args.history else None

    try:
        errors = schema.validate_named(args.kind, doc, def_name=args.def_name)
    except CSError as exc:
        fail(exc.code, str(exc), 64 if exc.code == "E_USAGE" else 70)
    structure = structure_checks(doc, args.checkpoint, brand) if args.checkpoint and not errors else []
    free_structure, free_notes = free_checks(doc) if args.kind == "spec" and not errors else ([], [])
    structure += free_structure
    qa = run_lint(doc, brand, history) if args.lint and not errors else None
    notes = (note_checks(doc, args.checkpoint) if args.checkpoint and not errors else []) + free_notes
    if qa:  # a note whose text gate reported the same slide is not said twice
        said = {(r["rule"], r.get("slide")) for r in qa["results"]}
        notes = [n for n in notes if (n["code"], doc["slides"][int(n["path"].split("/")[2])].get("id")) not in said]

    report = {"ok": not errors and not structure and not (qa and qa["status"] == "block"), "kind": args.kind,
              "file": "<stdin>" if args.file == "-" else args.file, "errors": errors, "structure": structure, "notes": notes}
    if qa is not None:
        report["qa"] = qa
    if args.out:
        try:
            paths.write_json(args.out, report)
        except OSError as exc:
            fail("E_USAGE", "cannot write %s: %s" % (args.out, exc), 73)
    if args.format == "json":
        sys.stdout.write(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    else:
        sys.stdout.write(render_text(report))
    if errors or structure:
        return 2
    if qa:
        return qa["exitCode"]
    return 0


if __name__ == "__main__":
    sys.exit(main())
