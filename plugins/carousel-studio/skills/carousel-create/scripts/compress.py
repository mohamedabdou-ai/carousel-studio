#!/usr/bin/env python3
"""compress.py: turn a spoken opener into cover candidates that obey the cover limits (CONTRACT 9.2, compression.md).

Deterministic and offline. It strips discourse fillers, drops an if-clause whose result clause carries the point, moves the
numeral or the meaning word to the front, converts spelled-out numbers to digits, keeps Latin names exactly as written, and
breaks the line at «…» so the first beat is the hero and the second the sub-line. It returns the three best candidates; the model
(or the user) judges the final choice, because only a reader can tell which cut keeps the point.

Usage
    compress.py --text STRING --dialect eg|gulf|levant|msa-white|en [--hero-max 6] [--total-max 12] [--top 3]
                [--format json|text] [--lang ar|en]
    compress.py --file FILE ...        (the opener is read from a UTF-8 text file; "-" reads stdin)

JSON: {"dialect", "limits": {"heroMax", "totalMax"}, "source": {"text", "words"},
       "candidates": [{"cover", "hero", "sub", "words", "heroWords", "breakAt", "ok", "score", "rules": [...]}],
       "notes": [{"ar", "en"}]}
`breakAt` is the number of words before the «…» (null when the cover is one beat). `ok` means hero and total are within the limits.

Exit codes: 0 at least one candidate is within the limits, 1 none is (rewrite it by hand), 64 usage error,
65 unreadable JSON data, 66 input missing, 70 the shared _cs package is unavailable.
"""
import argparse
import json
import re
import sys
import unicodedata
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
try:
    from _cs import paths, rules as cs_rules, text as cs_text
except ImportError as exc:      # the shared package is synced next to the scripts; say so plainly
    sys.stderr.write("cs-error: E_DEP_LOAD: the shared _cs package is missing next to this script: %s\n" % exc)
    sys.exit(70)

paths.ensure_utf8_stdio()

SKILL = Path(__file__).resolve().parent.parent
DIALECTS = ("eg", "gulf", "levant", "msa-white", "en")
ELLIPSIS = "…"
CLAUSE_SPLIT = re.compile(r"(\.{2,}|…|[،,؛;:—–]|[.!؟?])")
HARD_ENDS = "؟?!"
BIDI_CONTROLS = re.compile("[‎‏‪-‮⁦-⁩​‌‍﻿]")
WRAP_QUOTES = "\"'“”‘’«»"
TATWEEL = "ـ"
TASHKEEL = re.compile("[ً-ٰٟ]")


class _Parser(argparse.ArgumentParser):
    def error(self, message):
        sys.stderr.write("cs-error: E_USAGE: %s\n" % message)
        sys.exit(64)


def build_parser():
    p = _Parser(prog="compress.py", description="Compress a spoken opener into cover candidates within the cover limits.")
    src = p.add_mutually_exclusive_group(required=True)
    src.add_argument("--text", help="the spoken opener")
    src.add_argument("--file", help="a UTF-8 text file holding the opener ('-' for stdin)")
    p.add_argument("--dialect", choices=DIALECTS, required=True, help="the post's dialect")
    p.add_argument("--hero-max", type=int, default=None, help="words allowed before the break (default: the platform's heroMaxWords, 6)")
    p.add_argument("--total-max", type=int, default=None, help="words allowed in all (default: the platform's totalMaxWords, 12)")
    p.add_argument("--top", type=int, default=3, help="how many candidates to return (default 3)")
    p.add_argument("--format", choices=("json", "text"), default="json", help="output format (default: json)")
    p.add_argument("--lang", choices=("ar", "en"), default="ar", help="language of the notes in text output (default: ar)")
    return p


def fail(code, message, exit_code):
    sys.stderr.write("cs-error: %s: %s\n" % (code, message))
    sys.exit(exit_code)


