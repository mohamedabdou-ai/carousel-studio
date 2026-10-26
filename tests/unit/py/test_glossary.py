"""data/glossary.json: one word for each thing the tool names. A shipped Arabic text that uses an 'avoid' form fails here."""
from __future__ import annotations

import json
import re
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
SKILLS = REPO / "plugins" / "carousel-studio" / "skills"
GLOSSARY = SKILLS / "carousel-design" / "data" / "glossary.json"
SYNCED = [SKILLS / s / "data" / "glossary.json" for s in ("carousel-create", "brand-setup", "arabic-proofread")]
ARABIC = re.compile(r"[؀-ۿ]")
# these name the wrong forms on purpose
KNOWS_THE_AVOID_LIST = {
    "carousel-design/data/glossary.json", "carousel-create/data/glossary.json", "brand-setup/data/glossary.json", "arabic-proofread/data/glossary.json",
    "arabic-proofread/data/rules/ortho.json", "carousel-design/data/rules/ortho.json", "carousel-create/data/rules/ortho.json",
    "arabic-proofread/references/orthography.md", "arabic-proofread/references/dialect-purity.md",
}
# lookup keyword data of the icon search: the spellings a user may TYPE (the avoid forms among them, so a search finds the icon), not copy the tool shows (GR-7)
LOOKUP_DATA = ("/data/icons/concepts.json", "/data/icons/stem.json")


def terms():
    return json.loads(GLOSSARY.read_text(encoding="utf-8"))["terms"]


def shipped_text():
    for path in sorted(SKILLS.rglob("*")):
        rel = path.relative_to(SKILLS).as_posix()
        if path.suffix in (".md", ".json") and rel not in KNOWS_THE_AVOID_LIST and "/evals/" not in rel and not rel.endswith(LOOKUP_DATA):
            yield rel, path.read_text(encoding="utf-8")
    for extra in (REPO / "README.md", REPO / "site" / "landing-copy.md"):
        if extra == REPO / "site" / "landing-copy.md" and not extra.is_file():
            continue
        yield extra.name, extra.read_text(encoding="utf-8")


class TestGlossary(unittest.TestCase):
    def test_shape(self):
        for key, term in terms().items():
            self.assertIn("ar", term.get("use", {}), key)
            self.assertIsInstance(term.get("avoid", []), list, key)
            for form in term.get("avoid", []):
                self.assertNotEqual(form, term["use"]["ar"], f"{key}: the term to use is also on its avoid list")

    def test_the_copies_in_the_other_skills_are_identical(self):
        canonical = GLOSSARY.read_bytes()
        for copy in SYNCED:
            self.assertEqual(copy.read_bytes(), canonical, f"{copy} differs; run tools/sync_shared.py")

    def test_no_shipped_text_uses_an_avoid_form(self):
        avoid = [(key, form) for key, term in terms().items() for form in term.get("avoid", [])]
        found = []
        for rel, text in shipped_text():
            for key, form in avoid:
                # a form stands alone: not inside a longer Arabic word
                for m in re.finditer(r"(?<![ء-ي])" + re.escape(form) + r"(?![ء-ي])", text):
                    found.append((rel, key, form, text[max(0, m.start() - 20):m.end() + 20].replace("\n", " ")))
        self.assertEqual(found, [], "use the glossary's term instead of the avoid form")


if __name__ == "__main__":
    unittest.main()
