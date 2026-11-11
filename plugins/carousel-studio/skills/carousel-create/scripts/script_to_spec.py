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
order (urgency, spread, verdict, mistakes, change, number, how-to, product news/question, launch, story, short emphasis,
then highlight-sweep), kept to what the preset allows. It avoids repeating the newest earlier sibling post's recipe.

Exit codes: 0 done (FIX or NOTE may remain), 1 something to fill or a FIX, 2 a BLOCK or an invalid spec, 64 usage, 65 bad input.
"""
from __future__ import annotations

import argparse
import copy
from contextlib import contextmanager
import datetime as _dt
import hashlib
import importlib.util
import json
import os
import re
import subprocess
import sys
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
try:
    from _cs import CSError, paths, qa as csqa, report as csreport, rules as cs_rules, schema, text as cstext
except ImportError as exc:  # the shared package is synced next to the scripts
    sys.stderr.write("cs-error: E_DEP_LOAD: the shared _cs package is missing next to this script: %s\n" % exc)
    sys.exit(70)

paths.ensure_utf8_stdio()

SEPARATOR = re.compile(r"^\s*(?:-{3,}|_{3,}|\*{3,}|—{2,}|={3,})\s*$")
CIRCLED = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳"
NUMBER = r"(?:[%s]|[0-9٠-٩]{1,2})" % CIRCLED
HEADER = re.compile(
    r"^\s*(?:#{1,6}\s*)?(?:\*\*|__)?\s*(?:(?:slide|سلايد|شريحة|الشريحة|السلايد)\s*(?:رقم\s*)?%s\s*[:.)|\-–—]?|[%s]\s*[:.)|\-–—]?|[0-9٠-٩]{1,2}\s*[:.)|\-–—](?![0-9٠-٩])|\(%s\))\s*(?P<rest>.*?)\s*(?:\*\*|__)?\s*$"
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
STORY_FEEL = {"stamp", "reorder", "story", "drop-clock", "map-dots", "curtain", "zoom", "notify", "split"}
# Same normalized dialect tokens as src/motion/topics.js; kept local so the installed skill is self-contained.
MOTION_LEXICON = {
    "mistakes": ["اخطاء","خطا","غلط","اغلاط","غلطه","تموت*","يموت*","تقتل*","يقتل*","قاتل*","تدمر*","يدمر*","تخرب*","يخرب*","فشل*","تفشل*","يفشل*","تضيع*","يضيع*","خساير*","خساره","تخسر*","يخسر*","mistake*","wrong","kill*","fail*","ruin*","wreck*","destroy*","blunder*"],
    "urgency": ["عاجل","فورا","حالا","دلوقتي","دلوقت","الان","الحين","هالحين","هلق","هسا","ينتهي*","تنتهي*","يفوت*","تفوت*","ساعات","دقايق","دقائق","ثواني","سباق","متاخر*","تاخر*","محدود*","سارع*","اخر فرصه","ينتهي الوقت","الوقت بينتهي","الوقت يمر","الوقت ينفد","ضيق الوقت","قبل فوات الوقت","urgent","deadline","hurry","hours","minutes","seconds","race","running out","last chance"],
    "spread": ["انتشار","ينتشر*","تنتشر*","انتشرت","عالمي*","العالم","دول العالم","كل الدول","عدة دول","دوله","مدن","مدينه","محافظات","فروع","كل مكان","حول العالم","spread*","global*","worldwide","countries","cities","everywhere"],
    "decision": ["قرار","قرارات","احسم*","حسم*","اختار*","اختيار","الحقيقه","خرافه","خرافات","اسطوره","ايهما","الافضل","مقابل","ضد","الحكم","صح ولا غلط","vs","versus","myth*","truth","decide*","decision*","choose*","verdict","better"],
    "money": ["فلوس","مال","ربح*","ارباح","ادفع*","تدفع*","سعر","اسعار","ميزانيه","رخيص*","غالي*","ببلاش","مجاني*","تكلفه","دخل","راتب","ثروه","اموال","مصاري","مصروف*","ريال*","درهم","دراهم","دينار*","دولار*","جنيه","money","cash","profit*","price*","cost*","budget","free","paid","income","salary","revenue"],
    "growth": ["نمو","تنمو","زياده","ارتفاع","تضاعف*","مضاعف*","اضعاف","ضعف","ارتفع*","يرتفع*","تزيد*","يزيد*","مبيعات","نتايج","نتائج","growth","grow*","double*","rise*","increase*","boost*","results","sales"],
    "steps": ["خطوه","خطوات","طريقه","طرق","كيف","ازاي","شلون","كيفيه","دليل","شرح","نظام","اسلوب","framework","steps","step","how","guide","system","method"],
    "news": ["خبر","اخبار","جديد","جديده","اطلاق","اطلقت","تحديث","اعلان","اعلنت","launch*","new","announced","update","released","breaking"],
    "story": ["قصه","قصتي","حكايه","تجربتي","تجربه","رحلتي","story","journey","case"],
    "change": ["بقي","بقت","بقوا","اتغير*","بدل","صار","صارت","صاروا","بدال","تبدل*","اصبح","اصبحت","اصبحوا","تغير*","تحول*","استبدل*","مقابل","ضد","vs","versus","now","rename*","instead"],
    "launch": ["دخلت","اطلق*","نزلت","رسمي*","جديد","جديده","اطلاق","يديد","يديده","نزل","دش*","طلع","صدور","اصدار","launch*","new","released","debut*"],
    "product": ["claude","chatgpt","gemini","higgsfield","instagram","openai","anthropic","canva","perplexity","grok","copilot","midjourney","figma","notion","capcut","seedance","sora","veo","kling","cursor","replit","elevenlabs","photoshop","adobe","deepseek","runway","davinci","leonardo","ideogram","krea","flux","lovable","manus","windsurf","vscode","n8n","zapier"],
    "question": [],
    "emphasis": [],
}
ARCHITECTURES = ("listicle", "steps", "myth-fact", "story", "case-study", "framework", "comparison", "opinion", "news", "offer",
                 "results", "lead-magnet")
SENTENCE_END = re.compile(r"(?<=[.!?؟…])\s+")
MARKDOWN_LINK = re.compile(r"\[([^\]\n]+)\]\((https?://(?:[^\s()]|\([^\s()]*\))+)(?:\s+\"[^\"]*\")?\)")
URL = re.compile(r"https?://[^\s<>`\"*]+", re.IGNORECASE)
SOURCE_NAME = r"[A-Z][A-Za-z0-9&.-]*(?: [A-Z][A-Za-z0-9&.-]*){0,3}"
SOURCE_TAIL = re.compile(r"(?:^|\s)(?P<source>" + SOURCE_NAME + r" by " + SOURCE_NAME + r"|(?:www\.)?[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[a-z]{2,24})\s*$")


def max_slides() -> int:
    return int(cs_rules.platform("plugin.slides.hardMax", 10))


class _Parser(argparse.ArgumentParser):
    def error(self, message):
        output("cs-error: E_USAGE: %s\n" % message, sys.stderr)
        sys.exit(64)


def fail(code: str, message: str, status: int = 65):
    output("cs-error: %s: %s\n" % (code, message), sys.stderr)
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
    out = re.sub(r"`([^`]+)`", r"\1", out)
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
    lines = [l for l in lines if not re.fullmatch(r"\s*</?pasted_content\b[^>]*>\s*", l)]
    first = next((i for i, l in enumerate(lines) if HEADER.match(l) and header_text(l) is not None), None)
    if first is not None:
        lines = lines[first:]  # chat instructions and a post label before slide 1 are not slide copy
    out, cur = [], []
    for l in lines:
        boundary = HEADER.match(l) and header_text(l) is not None
        if SEPARATOR.match(l) or (boundary and any(x.strip() for x in cur)):
            out.append(cur)
            cur = []
        if not SEPARATOR.match(l):
            cur.append(l)
    out.append(cur)
    return [s for s in out if any(x.strip() for x in s)]


def normalize_url(ref: str) -> str:
    """Canonical HTTP(S) reference, offline. Remove tracking only; retain meaningful query values and anchors."""
    try:
        u = urlsplit(ref)
        if u.scheme.lower() not in ("http", "https") or not u.hostname or u.username or u.password:
            raise ValueError("use an http(s) URL without credentials")
        host = u.hostname.lower()
        port = u.port
        netloc = ("[" + host + "]" if ":" in host else host)
        if port and (u.scheme.lower(), port) not in (("http", 80), ("https", 443)):
            netloc += ":%d" % port
        query = [(k, v) for k, v in parse_qsl(u.query, keep_blank_values=True)
                 if not k.lower().startswith("utm_") and k.lower() not in ("fbclid", "gclid", "dclid", "msclkid", "mc_cid", "mc_eid")]
        return urlunsplit((u.scheme.lower(), netloc, u.path or "/", urlencode(query), u.fragment))
    except ValueError as exc:
        raise CSError("E_USAGE", "invalid source URL: %s" % exc) from exc


def extract_sources(line: str, refs: list, mentions: list) -> str:
    def link(m):
        refs.append({"ref": normalize_url(m.group(2)), "label": m.group(1)})
        return ""
    line = MARKDOWN_LINK.sub(link, line)
    def bare(m):
        raw = m.group(0)
        ref = raw.rstrip(".,،؛;!؟")
        while ref and ref[-1] in ")]}":
            close = ref[-1]
            if ref.count(close) <= ref.count({")": "(", "]": "[", "}": "{"}[close]):
                break
            ref = ref[:-1]
        refs.append({"ref": normalize_url(ref), "label": urlsplit(ref).hostname})
        return raw[len(ref):]
    line = URL.sub(bare, line)
    m = SOURCE_TAIL.search(line) if not HEADER.match(line) else None
    if m:
        mentions.append(m.group("source"))
        line = line[:m.start()].rstrip()
    return line


def parse_section(lines: list[str], digits: str, removed: list, first: bool, emoji_list: bool = False) -> dict:
    refs, mentions = [], []
    body = [extract_sources(l, refs, mentions) for l in lines]
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
                if body and (BOLD_LINE.match(body[0]) or HEADING.match(body[0]) or re.match(r"^\s*\*\*", body[0])):
                    title = [body.pop(0)]
                    if title[0].count("**") % 2:
                        while body and body[0].strip():
                            title.append(body.pop(0))
                            if "**" in title[-1]:
                                break
                    head = "\n".join(clean(l, digits, removed) for l in title)
    items = []
    for l in body:
        if not l.strip():
            items.append(("break", ""))
            continue
        b = BULLET.match(l)
        kind = "bullet" if b else ("emoji" if EMOJI_LEAD.match(l) else "line")
        items.append((kind, clean(b.group("rest") if b else l, digits, removed)))
    emoji_bullets = emoji_list and sum(1 for k, _ in items if k == "emoji") >= 2  # «🎮 …» «🎬 …» lines are a list
    paras, cur, bullets, open_item, ordered = [], [], [], False, []
    for kind, t in items + [("break", "")]:
        if kind == "break":
            open_item = False
            if cur:
                paras.append("\n".join(cur))
                ordered.append(("para", paras[-1]))
                cur = []
        elif t and (kind == "bullet" or (kind == "emoji" and emoji_bullets)):
            if cur:
                paras.append("\n".join(cur))
                ordered.append(("para", paras[-1]))
                cur = []
            bullets.append(t)
            ordered.append(("bullet", t))
            open_item = kind == "emoji"
        elif t and open_item:  # «🎮 **Playable Games**» then «متاح على كل خطط…» under it: one item
            bullets[-1] = bullets[-1] + " " + t
            ordered[-1] = ("bullet", bullets[-1])
        elif t:
            cur.append(t)
    return {"head": head, "paras": paras, "bullets": bullets, "ordered": ordered, "sources": refs, "mentions": mentions}


def cta_kinds(line: str) -> list[str]:
    return [k for k, rx in CTA_KINDS if re.search(rx, line, re.IGNORECASE)]


def one_line(s: str) -> str:
    return re.sub(r"\s*\n\s*", " ", s or "").strip()


# ---------------------------------------------------------------- building

def build_slides(sections: list[dict], split2: bool, notes: list, split_more: bool = True) -> list[dict]:
    slides = []
    limit = max_slides()
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
    if paras or cover["bullets"]:
        s["sub"] = "\n".join(([s["sub"]] if s.get("sub") else []) + paras + cover["bullets"])
    s["_sources"] = cover.get("sources", [])
    slides.append(s)

    middle, last = sections[1:-1], (sections[-1] if len(sections) > 1 else None)
    for sec in middle:
        slides.append(content_slide(sec))
    if last is not None:
        closing = closing_slides(last, limit - len(slides), split_more, notes)
        for slide in closing:
            slide["_sources"] = last.get("sources", [])
        slides.extend(closing)

    if split2 and len(slides) < limit and len(slides) > 2 and slides[1]["type"] == "item" and words(slides[1].get("title", "") + " " + slides[1].get("body", "")) > 12:
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
        for slide in new:
            slide["_sources"] = s2.get("_sources", [])
        notes.append("slide 2 had %d words (a second cover holds 12): split into a rehook and a story-beat; --no-split2 keeps it" %
                     (title_w + sum(words(p) for p in paras2)))
    elif split2 and len(slides) >= limit and len(slides) > 2 and words(slides[1].get("title", "") + " " + slides[1].get("body", "")) > 12:
        notes.append("slide 2: not split at the %d-slide limit; offer a shorter version" % limit)
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
                         (first["id"], total, limit))
    if len(slides) > limit:
        pairs = sorted(((sum(words(t) for t in csqa.slide_strings(a, False, True) + csqa.slide_strings(b, False, True)), a["id"], b["id"])
                        for a, b in zip(slides, slides[1:])), key=lambda x: (x[0], x[1]))
        notes.extend("merge candidate: %s + %s (%d words together); offer the creator, do not merge automatically" % (a, b, count)
                     for count, a, b in pairs)
        notes.append("%d slides exceed the platform limit of %d; none were truncated" % (len(slides), limit))
    return [dict([("id", s["id"]), ("n", s["n"])] + [(k, v) for k, v in s.items() if k not in ("id", "n")]) for s in slides]


def closing_slides(section: dict, available: int, may_split: bool, notes: list) -> list[dict]:
    """Map the ending in its reading order: title, optional body, then the creator's action lines. Never add copy."""
    blocks = section.get("ordered") or [("para", p) for p in section["paras"]] + [("bullet", b) for b in section["bullets"]]
    lines = ([section["head"]] if section["head"] else []) + [l for _, block in blocks for l in block.split("\n") if l.strip()]
    action = next((i for i, line in enumerate(lines) if any(re.match(r"^(?:و|ف)?(?:" + rx + r")", line, re.IGNORECASE)
                  for _, rx in CTA_KINDS) and not line.lstrip().startswith(("«", '"'))), None)
    missing = "last slide: no explicit call to action found; offer the creator one closing line (save, send, question, keyword-dm or follow). Never invent it. On «زي ما هو», record it with spec_edit.py cta --keep; C4.count stays open unless the shared gate permits an override"
    if action is None:
        notes.append(missing)
        return [content_slide(section)]
    before, after = lines[:action], lines[action:]
    out = []
    # A question after the information can open a separate closing tile, but never beyond the post's budget.
    question = next((i for i, line in enumerate(before) if QUESTION_END.search(line) and words(line) <= 14), None)
    if question and available >= 2 and may_split:
        prefix, before = before[:question], before[question:]
        head = prefix.pop(0) if section["head"] else None
        out.append(content_slide({"head": head, "paras": prefix, "bullets": []}))
    elif question and available < 2:
        notes.append("last slide: not split at the %d-slide limit; all closing copy kept together" % max_slides())
    if before:
        title, body = before[0], " ".join(one_line(l) for l in before[1:])
    else:
        # An action-only ending still needs two slots. Divide its own words, without repeating or inventing a title.
        first, space, rest = after[0].partition(" ")
        if not space and len(after) == 1:
            notes.append(missing)
            return [content_slide(section)]
        title, body = first, ""
        after = ([rest] if rest else []) + after[1:]
    text = " ".join(one_line(l) for l in after)
    if len(text) > 160:
        notes.append("last slide: the action is longer than the CTA field; offer one shorter closing line, never truncate it")
        return [content_slide(section)]
    kinds = list(dict.fromkeys(k for line in lines[action:] for k in cta_kinds(line)))
    slide = {"type": "cta", "title": title, "cta": {"kind": kinds[0], "text": text}}
    if body:
        slide["body"] = body
        notes.append("last slide: %d line(s) after the ask kept as its body, in order" % max(1, len(before) - 1))
    total = words(title) + words(body) + words(text)
    if total > cta_max():
        notes.append("last slide: %d words; offer a shorter last slide in one line, never cut it yourself (spec_edit.py cta on yes, keep on no)" % total)
    many = [k for k in kinds if k != "question"]
    if len(many) > 1:
        notes.append("last slide: one line asks for %s; it stays as written: offer one action in one line, never cut it yourself (spec_edit.py cta on yes, keep on no)" % " + ".join(many))
    return out + [slide]


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
        if len(chunks) > 1 and len(slides) + len(chunks) - 1 > max_slides():
            out.append((s, [], total, None))
            i += 1
            continue
        if len(chunks) > 1:
            s["body"] = " ".join(chunks[0])
            s.pop("_paras", None)
        parts = [s] + [{"type": "story-beat", "body": " ".join(c), "_sources": s.get("_sources", [])} for c in chunks[1:]]
        slides[i + 1:i + 1] = parts[1:]
        long_one = next(((p, words(u)) for p, c in zip(parts, chunks) for u in c if words(u) > limit), None)
        out.append((s, parts, total, long_one))
        i += len(parts)
    return out


