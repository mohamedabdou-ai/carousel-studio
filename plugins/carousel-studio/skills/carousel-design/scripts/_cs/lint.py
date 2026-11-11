"""Orthography, digits and bidi linting of one text (CONTRACT 7.4 and 9.4). Twin of ``lintText`` in ``src/qa/lint.js``.

``lint_text`` runs the rules of ``ortho.json``, the built-in checks they name, and the dialect's deny/warn markers, and returns
issues sorted by position. ``apply_fixes`` applies the ``autofix`` ones (right to left, no overlaps). Offsets are code points of the
text that was passed in. Matching runs on a "folded" copy (tashkeel and tatweel removed); offsets map back to the original.
"""
from __future__ import annotations

import re
import unicodedata

from . import rules, text as cstext

LTR_SKIP_KINDS = ("url", "email", "handle", "tag", "phone")
LINT_BIND_LABELS = ("الخطوة", "رقم", "نصيحة", "الجزء")
SEV_RANK = {"BLOCK": 0, "FIX": 1, "NOTE": 2}

_AR_L = "\\u0621-\\u064A\\u066E-\\u06D3\\u06D5\\u06FA-\\u06FF\\u0750-\\u077F\\u08A0-\\u08FF\\uFB50-\\uFDFF\\uFE70-\\uFEFF"
_AR_MARKS = "\\u064B-\\u065F\\u0670"
_IS_AR_LETTER = re.compile("[" + _AR_L + "]")
_DIGITS_ALL = re.compile("[0-9\\u0660-\\u0669\\u06F0-\\u06F9]")
_AI = "٠١٢٣٤٥٦٧٨٩"
_PROCLITIC_LETTERS = "وفبلك"
_PERSIAN_LETTERS = {"ی": "ي", "ک": "ك", "ھ": "ه"}
_LATIN_PUNCT = {",": "،", ";": "؛", "?": "؟"}


def fold_key(s) -> str:
    return rules.fold_key(s)


# ---- digits -------------------------------------------------------------------------------------------------------------
def mask_ltr(text: str) -> str:
    """Text with URLs, e-mails, @handles, #tags, phone numbers and every token that carries a Latin letter (GPT4, 4K) blanked out."""
    chars = list(text)
    for t in cstext.tokenize(text):
        hide = (t["kind"] in LTR_SKIP_KINDS
                or (t["kind"] == "number" and re.search("[A-Za-z]", t["text"]) is not None)
                or (t["kind"] == "latin" and re.search("[0-9]", t["text"]) is not None))
        if hide:
            for i in range(t["start"], t["end"]):
                chars[i] = " "
    return "".join(chars)


def digit_systems(text: str) -> dict:
    masked = mask_ltr(text)
    return {
        "masked": masked,
        "western": re.search("[0-9]", masked) is not None,
        "arabicIndic": re.search("[\\u0660-\\u0669]", masked) is not None,
        "persian": re.search("[\\u06F0-\\u06F9]", masked) is not None,
    }


def _map_digit(ch: str, to: str) -> str:
    c = ord(ch)
    if 0x30 <= c <= 0x39:
        n = c - 0x30
    elif 0x0660 <= c <= 0x0669:
        n = c - 0x0660
    elif 0x06F0 <= c <= 0x06F9:
        n = c - 0x06F0
    else:
        return ch
    return _AI[n] if to == "arabic-indic" else str(n)


def map_digits(s: str, to: str) -> str:
    return _DIGITS_ALL.sub(lambda m: _map_digit(m.group(0), to), s)


# ---- built-in checks ----------------------------------------------------------------------------------------------------
def _scan(text: str, rx, make) -> list:
    out = []
    for m in rx.finditer(text):
        if m.group(0) == "":
            continue
        r = make(m)
        if r is not None:
            item = {"start": m.start(), "end": m.end(), "original": m.group(0)}
            item.update(r)
            out.append(item)
    return out


def _persian_digits(text, ctx):
    return _scan(mask_ltr(text), re.compile("[\\u06F0-\\u06F9]+"), lambda m: {"fix": map_digits(m.group(0), ctx.get("digits") or "western")})


