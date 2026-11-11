# Export: files, formats and the publishing kit

Everything is exported from the user's own browser (Studio) or locally (Claude Code lane). The exporter derives every file from `spec.json`, rendering the deck itself with the frozen layout, so exports never depend on what is on screen.

At most 10 slides, including the still or video cover: Instagram’s publishing API and most schedulers accept at most 10 items. A focused carousel of 4, 5 or 6 slides is complete; 6 to 10 is an optional sweet spot, never a reason to pad the post.

`qa-report.md` and `qa-report.json` are always written, even with `--formats png`. JSON `qa.exitCode` describes the findings; top-level `exitCode` describes the export.

## 1. File specifications
| File | Spec |
|---|---|
| `3x4/NN.png` | 1080×1440, sRGB, no alpha, painted at 2× and downscaled; `NN` is the two-digit slide position |
| `4x5/NN.jpg` | 1080×1350 (rows 45–1395 of the design), quality 0.92 stepped down until it is at most 8,000,000 bytes; for schedulers and the API only |
| `3x4/01-cover.mp4` | 1080×1440, H.264 High at level 4.0 (`avc1.640028`), yuv420p, **limited (TV) range, BT.709** primaries, transfer and matrix, 30 fps constant, 6 s (5–6) for engine loops or 6–15 s for a local clip, no audio, `moov` before `mdat`, keyframe at 0 and at least every 30 frames, 8 Mbit/s; the Studio and HyperFrames lanes write the same facts (`ffprobe` shows `yuv420p`, `tv`, `bt709`, level 40) |
| `4x5/01-cover.mp4` | the same frames cropped to 1080×1350 |
| `carousel.pdf` | one page per slide, 1080×1440, each page one JPEG, producer "Carousel Studio", no author |
| `caption.txt` | firstLine + keywordLine, body, cta, hashtags, separated by blank lines; exactly what the user pastes: the AI-label reminder is never written into it, it lives in `posting-guide.md` |
| `hashtags.txt`, `slide-captions.txt`, `alt-text.txt` | one item per line; slide labels are `NN: text` with Western digits |
| `posting-guide.md` | the per-dialect posting guide built from `data/posting-guide.json` |
| `spec.json`, `cover.hf.html`, `studio-source.html` | the editable source files, **opt-in** (section 2); the last two are built credit-free, and `cover.hf.html` opens with a licence header (Apache-2.0, the HyperFrames format, the embedded OFL fonts by name) |
| `qa-report.md`, `qa-report.json` | the gate results, bilingual |

Single posts (`format: "single"`) use `3x4/post.png` and `4x5/post.jpg` instead of numbered slides and have no video.

## 2. The kit («حزمة النشر»)
A ZIP named `<spec.id>-kit.zip`, rooted at `carousel-kit/`. The default kit is the **light** one, made to move to a phone and save through the share sheet: **about 3 MB for eight slides** (target ≤ 4 MB; measured 2.78 MB on the 8-slide Egyptian fixture: PNGs 0.52, JPEGs 0.53, both MP4s 1.19, PDF 0.52, text 0.01). It was 14.4 MiB when the source files travelled with it.

```
carousel-kit/
  3x4/   01-cover.mp4  01-cover.png  02.png … NN.png
  4x5/   01-cover.mp4  01-cover.jpg  02.jpg … NN.jpg
  caption.txt  hashtags.txt  slide-captions.txt  alt-text.txt  posting-guide.md
  carousel.pdf  qa-report.md  qa-report.json
```
**Source files («ملفات المصدر»), opt-in.** `spec.json`, `cover.hf.html` (carousels with motion) and `studio-source.html` add more than 10 MB, nearly all of it embedded fonts, so they are never in the default kit. Ask for them with the **source files** switch on the Export screen (they then sit in the kit between `carousel.pdf` and the QA report), with the single export «ملفات المصدر (ZIP)» (a `<spec.id>-source.zip` rooted at `carousel-source/`), or in Claude Code with `--formats …,source`. They are what lets you reopen the post in the Studio or re-render the cover with HyperFrames later; the PNG, JPEG, MP4 and PDF are all you need to post.

The kit is the default save because `downloads` prompts once per file. A requested cover video that could not be produced is listed in `skipped` and `video.missing` / `video.errors`, prints `E_VIDEO_MISSING` on stderr, adds an `X1.complete` BLOCK to both QA reports and exits nonzero. Use `--video none` for an intentional still-only export.

