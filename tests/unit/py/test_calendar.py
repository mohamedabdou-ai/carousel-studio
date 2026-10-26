"""Tests for content-plan/scripts/calendar.py (occasions, Hijri table lookups) and its data files.

The skill is copied into a temporary folder the way tools/sync_shared.py would leave it (synced data, schemas and the
_cs package), then the CLI is run as a subprocess, exactly as Claude runs it.

The _cs package is found, in order, in: $CS_PY_PATH (a folder that contains _cs/), the synced copy inside content-plan,
and the canonical copy in carousel-design. If none is complete the tests are skipped.
"""
from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from datetime import date, timedelta
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
SKILLS = REPO / "plugins" / "carousel-studio" / "skills"
PLAN = SKILLS / "content-plan"
DESIGN = SKILLS / "carousel-design"


def find_cs() -> Path | None:
    candidates = []
    if os.environ.get("CS_PY_PATH"):
        candidates.append(Path(os.environ["CS_PY_PATH"]) / "_cs")
    candidates += [PLAN / "scripts" / "_cs", DESIGN / "scripts" / "_cs"]
    for c in candidates:
        if (c / "__init__.py").exists() and (c / "paths.py").exists():
            return c
    return None


def build_skill_root(dest: Path, cs: Path) -> Path:
    """A content-plan folder as the sync tool leaves it."""
    root = dest / "content-plan"
    (root / "scripts").mkdir(parents=True)
    (root / "data" / "schemas").mkdir(parents=True)
    for name in ("calendar.py", "plan.py"):
        shutil.copy2(PLAN / "scripts" / name, root / "scripts" / name)
    for name in ("calendar-2026-28.json", "hijri-ummalqura.json"):
        shutil.copy2(PLAN / "data" / name, root / "data" / name)
    for name in ("platform-instagram.json", "locale-defaults.json"):
        src = PLAN / "data" / name
        shutil.copy2(src if src.exists() else DESIGN / "data" / name, root / "data" / name)
    schema = PLAN / "data" / "schemas" / "plan.schema.json"
    shutil.copy2(schema if schema.exists() else DESIGN / "schemas" / "plan.schema.json", root / "data" / "schemas" / "plan.schema.json")
    shutil.copytree(cs, root / "scripts" / "_cs")
    return root


