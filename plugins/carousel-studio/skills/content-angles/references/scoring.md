# Scoring angles

```
score = 0.30·H + 0.25·SP + 0.15·PF + 0.15·EV + 0.15·NV        each part 0–100, score 0–100
```

Round to 0.5; store in `spec.angle.score`. Keep the five parts in your working notes (and in the angle bank) so the "why" can quote them; the spec only carries `score` and a one-line `why`.

## H: hook potential (30%)
Estimate whether this angle can become a cover that wins. It is a forecast; the hook engine scores real covers later.

`H = 40·gap + 30·specific + 30·fit`, each factor 0, 0.5 or 1:

| Factor | 1 | 0.5 | 0 |
|---|---|---|---|
| **gap**: one specific question the cover can open and not answer | one clear gap; slide 2 can close it | a gap, but vague or two at once | the angle is a topic label, or its answer fits on the cover |
| **specific**: something the reader can picture | a named tool, number, place, person or moment | a concrete noun class | abstract words only (نجاح، حياتك، سر) |
| **fit**: the family that carries this angle is allowed at the audience's awareness level (`awareness.md`) | allowed | allowed at the neighbouring level | not allowed |

Add 10 (cap 100) when the angle supports a **numeral in line 1** and its architecture is a list, steps, framework or comparison (`modifiers.numeralInLine1` in the priors: numeral covers beat the creator's own median more often, ×1.83, n=22).

## SP: save or send prior (25%)
Read `data/priors.json`:
1. Take the angle's **intent** (save, send, reach or sell; default from the brand goal, `awareness.md`).
2. `lenses.<lens>.<intent>` is the seed; missing optional lenses use neutral 50; evidence moves it up to 85 or down to 25 by tier (A ≥2×, B ≥1.5×, C ≥0.8× of the account's own baseline).
3. If the brand has `hooks.familyPriors` for that lens's families with `n ≥ 5`, compute `lift = value / baseline` and use the tier score instead of the seed.
4. Apply `modifiers.setupInterest` (+10 on the setup lens for tool topics) and `modifiers.povScenario` (a generic "you" scenario for a save goal scores 25).
5. News is reach-only on the reference account: strong on views, ordinary on saves. Score it with the **reach** value and label it «وصول» in chat, never as a save angle.

The seed comes from one account and small samples. Say so when a user asks why a lens ranks high ("on the reference data…"), and never present the numbers as laws.

## PF: pillar fit (15%)
Use `brand.strategy.pillars`: **100** inside a pillar that has a high share, **60** adjacent or no pillars defined, **20** outside every pillar (say «برّه ركائزك» in the why). An angle outside the pillars can still win when its other parts are strong; it is a score, not a veto.

## EV: evidence (15%)
Can the angle be written truthfully with what exists?
- **100**: every fact it needs is in the source pack, attested by the user, or computable from stated inputs.
- **70**: at least half of the needed facts exist; list the missing ones as «محتاج منك».
- **60**: the angle needs no figures (opinion, identity, story told by the user).
- **20**: it needs figures nobody has supplied. Keep it only as a question to the user, never as a ready angle.
- **0**: it depends on a claim you would have to invent.

## NV: novelty (15%)
Compare with the brand's angle bank and the last 10 posts (`hooks.history`: family, architecture; titles in the bank):
- **100**: new lens and new topic side.
- **60**: the lens was used once in the last 10 posts.
- **30**: the lens was used 2+ times in the last 5 posts.
- **0**: the title is 0.8 or more similar to a used angle or hook. Measure it with the shared helper, run from the skill folder:
  `python -c "import sys; sys.path.insert(0, 'scripts'); from _cs import text; print(text.similarity(sys.argv[1], sys.argv[2]))" "title A" "title B"`
  (character-trigram Dice on a normalised skeleton, the measure the repetition gate uses).

## Output record
One record per angle (keep up to 10; the bank keeps the unchosen ones):

```json
{ "id": "a2", "title": "أدوات ببلاش بتعمل شغل الأدوات المدفوعة", "lens": "free-vs-paid",
  "intent": "save", "awareness": "solution", "architecture": "comparison",
  "pillarId": "tools", "needs": ["prices of the paid tools (user)"],
  "parts": {"H": 85, "SP": 85, "PF": 100, "EV": 70, "NV": 100}, "score": 87.5,
  "why": "مجاني مقابل مدفوع بيتحفظ عندك أكتر من غيره" }
```
`id` is a short id (`a1`…`a10`). `intent`, `awareness` and `architecture` are not stored under `angle`; carousel-create copies them to the spec's top-level `intent`, `awareness`, `architecture` when the user picks.

Worked example (the record above): gap 1, specific 0.5, fit 1 gives `H = 40 + 15 + 30 = 85`, and there is no numeral cover, so no bonus. Then `0.30·85 + 0.25·85 + 0.15·100 + 0.15·70 + 0.15·100 = 25.5 + 21.25 + 15 + 10.5 + 15 = 87.25`, which rounds half up to 87.5.

## Ranking and "my pick" (⭐ رأيي)
1. Sort by score. Ties: the angle that matches the brand goal's intent, then the one needing fewer missing facts, then the more novel.
2. Show the **top 5** in chat (`chat-display` rules of carousel-create), each with its intent tag and one-line why. Never show the numeric parts; show «⭐» on your pick only.
3. The pick is the top score unless its EV is below 70 (then the best angle with EV ≥70, and say what the top one is missing).
4. Keep the other 5 at most in the angle bank without showing them.

## Rules
- No angle may rely on a figure you do not have. Mark it «محتاج منك» and lower EV instead of inventing a placeholder number.
- Angles from a repurposed source must be **transformed**: different structure and wording from the source, a new side of the topic. Record what you changed in the angle `why` or the brief note; the originality gate compares the final copy with the source excerpts.
- Do not score the user's own hunch lower because of the priors; show it as an extra option and let them choose.
