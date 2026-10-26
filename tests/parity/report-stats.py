"""Lead-run Python regression: python -X utf8 tests/parity/report-stats.py."""
import json
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "plugins/carousel-studio/skills/carousel-design/scripts"))
from _cs import qa, report


class ReportStats(unittest.TestCase):
    def test_counts_survive_json_and_repeat(self):
        spec = json.loads((ROOT / "tests/fixtures/auto/eg.json").read_text(encoding="utf-8"))[2]
        outputs = []
        for _ in range(2):
            results = qa.run_text_gates(spec, gates=["C2"])
            self.assertEqual(results.stats["gates"]["C2"], 1)
            self.assertEqual(results.stats["gates"]["D2"], 0)
            self.assertEqual(results.stats["gates"]["VA2.anchor-size"], 0)
            original = json.loads(json.dumps(results.stats))
            doc = report.to_report(spec, results, {"createdAt": "2026-10-23T00:00:00Z"})
            serialized = json.loads(json.dumps(doc))
            self.assertEqual(serialized["stats"], original)
            doc["stats"]["gates"]["C2"] = 99
            self.assertEqual(results.stats, original, "report must deep-copy counters")
            outputs.append(serialized)
        self.assertEqual(outputs[0], outputs[1])


if __name__ == "__main__":
    unittest.main()
