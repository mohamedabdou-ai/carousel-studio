"""Tests for the free design lane (data/free-design.json): the `free` property of a slide in spec.schema.json, the HTML and CSS validator
(_cs/free.py, run by validate.py), the text twin (_cs/text.py free_text and the keyed fields of the text gates) and the shipped example.

Run: python -m pytest tests/unit/py/test_free_design.py -q
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

try:
    import b7_support as support
except ImportError:  # the folder is a package here
    from . import b7_support as support

REPO = Path(__file__).resolve().parents[3]
SKILLS = REPO / "plugins" / "carousel-studio" / "skills"
DESIGN = SKILLS / "carousel-design"
EXAMPLE = REPO / "docs" / "examples" / "spec.free.example.json"
ENV = {**os.environ, "PYTHONIOENCODING": "utf-8", "PYTHONUTF8": "1"}

free = text = schema = qa = None

# A slide that carries every field a data-field may name.
SLIDE = {
    "id": "s03", "n": 3, "type": "item", "ord": 2, "kicker": "ك", "headline": "هيدلاين", "sub": "فرعي", "title": "عنوان", "body": "نص",
    "bridge": "جسر", "attribution": "اسم", "number": {"value": "5", "unit": "%"}, "bullets": ["أ", "ب"],
    "sides": [{"label": "ل١", "text": "ن١"}, {"label": "ل٢", "text": "ن٢"}],
    "items": [{"title": "ع", "text": "ت", "value": "9"}], "cta": {"kind": "save", "text": "احفظ"},
    "demo": {"lines": [{"who": "me", "text": "أهلا"}, {"who": "them", "text": "يا هلا"}]},
}


def setUpModule() -> None:
    global free, text, schema, qa
    support.prepare("carousel-design")
    from _cs import free as _free, qa as _qa, schema as _schema, text as _text
    free, text, schema, qa = _free, _text, _schema, _qa


def tearDownModule() -> None:
    support.cleanup()


def load_example() -> dict:
    return json.loads(EXAMPLE.read_text(encoding="utf-8"))


def html_findings(html: str, slide: dict | None = None) -> list[str]:
    return free.check_html(html, slide or SLIDE)[0]


def html_notes(html: str, slide: dict | None = None) -> list[str]:
    return free.check_html(html, slide or SLIDE)[1]


def css_findings(css: str) -> list[str]:
    return free.check_css(css)


class FreeHtmlAccepts(unittest.TestCase):
    def ok(self, html: str, slide: dict | None = None) -> None:
        self.assertEqual(html_findings(html, slide), [], html)

    def test_plain_tags_classes_and_literal_text(self) -> None:
        self.ok('<div class="f-wrap cs-note"><h2 class="f-t">عنوان حر</h2><p dir="rtl">نص <strong>مهم</strong> و<em>مميز</em><br>سطر</p>'
                '<ul><li>أ</li><li>ب</li></ul><figure><figcaption><small>تعليق</small></figcaption></figure><bdi>ChatGPT</bdi></div>')

    def test_every_field_the_contract_allows(self) -> None:
        refs = ["title", "body", "headline", "sub", "kicker", "bridge", "ord", "number", "attribution", "bullets.0", "bullets.1",
                "sides.0.label", "sides.1.text", "items.0.title", "items.0.text", "items.0.value", "cta.text", "demo.lines.1.text"]
        for ref in refs:
            self.ok('<p data-field="%s"></p>' % ref)

    def test_art_attributes(self) -> None:
        self.ok('<span data-icon="bookmark" data-size="xl" data-treatment="sticker"></span>')
        self.ok('<div data-object="lightbulb" data-size="hero" data-tone="s2" data-mark="scribble"></div>')
        self.ok('<div class="f-chat"><p data-from="them">أهلا</p><div><p data-from="me" data-field="demo.lines.0.text"></p></div></div>')
        self.ok('<div data-tone="invert" data-edit="hero.title" data-role="hero"></div>')

    def test_every_listed_icon_size_treatment_mark_and_tone(self) -> None:
        doc = free.contract()
        for size in doc["art"]["icon"]["sizes"]:
            self.ok('<span data-icon="check" data-size="%s"></span>' % size)
        for treatment in doc["art"]["icon"]["treatments"]:
            self.ok('<span data-icon="check" data-treatment="%s"></span>' % treatment)
        for size in doc["art"]["object"]["sizes"]:
            self.ok('<div data-object="trophy" data-size="%s"></div>' % size)
        for mark in doc["art"]["mark"]["values"]:
            self.ok('<span data-mark="%s">كلمة</span>' % mark)
        for tone in doc["art"]["tone"]["values"]:
            self.ok('<div data-tone="%s"></div>' % tone)

    def test_entities_and_unclosed_li_or_p_are_fine(self) -> None:
        self.ok("<ul><li>أ<li>ب</ul><p>فقرة &amp; &lt;نص&gt; &#1633;")
        self.assertEqual(html_notes("<ul><li>أ<li>ب</ul><p>فقرة"), [])


class FreeHtmlRejects(unittest.TestCase):
    def bad(self, html: str, needle: str, slide: dict | None = None) -> None:
        found = html_findings(html, slide)
        self.assertTrue(any(needle in f for f in found), "%r -> %r" % (html, found))

    def test_script_and_the_other_forbidden_elements(self) -> None:
        for tag in ("script", "style", "iframe", "svg", "img", "a", "link", "object", "textarea"):
            self.bad("<%s>x</%s>" % (tag, tag), "<%s> is not an allowed tag" % tag)
        self.bad("<img src=x onerror=alert(1)>", "<img> is not an allowed tag")
        self.bad("<SCRIPT>alert(1)</SCRIPT>", "<script> is not an allowed tag")
        self.bad("<scr<script>ipt>alert(1)</scr</script>ipt>", "<script> is not an allowed tag")

    def test_event_handlers(self) -> None:
        self.bad('<div onclick="alert(1)">x</div>', "event handler onclick")
        self.bad('<p ONMOUSEOVER="x()">x</p>', "event handler onmouseover")
        self.bad("<span onerror=alert(1)>x</span>", "event handler onerror")

    def test_style_id_href_src(self) -> None:
        self.bad('<div style="color:red">x</div>', "style attributes are not allowed")
        self.bad('<div id="a">x</div>', "id is not allowed")
        self.bad('<a href="javascript:alert(1)">x</a>', "href is not allowed")
        self.bad('<span href="x">x</span>', "href is not allowed")
        self.bad('<span src="x">x</span>', "src is not allowed")
        self.bad('<div class="f-a" title="x">x</div>', "attribute title is not allowed")
        self.bad('<div xlink:href="javascript:alert(1)">x</div>', "xlink:href is not allowed")

    def test_javascript_url_cannot_hide_in_an_allowed_attribute(self) -> None:
        self.bad('<div data-role="javascript:alert(1)">x</div>', "data-role")
        self.bad('<div data-edit="a b">x</div>', "data-edit")
        self.bad('<div class="javascript:alert(1)">x</div>', "does not match")

    def test_classes(self) -> None:
        self.bad('<div class="hero">x</div>', "class hero")
        self.bad('<div class="f-ok Bad">x</div>', "class Bad")
        self.bad('<div class="f-">x</div>', "class f-")

    def test_unknown_and_missing_fields(self) -> None:
        self.bad('<p data-field="secret"></p>', "not an allowed field")
        self.bad('<p data-field="notes"></p>', "not an allowed field")
        self.bad('<p data-field="bullets.x"></p>', "not an allowed field")
        self.bad('<p data-field="bullets.01"></p>', "not an allowed field")
        self.bad('<p data-field="items.0.icon"></p>', "not an allowed field")
        self.bad('<p data-field="bullets.5"></p>', "points at a field this item slide does not have", SLIDE)
        self.bad('<p data-field="title"></p>', "points at a field", {"id": "s09", "type": "item", "body": "x"})
        self.bad('<p data-field="title"></p>', "points at a field", {"id": "s09", "type": "item", "title": "   "})
        self.bad('<p data-field></p>', "not an allowed field")

    def test_unknown_icons_objects_and_art_values(self) -> None:
        self.bad('<span data-icon="no-such-icon"></span>', "not an icon of data/icons/pack.json")
        self.bad('<span data-icon=""></span>', "not an icon")
        self.bad('<div data-object="no-such-object"></div>', "not an object of data/icons/objects.json")
        self.bad('<span data-icon="check" data-size="huge"></span>', "not a size of an icon")
        self.bad('<div data-object="trophy" data-size="xs"></div>', "not a size of an object")
        self.bad('<span data-treatment="glow"></span>', "not a treatment")
        self.bad('<span data-mark="star"></span>', "not a mark")
        self.bad('<div data-tone="s3"></div>', "not a tone")
        self.bad('<div class="f-chat"><p data-from="you">x</p></div>', "data-from")

    def test_chat_bubbles_need_a_chat_container_and_a_p_or_div(self) -> None:
        self.bad('<div><p data-from="me">x</p></div>', "needs a container with class f-chat")
        self.bad('<div class="f-chat"><span data-from="me">x</span></div>', "belongs on a <p> or <div>")

    def test_dir_values(self) -> None:
        self.bad('<p dir="sideways">x</p>', "dir=")

    def test_comments_declarations_and_raw_angle_brackets(self) -> None:
        self.bad("<div><!-- note --></div>", "comments are not allowed")
        self.bad("<!DOCTYPE html><div></div>", "declarations are not allowed")
        self.bad("<div><![CDATA[x]]></div>", "sections are not allowed")
        self.bad("<div>a < b</div>", "'<' in the text")
        self.bad('<div><img src=x onerror=alert(1)', "'<' in the text")
        self.bad("<div><!-- never closed", "comment or a declaration")

    def test_size_limit_empty_and_control_characters(self) -> None:
        limit = free.contract()["html"]["maxBytes"]
        self.bad("<p>" + "ا" * (limit // 2) + "</p>", "bytes, the limit is %d" % limit)
        self.bad("   ", "is empty")
        self.bad("<p>a\x00b</p>", "control characters")
        self.assertEqual(html_findings("<p>" + "a" * (limit - 8) + "</p>"), [])

    def test_a_hostile_blob_is_capped(self) -> None:
        found = html_findings("".join('<div onclick="x%d">' % i for i in range(300)))
        self.assertEqual(len(found), free.MAX_FINDINGS)

    def test_nesting_problems_are_notes_not_refusals(self) -> None:
        html = "<div><span>x</div></span><b>y"
        self.assertEqual(html_findings(html), [])
        notes = html_notes(html)
        self.assertTrue(any("is not closed before" in n for n in notes), notes)
        self.assertTrue(any("closes nothing" in n for n in notes), notes)
        self.assertTrue(any("never closed" in n for n in notes), notes)


class FreeCss(unittest.TestCase):
    def ok(self, css: str) -> None:
        self.assertEqual(css_findings(css), [], css)

    def bad(self, css: str, needle: str) -> None:
        found = css_findings(css)
        self.assertTrue(any(needle in f for f in found), "%r -> %r" % (css, found))

    def test_accepts_the_allowed_surface(self) -> None:
        self.ok(".f-a { display: grid; gap: var(--cs-gap); padding: 24px 32px; color: var(--cs-ink); background-color: var(--cs-surface); }")
        self.ok(".f-a, .f-b > p + p { font-family: var(--cs-font-display); font-size: var(--cs-fs-hero); font-weight: 700; line-height: 1.3; }")
        self.ok("div.f-a:first-child, li:last-child, .f-a:nth-child(2n+1), .f-a:nth-child(odd) { margin-inline-start: 12px; }")
        self.ok('[data-tone="invert"] .f-a, p[data-field] { border: 4px solid var(--cs-line); border-radius: 24px; }')
        self.ok('.f-a::before { content: "•"; } .f-b::after { content: ""; }')
        self.ok(".f-a { background: linear-gradient(135deg, var(--cs-surface), #fff); transform: rotate(-3deg) scale(1.1) translate(4px, 2px); }")
        self.ok(".f-a { background: #1a2b3c; box-shadow: 0 8px 0 rgba(0, 0, 0, 0.2); grid-template-areas: \"a b\" \"c c\"; }")
        self.ok("/* a comment */ .f-a { z-index: 2; } /* another */")

    def test_url_and_the_other_value_functions(self) -> None:
        self.bad(".f-a { background: url(x.png); }", "url( is refused")
        self.bad(".f-a { background: url(javascript:alert(1)); }", "url( is refused")
        self.bad(".f-a { background-color: URL( x ); }", "url( is refused")
        self.bad(".f-a { width: expression(alert(1)); }", "expression( is refused")
        self.bad(".f-a { background: image-set(x 1x); }", "image-set( is refused")
        self.bad(".f-a { background: element(#x); }", "element( is refused")
        self.bad(".f-a { background: src(x); }", "src() is refused")

    def test_escapes_cannot_spell_a_forbidden_value(self) -> None:
        self.bad(".f-a { background: u\\72l(x.png); }", "backslash")
        self.ok('.f-a::before { content: "\\201C"; }')

    def test_at_rules(self) -> None:
        for rule in ("@import url(x.css);", "@font-face { font-family: x; }", "@keyframes a { from { color: red; } }",
                     "@media (min-width: 1px) { .f-a { color: red; } }", "@supports (display: grid) { .f-a { color: red; } }",
                     "@layer x { .f-a { color: red; } }", "@page { margin: 0; }", "@charset 'utf-8';"):
            self.bad(rule + " .f-a { color: red; }", "is not allowed: a free slide is rules only")

    def test_properties_outside_the_allow_list(self) -> None:
        self.bad(".f-a { opacity: 0.5; }", "opacity on text is refused")
        self.bad(".f-a { cursor: pointer; }", "property cursor is not allowed")
        self.bad(".f-a { -moz-binding: x; }", "property -moz-binding is not allowed")
        self.bad(".f-a { behavior: x; }", "property behavior is not allowed")
        self.bad(".f-a { --x: 1; }", "property --x is not allowed")
        self.bad(".f-a { animation: x 1s; }", "property animation is not allowed")

    def test_arabic_rules(self) -> None:
        self.bad(".f-a { letter-spacing: 2px; }", "letter-spacing is never used")
        self.bad(".f-a { word-spacing: 4px; }", "word-spacing is never used")
        self.bad(".f-a { font-style: italic; }", "italic and oblique are never used")
        self.bad(".f-a { font: italic 700 40px x; }", "font shorthand is refused")
        self.bad(".f-a { text-align: justify; }", "justify is never used")
        self.bad(".f-a { text-align-last: justify; }", "justify is never used")
        self.bad(".f-a { transform: skewX(-10deg); }", "skewx() is refused")
        self.ok(".f-a { text-align: center; } .f-b { text-align: start; }")

    def test_font_family_only_from_the_preset(self) -> None:
        for value in ("var(--cs-font-display)", "var(--cs-font-heading)", "var(--cs-font-body)", "var(--cs-font-latin)",
                      "var(--cs-font-body), var(--cs-font-latin)"):
            self.ok(".f-a { font-family: %s; }" % value)
        self.bad(".f-a { font-family: Arial; }", "font-family Arial is refused")
        self.bad('.f-a { font-family: "Cairo", var(--cs-font-body); }', "font-family")
        self.bad(".f-a { font-family: var(--cs-font-body), serif; }", "font-family serif is refused")

    def test_gradients_and_backgrounds(self) -> None:
        self.bad(".f-a { background: linear-gradient(to right, red, blue); }", "gradient directions with 'to' are refused")
        self.bad(".f-a { background: linear-gradient(to top left, red, blue); }", "gradient directions with 'to' are refused")
        self.bad(".f-a { background: radial-gradient(red, blue); }", "linear-gradient(<angle>deg")
        self.bad(".f-a { background: conic-gradient(red, blue); }", "linear-gradient(<angle>deg")
        self.bad(".f-a { background: linear-gradient(red, blue); }", "needs an angle in deg")
        self.bad(".f-a { background: linear-gradient(0.25turn, red, blue); }", "needs an angle in deg")
        self.bad(".f-a { background: red no-repeat; }", "linear-gradient(<angle>deg")
        self.bad(".f-a { background-color: linear-gradient(135deg, red, blue); }", "linear-gradient(<angle>deg")

    def test_position_transform_and_content(self) -> None:
        self.bad(".f-a { position: fixed; }", "position: fixed is refused")
        self.bad(".f-a { position: sticky; }", "position: sticky is refused")
        self.ok(".f-a { position: absolute; inset: 0; }")
        self.bad(".f-a { transform: matrix(1, 0, 0, 1, 0, 0); }", "matrix() is refused")
        self.bad(".f-a { transform: perspective(10px); }", "perspective() is refused")
        self.bad(".f-a { content: \"x\"; }", "content is only allowed on ::before and ::after")
        self.bad(".f-a::before { content: attr(title); }", "content takes one quoted text only")
        self.bad(".f-a::before { content: counter(x); }", "content takes one quoted text only")
        self.bad('.f-a::before { content: "a" "b"; }', "content takes one quoted text only")

    def test_important_nesting_and_syntax(self) -> None:
        self.bad(".f-a { color: red !important; }", "!important is refused")
        self.bad(".f-a { .f-b { color: red; } }", "nesting")
        self.bad(".f-a { color }", "has no colon")
        self.bad(".f-a { color: ; }", "has no value")
        self.bad(".f-a { color: red;", "unclosed {")
        self.bad("color: red;", "text outside a rule")
        self.bad('.f-a::before { content: "abc; }', "unterminated")

    def test_selectors(self) -> None:
        for selector, needle in (("#hero", "id selectors"), ("*", "not allowed in a selector"), ("a", "<a> is not an allowed tag"),
                                 ("body", "<body> is not an allowed tag"), ("html .f-a", "<html> is not an allowed tag"),
                                 (".hero", "does not match"), (".f-a:hover", ":hover is not allowed"), (".f-a:not(.f-b)", ":not is not allowed"),
                                 (".f-a:nth-child(foo)", ":nth-child is not allowed"), (".f-a::selection", "::selection is not allowed"),
                                 (".f-a:before", ":before is not allowed"), ("[style]", "[style] is not an attribute"),
                                 ("[id=x]", "[id] is not an attribute"), (".f-a &", "not allowed in a selector"),
                                 ("p[href]", "[href] is not an attribute")):
            self.bad("%s { color: red; }" % selector, needle)

    def test_scope_breakouts(self) -> None:
        self.bad("</style><script>alert(1)</script> .f-a { color: red; }", "'<'")
        self.bad(".f-a { color: red; } </style>", "'<'")

    def test_size_limit_and_control_characters(self) -> None:
        limit = free.contract()["css"]["maxBytes"]
        self.bad(".f-a { color: red; }\n" * (limit // 20 + 5), "bytes, the limit is %d" % limit)
        self.bad(".f-a { color: red; }\x00", "control characters")


class FreeInASpec(unittest.TestCase):
    def check(self, mutate) -> tuple[list[dict], list[dict]]:
        spec = load_example()
        mutate(spec)
        return free.check_spec(spec)

    def test_the_example_is_clean(self) -> None:
        self.assertEqual(free.check_spec(load_example()), ([], []))

    def test_a_cover_cannot_carry_a_free_design(self) -> None:
        def mutate(spec):
            spec["slides"][0]["free"] = {"html": "<p>x</p>"}
        structure, _notes = self.check(mutate)
        self.assertEqual([s["path"] for s in structure], ["/slides/0/free"])
        self.assertIn("cover", structure[0]["message"])

    def test_a_poster_and_every_other_type_may(self) -> None:
        for kind in ("poster", "rehook", "item", "step", "stat", "compare", "myth-fact", "quote", "story-beat", "checklist", "summary", "setup",
                     "proof", "share", "cta", "offer", "testimonial", "grid", "timeline"):
            structure, _ = self.check(lambda spec, kind=kind: spec["slides"][1].update(type=kind))
            self.assertEqual(structure, [], kind)

    def test_findings_carry_the_slide_and_the_part(self) -> None:
        def mutate(spec):
            spec["slides"][2]["free"]["html"] = '<div onclick="x"><script>1</script></div>'
            spec["slides"][2]["free"]["css"] = ".f-a { background: url(x.png); }"
        structure, _ = self.check(mutate)
        paths = {s["path"] for s in structure}
        self.assertEqual(paths, {"/slides/2/free/html", "/slides/2/free/css"})

    def test_nesting_notes_have_a_code(self) -> None:
        _structure, notes = self.check(lambda spec: spec["slides"][1]["free"].update(html="<div><span>x</div>"))
        self.assertEqual({n["code"] for n in notes}, {free.NOTE_NESTING})
        self.assertTrue(all(n["path"] == "/slides/1/free/html" for n in notes))

    def test_a_number_and_its_latin_unit_in_two_elements_get_a_bidi_note(self) -> None:
        row, flex = '<div class="f-v"><span>3.5</span><span class="f-u">GB</span></div>', ".f-v { display: flex; }"

        def bidi(html, css=flex, dialect=None) -> list[dict]:
            def mutate(spec):
                spec["slides"][1]["free"].update(html=html, css=css)
                if dialect:
                    spec["locale"]["dialect"] = dialect
            return [n for n in self.check(mutate)[1] if n["code"] == free.NOTE_BIDI]

        found = bidi(row)
        self.assertEqual(len(found), 1, found)
        self.assertIn('"GB 3.5"', found[0]["message"])
        self.assertIn('dir="ltr"', found[0]["message"])
        self.assertEqual(found[0]["path"], "/slides/1/free/html")
        self.assertEqual(len(bidi('<p class="f-p">الحجم 3.5 <small>GB</small></p>', "")), 1)
        for html, css in ((row.replace('class="f-v"', 'class="f-v" dir="ltr"'), flex),  # the fix
                          (row, ".f-v { display: flex; flex-direction: column; }"),  # stacked, nothing to reverse
                          ('<p class="f-p">الحجم 3.5 GB</p>', ""),  # one text: the engine isolates it
                          ('<div class="f-v"><span>3.5</span><span>4.3</span></div>', flex),  # two numbers: a right-to-left row
                          ('<div class="f-v"><span>3.5</span><span>جيجا</span></div>', flex)):  # an Arabic unit
            self.assertEqual(bidi(html, css), [], html)
        self.assertEqual(bidi(row, dialect="en"), [])

    def test_a_data_field_must_exist_on_that_slide(self) -> None:
        def mutate(spec):
            del spec["slides"][2]["body"]
        structure, _ = self.check(mutate)
        self.assertTrue(any("data-field='body'" in s["message"] for s in structure), structure)

    def test_a_spec_without_free_costs_nothing(self) -> None:
        spec = load_example()
        for s in spec["slides"]:
            s.pop("free", None)
        self.assertEqual(free.check_spec(spec), ([], []))
        self.assertFalse(free.has_free(spec))


class FreeSchema(unittest.TestCase):
    def verdict(self, mutate) -> list[dict]:
        spec = load_example()
        mutate(spec)
        return schema.validate_named("spec", spec)

    def test_the_example_validates(self) -> None:
        self.assertEqual(self.verdict(lambda spec: None), [])

    def test_html_css_and_locked_are_the_only_properties(self) -> None:
        self.assertEqual(self.verdict(lambda s: s["slides"][1]["free"].update(locked=True)), [])
        self.assertEqual(self.verdict(lambda s: s["slides"][1].update(free={"html": "<p>x</p>"})), [])
        errors = self.verdict(lambda s: s["slides"][1]["free"].update(js="alert(1)"))
        self.assertEqual([(e["path"], e["keyword"]) for e in errors], [("/slides/1/free/js", "additionalProperties")])

    def test_html_is_required_and_every_value_has_its_type(self) -> None:
        errors = self.verdict(lambda s: s["slides"][1].update(free={"css": ".f-a { color: red; }"}))
        self.assertEqual([(e["path"], e["keyword"]) for e in errors], [("/slides/1/free/html", "required")])
        for key, value in (("html", 5), ("css", ["x"]), ("locked", "yes")):
            errors = self.verdict(lambda s, key=key, value=value: s["slides"][1]["free"].update({key: value}))
            self.assertEqual([e["path"] for e in errors], ["/slides/1/free/" + key], key)
        self.assertNotEqual(self.verdict(lambda s: s["slides"][1].update(free="<p>x</p>")), [])

    def test_the_length_limits_count_code_points_and_never_refuse_what_the_byte_limit_allows(self) -> None:
        doc = free.contract()
        html, css = doc["html"]["maxBytes"], doc["css"]["maxBytes"]
        self.assertEqual(self.verdict(lambda s: s["slides"][1]["free"].update(html="a" * html, css="a" * css)), [])
        errors = self.verdict(lambda s: s["slides"][1]["free"].update(html="a" * (html + 1)))
        self.assertEqual([(e["path"], e["keyword"]) for e in errors], [("/slides/1/free/html", "maxLength")])
        errors = self.verdict(lambda s: s["slides"][1]["free"].update(css="a" * (css + 1)))
        self.assertEqual([(e["path"], e["keyword"]) for e in errors], [("/slides/1/free/css", "maxLength")])

    def test_the_schema_limits_equal_the_contract(self) -> None:
        props = json.loads((DESIGN / "schemas" / "spec.schema.json").read_text(encoding="utf-8"))["$defs"]["slide"]["properties"]["free"]
        doc = free.contract()
        self.assertEqual(props["properties"]["html"]["maxLength"], doc["html"]["maxBytes"])
        self.assertEqual(props["properties"]["css"]["maxLength"], doc["css"]["maxBytes"])
        self.assertEqual(sorted(props["properties"]), ["css", "html", "locked"])
        self.assertEqual(props["required"], ["html"])
        self.assertIs(props["additionalProperties"], False)


class TextTwin(unittest.TestCase):
    def test_literal_text_nodes_in_document_order(self) -> None:
        slide = {"free": {"html": '<div><h2 data-field="title">بديل</h2><p>مرحبا <strong>بيك</strong> &amp; أهلا</p><small>سطر\n  تاني</small></div>'}}
        self.assertEqual(text.free_text(slide), ["مرحبا", "بيك", "& أهلا", "سطر تاني"])

    def test_a_data_field_subtree_is_skipped_whole(self) -> None:
        html = '<div><p data-field="body"><b>جوه</b> برضه</p><span>بره</span><li data-field="bullets.0"><span>ده كمان</span></li>آخر</div>'
        self.assertEqual(text.free_text({"free": {"html": html}}), ["بره", "آخر"])

    def test_code_comments_and_empty_nodes_are_not_text(self) -> None:
        html = "<div> <!-- مخفي --> <script>var a = 'سر';</script><style>.f-a{}</style><p>   </p><br>ظاهر</div>"
        self.assertEqual(text.free_text({"free": {"html": html}}), ["ظاهر"])

    def test_no_free_no_text(self) -> None:
        for slide in ({}, {"free": None}, {"free": {}}, {"free": {"html": ""}}, {"free": {"html": 5}}, None):
            self.assertEqual(text.free_text(slide), [])

    def test_visual_fields_end_with_the_free_text(self) -> None:
        slide = {"title": "عنوان", "demo": {"lines": [{"text": "سطر"}]}, "free": {"html": '<h2 data-field="title"></h2><p>حر</p><p>كمان</p>'}}
        self.assertEqual(text.visual_fields(slide), [("demo.0", "سطر"), ("free.0", "حر"), ("free.1", "كمان")])

    def test_slide_text_is_the_fields_then_the_literal_text(self) -> None:
        slide = {"type": "item", "title": "عنوان", "body": "نص", "free": {"html": '<h2 data-field="title"></h2><p>حر <em>1234</em></p>'}}
        self.assertEqual(text.slide_text(slide, digits=None), ["عنوان", "نص", "حر", "1234"])
        self.assertEqual(text.slide_text(slide, digits="arabic-indic")[-1], "١٢٣٤")

    def test_word_counts_include_the_literal_text_once(self) -> None:
        plain = {"type": "item", "title": "عنوان واحد", "body": "نص تاني"}
        free_slide = dict(plain, free={"html": '<h2 data-field="title"></h2><p data-field="body"></p><p>ثلاث كلمات هنا</p>'})
        self.assertEqual(text.word_counts(free_slide)["total"], text.word_counts(plain)["total"] + 3)

    def test_the_keyed_qa_fields_name_the_literal_nodes(self) -> None:
        slide = {"id": "s04", "type": "step", "title": "عنوان", "free": {"html": "<p>حر</p><p>كمان</p>"}}
        keys = [f["key"] for f in qa.slide_fields(slide)]
        self.assertEqual(keys, ["s04.title", "s04.free.0", "s04.free.1"])
        self.assertIn("حر", qa.slide_strings(slide, True, True))

    def test_the_copy_gates_read_the_literal_text_of_a_free_slide(self) -> None:
        spec = load_example()
        spec["slides"][3]["free"]["html"] = spec["slides"][3]["free"]["html"].replace("محادثة تجريبية بين اتنين", "مَرْحَباً بكم هذا الآن مهم")
        results = qa.run_text_gates(spec, None)
        hits = [r for r in results if r.get("slide") == "s04" and str(r.get("el", "")).startswith("s04.free.")]
        self.assertTrue(hits, [(r["rule"], r.get("el")) for r in results])
        self.assertTrue(any(r["rule"].startswith("O1.") for r in hits))


class ValidatePy(unittest.TestCase):
    def run_validate(self, skill: str, path: Path, *args: str) -> subprocess.CompletedProcess:
        script = SKILLS / skill / "scripts" / "validate.py"
        return subprocess.run([sys.executable, str(script), "spec", str(path), *args], capture_output=True, text=True, encoding="utf-8", env=ENV, timeout=120)

    def write(self, name: str, spec: dict) -> Path:
        tmp = tempfile.TemporaryDirectory(prefix="cs-free-")
        self.addCleanup(tmp.cleanup)
        path = Path(tmp.name) / name
        path.write_text(json.dumps(spec, ensure_ascii=False), encoding="utf-8")
        return path

    def test_the_example_passes_the_schema_the_checkpoint_and_the_text_gates(self) -> None:
        for skill in ("carousel-design", "carousel-create"):
            res = self.run_validate(skill, EXAMPLE, "--checkpoint", "script", "--lint", "--format", "json")
            self.assertEqual(res.returncode, 0, skill + res.stdout + res.stderr)
            report = json.loads(res.stdout)
            self.assertTrue(report["ok"])
            self.assertEqual((report["errors"], report["structure"]), ([], []))
            self.assertEqual(report["qa"]["counts"]["block"], 0)
            self.assertEqual(report["qa"]["counts"]["fix"], 0)

    def test_a_refusal_fails_the_document_with_exit_2_and_a_path(self) -> None:
        spec = load_example()
        spec["slides"][1]["free"]["html"] = '<img src="x" onerror="alert(1)"><p data-field="secret"></p><span data-icon="no-such-icon"></span>'
        spec["slides"][1]["free"]["css"] = ".f-a { background: url(javascript:alert(1)); letter-spacing: 3px; }"
        path = self.write("bad.json", spec)
        res = self.run_validate("carousel-design", path, "--format", "json")
        self.assertEqual(res.returncode, 2, res.stdout + res.stderr)
        report = json.loads(res.stdout)
        self.assertFalse(report["ok"])
        self.assertEqual({s["path"] for s in report["structure"]}, {"/slides/1/free/html", "/slides/1/free/css"})
        messages = " | ".join(s["message"] for s in report["structure"])
        for needle in ("<img> is not an allowed tag", "src is not allowed", "onerror", "not an allowed field", "not an icon", "url( is refused", "letter-spacing"):
            self.assertIn(needle, messages)
        text_out = self.run_validate("carousel-design", path).stdout
        self.assertIn("structure  /slides/1/free/html", text_out)

    def test_a_cover_with_free_is_refused_by_validate(self) -> None:
        spec = load_example()
        spec["slides"][0]["free"] = {"html": "<p>x</p>"}
        res = self.run_validate("carousel-design", self.write("cover.json", spec), "--format", "json")
        self.assertEqual(res.returncode, 2)
        self.assertEqual([s["path"] for s in json.loads(res.stdout)["structure"]], ["/slides/0/free"])

    def test_a_schema_error_comes_first_and_the_content_checks_wait(self) -> None:
        spec = load_example()
        spec["slides"][1]["free"]["js"] = "x"
        spec["slides"][2]["free"]["html"] = "<script>x</script>"
        res = self.run_validate("carousel-design", self.write("shape.json", spec), "--format", "json")
        report = json.loads(res.stdout)
        self.assertEqual(res.returncode, 2)
        self.assertEqual([e["path"] for e in report["errors"]], ["/slides/1/free/js"])
        self.assertEqual(report["structure"], [])

    def test_nesting_is_a_note_that_never_fails(self) -> None:
        spec = load_example()
        spec["slides"][1]["free"]["html"] = "<div><span>x</div>"
        res = self.run_validate("carousel-design", self.write("nest.json", spec), "--format", "json")
        report = json.loads(res.stdout)
        self.assertEqual(res.returncode, 0, res.stdout)
        self.assertTrue(report["ok"])
        self.assertTrue(report["notes"] and all(n["code"] == "FREE.nesting" for n in report["notes"]))

    def test_the_skills_that_validate_a_spec_carry_the_module_and_the_contract(self) -> None:
        for skill in ("carousel-create", "brand-setup", "content-plan"):
            self.assertTrue((SKILLS / skill / "scripts" / "_cs" / "free.py").is_file(), skill)
        for skill in ("carousel-create", "brand-setup", "content-plan", "content-angles", "arabic-proofread"):
            self.assertEqual((SKILLS / skill / "data" / "free-design.json").read_bytes(), (DESIGN / "data" / "free-design.json").read_bytes(), skill)


class TheExample(unittest.TestCase):
    def test_six_slides_four_of_them_free_and_every_art_attribute_used(self) -> None:
        spec = load_example()
        slides = spec["slides"]
        self.assertEqual(len(slides), 6)
        self.assertEqual([s["type"] for s in slides if "free" in s], ["rehook", "item", "step", "checklist"])
        self.assertNotIn("free", slides[0])
        self.assertEqual(spec["locale"]["dialect"], "eg")
        html = "".join(s["free"]["html"] for s in slides if "free" in s)
        for needle in ("data-field=", "data-icon=", "data-object=", "data-mark=", "data-tone=", "data-from=", "f-chat"):
            self.assertIn(needle, html)

    def test_it_validates_and_is_in_the_canonical_layout(self) -> None:
        raw = EXAMPLE.read_text(encoding="utf-8")
        spec = json.loads(raw)
        self.assertEqual(schema.validate_named("spec", spec), [])
        self.assertEqual(free.check_spec(spec), ([], []))
        self.assertEqual(raw, (json.dumps(spec, indent=2, ensure_ascii=False) + "\n").replace(chr(0xA0), chr(92) + "u00a0"))

    def test_every_data_field_reads_a_field_the_slide_has(self) -> None:
        spec = load_example()
        for slide in spec["slides"]:
            if "free" in slide:
                self.assertEqual(free.check_slide(slide)[0], [], slide["id"])

    def test_the_arabic_is_authored_without_tashkeel_or_mojibake(self) -> None:
        marks = re.compile("[ً-ٰٟ]")
        for path, value in strings(load_example()):
            self.assertIsNone(marks.search(value), "%s carries tashkeel: %s" % (path, value[:40]))
            self.assertNotIn("�", value, path)


def strings(value, path=""):
    if isinstance(value, str):
        yield path, value
    elif isinstance(value, dict):
        for key, item in value.items():
            yield from strings(item, "%s/%s" % (path, key))
    elif isinstance(value, list):
        for i, item in enumerate(value):
            yield from strings(item, "%s/%d" % (path, i))


if __name__ == "__main__":
    unittest.main()


class PlannerFallbackNote(unittest.TestCase):
    """Free design is the default: from checkpoint design on, an inner slide left to the planner is noted, never failed."""

    def test_inner_slides_without_free_are_noted_from_design_on(self):
        validate = support.load_script("carousel-design", "validate.py", "validate_free_note_under_test")
        spec = {"slides": [{"type": "cover"}, {"type": "item", "free": {"html": "<p data-field=\"title\"></p>"}}, {"type": "item"}]}
        notes = [n for n in validate.note_checks(spec, "design") if n["code"] == "FREE.planner"]
        self.assertEqual([n["path"] for n in notes], ["/slides/2/free"])
        self.assertEqual([n for n in validate.note_checks(spec, "script") if n["code"] == "FREE.planner"], [])
