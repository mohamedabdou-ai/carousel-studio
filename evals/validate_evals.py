#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""validate_evals.py - check and export the Carousel Studio eval suite (B12).

    validate_evals.py [check] [--only trigger|behaviour|fixtures|hygiene ...] [--format text|json] [--strict]
    validate_evals.py export-triggers --out DIR [--skill NAME] [--runs N] [--clean]
    validate_evals.py export-skill-creator --out DIR
    validate_evals.py summarize-triggers RESULT.json [--format text|json]

`check` (the default) verifies, without calling any model:
  trigger   the seven skills/<skill>/evals/evals.json files: 20 should-trigger and 10 should-not
            prompts each, four prompts per register (eg, gulf, levant, msa-white, en), reel and
            Canva negatives, and a routing matrix that agrees across skills;
  behaviour evals/behaviour/*/case.yaml: shape of every `claude plugin eval` case and coverage of
            the behaviours the product promises;
  fixtures  tests/fixtures/*: every JSON file against the schemas in carousel-design/schemas, the
            copy limits and dialect markers on the clean sample specs, the bidi strings and the
            seeded orthography errors recomputed from the shipped rule data;
  hygiene   no URL, owner name, handle or client hook id inside the plugin-side eval files, and
            no credit inside any fixture.

`export-triggers` writes one `claude plugin eval` case per trigger prompt (case.yaml) into DIR, so
the 210 trigger prompts can be run with the real harness, and `summarize-triggers` turns the harness's
`--json` result into per-skill recall, specificity, precision and routing figures:

    python evals/validate_evals.py export-triggers --out evals/triggers/generated --clean
    claude plugin eval . --case "trg-*" --ablation none --runs 1 -j 6 --json result.json
    python evals/validate_evals.py summarize-triggers result.json

Python 3.11 standard library only; reads and writes UTF-8; never touches the network.
Exit codes (CONTRACT 0.4): 0 no errors (warnings are printed), 1 warnings only with --strict, 2 errors,
64 usage, 66 missing input, 73 cannot write.
"""

import argparse
import json
import os
import re
import sys
import unicodedata
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
PLUGIN = REPO / "plugins" / "carousel-studio"
SKILLS = PLUGIN / "skills"
DESIGN = SKILLS / "carousel-design"
EVALS = REPO / "evals"
BEHAVIOUR = EVALS / "behaviour"
FIXTURES = REPO / "tests" / "fixtures"

SKILL_NAMES = (
    "carousel-create",
    "content-angles",
    "brand-setup",
    "arabic-proofread",
    "carousel-design",
    "content-plan",
    "visual-prompts",
)
DIALECTS = ("eg", "gulf", "levant", "msa-white", "en")
OUTSIDE_TARGETS = ("reel-montage", "canva", "none")
NEGATIVE_KINDS = ("sibling", "reel", "canva", "adjacent", "unrelated")

TRIGGERS_PER_SKILL = 30
POSITIVES_PER_DIALECT = 4
NEGATIVES_PER_SKILL = 10

# Behaviours the suite promises to cover; every tag must appear on at least one case.
REQUIRED_BEHAVIOUR_TAGS = (
    "guided-checkpoint-1",
    "valid-spec",
    "hooks-top3",
    "no-invented-numbers",
    "one-dialect",
    "slide-2-no-intro",
    "one-cta",
    "hashtags-max-5",
    "per-slide-captions-alt",
    "no-credit-in-exports",
    "digits",
    "dialect-override",
    "injection",
    "secrets",
    "promo",
    # the creative team (team/charter.md section 7)
    "pitch-two-directions",
    "hook-duel",
    "editor-verdict",
    "drop-off-map",
    "design-huddle",
    "director-review",
    "team-log-short",
    "creative-memory",
    "panel-honest",
)

# Rule-data defects found while building the fixtures: (rule id, matched word). They are reported once
# as warnings (for the owner of ortho.json) and do not fail the clean samples.
KNOWN_RULE_DEFECTS = {
    ("ORTHO-HAMZA-004", "واحد"): "clitics:true on «احد» makes the very common word "
                                                      "«واحد» read as و + احد",
}

OWNER_STRINGS = ("محمد عبده", "mohamed abdou", "mohamed.abdou", "mohamedabdou", "pyraai")
CLIENT_HOOK_ID = re.compile(r"\bH1(?:4[7-9]|[5-9][0-9])\b")
URL_RE = re.compile(r"https?://|www\.", re.I)


# =============================================================================== reporting
class Report:
    """Collects findings; `errors` fail the run, `warnings` only change the exit code to 1."""

    def __init__(self):
        self.errors = []
        self.warnings = []
        self.checked = {}

    def error(self, where, message):
        self.errors.append({"where": str(where), "message": message})

    def warn(self, where, message):
        self.warnings.append({"where": str(where), "message": message})

    def count(self, area, n=1):
        self.checked[area] = self.checked.get(area, 0) + n


def read_json(path):
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def rel(path):
    try:
        return Path(path).resolve().relative_to(REPO).as_posix()
    except ValueError:
        return str(path)


# =============================================================================== JSON schema subset
# The validator CONTRACT 3.1 describes, only as far as the fixtures need it. The canonical engines are
# _cs.schema (Python) and CS.core.schema (browser); this copy keeps the evals self-contained.
def _is_int(v):
    return (isinstance(v, int) and not isinstance(v, bool)) or (isinstance(v, float) and v.is_integer())


def _is_num(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool)


_TYPE_CHECKS = {
    "string": lambda v: isinstance(v, str),
    "integer": _is_int,
    "number": _is_num,
    "boolean": lambda v: isinstance(v, bool),
    "object": lambda v: isinstance(v, dict),
    "array": lambda v: isinstance(v, list),
    "null": lambda v: v is None,
}


def _regex(pattern):
    if pattern.endswith("$") and not pattern.endswith("\\$"):
        pattern = pattern[:-1] + r"\Z"
    return re.compile(pattern)


def schema_errors(value, schema, root, path="", out=None):
    """Return [(path, keyword, message)] for `value` against `schema` (subset of JSON Schema 2020-12)."""
    out = [] if out is None else out
    if "$ref" in schema:
        ref = schema["$ref"]
        target = root
        for part in ref.removeprefix("#/").split("/"):
            target = target[part]
        return schema_errors(value, target, root, path, out)
    if "const" in schema and value != schema["const"]:
        out.append((path, "const", "must equal %r" % (schema["const"],)))
    if "enum" in schema and value not in schema["enum"]:
        out.append((path, "enum", "must be one of %s" % ", ".join(map(repr, schema["enum"]))))
    types = schema.get("type")
    if types is not None:
        types = [types] if isinstance(types, str) else types
        if not any(_TYPE_CHECKS[t](value) for t in types):
            out.append((path, "type", "expected %s" % "|".join(types)))
            return out
    if isinstance(value, str):
        n = len(value)
        if "minLength" in schema and n < schema["minLength"]:
            out.append((path, "minLength", "shorter than %d" % schema["minLength"]))
        if "maxLength" in schema and n > schema["maxLength"]:
            out.append((path, "maxLength", "longer than %d (%d)" % (schema["maxLength"], n)))
        if "pattern" in schema and not _regex(schema["pattern"]).search(value):
            out.append((path, "pattern", "does not match %s" % schema["pattern"]))
    if _is_num(value):
        if "minimum" in schema and value < schema["minimum"]:
            out.append((path, "minimum", "below %s" % schema["minimum"]))
        if "maximum" in schema and value > schema["maximum"]:
            out.append((path, "maximum", "above %s" % schema["maximum"]))
    if isinstance(value, list):
        if "minItems" in schema and len(value) < schema["minItems"]:
            out.append((path, "minItems", "fewer than %d items" % schema["minItems"]))
        if "maxItems" in schema and len(value) > schema["maxItems"]:
            out.append((path, "maxItems", "more than %d items (%d)" % (schema["maxItems"], len(value))))
        if schema.get("uniqueItems") and len({json.dumps(v, sort_keys=True) for v in value}) != len(value):
            out.append((path, "uniqueItems", "items are not unique"))
        if "items" in schema:
            for i, item in enumerate(value):
                schema_errors(item, schema["items"], root, "%s/%d" % (path, i), out)
    if isinstance(value, dict):
        props = schema.get("properties", {})
        for key in schema.get("required", []):
            if key not in value:
                out.append((path, "required", "missing %r" % key))
        extra = schema.get("additionalProperties", True)
        for key, item in value.items():
            if key in props:
                schema_errors(item, props[key], root, "%s/%s" % (path, key), out)
            elif extra is False:
                out.append((path, "additionalProperties", "unknown property %r" % key))
            elif isinstance(extra, dict):
                schema_errors(item, extra, root, "%s/%s" % (path, key), out)
        if "minProperties" in schema and len(value) < schema["minProperties"]:
            out.append((path, "minProperties", "fewer than %d properties" % schema["minProperties"]))
    for kw in ("allOf",):
        for sub in schema.get(kw, []):
            schema_errors(value, sub, root, path, out)
    if "anyOf" in schema and not any(not schema_errors(value, s, root, path, []) for s in schema["anyOf"]):
        out.append((path, "anyOf", "matches none of the alternatives"))
    if "oneOf" in schema:
        hits = sum(1 for s in schema["oneOf"] if not schema_errors(value, s, root, path, []))
        if hits != 1:
            out.append((path, "oneOf", "matches %d alternatives, expected exactly one" % hits))
    return out


_SCHEMAS = {}


def load_schema(kind):
    if kind not in _SCHEMAS:
        _SCHEMAS[kind] = read_json(DESIGN / "schemas" / ("%s.schema.json" % kind))
    return _SCHEMAS[kind]


def check_schema(kind, instance, where, report):
    schema = load_schema(kind)
    for path, keyword, message in sorted(schema_errors(instance, schema, schema)):
        report.error(where, "schema/%s %s %s: %s" % (kind, path or "/", keyword, message))


# =============================================================================== text model (CONTRACT 3.3)
WS_CLASS = " \t\n\r\f\v\u00a0\u202f"
WS_RE = re.compile("[%s]+" % re.escape(WS_CLASS))
_NS = r"[^ \t\n\r\f\v\u00a0\u202f<>\"]"
AR_CLASS = (
    "\u0621-\u064a\u064b-\u0652\u0640\u066e-\u06d3\u06d5\u06fa-\u06ff\u0750-\u077f\u08a0-\u08ff"
    "\ufb50-\ufdff\ufe70-\ufeff"
)
AR_LETTER = "\u0621-\u064a"
DIACRITICS = re.compile("[\u064b-\u065f\u0670\u0640]")
_EMOJI = "[\u2600-\u27bf\u2b50\u2b55\U0001f000-\U0001faff][\ufe0f\u200d\u2600-\u27bf\U0001f000-\U0001faff]*"

_RULES = [
    ("url", re.compile(r"https?://%s+" % _NS)),
    ("url", re.compile(r"www\.%s+" % _NS)),
    ("url", re.compile(r"[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[a-z]{2,24}(?![A-Za-z0-9-])(?:/%s*)?" % _NS)),
    ("email", re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")),
    ("handle", re.compile(r"@[A-Za-z0-9._]{1,30}")),
    ("tag", re.compile(r"#[^ \t\n\r\f\v\u00a0\u202f#<>]+")),
    ("phone", re.compile(r"\+?[0-9][0-9\u00a0 ()-]{7,}[0-9]")),
    ("number", re.compile(r"[$\u20ac\u00a3]?[0-9]+(?:[.,][0-9]+)*(?:%|[A-Za-z]{1,6})?")),
    ("number", re.compile("[\u0660-\u0669]+(?:[\u066b\u066c][\u0660-\u0669]+)*\u066a?")),
    ("number", re.compile("[\u06f0-\u06f9]+")),
    ("latin", re.compile("[A-Za-z\u00c0-\u024f][A-Za-z0-9\u00c0-\u024f'\u2019._\\-+/&]*")),
    ("emoji", re.compile(_EMOJI)),
    ("ar", re.compile("[%s]+" % AR_CLASS)),
    ("space", re.compile("[%s]+" % re.escape(WS_CLASS))),
]
_LTR_KINDS = {"url", "email", "handle", "phone", "latin"}


def has_arabic(s):
    return re.search("[%s]" % AR_CLASS, s) is not None


def tokenize(text):
    """Tokens of CONTRACT 3.3: {kind, text, start, end, ltr}; offsets are code points."""
    s = unicodedata.normalize("NFC", text)
    tokens, i = [], 0
    while i < len(s):
        for kind, rx in _RULES:
            m = rx.match(s, i)
            if not m or m.end() == i:
                continue
            end = m.end()
            if kind == "latin":
                while end > i and s[end - 1] in ".-_/&'\u2019":
                    end -= 1
                if end == i:
                    continue
            tok = s[i:end]
            if kind == "number":
                ltr = tok[0] in "0123456789$\u20ac\u00a3"
            elif kind == "tag":
                ltr = not has_arabic(tok)
            else:
                ltr = kind in _LTR_KINDS
            tokens.append({"kind": kind, "text": tok, "start": i, "end": end, "ltr": ltr})
            i = end
            break
        else:
            tokens.append({"kind": "punct", "text": s[i], "start": i, "end": i + 1, "ltr": False})
            i += 1
    return tokens


def significant(tokens):
    return [t for t in tokens if t["kind"] != "space"]


def ltr_runs(text):
    """Texts of the LTR runs: consecutive ltr tokens separated by exactly one U+0020 merge."""
    s = unicodedata.normalize("NFC", text)
    runs, current, previous = [], None, None
    for tok in significant(tokenize(s)):
        if tok["ltr"]:
            if current is not None and previous is not None and s[previous["end"]:tok["start"]] == " ":
                current[1] = tok["end"]
            else:
                if current is not None:
                    runs.append(tuple(current))
                current = [tok["start"], tok["end"]]
        else:
            if current is not None:
                runs.append(tuple(current))
            current = None
        previous = tok
    if current is not None:
        runs.append(tuple(current))
    return [s[a:b] for a, b in runs]


MARK_RE = re.compile(r"==(.+?)==", re.S)


def strip_markup(text):
    return WS_RE.sub(" ", MARK_RE.sub(lambda m: m.group(1), text.replace("\n", " "))).strip()


def word_count(text):
    n = 0
    for part in WS_RE.split(strip_markup(unicodedata.normalize("NFC", text))):
        if part and any(unicodedata.category(c)[0] in "LN" for c in part):
            n += 1
    return n


def char_count(text):
    return len(unicodedata.normalize("NFC", text))


def detect_digits(text):
    systems = set()
    for tok in significant(tokenize(text)):
        if tok["kind"] != "number" or re.search("[A-Za-z]", tok["text"]):
            continue
        if re.search("[0-9]", tok["text"]):
            systems.add("western")
        if re.search("[\u0660-\u0669]", tok["text"]):
            systems.add("arabic-indic")
        if re.search("[\u06f0-\u06f9]", tok["text"]):
            systems.add("persian")
    if not systems:
        return "none"
    if "persian" in systems:
        return "persian" if len(systems) == 1 else "mixed"
    return systems.pop() if len(systems) == 1 else "mixed"


def skeleton(text):
    s = unicodedata.normalize("NFC", text).lower()
    s = DIACRITICS.sub("", s)
    s = s.translate(str.maketrans({"\u0623": "\u0627", "\u0625": "\u0627", "\u0622": "\u0627", "\u0671": "\u0627",
                                   "\u0649": "\u064a", "\u0629": "\u0647", "\u0624": "\u0648", "\u0626": "\u064a"}))
    s = "".join(str(unicodedata.digit(c)) if unicodedata.category(c) == "Nd" else c for c in s)
    return "".join(c for c in s if unicodedata.category(c)[0] in "LN")


def similarity(a, b):
    sa, sb = skeleton(a), skeleton(b)

    def grams(s):
        if not s:
            return set()
        return {s} if len(s) < 3 else {s[i:i + 3] for i in range(len(s) - 2)}

    ga, gb = grams(sa), grams(sb)
    if not ga and not gb:
        return 1.0
    if not ga or not gb:
        return 0.0
    return 2 * len(ga & gb) / (len(ga) + len(gb))


# =============================================================================== rule data (shared with the skills)
_RULE_DATA = {}


def rule_data():
    if not _RULE_DATA:
        base = DESIGN / "data"
        _RULE_DATA["copy"] = read_json(base / "rules" / "copy.json")
        _RULE_DATA["ortho"] = read_json(base / "rules" / "ortho.json")
        _RULE_DATA["dialects"] = {d: read_json(base / "dialects" / ("%s.json" % d)) for d in DIALECTS}
        _RULE_DATA["platform"] = read_json(base / "platform-instagram.json")
    return _RULE_DATA


def limits():
    return rule_data()["platform"]["plugin"]


def match_text(text):
    return DIACRITICS.sub("", unicodedata.normalize("NFC", text))


_WORD_RUN = re.compile("[%s]+|[A-Za-z][A-Za-z'\u2019-]*" % AR_LETTER)


def entries_match(entries, text, dialect):
    """CONTRACT 7.4 matching for word/phrase/regex entries; returns [(entry, matched text)]."""
    clitics = sorted(rule_data()["ortho"]["clitics"], key=len, reverse=True)
    norm = match_text(text)
    words = _WORD_RUN.findall(norm)
    lowered = [w.lower() for w in words]
    hits = []
    for e in entries:
        scope = e.get("dialects") or ["*"]
        if "*" not in scope and dialect not in scope:
            continue
        if dialect != "en" and scope == ["en"]:
            continue
        kind = e.get("match", "word")
        if kind == "regex":
            flags = re.I if "i" in (e.get("flags") or "") else 0
            m = re.search(e["pattern"], norm, flags)
            if m:
                hits.append((e, m.group(0)))
            continue
        target = [w.lower() for w in _WORD_RUN.findall(match_text(e["text"]))]
        if not target:
            continue
        if kind == "word":
            for w in lowered:
                forms = {w}
                if e.get("clitics"):
                    forms.update(w[len(c):] for c in clitics if w.startswith(c) and len(w) > len(c))
                if target[0] in forms:
                    hits.append((e, w))
                    break
        else:
            for i in range(len(lowered) - len(target) + 1):
                if lowered[i:i + len(target)] == target:
                    hits.append((e, " ".join(target)))
                    break
    return hits


def copy_list(name):
    return rule_data()["copy"]["lists"][name]["entries"]


def bind_labels():
    return {match_text(e["text"]) for e in copy_list("bindLabels") if "dialects" not in e}


# --------------------------------------------------------------------------- built-in text checks
def unbound_pairs(text):
    """(number, noun) pairs separated by an ordinary space (CONTRACT 3.3 rule 3)."""
    s = unicodedata.normalize("NFC", text)
    toks = significant(tokenize(s))
    labels, out = bind_labels(), []
    for a, b in zip(toks, toks[1:]):
        if s[a["end"]:b["start"]] != " ":
            continue
        if a["kind"] == "number" and b["kind"] == "ar":
            out.append((a["text"], b["text"]))
        elif a["kind"] == "ar" and b["kind"] == "number":
            word = match_text(a["text"])
            if word in labels or (word.startswith("\u0627\u0644") and word[2:] in labels):
                out.append((a["text"], b["text"]))
    return out


def stranded_lams(text):
    s = unicodedata.normalize("NFC", text)
    toks = significant(tokenize(s))
    out = []
    for a, b in zip(toks, toks[1:]):
        if (a["kind"] == "ar" and a["text"].endswith("\u0640") and len(a["text"]) <= 4
                and b["kind"] in ("latin", "number") and WS_RE.fullmatch(s[a["end"]:b["start"]] or "x")):
            out.append((a["text"], b["text"]))
    return out


def glued_digits(text):
    s = unicodedata.normalize("NFC", text)
    toks = significant(tokenize(s))
    out = []
    for a, b in zip(toks, toks[1:]):
        if a["end"] != b["start"]:
            continue
        if a["kind"] == "number" and b["kind"] == "ar":
            out.append(a["text"] + b["text"])
        elif a["kind"] == "ar" and b["kind"] == "number" and not a["text"].endswith("\u0640"):
            out.append(a["text"] + b["text"])
    return out


def percent_mismatch(text):
    s = unicodedata.normalize("NFC", text)
    toks = significant(tokenize(s))
    for a, b in zip(toks, toks[1:]):
        if a["end"] != b["start"]:
            continue
        if a["kind"] == "number" and re.fullmatch("[$\u20ac\u00a3]?[0-9]+(?:[.,][0-9]+)*", a["text"]) and b["text"] == "\u066a":
            return True
        if a["kind"] == "number" and re.fullmatch("[\u0660-\u0669]+(?:[\u066b\u066c][\u0660-\u0669]+)*", a["text"]) and b["text"] == "%":
            return True
    return False


def digit_findings(text, setting="western"):
    kind = detect_digits(text)
    found = []
    if kind == "mixed":
        found.append("N1.mixed")
    elif kind == "persian":
        found.append("N1.persian")
    elif kind not in ("none", setting):
        found.append("N1.system")
    if percent_mismatch(text):
        found.append("N1.percent")
    return found


def bidi_findings(text, setting="western"):
    found = digit_findings(text, setting)
    if stranded_lams(text):
        found.append("B1.stranded-lam")
    if unbound_pairs(text):
        found.append("B1.unbound-pair")
    if glued_digits(text):
        found.append("ORTHO-DIG-004")
    return sorted(set(found))


# --------------------------------------------------------------------------- orthography rules
def ortho_hits(text, dialect="eg", kashida_word=None):
    """Rule ids of ortho.json that fire on `text` -> [(rule id, severity, original, fix or None)]."""
    data = rule_data()["ortho"]
    clitics = sorted(data["clitics"], key=len, reverse=True)
    hits = []
    for r in data["rules"]:
        scope = r.get("dialects")
        if scope and dialect not in scope:
            continue
        kind = r["kind"]
        if kind == "word-map":
            table = {match_text(k): v for k, v in r["map"].items()}
            for w in _WORD_RUN.findall(match_text(text)):
                forms = [w]
                if r.get("clitics"):
                    forms += [w[len(c):] for c in clitics if w.startswith(c) and len(w) > len(c)]
                for f in forms:
                    if f in table:
                        hits.append((r["id"], r["sev"], w, table[f]))
                        break
        elif kind == "char":
            for ch in text:
                if ch in r["map"]:
                    hits.append((r["id"], r["sev"], ch, r["map"][ch]))
        elif kind == "regex":
            m = re.search(r["pattern"], unicodedata.normalize("NFC", text))
            if m:
                hits.append((r["id"], r["sev"], m.group(0), r.get("replace") or None))
        elif kind == "check" and _check_fires(r["check"], text, kashida_word):
            hits.append((r["id"], r["sev"], r["check"], None))
    return hits


def _check_fires(name, text, kashida_word):
    s = unicodedata.normalize("NFC", text)
    arabic = "[%s]" % AR_LETTER
    if name == "persian-letters":
        return re.search("[\u06cc\u06a9\u06be]", s) is not None
    if name == "persian-digits":
        return re.search("[\u06f0-\u06f9]", s) is not None
    if name == "mixed-digits":
        return detect_digits(s) == "mixed"
    if name == "space-before-punct":
        return re.search("(?<=[%s])[ \t\u00a0]+(?=[\u060c\u061b\u061f:!.,;?])" % AR_CLASS, s) is not None
    if name == "missing-space-after-punct":
        return re.search("[\u060c\u061b\u061f](?=[%sA-Za-z0-9])" % AR_LETTER, s) is not None
    if name == "latin-punct-in-arabic":
        return re.search("%s[ ]*[,;?][ ]*%s" % (arabic, arabic), s) is not None
    if name == "digit-glued-to-word":
        return bool(glued_digits(s))
    if name == "double-space":
        return re.search("[^\n ] {2,}[^\n ]", s) is not None
    if name == "programmatic-tatweel":
        stripped = s.replace(kashida_word, "") if kashida_word else s
        if re.search("\u0640{3,}", stripped):
            return True
        # the one connector allowed in copy sits before a Latin name or number (a stranded one is B1's finding)
        return re.search("\u0640(?![ 	\u00a0]*[A-Za-z0-9$\u20ac\u00a3])", stripped) is not None
    if name == "ellipsis-dots":
        return re.search(r"\.\.\.|\. \. \.", s) is not None
    if name == "repeated-punct":
        return re.search("\u061f{2,}|!{2,}|\u060c{2,}|\\?{2,}", s) is not None
    if name == "percent-sign":
        return percent_mismatch(s)
    if name == "lam-latin-stranded":
        return bool(stranded_lams(s))
    if name == "number-noun-unbound":
        return bool(unbound_pairs(s))
    if name == "emoji-edge":
        return re.search("^(?:%s)|(?:%s)$" % (_EMOJI, _EMOJI), s.strip()) is not None and has_arabic(s)
    return False


# =============================================================================== spec text walking and mini-lint
TEXT_KEYS = ("kicker", "headline", "sub", "title", "body", "bridge", "attribution")


def spec_fields(spec):
    """Yield (slide id or None, element key, text) for every human-readable string of a spec."""
    hook = spec.get("hook") or {}
    for key in ("text", "cover", "slide2"):
        if isinstance(hook.get(key), str):
            yield None, "hook.%s" % key, hook[key]
    for slide in spec.get("slides") or []:
        sid = slide.get("id")
        for key in TEXT_KEYS:
            if isinstance(slide.get(key), str):
                yield sid, "%s.%s" % (sid, key), slide[key]
        for i, item in enumerate(slide.get("bullets") or []):
            yield sid, "%s.bullets.%d" % (sid, i), item
        for i, side in enumerate(slide.get("sides") or []):
            for key in ("label", "text"):
                if isinstance(side.get(key), str):
                    yield sid, "%s.sides.%d.%s" % (sid, i, key), side[key]
        cta = slide.get("cta")
        if isinstance(cta, dict):
            yield sid, "%s.cta.text" % sid, cta["text"]
        number = slide.get("number")
        if isinstance(number, dict) and number.get("unit"):
            yield sid, "%s.number.unit" % sid, number["unit"]
    pack = spec.get("captionPack") or {}
    for key in ("firstLine", "keywordLine", "body", "cta"):
        if isinstance(pack.get(key), str):
            yield None, "caption.%s" % key, pack[key]
    for key in ("perSlide", "alt"):
        for i, item in enumerate(pack.get(key) or []):
            yield None, "caption.%s.%d" % (key, i), item
    for i, tag in enumerate(pack.get("hashtags") or []):
        yield None, "caption.hashtags.%d" % i, tag


def caption_text(pack):
    """The caption as posted (references/caption-pack.md)."""
    parts = [pack.get("firstLine", "") + "\n" + pack.get("keywordLine", ""), pack.get("body", ""), pack.get("cta", "")]
    tags = " ".join(pack.get("hashtags") or [])
    if tags:
        parts.append(tags)
    return "\n\n".join(p for p in parts if p)


def slide_words(slide, keys=("kicker", "headline", "sub", "title", "body", "bridge")):
    n = sum(word_count(slide[k]) for k in keys if isinstance(slide.get(k), str))
    n += sum(word_count(b) for b in slide.get("bullets") or [])
    n += sum(word_count(s.get("label", "")) + word_count(s["text"]) for s in slide.get("sides") or [])
    if isinstance(slide.get("cta"), dict):
        n += word_count(slide["cta"]["text"])
    return n


_UNIT_WORDS = None


def _unit_words():
    global _UNIT_WORDS
    if _UNIT_WORDS is None:
        qa = read_json(DESIGN / "data" / "qa-rules.json")
        units = set()
        for gate in qa["gates"]:
            for check in gate["checks"]:
                if check["id"] == "SRC1.missing":
                    for words in check["params"]["units"].values():
                        units.update(match_text(w).lower() for w in words)
        _UNIT_WORDS = units
    return _UNIT_WORDS


def mini_lint(spec, brand=None):
    """A small, independent re-implementation of the text gates the clean samples must pass.

    Returns [(severity, rule id, element, message)]. It is a safety net for the fixtures, not a
    replacement for `_cs.qa` (B4), whose verdicts are the reference."""
    lim = limits()
    found = []
    dialect = spec["locale"]["dialect"]
    digits = spec["locale"]["digits"]
    slides = spec.get("slides") or []
    allow = {match_text(w) for w in ((brand or {}).get("voice") or {}).get("allow", [])}

    def add(sev, rule, el, msg):
        found.append((sev, rule, el, msg))

    # --- C1 cover / poster
    for s in slides:
        if s["type"] in ("cover", "poster"):
            hero = word_count(s.get("headline", ""))
            total = sum(word_count(s.get(k, "")) for k in ("kicker", "headline", "sub"))
            if hero > lim["cover"]["heroMaxWords"]:
                add("BLOCK", "C1.hero-words", s["id"], "hero has %d words" % hero)
            if total > lim["cover"]["totalMaxWords"]:
                add("BLOCK", "C1.total-words", s["id"], "cover has %d words" % total)
            if s.get("headline", "").count("\n") + 1 > lim["cover"]["maxLines"]:
                add("FIX", "C1.lines", s["id"], "more than %d lines" % lim["cover"]["maxLines"])
    # --- C2 text limits
    t = lim["text"]
    for s in slides:
        sid, typ = s["id"], s["type"]
        if word_count(s.get("title", "")) > t["titleMaxWords"]:
            add("FIX", "C2.title-words", sid, "title too long")
        body = word_count(s.get("body", ""))
        if body > t["bodyHardMaxWords"]:
            add("BLOCK", "C2.body-hard", sid, "body has %d words" % body)
        elif body > t["bodyMaxWords"]:
            add("FIX", "C2.body-words", sid, "body has %d words" % body)
        cap = t["denseBulletsMax"] if typ in t["denseTypes"] else t["bulletsMax"]
        if len(s.get("bullets") or []) > cap:
            add("FIX", "C2.bullets", sid, "too many bullets")
        if typ in t["denseTypes"] and slide_words(s) > t["denseMaxWords"]:
            add("FIX", "C2.dense-words", sid, "dense slide too long")
        if slide_words(s) > t["slideMaxWords"]:
            add("FIX", "C2.slide-words", sid, "slide has %d words" % slide_words(s))
        if word_count(s.get("bridge", "")) > t["bridgeMaxWords"]:
            add("FIX", "C2.bridge-words", sid, "bridge too long")
        if typ in ("cta", "share") and slide_words(s, ("title", "headline", "sub", "body")) > t["ctaMaxWords"]:
            add("FIX", "C2.cta-words", sid, "cta/share slide over %d words" % t["ctaMaxWords"])
    # --- C3 slide 2
    if spec["format"] == "carousel" and len(slides) >= 2:
        s2 = slides[1]
        n2 = slide_words(s2, ("headline", "sub", "title", "body", "bridge"))
        if n2 > lim["slide2"]["maxWords"]:
            add("BLOCK", "C3.words", s2["id"], "slide 2 has %d words" % n2)
        text2 = " ".join(str(s2.get(k, "")) for k in TEXT_KEYS)
        if entries_match(copy_list("introPhrases"), text2, dialect):
            add("BLOCK", "C3.intro", s2["id"], "slide 2 opens with an intro")
        if s2["type"] not in ("rehook", "item", "stat", "proof", "myth-fact"):
            add("NOTE", "C3.type", s2["id"], "slide 2 is %s" % s2["type"])
    # --- C4 call to action
    ctas = [(i, s["cta"]) for i, s in enumerate(slides) if isinstance(s.get("cta"), dict)]
    if spec["format"] == "carousel":
        if not ctas:
            add("BLOCK", "C4.count", "", "no call to action")
        elif len({c["kind"] for _, c in ctas}) > 1:
            add("BLOCK", "C4.multiple", "", "different calls to action")
        for i, c in ctas:
            if i < len(slides) - 2:
                add("FIX", "C4.position", slides[i]["id"], "cta not on the last two slides")
            if i < len(slides) // 2:
                add("BLOCK", "C4.early", slides[i]["id"], "cta before the payoff")
            if entries_match(copy_list("commentBait"), c["text"], dialect):
                add("BLOCK", "C4.bait", slides[i]["id"], "comment bait")
            allowed = lim["cta"]["allowedByIntent"].get(spec.get("intent"), [])
            if spec.get("intent") and c["kind"] not in allowed:
                add("FIX", "C4.intent", slides[i]["id"], "cta kind does not fit the intent")
            if c["kind"] == "keyword-dm" and (spec.get("captionPack", {}).get("asset", {}).get("delivery") != "instant"):
                add("BLOCK", "C4.keyword-asset", slides[i]["id"], "keyword-dm without an instant asset")
    # --- C5 structure
    if spec["format"] == "carousel":
        n = len(slides)
        if n < lim["slides"]["hardMin"] or n > lim["slides"]["hardMax"]:
            add("BLOCK", "C5.slide-count", "", "%d slides" % n)
        elif n < lim["slides"]["warnBelow"]:
            add("FIX", "C5.slide-count-low", "", "%d slides" % n)
        elif n < lim["slides"]["recommendedMin"] or n > lim["slides"]["recommendedMax"]:
            add("NOTE", "C5.slide-count-range", "", "%d slides" % n)
        if slides and (slides[0]["type"] != "cover" or slides[-1]["type"] not in ("cta", "offer")):
            add("FIX", "C5.skeleton", "", "must open with a cover and end with cta/offer")
        needs_bridge = {"rehook", "item", "step", "stat", "compare", "myth-fact", "proof", "setup", "story-beat", "grid", "timeline"}
        for s in slides[:-1]:
            if s["type"] in needs_bridge and not s.get("bridge"):
                add("FIX", "C5.bridge", s["id"], "no bridge")
        for i, s in enumerate(slides):
            if s["n"] != i + 1:
                add("BLOCK", "SCHEMA.n", s["id"], "n must equal index + 1")
    # --- C6 list count
    if spec.get("architecture") in ("listicle", "steps") and slides:
        m = re.search("[0-9\u0660-\u0669]+", slides[0].get("headline", ""))
        if m:
            wanted = int(unicodedata.normalize("NFKC", m.group(0)))
            have = sum(1 for s in slides if s["type"] in ("item", "step"))
            if wanted != have:
                add("BLOCK", "C6.count", "s01", "cover says %d, %d item slides" % (wanted, have))
    # --- text rules over every field
    lists = [("C8.ai-words", "aiWords"), ("C8.stock-opener", "stockOpeners"), ("C8.translationese", "translationese"),
             ("C8.stiff-msa", "stiffMsa"), ("C8.hype", "hypeWords")]
    dia = rule_data()["dialects"][dialect]
    for sid, el, text in spec_fields(spec):
        if el.startswith("caption.hashtags"):
            continue
        for rule, name in lists:
            for e, hit in entries_match(copy_list(name), text, dialect):
                add("FIX", rule, el, "%s: %s" % (name, hit))
        for e, hit in entries_match(dia["deny"], text, dialect):
            if match_text(hit) not in allow:
                add("BLOCK", "O1.deny-marker", el, "%s" % hit)
        for e, hit in entries_match(dia["warn"], text, dialect):
            add(e.get("sev", "FIX"), "O1.warn-marker", el, "%s" % hit)      # an entry carries its own severity (a NOTE stays a NOTE)
        if dialect != "en":
            for rid, sev, original, fix in ortho_hits(text, dialect, _kashida_for(spec, sid)):
                if (rid, match_text(original)) in KNOWN_RULE_DEFECTS:
                    add("NOTE", "O1.%s.known-defect" % rid, el, original)
                elif sev in ("BLOCK", "FIX") and match_text(original) not in allow:
                    add(sev, "O1." + rid, el, "%s -> %s" % (original, fix))
        for rule in digit_findings(text, digits):
            add("BLOCK", rule, el, "digits")
        if stranded_lams(text):
            add("BLOCK", "B1.stranded-lam", el, "stranded prefix")
        if unbound_pairs(text):
            add("FIX", "B1.unbound-pair", el, "number and noun not bound by U+00A0")
        _check_numbers(spec, sid, el, text, add)
    # --- C9 caption pack
    pack = spec.get("captionPack")
    if pack:
        full = caption_text(pack)
        length = char_count(full)
        lo, hi = lim["caption"]["fastChars"] if spec.get("mode") == "fast" else lim["caption"]["defaultChars"]
        if length > rule_data()["platform"]["platform"]["caption"]["maxChars"]:
            add("BLOCK", "C9.length-hard", "caption", "%d characters" % length)
        elif not lo <= length <= hi:
            add("FIX", "C9.length", "caption", "%d characters, band %d-%d" % (length, lo, hi))
        if char_count(pack.get("firstLine", "")) > lim["caption"]["firstLineMaxChars"]:
            add("FIX", "C9.first-line", "caption.firstLine", "line 1 too long")
        cover = (spec.get("hook") or {}).get("cover") or (slides[0].get("headline", "") if slides else "")
        if similarity(pack.get("firstLine", ""), cover) >= lim["caption"]["firstLineMaxSimilarityToCover"]:
            add("FIX", "C9.first-line-similarity", "caption.firstLine", "repeats the cover")
        if not pack.get("keywordLine"):
            add("FIX", "C9.keyword-line", "caption.keywordLine", "empty")
        tags = pack.get("hashtags") or []
        if len(tags) > lim["hashtags"]["max"]:
            add("BLOCK", "C9.hashtags", "caption", "%d hashtags" % len(tags))
        if len({t.lower() for t in tags}) != len(tags):
            add("FIX", "C9.hashtags-form", "caption", "duplicate hashtags")
        for key, cap_chars, rule in (("perSlide", lim["perSlideCaption"]["maxChars"], "C9.per-slide"),
                                     ("alt", lim["alt"]["targetMaxChars"], "C9.alt")):
            arr = pack.get(key) or []
            if len(arr) != len(slides):
                add("BLOCK", rule + "-missing", "caption." + key, "%d entries for %d slides" % (len(arr), len(slides)))
            for i, text in enumerate(arr):
                if not text.strip():
                    add("BLOCK", rule + "-missing", "caption.%s.%d" % (key, i), "empty")
                elif char_count(text) > cap_chars:
                    add("FIX" if key == "perSlide" else "NOTE", rule + "-length", "caption.%s.%d" % (key, i),
                        "%d characters" % char_count(text))
    return found


def _kashida_for(spec, sid):
    for s in spec.get("slides") or []:
        if s.get("id") == sid:
            return s.get("kashidaWord")
    return None


def _check_numbers(spec, sid, el, text, add):
    """SRC1.missing (simplified): a number followed by a unit word needs sourceIds on its slide."""
    if sid is None or el.endswith(".cta.text") or ".caption" in el:
        return
    slide = next((s for s in spec["slides"] if s["id"] == sid), None)
    if slide is None or slide.get("sourceIds"):
        return
    s = unicodedata.normalize("NFC", text)
    toks = significant(tokenize(s))
    units = _unit_words()
    for a, b in zip(toks, toks[1:]):
        if a["kind"] == "number" and (match_text(b["text"]).lower() in units or "%" in a["text"] or "\u066a" in a["text"]):
            add("BLOCK", "SRC1.missing", el, "%s %s" % (a["text"], b["text"]))


# =============================================================================== check: triggers
def check_triggers(report):
    seen_positive = {}
    skill_files = {}
    for skill in SKILL_NAMES:
        path = SKILLS / skill / "evals" / "evals.json"
        where = rel(path)
        if not path.is_file():
            report.error(where, "missing")
            continue
        try:
            data = read_json(path)
        except ValueError as exc:
            report.error(where, "invalid JSON: %s" % exc)
            continue
        skill_files[skill] = data
        report.count("evals.json")
        if data.get("skill_name") != skill:
            report.error(where, "skill_name must be %r" % skill)
        if data.get("schemaVersion") != 1:
            report.error(where, "schemaVersion must be 1")
        for key in ("description", "triggers", "evals"):
            if key not in data:
                report.error(where, "missing %r" % key)
        triggers = data.get("triggers", [])
        if len(triggers) != TRIGGERS_PER_SKILL:
            report.error(where, "%d triggers, expected %d" % (len(triggers), TRIGGERS_PER_SKILL))
        ids = [t.get("id") for t in triggers]
        if ids != ["t%02d" % (i + 1) for i in range(len(triggers))]:
            report.error(where, "trigger ids must run t01..t%02d in order" % len(triggers))
        positives = [t for t in triggers if t.get("should_trigger") is True]
        negatives = [t for t in triggers if t.get("should_trigger") is False]
        if len(positives) != 20 or len(negatives) != NEGATIVES_PER_SKILL:
            report.error(where, "%d should-trigger and %d should-not, expected 20 and 10" % (len(positives), len(negatives)))
        for d in DIALECTS:
            n = sum(1 for t in positives if t.get("dialect") == d)
            if n != POSITIVES_PER_DIALECT:
                report.error(where, "%d should-trigger prompts in %r, expected %d" % (n, d, POSITIVES_PER_DIALECT))
        queries = [t.get("query", "") for t in triggers]
        if len(set(queries)) != len(queries):
            report.error(where, "duplicate prompt inside the file")
        for t in triggers:
            loc = "%s %s" % (where, t.get("id"))
            q = t.get("query", "")
            if not isinstance(q, str) or not 15 <= len(q) <= 600:
                report.error(loc, "query must be 15-600 characters")
            if t.get("dialect") not in DIALECTS:
                report.error(loc, "dialect must be one of %s" % ", ".join(DIALECTS))
            if t.get("should_trigger") is False:
                if t.get("kind") not in NEGATIVE_KINDS:
                    report.error(loc, "negative needs kind in %s" % ", ".join(NEGATIVE_KINDS))
                if t.get("instead") not in SKILL_NAMES + OUTSIDE_TARGETS:
                    report.error(loc, "negative needs `instead` (a skill, reel-montage, canva or none)")
                if t.get("instead") == skill:
                    report.error(loc, "a should-not prompt cannot point at its own skill")
            else:
                seen_positive.setdefault(q, []).append(skill)
        for target, label in (("reel-montage", "reel"), ("canva", "Canva")):
            if not any(t.get("instead") == target for t in negatives):
                report.error(where, "no %s negative" % label)
        _check_behaviour_items(skill, data, where, report)
    for q, owners in seen_positive.items():
        if len(owners) > 1:
            report.error("triggers", "same should-trigger prompt in %s: %s" % (", ".join(owners), q[:50]))
    for skill, data in skill_files.items():
        for t in data.get("triggers", []):
            target = t.get("instead")
            if t.get("should_trigger") is False and target in SKILL_NAMES:
                owners = seen_positive.get(t.get("query"), [])
                if owners != [target]:
                    report.error("%s %s" % (rel(SKILLS / skill / "evals" / "evals.json"), t.get("id")),
                                 "sibling negative must be a should-trigger prompt of %s" % target)
    return skill_files


def _check_behaviour_items(skill, data, where, report):
    items = data.get("evals", [])
    if len(items) < 3:
        report.error(where, "needs at least 3 behaviour evals (skill-creator format)")
    ids = [e.get("id") for e in items]
    if ids != list(range(1, len(items) + 1)):
        report.error(where, "eval ids must run 1..n")
    cases = {p.parent.name for p in BEHAVIOUR.glob("*/case.yaml")}
    for e in items:
        loc = "%s eval %s" % (where, e.get("id"))
        for key in ("name", "prompt", "expected_output"):
            if not isinstance(e.get(key), str) or not e[key].strip():
                report.error(loc, "missing %r" % key)
        if not isinstance(e.get("files"), list):
            report.error(loc, "`files` must be a list")
        exp = e.get("expectations")
        if not isinstance(exp, list) or len(exp) < 3 or not all(isinstance(x, str) and x for x in exp):
            report.error(loc, "`expectations` needs 3+ strings")
        for ref in e.get("behaviour", []):
            if ref not in cases:
                report.error(loc, "behaviour case %r does not exist" % ref)
        for ref in e.get("fixtures", []):
            if not (FIXTURES / ref).is_file():
                report.error(loc, "fixture %r does not exist" % ref)


