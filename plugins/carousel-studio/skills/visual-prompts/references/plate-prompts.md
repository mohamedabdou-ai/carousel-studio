# Plate prompts: writing a prompt card

A **plate** is a generated, text-free image that sits behind a slide's text. The type, handle, counter and every letter are drawn by the Studio on top; the plate only supplies mood, texture or a scene. Write the prompt in English (image models follow it best), as one paragraph built from the card below. The card, not the final paragraph, is what you save as the post's prompt id.

## 1. The card
| Part | What to write |
|---|---|
| Subject and composition | one concrete subject, where it sits, camera distance; nothing that normally carries writing |
| Calm zone | the phrase from `data/zones.json` for this preset and slide type, with its percentage |
| Palette | the brand's colours as words (§2), 2–3 colours, plus the hex in brackets |
| Light, lens, grain | per preset (§3) |
| Ratio | 3:4 portrait (1080×1440 or larger, same ratio) |
| Seed | one seed for every plate of the post, so the set looks related |
| Look | raw and unpolished (§5) |
| Avoid | the cultural list from `sensitivities.md` and the object list in §6 |
| Closing clause | always: "No text, no letters, no numbers, no logos, no watermark." |

Find the calm zone with `data/zones.json → presets.<preset>.<slide type>`. If the slide's `variant` (else the preset's default variant for that type) is listed under that row's `variants`, use the variant row. Take `phrase`, `zone`, `coverage`, `use` and `scrim`, and store `zone` in the slide's `media.calmZone`. Text-heavy slides (`item`, `step`, `story-beat`, `grid`, `timeline`) and the typographic presets take a texture, not a scene. Slide types without a row (no media slot) need no plate; a `proof` slide takes a real screenshot, never an AI image.

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
| `creator` | scene behind a cutout | soft studio window light, 50 mm | light film grain | a plain wall, a desk corner, a blurred workspace |
| `notebook` | texture only | top-down daylight | paper fibres, desk wood | ruled or grid paper, kraft paper, a desk surface with nothing on it |
| `poster` | scene along the bottom | even daylight, slightly high angle | clean, matte | simple objects arranged like a chart, fruit, tools, shapes |

## 4. Subjects that work, subjects that fail
Works: textures, soft gradients, interiors without writing, landscapes, objects on plain surfaces, hands and tools without labels, abstract geometric Arabic-inspired patterns, silhouettes.
Fails: people's faces in close-up (uncanny, rights), crowds, anything with visible writing (signs, screens, packaging, books, posters, newspapers, labels, licence plates, shop fronts, banknotes, clothing prints), calligraphy-like marks (models fabricate pseudo-Arabic), logos, brands, maps, flags, real places that are identifiable and sensitive.

## 5. A raw look, not glossy stock
Ask for candid, natural, slightly imperfect pictures: "natural light, subtle film grain, honest colours, no HDR look, no glossy 3D render look, no plastic skin, no lens flare". The prevailing taste of 2025–26 favours unpolished imagery over generic stock gloss, and a raw plate also keeps text readable.

## 6. Closing clause and objects to exclude
End every prompt with: **No text, no letters, no numbers, no logos, no watermark.** Add "no signage, no screens showing text, no book pages, no packaging, no calligraphy, no pseudo-writing" whenever the scene could hold any. Never describe what the text on the slide says; the model must not know it.

## 7. Ratio, size and crop
Ask for 3:4 portrait. Some tools only offer 1:1, 4:5 or 9:16: choose the closest and note the crop (the Studio crops with the calm zone in mind). Ask for at least 1080 px wide (2160 is better); if the result is smaller, run `image.upscale` once. 4:5 results are cropped to 3:4, so keep the subject away from the left and right edges.

## 8. One look across the post
Use one seed, one palette phrase, one light/lens/grain phrase for every plate of the post and change only the subject. To correct a plate, change one variable at a time (the subject, the calm-zone wording, or the light) and keep the seed. If the calm zone is busy: say "empty", "minimal", "smooth" and name the proportion again; if the subject sits in the wrong place: restate it ("at the bottom edge, small").

## 9. Example card: `poster` cover, id `p1`
```
Subject: a distant skyline of low sand-coloured buildings and a single palm silhouette at dusk, small, along the bottom edge of the frame.
Calm zone: the upper 55% of the frame is calm, low-detail negative space (a smooth tonal gradient, no objects, no high-contrast edges); the subject sits in the lower part.
Palette: deep muted teal (#0E3B43), warm gold (#C9A227), cream (#F3EBDD).
Light/lens/grain: warm low-angle light, 35 mm, visible film grain, subtle plaster texture.
Ratio: 3:4 portrait, 1080x1440 or larger. Seed: 4821.
Look: candid, natural, slightly imperfect; no HDR look, no glossy 3D render look.
Avoid: people, flags, mosque or Kaaba imagery, maps, signage, calligraphy.
Closing: No text, no letters, no numbers, no logos, no watermark.
```
Single paragraph sent to the tool: the same sentences joined, in the order Subject, Calm zone, Palette, Light, Look, Avoid, Closing; ratio and seed go in the tool's own parameters when it has them.

## 10. Product pictures
Cut out the **real** product with `image.cutout`, generate a background plate that matches its light (an empty surface, calm zone where the text goes), then combine them with the tool's edit or reference-image feature, or in any editor, and drop the flattened PNG as the slide's `cutout` or `photo`. Never let a model redraw the product; compare the result with the real photo (shape, colour, packaging) before using it.

## 11. After the result
Run the A1 checks in `ingress.md`: open the image, look for any letter, digit, logo or watermark (including a generator's corner mark), check the calm zone is calm and the subject is where the card said. Regenerate instead of retouching.