def content_slide(sec: dict) -> dict:
    head, paras, bullets = sec["head"], [one_line(p) for p in sec["paras"]], sec["bullets"]
    ordered = sec.get("ordered") or [("para", p) for p in paras] + [("bullet", b) for b in bullets]
    # A checklist has no prose slot in the engine. Mixed lists stay in body order, including the words between bullets.
    if bullets and (paras or len(bullets) > 8):
        body = " ".join(one_line(t) for _, t in ordered)
        s = {"type": "item", "title": head, "body": body, "_paras": [body]} if head else {"type": "story-beat", "body": body}
        return {**s, "_sources": sec.get("sources", [])}
    if len(bullets) >= 2 and head:
        s = {"type": "checklist", "title": head, "bullets": bullets}
        if paras:
            s["body"] = " ".join(paras)
        return {**s, "_sources": sec.get("sources", [])}
    if head:
        return {"type": "item", "title": head, "body": " ".join(paras + bullets), "_paras": paras + bullets, "_sources": sec.get("sources", [])}
    return {"type": "story-beat", "body": " ".join(paras + bullets), "_sources": sec.get("sources", [])}


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


def motion_normalize(text: str) -> str:
    text = re.sub(r"[ً-ٰٟـ]", "", str(text or "").lower())
    text = re.sub(r"[أإآٱ]", "ا", text)
    return re.sub(r"\s+", " ", text.translate(str.maketrans("ىةؤئ", "يهوي"))).strip()


