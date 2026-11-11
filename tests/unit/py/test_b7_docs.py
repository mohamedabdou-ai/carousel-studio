"""Integrity of the writing skills' documents and data (B7): SKILL.md contract, references, priors, tips."""
import json
import re
import unittest

import b7_support as support

SKILLS = ("carousel-create", "content-angles")
# Written by the hook-library package (B10); allowed to be absent while the packages are built separately.
HOOK_DOCS = {"hook-engine.md", "hook-scoring.md", "compression.md"}
OWNED_DOCS = [
    "carousel-create/SKILL.md", "content-angles/SKILL.md",
    "carousel-create/references/flow.md", "carousel-create/references/why-tips.md",
    "carousel-create/references/brand-lookup.md", "carousel-create/references/architectures.md",
    "carousel-create/references/slide-limits.md", "carousel-create/references/caption-pack.md",
    "carousel-create/references/cta.md", "carousel-create/references/alt-text.md",
    "carousel-create/references/chat-display.md",
    "carousel-create/references/dialects/eg.md", "carousel-create/references/dialects/gulf.md",
    "carousel-create/references/dialects/levant.md", "carousel-create/references/dialects/msa-white.md",
    "carousel-create/references/dialects/en.md",
    "content-angles/references/lenses.md", "content-angles/references/scoring.md",
    "content-angles/references/source-pack.md", "content-angles/references/awareness.md",
]
LENSES = {"contrarian", "costly-mistake", "free-vs-paid", "tested-ranked", "identity", "before-after", "myth",
          "story", "framework", "news", "setup", "imagine"}
TIP_KEYS = ["angle", "pick", "hooks", "script", "short", "slide2", "bridge", "numbers", "digits", "dialect",
            "cta", "caption", "design", "fast"]
TIP_DIALECTS = ["eg", "gulf", "levant", "msa-white", "en"]
ARABIC = re.compile("[" + chr(0x0600) + "-" + chr(0x06FF) + "]")
# The same conservative estimate the build uses to hold SKILL.md under 4k tokens: Arabic ~2.2 chars/token, the rest ~3.8
def estimate_tokens(text):
    arabic = len(ARABIC.findall(text))
    return arabic / 2.2 + (len(text) - arabic) / 3.8


def read(rel):
    return (support.SKILLS / rel).read_text(encoding="utf-8")


def frontmatter(text):
    m = re.match(r"^---\n(.*?)\n---\n", text, re.S)
    assert m, "no frontmatter"
    return m.group(1)


class SkillFiles(unittest.TestCase):
    def test_frontmatter_name_and_description(self):
        for skill in SKILLS:
            fm = frontmatter(read(skill + "/SKILL.md"))
            self.assertRegex(fm, r"(?m)^name: " + re.escape(skill) + "$")
            m = re.search(r'(?m)^description: "(.*)"$', fm)
            self.assertIsNotNone(m, skill)
            self.assertLessEqual(len(m.group(1)), 1024, skill)
            self.assertNotIn('"', m.group(1), skill)
            for negative in ("Not for",):
                self.assertIn(negative, m.group(1), skill)

    def test_triggers_cover_every_register(self):
        for skill, phrases in (("carousel-create", ["اعملي كاروسيل", "ابغى بوست", "بدّي كاروسيل", "أنشئ كاروسيل", "Instagram carousel"]),
                               ("content-angles", ["إيه الزوايا", "وش الزوايا", "شو الزوايا", "اقترح زوايا", "angles for this topic"])):
            description = frontmatter(read(skill + "/SKILL.md"))
            for phrase in phrases:
                self.assertIn(phrase, description, (skill, phrase))

    def test_skill_md_stays_under_four_thousand_tokens(self):
        for skill in SKILLS:
            self.assertLess(estimate_tokens(read(skill + "/SKILL.md")), 4000, skill)

    def test_every_reference_named_in_skill_md_exists(self):
        for skill in SKILLS:
            text = read(skill + "/SKILL.md")
            for name in set(re.findall(r"`((?:references/)?(?:dialects/)?[a-z0-9-]+\.md)`", text)):
                path = support.SKILLS / skill / (name if name.startswith("references/") else "references/" + name)
                if name in HOOK_DOCS or path.name in HOOK_DOCS:
                    continue
                if "<code>" in name:
                    continue
                self.assertTrue(path.is_file(), (skill, name))
        for code in ("eg", "gulf", "levant", "msa-white", "en"):
            self.assertTrue((support.SKILLS / "carousel-create/references/dialects" / (code + ".md")).is_file())

    def test_scripts_named_in_skill_md_exist_or_belong_to_other_packages(self):
        other = {"validate.py", "hook_features.py", "compress.py"}      # B4 and B10
        for skill in SKILLS:
            for name in set(re.findall(r"`scripts/([a-z_]+\.py)`", read(skill + "/SKILL.md"))):
                if name in other:
                    continue
                self.assertTrue((support.SKILLS / skill / "scripts" / name).is_file(), (skill, name))

    def test_documents_are_public_safe(self):
        banned = re.compile(r"https?://|www\.|analytic|track\(|gtag|sendBeacon|gsap|remotion", re.I)
        for rel in OWNED_DOCS + ["content-angles/data/priors.json", "carousel-design/data/rules/copy.json"]:
            text = read(rel)
            self.assertIsNone(banned.search(text), rel)
            for name in ("Mohamed", "Abdou", "محمد عبده", "pyraai"):
                self.assertNotIn(name, text, rel)
            self.assertNotIn("\r", text, rel)
            self.assertLess(len(text.encode("utf-8")), 256 * 1024, rel)

    def test_no_fetch_the_latest_instruction(self):
        for rel in OWNED_DOCS:
            self.assertIsNone(re.search(r"(fetch|download|pull)[^.\n]{0,40}\blatest\b", read(rel), re.I), rel)

    def test_documents_use_western_digits_only(self):
        arabic_indic = re.compile("[" + chr(0x0660) + "-" + chr(0x0669) + "]")
        for rel in OWNED_DOCS:
            self.assertIsNone(arabic_indic.search(read(rel)), rel)


