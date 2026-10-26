"""The text model of Carousel Studio (CONTRACT 3.3). Twin of ``src/lib/text.js``: same tokens, same counts, same HTML.

One definition of a word, a token, a digit system and a bidi isolation, shared by the engine, the QA gates and the scripts.
Offsets are Unicode code points. Where the contract leaves room, the tokenizer is a little smarter than its literal patterns, and
the JavaScript twin does exactly the same: a domain-form URL must end on a label boundary (so ``john.doe@x.com`` stays an e-mail),
a handle does not swallow the sentence's final dot, and a hashtag does not swallow trailing punctuation.

The text a slide shows besides the old fields (items, demo, art captions, chart labels, mock lines) is listed by ``visual_fields`` in the
order and with the keys of ``visualFields`` in text.js; ``slide_text`` and ``word_counts`` read it, and so do the keyed QA fields.
A slide of the free design lane (``slide.free.html``) adds the literal text nodes of its HTML as ``free.0``, ``free.1``... at the end of
that list (``free_text``): an element with ``data-field`` is skipped, because its text is the slide field it names and is read once.
"""
from __future__ import annotations

import re
import unicodedata
from html.parser import HTMLParser

# ---- character classes (explicit; never \s \d \w) -----------------------------------------------------------------------
_WS = " \\t\\n\\r\\f\\v\\u00A0\\u202F"
_AR = ("\\u0621-\\u064A\\u064B-\\u0652\\u0640\\u066E-\\u06D3\\u06D5\\u06FA-\\u06FF\\u0750-\\u077F\\u08A0-\\u08FF"
       "\\uFB50-\\uFDFF\\uFE70-\\uFEFF")
NBSP = "\u00A0"
TATWEEL = "\u0640"
WS_CHARS = " \t\n\r\f\v\u00A0\u202F"
_AI_DIGITS = "\u0660\u0661\u0662\u0663\u0664\u0665\u0666\u0667\u0668\u0669"

_RE_WS_RUN = re.compile("[" + _WS + "]+")
_RE_ARABIC = re.compile("[\\u0600-\\u06FF\\u0750-\\u077F\\u08A0-\\u08FF\\uFB50-\\uFDFF\\uFE70-\\uFEFF]")
_RE_TASHKEEL = re.compile("[\\u064B-\\u065F\\u0670]")

_RE_URL_HTTP = re.compile("https?://[^" + _WS + "<>\"]+")
_RE_URL_WWW = re.compile("www\\.[^" + _WS + "<>\"]+")
_RE_URL_DOMAIN = re.compile("[A-Za-z0-9-]+(?:\\.[A-Za-z0-9-]+)*\\.[a-z]{2,24}(?:/[^" + _WS + "<>\"]*)?")
_RE_EMAIL = re.compile("[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}")
_RE_HANDLE = re.compile("@[A-Za-z0-9._]{1,30}")
_RE_TAG = re.compile("#[^" + _WS + "#<>]+")
_RE_PHONE = re.compile("\\+?[0-9][0-9\\u00A0 ()-]{7,}[0-9]")
_RE_NUMBER_W = re.compile("[$\\u20AC\\u00A3]?[0-9]+(?:[.,][0-9]+)*(?:%|[A-Za-z]{1,6})?")
_RE_NUMBER_AI = re.compile("[\\u0660-\\u0669]+(?:[\\u066B\\u066C][\\u0660-\\u0669]+)*\\u066A?")
_RE_NUMBER_FA = re.compile("[\\u06F0-\\u06F9]+")
_RE_LATIN = re.compile("[A-Za-z\\u00C0-\\u024F][A-Za-z0-9\\u00C0-\\u024F'\\u2019._\\-+/&]*")
_RE_EMOJI = re.compile("[\\u2600-\\u27BF\\u2B50\\u2B55\\U0001F000-\\U0001FAFF][\\uFE0F\\u200D\\u2600-\\u27BF\\U0001F000-\\U0001FAFF]*")
_RE_AR = re.compile("[" + _AR + "]+")
_RE_SPACE = re.compile("[" + _WS + "]+")
_RE_DOMAIN_NEXT = re.compile("[A-Za-z0-9_%+@-]")
_RE_TAG_TRAIL = re.compile("[.,;:!?\\u060C\\u061B\\u061F)\\]}\\u00BB\\u201D\\u2026]+\\Z")
_RE_TAG_ARABIC = re.compile("[\\u0621-\\u064A\\u066E-\\u06D3\\u06D5\\u06FA-\\u06FF\\u0750-\\u077F]")
_RE_NUMBER_LEAD = re.compile("^[$\\u20AC\\u00A3]?[0-9]")

_LTR_KINDS = {"url", "email", "handle", "phone", "latin", "tag", "number"}
_NO_DIGIT_CONVERSION = {"handle", "tag", "url", "email", "phone"}


