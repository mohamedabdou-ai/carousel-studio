#!/usr/bin/env python3
"""board_check.py: is the production board of a post well-formed, and did the team do what the charter says?

The creative team keeps one record per post, board.md (team charter, section 5). This script reads it and checks, in the
stage you name, the things that can be checked without judgement:

    brief    the creative brief: its labelled lines, one idea, two pitch directions from different families and moves
    pitch    + the pitch table (panel stops n/3, a decision with a reason), the three persona cards, the decision log, a handoff
             card and the first two team-log lines
    room     + the hook duel (12 or more hooks, 4 to 6 families, one champion per family, a knockout with a reason per
             duel, a podium of three families), the editor's verdict (VETO blocks), the swipe-test table (the pull lists,
             the readers per slide, the weakest transition recomputed, a fix when someone stopped), the director's eight-lens review whose
             verdict must follow the scores, the loop counters, the creator's choice
    huddle   + the design huddle: both roles name the same focal element, a shipped recipe, six storyboard lines
    final    + the final review (130 px, QA, art director) and all six team-log lines (the log grows with the stages, one line
             per key, at most six)
    fast     spec-only: director, editor and design log; QA and director verdict named, no invented panel stages
    ready    spec-only: director and design log, plus editor when one ran; the same QA and review requirement

What the first independent review found missing is checked here too: the brief names the platform facts it rests on (an open fact, one that
is not verified or has outlived its window in data/platform-instagram.json, caps the Proof lens at 3); at least two of three personas are
slices of the brand's own audience; a duel whose score leader and panel favourite differ carries a hybrid cover; the huddle starts from a
ranked style shortlist with its pre-flight results and its frame 0 shows the focal element; and the final review re-checks every promise
the decisions made (a promise that did not hold cannot be shipped) and cannot score Craft 4 over an open art-director or QA FIX.

Sections carry an anchor, "## Title {#id}", and the labels inside are the ones the role files print. Digits may be
Western or Arabic-Indic. With --spec the spec's ext.teamLog (what the Studio shows) is checked too: at most six lines,
one per key, at most 160 characters each, and at stage final all six present.

Usage
    board_check.py [BOARD.md] [--stage brief|pitch|room|huddle|final|fast|ready] [--spec SPEC.json] [--today YYYY-MM-DD] [--format text|json]

JSON: {"ok", "stage", "counts": {"error", "fix"}, "findings": [{"code", "severity", "where", "message"}]}
Exit codes: 0 clear, 1 FIX findings only, 2 at least one error, 64 usage, 65 unreadable file or JSON, 66 file missing,
70 the shared _cs package is unavailable.
"""
import argparse
import json
import re
import sys
from datetime import date
from fractions import Fraction
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
try:
    from _cs import paths, qa as cs_qa, text as cs_text
except ImportError as exc:      # the shared package is synced next to the scripts; say so plainly
    sys.stderr.write("cs-error: E_DEP_LOAD: the shared _cs package is missing next to this script: %s\n" % exc)
    sys.exit(70)

paths.ensure_utf8_stdio()

GUIDED_STAGES = ("brief", "pitch", "room", "huddle", "final")
STAGES = GUIDED_STAGES + ("fast", "ready")
MARKER = "<!-- cs-board v1 -->"
SECTIONS = ("brief", "pitch", "personas", "duel", "editor", "swipe", "review", "huddle", "decisions", "cards", "open", "log")
REQUIRED = {
    "brief": ("brief",),
    "pitch": ("pitch", "personas", "decisions", "cards", "log"),
    "room": ("duel", "editor", "swipe", "review"),
    "huddle": ("huddle",),
    "final": (),
}
LOOP_LIMITS = {"pitch": 1, "duel": 1, "editor": 2, "swipe": 1, "script": 2, "huddle": 1, "review": 2}
LOG_KEYS = ("director", "pitch", "duel", "swipe", "editor", "design")
LOG_KEYS_AT = {"pitch": ("director", "pitch"), "room": ("director", "pitch", "duel", "swipe", "editor"), "huddle": ("director", "pitch", "duel", "swipe", "editor"), "final": LOG_KEYS}
LOG_KEYS_AT.update(fast=("director", "editor", "design"), ready=("director", "design"))
LOG_MAX_CHARS = 160
MOVES = ("big-number", "enemy", "reveal", "mirror", "before-after", "cheat-sheet", "insider-leak", "confession", "free-vs-paid", "countdown")
FAMILIES = {"P%d" % i for i in range(1, 17)} | {"F%d" % i for i in range(17, 24)} | {"S1", "S2", "S3"}
RECIPES = ("counter", "highlight-sweep", "stamp", "reorder", "story", "map-dots", "drop-clock", "curtain", "zoom", "notify", "split", "calm")
AGENTS = ("cs-creative-director", "cs-strategist", "cs-copywriter", "cs-arabic-editor", "cs-art-director", "cs-motion-designer",
          "cs-visual-artist", "cs-audience-panel", "cs-qa-producer")
CARD_TARGETS = AGENTS + ("creator",)
BRIEF_LABELS = ("الفكرة الكبيرة", "العدو", "الجمهور ولحظته", "الهدف", "الوعي", "بيتش آمن", "بيتش جريء", "عائلات الهوك",
                "النبرة واللهجة", "الاتجاه البصري", "معايير النجاح", "القيود")
GOALS = ("وصول", "حفظ", "إرسال", "بيع")
AWARENESS = ("مش واخد باله", "عارف المشكلة", "بيدوّر على حل", "بيقارن")
LENSES = ("الفكرة", "الهوك", "التدفق", "القيمة", "الصوت", "الصنعة", "الدليل", "الدعوة")
PERSONA_TAGS = ("[الأساسي]", "[المتشكك]", "[الامتداد]")
STORYBOARD_TIMES = (0.0, 0.4, 1.5, 3.0, 4.5, 5.9)
CARD_LABELS = ("سلّمت", "قرارات خدتها وليه", "محتاج منك", "مخاطر / أسئلة مفتوحة", "ثقتي")
CONFIDENCE = ("عالية", "متوسطة", "ضعيفة")
DIGITS = str.maketrans("٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹", "01234567890123456789")
HERO_MAX_WORDS = 6
PRESETS = ("creator", "notebook", "poster")
FACT_OK = ("verified", "owner-tested")           # the statuses of data/platform-instagram.json facts that count as checked
V1_WORDS = ("ok", "fail", "لم يُفحص")


class Report:
    def __init__(self):
        self.items = []

    def add(self, code, severity, where, message):
        self.items.append({"code": code, "severity": severity, "where": where, "message": message})

    def error(self, code, where, message):
        self.add(code, "error", where, message)

    def fix(self, code, where, message):
        self.add(code, "fix", where, message)

    def count(self, severity):
        return sum(1 for i in self.items if i["severity"] == severity)


