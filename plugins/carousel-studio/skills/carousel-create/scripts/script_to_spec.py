#!/usr/bin/env python3
"""script_to_spec.py: turn the creator's finished script into a spec, without the writers' room.

The creator pasted a numbered script (① … ⑥, «1.», «Slide 1», «سلايد 1», or sections split by «---»). Their words are the
script: this keeps them as written and only gives them the spec's structure, so Claude does not read the team manuals.

Step 1, the structure (writes spec.json at checkpoint "design", mode "fast"):
    python script_to_spec.py --script script.md --brand brand.json --out POST_DIR [--style notebook] [--architecture news]
Step 2, the parts only Claude writes (bridges, caption pack, per-slide captions, alt text, optional emphasis and edits):
    python script_to_spec.py --spec POST_DIR/spec.json --fill fill.json --brand brand.json
    It merges them, bumps rev and runs validate.py --checkpoint design --lint; it prints only what is still open.
    When the creator keeps their own words over a check that allows it (a cover over 6 words, say), fill.json adds
    "keep": ["C1.hero-words"] (a rule id, a gate such as "C1", or "C2.body-words@s06" for one slide). Step 2 records it as the
    creator's override («تجاوز»), the same mark the Studio writes, so the check and the export stop raising it.

What step 1 does, and says it did: section 1 is the cover (a label such as «الغلاف» or «Cover» is not copy: the first paragraph is
the headline, the next one the sub); each middle section is an item (title + body), or a checklist when it holds two or more bullet
lines; slide 2 over 12 words is split into a rehook (its title and the first lines that fit) and a story-beat, in the creator's order (unless --no-split2);
any other slide whose text is longer than a slide holds (bodyMaxWords in the platform data) runs on into the next slide at a paragraph or
sentence end, every word kept and in order (unless --no-split, which keeps every slide as written);
in the last section a question becomes the cta slide's title and a «احفظ / شارك / تابع / save / follow …» line its call to action.
It never makes a grid or a timeline (a script names no cards or nodes): the art director or the Studio turns a slide into one.
Emoji are removed from slides, digits follow the brand, bold and heading marks go. The cover motion is picked by the Studio's own
order (myth-fact → stamp, a number on the cover → counter, steps or framework → reorder, news, story or case → story, else
highlight-sweep), kept to what the preset allows.

Exit codes: 0 done (FIX or NOTE may remain), 1 something to fill or a FIX, 2 a BLOCK or an invalid spec, 64 usage, 65 bad input.
"""
from __future__ import annotations

import argparse
import datetime as _dt
import json
import re
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
try:
    from _cs import paths, report as csreport, text as cstext
except ImportError as exc:  # the shared package is synced next to the scripts
    sys.stderr.write("cs-error: E_DEP_LOAD: the shared _cs package is missing next to this script: %s\n" % exc)
    sys.exit(70)

paths.ensure_utf8_stdio()

SEPARATOR = re.compile(r"^\s*(?:-{3,}|_{3,}|\*{3,}|—{2,}|={3,})\s*$")
CIRCLED = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳"
NUMBER = r"(?:[%s]|[0-9٠-٩]{1,2})" % CIRCLED
HEADER = re.compile(
    r"^\s*(?:#{1,6}\s*)?(?:\*\*|__)?\s*(?:(?:slide|سلايد|شريحة|الشريحة|السلايد)\s*(?:رقم\s*)?%s\s*[:.)\-–—]?|[%s]\s*[:.)\-–—]?|[0-9٠-٩]{1,2}\s*[:.)\-–—](?![0-9٠-٩])|\(%s\))\s*(?P<rest>.*?)\s*(?:\*\*|__)?\s*$"
    % (NUMBER, CIRCLED, NUMBER), re.IGNORECASE)  # a bare digit needs its separator («١ — …», «1.»): «٩٠ دقيقة…» is copy
CIRCLED_ONLY = re.compile(r"^\s*(?:#{1,6}\s*)?(?:\*\*|__)?\s*[%s]" % CIRCLED)
BOLD_LINE = re.compile(r"^\s*(?:\*\*|__)(?P<rest>.+?)(?:\*\*|__)\s*$")
HEADING = re.compile(r"^\s*#{1,6}\s+(?P<rest>.+?)\s*$")
BULLET = re.compile(r"^\s*(?:[-•·▪◦–]|\*(?!\*))\s+(?P<rest>.+)$")
COVER_LABEL = re.compile(r"^(?:الغلاف|غلاف|الكوفر|كوفر|الكافر|كافر|الكفر|الكڤر|الهوك|هوك|البداية|cover|hook|intro)\s*[:.\-–—]?$", re.IGNORECASE)
END_LABEL = re.compile(r"^(?:(?:الـ|ال)?\s*CTA|call\s+to\s+action|الخاتمة|الختام|القفلة|السلايد الأخير|السلايد الاخير|الأخير|outro)\s*[:.\-–—]?$", re.IGNORECASE)
EMOJI = re.compile("[\U0001F000-\U0001FAFF☀-➿⬀-⯿⌚⌛⏩-⏺️‍⃣]")
EMOJI_LEAD = re.compile(r"^\s*(?:\*\*|__)?\s*(?:" + EMOJI.pattern + ")")  # «🎮 الألعاب: …» marks a list item
ITALIC = re.compile(r"(?<![*\w])\*(?=\S)([^*\n]+?)(?<=\S)\*(?![*\w])")
QUESTION_END = re.compile(r"[؟?]\s*$")
CTA_KINDS = (  # first match wins; the order is the order a line is read in
    ("save", r"احفظ|احفظه|احفظها|سيّف|سيف|\bsave\b|bookmark"),
    ("send", r"شارك|ابعت|ابعته|ابعتها|أرسل|ارسل|ابعث|منشن|\bshare\b|\bsend\b|\btag\b"),
    ("keyword-dm", r"اكتب\s*[«\"]|علّق\s*بكلمة|علق\s*بكلمة|كومنت\s*بكلمة|\bcomment\s+[\"«]|\bDM\b"),
    ("follow", r"تابع|تابعني|تابعنا|فولو|\bfollow\b"),
    ("question", r"قولّي|قولي|قول لي|اكتب|علّق|علق|كومنت|ردّ|رد عليا|\bcomment\b|\breply\b"),
)
FAMILY_BY_ARCH = {"news": "P12", "story": "P9", "case-study": "P9", "myth-fact": "P4", "comparison": "P2", "listicle": "P1",
                  "steps": "P11", "framework": "F17", "opinion": "F21", "results": "P7", "offer": "S1", "lead-magnet": "P11"}
