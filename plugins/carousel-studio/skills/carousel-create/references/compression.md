# Compression: from a spoken opener to a cover

People talk in 9 to 14 words; a cover gets about 2 seconds and at most 6 words in its first beat and 12 in all. Compression is the step between the two. `scripts/compress.py` makes the mechanical cuts and offers three candidates; you choose one, or rewrite by hand when none keeps the point. The speaker's voice stays: you cut, you do not translate into a formal register.

## When to use it
- The user pastes a line from a Reel, a voice note or a script («ده الهوك اللي قلته في ريل…»).
- A draft cover is over HG1 (`hook_features.py` says so) and the idea is sound.
- Not for a cover you wrote fresh: write it short in the first place.

## What the script does
1. **Cleans the text:** NFC, no hidden direction marks, wrapping quotes removed, Arabic punctuation (، ؟ ؛) and «…» instead of three dots.
2. **Strips discourse fillers** at the start of a clause («طب»، «بص»، «يعني»، «تعرف إن»، «شوف»، «تدري»…) and vocatives at the end («يا جماعة»). The lists are per dialect in `data/hooks/lexicon.json`.
3. **Converts spelled-out numbers to digits** («تلات أدوات» becomes «3 أدوات»). A bare «واحد» stays a word: it is usually not a count.
4. **Drops the if-clause when the result carries the point:** «لو بتنزل كل يوم ومحدش بيحفظ… يبقى المشكلة في أول سلايد» keeps «المشكلة في أول سلايد».
5. **Splits into beats** at «…» and at the speaker's commas and stops, and builds candidates: the speaker's own first two beats, the last two beats (the punch line is usually last), a single beat, a long beat cut in two (preferably before a contrast word such as «مش» or «بس»), and a trailing qualifier dropped («كمصور أعراس في أسوان»).
6. **Moves the numeral to the front** when it sits behind a short subject and verb («أنا جربت 12 أداة» gives «12 أداة…»).
7. **Keeps Latin names exactly as written** and penalises a candidate that loses one.
8. **Scores and ranks** the candidates: within the limits first, a meaning word in the first two words, a numeral up front, two beats, short, no dangling connector at the end. It returns the top three.

## What the script does not do
It cannot tell which cut keeps the point; that is your judgement. It does not invent words, change the dialect, or soften a claim. When no candidate fits it says so (exit code 1, `ok: false`, a note) and offers only a cut at the limit: rewrite by hand.

## Running it
From this skill's folder:

```
python scripts/compress.py --text "لو بتنزل بوستات كل يوم ومفيش حد بيحفظ حاجة منها، يبقى المشكلة مش في العدد، المشكلة في أول سلايد" --dialect eg --format json
```

Options: `--hero-max` (default 6), `--total-max` (default 12), `--top`, `--format text` for a quick look, `--file` for a longer opener. Each candidate is `{cover, hero, sub, words, heroWords, breakAt, ok, score, rules}`.

## Choosing
Read the three candidates against four questions:
1. Does the point survive? (The numeral, the contrast, the name.)
2. Is there one gap and is it still open? The cut must not turn the question into its answer.
3. Does it still sound like the speaker? Put back a filler only if it is the voice, never to pad.
4. Does the first beat start with the meaning word?

Run the candidates through `hook_features.py --role cover` like any draft. Convert the survivors to the lab's array of `{headline, sub?, kicker?}`, then run `render.mjs --covers covers.json --spec spec.json --brand brand.json --out cover-lab --presets all` from carousel-design. Read the rendered lines, hero at 130 px, width and empty-band findings. Offer only covers that already fit, as rendered images at feed size and 130 px, never as bare text. Rewrite and repeat gates then lab when a survivor cannot fit; do not force smaller type or relax a gate.

If the creator asks for a stronger hook, the three fitting images have different tension and always include a shock cover based on a sourced loss, a contradiction or a hard number. Compression keeps the speaker's meaning; a changed claim is a new hook that needs their approval.

## Placing it in the spec
Start with `hero` in `headline` and a second beat in `sub` when the headline would exceed 6 words. The lab searches word-boundary breaks, keeps forced breaks and may try the creator's punctuated second beat in a sub-line. Apply the chosen `arrangement.fields` with `spec_edit.py cover` before approval or freezing; these values keep emphasis markup, and a preview never changes the spec. Keep the full spoken line in `spec.hook.text` and the approved cover in `spec.hook.cover`.

## Examples (synthetic)
| Spoken | Cover |
|---|---|
| لو بتنزل بوستات كل يوم ومفيش حد بيحفظ حاجة منها، يبقى المشكلة مش في العدد، المشكلة في أول سلايد | المشكلة مش في العدد… المشكلة في أول سلايد |
| طب بص، أنا جربت تلات أدوات ذكاء اصطناعي ببلاش، وطلعت واحدة بس تستاهل | 3 أدوات ذكاء اصطناعي ببلاش… وطلعت واحدة بس تستاهل |
| دي مش شغلتي كمصور أعراس في أسوان… ده الفلتر | دي مش شغلتي… ده الفلتر |
| لو مصممك سلّم بدري بالـAI… هتشكره ولا تشك فيه؟ | لو مصممك سلّم بدري بالـAI… هتشكره ولا تشك فيه؟ (already within the limits) |
| الخطأ القاتل اللي بيعمله كل صانع محتوى مبتدئ على Instagram وبيخلي بوستاته مش بتتحفظ | no clause is short enough: write «الغلطة اللي بتموّت بوستك» by hand, then gate it |

## Exit codes
0 at least one candidate is within the limits; 1 none is; 64 usage error; 65 unreadable data file; 66 missing input; 70 the shared `_cs` package is missing.