def motion_stem(token: str, entry: str) -> bool:
    prefix, stem = entry.endswith("*"), entry.rstrip("*")
    bare = re.sub(r"^(?:وال|بال|كال|فال|لل|ال|بي|و|ف|ب|ل|ك|ه|ح)", "", token, count=1)
    return any(t.startswith(stem) if prefix else t == stem for t in (token, bare))


def motion_change(text: str) -> bool:
    norm = motion_normalize(text)
    tokens = re.findall(r"[a-z0-9ء-ي]+", norm)
    return ("→" in norm or any(motion_stem(t, e) for t in tokens for e in MOTION_LEXICON["change"]) or
            any(a in tokens and b in tokens and tokens.index(b) > tokens.index(a) for a, b in (("قبل", "بعد"), ("before", "after"))))


def motion_question(text: str) -> bool:
    return bool(re.search(r"[؟?]", text or "") and re.search(
        r"(?:^|[^a-zء-ي])(?:عندك|معاك|معك|انت|انتم|انتي|انتا|لديك|لديكم|بتستخدم|تستخدم|تستعمل|تبي|تبغي|بدك|بدكم|you|your)(?=$|[^a-zء-ي])", motion_normalize(text)))


def motion_topics(text: str) -> dict:
    norm = motion_normalize(text)
    tokens = re.findall(r"[a-z0-9ء-ي]+", norm)
    padded = " " + " ".join(tokens) + " "
    return {tag: sum(2 * (" " + e + " " in padded) if " " in e else int(any(motion_stem(t, e) for t in tokens)) for e in entries)
            for tag, entries in MOTION_LEXICON.items()}


