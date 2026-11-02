#!/usr/bin/env python3
"""preset_lint.py: check a preset (or an occasion pack) against the rules every look must obey (CONTRACT 6).

    preset_lint.py (--all | --preset DIR | --occasion DIR) [--styles DIR] [--fonts DIR] [--archetypes FILE]
                   [--strict | --no-strict] [--chart-gap PX] [--write-index] [--format text|json]

A preset is tokens + decor.css + variant flags, never new layout. This tool checks, for each preset folder:

  schema      preset.json against preset.schema.json; id equals the folder name
  decor       decor.css against CONTRACT 6.3: every selector scoped to .cs-slide[data-preset="<id>"], only the class and attribute
              vocabulary of 5.1 (cs-art*, cs-icon, cs-items, cs-item, cs-rail*, cs-marks, cs-thread, cs-anchor-slot included; the
              values of data-tone, data-recipe and data-anchor-kind are checked), only allowed properties, none of the forbidden ones
              (filter, mask, blend modes, letter-spacing, justification, italics, font-family, animation, !important, viewport
              units, position: fixed, external url(), colour literals outside data:image/svg+xml), opacity only on .cs-bg /
              .cs-decor, no translucent text colour, size <= 64 KiB
  fonts       every font id exists in fonts/registry.json and covers Arabic letters, Western digits and Arabic punctuation
  contrast    ink/bg, ink/surface, inkMuted/bg and onAccent/accent reach the preset's floors (accent too, when it colours text);
              a gradient background's stops are role names or hex colours and the text colours reach the floors on every stop
  tones       (when preset.tones exists) every tone of the preset is resolved by the grammar of spec 5.5 (role names or #RRGGBB, mix,
              lightness, muted, pick; the positions of the numbers are checked) into the eight roles
              bg surface ink inkMuted accent accent2 onAccent line, and every text pair is checked in one pass: ink and inkMuted on
              bg and surface, onAccent on accent, the chrome inks (handle and save pill on bg, meta, counter and swipe on bg), G5 for
              an accent that colours text
  graphics    (when preset.art or preset.tones exists) the boundary rule of spec 6.0 on the accent and the two support hues: G1/G2
              (a 3 px outline that is 3:1 against its ground, or a fill that is), G3 (the glyph on a plate reaches 4.5:1: chip, tile,
              sticker and badge take the plate's own on-colour, duo and giant draw their glyph in ink; the plate is the declared or the
              default fill, resolved the way src/art/kit.js frame() resolves it), G4 (adjacent chart marks are 3:1 apart or separated
              by --chart-gap px, the gap the chart builders contract), G6 (support 1 never carries a glyph, on any plate treatment);
              art.objectOutline is 0.03-0.04
  variants    preset.variants is a subset of what each archetype in templates/archetypes.html offers
  chrome      slot names, save-pill types, swipe style, motion recipes
  preview     the preview file exists, or index.json says null

--strict is the rebuilt look (spec 6.8): decor.css <= 25 KiB (decision D-7: the first 20 KiB of rules whose every selector is scoped to
[data-type="cover"] or [data-type="poster"], a selector that stays inside that slide, do not count toward it: a rule that reaches the slides after the
cover with + or ~, or has one selector that is not scoped, counts in full) and free of outline, border-image, color-mix, of gradient or shadow
colours that are not var(--cs-*), and of every construct the replay painter refuses (rule A6: replaySupportCheck in src/paint/replay.js
throws E_PAINT_UNSUPPORTED and the slide does not export on Safari and iPhone): inset shadows, conic gradients, a clip-path that is not
inset(), 3D transforms, a list marker, pseudo-element content that reads attr(), counter() or url(); the preset must declare art, both
tones and two support hues. A custom property and the fallback of a var() are read for what they stand for, along the whole chain of definitions (a
loop ends it): the 3D function behind `transform: var(--cs-turn)` and the colour behind `box-shadow: var(--cs-shadow)` or `var(--cs-missing, red)` are
findings, however many custom properties lie between. When a value stands for more whole values than the lint lists, it says so (decor.var-limit) rather than pass it. Without it the six legacy presets pass
as they are; each PR package runs its own preset with --strict and the integration beat sets STRICT_DEFAULT (--no-strict opts out).
--write-index regenerates styles/index.json (names, fonts, preview paths) from the preset folders, in the order of the existing index.
--occasion DIR checks an occasion pack (pack.json against occasion.schema.json, overlay keys, motif files).
Exit codes: 0 clean, 1 warnings only, 2 errors, 64 usage, 65 unparseable JSON, 66 input missing.
"""
import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
try:
    from _cs import CSError, color, paths, schema  # noqa: E402
except ImportError as exc:  # the shared package is synced next to the scripts; say so plainly
    sys.stderr.write("cs-error: E_DEP_LOAD: the shared _cs package is missing next to this script: %s\n" % exc)
    sys.exit(70)

paths.ensure_utf8_stdio()

SKILL = paths.skill_root()
MAX_DECOR_BYTES = 64 * 1024
MAX_DECOR_BYTES_STRICT = 25 * 1024     # spec 6.8: the shared structure lives in primitives.css, decor.css keeps what is the preset's own
COVER_ALLOWANCE_BYTES = 20 * 1024      # D-7 (cover exactness): rules scoped to a cover or a poster count toward the limit above only past this many bytes
STRICT_DEFAULT = False                 # the integration beat after the six rebuilds (IB3) sets this to True; --no-strict opts out
CHART_GAP_MIN_PX = 3                   # G4 (spec 6.0): adjacent chart marks are 3:1 apart or "separated by a 3 px gap or outline"
CHART_GAP_PX = 3                       # the gap the chart builders contract between adjacent marks: tests/preset-lint/chart-separation.json; --chart-gap overrides it
SLIDE_TYPES = ("cover", "rehook", "item", "step", "stat", "compare", "myth-fact", "quote", "story-beat", "checklist", "summary",
               "setup", "proof", "share", "cta", "offer", "testimonial", "poster", "grid", "timeline")
RECIPES = ("calm", "counter", "highlight-sweep", "stamp", "reorder", "story", "morph", "split", "map-dots", "cash-wipe",
           "drop-clock", "curtain", "zoom", "notify", "scale", "none")
CLASS_VOCABULARY = set(
    "cs-slide cs-bg cs-decor cs-header cs-footer cs-content cs-slot cs-handle cs-meta cs-counter cs-swipe cs-savepill "
    "cs-kicker cs-headline cs-sub cs-title cs-body cs-bullets cs-bullet cs-sides cs-side cs-side-label cs-side-text cs-number "
    "cs-num cs-unit cs-ord cs-attribution cs-bridge cs-cta cs-cta-text cs-cta-icon cs-media-slot cs-ltr cs-rtl cs-emoji cs-em "
    "cs-ln cs-kashida w "
    # IS-6: the art layer, the rail, the items list and the marks layer (E3 emits them, primitives.css styles them)
    "cs-art cs-art-panel cs-art-svg cs-art-label cs-icon cs-items cs-item cs-rail cs-rail-seg cs-marks cs-thread cs-anchor-slot cs-figure".split())
CLASS_PATTERN = re.compile(r"^cs-a-[a-z-]+$")
TEXT_CLASSES = ("cs-kicker", "cs-headline", "cs-sub", "cs-title", "cs-body", "cs-bullet", "cs-side-text", "cs-attribution",
                "cs-bridge", "cs-num", "cs-number", "cs-ord", "cs-cta-text", "cs-handle", "cs-meta", "cs-counter", "cs-swipe",
                "cs-savepill", "cs-side-label", "cs-unit", "cs-em", "w", "cs-art-label", "cs-item")

# CONTRACT 6.3 allow-list, plus the layout and typography properties a look needs to dress the archetypes without changing them.
ALLOWED_PROPERTIES = set("""
background background-color background-image background-position background-size background-repeat background-origin background-clip
border border-top border-right border-bottom border-left border-inline border-inline-start border-inline-end border-block
border-block-start border-block-end border-color border-style border-width border-radius border-start-start-radius
border-start-end-radius border-end-start-radius border-end-end-radius border-inline-color border-inline-style border-inline-width
border-block-color border-block-style border-block-width border-image border-image-source border-image-slice
box-shadow outline outline-color outline-style outline-width outline-offset
padding padding-inline padding-inline-start padding-inline-end padding-block padding-block-start padding-block-end
margin margin-inline margin-inline-start margin-inline-end margin-block margin-block-start margin-block-end
width height min-width min-height max-width max-height inline-size block-size min-inline-size min-block-size max-inline-size max-block-size
transform transform-origin clip-path text-decoration text-decoration-line text-decoration-color text-decoration-thickness
text-decoration-style text-underline-offset font-weight text-transform content display position inset inset-inline inset-inline-start
inset-inline-end inset-block inset-block-start inset-block-end top right bottom left z-index opacity color
line-height gap row-gap column-gap align-items align-self align-content justify-content justify-items justify-self place-items
place-self flex flex-direction flex-wrap flex-grow flex-shrink flex-basis order grid-template-columns grid-template-rows
grid-column grid-row white-space overflow overflow-x overflow-y text-overflow vertical-align object-fit object-position
list-style list-style-type list-style-position box-sizing font-variant-numeric text-align text-wrap text-indent
pointer-events aspect-ratio
""".split())
FORBIDDEN_PROPERTIES = {
    "filter": "filter is not paintable by the replay painter",
    "backdrop-filter": "backdrop-filter is not paintable by the replay painter",
    "mix-blend-mode": "blend modes are not paintable by the replay painter",
    "background-blend-mode": "blend modes are not paintable by the replay painter",
    "writing-mode": "writing-mode is not paintable and breaks the Arabic layout",
    "word-spacing": "word-spacing is forbidden on Arabic text",
    "text-justify": "justified Arabic text is forbidden",
    "font-family": "fonts come from the tokens, never from a preset's CSS",
    "font-style": "italic and oblique Arabic is forbidden",
}
FORBIDDEN_PREFIXES = (("mask", "masks are not paintable by the replay painter"), ("font-synthesis", "font synthesis is forbidden"),
                      ("animation", "motion is built by the engine, never by CSS"), ("transition", "motion is built by the engine, never by CSS"))
