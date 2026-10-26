"""Rule data and the entry matcher (CONTRACT 7.3, 7.4 and 9.4). Twin of ``matchEntries`` in ``src/qa/lint.js``.

``load_bundle()`` reads the rule files this skill carries: ``data/qa-rules.json`` (with every ``{"$platform": "dot.path"}`` resolved
against ``platform-instagram.json`` when that file is present), ``rules/copy.json``, ``rules/ortho.json``, ``dialects/*.json``,
``platform-instagram.json`` and ``locale-defaults.json``. A file the skill does not carry is ``None``/absent, never an error.

``entries_match`` implements the matching of CONTRACT 7.4 on the folded text (tashkeel, superscript alef and tatweel removed;
offsets map back to the original): ``word``, ``phrase`` and ``regex`` entries.
"""
from __future__ import annotations

import copy
import re
from functools import lru_cache

from . import CSError
from . import paths
from . import text as cstext

DIALECT_CODES = ("eg", "gulf", "levant", "msa-white", "en")
DEFAULT_CLITICS = ("و", "ف", "ب", "ل", "ك", "ال", "وال", "بال", "كال", "فال", "لل", "ولل")

_AR_L = "\\u0621-\\u064A\\u066E-\\u06D3\\u06D5\\u06FA-\\u06FF\\u0750-\\u077F\\u08A0-\\u08FF\\uFB50-\\uFDFF\\uFE70-\\uFEFF"
_WORD_TOKENS = re.compile("[" + _AR_L + "]+|[A-Za-z\\u00C0-\\u024F][A-Za-z0-9\\u00C0-\\u024F'\\u2019]*|[0-9\\u0660-\\u0669]+")
_WS_SPLIT = re.compile("[ \\t\\n\\r\\f\\v\\u00A0\\u202F]+")
_LATIN_START = re.compile("^[A-Za-z\\u00C0-\\u024F]")
_EDGE_LETTER = re.compile("[\\u0621-\\u064AA-Za-z0-9\\u066E-\\u06D3]")
_MARKS = re.compile("[\u064B-\u065F\u0670\u0640]")
_WESTERN = {**{0x0660 + i: str(i) for i in range(10)}, **{0x06F0 + i: str(i) for i in range(10)}}

_cache: dict = {}


# ---- bundle -------------------------------------------------------------------------------------------------------------
def _load(*parts):
    path = paths.data_path(*parts)
    return paths.read_json(path) if path.is_file() else None


def _resolve_refs(node, platform_doc):
    if isinstance(node, list):
        return [_resolve_refs(x, platform_doc) for x in node]
    if not isinstance(node, dict):
        return node
    if len(node) == 1 and "$platform" in node:
        cur = platform_doc
        for part in str(node["$platform"]).split("."):
            if isinstance(cur, list):
                try:
                    cur = cur[int(part)]
                except (ValueError, IndexError):
                    cur = None
            elif isinstance(cur, dict):
                cur = cur.get(part)
            else:
                cur = None
            if cur is None:
                raise CSError("E_SCHEMA", f"qa-rules.json: unknown $platform path {node['$platform']}")
        return copy.deepcopy(cur)
    return {k: _resolve_refs(v, platform_doc) for k, v in node.items()}


def load_bundle(refresh: bool = False) -> dict:
    """``{"qaRules","copy","ortho","dialects","platform","locale"}``; absent files are ``None`` (``{}`` for dialects)."""
    key = str(paths.skill_root())
    if not refresh and key in _cache:
        return _cache[key]
    platform_doc = _load("platform-instagram.json")
    qa_rules = _load("qa-rules.json")
    if qa_rules is not None and platform_doc is not None:
        qa_rules = _resolve_refs(qa_rules, platform_doc)
    dialects = {}
    for code in DIALECT_CODES:
        doc = _load("dialects", code + ".json")
        if doc is not None:
            dialects[code] = doc
    bundle = {
        "qaRules": qa_rules,
        "copy": _load("rules", "copy.json"),
        "ortho": _load("rules", "ortho.json"),
        "dialects": dialects,
        "platform": platform_doc,
        "locale": _load("locale-defaults.json"),
    }
    _cache[key] = bundle
    return bundle


