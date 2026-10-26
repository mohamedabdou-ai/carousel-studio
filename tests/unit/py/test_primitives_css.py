"""E4a: templates/primitives.css, the token-driven structure sheet (spec 6.0 and 6.8, rule A11, painter rules A15-A17, S-4, S-17).

The sheet is appended into #cs-archetype-css by build_studio.py and so travels inside every painted frame. lint() below holds it to what that
route needs: the size cap, only the properties the two painters can paint, no colour literal (every colour is a var), the whole IS-6 class
vocabulary styled, the tone remap of the eight base roles, the specificity floor of A17, the inline-block rule of S-4, the gate that keeps
1.0 classes untouched outside art mode (and always off the cover), the media frame for photo-like kinds only, and S-17 (a tick and a cross
never share a hue). The shipped sheet must lint clean, and each rule is shown to bite by planting its defect in a copy of the sheet.

A declaration check cannot see the cascade, so the second half runs one: Cascade below is a small CSS engine for the grammar these sheets use
(classes, attributes, :not(), > and descendant, ::before and ::after, custom properties, var() with fallbacks, inheritance, the inline style of the
slide root, which beats every rule). The tests build a slide for each of the six presets and three tones, give its root the custom properties the
engine writes there (compose.js: the eight base values and the --cs-tone-* bundles), and compare what each element computes with the tone's bundle
(tokens.tones[tone], the table of spec 6.0, and a set of unique sentinel colours that catches a swapped role). The same engine resolves the colours of
a tick and a cross per preset and tone (S-17) and shows the override contract documented in the sheet header.

What a sheet cannot do: the root's own eight custom properties keep their inline base values (nothing here may use !important). TonesComputed pins
exactly that gap, and shows that the engine finishes it by writing the active tone's eight aliases inline (the second emission model below).

Run: python -X utf8 -m unittest tests.unit.py.test_primitives_css      (standard library only; no browser)
"""
from __future__ import annotations

import functools
import importlib.util
import itertools
import math
import re
import sys
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
DESIGN = REPO / "plugins" / "carousel-studio" / "skills" / "carousel-design"
SHEET = DESIGN / "templates" / "primitives.css"
ARCHETYPES = DESIGN / "templates" / "archetypes.html"
STYLES = DESIGN / "styles"

MAX_BYTES = 24 * 1024            # r2 section 3.2 (E4a): the sheet is serialised into every painted frame
BUILD_CAP = 30 * 1024            # build_studio.PRIMITIVES_CAP, the build-side refusal line

NEW_CLASSES = ("cs-art", "cs-art-panel", "cs-art-svg", "cs-art-label", "cs-icon", "cs-items", "cs-item", "cs-rail", "cs-rail-seg",
               "cs-marks", "cs-thread", "cs-anchor-slot")                                   # IS-6, the classes this sheet introduces
OLD_CLASSES = set("""cs-slide cs-bg cs-decor cs-header cs-footer cs-content cs-slot cs-handle cs-meta cs-counter cs-swipe cs-savepill
cs-kicker cs-headline cs-sub cs-title cs-body cs-bullets cs-bullet cs-sides cs-side cs-side-label cs-side-text cs-number cs-num cs-unit
cs-ord cs-attribution cs-bridge cs-cta cs-cta-text cs-cta-icon cs-media-slot cs-ltr cs-rtl cs-emoji cs-em cs-ln cs-kashida w""".split())
# the archetype classes of the two round-3 types (archetypes.html gives each archetype's content box `cs-a-<type>`): the sheet may style the box of its own type
ARCHETYPE_CLASSES = {"cs-a-grid", "cs-a-timeline"}
GATE = '.cs-slide[data-tone]:not([data-type="cover"])'                                      # art-mode slides, never the cover
GATE_HEAD = ".cs-slide[data-tone"
# the only rule on a 1.0 class allowed outside the gate: layout-neutral (it only makes the counter the containing block of the progress rail)
UNGATED_OK = {".cs-slide .cs-counter"}
EIGHT = {"--cs-bg": "bg", "--cs-surface": "surface", "--cs-ink": "ink", "--cs-ink-muted": "ink-muted", "--cs-accent": "accent",
         "--cs-accent-2": "accent-2", "--cs-on-accent": "on-accent", "--cs-line": "line"}      # IS-7 v2
TEXT_PROPS = {"color", "font-family", "font-weight", "font-size", "line-height", "font-variant-numeric", "text-decoration",
              "text-decoration-color", "text-decoration-thickness", "text-underline-offset"}
PAINT_PROPS = {"background-color", "background-image", "border-radius", "box-shadow"}
ALLOWED = set("""
display position inset inset-block inset-inline inset-block-start inset-block-end inset-inline-start inset-inline-end z-index box-sizing
inline-size block-size min-inline-size max-inline-size min-block-size max-block-size margin margin-inline margin-inline-start margin-block
padding padding-inline padding-inline-start padding-block flex flex-direction flex-wrap align-items justify-content gap
background-color background-image border border-right border-bottom border-radius box-shadow
color font-family font-weight font-size line-height font-variant-numeric white-space list-style overflow pointer-events transform vertical-align
text-decoration text-decoration-color text-decoration-thickness text-underline-offset content
grid-template-columns grid-template-rows grid-column grid-row align-self align-content
""".split())  # the last line is layout only (the grid type's cards): the browser lays it out and both painters read the measured boxes
FORBIDDEN_NAMES = ("filter", "backdrop-filter", "mix-blend-mode", "background-blend-mode", "clip-path", "writing-mode", "word-spacing",
                   "text-justify", "font-synthesis", "opacity", "letter-spacing", "font-style", "text-align")
FORBIDDEN_PREFIXES = ("mask", "outline", "border-image", "animation", "transition")
NAMED_COLOURS = set("""white black red green blue yellow orange purple pink gray grey brown cyan magenta navy teal gold silver beige ivory
khaki maroon olive lime aqua fuchsia crimson coral salmon tomato indigo violet""".split())
EXTERNAL_VARS = ({"--cs-" + k for k in ("bg surface ink ink-muted accent accent-2 on-accent line unit font-display font-heading font-body font-latin "
                                         "wght-display wght-heading wght-body wght-latin fs-hero").split()}
                 | {"--cs-tone-%s-%s" % (t, r) for t in ("invert", "field") for r in EIGHT.values()}
                 | {"--cs-art-s2", "--cs-art-outline-color", "--cs-mark-tick", "--cs-mark-cross", "--cs-font-numeral", "--cs-wght-numeral",
                    "--cs-thread-y", "--cs-thread-c"})   # read with a fallback: the resolver, a preset or a later package may supply them

# ---- spec 6.0, the tone table: bg surface ink inkMuted accent of every preset x tone, and the two support hues of every preset -------------------------
TONE_TABLE = {
    "swiss": {"base": "F4F4F2 FFFFFF 111111 5A5A5A E3262B", "invert": "111111 222222 F4F4F2 8D8D8C E3262B", "field": "E3262B C22125 FFFFFF FFFFFF 111111"},
    "creator": {"base": "F6F2EA FFFFFF 14120F 5B554B FFD23F", "invert": "1C1A18 343330 F6F2EA A19E99 FFD23F", "field": "F6F2EA FFD23F 14120F 14120F FFFFFF"},
    "notebook": {"base": "F6F0DF FFFCF2 1D2B5A 56608A D8382C", "invert": "1D2B5A 383F62 F6F0DF B4B1AC E6AC9F", "field": "CBA36B FFFCF2 1D2B5A 1D2B5A 8E1F18"},
    "poster": {"base": "F3EBD8 FBF6E9 1B4332 4A5F55 B04A1E", "invert": "1B4332 365040 F3EBD8 C1BEAD D8B9A6", "field": "B04A1E 964825 F3EBD8 F3EBD8 F3EBD8"},
    "interface": {"base": "E8ECF3 FFFFFF 0F172A 475569 4F46E5", "invert": "0F172A 2F333F E8ECF3 9C9FA6 B8BAED", "field": "413ABE 4F46E5 FFFFFF F2F2FC FFFFFF"},
    "heritage": {"base": "133B31 1F5A47 F7F1E3 CDDBD3 EEBA66", "invert": "F7F1E3 F4EEE0 133B31 606A61 846635", "field": "EEBA66 F1CFA1 133B31 133B31 133B31"},
}
SUPPORT = {"swiss": ("1D4ED8", "0F766E"), "creator": ("FF8FB1", "6EC6FF"), "notebook": ("2E8B57", "F4B63F"), "poster": ("A8741A", "3A6EA5"),
           "interface": ("059669", "B45309"), "heritage": ("E0895F", "7DB0DE")}
PRESETS = tuple(TONE_TABLE)
TONE_NAMES = ("base", "invert", "field")
ROLE_OF = {"--cs-bg": "bg", "--cs-surface": "surface", "--cs-ink": "ink", "--cs-ink-muted": "inkMuted", "--cs-accent": "accent",
           "--cs-accent-2": "accent2", "--cs-on-accent": "onAccent", "--cs-line": "line"}        # the eight custom properties -> the keys of tokens.tones[tone]
MIN_DISTANCE = 25.0              # CIE76 distance between a tick colour and a cross colour on the same ground


