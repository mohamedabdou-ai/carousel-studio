#!/usr/bin/env python3
"""Schema-checked, revision-aware edits to a finished spec. Intent is saved beside it in spec.edits.json.

Use --help or COMMAND --help. Exit 0/1/2 is the resulting QA status; a saved edit can leave BLOCKs to resolve.
Usage errors (64), malformed input (65), missing files (66), write failures (73) and conflicts (75) never replace the spec.
"""
from __future__ import annotations

import argparse
import copy
import json
import math
from pathlib import Path
import re
import sys

import script_to_spec as lane
from _cs import CSError, paths, schema, text as cstext

PRESETS = ("creator", "notebook", "poster", "swiss", "interface", "heritage")
FONT_IDS = ("ibm-plex-sans-arabic", "readex-pro", "alexandria", "playpen-sans-arabic", "noto-kufi-arabic", "reem-kufi",
            "el-messiri", "noto-sans-arabic", "cairo", "ibm-plex-sans", "inter")
# Same closed token paths and scalar values as core/resolve.js. No runtime access outside this skill.
ENUMS = {
    "layout.align": ("start", "center"), "layout.coverAnchor": ("top", "center"),
    "decor.highlight": ("bar", "underline", "marker", "color"), "decor.numbering": ("ghost", "pill", "plain"),
    "decor.texture": ("none", "grain", "ruled", "grid", "dots", "paper", "pattern"),
    "background.kind": ("solid", "gradient", "paper", "photo", "pattern"),
    "chrome.counter.format": ("{i} من {n}", "{i}/{n}", "{i}"),
    "chrome.swipe.style": ("label+chevron", "chevron", "label", "none"),
}
OVERRIDE_KEYS = (
    ["roles." + k for k in ("bg", "surface", "ink", "inkMuted", "accent", "accent2")]
    + ["type." + role + "." + field for role in ("display", "heading", "body") for field in ("family", "wght", "lh")]
    + ["type.latin.family", "type.latin.wght"]
    + ["type.scale." + k for k in ("hero", "heroTarget", "h1", "h2", "title", "body", "small", "micro", "numeral")]
    + list(ENUMS) + ["layout.headlineWidth", "decor.motif"]
)


def usage(message):
    raise CSError("E_USAGE", message)


