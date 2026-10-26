#!/usr/bin/env python3
"""calendar.py - MENA occasion calendar and Umm al-Qura lookups for the content-plan skill.

Dates come from data/calendar-2026-28.json and data/hijri-ummalqura.json. Nothing is computed: a Hijri date is a
table lookup, and every occasion carries explicit dates. Hijri-based occasions are flagged "+-1d" (moon sighting
can move them by a day in any country); fixed ones are "exact".

    calendar.py occasions --from YYYY-MM-DD --to YYYY-MM-DD [--countries EG,SA] [--kinds religious,national,commercial]
                          [--strict] [--lang ar|en] [--format text|json]
    calendar.py hijri --date YYYY-MM-DD [--lang ar|en] [--format text|json]
    calendar.py next --country EG [--count 5] [--from YYYY-MM-DD] [--kinds ...] [--lang ar|en] [--format text|json]

Exit codes follow the plugin convention: 0 ok, 64 usage error, 65 unreadable data, 66 data file missing, 70 internal error.

Note on the file name: the plugin's script layout fixes it as calendar.py. It shadows the standard-library module of the same name
when this folder is first on sys.path, so this script never imports that module, and plan.py loads this file by path.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from bisect import bisect_right
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _cs import paths, text as cs_text  # noqa: E402

paths.ensure_utf8_stdio()

CALENDAR_FILE = "calendar-2026-28.json"
HIJRI_FILE = "hijri-ummalqura.json"
LOCALE_FILE = "locale-defaults.json"

KINDS = ("religious", "national", "commercial")
DATE_RE = re.compile(r"^[0-9]{4}-[0-9]{2}-[0-9]{2}$")
COUNTRY_RE = re.compile(r"^[A-Z]{2}$")
PLUS_MINUS_ONE = "±1d"

EXIT_USAGE, EXIT_DATA, EXIT_MISSING, EXIT_INTERNAL = 64, 65, 66, 70

LABELS = {
    "ar": {
        "kind": {"religious": "ديني", "national": "وطني", "commercial": "تجاري"},
        "confidence": {"exact": "موعد ثابت", PLUS_MINUS_ONE: "قد يختلف يومًا"},
        "tone": {"reverent": "نبرة وقورة", "solemn": "نبرة هادئة بلا ترويج", "festive": "نبرة احتفالية",
                 "patriotic": "نبرة وطنية", "respectful": "تهنئة محترمة", "commercial": "نبرة تجارية"},
        "hijri": "هجري", "plan": "ابدأ التخطيط", "pre": "ابدأ التشويق", "post": "آخر موعد للمتابعة",
        "moon": "رؤية الهلال مساء", "countries": "البلدان", "all": "كل البلدان", "note": "ملاحظة",
        "in-range": "الآن", "pre-phase": "تشويق", "plan-phase": "تخطيط", "post-phase": "ما بعد",
        "none": "لا مناسبات في هذه الفترة.", "days": "بعد {n} يومًا", "today": "اليوم", "ongoing": "جارية",
        "table": "تقويم أم القرى", "caveat": "الأقرب للتقويم المدني؛ الإعلان الرسمي في كل بلد قد يختلف يومًا.",
    },
    "en": {
        "kind": {"religious": "religious", "national": "national", "commercial": "commercial"},
        "confidence": {"exact": "fixed date", PLUS_MINUS_ONE: "may shift a day"},
        "tone": {"reverent": "reverent tone", "solemn": "quiet tone, nothing promotional", "festive": "festive tone",
                 "patriotic": "patriotic tone", "respectful": "respectful greeting", "commercial": "commercial tone"},
        "hijri": "Hijri", "plan": "start planning", "pre": "start teasers", "post": "last follow-up day",
        "moon": "moon check on the evening of", "countries": "Countries", "all": "all countries", "note": "Note",
        "in-range": "now", "pre-phase": "teaser window", "plan-phase": "planning window", "post-phase": "afterglow",
        "none": "No occasions in this period.", "days": "in {n} days", "today": "today", "ongoing": "ongoing",
        "table": "Umm al-Qura calendar", "caveat": "Civil calendar; the official announcement in each country can differ by a day.",
    },
}


class Fail(Exception):
    """A user-facing failure with an exit code (printed as 'cs-error: CODE: message')."""

    def __init__(self, code: str, message: str, exit_code: int):
        super().__init__(message)
        self.code, self.exit_code = code, exit_code


# ---------------------------------------------------------------- data loading
def _read(name: str):
    try:
        path = paths.data_path(name)
    except Exception as exc:  # noqa: BLE001 - path discovery errors are data errors for the caller
        raise Fail("E_SCHEMA", f"cannot locate {name}: {exc}", EXIT_MISSING) from exc
    if not Path(path).exists():
        raise Fail("E_SCHEMA", f"missing data file {name}", EXIT_MISSING)
    try:
        return paths.read_json(path)
    except (ValueError, OSError) as exc:
        raise Fail("E_SCHEMA", f"cannot read {name}: {exc}", EXIT_DATA) from exc


def load_calendar() -> dict:
    return _read(CALENDAR_FILE)


def load_hijri() -> dict:
    return _read(HIJRI_FILE)


def load_countries() -> dict:
    """ISO code -> country record, from locale-defaults.json (synced from carousel-design)."""
    return _read(LOCALE_FILE).get("countries", {})


def parse_date(text: str, flag: str = "date") -> date:
    if not DATE_RE.match(text or ""):
        raise Fail("E_USAGE", f"--{flag} must look like YYYY-MM-DD, got {text!r}", EXIT_USAGE)
    try:
        return date.fromisoformat(text)
    except ValueError as exc:
        raise Fail("E_USAGE", f"--{flag} is not a real date: {text}", EXIT_USAGE) from exc


def parse_list(text: str | None) -> list[str]:
    return [p.strip() for p in (text or "").split(",") if p.strip()]


# ---------------------------------------------------------------- Hijri lookup (table only)
def hijri_of(table: dict, day: date) -> dict:
    """Return {year, month, day, monthName, monthLength} for a Gregorian date, or raise Fail if outside the table."""
    rows = table["months"]
    starts = [date.fromisoformat(r[2]) for r in rows]
    last = date.fromisoformat(table["range"]["to"])
    if day < starts[0] or day > last:
        raise Fail("E_USAGE", f"date {day} is outside the table ({starts[0]} to {last})", EXIT_USAGE)
    year, month, start, length = rows[bisect_right(starts, day) - 1]
    offset = (day - date.fromisoformat(start)).days
    return {
        "year": year, "month": month, "day": offset + 1,
        "monthName": {"ar": table["monthNames"]["ar"][month - 1], "en": table["monthNames"]["en"][month - 1]},
        "monthLength": length,
    }


def hijri_label(h: dict, lang: str) -> str:
    return f"{h['day']} {h['monthName'][lang]} {h['year']}"


# ---------------------------------------------------------------- occasions
def confidence_for(rule: str) -> str:
    return PLUS_MINUS_ONE if rule == "hijri" else "exact"


def expand_countries(series: dict, universe: list[str]) -> list[str]:
    raw = series.get("countries", "*")
    base = list(universe) if raw == "*" else list(raw)
    skip = set(series.get("exclude", []))
    return sorted(c for c in base if c not in skip)


def flatten(cal: dict, universe: list[str]) -> list[dict]:
    """Every dated instance of every series as one occasion dict, sorted by start date."""
    windows = cal["defaults"]["windows"]
    out = []
    for series in cal["series"]:
        for inst in series["instances"]:
            start, end = date.fromisoformat(inst["start"]), date.fromisoformat(inst["end"])
            occ = {
                "id": f"{series['key']}-{inst['year']}",
                "key": series["key"],
                "kind": series["kind"],
                "rule": series["rule"],
                "names": series["names"],
                "tone": series.get("tone"),
                "importance": series.get("importance", 1),
                "suggestedIntent": series.get("suggestedIntent"),
                "start": inst["start"],
                "end": inst["end"],
                "countries": expand_countries(series, universe),
                "regionWide": series.get("countries") == "*",
                "confidence": confidence_for(series["rule"]),
                "windows": {
                    "planFrom": (start + timedelta(days=windows["plan"])).isoformat(),
                    "preFrom": (start + timedelta(days=windows["pre"])).isoformat(),
                    "postTo": (end + timedelta(days=windows["post"])).isoformat(),
                },
            }
            for opt in ("moonCheck", "hijriYear"):
                if opt in inst:
                    occ[opt] = inst[opt]
            for opt in ("timing", "sensitivities", "pack", "note", "tagAllSlots", "partOf"):
                if opt in series:
                    occ[opt] = series[opt]
            out.append(occ)
    out.sort(key=lambda o: (o["start"], -o["importance"], o["id"]))
    return out


def phases_for(occ: dict, qa: date, qb: date) -> list[str]:
    """Which parts of an occasion's life overlap the query range [qa, qb], most specific first."""
    start, end = date.fromisoformat(occ["start"]), date.fromisoformat(occ["end"])
    w = occ["windows"]
    plan_from, pre_from, post_to = (date.fromisoformat(w[k]) for k in ("planFrom", "preFrom", "postTo"))

    def overlaps(a: date, b: date) -> bool:
        return a <= b and a <= qb and b >= qa

    found = []
    if overlaps(start, end):
        found.append("in-range")
    if overlaps(pre_from, start - timedelta(days=1)):
        found.append("pre")
    if overlaps(plan_from, pre_from - timedelta(days=1)):
        found.append("plan")
    if overlaps(end + timedelta(days=1), post_to):
        found.append("post")
    return found


