# Hook scoring: five gates, then 100 points

Stage A decides who is allowed to compete; stage B ranks the ones that are. Then `render.mjs --covers covers.json --spec spec.json --brand brand.json --out cover-lab --presets all` checks the survivors on the post's real cover before the creator sees any choice. Code does what code can know; the model judges what only a reader can. The weights and thresholds live in `data/hooks/scoring.json`, and a unit test asserts that they add up. If this page and that file ever differ, the file wins.

## Stage A: hard gates (any failure discards the draft)
| Gate | Rule | Checked by |
|---|---|---|
| HG1 length | cover: the first beat (up to the first «…», question mark or colon; a line break only wraps the line, as in the Studio) is at most 6 words, the whole cover at most 12, the first beat at most 3 lines at the hero size. Slide 2: at most 12 words. Caption line 1: at most 125 characters. A spoken opener is not gated; it is compressed first | code |
| HG2 truth | every claimed figure (a percent, money, a multiplier, a count of views or followers, a decimal, a number over 30 with no unit, any figure in a proof, before-and-after or big-number pattern) is in `--sourced`; a list's count must equal its payoff slides | code, then the model confirms the source exists |
| HG3 one gap | one specific gap that the cover does not answer; a hit on an answer cue («السبب هو»، «الحل هو»…) fails; a single word fails | code finds the obvious; the model must quote the gap phrase |
| HG4 register | no deny-marker of another dialect, one digit system, no spelling error of BLOCK level | code (the same lint as `lint_copy.py`) |
| HG5 policy | no comment bait, no conspiracy framing, no empty-slot hype, no guaranteed or life-changing promise, no stacked fear (2 or more distinct fear words) | code |

Single dramatic adjectives are listed as NOTE in `copy.json` and do not fail HG5.

