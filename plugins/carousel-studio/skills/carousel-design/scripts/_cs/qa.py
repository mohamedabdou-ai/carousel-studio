"""The text-scope quality gates in Python (CONTRACT 7 and 9.4). Twin of ``src/qa/gates-*.js``: same rules, same verdicts.

``run_text_gates`` runs C1-C10, O1, N1, B1 (text), B2, SRC1, SEN1 and D8 on a spec (and, for the caption pack, the brand and the recent
history) and returns ``QAResult`` dicts sorted like ``CS.qa.runText``. Rendered, export and model-only checks are not Python's job
(gate ``engines`` in ``qa-rules.json``); the voice-drift check C5.voice-drift is scored by ``voice_check.py``.
Thresholds are read from ``qa-rules.json`` (resolved against ``platform-instagram.json``); nothing is hard-coded here.
"""
from __future__ import annotations

import math
import re
import unicodedata

from . import CSError, lint, report, rules, text as cstext

SEV_RANK = {"BLOCK": 0, "FIX": 1, "NOTE": 2}
CHECKPOINTS = ("angle", "script", "design", "ready", "exported")
summarize = report.summarize
format_msg = report.format_msg

_WESTERN = {**{0x0660 + i: str(i) for i in range(10)}, **{0x06F0 + i: str(i) for i in range(10)}}


# ---- helpers ------------------------------------------------------------------------------------------------------------
def wc(s) -> int:
    return cstext.word_count(s or "")


def cc(s) -> int:
    return cstext.char_count(s or "")


def strip(s) -> str:
    return cstext.strip_markup(s or "")


def split_cover(cover: str) -> tuple[str, str]:
    """Hero and sub-line at the first beat: question/exclamation, ellipsis, colon or newline.

    Question and exclamation marks stay on the hero. A separator without a second beat
    does not split anything. Keep markup intact; word_count owns its interpretation.
    """
    s = unicodedata.normalize("NFC", str(cover or "")).replace("\r", "").strip()
    match = re.search(r"…|\.{3}|[؟?!:](?=[ \t\n\f\v\u00A0\u202F]|$)|\n", s)
    if not match:
        return s, ""
    sub = re.sub(r"^[…. \t\n\f\v\u00A0\u202F]+", "", s[match.end():]).strip()
    if not sub or s[:match.start()].count("==") % 2:
        return s, ""
    end = match.end() if match.group() in ("؟", "?", "!") else match.start()
    hero = s[:end].strip()
    return (hero, sub) if hero else (s, "")


def lint_plain(f: dict) -> str:
    """Text as the spelling and bidi checks see it: a caption keeps its line breaks (a blank line is not a double space)."""
    return str(f["text"]) if str(f["key"]).startswith("caption.") else strip(f["text"])


def non_empty(s) -> bool:
    return isinstance(s, str) and s.strip() != ""


def is_obj(v) -> bool:
    return isinstance(v, dict)


def js_round(x: float) -> int:
    return int(math.floor(x + 0.5))


def snippet(s, n: int) -> str:
    t = " ".join(str("" if s is None else s).split())
    cps = list(t)
    return "".join(cps[:n - 1]) + "…" if len(cps) > n else t


def to_western(s: str) -> str:
    return str(s).translate(_WESTERN)


def norm_number(raw) -> str:
    """Canonical numeric string: Western digits, '.' decimal, no group separators."""
    s = to_western(raw).replace("٫", ".")
    s = re.sub("[\\u066C,\\u00A0\\u202F ](?=[0-9]{3}(?:[^0-9]|\\Z))", "", s)
    s = re.sub("[^0-9.]", "", s)
    s = re.sub("^0+(?=[0-9])", "", s)
    if "." in s:
        s = re.sub("0+\\Z", "", s)
        s = re.sub("\\.\\Z", "", s)
    return s


def ckpt_index(cp) -> int:
    return max(0, CHECKPOINTS.index(cp)) if cp in CHECKPOINTS else 0


def _sort_text(s: str):
    """Approximation of ``localeCompare(..., "en")`` for ASCII keys: letters ignoring case first, lower case before upper."""
    return (s.lower(), s.swapcase())


# ---- context ------------------------------------------------------------------------------------------------------------
class Ctx:
    """Everything a text gate needs, computed once per run."""

    def __init__(self, spec, brand, history, gates, fast, family_limits, slides_filter=None):
        self.spec = spec
        self.brand = brand
        self.idx = rules.index()
        self.bundle = rules.load_bundle()
        loc = spec.get("locale") or {}
        self.slides = [s for s in (spec.get("slides") or []) if is_obj(s)]
        self.pos = {s.get("id"): i for i, s in enumerate(self.slides)}
        self.format = spec.get("format") or "carousel"
        self.mode = spec.get("mode") or "guided"
        self.fast = fast is True or spec.get("mode") == "fast"
        self.dialect = loc.get("dialect") or "msa-white"
        self.digits = loc.get("digits") or "western"
        self.checkpoint = spec.get("checkpoint") or "script"
        self.history = self._history(history)
        self.family_limits = family_limits
        self.gates = set(gates) if gates else None
        self.slide_filter = set(slides_filter) if slides_filter else None
        ortho = self.bundle.get("ortho") or {}
        self.clitics = tuple(ortho.get("clitics")) if ortho.get("clitics") else None

    def _history(self, history):
        h = history
        if not h and self.brand and is_obj(self.brand.get("hooks")):
            h = self.brand["hooks"].get("history")
        if h and not isinstance(h, list):
            h = h.get("posts") or h.get("history") or []
        if not isinstance(h, list):
            return []
        return [e for e in h if is_obj(e) and e.get("postId") != self.spec.get("id")]

    def want(self, gate_id: str) -> bool:
        return not self.gates or gate_id in self.gates

    def active(self, check_id: str, slide: dict | None = None) -> bool:
        e = self.idx["checks"].get(check_id)
        if not e:
            return False
        engines = e["def"].get("engines") or e["gate"].get("engines") or ["py", "js"]
        if "py" not in engines:
            return False
        a = e["def"].get("appliesTo") or e["gate"].get("appliesTo") or {}
        if a.get("formats") and self.format not in a["formats"]:
            return False
        if a.get("dialects") and self.dialect not in a["dialects"]:
            return False
        if a.get("modes") and ("fast" if self.fast else "guided") not in a["modes"]:
            return False
        if slide is not None:
            if a.get("slideTypes") and slide.get("type") not in a["slideTypes"]:
                return False
            if a.get("slidePositions") and (self.pos.get(slide.get("id"), -1) + 1) not in a["slidePositions"]:
                return False
        return True

    def param(self, check_id: str) -> dict:
        e = self.idx["checks"].get(check_id)
        return (e["def"].get("params") if e else None) or {}

    def match_kwargs(self) -> dict:
        return {"dialect": self.dialect, "clitics": self.clitics}

    def list_entries(self, name: str) -> list:
        lst = ((self.bundle.get("copy") or {}).get("lists") or {}).get(name) or {}
        return list(lst.get("entries") or [])


