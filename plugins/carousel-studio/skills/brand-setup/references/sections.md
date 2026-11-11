# Onboarding screens: welcome, the six sections, the close

This is the chat script of the onboarding. `question-bank.md` holds every question in five
dialects, `reference-analysis.md` and `voice-fingerprint.md` hold the analysis, `brand-book.md` the
close. Strings below are the exact text to send in the user's dialect (`eg`, `gulf`, `levant`,
`msa-white`, `en`); `{...}` are slots. Digits in plugin text are Western. Gulf and Levantine
wording is beta until a native reviewer has passed it.

## 1. Message rules (every surface, phone first)
- **At most 2 questions per message**, as numbered choices where there are choices. Replies like «1،3», «١،٣» (accept both digit systems), «الأول والتالت», «تخطّي» and «بعدين» are all understood.
- **A progress line opens every section message** (strings in section 2) and the draft `brand.json` is saved after every section, so «كمّل الإعداد» resumes at `brand_io.py resume`.
- **«عندي حاجة جاهزة»** anywhere: accept pasted text, captions or screenshots, analyse them, pre-fill the section's answers and ask one confirmation question («صح كده؟ 1 أيوه 2 عدّل»).
- **Visual choices appear on a page** (Brand Home choice board), never as a long chat list. In plain chat give at most 4 numbered options with a name and hex codes.
- **Short messages.** No more than 6 lines. Arabic lines never start or end with a Latin word: wrap handles and tool names inside Arabic words or parentheses.
- **Skipped sections come back when needed.** Voice before the first caption, visual before the first design. The Brand Book marks any gap «ناقص».
- **Stay in the dialect** the user picked at the start. After a dialect change (`brand_io.py set --path locale.dialect`), re-run the fingerprint check on the next captions; digits and the swipe cue do not change with it.

## 2. Progress line and common replies
| Slot | eg | gulf | levant | msa-white | en |
|---|---|---|---|---|---|
| progress | القسم {i} من 6: {name} | القسم {i} من 6: {name} | القسم {i} من 6: {name} | القسم {i} من 6: {name} | Section {i} of 6: {name} |
| saved, paused | ماشي، حفظت اللي خلصناه. قول «كمّل الإعداد» وقت ما تحب ونكمّل من {name}. | تمام، حفظت اللي خلصناه. قل «كمّل الإعداد» وقت ما تبي ونكمّل من {name}. | تمام، حفظت اللي خلّصناه. قول «كمّل الإعداد» وقت ما بدك ونكمّل من {name}. | تم حفظ ما أنجزناه. قل «كمّل الإعداد» متى شئت لنتابع من {name}. | Saved. Say "continue setup" whenever you like and we pick up at {name}. |
| section skipped | هنسيب {name} لوقت ما نحتاجه، والدليل هيعلّمه «ناقص». | نخلّي {name} لين نحتاجه، والدليل يعلّمه «ناقص». | منخلّي {name} لحتى نحتاجه، والدليل رح يعلّمه «ناقص». | نؤجّل {name} حتى الحاجة إليه، وسيُعلَّم في الدليل «ناقص». | We will leave {name} until it is needed; the Brand Book marks it "missing". |

Section names (all dialects): الهوية · الجمهور · الصوت · الهوية البصرية · الاستراتيجية · الأدوات.
`brand_io.py resume --format json` returns `next`, `index`, `progress` and `gaps` for the line.

## 3. Welcome and dialect (step 0)
Send it as the first message of an onboarding. It is the only place besides the Studio's About
screen where the maker's line appears, set as the last, quiet line. Before the user has chosen,
use the variant that matches how they wrote the request (Egyptian words such as «عايز» or
«أظبط» → eg; «ابغى» or «أبي» → gulf; «بدي» or «بدك» → levant; English → en); when nothing
shows, use msa-white. The dialect they pick then replaces it for every later message.

**eg**
> أهلًا بيك في كاروسيل ستوديو. هنظبط البراند بتاعك في 6 أقسام قصيرة (حوالي 15 دقيقة)، وبحفظ بعد كل قسم، فتقدر تقول «بعدين» وتكمّل وقت ما تحب.
> أول حاجة: هتكتب بأنهي لهجة؟
> 1. مصري  2. خليجي  3. شامي  4. فصحى مبسّطة  5. إنجليزي

