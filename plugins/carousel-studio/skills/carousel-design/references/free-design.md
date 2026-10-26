# Free design: how the team designs each inner slide

Art Director designs inner slides inside preset chrome; planner is the fallback (7.1). Read: CD §§2–5; AD all; QA §§3,5,9. Contract: `data/free-design.json`.

## 1. The job
Every slide earns the next swipe: one thing for the reader (a number, a verdict, the thing itself) and a reason to turn the page. The bar: an anchor on every slide, no dead space, a fresh idea per topic, never a template with swapped words. The planner failed by crowding (a two-line title over four icon rows with subtitles, text overlapping) and by emptiness (one icon floating in white); hand-built slides scored 7-8.5 out of 10, the planner 5-6.

Design from the claim outward: **claim** (one sentence a 14-year-old gets; two claims, two slides) → **picture** (show it, don't say it) → **words** (final, short, labelling the picture) → **bridge** (the loop that pulls the next swipe).

## 2. Retention arc
Plan the open-loop chain before drawing.

| Where | Job |
|---|---|
| Cover (engine design) | a question or gap it does not answer; hero at most 6 words |
| Slide 2 | pays off the cover at once (first answer, strongest item, proof), opens a bigger loop, works alone (Instagram re-serves from it) |
| Each slide but the last | ends on a bridge of at most 8 words: an unfinished sentence, «بس…»، «لكن…»، a count («باقي 2»), predict-then-reveal; never a recap |
| Middle (40-60%) | a pause or a turn: one giant word or a flip; one pause per 5 inner slides at most, never adjacent, never right before the ask |
| Last two | the payoff closes every loop; then one ask: save (tied to a future moment) or send (to a named person), designed into the slide (on a free CTA the footer save pill steps aside so the counter keeps its place) |

**Length follows the story:** 6-7 slides for a news item or one reveal, 8-10 for a list or how-to, 11-12 only if every slide pays (the gates note under 8 and fix under 6; a 2-slide reveal is exempt). A cover that promises N delivers N.

**News drill** (a launch like «Claude Duet»; facts only from the source): what changed, shown in use (slide 2) → who it changes things for → the detail that matters → the turn («لكن…» the catch) → what to do Monday (a notes card) → the ask.

## 3. One slide = one idea = one hero
- **Words:** title ≤6; body ≤18 with a card or field, ≤25 only in text-led D. Art labels ≤3 words each, 24 total. Over length: return to the copywriter; never change words.
- **Groups:** at most 4; lists/timelines ≤4 one-line rows, no subtitles.

A — title / anchor / body.
B — anchor first, title inside the field.
C — giant word or number plus one line.
D — body as hero at 64 px or more.
E — two panels side by side.
F — tilted card bleeding off an edge.

Neighbours use different skeletons; A ≤3 of 7 inner slides. The plan names the clause that becomes the hero.
- **One primary visual,** at least twice the size of anything else.
- **Breathing room:** 32 px or more between groups, 24 px or more from the frame; a container's content fills 65% or more of it.

**Counter-example, the planner's timeline:** a two-line title, four rows each with icon, title and subtitle (about 45 words, 13 elements), text overlapping. Fix: three numbered chips, one verb each, no subtitles, the current one twice as big; or the one step that matters as a giant numeral. More than that is two slides.

## 4. The anchor menu
Prefer type-built anchors: number, word, stamp, mock, CSS diagram. An icon in a container appears ≤1/post, only when the icon is the noun; icons are never bare.

| Anchor | Use when the slide says | Build and limits |
|---|---|---|
| Big number | a count, price, time, sourced figure | `number` at 300-440 px on a `field` tone, unit beside it; source id or «رسم توضيحي» |
| Giant word | a pause; the word the idea turns on («كمل»، «احفظ») | 300-450 px on `field` or `invert`; one per 5 slides |
| CSS diagram | a real relationship | divs, borders, bars and labels; name the exact structure |
| Stamp | a verdict, myth and fact | rotated (-8deg) bordered word over a struck line; one, off body text |
| Ticket or receipt | a price, a plan, a total | dashed border, 3-4 rows, total on a field |
| Chat mock | a prompt, an answer | `.f-chat`, `data-from`; 3 bubbles, about 12 words |
| Notes or checklist card | steps, a keepsake | tape on `::before`, tilted card, `bullets.N`; 4 one-line rows |
| Comparison | X against Y | two `sides.N` panels, the winner bigger on a field |
| Before and after | a change, a result | before muted and struck, `arrow-down`, after loud |
| Short timeline | a sequence | 3-4 numbered chips, one word each, no subtitles |
| Hero object | the thing itself | `data-object` hero on a field; one, not a trio |
| Icon in a container | a named tool or noun | `data-icon` as tile, ring, sticker, badge or giant, lg and up; never bare |
| Quote card | someone's line | quote mark on `::before`, card, attribution; 25 words |
| Simple chart | 2-4 values compared | divs as bars, heights from classes, `items.N.value`; one lit; sourced or «رسم توضيحي» |

**No stock symbols:** hourglass for time, coins for money, lightbulb for ideas, rocket for growth. Name an exact pack icon id or a CSS diagram the lane can build; otherwise use type. No repeated tile-heading stacks, nested cards, glow, glass or emoji.

## 5. Filling space without clutter
- **Limits:** empty-band design limits: cover <15%, working slide <12% (D9.* stage-0 NOTE is not a design pass); the anchor about 30-45% of the canvas (peaks 40-60%); all text about 16-25%; at most 2 of 12 grid cells empty.
- **Grow the anchor before adding anything.** Structure fills space; texture, ruled lines, gradients, ghost numerals and sparkles do not (removal test: if nobody would miss it, delete it).
- **Moves:** a flex column (title on top, anchor `flex:1`, bridge at the bottom); a field bleeding to the edges or an object off one edge; a hero 3 times the body size; ≥2 of 7 inner slides on `invert`/`s1`/`s2`; accent blocks ≤4 of 7; never 3 neighbours in one non-base tone. A pause slide's type fills 28% or more of the canvas.

## 6. Preset DNA cheat sheet
One hand per preset: icons, objects, stickers, mocks and containers match. Only `creator`, `notebook` and `poster` ship. Tokens carry the colours; `field` = the accent as ground, `invert` = dark ground (the engine paints the ground the tone moves: in `creator`, `field` is the yellow card colour, so a `field` container comes out yellow).

| Preset | Palette roles | Containers, marks | Signature; avoid |
|---|---|---|---|
| `creator` صانع المحتوى | paper, white card, yellow accent, pink and blue support | 4 px ink outline, 36-44 px radius, hard shadow to the end side, tilt up to 6deg; marker, circle, strike, stamp, word sticker | giant word or numeral on yellow, stamp over a struck myth; no dark brands or icon clusters |
| `notebook` دفتر ملاحظات | ruled paper, navy ink, red pen | sticky notes with tape, torn paper, hand-drawn radii; circled words, hand arrows, double underline | the circled hook on a notes page, one giant word on torn paper; no formal topics |
| `poster` بوستر | cream, deep green ink, rust accent | square, hairline frame, label tab «شكل 3», ticket, ledger; stamp, crop marks, leader lines | numbered plate, price ticket, worked ledger; no rounded cards or shadows |

## 7. The free-lane syntax
### 7.1 Where it goes
`slide.free = {"html": "...", "css": "..."}` on any slide except the cover; html at most 12,000 bytes, css 6,000. The slide keeps its `type` and fields: they are the copy. The engine draws the preset's header, footer, counter and swipe cue around your html (inside `main.cs-content.cs-free`); never draw those, never set `free.locked`. Write `free/<slide-id>.html` and `.css` (both, beside `spec.json`), then merge and validate (`<skill>` = the carousel-design folder):
```
node -e "const base='.f-root{height:100%;display:flex;flex-direction:column;gap:32px;padding-block-end:32px}.f-title{margin:0;font-family:var(--cs-font-display);font-size:var(--cs-fs-title)}.f-body{margin:0;font-size:var(--cs-fs-body);line-height:1.5}.f-bridge{margin:0;line-height:1.5;font-size:var(--cs-fs-small);font-weight:700;color:var(--cs-ink)}';const f=require('fs'),s=JSON.parse(f.readFileSync('spec.json','utf8'));for(const x of s.slides){const a='free/'+x.id;if(f.existsSync(a+'.html'))x.free={html:f.readFileSync(a+'.html','utf8').trim(),css:base+f.readFileSync(a+'.css','utf8').trim()}}f.writeFileSync('spec.json',JSON.stringify(s,null,2))"
python <skill>/scripts/validate.py spec spec.json --checkpoint design --lint --brand brand.json
```
**Fallback:** a slide without `free` goes to the planner (`plan.mjs`), only when the creator asks for the automatic layout or a slide still fails after two rounds; say so. Fast mode («بسرعة») still designs every inner slide by hand, with one render/review-sheet check. At the design checkpoint `validate.py` notes each inner slide left to the planner (`FREE.planner`).

### 7.2 HTML
Tags: `div span p h2 h3 ul ol li strong b em mark small br figure figcaption bdi`. Attributes: `class dir data-field data-icon data-object data-mark data-size data-treatment data-tone data-from data-edit data-role`. Classes match `f-*` or `cs-*` (use `f-`). Removed: `style`, `id`, `on*`, `href`, `src`, script, img, svg, iframe, style elements, comments. Build rows from `div` and `p` (list markers cannot be styled: there is no `list-style`).

### 7.3 Fields
`data-field="path"` on an empty element: the engine fills it from the slide through the text pipeline (words, bidi, digits), so the Studio and the copy gates keep working. Paths (N from 0): `title body headline sub kicker bridge ord number attribution bullets.N sides.N.label sides.N.text items.N.title items.N.text items.N.value cta.text demo.lines.N.text`. The validator refuses a path the slide does not hold; every field the slide holds appears once (C2.text-dropped, C2.text-duplicated). `number` prints the value and the unit together («1 دولة»); to size the unit apart, set `number.unit` to "" and write the unit as literal text with `data-edit="unit"`. `demo.caption` is not a field: write it as literal text and drop it from the spec, or the copy gates count it twice. `==word==` inside a field is the preset's emphasis device.
Literal text goes through the same pipeline and copy gates: use it only for labels that claim nothing (a unit, «قبل», a stamp word). `data-edit="name"` (a short name) marks a literal the creator may edit in the Studio; an editable literal cannot hold a `data-field`.

### 7.4 Art
- **Icon** `<div data-icon="clock" data-size="xl" data-treatment="tile">`: a name from `data/icons/pack.json` (find one: `python <skill>/scripts/icon_search.py --query "<title>" --body "<body>"`). Sizes `xs sm md lg xl hero`; treatments `bare chip tile ring duo sticker badge giant`.
- **Object** `<div data-object="phone" data-size="hero">`: `coin-stack phone megaphone lightbulb trophy calendar hourglass key shopping-bag book chat-bubble bar-chart`; sizes `md lg xl hero`.
- Never put `data-mark` on a word already highlighted with `==…==`.
- **Mark** `data-mark="circle | underline | strike | arrow-down | arrow-hook | sparkle | tick | scribble"` on the element it belongs to, drawn around or under it after the text fits, in the preset's hand. At most two a slide; leave room (arrow-down: about 90 px below).
- **Tone** `data-tone="base | field | invert | s1 | s2"` on a container paints its ground and ink from the resolved tokens (a preset without that tone keeps the surrounding colours; the `var(--cs-*)` tokens inside the container take the tone's values).
- **Chat** a container with class `f-chat`; its `p` or `div` children carry `data-from="me"` (end side) or `"them"` (start side). The engine draws the bubbles (me on the accent, them on the surface with a 3 px ink outline), so give the container a different ground such as `var(--cs-bg)`, and you place and size it.

### 7.5 CSS
Write bare selectors (`.f-card`, `.f-row:nth-child(2)`, `.f-card::before`): the engine adds the slide scope and refuses a written-out one. Allowed: `f-`/`cs-` classes, the allowed tags, attribute selectors on the allowed attributes, `:first-child :last-child :nth-child()`, `::before ::after` with `content:""`. No at-rules (one canvas, 1080 px wide: no `@media`), nesting or `!important`.
Properties: the allow-list `css.properties` of the contract (flex and grid layout, `position` but never fixed or sticky, sizes, spacing, border, `background`, `color`, type, `transform`, `box-shadow`, `z-index`, `overflow`, `content`). `background` is one colour or `linear-gradient(135deg, a, b)`; `transform` rotate, scale, translate; `font-family` only `var(--cs-font-display)`, `-heading`, `-body`, `-latin`. Absent: opacity, letter-spacing, font-style, filter, outline, float, background-image, list-style, `grid-auto-*`, `url()`.
Tokens: `--cs-bg --cs-surface --cs-ink --cs-ink-muted --cs-accent --cs-on-accent --cs-line --cs-art-s1 --cs-art-s2`; `--cs-fs-hero --cs-fs-title --cs-fs-h --cs-fs-body --cs-fs-small --cs-fs-micro`; `--cs-gap --cs-unit`. Start every text box with `margin:0`; `.cs-free` is a flex column that fills the content zone and grows a single root child to fill it, so give the page one root `div`, make it a flex column and put the anchor on `flex:1`. Latin runs inside a field inherit the weight of their line. Use logical properties so English mirrors; hard shadows fall to the end side, so in Arabic the x offset is negative.

### 7.6 Four examples
The merge command in 7.1 adds this base once per free block. Each slide's `.css` writes **only deltas**, never the base again.
```css
.f-root{height:100%;display:flex;flex-direction:column;gap:32px;padding-block-end:32px}
.f-title{margin:0;font-family:var(--cs-font-display);font-size:var(--cs-fs-title)}
.f-body{margin:0;font-size:var(--cs-fs-body);line-height:1.5}
.f-bridge{margin:0;line-height:1.5;font-size:var(--cs-fs-small);font-weight:700;color:var(--cs-ink)}
```
**Stat** (`poster`): `number` 20, `title` «بتحدد يومك كله», `body`, `bridge`.
```html
<div class="f-root">
 <div class="f-band" data-tone="field">
  <div class="f-num" data-field="number"></div>
  <div class="f-unit" data-mark="underline" data-edit="unit">دقيقة</div>
 </div>
 <h2 class="f-title" data-field="title"></h2>
 <p class="f-body" data-field="body"></p>
 <p class="f-bridge" data-field="bridge"></p>
</div>
```
```css
.f-band{flex:1;display:flex;align-items:center;justify-content:center;gap:32px}
.f-num{font-family:var(--cs-font-latin);font-size:400px;line-height:1}
.f-unit{font-family:var(--cs-font-display);font-size:100px}
```
**Step with a notes card** (`notebook`): `ord`, `title` «اكتب هدفك في سطر واحد», `body`, 2 `bullets` (one holds `==5 دقايق==`), `bridge`.
```html
<div class="f-root">
 <div class="f-head">
  <div class="f-ord" data-field="ord" data-mark="circle"></div>
  <h2 class="f-title" data-field="title"></h2>
 </div>
 <p class="f-body" data-field="body"></p>
 <div class="f-note">
  <p class="f-body" data-field="bullets.0"></p>
  <p class="f-title" data-field="bullets.1"></p>
 </div>
 <p class="f-bridge" data-field="bridge"></p>
</div>
```
```css
.f-head{display:flex;align-items:center;gap:28px}
.f-ord{flex:none;inline-size:104px;block-size:104px;display:grid;place-items:center;font-size:64px}
.f-note{flex:1;position:relative;display:flex;flex-direction:column;justify-content:center;gap:28px;padding:56px 48px;background:var(--cs-surface);border:3px solid var(--cs-ink);border-radius:10px;box-shadow:-10px 12px 0 var(--cs-line);transform:rotate(-1.5deg)}
.f-note::before{content:"";position:absolute;inset-block-start:-30px;inset-inline-start:56px;inline-size:190px;block-size:56px;background:var(--cs-accent);transform:rotate(-4deg)}
```
**Chat** (`creator`): `title` «اطلب منه كده», `body`, 3 `demo.lines` (me, them, me), `bridge`.
```html
<div class="f-root">
 <h2 class="f-title" data-field="title"></h2>
 <p class="f-body" data-field="body"></p>
 <div class="f-stage">
  <div class="f-chat">
   <p data-from="me" data-field="demo.lines.0.text"></p>
   <p data-from="them" data-field="demo.lines.1.text"></p>
   <p data-from="me" data-field="demo.lines.2.text"></p>
  </div>
 </div>
 <p class="f-bridge" data-field="bridge"></p>
</div>
```
```css
.f-stage{flex:1;display:flex;align-items:center;padding:44px 36px;background:var(--cs-bg);border:4px solid var(--cs-ink);border-radius:36px;box-shadow:-8px 8px 0 var(--cs-ink)}
.f-chat{inline-size:100%;display:flex;flex-direction:column;gap:32px;font-size:var(--cs-fs-body)}
```
**Comparison, before and after** (`poster`): `title` «نفس الشغل، مجهود أقل», 2 `sides` (label, text), `bridge`.
```html
<div class="f-root">
 <h2 class="f-title" data-field="title"></h2>
 <div class="f-pair">
  <div class="f-before" data-mark="arrow-down">
   <p class="f-tab" data-field="sides.0.label"></p>
   <p class="f-old f-body" data-field="sides.0.text" data-mark="strike"></p>
  </div>
  <div class="f-after" data-tone="field">
   <p class="f-tab" data-field="sides.1.label"></p>
   <div data-icon="circle-check" data-size="xl" data-treatment="badge"></div>
   <p class="f-title" data-field="sides.1.text"></p>
  </div>
 </div>
 <p class="f-bridge" data-field="bridge"></p>
</div>
```
```css
.f-pair{flex:1;display:flex;flex-direction:column;gap:96px}
.f-before{position:relative;padding:48px 40px 36px;border:3px solid var(--cs-ink-muted)}
.f-after{flex:1;position:relative;display:flex;align-items:center;gap:32px;padding:56px 40px 40px}
.f-tab{position:absolute;inset-block-start:-24px;inset-inline-start:32px;margin:0;padding:6px 20px;background:var(--cs-accent);color:var(--cs-on-accent);font-size:var(--cs-fs-small)}
.f-old{color:var(--cs-ink-muted)}
```

## 8. Arabic and painter rules
- **Arabic** (full rules: `arabic-type.md`): never letter-spacing, word-spacing, italic, justify or opacity on text; no decorative kashida in shipped presets; `بـ/لـ/الـ` joined to Latin is allowed. Latin names, numbers with units and handles are isolated: fields get it from the pipeline, literal text needs `<bdi dir="ltr">`. A number and its Latin unit in two elements of one row (`<span>3.5</span><span>GB</span>`) show as «GB 3.5»: put `dir="ltr"` on the element that holds both (`validate.py` notes it as `FREE.bidi`; fix it before you render). Western digits unless the brand opted into Arabic-Indic.
- **Sizes:** body at least 42 px; chips, labels, captions at least 34 px; nothing under 30 px (D3). Muted ink fails contrast on an accent fill (D4): use `--cs-on-accent`.
- **Painter-safe** (the replay painter draws a subset): `linear-gradient(<angle>deg, ...)` only, never `to right`; no `url()`, filter, blur, mask, clip-path, outline, inset shadow or conic gradient; no opacity, use solid tokens; rotate and scale only blocks (`div`, `p`, flex or grid items), not inline spans. Prefer non-directional icons or `arrow-down` (check a directional icon in the render).

## 9. The self-check before handing off
Render (`node <skill>/scripts/render.mjs --spec spec.json --brand brand.json --out out/ --formats png,qa --variants 3x4 --video none`), open every slide with Read:
1. **Squint test:** name the one winner, then the second, then at most two groups. Two winners: shrink one.
2. **130 px:** render with `--contact-sheet`; Read `out/contact-sheet.png`. Anchor and hero readable. Read every PNG's bottom 330 px for bridge, rule, counter and footer clearance.
3. **No overlap:** no text over text or an icon, nothing cut by the footer, marks clear of neighbours.
4. **Frame and space:** nothing within 24 px of the frame; the empty band and the anchor inside the section 5 limits.
5. **Crowding:** at most 4 groups, about 40 words, rows at most 4; the removal test passes.
6. **The text is all there:** every field once, no stray literal claim, `validate.py` and the QA report clean.
7. **Rhythm:** neighbouring skeletons differ; A ≤3/7; invert/s1/s2 ≥2/7; accent blocks ≤4/7; no pause before CTA. Final slide: one ask.
Fix and render again, at most two rounds a slide; then hand that slide to the planner and say so.