def make_finding(ctx: Ctx, check_id: str, slide=None, el=None, vars=None, sev=None, rule=None, msg=None, fix=None) -> dict:
    e = ctx.idx["checks"].get(check_id)
    if not e:
        raise CSError("E_USAGE", f"unknown check {check_id}")
    v = dict(vars or {})
    if v.get("text") is not None:
        v["text"] = snippet(v["text"], 40)
    f = {"gate": e["gate"]["id"], "rule": rule or check_id, "sev": sev if sev in SEV_RANK else e["def"]["sev"]}
    if slide:
        f["slide"] = slide
    if el:
        f["el"] = el
    mt = msg or e["def"]["msg"]
    f["msg"] = {"ar": format_msg(mt["ar"], v), "en": format_msg(mt["en"], v)}
    ft = fix or e["def"].get("fix")
    if ft:
        f["fix"] = {"ar": format_msg(ft["ar"], v), "en": format_msg(ft["en"], v)}
    f["autofixed"] = False
    return f


def emit(ctx: Ctx, out: list, check_id: str, **kw) -> None:
    out.append(make_finding(ctx, check_id, **kw))


def emit_over(ctx: Ctx, out: list, check_id: str, slide, el, count, extra=None) -> bool:
    if not ctx.active(check_id, slide):
        return False
    p = ctx.param(check_id)
    if not count > p["max"]:
        return False
    emit(ctx, out, check_id, slide=slide.get("id") if slide else None, el=el, vars={"count": count, "max": p["max"], **(extra or {})})
    return True


# ---- text-field model ---------------------------------------------------------------------------------------------------
def slide_fields(slide: dict) -> list[dict]:
    sid = slide.get("id") or "s00"
    out: list[dict] = []

    def add(field, text, index=None, key=None):
        if not non_empty(text):
            return
        out.append({"key": key or (f"{sid}.{field}" if index is None else f"{sid}.{field}.{index}"),
                    "slide": sid, "field": field, "index": index, "text": text})

    add("kicker", slide.get("kicker"))
    add("headline", slide.get("headline"))
    add("title", slide.get("title"))
    if is_obj(slide.get("number")) and non_empty(slide["number"].get("unit")):
        add("number", slide["number"]["unit"], None, f"{sid}.number")
    add("sub", slide.get("sub"))
    add("body", slide.get("body"))
    for i, b in enumerate(slide.get("bullets") or []):
        add("bullets", b, i)
    for i, s in enumerate(slide.get("sides") or []):
        if not is_obj(s):
            continue
        add("sides", s.get("text"), i)
        add("sides.label", s.get("label"), i, f"{sid}.sides.{i}.label")
    add("attribution", slide.get("attribution"))
    add("bridge", slide.get("bridge"))
    if is_obj(slide.get("cta")):
        add("cta", slide["cta"].get("text"))
    for key, text in cstext.visual_fields(slide):
        add(key, text)
    return out


def caption_fields(spec: dict, with_alt: bool) -> list[dict]:
    p = spec.get("captionPack")
    if not is_obj(p):
        return []
    slides = spec.get("slides") or []
    out: list[dict] = []

    def add(key, field, text, slide_idx=None):
        if not non_empty(text):
            return
        sl = slides[slide_idx].get("id") if slide_idx is not None and slide_idx < len(slides) and is_obj(slides[slide_idx]) else None
        out.append({"key": key, "field": field, "text": text, "slide": sl})

    add("caption.firstLine", "firstLine", p.get("firstLine"))
    add("caption.keywordLine", "keywordLine", p.get("keywordLine"))
    add("caption.body", "body", p.get("body"))
    add("caption.cta", "cta", p.get("cta"))
    for i, t in enumerate(p.get("perSlide") or []):
        add(f"caption.perSlide.{i}", "perSlide", t, i)
    if with_alt:
        for i, t in enumerate(p.get("alt") or []):
            add(f"caption.alt.{i}", "alt", t, i)
    return out


def number_text(slide: dict) -> str:
    n = slide.get("number")
    if not is_obj(n) or not non_empty(n.get("value")):
        return ""
    return n["value"] + (" " + n["unit"] if non_empty(n.get("unit")) else "")


def slide_strings(slide: dict, with_bridge: bool, with_cta: bool) -> list[str]:
    out: list[str] = []

    def push(s):
        if non_empty(s):
            out.append(strip(s))

    for f in ("kicker", "headline", "title"):
        push(slide.get(f))
    push(number_text(slide))
    push(slide.get("sub"))
    push(slide.get("body"))
    for b in slide.get("bullets") or []:
        push(b)
    for s in slide.get("sides") or []:
        if is_obj(s):
            push(s.get("label"))
            push(s.get("text"))
    push(slide.get("attribution"))
    for _key, text in cstext.visual_fields(slide):
        push(text)
    if with_bridge:
        push(slide.get("bridge"))
    if with_cta and is_obj(slide.get("cta")):
        push(slide["cta"].get("text"))
    return out


def slide_words(slide: dict, with_bridge: bool, with_cta: bool) -> int:
    return sum(wc(s) for s in slide_strings(slide, with_bridge, with_cta))


def assemble_caption(spec: dict) -> str:
    p = spec.get("captionPack") or {}
    head = "\n".join(x for x in (p.get("firstLine"), p.get("keywordLine")) if non_empty(x))
    tags = " ".join(p["hashtags"]) if isinstance(p.get("hashtags"), list) else ""
    return "\n\n".join(x for x in (head, p.get("body"), p.get("cta"), tags) if non_empty(x))


def cover_text(spec: dict) -> str:
    hook = spec.get("hook")
    if is_obj(hook) and non_empty(hook.get("cover")):
        return strip(hook["cover"])
    s = next((x for x in spec.get("slides") or [] if x and x.get("type") in ("cover", "poster")), None)
    return strip(s.get("headline") or "") if s else ""


def prose_fields(ctx: Ctx) -> list[dict]:
    out = []
    for s in ctx.slides:
        out += [f for f in slide_fields(s) if f["field"] not in ("number", "sides.label")]
    out += [f for f in caption_fields(ctx.spec, False) if f["field"] != "perSlide"]
    return out


def lint_fields(ctx: Ctx) -> list[dict]:
    out = []
    for s in ctx.slides:
        out += [f for f in slide_fields(s) if f["field"] != "number"]
    return out + caption_fields(ctx.spec, False)


def first_match(ctx: Ctx, entries: list, text: str):
    hits = rules.entries_match(entries, text, **ctx.match_kwargs())
    return hits[0] if hits else None


# ---- C1 .. C10 ----------------------------------------------------------------------------------------------------------
def gate_c1(ctx: Ctx, out: list) -> None:
    for s in ctx.slides:
        if s.get("type") not in ("cover", "poster"):
            continue
        el = f"{s.get('id')}.headline"
        hero = wc(split_cover(s.get("headline"))[0])
        total = wc(s.get("headline")) + wc(s.get("kicker")) + wc(s.get("sub"))
        emit_over(ctx, out, "C1.hero-words", s, el, hero, {"text": strip(s.get("headline") or "")})
        emit_over(ctx, out, "C1.total-words", s, el, total)
        if non_empty(s.get("headline")):
            emit_over(ctx, out, "C1.lines", s, el, len(cstext.parse_markup(s["headline"])["breaks"]) + 1)
        if ctx.active("C1.number-words", s):
            entries = ctx.list_entries(ctx.param("C1.number-words").get("list"))
            text = " ".join(strip(x) for x in (s.get("kicker"), s.get("headline"), s.get("sub")) if non_empty(x))
            m = first_match(ctx, entries, text)
            if m:
                emit(ctx, out, "C1.number-words", slide=s.get("id"), el=el, vars={"text": m["text"]})


