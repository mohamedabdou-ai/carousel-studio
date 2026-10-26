# Hook engine: from an angle to three covers

A hook is the line that decides whether a stranger swipes. The engine writes at least 12 of them, throws away the ones that break a hard rule, scores the rest and keeps three from three different families. It runs without chat and without a review point of its own; the user sees the result as three chips in the Studio's Script view.

Everything below uses files that ship with this skill: `data/hooks/families.json` (26 families), `library.ar.json` and `library.en.json` (slot skeletons with synthetic examples), `triggers.json`, `lexicon.json`, `scoring.json`, and the two scripts `hook_features.py` and `compress.py`. Nothing here needs the network.

## 1. What goes in
The picked angle, the post's `intent` (save, send, reach, sell), its `awareness` (unaware, problem, solution, product), its dialect, the brand's voice (`use`, `avoid`, `allow`), the brand's `hooks.history` (the last 30 posts, newest last), and the source pack's figures. A hook text that arrives from the user (a spoken opener, a line from a Reel) goes to `compression.md` first.

## 2. Pick the families
1. Read `families.json`. Keep the families whose `intent.primary` or `intent.also` contains the post's intent and whose `awareness` contains the post's stage. Intent leans the list: saves come from lists, comparisons, checklists and re-framings (P1, P2, P11, F17); reach and sends come from flips, scenes, dilemmas and news (P4, P13, F20, P12).
2. Drop any family used in either of the brand's last two posts (the score takes 10 points off a repeat, so it rarely wins anyway) and any family whose `maxUsePer` is already used up.
3. Keep at least 4 families. Three drafts from one family is the most that is useful; the point is range.

## 3. Draft
For each chosen family, open its entries in `library.<lang>.json` (Arabic dialects use `library.ar.json`, English uses `library.en.json`). An entry gives a `skeleton` per dialect, typed `slots` with word caps, the `trigger` it works through, a `slide2` payoff and its `lints`.

Write each draft as `{id, family, text, cover, slide2}`:
- `cover` is what goes on slide 1: the first beat (the hero, at most 6 words), a «…» break, and an optional second beat; at most 12 words in all, at most 3 lines.
- `text` is the long version (the caption's first line, or the spoken form). If the cover is the whole idea, `text` equals `cover`.
- `slide2` is one line saying what slide 2 pays off at once.
- Fill slots from the topic, in the post's dialect; write the cover directly in that dialect instead of translating a skeleton.

Craft rules (each one maps to a gate or a score):
- **Meaning word first.** A noun, a numeral or a name in the first two words; no «هل» or «ليه» opener unless the question is the gap.
- **Digits, not words.** «3 أدوات», never «ثلاثة أدوات». One digit system.
- **Outcome, not a teaching promise.** «بتخلي بوستك يتحفظ» beats «هتتعلم إزاي تكتب».
- **One specific gap, never answered on the cover.** The slides close it. If the cover contains its own answer, it fails HG3.
- **Concrete over abstract.** A tool, a place, a time frame or a figure. Words like نجاح، حياتك، سر cost 5 points each.
- **A count equals its payoff slides.** «5 أخطاء» means five mistake slides (gate C6 checks it on the spec).
- **No invented numbers.** A result figure (a percent, money, a multiplier, a count of views) needs a source; a count of your own items and a time frame do not.
- **Latin names stay Latin and stay attached** («بـClaude» only in the one connector form the SKILL.md allows); no emoji on a cover; Arabic punctuation (، ؟ «…»).
- **No bait, no conspiracy, no stacked fear, no promises of results.** Single dramatic adjectives are a NOTE, empty-slot phrases («الحقيقة الصادمة»، «سر خطير») are a fail.
- **Never paste a library example.** Examples are synthetic and flagged `nativeReviewed: false` for Gulf and Levantine; use them to hear the rhythm, then write your own. A draft that is almost an example scores a similarity note.

## 4. Gate and score
Write the drafts to a JSON file and run, from this skill's folder:

```
python scripts/hook_features.py --batch hooks.json --dialect eg --brand brand.json --intent save --awareness problem --sourced 90 --format json
```

The batch file is `[{"id","text","cover","family"}]` (or `{"candidates": [...]}`). Read `hook-scoring.md` for what comes back. Discard every hook with a failed gate; for a failure you can fix (an over-long cover, a stray Gulf word) fix it and run once more; after two rounds drop the draft. Then score the survivors as the judge (J, 0 to 40, anchors in `hook-scoring.md`) and run again with `--judge judge.json` to get the final order and `top3`.

## 5. Choose and hand over
Take the top three from three different families. Tie-breaks: a family with the brand's own evidence, then the shorter cover, then the id. In the team's duel (`rounds.md` round 3) the knockout is judged clarity first, then **evidence** (the family's tier for the post's intent, the brand's own `hooks.familyPriors` first, else the seed tier in `content-angles/data/priors.json`), then the panel's stop votes: one persona's vote never overturns a tier. If the score leader and the panel's favourite are different hooks, write one **hybrid** cover that carries the favourite's word-first tension and the leader's visible number instead of picking a side. Write the winner to `spec.hook` and the other two to `alternates`:

```
"hook": {"id": "P3-MISTAKE-count-cost", "family": "P3", "text": "...", "cover": "...", "score": 71.5, "slide2": "...", "alternates": [ {...}, {...} ]}
```

Each alternate carries the same fields. The score is the total from `hook_features.py` plus J. Give the user one «ليه؟» line (`why-tips.md`) saying why the first one won in a few words. After the user approves the post, append `{postId, date, family, hookId}` to the brand's `hooks.history` (the file stays on the user's machine).

## 6. When the engine is stuck
- **Fewer than 3 survivors or fewer than 3 families:** write 6 more drafts in families you have not used, relax nothing, and run again.
- **Every cover is over the limit:** the angle is too wide; ask the content-angles skill for a narrower one rather than cutting words until the meaning goes.
- **A number the user gave without a source:** ask for the source or write the hook without the figure; never promote it to a claim.
- **The user wrote their own hook:** run it through `hook_features.py` like any draft and tell them which gate it fails and the smallest edit that fixes it.
