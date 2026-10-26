#!/usr/bin/env python3
"""Register a new slide type everywhere a type is listed, as a minimal stub (round 3, spec 4.4, audit 13d 4.6).

A slide type is named in about forty files: the engine's registry and the Studio's add-slide menu, the three schema enums, the six presets,
the four completeness matrices, the lint and QA rule data, the Studio's names in five dialects, the archetype sheet, the references and the
contract, the evals, the showcase deck and the tests that count or enumerate the types. This tool does all of that in one pass so that no
later package edits the same files twice.

What a stub is: a registered type with its base variant, a template of title, items and bridge (the items slot is empty and optional until
the items filler of compose lands), its names, its required fields and one showcase slide. The variants beyond the base, the item layouts,
the cards and the rail are drawn by later packages.

Known types (their data is the TYPES table below): grid, timeline. Run them in that order (the showcase deck puts timeline after grid).

The showcase slide of a type carries a title and a bridge. Its items (cards, nodes) go in with --items, which must wait until the spec schema
allows `items` on a slide (E1): the Studio build validates the showcase deck, and a closed schema refuses a field it does not know.

Idempotent: a second run changes nothing. With --check nothing is written and the tool exits 2 when any site still needs the edit.

Usage:
    python tools/add_type.py <type> [--items] [--check] [--format text|json] [--root REPO_ROOT]

Exit codes (CONTRACT 0.4): 0 done (or already registered with --check) · 2 --check found sites to edit · 64 usage (unknown type) ·
66 a listed file is missing · 70 internal (an edit did not apply) · 73 a file could not be written.

Python 3.11, standard library only.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import tempfile
from pathlib import Path
from typing import Callable

EXIT_OK, EXIT_DRIFT, EXIT_USAGE, EXIT_NO_INPUT, EXIT_INTERNAL, EXIT_CANT_WRITE = 0, 2, 64, 66, 70, 73

SK = "plugins/carousel-studio/skills/carousel-design"
SC = "plugins/carousel-studio/skills/carousel-create"
PL = "plugins/carousel-studio/skills"
PRESETS = ("swiss", "creator", "notebook", "poster", "interface", "heritage")
NUMBER_WORDS = {18: "eighteen", 19: "nineteen", 20: "twenty", 21: "twenty-one", 22: "twenty-two"}

# ---------------------------------------------------------------------------------------------------------------------------------
# the types this tool knows (spec 4.4). Everything a site needs about a type is here.
# ---------------------------------------------------------------------------------------------------------------------------------

TYPES: dict[str, dict] = {
    "grid": {
        "after": "setup",  # the showcase deck puts the slide after the last slide of this type
        "variants": ["bento"],
        "chrome": "handle meta counter swipe",
        "required": ["title", "items"],
        "text_fields": ["title", "bridge"],  # editable as text in the Studio's Slide tab (the items editor is a later package)
        "names": {"ar": "شبكة", "en": "Grid"},
        "variant_names": {"bento": {"ar": "بنتو", "en": "Bento"}},
        "fields": "`title` req, `items` req (3 to 6), `bridge` opt",
        "slots": "title (title), items (cards; body), bridge (small)",
        "use": "3 to 6 cards, each with a short title and text; a payoff slide like `stat`",
        "note": "extra payoff, dense type: at most 45 words in all (title, cards and bridge)",
        "limits": "title ≤ 6; card title ≤ 3 and text ≤ 5 (≤ 2 in the `tiles` look); ≤ 45 in all",
        "req_row": "`title`, `items` (3 to 6)",
        "opt_row": "`bridge`",
        "showcase": {
            "title": "الغلاف في أربع حاجات",
            "items": [
                {"title": "وعد واضح", "text": "القارئ يعرف هياخد إيه", "hi": True},
                {"title": "رقم", "text": "يثبّت الكلام"},
                {"title": "كلمة قوية", "text": "تشد العين"},
                {"title": "مساحة فاضية", "text": "تريّح النظر"},
            ],
            "bridge": "نكمل بالترتيب",
        },
        "fixture": '{ title: "أدوات الكاروسيل", items: [{ title: "الكتابة", text: "فكرة واحدة", hi: true }, { title: "التصميم", text: "ألوان البراند" }, { title: "المراجعة", text: "عين تانية" }], bridge: "شوف التالي" }',
    },
    "timeline": {
        "after": "grid",
        "variants": ["rail"],
        "chrome": "handle meta counter swipe",
        "required": ["title", "items"],
        "text_fields": ["title", "bridge"],
        "names": {"ar": "خط زمني", "en": "Timeline"},
        "variant_names": {"rail": {"ar": "مسار", "en": "Rail"}},
        "fields": "`title` req, `items` req (3 to 4), `bridge` opt",
        "slots": "title (title), items (nodes; body), bridge (small)",
        "use": "3 to 4 nodes on a rail, each with a time label (`value`), a short title and text; a payoff slide like `proof`",
        "note": "extra payoff, dense type: at most 45 words in all; the first node sits at the start edge",
        "limits": "title ≤ 6; node title ≤ 2, text ≤ 4, time label ≤ 12 characters; ≤ 45 in all",
        "req_row": "`title`, `items` (3 to 4)",
        "opt_row": "`bridge`",
        "showcase": {
            "title": "من الفكرة للنشر",
            "items": [
                {"title": "الفكرة", "text": "جملة واحدة", "value": "اليوم 1"},
                {"title": "الكتابة", "text": "عشر دقايق", "value": "اليوم 2"},
                {"title": "التصميم", "text": "ساعة واحدة", "value": "اليوم 3"},
                {"title": "النشر", "text": "في وقت الذروة", "value": "اليوم 4", "hi": True},
            ],
            "bridge": "ونبدأ بالأولى",
        },
        "fixture": '{ title: "رحلة البوست", items: [{ title: "الفكرة", text: "جملة واحدة", value: "يوم 1" }, { title: "الكتابة", text: "عشر دقايق", value: "يوم 2", hi: true }, { title: "النشر", text: "وقت الذروة", value: "يوم 3" }], bridge: "ونبدأ" }',
    },
}


class EditError(Exception):
    """An edit that neither applies nor is already applied."""


# ---------------------------------------------------------------------------------------------------------------------------------
# small text helpers
# ---------------------------------------------------------------------------------------------------------------------------------


def quoted_items(body: str) -> list[str]:
    return re.findall(r'"([^"]*)"', body)


def add_to_literal(text: str, header: str, new: str, bracket: str = "[") -> str:
    """Append "new" to the literal that follows `header` (a regex), keeping the style of the list. Idempotent."""
    close = {"[": "]", "{": "}", "(": ")"}[bracket]
    m = re.search("(" + header + re.escape(bracket) + ")([^" + re.escape(close) + "]*)(" + re.escape(close) + ")", text)
    if not m:
        raise EditError("literal not found: %s" % header)
    body = m.group(2)
    if new in quoted_items(body):
        return text
    stripped = body.rstrip()
    if "\n" in stripped and len(stripped.split("\n")[-1]) > 100:
        indent = re.match(r"\s*", stripped.split("\n")[-1]).group(0)
        glue = ",\n" + indent
    else:
        glue = ", "
    return text[:m.start(2)] + stripped + glue + '"%s"' % new + body[len(stripped):] + text[m.end(2):]


def must_replace(text: str, old: str, new: str) -> str:
    """Replace one exact string. Already applied (the new text is there) is fine."""
    if old in text:
        if text.count(old) != 1:
            raise EditError("expected one occurrence of %r, found %d" % (old[:60], text.count(old)))
        return text.replace(old, new)
    if new and new in text:
        return text
    raise EditError("text not found: %r" % old[:90])


def dump_json(data: object, indent: int) -> str:
    return json.dumps(data, indent=indent, ensure_ascii=False) + "\n"


def roundtrip_json(text: str, indent: int) -> object:
    data = json.loads(text)
    if dump_json(data, indent) != text:
        raise EditError("the file is not in the canonical JSON layout this tool preserves (indent=%d)" % indent)
    return data


# ---------------------------------------------------------------------------------------------------------------------------------
# the sites. Each is (path, function(text, ctx) -> text).
# ctx = { "t": the type, "meta": its TYPES entry, "order": the registry's types after this run, "deck": the showcase types after this run }
# ---------------------------------------------------------------------------------------------------------------------------------

Site = tuple[str, Callable[[str, dict], str]]


def site_registry(text: str, c: dict) -> str:
    text = add_to_literal(text, r"var SLIDE_TYPES = ", c["t"])
    # the counts in the comments go; the list is the source of truth
    text = re.sub(r"the (?:\d+|[a-z-]+) archetype templates and the rule", "the archetype templates and the rule", text)
    text = re.sub(r"Registers the (?:\d+|[a-z-]+) <template data-archetype> partials", "Registers the <template data-archetype> partials", text)
    return text


def site_core_readme(text: str, c: dict) -> str:
    text = re.sub(r"the \d+ archetypes, rule data", "the archetype templates, rule data", text)
    text = re.sub(r"The layout CSS and the \d+ `<template>` partials", "The layout CSS and the `<template>` partials", text)
    return text


def site_state(text: str, c: dict) -> str:
    t, meta = c["t"], c["meta"]
    text = add_to_literal(text, r"var ADDABLE_TYPES = ", t)
    key = t if re.fullmatch(r"[a-z]+", t) else '"%s"' % t
    if re.search(r"^  %s: \[" % re.escape(key), text, re.M):
        return text
    entry = "  %s: [%s]" % (key, ", ".join('"%s"' % f for f in meta["text_fields"]))
    m = re.search(r"(var FIELDS_BY_TYPE = \{.*?\n)(  [^\n]*\])(\n\};)", text, re.S)
    if not m:
        raise EditError("src/ui/state.js: FIELDS_BY_TYPE not found")
    return text[:m.start(2)] + m.group(2) + ",\n" + entry + m.group(3) + text[m.end(3):]


def site_preset_lint(text: str, c: dict) -> str:
    t = c["t"]
    m = re.search(r"SLIDE_TYPES = \(([^)]*)\)", text)
    if not m:
        raise EditError("preset_lint.py: SLIDE_TYPES not found")
    if t in quoted_items(m.group(1)):
        return text
    body = m.group(1).rstrip()
    last = body.split("\n")[-1]
    indent = re.match(r"\s*", last).group(0)
    glue = ",\n" + indent if len(last) + len(t) + 4 > 130 else ", "
    return text[:m.start(1)] + body + glue + '"%s"' % t + text[m.end(1):]


def required_table(text: str, t: str, header: str, fields: list[str]) -> str:
    if re.search(r'"%s": \(' % re.escape(t), text):
        return text
    m = re.search("(" + header + r".*?\n)(\})", text, re.S)
    if not m:
        raise EditError("required-fields table not found: %s" % header)
    tup = "(" + ", ".join('"%s"' % f for f in fields) + ("," if len(fields) == 1 else "") + ")"
    return text[:m.start(2)] + '    "%s": %s,\n' % (t, tup) + text[m.start(2):]


def site_validate_py(text: str, c: dict) -> str:
    t, meta = c["t"], c["meta"]
    text = required_table(text, t, r"REQUIRED_FIELDS = \{", meta["required"])
    # a list of items is filled when one item carries a title (the other list fields have their own branch)
    if "items" in meta["required"] and 'field == "items"' not in text:
        old = '            elif field in ("number", "cta", "media"):\n'
        new = ('            elif field == "items":\n'
               '                ok = isinstance(v, list) and any(isinstance(it, dict) and is_filled(it.get("title")) for it in v)\n' + old)
        text = must_replace(text, old, new)
    return text


def site_evals(text: str, c: dict) -> str:
    t, meta = c["t"], c["meta"]
    text = required_table(text, t, r"REQ_FIELDS = \{", meta["required"])
    return add_to_literal(text, r"needs_bridge = ", t, bracket="{")


def site_qa_rules(text: str, c: dict) -> str:
    """Every list of types that names story-beat gets the new type at its end."""
    t = c["t"]

    def fix(m: re.Match) -> str:
        items = quoted_items(m.group(2))
        if "story-beat" not in items or t in items:
            return m.group(0)
        return m.group(1) + m.group(2) + ', "%s"' % t + m.group(3)

    for header in (r'"slideTypes": ', r'"types": '):
        text = re.sub("(" + header + r"\[)([^\]]*)(\])", fix, text)
    return text


def site_ui_strings(text: str, c: dict) -> str:
    t, meta = c["t"], c["meta"]
    data = roundtrip_json(text, 1)
    strings = data["strings"]
    wanted = {"type." + t: meta["names"]}
    for v, names in meta["variant_names"].items():
        wanted["variant." + v] = names
    for key, names in wanted.items():
        if key not in strings:
            strings[key] = {"eg": names["ar"], "gulf": names["ar"], "levant": names["ar"], "msa-white": names["ar"], "en": names["en"]}
    data["strings"] = dict(sorted(strings.items()))
    return dump_json(data, 1)


def site_schema_enum(text: str, c: dict) -> str:
    data = roundtrip_json(text, 2)
    enum = data["$defs"]["slideType"]["enum"]
    if c["t"] not in enum:
        enum.append(c["t"])
    return dump_json(data, 2)


def site_preset_json(text: str, c: dict) -> str:
    data = roundtrip_json(text, 2)
    if c["t"] not in data["variants"]:
        data["variants"][c["t"]] = list(c["meta"]["variants"])
    return dump_json(data, 2)


def site_archetype_sheet(text: str, c: dict) -> str:
    t, meta = c["t"], c["meta"]
    text = re.sub(r"3\. one block per slide type \(\d+\) with its variants", "3. one block per slide type (%d) with its variants" % len(c["order"]), text)
    if 'data-archetype="%s"' % t in text:
        return text
    # the bridge sits at the foot of the stack on these types, like on item, step and the lists
    m = re.search(r"(\.cs-slide \.cs-a-proof > \.cs-bridge(?:, \.cs-slide \.cs-a-[a-z-]+ > \.cs-bridge)*)(\{ margin-block-start:auto; \})", text)
    if not m:
        raise EditError("archetypes.html: the bridge rule was not found")
    text = text[:m.end(1)] + ", .cs-slide .cs-a-%s > .cs-bridge" % t + text[m.end(1):]
    # layout stub: a stack with the usual rhythm; the card and rail layouts arrive with the item layouts
    if "/* 19 grid · 20 timeline" not in text:
        block = ("/* 19 grid · 20 timeline: payoff slides built from `items`; this is the stub (title, an empty optional items slot, bridge),\n"
                 "   the card grid and the rail are laid out by the item layouts that follow it */\n"
                 ".cs-slide .cs-a-grid, .cs-slide .cs-a-timeline{ gap:calc(var(--cs-unit) * 3); }\n")
        text = text.replace("</style>", block + "</style>", 1)
    template = (
        '\n<template data-archetype="%s" data-version="1" data-default-variant="%s"\n'
        '          data-variants="%s" data-chrome="%s">\n'
        '  <main class="cs-content cs-a-%s" data-layer="content">\n'
        '    <h2  class="cs-slot cs-title"  data-slot="title"  data-field="title"  data-kind="text" data-role="title" data-max-lines="3" data-m="title" data-edit="text"></h2>\n'
        '    <ul  class="cs-slot cs-items"  data-slot="items"  data-field="items"  data-kind="items" data-role="body"  data-max-lines="2" data-m="items" data-optional></ul>\n'
        '    <p   class="cs-slot cs-bridge" data-slot="bridge" data-field="bridge" data-kind="text" data-role="small" data-max-lines="2" data-m="bridge" data-optional data-edit="text"></p>\n'
        '  </main>\n'
        '</template>\n'
    ) % (t, meta["variants"][0], " ".join(meta["variants"]), meta["chrome"], t)
    return text.rstrip("\n") + "\n" + template


SLIDE_LINE = re.compile(r'^(\s*)\{ "id": "s(\d+)", "n": (\d+), "type": "([a-z-]+)"')


def showcase_types(text: str) -> list[str]:
    return [m.group(4) for m in (SLIDE_LINE.match(ln) for ln in text.split("\n")) if m]


def inline_json(value: object) -> str:
    """The layout of the showcase file: objects as `{ "a": 1, "b": 2 }`, arrays as `[x, y]`."""
    if isinstance(value, dict):
        return "{ " + ", ".join("%s: %s" % (json.dumps(k, ensure_ascii=False), inline_json(v)) for k, v in value.items()) + " }"
    if isinstance(value, list):
        return "[" + ", ".join(inline_json(v) for v in value) + "]"
    return json.dumps(value, ensure_ascii=False)


def showcase_line(indent: str, t: str, meta: dict, with_items: bool) -> str:
    fields = {k: v for k, v in meta["showcase"].items() if with_items or k != "items"}
    return indent + inline_json({"id": "s00", "n": 0, "type": t, **fields}) + ","


def site_showcase(text: str, c: dict) -> str:
    """Insert the type's slide after its neighbour. Without --items the slide carries what the current spec schema allows (title and bridge);
    with --items it carries the items too, which the schema allows only once E1 has added the field."""
    t, meta = c["t"], c["meta"]
    lines = text.split("\n")
    idx = [i for i, ln in enumerate(lines) if SLIDE_LINE.match(ln)]
    if not idx:
        raise EditError("showcase.spec.json: no slide lines")
    indent = SLIDE_LINE.match(lines[idx[0]]).group(1)
    own = [i for i in idx if SLIDE_LINE.match(lines[i]).group(4) == t]
    if not own:
        after = [i for i in idx if SLIDE_LINE.match(lines[i]).group(4) == meta["after"]]
        if not after:
            raise EditError("showcase.spec.json: no slide of type %s to insert after" % meta["after"])
        lines.insert(after[-1] + 1, showcase_line(indent, t, meta, c["items"]))
    elif c["items"] and '"items"' not in lines[own[0]]:
        last = own[0] == idx[-1]
        lines[own[0]] = showcase_line(indent, t, meta, True)[:-1 if last else None]
    # ids are s01..sNN and n is the position
    n = 0
    for i, ln in enumerate(lines):
        if SLIDE_LINE.match(ln):
            n += 1
            lines[i] = re.sub(r'\{ "id": "s\d+", "n": \d+,', '{ "id": "s%02d", "n": %d,' % (n, n), ln, count=1)
    return "\n".join(lines)


def site_zones(text: str, c: dict) -> str:
    """A calm-zone row per preset, copied from that preset's own story-beat row (a text-heavy slide takes a flat texture)."""
    t, meta = c["t"], c["meta"]
    text = add_to_literal(text, r'"mediaTypes": ', t)
    block_rx = re.compile(r'^      "story-beat": \{\n(?:        [^\n]*\n)*?      \},\n', re.M)
    blocks = list(block_rx.finditer(text))
    if len(blocks) != len(PRESETS):
        raise EditError("zones.json: found %d story-beat rows, expected %d" % (len(blocks), len(PRESETS)))
    for m in reversed(blocks):
        quote_at = text.find('      "quote": {', m.end())
        if quote_at < 0:
            raise EditError("zones.json: no quote row after a story-beat row")
        if ('      "%s": {' % t) in text[m.end():quote_at]:
            continue
        row = m.group(0).replace('"story-beat"', '"%s"' % t, 1)
        row = re.sub(r'"defaultVariant": "[^"]*"', '"defaultVariant": "%s"' % meta["variants"][0], row)
        text = text[:quote_at] + row + text[quote_at:]
    return text


