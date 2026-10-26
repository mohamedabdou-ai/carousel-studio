#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""fingerprint.py - measure a writer's voice from 3-10 past captions.

    fingerprint.py (--file captions.txt | --stdin) [--separator "---"] [--dialect D]
                   [--format text|json] [--with-report]

Captions are separated by a line that contains only the separator (default "---").
With --format json the output is exactly the `fingerprint` object of brand.schema.json
(save it with `brand_io.py save-section`). The algorithm is specified in
references/voice-fingerprint.md and is mirrored by carousel-create/scripts/voice_check.py,
so the two always compare like with like. Nothing here touches the network.

Exit codes: 0 ok, 2 result invalid against the schema, 64 usage (fewer than 3 captions
included), 65 unreadable input, 66 missing file.
"""

import argparse
import json
import math
import os
import re
import sys
import unicodedata
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _cs import paths, schema, text as cstext  # noqa: E402

paths.ensure_utf8_stdio()

MIN_CAPTIONS, MAX_CAPTIONS = 3, 10
MAX_SIGNATURES, MAX_EMOJI, MAX_OPENERS, MAX_GRAM = 8, 8, 20, 6

# --- marker vocabularies (folded forms; see fold()) ---------------------------------
DIALECT_MARKERS = {
    "eg": ["مش", "ده", "دي", "دول", "إزاي", "ازاي", "ليه", "دلوقتي", "كده", "عايز", "عاوز", "بتاع", "أوي", "اوي",
           "فين", "إمتى", "إيه", "لسه", "برضو", "برضه"],
    "gulf": ["مو", "مب", "وايد", "الحين", "شلون", "شنو", "وش", "ليش", "أبي", "أبغى", "تبي", "تبغى", "يبي", "زين", "وين"],
    "levant": ["شو", "كتير", "هلق", "هلأ", "بدي", "بدك", "رح", "هيك", "هيدا", "هاد", "منيح", "ليش", "قديش", "هون", "لسا"],
}
SINGULAR = ["أنا", "عندي", "معي", "معايا", "معاي", "لي", "ليا", "بتاعي", "نفسي", "تجربتي", "شغلي"]
PLURAL = ["إحنا", "نحن", "عندنا", "معانا", "لنا", "بتاعنا", "فريقنا", "شغلنا"]
STOPWORDS = ["في", "من", "على", "الى", "إلى", "عن", "مع", "أن", "إن", "ان", "ما", "لا", "هل", "أو", "او", "و", "ثم", "كل",
             "هذا", "هذه", "ده", "دي", "هو", "هي", "أنا", "انا", "إنت", "انت", "أنت", "اللي", "الي", "التي", "الذي", "لو",
             "بس", "كان", "كانت", "يكون", "عشان", "علشان", "لـ", "بـ", "the", "a", "an", "to", "of", "in", "and", "for",
             "is", "it", "on", "with"]

_DIAC = re.compile("[ً-ْٰـ]")
_FOLD = str.maketrans({"أ": "ا", "إ": "ا", "آ": "ا", "ٱ": "ا", "ى": "ي", "ة": "ه"})
_SOFT_ELLIPSIS = ""
_DOT = ""


def fold(word):
    return _DIAC.sub("", unicodedata.normalize("NFC", word)).translate(_FOLD).lower()


DIALECT_FOLDED = {d: {fold(m): m for m in ms} for d, ms in DIALECT_MARKERS.items()}
SINGULAR_F = {fold(w) for w in SINGULAR}
PLURAL_F = {fold(w) for w in PLURAL}
STOP_F = {fold(w) for w in STOPWORDS}


class Fail(Exception):
    def __init__(self, code, message, exit_code):
        super().__init__(message)
        self.code, self.exit_code = code, exit_code


class Parser(argparse.ArgumentParser):
    def error(self, message):
        sys.stderr.write("cs-error: E_USAGE: %s\n" % message)
        raise SystemExit(64)


# --- input ----------------------------------------------------------------------------
def read_captions(args):
    if args.file:
        p = Path(args.file)
        if not p.exists():
            raise Fail("E_USAGE", "file %s not found" % p, 66)
        try:
            raw = paths.read_text(p)
        except (OSError, UnicodeDecodeError) as exc:
            raise Fail("E_SCHEMA", "cannot read %s: %s" % (p, exc), 65)
    else:
        raw = sys.stdin.read()
    sep = args.separator
    blocks, cur = [], []
    for line in raw.replace("\r\n", "\n").split("\n"):
        if line.strip() == sep:
            blocks.append("\n".join(cur))
            cur = []
        else:
            cur.append(line)
    blocks.append("\n".join(cur))
    captions = [unicodedata.normalize("NFC", b).strip() for b in blocks if b.strip()]
    return captions


# --- text model -----------------------------------------------------------------------
NOISE_KINDS = {"url", "email", "handle", "tag", "phone"}


def strip_noise(text):
    """Drop URLs, e-mails, @handles, #tags and phone numbers (they are not voice)."""
    out, last = [], 0
    for tok in cstext.tokenize(text):
        if tok["kind"] in NOISE_KINDS:
            out.append(text[last:tok["start"]])
            last = tok["end"]
    out.append(text[last:])
    return re.sub(r"[ \t]{2,}", " ", "".join(out))