## Stage B: the score (100 points)
| Part | Points | Who | How |
|---|---|---|---|
| **P** prior | 20 | code | intent match 12 (the family's primary intent), 7 (in `also`), 2 (otherwise) plus up to 8 for evidence: D-own 8, D 6, O 6, EC 4, SE 2, each scaled by min(1, n / 20) and ignored when n is under 5. A brand's own `hooks.familyPriors` counts as D-own when its value is at least its baseline |
| **R** rules | 40 | code | four scores of 10, below |
| **J** judge | 40 | model | gap quality 20, save or send trigger 10, slide-2 deliverability 10 |

**R, part by part** (each clamped to 0 to 10; the detail comes back in `rules.detail`):
- **Scannability.** Meaning word first: 5 if the first word is not a function word, else 3 if the second is not. +2 for a clean «…» break with two beats. +3 for a numeral in the first beat when the family is a list family (P1, P3, P11, P15, P16, or any family whose architecture is a listicle or steps), +1 otherwise.
- **Specificity.** Base 4. +2 a numeral, +2 a Latin tool or brand name (Arabic posts), +2 a time frame (دقيقة، أسبوع، شهر…), +2 when at least two words are four letters or longer and not function words. −5 for each distinct abstract word from `copy.json` (نجاح، حياتك، سر…).
- **Awareness fit.** The family's `awareness` list against the post's stage: 10 when it contains it, 5 when it contains a neighbouring stage, 0 when it is two or more stages away, 5 when no stage was given.
- **Voice fit.** Base 8. −5 for a machine-written phrase, −5 for a stock opener, −3 for stiff MSA, −3 for a word-for-word translation pattern, −5 for a word on the brand's `voice.avoid` list; +1 for a word on its `voice.use` list.

**Penalties** (added to the total): −10 when the family matches either of the last 2 posts; −15 when the similarity to a hook the brand used in its last 30 posts is 0.8 or more (trigram similarity of the letter skeleton, the same measure the C-gates use; this carries the freshness check); −5 for an emoji on the cover; −5 for a Latin-only cover in an Arabic post.

`partial` in the output is R + P + penalties (up to 60 before the judge). The final score is `partial + J`.

## What `hook_features.py` returns
Per hook: `gates` (each `{pass, reason: {ar, en}}`, with `judged: true` for HG2 and HG3), `discarded`, `failed`, `cover` (hero, sub, word counts, estimated lines, `breakAt`), `rules` (the four scores, `R`, and `detail`), `prior` (`P`, `basis`, `ownEvidence`), `penalties`, `similarity` (`max` and `hookId` against the brand's own history; `libraryMax` against the shipped examples, informational only), `lints` (the family's own lints, each `pass`, `fail` or `judge`), and `partial`. A batch adds `summary`, `ranking` and `top3` (three different families, survivors only).

Exit code 0 means the single hook passed every gate, or a batch has at least one survivor; 2 means a gate failed (single) or nobody survived (batch); 64, 65, 66 are usage, bad JSON and a missing file.

## The judge (J, 0 to 40)
Score each surviving cover yourself, from its text and its family's `slide2` line, before looking at the ranking. Write `{"<id>": J}` to a file and pass it with `--judge`.

**Gap quality, 0 to 20.** Quote the gap phrase first; if you cannot quote one, the score is 0.
- 0 to 6, weak: the gap is vague or already closed. «5 نصايح للنجاح»; «الحقيقة عن الكاروسيل».
- 7 to 13, workable: a gap exists but is generic or the slides cannot obviously close it. «ليه محدش بيحفظ بوستك؟»
- 14 to 20, strong: one specific gap, closable in 3 to 5 slides, with a clear reason to keep going. «5 أخطاء بتموّت الكاروسيل… الرابعة بيعملها الكل».

**Save or send trigger, 0 to 10.** For a save intent: will the reader reuse it (a checklist, a template, a ranked list)? For send: is there an obvious person to forward it to? For reach: does it carry identity or a debate? 0 when none, 5 when implied, 10 when it is the point.

**Slide-2 deliverability, 0 to 10.** Can the first payoff land on slide 2 in 12 words or fewer? 0 when the cover needs an intro first, 5 when it can with a stretch, 10 when slide 2 is already written.

Do not give the top band to more than one cover in four. A judge who scores everything 35 or more has stopped judging.

## Selection
Rank survivors by total (partial + J), then pass their `headline`, optional `sub` and `kicker` to `render.mjs --covers covers.json --spec spec.json --brand brand.json --out cover-lab --presets all` from carousel-design. A text score or estimated line count cannot prove fit. Read the lab's actual hero size at 130 px, lines, width ratio, empty band and findings; resolve cover FIX/BLOCK before selection. The lab ranks physical fit separately from this score and writes only `covers.png`.

Take the highest three fitting covers with three different families and different tension. Ties: the brand's own evidence first, then fewer words, then the id. Show each as a rendered image at feed size and 130 px, with its score, family, a short reason, slide-2 line and CTA kind. Never offer bare text in place of a rendered cover. On a stronger-hook request, one of the three is always a shock cover: a sourced loss, a contradiction or a hard number. It must pass the same gates. If fewer than three fit, write fresh hooks and repeat gates then lab.

**Score against the panel.** The score carries the account's evidence (P, up to 20 points), so the duel does not re-count it as a vote: it uses the family's tier as its second criterion, after clarity and before the stop votes. When the champion with the highest total and the champion with the most stop votes differ, the cover is a hybrid (the favourite's tension, the leader's visible number), not a coin toss; in the first dogfood post the number-led list led both the heuristic (82) and the judge's order and lost on one persona's vote, and the final cover then hid the number in a sub-line that vanished at 130 px.

## Worked example
Brand: Egyptian, save intent, problem-aware, history ends with family F17 and P4.
- «5 أخطاء بتموّت الكاروسيل»: P3, gates all pass; scannability 8, specificity 8, awareness 5 (no stage given) or 10, voice 8; P 12; no penalty; partial about 41; J 31 gives 72.
- «الحقيقة الصادمة عن الكاروسيل»: HG5 fails (empty-slot hype). Discarded, whatever it would have scored.
- «مشكلتك مش في الألوان… مشكلتك في أول جملة»: F17, passes, but the family is in the last two posts: −10.
