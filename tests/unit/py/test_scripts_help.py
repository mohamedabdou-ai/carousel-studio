"""Every script the plugin and the repository ship answers --help without a traceback, and the CI workflow only calls files that exist.

Run: python -m unittest discover -s tests/unit/py -p "test_scripts_help.py"
"""

from __future__ import annotations

import os
import re
import shutil
import subprocess
import sys
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
SKILLS = REPO / "plugins" / "carousel-studio" / "skills"
ENV = {**os.environ, "PYTHONIOENCODING": "utf-8", "PYTHONUTF8": "1"}
NODE = shutil.which("node")


def python_scripts() -> list[Path]:
    found = [p for p in sorted(SKILLS.glob("*/scripts/*.py")) if p.name != "__init__.py"]
    found += [REPO / "tools" / n for n in ("sync_shared.py", "check_directory.py", "release.py", "font_coverage.py")]
    return found


def node_scripts() -> list[Path]:
    found = sorted(SKILLS.glob("*/scripts/*.mjs"))
    found += [REPO / "tools" / n for n in ("build.mjs", "make_examples.mjs")]
    return found


class HelpTests(unittest.TestCase):
    def test_every_python_script_answers_help(self) -> None:
        scripts = python_scripts()
        self.assertGreaterEqual(len(scripts), 20)
        for script in scripts:
            res = subprocess.run([sys.executable, str(script), "--help"], capture_output=True, text=True, encoding="utf-8", env=ENV, timeout=60)
            rel = script.relative_to(REPO).as_posix()
            self.assertEqual(res.returncode, 0, "%s\n%s" % (rel, res.stderr))
            self.assertNotIn("Traceback", res.stderr, rel)
            self.assertIn("usage", res.stdout.lower(), rel)

    @unittest.skipUnless(NODE, "node is not installed")
    def test_every_node_script_answers_help(self) -> None:
        for script in node_scripts():
            res = subprocess.run([NODE, str(script), "--help"], capture_output=True, text=True, encoding="utf-8", env=ENV, timeout=60)
            rel = script.relative_to(REPO).as_posix()
            self.assertEqual(res.returncode, 0, "%s\n%s" % (rel, res.stderr))
            self.assertIn("usage", res.stdout.lower(), rel)

    def test_a_bad_option_is_a_usage_error_not_a_traceback(self) -> None:
        for script in python_scripts():
            res = subprocess.run([sys.executable, str(script), "--no-such-option-zz"], capture_output=True, text=True, encoding="utf-8", env=ENV, timeout=60)
            rel = script.relative_to(REPO).as_posix()
            self.assertNotIn("Traceback", res.stderr, rel)
            self.assertNotEqual(res.returncode, 0, rel)


class CiConfigTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.text = (REPO / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")

    def test_it_has_the_four_jobs_and_both_operating_systems(self) -> None:
        for job in ("policy:", "python:", "node:", "browser:"):
            self.assertIn("\n  " + job, self.text)
        self.assertIn("ubuntu-latest", self.text)
        self.assertIn("windows-latest", self.text)
        self.assertIn('python-version: "3.11"', self.text)
        self.assertIn('node-version: "22"', self.text)

    def test_every_file_it_runs_exists(self) -> None:
        for m in re.finditer(r"\b(?:python|node)\s+((?:tools|tests|plugins)/[\w./-]+)", self.text):
            self.assertTrue((REPO / m.group(1)).is_file(), m.group(1))

    def test_every_test_glob_it_runs_matches_files(self) -> None:
        for m in re.finditer(r'node --test "([^"]+)"', self.text):
            self.assertTrue(list(REPO.glob(m.group(1))), m.group(1))

    def test_actions_are_pinned_to_a_major_version(self) -> None:
        for m in re.finditer(r"uses:\s*(\S+)", self.text):
            self.assertRegex(m.group(1), r"@v\d+$", m.group(1))

    def test_no_secrets_urls_or_write_permissions(self) -> None:
        self.assertNotRegex(self.text, r"https?://")
        self.assertNotIn("secrets.", self.text)
        self.assertIn("contents: read", self.text)
        self.assertNotIn("contents: write", self.text)

    def test_it_uses_lf_line_endings(self) -> None:
        self.assertNotIn("\r", self.text)


if __name__ == "__main__":
    unittest.main()
