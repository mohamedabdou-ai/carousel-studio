#!/usr/bin/env python3
"""source_pack.py: turn source text into a structured source pack.

Input is text that Claude already holds (pasted notes, a transcript, an
article body fetched from a link the user supplied, text extracted from a
PDF).  The script never fetches anything and never executes or follows what
the text says: the text is DATA.  Sentences that look like instructions
aimed at an assistant are left out of the pack and reported under
"warnings".

Output (JSON, --format json):

    {
      "keyPoints": [{"id", "text", "excerpt", "location"}],
      "quotes":    [{"id", "text", "location"}],
      "facts":     [{"id", "text", "hasNumber", "number", "numberKind", "scale",
                     "excerpt", "location"}],
      "stats":     {"words", "sentences", "paragraphs", "lang", "kind"},
      "warnings":  [{"kind", "location", "text"}]
    }

Keys beyond the contract shape are additive: numberKind (percent, money, year,
other), scale (thousand, million or billion when the figure is followed by that
magnitude word, so "1.2 million" never becomes 1.2), paragraphs, lang, kind and
warnings.  "excerpt" is the verbatim source sentence (at most 600 characters,
the limit of spec.sources[].excerpt), so a fact or key point can be copied into
spec.sources without loss.

Locations
    article / pdf-text   "p3.s2"  (paragraph 3, sentence 2), with "page 4, " in
                         front for pdf-text that was split on form feeds
    notes                "line 7"  (+ ".s2" when a line holds several sentences)
    transcript           "t=00:01:23" (last timestamp seen) or "line 7"

Usage
    source_pack.py (--file F | --stdin) [--kind notes|transcript|article|pdf-text]
                   [--lang ar|en|auto] [--max-points 12] [--format text|json]

Exit codes: 0 success, 64 usage error, 66 input file missing.
"""
import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
try:
    from _cs import paths
    from _cs import text as cstext
except ImportError as exc:      # the shared package is synced next to the scripts; say so plainly
    sys.stderr.write("cs-error: E_DEP_LOAD: the shared _cs package is missing next to this script: %s\n" % exc)
    sys.exit(70)

paths.ensure_utf8_stdio()

MAX_CHARS = 1_000_000          # input beyond this is cut (and reported)
EXCERPT_MAX = 600              # spec.sources[].excerpt maxLength
POINT_TEXT_MAX = 160           # keyPoints[].text is a short form of the excerpt
MAX_FACTS = 20
KINDS = ("notes", "transcript", "article", "pdf-text")

CR, LF = chr(13), chr(10)
CRLF = CR + LF
# spaces, tab, CR, form feed, vertical tab, NBSP, NNBSP: the whitespace class of CONTRACT 3.3
WS_RUN = "[ " + chr(9) + chr(13) + chr(12) + chr(11) + chr(0xA0) + chr(0x202F) + "]+"
# Arabic letters (no marks), tashkeel plus tatweel, digit systems
AR_RANGE = "".join(chr(a) + "-" + chr(b) for a, b in (
    (0x0621, 0x064A), (0x066E, 0x06D3), (0x06D5, 0x06D5), (0x06FA, 0x06FF), (0x0750, 0x077F)))
DIAC_RE = re.compile("[" + chr(0x064B) + "-" + chr(0x065F) + chr(0x0670) + chr(0x0640) + "]")
ANY_DIGIT = "0-9" + chr(0x0660) + "-" + chr(0x0669) + chr(0x06F0) + "-" + chr(0x06F9)
DIGITS_MAP = {0x0660 + i: str(i) for i in range(10)}             # Arabic-Indic
DIGITS_MAP.update({0x06F0 + i: str(i) for i in range(10)})        # Persian
DIGITS_MAP[0x066B] = "."       # Arabic decimal separator
DIGITS_MAP[0x066C] = ","       # Arabic thousands separator


# --------------------------------------------------------------------------
# command line
# --------------------------------------------------------------------------