def site_fixture_sink(text: str, c: dict) -> str:
    t, meta = c["t"], c["meta"]
    key = '"%s"' % t
    if re.search(r"^    %s: \{" % re.escape(key), text, re.M):
        return text
    m = re.search(r'^(    "[a-z-]+": \{.*\})(  /\*.*\*/)?\n(  \};\n  FX\.SINK = SINK;)', text, re.M)
    if not m:
        raise EditError("fixtures.js: the last fixture line before FX.SINK was not found")
    last = m.group(1) + "," + (m.group(2) or "")
    return text[:m.start()] + last + "\n" + "    %s: %s" % (key, meta["fixture"]) + "\n" + m.group(3) + text[m.end():]


def site_swiss_fixture(text: str, c: dict) -> str:
    t, meta = c["t"], c["meta"]
    if '"%s":' % t in text:
        return text
    m = re.search(r'(    "[a-z-]+": \[[^\]]*\])(\n  \},\n  "motion")', text)
    if not m:
        raise EditError("swiss.preset.json fixture: the last variants row was not found")
    entry = '    "%s": [%s]' % (t, ", ".join('"%s"' % v for v in meta["variants"]))
    return text[:m.start()] + m.group(1) + ",\n" + entry + m.group(2) + text[m.end():]


def site_archetypes_test(text: str, c: dict) -> str:
    t, meta = c["t"], c["meta"]
    n = len(c["order"])
    if '    "%s": [[' % t not in text:
        m = re.search(r'(    "[a-z-]+": \[\[[^\n]*\]\])(\n  \};)', text)
        if not m:
            raise EditError("archetypes.test.js: the last TABLE row was not found")
        row = '    "%s": [[%s], "%s", ["title:title", "items:body", "bridge:small"]]' % (t, ", ".join('"%s"' % v for v in meta["variants"]), meta["chrome"])
        text = text[:m.start()] + m.group(1) + ",\n" + row + m.group(2) + text[m.end():]
    text = re.sub(r"eq\(types\.length, \d+\); CST\.deepEq\(types, CS\.core\.constants\.SLIDE_TYPES, \"the \d+ types in contract order\"\)",
                  'eq(types.length, %d); CST.deepEq(types, CS.core.constants.SLIDE_TYPES, "the %d types in contract order")' % (n, n), text)
    return re.sub(r"archetypes: the \d+ partials against", "archetypes: the %d partials against" % n, text)


