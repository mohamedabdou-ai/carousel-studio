# Evals

How Carousel Studio is tested as a *product*: does the right skill wake up, does it behave, and do the shared
fixtures stay valid. Unit tests of code live in `tests/unit/`; this folder tests the plugin the way a user meets it.

```
evals/
├─ README.md                    this file
├─ validate_evals.py            checks every file below, exports the trigger cases, summarises a run
├─ behaviour/                   45 `claude plugin eval` cases, one folder each (bhv-NN-slug/case.yaml; bhv-37 to bhv-45 are the creative team's)
├─ triggers/                    local home of the exported trigger cases (triggers/generated/, git-ignored)
├─ hookbank-mapping/            mapping.json: which hook family each of the owner's bank entries is filed under (ids and labels only);
│                               tests/unit/py/test_hookbank_mapping.py checks it
├─ copy-quality/  dialect-panels/  hook-compression/
│                               reserved for the model-judged panels of the quality plan (not part of this package)
└─ .gitignore                   results/ and triggers/generated/ stay local

plugins/carousel-studio/skills/<skill>/evals/evals.json    7 files: 30 trigger prompts + behaviour items each
tests/fixtures/                                             sample specs, brands, a plan, bidi strings, seeded errors
```

Everything here is written for `claude plugin eval` (Claude Code) and is also readable by the skill-creator tools.
No eval makes a network call of its own, and nothing in the plugin folder names the author (CONTRACT 0.6).

## 1. Trigger evals: `skills/<skill>/evals/evals.json`

One file per skill, same shape in all seven.

```json
{
  "schemaVersion": 1,
  "skill_name": "carousel-create",
  "description": "…",
  "triggerTargets": { "precision": 0.9, "recall": 0.9 },
  "triggers": [
    { "id": "t01", "query": "اعملي كاروسيل عن …", "should_trigger": true,  "dialect": "eg" },
    { "id": "t23", "query": "عايز خطة محتوى …",    "should_trigger": false, "dialect": "eg",
      "kind": "sibling", "instead": "content-plan" }
  ],
  "evals": [ { "id": 1, "name": "…", "prompt": "…", "expected_output": "…", "files": [],
               "expectations": ["…"], "fixtures": ["spec.eg.angle-stub.json"], "behaviour": ["bhv-01-…"] } ]
}
```

| Field | Meaning |
|---|---|
| `triggers[]` | exactly 30 per skill: `t01`–`t20` should trigger (four per register: `eg`, `gulf`, `levant`, `msa-white`, `en`), `t21`–`t30` should not |
| `should_trigger` / `query` | the skill-creator trigger-eval pair (`run_eval.py` reads these two keys) |
| `dialect` | the register the prompt is written in |
| `kind` (negatives) | `sibling` another skill of this plugin · `reel` video/reel editing · `canva` Canva edits · `adjacent` a neighbouring domain (translation, ads, logos, other platforms) · `unrelated` |
| `instead` (negatives) | who should answer: one of the seven skills, `reel-montage`, `canva`, or `none` |
| `evals[]` | skill-creator behaviour items (`id`, `name`, `prompt`, `expected_output`, `files`, `expectations`) plus two links: `fixtures` (files in `tests/fixtures/`) and `behaviour` (cases in `evals/behaviour/`) |

**The seven files form one routing table.** A `sibling` negative is the *exact text* of a should-trigger prompt of the
skill named in `instead`, so every such prompt has exactly one expected owner, and `validate_evals.py` fails when two
skills claim the same text. Every skill also carries a reel negative («اعمل ريل من الفيديو ده…») and a Canva negative.
Hard negatives are near misses on purpose (a design request with no spec yet belongs to `carousel-create`; a reel
asked for with a background change is still a reel).

Plugin-side files may not contain URLs, the author's name or handles, or client hook ids: prompts that refer to a link
or an attachment say so in words.

### Running the trigger evals

```bash
python evals/validate_evals.py export-triggers --out evals/triggers/generated --clean    # 210 cases, git-ignored
claude plugin eval . --case "trg-*" --ablation none --runs 1 -j 6 --json /tmp/triggers.json
python evals/validate_evals.py summarize-triggers /tmp/triggers.json
```

