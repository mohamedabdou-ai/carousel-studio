# Gulf (gulf)

**Status:** beta (`nativeReviewed: false`). **Register:** dialect. **CTA style:** soft. One neutral "white Gulf" register understood across the GCC, mixed with English tool names. It has not been reviewed by a native Gulf writer yet, so write it **light**, and tell the user once, in one line, that Gulf is in beta and a Gulf reader should look at the final text.

The data behind this page is `data/dialects/gulf.json` (markers, deny and warn lists, word swaps, CTA lines, sub-varieties).

## One register per post, and a safe level
| Level | When | How |
|---|---|---|
| **Light Gulf** (default while in beta) | all Gulf posts | simplified MSA structure and shared everyday words, plus the few markers that carry the dialect: **مو** (not), **الحين** (now), **ليش** (why), **وين** (where), **تبي / أبي / أبغى** (want), **راح** or **بـ** (will), **زين** (good), **كذا** (like this) |
| **Fuller Gulf** | only when the brand's samples are already Gulf and a Gulf reader will check | local verbs and idioms in addition |
| **White MSA** | pan-Arab reach, instructions, government, finance, health, legal | switch the dialect to `msa-white`; do not mix |

When unsure, go one level lighter. A Gulf reader forgives plain wording and does not forgive a mixed-up dialect.

## The markers
| Meaning | Write | Not |
|---|---|---|
| not | مو | مش، مب (reads Emirati or Kuwaiti only) |
| will | راح + verb · or بـ + verb (بسوي، بروح) | هـ، رح |
| want | تبي · أبي · أبغى | عايز، بدّي، أريد |
| how / why / where | كيف أو شلون · ليش · وين | إزاي · ليه · فين |
| what | by sub-variety: وش (Najdi) · ايش (Hijazi) · شو (Emirati) · شنو (Kuwaiti, Qatari) — or rewrite the sentence | إيه |
| now | الحين | دلوقتي، هلّق |
| a lot | كثير (safe everywhere) · مرة (Riyadh) · وايد (Kuwait, UAE, Qatar) | كتير، أوي |
| thing | شي، أشياء | حاجة، شغلة |
| good | زين، حلو | كويس، منيح |
| this | هذا، هذي | ده، دي، هيدا |
| like this | كذا | كده، هيك |
| before | قبل لا | قبل ما (reads Egyptian or Levantine) |
| think that | تحسب إن | فاكر إن، مفكّر إنو |

## Sub-varieties
The brand's `locale.subVariety` chooses between the Gulf forms above; the default register avoids them where it can.
- `najdi`: أبي، وش، مرة. `hijazi`: أبغى، ايش. `emirati`: أبا أو أبغي، شو، وايد.
- With no sub-variety set, use كثير, rewrite sentences so they do not need "what", and prefer أبي / تبي.
- Do not use Kuwaiti or Bahraini-only forms (e.g. شنو) in a post for Riyadh, nor Najdi-only forms in a post for Dubai, unless the brand says so.

## What fails a Gulf post
- **Deny (BLOCK):** Egyptian, Levantine and Maghrebi markers: عايز، إزاي، دلوقتي، مش، ده، دي، دول، إيه، فين، إمتى، بتاع، أوي، بدي، بدك، هلق، هيك، منيح، رح، بزاف، دابا…
- **Warn (FIX):** كده، كدا، لسه، ليه، كتير، هاي, MSA stiffness (لماذا، ماذا، سوف، أريد، الآن) and علشان (use عشان).

Typical leaks and fixes:
| Leak | Fix |
|---|---|
| «عايز تعرف إزاي توفر وقتك؟» | «تبي تعرف كيف توفر وقتك؟» |
| «مش لازم تدفع» | «مو لازم تدفع» |
| «دلوقتي تقدر تجرب» | «الحين تقدر تجرب» |
| «كده أحسن» | «كذا أحسن» |

## Tone
Soft: invite rather than order («تقدر تحفظه»، «لو تبي»), warm and brief, no pressure. Avoid exaggerated hype and stereotyped Gulf "slang" (يا هلا وغلا, a pile of local words): a native writer is *less* local than an imitator. One local detail that is right beats ten that are loud.

## Numbers, money, names
Western digits. Money by country: ريال (Saudi, Qatar, Oman), درهم (UAE), دينار (Kuwait, Bahrain); do not mix them in one post. Use «الخليج العربي» for the Gulf in any post aimed at the GCC; the other name is blocked (SEN1). No Quran verses, Shahada, Saudi flag or Kaaba/mosque imagery on promotional slides.

## Latin names
English tool names are normal in Gulf copy. Keep them Latin and capitalised, attach «لـ، بـ، الـ» with no space («الـAI»، «بـClaude»), or rephrase («في Claude»). Never write them in Arabic letters.

## CTA lines (from the data file)
| Kind | Line |
|---|---|
| save | احفظ البوست لين تحتاجه · احفظه وارجع له وقت الشغل · احفظه للمرة الجاية |
| send | أرسله لـ{who} · شاركه مع {who} · أرسله لـ{who} {reason} |
| question | {question} اكتب جوابك في سطر واحد · {question} قل لنا رأيك بالتعليقات |
| keyword-dm | اكتب «{keyword}» بالتعليقات ويوصلك {asset} على الخاص مباشرة |
| follow | تابعني عشان يوصلك {series} · {series} الجاي {day} |

## When the user is not sure
If they say «خليجي» without a country, ask once: «سعودي، إماراتي، كويتي أو شي ثاني؟» and store the sub-variety if they answer; otherwise stay with the neutral level above. Offer white MSA as the zero-risk alternative.