def site_registry_test(text: str, c: dict) -> str:
    return re.sub(r"presets and the \d+ archetypes", "presets and the %d archetypes" % len(c["order"]), text)


def site_ui_test(text: str, c: dict) -> str:
    return add_to_literal(text, r"for \(const type of ", c["t"])


def site_matrix_comment(text: str, c: dict) -> str:
    """The header comment names the slides of the showcase deck; keep it equal to the deck."""
    deck = c["deck"]
    word = NUMBER_WORDS.get(len(deck), str(len(deck)))
    words = ("(default: the %s of tools/examples/showcase.spec.json: %s) in each preset, and runs the rendered gates" % (word, ", ".join(deck))).split(" ")
    lines, cur, room = [], "", 150 - len("// Builds the Studio page, renders the slides of --spec ")
    for w in words:
        if len(cur) + len(w) + 1 > room:
            lines.append(cur.rstrip())
            cur, room = "", 150
        cur += w + " "
    lines.append(cur.rstrip())
    tail = r"(?:\n// | )".join(["in", "each", "preset,", "and", "runs", "the", "rendered", "gates"])
    old = re.compile(r"\(default: the [a-z-]+ of tools/examples/showcase\.spec\.json: [^)]*\) " + tail)
    new, k = old.subn(lambda _m: "\n// ".join(lines), text, count=1)
    if not k:
        raise EditError("preset-matrix.mjs: the header comment has an unexpected shape")
    return new