# ----------------------------------------------------------------------------- parsing
def norm(text):
    return text.replace("\r\n", "\n").replace("\r", "\n").lstrip("﻿").translate(DIGITS)


def split_sections(text):
    """Returns (header text, {id: body}, [ids in order]); the heading form is `## Title {#id}`."""
    heads = list(re.finditer(r"^##[ \t]+(.+?)[ \t]*\{#([a-z]+)\}[ \t]*$", text, re.M))
    header = text[:heads[0].start()] if heads else text
    bodies, order = {}, []
    for i, m in enumerate(heads):
        end = heads[i + 1].start() if i + 1 < len(heads) else len(text)
        sid = m.group(2)
        order.append(sid)
        bodies.setdefault(sid, "")
        bodies[sid] += text[m.end():end].strip("\n") + "\n"
    return header, bodies, order


def tables(body):
    """Every markdown table in the body as (header cells, [row cells]); the separator row is dropped."""
    out, block = [], []
    for line in body.split(chr(10)) + [""]:
        if line.strip().startswith("|"):
            cells = [c.strip() for c in line.strip().strip("|").split("|")]
            if not all(re.fullmatch(r":?-{2,}:?", c) for c in cells):
                block.append(cells)
        elif block:
            out.append((block[0], block[1:]))
            block = []
    return out


def find_table(body, header_word):
    for head, rows in tables(body):
        if any(header_word in c for c in head):
            return head, rows
    return None, []


def labelled(body):
    """`label: value` lines as {label: value}; a label ends at the first colon, a parenthesis note is dropped."""
    out = {}
    for line in body.split("\n"):
        m = re.match(r"^\s*(?:[-*]\s+)?([^:|<>{}\[\]\n]{1,40}?)\s*:\s*(.*)$", line)
        if m:
            label = re.sub(r"\s*\(.*?\)\s*$", "", m.group(1).replace("*", "").replace("`", "")).strip()
            out.setdefault(label, m.group(2).strip().strip("*").strip())
    return out


def words(text):
    return [w for w in re.split(r"\s+", re.sub(r"[«»\"'.,؟?!،؛:;…\-–—()]", " ", text)) if w]


def ratio(text):
    m = re.search(r"(\d+)\s*(?:/|من)\s*(\d+)", text)
    return (int(m.group(1)), int(m.group(2))) if m else None


def family_codes(text):
    return re.findall(r"\b([PFS]\d{1,2})\b", text)


def hero_of(cover):
    """Count the same first beat as C1 and the hook gates."""
    hero, _ = cs_qa.split_cover(cover)
    return cs_text.word_count(hero)


# ----------------------------------------------------------------------------- checks
def check_meta(header, bodies, stage, rep):
    if MARKER not in header:
        rep.error("T01", "board", "the marker line %s is missing (is this a board.md?)" % MARKER)
    pairs = {}
    for line in header.split(chr(10)):
        if re.match(r"^\s*(mode|loops)\s*:", line):
            for part in line.split("·"):
                if ":" in part:
                    k, v = part.split(":", 1)
                    pairs[k.strip()] = v.strip()
    first = pairs.get("mode", "")
    if first not in ("guided", "fast"):
        rep.error("T02", "board", "mode must be guided or fast (found %r)" % first)
    if pairs.get("dialect") not in ("eg", "gulf", "levant", "msa-white", "en"):
        rep.error("T02", "board", "dialect must be eg, gulf, levant, msa-white or en (found %r)" % pairs.get("dialect"))
    if pairs.get("digits") not in ("western", "arabic-indic"):
        rep.error("T02", "board", "digits must be western or arabic-indic (found %r)" % pairs.get("digits"))
    slides = pairs.get("slides")
    if STAGES.index(stage) >= STAGES.index("room"):
        if not slides or not slides.isdigit() or not 2 <= int(slides) <= 10:
            rep.error("T03", "board", "`slides: N` (2 to 10) is required from the writers' room on")
    loops = re.search(r"^loops\s*:\s*(.+)$", header, re.M)
    if not loops:
        rep.error("T04", "board", "the `loops:` line is missing")
        return pairs
    seen = {}
    for name, n, limit in re.findall(r"([a-z]+)\s+(\d+)\s*/\s*(\d+)", loops.group(1)):
        seen[name] = (int(n), int(limit))
    for name, limit in LOOP_LIMITS.items():
        if name not in seen:
            rep.error("T04", "loops", "counter %r is missing" % name)
            continue
        n, written = seen[name]
        if written != limit:
            rep.error("T04", "loops", "%s must be written n/%d, found n/%d" % (name, limit, written))
        if n > limit:
            rep.error("T05", "loops", "%s is at %d, above its limit of %d: at the limit the director decides" % (name, n, limit))
    return pairs


def load_facts():
    """{id: fact} from the register in data/platform-instagram.json (empty when the skill carries no copy)."""
    try:
        doc = paths.read_json(paths.data_path("platform-instagram.json"))
    except (OSError, ValueError):
        return {}
    items = ((doc.get("facts") or {}).get("items")) if isinstance(doc, dict) else None
    return {f["id"]: f for f in (items or []) if isinstance(f, dict) and f.get("id")}


def is_open(fact, today):
    """A fact is open when it is not verified or tested, or was last verified longer ago than its own window."""
    if fact.get("status") == "derived":
        return False
    if fact.get("status") not in FACT_OK:
        return True
    try:
        age = (today - date.fromisoformat(str(fact.get("verifiedAt")))).days
    except ValueError:
        return True
    return age > int(fact.get("staleAfterDays", 365))


def check_platform_facts(fields, rep, today):
    """The brief's «حقائق المنصة:» line: ids from the register, or «لا يوجد». Returns the ids that are open today."""
    line = fields.get("حقائق المنصة", "")
    if not line:
        rep.fix("T17", "brief", "«حقائق المنصة:» is missing: name the platform facts the cover or slide 2 rest on (ids from data/platform-instagram.json) or write «لا يوجد»")
        return []
    if line.startswith("لا يوجد"):
        return []
    facts, ids = load_facts(), re.findall(r"[a-z][a-z0-9]*(?:-[a-z0-9]+)+", line)
    if not ids:
        rep.error("T17", "brief", "«حقائق المنصة:» holds fact ids (for example edit-after-publish) or «لا يوجد»")
        return []
    unknown = [i for i in ids if facts and i not in facts]
    if unknown:
        rep.error("T17", "brief", "unknown platform fact id: %s" % ", ".join(unknown))
    return [i for i in ids if i in facts and is_open(facts[i], today)]


