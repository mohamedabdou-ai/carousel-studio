# Ingress: getting generated pixels into the Studio, and checking them

Studio pages block external images, and the chat sandbox only reaches an allow-list of hosts, so a connector's result cannot be linked into a slide. The picture has to be brought in as a file. This page covers each lane, the no-text check (gate A1) and how the spec records the asset.

## 1. By lane
| Lane | How the picture gets in |
|---|---|
| **Claude app** (web, desktop, phone) and **Cowork** | The tool returns the image into the conversation. You view it there and do the A1 check **before** telling the user anything. Then tell the user to save the image (long-press or the download button) and drop it into the Studio's picture slot on the Visual tab (the page's `assets` capability stores it). The Studio adds it to the spec as an AI asset. |
| **Claude Code** | Download the result file the approved tool returned to a scratch folder. Look at it (Read opens images; video: extract frames with ffmpeg). Run the A1 check, or hand the file to the `cs-art-director` agent. Then upload it to the published Studio with the Artifact tool's asset mode (`asset: true` with the artifact `url` and the `file_path`; the page must declare the `assets` capability) and use the id the result gives. |
| **No Artifact tool** | Keep the file next to `studio.html`; the user drops it into the page's picture slot. |

Only fetch the result URL the approved tool returned; it is temporary, so download it at once. Never store that URL in the spec or any file. A downloaded file belongs in the scratch folder, not in the plugin.

Size and format: photographic plates as JPEG (quality about 92) at most 3 MB is comfortable, hard limit 20 MiB per stored file; a cutout stays PNG or WebP to keep transparency. A video plate: H.264, no audio (`motion-plates.md`). In Claude Code `ffmpeg -i in.png -q:v 2 out.jpg` converts. A logo or small texture may be embedded in the spec as a data URI of at most about 60 KB; plates and videos never are.

## 2. The no-text check (A1), by lane
| Lane | Who checks | What is recorded |
|---|---|---|
| Claude app / Cowork | **You**, by viewing the returned image in the conversation, before the user drops it. Say plainly what you checked, in one line. | The user's own confirmation switch under the image on the Studio's Visual tab (a label in the user's dialect, «تأكدت: مفيش حروف ولا علامة مائية» in Egyptian) writes the record; until then the kit cannot export (gate A1.text-check). Never tell the user to skip it. |
| Claude Code | the `cs-art-director` agent, or you if agents are unavailable | when the check passes, **you** write `spec.ext.assetChecks.<assetId> = { "textChecked": true, "at": "<ISO time>" }` |
| Any | **Deterministic backstop**: a plate whose slide sits under a text box with no `calmZone` declared is rejected. Always set `media.calmZone` for a plate behind text. | `media.calmZone` in the spec |

What you look for, in every frame for video: any letter of any script, digits, pseudo-writing or calligraphy-like marks, logos, a generator's corner mark or watermark, signage or screens with text, a face you did not ask for, an off-palette colour cast, and that the calm zone is calm. A failure means **regenerate**, never retouch, crop or cover it; after three failures offer the preset's own look.

## 3. Recording the asset
```json
"assets": [{ "id": "plate1", "kind": "image", "ref": "asset:plate1", "mime": "image/jpeg", "width": 2160, "height": 2880,
             "aiGenerated": true, "tool": "<opaque tool ref>", "promptId": "p1" }]
"slides": [{ "id": "s01", "type": "cover", "media": { "slot": "plate", "assetId": "plate1", "promptId": "p1", "ai": true, "calmZone": "top" } }]
```
- `ref` is `asset:<id>` for stored files. Use the id the upload result gives; the Studio resolves it through the page's `assets` capability.
- `aiGenerated: true` on every generated **or AI-edited** asset (a cutout or an upscale of the user's own photo counts as AI-edited). `media.ai` is `true` on the slide.
- `calmZone` is one of `top bottom start end center none` (the `zone` from `data/zones.json`).
- The no-text record (`spec.ext.assetChecks.<assetId>.textChecked`) is set by the Studio's tap, or by you in Claude Code after a clean check. Never set it for an image you have not opened, and clear it if you replace the file.
- Keep the prompt card for regeneration in `spec.ext.visualPrompts` (the reserved private namespace the engines ignore), keyed by `promptId`: `{ "text": "…", "seed": 4821, "tool": "<opaque tool ref>" }`. It holds no keys, no personal data and no URLs.
- `alt` on the asset is optional; slide alt text lives in the caption pack.
- Replacing a plate: add the new asset, point the slide to it, then remove the old entry. Delete the old stored file only when nothing references it and the user asks.
Validate (`validate.py spec spec.json --checkpoint design --lint`), then rebuild and republish the Studio through `carousel-design`.

## 4. The AI label
The posting guide (a fifth card, in the user's dialect) tells the user to switch on Instagram's AI label. Scheduler APIs have an `is_ai_generated` flag, set whenever any asset has `aiGenerated: true`. Say it once, in one line, when you hand the plate over: «الصورة دي مولّدة بالذكاء الاصطناعي، فعّل علامة الذكاء الاصطناعي وقت النشر».

## 5. Direct pull from a connector (later)
A button inside the Studio that pulls the picture straight from a connector waits on a check of the page's connector access; until then the drop-in route above is the default. Do not promise it.

## 6. Mistakes to avoid
Telling the user to drop a file before you looked at it · retouching instead of regenerating · a plate behind text without `calmZone` · leaving `aiGenerated` off a cutout of the user's own photo · embedding a plate as a data URI · saving the connector's temporary link · sending the user's other files or brand data with a prompt.