ALLOWED_PREFIXES = ("border", "padding", "margin", "outline", "background-", "text-decoration", "inset", "grid-", "flex-", "list-style", "overflow")
HEX_COLOUR = re.compile(r"#[0-9a-fA-F]{3,8}\b")
COLOUR_FUNCTION = re.compile(r"\b(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\s*\(", re.I)
VIEWPORT_UNIT = re.compile(r"[0-9.](vw|vh|vmin|vmax|dvh|dvw|svh|svw|lvh|lvw)\b", re.I)
PLACEHOLDERS = ("{{bg}}", "{{surface}}", "{{ink}}", "{{inkMuted}}", "{{accent}}", "{{accent2}}")
SLOT_RE = re.compile(r"^(header|footer)-(start|center|end)$")

# Values of the data-* attributes that carry a closed vocabulary (IS-6). A typo in one of them selects nothing, silently.
ATTRIBUTE_VALUES = {
    "data-tone": ("base", "invert", "field"),
    "data-recipe": ("under", "over", "start", "end", "full", "band", "corner", "center", "half"),
    "data-anchor-kind": ("icon", "scene", "rows", "numeral", "chart", "mock", "photo", "field", "word", "pattern"),
}
ATTRIBUTE_VALUE_RE = re.compile(r"\[\s*(data-tone|data-recipe|data-anchor-kind)\s*([~|^$*]?=)\s*(?:\"([^\"]*)\"|'([^']*)'|([^\]\s]+))\s*(?:[iIsS]\s*)?\]")

# --strict (spec 6.8, F1): the replay painter draws none of these, so a rebuilt look does not use them.
STRICT_PROPERTY_PREFIXES = (("outline", "outline is not drawn by the replay painter: use a border or a box-shadow ring"),
                            ("border-image", "border-image is not drawn by the replay painter: use a border or a background"))
# The replay painter (Safari and every iPhone browser) refuses a slide when replaySupportCheck (src/paint/replay.js) flags anything in it; A6 of the spec
# keeps those constructs out of art and decor.css. Each flag the function can raise from CSS maps to one finding code: the first six are the forbidden
# properties of every mode, the rest are strict-only (the legacy presets pass as they are). tests/unit/py/test_preset_lint.py reads the flags out of
# replay.js, runs the real function on planted computed styles, and fails when this table and the function disagree.
REPLAY_FORBIDDEN_FLAGS = ("filter", "backdrop-filter", "mix-blend-mode", "mask", "writing-mode", "background-blend-mode")
REPLAY_STRICT = {
    "box-shadow-inset": ("decor.inset-shadow", "an inset shadow is not drawn by the replay painter (replaySupportCheck: box-shadow-inset), so the slide would not export on Safari and iPhone: draw the ring with a border, an outer shadow ring, or a wrapper element"),
    "conic-gradient": ("decor.conic-gradient", "a conic gradient is not drawn by the replay painter (replaySupportCheck: conic-gradient): use linear or radial stops, or draw the wedge as an svg path"),
    "clip-path": ("decor.clip-path", "replaySupportCheck accepts only clip-path: inset(...) or none: a torn or shaped edge is an svg overlay or an elliptical border-radius (A6)"),
    "transform-3d": ("decor.transform-3d", "a 3D transform is not drawn by the replay painter (replaySupportCheck: transform-3d): use translate(), scale(), rotate() and skew()"),
    "list-marker": ("decor.list-marker", "a list marker is not drawn by the replay painter (replaySupportCheck: list-marker): use list-style: none and draw the bullet as a pseudo-element or an element"),
    "pseudo-element-content": ("decor.pseudo-content", "content with attr(), counter() or url() is not drawn by the replay painter (replaySupportCheck: pseudo-element-content): write the text as a string or draw the mark with a background"),
}
INSET_KEYWORD = re.compile(r"(?<![\w-])inset(?![\w(-])", re.I)       # the shadow keyword; neither the inset property nor the inset() function
QUOTED = re.compile(r"\"[^\"]*\"|'[^']*'")
CONIC_GRADIENT = re.compile(r"conic-gradient\s*\(", re.I)           # repeating-conic-gradient contains it
THREE_D_FUNCTION = re.compile(r"\b(matrix3d|translate3d|translatez|scale3d|scalez|rotate3d|rotatex|rotatey|perspective)\s*\(", re.I)
PSEUDO_CONTENT_FN = re.compile(r"\b(attr|counters?|url)\s*\(", re.I)
VENDOR_PREFIX = re.compile(r"^-(?:webkit|moz|ms|o)-")
GRADIENT_FN = re.compile(r"(?:repeating-)?(?:linear|radial|conic)-gradient\s*\(", re.I)
COLOR_MIX = re.compile(r"\bcolor-mix\s*\(", re.I)
OTHER_COLOUR_FN = re.compile(r"\b(light-dark|device-cmyk)\s*\(", re.I)
DATA_URI = re.compile(r"url\(\s*(\"data:[^\"]*\"|'data:[^']*'|data:[^)]*)\s*\)")
COVER_TYPES = ("cover", "poster")                                   # D-7: the slide types whose rules are free up to COVER_ALLOWANCE_BYTES
ATTRIBUTE_SELECTOR = re.compile(r"\s*([^\s~|^$*=\]]+)\s*(?:([~|^$*]?=)\s*(?:\"([^\"]*)\"|'([^']*)'|([^\s\"']+))\s*([iIsS])?)?\s*")
SELECTOR_LISTS = ("is", "where", "matches", "-webkit-any", "-moz-any")   # :is(a, b) holds when any alternative holds
SHADOW_ITEM = re.compile(r"^\s*(?:inset\s+)?-?[0-9.]+[a-z%]*\s+-?[0-9.]+[a-z%]*(?:\s|$)", re.I)   # two lengths first: the offsets of a shadow
VAR_DEPTH = 32                                                      # how many custom properties deep the whole values of a declaration are listed
VAR_ALTERNATIVES = 64                                               # and how many whole values one declaration is listed with; past either the lint says so
WHOLE_VALUE_PROPERTIES = ("clip-path", "display", "list-style", "list-style-type")    # the declarations whose check reads the value whole (expand), not piece by piece (var_trace)
NAMED_COLOURS = frozenset("""
aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse
chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta
darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet
deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green
greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral
lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray
lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple
mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite
navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink
plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue
slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow
yellowgreen
""".split())

# Tones (spec 5.5, 6.0, IS-7 v2). A tone is a named bundle of the five roles of the schema; the other three of the eight are derived once.
TONE_NAMES = ("base", "invert", "field")
TONE_ROLES = ("bg", "surface", "ink", "inkMuted", "accent")
BASE_ROLE_NAMES = ("bg", "surface", "ink", "inkMuted", "accent", "accent2")
BUNDLE_ROLES = ("bg", "surface", "ink", "inkMuted", "accent", "accent2", "onAccent", "line")
LINE_MIX = 0.82                            # resolve.js: derived.line = mix(ink, bg, 0.82)
SURFACE_MIX = 0.04                         # resolve.js: surface defaults to mix(bg, ink, 0.04)
OBJECT_OUTLINE_RANGE = (0.03, 0.04)        # S-2: an object's outline is this share of its size
OUTLINE_MIN_PX = 3                         # G1: a mark outline that carries the boundary rule is at least this thick
TREATMENT_NAMES = ("bare", "chip", "tile", "ring", "duo", "sticker", "badge", "giant", "die")
PLATE_FILL = {"chip": "tint", "tile": "accent", "sticker": "tint", "duo": "tint", "badge": "accent", "giant": "tint"}   # src/art/kit.js FILL: the plate under a glyph
GLYPH_TREATMENTS = tuple(PLATE_FILL)      # the treatments that put a glyph on a filled plate (kit.frame); bare and ring draw none
INK_GLYPH_TREATMENTS = ("duo", "giant")   # kit.frame draws these two glyphs in the tone's ink, whatever the plate under them; the other four take kit.on(fill)


# Q37 (round 5): the presets v1 ships. editorial moves to 1.1 and scrapbook to 1.2, so a stray folder of either name is an error.
V1_PRESETS = ("swiss", "creator", "notebook", "poster", "interface", "heritage")
LATER_PRESETS = {"editorial": "1.1", "scrapbook": "1.2"}


def lint_preset_set(styles, index):
    """The shipped preset set equals Q37, minus any preset that styles/index.json lists under "dropped" (a preset that was not solid by
    the end of the build is deferred, not shipped broken)."""
    found = {d.name for d in styles.iterdir() if d.is_dir()}
    listed = [p.get("id") for p in index.get("presets", [])]
    dropped = set(index.get("dropped") or [])
    expected = set(V1_PRESETS) - dropped
    findings = []
    for name in sorted((found | set(listed)) - expected):
        if name in LATER_PRESETS:
            findings.append(Finding("ERROR", "set.deferred", name, "%s is not part of v1; it ships in %s" % (name, LATER_PRESETS[name])))
        else:
            findings.append(Finding("ERROR", "set.unknown", name, "not one of the v1 presets (%s)" % ", ".join(V1_PRESETS)))
    for name in sorted(expected - found):
        findings.append(Finding("ERROR", "set.missing", name, "a v1 preset has no folder; add it, or list it under \"dropped\" in styles/index.json"))
    for name in sorted(expected - set(listed)):
        if name in found:
            findings.append(Finding("WARN", "set.unlisted", name, "not listed in styles/index.json (run --write-index)"))
    return findings


class Parser(argparse.ArgumentParser):
    def error(self, message):
        sys.stderr.write("cs-error: E_USAGE: %s\n" % message)
        sys.exit(64)


class Finding(dict):
    def __init__(self, sev, code, where, message):
        super().__init__(sev=sev, code=code, where=where, message=message)


# ---- CSS ------------------------------------------------------------------------------------------------------------------


def strip_comments(css):
    out, i, n, quote = [], 0, len(css), None
    while i < n:
        ch = css[i]
        if quote:
            out.append(ch)
            if ch == "\\" and i + 1 < n:
                out.append(css[i + 1])
                i += 1
            elif ch == quote:
                quote = None
        elif ch in "\"'":
            quote = ch
            out.append(ch)
        elif css.startswith("/*", i):
            j = css.find("*/", i + 2)
            i = n if j < 0 else j + 1
        else:
            out.append(ch)
        i += 1
    return "".join(out)