def _mixed_digits(text, ctx):
    info = digit_systems(text)
    used = int(info["western"]) + int(info["arabicIndic"]) + int(info["persian"])
    if used < 2:
        return []
    expected = ctx.get("digits") or ("western" if info["western"] else "arabic-indic")

    def make(m):
        first = m.group(0)[0]
        is_w = "0" <= first <= "9"
        is_a = "٠" <= first <= "٩"
        if (expected == "western" and is_w) or (expected == "arabic-indic" and is_a):
            return None
        return {"fix": map_digits(m.group(0), expected)}

    return _scan(info["masked"], re.compile("[0-9]+|[\\u0660-\\u0669]+|[\\u06F0-\\u06F9]+"), make)


def _percent_sign(text, ctx):
    """A percent sign is wrong when it does not belong to the digits beside it (% next to Arabic-Indic digits, ٪ next to Western
    ones) or when it is not the sign of the post's digit system; the second reading wins when both apply (twin of lint.js)."""
    expected = ctx.get("digits") or "western"
    ai = "[\u0660-\u0669\u06F0-\u06F9]"
    masked = mask_ltr(text)
    found = {}

    def collect(digits, bad, good):
        rx = re.compile(digits + "[ \u00A0\u2009\u202F]?" + re.escape(bad) + "|" + re.escape(bad) + "[ \u00A0\u2009\u202F]?" + digits)
        for m in rx.finditer(masked):
            start = m.start() + m.group(0).index(bad)
            found[start] = {"start": start, "end": start + 1, "original": bad, "fix": good}

    collect(ai, "%", "٪")
    collect("[0-9]", "٪", "%")
    collect("[0-9\u0660-\u0669\u06F0-\u06F9]", "%" if expected == "arabic-indic" else "٪", "٪" if expected == "arabic-indic" else "%")
    return [found[k] for k in sorted(found)]


def _persian_letters(text, ctx):
    return _scan(text, re.compile("[\\u06CC\\u06A9\\u06BE]"), lambda m: {"fix": _PERSIAN_LETTERS[m.group(0)]})


def _space_before_punct(text, ctx):
    rx = re.compile("([" + _AR_L + _AR_MARKS + "\\u0640])([ \\t\\u00A0]+)([\\u060C\\u061B\\u061F:!.,;?])")
    return [{"start": m.start() + len(m.group(1)), "end": m.start() + len(m.group(1)) + len(m.group(2)), "original": m.group(2), "fix": ""}
            for m in rx.finditer(text)]


def _missing_space_after_punct(text, ctx):
    rx = re.compile("[\\u060C\\u061B\\u061F](?=[" + _AR_L + "A-Za-z0-9\\u0660-\\u0669])")
    return _scan(text, rx, lambda m: {"fix": m.group(0) + " "})


def _latin_punct_in_arabic(text, ctx):
    rx = re.compile("([" + _AR_L + _AR_MARKS + "])([,;?])(?=[ \\t\\n\\u00A0]|\\Z|[" + _AR_L + "])")
    return [{"start": m.start() + len(m.group(1)), "end": m.end(), "original": m.group(2), "fix": _LATIN_PUNCT[m.group(2)]}
            for m in rx.finditer(text)]


def _digit_glued_to_word(text, ctx):
    m = mask_ltr(text)

    def is_l(c):
        return c != "ـ" and _IS_AR_LETTER.match(c) is not None

    out = []
    for i in range(1, len(m)):
        a, b = m[i - 1], m[i]
        if is_l(a) and "0" <= b <= "9":
            before = m[i - 2] if i >= 2 else ""
            if a in "بلك" and before in ("و", "ف") and not (i >= 3 and is_l(m[i - 3])):
                # a conjunction and a preposition standing together in front of a number («وب3»): the connector keeps both letters attached
                out.append({"start": i - 1, "end": i + 1, "original": a + b, "fix": a + "ـ" + b})
                continue
            if a in _PROCLITIC_LETTERS and not (before and is_l(before)):
                # a one-letter proclitic standing on its own in front of a number: «و12 تفاعل» is ordinary Arabic and stays;
                # ب ل ك take the connector («بـ5 دقايق»), never a space that would strand the letter
                if a not in "وف":
                    out.append({"start": i - 1, "end": i + 1, "original": a + b, "fix": a + "ـ" + b})
                continue
            out.append({"start": i - 1, "end": i + 1, "original": a + b, "fix": a + " " + b})
        elif "0" <= a <= "9" and is_l(b):
            out.append({"start": i - 1, "end": i + 1, "original": a + b, "fix": a + " " + b})
    return out


