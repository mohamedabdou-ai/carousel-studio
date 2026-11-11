# Brand lookup

Every post is written for a brand: a creator, business or client. Find it before writing, take only what you need. Brand-setup owns profile changes, including standing style/publishing choices explicitly made by the creator.

## Where to look, in this order
1. **An attachment** in this conversation: `brand.json`, a Brand Book PDF, or a pasted brand card.
2. **The Project file**: a small text file that starts with `[Carousel Studio brand capsule v1]`. It is enough to write in the right voice (below).
3. **Brand Home**: the long-lived page of the brand (Brand Book, Plan, Ideas, Posts). It embeds the canonical `brand.json`; carousel-design extracts it for you into a scratch `brand.json`.
4. **The workspace** (Claude Code and Cowork): `${user_config.workspace_dir}/brands/<slug>/brand.json`, default folder `~/CarouselStudio` (`CS_WORKSPACE` overrides it; run `brand_io.py` with `--dir` set to the same folder). `brand_io.py list` without `--dir` also finds a brands folder created elsewhere, from any folder. Never search the disk for `brand.json`: a copy outside the workspace is stale or a test file.
5. **Nothing found**: offer onboarding once, in one line («عايز نجهّز البراند الأول؟ ممكن تقول بعدين»), and carry on with the defaults below if the user prefers to skip. Skipped sections come back later, only when a post needs them (voice before the first caption, visual identity before the first design).

Several brands: use the one the user named; else the workspace default (`.default`, or the plugin's `default_brand` setting, which reads `${user_config.default_brand}` in Claude Code and is empty when unset); else ask one numbered question.

## The capsule
```
[Carousel Studio brand capsule v1]
brand: <name> (<slug>) | dialect: eg | register: dialect | digits: western | swipe: arrow-rtl
voice: <up to 200 characters: tone, words to use and avoid>
palette: bg #F6F2EA ink #14120F accent #FFD23F | fonts: <display> / <body> / <latin> | preset: creator
home: <Brand Home link or ->
```
With only the capsule you have the dialect, digits, swipe cue, voice summary and preset. You do **not** have the voice fingerprint, the allow list, the pillars, the audience or the post history: skip `voice_check.py` and the repetition checks, and do not ask for them.

## What you read, and what it drives
| Brand field | Used for |
|---|---|
| `locale.dialect`, `register` | the post's dialect and register (a per-post override beats it) |
| `locale.uiDialect` | how you talk to the user (default: the dialect) |
| `locale.digits` | `spec.locale.digits`. Western unless the brand opted into `arabic-indic`; never switch it silently |
| `locale.appLanguage`, `swipeCue` | `spec.locale` as they are (`ar` → `arrow-rtl`, `en` → `arrow-ltr`, `mixed` → `neutral`) |
| `locale.latinTerms` | names that stay Latin (tools, brands) |
| `identity.goal` and `strategy.intentMix` | the default intent: followers lean to save and reach, clients to save and send, sales to sell; choose the intent the mix and the last posts are short of, unless the angle's lens clearly implies another |
| `audience.pains`, `desires`, `objections`, `faq`, `awareness` | angles, the cover's pain words, the default awareness |
| `voice.tone`, `use`, `avoid`, `ctaStyle`, `samples` | how the copy sounds. Learn from the samples; never paste a line from them into a new post |
| `voice.allow` | words the proofreader must not flag (dialect spellings the user confirmed) |
| `voice.fingerprint` | `voice_check.py` |
| `visual.presetId` | provisional `style.presetId` (`<id>@1.0`) and tie-breaker for the art shortlist, never a silent final choice |
| `ext.styleChoice` | `ask` by default; a shipped preset id only after an explicit standing choice; skips only the style question at checkpoint A (guided checkpoint 2 / ready before art) |
| `ext.publish` | remembered preference `manual` or `tool`; skips the preference question, never grants permission or selects accounts/platforms |
| `strategy.pillars` | pillar fit when scoring angles |
| `hooks.familyPriors`, `hooks.history` | angle and hook priors; no repeat of the last 2 CTAs or families; the 30 most recent hooks for similarity |
| `creativeMemory` | the creative team's memory (the last 30 approved posts: idea, winning cover, hook family, move, which pitch won, preset, motion recipe, intent, CTA kind, the panel's result, series, what the creator loved or rejected); the director reads it at the brief so no family, move or recipe repeats three posts running, the CTA kind differs from the last two and no recent cover is echoed (`brand_io.py memory`) |
| `tools.caps` | whether to offer generated visuals at all (visual-prompts decides) |

## Per-post choices that do not touch the brand
- **Dialect for this post**: the user's words («بالخليجي المرة دي») or `--dialect`. It goes in `spec.locale.dialect` only. Digits and swipe cue stay the brand's; the proofreader, the hook skeletons, the deny markers and the CTA wording follow the post's dialect.
- **Fast or guided**, **single or carousel**, **soft-sell**: per post.
- Everything else (palette, fonts, handle) belongs to the brand; a user who wants a one-off change makes it in the Studio as a post override.

## With no brand
Ask one numbered question for dialect and, if a handle is wanted on slides, the real handle. Brand-setup can make a minimal profile. Defaults: Western digits, `appLanguage: mixed`, `neutral` swipe cue, provisional `creator@1.0`, no fingerprint. Only `creator`, `notebook`, `poster` ship. Rank by fit/pre-flight, default only breaks a tie; show the style sheet before design. Say once that a saved brand makes the next post faster.

## Standing choices
The art director's brief supplies a ranked recommendation for the three shipped styles; before the lock the director runs that as a read-only role pass, no art dispatch/design. The creator chooses on `render.mjs --style-sheet` with the fitted covers. A brief's `الاتجاه البصري` is a direction, not a preset. A brand default is never “always this style”. Only an explicit standing choice (“always this one”) stores `brand.ext.styleChoice` as `creator`, `notebook` or `poster`; missing means `ask`. Then checkpoint A skips only the style half. A one-post override does not change the standing choice; asking to choose each time stores `ask`.

After approval, ask once in the creator's dialect whether they want manual files or their connected publishing tool. Save `brand.ext.publish` as `manual` or `tool`; missing means ask. A remembered `tool` preference still requires the creator's word each use, named accounts/platforms, and that tool's own instructions/limits. Never assume a platform or ship a tool-specific recipe.

Use brand-setup, with the canonical workspace (`--dir ROOT` when needed):
```text
python <brand-setup>/scripts/brand_io.py set --slug S --path ext.styleChoice --value notebook
python <brand-setup>/scripts/brand_io.py set --slug S --path ext.publish --value manual
```
Both fit the existing unrestricted `brand.ext` object; no schema change is needed. With only a capsule/no persistent profile, retain the answer for the session and do not claim durable memory.

## Privacy
Use the profile, not people. Do not copy private details (client names, phone numbers, emails) into copy, specs or captions; use roles. Brand data stays in the user's own artifact or folder; do not send it anywhere, and do not echo secrets (a pasted key is never used or stored).