def split_top(text, sep):
    """Split on `sep` outside quotes, parentheses and brackets."""
    parts, buf, depth, quote, i = [], [], 0, None, 0
    while i < len(text):
        ch = text[i]
        if quote:
            buf.append(ch)
            if ch == "\\" and i + 1 < len(text):
                buf.append(text[i + 1])
                i += 1
            elif ch == quote:
                quote = None
        elif ch in "\"'":
            quote = ch
            buf.append(ch)
        elif ch in "([":
            depth += 1
            buf.append(ch)
        elif ch in ")]":
            depth -= 1
            buf.append(ch)
        elif ch == sep and depth == 0:
            parts.append("".join(buf))
            buf = []
        else:
            buf.append(ch)
        i += 1
    parts.append("".join(buf))
    return parts


def parse_blocks(css):
    """Top-level `prelude { body }` blocks and `@rule ...;` statements: [(prelude, body or None)]."""
    out, i, n = [], 0, len(css)
    while i < n:
        while i < n and css[i] in " \t\r\n":
            i += 1
        if i >= n:
            break
        j, depth, quote = i, 0, None
        while j < n:
            ch = css[j]
            if quote:
                if ch == "\\":
                    j += 1
                elif ch == quote:
                    quote = None
            elif ch in "\"'":
                quote = ch
            elif ch in "([":
                depth += 1
            elif ch in ")]":
                depth -= 1
            elif depth == 0 and ch in "{;":
                break
            j += 1
        prelude = css[i:j].strip()
        if j >= n or css[j] == ";":
            out.append((prelude, None))
            i = j + 1
            continue
        k, braces, quote = j + 1, 1, None
        while k < n and braces:
            ch = css[k]
            if quote:
                if ch == "\\":
                    k += 1
                elif ch == quote:
                    quote = None
            elif ch in "\"'":
                quote = ch
            elif ch == "{":
                braces += 1
            elif ch == "}":
                braces -= 1
            k += 1
        out.append((prelude, css[j + 1:k - 1]))
        i = k
    return out


def declarations(body):
    for part in split_top(body, ";"):
        if ":" not in part:
            continue
        name, _, value = part.partition(":")
        name = name.strip()
        if name:
            yield name.lower(), value.strip()


def selector_problems(selector, preset_id, vocab_ok):
    problems = []
    prefix = '.cs-slide[data-preset="%s"]' % preset_id
    compact = re.sub(r"\s+", " ", selector.strip())
    if not compact.startswith(prefix):
        problems.append('selector must start with %s' % prefix)
    bare = re.sub(r"\[[^\]]*\]", "[]", compact)  # attribute values may contain anything
    for cls in re.findall(r"\.([A-Za-z_][A-Za-z0-9_-]*)", bare):
        if cls not in CLASS_VOCABULARY and not CLASS_PATTERN.match(cls):
            problems.append("class .%s is not in the vocabulary of CONTRACT 5.1" % cls)
    for attr in re.findall(r"\[\s*([A-Za-z_-][A-Za-z0-9_-]*)", compact):
        if not (attr.startswith("data-") or attr in ("dir", "lang")):
            problems.append("attribute [%s] is outside the data-* vocabulary" % attr)
    for m in ATTRIBUTE_VALUE_RE.finditer(compact):
        value = next(g for g in m.groups()[2:] if g is not None)
        allowed = ATTRIBUTE_VALUES[m.group(1)]
        if m.group(2) == "=" and value not in allowed:
            problems.append("[%s=%s] selects nothing: the values are %s" % (m.group(1), value, " ".join(allowed)))
    for pseudo in re.findall(r"(?<!:):([a-z-]+)", bare):
        if pseudo in ("hover", "focus", "active", "focus-visible", "focus-within", "visited"):
            problems.append(":%s is an interaction state; slides are static" % pseudo)
    if "#" in re.sub(r"\[[^\]]*\]", "", compact):
        problems.append("id selectors are not allowed")
    return problems


def var_calls(text):
    """[(start, end, name, fallback or None)] for the var(...) calls of `text`: parentheses balanced, quotes honoured. A call inside a fallback is not listed
    (the fallback comes back whole); an unbalanced call ends the scan."""
    out, i, n, low = [], 0, len(text), text.lower()
    while True:
        i = low.find("var(", i)
        if i < 0:
            break
        if i and (low[i - 1].isalnum() or low[i - 1] in "-_"):     # my-var( is some other function
            i += 4
            continue
        j, depth, quote = i + 4, 1, None
        while j < n and depth:
            ch = text[j]
            if quote:
                if ch == "\\":
                    j += 1
                elif ch == quote:
                    quote = None
            elif ch in "\"'":
                quote = ch
            elif ch == "(":
                depth += 1
            elif ch == ")":
                depth -= 1
            j += 1
        if depth:
            break
        name, comma, fallback = text[i + 4:j - 1].partition(",")
        out.append((i, j, name.strip(), fallback.strip() if comma else None))
        i = j
    return out


def strip_var_calls(text):
    """`text` with every var(...) call (fallback included) replaced by a space."""
    out, pos = [], 0
    for start, end, _, _ in var_calls(text):
        out.append(text[pos:start])
        pos = end
    out.append(text[pos:])
    return " ".join(out)


def _var_names(text):
    """The custom properties `text` reads through var(), a call inside a fallback included, lower-cased."""
    for _, _, name, fallback in var_calls(text):
        yield name.lower()
        if fallback:
            yield from _var_names(fallback)


def custom_properties(blocks):
    """(defs, referenced) of a stylesheet: defs maps each custom property to every value any rule gives it (the cascade is not modelled: a value is one the
    property can take), referenced is the set of names some declaration reads through var()."""
    defs, referenced = {}, set()
    for prelude, body in blocks:
        if prelude.startswith("@") or body is None:
            continue
        for name, value in declarations(body):
            if name.startswith("--"):
                defs.setdefault(name, []).append(value)
            referenced.update(_var_names(value))
    return defs, referenced


def var_trace(text, defs):
    """(pieces, names): everything `text` can be made of once its var() calls are resolved. `pieces` are the texts with each var() call cut out (a space
    in its place): the value itself, every definition of every custom property it reads and every fallback, and the same for those in turn. The walk
    follows the dependencies of the stylesheet to their end, each custom property once (a loop ends there), builds no combination of definitions and has
    no depth limit, so the construct at the end of any chain is read: the checks for a 3D function, an inset keyword, a conic gradient, a content function
    and a colour form run on the pieces. `names` are the custom properties read along the way, as written."""
    pieces, names, seen, todo, i = [], [], set(), [text], 0
    while i < len(todo):
        current, i = todo[i], i + 1
        cut, pos = [], 0
        for start, end, name, fallback in var_calls(current):
            cut.append(current[pos:start])
            pos = end
            names.append(name)
            if fallback is not None:
                todo.append(fallback)
            if name.lower() not in seen:
                seen.add(name.lower())
                todo.extend((defs or {}).get(name.lower(), ()))
        cut.append(current[pos:])
        pieces.append(" ".join(cut))
    return pieces, names


def expand(text, defs, _stack=(), _loops=None):
    """(values, complete): the whole values `text` can take once each var() call is replaced by what it stands for: every definition of the custom property
    in this stylesheet and the call's fallback. A call that stands for nothing known (an engine token such as var(--cs-ink)) is kept as written, a call
    to a custom property that is already being resolved (a loop: the property is invalid) stands for its fallback only, and so does a call whose
    definition leads back to the property itself (a definition that loops gives no value of its own; without a fallback the call is kept as written). The checks that need a value
    whole (a clip-path, a display, a list-style) run on these. The list holds at most VAR_ALTERNATIVES values and follows VAR_DEPTH custom properties;
    `complete` is False when either limit cut it short, and the lint then says so (decor.var-limit) instead of passing what it did not read."""
    calls = var_calls(text)
    if not calls:
        return [text], True
    complete, outs, pos = True, [""], 0
    for start, end, name, fallback in calls:
        key, alts = name.lower(), []
        if key in _stack:
            if _loops is not None:
                _loops.add(key)
        elif len(_stack) >= VAR_DEPTH:
            complete = False
        else:
            for definition in (defs or {}).get(key, ()):
                loops = set()
                sub, ok = expand(definition, defs, _stack + (key,), loops)
                complete = complete and ok
                if _loops is not None:
                    _loops.update(loops - {key})
                if key not in loops:                  # a definition that comes back to this very property makes it invalid: it stands for nothing
                    alts += sub
        if fallback is not None:
            sub, ok = expand(fallback, defs, _stack, _loops)
            alts += sub
            complete = complete and ok
        alts = list(dict.fromkeys(alts)) or [text[start:end]]
        outs = list(dict.fromkeys(o + text[pos:start] + a for o in outs for a in alts))
        if len(outs) > VAR_ALTERNATIVES:
            outs, complete = outs[:VAR_ALTERNATIVES], False
        pos = end
    return list(dict.fromkeys(o + text[pos:] for o in outs)), complete


def expansions(text, defs):
    """The values of expand() without the `complete` flag; without var() calls, [text]."""
    return expand(text, defs)[0]


def _head(selector):
    """(compound, combinator): the first compound selector of a chain (the text up to the first combinator outside brackets, parentheses and quotes) and
    the combinator after it: " " (descendant), ">", "+" or "~", or "" when the chain ends there."""
    text, depth, quote, i = selector.strip(), 0, None, 0
    while i < len(text):
        ch = text[i]
        if ch == "\\":
            i += 2
            continue
        if quote:
            quote = None if ch == quote else quote
        elif ch in "\"'":
            quote = ch
        elif ch in "([":
            depth += 1
        elif ch in ")]":
            depth -= 1
        elif depth == 0 and ch in " \t\r\n>+~":
            rest = text[i:].lstrip(" \t\r\n")
            return text[:i], rest[:1] if rest[:1] in (">", "+", "~") else (" " if rest else "")
        i += 1
    return text, ""