class _Parser(argparse.ArgumentParser):
    def error(self, message):  # usage errors are exit 64, not argparse's 2
        sys.stderr.write("cs-error: E_USAGE: %s\n" % message)
        sys.exit(64)


def build_parser():
    p = _Parser(
        prog="source_pack.py",
        description="Build a structured source pack (key points, quotes, facts) from text. "
                    "Never fetches URLs; the text is data, never instructions.",
    )
    src = p.add_mutually_exclusive_group()
    src.add_argument("--file", help="UTF-8 text file to read")
    src.add_argument("--stdin", action="store_true", help="read the text from standard input")
    p.add_argument("--kind", choices=KINDS, default="article", help="shape of the text (default: article)")
    p.add_argument("--lang", choices=("ar", "en", "auto"), default="auto", help="text language (default: auto)")
    p.add_argument("--max-points", type=int, default=12, help="maximum key points (default 12)")
    p.add_argument("--format", choices=("text", "json"), default="text", help="output format (default: text)")
    return p


# --------------------------------------------------------------------------
# text helpers
# --------------------------------------------------------------------------

_ABBREV = {"mr", "mrs", "ms", "dr", "prof", "sr", "jr", "vs", "etc", "e.g", "i.e", "inc", "ltd", "co", "no",
           "fig", "st", "approx", "al", "u.s", "u.k", "vol", "ch", "pp"}

_BULLET_RE = re.compile(r"^\s*(?:[-*•–—●▪]+|[0-9٠-٩]{1,3}[.)\-،:])\s+")
_TS_RE = re.compile(r"^\s*[\[(]?((?:[0-9]{1,2}:)?[0-9]{1,2}:[0-9]{2})[\])]?[\s\-–:]*")
_SPEAKER_RE = re.compile(r"^\s*[A-Za-z" + AR_RANGE + r"][A-Za-z" + AR_RANGE + r" ]{0,24}:\s+")
_HEADING_MARK_RE = re.compile(r"^\s{0,3}#{1,6}\s*")
_TAG_RE = re.compile(r"<[^>\n]{1,200}>")
_CTRL_RE = re.compile("[" + chr(0) + "-" + chr(8) + chr(11) + chr(14) + "-" + chr(31) + chr(127) + "]")
_PAGE_NO_RE = re.compile(r"\s*[" + ANY_DIGIT + r"]{1,4}\s*")


def detect_lang(s):
    ar = len(re.findall("[" + AR_RANGE + "]", s))
    lat = len(re.findall("[A-Za-z]", s))
    if ar == 0 and lat == 0:
        return "en"
    return "ar" if ar >= lat else "en"


def split_sentences(s):
    """Split on . ! ? ؟ … with care for decimals, abbreviations and URLs."""
    out, start, n, i = [], 0, len(s), 0
    while i < n:
        ch = s[i]
        if ch in ".!?؟…":
            j = i + 1
            while j < n and s[j] in ".!?؟…\"'»”’)]":
                j += 1
            nxt = s[j] if j < n else ""
            if ch == ".":
                prev = s[i - 1] if i > 0 else ""
                if prev.isdigit() and nxt.isdigit():
                    i = j
                    continue
                m = re.search(r"([A-Za-z][A-Za-z.]*)$", s[start:i])
                if m and m.group(1).lower().rstrip(".") in _ABBREV:
                    i = j
                    continue
                if nxt and not nxt.isspace():
                    i = j
                    continue
            if j >= n or nxt.isspace():
                sent = s[start:j].strip()
                if sent:
                    out.append(sent)
                start = j
            i = j
        else:
            i += 1
    tail = s[start:].strip()
    if tail:
        out.append(tail)
    return out


def squash(s):
    return re.sub(WS_RUN, " ", s).strip()


def clip(s, limit):
    s = s.strip()
    if len(s) <= limit:
        return s
    cut = s[:limit].rsplit(" ", 1)[0].rstrip(",;:،؛")
    return cut + "…"