def platform(path: str, default=None):
    """A value of ``platform-instagram.json`` by dotted path (array indexes as ``.0``)."""
    node = load_bundle()["platform"]
    for part in path.split("."):
        if isinstance(node, list):
            try:
                node = node[int(part)]
            except (ValueError, IndexError):
                return default
        elif isinstance(node, dict) and part in node:
            node = node[part]
        else:
            return default
    return node


def dialect(code: str) -> dict:
    """``dialects/<code>.json`` (``{}`` when this skill does not carry it)."""
    return load_bundle()["dialects"].get(code, {})


def index() -> dict:
    """``{"order": [...], "gates": {id: gate}, "checks": {id: {"def": check, "gate": gate}}}`` of ``qa-rules.json``."""
    if "index" in _cache:
        return _cache["index"]
    doc = load_bundle()["qaRules"] or {}
    gates, checks = {}, {}
    for gate in doc.get("gates", []):
        gates[gate["id"]] = gate
        for chk in gate.get("checks", []):
            checks[chk["id"]] = {"def": chk, "gate": gate}
    order = list(doc.get("order") or [g["id"] for g in doc.get("gates", [])])
    _cache["index"] = {"order": order, "gates": gates, "checks": checks}
    return _cache["index"]


def check(check_id: str) -> dict:
    """The check definition ``check_id`` (``C2.title-words``), plus ``"gate"`` (the owning gate's id)."""
    entry = index()["checks"].get(check_id)
    if entry is None:
        raise CSError("E_USAGE", f"unknown check {check_id}")
    return {**entry["def"], "gate": entry["gate"]["id"]}


def list_entries(name: str) -> list:
    """Entries of a ``copy.json`` list (empty when the list or the file is missing)."""
    doc = load_bundle()["copy"] or {}
    lst = (doc.get("lists") or {}).get(name) or {}
    return list(lst.get("entries") or [])


def clitics() -> tuple:
    ortho = load_bundle()["ortho"] or {}
    return tuple(ortho.get("clitics") or DEFAULT_CLITICS)


# ---- folding ------------------------------------------------------------------------------------------------------------
def is_mark(ch: str) -> bool:
    c = ord(ch)
    return 0x064B <= c <= 0x065F or c == 0x0670 or c == 0x0640


class Folded:
    """Text without U+064B-065F, U+0670 and U+0640; ``map[i]`` is the original offset of folded char ``i`` (``map[len]`` is the length)."""

    __slots__ = ("text", "map", "orig")

    def __init__(self, s: str):
        if not _MARKS.search(s):
            self.text, self.map, self.orig = s, list(range(len(s) + 1)), s
            return
        out, mp = [], []
        for i, ch in enumerate(s):
            if is_mark(ch):
                continue
            out.append(ch)
            mp.append(i)
        mp.append(len(s))
        self.text, self.map, self.orig = "".join(out), mp, s

    def range(self, a: int, b: int):
        """Original range of the folded range ``[a, b)``; trailing marks join the word."""
        start = self.map[a]
        end = self.map[max(a, b - 1)] + 1
        while end < len(self.orig) and is_mark(self.orig[end]):
            end += 1
        return start, end


def fold(s: str) -> Folded:
    return Folded(s)


def fold_key(s) -> str:
    return fold(str(s)).text


def to_western(s: str) -> str:
    return s.translate(_WESTERN)


# ---- entry matching -----------------------------------------------------------------------------------------------------
def _entry_applies(entry: dict, dialect_code) -> bool:
    ds = entry.get("dialects")
    return not isinstance(ds, list) or "*" in ds or not dialect_code or dialect_code in ds


def _is_latin_start(s: str) -> bool:
    return _LATIN_START.match(s) is not None


def _norm_word(s: str) -> str:
    """The comparison form of a word: Latin lower-cased, anything else with Western digits."""
    return s.lower() if _is_latin_start(s) else to_western(s)


def _word_eq(token: str, entry_word: str, use_clitics: bool, clitic_list) -> bool:
    lat = _is_latin_start(token)
    a = token.lower() if lat else to_western(token)
    b = _norm_word(entry_word)
    if a == b:
        return True
    if use_clitics and not lat:
        return any(a == c + b for c in clitic_list)
    return False


@lru_cache(maxsize=8192)
def _entry_words(text: str) -> tuple:
    return tuple(w for w in _WS_SPLIT.split(fold(text).text.strip()) if w)


