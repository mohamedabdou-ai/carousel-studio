# Cover motion

Slide 1 ships as a looping MP4 (1080×1440, 30 fps, 5–6 s, no audio) beside its PNG. Motion is **on by default**; "calm" is an option. The cover's finished design is frame 0 and the last frame, so the loop has no visible seam and Instagram, which has no cover picker for carousel videos, shows the finished cover first. The loop in the approved prototype (counter roll, word wipe, word drops, heartbeat to flatline, hold, cue nudge) is the quality floor: every recipe must feel at least that deliberate.

## 1. The poster-first timeline
For every element, the state at time `t` is a pure function of the timeline:

| Time (defaults) | State |
|---|---|
| `0 → holdIn` (0.4 s) | rest: the finished poster |
| `holdIn → resetEnd` (0.75 s) | the poster breaks apart (≤ 0.35 s, all elements together; anything that jumps must be at opacity 0) |
| `resetEnd → each element's window` | hold the starting state |
| window `t0 → t1` (staggered) | build toward rest with the recipe's easing |
| `→ settleBy` (5.6 s) and to the end | rest again, held to 6.0 s |

Counters write formatted text in the brand's digits and reserve their final width, so layout never shifts. Frame 0 equals the exported PNG of slide 1, and the last frame equals frame 0 (gate V1: SSIM ≥ 0.995 and PSNR ≥ 45 dB; no blank frames between 0.4 and 5.6 s; at most 3 flashes a second). In the HyperFrames lane frame 0 is compared with a screenshot of the composition at t = 0 taken in the same browser engine that draws the frames, not with the Studio painter's PNG: the two rasterisers differ at glyph and texture edges, and on the textured presets (notebook, heritage) that alone put frame 0 at SSIM 0.988 and blocked a correct video.

## 2. Recipes in v1
| Id | Feel | Pick it for | What it does |
|---|---|---|---|
| `calm` | calm | only when the user asks for it («من غير حركة»، «هادي»): never the default | words fade up by word (24 px rise, 80 ms stagger); the highlight bar draws; the number pops (0.92 → 1); the content settles from scale 1.03; chrome last |
| `counter` | calm | big numbers, number-led lists | the other headline words land first; the number counts up and lands with a 1.00 → 1.06 → 1.00 tick. Values above 9 start at about one third, never zero |
| `highlight-sweep` | calm | **the default**: opinions, reframes («مش X… ده Y») and every topic with no stronger story (the word-cascade) | words drop in one by one; the emphasis highlight sweeps along the reading direction, then the word pulses once |
| `stamp` | story | decisions, myth vs fact, verdicts | the emphasis word drops in (scale 1.55 → 1.0, fast ease-out, then one 3% squash on impact) and a ring is drawn around its ink; the ring keeps at least 12 px from every other word and from the header rules, stays through the story and the first part of the final hold, and is gone (0.4 s) before the poster rests. The ring is a motion overlay and is **not in the poster**: if the post's bold move is the ring, make the poster carry it (a `number` cover, a `bar` or `underline` emphasis) |
| `reorder` | story | chaos to order, frameworks, steps | words start displaced and glide into place, line by line |
| `story` | story | news, stories, cases, and «mistakes / kills / loses» topics (the heartbeat that races and flatlines) | a short built-in metaphor (heartbeat, rising bars, coin stack, check stamp, spark burst). In a free band it accompanies the title; in center mode it hands over to words starting at 1.15 s and is gone by 1.63 s |
| `drop-clock` | story | urgency: deadlines, «آخر فرصة»، hours and minutes | a clock hand races while the poster is apart, then the title lands |
| `map-dots` | story | spread: countries, cities, branches, «حول العالم» | dots light up across a band one after another, then the title builds |
| `curtain` | story | launches: دخلت، أطلقت، نزلت، رسميًا، جديد/جديدة، launch, new | accent bars close over real headline lines during reset, then retract toward the reading end 0.18 s apart; each line is pulled out exactly behind its bar. Sub and media have their own bars |
| `zoom` | story | a short marked phrase, a verdict or reframe | the whole content camera frames the marked words (else number, else first word), pushes 4% for 0.8 s and pulls back for 1 s as context returns. A fixed content viewport protects header/footer throughout reset and motion |
| `notify` | story | product news with a Latin product name, or a direct question to the reader | a contrast-safe bubble pops from its reading-start tail, three dots type for about 0.6 s, then whole words arrive 0.11 s apart; the bubble dissolves and leaves the poster's own words in place |
| `split` | story | change, rename, comparison: بقى، بقت، بدل، مقابل، ضد، vs, →, now | words on either side of the first change marker travel from opposite sides together, meet with one 3% impact, and erase a drawn divider. Without a marker use line 1 against the rest, or two halves of one line |
| `none` | – | fallback when the browser has no H.264 encoder | static cover, PNG only |

Sparse covers (headline only, including a neutral swipe cue) stretch their own story rather than add idle drift: curtain opens through 4.0 s with a broader cubic wipe, zoom uses a 1.2 s push and 1.7 s pull, and notify gives its outlined bubble a longer arrival/exit and larger typing dots. Words and chrome stay in their poster positions. Where the words are already visible, the emphasis wipe retraces an underline overlay instead of clipping their ink away. Curtain moves Notebook's real lines as units, preserving its connected inline word layout.

Coming in 1.1 (do not offer): `morph`, `cash-wipe`, `scale`. A spec that names an unshipped recipe falls back to `calm` with a NOTE.