@unittest.skipIf(find_cs() is None, "the _cs package is not available yet")
class CalendarCli(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls._tmp = tempfile.TemporaryDirectory()
        cls.root = build_skill_root(Path(cls._tmp.name), find_cs())
        cls.script = cls.root / "scripts" / "calendar.py"
        cls.cal = json.loads((cls.root / "data" / "calendar-2026-28.json").read_text(encoding="utf-8"))
        cls.table = json.loads((cls.root / "data" / "hijri-ummalqura.json").read_text(encoding="utf-8"))
        cls.locale = json.loads((cls.root / "data" / "locale-defaults.json").read_text(encoding="utf-8"))

    @classmethod
    def tearDownClass(cls):
        cls._tmp.cleanup()

    def run_cli(self, *args: str):
        env = {**os.environ, "PYTHONUTF8": "1", "PYTHONIOENCODING": "utf-8"}
        p = subprocess.run([sys.executable, str(self.script), *args], capture_output=True, text=True, encoding="utf-8", env=env)
        return p.returncode, p.stdout, p.stderr

    def json_cli(self, *args: str):
        code, out, err = self.run_cli(*args, "--format", "json")
        self.assertEqual(code, 0, err)
        return json.loads(out)

    # ---------------------------------------------------------------- Hijri lookups
    def test_hijri_ramadan_1448_starts_on_the_table_date(self):
        h = self.json_cli("hijri", "--date", "2027-02-08")["hijri"]
        self.assertEqual((h["year"], h["month"], h["day"]), (1448, 9, 1))
        self.assertEqual(h["monthName"]["ar"], "رمضان")

    def test_hijri_day_before_ramadan_is_the_thirtieth_of_shaban(self):
        h = self.json_cli("hijri", "--date", "2027-02-07")["hijri"]
        self.assertEqual((h["month"], h["day"], h["monthLength"]), (8, 30, 30))

    def test_hijri_eids_match_the_research_dates(self):
        self.assertEqual(self.json_cli("hijri", "--date", "2027-03-09")["hijri"]["month"], 10)
        h = self.json_cli("hijri", "--date", "2027-05-16")["hijri"]
        self.assertEqual((h["month"], h["day"]), (12, 10))

    def test_hijri_outside_the_table_is_a_usage_error(self):
        code, _, err = self.run_cli("hijri", "--date", "2031-01-01")
        self.assertEqual(code, 64)
        self.assertIn("cs-error: E_USAGE", err)

    def test_hijri_rejects_a_malformed_date(self):
        self.assertEqual(self.run_cli("hijri", "--date", "08/02/2027")[0], 64)
        self.assertEqual(self.run_cli("hijri", "--date", "2027-02-30")[0], 64)

    def test_hijri_text_output_is_arabic_first(self):
        code, out, _ = self.run_cli("hijri", "--date", "2027-02-08")
        self.assertEqual(code, 0)
        self.assertIn("1 رمضان 1448", out)

    # ---------------------------------------------------------------- occasions
    def test_february_2027_for_saudi_and_egypt(self):
        data = self.json_cli("occasions", "--from", "2027-02-01", "--to", "2027-02-28", "--countries", "SA,EG")
        by_id = {o["id"]: o for o in data["occasions"]}
        ramadan = by_id["ramadan-2027"]
        self.assertEqual((ramadan["start"], ramadan["end"]), ("2027-02-08", "2027-03-08"))
        self.assertEqual(ramadan["confidence"], "±1d")
        self.assertEqual(ramadan["moonCheck"], "2027-02-06")
        self.assertEqual(ramadan["windows"]["planFrom"], "2027-01-11")
        self.assertEqual(ramadan["windows"]["preFrom"], "2027-02-01")
        self.assertEqual(ramadan["windows"]["postTo"], "2027-03-11")
        founding = by_id["saudi-founding-day-2027"]
        self.assertEqual((founding["start"], founding["confidence"]), ("2027-02-22", "exact"))
        self.assertNotIn("uae-national-day-2026", by_id)
        self.assertNotIn("kuwait-national-day-2027", by_id)

    def test_every_matched_country_carries_its_own_flag(self):
        data = self.json_cli("occasions", "--from", "2027-02-08", "--to", "2027-02-08", "--countries", "SA,EG", "--strict")
        ramadan = next(o for o in data["occasions"] if o["id"] == "ramadan-2027")
        self.assertEqual({d["country"] for d in ramadan["dates"]}, {"SA", "EG"})
        self.assertTrue(all(d["confidence"] == "±1d" and d["rule"] == "hijri" for d in ramadan["dates"]))

    def test_strict_keeps_only_occasions_inside_the_range(self):
        lax = self.json_cli("occasions", "--from", "2027-03-01", "--to", "2027-03-02", "--countries", "EG")
        strict = self.json_cli("occasions", "--from", "2027-03-01", "--to", "2027-03-02", "--countries", "EG", "--strict")
        self.assertGreater(lax["count"], strict["count"])
        self.assertTrue(all("in-range" in o["phases"] for o in strict["occasions"]))

    def test_phases_name_the_lead_up(self):
        # 2027-03-09 is Eid al-Fitr; on 2027-03-03 it is inside the 7-day teaser window
        data = self.json_cli("occasions", "--from", "2027-03-03", "--to", "2027-03-03", "--countries", "SA")
        eid = next(o for o in data["occasions"] if o["id"] == "eid-al-fitr-2027")
        self.assertEqual(eid["phase"], "pre")

    def test_mawlid_is_not_offered_to_saudi_arabia(self):
        sa = self.json_cli("occasions", "--from", "2027-08-14", "--to", "2027-08-14", "--countries", "SA", "--strict")
        self.assertNotIn("mawlid-2027", {o["id"] for o in sa["occasions"]})
        eg = self.json_cli("occasions", "--from", "2027-08-14", "--to", "2027-08-14", "--countries", "EG", "--strict")
        self.assertIn("mawlid-2027", {o["id"] for o in eg["occasions"]})

    def test_white_friday_is_the_friday_after_us_thanksgiving(self):
        for year, expected in ((2026, "2026-11-27"), (2027, "2027-11-26"), (2028, "2028-11-24")):
            series = next(s for s in self.cal["series"] if s["key"] == "white-friday")
            inst = next(i for i in series["instances"] if i["year"] == year)
            self.assertEqual(inst["start"], expected)
            self.assertEqual(date.fromisoformat(expected).weekday(), 4)

    def test_kinds_filter(self):
        data = self.json_cli("occasions", "--from", "2026-12-01", "--to", "2026-12-31", "--kinds", "commercial")
        self.assertTrue(data["occasions"])
        self.assertTrue(all(o["kind"] == "commercial" for o in data["occasions"]))

    def test_usage_errors(self):
        self.assertEqual(self.run_cli("occasions", "--from", "2027-02-01", "--to", "2027-01-01")[0], 64)
        self.assertEqual(self.run_cli("occasions", "--from", "2027-01-01", "--to", "2027-02-01", "--kinds", "sport")[0], 64)
        self.assertEqual(self.run_cli("occasions", "--from", "2027-01-01", "--to", "2027-02-01", "--countries", "egypt")[0], 64)
        self.assertEqual(self.run_cli()[0], 64)

    def test_range_outside_the_data_warns_instead_of_failing(self):
        data = self.json_cli("occasions", "--from", "2031-01-01", "--to", "2031-01-31")
        self.assertEqual(data["count"], 0)
        self.assertTrue(data["warnings"])

    # ---------------------------------------------------------------- next
    def test_next_for_egypt_from_late_october_2026(self):
        data = self.json_cli("next", "--country", "EG", "--count", "3", "--from", "2026-10-22")
        self.assertEqual(data["count"], 3)
        starts = [o["start"] for o in data["occasions"]]
        self.assertEqual(starts, sorted(starts))
        self.assertEqual(data["occasions"][0]["id"], "white-friday-2026")
        self.assertEqual(data["occasions"][0]["daysUntil"], 36)

    def test_next_includes_an_occasion_in_progress(self):
        data = self.json_cli("next", "--country", "SA", "--count", "1", "--from", "2027-02-20")
        self.assertEqual(data["occasions"][0]["id"], "ramadan-2027")
        self.assertLess(data["occasions"][0]["daysUntil"], 0)

    def test_next_rejects_a_bad_count(self):
        self.assertEqual(self.run_cli("next", "--country", "EG", "--count", "0")[0], 64)

    # ---------------------------------------------------------------- data integrity
    def hijri_of(self, d: date):
        rows = self.table["months"]
        row = [r for r in rows if date.fromisoformat(r[2]) <= d][-1]
        return row[0], row[1], (d - date.fromisoformat(row[2])).days + 1

    def test_table_is_contiguous_and_covers_the_calendar(self):
        rows = self.table["months"]
        for a, b in zip(rows, rows[1:]):
            self.assertEqual(date.fromisoformat(a[2]) + timedelta(days=a[3]), date.fromisoformat(b[2]), (a, b))
            self.assertIn(a[3], (29, 30))
        self.assertLessEqual(date.fromisoformat(rows[0][2]), date.fromisoformat(self.cal["range"]["from"]))
        self.assertGreaterEqual(date.fromisoformat(self.table["range"]["to"]), date.fromisoformat(self.cal["range"]["to"]))

    def test_every_instance_is_valid(self):
        id_re = re.compile(r"^[a-z0-9][a-z0-9-]{2,47}$")
        known = set(self.locale["countries"])
        lo, hi = date.fromisoformat(self.cal["range"]["from"]), date.fromisoformat(self.cal["range"]["to"])
        seen = set()
        for s in self.cal["series"]:
            self.assertIn(s["kind"], ("religious", "national", "commercial"))
            self.assertIn(s["rule"], self.cal["rules"])
            if s["countries"] != "*":
                self.assertTrue(set(s["countries"]) <= known, s["key"])
            self.assertTrue(set(s.get("exclude", [])) <= known, s["key"])
            self.assertTrue(s["names"]["ar"] and s["names"]["en"])
            for i in s["instances"]:
                oid = f"{s['key']}-{i['year']}"
                self.assertRegex(oid, id_re)
                self.assertNotIn(oid, seen)
                seen.add(oid)
                a, b = date.fromisoformat(i["start"]), date.fromisoformat(i["end"])
                self.assertTrue(lo <= a <= b <= hi, oid)
                self.assertEqual(a.year, i["year"], oid)
        self.assertGreaterEqual(len(self.cal["series"]), 40)

    def test_hijri_instances_agree_with_the_table(self):
        for s in self.cal["series"]:
            if s["rule"] != "hijri":
                continue
            (fm, fd), (tm, td) = s["hijri"]["from"], s["hijri"]["to"]
            for i in s["instances"]:
                a, b = date.fromisoformat(i["start"]), date.fromisoformat(i["end"])
                _, m, d = self.hijri_of(a)
                self.assertEqual((m, d), (fm, fd), (s["key"], i))
                _, m2, d2 = self.hijri_of(b)
                if td == "last":
                    self.assertEqual(m2, tm)
                    self.assertNotEqual(self.hijri_of(b + timedelta(days=1))[1], tm, (s["key"], i))
                else:
                    self.assertEqual((m2, d2), (tm, td), (s["key"], i))

    def test_hijri_series_are_flagged_and_fixed_ones_are_exact(self):
        code, out, _ = self.run_cli("occasions", "--from", "2027-01-01", "--to", "2027-12-31", "--format", "json")
        self.assertEqual(code, 0)
        for o in json.loads(out)["occasions"]:
            self.assertEqual(o["confidence"], "±1d" if o["rule"] == "hijri" else "exact", o["id"])

    def test_ramadan_overlap_with_national_days_in_2027(self):
        by_id = {o["id"]: o for o in self.json_cli("occasions", "--from", "2027-02-01", "--to", "2027-03-31", "--strict")["occasions"]}
        ramadan = by_id["ramadan-2027"]
        for oid in ("saudi-founding-day-2027", "kuwait-national-day-2027", "kuwait-liberation-day-2027"):
            self.assertTrue(ramadan["start"] <= by_id[oid]["start"] <= ramadan["end"], oid)


if __name__ == "__main__":
    unittest.main()
