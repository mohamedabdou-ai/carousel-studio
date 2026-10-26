# Intent mix and rotation

Every slot has one **intent**: what the post is for. The mix of intents across a month follows the account's goal, and a few rotation rules keep the feed from repeating itself. `plan.py` applies all of this; this page explains it so you can adjust it.

## 1. The four intents
| Intent | The post is built to earn | Typical shapes |
|---|---|---|
| `save` | saves: a reader keeps it for later | lists, steps, frameworks, checklists, prompts, tool packs, comparisons |
| `send` | sends: a reader forwards it to a specific person | myths, identity posts, relatable stories, a stance worth arguing about |
| `reach` | views from non-followers | hot takes, news, "imagine" scenes, a surprising number |
| `sell` | a soft sale | an offer, a lead magnet, a result, a testimonial |

Instagram ranks on watch time, likes per reach and sends per reach, and sends matter most for people who do not follow yet; saves are a strong sign that a carousel was useful. Carousels earn many more saves than single images, so the plan always keeps a save-intent list in the week.

## 2. Mix by goal
Shares of the month's posts (the brand's own `strategy.intentMix` wins unless `--goal` is passed):

| Goal | save | send | reach | sell |
|---|---|---|---|---|
| followers | 40% | 25% | 25% | 10% |
| clients | 35% | 25% | 20% | 20% |
| sales | 30% | 20% | 20% | 30% |

The counts are split by largest remainder, so 16 posts at the followers mix become 6 / 4 / 4 / 2. Treat the mix as a guide; `plan.py lint` only notes a gap above 15 points.

## 3. From intent to architecture, hook family and call to action
`plan.py` picks, then the hook stage in `carousel-create` may choose differently.

| Intent | Architectures (rotated) | Hook families it prefers | Call to action (rotated) |
|---|---|---|---|
| `save` | listicle, steps, framework, comparison | P11 pack, P2 X vs Y, P1 number-led list, F17 reframe, P14 X without Y, P15 tested and ranked, F19 pre-check, F22 experience | save, question, follow |
| `send` | myth-fact, opinion, story | P10 identity, F21 stance, F20 dilemma, P13 imagine, P9 cold-open story, P4 contrarian flip | send, question |
| `reach` | news, opinion, myth-fact, story | P4, P13, F20, P12 dated news, P16 giant number, P9, F23 iceberg | send, follow, question |
| `sell` | offer, results, lead-magnet, case-study | S1 offer, S2 benefit, S3 loss, P7 sharp-number result, P8 before and after | question, save, follow; keyword-to-DM only for a lead magnet that is really delivered at once |

Caveats to say aloud: P7, P8, P16 and S3 need a real, sourced number from the user; a keyword-to-DM call to action fails when the file does not arrive immediately (a common complaint, and bare "comment a word" bait can cost recommendations); news earns reach more than saves; generic "you" scenarios are weak carousel covers.

Occasion greetings (an Eid, a national day) are `send` or `reach` posts built as a story or a short list. They carry no hook family: the tone of the occasion leads (`occasion-rules.md`).

## 4. Rotation rules (what `plan.py lint` checks)
- No architecture twice in a row. (FIX)
- No hook family three times in a row; FLIP (P4) and REFRAME (F17) count as different families. The builder also avoids repeating a family from the previous two slots, and a note appears when a family repeats in two consecutive slots.
- A call-to-action kind is not repeated in consecutive posts (FIX). The builder also avoids the kind of two posts back.
- At least **one save-intent list a week** (a `save` slot whose architecture is listicle, steps, framework or comparison) in every week that holds two or more slots. (FIX)
- A solemn occasion never gets a `sell` slot. (FIX)
- Pillars rotate: the same pillar is avoided in consecutive slots when the shares allow it, and a pillar far from its target share is noted.

## 5. How the builder decides (so you can predict and adjust)
1. Occasion slots are fixed first: the importance-3 and importance-2 occasions that fall in the month take the free slot nearest their start (at most half of the slots). Their intent comes from the occasion's suggestion; a solemn one is always `reach`.
2. The remaining intents fill by largest deficit against the mix, avoiding the previous slot's intent, and each week that would lack a save-list gets one in its first free slot.
3. Architectures cycle least-recently-used inside the intent's list, never equal to the previous slot's.
4. Families and call-to-action kinds are chosen next, then pillars by largest deficit against their shares (and a bonus when the pillar's intents include the slot's).
There is no randomness: the same inputs give the same plan.

## 6. Adjusting
Raise `sell` only when the user has something real to sell and a lead magnet or offer page ready. Lower `reach` when the account already grows by recommendations and needs trust. After 20 or more posts the hook stage re-weights family priors from what the user actually picks; the plan itself does not learn. The evidence here is correlational: say "usually", never "guaranteed".