Each exported case runs the prompt with only the `Skill` tool and checks one thing: `tool_used Skill` with the skill's
name (min 1 for a should-trigger prompt; min 0 / max 0 for a negative, plus the sibling for `sibling` negatives).
`max_turns: 3` ends every run with "Reached maximum number of turns": that is expected, only the grader verdict counts
(with a single turn the harness stops before the tool call is recorded). `summarize-triggers` prints per skill

| Figure | Definition | Target |
|---|---|---|
| recall | should-trigger prompts that woke the skill | ≥ 0.90 |
| precision | of the runs where the skill woke, the share that were meant to | ≥ 0.90 |
| specificity | should-not prompts that left it asleep | reported |
| routing | sibling negatives that woke the right sibling | reported |

Use `--ablation none`: a no-plugin baseline is meaningless for trigger cases. Cost is about $0.10 per prompt.

**Measured on 2026-10-22** (all 210 prompts, one run each, the plugin as built that day; cost about $24):

| Skill | recall | precision | specificity | routing |
|---|---|---|---|---|
| carousel-create · content-angles · content-plan | 1.00 | 1.00 | 1.00 | 1.00 |
| brand-setup · visual-prompts | 0.95 | 1.00 | 1.00 | 1.00 |
| carousel-design | 0.80 | 1.00 | 1.00 | 1.00 |
| arabic-proofread | 0.70 | 1.00 | 1.00 | 0.75 |

Twelve prompts missed and were rewritten, then re-run (three runs each for the last five) until they passed. Two causes:
prompts that point at attached screenshots (the harness has none, so an audit prompt cannot be tested this way; the
audit is covered by `bhv-36` and by the skill's own evals instead), and one-line pastes of Arabic copy, which the
model sometimes proofreads itself without consulting `arabic-proofread`. The second is a finding about the skill's
description, not only about the prompts: if proofreading short pastes should always go through the lint scripts, the
description should say so. Re-measure after any change to a `SKILL.md` description.

The skill-creator tools take a flat array instead: `python evals/validate_evals.py export-skill-creator --out DIR` writes
`<skill>.trigger-eval.json` (`[{"query", "should_trigger"}]`) for its `run_eval.py` / description-optimisation loop.

## 2. Behaviour cases: `evals/behaviour/bhv-NN-slug/case.yaml`

Each folder is one `claude plugin eval` case in the `case.yaml` form (`schema_version: "1.0"`):

```yaml
name: bhv-13-gulf-override-under-egyptian-brand
tags: [behaviour, needs-bash, carousel-create, dialect-override, one-dialect]
plugins: ["../../../plugins/carousel-studio"]     # relative to the case folder: loads this plugin
execution:
  prompt: |          # a brand capsule (CONTRACT 8.3) pasted as the user's "project file", then the request
  append_system_prompt: |   # the harness note: no Artifact tool, no network, write files in the current folder
  max_turns: 40
  timeout_seconds: 900
  allowed_tools: [Skill, Read, Write, Edit, Bash, Glob, Grep]
runs: 2
graders: [ … ]       # tool_used · file_exists · regex · llm
```

* **Graders.** Deterministic first: `tool_used` for the script or skill that must (or must not) run, `file_exists` for
  `spec.json` / `brand.json` / `plan-YYYY-MM.json`, `regex` over the reply or over `{source: file, path: spec.json}`
  (dialect leaks, digit systems, credit strings, `transformNote`), then `llm` rubrics. A rubric states one or two
  claims: judges pass short rubrics and fail stacked ones (calibrated on the chat-only cases).
* **Two modes**, by tag. `chat-only` cases grant no gated tool and run anywhere. `needs-bash` cases write files and run
  the skills' Python scripts, so `claude plugin eval` needs a platform where it can confine a shell (Linux, macOS, or a
  Windows build with the sandbox enabled) and the operator grant `--allow-tools Write Edit Bash`.
* **Fixtures.** Cases are self-contained: the brand arrives as a pasted capsule and articles are inline, because a
  case may only read files inside its own folder. The inputs match `tests/fixtures/` (`brand.eg.creator.json`,
  `source.article.injection.eg.txt`).