def load_data(name):
    path = SKILL / "data" / "hooks" / name
    if not path.is_file():
        fail("E_USAGE", "data file missing: %s" % path, 66)
    try:
        return paths.read_json(path)
    except ValueError as exc:
        fail("E_USAGE", "%s is not valid JSON: %s" % (name, exc), 65)


def M(ar, en):
    return {"ar": ar, "en": en}


# --------------------------------------------------------------------------
# text helpers
# --------------------------------------------------------------------------


def fold(word):
    """Matching form of a word: no diacritics or tatweel, hamza/alef variants unified, lower case."""
    w = TASHKEEL.sub("", word).replace(TATWEEL, "")
    w = re.sub("[أإآٱ]", "ا", w)
    return w.replace("ى", "ي").replace("ة", "ه").lower()


def words_of(s):
    return [w for w in s.split() if w]


def count_words(s):
    return cs_text.word_count(s)


def normalise(raw, arabic):
    s = unicodedata.normalize("NFC", raw)
    s = BIDI_CONTROLS.sub("", s).replace(" ", " ")
    s = re.sub(r"\s+", " ", s).strip()
    while len(s) > 1 and s[0] in WRAP_QUOTES and s[-1] in WRAP_QUOTES:
        s = s[1:-1].strip()
    if arabic:
        s = s.replace(",", "،").replace("?", "؟").replace(";", "؛")
    s = s.replace("...", ELLIPSIS)
    return s


class Lexicon:
    def __init__(self, dialect):
        lex = load_data("lexicon.json")
        comp = lex["compression"]
        lang = "en" if dialect == "en" else "ar"
        self.lang = lang
        self.fillers = sorted(comp["fillers"].get(dialect) or [], key=lambda f: -len(words_of(f)))
        self.tails = sorted(comp["tails"][lang], key=lambda f: -len(words_of(f)))
        self.conditionals = sorted(comp["conditionalOpeners"][lang], key=lambda f: -len(words_of(f)))
        self.consequents = sorted(comp["consequents"][lang], key=lambda f: -len(words_of(f)))
        self.danglers = {fold(w) for w in comp["danglers"][lang]}
        self.split_words = sorted(comp["splitWords"][lang], key=lambda f: -len(words_of(f)))
        self.stop = {fold(w) for w in lex["stopwords"][lang]}
        self.qualifiers = {fold(w) for w in comp["qualifiers"][lang]}
        self.number_words = self._number_words()

    @staticmethod
    def _number_words():
        try:
            bundle = cs_rules.load_bundle()
            entries = (((bundle.get("copy") or {}).get("lists") or {}).get("numberWords") or {}).get("entries") or []
        except Exception:       # a broken bundle must not stop a compression
            entries = []
        out = {}
        for e in entries:
            if isinstance(e.get("value"), int) and e["value"] >= 2 and (e.get("match") or "word") == "word":
                out[fold(str(e.get("text") or ""))] = e["value"]
        return out


def starts_with_phrase(tokens, phrases):
    """Longest phrase of `phrases` that the tokens start with: (number of tokens, phrase) or (0, None)."""
    for phrase in phrases:
        ph = [fold(w) for w in words_of(phrase)]
        if ph and [fold(t) for t in tokens[:len(ph)]] == ph:
            return len(ph), phrase
    return 0, None


def ends_with_phrase(tokens, phrases):
    for phrase in phrases:
        ph = [fold(w) for w in words_of(phrase)]
        if ph and len(tokens) > len(ph) and [fold(t) for t in tokens[-len(ph):]] == ph:
            return len(ph), phrase
    return 0, None


def is_number_token(tok):
    return bool(re.fullmatch(r"[0-9٠-٩۰-۹][0-9٠-٩۰-۹.,%٪٫]*", tok.strip("؟?!…،,.:;")))


def has_numeral(tokens):
    return any(is_number_token(t) for t in tokens)


# --------------------------------------------------------------------------
# clauses
# --------------------------------------------------------------------------