# ---- prose and reference sites -----------------------------------------------------------------------------------------------------


def site_contract(text: str, c: dict) -> str:
    t, meta = c["t"], c["meta"]
    n = len(c["order"])
    if '|"%s"' % t not in text:
        text, k = re.subn(r"(type SlideType = [^;\n]*)(;)", lambda m: m.group(1) + '|"%s"' % t + m.group(2), text, count=1)
        if not k:
            raise EditError("CONTRACT.md: the SlideType union was not found")
    text = re.sub(r"### 5\.3 The \d+ types", "### 5.3 The %d types" % n, text)
    text = re.sub(r"A slide-type layout partial \(\d+ types\)", "A slide-type layout partial (%d types)" % n, text)
    text = re.sub(r"for the \d+ types × 6 presets", "for the %d types × 6 presets" % n, text)
    head, rest = text.split("### 5.3 The", 1)
    table, tail = rest.split("Presets list the subset", 1)
    if "| `%s` |" % t not in table:
        lines = table.split("\n")
        last = max(i for i, ln in enumerate(lines) if re.match(r"^\| \d+ \| `[a-z-]+` \|", ln))
        number = int(re.match(r"^\| (\d+) \|", lines[last]).group(1)) + 1
        lines.insert(last + 1, "| %d | `%s` | %s | %s | `%s` | %s | %s |" % (number, t, meta["fields"], meta["slots"], " ".join(meta["variants"]), meta["chrome"], meta["note"]))
        table = "\n".join(lines)
    return head + "### 5.3 The" + table + "Presets list the subset" + tail


