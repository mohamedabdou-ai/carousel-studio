"""Tests for brand-setup/scripts/import_hooks.py (hook bank -> brand-private hook library)."""

import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SKILLS = Path(os.environ.get("CS_TEST_SKILLS") or ROOT / "plugins" / "carousel-studio" / "skills")
SCRIPT = SKILLS / "brand-setup" / "scripts" / "import_hooks.py"
FALLBACK = SKILLS / "carousel-design" / "scripts"
ENV = {**os.environ, "PYTHONIOENCODING": "utf-8", "PYTHONUTF8": "1",
       "PYTHONPATH": os.pathsep.join(filter(None, [str(FALLBACK), os.environ.get("PYTHONPATH", "")]))}

HAVE_CS = any((p / "_cs" / "__init__.py").exists() for p in (SCRIPT.parent, FALLBACK))
NEEDS_CS = unittest.skipUnless(HAVE_CS, "the _cs package is not in place yet (run tools/sync_shared.py)")

MD = """# حصر الهوكات

## السجل الكامل للنصوص

### 1. القوالب الأساسية

| المعرّف | النص | النوع / الموضوع | الحالة | المصدر |
|---|---|---|---|---|
| H001 | لو شايف إن… يبقى محتاج تراجع | قالب جملة | معتمد حسب السياق المحفوظ | [C01] |
| H002 | مشكلتك مش في الخوارزمية… مشكلتك في أول سطر | هوك — نقاش | اختيار/نشر مذكور في الاسترجاع | [C02] |
| H003 | … سبب تعب 80% من الفرق! | قالب جملة | مقترح في ملف | [C01] |
| H004 | الحقيقة الصادمة عن… | قالب جملة | مقترح في ملف | [C01] |
| H005 | مشكلتك مش في الخوارزمية… مشكلتك في أول سطر | هوك | مقترح في ملف | [C03] |
| H006 | من قد إيه وإنت عارف إن… | قالب جملة | مقترح في ملف | [C01] |
| H007 | Imagine a year of content in one afternoon | إعلان | مقترح في ملف | [C04] |
| H008 | نص ما له نمط واضح | هوك | مقترح في ملف | [C04] |
| H009 | غلطة بسيطة بتبوّظ أي كاروسيل | هوك | خطة معدّلة | [C04] |

### 2. نصوص العميل الأول

| المعرّف | النص | النوع / الموضوع | الحالة | المصدر |
|---|---|---|---|---|
| H010 | 3 أدوات جدولة بتوفّر ساعة | هوك | مقترح في ملف | [P] |

## [استنتاج] قوالب مجردة من الأمثلة

| # | القالب المجرد | مثال المصدر في السجل |
|---|---|---|
| 1 | ماذا لو [سيناريو] في [مكان]؟ | H002 |
"""

CSV = """﻿id,text,family,family2,playbook,intent,awareness,archetype,dialect,reuse,role,status,words,has_digit,flags
H001,لو شايف إن… يبقى محتاج تراجع,FLIP,,P4,reach,unaware,MYTH,EG,T,any,approved,6,0,
H002,مشكلتك مش في الخوارزمية… مشكلتك في أول سطر,REFRAME,,new,save,problem,MYTH,EG,E,cover,suggested,9,0,
H003,… سبب تعب 80% من الفرق!,MISTAKE,BIGNUM,P3,reach,problem,MYTH,EG,T,any,approved,5,1,needs_source
H004,الحقيقة الصادمة عن…,SECRET,,P5,reach,unaware,MYTH,EG,T,any,approved,3,0,hype
H006,من قد إيه وإنت عارف إن…,LATE,,new,reach,unaware,LIST,EG,T,any,approved,7,0,
H007,Imagine a year of content in one afternoon,IMAGINE,,P13,reach,solution,NEWS,EN,E,ad,suggested,8,0,
"""


def run(*args):
    p = subprocess.run([sys.executable, str(SCRIPT), *args], capture_output=True, text=True, encoding="utf-8", env=ENV)
    return p.returncode, p.stdout, p.stderr


