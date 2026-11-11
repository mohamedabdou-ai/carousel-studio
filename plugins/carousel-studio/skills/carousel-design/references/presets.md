# Style presets (v1)

Three looks ship in this release: `creator`, `notebook`, `poster` (`ships: "1.0"` in `styles/index.json`). `swiss`, `interface` and `heritage` are built but held back for a later update (`ships: "1.2"` in `styles/index.json`): never offer or pick them. When a table, a hook's `styleHint` or a brand points to one, use its stand-in: `swiss` → `poster`, `interface` → `creator`, `heritage` → `poster`. Files: `styles/index.json` (order of the Style tab), `styles/<id>/preset.json` (tokens) and `styles/<id>/decor.css` (the look).

A preset is **tokens + `decor.css` + variant flags, never a new layout**. Archetype partials own layout, the preset owns colour, type, decoration and the look of every chrome element. How a preset combines with a brand, an occasion and per-post overrides is in `layer-model.md`; the CSS rules are in the contract (section 6.3) and are enforced by `scripts/preset_lint.py`.

## 1. The six at a glance (three ship now)

| id | Arabic | Look in one line | Palette (bg · surface · ink · accent) | Fonts (display / heading / body / Latin) | Kashida |
|---|---|---|---|---|---|
| `swiss` | سويس | Heavy type, strict hairlines, one red block on the key word | `#F4F4F2` `#FFFFFF` `#111111` `#E3262B` | IBM Plex Sans Arabic 700 / same / Readex Pro 400 / IBM Plex Sans 700 | no |
| `creator` | صانع المحتوى | White sticker card on warm paper, hard shadows, yellow marker | `#F6F2EA` `#FFFFFF` `#14120F` `#FFD23F` | Alexandria 800 / Alexandria 700 / Readex Pro 400 / Alexandria 800 | no |
| `notebook` | دفتر ملاحظات | Ruled paper, blue ink, red pen, double underline, taped notes | `#F6F0DF` `#FFFCF2` `#1D2B5A` `#D8382C` | Playpen Sans Arabic 700 / same / Readex Pro 400 / Readex Pro 600 | no |
| `poster` | بوستر | Cream sheet in a double frame, deep-green type, rust rules, label tabs | `#F3EBD8` `#FBF6E9` `#1B4332` `#B04A1E` | Noto Kufi Arabic 800 / Noto Kufi Arabic 700 / Alexandria 400 / Alexandria 800 | no |
| `interface` | واجهة | White app window on a light desktop, title bar carries the handle | `#E8ECF3` `#FFFFFF` `#0F172A` `#4F46E5` | Readex Pro 700 / Readex Pro 600 / Readex Pro 400 / Inter 700 | no |
| `heritage` | تراثي | Deep green gradient, fading Islamic lattice, gold, arch panels | `#133B31` `#1F5A47` `#F7F1E3` `#EEBA66` | Reem Kufi 600 / El Messiri 700 / El Messiri 500 / El Messiri 700 | **yes**, one headline word |

Every text pair is checked against the floors in `preset.json` (body 4.5:1, large 3:1): ink on bg 17.2 / 16.8 / 11.9 / 9.3 / 15.1 / 11.0, muted ink on bg 6.3 / 6.6 / 5.4 / 5.8 / 6.4 / 7.5 (same order), and the text colour the engine puts on an accent fill is at least 4.5:1 on all six. Fonts are only from the OFL set of `fonts/registry.json`; a brand's own font replaces display/heading/body/Latin when `fonts` is bound.

## 2. Choosing a preset

Choose only shipped presets, by topic and pre-flight:

| Topic | Preset | Why / motion |
|---|---|---|
| hot take, opinion, reframe | `poster` | firm type and rules; stamp/highlight-sweep |
| personal story, AI tool, face | `creator` | cards and highlight; counter/story |
| checklist, prompt pack, steps | `notebook` | a keepsake; reorder/highlight-sweep |
| X vs Y, money, sourced figures | `poster` | ledger and plain numerals; counter/stamp |
| tools, free vs paid, walkthrough | `creator` | mock cards; counter |
| teaching a platform or format | `notebook` | annotated keepsake; highlight-sweep |
| culture, national day, Ramadan, Eid | `poster` | restrained frame; story |

