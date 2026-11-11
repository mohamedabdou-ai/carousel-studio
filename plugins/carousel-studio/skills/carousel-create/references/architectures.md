# Architectures: the shape of a whole post

An **architecture** is the order of ideas across the slides (`spec.architecture`). A **slide type** is the layout of one slide (`slides[].type`, 18 of them). Choose the architecture first, then the types. The engine only insists that the first slide is a `cover` and the last is a `cta` or `offer`; everything else here is craft.

## Choosing
| The angle is… | Architecture | Intent | Typical CTA |
|---|---|---|---|
| a count of things, tools, tips | `listicle` | save | save |
| something to do, in order | `steps` | save | save |
| a belief to correct | `myth-fact` | reach, send | send |
| something that happened | `story` | send, reach | question, follow |
| a result with its causes | `case-study` | save, sell | save, keyword-dm, follow |
| a reusable named structure | `framework` | save | save |
| X against Y | `comparison` | save, send | save, send |
| a stance | `opinion` | reach, send | question, send |
| something just changed | `news` | reach | send, follow |
| an offer or launch | `offer` | sell | keyword-dm, follow |
| client results | `results` | sell | keyword-dm, follow |
| a free asset in return for a keyword | `lead-magnet` | sell | keyword-dm |

`contentType` is `soft-sell` for `offer`, `results` and `lead-magnet`, otherwise `value`. The CTA kinds allowed for each intent come from `data/platform-instagram.json` (`plugin.cta.allowedByIntent`): save → save, follow, question; send → send, question; reach → send, follow, question; sell → keyword-dm, follow, question, save.

## Skeletons
`N` is payoff slides; a `rehook` can deliver one. Plan 4 to 10 slides including cover; 4 to 6 are fine for a short idea; never more than 10. Optional context, recap and share use the same budget. For a skeleton `slides = payoffs + 3`, payoffs ≤7; count the actual skeleton, whose extra slides may lower N further. Never pad.

| Architecture | Slides, in order | Notes |
|---|---|---|
| `listicle` | `cover, rehook, item×N, summary, cta` | N = 1 to 6 with this full skeleton. Mark each member with `ord`; the cover numeral equals the distinct numbered members (C6, BLOCK), even when they use `proof` layouts. Tease the strongest item early (slide 2), reveal the best one second to last |
| `steps` | `cover, proof, setup?, step×N, summary, cta` | N = 1 to 5 (6 without setup), verb first, «الخطوة i من n». `proof` is the finished result. Add `setup` (tool, plan, device, price) for any tool topic. Put the common mistake in the last step's body or as one `item` |
| `myth-fact` | `cover, rehook, myth-fact×N, summary, share, cta` | The `rehook` is the cost of believing the myth. Each `myth-fact` states the myth once and makes the fact bigger and last. The recap carries facts only |
| `story` | `cover, story-beat×N, quote?, cta` | N = 2 to 7: cold open, stakes, beats that each end on a turn («لكن…»), the turning point, the lesson, the action. End on a question or an action, not on a moral lecture |
| `case-study` | `cover, rehook, proof, proof, item×3, item, cta` | A sourced sharp-number result, the specific before, the after as proof, 3 levers (one per slide), what failed, how to apply. All numbers sourced |
| `framework` | `cover, rehook, item×N, checklist, cta` | The `rehook` shows the whole framework on one slide. One component per slide with an example, at most 4 chunks per slide. The checklist is printable and saveable |
| `comparison` | `cover, rehook, compare×N, summary, cta` | The `rehook` gives the verdict first. Honest limits on every side. Prices and plans sourced |
| `opinion` | `cover, rehook, item×3, compare, share, cta` | Stance on the cover, the strongest reason on slide 2, the fair counter-argument, a `share` slide, one open question as the CTA |
| `news` | `cover, stat, item×N, share, cta` | A dated change with its source (`stat` or `proof`), what it means in three items, who should send it to whom |
| `offer` | `cover, rehook, proof, item×N, testimonial?, offer` | N = 3 to 5 (what is inside, how it works). The `rehook` names the problem it solves. Ends on the `offer` slide, which carries the CTA. Everything on it comes from the user |
| `results` | `cover, proof, testimonial, item×3, offer?, cta` | A real, sourced result and the client's permission. The levers are the story |
| `lead-magnet` | `cover, rehook, item×N, offer, cta` | The `rehook` says what is inside. Items preview the asset. The CTA is a keyword DM only if the asset exists and is delivered instantly |

A soft-sell carousel has **one ask**. If both an `offer` slide and a `cta` slide carry a `cta`, they must be the same kind with matching wording.

