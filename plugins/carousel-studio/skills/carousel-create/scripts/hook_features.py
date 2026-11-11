#!/usr/bin/env python3
"""hook_features.py: the deterministic half of the hook score (CONTRACT 9.2, hook-scoring.md).

For each hook it computes what code can know: the five hard gates HG1 to HG5, the four rule scores of the R part (scannability,
specificity, awareness fit, voice fit), the prior P from the family's evidence, the penalties and the similarity to hooks the
brand already used. The judge part J (gap quality, save/send trigger, slide-2 deliverability) stays with the model; pass it back
with --judge to get the final order. Gates marked "judged" (HG2, HG3) are code-checked first and the model still has the last word.

Usage
    hook_features.py --text STRING --dialect D [--cover STRING] [--role cover|slide2|caption-line1|spoken]
                     [--intent reach|save|send|sell] [--awareness unaware|problem|solution|product] [--family CODE]
                     [--brand FILE] [--library DIR] [--history FILE] [--sourced 90,52] [--format json|text] [--lang ar|en]
    hook_features.py --batch FILE.json --dialect D [same options] [--judge FILE.json]

--batch    a list of {"id","text","cover","family"?,"dialect"?,"role"?,"intent"?,"awareness"?,"sourced"?} or an object with such a
           list under "candidates". The cover is what the gates read for role cover; the text is the long version.
--history  a JSON list of earlier hook texts (strings, or {"hookId","text"}) for the similarity penalty; a brand.json's
           hooks.history adds the examples of the library hooks it names.
--sourced  the figures the user or a source pack vouches for; any other claimed number fails HG2.
--judge    {"<id>": J} with J from 0 to 40 (gap quality 20, trigger 10, slide-2 deliverability 10).

JSON, one hook: {"id","family","role","dialect","gates":{"HG1".."HG5":{"pass","judged","reason":{"ar","en"}}},"discarded","failed",
  "cover":{"hero","sub","words","heroWords","lines","breakAt"},
  "rules":{"scannability","specificity","awarenessFit","voiceFit","R"},"prior":{"P","basis"},
  "penalties":{"familyRepeat","similar","emoji","latinOnly","total"},"similarity":{"max","hookId","libraryMax","libraryId"},
  "lints":[{"id","status":"pass|fail|judge","reason"}],"partial"}
JSON, a batch: {"results":[...],"summary":{...},"ranking":[ids],"top3":[ids]}.

Exit codes: 0 done (a single hook that passes all gates, or any batch with a survivor), 2 a single hook failed a gate or a batch
has no survivor, 64 usage error, 65 unreadable JSON, 66 input missing, 70 the shared _cs package is unavailable.
"""
import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
try:
    from _cs import lint as cs_lint, paths, qa as cs_qa, rules as cs_rules, text as cs_text
except ImportError as exc:      # the shared package is synced next to the scripts; say so plainly
    sys.stderr.write("cs-error: E_DEP_LOAD: the shared _cs package is missing next to this script: %s\n" % exc)
    sys.exit(70)

paths.ensure_utf8_stdio()

SKILL = Path(__file__).resolve().parent.parent
DIALECTS = ("eg", "gulf", "levant", "msa-white", "en")
ROLES = ("cover", "slide2", "caption-line1", "spoken")
INTENTS = ("reach", "save", "send", "sell")
AWARENESS = ("unaware", "problem", "solution", "product")
ELLIPSIS = "…"
TATWEEL = "ـ"
TASHKEEL = re.compile("[ً-ٰٟ]")
SEV_NOTE = "NOTE"


class _Parser(argparse.ArgumentParser):
    def error(self, message):
        sys.stderr.write("cs-error: E_USAGE: %s\n" % message)
        sys.exit(64)


def build_parser():
    p = _Parser(prog="hook_features.py", description="Hard gates HG1-HG5, rule scores, prior and penalties for hook drafts.")
    src = p.add_mutually_exclusive_group(required=True)
    src.add_argument("--text", help="one hook (the cover text for role cover)")
    src.add_argument("--batch", help="a JSON file of hook candidates")
    p.add_argument("--dialect", choices=DIALECTS, required=True, help="the post's dialect (a batch item may override it)")
    p.add_argument("--cover", help="with --text: the cover when --text holds the long version")
    p.add_argument("--role", choices=ROLES, default="cover", help="what is being scored (default cover)")
    p.add_argument("--intent", choices=INTENTS, help="the post's intent (default: the family's own)")
    p.add_argument("--awareness", choices=AWARENESS, help="the audience stage the post targets")
    p.add_argument("--family", help="hook family code, for example P3 or F17")
    p.add_argument("--brand", help="brand.json (voice, digits, family priors, hook history)")
    p.add_argument("--library", help="folder with families.json, library.*.json, lexicon.json and scoring.json (default: this skill's data/hooks)")
    p.add_argument("--history", help="earlier hook texts for the similarity penalty")
    p.add_argument("--sourced", help="comma-separated figures that have a source")
    p.add_argument("--judge", help="with --batch: JSON {id: J} to add the judge's points to the ranking")
    p.add_argument("--format", choices=("json", "text"), default="json", help="output format (default: json)")
    p.add_argument("--lang", choices=("ar", "en"), default="ar", help="language of the reasons in text output (default: ar)")
    return p


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


