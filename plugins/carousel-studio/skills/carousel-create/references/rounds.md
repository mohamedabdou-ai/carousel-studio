# The director's run sheet

The router in `SKILL.md` selects the lane. This page owns order, dispatch and export ownership. Formats: `team/<agent>.md`; guided board and loops: `team/charter.md` sections 5–6. A carousel has 4 to 10 slides, cover included; 4 to 6 are fine for a short idea; never more than 10.

## 0. Before work starts
1. Find the brand, read `creativeMemory` (`brand_io.py memory --slug S`), recent families/moves/recipes/covers/CTA kinds and loved/rejected choices. Read `brand.ext.styleChoice` and `brand.ext.publish` (`brand-lookup.md`).
2. With `Agent` and the listed `carousel-studio:cs-*` agents, dispatch specialists. Everything judging work gets a fresh context. Without agents, separate role passes see only their permitted inputs; disclose unavailable checks, never claim independent agent review. Without disk, keep notes and name the scripts that could not run.
3. Guided: keep `board.md` beside `spec.json`, charter anchors and counters intact. Run `python <create>/scripts/board_check.py board.md --stage brief|pitch|room|huddle|final --spec spec.json` after each completed round (omit `--spec` before it exists). Compact lanes use the spec-only stages below. Fix errors; never change a gate or counter to pass.

## 1. Dispatch contract
Resolve every placeholder to an absolute path; a fresh agent starts with nothing:
```text
Agent type: carousel-studio:cs-<name>. Fresh context.
Post: <id>; lane: guided|fast|ready; dialect: <code>; digits: <system>.
Post folder: <absolute post folder>.
Brand file: <absolute brand.json, passed as --brand>.
Scripts: create=<absolute carousel-create/scripts>;
  proofread=<absolute arabic-proofread/scripts>;
  ortho rules=<absolute arabic-proofread/data/rules/ortho.json>;
  copy rules=<absolute arabic-proofread/data/rules/copy.json>;
  design=<absolute carousel-design/scripts> (render.mjs, review_sheet.mjs, plates.mjs, check_video.mjs).
Read: <absolute brief path>; <allowed board sections or copy alone>; <rule/dialect paths>.
Material: <absolute input paths>.
Pass: design|review|fix.
Pen holder: <one role, or director; exactly one spec.json writer>.
May write: <exact files, including report/card paths>.
Must not: <all other files; words for designers; spec.json for reviewers>.
Task: <one bounded task>.
Return: output, changed files, verdict and handoff card. Never edit board.md.
```

| Role | Input and scripts needed | Output / permission |
|---|---|---|
| strategist | brief, memory summary, sources; source tools if needed | ready source entries/caveats or scored angles; report only |
| copywriter | brief, hook library, memory, approved hook; create scripts | `hooks.json`, `script.md`, `fill.json`, `caption-pack.json`; spec only with explicit pen |
| Arabic editor | copy alone, dialect, `voice.allow`, proofread scripts and both rule files | PASS/VETO and diff; no spec writes |
| audience panel | three persona cards and this call's material only | reactions; no brief, scores, rationale or writes |
| art director | locked hook/style, brand, spec, visual direction; design scripts | `visual-plan.md`, named `free/*.html`/`.css`, review render/sheet/card; spec pen in design/fix only |
| motion designer | locked cover, huddle, proposed moves, memory; design/check_video.mjs | recipe/storyboard/encoded-frame report; no spec writes |
| visual artist | art's slide types/image needs, brand; design/plates.mjs | prompt cards, `plates/plates.json`, inspected results/card; no spec writes |
| QA producer | stable spec, brand, renders, asset-check manifest; create, proofread, design scripts | final `kit/`, QA report/card; no spec writes |
| Creative Director reviewer | board/work, QA/art verdicts, promise ledger, final images | phase-keyed review/named notes; no spec writes |

**One pen.** Design/fix passes write; review passes only report. No slide is off limits to the art director, including the cover: never dispatch “leave slide N alone”. While a specialist holds the pen the director queues changes, then applies them with `spec_edit.py` after the handoff card returns. Never replay an old whole-spec or cover snapshot. Free blocks use `node <design>/scripts/merge-free.mjs --spec <post>/spec.json --free-dir <post>/free --slides s02 s03`: shared `spec.json.lock`, a fresh read at write time, named `free` blocks only, atomic replacement. After handoff record only approved changed fields through `spec_edit.py apply --file approved-design.json` for rebuild replay; never capture an older cover in that file.