LENS_BY_ARCH = {"news": "news", "story": "story", "case-study": "story", "myth-fact": "myth", "framework": "framework",
                "comparison": "free-vs-paid", "opinion": "contrarian", "steps": "setup"}
STORY_FEEL = {"stamp", "reorder", "story", "drop-clock", "map-dots"}
ARCHITECTURES = ("listicle", "steps", "myth-fact", "story", "case-study", "framework", "comparison", "opinion", "news", "offer",
                 "results", "lead-magnet")
SENTENCE_END = re.compile(r"(?<=[.!?؟…])\s+")
MAX_SLIDES = 20  # Instagram's limit for one carousel


class _Parser(argparse.ArgumentParser):
    def error(self, message):
        sys.stderr.write("cs-error: E_USAGE: %s\n" % message)
        sys.exit(64)


def fail(code: str, message: str, status: int = 65):
    sys.stderr.write("cs-error: %s: %s\n" % (code, message))
    sys.exit(status)


def now() -> str:
    return _dt.datetime.now(_dt.timezone.utc).replace(microsecond=0).strftime("%Y-%m-%dT%H:%M:%SZ")


def words(s) -> int:
    return cstext.word_count(s or "")


# ---------------------------------------------------------------- parsing

def clean(line: str, digits: str, removed: list) -> str:
    out = EMOJI.sub("", line)
    if out != line:
        removed.append(True)
    out = re.sub(r"\*\*|__", "", out)
    out = ITALIC.sub(lambda m: m.group(1), out)  # «*فكرة توضيحية*» is emphasis in the chat, not copy
    out = re.sub(r"[ \t ]+", " ", out).strip()
    return cstext.convert_digits(out, digits)


def header_text(line: str):
    """The text of a section header line, or None when the line is copy."""
    m = HEADER.match(line)
    if m and (m.group("rest") or CIRCLED_ONLY.match(line) or re.match(r"^\s*(?:#|\*\*|__)", line) or
              re.match(r"^\s*(?:slide|سلايد|شريحة|الشريحة|السلايد)", line, re.IGNORECASE)):
        return m.group("rest").strip()
    for rx in (BOLD_LINE, HEADING):
        m = rx.match(line)
        if m:
            return m.group("rest").strip()
    return None


def split_sections(raw: str) -> list[list[str]]:
    lines = raw.replace("\r\n", "\n").replace("\r", "\n").lstrip("﻿").split("\n")
    if any(SEPARATOR.match(l) for l in lines):
        out, cur = [], []
        for l in lines:
            if SEPARATOR.match(l):
                out.append(cur)
                cur = []
            else:
                cur.append(l)
        out.append(cur)
    else:  # no separators: a numbered header line starts each section
        out, cur = [], []
        for l in lines:
            if HEADER.match(l) and header_text(l) is not None and any(x.strip() for x in cur):
                out.append(cur)
                cur = []
            cur.append(l)
        out.append(cur)
    return [s for s in out if any(x.strip() for x in s)]


def parse_section(lines: list[str], digits: str, removed: list, first: bool, emoji_list: bool = False) -> dict:
    body = [l for l in lines]
    while body and not body[0].strip():
        body.pop(0)
    if first and body and header_text(body[0]) is None and re.match(r"^\s*(?:اعملي|اعمل|اعمللي|سوّ لي|سو لي|عايز|ابغى|make|create)\b", body[0], re.IGNORECASE):
        body = body[1:]  # «اعملي كاروسيل عن» before the cover is the request, not copy
        while body and not body[0].strip():
            body.pop(0)
    head = None
    if body:
        h = header_text(body[0])
        if h is not None:
            head = clean(h, digits, removed)
            if head and (COVER_LABEL.match(head) or END_LABEL.match(head)):
                head = ""  # «١ — الكافر», «سلايد ٨ — القفلة» name the slide; the line under it is the copy
            opened, body = body[0].count("**") % 2 == 1, body[1:]
            if opened:  # a bold title over two or three lines («**مستنّي ردّك؟» / «بيئة التنفيذ تاخد استراحة.**») stays one title
                close = next((i for i, l in enumerate(body[:2]) if "**" in l), None)
                if close is not None and all(l.strip() for l in body[:close + 1]):
                    head = "\n".join([head] + [t for t in (clean(l, digits, removed) for l in body[:close + 1]) if t])
                    body = body[close + 1:]
            if not head:  # «**سلايد ٢**» alone: the bold line under it is the title
                while body and not body[0].strip():
                    body.pop(0)
                m = (BOLD_LINE.match(body[0]) or HEADING.match(body[0])) if body else None
                if m and clean(m.group("rest"), digits, []):
                    head, body = clean(m.group("rest"), digits, removed), body[1:]
    items = []
    for l in body:
        if not l.strip():
            items.append(("break", ""))
            continue
        b = BULLET.match(l)
        kind = "bullet" if b else ("emoji" if EMOJI_LEAD.match(l) else "line")
        items.append((kind, clean(b.group("rest") if b else l, digits, removed)))
    emoji_bullets = emoji_list and sum(1 for k, _ in items if k == "emoji") >= 2  # «🎮 …» «🎬 …» lines are a list
    paras, cur, bullets, open_item = [], [], [], False
    for kind, t in items + [("break", "")]:
        if kind == "break":
            open_item = False
            if cur:
                paras.append("\n".join(cur))
                cur = []
        elif t and (kind == "bullet" or (kind == "emoji" and emoji_bullets)):
            bullets.append(t)
            open_item = kind == "emoji"
        elif t and open_item:  # «🎮 **Playable Games**» then «متاح على كل خطط…» under it: one item
            bullets[-1] = bullets[-1] + " " + t
        elif t:
            cur.append(t)
    return {"head": head, "paras": paras, "bullets": bullets}


