"""QA summary and report (CONTRACT 7.6 and 9.4). Twin of ``src/qa/report.js``: the Markdown is byte-identical for the same report.

``summarize`` decides ``pass | fix | block`` and the CLI exit code (0, 1, 2). ``to_report`` builds ``qa-report.json``
(``qa-report.schema.json``); ``to_markdown`` renders the same report for people. Messages never contain the owner's name.
"""
from __future__ import annotations

import copy
import re
from datetime import datetime, timezone

from . import rules

ENGINE = "cs-1.1.0"
SEV_RANK = {"BLOCK": 0, "FIX": 1, "NOTE": 2}
CAP_RESULTS = 600
_PLACEHOLDER = re.compile(r"\{([A-Za-z0-9_]+)\}")


def format_msg(template: str, params: dict | None) -> str:
    """Replace ``{name}`` placeholders; an unknown placeholder stays as written."""
    values = params or {}

    def sub(m):
        v = values.get(m.group(1))
        return m.group(0) if v is None else str(v)

    return _PLACEHOLDER.sub(sub, str(template))


def is_overridable(rule_id: str) -> bool:
    """``C1.*``, ``C2.body-hard``, the C2 length checks on the creator's words, ``C3.*``, ``O1.*``: what ``qa-rules.json`` marks ``overridable``."""
    idx = rules.index()
    entry = idx["checks"].get(rule_id)
    if entry:
        chk, gate = entry["def"], entry["gate"]
        return chk["overridable"] is True if "overridable" in chk else gate.get("overridable") is True
    gate = idx["gates"].get(str(rule_id).split(".")[0])
    return bool(gate and gate.get("dynamicRules") is True and gate.get("overridable") is True)


def _overridden_by(result: dict, overrides) -> bool:
    if isinstance(result.get("overridden"), dict):
        return True
    for o in overrides or ():
        if isinstance(o, dict) and (o.get("gate") == result.get("gate") or o.get("rule") == result.get("rule")) \
                and (not o.get("slide") or o.get("slide") == result.get("slide")):
            return True
    return False


def summarize(results: list[dict], overrides=()) -> dict:
    """``{"status": pass|fix|block, "counts": {block, fix, note}, "exitCode": 0|1|2}`` (overridden findings do not count)."""
    counts = {"block": 0, "fix": 0, "note": 0}
    for r in results:
        if overrides:
            skip = _overridden_by(r, overrides) if is_overridable(r.get("rule")) else isinstance(r.get("overridden"), dict)
        else:
            skip = isinstance(r.get("overridden"), dict)
        if skip:
            continue
        counts[str(r.get("sev")).lower()] += 1
    status = "block" if counts["block"] else "fix" if counts["fix"] else "pass"
    return {"status": status, "counts": counts, "exitCode": 2 if counts["block"] else 1 if counts["fix"] else 0}


