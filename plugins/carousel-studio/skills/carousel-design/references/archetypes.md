# Archetypes: the 20 slide types

Archetypes own layout; presets own look. A slide in `spec.json` is `{ id, n, type, ...fields }`. `req` fields must exist at checkpoint `script`; the limits are enforced by the gates (C1–C6), not by the page layout, so a spec can be wrong while the DOM still renders.

## 1. The types
| # | `type` | Fields | Variants (first = default) | Use it for |
|---|---|---|---|---|
| 1 | `cover` | `headline` req, `kicker`, `sub`, `media` | `top center split photo number` | slide 1. Hero at most 6 words, whole cover at most 12, at most 3 lines |
| 2 | `rehook` | `headline` req, `sub`, `media`, `bridge` | `base split big-number` | slide 2: a second cover that pays off first, at most 12 words |
| 3 | `item` | `title` req, `body` req, `ord`, `media`, `bridge` | `base ghost-number side-number media` | one list item per slide |
| 4 | `step` | `title` req (verb first), `body`, `ord`, `media`, `bridge` | `base ghost-number pill` | one step; label «الخطوة {ord} من {n}» |
| 5 | `stat` | `number` req, `title` req, `body`, `bridge`, `sourceIds` | `base bar` | one sourced number |
| 6 | `compare` | `title`, `sides` req (2), `bridge` | `columns stacked versus` | A against B (side 0 = old/A) |
| 7 | `myth-fact` | `title`, `sides` req (2), `bridge` | `stacked columns stamp` | myth first and small, fact last and bigger |
| 8 | `quote` | `body` req, `attribution`, `media` | `base mark photo` | a quotation of at most 25 words (attribute it) |
| 9 | `story-beat` | `body` req, `title`, `ord`, `media`, `bridge` | `base panel media` | one beat of a story; ends on a turn |
| 10 | `checklist` | `title` req, `bullets` req (up to 8), `bridge` | `base boxes ruled` | printable list; dense type, at most 45 words |
| 11 | `summary` | `title` req, `bullets` req (up to 8) | `list grid` | recap before the call to action |
| 12 | `setup` | `title` req, `bullets` req (up to 4), `bridge` | `base cards` | requirements: tool, plan, device, price |
| 13 | `proof` | `media` req (screenshot), `title`, `body`, `number`, `bridge` | `screenshot base` | evidence; a number needs `sourceIds` |
| 14 | `share` | `headline` req, `sub` | `base big-word` | "send this to someone" slide; carries no `cta` |
| 15 | `cta` | `title` req, `cta` req, `body` | `base pill keyword` | the only slide with a `cta` in a carousel |
| 16 | `offer` | `title` req, `cta` req, `bullets` (up to 4), `number` | `base card` | soft-sell offer or lead magnet |
| 17 | `testimonial` | `body` req, `attribution` req, `number`, `media` | `base photo card` | a real result, sourced |
| 18 | `poster` | `headline` req, `kicker`, `sub`, `bullets` (up to 4), `media`, `cta` | `top center split photo` | the single post (`format: "single"`): no counter, no swipe cue |
| 19 | `grid` | `title` req, `items` req (3 to 6), `bridge` opt | `bento` | 3 to 6 cards, each with a short title and text; a payoff slide like `stat` |
| 20 | `timeline` | `title` req, `items` req (3 to 4), `bridge` opt | `rail` | 3 to 4 nodes on a rail, each with a time label (`value`), a short title and text; a payoff slide like `proof` |

Presets list the subset of variants they style; the Slide tab offers exactly that list. A `variant` outside it falls back to the preset's default.

## 2. Text limits per type (Q39; thresholds in `platform-instagram.json`)
| Type | Words | Lines | Characters per line |
|---|---|---|---|
| `cover`, `poster` | hero ≤ 6; headline 3–8; whole cover ≤ 12 | ≤ 3 | 12–20 |
| `rehook` | ≤ 12 | ≤ 4 | 15–28 |
| `item step stat compare myth-fact quote story-beat setup proof share offer testimonial` | title ≤6; design body ≤18 with card/field, ≤25 only in text-led D (hero ≥64px); engine FIX >25, BLOCK >35; ≤ 4 bullets on `item`/`step` | ≤ 6 | 25–40 |
| `checklist`, `summary` | ≤ 45 | ≤ 8 | ≤ 42 |
| `grid` | title ≤ 6; card title ≤ 3 and text ≤ 5 (≤ 2 in the `tiles` look); ≤ 45 in all | – | – |
| `timeline` | title ≤ 6; node title ≤ 2, text ≤ 4, time label ≤ 12 characters; ≤ 45 in all | – | – |
| `cta`, `share` | ≤ 12 | ≤ 3 | – |
Any slide over 50 words is a FIX. A `bridge` (the line that pulls the next swipe) is at most 8 words and ends every slide except the last. Body lines are at least 15 characters.

## 3. Architectures: the order of a whole carousel
The engine requires only: `cover` first, `cta` or `offer` last, no `cta` before the payoff. These skeletons are what C5 checks softly:

| Architecture | Skeleton |
|---|---|
| listicle | `cover, rehook, item × N, summary, cta` |
| steps | `cover, proof, step × N, setup?, summary, cta` |
| myth-fact | `cover, myth-fact × N, summary, share, cta` |
| story | `cover, story-beat × N, quote?, cta` |
| comparison | `cover, compare × N, summary, cta` |
| news | `cover, stat or proof, item × N, share, cta` |
| framework | `cover, rehook, (item or checklist) × N, summary, cta` |
| offer / results / lead-magnet | `cover, proof, offer, testimonial, cta` |