# --------------------------------------------------------------------------
# segmentation: text -> units (one sentence + a location)
# --------------------------------------------------------------------------


def _para_units(block, loc_prefix, para_no, out):
    """Add the sentences of one paragraph to `out`."""
    single_line = LF not in block.strip()
    flat = squash(block.replace(LF, " "))
    if not flat:
        return
    short_unpunctuated = len(flat.split()) <= 8 and not re.search(r"[.!?؟…:,،]$", flat)
    sentences = split_sentences(flat)
    for k, sent in enumerate(sentences, 1):
        out.append({"loc": "%sp%d.s%d" % (loc_prefix, para_no, k), "text": sent, "first": k == 1,
                    "heading": single_line and short_unpunctuated and len(sentences) == 1, "para": para_no})


def build_units(raw, kind):
    units, paragraphs = [], 0
    if kind in ("article", "pdf-text"):
        pages = raw.split(chr(12)) if kind == "pdf-text" and chr(12) in raw else [raw]
        for pno, page in enumerate(pages, 1):
            prefix = "page %d, " % pno if len(pages) > 1 else ""
            page = LF.join(ln for ln in page.split(LF) if not _PAGE_NO_RE.fullmatch(ln))
            if kind == "pdf-text":
                page = re.sub(r"([A-Za-zء-ي])-\n([a-zء-ي])", r"\1\2", page)   # join words hyphenated at a line end
            for block in (b for b in re.split(r"\n[ \t]*\n", page) if b.strip()):
                paragraphs += 1
                _para_units(_HEADING_MARK_RE.sub("", block), prefix, paragraphs, units)
        return units, paragraphs

    ts = None
    for lineno, line in enumerate(raw.split(LF), 1):
        if not line.strip():
            continue
        body = line
        if kind == "transcript":
            m = _TS_RE.match(body)
            if m:
                ts = m.group(1)
                body = body[m.end():]
            body = _SPEAKER_RE.sub("", body, count=1)
        else:
            body = _BULLET_RE.sub("", body, count=1)
        body = squash(_HEADING_MARK_RE.sub("", body))
        if not body:
            continue
        paragraphs += 1
        sentences = split_sentences(body)
        base = ("t=%s" % ts) if (kind == "transcript" and ts) else "line %d" % lineno
        for k, sent in enumerate(sentences, 1):
            loc = base if len(sentences) == 1 else "%s.s%d" % (base, k)
            units.append({"loc": loc, "text": sent, "first": k == 1, "heading": False, "para": paragraphs})
    return units, paragraphs


# --------------------------------------------------------------------------
# instruction-like text (prompt injection) detection.  Best effort: the real
# defence is the rule that source text is data; this makes attempts visible.
# --------------------------------------------------------------------------

_INJECTION = [
    r"ignore\s+(?:all\s+|any\s+|the\s+|your\s+|these\s+)?(?:previous|prior|above|earlier)\s+(?:instructions|prompts?|rules|messages)",
    r"disregard\s+(?:all\s+|any\s+|the\s+|your\s+)?(?:previous|prior|above|earlier)?\s*(?:instructions|prompts?|rules)",
    r"forget\s+(?:all\s+|everything\s+|your\s+)?(?:previous|prior|above|earlier)?\s*(?:instructions|rules)",
    r"\byou\s+are\s+now\s+(?:a|an|the|in)\b",
    r"\bsystem\s+prompt\b",
    r"\bnew\s+instructions?\s*:",
    r"\b(?:do\s+not|don'?t)\s+(?:tell|inform|mention\s+(?:this\s+)?to)\s+the\s+user\b",
    r"\b(?:reveal|print|show|leak)\s+(?:your|the)\s+(?:system\s+|hidden\s+)?(?:prompt|instructions|api\s*key|secrets?)\b",
    r"\b(?:call|invoke|use|run)\s+the\s+(?:tool|function|command)\b",
    r"\b(?:run|execute)\s+(?:the\s+following|this)\s+(?:command|code|script)\b",
    r"\b(?:send|forward|upload|post)\s+(?:this|the|your)\s+(?:data|file|password|token|key|conversation)s?\s+to\b",
    r"</?\s*(?:system|assistant|instructions?)\s*>",
    r"\[/?INST\]",
    r"^\s*(?:assistant|system)\s*:",
    r"تجاهل\s+(?:كل\s+|جميع\s+)?(?:التعليمات|الأوامر|القواعد)\s+(?:السابقة|الماضية)",
    r"تجاهل\s+ما\s+سبق",
    r"أنت\s+الآن\s+(?:مساعد|خبير|نظام)",
    r"تعليمات\s+جديدة\s*:",
    r"لا\s+تخبر\s+المستخدم",
    r"نفذ\s+الأمر\s+التالي",
    r"اكشف\s+(?:عن\s+)?(?:التعليمات|الموجه|مفتاح)",
    r"(?:أرسل|ارسل)\s+(?:كلمة\s+السر|كلمات\s+المرور|المفتاح)",
]
_INJECTION_RE = [re.compile(p, re.IGNORECASE) for p in _INJECTION]