# =============================================================================== check: behaviour cases
CASE_NAME = re.compile(r"^name:\s*(\S+)\s*$", re.M)
CASE_TAGS = re.compile(r"^tags:\s*\[(.*?)\]\s*$", re.M)
CASE_PLUGIN = re.compile(r'^plugins:\s*\["([^"]+)"\]\s*$', re.M)
GRADER_TYPES = ("regex", "tool_order", "tool_used", "file_exists", "llm", "baseline")


def case_files():
    return sorted(BEHAVIOUR.glob("*/case.yaml"))


def read_case(path):
    text = path.read_text(encoding="utf-8")
    name = CASE_NAME.search(text)
    tags = CASE_TAGS.search(text)
    plugin = CASE_PLUGIN.search(text)
    return {
        "text": text,
        "name": name.group(1) if name else None,
        "tags": [t.strip().strip('"') for t in tags.group(1).split(",") if t.strip()] if tags else [],
        "plugin": plugin.group(1) if plugin else None,
        "graders": re.findall(r"^  - type:\s*(\w+)\s*$", text, re.M),
        "tools": [t.strip() for t in (re.search(r"^  allowed_tools:\s*\[(.*?)\]\s*$", text, re.M) or [None, ""])[1].split(",")
                  if t.strip()],
    }


