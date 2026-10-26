#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""brand_io.py - create, read, update, resume and export brand profiles (brand.json).

    brand_io.py <cmd> [--dir ROOT] [--format text|json]

Brands live at ROOT/brands/<slug>/brand.json. ROOT defaults to the Carousel Studio
workspace (CS_WORKSPACE or ~/CarouselStudio). Commands:

    new            --slug S --name N --dialect D [--kind K] [--country EG,AE] [--app-language L]
                   [--sub-variety V] [--handle @h] [--ui-dialect D]
    get            --slug S [--path a.b.c]
    set            --slug S --path a.b.c (--json V | --value STR)
    save-section   --slug S --section SECTION --file F [--status done|skipped]
    resume         --slug S
    list           list brands (the default brand is marked)
    use            [--slug S]     record (or print) the default brand
    validate       --slug S
    migrate        --slug S
    capsule        --slug S       the <=1,500-byte brand capsule for Project instructions
    snapshot-hash  --slug S
    import         --file brand.json [--overwrite]
    approve        --slug S       stamp the Brand Book approval (version, approvedAt)
    remember       --slug S (--json ENTRY | --file F)   append a post to the creative team's memory (last 30, newest last)
    memory         --slug S       what the Creative Director reads at the brief: recent posts, what to rest (family, move, recipe, preset,
                   intent), the call-to-action kinds to avoid, the last covers, the pitch habit, the open series, what was loved or rejected