def check_brief(body, rep, today=None):
    fields = labelled(body)
    for label in BRIEF_LABELS:
        if not fields.get(label):
            rep.error("T10", "brief", "the line «%s:» is missing or empty" % label)
    goal = fields.get("الهدف", "")
    if goal and not goal.startswith(GOALS):
        rep.error("T11", "brief", "الهدف must start with one of %s" % " | ".join(GOALS))
    aware = fields.get("الوعي", "")
    if aware and not aware.startswith(AWARENESS):
        rep.error("T11", "brief", "الوعي must be one of %s" % " | ".join(AWARENESS))
    safe, bold = fields.get("بيتش آمن", ""), fields.get("بيتش جريء", "")
    fs, fb = family_codes(safe), family_codes(bold)
    if safe and bold:
        if not fs or not fb:
            rep.error("T12", "brief", "each pitch direction starts with its hook family code (P3, F17, S1...)")
        elif fs[0] == fb[0]:
            rep.error("T13", "brief", "the safe and the bold direction come from the same hook family (%s)" % fs[0])
        ms = [m for m in MOVES if re.search(r"(?<![\w-])%s(?![\w-])" % re.escape(m), safe)]
        mb = [m for m in MOVES if re.search(r"(?<![\w-])%s(?![\w-])" % re.escape(m), bold)]
        if not ms or not mb:
            rep.error("T12", "brief", "each pitch direction names its creative move (%s)" % ", ".join(MOVES))
        elif ms[0] == mb[0]:
            rep.error("T13", "brief", "the two directions use the same creative move (%s)" % ms[0])
        if "المخاطرة" not in bold:
            rep.fix("T14", "brief", "the bold direction must name its risk («المخاطرة:»)")
        if not re.search(r"«[^»]+»", safe) or not re.search(r"«[^»]+»", bold):
            rep.fix("T14", "brief", "each direction needs a cover line in «»")
    codes = family_codes(fields.get("عائلات الهوك", ""))
    if fields.get("عائلات الهوك") and not 3 <= len(set(codes)) <= 4:
        rep.error("T15", "brief", "عائلات الهوك lists 3 to 4 family codes (found %d)" % len(set(codes)))
    elif codes and (fs and fs[0] not in codes or fb and fb[0] not in codes):
        rep.fix("T15", "brief", "the candidate families should include both directions' families")
    idea = fields.get("الفكرة الكبيرة", "")
    if idea and (len(words(idea)) > 30 or re.search(r"[.!؟?] \S", idea)):
        rep.fix("T16", "brief", "the big idea is ONE short sentence")
    return check_platform_facts(fields, rep, today or date.today())


def check_pitch(body, stage, rep):
    head, rows = find_table(body, "الاتجاه")
    if not head:
        rep.error("T20", "pitch", "the pitch table (header starting «الاتجاه») is missing")
        return {}
    by = {}
    for row in rows:
        if len(row) >= 6 and row[0] in ("آمن", "جريء"):
            by[row[0]] = row
    for d in ("آمن", "جريء"):
        if d not in by:
            rep.error("T20", "pitch", "the table has no row for the %s direction" % d)
    if len(by) == 2:
        for d, row in by.items():
            if row[3] not in FAMILIES:
                rep.error("T21", "pitch", "%s: the family %r is not a hook family code" % (d, row[3]))
            if row[4] not in MOVES:
                rep.error("T21", "pitch", "%s: the move %r is not one of the ten creative moves" % (d, row[4]))
            r = ratio(row[5])
            if not r or r[1] != 3 or r[0] > 3:
                rep.error("T22", "pitch", "%s: the panel cell must read n/3 (found %r)" % (d, row[5]))
            n = hero_of(row[1])
            if n == 0 or n > HERO_MAX_WORDS:
                rep.fix("T23", "pitch", "%s: the cover line's hero has %d words (1 to %d)" % (d, n, HERO_MAX_WORDS))
        if by["آمن"][3] == by["جريء"][3]:
            rep.error("T24", "pitch", "both directions use the family %s" % by["آمن"][3])
        if by["آمن"][4] == by["جريء"][4]:
            rep.error("T24", "pitch", "both directions use the move %s" % by["آمن"][4])
    fields = labelled(body)
    decision = fields.get("القرار", "")
    if not decision.startswith(("آمن", "جريء", "دمج")):
        rep.error("T25", "pitch", "«القرار:» must start with آمن, جريء or دمج")
    elif "السبب" not in decision:
        rep.error("T25", "pitch", "«القرار:» must give its reason («— السبب: …»)")
    choice = fields.get("اختيار المبدع", "")
    if STAGES.index(stage) >= STAGES.index("room") and choice not in ("آمن", "جريء", "دمج"):
        rep.error("T26", "pitch", "«اختيار المبدع:» (آمن | جريء | دمج) is required once the writers' room starts")
    return by


def check_personas(body, rep):
    lines = [l.strip()[2:].strip() for l in body.split("\n") if l.strip().startswith("- ")]
    if len(lines) != 3:
        rep.error("T30", "personas", "three persona cards are required (found %d)" % len(lines))
    tags, names = [], []
    for line in lines:
        tag = next((t for t in PERSONA_TAGS if line.startswith(t)), None)
        if not tag:
            rep.error("T31", "personas", "a card must start with one of %s: %s" % (" ".join(PERSONA_TAGS), line[:40]))
            continue
        tags.append(tag)
        parts = [p.strip() for p in line[len(tag):].split(" · ")]
        names.append(parts[0] if parts else "")
        if len(parts) < 9:
            rep.error("T32", "personas", "%s: nine fields separated by « · » are required (found %d)" % (tag, len(parts)))
            continue
        for must in ("لحظتها:", "عايز", "بيتضايق من", "من:"):
            if must not in line:
                rep.error("T32", "personas", "%s: the field «%s» is missing" % (tag, must))
    if len(set(tags)) != len(tags) or (len(tags) == 3 and set(tags) != set(PERSONA_TAGS)):
        rep.error("T33", "personas", "the three cards are one [الأساسي], one [المتشكك] and one [الامتداد]")
    if len(set(names)) != len(names):
        rep.error("T33", "personas", "two personas share a name")
    core = sum(1 for line in lines if "audience.persona" in line)
    if len(lines) == 3 and core < 2:
        rep.fix("T34", "personas", "at least two of the three personas are slices of the brand's own audience (their «من:» names audience.persona); only the [الامتداد] card may reach beyond it (found %d)" % core)
    return [n for n in names if n]


def champion_set(text, rows_by_id):
    ids = re.findall(r"\b([A-Za-z]\w*\d+)\b", text)
    return [i for i in ids if i in rows_by_id]