def _compound_parts(compound):
    """(attributes, groups) of one compound selector: its [name op value flag] attribute selectors as (name, operator, value, flag), and its :name(inner)
    pseudo-class groups as (name, inner). Quotes, brackets and parentheses are honoured, so an attribute value that reads like a selector is only a value."""
    attributes, groups, i, n = [], [], 0, len(compound)

    def close(start, opener, closer):
        j, depth, quote = start, 1, None
        while j < n and depth:
            ch = compound[j]
            if ch == "\\":
                j += 1
            elif quote:
                quote = None if ch == quote else quote
            elif ch in "\"'":
                quote = ch
            elif ch == opener:
                depth += 1
            elif ch == closer:
                depth -= 1
            j += 1
        return j, depth == 0
    while i < n:
        ch = compound[i]
        if ch == "\\":
            i += 2
        elif ch == "[":
            j, ok = close(i + 1, "[", "]")
            m = ATTRIBUTE_SELECTOR.fullmatch(compound[i + 1:j - 1 if ok else j])
            if m:
                value = next((g for g in m.groups()[2:5] if g is not None), None)
                attributes.append((m.group(1).lower(), m.group(2), value, (m.group(6) or "").lower()))
            i = j
        elif ch == ":" and re.match(r":[A-Za-z-]+\(", compound[i:]):
            name_end = compound.index("(", i)
            j, ok = close(name_end + 1, "(", ")")
            groups.append((compound[i + 1:name_end].lower(), compound[name_end + 1:j - 1 if ok else j]))
            i = j
        else:
            i += 1
    return attributes, groups


def _compound_is_cover(compound):
    attributes, groups = _compound_parts(compound.strip())
    for name, operator, value, flag in attributes:
        if name == "data-type" and operator == "=" and value is not None and (value.lower() if flag == "i" else value) in COVER_TYPES:
            return True                                                 # a :not(...) group is in `groups`, so its attribute never counts
    for name, inner in groups:
        if name in SELECTOR_LISTS:
            alternatives = [a.strip() for a in split_top(inner, ",") if a.strip()]
            if alternatives and all(_head(a)[1] == "" and _compound_is_cover(a) for a in alternatives):
                return True
    return False


def cover_scoped(selector):
    """True when the selector can only match something inside a cover or a poster slide: its first compound (the slide itself) carries [data-type="cover"]
    or [data-type="poster"], directly or in a :is()/:where() whose every alternative does, and the chain goes on only below it. A sibling combinator right
    after that compound (`+`, `~`) reaches the slides that follow the cover, which are not covers: the rule counts in full. So do a :not(), a
    descendant's attribute, a selector that does not name the type, and an attribute value that only looks like the attribute (D-7)."""
    compound, combinator = _head(selector)
    return combinator not in ("+", "~") and _compound_is_cover(compound)


def counted_size(css, blocks=None):
    """(bytes that count toward the strict limit, bytes of rules scoped to a cover or poster). A rule is scoped when every selector of its list is; its bytes
    are its own text and the white space before it. The first COVER_ALLOWANCE_BYTES of them are free (D-7), the rest, a rule with one other selector,
    the comments and everything else count."""
    stripped = strip_comments(css)
    blocks = parse_blocks(stripped) if blocks is None else blocks
    scoped, cursor = 0, 0
    for prelude, body in blocks:
        start = stripped.find(prelude, cursor)
        if start < 0:
            continue
        after = start + len(prelude)
        if body is None:                                   # an @rule statement ends at its semicolon
            end = stripped.find(";", after) + 1 or len(stripped)
        else:
            end = stripped.find(body, after) + len(body) + 1 if body else stripped.find("}", after) + 1
        if body is not None and not prelude.startswith("@"):
            selectors = [x for x in split_top(prelude, ",") if x.strip()]
            if selectors and all(cover_scoped(x) for x in selectors):
                scoped += len(stripped[cursor:end].encode("utf-8"))
        cursor = max(cursor, end)
    return len(css.encode("utf-8")) - min(scoped, COVER_ALLOWANCE_BYTES), scoped


def subject(selector):
    """The last compound selector of a descendant chain, without pseudo-elements."""
    last = re.split(r"[ >+~]+", re.sub(r"\[[^\]]*\]", "[]", selector.strip()))[-1]
    return last, "::" in last or last.endswith(":before") or last.endswith(":after")


def paint_segments(name, value):
    """The parts of a declaration whose colours the replay painter reads as canvas colour stops: every shadow list and every gradient's arguments."""
    if name in ("box-shadow", "text-shadow"):
        return [value]
    out = []
    for m in GRADIENT_FN.finditer(value):
        depth, i = 1, m.end()
        while i < len(value) and depth:
            depth += {"(": 1, ")": -1}.get(value[i], 0)
            i += 1
        out.append(value[m.end():i - 1 if depth == 0 else i])
    return out


def looks_like_shadow(value):
    """A custom property value that reads as a shadow list (the first two items of some entry are lengths): it can reach a box-shadow declared elsewhere."""
    return any(SHADOW_ITEM.match(item) for item in split_top(value, ","))


def paint_colour_problems(segment, defs=None):
    """Colour forms in a gradient or shadow that are neither var(--cs-*), a hex colour nor rgb()/rgba() (F1: the painter needs those three).
    color-mix() is reported on its own; the other colour functions are already decor.colour-literal. A var() is read for what it stands for (`defs`, the
    custom properties of the stylesheet, and its fallback): `var(--cs-shadow)` over `--cs-shadow: 0 6px 0 red` and `var(--cs-missing, red)` are the colour
    red, whatever the token says."""
    problems = []

    def add(text):
        if text not in problems:
            problems.append(text)
    pieces, names = var_trace(segment, defs or {})
    for name in names:
        if not name.startswith("--cs-"):
            add("var(%s) is not a token; gradient and shadow colours come from var(--cs-*)" % name)
    for text in pieces:
        rest = QUOTED.sub(" ", text)
        for m in OTHER_COLOUR_FN.finditer(rest):
            add("%s() is not read by the replay painter; use var(--cs-*)" % m.group(1).lower())
        for word in sorted(set(re.findall(r"(?<![\w#-])[a-z]+(?![\w(-])", rest.lower())) & NAMED_COLOURS):
            add("the colour name %s is not read by the replay painter; use var(--cs-*)" % word)
    return problems


def replay_flags(name, value, outside_data, defs=None, list_none=False, read=False):
    """The strict-only flags of replaySupportCheck (REPLAY_STRICT) that one declaration raises. `name` has no vendor prefix; `outside_data` is the value
    without its data: URIs (an svg inside a data URI is drawn by the browser, not by the painter). `defs` are the custom properties of the stylesheet: the
    value is followed through var() and its fallback, so `transform: var(--cs-turn)` is the 3D function it names. `list_none` says the rule also sets
    list-style to none (a list-item without a marker is drawn). `read` says the declaration is a custom property that some declaration reads: its use is
    inspected where it is read, and a 3D function in it is not reported twice."""
    flags, custom = [], name.startswith("--")

    def add(flag):
        if flag not in flags:
            flags.append(flag)
    for piece in var_trace(value, defs or {})[0]:           # the constructs that a piece of text names: every definition and fallback, to the end of the chain
        out = DATA_URI.sub("DATA-URI", piece)
        if (name == "box-shadow" or custom) and INSET_KEYWORD.search(QUOTED.sub(" ", out)):
            add("box-shadow-inset")                         # a custom property can carry the shadow into a box-shadow declared elsewhere
        if CONIC_GRADIENT.search(out):
            add("conic-gradient")
        if (name == "transform" or (custom and not read)) and THREE_D_FUNCTION.search(out):
            add("transform-3d")                             # likewise a custom property that nothing in this stylesheet reads may feed a transform
        if name == "content" and PSEUDO_CONTENT_FN.search(piece):
            add("pseudo-element-content")
    values, complete = expand(value, defs or {})
    for alt in values:                                      # the constructs that need the value whole
        text = alt.strip().lower()
        if not complete and "var(" in text:
            continue                                        # a chain cut at the depth limit: its leftover is not a value (decor.var-limit says so, never a pass)
        if name == "clip-path" and not (text in ("none", "initial", "unset") or text.startswith("inset(")):
            add("clip-path")
        if (name == "display" and text == "list-item" and not list_none) or (name == "list-style-type" and text != "none") or (
                name == "list-style" and "none" not in text.split()):
            add("list-marker")
    return flags