def check_behaviour(report):
    covered = set()
    names = set()
    cases = case_files()
    if len(cases) < 30:
        report.error(rel(BEHAVIOUR), "%d cases, expected at least 30" % len(cases))
    for path in cases:
        where = rel(path)
        report.count("behaviour cases")
        case = read_case(path)
        if case["name"] != path.parent.name:
            report.error(where, "name must equal the folder name %r" % path.parent.name)
        if case["name"] in names:
            report.error(where, "duplicate case name")
        names.add(case["name"])
        if 'schema_version: "1.0"' not in case["text"]:
            report.error(where, 'schema_version must be "1.0"')
        if "behaviour" not in case["tags"]:
            report.error(where, "tags must include `behaviour`")
        gated = [t for t in case["tools"] if t in ("Bash", "Write", "Edit", "PowerShell")]
        if "chat-only" in case["tags"] and gated:
            report.error(where, "tagged chat-only but grants %s" % ", ".join(gated))
        if "needs-bash" in case["tags"] and "Bash" not in case["tools"]:
            report.error(where, "tagged needs-bash but does not grant Bash")
        if ("chat-only" in case["tags"]) == ("needs-bash" in case["tags"]):
            report.error(where, "tags must include exactly one of chat-only / needs-bash")
        if "Skill" not in case["tools"]:
            report.error(where, "allowed_tools must include Skill")
        covered.update(case["tags"])
        if not case["plugin"]:
            report.error(where, "plugins entry missing (the case would run without the plugin)")
        elif not (path.parent / case["plugin"] / ".claude-plugin" / "plugin.json").is_file():
            report.error(where, "plugins entry %r does not resolve to the plugin" % case["plugin"])
        if len(case["graders"]) < 3:
            report.error(where, "needs at least 3 graders (found %d)" % len(case["graders"]))
        for g in case["graders"]:
            if g not in GRADER_TYPES:
                report.error(where, "unknown grader type %r" % g)
        if "execution:" not in case["text"] or "prompt:" not in case["text"]:
            report.error(where, "execution.prompt missing")
        if re.search(r"(?m)^\s*(?:pattern|criteria|prompt):\s*(?:\"|'|\|)?\s*TODO", case["text"]):
            report.error(where, "still contains the blank init template")
        if re.search(r"[A-Za-z]:\\|(?<![\w.])~/", case["text"]):
            report.error(where, "no absolute or ~/ paths in cases (they run in a sandbox cwd)")
    missing = [t for t in REQUIRED_BEHAVIOUR_TAGS if t not in covered]
    if missing:
        report.error(rel(BEHAVIOUR), "behaviours not covered by any case: %s" % ", ".join(missing))