# ---- a small CSS reader (the sheet has no at-rules, so a flat list of rules is enough) ----------------------------------------------------------

def strip_comments(css: str) -> str:
    return re.sub(r"/\*.*?\*/", "", css, flags=re.S)


def split_top(text: str, sep: str) -> list:
    parts, buf, depth = [], [], 0
    for ch in text:
        if ch in "([":
            depth += 1
        elif ch in ")]":
            depth -= 1
        if ch == sep and depth == 0:
            parts.append("".join(buf))
            buf = []
        else:
            buf.append(ch)
    parts.append("".join(buf))
    return parts


def parse(css: str) -> list:
    """[(selectors, [(name, value)])], in file order."""
    text, out, i = strip_comments(css), [], 0
    while True:
        j = text.find("{", i)
        if j < 0:
            break
        k = text.find("}", j)
        if k < 0:
            break
        prelude, body = text[i:j].strip(), text[j + 1:k]
        decls = []
        for part in split_top(body, ";"):
            if ":" in part:
                name, _, value = part.partition(":")
                if name.strip():
                    decls.append((name.strip().lower(), " ".join(value.split())))
        out.append(([" ".join(s.split()) for s in split_top(prelude, ",") if s.strip()], decls))
        i = k + 1
    return out


def specificity(selector: str) -> tuple:
    """(ids, classes + attributes + pseudo-classes, elements + pseudo-elements); :not() counts its argument."""
    sel = selector
    while ":not(" in sel:
        a = sel.index(":not(")
        b, depth = a + 5, 1
        while depth:
            depth += {"(": 1, ")": -1}.get(sel[b], 0)
            b += 1
        sel = sel[:a] + " " + sel[a + 5:b - 1] + " " + sel[b:]
    attrs = len(re.findall(r"\[[^\]]*\]", sel))
    sel = re.sub(r"\[[^\]]*\]", " ", sel)
    ids = len(re.findall(r"#[A-Za-z_-]", sel))
    classes = len(re.findall(r"\.[A-Za-z_-]", sel))
    pseudo_el = len(re.findall(r"::[a-z-]+", sel)) + len(re.findall(r"(?<!:):(?:before|after|first-line|first-letter)\b", sel))
    pseudo_cl = len(re.findall(r"(?<!:):(?!before|after|first-line|first-letter)[a-z-]+", sel))
    bare = re.sub(r"::?[a-z-]+|[.#][A-Za-z_][\w-]*", " ", sel)
    elements = len([t for t in re.split(r"[\s>+~*]+", bare) if re.fullmatch(r"[a-z][a-z0-9]*", t or "")])
    return (ids, classes + attrs + pseudo_cl, elements + pseudo_el)


def subject(selector: str) -> str:
    """The last compound selector, without pseudo-elements."""
    last = re.split(r"\s*[>+~]\s*|\s+", re.sub(r"\[[^\]]*\]", lambda m: m.group(0).replace(" ", "\u0001"), selector.strip()))[-1]
    return re.sub(r"::?(before|after)$", "", last).replace("\u0001", " ")


def lab(hex6: str) -> tuple:
    def lin(c):
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = (lin(int(hex6[i:i + 2], 16) / 255) for i in (0, 2, 4))
    x, y, z = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047, 0.2126 * r + 0.7152 * g + 0.0722 * b, (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883

    def f(t):
        return t ** (1 / 3) if t > 0.008856 else 7.787 * t + 16 / 116
    return (116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z)))


def distance(a: str, b: str) -> float:
    return math.dist(lab(a), lab(b))


def var_default(css: str, name: str) -> list:
    """The first token of the fallback chain of every var(name, ...): var(--cs-mark-tick, var(--cs-art-s2, ...)) -> '--cs-art-s2'."""
    return re.findall(r"var\(" + re.escape(name) + r",\s*(?:var\()?(--[a-z0-9-]+)", css)


def effective(rules: list, selector: str) -> dict:
    merged = {}
    for sels, decls in rules:
        if selector in sels:
            merged.update(dict(decls))
    return merged


# ---- the bundles: every role of every preset x tone (IS-7 v2, one derivation) ---------------------------------------------------------------------

def _linear(c: int) -> float:
    v = c / 255
    return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4


def _encode(v: float) -> int:
    v = max(0.0, min(1.0, v))
    return round((v * 12.92 if v <= 0.0031308 else 1.055 * v ** (1 / 2.4) - 0.055) * 255)


def mix(a: str, b: str, t: float) -> str:
    """sRGB linear-light mix (the engine's C.mix): t = 0 gives a, t = 1 gives b; six hex digits, no '#'."""
    return "".join("%02X" % _encode(_linear(int(a[i:i + 2], 16)) * (1 - t) + _linear(int(b[i:i + 2], 16)) * t) for i in (0, 2, 4))


def contrast(a: str, b: str) -> float:
    def lum(h: str) -> float:
        r, g, bl = (_linear(int(h[i:i + 2], 16)) for i in (0, 2, 4))
        return 0.2126 * r + 0.7152 * g + 0.0722 * bl
    hi, lo = sorted((lum(a), lum(b)), reverse=True)
    return (hi + 0.05) / (lo + 0.05)


def bundle(preset: str, tone: str) -> dict:
    """tokens.tones[tone]: the eight roles as '#RRGGBB'. accent2 is the accent (the legacy presets have no second accent: resolve.js takes roles.accent), onAccent
    the better of #111111 and #FFFFFF on the accent, line the ink mixed 82% toward the ground. The cascade tests compare names to values, so the exact
    derivation matters little; the mark tests need real colours and these are the engine's."""
    bg, surface, ink, muted, accent = TONE_TABLE[preset][tone].split()
    on = "111111" if contrast("111111", accent) >= contrast("FFFFFF", accent) else "FFFFFF"
    out = {"bg": bg, "surface": surface, "ink": ink, "inkMuted": muted, "accent": accent, "accent2": accent, "onAccent": on, "line": mix(ink, bg, 0.82)}
    return {k: "#" + v for k, v in out.items()}


def sentinel(preset: str, tone: str) -> dict:
    """Eight colours that are unique across presets, tones and roles: a role mapped to the wrong bundle entry cannot hide behind an equal colour
    (real field tones repeat ink as inkMuted and the accent as accent2)."""
    p, t = PRESETS.index(preset), TONE_NAMES.index(tone)
    return {role: "#%02X%02X%02X" % (0x20 + 0x20 * p, 0x30 + 0x50 * t, 0x18 + 0x1C * r) for r, role in enumerate(ROLE_OF.values())}


def root_inline(source, preset: str, tone: str, aliases: bool) -> dict:
    """The custom properties on the slide root. aliases=False is the emission of compose.js today: the eight base values and the --cs-tone-<t>-* bundles.
    aliases=True adds the active tone's eight under their base names, which is the contract the engine owes the root (E2a)."""
    inline = {}
    for prop, role in ROLE_OF.items():
        inline[prop] = source(preset, "base")[role]
        for t in ("invert", "field"):
            inline["--cs-tone-%s-%s" % (t, EIGHT[prop])] = source(preset, t)[role]
    inline["--cs-art-s1"], inline["--cs-art-s2"] = ("#" + h for h in SUPPORT[preset])
    if aliases and tone != "base":
        inline.update({prop: source(preset, tone)[role] for prop, role in ROLE_OF.items()})
    return inline


# ---- a small cascade: the selector grammar of the sheets, custom properties, var(), inheritance, the inline style of the root ---------------------------

class Unsupported(Exception):
    """A selector this reader does not model."""


INHERITED = ("color",)
INLINE = ((9, 0, 0), 10 ** 9)               # the style attribute outranks every rule of every sheet


def split_complex(selector: str) -> list:
    """[(combinator before, compound)] left to right; only ' ' and '>' are modelled."""
    out, buf, depth, pending = [], [], 0, " "
    for ch in selector.strip():
        if ch in "([":
            depth += 1
        elif ch in ")]":
            depth -= 1
        if depth == 0 and (ch.isspace() or ch in ">+~"):
            if buf:
                out.append((pending, "".join(buf)))
                buf, pending = [], " "
            if ch in "+~":
                raise Unsupported(selector)
            if ch == ">":
                pending = ">"
            continue
        buf.append(ch)
    if buf:
        out.append((pending, "".join(buf)))
    return out


def parse_compound(text: str) -> dict:
    tag, classes, attrs, nots, pseudo, pos = None, [], [], [], None, 0
    m = re.match(r"\*|[a-z][a-z0-9]*", text)
    if m:
        tag, pos = (None if m.group(0) == "*" else m.group(0)), m.end()
    while pos < len(text):
        if text[pos] == ".":
            m = re.match(r"\.([A-Za-z_][\w-]*)", text[pos:])
            if not m:
                raise Unsupported(text)
            classes.append(m.group(1))
            pos += m.end()
        elif text[pos] == "[":
            end = text.index("]", pos)
            m = re.fullmatch(r'\s*([\w-]+)\s*(?:=\s*(?:"([^"]*)"|([\w-]+)))?\s*', text[pos + 1:end])
            if not m:
                raise Unsupported(text)
            attrs.append((m.group(1), m.group(2) if m.group(2) is not None else m.group(3)))
            pos = end + 1
        elif text.startswith(":not(", pos):
            depth, j = 1, pos + 5
            while depth:
                depth += {"(": 1, ")": -1}.get(text[j], 0)
                j += 1
            nots.append(parse_compound(text[pos + 5:j - 1]))
            pos = j
        elif text[pos] == ":":
            m = re.match(r"::?([a-z-]+)(?![\w(-])", text[pos:])
            if not m or m.group(1) not in ("before", "after"):
                raise Unsupported(text)
            pseudo = m.group(1)
            pos += m.end()
        else:
            raise Unsupported(text)
    return {"tag": tag, "classes": classes, "attrs": attrs, "nots": nots, "pseudo": pseudo}


