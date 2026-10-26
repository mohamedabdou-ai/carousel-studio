#!/usr/bin/env python3
"""voice_check.py: does new copy still sound like the brand?

Recomputes the brand's voice fingerprint on the new copy and compares it with
`brand.voice.fingerprint`, then looks for the machine-written tells the brand
did not write.  It is advice for the writer, not a gate: the result is a drift
flag the model uses to rewrite, never a reason to block an export.

The measures mirror brand-setup's fingerprint.py (specified in its
voice-fingerprint reference), so a draft is compared with like for like:
URLs, e-mails, phone numbers, @handles and #tags are removed first; sentences
end at a line break or at . ! ? ؟ (an ellipsis or a decimal point does not end
one); words are the countable tokens of _cs.text.word_count; emoji are counted
on the original text, a ZWJ sequence once.

    sentLen            median words per sentence                 vs fingerprint.sentLen [p25, p75]
    emojiPer100w       emoji per 100 words                       vs fingerprint.emojiPer100w
    latinMixPct        % of words holding a Latin letter         vs fingerprint.latinMixPct
    ellipsisRate       ellipses per sentence                     vs fingerprint.ellipsisRate
    questionBangRate   sentences ending in ? ؟ !, per sentence   vs fingerprint.questionBangRate

A metric is flagged when its value lies more than `plugin.voice.driftIqr`
(1.5) times the interquartile range outside [p25, p75].  The fingerprint stores
one number for each scalar metric, so its band is the stored value plus or
minus a spread (the larger of a per-metric floor and half the stored value);
the interquartile range is twice the spread and the band never goes below 0.
A metric needs enough text to mean anything; below the minimum it is reported
as skipped, never flagged.

Flags: aiWords and stockOpeners (data/rules/copy.json, for the post's dialect)
and the brand's own voice.avoid words.

Advice (NOTE level: it never changes the exit code, because a missing beat is a craft note, not an error):
  first-person-missing   the fingerprint says person = "ana" and a deck of more than 8 slides has no slide with a first-person line
                         (أنا، عندي، معايا، ليا، تجربتي…): the brand's voice is a person, and a deck that never says "I" reads as a template
  signature-not-echoed   the fingerprint stores signature phrases and the call to action (slide and caption) repeats none of them

Usage
    voice_check.py --brand FILE (--spec FILE | --text-file FILE | --text STRING) [--format text|json]

With --spec the caption pack drives the metrics (the fingerprint is built from
captions) and every slide is scanned for the flags too.

JSON: {"ok", "metrics": {name: {value, p25, p75, iqrDistance, flagged[, skipped]}},
       "flags": [{kind, text, where}], "advice": [{kind, text}], "notes": [...]}
Exit codes: 0 no drift and no flags, 1 drift or flags, 64 usage, 65 unreadable JSON,
66 input missing, 70 the shared _cs package is unavailable.
"""
import argparse
import json
import re
import sys
import unicodedata
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
try:
    from _cs import paths
    from _cs import rules, text as cstext
except ImportError as exc:      # the shared package is synced next to the scripts; say so plainly
    sys.stderr.write("cs-error: E_DEP_LOAD: the shared _cs package is missing next to this script: %s\n" % exc)
    sys.exit(70)

paths.ensure_utf8_stdio()

METRICS = ("sentLen", "emojiPer100w", "latinMixPct", "ellipsisRate", "questionBangRate")
SCALAR_SPREAD_FLOOR = {"emojiPer100w": 1.0, "latinMixPct": 5.0, "ellipsisRate": 0.1, "questionBangRate": 0.1}
SCALAR_SPREAD_SHARE = 0.5      # a scalar metric's spread is at least this share of its stored value
MIN_WORDS_FOR_RATES = 20       # the emoji and Latin-mix rates need a body of text
MIN_SENTENCES = 3