@NEEDS_CS
class ImportHooksTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.dir = Path(self._tmp.name)
        self.md = self.dir / "bank.md"
        self.csv = self.dir / "bank.csv"
        self.md.write_text(MD, encoding="utf-8")
        self.csv.write_text(CSV, encoding="utf-8")

    def importing(self, *extra, files=None):
        args = []
        for f in files or (self.md, self.csv):
            args += ["--in", str(f)]
        code, out, err = run(*args, "--format", "json", *extra)
        return code, (json.loads(out) if out.strip() else None), err

    def entries(self, result, lang="ar"):
        return {e["id"]: e for e in result["libraries"][lang]["entries"]}

    def test_statuses_are_mapped_from_arabic_and_csv_values(self):
        _, res, _ = self.importing()
        ents = self.entries(res)
        self.assertEqual(ents["P4-FLIP-h001"]["status"], "approved")          # «معتمد»
        self.assertEqual(ents["F17-REFRAME-h002"]["status"], "used")          # «اختيار/نشر»
        self.assertEqual(ents["P5-SECRET-h004"]["status"], "approved")        # CSV approved
        self.assertEqual(ents["P3-MISTAKE-h009"]["status"], "proposed")       # «خطة معدّلة»

    def test_templates_become_slot_skeletons(self):
        _, res, _ = self.importing()
        ents = self.entries(res)
        flip = ents["P4-FLIP-h001"]
        self.assertEqual(flip["skeleton"], {"eg": "لو شايف إن {s1}… يبقى محتاج تراجع"})
        self.assertEqual(list(flip["slots"]), ["s1"])
        self.assertEqual(flip["examples"], [])
        self.assertEqual(flip["maxUsePer"], {"posts": 5, "count": 1})
        # an instance row keeps its text and records the owner example with provenance
        ref = ents["F17-REFRAME-h002"]
        self.assertEqual(ref["slots"], {})
        self.assertEqual(ref["examples"][0]["origin"], "owner/H002")
        self.assertEqual(ref["examples"][0]["visibility"], "brand-private")
        self.assertEqual(ref["roles"], ["cover"])

    def test_figures_are_unverified_and_need_a_source(self):
        _, res, _ = self.importing()
        e = self.entries(res)["P3-MISTAKE-h003"]
        self.assertEqual(e["skeleton"]["eg"], "{s1} سبب تعب {n1}% من الفرق!")
        self.assertIs(e["verified"], False)
        self.assertIs(e["needsSource"], True)
        self.assertIn("number-needs-source", e["lints"])

    def test_flags_become_lints(self):
        _, res, _ = self.importing()
        self.assertIn("no-empty-hype", self.entries(res)["P5-SECRET-h004"]["lints"])

    def test_every_row_is_accounted_for(self):
        _, res, _ = self.importing()
        by_id = {m["id"]: m for m in res["mapping"]}
        self.assertEqual(by_id["H006"]["disposition"], "lint-only")            # LATE is a lint, not a family
        self.assertEqual(by_id["H005"]["disposition"], "duplicate")
        self.assertEqual(by_id["H005"]["of"], "H002")
        self.assertEqual(by_id["H010"]["disposition"], "client-excluded")
        self.assertNotIn("text", by_id["H010"], "client copy must not be echoed")
        self.assertEqual(by_id["H008"]["disposition"], "unclassified")
        self.assertEqual(sum(res["stats"]["dispositions"].values()), len(res["mapping"]))

    def test_unclassified_rows_make_the_exit_code_1_and_family_map_resolves_them(self):
        code, _, _ = self.importing()
        self.assertEqual(code, 1)
        fam = self.dir / "map.json"
        fam.write_text(json.dumps({"H008": "P11"}), encoding="utf-8")
        code, res, err = self.importing("--family-map", str(fam))
        self.assertEqual(code, 0, err)
        self.assertIn("P11-PACK-h008", self.entries(res))

    def test_client_sections_are_excluded_unless_asked(self):
        _, res, _ = self.importing()
        self.assertNotIn("h010", " ".join(self.entries(res)))
        _, res, _ = self.importing("--include-client")
        self.assertTrue(any(e.endswith("h010") for e in self.entries(res)))

    def test_exclude_ids_range_for_csv_only_banks(self):
        _, res, _ = self.importing("--exclude-ids", "H001-H004", files=[self.csv])
        by_id = {m["id"]: m for m in res["mapping"]}
        self.assertEqual({k: by_id[k]["disposition"] for k in ("H001", "H002", "H003", "H004")},
                         {k: "client-excluded" for k in ("H001", "H002", "H003", "H004")})

    def test_english_rows_go_to_a_second_library(self):
        _, res, _ = self.importing()
        en = self.entries(res, "en")
        self.assertEqual(list(en), ["P13-IMAGINE-h007"])
        self.assertEqual(en["P13-IMAGINE-h007"]["skeleton"], {"en": "Imagine a year of content in one afternoon"})
        self.assertEqual(res["libraries"]["en"]["language"], "en")

    def test_libraries_are_brand_private_hook_libraries(self):
        _, res, _ = self.importing()
        for lib in res["libraries"].values():
            self.assertEqual((lib["kind"], lib["visibility"], lib["schemaVersion"]), ("hook-library", "brand-private", 1))
            ids = [e["id"] for e in lib["entries"]]
            self.assertEqual(len(ids), len(set(ids)))

    def test_abstract_bracket_templates_inherit_the_family_of_their_example(self):
        _, res, _ = self.importing()
        bracket = [e for e in self.entries(res).values() if "{s2}" in e["skeleton"]["eg"]]
        self.assertEqual(len(bracket), 1)
        self.assertEqual(bracket[0]["skeleton"]["eg"], "ماذا لو {s1} في {s2}؟")
        self.assertEqual(bracket[0]["family"], "P13")  # "ماذا لو" is the Imagine pattern

    def test_results_columns_become_evidence_and_family_priors(self):
        csv_text = "\n".join([
            "id,text,family,intent,awareness,archetype,dialect,reuse,role,status,flags,metric,value,baseline,n",
            "H101,مشكلتك مش في الخوارزمية… مشكلتك في أول سطر,REFRAME,save,problem,MYTH,EG,E,cover,published,,median saves,12.5,7,10",
            "H102,مشكلتك مش في السعر… مشكلتك في القيمة,REFRAME,save,problem,MYTH,EG,E,cover,published,,median_saves,13.5,7,4",
            "H103,3 أدوات ببلاش,LIST,save,solution,LIST,EG,E,cover,suggested,,,,,",
        ]) + "\n"
        f = self.dir / "results.csv"
        f.write_text(csv_text, encoding="utf-8")
        _, res, _ = self.importing(files=[f])
        ents = self.entries(res)
        self.assertEqual(ents["F17-REFRAME-h101"]["evidence"],
                         [{"tag": "D-own", "metric": "median-saves", "value": 12.5, "baseline": 7.0, "n": 10}])
        self.assertNotIn("evidence", ents["P1-LIST-h103"])
        self.assertEqual(res["pack"]["familyPriors"],
                         {"F17": {"metric": "median-saves", "value": 13.0, "n": 14, "baseline": 7.0}})

    def test_visibility_other_than_brand_private_is_refused(self):
        self.assertEqual(run("--in", str(self.md), "--visibility", "public")[0], 64)

    def test_out_writes_the_arabic_library_and_a_sibling_english_one(self):
        out = self.dir / "hooks.ar.json"
        code, _, err = run("--in", str(self.md), "--in", str(self.csv), "--out", str(out), "--family-map",
                           str(self._family_map()))
        self.assertEqual(code, 0, err)
        ar = json.loads(out.read_text(encoding="utf-8"))
        en = json.loads((self.dir / "hooks.en.json").read_text(encoding="utf-8"))
        self.assertEqual((ar["language"], en["language"]), ("ar", "en"))

    def _family_map(self):
        p = self.dir / "fm.json"
        p.write_text(json.dumps({"H008": "P11"}), encoding="utf-8")
        return p

    def test_brand_file_sets_default_dialect_and_pack_slug(self):
        brand = self.dir / "brand.json"
        brand.write_text(json.dumps({"slug": "demo-brand", "locale": {"dialect": "gulf"}}), encoding="utf-8")
        plain = self.dir / "plain.md"
        plain.write_text("| النص |\n|---|\n| احفظ هذا المنشور لوقت الحاجة |\n", encoding="utf-8")
        code, res, err = self.importing("--brand", str(brand), "--family-map", str(self._family_map()), files=[plain])
        # the single row is unclassified (exit 1) but the pack hint comes from the brand
        self.assertEqual(code, 1, err)
        self.assertEqual(res["pack"]["slug"], "demo-brand-hooks")

    def test_errors(self):
        self.assertEqual(run("--in", str(self.dir / "missing.md"))[0], 66)
        bad = self.dir / "x.pdf"
        bad.write_text("x", encoding="utf-8")
        self.assertEqual(run("--in", str(bad))[0], 64)
        empty = self.dir / "empty.md"
        empty.write_text("# nothing here\n", encoding="utf-8")
        self.assertEqual(run("--in", str(empty))[0], 65)


if __name__ == "__main__":
    unittest.main()
