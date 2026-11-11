# Orthography

What is a spelling mistake in Instagram Arabic, what is a convention, and how to treat each. The
rules live in `data/rules/ortho.json`; this file is the judgement behind them. Adapted in part from
the MIT-licensed Arabic typography and ad-copy packs listed in NOTICE.

## 1. Stance
- A **mistake** has one right form in standard orthography and the writer meant it (انشاء for إنشاء). A **convention** is a dialect spelling the community accepts (إزاي، دلوقتي، وايد). Fix mistakes; leave conventions, and keep each dialect's spelling consistent inside one post.
- The lists catch only forms that are wrong in almost every sentence. Anything with a plausible second reading carries a **confidence below 0.9**: read the sentence before you accept.
- Words in `voice.allow` and the brand's `latinTerms` are never flagged. A user who says «اللهجة كده صح» about a word adds it to `voice.allow`.
- Confidence in chat: عالية (0.9 and above), متوسطة (0.7 to 0.89), منخفضة (below 0.7).

## 2. Hamza
**Two kinds of alif.** A *cutting* hamza (أ إ) is always pronounced and must be written. A
*connecting* alif (ا, hamzat al-wasl) is dropped when the word is joined to the one before it and
carries no hamza sign.

| Pattern | Initial letter | Examples |
|---|---|---|
| Verbal noun of a four-letter verb (form IV: أَفْعَلَ) | **إ** | إعلان، إضافة، إجابة، إرسال، إنشاء، إدارة، إعادة، إنجاز، إعداد |
| Comparatives and superlatives (أَفْعَل) | **أ** | أفضل، أكثر، أقل، أهم، أسهل، أجمل |
| Plurals of the form أَفْعال / أَفْعُل / أَفاعِل | **أ** | أدوات، أسباب، أخطاء، أفكار، أرقام، أسعار، أساليب |
| Verbal nouns and imperatives of forms VII to X | **ا** (no hamza) | استخدام، استمرار، استثمار، انتظار، اجتماع، اختيار، اشتراك، اكتشاف |
| Fixed connecting words | **ا** | اسم، ابن، امرأة، اثنان |
| Function words that carry a hamza | أ / إ | أنا، أنت، أيضًا، أين، أمس، إلى، إذا، إذن، أحد، إحدى |

**Hamza on a seat (middle or end).** The seat follows the strongest vowel around the hamza:
kasra (ئ) beats damma (ؤ) beats fatha (أ) beats sukun (ء alone after a long vowel or sukun).
Right: مسؤول، شيء، بطيء، قارئ، مبادئ، سؤال، فجأة، مفاجأة، تفاؤل، تشاؤم. Wrong: مسئول (accepted
by some, but the standard is مسؤول), شئ, سوال, فجاة, مبادىء, قارىء, بطئ.

**Watch:** «إن شاء الله» is three words with a cutting hamza; «إنشاء الله» means "the creation of
God" and is a BLOCK; «ماشاء الله» and «انشاءالله» are merged. «أنا» without its hamza («انا») is a
mistake in every dialect; «انت» is «إنت» in Egyptian and Levantine copy and «أنت» in MSA and Gulf.

## 3. Taa marbuta (ة) and haa (ه)
- Feminine singular nouns end in **ة**: مدرسة، فكرة، طريقة، تجربة، الحياة، شركة.
- **ه** at the end of a word is either the pronoun "his / him / it" after a noun that does not end in ة (كتاب + ه = كتابه, خبره, صوره), or a slip for ة. When a noun ending in ة takes the pronoun, the taa shows as ت: فكرة + ه = فكرته, قصة + ه = قصته.
- **The trap.** Typed quickly, ة becomes ه, and the result is often a valid word with another meaning (شركه، فكره، قصه، طريقه). The lint flags the common nouns at confidence 0.65. Decide by the sentence: if it needs "his", the haa is right.
- **The test.** Add a suffix. If the stem shows a ت before it (فكرتي، فكرته، شركتهم) the noun ends in ة, so a word spelled فكره or شركه is a slip. If the ه stays after a consonant that belongs to the stem (كتابه، خبره) it is the pronoun and the word is right. Decide by the sentence when both readings are real words (فكره).
- Wrong the other way: هذة (هذه), اللة (الله).

## 4. Yaa (ي) and alif maqsura (ى)
- Dotted **ي**: في، اللي، الذي، التي، هي، and the relative-adjective (nisba) yaa: عربي، مصري، رئيسي، أساسي، شخصي، رقمي.
- Dotless **ى** (alif maqsura, sounds like alif): على، إلى، حتى، متى، مستشفى، معنى، أخرى، ذكرى، موسى، عيسى، مصطفى.
- Typing "ى" for "ي" (فى، اللى، الذى، رئيسى) is one of the most common keyboard habits. Fix it at confidence 0.9; never "correct" the other way unless the word is in the list above.
- Do not decide «علي / على / الي / إلى» by pattern: «علي» can be a name or "on me". These need the sentence.

