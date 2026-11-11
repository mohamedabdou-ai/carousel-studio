# Model picks: which kind of model for which job

Based on research done on 22 October 2026 and not re-checked since. Model lines change monthly: treat this page as a starting point, and let the connected tool's own model list and descriptions win. You only choose among tools the user connected (`capability-detection.md`); this page never means "go and sign up for something". Suggestions are phrased by capability, with no affiliate or sign-up prompts.

## 1. Picks by job
| Job | Kind of model to ask for | Why |
|---|---|---|
| Photoreal background plate (interiors, light, landscapes) | a current top photoreal image model (the GPT Image 2.5 family, the Nano Banana 2.x family) | light and material realism; request the measured frame ratio when supported |
| Illustration or flat graphic scene | a design-oriented model (the Recraft family, Ideogram, Seedream, Flux.2) | cleaner shapes and palette control; Recraft can also output vector shapes |
| Texture or pattern (paper, plaster, geometric lattice) | any of the above at the lowest "creativity" setting | repeatable, calm, easy to keep low-contrast |
| Cutout of the user's own photo | the connected background-removal tool (`image.cutout`) | keeps the real person or product; never regenerate them |
| Small logo or photo too small for 1080×1440 | an upscaler (`image.upscale`), one pass only | sharper edges without redrawing details |
| Relight a cutout to match a plate | `image.relight` if it exists | optional polish |
| Product shot | cut out the real product, generate the background, then combine | the product stays real (`plate-prompts.md` §10) |
| Image to video loop (cover plate) | an image-to-video model that supports a loop flag or an end frame (MiniMax H3, Luma Ray 3.2 with its loop option, Kling 3.0 as the budget choice, Runway Gen-4.5, Higgsfield motion models) | first frame = last frame; the ratio follows the input image |

## 2. Behaviours worth remembering
- Read the connected tool's current ratio options. Request the ratio from slots; if unavailable, pick the closest supported ratio and keep the subject within its safe band. The slide canvas ratio does not determine a picture strip's ratio.
- Image tools hosted by one connector (for example a multi-model hub) let you choose a model per call; ask for one model, not "best of".
- The result URL is temporary. Download it as soon as the tool returns it.
- A model's claim to render Arabic well is no reason to let it write any: users still report broken joins and misspellings, and the product rule is absolute (no text in images).
- Video models usually return 5 or 10 seconds; the cover needs 5–6, so ask for 5 and set `seconds: 5`.

## 3. Providers by access
| Access | Providers (examples) | Where used |
|---|---|---|
| OAuth connector (no key to handle) | a multi-model hub with upscaling, relight, background removal and video (Magnific, the Freepik platform); a creative-video suite (Higgsfield); a design-model suite (Recraft); fal.ai, Replicate, Krea | Claude app, Cowork, Claude Code, after the user connects them |
| API key only | OpenAI image models direct, Google Gemini image models direct, MiniMax, Luma, Ideogram direct | Claude Code companion only with the key in the connector's own settings, never in chat |

If the user pastes a key, apply rule 4 of `SKILL.md`. If they ask which to connect, answer by capability and trade-offs (what each hub covers, whether it needs a key, what it costs per use as the provider states it), give no ranking by commission or link, and say that connecting nothing is fine.

## 4. Do not rely on
Sora API (retired 24 September 2026) and the Gemini API preview of Veo 3.1 (ended 22 October 2026) are gone or going; do not plan around them. If a connected tool still lists them, its own error will say so: fall back to another video capability or the still plate.

## 5. When a pick fails
| Symptom | Next step |
|---|---|
| letters or pseudo-writing appear | regenerate with the no-text clause and an explicit object exclusion list (`plate-prompts.md` §6); another model if it repeats |
| the calm zone is busy | restate the zone, add "empty", "minimal", lower creativity or stylise |
| plastic skin, uncanny faces | change the subject: no faces on plates |
| wrong ratio | use the nearest measured frame ratio and preserve its subject band; fit or pad through carousel-design, never stretch |
| video does not loop | regenerate with the loop option; otherwise ping-pong in Claude Code; otherwise use the still plate (`motion-plates.md`) |