def _now() -> str:
    t = datetime.now(timezone.utc)
    return t.strftime("%Y-%m-%dT%H:%M:%S.") + "%03dZ" % (t.microsecond // 1000)


def to_report(spec: dict, results: list[dict], env: dict | None = None, *, checkpoint: str | None = None, lane: str = "sandbox") -> dict:
    """``qa-report.json`` for ``spec``. ``env`` may carry ``painter userAgent fonts thumbnail video files createdAt``."""
    env = env or {}
    summary = summarize(results)
    rep: dict = {"schemaVersion": 1, "specId": spec.get("id"), "rev": spec.get("rev"), "engine": ENGINE,
                 "createdAt": env.get("createdAt") or _now()}
    cp = checkpoint or env.get("checkpoint") or spec.get("checkpoint")
    if cp:
        rep["checkpoint"] = cp
    lane = env.get("lane") or lane
    if lane:
        rep["lane"] = lane
    rep["status"] = summary["status"]
    rep["exitCode"] = summary["exitCode"]
    rep["counts"] = summary["counts"]
    rep["results"] = [copy.deepcopy(r) for r in results[:CAP_RESULTS]]
    rep["stats"] = copy.deepcopy(getattr(results, "stats", None) or env.get("stats") or {"gates": {}})
    ov = []
    for r in results:
        if isinstance(r.get("overridden"), dict):
            o = {"gate": r["gate"]}
            if r.get("slide"):
                o["slide"] = r["slide"]
            o["reason"] = r["overridden"].get("reason")
            o["at"] = r["overridden"].get("at")
            ov.append(o)
    if ov:
        rep["overrides"] = ov[:100]
    e: dict = {}
    if env.get("painter") in ("svg", "replay", "dom"):
        e["painter"] = env["painter"]
    if isinstance(env.get("userAgent"), str) and env["userAgent"].strip():
        e["userAgent"] = env["userAgent"][:300]
    if isinstance(env.get("fonts"), list) and env["fonts"]:
        e["fonts"] = [str(f)[:80] for f in env["fonts"][:20]]
    locale = spec.get("locale") or {}
    if locale.get("dialect"):
        e["dialect"] = locale["dialect"]
    if locale.get("digits"):
        e["digits"] = locale["digits"]
    if e:
        rep["environment"] = e
    th = env.get("thumbnail")
    if isinstance(th, dict):
        rep["thumbnail"] = {"heroPx": th.get("heroPx"), "pass": bool(th.get("pass")), "localContrast": th.get("localContrast")}
    if isinstance(env.get("video"), dict):
        rep["video"] = env["video"]
    if isinstance(env.get("files"), list) and env["files"]:
        rep["files"] = env["files"][:200]
    return rep


_LABELS = {
    "ar": {
        "title": "تقرير الجودة", "status": "الحالة", "rev": "المراجعة", "checkpoint": "المرحلة", "level": "المستوى", "count": "العدد",
        "none": "لا توجد ملاحظات.", "overrides": "تجاوزات", "environment": "البيئة", "painter": "الرسّام", "dialect": "اللهجة",
        "digits": "الأرقام", "fonts": "الخطوط",
        "statusText": {"pass": "ناجح", "fix": "يحتاج تعديلات", "block": "محظور"},
        "digitNames": {"western": "غربية (123)", "arabic-indic": "هندية (١٢٣)"},
    },
    "en": {
        "title": "QA report", "status": "Status", "rev": "Revision", "checkpoint": "Checkpoint", "level": "Level", "count": "Count",
        "none": "No findings.", "overrides": "Overrides", "environment": "Environment", "painter": "Painter", "dialect": "Dialect",
        "digits": "Digits", "fonts": "Fonts",
        "statusText": {"pass": "Pass", "fix": "Needs fixes", "block": "Blocked"},
        "digitNames": {"western": "Western (123)", "arabic-indic": "Arabic-Indic (١٢٣)"},
    },
}


def to_markdown(report: dict, lang: str = "ar") -> str:
    """``qa-report.md``: same report and language, same bytes as ``CS.qa.report.toMarkdown``."""
    code = "en" if lang == "en" else "ar"
    L = _LABELS[code]
    lines = ["# " + L["title"] + " — " + str(report.get("specId")), ""]
    head = "**" + L["status"] + ":** " + L["statusText"][report["status"]] + " · **" + L["rev"] + ":** " + str(report.get("rev"))
    if report.get("checkpoint"):
        head += " · **" + L["checkpoint"] + ":** " + report["checkpoint"]
    lines += [head, "", "| " + L["level"] + " | " + L["count"] + " |", "|---|---|",
              "| BLOCK | " + str(report["counts"]["block"]) + " |", "| FIX | " + str(report["counts"]["fix"]) + " |",
              "| NOTE | " + str(report["counts"]["note"]) + " |", ""]
    open_results = [r for r in report.get("results", []) if not isinstance(r.get("overridden"), dict)]
    if not open_results:
        lines += [L["none"], ""]
    for sev in ("BLOCK", "FIX", "NOTE"):
        group = [r for r in open_results if r.get("sev") == sev]
        if not group:
            continue
        lines += ["## " + sev, ""]
        for r in group:
            line = "- " + (r.get("slide") or "—") + " · " + r["rule"] + " · " + r["msg"][code]
            if r.get("fix"):
                line += " — " + r["fix"][code]
            lines.append(line)
        lines.append("")
    ov = report.get("overrides") or []
    if ov:
        lines += ["## " + L["overrides"], ""]
        lines += ["- " + str(o["gate"]) + " · " + (o.get("slide") or "—") + " · " + str(o["reason"]) + " (" + str(o["at"]) + ")" for o in ov]
        lines.append("")
    env = report.get("environment") or {}
    env_lines = []
    if env.get("painter"):
        env_lines.append("- " + L["painter"] + ": " + env["painter"])
    if env.get("dialect"):
        env_lines.append("- " + L["dialect"] + ": " + env["dialect"])
    if env.get("digits"):
        env_lines.append("- " + L["digits"] + ": " + L["digitNames"].get(env["digits"], env["digits"]))
    if env.get("fonts"):
        env_lines.append("- " + L["fonts"] + ": " + ", ".join(env["fonts"]))
    if env_lines:
        lines += ["## " + L["environment"], ""] + env_lines + [""]
    while lines and lines[-1] == "":
        lines.pop()
    return "\n".join(lines) + "\n"
