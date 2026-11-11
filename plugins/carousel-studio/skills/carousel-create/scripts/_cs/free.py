"""The free design lane validator (``data/free-design.json``): the Python twin of the JavaScript sanitizer's refusals.

A slide of any type except the cover may carry ``free = {"html", "css", "locked"}``: the Art Director's hand-composed inner slide. This
module reads the contract and reports, with a clear message each, everything the engine would remove or refuse:

* ``free.html``  only the allowed tags and attributes, classes ``f-*`` / ``cs-*``, no ``style`` / ``id`` / ``on*`` / ``href`` / ``src``,
  ``data-field`` values from the allowed list that point at a field the slide really has, ``data-icon`` names of the icon pack,
  ``data-object`` ids of the object library, ``data-mark`` / ``data-size`` / ``data-treatment`` / ``data-tone`` / ``data-from`` values
  of the contract, no comments. The HTML is read with ``html.parser``, never with a regular expression.
* ``free.css``  rules only (no at-rule), selectors made of classes, allowed tags, attribute selectors on the allowed attributes,
  ``:first-child`` / ``:last-child`` / ``:nth-child()`` and ``::before`` / ``::after``; properties from the allow-list; none of the
  forbidden values; no letter-spacing, italic or justify; ``font-family`` only from ``fontFamilyValues``; ``background`` a colour or a
  ``linear-gradient(<angle>deg, ...)``; ``transform`` only rotate, scale and translate; ``content`` only quoted text.
* the cover: a cover slide never carries ``free``.

``check_spec(spec) -> (structure, notes)`` is what ``validate.py`` calls: ``structure`` holds ``{path, message}`` findings (they fail the
document), ``notes`` holds ``{path, code, message}`` advice (badly nested markup). The text of a free slide is read by ``text.free_text``.
"""
from __future__ import annotations

import re
from html import unescape
from html.parser import HTMLParser

from . import CSError, paths
from .text import portable_regex

NOTE_NESTING = "FREE.nesting"
NOTE_BIDI = "FREE.bidi"
MAX_FINDINGS = 40  # per slide and per part: a hostile blob must not flood the report

_VOID = frozenset(("area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"))
_OPTIONAL_CLOSE = frozenset(("p", "li"))  # an unclosed <p> or <li> is valid HTML
_DIRS = ("ltr", "rtl", "auto")
_TOKEN_VALUE = re.compile("^[A-Za-z0-9._-]{1,64}$")  # data-edit, data-role: a name, never a sentence or a URL
_INDEX = re.compile("^(0|[1-9][0-9]*)$")
_CONTROL = re.compile("[\\x00-\\x08\\x0b\\x0c\\x0e-\\x1f\\x7f]")
_WS = re.compile("[ \\t\\n\\r\\f\\v\\u00A0\\u202F]+")

_ROOT_FIELDS = ("title", "body", "headline", "sub", "kicker", "bridge", "attribution")

# ---- data ---------------------------------------------------------------------------------------------------------------
_cache: dict = {}


def contract() -> dict:
    """``data/free-design.json`` of this skill."""
    doc = _cache.get("contract")
    if doc is None:
        path = paths.data_path("free-design.json")
        try:
            doc = paths.read_json(path)
        except (OSError, ValueError) as exc:
            raise CSError("E_DEP_LOAD", "the free design contract data/free-design.json is missing or unreadable: %s" % exc) from exc
        _cache["contract"] = doc
    return doc


def _library(name: str):
    """The set of icon names (``pack.json``) or object ids (``objects.json``), or None when this skill does not carry the library."""
    if name not in _cache:
        found = None
        path = paths.data_path("icons", name + ".json")
        if path.is_file():
            try:
                doc = paths.read_json(path)
                if name == "pack":
                    found = frozenset(doc["icons"])
                else:
                    found = frozenset(o["id"] for o in doc["objects"] if isinstance(o, dict) and "id" in o)
            except (OSError, ValueError, KeyError, TypeError):
                found = None
        _cache[name] = found
    return _cache[name]


def use(blocks=None) -> None:
    """Tests: inject ``{"contract": dict, "pack": set of names, "objects": set of ids}`` (a missing key is read from disk); no argument resets."""
    _cache.clear()
    _cache.update(blocks or {})


# ---- fields -------------------------------------------------------------------------------------------------------------
def _filled(v) -> bool:
    return isinstance(v, str) and v.strip() != ""


def _field_allowed(value: str, allowed) -> bool:
    parts = value.split(".")
    for entry in allowed:
        pat = entry.split(".")
        if len(pat) == len(parts) and all(p == q or (p == "N" and _INDEX.match(q)) for p, q in zip(pat, parts)):
            return True
    return False


