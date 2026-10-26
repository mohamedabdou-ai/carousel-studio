# Design system

Engine limits and stricter team design targets: you need it to explain results, choose presets and overrides, and fix specs. Numbers are the values of `data/platform-instagram.json` (single source: change them there, never in a spec). Sizes are CSS px on the 1080-wide canvas.

## 1. Canvas and zones
Design canvas `ig-3x4` is **1080×1440**. In-app export keeps 3:4; schedulers and the API need a 4:5 JPEG, which is a centre crop of the same design.

| Zone | Box (x, y, w, h) | Rule |
|---|---|---|
| Canvas | 0, 0, 1080, 1440 | decoration may bleed past any edge; text may not |
| 4:5 crop | 0, 45, 1080, 1350 | scheduler and API export (rows 45–1395) |
| Safe box | 34, 45, 1012, 1350 | survives the 4:5 crop and the 3:4 profile grid; every essential element lives inside, **frames and corner ornaments included** (a diamond centred on a frame corner needs its whole 40 px inside the box, or the 4:5 export slices it in half) |
| Content box | 114, 125, 852, 1190 | all text; 80 px inside the safe box on every side |
| Header band | 114, 165, 852, 80 | handle or logo (start), meta label (end); starts below the top pill zone (y 155) |
| Footer bands | cover: 114,1165,852,80; inner: 174,1275,732,80 | items ≤49 px; inner band narrows to clear corner keep-outs |
| Body area | 114,261,852,888 cover; height 998 inner | 16 px clear of header/footer |
| Keep-outs | 34,45,200×110 · 846,45,200×110 · 34,1255,140×140 · 906,1255,140×140 | measured from the safe-box corners (top pill zone y 45–155, bottom tag zone y 1255–1395): Instagram's counter pill and tag icon in the 3:4 view and in the 4:5 crop; text never touches them |

Grid: 12 columns of 56 px with 16 px gutters (848 px, centred in the 852 px content box), 8 px baseline, mirrored for RTL. Positions are logical (start/end), so the same CSS serves Arabic and English.

Other canvases (`ig-4x5`, story, LinkedIn PDF, TikTok photo) exist as dormant presets in the data; v1 designs on `ig-3x4` only. When the first item of an Instagram carousel is 3:4, the whole carousel stays 3:4; mixing ratios makes Instagram crop everything to the first item.

## 2. Type scale and fit
| Role | Size | Notes |
|---|---|---|
| Cover hero | 120–180, engine target 150 | floor 96 (D3 BLOCK); final target ≥14 px at 130 px (≈117 canvas px, T1 FIX below) |
| h1 | up to 88 | rehook, share, cta, offer headings |
| h2 | up to 72 | quote body |
| Title | 64–72 | at most 6 words |
| Body | 44–48 | floor 42 (BLOCK below) |
| Small | 34 | kicker, bridge, labels |
| Micro | 30 | chrome only (handle, counter, meta); floor 30 |

Line height: display 1.3, headings 1.35, body 1.6; add 0.15 (display) or 0.2 (body) on a text slot that carries tashkeel. A slot is fitted by the largest size that fits its box, avoids the keep-outs, stays within its line limit (hero 3, h1 3, title 3, body 6, other 2), leaves no lone last word and keeps lines balanced. If nothing fits above the floor the slide must be split or shortened; never shrink below a floor. At most two families plus one Latin face per design.

## 3. Colour
Background + ink + **one accent** (one more at most). On 7 inner slides: invert/s1/s2 ≥2; accent blocks ≤4. The accent marks the keyword or the number and nothing else; at most one highlight per slide. Contrast is measured with the text-mask method on the worst-decile background under each text box: 4.5:1 for body, 3:1 for text of 66 px or more (52 px bold). Below 3:1 is a BLOCK; 3–4.5 is a FIX. The engine fixes failures by shifting the foreground's OKLCH lightness (hue kept) or adding a scrim, and records why (`layer-model.md`, «ليه اللون ده؟»). Text over photos always needs a calm zone, a scrim or a text box.

