"""Piped Arabic survives on a machine whose default code page is not UTF-8 (Windows pipes and consoles).

Every other script test sets PYTHONUTF8 for its child process, which hides the bug this one guards against: stdin was decoded with the ANSI
code page, so piped Arabic turned into mojibake without any error. The child here runs with PYTHONUTF8, PYTHONIOENCODING and the
legacy-stdio switches removed, and the text is sent as UTF-8 bytes.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
SKILLS = REPO / "plugins" / "carousel-studio" / "skills"
CLEAN_ENV = {k: v for k, v in os.environ.items() if k not in ("PYTHONUTF8", "PYTHONIOENCODING", "PYTHONLEGACYWINDOWSSTDIO", "PYTHONUNBUFFERED")}
CAPTIONS = ["أنا بحب القهوة… وبحب الشاي", "وبعدين نكمل… هنا", "مرة تالتة… كمان"]


def run(script: Path, *args: str, data: str) -> tuple[int, str, str]:
    p = subprocess.run([sys.executable, str(script), *args], input=data.encode("utf-8"), capture_output=True, env=CLEAN_ENV, timeout=120)
    return p.returncode, p.stdout.decode("utf-8", errors="strict"), p.stderr.decode("utf-8", errors="replace")


class TestStdinEncoding(unittest.TestCase):
    def test_the_shared_helper_reads_stdin_as_utf_8(self) -> None:
        code = ("import sys; sys.path.insert(0, %r); from _cs import paths; paths.ensure_utf8_stdio(); sys.stdout.write(sys.stdin.read())"
                % str(SKILLS / "carousel-design" / "scripts"))
        p = subprocess.run([sys.executable, "-c", code], input="سلسلة: ١٢٣ وABC…".encode("utf-8"), capture_output=True, env=CLEAN_ENV, timeout=60)
        self.assertEqual(p.stdout.decode("utf-8"), "سلسلة: ١٢٣ وABC…")

    def test_fingerprint_stdin_keeps_the_openers_and_the_ellipsis_rate(self) -> None:
        script = SKILLS / "brand-setup" / "scripts" / "fingerprint.py"
        code, out, err = run(script, "--stdin", "--format", "json", data="\n---\n".join(CAPTIONS))
        self.assertEqual(code, 0, err)
        fp = json.loads(out)
        self.assertEqual(fp["openers"], ["أنا بحب القهوة", "وبعدين نكمل", "مرة تالتة"])
        self.assertEqual(fp["ellipsisRate"], 1.0, "an ellipsis read as mojibake would not be counted")

    def test_compress_reads_the_cover_from_stdin(self) -> None:
        script = SKILLS / "carousel-create" / "scripts" / "compress.py"
        code, out, err = run(script, "--file", "-", "--dialect", "eg", "--format", "json", data=CAPTIONS[0] + "\n")
        self.assertEqual(code, 0, err)
        self.assertEqual(json.loads(out)["source"]["text"], CAPTIONS[0])


if __name__ == "__main__":
    unittest.main()