def site_archetypes_md(text: str, c: dict) -> str:
    t, meta = c["t"], c["meta"]
    text = re.sub(r"# Archetypes: the \d+ slide types", "# Archetypes: the %d slide types" % len(c["order"]), text)
    if "| `%s` |" % t not in text:
        lines = text.split("\n")
        last = max(i for i, ln in enumerate(lines) if re.match(r"^\| \d+ \| `[a-z-]+` \|", ln))
        number = int(re.match(r"^\| (\d+) \|", lines[last]).group(1)) + 1
        lines.insert(last + 1, "| %d | `%s` | %s | `%s` | %s |" % (number, t, meta["fields"], " ".join(meta["variants"]), meta["use"]))
        text = "\n".join(lines)
    section = text.split("## 2. Text limits per type")[1].split("## 3.")[0]
    if "| `%s` |" % t not in section:
        anchor = "| `cta`, `share` | ≤ 12 | ≤ 3 | – |"
        text = must_replace(text, anchor, "| `%s` | %s | – | – |\n" % (t, meta["limits"]) + anchor)
    return text


def site_slide_limits(text: str, c: dict) -> str:
    t, meta = c["t"], c["meta"]
    if "`%s`" % t in text.split("## Per slide type")[1].split("\n## ")[0]:
        return text
    anchor = "| `cta`, `share` | ≤ 12 | ≤ 3 | none |"
    return must_replace(text, anchor, "| `%s` (dense) | %s | none | none |\n" % (t, meta["limits"]) + anchor)


