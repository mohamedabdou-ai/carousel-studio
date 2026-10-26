---
description: فتح الاستوديو وتصدير البوست · Open the Studio and export
argument-hint: "[صدّر]"
---

Work with the Studio through the `carousel-design` skill. Arguments: $ARGUMENTS

- Read the arguments as words: nothing, «افتح» or `open` opens; «صدّر», «جهّز للنشر» or `export` exports; `render` is the local lane.
- `open` (the default) builds the Studio page from the current `spec.json` and brand, validates first, publishes it and gives the user the link. Guided posts open in Script view; fast posts open in Design view.
- `export` guides the user through «جهّز للنشر» in the Studio: quality check, then «حزمة النشر» and «احفظ في الصور». Say what is blocking when a gate fails.
- `render`: `scripts/render.mjs` builds the kit with internal H.264 by default. Check Node 22+, Chrome/Edge and playwright-core; report missing tools. HyperFrames only with `--video hyperframes` (npm and FFmpeg); no download prompt.
- If no spec exists yet, hand over to `carousel-create` instead of building an empty page.

Same thing in plain words: «افتح الاستوديو» · «صمّم» · «صدّر» · «جهّز للنشر» · "open the Studio".