def parser():
    def shared(default):
        """The options every command takes. Each parser gets its own copy: argparse shares the Action objects of a parent, so one
        copy with real defaults on the top parser would overwrite, in a sub-command, what was given before the command."""
        c = argparse.ArgumentParser(add_help=False)
        keep = argparse.SUPPRESS
        c.add_argument("--format", choices=("text", "json"), default="text" if default else keep)
        c.add_argument("--expect-rev", type=int, default=None if default else keep)
        c.add_argument("--brand", default=None if default else keep, help="brand.json for QA")
        # --spec is accepted before or after the command: `spec_edit.py show --spec F` is what people type first.
        c.add_argument("--spec", default=None if default else keep, help="the post's spec.json (before or after the command)")
        return c
    p = lane._Parser(description=__doc__, parents=[shared(True)])
    commands = p.add_subparsers(dest="command", required=True, parser_class=lane._Parser)
    def command(name, help_text):
        return commands.add_parser(name, help=help_text, parents=[shared(False)])
    command("show", "outline, word counts, style, sources and current QA")
    command("reset-record", "back up the saved edits and start a new record without changing the spec")
    style = command("style", "change the preset")
    style.add_argument("preset")
    cover = command("cover", "change the hook and its quotes in captions and alt text")
    cover.add_argument("--headline", required=True)
    cover.add_argument("--sub")
    cover.add_argument("--kicker")
    text = command("text", "change a slide's title, body or bridge")
    text.add_argument("slide")
    text.add_argument("--field", required=True, choices=("title", "body", "bridge"))
    text.add_argument("value", nargs="?")
    text.add_argument("--text")
    source = command("source", "add a source or explicitly attest the creator's figures")
    sources = source.add_subparsers(dest="action", required=True, parser_class=lane._Parser)
    add = sources.add_parser("add", parents=[shared(False)])
    ref = add.add_mutually_exclusive_group(required=True)
    ref.add_argument("--url")
    ref.add_argument("--ref")
    add.add_argument("--kind", choices=("url", "file", "user", "ownData", "calc"), default="url")
    add.add_argument("--label", help="source label (stored in location, as required by the schema)")
    add.add_argument("--excerpt")
    add.add_argument("--verified", action="store_true", help="only after the reference was verified")
    add.add_argument("--slide", action="append", nargs="+", required=True, help="stable slide ids or positions; repeat to attach to several")
    sources.add_parser("attest", parents=[shared(False)], help="only after the creator vouches for currently unsourced figures")
    alt = command("alt", "change one slide's alt text")
    alt.add_argument("slide")
    alt.add_argument("value")
    caption = command("caption", "change one caption pack field")
    caption.add_argument("--field", required=True, choices=("firstLine", "keywordLine", "body", "cta", "hashtags", "perSlide", "asset"))
    caption.add_argument("--slide")
    caption.add_argument("value", nargs="*")
    caption.add_argument("--keyword")
    caption.add_argument("--delivery", choices=("instant", "manual"))
    caption.add_argument("--description")
    cta = command("cta", "set the creator's closing line or record their choice to keep no CTA")
    kind = cta.add_mutually_exclusive_group(required=True)
    kind.add_argument("--kind", choices=("save", "send", "question", "keyword-dm", "follow"))
    kind.add_argument("--keep", action="store_true")
    for flag in ("text", "title", "slide", "keyword", "description", "reason"):
        cta.add_argument("--" + flag)
    cta.add_argument("--delivery", choices=("instant", "manual"))
    override = command("override", "set one supported scalar token override")
    override.add_argument("target", help="post or a slide id")
    override.add_argument("assignment", help="key=value; use --help for the command shape")
    keep = command("keep", "record the creator's decision on an overridable copy finding")
    keep.add_argument("rule", help="a rule id, optionally @sNN")
    keep.add_argument("--reason", default=lane.KEEP_REASON)
    apply = command("apply", "import approved design fields, assets or media from a JSON file")
    apply.add_argument("--file", required=True, help='{"post": {...}, "slides": {"s02": {...}}}; no ids, rev, frozen or QA fields')
    return p


def scalar_override(assignment):
    key, sep, raw = assignment.partition("=")
    if not sep or key not in OVERRIDE_KEYS:
        usage("unknown override key %s; valid keys: %s" % (key, ", ".join(sorted(OVERRIDE_KEYS))))
    try:
        value = json.loads(raw)
    except ValueError:
        value = raw
    if value is None or isinstance(value, (dict, list)) or (isinstance(value, float) and not math.isfinite(value)):
        usage("override values must be finite scalars (string, number or boolean)")
    valid = False
    numeric = isinstance(value, (int, float)) and not isinstance(value, bool)
    if key.startswith("roles."):
        valid = isinstance(value, str) and bool(re.fullmatch(r"#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?", value))
    elif key in ENUMS:
        valid = value in ENUMS[key]
    elif key.endswith(".family"):
        valid = value in FONT_IDS
    elif key.endswith(".wght"):
        valid = numeric and 100 <= value <= 900
    elif key.endswith(".lh"):
        valid = numeric and 1 <= value <= 2.2
    elif key.startswith("type.scale."):
        valid = numeric and 12 <= value <= (640 if key == "type.scale.numeral" else 400)
        if isinstance(value, str) and key not in ("type.scale.heroTarget", "type.scale.small", "type.scale.micro"):
            pieces = re.split(r"[\s,;\-–—]+", value.strip())
            try:
                numbers = [float(n) for n in pieces]
                valid = len(numbers) in (1, 2) and min(numbers) >= 12 and max(numbers) <= (640 if key == "type.scale.numeral" else 400)
            except ValueError:
                valid = False
    elif key == "layout.headlineWidth":
        try:
            values = [float(v) for v in re.split(r"[\s,;]+", value.strip())] if isinstance(value, str) else []
            valid = len(values) == 2 and 0.5 <= values[0] <= values[1] <= 1
        except ValueError:
            valid = False
    elif key == "decor.motif":
        valid = value is False or (isinstance(value, str) and (value == "" or bool(re.fullmatch(r"[a-z0-9][a-z0-9-]{0,39}", value))))
    if not valid:
        usage("invalid value for %s%s" % (key, "; valid values: " + ", ".join(ENUMS[key]) if key in ENUMS else ""))
    return key, value