def select(occasions: list[dict], qa: date, qb: date, countries: list[str], kinds: list[str], strict: bool = False) -> list[dict]:
    chosen = []
    wanted = set(countries)
    for occ in occasions:
        if kinds and occ["kind"] not in kinds:
            continue
        matched = sorted(wanted & set(occ["countries"])) if wanted else list(occ["countries"])
        if wanted and not matched:
            continue
        phases = phases_for(occ, qa, qb)
        if not phases or (strict and "in-range" not in phases):
            continue
        chosen.append({**occ, "matchedCountries": matched, "phases": phases, "phase": phases[0]})
    return chosen


def per_country_dates(occ: dict) -> list[dict]:
    """The occasion-pack shape of dates: one entry per matched country with its own confidence flag."""
    rule = "fixed" if occ["rule"] in ("easter-orthodox", "nth-weekday") else occ["rule"]
    return [{"country": c, "start": occ["start"], "end": occ["end"], "rule": rule, "confidence": occ["confidence"]}
            for c in occ["matchedCountries"]]


def validate_countries(codes: list[str], universe: list[str]) -> list[str]:
    bad = [c for c in codes if not COUNTRY_RE.match(c)]
    if bad:
        raise Fail("E_USAGE", f"country codes are two capital letters (EG, SA ...); got {', '.join(bad)}", EXIT_USAGE)
    unknown = [c for c in codes if c not in universe]
    return unknown


