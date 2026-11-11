# Plate prompts: writing a prompt card

A **plate** is a text-free illustration or background. The engine typesets every letter. An illustration usually sits in its own measured frame beside the copy; a full-canvas background is a different composition. Write the prompt in English as one paragraph built from the card below, and keep the card keyed by its prompt id.

Before writing any card, request carousel-design's `plates.mjs slots --dir POST --format json` using the current text and style. Keep the slide id, resolved variant, pixel dimensions, ratio and subject band with the card. Resolve an unsupported/free layout before generating. A guessed ratio is a provisional prompt only.

## 1. The card
| Part | What to write |
|---|---|
| Subject and composition | one concrete subject, where it sits, camera distance; nothing that normally carries writing |
| Safe subject band | central 55% of image height, at least 8% clear at each side; backgrounds also reserve the negative space from `data/zones.json` |
| Palette | the brand's colours as words (§2), 2–3 colours, plus the hex in brackets |
| Light, lens, grain | per preset (§3) |
| Ratio | the measured picture frame's ratio and pixel dimensions; landscape strips need a wide low composition |
| Seed | one seed for every plate of the post, so the set looks related |
| Look | raw and unpolished (§5) |
| Avoid | the cultural list from `sensitivities.md` and the object list in §6 |
| Closing clause | always: "No text, no letters, no numbers, no logos, no watermark." |

`zones.json` is a background negative-space guide, not a media-support catalogue. For illustrations use the frame report. `proof` (`screenshot` or `base`, slot `screenshot`) contains the whole picture in a mat; a generated illustration here must never claim to document a real result. Cover/poster `split` with `photo` crops to a strip when the preset supports it. Current engine templates also offer media on step, checklist, CTA and other types: measure the frame and retain the semantic type. Free layouts ignore media and cannot contain images; choosing an engine layout is explicit. Apply records `calmZone: "bottom"`, never `none`, satisfying A1.calm-zone.

Text-heavy slides (`item`, `step`, `story-beat`, `grid`, `timeline`) can use a quiet texture for a full-canvas background. Their illustration frames still take the measured subject composition; a texture recommendation does not disable a native media slot.

## 2. Brand colours as words
Describe colours in words and give the hex in brackets: models read words reliably and hex only sometimes. Read hue, lightness and chroma by eye (or from the OKLCH values of the brand palette) and name them like this:

| Hue (OKLCH degrees) | Word | | Lightness | Word | | Chroma | Word |
|---|---|---|---|---|---|---|---|
| 20–40 | red | | below 0.25 | near-black | | below 0.03 | neutral, grey |
| 50–70 | orange, terracotta | | 0.25–0.45 | deep | | 0.03–0.08 | muted |
| 80–95 | gold, amber | | 0.45–0.65 | mid | | 0.08–0.15 | rich |
| 100–125 | yellow, olive | | 0.65–0.85 | soft, light | | above 0.15 | vivid |
| 130–160 | green | | above 0.85 | pale, cream | | | |
| 175–210 | teal, turquoise | | | | | | |
| 230–260 | blue | | | | | | |
| 270–300 | indigo, violet | | | | | | |
| 330–360 | pink, magenta | | | | | | |

"Deep muted teal (#0E3B43), warm gold (#C9A227), cream (#F3EBDD)" is a good palette phrase. The background of the slide stays the preset's, so keep plate colours inside the palette; an off-palette plate fails contrast and the "one accent" rule.

## 3. Per preset (light, lens, grain, use)
| Preset | Plate use | Light and lens | Grain and texture | Subject ideas |
|---|---|---|---|---|
| `creator` | framed illustration or scene, or background behind a cutout | soft studio window light, 50 mm | light film grain | a plain wall, a desk corner, a blurred workspace |
| `notebook` | paper texture for backgrounds, a contained illustration for picture frames | top-down daylight | paper fibres, desk wood | ruled or grid paper, kraft paper, a desk surface with nothing on it |
| `poster` | contained illustration or a measured picture strip | even daylight, slightly high angle | clean, matte | simple objects arranged like a chart, fruit, tools, shapes |

