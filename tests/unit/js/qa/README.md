# cs-qa unit tests

Tests of `runtime/cs-qa.js` (built from `src/qa/`) and of `data/qa-rules.json`.

```
node --test tests/unit/js/qa/*.test.cjs
```

For a private build on Windows (no generated files are changed):

```powershell
$q2tmp = Join-Path $env:TEMP 'cs-r3/Q2'
node tools/build.mjs --module qa --out "$q2tmp/r3-qa" --report
$env:CS_QA_CHUNK = Join-Path $q2tmp 'r3-qa/cs-qa.js'
$env:CS_QA_TEMP = $q2tmp
node --test "tests/unit/js/qa/*.test.cjs"
```

`CS.core.text.visualFields` is loaded from `src/lib/text.js` in both test environments. Other text and colour functions retain their existing stubs. `runText`, `runRendered` and `runExport` return arrays with a `stats.gates` property; `run` carries the merged counters on `report.results.stats.gates`. Each counter is an integer execution count, including clean executions, and starts fresh on every call. `JSON.stringify` on a findings array omits custom properties, so runners must read `.stats` before serializing the array. The closed report schema receives no top-level `stats` field. `CS.qa._.slideFields(slide)` supplies stable source keys; composed art nodes retain their indexed `data-slot-key` in rendered findings.

| File | Covers |
|---|---|
| `text-gates.test.cjs` | text-scope gates C1-C10, O1, N1, B1, SRC1, SEN1, A1 on a clean fixture and on one defect at a time |
| `lint.test.cjs` | `CS.qa.lintText`: ortho.json rules, the built-in Arabic checks, dialect markers |
| `export-gates.test.cjs` | D1, V1, X1 on synthetic PNG, JPEG, PDF and MP4 buffers; `inspectMp4`, `loopCheck` |
| `api.test.cjs` | rule-file invariants, `summarize`, `override`, `autofix`, the report and its Markdown, `describe`, `sevenErrors` |
| `rendered-gates.test.cjs` | D1-D7, T1, B1 against real layout: `rendered/scenario.js` runs in headless Chrome or Edge (set `CHROME` to point at one; the file is skipped when none is found) |
| `visual-contract.test.cjs` | qav registration and execution counts, computed sRGB parsing, all 14 visual text source kinds through spelling/dialect/source/word gates, deterministic autofix |

`support/stub-lib.js` is a stand-in for `CS.core.text` and `CS.core.color` (CONTRACT 3.3) so the suite runs before, and independently of, the real library; the shared Python/JavaScript corpus in `tests/conformance` is what checks the real one. The owner's name is never written out in these files: the tests spell it from code points.