# =============================================================================== check: fixtures
def check_fixtures(report):
    manifest_path = FIXTURES / "manifest.json"
    if not manifest_path.is_file():
        report.error(rel(manifest_path), "missing")
        return
    manifest = read_json(manifest_path)
    listed = {f["file"] for f in manifest["fixtures"]}
    on_disk = {p.name for p in FIXTURES.iterdir() if p.is_file() and p.name != "manifest.json"}
    for name in sorted(on_disk - listed):
        report.error(rel(FIXTURES / name), "not listed in manifest.json")
    for name in sorted(listed - on_disk):
        report.error("manifest.json", "lists %s but the file does not exist" % name)
    brands = {}
    for entry in manifest["fixtures"]:
        path = FIXTURES / entry["file"]
        if not path.is_file():
            continue
        report.count("fixtures")
        where = rel(path)
        if path.stat().st_size >= 256 * 1024:
            report.error(where, "larger than 256 KiB")
        raw = path.read_bytes()
        if raw.startswith(b"\xef\xbb\xbf") or b"\r\n" in raw:
            report.error(where, "must be UTF-8 without BOM and use LF line endings")
        kind = entry["kind"]
        if path.suffix == ".json":
            try:
                data = json.loads(raw.decode("utf-8"))
            except ValueError as exc:
                report.error(where, "invalid JSON: %s" % exc)
                continue
        else:
            data = raw.decode("utf-8")
        if kind in ("brand", "spec", "plan"):
            check_schema(kind, data, where, report)
        if kind == "brand":
            brands[entry["file"]] = data
        if kind == "spec":
            check_spec_fixture(entry, data, brands, manifest, report)
        elif kind == "bidi":
            check_bidi_fixture(data, where, report)
        elif kind == "ortho":
            check_ortho_fixture(data, where, report)
        elif kind == "hooks":
            check_hook_fixture(data, where, report)
        elif kind == "source":
            check_source_fixture(entry, data, where, report)
        elif kind == "plan":
            check_plan_fixture(data, where, report)
    for f in manifest["fixtures"]:
        if f["kind"] == "spec" and f.get("brand") and f["brand"] not in listed:
            report.error("manifest.json", "%s names an unknown brand %s" % (f["file"], f["brand"]))


