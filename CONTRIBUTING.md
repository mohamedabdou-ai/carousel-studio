# Contributing to Carousel Studio

Thank you for helping. This guide covers where things live, the rules every change has to respect, and how to check a change before you open a pull request.

By contributing you agree that your contribution is licensed under the [Apache License 2.0](LICENSE), the same as the project (section 5 of the license). There is no CLA. Your name is yours to keep in the commit history; the project does not add contributor names to exported files.

## Where help is most useful

- **Native review of Gulf and Levantine Arabic.** These registers ship as beta until native speakers review the dialect data, the hook examples and the generated copy. Open an issue with the sentence, why it sounds wrong, and what a native writer would say.
- **Hooks and examples.** New hook skeletons or fresh examples for a family, in any supported dialect. Write your own; do not paste text from other plugins, courses or accounts.
- **Arabic typesetting bugs.** A slide where a letter, number, English word or punctuation mark lands in the wrong place. Attach the `spec.json` and a screenshot.
- **Presets and occasion packs.** New looks are tokens, a `decor.css` and variant flags, never new layouts (see `docs/CONTRACT.md`, section 6).

## Repository map

| Path | Notes |
|---|---|
| `plugins/carousel-studio/` | The only shipped folder. Skills must be self-contained: nothing under `skills/<name>/` may read a path outside that skill at run time. |
| `src/<module>/` | Plain ES2020 scripts with a `manifest.json` each. `tools/build.mjs` concatenates them into `skills/carousel-design/runtime/cs-*.js`. |
| `skills/carousel-design/runtime/cs-*.js` | **Generated.** Never edit by hand; edit `src/` and rebuild. |
| Synced copies in other skills | **Generated** by `tools/sync_shared.py` from `skills/carousel-design/`. Edit the canonical file in `carousel-design`, then run the sync. |
| `team/` | **The single source of the creative team**: `charter.md` and one brief per role in `roles/`. `tools/sync_team.py` generates the nine agents in `plugins/carousel-studio/agents/` and the reference copies in `skills/carousel-create/references/team/` from it. Edit `team/`, never the generated files. |
| `tools/` | Repository tooling (build, sync, team sync, directory check, release, traffic snapshot, identity). |
| `tests/`, `evals/` | Unit tests (`tests/unit`), the JavaScript and Python conformance run (`tests/conformance`), the defect and clean corpora (`tests/corpus-bad`, `tests/corpus-clean`), geometry (`tests/geometry`), privacy (`tests/privacy`), golden hashes (`tests/golden`), the browser and video tests, trigger and behaviour evals and the hook-bank mapping (`evals/`). |
| `docs/CONTRACT.md` | The build contract: module APIs, file formats and who owns which path. When this file and another document disagree, the contract wins. |

## Rules every change must respect

**Arabic**

- `dir="rtl" lang="ar"` on Arabic containers. No letter-spacing, justification, italic or slant, and no synthesized bold or italic on Arabic.
- No `opacity` or RGBA on Arabic text nodes. In motion, fade whole words or whole lines as a group.
- Every left-to-right run (English words, numbers with units, `@handles`, `#tags`, URLs, phone numbers) sits inside `<bdi dir="ltr">`.
- One digit system per design. Western 0-9 is the default; Arabic-Indic is an opt-in.
- Arabic punctuation (، ؛ ؟). Kashida on at most one headline word, and only where the preset allows it.
- AI never writes Arabic inside an image.

**Policy**

- No network calls from skills unless the user asks. The browser runtime may load only `mediabunny@1.61.0` and `fflate@0.8.2` from `https://cdn.jsdelivr.net/npm/`, at exactly those versions.
- No telemetry or analytics code, no GSAP, no Remotion.
- Nothing exported carries the author's name. The credit and the author's links appear only in tool screens and the legal and readme files.
- No placeholder motion, no lorem ipsum, no "coming soon" text in anything a user sees.
- Do not copy text or code from other plugins or projects whose licence does not allow it. Ideas can be re-implemented in your own words and code.
- Do not commit client text, hook-bank client IDs, API keys or personal data.

**Format**

- UTF-8 without BOM, LF line endings (on Windows set `git config core.autocrlf input`; the repository sets no line-ending attributes, because the directory portal refuses attributes that rewrite file contents). Python 3.11 standard library only, runs on Windows and Linux, always `open(..., encoding="utf-8")`, `pathlib` for paths. Node (`.mjs`) only for the Claude Code lane and repository tooling.
- JSON keys in `camelCase`; enumerated values in `kebab-case`. Valid JSON everywhere.
- Every non-image, non-font file under 256 KiB; runtime chunks at most 240 KiB; at most 480 files in the plugin.

## Checking a change

Run these from the repository root before you open a pull request. Python 3.11 or newer and Node.js 22 or newer are required.