def validate_kinds(kinds: list[str]) -> None:
    bad = [k for k in kinds if k not in KINDS]
    if bad:
        raise Fail("E_USAGE", f"--kinds takes {', '.join(KINDS)}; got {', '.join(bad)}", EXIT_USAGE)


# ---------------------------------------------------------------- rendering
def render_occasion(occ: dict, lang: str, hijri_table: dict | None, today: date | None = None) -> str:
    t = LABELS[lang]
    other = "en" if lang == "ar" else "ar"
    head = f"{occ['start']}" if occ["start"] == occ["end"] else f"{occ['start']} -> {occ['end']}"
    flag = t["confidence"][occ["confidence"]]
    lines = [f"{head}  {occ['names'][lang]}  ({t['kind'][occ['kind']]} / {flag})"]
    bits = []
    if hijri_table is not None and occ["rule"] == "hijri":
        try:
            bits.append(f"{t['hijri']}: {hijri_label(hijri_of(hijri_table, date.fromisoformat(occ['start'])), lang)}")
        except Fail:
            pass
    w = occ["windows"]
    bits += [f"{t['plan']}: {w['planFrom']}", f"{t['pre']}: {w['preFrom']}"]
    if occ.get("moonCheck"):
        bits.append(f"{t['moon']} {occ['moonCheck']}")
    lines.append("   " + " | ".join(bits))
    if occ.get("regionWide") and len(occ.get("matchedCountries", [])) == len(occ["countries"]):
        lines.append(f"   {t['countries']}: {t['all']}")
    else:
        lines.append(f"   {t['countries']}: {', '.join(occ.get('matchedCountries', occ['countries']))}")
    if occ.get("tone"):
        lines.append(f"   {t['tone'][occ['tone']]}")
    if occ.get("note"):
        lines.append(f"   {t['note']}: {occ['note'].get(lang) or occ['note'].get(other)}")
    return "\n".join(lines)


