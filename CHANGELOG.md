# Changelog

All notable changes to Carousel Studio (كاروسيل ستوديو) are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project follows [Semantic Versioning](https://semver.org/). The plugin version in `plugins/carousel-studio/.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json` always matches the newest entry.

## [1.2.0] - 2026-11-12

### Script and picture repairs

- Script links keep their visible words, and tool names inside sentences are no longer removed as source credits. Action-only endings keep their whole request.
- Saved Studio captions, bridges and unrecorded design choices survive rebuilds. Edit conflicts have explicit backup/reset commands, and adding a CTA clears an earlier kept ending.
- Older decks over 10 slides can reopen in the builder and spec editor for shortening; the slide-count export block remains. Boards, caption bounds, team guidance and evals use the current slide limits.
- Picture checks respect video refs and creator framing. Applying pictures preserves frames and backdrops, refreshes design approval state and keeps transparent sources as PNG; recorded edits no longer restore old plate encodings.
- Cover-lab commands, clip-cover handoffs and Egyptian dialect-strength briefs now match their supported workflows. The browser dependency allowlist permits only the pinned mediabunny loader.

### Team handoffs and review

- Source material now uses the team fast lane, with three fitted cover choices and a style sheet before design or pictures start. Short ideas stay within 4 to 10 slides, cover included.
- Every lane gets the QA producer's full export and veto, then a fresh Creative Director review before design approval. Ready scripts keep their words and explicitly kept endings; absent audience panels are never invented.
- Specialist handoffs name script paths, write permissions and one spec writer. Named free blocks merge atomically into the latest spec without replaying an old cover or overwriting newer copy.
- Production boards retain separate script and final reviews, accept explained verdicts and measured video-frame times, and check compact fast/ready logs without demanding rounds that did not run.
- Standing style and manual/tool publishing preferences can be remembered per brand. Publishing follows the creator's chosen tool's own instructions and permission each time; no platform or publishing tool is assumed.

### Pictures and brand voice

- Steps, checklists and closing slides gain a picture-led media variant in every style, keeping step labels, ordinals and calls to action.
- Free designs can place an asset through a safe empty picture placeholder; authored image sources and CSS URLs remain forbidden.
- Covers can show a separate creator-supplied product or partner logo on a clear ground, in stills and cover video.
- The shared renderer resolves asset refs through the same blob route as the Studio. Picture refs can hold up to 2,000,000 characters, and the plates tools read that limit from the schema.
- Egyptian brands can choose light or full dialect strength once during setup. The saved setting travels in the brand capsule; existing brands keep their voice until they choose a level.

### Arabic text and visible checks

- Type Arabic prefixes, Latin phrases, punctuation and model versions as ordinary text. The engine isolates them, keeps names with their numbers and short connectors with a neighbour, and reserves more room for mixed display lines.
- Separate Latin and numeric runs retain their order across sentence punctuation and Arabic prefixes. Glued one-letter Arabic prefixes get a small visual gap from Latin text without changing the creator's copy.
- Hidden controls are blocked across the whole spec, including captions and alt text. Direction marks and special spaces are normalised for rendering; safe proofread repairs are re-checked and report the field changes they actually applied.
- Legitimate connectors such as «الـAPI،», «بـ@الاسم» and «بـ50%» keep their wording, and «تجرّبه» no longer receives a false spelling suggestion.
- Underlines stay continuous below Arabic dots in every preset, including the notebook's double underline.
- Rendered checks flag tight text padding, cramped sibling panels, clipped artwork and stranded short words. Cut text, icons and pictures stop the export; a drawn shape cut by its frame and a short word at a line end are reported for review. Contrast follows the painted cover ground.
- In a free design, a painted element is judged as a panel only when it holds content or is an empty card-sized frame. Drawn scenes, chart bars and symbols keep their tones and raise no finding.
- Existing posts keep their layout: short words are not glued to their neighbours, a Latin word does not raise a title's line height, and an ellipsis after a Latin word stays at the end of the Arabic sentence.
- Times, ratios and joined Latin pairs keep their reading order inside Arabic text: «10:30», «3:1», «9:00-10:30», «Q&A», «AT&T». A product name stays on one line with the number after it («iPhone 15», «GPT 5»).
- A highlighted phrase is one highlight again, not one chip per word, and a prefix such as «بـ» or «الـ» keeps the font of its headline.
- Panels with deliberate air receive layout advice rather than a required container-fill fix. An empty card still needs fixing.
- Free design errors name accepted logical CSS properties.

### Publishing limits and checks

- Carousels stop at 10 slides including the still or video cover. Short posts of 4 to 6 slides no longer receive a slide-count FIX, and the Studio explains why an eleventh slide cannot be added, duplicated or split.
- Numbered lists count their actual members across layouts, including proof slides, without counting surrounding context.
- Repeated CTA kinds and hook families are advice for a creator's ready script; team-written copy keeps the variety checks.
- Hook scoring and copy checks agree on the hero and sub-line of a two-beat cover.
- Notebook Latin words follow their Arabic slot's font and weight.
- Completed command-line exports exit successfully with FIX findings; `--strict` restores the old exit code. QA reports are always written, and a requested missing cover video blocks the export with a clear error and JSON details.
- The MP4 writer retries a transient library load up to 3 times. MP4 uses only the pinned mediabunny library; ZIP needs no downloaded library.
- Memory commands and writing guides show the exact allowed values and spec forms before they are needed.

### Your own script

- Paste pipe headings, bold Arabic slide headings and mixed separators directly; no parsing copy is needed. Backticks and emphasis keep their text, and trailing source mentions stay out of slide copy.
- Script links become shared sources on their own slides, with tracking removed. Your figures can be attested in one explicit step after your confirmation.
- A safe spec editor changes hooks, text, styles, sources, captions, alt text and calls to action. Deliberate edits are recorded beside the post and survive both parsing and fill re-runs, with revision checks and fresh QA counts.
- Automatic splits stay within the platform slide limit. Longer pasted decks are kept in full with the shortest neighbouring merge candidates; a missing closing line is offered for your approval.
- Scripts written the way creators write them in chat are read as meant: «١ — الكافر» and «سلايد ٨ — القفلة» name the slide, a line that starts with a number stays copy, the bold title under a bare «**سلايد ٣**» is kept, emoji lines become the list, and «*…*» emphasis no longer leaves asterisks.
- A slide too long to hold runs on into the next slide at your own sentence end, every word kept. «زي ما هو» keeps every slide as written, and every length limit on your words now accepts «تجاوز».
- The last slide keeps your question as its title and your options under it; three asks in one line are offered as a shorter choice, never cut for you.
- A script that ends without a call to action is yours to keep: say «زي ما هو» and the post exports, with your choice recorded as «تجاوز». Nothing is added for you.
- A numbered script keeps one slide per number when a rule separates the intro or the caption, and a title that starts with a digit is read as a title.
- Tool names inside a sentence stay in your copy; only a whole-line or labelled credit becomes a source.
- Your caption and the hashtags you name go in word for word, and can be kept for every post.

### Design

- Splitting at the slide limit shows one clear message. Mixed item and step layouts keep one list count, and script lists without ordinals still check the cover's promise.
- Studio hook placement and headline meters use the same first beat as the copy checks. Cover-lab sheets and rankings retain your hook IDs and labels.
- Variety checks keep running when a post carries malformed extension data.
- Try surviving hooks across styles in one cover-lab run, with measured fit, ranked findings and a sheet at feed size and 130 px. A style sheet shows your own cover and slide 2 in every shipped style before you choose.
- Cover fitting searches line arrangements without changing your words, keeps forced breaks and offers a punctuated second beat in the sub-line. Creator's top and center anchors work, and cover controls explain which type setting sizes each line.
- The cover line search avoids leaving a preposition at a line end, splitting a Latin name across lines or stranding one word on the last line, and it never separates «الـ» from its number. Number covers are searched too.
- A picture or logo whose asset is missing leaves no empty frame, and the export names the missing asset.
- Hook choices are rendered before they are offered; a stronger set includes a truthful shock cover with a different kind of tension.
- The art director owns every slide, the cover included, fixes empty bands, weak hierarchy, text on media and crowding without being asked, and never leaves a giant word that says nothing.
- «غيّر الستايل» with no name shows the other styles on your own cover and slide 2 to pick from.
- After design approval, the plugin asks once where and how you want to post, and remembers manual files or your connected tool. It does not publish itself or bundle tool-specific recipes.

### Pictures on slides

- Measure each picture frame against the post's real text and style before generating an illustration, then fit, pad, flip and embed it with one local plates command. No image packages or hand-made scripts are needed.
- Keep originals and an inspected picture manifest so rebuilding the spec or changing styles can restore and recrop every picture in one command. The tool records dimensions, AI provenance and the no-text check, and reports stale crops or ignored pictures.
- Picture prompts now use the measured ratio and a safe subject band; step, checklist and call-to-action slides keep their engine layouts when a picture fits.

### Cover motion

- Clip covers give the footage a full-width 16:9 window above the headline in every style. The local renderer reports frame progress while composing.
- The clip contrast check follows the ink that covers the footage, so a headline placed just below the window no longer stops the export.
- Clip covers accept footage whose video track starts late, close on a clean loop even with grainy footage, and report trim, codec and duration problems in plain words. A single post cannot carry a clip cover.
- The cover lab and the style sheet run without the clip file.
- Standalone clip checks match browser-decoded poster colours. Dark footage no longer receives still-loop advice from a whole-frame average.
- Attach your own local clip inside the cover's media window for a silent 6 to 15 second video, with trim points, fit and focus. Both ratios are recomposed after a style change or export, with the original layout and readable text.
- Clip covers hold the finished poster first and return with a dissolve for similar endpoints or a wipe for one-way footage. Their PNG, JPEG and PDF cover come from the MP4 first frame, avoiding a second colour round trip in the loop check.
- The Studio marks the attached video and previews its decoded poster. Reattach the local file when reopening the Studio; clip bytes never enter the spec or saved page.
- Number covers keep the same text boxes in the still and motion frames. Stamp rings and story symbols draw above the card, and a story symbol can be chosen explicitly.
- Stamp, sweep, story and counter keep readable headline content throughout their reset and rebuild. Story symbols stay clear of the readable title and leave before later text enters their space.
- Four new cover stories, each with its own movement: Curtain (accent bars pull away line by line), Word zoom (the cover opens on its key word, then the camera pulls back), Notification (the headline arrives as a message being typed) and Before/after (the two halves of the headline collide).
- The cover story is chosen from the cover's own words, and two posts in a row never get the same one.
- The counter shows the rest of the title before the number counts, and large numbers count up from about a third instead of zero.
- The centered story shows its title within about a second and a half, instead of holding a nearly empty card.

### بالعربي

**حد الشرائح**

- الكاروسيل لا يتجاوز 10 شرائح، والغلاف (صورة أو فيديو) محسوب منها. الكاروسيل القصير من 4 إلى 6 شرائح مقبول دون أي ملاحظة، والأستوديو يشرح سبب رفض الشريحة الحادية عشرة.

**السكريبت الجاهز**

- الصق السكريبت كما تكتبه في المحادثة: عناوين مثل «١ — الغلاف» و«سلايد ٨ — القفلة» تُقرأ كما قصدت، والسطر الذي يبدأ برقم يبقى نصًا.
- كل كلمة تبقى كما كتبتها. قل «زي ما هو» فيخرج البوست بنصك دون إضافة، حتى لو انتهى بلا دعوة لإجراء.
- محرر آمن يغيّر العنوان والنص والستايل والمصادر والكابشن، وتعديلاتك تبقى محفوظة بعد إعادة البناء.
- روابط السكريبت تصير مصادر على شرائحها، وأرقامك تُعتمد بخطوة واحدة صريحة بعد تأكيدك.

**التصميم والغلاف**

- معمل الأغلفة يعرض أكثر من عنوان على أكثر من ستايل في مرة واحدة، مع قياس الملاءمة وترتيب النتائج. ولوحة الستايلات تعرض غلافك وشريحتك الثانية بكل الستايلات قبل أن تختار.
- غلاف بفيديو من عندك: أرفق مقطعًا محليًا من 6 إلى 15 ثانية فيظهر في نافذة عريضة فوق العنوان، بلا صوت، وبالنسبتين.
- أربع حركات جديدة للغلاف: الستارة، تقريب الكلمة، الإشعار، وقبل وبعد. ولا يتكرر النوع نفسه في بوستين متتاليين.
- مدير الفن مسؤول عن كل شريحة، ومنها الغلاف: يعالج الفراغ وضعف التدرج والزحام دون أن يُطلب منه.

**الصور داخل الشرائح**

- أمر واحد يقيس إطار كل صورة على نص البوست الفعلي ثم يقصّها ويضعها. الصور الأصلية محفوظة، وتغيير الستايل يعيد قصّها بأمر واحد.
- شرائح الخطوات والقوائم والدعوة لها شكل تقوده الصورة في كل الستايلات، والغلاف يقبل شعار منتج أو شريك.

**العربية مع اللاتينية**

- الكلمات اللاتينية والأرقام داخل الجملة العربية تظهر بترتيبها الصحيح دون علامات يدوية، وحرف العطف الملتصق بكلمة لاتينية يأخذ مسافة صغيرة حتى لا يُقرأ حرفًا منها.
- خط التسطير يبقى متصلًا تحت النقاط في كل الستايلات.
- فحوص جديدة على الشكل النهائي: نص ملتصق بحافة حاويته، رسم مقصوص، كلمة قصيرة معلّقة في آخر سطر.
- اختيار درجة العامية المصرية مرة واحدة عند إعداد البراند: خفيفة أو كاملة.

**الفريق والنشر**

- أربعة مسارات واضحة للعمل، وفي كل مسار مراجعة من المدير الإبداعي قبل اعتماد التصميم، ومسؤول الجودة يوقف التصدير عند أي خطأ تقني.
- بعد اعتماد التصميم تسألك الإضافة مرة واحدة: هل لديك أداة نشر متصلة، أم تريد الملفات لتنشرها بنفسك؟ الإضافة لا تنشر عنك ولا تفترض أداة بعينها.

**التصدير**

- التصدير المكتمل ينتهي بنجاح حتى مع ملاحظات غير مانعة، وتقرير الجودة يُكتب في كل مرة. إذا طُلب فيديو الغلاف ولم يخرج، يتوقف التصدير برسالة واضحة.

**بوستاتك القديمة**

- البوستات التي صمّمتها من قبل تُفتح وتُصدَّر بالشكل نفسه. بوست يزيد على 10 شرائح يُفتح لتقصيره، ولا يُصدَّر قبل ذلك.

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