def _double_space(text, ctx):
    return _scan(text, re.compile("[ \\t]{2,}"), lambda m: {"fix": " "})


def _invalid_codepoint(text, ctx):
    return [{"start": i, "end": i + 1, "original": ch,
             **({"fix": ""} if unicodedata.category(ch) == "Cc" else {})}
            for i, ch in enumerate(text)
            if unicodedata.category(ch) == "Cc" and ch not in "\t\n\r"]


def _unassigned_codepoint(text, ctx):
    return [{"start": i, "end": i + 1, "original": ch} for i, ch in enumerate(text)
            if unicodedata.category(ch) in ("Cn", "Cs")]


def spec_strings(spec):
    """All string leaves, addressed by JSON pointer; prior QA is not author copy."""
    def walk(value, path="", slide=None):
        if isinstance(value, str):
            yield {"text": value, "key": path, "slide": slide}
        elif isinstance(value, (dict, list)):
            for key, child in (value.items() if isinstance(value, dict) else enumerate(value)):
                if not path and key in ("qa", "frozen"):
                    continue
                sid = child.get("id") if path == "/slides" and isinstance(child, dict) else slide
                yield from walk(child, path + "/" + str(key).replace("~", "~0").replace("/", "~1"), sid)
    return list(walk(spec))


def _programmatic_tatweel(text, ctx):
    kw = fold_key(ctx["kashidaWord"]) if ctx.get("kashidaWord") else ""

    def in_word(c):
        return _IS_AR_LETTER.match(c) is not None or c == "ـ" or rules.is_mark(c)

    def make(m):
        head, tail = text[:m.end()], text[m.end():]
        head = re.sub("[" + _AR_MARKS + "]", "", head)
        if len(m.group()) == 1 and re.search("(^|[^" + _AR_L + _AR_MARKS + "ـ])[وف]?(?:بال|كال|ال|لل|[بلك])ـ$", head) and re.match("[\"'«“]*[A-Za-zÀ-ɏ0-9٠-٩@#%٪$€£]", tail):
            return None
        prev = text[m.start() - 1] if m.start() > 0 else ""
        nxt = text[m.end()] if m.end() < len(text) else ""
        a, b = m.start(), m.end()
        while a > 0 and in_word(text[a - 1]):
            a -= 1
        while b < len(text) and in_word(text[b]):
            b += 1
        if kw and fold_key(text[a:b]) == kw:
            return None
        return {"fix": ""}

    return _scan(text, re.compile("ـ+"), make)


def _ellipsis_dots(text, ctx):
    return _scan(mask_ltr(text), re.compile("\\.{3,}|\\.(?: \\.){2,}"), lambda m: {"fix": "…"})


def _repeated_punct(text, ctx):
    return _scan(text, re.compile("([\\u061F!\\u060C\\u061B])\\1+"), lambda m: {"fix": m.group(1)})


def _lam_latin_stranded(text, ctx):
    rx = re.compile("(^|[^" + _AR_L + "])([وفبلكال" + _AR_MARKS + "]+)\\u0640([ \\t\\u00A0\\u2009\\u202F]+)(?=[\"'«“]*[A-Za-zÀ-ɏ0-9\\u0660-\\u0669@#%٪$\\u20AC\\u00A3])")
    out = []
    for m in rx.finditer(text):
        if not re.fullmatch("[وف]?(?:بال|كال|ال|لل|[بلك])", fold_key(m.group(2))):
            continue
        keep = len(m.group(1)) + len(m.group(2)) + 1
        out.append({"start": m.start() + keep, "end": m.end(), "original": m.group(3), "fix": ""})
    return out


class LabelMatcher:
    """The bindLabels words (الخطوة، رقم، نصيحة ...): a token matches a label with or without one proclitic in front."""

    def __init__(self, texts, clitics=None):
        self._set = {fold_key(t) for t in texts}
        self._clitics = tuple(clitics) if clitics else rules.DEFAULT_CLITICS

    def has(self, token: str) -> bool:
        t = fold_key(token)
        if t in self._set:
            return True
        return any(t.startswith(c) and t[len(c):] in self._set for c in self._clitics)