def check_duel(body, rep):
    head, rows = find_table(body, "العائلة")
    hooks = {}
    for row in rows:
        if len(row) < 5:
            rep.error("T40", "duel", "a hook row needs 5 cells (id, family, cover, gates, score): %s" % " | ".join(row)[:50])
            continue
        hid, fam, cover, gates, score = row[:5]
        if hid in hooks:
            rep.error("T40", "duel", "duplicate hook id %s" % hid)
        if fam not in FAMILIES:
            rep.error("T40", "duel", "%s: %r is not a hook family code" % (hid, fam))
        if gates not in ("ok", "fail"):
            rep.error("T40", "duel", "%s: البوابات must be ok or fail" % hid)
        try:
            float(score)
        except ValueError:
            rep.error("T40", "duel", "%s: الدرجة must be a number" % hid)
        hooks[hid] = {"family": fam, "gates": gates, "score": float(score) if re.fullmatch(r"-?\d+(?:\.\d+)?", score) else 0.0, "cover": cover}
    if len(hooks) < 12:
        rep.error("T41", "duel", "the duel needs 12 or more hooks (found %d)" % len(hooks))
    fams = {}
    for h in hooks.values():
        fams.setdefault(h["family"], []).append(h)
    if not 4 <= len(fams) <= 6:
        rep.error("T42", "duel", "the hooks must come from 4 to 6 families (found %d)" % len(fams))
    for fam, items in fams.items():
        if len(items) > 3:
            rep.error("T42", "duel", "family %s has %d hooks (at most 3)" % (fam, len(items)))
    ok_families = {f for f, items in fams.items() if any(h["gates"] == "ok" for h in items)}
    if len(ok_families) < 3:
        rep.error("T43", "duel", "fewer than 3 families survive the gates: one re-draft of 6 more hooks is allowed, then the director decides")
    fields = labelled(body)
    champions = champion_set(fields.get("أبطال العائلات", ""), hooks)
    declared = len(re.findall(r"\b[A-Za-z]\w*\d+\b", fields.get("أبطال العائلات", "")))
    if not champions or len(champions) != declared:
        rep.error("T44", "duel", "«أبطال العائلات:» must list hook ids from the table")
    else:
        cfam = [hooks[c]["family"] for c in champions]
        if len(set(cfam)) != len(cfam):
            rep.error("T44", "duel", "two champions come from the same family")
        if any(hooks[c]["gates"] != "ok" for c in champions):
            rep.error("T44", "duel", "a champion failed a gate")
        if set(cfam) != ok_families:
            rep.error("T44", "duel", "every family that survived the gates sends exactly one champion")
        if len(champions) > 6:
            rep.error("T44", "duel", "at most 6 champions go to the panel")
    for label in ("أصوات اللجنة", "القراءة الباردة"):
        line = fields.get(label, "")
        got = {}
        for hid, n, d in re.findall(r"\b([A-Za-z]\w*\d+)\s+(\d+)\s*/\s*(\d+)", line):
            got[hid] = (int(n), int(d))
        if champions and (set(got) != set(champions) or any(d != 3 or n > 3 for n, d in got.values())):
            rep.error("T45", "duel", "«%s:» needs `id n/3` for every champion" % label)
    votes = {}
    for hid, n, d in re.findall(r"\b([A-Za-z]\w*\d+)\s+(\d+)\s*/\s*(\d+)", fields.get("أصوات اللجنة", "")):
        votes[hid] = int(n)
    if champions and set(votes) >= set(champions):
        leader = max(champions, key=lambda c: (hooks[c]["score"], -champions.index(c)))
        top = max(votes[c] for c in champions)
        if votes[leader] < top:
            hybrid = fields.get("الهجين", "")
            favourite = [c for c in champions if votes[c] == top]
            if not hybrid:
                rep.fix("T4A", "duel", "the score leader %s and the panel's favourite (%s) are different hooks: write «الهجين: id — «cover» — يحمل: …» "
                        "(one cover that carries the favourite's tension and the leader's visible number or proof) instead of picking one" % (leader, " / ".join(favourite)))
            elif not re.search(r"«[^»]+»", hybrid) or "يحمل" not in hybrid:
                rep.fix("T4A", "duel", "«الهجين:» needs the cover in «» and what it carries («— يحمل: …»)")
    dhead, duels = find_table(body, "الجولة")
    alive = set(champions)
    last_winner = None
    if champions:
        if len(duels) < len(champions) - 1:
            rep.error("T46", "duel", "%d champions need %d duels (found %d)" % (len(champions), len(champions) - 1, len(duels)))
        for row in duels:
            if len(row) < 5:
                rep.error("T46", "duel", "a duel row needs 5 cells (round, A, B, winner, reason)")
                continue
            rnd, a, b, win, reason = row[:5]
            if a not in alive or b not in alive or a == b:
                rep.error("T47", "duel", "%s: %s and %s must be two different hooks still in the bracket" % (rnd, a, b))
                continue
            if win not in (a, b):
                rep.error("T47", "duel", "%s: the winner %r must be %s or %s" % (rnd, win, a, b))
                continue
            if not reason or len(words(reason)) < 2:
                rep.error("T48", "duel", "%s: a duel needs its reason (the deciding criterion and the numbers)" % rnd)
            alive.discard(b if win == a else a)
            last_winner = win
        if len(alive) != 1:
            rep.error("T47", "duel", "the knockout did not finish: %d hooks are still alive" % len(alive))
    podium = fields.get("المنصة", "")
    entries = re.findall(r"([123])\s+([A-Za-z]\w*\d+)", podium)
    ids = [i for _, i in sorted(entries)]
    if len(ids) != 3 or [n for n, _ in sorted(entries)] != ["1", "2", "3"]:
        rep.error("T49", "duel", "«المنصة:» lists three hooks as `1 id · 2 id · 3 id`")
    else:
        if any(i not in hooks or hooks[i]["gates"] != "ok" for i in ids):
            rep.error("T49", "duel", "the podium holds a hook that is not in the table or failed a gate")
        elif len({hooks[i]["family"] for i in ids}) != 3:
            rep.error("T49", "duel", "the podium must come from three different families")
        if last_winner and ids[0] != last_winner:
            rep.error("T49", "duel", "first place %s is not the winner of the final duel (%s)" % (ids[0], last_winner))
    return hooks


def check_editor(body, rep):
    fields = labelled(body)
    verdict = verdict_word(fields.get("الحكم", ""))
    if verdict not in ("PASS", "VETO"):
        rep.error("T50", "editor", "«الحكم:» must be PASS or VETO")
    elif verdict == "VETO":
        rep.error("T51", "editor", "the language VETO is open: the copy is fixed and re-checked (at most 2 rounds), nothing moves on")
    m = re.fullmatch(r"(\d+)\s*(?:من|/)\s*2", fields.get("الجولة", ""))
    if not m:
        rep.error("T50", "editor", "«الجولة: n من 2» is required")
    elif int(m.group(1)) > 2 or int(m.group(1)) < 1:
        rep.error("T52", "editor", "the editor's rounds are 1 or 2")