NOISE_KINDS = {"url", "email", "handle", "tag", "phone"}
# first person singular, the list brand-setup's fingerprint.py counts "person" with (a unit test keeps the two in step)
SINGULAR = ("أنا", "عندي", "معي", "معايا", "معاي", "لي", "ليا", "بتاعي", "نفسي", "تجربتي", "شغلي")
FIRST_PERSON_MIN_SLIDES = 9       # "a deck of more than 8 slides"
_DIACRITICS = re.compile("[\u064B-\u065F\u0670\u0640]")
_FOLD = str.maketrans({"\u0623": "\u0627", "\u0625": "\u0627", "\u0622": "\u0627", "\u0671": "\u0627", "\u0649": "\u064A", "\u0629": "\u0647"})
SOFT_ELLIPSIS, SOFT_DOT = chr(0xE000), chr(0xE001)       # private-use stand-ins while sentences are split
ZWJ = chr(0x200D)
WS = "[ " + chr(9) + chr(10) + chr(13) + chr(12) + chr(11) + chr(0xA0) + chr(0x202F) + "]+"
ELLIPSIS = re.compile("…|\\.{3,}")
TERMINATOR_QB = re.compile("[!?؟]")
LATIN_LETTER = re.compile("[A-Za-z]")


class _Parser(argparse.ArgumentParser):
    def error(self, message):
        sys.stderr.write("cs-error: E_USAGE: %s\n" % message)
        sys.exit(64)


def build_parser():
    p = _Parser(prog="voice_check.py", description="Compare new copy with the brand's voice fingerprint and flag drift and machine-written tells.")
    p.add_argument("--brand", required=True, help="brand.json (voice.fingerprint, voice.avoid, locale.dialect)")
    src = p.add_mutually_exclusive_group(required=True)
    src.add_argument("--spec", help="spec.json: the caption pack drives the metrics, every slide is scanned for flags")
    src.add_argument("--text-file", help="UTF-8 text file with the copy")
    src.add_argument("--text", help="the copy itself")
    p.add_argument("--format", choices=("text", "json"), default="text", help="output format (default: text)")
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


# --------------------------------------------------------------------------
# measuring (mirrors brand-setup's fingerprint.py)
# --------------------------------------------------------------------------


def strip_noise(text):
    """Drop URLs, e-mails, @handles, #tags and phone numbers: they are not voice."""
    out, last = [], 0
    for tok in cstext.tokenize(text):
        if tok["kind"] in NOISE_KINDS:
            out.append(text[last:tok["start"]])
            last = tok["end"]
    out.append(text[last:])
    return re.sub("[ " + chr(9) + "]{2,}", " ", "".join(out))


def split_sentences(text):
    """[(sentence, terminators)]. Ellipses and decimals never end a sentence; line breaks do."""
    t = re.sub("\\.{3,}|…", SOFT_ELLIPSIS, text)
    t = re.sub("(?<=[0-9٠-٩])\\.(?=[0-9٠-٩])", SOFT_DOT, t)
    out = []
    for line in t.split(chr(10)):
        for m in re.finditer("([^.!?؟]+)([.!?؟]*)", line):
            body = m.group(1).replace(SOFT_ELLIPSIS, "…").replace(SOFT_DOT, ".").strip()
            if body and cstext.word_count(body) > 0:
                out.append((body, m.group(2)))
    return out


def countable_words(sentence):
    return [w for w in re.split(WS, cstext.strip_markup(sentence))
            if w and any(unicodedata.category(c)[0] in "LN" for c in w)]


def count_emoji(token_text):
    """Emoji in one tokenizer 'emoji' token. The tokenizer keeps a run of emoji together, so count the base
    pictographs; variation selectors, skin-tone modifiers and ZWJ-joined parts belong to the emoji before them."""
    count, joined = 0, False
    for ch in token_text:
        cp = ord(ch)
        if ch == ZWJ:
            joined = True
        elif cp == 0xFE0F or 0x1F3FB <= cp <= 0x1F3FF:
            continue
        elif 0x2600 <= cp <= 0x27BF or cp in (0x2B50, 0x2B55) or 0x1F000 <= cp <= 0x1FAFF:
            if not joined:
                count += 1
            joined = False
    return count


def median(values):
    ordered = sorted(values)
    n = len(ordered)
    mid = n // 2
    return float(ordered[mid]) if n % 2 else (ordered[mid - 1] + ordered[mid]) / 2.0