def lint_css(css, preset_id, strict=False):
    findings = []
    size = len(css.encode("utf-8"))
    blocks = parse_blocks(strip_comments(css))
    defs, referenced = custom_properties(blocks)
    if strict:
        counted, scoped = counted_size(css, blocks)
        if counted > MAX_DECOR_BYTES_STRICT:
            findings.append(Finding("ERROR", "decor.size", "decor.css", "%d bytes count (%d in the file, %d of them in rules scoped to a cover or a poster, of which up to %d are free); the limit is %d (--strict: the shared structure lives in primitives.css)" % (
                counted, size, scoped, COVER_ALLOWANCE_BYTES, MAX_DECOR_BYTES_STRICT)))
    elif size > MAX_DECOR_BYTES:
        findings.append(Finding("ERROR", "decor.size", "decor.css", "%d bytes; the limit is %d" % (size, MAX_DECOR_BYTES)))
    for prelude, body in blocks:
        if prelude.startswith("@"):
            findings.append(Finding("ERROR", "decor.at-rule", prelude.split()[0], "%s is not allowed in decor.css" % prelude.split()[0]))
            continue
        if body is None:
            continue
        selectors = [s for s in split_top(prelude, ",") if s.strip()]
        for sel in selectors:
            for problem in selector_problems(sel, preset_id, True):
                findings.append(Finding("ERROR", "decor.selector", sel.strip()[:90], problem))
        text_bearing = any(subject(s)[0] and any(("." + c) in subject(s)[0] for c in TEXT_CLASSES) and not subject(s)[1] for s in selectors)
        decor_only = all((".cs-decor" in s or ".cs-bg" in s) for s in selectors)
        list_none = False                                  # the last list-style of this rule: a list-item without a marker is drawn
        for name, value in declarations(body):
            if VENDOR_PREFIX.sub("", name) == "list-style-type":
                list_none = value.strip().lower() == "none"
            elif VENDOR_PREFIX.sub("", name) == "list-style":
                list_none = "none" in value.lower().split()
        for name, value in declarations(body):
            where = "%s { %s }" % (prelude.strip()[:60], name)
            outside_data = DATA_URI.sub("DATA-URI", value)
            bare = VENDOR_PREFIX.sub("", name)             # -webkit-mask-image and -webkit-backdrop-filter are the same properties to the painter
            if "!important" in value.lower():
                findings.append(Finding("ERROR", "decor.important", where, "!important is not allowed"))
            if bare in FORBIDDEN_PROPERTIES:
                bad = not (bare == "font-style" and value.lower() in ("normal", "initial", "inherit", "unset"))
                if bad:
                    findings.append(Finding("ERROR", "decor.forbidden-property", where, FORBIDDEN_PROPERTIES[bare]))
            for prefix, why in FORBIDDEN_PREFIXES:
                if bare.startswith(prefix):
                    findings.append(Finding("ERROR", "decor.forbidden-property", where, why))
            if name == "letter-spacing" and value.strip() not in ("0", "0px", "normal", "0em"):
                findings.append(Finding("ERROR", "decor.letter-spacing", where, "letter-spacing on Arabic text must be 0"))
            if name == "text-align" and "justify" in value.lower():
                findings.append(Finding("ERROR", "decor.justify", where, "justified Arabic text is forbidden"))
            if name == "position" and value.lower().startswith("fixed"):
                findings.append(Finding("ERROR", "decor.position-fixed", where, "position: fixed is not allowed"))
            if VIEWPORT_UNIT.search(outside_data):
                findings.append(Finding("ERROR", "decor.viewport-unit", where, "viewport units are not allowed (the slide is 1080 px wide)"))
            if "url(" in outside_data.lower():
                findings.append(Finding("ERROR", "decor.url", where, "url() must be a data: URI"))
            if HEX_COLOUR.search(outside_data) or COLOUR_FUNCTION.search(outside_data):
                findings.append(Finding("ERROR", "decor.colour-literal", where, "colours come from var(--cs-*); literals live only inside data:image/svg+xml"))
            if strict:
                for prefix, why in STRICT_PROPERTY_PREFIXES:
                    if name.startswith(prefix):
                        findings.append(Finding("ERROR", "decor.strict-property", where, why))
                if COLOR_MIX.search(outside_data):
                    findings.append(Finding("ERROR", "decor.color-mix", where, "color-mix() computes to color(srgb ...): the replay painter reads that for text, borders and backgrounds but not for gradient stops and shadows (F1), so a rebuilt look uses a token"))
                segments = paint_segments(bare, outside_data)
                if name.startswith("--") and name not in referenced and any(looks_like_shadow(piece) for piece in var_trace(outside_data, defs)[0]):
                    segments.append(outside_data)          # a shadow nothing here reads: it may feed a box-shadow elsewhere (a read one is inspected where it is read)
                for segment in segments:
                    for problem in paint_colour_problems(segment, defs):
                        findings.append(Finding("ERROR", "decor.paint-colour", where, problem))
                for flag in replay_flags(bare, value, outside_data, defs, list_none, name in referenced):
                    findings.append(Finding("ERROR", REPLAY_STRICT[flag][0], where, REPLAY_STRICT[flag][1]))
                if bare in WHOLE_VALUE_PROPERTIES and not expand(value, defs)[1]:
                    findings.append(Finding("ERROR", "decor.var-limit", where, "the custom properties behind this %s nest more than %d deep or stand for more than %d whole values: the lint cannot say what the painter reads, so write the value out" % (
                        bare, VAR_DEPTH, VAR_ALTERNATIVES)))
            if name == "opacity" and not decor_only:
                findings.append(Finding("ERROR", "decor.opacity", where, "opacity is allowed only on .cs-bg, .cs-decor and their descendants"))
            if name == "color" and text_bearing and re.search(r"(rgba|hsla)\(|/\s*[0-9.]+\s*\)", value, re.I):
                findings.append(Finding("ERROR", "decor.translucent-text", where, "text colours are opaque"))
            if name == "font-size" and text_bearing:
                findings.append(Finding("ERROR", "decor.font-size", where, "sizes of text slots come from the fit, not from a preset"))
            if (name not in ALLOWED_PROPERTIES and bare not in FORBIDDEN_PROPERTIES and not name.startswith(ALLOWED_PREFIXES)
                    and not bare.startswith(tuple(p for p, _ in FORBIDDEN_PREFIXES)) and not name.startswith("--cs-")
                    and not (name == "letter-spacing" or (name == "font-size" and text_bearing))):
                findings.append(Finding("WARN", "decor.property", where, "%s is outside the allow-list of CONTRACT 6.3" % name))
        for ph in re.findall(r"\{\{[A-Za-z0-9]+\}\}", body):
            if ph not in PLACEHOLDERS:
                findings.append(Finding("ERROR", "decor.placeholder", ph, "unknown placeholder; use one of %s" % ", ".join(PLACEHOLDERS)))
    return findings


# ---- the rest of a preset ---------------------------------------------------------------------------------------------------


def font_ids(preset):
    t = preset.get("type", {})
    ids = []
    for key in ("display", "heading", "body", "latin"):
        fam = (t.get(key) or {}).get("family")
        if fam and fam not in ids:
            ids.append(fam)
    return ids


def covers(ranges, cp):
    return any(a <= cp <= b for a, b in ranges)


def lint_fonts(preset, registry, coverage):
    findings = []
    families = {f["id"]: f for f in registry.get("families", [])}
    for fid in font_ids(preset):
        entry = families.get(fid)
        if not entry:
            findings.append(Finding("ERROR", "fonts.unknown", fid, "font id is not in fonts/registry.json"))
            continue
        cov = (coverage.get("families") or {}).get(fid)
        if not cov:
            findings.append(Finding("ERROR", "fonts.coverage", fid, "no entry in fonts/coverage.json"))
            continue
        ranges = cov["ranges"]
        scripts = entry.get("scripts", [])
        needs = [(range(0x30, 0x3A), "Western digits")]
        if "arabic" in scripts:
            needs += [(list(range(0x0621, 0x063B)) + list(range(0x0641, 0x064B)), "Arabic letters"), ([0x060C, 0x061B, 0x061F], "Arabic punctuation (، ؛ ؟)"), ([0x0640], "tatweel")]
        if "latin" in scripts:
            needs += [(range(0x41, 0x5B), "Latin capitals"), (range(0x61, 0x7B), "Latin small letters")]
        for cps, label in needs:
            missing = [cp for cp in cps if not covers(ranges, cp)]
            if missing:
                findings.append(Finding("ERROR", "fonts.coverage", fid, "does not cover %s (U+%04X ...)" % (label, missing[0])))
    return findings


def lint_contrast(preset):
    findings = []
    roles, floors = preset.get("roles", {}), preset.get("floors", {})
    body, large = floors.get("contrastBody", 4.5), floors.get("contrastLarge", 3.0)
    bg, ink, muted, accent = roles.get("bg"), roles.get("ink"), roles.get("inkMuted"), roles.get("accent")
    surface = roles.get("surface") or color.mix(bg, ink, 0.04)
    pairs = [("ink", ink, "bg", bg, body), ("ink", ink, "surface", surface, body), ("inkMuted", muted, "bg", bg, body),
             ("inkMuted", muted, "surface", surface, body), ("onAccent", color.on_color(accent), "accent", accent, body)]
    if (preset.get("decor") or {}).get("highlight") == "color":
        pairs += [("accent", accent, "bg", bg, body), ("accent", accent, "surface", surface, body)]
    for fg_name, fg, bg_name, bg_hex, floor in pairs:
        ratio = color.contrast(fg, bg_hex)
        if ratio < floor:
            sev = "WARN" if ratio >= large else "ERROR"
            findings.append(Finding(sev, "contrast", "%s on %s" % (fg_name, bg_name), "%.2f:1 is below the floor %.1f:1 (the engine would have to nudge it)" % (ratio, floor)))
    return findings


# ---- tones and graphics (spec 5.5, 6.0; IS-7 v2) -------------------------------------------------------------------------------
# A preset that fails the schema is still linted: every read below tolerates a block of the wrong shape (the schema check names it).


def _d(x):
    return x if isinstance(x, dict) else {}


def _l(x):
    return x if isinstance(x, list) else []


def _num(x, default):
    return x if isinstance(x, (int, float)) and not isinstance(x, bool) else default


def _hex(value):
    if not isinstance(value, str):
        return None
    try:
        return color.to_hex(color.parse(value))
    except (CSError, ValueError):
        return None


def _severity(ratio, floor, large):
    """The rule lint_contrast has always used: between the large-text floor and the body floor the engine would only nudge (WARN)."""
    return "WARN" if ratio >= large else "ERROR"


def base_roles(preset):
    """The preset's own roles with the resolver's defaults (surface: ink mixed 4% into bg; accent2: the accent), or None when a role is
    missing or not a colour (the schema check reports that)."""
    given = _d(preset.get("roles"))
    out = {key: _hex(given.get(key)) for key in ("bg", "ink", "inkMuted", "accent")}
    if not all(out.values()):
        return None
    out["surface"] = _hex(given.get("surface")) or color.mix(out["bg"], out["ink"], SURFACE_MIX)
    out["accent2"] = _hex(given.get("accent2")) or out["accent"]
    return out


def _is_role(x):
    """A reference in a tone value: a role of the preset, or a #RRGGBB colour (resolve.js ref() reads both; anything else it turns into ink)."""
    return isinstance(x, str) and (x in BASE_ROLE_NAMES or bool(HEX6.match(x)))


def _is_num(x, lo, hi):
    return isinstance(x, (int, float)) and not isinstance(x, bool) and lo <= x <= hi


HEX6 = re.compile(r"^#[0-9A-Fa-f]{6}$")