# ---- basics -------------------------------------------------------------------------------------------------------------
def normalize(s) -> str:
    return unicodedata.normalize("NFC", "" if s is None else str(s))


def translate_pattern(pattern: str) -> str:
    """Portable-subset pattern (CONTRACT 3.1) -> Python regex source: ``$`` means end of string only (``\\Z``; a trailing newline
    must not match) and ``\\/`` is a plain slash. Character classes and every other escape are kept."""
    out, in_class, i = [], False, 0
    while i < len(pattern):
        ch = pattern[i]
        if ch == "\\" and i + 1 < len(pattern):
            nxt = pattern[i + 1]
            out.append("/" if nxt == "/" else ch + nxt)
            i += 2
            continue
        if in_class:
            if ch == "]":
                in_class = False
            out.append(ch)
        elif ch == "[":
            in_class = True
            out.append(ch)
        elif ch == "$":
            out.append("\\Z")
        else:
            out.append(ch)
        i += 1
    return "".join(out)


_regex_cache: dict = {}


def portable_regex(pattern: str, flags: str = ""):
    """Compiled regex for a portable-subset pattern; ``flags`` may contain ``i``. Search semantics (use ``.search``/``.finditer``)."""
    key = (pattern, flags)
    rx = _regex_cache.get(key)
    if rx is None:
        rx = _regex_cache[key] = re.compile(translate_pattern(pattern), re.IGNORECASE if "i" in flags else 0)
    return rx


def _countable(token: str) -> bool:
    return any(unicodedata.category(c)[0] in ("L", "N") for c in token)


def _escape_html(s: str) -> str:
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")


# ---- markup: ==emphasis== and \n ----------------------------------------------------------------------------------------
def parse_markup(s) -> dict:
    """``{"plain", "spans": [{"start","end"}], "breaks": [index]}``: ``==span==`` is the emphasis (one per field, not nested, not
    across a newline); an unmatched ``==`` is literal. Offsets are code points of ``plain``, which keeps its newlines."""
    text = normalize(s)
    n = len(text)
    open_at = close_at = -1
    i = 0
    while i + 1 < n and open_at < 0:
        if text[i] == "=" and text[i + 1] == "=":
            j = i + 2
            while j + 1 < n:
                if text[j] == "\n":
                    break
                if text[j] == "=" and text[j + 1] == "=" and j > i + 2:
                    open_at, close_at = i, j
                    break
                j += 1
        i += 1
    if open_at >= 0:
        plain = text[:open_at] + text[open_at + 2:close_at] + text[close_at + 2:]
        spans = [{"start": open_at, "end": close_at - 2}]
    else:
        plain, spans = text, []
    return {"plain": plain, "spans": spans, "breaks": [k for k, ch in enumerate(plain) if ch == "\n"]}


def strip_markup(s) -> str:
    """The text without markers; a newline becomes a space."""
    return parse_markup(s)["plain"].replace("\n", " ")


# ---- tokenizer ----------------------------------------------------------------------------------------------------------
def _match_at(s: str, pos: int):
    m = _RE_URL_HTTP.match(s, pos) or _RE_URL_WWW.match(s, pos)
    if m:
        return "url", m.group(0)
    m = _RE_URL_DOMAIN.match(s, pos)
    if m:
        nxt = s[pos + len(m.group(0)):pos + len(m.group(0)) + 1]
        if not (nxt and _RE_DOMAIN_NEXT.match(nxt)):
            return "url", m.group(0)
    m = _RE_EMAIL.match(s, pos)
    if m:
        return "email", m.group(0)
    m = _RE_HANDLE.match(s, pos)
    if m:
        text = m.group(0)
        trimmed = text.rstrip(".")
        return "handle", trimmed if len(trimmed) > 1 else text
    m = _RE_TAG.match(s, pos)
    if m:
        text = m.group(0)
        trimmed = _RE_TAG_TRAIL.sub("", text)
        return "tag", trimmed if len(trimmed) > 1 else text
    m = _RE_PHONE.match(s, pos)
    if m:
        return "phone", m.group(0)
    m = _RE_NUMBER_W.match(s, pos) or _RE_NUMBER_AI.match(s, pos) or _RE_NUMBER_FA.match(s, pos)
    if m:
        return "number", m.group(0)
    m = _RE_LATIN.match(s, pos)
    if m:
        return "latin", m.group(0).rstrip(".-_/&'")
    m = _RE_EMOJI.match(s, pos)
    if m:
        return "emoji", m.group(0)
    m = _RE_AR.match(s, pos)
    if m:
        return "ar", m.group(0)
    m = _RE_SPACE.match(s, pos)
    if m:
        return "space", m.group(0)
    return "punct", s[pos]


def _is_ltr(kind: str, text: str) -> bool:
    if kind == "tag":
        return not _RE_TAG_ARABIC.search(text)
    if kind == "number":
        return bool(_RE_NUMBER_LEAD.match(text))
    return kind in ("url", "email", "handle", "phone", "latin")