def split_sentences(text):
    """Return [(sentence, terminators)]. Ellipses and decimals never end a sentence; newlines do."""
    t = re.sub(r"\.{3,}|…", _SOFT_ELLIPSIS, text)
    t = re.sub(r"(?<=[0-9])\.(?=[0-9])", _DOT, t)
    out = []
    for line in t.split("\n"):
        for m in re.finditer(r"([^.!?؟]+)([.!?؟]*)", line):
            body = m.group(1).replace(_SOFT_ELLIPSIS, "…").replace(_DOT, ".").strip()
            if body and cstext.word_count(body) > 0:
                out.append((body, m.group(2)))
    return out


def countable_words(sentence):
    return [w for w in re.split("[ \t\n\r\f\v  ]+", cstext.strip_markup(sentence))
            if w and any(unicodedata.category(c)[0] in "LN" for c in w)]


def percentile(values, p):
    if not values:
        return 0.0
    vals = sorted(values)
    k = (len(vals) - 1) * p
    lo, hi = math.floor(k), math.ceil(k)
    return vals[lo] if lo == hi else vals[lo] + (vals[hi] - vals[lo]) * (k - lo)


def tokens_folded(sentence):
    """Folded ar/latin words of a sentence with their surface forms."""
    out = []
    for tok in cstext.tokenize(sentence):
        if tok["kind"] in ("ar", "latin"):
            out.append((fold(tok["text"]), tok["text"]))
    return out


# --- metrics --------------------------------------------------------------------------
def signatures(per_caption_sentences):
    """Recurring 2-6 word phrases that appear in at least two different captions."""
    stats = {}
    for ci, sentences in enumerate(per_caption_sentences):
        for sent, _term in sentences:
            toks = tokens_folded(sent)
            for n in range(2, MAX_GRAM + 1):
                for i in range(len(toks) - n + 1):
                    gram = toks[i:i + n]
                    while gram and gram[0][0] in STOP_F:
                        gram = gram[1:]
                    while gram and gram[-1][0] in STOP_F:
                        gram = gram[:-1]
                    if len(gram) < 2 or all(len(g[0]) <= 2 for g in gram):
                        continue
                    key = " ".join(g[0] for g in gram)
                    entry = stats.setdefault(key, {"docs": set(), "count": 0, "surface": " ".join(g[1] for g in gram),
                                                   "words": len(gram)})
                    entry["docs"].add(ci)
                    entry["count"] += 1
    ranked = sorted(((k, v) for k, v in stats.items() if len(v["docs"]) >= 2),
                    key=lambda kv: (-kv[1]["words"], -len(kv[1]["docs"]), -kv[1]["count"], kv[0]))
    chosen = []
    for key, v in ranked:
        if any(key in c for c, _ in chosen):
            continue
        chosen.append((key, v))
        if len(chosen) >= MAX_SIGNATURES:
            break
    return [v["surface"][:120] for _k, v in chosen]