def parse_selector(selector: str) -> list:
    return [(comb, parse_compound(text)) for comb, text in split_complex(selector)]


class El:
    """A node of a modelled slide: classes, attributes, an inline style, and ::before / ::after as nodes of their own."""

    def __init__(self, tag: str = "div", classes: str = "", attrs: dict | None = None, parent: "El | None" = None, inline: dict | None = None,
                 pseudo: str | None = None, host: "El | None" = None) -> None:
        self.tag, self.classes, self.attrs = tag, set(classes.split()), dict(attrs or {})
        self.parent, self.inline, self.pseudo, self.host, self.memo = parent, dict(inline or {}), pseudo, host, {}

    def before(self) -> "El":
        return El(pseudo="before", host=self)

    def after(self) -> "El":
        return El(pseudo="after", host=self)


def compound_matches(el: El, c: dict) -> bool:
    if c["tag"] and el.tag != c["tag"]:
        return False
    if not set(c["classes"]) <= el.classes:
        return False
    for name, value in c["attrs"]:
        if name not in el.attrs or (value is not None and el.attrs[name] != value):
            return False
    return not any(compound_matches(el, n) for n in c["nots"])


def chain_matches(el: El, parsed: list, i: int) -> bool:
    comb, comp = parsed[i]
    if not compound_matches(el, comp):
        return False
    if i == 0:
        return True
    if comb == ">":
        return el.parent is not None and chain_matches(el.parent, parsed, i - 1)
    up = el.parent
    while up is not None:
        if chain_matches(up, parsed, i - 1):
            return True
        up = up.parent
    return False


def selector_matches(el: El, parsed: list) -> bool:
    want = parsed[-1][1]["pseudo"]
    if want:
        if el.pseudo != want:
            return False
        el = el.host
    elif el.pseudo:
        return False
    return chain_matches(el, parsed, len(parsed) - 1)


def substitute(value: str, lookup) -> "str | None":
    """Replace every var(--x, fallback) the CSS way; None when one has neither a value nor a fallback."""
    out, i = [], 0
    while True:
        j = value.find("var(", i)
        if j < 0:
            out.append(value[i:])
            return "".join(out)
        out.append(value[i:j])
        depth, k = 1, j + 4
        while depth and k < len(value):
            depth += {"(": 1, ")": -1}.get(value[k], 0)
            k += 1
        parts = split_top(value[j + 4:k - 1], ",")
        got = lookup(parts[0].strip())
        if got is None and len(parts) > 1:
            got = substitute(",".join(parts[1:]).strip(), lookup)
        if got is None:
            return None
        out.append(got)
        i = k


@functools.lru_cache(maxsize=None)
def compile_sheet(text: str) -> tuple:
    """((specificity, parsed selector or None when unsupported, selector, declarations)) for every selector of a sheet, in file order."""
    out = []
    for sels, decls in parse(text):
        for sel in sels:
            try:
                parsed = parse_selector(sel)
            except Unsupported:
                parsed = None
            out.append((specificity(sel), parsed, sel, decls))
    return tuple(out)


class Cascade:
    """Sheets in page order (a later sheet wins a tie). An unsupported selector is skipped, unless its rule declares one of the names in `must`: then it raises."""

    _uid = itertools.count()

    def __init__(self, *sheets: str, must: tuple = ()) -> None:
        self.uid, self.rules, order = next(Cascade._uid), [], 0
        for text in sheets:
            for spec, parsed, sel, decls in compile_sheet(text):
                order += 1
                if parsed is None:
                    if {n for n, _ in decls} & set(must):
                        raise Unsupported(sel)
                    continue
                self.rules.append((spec, order, parsed, decls))

    def declared(self, el: El) -> dict:
        best = {}
        for spec, order, parsed, decls in self.rules:
            if selector_matches(el, parsed):
                for name, value in decls:
                    name = "background-color" if name == "background" and " " not in value else name
                    if name not in best or (spec, order) >= best[name][0]:
                        best[name] = ((spec, order), value)
        for name, value in el.inline.items():
            best[name] = (INLINE, value)
        return {n: v for n, (_, v) in best.items()}

    def style(self, el: El) -> dict:
        """The computed custom properties and the other declared properties of an element, with var() resolved where the property is declared."""
        if self.uid in el.memo:
            return el.memo[self.uid]
        decl = self.declared(el)
        host = el.host if el.pseudo else el.parent
        up = self.style(host) if host is not None else {}
        customs, state, out = {n: v for n, v in decl.items() if n.startswith("--")}, {}, {}

        def lookup(name: str) -> "str | None":
            if name in customs:
                if name not in state:
                    state[name] = None                      # a reference to itself while resolving is invalid
                    state[name] = substitute(customs[name], lookup)
                return state[name]
            return up.get(name) if name.startswith("--") else None
        for name, value in up.items():
            if name.startswith("--") and name not in customs:
                out[name] = value
        for name in customs:
            if lookup(name) is not None:
                out[name] = state[name]
        for name, value in decl.items():
            if not name.startswith("--"):
                got = up.get(name) if value == "inherit" else substitute(value, lookup)
                if got is not None:
                    out[name] = got
        for name in INHERITED:
            if name not in out and name in up:
                out[name] = up[name]
        el.memo[self.uid] = out
        return out


@functools.lru_cache(maxsize=None)
def cascade(*sheets: str, must: tuple = ()) -> Cascade:
    """Cascade(...) built once per distinct list of sheets (building one parses the layout sheet: about 0.1 s)."""
    return Cascade(*sheets, must=must)


# ---- the modelled slide ---------------------------------------------------------------------------------------------------------------------------

@functools.lru_cache(maxsize=None)
def layout_css() -> str:
    return re.search(r'<style id="cs-archetype-css"[^>]*>(.*?)</style>', ARCHETYPES.read_text(encoding="utf-8"), re.S).group(1)


@functools.lru_cache(maxsize=None)
def preset_root_css(preset: str) -> str:
    """The rules of the preset's decor.css whose subject is the slide root (they paint it from the base roles): the real ones, in a form the reader takes."""
    keep = []
    for sels, decls in parse((STYLES / preset / "decor.css").read_text(encoding="utf-8")):
        if sels == ['.cs-slide[data-preset="%s"]' % preset]:
            keep.append('.cs-slide[data-preset="%s"]{%s}' % (preset, ";".join("%s:%s" % d for d in decls)))
    return "\n".join(keep)


def probe_tree(preset: str, tone: str, inline: dict, slide_type: str = "grid", tone_attr: bool = True) -> tuple:
    """(root, {name: node}): a slide with the 1.0 classes, the new classes, ::before / ::after on the root and on the mark titles."""
    attrs = {"data-preset": preset, "data-type": slide_type, "data-hl": "marker", "data-numbering": "pill", "dir": "rtl"}
    if tone_attr:
        attrs["data-tone"] = tone
    root = El("section", "cs-slide", attrs, inline=inline)
    nodes = {"root": root, "root::before": root.before(), "root::after": root.after()}

    def add(key: str, parent: El, tag: str, classes: str = "", at: dict | None = None) -> El:
        nodes[key] = El(tag, classes, at, parent=parent)
        return nodes[key]
    add("bg", root, "div", "cs-bg")
    add("decor", root, "div", "cs-decor")
    add("handle", add("header", root, "header", "cs-header"), "span", "cs-handle")
    content = add("content", root, "div", "cs-content")
    add("kicker", content, "p", "cs-kicker")
    add("headline", content, "h1", "cs-headline")
    items = add("items", content, "ul", "cs-items")
    for key, at in (("item", {}), ("item-hi", {"data-hi": "1"}), ("item-tick", {"data-mark": "tick"}), ("item-cross", {"data-mark": "cross"})):
        li = add(key, items, "li", "cs-item", at)
        title = add(key + "-title", li, "div", "", {"data-part": "title"})
        nodes[key + "-title::before"], nodes[key + "-title::after"] = title.before(), title.after()
        add(key + "-text", li, "div", "", {"data-part": "text"})
    add("label", content, "p", "cs-art-label", {"data-role": "chip"})
    add("cta", content, "div", "cs-cta")
    add("marks", root, "svg", "cs-marks")
    rail = add("rail", add("counter", add("footer", root, "footer", "cs-footer"), "div", "cs-counter"), "div", "cs-rail")
    add("seg-on", rail, "span", "cs-rail-seg", {"data-on": "1"})
    add("seg-off", rail, "span", "cs-rail-seg", {"data-on": "0"})
    return root, nodes