def M(ar, en):
    return {"ar": ar, "en": en}


def fold(word):
    w = TASHKEEL.sub("", word).replace(TATWEEL, "")
    w = re.sub("[أإآٱ]", "ا", w)
    return w.replace("ى", "ي").replace("ة", "ه").lower()


def strip_edge_marks(tok):
    return tok.strip("؟?!…،,.:;؛\"'«»“”()[]")


# --------------------------------------------------------------------------
# context: data, brand, history
# --------------------------------------------------------------------------


class Context:
    def __init__(self, args):
        lib = Path(args.library) if args.library else SKILL / "data" / "hooks"
        self.lib_dir = lib
        self.scoring = load_json(lib / "scoring.json", "scoring.json")
        self.lexicon = load_json(lib / "lexicon.json", "lexicon.json")
        fam_doc = load_json(lib / "families.json", "families.json")
        self.families = {f["code"]: f for f in fam_doc.get("families", [])}
        self.libraries = {}
        for lang in ("ar", "en"):
            path = lib / ("library.%s.json" % lang)
            if path.is_file():
                self.libraries[lang] = load_json(path, path.name)
        self.entries = {}           # id -> entry (the Arabic library's when both exist)
        self.examples = {}          # id -> [(text, dialect)] across both libraries
        for lang in ("en", "ar"):
            for e in (self.libraries.get(lang) or {}).get("entries", []):
                self.entries[e["id"]] = e
                self.examples.setdefault(e["id"], [])
                self.examples[e["id"]] += [(ex["text"], ex.get("dialect")) for ex in e.get("examples", [])]
        self.brand = load_json(args.brand, "brand file") if args.brand else {}
        bundle = cs_rules.load_bundle()
        self.copy = (bundle.get("copy") or {}).get("lists") or {}
        self.clitics = cs_rules.clitics()
        self.history_texts = []     # [(hookId|None, text)]
        if args.history:
            self.history_texts += self._read_history(load_json(args.history, "history file"))
        self.history_posts = ((self.brand.get("hooks") or {}).get("history")) or []
        for item in self.history_posts[-self.scoring["thresholds"]["historyWindow"]:]:
            for text, _dialect in self.examples.get(item.get("hookId"), []):
                self.history_texts.append((item["hookId"], text))
        digits = ((self.brand.get("locale") or {}).get("digits")) or "western"
        self.digits = digits if digits in ("western", "arabic-indic") else "western"
        self.sourced_default = self._numbers(args.sourced)
        self.platform = {
            "heroMax": cs_rules.platform("plugin.cover.heroMaxWords", 6),
            "totalMax": cs_rules.platform("plugin.cover.totalMaxWords", 12),
            "maxLines": cs_rules.platform("plugin.cover.maxLines", 3),
            "slide2Words": cs_rules.platform("plugin.slide2.maxWords", 12),
            "firstLine": cs_rules.platform("plugin.caption.firstLineMaxChars", 125),
        }

    @staticmethod
    def _read_history(data):
        rows = data.get("history") if isinstance(data, dict) else data
        out = []
        for item in rows or []:
            if isinstance(item, str):
                out.append((None, item))
            elif isinstance(item, dict) and isinstance(item.get("text"), str):
                out.append((item.get("hookId"), item["text"]))
        return out

    @staticmethod
    def _numbers(raw):
        out = set()
        for part in re.split(r"[,\s]+", raw or ""):
            n = norm_number(part)
            if n:
                out.add(n)
        return out

    def list_entries(self, name):
        return ((self.copy.get(name) or {}).get("entries")) or []

    def lex(self, key, lang):
        v = self.lexicon.get(key) or {}
        return v.get(lang) or []


def norm_number(raw):
    s = cs_text.convert_digits(str(raw), "western")
    s = re.sub(r"[%٪$,\s]", "", s)
    s = s.replace("٫", ".")
    m = re.search(r"[0-9]+(?:\.[0-9]+)?", s)
    return m.group(0) if m else ""


# --------------------------------------------------------------------------
# cover structure
# --------------------------------------------------------------------------


def split_beats(cover):
    """The same hero/sub-line decision used by lint_copy and C1."""
    return cs_qa.split_cover(cover)


def wrap_lines(text, width):
    lines, cur = 0, 0
    for w in text.split():
        n = len(w)
        if cur == 0:
            cur, lines = n, lines + 1
        elif cur + 1 + n <= width:
            cur += 1 + n
        else:
            cur, lines = n, lines + 1
    return lines


def tokens_of(s):
    return cs_text.tokenize(cs_text.bind(s))


