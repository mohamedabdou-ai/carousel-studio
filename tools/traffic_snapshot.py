#!/usr/bin/env python3
"""traffic_snapshot.py - keep GitHub's traffic counters past the 14 days GitHub itself keeps them.

GitHub reports repository views, clones, top referrers and popular paths for the last 14 days only, and release-asset download counts
as running totals. A scheduled job (.github/workflows/traffic.yml) runs this script once a day and merges what GitHub reports into one JSON
file that lives on a separate branch (traffic-data), so the plugin folder and the main branch never carry it.

Only counters are stored: per-day views and clones (total and unique), the ten top referrers and paths of the day, and the download count of
every release asset. GitHub gives no visitor-level data and the script does not ask for any. Repository tooling only: nothing in the plugin
folder reads or writes this file.

Usage:
  traffic_snapshot.py [--repo OWNER/NAME] [--out traffic.json] [--token-env TRAFFIC_TOKEN] [--date YYYY-MM-DD] [--dry-run]

The traffic endpoints need a token with read access to the repository's administration data, which the workflow's default GITHUB_TOKEN does
not have: store a fine-grained token with "Administration: read" in the repository secret TRAFFIC_TOKEN. The token is read from the
environment only and is never printed.
Exit codes: 0 ok, 64 usage, 69 GitHub could not be reached or refused the token, 73 cannot write the file.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

API = "https://api.github.com"
SCHEMA = 1
TOP = 10
EX_OK, EX_USAGE, EX_NET, EX_WRITE = 0, 64, 69, 73
ROOT = Path(__file__).resolve().parent.parent


class TrafficError(Exception):
    def __init__(self, message: str, code: int):
        super().__init__(message)
        self.code = code


def api_get(path: str, token: str):
    request = urllib.request.Request(
        API + path,
        headers={"Accept": "application/vnd.github+json", "Authorization": "Bearer " + token, "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "carousel-studio-traffic-snapshot"},
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        hint = " (the token needs 'Administration: read' on the repository)" if exc.code in (401, 403, 404) else ""
        raise TrafficError(f"GitHub answered {exc.code} for {path}{hint}", EX_NET)
    except (urllib.error.URLError, TimeoutError, ValueError) as exc:
        raise TrafficError(f"cannot reach GitHub for {path}: {exc}", EX_NET)


def collect(repo: str, token: str, get=api_get) -> dict:
    """What GitHub reports today: {views, clones, referrers, paths, releases}."""
    base = f"/repos/{repo}"
    return {
        "views": get(base + "/traffic/views", token),
        "clones": get(base + "/traffic/clones", token),
        "referrers": get(base + "/traffic/popular/referrers", token),
        "paths": get(base + "/traffic/popular/paths", token),
        "releases": get(base + "/releases?per_page=30", token),
    }


def _day(timestamp: str) -> str:
    return str(timestamp)[:10]


def merge(existing: dict | None, data: dict, today: str, repo: str) -> dict:
    """Fold today's report into the stored document. A day that GitHub reports again replaces the stored values (the newest count of a day
    is the most complete); referrers, paths and release totals are snapshots keyed by the day the job ran."""
    doc = existing if isinstance(existing, dict) and existing.get("schemaVersion") == SCHEMA else {"schemaVersion": SCHEMA, "repo": repo, "days": {}, "snapshots": {}}
    doc["repo"] = repo
    days = doc.setdefault("days", {})
    for kind, count_key, unique_key in (("views", "views", "uniqueViews"), ("clones", "clones", "uniqueClones")):
        for item in (data.get(kind) or {}).get(kind, []) or []:
            entry = days.setdefault(_day(item.get("timestamp", "")), {})
            entry[count_key] = int(item.get("count", 0))
            entry[unique_key] = int(item.get("uniques", 0))
    days.pop("", None)
    releases = []
    for release in data.get("releases") or []:
        assets = {a["name"]: int(a.get("download_count", 0)) for a in release.get("assets", []) if a.get("name")}
        releases.append({"tag": release.get("tag_name"), "assets": assets})
    doc.setdefault("snapshots", {})[today] = {
        "referrers": [{"referrer": r.get("referrer"), "count": int(r.get("count", 0)), "uniques": int(r.get("uniques", 0))} for r in (data.get("referrers") or [])[:TOP]],
        "paths": [{"path": r.get("path"), "count": int(r.get("count", 0)), "uniques": int(r.get("uniques", 0))} for r in (data.get("paths") or [])[:TOP]],
        "releases": releases,
    }
    doc["days"] = dict(sorted(days.items()))
    doc["snapshots"] = dict(sorted(doc["snapshots"].items()))
    return doc


def default_repo() -> str:
    try:
        url = json.loads((ROOT / "tools" / "identity.json").read_text(encoding="utf-8")).get("repoUrl", "")
    except (OSError, ValueError):
        return ""
    found = re.match(r"https://github\.com/([^/]+/[^/#?]+)", url)
    return found.group(1) if found else ""


def run(argv=None, get=api_get, environ=None, now=None) -> int:
    environ = os.environ if environ is None else environ
    parser = argparse.ArgumentParser(prog="traffic_snapshot.py", description="Merge GitHub's traffic counters into a JSON file that outlives GitHub's 14 days.")
    parser.add_argument("--repo", default=default_repo(), help="OWNER/NAME (default: the repoUrl in tools/identity.json)")
    parser.add_argument("--out", default="traffic.json", help="the JSON file to create or update")
    parser.add_argument("--token-env", default="TRAFFIC_TOKEN", help="environment variable that holds the token (default TRAFFIC_TOKEN, then GITHUB_TOKEN)")
    parser.add_argument("--date", help="the day to record the snapshot under (default: today, UTC)")
    parser.add_argument("--dry-run", action="store_true", help="print the summary and write nothing")
    try:
        args = parser.parse_args(argv)
    except SystemExit as exc:
        return EX_OK if exc.code == 0 else EX_USAGE
    try:
        if not re.fullmatch(r"[\w.-]+/[\w.-]+", args.repo or ""):
            raise TrafficError("give --repo OWNER/NAME", EX_USAGE)
        today = args.date or (now or datetime.now(timezone.utc)).strftime("%Y-%m-%d")
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", today):
            raise TrafficError("--date must look like 2026-10-22", EX_USAGE)
        token = environ.get(args.token_env) or environ.get("GITHUB_TOKEN") or ""
        if not token:
            raise TrafficError(f"no token: set {args.token_env} (a fine-grained token with Administration: read)", EX_USAGE)
        out = Path(args.out)
        existing = None
        if out.is_file():
            try:
                existing = json.loads(out.read_text(encoding="utf-8"))
            except ValueError:
                raise TrafficError(f"{out} is not valid JSON; fix or remove it", EX_WRITE)
        doc = merge(existing, collect(args.repo, token, get), today, args.repo)
        latest = doc["snapshots"][today]
        print(f"traffic: {len(doc['days'])} days kept; {sum(r['count'] for r in latest['referrers'])} referrals and {len(latest['releases'])} releases recorded for {today}")
        if args.dry_run:
            return EX_OK
        try:
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_text(json.dumps(doc, ensure_ascii=False, indent=1) + "\n", encoding="utf-8", newline="\n")
        except OSError as exc:
            raise TrafficError(f"cannot write {out}: {exc}", EX_WRITE)
        return EX_OK
    except TrafficError as exc:
        print(f"traffic_snapshot: {exc}", file=sys.stderr)
        return exc.code


if __name__ == "__main__":
    sys.exit(run())