def tokenize(s) -> list[dict]:
    """Left-to-right scan, first matching pattern wins (CONTRACT 3.3). Tokens never overlap; offsets are code points."""
    text = normalize(s)
    out, pos = [], 0
    while pos < len(text):
        kind, tok = _match_at(text, pos)
        out.append({"kind": kind, "text": tok, "start": pos, "end": pos + len(tok), "ltr": _is_ltr(kind, tok)})
        pos += len(tok)
    return out


# ---- counting -----------------------------------------------------------------------------------------------------------
def word_count(s) -> int:
    return sum(1 for t in _RE_WS_RUN.split(strip_markup(s)) if t and _countable(t))


def char_count(s) -> int:
    return len(normalize(s))


# ---- Arabic counted nouns (Python only: the Studio does the same in ui/strings.js) --------------------------------------
# unit -> (one, dual as subject, dual after a preposition, 3-10, 11 and up); {n} stands for the number.
AR_UNITS = {
    "word": ("كلمة واحدة", "كلمتان", "كلمتين", "{n} كلمات", "{n} كلمة"),
    "char": ("حرف واحد", "حرفان", "حرفين", "{n} حروف", "{n} حرفًا"),
    "line": ("سطر واحد", "سطران", "سطرين", "{n} أسطر", "{n} سطرًا"),
    "day": ("يوم واحد", "يومان", "يومين", "{n} أيام", "{n} يومًا"),
    "slide": ("سلايد واحد", "سلايدان", "سلايدين", "{n} سلايدات", "{n} سلايد"),
    "note": ("ملاحظة واحدة", "ملاحظتان", "ملاحظتين", "{n} ملاحظات", "{n} ملاحظة"),
    "file": ("ملف واحد", "ملفان", "ملفين", "{n} ملفات", "{n} ملف"),
}


def ar_count(n, unit: str, *, after_preposition: bool = False) -> str:
    """A counted noun in Arabic: «كلمة واحدة»، «كلمتان»، «6 كلمات»، «36 يومًا». One, two, 3-10 and 11+ take different forms; the
    dual is «يومان» as a subject and «يومين» after a preposition (``after_preposition=True``)."""
    one, dual, dual_obl, few, many = AR_UNITS[unit]
    count = abs(int(n))
    if count == 1:
        form = one
    elif count == 2:
        form = dual_obl if after_preposition else dual
    elif 3 <= count % 100 <= 10:
        form = few
    else:
        form = many
    return form.replace("{n}", str(count))


# ---- digits -------------------------------------------------------------------------------------------------------------
_TO_AI = {ord("0") + i: _AI_DIGITS[i] for i in range(10)}
_FROM_AI = {0x0660 + i: str(i) for i in range(10)}
_FROM_FA = {0x06F0 + i: str(i) for i in range(10)}
_FA_TO_AI = {0x06F0 + i: _AI_DIGITS[i] for i in range(10)}
_RE_DECIMAL = re.compile("([0-9])\\.(?=[0-9])")
_RE_THOUSANDS = re.compile("([0-9]),(?=[0-9]{3}(?![0-9]))")


def _digits_excluded(tok: dict) -> bool:
    return tok["kind"] in _NO_DIGIT_CONVERSION or (tok["kind"] == "number" and re.search("[A-Za-z]", tok["text"]) is not None)


def _convert_number_text(t: str, to: str) -> str:
    if to == "arabic-indic":
        w = t.translate(_FA_TO_AI)
        w = _RE_DECIMAL.sub("\\1\u066B", w)
        w = _RE_THOUSANDS.sub("\\1\u066C", w)
        return w.translate(_TO_AI).replace("%", "\u066A")
    return t.translate(_FROM_AI).translate(_FROM_FA).replace("\u066B", ".").replace("\u066C", ",").replace("\u066A", "%")


def detect_digits(s) -> str:
    """``western | arabic-indic | persian | mixed | none`` (digits inside handles, tags, URLs, e-mails, phones and tokens with a
    Latin letter such as ``4K`` are ignored)."""
    western = indic = persian = False
    for t in tokenize(s):
        if t["kind"] != "number" or _digits_excluded(t):
            continue
        text = t["text"]
        western = western or re.search("[0-9]", text) is not None
        indic = indic or re.search("[\\u0660-\\u0669]", text) is not None
        persian = persian or re.search("[\\u06F0-\\u06F9]", text) is not None
    if persian:
        return "persian"
    if western and indic:
        return "mixed"
    if western:
        return "western"
    if indic:
        return "arabic-indic"
    return "none"


def convert_digits(s, to: str) -> str:
    target = "arabic-indic" if to == "arabic-indic" else "western"
    return "".join(_convert_number_text(t["text"], target) if t["kind"] == "number" and not _digits_excluded(t) else t["text"]
                   for t in tokenize(s))