## 4. Composition (from the 40-cover study)
- One hero, 65–85% width; paragraphs start-aligned. Body ≤18 with card/field; ≤25 only in text-led D (hero ≥64 px). Neighbour skeletons differ; A ≤3/7. Cover band ≥15% or hero <14 px at 130: try supported `center`, `number`, `split`; all shipped presets fail → shorter hook. Working band <12%; rollout in qa-gates.md.
- Cover: hero at most 6 words, the whole cover at most 12, at most 3 lines, meaning word first, one specific gap left open. A numeral in line 1 leads on lists, as a Western digit.
- Slide 2 is a second cover: it keeps the chrome, font and background family, pays off at once, and never introduces the author or the agenda. It must stand alone in 12 words.
- Chrome drift >2 px **within its own band** is a BLOCK. `geometry.inner` and `registry.geometry({inner:true})` lower inner footers 110 px and narrow them; y≈1190/1300 centres are not a drift finding. Unifying bands changes body space/keep-outs and needs the coordinator's visual suite. Counter «{i} من {n}» in the brand's digits; the last slide has no swipe cue. When the cue shows a word (an arrow cue) the word becomes «باقي {k}» on the last two slides; with the neutral cue there is no word and the counter carries the progress.
- **One ask per slide.** The designed save pill appears on the final slide only (the cover's one job is the stop, and a pill there is an early second ask). The final slide says its ask once in words (cta archetype): the title asks, the button gives the reason, and the button carries no arrow for a save, a send or a question (an arrow points at a slide that is not there; a follow or a keyword DM keeps one). A share slide («ابعتها لواحد…») comes before a send-type call to action.
- Heavy modern sans or geometric kufi faces with open counters read best at thumbnail size; thin naskh and handwriting only when large.

## 5. Swipe cue and counter (Q24)
Instagram mirrors a carousel by the viewer's app language, so the cue follows the **audience's app language**, a brand setting with a reason shown in the Studio.

| `appLanguage` | `swipeCue` | On the slide |
|---|---|---|
| `ar` | `arrow-rtl` | «اسحب ←» (next slide is on the left) |
| `en` | `arrow-ltr` | «اسحب →» / "Swipe →" |
| `mixed` (UAE, Lebanon, Maghreb audiences) | `neutral` | counter only, no arrow or edge cards |

Panoramas are opt-in and force an explicit direction choice, with a warning that Arabic-UI viewers see slide 2 on the left. Phone confirmation of the mirroring is still pending (SP8), which is why the cue is a setting and not a constant.

## 6. Imagery
Icons never bare; icon-in-container ≤1/post, only for its noun. Bridge: `--cs-fs-small` (34px), weight 700, `--cs-ink`; free root end padding 32px.
A slide's `media.slot` is `none`, `icon`, `photo`, `cutout`, `plate`, `screenshot` or `ui`. Plates are generated, text-free images: they sit under a declared calm zone (`top`, `bottom`, `start`, `end`, `center`) and carry `ai: true`; the asset needs `aiGenerated: true`. Screenshots of other people's posts and third-party logos or watermarks are flagged. Photos of people: only with the right to use them.

## 7. Anti-patterns the engine blocks or warns about
Tiny headline dwarfed by a mock-up · English-only cover on an Arabic account · truncated copy · a single word alone on the last line · a «لـ» stranded from its Latin word · a number separated from its noun («3000سعرة» glued, «5 / ساعات» split) · overlapping lines · a wall of text on a cover · text touching an edge · a ratio other than the first item's · hamza slips · visible AI watermarks · a re-compressed upload.

## 8. Quick map from symptom to gate
Small text → D3 · wrong ratio → D1 · generic look → D7 · crowding → C2, D6 · static cover → V1 · random structure → C5, C6 · repeated call to action → C7 · unreadable at 130 px → T1 · digits mixed → N1 · stranded LTR run → B1 · text over a busy photo → D4.
