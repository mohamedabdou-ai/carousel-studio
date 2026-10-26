"""Tests for tools/sync_shared.py. Run: python -m unittest discover -s tests/unit/py -p "test_*.py"."""

from __future__ import annotations

import ast
import contextlib
import io
import json
import shutil
import tempfile
import sys
import unittest
from pathlib import Path

HERE = str(Path(__file__).resolve().parent)
if HERE not in sys.path:   # so that `python -m unittest tests.unit.py.test_sync_shared` also works from the repository root
    sys.path.insert(0, HERE)
import b7_support as support  # noqa: E402

REPO = Path(__file__).resolve().parents[3]
ss = support.load_tool("sync_shared.py")

CS_MODULES = ("__init__", "paths", "schema", "canon", "text", "color", "rules", "lint", "report")

# IS-4: what the visual language adds to carousel-create. Every one of these sources may be absent until its owner ships it.
ICON_FILES = ("pack.json", "index.json", "concepts.json", "objects.json", "stem.json", "emoji-map.json")
VISUAL_FILES = [f"data/icons/{n}" for n in ICON_FILES] + ["data/art-direction.json", "data/art/scenes.json", "scripts/icon_search.py", "scripts/art_direct.py"]


class SyncFixture:
    """A repository with a canonical carousel-design folder holding every source the manifest names."""

    def __init__(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        self.skills = self.root / ss.SKILLS_REL
        self.design = self.skills / ss.SOURCE_SKILL
        for entry in {e for entries in ss.MANIFEST.values() for e in entries}:
            for name in entry.names:
                if "*" in name:
                    names = [f"{m}.py" for m in CS_MODULES] if entry.src_dir == "scripts/_cs" else ["eg.json", "en.json"]
                else:
                    names = [name]
                for n in names:
                    self.write(self.design / entry.src_dir / n, f"{entry.src_dir}/{n}\n")
        for name in ss.LEGAL_MIRRORS:
            self.write(self.root / name, f"legal {name}\n")

    @staticmethod
    def write(path: Path, content: str | bytes) -> Path:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content if isinstance(content, bytes) else content.encode("utf-8"))
        return path

    def run(self, *args: str) -> tuple[int, str]:
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            code = ss.main(["--root", str(self.root), *args])
        return code, out.getvalue()

    def close(self) -> None:
        self._tmp.cleanup()


