# Layer model: how a look is resolved

One pipeline combines preset, brand and occasion, then corrects colour failures. The engine does this in `CS.core.resolve`; this page tells you what to put in the spec and how to explain the result.

```
preset defaults  <-  brand (bound roles, locks)  <-  occasion overlay (allowed keys only)
                 <-  post overrides  <-  slide overrides / variant   ->   floors (last)
```

## 1. The layers
1. **Preset** (`styles/<id>/preset.json` + `decor.css`): structure and look: roles (`bg surface ink inkMuted accent accent2`), type families and scale, alignment, background kind, decoration (highlight, numbering, texture, kashida), chrome slots, variants per slide type, allowed motion, floors. Three presets ship: `creator notebook poster`. A new look is tokens + `decor.css` + variant flags, never a new layout.
2. **Brand** (`brand.json`): fills only the roles the preset lists in `brandBindings`. If `fonts` is bound and the brand names a registry font, the brand's display, body and Latin families replace the preset's (weights stay). `visual.locks` lists token paths the brand protects against overlays and overrides (for example `roles.accent`).
3. **Occasion overlay** (`spec.style.occasionId`): data only. A pack may set `roles.accent2`, `background.texture` and `decor.motif`, nothing else, and only if it is allowed for the preset (`presetsAllowed`) and the path is not locked. It can never touch the logo, the primary font, the handle or a locked key. No pack ships yet; without an installed pack a plan says so and the post keeps brand styling.
4. **Post overrides** (`spec.style.overrides`) and 5. **slide overrides** (`slide.overrides`, then `slide.variant`): a map of dotted paths to values. The allowed paths are a closed set:
   `roles.{bg,surface,ink,inkMuted,accent,accent2}` · `type.{display,heading,body}.{family,wght,lh}` · `type.latin.{family,wght}` · `type.scale.{hero,heroTarget,h1,h2,title,body,small,micro}` · `layout.{align,coverAnchor,headlineWidth}` · `decor.{highlight,numbering,texture,motif}` · `background.kind` · `chrome.counter.format` · `chrome.swipe.style`.
   Locked or unknown paths are ignored and logged.
6. **Floors apply last.** Sizes never go below the floors (hero 96, body 42, meta 30). Text pairs `ink/bg`, `ink/surface`, `inkMuted/bg` must reach 4.5:1; the accent used as text must reach 4.5:1 (3:1 for large text); text on an accent fill likewise. A failing foreground is moved by changing only its OKLCH lightness (hue kept) and the change is logged.
7. Derived solids (`onAccent`, hairlines, scrim colours), the flat `--cs-*` variable map and per-token provenance are built; approval stores the result as `tokensHash` and freezes line breaks.

## 2. What to write in a spec
- `style.presetId`: `"<id>@<major.minor>"`, for example `"creator@1.0"`. Pick the id from the brand's `visual.presetId` or the user's choice in the Style tab; offer the two `presetAlternates` as alternatives.
- `style.overrides`: only what the user asked for, for example `{"roles.accent": "#E3262B"}`. Do not copy brand values here; the brand layer already applies them.
- `slide.variant`: one of the variants the preset styles for that slide type (the first one listed is the default); anything else falls back to the default and is logged.
- Never put opacity, letter-spacing, italic, blur or blend settings anywhere: they are not in the closed set and the paintable subset forbids them.

## 3. Explaining a result («ليه اللون ده؟»)
`CS.core.resolve.explain(tokens, path)` returns the winning layer and the steps. Typical answers, in the user's dialect:
- «اللون ده من البراند بتاعك» (provenance `brand`).
- «غيّرنا درجة الفاتح/الغامق بس، والنغمة زي ما هي، عشان التباين يبقى 4.5 على الأقل» (adjustment `contrast`, hue kept).
- «الحجم ده أصغر حد مسموح، لو النص أطول قسّمه لسلايدين» (adjustment `floor`).
- The overlay never changed your logo, main font or handle; if the user wants a colour kept, add its path to `visual.locks`.

## 4. Typical requests
| User says | Do |
|---|---|
| «غيّر الستايل» | set `style.presetId` to another v1 preset; rebuild; the Style tab already renders all shipped presets on the user's own hook |
| «خلّي اللون الأساسي كذا» | `style.overrides["roles.accent"]` (or update the brand if it should apply to every post) |
| «اللون ثابت ومايتغيرش» | add the path to `brand.visual.locks` |
| «ستايل رمضان / المناسبة» | set `style.occasionId` only if the pack is installed; otherwise say none is installed yet and keep brand styling |
| «خلّي الخط كذا» | only registry fonts that cover the copy; a user-uploaded font stays local (`arabic-type.md`) |

## 5. Never
- Never edit `decor.css`, the archetype partials or the rules from a post. Looks are shipped data; per-post changes go through the closed override set.
- Never mix two presets in one post (slide overrides can nudge tokens, not change the preset).
- Never override a floor.

## 6. Picture and logo slots
Pictures resolve from `spec.assets` through the same media filler in both the Studio and local engine. `step`, `checklist`, `summary`, `cta` and `offer` have a `media` variant in every style; a numbered step keeps its semantic type and ordinal. A free slide positions its own empty `data-picture` placeholder instead of using `slide.media`.

`spec.cover.logo.assetId` is a post-specific product or partner mark. It uses its style's bounded slot and a light or dark ground, separate from `brand.visual.logo` and the main cover media. It is not a palette override or an occasion decoration. Nothing is bundled: the creator supplies the asset and is responsible for usage rights. Still and video paint the same image element.
