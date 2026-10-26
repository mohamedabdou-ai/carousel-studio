"""Tests for content-plan/scripts/plan.py (new, show, lint, set-status, add-idea).

The skill is copied into a temporary folder as the sync tool would leave it, and the CLI runs as a subprocess. The _cs
package is found in $CS_PY_PATH, the synced copy inside content-plan, or carousel-design; without one the tests are skipped.
"""
from __future__ import annotations

import copy
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from collections import Counter
from datetime import date, timedelta
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
SKILLS = REPO / "plugins" / "carousel-studio" / "skills"
PLAN = SKILLS / "content-plan"
DESIGN = SKILLS / "carousel-design"
LIST_ARCHS = {"listicle", "steps", "framework", "comparison"}


def find_cs() -> Path | None:
    candidates = []
    if os.environ.get("CS_PY_PATH"):
        candidates.append(Path(os.environ["CS_PY_PATH"]) / "_cs")
    candidates += [PLAN / "scripts" / "_cs", DESIGN / "scripts" / "_cs"]
    for c in candidates:
        if (c / "__init__.py").exists() and (c / "paths.py").exists() and (c / "schema.py").exists():
            return c
    return None


def build_skill_root(dest: Path, cs: Path) -> Path:
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


def make_brand(slug: str, countries: list[str], **kw) -> dict:
    return {
        "schemaVersion": 1, "id": f"brand-{slug}-0001", "slug": slug, "name": "براند تجريبي", "handle": "@yourbrand", "kind": "creator",
        "locale": {"dialect": "eg", "register": "dialect", "digits": "western", "countries": countries, "appLanguage": "ar", "swipeCue": "arrow-rtl"},
        "identity": {"who": "x", "niche": "x", "offer": "x", "goal": kw.get("goal", "followers")},
        "audience": {"persona": "x", "faq": kw.get("faq", [])},
        "strategy": {
            "pillars": kw.get("pillars", [
                {"id": "tools", "name": "أدوات", "share": 0.4, "intents": ["save"]},
                {"id": "stories", "name": "قصص", "share": 0.3, "intents": ["send", "reach"]},
                {"id": "offers", "name": "عروض", "share": 0.3, "intents": ["sell"]}]),
            "postsPerWeek": kw.get("per_week", 4),
            "bestHours": {"tz": "Asia/Dubai", "slots": [{"day": "any", "from": "20:00", "to": "23:00"}]},
        },
    }


DRIVER = r"""
import importlib.util, json, sys
from pathlib import Path

root = Path(sys.argv[1])
sys.path.insert(0, str(root / "scripts"))
spec = importlib.util.spec_from_file_location("cs_plan", root / "scripts" / "plan.py")
plan = importlib.util.module_from_spec(spec)
sys.modules["cs_plan"] = plan
spec.loader.exec_module(plan)
out = []
for brand_file, month, per_week in json.loads(sys.argv[2]):
    brand = json.loads(Path(brand_file).read_text(encoding="utf-8"))
    year, mon = (int(x) for x in month.split("-"))
    built, warnings, _ = plan.build_plan(brand, year, mon, {"per_week": per_week})
    results = plan.lint_plan(built, brand)
    out.append({"brand": brand["slug"], "month": month, "perWeek": per_week, "slots": len(built["slots"]),
                "schemaErrors": plan.schema_errors(built),
                "findings": [r for r in results if r["sev"] != "NOTE"]})
print(json.dumps(out, ensure_ascii=False))
"""