class Clause:
    __slots__ = ("tokens", "sep", "rules")

    def __init__(self, tokens, sep, rules=None):
        self.tokens = tokens
        self.sep = sep
        self.rules = list(rules or [])

    @property
    def text(self):
        return " ".join(self.tokens)

    def copy(self):
        return Clause(list(self.tokens), self.sep, self.rules)


def split_clauses(text):
    parts = CLAUSE_SPLIT.split(text)
    clauses = []
    i = 0
    while i < len(parts):
        body = parts[i].strip()
        sep = parts[i + 1] if i + 1 < len(parts) else ""
        i += 2
        if not body:
            continue
        if sep and sep[0] in HARD_ENDS:
            body = body + sep
        clauses.append(Clause(words_of(body), sep))
    return clauses


def strip_fillers(clause, lex):
    changed = True
    while changed and clause.tokens:
        changed = False
        n, phrase = starts_with_phrase(clause.tokens, lex.fillers)
        if n:
            clause.tokens = clause.tokens[n:]       # a clause made only of fillers disappears
            clause.rules.append("strip-filler")
            changed = True
    n, phrase = ends_with_phrase(clause.tokens, lex.tails)
    if n:
        clause.tokens = clause.tokens[:-n]
        clause.rules.append("strip-filler")
    return clause


def clean_edges(tokens):
    """Drop a bare leading «و» that has nothing to join to (a clause that starts the cover)."""
    if tokens and tokens[0] == "و":
        return tokens[1:]
    return tokens


def convert_numbers(clauses, lex):
    for c in clauses:
        out = []
        for idx, tok in enumerate(c.tokens):
            key = fold(tok.strip("؟?!…،,.:;"))
            if key in lex.number_words and idx + 1 < len(c.tokens):
                tail = tok[len(tok.rstrip("؟?!…،,.:;")):]
                out.append(str(lex.number_words[key]) + tail)
                if "spelled-number" not in c.rules:
                    c.rules.append("spelled-number")
            else:
                out.append(tok)
        c.tokens = out
    return clauses


def split_condition(clauses, lex):
    """Replace an if-clause plus its result by the result alone; returns (new clauses, True when something was dropped)."""
    out, dropped, i = [], False, 0
    while i < len(clauses):
        c = clauses[i]
        n, _ = starts_with_phrase(c.tokens, lex.conditionals)
        if n:
            # inside one clause: "لو ... يبقى X"
            cut = None
            for k in range(n + 1, len(c.tokens)):
                m, _ = starts_with_phrase(c.tokens[k:], lex.consequents)
                if m and k + m < len(c.tokens):
                    cut = (k, m)
                    break
            if cut:
                k, m = cut
                rest = Clause(c.tokens[k + m:], c.sep, c.rules + ["drop-condition"])
                out.append(rest)
                dropped = True
                i += 1
                continue
            if i + 1 < len(clauses):
                nxt = clauses[i + 1]
                m, _ = starts_with_phrase(nxt.tokens, lex.consequents)
                if m and len(nxt.tokens) > m:
                    out.append(Clause(nxt.tokens[m:], nxt.sep, nxt.rules + ["drop-condition"]))
                    dropped = True
                    i += 2
                    continue
        out.append(c)
        i += 1
    return out, dropped


# --------------------------------------------------------------------------
# candidates
# --------------------------------------------------------------------------


def best_split(tokens, hero_max, lex):
    """Where to cut a long single clause: (left, right) or None. The cut sits before a contrast word when there is one."""
    n = len(tokens)
    if n < 4:
        return None
    options = []
    for k in range(2, n - 1):
        left, right = tokens[:k], tokens[k:]
        if len(left) > hero_max:
            continue
        if fold(left[-1]) in lex.danglers or is_number_token(left[-1]):
            continue
        before_split_word = starts_with_phrase(right, lex.split_words)[0] > 0 or (lex.lang == "ar" and right[0].startswith("و") and len(right[0]) > 3)
        balance = abs(len(left) - len(right))
        options.append((0 if before_split_word else 1, balance, k))
    if not options:
        return None
    options.sort()
    k = options[0][2]
    return tokens[:k], tokens[k:]