def bind_label_matcher(clitics=None) -> LabelMatcher:
    texts = [e.get("text") for e in rules.list_entries("bindLabels") if isinstance(e.get("text"), str) and e.get("text").strip()]
    return LabelMatcher(texts or LINT_BIND_LABELS, clitics)


def _number_noun_unbound(text, ctx):
    # Binding belongs to layout, not stored copy.
    return []


def _emoji_edge(text, ctx):
    out, base = [], 0
    for line in text.split("\n"):
        if cstext.has_arabic(line):
            toks = [t for t in cstext.tokenize(line) if t["kind"] != "space"]
            ends = [toks[0], toks[-1]] if toks else []
            for k, t in enumerate(ends):
                if t["kind"] == "emoji" and not (k == 1 and len(toks) == 1):
                    out.append({"start": base + t["start"], "end": base + t["end"], "original": t["text"], "fix": None})
        base += len(line) + 1
    return out


BUILTIN = {
    "persian-digits": _persian_digits,
    "mixed-digits": _mixed_digits,
    "percent-sign": _percent_sign,
    "invalid-codepoint": _invalid_codepoint,
    "unassigned-codepoint": _unassigned_codepoint,
    "persian-letters": _persian_letters,
    "space-before-punct": _space_before_punct,
    "missing-space-after-punct": _missing_space_after_punct,
    "latin-punct-in-arabic": _latin_punct_in_arabic,
    "digit-glued-to-word": _digit_glued_to_word,
    "double-space": _double_space,
    "programmatic-tatweel": _programmatic_tatweel,
    "ellipsis-dots": _ellipsis_dots,
    "repeated-punct": _repeated_punct,
    "lam-latin-stranded": _lam_latin_stranded,
    "number-noun-unbound": _number_noun_unbound,
    "emoji-edge": _emoji_edge,
}


def builtin(name: str, text: str, *, digits: str = "western", kashida_word: str | None = None, bind_labels=None, clitics=None) -> list[dict]:
    """Run one built-in check; items are ``{start, end, original, fix}`` (``fix`` is ``None`` when there is no repair)."""
    ctx = {"digits": digits, "kashidaWord": kashida_word or "", "bindLabels": bind_labels, "clitics": clitics}
    return BUILTIN[name](text, ctx)


# ---- lint_text ----------------------------------------------------------------------------------------------------------
def allow_set(words) -> set:
    return {fold_key(w).lower() for w in (words or ()) if isinstance(w, str) and w.strip()}


def _fix_or_none(item):
    return item.get("fix")