def meaning_tokens(s, stop):
    """Word tokens (without punctuation-only pieces) in reading order."""
    out = []
    for t in cs_text.tokenize(s):
        if t["kind"] in ("space", "punct"):
            continue
        out.append(t)
    return out


# --------------------------------------------------------------------------
# gates
# --------------------------------------------------------------------------


def gate(ok, reason_ar, reason_en, judged=False, applies=True):
    g = {"pass": bool(ok), "reason": M(reason_ar, reason_en)}
    if judged:
        g["judged"] = True
    if not applies:
        g["applies"] = False
    return g


def gate_hg1(ctx, role, subject, lang):
    P = ctx.platform
    width = ctx.scoring["lines"]["heroLineChars"][lang]
    hero, sub = split_beats(subject)
    hero_words, sub_words = cs_text.word_count(hero), cs_text.word_count(sub)
    total = hero_words + sub_words
    info = {"hero": hero, "sub": sub, "words": total, "heroWords": hero_words,
            "lines": {"hero": wrap_lines(hero, width), "sub": wrap_lines(sub, width)}, "breakAt": hero_words if sub else None}
    if role == "spoken":
        return gate(True, "افتتاحية منطوقة: تُضغط بـcompress.py قبل أن تصير غلافًا (%s)." % cs_text.ar_count(total, "word"),
                    "A spoken opener: compress it with compress.py before it becomes a cover (%d words)." % total, applies=False), info
    if role == "slide2":
        ok = 0 < total <= P["slide2Words"]
        return gate(ok, "السلايد الثاني %s والحد %d." % (cs_text.ar_count(total, "word"), P["slide2Words"]) if not ok else "طول السلايد الثاني مقبول (%s)." % cs_text.ar_count(total, "word"),
                    "Slide 2 has %d words; the limit is %d." % (total, P["slide2Words"]) if not ok else "Slide 2 length is fine (%d words)." % total), info
    if role == "caption-line1":
        first = subject.split("\n", 1)[0]
        ok = 0 < len(first) <= P["firstLine"]
        return gate(ok, "السطر الأول %s والحد %d." % (cs_text.ar_count(len(first), "char"), P["firstLine"]) if not ok else "السطر الأول ضمن الحد.",
                    "The first line has %d characters; the limit is %d." % (len(first), P["firstLine"]) if not ok else "The first line is within the limit."), info
    problems_ar, problems_en = [], []
    if hero_words == 0:
        problems_ar.append("لا يوجد نص")
        problems_en.append("no text")
    if hero_words > P["heroMax"]:
        problems_ar.append("الجملة الأولى %s والحد %d" % (cs_text.ar_count(hero_words, "word"), P["heroMax"]))
        problems_en.append("the first beat has %d words; the limit is %d" % (hero_words, P["heroMax"]))
    if total > P["totalMax"]:
        problems_ar.append("الغلاف %s والحد %d" % (cs_text.ar_count(total, "word"), P["totalMax"]))
        problems_en.append("the cover has %d words; the limit is %d" % (total, P["totalMax"]))
    if info["lines"]["hero"] > P["maxLines"]:
        problems_ar.append("الجملة الأولى تتجاوز %s" % cs_text.ar_count(P["maxLines"], "line"))
        problems_en.append("the first beat runs past %d lines" % P["maxLines"])
    if problems_ar:
        return gate(False, "؛ ".join(problems_ar) + ".", "; ".join(problems_en).capitalize() + "."), info
    return gate(True, "الطول ضمن الحدود (%s، الجملة الأولى %d)." % (cs_text.ar_count(total, "word"), hero_words),
                "Within the limits (%d words, first beat %d)." % (total, hero_words)), info


YEAR_RE = re.compile(r"^(19|20)[0-9]{2}$")


def claimed_numbers(ctx, subject, lang, strict=False):
    """[(figure, why)] for every number that states a result rather than a count or a time frame. With `strict` (the pattern
    itself reports a result, such as a proof, a before and after or a big number) every figure but a time frame or a year counts."""
    time_units = {fold(w) for w in ctx.lex("timeUnits", lang)}
    claim_units = {fold(w) for w in ctx.lex("claimUnits", lang)}
    signs = (ctx.lexicon.get("claimUnits") or {}).get("signs") or []
    toks = [t for t in cs_text.tokenize(subject) if t["kind"] != "space"]
    out = []
    for i, t in enumerate(toks):
        if t["kind"] != "number":
            continue
        raw = t["text"]
        value = norm_number(raw)
        if not value:
            continue
        nxt = toks[i + 1]["text"] if i + 1 < len(toks) else ""
        nxt2 = (nxt + " " + toks[i + 2]["text"]) if i + 2 < len(toks) else nxt
        has_sign = any(sg in raw for sg in signs) or (nxt in signs)
        unit = fold(strip_edge_marks(nxt))
        unit2 = fold(strip_edge_marks(nxt2))
        if has_sign:
            out.append((value, "sign"))
        elif unit in time_units and unit not in claim_units:
            continue
        elif YEAR_RE.match(value):
            continue
        elif unit in claim_units or unit2 in claim_units:
            out.append((value, "unit"))
        elif "." in value:
            out.append((value, "decimal"))
        elif strict or float(value) > 30:
            out.append((value, "result" if strict else "large"))
    return out