_REPORTED_DEFECTS = set()

# `req` fields per slide type (CONTRACT 5.3), needed from checkpoint `script` on.
REQ_FIELDS = {
    "cover": ("headline",), "rehook": ("headline",), "item": ("title", "body"), "step": ("title",),
    "stat": ("number", "title"), "compare": ("sides",), "myth-fact": ("sides",), "quote": ("body",),
    "story-beat": ("body",), "checklist": ("title", "bullets"), "summary": ("title", "bullets"),
    "setup": ("title", "bullets"), "proof": ("media",), "share": ("headline",), "cta": ("title", "cta"),
    "offer": ("title", "cta"), "testimonial": ("body", "attribution"), "poster": ("headline",),
    "grid": ("title", "items"),
    "timeline": ("title", "items"),
}
CHECKPOINTS = ("angle", "script", "design", "ready", "exported")


def completeness(spec):
    """What `validate.py spec --checkpoint <name>` additionally demands (CONTRACT 8.1), as a list of problems."""
    level = CHECKPOINTS.index(spec["checkpoint"])
    guided = spec["mode"] == "guided"
    problems = []
    if not (spec.get("brief") or {}).get("topic"):
        problems.append("brief.topic missing")
    if not spec.get("angle"):
        problems.append("angle missing")
    if level == 0:
        return problems
    if not (spec.get("hook") or {}).get("cover"):
        problems.append("hook.cover missing")
    for key in ("intent", "awareness", "contentType"):
        if not spec.get(key):
            problems.append("%s missing" % key)
    if spec["format"] == "carousel":
        if not spec.get("architecture"):
            problems.append("architecture missing")
        if len(spec["slides"]) < 2:
            problems.append("a carousel needs at least 2 slides")
    elif len(spec["slides"]) < 1:
        problems.append("a single post needs a slide")
    for s in spec["slides"]:
        for field in REQ_FIELDS.get(s["type"], ()):
            if not s.get(field):
                problems.append("%s (%s) lacks required field %s" % (s["id"], s["type"], field))
    if guided and "angle" not in (spec.get("approvals") or {}):
        problems.append("approvals.angle missing in guided mode")
    if level >= 2:
        pack = spec.get("captionPack") or {}
        for key in ("firstLine", "keywordLine", "body", "cta", "hashtags", "perSlide", "alt"):
            if not pack.get(key):
                problems.append("captionPack.%s missing" % key)
        for key in ("perSlide", "alt"):
            if len(pack.get(key) or []) != len(spec["slides"]):
                problems.append("captionPack.%s must have one entry per slide" % key)
        if not ((spec.get("cover") or {}).get("motion") or {}).get("recipe"):
            problems.append("cover.motion missing")
        if guided and "script" not in (spec.get("approvals") or {}):
            problems.append("approvals.script missing in guided mode")
    if level >= 3:
        if guided and "design" not in (spec.get("approvals") or {}):
            problems.append("approvals.design missing")
        if not spec.get("frozen"):
            problems.append("frozen missing")
        if (spec.get("qa") or {}).get("status") == "block":
            problems.append("qa.status is block")
    return problems