def field_value(slide: dict, ref: str):
    """What ``data-field="ref"`` shows on ``slide``, or None when the slide has nothing there (the field is absent or empty)."""
    parts = ref.split(".")
    head = parts[0]

    def at(seq, idx):
        return seq[int(idx)] if isinstance(seq, list) and int(idx) < len(seq) else None

    def text(holder, key):
        v = holder.get(key) if isinstance(holder, dict) else None
        return v if _filled(v) else None

    if len(parts) == 1:
        if head in _ROOT_FIELDS:
            return text(slide, head)
        if head == "ord":
            v = slide.get("ord")
            return v if isinstance(v, int) and not isinstance(v, bool) else None
        if head == "number":
            n = slide.get("number")
            return n if isinstance(n, dict) and _filled(n.get("value")) else None
        return None
    if head == "bullets" and len(parts) == 2:
        v = at(slide.get("bullets"), parts[1])
        return v if _filled(v) else None
    if head in ("sides", "items") and len(parts) == 3:
        return text(at(slide.get(head), parts[1]), parts[2])
    if head == "cta" and parts[1:] == ["text"]:
        return text(slide.get("cta"), "text")
    if head == "demo" and len(parts) == 4 and parts[1] == "lines":
        demo = slide.get("demo")
        return text(at(demo.get("lines") if isinstance(demo, dict) else None, parts[2]), parts[3])
    return None