def looks_like_instruction(sentence):
    flat = DIAC_RE.sub("", sentence)
    return any(rx.search(flat) for rx in _INJECTION_RE)


# --------------------------------------------------------------------------
# terms and scoring
# --------------------------------------------------------------------------

_STOP_AR = set("""
في من على الى إلى عن مع هذا هذه ذلك تلك هو هي هم هن انا أنا نحن انت أنت انتم كان كانت يكون تكون ان أن إن لا لم لن ما مش
قد كل بعض اي أي او أو ثم لكن بل حتى اذا إذا لو كما عند بين بعد قبل خلال هناك هنا اللي ده دي دول ايه إيه ليه كده كمان
بس يعني عشان علشان لانه لأنه لان لأن الذي التي الذين وهو وهي وان وأن فقط جدا أيضا ايضا مثل غير نفس نحو منذ
""".split())
_STOP_EN = set("""
the a an and or but if then else of to in on at by for with from as is are was were be been being it its this that these
those i you he she we they them his her their our your my me not no do does did done have has had will would can could
should may might must so than too very just about into over under again also more most some any each other such only own
same there here what which who whom how why when where all both few
""".split())
_STOP_AR_NORM = None


def norm_term(w, lang):
    w = DIAC_RE.sub("", w).lower()
    if lang == "ar":
        w = (w.replace("أ", "ا").replace("إ", "ا").replace("آ", "ا").replace("ٱ", "ا")
             .replace("ى", "ي").replace("ة", "ه"))
        for pre in ("وال", "بال", "كال", "فال", "لل", "ال"):
            if w.startswith(pre) and len(w) - len(pre) >= 3:
                return w[len(pre):]
        if len(w) >= 5 and w[0] in "وف":
            w = w[1:]
    return w


def stop_ar():
    global _STOP_AR_NORM
    if _STOP_AR_NORM is None:
        _STOP_AR_NORM = {norm_term(w, "ar") for w in _STOP_AR}
    return _STOP_AR_NORM


def terms_of(sentence, lang):
    out = []
    for raw in re.findall("[A-Za-zÀ-ɏ" + AR_RANGE + "][A-Za-zÀ-ɏ" + AR_RANGE + "0-9'’-]*", sentence):
        t = norm_term(raw.strip("'’-"), lang)
        if len(t) < 3 or t.isdigit() or t in _STOP_EN or t in stop_ar():
            continue
        out.append(t)
    return out


# --------------------------------------------------------------------------
# numbers
# --------------------------------------------------------------------------