def cta_kinds(line: str) -> list[str]:
    return [k for k, rx in CTA_KINDS if re.search(rx, line, re.IGNORECASE)]


def one_line(s: str) -> str:
    return re.sub(r"\s*\n\s*", " ", s or "").strip()


# ---------------------------------------------------------------- building

def build_slides(sections: list[dict], split2: bool, notes: list, split_more: bool = True) -> list[dict]:
    slides = []
    cover = sections[0]
    head, paras = cover["head"], list(cover["paras"])
    if head and not COVER_LABEL.match(head):
        headline, sub = head, (one_line(paras.pop(0)) if paras else None)
    else:
        headline = paras.pop(0) if paras else (head or "")
        sub = one_line(paras.pop(0)) if paras else None
    s = {"type": "cover", "headline": headline.strip()}
    if sub:
        s["sub"] = sub
    if paras:
        s["notes"] = " / ".join(one_line(p) for p in paras)[:300]
        notes.append("cover: %d extra line(s) kept in the slide notes, not on the cover" % len(paras))
    slides.append(s)

    middle, last = sections[1:-1], (sections[-1] if len(sections) > 1 else None)
    for sec in middle:
        slides.append(content_slide(sec))
    if last is not None:
        if last["head"] and END_LABEL.match(last["head"]):  # «الـ CTA» names the slide for the creator; it is not copy
            last = {**last, "head": None}
        paras = last["paras"]
        is_q = lambda p: bool(QUESTION_END.search(one_line(p))) and words(p) <= 14
        cta = next((p for p in reversed(paras) if cta_kinds(p) and words(p) <= 16 and not QUESTION_END.search(one_line(p))), None)
        if last["head"] and is_q(last["head"]):  # «**أول لعبة تعملها هتكون إيه؟**»: the title is the ask
            question, start, last = last["head"], 0, {**last, "head": None}
        else:
            qi = next((i for i, p in enumerate(paras) if is_q(p) and p is not cta), None)  # the first question is the ask
            question, start = (paras[qi], qi + 1) if qi is not None else (None, 0)
        # short questions right after the ask («سباق في الشوارع… ولا لعبة بطلها إنت؟», the options) stay under it, in order
        after = []
        for p in (paras[start:] if question else []):
            if p is cta or not is_q(p):
                break
            after.append(p)
        last = {**last, "paras": [p for p in paras if not any(p is a for a in after)]}
        if not (question or cta):  # one paragraph of short lines: the question line, then the lines that follow it
            lines = [l for p in last["paras"] for l in p.split("\n") if l.strip()]
            qi = next((i for i, l in enumerate(lines) if QUESTION_END.search(l) and words(l) <= 14), None)
            if qi is not None:
                question, after = lines[qi], lines[qi + 1:]
                ci = next((i for i, l in enumerate(after) if cta_kinds(l) and words(l) <= 16), None)
                cta = after.pop(ci) if ci is not None else None
                last = {**last, "paras": lines[:qi]}
        rest = [p for p in last["paras"] if p is not question and p is not cta]
        if not (question or cta) and last["head"] and not rest and not last["bullets"] and (cta_kinds(last["head"]) or QUESTION_END.search(last["head"])):
            if QUESTION_END.search(last["head"]):
                question = last["head"]
            else:
                cta = last["head"]
            last = {**last, "head": None}
        if question or cta:
            if rest or last["bullets"]:
                slides.append(content_slide({"head": last["head"], "paras": rest, "bullets": last["bullets"]}))
                title = one_line(question) if question else one_line(cta)
            else:
                title = one_line(question) if question else (last["head"] or one_line(cta))
            kinds = cta_kinds(cta) if cta else []
            kind = "question" if (question and not kinds) else (kinds[0] if kinds else "question")
            text = one_line(cta) if cta else ("اكتب إجابتك في كومنت" if question else title)
            slides.append({"type": "cta", "title": title, "cta": {"kind": kind, "text": text[:160]}})
            if after:  # the creator's lines after the ask stay on the last slide, in order
                body = " ".join(one_line(l) for l in after)
                slides[-1] = {"type": "cta", "title": title, "body": body, "cta": slides[-1]["cta"]}
                long_end = words(title) + words(body) + words(text) > cta_max()
                notes.append("last slide: %d line(s) after the ask kept as its body, in order%s" % (
                    len(after), "; it runs over %d words, offer a shorter last slide in one line (fill.edits on yes, keep on no)" % cta_max() if long_end else ""))
            many = [k for k in kinds if k != "question"]
            if len(many) > 1:
                notes.append("last slide: one line asks for %s; it stays as written: offer the one action that fits the post in one line, never cut it yourself (fill.edits on yes, keep on no)" % " + ".join(many))
        else:
            slides.append(content_slide(last))
            notes.append("last slide: no question or call to action found; add one in fill.edits if you want it")

    if split2 and len(slides) > 2 and slides[1]["type"] == "item" and words(slides[1].get("title", "") + " " + slides[1].get("body", "")) > 12:
        s2 = slides[1]
        paras2 = s2.pop("_paras", [s2.get("body", "")])
        title_w = words(s2.get("title", ""))
        rehook = {"type": "rehook", "headline": s2.get("title") or one_line(paras2[0])}
        lead, used = [], title_w
        if s2.get("title"):
            for p in paras2:  # the first lines that fit, in the creator's order: a later line never moves before an earlier one
                if used + words(p) > 12:
                    break
                lead.append(p)
                used += words(p)
        if lead:
            rehook["sub"] = " ".join(one_line(p) for p in lead)
        rest = paras2[len(lead):] if s2.get("title") else paras2[1:]
        new = [rehook]
        if rest:
            new.append({"type": "story-beat", "body": " ".join(one_line(p) for p in rest), "_paras": [one_line(p) for p in rest]})
        slides[1:2] = new
        notes.append("slide 2 had %d words (a second cover holds 12): split into a rehook and a story-beat; --no-split2 keeps it" %
                     (title_w + sum(words(p) for p in paras2)))
    runs = split_long(slides, body_max(), 1 if split2 else 2) if split_more else []  # --no-split2 keeps slide 2 whole
    number(slides)
    for first, parts, total, long_one in runs:
        if len(parts) > 1:
            notes.append("%s had %d words (a slide holds %d): its words now run over %s, in the creator's order and unchanged; --no-split keeps it" %
                         (first["id"], total, body_max(), ", ".join(p["id"] for p in parts)))
        if long_one:
            notes.append("%s: one sentence of %d words is longer than a slide holds (%d); offer the creator a shorter version in one line (fill.edits)" %
                         (long_one[0]["id"], long_one[1], body_max()))
        if not parts:
            notes.append("%s had %d words: the carousel already has %d slides, so it was not split; offer a shorter version (fill.edits)" %
                         (first["id"], total, MAX_SLIDES))
    return [dict([("id", s["id"]), ("n", s["n"])] + [(k, v) for k, v in s.items() if k not in ("id", "n")]) for s in slides]