# ---- HTML ---------------------------------------------------------------------------------------------------------------
class _Html(HTMLParser):
    def __init__(self, doc: dict, slide: dict, add, note) -> None:
        super().__init__(convert_charrefs=False)  # entities arrive apart, so a '<' in the text is a real one
        self.c, self.slide, self.add, self.note = doc, slide, add, note
        self.tags = frozenset(doc["html"]["tags"])
        self.attrs = frozenset(doc["html"]["attributes"])
        self.class_rx = portable_regex(doc["html"]["classPattern"])
        art = doc["art"]
        self.icon_sizes, self.object_sizes = tuple(art["icon"]["sizes"]), tuple(art["object"]["sizes"])
        self.treatments, self.marks = tuple(art["icon"]["treatments"]), tuple(art["mark"]["values"])
        self.tones, self.froms = tuple(art["tone"]["values"]), tuple(art["chat"]["values"])
        self.fields = tuple(doc["fields"]["allowed"])
        self.stack: list[tuple[str, bool]] = []  # (tag, carries class f-chat)
        self.pictures: set[int] = set()

    def where(self) -> str:
        line, col = self.getpos()
        return "line %d, column %d" % (line, col + 1)

    # structure
    def handle_starttag(self, tag, attrs) -> None:
        if self.pictures:
            self.add("a picture placeholder must be empty (%s)" % self.where())
        chat = self.element(tag, attrs)
        if tag not in _VOID:
            self.stack.append((tag, chat))
            if any(name == "data-picture" for name, _value in attrs):
                self.pictures.add(len(self.stack))

    def handle_endtag(self, tag) -> None:
        if tag not in [t for t, _c in self.stack]:
            if tag not in _VOID:
                self.note("</%s> closes nothing (%s)" % (tag, self.where()))
            return
        while self.stack:
            top, _c = self.stack.pop()
            if top == tag:
                break
            if top not in _OPTIONAL_CLOSE:
                self.note("<%s> is not closed before </%s> (%s)" % (top, tag, self.where()))
        self.pictures = {depth for depth in self.pictures if depth <= len(self.stack)}

    def handle_entityref(self, name):
        self.mark_readable(unescape("&" + name + ";"))

    def handle_charref(self, name):
        self.mark_readable(unescape("&#" + name + ";"))

    def mark_readable(self, data):
        if self.pictures and data.strip():
            self.add("a picture placeholder must be empty (%s)" % self.where())

    def handle_data(self, data) -> None:
        self.mark_readable(data)
        if "<" in data:
            self.add("a '<' in the text must be written &lt; (%s); an unfinished tag looks like this" % self.where())

    def handle_comment(self, data) -> None:
        self.add("comments are not allowed (%s)" % self.where())

    def handle_decl(self, decl) -> None:
        self.add("<!...> declarations are not allowed (%s)" % self.where())

    def unknown_decl(self, data) -> None:
        self.add("<![...]> sections are not allowed (%s)" % self.where())

    def handle_pi(self, data) -> None:
        self.add("<?...> instructions are not allowed (%s)" % self.where())

    def finish(self) -> None:
        for tag, _c in self.stack:
            if tag not in _OPTIONAL_CLOSE:
                self.note("<%s> is never closed" % tag)

    # one element
    def element(self, tag, attrs) -> bool:
        if tag not in self.tags:
            self.add("<%s> is not an allowed tag (%s). Allowed: %s" % (tag, self.where(), ", ".join(sorted(self.tags))))
        values: dict = {}
        for name, raw in attrs:
            value = "" if raw is None else raw
            if name in values:
                self.add("<%s> repeats the attribute %s (%s)" % (tag, name, self.where()))
                continue
            values[name] = value
            if name == "style":
                self.add("style attributes are not allowed on <%s> (%s): put the rules in free.css" % (tag, self.where()))
            elif name == "id":
                self.add("id is not allowed on <%s> (%s): use a class" % (tag, self.where()))
            elif name.startswith("on"):
                self.add("event handler %s is not allowed on <%s> (%s)" % (name, tag, self.where()))
            elif name in ("href", "src", "srcset", "xlink:href", "action", "formaction", "poster"):
                self.add("%s is not allowed on <%s> (%s): use data-picture for an asset, data-icon or data-object for art" % (
                    name, tag, self.where()))
            elif name not in self.attrs:
                self.add("attribute %s is not allowed on <%s> (%s)" % (name, tag, self.where()))
            else:
                self.value(tag, name, value)
        for name in ("data-size", "data-treatment", "data-from"):
            if name in values:
                self.relations(tag, name, values)
        if "data-picture" in values:
            if tag != "div" or not re.fullmatch(r"[A-Za-z0-9_-]{1,64}", values["data-picture"]):
                self.add("data-picture needs an empty div and an asset id, not a URL (%s)" % self.where())
            if set(values) - {"class", "data-picture", "data-fit"}:
                self.add("a picture placeholder allows only class, data-picture and data-fit (%s)" % self.where())
        elif "data-fit" in values:
            self.add("data-fit belongs to a picture placeholder (%s)" % self.where())
        return "f-chat" in values.get("class", "").split()

    def bad(self, tag, name, value, what) -> None:
        self.add("%s=%r on <%s> %s (%s)" % (name, value, tag, what, self.where()))

    def value(self, tag, name, value) -> None:
        if name == "class":
            for cls in value.split():
                if not self.class_rx.search(cls):
                    self.add("class %s on <%s> does not match %s (%s)" % (cls, tag, self.c["html"]["classPattern"], self.where()))
        elif name == "dir":
            if value not in _DIRS:
                self.bad(tag, name, value, "must be one of " + ", ".join(_DIRS))
        elif name == "data-field":
            self.field(tag, value)
        elif name == "data-fit":
            if value not in ("cover", "contain"):
                self.bad(tag, name, value, "must be cover or contain")
        elif name == "data-icon":
            names = _library("pack")
            if names is not None and value not in names:
                self.bad(tag, name, value, "is not an icon of data/icons/pack.json")
        elif name == "data-object":
            ids = _library("objects")
            if ids is not None and value not in ids:
                self.bad(tag, name, value, "is not an object of data/icons/objects.json")
        elif name == "data-mark":
            if value not in self.marks:
                self.bad(tag, name, value, "is not a mark. Allowed: " + ", ".join(self.marks))
        elif name == "data-tone":
            if value not in self.tones:
                self.bad(tag, name, value, "is not a tone. Allowed: " + ", ".join(self.tones))
        elif name in ("data-edit", "data-role"):
            if not _TOKEN_VALUE.match(value):
                self.bad(tag, name, value, "must be a short name of letters, digits, dot, dash or underscore")
        # data-size, data-treatment and data-from depend on their element: see relations()

    def field(self, tag, value) -> None:
        if not _field_allowed(value, self.fields):
            self.add("data-field=%r on <%s> is not an allowed field (%s). Allowed: %s" % (value, tag, self.where(), ", ".join(self.fields)))
        elif field_value(self.slide, value) is None:
            self.add("data-field=%r on <%s> points at a field this %s slide does not have, or has empty (%s)" % (
                value, tag, self.slide.get("type"), self.where()))

    def relations(self, tag, name, values) -> None:
        value = values[name]
        if name == "data-size":
            if "data-object" in values:
                allowed, what = self.object_sizes, "an object"
            elif "data-icon" in values:
                allowed, what = self.icon_sizes, "an icon"
            else:
                allowed, what = tuple(dict.fromkeys(self.icon_sizes + self.object_sizes)), "an element"
            if value not in allowed:
                self.bad(tag, name, value, "is not a size of %s. Allowed: %s" % (what, ", ".join(allowed)))
        elif name == "data-treatment":
            if value not in self.treatments:
                self.bad(tag, name, value, "is not a treatment. Allowed: " + ", ".join(self.treatments))
        elif name == "data-from":
            if value not in self.froms:
                self.bad(tag, name, value, "must be " + " or ".join(self.froms))
            elif tag not in ("p", "div"):
                self.bad(tag, name, value, "belongs on a <p> or <div>")
            elif not any(chat for _t, chat in self.stack):
                self.bad(tag, name, value, "needs a container with class f-chat")