def measure(text):
    """The fingerprint-style numbers for `text`; a metric is None where the text is too short for it."""
    cleaned = strip_noise(text)
    sentences = split_sentences(cleaned)
    words = [w for sentence, _t in sentences for w in countable_words(sentence)]
    n_words, n_sent = len(words), len(sentences)
    emoji = sum(count_emoji(t["text"]) for t in cstext.tokenize(text) if t["kind"] == "emoji")
    latin = sum(1 for w in words if LATIN_LETTER.search(w))
    ellipses = len(ELLIPSIS.findall(cleaned))
    qbang = sum(1 for _s, term in sentences if TERMINATOR_QB.search(term))
    lengths = [cstext.word_count(s) for s, _t in sentences]
    enough_words, enough_sentences = n_words >= MIN_WORDS_FOR_RATES, n_sent >= MIN_SENTENCES
    return {
        "sentLen": median(lengths) if enough_sentences else None,
        "emojiPer100w": emoji * 100.0 / n_words if enough_words else None,
        "latinMixPct": latin * 100.0 / n_words if enough_words else None,
        "ellipsisRate": ellipses / float(n_sent) if enough_sentences else None,
        "questionBangRate": qbang / float(n_sent) if enough_sentences else None,
        "_sentences": n_sent,
    }


def band_for(name, fingerprint):
    """(p25, p75, iqr) for a metric from the stored fingerprint, or None when it is not stored."""
    if name == "sentLen":
        s = fingerprint.get("sentLen") or {}
        if "p25" not in s or "p75" not in s:
            return None
        p25, p75 = float(s["p25"]), float(s["p75"])
        return p25, p75, max(p75 - p25, 1.0)
    ref = fingerprint.get(name)
    if ref is None:
        return None
    ref = float(ref)
    spread = max(SCALAR_SPREAD_FLOOR[name], SCALAR_SPREAD_SHARE * ref)
    return max(0.0, ref - spread), ref + spread, 2.0 * spread


def compare(name, value, fingerprint, drift_iqr):
    band = band_for(name, fingerprint)
    entry = {"value": None if value is None else round(value, 3), "p25": None, "p75": None, "iqrDistance": 0.0, "flagged": False}
    if band is None:
        entry["skipped"] = "no-fingerprint-value"
        return entry
    p25, p75, iqr = band
    entry["p25"], entry["p75"] = round(p25, 3), round(p75, 3)
    if value is None:
        entry["skipped"] = "too-short"
        return entry
    distance = max(0.0, p25 - value, value - p75) / iqr
    entry["iqrDistance"] = round(distance, 3)
    entry["flagged"] = round(distance, 6) > drift_iqr
    return entry


# --------------------------------------------------------------------------
# flags
# --------------------------------------------------------------------------


def avoid_entries(brand):
    entries = []
    for i, term in enumerate((brand.get("voice") or {}).get("avoid") or [], 1):
        term = str(term).strip()
        if term:
            entries.append({"id": "AVOID-%03d" % i, "text": term, "match": "phrase" if " " in term else "word", "clitics": True})
    return entries


def find_flags(chunks, dialect, brand):
    lists = (rules.load_bundle().get("copy") or {}).get("lists", {})
    spec = (("ai-word", lists.get("aiWords", {}).get("entries", [])),
            ("stock-opener", lists.get("stockOpeners", {}).get("entries", [])),
            ("avoid-word", avoid_entries(brand)))
    flags, seen = [], set()
    for where, chunk in chunks:
        for kind, entries in spec:
            for hit in rules.entries_match(entries, chunk, dialect=dialect):
                key = (kind, hit["text"], where)
                if key not in seen:
                    seen.add(key)
                    flags.append({"kind": kind, "text": hit["text"].strip(), "where": where})
    return flags


# --------------------------------------------------------------------------
# input assembly and report
# --------------------------------------------------------------------------


def fold_word(word):
    """The fingerprint's folding: diacritics and tatweel out, alef and ya and ta marbuta forms merged, lower case."""
    return _DIACRITICS.sub("", unicodedata.normalize("NFC", word)).translate(_FOLD).lower()


def fold_phrase(text):
    return " ".join(fold_word(t["text"]) for t in cstext.tokenize(text) if t["kind"] in ("ar", "latin"))