Exit codes: 0 ok, 2 invalid against the schema, 64 usage, 65 unparseable data,
66 missing file or brand, 70 internal error, 73 cannot write, 75 conflict.
Nothing here touches the network.
"""

import argparse
import copy
import json
import os
import re
import secrets
import unicodedata
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _cs import canon, paths, schema  # noqa: E402

paths.ensure_utf8_stdio()

EXIT_OK, EXIT_INVALID, EXIT_USAGE, EXIT_DATA, EXIT_MISSING = 0, 2, 64, 65, 66
EXIT_INTERNAL, EXIT_WRITE, EXIT_CONFLICT = 70, 73, 75

SECTIONS = ("identity", "audience", "voice", "visual", "strategy", "tools")
SECTION_LABEL = {
    "identity": "الهوية", "audience": "الجمهور", "voice": "الصوت",
    "visual": "الهوية البصرية", "strategy": "الاستراتيجية", "tools": "الأدوات",
}
# top-level brand keys a section may write (anything else is refused)
SECTION_KEYS = {
    "identity": ("name", "handle", "kind", "identity"),
    "audience": ("audience", "locale"),
    "voice": ("voice", "locale"),
    "visual": ("visual", "references"),
    "strategy": ("strategy",),
    "tools": ("tools",),
}
PROTECTED_PATHS = ("schemaVersion", "id", "slug", "createdAt")
DIALECTS = ("eg", "gulf", "levant", "msa-white", "en")
KINDS = ("creator", "business", "client")
SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9-]{1,39}$")
CAPSULE_MAX_BYTES = 1500
CAPSULE_VOICE_MAX = 200

# The handle and the brand name print in the header of every slide, the MP4 and the PDF. A value copied from an example would ship on all of
# them, so it is refused here and is a BLOCK in the post (gate B2.placeholder-chrome). These lists equal the ones in qa-rules.json; a unit
# test keeps them in step (this skill carries no copy of the rules, because a skill reads nothing outside its own folder).
PLACEHOLDER_HANDLES = frozenset((
    "yourbrand", "yourbrandname", "yourbrandhere", "yourhandle", "yourname", "yourusername", "yourcompany", "yourbusiness", "yourpage",
    "brandhandle", "brandname", "handle", "username", "userhandle", "example", "exampleuser", "exampleaccount", "examplebrand",
    "sample", "samplebrand", "placeholder", "test", "testbrand", "testaccount", "demo", "demobrand", "brand", "account", "accountname",
    "companyname", "mybrand", "myhandle", "myname", "myaccount", "instagram", "name", "todo", "tbd", "xxx"))
PLACEHOLDER_CONTAINS = ("yourbrand", "yourhandle", "yourusername", "brandhandle", "placeholder", "lorem")
PLACEHOLDER_NAMES = frozenset((
    "your brand", "your brand name", "brand name", "your name", "company name", "business name", "your business", "demo brand",
    "example brand", "sample brand", "test brand", "براند تجريبي", "اسم البراند", "اسم الحساب", "اسم العلامة",
    "اسم العلامة التجارية", "اسم الشركة", "اسمك"))
PLACEHOLDER_TOKENS = ("<", ">", "{{", "}}", "[", "]")


class Fail(Exception):
    def __init__(self, code, message, exit_code):
        super().__init__(message)
        self.code, self.exit_code = code, exit_code


def fail(code, message, exit_code):
    raise Fail(code, message, exit_code)


class Parser(argparse.ArgumentParser):
    def error(self, message):
        sys.stderr.write("cs-error: E_USAGE: %s\n" % message)
        raise SystemExit(EXIT_USAGE)


# ----------------------------------------------------------------------------- helpers
def now_iso():
    forced = os.environ.get("CS_NOW")  # test hook: a fixed ISO-8601 UTC timestamp
    if forced:
        return forced
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def root_dir(args):
    return Path(args.dir) if args.dir else paths.workspace_dir()


def brand_path(args, slug):
    if not SLUG_RE.match(slug or ""):
        fail("E_USAGE", "invalid slug %r (lowercase letters, digits and hyphens, 2-40 characters)" % slug, EXIT_USAGE)
    return root_dir(args) / "brands" / slug / "brand.json"


def load_brand(args, slug):
    p = brand_path(args, slug)
    if not p.exists():
        fail("E_USAGE", "brand %r not found at %s" % (slug, p), EXIT_MISSING)
    try:
        return paths.read_json(p)
    except (ValueError, OSError) as exc:
        fail("E_SCHEMA", "cannot parse %s: %s" % (p, exc), EXIT_DATA)


def save_brand(args, brand):
    p = brand_path(args, brand["slug"])
    try:
        paths.write_json(p, brand)
    except OSError as exc:
        fail("E_ABORTED", "cannot write %s: %s" % (p, exc), EXIT_WRITE)
    return p


def locale_defaults():
    return paths.read_json(paths.data_path("locale-defaults.json"))


def emit(args, data, text):
    if args.format == "json":
        print(json.dumps(data, ensure_ascii=False))
    else:
        print(text)


def deep_merge(dst, src):
    """Objects merge, everything else replaces, None deletes."""
    for key, value in src.items():
        if value is None:
            dst.pop(key, None)
        elif isinstance(value, dict) and isinstance(dst.get(key), dict):
            deep_merge(dst[key], value)
        else:
            dst[key] = copy.deepcopy(value)


def split_path(path):
    parts = [p for p in path.split(".") if p != ""]
    if not parts:
        fail("E_USAGE", "empty --path", EXIT_USAGE)
    return parts


def get_path(doc, path):
    node = doc
    for part in split_path(path):
        if isinstance(node, list) and part.lstrip("-").isdigit():
            idx = int(part)
            if not -len(node) <= idx < len(node):
                fail("E_USAGE", "index %s out of range at %r" % (part, path), EXIT_MISSING)
            node = node[idx]
        elif isinstance(node, dict) and part in node:
            node = node[part]
        else:
            fail("E_USAGE", "path %r not found" % path, EXIT_MISSING)
    return node


def set_path(doc, path, value):
    parts = split_path(path)
    if parts[0] in PROTECTED_PATHS:
        fail("E_USAGE", "%s is managed by brand_io and cannot be set" % parts[0], EXIT_USAGE)
    node = doc
    for i, part in enumerate(parts):
        last = i == len(parts) - 1
        if isinstance(node, list):
            if part == "-":
                idx = len(node)
            elif part.isdigit():
                idx = int(part)
            else:
                fail("E_USAGE", "list index expected at %r, got %r" % (".".join(parts[:i]), part), EXIT_USAGE)
            if idx > len(node):
                fail("E_USAGE", "index %d out of range at %r" % (idx, ".".join(parts[:i])), EXIT_USAGE)
            if last:
                if idx == len(node):
                    node.append(value)
                else:
                    node[idx] = value
                return
            if idx == len(node):
                node.append({})
            node = node[idx]
        elif isinstance(node, dict):
            if last:
                node[part] = value
                return
            if not isinstance(node.get(part), (dict, list)):
                node[part] = {}
            node = node[part]
        else:
            fail("E_USAGE", "cannot descend into a scalar at %r" % ".".join(parts[:i]), EXIT_USAGE)


def schema_errors(brand):
    return schema.validate_named("brand", brand)


def placeholder_key(value):
    """NFC, lower case, marks and punctuation folded away (the comparison gate B2 makes)."""
    t = unicodedata.normalize("NFC", "" if value is None else str(value)).lower()
    t = re.sub("[\u064B-\u065F\u0670\u0640]", "", t)
    return re.sub("[\\W_]+", " ", t).strip()


def is_placeholder(value, kind):
    """True when `value` (a handle or a brand name) is a stock example or a template token, not a real one."""
    text = "" if value is None else str(value)
    if not text.strip():
        return False
    if any(tok in text for tok in PLACEHOLDER_TOKENS):
        return True
    key = placeholder_key(text)
    if not key:
        return True
    squashed = key.replace(" ", "")
    if any(c in squashed for c in PLACEHOLDER_CONTAINS):
        return True
    return squashed in PLACEHOLDER_HANDLES if kind == "handle" else key in PLACEHOLDER_NAMES


def invariants(brand):
    """Rules the JSON schema cannot express. Returns (errors, warnings) as lists of strings."""
    errors, warnings = [], []
    if is_placeholder(brand.get("handle"), "handle"):
        errors.append("handle %r is a stock example, not a real account: write the real one, or leave handle out "
                      "(the slot is then left out of every slide)" % brand.get("handle"))
    if is_placeholder(brand.get("name"), "name"):
        errors.append("name %r is a stock example, not the brand's real name" % brand.get("name"))
    loc = brand.get("locale") or {}
    if loc.get("digits") == "arabic-indic" and not (loc.get("digitsReason") or "").strip():
        errors.append("locale.digits is arabic-indic but locale.digitsReason is empty "
                      "(Arabic-Indic is an opt-in and must record why)")
    app, cue = loc.get("appLanguage"), loc.get("swipeCue")
    expected = locale_defaults()["swipeCue"]["byAppLanguage"].get(app)
    if app and cue and expected and cue != expected:
        warnings.append("swipeCue %s differs from the default for appLanguage %s (%s); fine if chosen on purpose"
                        % (cue, app, expected))
    sections = (brand.get("onboarding") or {}).get("sections") or {}
    if sections and set(sections) != set(SECTIONS):
        errors.append("onboarding.sections must name exactly the six sections")
    return errors, warnings


def check_or_fail(brand):
    errs = schema_errors(brand)
    inv_errors, _ = invariants(brand)
    if errs or inv_errors:
        detail = "; ".join(["%s %s" % (e["path"] or "/", e["message"]) for e in errs[:8]] + inv_errors)
        fail("E_SCHEMA", "refusing to write an invalid brand: " + detail, EXIT_INVALID)


def next_section(brand):
    sections = (brand.get("onboarding") or {}).get("sections") or {}
    for name in SECTIONS:
        if sections.get(name, "todo") == "todo":
            return name
    return "close"


def progress(brand):
    sections = (brand.get("onboarding") or {}).get("sections") or {}
    counts = {"done": 0, "skipped": 0, "todo": 0, "total": len(SECTIONS)}
    for name in SECTIONS:
        counts[sections.get(name, "todo")] += 1
    return counts


# ----------------------------------------------------------------------------- new
def infer_app_language(countries, dialect, defaults):
    langs = {defaults["countries"][c]["appLanguage"] for c in countries if c in defaults["countries"]}
    if len(langs) == 1:
        return langs.pop()
    if len(langs) > 1 or countries:
        return "mixed"
    return "en" if dialect == "en" else "ar"


def cmd_new(args):
    if not args.slug or not args.name or not args.dialect:
        fail("E_USAGE", "new needs --slug, --name and --dialect", EXIT_USAGE)
    p = brand_path(args, args.slug)
    if p.exists():
        fail("E_CONFLICT", "brand %r already exists at %s" % (args.slug, p), EXIT_CONFLICT)
    defaults = locale_defaults()
    countries = [c.strip().upper() for c in (args.country or "").split(",") if c.strip()]
    for c in countries:
        if not re.match(r"^[A-Z]{2}$", c):
            fail("E_USAGE", "bad country code %r (use ISO codes such as EG,AE)" % c, EXIT_USAGE)
    app = args.app_language or infer_app_language(countries, args.dialect, defaults)
    cue = defaults["swipeCue"]["byAppLanguage"][app]
    stamp = now_iso()
    locale = {
        "dialect": args.dialect,
        "uiDialect": args.ui_dialect or args.dialect,
        "register": defaults["register"]["defaults"][args.dialect],
        "digits": defaults["digits"]["default"],
        "digitsReason": defaults["digits"]["evidence"]["ar"],
        "appLanguage": app,
        "swipeCue": cue,
    }
    if countries:
        locale["countries"] = countries
    if args.sub_variety:
        locale["subVariety"] = args.sub_variety
    brand = {
        "schemaVersion": 1,
        "id": "brand-%s-%s" % (args.slug, secrets.token_hex(3)),
        "slug": args.slug,
        "name": args.name,
        "kind": args.kind,
        "version": 1,
        "createdAt": stamp,
        "updatedAt": stamp,
        "locale": locale,
        "onboarding": {"sections": {s: "todo" for s in SECTIONS}, "current": "identity"},
    }
    if args.handle:
        brand["handle"] = args.handle
    check_or_fail(brand)
    out = save_brand(args, brand)
    emit(args, {"ok": True, "slug": args.slug, "path": str(out), "id": brand["id"], "next": "identity"},
         "تم إنشاء البراند %s ← %s" % (args.slug, out))
    return EXIT_OK


# ----------------------------------------------------------------------------- get / set
def cmd_get(args):
    brand = load_brand(args, args.slug)
    value = get_path(brand, args.path) if args.path else brand
    if args.format == "json" or isinstance(value, (dict, list)):
        print(json.dumps(value, ensure_ascii=False, indent=None if args.format == "json" else 2))
    else:
        print(value)
    return EXIT_OK


def cmd_set(args):
    brand = load_brand(args, args.slug)
    if args.json is not None:
        try:
            value = json.loads(args.json)
        except ValueError as exc:
            fail("E_SCHEMA", "--json is not valid JSON: %s" % exc, EXIT_DATA)
    elif args.value is not None:
        value = args.value
    else:
        fail("E_USAGE", "set needs --json or --value", EXIT_USAGE)
    set_path(brand, args.path, value)
    brand["updatedAt"] = now_iso()
    check_or_fail(brand)
    save_brand(args, brand)
    emit(args, {"ok": True, "slug": args.slug, "path": args.path}, "تم تحديث %s" % args.path)
    return EXIT_OK


# ----------------------------------------------------------------------------- sections
def cmd_save_section(args):
    if args.section not in SECTIONS:
        fail("E_USAGE", "--section must be one of: %s" % ", ".join(SECTIONS), EXIT_USAGE)
    brand = load_brand(args, args.slug)
    src = Path(args.file)
    if not src.exists():
        fail("E_USAGE", "section file %s not found" % src, EXIT_MISSING)
    try:
        patch = paths.read_json(src)
    except ValueError as exc:
        fail("E_SCHEMA", "cannot parse %s: %s" % (src, exc), EXIT_DATA)
    if not isinstance(patch, dict):
        fail("E_SCHEMA", "the section file must hold a JSON object", EXIT_DATA)
    allowed = SECTION_KEYS[args.section]
    stray = [k for k in patch if k not in allowed]
    if stray:
        fail("E_USAGE", "section %s may only write %s; refused: %s" % (args.section, ", ".join(allowed), ", ".join(stray)),
             EXIT_USAGE)
    before_app = (brand.get("locale") or {}).get("appLanguage")
    deep_merge(brand, patch)
    loc = brand.get("locale") or {}
    explicit_cue = isinstance(patch.get("locale"), dict) and "swipeCue" in patch["locale"]
    if loc.get("appLanguage") != before_app and not explicit_cue:
        loc["swipeCue"] = locale_defaults()["swipeCue"]["byAppLanguage"][loc["appLanguage"]]
    onboarding = brand.setdefault("onboarding", {"sections": {s: "todo" for s in SECTIONS}})
    onboarding["sections"][args.section] = args.status
    onboarding["current"] = next_section(brand)
    brand["updatedAt"] = now_iso()
    check_or_fail(brand)
    save_brand(args, brand)
    prog = progress(brand)
    emit(args, {"ok": True, "slug": args.slug, "section": args.section, "status": args.status,
                "next": onboarding["current"], "progress": prog},
         "تم حفظ قسم «%s» (%s). التالي: %s" % (SECTION_LABEL[args.section], args.status,
                                              SECTION_LABEL.get(onboarding["current"], "الاعتماد")))
    return EXIT_OK


def cmd_resume(args):
    brand = load_brand(args, args.slug)
    sections = (brand.get("onboarding") or {}).get("sections") or {}
    nxt = next_section(brand)
    gaps = [s for s in SECTIONS if sections.get(s, "todo") != "done"]
    prog = progress(brand)
    index = SECTIONS.index(nxt) + 1 if nxt in SECTIONS else None
    data = {"slug": args.slug, "next": nxt, "index": index, "sections": {s: sections.get(s, "todo") for s in SECTIONS},
            "progress": prog, "gaps": gaps, "approved": bool(brand.get("approvedAt"))}
    if nxt == "close":
        text = "كل الأقسام مغلقة. الناقص: %s" % ("، ".join(SECTION_LABEL[g] for g in gaps) or "لا شيء")
    else:
        text = "القسم %d من %d: %s" % (index, len(SECTIONS), SECTION_LABEL[nxt])
    emit(args, data, text)
    return EXIT_OK


# ----------------------------------------------------------------------------- list / use
def default_slug(args):
    f = root_dir(args) / ".default"
    if f.exists():
        return paths.read_text(f).strip() or None
    return None


def cmd_list(args):
    base = root_dir(args) / "brands"
    default = default_slug(args)
    rows = []
    if base.exists():
        for d in sorted(base.iterdir()):
            f = d / "brand.json"
            if not f.is_file():
                continue
            try:
                b = paths.read_json(f)
            except (ValueError, OSError):
                rows.append({"slug": d.name, "error": "unreadable"})
                continue
            rows.append({"slug": b.get("slug", d.name), "name": b.get("name"), "kind": b.get("kind"),
                         "dialect": (b.get("locale") or {}).get("dialect"), "version": b.get("version"),
                         "approved": bool(b.get("approvedAt")), "current": (b.get("onboarding") or {}).get("current"),
                         "updatedAt": b.get("updatedAt"), "default": b.get("slug", d.name) == default})
    lines = ["%s %s  %s  %s" % ("*" if r.get("default") else " ", r["slug"], r.get("name", ""), r.get("dialect", ""))
             for r in rows] or ["لا توجد براندات بعد."]
    emit(args, {"default": default, "brands": rows}, "\n".join(lines))
    return EXIT_OK


def cmd_use(args):
    if not args.slug:
        d = default_slug(args)
        emit(args, {"default": d}, d or "-")
        return EXIT_OK
    brand_path(args, args.slug)
    load_brand(args, args.slug)
    try:
        paths.write_text(root_dir(args) / ".default", args.slug + "\n")
    except OSError as exc:
        fail("E_ABORTED", "cannot write default: %s" % exc, EXIT_WRITE)
    emit(args, {"ok": True, "default": args.slug}, "البراند الافتراضي الآن: %s" % args.slug)
    return EXIT_OK


# ----------------------------------------------------------------------------- validate / migrate
def cmd_validate(args):
    brand = load_brand(args, args.slug)
    errs = schema_errors(brand)
    inv_errors, warnings = invariants(brand)
    ok = not errs and not inv_errors
    data = {"ok": ok, "slug": args.slug, "errors": errs, "invariants": inv_errors, "warnings": warnings}
    lines = ["OK" if ok else "INVALID"]
    lines += ["  %s %s: %s" % (e["keyword"], e["path"] or "/", e["message"]) for e in errs]
    lines += ["  invariant: %s" % m for m in inv_errors] + ["  warning: %s" % m for m in warnings]
    emit(args, data, "\n".join(lines))
    return EXIT_OK if ok else EXIT_INVALID


TONE_RENAMES = {"formal_friendly": "formalFriendly", "serious_playful": "seriousPlayful", "calm_energetic": "calmEnergetic"}


def migrate_doc(doc):
    """Upgrade a brand document to schemaVersion 1. Returns the list of changes made."""
    changes = []
    version = doc.get("schemaVersion")
    if isinstance(version, int) and version > 1:
        fail("E_SCHEMA", "brand.json is schemaVersion %d, newer than this plugin understands" % version, EXIT_DATA)
    if version is None:  # the pre-contract draft shape
        doc["schemaVersion"] = 1
        changes.append("schemaVersion: set to 1")
        tone = (doc.get("voice") or {}).get("tone")
        if isinstance(tone, dict):
            for old, new in TONE_RENAMES.items():
                if old in tone:
                    tone[new] = tone.pop(old)
                    changes.append("voice.tone.%s -> %s" % (old, new))
        fonts = (doc.get("visual") or {}).get("fonts")
        if isinstance(fonts, dict) and isinstance(fonts.get("userFonts"), list):
            ids = [f["assetId"] if isinstance(f, dict) and "assetId" in f else f for f in fonts["userFonts"]]
            if ids != fonts["userFonts"]:
                fonts["userFonts"] = ids
                changes.append("visual.fonts.userFonts: objects -> asset ids")
        priors = (doc.get("hooks") or {}).get("familyPriors")
        if isinstance(priors, dict):
            for fam, p in priors.items():
                if isinstance(p, dict) and "_" in str(p.get("metric", "")):
                    p["metric"] = p["metric"].replace("_", "-")
                    changes.append("hooks.familyPriors.%s.metric: kebab-case" % fam)
    doc.setdefault("kind", "creator")
    doc.setdefault("version", 1)
    onboarding = doc.setdefault("onboarding", {})
    sections = onboarding.setdefault("sections", {})
    for name in SECTIONS:
        if name not in sections:
            sections[name] = "todo"
            changes.append("onboarding.sections.%s: added as todo" % name)
    return changes


def cmd_migrate(args):
    brand = load_brand(args, args.slug)
    changes = migrate_doc(brand)
    if changes:
        brand["updatedAt"] = now_iso()
        check_or_fail(brand)
        save_brand(args, brand)
    emit(args, {"ok": True, "slug": args.slug, "changes": changes},
         "\n".join(changes) if changes else "البراند على أحدث نسخة.")
    return EXIT_OK


# ----------------------------------------------------------------------------- capsule / hash
TONE_WORDS = (("formalFriendly", "friendly"), ("seriousPlayful", "playful"), ("calmEnergetic", "energetic"))


def _fit_words(label, words, budget):
    """' | label: a، b، c' using as many whole words as fit in `budget` characters ('' if none fit)."""
    taken = []
    for w in words:
        seg = " | %s: %s" % (label, "، ".join(taken + [w]))
        if len(seg) > budget:
            break
        taken.append(w)
    return " | %s: %s" % (label, "، ".join(taken)) if taken else ""


def voice_line(brand, limit=CAPSULE_VOICE_MAX):
    """Tone scales, then the words to use and avoid; each list gets a fair share and never loses a word half-way."""
    voice = brand.get("voice") or {}
    tone = voice.get("tone") or {}
    head = ", ".join("%s %d/5" % (word, tone[key]) for key, word in TONE_WORDS if key in tone)
    rest = limit - len(head)
    use, avoid = voice.get("use") or [], voice.get("avoid") or []
    use_seg = _fit_words("use", use, (rest + 1) // 2 if avoid else rest)
    avoid_seg = _fit_words("avoid", avoid, rest - len(use_seg))
    line = (head + use_seg + avoid_seg).lstrip(" |").strip()
    return line or "-"


def build_capsule(brand):
    loc = brand.get("locale") or {}
    vis = brand.get("visual") or {}
    pal = vis.get("palette") or {}
    fonts = vis.get("fonts") or {}
    palette = ("bg %s ink %s accent %s" % (pal["bg"], pal["ink"], pal["accent"])
               if all(k in pal for k in ("bg", "ink", "accent")) else "-")
    font_ids = " / ".join(f for f in (fonts.get("display"), fonts.get("body"), fonts.get("latin")) if f) or "-"
    lines = [
        "[Carousel Studio brand capsule v1]",
        "brand: %s (%s) | dialect: %s | register: %s | digits: %s | swipe: %s" % (
            brand.get("name", ""), brand.get("slug", ""), loc.get("dialect", "-"), loc.get("register", "-"),
            loc.get("digits", "-"), loc.get("swipeCue", "-")),
        "voice: " + voice_line(brand),
        "palette: %s | fonts: %s | preset: %s" % (palette, font_ids, vis.get("presetId") or "-"),
        "home: %s" % (brand.get("homeUrl") or "-"),
    ]
    text = "\n".join(lines) + "\n"
    if len(text.encode("utf-8")) > CAPSULE_MAX_BYTES:
        fail("E_SCHEMA", "capsule exceeds %d bytes; shorten the brand name or the voice lists" % CAPSULE_MAX_BYTES, EXIT_INVALID)
    return text


def cmd_capsule(args):
    brand = load_brand(args, args.slug)
    text = build_capsule(brand)
    if args.format == "json":
        print(json.dumps({"slug": args.slug, "bytes": len(text.encode("utf-8")), "capsule": text}, ensure_ascii=False))
    else:
        sys.stdout.write(text)
    return EXIT_OK


def cmd_snapshot_hash(args):
    brand = load_brand(args, args.slug)
    h = canon.hash16(canon.brand_snapshot(brand))
    emit(args, {"slug": args.slug, "snapshotHash": h}, h)
    return EXIT_OK


# ----------------------------------------------------------------------------- import / approve
def cmd_import(args):
    src = Path(args.file)
    if not src.exists():
        fail("E_USAGE", "file %s not found" % src, EXIT_MISSING)
    try:
        brand = paths.read_json(src)
    except ValueError as exc:
        fail("E_SCHEMA", "cannot parse %s: %s" % (src, exc), EXIT_DATA)
    if not isinstance(brand, dict) or not brand.get("slug"):
        fail("E_SCHEMA", "not a brand.json (no slug)", EXIT_DATA)
    migrate_doc(brand)
    target = brand_path(args, brand["slug"])
    if target.exists() and not args.overwrite:
        fail("E_CONFLICT", "brand %r already exists; pass --overwrite to replace it" % brand["slug"], EXIT_CONFLICT)
    check_or_fail(brand)
    save_brand(args, brand)
    emit(args, {"ok": True, "slug": brand["slug"], "path": str(target)}, "تم استيراد البراند %s" % brand["slug"])
    return EXIT_OK


def cmd_approve(args):
    brand = load_brand(args, args.slug)
    stamp = now_iso()
    if brand.get("approvedAt"):  # a re-approval starts a new Brand Book version
        brand["version"] = int(brand.get("version", 1)) + 1
    brand["approvedAt"] = stamp
    onboarding = brand.setdefault("onboarding", {"sections": {s: "todo" for s in SECTIONS}})
    onboarding["bookApprovedAt"] = stamp
    onboarding["current"] = "close"
    brand["updatedAt"] = stamp
    check_or_fail(brand)
    save_brand(args, brand)
    notes = [] if brand.get("handle") else ["no handle: the handle slot is left out of every slide until one is set"]
    emit(args, {"ok": True, "slug": args.slug, "version": brand["version"], "approvedAt": stamp, "warnings": notes},
         "تم اعتماد كتاب البراند (النسخة %d)" % brand["version"] + ("\n  ملاحظة: لا يوجد حساب، فسيُترك مكانه فارغًا في كل السلايدات" if notes else ""))
    return EXIT_OK


# ----------------------------------------------------------------------------- creative memory
MEMORY_MAX = 30
MEMORY_RECENT = 5


def cmd_remember(args):
    """Append one post to the creative team's memory (the last 30 are kept, newest last)."""
    brand = load_brand(args, args.slug)
    if args.json is None and not args.file:
        fail("E_USAGE", "remember needs --json or --file", EXIT_USAGE)
    try:
        entry = json.loads(args.json) if args.json is not None else paths.read_json(args.file)
    except (ValueError, OSError) as exc:
        fail("E_SCHEMA", "the memory entry is not readable JSON: %s" % exc, EXIT_DATA)
    if not isinstance(entry, dict):
        fail("E_SCHEMA", "the memory entry must be a JSON object", EXIT_DATA)
    entry.setdefault("date", now_iso()[:10])
    # the same post replaces its earlier entry, so approving a revision twice never writes it twice
    memory = [e for e in brand.get("creativeMemory") or [] if e.get("postId") != entry.get("postId")]
    memory.append(entry)
    brand["creativeMemory"] = memory[-MEMORY_MAX:]
    brand["updatedAt"] = now_iso()
    check_or_fail(brand)
    save_brand(args, brand)
    emit(args, {"ok": True, "slug": args.slug, "count": len(brand["creativeMemory"])},
         "اتسجّل البوست في ذاكرة البراند (%d من %d)" % (len(brand["creativeMemory"]), MEMORY_MAX))
    return EXIT_OK


