#!/usr/bin/env python3
"""Build Studio and Brand Home pages for browser tests, with the stub engine standing in for the engine chunks.

The pages use the real runtime/cs-ui.js, cs-brandbook.js, studio.css, templates (primitives.css included), presets, fonts and rule data of the
skill. Only the engine chunks (core, qa, paint, motion, hf, mp4, export) are replaced by tests/unit/js/ui/stub-engine.js, so the UI can be
exercised before and without the real engine. The four chunks of the visual language (art, visual, qa-visual, visual-ui) are blanked in the same
way, so a stub page is the 1.0 page whether or not they have been built yet and its structure (thirteen chunk scripts) does not change at the
integration beat; they are real only with --real-engine, or, for cs-visual-ui alone, with --visual-ui. When fonts/registry.json is missing (the
fonts package has not landed) a registry is generated from the font files.

Usage: python tests/mobile-e2e/build_fixture.py --out DIR [--dialect eg|gulf|levant|msa-white|en] [--spec FILE] [--brand FILE] [--view script|design]
       [--real-engine] [--visual-ui] [--runtime DIR]
--real-engine keeps the shipped engine chunks (cs-core, cs-qa, cs-paint, ...) instead of the stub, so the same flows run against the real thing.
--visual-ui keeps the real cs-visual-ui.js on a stub page: the items and demo editors (and so the grid and timeline types) work over the stub
engine; the plan section needs CS.visual and stays out until that is real.
--runtime DIR takes the cs-*.js chunks from DIR (a private build: node tools/build.mjs --out DIR) instead of the shipped runtime/, so a package
can look at its own chunk in a browser without touching the shipped files.
Writes DIR/studio.html, DIR/studio-en.html and DIR/brand-home.html (full documents) and prints the folder.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
SKILL = REPO / "plugins" / "carousel-studio" / "skills" / "carousel-design"
STUB = REPO / "tests" / "unit" / "js" / "ui" / "stub-engine.js"
STUBBED = ("qa", "paint", "motion", "hf", "mp4", "export")          # engine chunks replaced by an empty module (core carries the stub itself)
VISUAL = ("art", "visual", "qa-visual", "visual-ui")                  # the visual language, IS-1 order; blanked with the stub engine
FAMILIES = {
    "ibm-plex-sans-arabic": ("IBM Plex Sans Arabic", ["arabic"]), "readex-pro": ("Readex Pro", ["arabic", "latin"]), "alexandria": ("Alexandria", ["arabic", "latin"]),
    "playpen-sans-arabic": ("Playpen Sans Arabic", ["arabic"]), "noto-kufi-arabic": ("Noto Kufi Arabic", ["arabic"]), "reem-kufi": ("Reem Kufi", ["arabic"]),
    "el-messiri": ("El Messiri", ["arabic", "latin"]), "noto-sans-arabic": ("Noto Sans Arabic", ["arabic", "latin"]), "cairo": ("Cairo", ["arabic", "latin"]),
    "rubik": ("Rubik", ["arabic", "latin"]), "ibm-plex-sans": ("IBM Plex Sans", ["latin"]), "inter": ("Inter", ["latin"]),
}
STATIC_WEIGHTS = {"Thin": 100, "ExtraLight": 200, "Light": 300, "Regular": 400, "Medium": 500, "SemiBold": 600, "Bold": 700}


def generated_registry(fonts: Path) -> dict:
    families = []
    for folder in sorted(p for p in fonts.iterdir() if p.is_dir()):
        files = []
        for font in sorted(folder.glob("*.ttf")):
            if "[" in font.name:
                files.append({"file": f"{folder.name}/{font.name}", "style": "normal", "wght": [100, 900], "variable": True})
            else:
                weights = [w for suffix, w in STATIC_WEIGHTS.items() if font.stem.endswith("-" + suffix)]
                files.append({"file": f"{folder.name}/{font.name}", "style": "normal", "wght": weights[0] if weights else 400, "variable": False})
        for item in files:
            item["sha256"] = hashlib.sha256((fonts / item["file"]).read_bytes()).hexdigest()
        family, scripts = FAMILIES.get(folder.name, (folder.name, ["arabic"]))
        families.append({"id": folder.name, "family": family, "scripts": scripts, "license": "OFL-1.1", "files": files})
    return {"schemaVersion": 1, "dataVersion": "fixture", "families": families}


def assemble_root(dest: Path, real_engine: bool = False, visual_ui: bool = False, runtime_dir: Path | None = None) -> Path:
    root = dest / "skill"
    for name in ("runtime", "templates", "styles", "data", "schemas", "occasions", "fonts"):
        if (SKILL / name).exists():
            shutil.copytree(SKILL / name, root / name)
    (root / "occasions").mkdir(exist_ok=True)
    if not (root / "occasions" / "index.json").exists():
        (root / "occasions" / "index.json").write_text('{"schemaVersion":1,"packs":[]}', encoding="utf-8")
    fonts = root / "fonts"
    if not (fonts / "registry.json").exists():
        (fonts / "registry.json").write_text(json.dumps(generated_registry(fonts), ensure_ascii=False, indent=1), encoding="utf-8")
    if not (fonts / "coverage.json").exists():
        (fonts / "coverage.json").write_text('{"schemaVersion":1,"families":{}}', encoding="utf-8")
    runtime = root / "runtime"
    runtime.mkdir(exist_ok=True)
    if runtime_dir is not None:
        for chunk in sorted(runtime_dir.glob("cs-*.js")):
            shutil.copyfile(chunk, runtime / chunk.name)
    if real_engine:
        return root
    (runtime / "cs-core.js").write_text("(function () {\n" + STUB.read_text(encoding="utf-8") + "\n})();\n", encoding="utf-8")
    for name in STUBBED + tuple(n for n in VISUAL if not (visual_ui and n == "visual-ui")):
        (runtime / f"cs-{name}.js").write_text("(function () {})();\n", encoding="utf-8")
    return root


def demo_brand(path: str, tmp: Path) -> str:
    """The example brand keeps its stock handle and name on purpose (gate B2 refuses them in a post, so a copy of the example cannot ship).
    The test pages need a brand a post may carry, so they get a copy whose header strings are real-looking."""
    brand = json.loads(Path(path).read_text(encoding="utf-8"))
    swaps = {"handle": {"@yourbrand": "@content.lab.demo"}, "name": {"براند تجريبي": "معمل المحتوى"}}
    changed = False
    for key, table in swaps.items():
        if brand.get(key) in table:
            brand[key] = table[brand[key]]
            changed = True
    if not changed:
        return path
    target = tmp / "brand.demo.json"
    target.write_text(json.dumps(brand, ensure_ascii=False), encoding="utf-8")
    return str(target)


def build(root: Path, out: Path, args: list[str]) -> None:
    command = [sys.executable, str(SKILL / "scripts" / "build_studio.py"), "--skill-root", str(root), "--no-validate", "--standalone", "--out", str(out), "--format", "json", *args]
    # The fixtures also cover the presets held back for a later release (ships 1.2), so the build loads every preset.
    result = subprocess.run(command, capture_output=True, text=True, encoding="utf-8", env={**os.environ, "CS_ALL_PRESETS": "1"})
    if result.returncode != 0:
        raise SystemExit(f"build failed ({result.returncode}): {result.stderr.strip()}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--out", required=True)
    parser.add_argument("--dialect", default="eg")
    parser.add_argument("--spec", default=str(REPO / "docs" / "examples" / "spec.example.json"))
    parser.add_argument("--brand", default=str(REPO / "docs" / "examples" / "brand.example.json"))
    parser.add_argument("--plan", default=str(REPO / "docs" / "examples" / "plan.example.json"))
    parser.add_argument("--view", default="script", choices=["script", "design"])
    parser.add_argument("--real-engine", action="store_true", help="use the shipped engine chunks instead of the stub")
    parser.add_argument("--visual-ui", action="store_true", help="with the stub engine, keep the real cs-visual-ui.js (items and demo editors) instead of blanking it")
    parser.add_argument("--runtime", help="take the cs-*.js chunks from this folder (a private build) instead of the shipped runtime/")
    options = parser.parse_args()
    out = Path(options.out)
    out.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="cs-fixture-") as tmp:
        root = assemble_root(Path(tmp), options.real_engine, options.visual_ui, Path(options.runtime) if options.runtime else None)
        options.brand = demo_brand(options.brand, Path(tmp))
        common = ["--spec", options.spec, "--brand", options.brand, "--view", options.view]
        build(root, out / "studio.html", common + ["--ui-dialect", options.dialect])
        build(root, out / "studio-en.html", common + ["--ui-dialect", "en"])
        build(root, out / "brand-home.html", ["--brand-home", "--brand", options.brand, "--plan", options.plan, "--ui-dialect", options.dialect])
    print(out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
