#!/usr/bin/env python3
"""extract_spec.py - read the data of a built Studio page, or apply a Studio patch to a spec.

Usage (CONTRACT 9.2):
  extract_spec.py PAGE.html [--kind spec|brand|config|plan] [-o FILE] [--expect-rev N] [--format json]
  extract_spec.py --apply-patch PATCH.json --spec SPEC.json [-o FILE] [--format json]

Extract: finds the <script type="application/json" id="cs-<kind>"> block (the escapes build_studio.py writes, "<\\/" and "<\\u0021--",
are plain JSON), prints or writes the document. --expect-rev exits 75 when the page holds another rev, which tells the caller (Claude)
that the page changed since it last looked and must be re-read.
Apply: the patch is the "carouselStudioPatch" envelope the Studio copies for the chat. It is applied to SPEC when SPEC.id matches
specId and SPEC.rev equals baseRev (exit 75 otherwise); the result carries rev = baseRev + 1.
Exit codes: 0 ok, 2 result does not match the spec schema (nothing is written then), 64 usage, 65 malformed data, 66 missing file, 73 cannot write, 75 rev conflict.
"""
from __future__ import annotations

import argparse
import copy
import json
import os
import re
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

try:  # _cs belongs to the validation package; this script still works without it
    from _cs import paths as _cs_paths  # type: ignore

    _cs_paths.ensure_utf8_stdio()
except Exception:  # pragma: no cover
    for _stream in (sys.stdout, sys.stderr):
        try:
            _stream.reconfigure(encoding="utf-8")
        except Exception:
            pass

EX_OK, EX_INVALID, EX_USAGE, EX_DATA, EX_MISSING, EX_WRITE, EX_CONFLICT = 0, 2, 64, 65, 66, 73, 75
BLOCK_IDS = {"spec": "cs-spec", "brand": "cs-brand", "config": "cs-config", "plan": "cs-plan"}


class ExtractError(Exception):
    def __init__(self, code: str, message: str, exit_code: int):
        super().__init__(message)
        self.code = code
        self.exit_code = exit_code


def read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except FileNotFoundError:
        raise ExtractError("E_USAGE", f"file not found: {path}", EX_MISSING)
    except UnicodeDecodeError as exc:
        raise ExtractError("E_SCHEMA", f"{path} is not valid UTF-8 ({exc})", EX_DATA)


def read_json(path: Path):
    text = read_text(path)
    if text.startswith("﻿"):
        text = text[1:]
    try:
        return json.loads(text)
    except json.JSONDecodeError as exc:
        raise ExtractError("E_SCHEMA", f"{path} is not valid JSON ({exc})", EX_DATA)


def extract_block(page: str, kind: str):
    block_id = BLOCK_IDS[kind]
    pattern = re.compile(r"<script\b(?=[^>]*\btype=[\"']application/json[\"'])(?=[^>]*\bid=[\"']" + re.escape(block_id) + r"[\"'])[^>]*>(.*?)</script>", re.S | re.I)
    match = pattern.search(page)
    if not match:
        raise ExtractError("E_SCHEMA", f"the page has no '{block_id}' block (is this a built Studio page?)", EX_DATA)
    try:
        return json.loads(match.group(1))
    except json.JSONDecodeError as exc:
        raise ExtractError("E_SCHEMA", f"the '{block_id}' block is not valid JSON ({exc})", EX_DATA)


# ---- JSON patch (RFC 6902 subset: add, remove, replace, test) ------------------------------------------------------------------------

def pointer_parts(path: str) -> list[str]:
    if path == "":
        return []
    if not path.startswith("/"):
        raise ExtractError("E_SCHEMA", f"bad JSON pointer '{path}'", EX_DATA)
    return [part.replace("~1", "/").replace("~0", "~") for part in path[1:].split("/")]


_ARRAY_INDEX = re.compile(r"(0|[1-9][0-9]*)\Z")  # the same grammar as src/lib/patch.js: no sign, no leading zero, ASCII digits only


def array_index(part: str, length: int, allow_end: bool, where: str) -> int:
    """An array position from a pointer segment. '-' (the end of the array) is accepted only when allow_end is set (add)."""
    if part == "-" and allow_end:
        return length
    if len(part) > 12 or not _ARRAY_INDEX.match(part):
        raise ExtractError("E_SCHEMA", f"not an array index at {where}", EX_DATA)
    index = int(part)
    if index > length or (index == length and not allow_end):
        raise ExtractError("E_SCHEMA", f"index out of range at {where}", EX_DATA)
    return index