def gate_hg2(ctx, subject, lang, sourced, needs_source):
    claims = claimed_numbers(ctx, subject, lang, strict=needs_source)
    unsourced = [v for v, _ in claims if v not in sourced]
    if unsourced:
        return gate(False, "رقم بلا مصدر: %s. أضف مصدرًا أو احذف الرقم." % "، ".join(unsourced),
                    "A figure without a source: %s. Add a source or drop the figure." % ", ".join(unsourced), judged=True), unsourced
    has_number = any(t["kind"] == "number" for t in cs_text.tokenize(subject))
    if needs_source and not claims:
        return gate(True, "النمط يذكر واقعة: على النموذج أن يتأكد من وجود مصدرها.",
                    "The pattern states a fact: the model confirms its source exists.", judged=True), []
    if has_number:
        return gate(True, "العدّ في القوائم يجب أن يساوي عدد شرائح المحتوى (C6).", "A list's count must equal its payoff slides (C6).", judged=True), []
    return gate(True, "لا أرقام تحتاج مصدرًا.", "No figure needs a source.", judged=True), []


def gate_hg3(ctx, subject, lang, role):
    hero, sub = split_beats(subject)
    folded = fold(re.sub(r"\s+", " ", subject)) + " "
    cues = ctx.lex("answerCues", lang)
    hits = [c for c in cues if fold(c) in folded]
    if hits:
        return gate(False, "الغلاف يجيب عن السؤال بنفسه («%s»): اترك الفجوة مفتوحة." % hits[0].strip(),
                    "The cover answers its own question (\"%s\"): leave the gap open." % hits[0].strip(), judged=True), True
    if role == "cover" and cs_text.word_count(subject) < 2:
        return gate(False, "كلمة واحدة لا تفتح فجوة محددة.", "A single word does not open a specific gap.", judged=True), False
    return gate(True, "لا إجابة ظاهرة على الغلاف؛ على النموذج أن يقتبس عبارة الفجوة ويؤكد أنها محددة.",
                "No answer on the cover; the model must quote the gap phrase and confirm it is specific.", judged=True), False


def match_list(ctx, name, text, dialect):
    entries = [e for e in ctx.list_entries(name) if e.get("sev") != SEV_NOTE]
    return cs_rules.entries_match(entries, text, dialect=dialect, clitics=ctx.clitics)


def gate_hg4(ctx, subject, dialect):
    bound = cs_text.bind(subject)
    issues = cs_lint.lint_text(bound, dialect=dialect, digits=ctx.digits, allow=((ctx.brand.get("voice") or {}).get("allow") or []))
    deny = [i for i in issues if i["rule"] == "deny-marker"]
    blocks = [i for i in issues if i["sev"] == "BLOCK" and i["rule"] != "deny-marker"]
    if deny:
        words = "، ".join(sorted({i["original"] for i in deny}))
        return gate(False, "كلمات من لهجة أخرى في بوست بلهجة «%s»: %s." % (dialect, words),
                    "Words from another dialect in a «%s» post: %s." % (dialect, words)), issues
    if blocks:
        first = blocks[0]
        msg = first.get("msg") or {}
        return gate(False, "خطأ إملائي أو رقمي يمنع النشر (%s): %s" % (first["rule"], msg.get("ar", first["original"])),
                    "A spelling or digit error blocks it (%s): %s" % (first["rule"], msg.get("en", first["original"]))), issues
    return gate(True, "اللهجة والأرقام والإملاء سليمة.", "Dialect, digits and spelling are clean."), issues


def gate_hg5(ctx, subject, dialect):
    problems = []
    th = ctx.scoring["thresholds"]
    bait = match_list(ctx, "commentBait", subject, dialect)
    if bait:
        problems.append(("no-comment-bait", M("طلب تفاعل بلا مقابل («%s»)." % bait[0]["text"], "Engagement bait (\"%s\")." % bait[0]["text"])))
    consp = cs_rules.entries_match(ctx.list_entries("conspiracy"), subject, dialect=dialect, clitics=ctx.clitics)
    if consp:
        problems.append(("no-conspiracy", M("صيغة مؤامرة/إخفاء («%s»)." % consp[0]["text"], "Conspiracy framing (\"%s\")." % consp[0]["text"])))
    hype = match_list(ctx, "hypeWords", subject, dialect)
    if hype:
        problems.append(("no-empty-hype", M("مبالغة بلا محتوى محدد («%s»)." % hype[0]["text"], "Empty-slot hype (\"%s\")." % hype[0]["text"])))
    over = match_list(ctx, "overclaim", subject, dialect)
    if over:
        problems.append(("no-overclaim", M("وعد مضمون أو يغيّر الحياة («%s»)." % over[0]["text"], "A guarantee or life-changing promise (\"%s\")." % over[0]["text"])))
    fear = cs_rules.entries_match(ctx.list_entries("fearWords"), subject, dialect=dialect, clitics=ctx.clitics)
    distinct = {m["id"] for m in fear}
    if len(distinct) >= th["fearStackMin"]:
        problems.append(("no-fear-stack", M("تراكم كلمات الخوف (%d في غلاف واحد)." % len(distinct), "Fear stacking (%d fear words in one hook)." % len(distinct))))
    if problems:
        ar = " ".join(p[1]["ar"] for p in problems)
        en = " ".join(p[1]["en"] for p in problems)
        return gate(False, ar, en), problems
    return gate(True, "لا طُعم تفاعل ولا مؤامرة ولا مبالغة فارغة ولا وعود مضمونة.", "No bait, conspiracy, empty hype or guaranteed promises."), problems


