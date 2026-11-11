# Slide limits

Short slides get read; long ones get swiped past. Readers take in roughly two words of a cover before they decide, and about a fifth of the words on a page. Arabic packs a lot into one word (وسيكتبونها is a sentence), so characters are capped too. The numbers below come from `data/platform-instagram.json` (`plugin.*`), which is the source of truth, and are enforced by `data/qa-rules.json`; if they ever disagree with this page, the data files win.

## Carousel length
At most 10 slides, including the still or video cover: Instagram’s publishing API and most schedulers accept at most 10 items. A focused carousel of 4, 5 or 6 slides is complete; 6 to 10 is an optional sweet spot, never a reason to pad the post.

## Counting
- Words are counted after removing the `==` emphasis markers. A token counts if it holds a letter or a digit. `وبالمنتج` is one word, `لـChatGPT` (no space) is one word, `5 ساعات` is two. Punctuation, «…» and emoji do not count.
- `\n` is a forced line break. On a cover each break adds a line; more than 3 lines is a FIX.
- The **hero** is the first beat: before a question/exclamation mark followed by space, an ellipsis (`…` or `...`), a colon followed by space, or a newline. Question and exclamation marks stay on the hero; colon and ellipsis separators do not. The remainder is the sub-line. `_cs.qa.split_cover` (and `CS.qa.splitCover`) is shared by HG1 and C1, including `lint_copy.py --text`. Keep the pieces in `headline` and `sub` when designing. Every beat, `kicker` and `sub` still counts toward the 12-word total.

## Per slide type
| Slide | Words | Lines | Characters per line |
|---|---|---|---|
| `cover`, `poster` | headline (the hero) 3 to 6 · whole cover ≤ 12 | ≤ 3 | 12 to 20 |
| `rehook` (slide 2) | ≤ 12 | ≤ 4 | 15 to 28 |
| `item`, `step`, `stat`, `compare`, `myth-fact`, `quote`, `story-beat`, `setup`, `proof`, `share`, `offer`, `testimonial` | title ≤ 6 and body ≤ 25 (FIX above 25, BLOCK above 35); ≤ 4 bullets | ≤ 6 | 25 to 40 |
| `checklist`, `summary` (dense) | ≤ 45 in all, ≤ 8 bullets | ≤ 8 | ≤ 42 |
| `grid` (dense) | title ≤ 6; card title ≤ 3 and text ≤ 5 (≤ 2 in the `tiles` look); ≤ 45 in all | none | none |
| `timeline` (dense) | title ≤ 6; node title ≤ 2, text ≤ 4, time label ≤ 12 characters; ≤ 45 in all | none | none |
| `cta`, `share` | ≤ 12 | ≤ 3 | none |
| any bridge | ≤ 8 | 1 to 2 | none |
| any slide | ≤ 50 in all (hard ceiling) | none | none |

Body lines should be at least 15 characters: long lines read better in Arabic than a short column.

## The rules, by id
| Rule | Condition | Severity | Fix |
|---|---|---|---|
| `C1.hero-words` | first beat over 6 words | BLOCK (overridable) | keep the meaning words, move the rest to `sub` or cut |
| `C1.total-words` | kicker + headline + sub over 12 | BLOCK (overridable) | drop the kicker or the sub |
| `C1.lines` | more than 3 lines | FIX | fewer forced breaks, shorter lines |
| `C1.number-words` | a number written in words on the cover | FIX | use digits: «ثلاثة أدوات» becomes «3 أدوات» |
| `C1.meaning-word`, `C1.gap-answered` | the meaning word is not first; the cover answers its own question | judged by the reviewer | put the noun or numeral first; keep the answer for slide 2 |
| `C2.title-words` | title over 6 | FIX | shorten |
| `C2.body-words` | body over 25 | FIX | one idea only; move the example to the caption |
| `C2.body-hard` | body over 35 | BLOCK (overridable) | split into two slides |
| `C2.bullets` | more than 4 bullets (non-dense types) | FIX | merge or split the slide |
| `C2.bullets-dense` | more than 8 bullets on a checklist or summary | BLOCK | trim the list |
| `C2.dense-words` | checklist or summary over 45 words | FIX | shorten each bullet |
| `C2.slide-words` | any slide over 50 words | FIX | split |
| `C2.bridge-words` | bridge over 8 | FIX | shorten |
| `C2.cta-words`, `C2.share-words` | over 12 | FIX | shorten |
| `C3.words` | slide 2 over 12 words | BLOCK (overridable) | keep one payoff |
| `C3.intro` | slide 2 opens with an intro, agenda or bio | BLOCK (overridable) | deliver the first payoff instead |
| `C3.type` | slide 2 is not rehook, item, stat, proof or myth-fact | NOTE | prefer a payoff type |
| `C5.bridge` | a non-final slide of the bridge types has no bridge | FIX | add one |
| `C6.list-count` | cover numeral differs from the distinct numbered list members (`ord`), whatever their slide type | BLOCK | change the numeral or the slides |