Run `render.mjs --covers covers.json --spec spec.json --brand brand.json --out cover-lab --presets all` before a hook choice. It renders the survivors of the hook gates across creator/poster/notebook in one browser launch. Read every finding and show fitting images from `covers.png` at feed size and 130 px. A hero below 14 px needs another arrangement or a shorter hook. Empty bands use the current D9 thresholds and rollout severity in the platform data; a NOTE is still useful design advice. Log a forced preset swap. Held brand choices use the opening stand-ins.

For a style choice on an existing post, run `render.mjs --style-sheet --spec spec.json --brand brand.json --out style-lab --format text`. `style-sheet.png` shows the real cover and slide 2 in every shipped style, labelled with hero size and the preflight findings. No post files or videos are exported. `--preflight` remains the data-only version. Both picture modes accept `--format json|text`, write only their one PNG, and never save the spec; they reject `--save-plan` and `--contact-sheet`.

The covers file is a JSON array, separate from the hook-scoring batch:

```json
[
  {"headline": "صورتك ثابتة؟\nحرّكها في ChatGPT", "sub": "خطوة واحدة لتجربتها"},
  {"headline": "3 أخطاء تخفي منتجك", "kicker": "قبل النشر"}
]
```

Omitted sub/kicker fields are absent, rather than inherited from the original cover. The default tries the post's style; `--presets creator,poster` selects styles and `--presets all` selects every shipped style. JSON reports each candidate/style pair, hero word count, physical lines, hero size at 130 px, headline width ratio, the empty band, full rendered findings (including NOTE and prospective findings), and a fit ranking. The ranking sorts errors last, then BLOCK/FIX counts, larger hero, smaller empty band and input order. It does not rank truth or tension. Text output includes every finding and its fix. Read JSON when labels on a busy sheet cannot hold every finding.

Fit searches word-boundary line arrangements up to the cover's line limit, keeps explicit breaks, bound number/noun pairs, Latin names and emphasis, and chooses the largest passing hero. The lab can also try an existing punctuated second beat in a new sub-line when none was authored; it never changes a word or replaces an authored sub-line. Copy the chosen `arrangement.fields` into the canonical cover with `spec_edit.py cover` before approval or freezing, especially when `movedSecondBeat` is true. These values retain emphasis markup. Ordinary renders retain field ownership so their source-integrity and freeze checks remain valid; only the lab opts into a temporary beat move. The preview cannot persist that decision. A long Latin name, an unbreakable word, a fixed small type maximum, or a short title leaving an empty band may still need an editorial or layout change; the lab keeps those findings visible.

Ordinary spaces inside a Latin name are legal break points. Each resulting line keeps its own bidi isolation. Use a nonbreaking space (`\u00a0` in JSON) when a pair must stay together.

## 3. The presets

### swiss (سويس) · held back, not in this release
- **Concept.** A grid-first editorial look: type does everything, the page is quiet. One accent, always a fill.
- **Signature.** A hairline under the header with a heavy tab at its start edge, a hairline above the footer, a small accent square before the handle, a short accent bar before the kicker.
- **Emphasis.** `bar` (default): a hard-edged accent block with the on-accent colour for the text. Also `marker` (same block, softly rounded), `underline`, `color`.
- **Numbering.** `ghost` (default) sets the ordinal in muted ink; `pill` is an ink chip; side-number and step pill use an accent chip. `stat` base is ink type, the `bar` variant adds a heavy accent rule under the figure.
- **Chrome.** Handle at header start, meta at header end, counter centre, swipe at footer end. The save pill is a sharp ink rectangle with a drawn ribbon; it shows on the cta slide only.
- **Cover.** Hero 120–180 px (target 150), headline width 65–85%, start-aligned, top anchored.
- **Variants (first = default).** cover `top number center` · item `ghost-number base side-number` · step `ghost-number base pill` · stat `bar base` · compare `columns versus stacked` · myth-fact `columns stacked` · checklist `ruled base boxes` · cta `pill base keyword` (rest in `preset.json`).
- **Motion.** Default `highlight-sweep`; allowed `calm counter highlight-sweep reorder stamp map-dots drop-clock curtain zoom notify split`. Opinion → `highlight-sweep`, numbered lists → `counter`, framework or chaos-to-order → `reorder`.
- **Avoid.** Card-heavy content (it has almost no cards) and pastel brand accents (the highlight block needs a strong fill).