Length: 8–12 slides by default (slides = payoffs + 3), a NOTE under 8, a FIX under 6, up to 20 only if every slide pays off, 21 or more is a BLOCK (Instagram's limit); the explicit 2-slide reveal or joke is exempt. A cover that promises "N things" must be followed by exactly N `item` or `step` slides (C6, BLOCK). Tease the strongest item early and reveal it second-to-last.

## 4. Choosing and fixing types
- Tool topics get a `setup` slide (tool, plan, device, price): that audience asks about setup, free or paid, and Mac.
- Put a `share` slide before a send-type call to action, and a `summary` before any `cta` in a save carousel.
- A `stat` or `proof` with a number needs `sourceIds` (SRC1 blocks an unsourced number); the sources live in `spec.sources`.
- Too much text on a slide: split it («قسّمها لسلايدين»), shorten it, or move a list to `checklist`. Never shrink type below the floors.
- Single post: `format: "single"` holds exactly one `poster` slide; the caption pack and gates still apply.

## 5. Spec snippets
```json
{"id":"s01","n":1,"type":"cover","kicker":"للمبتدئين","headline":"6 أدوات ببلاش…\nبتغنيك عن ==المصمم==","media":{"slot":"none","ai":false}}
{"id":"s03","n":3,"type":"item","ord":1,"title":"أداة التصميم","body":"تكتب الفكرة وتطلعلك السلايدات جاهزة.","bridge":"والتانية أحلى"}
{"id":"s05","n":5,"type":"stat","title":"الوقت اللي بتوفّره","number":{"value":"5","unit":"ساعات"},"sourceIds":["src1"]}
{"id":"s06","n":6,"type":"myth-fact","title":"خرافة شايعة","sides":[{"label":"خرافة","text":"لازم مصمم"},{"label":"حقيقة","text":"المحرك بيعمل الشغل"}]}
{"id":"s08","n":8,"type":"cta","title":"احفظ البوست","cta":{"kind":"save","text":"احفظه لما تيجي تعمل البوست الجاي"}}
```
`==span==` marks the single emphasis span; `\n` is a forced break; `number.value` is always a Western-digit string; the engine prints it in the brand's digits.

## 6. Rhythm and demonstration slides
A deck of seven `item` slides in one variant is a template, not a design (gate D8: no run of more than three slides with the same type and variant). Break a run in this order of effort:
1. **Another variant.** Every preset styles two to four variants of `item` and `step` (`presets.md`): alternate them.
2. **An item that carries a picture.** `item` in its `media` variant (creator styles it) holds a demonstration beside its text; the item stays item number k, so the cover's count is still true.
3. **A payoff of another type** between items: a `stat` (one sourced number), a `compare` (wrong against right), a `quote` (the exact words to use), a `proof` (a screenshot). These are extra payoffs, not counted by the cover's «N things» (`C6.list-count` counts `item` and `step`), so the deck grows by one slide each: stay at 8 to 12.

For a post that **teaches** (how to do something with a tool, a platform or a format), add one or two demonstration slides: show the thing. The engine draws every slide from its own DOM and has no diagram slide, so each demonstration is a picture the art director makes and the copywriter's slide frames:

| The demonstration | What it shows | Make it with | Carried by |
|---|---|---|---|
| the same cover at three sizes | why the hero must be big: 540, 270 and 130 px wide side by side | `ffmpeg -i 01-cover.png -filter_complex "[0]split=3[a][b][c];[a]scale=540:-1[a];[b]scale=270:-1[b];[c]scale=130:-1[c];[a][b][c]hstack=inputs=3:shortest=0" three.png` (pad the two smaller ones with `pad=` to one height) | `proof` slide, `media.slot: screenshot`, or an `item` in `media` |
| the safe zones on a real slide | the counter pill, the icons and the profile-grid crop, drawn from `data/platform-instagram.json` `geometry` (`safeBox`, `keepOuts`, `gridCrop4x5`) | `ffmpeg -i 05.png -vf "drawbox=x=34:y=45:w=1012:h=1350:color=red@0.9:t=6,drawbox=x=34:y=45:w=200:h=110:color=red@0.35:t=fill,drawbox=x=846:y=45:w=200:h=110:color=red@0.35:t=fill,drawbox=x=34:y=1255:w=140:h=140:color=red@0.35:t=fill,drawbox=x=906:y=1255:w=140:h=140:color=red@0.35:t=fill" zones.png` (read the numbers from the file, not from this line) | `proof` slide |
| a prompt to paste | the exact words, ready to copy (the pack format: the owner's best family saves 22 against a median of 7) | text, at most 25 words | `quote` slide (a free-lane chat mock) |
| a before and after | the same thing, changed | two sides, `label` «قبل» and «بعد» | `compare` (`versus` or `columns`) |
| a checklist to keep | everything on one screenshot-worthy card | up to 8 short bullets, empty boxes (a pre-ticked box reads as «done», not «check this») | `checklist` in `boxes` |

An asset that comes from the team's own render (a cover, a slide) is the creator's own work; a screenshot of someone else's post or interface is flagged by C10. Every demonstration needs alt text that says what it shows.

## 7. Picture frames

Choose picture slides before free design and follow `plates.md`. All current engine templates have media slots, including step, checklist and CTA; slots measures whether the current variant and text leave visible room. A free slide ignores media and cannot contain an image. Keep semantic types where their measured frame works. For a whole illustration use proof/screenshot or proof/base with slot screenshot; this is a layout choice, never a claim that AI imagery is real evidence. Cover/poster split with photo is a cropped strip when the preset supports it. Measure -> prompts -> approved originals -> inspected manifest -> apply -> render; restyle from originals after changes.
