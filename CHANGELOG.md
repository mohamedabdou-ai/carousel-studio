# Changelog

All notable changes to Carousel Studio (كاروسيل ستوديو) are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project follows [Semantic Versioning](https://semver.org/). The plugin version in `plugins/carousel-studio/.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json` always matches the newest entry.

## [Unreleased]

### Your own script

- Paste pipe headings, bold Arabic slide headings and mixed separators directly; no parsing copy is needed. Backticks and emphasis keep their text, and trailing source mentions stay out of slide copy.
- Script links become shared sources on their own slides, with tracking removed. Your figures can be attested in one explicit step after your confirmation.
- A safe spec editor changes hooks, text, styles, sources, captions, alt text and calls to action. Deliberate edits are recorded beside the post and survive both parsing and fill re-runs, with revision checks and fresh QA counts.
- Automatic splits stay within the platform slide limit. Longer pasted decks are kept in full with the shortest neighbouring merge candidates; a missing closing line is offered for your approval.
- Scripts written the way creators write them in chat are read as meant: «١ — الكافر» and «سلايد ٨ — القفلة» name the slide, a line that starts with a number stays copy, the bold title under a bare «**سلايد ٣**» is kept, emoji lines become the list, and «*…*» emphasis no longer leaves asterisks.
- A slide too long to hold runs on into the next slide at your own sentence end, every word kept. «زي ما هو» keeps every slide as written, and every length limit on your words now accepts «تجاوز».
- The last slide keeps your question as its title and your options under it; three asks in one line are offered as a shorter choice, never cut for you.
- Your caption and the hashtags you name go in word for word, and can be kept for every post.

### Design

- The art director owns every slide, the cover included, fixes empty bands, weak hierarchy, text on media and crowding without being asked, and never leaves a giant word that says nothing.
- «غيّر الستايل» with no name shows the other styles on your own cover and slide 2 to pick from.
- «انشر» posts to Instagram only unless you name another platform, with the moving cover first.

### Cover motion

- Four new cover stories, each with its own movement: Curtain (accent bars pull away line by line), Word zoom (the cover opens on its key word, then the camera pulls back), Notification (the headline arrives as a message being typed) and Before/after (the two halves of the headline collide).
- The cover story is chosen from the cover's own words, and two posts in a row never get the same one.
- The counter shows the rest of the title before the number counts, and large numbers count up from about a third instead of zero.
- The centered story shows its title within about a second and a half, instead of holding a nearly empty card.

## [1.1.1] - 2026-11-05

### Fonts

- Rubik is no longer included. Every style keeps its own fonts, and Cairo stays available for a brand that wants a common look.

### بالعربي

لم يعد خط Rubik ضمن الإضافة. كل ستايل يحتفظ بخطوطه، وخط Cairo متاح للبراند الذي يريد شكلًا مألوفًا.

## [1.1.0] - 2026-10-26

First public release.

### The team

- A creative team of nine roles led by a Creative Director: strategist, copywriter, Arabic editor, audience panel, art director, motion designer, visual artist and QA producer. In Claude Code and Cowork each role is its own agent; in the Claude app the same roles run as stages of the main skill.
- Every post starts with two directions, one safe and one bold. Then 12 or more hooks from at least four families compete for the cover, and the Creative Director settles the duel on clarity first.
- An audience panel of three personas cast from the brand's real audience reacts to the directions, the hooks, the script slide by slide (a drop-off map) and the final cover.
- An independent Arabic editor reads the copy alone and can veto it before design.
- An eight-lens review (idea, hook, flow, value, voice, craft, proof, call to action) ends in ship, revise or kill.
- The fast lane: say «بسرعة» and a smaller team works in fewer steps.
- The team remembers what you posted, loved and rejected, and shows a short log of what it decided and why.

### Writing

- Dialects: Egyptian, simple "white" Arabic and English, plus Gulf and Levantine in beta.
- A hook library of 26 families with scoring, a compression step for covers, and angle scoring.
- Captions, per-slide captions, Arabic alt text and at most five hashtags for every post.
- No invented numbers: every figure needs a source.

### Design

- Three styles: Creator, Poster and Notebook. The art director designs every inner slide for its topic; the cover is an engine design.
- An Arabic typesetting engine: joined letters, isolated Latin and number runs, numbers bound to their nouns, fit-to-box line breaking, one digit system per design (Western by default, Arabic-Indic on request).
- A looping 6-second MP4 cover (1080×1440) whose first frame is the finished design, with nine cover stories, encoded in the browser.
- Quality checks on every slide before export, each with a fix: word counts, safe zones, contrast, empty space, headline size at thumbnail scale, the 4:5 crop, numbers that need a source, and the brand handle in the header.

### The Studio and Brand Home

- The Studio, a self-contained page that runs in the browser on phone or computer: edit text in place, switch styles, preview in the feed and at thumbnail size, check and export.
- The publishing kit: 3:4 PNG slides, 4:5 JPEG crops, the MP4 cover, a PDF, captions and alt text, in one ZIP of about 3 MB for eight slides.
- Brand Home with a Brand Book built from a short onboarding in the user's dialect.

### Privacy and license

- The plugin sends no data: no server, no account, no telemetry. The few network requests it can cause are listed in `PRIVACY.md`.
- Apache License 2.0, with `NOTICE` and `TRADEMARKS.md`.

### بالعربي

الإصدار العام الأول. فريق إبداعي كامل داخل Claude: اتجاهان لكل بوست، ومنافسة هوكات على الغلاف، ولجنة من جمهورك، ومدقق لغوي يملك حق الرفض. يكتب بالمصري والعربي الأبيض والإنجليزي، والخليجي والشامي تجريبيًا. ثلاثة ستايلات، ومحرك عربي يضبط الحروف والأرقام والكلمات الإنجليزية، وغلاف فيديو يتحرك، وفحص لكل سلايد قبل التصدير، واستوديو يعمل في المتصفح، وحزمة نشر كاملة. الإضافة لا ترسل أي بيانات.