def tone_shape_errors(value):
    """[] or one reason. The schema subset has `items` as one schema and no prefixItems, so which array position holds a role and which a
    number is this lint's job (the schema tests keep the same vectors)."""
    if isinstance(value, str):
        return [] if _is_role(value) else ["%r is neither a role (%s) nor a #RRGGBB colour; the resolver would use ink" % (value, " ".join(BASE_ROLE_NAMES))]
    if not isinstance(value, dict) or len(value) != 1:
        return ["a tone value is a role name or an object with exactly one of mix, lightness, muted, pick"]
    (key, args), = value.items()
    if key == "mix":
        ok = isinstance(args, list) and len(args) == 3 and _is_role(args[0]) and _is_role(args[1]) and _is_num(args[2], 0, 1)
        shape = "[role, role, 0-1]"
    elif key == "lightness":
        ok = isinstance(args, list) and len(args) == 2 and _is_role(args[0]) and _is_num(args[1], 0, 1)
        shape = "[role, 0-1]"
    elif key == "muted":
        ok, shape = _is_num(args, 1, 21), "a contrast floor 1-21"
    elif key == "pick":
        ok = (isinstance(args, list) and len(args) == 2 and isinstance(args[0], list) and 1 <= len(args[0]) <= 4
              and all(_is_role(r) for r in args[0]) and _is_num(args[1], 1, 21))
        shape = "[[1-4 roles], floor 1-21]"
    else:
        return ["%s is not one of mix, lightness, muted, pick" % key]
    return [] if ok else ["%s takes %s" % (key, shape)]


def solve_muted(ink, bg, surface, floor):
    """{muted: floor}: the most muted mix of ink toward the ground that still clears `floor` on both bg and surface (resolve.js: steps of
    0.1% from the ground down; the ink itself when nothing clears)."""
    for i in range(1000, -1, -1):
        candidate = color.mix(ink, bg, i / 1000)
        if color.contrast(candidate, bg) >= floor and color.contrast(candidate, surface) >= floor:
            return candidate
    return ink


def _value_of(ref, base):
    return base[ref] if ref in base else _hex(ref)


def eval_tone_value(value, base, out):
    """One role of a tone. Role names mean the preset's own roles; `out` holds the roles of this tone resolved so far."""
    if isinstance(value, str):
        return _value_of(value, base)
    (key, args), = value.items()
    ground, surface = out.get("bg", base["bg"]), out.get("surface", base["surface"])
    if key == "mix":
        return color.mix(_value_of(args[0], base), _value_of(args[1], base), args[2])
    if key == "lightness":
        _, chroma, hue = color.to_oklch(_value_of(args[0], base))
        return color.from_oklch(args[1], chroma, hue)
    if key == "muted":
        return solve_muted(out.get("ink", base["ink"]), ground, surface, args)
    for role in args[0]:                      # pick: the first candidate that reaches the floor against this tone's own bg, else the LAST candidate (resolve.js)
        if color.contrast(_value_of(role, base), ground) >= args[1]:
            return _value_of(role, base)
    return _value_of(args[0][-1], base)


def complete_bundle(five, preset, base):
    """The eight roles of a tone from its five: accent2 stays the preset's (its accent when it gives none), onAccent and line are derived
    once from the tone, the way resolve.js derives them."""
    bundle = dict(five)
    bundle["accent2"] = base["accent2"]
    bundle["onAccent"] = color.on_color(five["accent"])
    bundle["line"] = color.mix(five["ink"], five["bg"], LINE_MIX)
    return bundle


def resolve_tone(preset, tone):
    """(bundle, problems) for one tone of a preset. `base` is the preset's own roles. bundle is None when the grammar is broken or when the
    preset has no usable roles; problems are plain-English reasons."""
    base = base_roles(preset)
    if base is None:
        return None, []
    if tone == "base":
        return complete_bundle({key: base[key] for key in TONE_ROLES}, preset, base), []
    roles = _d(_d(preset.get("tones")).get(tone)).get("roles")
    if not isinstance(roles, dict):
        return None, ["tone %s has no roles object" % tone]
    problems = ["%s.%s: %s" % (tone, key, why) for key in TONE_ROLES if key in roles for why in tone_shape_errors(roles[key])]
    problems += ["%s.%s is missing: a tone defines all five roles" % (tone, key) for key in TONE_ROLES if key not in roles]
    problems += ["%s.%s is not a tone role (%s)" % (tone, key, " ".join(TONE_ROLES)) for key in roles if key not in TONE_ROLES]
    if problems:
        return None, problems
    out = {}
    for key in TONE_ROLES:                    # bg, surface, ink first: muted and pick read them
        out[key] = eval_tone_value(roles[key], base, out)
    return complete_bundle(out, preset, base), []


def resolve_tones(preset):
    """{tone: bundle} for base and every tone the preset declares (a tone with a broken grammar is left out)."""
    declared = _d(preset.get("tones"))
    out = {}
    for name in TONE_NAMES:
        if name == "base" or name in declared:
            bundle, _ = resolve_tone(preset, name)
            if bundle:
                out[name] = bundle
    return out


def bundle_pairs(bundle, body, highlight):
    """Every text pair the engine and the chrome read from one tone: (code, where, fg, bg, floor, used by). The header and the footer sit on
    the slide ground, so the chrome inks are the pairs on bg (the handle and save pill take ink; meta, counter and swipe take inkMuted)."""
    pairs = [("tones.text", "ink on bg", bundle["ink"], bundle["bg"], body, "body text; chrome: handle and save pill"),
             ("tones.text", "ink on surface", bundle["ink"], bundle["surface"], body, "text on cards, tiles and chips"),
             ("tones.text", "inkMuted on bg", bundle["inkMuted"], bundle["bg"], body, "captions; chrome: meta, counter and swipe"),
             ("tones.text", "inkMuted on surface", bundle["inkMuted"], bundle["surface"], body, "captions on cards"),
             ("tones.on-accent", "onAccent on accent", bundle["onAccent"], bundle["accent"], body, "text on accent chips and bars, the save pill")]
    if highlight:                             # G5: decor.highlight "color" makes the accent a text colour
        pairs += [("graphics.highlight", "accent on bg", bundle["accent"], bundle["bg"], body, "G5: the accent colours text"),
                  ("graphics.highlight", "accent on surface", bundle["accent"], bundle["surface"], body, "G5: the accent colours text")]
    return pairs


def lint_tones(preset):
    """One pass over the invert and field tones the preset declares (spec 6.0; `tone_contrast.py` is its specification): the grammar of each,
    then bundle_pairs() on the resolved eight roles. The base tone's text pairs stay with lint_contrast."""
    declared = _d(preset.get("tones"))
    if not declared or base_roles(preset) is None:
        return []
    body = _num(_d(preset.get("floors")).get("contrastBody"), 4.5)
    highlight = _d(preset.get("decor")).get("highlight") == "color"
    findings = []
    for name in TONE_NAMES[1:]:
        if name not in declared:
            continue
        bundle, problems = resolve_tone(preset, name)
        findings += [Finding("ERROR", "tones.grammar", "tones.%s" % name, why) for why in problems]
        if bundle is None:
            continue
        for code, where, fg, bg, floor, used in bundle_pairs(bundle, body, highlight):
            ratio = color.contrast(fg, bg)
            if ratio < floor:
                findings.append(Finding("ERROR", code, "%s: %s" % (name, where), "%.2f:1 is below the floor %.1f:1 (%s)" % (ratio, floor, used)))
    return findings


def _ref(name, bundle, support, tint, note=None):
    """A fill or outline reference (a role of the tone, support1/support2, tint, note, paper or a hex) as a colour, or None: kit.role, src/art/kit.js."""
    if not isinstance(name, str):
        return None
    if name in bundle:
        return bundle[name]
    return {"support1": support[0], "support2": support[1], "tint": tint, "note": note, "paper": bundle["surface"]}.get(name) or _hex(name)


def tint_of(bundle):
    """kit.palette's tint tile: the accent mixed into the surface until the ink reads on it (a dark surface is its own tint)."""
    if color.luminance(bundle["surface"]) < 0.2:
        return bundle["surface"]
    t = 0.62
    tint = color.mix(bundle["accent"], bundle["surface"], t)
    while t < 0.98 and color.contrast(bundle["ink"], tint) < 4.5:
        t += 0.04
        tint = color.mix(bundle["accent"], bundle["surface"], t)
    return tint


def glyph_on(fill, bundle):
    """kit.on: the colour a glyph takes on a filled tile (the tile's own on-colour first, else the better of black and white)."""
    order = ([bundle["onAccent"], bundle["ink"], bundle["bg"]] if fill == bundle["accent"] else
             [bundle["bg"], bundle["surface"], bundle["onAccent"]] if fill == bundle["ink"] else
             [bundle["ink"], bundle["onAccent"], bundle["bg"]])
    for candidate in order:
        if color.contrast(candidate, fill) >= 4.5:
            return candidate
    return "#111111" if color.contrast("#111111", fill) >= color.contrast("#FFFFFF", fill) else "#FFFFFF"


def plate_pair(treatment, art, bundle, support, tint, note=None):
    """(fill, glyph, declared, ref) of one plate treatment in one tone, resolved the way kit.frame resolves them (src/art/kit.js): the fill is art.fills[treatment],
    else the container defaults (an outlined disc gives chip, sticker and giant the accent; a square container gives the tile the ink), else PLATE_FILL; the glyph is
    kit.on(fill) on chip, tile, sticker and badge and the tone's ink on duo and giant. None for bare and ring (no plate) and for a reference that does not resolve.
    tests/unit/py/test_preset_lint.py runs the real kit.frame on the same inputs and compares."""
    if treatment not in PLATE_FILL:
        return None
    declared = _d(art.get("fills")).get(treatment)
    container, mark = art.get("container") or "square", art.get("mark") or "fill"
    default = ("accent" if treatment in ("chip", "sticker", "giant") and mark == "outline" and container == "disc" else
               "ink" if treatment == "tile" and container == "square" else PLATE_FILL[treatment])
    ref = declared or default
    fill = _ref(ref, bundle, support, tint, note)
    if not fill:
        return None
    return fill, (bundle["ink"] if treatment in INK_GLYPH_TREATMENTS else glyph_on(fill, bundle)), bool(declared), ref