def emit(payload: dict, fmt: str, text: str) -> None:
    if fmt == "json":
        sys.stdout.write(json.dumps(payload, ensure_ascii=False, indent=2) + "\n")
    else:
        sys.stdout.write(text.rstrip("\n") + "\n")


# ---------------------------------------------------------------- commands
def cmd_occasions(args) -> int:
    qa, qb = parse_date(args.date_from, "from"), parse_date(args.date_to, "to")
    if qa > qb:
        raise Fail("E_USAGE", "--from must not be after --to", EXIT_USAGE)
    cal, table, countries_tbl = load_calendar(), load_hijri(), load_countries()
    universe = sorted(countries_tbl)
    wanted, kinds = parse_list(args.countries), parse_list(args.kinds)
    unknown = validate_countries(wanted, universe)
    validate_kinds(kinds)
    warnings = []
    cov = cal["range"]
    if qb < date.fromisoformat(cov["from"]) or qa > date.fromisoformat(cov["to"]):
        warnings.append(f"the calendar covers {cov['from']} to {cov['to']}; nothing to show for this range")
    elif qa < date.fromisoformat(cov["from"]) or qb > date.fromisoformat(cov["to"]):
        warnings.append(f"the calendar covers {cov['from']} to {cov['to']}; the range is cut at those dates")
    if unknown:
        warnings.append(f"{', '.join(unknown)} not in the country table: only region-wide occasions can match")
    found = select(flatten(cal, universe), qa, qb, wanted, kinds, strict=args.strict)
    for occ in found:
        occ["dates"] = per_country_dates(occ)
    payload = {"from": args.date_from, "to": args.date_to, "countries": wanted, "kinds": kinds,
               "count": len(found), "occasions": found, "warnings": warnings}
    t = LABELS[args.lang]
    body = "\n".join(render_occasion(o, args.lang, table) + f"\n   [{t[o['phase'] + '-phase'] if o['phase'] != 'in-range' else t['in-range']}]"
                     for o in found) or t["none"]
    if warnings and args.format == "text":
        body += "\n" + "\n".join(f"! {w}" for w in warnings)
    emit(payload, args.format, body)
    return 0


def cmd_hijri(args) -> int:
    day = parse_date(args.date)
    table = load_hijri()
    h = hijri_of(table, day)
    payload = {"date": args.date, "hijri": h, "source": table["calendar"], "caveat": table["caveat"]}
    t = LABELS[args.lang]
    text = f"{args.date} = {hijri_label(h, args.lang)} ({t['table']}; {t['caveat']})"
    emit(payload, args.format, text)
    return 0