def weakest_pair(rows, slide_count):
    """(k, average pull) of the transition sK→sK+1 with the lowest average pull among the personas still reading slide K
    (a stop counts 0); ties go to the earlier pair. None when nobody is left to read."""
    best = None
    for k in range(1, slide_count):
        present = [r["pulls"][k - 1] for r in rows if k <= r["depth"]]
        if not present:
            continue
        avg = Fraction(sum(present), len(present))
        if best is None or avg < best[1]:
            best = (k, avg)
    return (best[0], float(best[1])) if best else None


def check_swipe(body, personas, slides_meta, rep):
    head, rows = find_table(body, "الشخصية")
    out = {"rows": [], "reach": 0, "n": None}
    if not head:
        rep.error("T60", "swipe", "the swipe-test table (header starting «الشخصية») is missing")
        return out
    if len(rows) != 3:
        rep.error("T60", "swipe", "three persona rows are required (found %d)" % len(rows))
    slide_count = None
    stopped = False
    for row in rows:
        if len(row) < 6:
            rep.error("T61", "swipe", "a row needs 6 cells (persona, depth, pull, stop, reason, intent)")
            continue
        name, depth, pull, stop, reason, intent = row[:6]
        m = re.fullmatch(r"(\d+)\s*/\s*(\d+)", depth)
        pulls = [p.strip() for p in pull.split(",") if p.strip()]
        if not m or not all(re.fullmatch(r"[0-3]", p) for p in pulls):
            rep.error("T61", "swipe", "%s: العمق is n/N and الجذب a list of 0 to 3" % name)
            continue
        d, n = int(m.group(1)), int(m.group(2))
        if slide_count is None:
            slide_count = n
        elif n != slide_count:
            rep.error("T61", "swipe", "%s: the slide count %d differs from the other rows (%d)" % (name, n, slide_count))
        if slides_meta and str(n) != slides_meta:
            rep.error("T61", "swipe", "%s: the slide count %d differs from the board's `slides: %s`" % (name, n, slides_meta))
        if d > n or d < 1 or len(pulls) != d:
            rep.error("T61", "swipe", "%s: الجذب holds %d numbers but the depth is %d of %d" % (name, len(pulls), d, n))
            continue
        vals = [int(p) for p in pulls]
        if stop == "-":
            if d != n:
                rep.error("T62", "swipe", "%s: no stop slide but the depth %d is not the last slide %d" % (name, d, n))
            if any(v == 0 for v in vals):
                rep.error("T62", "swipe", "%s: a 0 means a stop, but no stop slide is given" % name)
            out["reach"] += 1
        else:
            sm = re.fullmatch(r"s0*(\d+)", stop)
            if not sm or int(sm.group(1)) != d or d >= n:
                rep.error("T62", "swipe", "%s: a stop is on the last slide viewed (s%02d) and before the final slide; a persona who reaches slide %d has `-`" % (name, d, n))
            if vals[-1] != 0 or any(v == 0 for v in vals[:-1]):
                rep.error("T62", "swipe", "%s: a persona who stops has pulls above 0 until the last number, which is 0" % name)
            if not reason or reason == "-":
                rep.error("T62", "swipe", "%s: a stop needs its reason, in her words" % name)
            stopped = True
        if not intent.startswith(("حفظ", "إرسال", "لا شيء")):
            rep.error("T63", "swipe", "%s: النية starts with حفظ, إرسال or لا شيء" % name)
        elif intent.startswith("إرسال") and not re.search(r"—\s*لـ?\S+", intent):
            rep.error("T63", "swipe", "%s: a send intent names a person (إرسال — لـ…)" % name)
        elif intent.startswith("حفظ") and "—" not in intent:
            rep.error("T63", "swipe", "%s: a save intent names the future moment (حفظ — لما …)" % name)
        out["rows"].append({"name": name, "depth": d, "n": n, "pulls": vals, "stop": stop})
        if personas and name not in personas:
            rep.fix("T64", "swipe", "%r is not one of the persona cards' names" % name)
    out["n"] = slide_count
    fields = labelled(body)
    if out["rows"] and slide_count:
        expected = [sum(1 for r in out["rows"] if k <= r["depth"]) for k in range(1, slide_count + 1)]
        written = [int(x) for x in re.findall(r"\d+", fields.get("القراء لكل سلايد", ""))]
        if not written:
            rep.error("T68", "swipe", "«القراء لكل سلايد: n,n,…» is required: the drop-off map, how many personas were still reading each slide (here %s)" % ",".join(map(str, expected)))
        elif written != expected:
            rep.error("T68", "swipe", "«القراء لكل سلايد» is %s but the rows give %s" % (",".join(map(str, written)), ",".join(map(str, expected))))
    weakest = fields.get("أضعف انتقال", "")
    wm = re.match(r"s0*(\d+)\s*(?:→|->)\s*s0*(\d+)", weakest)
    if not wm:
        rep.error("T65", "swipe", "«أضعف انتقال: sNN→sMM — …» is required")
    elif out["rows"] and slide_count:
        best = weakest_pair(out["rows"], slide_count)
        if best and (int(wm.group(1)), int(wm.group(2))) != (best[0], best[0] + 1):
            rep.fix("T66", "swipe", "the weakest transition recomputed from the pulls is s%02d→s%02d (average pull %.1f among the personas still reading), not %s"
                    % (best[0], best[0] + 1, best[1], weakest[:12]))
    if stopped and not fields.get("الإصلاح"):
        rep.error("T67", "swipe", "someone stopped, so «الإصلاح:» (the copywriter's rewrite of the weakest transition) is required")
    return out


def verdict_word(text):
    """Read the verdict token, leaving a following explanation to the human reviewer."""
    match = re.match(r"^([A-Za-z]+)\b", text.strip())
    return match.group(1) if match else ""


def select_review(body, stage, rep):
    """Keep script and final reviews on one board, uniquely keyed by their phase line."""
    lines = body.splitlines(keepends=True)
    starts = [i for i, line in enumerate(lines) if "المرحلة" in labelled(line)]
    blocks = ["".join(lines[start:starts[i + 1] if i + 1 < len(starts) else len(lines)])
              for i, start in enumerate(starts)]
    reviews = {}
    for block in blocks:
        phase = labelled(block).get("المرحلة")
        if phase is None:
            continue
        if phase not in ("script", "final"):
            rep.error("T70", "review", "«المرحلة:» must be script or final")
        elif phase in reviews:
            rep.error("T06", "review", "review phase %s appears twice" % phase)
        else:
            reviews[phase] = block
    needed = "final" if stage == "final" else "script"
    if needed not in reviews:
        rep.error("T70", "review", "stage %s needs «المرحلة: %s»" % (stage, needed))
        return None
    return reviews[needed]


