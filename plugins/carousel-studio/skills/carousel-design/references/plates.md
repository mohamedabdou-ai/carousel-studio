# Pictures on slides

Use one path: choose picture slides -> measure frames -> prompts -> the creator's approved image tool makes originals -> inspect -> manifest -> apply -> check -> render. Decide this before designing a picture slide in the free lane. Image-tool calls still require the creator's consent.

## What can hold a picture

Current engine templates have media slots on cover, rehook, item, step, stat, compare, myth-fact, quote, story-beat, checklist, summary, setup, proof, share, CTA, offer, testimonial, poster, grid and timeline. Size depends on the resolved variant, style and actual text. `slots` is authoritative about visible area; a template slot alone does not guarantee room.

- `proof`, variant `screenshot` or `base`, slot `screenshot`: contains the whole illustration inside the preset's mat (dark on poster). An illustration never stands in for documentary proof or a real result.
- Cover/poster `split` with `photo`: a cropped strip when the preset supports split. Photo variants and slot `plate` use a full-canvas background. Use the resolved variant printed by slots when a preset falls back. Apply and restyle retain that normal engine fallback, report requested/resolved variants and print the change; they recrop for the frame that will actually render.
- `step`, `checklist`, `summary`, `cta` and `offer`, variant `media`, slot `photo` or `screenshot`: a picture-led frame in every style, at least 360–400 px high depending on canvas height before fitting. The picture is the largest element with short copy. Keep the step ordinal and label and the closing CTA. `slots` also reports the measured `media` alternative for these types. Other types keep their native frame; measure with the actual copy.
- Any slide with `free`: `slide.media` is bypassed, but an empty `<div data-picture="asset-id" data-fit="contain"></div>` shows an asset inside the authored layout (`free-design.md`). `slots` reports these placeholders separately. Only the engine creates the image; authored `img`, `src`, `url()` and `background-image` remain forbidden. `apply`/`embed` still target the engine media slot; do not remove a free layout unless an engine conversion is intended.

## Commands

`<skill>` is this skill folder; `POST` has spec.json. Requirements match render: Node 22+, existing Playwright, Python 3.11 to build the page, Chrome/Edge. Set PYTHONIOENCODING=utf-8 on Windows. Browser discovery matches render.mjs; `--chromium PATH`, CS_CHROMIUM and CS_CHROME select an installed browser. Nothing is downloaded. Browser requests stay on the command's loopback server; canvas does the image work.

```text
node <skill>/scripts/plates.mjs slots --dir POST --brand brand.json --format json
node <skill>/scripts/plates.mjs fit --dir POST --slide s03 --source original-s03.png --gravity top --format text
node <skill>/scripts/plates.mjs apply --dir POST --brand brand.json --format text
node <skill>/scripts/plates.mjs check --dir POST --brand brand.json --format text
node <skill>/scripts/plates.mjs restyle --dir POST --brand brand.json --format text
node <skill>/scripts/render.mjs --spec POST/spec.json --brand brand.json --out POST/kit --format text
```

Slots writes nothing: it composes with current text and fonts, inserts a private prospective picture when needed, fits the text, then measures the image content box excluding the mat's border and padding. It reports slide CSS pixels, ratio, resolved variant, object-fit, a central 55% subject band with 8% side margins, and suggestions for unsupported layouts. Put that ratio in the prompt, never the slide canvas ratio or another post's old crop.

Fit writes a PNG under `plates/fitted/`, leaving the spec and manifest untouched. Sources are relative to plates/. Auto crops only if the subject box survives; without focus it assumes the prompt's central band, not detected subject bounds. `--focus x,y,w,h` uses normalized coordinates of the unflipped original. `--gravity center|top|bottom` positions a crop without focus. `--crop` or `--pad` forces a choice. Pad extends edge colours with seeded grain (sideways for a wider frame, vertically for a narrower one). `--flip` reverses the fitted image. Optional `--out` must stay inside plates/fitted/; originals cannot be overwritten. Fitted previews have a maximum side of 1600 px.

Embed fits and embeds one slide and creates or updates its durable manifest row. Reuse a row or supply provenance and the actual inspection time:

```text
node <skill>/scripts/plates.mjs embed --dir POST --slide s03 --source original-s03.png --prompt-id p3 --tool connected-image-tool --text-checked-at 2026-11-11T08:00:00Z --format text
```

Apply measures, fits and embeds all manifest rows in one spec write. Restyle is the same operation after changing style or text. Both use originals, never an earlier reduced JPEG. Run apply after a script-to-spec rebuild; the manifest is independent of any copy-edit file.

Check reports stale ratios (FIX), refs exceeding the schema cap, missing asset metadata or no-text checks, unresolved local refs and ignored pictures (BLOCK). An invalid spec is reported before rendering; framesMeasured=false means it needs schema repair first. This complements ordinary QA and the final rendered review.