def memory_summary(memory):
    """What the Creative Director reads at the brief.

    rest       the values both of the last two posts used (a third time would repeat it three posts running)
    familyAvoid  the hook families of the last two posts (the hook engine drops a family used in either of them)
    ctaAvoid   the call-to-action kinds of the last two posts (the next post uses another kind)
    hooks      the winning covers of the last five posts (the next cover must not echo them)
    pitchBias  'safe' or 'bold' when the creator chose that direction in at least 3 of the last 4 posts that had one, else None
    series     the series of the latest post that has one: {name, count} (count = consecutive latest posts in it)
    killed     the ideas the team killed, with the reason (not to be offered again)
    loved, rejected   what the creator loved or rejected in the last five posts
    """
    recent = memory[-MEMORY_RECENT:]
    rest = {}
    for key in ("family", "move", "motion", "preset", "intent"):
        last_two = [e.get(key) for e in memory[-2:]]
        if len(last_two) == 2 and last_two[0] and last_two[0] == last_two[1]:
            rest[key] = last_two[0]
    cta_avoid, family_avoid = [], []
    for e in memory[-2:]:
        if e.get("cta") and e["cta"] not in cta_avoid:
            cta_avoid.append(e["cta"])
        if e.get("family") and e["family"] not in family_avoid:
            family_avoid.append(e["family"])
    picks = [e["pitch"] for e in memory if e.get("pitch")][-4:]
    pitch_bias = next((d for d in ("safe", "bold") if len(picks) >= 4 and picks.count(d) >= 3), None)
    series = None
    for e in reversed(memory):
        if e.get("series"):
            count = 0
            for f in reversed(memory):
                if f.get("series") != e["series"]:
                    break
                count += 1
            series = {"name": e["series"], "count": count}
            break
    return {
        "count": len(memory),
        "recent": recent,
        "rest": rest,
        "familyAvoid": family_avoid,
        "ctaAvoid": cta_avoid,
        "hooks": [e["hook"] for e in recent if e.get("hook")],
        "pitchBias": pitch_bias,
        "series": series,
        "killed": [{"idea": e.get("idea", ""), "why": e.get("rejected", "")} for e in memory if e.get("verdict") == "killed"],
        "loved": [e["loved"] for e in recent if e.get("loved")],
        "rejected": [e["rejected"] for e in recent if e.get("rejected") and e.get("verdict") != "killed"],
    }