def check_spec_fixture(entry, spec, brands, manifest, report):
    where = rel(FIXTURES / entry["file"])
    brand = None
    if entry.get("brand"):
        brand_path = FIXTURES / entry["brand"]
        brand = brands.get(entry["brand"]) or (read_json(brand_path) if brand_path.is_file() else None)
        if brand and brand["slug"] != spec["brand"]["slug"]:
            report.error(where, "brand.slug %r differs from %s" % (spec["brand"]["slug"], entry["brand"]))
        if brand and spec["brand"].get("snapshotHash") and spec["brand"]["snapshotHash"] != brand_snapshot_hash(brand):
            report.error(where, "brand.snapshotHash does not match %s" % entry["brand"])
    if spec["checkpoint"] != entry.get("checkpoint"):
        report.error(where, "manifest says checkpoint %r, file says %r" % (entry.get("checkpoint"), spec["checkpoint"]))
    if spec["locale"]["dialect"] != entry.get("dialect"):
        report.error(where, "manifest dialect %r differs from the spec" % entry.get("dialect"))
    for i, s in enumerate(spec["slides"]):
        if s["n"] != i + 1 or s["id"] != "s%02d" % (i + 1):
            report.error(where, "slide %d: id/n must be s%02d / %d" % (i + 1, i + 1, i + 1))
    for problem in completeness(spec):
        report.error(where, "checkpoint %s: %s" % (spec["checkpoint"], problem))
    if entry.get("lint") == "clean":
        for sev, rule, el, msg in mini_lint(spec, brand):
            if sev in ("BLOCK", "FIX"):
                report.error(where, "mini-lint %s %s %s: %s" % (sev, rule, el, msg))
            elif rule.endswith(".known-defect"):
                rid = rule[3:-len(".known-defect")]
                key = (rid, match_text(msg))
                if key not in _REPORTED_DEFECTS:
                    _REPORTED_DEFECTS.add(key)
                    report.warn("ortho.json", "%s fires on %r (%s)" % (rid, msg, KNOWN_RULE_DEFECTS[key]))
        if spec["checkpoint"] in ("design", "ready", "exported"):
            n = len(spec["slides"])
            pack = spec.get("captionPack") or {}
            if len(pack.get("perSlide", [])) != n or len(pack.get("alt", [])) != n:
                report.error(where, "captionPack.perSlide and .alt must have one entry per slide")
    blob = json.dumps(spec, ensure_ascii=False).lower()
    for owner in OWNER_STRINGS:
        if owner in blob:
            report.error(where, "contains the owner string %r (nothing exported carries it)" % owner)


def check_bidi_fixture(data, where, report):
    cases = data["cases"]
    if len(cases) < 50:
        report.error(where, "%d bidi strings, expected at least 50" % len(cases))
    ids = [c["id"] for c in cases]
    if len(set(ids)) != len(ids):
        report.error(where, "duplicate ids")
    needed = ("\u0644\u0640ChatGPT", "$1000/\u0634\u0647\u0631\u064a\u0627", "\u0661\u066b\u0667")
    texts = [c["text"] for c in cases]
    for n in needed:
        if n not in texts:
            report.error(where, "missing the reference string %r" % n)
    for c in cases:
        loc = "%s %s" % (where, c["id"])
        exp = c["expect"]
        setting = c.get("digitsSetting", "western")
        toks = [[t["kind"], t["text"]] for t in significant(tokenize(c["text"]))]
        if toks != exp["tokens"]:
            report.error(loc, "tokens differ from the reference tokenizer: %s" % json.dumps(toks, ensure_ascii=False))
        if ltr_runs(c["text"]) != exp["ltrRuns"]:
            report.error(loc, "ltrRuns differ: %s" % json.dumps(ltr_runs(c["text"]), ensure_ascii=False))
        if word_count(c["text"]) != exp["words"]:
            report.error(loc, "words: reference counts %d" % word_count(c["text"]))
        if detect_digits(c["text"]) != exp["digits"]:
            report.error(loc, "digits: reference detects %r" % detect_digits(c["text"]))
        if bidi_findings(c["text"], setting) != sorted(exp["findings"]):
            report.error(loc, "findings: reference finds %s" % bidi_findings(c["text"], setting))