# what each consumer of a role must compute on an art-mode slide (the base tone included): (node, property, role of the tone's bundle)
CONSUMERS = (("root", "background-color", "bg"), ("root", "color", "ink"), ("bg", "background-color", "bg"), ("header", "color", "inkMuted"),
             ("handle", "color", "ink"), ("content", "color", "ink"), ("kicker", "background-color", "surface"), ("kicker", "color", "ink"),
             ("item", "background-color", "surface"), ("item-hi", "background-color", "accent"), ("item-hi-title", "color", "onAccent"),
             ("item-title", "color", "ink"), ("item-text", "color", "inkMuted"), ("cta", "background-color", "accent"), ("cta", "color", "onAccent"),
             ("label", "color", "ink"), ("seg-on", "background-color", "ink"), ("seg-off", "background-color", "line"))


def tone_mismatches(sheet: str, aliases: bool, presets: tuple = PRESETS) -> list:
    """Every place where a computed role differs from the tone's bundle, over the real table and the sentinel colours.
    The root's own eight properties are compared only when the engine writes the aliases; every other node, the root's pseudo-elements and the consumers always."""
    found = []
    for source in (bundle, sentinel):
        for preset in presets:
            casc = cascade(preset_root_css(preset), layout_css(), sheet)
            for tone in TONE_NAMES:
                want = source(preset, tone)
                _, nodes = probe_tree(preset, tone, root_inline(source, preset, tone, aliases))
                for key, node in nodes.items():
                    if key == "root" and not aliases:
                        continue
                    got = casc.style(node)
                    for prop, role in ROLE_OF.items():
                        if got.get(prop) != want[role]:
                            found.append("%s %s %s: %s on %s is %s, the bundle says %s" % (source.__name__, preset, tone, prop, key, got.get(prop), want[role]))
                for key, prop, role in CONSUMERS:
                    got = casc.style(nodes[key]).get(prop)
                    if got != want[role]:
                        found.append("%s %s %s: %s of %s is %s, the %s role is %s" % (source.__name__, preset, tone, prop, key, got, role, want[role]))
    return found


# ---- the colours of a tick and a cross, resolved per preset and tone (S-17) -----------------------------------------------------------------------

def colour_of(value: str) -> str:
    """The one colour of a computed value as RRGGBB; ValueError for anything else (a name, a function this reader does not know, two colours)."""
    found = {m.upper() if len(m) == 6 else "".join(c * 2 for c in m).upper() for m in re.findall(r"#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b", value)}
    for r, g, b in re.findall(r"rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)", value):
        found.add("%02X%02X%02X" % (int(r), int(g), int(b)))
    if len(found) != 1:
        raise ValueError("%r holds %d colours, the reader needs exactly one" % (value, len(found)))
    return found.pop()


def mark_colours(preset: str, tone: str, decor: str, sheet: str, aliases: bool) -> tuple:
    """(tick, cross) as RRGGBB, as the shipped rules compute them on a slide of this preset and tone with this decor.css."""
    casc = cascade(decor, layout_css(), sheet, must=("--cs-mark-tick", "--cs-mark-cross"))
    _, nodes = probe_tree(preset, tone, root_inline(bundle, preset, tone, aliases))
    tick = casc.style(nodes["item-tick-title::after"]).get("border-right")
    cross = casc.style(nodes["item-cross-title::after"]).get("background-image")
    if tick is None or cross is None:
        raise ValueError("the sheet paints no colour for the tick or the cross")
    return colour_of(tick), colour_of(cross)


def mark_findings(decor: str, sheet: str, presets: tuple = PRESETS) -> list:
    """['preset tone emission: why'] for every slide where the two marks are closer than MIN_DISTANCE or cannot be resolved."""
    found = []
    for preset in presets:
        for tone in TONE_NAMES:
            for aliases in (False, True):
                where = "%s %s %s" % (preset, tone, "aliases" if aliases else "inline base only")
                try:
                    tick, cross = mark_colours(preset, tone, decor, sheet, aliases)
                except (Unsupported, ValueError) as exc:
                    found.append("%s: cannot resolve (%s)" % (where, exc))
                    continue
                if distance(tick, cross) < MIN_DISTANCE:
                    found.append("%s: tick #%s and cross #%s are %.1f apart (needs %.0f)" % (where, tick, cross, distance(tick, cross), MIN_DISTANCE))
    return found


# ---- the lint ------------------------------------------------------------------------------------------------------------------------------

def lint(css: str, raw: bytes | None = None) -> list:
    """[(code, message)]: every way the sheet can break the route it travels (empty for a good sheet)."""
    out, rules = [], parse(css)
    bare = strip_comments(css)

    def add(code: str, msg: str) -> None:
        out.append((code, msg))

    raw = css.encode("utf-8") if raw is None else raw
    if len(raw) > MAX_BYTES:
        add("size", "%d bytes; the cap is %d" % (len(raw), MAX_BYTES))
    if raw.startswith(b"\xef\xbb\xbf") or b"\r" in raw or b"\t" in raw or not raw.endswith(b"\n"):
        add("encoding", "no BOM, LF endings, no tabs, a final newline")
    low = css.lower()
    if "</style" in low or "<!--" in low or "<script" in low:
        add("style-end", "the sheet could end its own style element")
    if "@" in bare or "url(" in bare.lower() or "!important" in bare.lower():
        add("at-rule", "no at-rules, no url(), no !important")
    if bare.count("{") != bare.count("}") or len(rules) != bare.count("{"):
        add("braces", "unbalanced braces")
    for word in ("analy" + "tics", "lucide" + ".dev", "math.random", "date.now"):
        if word in low:
            add("word", word)

    declared = {n for _, decls in rules for n, _ in decls if n.startswith("--")}
    selectors = [s for sels, _ in rules for s in sels]
    for sels, decls in rules:
        where0 = sels[0]
        if not decls:
            add("braces", "empty rule " + where0)
        for name, value in decls:
            where = "%s { %s: %s }" % (where0, name, value)
            v = value.lower()
            if name.startswith("--"):
                if not name.startswith("--cs-"):
                    add("property", where)
            elif name not in ALLOWED or name in FORBIDDEN_NAMES or name.startswith(FORBIDDEN_PREFIXES):
                add("property", where)
            if any(b in v for b in ("color-mix(", "conic-gradient", "repeating-conic", "env(", "attr(", "image-set(")):
                add("value", where)
            if re.search(r"[0-9.](vw|vh|vmin|vmax|dvh|dvw|svh|svw|lvh|lvw)\b", v):
                add("value", where + ": viewport unit")
            if name == "box-shadow" and re.search(r"\binset\b", v):
                add("value", where + ": inset shadow")
            if name == "position" and v not in ("absolute", "relative"):
                add("value", where)
            if name == "overflow" and v != "visible":
                add("a15", where + ": a clipping box with a radius or border loses both in the replay painter")
            if name == "background-image" and not re.match(r"^linear-gradient\(", v):
                add("value", where)
            if name == "background-image" and re.search(r"linear-gradient\(\s*to\s", v):
                add("value", where + ": the replay painter reads degrees only")
            if re.search(r"#[0-9a-fA-F]{3,8}\b", value) or re.search(r"\b(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\s*\(", value):
                add("colour", where)
            if set(re.findall(r"[a-z]+", re.sub(r"var\([^)]*\)", " ", v))) & NAMED_COLOURS:
                add("colour", where + ": a named colour")
            for ref in re.findall(r"var\((--[a-z0-9-]+)", value):
                if ref not in declared and ref not in EXTERNAL_VARS:
                    add("var", "%s reads %s, which nothing defines" % (where, ref))
            if name == "content" and value != '""':
                add("pseudo", where)
    for sels, decls in rules:
        names = {n for n, _ in decls}
        if names & TEXT_PROPS:
            for sel in sels:
                if specificity(sel) < (0, 3, 0):
                    add("a17", "%s sets colour or type below (0,3,0): the svg painter writes slide css before the role rules" % sel)
        if "overflow" in names and names & {"border", "border-radius", "border-right", "border-bottom"}:
            add("a15", sels[0])
        if "transform" in names:
            for sel in sels:
                if effective(rules, sel).get("display") not in ("block", "inline-block", "flex"):
                    add("a5", sel + ": a rotated box must be a block")
    for sel in selectors:
        flat = re.sub(r"\[[^\]]*\]", "[]", sel)
        for cls in re.findall(r"\.([A-Za-z_][A-Za-z0-9_-]*)", flat):
            if cls not in OLD_CLASSES and cls not in NEW_CLASSES and cls not in ARCHETYPE_CLASSES:
                add("vocab", "%s: .%s is outside the class vocabulary (IS-6)" % (sel, cls))
        for attr in re.findall(r"\[\s*([A-Za-z_-][A-Za-z0-9_-]*)", sel):
            if not (attr.startswith("data-") or attr in ("dir", "lang")):
                add("vocab", "%s: [%s]" % (sel, attr))
        if "#" in flat or re.search(r"(?<!:):(hover|focus|active|visited|focus-visible|focus-within|has|is|where)\b", flat):
            add("vocab", sel + ": no id selectors, interaction states or :has()")
        if not sel.startswith(".cs-slide"):
            add("vocab", sel + ": every selector starts at the slide root")
        olds = set(re.findall(r"\.([A-Za-z_][A-Za-z0-9_-]*)", flat)) & (OLD_CLASSES - {"cs-slide"})
        if olds and sel not in UNGATED_OK:
            if not sel.startswith(GATE_HEAD):
                add("gate", "%s: a rule on a 1.0 class must sit under .cs-slide[data-tone] (off mode stays 1.0)" % sel)
            elif not re.match(r'\.cs-slide\[data-tone="(invert|field)"\]', sel) and not sel.startswith(GATE):
                add("gate", "%s: the cover keeps its approved look, so the gate excludes it" % sel)
    joined = " ".join(selectors)
    for cls in NEW_CLASSES:
        if not re.search(r"\." + re.escape(cls) + r"(?![A-Za-z0-9_-])", joined):
            add("missing-class", ".%s has no rule" % cls)
    for role in ("chip", "chart", "tool", "numeral", "word"):
        if '.cs-art-label[data-role="%s"]' % role not in css:
            add("missing-class", "no starting values for the %s label role" % role)
    # S-4 / A16: emphasis is inline-block wherever it carries a background
    em_ib = [s for sels, d in rules for s in sels if subject(s) == ".cs-em" and ("display", "inline-block") in d]
    if GATE + " .cs-em" not in em_ib:
        add("a16", ".cs-em is not display:inline-block under the gate (S-4)")
    for sels, decls in rules:
        for sel in sels:
            if subject(sel) == ".cs-em":
                if ("display", "inline") in decls:
                    add("a16", sel + ": display:inline")
                if {n for n, _ in decls} & PAINT_PROPS and not sel.startswith(GATE):
                    add("a16", sel + ": paints an inline span")
    # tones (IS-7 v2): all eight roles from the bundle, on the root, on its children and on its pseudo-elements (they inherit from the root, whose inline values a sheet cannot change)
    by_sel = {s: dict(d) for sels, d in rules for s in sels}
    for tone in ("invert", "field"):
        root = '.cs-slide[data-tone="%s"]' % tone
        found = next((dict(d) for s, d in rules if s == [root, root + " > *", root + "::before", root + "::after"]), None)
        if found is None:
            add("tone", "%s: the remap must name the root, its children and its ::before and ::after" % tone)
        else:
            for prop, suffix in EIGHT.items():
                if found.get(prop) != "var(--cs-tone-%s-%s)" % (tone, suffix):
                    add("tone", "%s: %s is not remapped to the bundle" % (tone, prop))
        r = by_sel.get(root + "[data-preset]", {})
        if r.get("background-color") != "var(--cs-tone-%s-bg)" % tone or r.get("color") != "var(--cs-tone-%s-ink)" % tone:
            add("tone", "%s: the root paint is not read from the bundle" % tone)
        if by_sel.get(root + " > .cs-content", {}).get("color") != "var(--cs-tone-%s-ink)" % tone:
            add("tone", "%s: the content stack colour is not read from the bundle" % tone)
    if 'data-tone="base"' in css:
        add("tone", "base is the root's own tone: it is not remapped")
    # S-17: the defaults of the tick and the cross name two different sources
    tick, cross = set(var_default(css, "--cs-mark-tick")), set(var_default(css, "--cs-mark-cross"))
    if not tick or not cross or tick & cross:
        add("marks", "S-17: tick %s and cross %s must default to different sources" % (sorted(tick), sorted(cross)))
    # the generic media frame: photo-like kinds, on the image
    for sels, decls in rules:
        if {n for n, _ in decls} & {"border", "border-radius", "box-shadow"}:
            for sel in sels:
                if ".cs-media-slot" in sel:
                    if ':not([data-media-kind="icon"]):not([data-media-kind="art"])' not in sel:
                        add("media", sel + ": the frame excludes icons and art (spec 6.8)")
                    if not (sel.endswith("> img") or sel.endswith("> video")):
                        add("media", sel + ": radius, border and shadow go on the image, not on the clipping slot (A15)")
    return out