def check_html(html, slide: dict, doc: dict | None = None) -> tuple[list[str], list[str]]:
    """``(findings, notes)`` for one ``free.html``: findings are refusals, notes are advice on the nesting."""
    doc = doc or contract()
    findings: list[str] = []
    notes: list[str] = []

    def add(message: str) -> None:
        if message not in findings and len(findings) < MAX_FINDINGS:
            findings.append(message)

    def note(message: str) -> None:
        if message not in notes and len(notes) < MAX_FINDINGS:
            notes.append(message)

    if not isinstance(html, str):
        return ["free.html must be a string"], notes
    size, cap = len(html.encode("utf-8")), doc["html"]["maxBytes"]
    if size > cap:
        add("free.html is %d bytes, the limit is %d" % (size, cap))
    if html.strip() == "":
        add("free.html is empty")
    if _CONTROL.search(html):
        add("free.html contains control characters")
    parser = _Html(doc, slide, add, note)
    parser.feed(html)
    # feed() buffers an incomplete token. Some CPython patch versions discard it
    # in close() without a handle_data callback, so validate the tail first.
    if "<" in parser.rawdata:
        parser.handle_data(parser.rawdata)
        if "<!" in parser.rawdata:
            add("free.html contains a comment or a declaration (<!...)")
    parser.close()
    parser.finish()
    if "<!" in html and not any(("comments" in f or "declarations" in f or "sections" in f) for f in findings):
        add("free.html contains a comment or a declaration (<!...)")
    return findings, notes


# ---- CSS ----------------------------------------------------------------------------------------------------------------
_ARABIC_PROPERTY = {
    "letter-spacing": "letter-spacing is never used: it breaks the joining of Arabic letters",
    "word-spacing": "word-spacing is never used on Arabic",
    "font-style": "italic and oblique are never used on Arabic",
    "font": "the font shorthand is refused (it can carry italic and a font that is not the preset's): use font-size, font-weight, font-family",
    "opacity": "opacity on text is refused: use a colour token such as var(--cs-ink-muted)",
    "text-align-last": "text-align-last is refused (justify is never used)",
    "text-justify": "text-justify is refused (justify is never used)",
}
_TRANSFORMS = ("rotate", "scale", "scalex", "scaley", "translate", "translatex", "translatey")
_MATH = ("var", "calc", "min", "max", "clamp")
_NTH = re.compile("^(odd|even|[+-]?[0-9]+|[+-]?[0-9]*n([ ]*[+-][ ]*[0-9]+)?)$")
_PSEUDO = re.compile("(::?)([a-z-]+)(\\(([^)]*)\\))?", re.IGNORECASE)
_ANGLE = re.compile("^-?[0-9]+([.][0-9]+)?deg$")
_HEX = re.compile("^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$")
_IDENT = re.compile("^[a-z]+$")
_COLOR_FUNCTIONS = ("rgb(", "rgba(", "hsl(", "hsla(", "var(", "color-mix(")
_RESOURCE_CALL = re.compile("(^|[^a-z0-9_-])(src|image|paint|cross-fade)[ ]*\\(")  # more ways to load a resource than url()
_TO_SIDE = re.compile("(^|[^a-z0-9-])to (top|bottom|left|right)([^a-z0-9-]|$)")
_IMPORTANT = re.compile("[ ]*![ ]*important[ ]*$", re.IGNORECASE)
_FUNCTION = re.compile("([a-z0-9-]+)[ ]*\\(")


def _strip_css(css: str, add) -> tuple[str, str]:
    """``(clean, shape)``: the CSS with comments replaced by a space; ``shape`` is the same text with the inside of every quoted string
    turned into ``x`` (same length), so structure is read from ``shape`` and text from ``clean``. A backslash outside a string is
    refused (a CSS escape can spell ``url(``)."""
    clean, shape = [], []
    i, n, quote = 0, len(css), ""
    while i < n:
        ch = css[i]
        if quote:
            if ch == "\\" and i + 1 < n:
                clean.append(css[i:i + 2])
                shape.append("xx")
                i += 2
                continue
            if ch == quote or ch == "\n":
                if ch == "\n":
                    add("free.css has an unterminated quoted string")
                quote = ""
                clean.append(ch)
                shape.append(ch)
            else:
                clean.append(ch)
                shape.append("x")
            i += 1
            continue
        if ch == "/" and css.startswith("/*", i):
            end = css.find("*/", i + 2)
            i = n if end < 0 else end + 2
            clean.append(" ")
            shape.append(" ")
            continue
        if ch == "\\":
            add("free.css contains a backslash outside quoted text: escapes are refused")
        if ch in "\"'":
            quote = ch
        clean.append(ch)
        shape.append(ch)
        i += 1
    if quote:
        add("free.css has an unterminated quoted string")
    return "".join(clean), "".join(shape)


