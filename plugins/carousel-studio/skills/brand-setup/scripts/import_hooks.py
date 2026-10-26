#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""import_hooks.py - turn a hook bank (Markdown tables or CSV) into a brand-private hook library.

    import_hooks.py --in FILE.(md|csv) [--in FILE2 ...] [--visibility brand-private]
                    [--brand brand.json] [--out FILE] [--family-map map.json]
                    [--exclude-ids H301-H350] [--exclude-sections TEXT ...] [--include-client] [--format text|json]

* Reads Markdown tables (a text column plus optional id, type, status, source columns) and CSV
  (columns text, id, status, family, intent, awareness, archetype, dialect, reuse, role, flags,
  and optionally metric, value, baseline, n for results). Several --in files merge by id: the
  CSV supplies the classification, the Markdown supplies status, type and section.
* Status: "approved" for «معتمد» / approved / saved / accepted, "used" for «اختيار» «نشر» /
  published / chosen, everything else "proposed".
* Figures such as 88%, 52% or 2M views are marked verified:false and needsSource:true.
* Sentence templates and bracket templates ([سيناريو]) become slot skeletons ({s1}, {n1}).
* Spoken or hype families that are lints rather than formulas (POV, PROMISE, LATE) are not
  turned into entries; they are reported in `mapping` with the disposition "lint-only".
* Output: a hook-library document (visibility brand-private) validated against
  hook.schema.json. English entries go to a second library written next to --out
  (<name>.en.json). Rows from client sections (headings that mention «عميل», «عملاء» or a client) and
  from headings named with --exclude-sections are excluded unless --include-client is given. Nothing is ever written to a public file.

