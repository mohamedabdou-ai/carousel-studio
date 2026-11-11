# The seven errors

Seven mistakes make an Arabic carousel look amateur or lose swipes: small text, a wrong ratio, a generic design, crowding, a static cover, a random structure and a repeated call to action. Each one is a lint. The engine finds it before export, the Check screen shows it, and `/audit` reports it for a carousel made elsewhere. The report also states the slide count, so the audit always has eight lines.

`CS.qa.sevenErrors(results, spec, ran)` builds that report from any list of findings. `ran` says which scopes were run (`{ text, rendered, export }`); an error whose scope was not run reports `n/a` instead of a false pass.

```js
const results = await CS.qa.runRendered({ spec, tokens, deck });
CS.qa.sevenErrors(results, spec, { export: false });
// { errors: [{ id: "small-text", title, status: "pass" | "fix" | "block" | "note" | "n/a", findings: [...] }, ...],
//   slideCount: { n: 9, status: "pass", findings: [] } }
```

The status of a line is the worst open finding in it (BLOCK, then FIX, then NOTE). Findings the user overrode do not count.

The procedure for screenshots (intake, safety, the report in the user's dialect) is in `audit.md`. The "Auditing a screenshot" paragraphs below only say how each error looks in an image, because there the checks are made by eye and by the copy gates on transcribed text, not by the DOM.

## At a glance

| # | Error | الخطأ | Rules | Worst verdict |
|---|---|---|---|---|
| 1 | Small text | خط صغير | `D3.body-floor` `D3.meta-floor` `D3.hero-floor` `T1.hero-small` | BLOCK; FIX for a cover that is too small at 130 px |
| 2 | Wrong ratio | نسبة أبعاد خاطئة | `D1.*` | BLOCK |
| 3 | Generic design | تصميم عام بلا هوية | `D7.no-brand` `D7.default-fonts` `D7.default-layout` `D8.rhythm` `D9.dead-zone` | NOTE; FIX for a run of identical slides or a dead band |
| 4 | Crowding | ازدحام | gate `C2` and `D6.lines` `D6.rows` `D6.lone-word` | FIX; BLOCK above 35 words |
| 5 | Static cover | غلاف ثابت | gate `V1` (`V1.static`, `V1.loop`, `V1.blank`, `V1.flashes`) | NOTE when motion is off; BLOCK for a broken loop |
| 6 | Random structure | بنية عشوائية | `C5.skeleton` `C5.bridge` `C5.voice-drift` `C6.list-count` `C6.slide2-promise` | FIX; BLOCK when the cover number lies |
| 7 | Repeated CTA | دعوة مكررة | `C7.cta-repeat` `C4.multiple` | FIX; BLOCK for two different asks |
| + | Slide count | عدد السلايدات | `C5.slide-count` `C5.slide-count-low` `C5.slide-count-range` | BLOCK outside 2-10 including the cover; FIX below 4; NOTE at 4-5; 4-6 is valid |

Thresholds are in `data/platform-instagram.json`; the exact conditions are in `qa-gates.md`.

## 1. Small text · خط صغير

**What it is.** Type below the floors of the 1080-wide canvas: body under 42 px, small and chrome text under 30 px, a cover hero under 96 px.

**Why it costs.** A phone shows the slide at about a third of its size and the profile grid shows the cover at 130 px wide. The cover has roughly two seconds to be read; tiny type is the first thing people give up on.

**How it is caught.** `D3.*` reads the computed size of every text element; `T1.hero-small` scales the hero to 130 px wide and wants 14 px or more (the hero is then at least about 117 px on the canvas). Between 11.5 and 14 px it is a FIX; below 11.5 the hero is under 96 px and `D3.hero-floor` already blocks.

**How to fix.** Shorten the text so the engine can set it larger, or split the slide in two (`D3` offers «قسّمها لسلايدين»). Never shrink the floors.

**Auditing a screenshot.** Count the characters in a line of body text: more than about 42 means type under the 42 px floor or a column that is too wide. Imagine the cover 130 px wide: the headline must still be clearly the biggest thing on it.

## 2. Wrong ratio · نسبة أبعاد خاطئة

**What it is.** Slides that are not 1080×1440, mixed sizes in one post, a PNG with an alpha channel or a colour profile that is not sRGB, a JPEG over 8 MB.

**Why it costs.** Instagram crops every slide to the first item's ratio. Scheduler and API uploads accept only 4:5 to 1.91:1 JPEG, so the kit carries a 1080×1350 version cut from the same rectangle (y 45-1395). A one-pixel mismatch shows as a crop or a bar.

**How it is caught.** `D1.render-size` on the rendered slide; `D1.png-size`, `D1.jpeg-size`, `D1.ratio`, `D1.alpha`, `D1.srgb`, `D1.jpeg-bytes` and `D1.decode` on the exported files, read from the image headers.

**How to fix.** Export again from the Studio. The Studio never produces a wrong size on its own; the error appears for files that were resized or edited elsewhere.

**Auditing a screenshot.** Compare width and height of every file: 1080×1440 (0.75) is the in-app size, 1080×1350 (0.8) the scheduler size. Anything else, or two ratios in one carousel, is the error. Screenshots of a phone screen cannot be judged for ratio; ask for the original files.

## 3. Generic design · تصميم عام بلا هوية

**What it is.** A post that uses the preset exactly as shipped: no brand colour or font, the most common Arabic web fonts (Cairo, Rubik, Tajawal) that nobody chose, and most slides on their default layout.

**Why it costs.** The best covers use one background, one ink and one accent that belong to the creator. A default look is invisible next to them.

**How it is caught.** `D7.no-brand` (no token comes from the brand layer), `D7.default-fonts` (a common font the brand did not choose; a font the brand chose never triggers it), `D7.default-layout` (more than 60% of the slides on the preset's default variant without overrides). The three D7 checks are NOTEs: advice, never a block. Two more catch the sameness a default look produces: `D8.rhythm` (more than three slides in a row with the same type and variant) and `D9.dead-zone` (an empty band of a quarter of the sheet on the cover), both FIX.

**How to fix.** Bind the brand palette and fonts in Brand Home, try another font pairing on the user's own hook, give two or three slides another layout variant.

**Auditing a screenshot.** Look for a look-alike of the common fonts, a palette that is not the account's, and the same layout on every slide. Report it as a NOTE; this one is a judgement.

## 4. Crowding · ازدحام

**What it is.** Too much text for one swipe: a body over 25 words, more than 4 bullets, more than 50 words on a slide, a cover with more than 12 words or 8 rows, text over too many lines.

**Why it costs.** Readers take in about a fifth of a page; a slide that needs study gets swiped past. One idea per slide is what makes the carousel a swipe funnel.

**How it is caught.** Text scope: `C2.title-words` (6), `C2.body-words` (25) and `C2.body-hard` (35, the only overridable one), `C2.bullets` (4), `C2.dense-words` (45 for checklists), `C2.slide-words` (50), `C2.bridge-words`, plus the cover limits of `C1`. Rendered scope: `D6.lines` (3 on the cover, 4 on slide 2, 6 on body slides, 8 on lists), `D6.rows` (8 on the cover), `D6.lone-word`.

**How to fix.** Cut, or split the slide: the fix hint says which. Move the second idea to its own slide and keep the bridge line.

**Auditing a screenshot.** Transcribe the text and run the copy gates; count lines by eye.

## 5. Static cover · غلاف ثابت

**What it is.** A cover with no motion, or a motion that does not loop back to the finished poster.

**Why it costs.** The first slide is a video that holds the finished design at frame 0 and returns to it, so the feed and the grid always show the real cover. A static cover gives up that second of attention.

**How it is caught.** `V1.static` is a NOTE when motion is off or no cover video was produced (motion is on by default, so this only appears when the user or a missing H.264 encoder turned it off). When a video exists, `V1.loop` compares frame 0 with the poster and the last frame with frame 0 (SSIM at least 0.995, PSNR at least 45 dB), `V1.blank` and `V1.flashes` guard the in-between frames. The loop numbers come from the exporter through `CS.qa.loopCheck`.

**How to fix.** Turn motion on in the Motion tab and export again.

**Auditing a screenshot.** A PNG cover alone can only raise the NOTE. If the user supplies the MP4, compare its first and last frames with the poster.

## 6. Random structure · بنية عشوائية

**What it is.** Slides in no deliberate order: the first slide is not a cover, the last is not a call to action, slides end without a bridge to the next, or the cover promises «7 أدوات» and delivers five.

**Why it costs.** Every slide has to earn the next swipe. A count that does not match breaks the promise of the cover, which is the one thing a list post sells.

**How it is caught.** `C5.skeleton`, `C5.bridge` (every non-final slide of the listed types), `C5.voice-drift` (Python), and `C6.list-count`: for a listicle or steps post, a counted number on the cover («5 أدوات», digits or Arabic-Indic) must equal the number of item and step slides. That last rule is a BLOCK. `C6.slide2-promise` adds that slide 2 carries the count (or names the first item), because Instagram re-serves a carousel from slide 2 to people who never saw the cover. The numbers 2-99 are counted only when a noun follows them, so «5 ساعات» next to «7 أدوات» does not confuse it.

**How to fix.** Make the cover number match the slides, or add or remove items; add a bridge line; open with a cover and close with a call to action.

**Auditing a screenshot.** Read the slide types in order. Check the cover number against the count of item slides, and look for a teaser line at the bottom of each content slide.

## 7. Repeated CTA · دعوة مكررة

**What it is.** The same ask as the last posts (save, save, save), or two different asks in one post.

**Why it costs.** One call to action, after the payoff, matched to the goal of the post, rotated across posts. Repeating it trains the audience to ignore it.

**How it is caught.** `C7.cta-repeat` compares the post's CTA kind with the last two posts in the history; `C4.multiple` counts the distinct kinds in this post (an offer slide and the closing slide may repeat one ask). Related, same gate group: `C4.count` (none), `C4.position`, `C4.early`, `C4.intent`, `C4.bait` and `C4.keyword-asset`.

**How to fix.** Pick another CTA kind from the ones that fit the goal; the message lists them.

**Auditing a screenshot.** Needs the previous post's CTA from the user or from Brand Home history; without it report `n/a`.

## The slide count

At most 10 slides, including the still or video cover: Instagram’s publishing API and most schedulers accept at most 10 items. A focused carousel of 4, 5 or 6 slides is complete; 6 to 10 is an optional sweet spot, never a reason to pad the post. Under 2 or over 10 is BLOCK; 2 to 3 is FIX; 4 to 5 may carry a NOTE.

## Reading the report

| Line | Say it like this |
|---|---|
| `pass` | nothing to fix |
| `note` | advice only; the post exports |
| `fix` | the post exports with a badge; say which slide and what to change |
| `block` | export is closed until it is fixed (or, for overridable rules, until the user chooses «صدّر رغم ذلك») |
| `n/a` | this scope was not checked here; say what is missing (the rendered deck, the files, the history) |

The wording of every finding, in Arabic and English, comes from `data/qa-rules.json`; do not rewrite it, add the slide number and the fix hint.