All commands accept `--spec FILE` in the post folder, `--format text|json`, `--timeout MS`, `--chromium PATH` and `--headed`. JSON is a single stdout object; Arabic progress and cs-error go to stderr. Exits match render: 0 pass, 1 FIX, 2 BLOCK/schema, 64 usage, 65 malformed data, 66 missing file, 70 internal/tool, 73 write error, 75 conflict.

## Manifest and one inspection record

Keep originals and `plates/plates.json` together:

```json
{
  "version": 1,
  "plates": [{
    "slideId": "s03",
    "source": "original-s03.png",
    "mode": "auto",
    "gravity": "center",
    "flip": false,
    "tool": "connected-image-tool",
    "promptId": "p3",
    "textCheck": { "textChecked": true, "at": "2026-11-11T08:00:00Z" }
  }]
}
```

Use the actual UTC inspection time. View each original: no letters, digits, pseudo-writing, logos or watermark, including generator marks. Never confirm from the prompt alone. Reject and regenerate dirty originals; never crop marks away. The manifest confirmation writes spec.ext.assetChecks[assetId] for A1.text-check. Apply adds textCheck.sha256, binding the check to those original bytes. If the file changes, inspect again and replace the complete textCheck object; keep the saved hash for an unchanged original.

Optional focus: `{ "x": 0.1, "y": 0.15, "w": 0.8, "h": 0.7 }`. Mode is auto/crop/pad; pad:true|false is accepted instead of mode. Optional `layout: { "type": "proof", "variant": "screenshot", "slot": "screenshot" }` explicitly chooses an engine layout and removes free on replay; normal copy fields stay intact. Select that layout in the spec before slots and prompts, then mirror it in the manifest for future rebuilds. Do not change a counted step or CTA into proof merely to add a picture. A creator-owned image untouched by AI may set aiGenerated:false; generated or AI-edited pictures keep true.

Assets are plate-s03, kind image, embedded JPEG ref, MIME, actual encoded width/height/bytes, aiGenerated, tool and promptId. The ref cap is read from the spec schema and checked after encoding including base64 overhead. Media gets legal calmZone:bottom. Keep prompt cards in spec.ext.visualPrompts keyed by prompt id. The tool does not invent prompt wording or certify creative quality.

Writes are UTF-8/LF and atomic per file; conflicts refuse the save. The manifest is saved first so a failed spec save can be replayed. Unchanged inputs preserve spec bytes and rev. A changed result bumps rev, clears frozen layout and returns ready/exported posts to design for review. Final rendering and all QA gates remain required.

## Cover logo and asset references
`cover.logo = {"assetId":"product-mark","ground":"light"}` adds a creator-supplied product or partner mark independently of the cover picture. Use `dark` for light artwork. It is contained, never cropped or mirrored, in a 176 x 80 px box including 12 px padding and a clear solid ground (maximum 192 x 88). Positions: start in swiss, creator and poster; end in notebook and interface; center in heritage. It occupies its own row before the kicker inside the body area, away from the platform overlays. Still and video use this same slot. Supply the file and confirm the right to use it; nothing is bundled. Generated plates must still have no logos.

The schema's `asset.ref.maxLength` is the single cap: 2,000,000 characters including the data-URI header and base64 padding (about 1.5 MB of binary). The earlier 90,000-character limit kept portable pages small, but forced real pictures below about 66 KB. The larger finite limit bounds per-asset page memory while retaining useful picture detail. `plates` reads it from the schema and encodes to that actual limit; no cap is repeated in the encoder.

An asset record id and its upload id are separate: `media.assetId`, `data-picture` and `cover.logo.assetId` name a record in `spec.assets`; that record's `ref: "asset:<id>"` names an opaque uploaded file. Both render lanes use `/_blob/<id>`, exactly like the Studio. The host must supply those bytes. For an offline local post, embed image data or serve a prebuilt Studio with its `_blob/<id>` files (`render.mjs --studio POST/studio.html --spec POST/spec.json`). A fresh `--spec` render builds in a temporary folder and cannot recover bytes held only in a remote Studio. File paths, remote URLs and traversal are not accepted as upload ids. `slots --format json` includes separate `slots` for cover logos and authored free pictures, plus measured `pictureVariants` for picture-led engine alternatives.

Picture-led variants use the normal `h2` heading role and its floors. Summary and offer bullets use two columns, leaving room for a closing CTA without reducing type floors. The picture floor is 400 px on the 1440 px canvas and 360 px on the shorter canvas, above the proof mat's 352 px floor; actual frames grow with available room.

AI imagery in free picture and cover logo slots keeps the A1 inspection gate. Record the creator's no-text inspection in `ext.assetChecks[assetId]`, using the spec asset record id. An upload id never supplies another record's confirmation. Reinspect a replaced image. The engine supplies standard bottom calm-zone metadata for these inline frames.