**After any creator checkpoint**, before writing, pull Studio edits first: read the saved page, `python <design>/scripts/extract_spec.py page.html -o spec.json --expect-rev N` (`handoff.md`); preserve overrides. Exit 75 means re-read and merge. Then assign the pen. A review finding goes to a fix pass of the same specialist and back to QA/reviewer on the new stable artifact.

**Order and waiting.** No art-director or visual-artist dispatch before hook/style lock. Before locking, the director may use the art brief for a read-only shortlist role pass: rank `creator`, `notebook`, `poster` by fit/pre-flight; brand default breaks a tie. This is a recommendation, no design. Pictures wait for art's slide types. Background a call only when independent work exists, do that work, resume on its result; never poll with a sleep loop. Never parallelise spec writers.

**Who renders.** Art runs its review render/sheet in the design pass. QA runs the final export itself with `--brand`, every scope and `--contact-sheet`; the director's own render/report reading never replaces that call. Art owns design judgement; QA objective checks and veto; Creative Director idea/promise judgement; panel stop/scroll reactions.

## 2. Role passes
Read each brief once and only its permitted inputs; produce its named output/card, then move on. The main conversation is the director and, in fast, the copywriter role pass. A dispatched reviewer always gets a fresh context. Keep switches/cards out of chat.

## 3. Guided team lane: five rounds

### Round 1: Brief — director
Twelve-line brief plus `حقائق المنصة:`: idea, enemy, intent/awareness, two directions from different families/moves, bold risk, constraints/facts. `الاتجاه البصري` is a direction, never a chosen preset. Strategist verifies open load-bearing facts when search exists; otherwise disclose and cap Proof at 3. Read memory; `--stage brief`.

### Round 2: Pitch — strategist → copywriter → panel → Creative Director
1. Strategist reuses content-angles scores; copywriter writes safe/bold covers; one panel call builds three persona cards and reacts without rationale/scores.
2. Fresh Creative Director recommends, including the rejected option. One send-back (`pitch 1/1`), then director rules. Record decisions/mitigations as `- وعد: … — يتأكد على …`.
3. `--stage pitch`. **Checkpoint 1:** two numbered directions, recommendation, open facts first. Wait for the creator; validate the chosen angle stub.

### Round 3: Writers' room — copywriter → editor → panel → Creative Director
1. Copywriter: 12+ hooks, 4 to 6 families, at most 3 per family; `hook_features.py --batch`. Failed gates stay `fail`. Heats, panel cold reads/votes, knockout: clarity → family evidence → stops → gap → fit → freshness → score. Record champions/podium; leader differs from panel favourite: one hybrid/one vote. One re-draft (`duel 1/1`).
2. Script/caption pack, 4 to 10 slides including cover; clean `lint_copy.py --spec … --brand …`, `validate.py spec … --lint --brand …`, `voice_check.py --spec … --brand …`.
3. Arabic editor runs both `ortho_lint.py` and `bidi_lint.py` itself on copy alone with real script/rule paths. VETO returns listed fixes to copywriter, at most two rounds; unresolved VETO stops the post.
4. Panel swipe test: pulls, readers per slide, weakest transition; copywriter fixes its two sides, one re-read (`swipe 1/1`). Fresh Creative Director's eight-lens `المرحلة: script` review: at most three named notes/two script loops. Preserve it when adding the final review.
5. `render.mjs --covers` on gated hooks; director's art-shortlist role pass ranks styles with `render.mjs --preflight`; `render.mjs --style-sheet`. **Checkpoint 2:** Studio Script link, three fitted covers including a shock cover (loss/contradiction/hard number), style sheet and script. Creator locks hook/style, or «زي ما تشوف» delegates and director states the choice. A standing `brand.ext.styleChoice` skips only the style half. Nothing in round 4 starts before locking. `--stage room --spec spec.json`.