def edit_for(args, spec):
    digits = spec["locale"]["digits"]
    def text(value):
        return cstext.convert_digits(value, digits)
    def fields(slide, values):
        return {"kind": "fields", "slides": {slide["id"]: values}}
    if args.command == "style":
        name, _, version = args.preset.partition("@")
        if name not in PRESETS or (version and version != "1.0"):
            usage("unknown preset; valid presets: %s" % ", ".join(PRESETS))
        return {"kind": "fields", "post": {"style": {"presetId": name + "@1.0"}}}
    if args.command == "cover":
        cover = next((s for s in spec["slides"] if s["type"] in ("cover", "poster")), {})
        return {"kind": "cover", "fields": {k: text(getattr(args, k)) for k in ("headline", "sub", "kicker") if getattr(args, k) is not None},
                "original": {k: cover[k] for k in ("headline", "sub", "kicker") if cover.get(k)}}
    if args.command == "text":
        value = args.text if args.text is not None else args.value
        if value is None or (args.text is not None and args.value is not None):
            usage("supply the new text once, as a quoted argument or --text")
        slide = lane.find_slide(spec, args.slide)
        if args.field == "title" and slide["type"] in ("cover", "poster", "rehook", "share"):
            usage("this slide renders a headline; use cover for the cover hook")
        return fields(slide, {args.field: text(value)})
    if args.command == "source":
        if args.action == "attest":
            return lane.attestation_edit(spec)
        kind = "url" if args.url else args.kind
        ref = args.url or args.ref
        if kind == "url":
            ref = lane.normalize_url(ref)
        source = {"kind": kind, "ref": ref}
        label = args.label or (lane.urlsplit(ref).hostname if kind == "url" else None)
        if label:
            source["location"] = label
        if args.excerpt:
            source["excerpt"] = args.excerpt
        if args.verified:
            source["verified"] = True
        slides = list(dict.fromkeys(lane.find_slide(spec, s)["id"] for group in args.slide for s in group))
        return {"kind": "source", "source": source, "slides": slides}
    if args.command == "alt":
        return {"kind": "caption", "field": "alt", "slide": lane.find_slide(spec, args.slide)["id"], "value": text(args.value)}
    if args.command == "caption":
        value = [text(v) for v in args.value]
        if args.field == "asset":
            if not args.keyword or not args.delivery or args.value or args.slide:
                usage("caption --field asset needs --keyword and --delivery, with optional --description")
            value = {"keyword": args.keyword, "delivery": args.delivery}
            if args.description:
                value["description"] = args.description
        elif args.field != "hashtags":
            if len(value) != 1:
                usage("supply one quoted caption field value")
            value = value[0]
        if (args.field == "perSlide") != bool(args.slide):
            usage("--slide is required for perSlide and is only valid with perSlide")
        edit = {"kind": "caption", "field": args.field, "value": value}
        if args.slide:
            edit["slide"] = lane.find_slide(spec, args.slide)["id"]
        return edit
    if args.command == "cta":
        if args.keep:
            if any(s.get("cta") for s in spec["slides"]) or any(getattr(args, k) for k in ("text", "title", "slide", "keyword", "delivery", "description")):
                usage("cta --keep only records an ending without a CTA; do not combine it with CTA fields")
            return {"kind": "keep-cta", "reason": args.reason or "the creator kept the ending without a CTA", "at": lane.now()}
        slide = lane.find_slide(spec, args.slide) if args.slide else spec["slides"][-1]
        title = args.title or slide.get("title")
        if not args.text or not title:
            usage("cta needs --text and a --title when the last slide has no title")
        edit = fields(slide, {"type": "cta", "title": text(title), "cta": {"kind": args.kind, "text": text(args.text)}})
        edit["post"] = {"captionPack": {"cta": text(args.text)}}
        if args.kind == "keyword-dm":
            asset = copy.deepcopy((spec.get("captionPack") or {}).get("asset") or {})
            asset.update({k: getattr(args, k) for k in ("keyword", "delivery", "description") if getattr(args, k) is not None})
            if not asset.get("keyword") or not asset.get("delivery"):
                usage("keyword-dm needs --keyword and --delivery (instant or manual)")
            edit["post"]["captionPack"]["asset"] = asset
        return edit
    if args.command == "override":
        key, value = scalar_override(args.assignment)
        if args.target == "post":
            return {"kind": "fields", "post": {"style": {"overrides": {key: value}}}}
        return fields(lane.find_slide(spec, args.target), {"overrides": {key: value}})
    if args.command == "keep":
        rule, _, slide = args.rule.partition("@")
        if not lane.csreport.is_overridable(rule):
            usage("%s is not overridable; the check must pass" % rule)
        if slide:
            lane.find_slide(spec, slide)
        return {"kind": "keep", "rule": rule, "slide": slide, "reason": args.reason, "at": lane.now()}
    if args.command == "apply":
        data = lane.read_json(Path(args.file))
        if not isinstance(data, dict) or set(data) - {"post", "slides"} or not data:
            usage('apply expects {"post": {...}, "slides": {"s02": {...}}}')
        post, slides = data.get("post", {}), data.get("slides", {})
        if not isinstance(post, dict) or set(post) - {"style", "cover", "captionPack", "sources", "assets", "compat", "meta", "ext"}:
            usage("apply post fields: style, cover, captionPack, sources, assets, compat, meta, ext")
        if "meta" in post and (not isinstance(post["meta"], dict) or set(post["meta"]) - {"studioUrl", "brandHomeUrl"}):
            usage("apply meta fields: studioUrl, brandHomeUrl")
        if not isinstance(slides, dict):
            usage("apply slides must be an object keyed by stable slide id")
        valid_fields = set(schema.load_schema("spec")["$defs"]["slide"]["properties"]) - {"id", "n"}
        for sid, values in slides.items():
            lane.find_slide(spec, sid)
            if not isinstance(values, dict) or set(values) - valid_fields:
                usage("apply cannot change slide identities; valid fields: " + ", ".join(sorted(valid_fields)))
        for obj in [post.get("style", {})] + list(slides.values()):
            if isinstance(obj, dict) and isinstance(obj.get("overrides"), dict):
                for key, value in obj["overrides"].items():
                    scalar_override(key + "=" + json.dumps(value, ensure_ascii=False))
        return {"kind": "fields", **data}
    usage("unknown command")


