"""Tests for brand-setup/scripts/brand_io.py (run as a CLI, the way Claude runs it)."""

import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SKILLS = Path(os.environ.get("CS_TEST_SKILLS") or ROOT / "plugins" / "carousel-studio" / "skills")
SCRIPT = SKILLS / "brand-setup" / "scripts" / "brand_io.py"
# before tools/sync_shared.py has copied _cs into the skill, fall back to the canonical package
FALLBACK = SKILLS / "carousel-design" / "scripts"
ENV = {**os.environ, "PYTHONIOENCODING": "utf-8", "PYTHONUTF8": "1", "CS_NOW": "2026-10-22T10:00:00Z",
       "PYTHONPATH": os.pathsep.join(filter(None, [str(FALLBACK), os.environ.get("PYTHONPATH", "")]))}

HAVE_CS = any((p / "_cs" / "__init__.py").exists() for p in (SCRIPT.parent, FALLBACK))
NEEDS_CS = unittest.skipUnless(HAVE_CS, "the _cs package is not in place yet (run tools/sync_shared.py)")


def run(*args, stdin=None):
    p = subprocess.run([sys.executable, str(SCRIPT), *args], capture_output=True, text=True, encoding="utf-8",
                       env=ENV, input=stdin)
    return p.returncode, p.stdout, p.stderr