@unittest.skipIf(find_cs() is None, "the _cs package is not available yet")
class PlanCli(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls._tmp = tempfile.TemporaryDirectory()
        base = Path(cls._tmp.name)
        cls.root = build_skill_root(base, find_cs())
        cls.script = cls.root / "scripts" / "plan.py"
        cls.work = base / "work"
        cls.brands = {}
        for slug, countries, kw in (("demo-brand", ["EG", "AE"], {}),
                                    ("gulf-brand", ["SA", "KW", "AE"], {"goal": "clients", "per_week": 5, "faq": ["هل الأداة ببلاش؟"]}),
                                    ("uae-brand", ["AE", "QA", "BH"], {"goal": "clients", "per_week": 5}),
                                    ("bare-brand", [], {"pillars": []})):
            folder = cls.work / "brands" / slug
            folder.mkdir(parents=True)
            f = folder / "brand.json"
            f.write_text(json.dumps(make_brand(slug, countries, **kw), ensure_ascii=False, indent=2), encoding="utf-8")
            cls.brands[slug] = f

    @classmethod
    def tearDownClass(cls):
        cls._tmp.cleanup()

    # ---------------------------------------------------------------- helpers
    def run_cli(self, *args: str):
        env = {**os.environ, "PYTHONUTF8": "1", "PYTHONIOENCODING": "utf-8"}
        p = subprocess.run([sys.executable, str(self.script), *args], capture_output=True, text=True, encoding="utf-8", env=env)
        return p.returncode, p.stdout, p.stderr

    def new_plan(self, brand: str, month: str, *extra: str) -> dict:
        out = self.work / f"{brand}-{month}-{abs(hash(extra)) % 10000}.json"
        code, stdout, err = self.run_cli("new", "--brand", str(self.brands[brand]), "--month", month, "--out", str(out), "--format", "json", *extra)
        self.assertEqual(code, 0, err)
        self.out_file = out
        result = json.loads(stdout)
        self.assertEqual(json.loads(out.read_text(encoding="utf-8")), result["plan"])
        return result["plan"]

    def lint(self, plan: dict, *extra: str):
        f = self.work / "lint-input.json"
        f.write_text(json.dumps(plan, ensure_ascii=False), encoding="utf-8")
        code, out, err = self.run_cli("lint", str(f), "--format", "json", *extra)
        return code, json.loads(out) if out.strip() else {}, err

    @staticmethod
    def week_start(d: date) -> date:
        return d - timedelta(days=(d.weekday() + 1) % 7)

    # ---------------------------------------------------------------- new
    def test_default_output_location_follows_the_brand_folder(self):
        code, out, err = self.run_cli("new", "--brand", str(self.brands["demo-brand"]), "--month", "2027-04")
        self.assertEqual(code, 0, err)
        target = self.brands["demo-brand"].parent / "plans" / "plan-2027-04.json"
        self.assertTrue(target.exists())
        plan = json.loads(target.read_text(encoding="utf-8"))
        self.assertEqual((plan["id"], plan["brandSlug"], plan["period"]), ("plan-demo-brand-2027-04", "demo-brand", "2027-04"))
        self.assertEqual((plan["cadence"]["perWeek"], plan["cadence"]["hours"], plan["cadence"]["tz"]), (4, ["20:30"], "Asia/Dubai"))
        self.assertEqual(set(plan["cadence"]["days"]), {"sun", "tue", "wed", "thu"})

    def test_generated_plan_validates_and_lints_clean(self):
        plan = self.new_plan("demo-brand", "2027-02")
        code, report, err = self.lint(plan, "--brand", str(self.brands["demo-brand"]))
        self.assertEqual(code, 0, report)
        self.assertEqual(report["counts"]["block"], 0)

    def test_dates_weekdays_and_ids(self):
        plan = self.new_plan("demo-brand", "2027-02")
        days = {"sun": 6, "mon": 0, "tue": 1, "wed": 2, "thu": 3, "fri": 4, "sat": 5}
        allowed = {days[d] for d in plan["cadence"]["days"]}
        ids = [s["id"] for s in plan["slots"]]
        self.assertEqual(len(ids), len(set(ids)))
        for s in plan["slots"]:
            d = date.fromisoformat(s["date"])
            self.assertEqual(d.strftime("%Y-%m"), "2027-02")
            self.assertIn(d.weekday(), allowed)
            self.assertRegex(s["id"], r"^w[0-9]+-[0-9]+$")
            self.assertEqual(s["status"], "idea")
        first_sunday = next(s for s in plan["slots"] if s["date"] == "2027-02-07")
        self.assertTrue(first_sunday["id"].startswith("w2-"), first_sunday["id"])  # weeks start on Sunday

    def test_intent_counts_follow_the_goal_mix(self):
        plan = self.new_plan("demo-brand", "2027-04", "--goal", "followers", "--no-occasions")
        n = len(plan["slots"])
        counts = Counter(s["intent"] for s in plan["slots"])
        expected = {"save": 0.40, "send": 0.25, "reach": 0.25, "sell": 0.10}
        for intent, share in expected.items():
            self.assertLessEqual(abs(counts[intent] - share * n), 1.0, (intent, counts, n))

    def test_sixteen_posts_split_six_four_four_two(self):
        plan = self.new_plan("demo-brand", "2027-02", "--goal", "followers")
        self.assertEqual(len(plan["slots"]), 16)
        self.assertEqual(dict(Counter(s["intent"] for s in plan["slots"])), {"save": 6, "send": 4, "reach": 4, "sell": 2})

    def test_every_week_with_two_slots_has_a_save_list(self):
        for brand in ("demo-brand", "gulf-brand"):
            plan = self.new_plan(brand, "2027-02")
            weeks = {}
            for s in plan["slots"]:
                weeks.setdefault(self.week_start(date.fromisoformat(s["date"])), []).append(s)
            for wk, group in weeks.items():
                if len(group) >= 2:
                    self.assertTrue(any(g["intent"] == "save" and g["architecture"] in LIST_ARCHS for g in group), (brand, wk))

    def test_same_inputs_give_the_same_plan(self):
        a = self.new_plan("gulf-brand", "2027-02")
        b = self.new_plan("gulf-brand", "2027-02")
        self.assertEqual(a["slots"], b["slots"])
        self.assertEqual(a["occasions"], b["occasions"])

    def test_ramadan_slots_carry_the_occasion_and_post_after_iftar(self):
        plan = self.new_plan("demo-brand", "2027-02")
        for s in plan["slots"]:
            inside = "2027-02-08" <= s["date"] <= "2027-03-08"
            if inside:
                self.assertEqual(s.get("occasionId"), "ramadan-2027", s)
                self.assertGreaterEqual(s["time"], "21:30")
            else:
                self.assertNotEqual(s.get("occasionId"), "ramadan-2027")
                self.assertEqual(s["time"], "20:30")
        self.assertIn("ramadan-2027", plan["occasions"])

    def test_gulf_brand_gets_national_day_slots_inside_ramadan(self):
        plan = self.new_plan("gulf-brand", "2027-02")
        slots = {s["occasionId"]: s for s in plan["slots"] if s.get("occasionId", "").endswith("-2027") and s.get("title")}
        founding = slots["saudi-founding-day-2027"]
        self.assertEqual(founding["date"], "2027-02-22")
        self.assertEqual(founding["intent"], "send")
        self.assertNotIn("family", founding)  # greetings follow the occasion's tone, not a hook formula
        self.assertIn("kuwait-national-day-2027", slots)
        self.assertLessEqual(len(slots), len(plan["slots"]) // 2)
        self.assertIn("2027-02-22", founding["note"])

    def test_solemn_day_never_gets_a_sale(self):
        plan = self.new_plan("uae-brand", "2026-11")
        slot = next(s for s in plan["slots"] if s.get("occasionId") == "uae-commemoration-day-2026")
        self.assertEqual(slot["intent"], "reach")

    def test_white_friday_slot_sells_and_comes_before_the_day(self):
        plan = self.new_plan("uae-brand", "2026-11")
        slot = next(s for s in plan["slots"] if s.get("occasionId") == "white-friday-2026")
        self.assertEqual(slot["intent"], "sell")
        self.assertLessEqual(slot["date"], "2026-11-27")

    def test_new_year_eve_slot_for_a_december_plan(self):
        plan = self.new_plan("uae-brand", "2026-12")
        self.assertIn("new-year-2027", [s.get("occasionId") for s in plan["slots"]])

    def test_per_week_above_seven_is_clamped_with_a_warning(self):
        code, out, err = self.run_cli("new", "--brand", str(self.brands["demo-brand"]), "--month", "2027-04", "--per-week", "9",
                                      "--out", str(self.work / "p9.json"), "--format", "json")
        self.assertEqual(code, 0, err)
        data = json.loads(out)
        self.assertEqual(data["plan"]["cadence"]["perWeek"], 7)
        self.assertTrue(any("7" in w for w in data["warnings"]))

    def test_days_override_sets_the_rhythm(self):
        plan = self.new_plan("demo-brand", "2027-04", "--days", "sun,wed")
        self.assertEqual(plan["cadence"]["perWeek"], 2)
        self.assertEqual(set(plan["cadence"]["days"]), {"sun", "wed"})

    def test_hours_and_tz_options(self):
        plan = self.new_plan("demo-brand", "2027-04", "--hours", "19:00,22:00", "--tz", "Africa/Cairo", "--no-occasions")
        self.assertEqual(plan["cadence"]["tz"], "Africa/Cairo")
        self.assertEqual({s["time"] for s in plan["slots"]}, {"19:00", "22:00"})

    def test_brand_without_pillars_still_plans_and_warns(self):
        code, out, err = self.run_cli("new", "--brand", str(self.brands["bare-brand"]), "--month", "2027-04",
                                      "--out", str(self.work / "bare.json"), "--format", "json")
        self.assertEqual(code, 0, err)
        data = json.loads(out)
        self.assertTrue(all("pillarId" not in s for s in data["plan"]["slots"]))
        self.assertTrue(any("pillars" in w for w in data["warnings"]))

    def test_faq_seeds_the_idea_bank(self):
        plan = self.new_plan("gulf-brand", "2027-04")
        self.assertEqual(plan["ideaBank"][0]["source"], "audience-faq")

    def test_generated_plans_satisfy_their_own_rules_across_months(self):
        """One interpreter builds and lints many plans through the script's own functions (fast)."""
        driver = self.work / "driver.py"
        driver.write_text(DRIVER, encoding="utf-8")
        months = ["2026-11", "2026-12", "2027-01", "2027-02", "2027-03", "2027-04", "2027-05", "2027-06", "2027-09", "2027-11", "2028-01", "2028-02"]
        combos = [[str(self.brands[b]), m, pw] for b in ("demo-brand", "gulf-brand", "uae-brand") for m in months for pw in (None, 3, 6)]
        env = {**os.environ, "PYTHONUTF8": "1", "PYTHONIOENCODING": "utf-8"}
        p = subprocess.run([sys.executable, str(driver), str(self.root), json.dumps(combos)], capture_output=True, text=True, encoding="utf-8", env=env)
        self.assertEqual(p.returncode, 0, p.stderr)
        results = json.loads(p.stdout)
        self.assertEqual(len(results), len(combos))
        for r in results:
            self.assertEqual(r["findings"], [], (r["brand"], r["month"], r["perWeek"]))
            self.assertLessEqual(r["slots"], 62)
            self.assertEqual(r["schemaErrors"], [], (r["brand"], r["month"]))

    def test_usage_errors_and_missing_files(self):
        brand = str(self.brands["demo-brand"])
        self.assertEqual(self.run_cli("new", "--brand", brand, "--month", "2027-13")[0], 64)
        self.assertEqual(self.run_cli("new", "--brand", brand, "--month", "2027-02", "--goal", "fame")[0], 64)
        self.assertEqual(self.run_cli("new", "--brand", brand, "--month", "2027-02", "--days", "xyz")[0], 64)
        self.assertEqual(self.run_cli("new", "--brand", str(self.work / "none.json"), "--month", "2027-02")[0], 66)
        self.assertEqual(self.run_cli()[0], 64)

    # ---------------------------------------------------------------- show
    def test_show_prints_one_arabic_line_per_slot(self):
        plan = self.new_plan("demo-brand", "2027-04")
        code, out, err = self.run_cli("show", str(self.out_file))
        self.assertEqual(code, 0, err)
        lines = out.strip().splitlines()
        self.assertEqual(len(lines), len(plan["slots"]))
        self.assertTrue(all(re.match(r"^[0-9]+\. [ء-ي]+ ", line) for line in lines), lines[:2])
        self.assertEqual(json.loads(self.run_cli("show", str(self.out_file), "--format", "json")[1])["lines"], lines)

    # ---------------------------------------------------------------- lint
    def test_lint_flags_each_rotation_rule(self):
        base = self.new_plan("demo-brand", "2027-04", "--no-occasions")
        slots = sorted(base["slots"], key=lambda s: (s["date"], s["time"]))

        def with_changes(fn):
            plan = copy.deepcopy(base)
            ordered = sorted(plan["slots"], key=lambda s: (s["date"], s["time"]))
            fn(ordered)
            return plan

        def rules_for(plan):
            code, report, _ = self.lint(plan)
            return code, {r["rule"] for r in report["results"]}

        def arch(o): o[1]["architecture"] = o[0]["architecture"]
        code, rules = rules_for(with_changes(arch))
        self.assertEqual(code, 1)
        self.assertIn("PLAN.arch-repeat", rules)

        def cta(o): o[1]["ctaKind"] = o[0]["ctaKind"]
        self.assertIn("PLAN.cta-repeat", rules_for(with_changes(cta))[1])

        def family(o):
            for s in o[:3]:
                s["family"] = "P1"
        self.assertIn("PLAN.family-streak", rules_for(with_changes(family))[1])

        def no_list(o):
            for s in o:
                if s["architecture"] in LIST_ARCHS:
                    s["architecture"] = "opinion"
        self.assertIn("PLAN.week-save-list", rules_for(with_changes(no_list))[1])

        def twice(o): o[1]["date"], o[1]["time"] = o[0]["date"], o[0]["time"]
        self.assertIn("PLAN.duplicate-time", rules_for(with_changes(twice))[1])

        def solemn(o):
            o[0]["occasionId"], o[0]["intent"] = "ashura-2027", "sell"
        self.assertIn("PLAN.solemn-sell", rules_for(with_changes(solemn))[1])

        def unknown(o): o[0]["occasionId"] = "no-such-occasion-2027"
        self.assertIn("PLAN.occasion-unknown", rules_for(with_changes(unknown))[1])
        self.assertTrue(slots)

    def test_lint_notes_an_unbalanced_mix_without_failing(self):
        plan = self.new_plan("demo-brand", "2027-04", "--no-occasions")
        for s in plan["slots"]:
            s["intent"] = "save"
        code, report, _ = self.lint(plan, "--brand", str(self.brands["demo-brand"]))
        notes = [r for r in report["results"] if r["rule"] == "PLAN.intent-mix"]
        self.assertTrue(notes and all(r["sev"] == "NOTE" for r in notes))

    def test_lint_schema_errors_exit_two(self):
        plan = self.new_plan("demo-brand", "2027-04")
        plan["period"] = "April"
        code, report, _ = self.lint(plan)
        self.assertEqual(code, 2)
        self.assertEqual(report["status"], "block")
        self.assertIn("PLAN.schema", {r["rule"] for r in report["results"]})

    def test_lint_text_output_is_in_the_requested_language(self):
        self.new_plan("demo-brand", "2027-04")
        code, out, _ = self.run_cli("lint", str(self.out_file), "--lang", "en")
        self.assertEqual(code, 0)
        self.assertIn("Plan lint: pass", out)

    # ---------------------------------------------------------------- set-status
    def test_set_status_updates_the_slot_and_stays_valid(self):
        plan = self.new_plan("demo-brand", "2027-04")
        slot = plan["slots"][2]["id"]
        code, out, err = self.run_cli("set-status", str(self.out_file), "--slot", slot, "--status", "scripted",
                                      "--spec-id", "post-20270401-0001", "--studio-url", "https://claude.ai/artifact/abc", "--format", "json")
        self.assertEqual(code, 0, err)
        saved = json.loads(self.out_file.read_text(encoding="utf-8"))
        updated = next(s for s in saved["slots"] if s["id"] == slot)
        self.assertEqual((updated["status"], updated["specId"], updated["studioUrl"]), ("scripted", "post-20270401-0001", "https://claude.ai/artifact/abc"))
        self.assertGreaterEqual(saved["updatedAt"], saved["createdAt"])
        self.assertEqual(self.run_cli("lint", str(self.out_file))[0], 0)

    def test_set_status_rejects_bad_input(self):
        plan = self.new_plan("demo-brand", "2027-04")
        slot = plan["slots"][0]["id"]
        f = str(self.out_file)
        self.assertEqual(self.run_cli("set-status", f, "--slot", slot, "--status", "finished")[0], 64)
        self.assertEqual(self.run_cli("set-status", f, "--slot", "w9-9", "--status", "posted")[0], 64)
        self.assertEqual(self.run_cli("set-status", f, "--slot", slot, "--status", "posted", "--spec-id", "A B")[0], 64)
        self.assertEqual(self.run_cli("set-status", f, "--slot", slot, "--status", "posted", "--studio-url", "x" * 501)[0], 64)
        self.assertEqual(self.run_cli("set-status", str(self.work / "missing.json"), "--slot", slot, "--status", "posted")[0], 66)

    # ---------------------------------------------------------------- add-idea
    def test_add_idea_assigns_increasing_ids(self):
        self.new_plan("gulf-brand", "2027-04")  # starts with one FAQ idea (i1)
        f = str(self.out_file)
        code, out, err = self.run_cli("add-idea", f, "--text", "أدوات مجانية للمونتاج", "--pillar", "tools", "--intent", "save,send", "--format", "json")
        self.assertEqual(code, 0, err)
        idea = json.loads(out)
        self.assertEqual((idea["id"], idea["pillarId"], idea["intents"], idea["source"]), ("i2", "tools", ["save", "send"], "user"))
        self.assertEqual(json.loads(self.run_cli("add-idea", f, "--text", "فكرة تانية", "--source", "claude", "--format", "json")[1])["id"], "i3")
        saved = json.loads(self.out_file.read_text(encoding="utf-8"))
        self.assertEqual([i["id"] for i in saved["ideaBank"]], ["i1", "i2", "i3"])
        self.assertEqual(self.run_cli("lint", f)[0], 0)

    def test_add_idea_rejects_bad_input(self):
        self.new_plan("demo-brand", "2027-04")
        f = str(self.out_file)
        self.assertEqual(self.run_cli("add-idea", f, "--text", "   ")[0], 64)
        self.assertEqual(self.run_cli("add-idea", f, "--text", "x" * 301)[0], 64)
        self.assertEqual(self.run_cli("add-idea", f, "--text", "ok", "--intent", "viral")[0], 64)
        self.assertEqual(self.run_cli("add-idea", f, "--text", "ok", "--pillar", "Bad Pillar")[0], 64)


if __name__ == "__main__":
    unittest.main()
