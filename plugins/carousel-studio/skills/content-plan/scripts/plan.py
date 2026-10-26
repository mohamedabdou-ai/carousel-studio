#!/usr/bin/env python3
"""plan.py - build, show, lint and update monthly content plans (plan-YYYY-MM.json).

    plan.py new --brand FILE --month YYYY-MM [--per-week N] [--goal followers|clients|sales] [--out FILE]
                [--days sun,tue,thu] [--hours 20:30,22:00] [--tz Asia/Dubai] [--min-importance 2]
                [--lead-magnet] [--no-occasions] [--lang ar|en] [--format text|json]
    plan.py show FILE [--brand FILE] [--lang ar|en] [--format text|json]
    plan.py lint FILE [--brand FILE] [--lang ar|en] [--format text|json]
    plan.py set-status FILE --slot ID --status STATUS [--spec-id ID] [--studio-url URL] [--format text|json]
    plan.py add-idea FILE --text T [--pillar P] [--intent save,send] [--source user|audience-faq|occasion|repurposed|claude]

A plan is a scaffold: dates, intent, architecture, a suggested hook family, a call-to-action kind and a pillar per slot,
all chosen by fixed rules (no randomness). Claude then angles each slot with the user. Dates of occasions come from
calendar.py's data; this script never computes a Hijri date. Exit codes: 0 ok, 1 FIX findings (lint), 2 BLOCK or schema
errors, 64 usage, 65 unreadable data, 66 missing file, 70 internal error.
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import re
import sys
from collections import Counter
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _cs import paths  # noqa: E402

paths.ensure_utf8_stdio()

EXIT_FIX, EXIT_BLOCK, EXIT_USAGE, EXIT_DATA, EXIT_MISSING, EXIT_INTERNAL = 1, 2, 64, 65, 66, 70

# ------------------------------------------------------------------ planning vocabulary
INTENTS = ("save", "send", "reach", "sell")
GOALS = ("followers", "clients", "sales")
STATUSES = ("idea", "angled", "scripted", "designed", "exported", "posted")
SOURCES = ("user", "audience-faq", "occasion", "repurposed", "claude")
WEEKDAYS = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")  # index = date.weekday()

# Share of posts per intent by goal. A brand's own intentMix wins unless --goal is given.
GOAL_MIX = {
    "followers": {"save": 0.40, "send": 0.25, "reach": 0.25, "sell": 0.10},
    "clients": {"save": 0.35, "send": 0.25, "reach": 0.20, "sell": 0.20},
    "sales": {"save": 0.30, "send": 0.20, "reach": 0.20, "sell": 0.30},
}
# Working week of most of the region is Sunday-Thursday; weekends differ per country, so days are overridable.
DEFAULT_DAYS = {
    1: ["wed"],
    2: ["sun", "wed"],
    3: ["sun", "tue", "thu"],
    4: ["sun", "tue", "wed", "thu"],
    5: ["sun", "mon", "tue", "wed", "thu"],
    6: ["sun", "mon", "tue", "wed", "thu", "sat"],
    7: ["sun", "mon", "tue", "wed", "thu", "fri", "sat"],
}
DEFAULT_HOUR = "20:30"          # inside the common 20:00-23:00 evening window
AFTER_IFTAR_HOUR = "21:30"      # Ramadan: engagement moves after iftar
LIST_ARCHS = ("listicle", "steps", "framework", "comparison")  # what counts as a "save-intent list"
ARCH_BY_INTENT = {
    "save": LIST_ARCHS,
    "send": ("myth-fact", "opinion", "story"),
    "reach": ("news", "opinion", "myth-fact", "story"),
    "sell": ("offer", "results", "lead-magnet", "case-study"),
}
INTENT_FAMILIES = {
    "save": ("P11", "P2", "P1", "F17", "P14", "P15", "F19", "F22"),
    "send": ("P10", "F21", "F20", "P13", "P9", "P4"),
    "reach": ("P4", "P13", "F20", "P12", "P16", "P9", "F23"),
    "sell": ("S1", "S2", "S3", "P7", "P8"),
}
FAMILIES_BY_ARCH = {
    "listicle": ("P1", "P11", "P2", "P15"),
    "steps": ("P14", "P1", "F19", "P11"),
    "framework": ("P11", "F19", "F23", "P1"),
    "comparison": ("P2", "P15", "F18", "P3"),
    "myth-fact": ("F17", "P4", "P3"),
    "opinion": ("F21", "F20", "P4", "F17"),
    "story": ("P9", "F22", "P13", "F23"),
    "news": ("P12", "P16", "P13"),
    "case-study": ("P7", "P8", "P9"),
    "offer": ("S1", "S2", "S3"),
    "results": ("P7", "P8", "S2"),
    "lead-magnet": ("S1", "P11", "S2"),
}
NEEDS_REAL_NUMBER = {"P7", "P8", "P16", "S3"}
CTA_PREFERENCE = {
    "save": ("save", "question", "follow"),
    "send": ("send", "question"),
    "reach": ("send", "follow", "question"),
    "sell": ("question", "save", "follow"),
}

AR = {
    "weekday": {"mon": "الاثنين", "tue": "الثلاثاء", "wed": "الأربعاء", "thu": "الخميس", "fri": "الجمعة", "sat": "السبت", "sun": "الأحد"},
    "month": ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"],
    "intent": {"save": "حفظ", "send": "إرسال", "reach": "وصول", "sell": "بيع"},
    "arch": {"listicle": "قائمة", "steps": "خطوات", "myth-fact": "خرافة وحقيقة", "story": "قصة", "case-study": "حالة",
             "framework": "إطار عمل", "comparison": "مقارنة", "opinion": "رأي", "news": "خبر", "offer": "عرض",
             "results": "نتائج", "lead-magnet": "هدية مجانية"},
    "cta": {"save": "احفظ", "send": "أرسل", "question": "سؤال", "keyword-dm": "كلمة للرسائل", "follow": "تابع"},
    "status": {"idea": "فكرة", "angled": "زاوية", "scripted": "سكربت", "designed": "تصميم", "exported": "مُصدَّر", "posted": "منشور"},
}
EN = {
    "weekday": {"mon": "Mon", "tue": "Tue", "wed": "Wed", "thu": "Thu", "fri": "Fri", "sat": "Sat", "sun": "Sun"},
    "month": ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
    "intent": {i: i for i in INTENTS},
    "arch": {a: a for a in AR["arch"]},
    "cta": {c: c for c in AR["cta"]},
    "status": {s: s for s in STATUSES},
}
LABELS = {"ar": AR, "en": EN}

SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9-]{1,39}$")
SHORT_ID_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{0,31}$")
ID_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{5,63}$")
CLOCK_RE = re.compile(r"^([01][0-9]|2[0-3]):[0-5][0-9]$")
MONTH_RE = re.compile(r"^([0-9]{4})-(0[1-9]|1[0-2])$")


class Fail(Exception):
    def __init__(self, code: str, message: str, exit_code: int):
        super().__init__(message)
        self.code, self.exit_code = code, exit_code


# ------------------------------------------------------------------ plumbing
_CAL = None


def calendar_module():
    """Load calendar.py by path under another name (its file name collides with the standard library)."""
    global _CAL
    if _CAL is None:
        target = Path(__file__).with_name("calendar.py")
        spec = importlib.util.spec_from_file_location("cs_calendar", target)
        mod = importlib.util.module_from_spec(spec)
        sys.modules["cs_calendar"] = mod
        spec.loader.exec_module(mod)
        _CAL = mod
    return _CAL


def read_json_file(path: str | Path, what: str):
    p = Path(path)
    if not p.exists():
        raise Fail("E_SCHEMA", f"{what} not found: {p}", EXIT_MISSING)
    try:
        return paths.read_json(p)
    except (ValueError, OSError) as exc:
        raise Fail("E_SCHEMA", f"{what} is not valid JSON: {exc}", EXIT_DATA) from exc


def schema_errors(plan: dict) -> list[dict]:
    from _cs import schema  # imported late: only the commands that validate need it

    return schema.validate_named("plan", plan)


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def parse_month(text: str) -> tuple[int, int]:
    m = MONTH_RE.match(text or "")
    if not m:
        raise Fail("E_USAGE", f"--month must look like YYYY-MM, got {text!r}", EXIT_USAGE)
    return int(m.group(1)), int(m.group(2))


def week_start(d: date) -> date:
    """Sunday-based week start (the working week of most of the region begins on Sunday)."""
    return d - timedelta(days=(d.weekday() + 1) % 7)


def weekday_code(d: date) -> str:
    return WEEKDAYS[d.weekday()]


def month_days(year: int, month: int) -> list[date]:
    first = date(year, month, 1)
    nxt = date(year + (month == 12), month % 12 + 1, 1)
    return [first + timedelta(days=i) for i in range((nxt - first).days)]


def add_minutes(clock: str, minutes: int) -> str:
    h, m = int(clock[:2]), int(clock[3:])
    total = min(h * 60 + m + minutes, 23 * 60 + 59)
    return f"{total // 60:02d}:{total % 60:02d}"


def out_path(brand_file: Path, slug: str, period: str, explicit: str | None) -> Path:
    if explicit:
        return Path(explicit)
    name = f"plan-{period}.json"
    parent = brand_file.resolve().parent
    return parent / "plans" / name if parent.name == slug else Path.cwd() / name


# ------------------------------------------------------------------ allocation helpers
def target_counts(mix: dict, n: int) -> dict:
    """Largest-remainder split of n posts across the intents in `mix` (weights, any scale)."""
    total = sum(max(mix.get(i, 0), 0) for i in INTENTS)
    if n <= 0 or total <= 0:
        return {i: 0 for i in INTENTS}
    raw = {i: max(mix.get(i, 0), 0) / total * n for i in INTENTS}
    base = {i: int(raw[i]) for i in INTENTS}
    leftover = n - sum(base.values())
    for i in sorted(INTENTS, key=lambda k: (-(raw[k] - base[k]), INTENTS.index(k)))[:leftover]:
        base[i] += 1
    return base


def clean_mix(raw: dict | None) -> dict:
    out = {}
    for i in INTENTS:
        v = (raw or {}).get(i)
        if isinstance(v, (int, float)) and not isinstance(v, bool) and v >= 0:
            out[i] = float(v)
    return out if sum(out.values()) > 0 else {}


def pick_least_recent(options, last_used: dict, avoid=None):
    pool = [o for o in options if o != avoid] or list(options)
    return min(pool, key=lambda o: (last_used.get(o, -1), list(options).index(o)))


def pick_family(intent: str, arch: str, recent: list[str]) -> str:
    wanted = [f for f in FAMILIES_BY_ARCH[arch] if f in INTENT_FAMILIES[intent]]
    ordered = wanted + [f for f in FAMILIES_BY_ARCH[arch] if f not in wanted]
    for fam in ordered:
        if fam not in recent[-2:]:
            return fam
    return ordered[0]


def pick_cta(intent: str, arch: str, recent: list[str], allowed: dict, lead_magnet_ready: bool) -> str:
    ok = [c for c in CTA_PREFERENCE[intent] if c in allowed.get(intent, [])]
    if arch == "lead-magnet" and lead_magnet_ready and "keyword-dm" in allowed.get(intent, []):
        ok = ["keyword-dm"] + ok
    ok = ok or list(allowed.get(intent, ["question"]))
    for cta in ok:
        if cta not in recent[-2:]:
            return cta
    for cta in ok:
        if not recent or cta != recent[-1]:
            return cta
    return ok[0]


def pick_pillar(pillars: list[dict], slot: dict, assigned: Counter, idx: int, prev: str | None) -> str | None:
    if not pillars:
        return None
    best, best_score = None, None
    for p in pillars:
        share = p.get("share")
        share = share if isinstance(share, (int, float)) and share > 0 else 1.0 / len(pillars)
        score = share * (idx + 1) - assigned[p["id"]]
        if p.get("intents") and slot["intent"] in p["intents"]:
            score += 0.5
        if p["id"] == prev:
            score -= 1.0
        if best_score is None or score > best_score + 1e-9:
            best, best_score = p["id"], score
    return best


# ------------------------------------------------------------------ plan construction
def build_plan(brand: dict, year: int, month: int, opts: dict) -> tuple[dict, list[str], list[dict]]:
    """Return (plan, warnings, occasion summaries)."""
    C = calendar_module()
    warnings: list[str] = []
    slug = brand.get("slug", "")
    if not SLUG_RE.match(slug):
        raise Fail("E_SCHEMA", "the brand file has no valid slug", EXIT_DATA)
    period = f"{year:04d}-{month:02d}"
    identity, locale, strategy = brand.get("identity", {}), brand.get("locale", {}), brand.get("strategy", {})

    goal = opts.get("goal") or identity.get("goal") or "followers"
    if goal not in GOALS:
        raise Fail("E_USAGE", f"goal must be one of {', '.join(GOALS)}", EXIT_USAGE)
    if opts.get("goal"):
        mix = dict(GOAL_MIX[goal])
    else:
        mix = clean_mix(strategy.get("intentMix")) or dict(GOAL_MIX[goal])

    per_week = opts.get("per_week") or strategy.get("postsPerWeek") or 4
    if not isinstance(per_week, int) or per_week < 1:
        raise Fail("E_USAGE", "--per-week must be a positive integer", EXIT_USAGE)
    if per_week > 7:
        warnings.append("more than 7 posts a week is not generated; planned 7 - add the extra slots by hand")
        per_week = 7
    days = opts.get("days") or list(DEFAULT_DAYS[per_week])
    bad = [d for d in days if d not in WEEKDAYS]
    if bad:
        raise Fail("E_USAGE", f"unknown weekday {', '.join(bad)}; use {', '.join(WEEKDAYS)}", EXIT_USAGE)
    days = [d for d in WEEKDAYS if d in set(days)]
    if opts.get("days") and len(days) != per_week:
        if opts.get("per_week"):
            warnings.append(f"--days lists {len(days)} days; perWeek set to {len(days)}")
        per_week = len(days)

    countries_tbl = C.load_countries()
    brand_countries = [c for c in locale.get("countries", []) if isinstance(c, str)]
    best = strategy.get("bestHours", {}) if isinstance(strategy.get("bestHours"), dict) else {}
    tz = opts.get("tz") or best.get("tz") or (countries_tbl.get(brand_countries[0], {}).get("tz") if brand_countries else None) or "UTC"
    hours = opts.get("hours") or []
    if not hours:
        for s in best.get("slots", []) or []:
            if CLOCK_RE.match(str(s.get("from", ""))):
                t = add_minutes(s["from"], 30)
                if CLOCK_RE.match(str(s.get("to", "99:99"))) and t >= s["to"]:
                    t = s["from"]
                if t not in hours:
                    hours.append(t)
        hours = hours[:6] or [DEFAULT_HOUR]
    for h in hours:
        if not CLOCK_RE.match(h):
            raise Fail("E_USAGE", f"hour {h!r} must be HH:MM (24-hour)", EXIT_USAGE)

    # ---- base slots: every matching date of the month
    slots = []
    for d in month_days(year, month):
        if weekday_code(d) in days:
            slots.append({"date": d.isoformat(), "format": "carousel", "status": "idea", "_d": d})
    if not slots:
        raise Fail("E_USAGE", "no date of that month matches the chosen days", EXIT_USAGE)
    starts = sorted({week_start(s["_d"]) for s in slots})
    per_week_count: Counter = Counter()
    for s in slots:
        wk = week_start(s["_d"])
        s["_wk"] = starts.index(wk) + 1
        per_week_count[wk] += 1
        s["_nth"] = per_week_count[wk]
        s["id"] = f"w{s['_wk']}-{s['_nth']}"
        s["time"] = hours[(s["_nth"] - 1) % len(hours)]

    weeks: dict[int, list[int]] = {}
    for i, s in enumerate(slots):
        weeks.setdefault(s["_wk"], []).append(i)

    # ---- occasions
    occ_summary: list[dict] = []
    plan_occasions: list[str] = []
    fixed: dict[int, dict] = {}
    if not opts.get("no_occasions"):
        universe = sorted(countries_tbl)
        m0, m1 = date(year, month, 1), month_days(year, month)[-1]
        relevant = []
        for o in C.flatten(C.load_calendar(), universe):
            applies = bool(set(brand_countries) & set(o["countries"])) if brand_countries else o["regionWide"]
            phases = C.phases_for(o, m0, m1) if applies else []
            if phases:
                relevant.append({**o, "phases": phases})
        relevant.sort(key=lambda o: (-o["importance"], o["start"]))
        plan_occasions = [o["id"] for o in relevant][:24]
        occ_summary = [{"id": o["id"], "names": o["names"], "start": o["start"], "end": o["end"], "confidence": o["confidence"],
                        "phases": o["phases"], "importance": o["importance"]} for o in relevant]
        lang_note = _occasion_note
        # Ramadan-like occasions tag every slot inside them and move the posting time.
        tag_all: set[str] = set()
        for o in relevant:
            if o.get("tagAllSlots"):
                tag_all.add(o["id"])
                s0, s1 = date.fromisoformat(o["start"]), date.fromisoformat(o["end"])
                for s in slots:
                    if s0 <= s["_d"] <= s1 and "occasionId" not in s:
                        s["occasionId"] = o["id"]
                        if o.get("timing", {}).get("shift") == "after-iftar" and s["time"] < "21:00":
                            s["time"] = AFTER_IFTAR_HOUR
        cap = max(1, len(slots) // 2)
        min_imp = opts.get("min_importance", 2)
        for o in relevant:
            if len(fixed) >= cap:
                break
            if o.get("tagAllSlots") or o.get("partOf") or o["importance"] < min_imp:
                continue
            start, end = date.fromisoformat(o["start"]), date.fromisoformat(o["end"])
            if not (date(year, month, 1) <= start <= m1 + timedelta(days=7)):
                continue
            window = [(i, s) for i, s in enumerate(slots)
                      if i not in fixed and s.get("occasionId", "") in ({""} | tag_all)
                      and start - timedelta(days=7) <= s["_d"] <= end + timedelta(days=3)
                      # keep one free slot in every week of two or more, so the week can still get its save-list
                      and (len(weeks[s["_wk"]]) < 2 or sum(1 for j in weeks[s["_wk"]] if j not in fixed) > 1)]
            if not window:
                warnings.append(f"no free slot near {o['id']} ({o['start']}); add one by hand")
                continue
            i, s = min(window, key=lambda t: (0 if t[1]["_d"] <= start else 1, abs((t[1]["_d"] - start).days)))
            intent = o.get("suggestedIntent") or "send"
            if o.get("tone") == "solemn":
                intent = "reach"
            if intent == "sell" and mix.get("sell", 0) <= 0:
                intent = "send"
            s["occasionId"] = o["id"]
            s["title"] = o["names"]["ar"][:160]
            s["note"] = lang_note(o)
            fixed[i] = {"intent": intent, "tone": o.get("tone")}

    # ---- intents
    n = len(slots)
    target = target_counts(mix, n)
    used = Counter(f["intent"] for f in fixed.values())
    free = [i for i in range(n) if i not in fixed]
    remaining = {i: max(0, target[i] - used[i]) for i in INTENTS}
    if sum(remaining.values()) != len(free):
        remaining = target_counts(remaining if sum(remaining.values()) > 0 else mix, len(free))

    chosen: dict[int, str] = {i: f["intent"] for i, f in fixed.items()}
    forced: list[int] = []
    for wk, idxs in sorted(weeks.items()):
        if len(idxs) < 2 or any(chosen.get(i) == "save" for i in idxs):
            continue
        candidates = [i for i in idxs if i in free]
        if not candidates:
            continue
        i = candidates[0]
        chosen[i] = "save"
        forced.append(i)
        if remaining["save"] > 0:
            remaining["save"] -= 1
        else:
            donor = max((k for k in INTENTS if k != "save"), key=lambda k: remaining[k])
            if remaining[donor] > 0:
                remaining[donor] -= 1
    pending = [i for i in free if i not in forced]
    for pos, i in enumerate(pending):
        prev1 = chosen.get(i - 1)
        prev2 = chosen.get(i - 2)
        left = len(pending) - pos

        def score(k: str) -> float:
            return remaining[k] / left - (0.75 if k == prev1 else 0) - (0.25 if k == prev2 else 0) - INTENTS.index(k) * 1e-6

        options = [k for k in INTENTS if remaining[k] > 0]
        pick = max(options, key=score) if options else "save"
        chosen[i] = pick
        if remaining.get(pick, 0) > 0:
            remaining[pick] -= 1

    # ---- architecture, hook family, CTA, pillar (chronological, with rotation memory)
    platform = paths.read_json(paths.data_path("platform-instagram.json"))
    allowed = platform["plugin"]["cta"]["allowedByIntent"]
    pillars = [p for p in strategy.get("pillars", []) if isinstance(p, dict) and SHORT_ID_RE.match(str(p.get("id", "")))]
    if not pillars:
        warnings.append("the brand has no pillars; slots carry no pillarId (set the pillars first)")
    last_arch_use: dict[str, int] = {}
    recent_fams: list[str] = []
    recent_ctas: list[str] = []
    assigned: Counter = Counter()
    prev_arch = prev_pillar = None
    for idx, s in enumerate(slots):
        intent = chosen[idx]
        s["intent"] = intent
        greeting = idx in fixed and intent != "sell"  # occasion greetings follow the occasion's tone, not a hook formula
        if greeting:
            pool = ("story", "opinion") if fixed[idx].get("tone") in ("solemn", "respectful") else ("story", "listicle", "opinion")
        else:
            pool = ARCH_BY_INTENT[intent]
        arch = pick_least_recent(pool, last_arch_use, avoid=prev_arch)
        s["architecture"] = arch
        last_arch_use[arch] = idx
        prev_arch = arch
        fam = None
        if not greeting:
            fam = pick_family(intent, arch, recent_fams)
            s["family"] = fam
            recent_fams.append(fam)
        cta = pick_cta(intent, arch, recent_ctas, allowed, bool(opts.get("lead_magnet")))
        s["ctaKind"] = cta
        recent_ctas.append(cta)
        pillar = pick_pillar(pillars, s, assigned, idx, prev_pillar)
        if pillar:
            s["pillarId"] = pillar
            assigned[pillar] += 1
            prev_pillar = pillar
        notes = [s["note"]] if s.get("note") else []
        if fam in NEEDS_REAL_NUMBER:
            notes.append("هذه العائلة تحتاج رقمًا حقيقيًا من صاحب الحساب.")
        if arch == "lead-magnet" and not opts.get("lead_magnet"):
            notes.append("تحتاج أصلًا حقيقيًا يُسلَّم فورًا قبل استخدام كلمة للرسائل.")
        if notes:
            s["note"] = " ".join(notes)[:300]

    for s in slots:
        for k in [k for k in s if k.startswith("_")]:
            del s[k]
    ordered_keys = ("id", "date", "time", "pillarId", "format", "intent", "architecture", "family", "ctaKind",
                    "occasionId", "status", "title", "note")
    slots = [{k: s[k] for k in ordered_keys if k in s} for s in slots]

    idea_bank = []
    for text in (brand.get("audience", {}) or {}).get("faq", [])[:8]:
        if isinstance(text, str) and text.strip():
            idea_bank.append({"id": f"i{len(idea_bank) + 1}", "text": text.strip()[:300], "source": "audience-faq"})
    stamp = now_iso()
    plan = {
        "schemaVersion": 1,
        "id": f"plan-{slug}-{period}"[:64],
        "brandSlug": slug,
        "period": period,
        "goal": goal,
        "cadence": {"perWeek": per_week, "days": days, "hours": hours, "tz": tz},
        "slots": slots,
        "ideaBank": idea_bank,
        "angleBank": [],
        "occasions": plan_occasions,
        "createdAt": stamp,
        "updatedAt": stamp,
    }
    return plan, warnings, occ_summary


def _occasion_note(o: dict) -> str:
    flag = " (قد يختلف يومًا)" if o["confidence"] != "exact" else ""
    tone = {"reverent": "نبرة وقورة", "solemn": "نبرة هادئة بلا ترويج", "festive": "نبرة احتفالية", "patriotic": "نبرة وطنية",
            "respectful": "تهنئة محترمة", "commercial": "نبرة تجارية"}.get(o.get("tone") or "", "")
    return f"مناسبة: {o['names']['ar']} في {o['start']}{flag}. {tone}.".replace(" .", "").strip()


# ------------------------------------------------------------------ rendering
def date_label(iso: str, lang: str) -> str:
    d = date.fromisoformat(iso)
    L = LABELS[lang]
    return f"{L['weekday'][weekday_code(d)]} {d.day} {L['month'][d.month - 1]}"


def occasion_names(lang: str) -> dict[str, str]:
    """Occasion id -> display name, best effort (empty when the calendar data is unavailable)."""
    try:
        C = calendar_module()
        return {o["id"]: o["names"][lang] for o in C.flatten(C.load_calendar(), sorted(C.load_countries()))}
    except Fail:
        return {}


def slot_line(n: int, s: dict, lang: str, pillars: dict[str, str] | None = None, occasions: dict[str, str] | None = None) -> str:
    L = LABELS[lang]
    parts = [f"{n}. {date_label(s['date'], lang)} {s.get('time', '')}".rstrip()]
    parts.append(f"{L['intent'][s['intent']]}" + (f" ({L['arch'][s['architecture']]})" if s.get("architecture") else ""))
    if s.get("ctaKind"):
        label = "الدعوة" if lang == "ar" else "CTA"
        parts.append(f"{label}: {L['cta'][s['ctaKind']]}")
    if s.get("pillarId"):
        name = (pillars or {}).get(s["pillarId"], s["pillarId"])
        parts.append(("الركيزة: " if lang == "ar" else "Pillar: ") + name)
    if s.get("title"):
        parts.append(s["title"])
    elif s.get("occasionId"):
        name = (occasions or {}).get(s["occasionId"])
        if name:
            parts.append(("مناسبة: " if lang == "ar" else "Occasion: ") + name)
    parts.append(L["status"][s["status"]])
    return " — ".join(parts)


def render_plan(plan: dict, lang: str, pillar_names: dict[str, str] | None = None) -> str:
    slots = sorted(plan["slots"], key=lambda s: (s["date"], s.get("time", "")))
    names = occasion_names(lang)
    return "\n".join(slot_line(i, s, lang, pillar_names, names) for i, s in enumerate(slots, 1))


def emit(payload, fmt: str, text: str) -> None:
    if fmt == "json":
        sys.stdout.write(json.dumps(payload, ensure_ascii=False, indent=2) + "\n")
    else:
        sys.stdout.write(text.rstrip("\n") + "\n")


def must_validate(plan: dict) -> None:
    errors = schema_errors(plan)
    if errors:
        first = errors[0]
        raise Fail("E_SCHEMA", f"plan is not valid at {first['path'] or '/'}: {first['message']} ({len(errors)} error(s))", EXIT_BLOCK)


# ------------------------------------------------------------------ lint
def msg(ar: str, en: str) -> dict:
    return {"ar": ar, "en": en}


def lint_plan(plan: dict, brand: dict | None = None) -> list[dict]:
    results: list[dict] = []

    def add(rule: str, sev: str, m: dict, slot: str | None = None) -> None:
        item = {"rule": rule, "sev": sev, "msg": m}
        if slot:
            item["slot"] = slot
        results.append(item)

    for e in schema_errors(plan):
        add("PLAN.schema", "BLOCK", msg(f"{e['path'] or '/'}: {e['message']}", f"{e['path'] or '/'}: {e['message']}"))
    slots = [s for s in plan.get("slots", []) if isinstance(s, dict) and s.get("date")]
    slots.sort(key=lambda s: (s["date"], s.get("time", ""), s.get("id", "")))

    seen = set()
    for s in slots:
        key = (s["date"], s.get("time", ""))
        if key in seen:
            add("PLAN.duplicate-time", "FIX", msg(f"خانتان في الموعد نفسه {s['date']} {s.get('time', '')}.",
                                                  f"Two slots at the same time {s['date']} {s.get('time', '')}."), s.get("id"))
        seen.add(key)
        if plan.get("period") and not s["date"].startswith(plan["period"]):
            add("PLAN.outside-period", "FIX", msg(f"التاريخ {s['date']} خارج شهر الخطة {plan['period']}.",
                                                  f"{s['date']} is outside the plan month {plan['period']}."), s.get("id"))

    for a, b in zip(slots, slots[1:]):
        if a.get("architecture") and a.get("architecture") == b.get("architecture"):
            add("PLAN.arch-repeat", "FIX", msg(f"الهيكل نفسه ({a['architecture']}) مرتين متتاليتين: {a['id']} ثم {b['id']}.",
                                               f"The same architecture ({a['architecture']}) twice in a row: {a['id']} then {b['id']}."), b["id"])
        if a.get("ctaKind") and a.get("ctaKind") == b.get("ctaKind"):
            add("PLAN.cta-repeat", "FIX", msg(f"نوع الدعوة نفسه ({a['ctaKind']}) مرتين متتاليتين: {a['id']} ثم {b['id']}.",
                                              f"The same CTA kind ({a['ctaKind']}) twice in a row: {a['id']} then {b['id']}."), b["id"])
        if a.get("family") and a.get("family") == b.get("family"):
            add("PLAN.family-adjacent", "NOTE", msg(f"العائلة {a['family']} في خانتين متتاليتين: {a['id']} و{b['id']}.",
                                                    f"Hook family {a['family']} in two consecutive slots: {a['id']} and {b['id']}."), b["id"])
    for a, b, c in zip(slots, slots[1:], slots[2:]):
        fam = a.get("family")
        if fam and fam == b.get("family") == c.get("family"):
            add("PLAN.family-streak", "FIX", msg(f"العائلة {fam} ثلاث مرات متتالية: {a['id']} و{b['id']} و{c['id']}.",
                                                 f"Hook family {fam} three times in a row: {a['id']}, {b['id']} and {c['id']}."), c["id"])

    by_week: dict[date, list[dict]] = {}
    for s in slots:
        by_week.setdefault(week_start(date.fromisoformat(s["date"])), []).append(s)
    per_week = (plan.get("cadence") or {}).get("perWeek")
    for wk, group in sorted(by_week.items()):
        if len(group) >= 2 and not any(g.get("intent") == "save" and g.get("architecture") in LIST_ARCHS for g in group):
            add("PLAN.week-save-list", "FIX", msg(f"الأسبوع الذي يبدأ {wk.isoformat()} بلا قائمة بنية حفظ (قائمة أو خطوات أو إطار أو مقارنة).",
                                                  f"The week starting {wk.isoformat()} has no save-intent list (list, steps, framework or comparison)."))
        if isinstance(per_week, int) and len(group) > per_week + 1:
            add("PLAN.week-count", "NOTE", msg(f"الأسبوع الذي يبدأ {wk.isoformat()} فيه {len(group)} منشورات والمخطط {per_week}.",
                                               f"The week starting {wk.isoformat()} holds {len(group)} posts; the plan says {per_week}."))

    # occasions
    try:
        C = calendar_module()
        index = {o["id"]: o for o in C.flatten(C.load_calendar(), sorted(C.load_countries()))}
    except Fail:
        index = {}
    for s in slots:
        oid = s.get("occasionId")
        if not oid:
            continue
        occ = index.get(oid)
        if index and occ is None:
            add("PLAN.occasion-unknown", "NOTE", msg(f"المناسبة {oid} غير موجودة في التقويم.", f"Occasion {oid} is not in the calendar."), s["id"])
        elif occ and occ.get("tone") == "solemn" and s.get("intent") == "sell":
            add("PLAN.solemn-sell", "FIX", msg(f"{oid} مناسبة هادئة: لا بيع فيها.", f"{oid} is a solemn occasion: no selling on it."), s["id"])

    # mixes
    n = len(slots)
    if n >= 4:
        goal = plan.get("goal") or "followers"
        want = clean_mix(((brand or {}).get("strategy") or {}).get("intentMix")) or GOAL_MIX.get(goal, GOAL_MIX["followers"])
        total = sum(want.values()) or 1
        actual = Counter(s.get("intent") for s in slots)
        for i in INTENTS:
            target_pct, actual_pct = round(want.get(i, 0) / total * 100), round(actual[i] / n * 100)
            if abs(actual_pct - target_pct) > 15:
                add("PLAN.intent-mix", "NOTE", msg(f"نسبة {i} الفعلية {actual_pct}% والهدف {target_pct}%.",
                                                   f"Intent {i} is {actual_pct}% of the plan; the target is {target_pct}%."))
        pillars = [p for p in (((brand or {}).get("strategy") or {}).get("pillars") or []) if isinstance(p, dict) and p.get("share")]
        if pillars:
            count = Counter(s.get("pillarId") for s in slots)
            for p in pillars:
                target_pct, actual_pct = round(p["share"] * 100), round(count[p["id"]] / n * 100)
                if abs(actual_pct - target_pct) > 20:
                    add("PLAN.pillar-mix", "NOTE", msg(f"ركيزة {p['id']} تأخذ {actual_pct}% والهدف {target_pct}%.",
                                                       f"Pillar {p['id']} takes {actual_pct}%; the target is {target_pct}%."))
    order = {"BLOCK": 0, "FIX": 1, "NOTE": 2}
    results.sort(key=lambda r: (order[r["sev"]], r["rule"], r.get("slot", "")))
    return results


def summarize(results: list[dict]) -> dict:
    counts = {"block": 0, "fix": 0, "note": 0}
    for r in results:
        counts[r["sev"].lower()] += 1
    status = "block" if counts["block"] else "fix" if counts["fix"] else "pass"
    return {"status": status, "counts": counts, "exitCode": {"pass": 0, "fix": EXIT_FIX, "block": EXIT_BLOCK}[status]}


# ------------------------------------------------------------------ commands
def cmd_new(a) -> int:
    year, month = parse_month(a.month)
    brand_file = Path(a.brand)
    brand = read_json_file(brand_file, "brand file")
    opts = {"per_week": a.per_week, "goal": a.goal, "days": [d.strip() for d in (a.days or "").split(",") if d.strip()],
            "hours": [h.strip() for h in (a.hours or "").split(",") if h.strip()], "tz": a.tz, "lead_magnet": a.lead_magnet,
            "no_occasions": a.no_occasions, "min_importance": a.min_importance}
    plan, warnings, occasions = build_plan(brand, year, month, opts)
    must_validate(plan)
    target = out_path(brand_file, plan["brandSlug"], plan["period"], a.out)
    try:
        paths.write_json(target, plan, indent=2)
    except OSError as exc:
        raise Fail("E_INTERNAL", f"cannot write {target}: {exc}", 73) from exc
    names = {p["id"]: p.get("name", p["id"]) for p in (brand.get("strategy", {}).get("pillars") or []) if isinstance(p, dict) and "id" in p}
    head = (f"تم إنشاء الخطة: {target} ({len(plan['slots'])} خانة، {plan['cadence']['perWeek']} في الأسبوع)" if a.lang == "ar"
            else f"Plan written: {target} ({len(plan['slots'])} slots, {plan['cadence']['perWeek']} a week)")
    body = head + "\n" + render_plan(plan, a.lang, names)
    if warnings:
        body += "\n" + "\n".join(f"! {w}" for w in warnings)
    emit({"out": str(target), "plan": plan, "warnings": warnings, "occasions": occasions}, a.format, body)
    return 0


def cmd_show(a) -> int:
    plan = read_json_file(a.file, "plan file")
    names = None
    if a.brand:
        brand = read_json_file(a.brand, "brand file")
        names = {p["id"]: p.get("name", p["id"]) for p in (brand.get("strategy", {}).get("pillars") or []) if isinstance(p, dict) and "id" in p}
    emit({"file": a.file, "period": plan.get("period"), "lines": render_plan(plan, a.lang, names).split("\n"), "plan": plan}, a.format,
         render_plan(plan, a.lang, names))
    return 0


def cmd_lint(a) -> int:
    plan = read_json_file(a.file, "plan file")
    brand = read_json_file(a.brand, "brand file") if a.brand else None
    results = lint_plan(plan, brand)
    summary = summarize(results)
    lines = [f"[{r['sev']}] {r.get('slot', '-')} {r['rule']}: {r['msg'][a.lang]}" for r in results]
    head = (f"فحص الخطة: {summary['status']} (إصلاح {summary['counts']['fix']}، ملاحظات {summary['counts']['note']}، حجب {summary['counts']['block']})"
            if a.lang == "ar" else f"Plan lint: {summary['status']} (fix {summary['counts']['fix']}, notes {summary['counts']['note']}, block {summary['counts']['block']})")
    emit({"ok": summary["exitCode"] == 0, "file": a.file, **summary, "results": results}, a.format, "\n".join([head] + lines))
    return summary["exitCode"]


def write_plan(file: str, plan: dict) -> None:
    plan["updatedAt"] = now_iso()
    must_validate(plan)
    try:
        paths.write_json(file, plan, indent=2)
    except OSError as exc:
        raise Fail("E_INTERNAL", f"cannot write {file}: {exc}", 73) from exc


def cmd_set_status(a) -> int:
    plan = read_json_file(a.file, "plan file")
    if a.status not in STATUSES:
        raise Fail("E_USAGE", f"--status must be one of {', '.join(STATUSES)}", EXIT_USAGE)
    slot = next((s for s in plan.get("slots", []) if s.get("id") == a.slot), None)
    if slot is None:
        raise Fail("E_USAGE", f"no slot {a.slot!r} in {a.file}", EXIT_USAGE)
    if a.spec_id is not None and not ID_RE.match(a.spec_id):
        raise Fail("E_USAGE", "--spec-id must be 6-64 lowercase letters, digits, - or _", EXIT_USAGE)
    if a.studio_url is not None and len(a.studio_url) > 500:
        raise Fail("E_USAGE", "--studio-url is longer than 500 characters", EXIT_USAGE)
    slot["status"] = a.status
    if a.spec_id is not None:
        slot["specId"] = a.spec_id
    if a.studio_url is not None:
        slot["studioUrl"] = a.studio_url
    write_plan(a.file, plan)
    emit({"slot": a.slot, "status": a.status, "specId": slot.get("specId"), "studioUrl": slot.get("studioUrl")}, a.format,
         f"{a.slot}: {a.status}")
    return 0


def cmd_add_idea(a) -> int:
    plan = read_json_file(a.file, "plan file")
    text = (a.text or "").strip()
    if not text or len(text) > 300:
        raise Fail("E_USAGE", "--text must be 1-300 characters", EXIT_USAGE)
    intents = [i.strip() for i in (a.intent or "").split(",") if i.strip()]
    bad = [i for i in intents if i not in INTENTS]
    if bad:
        raise Fail("E_USAGE", f"unknown intent {', '.join(bad)}; use {', '.join(INTENTS)}", EXIT_USAGE)
    if a.pillar is not None and not SHORT_ID_RE.match(a.pillar):
        raise Fail("E_USAGE", "--pillar must be a short id (lowercase letters, digits, - or _)", EXIT_USAGE)
    bank = plan.setdefault("ideaBank", [])
    if len(bank) >= 300:
        raise Fail("E_USAGE", "the idea bank is full (300 ideas)", EXIT_USAGE)
    numbers = [int(m.group(1)) for i in bank if (m := re.match(r"^i([0-9]+)$", i.get("id", "")))]
    idea = {"id": f"i{max(numbers, default=0) + 1}", "text": text}
    if a.pillar:
        idea["pillarId"] = a.pillar
    if intents:
        idea["intents"] = list(dict.fromkeys(intents))
    idea["source"] = a.source
    idea["createdAt"] = now_iso()
    bank.append(idea)
    write_plan(a.file, plan)
    emit(idea, a.format, f"{idea['id']}: {text}")
    return 0


# ------------------------------------------------------------------ CLI
class Parser(argparse.ArgumentParser):
    def error(self, message: str):
        sys.stderr.write(f"cs-error: E_USAGE: {message}\n")
        raise SystemExit(EXIT_USAGE)


def build_parser() -> argparse.ArgumentParser:
    p = Parser(prog="plan.py", description="Monthly content plans for Carousel Studio.")
    sub = p.add_subparsers(dest="cmd", required=True, parser_class=Parser)

    def fmt(sp, lang=True):
        sp.add_argument("--format", choices=["text", "json"], default="text")
        if lang:
            sp.add_argument("--lang", choices=["ar", "en"], default="ar")

    n = sub.add_parser("new", help="generate a plan for one month")
    n.add_argument("--brand", required=True, metavar="FILE")
    n.add_argument("--month", required=True, metavar="YYYY-MM")
    n.add_argument("--per-week", type=int, dest="per_week")
    n.add_argument("--goal", choices=GOALS)
    n.add_argument("--out", metavar="FILE")
    n.add_argument("--days", help="comma list of mon..sun (overrides the default pattern)")
    n.add_argument("--hours", help="comma list of HH:MM (default: from the brand's best hours, else 20:30)")
    n.add_argument("--tz", help="IANA time zone (default: brand best hours, else the first country's)")
    n.add_argument("--min-importance", type=int, default=2, dest="min_importance", choices=[1, 2, 3],
                   help="occasions below this importance get no slot of their own (default 2)")
    n.add_argument("--lead-magnet", action="store_true", dest="lead_magnet",
                   help="a real lead magnet with instant delivery exists: allow the keyword-to-DM call to action")
    n.add_argument("--no-occasions", action="store_true", dest="no_occasions")
    fmt(n)
    n.set_defaults(fn=cmd_new)

    s = sub.add_parser("show", help="print one line per slot")
    s.add_argument("file")
    s.add_argument("--brand", metavar="FILE", help="optional: print pillar names instead of their ids")
    fmt(s)
    s.set_defaults(fn=cmd_show)

    l = sub.add_parser("lint", help="check the rotation rules")
    l.add_argument("file")
    l.add_argument("--brand", metavar="FILE", help="optional: compare against the brand's intent mix and pillar shares")
    fmt(l)
    l.set_defaults(fn=cmd_lint)

    t = sub.add_parser("set-status", help="move a slot along idea > angled > scripted > designed > exported > posted")
    t.add_argument("file")
    t.add_argument("--slot", required=True)
    t.add_argument("--status", required=True)
    t.add_argument("--spec-id", dest="spec_id")
    t.add_argument("--studio-url", dest="studio_url")
    fmt(t, lang=False)
    t.set_defaults(fn=cmd_set_status)

    i = sub.add_parser("add-idea", help="append an idea to the idea bank")
    i.add_argument("file")
    i.add_argument("--text", required=True)
    i.add_argument("--pillar")
    i.add_argument("--intent", help="comma list of save,send,reach,sell")
    i.add_argument("--source", choices=SOURCES, default="user")
    fmt(i, lang=False)
    i.set_defaults(fn=cmd_add_idea)
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