def format_number(value, to: str) -> str:
    return _convert_number_text(str(value), "arabic-indic" if to == "arabic-indic" else "western")


def counter(i, n, to: str, lang: str = "ar") -> str:
    a, b = format_number(i, to), format_number(n, to)
    return f"{a}/{b}" if lang == "en" else f"{a} \u0645\u0646 {b}"


def remaining(k, to: str, lang: str = "ar") -> str:
    a = format_number(k, to)
    return f"{a} left" if lang == "en" else f"\u0628\u0627\u0642\u064A {a}"


# ---- similarity ---------------------------------------------------------------------------------------------------------
_SKEL_DROP = re.compile("[\\u064B-\\u065F\\u0670\\u0640]")
_SKEL_MAP = {0x0623: "\u0627", 0x0625: "\u0627", 0x0622: "\u0627", 0x0671: "\u0627", 0x0649: "\u064A", 0x0629: "\u0647",
             0x0624: "\u0648", 0x0626: "\u064A"}
_SKEL_DIGITS = {**_FROM_AI, **_FROM_FA}
_ASCII_LOWER = {ord(c): c.lower() for c in "ABCDEFGHIJKLMNOPQRSTUVWXYZ"}


def skeleton(s) -> str:
    """NFC, lower-case ASCII Latin, no marks or tatweel, folded hamza/ya/ta marbuta, Western digits, letters and numbers only."""
    t = normalize(s).translate(_ASCII_LOWER)
    t = _SKEL_DROP.sub("", t).translate(_SKEL_MAP).translate(_SKEL_DIGITS)
    return "".join(c for c in t if unicodedata.category(c)[0] in ("L", "N"))


def _trigrams(sk: str) -> set:
    if len(sk) < 3:
        return {sk}
    return {sk[i:i + 3] for i in range(len(sk) - 2)}


def similarity(a, b) -> float:
    """Dice coefficient of the trigram sets of the two skeletons: 1 for two empty skeletons, 0 for one empty."""
    x, y = skeleton(a), skeleton(b)
    if not x and not y:
        return 1.0
    if not x or not y:
        return 0.0
    ga, gb = _trigrams(x), _trigrams(y)
    return 2.0 * len(ga & gb) / (len(ga) + len(gb))


# ---- Arabic helpers -----------------------------------------------------------------------------------------------------
def has_arabic(s) -> bool:
    return _RE_ARABIC.search(str(s)) is not None


def has_tashkeel(s) -> bool:
    return _RE_TASHKEEL.search(str(s)) is not None


def _in_ranges(cp: int, ranges) -> bool:
    return any(ranges[i] <= cp <= ranges[i + 1] for i in range(0, len(ranges), 2))


_JT_RIGHT = (0x0622, 0x0625, 0x0627, 0x0627, 0x0629, 0x0629, 0x062F, 0x0632, 0x0648, 0x0648, 0x0671, 0x0673, 0x0675, 0x0677,
             0x0688, 0x0699, 0x06C0, 0x06C0, 0x06C2, 0x06CB, 0x06CD, 0x06CD, 0x06CF, 0x06CF, 0x06D2, 0x06D3, 0x0759, 0x075B,
             0x076B, 0x076C, 0x0771, 0x0771, 0x0773, 0x0774, 0x0778, 0x0779)
_JT_DUAL = (0x0626, 0x0626, 0x0628, 0x0628, 0x062A, 0x062E, 0x0633, 0x063F, 0x0641, 0x0647, 0x0649, 0x064A, 0x066E, 0x066F,
            0x0678, 0x0687, 0x069A, 0x06BF, 0x06C1, 0x06C1, 0x06CC, 0x06CC, 0x06CE, 0x06CE, 0x06D0, 0x06D1, 0x0750, 0x0758,
            0x075C, 0x076A, 0x076D, 0x0770, 0x0772, 0x0772, 0x0775, 0x0777, 0x077A, 0x077F)
_JT_TRANSPARENT = (0x064B, 0x065F, 0x0670, 0x0670, 0x06D6, 0x06DC, 0x06DF, 0x06E4, 0x06E7, 0x06E8, 0x06EA, 0x06ED)


def joining_type(cp: int) -> str:
    """``D`` dual, ``R`` right, ``U`` non-joining, ``T`` transparent, ``C`` causing (tatweel)."""
    if cp == 0x0640:
        return "C"
    if _in_ranges(cp, _JT_TRANSPARENT):
        return "T"
    if _in_ranges(cp, _JT_RIGHT):
        return "R"
    if _in_ranges(cp, _JT_DUAL):
        return "D"
    return "U"