# --------------------------------------------------------------------------
# rule scores (R) and prior (P)
# --------------------------------------------------------------------------


def clamp(v, lo, hi):
    return max(lo, min(hi, v))


def is_list_family(ctx, family):
    fam = ctx.families.get(family) or {}
    return family in ctx.scoring["listFamilies"] or bool(set(fam.get("architectures") or []) & {"listicle", "steps"})


def score_scannability(ctx, subject, lang, family):
    S = ctx.scoring["scannability"]
    stop = {fold(w) for w in ctx.lex("stopwords", lang)}
    hero, sub = split_beats(subject)
    toks = [t for t in meaning_tokens(subject, stop) if t["kind"] not in ("emoji",)]
    first = toks[:2]
    pts, parts = 0, []

    def meaningful(t):
        return t["kind"] in ("number", "latin", "handle", "tag") or fold(strip_edge_marks(t["text"])) not in stop

    if first and meaningful(first[0]):
        pts += S["firstWord"]
        parts.append("first-word")
    elif len(first) > 1 and meaningful(first[1]):
        pts += S["secondWord"]
        parts.append("second-word")
    if sub and hero:
        pts += S["break"]
        parts.append("break")
    hero_tokens = meaning_tokens(hero or subject, stop)
    if any(t["kind"] == "number" for t in hero_tokens):
        pts += S["numeralOnList"] if is_list_family(ctx, family) else S["numeralElse"]
        parts.append("numeral")
    return clamp(pts, 0, ctx.scoring["rules"]["scannability"]), parts


def score_specificity(ctx, subject, dialect, lang):
    S = ctx.scoring["specificity"]
    stop = {fold(w) for w in ctx.lex("stopwords", lang)}
    time_units = {fold(w) for w in ctx.lex("timeUnits", lang)}
    toks = meaning_tokens(subject, stop)
    pts, parts = S["base"], ["base"]
    if any(t["kind"] == "number" for t in toks):
        pts += S["numeral"]
        parts.append("numeral")
    if lang == "ar" and any(t["kind"] == "latin" for t in toks):
        pts += S["latinName"]
        parts.append("latin-name")
    words = [fold(strip_edge_marks(t["text"])) for t in toks if t["kind"] == "ar" or (lang == "en" and t["kind"] == "latin")]
    if any(w in time_units for w in words):
        pts += S["timeFrame"]
        parts.append("time-frame")
    long_words = [w for w in words if len(w) >= S["concreteNounMinChars"] and w not in stop]
    if len(long_words) >= S["concreteNounMin"]:
        pts += S["concreteNouns"]
        parts.append("concrete-words")
    abstract = cs_rules.entries_match(ctx.list_entries("abstractWords"), subject, dialect=dialect, clitics=ctx.clitics)
    abstract_ids = {m["id"] for m in abstract}
    if abstract_ids:
        pts += S["abstractWord"] * len(abstract_ids)
        parts.append("abstract:%s" % ",".join(sorted(m["text"] for m in abstract)))
    return clamp(pts, 0, ctx.scoring["rules"]["specificity"]), parts


def score_awareness(ctx, family, awareness):
    A = ctx.scoring["awareness"]
    fam = ctx.families.get(family)
    if not awareness or not fam or not fam.get("awareness"):
        return A["unknown"], "assumed"
    if awareness in fam["awareness"]:
        return A["match"], "match"
    order = A["order"]
    dist = min(abs(order.index(awareness) - order.index(a)) for a in fam["awareness"] if a in order)
    return (A["adjacent"], "adjacent") if dist == 1 else (A["far"], "far")