**gulf**
> حياك الله في كاروسيل ستوديو. نضبط البراند حقك في 6 أقسام قصيرة (حوالي 15 دقيقة)، ونحفظ بعد كل قسم، فتقدر تقول «بعدين» وتكمّل وقت ما تبي.
> أول شي: بأي لهجة تكتب؟
> 1. مصري  2. خليجي  3. شامي  4. فصحى مبسّطة  5. إنجليزي

**levant**
> أهلين فيك بكاروسيل ستوديو. رح نضبّط البراند تبعك ضمن 6 أقسام قصيرة (حوالي 15 دقيقة)، وبنحفظ بعد كل قسم، فيك تقول «بعدين» وتكمّل وقت ما بدك.
> أول شي: بأي لهجة بتكتب؟
> 1. مصري  2. خليجي  3. شامي  4. فصحى مبسّطة  5. إنجليزي

**msa-white**
> مرحبًا بك في كاروسيل ستوديو. سنُعدّ ملف علامتك في 6 أقسام قصيرة (نحو 15 دقيقة) ونحفظ بعد كل قسم، فيمكنك أن تقول «لاحقًا» وتكمل متى شئت.
> أولًا: بأي لهجة تكتب؟
> 1. مصري  2. خليجي  3. شامي  4. فصحى مبسّطة  5. إنجليزي

**en**
> Welcome to Carousel Studio. We will set up your brand in 6 short sections (about 15 minutes) and save after each one, so you can say "later" and pick up whenever you like.
> First: which dialect will you write in?
> 1. Egyptian  2. Gulf  3. Levantine  4. Simplified MSA  5. English

**Credit line** (last line of the welcome, nothing else follows it):
- Arabic dialects: من صنع محمد عبده، وحسابه ⁦@mohamed.abdou90⁩ على Instagram لو حبيت تتابعه.
- en: Made by Mohamed Abdou — Instagram: @mohamed.abdou90

After the answer, confirm in the new dialect and ask `W-2` (sub-variety, only for gulf and levant)
together with `W-3` (brand name). Then run:
```
python brand_io.py new --slug <latin-slug> --name "<name>" --dialect <code> [--sub-variety najdi|hijazi|emirati|lebanese|syrian] [--handle @h]
```
Derive the slug from a Latin form of the name (lowercase, hyphens); ask for one if the name has no
Latin form. The profile now exists with defaults (Western digits, register from the dialect, swipe
cue from the app language) and `onboarding.current = identity`.

## 4. The six sections
Each recipe: goal, message pairs (IDs from `question-bank.md`), what can be pre-filled, the save
file, and what the confirmation says. Always finish with the progress line of the next section.

