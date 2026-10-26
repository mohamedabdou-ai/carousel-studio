# Bidirectional text: Latin, numbers and Arabic in one line

Arabic is stored in reading order and displayed by the bidirectional algorithm. English names,
numbers with units, handles, hashtags and links read left to right *inside* a right-to-left
sentence, and that is correct. Problems appear at the **edges** of those runs. This is gate B1, text
scope (`bidi_lint.py`); the rendered half (are the runs really contiguous, do bound pairs share a
line) is checked by the Studio.

## 1. What the engine does, and what you must not do
The engine tokenizes the copy into Arabic, Latin, number, `@handle`, `#tag`, URL, phone and emoji
runs, wraps every left-to-right run in `<bdi dir="ltr">`, and glues bound pairs. So the stored text
stays plain.

**Never type** any of these into copy (they are findings, not fixes): the direction marks U+200E,
U+200F, U+061C; the embedding and isolate controls U+202A to U+202C and U+2066 to U+2069; the forced
overrides U+202D and U+202E (BLOCK). Never reverse a string by hand to "look right", never swap a
bracket, never add spaces to hold a symbol in place. Those make stored text that no longer searches,
translates or reads aloud correctly.

## 2. What the writer controls
| Situation | Do | Rule |
|---|---|---|
| An Arabic prefix before a Latin or digit word («لـ، بـ، الـ، وبـ، كـ») | attach it with a tatweel and **no space**: «لـChatGPT»، «بـCanva»، «الـAI». A space leaves the prefix stranded at the wrong end | ORTHO-BIDI-001 → B1.stranded-lam, BLOCK, autofix |
| A number and its noun or unit | join with a non-breaking space U+00A0: «5 ساعات»، «30 ثانية»، «10 KB» | ORTHO-BIDI-002 → B1.unbound-pair, FIX, autofix |
| A digit touching an Arabic word | add a space: «3000 سعرة» | ORTHO-DIG-004 → O1.glued-digit, FIX, autofix |
| A Latin name at the very start or end of a line | keep a short Arabic word beside it where possible; the engine isolates it either way | note only |
| A handle, a URL or a phone number | put it on its own line, or inside a sentence with Arabic on both sides; never directly before a full stop or comma | note only |
| Two Latin words in a row («Claude Code») | write them with one ordinary space; the engine merges them into one run | none |
| Brackets and quotation marks around a Latin run | type the logical order only («(ChatGPT)»); the engine mirrors them | none |

## 3. The eleven patterns that go wrong
Describe the *result* in words; a mixed string written in a document is itself re-ordered when it
is shown. Notation for a logical sequence: `A` Arabic, `L` Latin, `N` number, `n` neutral
(space, dot, bracket, dash).

| # | Pattern | What goes wrong | Fix |
|---|---|---|---|
| 1 | a Latin brand inside a sentence | the closing full stop sticks to the wrong side | keep the paragraph direction right-to-left; the engine isolates the name |
| 2 | amount plus currency symbol | the symbol jumps to the other side of the figure | ask the audience's convention, then keep figure and symbol together in one run |
| 3 | percentage | the sign leaves the number | use the sign of the digit system (`%` with 0-9) and keep it glued |
| 4 | number plus Latin unit (kg, GB) | unit separated or on the wrong side | U+00A0 between them |
| 5 | a range between two numbers | the reader cannot tell which is smaller | write it in words: «من 10 إلى 20» |
| 6 | a numeric date | day and month swap | write the month in words |
| 7 | a phone number | the plus sign jumps to the end | keep it as one isolated run, no formatting characters inside |
| 8 | a URL or e-mail | the sentence's full stop is copied into the link | put it on its own line |
| 9 | a file path or command | the parts trade places around slashes | put it in a code-style run on its own line |
| 10 | a model or version code (v2.1, SKU-A10) | letters and digits trade places | keep it as one run; do not add spaces |
| 11 | brackets or quotes around a Latin run | an opening bracket looks closed | type the logical bracket; never swap it by hand |

If a line looks wrong in a preview, check the paragraph direction first (it must be right-to-left),
then the isolation of the one run that moved, then the single neutral character next to it. Most
"flipped" lines are a wrong paragraph direction, not a missing mark.

## 4. In chat messages
Claude Desktop and some clients scramble mixed Arabic and Latin in raw chat text. When you show Arabic
copy to the user: start and end each line with an Arabic word, wrap Latin names, handles and
numbers-with-units in «» or parentheses with Arabic on both sides, and do not put a Latin word
before a line break. Show finished slide copy on the Script page, not as long chat text.

## 5. Checks `bidi_lint.py` runs
| Check | Gate rule | Severity |
|---|---|---|
| `mixed-digits` | N1.mixed | BLOCK |
| `persian-digits` | N1.persian | BLOCK |
| digit system differs from `locale.digits` | N1.system | BLOCK |
| `percent-sign` | N1.percent | BLOCK |
| `lam-latin-stranded` | B1.stranded-lam | BLOCK |
| `number-noun-unbound` | B1.unbound-pair | FIX |
| `digit-glued-to-word` | O1.glued-digit | FIX |

Not checked here (rendered scope): contiguous `<bdi>` rectangles, bound pairs on one line, raw Latin
outside an isolated run. Use `--fix` for the autofix findings and re-run until clean.