@NEEDS_CS
class BrandIoTests(unittest.TestCase):
    def test_remember_help_names_move_and_verdict_values(self):
        code, out, err = run("remember", "--help")
        self.assertEqual(code, 0, err)
        for value in ("big-number", "enemy", "reveal", "mirror", "before-after", "cheat-sheet", "insider-leak", "confession", "free-vs-paid", "countdown", "ship", "revised", "killed"):
            self.assertIn(value, out)

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.dir = self._tmp.name

    def cli(self, cmd, *args, **kw):
        return run(cmd, "--dir", self.dir, *args, **kw)

    def brand(self, slug="demo-brand"):
        return json.loads((Path(self.dir) / "brands" / slug / "brand.json").read_text(encoding="utf-8"))

    def new(self, slug="demo-brand", *extra):
        code, out, err = self.cli("new", "--slug", slug, "--name", "معمل المحتوى", "--dialect", "eg", *extra)
        self.assertEqual(code, 0, err)
        return json.loads((Path(self.dir) / "brands" / slug / "brand.json").read_text(encoding="utf-8"))

    def write(self, name, obj):
        p = Path(self.dir) / name
        p.write_text(json.dumps(obj, ensure_ascii=False), encoding="utf-8")
        return str(p)

    # -- new ------------------------------------------------------------------------------
    def test_new_defaults(self):
        b = self.new()
        self.assertEqual(b["schemaVersion"], 1)
        self.assertEqual(b["locale"]["dialect"], "eg")
        self.assertEqual(b["locale"]["digits"], "western")  # Q38: Western by default
        self.assertEqual(b["locale"]["register"], "dialect")
        self.assertEqual((b["locale"]["appLanguage"], b["locale"]["swipeCue"]), ("ar", "arrow-rtl"))
        self.assertEqual(b["onboarding"]["sections"], {s: "todo" for s in
                                                       ("identity", "audience", "voice", "visual", "strategy", "tools")})
        self.assertTrue(b["id"].startswith("brand-demo-brand-"))
        self.assertEqual(b["createdAt"], "2026-10-22T10:00:00Z")

    def test_new_mixed_audience_gets_neutral_cue(self):
        code, _, err = self.cli("new", "--slug", "mix", "--name", "Mix", "--dialect", "gulf", "--country", "AE,EG")
        self.assertEqual(code, 0, err)
        loc = self.brand("mix")["locale"]
        self.assertEqual((loc["appLanguage"], loc["swipeCue"]), ("mixed", "neutral"))
        self.assertEqual(loc["countries"], ["AE", "EG"])

    def test_new_english_dialect_defaults_to_english_app(self):
        self.assertEqual(self.cli("new", "--slug", "en-brand", "--name", "E", "--dialect", "en")[0], 0)
        loc = self.brand("en-brand")["locale"]
        self.assertEqual((loc["appLanguage"], loc["swipeCue"], loc["register"]), ("en", "arrow-ltr", "white"))

    def test_new_refuses_duplicates_and_bad_slugs(self):
        self.new()
        code, _, err = self.cli("new", "--slug", "demo-brand", "--name", "x", "--dialect", "eg")
        self.assertEqual(code, 75, err)
        for bad in ("Bad Slug", "x", "-nope", "ab_c"):
            self.assertEqual(self.cli("new", "--slug", bad, "--name", "x", "--dialect", "eg")[0], 64, bad)
        self.assertEqual(self.cli("new", "--slug", "ok-slug", "--name", "x", "--dialect", "klingon")[0], 64)

    # -- sections -------------------------------------------------------------------------
    def test_save_section_merges_and_advances(self):
        self.new()
        f = self.write("identity.json", {"identity": {"who": "صانع محتوى", "niche": "AI", "goal": "followers"},
                                         "handle": "@content.lab"})
        code, out, err = self.cli("save-section", "--slug", "demo-brand", "--section", "identity", "--file", f,
                                  "--format", "json")
        self.assertEqual(code, 0, err)
        res = json.loads(out)
        self.assertEqual((res["next"], res["progress"]["done"]), ("audience", 1))
        b = self.brand()
        self.assertEqual(b["identity"]["niche"], "AI")
        self.assertEqual(b["handle"], "@content.lab")
        self.assertEqual(b["onboarding"]["sections"]["identity"], "done")
        self.assertEqual(b["onboarding"]["current"], "audience")

    def test_skipped_section_returns_next_todo_and_stays_a_gap(self):
        self.new()
        f = self.write("empty.json", {})
        self.assertEqual(self.cli("save-section", "--slug", "demo-brand", "--section", "identity", "--file", f,
                                  "--status", "skipped")[0], 0)
        code, out, _ = self.cli("resume", "--slug", "demo-brand", "--format", "json")
        res = json.loads(out)
        self.assertEqual((code, res["next"]), (0, "audience"))
        self.assertIn("identity", res["gaps"])

    def test_save_section_refuses_keys_outside_the_section(self):
        self.new()
        f = self.write("bad.json", {"identity": {"who": "x"}, "slug": "hijack"})
        code, _, err = self.cli("save-section", "--slug", "demo-brand", "--section", "identity", "--file", f)
        self.assertEqual(code, 64, err)
        self.assertEqual(self.brand()["slug"], "demo-brand")

    def test_audience_section_rederives_swipe_cue_when_app_language_changes(self):
        self.new()
        f = self.write("aud.json", {"audience": {"persona": "موظف"}, "locale": {"appLanguage": "mixed", "countries": ["AE", "EG"]}})
        self.assertEqual(self.cli("save-section", "--slug", "demo-brand", "--section", "audience", "--file", f)[0], 0)
        loc = self.brand()["locale"]
        self.assertEqual((loc["appLanguage"], loc["swipeCue"]), ("mixed", "neutral"))

    def test_resume_reaches_close_when_every_section_is_closed(self):
        self.new()
        sections = {"identity": {}, "audience": {}, "voice": {}, "visual": {}, "strategy": {}, "tools": {}}
        f = self.write("e.json", {})
        for name in sections:
            self.assertEqual(self.cli("save-section", "--slug", "demo-brand", "--section", name, "--file", f)[0], 0)
        _, out, _ = self.cli("resume", "--slug", "demo-brand", "--format", "json")
        res = json.loads(out)
        self.assertEqual((res["next"], res["gaps"]), ("close", []))

    # -- set / validate ---------------------------------------------------------------------
    def test_set_updates_nested_values_and_lists(self):
        self.new()
        self.assertEqual(self.cli("set", "--slug", "demo-brand", "--path", "voice.use", "--json", '["ببلاش","جرّب"]')[0], 0)
        self.assertEqual(self.cli("set", "--slug", "demo-brand", "--path", "voice.use.-", "--value", "جديد")[0], 0)
        self.assertEqual(self.cli("set", "--slug", "demo-brand", "--path", "visual.palette.bg", "--value", "#F4F4F2")[0], 2)  # incomplete palette
        self.assertEqual(self.brand()["voice"]["use"], ["ببلاش", "جرّب", "جديد"])

    def test_set_refuses_protected_paths_and_invalid_values(self):
        self.new()
        self.assertEqual(self.cli("set", "--slug", "demo-brand", "--path", "id", "--value", "x")[0], 64)
        before = (Path(self.dir) / "brands" / "demo-brand" / "brand.json").read_text(encoding="utf-8")
        code, _, err = self.cli("set", "--slug", "demo-brand", "--path", "locale.dialect", "--value", "klingon")
        self.assertEqual(code, 2, err)
        after = (Path(self.dir) / "brands" / "demo-brand" / "brand.json").read_text(encoding="utf-8")
        self.assertEqual(before, after, "an invalid change must never be written")

    def test_arabic_indic_digits_need_a_recorded_reason(self):
        self.new()
        self.assertEqual(self.cli("set", "--slug", "demo-brand", "--path", "locale.digitsReason", "--value", " ")[0], 0)
        code, _, err = self.cli("set", "--slug", "demo-brand", "--path", "locale.digits", "--value", "arabic-indic")
        self.assertEqual(code, 2, err)
        self.assertIn("digitsReason", err)
        self.assertEqual(self.cli("set", "--slug", "demo-brand", "--path", "locale.digitsReason", "--value", "جمهور حكومي")[0], 0)
        self.assertEqual(self.cli("set", "--slug", "demo-brand", "--path", "locale.digits", "--value", "arabic-indic")[0], 0)

    def test_validate(self):
        self.new()
        code, out, _ = self.cli("validate", "--slug", "demo-brand", "--format", "json")
        self.assertEqual(code, 0)
        self.assertTrue(json.loads(out)["ok"])
        p = Path(self.dir) / "brands" / "demo-brand" / "brand.json"
        data = json.loads(p.read_text(encoding="utf-8"))
        data["kind"] = "robot"
        p.write_text(json.dumps(data), encoding="utf-8")
        self.assertEqual(self.cli("validate", "--slug", "demo-brand")[0], 2)

    # -- capsule / hash ---------------------------------------------------------------------
    def test_capsule_shape_and_size(self):
        self.new()
        self.cli("set", "--slug", "demo-brand", "--path", "voice", "--json",
                 json.dumps({"tone": {"formalFriendly": 4, "seriousPlayful": 3, "calmEnergetic": 4},
                             "use": ["ببلاش", "جرّب", "ملخص"] + ["كلمة%d" % i for i in range(80)],
                             "avoid": ["ثورة", "سر خطير"]}, ensure_ascii=False))
        self.cli("set", "--slug", "demo-brand", "--path", "visual", "--json", json.dumps({
            "palette": {"bg": "#F4F4F2", "ink": "#111111", "accent": "#E3262B"},
            "fonts": {"display": "ibm-plex-sans-arabic", "body": "readex-pro", "latin": "inter"}, "presetId": "swiss"}))
        code, out, err = self.cli("capsule", "--slug", "demo-brand")
        self.assertEqual(code, 0, err)
        lines = out.strip().split("\n")
        self.assertEqual(lines[0], "[Carousel Studio brand capsule v1]")
        self.assertEqual(len(lines), 5)
        self.assertLessEqual(len(out.encode("utf-8")), 1500)
        self.assertIn("dialect: eg | register: dialect | digits: western | swipe: arrow-rtl", lines[1])
        self.assertTrue(lines[2].startswith("voice: "))
        self.assertLessEqual(len(lines[2]) - len("voice: "), 200)
        self.assertIn("avoid:", lines[2])
        self.assertEqual(lines[3], "palette: bg #F4F4F2 ink #111111 accent #E3262B | fonts: ibm-plex-sans-arabic / readex-pro / inter | preset: swiss")
        self.assertEqual(lines[4], "home: -")

    def test_snapshot_hash_ignores_volatile_fields_only(self):
        self.new()
        h1 = self.cli("snapshot-hash", "--slug", "demo-brand")[1].strip()
        self.assertRegex(h1, r"^[0-9a-f]{16}$")
        self.cli("set", "--slug", "demo-brand", "--path", "onboarding.current", "--value", "voice")  # volatile (onboarding)
        self.assertEqual(self.cli("snapshot-hash", "--slug", "demo-brand")[1].strip(), h1)
        self.cli("set", "--slug", "demo-brand", "--path", "name", "--value", "اسم جديد")
        self.assertNotEqual(self.cli("snapshot-hash", "--slug", "demo-brand")[1].strip(), h1)

    # -- stock example values never reach the header of a slide -----------------------------
    def test_a_stock_handle_or_name_is_refused(self):
        for handle in ("@yourbrand", "@YourBrand", "your_brand", "@handle", "@<handle>", "@example"):
            code, _, err = self.cli("new", "--slug", "stock", "--name", "معمل المحتوى", "--dialect", "eg", "--handle", handle)
            self.assertNotEqual(code, 0, handle)
            self.assertIn("stock example", err, handle)
        code, _, err = self.cli("new", "--slug", "stock", "--name", "براند تجريبي", "--dialect", "eg")
        self.assertNotEqual(code, 0)
        self.assertIn("stock example", err)
        self.assertFalse((Path(self.dir) / "brands" / "stock").exists(), "nothing is written for a refused brand")
        self.new()
        for handle in ("@yourbrand", "@<their real handle>"):
            f = self.write("identity.json", {"handle": handle, "identity": {"who": "x", "niche": "y", "goal": "followers"}})
            code, _, err = self.cli("save-section", "--slug", "demo-brand", "--section", "identity", "--file", f)
            self.assertNotEqual(code, 0, handle)
        self.assertNotIn("handle", self.brand())

    def test_a_real_or_missing_handle_is_fine_and_approve_says_what_missing_means(self):
        self.assertEqual(self.cli("new", "--slug", "real", "--name", "معمل المحتوى", "--dialect", "eg", "--handle", "@content.lab.eg")[0], 0)
        self.new()
        code, out, err = self.cli("approve", "--slug", "demo-brand", "--format", "json")
        self.assertEqual(code, 0, err)
        self.assertIn("no handle", json.loads(out)["warnings"][0])
        code, out, err = self.cli("approve", "--slug", "real", "--format", "json")
        self.assertEqual(json.loads(out)["warnings"], [])

    def test_the_stock_lists_equal_the_ones_gate_b2_reads(self):
        # read in a child process: importing the script here would leave this skill's copy of _cs in sys.modules for the tests that run after
        code = ("import json, sys; sys.path.insert(0, sys.argv[1]); import brand_io as b; "
                "print(json.dumps({'handles': sorted(b.PLACEHOLDER_HANDLES), 'names': sorted(b.PLACEHOLDER_NAMES), "
                "'contains': list(b.PLACEHOLDER_CONTAINS), 'tokens': list(b.PLACEHOLDER_TOKENS)}))")
        p = subprocess.run([sys.executable, "-c", code, str(SCRIPT.parent)], capture_output=True, text=True, encoding="utf-8", env=ENV)
        self.assertEqual(p.returncode, 0, p.stderr)
        mine = json.loads(p.stdout)
        rules = json.loads((SKILLS / "carousel-design" / "data" / "qa-rules.json").read_text(encoding="utf-8"))
        params = next(c for g in rules["gates"] if g["id"] == "B2" for c in g["checks"])["params"]
        self.assertEqual(sorted(params["handles"]), mine["handles"])
        self.assertEqual(sorted(params["names"]), mine["names"])
        self.assertEqual(list(params["contains"]), mine["contains"])
        self.assertEqual(list(params["templateTokens"]), mine["tokens"])

    # -- approve / list / use / import / migrate -------------------------------------------
    def test_approve_stamps_then_versions(self):
        self.new()
        self.assertEqual(self.cli("approve", "--slug", "demo-brand")[0], 0)
        b = self.brand()
        self.assertEqual((b["version"], b["approvedAt"], b["onboarding"]["current"]), (1, "2026-10-22T10:00:00Z", "close"))
        self.assertEqual(self.cli("approve", "--slug", "demo-brand")[0], 0)
        self.assertEqual(self.brand()["version"], 2)

    def test_list_and_use(self):
        self.new("a-brand")
        self.new("b-brand")
        self.assertEqual(self.cli("use", "--slug", "b-brand")[0], 0)
        _, out, _ = self.cli("list", "--format", "json")
        res = json.loads(out)
        self.assertEqual(res["default"], "b-brand")
        self.assertEqual([b["slug"] for b in res["brands"]], ["a-brand", "b-brand"])
        self.assertEqual(self.cli("use", "--slug", "missing-one")[0], 66)

    def test_import_refuses_overwrite_without_flag(self):
        b = self.new()
        f = self.write("exported.json", b)
        self.assertEqual(self.cli("import", "--file", f)[0], 75)
        self.assertEqual(self.cli("import", "--file", f, "--overwrite")[0], 0)

    def test_migrate_upgrades_the_draft_shape(self):
        b = self.new()
        legacy = dict(b)
        del legacy["schemaVersion"]
        legacy["voice"] = {"tone": {"formal_friendly": 4, "serious_playful": 2, "calm_energetic": 3}}
        del legacy["onboarding"]
        p = Path(self.dir) / "brands" / "demo-brand" / "brand.json"
        p.write_text(json.dumps(legacy, ensure_ascii=False), encoding="utf-8")
        code, out, err = self.cli("migrate", "--slug", "demo-brand", "--format", "json")
        self.assertEqual(code, 0, err)
        fixed = self.brand()
        self.assertEqual(fixed["schemaVersion"], 1)
        self.assertEqual(fixed["voice"]["tone"], {"formalFriendly": 4, "seriousPlayful": 2, "calmEnergetic": 3})
        self.assertEqual(self.cli("validate", "--slug", "demo-brand")[0], 0)

    def test_missing_brand_and_usage_errors(self):
        self.assertEqual(self.cli("get", "--slug", "nope-nope")[0], 66)
        self.assertEqual(self.cli("get")[0], 64)
        self.assertEqual(run("frobnicate")[0], 64)


    # ---- the creative team's memory -------------------------------------------------------------------------------------------------
    def remember(self, post_id, **fields):
        entry = {"postId": post_id, "date": "2026-10-2%d" % (int(post_id[-2:]) % 10), "idea": "فكرة " + post_id, **fields}
        code, out, err = self.cli("remember", "--slug", "demo-brand", "--json", json.dumps(entry, ensure_ascii=False), "--format", "json")
        self.assertEqual(code, 0, err)
        return json.loads(out)

    def test_remember_appends_newest_last_and_a_post_never_appears_twice(self):
        self.new()
        self.assertEqual(self.remember("post-0001", family="P3")["count"], 1)
        self.assertEqual(self.remember("post-0002", family="P4")["count"], 2)
        self.assertEqual(self.remember("post-0001", family="P1")["count"], 2, "approving a revision again replaces the earlier entry")
        memory = self.brand()["creativeMemory"]
        self.assertEqual([e["postId"] for e in memory], ["post-0002", "post-0001"])
        self.assertEqual(memory[-1]["family"], "P1")

    def test_remember_keeps_the_last_thirty(self):
        self.new()
        for n in range(1, 34):
            self.remember("post-%04d" % n)
        memory = self.brand()["creativeMemory"]
        self.assertEqual(len(memory), 30)
        self.assertEqual((memory[0]["postId"], memory[-1]["postId"]), ("post-0004", "post-0033"))
        self.assertEqual(self.cli("validate", "--slug", "demo-brand")[0], 0, "the brand with its memory still validates")

    def test_memory_names_what_to_rest_and_what_was_loved(self):
        self.new()
        self.remember("post-0001", family="P4", move="enemy", motion="stamp", loved="الرقم الكبير")
        self.remember("post-0002", family="P4", move="reveal", motion="counter", rejected="الفيديو الطويل")
        code, out, err = self.cli("memory", "--slug", "demo-brand", "--format", "json")
        self.assertEqual(code, 0, err)
        summary = json.loads(out)
        self.assertEqual(summary["count"], 2)
        self.assertEqual(summary["rest"], {"family": "P4"}, "only the value both of the last two posts used is rested")
        self.assertEqual((summary["loved"], summary["rejected"]), (["الرقم الكبير"], ["الفيديو الطويل"]))

    def test_memory_holds_the_cover_pitch_cta_panel_and_series_and_the_director_reads_them(self):
        self.new()
        self.remember("post-0001", family="P3", pitch="safe", cta="save", hook="5 أخطاء بتموّت الكاروسيل", series="أخطاء البرومبت",
                      panel={"stops": 1, "depth": 8, "slides": 10})
        self.remember("post-0002", family="F17", pitch="bold", cta="question", hook="بطّل تكتب برومبتات", series="أخطاء البرومبت",
                      panel={"stops": 2, "depth": 10, "slides": 10})
        summary = json.loads(self.cli("memory", "--slug", "demo-brand", "--format", "json")[1])
        self.assertEqual(summary["ctaAvoid"], ["save", "question"], "the next call to action is a different kind from both")
        self.assertEqual(summary["familyAvoid"], ["P3", "F17"], "the hook engine drops a family used in either of the last two posts")
        self.assertEqual(summary["hooks"], ["5 أخطاء بتموّت الكاروسيل", "بطّل تكتب برومبتات"])
        self.assertEqual(summary["series"], {"name": "أخطاء البرومبت", "count": 2})
        self.assertIsNone(summary["pitchBias"], "two picks are not a habit")
        for n in (3, 4):
            self.remember("post-000%d" % n, family="P4", pitch="bold", cta="send")
        self.assertEqual(json.loads(self.cli("memory", "--slug", "demo-brand", "--format", "json")[1])["pitchBias"], "bold")
        text = self.cli("memory", "--slug", "demo-brand")[1]
        self.assertIn("سلسلة مفتوحة", text)
        self.assertIn("الجريء", text)

    def test_a_killed_idea_is_remembered_with_its_reason(self):
        self.new()
        self.remember("post-0001", verdict="killed", rejected="الفكرة مجرد موضوع من غير عدو")
        summary = json.loads(self.cli("memory", "--slug", "demo-brand", "--format", "json")[1])
        self.assertEqual(summary["killed"], [{"idea": "فكرة post-0001", "why": "الفكرة مجرد موضوع من غير عدو"}])
        self.assertEqual(summary["rejected"], [], "a killed post's reason is listed once, under killed")

    def test_remember_checks_the_new_fields_and_fills_the_date(self):
        self.new()
        for bad in ({"pitch": "loud"}, {"cta": "shout"}, {"panel": {"stops": 4}}, {"hook": "x" * 161}):
            entry = {"postId": "post-0009", "idea": "فكرة", **bad}
            self.assertEqual(self.cli("remember", "--slug", "demo-brand", "--json", json.dumps(entry, ensure_ascii=False))[0], 2, bad)
        ok = self.cli("remember", "--slug", "demo-brand", "--json", json.dumps({"postId": "post-0009", "idea": "فكرة"}, ensure_ascii=False))
        self.assertEqual(ok[0], 0, ok[2])
        self.assertRegex(self.brand()["creativeMemory"][-1]["date"], r"^\d{4}-\d{2}-\d{2}$")

    def test_memory_is_not_part_of_the_brand_snapshot(self):
        self.new()
        before = json.loads(self.cli("snapshot-hash", "--slug", "demo-brand", "--format", "json")[1])["snapshotHash"]
        self.remember("post-0001", family="P3")
        after = json.loads(self.cli("snapshot-hash", "--slug", "demo-brand", "--format", "json")[1])["snapshotHash"]
        self.assertEqual(before, after, "remembering a post must not make every earlier post look stale")

    def test_remember_refuses_unreadable_entries(self):
        self.new()
        self.assertEqual(self.cli("remember", "--slug", "demo-brand", "--json", "not json")[0], 65)
        self.assertEqual(self.cli("remember", "--slug", "demo-brand", "--json", "[1]")[0], 65)
        self.assertEqual(self.cli("remember", "--slug", "demo-brand")[0], 64)



