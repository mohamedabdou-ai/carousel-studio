"""Builds appendix-b.json: the dead-space cases of spec Appendix B with the numbers the oracle produces (V1).

`oracle.py` is the model of research/round3/13-evidence/deadspace_model.py, stored here unchanged (line endings aside). This script
runs it once, translates every model box into the IS-3 Box shape (`txt` -> text, `anc` -> ink, `mark` -> mark, `own` -> an owner whose
content names it in `ownerOf`) and records, per case, the oracle's band, rectangle, fill, anchor share, owner verdicts and occupied
cells. The JavaScript and Python implementations are tested against that file, so neither is judged against itself.

Owner metadata (V1b, strict mode): the model has no fill or border, but a measured owner always has one, so every owner here carries
`fill: 1` (a committed card or plate, opacity 0-1) and every pattern `fill: 0.5`. That is what the collector would report, it qualifies
under the default `strict: true`, and it leaves every verdict of the oracle unchanged (the same cells as the legacy reading).

The base cases run on the default zone (852 x 888). Three more run on the computed zones of poster (840 high) and heritage (844 high):
the oracle is executed again with its zone constant replaced, which is how it is meant to be used for those presets.

Usage: python -X utf8 make_cases.py [--check]     (--check compares the file with a fresh run and exits 1 when they differ)
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ORACLE = HERE / "oracle.py"
OUT = HERE / "appendix-b.json"


def load(height: int) -> dict:
    """The oracle namespace with its zone height set to `height` (888 leaves the file as it is)."""
    src = ORACLE.read_text(encoding="utf-8")
    if height != 888:
        src = src.replace("W, H = 852, 888", f"W, H = 852, {height}", 1)
    ns = {"__name__": "oracle_zone_%d" % height}
    exec(compile(src, str(ORACLE), "exec"), ns)  # noqa: S102 - our own stored model, not user input
    return ns


def slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:72]


def to_boxes(model_boxes: list, not_anchor: set | None = None) -> list:
    """Model tuples -> Box dicts (body-zone px). Owners get ids o1, o2...; their content names the owner in ownerOf.
    Ink the oracle leaves out of an explicit anchor-share list (the arrow between the panels of A.3) is marked anchor: false."""
    out, counter = [], [0]
    not_anchor = not_anchor or set()

    def emit(b, owner=None):
        kind = b[0]
        if kind == "own":
            counter[0] += 1
            oid = "o%d" % counter[0]
            box = {"kind": "owner", "id": oid, "x": b[1], "y": b[2], "w": b[3], "h": b[4], "fill": 1}
            if b[6] == "pattern":
                box["kind"], box["fill"] = "pattern", 0.5
            if owner:
                box["ownerOf"] = owner
            out.append(box)
            for c in b[5] or []:
                emit(c, oid)
            return
        box = {"kind": {"txt": "text", "anc": "ink", "mark": "mark"}[kind], "x": b[1], "y": b[2], "w": b[3], "h": b[4]}
        if owner:
            box["ownerOf"] = owner
        if kind == "anc" and (b[1], b[2], b[3], b[4]) in not_anchor:
            box["anchor"] = False
        out.append(box)

    for b in model_boxes:
        emit(b)
    return out


def anchor_rects(model_boxes: list) -> list:
    """Every anchor box of a case: owners (the container counts) and ink, at any depth. Text and marks are not anchors."""
    out = []
    for b in model_boxes:
        if b[0] in ("anc", "own"):
            out.append((b[1], b[2], b[3], b[4]))
        if b[0] == "own":
            out.extend(anchor_rects([c for c in (b[5] or []) if c[0] != "txt"]))
    return out


def all_anc(model_boxes: list) -> list:
    out = []
    for b in model_boxes:
        if b[0] == "anc":
            out.append((b[1], b[2], b[3], b[4]))
        elif b[0] == "own":
            out.extend(all_anc(b[5] or []))
    return out


def inside(r: tuple, s: tuple) -> bool:
    return r[0] >= s[0] and r[1] >= s[1] and r[0] + r[2] <= s[0] + s[2] and r[1] + r[3] <= s[1] + s[3]


def variant_cases(ns: dict, tag: str) -> dict:
    """Cases for a shorter zone: the same layouts as the Appendix B rows they are named after, re-fitted to the zone height."""
    txt, anc, own = ns["txt"], ns["anc"], ns["own"]
    h = ns["H"]
    if tag == "poster-840":
        return {
            "poster 840: recipe under, a scene that fills the remainder": [own(0, 0, 852, 400, [anc(120, 30, 600, 340)]), txt(212, 448, 640, 194), txt(212, 666, 640, 148)],
            "poster 840: cheat, a lone 300 px icon on an 852x330 panel": [txt(212, 0, 640, 194), txt(212, 218, 640, 148), own(0, 430, 852, 330, [anc(276, 445, 300, 300)])],
        }
    return {
        "heritage 844: recipe start, a pillar of 3 stacked tiles, text centred": [
            own(580, 0, 272, h, [anc(612, 38, 208, 208), anc(612, 298, 208, 208), anc(612, 558, 208, 208)]), txt(40, 198, 520, 194), txt(40, 416, 520, 296)],
    }


def build() -> dict:
    cases = []

    def add(ns, name, model_boxes, shares=None):
        ns_metrics = ns["metrics"](model_boxes)
        _, notes = ns["rects_for"](model_boxes)
        grid = ns["occupancy"](model_boxes)
        rects = shares if shares is not None else anchor_rects(model_boxes)
        left_out = {r for r in all_anc(model_boxes) if shares is not None and not any(inside(r, s) for s in shares)}
        cases.append({
            "id": slug(name), "name": name, "zone": {"w": ns["W"], "h": ns["H"]},
            "boxes": to_boxes(model_boxes, left_out),
            "expect": {
                "band": ns_metrics["band_pct_canvas"], "rect": ns_metrics["ler_pct_zone"], "fill": ns_metrics["empty_cells_pct"],
                "anchorShare": ns["anchor_share"](rects) if rects else 0.0,
                "ownerOk": [n["ok"] for n in notes],
                "cells": ["".join("#" if c else "." for c in row) for row in grid],
            },
        })

    base = load(888)
    for name, model_boxes in base["CASES"].items():
        shares = base["SHARES"].get(name)
        add(base, name, model_boxes, shares)
    for tag, h in (("poster-840", 840), ("heritage-844", 844)):
        ns = load(h)
        for name, model_boxes in variant_cases(ns, tag).items():
            add(ns, name, model_boxes)
    return {"schema": 1, "oracle": "oracle.py (13-evidence/deadspace_model.py, revision 2)", "cases": cases}


def dump(doc: dict) -> str:
    """One box per line, one expected row per line: readable diffs, no tool needed to review a case."""
    def one(v):
        return json.dumps(v, ensure_ascii=False, separators=(", ", ": "))

    lines = ['{"schema": %d, "oracle": %s, "cases": [' % (doc["schema"], one(doc["oracle"]))]
    for i, c in enumerate(doc["cases"]):
        e = c["expect"]
        lines.append(' {"id": %s, "name": %s, "zone": %s, "boxes": [' % (one(c["id"]), one(c["name"]), one(c["zone"])))
        lines.append(",\n".join("  " + one(b) for b in c["boxes"]))
        lines.append(" ], \"expect\": {\"band\": %s, \"rect\": %s, \"fill\": %s, \"anchorShare\": %s, \"ownerOk\": %s, \"cells\": [" % (
            one(e["band"]), one(e["rect"]), one(e["fill"]), one(e["anchorShare"]), one(e["ownerOk"])))
        lines.append(",\n".join("  " + one(r) for r in e["cells"]))
        lines.append(" ]}}" + ("," if i < len(doc["cases"]) - 1 else ""))
    lines.append("]}")
    return "\n".join(lines) + "\n"


def main(argv: list) -> int:
    text = dump(build())
    if "--check" in argv:
        same = OUT.exists() and OUT.read_text(encoding="utf-8") == text
        print("appendix-b.json is current" if same else "appendix-b.json differs from a fresh oracle run")
        return 0 if same else 1
    OUT.write_text(text, encoding="utf-8", newline="\n")
    print("wrote %s (%d cases, %d bytes)" % (OUT, len(json.loads(text)["cases"]), len(text.encode("utf-8"))))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
