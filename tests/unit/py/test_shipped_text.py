"""The Arabic text the plugin shows or ships follows the plugin's own spelling, digit and bidi rules (ortho_lint, run over the product's own words).

The proofreading rules are the product's promise; a BLOCK-level finding in the product's own strings, guides or README is a bug in the product.
Documents that exist to show wrong spellings or the other digit system (the proofreading references, the digit question) are left out, and a line
that talks about the two digit systems on purpose is not judged for digits.
"""
from __future__ import annotations

import json
import re
import unittest
from pathlib import Path

try:
    import b7_support as support
except ImportError:  # `python -m unittest tests.unit.py.test_shipped_text` (the policy job): the folder is a package here, not a search-path entry
    from . import b7_support as support

REPO = Path(__file__).resolve().parents[3]
SKILLS = REPO / "plugins" / "carousel-studio" / "skills"
lint = None


def setUpModule() -> None:
    """The proofreading library is imported for this module only; the search path and `_cs` are put back in tearDownModule."""
    global lint
    support.prepare("carousel-design")
    from _cs import lint as _lint  # noqa: PLC0415
    lint = _lint


def tearDownModule() -> None:
    support.cleanup()


ARABIC = re.compile(r"[؀-ۿ]")
DIGIT_RULES = ("ORTHO-DIG-001", "ORTHO-DIG-002", "ORTHO-DIG-003")
DIALECTS = ("eg", "gulf", "levant", "msa-white", "en")
# these exist to show wrong spellings, the other digit system or a stranded prefix, so their examples are not the product's own text
DOCS_ABOUT_ERRORS = {
    "arabic-proofread/references",
    "carousel-design/references/arabic-type.md",
    "brand-setup/references/question-bank.md",
}


def leaves(value):
    if isinstance(value, str):
        yield value
    elif isinstance(value, dict):
        for item in value.values():
            yield from leaves(item)
    elif isinstance(value, list):
        for item in value:
            yield from leaves(item)


def prose(markdown: str) -> list[str]:
    text = re.sub(r"```.*?```", " ", markdown, flags=re.S)
    text = re.sub(r"`[^`]*`", " ", text)
    text = re.sub(r"https?://\S+", " ", text)
    return [line for line in text.splitlines() if ARABIC.search(line)]


def blocks(text: str, dialect: str, *, dialect_words: bool):
    talks_about_digits = bool(re.search(r"[0-9]", text) and re.search(r"[٠-٩]", text) and re.search(r"«|digit|الأرقام|Western", text))
    found = []
    for item in lint.lint_text(text, dialect=dialect, digits="western"):
        if item["sev"] != "BLOCK" or (item["kind"] == "dialect" and not dialect_words):
            continue
        if item["rule"] in DIGIT_RULES and talks_about_digits:
            continue
        found.append(item["rule"])
    return found


class TestShippedText(unittest.TestCase):
    def test_the_studio_strings_in_every_dialect(self):
        strings = json.loads((SKILLS / "carousel-design" / "runtime" / "ui-strings.json").read_text(encoding="utf-8"))["strings"]
        bad = [(key, d, s[:40], r) for key, row in strings.items() for d, value in row.items() for s in leaves(value) for r in blocks(s, d, dialect_words=True)]
        self.assertEqual(bad, [])

    def test_the_posting_guide_in_every_dialect(self):
        guide = json.loads((SKILLS / "carousel-design" / "data" / "posting-guide.json").read_text(encoding="utf-8"))
        bad, seen = [], 0

        def walk(node, path=""):
            nonlocal seen
            if isinstance(node, dict):
                for key, value in node.items():
                    if key in DIALECTS and isinstance(value, (str, list)):
                        for s in leaves(value):
                            seen += 1
                            bad.extend((path + "/" + key, s[:40], r) for r in blocks(s, key, dialect_words=True))
                    else:
                        walk(value, path + "/" + key)
            elif isinstance(node, list):
                for i, value in enumerate(node):
                    walk(value, f"{path}[{i}]")

        walk(guide)
        self.assertGreater(seen, 20, "the walk found no per-dialect text")
        self.assertEqual(bad, [])

    def test_the_arabic_readme_the_landing_copy_and_the_skill_guides(self):
        files = [REPO / "README.md", REPO / "site" / "landing-copy.md"]
        for path in sorted(SKILLS.rglob("*.md")):
            rel = path.relative_to(SKILLS).as_posix()
            if not any(rel.startswith(x) for x in DOCS_ABOUT_ERRORS):
                files.append(path)
        bad = []
        for path in files:
            if path == REPO / "site" / "landing-copy.md" and not path.is_file():
                continue
            for line in prose(path.read_text(encoding="utf-8")):
                bad.extend((path.name, line[:60], r) for r in blocks(line, "msa-white", dialect_words=False))
        self.assertEqual(bad, [])


if __name__ == "__main__":
    unittest.main()