def kashida_positions(word: str) -> list[int]:
    """Insertion indices after a dual-joining letter (and its marks) that is followed by a dual- or right-joining letter."""
    out = []
    for i, ch in enumerate(word):
        if joining_type(ord(ch)) != "D":
            continue
        k = i + 1
        while k < len(word) and joining_type(ord(word[k])) == "T":
            k += 1
        if k < len(word) and joining_type(ord(word[k])) in ("D", "R"):
            out.append(k)
    return out


_KASHIDA_PREFER = "\u0633\u0634\u0635\u0636\u0628\u0646\u064A\u062A"


def kashida_apply(word: str, count: int = 3) -> str:
    """``count`` tatweels at the single best position: after س ش ص ض ب ن ي ت in that order, else the first eligible one."""
    letters = sum(1 for c in word if joining_type(ord(c)) in ("D", "R", "U"))
    if letters < 3 or TATWEEL in word:
        return word
    pos = kashida_positions(word)
    if not pos:
        return word

    def letter_before(p: int) -> str:
        k = p - 1
        while k > 0 and joining_type(ord(word[k])) == "T":
            k -= 1
        return word[k]

    best = pos[0]
    for want in _KASHIDA_PREFER:
        hit = next((p for p in pos if letter_before(p) == want), None)
        if hit is not None:
            best = hit
            break
    return word[:best] + TATWEEL * count + word[best:]


# ---- NBSP bindings ------------------------------------------------------------------------------------------------------
_DEFAULT_CLITICS = ("\u0648", "\u0641", "\u0628", "\u0644", "\u0643", "\u0627\u0644", "\u0648\u0627\u0644", "\u0628\u0627\u0644",
                    "\u0643\u0627\u0644", "\u0641\u0627\u0644", "\u0644\u0644", "\u0648\u0644\u0644")
_DEFAULT_BIND_LABELS = ("خطوة", "رقم", "نصيحة", "جزء", "حلقة", "فكرة", "أداة", "مرحلة", "درس", "قاعدة", "فصل", "سلايد", "صفحة",
                        "خيار", "طريقة", "غلطة", "خطأ", "مثال", "نسخة", "إصدار", "يوم", "أسبوع", "مستوى", "مرتبة", "ترتيب")
_bind_cache: dict = {}


def _load_data(*parts):
    """``data/<parts>`` of this skill as JSON, or None when the skill does not carry it (a synced copy may lack it)."""
    try:
        from . import paths
        path = paths.data_path(*parts)
        return paths.read_json(path) if path.is_file() else None
    except Exception:  # noqa: BLE001 - best effort; the built-in lists are the fallback
        return None


def _bind_label_set() -> frozenset:
    if "set" in _bind_cache:
        return _bind_cache["set"]
    copy_doc, ortho_doc = _load_data("rules", "copy.json"), _load_data("rules", "ortho.json")
    clitics = tuple((ortho_doc or {}).get("clitics") or _DEFAULT_CLITICS)
    entries = (((copy_doc or {}).get("lists") or {}).get("bindLabels") or {}).get("entries")
    words: set = set()

    def add(text: str, with_clitics: bool) -> None:
        words.add(text)
        if with_clitics:
            words.update(c + text for c in clitics)

    if entries:
        for entry in entries:
            text = entry.get("text") or ""
            if text and _RE_ARABIC.search(text):
                add(_SKEL_DROP.sub("", text), entry.get("clitics") is not False)
    else:
        for text in _DEFAULT_BIND_LABELS:
            add(text, True)
    _bind_cache["set"] = frozenset(words)
    return _bind_cache["set"]


def _bind_tokens(tokens: list[dict]) -> list[dict]:
    labels = _bind_label_set()
    for i in range(len(tokens) - 2):
        a, sp, b = tokens[i], tokens[i + 1], tokens[i + 2]
        if sp["kind"] != "space" or sp["text"] != " ":
            continue
        if (a["kind"] == "number" and b["kind"] == "ar") or (
                a["kind"] == "ar" and b["kind"] == "number" and _SKEL_DROP.sub("", a["text"]) in labels):
            sp["text"] = NBSP
    return tokens


def bind(s) -> str:
    """Applies the NBSP bindings only (a space between a number and an Arabic word, or a bind-label and a number); plain text out."""
    return "".join(t["text"] for t in _bind_tokens(tokenize(s)))