## 3. What «export» means for the gates
- **D1** exact sizes, one ratio, sRGB, no alpha, JPEG ≤ 8 MB. **V1** the video spec and the loop. **X1** the clean-export gate.
- **X1** covers every file inside the ZIP and every standalone file the Studio saves. It fails the export if any file contains the tool's credit text, the author's name in either spelling, or a social handle; if a PNG, JPEG, PDF or MP4 carries personal metadata; or if a file the kit should hold is missing (a requested MP4 remains BLOCK even when listed in `skipped`). Metadata is stripped by construction (canvas encoders add none; the PDF producer is the project name).
- `studio-source.html` and `cover.hf.html` are built **credit-free**: no About panel, no credit strings, no socials. Their licence headers name the project, Apache-2.0 and the third-party notices only (`cover.hf.html`: the HyperFrames format and the embedded OFL fonts, listed by family).
- **Fonts**: OFL fonts are embedded. A font the user uploaded (for example Thmanyah) is embedded only in the live page and in rasterised outputs (PNG, JPEG, MP4, PDF); `studio-source.html`, `cover.hf.html` and the ZIP reference it by family name and show a one-time note asking the user to re-attach their own copy. No non-OFL font file ever travels in the kit.
- **A1**: every AI asset is listed with `aiGenerated: true`; export stays blocked until the no-text check is done (`visual-prompts/references/ingress.md`).
- Users own everything they export.

## 4. How the user saves
Save order (automatic): **Web Share with files** on a touch device after a tap → the page's `downloads` capability (one ZIP when there are more than three files) → a plain download link. A declined prompt is not an error. If `downloads` is not enabled the files are offered one by one.

On a phone the fastest path is «احفظ في الصور» (share sheet → Save to Photos), then the posting steps in `posting-guide.md`. On a computer download the ZIP.

## 5. Claude Code lane
`render.mjs --spec spec.json --out DIR --formats png,jpeg,pdf,zip,qa --variants 3x4,4x5` writes the same tree and runs the export-scope QA (add `source` to `--formats` for the three source files); its exit code is 0 when completed with pass or FIX, 2 for BLOCK, and nonzero for a real failure; add `--strict` to restore FIX = 1. `--video internal` uses the Studio exporter instead of HyperFrames; `--video none` skips the cover video. Details and preflight: `lanes.md`.

## 6. What to say after exporting
Three lines in the user's dialect: where the files are, whether anything was skipped or is still a FIX, and the first posting step. Do not repeat the file list; point to `posting-guide.md`. If the post uses AI imagery, add the AI-label step. Add no credit or promotional line.

## 7. Troubleshooting
| Symptom | Cause and fix |
|---|---|
| «حزمة النشر» is disabled | an unresolved BLOCK; open the Check screen, run «صلّح تلقائياً», or override an overridable copy gate with «صدّر رغم ذلك» |
| X1 fails | a credit or a handle slipped into copy, alt text or a filename, or a non-OFL font is embedded: remove it and re-export |
| JPEG over 8 MB | the exporter lowers quality in 0.02 steps; if it still fails the background is too noisy: simplify or use a plain background |
| video skipped | no H.264 in this browser: export from a recent Chrome or Edge on a computer, or post the static cover |
| `V1.range` or `V1.pixfmt` BLOCK on a video | the file is full range (`yuvj420p`) or not 8-bit 4:2:0: the Studio's exporter converts its frames itself and never produces this, so it comes from another encoder or an older export; export the cover again |
| `V1.level` FIX | the encoder wrote H.264 level 4.2 or higher and the stream did not fit level 4.0 well enough to lower it; advice only, current phones play it |
| fonts look different in the PNG | the live page used a font the export could not embed: re-run after `document.fonts.ready`; check the font is a registry font or a re-attached upload |

## 8. Local clip covers
`cover.motion.clip` attaches a post-local clip to the engine cover's media window; see `motion-recipes.md`, section 5a. Both MP4 ratios stay in the kit. A new export always recomposes the attached clip, including after a style change and with `--video hyperframes`; it never substitutes the engine loop. `--video none` omits the MP4s intentionally, but still derives the cover poster from an encoded frame.

For clip covers, the 3:4 PNG, the 4:5 JPEG and the PDF's first page come from their MP4's decoded first frame. The still is never independently repainted over a finished clip. The loop's last-versus-first thresholds remain SSIM 0.995 / PSNR 45 dB; the decoded first frame is compared directly with the kit poster, without another colour conversion. Every clip frame, including both holds, is checked for blank or near-blank content.

```text
node cover_video.mjs --spec POST/spec.json --out POST/cover.mp4 --variant 3x4
node check_video.mjs POST/kit/3x4/01-cover.mp4 --poster POST/kit/3x4/01-cover.png --spec POST/spec.json
```

`cover_video.mjs` uses the same browser compositor and writes a decoded poster beside the requested MP4 (PNG for 3:4, JPEG for 4:5). The standalone checker also accepts `--kind clip --seconds N --poster FILE`: the poster from the same kit is required; the spec is optional. PNG posters keep the SSIM 0.99 floor; JPEG posters use 0.98 after chroma reconstruction, both at PSNR 32 dB. The last-versus-first loop floor stays SSIM 0.995 / PSNR 45 dB. It still uses its existing ffprobe/ffmpeg inspection tools; composition and the kit's browser gates do not require them.

The opt-in sources of a clip post are `spec.json` and `studio-source.html`. `cover.hf.html` belongs to engine loops; clip posts do not ship a misleading engine composition. The original clip stays in the post folder and must be reattached when reopening the Studio. Credit its source in the caption. Longer footage also makes a larger kit; the old small-loop kit size is not a clip-cover size promise.
