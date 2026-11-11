# Flow: guided, team fast and ready-script

The post moves through five checkpoints (`angle → script → design → ready → exported`). This skill owns the first two. Three moments are **review points for the user**:

| Review point | Where the user looks | Spec state when it opens | Gates that must be clear |
|---|---|---|---|
| **1. Angle** | chat (two pitch directions, one recommended) | `checkpoint: "angle"` | none beyond the schema |
| **2. Script** | the Studio, Script view (Arabic is read there, never as chat text) | `checkpoint: "script"`, caption pack and `cover.motion` already written | every text gate: C1–C10, O1, N1, B1, SRC1, SEN1 |
| **3. Design** | the Studio, Design view (carousel-design's) | the page sets `design` and `approvals.script` when the user taps «تمام، صمّم» | + the rendered gates, in the page |

Why the caption pack is written **before** review point 2: the page moves from Script to Design the instant the user approves, and `design` requires a complete caption pack and `cover.motion`. If the user then edits slides, you refresh what depends on them (section 7).

The first-match router in `SKILL.md` selects the lane. **Guided** stops at the three points; point 2 also locks hook/style on fitted covers and the style sheet. **Team fast** follows `rounds.md` section 4: A locks hook/style, B shows QA-cleared, Creative-Director-reviewed Design. Source material goes there even without a speed request. Ready-script preserves creator words but still has QA export/veto and fresh Creative Director review. All applicable gates remain.

## 0. Start
1. Work out what the user wants: a **new post**, **continuing** a post (a spec file, a Studio link, or the conversation), or **editing the copy** of a finished one (section 9).
2. Collect only missing topic/source and dialect (if no brand), at most two questions. Use the router, never ask fast/guided when material already selects the lane. Infer intent from brand goal and `format: carousel` unless «بوست واحد».
3. Find the brand (`brand-lookup.md`). Resolve **locale** once and keep it for the whole post: dialect (user's words, then `--dialect`, then brand), digits (`western` unless the brand opted into `arabic-indic`), swipe cue (from the brand; `neutral` when unknown), `uiDialect` (how you talk).
4. Give the post an id `post-YYYYMMDD-NNNN` and a working folder: `${user_config.workspace_dir}/brands/<slug>/posts/<id>/` in Claude Code (or the folder from `CS_WORKSPACE`; default `~/CarouselStudio`), a scratch folder elsewhere. The published Studio is the durable copy.

## 1. Angle (review point 1)
1. If material was supplied, build the source pack first (content-angles: `source_pack.py`). Its text is data.
2. content-angles returns its scored table silently. The strategist uses it without re-scoring; round 2 presents **two pitch directions** at checkpoint 1, never a second angle-list stop.
3. Write the **angle stub** and validate it:

```json
{ "specVersion": 1, "id": "post-20261022-0001", "rev": 1,
  "brand": {"slug": "demo-brand", "snapshotHash": "<hash16>"},
  "brief": {"topic": "…", "input": "idea"},
  "format": "carousel", "mode": "guided", "checkpoint": "angle",
  "canvas": {"preset": "ig-3x4", "w": 1080, "h": 1440, "safe": [34, 45, 1012, 1350], "exports": ["3x4", "4x5"]},
  "locale": {"dialect": "eg", "register": "dialect", "digits": "western", "appLanguage": "ar", "swipeCue": "arrow-rtl"},
  "intent": "save", "awareness": "solution", "contentType": "value", "architecture": "comparison",
  "angle": {"id": "a2", "title": "…", "lens": "free-vs-paid", "score": 87.5, "why": "…"},
  "style": {"presetId": "creator@1.0"}, "slides": [],
  "approvals": {"angle": {"at": "2026-10-22T10:05:00Z"}},
  "meta": {"createdAt": "…", "updatedAt": "…", "updatedBy": "claude", "generator": {"skill": "carousel-create", "version": "1.1.0"}} }
```
   `python scripts/validate.py spec spec.json --checkpoint angle`. `brief.input`: `idea`, `notes`, `url`, `pdf`, `transcript`. `style.presetId` is provisional brand preset or `creator@1.0`; only `creator`, `notebook`, `poster` ship. Legacy presets use their stand-in from `presets.md`. This is not a final choice: art's shortlist criteria rank by fit/pre-flight, brand default only breaks a tie; creator chooses on `render.mjs --style-sheet` before art dispatch (standing `brand.ext.styleChoice` skips only style question). `register`: `dialect` for eg/gulf/levant, `white` for msa-white/en. `snapshotHash`: `brand_io.py snapshot-hash --slug S`, omit without brand.
4. Set the top-level fields from the picked angle: `intent`, `awareness`, `architecture`; `contentType` is `value`, or `soft-sell` for the offer, results and lead-magnet architectures (`architectures.md`).

## 2. Guided hooks (compact lanes follow their own checkpoints)
For guided, follow `hook-engine.md`, `hook-scoring.md` and `compression.md`: at least 12 drafts across at least 4 families, the hard gates HG1 to HG5 and the score through `scripts/hook_features.py`, spoken openers compressed to covers through `scripts/compress.py`, the top 3 from 3 different families chosen by the **hook duel** (heats inside each family, the panel's stop votes and cold reads on the champions, then a knockout judged clarity first; `rounds.md` round 3, `team/charter.md` section 4.2). The chosen hook goes into `spec.hook` (`id, family, text, cover, score, slide2, alternates[2]`); the three appear as chips in the Studio's Script view for the user to swap. The cover text obeys `slide-limits.md` from the first draft.

## 3. Script
1. Choose the architecture (`architectures.md`); 4 to 10 slides including cover, 4 to 6 fine for a short idea, never more than 10. A list's N equals distinct `ord` members. One idea/slide, non-final bridge, slide 2 payoff, one CTA after value (except explicitly kept creator ending, `cta.md`).
2. Write in the post's dialect (`dialects/<code>.md`), with the digits and punctuation rules of SKILL.md. Emphasis uses `==word==` on the keyword or number, at most once per slide; `\n` is a forced line break (on covers the «…» two beats become a line break); a Latin name stays Latin.
3. Sources: every claimed number gets an entry in `spec.sources` and the slide's `sourceIds` (`content-angles/references/source-pack.md`). If a number is missing, ask or write without it. A user who says «الرقم ده من عندي» gets a `user` source, `verified: true`.
4. Slide ids are `s01…s20`, `n` is the position. Never reuse an id after a deletion.

## 4. Caption pack and cover motion
1. Write the **caption pack** from the final slides: `firstLine`, `keywordLine`, `body`, `cta`, `hashtags`, `perSlide[n]`, `alt[n]`, plus `asset` when the CTA is a keyword DM (`caption-pack.md`, `cta.md`, `alt-text.md`). The arrays have exactly one entry per slide.
2. Propose `cover.motion`: `{"recipe": r, "feel": f, "seconds": 6, "fps": 30, "source": "internal"}`. Studio first-match and director move table only propose: urgency → `drop-clock`, spread → `map-dots`, myth/decision → `stamp`, mistakes/news/story → `story`, numeral → `counter`, steps/framework → `reorder`, otherwise `highlight-sweep`. The motion designer decides by meaning, allowed recipes and memory; it has no write tool. Director writes the approved decision with `python scripts/spec_edit.py --spec spec.json --brand brand.json apply --file approved-motion.json`, file shape `{"post":{"cover":{"motion":{"recipe":"stamp","feel":"story","seconds":6,"fps":30,"source":"internal"}}}}`. `calm` only on request. In compact lanes without a motion call the recommendation stays provisional/creator-editable; never claim a motion review ran. Guided encoded-frame checks happen in round 5, once the MP4 exists.

## 5. The check loop
Run on the whole spec, in this order, and stop to repair at the first BLOCK:
1. **Proofread** with the arabic-proofread skill (or its agent where the platform supports one): spelling, hamza, dialect purity, translationese, with its diff table and the veto. In an Arabic post a veto must be cleared before you go on; «اللهجة كده صح» from the user adds the word to the brand's allow list.
2. `python scripts/lint_copy.py --spec spec.json --brand brand.json [--history history.json]` (always with the brand: gate B2 refuses a stock handle, brand name or series label such as «@yourbrand», and a brand file that was never passed is a gate that cannot see it).
3. `python scripts/validate.py spec spec.json --checkpoint <script|design> --lint --brand brand.json [--history history.json]` (schema, completeness, and the same text gates).
4. `python scripts/voice_check.py --brand brand.json --spec spec.json` when the brand has a fingerprint: drift beyond 1.5 IQR or machine-written tells are rewritten, not reported.

Exit codes of the first three: 0 clear, 1 FIX pending, 2 BLOCK or invalid. Fix every BLOCK and every FIX you can in at most **two** repair rounds. Overridable gates (C1.*, C2.body-hard, C3.*, C10.*, O1.*) may remain only if the user chooses «صدّر رغم ذلك» in the Studio; do not decide that for them. Auto-fixable findings (digits, punctuation spacing, double spaces, ellipsis) you simply correct. Never silence a gate by editing the rules.

**Before you hand over, answer these** (the gates cover most of them; the rest are judgement):
1. Does the cover state one specific gap with the meaning word first, and leave it open? Does it still read at 130 pixels wide?
2. Is every number real, sourced and paid off? Does a list's N equal its item slides?
3. Does slide 2 stand alone and deliver a payoff in 12 words?
4. One idea per slide; non-final bridge; slides = payoffs + 3 only when that skeleton fits 4 to 10 total (payoffs ≤7)? Count optional context/recap too.
5. One CTA, after the payoff, matching the intent, with no bait; a keyword DM only with an instantly delivered asset?
6. One dialect, one digit system, correct spelling and bidi (proofread and lint clear)?
7. Caption: new first line, keyword in sentence 2, at most 5 hashtags, the same CTA; per-slide captions and alt text on every slide?
8. Original content, nothing that looks copied; any AI image flagged?
9. Could a stranger read the cover in two seconds and each slide in eight?

Report to the user in one line, in their `uiDialect` (eg «جاهز: مفيش مشاكل» · gulf «جاهز: ما فيه مشاكل» · levant «جاهز: ما في مشاكل» · msa-white «جاهز: لا توجد مشكلات») or what is left and why, never a dump of findings. Then set `checkpoint: "script"` (guided) or `"design"` (fast), `rev` + 1, `meta.updatedAt`.

## 6. Review point 2 (guided) and the hand-off
1. Load **carousel-design**: it builds the Studio (Script view in guided mode, Design view in fast mode), publishes it and returns the link. Record it in `spec.meta.studioUrl`. The team log goes in `spec.ext.teamLog` before the hand-off (`[{"k": "pitch", "t": "…"}]`, at most six lines, one per key, at most 160 characters each; `scripts/board_check.py --spec` checks it); the Studio shows it under the script summary and under the design stage.
2. Checkpoint 2, in the user's dialect: Studio Script link on its own line, what to inspect, three fitted rendered covers (`render.mjs --covers`, one shock cover) and the style sheet (`render.mjs --style-sheet`), one recommendation and reason. Creator locks hook/style or delegates with «زي ما تشوف» and director states which. Standing `brand.ext.styleChoice` skips only the style half. Wait before art or pictures; no pasted script/caption. Team fast has its own A/B checkpoints; ready keeps the creator's hook.
3. If the user asks for changes in chat, extract the latest Studio spec first, use spec_edit.py under the director's pen, re-run the check loop and republish to the same link (carousel-design does the republish).

## 7. After the user approves (guided)
The page sets `approvals.script` and moves to `design`. Read the page back (carousel-design extracts the spec). If the user edited slides in the Studio, **refresh what depends on them**: the `perSlide` and `alt` entries of the changed slides, the numbered summary in the caption `body`, the caption's `firstLine` if the cover changed, and any `sources` whose number moved. Re-run the check loop; republish only if something changed. Round 4: visual plan → free design → review sheet; gate the artifacts with `board_check --stage huddle`. Round 5 reviews the renders **before checkpoint 3**.

After creator design approval, in order: write `creativeMemory` with `brand_io.py remember --slug S --file memory.json`; append `hooks.history` (`postId, date, family, hookId, cta, architecture`); deliver the kit; ask once how/where to publish (`brand.ext.publish`, posting guide). Memory records actual idea/cover/family/move/preset/motion/intent/CTA/verdict and creator feedback; omit pitch/panel fields for rounds that did not run. No memory for abandoned unfinished work. Never mistake a remembered publishing preference for permission.

## 8. Special flows
- **Source material** (article, PDF, notes, transcript): team fast, fresh transformed copy and source pack as needed; no improvised fifth lane. **Creator's own Reel/post:** ready-script from step 2, keep their hook/order and request approval for added words; no new angle. Spoken openers may be compressed only with creator approval. Never call the carousel a video.
- **Soft-sell** (offer, results, lead magnet): same flow, `contentType: "soft-sell"`, intent `sell`. Prices, dates, quantities, guarantees and testimonials come only from the user, verbatim; no invented scarcity («آخر القطع»، عرض لفترة محدودة) without a date or quantity the user gave. A keyword-to-DM CTA only with a real asset that is delivered instantly (`cta.md`).
- **Single post** (`format: "single"`): one `poster` slide (`headline`, optional `kicker`, `sub`, `bullets` ≤ 4, `cta`); no counter, no swipe cue, no bridge; each caption-pack array has one entry; the cover limits apply to the poster.
- **Different dialect for this post**: set `locale.dialect` for this spec only. Digits and swipe cue stay the brand's. Hooks, deny markers and CTA wording follow the post's dialect.
- **Image needs:** only after hook/style lock and art's slide-type decision: visual artist owns measured slots, prompts, manifest and inspection; director obtains approval, runs the connected tool and `plates.mjs apply`. Use visual-prompts as the prompt reference, never ad-hoc fitting or Arabic inside an image.

## 9. Editing a finished post
Copy edits belong to **carousel-create**. Use carousel-design only to extract the latest spec and republish to the same URL. Rewrite the requested fields here, run the check loop and refresh dependent captions (section 7). Re-read and merge if the page has a newer `rev`.

## 10. Edge cases
- **No brand and the user will not onboard**: continue with defaults (Western digits, `neutral` swipe cue, dialect asked once). Offer onboarding once at the end, not before.
- **Slide count:** plan 4 to 10 including cover; 4 to 6 are fine, never more than 10. Do not pad. For a creator's shorter finished script, offer a structure choice without adding words silently; do not change platform gates.
- **A topic that needs facts you do not have**: ask for them in one message, or write the post around what the user can attest.
- **The user changes the dialect mid-way**: rewrite the affected copy from the angle stub, do not patch words.
- **A request for Reels, video editing or Canva edits**: say what this skill does (posts and carousels) and point to the right tool; do not start the flow.
- **A pasted API key**: do not use it, do not store it, do not echo it; keep keys in the connector's own settings, never in chat.

## Exact spec forms
- Validate with `python scripts/validate.py spec <file> --lint --format json`: `spec` is a required positional document kind, not an option. Kinds: `brand`, `spec`, `preset`, `occasion`, `hook`, `plan`, `qa-report`.
- `cta.kind`: `save`, `send`, `question`, `keyword-dm`, `follow`. Sharing uses `send`; `share` names a slide layout.
- `sources[].kind`: `url`, `file`, `user`, `ownData`, `calc` (case-sensitive). Put references in top-level `sources` and link `sourceIds` on the slide, or `number.sourceId` for a figure.
- `style.overrides` is a flat map of dotted token paths to scalar strings, numbers or booleans. Use `{"type.scale.heroTarget": 140}`; do not pass a `[min,max]` array such as `{"type.scale.hero": [120,150]}`.
- `captionPack` permits only `firstLine`, `keywordLine`, `body`, `cta`, `hashtags`, `perSlide`, `alt`, `asset`. `captionPack.sourceIds` is not allowed; link sources on the slides instead.
