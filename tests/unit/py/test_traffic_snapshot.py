"""tools/traffic_snapshot.py: merging GitHub's 14-day counters into a file that keeps them, without the network."""
from __future__ import annotations

import contextlib
import importlib.util
import io
import json
import shutil
import tempfile
import unittest
from pathlib import Path

TOOL = Path(__file__).resolve().parents[3] / "tools" / "traffic_snapshot.py"
spec = importlib.util.spec_from_file_location("traffic_snapshot_under_test", TOOL)
TS = importlib.util.module_from_spec(spec)
spec.loader.exec_module(TS)

REPORT = {
    "/repos/o/r/traffic/views": {"count": 9, "uniques": 4, "views": [
        {"timestamp": "2026-10-20T00:00:00Z", "count": 5, "uniques": 2}, {"timestamp": "2026-10-21T00:00:00Z", "count": 4, "uniques": 2}]},
    "/repos/o/r/traffic/clones": {"count": 3, "uniques": 2, "clones": [{"timestamp": "2026-10-21T00:00:00Z", "count": 3, "uniques": 2}]},
    "/repos/o/r/traffic/popular/referrers": [{"referrer": "google.com", "count": 7, "uniques": 3}] + [{"referrer": f"r{i}.example", "count": 1, "uniques": 1} for i in range(15)],
    "/repos/o/r/traffic/popular/paths": [{"path": "/o/r", "title": "x", "count": 8, "uniques": 4}],
    "/repos/o/r/releases?per_page=30": [{"tag_name": "v1.0.0", "assets": [{"name": "carousel-studio-1.0.0.zip", "download_count": 12}]}],
}


def fake_get(path, token):
    if token != "t0ken":
        raise TS.TrafficError("bad token", TS.EX_NET)
    return json.loads(json.dumps(REPORT[path]))


class TestTraffic(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="cs-traffic-"))
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)
        self.out = self.tmp / "data" / "traffic.json"

    def run_tool(self, *args, token="t0ken"):
        err = io.StringIO()
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(err):
            code = TS.run(["--repo", "o/r", "--out", str(self.out), *args], get=fake_get, environ={"TRAFFIC_TOKEN": token} if token else {})
        return code, err.getvalue()

    def test_first_run_writes_days_and_a_snapshot(self):
        code, _ = self.run_tool("--date", "2026-10-22")
        self.assertEqual(code, 0)
        doc = json.loads(self.out.read_text(encoding="utf-8"))
        self.assertEqual(doc["days"]["2026-10-21"], {"views": 4, "uniqueViews": 2, "clones": 3, "uniqueClones": 2})
        self.assertEqual(doc["days"]["2026-10-20"], {"views": 5, "uniqueViews": 2})
        snap = doc["snapshots"]["2026-10-22"]
        self.assertEqual(len(snap["referrers"]), TS.TOP)
        self.assertEqual(snap["releases"], [{"tag": "v1.0.0", "assets": {"carousel-studio-1.0.0.zip": 12}}])

    def test_a_second_run_keeps_old_days_and_replaces_a_day_that_grew(self):
        self.run_tool("--date", "2026-10-22")
        grown = json.loads(self.out.read_text(encoding="utf-8"))
        grown["days"]["2026-10-01"] = {"views": 1, "uniqueViews": 1}  # a day GitHub no longer reports
        grown["days"]["2026-10-21"]["views"] = 1  # a stale partial count of a day GitHub still reports
        self.out.write_text(json.dumps(grown), encoding="utf-8")
        self.run_tool("--date", "2026-10-23")
        doc = json.loads(self.out.read_text(encoding="utf-8"))
        self.assertEqual(doc["days"]["2026-10-01"], {"views": 1, "uniqueViews": 1}, "history survives")
        self.assertEqual(doc["days"]["2026-10-21"]["views"], 4, "the newest count of a day wins")
        self.assertEqual(sorted(doc["snapshots"]), ["2026-10-22", "2026-10-23"])
        self.assertEqual(list(doc["days"]), sorted(doc["days"]))

    def test_dry_run_writes_nothing_and_the_token_is_never_printed(self):
        code, err = self.run_tool("--dry-run", "--date", "2026-10-22")
        self.assertEqual(code, 0)
        self.assertFalse(self.out.exists())
        self.assertNotIn("t0ken", err)

    def test_missing_token_bad_repo_and_bad_json_have_their_own_exit_codes(self):
        self.assertEqual(self.run_tool(token="")[0], TS.EX_USAGE)
        self.assertEqual(self.run_tool(token="wrong")[0], TS.EX_NET)
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(TS.run(["--repo", "nonsense", "--out", str(self.out)], get=fake_get, environ={"TRAFFIC_TOKEN": "t0ken"}), TS.EX_USAGE)
        self.out.parent.mkdir(parents=True)
        self.out.write_text("not json", encoding="utf-8")
        self.assertEqual(self.run_tool()[0], TS.EX_WRITE)

    def test_the_default_repo_comes_from_identity_json(self):
        self.assertRegex(TS.default_repo(), r"^[\w.-]+/[\w.-]+$")


if __name__ == "__main__":
    unittest.main()
