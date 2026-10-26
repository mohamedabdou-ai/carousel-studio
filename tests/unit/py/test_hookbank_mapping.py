"""evals/hookbank-mapping: every hook of the owner's bank is accounted for, without shipping a word of it."""
from __future__ import annotations

import csv
import json
import os
import re
import unittest
from pathlib import Path

try:
    import b7_support as support
except ImportError:  # `python -m unittest tests.unit.py.test_hookbank_mapping` (CONTRACT 12): the folder is a package here, not a search-path entry
    from . import b7_support as support

REPO = Path(__file__).resolve().parents[3]
MAPPING = REPO / "evals" / "hookbank-mapping" / "mapping.json"

DOC = json.loads(MAPPING.read_text(encoding="utf-8"))
LAST_PUBLIC = DOC["bankSize"] - DOC["clientEntriesNotListed"]
IH = None


def setUpModule() -> None:
    """brand-setup carries a trimmed `_cs`; it is put first on the path for this module only and removed in tearDownModule."""
    global IH
    IH = support.load_script("brand-setup", "import_hooks.py", "import_hooks_for_mapping")


def tearDownModule() -> None:
    support.cleanup()


class TestHookBankMapping(unittest.TestCase):
    def test_every_public_id_is_listed_once_and_the_client_range_is_not(self):
        ids = list(DOC["ids"])
        self.assertEqual(ids, [f"H{n:03d}" for n in range(1, LAST_PUBLIC + 1)])
        self.assertEqual(LAST_PUBLIC, 146)

    def test_every_label_resolves_to_a_family_a_lint_or_a_conversion(self):
        for hook_id, label in DOC["ids"].items():
            kind, code, _how = IH.classify({"id": hook_id, "text": "", "csv": {"family": label}}, {})
            self.assertIn(kind, ("family", "lint", "convert"), f"{hook_id} ({label}) maps to nothing")
            self.assertTrue(code, f"{hook_id} ({label}) has no target")

    def test_the_file_holds_no_hook_text(self):
        text = MAPPING.read_text(encoding="utf-8")
        self.assertIsNone(re.search(r"[\u0600-\u06FF]", text), "an Arabic letter in the mapping: ids and labels only")
        no_ranges = re.sub(r"\bH\d{1,3}\s*(?:-|to)\s*H\d{1,3}\b", " ", text)  # "H147 to H197" names the boundary, which is allowed
        self.assertEqual([n for n in re.findall(r"\bH(\d{3})\b", no_ranges) if int(n) >= 147], [], "a client id is listed")

    def test_the_private_classification_file_agrees_when_it_is_available(self):
        path = os.environ.get("CS_HOOKBANK_CSV")
        if not path or not Path(path).is_file():
            self.skipTest("CS_HOOKBANK_CSV is not set (the classification file is private)")
        rows = list(csv.DictReader(open(path, encoding="utf-8-sig")))
        self.assertEqual(len(rows), DOC["bankSize"])
        for row in rows:
            n = int(row["id"][1:])
            if n <= LAST_PUBLIC:
                self.assertEqual(DOC["ids"].get(row["id"]), row["family"], row["id"])
            else:
                self.assertNotIn(row["id"], DOC["ids"])


if __name__ == "__main__":
    unittest.main()
