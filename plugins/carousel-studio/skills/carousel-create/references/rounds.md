# The director's run sheet: how to run the five rounds

Formats: `team/<agent>.md`. Board and loop limits: `team/charter.md` sections 5–6. This page owns the round order.

## 0. Before round 1

1. **Choose the surface once.** Subagents exist only when the `Agent` tool is available and the `carousel-studio:cs-*` agents are listed. Then dispatch (section 1). Otherwise, or for any role whose dispatch fails, run a role pass (section 2). Never tell the creator which you chose.
2. **Make the board.** Copy the skeleton of `team/charter.md` section 5.1 to `board.md` beside `spec.json` (the post's working folder, `flow.md` section 0), fill the header (`mode`, `dialect`, `digits`, `loops` at 0 of each limit) and keep the anchors `{#id}`. Where there is no disk (the Claude app without code execution) hold the same text as running notes and skip the scripts that read a file.
3. **Read the memory.** `python <brand-setup>/scripts/brand_io.py memory --slug S` (or read `creativeMemory` from the brand you were given). Write down what must rest (the families of the last two posts; the moves, recipes and presets both of them used), the call-to-action kinds to avoid, the last covers, the pitch habit, any open series, killed ideas, what was loved or rejected. No brand file: "first post with the team".
4. **After every round** run `python scripts/board_check.py board.md --stage <brief|pitch|room|huddle|final> [--spec spec.json]`. Exit 2 means an error: fix the named section before going on. Exit 1 is a FIX: fix it or log why not. Never edit the checker's rules or the loop counters to pass.

## 1. Dispatching a specialist (Cowork, Claude Code)
A subagent starts with nothing, so the prompt carries everything:

```
Agent type: carousel-studio:cs-<name>. Fresh context. Post <id>; dialect <code>; digits <western|arabic-indic>; mode <guided|fast>.
Skills root: <absolute path to plugins/carousel-studio/skills>. Resolve skill paths from here.
Read: <absolute path>/board.md, sections <ids>; <absolute path>/brand.json, fields <names>.
Material: <absolute paths, or the text itself when it is short>.
Task: <one sentence>.
Return exactly the output your brief defines, then your handoff card. Do not edit the board; edit only <file> if your brief says so.
```
- Give each role only what it needs (the table below), absolute paths only, and the scripts folder when it runs a script.
- **Parallel:** art and motion; editor on hooks while the copywriter drafts the script. Panel calls each include all three personas. **Never parallel:** two roles that write the same file.
- **The director's own reviews** (the pitch recommendation, the duel, the eight-lens review) go to `carousel-studio:cs-creative-director` in a fresh context with the board and the work, so the person who wrote the work does not grade it.
- Append what comes back to the board yourself, with the role's handoff card under `{#cards}`.

| Role | Reads (and nothing more) | Must not see |
|---|---|---|
| strategist | brief, decisions, the memory summary, the source pack | personas, panel results |
| copywriter | brief, pitch, its own duel table, swipe fix notes, memory covers and CTA kinds | - |
| arabic editor | the copy, the dialect file and the lint output | the brief, the debate, the director's notes |
| audience panel | the persona card(s) and the material of this one call | the brief, the pitch rationale, scores, any note of the director |
| art director | brief (visual direction), review notes, huddle | persona chatter |
| motion designer | brief, huddle, memory recipes | - |
| visual artist | huddle, image needs, connected tools | - |
| qa producer | the spec, the renders | opinions |
| creative director (reviewer) | the whole board and the work | - |

## 2. Playing a role yourself (the Claude app, or a failed dispatch)
Read only that role's brief and allowed board sections. Produce its output and card, append them, then switch roles. Editor sees only copy; panel sees only cards and material. Keep role switches and the board out of chat.

## 3. The rounds

### Round 1: Brief
1. Frame the brief in the director's format: one idea, one enemy, the goal from the brand's intent mix and the memory, the awareness level, **two directions** (different families from `data/hooks/families.json` whose intent fits, different moves, the bold one with its risk), 3 to 4 candidate families, the visual direction with its one bold move and a proposed recipe, and the **platform facts** the cover and slide 2 will rest on (`حقائق المنصة:`, ids from `data/platform-instagram.json`). Check the register: a fact that is open (neither derived nor currently verified/owner-tested) goes to the strategist to verify by web search when a search tool exists; otherwise it goes at the top of the first message to the creator and the Proof lens stays at 3 or below.
2. `board_check --stage brief`.

### Round 2: Pitch
1. content-angles returns its table silently. `carousel-studio:cs-strategist` uses those scores without re-scoring and recommends safe and bold directions.
2. `carousel-studio:cs-copywriter`: one cover line (hero of at most 6 words) and a concept for each direction.
3. `carousel-studio:cs-audience-panel`: **one build+pitch call**. Cast all three personas from the brand (two core, one extension), then react independently to the two cover lines. Write the cards to `{#personas}` and `n/3` stops to `{#pitch}`. Keep the rationale and scores out of the call.
4. `carousel-studio:cs-creative-director`: the recommendation (stops, cold reads, fit, memory) and the rejected option the creator might prefer. One send-back to the strategist or copywriter is allowed (`pitch 1/1`); after that you decide.
5. Update the board (`{#pitch}` القرار with its reason, `{#decisions}`), run `board_check --stage pitch`. Every mitigation the decision rests on («الرقم بيحل مشكلة سلطان») goes into `{#decisions}` as `- وعد: … — يتأكد على …` (the promise ledger, charter 4.7).
6. **Checkpoint 1.** Guided: send the numbered options in the director's format and wait; the creator's number goes to `اختيار المبدع:` (a merge becomes «دمج»). Fast: pick the recommendation, say which in one line, write it. Then build the angle stub (`flow.md` section 1) and validate it.

### Round 3: Writers' room
1. `carousel-studio:cs-copywriter`: 12 or more hooks, 4 to 6 families, at most 3 per family, in the post's dialect; run `hook_features.py --batch` and write the table `{#duel}` (a failed gate stays as `fail`). Fewer than 3 families surviving: one re-draft of 6 more (`duel 1/1`).
2. **Heats and champions:** the best hook of each surviving family (score, then your judge's J as `hook-scoring.md` defines it). Write `أبطال العائلات`.
3. **Panel votes:** one panel call with all three personas and the champion covers only (at most 6): stop or scroll plus the cold read. Write `أصوات اللجنة` and `القراءة الباردة` as `id n/3`.
4. **Knockout:** `carousel-studio:cs-creative-director` uses clarity → family evidence → stops → gap → fit → freshness → score. Record duels and podium. Score leader differs from panel favourite: copywriter writes one hybrid, one panel call votes for all three personas, record `الهجين:` and the winning cover. Top two other families are alternates.
5. **Script and caption pack:** `carousel-studio:cs-copywriter`, as `flow.md` sections 3 and 4 (architecture, limits, sources, `cover.motion`), with `scripts/lint_copy.py`, `validate.py` and `voice_check.py` clean.
6. **Language check:** `carousel-studio:cs-arabic-editor` on the copy alone. VETO: the copywriter fixes exactly the listed rows, the editor re-checks (at most 2 rounds, counter `editor`). A second VETO ends the stage: tell the creator in one line what blocks (cut, add the source, or fix) and stop.
7. **Swipe test:** one panel call, all three personas, final script only. Record pulls, drop-off map and weakest transition. Copywriter changes only sK's bridge and sK+1's first line; one all-persona re-read changes only affected rows (`swipe 1/1`). Other weak spots become ≤3 review notes.
8. **Review:** `carousel-studio:cs-creative-director` gives the eight-lens review (`المرحلة: script`). SHIP: go on. REVISE: send the named notes to the named agents (at most 3, `script` counter, at most 2 loops), then review again. KILL: restart from the next angle of the strategist's table (back to round 2, step 4, with the killed idea logged).
9. Run `flow.md` section 5 (the check loop) on the final spec, then `board_check --stage room`. Write the log lines `director`, `pitch`, `duel`, `swipe`, `editor` into `spec.ext.teamLog`, set `checkpoint: "script"` (guided) or `"design"` (fast) and hand off (`flow.md` section 6).
10. **Checkpoint 2** (guided): the Studio link on its own line, what to look at, one «ليه؟» line, and the log lines the creator has not yet seen.

### Round 4: Design huddle (after «تمام، صمّم», or at once in fast mode)
0. **The style shortlist.** Run `node <carousel-design>/scripts/render.mjs --preflight --spec spec.json --brand brand.json --format text` (nothing is exported; the cover and slide 2 in each preset, through the rendered gates). `carousel-studio:cs-art-director` ranks three presets by the topic table in `presets.md` and what the pre-flight shows (hero size at 130 px, empty band, motion allowed), and prints the `الستايل:` line. Choose by fit, not by habit. If a technical gate forces a swap away from the best fit, run this round again on the new preset (`huddle 1/1`) and carry the reason into the creator's «ليه؟» line and the `design` log line.
1. List the candidate focal elements from the cover's own text (the hero number, the key word, the symbol). Then, in parallel and without seeing each other, with that list in both prompts: `carousel-studio:cs-art-director` (preset, overrides, the cover's focal element as one noun phrase, the visual metaphor) and `carousel-studio:cs-motion-designer` (recipe with the tag that decided it, the focal element, the metaphor). If both name the same element in the same words, copy their two lines into `{#huddle}`. If not, you rule once and log why (`huddle 1/1`).
2. `carousel-studio:cs-visual-artist` only when an image or video tool is connected and the creator agreed (`visual-prompts` skill; text-free plates).
3. The motion designer's six-frame storyboard goes under the huddle lines, with the 0.0s line showing the focal element (the bold move is in the poster, not only mid-video). Show the six lines to the creator and apply their changes before encoding; after the first encode the motion designer pulls the six frames from the MP4 and checks them (clearance, motion share, no empty stretch).
4. **Visual plan → free design → review sheet.** The director writes one plan line per inner slide in `{#huddle}`; the art director writes and merges every `free` block, renders and Reads the review sheet. Record `التصميم الحر: <files>` and `ورقة المراجعة: <path>`, in that order after `الخطة البصرية`. Then `board_check --stage huddle`.

### Round 5: Review
1. carousel-design renders and exports (pass `--brand`); `carousel-studio:cs-qa-producer` runs the gates and says which scopes ran (the kit's report holds the text, rendered and export gates); `carousel-studio:cs-art-director` reviews the pixels, reads every header and footer string against the brand, checks the 4:5 crop and the empty band, and Reads the cover tile in `contact-sheet.png`; `carousel-studio:cs-audience-panel` reacts to the cover at 130 px and at feed size, one call for all three personas.
2. `carousel-studio:cs-creative-director`: final eight-lens review with 130 px stops, QA, art verdict and each ledger promise checked on the renders. Open FIX caps Craft, unreadable load-bearing text caps Hook, open platform fact caps Proof at 3. REVISE: ≤3 notes to named roles, ≤2 loops, then render/review. BLOCK and language VETO must be fixed.
3. Write the `design` log line into `spec.ext.teamLog` (republish the Studio to the same link so it shows), run `board_check --stage final --spec spec.json`.
4. **Checkpoint 3:** the creator approves. Then, in this order: write the memory entry (`brand_io.py remember`, fields in `team/cs-creative-director.md` "Memory"), append `hooks.history`, deliver the kit. A post the creator abandons before checkpoint 3 is not recorded; a KILLED idea is, with `verdict: killed` and the reason.

## 4. Solo fast lane
For «بسرعة», "fast" or a quick post, the main thread writes the angle, hooks and script from the writing references. No five rounds, panel, strategist, motion designer or creative-director reviewer. Keep the ready-script lane unchanged.
1. Find the brand, read memory, choose one angle and score the hooks with hook_features.py; draft at most 10 slides including the cover (4 to 6 is fine) and the caption pack. Use the shipped motion recipe picked by recommend.
2. Dispatch only carousel-studio:cs-arabic-editor once on the copy (veto). Apply its listed corrections; an unresolved VETO stops the post. Run lint_copy.py, validate.py --lint --brand and voice_check.py where applicable.
3. Dispatch only carousel-studio:cs-art-director once, marked «fast lane»: visual plan → free design → one render/review sheet check. Rebuild the Studio in Design view.
4. Dispatch only carousel-studio:cs-qa-producer once on the spec and renders, with brand and skills root. All text, rendered and export gates run. Fix BLOCKs; unresolved ones stop delivery.
No board checker for this lane: it requires the full team's artifacts. Never fabricate panel votes, reviews or log keys. Give one final review and the Studio link; write memory/history only after creator approval. Keep panels absent from memory when none ran.

## 4b. Guided mode, end to end
Guided: brief/pitch → **checkpoint 1** (two directions, recommendation, open fact first) → writers' room → **checkpoint 2** (Studio Script) → huddle/visual plan/free design/review sheet → round 5 → **checkpoint 3** (Studio Design). Wait for the creator at each. Memory only after checkpoint 3.

## 5. What the creator sees
Only decisions and reasons. Team log: ≤6 lines, one per key, ≤160 characters each; decisions and reasons only. It is in the creator's dialect, it is stored in `spec.ext.teamLog`, and the Studio shows it as «الفريق قرر إيه؟». Never show the board, the handoff cards, the duel table or a persona's raw reaction unless the creator asks «وريني».

Memory values: `move` = `big-number`, `enemy`, `reveal`, `mirror`, `before-after`, `cheat-sheet`, `insider-leak`, `confession`, `free-vs-paid`, `countdown`; `verdict` = `ship`, `revised`, `killed`. Use these exact IDs with `brand_io.py remember`, not descriptions.