def site_architectures(text: str, c: dict) -> str:
    t, meta = c["t"], c["meta"]
    m = re.search(r"(the types `rehook, item, step, stat, compare, myth-fact, proof, setup, story-beat)((?:, [a-z-]+)*)`", text)
    if m and (", %s" % t) not in m.group(2):
        text = text[:m.end(2)] + ", %s" % t + text[m.end(2):]
    if "| `%s` |" % t not in text:
        lines = text.split("\n")
        start = next((i for i, ln in enumerate(lines) if ln.startswith("| `poster` (single post) |")), None)
        if start is None:
            raise EditError("architectures.md: the poster row was not found")
        end = start
        while end + 1 < len(lines) and lines[end + 1].startswith("| "):
            end += 1
        lines.insert(end + 1, "| `%s` | %s | %s |" % (t, meta["req_row"], meta["opt_row"]))
        text = "\n".join(lines)
    return text


def site_plate_prompts(text: str, c: dict) -> str:
    m = re.search(r"Text-heavy slides \(`item`, `step`, `story-beat`((?:, `[a-z-]+`)*)\)", text)
    if not m:
        raise EditError("plate-prompts.md: the text-heavy list was not found")
    if "`%s`" % c["t"] in m.group(0):
        return text
    return text[:m.end() - 1] + ", `%s`" % c["t"] + text[m.end() - 1:]