def _walk(doc, parts: list[str], create: bool = False):
    cur = doc
    for part in parts:
        if isinstance(cur, list):
            cur = cur[array_index(part, len(cur), False, f"'{part}'")]
        elif isinstance(cur, dict):
            if part not in cur:
                raise ExtractError("E_SCHEMA", f"patch path not found at '{part}'", EX_DATA)
            cur = cur[part]
        else:
            raise ExtractError("E_SCHEMA", f"patch path goes through a scalar at '{part}'", EX_DATA)
    return cur


def apply_ops(doc, ops: list[dict]):
    """Apply operations to a deep copy. A failed 'test' is a conflict (exit 75); anything else malformed is exit 65."""
    result = copy.deepcopy(doc)
    for op in ops:
        if not isinstance(op, dict) or op.get("op") not in ("add", "remove", "replace", "test") or not isinstance(op.get("path"), str):
            raise ExtractError("E_SCHEMA", f"bad patch operation: {op!r}", EX_DATA)
        parts = pointer_parts(op["path"])
        if op["op"] == "test":
            current = _walk(result, parts)
            if current != op.get("value"):
                raise ExtractError("E_CONFLICT", f"test failed at {op['path']}", EX_CONFLICT)
            continue
        if not parts:
            raise ExtractError("E_SCHEMA", "patch may not replace the whole document", EX_DATA)
        parent, last = _walk(result, parts[:-1]), parts[-1]
        if isinstance(parent, list):
            if op["op"] == "add":
                parent.insert(array_index(last, len(parent), True, op["path"]), copy.deepcopy(op.get("value")))
            else:
                index = array_index(last, len(parent), False, op["path"])
                if op["op"] == "remove":
                    del parent[index]
                else:
                    parent[index] = copy.deepcopy(op.get("value"))
        elif isinstance(parent, dict):
            if op["op"] == "remove":
                if last not in parent:
                    raise ExtractError("E_SCHEMA", f"cannot remove missing key at {op['path']}", EX_DATA)
                del parent[last]
            elif op["op"] == "replace" and last not in parent:
                raise ExtractError("E_SCHEMA", f"cannot replace missing key at {op['path']}", EX_DATA)
            else:
                parent[last] = copy.deepcopy(op.get("value"))
        else:
            raise ExtractError("E_SCHEMA", f"patch path goes through a scalar at {op['path']}", EX_DATA)
    return result