def gate_c2(ctx: Ctx, out: list) -> None:
    for s in ctx.slides:
        sid = s.get("id")
        if non_empty(s.get("title")):
            emit_over(ctx, out, "C2.title-words", s, f"{sid}.title", wc(s["title"]), {"text": strip(s["title"])})
        bodies = []
        if non_empty(s.get("body")):
            bodies.append({"el": f"{sid}.body", "text": s["body"]})
        for i, side in enumerate(s.get("sides") or []):
            if is_obj(side) and non_empty(side.get("text")):
                bodies.append({"el": f"{sid}.sides.{i}", "text": side["text"]})
        for b in bodies:
            n = wc(b["text"])
            extra = {"text": strip(b["text"])}
            if ctx.active("C2.body-hard", s) and n > ctx.param("C2.body-hard")["max"]:
                emit(ctx, out, "C2.body-hard", slide=sid, el=b["el"], vars={"count": n, "max": ctx.param("C2.body-hard")["max"], **extra})
            elif ctx.active("C2.body-words", s):
                p = ctx.param("C2.body-words")
                if p["max"] < n <= p["hardMax"]:
                    emit(ctx, out, "C2.body-words", slide=sid, el=b["el"], vars={"count": n, "max": p["max"], **extra})
        bullets = s.get("bullets") if isinstance(s.get("bullets"), list) else []
        if bullets:
            dense = s.get("type") in ctx.param("C2.bullets")["denseTypes"]
            emit_over(ctx, out, "C2.bullets-dense" if dense else "C2.bullets", s, f"{sid}.bullets", len(bullets))
            if dense:
                n = wc(s.get("title")) + sum(wc(b) for b in bullets) + wc(s.get("bridge"))
                emit_over(ctx, out, "C2.dense-words", s, f"{sid}.bullets", n)
        emit_over(ctx, out, "C2.slide-words", s, sid, slide_words(s, True, True))
        if non_empty(s.get("bridge")):
            emit_over(ctx, out, "C2.bridge-words", s, f"{sid}.bridge", wc(s["bridge"]), {"text": strip(s["bridge"])})
        if s.get("type") == "cta":
            emit_over(ctx, out, "C2.cta-words", s, sid, wc(s.get("title")) + wc(s.get("body")) + wc(s["cta"].get("text") if is_obj(s.get("cta")) else ""))
        if s.get("type") == "share":
            emit_over(ctx, out, "C2.share-words", s, sid, wc(s.get("headline")) + wc(s.get("sub")))


def gate_c3(ctx: Ctx, out: list) -> None:
    if len(ctx.slides) < 2:
        return
    s = ctx.slides[1]
    sid = s.get("id")
    emit_over(ctx, out, "C3.words", s, sid, slide_words(s, False, False))
    if ctx.active("C3.intro", s):
        entries = ctx.list_entries(ctx.param("C3.intro").get("list"))
        m = first_match(ctx, entries, "\n".join(slide_strings(s, False, False)))
        if m:
            emit(ctx, out, "C3.intro", slide=sid, el=sid, vars={"text": m["text"]})
    if ctx.active("C3.type", s) and s.get("type") not in ctx.param("C3.type")["allowed"]:
        emit(ctx, out, "C3.type", slide=sid, el=sid, vars={"type": s.get("type")})


_CTA_KIND = {"save": ("حفظ", "save"), "send": ("إرسال", "send"), "question": ("سؤال", "question"),
             "keyword-dm": ("كلمة مفتاحية", "keyword"), "follow": ("متابعة", "follow")}
_INTENT = {"reach": ("الوصول", "reach"), "save": ("الحفظ", "save"), "send": ("الإرسال", "send"), "sell": ("البيع", "sell")}


def _kind_name(k, lang):
    return _CTA_KIND[k][0 if lang == "ar" else 1] if k in _CTA_KIND else k


def _intent_name(k, lang):
    return _INTENT[k][0 if lang == "ar" else 1] if k in _INTENT else k


def gate_c4(ctx: Ctx, out: list) -> None:
    with_cta = [s for s in ctx.slides if is_obj(s.get("cta"))]
    kinds = list(dict.fromkeys(s["cta"].get("kind") for s in with_cta))
    n = len(ctx.slides)
    if n > 0 and ctx.active("C4.count") and not with_cta:
        emit(ctx, out, "C4.count")
    if ctx.active("C4.multiple") and len(kinds) > 1:
        emit(ctx, out, "C4.multiple", vars={"count": len(kinds)})
    for s in with_cta:
        sid, idx = s.get("id"), ctx.pos[s.get("id")]
        if ctx.active("C4.position", s) and idx < n - 2:
            emit(ctx, out, "C4.position", slide=sid, el=f"{sid}.cta")
        if ctx.active("C4.early", s) and s.get("type") != "offer" and idx + 1 <= n // 2:
            emit(ctx, out, "C4.early", slide=sid, el=f"{sid}.cta", vars={"n": idx + 1})
        if ctx.active("C4.intent", s) and ctx.spec.get("intent"):
            allowed = ctx.param("C4.intent")["allowedByIntent"].get(ctx.spec["intent"])
            if isinstance(allowed, list) and s["cta"].get("kind") not in allowed:
                emit(ctx, out, "C4.intent", slide=sid, el=f"{sid}.cta", vars={
                    "kindAr": _kind_name(s["cta"].get("kind"), "ar"), "kindEn": _kind_name(s["cta"].get("kind"), "en"),
                    "intentAr": _intent_name(ctx.spec["intent"], "ar"), "intentEn": _intent_name(ctx.spec["intent"], "en"),
                    "allowedAr": "، ".join(_kind_name(k, "ar") for k in allowed), "allowedEn": ", ".join(_kind_name(k, "en") for k in allowed)})
    if ctx.active("C4.bait"):
        entries = ctx.list_entries(ctx.param("C4.bait").get("list"))
        targets = [{"slide": s.get("id"), "el": f"{s.get('id')}.cta", "text": s["cta"].get("text")} for s in with_cta]
        pack = ctx.spec.get("captionPack")
        if is_obj(pack) and non_empty(pack.get("cta")):
            targets.append({"slide": None, "el": "caption.cta", "text": pack["cta"]})
        for t in targets:
            m = first_match(ctx, entries, strip(t["text"]))
            if m:
                emit(ctx, out, "C4.bait", slide=t["slide"], el=t["el"], vars={"text": m["text"]})
    if ctx.active("C4.keyword-asset"):
        kw = next((s for s in with_cta if s["cta"].get("kind") == "keyword-dm"), None)
        asset = (ctx.spec.get("captionPack") or {}).get("asset") if is_obj(ctx.spec.get("captionPack")) else None
        if kw and not (is_obj(asset) and asset.get("delivery") == "instant"):
            emit(ctx, out, "C4.keyword-asset", slide=kw.get("id"), el=f"{kw.get('id')}.cta")