def find_advice(spec, fingerprint):
    """Craft notes that only a whole deck can raise: the first-person beat and the call to action echoing a stored signature."""
    advice = []
    if not spec:
        return advice
    slides = spec.get("slides") or []
    digits = (spec.get("locale") or {}).get("digits") or "western"
    singular = {fold_word(w) for w in SINGULAR}
    if fingerprint.get("person") == "ana" and len(slides) >= FIRST_PERSON_MIN_SLIDES:
        said = [s.get("id") for s in slides
                if any(fold_phrase(t).split() and singular & set(fold_phrase(t).split()) for t in cstext.slide_text(s, digits))]
        if not said:
            advice.append({"kind": "first-person-missing",
                           "text": "the brand writes as «أنا» (fingerprint.person = ana) but none of the %d slides has a first-person line; "
                                   "add one beat in the creator's own voice (a personal result, a mistake, «أنا جرّبت…»)" % len(slides)})
    signatures = [str(s) for s in (fingerprint.get("signatures") or []) if str(s).strip()]
    if signatures:
        cta = [slide["cta"].get("text") or "" for slide in slides if isinstance(slide.get("cta"), dict)]
        cta.append((spec.get("captionPack") or {}).get("cta") or "")
        joined = fold_phrase(" ".join(cta))
        if joined and not any(fold_phrase(s) and fold_phrase(s) in joined for s in signatures):
            advice.append({"kind": "signature-not-echoed",
                           "text": "the call to action repeats none of the brand's signature phrases (%s); use one when it fits" % " ، ".join(signatures[:3])})
    return advice


def gather(args, brand):
    """Return (text_for_the_metrics, [(where, text)] for the flags, dialect)."""
    dialect = (brand.get("locale") or {}).get("dialect") or "eg"
    if args.spec:
        spec = load_json(args.spec, "spec file")
        dialect = (spec.get("locale") or {}).get("dialect") or dialect
        digits = (spec.get("locale") or {}).get("digits") or "western"
        pack = spec.get("captionPack") or {}
        caption = chr(10).join(pack[k] for k in ("firstLine", "keywordLine", "body", "cta") if pack.get(k))
        chunks = [("caption", caption)] if caption else []
        for slide in spec.get("slides") or []:
            chunks.extend((slide.get("id", "slide"), t) for t in cstext.slide_text(slide, digits) if t)
        return caption, chunks, dialect
    if args.text_file:
        p = Path(args.text_file)
        if not p.is_file():
            fail("E_USAGE", "text file not found: %s" % args.text_file, 66)
        body = p.read_bytes().decode("utf-8", "replace")
    else:
        body = args.text
    body = cstext.normalize(body)
    return body, [("text", body)], dialect


def render_text(report):
    lines = ["voice_check  ok=%s" % str(report["ok"]).lower(), ""]
    lines.append("%-18s %9s  %-15s %8s  %s" % ("metric", "value", "band", "distance", "flagged"))
    for name, m in report["metrics"].items():
        band = "-" if m["p25"] is None else "%g..%g" % (m["p25"], m["p75"])
        value = "-" if m["value"] is None else "%g" % m["value"]
        note = " (%s)" % m["skipped"] if m.get("skipped") else ""
        lines.append("%-18s %9s  %-15s %8g  %s%s" % (name, value, band, m["iqrDistance"], "YES" if m["flagged"] else "no", note))
    if report["flags"]:
        lines += ["", "flags"]
        lines += ["  %-13s [%s]  %s" % (f["kind"], f["where"], f["text"]) for f in report["flags"]]
    for a in report["advice"]:
        lines.append("advice: %s: %s" % (a["kind"], a["text"]))
    for n in report["notes"]:
        lines.append("note: %s" % n)
    return chr(10).join(lines) + chr(10)


def main(argv=None):
    args = build_parser().parse_args(argv)
    brand = load_json(args.brand, "brand file")
    fingerprint = (brand.get("voice") or {}).get("fingerprint") or {}
    drift_iqr = float(rules.platform("plugin.voice.driftIqr", 1.5))

    metric_text, chunks, dialect = gather(args, brand)
    measured = measure(metric_text)
    notes = []
    if not fingerprint:
        notes.append("the brand has no voice fingerprint yet: metrics are reported but nothing can drift")
    if measured["_sentences"] < MIN_SENTENCES:
        notes.append("fewer than %d sentences: sentence-based metrics skipped" % MIN_SENTENCES)

    metrics = {name: compare(name, measured[name], fingerprint, drift_iqr) for name in METRICS}
    flags = find_flags(chunks, dialect, brand)

    spec = load_json(args.spec, "spec file") if args.spec else None
    advice = find_advice(spec, fingerprint)
    report = {"ok": not flags and not any(m["flagged"] for m in metrics.values()),
              "metrics": metrics, "flags": flags, "advice": advice, "notes": notes}
    if args.format == "json":
        sys.stdout.write(json.dumps(report, ensure_ascii=False, indent=2) + chr(10))
    else:
        sys.stdout.write(render_text(report))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
