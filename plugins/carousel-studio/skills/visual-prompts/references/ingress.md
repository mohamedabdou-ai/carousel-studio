# Ingress: from generated original to picture on a slide

Decide the picture slides, then request carousel-design's `plates.mjs slots` report before prompting. Generate through the creator's approved image tool, keep the originals, inspect them, write the manifest, apply and render. No ad-hoc image scripts or manual ratio measurements are needed.

## 1. Local lane: the durable manifest

Keep each result under the post folder's `plates/`, for example `plates/original-s03.png`. Download only the approved tool's returned result; never save its temporary URL. Originals stay untouched. PNG, JPEG and WebP are accepted. The script decodes, fits and encodes through the existing headless browser, with no imaging packages or FFmpeg.

After viewing the original and passing the inspection below, write `plates/plates.json`:

```json
{
  "version": 1,
  "plates": [{
    "slideId": "s03",
    "source": "original-s03.png",
    "mode": "auto",
    "gravity": "center",
    "flip": false,
    "promptId": "p3",
    "tool": "connected-image-tool",
    "textCheck": { "textChecked": true, "at": "2026-11-11T08:00:00Z" }
  }]
}
```

Use the actual inspection time, not the example timestamp. Sources are relative to `plates/`, never URLs, absolute paths or paths leaving that folder. Optional `focus: {"x": 0.1, "y": 0.15, "w": 0.8, "h": 0.7}` marks the subject in normalized coordinates of the unflipped original. Auto preserves that box; without focus it assumes the prompt's central 55% band and 8% side margins. Use `mode: "crop"` or `"pad"` to force the decision (`pad: true` is also accepted). Padding extends edge colours with subtle deterministic grain. Flip happens after fitting.

Keep engine types such as step, checklist and CTA when their measured frame works. A whole illustration usually uses `proof`, variant `screenshot` or `base`, slot `screenshot`. To leave a free layout, first choose the engine layout and ensure its canonical text fields contain all intended copy; add `"layout": {"type": "proof", "variant": "screenshot", "slot": "screenshot"}` to the row. This explicitly removes `free`; the tool does not translate handwritten HTML into copy or rewrite text. A cover keeps its `cover` type, often `split` with `photo` when the preset supports it.

Hand the manifest to carousel-design to run `plates.mjs apply --dir POST`, then `check` and render. It embeds JPEG data URIs below the schema's `ref.maxLength`, including header and base64 overhead, and writes width, height, bytes, aiGenerated, tool, promptId, media and `calmZone: "bottom"`. Local rendering cannot resolve `asset:<id>` without the hosted page's asset resolver, so local still pictures are embedded. Apply binds the confirmation to its original with `textCheck.sha256`; keep that field on replay.

After a spec rebuild run `apply` again. After text or style changes run `restyle` from the same originals. The manifest is the durable picture record and does not depend on a copy-edit ledger. Replacing an original requires another inspection and a new `textCheck` object; apply refuses a mismatching saved hash. Do not obtain a new confirmation merely by reusing an old timestamp.

## 2. One no-text confirmation (A1)

Open every original before recording its check. Look for letters in any script, digits, pseudo-writing, logos, signage, text on screens or packaging, a generator's corner mark or watermark. Check the subject band, palette and composition. A failure means regenerate, never crop, cover or retouch the mark. After three failures offer the preset's own look.

The manifest's `textCheck` is the local confirmation step. Apply writes it to `spec.ext.assetChecks[assetId]`, satisfying A1.text-check. It also sets `aiGenerated: true` and `media.ai: true` by default. A creator-owned image untouched by AI may explicitly use `aiGenerated: false`. No-text prompts alone are never evidence that a returned image is clean. This confirmation does not claim creative acceptance or that every gate passes.

## 3. Claude app, Cowork and hosted assets

Without Node and a browser, hand measurement and embedding to carousel-design's local lane or continue without pictures. Do not claim a local measurement or completed embed from chat. For a hosted Studio with asset upload support, view the returned image first, then have the creator drop it into the Visual tab or upload through the available asset capability. Stored hosted files can use `asset:<id>`; do not use those refs for local rendering.

The Studio's no-text confirmation switch writes `spec.ext.assetChecks`. Never tell the creator to skip it. A hosted file may be larger than an embedded JPEG; AI assets still carry dimensions, aiGenerated, tool and prompt id. Full-canvas video plates follow `motion-plates.md` and are outside the still-picture command.

## 4. Prompt and AI label handoff

Keep prompt cards in `spec.ext.visualPrompts`, keyed by prompt id: `{ "text": "...", "seed": 4821, "tool": "connected-image-tool" }`. No keys, personal data or temporary URLs. Tell the creator once: «الصورة مولّدة بالذكاء الاصطناعي؛ فعّل علامة الذكاء الاصطناعي عند النشر.» The final render and all ordinary gates still run before delivery.