def gate_c5(ctx: Ctx, out: list) -> None:
    n = len(ctx.slides)
    if n == 0:
        return
    if ctx.active("C5.slide-count"):
        p = ctx.param("C5.slide-count")
        if n < p["min"] or n > p["max"]:
            emit(ctx, out, "C5.slide-count", vars={"count": n, "min": p["min"], "max": p["max"]})
    if ctx.active("C5.slide-count-low"):
        p = ctx.param("C5.slide-count-low")
        if p["hardMin"] <= n < p["min"]:
            emit(ctx, out, "C5.slide-count-low", vars={"count": n, "min": p["min"], "recMin": p["recMin"], "recMax": p["recMax"]})
    if ctx.active("C5.slide-count-range"):
        p = ctx.param("C5.slide-count-range")
        if p["warnBelow"] <= n <= p["hardMax"] and (n < p["min"] or n > p["max"]):
            emit(ctx, out, "C5.slide-count-range", vars={"count": n, "min": p["min"], "max": p["max"]})
    if ctx.active("C5.skeleton"):
        p = ctx.param("C5.skeleton")
        if ctx.slides[0].get("type") not in p["first"] or ctx.slides[n - 1].get("type") not in p["last"]:
            emit(ctx, out, "C5.skeleton", slide=ctx.slides[0].get("id"), el=ctx.slides[0].get("id"))
    if ctx.active("C5.bridge"):
        types = ctx.param("C5.bridge")["types"]
        for i, s in enumerate(ctx.slides):
            if i < n - 1 and s.get("type") in types and not non_empty(s.get("bridge")):
                emit(ctx, out, "C5.bridge", slide=s.get("id"), el=f"{s.get('id')}.bridge")


def counted_numbers(text: str, lo: int, hi: int) -> list[int]:
    toks = cstext.tokenize(text)
    found = []
    for i, t in enumerate(toks):
        if t["kind"] != "number" or re.search("[%A-Za-z$\\u20AC\\u00A3\\u066A]", t["text"]):
            continue
        digits = to_western(t["text"])
        if not re.fullmatch("[0-9]+", digits) or not re.fullmatch("[0-9\\u0660-\\u0669]+", t["text"]):
            continue
        v = int(digits)
        if not lo <= v <= hi:
            continue
        j = i + 1
        if j < len(toks) and toks[j]["kind"] == "space":
            j += 1
        if j < len(toks) and toks[j]["kind"] in ("ar", "latin"):
            found.append(v)
    return found


def contains_key(s) -> str:
    """Text as the containment checks compare it: markup, tashkeel and tatweel gone, one space, lower case."""
    return " ".join(rules.fold_key(strip(s)).lower().split())


def gate_c6(ctx: Ctx, out: list) -> None:
    cover = next((s for s in ctx.slides if s.get("type") == "cover"), None)
    if not cover:
        return
    text = " ".join(strip(x) for x in (cover.get("kicker"), cover.get("headline"), cover.get("sub")) if non_empty(x))

    if ctx.active("C6.list-count"):
        p = ctx.param("C6.list-count")
        if ctx.spec.get("architecture") in p["architectures"]:
            nums = counted_numbers(text, p["min"], p["max"])
            numbered = {s["ord"] for s in ctx.slides if isinstance(s.get("ord"), (int, float))
                        and not isinstance(s.get("ord"), bool) and s["ord"] > 0 and s["ord"] % 1 == 0}
            # Explicit membership wins over layout type. Legacy lists without ord use
            # only their architecture's item type; context is never inferred from proof.
            primary = "step" if ctx.spec.get("architecture") == "steps" else "item"
            items = len(numbered) if numbered else sum(1 for s in ctx.slides if s.get("type") == primary)
            if nums and items > 0 and items not in nums:
                emit(ctx, out, "C6.list-count", slide=cover.get("id"), el=f"{cover.get('id')}.headline", vars={"count": nums[0], "n": items})

    # A viewer Instagram re-serves from slide 2 never saw the cover: slide 2 must carry the count or name the first item.
    s2 = ctx.slides[1] if len(ctx.slides) > 1 else None
    if s2 is not None and s2 is not cover and ctx.active("C6.slide2-promise", s2):
        q = ctx.param("C6.slide2-promise")
        if ctx.spec.get("architecture") in q["architectures"] and s2.get("type") not in q["itemTypes"]:
            nums = counted_numbers(text, q["min"], q["max"])
            if nums:
                body = "\n".join(slide_strings(s2, False, False))
                have = numbers_in(body)
                first = next((s for i, s in enumerate(ctx.slides) if i >= 2 and s.get("type") in q["itemTypes"]), None)
                title = contains_key(first["title"]) if first and non_empty(first.get("title")) else ""
                counted = any(norm_number(str(n)) in have for n in nums)
                named = title != "" and title in contains_key(body)
                if not counted and not named:
                    emit(ctx, out, "C6.slide2-promise", slide=s2.get("id"), el=s2.get("id"), vars={"count": nums[0]})


# ---- D8 -----------------------------------------------------------------------------------------------------------------
def _layout_key(s: dict) -> str:
    """Slides that look alike: the same type and the same chosen variant (none chosen counts as one variant)."""
    return f"{s.get('type')}|{s['variant'] if non_empty(s.get('variant')) else ''}"


def gate_d8(ctx: Ctx, out: list) -> None:
    """No run of identical layouts longer than params.max: one finding per run, on the first slide past the limit."""
    if not ctx.active("D8.rhythm"):
        return
    mx = ctx.param("D8.rhythm")["max"]
    i = 0
    while i < len(ctx.slides):
        j = i
        while j + 1 < len(ctx.slides) and _layout_key(ctx.slides[j + 1]) == _layout_key(ctx.slides[i]):
            j += 1
        n = j - i + 1
        if n > mx:
            at = ctx.slides[i + mx]
            emit(ctx, out, "D8.rhythm", slide=at.get("id"), el=at.get("id"), vars={"count": n, "type": ctx.slides[i].get("type"), "max": mx})
        i = j + 1


def gate_c7(ctx: Ctx, out: list) -> None:
    hist = ctx.history
    if not hist:
        return
    with_cta = [s for s in ctx.slides if is_obj(s.get("cta"))]
    kind = with_cta[-1]["cta"].get("kind") if with_cta else None
    hook = ctx.spec.get("hook")
    family = hook.get("family") if is_obj(hook) else None
    variety_sev = "NOTE" if (ctx.spec.get("ext") or {}).get("source") == "creator-script" else None
    if kind and ctx.active("C7.cta-repeat"):
        recent = hist[-ctx.param("C7.cta-repeat")["window"]:]
        if any(e.get("cta") == kind for e in recent):
            emit(ctx, out, "C7.cta-repeat", sev=variety_sev, vars={"kindAr": _kind_name(kind, "ar"), "kindEn": _kind_name(kind, "en")})
    if family and ctx.active("C7.family-repeat"):
        recent = hist[-ctx.param("C7.family-repeat")["window"]:]
        if any(e.get("family") == family for e in recent):
            emit(ctx, out, "C7.family-repeat", sev=variety_sev, vars={"family": family})
    if ctx.active("C7.hook-similar"):
        cover = cover_text(ctx.spec)
        best = 0.0
        if cover:
            for e in hist:
                t = e["cover"] if non_empty(e.get("cover")) else e["text"] if non_empty(e.get("text")) else ""
                if t:
                    best = max(best, cstext.similarity(cover, strip(t)))
        if best >= ctx.param("C7.hook-similar")["max"]:
            emit(ctx, out, "C7.hook-similar", vars={"score": js_round(best * 100)})
    limits = ctx.family_limits
    if family and limits and is_obj(limits.get(family)) and ctx.active("C7.max-use"):
        lim = limits[family]
        take = max(0, lim["posts"] - 1)
        recent = (hist[-take:] if take else [])
        if sum(1 for e in recent if e.get("family") == family) + 1 > lim["count"]:
            emit(ctx, out, "C7.max-use", vars={"family": family})