@NEEDS_CS
class WorkspacePointerTests(unittest.TestCase):
    """A brand created with --dir outside ~/CarouselStudio is found by a session started in any other folder."""

    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        base = Path(tmp.name)
        self.home, self.ws, self.other_tmp = base / "home", base / "carousel" / "ws", base / "tmp"
        for d in (self.home, self.ws, self.other_tmp):
            d.mkdir(parents=True)
        self.env = {**ENV, "HOME": str(self.home), "USERPROFILE": str(self.home), "TMP": str(self.other_tmp),
                    "TEMP": str(self.other_tmp), "TMPDIR": str(self.other_tmp)}
        for k in ("CS_WORKSPACE", "CLAUDE_PLUGIN_OPTION_WORKSPACE_DIR"):
            self.env.pop(k, None)

    def run_in(self, cwd, *args):
        p = subprocess.run([sys.executable, str(SCRIPT), *args], capture_output=True, text=True, encoding="utf-8",
                           env=self.env, cwd=cwd)
        return p.returncode, p.stdout, p.stderr

    def test_a_brand_created_in_another_folder_is_found_from_anywhere(self):
        code, _out, err = self.run_in(self.ws.parent, "new", "--slug", "mo", "--name", "مو", "--dialect", "eg", "--dir", str(self.ws))
        self.assertEqual(code, 0, err)
        self.assertEqual((self.home / ".carousel-studio-workspace").read_text(encoding="utf-8").strip(), str(self.ws.resolve()))
        code, out, err = self.run_in(self.other_tmp, "list")  # no --dir, another folder
        self.assertEqual(code, 0, err)
        self.assertIn("mo", out)
        (self.home / "CarouselStudio").mkdir()  # once the default folder exists, it wins
        self.assertNotIn("mo", self.run_in(self.other_tmp, "list")[1])

    def test_temporary_folders_are_never_recorded(self):
        self.env.update(TMP=str(self.ws.parent), TEMP=str(self.ws.parent), TMPDIR=str(self.ws.parent))
        code, _out, err = self.run_in(self.ws.parent, "new", "--slug", "mo", "--name", "مو", "--dialect", "eg", "--dir", str(self.ws))
        self.assertEqual(code, 0, err)
        self.assertFalse((self.home / ".carousel-studio-workspace").exists())

if __name__ == "__main__":
    unittest.main()