class WhyTips(unittest.TestCase):
    def test_every_tip_exists_in_every_dialect(self):
        text = read("carousel-create/references/why-tips.md")
        sections = re.split(r"(?m)^### ", text)[1:]
        found = {}
        for sec in sections:
            code = sec.split(" ", 1)[0]
            rows = dict(re.findall(r"(?m)^\| (\w+) \| (.+) \|$", sec))
            rows.pop("key", None)
            found[code] = rows
        self.assertEqual(sorted(found), sorted(TIP_DIALECTS))
        for code in TIP_DIALECTS:
            self.assertEqual(sorted(found[code]), sorted(TIP_KEYS), code)
            for key, tip in found[code].items():
                self.assertGreaterEqual(len(tip), 20, (code, key))
                self.assertLessEqual(len(tip), 140, (code, key))
                if code != "en":
                    self.assertRegex(tip, ARABIC, (code, key))


class Priors(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.priors = json.loads(read("content-angles/data/priors.json"))
        cls.spec_schema = json.loads(read("carousel-design/schemas/spec.schema.json"))

    def test_lenses_match_the_spec_schema(self):
        self.assertEqual(set(self.priors["lenses"]), LENSES)
        self.assertEqual(set(self.spec_schema["$defs"]["lens"]["enum"]), LENSES)

    def test_scores_are_in_range_for_every_intent(self):
        for lens, row in self.priors["lenses"].items():
            for intent in ("save", "reach", "send", "sell"):
                self.assertGreaterEqual(row[intent], 0, (lens, intent))
                self.assertLessEqual(row[intent], 100, (lens, intent))
        for fam, row in self.priors["families"].items():
            self.assertIn(fam, self.spec_schema["$defs"]["hookFamily"]["enum"])
            for intent in ("save", "reach", "send", "sell"):
                self.assertIn(row[intent]["score"], (25, 50, 70, 85), (fam, intent))

    def test_tiers_follow_the_stated_method(self):
        tiers = sorted(self.priors["method"]["tiers"].values(), key=lambda t: -t["minLift"])
        floor_sample = self.priors["method"]["minSample"]
        for fam, row in self.priors["families"].items():
            for intent in ("save", "reach", "send", "sell"):
                entry = row[intent]
                usable = [e for e in entry.get("evidence", []) if e["tag"] == "D-own" and e["n"] >= floor_sample]
                if not usable:
                    self.assertEqual(entry["score"], self.priors["method"]["neutralScore"], (fam, intent))
                    continue
                best = max(e["lift"] for e in usable)
                expected = next(t["score"] for t in tiers if best >= t["minLift"])
                self.assertEqual(entry["score"], expected, (fam, intent))
                for e in usable:
                    self.assertAlmostEqual(e["lift"], round(e["value"] / e["baseline"], 2), places=2)

    def test_a_lens_inherits_its_best_family(self):
        for lens, row in self.priors["lenses"].items():
            for intent in ("save", "reach", "send", "sell"):
                scores = [self.priors["families"][f][intent]["score"] for f in row["families"] if f in self.priors["families"]]
                self.assertEqual(row[intent], max(scores) if scores else 50, (lens, intent))

    def test_reference_numbers_are_the_research_numbers(self):
        ref = self.priors["reference"]
        self.assertEqual(ref["baseline"]["medianSaves"], 7)
        self.assertEqual(ref["topCarousel"], {"views": 5371, "saves": 699, "shares": 492, "family": "P2"})
        fams = self.priors["families"]
        self.assertEqual(fams["P11"]["save"]["evidence"][0]["value"], 22)
        self.assertEqual(fams["P2"]["save"]["evidence"][0]["value"], 15)
        self.assertEqual(fams["P1"]["save"]["evidence"][0]["value"], 13)
        self.assertEqual(fams["F17"]["save"]["evidence"][0]["value"], 12.5)
        self.assertEqual(self.priors["modifiers"]["numeralInLine1"]["lift"], 1.83)

    def test_no_account_identity_in_the_public_file(self):
        raw = read("content-angles/data/priors.json")
        self.assertNotRegex(raw, r"@[A-Za-z0-9._]{3,}")


class WaveTwoLaneContracts(unittest.TestCase):
    """Agent-facing instructions must supply the inputs, owners and stops their commands need."""

    @classmethod
    def setUpClass(cls):
        cls.repo = support.SKILLS.parents[2]
        cls.rounds = read("carousel-create/references/rounds.md")
        cls.skill = read("carousel-create/SKILL.md")
        cls.flow = read("carousel-create/references/flow.md")
        cls.charter = (cls.repo / "team/charter.md").read_text(encoding="utf-8")

    def test_fast_lab_has_a_two_slide_spec_before_it_reads_it(self):
        fast = self.rounds.split("## 4. Team fast lane", 1)[1].split("## 5.", 1)[0]
        self.assertLess(fast.index("provisional two-slide"), fast.index("render.mjs --covers"))
        self.assertLess(fast.index("script_to_spec.py --script"), fast.index("render.mjs --covers"))
        self.assertIn("completes the same spec", fast)

    def test_writer_and_lane_docs_distinguish_team_from_ready_slide_counts(self):
        writer = (self.repo / "team/roles/cs-copywriter.md").read_text(encoding="utf-8")
        self.assertIn("4 to 10 slides including the cover; 4 to 6 is complete", writer)
        for text in (writer, self.skill, self.rounds, self.flow, self.charter, read("carousel-create/references/ready-script.md")):
            with self.subTest(text=text[:50]):
                self.assertRegex(text, r"[Rr]eady[^\n.]{0,100}2 to 10")

    def test_guided_and_fast_name_the_consumed_fill_pipeline(self):
        self.assertNotIn("caption-pack.json", self.rounds)
        for text in (self.rounds.split("### Round 3:", 1)[1].split("### Round 4:", 1)[0],
                     self.rounds.split("## 4. Team fast lane", 1)[1].split("## 5.", 1)[0]):
            self.assertIn("script_to_spec.py --script <post>/script.md --brand brand.json --out <post>", text)
            self.assertIn("--spec <post>/spec.json --fill <post>/fill.json --brand brand.json", text)
        self.assertIn("caption fields", self.rounds)
        guided = self.rounds.split("### Round 3:", 1)[1].split("### Round 4:", 1)[0]
        fast = self.rounds.split("## 4. Team fast lane", 1)[1].split("## 5.", 1)[0]
        self.assertIn("--team-mode guided", guided)
        self.assertEqual(fast.count("--team-mode fast"), 2)

    def test_guided_storyboard_is_a_director_decision_without_an_extra_creator_stop(self):
        for text in (self.skill, self.charter):
            row = next(l for l in text.splitlines() if l.startswith("| 4 Design huddle"))
            self.assertEqual(row.split("|")[-2].strip(), "-")
        self.assertIn("Director approves before encoding", self.rounds)
        self.assertNotIn("creator approves it before", self.charter)

    def test_existing_post_routes_through_edit_export_review_and_same_url(self):
        row = next((l for l in self.skill.splitlines() if l.startswith("| An existing post")), "")
        for token in ("copy, style, export", "extracted spec", "spec_edit.py", "QA", "fresh Creative Director", "same URL"):
            self.assertIn(token, row)
        edit = self.flow.split("## 9.", 1)[1].split("## 10.", 1)[0]
        for token in ("spec_edit.py", "QA", "fresh Creative Director", "same URL"):
            self.assertIn(token, edit)
        design = read("carousel-design/SKILL.md")
        chat_edit = next(l for l in design.splitlines() if l.startswith("5. **Edits.**"))
        for token in ("QA", "fresh Creative Director", "same URL"):
            self.assertIn(token, chat_edit)

    def test_full_team_request_precedes_material_and_guided_builds_a_source_pack(self):
        rows = [l for l in self.skill.splitlines() if l.startswith("| ")]
        full = next(i for i, l in enumerate(rows) if "full team" in l)
        material = next(i for i, l in enumerate(rows) if "Source material" in l)
        self.assertLess(full, material)
        round1 = self.rounds.split("### Round 1:", 1)[1].split("### Round 2:", 1)[0]
        self.assertIn("source_pack.py", round1)
        self.assertIn("supplied material", round1)

    def test_qa_routes_copy_blocks_to_writer_and_layout_blocks_to_art(self):
        qa = (self.repo / "team/roles/cs-qa-producer.md").read_text(encoding="utf-8")
        for text in (qa, self.rounds.split("## 1.", 1)[1].split("## 2.", 1)[0]):
            for token in ("copy, source or readback BLOCK", "copywriter fix pass", "editor re-check for Arabic",
                          "spec_edit.py", "layout BLOCK goes to art", "QA re-exports"):
                self.assertIn(token, text)

    def test_compact_art_can_derive_its_optional_visual_inputs(self):
        art = (self.repo / "team/roles/cs-art-director.md").read_text(encoding="utf-8")
        self.assertIn("In fast and ready the visual direction and bold move are optional", art)
        self.assertIn("derive them from the script and the locked cover rather than stopping", art)

    def test_guided_eval_uses_two_pitches_and_fast_prompts_delegate_the_lock(self):
        cases = json.loads(read("carousel-create/evals/evals.json"))["evals"]
        first = next(c for c in cases if c["id"] == 1)
        expected = first["expected_output"] + " " + " ".join(first["expectations"])
        self.assertIn("two pitch directions", expected)
        self.assertIn("safe", expected)
        self.assertIn("bold", expected)
        self.assertIn("panel", expected)
        self.assertNotIn("5 numbered angles", expected)
        self.assertIn("زي ما تشوف", next(c for c in cases if c["id"] == 2)["prompt"])
        behaviour = self.repo / "evals/behaviour"
        one = (behaviour / "bhv-01-guided-stops-at-checkpoint-1/case.yaml").read_text(encoding="utf-8")
        self.assertIn("two pitch directions", one)
        self.assertNotIn("at least 5 numbered angles", one)
        for name in ("bhv-02-fast-mode-valid-spec", "bhv-22-slide-count-warning"):
            self.assertIn("زي ما تشوف", (behaviour / name / "case.yaml").read_text(encoding="utf-8"))

    def test_contract_chunk_ceiling_and_c6_fallback_agree_with_the_gates(self):
        contract = (self.repo / "docs/CONTRACT.md").read_text(encoding="utf-8")
        self.assertNotIn("runtime chunks ≤ 200 KiB", contract)
        c6 = next(l for l in contract.splitlines() if l.startswith("| **C6** "))
        self.assertIn("if that type has none, count item and step slides", c6)

    def test_contributor_budget_matches_ci_and_documents_the_raise(self):
        contributing = (self.repo / "CONTRIBUTING.md").read_text(encoding="utf-8")
        ci = (self.repo / ".github/workflows/ci.yml").read_text(encoding="utf-8")
        package = json.loads((self.repo / "package.json").read_text(encoding="utf-8"))
        budget = re.search(r"--repo-max-files (\d+)", package["scripts"]["check:repo"]).group(1)
        self.assertIn("--repo-max-files " + budget, ci)
        self.assertIn("--repo-max-files " + budget, contributing)
        self.assertIn("Raised to " + budget, contributing)
        self.assertIn("it has 347", contributing)

    def test_privacy_discloses_both_local_browser_downloads_and_consent(self):
        privacy = (self.repo / "PRIVACY.md").read_text(encoding="utf-8")
        row = next((l for l in privacy.splitlines() if l.startswith("| You ask for a local render in Claude Code")), "")
        for token in ("After you agree", "npm install playwright-core", "npx playwright install chromium",
                      "Nothing from your post is sent", "Chromium download host"):
            self.assertIn(token, row)


if __name__ == "__main__":
    unittest.main()