* **The team cases** (`bhv-37` to `bhv-45`) ask the run to keep the production board `board.md` and grade it three ways: regexes over the file (the pitch section, the duel's podium line, the huddle lines and storyboard times, the eight lens lines, the swipe table), `tool_used board_check.py` (the checker verifies the duel arithmetic, the swipe table, the verdict against its scores, the loop counters and the six-line team log), and `llm` rubrics for what only a reader can judge (a named enemy, a hook misread by the personas, a panel that does not flatter). `bhv-44` pastes a brand whose last two posts share a hook family, a move and a recipe and checks that the next post rests them and writes itself back to `creativeMemory`. The checker is covered by `tests/unit/py/test_team.py`; the cases themselves need model calls and are run with the commands below.

```bash
claude plugin eval . --tag chat-only --ablation none --runs 1 -j 3                       # any machine
claude plugin eval . --tag needs-bash --ablation none --allow-tools Write Edit Bash      # sandboxed platforms
claude plugin eval . --case "bhv-13*" --ablation none --runs 1                          # one case
claude plugin eval . --max-cost-usd 0 --allow-tools Write Edit Bash                     # dry run: load and lint every case
```

`--max-cost-usd 0` is a free load check: it parses every case (typos, unknown keys, missing plugin) and runs nothing.
Results land in `evals/results/` (git-ignored); pass `--output-dir` to keep them elsewhere.

### What the 36 cases cover

| Behaviour (CONTRACT 7, 8; decisions Q13–Q15, Q38–Q40) | Cases |
|---|---|
| guided mode stops at checkpoint 1 | 01 |
| fast mode writes a valid spec · single post is one poster slide · no brand → defaults, no nagging | 02 · 03 · 04 |
| ≥ 12 hooks scored, top 3 from 3 families · spoken opener compressed to a cover | 05 · 06 |
| no invented numbers · a user's own number gets a `user` source | 07 · 08 |
| article instructions are data · an API key is never used or stored · repurposing is transformed | 09 · 10 · 11 |
| one dialect · per-post dialect override · digits default and opt-in · Latin names and numbers stay attached | 12 · 13 · 14, 15 · 16 |
| slide 2 pays off (no intro) · exactly one CTA · ≤ 5 hashtags · caption band and first line · per-slide captions and alt text | 17 · 18 · 19 · 20 · 21 |
| slide-count warning · cover limits and list count | 22 · 23 |
| no credit in exports · no promotion in an ordinary run | 24 · 25 |
| reel and Canva requests are declined, nothing starts | 26 · 27 |
| proofreading: fix table and verdict · Gulf words in an Egyptian post | 28 · 34 |
| planning from the calendar table · no Arabic inside generated images | 29 · 30 |
| onboarding dialect-first · voice from captions · "later" saves progress | 31 · 32 · 33 |
| angles scored and ranked · audit covers the user's own screenshots only | 35 · 36 |

`validate_evals.py` fails when one of the promised behaviours loses its last case (the `REQUIRED_BEHAVIOUR_TAGS` list).

## 3. Fixtures: `tests/fixtures/`

Synthetic, UTF-8, LF, each under 256 KiB, indexed by `manifest.json` (`kind` selects the check, `lint: clean` marks a
sample that must pass the text gates). No client text, no owner-pack phrase, no credit.

| File | What it is |
|---|---|
| `brand.eg.creator.json` · `brand.gulf.client.json` · `brand.msa.indic.json` · `brand.en.minimal.json` | four valid brands: full Egyptian creator (voice fingerprint, hook history), Gulf client, MSA brand that opted into Arabic-Indic digits, English brand with skipped sections |
| `spec.eg.8slides.json` | the flagship «5 أخطاء بتموّت الكاروسيل» listicle, guided, checkpoint `design`, 8 slides (CONTRACT App. C) |
| `spec.eg.angle-stub.json` | the same post right after the angle pick (checkpoint 1) |
| `spec.eg.single.json` | a single post: one `poster` slide, fast mode, short caption |
| `spec.gulf.9slides.json` | soft-sell offer, intent `sell`, keyword-DM CTA with an instant asset, sourced price |
| `spec.levant.10slides.json` | `steps` post written under the Egyptian brand with a per-post Levantine override |
| `spec.msa-white.indic.8slides.json` | myth-fact post, Arabic-Indic digits, a `calc` source, a `send` CTA |
| `spec.en.8slides.json` | English post, `arrow-ltr` swipe cue |
| `plan.eg.2026-11.json` | a month plan: 16 slots plus a White Friday single post, rotation rules respected |
| `bidi-strings.json` | 53 strings (`لـChatGPT`, `$1000/شهريا`, `١٫٧`, stranded prefixes, unbound pairs, mixed and Persian digits, handles, tags, URLs, phones): tokens, LTR runs, word count, digit system, expected N1/B1 findings |
| `ortho-seeded-errors.json` | 20 seeded orthography errors, each tied to a rule id of `ortho.json`, with the text after every fix and after autofix only, plus 6 clean control sentences |
| `hook-candidates.eg.json` | 18 hooks from 14 families in `hook_features.py --batch` shape; 5 must be discarded by the gates and the other 13 span 11 families |
| `source.article.injection.eg.txt` · `source.transcript.eg.txt` | an article carrying an injection payload; a clean voice-note transcript |

Notes for whoever touches them:

* A number and its noun are bound with U+00A0 in every clean sample (`5 أخطاء`), which is the state after the
  `B1.unbound-pair` autofix; the raw typed form is kept as a separate bidi string.
* `spec.brand.snapshotHash` is the real `hash16` of the brand fixture (CONTRACT 3.2); change a brand and the check
  tells you which specs to refresh.
* The clean specs were checked with an independent mini-lint in `validate_evals.py` (copy limits, CTA, caption band,
  digits, bidi, dialect deny and warn lists, orthography). It is a safety net: `_cs.qa` (B4) remains the reference.

## 4. `validate_evals.py`

```bash
python evals/validate_evals.py                       # check everything
python evals/validate_evals.py check --only fixtures hygiene --format json
python evals/validate_evals.py export-triggers --out evals/triggers/generated --clean
python evals/validate_evals.py export-skill-creator --out /tmp/trigger-sets
python evals/validate_evals.py summarize-triggers result.json
```

Python 3.11 standard library only. `check` covers: trigger-file counts, register coverage and routing consistency;
`claude plugin eval` case shape, tool modes and behaviour coverage; fixtures against `carousel-design/schemas/*.json`,
the clean-sample lint, the bidi and orthography files recomputed from the shipped rule data; and hygiene (no URL, owner
string, secret-like string or client hook id in the plugin-side files, no credit in a fixture). Exit codes follow
CONTRACT 0.4: 0 no errors (warnings are printed; `--strict` makes them exit 1), 2 errors, 64 usage, 66 missing
input, 73 cannot write. The one warning today is a rule-data finding for the owner of `ortho.json`: `ORTHO-HAMZA-004`
(`clitics: true` on «احد») reads the very common word «واحد» as «و + احد» and flags it.

## 5. Adding or changing an eval

1. Prompts are what a user types: informal, with context, in the register named in `dialect`. Negatives are near
   misses, not obvious non-sequiturs. Keep the 4 + 4 + 4 + 4 + 4 split and the 10 negatives.
2. A new sibling negative copies the sibling's should-trigger text exactly.
3. A new behaviour case copies a neighbour folder, sets `name` to the folder name, tags exactly one of `chat-only` /
   `needs-bash`, and keeps the `plugins:` path. Prefer `tool_used`, `file_exists` and `regex`; write rubrics with one or
   two claims; run it at least three times before trusting it.
4. Never put an API-looking string, a URL, the author's name or a client hook in a plugin-side file.
5. Run `python evals/validate_evals.py`, then the dry run `claude plugin eval . --max-cost-usd 0 --allow-tools Write Edit Bash`.

## 6. Known gaps

* `needs-bash` cases are load-checked but not run end to end on the machine that wrote them (no shell sandbox on that
  Windows build); the seven `chat-only` cases and all 210 trigger prompts were run for real and the rubrics and
  prompts adjusted. Their graders on spec files, scripts and plan files are untested against real runs.
* `corpus-bad`, `corpus-clean` and the shared conformance corpus (CONTRACT 2.2, B12) are not part of this delivery.
  `bidi-strings.json` and `ortho-seeded-errors.json` are shaped to be copied into `tests/conformance/corpus/`.
* Native Gulf and Levantine review of the sample copy is pending (Q43); those specs carry no `nativeReviewed` claim.