def lint_graphics(preset, chart_gap=CHART_GAP_PX):
    """The graphic rules of spec 6.0 on a preset that declares `art` or `tones` (a legacy preset has no boundary policy to check):
    G1/G2 the boundary rule on the accent and the two support hues, G3 the glyph on a filled tile, G4 adjacent chart marks, G6 support 1
    never carries a glyph (S-8). G5 (the accent as a text colour) is in bundle_pairs. art.objectOutline stays inside 0.03-0.04 (S-2)."""
    art, declared, base = _d(preset.get("art")), _d(preset.get("tones")), base_roles(preset)
    if (not art and not declared) or base is None:
        return []
    large = _num(_d(preset.get("floors")).get("contrastLarge"), 3.0)
    highlight = _d(preset.get("decor")).get("highlight") == "color"
    findings = []
    mark, outline_px = ("outline" if art.get("mark") == "outline" else "fill"), _num(art.get("outline"), 0)
    if mark == "outline" and outline_px < OUTLINE_MIN_PX:
        findings.append(Finding("ERROR", "graphics.mark", "art.mark", "art.mark is \"outline\" but art.outline is %s px; G1 needs at least %d px" % (outline_px, OUTLINE_MIN_PX)))
    carried = mark == "outline" and outline_px >= OUTLINE_MIN_PX        # G1: the outline carries the boundary, the fill is free
    low, high = OBJECT_OUTLINE_RANGE
    if "objectOutline" in art and not (isinstance(art["objectOutline"], (int, float)) and low <= art["objectOutline"] <= high):
        findings.append(Finding("ERROR", "art.object-outline", "art.objectOutline", "%r is outside %s-%s (S-2: an object's outline is that share of its size)" % (art["objectOutline"], low, high)))
    fills = _d(art.get("fills"))
    for key in sorted(fills):
        if key not in TREATMENT_NAMES:
            findings.append(Finding("WARN", "art.fills-key", "art.fills.%s" % key, "not an icon treatment (%s); the kit ignores it" % " ".join(TREATMENT_NAMES)))
    support = [_hex(s) for s in _l(_d(art.get("colors")).get("support"))]
    support = (support + [None, None])[:2]
    note = _hex(_d(art.get("colors")).get("note")) or base["surface"]      # resolve.js: tone.note = ref(colors.note || "surface") on the preset's own roles
    for tone, bundle in resolve_tones(preset).items():
        if tone == "base" and not art:
            continue
        grounds = (("bg", bundle["bg"]), ("surface", bundle["surface"]))
        tint = tint_of(bundle)
        explicit = _hex(_d(preset.get("roles")).get("accent2"))      # a preset without its own accent2 has none to check (it follows the base accent)
        refs = [("accent", bundle["accent"])] + ([("accent2", bundle["accent2"])] if explicit and bundle["accent2"] != bundle["accent"] else [])
        refs += [("support %d" % (i + 1), c) for i, c in enumerate(support) if c and tone == "base"]
        if carried:
            outline = _ref(art.get("outlineColor") or "ink", bundle, support, tint)
            for gname, ground in grounds:
                ratio = color.contrast(outline, ground) if outline else 0
                if ratio < large:
                    findings.append(Finding("ERROR", "graphics.outline", "%s: outline on %s" % (tone, gname), "the %d px outline is %.2f:1 against the ground; G1 needs %.1f:1" % (outline_px, ratio, large)))
        else:
            for cname, colour in refs:
                if cname == "accent" and highlight and tone != "base":
                    continue                  # G5 holds the accent to 4.5:1 already
                for gname, ground in grounds:
                    ratio = color.contrast(colour, ground)
                    if ratio < large:
                        findings.append(Finding("ERROR", "graphics.fill", "%s: %s on %s" % (tone, cname, gname),
                                                "%.2f:1 against the ground and no outline of %d px or more; G2 needs %.1f:1 (or art.mark \"outline\")" % (ratio, OUTLINE_MIN_PX, large)))
        for treatment in GLYPH_TREATMENTS:    # G3 and G6 on every plate the kit can draw, declared or default (duo and giant draw their glyph in ink)
            pair = plate_pair(treatment, art, bundle, support, tint, note)
            if not pair:
                continue
            fill, glyph, declared, ref = pair
            where = "%s: art.fills.%s" % (tone, treatment) if declared else "%s: %s (default %s)" % (tone, treatment, ref)
            if declared and (ref == "support1" or (support[0] and fill == support[0])):
                findings.append(Finding("ERROR", "graphics.support-glyph", where,
                                        "support 1 carries a glyph on this %s; it is for objects and graphics only (G6, S-8): bind the %s to the accent" % (treatment, treatment)))
            ratio = color.contrast(glyph, fill)
            if ratio < 4.5:
                findings.append(Finding("ERROR", "graphics.glyph", where, "the %s glyph on this %s is %.2f:1; G3 needs 4.5:1%s%s" % (
                    "ink" if treatment in INK_GLYPH_TREATMENTS else "on-colour", treatment, ratio,
                    " (a %s draws its glyph in ink, so the plate must read with ink in this tone)" % treatment if treatment in INK_GLYPH_TREATMENTS else "",
                    "" if declared else "; this is the kit's default plate: declare art.fills.%s (\"surface\" is a plate ink reads on in every tone)" % treatment)))
        if tone == "base" and all(support):   # G4: adjacent chart marks are 3:1 apart, or something separates them
            for (aname, a), (bname, b) in ((("accent", bundle["accent"]), ("support 1", support[0])), (("support 1", support[0]), ("support 2", support[1]))):
                ratio = color.contrast(a, b)
                if ratio < large and not carried and chart_gap < CHART_GAP_MIN_PX:
                    findings.append(Finding("ERROR", "graphics.chart", "%s next to %s" % (aname, bname), "%.2f:1 apart with a %s px gap and no outline of %d px; G4 needs 3:1 or a gap or outline of %d px (the chart builders contract %s px: tests/preset-lint/chart-separation.json)" % (
                        ratio, chart_gap, OUTLINE_MIN_PX, CHART_GAP_MIN_PX, CHART_GAP_PX)))
    return findings


HEX_STOP = re.compile(r"^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$")


def lint_background(preset):
    """A gradient's stops (and a solid or paper `params.role` that is not bg) are role names or hex colours: the resolver paints the
    background colour in place of anything else, silently. The text colours must reach the floors on every one of them."""
    spec, base = _d(preset.get("background")), base_roles(preset)
    params = _d(spec.get("params"))
    if base is None or spec.get("kind") not in ("solid", "gradient", "paper"):
        return []
    entries = []
    if spec["kind"] == "gradient":
        for i, stop in enumerate(_l(params.get("stops"))):
            entries.append(("stop %d" % (i + 1), "background.params.stops[%d]" % i, stop[0] if isinstance(stop, (list, tuple)) and stop else None))
    elif params.get("role") not in (None, "bg"):
        entries.append(("role", "background.params.role", params.get("role")))
    floors = _d(preset.get("floors"))
    body, large = _num(floors.get("contrastBody"), 4.5), _num(floors.get("contrastLarge"), 3.0)
    findings = []
    for label, where, ref in entries:
        colour = base.get(ref) if isinstance(ref, str) and ref in BASE_ROLE_NAMES else _hex(ref) if isinstance(ref, str) and HEX_STOP.match(ref) else None
        if not colour:
            findings.append(Finding("ERROR", "background.stop", where, "%r is neither a role name nor a hex colour; the resolver paints the bg colour instead" % (ref,)))
            continue
        for name, fg in (("ink", base["ink"]), ("inkMuted", base["inkMuted"])):
            ratio = color.contrast(fg, colour)
            if ratio < body:
                findings.append(Finding(_severity(ratio, body, large), "contrast", "%s on background %s" % (name, label), "%.2f:1 is below the floor %.1f:1 (the engine would have to nudge it)" % (ratio, body)))
    return findings


def lint_strict(preset):
    """--strict asks for the rebuilt look: art, both tones and two support hues (spec 6.0)."""
    findings = []
    art = _d(preset.get("art"))
    if not art:
        findings.append(Finding("ERROR", "strict.art", "art", "a strict preset declares its art block (spec 6.0); without it the slides render in the 1.0 look"))
    declared = _d(preset.get("tones"))
    for name in TONE_NAMES[1:]:
        if name not in declared:
            findings.append(Finding("ERROR", "strict.tones", "tones.%s" % name, "a strict preset defines the %s tone (all five roles)" % name))
    support = _d(art.get("colors")).get("support")
    if art and not (isinstance(support, list) and len(support) == 2):
        findings.append(Finding("ERROR", "strict.support", "art.colors.support", "a strict preset carries its two support hues (spec 6.0)"))
    return findings


def archetype_variants(archetypes_file):
    text = Path(archetypes_file).read_text(encoding="utf-8")
    out = {}
    for m in re.finditer(r"<template\b[^>]*data-archetype=\"([a-z-]+)\"[^>]*>", text):
        v = re.search(r"data-variants=\"([^\"]*)\"", m.group(0))
        out[m.group(1)] = v.group(1).split() if v else []
    return out


def lint_variants_chrome(preset, offered):
    findings = []
    for typ, variants in (preset.get("variants") or {}).items():
        if typ not in offered:
            findings.append(Finding("ERROR", "variants.type", typ, "unknown slide type"))
            continue
        for v in variants:
            if v not in offered[typ]:
                findings.append(Finding("ERROR", "variants.flag", "%s/%s" % (typ, v), "the %s archetype offers only: %s" % (typ, " ".join(offered[typ]))))
    chrome = preset.get("chrome") or {}
    for key, cfg in chrome.items():
        slot = (cfg or {}).get("slot")
        if slot and not SLOT_RE.match(slot):
            findings.append(Finding("ERROR", "chrome.slot", "%s.slot" % key, "%r is not header|footer-start|center|end" % slot))
    for typ in (chrome.get("savePill") or {}).get("showOn", []):
        if typ not in SLIDE_TYPES:
            findings.append(Finding("ERROR", "chrome.save-pill", typ, "unknown slide type"))
    style = (chrome.get("swipe") or {}).get("style")
    if style and style not in ("label+chevron", "label", "chevron", "none"):
        findings.append(Finding("ERROR", "chrome.swipe", style, "swipe style is label+chevron, label, chevron or none"))
    motion = preset.get("motion") or {}
    allowed = motion.get("allowed", [])
    for rec in allowed:
        if rec not in RECIPES:
            findings.append(Finding("ERROR", "motion.recipe", rec, "unknown motion recipe"))
    if motion.get("default") and motion["default"] not in allowed:
        findings.append(Finding("ERROR", "motion.default", motion["default"], "the default recipe must be in `allowed`"))
    return findings