def sites() -> list[Site]:
    out: list[Site] = []
    add = out.append
    add(("src/core/registry.js", site_registry))
    add(("src/core/README.md", site_core_readme))
    add(("src/ui/state.js", site_state))
    add((SK + "/scripts/preset_lint.py", site_preset_lint))
    for path in (SK + "/scripts/validate.py", SC + "/scripts/validate.py", PL + "/brand-setup/scripts/validate.py", PL + "/content-plan/scripts/validate.py"):
        add((path, site_validate_py))
    add(("evals/validate_evals.py", site_evals))
    for path in (SK + "/data/qa-rules.json", SC + "/data/qa-rules.json", PL + "/arabic-proofread/data/qa-rules.json"):
        add((path, site_qa_rules))
    add((SK + "/runtime/ui-strings.json", site_ui_strings))
    for path in (SK + "/schemas/spec.schema.json", SC + "/data/schemas/spec.schema.json", SK + "/schemas/preset.schema.json"):
        add((path, site_schema_enum))
    for p in PRESETS:
        add(("%s/styles/%s/preset.json" % (SK, p), site_preset_json))
    add((SK + "/templates/archetypes.html", site_archetype_sheet))
    add(("tools/examples/showcase.spec.json", site_showcase))
    add((PL + "/visual-prompts/data/zones.json", site_zones))
    add((PL + "/visual-prompts/references/plate-prompts.md", site_plate_prompts))
    add((SK + "/references/archetypes.md", site_archetypes_md))
    add((SC + "/references/slide-limits.md", site_slide_limits))
    add((SC + "/references/architectures.md", site_architectures))
    add(("docs/CONTRACT.md", site_contract))
    add(("tests/unit/js/core/fixtures.js", site_fixture_sink))
    add(("tests/unit/js/core/fixtures/swiss.preset.json", site_swiss_fixture))
    add(("tests/unit/js/core/cases/archetypes.test.js", site_archetypes_test))
    add(("tests/unit/js/core/cases/registry.test.js", site_registry_test))
    add(("tests/unit/js/ui/ui.test.mjs", site_ui_test))
    add(("tests/mobile-e2e/preset-matrix.mjs", site_matrix_comment))
    return out