def compute(captions, dialect, computed_at):
    cleaned = [strip_noise(c) for c in captions]
    per_caption = [split_sentences(c) for c in cleaned]
    all_sentences = [s for caption in per_caption for s in caption]
    lengths = [cstext.word_count(s) for s, _t in all_sentences]
    words = [w for s, _t in all_sentences for w in countable_words(s)]
    total_words = max(len(words), 1)
    n_sent = max(len(all_sentences), 1)

    # emoji (counted on the original captions: a sequence joined by ZWJ is one emoji)
    emoji = Counter()
    first_seen = {}
    for c in captions:
        for tok in cstext.tokenize(c):
            if tok["kind"] == "emoji":
                emoji[tok["text"]] += 1
                first_seen.setdefault(tok["text"], len(first_seen))
    emoji_set = [e for e, _ in sorted(emoji.items(), key=lambda kv: (-kv[1], first_seen[kv[0]]))][:MAX_EMOJI]

    latin_words = sum(1 for w in words if re.search("[A-Za-z]", w))
    ellipses = sum(len(re.findall(r"…|\.{3,}", c)) for c in cleaned)
    qbang = sum(1 for _s, term in all_sentences if re.search(r"[!?؟]", term))

    folded_words = [fold(t) for c in cleaned for t in re.findall(r"[ء-يً-ْـ]+", c)]
    sing = sum(1 for w in folded_words if w in SINGULAR_F)
    plur = sum(1 for w in folded_words if w in PLURAL_F)

    markers, per_dialect = Counter(), Counter()
    for w in folded_words:
        for d, table in DIALECT_FOLDED.items():
            if w in table:
                markers[table[w]] += 1
                per_dialect[d] += 1
    openers, seen = [], set()
    for sentences in per_caption:
        if sentences:
            first = sentences[0][0]
            head = first.split("…")[0]  # the opening beat ends at the first ellipsis
            beat = head if len(countable_words(head)) >= 2 else first
            opener = " ".join(countable_words(beat)[:6])[:120]
            if opener and opener not in seen:
                seen.add(opener)
                openers.append(opener)

    fp = {
        "sentLen": {"p25": round(percentile(lengths, 0.25), 1), "p50": round(percentile(lengths, 0.50), 1),
                    "p75": round(percentile(lengths, 0.75), 1), "p90": round(percentile(lengths, 0.90), 1)},
        "emojiPer100w": round(sum(emoji.values()) * 100.0 / total_words, 2),
        "emojiSet": emoji_set,
        "latinMixPct": round(latin_words * 100.0 / total_words, 1),
        "ellipsisRate": round(ellipses / n_sent, 2),
        "questionBangRate": round(qbang / n_sent, 2),
    }
    if sing + plur:
        if sing > 1.5 * plur:
            fp["person"] = "ana"
        elif plur > 1.5 * sing:
            fp["person"] = "ehna"
        else:
            fp["person"] = "mixed"
    fp["openers"] = openers[:MAX_OPENERS]
    fp["dialectMarkers"] = dict(markers.most_common())
    lens = [len(c) for c in captions]
    fp["captionLenBand"] = [int(round(percentile(lens, 0.25))), int(round(percentile(lens, 0.75)))]
    fp["signatures"] = signatures(per_caption)
    fp["computedAt"] = computed_at
    fp["sampleCount"] = len(captions)

    ranked = per_dialect.most_common()
    detected = "unknown"
    if ranked and ranked[0][1] >= 2 and (len(ranked) == 1 or ranked[0][1] >= 2 * ranked[1][1]):
        detected = ranked[0][0]
    elif ranked:
        detected = "mixed"
    report = {"detectedDialect": detected, "markerHits": dict(per_dialect), "sentences": len(all_sentences),
              "words": len(words), "warnings": []}
    if dialect and detected not in ("unknown", dialect):
        report["warnings"].append("captions read as %s but the brand dialect is %s" % (detected, dialect))
    if len(all_sentences) < 12:
        report["warnings"].append("fewer than 12 sentences in total: treat the percentiles as rough")
    if detected == "unknown":
        report["warnings"].append("no dialect markers found: the captions may be formal or mostly English")
    return fp, report