# ---- to_html ------------------------------------------------------------------------------------------------------------
def to_html(s, *, digits: str = "western", lang: str = "ar", markup: bool = True, kashida_word: str | None = None,
            allow_kashida: bool = False, word_spans: bool = True, index_base: int = 0) -> str:
    """Render one text field (CONTRACT 3.3, "LTR isolation and binding"); see ``text.js`` ``toHTML`` for the full description.

    Arabic context: every LTR run is ``<bdi dir="ltr" class="cs-ltr" data-run=...>``; consecutive LTR words separated by one ordinary
    space form ONE run. English context: Latin and numbers need no isolation; Arabic-script words are isolated with class cs-rtl.
    """
    digits = "arabic-indic" if digits == "arabic-indic" else "western"
    english = lang == "en"
    counter_state = {"w": index_base}

    pm = parse_markup(s) if markup else {"plain": normalize(s), "spans": [], "breaks": []}
    span = pm["spans"][0] if pm["spans"] else None
    tokens = tokenize(pm["plain"])
    for t in tokens:
        if t["kind"] == "number" and not _digits_excluded(t):
            t["text"] = _convert_number_text(t["text"], digits)
            t["ltr"] = digits == "western"
    if not english:
        _bind_tokens(tokens)

    def foreign(t: dict) -> bool:
        if english:
            return t["kind"] == "ar" or (t["kind"] == "tag" and not t["ltr"])
        return bool(t["ltr"]) and t["kind"] in _LTR_KINDS

    def plain_tag(t: dict) -> bool:
        return (not english) and t["kind"] == "tag" and not t["ltr"]

    def isolate(t: dict, text: str) -> str:
        body = _escape_html(text)
        if english:
            return f'<bdi dir="rtl" class="cs-rtl" data-run="{"tag" if t["kind"] == "tag" else "ar"}">{body}</bdi>'
        if t["kind"] == "tag" and not t["ltr"]:
            return f'<bdi dir="rtl" class="cs-rtl" data-run="tag">{body}</bdi>'
        return f'<bdi dir="ltr" class="cs-ltr" data-run="{t["kind"]}">{body}</bdi>'

    kashida_done = not (kashida_word and allow_kashida)
    kashida_bare = (kashida_word or "").replace(TATWEEL, "")

    items: list[dict] = []
    cur = None
    for t in tokens:
        if t["kind"] == "space":
            cur = None
            items.append({"sep": t})
        else:
            if cur is None:
                cur = {"tokens": []}
                items.append({"unit": cur})
            cur["tokens"].append(t)

    def em(toks: list[dict]) -> bool:
        if not span or not toks:
            return False
        return toks[0]["start"] < span["end"] and toks[-1]["end"] > span["start"]

    def wrap(inner: str, cls: str = "w") -> str:
        if not word_spans:
            return inner
        idx = counter_state["w"]
        counter_state["w"] += 1
        return f'<span class="{cls}" data-w="{idx}">{inner}</span>'

    def render_tokens(toks: list[dict], kashida: bool = False) -> str:
        out = []
        for t in toks:
            if t["kind"] == "emoji":
                out.append(f'<span class="cs-emoji">{_escape_html(t["text"])}</span>')
            elif kashida and t["kind"] == "ar" and t["text"].replace(TATWEEL, "") == kashida_bare:
                out.append(_escape_html(kashida_apply(t["text"], 3)))
            elif foreign(t) or plain_tag(t):
                out.append(isolate(t, t["text"]))
            else:
                out.append(_escape_html(t["text"]))
        return "".join(out)

    def analyse(unit: dict):
        idx = [i for i, t in enumerate(unit["tokens"]) if foreign(t) and not plain_tag(t)]
        if len(idx) != 1:
            return None
        k = idx[0]
        return {"before": unit["tokens"][:k], "core": unit["tokens"][k], "after": unit["tokens"][k + 1:]}

    nodes: list[dict] = []
    i = 0
    while i < len(items):
        it = items[i]
        if "sep" in it:
            text = it["sep"]["text"]
            nl = text.count("\n")
            if nl:
                nodes.extend({"t": "br"} for _ in range(nl))
            else:
                nodes.append({"t": "sep", "text": text})
            i += 1
            continue
        a = analyse(it["unit"])
        if a:
            group = [{"unit": it["unit"], "a": a}]
            j = i
            while (not group[-1]["a"]["after"] and j + 2 < len(items) and "sep" in items[j + 1] and items[j + 1]["sep"]["text"] == " "
                   and "unit" in items[j + 2]):
                b = analyse(items[j + 2]["unit"])
                if not b or b["before"]:
                    break
                group.append({"unit": items[j + 2]["unit"], "a": b})
                j += 2
            if len(group) > 1:
                first, last = group[0]["a"], group[-1]["a"]
                if first["before"]:
                    nodes.append({"t": "w", "html": wrap(render_tokens(first["before"])), "em": em(first["before"])})
                kinds = [g["a"]["core"]["kind"] for g in group]
                kind = kinds[0] if all(k == kinds[0] for k in kinds) else "latin"
                inner = []
                for gi, g in enumerate(group):
                    if gi:
                        inner.append({"t": "sep", "text": " "})
                    inner.append({"t": "w", "html": wrap(_escape_html(g["a"]["core"]["text"])), "em": em([g["a"]["core"]])})
                em_all = all(n["t"] == "sep" or n["em"] for n in inner)
                nodes.append({"t": "run", "kind": kind, "rtl": english, "inner": inner, "emAll": em_all, "em": em_all})
                if last["after"]:
                    nodes.append({"t": "w", "html": wrap(render_tokens(last["after"])), "em": em(last["after"])})
                i = j + 1
                continue
        cls, kashida = "w", False
        if not kashida_done and any(t["kind"] == "ar" and t["text"].replace(TATWEEL, "") == kashida_bare for t in it["unit"]["tokens"]):
            kashida_done, kashida, cls = True, True, "w cs-kashida"
        nodes.append({"t": "w", "html": wrap(render_tokens(it["unit"]["tokens"], kashida), cls), "em": em(it["unit"]["tokens"])})
        i += 1

    def open_run(n: dict) -> str:
        if n["rtl"]:
            return '<bdi dir="rtl" class="cs-rtl" data-run="ar">'
        return f'<bdi dir="ltr" class="cs-ltr" data-run="{n["kind"]}">'

    def node_html(n: dict, inside_mark: bool) -> str:
        if n["t"] == "sep":
            return n["text"]
        if n["t"] == "br":
            return "<br>"
        if n["t"] == "w":
            return n["html"]
        return open_run(n) + render_nodes(n["inner"], inside_mark or n["emAll"]) + "</bdi>"

    def render_nodes(lst: list[dict], no_marks: bool) -> str:
        out, i = [], 0
        while i < len(lst):
            if not no_marks and lst[i].get("em"):
                j = last = i
                while j + 1 < len(lst):
                    if lst[j + 1].get("em"):
                        j += 1
                        last = j
                    elif lst[j + 1]["t"] == "sep":
                        j += 1
                    else:
                        break
                out.append('<mark class="cs-em" data-m="em">' + "".join(node_html(n, True) for n in lst[i:last + 1]) + "</mark>")
                i = last + 1
            else:
                out.append(node_html(lst[i], no_marks))
                i += 1
        return "".join(out)

    return render_nodes(nodes, False)


