"""D4: carousel-design/scripts/icon_search.py, the command line of the Arabic icon lookup (CONTRACT 9.1 conventions, spec 3.1).

The data is the fixture of tests/icons/lookup-vectors.json (entry 0) written to a temporary folder next to the real stem.json, handed over with
--data, so nothing here needs the merged icon data. Arabic goes through argv and stdin and comes back through stdout on a machine whose default
code page is not UTF-8: the child runs with PYTHONUTF8 and PYTHONIOENCODING removed and the bytes are decoded as strict UTF-8.
Run: python -X utf8 -m unittest tests.unit.py.test_icon_search
"""
from __future__ import annotations

import ast
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

try:
    import b7_support as support
except ImportError:  # `python -m unittest tests.unit.py.test_icon_search`: the folder is a package here, not a search-path entry
    from . import b7_support as support

REPO = Path(__file__).resolve().parents[3]
SKILL = REPO / "plugins" / "carousel-studio" / "skills" / "carousel-design"
SCRIPT = SKILL / "scripts" / "icon_search.py"
CLEAN_ENV = {k: v for k, v in os.environ.items() if k not in ("PYTHONUTF8", "PYTHONIOENCODING", "PYTHONLEGACYWINDOWSSTDIO", "PYTHONUNBUFFERED")}
KEYS = ["name", "score", "rung", "concept", "cat", "via", "neg", "primitive", "object", "why"]
tmp = None
DATA = None


def setUpModule() -> None:
    global tmp, DATA
    tmp = tempfile.TemporaryDirectory()
    DATA = Path(tmp.name) / "fx"
    DATA.mkdir()
    fx = json.loads((REPO / "tests" / "icons" / "lookup-vectors.json").read_text(encoding="utf-8"))[0]["fixtures"]["base"]
    for key in ("pack", "index", "concepts"):
        (DATA / (key + ".json")).write_text(json.dumps(fx[key], ensure_ascii=False), encoding="utf-8")
    shutil.copy(SKILL / "data" / "icons" / "stem.json", DATA / "stem.json")


def tearDownModule() -> None:
    tmp.cleanup()


def run(*args: str, data: bytes | None = None, env=CLEAN_ENV, utf8_flag: bool = False) -> tuple[int, str, str]:
    cmd = [sys.executable, *(["-X", "utf8"] if utf8_flag else []), str(SCRIPT), *args]
    p = subprocess.run(cmd, input=data, capture_output=True, env=env, timeout=120)
    return p.returncode, p.stdout.decode("utf-8", errors="strict"), p.stderr.decode("utf-8", errors="replace")


def search(*args: str, **kw) -> dict:
    code, out, err = run("--data", str(DATA), "--format", "json", *args, **kw)
    assert code == 0, err
    return json.loads(out)


class Interface(unittest.TestCase):
    def test_help_answers_with_usage(self) -> None:
        code, out, err = run("--help")
        self.assertEqual(code, 0, err)
        self.assertIn("usage", out.lower())
        for flag in ("--query", "--body", "--dialect", "--limit", "--topic", "--exclude", "--avoid", "--avoid-cat", "--hero", "--concepts", "--explain", "--data", "--format", "--out"):
            self.assertIn(flag, out)

    def test_usage_errors_exit_64_with_a_coded_message_and_no_traceback(self) -> None:
        for args in (("--no-such-option-zz",), (), ("--query", "a", "--dialect", "zz"), ("--query", "a", "--limit", "0"), ("--query", "a", "--limit", "x"),
                     ("--query", "-", "--body", "-"), ("--query", "a", "--format", "xml")):
            code, out, err = run(*args, data=b"")
            self.assertEqual(code, 64, args)
            self.assertTrue(err.startswith("cs-error: E_USAGE:"), (args, err))
            self.assertNotIn("Traceback", err)
            self.assertEqual(out, "")

    def test_the_source_is_pure(self) -> None:
        text = SCRIPT.read_text(encoding="utf-8")
        modules = {a.name.split(".")[0] for n in ast.walk(ast.parse(text)) if isinstance(n, ast.Import) for a in n.names}
        modules |= {n.module.split(".")[0] for n in ast.walk(ast.parse(text)) if isinstance(n, ast.ImportFrom) and n.module}
        self.assertEqual(modules, {"argparse", "json", "sys", "pathlib", "_cs"})
        for bad in ("urllib", "socket", "requests", "analytics", "random", "datetime", "input("):
            self.assertNotIn(bad, text)

    def test_the_arabic_it_shows_passes_the_plugins_own_proofreading(self) -> None:
        support.prepare("carousel-design")
        try:
            from _cs import lint  # noqa: PLC0415
            lines = re.findall("[ء-ي][ء-ي ]*[ء-ي]", SCRIPT.read_text(encoding="utf-8"))
            self.assertTrue(lines)
            for line in lines:
                self.assertEqual(lint.lint_text(line, dialect="msa-white", digits="western"), [], line)
        finally:
            support.cleanup()


