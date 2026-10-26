# Dialect purity

One register per post, written the way that market speaks. A reader decides in a second whether
text was written by one of them, and the tell is almost never a noun: it is the small tool words
(negation, question words, the future marker). Data: `data/dialects/<code>.json`; the lint reports
its lists as O1 findings. Adapted in part from the MIT-licensed ad-copy pack listed in NOTICE.

Names of things are not a register matter: `data/glossary.json` fixes one word for each (the Brand Book is «كتاب البراند», the style is «الستايل», the caption is «الكابشن», a slide is masculine) and the same word is used in every dialect.

## 1. Registers and the codes
| Code | Register | What it is |
|---|---|---|
| `msa-white` | simplified MSA | standard grammar, short sentences, verb first, everyday words; no dialect tool word, no rhetorical ornament |
| `eg` | Egyptian | general Egyptian as spoken in Cairo |
| `gulf` | white Gulf | one neutral Gulf register understood across the GCC; sub-variety Najdi, Hijazi or Emirati refines a few words |
| `levant` | Levantine | general Levantine; sub-variety Lebanese or Syrian refines the demonstrative |
| `en` | English | LTR; Arabic names keep their script |

Status: Egyptian and simplified MSA ship as full registers. Gulf and Levantine are **beta**
(`status: "beta"`, `nativeReviewed: false` in their files) until a native reviewer has passed them:
for them, prefer the light end of the dialect (shared vocabulary, the dialect's tool words only where
you are sure) and say so when you soften something.

**Light or full dialect.** A *light* dialect keeps standard structure and adds a few local words; a
*full* dialect also uses the local negation, question words and future marker. Full dialect needs a
reader from that market; without one (and for every beta dialect) step down one level.

## 2. The tool words that decide
| | Negation | Questions | Future | now | a lot | want | this | good |
|---|---|---|---|---|---|---|---|---|
| **eg** | مش، ما…ش | إيه، ليه، إزاي، فين، إمتى، مين | هـ (هيوصل) | دلوقتي | أوي، كتير | عايز | ده، دي | كويس |
| **gulf** | مو، ما، مب | وش/شنو/إيش، ليش، وين، شلون/كيف، متى، مين | راح، بـ | الحين | وايد، مرة | تبي، أبي، أبغى | هذا، هذي، هالـ | زين |
| **levant** | مش، ما | شو، ليش، وين، كيف، مين، قديش | رح | هلق، هلأ | كتير | بدي، بدك | هيدا / هاد، هاي | منيح |
| **msa-white** | ليس، لا، لم | ماذا، لماذا، أين، كيف، متى، من | سـ | الآن | كثيرًا، جدًا | يريد | هذا، هذه | جيد |

**Do not mistake «بـ» for a Gulf marker:** in Egyptian it marks the habitual present (بيكتب), not the future.

## 3. Words that look local and are not
| Word | Really belongs to | The mistake |
|---|---|---|
| وايد | Kuwait, UAE, Qatar, east Saudi | used for a Riyadh audience, who say مرة or كثير |
| دلوقتي، عايز، إزاي | Egypt only | used in "Gulf" or "Levantine" copy |
| هلق / هلأ | Lebanon, Syria | spread over the whole Levant (Jordan: هسّا) |
| بزاف، دابا، غادي | Maghreb | used in eastern copy, where many readers do not know them |
| شنو | Iraq, Kuwait, Qatar | used for Saudi (وش) or Levantine (شو) readers |
| كمان | Egypt, Levant | used in Najdi copy (بعد) |
| تمام | widespread | reads Egyptian when it sits in a fully dialect text of another market |

**Shared vocabulary that gives closeness with little risk:** بس، خلاص، يلا، طيب، لسه / لسا، شوي /
شوية، عشان / علشان (mainly Egypt and the Levant), أكيد، بالضبط. Take the vocabulary and leave the
tool words: you get a near-local voice without claiming a market you cannot prove.

## 4. How the lint decides
- `deny` list = markers that belong clearly to another dialect → **BLOCK**, overridable by the allow-list (O1).
- `warn` list = words that could be shared, ambiguous or too stiff → **FIX**, or **NOTE** for the mildest.
- Standard-Arabic stiffness inside a dialect post (لماذا، سوف، أريد…) is a FIX; a shared word such as «بس» in a simplified-MSA post is a NOTE.
- A dialect's own markers and lexicon are never denied in it. Ambiguous words are deliberately in `warn`, not `deny`: وش is "face" in Egyptian, أبي is "my father" in formal text, مو is also Syrian, فين and كده are heard in Hijazi, شو is Emirati.
- The attached form with «و» (ومش، وعايز) is listed too. Other prefixes are read by you.
- A finding carries a `suggest` from the dialect's `lexicon`. Treat it as a pointer: **rebuild the sentence in the dialect's own tools** instead of swapping one word, or the skeleton will still be foreign.

## 5. Sub-varieties and the per-post override
- **Gulf:** Najdi أبي / تبي / وش / وين / الحين; Hijazi أبغى / تبغى / ايش / ليش; Emirati شو / أبا / وايد / هالحين. **Levant:** Lebanese هيدا / هيدي; Syrian هاد / هاي. Data in `subVarieties` of each file; the brand's `locale.subVariety` picks one. With none set, keep to the shared words.
- **Per post:** `spec.locale.dialect` replaces the brand dialect for that post only. The proofreader, the hook skeletons, the deny markers, the CTA phrasings (`cta` in the dialect file) and the labels the engine prints («الخطوة 2 من 5», «خرافة / حقيقة», the save pill) all follow it. Digits and the swipe cue stay the brand's.
- **Crossing markets** (one post for several countries): use `msa-white`. Do not write one dialect for a multi-market audience.

## 6. Moving copy between markets
Never swap vocabulary only. Rebuild these twelve slots: negation, question words, future marker, the
five vocabulary words in the table above, the currency and its position, the digit system (the
brand's, not the market's), the shipping or availability facts (a number per market), cultural
references (occasion, proverb, person), city names, product names (translated or Latin), and claims
allowed in that market. Then read the finished text once, looking only for traces of the first market:
one surviving word is enough to mark it as moved.

## 7. After a VETO
1. Show the flagged words with their dialect of origin and the dialect-correct tool word.
2. Rebuild the sentence; keep Latin names, numbers and the hook's meaning.
3. Re-check the neighbours: the caption's first line, per-slide captions, alt text, the CTA and the closing question usually share the same slip.
4. If the user insists a word is right for their audience («اللهجة كده صح»): add it to `voice.allow` and move on; it applies to that brand only.