def pick_motion(spec: dict, preset: dict, post_dir: Path | None = None, notes: list | None = None) -> dict:
    """First matching Studio rule, restricted to the preset. Optionally avoid the last earlier sibling post's recipe."""
    arch, hook = spec.get("architecture"), spec.get("hook") or {}
    cover = next((s for s in spec["slides"] if s.get("type") in ("cover", "poster")), spec["slides"][0])
    cover_text = re.sub(r"==", "", (cover.get("headline") or hook.get("cover") or "") + " " + (cover.get("sub") or ""))
    text = " ".join(str(s) for s in [hook.get("cover"), hook.get("text"), (spec.get("brief") or {}).get("topic"),
                                    (spec.get("angle") or {}).get("title"), cover.get("kicker"), cover.get("headline"), cover.get("sub"),
                                    (spec.get("captionPack") or {}).get("firstLine")] if s)
    scores = motion_topics(text)
    western = cover_text.translate(str.maketrans("٠١٢٣٤٥٦٧٨٩", "0123456789"))
    numeral = bool(re.search(r"[0-9]", re.sub(r"\b(19|20)[0-9]{2}\b", "", western, flags=re.ASCII))) or any(
        s.get("type") == "stat" or (s.get("number") or {}).get("value") for s in spec["slides"])
    short_em = any(1 <= len(m.split()) <= 2 for m in re.findall(r"==([^=]+)==", cover.get("headline") or hook.get("cover") or ""))
    rules = [(scores["urgency"] >= 2, "drop-clock"), (scores["spread"] >= 2, "map-dots"),
             (arch == "myth-fact" or hook.get("family") == "P4" or scores["decision"] >= 2, "stamp"),
             (scores["mistakes"] > 0, "story"), (motion_change(cover_text), "split"), (numeral, "counter"),
             (arch in ("steps", "framework") or scores["steps"] > 0, "reorder"),
             (((arch == "news" or scores["news"] > 0) and motion_topics(cover_text)["product"] > 0) or motion_question(cover_text), "notify"),
             (scores["launch"] > 0, "curtain"), (arch in ("news", "story", "case-study") or scores["news"] > 0 or scores["story"] > 0, "story"),
             (short_em, "zoom"), (True, "highlight-sweep")]
    matches = [recipe for match, recipe in rules if match]
    recipe = matches[0]
    motion = (preset or {}).get("motion") or {}
    allowed = motion.get("allowed") or []
    if allowed and recipe not in allowed:
        recipe = "reorder" if (recipe == "story" and "reorder" in allowed) else (motion.get("default") or "highlight-sweep")
        if recipe not in allowed:
            recipe = allowed[0]
    previous = None
    if post_dir is not None and Path(post_dir).name.startswith("post-"):
        current = Path(post_dir)
        try:
            siblings = sorted((p for p in current.parent.glob("post-*") if p.is_dir() and p.name < current.name), key=lambda p: p.name, reverse=True)
        except OSError:
            siblings = []
        for p in siblings:
            try:
                earlier = json.loads((p / "spec.json").read_text(encoding="utf-8"))
                previous = earlier["cover"]["motion"]["recipe"]
                if isinstance(previous, str):
                    break
            except (OSError, ValueError, KeyError, TypeError):
                continue
    if previous == recipe:
        start = matches.index(recipe) + 1 if recipe in matches else 0
        alternate = next((r for r in matches[start:] if r != recipe and (not allowed or r in allowed)), None)
        alternate = alternate or next((r for r in allowed if r != recipe), None)
        if alternate:
            recipe = alternate
            if notes is not None:
                notes.append("motion: %s (the last post used %s)" % (recipe, previous))
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
    for section in sections:
        notes.extend("source mention (not verified): %s; supply a reference with spec_edit.py source add" % s for s in section.get("mentions", []))
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
    spec["cover"] = {"motion": pick_motion(spec, load_preset(preset_id), Path(args.out), notes)}
    for slide in slides:
        for ref in slide.pop("_sources", []):
            sid = add_source(spec, {"kind": "url", "ref": ref["ref"], "location": ref["label"]})
            slide.setdefault("sourceIds", [])
            if sid not in slide["sourceIds"]:
                slide["sourceIds"].append(sid)
    return spec, notes