class SyncSharedTest(unittest.TestCase):
    def setUp(self) -> None:
        self.fx = SyncFixture()
        self.addCleanup(self.fx.close)

    def dest(self, skill: str, rel: str) -> Path:
        return self.fx.skills / skill / rel

    def test_check_fails_before_the_first_sync_then_passes_after(self) -> None:
        self.assertEqual(self.fx.run("--check")[0], ss.EXIT_DRIFT)
        self.assertEqual(self.fx.run()[0], ss.EXIT_OK)
        self.assertEqual(self.fx.run("--check")[0], ss.EXIT_OK)

    def test_manifest_destinations(self) -> None:
        self.fx.run()
        expected = [
            ("carousel-create", "data/schemas/spec.schema.json"),
            ("carousel-create", "data/dialects/eg.json"),
            ("carousel-create", "scripts/validate.py"),
            ("carousel-create", "scripts/_cs/lint.py"),
            ("content-angles", "scripts/_cs/text.py"),
            ("brand-setup", "data/schemas/brand.schema.json"),
            ("brand-setup", "scripts/_cs/color.py"),
            ("arabic-proofread", "data/qa-rules.json"),
            ("arabic-proofread", "scripts/_cs/report.py"),
            ("content-plan", "data/schemas/plan.schema.json"),
            ("content-plan", "scripts/_cs/canon.py"),
            # the free design lane: the contract goes to every skill that runs validate.py or a _cs module, the validator to the two that validate a document
            ("carousel-create", "data/free-design.json"),
            ("brand-setup", "data/free-design.json"),
            ("content-plan", "data/free-design.json"),
            ("content-angles", "data/free-design.json"),
            ("arabic-proofread", "data/free-design.json"),
            ("carousel-create", "scripts/_cs/free.py"),
            ("brand-setup", "scripts/_cs/free.py"),
            ("content-plan", "scripts/_cs/free.py"),
        ]
        for skill, rel in expected:
            self.assertTrue(self.dest(skill, rel).is_file(), f"{skill}/{rel} was not copied")
        not_expected = [
            ("content-angles", "scripts/_cs/lint.py"),  # content-angles gets only __init__, paths, text
            ("brand-setup", "scripts/_cs/lint.py"),
            ("content-plan", "data/qa-rules.json"),
            ("arabic-proofread", "scripts/validate.py"),
            ("content-angles", "scripts/_cs/free.py"),
            ("arabic-proofread", "scripts/_cs/free.py"),
        ]
        for skill, rel in not_expected:
            self.assertFalse(self.dest(skill, rel).exists(), f"{skill}/{rel} must not be copied")
        self.assertEqual(list((self.fx.skills / "visual-prompts").glob("**/*")), [])

    def test_copies_are_byte_identical_including_crlf(self) -> None:
        source = self.fx.design / "data" / "qa-rules.json"
        payload = b'{"a": "\xd8\xb9\xd8\xb1\xd8\xa8\xd9\x8a"}\r\n'
        source.write_bytes(payload)
        self.fx.run()
        self.assertEqual(self.dest("carousel-create", "data/qa-rules.json").read_bytes(), payload)

    def test_changed_copy_and_changed_source_are_both_drift(self) -> None:
        self.fx.run()
        copy = self.dest("carousel-create", "data/rules/copy.json")
        copy.write_text("edited in the wrong place\n", encoding="utf-8")
        code, out = self.fx.run("--check")
        self.assertEqual(code, ss.EXIT_DRIFT)
        self.assertIn("carousel-create/data/rules/copy.json", out)
        self.fx.run()
        self.fx.write(self.fx.design / "data" / "rules" / "copy.json", "new canonical text\n")
        self.assertEqual(self.fx.run("--check")[0], ss.EXIT_DRIFT)
        self.fx.run()
        self.assertEqual(copy.read_text(encoding="utf-8"), "new canonical text\n")

    def test_check_never_writes(self) -> None:
        self.fx.run("--check")
        self.assertFalse(self.dest("carousel-create", "data/qa-rules.json").exists())

    def test_orphans_are_reported_and_only_removed_with_prune(self) -> None:
        self.fx.run()
        orphan = self.fx.write(self.dest("content-angles", "scripts/_cs/old_module.py"), "stale\n")
        pycache = self.fx.write(self.dest("content-angles", "scripts/_cs/__pycache__/x.pyc"), b"\x00")
        own_file = self.fx.write(self.dest("carousel-create", "scripts/lint_copy.py"), "skill's own script\n")
        code, out = self.fx.run("--check")
        self.assertEqual(code, ss.EXIT_DRIFT)
        self.assertIn("old_module.py", out)
        self.assertNotIn("x.pyc", out)
        self.assertNotIn("lint_copy.py", out)  # scripts/ is not a mirrored folder
        self.assertEqual(self.fx.run()[0], ss.EXIT_OK)
        self.assertTrue(orphan.exists())
        self.assertEqual(self.fx.run("--prune")[0], ss.EXIT_OK)
        self.assertFalse(orphan.exists())
        self.assertTrue(pycache.exists())
        self.assertTrue(own_file.exists())
        self.assertEqual(self.fx.run("--check")[0], ss.EXIT_OK)

    def test_missing_source_is_reported_not_skipped(self) -> None:
        (self.fx.design / "data" / "qa-rules.json").unlink()
        shutil.rmtree(self.fx.design / "data" / "dialects")
        code, out = self.fx.run()
        self.assertEqual(code, ss.EXIT_NO_INPUT)
        self.assertIn("source missing", out)
        self.assertIn("data/qa-rules.json", out)
        self.assertIn("data/dialects/*.json", out)
        self.assertTrue(self.dest("carousel-create", "data/schemas/spec.schema.json").is_file())  # the rest still synced
        self.assertEqual(self.fx.run("--check")[0], ss.EXIT_NO_INPUT)

    def test_legal_files_are_mirrored_into_the_plugin(self) -> None:
        self.fx.run()
        for name in ss.LEGAL_MIRRORS:
            self.assertEqual((self.fx.root / ss.PLUGIN_REL / name).read_text(encoding="utf-8"), f"legal {name}\n")
        self.fx.write(self.fx.root / "NOTICE", "changed\n")
        code, out = self.fx.run("--check")
        self.assertEqual(code, ss.EXIT_DRIFT)
        self.assertIn("plugins/carousel-studio/NOTICE", out)

    def test_json_output(self) -> None:
        code, out = self.fx.run("--format", "json")
        report = json.loads(out)
        self.assertEqual(code, ss.EXIT_OK)
        self.assertTrue(report["ok"])
        self.assertEqual(report["mode"], "sync")
        self.assertGreater(report["counts"]["create"], 0)
        code, out = self.fx.run("--check", "--format", "json")
        self.assertEqual(json.loads(out)["counts"]["ok"], len(json.loads(out)["items"]))

    def test_usage_errors(self) -> None:
        self.assertEqual(self.fx.run("--check", "--prune")[0], ss.EXIT_USAGE)
        self.assertEqual(ss.main(["--bogus"]), ss.EXIT_USAGE)
        self.assertEqual(ss.main(["--root", str(self.fx.root / "nowhere")]), ss.EXIT_NO_INPUT)

    # -- the visual language (round 3, IS-4) ---------------------------------

    def test_visual_language_destinations(self) -> None:
        self.fx.run()
        for rel in VISUAL_FILES:
            copy = self.dest("carousel-create", rel)
            self.assertTrue(copy.is_file(), f"carousel-create/{rel} was not copied")
            self.assertEqual(copy.read_bytes(), (self.fx.design / rel).read_bytes(), rel)
        for skill in ("content-angles", "brand-setup", "arabic-proofread", "content-plan", "visual-prompts"):
            for rel in VISUAL_FILES:
                self.assertFalse(self.dest(skill, rel).exists(), f"{skill}/{rel} must not be copied")
        self.assertFalse(self.dest("carousel-create", "data/art/marks.json").exists(), "the marks are drawn by the Studio only")

    def test_the_optional_entries_are_exactly_the_is_4_list(self) -> None:
        optional = {(e.src_dir, n) for skill, entries in ss.MANIFEST.items() for e in entries if e.optional for n in e.names}
        expected = {(rel.rsplit("/", 1)[0], rel.rsplit("/", 1)[1]) for rel in VISUAL_FILES}
        self.assertEqual(optional, expected)
        self.assertEqual({skill for skill, entries in ss.MANIFEST.items() if any(e.optional for e in entries)}, {"carousel-create"})
        for entries in ss.MANIFEST.values():
            for e in entries:
                if e.optional:
                    self.assertEqual(e.src_dir, e.dest_dir, "an optional entry mirrors its folder")

    def test_new_entries_are_idempotent(self) -> None:
        self.assertEqual(self.fx.run()[0], ss.EXIT_OK)
        _, again = self.fx.run()
        self.assertNotIn("created", again)
        self.assertNotIn("updated", again)
        self.assertEqual(self.fx.run("--check")[0], ss.EXIT_OK)
        self.assertEqual(self.fx.run("--check", "--strict")[0], ss.EXIT_OK, "with every source shipped, strict is no different")
        self.assertEqual(self.fx.run("--check")[0], ss.EXIT_OK)

    def hide_visual_sources(self) -> list:
        gone = []
        for rel in VISUAL_FILES:
            path = self.fx.design / rel
            path.unlink()
            gone.append(rel)
        return gone

    def test_sources_not_shipped_yet_are_pending_and_skipped(self) -> None:
        gone = self.hide_visual_sources()
        code, out = self.fx.run()
        self.assertEqual(code, ss.EXIT_OK)
        self.assertIn(f"{len(gone)} pending", out)
        self.assertNotIn("source missing", out)
        self.assertEqual(self.fx.run("--check")[0], ss.EXIT_OK)
        for rel in VISUAL_FILES:
            self.assertFalse(self.dest("carousel-create", rel).exists())
        self.assertFalse(self.dest("carousel-create", "data/icons").exists(), "no empty mirror folder is created for sources that do not exist")
        self.assertTrue(self.dest("carousel-create", "data/schemas/spec.schema.json").is_file(), "the rest still synced")

    def test_pending_files_are_listed_only_with_verbose(self) -> None:
        self.hide_visual_sources()
        _, quiet = self.fx.run("--check")
        _, verbose = self.fx.run("--check", "--verbose")
        self.assertNotIn("icon_search.py", quiet)
        self.assertIn("icon_search.py", verbose)
        self.assertIn("pending", verbose)

    def test_strict_turns_pending_into_missing_sources(self) -> None:
        gone = self.hide_visual_sources()
        for args in (("--strict",), ("--check", "--strict")):
            code, out = self.fx.run(*args)
            self.assertEqual(code, ss.EXIT_NO_INPUT, args)
            self.assertEqual(out.count("source missing"), len(gone) + 1, args)       # one line per file and the summary
            self.assertIn("scripts/art_direct.py", out)
            self.assertNotIn("pending", out)
        code, out = self.fx.run("--check", "--strict", "--format", "json")
        report = json.loads(out)
        self.assertFalse(report["ok"])
        self.assertEqual(report["counts"]["missing-source"], len(gone))
        self.assertEqual(report["counts"]["pending"], 0)

    def test_json_report_counts_pending(self) -> None:
        gone = self.hide_visual_sources()
        report = json.loads(self.fx.run("--format", "json")[1])
        self.assertTrue(report["ok"])
        self.assertEqual(report["counts"]["pending"], len(gone))
        self.assertEqual(len([i for i in report["items"] if i["status"] == "pending"]), len(gone))

    def test_a_required_source_is_still_an_error_beside_pending_ones(self) -> None:
        self.hide_visual_sources()
        (self.fx.design / "data" / "qa-rules.json").unlink()
        code, out = self.fx.run()
        self.assertEqual(code, ss.EXIT_NO_INPUT)
        self.assertIn("data/qa-rules.json", out)

    def test_a_shipped_source_that_vanishes_leaves_an_orphan_in_the_mirror(self) -> None:
        self.fx.run()
        (self.fx.design / "data" / "icons" / "pack.json").unlink()
        code, out = self.fx.run("--check")
        self.assertEqual(code, ss.EXIT_DRIFT)
        self.assertIn("data/icons/pack.json", out)
        self.assertEqual(self.fx.run("--prune")[0], ss.EXIT_OK)
        self.assertFalse(self.dest("carousel-create", "data/icons/pack.json").exists())
        self.assertEqual(self.fx.run("--check")[0], ss.EXIT_OK)

    def test_a_stray_file_in_the_icon_and_art_mirrors_is_an_orphan(self) -> None:
        self.fx.run()
        for rel in ("data/icons/stray.json", "data/art/marks.json"):
            self.fx.write(self.dest("carousel-create", rel), "stray\n")
        code, out = self.fx.run("--check")
        self.assertEqual(code, ss.EXIT_DRIFT)
        self.assertIn("data/icons/stray.json", out)
        self.assertIn("data/art/marks.json", out)

    def test_edited_copy_of_a_new_file_is_drift(self) -> None:
        self.fx.run()
        self.dest("carousel-create", "scripts/icon_search.py").write_text("edited in the wrong place\n", encoding="utf-8")
        code, out = self.fx.run("--check")
        self.assertEqual(code, ss.EXIT_DRIFT)
        self.assertIn("scripts/icon_search.py", out)
        self.fx.run()
        self.assertEqual(self.dest("carousel-create", "scripts/icon_search.py").read_text(encoding="utf-8"), "scripts/icon_search.py\n")

    def test_verbose_lists_files_already_in_sync(self) -> None:
        self.fx.run()
        _, quiet = self.fx.run()
        _, verbose = self.fx.run("--verbose")
        self.assertNotIn("data/qa-rules.json", quiet)
        self.assertIn("data/qa-rules.json", verbose)