def _starts_text(plain: str, m: dict) -> bool:
    lead = next((i for i, ch in enumerate(plain) if unicodedata.category(ch)[0] in ("L", "N")), -1)
    return lead < 0 or m["start"] <= lead


def gate_c8(ctx: Ctx, out: list) -> None:
    fields = prose_fields(ctx)
    for cid in ("C8.ai-words", "C8.stock-opener", "C8.translationese", "C8.stiff-msa", "C8.hype", "C8.abstract"):
        if not ctx.active(cid):
            continue
        entries = ctx.list_entries(ctx.param(cid).get("list"))
        if not entries:
            continue
        for f in fields:
            slide = next((s for s in ctx.slides if s.get("id") == f["slide"]), None) if f["slide"] else None
            if cid == "C8.stock-opener":
                if slide:
                    opener = (slide.get("type") in ("cover", "poster") or ctx.pos.get(slide.get("id")) == 1) and f["field"] == "headline"
                else:
                    opener = f["key"] == "caption.firstLine"
                if not opener:
                    continue
            plain = strip(f["text"])
            for m in rules.entries_match(entries, plain, **ctx.match_kwargs()):
                if cid == "C8.stock-opener" and not _starts_text(plain, m):
                    continue
                emit(ctx, out, cid, slide=f["slide"] or None, el=f["key"], sev=m["entry"].get("sev"), vars={"text": m["text"]})


def _originality_words(s: str) -> list[str]:
    t = rules.fold(str(s)).text.lower()
    for a, b in (("أ", "ا"), ("إ", "ا"), ("آ", "ا"), ("ٱ", "ا"), ("ى", "ي"), ("ة", "ه"), ("ؤ", "و"), ("ئ", "ي")):
        t = t.replace(a, b)
    t = to_western(t)
    words, cur = [], []
    for ch in t:
        if unicodedata.category(ch)[0] in ("L", "N"):
            cur.append(ch)
        elif cur:
            words.append("".join(cur))
            cur = []
    if cur:
        words.append("".join(cur))
    return words


def _word_grams(words: list[str], n: int) -> set:
    return {" ".join(words[i:i + n]) for i in range(len(words) - n + 1)}


def gate_c10(ctx: Ctx, out: list) -> None:
    if not ctx.active("C10.overlap-block") and not ctx.active("C10.overlap"):
        return
    p = ctx.param("C10.overlap-block")
    sources = [x for x in ctx.spec.get("sources") or [] if is_obj(x) and x.get("kind") in ("url", "file") and non_empty(x.get("excerpt"))]
    if not sources:
        return
    src: set = set()
    for x in sources:
        src |= _word_grams(_originality_words(x["excerpt"]), p["ngram"])
    if not src:
        return
    units = [{"slide": s.get("id"), "el": s.get("id"), "text": " ".join(slide_strings(s, False, False))} for s in ctx.slides]
    pack = ctx.spec.get("captionPack")
    if is_obj(pack):
        units.append({"slide": None, "el": "caption",
                      "text": " ".join(x for x in (pack.get("firstLine"), pack.get("keywordLine"), pack.get("body"), pack.get("cta")) if non_empty(x))})
    for u in units:
        g = _word_grams(_originality_words(u["text"]), p["ngram"])
        if len(g) < p["minGrams"]:
            continue
        ratio = sum(1 for x in g if x in src) / len(g)
        cid = "C10.overlap-block" if ratio >= p["blockAt"] else "C10.overlap" if ratio >= p["fixAt"] else None
        if cid and ctx.active(cid):
            emit(ctx, out, cid, slide=u["slide"], el=u["el"], vars={"el": u["el"], "pct": js_round(ratio * 100)})


# ---- C9 -----------------------------------------------------------------------------------------------------------------
def gate_c9(ctx: Ctx, out: list) -> None:
    spec = ctx.spec
    has_pack = is_obj(spec.get("captionPack"))
    if not has_pack and ckpt_index(ctx.checkpoint) < ckpt_index("design"):
        return
    pack = spec["captionPack"] if has_pack else {}
    caption = assemble_caption(spec)
    chars = cc(caption)
    if ctx.active("C9.length"):
        p = ctx.param("C9.length")
        lo, hi = p["range"]
        if chars < lo or chars > hi:
            in_fast = ctx.fast and p["fastRange"][0] <= chars <= p["fastRange"][1]
            if in_fast:
                if ctx.active("C9.short-caption"):
                    emit(ctx, out, "C9.short-caption", el="caption", vars={"count": chars, "min": lo})
            else:
                emit(ctx, out, "C9.length", el="caption", vars={"count": chars, "min": lo, "max": hi})
    if ctx.active("C9.length-hard"):
        units = len(cstext.normalize(caption).encode("utf-16-le")) // 2
        mx = ctx.param("C9.length-hard")["max"]
        if units > mx:
            emit(ctx, out, "C9.length-hard", el="caption", vars={"count": units, "max": mx})
    if ctx.active("C9.first-line") and non_empty(pack.get("firstLine")):
        n, mx = cc(pack["firstLine"]), ctx.param("C9.first-line")["max"]
        if n > mx:
            emit(ctx, out, "C9.first-line", el="caption.firstLine", vars={"count": n, "max": mx})
    if ctx.active("C9.first-line-similarity") and non_empty(pack.get("firstLine")):
        cover = cover_text(spec)
        if cover:
            sim = cstext.similarity(strip(pack["firstLine"]), cover)
            if sim >= ctx.param("C9.first-line-similarity")["max"]:
                emit(ctx, out, "C9.first-line-similarity", el="caption.firstLine", vars={"score": js_round(sim * 100)})
    if ctx.active("C9.keyword-line") and not non_empty(pack.get("keywordLine")):
        emit(ctx, out, "C9.keyword-line", el="caption.keywordLine")
    if ctx.active("C9.hashtags"):
        n = sum(1 for t in cstext.tokenize(caption) if t["kind"] == "tag")
        mx = ctx.param("C9.hashtags")["max"]
        if n > mx:
            emit(ctx, out, "C9.hashtags", el="caption.hashtags", vars={"count": n, "max": mx})
    if ctx.active("C9.hashtags-form") and isinstance(pack.get("hashtags"), list):
        seen: set = set()
        for i, h in enumerate(pack["hashtags"]):
            key = cstext.normalize(str(h)).lower()
            if not re.fullmatch("#[^ \\t\\n\\r\\f\\v\\u00A0\\u202F#]+", str(h)) or key in seen:
                emit(ctx, out, "C9.hashtags-form", el=f"caption.hashtags.{i}", vars={"text": str(h)})
            seen.add(key)
    per = pack.get("perSlide") if isinstance(pack.get("perSlide"), list) else []
    alt = pack.get("alt") if isinstance(pack.get("alt"), list) else []
    for i, s in enumerate(ctx.slides):
        n, sid = i + 1, s.get("id")
        if ctx.active("C9.per-slide", s) and ctx.param("C9.per-slide").get("required") is not False:
            if i >= len(per) or not non_empty(per[i]):
                emit(ctx, out, "C9.per-slide", slide=sid, el=f"caption.perSlide.{i}", vars={"n": n})
            elif ctx.active("C9.per-slide-length", s):
                length, mx = cc(per[i]), ctx.param("C9.per-slide-length")["max"]
                if length > mx:
                    emit(ctx, out, "C9.per-slide-length", slide=sid, el=f"caption.perSlide.{i}", vars={"n": n, "count": length, "max": mx})
        if ctx.active("C9.alt-missing", s) and ctx.param("C9.alt-missing").get("required") is not False:
            if i >= len(alt) or not non_empty(alt[i]):
                emit(ctx, out, "C9.alt-missing", slide=sid, el=f"caption.alt.{i}", vars={"n": n})
            else:
                length = cc(alt[i])
                hard = ctx.param("C9.alt-length-hard")["max"]
                soft = ctx.param("C9.alt-length")
                if length > hard:
                    emit(ctx, out, "C9.alt-length-hard", slide=sid, el=f"caption.alt.{i}", vars={"n": n, "count": length, "max": hard})
                elif length > soft["max"] and ctx.active("C9.alt-length", s):
                    emit(ctx, out, "C9.alt-length", slide=sid, el=f"caption.alt.{i}", vars={"n": n, "count": length, "max": soft["max"]})