_NUM_RE = re.compile(r"(?<![A-Za-z0-9_])([$€£]?)([" + ANY_DIGIT + r"]+(?:[.,٫٬][" + ANY_DIGIT + r"]+)*)")
_DATE_RE = re.compile(r"[0-9]{4}-[0-9]{2}-[0-9]{2}|[0-9]{1,2}/[0-9]{1,2}/[0-9]{2,4}|[0-9]{1,2}:[0-9]{2}(?::[0-9]{2})?")
_CURRENCY_AFTER = re.compile(
    r"^\s{0,2}(?:دولار|جنيه|ريال|درهم|دينار|يورو|ليرة|دولارات|جنيهات|ريالات|دراهم|دنانير|usd|eur|egp|sar|aed|"
    r"dollars?|euros?|pounds?|riyals?|dirhams?)", re.IGNORECASE)
_SCALE_NAMES = {"مليون": "million", "ملايين": "million", "مليار": "billion", "مليارات": "billion", "ألف": "thousand",
                "آلاف": "thousand", "الف": "thousand", "million": "million", "billion": "billion", "thousand": "thousand"}
_SCALE_AFTER = re.compile(r"^\s{0,1}(" + "|".join(sorted(_SCALE_NAMES, key=len, reverse=True)) + r")", re.IGNORECASE)
_PERCENT_AFTER = re.compile(r"^\s{0,1}(?:%|٪|في\s+المئة|بالمئة|بالمائة|percent|per\s+cent)", re.IGNORECASE)
_ATTRIBUTION = re.compile(
    r"(?:وفقا\s+ل|بحسب|حسب|أظهرت\s+دراسة|أشارت\s+دراسة|دراسة|استطلاع|تقرير|إحصائية|"
    r"according\s+to|a\s+study|study\s+(?:by|from|found|shows)|survey|report(?:ed|s)?\s+(?:by|that)|"
    r"research\s+(?:shows|found)|statistics)",
    re.IGNORECASE)


def normalize_number(raw):
    s = raw.translate(DIGITS_MAP)
    if re.fullmatch(r"[0-9]{1,3}(,[0-9]{3})+(\.[0-9]+)?", s):
        return s.replace(",", "")
    if re.fullmatch(r"[0-9]+,[0-9]+", s):
        return s.replace(",", ".")
    return s.replace(",", "")


def find_numbers(sentence):
    """Return [{'value','kind','scale','start'}] for every claimed number in the sentence."""
    found = []
    sentence = _DATE_RE.sub(lambda m: " " * len(m.group(0)), sentence)   # dates and clock times are not claims
    for m in _NUM_RE.finditer(sentence):
        cur, raw = m.group(1), m.group(2)
        tail = sentence[m.end():m.end() + 24]
        value = normalize_number(raw)
        if not re.fullmatch(r"[0-9]+(\.[0-9]+)?", value):
            continue
        if _PERCENT_AFTER.match(tail):
            kind = "percent"
        elif cur or _CURRENCY_AFTER.match(tail):
            kind = "money"
        elif re.fullmatch(r"(19|20)[0-9]{2}", value):
            kind = "year"
        else:
            kind = "other"
        sm = _SCALE_AFTER.match(tail)
        found.append({"value": value, "kind": kind, "scale": _SCALE_NAMES[sm.group(1).lower()] if sm else None,
                      "start": m.start()})
    return found


_KIND_RANK = {"percent": 0, "money": 1, "other": 2, "year": 3}


def salient_number(numbers):
    if not numbers:
        return None
    return sorted(numbers, key=lambda n: (_KIND_RANK[n["kind"]], n["start"]))[0]


# --------------------------------------------------------------------------
# selection
# --------------------------------------------------------------------------


def jaccard(a, b):
    if not a or not b:
        return 0.0
    return len(a & b) / float(len(a | b))


