# Levantine (levant)

**Status:** beta (`nativeReviewed: false`). **Register:** dialect. **CTA style:** soft. General Levantine (Lebanon, Syria, Jordan, Palestine), understood across the Levant and beyond. It has not been reviewed by a native Levantine writer yet, so write it **light**, and tell the user once, in one line, that Levantine is in beta and a Levantine reader should look at the final text.

The data behind this page is `data/dialects/levant.json` (markers, deny and warn lists, word swaps, CTA lines, sub-varieties).

## One register per post, and a safe level
| Level | When | How |
|---|---|---|
| **Light Levantine** (default while in beta) | all Levantine posts | simplified MSA structure and shared everyday words, plus the markers that carry the dialect: **مش** (not), **رح** (will), **بدّي / بدّك** (want), **شو** (what), **ليش** (why), **كتير** (a lot), **هلّق** (now), **هيك** (like this), **منيح** (good) |
| **Fuller Levantine** | only when the brand's samples are already Levantine and a Levantine reader will check | local verbs and idioms in addition |
| **White MSA** | pan-Arab reach, instructions, government, finance, health, legal | switch the dialect to `msa-white`; do not mix |

When unsure, go one level lighter.

## The markers
| Meaning | Write | Not |
|---|---|---|
| not | مش (before verb, noun or adjective) · ما + verb in the negative | مو، لا |
| will | رح + verb: رح أعمل، رح تعمل | هـ، راح، سـ |
| doing now | عم + verb: عم بعمل · habit: بـ + verb | |
| want | بدّي · بدّك · بدّه | عايز، أبي، تبي |
| what / why / where / how | شو · ليش · وين · كيف | إيه · ليه · فين · إزاي |
| how much | قديش | |
| now | هلّق (Lebanon, Syria) or هسّا (Jordan, Palestine) | دلوقتي، الحين |
| a lot | كتير | أوي، وايد |
| thing | شي، شغلة، شغلات | حاجة |
| good | منيح، حلو | كويس، زين |
| here | هون | |
| like this | هيك | كده، كذا |
| still | لسا | لسه |
| before | قبل ما | قبل لا |
| think that | مفكّر إنو | فاكر إن |

## Sub-varieties
`locale.subVariety` is `lebanese` or `syrian`; the neutral level avoids their differences.
- `lebanese`: هيدا، هيدي، هلّق. `syrian`: هاد، هاي، هلّق. For Jordan and Palestine the common choice is هاد، هاي، هسّا. When unset, avoid demonstratives (rewrite the sentence) and use كتير، شو، ليش.
- Do not mix the two demonstratives in one post.

## What fails a Levantine post
- **Deny (BLOCK):** Egyptian, Gulf and Maghrebi markers: عايز، إزاي، دلوقتي، كده، ده، دي، دول، إيه، فين، بتاع، أوي، وايد، الحين، شلون، شنو، وش، أبي، تبي، مو، بزاف، دابا…
- **Warn (FIX):** ليه، لسه، إمتى (use ليش, لسا, إيمتى or restructure), زين, MSA stiffness (لماذا، ماذا، سوف، أريد، الآن).

Typical leaks and fixes:
| Leak | Fix |
|---|---|
| «عايز تعرف إزاي؟» | «بدّك تعرف كيف؟» |
| «مو لازم تدفع» | «مش لازم تدفع» |
| «دلوقتي تقدر تجرّب» | «هلّق بتقدر تجرّب» |
| «كده أحسن» | «هيك أحسن» |

## Tone
Soft and conversational: invite, do not order («بتقدر تحفظه»، «إذا بدّك»). Keep jokes light. Avoid stacked local slang and imitation of a country's accent; a native writer is less local than an imitator.

## Numbers, money, names
Western digits. Money by country: ليرة (Lebanon, Syria), دينار (Jordan), شيكل (Palestine); many Lebanese posts quote prices in دولار, so ask. One currency per post. Use «الخليج العربي» if the Gulf is mentioned for a GCC audience.

## Latin names
English tool names stay Latin and capitalised. Attach «لـ، بـ، الـ» with no space («الـAI»، «بـClaude»), or rephrase («في Claude»). Never write them in Arabic letters.

## CTA lines (from the data file)
| Kind | Line |
|---|---|
| save | احفظ البوست لحد ما تحتاجه · احفظه وارجع له وقت الشغل · احفظه للمرة الجاية |
| send | ابعته لـ{who} · ابعته لـ{who} اللي محتاجه · ابعته لـ{who} {reason} |
| question | {question} اكتب جوابك بسطر واحد · {question} خبّرنا رأيك بالتعليقات |
| keyword-dm | اكتب «{keyword}» بالتعليقات وبيوصلك {asset} عالخاص فورًا |
| follow | تابعني ليوصلك {series} · {series} الجاي {day} |

## When the user is not sure
If they say «شامي» without a country, ask once: «لبناني، سوري، أردني أو فلسطيني؟» and store the sub-variety if they answer; otherwise stay with the neutral level. Offer white MSA as the zero-risk alternative.