# ---- O1, N1, B1 (text) --------------------------------------------------------------------------------------------------
O1_SKIP_CHECKS = ("mixed-digits", "persian-digits", "percent-sign", "lam-latin-stranded", "number-noun-unbound")


def _rule_slug(rule_id: str) -> str:
    return re.sub("^-+|-+\\Z", "", re.sub("[^a-z0-9-]+", "-", str(rule_id).lower()))


def _bind_labels(ctx: Ctx) -> lint.LabelMatcher:
    texts = [e["text"] for e in ctx.list_entries("bindLabels") if non_empty(e.get("text"))]
    return lint.LabelMatcher(texts or lint.LINT_BIND_LABELS, ctx.clitics)


def gate_o1(ctx: Ctx, out: list) -> None:
    if not ctx.active("O1.ortho") and not ctx.active("O1.deny-marker") and not ctx.active("O1.warn-marker"):
        return
    allow = lint.allow_set(((ctx.brand or {}).get("voice") or {}).get("allow"))
    for f in lint_fields(ctx):
        slide = next((s for s in ctx.slides if s.get("id") == f["slide"]), None) if f["slide"] else None
        plain = lint_plain(f)
        issues = lint.lint_text(plain, dialect=ctx.dialect, digits=ctx.digits, allow=allow, skip=O1_SKIP_CHECKS,
                                kashida_word=(slide.get("kashidaWord") if slide and f["field"] == "headline" else "") or "")
        seen: set = set()
        for it in issues:
            key = f"{it['rule']}|{it['original']}"
            if key in seen:
                continue
            seen.add(key)
            if it.get("kind") == "dialect":
                cid = "O1.deny-marker" if it["rule"] == "deny-marker" else "O1.warn-marker"
                if not ctx.active(cid):
                    continue
                suggest = f" («{it['fix']}»)" if it.get("fix") else ""
                emit(ctx, out, cid, slide=f["slide"] or None, el=f["key"], sev=it["sev"], vars={"text": it["original"], "suggest": suggest})
                continue
            if not ctx.active("O1.ortho"):
                continue
            fix = it.get("fix")
            vars_ = {"original": it["original"], "fix": "" if fix is None else fix, "text": it["original"]}
            kw: dict = {"slide": f["slide"] or None, "el": f["key"], "sev": it["sev"], "rule": "O1." + _rule_slug(it["rule"]), "vars": vars_}
            msg = it.get("msg")
            if is_obj(msg) and non_empty(msg.get("ar")) and non_empty(msg.get("en")):
                kw["msg"] = msg
            if fix is None:
                kw["fix"] = {"ar": "راجع الكلمة وصحّحها.", "en": "Review the word and correct it."}
            emit(ctx, out, "O1.ortho", **kw)


_DIGIT_SYSTEM_NAMES = {"western": ("أرقام غربية 123", "Western digits 123"), "arabic-indic": ("أرقام هندية ١٢٣", "Arabic-Indic digits ١٢٣")}


def gate_n1(ctx: Ctx, out: list) -> None:
    fields = []
    for s in ctx.slides:
        fields += slide_fields(s)
    fields += caption_fields(ctx.spec, True)
    names = _DIGIT_SYSTEM_NAMES.get(ctx.digits, _DIGIT_SYSTEM_NAMES["western"])
    for f in fields:
        plain = strip(f["text"])
        info = lint.digit_systems(plain)
        base = {"slide": f["slide"] or None, "el": f["key"]}
        count = int(info["western"]) + int(info["arabicIndic"]) + int(info["persian"])
        if info["persian"]:
            if ctx.active("N1.persian"):
                emit(ctx, out, "N1.persian", **base)
        elif count > 1:
            if ctx.active("N1.mixed"):
                emit(ctx, out, "N1.mixed", **base)
        elif count == 1:
            system = "western" if info["western"] else "arabic-indic"
            if system != ctx.digits and ctx.active("N1.system"):
                emit(ctx, out, "N1.system", vars={"systemAr": names[0], "systemEn": names[1]}, **base)
        if ctx.active("N1.percent") and lint.builtin("percent-sign", plain, digits=ctx.digits):
            emit(ctx, out, "N1.percent", **base)


def gate_b1_text(ctx: Ctx, out: list) -> None:
    if not ctx.active("B1.stranded-lam") and not ctx.active("B1.unbound-pair"):
        return
    labels = _bind_labels(ctx)
    for f in lint_fields(ctx):
        plain = lint_plain(f)
        base = {"slide": f["slide"] or None, "el": f["key"]}
        if ctx.active("B1.stranded-lam"):
            for it in lint.builtin("lam-latin-stranded", plain):
                emit(ctx, out, "B1.stranded-lam", vars={"text": plain[max(0, it["start"] - 4):it["end"] + 12]}, **base)
        if ctx.active("B1.unbound-pair") and not f["key"].startswith("caption.") and lint.builtin("number-noun-unbound", plain, bind_labels=labels):
            emit(ctx, out, "B1.unbound-pair", **base)


# ---- B2 -----------------------------------------------------------------------------------------------------------------
def _placeholder_key(s) -> str:
    """A handle, name or label as the placeholder lists compare it: NFC, lower case, marks and punctuation folded away."""
    t = unicodedata.normalize("NFC", "" if s is None else str(s)).lower()
    t = re.sub("[\u064B-\u065F\u0670\u0640]", "", t)
    return re.sub("[\\W_]+", " ", t).strip()