def check_review(body, swipe, stage, rep, open_ids=(), promises=0):
    fields = labelled(body)
    phase = fields.get("المرحلة", "")
    if phase not in ("script", "final"):
        rep.error("T70", "review", "«المرحلة:» must be script or final")
    if stage == "final" and phase != "final":
        rep.error("T70", "review", "at stage final the review must be the final one («المرحلة: final»)")
    scores = {}
    for line in body.split("\n"):
        m = re.match(r"^\s*(%s)\s+([1-5])\s+—\s+(.+)$" % "|".join(LENSES), line)
        if m:
            scores[m.group(1)] = int(m.group(2))
            if len(words(m.group(3))) < 2:
                rep.fix("T71", "review", "%s: quote the evidence (a slide, a field, a persona's words)" % m.group(1))
    missing = [l for l in LENSES if l not in scores]
    if missing:
        rep.error("T71", "review", "lens lines missing or malformed (`الفكرة 4 — evidence`): %s" % "، ".join(missing))
        return
    verdict = verdict_word(fields.get("الحكم", ""))
    if verdict not in ("SHIP", "REVISE", "KILL"):
        rep.error("T72", "review", "«الحكم:» must be SHIP, REVISE or KILL")
        return
    reach = swipe.get("reach", 0)
    if scores["الفكرة"] <= 2 or scores["الهوك"] <= 2:
        expected = "KILL"
    elif all(v >= 4 for v in scores.values()) and reach >= 2:
        expected = "SHIP"
    else:
        expected = "REVISE"
    if verdict != expected:
        rep.error("T73", "review", "the verdict %s does not follow the scores (all lenses 4+ and 2 of 3 personas at the last slide give SHIP; "
                  "Idea or Hook 2 or less gives KILL); the rules give %s (lowest lens %d, personas at the last slide %d)"
                  % (verdict, expected, min(scores.values()), reach))
    if open_ids and scores["الدليل"] >= 4:
        rep.fix("T77", "review", "الدليل is %d but the brief rests on open platform fact(s) %s (not verified, or older than its window): verify "
                "the fact, or keep الدليل at 3 or below and put the fact at the top of the message to the creator" % (scores["الدليل"], ", ".join(open_ids)))
    notes = re.findall(r"^\s*ملاحظة لـ\s*(\S+?)\s*:\s*(.*)$", body, re.M)
    for agent, text in notes:
        if agent not in AGENTS:
            rep.error("T74", "review", "a note is addressed to %r, which is not a team agent" % agent)
        if not text.strip():
            rep.error("T74", "review", "a note to %s is empty" % agent)
    if verdict == "REVISE" and not 1 <= len(notes) <= 3:
        rep.error("T74", "review", "REVISE needs 1 to 3 notes («ملاحظة لـcs-copywriter: …»), found %d" % len(notes))
    if phase == "final":
        m130 = re.search(r"غلاف 130px\s*:\s*(\d)\s*من\s*3", body)
        if not m130:
            rep.error("T75", "review", "the final review needs «غلاف 130px: n من 3 وقفوا»")
        qa = verdict_word(fields.get("QA", ""))
        ad = verdict_word(fields.get("المدير الفني", ""))
        if qa not in ("ok", "FIX", "BLOCK"):
            rep.error("T75", "review", "«QA:» must be ok, FIX or BLOCK")
        if ad not in ("PASS", "FIX", "BLOCK"):
            rep.error("T75", "review", "«المدير الفني:» must be PASS, FIX or BLOCK")
        if "FIX" in (qa, ad) and scores["الصنعة"] >= 4:
            rep.fix("T78", "review", "الصنعة is %d over an open FIX (QA %s, art director %s): an open finding on the pixels caps Craft at 3; turn each one into a REVISE note" % (scores["الصنعة"], qa, ad))
        ledger = re.findall(r"^\s*الوعد\s*:\s*(.+?)\s+—\s+([✓✗])\s+—\s+(\S.*)$", body, re.M)
        if promises and len(ledger) < promises:
            rep.fix("T79", "review", "the decisions made %d promise(s) («وعد:») and the final review re-checks %d of them: «الوعد: … — ✓|✗ — the evidence on the final tile or slide»" % (promises, len(ledger)))
        if verdict == "SHIP" and any(mark == "✗" for _, mark, _ in ledger):
            rep.error("T79", "review", "SHIP with a promise that did not hold (✗): the lens it belongs to fails, so the verdict is REVISE")
        if verdict == "SHIP":
            if qa == "BLOCK" or ad == "BLOCK":
                rep.error("T76", "review", "SHIP with an open technical BLOCK: a BLOCK is fixed, not argued")
            if m130 and int(m130.group(1)) < 2:
                rep.error("T76", "review", "SHIP needs at least 2 of 3 personas to stop at the cover at 130 px")


def check_shortlist(body, rep):
    """«الستايل: <preset> — بدائل: <preset> (<why>)، <preset> (<why>) — اختبار V1: ok|fail|لم يُفحص»."""
    line = next((l for l in body.split("\n") if re.match(r"^\s*الستايل\s*:", l)), None)
    if line is None:
        rep.error("T85", "huddle", "the art director's style shortlist is missing: «الستايل: <preset> — بدائل: <preset> (<why>)، <preset> (<why>) — اختبار V1: ok|fail|لم يُفحص»")
        return
    m = re.match(r"^\s*الستايل\s*:\s*(\S+)\s+—\s+بدائل\s*:\s*(.+?)\s+—\s+اختبار V1\s*:\s*(.+?)\s*$", line)
    if not m:
        rep.error("T85", "huddle", "the shortlist line reads «الستايل: <preset> — بدائل: … — اختبار V1: …»")
        return
    chosen, alts, v1 = m.group(1), re.findall(r"([a-z]+)\s*\(([^)]+)\)", m.group(2)), m.group(3)
    if chosen not in PRESETS:
        rep.error("T85", "huddle", "%r is not a shipped preset (%s)" % (chosen, ", ".join(PRESETS)))
    if len(alts) < 2 or any(a not in PRESETS or a == chosen or not why.strip() for a, why in alts):
        rep.error("T85", "huddle", "two different alternative presets are needed, each with its fit reason in brackets")
    if not any(w in v1 for w in V1_WORDS):
        rep.fix("T85", "huddle", "the pre-flight result is ok, fail or لم يُفحص")