def pick_key_points(units, tf, limit):
    scored = []
    for idx, u in enumerate(units):
        if u["heading"] or not u["terms"]:
            continue
        w = u["words"]
        if w < 4:                      # fragments ("Welcome back.") are never key points
            continue
        uniq = set(u["terms"])
        base = sum(tf[t] for t in uniq) / (len(uniq) ** 0.6 + 1.0)
        if u["numbers"]:
            base *= 1.15
        if idx == 0:
            base *= 1.25
        elif u["first"]:
            base *= 1.10
        base *= 0.8 if w < 9 else 1.0 if w <= 30 else 0.8 if w <= 45 else 0.5
        scored.append((base, idx))
    scored.sort(key=lambda p: (-p[0], p[1]))
    if scored:
        floor = scored[0][0] * 0.2     # nothing far below the best sentence either
        scored = [p for p in scored if p[0] >= floor]
    chosen, term_sets = [], []
    for score, idx in scored:
        ts = set(units[idx]["terms"])
        if any(jaccard(ts, other) >= 0.6 for other in term_sets):
            continue
        chosen.append(idx)
        term_sets.append(ts)
        if len(chosen) >= limit:
            break
    return sorted(chosen), {idx: score for score, idx in scored}


_QUOTE_RE = re.compile(r"«([^«»]{12,300})»|“([^“”]{12,300})”|\"([^\"]{12,300})\"")
_CONTRAST = re.compile(
    r"(?:لكن|\bبل\b|\bمش\b|ليس|\bلا\s|أبدا|دائما|\bnot\b|\bbut\b|\bnever\b|\balways\b|\bstop\b|\bdon'?t\b)",
    re.IGNORECASE)


def pick_quotes(units, scores, cap):
    quotes, seen = [], set()
    for u in units:
        for m in _QUOTE_RE.finditer(u["text"]):
            q = squash(next(g for g in m.groups() if g))
            n = cstext.word_count(q)
            if 4 <= n <= 35 and q not in seen:
                seen.add(q)
                quotes.append({"text": q, "location": u["loc"]})
    punchy = []
    for idx, u in enumerate(units):
        if u["heading"] or not (4 <= u["words"] <= 16) or u["text"] in seen:
            continue
        if any(q["text"] in u["text"] for q in quotes):      # already offered as a quoted span
            continue
        if _CONTRAST.search(DIAC_RE.sub("", u["text"])) or u["text"].endswith(("!", "?", "؟")):
            punchy.append((scores.get(idx, 0.0), idx))
    punchy.sort(key=lambda p: (-p[0], p[1]))
    for _, idx in punchy:
        u = units[idx]
        if u["text"] not in seen:
            seen.add(u["text"])
            quotes.append({"text": u["text"], "location": u["loc"]})
    return quotes[:cap]


def pick_facts(units):
    facts = []
    for u in units:
        if u["heading"]:
            continue
        attributed = bool(_ATTRIBUTION.search(DIAC_RE.sub("", u["text"])))
        top = salient_number(u["numbers"])
        if top is None and not attributed:
            continue
        facts.append({
            "text": clip(u["text"], POINT_TEXT_MAX + 40),
            "hasNumber": top is not None,
            "number": top["value"] if top else None,
            "numberKind": top["kind"] if top else None,
            "scale": top["scale"] if top else None,
            "excerpt": clip(u["text"], EXCERPT_MAX),
            "location": u["loc"],
            "_rank": _KIND_RANK[top["kind"]] if top else 4,
        })
    ranked = sorted(range(len(facts)), key=lambda i: (facts[i]["_rank"], i))[:MAX_FACTS]
    out = []
    for i in sorted(ranked):
        f = dict(facts[i])
        f.pop("_rank")
        out.append(f)
    return out


# --------------------------------------------------------------------------
# pipeline
# --------------------------------------------------------------------------