## 5. Merged and split words
| Right | Wrong |
|---|---|
| هذا، هذه، ذلك، لكن، أولئك، هؤلاء | هاذا، هاذه، ذالك، لاكن، اولائك، هولاء |
| الله | اللة |
| الحمد لله | الحمدلله (common; a NOTE) |
| إن شاء الله، ما شاء الله | انشاء الله، إنشاءالله، ماشاء الله |
| لا شيء | لاشيء |

## 6. Tashkeel and shadda
- **Only to disambiguate.** A mark is justified when two readings change the meaning in this sentence (عِلم / عَلَم، مُدرِّس / مُدرَّس) or in a proper name. Fully vowelled words on a slide are a FIX (rule ORTHO-TASH-001): keep the one mark that separates the readings, drop the rest. When any mark stays, the layout raises the line-height for that slot.
- Never add marks to a word to "look classical". Never remove marks from Quranic text or a quoted verse; do not change such text at all.
- Shadda is part of the word when it changes the verb or noun (علّم vs علِم). Do not add it for decoration; do not drop it from a word that needs it to be read correctly.

## 7. Dialect spelling conventions (accepted, not errors)
| Dialect | Accepted spellings | Notes |
|---|---|---|
| Egyptian | إزاي، إيه، ليه، فين، إمتى، دلوقتي، كده، عايز، مش، بتاع، أوي، لسه، برضو، علشان | «ازاي / ايه / اوي» without hamza are widespread; a style NOTE, never a VETO. Verb prefixes attach: بيكتب، هيكتب، بتعمل. Negation may take «ـش» (ما عرفتش). |
| Gulf | مو، وايد، الحين، شلون، شنو، وش، ليش، أبي، أبغى، تبي، عشان، زين | «ج» is the safe letter; «چ ڤ پ» are accepted only if the brand writes them everywhere. Sub-varieties differ (أبي / أبغى). |
| Levantine | مش، كتير، هلق (أو هلأ)، بدي، بدك، رح، هيك، هيدا (لبناني) / هاد (سوري)، شو، ليش | «عم» before a verb marks the present; do not turn it into standard «ـيَ». |
| Simplified MSA | standard spelling throughout | no dialect word; a shared word such as «بس» is a NOTE, a clear dialect marker is a VETO. |

Keep one set of spellings per post and per brand (إزاي everywhere or ازاي everywhere). Do not
normalise a dialect word into standard Arabic unless the register is `white` or `msa`.

## 8. Invisible and foreign characters
| Character | Verdict |
|---|---|
| tatweel U+0640 typed in the text | FIX: remove except بـ/لـ/الـ joined to a Latin word; shipped presets add no kashida |
| zero-width space U+200B, BOM U+FEFF, soft hyphen U+00AD, word joiner U+2060 | FIX: delete |
| direction marks U+200E, U+200F, U+061C and the embedding or isolate controls | FIX: delete; the engine isolates Latin runs itself |
| forced overrides U+202D, U+202E | BLOCK: never allowed |
| ZWJ U+200D and ZWNJ U+200C | never stripped by the tool; leave them unless the user asks |
| non-breaking space U+00A0 | accepted paste input, normalised to a space before engine binding; do not request it |
| Persian ی ک ھ, Urdu ہ ۃ ے | BLOCK, autofix to ي ك ه ه ة ي |
| Persian digits ۰-۹ | BLOCK, autofix to the brand's digits |
| Arabic Presentation Forms (U+FB50 to U+FDF9, U+FE70 to U+FEFE) | BLOCK: text pasted from a PDF; re-source it with base letters (Unicode NFKC conversion also restores them) |

## 9. Latin names inside Arabic copy
Tool and brand names stay Latin (ChatGPT، Canva، Instagram), in the brand's `latinTerms`. A prefix
attaches with a tatweel and no space: «لـChatGPT»، «بـCanva»، «الـAI» (rule ORTHO-BIDI-001). The
lint notes Arabic spellings of well-known names (انستجرام، واتساب، كانفا) at confidence 0.5; if the
brand prefers them, add them to `voice.allow`.

Use plain copy for Arabic prefixes and Latin phrases. No direction marks or special spaces are required. Controls and unassigned characters block every spec text field, including caption body, per-slide captions, alt and hashtags. ZWNJ and ZWJ are preserved. «الـAPI،», «بـ@الاسم» and «بـ50%» are connectors, not decorative kashida; «تجرّبه» is a valid marked verb.