def make_cover(hero, sub):
    """«hero… sub»: the break is attached to the hero; a hero that already ends in a question or exclamation mark keeps it."""
    hero = hero.strip()
    sub = (sub or "").strip()
    if not sub:
        return hero
    if hero and hero[-1] in "؟?!":
        return hero + " " + sub
    return hero.rstrip("…") + ELLIPSIS + " " + sub


def tidy(tokens):
    """Remove stray separators at the edges of a token list."""
    toks = [t for t in tokens if t]
    while toks and re.fullmatch(r"[،,.:;…]+", toks[-1]):
        toks.pop()
    return toks


class Candidate:
    def __init__(self, hero_tokens, sub_tokens, rules):
        self.hero_tokens = tidy(hero_tokens)
        self.sub_tokens = tidy(sub_tokens)
        self.rules = list(dict.fromkeys(rules))

    @property
    def hero(self):
        return " ".join(self.hero_tokens).rstrip(".,،:;")

    @property
    def sub(self):
        return " ".join(self.sub_tokens).rstrip(".,،:;")


def hero_clause_ok(c, hero_max):
    return 0 < len(c.tokens) <= hero_max


def build_candidates(clauses, dropped, source_clauses, hero_max, total_max, lex):
    cands = []
    usable = [c for c in clauses if c.tokens]
    if not usable:
        return cands

    def add(hero, sub, rules):
        if hero:
            cands.append(Candidate(hero, sub, rules))

    base_rules = lambda *cs: [r for c in cs for r in c.rules]  # noqa: E731

    author_break = any(c.sep in (ELLIPSIS,) or c.sep.startswith("..") for c in usable[:-1])

    # 1 the author's own break: first beat, second beat
    if len(usable) >= 2:
        a, b = usable[0], usable[1]
        add(a.tokens, b.tokens, base_rules(a, b) + (["author-break"] if author_break and usable[0].sep == ELLIPSIS else ["break-at-ellipsis"]))
        # 2 the last two beats: the punch line is usually at the end
        if len(usable) > 2:
            a, b = usable[-2], usable[-1]
            add(a.tokens, b.tokens, base_rules(a, b) + ["last-beats", "break-at-ellipsis"])
        # 3 the strongest single beat as a hero with the next one as the sub-line
        for i, c in enumerate(usable[:-1]):
            if i and i != len(usable) - 2 and len(usable) > 3:
                add(c.tokens, usable[i + 1].tokens, base_rules(c, usable[i + 1]) + ["break-at-ellipsis"])
    # 4 one beat on its own
    for c in usable[:3]:
        add(c.tokens, [], base_rules(c) + ["single-beat"])
    # 5 one long beat cut in two
    for c in usable[:3]:
        if len(c.tokens) > hero_max:
            cut = best_split(c.tokens, hero_max, lex)
            if cut:
                add(cut[0], cut[1], base_rules(c) + ["break-at-ellipsis", "split-clause"])

    # a trailing qualifier ("كمصور أعراس في أسوان") is dropped to bring the hero within its limit
    for i, c in enumerate(usable[:3]):
        if len(c.tokens) <= hero_max:
            continue
        for k in range(min(hero_max, len(c.tokens) - 1), 1, -1):
            left, nxt = c.tokens[:k], c.tokens[k]
            if fold(left[-1]) in lex.danglers or is_number_token(left[-1]):
                continue
            if fold(nxt) in lex.qualifiers or (nxt.startswith("ك") and len(nxt) > 3 and lex.lang == "ar"):
                follow = usable[i + 1] if i + 1 < len(usable) else None
                rules = base_rules(c) + ["drop-qualifier"]
                if follow is not None:
                    add(left, follow.tokens, rules + base_rules(follow) + (["author-break"] if c.sep == ELLIPSIS else ["break-at-ellipsis"]))
                add(left, [], rules + ["single-beat"])

    # numeral first: a numeral that sits behind a short subject-verb prefix moves to the front
    extra = []
    for cand in cands:
        for part, other, role in ((cand.hero_tokens, cand.sub_tokens, "hero"), (cand.sub_tokens, [], "sub")):
            idx = next((i for i, t in enumerate(part) if is_number_token(t)), None)
            if idx is not None and 2 <= idx <= 3 and role == "hero":
                extra.append(Candidate(part[idx:], other, cand.rules + ["numeral-first"]))
    cands.extend(extra)
    if any(has_numeral(c.tokens) for c in usable):
        for c in usable:
            if has_numeral(c.tokens) and not has_numeral(usable[0].tokens) and len(usable) >= 2 and c is not usable[0]:
                rest = [x for x in usable if x is not c]
                add(c.tokens, rest[0].tokens, base_rules(c, rest[0]) + ["numeral-first", "break-at-ellipsis"])
    return cands