def score_voice(ctx, subject, dialect):
    V = ctx.scoring["voice"]
    pts, hits = V["base"], []
    for name, key in (("aiWords", "aiWord"), ("stockOpeners", "stockOpener"), ("stiffMsa", "stiffMsa"), ("translationese", "translationese")):
        found = cs_rules.entries_match([e for e in ctx.list_entries(name) if e.get("sev") != SEV_NOTE], subject, dialect=dialect, clitics=ctx.clitics)
        if found:
            pts += V[key]
            hits.append("%s:%s" % (name, found[0]["text"]))
    voice = ctx.brand.get("voice") or {}
    avoid = [{"id": "brand-avoid-%d" % i, "text": w, "match": "phrase" if " " in w else "word", "clitics": True} for i, w in enumerate(voice.get("avoid") or [])]
    found = cs_rules.entries_match(avoid, subject, dialect=dialect, clitics=ctx.clitics)
    if found:
        pts += V["brandAvoid"]
        hits.append("brand-avoid:%s" % found[0]["text"])
    use = [{"id": "brand-use-%d" % i, "text": w, "match": "phrase" if " " in w else "word", "clitics": True} for i, w in enumerate(voice.get("use") or [])]
    used = cs_rules.entries_match(use, subject, dialect=dialect, clitics=ctx.clitics)
    if used:
        pts += V["brandUse"]
        hits.append("brand-use:%s" % used[0]["text"])
    return clamp(pts, 0, ctx.scoring["rules"]["voiceFit"]), hits


def score_prior(ctx, family, intent):
    P = ctx.scoring["prior"]
    th = ctx.scoring["thresholds"]
    fam = ctx.families.get(family)
    if not fam:
        return 0, "no family", False
    fi = fam.get("intent") or {}
    if intent is None or intent == fi.get("primary"):
        base, why = P["intentPrimary"], "intent: primary"
    elif intent in (fi.get("also") or []):
        base, why = P["intentAlso"], "intent: also"
    else:
        base, why = P["intentOther"], "intent: other"
    best, tag_used, own = 0.0, None, False
    for prior in fam.get("priors") or []:
        n = prior.get("n") or 0
        if n < th["priorMinN"]:
            continue
        pts = P["evidence"].get(prior.get("tag"), 0) * min(1.0, n / float(P["evidenceFullN"]))
        if pts > best:
            best, tag_used = pts, prior.get("tag")
    brand_prior = ((ctx.brand.get("hooks") or {}).get("familyPriors") or {}).get(family)
    if brand_prior and (brand_prior.get("n") or 0) >= th["priorMinN"]:
        baseline = brand_prior.get("baseline")
        if baseline is None or brand_prior.get("value", 0) >= baseline:
            pts = P["evidence"]["D-own"] * min(1.0, brand_prior["n"] / float(P["evidenceFullN"]))
            if pts >= best:
                best, tag_used, own = pts, "D-own(brand)", True
    own = own or tag_used == "D-own"
    total = clamp(round(base + best, 2), 0, ctx.scoring["weights"]["P"])
    return total, "%s; evidence: %s" % (why, tag_used or "none"), own


# --------------------------------------------------------------------------
# penalties and similarity
# --------------------------------------------------------------------------


def last_posts_families(ctx):
    n = ctx.scoring["thresholds"]["familyRepeatWindow"]
    return [p.get("family") for p in ctx.history_posts[-n:]]


def similarity_to(texts, subject):
    best, hid = 0.0, None
    for hook_id, t in texts:
        s = cs_text.similarity(subject, t)
        if s > best:
            best, hid = s, hook_id
    return best, hid


def library_examples(ctx, lang):
    out = []
    for hook_id, rows in ctx.examples.items():
        for text, dialect in rows:
            if (lang == "en") == (dialect == "en"):
                out.append((hook_id, text))
    return out


def has_emoji(subject):
    return any(t["kind"] == "emoji" for t in cs_text.tokenize(subject))


def latin_only(subject, lang):
    if lang == "en":
        return False
    toks = [t for t in cs_text.tokenize(subject) if t["kind"] not in ("space", "punct", "number", "emoji")]
    return bool(toks) and all(t["kind"] in ("latin", "handle", "tag", "url", "email") for t in toks)


# --------------------------------------------------------------------------
# one hook
# --------------------------------------------------------------------------


LINT_FROM_GATE = {
    "no-comment-bait": "no-comment-bait",
    "no-conspiracy": "no-conspiracy",
    "no-empty-hype": "no-empty-hype",
    "no-overclaim": "no-overclaim",
    "no-fear-stack": "no-fear-stack",
}