def cmd_memory(args):
    """Print what the Creative Director reads at the brief."""
    brand = load_brand(args, args.slug)
    summary = memory_summary(brand.get("creativeMemory") or [])
    if not summary["count"]:
        emit(args, summary, "ذاكرة البراند فاضية: ده أول بوست مع الفريق.")
        return EXIT_OK
    lines = ["ذاكرة البراند: %d بوست" % summary["count"]]
    for e in summary["recent"]:
        lines.append("  %s · %s · %s · %s · %s · %s" % (e.get("date", "-"), e.get("family", "-"), e.get("move", "-"), e.get("motion", "-"), e.get("cta", "-"), e.get("idea", "")))
    if summary["rest"]:
        lines.append("ريّح: " + "، ".join("%s %s" % (k, v) for k, v in summary["rest"].items()))
    if summary["familyAvoid"]:
        lines.append("عائلة هوك مش من: " + "، ".join(summary["familyAvoid"]))
    if summary["ctaAvoid"]:
        lines.append("دعوة مختلفة عن: " + "، ".join(summary["ctaAvoid"]))
    if summary["hooks"]:
        lines.append("آخر الأغلفة (من غير تكرار): " + " | ".join(summary["hooks"]))
    if summary["pitchBias"]:
        lines.append("المبدع بيختار الاتجاه %s في أغلب المرات" % ("الآمن" if summary["pitchBias"] == "safe" else "الجريء"))
    if summary["series"]:
        lines.append("سلسلة مفتوحة: %s (%d)" % (summary["series"]["name"], summary["series"]["count"]))
    if summary["killed"]:
        lines.append("اتلغى: " + " | ".join(k["idea"] for k in summary["killed"]))
    if summary["loved"]:
        lines.append("اتحبّ: " + " | ".join(summary["loved"]))
    if summary["rejected"]:
        lines.append("اتشال: " + " | ".join(summary["rejected"]))
    emit(args, summary, "\n".join(lines))
    return EXIT_OK