### creator (صانع المحتوى)
- **Concept.** The whole slide is a white sticker on warm paper: 4 px ink border, 44 px radius, a hard shadow falling to the end side, a yellow sticker on the corner. Inside, ink type and yellow only.
- **Signature.** Grain on the paper margin, a yellow dot with an ink ring before the handle, outlined chips for kicker, ordinal and counter, cream cards for body, sides and quotes.
- **Emphasis.** `marker` (default): a rounded accent block with a small hard shadow. `bar` is the square version; `underline` and `color` also implemented (`color` lets the resolver darken the yellow).
- **Numbering.** `pill` (default): a circled accent badge. The `stat` `bar` variant puts the whole figure on a large accent bar.
- **Chrome.** Same slots as swiss. The save pill is an accent pill with a 3 px ink border, a hard shadow and a drawn ribbon.
- **Photo.** `cover/photo` and `poster/photo` put the headline in a white box so it never depends on the image; quote and testimonial `photo` use the card.
- **Variants.** cover `top photo split number` · item `side-number base ghost-number media` · step `pill base ghost-number` · compare `versus columns stacked` · myth-fact `stamp stacked columns` · checklist `boxes base ruled` · cta `keyword pill base`.
- **Motion.** Default `highlight-sweep`; allowed `calm counter highlight-sweep stamp story map-dots drop-clock curtain zoom notify split`. Number-led lists → `counter`; a personal story → `story`.
- **Avoid.** Dark brand backgrounds (the card is the surface); very long titles (the card adds padding).

### notebook (دفتر ملاحظات)
- **Concept.** A lined page you would keep. Handwriting for headlines, a plain sans for body.
- **Signature.** Pale ruled lines every 72 px, a double red margin line and three punched holes on the binding edge (the right in Arabic, the left in English), soft paper vignette, sticky notes with a strip of tape, hand-drawn uneven radii.
- **Emphasis.** `underline` (default): a **red double underline** painted as hard-stop gradient bands on the emphasis span; the text stays ink. `bar`, `marker` and `color` also exist.
- **Numbering.** `pill` (default): the number circled in red pen. Check boxes are hand-drawn squares with a red tick; plain lists use short red dashes.
- **Chrome.** Counter in a thin circle, handle with a red underline, the save pill is a paper label with a red ribbon.
- **Variants.** item `base side-number ghost-number` · step `pill base ghost-number` · checklist `boxes ruled base` · setup `cards base` · compare `columns stacked versus`.
- **Motion.** Default `highlight-sweep`; allowed `calm reorder highlight-sweep counter stamp map-dots drop-clock curtain zoom notify split`. Steps and checklists → `reorder`; the underline draws in with `highlight-sweep`.
- **Avoid.** Formal or financial topics; the hand is friendly by design.
- **Art and tones (inner slides).** Pen on paper: 2 px round strokes drawn twice (retrace), wobble 0.6, tilt at most 3°, hand annotations in Playpen 400, marks `arrow circle underline strike doodle tick`, a stamp badge, the page tab as motif. Supports marker green `#2E8B57` and highlighter amber `#F4B63F`. `field` puts the paper on the `accent2` ground (kraft in the preset palette) with a taped sheet; `invert` is the ink page. The rail is tally marks, the current one in red; the footer sits in the shared band, as in creator and poster.

### poster (بوستر)
- **Concept.** A printed sheet: cream paper, a double frame with four rust diamonds (the frame and every diamond sit inside the safe box, so the 4:5 crop and the profile grid keep them whole), a rust-and-ink double rule under the header and above the footer, centre-aligned covers and headings, and title and body of the working slides (item, step, story beat, setup, proof, quote, testimonial) at the start edge.
- **Signature.** Rust kicker pill, label tabs that sit on the border of each compare or myth-fact panel, rust diamond bullets, a matted print frame for media, a double-outline button.
- **Emphasis.** `color` (default): the key word in rust (the resolver guarantees the contrast). `bar`, `marker` and `underline` also exist.
- **Numbering.** `plain`: rust numerals when emphasis is colour. `stat` base is large numerals; the `bar` variant adds a double rule.
- **Chrome.** Counter between two rules, the save pill is a green capsule in a double ring (cta slide only).
- **Variants.** item `side-number base ghost-number` · stat `bar base` · compare `versus columns stacked` · myth-fact `stamp columns stacked` · checklist `ruled boxes base` · quote `base mark`.
- **Motion.** Default `highlight-sweep`; allowed `calm counter stamp highlight-sweep story map-dots drop-clock curtain zoom notify split`. A verdict or myth-fact → `stamp`; a number → `counter`.
- **Avoid.** More than one emphasis per slide (rust competes with the rules); a three-line cover of short words in the `top` variant (the hero cannot fill the sheet: use `number` or `center`).