# ---------------------------------------------------------------------------------------------------------------------------------
# run
# ---------------------------------------------------------------------------------------------------------------------------------


def read(path: Path) -> str:
    with open(path, "r", encoding="utf-8", newline="") as fh:
        return fh.read()


def write_atomic(path: Path, text: str) -> None:
    fd, tmp = tempfile.mkstemp(prefix=path.name + ".", suffix=".tmp", dir=str(path.parent))
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="") as fh:
            fh.write(text)
        os.replace(tmp, path)
    except OSError:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="add_type.py", description="Register a new slide type everywhere a type is listed, as a minimal stub.")
    parser.add_argument("type", help="the slide type to register (%s)" % ", ".join(sorted(TYPES)))
    parser.add_argument("--check", action="store_true", help="write nothing; exit 2 when a site still needs the edit")
    parser.add_argument("--items", action="store_true", help="give the showcase slide its items (the spec schema allows `items` only after E1 added it)")
    parser.add_argument("--format", choices=("text", "json"), default="text", help="output format (default: text)")
    parser.add_argument("--root", help="repository root (default: the folder above tools/)")
    try:
        args = parser.parse_args(argv)
    except SystemExit as exc:
        return EXIT_OK if exc.code == 0 else EXIT_USAGE
    if args.type not in TYPES:
        sys.stderr.write("cs-error: E_USAGE: unknown type %r; add its entry to TYPES in tools/add_type.py (known: %s)\n" % (args.type, ", ".join(sorted(TYPES))))
        return EXIT_USAGE
    root = Path(args.root).resolve() if args.root else Path(__file__).resolve().parent.parent
    if not (root / "src").is_dir():
        sys.stderr.write("cs-error: E_USAGE: %s is not the repository root\n" % root)
        return EXIT_NO_INPUT
    t, meta = args.type, TYPES[args.type]

    try:
        reg = read(root / "src/core/registry.js")
        m = re.search(r"var SLIDE_TYPES = \[([^\]]*)\]", reg)
        order = quoted_items(m.group(1)) if m else []
        if not order:
            raise EditError("src/core/registry.js: SLIDE_TYPES not found")
        order = order if t in order else order + [t]
        deck = showcase_types(read(root / "tools/examples/showcase.spec.json"))
        if t not in deck:
            after = max(i for i, x in enumerate(deck) if x == meta["after"]) if meta["after"] in deck else len(deck) - 1
            deck = deck[:after + 1] + [t] + deck[after + 1:]
    except (EditError, OSError) as exc:
        sys.stderr.write("cs-error: E_INTERNAL: %s\n" % exc)
        return EXIT_INTERNAL
    ctx = {"t": t, "meta": meta, "order": order, "deck": deck, "items": args.items}

    changed, clean, pending = [], [], []
    for rel, fn in sites():
        path = root / rel
        if not path.is_file():
            sys.stderr.write("cs-error: E_USAGE: listed file is missing: %s\n" % rel)
            return EXIT_NO_INPUT
        before = read(path)
        try:
            after_text = fn(before, ctx)
        except (EditError, KeyError, ValueError) as exc:
            sys.stderr.write("cs-error: E_INTERNAL: %s: %s\n" % (rel, exc))
            return EXIT_INTERNAL
        if after_text != before:
            changed.append(rel)
            pending.append((path, after_text))
        else:
            clean.append(rel)
    if not args.check:
        for path, text in pending:
            try:
                write_atomic(path, text)
            except OSError as exc:
                sys.stderr.write("cs-error: E_CANT_WRITE: %s: %s\n" % (path, exc))
                return EXIT_CANT_WRITE

    verb = "would change" if args.check else "changed"
    if args.format == "json":
        print(json.dumps({"type": t, "check": args.check, "changed": changed, "clean": len(clean)}, ensure_ascii=False, indent=1))
    else:
        for rel in changed:
            print("%s: %s" % (verb, rel))
        print("%s: %d file(s) %s, %d already registered." % (t, len(changed), verb, len(clean)))
    return EXIT_DRIFT if (args.check and changed) else EXIT_OK


if __name__ == "__main__":
    sys.exit(main())