def outline(spec, rep):
    slides = []
    for slide in spec["slides"]:
        strings = lane.csqa.slide_strings(slide, False, True)
        title = slide.get("headline") or slide.get("title") or slide.get("body") or ""
        slides.append({"id": slide["id"], "type": slide["type"], "text": lane.one_line(cstext.strip_markup(title))[:80],
                       "words": sum(lane.words(s) for s in strings), "sourceIds": slide.get("sourceIds", [])})
    return {"id": spec["id"], "rev": spec["rev"], "style": spec["style"]["presetId"], "slides": slides,
            "sources": spec.get("sources", []), "structure": rep["structure"],
            "qa": {k: v for k, v in rep["qa"].items() if k != "results"}}


def main(argv=None):
    paths.ensure_utf8_stdio()
    cli = parser()
    args, extra = cli.parse_known_args(argv)
    # argparse's optional positional cannot resume after --field in a subparser.
    if args.command == "text" and args.value is None and len(extra) == 1 and not extra[0].startswith("--"):
        args.value, extra = extra[0], []
    if extra:
        cli.error("unrecognized arguments: " + " ".join(extra))
    if not args.spec:
        cli.error("the following arguments are required: --spec FILE (before or after the command)")
    spec_path = Path(args.spec).resolve()
    try:
        brand = lane.read_json(Path(args.brand)) if args.brand else None
        if brand is not None and not isinstance(brand, dict):
            raise CSError("E_INPUT", "the brand must be a JSON object")
        with lane.post_lock(spec_path):
            spec = lane.read_json(spec_path)
            before = spec_path.read_bytes()
            errors = lane.schema_errors(spec, legacy=True)
            if errors:
                raise CSError("E_SCHEMA", "; ".join(e["path"] + " " + e["message"] for e in errors[:8]))
            if args.expect_rev is not None and spec.get("rev") != args.expect_rev:
                raise CSError("E_CONFLICT", "expected rev %s, found %s" % (args.expect_rev, spec.get("rev")))
            notes = []
            if args.command == "reset-record":
                lane.discard_record(spec_path)
                paths.write_json(lane.record_path(spec_path), lane.new_record(spec))
                notes.append("saved edits backed up as spec.edits.json.bak; the spec is unchanged")
                rep = lane.check_spec(copy.deepcopy(spec), brand, legacy=True)
            elif args.command != "show":
                previous = copy.deepcopy(spec)
                record = lane.read_record(spec_path, spec)
                if not lane.record_path(spec_path).exists():
                    lane.migrate_record(spec, record)
                else:
                    lane.reconcile_fill(spec, record)
                    lane.capture_design(spec, spec, record)
                edit = edit_for(args, spec)
                if edit.get("kind") == "keep-cta" or (args.command == "cta" and args.kind):
                    record["edits"] = [e for e in record["edits"] if e.get("kind") != "keep-cta"]
                record["edits"].append(edit)
                notes = lane.replay_edits(spec, record)
                lane.bind_all(spec)
                lane.bump(spec, previous)
                keep = lane.recorded_keeps(record, spec)
                rep = lane.check_spec(spec, brand, keep, legacy=True)
                lane.saved_keep_marks(spec, rep, record)
                lane.save_post(spec_path, spec, record, before, legacy=True)
            else:
                rep = lane.check_spec(spec, brand, legacy=True)
        result = outline(spec, rep)
        result["notes"] = notes
        status = 2 if rep["structure"] else rep["qa"]["exitCode"]
        result["exit"] = status
        if args.format == "json":
            lane.output_json(result)
        else:
            lines = ["%s: rev %d · %s" % (spec["id"], spec["rev"], result["style"])]
            if args.command == "show":
                lines += ["%s %-12s %d words · %s · sources %s" % (s["id"], s["type"], s["words"], s["text"], ", ".join(s["sourceIds"]) or "none") for s in result["slides"]]
                lines += ["source %s %s %s" % (s["id"], s["kind"], s.get("ref", "")) for s in result["sources"]]
            lines += ["note: " + n for n in notes]
            lines += lane.report(status, rep)
            lane.output("\n".join(lines) + "\n")
        return status
    except CSError as exc:
        return lane.error_status(exc)
    except OSError as exc:
        lane.output("cs-error: E_WRITE: %s\n" % exc, sys.stderr)
        return 73


if __name__ == "__main__":
    sys.exit(main())