def lint_text(text: str, *, dialect: str | None = None, digits: str = "western", allow=(), kashida_word: str | None = None,
              skip=(), bundle: dict | None = None) -> list[dict]:
    """Issues ``[{rule, sev, confidence, start, end, original, fix, autofix, msg, kind}]`` sorted by start.

    Runs the ``ortho.json`` rules (``word-map``, ``char``, ``regex`` and ``check`` kinds), then the dialect's ``deny`` / ``warn`` entries
    (``kind: "dialect"``, rules ``deny-marker`` / ``warn-marker``). ``allow`` words are never reported; ``skip`` leaves out rule ids or
    built-in check names (gates that own a check run it themselves).
    """
    if not isinstance(text, str) or not text.strip():
        return []
    b = bundle or rules.load_bundle()
    ortho = b.get("ortho")
    dd = (b.get("dialects") or {}).get(dialect) if dialect else None
    allowed = allow if isinstance(allow, set) else allow_set(allow)
    skipped = set(skip or ())
    clitics = tuple(ortho.get("clitics")) if ortho and ortho.get("clitics") else rules.DEFAULT_CLITICS
    copy_doc = b.get("copy") or {}
    label_entries = (((copy_doc.get("lists") or {}).get("bindLabels") or {}).get("entries")) or []
    label_texts = [e["text"] for e in label_entries if isinstance(e.get("text"), str) and e["text"].strip()]
    ctx = {"digits": digits or "western", "kashidaWord": kashida_word or "", "dialect": dialect, "clitics": clitics,
           "bindLabels": LabelMatcher(label_texts or LINT_BIND_LABELS, clitics)}
    issues: list[dict] = []
    prepared = rules.prepare(text)

    def push(rule: dict, item: dict) -> None:
        fix = item.get("fix")
        issues.append({
            "rule": rule["id"], "sev": rule.get("sev") or "FIX",
            "confidence": rule["confidence"] if isinstance(rule.get("confidence"), (int, float)) else 1,
            "start": item["start"], "end": item["end"], "original": item["original"], "fix": fix,
            "autofix": rule.get("autofix") is True and fix is not None,
            "msg": rule.get("msg"), "kind": rule.get("kind"),
        })

    for rule in (ortho or {}).get("rules", []):
        if not isinstance(rule, dict) or rule.get("id") in skipped:
            continue
        rd = rule.get("dialects")
        if isinstance(rd, list) and "*" not in rd and dialect and dialect not in rd:
            continue
        kind = rule.get("kind")
        if kind == "word-map" and isinstance(rule.get("map"), dict):
            for key, replacement in rule["map"].items():
                entry = {"id": rule["id"], "text": key, "match": "word", "clitics": rule.get("clitics") is True}
                for m in rules.entries_match([entry], text, dialect=dialect, clitics=clitics, prepared=prepared):
                    if cstext.normalize(m["text"]) in [cstext.normalize(v) for v in rule.get("exceptions", [])]:
                        continue
                    tok, k = fold_key(m["text"]), fold_key(key)
                    prefix = tok[:len(tok) - len(k)] if len(tok) >= len(k) and tok.endswith(k) else ""
                    push(rule, {"start": m["start"], "end": m["end"], "original": m["text"], "fix": prefix + replacement})
        elif kind == "char" and isinstance(rule.get("map"), dict):
            cmap = rule["map"]
            for i, ch in enumerate(text):
                if ch in cmap:
                    push(rule, {"start": i, "end": i + 1, "original": ch, "fix": cmap[ch]})
        elif kind == "regex" and isinstance(rule.get("pattern"), str) and rule["pattern"].strip():
            try:
                rx = cstext.portable_regex(rule["pattern"])
            except re.error:
                continue
            has_replace = "replace" in rule
            repl = str(rule.get("replace", ""))
            for m in rx.finditer(text):
                if m.group(0) == "":
                    continue
                fix = _expand(repl, m) if has_replace else None
                push(rule, {"start": m.start(), "end": m.end(), "original": m.group(0), "fix": fix})
        elif kind == "check" and rule.get("check") in BUILTIN and rule["check"] not in skipped:
            for item in BUILTIN[rule["check"]](text, ctx):
                push(rule, item)

    if dd:
        for key, rule_id, default_sev in (("deny", "deny-marker", "BLOCK"), ("warn", "warn-marker", "FIX")):
            for m in rules.entries_match(dd.get(key) or [], text, dialect=dialect, clitics=clitics, prepared=prepared):
                entry = m["entry"]
                issues.append({
                    "rule": rule_id, "sev": entry["sev"] if entry.get("sev") in SEV_RANK else default_sev, "confidence": 1,
                    "start": m["start"], "end": m["end"], "original": m["text"], "fix": entry.get("suggest"), "autofix": False,
                    "msg": entry.get("note"), "kind": "dialect", "entry": entry.get("id"),
                })

    identifiers = [t for t in cstext.tokenize(text) if t["kind"] in LTR_SKIP_KINDS] if issues else []
    kept = [it for it in issues if re.fullmatch("ORTHO-ENC-00[4-8]", it["rule"]) or
            (fold_key(it["original"]).lower().strip() not in allowed and
             not any(it["start"] < t["end"] and it["end"] > t["start"] for t in identifiers))]
    kept.sort(key=lambda it: (it["start"], it["end"]))
    return kept


def _expand(replacement: str, match) -> str:
    """Literal replacement text in which only ``\\1``..``\\9`` stand for capture groups of the match (as in ``ortho.json``)."""
    return re.sub("\\\\([1-9])", lambda g: match.group(int(g.group(1))) or "", replacement)


def apply_fixes(text: str, issues: list[dict]) -> str:
    """Apply the ``autofix`` issues to ``text``, right to left, skipping overlaps."""
    todo = sorted((it for it in issues if it.get("autofix") and it.get("fix") is not None), key=lambda it: (-it["start"], -it["end"]))
    out, limit = text, float("inf")
    for it in todo:
        if it["end"] > limit:
            continue
        out = out[:it["start"]] + it["fix"] + out[it["end"]:]
        limit = it["start"]
    return out