def _is_placeholder_chrome(raw, kind: str, P: dict) -> bool:
    text = str(raw)
    if any(tok in text for tok in P["templateTokens"]):
        return True
    key = _placeholder_key(text)
    if not key:
        return True
    squashed = key.replace(" ", "")
    if any(c in squashed for c in P["contains"]):
        return True
    if kind == "handle":
        return squashed in P["handles"]
    if kind == "name":
        return key in P["names"]
    return key in P["labels"]


def gate_b2(ctx: Ctx, out: list) -> None:
    """The handle, brand name and series label print in the header of every slide, the MP4 and the PDF, and no other gate reads them."""
    if not ctx.active("B2.placeholder-chrome"):
        return
    P = ctx.param("B2.placeholder-chrome")
    brand = ctx.brand if is_obj(ctx.brand) else {}
    style = ctx.spec.get("style") if is_obj(ctx.spec.get("style")) else {}
    fields = (("handle", brand.get("handle"), "الحساب", "handle"),
              ("name", brand.get("name"), "اسم البراند", "brand name"),
              ("label", style.get("metaLabel"), "عنوان السلسلة", "series label"))
    for kind, raw, ar, en in fields:
        if non_empty(raw) and _is_placeholder_chrome(raw, kind, P):
            emit(ctx, out, "B2.placeholder-chrome", vars={"fieldAr": ar, "fieldEn": en, "text": raw})


# ---- SRC1 ---------------------------------------------------------------------------------------------------------------
_UNIT_PREFIXES = ("وبال", "وال", "بال", "كال", "فال", "ولل", "لل", "ال", "و", "ف", "ب", "ل", "ك")


def _unit_index(units: dict) -> dict:
    idx = {}
    for cat, words in (units or {}).items():
        for w in words or ():
            idx[re.sub("\\s+", " ", lint.fold_key(w).lower())] = cat
    return idx


def _word_unit(word: str, idx: dict):
    if word in idx:
        return idx[word]
    for p in _UNIT_PREFIXES:
        if len(word) > len(p) + 1 and word.startswith(p) and word[len(p):] in idx:
            return idx[word[len(p):]]
    return None


def find_claims(text: str, P: dict, idx: dict, labels) -> list[dict]:
    toks = cstext.tokenize(text)
    out = []
    for i, t in enumerate(toks):
        if t["kind"] != "number":
            continue
        value = norm_number(t["text"])
        if not value:
            continue
        p = i - 1
        if p >= 0 and toks[p]["kind"] == "space":
            p -= 1
        if p >= 0 and toks[p]["kind"] == "ar" and labels.has(toks[p]["text"]):
            continue
        why, unit_text, glued = None, "", False
        if re.search("[%\\u066A]\\Z", t["text"]):
            why = "percent"
        elif re.match("[$\\u20AC\\u00A3]", t["text"]):
            why = "currency"
        else:
            sfx = re.search("[A-Za-z]+\\Z", t["text"])
            if sfx:
                cat = idx.get(sfx.group(0).lower())
                if cat and (cat != "magnitude" or float(value) >= P["magnitudeMinValue"]):
                    why = cat
        if not why:
            j = i + 1
            if j < len(toks) and toks[j]["kind"] == "space":
                j += 1
            n1 = toks[j] if j < len(toks) else None
            if n1 and n1["kind"] == "punct" and n1["text"] in ("٪", "%"):
                why, glued, unit_text = "percent", True, n1["text"]
            elif n1 and n1["kind"] in ("ar", "latin"):
                w1 = lint.fold_key(n1["text"]).lower()
                cat = _word_unit(w1, idx)
                if cat:
                    unit_text = n1["text"]
                if not cat and j + 2 < len(toks) and toks[j + 1]["kind"] == "space" and toks[j + 2]["kind"] == "ar":
                    cat = idx.get(w1 + " " + lint.fold_key(toks[j + 2]["text"]).lower())
                    if cat:
                        unit_text = n1["text"] + " " + toks[j + 2]["text"]
                if cat:
                    why = cat
        if not why:
            continue
        int_val = int(value) if re.fullmatch("[0-9]+", value) else None
        if why == "time" and int_val is not None and P["yearMin"] <= int_val <= P["yearMax"]:
            continue
        out.append({"text": (t["text"] + (("" if glued else " ") + unit_text if unit_text else "")).strip(), "value": value, "why": why})
    return out


def numbers_in(text) -> set:
    t = re.sub("([0-9])[,\\u066C](?=[0-9]{3}(?![0-9]))", "\\1", to_western(str(text)))
    return {norm_number(m) for m in re.findall("[0-9]+(?:[.\\u066B][0-9]+)?", t)}


def source_material(x: dict) -> str:
    parts = [x.get("excerpt"), x.get("location"), x.get("formula")]
    if x.get("kind") in ("user", "ownData"):
        parts.append(x.get("ref"))
    return " ".join(p for p in parts if non_empty(p))


def gate_src1(ctx: Ctx, out: list) -> None:
    if not (ctx.active("SRC1.missing") or ctx.active("SRC1.mismatch") or ctx.active("SRC1.unverified")):
        return
    P = ctx.param("SRC1.missing")
    idx = _unit_index(P.get("units"))
    labels = _bind_labels(ctx)
    sources = [x for x in ctx.spec.get("sources") or [] if is_obj(x)]
    by_id = {x.get("id"): x for x in sources}
    any_material = [numbers_in(source_material(x)) for x in sources]
    in_any = lambda v: any(v in s for s in any_material)  # noqa: E731
    sourced: set = set()
    for s in ctx.slides:
        sid = s.get("id")
        claims = []
        if is_obj(s.get("number")) and non_empty(s["number"].get("value")):
            claims.append({"text": number_text(s), "value": norm_number(s["number"]["value"]), "el": f"{sid}.number"})
        for f in slide_fields(s):
            if f["field"] in ("number", "sides.label"):
                continue
            for c in find_claims(strip(f["text"]), P, idx, labels):
                claims.append({"text": c["text"], "value": c["value"], "el": f["key"]})
        if not claims:
            continue
        ids = list(s.get("sourceIds") or []) + ([s["number"]["sourceId"]] if is_obj(s.get("number")) and s["number"].get("sourceId") else [])
        linked = [by_id[i] for i in ids if by_id.get(i)]
        reported: set = set()
        for c in claims:
            base = {"slide": sid, "el": c["el"], "vars": {"text": c["text"]}}
            if not linked:
                if in_any(c["value"]):
                    sourced.add(c["value"])
                elif "m" + c["value"] not in reported and ctx.active("SRC1.missing"):
                    reported.add("m" + c["value"])
                    emit(ctx, out, "SRC1.missing", **base)
                continue
            sourced.add(c["value"])
            for x in linked:
                if x.get("verified") is False and "u" + str(x.get("id")) not in reported and ctx.active("SRC1.unverified"):
                    reported.add("u" + str(x.get("id")))
                    emit(ctx, out, "SRC1.unverified", **base)
            readable = [n for n in (numbers_in(source_material(x)) for x in linked if x.get("kind") != "calc") if n]
            if readable and not any(c["value"] in n for n in readable) and "x" + c["value"] not in reported and ctx.active("SRC1.mismatch"):
                reported.add("x" + c["value"])
                emit(ctx, out, "SRC1.mismatch", **base)
    for f in caption_fields(ctx.spec, False):
        if f["field"] == "perSlide":
            continue
        for c in find_claims(strip(f["text"]), P, idx, labels):
            if c["value"] not in sourced and not in_any(c["value"]) and ctx.active("SRC1.missing"):
                emit(ctx, out, "SRC1.missing", el=f["key"], vars={"text": c["text"]})