## A cover that works
Everything in this list is a rule from the playbook; the checker enforces the counts, the reviewer enforces the judgement.
1. **A headline of 3 to 6 words, the meaning word first.** Scanners catch about two words. «6 أدوات…» beats «في هذا المنشور سأعرض لك…».
2. **Digits, not words**, and Western by default (every numeral on the winning Arabic covers was Western).
3. **State the outcome, not a teaching promise.** «تعرف على» and «تعلّم» lowered clicks in headline tests; the result pulls.
4. **Open one specific gap and do not close it.** A cover that answers itself («السبب هو X») has nothing left to swipe for. Two gaps in one cover blur each other.
5. **Break at the «…» two beats:** setup, then punch, on separate lines: `6 أدوات ببلاش…\nبتغنيك عن ==المصمم==`.
6. **One emphasis per slide** (`==word==`), on the keyword or the number. At most one kashida word on a headline, only if the preset allows it and only if the Studio is asked for it; never in body text.
7. **No emoji on the cover**, no Latin-only cover for an Arabic brand, no "this video".
8. **No fear stack, no bait, no hype**: one negative word at most; no «الحقيقة الصادمة» or «سر خطير» without a fact behind it; no «اكتب نعم لو…».
9. It must still read at 130 pixels wide (the thumbnail test): few words, large type.

## Slide 2 is a second cover
Instagram often shows a carousel again, starting from slide 2, to people who did not swipe. So slide 2 states the topic and promise on its own in 12 words or fewer, **delivers the first payoff** (the strongest item, a proof screenshot, or half the answer), has no intro, agenda, «قبل ما نبدأ» or bio, opens a bigger loop in its bridge, and keeps the chrome, font and background family of the cover with a new focal visual (the Studio handles the look).

## Making text shorter
Cut in this order: introductions and hedges («في الحقيقة»، «بشكل عام»), repeated nouns, adverbs, the second example, then the least important clause. Keep the verb. Never cut a number's noun or break an iḍāfa to save a word. If a slide still needs more, it is two slides; if the extra is context, it belongs in the caption.

## Anti-patterns (each breaks a rule above)
- A topic label, or a cover that answers itself.
- An intro, agenda or bio on slide 2.
- More than one idea on a slide, or more than 4 bullets.
- An early CTA, or two different CTAs; comment bait; overpromising.
- Numbers without a source; stacked fear; empty hype.
- An untransformed repost of someone else's text or screenshots.
- Arabic faults: mixed dialects, mixed digit systems, broken bidi, stretched letters, typos.
- Design faults the Studio catches for you: small text, low contrast, a layout that drifts between slides, busy photos with no calm zone, glossy generic AI imagery.

## What the limits mean on the canvas
The cover hero is set between 120 and 180 px (auto-fit, target 150, floor 96). Body text is 44 to 48 px and never under 42. The engine fits every text box to the content area; copy that is too long does not overflow, it shrinks until it hits the floor and the gate fails. Do not try to hand-wrap body text; do not insert U+00A0 or tatweel yourself (the engine binds «لـ» to its Latin word and a number to its noun).

Mixed Arabic and Latin copy uses ordinary spaces: «وGoogle», «وAI Mode» and «Opus 5.5» keep their order and bind in the engine. Do not add direction marks or special spaces to make a line fit. Short Arabic connectors stay with a neighbour; a forced newline that strands one receives a rendered FIX. Mixed display lines reserve room for Arabic dots.
