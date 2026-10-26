#!/usr/bin/env python3
"""icon_search.py: the icon (or the concept) for an Arabic title and body, found the way the planner finds it (spec 3.1).

    icon_search.py --query TEXT|- [--body TEXT|-] [--dialect eg|gulf|lev|mag|msa|auto] [--limit 5] [--topic CAT[,CAT]]
                   [--exclude NAME[,NAME]] [--avoid FLAG[,FLAG]] [--avoid-cat CAT] [--hero] [--concepts | --explain NAME]
                   [--data DIR] [--format text|json] [--out FILE]

--query       the title, or the only text; - reads stdin
--body        the body, weighted 60% against the title (as the planner does); - reads stdin
--dialect     the post's dialect; levant, msa-white and the other plugin spellings are accepted too (default: auto)
--topic       the deck's category (comma separated, strongest first); by default the categories of the text itself
--exclude     icons already used in the deck
--avoid       icon flags to drop: h figures, a animals, o occasion icons, c currencies
--avoid-cat   prefer another category when it scores within 5 points
--hero        hero size: no high-detail icon
--concepts    list the concepts the text names (with their primitive and object) instead of icons
--explain     the entry of one icon for this text, or null
--data DIR    a folder with pack.json, index.json, concepts.json and stem.json (default: data/icons of this skill)
--out FILE    also write the JSON report to FILE

JSON output: {query, body, dialect, topic: [category], results: [...]} where a result is {name, score (x10), rung (1..7), concept, cat, via,
neg, primitive, object, why} (concepts: {id, cat, score, rung, icons, object, primitive, pol, neg, via}); --explain gives {..., name, result}.
Nothing found is a normal answer (results is empty): the slide then takes a typographic anchor.
Exit codes: 0 ok, 64 usage, 65 unreadable data, 66 data or input missing, 70 internal.
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
try:
    from _cs import CSError, icons, paths  # noqa: E402
except ImportError as exc:  # the shared package is synced next to the scripts; say so plainly
    sys.stderr.write("cs-error: E_DEP_LOAD: the shared _cs package (with icons.py) is missing next to this script: %s\n" % exc)
    sys.exit(70)

paths.ensure_utf8_stdio()

DIALECTS = ("eg", "gulf", "lev", "mag", "msa", "auto")
ALIASES = {"levant": "lev", "msa-white": "msa", "maghrebi": "mag", "maghreb": "mag", "khaleeji": "gulf", "egyptian": "eg"}


class _Parser(argparse.ArgumentParser):
    def error(self, message):
        sys.stderr.write("cs-error: E_USAGE: %s\n" % message)
        sys.exit(64)


def _dialect(value):
    v = ALIASES.get(value, value)
    if v not in DIALECTS:
        raise argparse.ArgumentTypeError("invalid dialect '%s' (choose from %s)" % (value, ", ".join(DIALECTS)))
    return v


def _list(value):
    return [x.strip() for x in value.split(",") if x.strip()]


def build_parser():
    p = _Parser(prog="icon_search.py", description="Find the icon or concept for an Arabic title and body (spec 3.1).")
    p.add_argument("--query", required=True, help="the title, or the only text; - reads stdin")
    p.add_argument("--body", help="the body, weighted 60%% against the title; - reads stdin")
    p.add_argument("--dialect", type=_dialect, default="auto", help="eg, gulf, lev, mag, msa or auto (default)")
    p.add_argument("--limit", type=int, default=5, help="how many results (default 5)")
    p.add_argument("--topic", type=_list, help="the deck's category, comma separated (default: derived from the text)")
    p.add_argument("--exclude", type=_list, default=[], help="icons already used in the deck")
    p.add_argument("--avoid", type=_list, default=[], help="icon flags to drop: h a o c")
    p.add_argument("--avoid-cat", dest="avoid_cat", help="prefer another category when it scores within 5 points")
    p.add_argument("--hero", action="store_true", help="hero size: no high-detail icon")
    p.add_argument("--concepts", action="store_true", help="list concepts instead of icons")
    p.add_argument("--explain", metavar="NAME", help="the entry of one icon for this text")
    p.add_argument("--data", help="folder with pack.json, index.json, concepts.json, stem.json")
    p.add_argument("--format", choices=("text", "json"), default="text", help="output format (default: text)")
    p.add_argument("--out", help="also write the JSON report to this file")
    return p


def fail(code, message, exit_code):
    sys.stderr.write("cs-error: %s: %s\n" % (code, message))
    sys.exit(exit_code)


def text_report(doc):
    lines = ["query: %s | dialect: %s | topic: %s" % (doc["query"] + (" + " + doc["body"] if doc["body"] else ""), doc["dialect"], ", ".join(doc["topic"]) or "-")]
    rows = [doc["result"]] if "result" in doc and doc["result"] else [] if "result" in doc else doc["results"]
    for i, r in enumerate(rows, 1):
        if "id" in r:
            lines.append("%d. %s (%s) rung %d score %d icons %s%s%s via \"%s\"" % (i, r["id"], r["cat"], r["rung"], r["score"], " ".join(r["icons"]) or "-",
                         " primitive %s" % r["primitive"] if r["primitive"] else "", " [neg]" if r["neg"] else "", r["via"]))
        else:
            lines.append("%d. %s (%s) rung %d score %d concept %s via \"%s\"%s%s%s" % (i, r["name"], r["cat"], r["rung"], r["score"], r["concept"] or "-", r["via"],
                         " primitive %s" % r["primitive"] if r["primitive"] else "", " object %s" % r["object"] if r["object"] else "", " [neg]" if r["neg"] else ""))
            if r["why"]:
                lines.append("   %s" % r["why"])
    if not rows:
        lines.append("no icon found: use a typographic anchor or a mock (لا توجد أيقونة مناسبة)")
    return "\n".join(lines) + "\n"


def main(argv=None):
    args = build_parser().parse_args(argv)
    if args.query == "-" and args.body == "-":
        fail("E_USAGE", "only one of --query and --body can read stdin", 64)
    if args.limit < 1:
        fail("E_USAGE", "--limit must be at least 1", 64)
    query, body = (sys.stdin.read() if v == "-" else v for v in (args.query, args.body))
    if args.data and not Path(args.data).is_dir():
        fail("E_USAGE", "--data folder not found: %s" % args.data, 66)
    icons.use(folder=args.data)
    folder = Path(args.data) if args.data else paths.data_path("icons")
    for name in ("index.json", "stem.json"):
        if not (folder / name).is_file():
            fail("E_USAGE", "icon data not found: %s (build it with tools/build-icons.mjs or sync the skill data)" % (folder / name), 66)
    fields = [{"text": query or "", "w": 100}] + ([{"text": body, "w": 60}] if body else [])
    dialect = None if args.dialect == "auto" else args.dialect
    try:
        topic = args.topic if args.topic is not None else icons.topic(fields, dialect)
        doc = {"query": query or "", "body": body or "", "dialect": args.dialect, "topic": topic}
        if args.explain:
            doc.update(name=args.explain, result=icons.explain(args.explain, fields, dialect))
        elif args.concepts:
            doc["results"] = icons.concepts(fields, dialect, topic)[:args.limit]
        else:
            doc["results"] = icons.find(fields, dialect, k=args.limit, exclude=args.exclude, hero=args.hero, topic=topic, avoid=args.avoid, avoid_cat=args.avoid_cat)
    except (ValueError, OSError) as exc:
        fail("E_SCHEMA", "icon data is unreadable: %s" % exc, 65)
    except CSError as exc:
        fail(exc.code, str(exc), 70)
    if args.out:
        paths.write_json(args.out, doc)
    sys.stdout.write(json.dumps(doc, ensure_ascii=False, indent=2) + "\n" if args.format == "json" else text_report(doc))
    return 0


if __name__ == "__main__":
    sys.exit(main())