def check_ortho_fixture(data, where, report):
    cases = data["cases"]
    errors = sum(len(c["errors"]) for c in cases)
    if errors != 20:
        report.error(where, "%d seeded errors, expected exactly 20" % errors)
    rules = {r["id"]: r for r in rule_data()["ortho"]["rules"]}
    for c in cases:
        loc = "%s %s" % (where, c["id"])
        text = c["text"]
        fired = {h[0] for h in ortho_hits(text, c["dialect"])}
        for err in c["errors"]:
            rule = rules.get(err["rule"])
            if rule is None:
                report.error(loc, "unknown rule %s" % err["rule"])
                continue
            if err["autofix"] != rule["autofix"]:
                report.error(loc, "autofix flag disagrees with %s" % err["rule"])
            if err["rule"] not in fired:
                report.error(loc, "ortho.json rule %s does not fire on this text" % err["rule"])
            if err["original"] not in text:
                report.error(loc, "original %r is not in the text" % err["original"])
            elif text[err["start"]:err["end"]] != err["original"]:
                report.error(loc, "start/end do not select %r" % err["original"])
        unexpected = sorted(r for r in fired - {e["rule"] for e in c["errors"]}
                            if not any(h[0] == r and (r, match_text(h[2])) in KNOWN_RULE_DEFECTS
                                       for h in ortho_hits(text, c["dialect"])))
        blocking = [r for r in unexpected if rules[r]["sev"] in ("BLOCK", "FIX")]
        if blocking:
            report.error(loc, "other BLOCK/FIX rules also fire: %s" % ", ".join(blocking))
        fixed_all = text
        for err in sorted(c["errors"], key=lambda e: -e["start"]):
            fixed_all = fixed_all[:err["start"]] + err["fix"] + fixed_all[err["end"]:]
        if fixed_all != c["fixedAll"]:
            report.error(loc, "fixedAll does not equal the text with every fix applied")
        fixed_auto = text
        for err in sorted(c["errors"], key=lambda e: -e["start"]):
            if err["autofix"]:
                fixed_auto = fixed_auto[:err["start"]] + err["fix"] + fixed_auto[err["end"]:]
        if fixed_auto != c["fixedAutofix"]:
            report.error(loc, "fixedAutofix does not equal the text with only autofix fixes applied")
    for c in data.get("controls", []):
        loc = "%s %s" % (where, c["id"])
        bad = [h for h in ortho_hits(c["text"], c["dialect"]) if h[1] in ("BLOCK", "FIX")]
        if bad:
            report.error(loc, "clean control fires %s" % ", ".join(h[0] for h in bad))
        if bidi_findings(c["text"]):
            report.error(loc, "clean control has bidi findings %s" % bidi_findings(c["text"]))


def check_hook_fixture(data, where, report):
    cands = data["candidates"]
    if len(cands) < 12:
        report.error(where, "%d candidates, expected at least 12" % len(cands))
    fams = {c["family"] for c in cands}
    if len(fams) < 4:
        report.error(where, "candidates span %d families, expected at least 4" % len(fams))
    ids = [c["id"] for c in cands]
    if len(set(ids)) != len(ids):
        report.error(where, "duplicate candidate ids")
    lim = limits()
    families = read_json(SKILLS / "carousel-create" / "data" / "hooks" / "families.json")
    codes = {f["code"] for f in families["families"]}
    for c in cands:
        loc = "%s %s" % (where, c["id"])
        if c["family"] not in codes:
            report.error(loc, "unknown family %s" % c["family"])
        hg1_ok = (word_count(c["cover"]) <= lim["cover"]["totalMaxWords"]
                  and max((word_count(p) for p in re.split(r"[\u2026\n]", c["cover"])), default=0) <= lim["cover"]["heroMaxWords"]
                  and c["cover"].count("\n") + 1 <= lim["cover"]["maxLines"])
        declared = c["expect"]["gates"].get("HG1")
        if declared in ("pass", "fail") and (declared == "pass") != hg1_ok:
            report.error(loc, "declared HG1 %s but the word limits say %s" % (declared, "pass" if hg1_ok else "fail"))
        dia = c.get("dialect", "eg")
        deny = [h for h in entries_match(rule_data()["dialects"][dia]["deny"], c["cover"], dia)]
        declared4 = c["expect"]["gates"].get("HG4")
        if declared4 in ("pass", "fail") and (declared4 == "pass") != (not deny):
            report.error(loc, "declared HG4 %s but dialect deny markers say %s" % (declared4, "fail" if deny else "pass"))
        bait = entries_match(copy_list("commentBait"), c["cover"], dia) + entries_match(copy_list("hypeWords"), c["cover"], dia)
        declared5 = c["expect"]["gates"].get("HG5")
        if declared5 in ("pass", "fail") and (declared5 == "pass") != (not bait):
            report.error(loc, "declared HG5 %s but bait/hype lists say %s" % (declared5, "fail" if bait else "pass"))
    expect = data["expect"]
    dead = {c["id"] for c in cands if "fail" in c["expect"]["gates"].values()}
    if set(expect["mustDiscard"]) != dead:
        report.error(where, "expect.mustDiscard must list exactly the candidates with a failing gate: %s" % sorted(dead))
    survivors = {c["family"] for c in cands if c["id"] not in dead}
    if len(survivors) < 3:
        report.error(where, "fewer than 3 families survive the gates, so a top-3 from 3 families is impossible")


def check_source_fixture(entry, text, where, report):
    if entry.get("injection") and not re.search(r"(?i)ignore|تجاهل", text):
        report.error(where, "injection fixture carries no injection payload")
    if len(text) > 20000:
        report.error(where, "source fixtures stay short")


def check_plan_fixture(plan, where, report):
    slots = plan["slots"]
    if len(slots) < 8:
        report.error(where, "a month plan needs at least 8 slots")
    arch = [s.get("architecture") for s in slots]
    if any(a is not None and a == b for a, b in zip(arch, arch[1:])):
        report.error(where, "the same architecture appears twice in a row")
    fam = [s.get("family") for s in slots]
    for i in range(len(fam) - 2):
        if fam[i] and fam[i] == fam[i + 1] == fam[i + 2]:
            report.error(where, "the same hook family three times in a row")
    if not any(s["intent"] == "save" and s.get("architecture") in ("listicle", "steps", "framework") for s in slots):
        report.error(where, "no save-intent list in the plan")


# =============================================================================== check: hygiene
def check_hygiene(report):
    for skill in SKILL_NAMES:
        path = SKILLS / skill / "evals" / "evals.json"
        if not path.is_file():
            continue
        text = path.read_text(encoding="utf-8")
        low = text.lower()
        where = rel(path)
        if URL_RE.search(text):
            report.error(where, "contains a URL (plugin files may not, CONTRACT 9.3)")
        for owner in OWNER_STRINGS:
            if owner in low:
                report.error(where, "contains the owner string %r" % owner)
        if CLIENT_HOOK_ID.search(text):
            report.error(where, "mentions a client hook-bank id (H147-H197)")
        if path.stat().st_size >= 256 * 1024:
            report.error(where, "larger than 256 KiB")
        if re.search(r"(?:sk|pk|api|key)[-_][A-Za-z0-9]{20,}", text):
            report.error(where, "looks like a secret")
    for base in (EVALS, FIXTURES):
        for path in sorted(base.rglob("*")):
            if not path.is_file() or path.suffix not in (".json", ".yaml", ".md", ".txt", ".py"):
                continue
            if "results" in path.parts or "generated" in path.parts or path == Path(__file__).resolve():
                continue
            text = path.read_text(encoding="utf-8")
            if CLIENT_HOOK_ID.search(text):
                report.error(rel(path), "mentions a client hook-bank id (H147-H197)")
            if base == FIXTURES:
                low = text.lower()
                for owner in OWNER_STRINGS:
                    if owner in low:
                        report.error(rel(path), "fixture contains the owner string %r" % owner)


# =============================================================================== helpers shared with the generator
def _canonical(value):
    """CONTRACT 3.2 canonical JSON."""
    if isinstance(value, dict):
        return "{" + ",".join(json.dumps(unicodedata.normalize("NFC", k), ensure_ascii=False) + ":" + _canonical(value[k])
                              for k in sorted(value)) + "}"
    if isinstance(value, list):
        return "[" + ",".join(_canonical(v) for v in value) + "]"
    if isinstance(value, str):
        return json.dumps(unicodedata.normalize("NFC", value), ensure_ascii=False)
    if isinstance(value, bool):
        return "true" if value else "false"
    if value is None:
        return "null"
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return repr(value) if isinstance(value, float) else str(value)


def hash16(value):
    h = 0xCBF29CE484222325
    for byte in _canonical(value).encode("utf-8"):
        h = ((h ^ byte) * 0x100000001B3) & 0xFFFFFFFFFFFFFFFF
    return "%016x" % h


def brand_snapshot(brand):
    snap = json.loads(json.dumps(brand))
    for key in ("updatedAt", "createdAt", "ext", "onboarding"):
        snap.pop(key, None)
    snap.get("hooks", {}).pop("history", None)
    snap.get("visual", {}).get("logo", {}).pop("dataUri", None)
    return snap


def brand_snapshot_hash(brand):
    return hash16(brand_snapshot(brand))