def check_text(text: str, *, autofix: bool = True, checker=None, **options) -> dict:
    """The repair/check loop. Re-lint actual output; never hide unapplied fixes.

    ``applied`` records whole field changes, including the rules that caused
    them. Callers attach the field path and save ``fixed`` explicitly.
    """
    check = checker or (lambda value: lint_text(value, **options))
    current, applied = text, []
    for _ in range(4):
        issues = check(current)
        repairs = [i for i in issues if i.get("autofix") and i.get("fix") is not None]
        encoding = [i for i in repairs if i["rule"].startswith("ORTHO-ENC-")]
        binding = [i for i in repairs if i["rule"] == "ORTHO-BIDI-001"]
        # Repair encoding, then attachment, before judging the tatweel in context.
        repairs = encoding or binding or repairs
        if not encoding and any(i["rule"] in ("ORTHO-ENC-003", "ORTHO-ENC-008") for i in issues):
            repairs = []
        fixed = apply_fixes(current, repairs) if autofix else current
        if fixed == current:
            break
        applied.append({"before": current, "after": fixed,
                        "rules": sorted({i["rule"] for i in repairs})})
        current = fixed
    return {"fixed": current, "issues": check(current), "applied": applied}


def iter_spec_fields(spec):
    """One walk for both proofread CLIs, including captions and new fields."""
    for f in spec_strings(spec):
        parts = [s.replace("~1", "/").replace("~0", "~") for s in f["key"][1:].split("/")]
        slide, el, kashida = None, ".".join(parts), None
        if len(parts) > 2 and parts[0] == "slides":
            s = spec["slides"][int(parts[1])]
            slide, el = s.get("id"), ".".join(parts[2:])
            if el == "headline":
                kashida = s.get("kashidaWord")
        if len(parts) > 2 and parts[0] == "captionPack" and parts[1] in ("perSlide", "alt") and parts[2].isdigit():
            i = int(parts[2])
            if i < len(spec.get("slides", [])):
                slide = spec["slides"][i].get("id")
        if any("." in part for part in parts):
            el = f["key"]  # Token overrides have literal dots in their keys.
        yield slide, el, f["text"], kashida


def set_spec_field(spec, slide_id, el, value):
    """Write a checked field, retaining literal dots and JSON-pointer escapes."""
    if el.startswith("/"):
        parts = [p.replace("~1", "/").replace("~0", "~") for p in el[1:].split("/")]
        node = spec
    else:
        parts = el.split(".")
        node = spec if slide_id is None or parts[0] in ("captionPack", "hook") else next(s for s in spec["slides"] if s.get("id") == slide_id)
    for part in parts[:-1]:
        node = node[int(part)] if isinstance(node, list) else node[part]
    node[int(parts[-1]) if isinstance(node, list) else parts[-1]] = value


def copy_field(slide_id, el):
    """Language repairs apply to copy, never to URLs, CSS, identifiers or tokens."""
    if re.fullmatch(r"captionPack\.(firstLine|keywordLine|body|cta|(perSlide|alt|hashtags)\.[0-9]+)", el):
        return True
    if el in ("hook.cover", "hook.text", "hook.slide2"):
        return True
    return bool(slide_id and re.fullmatch(
        r"kicker|headline|sub|title|body|bridge|attribution|quote|bullets\.[0-9]+|sides\.[0-9]+\.(label|text)|cta\.text|number\.(value|unit)|items\.[0-9]+\.(title|text|value)|demo\.(caption|lines\.[0-9]+\.text)|visual\.anchor\.(word|unit|captions\.[0-9]+|chart\.values\.[0-9]+\.label|mock\.(title|caption|stamp|lines\.[0-9]+\.text|items\.[0-9]+))", el))


def encoding_issues(value):
    bundle = rules.load_bundle()
    ortho = {"rules": [r for r in bundle["ortho"]["rules"] if re.fullmatch("ORTHO-ENC-00[4-8]", r["id"])]}
    return lint_text(value, bundle={**bundle, "ortho": ortho, "dialects": {}})


def json_text(value, indent=None):
    """Keep Arabic readable and represent invalid surrogates safely for review."""
    import json
    return json.dumps(value, ensure_ascii=False, indent=indent).encode("utf-8", "backslashreplace").decode("utf-8")
