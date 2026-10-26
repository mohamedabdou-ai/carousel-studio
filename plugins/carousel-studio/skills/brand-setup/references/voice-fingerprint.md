# Voice fingerprint

A fingerprint is a small set of measurements taken from 3 to 10 of the user's own captions. It is
stored in `brand.voice.fingerprint`, and every later draft is compared against it
(carousel-create's `voice_check.py`, gate C5 voice drift). The measurements are mechanical on
purpose: they catch drift (a long-winded draft for a short-sentence writer, emoji where there were
none) without pretending to judge taste. Taste is the signature phrases and the three sample lines,
which the user confirms.

## 1. Procedure
1. **Collect** 3 to 10 captions the user wrote (`VO-04`), separated by a line with `---`. Fewer than 3: do not compute; keep the tone chips and say the fingerprint will be built from the first approved captions.
2. **Clean before anything is stored.** Remove phone numbers, e-mail addresses, client names and other people's names. Keep hashtags and handles out of the sample text if they identify a client. The cleaned captions are what goes into `voice.samples` (up to 10, each at most 3000 characters).
3. **Run** `python fingerprint.py --file captions.txt --separator "---" --dialect <brand dialect> --format json --with-report`. The `fingerprint` key is the object to store; `report` is for you.
4. **Read the report to the user** in two or three plain lines: typical sentence length, emoji habit, how much English they mix, and the repeated phrases. If `report.detectedDialect` differs from the brand dialect, ask which is right before saving; never change the dialect on your own.
5. **Confirm signatures** (`VO-07`). Keep the ones the user calls theirs, drop worn-out openers. Keep at most 8.
6. **Write 3 sample lines** about the user's niche in that voice (`VO-08`), obeying the measured sentence length, emoji habit and person («أنا» or «إحنا»). Show them; if the user corrects them, move the correction into `voice.use`, `voice.avoid` or the tone scales.
7. **Save** with `save-section --section voice` and keep the three confirmed lines in `ext.voiceRewrites` as `[ {"before": "...", "after": "..."} ]` only if the Brand Book will show them (a "before" is the user's own line, never someone else's).
8. **Refresh** after 3 or more new approved captions, or when the user says the voice changed: run again over the latest 10 and ask before replacing.

## 2. The algorithm (shared with voice_check.py)
Input text is NFC. For the statistics below, URLs, e-mails, phone numbers, `@handles` and `#hashtags`
are removed first (they are not voice). Emoji are counted on the original text.

| Measure | Definition | Stored as |
|---|---|---|
| **Sentences** | split each caption at line breaks and at `.` `!` `?` `؟`; `…` and `...` and decimal points do not end a sentence; a piece with no countable word is dropped | – |
| **Words** | the countable tokens of `_cs.text.word_count` (a token with at least one letter or digit) | – |
| `sentLen` | percentiles p25, p50, p75, p90 of words per sentence, linear interpolation, one decimal | object |
| `emojiPer100w` | emoji clusters (a ZWJ sequence counts once) per 100 words, two decimals | number |
| `emojiSet` | up to 8 most used emoji, most frequent first | list |
| `latinMixPct` | words containing a Latin letter ÷ all words × 100, one decimal | number |
| `ellipsisRate` | `…` and runs of three or more dots ÷ sentences, two decimals | number |
| `questionBangRate` | sentences that end with `?`, `؟` or `!` ÷ sentences, two decimals | number |
| `person` | count of first-person singular markers (أنا، عندي، معايا، لي، ليا…) against plural (إحنا، نحن، عندنا، معانا…); `ana` if singular > 1.5 × plural, `ehna` if plural > 1.5 × singular, otherwise `mixed`; omitted when there are none | `ana` `ehna` `mixed` |
| `openers` | the first beat of each caption: its first sentence up to the first `…`, at most 6 words; unique, at most 20 | list |
| `dialectMarkers` | marker word → count, for the Egyptian, Gulf and Levantine marker lists (diacritics and hamza variants folded) | object |
| `captionLenBand` | `[p25, p75]` of caption length in characters (with emoji and hashtags, as Instagram counts) | two integers |
| `signatures` | 2 to 6 word phrases found in at least two different captions, trimmed of leading and trailing stop words, longest first, no phrase inside another, at most 8 | list |
| `computedAt`, `sampleCount` | UTC timestamp, number of captions used | – |

**Drift check (voice_check.py):** a metric is flagged when it falls more than the plugin's
`voice.driftIqr` setting (1.5) times the interquartile range outside `[p25, p75]` of the stored distribution. Only
`sentLen`, `emojiPer100w`, `latinMixPct`, `ellipsisRate` and `questionBangRate` take part. It also
flags banned AI words and stock openers from `copy.json`.

## 3. Reading the numbers
Say each finding in the user's `uiDialect`, in plain words and never as a report. The quoted wording below is the Egyptian version; use the same meaning in the dialect's own words (for msa-white, «جملك قصيرة وسريعة» becomes «جملك موجزة وسريعة»).

| Finding | What to tell the user | What changes in drafts |
|---|---|---|
| `sentLen.p50` 4 to 7 | "جملك قصيرة وسريعة" | cover and body lines stay inside the 25-word body budget with room to spare |
| `sentLen.p50` above 14 | "بتحب الجملة الطويلة" | drafts split sentences at bridges so they still fit a slide |
| `emojiPer100w` 0 | "من غير إيموجي" | no emoji in captions; the proofreader notes any |
| `latinMixPct` above 15 | "بتخلط إنجليزي كتير" | Latin names stay Latin and are isolated; do not translate them |
| `ellipsisRate` above 0.3 | "بتحب «…» في النص" | the two-beat cover break at `…` fits this writer |
| `person: ehna` | "بتتكلم باسم فريق" | "إحنا" voice in captions, "أنا" is avoided |
| `dialectMarkers` from two dialects | "الكابشنات فيها لهجتين" | ask which one the brand uses; mixed copy fails the proofreader |

## 4. Edge cases
- **Mostly English captions:** the markers and person lists are Arabic, so the report says `unknown`; keep the Latin-based measures and ask for the dialect of the Arabic posts.
- **Captions copied from AI tools or templates:** if three or more captions open with the same stock phrase or hold banned AI words, tell the user and ask whether those are really theirs before building a fingerprint on them.
- **A very short set** (under 12 sentences in total): the report warns; present the percentiles as rough.
- **Hashtag-heavy captions** do not distort the numbers (hashtags are stripped), but the caption length band still counts them, as Instagram does.
- **Privacy:** the fingerprint contains phrases, not people. Do not store a caption that is mostly a client's text; ask for another.