def evaluate(cand, source_tokens, hero_max, total_max, lex, arabic):
    hero_words = count_words(cand.hero)
    sub_words = count_words(cand.sub)
    total = hero_words + sub_words
    cover = make_cover(cand.hero, cand.sub)
    ok = 0 < hero_words <= hero_max and total <= total_max and hero_words >= 1
    first = [fold(t.strip("؟?!…،,.:;")) for t in cand.hero_tokens[:2]]
    score = 0.0
    if ok:
        score += 4
    if cand.hero_tokens and first and first[0] not in lex.stop:
        score += 3
    elif len(first) > 1 and first[1] not in lex.stop:
        score += 1.5
    if has_numeral(cand.hero_tokens[:2]):
        score += 3
    if cand.sub_tokens:
        score += 2
    if total > 8:
        score -= 0.5 * (total - 8)
    if total > 4:
        score -= 0.15 * (min(total, 8) - 4)
    if total < 3:
        score -= 3
    last = fold((cand.sub_tokens or cand.hero_tokens or [""])[-1].strip("؟?!…،,.:;"))
    if last in lex.danglers:
        score -= 3
    if cand.sub_tokens and fold(cand.sub_tokens[0].strip("؟?!…،,.:;")) in lex.danglers and fold(cand.sub_tokens[0]) not in ("و",):
        score -= 1
    if arabic:
        src_latin = re.findall(r"[A-Za-z][A-Za-z0-9.+_-]*", " ".join(source_tokens))
        if src_latin:
            kept = all(run in cover for run in src_latin)
            score += 2 if kept else -4
    src_num = [t for t in source_tokens if is_number_token(t)]
    if src_num:
        score += 2 if has_numeral(cand.hero_tokens + cand.sub_tokens) else -3
    if "author-break" in cand.rules:
        score += 1
    if "split-clause" in cand.rules:
        score -= 2.5
    if hero_words == 1 and not (cand.hero_tokens and re.search(r"[%٪$]", cand.hero_tokens[0])):
        score -= 6
    if "trim-tail" in cand.rules:
        ok = False
    if "single-beat" in cand.rules and total > 6:
        score -= 1
    return {
        "cover": cover, "hero": cand.hero, "sub": cand.sub, "words": total, "heroWords": hero_words,
        "breakAt": hero_words if cand.sub_tokens else None, "ok": bool(ok), "score": round(score, 2),
        "rules": cand.rules,
    }


def trim_fallback(tokens, hero_max, total_max):
    """A last resort for text with no clause structure: the first words, cut at the limits."""
    toks = tokens[:total_max]
    hero = toks[:hero_max]
    sub = toks[hero_max:]
    return Candidate(hero, sub, ["trim-tail"])