# ---- SEN1 ---------------------------------------------------------------------------------------------------------------
def gate_sen1(ctx: Ctx, out: list) -> None:
    fields = prose_fields(ctx)
    if ctx.active("SEN1.gulf-name"):
        p = ctx.param("SEN1.gulf-name")
        countries = (((ctx.brand or {}).get("locale")) or {}).get("countries") or []
        gcc = ctx.dialect == "gulf" or any(c in p["countries"] for c in countries)
        if gcc:
            entries = [{"id": f"t{i}", "text": t, "match": "phrase"} for i, t in enumerate(p["terms"])]
            for f in fields:
                m = first_match(ctx, entries, strip(f["text"]))
                if m:
                    emit(ctx, out, "SEN1.gulf-name", slide=f["slide"] or None, el=f["key"], vars={"text": m["text"]})
    if ctx.active("SEN1.conspiracy"):
        entries = ctx.list_entries(ctx.param("SEN1.conspiracy")["list"])
        for f in fields:
            m = first_match(ctx, entries, strip(f["text"]))
            if m:
                emit(ctx, out, "SEN1.conspiracy", slide=f["slide"] or None, el=f["key"], vars={"text": m["text"]})
    if ctx.active("SEN1.fear-stacking"):
        p = ctx.param("SEN1.fear-stacking")
        entries = ctx.list_entries(p["list"])
        if entries:
            groups: dict = {}
            for f in fields:
                g = f["slide"] or "caption"
                for m in rules.entries_match(entries, strip(f["text"]), **ctx.match_kwargs()):
                    groups.setdefault(g, set()).add(m["entry"].get("id") or lint.fold_key(m["text"]))
            for g, ids in groups.items():
                if len(ids) >= p["minDistinct"]:
                    emit(ctx, out, "SEN1.fear-stacking", slide=None if g == "caption" else g, el=g, vars={"el": g, "count": len(ids)})
    if ctx.active("SEN1.religious-promo") and (ctx.spec.get("contentType") == "soft-sell" or ctx.spec.get("intent") == "sell"):
        res = [cstext.portable_regex(p) for p in ctx.param("SEN1.religious-promo")["patterns"]]
        for f in fields:
            plain = strip(f["text"])
            if any(rx.search(plain) for rx in res):
                emit(ctx, out, "SEN1.religious-promo", slide=f["slide"] or None, el=f["key"])


# ---- run ----------------------------------------------------------------------------------------------------------------
TEXT_GATES = (("C1", gate_c1), ("C2", gate_c2), ("C3", gate_c3), ("C4", gate_c4), ("C5", gate_c5), ("C6", gate_c6), ("C7", gate_c7),
              ("C8", gate_c8), ("C9", gate_c9), ("C10", gate_c10), ("O1", gate_o1), ("N1", gate_n1), ("B1", gate_b1_text),
              ("B2", gate_b2), ("SRC1", gate_src1), ("SEN1", gate_sen1), ("D8", gate_d8))


def _finding_key(f: dict) -> str:
    return "|".join([f.get("gate", ""), f.get("rule", ""), f.get("slide") or "", f.get("el") or ""])


def _dedupe(results: list) -> list:
    seen, out = set(), []
    for f in results:
        k = _finding_key(f) + "|" + f["msg"]["en"]
        if k not in seen:
            seen.add(k)
            out.append(f)
    return out


COVER_LENGTH = ("C1.hero-words", "C1.total-words", "C1.lines")


def _carry_overrides(spec: dict, results: list) -> list:
    prior = (spec.get("qa") or {}).get("results") if is_obj(spec.get("qa")) else None
    marks = {_finding_key(p): p["overridden"] for p in (prior or []) if is_obj(p) and is_obj(p.get("overridden"))}
    if not marks:
        return results
    # The cover's length rules are one decision («keep my 7-word hook»): an override of one covers the others on that slide.
    length = {p.get("slide"): p["overridden"] for p in (prior or []) if is_obj(p) and is_obj(p.get("overridden")) and p.get("rule") in COVER_LENGTH}
    out = []
    for f in results:
        m = marks.get(_finding_key(f)) or (length.get(f.get("slide")) if f.get("rule") in COVER_LENGTH else None)
        if m and report.is_overridable(f["rule"]) and not f.get("overridden"):
            f = {**f, "overridden": {"reason": m.get("reason"), "at": m.get("at")}}
        out.append(f)
    return out


def _sort(spec: dict, idx: dict, results: list) -> list:
    gate_idx = {g: i for i, g in enumerate(idx["order"])}
    pos = {s.get("id"): i for i, s in enumerate(spec.get("slides") or [])}

    def slide_pos(f):
        return pos[f["slide"]] if f.get("slide") in pos else (999 if f.get("slide") else -1)

    keyed = [(SEV_RANK[f["sev"]], gate_idx.get(f["gate"], 99), slide_pos(f), _sort_text(f.get("el") or ""), _sort_text(f.get("rule") or ""), i, f)
             for i, f in enumerate(results)]
    keyed.sort(key=lambda k: k[:6])
    return [k[6] for k in keyed]


class Results(list):
    """The findings of a run, plus ``stats``: ``{"gates": {gate id: times it ran}}`` (``CS.qa.runText(...).stats`` in the
    JavaScript twin). A gate that ran and found nothing is counted too, so "no findings" can be told from "never ran"."""

    stats: dict


def run_text_gates(spec: dict, brand: dict | None = None, *, gates=None, fast: bool = False, history=None,
                   family_limits: dict | None = None, slides=None) -> Results:
    """The text-scope findings of ``spec`` (``QAResult`` dicts), sorted by severity, gate order, slide, element, rule."""
    if not is_obj(spec):
        raise CSError("E_USAGE", "QA needs a spec object")
    ctx = Ctx(spec, brand, history, gates, fast, family_limits, slides)
    out: list = []
    executed: dict = {}
    for gate in ctx.idx["gates"].values():
        executed[gate["id"]] = 0
        for check in gate.get("checks", []):
            if check.get("scope") in ("spec", "rendered") or re.fullmatch(r"D9|D10|D11|VA[0-9]+", gate["id"]):
                executed[check["id"]] = 0
    for gate_id, runner in TEXT_GATES:
        if ctx.want(gate_id):
            executed[gate_id] = executed.get(gate_id, 0) + 1
            runner(ctx, out)
    results = _dedupe(out)
    if ctx.slide_filter:
        results = [f for f in results if f.get("slide") and f["slide"] in ctx.slide_filter]
    found = Results(_sort(spec, ctx.idx, _carry_overrides(spec, results)))
    found.stats = {"gates": executed}
    return found