## 4. Subjects that work, subjects that fail
Works: textures, soft gradients, interiors without writing, landscapes, objects on plain surfaces, hands and tools without labels, abstract geometric Arabic-inspired patterns, silhouettes.
Fails: people's faces in close-up (uncanny, rights), crowds, anything with visible writing (signs, screens, packaging, books, posters, newspapers, labels, licence plates, shop fronts, banknotes, clothing prints), calligraphy-like marks (models fabricate pseudo-Arabic), logos, brands, maps, flags, real places that are identifiable and sensitive.

## 5. A raw look, not glossy stock
Ask for candid, natural, slightly imperfect pictures: "natural light, subtle film grain, honest colours, no HDR look, no glossy 3D render look, no plastic skin, no lens flare". The prevailing taste of 2025–26 favours unpolished imagery over generic stock gloss, and a raw plate also keeps text readable.

## 6. Closing clause and objects to exclude
End every prompt with: **No text, no letters, no numbers, no logos, no watermark.** Add "no signage, no screens showing text, no book pages, no packaging, no calligraphy, no pseudo-writing" whenever the scene could hold any. Never describe what the text on the slide says; the model must not know it.

## 7. Ratio, size and crop
Ask for the frame's actual ratio. For example, if the report says 2.18:1: "Wide low landscape composition, 2.18:1. Entire subject within the central 55% horizontal band, with at least 8% empty space at the left and right; quiet matching background above and below." These are example dimensions, not a preset constant. Text length, title, variant and style all change the frame.

If the tool offers only fixed ratios, choose the closest, retaining the subject band. Carousel-design fits the original through canvas: crop with gravity/focus when the subject survives; otherwise extend edge colours with subtle seeded grain. Supply a normalized focus box for a tall subject; force `mode: "pad"` to preserve the entire image. Flip is optional for RTL composition; do not flip a real product whose orientation matters. Never stretch or crop away a watermark. A full-canvas background/video plate may still be 3:4; a picture strip is not.

## 8. One look across the post
Use one seed, one palette phrase, one light/lens/grain phrase for every plate of the post and change only the subject. To correct a plate, change one variable at a time (the subject, the calm-zone wording, or the light) and keep the seed. If the calm zone is busy: say "empty", "minimal", "smooth" and name the proportion again; if the subject sits in the wrong place: restate it ("at the bottom edge, small").

## 9. Example card: a measured illustration frame, id `p1`
```
Slide/frame: s03, proof/screenshot; this example's slots report measured 816x374 px, 2.1818:1.
Subject: a plain unlabelled ceramic cup and a small leaf on a low surface.
Composition: wide low landscape; the entire subject within the central 55% horizontal band, with at least 8% clear at each side. Quiet matching background beyond it.
Palette: deep muted teal (#0E3B43), warm gold (#C9A227), cream (#F3EBDD).
Light/lens/grain: warm low-angle light, 35 mm, visible film grain, subtle plaster texture.
Ratio: 2.1818:1, request the closest supported landscape output. Seed: 4821.
Look: candid, natural, slightly imperfect; no HDR look, no glossy 3D render look.
Avoid: people, flags, mosque or Kaaba imagery, maps, signage, calligraphy.
Closing: No text, no letters, no numbers, no logos, no watermark.
```
Join Subject, Composition, Palette, Light, Look, Avoid and Closing. Ratio and seed also go in the tool's parameters when available. Use the actual report's values, not this example's.

## 10. Product pictures
Cut out the **real** product with `image.cutout`, generate a background plate that matches its light (an empty surface, calm zone where the text goes), then combine them with the tool's edit or reference-image feature, or in any editor, and drop the flattened PNG as the slide's `cutout` or `photo`. Never let a model redraw the product; compare the result with the real photo (shape, colour, packaging) before using it.

## 11. After the result
Run the A1 inspection in `ingress.md`, then record its dated confirmation in the manifest once. Hand the original and record to carousel-design: manifest → apply → check → render. Keep originals and prompts for restyle; never reconstruct them from the reduced embedded JPEG.