### Round 4: Design huddle — art + motion → art → visual artist
1. Pull Studio edits. Dispatch art/motion after locking; separate first lines name the same focal element/metaphor. Art records ranked shortlist and creator choice. One convergence, then ruling (`huddle 1/1`). Motion designer decides the recipe; move tables/Studio recommendation only propose. Director writes the decision: `spec_edit.py --spec spec.json --brand brand.json apply --file approved-motion.json`, file shape `{"post":{"cover":{"motion":{"recipe":"stamp","feel":"story","seconds":6,"fps":30,"source":"internal"}}}}`.
2. Motion writes six planned lines at 0.0, 0.4, 1.5, 3.0, 4.5, 5.9 seconds; frame 0 carries the focal element. Creator approves before encoding; no encoded-frame check yet.
3. Art writes `visual-plan.md`, sets picture-slide types, designs every slide including engine cover, merges named free blocks under the pen. Review render `out-design/`, `sheet.png`; judge/fix hierarchy, anchor, empty band, crowding, rhythm. Board: `الخطة البصرية` → `التصميم الحر` → `ورقة المراجعة`; `--stage huddle`.
4. Pictures only with agreement and connected image tool: artist runs `plates.mjs slots --dir <post> --brand brand.json --format json`, writes prompts/manifest; director approves/calls tool; artist opens every original, checks no letters/digits/logos/watermarks, records dated `textCheck`, runs `plates.mjs check --dir <post>`. Director runs `plates.mjs apply --dir <post> --brand brand.json`, then check again. No ad-hoc fitting.

### Round 5: Review — QA → motion/art review + panel → Creative Director
1. QA exports with brand, every gate, `--contact-sheet`; opens every full-size slide and 130 px sheet, reads text against spec/brand strings, checks 4:5 crop, AI checks, kit. BLOCK veto stops delivery.
2. Now the MP4 exists: motion checks encoded frames/V1; actual times go under `اللقطات المقاسة من MP4:` after the six planned lines. Art's review pass reports without writing. Panel reacts to the cover tile of `contact-sheet.png` and feed-size cover. Stable artifact for all judges.
3. Fresh Creative Director adds a second `{#review}` keyed `المرحلة: final`, re-checks promises. Open findings cap lenses. REVISE: ≤3 named notes, ≤2 review loops; fix → QA/review again. VETO/BLOCK never waived. `design` log names QA result/director verdict; `--stage final --spec spec.json`.
4. **Checkpoint 3:** reviewed Studio Design, what to inspect, log. After approval: memory → `hooks.history` → kit → publishing choice (section 5).

## 4. Team fast lane
For source material (news, article, link, PDF, notes, transcript), or «بسرعة» / "fast" after the router's earlier rows. Exactly one owner per step; no invented pitch/duel/panel.
1. **Director:** brand/memory; `<post>/brief.md`, five lines: idea, enemy, intent, constraints (4 to 10 including cover), facts the post rests on.
2. **Strategist, one call only if claims/numbers and search exists:** verify, return source entries (label, URL, figure supported) and caveats. Background while step 3 runs. Director registers verified sources once slide ids exist: `spec_edit.py --spec spec.json --brand brand.json source add --url <url> --label <label> --excerpt <figure> --verified --slide s02`. Without search, state uncertainty; never attest silently.
3. **Copywriter role pass:** `hooks.json`, 8 to 12 hooks from ≥3 families; `hook_features.py --batch`; `render.mjs --covers` on gate-passing hooks. Director's read-only art-shortlist role pass recommends by fit/pre-flight; `render.mjs --style-sheet`.
4. **Creator checkpoint A, one message:** three rendered covers that already fit, always one shock cover (loss/contradiction/hard number), and style sheet. Creator chooses or «زي ما تشوف» delegates and director states which. Standing style skips only style question. **Hook/style lock here; nothing after this step starts before it.**
5. **Copywriter role pass:** `script.md`, `caption-pack.json`, `fill.json`, `spec.json` under director's pen; at most 10 slides; clean `lint_copy.py`, `validate.py spec … --lint --brand …`, `voice_check.py` when fingerprint exists. Register verified sources with `source add`.
6. **Arabic editor, one fresh-context call:** copy alone; proofread folder, dialect and real `data/rules/ortho.json`/`copy.json`; runs both lints, PASS/VETO plus rows. Director applies listed corrections; unresolved VETO stops the post.
7. **Art director, one design pass marked «fast lane»:** own visual plan, every slide including cover, named free merges, one render/review sheet. Holds spec pen; director queues changes until card returns.
8. **Visual artist, only agreed pictures/connected image tool:** slots/manifest → prompts → director's approved tool call → artist inspects every original (no letters/digits/logos/watermarks) → director's `plates.mjs apply` and `check`. Art has set slide types first.
9. **QA producer, one call:** full export itself with `--brand`, every gate, every full-size slide and 130 px sheet; BLOCK/FIX with slide ids. BLOCK veto stops delivery.
10. **Creative Director, one fresh-context call:** compact final review from its brief; `اللجنة: لم تُشغَّل`. REVISE: ≤3 notes to named roles, one loop (fix → QA → review); unresolved issues stop delivery. Director stores only `director`, `editor`, `design`; design names `QA: ok|PASS|FIX|BLOCK` and `المدير الإبداعي: SHIP|REVISE|KILL`. `python <create>/scripts/board_check.py --stage fast --spec spec.json` before handoff.
11. **Creator checkpoint B:** Studio Design link, what to inspect, log. After approval: memory (panel fields absent) → `hooks.history` → kit → publishing choice. No substitute audience test or guessed panel values.