def _top_split(text: str, seps: str) -> list[str]:
    """Split ``text`` on any char of ``seps`` outside parentheses; parts trimmed, empty ones dropped."""
    parts, depth, cur = [], 0, []
    for ch in text:
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth = max(0, depth - 1)
        if depth == 0 and ch in seps:
            parts.append("".join(cur).strip())
            cur = []
        else:
            cur.append(ch)
    parts.append("".join(cur).strip())
    return [p for p in parts if p]


def _is_colour(token: str) -> bool:
    t = token.strip()
    return bool(_HEX.match(t) or t.lower().startswith(_COLOR_FUNCTIONS) or _IDENT.match(t.lower()))


def _split_declarations(clean: str, shape: str) -> list[tuple[str, str]]:
    cuts, depth, start = [], 0, 0
    for i, ch in enumerate(shape):
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth = max(0, depth - 1)
        elif ch == ";" and depth == 0:
            cuts.append((start, i))
            start = i + 1
    cuts.append((start, len(shape)))
    return [(clean[a:b], shape[a:b]) for a, b in cuts if shape[a:b].strip()]


class _Css:
    def __init__(self, doc: dict, add) -> None:
        css = doc["css"]
        self.add = add
        self.props = frozenset(css["properties"])
        self.forbidden = tuple(v.lower() for v in css["forbiddenValues"])
        self.families = frozenset(_WS.sub(" ", v) for v in css["fontFamilyValues"])
        self.tags = frozenset(doc["html"]["tags"])
        self.attrs = frozenset(doc["html"]["attributes"])
        self.class_rx = portable_regex(doc["html"]["classPattern"])
        self.class_pattern = doc["html"]["classPattern"]

    # selectors
    def selector(self, text: str) -> bool:
        """Check one comma-free selector; True when it ends in ::before or ::after."""
        s = text.strip()
        i, n = 0, len(s)
        if not s:
            self.add("free.css has an empty selector")
            return False
        ends_pseudo = False
        while i < n:
            ch = s[i]
            if ch in " \t\r\n>+~":
                i += 1
                continue
            ends_pseudo = False
            if ch == ".":
                j = i + 1
                while j < n and (s[j].isalnum() or s[j] in "-_"):
                    j += 1
                name = s[i + 1:j]
                if not self.class_rx.search(name):
                    self.add("selector %r: class .%s does not match %s" % (s, name, self.class_pattern))
                i = j
            elif ch == "[":
                j = s.find("]", i)
                if j < 0:
                    self.add("selector %r has an unclosed [" % s)
                    return False
                attr = re.split("[~|^$*]?=", s[i + 1:j], maxsplit=1)[0].strip().lower()
                if attr not in self.attrs:
                    self.add("selector %r: [%s] is not an attribute a free slide may carry" % (s, attr))
                i = j + 1
            elif ch == ":":
                m = _PSEUDO.match(s, i)
                if not m:
                    self.add("selector %r has a pseudo class that is not allowed" % s)
                    return False
                colons, name, paren, arg = m.group(1), m.group(2).lower(), m.group(3), m.group(4)
                if colons == "::" and name in ("before", "after") and paren is None:
                    ends_pseudo = True
                elif colons == ":" and name in ("first-child", "last-child") and paren is None:
                    pass
                elif colons == ":" and name == "nth-child" and arg is not None and _NTH.match(arg.strip().lower()):
                    pass
                else:
                    self.add("selector %r: %s%s is not allowed (only :first-child, :last-child, :nth-child(), ::before, ::after)" % (
                        s, colons, name))
                i = m.end()
            elif ch == "#":
                self.add("selector %r: id selectors are not allowed" % s)
                return False
            elif ch.isalpha():
                j = i
                while j < n and (s[j].isalnum() or s[j] == "-"):
                    j += 1
                tag = s[i:j].lower()
                if tag not in self.tags:
                    self.add("selector %r: <%s> is not an allowed tag" % (s, tag))
                i = j
            else:
                self.add("selector %r: %r is not allowed in a selector" % (s, ch))
                return False
        return ends_pseudo

    # declarations
    def declaration(self, prop: str, clean_value: str, shape_value: str, pseudo: bool) -> None:
        prop = prop.strip().lower()
        if prop not in self.props:
            sides = {"left": "inline-start", "right": "inline-end", "top": "block-start", "bottom": "block-end"}
            m = re.fullmatch(r"(?:(border|padding|margin)-)?(left|right|top|bottom)", prop)
            names = [(m[1] or "inset") + "-" + sides[m[2]]] if m else [prop + "-start", prop + "-end"] if prop in ("inset-block", "inset-inline") else []
            hint = " Use " + " and ".join(n for n in names if n in self.props) + "." if names else " Use the logical properties listed in free-design.md."
            self.add((_ARABIC_PROPERTY.get(prop) or "property %s is not allowed" % prop) + hint)
            return
        value, shape = clean_value.strip(), shape_value.strip()
        flat = _WS.sub(" ", shape.lower())
        if _IMPORTANT.search(flat):
            self.add("%s: !important is refused" % prop)
            value, shape, flat = (_IMPORTANT.sub("", x) for x in (value, shape, flat))
        if not value:
            self.add("%s has no value" % prop)
            return
        for bad in self.forbidden:
            if bad.startswith("to "):
                if _TO_SIDE.search(flat):
                    self.add("%s: gradient directions with 'to' are refused, write the angle (linear-gradient(135deg, ...))" % prop)
                    break
            elif bad in flat:
                self.add("%s: %s is refused" % (prop, bad))
        found = _RESOURCE_CALL.search(flat)
        if found:
            self.add("%s: %s() is refused (it loads a resource)" % (prop, found.group(2)))
        if prop == "font-family":
            for fam in _top_split(value, ","):
                if _WS.sub(" ", fam) not in self.families:
                    self.add("font-family %s is refused: only %s" % (fam, ", ".join(sorted(self.families))))
        elif prop == "text-align" and "justify" in flat:
            self.add("text-align: justify is never used on Arabic")
        elif prop == "position" and flat in ("fixed", "sticky"):
            self.add("position: %s is refused" % flat)
        elif prop == "transform":
            for name in _FUNCTION.findall(flat):
                if name not in _TRANSFORMS and name not in _MATH:
                    self.add("transform: %s() is refused, only rotate, scale and translate" % name)
        elif prop == "content":
            quoted = len(shape) >= 2 and shape[0] in "\"'" and shape[-1] == shape[0] and set(shape[1:-1]) <= {"x"}
            if not quoted:
                self.add("content takes one quoted text only, like \"\" or \"-\"")
            if not pseudo:
                self.add("content is only allowed on ::before and ::after")
        elif prop in ("background", "background-color"):
            self.background(prop, value)

    def background(self, prop: str, value: str) -> None:
        tokens = _top_split(value, " \t\r\n")
        gradients = [t for t in tokens if "gradient(" in t.lower()]
        if gradients:
            g = gradients[0]
            if prop != "background" or len(tokens) != 1 or not g.lower().startswith("linear-gradient(") or not g.endswith(")"):
                self.add("%s accepts a colour or linear-gradient(<angle>deg, ...) only" % prop)
                return
            args = _top_split(g[len("linear-gradient("):-1], ",")
            if len(args) < 3 or not _ANGLE.match(args[0].lower()):
                self.add("linear-gradient needs an angle in deg and at least two colour stops, like linear-gradient(135deg, a, b)")
            return
        if len(tokens) != 1 or not _is_colour(tokens[0]):
            self.add("%s accepts a colour or linear-gradient(<angle>deg, ...) only, not %r" % (prop, value))

    def run(self, css: str) -> None:
        clean, shape = _strip_css(css, self.add)
        if "<" in clean:
            self.add("free.css must not contain '<'")
        i, n = 0, len(shape)
        while i < n:
            if shape[i] in " \t\r\n;":
                i += 1
                continue
            if shape[i] == "@":
                m = re.match("@[A-Za-z-]+", shape[i:])
                name = m.group(0).lower() if m else "@"
                self.add("%s is not allowed: a free slide is rules only, it has no at-rules" % name)
                j = i
                while j < n and shape[j] not in ";{":
                    j += 1
                if j < n and shape[j] == "{":
                    depth = 0
                    while j < n:
                        depth += (shape[j] == "{") - (shape[j] == "}")
                        j += 1
                        if depth == 0:
                            break
                else:
                    j += 1
                i = j
                continue
            brace = shape.find("{", i)
            if brace < 0:
                self.add("free.css has text outside a rule: %r" % clean[i:i + 40].strip())
                return
            end, depth = brace, 0
            while end < n:
                depth += (shape[end] == "{") - (shape[end] == "}")
                if depth == 0:
                    break
                end += 1
            if depth != 0:
                self.add("free.css has an unclosed {")
            flags = [self.selector(sel) for sel in _top_split(clean[i:brace], ",")]
            if not flags:
                self.add("free.css has a rule with no selector")
            pseudo = bool(flags) and all(flags)
            body_clean, body_shape = clean[brace + 1:end], shape[brace + 1:end]
            if "{" in body_shape:
                self.add("rules inside a rule (nesting) are not allowed")
            for dec_clean, dec_shape in _split_declarations(body_clean, body_shape):
                colon = dec_shape.find(":")
                if colon < 0:
                    self.add("declaration %r has no colon" % dec_clean.strip()[:40])
                    continue
                self.declaration(dec_clean[:colon], dec_clean[colon + 1:], dec_shape[colon + 1:], pseudo)
            i = end + 1