def lint_preset(pdir, ctx):
    pid = pdir.name
    strict = bool(ctx.get("strict"))
    chart_gap = ctx.get("chart_gap", CHART_GAP_PX)
    findings = []
    pj, css = pdir / "preset.json", pdir / "decor.css"
    if not pj.is_file():
        return [Finding("ERROR", "files.preset", "preset.json", "missing")]
    try:
        preset = paths.read_json(pj, strict_keys=True)
    except ValueError as exc:
        return [Finding("ERROR", "json", "preset.json", str(exc))]
    for e in schema.validate_named("preset", preset):
        findings.append(Finding("ERROR", "schema", e["path"] or "/", "%s: %s" % (e["keyword"], e["message"])))
    if preset.get("id") != pid:
        findings.append(Finding("ERROR", "schema.id", "id", "%r does not match the folder name %r" % (preset.get("id"), pid)))
    if not css.is_file():
        findings.append(Finding("ERROR", "files.decor", "decor.css", "missing"))
    else:
        findings += lint_css(css.read_text(encoding="utf-8"), pid, strict)
    findings += lint_fonts(preset, ctx["registry"], ctx["coverage"])
    findings += lint_contrast(preset)
    findings += lint_background(preset)
    findings += lint_tones(preset)
    findings += lint_graphics(preset, chart_gap)
    if strict:
        findings += lint_strict(preset)
    if ctx["offered"] is not None:
        findings += lint_variants_chrome(preset, ctx["offered"])
    entry = next((p for p in ctx["index"].get("presets", []) if p.get("id") == pid), None)
    if entry is None:
        findings.append(Finding("WARN", "index.entry", pid, "not listed in styles/index.json (run --write-index)"))
    else:
        prev = entry.get("preview")
        if prev and not (pdir.parent / prev).is_file():
            findings.append(Finding("ERROR", "preview.missing", prev, "index.json points at a file that does not exist"))
    return findings


def build_index(styles_dir, index, ctx):
    order = [p["id"] for p in index.get("presets", [])]
    for d in sorted(styles_dir.iterdir()):
        if d.is_dir() and (d / "preset.json").is_file() and d.name not in order:
            order.append(d.name)
    entries = []
    for pid in order:
        d = styles_dir / pid
        if not (d / "preset.json").is_file():
            continue
        preset = paths.read_json(d / "preset.json")
        old = next((p for p in index.get("presets", []) if p.get("id") == pid), {})
        entries.append({"id": pid, "version": preset["version"], "dir": pid, "name": preset["name"], "bestFor": preset.get("bestFor", []),
                        "ships": preset.get("ships", "1.0"), "preview": "%s/preview.png" % pid if (d / "preview.png").is_file() else None,
                        "fonts": font_ids(preset)})
        entries[-1]["preview"] = entries[-1]["preview"] if entries[-1]["preview"] else old.get("preview") if old.get("preview") and (styles_dir / old["preview"]).is_file() else None
    return {"schemaVersion": 1, "version": index.get("version", "1.0.0"), "default": index.get("default", entries[0]["id"] if entries else "swiss"), "presets": entries}


# ---- occasion packs ---------------------------------------------------------------------------------------------------------

OVERLAY_KEYS = ("roles.accent2", "background.texture", "decor.motif")


def lint_occasion(odir, shipped):
    findings = []
    pj = odir / "pack.json"
    if not pj.is_file():
        return [Finding("ERROR", "files.pack", "pack.json", "missing")]
    try:
        pack = paths.read_json(pj, strict_keys=True)
    except ValueError as exc:
        return [Finding("ERROR", "json", "pack.json", str(exc))]
    for e in schema.validate_named("occasion", pack):
        findings.append(Finding("ERROR", "schema", e["path"] or "/", "%s: %s" % (e["keyword"], e["message"])))
    overlay = pack.get("overlay") or {}
    for key in overlay.get("allowedKeys", []):
        if key not in OVERLAY_KEYS:
            findings.append(Finding("ERROR", "overlay.key", key, "a pack may only touch %s" % ", ".join(OVERLAY_KEYS)))
    for pid in pack.get("presetsAllowed", []):
        if pid not in shipped:
            findings.append(Finding("ERROR", "presets.unknown", pid, "not a shipped preset"))
    for svg in odir.rglob("*.svg"):
        text = svg.read_text(encoding="utf-8")
        if re.search(r"<script|href\s*=\s*[\"']https?:|xlink:href\s*=\s*[\"']https?:|url\(\s*https?:", text, re.I):
            findings.append(Finding("ERROR", "motif.external", svg.name, "a motif must be self-contained: no scripts, no network references"))
        if len(text.encode("utf-8")) > 64 * 1024:
            findings.append(Finding("ERROR", "motif.size", svg.name, "larger than 64 KiB"))
    return findings


# ---- main ---------------------------------------------------------------------------------------------------------------------


def build_parser():
    p = Parser(prog="preset_lint.py", description="Lint Carousel Studio presets and occasion packs.")
    g = p.add_mutually_exclusive_group(required=True)
    g.add_argument("--all", action="store_true", help="every preset folder of --styles")
    g.add_argument("--preset", help="one preset folder")
    g.add_argument("--occasion", help="one occasion pack folder")
    p.add_argument("--styles", default=str(SKILL / "styles"), help="styles folder (default: this skill's)")
    p.add_argument("--fonts", default=str(SKILL / "fonts"), help="fonts folder with registry.json and coverage.json")
    p.add_argument("--archetypes", default=str(SKILL / "templates" / "archetypes.html"), help="archetypes.html")
    s = p.add_mutually_exclusive_group()
    s.add_argument("--strict", action="store_true", help="the rebuilt look (spec 6.8): decor.css <= 25 KiB without outline, border-image or color-mix, art and both tones declared")
    s.add_argument("--no-strict", action="store_true", help="lint as the legacy presets are linted (overrides STRICT_DEFAULT)")
    p.add_argument("--chart-gap", type=_gap, default=CHART_GAP_PX, metavar="PX",
                   help="G4: the gap in px the chart builders leave between adjacent marks (default %d, the contract of tests/preset-lint/chart-separation.json; use a measured value to audit it)" % CHART_GAP_PX)
    p.add_argument("--write-index", action="store_true", help="regenerate styles/index.json")
    p.add_argument("--format", choices=("text", "json"), default="text")
    return p


def _gap(text):
    try:
        value = float(text)
    except ValueError:
        value = -1.0
    if not 0 <= value <= 4096:                    # also refuses nan and inf
        raise argparse.ArgumentTypeError("%r is not a gap in px (a number from 0 to 4096)" % text)
    return int(value) if value == int(value) else value


def load_json(path, what):
    p = Path(path)
    if not p.is_file():
        sys.stderr.write("cs-error: E_USAGE: %s not found: %s\n" % (what, p))
        sys.exit(66)
    try:
        return paths.read_json(p)
    except ValueError as exc:
        sys.stderr.write("cs-error: E_SCHEMA: %s is not valid JSON: %s\n" % (what, exc))
        sys.exit(65)


def main(argv=None):
    args = build_parser().parse_args(argv)
    strict = args.strict or (STRICT_DEFAULT and not args.no_strict)
    styles = Path(args.styles)
    fonts = Path(args.fonts)
    index_path = styles / "index.json"
    index = load_json(index_path, "styles/index.json") if index_path.is_file() else {"presets": []}
    results = {}
    set_findings = None
    if args.occasion:
        shipped = [p["id"] for p in index.get("presets", [])]
        results[Path(args.occasion).name] = lint_occasion(Path(args.occasion), shipped)
    else:
        ctx = {"registry": load_json(fonts / "registry.json", "fonts/registry.json"), "coverage": load_json(fonts / "coverage.json", "fonts/coverage.json"),
               "offered": archetype_variants(args.archetypes) if Path(args.archetypes).is_file() else None, "index": index, "strict": strict,
               "chart_gap": args.chart_gap}
        dirs = sorted(d for d in styles.iterdir() if d.is_dir() and (d / "preset.json").exists()) if args.all else [Path(args.preset)]
        if not dirs:
            sys.stderr.write("cs-error: E_USAGE: no preset folders in %s\n" % styles)
            return 66
        for d in dirs:
            results[d.name] = lint_preset(d, ctx)
        if args.all:
            set_findings = lint_preset_set(styles, index)
        if args.write_index:
            new = build_index(styles, index, ctx)
            paths.write_json(index_path, new)
            if args.format == "text":
                sys.stdout.write("styles/index.json rewritten (%d presets)\n" % len(new["presets"]))
    everything = list(results.values()) + ([set_findings] if set_findings is not None else [])
    errors = sum(1 for fs in everything for f in fs if f["sev"] == "ERROR")
    warns = sum(1 for fs in everything for f in fs if f["sev"] == "WARN")
    if args.format == "json":
        doc = {"ok": not errors, "strict": strict, "chartGap": args.chart_gap, "errors": errors, "warnings": warns, "results": results}
        if set_findings is not None:
            doc["set"] = set_findings
        sys.stdout.write(json.dumps(doc, ensure_ascii=False, indent=2) + "\n")
    else:
        for name, fs in list(results.items()) + ([("(set)", set_findings)] if set_findings is not None else []):
            sys.stdout.write("%s  %s\n" % (name, "ok" if not fs else "%d finding(s)" % len(fs)))
            for f in fs:
                sys.stdout.write("  %-5s %-22s %s  %s\n" % (f["sev"], f["code"], f["where"], f["message"]))
        sys.stdout.write("%d preset(s): %d error(s), %d warning(s)\n" % (len(results), errors, warns))
    return 2 if errors else 1 if warns else 0


if __name__ == "__main__":
    sys.exit(main())