class Prepared:
    """A text folded and split into words once, so many entries can be matched against it cheaply."""

    __slots__ = ("text", "folded", "words", "by_form", "_stripped")

    def __init__(self, text: str):
        self.text = text
        self.folded = fold(text)
        self.words = [(m.group(0), m.start(), m.end()) for m in _WORD_TOKENS.finditer(self.folded.text)]
        self.by_form: dict[str, list[int]] = {}
        for i, (w, _s, _e) in enumerate(self.words):
            self.by_form.setdefault(_norm_word(w), []).append(i)
        self._stripped: dict = {}

    def _without_clitic(self, clitic_list: tuple) -> dict:
        """form-without-one-proclitic -> indexes of the (non-Latin) words that carry that proclitic."""
        idx = self._stripped.get(clitic_list)
        if idx is None:
            idx = {}
            for form, positions in self.by_form.items():
                for c in clitic_list:
                    if len(form) > len(c) and form.startswith(c):
                        idx.setdefault(form[len(c):], []).extend(i for i in positions if not _is_latin_start(self.words[i][0]))
            self._stripped[clitic_list] = idx
        return idx

    def starts_for(self, first_word: str, use_clitics: bool, clitic_list) -> list[int]:
        """Indexes of the words equal to ``first_word`` (or a clitic + ``first_word`` when allowed), in text order."""
        b = _norm_word(first_word)
        hits = list(self.by_form.get(b, ()))
        if use_clitics:
            hits += self._without_clitic(tuple(clitic_list)).get(b, ())
            hits = sorted(set(hits))
        return hits


def prepare(text: str) -> Prepared:
    return Prepared(text)


def entries_match(entries: list, text: str, *, dialect: str | None = None, clitics: tuple | list | None = None,
                  prepared: Prepared | None = None) -> list[dict]:
    """CONTRACT 7.4 matching. Returns ``[{"id","start","end","text","entry"}]`` sorted by start (longer first on ties).

    ``prepared`` (from ``prepare(text)``) lets a caller that matches many entries against one text fold and split it once."""
    if not isinstance(entries, list) or not entries or not isinstance(text, str) or not text.strip():
        return []
    prep = prepared if prepared is not None and prepared.text == text else Prepared(text)
    folded, words = prep.folded, prep.words
    clitic_list = tuple(clitics) if clitics else DEFAULT_CLITICS
    out = []
    for entry in entries:
        if not isinstance(entry, dict) or not _entry_applies(entry, dialect):
            continue
        kind = entry.get("match") or ("regex" if entry.get("pattern") else "word")
        if kind == "regex":
            pattern = entry.get("pattern")
            if not isinstance(pattern, str) or not pattern.strip():
                continue
            try:
                rx = cstext.portable_regex(pattern, "i" if "i" in (entry.get("flags") or "") else "")
            except re.error:
                continue
            for m in rx.finditer(folded.text):
                if m.group(0) == "":
                    continue
                a, b = m.start(), m.end()
                while a < b and not _EDGE_LETTER.match(folded.text[a]):
                    a += 1
                while b > a and not _EDGE_LETTER.match(folded.text[b - 1]):
                    b -= 1
                if a >= b:
                    continue
                start, end = folded.range(a, b)
                out.append({"id": entry.get("id"), "start": start, "end": end, "text": text[start:end], "entry": entry})
            continue
        ew = _entry_words(str(entry.get("text") or ""))
        if not ew:
            continue
        for i in prep.starts_for(ew[0], entry.get("clitics") is True, clitic_list):
            if i + len(ew) > len(words):
                continue
            ok = True
            for j in range(1, len(ew)):
                w_text, w_start, _w_end = words[i + j]
                gap = folded.text[words[i + j - 1][2]:w_start]
                if gap == "" or "".join(_WS_SPLIT.split(gap)) != "" or not _word_eq(w_text, ew[j], False, clitic_list):
                    ok = False
                    break
            if ok:
                start, end = folded.range(words[i][1], words[i + len(ew) - 1][2])
                out.append({"id": entry.get("id"), "start": start, "end": end, "text": text[start:end], "entry": entry})
    out.sort(key=lambda h: (h["start"], -h["end"]))
    return out