def number(slides: list[dict]) -> None:
    run = 0
    for i, s in enumerate(slides):
        s.pop("_paras", None)
        s["id"], s["n"] = "s%02d" % (i + 1), i + 1
        run = run + 1 if (s["type"] == "item" and i and slides[i - 1]["type"] == "item") else (1 if s["type"] == "item" else 0)
        if s["type"] == "item":  # alternate the look so a run of items keeps a rhythm (gate D8) even before the free design
            s["variant"] = "base" if run % 2 else "ghost-number"


def cta_max() -> int:
    """The last slide's comfortable length from the platform data (plugin.text.ctaMaxWords); 12 when the file cannot be read."""
    try:
        data = json.loads((HERE.parent / "data" / "platform-instagram.json").read_text(encoding="utf-8"))
        return int(data["plugin"]["text"]["ctaMaxWords"])
    except (OSError, ValueError, KeyError, TypeError):
        return 12


def body_max() -> int:
    """The comfortable body length from the platform data (plugin.text.bodyMaxWords); 25 when the file cannot be read."""
    try:
        data = json.loads((HERE.parent / "data" / "platform-instagram.json").read_text(encoding="utf-8"))
        return int(data["plugin"]["text"]["bodyMaxWords"])
    except (OSError, ValueError, KeyError, TypeError):
        return 25


def pieces(s: dict, limit: int) -> list[str]:
    """The slide's text as the creator's own pieces: its paragraphs, and the sentences of a paragraph that alone is too long."""
    out = []
    for p in s.get("_paras") or [s.get("body", "")]:
        p = one_line(p)
        if p:
            out.extend([x.strip() for x in SENTENCE_END.split(p) if x.strip()] if words(p) > limit else [p])
    return out


def halves(units: list[str], limit: int) -> list[list[str]]:
    """Cut at the piece boundary that makes the two sides most even, again on a side still too long; order never changes."""
    total = sum(words(u) for u in units)
    if total <= limit or len(units) < 2:
        return [units]
    best, left = None, 0
    for i in range(1, len(units)):
        left += words(units[i - 1])
        if best is None or abs(total - 2 * left) < best[0]:
            best = (abs(total - 2 * left), i)
    return halves(units[:best[1]], limit) + halves(units[best[1]:], limit)