def check_huddle(body, rep):
    check_shortlist(body, rep)
    artifacts = [re.search(r"^[ \t]*%s[ \t]*[:—][ \t]*(\S[^\n]*)$" % label, body, re.M)
                 for label in ("الخطة البصرية", "التصميم الحر", "ورقة المراجعة")]
    if not all(artifacts) or [m.start() for m in artifacts if m] != sorted(m.start() for m in artifacts if m):
        rep.error("T86", "huddle", "round 4 requires visual plan → free design → review sheet: «الخطة البصرية — …», «التصميم الحر: …», «ورقة المراجعة: …»")
    focal, lines_ok = [], {"المدير الفني ✓": False, "مصمم الحركة ✓": False}
    recipe = None
    for line in body.split("\n"):
        m = re.search(r"عنصر البطل\s*:\s*(.+?)(?:\s*\|\s*|$)", line)
        if m:
            focal.append(re.sub(r"[«»✓\s]+", " ", m.group(1)).strip())
            for marker in lines_ok:
                if marker in line:
                    lines_ok[marker] = True
            rm = re.search(r"الوصفة\s*:\s*([a-z-]+)", line)
            if rm:
                recipe = rm.group(1)
    if len(focal) != 2 or not all(lines_ok.values()):
        rep.error("T80", "huddle", "both huddle lines are required: the art director's (…| المدير الفني ✓) and the motion designer's (…| مصمم الحركة ✓), each with «عنصر البطل:»")
    elif focal[0] != focal[1]:
        rep.error("T81", "huddle", "the two roles name different focal elements (%r and %r): one element, in the same words, or the director rules once" % (focal[0], focal[1]))
    if recipe is None:
        rep.error("T82", "huddle", "the motion designer's line needs «الوصفة: <recipe> (<tag>)»")
    elif recipe not in RECIPES:
        rep.error("T82", "huddle", "the recipe %r is not a shipped recipe (%s)" % (recipe, ", ".join(RECIPES)))
    elif recipe == "calm":
        rep.fix("T82", "huddle", "calm is only for creators who asked for no motion; motion is on by default")
    times = []
    planned = re.split(r"^[ \t]*(?:#{1,6}[ \t]+)?(?:اللقطات المقاسة(?: من MP4)?|Measured frames(?: from MP4)?)[ \t]*:?[ \t]*$",
                       body, maxsplit=1, flags=re.M | re.I)[0]
    for line in planned.split("\n"):
        m = re.match(r"^\s*(\d+(?:\.\d+)?)\s*s\s*[—-]\s*(\S.*)$", line)
        if m:
            times.append(float(m.group(1)))
    if times != list(STORYBOARD_TIMES):
        rep.error("T83", "huddle", "the storyboard has six lines at exactly 0.0s, 0.4s, 1.5s, 3.0s, 4.5s and 5.9s (found %s)" % ", ".join("%gs" % t for t in times))
    elif focal and focal[0]:
        first = next(l for l in body.split("\n") if re.match(r"^\s*0(?:\.0)?\s*s\s*[—-]", l))
        if not any(w in first for w in words(focal[0]) if len(w) > 1):
            rep.fix("T84", "huddle", "the bold move must be in frame 0 (the poster and the grid thumbnail): the 0.0s line does not show the focal element %r" % focal[0])


def check_decisions(body, rep):
    lines = [l.strip() for l in body.split("\n") if l.strip().startswith("- ")]
    if not lines:
        rep.error("T90", "decisions", "the decision log is empty: every decision is logged with its reason")
    for line in lines:
        if "—" not in line and "السبب" not in line and "لأن" not in line:
            rep.fix("T91", "decisions", "a decision without a reason: %s" % line[:50])


def check_cards(body, rep):
    blocks = [b for b in re.split(r"\n\s*\n", body.strip()) if b.strip()]
    if not blocks:
        rep.error("T92", "cards", "no handoff card yet")
    for block in blocks:
        head = re.match(r"^\s*من\s*:\s*(\S+)\s*(?:→|->)\s*إلى\s*:\s*(\S+)", block)
        if not head:
            rep.error("T93", "cards", "a card starts with `من: <agent> → إلى: <agent>`: %s" % block.strip()[:40])
            continue
        for who in head.groups():
            if who not in CARD_TARGETS:
                rep.error("T93", "cards", "%r is not a team agent or `creator`" % who)
        for label in CARD_LABELS:
            m = re.search(r"^\s*%s\s*:\s*(.*)$" % re.escape(label), block, re.M)
            if not m or not m.group(1).strip():
                rep.error("T94", "cards", "card %s→%s: the field «%s:» is missing or empty" % (head.group(1), head.group(2), label))
        conf = re.search(r"^\s*ثقتي\s*:\s*(\S+)", block, re.M)
        if conf and conf.group(1) not in CONFIDENCE:
            rep.error("T94", "cards", "ثقتي is one of %s" % " | ".join(CONFIDENCE))


def check_log_entries(entries, stage, rep, where):
    """entries: [(key, text)]"""
    keys = [k for k, _ in entries]
    if len(entries) > 6:
        rep.error("T95", where, "the team log has %d lines; at most 6" % len(entries))
    if len(set(keys)) != len(keys):
        rep.error("T95", where, "one line per key: a key is repeated")
    for k, t in entries:
        if k not in LOG_KEYS:
            rep.error("T95", where, "%r is not a log key (%s)" % (k, ", ".join(LOG_KEYS)))
        if not str(t).strip():
            rep.error("T95", where, "the %s line is empty" % k)
        elif len(str(t)) > LOG_MAX_CHARS:
            rep.fix("T96", where, "the %s line has %d characters (at most %d): say the decision and the reason, not the debate" % (k, len(str(t)), LOG_MAX_CHARS))
        if re.search(r"(?:^|\s)(?:من|إلى)\s*:|ثقتي\s*:|cs-[a-z]+-[a-z]+", str(t)):
            rep.fix("T96", where, "the %s line looks like a handoff card; the creator sees decisions and reasons" % k)
    for need in LOG_KEYS_AT.get(stage, ()):
        if need not in keys:
            rep.error("T97", where, "the %s line is missing (required from this stage)" % need)
    if stage in ("fast", "ready"):
        if set(keys) & {"pitch", "duel", "swipe"}:
            rep.error("T99", where, "this lane ran no pitch, duel or swipe panel; do not invent their log lines")
        for key, value in entries:
            if key == "editor" and verdict_word(value) != "PASS":
                rep.error("T51", where, "the editor must report PASS; an unresolved VETO stops the post")
            if key == "design":
                qa = re.search(r"(?:\bQA|الجودة)\s*[:：]\s*(ok|PASS|FIX|BLOCK|سليم|تعديل|موقوف)\b", value)
                director = re.search(r"(?:المدير(?: الإبداعي)?|director)\s*[:：]\s*(SHIP|REVISE|KILL|جاهز|تعديل|مرفوض)\b", value)
                if not qa or not director:
                    rep.error("T99", where, "the design line names both QA/الجودة and the director's verdict, in English or Arabic")
                elif qa.group(1) in ("BLOCK", "موقوف") or director.group(1) not in ("SHIP", "جاهز"):
                    rep.error("T99", where, "delivery needs the QA veto cleared and the director's SHIP")