def compress(raw, dialect, hero_max, total_max, top):
    arabic = dialect != "en"
    lex = Lexicon(dialect)
    text = normalise(raw, arabic)
    notes = []
    source_tokens = words_of(text)
    clauses = split_clauses(text)
    for c in clauses:
        strip_fillers(c, lex)
    clauses = [c for c in clauses if c.tokens]
    convert_numbers(clauses, lex)
    clauses, dropped = split_condition(clauses, lex)
    for c in clauses:
        c.tokens = clean_edges(c.tokens)
    clauses = [c for c in clauses if c.tokens]
    if dropped:
        notes.append(M("حُذف شرط «لو…» لأن جملة النتيجة هي الفكرة.", "An if-clause was dropped because its result clause is the point."))
    if any("spelled-number" in c.rules for c in clauses):
        notes.append(M("الأرقام المكتوبة بالحروف تحوّلت إلى أرقام.", "Spelled-out numbers became digits."))
    cands = build_candidates(clauses, dropped, clauses, hero_max, total_max, lex)
    evaluated, seen = [], set()
    for cand in cands:
        row = evaluate(cand, source_tokens, hero_max, total_max, lex, arabic)
        if row["cover"] in seen or not row["cover"]:
            continue
        seen.add(row["cover"])
        evaluated.append(row)
    if not any(r["ok"] for r in evaluated):
        row = evaluate(trim_fallback(source_tokens, hero_max, total_max), source_tokens, hero_max, total_max, lex, arabic)
        if row["cover"] not in seen:
            evaluated.append(row)
        notes.append(M("لا توجد جملة قصيرة كفاية تحافظ على المعنى: أعد صياغتها يدويًا؛ المقترح مقطوع عند الحدّ فقط.",
                       "No clause is short enough to keep the point: rewrite it by hand; the suggestion is only cut at the limit."))
    evaluated.sort(key=lambda r: (not r["ok"], -r["score"], r["words"], r["cover"]))
    return {
        "dialect": dialect,
        "limits": {"heroMax": hero_max, "totalMax": total_max},
        "source": {"text": text, "words": count_words(text)},
        "candidates": evaluated[:max(1, top)],
        "notes": notes,
    }


def render_text(result, lang):
    lines = []
    for i, c in enumerate(result["candidates"], 1):
        flag = "" if c["ok"] else "  (over the limits)"
        lines.append("%d. %s   [%d words, hero %d, score %s]%s" % (i, c["cover"], c["words"], c["heroWords"], c["score"], flag))
        lines.append("   rules: %s" % ", ".join(c["rules"]))
    for n in result["notes"]:
        lines.append("note: " + n[lang])
    return "\n".join(lines) + "\n"


def main(argv=None):
    args = build_parser().parse_args(argv)
    if args.file:
        if args.file == "-":
            raw = sys.stdin.read()
        else:
            p = Path(args.file)
            if not p.is_file():
                fail("E_USAGE", "input file not found: %s" % args.file, 66)
            raw = p.read_text(encoding="utf-8")
    else:
        raw = args.text
    if not raw or not raw.strip():
        fail("E_USAGE", "the opener is empty", 64)
    hero_max = args.hero_max if args.hero_max is not None else cs_rules.platform("plugin.cover.heroMaxWords", 6)
    total_max = args.total_max if args.total_max is not None else cs_rules.platform("plugin.cover.totalMaxWords", 12)
    if hero_max < 1 or total_max < hero_max:
        fail("E_USAGE", "--hero-max must be at least 1 and --total-max at least --hero-max", 64)
    result = compress(raw, args.dialect, hero_max, total_max, args.top)
    if args.format == "json":
        sys.stdout.write(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    else:
        sys.stdout.write(render_text(result, args.lang))
    return 0 if any(c["ok"] for c in result["candidates"]) else 1


if __name__ == "__main__":
    sys.exit(main())