## 5. What the creator sees and publishing
Decisions/reasons only. `spec.ext.teamLog`: ≤6 `{k,t}` lines, one per actual key, ≤160 characters each. Never show board/cards/raw reactions unless asked. Compact lanes have no `pitch`, `duel`, `swipe` keys. Ready has `director`, `design`, optional `editor` only if one ran; `board_check.py --stage ready --spec spec.json`.

Use natural Arabic for the visible design result, for example `الجودة: سليم؛ المدير الإبداعي: جاهز — اكتمل الوعد`. The checker also accepts the English labels above: `سليم/تعديل/موقوف` correspond to QA pass/FIX/BLOCK, and `جاهز/تعديل/مرفوض` to SHIP/REVISE/KILL. It still requires both results and refuses delivery over a BLOCK or a non-SHIP verdict.

After design approval ask once, in their dialect: connected publishing tool, or files for manual posting? Read `brand.ext.publish` (`manual`/`tool`) first; a saved answer skips only that preference question. Manual: posting guide's four steps. Tool: read its own instructions/limits from the tool; act only on the creator's word each time for accounts/platforms they name. Never infer a platform or treat preference as publishing permission. Save through brand-setup (`brand-lookup.md`). The plugin publishes nothing itself and ships no tool-specific recipe.

Memory: `move` = `big-number`, `enemy`, `reveal`, `mirror`, `before-after`, `cheat-sheet`, `insider-leak`, `confession`, `free-vs-paid`, `countdown`; `verdict` = `ship`, `revised`, `killed`. Write after approval; killed ideas record a reason, abandoned unfinished posts record nothing.

## 6. Wiring map (one page)
| Lane | Ordered owner → files | QA veto and Creative Director |
|---|---|---|
| Ready script | director → verbatim `script.md`, parsed spec; copywriter role pass → missing `fill.json`; director → commands/`spec.edits.json`, hook/style lock; art → plan/free/review render; optional artist → prompts/manifest, director → plates; QA → kit/reports; reviewer → `review-final.md`; director → log/Studio | QA exports/vetoes before reviewer; reviewer scores team work only, never creator words; `--stage ready`; approval before memory/history/kit/publishing choice |
| Own Reel/post | director → owned material as `script.md`, ready lane from step 2 | Same ready QA veto/review |
| Team fast | director → brand/memory/brief; strategist → sources alongside copywriter role pass → hooks; checkpoint A locks hook/style; copywriter → script/caption/fill/spec; editor → PASS/VETO; art → plan/free/render; optional artist → prompts/manifest; director → plates; QA → kit/reports; reviewer → compact final; director → log/Studio | Editor veto before design; QA veto step 9; fresh Creative Director step 10, one revision loop; `--stage fast`; checkpoint B before memory/history/kit/publishing choice |
| Guided team | R1 director → brief/board; R2 strategist/copywriter/panel/reviewer → pitch/personas, checkpoint 1; R3 copywriter/editor/panel/reviewer → hooks/script/caption/script review, checkpoint 2 locks hook/style; R4 art/motion → plan/free/storyboard, optional artist → prompts/manifest; R5 QA/motion/art/panel/reviewer → kit/frames/final review; director → board/log/Studio | Editor veto R3; QA veto R5; fresh Creative Director at script and final, phase-keyed blocks; `--stage final`; checkpoint 3 before memory/history/kit/publishing choice |