def build_pack(raw, kind="article", lang="auto", max_points=12):
    warnings = []
    raw = raw.lstrip(chr(0xFEFF)).replace(CRLF, LF).replace(CR, LF)
    raw = _CTRL_RE.sub("", raw)
    if len(raw) > MAX_CHARS:
        raw = raw[:MAX_CHARS]
        warnings.append({"kind": "truncated", "location": "", "text": "input cut at %d characters" % MAX_CHARS})
    if "<" in raw and ">" in raw:
        raw = _TAG_RE.sub(" ", raw)
    raw = cstext.normalize(raw)
    language = detect_lang(raw) if lang == "auto" else lang

    units, paragraphs = build_units(raw, kind)
    kept = []
    for u in units:
        if looks_like_instruction(u["text"]):
            warnings.append({"kind": "instruction-like", "location": u["loc"], "text": clip(u["text"], 100)})
            continue
        u["words"] = cstext.word_count(u["text"])
        u["terms"] = [] if u["heading"] else terms_of(u["text"], language)
        u["numbers"] = [] if u["heading"] else find_numbers(u["text"])
        kept.append(u)
    body = [u for u in kept if not u["heading"]]
    if not body:
        warnings.append({"kind": "empty", "location": "", "text": "no usable sentences"})

    tf = {}
    for u in kept:
        for t in u["terms"]:
            tf[t] = tf.get(t, 0) + 1

    limit = max(1, int(max_points))
    chosen, scores = pick_key_points(kept, tf, limit)
    key_points = [{
        "id": "k%d" % (n + 1),
        "text": clip(kept[idx]["text"], POINT_TEXT_MAX),
        "excerpt": clip(kept[idx]["text"], EXCERPT_MAX),
        "location": kept[idx]["loc"],
    } for n, idx in enumerate(chosen)]
    quotes = [dict(id="q%d" % (n + 1), **q) for n, q in enumerate(pick_quotes(kept, scores, max(3, min(8, limit // 2))))]
    facts = [dict(id="f%d" % (n + 1), **f) for n, f in enumerate(pick_facts(kept))]

    return {
        "keyPoints": key_points,
        "quotes": quotes,
        "facts": facts,
        "stats": {"words": cstext.word_count(" ".join(u["text"] for u in body)) if body else 0,
                  "sentences": len(body), "paragraphs": paragraphs, "lang": language, "kind": kind},
        "warnings": warnings,
    }


def render_text(pack):
    st = pack["stats"]
    lines = ["source pack  kind=%s  lang=%s  words=%d  sentences=%d" % (st["kind"], st["lang"], st["words"], st["sentences"])]
    sections = (
        ("key points", "keyPoints", lambda r: "%s  [%s]  %s" % (r["id"], r["location"], r["text"])),
        ("quotes", "quotes", lambda r: "%s  [%s]  %s" % (r["id"], r["location"], r["text"])),
        ("facts", "facts", lambda r: "%s  [%s]  number=%s%s (%s)  %s" % (
            r["id"], r["location"], r["number"], " " + r["scale"] if r["scale"] else "", r["numberKind"] or "-", r["text"])),
        ("warnings", "warnings", lambda r: "%s  [%s]  %s" % (r["kind"], r["location"], r["text"])),
    )
    for title, key, fmt in sections:
        rows = pack[key]
        lines.append("")
        lines.append("%s (%d)" % (title, len(rows)))
        lines.extend("  " + fmt(r) for r in rows)
    return LF.join(lines) + LF


def read_input(args):
    if args.stdin:
        return sys.stdin.buffer.read().decode("utf-8", "replace")
    if args.file:
        path = Path(args.file)
        if not path.is_file():
            sys.stderr.write("cs-error: E_USAGE: input file not found: %s\n" % args.file)
            sys.exit(66)
        return path.read_bytes().decode("utf-8", "replace")
    sys.stderr.write("cs-error: E_USAGE: give --file F or --stdin\n")
    sys.exit(64)


def main(argv=None):
    args = build_parser().parse_args(argv)
    raw = read_input(args)
    pack = build_pack(raw, kind=args.kind, lang=args.lang, max_points=args.max_points)
    if args.format == "json":
        sys.stdout.write(json.dumps(pack, ensure_ascii=False, indent=2) + LF)
    else:
        sys.stdout.write(render_text(pack))
    return 0


if __name__ == "__main__":
    sys.exit(main())