def add_source(spec: dict, source: dict) -> str:
    source = copy.deepcopy(source)
    if source["kind"] == "url":
        source["ref"] = normalize_url(source["ref"])
    sources = spec.setdefault("sources", [])
    found = next((s for s in sources if s.get("kind") == source["kind"] and s.get("ref") == source.get("ref")), None)
    if found is not None:
        # A later bare URL does not erase the first, more useful Markdown label.
        for key, value in source.items():
            if key not in ("id", "location") or not found.get(key):
                found[key] = value
        return found["id"]
    source.setdefault("id", "src-" + hashlib.sha256((source["kind"] + ":" + source.get("ref", "")).encode("utf-8")).hexdigest()[:12])
    if any(s["id"] == source["id"] for s in sources):
        raise CSError("E_CONFLICT", "source id %s is already used by a different reference" % source["id"])
    sources.append(source)
    return source["id"]


# --------------------------------------------------------- durable edits and shared writer

def output(value: str, stream=None) -> None:
    """A wrapped legacy console may lack reconfigure(); never let its code page abort a completed write."""
    stream = sys.stdout if stream is None else stream
    try:
        stream.write(value)
    except UnicodeEncodeError:
        stream.write(value.encode(getattr(stream, "encoding", None) or "ascii", errors="backslashreplace").decode(
            getattr(stream, "encoding", None) or "ascii"))


def output_json(value) -> None:
    body = json.dumps(value, ensure_ascii=False)
    try:
        body.encode(getattr(sys.stdout, "encoding", None) or "utf-8")
    except (UnicodeEncodeError, LookupError):
        body = json.dumps(value, ensure_ascii=True)
    output(body + "\n")


def read_json(path: Path):
    try:
        return paths.read_json(path, strict_keys=True)
    except FileNotFoundError as exc:
        raise CSError("E_MISSING", "input file missing: %s" % path) from exc
    except (ValueError, UnicodeError) as exc:
        raise CSError("E_INPUT", "cannot read JSON %s: %s" % (path, exc)) from exc


@contextmanager
def post_lock(spec_path: Path):
    """Both writers use the same exclusive lock; a busy or abandoned lock is a conflict, never silently stolen."""
    spec_path = spec_path.resolve()
    spec_path.parent.mkdir(parents=True, exist_ok=True)
    lock = spec_path.with_name(spec_path.name + ".lock")
    try:
        fd = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    except FileExistsError as exc:
        raise CSError("E_CONFLICT", "another writer holds %s; retry after it finishes (inspect an abandoned lock before removing it)" % lock) from exc
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as handle:
            handle.write(str(os.getpid()) + "\n")
        yield
    finally:
        lock.unlink()


def record_path(spec_path: Path) -> Path:
    return spec_path.with_name(spec_path.stem + ".edits.json")


def new_record(spec: dict) -> dict:
    return {"schemaVersion": 1, "specId": spec["id"], "slideIds": [s["id"] for s in spec["slides"]], "fill": {}, "edits": []}


def read_record(spec_path: Path, spec: dict) -> dict:
    p = record_path(spec_path)
    if not p.exists():
        return new_record(spec)
    record = read_json(p)
    if not isinstance(record, dict) or record.get("schemaVersion") != 1 or not isinstance(record.get("edits"), list) or not isinstance(record.get("fill"), dict):
        raise CSError("E_INPUT", "invalid edit record: %s" % p)
    if any(not isinstance(e, dict) or e.get("kind") not in ("fields", "cover", "caption", "source", "attest", "keep-cta", "keep") for e in record["edits"]):
        raise CSError("E_INPUT", "invalid saved edit in %s" % p)
    if record.get("specId") == spec["id"] and not record["edits"] and not record["fill"]:
        record["slideIds"] = [s["id"] for s in spec["slides"]]
    if record.get("specId") != spec["id"] or record.get("slideIds") != [s["id"] for s in spec["slides"]]:
        raise CSError("E_CONFLICT", "the saved edits belong to a different post or slide structure; review them before rebuilding")
    return record


def merge_fields(target: dict, fields: dict) -> None:
    for key, value in fields.items():
        if value is None:
            target.pop(key, None)
        elif isinstance(value, dict) and isinstance(target.get(key), dict):
            merge_fields(target[key], value)
        elif key in ("sources", "assets") and isinstance(value, list) and isinstance(target.get(key), list):
            for entry in value:
                existing = next((s for s in target[key] if isinstance(s, dict) and s.get("id") == entry.get("id")), None) if isinstance(entry, dict) else None
                if existing is None:
                    target[key].append(copy.deepcopy(entry))
                else:
                    existing.update(copy.deepcopy(entry))
        else:
            target[key] = copy.deepcopy(value)