def analyse(ctx, hook, defaults):
    dialect = hook.get("dialect") or defaults["dialect"]
    lang = "en" if dialect == "en" else "ar"
    role = hook.get("role") or defaults["role"]
    family = hook.get("family") or defaults.get("family")
    entry = ctx.entries.get(hook.get("hookId") or hook.get("entry"))
    if not family and entry:
        family = entry.get("family")
    fam = ctx.families.get(family) if family else None
    intent = hook.get("intent") or defaults.get("intent")
    awareness = hook.get("awareness") or defaults.get("awareness")
    text = hook.get("text") or ""
    cover = hook.get("cover") or ""
    subject = (cover or text) if role == "cover" else text
    if role == "cover" and not subject:
        subject = text
    sourced = set(ctx.sourced_default) | Context._numbers(",".join(str(x) for x in (hook.get("sourced") or [])))
    needs_source = bool(entry and entry.get("needsSource")) and role == "cover"

    hg1, shape = gate_hg1(ctx, role, subject, lang)
    hg2, unsourced = gate_hg2(ctx, subject, lang, sourced, needs_source)
    hg3, answered = gate_hg3(ctx, subject, lang, role)
    hg4, ortho_issues = gate_hg4(ctx, subject, dialect)
    hg5, policy = gate_hg5(ctx, subject, dialect)
    gates = {"HG1": hg1, "HG2": hg2, "HG3": hg3, "HG4": hg4, "HG5": hg5}
    failed = [k for k, g in gates.items() if not g["pass"]]

    scan, scan_parts = score_scannability(ctx, subject, lang, family)
    spec, spec_parts = score_specificity(ctx, subject, dialect, lang)
    aware, aware_basis = score_awareness(ctx, family, awareness)
    voice, voice_hits = score_voice(ctx, subject, dialect)
    R = scan + spec + aware + voice
    prior, prior_basis, own_evidence = score_prior(ctx, family, intent)

    pen_cfg = ctx.scoring["penalties"]
    th = ctx.scoring["thresholds"]
    pen = {"familyRepeat": 0, "similar": 0, "emoji": 0, "latinOnly": 0}
    if family and family in last_posts_families(ctx):
        pen["familyRepeat"] = pen_cfg["familyRepeat"]
    sim_max, sim_id = similarity_to(ctx.history_texts, subject) if ctx.history_texts else (0.0, None)
    if sim_max >= th["similarity"]:
        pen["similar"] = pen_cfg["similar"]
    lib_max, lib_id = similarity_to(library_examples(ctx, lang), subject)
    if has_emoji(subject):
        pen["emoji"] = pen_cfg["emoji"]
    if latin_only(subject, lang):
        pen["latinOnly"] = pen_cfg["latinOnly"]
    pen["total"] = pen["familyRepeat"] + pen["similar"] + pen["emoji"] + pen["latinOnly"]

    lints = family_lints(ctx, fam, role, subject, gates, policy, unsourced, answered, shape, lang, hg5)
    return {
        "id": hook.get("id") or None,
        "family": family,
        "role": role,
        "dialect": dialect,
        "text": text,
        "subject": subject,
        "gates": gates,
        "discarded": bool(failed),
        "failed": failed,
        "cover": shape,
        "rules": {"scannability": scan, "specificity": spec, "awarenessFit": aware, "voiceFit": voice, "R": R,
                  "detail": {"scannability": scan_parts, "specificity": spec_parts, "awarenessFit": aware_basis, "voiceFit": voice_hits}},
        "prior": {"P": prior, "basis": prior_basis, "ownEvidence": own_evidence},
        "penalties": pen,
        "similarity": {"max": round(sim_max, 3), "hookId": sim_id, "libraryMax": round(lib_max, 3), "libraryId": lib_id},
        "lints": lints,
        "partial": round(R + prior + pen["total"], 2),
    }


def family_lints(ctx, fam, role, subject, gates, policy, unsourced, answered, shape, lang, hg5):
    if not fam:
        return []
    out = []
    policy_ids = {p[0] for p in policy}
    for name in fam.get("lints") or []:
        if name == "digits-on-cover":
            has = any(t["kind"] == "number" for t in cs_text.tokenize(subject))
            ok = has or role != "cover"
            out.append({"id": name, "status": "pass" if ok else "fail",
                        "reason": M("القائمة تبدأ برقم على الغلاف." if ok else "هذا النمط يحتاج رقمًا على الغلاف.",
                                    "A numeral is on the cover." if ok else "This family needs a numeral on the cover.")})
        elif name == "one-gap":
            many = subject.count("؟") + subject.count("?") > 1 or len(re.findall(r"…|\.{3}", subject)) > 1
            out.append({"id": name, "status": "fail" if many else "judge",
                        "reason": M("أكثر من سؤال أو فاصل واحد: اترك فجوة واحدة." if many else "على النموذج أن يؤكد وجود فجوة واحدة محددة.",
                                    "More than one question or break: keep one gap." if many else "The model confirms there is one specific gap.")})
        elif name == "no-answer-on-cover":
            out.append({"id": name, "status": "fail" if answered else "judge",
                        "reason": M("الغلاف يجيب عن نفسه." if answered else "على النموذج أن يؤكد أن الغلاف لا يجيب عن الفجوة.",
                                    "The cover answers itself." if answered else "The model confirms the cover does not answer the gap.")})
        elif name == "no-cover-emoji":
            bad = has_emoji(subject)
            out.append({"id": name, "status": "fail" if bad else "pass",
                        "reason": M("إيموجي على الغلاف (-5)." if bad else "لا إيموجي على الغلاف.", "Emoji on the cover (-5)." if bad else "No emoji on the cover.")})
        elif name == "number-needs-source":
            bad = bool(unsourced)
            out.append({"id": name, "status": "fail" if bad else "pass",
                        "reason": M("رقم بلا مصدر." if bad else "كل رقم مدّعى له مصدر.", "A figure has no source." if bad else "Every claimed figure has a source.")})
        elif name in LINT_FROM_GATE:
            bad = LINT_FROM_GATE[name] in policy_ids
            out.append({"id": name, "status": "fail" if bad else "pass", "reason": hg5["reason"] if bad else M("سليم.", "Clean.")})
        else:
            out.append({"id": name, "status": "judge", "reason": M("يحكم عليه النموذج.", "Judged by the model.")})
    return out