def split_long(slides: list[dict], limit: int, start: int = 1) -> list[tuple]:
    """Over-long item and story-beat slides run on into story-beat slides. The words are the creator's, so this only moves them:
    a slide too long for any layout is a design problem, and splitting it is the design answer. Returns, per long slide, the
    slides it became, its word count, and a sentence that is still too long on its own (to offer a shorter version for)."""
    out, i = [], start
    while i < len(slides) - 1:
        s = slides[i]
        total = words(s.get("body"))
        if s["type"] not in ("item", "story-beat") or total <= limit:
            i += 1
            continue
        chunks = halves(pieces(s, limit), limit)
        if len(chunks) > 1 and len(slides) + len(chunks) - 1 > MAX_SLIDES:
            out.append((s, [], total, None))
            i += 1
            continue
        if len(chunks) > 1:
            s["body"] = " ".join(chunks[0])
            s.pop("_paras", None)
        parts = [s] + [{"type": "story-beat", "body": " ".join(c)} for c in chunks[1:]]
        slides[i + 1:i + 1] = parts[1:]
        long_one = next(((p, words(u)) for p, c in zip(parts, chunks) for u in c if words(u) > limit), None)
        out.append((s, parts, total, long_one))
        i += len(parts)
    return out


def content_slide(sec: dict) -> dict:
    head, paras, bullets = sec["head"], [one_line(p) for p in sec["paras"]], sec["bullets"]
    if len(bullets) >= 2 and head:
        s = {"type": "checklist", "title": head, "bullets": bullets[:8]}
        if paras:
            s["body"] = " ".join(paras)
        return s
    if head:
        return {"type": "item", "title": head, "body": " ".join(paras + bullets), "_paras": paras + bullets}
    return {"type": "story-beat", "body": " ".join(paras + bullets)}


def guess_architecture(slides: list[dict]) -> str:
    cover = re.sub(r"==", "", slides[0].get("headline", "") + " " + slides[0].get("sub", ""))
    allt = " ".join(json.dumps(s, ensure_ascii=False) for s in slides)
    if re.search(r"خطوة|خطوات|\bsteps?\b", allt, re.IGNORECASE):
        return "steps"
    if re.search(r"خرافة|غلط شائع|\bmyth\b", allt, re.IGNORECASE):
        return "myth-fact"
    if re.search(r"[0-9٠-٩]", re.sub(r"\b(19|20)[0-9]{2}\b", "", cover)):
        return "listicle"
    return "story"


def pick_motion(spec: dict, preset: dict) -> dict:
    arch = spec.get("architecture")
    cover = spec["slides"][0]
    cover_text = re.sub(r"==", "", (cover.get("headline") or "") + " " + (cover.get("sub") or ""))
    numeral = bool(re.search(r"[0-9٠-٩]", re.sub(r"\b(19|20)[0-9]{2}\b", "", cover_text))) or any(s.get("type") == "stat" for s in spec["slides"])
    if arch == "myth-fact":
        recipe = "stamp"
    elif numeral:
        recipe = "counter"
    elif arch in ("steps", "framework"):
        recipe = "reorder"
    elif arch in ("news", "story", "case-study"):
        recipe = "story"
    else:
        recipe = "highlight-sweep"
    motion = (preset or {}).get("motion") or {}
    allowed = motion.get("allowed") or []
    if allowed and recipe not in allowed:
        recipe = "reorder" if (recipe == "story" and "reorder" in allowed) else (motion.get("default") or "highlight-sweep")
    return {"recipe": recipe, "feel": "story" if recipe in STORY_FEEL else "calm", "seconds": 6, "fps": 30, "source": "internal"}


def load_preset(preset_id: str) -> dict:
    name = preset_id.split("@")[0]
    p = HERE.parent.parent / "carousel-design" / "styles" / name / "preset.json"
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def next_id(out_dir: Path) -> str:
    m = re.match(r"^post-\d{8}-\d{4}$", out_dir.name)
    return out_dir.name if m else "post-%s-0001" % _dt.date.today().strftime("%Y%m%d")


def make_spec(args, raw: str, brand: dict) -> tuple[dict, list]:
    loc = dict(brand.get("locale") or {})
    digits = loc.get("digits") or "western"
    removed, notes = [], []
    raw_sections = split_sections(raw)
    sections = [parse_section(s, digits, removed, i == 0, 0 < i < len(raw_sections) - 1) for i, s in enumerate(raw_sections)]
    sections = [s for s in sections if s["head"] or s["paras"] or s["bullets"]]
    if len(sections) < 2:
        fail("E_SCRIPT", "found %d section(s); number the slides (①, 1., Slide 1) or split them with a line of ---" % len(sections))
    slides = build_slides(sections, not (args.no_split2 or args.no_split), notes, not args.no_split)
    if removed:
        notes.append("emoji removed from the slides (no emoji on slides; keep them for the caption)")
    if len(slides) < 6:
        notes.append("%d slides: under 6 reads thin on Instagram; it still works" % len(slides))
    style = args.style or ((brand.get("visual") or {}).get("presetId")) or "creator"
    preset_id = style if "@" in style else style + "@1.0"
    arch = args.architecture or guess_architecture(slides)
    cover = slides[0]
    cover_line = one_line(cover.get("headline", ""))
    stamp = now()
    spec = {
        "specVersion": 1, "id": args.id or next_id(Path(args.out)), "rev": 1,
        "brand": {"slug": brand.get("slug") or "brand"},
        "brief": {"topic": cover_line[:600], "input": "notes", "note": "the creator's own script, kept as written"},
        "format": "carousel", "mode": "fast", "checkpoint": "design",
        "canvas": {"preset": "ig-3x4", "w": 1080, "h": 1440, "safe": [34, 45, 1012, 1350], "exports": ["3x4", "4x5"]},
        "locale": {k: loc[k] for k in ("dialect", "register", "digits", "appLanguage", "swipeCue", "uiDialect") if loc.get(k)},
        "intent": args.intent, "awareness": args.awareness, "contentType": "soft-sell" if arch in ("offer", "results", "lead-magnet") else "value",
        "architecture": arch,
        "angle": {"id": "a1", "title": cover_line[:200], "lens": LENS_BY_ARCH.get(arch, "story"), "why": "نص صاحب الحساب زي ما هو"},
        "hook": {"id": "creator-script", "family": "P6" if QUESTION_END.search(cover_line) else FAMILY_BY_ARCH.get(arch, "P12"),
                 "text": cover_line[:400], "cover": cover.get("headline", "")[:160]},
        "style": {"presetId": preset_id},
        "slides": slides,
        "approvals": {"angle": {"at": stamp}, "script": {"at": stamp, "rev": 1}},
        "meta": {"createdAt": stamp, "updatedAt": stamp, "updatedBy": "claude", "generator": {"skill": "carousel-create", "version": "1.1.0"}},
        "ext": {"source": "creator-script"},
    }
    if args.dialect:
        spec["locale"]["dialect"] = args.dialect
    spec["locale"].setdefault("dialect", "eg")
    en = spec["locale"]["dialect"] == "en"
    spec["locale"].setdefault("register", "white" if spec["locale"]["dialect"] in ("en", "msa-white") else "dialect")
    spec["locale"].setdefault("digits", digits)
    spec["locale"].setdefault("appLanguage", "en" if en else "ar")
    spec["locale"].setdefault("swipeCue", "arrow-ltr" if spec["locale"]["appLanguage"] == "en" else "arrow-rtl")
    spec["cover"] = {"motion": pick_motion(spec, load_preset(preset_id))}
    return spec, notes