def find_slide(spec: dict, selector: str) -> dict:
    if selector.isascii() and selector.isdigit():
        position = int(selector)
        slide = spec["slides"][position - 1] if 1 <= position <= len(spec["slides"]) else None
    else:
        slide = next((s for s in spec["slides"] if s["id"] == selector), None)
    if slide is None:
        raise CSError("E_USAGE", "unknown slide %s; valid ids: %s" % (selector, ", ".join(s["id"] for s in spec["slides"])))
    return slide


def pack_entry(spec: dict, field: str, sid: str, value: str) -> None:
    slide = find_slide(spec, sid)
    pack = spec.setdefault("captionPack", {})
    entries = pack.setdefault(field, [])
    while len(entries) < len(spec["slides"]):
        entries.append("")
    entries[spec["slides"].index(slide)] = value


def cover_edit(spec: dict, fields: dict, original: dict | None = None) -> None:
    cover = next((s for s in spec["slides"] if s["type"] in ("cover", "poster")), None)
    if cover is None:
        raise CSError("E_USAGE", "the post has no cover")
    replacements = []
    for key, value in fields.items():
        old = cover.get(key)
        if old:
            replacements.append((cstext.strip_markup(old), cstext.strip_markup(value or "")))
        cover[key] = value
        if (original or {}).get(key):
            replacements.append((cstext.strip_markup(original[key]), cstext.strip_markup(value or "")))
    def replace(text):
        mapping = {" ".join(old.split()): new for old, new in replacements if old.strip()}
        if not mapping:
            return text
        patterns = [r"[ \t\n\r\u00A0\u202F]+".join(re.escape(w) for w in old.split())
                    for old in sorted(mapping, key=len, reverse=True)]
        return re.sub("|".join(patterns), lambda m: mapping[" ".join(m.group(0).split())], text)
    pack = spec.get("captionPack") or {}
    for field in ("firstLine", "keywordLine", "body", "cta"):
        if isinstance(pack.get(field), str):
            pack[field] = replace(pack[field])
    for field in ("alt", "perSlide"):
        if isinstance(pack.get(field), list):
            pack[field] = [replace(s) for s in pack[field]]
    hook = spec.setdefault("hook", {})
    hook["cover"] = cover.get("headline", "")
    hook["text"] = one_line(cover.get("headline", ""))


def numeric_signature(slide: dict) -> list[str]:
    return sorted(csqa.numbers_in(" ".join(csqa.slide_strings(slide, True, True))))


def attestation_edit(spec: dict) -> dict:
    # Run SRC1 with no sources to discover claims using the same exclusions as QA (dates, ordinals, counts).
    bare = copy.deepcopy(spec)
    bare["sources"] = []
    claims = {r.get("slide") for r in csqa.run_text_gates(bare, gates=["SRC1"]) if r["rule"] == "SRC1.missing" and r.get("slide")}
    by_id = {s["id"]: s for s in spec.get("sources", [])}
    targets = {}
    for slide in spec["slides"]:
        ids = slide.get("sourceIds", []) + ([slide["number"]["sourceId"]] if (slide.get("number") or {}).get("sourceId") else [])
        if slide["id"] in claims and not any(sid in by_id for sid in ids):
            targets[slide["id"]] = numeric_signature(slide)
    return {"kind": "attest", "slides": targets, "at": now()}


def apply_edit(spec: dict, edit: dict) -> list[str]:
    kind, notes = edit.get("kind"), []
    if kind == "fields":
        merge_fields(spec, edit.get("post", {}))
        for sid, fields in edit.get("slides", {}).items():
            merge_fields(find_slide(spec, sid), fields)
    elif kind == "cover":
        cover_edit(spec, edit["fields"], edit.get("original"))
    elif kind == "caption":
        if edit.get("slide"):
            pack_entry(spec, edit["field"], edit["slide"], edit["value"])
        else:
            spec.setdefault("captionPack", {})[edit["field"]] = copy.deepcopy(edit["value"])
    elif kind == "source":
        sid = add_source(spec, edit["source"])
        for selector in edit["slides"]:
            slide = find_slide(spec, selector)
            if sid not in slide.setdefault("sourceIds", []):
                slide["sourceIds"].append(sid)
    elif kind == "attest":
        valid = []
        for sid, signature in edit["slides"].items():
            slide = find_slide(spec, sid)
            if numeric_signature(slide) == signature:
                valid.append(slide)
            else:
                notes.append("%s: figures changed; ask for a new attestation" % sid)
        other = {s["id"] for s in spec.get("sources", []) if s["kind"] != "user"}
        valid = [s for s in valid if not any(i in other for i in s.get("sourceIds", []) +
                 ([(s.get("number") or {})["sourceId"]] if (s.get("number") or {}).get("sourceId") else []))]
        if valid:
            values = sorted({n for slide in valid for n in numeric_signature(slide)})
            sid = add_source(spec, {"kind": "user", "ref": "creator-attested:" + edit["at"], "verified": True,
                                    "excerpt": "Creator-attested figures: " + ", ".join(values)})
            for slide in valid:
                if sid not in slide.setdefault("sourceIds", []):
                    slide["sourceIds"].append(sid)
    elif kind == "keep-cta":
        spec.setdefault("ext", {}).setdefault("readyScript", {})["keepWithoutCta"] = {"reason": edit["reason"], "at": edit["at"]}
        notes.append("the creator kept the ending; C4.count and C5.skeleton are still open when the shared rules do not allow an override")
    elif kind == "keep":
        pass  # applied to fresh QA findings after every content edit
    else:
        raise CSError("E_INPUT", "unknown saved edit kind: %s" % kind)
    return notes