def render_text(fp, report):
    sl = fp["sentLen"]
    lines = [
        "عدد الكابشنات: %d  |  الجمل: %d  |  الكلمات: %d" % (fp["sampleCount"], report["sentences"], report["words"]),
        "طول الجملة (كلمات): p25=%s  p50=%s  p75=%s  p90=%s" % (sl["p25"], sl["p50"], sl["p75"], sl["p90"]),
        "إيموجي لكل 100 كلمة: %s  %s" % (fp["emojiPer100w"], " ".join(fp["emojiSet"])),
        "نسبة اللاتيني: %s%%  |  النقاط الثلاث لكل جملة: %s  |  السؤال/التعجب: %s"
        % (fp["latinMixPct"], fp["ellipsisRate"], fp["questionBangRate"]),
        "الضمير: %s  |  طول الكابشن: %s" % (fp.get("person", "-"), fp["captionLenBand"]),
        "اللهجة المرصودة: %s %s" % (report["detectedDialect"], json.dumps(fp["dialectMarkers"], ensure_ascii=False)),
        "جمل البداية: " + " ، ".join(fp["openers"]),
        "عبارات متكررة (مرشّحة للتوقيع): " + " ، ".join(fp["signatures"]),
    ]
    lines += ["تنبيه: " + w for w in report["warnings"]]
    return "\n".join(lines)


def main(argv=None):
    ap = Parser(prog="fingerprint.py", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument("--file", help="captions file")
    src.add_argument("--stdin", action="store_true", help="read captions from standard input")
    ap.add_argument("--separator", default="---", help='line that separates captions (default "---")')
    ap.add_argument("--dialect", choices=("eg", "gulf", "levant", "msa-white", "en"))
    ap.add_argument("--format", choices=("text", "json"), default="text")
    ap.add_argument("--with-report", action="store_true", help="json: wrap as {fingerprint, report}")
    ap.add_argument("--computed-at", help="override the timestamp (tests)")
    args = ap.parse_args(argv)
    try:
        captions = read_captions(args)
        if len(captions) < MIN_CAPTIONS:
            raise Fail("E_USAGE", "need %d-%d captions, found %d (separate captions with a line holding %r)"
                       % (MIN_CAPTIONS, MAX_CAPTIONS, len(captions), args.separator), 64)
        truncated = len(captions) > MAX_CAPTIONS
        captions = captions[:MAX_CAPTIONS]
        stamp = args.computed_at or os.environ.get("CS_NOW") or datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        fp, report = compute(captions, args.dialect, stamp)
        if truncated:
            report["warnings"].append("more than %d captions: only the first %d were used" % (MAX_CAPTIONS, MAX_CAPTIONS))
        errors = schema.validate_named("brand", fp, def_name="fingerprint")
        if errors:
            raise Fail("E_SCHEMA", "fingerprint invalid: %s" % errors[:3], 2)
    except Fail as exc:
        sys.stderr.write("cs-error: %s: %s\n" % (exc.code, exc))
        return exc.exit_code
    if args.format == "json":
        print(json.dumps({"fingerprint": fp, "report": report} if args.with_report else fp, ensure_ascii=False))
    else:
        print(render_text(fp, report))
    return 0


if __name__ == "__main__":
    sys.exit(main())