# =============================================================================== export-triggers
def yaml_str(value):
    """A YAML double-quoted scalar (JSON strings are valid YAML)."""
    return json.dumps(value, ensure_ascii=False)


def trigger_case(skill, trig, plugin_rel, runs):
    name = "trg-%s-%s" % (skill, trig["id"])
    positive = trig["should_trigger"]
    tags = ["trigger", skill, "positive" if positive else "negative", trig["dialect"]]
    lines = [
        'schema_version: "1.0"',
        "name: %s" % name,
        "description: %s" % yaml_str(
            "%s %s (%s)" % (("Should trigger" if positive else "Should not trigger"), skill, trig["dialect"])),
        "tags: [%s]" % ", ".join(tags),
        'plugins: ["%s"]' % plugin_rel,
        "execution:",
        "  prompt: %s" % yaml_str(trig["query"]),
        "  max_turns: 3",
        "  timeout_seconds: 240",
        "  allowed_tools: [Skill]",
        "runs: %d" % runs,
        "graders:",
    ]
    if positive:
        lines += [
            "  - type: tool_used",
            "    name: invokes-%s" % skill,
            "    tool: Skill",
            "    input_match: %s" % yaml_str(skill),
            "    min: 1",
        ]
    else:
        lines += [
            "  - type: tool_used",
            "    name: does-not-invoke-%s" % skill,
            "    tool: Skill",
            "    input_match: %s" % yaml_str(skill),
            "    min: 0",
            "    max: 0",
            "    arm: both",
        ]
        if trig["instead"] in SKILL_NAMES:
            lines += [
                "  - type: tool_used",
                "    name: invokes-%s-instead" % trig["instead"],
                "    tool: Skill",
                "    input_match: %s" % yaml_str(trig["instead"]),
                "    min: 1",
            ]
    return name, "\n".join(lines) + "\n"


def export_skill_creator(out_dir):
    """One flat `[{query, should_trigger}]` file per skill: the input of skill-creator's run_eval.py."""
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    for skill in SKILL_NAMES:
        data = read_json(SKILLS / skill / "evals" / "evals.json")
        flat = [{"query": t["query"], "should_trigger": t["should_trigger"]} for t in data["triggers"]]
        with open(out_dir / ("%s.trigger-eval.json" % skill), "w", encoding="utf-8", newline="\n") as fh:
            fh.write(json.dumps(flat, ensure_ascii=False, indent=2) + "\n")
    return len(SKILL_NAMES)


def export_triggers(out_dir, only_skill, runs, clean):
    out_dir = Path(out_dir).resolve()
    written = 0
    if clean and out_dir.exists():
        for old in out_dir.glob("trg-*/case.yaml"):
            old.unlink()
            try:
                old.parent.rmdir()
            except OSError:
                pass
    for skill in SKILL_NAMES:
        if only_skill and skill != only_skill:
            continue
        data = read_json(SKILLS / skill / "evals" / "evals.json")
        for trig in data["triggers"]:
            case_dir = out_dir / ("trg-%s-%s" % (skill, trig["id"]))
            try:
                plugin_rel = Path(os.path.relpath(PLUGIN, case_dir)).as_posix()
            except ValueError:  # another drive on Windows: no relative path exists
                raise OSError("export below the repository (a folder on the same drive as the plugin)")
            name, text = trigger_case(skill, trig, plugin_rel, runs)
            case_dir.mkdir(parents=True, exist_ok=True)
            with open(case_dir / "case.yaml", "w", encoding="utf-8", newline="\n") as fh:
                fh.write(text)
            written += 1
    return written


# =============================================================================== summarize-triggers
def summarize_triggers(result_path):
    """Per-skill figures from a `claude plugin eval --json` result of the exported trigger cases."""
    data = read_json(result_path)
    skills = {}
    for case in data.get("cases", []):
        m = re.fullmatch(r"trg-(.+)-t(\d\d)", case.get("name", ""))
        if not m or m.group(1) not in SKILL_NAMES:
            continue
        skill, number = m.group(1), int(m.group(2))
        runs = next(iter(case.get("arms", {}).values()), [])
        row = skills.setdefault(skill, {"tp": 0, "fn": 0, "tn": 0, "fp": 0, "routed": 0, "siblings": 0})
        for run in runs:
            graders = run.get("graders", [])
            if not graders:
                continue
            ok = bool(graders[0]["passed"])
            if number <= 20:
                row["tp" if ok else "fn"] += 1
            else:
                row["tn" if ok else "fp"] += 1
                if len(graders) > 1:
                    row["siblings"] += 1
                    row["routed"] += 1 if graders[1]["passed"] else 0
    table = {}
    for skill in SKILL_NAMES:
        r = skills.get(skill)
        if not r:
            continue
        pos, neg = r["tp"] + r["fn"], r["tn"] + r["fp"]
        fired = r["tp"] + r["fp"]
        table[skill] = {
            "recall": round(r["tp"] / pos, 3) if pos else None,
            "specificity": round(r["tn"] / neg, 3) if neg else None,
            "precision": round(r["tp"] / fired, 3) if fired else None,
            "routing": round(r["routed"] / r["siblings"], 3) if r["siblings"] else None,
            "runs": pos + neg,
        }
        table[skill]["pass"] = all(table[skill][k] is not None and table[skill][k] >= 0.9 for k in ("recall", "precision"))
    return table


# =============================================================================== CLI
AREAS = {
    "trigger": lambda r: check_triggers(r),
    "behaviour": lambda r: check_behaviour(r),
    "fixtures": lambda r: check_fixtures(r),
    "hygiene": lambda r: check_hygiene(r),
}


class Parser(argparse.ArgumentParser):
    def error(self, message):
        sys.stderr.write("cs-error: E_USAGE: %s\n" % message)
        raise SystemExit(64)


def build_parser():
    p = Parser(description="Check and export the Carousel Studio eval suite.")
    sub = p.add_subparsers(dest="cmd")
    c = sub.add_parser("check", help="validate the eval files and fixtures (default)")
    c.add_argument("--only", nargs="+", choices=sorted(AREAS), help="run only these areas")
    c.add_argument("--format", choices=("text", "json"), default="text")
    c.add_argument("--strict", action="store_true", help="exit 1 when only warnings were found")
    e = sub.add_parser("export-triggers", help="write one `claude plugin eval` case per trigger prompt")
    e.add_argument("--out", required=True, help="output folder (use a folder below evals/ so cases find the plugin)")
    e.add_argument("--skill", choices=SKILL_NAMES, help="export one skill only")
    e.add_argument("--runs", type=int, default=1, help="runs per case written into case.yaml (default 1)")
    e.add_argument("--clean", action="store_true", help="delete previously exported trg-* cases first")
    k = sub.add_parser("export-skill-creator", help="write flat [{query, should_trigger}] files for skill-creator's run_eval.py")
    k.add_argument("--out", required=True, help="output folder")
    t = sub.add_parser("summarize-triggers", help="per-skill figures from a `claude plugin eval --json` result")
    t.add_argument("result", help="the JSON file written by `claude plugin eval --json`")
    t.add_argument("--format", choices=("text", "json"), default="text")
    return p


def run_check(args):
    report = Report()
    for area in args.only or list(AREAS):
        AREAS[area](report)
    if args.format == "json":
        print(json.dumps({"ok": not report.errors, "checked": report.checked, "errors": report.errors,
                          "warnings": report.warnings}, ensure_ascii=False, indent=2))
    else:
        for w in report.warnings:
            print("warning  %s: %s" % (w["where"], w["message"]))
        for e in report.errors:
            print("ERROR    %s: %s" % (e["where"], e["message"]))
        summary = ", ".join("%d %s" % (n, k) for k, n in sorted(report.checked.items())) or "nothing"
        print("%s (%s; %d errors, %d warnings)" % ("FAILED" if report.errors else "ok", summary,
                                                  len(report.errors), len(report.warnings)))
    return 2 if report.errors else (1 if report.warnings and args.strict else 0)


def main(argv=None):
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8")
    args = build_parser().parse_args(argv)
    if args.cmd == "export-triggers":
        try:
            n = export_triggers(args.out, args.skill, args.runs, args.clean)
        except OSError as exc:
            sys.stderr.write("cs-error: E_IO: %s\n" % exc)
            return 73
        print("wrote %d cases to %s" % (n, args.out))
        return 0
    if args.cmd == "export-skill-creator":
        try:
            n = export_skill_creator(args.out)
        except OSError as exc:
            sys.stderr.write("cs-error: E_IO: %s\n" % exc)
            return 73
        print("wrote %d trigger-eval files to %s" % (n, args.out))
        return 0
    if args.cmd == "summarize-triggers":
        if not Path(args.result).is_file():
            sys.stderr.write("cs-error: E_IO: %s not found\n" % args.result)
            return 66
        table = summarize_triggers(args.result)
        if args.format == "json":
            print(json.dumps(table, ensure_ascii=False, indent=2))
        else:
            print("%-18s %7s %12s %10s %8s  %s" % ("skill", "recall", "specificity", "precision", "routing", "target 0.90"))
            for skill, r in table.items():
                fmt = lambda v: "-" if v is None else "%.2f" % v
                print("%-18s %7s %12s %10s %8s  %s" % (skill, fmt(r["recall"]), fmt(r["specificity"]), fmt(r["precision"]),
                                                        fmt(r["routing"]), "ok" if r["pass"] else "BELOW"))
        return 0 if table and all(r["pass"] for r in table.values()) else 1
    if args.cmd is None:
        args = build_parser().parse_args(["check"])
    return run_check(args)


if __name__ == "__main__":
    raise SystemExit(main())