class Results(unittest.TestCase):
    def test_json_for_money_in_the_egyptian_dialect(self) -> None:
        doc = search("--query", "فلوس", "--dialect", "eg", "--limit", "5")
        self.assertEqual(list(doc), ["query", "body", "dialect", "topic", "results"])
        self.assertEqual([doc["query"], doc["body"], doc["dialect"], doc["topic"]], ["فلوس", "", "eg", ["finance"]])
        self.assertEqual([r["name"] for r in doc["results"]], ["coins", "wallet", "piggy-bank"])
        self.assertEqual(list(doc["results"][0]), KEYS)
        self.assertEqual([doc["results"][0][k] for k in ("score", "rung", "concept", "cat", "via", "object")], [30, 2, "money", "finance", "فلوس", "coin-stack"])
        self.assertTrue(doc["results"][0]["why"].startswith("اخترنا"))

    def test_the_output_is_the_same_bytes_on_two_runs_and_on_both_code_pages(self) -> None:
        a = run("--data", str(DATA), "--query", "توفير الوقت", "--dialect", "eg", "--format", "json")
        b = run("--data", str(DATA), "--query", "توفير الوقت", "--dialect", "eg", "--format", "json", utf8_flag=True)
        c = run("--data", str(DATA), "--query", "توفير الوقت", "--dialect", "eg", "--format", "json", env={**CLEAN_ENV, "PYTHONUTF8": "1"})
        self.assertEqual(a[0], 0, a[2])
        self.assertEqual(a, b)
        self.assertEqual(a, c)
        self.assertIn("توفير الوقت", a[1])
        self.assertEqual(json.loads(a[1])["results"][0]["name"], "hourglass")

    def test_text_output_carries_the_arabic_words_as_typed(self) -> None:
        code, out, err = run("--data", str(DATA), "--query", "فلوس", "--dialect", "eg")
        self.assertEqual(code, 0, err)
        self.assertIn("1. coins (finance) rung 2 score 30 concept money", out)
        self.assertIn("فلوس", out)
        self.assertIn("اخترنا", out)

    def test_stdin_is_read_as_utf_8_for_the_query_and_for_the_body(self) -> None:
        by_argv = search("--query", "وقتك", "--body", "فلوس", "--dialect", "eg")
        code, out, err = run("--data", str(DATA), "--format", "json", "--query", "-", "--body", "فلوس", "--dialect", "eg", data="وقتك\n".encode("utf-8"))
        self.assertEqual(code, 0, err)
        self.assertEqual(json.loads(out)["results"], by_argv["results"])
        code, out, err = run("--data", str(DATA), "--format", "json", "--query", "وقتك", "--body", "-", "--dialect", "eg", data="فلوس".encode("utf-8"))
        self.assertEqual(json.loads(out)["results"], by_argv["results"])

    def test_the_body_counts_for_sixty_percent_of_the_title(self) -> None:
        r = search("--query", "وقتك", "--body", "فلوس", "--dialect", "eg", "--limit", "6")["results"]
        self.assertEqual([r[0]["name"], r[0]["score"]], ["clock", 22])
        self.assertEqual(next(x for x in r if x["name"] == "coins")["score"], 18)

    def test_negation_marks_the_concepts_own_icon(self) -> None:
        r = search("--query", "السر مش في التصميم", "--dialect", "eg")["results"]
        self.assertEqual([r[0]["concept"], r[0]["neg"]], ["design", True])
        self.assertNotIn("triangle-alert", [x["name"] for x in r])

    def test_options_exclude_topic_avoid_hero_and_avoid_cat(self) -> None:
        self.assertEqual(search("--query", "توفير الوقت", "--exclude", "hourglass,clock")["results"][0]["name"], "timer")
        self.assertEqual(search("--query", "عنوان", "--topic", "sales")["results"][0]["name"], "map-pin")
        self.assertEqual(search("--query", "عنوان")["results"][0]["concept"], "headline")
        self.assertNotIn("users", [r["name"] for r in search("--query", "جمهور", "--avoid", "h")["results"]])
        self.assertNotIn("rocket", [r["name"] for r in search("--query", "صاروخ", "--hero")["results"]])
        self.assertIn("rocket", [r["name"] for r in search("--query", "صاروخ")["results"]])
        self.assertNotEqual(search("--query", "الفلوس والمتابعين", "--avoid-cat", "finance")["results"][0]["cat"], "finance")
        self.assertEqual(len(search("--query", "فلوس", "--limit", "2")["results"]), 2)

    def test_concepts_and_explain(self) -> None:
        c = search("--query", "قبل وبعد", "--concepts")["results"][0]
        self.assertEqual([c["id"], c["primitive"], c["rung"], c["score"]], ["before-after", "before-after", 1, 35])
        e = search("--query", "توفير الوقت", "--dialect", "eg", "--explain", "hourglass")
        self.assertEqual([e["name"], e["result"]["rung"], e["result"]["concept"]], ["hourglass", 1, "time-saving"])
        self.assertIsNone(search("--query", "فلوس", "--explain", "rocket")["result"])

    def test_nothing_found_is_a_normal_answer(self) -> None:
        self.assertEqual(search("--query", "xyz qqq")["results"], [])
        code, out, err = run("--data", str(DATA), "--query", "xyz qqq")
        self.assertEqual(code, 0, err)
        self.assertIn("no icon found", out)

    def test_the_plugins_dialect_spellings_are_accepted(self) -> None:
        self.assertEqual(search("--query", "فلوس", "--dialect", "levant")["dialect"], "lev")
        self.assertEqual(search("--query", "فلوس", "--dialect", "msa-white")["dialect"], "msa")
        self.assertEqual(search("--query", "فلوس")["dialect"], "auto")
        self.assertIn("لأنو", search("--query", "فلوس", "--dialect", "levant")["results"][0]["why"])

    def test_out_writes_the_json_report_atomically(self) -> None:
        target = Path(tmp.name) / "report" / "r.json"
        code, out, err = run("--data", str(DATA), "--query", "فلوس", "--dialect", "eg", "--format", "json", "--out", str(target))
        self.assertEqual(code, 0, err)
        self.assertEqual(json.loads(target.read_text(encoding="utf-8")), json.loads(out))
        self.assertTrue(target.read_bytes().endswith(b"\n") and b"\r" not in target.read_bytes())
        self.assertEqual([p.name for p in target.parent.iterdir()], ["r.json"], "no temporary file is left behind")