def replay_edits(spec: dict, record: dict) -> list[str]:
    notes = []
    refs = {"creator-attested:" + e["at"] for e in record["edits"] if e.get("kind") == "attest"}
    expired = {s["id"] for s in spec.get("sources", []) if s.get("kind") == "user" and s.get("ref") in refs}
    if expired:
        spec["sources"] = [s for s in spec["sources"] if s["id"] not in expired]
        for slide in spec["slides"]:
            if "sourceIds" in slide:
                slide["sourceIds"] = [sid for sid in slide["sourceIds"] if sid not in expired]
    try:
        for edit in record["edits"]:
            if edit.get("kind") != "attest":
                notes.extend(apply_edit(spec, edit))
        for edit in record["edits"]:
            if edit.get("kind") == "attest":
                notes.extend(apply_edit(spec, edit))
    except (KeyError, TypeError, AttributeError, ValueError) as exc:
        raise CSError("E_INPUT", "invalid saved edit: %s" % exc) from exc
    return notes


def legacy_edit(spec: dict) -> dict:
    """Migrate existing hand repairs once, without freezing all the body copy from the original script."""
    post = {k: copy.deepcopy(spec[k]) for k in ("assets", "sources", "captionPack", "style", "cover", "hook", "compat", "ext") if k in spec}
    urls = {k: spec["meta"][k] for k in ("studioUrl", "brandHomeUrl") if (spec.get("meta") or {}).get(k)}
    if urls:
        post["meta"] = urls
    slides = {s["id"]: {k: copy.deepcopy(v) for k, v in s.items() if k in ("media", "sourceIds", "overrides", "free", "visual") or
                       (s["type"] in ("cover", "poster") and k in ("headline", "sub", "kicker"))} for s in spec["slides"]}
    return {"kind": "fields", "post": post, "slides": {sid: fields for sid, fields in slides.items() if fields}}


def migrate_record(spec: dict, record: dict) -> None:
    record["edits"].append(legacy_edit(spec))
    for finding in (spec.get("qa") or {}).get("results", []):
        if finding.get("overridden") and csreport.is_overridable(finding.get("rule", "")):
            mark = finding["overridden"]
            record["edits"].append({"kind": "keep", "rule": finding["rule"], "slide": finding.get("slide", ""),
                                    "reason": mark["reason"], "at": mark["at"]})


def bump(spec: dict, previous: dict | None = None) -> None:
    spec["rev"] = int((previous if previous is not None else spec).get("rev") or 0) + 1
    spec.setdefault("meta", {}).update({"updatedAt": now(), "updatedBy": "tool"})
    spec.pop("frozen", None)
    spec.setdefault("style", {}).pop("resolvedHash", None)
    spec.setdefault("approvals", {}).pop("design", None)
    if spec["approvals"].get("script"):
        spec["approvals"]["script"]["rev"] = spec["rev"]
    spec["checkpoint"] = "design"


def reconcile_sources(spec: dict) -> None:
    """Legacy posts can use a different id for the same URL. Keep one reference and update all its links."""
    sources, by_ref, aliases, seen = [], {}, {}, set()
    for source in spec.get("sources", []):
        if source["id"] in seen:
            raise CSError("E_SCHEMA", "duplicate source id: %s" % source["id"])
        seen.add(source["id"])
        if source["kind"] != "url":
            sources.append(source)
            continue
        if not isinstance(source.get("ref"), str) or not source["ref"]:
            raise CSError("E_SCHEMA", "URL source %s needs a reference" % source["id"])
        source["ref"] = normalize_url(source["ref"])
        if source["ref"] in by_ref:
            original = by_ref[source["ref"]]
            aliases[source["id"]] = original["id"]
            original.update({k: v for k, v in source.items() if k != "id"})
        else:
            by_ref[source["ref"]] = source
            sources.append(source)
    if "sources" in spec:
        spec["sources"] = sources
    for slide in spec["slides"]:
        if "sourceIds" in slide:
            slide["sourceIds"] = list(dict.fromkeys(aliases.get(sid, sid) for sid in slide["sourceIds"]))
        num = slide.get("number") or {}
        if num.get("sourceId") in aliases:
            num["sourceId"] = aliases[num["sourceId"]]


def saved_keep_marks(spec: dict, rep: dict, record: dict) -> None:
    for edit in record["edits"]:
        if edit.get("kind") == "keep":
            for finding in rep["qa"]["results"]:
                if finding.get("overridden") and finding.get("rule") == edit["rule"] and (not edit.get("slide") or finding.get("slide") == edit["slide"]):
                    finding["overridden"] = {"reason": edit.get("reason", KEEP_REASON), "at": edit.get("at", now())}
    store_qa(spec, rep)


def check_spec(spec: dict, brand: dict | None = None, keep=()) -> dict:
    errors = schema.validate_named("spec", spec)
    if errors:
        raise CSError("E_SCHEMA", "; ".join("%s %s" % (e["path"], e["message"]) for e in errors[:8]))
    reconcile_sources(spec)
    module = importlib.util.spec_from_file_location("_ready_script_validate", HERE / "validate.py")
    validator = importlib.util.module_from_spec(module)
    module.loader.exec_module(validator)
    results = csqa.run_text_gates(spec, brand)
    rep = {"errors": [], "structure": validator.structure_checks(spec, "design", brand),
           "qa": {**csreport.summarize(results), "engine": csreport.ENGINE, "results": results}}
    free_errors, _ = validator.free_checks(spec)
    rep["structure"].extend(free_errors)
    if keep:
        rep["notes"] = apply_keep(spec, rep, list(keep))
        results = csqa.run_text_gates(spec, brand)
        rep["qa"] = {**csreport.summarize(results), "engine": csreport.ENGINE, "results": results}
    store_qa(spec, rep)
    errors = schema.validate_named("spec", spec)
    if errors:
        raise CSError("E_SCHEMA", "; ".join("%s %s" % (e["path"], e["message"]) for e in errors[:8]))
    return rep


def save_post(spec_path: Path, spec: dict, record: dict, before: bytes | None) -> None:
    errors = schema.validate_named("spec", spec)
    if errors:
        raise CSError("E_SCHEMA", "; ".join("%s %s" % (e["path"], e["message"]) for e in errors[:8]))
    current = spec_path.read_bytes() if spec_path.exists() else None
    if current != before:
        raise CSError("E_CONFLICT", "spec changed during this command; re-read it before retrying")
    # The record is the write-ahead intent. If interrupted between atomic replacements, replay recovers the edit.
    paths.write_json(record_path(spec_path), record)
    paths.write_json(spec_path, spec)