# ---------------------------------------------------------------- fill

def wrap_once(s: str, word: str):
    if not s or not word or "==" in s or word not in s:
        return None
    return s.replace(word, "==%s==" % word, 1)


def apply_fill(spec: dict, fill: dict) -> list:
    notes = []
    slides = spec["slides"]
    by_id = {s["id"]: s for s in slides}
    bridges = fill.get("bridges") or {}
    if isinstance(bridges, list):
        bridges = {s["id"]: b for s, b in zip(slides[1:-1], bridges)}
    for sid, b in bridges.items():
        if sid in by_id and isinstance(b, str) and b.strip():
            by_id[sid]["bridge"] = b.strip()
    for sid, word in (fill.get("emphasis") or {}).items():
        s = by_id.get(sid)
        if not s:
            continue
        for field in ("headline", "title", "sub", "body"):
            w = wrap_once(s.get(field), word)
            if w:
                s[field] = w
                break
        else:
            notes.append("%s: «%s» is not in its text, no emphasis added" % (sid, word))
    for sid, fields in (fill.get("edits") or {}).items():
        s = by_id.get(sid)
        if s and isinstance(fields, dict):
            for k, v in fields.items():
                if k in ("id", "n"):
                    continue
                if v is None:
                    s.pop(k, None)
                else:
                    s[k] = v
    pack = dict(spec.get("captionPack") or {})
    cap = fill.get("caption") or {}
    for k in ("firstLine", "keywordLine", "body", "cta", "hashtags", "asset"):
        if k in cap:
            pack[k] = cap[k]
    for k in ("perSlide", "alt"):
        if k in fill:
            pack[k] = fill[k]
    if pack:
        spec["captionPack"] = pack
    if isinstance(fill.get("motion"), dict):
        spec.setdefault("cover", {})["motion"] = {**(spec.get("cover", {}).get("motion") or {}), **fill["motion"]}
    if isinstance(fill.get("teamLog"), list):
        spec.setdefault("ext", {})["teamLog"] = fill["teamLog"][:6]
    spec["rev"] = int(spec.get("rev") or 1) + 1
    spec.setdefault("approvals", {}).setdefault("script", {"at": now()})["rev"] = spec["rev"]
    spec.setdefault("meta", {})["updatedAt"] = now()
    spec["meta"]["updatedBy"] = "claude"
    return notes


def bind_all(spec: dict) -> None:
    """A number and its Arabic noun (and a label such as «يوم» and its number) never split across lines: gate B1 wants the
    no-break space in the text itself. Idempotent, keeps ==emphasis== and line breaks."""
    for s in spec.get("slides") or []:
        for k in ("kicker", "headline", "sub", "title", "body", "bridge"):
            if isinstance(s.get(k), str):
                s[k] = cstext.bind(s[k])
        if isinstance(s.get("bullets"), list):
            s["bullets"] = [cstext.bind(b) if isinstance(b, str) else b for b in s["bullets"]]
        if isinstance(s.get("cta"), dict) and isinstance(s["cta"].get("text"), str):
            s["cta"]["text"] = cstext.bind(s["cta"]["text"])
    pack = spec.get("captionPack")
    if isinstance(pack, dict):
        for k in ("firstLine", "keywordLine", "body", "cta"):
            if isinstance(pack.get(k), str):
                pack[k] = cstext.bind(pack[k])
        for k in ("perSlide", "alt"):
            if isinstance(pack.get(k), list):
                pack[k] = [cstext.bind(x) if isinstance(x, str) else x for x in pack[k]]


