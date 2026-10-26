"""Tests for tools/release.py: version agreement, the checks, and a reproducible archive with a SHA-256 file.

Run: python -m unittest discover -s tests/unit/py -p "test_release.py"
"""

from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
SCRIPT = REPO / "tools" / "release.py"
ENV = {**os.environ, "PYTHONIOENCODING": "utf-8", "PYTHONUTF8": "1"}


def run(*args: str) -> subprocess.CompletedProcess:
    return subprocess.run([sys.executable, str(SCRIPT), *args], capture_output=True, text=True, encoding="utf-8", env=ENV, timeout=600)


def current_version() -> str:
    return json.loads((REPO / "plugins" / "carousel-studio" / ".claude-plugin" / "plugin.json").read_text(encoding="utf-8"))["version"]


class ReleaseTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = Path(tempfile.mkdtemp(prefix="cs-release-"))
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)
        self.version = current_version()

    def release(self, name: str, *extra: str) -> tuple[subprocess.CompletedProcess, Path]:
        out = self.tmp / name
        return run("--version", self.version, "--out", str(out), "--checks", "none", *extra), out

    def test_writes_a_zip_and_a_matching_sha256_file(self) -> None:
        res, out = self.release("a")
        self.assertEqual(res.returncode, 0, res.stdout + res.stderr)
        zip_path = out / ("carousel-studio-%s.zip" % self.version)
        line = (out / (zip_path.name + ".sha256")).read_text(encoding="utf-8")
        digest, name = line.strip().split("  ")
        self.assertEqual(name, zip_path.name)
        self.assertEqual(digest, hashlib.sha256(zip_path.read_bytes()).hexdigest())
        self.assertTrue(line.endswith("\n") and "\r" not in line)

    def test_the_archive_has_one_top_folder_and_the_plugin_files(self) -> None:
        _, out = self.release("a")
        with zipfile.ZipFile(out / ("carousel-studio-%s.zip" % self.version)) as zf:
            self.assertIsNone(zf.testzip())
            names = zf.namelist()
        self.assertTrue(all(n.startswith("carousel-studio/") for n in names))
        for needed in ("carousel-studio/.claude-plugin/plugin.json", "carousel-studio/LICENSE", "carousel-studio/NOTICE",
                       "carousel-studio/README.md", "carousel-studio/skills/carousel-create/SKILL.md"):
            self.assertIn(needed, names)
        plugin_files = [p for p in (REPO / "plugins" / "carousel-studio").rglob("*") if p.is_file() and "__pycache__" not in p.parts and p.suffix != ".pyc"]
        self.assertEqual(len(names), len(plugin_files))

    def test_nothing_machine_specific_goes_in(self) -> None:
        _, out = self.release("a")
        with zipfile.ZipFile(out / ("carousel-studio-%s.zip" % self.version)) as zf:
            names = zf.namelist()
        for bad in ("__pycache__", ".pyc", ".DS_Store", "node_modules", ".git/", ".local.json"):
            self.assertFalse([n for n in names if bad in n], bad)
        self.assertFalse([n for n in names if "\\" in n], "entries use forward slashes")

    def test_entries_are_sorted_with_fixed_times(self) -> None:
        _, out = self.release("a")
        with zipfile.ZipFile(out / ("carousel-studio-%s.zip" % self.version)) as zf:
            infos = zf.infolist()
        names = [i.filename for i in infos]
        self.assertEqual(names, sorted(names))
        self.assertTrue(all(i.date_time == (1980, 1, 1, 0, 0, 0) for i in infos))

    def test_the_archive_is_reproducible(self) -> None:
        _, a = self.release("a")
        _, b = self.release("b")
        name = "carousel-studio-%s.zip" % self.version
        self.assertEqual((a / name).read_bytes(), (b / name).read_bytes())

    def test_scripts_keep_their_executable_bit(self) -> None:
        _, out = self.release("a")
        with zipfile.ZipFile(out / ("carousel-studio-%s.zip" % self.version)) as zf:
            modes = {i.filename: (i.external_attr >> 16) & 0o777 for i in zf.infolist()}
        self.assertEqual(modes["carousel-studio/skills/carousel-create/scripts/compress.py"], 0o755)
        self.assertEqual(modes["carousel-studio/LICENSE"], 0o644)

    def test_a_version_that_disagrees_with_the_tree_stops_the_release(self) -> None:
        res = run("--version", "9.9.9", "--out", str(self.tmp / "x"), "--checks", "none")
        self.assertEqual(res.returncode, 2)
        self.assertIn("expected 9.9.9", res.stdout)
        self.assertIn("Release stopped", res.stdout)
        self.assertFalse((self.tmp / "x").exists(), "nothing is written when the release is refused")

    def test_every_disagreeing_place_is_named(self) -> None:
        res = run("--version", "9.9.9", "--out", str(self.tmp / "x"), "--checks", "none", "--format", "json")
        data = json.loads(res.stdout)
        text = "\n".join(data["versionProblems"])
        for place in ("plugin.json", "marketplace.json (metadata)", "marketplace.json (plugin entry)", "package.json", "__version__", "CS.version", "CHANGELOG.md"):
            self.assertIn(place, text)
        self.assertFalse(data["ok"])

    def clean_copy(self) -> Path:
        """The repository as a fresh checkout has it: no `__pycache__` (running any plugin script writes one, and the directory check
        warns about it although the archive leaves it out), no installed packages, no generated examples or release output."""
        top = {"node_modules", "examples", ".git", "release", "out", "dist", "coverage", "workspace"}
        junk = shutil.ignore_patterns("__pycache__", "*.pyc", ".pytest_cache", ".ruff_cache", ".mypy_cache")

        def ignore(folder: str, names: list[str]) -> set[str]:
            skipped = set(junk(folder, names))
            if Path(folder) == REPO:
                skipped |= top & set(names)
            return skipped

        root = self.tmp / "checkout"
        shutil.copytree(REPO, root, ignore=ignore)
        return root

    def test_the_fast_checks_run_and_pass(self) -> None:
        res = run("--version", self.version, "--root", str(self.clean_copy()), "--out", str(self.tmp / "c"), "--checks", "sync,directory", "--format", "json")
        self.assertEqual(res.returncode, 0, res.stdout + res.stderr)
        data = json.loads(res.stdout)
        self.assertTrue(data["ok"])
        self.assertTrue(data["checks"]["sync"]["ok"] and data["checks"]["directory"]["ok"])

    def test_pre_release_versions_are_accepted_by_the_parser(self) -> None:
        res = run("--version", "1.1.0-rc.1", "--out", str(self.tmp / "p"), "--checks", "none")
        self.assertEqual(res.returncode, 2, "well-formed, but the tree still says another version")

    def test_usage_errors(self) -> None:
        for args in (("--version", "x"), ("--version", "1.0"), ("--version", self.version, "--checks", "nonsense"), ()):
            res = run(*args)
            self.assertEqual(res.returncode, 64, args)
            self.assertNotIn("Traceback", res.stderr)
        self.assertEqual(run("--version", self.version, "--root", str(self.tmp)).returncode, 66)

    def test_help(self) -> None:
        res = run("--help")
        self.assertEqual(res.returncode, 0)
        self.assertIn("--checks", res.stdout)