def check_css(css, doc: dict | None = None) -> list[str]:
    """The refusals for one ``free.css`` (an empty list when it is clean)."""
    doc = doc or contract()
    findings: list[str] = []

    def add(message: str) -> None:
        if message not in findings and len(findings) < MAX_FINDINGS:
            findings.append(message)

    if not isinstance(css, str):
        return ["free.css must be a string"]
    size, cap = len(css.encode("utf-8")), doc["css"]["maxBytes"]
    if size > cap:
        add("free.css is %d bytes, the limit is %d" % (size, cap))
    if _CONTROL.search(css):
        add("free.css contains control characters")
    _Css(doc, add).run(css)
    return findings


# ---- a number and its Latin unit in two elements ----------------------------------------------------------------------
# The engine isolates "3.5 GB" written as one piece of text. Written as two elements (<span>3.5</span><span>GB</span>) inside
# right-to-left text, each part is isolated on its own, and a row on one line then shows "GB 3.5". This note catches it before render.
_NUM_END = re.compile("[0-9٠-٩۰-۹][0-9٠-٩۰-۹.,٫٬]*$")
_UNIT = re.compile("^[A-Za-z][A-Za-z0-9/.+-]*( [A-Za-z][A-Za-z0-9/.+-]*)?$")  # GB, ms, MB/s, tokens, K tok
_LATIN = re.compile("[A-Za-z]")
_ARABIC = re.compile("[؀-ۿݐ-ݿࢠ-ࣿ]")
_INLINE_TAGS = frozenset(("span", "b", "strong", "em", "small", "mark", "bdi"))
_RULE = re.compile("([^{}]+)\\{([^{}]*)\\}")


