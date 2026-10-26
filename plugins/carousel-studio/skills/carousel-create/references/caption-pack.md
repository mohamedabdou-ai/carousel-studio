# Caption pack

The pack holds the caption, ≤5 hashtags, per-slide captions and alt text. It is written **together with the script, before the Script view opens** (the page moves to Design the moment the user approves, and Design needs a complete pack), from the final slides, and it lives in `spec.captionPack`. When the user edits slides in the Studio, refresh the entries that depend on them.

```json
"captionPack": {
  "firstLine": "…", "keywordLine": "…", "body": "…", "cta": "…",
  "hashtags": ["#…", "#…"],
  "perSlide": ["…", "…"],            // one entry per slide, in order
  "alt": ["…", "…"],                 // one entry per slide, in order
  "asset": {"keyword": "…", "description": "…", "delivery": "instant"}   // only for a keyword-to-DM CTA
}
```
The caption as posted is `firstLine`, a line break, `keywordLine`, a blank line, `body`, a blank line, `cta`, a blank line, then the hashtags separated by spaces. Length is counted in Unicode characters after NFC, an emoji counting as one, over that whole text.

## The caption (Q40)
| Part | Rule |
|---|---|
| **Length** | **300 to 900 characters** by default. Fast mode may be shorter (100 to 300), flagged «كابشن قصير» as a NOTE. The ceiling is Instagram's 2,200 (a BLOCK above it). Brand voice may move the length only inside the band |
| **Line 1 (`firstLine`)** | At most 125 characters (about what shows before «المزيد»). It gives **a new reason to swipe**; it never repeats the cover (similarity to the cover under 0.6) and it is not the cover's answer |
| **Sentence 2 (`keywordLine`)** | Holds the **search keyword**: the Arabic term plus the Latin tool name when there is one («تصميم الكاروسيل بالعربي مع Canva»). Instagram search and public-post indexing read the caption, so this is where discovery lives. Never empty |
| **Body** | A numbered summary of the payoffs («1. …»), one short line each, so a reader who never swipes still gets value. No new claims that are not in the slides, no number without a source |
| **CTA (`cta`)** | One line, the same ask as the slide's CTA and matching the intent (`cta.md`). It repeats the slide CTA; it never adds a second ask |
| **Hashtags** | **At most 5**, unique, no spaces, ≤60 characters after `#`. The brand tag from `identity.otherNames` (written `#Name`) takes slot 5; use 4 topical tags before it. No brand tag: all 5 may be topical |
| **Voice** | The post's dialect, the brand's voice and `voice_check.py` (drift beyond 1.5 IQR is rewritten). Emoji only if the brand's fingerprint uses them, and never at a line edge next to Latin text |
| **AI label** | If any asset in `spec.assets` has `aiGenerated: true`, the kit and the posting guide remind the user to switch on Instagram's AI label. You do not write that reminder into the caption pack |

Digits follow the post (`western` unless opted in). Latin names stay Latin and sit inside the sentence, never alone at a line edge. Arabic punctuation (، ؛ ؟) and «…». No tashkeel; tatweel only in `بـ/لـ/الـ` joined to a Latin word.

## Per-slide captions
Instagram can show a different caption under each slide ("Multiple captions"). **Always generate them**; using them is the user's choice, and a slide with none posts normally. Each is **at most 100 characters** (provisional until Instagram's own limit is verified; a FIX above it): a single line in the post's voice that adds the reason to look at *this* slide. It does not copy the slide text, has no hashtags, and the cover's caption is the hook in one line.

## Alt text
One per slide (`alt-text.md`): what is on the slide and what it shows. Target at most 300 characters, hard limit 1,000.

## Example (Egyptian, synthetic)
Cover «6 أدوات ببلاش… بتغنيك عن المصمم», intent save, 8 slides.
```
firstLine:   مش لازم تدفع لمصمم عشان بوستك يطلع شكله محترف.
keywordLine: جمعتلك أدوات ببلاش لتصميم الكاروسيل بالعربي، من Canva لحد أدوات الكتابة.
body:        1. أداة التصميم  2. أداة الكتابة …   (one numbered line per payoff, with the real names)
cta:         احفظ البوست وارجعله لما تيجي تعمل البوست الجاي.
hashtags:    #كاروسيل #تصميم_السوشيال
```
Line 1 gives a new reason ("you may not need a designer") instead of repeating "6 free tools"; sentence 2 carries the Arabic keyword and the tool name; the number in the cover is the list's own count, so it needs no source.

## English posts
Same structure and bands. Line 1 is the hook for the reader who has not swiped, sentence 2 holds the keyword, hashtags are English, counts in code points.

## Checks
`lint_copy.py --text "…" --role caption` runs the caption gates alone (C9 length, first line, keyword line, hashtags; C8 voice; O1 spelling; N1 digits; B1 bidi). The whole pack is checked with `lint_copy.py --spec`, where the per-slide and alt arrays must have the same length as `slides`.