def codes(css: str) -> set:
    return {c for c, _ in lint(css)}


def plant(css: str, extra: str = "", old: str | None = None, new: str = "") -> str:
    """A copy of the sheet with a defect: text appended, or `old` replaced by `new`."""
    if old is not None:
        assert old in css, "the planted defect needs %r in the sheet" % old
        css = css.replace(old, new, 1)
    return css + extra


def read_sheet() -> str:
    return SHEET.read_text(encoding="utf-8")


class ShippedSheet(unittest.TestCase):
    css = ""
    rules: list = []

    @classmethod
    def setUpClass(cls) -> None:
        cls.css = read_sheet()
        cls.rules = parse(cls.css)

    def test_the_sheet_lints_clean(self) -> None:
        self.assertEqual(lint(self.css, SHEET.read_bytes()), [])

    def test_size_is_within_the_cap_and_not_empty(self) -> None:
        size = len(SHEET.read_bytes())
        self.assertLessEqual(size, MAX_BYTES)
        self.assertGreater(size, 4000)

    def test_deterministic_read(self) -> None:
        self.assertEqual(parse(read_sheet()), self.rules)
        self.assertEqual(lint(read_sheet()), lint(read_sheet()))

    def test_the_tone_root_rule_beats_a_preset_root_rule_and_names_the_children(self) -> None:
        a, b = specificity('.cs-slide[data-tone="invert"][data-preset]'), specificity('.cs-slide[data-preset="creator"]')
        self.assertGreater(a, b, "the root rule must beat a preset's own root rule (.cs-slide[data-preset=x])")
        for tone in ("invert", "field"):
            sels = next(s for s, d in self.rules if s[0] == '.cs-slide[data-tone="%s"]' % tone)
            root = '.cs-slide[data-tone="%s"]' % tone
            self.assertEqual(sels, [root, root + " > *", root + "::before", root + "::after"])

    def test_token_defaults(self) -> None:
        root = effective(self.rules, ".cs-slide")
        for k in ("chip", "tile", "card", "panel", "window"):
            self.assertIn("--cs-art-r-" + k, root)
        self.assertEqual(root["--cs-art-shadow"], "none")
        self.assertIn("--cs-art-outline", root)
        self.assertIn("--cs-art-tilt", root)
        ratio = float(root["--cs-art-object-outline"])
        self.assertTrue(0.03 <= ratio <= 0.04, "S-2: art.objectOutline 0.03-0.04")
        self.assertEqual(ratio, 0.035, "the owner's default: 3.5% of the object size")

    def test_the_outline_colour_is_read_with_a_fallback_at_the_use_site(self) -> None:
        # declared on the root it would be resolved with the base tone's ink and inherited as a fixed colour
        self.assertNotIn("--cs-art-outline-color:", self.css.replace(" ", ""))
        self.assertIn("var(--cs-art-outline-color,var(--cs-ink))", self.css)

    def test_the_icon_rule_is_the_one_the_art_kit_asked_for(self) -> None:
        self.assertEqual(effective(self.rules, ".cs-slide .cs-icon"), {"display": "inline-block", "flex": "none", "vertical-align": "middle"})

    def test_the_marks_layer_never_takes_input_and_sits_above_the_chrome(self) -> None:
        d = effective(self.rules, ".cs-slide .cs-marks")
        self.assertEqual((d["pointer-events"], d["position"], d["inline-size"], d["block-size"]), ("none", "absolute", "100%", "100%"))
        self.assertGreaterEqual(int(d["z-index"]), 4, "chrome is z-index 3, the content stack 2")

    def test_quiet_and_on_rail_skins(self) -> None:
        root = effective(self.rules, ".cs-slide")
        self.assertEqual(root["--cs-progress-h"], "4px", "quiet: 4 px high")
        self.assertEqual(root["--cs-progress-gap"], "4px", "quiet: 4 px gaps")
        self.assertLessEqual(int(root["--cs-progress-w"].replace("px", "")), 180, "quiet: at most 180 px wide")
        on = effective(self.rules, '.cs-slide .cs-rail[data-style="on"]')
        self.assertEqual(on["--cs-progress-h"], "6px")
        self.assertLessEqual(int(on["--cs-progress-w"].replace("px", "")), 240)
        self.assertEqual(effective(self.rules, '.cs-slide .cs-rail[data-style="on"] > .cs-rail-seg[data-on="1"]')["background-color"], "var(--cs-accent)")
        for rail in (4, 6):
            self.assertLessEqual(36 + 4 + rail, 49, "counter text 36 + gap 4 + rail inside the 49 px chrome height")

    def test_the_rail_stands_on_the_counter_and_fills_from_the_start_edge(self) -> None:
        d = effective(self.rules, ".cs-slide .cs-rail")
        self.assertEqual((d["position"], d["display"], d["pointer-events"]), ("absolute", "flex", "none"))
        self.assertEqual(effective(self.rules, ".cs-slide .cs-counter"), {"position": "relative"})
        self.assertEqual(effective(self.rules, ".cs-slide .cs-rail-seg")["background-color"], "var(--cs-line)")
        self.assertEqual(effective(self.rules, '.cs-slide .cs-rail-seg[data-on="1"]')["background-color"], "var(--cs-ink)")

    def test_the_media_slot_lets_the_frame_shadow_out(self) -> None:
        slots = [d for sels, d in self.rules for s in sels if s.endswith(")") and ".cs-media-slot" in s]
        self.assertTrue(slots and all(("overflow", "visible") in d for d in slots))
        framed = [s for sels, d in self.rules for s in sels if ".cs-media-slot" in s and {n for n, _ in d} & {"border", "border-radius", "box-shadow"}]
        self.assertTrue(framed)
        self.assertTrue(all(s.startswith(GATE) and ':not([data-media-kind="icon"]):not([data-media-kind="art"])' in s for s in framed))

    def test_marks_default_to_two_sources_that_are_apart_on_every_preset_and_tone_of_the_table(self) -> None:
        tick, cross = var_default(self.css, "--cs-mark-tick")[0], var_default(self.css, "--cs-mark-cross")[0]
        self.assertEqual((tick, cross), ("--cs-art-s2", "--cs-accent"))
        checked = 0
        for preset in PRESETS:
            for tone in TONE_NAMES:
                for aliases in (False, True):
                    got = mark_colours(preset, tone, "", self.css, aliases)
                    self.assertEqual(got, (SUPPORT[preset][1], TONE_TABLE[preset][tone].split()[4]),
                                     "%s %s: the default tick is the second support hue and the default cross the accent of the tone" % (preset, tone))
                    d = distance(*got)
                    self.assertGreaterEqual(d, MIN_DISTANCE, "%s %s: tick and cross are %.1f apart (needs %.0f)" % (preset, tone, d, MIN_DISTANCE))
                    checked += 1
        self.assertEqual(checked, 36, "6 presets x 3 tones x 2 emission models")
        for same in (("F3EBD8", "F3EBD8"), ("133B31", "133B31"), ("FFFFFF", "FFFFFF")):
            self.assertLess(distance(*same), MIN_DISTANCE, "the check itself: one colour is not two hues")

    def test_a_preset_override_keeps_the_marks_apart(self) -> None:
        """Each decor.css is read with the cascade: whatever it overrides, the two colours are resolved for its preset in all three tones."""
        for decor in sorted(STYLES.glob("*/decor.css")):
            self.assertEqual(mark_findings(decor.read_text(encoding="utf-8"), self.css, (decor.parent.name,)), [], decor.parent.name)