def check_log(body, stage, rep):
    entries = []
    for line in body.split("\n"):
        m = re.match(r"^\s*-\s+([a-z]+)\s*:\s*(.*)$", line)
        if m:
            entries.append((m.group(1), m.group(2).strip()))
        elif line.strip():
            rep.fix("T96", "log", "unexpected line in the log: %s" % line.strip()[:40])
    check_log_entries(entries, stage, rep, "log")


def check_spec(path, stage, rep):
    try:
        spec = json.loads(Path(path).read_text(encoding="utf-8"))
    except OSError as exc:
        sys.stderr.write("cs-error: E_NO_INPUT: %s\n" % exc)
        sys.exit(66)
    except ValueError as exc:
        sys.stderr.write("cs-error: E_SCHEMA: %s is not JSON: %s\n" % (path, exc))
        sys.exit(65)
    ext = spec.get("ext") if isinstance(spec, dict) else None
    log = ext.get("teamLog") if isinstance(ext, dict) else None
    if stage in ("fast", "ready"):
        slides = spec.get("slides") if isinstance(spec, dict) else None
        single = isinstance(spec, dict) and spec.get("format") == "single"
        if not isinstance(slides, list) or not (len(slides) == 1 if single else 4 <= len(slides) <= 10):
            rep.error("T03", "spec", "a carousel has 4 to 10 slides, cover included (a single post has 1)")
    if log is None:
        if stage in LOG_KEYS_AT:
            rep.error("T98", "spec", "spec.ext.teamLog is missing: the Studio shows the team log from it")
        return
    if not isinstance(log, list) or not all(isinstance(e, dict) and isinstance(e.get("k"), str) and isinstance(e.get("t"), str) for e in log):
        rep.error("T98", "spec", "spec.ext.teamLog is a list of {\"k\": key, \"t\": text}")
        return
    check_log_entries([(e["k"], e["t"]) for e in log], stage, rep, "spec.ext.teamLog")


# ----------------------------------------------------------------------------- driver
def check_board(text, stage, spec_path=None, today=None):
    rep = Report()
    if stage in ("fast", "ready"):
        if spec_path:
            check_spec(spec_path, stage, rep)
        else:
            rep.error("T98", "spec", "--spec is required for the fast and ready stages")
        return rep
    text = norm(text)
    header, bodies, order = split_sections(text)
    meta = check_meta(header, bodies, stage, rep)
    seen = set()
    for sid in order:
        if sid not in SECTIONS:
            rep.fix("T06", sid, "unknown section id {#%s}" % sid)
        if sid in seen and sid != "review":
            rep.error("T06", sid, "section {#%s} appears twice" % sid)
        seen.add(sid)
    upto = STAGES.index(stage)
    for s in STAGES[:upto + 1]:
        for need in REQUIRED[s]:
            if need not in bodies:
                rep.error("T07", need, "the section {#%s} is required at stage %s (it is part of stage %s)" % (need, stage, s))
    slides_meta = meta.get("slides") if isinstance(meta, dict) else None
    open_ids = check_brief(bodies["brief"], rep, today) if "brief" in bodies else []
    promises = len([l for l in bodies.get("decisions", "").split("\n") if re.match(r"^\s*-\s+وعد\s*:", l)])
    if "pitch" in bodies:
        check_pitch(bodies["pitch"], stage, rep)
    names = check_personas(bodies["personas"], rep) if "personas" in bodies else []
    if "duel" in bodies:
        check_duel(bodies["duel"], rep)
    if "editor" in bodies:
        check_editor(bodies["editor"], rep)
    swipe = check_swipe(bodies["swipe"], names, slides_meta, rep) if "swipe" in bodies else {}
    if "review" in bodies:
        review = select_review(bodies["review"], stage, rep)
        if review is not None:
            check_review(review, swipe, stage, rep, open_ids, promises)
    if "huddle" in bodies:
        check_huddle(bodies["huddle"], rep)
    if "decisions" in bodies:
        check_decisions(bodies["decisions"], rep)
    if "cards" in bodies:
        check_cards(bodies["cards"], rep)
    if "log" in bodies:
        check_log(bodies["log"], stage, rep)
    if spec_path:
        check_spec(spec_path, stage, rep)
    return rep


class _Parser(argparse.ArgumentParser):
    def error(self, message):
        sys.stderr.write("cs-error: E_USAGE: %s\n" % message)
        sys.exit(64)


def main(argv=None):
    ap = _Parser(prog="board_check.py", description=__doc__.split("\n\n")[0])
    ap.add_argument("board", nargs="?", help="the board.md of the post (guided stages only)")
    ap.add_argument("--stage", choices=STAGES, default="final", help="the stage the board must have reached (default: final)")
    ap.add_argument("--spec", help="spec.json: also check spec.ext.teamLog (the Studio's team log)")
    ap.add_argument("--today", help="the day the platform facts are judged on, YYYY-MM-DD (default: today)")
    ap.add_argument("--format", choices=("text", "json"), default="text")
    args = ap.parse_args(argv)
    if not args.board and args.stage in GUIDED_STAGES:
        ap.error("BOARD.md is required for a guided stage")
    if args.stage in ("fast", "ready") and not args.spec:
        ap.error("--spec is required for the fast and ready stages")
    try:
        raw = Path(args.board).read_text(encoding="utf-8") if args.board else ""
    except FileNotFoundError:
        sys.stderr.write("cs-error: E_NO_INPUT: %s does not exist\n" % args.board)
        return 66
    except (OSError, UnicodeDecodeError) as exc:
        sys.stderr.write("cs-error: E_READ: %s: %s\n" % (args.board, exc))
        return 65
    try:
        today = date.fromisoformat(args.today) if args.today else None
    except ValueError:
        sys.stderr.write("cs-error: E_USAGE: --today is YYYY-MM-DD\n")
        return 64
    rep = check_board(raw, args.stage, args.spec, today)
    errors, fixes = rep.count("error"), rep.count("fix")
    if args.format == "json":
        print(json.dumps({"ok": errors == 0 and fixes == 0, "stage": args.stage, "counts": {"error": errors, "fix": fixes}, "findings": rep.items},
                         ensure_ascii=False, indent=2))
    else:
        for i in rep.items:
            print("%-5s %s  %s: %s" % ("ERROR" if i["severity"] == "error" else "FIX", i["code"], i["where"], i["message"]))
        if errors or fixes:
            print("لوحة الإنتاج: %d خطأ و%d للتعديل (المرحلة %s)" % (errors, fixes, args.stage))
        else:
            print("لوحة الإنتاج سليمة (المرحلة %s)" % args.stage)
    return 2 if errors else (1 if fixes else 0)


if __name__ == "__main__":
    sys.exit(main())