# ---- slide text ---------------------------------------------------------------------------------------------------------
_SLIDE_ORDER = {
    "quote": ("body", "attribution"),
    "testimonial": ("body", "attribution", "number"),
    "offer": ("title", "number", "bullets", "cta"),
}
_DEFAULT_ORDER = ("kicker", "headline", "number", "title", "sub", "body", "bullets", "sides", "attribution", "bridge", "cta")


def slide_text(slide: dict, digits: str | None = "western") -> list[str]:
    """All visible text of a slide in reading order, markup removed, digits shown in ``digits`` when given."""
    out: list[str] = []
    slide = slide or {}

    def push(value) -> None:
        if not isinstance(value, str):
            return
        text = strip_markup(value).strip()
        if text:
            out.append(convert_digits(text, digits) if digits else text)

    for field in _SLIDE_ORDER.get(slide.get("type"), _DEFAULT_ORDER):
        value = slide.get(field)
        if value is None:
            continue
        if field == "bullets":
            for item in value if isinstance(value, list) else ():
                push(item)
        elif field == "sides":
            for side in value if isinstance(value, list) else ():
                if isinstance(side, dict):
                    push(side.get("label"))
                    push(side.get("text"))
        elif field == "number":
            if isinstance(value, dict) and value.get("value") not in (None, ""):
                unit = str(value.get("unit") or "")
                raw = str(value["value"]) + ((" " if unicodedata.category(unit[0])[0] == "L" else "") + unit if unit else "")
                out.append(convert_digits(raw, digits) if digits else raw)
        elif field == "cta":
            if isinstance(value, dict):
                push(value.get("text"))
        else:
            push(value)
    for _key, value in visual_fields(slide):
        push(value)
    return out


# ---- the visible fields the visual language adds (twin of ``visualFields`` in src/lib/text.js) ---------------------------
def _dicts(value):
    """``(index, dict)`` for the dict members of a list; the index counts every member, as the JavaScript ``forEach`` does."""
    return [(i, v) for i, v in enumerate(value) if isinstance(v, dict)] if isinstance(value, list) else []


def _field(holder, name):
    return holder.get(name) if isinstance(holder, dict) else None


