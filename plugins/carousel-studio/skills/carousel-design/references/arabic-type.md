# Arabic typesetting rules

The engine enforces these rules on its own output and the gates (D5, B1, N1) check them. Use this page when a user asks why something was changed, when you hand-edit a spec, and when you judge an exported image. Everything here applies to `ar` dialects; English posts use `dir="ltr" lang="en"` and the same engine.

## 1. Direction and language
- `dir="rtl" lang="ar"` on every Arabic slide root; layout uses logical properties (start/end), so one stylesheet serves both directions.
- One register per post (dialect, white or MSA). Latin brand and tool names stay Latin, in the same weight and colour as the Arabic around them (gate D6).

## 2. Isolating LTR runs
Every left-to-right run is wrapped in `<bdi dir="ltr">`: English words, numbers with units (`$20`, `5G`), `%`, @handles, #hashtags without Arabic letters, URLs, e-mail, phone numbers. Latin phrases keep their punctuation inside one isolate (`Google Search & Other`, `"Yes, and don't ask again"`). Plain, no-break, narrow no-break and thin spaces have the same rendering policy. Arabic-script hashtags get `dir="rtl"`. Emoji are not wrapped.

Binding (no line break between the parts):
- «لـ / بـ / الـ / وبـ» stay attached to the Latin word after them: «لـChatGPT» is one word. A stranded «لـ ChatGPT» (space) is a BLOCK (B1) and is auto-fixed.
- Type «5 ساعات», «الخطوة 3» and «Opus 5.5» with ordinary spaces. The engine binds the pair on one line and preserves its order; no copy lint asks for U+00A0. `B1.unbound-pair` measures broken rendered pairs.
- One- and two-letter Arabic words, plus «ولا», stay with a neighbour. An explicit newline is respected; `D6.orphan-connector` asks for review if it strands a connector. Mixed Arabic/Latin display lines receive extra line height.
- Never split a word across slides or lines. Never put an LTR run on a line edge alone when it can be bound to its neighbour.

Type «وGoogle», «وAI Mode», «وMax 5x», «بـ@الاسم», «بـ50%» and «الـAPI،» as written. The Arabic prefix stays outside the Latin font and isolate, in the body face for clarity, and stays attached to its word.

No invisible workaround is needed. Rendering maps U+00A0, U+202F and U+2009 to ordinary spaces, then binds layout units. It removes direction marks and isolates, overrides, zero-width spaces, soft hyphens, word joiners and BOM. It preserves ZWNJ U+200C and ZWJ U+200D because they can carry shaping intent. Raw copy is linted first: controls other than tab/newline/CR, unassigned characters and isolated surrogates are BLOCK findings in every spec string, captions and alt text included. Safe controls and direction marks have deterministic repairs; unknown characters require review.

## 3. Digits
One digit system per design (N1, a BLOCK, auto-fixed). The default is **Western 0–9** everywhere, including formal registers: every numeral on the 16 winning Arabic covers we studied was Western. **Arabic-Indic ٠–٩ is an opt-in** the plugin may only offer (MSA register, or government, finance, health or legal topics in Egypt, Saudi Arabia, Iraq, Sudan or Yemen); show both side by side on the user's own hook, record the choice and the reason, never switch silently. Persian digits ۰–۹ (U+06F0–06F9) are always an error. The counter, cover numerals and the percent sign follow the choice: `%` with Western, `٪` with Arabic-Indic; decimal `.` or `٫`, thousands `,` or `٬`. Conversion is one pass and never touches handles, hashtags, URLs or phone numbers.

## 4. Punctuation
Arabic comma «،», semicolon «؛», question mark «؟», ellipsis «…» (one character, not `...`), guillemets «» for quotes. No space before «، ؛ ؟ : ! .» and one space after. Latin punctuation stays inside a Latin phrase; Arabic punctuation is used after Arabic words. Ellipsis marks the two-beat break of a cover («مش X… ده Y»): on the cover it becomes a line break.

## 5. Forbidden on Arabic text (D5, never overridable)
Letter-spacing or tracking of any size · justification · italic or oblique (including synthesised slant) · `font-synthesis` · opacity or RGBA on a text node (a fade uses group opacity on a wrapper around whole words or lines; translucent colours are pre-mixed into solid ones) · per-letter splitting for animation · blend modes, masks, filters or `writing-mode` on text. Fonts must cover every code point used; a fallback font showing in the render is a BLOCK.

## 6. Kashida (tatweel)
- Shipped presets use no decorative kashida. Keep بـ/لـ/الـ joined to its Latin word.

## 7. Tashkeel
Only where it removes a real ambiguity (a word on the allowlist). Full diacritics on a slide is a FIX. When any diacritic appears, line height rises (+0.15 display, +0.2 body) so marks do not collide.

## 8. Mirroring
Mirror with the direction: arrows, progress, steps, timelines, list indents, chevrons. Never mirror: logos, photos, play icons, clocks, numbers, chart axes, any asset marked `mirror: never`.

## 9. Fonts
- Only unmodified OFL fonts ship (registry in `fonts/registry.json`; coverage from the real cmap in `fonts/coverage.json`). A font is valid for a design only if it covers every code point the design uses. Tajawal, Almarai and Zain lack Latin extended, and a font without Arabic-Indic digits cannot serve a brand that opted into them.
- Cairo, Rubik and Tajawal are the most used faces on Arabic Instagram; using one the brand did not choose triggers the "default look" NOTE (D7).
- Thmanyah and any other free-but-not-open font is used only from the user's own upload: it renders in the live page and in PNG, JPG, MP4 and PDF, and is never embedded in `studio-source.html`, `cover.hf.html` or the ZIP (the export shows a note asking the user to re-attach their own copy).
- At most two Arabic families plus a Latin face. Heavy modern sans or geometric kufi for hooks; thin or handwritten faces only at large sizes.

## 10. Failure → gate → fix
| Symptom | Gate | What happens |
|---|---|---|
| mixed 123 and ١٢٣ | N1 | auto-fix to the brand's system |
| «لـ ChatGPT» stranded, number split from noun | B1 | bind (auto) or refit |
| letters look disconnected or a fallback font shows | D5 | BLOCK; check font coverage and that no text is split per letter |
| letter-spacing, italic, opacity on text from a preset or override | D5 | BLOCK; remove the override |
| a lone word on the last line | D6 | FIX; the engine refits, otherwise shorten |
| hamza, ة/ه, ى/ي, Persian letters, space before «،» | O1 | proofreader table; only high-precision fixes auto-apply |
| English-only cover on an Arabic account, Latin names mismatched in weight | D6 | FIX |

## 11. Hand-editing checklist
Before you save a text field: NFC text, `==span==` marks at most one emphasis span, `\n` only for a deliberate break, Arabic punctuation, Western digits unless opted in, Latin names unchanged, no pasted tatweel, no `...`, no double spaces. Run `validate.py spec spec.json --lint` after.

Underlines use continuous ink below the dots (`text-decoration-skip-ink:none`), including the notebook double underline. Do not remove emphasis to hide a rendering defect.
