# `src/core` — the engine (B2)

Plain ES2020 scripts, no modules. `manifest.json` lists the files; `tools/build.mjs` concatenates them after `src/lib/` into the one chunk
`runtime/cs-core.js` (contract 4.0). Everything hangs off `CS.core`; nothing here redefines what `src/lib/` provides
(`text`, `color`, `canon`, `schema`, `patch`, `format`, `CS.CSError`, `CS.emit`, `CS.util`).

| File | Provides | One line |
|---|---|---|
| `registry.js` | `CS.core.registry`, `CS.core.constants` | page blocks, presets + decor CSS, occasions, fonts + glyph coverage, the archetype templates, rule data, canvas geometry |
| `resolve.js` | `CS.core.resolve` | preset ← brand ← occasion ← post ← slide → floors; provenance, adjustments, `explain` |
| `compose.js` | `CS.core.compose` | spec slide → `.cs-slide` DOM: archetype slots, chrome, text pipeline (punctuation, bidi isolation, digits, kashida) |
| `fit.js` | `CS.core.fit` | largest whole-pixel size per slot, in priority order; word-box line measurement; `.cs-ln` line blocks |
| `freeze.js` | `CS.core.freeze` | capture / apply / verify the approved layout |
| `render.js` | `CS.core.render` | `slide`, `deck`, `update`: resolve → compose → fonts → fit or frozen layout → events |
| `spec.js` | `CS.core.spec` | pure, immutable helpers on `spec.json` |
| `ready.js` | `CS.core.ready` | fonts, images, two animation frames, `window.__csReady` |
| `boot.js` | `CS.core.boot` | `loadPage` + schemas + light spec check + fonts |

The layout CSS and the `<template>` partials live in `plugins/carousel-studio/skills/carousel-design/templates/archetypes.html`.

## What the engine adds to the contract (all additive)

API: `registry.readBlock`, `hasPreset`, `hasFont`, `fontEntry`, `fontIds`, `presetRoles`, `geometry(canvasHeight)`, `decorLocal(presetId, roles)`;
`resolve.variantFor`, `resolve.OVERRIDE_PATHS`; `fit.rangeFor`, `fit.wrapLinesBy`; `compose.prepare`; `ready.markReady`, `ready.checkAbort`; `spec.validate`.
`decorCss(presetId)` accepts only the preset id (as in the contract) and fills `{{accent}}`-style placeholders from the preset's own roles.

DOM, beyond the fixed vocabulary of contract 5.1 (attributes only, no new classes):

| Attribute | On | Meaning |
|---|---|---|
| `data-slot-key` `data-role` `data-index` | every fit slot | `s03.title`, role after variant mapping, index inside a list / sides |
| `data-fit="css"` | `.cs-ord` | sized by CSS (ghost / side numerals), not searched |
| `data-fit-widen` · `data-widened="1"` | cover / poster headline | may use the full content width when the preset width cannot hold it |
| `data-role-by-variant` · `data-max-lines-by-variant` | archetype templates | `big-word:hero`, `number:4`: role or line limit depends on the variant |
| `data-decor-key` + `<style data-cs-decor-local>` | slide root + last child | per-slide sheet of the decor rules that carry `{{colour}}` placeholders, so clones keep their exact colours |
| `data-pos="start\|center\|end"` | chrome items | grid column in the header or footer band |
| `data-ord` · `data-cta` · `data-vs` · `data-unit-join` | ord, cta, `.cs-sides`, number | ordinal value, CTA kind, "versus" label, figure + symbol unit isolated as one LTR run |
| `data-media-kind` · `data-media-state` · `data-asset` · `data-calm` · `data-ai` · `data-mirror` | `.cs-media-slot` | media description; `missing` when an asset id does not resolve |
| `data-logo` | `<img>` in `.cs-handle` | brand logo, never mirrored |

## Decisions worth knowing

* **Swipe label** on the last two slides before the end becomes «باقي {k} ←» (counter stays «{i} من {n}»); a neutral cue has no label, only the counter (1.1 adds a quiet progress rail).
* **Number role** (stat figure): size range `[1.5 × hero.min, 2 × hero.max]`, floor `floors.hero`.
* **Lone word**: the search for a clean last line never gives up more than 20 % of the size; then the slot keeps the larger size and reports `loneWord`.
* **4:5 canvas** is edge-relative: bands, keep-outs and the body keep their distance from the edges; only the body gets shorter.
* **Brand roles**: when a brand sets `bg` or `ink` but not `surface`, the surface is derived again instead of keeping the preset's literal (same for `accent2`).
* `spec.insertSlide / splitSlide` keep the high-water mark of slide ids in `ext.cs.slideIdMax`; positions are 0-based; caption arrays are not touched.

## Tests

```
node tests/unit/js/core/run.mjs                       # fixture presets, library stub (or src/lib when it exists)
node tests/unit/js/core/run.mjs --real-presets        # the six shipped presets of styles/index.json
node tests/unit/js/core/run.mjs --gallery out.png --gallery-query "types=cover,item&preset=swiss&big=1"   # every type x variant on one sheet
```

Needs a Chromium (`CHROME_PATH` or the Playwright cache); no npm packages.
