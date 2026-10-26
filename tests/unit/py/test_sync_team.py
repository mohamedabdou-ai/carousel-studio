"""tools/sync_team.py: the creative team has one source (team/), and everything generated from it follows."""
from __future__ import annotations

import contextlib
import importlib.util
import io
import json
import re
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
spec = importlib.util.spec_from_file_location("sync_team_under_test", REPO / "tools" / "sync_team.py")
ST = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = ST  # the tool declares dataclasses, which look their module up by name
spec.loader.exec_module(ST)

ROLES = ["cs-arabic-editor", "cs-art-director", "cs-audience-panel", "cs-copywriter", "cs-creative-director", "cs-motion-designer", "cs-qa-producer", "cs-strategist", "cs-visual-artist"]


def run(root, *args):
    out, err = io.StringIO(), io.StringIO()
    with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
        code = ST.main(["--root", str(root), *args])
    return code, out.getvalue(), err.getvalue()


class TestSyncTeam(unittest.TestCase):
    def setUp(self):
        self.root = Path(tempfile.mkdtemp(prefix="cs-team-"))
        self.addCleanup(shutil.rmtree, self.root, ignore_errors=True)
        shutil.copytree(REPO / "team", self.root / "team")
        for rel in (ST.AGENTS_REL, ST.REFS_REL):
            shutil.copytree(REPO / rel, self.root / rel)

    def test_the_shipped_tree_is_in_sync_and_has_the_nine_agents(self):
        code, out, err = run(REPO, "--check")
        self.assertEqual(code, 0, out + err)
        self.assertEqual(sorted(p.stem for p in (REPO / ST.AGENTS_REL).glob("cs-*.md")), ROLES)
        self.assertEqual(sorted(p.stem for p in (REPO / "team" / "roles").glob("cs-*.md")), ROLES)

    def test_an_edit_in_the_wrong_place_is_caught_and_a_sync_repairs_it(self):
        agent = self.root / ST.AGENTS_REL / "cs-copywriter.md"
        agent.write_text(agent.read_text(encoding="utf-8") + "\nan edit made in the generated file\n", encoding="utf-8")
        self.assertEqual(run(self.root, "--check")[0], 2)
        self.assertEqual(run(self.root)[0], 0)
        self.assertEqual(run(self.root, "--check")[0], 0)
        self.assertNotIn("an edit made in the generated file", agent.read_text(encoding="utf-8"))

    def test_a_change_to_a_role_reaches_the_agent_and_the_reference_copy(self):
        role = self.root / "team" / "roles" / "cs-strategist.md"
        role.write_text(role.read_text(encoding="utf-8") + "\nA new sentence that must travel.\n", encoding="utf-8")
        self.assertEqual(run(self.root, "--check")[0], 2)
        self.assertEqual(run(self.root)[0], 0)
        self.assertIn("A new sentence that must travel.", (self.root / ST.AGENTS_REL / "cs-strategist.md").read_text(encoding="utf-8"))
        self.assertIn("A new sentence that must travel.", (self.root / ST.REFS_REL / "cs-strategist.md").read_text(encoding="utf-8"))

    def test_an_orphan_is_reported_and_pruned_only_on_request(self):
        orphan = self.root / ST.AGENTS_REL / "cs-old-agent.md"
        orphan.write_text("old", encoding="utf-8")
        self.assertEqual(run(self.root, "--check")[0], 2)
        run(self.root)
        self.assertTrue(orphan.exists(), "a plain sync never deletes")
        run(self.root, "--prune")
        self.assertFalse(orphan.exists())

    def test_the_generated_agents_carry_what_the_host_reads(self):
        for name in ROLES:
            text = (REPO / ST.AGENTS_REL / f"{name}.md").read_text(encoding="utf-8")
            head = text.split("---\n")[1]
            self.assertRegex(head, rf"(?m)^name: {name}$")
            self.assertRegex(head, r"(?m)^description: \"")
            self.assertRegex(head, r"(?m)^tools: ")
            self.assertRegex(head, r"(?m)^model: (inherit|sonnet|opus|haiku)$")
            self.assertIn("Generated from team sources", text)
            json.loads(re.search(r'(?m)^description: (".*")$', head).group(1))  # the description is JSON-quoted, so a colon in it cannot break the frontmatter

    def test_a_malformed_role_is_refused_with_its_own_exit_code(self):
        role = self.root / "team" / "roles" / "cs-qa-producer.md"
        role.write_text("no frontmatter here", encoding="utf-8")
        self.assertEqual(run(self.root, "--check")[0], 65)
        self.assertEqual(run(self.root / "nowhere")[0], 66)


if __name__ == "__main__":
    unittest.main()