def todo(spec: dict) -> list[str]:
    slides, pack = spec["slides"], spec.get("captionPack") or {}
    need = []
    missing = [s["id"] for s in slides[1:-1] if not s.get("bridge")]
    if missing:
        need.append("bridges for %s (8 words or fewer, each opens the next slide)" % ", ".join(missing))
    caption = [k for k in ("firstLine", "keywordLine", "body", "cta", "hashtags") if not pack.get(k)]
    if caption:
        need.append("caption: %s (line 1 ≤ 125 characters, 300 to 900 in all, ≤ 5 hashtags, no handle of the tool)" % ", ".join(caption))
    for k, what in (("perSlide", "perSlide: one short caption per slide (≤ 100 characters)"), ("alt", "alt: one alt text per slide, in the post's language")):
        v = pack.get(k)
        if not (isinstance(v, list) and len(v) == len(slides) and all(isinstance(x, str) and x.strip() for x in v)):
            need.append("%s, %d entries" % (what, len(slides)))
    return need


FILL_SHAPE = ('{"bridges": {"s02": "…"}, "emphasis": {"s04": "word"}, "caption": {"firstLine": "…", "keywordLine": "…", "body": "…", '
              '"cta": "…", "hashtags": ["#…"]}, "perSlide": ["…"], "alt": ["…"], "edits": {"s08": {"cta": {"kind": "question", "text": "…"}}}}')


def run_validate(spec_path: Path, brand: str | None) -> tuple[int, dict]:
    cmd = [sys.executable, str(HERE / "validate.py"), "spec", str(spec_path), "--checkpoint", "design", "--lint", "--format", "json"]
    if brand:
        cmd += ["--brand", brand]
    res = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8")
    try:
        return res.returncode, json.loads(res.stdout)
    except ValueError:
        return 2, {"errors": [{"message": (res.stderr or res.stdout).strip()[:400]}]}


QA_RESULT_KEYS = ("gate", "rule", "sev", "slide", "el", "msg", "fix", "autofixed", "overridden", "prospect")
KEEP_REASON = "the creator kept their own words"
COVER_LENGTH = ("C1.hero-words", "C1.total-words", "C1.lines")  # one decision («keep my long hook»), as in _cs.qa


def store_qa(spec: dict, rep: dict) -> None:
    """Keep the check's findings, with their override marks, in spec.qa (the Studio and the export carry them forward)."""
    qa = rep.get("qa") or {}
    results = [{k: r[k] for k in QA_RESULT_KEYS if k in r} for r in qa.get("results") or []
               if isinstance(r, dict) and r.get("gate") and r.get("sev") and r.get("msg")][:400]
    open_ = [r for r in results if not r.get("overridden")]
    spec["qa"] = {"status": "block" if any(r["sev"] == "BLOCK" for r in open_) else "fix" if any(r["sev"] == "FIX" for r in open_)
                  else "pass", "runAt": now(), "results": results}
    if re.match(r"^cs-[0-9]+\.[0-9]+\.[0-9]+$", str(qa.get("engine") or "")):
        spec["qa"]["engine"] = qa["engine"]


def keep_list(fill: dict) -> list[tuple[str, str]]:
    """fill["keep"]: rule ids, gate ids or rule@sNN the creator chose to keep as written."""
    out = []
    for k in fill.get("keep") or []:
        if isinstance(k, str) and k.strip():
            rule, _, slide = k.strip().partition("@")
            out.append((rule.strip(), slide.strip()))
    return out


def apply_keep(spec: dict, rep: dict, keep: list[tuple[str, str]]) -> list[str]:
    """Mark the kept findings as the creator's override in spec.qa.results (the shape the Studio and the export read)."""
    qa = rep.get("qa") or {}
    results = [r for r in qa.get("results") or [] if isinstance(r, dict) and r.get("gate") and r.get("sev") and r.get("msg")]
    notes, at, used = [], now(), set()
    cover = {r.get("slide") for r in results for rule, slide in keep
             if rule in COVER_LENGTH and r.get("rule") in COVER_LENGTH and (not slide or r.get("slide") == slide)}
    for r in results:
        for rule, slide in keep:
            sibling = rule in COVER_LENGTH and r.get("rule") in COVER_LENGTH and r.get("slide") in cover
            if not sibling and (rule not in (r.get("rule"), r.get("gate")) or (slide and r.get("slide") != slide)):
                continue
            used.add((rule, slide))
            if r.get("overridden"):
                break
            if csreport.is_overridable(r.get("rule") or r.get("gate")):
                r["overridden"] = {"reason": KEEP_REASON, "at": at}
            else:
                notes.append("%s %s cannot be kept as written: this check must pass" % (r.get("rule"), r.get("slide", "")))
            break
    for rule, slide in keep:
        if (rule, slide) not in used:
            notes.append("keep %s%s: the check does not raise it, nothing to keep" % (rule, "@" + slide if slide else ""))
    store_qa(spec, {"qa": {**qa, "results": results}})
    return notes


def report(code: int, rep: dict, lang: str = "en") -> list[str]:
    out, kept, keepable = [], [], []
    for e in rep.get("errors") or []:
        out.append("  ERROR %s %s" % (e.get("path", ""), e.get("message", "")))
    for e in rep.get("structure") or []:
        out.append("  MISSING %s %s" % (e.get("path", ""), e.get("message", "")))
    qa = rep.get("qa") or {}
    for r in qa.get("results") or []:
        if r.get("overridden"):
            kept.append("%s %s" % (r.get("rule"), r.get("slide", "")))
            continue
        if r.get("sev") == "NOTE":
            continue
        msg = (r.get("msg") or {}).get(lang) or (r.get("msg") or {}).get("en") or ""
        out.append("  %s %s %s %s" % (r.get("sev"), r.get("slide", ""), r.get("rule"), msg))
        if r.get("sev") == "BLOCK" and csreport.is_overridable(r.get("rule") or r.get("gate")) \
                and not (r.get("rule") in COVER_LENGTH and any(k in COVER_LENGTH for k in keepable)):
            keepable.append(r.get("rule"))
    c = qa.get("counts") or {}
    out.insert(0, "check: %d BLOCK, %d FIX, %d NOTE%s" % (c.get("block", 0), c.get("fix", 0), c.get("note", 0),
                                                        "" if not (rep.get("errors") or rep.get("structure")) else ", spec incomplete"))
    if kept:
        out.append("  kept as the creator wrote it: " + ", ".join(sorted(set(k.strip() for k in kept))))
    if keepable:
        out.append('  the creator may keep their words over %s: ask once; on yes add "keep": [%s] to fill.json and run step 2 again'
                   % (", ".join(dict.fromkeys(keepable)), ", ".join('"%s"' % k for k in dict.fromkeys(keepable))))
    return out