def cmd_next(args) -> int:
    country = (args.country or "").strip().upper()
    cal, table, countries_tbl = load_calendar(), load_hijri(), load_countries()
    universe = sorted(countries_tbl)
    unknown = validate_countries([country], universe)
    kinds = parse_list(args.kinds)
    validate_kinds(kinds)
    if args.count < 1 or args.count > 50:
        raise Fail("E_USAGE", "--count must be between 1 and 50", EXIT_USAGE)
    since = parse_date(args.date_from, "from") if args.date_from else date.today()
    cov_to = date.fromisoformat(cal["range"]["to"])
    found = []
    for occ in flatten(cal, universe):
        if country not in occ["countries"] or (kinds and occ["kind"] not in kinds):
            continue
        if date.fromisoformat(occ["end"]) < since:
            continue
        start = date.fromisoformat(occ["start"])
        found.append({**occ, "matchedCountries": [country], "daysUntil": (start - since).days,
                      "phases": phases_for(occ, since, since), "dates": None})
    found = found[: args.count]
    for occ in found:
        occ["dates"] = per_country_dates(occ)
        occ["phase"] = occ["phases"][0] if occ["phases"] else "upcoming"
    warnings = []
    if since > cov_to:
        warnings.append(f"the calendar ends on {cov_to}")
    if unknown:
        warnings.append(f"{country} is not in the country table: only region-wide occasions can match")
    payload = {"from": since.isoformat(), "country": country, "count": len(found), "occasions": found, "warnings": warnings}
    t = LABELS[args.lang]

    def when(o: dict) -> str:
        n = o["daysUntil"]
        if n < 0:
            return t["ongoing"]
        if n == 0:
            return t["today"]
        if args.lang == "ar":
            return "بعد " + cs_text.ar_count(n, "day", after_preposition=True)  # بعد يوم واحد / يومين / 5 أيام / 36 يومًا
        return t["days"].format(n=n) if n != 1 else "in 1 day"

    body = "\n".join(render_occasion(o, args.lang, table) + f"\n   [{when(o)}]" for o in found) or t["none"]
    if warnings and args.format == "text":
        body += "\n" + "\n".join(f"! {w}" for w in warnings)
    emit(payload, args.format, body)
    return 0


# ---------------------------------------------------------------- CLI
class Parser(argparse.ArgumentParser):
    def error(self, message: str):  # usage errors exit 64, not argparse's default 2
        sys.stderr.write(f"cs-error: E_USAGE: {message}\n")
        raise SystemExit(EXIT_USAGE)


def build_parser() -> argparse.ArgumentParser:
    p = Parser(prog="calendar.py", description="MENA occasions and Umm al-Qura lookups (table lookups only).")
    sub = p.add_subparsers(dest="cmd", required=True, parser_class=Parser)

    def common(sp):
        sp.add_argument("--lang", choices=["ar", "en"], default="ar", help="language of text output (default ar)")
        sp.add_argument("--format", choices=["text", "json"], default="text")

    o = sub.add_parser("occasions", help="occasions whose date or lead-up windows touch a date range")
    o.add_argument("--from", dest="date_from", required=True, metavar="YYYY-MM-DD")
    o.add_argument("--to", dest="date_to", required=True, metavar="YYYY-MM-DD")
    o.add_argument("--countries", help="comma list of ISO codes, e.g. EG,SA (default: all)")
    o.add_argument("--kinds", help="comma list of religious,national,commercial (default: all)")
    o.add_argument("--strict", action="store_true", help="only occasions whose own dates fall inside the range")
    common(o)
    o.set_defaults(fn=cmd_occasions)

    h = sub.add_parser("hijri", help="Hijri date of a Gregorian date (Umm al-Qura table lookup)")
    h.add_argument("--date", required=True, metavar="YYYY-MM-DD")
    common(h)
    h.set_defaults(fn=cmd_hijri)

    n = sub.add_parser("next", help="the next occasions for one country")
    n.add_argument("--country", required=True, metavar="EG")
    n.add_argument("--count", type=int, default=5)
    n.add_argument("--from", dest="date_from", metavar="YYYY-MM-DD", help="default: today")
    n.add_argument("--kinds")
    common(n)
    n.set_defaults(fn=cmd_next)
    return p


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        return args.fn(args)
    except Fail as exc:
        sys.stderr.write(f"cs-error: {exc.code}: {exc}\n")
        return exc.exit_code
    except Exception as exc:  # noqa: BLE001 - last-resort guard, reported as an internal error
        sys.stderr.write(f"cs-error: E_INTERNAL: {type(exc).__name__}: {exc}\n")
        return EXIT_INTERNAL


if __name__ == "__main__":
    sys.exit(main())