class SharedModulesStayClosedTest(unittest.TestCase):
    """_cs/__init__.py: a synced skill must never import a module it did not receive. Checked on the real modules against the real manifest,
    so that a new import between two _cs modules (round 3 adds icons, space, art_plan and qa_visual) cannot break a skill that gets a named subset."""

    def test_every_synced_module_imports_only_modules_its_skill_receives(self) -> None:
        canon = REPO / ss.SKILLS_REL / ss.SOURCE_SKILL / "scripts" / "_cs"
        present = {p.stem for p in canon.glob("*.py")}
        checked = 0
        for skill, entries in ss.MANIFEST.items():
            received: set[str] = set()
            for entry in entries:
                if entry.src_dir == "scripts/_cs":
                    names, _ = ss._expand(canon, entry.names)
                    received |= {Path(n).stem for n in names}
            for module in sorted(received):
                tree = ast.parse((canon / f"{module}.py").read_text(encoding="utf-8"))
                for node in ast.walk(tree):
                    if not isinstance(node, ast.ImportFrom):
                        continue
                    if node.level == 1:
                        wanted = {node.module.split(".")[0]} if node.module else {a.name for a in node.names if a.name in present}
                    elif node.level == 0 and node.module and node.module.split(".")[0] == "_cs":
                        parts = node.module.split(".")
                        wanted = {parts[1]} if len(parts) > 1 else {a.name for a in node.names if a.name in present}
                    else:
                        continue
                    checked += 1
                    self.assertFalse(wanted - received, f"{skill}: _cs/{module}.py imports {sorted(wanted - received)}, which the manifest does not copy to it")
        self.assertGreater(checked, 5)


if __name__ == "__main__":
    unittest.main()
