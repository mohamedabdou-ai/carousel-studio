# Punctuation

Arabic punctuation on a slide, in a caption and in alt text. The checks are rules ORTHO-PUNCT-001
to 007 in `data/rules/ortho.json`; the engine renders the marks, so mistakes here are spelling
mistakes in the stored copy.

## 1. The marks
| Mark | Name | Use | Never |
|---|---|---|---|
| ، | Arabic comma (U+060C) | between clauses and list items | the Latin comma `,` inside an Arabic sentence |
| ؛ | Arabic semicolon (U+061B) | between related clauses | `;` |
| ؟ | Arabic question mark (U+061F) | after a question | `?` inside Arabic text |
| … | one ellipsis character (U+2026) | the pause in a two-beat line; an unfinished bridge | `...` or `. . .` |
| « » | guillemets | quoted words, a phrase held up for attention, a button label | straight `"` quotes around Arabic |
| ( ) | parentheses | an aside, an example | typing the closing bracket first "to fix" the display (see `bidi-text.md`) |
| : | colon | after a label or before a list | a space before it |
| ! | exclamation | rarely; one at most per slide | `!!` or `!!!` |
| . | full stop | end of body sentences and alt text | the end of a cover headline, a slide title or a button |

English copy keeps Latin punctuation and curly quotes.

## 2. Spacing
- **No space before** ، ؛ ؟ : ! . … and the closing » or ). **One space after** each of them (ORTHO-PUNCT-001 removes the first, -002 reports the second).
- A comma, colon or question mark followed directly by a letter is a missing-space mistake: «شكرًا،يا أصدقاء».
- Never two spaces in a row (ORTHO-PUNCT-004); a non-breaking space between a number and its noun is not a double space.
- No space inside guillemets or parentheses: «مثال»، not « مثال ».

## 3. Repeats and combinations
- `؟؟`, `!!` and `،،` collapse to one mark (ORTHO-PUNCT-006). A question that is also an exclamation is written `؟!` once, and only when the tone needs it.
- Three dots become the single character `…` (ORTHO-PUNCT-005). Do not follow `…` with another full stop.
- The two-beat hook «بتكتب كل يوم… وبتنشر مرة في الأسبوع؟» is correct as one line; on a cover the engine breaks the line at the `…`.

## 4. Slide and caption conventions
- **Cover and titles:** no final full stop. A question keeps its ؟.
- **Bridge lines** (the last line that leads to the next slide) may end with `…` or ؟, never with a full stop and an ellipsis.
- **Lists on a slide:** one idea per line, no trailing commas; bullets are the layout's job, so do not type `-`, `*` or `•` at the start of a line.
- **Numbered steps:** write the number as a figure in the current digit system with a full stop only in captions («1. افتح الأداة»); on slides the engine prints the step label, so the text omits it.
- **Hashtags and handles:** no punctuation inside them and none stuck to their end: write the tag, a space, then the comma (or put the comma before the tag).
- **Percent, decimal and thousands marks** follow the digit system (see `digits.md`).
- **Emoji:** none at the start or end of an Arabic line (ORTHO-PUNCT-007, a NOTE): the position can flip. Put it inside the sentence or drop it. Covers carry none.
- **Alt text and per-slide captions** are full sentences with a final full stop.

## 5. Mistakes to expect
| Seen | Fix |
|---|---|
| `اطلب الآن, ويصلك غدًا` | `اطلب الآن، ويصلك غدًا` |
| `ازاي؟؟` | `ازاي؟` |
| `استنى...` | `استنى…` |
| `ده سؤال ؟` | `ده سؤال؟` |
| `"الذكاء الاصطناعي" مش بديل` | `«الذكاء الاصطناعي» مش بديل` |
| `3 أدوات : الأولى` | `3 أدوات: الأولى` |