## Rules for every architecture
1. **Slide 1 stands alone** and opens one specific gap that it does not answer. Slide 2 is a second cover: it must make sense to someone who never saw slide 1, pays off at once and has no intro (`slide-limits.md`). Instagram re-serves a carousel from slide 2 to people who did not swipe, so a viewer who starts there never saw the cover's promise: **in a counted architecture (`listicle`, `steps`, `framework`) slide 2 carries the count the cover promised or names the first item** («بعد النشر تمسح أو ترتّب سلايد، مش تعدّل كلمة ← لذلك 7 حاجات قبل الدوس»), in 12 words (gate C6.slide2-promise, FIX). Write slide 2 as an alternate cover plus a one-line micro-payoff, never as a restatement of the cover's fact.
2. **One idea per slide.** If a slide needs «و» between two ideas, split it.
3. **A bridge ends every non-final slide** of the types `rehook, item, step, stat, compare, myth-fact, proof, setup, story-beat, grid, timeline`. It is at most 8 words and leaves a sentence or question open across the edge. Examples: eg «والتالتة هي اللي فرقت» · gulf «والثالثة هي اللي تفرق» · levant «والتالتة هي اللي بتفرق» · msa-white «والثالثة هي الأهم» · en "And number three changes everything." No two bridges alike in one post.
4. **Order of value:** the strongest item is teased early and revealed second to last; the last payoff closes every loop opened before; the CTA comes after the payoff, never before the first half (C4.early).
5. **Progress** is the counter, which the engine prints on every slide, and the «باقي k» word that replaces the swipe word on the last two slides when the cue shows a word (an arrow cue). With the neutral cue there is no swipe word: the counter and a quiet progress rail carry the progress. Do not write «1/7» on a slide yourself.
6. **Arabic flow:** a word is never split across slides; an iḍāfa («محرك البحث») and a number with its noun («5 ساعات») stay together on one slide; a sentence crosses a slide edge only through a bridge.
7. **A `share` slide** («ابعتها لحد…») comes before a send CTA, and is itself free of a `cta` object.
8. **A tool topic gets a `setup` slide** (what you need: tool, plan, device, price). The audience asks about setup, free or paid, and Mac.
9. **Count what you promise.** «5 أدوات» means 5 numbered members (`ord`), regardless of layout type. A cover with a numeral on a list or steps architecture is checked against the slides.
10. **Change the rhythm.** No more than 3 slides in a row with the same type/variant (D8). Vary layout or use a demonstration slide (before/after, safe zones, prompt) within the same 10-slide budget. Cover count equals distinct numbered members (`ord`), regardless of type. Never add an eleventh slide to satisfy variety.

## Swipe triggers you write
The engine adds the counter, the «باقي k» label and, for a mixed audience, a quiet progress rail; you write the rest.
1. **An unfinished sentence across the edge** (the bridge): «والسبب الحقيقي…». Each line exists to get the next one read.
2. **A cliffhanger last line** on the slide before the payoff: «بس دي مش أهم واحدة».
3. **Predict, then reveal**: ask for a guess on one slide («خمّن رقم 1؟») and answer on the next.
4. **A swipe prompt in the caption** («اسحب لآخر سلايد») is cheap and correlated with slightly higher engagement; keep it short.
5. **Progress that does not drag**: up to 10 slides, including the cover the counter helps; near the end the «باقي 2» label does. Slow-feeling progress raises drop-off, so every slide must pay.
6. **A video or motion slide in the middle** is optional and only if the user supplies it; mixed media tends to do well, but it is never a reason to pad the post.
A useful 4 to 6 slide post needs no extra slides. Plan every carousel within 4 to 10, cover included.

## Slide types: required and optional fields
`ord` (the item or step number) is derived by the engine; set it only to override. `sides` for `compare` and `myth-fact` is exactly two entries in logical order (myth then fact; A then B), each `{label?, text}`; `stat.number` is `{value, unit?, sourceId?}` with `value` a string in Western digits (`"5"`, `"1.2"`).

| Type | Required | Optional |
|---|---|---|
| `cover` | `headline` | `kicker`, `sub`, `media` |
| `rehook` | `headline` | `sub`, `media`, `bridge` |
| `item` | `title`, `body` | `ord`, `media`, `bridge` |
| `step` | `title` | `body`, `ord`, `media`, `bridge` |
| `stat` | `number`, `title` (and `sourceIds`) | `body`, `bridge` |
| `compare` | `sides` (2) | `title`, `bridge` |
| `myth-fact` | `sides` (2) | `title`, `bridge` |
| `quote` | `body` | `attribution`, `media` |
| `story-beat` | `body` | `title`, `ord`, `media`, `bridge` |
| `checklist` | `title`, `bullets` (≤8) | `bridge` |
| `summary` | `title`, `bullets` (≤8) | none |
| `setup` | `title`, `bullets` (≤4) | `bridge` |
| `proof` | `media` (a screenshot) | `title`, `body`, `number`, `bridge` |
| `share` | `headline` | `sub` |
| `cta` | `title`, `cta` | `body` |
| `offer` | `title`, `cta` | `bullets` (≤4), `number` |
| `testimonial` | `body`, `attribution` | `number`, `media` |
| `poster` (single post) | `headline` | `kicker`, `sub`, `bullets` (≤4), `media`, `cta` |
| `grid` | `title`, `items` (3 to 6) | `bridge` |
| `timeline` | `title`, `items` (3 to 4) | `bridge` |

`cta` object: `{kind: save|send|question|keyword-dm|follow, text, assetId?}`. `media` is `{slot: none|icon|photo|cutout|plate|screenshot|ui, ai: boolean, …}`; set `ai: true` only for a generated image, and never ask for Arabic text inside one.

## Soft-sell rules
- Prices, dates, quantities, guarantees and testimonials appear only if the user supplied them; quote testimonials verbatim, with their `attribution`, and only with permission.
- No artificial urgency («آخر القطع»، «العرض ينتهي قريبا») unless the user gave a date or a quantity.
- Describe what the product does, not what will happen to the reader; no absolute superlatives as a claim («الأفضل في السوق»), no guaranteed outcomes.
- The honest "who it is not for" line makes the offer believable. Use it when the user gives you one.