def summary(spec: dict) -> str:
    kinds = []
    for s in spec["slides"]:
        if kinds and kinds[-1][0] == s["type"]:
            kinds[-1][1] += 1
        else:
            kinds.append([s["type"], 1])
    shape = ", ".join(k if n == 1 else "%s ×%d" % (k, n) for k, n in kinds)
    m = (spec.get("cover") or {}).get("motion") or {}
    return "%d slides (%s) · %s · %s · motion %s" % (len(spec["slides"]), shape, spec["style"]["presetId"], spec.get("architecture"), m.get("recipe"))


def main(argv=None) -> int:
    p = _Parser(description="Turn the creator's finished script into a Carousel Studio spec (step 1), then merge the parts Claude writes (step 2).")
    p.add_argument("--script", help="step 1: the creator's script, as a UTF-8 text or markdown file")
    p.add_argument("--out", help="step 1: the post folder; spec.json is written there")
    p.add_argument("--spec", help="step 2: the spec.json written by step 1")
    p.add_argument("--fill", help="step 2: a JSON file with bridges, caption, perSlide, alt and optional emphasis / edits / motion")
    p.add_argument("--brand", help="brand.json (locale, digits, preset; also used by the check)")
    p.add_argument("--style", help="preset id, e.g. notebook or notebook@1.0 (default: the brand's, else creator)")
    p.add_argument("--architecture", choices=ARCHITECTURES, help="the post's shape (default: guessed: steps, myth-fact, listicle or story)")
    p.add_argument("--intent", default="save", choices=("reach", "save", "send", "sell"))
    p.add_argument("--awareness", default="problem", choices=("unaware", "problem", "solution", "product"))
    p.add_argument("--dialect", help="override the brand's dialect (eg, gulf, levant, msa-white, en)")
    p.add_argument("--id", help="post id (default: the folder name when it looks like post-YYYYMMDD-NNNN)")
    p.add_argument("--no-split2", action="store_true", help="keep a long slide 2 as written")
    p.add_argument("--no-split", action="store_true", help="keep every slide as written: no split of slide 2 or of a slide too long to hold")
    p.add_argument("--format", choices=("text", "json"), default="text")
    a = p.parse_args(argv)
    brand = {}
    if a.brand:
        try:
            brand = paths.read_json(a.brand)
        except (OSError, ValueError) as exc:
            fail("E_BRAND", "cannot read %s: %s" % (a.brand, exc))
    lines, notes, fill = [], [], {}
    if a.script:
        if not a.out:
            p.error("--script needs --out (the post folder)")
        try:
            raw = Path(a.script).read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError) as exc:
            fail("E_SCRIPT", "cannot read %s: %s" % (a.script, exc))
        spec, notes = make_spec(a, raw, brand)
        spec_path = Path(a.out) / "spec.json"
        spec_path.parent.mkdir(parents=True, exist_ok=True)
    elif a.spec and a.fill:
        spec_path = Path(a.spec)
        try:
            spec = paths.read_json(spec_path)
            fill = paths.read_json(a.fill)
        except (OSError, ValueError) as exc:
            fail("E_INPUT", str(exc))
        if not isinstance(fill, dict):
            fail("E_INPUT", "the fill file must be a JSON object: " + FILL_SHAPE)
        notes = apply_fill(spec, fill)
    else:
        p.error("use --script FILE --out DIR (step 1) or --spec FILE --fill FILE (step 2)")
        return 64
    bind_all(spec)
    paths.write_json(spec_path, spec)
    need = todo(spec)
    lines.append("%s: rev %d · %s" % (spec_path.as_posix(), spec["rev"], summary(spec)))
    lines += ["note: " + n for n in notes]
    status = 0
    if need:
        lines.append("to fill (write fill.json, then run step 2 with --spec and --fill):")
        lines += ["  - " + n for n in need]
        lines.append("  shape: " + FILL_SHAPE)
        status = 1
    else:
        code, rep = run_validate(spec_path, a.brand)
        keep = keep_list(fill)
        if keep:
            lines += ["note: " + n for n in apply_keep(spec, rep, keep)]
            paths.write_json(spec_path, spec)
            code, rep = run_validate(spec_path, a.brand)
            store_qa(spec, rep)
            paths.write_json(spec_path, spec)
        lines += report(code, rep, "en")
        status = code if code in (0, 1, 2) else 2
    if a.format == "json":
        print(json.dumps({"spec": spec_path.as_posix(), "rev": spec["rev"], "summary": summary(spec), "notes": notes, "toFill": need,
                          "exit": status}, ensure_ascii=False))
    else:
        print("\n".join(lines))
    return status


if __name__ == "__main__":
    sys.exit(main())
