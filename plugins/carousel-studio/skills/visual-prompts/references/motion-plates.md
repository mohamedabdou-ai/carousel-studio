# Motion plates: AI-animated cover backgrounds

External motion is optional. With a video capability connected and the user's agreement, an AI model animates **only a text-free background plate**. The Studio's type layer builds on top of it with the `calm` recipe, and the loop rules still apply. Without a video tool the cover uses the engine's own motion; nothing is lost.

This reference covers a full-canvas video background. Still illustrations in picture strips follow the measured slots -> prompts -> manifest -> apply workflow in `ingress.md`; the still-picture command does not encode video.

## 1. Requirements of a plate
| Requirement | Why |
|---|---|
| 3:4 portrait, 1080×1440 or larger, no audio | same size as the slides; the cover video is silent |
| 5–6 seconds | `cover.motion.seconds` is 5–6; a 5 s clip means set `seconds: 5` |
| **First frame equals last frame** (or a ping-pong that returns exactly) | the cover is poster-first: frame 0 is the finished cover and the last frame is the same, so the loop has no seam (gate V1) |
| Locked camera, subtle motion only | drifting dust, light shift, fabric sway, ripples; text stays readable over it |
| No people morphing, no new objects entering, no flashes | at most 3 flashes a second; nothing that distracts from the hook |
| No letters, digits, logos or watermark in any frame | gate A1 |
| The calm zone stays calm in every frame | the hook sits there |

## 2. Making one
1. **Start from an approved still plate** (`plate-prompts.md`, checked for text). The still fixes the look and the ratio; the model only adds motion.
2. Use an image-to-video capability. Prefer `video.i2v.loop` (a loop flag, or the same image as the first and last frame). With plain `video.i2v`, give the still as the start frame and, if the tool accepts an end frame, the same still as the end frame.
3. Prompt for the motion, never for content:
   "Locked-off camera, no camera movement. Only subtle ambient motion: [slow drifting dust / a gentle shift of warm light / a slight sway of fabric / soft ripples]. The final frame returns exactly to the first frame. No new objects, no people, no morphing, no cuts. No text, no letters, no numbers, no logos, no watermark."
4. Ask for 5 or 6 seconds at the tool's highest quality and the 3:4 ratio of the input. Strip audio.
5. Download the result promptly (the link is temporary) and check it (§4).

## 3. If the clip is one-way
A clip that ends somewhere new is not a loop. In Claude Code make a ping-pong with ffmpeg (forward, then reversed, trimmed to 5–6 s in total); in the Claude app ask the tool for a loop or fall back to the still plate with the engine's own `calm` motion. Never trim a one-way clip and hope: gate V1 compares the last frame with the first and blocks an export that does not match.

## 4. Checks before using it
- Look at the first, a middle and the last frame (Claude Code: `ffmpeg -i plate.mp4 -frames:v 1 first.png` and `ffmpeg -sseof -0.1 -i plate.mp4 -frames:v 1 last.png`). They must match; compare by eye, or with ffmpeg's `psnr` filter on the two PNGs.
- Watch for flicker, warping, a face or hand changing shape, text-like marks appearing mid-clip, and a calm zone that gets busy. Any of these: regenerate (up to three times), then use the still plate.
- Size: under 20 MiB. Larger: scale down (`-vf scale=1080:1440`), keep H.264, drop audio (`-an`).

## 5. Recording it
```json
"assets": [{ "id": "plate1", "kind": "video", "ref": "asset:plate1", "mime": "video/mp4", "width": 1080, "height": 1440,
             "aiGenerated": true, "tool": "<opaque tool ref>", "promptId": "p2" }],
"slides": [{ "id": "s01", "type": "cover", "media": { "slot": "plate", "assetId": "plate1", "promptId": "p2", "ai": true, "calmZone": "top" }, "…": "…" }],
"cover": { "motion": { "recipe": "calm", "feel": "calm", "seconds": 5, "fps": 30, "source": "external", "plateAssetId": "plate1" } }
```
Use `ref: "asset:<id>"` for video; a data URI is far too small for it. Keep the Studio's other recipes for internal motion.

## 6. Where it renders
- **Claude Code**: the plate is a `<video>` layer inside the HyperFrames composition; the type builds over it and the MP4 is checked by `check_video.mjs`.
- **Studio**: the page decodes the plate frame by frame under the DOM. If that path is not ready in the installed build, the Studio shows «الحركة الخارجية متاحة في Claude Code»; tell the user and offer the engine's motion, or the Claude Code render.

## 7. When it is not worth it
A still plate with the engine's own motion is the default and is often better: no seam risk, no credits, no uncanny motion. Offer a video plate only for covers where light or texture movement adds mood (a heritage scene, a gradient backdrop), and say it uses more credits than a picture.