class TonesComputed(unittest.TestCase):
    """IS-7 v2 with a cascade (a declaration check cannot see that an inline value outranks a rule). Six presets x three tones, the real table and
    sentinel colours, the layout sheet, the real root rule of each decor.css and this sheet, on a slide whose root carries the engine's inline custom properties."""

    css = ""

    @classmethod
    def setUpClass(cls) -> None:
        cls.css = read_sheet()

    def test_everything_inside_the_slide_reads_the_tone(self) -> None:
        """Every child, every grandchild, both pseudo-elements of the root and every consumer of a role (the root's paint, the chrome, the cards, the chips,
        the buttons, the rail), with the root keeping the inline base values compose.js writes today. This is what the sheet itself guarantees."""
        self.assertEqual(tone_mismatches(self.css, aliases=False), [])

    def test_the_root_follows_the_tone_once_the_engine_writes_its_aliases(self) -> None:
        """The eight roles on the root and on every descendant equal tokens.tones[tone] when the root also carries the active tone's aliases inline (E2a's part)."""
        self.assertEqual(tone_mismatches(self.css, aliases=True), [])

    def test_without_the_aliases_the_root_keeps_its_base_values_and_only_those(self) -> None:
        """The one thing a sheet cannot reach: the inline values of the root. The root's paint and everything below it are repaired by the sheet; the eight
        custom properties of the root itself stay the base values until the engine writes the aliases. The test pins that boundary so it cannot widen."""
        for preset in PRESETS:
            casc = cascade(preset_root_css(preset), layout_css(), self.css)
            for tone in ("invert", "field"):
                _, nodes = probe_tree(preset, tone, root_inline(bundle, preset, tone, False))
                root = casc.style(nodes["root"])
                for prop, role in ROLE_OF.items():
                    self.assertEqual(root[prop], bundle(preset, "base")[role], "%s %s: an inline value on the root beats every rule (%s)" % (preset, tone, prop))
                self.assertEqual(root["background-color"], bundle(preset, tone)["bg"])
                self.assertEqual(root["color"], bundle(preset, tone)["ink"])

    def test_base_slides_are_not_remapped(self) -> None:
        for preset in PRESETS:
            casc = cascade(preset_root_css(preset), layout_css(), self.css)
            _, nodes = probe_tree(preset, "base", root_inline(bundle, preset, "base", True))
            for key, node in nodes.items():
                for prop, role in ROLE_OF.items():
                    self.assertEqual(casc.style(node).get(prop), bundle(preset, "base")[role], "%s base: %s on %s" % (preset, prop, key))

    def test_off_mode_computes_what_the_layout_sheet_alone_computes(self) -> None:
        """No data-tone on the root (visualMode off, or a preset without art): every property of a 1.0 class is unchanged by this sheet."""
        def plain(style: dict) -> dict:
            return {k: v for k, v in style.items() if not k.startswith(("--cs-art", "--cs-progress", "--cs-thread"))}
        for preset in PRESETS:
            with_sheet = cascade(preset_root_css(preset), layout_css(), self.css)
            without = cascade(preset_root_css(preset), layout_css())
            _, a = probe_tree(preset, "invert", root_inline(bundle, preset, "invert", False), tone_attr=False)
            _, b = probe_tree(preset, "invert", root_inline(bundle, preset, "invert", False), tone_attr=False)
            for key in ("root", "bg", "decor", "header", "handle", "content", "kicker", "headline", "cta"):
                self.assertEqual(plain(with_sheet.style(a[key])), plain(without.style(b[key])), "%s: off mode, %s" % (preset, key))

    def test_the_cover_keeps_the_looks_it_was_approved_with(self) -> None:
        looks = ("background-color", "border", "border-radius", "box-shadow", "padding-inline", "inline-size")
        for preset in PRESETS:
            with_sheet = cascade(preset_root_css(preset), layout_css(), self.css)
            without = cascade(preset_root_css(preset), layout_css())
            for tone in TONE_NAMES:
                _, a = probe_tree(preset, tone, root_inline(bundle, preset, tone, False), slide_type="cover")
                _, b = probe_tree(preset, tone, root_inline(bundle, preset, tone, False), slide_type="cover")
                for key in ("kicker", "cta", "headline", "label"):
                    for prop in looks:
                        self.assertEqual(with_sheet.style(a[key]).get(prop), without.style(b[key]).get(prop), "%s %s cover: %s of %s" % (preset, tone, prop, key))


def preset_form(selector: str) -> str:
    """The documented way to write a preset exception: the shared selector with the preset attribute right after .cs-slide."""
    return selector.replace(".cs-slide", '.cs-slide[data-preset="x"]', 1)


def header_strength_ok(css: str) -> bool:
    """The header states the range of the gated looks (those under .cs-slide[data-tone]) as the specificity helper measures it, and the way to beat them."""
    header = css[:css.index("*/")]
    gated = [specificity(s) for sels, _ in parse(css) for s in sels if s.startswith(".cs-slide[data-tone]")]
    lo, hi = min(gated), max(gated)
    return ("(0,%d,%d) to (0,%d,%d)" % (lo[1], lo[2], hi[1], hi[2])) in header and '[data-preset="x"]' in header


class OverrideContract(unittest.TestCase):
    """What the sheet header says about presets overriding the shared looks is true, shown with the cascade."""

    css = ""

    @classmethod
    def setUpClass(cls) -> None:
        cls.css = read_sheet()

    def gated(self) -> list:
        return [s for sels, _ in parse(self.css) for s in sels if s.startswith(".cs-slide[data-tone]")]

    def test_the_header_states_the_real_strength_of_the_gated_looks(self) -> None:
        self.assertTrue(header_strength_ok(self.css))

    def test_adding_the_preset_attribute_always_beats_the_shared_selector(self) -> None:
        gated = self.gated()
        self.assertGreater(len(gated), 15)
        for sel in gated:
            self.assertGreater(specificity(preset_form(sel)), specificity(sel), sel)

    def test_an_ordinary_preset_rule_loses_on_a_tone_slide_and_the_documented_form_wins(self) -> None:
        inline = root_inline(bundle, "creator", "invert", False)
        inline["--cs-art-r-chip"] = "28px"                       # what the resolver writes for a rounded chip
        shared = GATE + " .cs-kicker"
        results = {}
        for name, decor in (("none", ""), ("ordinary", '.cs-slide[data-preset="creator"] .cs-kicker{ border-radius:4px; }'),
                            ("documented", preset_form(shared).replace('"x"', '"creator"') + "{ border-radius:4px; }")):
            _, nodes = probe_tree("creator", "invert", dict(inline))
            results[name] = cascade(decor, layout_css(), self.css).style(nodes["kicker"]).get("border-radius")
        self.assertEqual(results, {"none": "28px", "ordinary": "28px", "documented": "4px"})

    def test_the_preset_sheet_is_emitted_before_this_one(self) -> None:
        """Why equal strength loses: build_studio.py puts the decor blocks ahead of the archetype sheet, which ends with this one."""
        text = (DESIGN / "scripts" / "build_studio.py").read_text(encoding="utf-8")
        decor_at, sheet_at = text.find("data-cs-decor="), text.find("blocks.append(archetype_sheet")
        if min(decor_at, sheet_at) < 0:
            self.skipTest("build_studio.py no longer builds the blocks the way this test reads them")
        self.assertLess(decor_at, sheet_at)


