# Conformance: one set of answers in two languages

The text model, the canonical JSON and hashes, the colour maths, the JSON patch, the schema validator, the lint and the text quality gates exist twice: in JavaScript (`src/lib`, `src/qa`, built into `cs-core.js` and `cs-qa.js`) for the browser, and in Python (`plugins/carousel-studio/skills/carousel-design/scripts/_cs`) for the scripts. A hash computed in the Studio must equal one computed by a script, and a gate must give the same verdict in the Check screen and in `lint_copy.py`. This folder is the proof.

```
corpus/strings.json     strings (Arabic, mixed direction, numbers, emoji, URLs), similarity pairs, kashida words, colours, number formats
corpus/mutations.json   edits applied to the fixture specs and briefs so the gates see failing as well as passing input
run_js.mjs              feeds the corpus and tests/fixtures/*.json to the JavaScript engines, writes the verdicts as canonical JSON
run_py.py               does the same with _cs; --compare reads the JavaScript verdicts and exits 2 on any difference
```

Run both halves, from the repository root:

```
node tests/conformance/run_js.mjs --out tests/conformance/.verdicts.js.json
python tests/conformance/run_py.py --compare tests/conformance/.verdicts.js.json
```

`npm run test:conformance` does the same. The verdict files are git-ignored.

## Reading a failure
`run_py.py --compare` prints the first differences as `path: js=… py=…`. Decide which engine is right from `docs/CONTRACT.md` (sections 3 and 7), fix that one, never the corpus. Both engines are expected to agree on every verdict, including the order of gate results, severities, message variables and floating-point values (within 1e-9).

## What is not here
The rendered gates (D1 to D7, T1, V1, X1) need real layout and pixels; they exist in JavaScript only and run in a browser (`tests/mobile-e2e/preset-matrix.mjs`, `tests/unit/js/qa`). The hook scripts (`hook_features.py`, `compress.py`) have no JavaScript twin and are covered by `tests/unit/py/test_hook_features.py` and `test_compress.py`.

## Adding a case
Put the string or mutation in the matching corpus file, run both halves, and commit the corpus only when they agree. A new gate or rule needs at least one passing and one failing case here.