### interface (واجهة) · held back, not in this release
- **Concept.** The slide is a screen. A white window with rounded corners and a title bar sits on a dotted desktop with two sheets stacked beneath it.
- **Signature.** The title bar holds three muted dots and the **handle as an address pill with a coloured dot**; chips, buttons and nested cards use 12–24 px radii; check boxes are filled rounded squares with a tick; quotes are speech bubbles.
- **Emphasis.** `marker` (default): a rounded accent chip behind the word. `bar`, `underline`, `color` also exist.
- **Numbering.** `pill`: a small accent chip. `stat` bar: an accent progress rule under the figure.
- **Chrome.** `meta` sits at header centre. Footer: save pill (accent button), counter chip, swipe as an outlined button.
- **Variants.** item `base side-number media` · step `pill base` · checklist `boxes ruled base` · setup `cards base` · compare `columns versus stacked` · proof `screenshot base`.
- **Motion.** Default `highlight-sweep`; allowed `calm reorder counter highlight-sweep map-dots drop-clock curtain zoom notify split`. Steps and tool lists → `reorder`.
- **Avoid.** Full-bleed photos (the window is part of the design).

### heritage (تراثي) · held back, not in this release
- **Concept.** Calm, ornamental and centred. Deep green with a gentle gradient, gold for the keyword and every ornament.
- **Signature.** An eight-point star lattice that fades toward the text from the top end and bottom start corners, a soft gold disc and rings in the same corners, ornamental hairlines (a diamond at the centre) under the header and above the footer, diamond bullets and counter marks, arch-topped panels and media.
- **Emphasis.** `color` (default) is gold. `bar`, `marker` and `underline` also exist.
- **Kashida.** The only preset that allows it: at most one headline word, between joining letters, never in body text. Gold when emphasis is colour. Set through `kashidaWord` on the slide.
- **Numbering.** `plain`: the numeral between two gold diamonds. `pill`: a gold capsule.
- **Chrome.** Counter between gold diamonds, the save pill is a gold capsule in a thin ring.
- **Variants.** cover `top center` · item `base side-number media` · compare `columns stacked versus` · checklist `ruled boxes base` · quote `mark base`. There is no `photo` variant: text never sits on an image here.
- **Motion.** Default `highlight-sweep`; allowed `calm story highlight-sweep stamp counter map-dots drop-clock curtain zoom notify split`. A story or a national-day post uses `story`.
- **Avoid.** Light brand palettes (the lattice and gold assume a dark field); more than one kashida word.

## 4. Rules every preset follows

- **One hero per slide** at 65–85% of the width (`layout.headlineWidth`), covers anchored to the top (heritage and poster centre the text, not the block), at most one emphasised span per slide.
- **Background + ink + one accent.** Accent is a fill, a rule or a ribbon. It becomes a text colour only when `decor.highlight` is `color`, where the resolver guarantees its contrast. `accent2` defaults to `accent` and no preset paints with it; it reaches a slide only through `{{accent2}}` in occasion artwork.
- **Persistent chrome** in fixed slots on every slide: handle (logo first when the brand has one), meta, counter, swipe cue, and a designed save pill on cover and cta. Footer items stay within 49 px; nothing in `decor.css` sets a text size.
- **Arabic rules are not preset choices.** No letter-spacing, justification, italics, synthesis or translucent text colours; Latin runs follow their Arabic neighbours in weight (body Latin takes the body weight); one digit system; kashida only where `decor.kashida.allowed`.
- **Procedural artwork only.** Textures and ornaments are SVG data URIs that use the six colour placeholders, so they recolour with the brand. No external image, filter, blend mode, mask property or animation.
- **Safe zones.** Frames, cards and windows sit inside the 1012 × 1350 safe box so the 4:5 crop and the profile grid keep them; decoration may bleed, text may not.