class _Tree(HTMLParser):
    """A light tree of the free html: elements as dicts, text as strings. Only for reading order, never for rendering."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.root = {"tag": "main", "attrs": {}, "kids": []}
        self.stack = [self.root]

    def handle_starttag(self, tag, attrs) -> None:
        node = {"tag": tag, "attrs": {k: (v or "") for k, v in attrs}, "kids": []}
        self.stack[-1]["kids"].append(node)
        if tag not in _VOID:
            self.stack.append(node)

    def handle_endtag(self, tag) -> None:
        for i in range(len(self.stack) - 1, 0, -1):
            if self.stack[i]["tag"] == tag:
                del self.stack[i:]
                return

    def handle_data(self, data) -> None:
        self.stack[-1]["kids"].append(data)


def _css_rules(css) -> list:
    """``(classes, tag, declarations)`` of each plain rule: the last compound of each selector, without pseudo parts."""
    out = []
    for selectors, body in _RULE.findall(css if isinstance(css, str) else ""):
        decls = {}
        for d in body.split(";"):
            if ":" in d:
                k, v = d.split(":", 1)
                decls[k.strip().lower()] = v.strip().lower()
        for sel in selectors.split(","):
            last = re.split("[\\s>+~]+", sel.strip())[-1] if sel.strip() else ""
            if not last or ":" in last or "[" in last:
                continue
            tag = re.match("^[a-z0-9]+", last)
            out.append((set(re.findall("\\.([A-Za-z0-9_-]+)", last)), tag.group(0) if tag else "", decls))
    return out


def _props(node, rules) -> dict:
    if not isinstance(node, dict):
        return {}
    classes, merged = set(node["attrs"].get("class", "").split()), {}
    for need, tag, decls in rules:
        if (need or tag) and need <= classes and (not tag or tag == node["tag"]):
            merged.update(decls)
    return merged


def _text(node, slide) -> str:
    if isinstance(node, str):
        return node
    ref = node["attrs"].get("data-field")
    if ref:
        v = field_value(slide, ref)
        return v if isinstance(v, str) else ""
    return "" if node["tag"] == "br" else "".join(_text(k, slide) for k in node["kids"])


def _one_line(parent, a, b, rules) -> bool:
    """True when ``a`` and ``b`` sit side by side: a flex row, a grid with columns, or inline elements in normal flow."""
    p = _props(parent, rules)
    display = p.get("display", "")
    if "flex" in display:
        return "column" not in p.get("flex-direction", "")
    if "grid" in display:
        return "grid-template-columns" in p or "column" in p.get("grid-auto-flow", "")

    def inline(n) -> bool:
        if isinstance(n, str):
            return True
        own = _props(n, rules).get("display", "")
        return n["tag"] in _INLINE_TAGS and not (own and own.split()[0] in ("block", "flex", "grid", "list-item"))

    return inline(a) and inline(b)


def _label(node) -> str:
    cls = node["attrs"].get("class", "")
    return "<%s%s>" % (node["tag"], ' class="%s"' % cls if cls else "")


def bidi_notes(slide: dict) -> list:
    """Advice for an Arabic slide: a number and a Latin unit in two elements of one row, with no ``dir="ltr"`` around them."""
    free = slide.get("free") if isinstance(slide, dict) else None
    if not isinstance(free, dict) or not isinstance(free.get("html"), str):
        return []
    tree = _Tree()
    try:
        tree.feed(free["html"])
        tree.close()
    except Exception:  # the structure checks report broken markup; this advice simply stays silent
        return []
    rules, notes = _css_rules(free.get("css")), []

    def walk(node, rtl: bool) -> None:
        d = node["attrs"].get("dir") or ("auto" if node["tag"] == "bdi" else "")
        if d == "auto":
            t = _text(node, slide)
            lat, ar = _LATIN.search(t), _ARABIC.search(t)
            d = "ltr" if lat and (not ar or lat.start() < ar.start()) else "rtl" if ar else ""
        rtl = rtl if d not in ("ltr", "rtl") else d == "rtl"
        if node["attrs"].get("data-field"):
            return
        items = []
        for k in node["kids"]:
            if isinstance(k, str) and not k.strip():
                continue
            items.append(None if isinstance(k, dict) and k["tag"] == "br" else k)
        for a, b in zip(items, items[1:]):
            if not rtl or a is None or b is None:
                continue
            ta, tb = _WS.sub(" ", _text(a, slide)).strip(), _WS.sub(" ", _text(b, slide)).strip()
            if _NUM_END.search(ta) and _UNIT.match(tb) and _one_line(node, a, b, rules):
                num = _NUM_END.search(ta).group(0)
                notes.append('"%s" and "%s" are two elements inside right-to-left text, so the slide shows "%s %s". Add dir="ltr" to %s '
                             'that holds both (its row then runs left to right: check the alignment), or write "%s %s" as one text.'
                             % (num, tb, tb, num, _label(node), num, tb))
        for k in node["kids"]:
            if isinstance(k, dict):
                walk(k, rtl)

    walk(tree.root, True)
    return list(dict.fromkeys(notes))[:MAX_FINDINGS]


# ---- a slide, a spec ----------------------------------------------------------------------------------------------------
def check_slide(slide: dict, doc: dict | None = None) -> tuple[list[dict], list[dict]]:
    """``(findings, notes)`` of one slide, each ``{"part": "free" | "free/html" | "free/css", "message"}``."""
    free = slide.get("free")
    if free is None:
        return [], []
    doc = doc or contract()
    found: list[dict] = []
    notes: list[dict] = []
    if slide.get("type") == "cover":
        found.append({"part": "free", "message": "a cover slide cannot carry a free design (%s)" % doc.get("appliesTo", "the cover keeps the engine designs")})
    if isinstance(free, dict):
        findings, nesting = check_html(free.get("html"), slide, doc)
        found += [{"part": "free/html", "message": m} for m in findings]
        notes += [{"part": "free/html", "message": m} for m in nesting]
        if free.get("css") is not None:
            found += [{"part": "free/css", "message": m} for m in check_css(free.get("css"), doc)]
    return found, notes


def has_free(spec: dict) -> bool:
    slides = spec.get("slides") if isinstance(spec, dict) else None
    return isinstance(slides, list) and any(isinstance(s, dict) and s.get("free") is not None for s in slides)


def check_spec(spec: dict) -> tuple[list[dict], list[dict]]:
    """``(structure, notes)`` for every free slide of ``spec``: ``structure`` = ``[{path, message}]``, ``notes`` = ``[{path, code, message}]``."""
    structure: list[dict] = []
    notes: list[dict] = []
    if not has_free(spec):
        return structure, notes
    doc = contract()
    locale = spec.get("locale") if isinstance(spec.get("locale"), dict) else {}
    rtl = locale.get("dialect") != "en"
    for i, slide in enumerate(spec["slides"]):
        if not isinstance(slide, dict) or slide.get("free") is None:
            continue
        found, advice = check_slide(slide, doc)
        base = "/slides/%d/" % i
        structure += [{"path": base + f["part"], "message": f["message"]} for f in found]
        notes += [{"path": base + f["part"], "code": NOTE_NESTING, "message": f["message"]} for f in advice]
        if rtl:
            notes += [{"path": base + "free/html", "code": NOTE_BIDI, "message": m} for m in bidi_notes(slide)]
    return structure, notes