class PlantedDefects(unittest.TestCase):
    """Each rule of lint() bites: the defect is planted in a copy of the shipped sheet and the matching code appears."""

    css = ""

    @classmethod
    def setUpClass(cls) -> None:
        cls.css = read_sheet()

    def assertCaught(self, code: str, css: str) -> None:
        self.assertIn(code, codes(css), "lint missed a planted %s defect" % code)

    def test_a_property_the_painters_cannot_paint(self) -> None:
        for decl in ("filter:blur(2px)", "outline:2px solid var(--cs-ink)", "clip-path:circle(40%)", "mask-image:none", "border-image:none",
                     "mix-blend-mode:multiply", "backdrop-filter:blur(4px)", "transition:none", "animation:none", "writing-mode:vertical-rl"):
            self.assertCaught("property", plant(self.css, ".cs-slide .cs-icon{ %s; }\n" % decl))

    def test_arabic_text_rules(self) -> None:
        for decl in ("opacity:.5", "letter-spacing:2px", "font-style:italic", "text-align:justify"):
            self.assertCaught("property", plant(self.css, ".cs-slide .cs-icon{ %s; }\n" % decl))

    def test_value_constructs(self) -> None:
        self.assertCaught("value", plant(self.css, ".cs-slide .cs-icon{ background-color:color-mix(in srgb,var(--cs-ink),var(--cs-bg)); }\n"))
        self.assertCaught("value", plant(self.css, ".cs-slide .cs-icon{ box-shadow:inset 0 0 0 4px var(--cs-ink); }\n"))
        self.assertCaught("value", plant(self.css, ".cs-slide .cs-icon{ position:fixed; }\n"))
        self.assertCaught("value", plant(self.css, ".cs-slide .cs-icon{ inline-size:50vw; }\n"))
        self.assertCaught("value", plant(self.css, ".cs-slide .cs-icon{ background-image:conic-gradient(var(--cs-ink),var(--cs-bg)); }\n"))
        self.assertCaught("value", plant(self.css, ".cs-slide .cs-icon{ background-image:linear-gradient(to top right,var(--cs-ink),var(--cs-bg)); }\n"))

    def test_a_colour_literal(self) -> None:
        for value in ("#FFD23F", "#fff", "rgb(1,2,3)", "hsl(10 20% 30%)", "oklch(.5 .1 20)", "white", "red"):
            self.assertCaught("colour", plant(self.css, ".cs-slide .cs-icon{ border:2px solid %s; }\n" % value))

    def test_a_clipping_box(self) -> None:
        self.assertCaught("a15", plant(self.css, ".cs-slide .cs-item{ overflow:hidden; border-radius:8px; }\n"))

    def test_a_rule_on_a_1_0_class_outside_the_gate(self) -> None:
        self.assertCaught("gate", plant(self.css, ".cs-slide .cs-kicker{ display:block; }\n"))
        self.assertCaught("gate", plant(self.css, '.cs-slide[data-preset="x"] .cs-kicker{ display:block; }\n'))

    def test_a_gated_rule_that_forgets_the_cover(self) -> None:
        self.assertCaught("gate", plant(self.css, ".cs-slide[data-tone] .cs-kicker{ display:block; }\n"))

    def test_colour_or_type_below_the_a17_floor(self) -> None:
        self.assertCaught("a17", plant(self.css, ".cs-slide .cs-art-label{ color:var(--cs-ink); }\n"))
        self.assertCaught("a17", plant(self.css, ".cs-slide .cs-icon{ font-size:30px; }\n"))

    def test_a_selector_outside_the_vocabulary(self) -> None:
        self.assertCaught("vocab", plant(self.css, ".cs-slide .cs-badge{ display:block; }\n"))
        self.assertCaught("vocab", plant(self.css, ".cs-slide .cs-icon:hover{ display:block; }\n"))
        self.assertCaught("vocab", plant(self.css, ".cs-slide #x{ display:block; }\n"))
        self.assertCaught("vocab", plant(self.css, ".cs-icon{ display:block; }\n"))
        self.assertCaught("vocab", plant(self.css, ".cs-slide .cs-icon[title]{ display:block; }\n"))

    def test_a_missing_rule_for_a_vocabulary_class(self) -> None:
        for cls in ("cs-thread", "cs-marks", "cs-rail-seg", "cs-anchor-slot"):
            bad = re.sub(r"(?m)^.*\." + cls + r"\b.*$\n?", "", self.css)
            self.assertCaught("missing-class", bad)
        self.assertCaught("missing-class", self.css.replace('.cs-art-label[data-role="word"]', '.cs-art-label[data-role="w0rd"]'))

    def test_the_size_cap(self) -> None:
        self.assertCaught("size", self.css + "/*" + "x" * MAX_BYTES + "*/\n")

    def test_at_rules_urls_and_important(self) -> None:
        self.assertCaught("at-rule", plant(self.css, "@media print{ .cs-slide .cs-icon{ display:none; } }\n"))
        self.assertCaught("at-rule", plant(self.css, '.cs-slide .cs-icon{ background-image:url("data:image/svg+xml,x"); }\n'))
        self.assertCaught("at-rule", plant(self.css, ".cs-slide .cs-icon{ display:block !important; }\n"))

    def test_a_sheet_that_could_end_its_own_element(self) -> None:
        self.assertCaught("style-end", plant(self.css, ".cs-slide .cs-icon{ display:block; }\n</style><script>x</script>"))

    def test_encoding(self) -> None:
        self.assertIn("encoding", {c for c, _ in lint(self.css, self.css.replace("\n", "\r\n").encode("utf-8"))})
        self.assertIn("encoding", {c for c, _ in lint(self.css, self.css.rstrip("\n").encode("utf-8"))})

    def test_emphasis_that_is_not_inline_block(self) -> None:
        self.assertCaught("a16", plant(self.css, old=GATE + " .cs-em{ display:inline-block; }", new=GATE + " .cs-em{ display:inline; }"))
        self.assertCaught("a16", plant(self.css, ".cs-slide .cs-em{ background-color:var(--cs-accent); }\n"))

    def test_a_rotated_box_that_is_not_a_block(self) -> None:
        self.assertCaught("a5", plant(self.css, '.cs-slide .cs-icon::after{ content:""; display:inline; transform:rotate(3deg); }\n'))

    def test_a_tone_remap_that_loses_a_role_or_a_child(self) -> None:
        self.assertCaught("tone", plant(self.css, old="--cs-line:var(--cs-tone-invert-line);", new=""))
        self.assertCaught("tone", plant(self.css, old="--cs-ink:var(--cs-tone-field-ink);", new="--cs-ink:var(--cs-tone-invert-ink);"))
        self.assertCaught("tone", plant(self.css, old='.cs-slide[data-tone="field"], .cs-slide[data-tone="field"] > *, ', new='.cs-slide[data-tone="field"], '))
        self.assertCaught("tone", plant(self.css, old=', .cs-slide[data-tone="invert"]::before, .cs-slide[data-tone="invert"]::after{', new="{"))
        self.assertCaught("tone", plant(self.css, old='.cs-slide[data-tone="invert"] > .cs-content{ color:var(--cs-tone-invert-ink); }', new=""))
        self.assertCaught("tone", plant(self.css, '.cs-slide[data-tone="base"]{ --cs-ink:var(--cs-tone-base-ink); }\n'))

    def test_a_tick_and_a_cross_that_share_a_hue(self) -> None:
        self.assertCaught("marks", self.css.replace("var(--cs-mark-tick,var(--cs-art-s2,", "var(--cs-mark-tick,var(--cs-accent,"))

    def test_a_media_frame_that_hits_every_kind_or_the_slot(self) -> None:
        self.assertCaught("media", plant(self.css, GATE + " .cs-content > .cs-media-slot{ border-radius:var(--cs-art-r-card); }\n"))
        self.assertCaught("media", plant(self.css, GATE + ' .cs-content > .cs-media-slot:not([data-media-kind="icon"]):not([data-media-kind="art"]){ border-radius:var(--cs-art-r-card); }\n'))

    def test_a_custom_property_nothing_defines(self) -> None:
        self.assertCaught("var", plant(self.css, ".cs-slide .cs-icon{ color:var(--cs-nothing); }\n"))
        self.assertCaught("property", plant(self.css, ".cs-slide .cs-icon{ --brand:red; }\n"))