```text
python tools/sync_shared.py            # copy shared files into the skills that use them, and the legal files into the plugin
python tools/sync_shared.py --check    # exits 2 if any copy has drifted
python tools/sync_team.py              # regenerate the nine agents and the team briefs from team/ (--check exits 2 on drift)
node tools/build.mjs --check           # exits 2 if runtime/ differs from src/
python tools/check_directory.py        # plugin folder: counts, sizes, URLs, banned words, credits
python tools/check_directory.py --root . --scope repo --repo-max-files 915   # the whole repository, held to the file-count ratchet below
python -m unittest discover -s tests/unit/py -p "test_*.py"
node --test "tests/unit/js/lib/*.test.mjs" "tests/unit/js/qa/*.test.cjs" "tests/unit/js/ui/*.test.mjs"
node tests/corpus-bad/run.mjs && python tests/corpus-bad/run.py   # every planted defect found, no false BLOCK on the clean posts
```

A change to a preset or to the cover's composition also runs `node plugins/carousel-studio/skills/carousel-design/scripts/render.mjs --preflight --spec tests/fixtures/spec.eg.8slides.json --brand tests/fixtures/brand.eg.creator.json --format text` and reads the cover's hero size at 130 px and its empty band for the preset. Rendering changes also need the browser checks (they need `npm ci` and a Chromium): `node tests/geometry/run.mjs` (chrome and text against the geometry of the design, in both crops), `node tests/golden/run.mjs` (hashes of tokens and slide markup; `--update` after a change you meant to make), `node tests/privacy/run.mjs`, `node tests/mobile-e2e/preset-matrix.mjs --variants` (CI also runs it for `--dialect gulf`, `msa-white`, `levant` and `en`, and for Arabic-Indic digits) and `node tests/mobile-e2e/studio-smoke.mjs --real-engine`. The smoke pages are built with a brand whose handle and name are real-looking: the example brand carries stock values on purpose, and gate B2 would block its export. The showcase post `tools/examples/showcase.spec.json` holds one slide of each of the 18 archetypes and feeds the matrix, geometry and golden tests, so a new archetype goes into it first (then `node tests/golden/run.mjs --update`). `node tools/make_examples.mjs` rebuilds the git-ignored `examples/` (Studios, sample renders, one cover video per preset, the 5-mistakes kit).

The Python tests must pass in any order, because a runner imports every test module before it runs one. A module that loads a plugin script in-process does it in `setUpModule` or `setUpClass` through `tests/unit/py/b7_support.py` and calls `support.cleanup()` in `tearDownModule`; it never changes `sys.path`, `sys.modules` or the environment at import time.

### The file-count ratchet

The directory limits a plugin to 512 files and the project keeps the plugin folder at 480 or fewer (it has 343). The directory has not yet said whether it counts the plugin folder or the whole repository, so CI also holds the whole repository to a ratchet: `--repo-max-files 915` in `.github/workflows/ci.yml` and `package.json` is the committed file count and may only go down. A change that adds files must remove or merge others (a test that needs many small inputs keeps them in one JSON file of cases, as `tests/corpus-bad/defects.json` does) or, with a sentence here saying why, raise the number. Raised from 603 to 609 (2026-10-22): the creative team's work added five files that each hold something no existing file could (the production-board checker `carousel-create/scripts/board_check.py` and its tests `tests/unit/py/test_team.py`, the director's run sheet `carousel-create/references/rounds.md`, and the behaviour cases `bhv-44` and `bhv-45`), and the build report had already taken the tree to 604. Raised to 915 (2026-10-26): the tree had already reached 896 with the 1.1 work, and the README became the project's landing page, with 16 images under `docs/readme/` (call-to-action buttons, follow buttons, feature cards and Studio screenshots) that each link somewhere a single image can't. When the directory answers, either the ratchet is dropped (it counts the plugin folder) or the tree is reduced to 480 files.

`check_directory.py` exits 0 when clean, 1 when only warnings remain and 2 when something must be fixed. Add `--format json` for machine-readable output.

For a change that affects rendering, also run the golden and parity tests and attach before and after images to the pull request.

## Pull requests

1. Open an issue first for anything larger than a fix, so we agree on the shape.
2. Keep a pull request to one topic, with a short description of what changed and why.
3. Update `CHANGELOG.md` under the unreleased version, and `PRIVACY.md` if the change adds a network address (it should not).
4. Explain any user-facing Arabic text you add: dialect, register, and why it reads naturally.

## Notes for the directory submission

Heads-ups for whoever submits the plugin, so a reviewer's question has an answer ready:

- Scripts and guides do not tell Claude to read bundled images or fonts. `build_studio.py` embeds the bundled font files into the Studio page and `preset_lint.py` reads each style's preview image: both are build-time reads by the plugin's own scripts, not paths handed to the model. Paths are written in plain words in the guides, not in code spans.
- The repository root has no `.gitattributes` rule that rewrites file contents.
- `cover_video.mjs` runs the pinned HyperFrames tool through `npx` the first time a local render is asked for, and needs `playwright-core`; both are stated in `PRIVACY.md` and `README.md`, and `/studio render` says so before the first download.
- Run the portal's Validate once before each release.

## Names

Forks must be renamed and must not use the project logo; see [TRADEMARKS.md](TRADEMARKS.md).