def error_status(exc: CSError) -> int:
    output("cs-error: %s: %s\n" % (exc.code, exc), sys.stderr)
    return {"E_USAGE": 64, "E_MISSING": 66, "E_INPUT": 65, "E_SCHEMA": 2, "E_CONFLICT": 75}.get(exc.code, 70)


# ---------------------------------------------------------------- fill

def wrap_once(s: str, word: str):
    if not s or not word or "==" in s or word not in s:
        return None
    return s.replace(word, "==%s==" % word, 1)


def apply_fill(spec: dict, fill: dict) -> list:
    if not isinstance(fill, dict):
        raise CSError("E_INPUT", "the fill must be a JSON object")
    for key, allowed in (("bridges", (dict, list)), ("emphasis", (dict,)), ("edits", (dict,)), ("caption", (dict,)),
                         ("motion", (dict,)), ("perSlide", (list,)), ("alt", (list,)), ("keep", (list,)), ("teamLog", (list,))):
        if fill.get(key) is not None and not isinstance(fill[key], allowed):
            raise CSError("E_INPUT", "invalid fill.%s value" % key)
    if any(value is not None and not isinstance(value, str) for value in (fill.get("emphasis") or {}).values()):
        raise CSError("E_INPUT", "fill.emphasis values must be text")
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
    p.add_argument("--attest-numbers", action="store_true", help="only after the creator confirms: attest their currently unsourced figures")
    p.add_argument("--expect-rev", type=int, help="refuse a stale writer (exit 75)")
    p.add_argument("--format", choices=("text", "json"), default="text")
    a = p.parse_args(argv)
    if not ((a.script and a.out and not a.spec) or (a.spec and a.fill and not a.script)):
        p.error("use --script FILE --out DIR (step 1) or --spec FILE --fill FILE (step 2)")
    spec_path = (Path(a.out) / "spec.json" if a.script else Path(a.spec)).resolve()
    try:
        brand = read_json(Path(a.brand)) if a.brand else {}
        if not isinstance(brand, dict):
            raise CSError("E_INPUT", "the brand must be a JSON object")
        with post_lock(spec_path):
            before = spec_path.read_bytes() if spec_path.exists() else None
            previous = read_json(spec_path) if before is not None else None
            if previous is not None:
                errors = schema.validate_named("spec", previous)
                if errors:
                    raise CSError("E_SCHEMA", "; ".join("%s %s" % (e["path"], e["message"]) for e in errors[:8]))
            if a.expect_rev is not None and (previous or {}).get("rev") != a.expect_rev:
                raise CSError("E_CONFLICT", "expected rev %s, found %s" % (a.expect_rev, (previous or {}).get("rev")))
            notes = []
            if a.script:
                try:
                    raw = Path(a.script).read_text(encoding="utf-8")
                except FileNotFoundError as exc:
                    raise CSError("E_MISSING", "input file missing: %s" % a.script) from exc
                except UnicodeError as exc:
                    raise CSError("E_INPUT", "the script must be UTF-8") from exc
                spec, notes = make_spec(a, raw, brand)
            else:
                if previous is None:
                    raise CSError("E_MISSING", "input file missing: %s" % spec_path)
                spec = copy.deepcopy(previous)
            record = read_record(spec_path, spec)
            if previous and not record_path(spec_path).exists():
                migrate_record(previous, record)
                notes.append("existing sources, caption pack, cover and picture assets saved in spec.edits.json")
            if a.fill:
                fill = read_json(Path(a.fill))
                if not isinstance(fill, dict):
                    raise CSError("E_INPUT", "the fill file must be a JSON object: " + FILL_SHAPE)
                merge_fields(record["fill"], fill)
            elif previous and not record_path(spec_path).exists() and (spec_path.parent / "fill.json").exists():
                record["fill"] = read_json(spec_path.parent / "fill.json")
            if record["fill"]:
                notes.extend(apply_fill(spec, record["fill"]))
            notes.extend(replay_edits(spec, record))
            if a.attest_numbers:
                edit = attestation_edit(spec)
                if edit["slides"]:
                    record["edits"].append(edit)
                    notes.extend(apply_edit(spec, edit))
            bind_all(spec)
            if previous:
                bump(spec, previous)
            keep = keep_list(record["fill"]) + [(e["rule"], e.get("slide", "")) for e in record["edits"] if e.get("kind") == "keep"]
            try:
                rep = check_spec(spec, brand, keep)
            except CSError as exc:
                if exc.code == "E_SCHEMA" and len(spec["slides"]) > max_slides():
                    advice = [n for n in notes if n.startswith("merge candidate:")][:3]
                    raise CSError("E_SCHEMA", str(exc) + "; " + "; ".join(advice)) from exc
                raise
            saved_keep_marks(spec, rep, record)
            save_post(spec_path, spec, record, before)
    except CSError as exc:
        return error_status(exc)
    except OSError as exc:
        output("cs-error: E_WRITE: %s\n" % exc, sys.stderr)
        return 73
    need, lines = todo(spec), []
    lines.append("%s: rev %d · %s" % (spec_path.as_posix(), spec["rev"], summary(spec)))
    lines += ["note: " + n for n in notes]
    lines += ["note: " + n for n in rep.get("notes", [])]
    status = rep["qa"]["exitCode"]
    if need:
        lines.append("to fill (write fill.json, then run step 2 with --spec and --fill):")
        lines += ["  - " + n for n in need]
        lines.append("  shape: " + FILL_SHAPE)
        status = max(status, 1)
    if rep["structure"]:
        status = 2
    lines += report(status, rep, "en")
    if a.format == "json":
        output_json({"spec": spec_path.as_posix(), "rev": spec["rev"], "summary": summary(spec), "notes": notes, "toFill": need,
                     "qa": rep["qa"], "exit": status})
    else:
        output("\n".join(lines) + "\n")
    return status


if __name__ == "__main__":
    sys.exit(main())