def load_release_module():
    import importlib.util
    spec = importlib.util.spec_from_file_location("release_under_test", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class ListingAndManifestTests(unittest.TestCase):
    """check_listing and check_manifest are what stop a release whose listing fields or contents drifted."""

    @classmethod
    def setUpClass(cls) -> None:
        cls.rel = load_release_module()
        cls.addClassCleanup(sys.modules.pop, "release_under_test", None)

    def setUp(self) -> None:
        self.tmp = Path(tempfile.mkdtemp(prefix="cs-listing-"))
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)
        plugin = self.tmp / self.rel.PLUGIN_DIR
        (plugin / ".claude-plugin").mkdir(parents=True)
        (plugin / "assets").mkdir()
        (self.tmp / "tools").mkdir()
        shutil.copy(REPO / "tools" / "identity.json", self.tmp / "tools" / "identity.json")
        shutil.copy(REPO / self.rel.PLUGIN_DIR / ".claude-plugin" / "plugin.json", plugin / ".claude-plugin" / "plugin.json")
        (plugin / "assets" / "icon.png").write_bytes(b"png")
        # the tree the manifest describes: folders and files named like the real ones
        manifest = json.loads((REPO / "v1-manifest.json").read_text(encoding="utf-8"))
        for key, folder, suffix in (("skills", "skills", None), ("commands", "commands", ".md"), ("agents", "agents", ".md"), ("presets", "skills/carousel-design/styles", None)):
            for name in manifest[key]:
                if suffix:
                    (plugin / folder).mkdir(parents=True, exist_ok=True)
                    (plugin / folder / (name + suffix)).write_text("x", encoding="utf-8")
                else:
                    (plugin / folder / name).mkdir(parents=True, exist_ok=True)
        shutil.copy(REPO / "v1-manifest.json", self.tmp / "v1-manifest.json")
        self.version = current_version()

    def plugin_json(self) -> Path:
        return self.tmp / self.rel.PLUGIN_DIR / ".claude-plugin" / "plugin.json"

    def test_the_real_tree_passes_both(self) -> None:
        self.assertEqual(self.rel.check_listing(REPO), [])
        self.assertEqual(self.rel.check_manifest(REPO, self.version), [])

    def test_a_listing_field_that_differs_from_identity_json_is_named(self) -> None:
        self.assertEqual(self.rel.check_listing(self.tmp), [])
        doc = json.loads(self.plugin_json().read_text(encoding="utf-8"))
        doc["privacyPolicyUrl"] = "https://example.com/other"
        del doc["documentationUrl"]
        self.plugin_json().write_text(json.dumps(doc), encoding="utf-8")
        problems = "\n".join(self.rel.check_listing(self.tmp))
        self.assertIn("privacyPolicyUrl", problems)
        self.assertIn("documentationUrl", problems)

    def test_a_missing_icon_file_is_named(self) -> None:
        (self.tmp / self.rel.PLUGIN_DIR / "assets" / "icon.png").unlink()
        self.assertIn("icon", "\n".join(self.rel.check_listing(self.tmp)))

    def test_the_manifest_must_match_the_tree(self) -> None:
        self.assertEqual(self.rel.check_manifest(self.tmp, self.version), [])
        shutil.rmtree(self.tmp / self.rel.PLUGIN_DIR / "skills" / "content-plan")
        (self.tmp / self.rel.PLUGIN_DIR / "agents" / "cs-extra.md").write_text("x", encoding="utf-8")
        problems = "\n".join(self.rel.check_manifest(self.tmp, self.version))
        self.assertIn("content-plan", problems)
        self.assertIn("cs-extra", problems)

    def test_a_deferred_preset_may_not_ship_and_the_version_must_agree(self) -> None:
        (self.tmp / self.rel.PLUGIN_DIR / "skills" / "carousel-design" / "styles" / "editorial").mkdir()
        problems = "\n".join(self.rel.check_manifest(self.tmp, self.version))
        self.assertIn("preset-editorial", problems)
        self.assertIn("version", "\n".join(self.rel.check_manifest(self.tmp, "9.9.9")))


if __name__ == "__main__":
    unittest.main()