def visual_fields(slide: dict) -> list[tuple[str, str]]:
    """The visible text the visual language puts on a slide besides the old fields, as ``(key, text)`` pairs with keys relative to
    the slide (``items.0``, ``items-text.0``, ``items-value.0``, ``demo.0``, ``demo-caption``, ``anchor.captions.0``, ``anchor.word``,
    ``anchor.unit``, ``chart.0.label``, ``mock.title``, ``mock.lines.0``, ``mock.items.0``, ``mock.caption``, ``mock.stamp``), in the
    order of the JavaScript list. A string counts even when empty (the callers drop it); instructions (``visual.idea``, ``why``,
    ``alt``, a demo line's ``who``) and numeric data (``anchor.value``, chart values) are never text."""
    out: list[tuple[str, str]] = []
    slide = slide if isinstance(slide, dict) else {}

    def add(key: str, value) -> None:
        if isinstance(value, str):
            out.append((key, value))

    for i, it in _dicts(slide.get("items")):
        add(f"items.{i}", it.get("title"))
        add(f"items-text.{i}", it.get("text"))
        add(f"items-value.{i}", it.get("value"))
    demo = slide.get("demo") if isinstance(slide.get("demo"), dict) else {}
    anchor = _field(slide.get("visual"), "anchor")
    anchor = anchor if isinstance(anchor, dict) else {}
    mock = anchor.get("mock") if isinstance(anchor.get("mock"), dict) else {}
    for i, line in _dicts(demo.get("lines")):
        add(f"demo.{i}", line.get("text"))
    add("demo-caption", demo.get("caption"))
    for i, caption in enumerate(anchor.get("captions") if isinstance(anchor.get("captions"), list) else ()):
        add(f"anchor.captions.{i}", caption)
    add("anchor.word", anchor.get("word"))
    add("anchor.unit", anchor.get("unit"))
    for i, value in _dicts(_field(anchor.get("chart"), "values")):
        add(f"chart.{i}.label", value.get("label"))
    add("mock.title", mock.get("title"))
    for i, line in _dicts(mock.get("lines")):
        add(f"mock.lines.{i}", line.get("text"))
    for i, choice in enumerate(mock.get("items") if isinstance(mock.get("items"), list) else ()):
        add(f"mock.items.{i}", choice)
    add("mock.caption", mock.get("caption"))
    add("mock.stamp", mock.get("stamp"))
    for i, node in enumerate(free_text(slide)):
        add(f"free.{i}", node)
    return out


# ---- the free design lane (data/free-design.json): the literal text of slide.free.html --------------------------------------
_FREE_VOID = frozenset(("area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"))


class _FreeText(HTMLParser):
    """Collects the text nodes of a fragment in document order, whitespace collapsed (WS class) and trimmed, empty ones dropped. The
    subtree of an element that carries ``data-field`` is skipped, and so is the content of ``script`` and ``style`` (the validator refuses
    both; their text is code, not copy). Comments and declarations are not text. Lenient about nesting: an end tag closes the nearest open
    element of its name and an unmatched one is ignored."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.nodes: list[str] = []
        self._stack: list[str] = []
        self._skip: int | None = None  # stack depth of the element whose subtree is skipped

    def handle_starttag(self, tag, attrs) -> None:
        if tag in _FREE_VOID:
            return
        self._stack.append(tag)
        if self._skip is None and (tag in ("script", "style") or any(name == "data-field" for name, _v in attrs)):
            self._skip = len(self._stack)

    def handle_endtag(self, tag) -> None:
        if tag not in self._stack:
            return
        while self._stack:
            if self._stack.pop() == tag:
                break
        if self._skip is not None and len(self._stack) < self._skip:
            self._skip = None

    def handle_data(self, data) -> None:
        if self._skip is None:
            node = _RE_WS_RUN.sub(" ", data).strip(" ")
            if node:
                self.nodes.append(node)


def free_text(slide: dict) -> list[str]:
    """The literal text nodes of ``slide.free.html`` in document order, the ``data-field`` elements left out (they are counted as the fields
    they name). ``[]`` for a slide without a free design. Twin of ``freeText`` in text.js."""
    free = slide.get("free") if isinstance(slide, dict) else None
    html = free.get("html") if isinstance(free, dict) else None
    if not isinstance(html, str) or not html:
        return []
    parser = _FreeText()
    parser.feed(html)
    parser.close()
    return parser.nodes


def word_counts(slide: dict) -> dict:
    """Twin of ``CS.core.spec.wordCounts``: ``{hero, title, body, total, bullets}``. ``total`` adds every visible field, the visual
    additions included (an instruction never counts). A figure counts as its value and its unit separately."""
    slide = slide if isinstance(slide, dict) else {}

    def wc(s) -> int:
        return word_count(s) if isinstance(s, str) and s else 0

    bullets = [wc(b) for b in slide.get("bullets")] if isinstance(slide.get("bullets"), list) else []
    total = sum(wc(slide.get(k)) for k in ("kicker", "headline", "sub", "title", "body", "attribution", "bridge")) + sum(bullets)
    for side in slide.get("sides") if isinstance(slide.get("sides"), list) else ():
        total += wc(_field(side, "label")) + wc(_field(side, "text"))
    if isinstance(slide.get("cta"), dict):
        total += wc(slide["cta"].get("text"))
    if isinstance(slide.get("number"), dict):
        total += wc(slide["number"].get("value")) + wc(slide["number"].get("unit"))
    total += sum(wc(text) for _key, text in visual_fields(slide))
    return {"hero": wc(slide.get("headline")), "title": wc(slide.get("title")), "body": wc(slide.get("body")), "total": total,
            "bullets": bullets}