def apply_envelope(envelope, spec: dict) -> dict:
    if not isinstance(envelope, dict) or envelope.get("carouselStudioPatch") != 1 or not isinstance(envelope.get("patch"), list):
        raise ExtractError("E_SCHEMA", "not a carouselStudioPatch envelope (expected {carouselStudioPatch: 1, specId, baseRev, patch: [...]})", EX_DATA)
    if not isinstance(envelope.get("baseRev"), int) or not isinstance(envelope.get("specId"), str):
        raise ExtractError("E_SCHEMA", "the envelope needs an integer baseRev and a string specId", EX_DATA)
    if envelope["specId"] != spec.get("id"):
        raise ExtractError("E_SCHEMA", f"the patch is for post '{envelope['specId']}', not '{spec.get('id')}'", EX_DATA)
    if envelope["baseRev"] != spec.get("rev"):
        raise ExtractError("E_CONFLICT", f"the patch was made on rev {envelope['baseRev']} but the spec is at rev {spec.get('rev')}", EX_CONFLICT)
    result = apply_ops(spec, envelope["patch"])
    if result.get("rev") == envelope["baseRev"]:  # a patch written by hand: every write bumps rev
        result["rev"] = envelope["baseRev"] + 1
        meta = dict(result.get("meta") or {})
        meta["updatedAt"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        meta["updatedBy"] = "studio"
        result["meta"] = meta
    return result


def validate_spec(spec: dict) -> list[str]:
    try:
        from _cs import schema  # type: ignore
    except Exception:
        return []
    return [f"{e['path']}: {e['message']}" for e in schema.validate_named("spec", spec)]


# ---- cli -------------------------------------------------------------------------------------------------------------------------------

class Parser(argparse.ArgumentParser):
    def error(self, message):
        raise ExtractError("E_USAGE", message, EX_USAGE)


def write_atomic(path: Path, text: str) -> None:
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        fd, tmp = tempfile.mkstemp(prefix=path.name + ".", suffix=".tmp", dir=str(path.parent))
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as handle:
            handle.write(text)
        os.replace(tmp, path)
    except OSError as exc:
        raise ExtractError("E_USAGE", f"cannot write {path}: {exc}", EX_WRITE)


def creator_overrides(doc) -> list:
    """The findings the creator overrode in the Studio, with their reasons. These are decisions: never raise them again."""
    qa = doc.get("qa") if isinstance(doc, dict) else None
    out = []
    for r in (qa.get("results") or []) if isinstance(qa, dict) else []:
        o = r.get("overridden") if isinstance(r, dict) else None
        if isinstance(o, dict):
            out.append({"rule": r.get("rule"), "slide": r.get("slide"), "reason": o.get("reason")})
    return out


def save_summary(doc, decided) -> str:
    """One short block that a reader cannot miss: rev, checkpoint, style, and every override the creator made."""
    if not isinstance(doc, dict):
        return "saved"
    style = (doc.get("style") or {}).get("presetId") if isinstance(doc.get("style"), dict) else None
    lines = [f"rev {doc.get('rev')} · checkpoint {doc.get('checkpoint')} · style {style}"]
    if decided:
        lines.append(f"creator overrides ({len(decided)}), already decided, do not raise them again:")
        lines += [f"  {d['rule']} on {d['slide']}: «{d['reason']}»" for d in decided]
    else:
        lines.append("creator overrides: none")
    return "\n".join(lines)


def main(argv=None) -> int:
    parser = Parser(prog="extract_spec.py", description="Extract data from a built Studio page or apply a Studio patch to a spec.")
    parser.add_argument("page", nargs="?", help="built studio.html or brand-home.html")
    parser.add_argument("--kind", choices=list(BLOCK_IDS), default="spec")
    parser.add_argument("-o", "--out", help="write here instead of stdout")
    parser.add_argument("--expect-rev", type=int, help="exit 75 when the page's spec has another rev")
    parser.add_argument("--apply-patch", help="a carouselStudioPatch envelope (JSON file)")
    parser.add_argument("--spec", help="the spec the patch applies to (with --apply-patch)")
    parser.add_argument("--format", choices=["text", "json"], default="text")
    try:
        args = parser.parse_args(argv)
        if args.apply_patch:
            if not args.spec:
                raise ExtractError("E_USAGE", "--apply-patch needs --spec", EX_USAGE)
            doc = apply_envelope(read_json(Path(args.apply_patch)), read_json(Path(args.spec)))
            kind = "spec"
            problems = validate_spec(doc)
        else:
            if not args.page:
                raise ExtractError("E_USAGE", "give the page to read, or --apply-patch with --spec", EX_USAGE)
            doc = extract_block(read_text(Path(args.page)), args.kind)
            kind = args.kind
            problems = []
            if args.expect_rev is not None:
                if kind != "spec":
                    raise ExtractError("E_USAGE", "--expect-rev only applies to --kind spec", EX_USAGE)
                if doc.get("rev") != args.expect_rev:
                    raise ExtractError("E_CONFLICT", f"the page holds rev {doc.get('rev')}, expected {args.expect_rev}; read the page again", EX_CONFLICT)
        if problems:  # validate before writing: a result that breaks the schema never reaches -o or stdout
            for line in problems[:10]:
                print(f"cs-error: E_SCHEMA: {line}", file=sys.stderr)
            print("cs-error: E_SCHEMA: nothing was written; fix the patch or the spec and run it again", file=sys.stderr)
            return EX_INVALID
        text = json.dumps(doc, ensure_ascii=False, indent=2) + "\n"
        decided = creator_overrides(doc) if kind == "spec" else []
        if args.out:
            write_atomic(Path(args.out), text)
            if args.format == "text":
                print(save_summary(doc, decided))
        elif args.format == "text":
            sys.stdout.write(text)
        if args.format == "json":
            print(json.dumps({"kind": kind, "id": doc.get("id") if isinstance(doc, dict) else None, "rev": doc.get("rev") if isinstance(doc, dict) else None,
                              "out": args.out, "overrides": decided}, ensure_ascii=False))
        return EX_OK
    except ExtractError as exc:
        print(f"cs-error: {exc.code}: {exc}", file=sys.stderr)
        return exc.exit_code


if __name__ == "__main__":
    sys.exit(main())