## 3. Choosing (`CS.motion.recommend`, in this order)
Motion is on and the engine picks a story from the cover's own words; the first match wins. `recommend` reads the hook, the angle, the cover text and the caption's first line, so write `cover.motion` with the same order (a Python sandbox has no `recommend`):
1. two or more urgency words (آخر فرصة، فورًا، ساعات، دقايق، الحين، هلق) → `drop-clock`
2. two or more spread words (دول العالم، مدن، انتشار، فروع) → `map-dots`
3. architecture `myth-fact`, hook family P4, or two or more decision words (قرار، الحقيقة، خرافة، vs) → `stamp`
4. a «mistakes / kills / loses» word (أخطاء، غلط، تموّت، خسارة) → `story` with the heartbeat symbol
5. a change marker in the cover (بقى/بقت/بقوا، اتغيّر، بدل، مقابل، ضد، قبل … بعد، vs, →, now; never «ولا» alone) → `split`
6. a numeral in the cover hook (a year is not one) or a `stat`/`number` slide → `counter`
7. architecture `steps` or `framework`, or how-to words (إزاي، خطوات، شلون) → `reorder`
8. news naming a Latin product (Claude, ChatGPT, Gemini, Higgsfield, Instagram…), or a question addressed to the reader (عندك…؟ إنت…؟ Are you…?) → `notify`
9. launch words (دخلت، أطلقت، نزلت، رسميًا، جديد/جديدة، launch, new) → `curtain`
10. architecture `news`, `story` or `case-study`, or news and story words → `story` with a spark or the topic's symbol
11. a marked phrase (`==…==`) of one or two words → `zoom`
12. **anything else → `highlight-sweep`** (the words drop in one by one and the key phrase is highlighted). `calm` is chosen only when the user asks for it, or as a preset-allowed variety fallback.

The script-to-spec picker uses the same order. In a `post-*` folder it reads the newest earlier sibling's `spec.json`; if that post used the same recipe, it takes the next matching allowed rule, else the first different allowed recipe. It prints `motion: <new> (the last post used <old>)`. Missing/unreadable siblings are ignored. Preset defaults stay unchanged.

The user can switch recipe, feel (`calm` or `story`) and external plate in the Motion tab. In the spec: `cover.motion = { "recipe": "counter", "feel": "calm", "seconds": 6, "fps": 30, "source": "internal" }`. Seconds are 5–6; fps is 30. The preset lists the recipes it allows (`motion.allowed`).

## 3b. The motion designer's checks (from the encoded frames)
The storyboard written before the encode is a plan from the recipe's code. After the first encode, pull the six frames from the MP4 itself (use `render.mjs --contact-sheet` for posters; inspect saved encoded frames at the six storyboard times if available, else mark that check unverified and use kit metrics) and check, with measured numbers:
- **Clearance:** an annotation keeps at least 12 px from other words and from the header and footer rules.
- **Motion share:** the loop moves for at least 40% of its length. Target `stillShare` ≤60%; `V1.still-hold` notes >60%. Keep the final hold near two seconds and give the rebuild a closing beat.
- **No empty stretch:** gate `V1.thin-frames` (NOTE) flags a run over 0.6 s in which only the header and footer are on screen; start the rebuild earlier or keep one element of the story visible while the cover is apart.
- **The bold move in frame 0:** what the story stamps, counts or underlines is already in the poster, which is also the grid thumbnail.
- **The cue:** with an arrow cue the swipe word nudges toward the next slide twice and settles. With the neutral cue there is nothing to nudge: the counter carries the pull.

## 4. Arabic motion rules
- Animate by **word** (`.w`) or **line** (`.cs-ln`) only; never by letter (it breaks joins).
- Opacity only on a wrapper around whole words, lines, slots or decoration; never on a text node.
- Animatable properties: opacity, 2D transform, `clip-path: inset()`, SVG stroke offset. No filter, blur, blend mode, mask, letter-spacing or font-size animation, and never a change of `direction`.
- Transforms are logical: "from the start" means from the right in Arabic and from the left in English.
- `prefers-reduced-motion` affects only the live preview (opacity-only); exports are always full motion.

## 5. External motion (optional, Q19)
With a video tool connected and the user's agreement, AI animates **only a text-free background plate**: first frame equals last frame (or ping-pong), subtle motion, locked camera. The type layer builds on top with `calm`; the loop gate still applies. In Claude Code the plate is a `<video>` layer inside the HyperFrames composition; in the Studio it is decoded frame by frame under the page. If the Studio path is not ready, say «الحركة الخارجية متاحة في Claude Code» and offer the internal motion instead. Prompts and checks: the `visual-prompts` skill (`visual-prompts/references/motion-plates.md`).

## 6. How it is rendered
The cover is generated as one HTML file in HyperFrames composition format (`cover.hf.html`) from slide 1's own DOM and CSS plus the timeline. Studio: the page seeks it frame by frame at 30 fps, paints each frame, converts it to BT.709 limited-range I420 itself, encodes H.264 (level 4.0) in the browser and writes the MP4 with `faststart` and BT.709 limited range stated in the SPS and the container, the same facts the HyperFrames lane writes. `cover.hf.html` is only built on request (the source files). Claude Code defaults to the internal encoder. HyperFrames runs only with `--video hyperframes`; no download prompt. `check_video.mjs` verifies it (`lanes.md`). If a browser has no H.264 encoder the kit keeps the static cover and says «صدّر الفيديو من الكمبيوتر».

## 7. When the user asks for something else
| Request | Answer |
|---|---|
| «من غير حركة» | `recipe: "none"` or `calm`; a NOTE (V1 static) appears, not an error |
| «أبطأ / أسرع» | seconds 5–6 only; stagger and easing belong to the recipe |
| «حرّك كل كلمة حرف حرف» | no: letter animation breaks Arabic joins; offer word-by-word |
| «حركة تانية للموضوع ده» | show the three nearest recipes by the order above and let the Motion tab preview them |
| a longer or audio video | not in v1: carousel covers are short, silent loops |
