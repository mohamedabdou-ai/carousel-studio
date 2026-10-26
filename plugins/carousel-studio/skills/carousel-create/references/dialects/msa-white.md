# White MSA (msa-white)

**Status:** stable. **Register:** white. **CTA style:** neutral. Simplified Modern Standard Arabic: standard grammar, short sentences, everyday words, no rhetorical ornament, no dialect, and none of the stiffness of letters and notices. It is the register for pan-Arab reach, instructions, reference posts and cross-country audiences, and the default for Iraq, Yemen, Sudan and the Maghreb until a native Darija pack exists. It is suggested for government, finance, health, legal and formal education topics.

The data behind this page is `data/dialects/msa-white.json` (markers, deny and warn lists, word swaps, CTA lines).

## How it sounds
- **Short sentences, verbs early.** «جرّبت ست أدوات وقارنتها» (not «لقد قمت بتجربة ست أدوات ومن ثم مقارنتها»).
- **Everyday words**, not literary ones: «مجاني»، «اشتراك»، «يوفّر»، «يختصر».
- **Direct address** with «أنت» in the singular imperative: «احفظ»، «جرّب»، «ابدأ». Plural «احفظوا» only when the brand speaks to a community.
- **Active voice.** Name the doer: «يصلك الملف» not «يتم إرسال الملف».
- **No case-ending diacritics, no flourish** (لعلّ، حيث إنّ، فضلا عن ذلك), no chancellery formulas (عزيزي العميل، نحيطكم علما، يرجى التكرم): the data lists them as stiff.
- **Warm, not cold.** White MSA is plain, not distant; it keeps the same one-claim-per-sentence discipline as the dialects.

## The markers
| Meaning | Write | Not |
|---|---|---|
| not | لا · لم · لن · ليس | مش، مو |
| will | سـ + verb (سيصلك) | هـ، رح، راح |
| want | تريد · تحتاج | عايز، أبي، بدّي |
| how / why / what / where / when | كيف · لماذا · ماذا · أين · متى | إزاي، ليه، إيه، فين، إمتى |
| now | الآن | دلوقتي، الحين |
| a lot | كثير | كتير، أوي |
| thing | شيء، أشياء | حاجة، شي |
| this | هذا، هذه | ده، دي |
| before | قبل أن | قبل ما |
| free | مجاني · مجانية | ببلاش |

## What fails a white-MSA post
- **Deny (BLOCK):** dialect markers of any kind (مش، مو، ده، دي، إزاي، ليش، الحين، عايز، بدي، كتير، أوي، رح…). The list in the data file is long on purpose.
- **Warn (FIX):** colloquial connectors that slip in: بس، يلا، خلاص، طيب، عشان، علشان، شوية، لسه، لسا.

Typical fixes:
| Leak | Fix |
|---|---|
| «مش لازم تدفع» | «لا يلزمك أن تدفع» |
| «دلوقتي تقدر تجرّب» | «يمكنك الآن أن تجرّب» |
| «عشان توفّر وقتك» | «لتوفّر وقتك» |
| «يتم تحويل الملف تلقائيا» | «يتحول الملف تلقائيا» |

## Diacritics and tanween
Slides are typeset without diacritics (a mark raises the line height and the checker asks for a reason). Write tanween adverbs with the bare alif and no mark: **كثيرا، مجانا، شكرا**. Where a diacritic changes the meaning, restructure the sentence first; use a single mark only to separate two real readings.

## Numbers, money, names
Western digits by default; for MSA posts about government, finance, health or legal topics the plugin may *offer* Arabic-Indic digits in one line, and only switches if the user says yes (then every number, the counter and ٪ follow). Money by the audience's country, one currency per post. Latin names stay Latin and capitalised; attach «لـ، بـ، الـ» with no space («بـClaude»), or rephrase («في Claude»).

## Words for the platform
Prefer «منشور» to «بوست» in a formal brand, «تعليقات», «حفظ», «مشاركة» for the actions, «سلايد» for a slide. Keep what the brand's samples use.

## CTA lines (from the data file)
| Kind | Line |
|---|---|
| save | احفظ المنشور لتعود إليه عند الحاجة · احفظه لوقت تحتاج إليه · احفظه لتعود إليه حين تبدأ |
| send | شاركه مع {who} · أرسله إلى {who} · أرسله إلى {who} {reason} |
| question | {question} اكتب إجابتك في سطر واحد · {question} شاركنا رأيك في التعليقات |
| keyword-dm | اكتب «{keyword}» في التعليقات ليصلك {asset} في رسالة خاصة فورًا |
| follow | تابعنا ليصلك {series} · {series} القادم {day} |

## Voice checks specific to MSA
- Translationese is the usual enemy: «قم بـ» + noun, «يتم» + noun, «وذلك من خلال», «الخاص بك», «حان الوقت لـ». Rebuild the sentence from its information instead of swapping words.
- Do not stack nouns in long iḍāfa chains; break them into two sentences.
- Avoid abstract nouns that say nothing a reader can picture (نجاح، تميّز، إبداع) unless a concrete detail follows.
