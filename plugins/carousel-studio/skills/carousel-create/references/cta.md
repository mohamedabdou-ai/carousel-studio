# Calls to action

A carousel has **one** ask. It comes after the payoff, it matches what the post is for, and it is repeated once, in the caption. Two asks split attention; an ask before the value reads as a pitch.

## The five kinds (`cta.kind`)
| Kind | Use for | Write it like this | Rules |
|---|---|---|---|
| `save` | lists, steps, frameworks, prompts, checklists | tie it to a **future moment**: «احفظه لما تيجي تكتب البوست الجاي» | the main save format; allowed for save, sell |
| `send` | identity, relatable, myth, news, comparisons | name a **recipient and a reason**: «ابعته للي لسه بيدفع اشتراك» | sends weigh most for people who do not follow you yet. A bare «شير» is bait |
| `keyword-dm` | a real asset exists (template, file, list, prompt pack) | «اكتب «قالب» في الكومنتات وهيوصلك الملف على الخاص فورًا» | only with `captionPack.asset.delivery = "instant"` and a delivery that really is instant (an official-API tool). Otherwise it is a BLOCK. People who comment and get nothing back stop trusting the account |
| `question` | story, opinion, myth, news | a **specific** question that one line can answer: «أكتر أداة بتدفع عليها وحاسس إنها مش مستاهلة؟» | an open question is allowed; a vote on a word or emoji is not |
| `follow` | series | «الجزء 2 الخميس» (a reason to come back) | not as a generic «تابعني» |

Allowed by intent: **save** → save, follow, question · **send** → send, question · **reach** → send, follow, question · **sell** → keyword-dm, follow, question, save. A kind outside its row is a FIX (C4.intent).

## Never
- **Comment bait**: asking for a like, a tag, an emoji or an arbitrary word with nothing delivered («اكتب نعم لو موافق»، «علّق بقلب»، «منشن 3 من أصحابك»). It costs recommendations. C4.bait is a BLOCK. A keyword the reader types to *receive* something real is the only comment prompt that is allowed.
- **An early ask**: no `cta` in the first half (C4.early), no ask on slide 2.
- **Two different asks** in one post (C4.multiple). The same ask on both an `offer` slide and a `cta` slide is fine.
- **A promise you cannot keep**: «هتبقى مليونير»، guaranteed results, invented scarcity.

## Where it lives
- The **only slide with a `cta` object** in a value carousel is the final `cta` slide: `{title, body?, cta: {kind, text}}`, at most 12 words, at most 3 lines. A soft-sell carousel may end on an `offer` slide that carries it (`architectures.md`).
- **One ask per slide.** On the final slide the ask is said once, in words: the title is the ask («احفظ القايمة»), the button gives the reason or the future moment in a different sentence («وراجعها قبل كل نشر»), and neither repeats the verb of the other. The save pill is the bookmark that sits beside it, not a third request, and shows only on this slide. The button carries no arrow for a save, a send or a question (an arrow points at a slide that is not there); it keeps one only for a follow or a keyword DM, which go somewhere.
- The `share` slide before a send CTA has no `cta` object: it only says who to send it to.
- The caption's `cta` line repeats the same ask in the same words, adding nothing new.
- A single post (`poster`) may carry one `cta` or none.

## Rotation
Do not use the same kind as either of the last 2 posts, nor the same hook family as either of them (C7, FIX). The brand's `hooks.history` has them. When the brand's goal needs saves, rotate between `save` and `question`; keep `keyword-dm` for posts that really have an asset.

## Keyword to DM, step by step
1. Confirm the asset exists (the user has the file) and a connected tool will deliver it instantly. If not, use `save` or `question` and say why in one line.
2. Choose a short keyword in Arabic or Latin that is easy to type («قالب»، "kit"). One keyword per post.
3. Set `captionPack.asset = {keyword, description (what they get), delivery: "instant"}` and `cta = {kind: "keyword-dm", text, assetId?}`.
4. The slide text and the caption say the same keyword. Never promise a reply time you cannot guarantee.

## Wording in each dialect
The phrasing lists live in `data/dialects/<code>.json` (`cta`) and are described in `dialects/<code>.md`. Slots: `{who}`, `{reason}`, `{question}`, `{keyword}`, `{asset}`, `{series}`, `{day}`. Fill every slot with a concrete value; a slot left generic («حد») is a weak ask. The wording follows the **post's** dialect.

| Kind | Egyptian | White MSA |
|---|---|---|
| save | احفظه لما تيجي تكتب البوست الجاي | احفظه لتعود إليه حين تبدأ |
| send | ابعته لـ{who} {reason} | أرسله إلى {who} {reason} |
| question | {question} اكتب إجابتك في سطر واحد | {question} اكتب إجابتك في سطر واحد |
| keyword-dm | اكتب «{keyword}» في الكومنتات وهيوصلك {asset} على الخاص فورًا | اكتب «{keyword}» في التعليقات ليصلك {asset} في رسالة خاصة فورًا |
| follow | تابعني عشان يوصلك {series} | تابعنا ليصلك {series} |

## English posts
Same kinds and rules: "Save this for when you start", "Send this to {who} {reason}", "Comment «{keyword}» and {asset} lands in your DMs right away" (instant delivery only), "Follow so {series} reaches you".

## Allowed kinds and variety
`cta.kind` is exactly `save`, `send`, `question`, `keyword-dm` or `follow`. Use `send` for sharing; `share` is a slide type, not a CTA kind.

A ready script carries `ext.source: "creator-script"`. For that lane `C7.cta-repeat` and `C7.family-repeat` are NOTE: variety is advice, and the creator’s question stays theirs. Both remain FIX for team-written copy. This changes no other repetition or CTA gate.

## A creator-kept ending without a CTA
If their script ends without an ask, offer one closing line once. Never invent it in the slides or caption. Only the creator's explicit «زي ما هو» authorises `python scripts/spec_edit.py --spec <post>/spec.json --brand brand.json cta --keep`. It records `C4.count` and `C5.skeleton` as the creator's overrides, preserves the ending across rebuilds and permits export with those overrides. QA and the Creative Director never treat that kept ending as a defect. Other technical/non-overridable gates remain enforced.