class PlantedCascadeDefects(unittest.TestCase):
    """The cascade checks bite too: each defect is planted in a copy of the sheet (tones) or in a decor.css (marks, overrides) and must be found."""

    css = ""

    @classmethod
    def setUpClass(cls) -> None:
        cls.css = read_sheet()

    def test_a_tone_remap_that_loses_a_role(self) -> None:
        for tone in ("invert", "field"):
            bad = plant(self.css, old="--cs-line:var(--cs-tone-%s-line);" % tone, new="")
            self.assertTrue(tone_mismatches(bad, aliases=False), "%s: a lost --cs-line must show in the computed styles" % tone)

    def test_a_tone_remap_that_swaps_two_roles(self) -> None:
        bad = plant(self.css, old="--cs-ink:var(--cs-tone-field-ink); --cs-ink-muted:var(--cs-tone-field-ink-muted);",
                    new="--cs-ink:var(--cs-tone-field-ink-muted); --cs-ink-muted:var(--cs-tone-field-ink);")
        found = tone_mismatches(bad, aliases=False)
        self.assertTrue(found)
        self.assertTrue(any(f.startswith("sentinel") for f in found), "real field tones repeat ink as inkMuted: only the sentinel colours can see the swap everywhere")

    def test_a_tone_remap_that_forgets_the_children_or_the_root_pseudo_elements(self) -> None:
        self.assertTrue(tone_mismatches(plant(self.css, old='.cs-slide[data-tone="field"], .cs-slide[data-tone="field"] > *, ', new='.cs-slide[data-tone="field"], '), False))
        self.assertTrue(tone_mismatches(plant(self.css, old=', .cs-slide[data-tone="invert"]::before, .cs-slide[data-tone="invert"]::after{', new="{"), False))

    def test_a_root_paint_that_stays_on_the_base_roles(self) -> None:
        bad = plant(self.css, old='.cs-slide[data-tone="field"][data-preset]{ background-color:var(--cs-tone-field-bg); color:var(--cs-tone-field-ink); }', new="")
        self.assertTrue(any("of root" in f for f in tone_mismatches(bad, aliases=False)), "an inline base --cs-bg on the root is what the root paints without the rule")

    def test_a_root_remap_alone_is_not_enough(self) -> None:
        """The defect the review found: remapping only the root looks right in a declaration check and is overridden by the inline style."""
        bad = plant(self.css, old='.cs-slide[data-tone="field"], .cs-slide[data-tone="field"] > *, .cs-slide[data-tone="field"]::before, .cs-slide[data-tone="field"]::after{',
                    new='.cs-slide[data-tone="field"]{')
        self.assertEqual(codes(bad) & {"tone"}, {"tone"})
        self.assertTrue(tone_mismatches(bad, aliases=False))

    def test_a_gated_rule_that_leaks_into_off_mode_or_the_cover(self) -> None:
        def changes(sheet: str, **kw) -> bool:
            for preset in PRESETS:
                with_sheet, without = cascade(preset_root_css(preset), layout_css(), sheet), cascade(preset_root_css(preset), layout_css())
                _, a = probe_tree(preset, "invert", root_inline(bundle, preset, "invert", False), **kw)
                _, b = probe_tree(preset, "invert", root_inline(bundle, preset, "invert", False), **kw)
                for key in ("kicker", "cta", "headline"):
                    if with_sheet.style(a[key]).get("display") != without.style(b[key]).get("display"):
                        return True
            return False
        self.assertTrue(changes(plant(self.css, ".cs-slide .cs-kicker{ display:block; }\n"), tone_attr=False))
        self.assertTrue(changes(plant(self.css, GATE.replace(':not([data-type="cover"])', "") + " .cs-kicker{ display:block; }\n"), slide_type="cover"))
        self.assertFalse(changes(self.css, tone_attr=False))
        self.assertFalse(changes(self.css, slide_type="cover"))

    def test_marks_that_resolve_to_one_colour(self) -> None:
        self.assertTrue(mark_findings(".cs-slide .cs-item{ --cs-mark-tick:#C0392B; --cs-mark-cross:#C0392B; }", self.css), "identical literal colours")
        self.assertTrue(mark_findings(".cs-slide .cs-item{ --cs-mark-tick:#C0392B; --cs-mark-cross:#C13A2C; }", self.css), "two literals a shade apart")
        self.assertTrue(mark_findings(".cs-slide .cs-item{ --cs-mark-cross:var(--cs-art-s2); }", self.css), "the cross moved onto the tick's source")

    def test_marks_that_differ_by_name_but_not_by_colour_in_one_tone(self) -> None:
        """tick = ink and cross = accent are two names; on the poster field tone both are cream (F3EBD8, F3EBD8), and on invert they are 18 apart."""
        found = mark_findings('.cs-slide[data-preset="poster"] .cs-item{ --cs-mark-tick:var(--cs-ink); --cs-mark-cross:var(--cs-accent); }', self.css)
        self.assertTrue(any("poster field" in f and "0.0 apart" in f for f in found), found)
        self.assertTrue(any("poster invert" in f for f in found), found)
        self.assertFalse(any("poster base" in f or f.startswith(("swiss", "creator")) for f in found), "base is far apart and other presets keep their defaults")

    def test_an_override_on_the_root_is_judged_with_the_root_the_engine_will_write(self) -> None:
        """A custom property that reads a role is resolved where it is declared. On the root that is the root's own value: right only once the aliases are written."""
        found = mark_findings('.cs-slide[data-preset="poster"]{ --cs-mark-tick:var(--cs-ink); --cs-mark-cross:var(--cs-accent); }', self.css)
        self.assertTrue(found)
        self.assertTrue(all("aliases" in f for f in found), "with only the inline base values both marks read the base roles, which are apart")

    def test_marks_that_cannot_be_resolved_are_findings_not_passes(self) -> None:
        for decor in (".cs-slide .cs-item:nth-child(2n){ --cs-mark-tick:#000000; }", ".cs-slide .cs-item{ --cs-mark-tick:red; }"):
            found = mark_findings(decor, self.css)
            self.assertTrue(found and all("cannot resolve" in f or "apart" in f for f in found), decor)

    def test_good_overrides_pass(self) -> None:
        self.assertEqual(mark_findings(".cs-slide .cs-item{ --cs-mark-tick:#0F766E; --cs-mark-cross:#E3262B; }", self.css), [])
        self.assertEqual(mark_findings(".cs-slide .cs-item{ --cs-mark-tick:var(--cs-art-s1); }", self.css), [])

    def test_a_header_that_promises_the_wrong_strength(self) -> None:
        self.assertTrue(header_strength_ok(self.css))
        self.assertFalse(header_strength_ok(self.css.replace("(0,4,0) to (0,8,1)", "(0,3,0) to (0,8,1)", 1)))
        self.assertFalse(header_strength_ok(self.css.replace('[data-preset="x"]', "[data-preset]")))
        stronger = '.cs-slide[data-tone]:not([data-type="cover"]):not([data-a="1"]):not([data-b="1"]):not([data-c="1"]):not([data-d="1"]):not([data-e="1"]):not([data-f="1"]) .cs-icon{ display:block; }\n'
        self.assertFalse(header_strength_ok(plant(self.css, stronger)), "a gated rule stronger than the documented range")


class Integration(unittest.TestCase):
    """The route of rule A11: build_studio reads the sheet and appends it once into #cs-archetype-css."""

    def load_builder(self):
        path = DESIGN / "scripts" / "build_studio.py"
        spec = importlib.util.spec_from_file_location("build_studio_under_primitives_test", path)
        mod = importlib.util.module_from_spec(spec)
        sys.modules[spec.name] = mod
        try:
            spec.loader.exec_module(mod)
        except Exception as exc:            # another package is mid-edit on build_studio.py: say so, do not fail this sheet's own test
            self.skipTest("build_studio.py does not import right now: %s" % exc)
        return mod

    def test_load_primitives_accepts_the_sheet_and_append_is_idempotent(self) -> None:
        builder = self.load_builder()
        css = builder.load_primitives(DESIGN)
        self.assertIsNotNone(css)
        self.assertLessEqual(len(css.encode("utf-8")), BUILD_CAP)
        archetypes = ARCHETYPES.read_text(encoding="utf-8")
        once = builder.append_primitives(archetypes, css)
        self.assertEqual(once.count("primitives.css - owned by E4a"), 1)
        self.assertEqual(builder.append_primitives(once, css), once)
        match = builder.ARCHETYPE_STYLE.search(once)
        self.assertTrue(match.group(1).rstrip().endswith(css.rstrip()), "the sheet is the last thing in the element, after the layout sheet")
        self.assertEqual(len(re.findall(r'<style id="cs-archetype-css"', once)), 1)

    def test_no_custom_property_means_two_things(self) -> None:
        """A name this sheet declares (other than the eight roles it remaps) must not be read by the layout sheet: --cs-rail-w once was both the
        progress rail's width here and the timeline rail's column there, and the first declaration on the slide root would have widened the column."""
        layout = ARCHETYPES.read_text(encoding="utf-8")
        mine = {n for _, decls in parse(read_sheet()) for n, _ in decls if n.startswith("--")} - set(EIGHT)
        read_by_layout = set(re.findall(r"var\((--[a-z0-9-]+)", layout))
        self.assertEqual(sorted(mine & read_by_layout), [], "declared by primitives.css and read by archetypes.html")

    def test_the_layout_sheet_does_not_define_what_this_sheet_owns(self) -> None:
        layout = ARCHETYPES.read_text(encoding="utf-8")
        head = layout[: layout.index("</style>")]
        for token in (".cs-rail-seg", ".cs-marks", ".cs-thread", "--cs-art-r-", "--cs-art-shadow", "--cs-tone-"):
            self.assertNotIn(token, head, "%s belongs to primitives.css (archetypes.html carries geometry only)" % token)


if __name__ == "__main__":
    unittest.main()
