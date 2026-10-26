# Digits

One digit system per design, and Western 0-9 by default. This is gate N1 (text scope) and the rules
ORTHO-DIG-001 to 004 in `data/rules/ortho.json`; `bidi_lint.py` reports them with the N1 names.

## 1. The rule
- **Western 0-9 is the default for every country and every register.** All the numerals on the 16 winning Arabic covers we studied were Western, and GCC and Levantine social media use them.
- **Arabic-Indic ٠-٩ is an opt-in** the user chooses on purpose, with a recorded reason (`locale.digitsReason`). The plugin only *offers* it when the register is MSA, the topic is government, finance, health or legal, or the audience is in Egypt, Saudi Arabia, Iraq, Sudan or Yemen (`locale-defaults.json`). It never switches on its own.
- **Persian ۰-۹ is always a mistake** in Arabic copy. The two systems look the same except for 4, 5 and 6 (٤ ٥ ٦ against ۴ ۵ ۶), which is how a pasted Persian number hides inside Arabic text.
- **One system in one design, in the same pass:** the counter, cover numerals, step numbers, percentages, prices, dates and the caption all follow `locale.digits`. Mixing inside one sentence is the worst case.
- The user's own digit habit never overrides `locale.digits`: convert to the brand's system, then tell them.

## 2. Symbols travel with the system
| Symbol | Western | Arabic-Indic |
|---|---|---|
| decimal | `.` | `٫` U+066B |
| thousands | `,` | `٬` U+066C |
| percent | `%` | `٪` U+066A |
| counter | `3 من 8` | `٣ من ٨` |

`%` beside Arabic-Indic digits, or `٪` beside Western, is N1.percent (BLOCK, autofix). The Arabic
comma `،`, semicolon `؛` and question mark `؟` are independent of the digit system.

## 3. Always Latin, whatever the choice
Code and file names, URLs, `@handles`, `#hashtags`, phone numbers, IBAN and card numbers, version
numbers and model names (GPT4, v2.1, 4K), anything a machine reads. These are *not* converted and
do not count toward "mixed" (the checker skips any token that holds a Latin letter, and tags,
handles, URLs and phones).

## 4. Writing numbers
- **Covers use digits, not words:** «3 أدوات»، not «ثلاث أدوات». Spelled-out numbers on a cover are a FIX (rule C1.number-words); in speech and body text words are fine.
- **A number and its noun stay together:** «5 ساعات» with U+00A0 between them so the pair never splits across lines (ORTHO-BIDI-002, autofix).
- **Ranges in running text use words** («من 10 إلى 20») rather than a dash, which flips unpredictably; tables and chrome can use a single isolated block.
- **Dates:** write the month in words («22 أكتوبر 2026»). Prices: the currency goes where the audience's country puts it; ask when unsure and keep one form per post.
- **No digit glued to a word:** «3000سعرة» is wrong, «3000 سعرة» is right (ORTHO-DIG-004, autofix). A prefix joined with a tatweel («بـ3») is the accepted form; a bare «و3» reads fine but the checker may still report it, so keep it only when the conjunction is meant.
- **A list count must match its slides:** a cover that says 5 needs 5 item slides (gate C6). That is the writer's check, but report a mismatch you notice.
- **Numbers need a source** (SRC1): do not fix, round or "improve" a figure in the copy; flag it to the writer.

## 5. Offering Arabic-Indic (when it applies)
Show the user's own cover line both ways, side by side, with the evidence line, and let them type 1
or 2. If they pick Arabic-Indic: set `locale.digits = "arabic-indic"` and a reason in
`locale.digitsReason` («جمهور حكومي»، «التزام بمرجع رسمي»…), then run `bidi_lint.py --fix --digits
arabic-indic`. Asking "which digits do you want?" by system name misleads (in North Africa the
"Arabic numerals" are 0-9); ask them to write the year 2026 the way they want it.

## 6. What the checker reports
| Finding | Gate rule | Severity |
|---|---|---|
| two systems in one text | N1.mixed | BLOCK, autofix |
| Persian digits | N1.persian | BLOCK, autofix |
| the whole text in the other system than the brand's | N1.system | BLOCK, autofix |
| `%` / `٪` against the system | N1.percent | BLOCK, autofix |
| a digit glued to an Arabic word | O1.glued-digit | FIX, autofix |
