# Capability detection

Connector tools carry provider-specific, often prefixed names and change between versions. Classify each tool by **what it takes and what it returns**, using its description and input schema; the name is at most a hint. Never hard-code a provider.

## 1. Capabilities
| Id | Takes | Returns | Typical extra parameters |
|---|---|---|---|
| `image.generate` | a text prompt (nothing else is required) | one or more images or image URLs | aspect ratio or size, seed, model, count |
| `image.edit` | an image **and** an instruction, or an image and a mask | an image | strength, mask, reference images |
| `image.upscale` | an image | a larger image | scale factor (2×, 4× …), mode or preset |
| `image.cutout` | an image only | an image with transparent background | optional threshold or output format |
| `image.relight` | an image **and** light parameters | an image | direction, colour, intensity |
| `video.i2v` | an image (+ prompt) | a short video | duration, motion strength, aspect ratio |
| `video.i2v.loop` | an image plus an end frame or a loop flag | a video whose last frame returns to the first | `loop`, `end_image` |
| `source.transcribe` | an audio or video file or URL | text | language |
| `insights.ownData` | an account and a period | the user's own metrics | only to source a number the user asked for |
| `design.canva` | design creation, upload or autofill | a design id or link | used only by the Studio's «ابعته لكانفا» |
| `publish.scheduler` | a post payload (media, caption, time, an AI flag) | a scheduled-post id | not used in v1 |

`video.i2v.loop` is also a `video.i2v`; keep both entries for such a tool.

## 2. How to classify
1. **List what is available this session.** If tools appear by name only (deferred), search the host's tool catalogue with capability words (image, generate, upscale, background, cutout, relight, video, animate, transcribe, canva, schedule) so their schemas load. Never call a tool to learn what it does.
2. Read the required inputs first:
   - only text → `image.generate`;
   - image + text instruction, or image + mask → `image.edit`;
   - image + a scale or resolution parameter → `image.upscale`;
   - image alone, described as background removal or segmentation → `image.cutout`;
   - image + light parameters → `image.relight`;
   - image + duration or motion parameters, output video → `video.i2v`; add `.loop` when an end frame or loop option exists;
   - media in, text out → `source.transcribe`.
3. A tool that does several things (a generator with edit modes) gets every capability its parameters support.
4. **Ambiguous or unfamiliar**: do not guess and do not test-run it (a call can cost credits). Ask one question: «الأداة دي بتقول إنها [وصفها]، أستخدمها لـ[الاستخدام]؟».
5. **Never use** tools whose effect is to publish, post, send, delete or change an account, from this skill. A scheduler is recorded but not called in v1.
6. Several tools for one capability: prefer the one whose description names the needed ratio or the loop option; mention the others only if asked.

## 3. The map
Store it in `brand.tools`:
```json
{ "detectedAt": "2026-10-22T10:00:00Z",
  "caps": { "image.generate": ["<opaque tool ref>"], "image.upscale": ["<opaque tool ref>"] },
  "consent": "ask-each-post" }
```
Each capability holds up to 10 opaque references (at most 200 characters each; a tool name works). Refresh `detectedAt` every session; a capability that is no longer available is dropped. `consent` is one of:
- `ask-each-post` (default): ask before each post's visuals.
- `batch-ok`: the user said they do not want to be asked every time, or in Claude Code the command itself asks for the work. Record it only when the user says so.
- `never`: no external tool is called; prompts may still be written on request.

## 4. Consent line
Before the first call of a post, one short message in the user's dialect: what will be made, that it uses credits from their provider account, and that the prompt (and any image for edit, cutout or upscale) is sent to that provider. Then wait for a clear yes. A yes covers that post only unless consent is `batch-ok`.

## 5. What is sent
Only the prompt text, and for edit, cutout, upscale and relight the single image concerned. Never include client names, unreleased numbers, the brand book or other files. Do not upload photos of people without the user's confirmation that they own them or have permission.

## 6. Cost and volume
Ask for one image (two for a cover) per call, regenerate up to three times for one slide, and stop. Do not quote prices unless the tool reports its cost. Do not generate a picture for every slide: a carousel needs a few, and the rest of the design carries it.

## 7. When nothing is connected
Say so in one line and carry on with the preset's own look, which is finished by design. If the user wants pictures, describe the capability that would help in neutral terms (an image generator, a background remover) without naming a product to buy, and offer to write the prompt card so they can run it anywhere (`plate-prompts.md`). API-key providers are a later companion for Claude Code only; the key never goes through chat.