class Data(unittest.TestCase):
    def test_a_missing_data_folder_or_file_is_exit_66(self) -> None:
        code, out, err = run("--query", "فلوس", "--data", str(Path(tmp.name) / "nope"))
        self.assertEqual([code, out], [66, ""])
        self.assertTrue(err.startswith("cs-error: E_USAGE:") and "--data folder not found" in err, err)
        bare = Path(tmp.name) / "bare"
        bare.mkdir(exist_ok=True)
        code, out, err = run("--query", "فلوس", "--data", str(bare))
        self.assertEqual(code, 66)
        self.assertIn("index.json", err)
        self.assertNotIn("Traceback", err)

    def test_unreadable_data_is_exit_65(self) -> None:
        broken = Path(tmp.name) / "broken"
        shutil.copytree(DATA, broken, dirs_exist_ok=True)
        (broken / "index.json").write_text("{not json", encoding="utf-8")
        code, out, err = run("--query", "فلوس", "--data", str(broken))
        self.assertEqual(code, 65)
        self.assertTrue(err.startswith("cs-error: E_SCHEMA:"), err)
        self.assertNotIn("Traceback", err)

    def test_without_data_it_reads_the_skills_own_folder_or_says_what_is_missing(self) -> None:
        code, out, err = run("--query", "ساعة", "--format", "json")
        if (SKILL / "data" / "icons" / "index.json").is_file():
            self.assertEqual(code, 0, err)
            self.assertEqual(json.loads(out)["dialect"], "auto")
        else:
            self.assertEqual(code, 66)
            self.assertIn("icon data not found", err)


if __name__ == "__main__":
    unittest.main()