### 4.1 Identity (section 1)
- **Goal:** who, niche, offer, content goal. The goal sets the default intent mix (4.5).
- **Messages:** `ID-01` + `ID-02` · `ID-03` + `ID-04` · `ID-05` + `ID-06` · `ID-07` (optional, alone).
- **Pre-fill from:** a bio, an about page text or a pasted caption the user shares.
- **Proof points** are claims the user can back (a client count, a result, a number of years). Save them as `{ "claim": "..." }`; the number needs a source later (SRC1), so never invent or round one.
- **The handle** prints in the header of every slide, the MP4 and the PDF, so it is the user's real one or nothing: never an example, never a guess from the brand name. No handle yet (`لسه`): leave `handle` out of the file; the engine then leaves the slot out of every slide, and `brand_io.py approve` says so. A stock value (`@yourbrand`, `@handle`, a bracketed token) is refused by `brand_io.py`, and a post that carries one is a BLOCK (gate B2) that nothing else would have caught.
- **Save file** (the angle brackets mark where the user's own value goes; they are not valid in a handle):
```json
{ "kind": "creator", "handle": "@<their real handle>",
  "identity": { "who": "...", "niche": "...", "offer": "...", "goal": "followers",
                "proofPoints": [ { "claim": "..." } ] } }
```
`python brand_io.py save-section --slug S --section identity --file identity.json`

### 4.2 Audience (section 2)
- **Goal:** the person they write for, their countries and Instagram app language.
- **Messages:** `AU-01` + `AU-02` · `AU-03` + `AU-04` · `AU-05` + `AU-06` · then, only when they apply: `AU-07` (app language, when the countries do not settle it), `AU-08` (confirm the awareness stage you inferred), `AU-09` (digits offer), `AU-10` (register suggestion).
- **Countries decide three things** (from `locale-defaults.json`): the dialect suggestion (confirm it against the dialect chosen at the start; never override it), the app language (`ar`, `en`, or `mixed` when the countries differ, for example UAE with Egypt) and therefore the swipe cue («اسحب ←» for an Arabic-UI audience, neutral counter with a quiet progress rail for mixed, «اسحب →» for English). `brand_io.py save-section` re-derives the cue when `appLanguage` changes; say the result and the reason in one line.
- **Digits.** Western stays. Only when the register is MSA, the topic is government, finance, health or legal, or the countries are EG, SA, IQ, SD or YE, add one line: offer Arabic-Indic (`AU-09`), show the user's own hook both ways beside the evidence line (every numeral on the 16 winning Arabic covers was Western), and save `digits: "arabic-indic"` with a `digitsReason` only on an explicit yes.
- **Register.** If the niche is government, finance, health or legal, suggest `msa` or `white` once (`AU-10`).
- **Save file:**
```json
{ "audience": { "persona": "...", "pains": ["..."], "desires": ["..."], "objections": ["..."], "faq": ["..."], "awareness": "problem" },
  "locale": { "countries": ["EG", "AE"], "appLanguage": "mixed" } }
```

### 4.3 Voice (section 3)
- **Goal:** how the brand sounds, measured rather than guessed.
- **Dialect strength:** for Egyptian, ask `VO-09` once before the voice questions when `voice.dialectStrength` is absent. Save the chosen `light` or `full` in the voice section; show its two-line example. A skip or an older profile keeps the existing voice unchanged. Never infer strength from nationality, the interface dialect or a single caption.
- **Messages:** `VO-01` + `VO-02` · `VO-03` + `VO-05` · `VO-04` (3 to 10 captions) + `VO-06` · and, after the fingerprint, `VO-07` + `VO-08`.
- **With captions:** follow `voice-fingerprint.md` (clean, fingerprint, show findings, confirm signatures, three sample lines). **Without captions:** keep the tone chips and word lists, set no fingerprint, and mark `voice` done with the note «من غير عيّنات»; the first posts then use the dialect file's defaults and the fingerprint is computed from the first approved captions.
- **Save file:**
```json
{ "voice": { "tone": { "formalFriendly": 4, "seriousPlayful": 3, "calmEnergetic": 4 },
             "use": ["..."], "avoid": ["..."], "ctaStyle": "...", "samples": ["..."],
             "fingerprint": { } },
  "locale": { "latinTerms": ["ChatGPT", "Claude"] } }
```
The `fingerprint` object is exactly the output of `fingerprint.py --format json`.

### 4.4 Visual identity (section 4)
- **Goal:** colours, fonts, logo, photos, and the references the look is learned from.
- **Messages:** `VI-01` + `VI-02` · by branch: with a brand kit `VI-03` + `VI-04`, without one `VI-09` and then the choice board (`identity-starter.md`) · `VI-05` · `VI-06` + `VI-07` (`reference-analysis.md`) · `VI-08` + `VI-11` · and last `VI-10`, the preset pick on the board once the references are analysed.
- **Logo:** the user adds it in Brand Home; the page stores the asset and builds the data URI of at most 60 KB. In plain chat ask the user to attach it and record `visual.logo.mirror: "never"`.
- **Fonts:** registry ids only (`visual.fonts.display|body|latin`). A font the user uploads is recorded under `visual.fonts.userFonts` as an asset id and stays local; say once that it will not travel inside the exported kit.
- **Save file:**
```json
{ "visual": { "logo": { "mirror": "never" },
              "palette": { "bg": "#F4F4F2", "ink": "#111111", "inkMuted": "#5A5A5A", "accent": "#E3262B" },
              "fonts": { "display": "ibm-plex-sans-arabic", "body": "readex-pro", "latin": "inter" },
              "presetId": "creator", "presetAlternates": ["poster", "notebook"], "locks": [] },
  "references": [ { "id": "r1", "kind": "own", "analysis": { }, "nearestPreset": "creator", "confidence": 0.7 } ] }
```

### 4.5 Strategy (section 5)
- **Goal:** what to post and how often.
- **Messages:** `ST-01` (you propose, they edit) · `ST-02` + `ST-03` · `ST-04` + `ST-05`.
- **Pillars:** propose 3 to 5 from the identity, audience and voice answers. Each has a name in the user's dialect, a `share` (the shares add up to about 1), and the intents it serves; at least one pillar is a save-intent list or framework pillar.
- **Default intent mix by goal:** followers save 0.40 · send 0.25 · reach 0.25 · sell 0.10; clients 0.35 · 0.25 · 0.20 · 0.20; sales 0.30 · 0.20 · 0.20 · 0.30. The user may change it.
- **Posts per week:** default 4 (3 to 5). **Best hours:** as the user states them; default 20:00 to 23:00 in the time zone of their first country (`locale-defaults.json → countries.<code>.tz`); ask when the countries disagree.
- **Save file:**
```json
{ "strategy": { "pillars": [ { "id": "tools", "name": "...", "share": 0.5, "intents": ["save"] } ],
                "roleModels": ["..."], "postsPerWeek": 4,
                "intentMix": { "save": 0.4, "send": 0.25, "reach": 0.25, "sell": 0.1 },
                "bestHours": { "tz": "Asia/Dubai", "slots": [ { "day": "any", "from": "20:00", "to": "23:00" } ] } } }
```

### 4.6 Tools (section 6)
- **Goal:** note what could add images or motion; the plugin is complete without any of it.
- **No question for detection.** Look at the tools connected in this session and group them by capability (`image.generate`, `image.edit`, `image.upscale`, `image.cutout`, `image.relight`, `video.i2v`, `video.i2v.loop`, `source.transcribe`, `insights.ownData`, `design.canva`, `publish.scheduler`) by the shape of their inputs, never by their name. Store opaque references.
- **Messages:** `TL-02` (consent mode) · `TL-03` only when `insights.ownData` exists.
- **Tips** are neutral and by capability («لو وصّلت أداة صور تقدر أعمل خلفيات من غير حروف»), never a product recommendation, affiliate link or sign-up prompt. Never push to connect anything.
- **Save file:**
```json
{ "tools": { "detectedAt": "2026-10-22T10:00:00Z", "caps": { "image.generate": ["server:tool"] }, "consent": "ask-each-post" } }
```

## 5. Just-in-time returns
| When | eg | gulf | levant | msa-white | en |
|---|---|---|---|---|---|
| a caption is requested but voice was skipped | عشان أكتب بصوتك محتاج 3 كابشنات قديمة ليك. تبعتهم؟ ولا أكمّل بصوت عام وأرجعله بعدين؟ | عشان أكتب بصوتك أحتاج 3 كابشنات قديمة لك. ترسلها؟ ولا أكمل بصوت عام وأرجع له بعدين؟ | كرمال أكتب بصوتك بحتاج 3 كابشنات قديمة إلك. بتبعتهم؟ ولا بكمّل بصوت عام وبرجع له بعدين؟ | لأكتب بصوتك أحتاج إلى 3 كابشنات قديمة لك. هل ترسلها؟ أم أتابع بصوت عام وأعود إليه لاحقًا؟ | To write in your voice I need 3 of your past captions. Send them, or shall I use a neutral voice for now? |
| a design is requested but visual was skipped | قبل التصميم محتاج لون وخط. عندك هوية جاهزة ولا أقترحلك؟ | قبل التصميم أحتاج لون وخط. عندك هوية جاهزة ولا أقترح لك؟ | قبل التصميم بحتاج لون وخط. عندك هوية جاهزة ولا بقترح عليك؟ | قبل التصميم أحتاج إلى لون وخط. هل لديك هوية جاهزة أم أقترح عليك؟ | Before designing I need a colour and a font. Do you have a brand kit, or shall I suggest one? |

## 6. Close (after step 6, or when the user says «خلصنا»)
1. **Brand Book ready** (page link; contents in `brand-book.md`):

| eg | gulf | levant | msa-white | en |
|---|---|---|---|---|
| كتاب البراند جاهز. افتحه وراجعه وقول لي لو في حاجة تتعدّل، ولما يعجبك دوس «اعتمد». | كتاب البراند جاهز. افتحه وراجعه وقل لي وش تبي يتعدّل، وإذا عجبك اضغط «اعتمد». | كتاب البراند جاهز. افتحه وراجعه وخبرني شو بدك يتعدّل، ولما يعجبك اضغط «اعتمد». | كتاب البراند جاهز. افتحه وراجعه وأخبرني بما تريد تعديله، وحين يناسبك اضغط «اعتمد». | Your Brand Book is ready. Open it, tell me what to change, and tap "Approve" when it is right. |

2. **Approval** (the user taps «اعتمد» or says «اعتمد»): run `brand_io.py approve --slug S`, rebuild
   and republish Brand Home, print `brand_io.py capsule --slug S` in a code block with the
   instruction to save it as a Project file («حطه في ملفات المشروع»), and keep the Brand Home link.
3. **Thank-you line, once, here and nowhere else** (not on pauses, not on skipped runs, not on later edits):

| eg | gulf | levant | msa-white | en |
|---|---|---|---|---|
| الأداة دي مجانية — كلمة شكر أو ذكر بتفرق معانا. | الأداة هذي مجانية — كلمة شكر أو ذكر تفرق معنا. | الأداة هاي مجانية — كلمة شكر أو ذكر بتفرق معنا. | الأداة مجانية — كلمة شكر أو ذكر تفرق معنا. | This tool is free. A thank-you or a mention means a lot to us. |

The five lines are the `about.thanks` strings of the Studio (the Studio’s language controls.

4. **First carousel offer** with 3 angles already prepared (call `content-angles` with the brand and the niche):

| eg | gulf | levant | msa-white | en |
|---|---|---|---|---|
| جاهز نعمل أول كاروسيل؟ جهّزتلك 3 زوايا، قول لي رقم. | جاهز نسوي أول كاروسيل؟ جهّزت لك 3 زوايا، قل لي رقم. | جاهز نعمل أول كاروسيل؟ جهّزتلك 3 زوايا، خبرني بالرقم. | هل نبدأ بأول كاروسيل؟ جهّزت لك 3 زوايا، اختر رقمًا. | Ready for your first carousel? I have 3 angles lined up; pick a number. |

If the user stops before approving, send nothing of items 3 and 4: only the paused line from section 2.

## 7. After onboarding
- **Edit one section:** «عدّل الصوت», `/brand edit`: open that section's questions with the saved answers shown, save with `save-section`, and offer to re-approve (`approve` raises `version` once a Brand Book was approved before).
- **New brand or client:** `brand_io.py new` with a new slug; it starts at step 0 but skips the welcome. **Switch:** `brand_io.py use --slug S` (and, in the Claude app, the Project of that brand).
- **Change the dialect of a brand:** `set --path locale.dialect` plus `uiDialect` and `register`; ask whether to keep the existing fingerprint. For one post only, the per-post override (`--dialect`) is used instead and the brand is untouched.

### 7.1 Importing a hook bank («ضيف بنك الهوكات», `/brand import`)
1. Ask for the file: Markdown tables, a CSV, or both (a classification CSV beside the Markdown gives the best result). Rows under a client heading are left out automatically; pass `--exclude-ids` for client ranges the file does not mark.
2. Run `import_hooks.py --in bank.md --in bank.csv --brand brand.json --out <workspace>/brands/<slug>/hooks/<pack>.ar.json --format json`, where `<pack>` is the `pack.slug` the script suggests. English rows go to the sibling `.en.json`.
3. Tell the user the counts in one line (imported, lint-only, duplicates, client rows left out, still unclassified). Take the `unclassified` rows and the rows marked `heuristic` in batches of 10: show the text, propose a family from the list, let the user correct, write the answers as `{ "<id>": "<family code>" }` and run again with `--family-map`.
4. Link the pack: `brand_io.py set --slug S --path hooks.packs --json '["<pack>"]'`.
5. If the file carried results columns (`metric`, `value`, `baseline`, `n`) the output holds `pack.familyPriors`. Save it to `hooks.familyPriors` only after the user agrees, and say that it is their own data and stays in their brand. Without such columns, and only with a connected insights tool and a yes to `TL-03`, results can be pulled and written to a CSV with those columns first.
6. The pack is brand-private: it is never exported, never copied into another brand, and its lines are voice evidence, not a template for other users. A line a user has not marked as theirs stays out of the public library.