# ----------------------------------------------------------------------------- CLI
def build_parser():
    common = Parser(add_help=False)
    common.add_argument("--dir", help="workspace root (default: $CS_WORKSPACE or ~/CarouselStudio)")
    common.add_argument("--format", choices=("text", "json"), default="text")
    top = Parser(prog="brand_io.py", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = top.add_subparsers(dest="cmd", parser_class=Parser)
    sub.required = True

    def add(name, fn, *flags):
        sp = sub.add_parser(name, parents=[common], help=fn.__doc__)
        for spec in flags:
            sp.add_argument(*spec[0], **spec[1])
        sp.set_defaults(func=fn)
        return sp

    slug = (("--slug",), {"help": "brand slug"})
    add("new", cmd_new, slug, (("--name",), {}), (("--dialect",), {"choices": DIALECTS}),
        (("--kind",), {"choices": KINDS, "default": "creator"}),
        (("--country",), {"help": "ISO codes, comma separated (EG,AE)"}),
        (("--app-language",), {"choices": ("ar", "en", "mixed"), "help": "audience Instagram app language"}),
        (("--sub-variety",), {"choices": ("najdi", "hijazi", "emirati", "lebanese", "syrian")}),
        (("--handle",), {}), (("--ui-dialect",), {"choices": DIALECTS}))
    add("get", cmd_get, slug, (("--path",), {"help": "dotted path, e.g. voice.fingerprint.sentLen"}))
    add("set", cmd_set, slug, (("--path",), {"required": True}), (("--json",), {}), (("--value",), {}))
    add("save-section", cmd_save_section, slug, (("--section",), {"required": True}),
        (("--file",), {"required": True}), (("--status",), {"choices": ("done", "skipped"), "default": "done"}))
    add("resume", cmd_resume, slug)
    add("list", cmd_list)
    add("use", cmd_use, slug)
    add("validate", cmd_validate, slug)
    add("migrate", cmd_migrate, slug)
    add("capsule", cmd_capsule, slug)
    add("snapshot-hash", cmd_snapshot_hash, slug)
    add("import", cmd_import, (("--file",), {"required": True}), (("--overwrite",), {"action": "store_true"}))
    add("approve", cmd_approve, slug)
    add("remember", cmd_remember, slug, (("--json",), {"help": "the entry as a JSON object"}), (("--file",), {"help": "a file that holds the entry"}))
    add("memory", cmd_memory, slug)
    return top


def main(argv=None):
    args = build_parser().parse_args(argv)
    if args.cmd in ("get", "set", "save-section", "resume", "validate", "migrate", "capsule", "snapshot-hash",
                    "approve", "remember", "memory") and not args.slug:
        sys.stderr.write("cs-error: E_USAGE: %s needs --slug\n" % args.cmd)
        return EXIT_USAGE
    try:
        rc = args.func(args)
        if rc == EXIT_OK and args.cmd in ("new", "import") and getattr(args, "dir", None):
            paths.remember_workspace(args.dir)  # a session started in another folder finds this brand
        return rc
    except Fail as exc:
        sys.stderr.write("cs-error: %s: %s\n" % (exc.code, exc))
        return exc.exit_code
    except Exception as exc:  # pragma: no cover - last-resort guard
        sys.stderr.write("cs-error: E_ABORTED: internal error: %s: %s\n" % (type(exc).__name__, exc))
        return EXIT_INTERNAL


if __name__ == "__main__":
    sys.exit(main())