## 5. What can change per post

The user, the Studio or an occasion overlay may change: roles, fonts, the type scale, `layout.align`, `layout.coverAnchor`, `layout.headlineWidth`, `decor.highlight`, `decor.numbering`, `decor.texture`, `decor.motif`, `background.kind`, the counter format and the swipe style (closed set, contract 6.4). Every preset implements all of these values:

- `data-hl`: `bar` `underline` `marker` `color`, each in the preset's own language.
- `data-numbering`: `ghost` `pill` `plain`.
- `data-texture`: `grain` `ruled` `grid` `dots` `paper` `pattern` on `.cs-bg::before`; the default texture is `none` (swiss, poster), `grain` (creator), `ruled` (notebook), `dots` (interface), `pattern` (heritage). `pattern` is the preset's own signature: diagonal hatch, plus marks, engineering grid, fish-scale arcs, wireframe crosshairs, star lattice.
- `data-bgkind`: `gradient` (heritage default; the others use the resolver's `--cs-bg-image`), `paper` and `pattern` paint the artwork on `.cs-bg` itself so a texture can sit on top (notebook is `paper` + `ruled`).
- `data-dialect="en"` mirrors everything physical (shadows, binding edge, window dots, chevrons, bookmark side) so English slides are not a flipped Arabic slide.

**Fonts in the Studio.** The Style tab offers up to three font pairings on the user's own cover line: the style's own pairing first, then pairings built from the families embedded in the page (`fonts/registry.json`: a display face that covers Arabic, a body face and a Latin face, taken from each family's `roles` and `pairsWith`, display faces that list the style first, stock faces left out). A pick is written as the four `type.*.family` overrides of the post, and the style's own pairing clears them. The Brand Book offers the same pairings, stock faces included, and writes `visual.fonts` (display, body, latin). The default-look note (D7) never fires on a font the brand chose, because the brand's choice is recorded with the provenance "brand". With `build_studio.py --fonts current` only the current style's fonts are embedded, so the picker may show fewer than three pairings or none.

`.cs-decor` itself carries no background in any preset, so an occasion pack can paint its motif there; presets use only its `::before` and `::after`.

## 6. Notes for the engine, painters and Studio

- **Assumed archetype CSS:** `box-sizing: border-box` and zeroed margins and padding inside `.cs-slide`; lists without markers; `.cs-slide` clips (`overflow: hidden`); footer and header items are laid out as flex items of fixed height `var(--cs-footer-item-h)`. Presets paint and size, they do not lay out.
- **Painter-sensitive features** (the painter parity tests cover them): hard-stop gradients as backgrounds of inline `mark` (notebook underline), block backgrounds and a hard `box-shadow` on inline `mark` (creator), per-corner radii, 45° and small rotations on pseudo-elements, SVG data-URI backgrounds with `pattern`, `mask` and gradients inside the image, one blurred shadow with group opacity (interface window), `background` shorthand with an image and a colour. If a painter cannot draw one, remove that rule from `decor.css` rather than adding a painter special case.
- **Properties beyond the contract's allow-list**: `line-height` on footer chips and pills only, so their text centres in the fixed 49 px box. Nothing else.
- **Fonts and weights.** Static families need these files: IBM Plex Sans Arabic 700; IBM Plex Sans 400 and 700. The others are variable and cover every weight used (Readex Pro up to 700, Playpen Sans Arabic 700, Alexandria and Noto Kufi up to 800, Reem Kufi 600, El Messiri 500 and 700, Inter 400 and 700). Reem Kufi is display-grade: heritage uses it for headline-size type (cover, slide 2, share) and El Messiri bold for every title and quote.
- **Previews.** Each preset folder holds a `preview.png` rendered by the real engine (`render.mjs`); `styles/index.json` points at it, and `preset_lint.py` fails when the file is missing.

## 7. Adding a preset (poster editorial, v1.2 scrapbook, later occasion looks)

1. Copy a preset folder; set `id`, `version`, `ships`, names, `bestFor`, roles. Check every text pair with `scripts/preset_lint.py` (4.5:1 body, 3:1 large; on-accent included).
2. Choose type from the registry only; pick weights that exist as files; keep display line height at 1.3 or more and the hero range inside 96–180 px.
3. Write `decor.css` against the vocabulary in contract 5.1: every selector starts with `.cs-slide[data-preset="<id>"]`, colours only through `var(--cs-*)` or the SVG placeholders, opacity only on `.cs-bg` and `.cs-decor`. Implement all four highlights, all three numberings, all six textures and the English mirror.
4. List 1–4 variants per slide type, the first being the default, using only names from the archetype table; style every one you list.
5. Set `motion.allowed` to the shipped recipes that suit the look (default `highlight-sweep`, never `calm`) and say why in this file.
6. Run `preset_lint.py --all --write-index`, render the golden slides, add the preset to the Style tab's table above.

The cover's controls are:

| Control | Effect |
|---|---|
| `slide.variant: "top"` or `"center"` | Shared vertical anchors, including on Creator; other variants must be supported by the style. |
| `layout.align` | `start` or `center`, for text alignment. |
| `layout.coverAnchor` | Default cover anchor when no explicit cover variant is set. An explicit top/center variant wins. |
| `type.scale.hero` | Hero maximum as a number, or a range string such as `"120,180"`; fitting can shrink toward the quality floor. `heroTarget` does not set the fitted size; use `hero` for its maximum. |
| `type.scale.body` | Sub-line maximum as a number, or a nominal range string. Fitting may shrink it toward 42 px when space runs out. `h2` sizes heading slots; `small` sizes the kicker. They do not size the sub-line. |
| `type.display.family`, `.wght`, `.lh` | Hero font, weight and line height. Keep Arabic dots clear of the next Latin line; a larger line height costs vertical room. |
| `layout.headlineWidth` | A scalar range string such as `"0.65,0.85"`, relative to the content box. |
| `headline`, `sub`, `kicker`, literal `\n` | The creator's words and required breaks. An authored break is kept. |

Use these dotted paths in `style.overrides` or a cover's `overrides`. Overrides accept scalars only (string, number, boolean). Use `{"type.scale.body": 64}` or `{"type.scale.hero": "120,150"}`; an array such as `[120,150]` is rejected with the working string form. Run `python scripts/validate.py spec spec.json --format json` before building.

For a story cover, choose a symbol without changing the recipe: `spec.ext.coverSymbol` accepts `heartbeat`, `clock`, `dots`, `bars`, `coins`, `check` or `spark` (the live list is `Object.keys(CS.motion.metaphors)`). The normal exporter forwards the choice through `CS.motion.recommend(spec).metaphor`; direct callers pass `CS.motion.build(el, {recipe: "story", metaphor: "clock"})`. An unknown symbol is rejected with the allowed values. Stamp draws its ring around emphasis, a numeral or the first word, including an unmarked headline. Stamp, sweep, story and counter retain readable hero copy through reset and rebuild; header/footer decoration alone does not count as visible cover content. A centered story reserves a clear band for its symbol and reveals later text after the symbol leaves. When no band of at least 80 px is available, it reports `E_FIT_OVERFLOW`: use another recipe or reduce the title height.

## 8. Shared picture variants and cover marks
All six styles support `media` on `step`, `checklist`, `summary`, `cta` and `offer`; registry registration appends it after each style's existing defaults. These are picture-led stacks with no centring spacers, the same fit pipeline and a 360–400 px picture floor depending on canvas height. The per-style mat keeps the style's own outline, corners and shadow. Keep the semantic type and `ord`, shorten copy to give the picture room, and measure through `plates.mjs slots`.

The optional `cover.logo` is a separate creator-supplied asset, contained on a light or dark solid ground. It is fixed at 176 x 80 px including its padding, near the kicker in the body area. Alignment: swiss/creator/poster start, notebook/interface end, heritage center. It never joins the background plate or changes the brand's persistent logo. Review the supplied mark at feed size and 130 px before approval. It remains in the cover-video composition; the creator supplies the artwork and its rights.

Picture-led variants use the normal `h2` heading role and its floors. Summary and offer bullets use two columns, leaving room for a closing CTA without reducing type floors. The picture floor is 400 px on the 1440 px canvas and 360 px on the shorter canvas, above the proof mat's 352 px floor; actual frames grow with available room.