# --------------------------------------------------------------------------
# batch
# --------------------------------------------------------------------------


def rank(results, ctx, judge):
    th = ctx.scoring["selection"]
    survivors = [r for r in results if not r["discarded"]]

    def total(r):
        j = judge.get(r["id"]) if r["id"] is not None else None
        return r["partial"] + (j if isinstance(j, (int, float)) else 0)

    for r in results:
        r["total"] = round(total(r), 2) if not r["discarded"] else None
    survivors.sort(key=lambda r: (-total(r), not r["prior"]["ownEvidence"], r["cover"]["words"], str(r["id"])))
    top, families = [], set()
    for r in survivors:
        if th["distinctFamilies"] and r["family"] in families:
            continue
        top.append(r["id"])
        families.add(r["family"])
        if len(top) >= th["top"]:
            break
    return [r["id"] for r in survivors], top


def read_batch(path):
    data = load_json(path, "batch file")
    rows = data.get("candidates") if isinstance(data, dict) else data
    if not isinstance(rows, list) or not rows:
        fail("E_USAGE", "the batch file must hold a list of candidates (or {\"candidates\": [...]})", 65)
    for i, row in enumerate(rows):
        if not isinstance(row, dict) or not (row.get("text") or row.get("cover")):
            fail("E_USAGE", "candidate %d has no text" % (i + 1), 65)
    return rows


def render_text(payload, lang, batch):
    def one(r):
        flags = " ".join("%s:%s" % (k, "ok" if g["pass"] else "FAIL") for k, g in r["gates"].items())
        lines = ["%s [%s] %s" % (r["id"] or "-", r["family"] or "-", r["subject"]), "   gates  %s" % flags]
        for k in r["failed"]:
            lines.append("   %s: %s" % (k, r["gates"][k]["reason"][lang]))
        rules = r["rules"]
        lines.append("   R %d (scan %d, spec %d, aware %d, voice %d)  P %s  penalties %d  partial %s" % (
            rules["R"], rules["scannability"], rules["specificity"], rules["awarenessFit"], rules["voiceFit"], r["prior"]["P"], r["penalties"]["total"], r["partial"]))
        return lines
    out = []
    if batch:
        for r in payload["results"]:
            out += one(r)
        s = payload["summary"]
        out.append("")
        out.append("%d hooks, %d survive, %d discarded; top 3: %s" % (s["total"], s["survivors"], len(s["discarded"]), ", ".join(str(x) for x in payload["top3"]) or "-"))
    else:
        out += one(payload)
    return "\n".join(out) + "\n"


def main(argv=None):
    args = build_parser().parse_args(argv)
    ctx = Context(args)
    defaults = {"dialect": args.dialect, "role": args.role, "family": args.family, "intent": args.intent, "awareness": args.awareness}
    if args.text is not None:
        if not args.text.strip():
            fail("E_USAGE", "--text is empty", 64)
        hook = {"id": None, "text": args.text, "cover": args.cover or (args.text if args.role == "cover" else "")}
        result = analyse(ctx, hook, defaults)
        out = {k: v for k, v in result.items() if k != "subject"}
        sys.stdout.write(json.dumps(out, ensure_ascii=False, indent=2) + "\n" if args.format == "json" else render_text(result, args.lang, False))
        return 2 if result["discarded"] else 0
    rows = read_batch(args.batch)
    judge = load_json(args.judge, "judge file") if args.judge else {}
    results = [analyse(ctx, row, defaults) for row in rows]
    ranking, top3 = rank(results, ctx, judge)
    sel = ctx.scoring["selection"]
    families = {r["family"] for r in results if not r["discarded"]}
    summary = {
        "total": len(results), "survivors": len(ranking), "discarded": [r["id"] for r in results if r["discarded"]],
        "families": sorted(f for f in families if f), "enoughCandidates": len(results) >= sel["minCandidates"],
        "enoughFamilies": len({r["family"] for r in results if r["family"]}) >= sel["minFamilies"],
        "top3Possible": len(top3) >= sel["top"],
    }
    payload = {"results": [{k: v for k, v in r.items()} for r in results], "summary": summary, "ranking": ranking, "top3": top3}
    if args.format == "json":
        for r in payload["results"]:
            r.pop("subject", None)
        sys.stdout.write(json.dumps(payload, ensure_ascii=False, indent=2) + "\n")
    else:
        sys.stdout.write(render_text(payload, args.lang, True))
    return 0 if ranking else 2


if __name__ == "__main__":
    sys.exit(main())