--visibility accepts only brand-private. Exit codes: 0 every row is mapped, 1 some rows are
unclassified or invalid (see mapping), 2 the library is invalid, 64 usage, 65 unreadable
input, 66 missing file, 73 cannot write.
"""

import argparse
import csv
import json
import re
import sys
import unicodedata
from collections import Counter, OrderedDict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _cs import paths, schema  # noqa: E402

paths.ensure_utf8_stdio()

# ----------------------------------------------------------------------------- vocabularies
# code -> (NAME, label ar, label en, intent primary, also, awareness, architectures, cta, lints, needsSource)
FAMILIES = OrderedDict([
    ("P1", ("LIST", "رقم + أشياء + نتيجة", "Number-led list", "save", ["reach"], ["problem", "solution"], ["listicle", "steps"], ["save", "send"], ["digits-on-cover"], False)),
    ("P2", ("VS", "X ضد Y (مدفوع ولا مجاني)", "X vs Y", "save", ["send"], ["problem", "solution"], ["comparison", "listicle"], ["save", "send"], [], False)),
    ("P3", ("MISTAKE", "الغلطة المكلّفة", "Costly mistake", "save", ["reach"], ["problem"], ["myth-fact", "steps", "listicle"], ["save", "send"], ["no-fear-stack"], False)),
    ("P4", ("FLIP", "قلب المعتقد", "Contrarian flip", "reach", ["send"], ["unaware"], ["myth-fact", "opinion"], ["send", "question"], [], False)),
    ("P5", ("SECRET", "إحالة أمامية محددة", "Specific forward reference", "reach", [], ["unaware", "problem"], ["myth-fact", "listicle"], ["save", "send"], ["no-empty-hype"], False)),
    ("P6", ("QUESTION", "سؤال محدد", "Specific question", "reach", ["save"], ["problem"], ["steps", "listicle"], ["question", "save"], ["no-answer-on-cover"], False)),
    ("P7", ("PROOF", "نتيجة برقم حاد", "Sharp-number result", "save", [], ["solution", "product"], ["case-study"], ["save", "follow"], ["number-needs-source"], True)),
    ("P8", ("BEFAFT", "قبل ← بعد", "Before to after", "sell", ["save"], ["solution", "product"], ["case-study"], ["keyword-dm", "follow"], ["number-needs-source"], True)),
    ("P9", ("STORY", "افتتاحية قصة", "Cold-open story", "send", ["sell"], ["problem"], ["story", "case-study"], ["question", "follow"], [], False)),
    ("P10", ("IDENT", "نداء الهوية", "Identity call-out", "send", [], ["problem"], ["framework", "listicle"], ["send", "save"], [], False)),
    ("P11", ("PACK", "حزمة / قائمة جاهزة", "Pack, prompts, checklist", "save", [], ["solution"], ["framework", "listicle"], ["save", "keyword-dm"], [], False)),
    ("P12", ("NEWS", "خبر مؤرَّخ", "Dated news", "reach", [], ["unaware"], ["news"], ["send", "follow"], [], False)),
    ("P13", ("IMAGINE", "تخيّل…", "Imagine…", "reach", ["sell"], ["solution"], ["offer", "news", "opinion"], ["send", "question"], [], False)),
    ("P14", ("WITHOUT", "X من غير Y", "X without Y", "save", [], ["solution"], ["steps"], ["save", "send"], [], False)),
    ("P15", ("RANKED", "جرّبت ورتّبت", "Tested and ranked", "save", ["send"], ["solution"], ["listicle", "comparison"], ["save", "send"], [], False)),
    ("P16", ("BIGNUM", "رقم ضخم بمصدر", "One giant sourced number", "reach", [], ["unaware"], ["news", "listicle"], ["send", "save"], ["number-needs-source"], True)),
    ("F17", ("REFRAME", "مش… ده… (إعادة تأطير)", "Reframe: not X, it is Y", "save", ["reach"], ["problem", "unaware"], ["myth-fact", "framework"], ["save", "send"], ["no-answer-on-cover", "one-gap"], False)),
    ("F18", ("IRONY", "سؤال المفارقة", "Irony question", "save", [], ["problem"], ["steps"], ["save", "question"], [], False)),
    ("F19", ("PRECHECK", "قبل ما… راجع", "Pre-check before a decision", "save", [], ["solution"], ["framework"], ["save"], [], False)),
    ("F20", ("DILEMMA", "معضلة", "Dilemma", "reach", ["send"], ["unaware"], ["opinion"], ["question", "send"], [], False)),
    ("F21", ("STANCE", "موقف بهوية", "Stance with identity", "reach", ["send"], ["unaware"], ["opinion"], ["question", "send"], [], False)),
    ("F22", ("EXPERIENCE", "خبرة سنين", "Experience: years in", "save", ["reach"], ["unaware"], ["listicle"], ["save", "follow"], [], False)),
    ("F23", ("ICEBERG", "جبل الجليد: اللي وراه", "Iceberg: what sits behind", "save", [], ["problem"], ["steps"], ["save"], [], False)),
    ("S1", ("OFFER", "عرض وهدية ومغناطيس", "Offer, lead magnet, launch", "sell", [], ["product"], ["offer", "lead-magnet"], ["keyword-dm", "follow"], [], False)),
    ("S2", ("BENEFIT", "سطر الفائدة", "Benefit line", "sell", [], ["solution", "product"], ["offer"], ["keyword-dm", "follow"], [], False)),
    ("S3", ("LOSS", "كلفة التأخير", "Cost of delay", "sell", [], ["problem"], ["offer", "results"], ["keyword-dm", "follow"], ["number-needs-source"], True)),
])
CODE_BY_NAME = {v[0]: k for k, v in FAMILIES.items()}
LINT_ONLY = {"POV": "a skit-style scenario: Reels only, never the default carousel cover",
             "PROMISE": "an empty-promise opener: handled by the no-empty-hype lint",
             "LATE": "a regret opener: handled as a lint, not a formula"}

ARCHETYPES = {"DEBATE": "opinion", "STEPS": "steps", "OFFER": "offer", "MYTH": "myth-fact", "NEWS": "news",
              "LIST": "listicle", "STORY": "story", "FRAME": "framework", "CASE": "case-study", "COMPARE": "comparison"}
ROLES = {"spoken": ["spoken"], "cover": ["cover"], "ad": ["cover"], "any": ["cover", "slide2", "caption-line1"],
         "caption": ["caption-line1"], "slide2": ["slide2"]}
DIALECT_CODES = {"EG": "eg", "EN": "en", "MSA": "msa-white", "GULF": "gulf", "LEVANT": "levant", "AR": "msa-white"}
FLAG_LINTS = {"self_answer": "no-answer-on-cover", "needs_source": "number-needs-source", "hype": "no-empty-hype",
              "video_ref": "no-video-reference", "emoji": "no-cover-emoji", "overclaim": "no-overclaim",
              "conspiracy": "no-conspiracy", "fear": "no-fear-stack", "bait_risk": "no-comment-bait",
              "unverifiable": "number-needs-source"}
STATUS_USED = ("used", "published", "chosen", "picked", "posted")
STATUS_APPROVED = ("approved", "saved", "accepted", "user_own")

# ordered heuristics for rows that carry no classification (first match wins); families are codes
HEURISTICS = [
    (r"(?:هيغير حياتك|سيغير حياتك|راح يغير حياتك|رح يغير حياتك)", "PROMISE"),
    (r"(?:عارف شعور|تخيل|تخيّل|ماذا لو|لو تخيلت|\b[Ii]magine\b|\b[Ww]hat if\b)", "P13"),
    (r"(?:أسوأ نصيحة|لو (?:إنت |انت |أنت )?(?:فاكر|تظن|تعتقد|تحسب).{0,40}(?:تبقى غلطان|أنت مخطئ|غلطان|مخطئ))", "P4"),
    (r"(?:المشكلة|مشكلتك).{0,25}(?:مش|مو|ليست|ليس)\s", "F17"),
    (r"(?:ليس|لست|مش|مو)\b[^…]{1,30}…\s*(?:بل|لكن|ده|هو)\s", "F17"),
    (r"^(?:أنا|انا)\s.{0,40}(?:ومع|وضد|و ضد|ومش مع)", "F21"),
    (r"[^؟]{3,60}…\s*\S+\s+ولا\s+\S+\s*؟", "F20"),
    (r"(?:إنت شايف|انت شايف).{0,40}(?:إحنا شايفين|احنا شايفين)", "F23"),
    (r"^بتعمل.{0,30}…\s*وب?تستنى", "F18"),
    (r"قبل (?:ما|أن|لا)\s.{0,40}(?:اسأل|جاوب|شوف|راجع)", "F19"),
    (r"^بعد\s+[0-9٠-٩]+\s+(?:سنين|سنة|عام|أعوام)", "F22"),
    (r"(?:رتّبت|رتبت|ترتيبهم|ترتيبها|ranked)", "P15"),
    (r"(?:مدفوع ولا ببلاش|الفرق بين|\bvs\b|\bVS\b|مقابل)", "P2"),
    (r"(?:من غير|بدون|without)\s", "P14"),
    (r"^(?:إزاي|كيف)\s+تـ?.{2,40}", "HOWTO"),
    (r"^[0-9٠-٩]+\s+\S+", "P1"),
    (r"(?:سر\s|ما لا يخبرك)", "P5"),
    (r"(?:توقف عن|بطّل|بطل|الخطأ|غلطة|الغلط)", "P3"),
    (r"^(?:النهارده|اليوم|رسميًا|رسميا|أعلنت|أطلقت)", "P12"),
    (r"(?:برومبت|prompt|قالب|تمبلت|checklist|تشيك ليست)", "P11"),
    (r"^(?:ليه|لماذا|هل|مين|كم|متى|إمتى|ليش)\s.*[؟?]\s*$", "P6"),
]
HOWTO_TO = "P1"  # converts to P14 when the text says "without"

FIGURE_RE = re.compile(
    r"(?<![\w.])[0-9٠-٩][0-9٠-٩.,٫٬]*\s?"
    r"(?:%|٪|[MmKk]\b|[xX]\b|×|مليون|ألف|الف|ضعف|مشاهدة|متابع|دولار|جنيه|درهم|ريال|سنة|سنين|سنوات|عام|شهر|يوم|أيام|ثانية|دقيقة|ساعة|ساعات)")
NUMBER_RE = re.compile(r"(?<![\w{.])[0-9٠-٩]+(?![\w}])")
BRACKET_RE = re.compile(r"\[([^\]]{1,40})\]")
ELLIPSIS_RE = re.compile(r"…|\.{3}")

COL_ALIASES = {
    "id": ("المعرّف", "المعرف", "معرّف", "id", "#"),
    "text": ("النص", "القالب المجرد", "القالب", "text", "hook", "hook_text", "الهوك", "نص الكافر"),
    "type": ("النوع", "type", "topic"),
    "status": ("الحالة", "status"),
    "source": ("المصدر", "source"),
    "example": ("مثال",),
}


class Fail(Exception):
    def __init__(self, code, message, exit_code):
        super().__init__(message)
        self.code, self.exit_code = code, exit_code


class Parser(argparse.ArgumentParser):
    def error(self, message):
        sys.stderr.write("cs-error: E_USAGE: %s\n" % message)
        raise SystemExit(64)


# ----------------------------------------------------------------------------- text helpers
_DIAC = re.compile("[ً-ْٰـ]")


def fold(text):
    t = _DIAC.sub("", unicodedata.normalize("NFC", text)).lower()
    return re.sub(r"[^\w]+", "", t)


def clean_cell(cell):
    return re.sub(r"\s+", " ", cell.replace("**", "").replace("`", "")).strip()


def to_western(s):
    return s.translate({0x0660 + i: ord("0") + i for i in range(10)})


def has_arabic(s):
    return bool(re.search("[؀-ۿ]", s))


def detect_dialect(text, default):
    if not has_arabic(text):
        return "en"
    eg = ("مش", "ده", "دي", "إزاي", "ازاي", "ليه", "دلوقتي", "كده", "عايز", "إنت", "انت", "بتاع", "أوي", "فين", "هتبقى", "هيقولك")
    gulf = ("مو", "وايد", "الحين", "شلون", "شنو", "وش", "ليش", "أبي", "أبغى", "تبي")
    lev = ("شو", "كتير", "هلق", "بدي", "بدك", "رح", "هيك", "هيدا", "هاد", "منيح")
    words = {fold(w) for w in re.findall(r"[ء-ي]+", text)}
    scores = {"eg": sum(fold(m) in words for m in eg), "gulf": sum(fold(m) in words for m in gulf),
              "levant": sum(fold(m) in words for m in lev)}
    best = max(scores, key=scores.get)
    if scores[best] >= 1 and sorted(scores.values())[-1] > sorted(scores.values())[-2]:
        return best
    return default or "msa-white"


# ----------------------------------------------------------------------------- readers
def read_csv_rows(path):
    try:
        raw = path.read_text(encoding="utf-8-sig")
    except (OSError, UnicodeDecodeError) as exc:
        raise Fail("E_SCHEMA", "cannot read %s: %s" % (path, exc), 65)
    reader = csv.DictReader(raw.splitlines())
    if not reader.fieldnames:
        raise Fail("E_SCHEMA", "%s has no header row" % path, 65)
    names = {n: n.strip().lower() for n in reader.fieldnames}
    out = []
    for rec in reader:
        row = {names[k]: (v or "").strip() for k, v in rec.items() if k in names}
        text = ""
        for alias in COL_ALIASES["text"]:
            text = row.get(alias.lower(), "") or text
        if not text:
            continue
        out.append({"id": row.get("id", ""), "text": clean_cell(text), "type": row.get("type", ""),
                    "status": row.get("status", ""), "source": row.get("source", ""), "section": "",
                    "csv": row})
    return out


def header_roles(cells):
    roles = {}
    for i, cell in enumerate(cells):
        low = cell.strip().lower()
        for role, aliases in COL_ALIASES.items():
            if role in roles:
                continue
            if any(low == a.lower() or (len(a) > 2 and a.lower() in low) for a in aliases):
                roles[role] = i
    return roles


def read_md_rows(path):
    try:
        lines = path.read_text(encoding="utf-8-sig").splitlines()
    except (OSError, UnicodeDecodeError) as exc:
        raise Fail("E_SCHEMA", "cannot read %s: %s" % (path, exc), 65)

    def cells(line):
        return [clean_cell(c) for c in line.strip().strip("|").split("|")]

    out, section, roles, i = [], "", None, 0
    sep = re.compile(r"^\|\s*:?-{3,}")
    while i < len(lines):
        line = lines[i].rstrip()
        if line.startswith("#"):
            section, roles = re.sub(r"^#+\s*", "", line).strip(), None
        elif line.startswith("|") and i + 1 < len(lines) and sep.match(lines[i + 1].strip()):
            roles = header_roles(cells(line))
            i += 1
        elif line.startswith("|") and roles is not None and not sep.match(line):
            if "text" in roles:
                c = cells(line)
                get = lambda role: c[roles[role]] if role in roles and roles[role] < len(c) else ""  # noqa: E731
                text = get("text")
                if text:
                    out.append({"id": get("id"), "text": text, "type": get("type"), "status": get("status"),
                                "source": get("source"), "example": get("example"), "section": section, "csv": {}})
        elif not line.startswith("|"):
            roles = None if line.strip() == "" and roles is None else roles
        i += 1
    return out


# ----------------------------------------------------------------------------- mapping
def map_status(raw):
    r = (raw or "").strip().lower()
    if any(k in r for k in ("اختيار", "نشر")) or r in STATUS_USED:
        return "used"
    if "معتمد" in r or r in STATUS_APPROVED:
        return "approved"
    return "proposed"


def source_id(raw_id):
    m = re.fullmatch(r"[A-Za-z]\d{1,4}", raw_id or "")
    return raw_id.upper() if m else None


def parse_id_ranges(spec):
    ranges = []
    for part in (spec or "").split(","):
        part = part.strip()
        if not part:
            continue
        m = re.fullmatch(r"([A-Za-z]+)(\d+)(?:-(?:([A-Za-z]+))?(\d+))?", part)
        if not m:
            raise Fail("E_USAGE", "bad --exclude-ids range %r (use H301-H350 or H305)" % part, 64)
        prefix, lo, _p2, hi = m.group(1).upper(), int(m.group(2)), m.group(3), m.group(4)
        ranges.append((prefix, lo, int(hi) if hi else lo))
    return ranges


def excluded(sid, ranges):
    m = re.fullmatch(r"([A-Za-z]+)(\d+)", sid or "")
    if not m:
        return False
    return any(m.group(1).upper() == p and lo <= int(m.group(2)) <= hi for p, lo, hi in ranges)


def classify(row, overrides):
    """Return (kind, code, how): kind is family | lint | convert | none."""
    sid = source_id(row["id"])
    if sid and sid in overrides:
        return "family", overrides[sid], "family-map"
    csv_row = row.get("csv") or {}
    name = (csv_row.get("family") or "").strip().upper()
    if name:
        if name in CODE_BY_NAME:
            return "family", CODE_BY_NAME[name], "column"
        if name in FAMILIES:
            return "family", name, "column"
        if name in LINT_ONLY:
            return "lint", name, "column"
        if name == "HOWTO":
            return "convert", "HOWTO", "column"
    pb = (csv_row.get("playbook") or "").strip().upper()
    if pb in FAMILIES:
        return "family", pb, "column"
    text = row["text"]
    for pattern, target in HEURISTICS:
        if re.search(pattern, text):
            if target in FAMILIES:
                return "family", target, "heuristic"
            if target in LINT_ONLY:
                return "lint", target, "heuristic"
            return "convert", target, "heuristic"
    return "none", None, None


def skeletonize(text, template):
    """Turn a template row into (skeleton, slots). Instance rows keep their text unchanged."""
    slots = OrderedDict()
    if not template:
        return text, slots
    out = text
    n_s = n_n = 0

    def slot_type(label):
        if re.search(r"فعل|إجراء|نشاط|مهمة|خطوة", label):
            return "verb-phrase"
        if re.search(r"رقم|عدد|نسبة", label):
            return "number"
        if re.search(r"اسم|أداة|منصة|مكان|شخص", label):
            return "name"
        if re.search(r"جملة|موقف|سبب|شرط|سيناريو|مشكلة", label):
            return "clause"
        return "noun-phrase"

    def bracket(m):
        nonlocal n_s
        n_s += 1
        key = "s%d" % n_s
        label = m.group(1).strip()
        typ = slot_type(label)
        slots[key] = {"type": typ, "maxWords": 1 if typ == "number" else 4, "rule": label[:190]}
        return "{%s}" % key

    out = BRACKET_RE.sub(bracket, out)
    if not slots:
        # blanks written as an ellipsis
        def blank(m):
            nonlocal n_s
            n_s += 1
            key = "s%d" % n_s
            slots[key] = {"type": "clause", "maxWords": 6, "rule": "the blank the original opener leaves open"}
            at_start = m.start() == 0
            return "{%s}" % key if at_start else " {%s}…" % key

        out = ELLIPSIS_RE.sub(blank, out)
        out = re.sub(r"\s{2,}", " ", out).replace("{s1} …", "{s1}…")

    def number(m):
        nonlocal n_n
        n_n += 1
        key = "n%d" % n_n
        slots[key] = {"type": "number", "maxWords": 1, "rule": "list size or figure; figures need a source"}
        return "{%s}" % key

    out = NUMBER_RE.sub(number, to_western(out))
    return out.strip(), slots


def evidence_from_row(csv_row):
    """Results columns (metric, value, baseline, n) become one own-account evidence record."""
    metric = re.sub(r"[^a-z0-9]+", "-", (csv_row.get("metric") or "").strip().lower()).strip("-")
    try:
        value = float(csv_row.get("value", ""))
    except ValueError:
        return None
    if not re.fullmatch(r"[a-z][a-z0-9-]{1,39}", metric):
        return None
    record = {"tag": "D-own", "metric": metric, "value": value}
    for key in ("baseline", "n"):
        raw = (csv_row.get(key) or "").strip()
        try:
            record[key] = int(float(raw)) if key == "n" else float(raw)
        except ValueError:
            pass
    if "n" in record and record["n"] < 0:
        del record["n"]
    return record


def build_entry(row, code, dialect, source_name, serial, notes):
    name, ar, en, primary, also, awareness, arch, cta, fam_lints, fam_src = FAMILIES[code]
    csv_row = row.get("csv") or {}
    text = row["text"]
    sid = source_id(row["id"])
    reuse = (csv_row.get("reuse") or "").upper()
    template = reuse == "T" or row["type"].startswith("قالب") or bool(BRACKET_RE.search(text)) or row.get("is_template")
    skeleton_text, slots = skeletonize(text, template)

    intent = (csv_row.get("intent") or "").lower()
    intent = intent if intent in ("reach", "save", "send", "sell") else primary
    aw = (csv_row.get("awareness") or "").lower()
    awareness_list = [aw] if aw in ("unaware", "problem", "solution", "product") else awareness
    archetype = ARCHETYPES.get((csv_row.get("archetype") or "").upper())
    architectures = [archetype] if archetype else arch
    flags = [f for f in (csv_row.get("flags") or "").split(";") if f]
    lints = list(dict.fromkeys(fam_lints + [FLAG_LINTS[f] for f in flags if f in FLAG_LINTS]))
    role_key = (csv_row.get("role") or "").lower()
    roles = list(ROLES.get(role_key, ["cover", "caption-line1"]))
    if "reels_only" in flags:
        roles = ["spoken"]

    figure = bool(FIGURE_RE.search(to_western(text)))
    needs_source = fam_src or figure or "needs_source" in flags
    if needs_source and "number-needs-source" not in lints and (figure or "needs_source" in flags):
        lints.append("number-needs-source")

    entry_id = "%s-%s-%s" % (code, name, ("h%s" % sid[1:].lstrip("0").zfill(3)) if sid and sid[0] == "H"
                                         else ("%s" % sid.lower() if sid else "x%03d" % serial))
    entry = OrderedDict()
    entry["id"] = entry_id
    entry["family"] = code
    entry["variant"] = entry_id.split("-", 2)[2][:31]
    entry["name"] = {"ar": ("%s — %s" % (ar, sid or "")).strip(" —")[:120], "en": ("%s — %s" % (en, sid or "")).strip(" —")[:120]}
    entry["intent"] = {"primary": intent}
    extra = [i for i in also if i != intent]
    if extra:
        entry["intent"]["also"] = extra[:3]
    entry["awareness"] = awareness_list
    entry["architectures"] = architectures
    entry["contentType"] = "soft-sell" if code.startswith("S") or intent == "sell" else "value"
    entry["roles"] = roles
    entry["skeleton"] = {dialect: skeleton_text[:240] if len(skeleton_text) >= 3 else (skeleton_text + "   ")[:3]}
    entry["slots"] = dict(slots)
    entry["needsSource"] = bool(needs_source)
    cover = {"totalMaxWords": 12, "heroMaxWords": 6}
    if "…" in text:
        cover["breakAt"] = "…"
    entry["cover"] = cover
    entry["cta"] = cta
    entry["lints"] = lints[:12]
    if template:
        entry["maxUsePer"] = {"posts": 5, "count": 1}
    entry["status"] = row["status_final"]
    if figure or "unverifiable" in flags:
        entry["verified"] = False
    if sid or source_name:
        entry["source"] = {"file": source_name[:120]}
        if sid:
            entry["source"]["id"] = sid[:40]
    evidence = evidence_from_row(csv_row)
    if evidence:
        entry["evidence"] = [evidence]
    origin = "owner/%s" % sid if sid and re.fullmatch(r"H\d{3}", sid) else "user"
    example = {"text": text[:300], "dialect": dialect, "origin": origin, "visibility": "brand-private"}
    if notes:
        example["note"] = notes[:200]
    entry["examples"] = [] if template else [example]
    return entry


def merge_rows(row_sets):
    """Merge rows from several files by source id; columns from every file are kept (first value wins)."""
    merged, by_id, seq = [], {}, 0
    for rows in row_sets:
        for r in rows:
            sid = source_id(r["id"])
            if sid and sid in by_id:
                tgt = by_id[sid]
                for k in ("type", "status", "source", "section", "example"):
                    if r.get(k) and not tgt.get(k):
                        tgt[k] = r[k]
                tgt["csv"] = {**r.get("csv", {}), **tgt.get("csv", {})}
                continue
            seq += 1
            r = dict(r)
            r.setdefault("example", "")
            r["order"] = seq
            merged.append(r)
            if sid:
                by_id[sid] = r
    return merged


def family_priors(entries):
    """Median of the imported results per family: the shape of brand.hooks.familyPriors."""
    by_family = {}
    for e in entries:
        for ev in e.get("evidence", []):
            by_family.setdefault(e["family"], []).append(ev)
    out = {}
    for family, evs in by_family.items():
        metric = Counter(ev["metric"] for ev in evs).most_common(1)[0][0]
        same = [ev for ev in evs if ev["metric"] == metric]
        values = sorted(ev["value"] for ev in same)
        mid = len(values) // 2
        median = values[mid] if len(values) % 2 else (values[mid - 1] + values[mid]) / 2
        prior = {"metric": metric, "value": round(median, 2), "n": sum(ev.get("n", 1) for ev in same)}
        baselines = sorted(ev["baseline"] for ev in same if "baseline" in ev)
        if baselines:
            prior["baseline"] = baselines[len(baselines) // 2]
        out[family] = prior
    return out


def run(args):
    if args.visibility != "brand-private":
        raise Fail("E_USAGE", "--visibility accepts only brand-private: imported hook banks never become public files", 64)
    overrides = {}
    if args.family_map:
        try:
            overrides = {k.upper(): v.upper() for k, v in paths.read_json(args.family_map).items()}
        except (OSError, ValueError) as exc:
            raise Fail("E_SCHEMA", "cannot read --family-map: %s" % exc, 65)
        bad = [v for v in overrides.values() if v not in FAMILIES]
        if bad:
            raise Fail("E_USAGE", "--family-map holds unknown family codes: %s" % ", ".join(sorted(set(bad))), 64)
    brand = None
    default_dialect = "eg"
    if args.brand:
        try:
            brand = paths.read_json(args.brand)
            default_dialect = (brand.get("locale") or {}).get("dialect", default_dialect)
        except (OSError, ValueError) as exc:
            raise Fail("E_SCHEMA", "cannot read --brand: %s" % exc, 65)
    ranges = parse_id_ranges(args.exclude_ids)

    row_sets, names = [], []
    for item in args.inputs:
        p = Path(item)
        if not p.exists():
            raise Fail("E_USAGE", "input %s not found" % p, 66)
        ext = p.suffix.lower()
        if ext == ".csv":
            row_sets.append(read_csv_rows(p))
        elif ext in (".md", ".markdown", ".txt"):
            row_sets.append(read_md_rows(p))
        else:
            raise Fail("E_USAGE", "unsupported input %s (use .md or .csv)" % p.name, 64)
        names.append(p.name)
    source_name = names[0] if len(names) == 1 else "+".join(names)[:120]
    rows = merge_rows(row_sets)
    if not rows:
        raise Fail("E_SCHEMA", "no hook rows found: expected a table with a text column or a CSV with a text column", 65)

    # abstract templates inherit the family of the example they cite
    by_sid = {source_id(r["id"]): r for r in rows if source_id(r["id"])}
    mapping, entries = [], {"ar": [], "en": []}
    seen_text, serial = {}, 0
    client_re = re.compile(r"عميل|عملاء|clients?", re.I)
    section_res = [re.compile(re.escape(x), re.I) for x in args.exclude_sections if x.strip()]
    for row in rows:
        # when two files disagree the strongest status wins (used > approved > proposed)
        rank = {"proposed": 0, "approved": 1, "used": 2}
        row["status_final"] = max((map_status(row.get("status")), map_status((row.get("csv") or {}).get("status"))),
                                  key=rank.get)
        sid = source_id(row["id"])
        label = sid or "row-%d" % row["order"]
        base = {"id": label, "text": row["text"][:80]}
        if BRACKET_RE.search(row["text"]):
            row["is_template"] = True
        in_excluded_section = any(rx.search(row.get("section", "")) for rx in section_res)
        if (not args.include_client) and (excluded(sid, ranges) or client_re.search(row.get("section", "")) or in_excluded_section):
            mapping.append({"id": label, "disposition": "client-excluded",
                            "note": "client copy is kept out of the personal hook pack (use --include-client to import it)"})
            continue
        key = fold(row["text"])
        if key in seen_text:
            mapping.append({**base, "disposition": "duplicate", "of": seen_text[key]})
            continue
        seen_text[key] = label
        kind, code, how = classify(row, overrides)
        if kind == "none" and row.get("example"):
            ref = by_sid.get(source_id(row["example"].split()[0] if row["example"] else ""))
            if ref:
                k2, c2, _h = classify(ref, overrides)
                if k2 == "family":
                    kind, code, how = "family", c2, "example-of"
        if kind == "lint":
            mapping.append({**base, "disposition": "lint-only", "family": code, "note": LINT_ONLY[code]})
            continue
        if kind == "convert":
            code = "P14" if re.search(r"(?:من غير|بدون|without)\s", row["text"]) else HOWTO_TO
            how = "converted-from-HOWTO"
        if kind == "none":
            mapping.append({**base, "disposition": "unclassified",
                            "note": "no family matched; assign one with --family-map {id: code}"})
            continue
        dialect = DIALECT_CODES.get((row.get("csv") or {}).get("dialect", "").upper()) or detect_dialect(row["text"], default_dialect)
        serial += 1
        entry = build_entry(row, code, dialect, source_name, serial, "client copy" if args.include_client and client_re.search(row.get("section", "")) else "")
        errors = schema.validate_named("hook", entry, def_name="entry")
        if errors:
            mapping.append({**base, "disposition": "invalid", "family": code,
                            "note": "; ".join("%s %s" % (e["path"] or "/", e["message"]) for e in errors[:3])})
            continue
        lang = "en" if dialect == "en" else "ar"
        entries[lang].append(entry)
        mapping.append({**base, "disposition": "converted" if how == "converted-from-HOWTO" else "entry",
                        "family": code, "entryId": entry["id"], "classifiedBy": how})

    # entry ids must be unique inside a library
    for lang in entries:
        seen = Counter()
        for e in entries[lang]:
            seen[e["id"]] += 1
            if seen[e["id"]] > 1:
                e["id"] = "%s-%d" % (e["id"], seen[e["id"]])
                e["variant"] = e["id"].split("-", 2)[2][:31]
    libraries = {}
    for lang in ("ar", "en"):
        if entries[lang]:
            libraries[lang] = {"schemaVersion": 1, "kind": "hook-library", "language": lang, "visibility": "brand-private",
                               "libraryVersion": "1.0.0", "entries": sorted(entries[lang], key=lambda e: e["id"])}
            errs = schema.validate_named("hook", libraries[lang], def_name="library")
            if errs:
                raise Fail("E_SCHEMA", "library %s invalid: %s" % (lang, errs[:3]), 2)
    counts = Counter(m["disposition"] for m in mapping)
    families = Counter(m["family"] for m in mapping if m.get("entryId"))
    pack_slug = None
    if brand:
        pack_slug = re.sub(r"[^a-z0-9-]", "-", (brand.get("slug", "brand") + "-hooks").lower())[:40].strip("-")
    priors = family_priors([e for lang in entries for e in entries[lang]])
    result = {"ok": True, "visibility": "brand-private", "libraries": libraries, "mapping": mapping,
              "stats": {"rows": len(mapping), "dispositions": dict(counts), "families": dict(families),
                        "entries": {k: len(v) for k, v in entries.items()}},
              "pack": {"slug": pack_slug, "brandUpdate": {"hooks.packs": [pack_slug]} if pack_slug else None,
                       "familyPriors": priors}}
    return result, counts


def write_outputs(args, result):
    """Arabic entries go to --out, English entries to <name>.en.json (or to --out when they are the only ones)."""
    written = []
    if not args.out:
        return written
    out = Path(args.out)
    libs = result["libraries"]
    for lang, lib in libs.items():
        target = out if (lang == "ar" or "ar" not in libs) else out.with_name(
            out.name.replace(".ar.", ".en.") if ".ar." in out.name else out.stem + ".en" + out.suffix)
        try:
            paths.write_json(target, lib)
        except OSError as exc:
            raise Fail("E_ABORTED", "cannot write %s: %s" % (target, exc), 73)
        written.append(str(target))
    return written


def render_text(result, written):
    st = result["stats"]
    lines = ["تم تحليل %d صف" % st["rows"]]
    names = {"entry": "هوكات مستوردة", "converted": "تحوّلت لصيغة أقرب", "lint-only": "تنبيهات فقط (مش صيغ)",
             "unclassified": "غير مصنّف", "duplicate": "مكرر", "client-excluded": "نصوص عملاء مستبعدة", "invalid": "غير صالح"}
    for k, v in st["dispositions"].items():
        lines.append("  %s: %d" % (names.get(k, k), v))
    for lang, n in st["entries"].items():
        lines.append("  مكتبة %s: %d مدخلة" % (lang, n))
    lines += ["  كُتب: %s" % w for w in written]
    return "\n".join(lines)


def main(argv=None):
    ap = Parser(prog="import_hooks.py", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--in", dest="inputs", action="append", required=True, metavar="FILE", help="Markdown or CSV hook bank (repeatable)")
    ap.add_argument("--visibility", default="brand-private")
    ap.add_argument("--brand", help="brand.json: its dialect fills rows whose dialect cannot be detected")
    ap.add_argument("--out", help="library file for Arabic entries; English entries go to <name>.en.json")
    ap.add_argument("--family-map", help='JSON {"H123": "F17"} to classify or override rows')
    ap.add_argument("--exclude-ids", default="", help="comma separated id ranges to leave out, e.g. H301-H350")
    ap.add_argument("--exclude-sections", action="append", default=[], metavar="TEXT",
                    help="leave out rows under headings that contain TEXT (repeatable); client headings are left out already")
    ap.add_argument("--include-client", action="store_true", help="also import rows under client headings")
    ap.add_argument("--format", choices=("text", "json"), default="text")
    args = ap.parse_args(argv)
    try:
        result, counts = run(args)
        written = write_outputs(args, result)
    except Fail as exc:
        sys.stderr.write("cs-error: %s: %s\n" % (exc.code, exc))
        return exc.exit_code
    result["written"] = written
    if args.format == "json":
        print(json.dumps(result, ensure_ascii=False))
    else:
        print(render_text(result, written))
    return 1 if (counts.get("unclassified") or counts.get("invalid")) else 0


if __name__ == "__main__":
    sys.exit(main())
