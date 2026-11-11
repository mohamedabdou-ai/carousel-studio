# Egyptian (eg)

**Status:** stable. **Register:** dialect. **CTA style:** direct. The most widely understood Arabic dialect, written as it is spoken in Cairo, in conventional spelling. Short, warm, to the point.

The data behind this page is `data/dialects/eg.json` (markers, deny and warn lists, the word-swap table, the CTA lines). The proofreader and the gates use it; this page tells you how to write.

## One strength per post
Read `brand.voice.dialectStrength` before drafting. It applies to every slide, bridge, CTA and caption. An absent setting preserves this brand's approved examples and current Egyptian behavior; do not silently lighten an existing brand.

| Setting | Allowed | Avoid |
|---|---|---|
| `light` | shared everyday words, short direct sentences close to white Arabic; جرّب، شوف، لو، بس، أكيد; familiar Egyptian phrasing where any Arab reader follows it | street idioms, local jokes, heavily contracted spellings, and region-specific words such as روش، جامد موت، يا معلم، النهارده; prefer اليوم، الآن، جدًا، كيف when clarity needs them |
| `full` | conventional Cairo Egyptian, including مش، عايز، إزاي، دلوقتي، ده، دي and normal spoken questions and negation | importing another dialect, forced slang, or language that conflicts with the brand's avoid list |

`light` stays `locale.dialect = eg`; it does not switch to `msa-white`. In light copy, shared neutral words such as الآن or كيف are allowed when needed for pan-Arab clarity. The full-Egyptian swap and stiffness advice below applies to `full` and to the existing brand default, not as a command to make light copy more local. Keep one strength throughout the post.

Light:
> جرّب الفكرة اليوم وشوف النتيجة.
> لو تحتاج وقت أكثر، خذ خطوة واحدة.

Full:
> جرّب الفكرة النهارده وشوف هتطلع بإيه.
> لو لسه محتاج وقت، خدها واحدة واحدة.

Strength is an editorial review, not an automatic word-list gate: context and quoted creator wording change whether a local expression is appropriate. Existing dialect-mixing checks still apply. Review their warnings against the selected strength before changing shared neutral vocabulary.

## The markers that make it Egyptian
| Meaning | Write | Not |
|---|---|---|
| not (before a verb, noun or adjective) | مش | مو، لا |
| will | هـ + verb: هعمل، هتعمل، هيعمل | رح، راح، سـ |
| doing / habit | بـ + verb: بيعمل، بتكتب | عم (Levant) |
| want | عايز / عايزة | أبي، بدّي، أريد |
| how / why / what / where / when / who | إزاي · ليه · إيه · فين · إمتى · مين | شلون · ليش · شو · وين · متى |
| now | دلوقتي | الحين، هلّق، الآن |
| a lot | كتير، أوي | وايد، مرة |
| thing | حاجة، حاجات | شي، شغلة |
| this / these | ده، دي، دول | هذا، هيدا، هاد |
| like this | كده | كذا، هيك |
| because | عشان، علشان | لأن (stiff) |
| still / also | لسه · كمان | |
| good | كويس، حلو | منيح، زين |

The full swap table (`lexicon`) is in the data file: not, will, want, think-that, thing, how, why, now, a-lot, do, before, free, this.

## What fails an Egyptian post
- **Deny (BLOCK, overridable by the allow list):** any Gulf, Levantine or Maghrebi marker: مو، مب، وايد، الحين، شلون، شنو، وش، ليش، أبي، أبغى، تبي، بدي، بدك، هلق، رح، هيك، هيدا، هاد، منيح، شو، بزاف، دابا…
- **Warn (FIX):** MSA words that stiffen it: لماذا، ماذا، سوف، أريد، تريد، نريد، الآن، كثيرا, plus زين.
- A word that is *also* Egyptian but flagged by mistake? The user says «اللهجة كده صح» and the word joins the brand's allow list.

Typical leaks and their fix:
| Leak | Fix |
|---|---|
| «الحين تقدر تعمل كاروسيل» | «دلوقتي تقدر تعمل كاروسيل» |
| «مو لازم تدفع لمصمم» | «مش لازم تدفع لمصمم» |
| «لماذا لا يحفظ أحد بوستك؟» | «ليه محدش بيحفظ بوستك؟» |
| «شو الفرق بين الأداتين؟» | «إيه الفرق بين الأداتين؟» |

## Spelling
- Hamza where the standard writes it: إزاي، إيه، إمتى، أوي، إنت. The data accepts ازاي without hamza as a marker, but write the hamza.
- Keep the root consonants of the standard spelling in the Egyptian forms people read: قدام, قال (ق stays ق); ث and ذ follow speech in common words: تلاتة، كتير، تاني، ده، دلوقتي.
- Verb prefixes attach: هتعمل، بيشتغل، مش بيفرق. Never insert a space inside a verb.
- A word the dictionary does not have (بتاع، أوي، لسه، برضه) is fine if it is spelled the common way; pick one spelling (برضه or برضو) and keep it in the post.

## Numbers, money, units
Western digits: «5 ساعات»، «30 يوم». Money: جنيه (not a symbol on the slide); `$` and `%` follow the digits system. Large numbers: «ألف»، «مليون» after the figure, kept together («2 مليون»). Spelled-out numbers are for speech; covers and slides use digits (C1.number-words). A number and its noun stay on one line (the engine binds them).

## Latin names
Tools and brands stay Latin and keep their capitalisation: Claude, ChatGPT, Canva. Attach «لـ، بـ، الـ» to a Latin word with no space: «الـAI»، «بـClaude»، «لـCanva» (a space leaves the prefix stranded, which blocks). If it reads clumsily, rephrase: «في Claude»، «مع Canva». Never write a tool name in Arabic letters («كلود» for Claude).

## Address and gender
Default to the masculine singular you («إنت»، «جرّب»، «شوف»), which Egyptian readers hear as neutral; use the feminine only if the brand's audience is women. Never write «عايز/ة». Imperatives for CTAs: احفظ، ابعت، جرّب.

## CTA lines (from the data file)
| Kind | Line |
|---|---|
| save | احفظ البوست ده لحد ما تحتاجه · احفظه لما تيجي تكتب البوست الجاي · احفظه وارجعله وقت الشغل |
| send | ابعته لـ{who} · ابعته لـ{who} اللي محتاجه · ابعته لـ{who} {reason} |
| question | {question} اكتب إجابتك في سطر واحد · {question} قولي في الكومنتات |
| keyword-dm | اكتب «{keyword}» في الكومنتات وهيوصلك {asset} على الخاص فورًا |
| follow | تابعني عشان يوصلك {series} · {series} الجاي {day} |

## Voice
Direct and specific; one claim per sentence; examples from real life; a little humour is fine, hype is not («ثورة»، «سر خطير»). Avoid the AI cadence («في عالم اليوم المتسارع»), the lecturer's «لازم تعرف إن…», and stacked rhetorical questions. Hook skeletons for Egyptian live in the hook library (`skeleton.eg`); the swap table above lets you move any other dialect's skeleton into Egyptian without changing its slots.
