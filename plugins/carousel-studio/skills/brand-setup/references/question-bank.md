# Question bank

Questions in five dialects; pairing and save recipes: `sections.md`. Gulf/Levantine are beta.

Contents: [Welcome](#step-0--welcome) · [Identity](#section-1--identity) · [Audience](#section-2--audience)
[Voice](#section-3--voice) · [Visual](#section-4--visual-identity) · [Strategy](#section-5--strategy) · [Tools](#section-6--tools)

Entries: ID, field, input/cap, why, then dialect lines. Fill `{slots}`; keep choice order and Western digits (except the offered digit system). One question/line, ≤20 words, Arabic at both ends; Latin names inside Arabic or parentheses. No tatweel, emoji, phone, email or real person's name.

## Step 0 · welcome

#### W-1 · dialect
`locale.dialect`, `locale.uiDialect` · single choice · asked alone, text in `sections.md` §3.
*Why:* it decides how the plugin talks to you and how your posts are written.
Choices: 1 مصري · 2 خليجي · 3 شامي · 4 فصحى مبسّطة · 5 إنجليزي

#### W-2 · sub-variety (gulf and levant only)
`locale.subVariety` · single choice.
*Why:* a few everyday words differ (أبي أم أبغى، هيدا أم هاد), and one wrong word reads as an outsider.
- gulf: تكتب بالنجدي ولا الحجازي ولا الإماراتي؟ 1. نجدي 2. حجازي 3. إماراتي 4. خليجي أبيض عام
- levant: بتكتب باللبناني ولا بالسوري؟ 1. لبناني 2. سوري 3. شامي عام

#### W-3 · brand name
`name` (and the slug) · text ≤ 80.
- eg: اسم البراند إيه؟ اكتبه زي ما بتحب يظهر.
- gulf: وش اسم البراند؟ اكتبه مثل ما تبي يطلع.
- levant: شو اسم البراند؟ اكتبه متل ما بدك يظهر.
- msa-white: ما اسم العلامة؟ اكتبه كما تريد أن يظهر.
- en: What is the brand called? Write it the way it should appear.

## Section 1 · identity

#### ID-01 · kind
`kind` · 1 creator · 2 business · 3 client. *Why:* an agency keeps one profile per client.
- eg: بتشتغل على: 1. حسابك الشخصي كصانع محتوى 2. نشاط تجاري 3. براند عميل عندك؟
- gulf: تشتغل على: 1. حسابك الشخصي كصانع محتوى 2. نشاط تجاري 3. براند عميل عندك؟
- levant: عم تشتغل على: 1. حسابك الشخصي كصانع محتوى 2. نشاط تجاري 3. براند لزبون عندك؟
- msa-white: تعمل على: 1. حسابك الشخصي كصانع محتوى 2. نشاط تجاري 3. علامة لعميل؟
- en: Who is this for? 1. Your personal account as a creator 2. A business 3. A client's brand

#### ID-02 · who
`identity.who` · text ≤ 400. *Why:* the first line of every About slide and caption comes from it.
- eg: عرّفني بيك في جملة: مين انت وبتعمل إيه؟
- gulf: عرّفني فيك بجملة: من انت وش تسوي؟
- levant: عرّفني عليك بجملة: مين إنت وشو بتعمل؟
- msa-white: عرّفني بك في جملة: من أنت وماذا تقدّم؟
- en: Introduce yourself in one sentence: who are you and what do you do?

#### ID-03 · niche
`identity.niche` · text ≤ 200 (chips plus "other"). *Why:* it picks the hook families and the examples.
- eg: مجالك إيه بالظبط؟ (مثلًا: ذكاء اصطناعي للشغل، تغذية، عقارات)
- gulf: وش مجالك بالضبط؟ (مثلًا: ذكاء اصطناعي للشغل، تغذية، عقارات)
- levant: شو مجالك بالضبط؟ (مثلًا: ذكاء اصطناعي للشغل، تغذية، عقارات)
- msa-white: ما مجالك تحديدًا؟ (مثلًا: الذكاء الاصطناعي للعمل، التغذية، العقارات)
- en: What exactly is your niche? (for example AI for work, nutrition, real estate)

#### ID-04 · offer
`identity.offer` · text ≤ 400. *Why:* soft-sell posts and CTAs need to know what you really offer.
- eg: بتبيع أو بتقدّم إيه؟ (كورس، خدمة، منتج، استشارة، ولا لسه مفيش؟)
- gulf: وش اللي تبيعه أو تقدمه؟ (كورس، خدمة، منتج، استشارة، أو للحين ما فيه؟)
- levant: شو اللي بتبيعه أو بتقدمه؟ (كورس، خدمة، منتج، استشارة، أو لسا ما في؟)
- msa-white: ماذا تبيع أو تقدّم؟ (دورة، خدمة، منتج، استشارة، أو لا شيء بعد؟)
- en: What do you sell or offer? (a course, a service, a product, consulting, or nothing yet)

#### ID-05 · goal
`identity.goal` · 1 followers · 2 clients · 3 sales. *Why:* it sets how many posts aim at saves, sends, reach and selling.
- eg: هدفك من المحتوى: 1. متابعين 2. عملاء 3. مبيعات؟
- gulf: هدفك من المحتوى: 1. متابعين 2. عملاء 3. مبيعات؟
- levant: هدفك من المحتوى: 1. متابعين 2. زبائن 3. مبيعات؟
- msa-white: هدفك من المحتوى: 1. متابعون 2. عملاء 3. مبيعات؟
- en: What is your content for? 1. Followers 2. Clients 3. Sales

#### ID-06 · handle
`handle` · `@name`, Latin letters, digits, dot, underscore. *Why:* it appears on every slide header, so it is the real one or nothing: «لسه» means leave it out, never an example value.
- eg: حسابك على Instagram اسمه إيه؟ (@...)
- gulf: وش حسابك على Instagram؟ (@...)
- levant: شو اسم حسابك على Instagram؟ (@...)
- msa-white: ما اسم حسابك على Instagram؟ (@...)
- en: What is your Instagram handle? (@...)

#### ID-07 · proof points (optional)
`identity.proofPoints[].claim` · up to 12, each ≤ 300. *Why:* real results make posts credible; numbers need a source, so we only keep ones you can back.
- eg: عندك رقم أو نتيجة حقيقية تقدر تثبتها؟ (عدد عملاء، سنين خبرة، نتيجة) أو قول «لسه».
- gulf: عندك رقم أو نتيجة حقيقية تقدر تثبتها؟ (عدد عملاء، سنوات خبرة، نتيجة) أو قل «للحين لا».
- levant: عندك رقم أو نتيجة حقيقية بتقدر تثبتها؟ (عدد زبائن، سنين خبرة، نتيجة) أو قول «لسا لا».
- msa-white: هل لديك رقم أو نتيجة حقيقية يمكنك إثباتها؟ (عدد العملاء، سنوات الخبرة، نتيجة) أو قل «لا يوجد بعد».
- en: Do you have a real number or result you can prove? (clients, years, an outcome) Or say "not yet".

## Section 2 · audience

#### AU-01 · persona
`audience.persona` · text ≤ 600. *Why:* every example and tone choice is aimed at one person.
- eg: مين الشخص اللي بتكتبله؟ وصفه في جملتين: شغله، سنّه تقريبًا، وإيه اللي شاغله.
- gulf: من الشخص اللي تكتب له؟ وصفه بجملتين: شغله، عمره تقريبًا، وش اللي شاغله.
- levant: مين الشخص اللي بتكتبله؟ وصفو بجملتين: شغلو، عمرو تقريبًا، وشو اللي شاغل باله.
- msa-white: من الشخص الذي تكتب له؟ صِفه في جملتين: عمله وعمره التقريبي وما يشغله.
- en: Who are you writing for? Describe them in two sentences: work, rough age, what is on their mind.

#### AU-02 · pains
`audience.pains[]` · up to 12. *Why:* the best covers name a pain before they promise a fix.
- eg: إيه أكتر 3 حاجات بتتعبه أو بتضايقه في مجالك؟
- gulf: وش أكثر 3 أشياء تتعبه أو تضايقه في مجالك؟
- levant: شو أكتر 3 شغلات بتتعبو أو بتضايقو بمجالك؟
- msa-white: ما أكثر ثلاثة أمور تُتعبه أو تضايقه في مجالك؟
- en: What are the 3 things that frustrate them most in your field?

#### AU-03 · desires
`audience.desires[]` · up to 12. *Why:* the outcome a post promises must be one they already want.
- eg: وإيه اللي نفسه يوصله أو يحققه؟
- gulf: وش اللي يبي يوصل له أو يحققه؟
- levant: وشو اللي بدو يوصل إلو أو يحققو؟
- msa-white: وما الذي يتمنى أن يصل إليه أو يحققه؟
- en: And what do they want to reach or achieve?

#### AU-04 · objections
`audience.objections[]` · up to 12. *Why:* soft-sell and proof slides answer the doubt that stops people.
- eg: ليه ممكن يتردد قبل ما يتابعك أو يشتري منك؟
- gulf: ليش ممكن يتردد قبل ما يتابعك أو يشتري منك؟
- levant: ليش ممكن يتردد قبل ما يتابعك أو يشتري منك؟
- msa-white: لماذا قد يتردد قبل أن يتابعك أو يشتري منك؟
- en: Why might they hesitate before following or buying?

#### AU-05 · FAQs
`audience.faq[]` · up to 30, each ≤ 300. *Why:* repeated questions are the safest topics.
- eg: إيه الأسئلة اللي بتتكرر عليك في الكومنتات والرسايل؟ انسخ 3 منها لو تقدر، من غير أسماء ناس.
- gulf: وش الأسئلة اللي تتكرر عليك بالتعليقات والرسائل؟ انسخ 3 منها لو تقدر، بدون أسماء ناس.
- levant: شو الأسئلة اللي بتتكرر عليك بالتعليقات والرسائل؟ انسخ 3 منها إذا بتقدر، بدون أسماء ناس.
- msa-white: ما الأسئلة التي تتكرر عليك في التعليقات والرسائل؟ انسخ ثلاثة منها إن أمكن، دون أسماء أشخاص.
- en: Which questions keep coming up in your comments and DMs? Copy 3 if you can, without names.

#### AU-06 · countries
`locale.countries[]` · up to 8 ISO codes. *Why:* countries decide the dialect check, the swipe arrow and the time zone.
- eg: جمهورك أغلبه في أنهي بلاد؟ (اكتب لحد 4)
- gulf: جمهورك أغلبه في أي دول؟ (اكتب لين 4)
- levant: جمهورك أغلبو بأي بلدان؟ (اكتب لحد 4)
- msa-white: في أي بلدان يتركّز جمهورك؟ (اكتب حتى 4)
- en: Which countries is your audience mostly in? (up to 4)

#### AU-07 · app language (only when the countries do not settle it)
`locale.appLanguage` · 1 ar · 2 en · 3 mixed. *Why:* Instagram mirrors a carousel by the viewer's app language, so it decides where the next slide sits and which arrow is right.
- eg: جمهورك غالبًا بيستخدم Instagram بالعربي ولا بالإنجليزي؟ 1. عربي 2. إنجليزي 3. الاتنين
- gulf: جمهورك غالبًا يستخدم Instagram بالعربي ولا بالإنجليزي؟ 1. عربي 2. إنجليزي 3. الاثنين
- levant: جمهورك غالبًا بيستخدم Instagram بالعربي ولا بالإنجليزي؟ 1. عربي 2. إنجليزي 3. الاتنين
- msa-white: هل يستخدم جمهورك Instagram غالبًا بالعربية أم بالإنجليزية؟ 1. العربية 2. الإنجليزية 3. كلتاهما
- en: Does your audience mostly use Instagram in Arabic, English or both? 1. Arabic 2. English 3. Both

#### AU-08 · awareness stage (infer, then confirm)
`audience.awareness` · 1 unaware · 2 problem · 3 solution · 4 product. *Why:* it chooses which hook families fit a cold audience.
- eg: جمهورك في أنهي مرحلة غالبًا؟ 1. مش واخد باله من المشكلة 2. عارف المشكلة وبيدوّر على حل 3. بيقارن بين حلول 4. عارف منتجك وعايز يقرر
- gulf: جمهورك في أي مرحلة غالبًا؟ 1. ما ينتبه للمشكلة 2. يعرف المشكلة ويدور حل 3. يقارن بين حلول 4. يعرف منتجك ويبي يقرر
- levant: جمهورك بأي مرحلة غالبًا؟ 1. مش منتبه للمشكلة 2. عارف المشكلة وعم يدوّر على حل 3. عم يقارن بين حلول 4. عارف منتجك وبدو يقرر
- msa-white: في أي مرحلة يقف جمهورك غالبًا؟ 1. لا ينتبه للمشكلة 2. يعرف المشكلة ويبحث عن حل 3. يقارن بين الحلول 4. يعرف منتجك ويريد أن يقرر
- en: Where is your audience usually? 1. Unaware of the problem 2. Knows the problem, wants a fix 3. Comparing solutions 4. Knows your product, deciding

#### AU-09 · digits (offer only when `locale-defaults.json → digits.offerArabicIndicWhen` applies)
`locale.digits`, `locale.digitsReason` · 1 Western 123 · 2 Arabic-Indic ١٢٣. *Why:* one digit system everywhere; 123 is the default.
- eg: بنكتب الأرقام 123 افتراضيًا، لأن كل أغلفة الكاروسيل العربي الناجحة اللي حلّلناها كانت بيها. تحب ١٢٣ بدالها؟ 1. خليها 123 2. ١٢٣
- gulf: نكتب الأرقام 123 افتراضيًا، لأن كل أغلفة الكاروسيل العربي الناجحة اللي حللناها كانت فيها. تبي ١٢٣ بدالها؟ 1. خلها 123 2. ١٢٣
- levant: منكتب الأرقام 123 افتراضيًا، لأن كل أغلفة الكاروسيل العربي الناجحة اللي حلّلناها كانت فيها. بدك ١٢٣ بدالها؟ 1. خليها 123 2. ١٢٣
- msa-white: نكتب الأرقام 123 افتراضيًا، فكل أغلفة الكاروسيل العربي الناجحة التي حلّلناها كانت بها. هل تفضّل ١٢٣؟ 1. أبقها 123 2. ١٢٣
- en: Numbers default to 123 because every numeral on the winning Arabic covers we studied was Western. Prefer ١٢٣? 1. Keep 123 2. ١٢٣

#### AU-10 · register (suggest only for government, finance, health, legal)
`locale.register` · 1 white or msa (suggested) · 2 keep the dialect. *Why:* regulated topics read safer in plain standard Arabic.
- eg: موضوعك رسمي شوية، فأقترح فصحى مبسّطة بدل العامية. نمشي بيها؟ 1. أيوه 2. لأ، خلّيها عامية
- gulf: موضوعك رسمي شوي، فأقترح فصحى مبسّطة بدل اللهجة. نمشي فيها؟ 1. إي 2. لا، خلها باللهجة
- levant: موضوعك رسمي شوي، فبقترح فصحى مبسّطة بدل العامية. منمشي فيها؟ 1. إي 2. لأ، خلّيها عامية
- msa-white: موضوعك رسمي نسبيًا، فأقترح فصحى مبسّطة بدل اللهجة. هل نعتمدها؟ 1. نعم 2. لا، أبقها باللهجة
- en: Your topic is formal, so I suggest simple standard Arabic instead of the dialect. Go with it? 1. Yes 2. No, keep the dialect

## Section 3 · voice

#### VO-01 · tone
`voice.tone.formalFriendly|seriousPlayful|calmEnergetic` · three numbers 1 to 5. *Why:* the writing is checked against it.
- eg: قيّم صوتك من 1 لـ5 في 3 حاجات: ودّه (1 رسمي، 5 ودود)، وروحه (1 جاد، 5 مرح)، وإيقاعه (1 هادي، 5 حماسي). اكتبها كده: «4،3،5».
- gulf: قيّم صوتك من 1 إلى 5 في 3 أشياء: ودّه (1 رسمي، 5 ودود)، وروحه (1 جاد، 5 مرح)، وإيقاعه (1 هادي، 5 حماسي). اكتبها كذا: «4،3،5».
- levant: قيّم صوتك من 1 لـ5 بـ3 شغلات: ودّو (1 رسمي، 5 ودود)، وروحو (1 جدّي، 5 مرِح)، وإيقاعو (1 هادي، 5 حماسي). اكتبها هيك: «4،3،5».
- msa-white: قيّم صوتك من 1 إلى 5 في ثلاثة أمور: الودّ (1 رسمي، 5 ودود)، والروح (1 جاد، 5 مرح)، والإيقاع (1 هادئ، 5 حماسي). اكتبها هكذا: «4،3،5».
- en: Rate your voice from 1 to 5 on three scales: warmth (1 formal, 5 friendly), spirit (1 serious, 5 playful), pace (1 calm, 5 energetic). Write it like "4,3,5".

#### VO-02 · words to use
`voice.use[]` · up to 200, each ≤ 60. *Why:* these are kept and favoured in every draft.
- eg: إيه الكلمات والعبارات اللي بتحب تستخدمها دايمًا؟ (لحد 10)
- gulf: وش الكلمات والعبارات اللي تحب تستخدمها دايم؟ (لين 10)
- levant: شو الكلمات والعبارات اللي بتحب تستخدمها دايمًا؟ (لحد 10)
- msa-white: ما الكلمات والعبارات التي تحب استخدامها دائمًا؟ (حتى 10)
- en: Which words and phrases do you love to use? (up to 10)

#### VO-03 · words to avoid
`voice.avoid[]` · up to 200, each ≤ 60. *Why:* these are never written, and the proofreader flags them.
- eg: وإيه اللي مش عايزه يتقال أبدًا؟ (كلمات أو عبارات، لحد 10)
- gulf: وش اللي ما تبي ينقال أبد؟ (كلمات أو عبارات، لين 10)
- levant: وشو اللي ما بدك ينقال أبدًا؟ (كلمات أو عبارات، لحد 10)
- msa-white: وما الذي لا تريد قوله أبدًا؟ (كلمات أو عبارات، حتى 10)
- en: And what should never be said? (words or phrases, up to 10)

#### VO-04 · past captions
`voice.samples[]` · 3 to 10, each ≤ 3000; then `fingerprint.py`. *Why:* measuring your real captions is more accurate than any description.
- eg: ابعتلي من 3 لـ10 كابشنات قديمة من عندك، وافصل بينهم بسطر فيه --- . من غير أرقام تليفونات أو إيميلات.
- gulf: أرسل لي من 3 إلى 10 كابشنات قديمة من عندك، وافصل بينها بسطر فيه --- . بدون أرقام جوالات أو إيميلات.
- levant: ابعتلي من 3 لـ10 كابشنات قديمة من عندك، وافصل بينهم بسطر فيه --- . بدون أرقام تلفونات أو إيميلات.
- msa-white: أرسل لي من 3 إلى 10 كابشنات قديمة من كتابتك، وافصل بينها بسطر فيه --- . دون أرقام هواتف أو بريد إلكتروني.
- en: Send 3 to 10 of your past captions, separated by a line with --- . No phone numbers or e-mails, please.

#### VO-05 · CTA style
`voice.ctaStyle` · 1 save · 2 send · 3 question · 4 keyword in DM · 5 follow. *Why:* the closing line of every post follows it, and repeats are flagged.
- eg: بتحب تقفل بوستاتك بإيه؟ 1. احفظ 2. ابعت لصاحبك 3. سؤال للمتابعين 4. كلمة في الخاص 5. تابعني
- gulf: وش تحب تختم فيه بوستاتك؟ 1. احفظ 2. أرسل لصاحبك 3. سؤال للمتابعين 4. كلمة بالخاص 5. تابعني
- levant: بإيش بتحب تختم بوستاتك؟ 1. احفظ 2. ابعت لصاحبك 3. سؤال للمتابعين 4. كلمة بالخاص 5. تابعني
- msa-white: بماذا تحب أن تختم منشوراتك؟ 1. احفظ 2. أرسل لصديق 3. سؤال للمتابعين 4. كلمة في الرسائل 5. تابعني
- en: How do you like to close your posts? 1. Save 2. Send to a friend 3. A question 4. A keyword by DM 5. Follow

#### VO-06 · Latin terms
`locale.latinTerms[]` · up to 60, each ≤ 40. *Why:* these stay in Latin letters and the proofreader never "corrects" them.
- eg: إيه أسماء الأدوات أو البراندات اللي بتفضّل تكتبها بالإنجليزي؟ (زي ChatGPT أو Canva)
- gulf: وش أسماء الأدوات أو البراندات اللي تفضّل تكتبها بالإنجليزي؟ (مثل ChatGPT أو Canva)
- levant: شو أسماء الأدوات أو البراندات اللي بتفضّل تكتبها بالإنجليزي؟ (متل ChatGPT أو Canva)
- msa-white: ما أسماء الأدوات أو العلامات التي تفضّل كتابتها بالإنجليزية؟ (مثل ChatGPT أو Canva)
- en: Which tool or brand names should stay in Latin letters? (like ChatGPT or Canva)

#### VO-07 · signature phrases (after the fingerprint)
`voice.fingerprint.signatures[]`. *Why:* a phrase that is yours can be repeated on purpose; a worn-out one cannot.
- eg: لقيت العبارات دي بتتكرر عندك: {list}. أحافظ عليها كتوقيع ليك؟ 1. كلها 2. هختار منها 3. لأ
- gulf: لقيت هالعبارات تتكرر عندك: {list}. أحافظ عليها كتوقيع لك؟ 1. كلها 2. بختار منها 3. لا
- levant: لقيت هالعبارات عم تتكرر عندك: {list}. بحافظ عليها كتوقيع إلك؟ 1. كلها 2. بختار منها 3. لأ
- msa-white: وجدت أن هذه العبارات تتكرر عندك: {list}. هل أحافظ عليها توقيعًا لك؟ 1. كلها 2. أختار منها 3. لا
- en: These phrases keep coming back in your captions: {list}. Keep them as your signature? 1. All 2. Let me choose 3. No

#### VO-08 · three sample lines (after the fingerprint)
Confirmation only; corrections update `use`, `avoid` and the tone. *Why:* if these do not sound like you, the numbers are wrong.
- eg: دي 3 جمل كتبتها بأسلوبك: {1} {2} {3}. شبهك؟ 1. أيوه 2. قريب، وهعدّل 3. لأ
- gulf: هذي 3 جمل كتبتها بأسلوبك: {1} {2} {3}. تشبهك؟ 1. إي 2. قريبة، وبعدّل 3. لا
- levant: هي 3 جمل كتبتها بأسلوبك: {1} {2} {3}. بتشبهك؟ 1. إي 2. قريبة، وبعدّل 3. لأ
- msa-white: هذه ثلاث جمل كتبتها بأسلوبك: {1} {2} {3}. هل تشبهك؟ 1. نعم 2. قريبة وسأعدّل 3. لا
- en: Here are 3 sentences in your voice: {1} {2} {3}. Do they sound like you? 1. Yes 2. Close, I will adjust 3. No

## Section 4 · visual identity

#### VI-01 · logo
`visual.logo` (asset in Brand Home; data URI ≤ 60 KB) · upload or skip. *Why:* it sits in the header of every slide and never mirrors.
- eg: عندك لوجو؟ ارفعه في صفحة البراند (PNG أو SVG)، أو قول «ما عنديش» ونكمّل.
- gulf: عندك شعار؟ ارفعه في صفحة البراند (PNG أو SVG)، أو قل «ما عندي» ونكمل.
- levant: عندك لوغو؟ ارفعو بصفحة البراند (PNG أو SVG)، أو قول «ما عندي» ونكمّل.
- msa-white: هل لديك شعار؟ ارفعه في صفحة العلامة (PNG أو SVG)، أو قل «ليس لدي» ونتابع.
- en: Do you have a logo? Upload it on the brand page (PNG or SVG), or say "no logo" and we move on.

#### VI-02 · brand kit
Branch only · 1 yes (colours and fonts exist) · 2 no (use the starter). *Why:* it decides whether we ask for colours or build them.
- eg: عندك ألوان وخطوط ثابتة للبراند؟ 1. أيوه 2. لأ، اقترح عليّا
- gulf: عندك ألوان وخطوط ثابتة للبراند؟ 1. إي 2. لا، اقترح علي
- levant: عندك ألوان وخطوط ثابتة للبراند؟ 1. إي 2. لأ، اقترح علي
- msa-white: هل لديك ألوان وخطوط ثابتة للعلامة؟ 1. نعم 2. لا، اقترح علي
- en: Do you already have fixed brand colours and fonts? 1. Yes 2. No, suggest some

#### VI-03 · colours
`visual.palette` · hex codes or a screenshot. *Why:* every slide is built from these roles; contrast is checked for you.
- eg: اكتب ألوان البراند (كود الهيكس لو معاك، زي #E3262B) أو ابعت سكرين شوت فيه الألوان.
- gulf: اكتب ألوان البراند (كود الهيكس لو معك، مثل #E3262B) أو أرسل سكرين شوت فيه الألوان.
- levant: اكتب ألوان البراند (كود الهيكس إذا معك، متل #E3262B) أو ابعت سكرين شوت فيه الألوان.
- msa-white: اكتب ألوان العلامة (رمز الهيكس إن وُجد، مثل #E3262B) أو أرسل لقطة شاشة للألوان.
- en: Give me the brand colours (hex codes if you have them, like #E3262B) or send a screenshot.

#### VI-04 · fonts
`visual.fonts`, `visual.fonts.userFonts` · names or an upload. *Why:* the slides must use a font that really contains every Arabic letter and digit you use.
- eg: إيه الخطوط اللي بتستخدمها؟ لو مش من خطوطنا المفتوحة هعرض عليك أقرب بدايل، ولو خطك مرخّص ليك ارفعه وهيفضل عندك بس.
- gulf: وش الخطوط اللي تستخدمها؟ لو مو من خطوطنا المفتوحة بعرض عليك أقرب بدايل، ولو خطك مرخّص لك ارفعه ويبقى عندك بس.
- levant: شو الخطوط اللي بتستخدمها؟ إذا مش من خطوطنا المفتوحة رح أعرض عليك أقرب بدايل، وإذا خطك مرخّص إلك ارفعو وبيضل عندك بس.
- msa-white: ما الخطوط التي تستخدمها؟ إن لم تكن من خطوطنا المفتوحة أعرض عليك أقرب بدائلها، وإن كان خطك مرخّصًا لك فارفعه ويبقى عندك فقط.
- en: Which fonts do you use? If they are not among our open fonts I will show the closest matches; a licensed font of yours can be uploaded and stays with you.

#### VI-05 · photos
`visual.photos[]` · up to 40 assets, ask for at most 5. *Why:* some looks need a face or a product cut-out.
- eg: عندك صور ليك أو لمنتجك تحب تظهر في التصميم؟ ارفع لحد 5 صور، أو قول «لأ».
- gulf: عندك صور لك أو لمنتجك تبي تظهر بالتصميم؟ ارفع لين 5 صور، أو قل «لا».
- levant: عندك صور إلك أو لمنتجك بدك تظهر بالتصميم؟ ارفع لحد 5 صور، أو قول «لأ».
- msa-white: هل لديك صور لك أو لمنتجك تريد ظهورها في التصميم؟ ارفع حتى 5 صور، أو قل «لا».
- en: Any photos of you or your product you want in the designs? Upload up to 5, or say "no".

#### VI-06 · your own work (references, kind own)
`references[]` kind `own` · 3 to 8 screenshots. *Why:* your best work shows the look you already use.
- eg: ابعت 3 لـ8 سكرين شوت من أحسن كاروسيلات أو بوستات عملتها. هقرا أسلوبها وأقترح عليك الستايل الأقرب.
- gulf: أرسل من 3 إلى 8 سكرين شوت من أحسن كاروسيلات أو بوستات سويتها. بقرا أسلوبها وأقترح عليك الستايل الأقرب.
- levant: ابعت من 3 لـ8 سكرين شوت من أحسن كاروسيلات أو بوستات عملتها. رح أقرا أسلوبها وبقترح عليك الستايل الأقرب.
- msa-white: أرسل من 3 إلى 8 لقطات شاشة لأفضل كاروسيلات أو منشورات صنعتها. سأقرأ أسلوبها وأقترح الستايل الأقرب.
- en: Send 3 to 8 screenshots of your best carousels or posts. I will read their style and suggest the closest look.

#### VI-07 · inspiration (kind inspiration)
`references[]` kind `inspiration` · 3 to 8 screenshots. *Why:* it shows where you want to go; only traits are used, never their assets.
- eg: وابعت 3 لـ8 سكرين شوت من حسابات أو تصاميم نفسك تتعلّم منها.
- gulf: وأرسل من 3 إلى 8 سكرين شوت من حسابات أو تصاميم تبي تتعلّم منها.
- levant: وابعت من 3 لـ8 سكرين شوت من حسابات أو تصاميم بدك تتعلّم منها.
- msa-white: وأرسل من 3 إلى 8 لقطات شاشة لحسابات أو تصاميم تودّ التعلّم منها.
- en: And send 3 to 8 screenshots of accounts or designs you want to learn from.

#### VI-08 · competitors (kind competitor)
`references[]` kind `competitor`, `strategy.roleModels` for names only. *Why:* we warn you if your look drifts too close to theirs.
- eg: مين المنافسين أو الحسابات اللي مش عايز تشبههم؟ ابعت سكرين شوت أو اكتب أسماءهم.
- gulf: مين المنافسين أو الحسابات اللي ما تبي تشبههم؟ أرسل سكرين شوت أو اكتب أسماءهم.
- levant: مين المنافسين أو الحسابات اللي ما بدك تشبههم؟ ابعت سكرين شوت أو اكتب أسماءهم.
- msa-white: من المنافسون أو الحسابات التي لا تريد أن تشبهها؟ أرسل لقطة شاشة أو اكتب أسماءهم.
- en: Who are the competitors or accounts you do not want to look like? Send a screenshot or write their names.

#### VI-09 · mood (no brand kit)
Input for `palette.py --mood`; not stored. *Why:* it picks the palette family; you can still give a colour you love.
- eg: حاسس البراند بتاعك أقرب لإيه؟ 1. جريء 2. هادي 3. دافئ 4. بارد 5. ترابي 6. مرح 7. فاخر. ولو في لون بتحبه قوله.
- gulf: وش تحس البراند حقك أقرب له؟ 1. جريء 2. هادي 3. دافئ 4. بارد 5. ترابي 6. مرح 7. فاخر. ولو فيه لون تحبه قله.
- levant: بتحس البراند تبعك أقرب لشو؟ 1. جريء 2. هادي 3. دافي 4. بارد 5. ترابي 6. مرِح 7. فخم. وإذا في لون بتحبو قلي إياه.
- msa-white: بماذا تشعر أن علامتك أقرب؟ 1. جريئة 2. هادئة 3. دافئة 4. باردة 5. ترابية 6. مرحة 7. فاخرة. وإن كان لديك لون تحبه فاذكره.
- en: Which mood fits your brand? 1. Bold 2. Calm 3. Warm 4. Cool 5. Earthy 6. Playful 7. Luxury. Tell me a colour you love if there is one.

#### VI-10 · pick the look
`visual.presetId`, `visual.presetAlternates` · a number on the choice board. *Why:* you see your own hook in each look before choosing.
- eg: اختار الشكل اللي عجبك من الصفحة: رقم من 1 لـ6. والتاني والتالت هيبقوا بدايل.
- gulf: اختر الشكل اللي عجبك من الصفحة: رقم من 1 إلى 6. والثاني والثالث يكونون بدايل.
- levant: اختار الشكل اللي عجبك من الصفحة: رقم من 1 لـ6. والتاني والتالت رح يكونوا بدايل.
- msa-white: اختر الشكل الذي أعجبك من الصفحة: رقمًا من 1 إلى 6. ويكون الثاني والثالث بديلين.
- en: Pick the look you like on the page: a number from 1 to 6. The next two become your alternates.

#### VI-11 · locks
`visual.locks[]` · up to 20 token paths. *Why:* a locked item survives occasion overlays and per-post changes.
- eg: في حاجة مينفعش تتغير في أي تصميم؟ (مثلًا: مكان اللوجو أو لون معيّن)
- gulf: فيه شي ما ينفع يتغير بأي تصميم؟ (مثلًا: مكان الشعار أو لون معيّن)
- levant: في شي ما بينفع يتغير بأي تصميم؟ (مثلًا: مكان اللوغو أو لون معيّن)
- msa-white: هل هناك ما لا يجوز تغييره في أي تصميم؟ (مثلًا: موضع الشعار أو لون بعينه)
- en: Is there anything that must never change in any design? (for example the logo position or one colour)

## Section 5 · strategy

#### ST-01 · pillars
`strategy.pillars[]` · you propose 3 to 5 (name, share, intents); the user edits. *Why:* they keep the weeks varied and on-topic.
- eg: من كلامك اقترحت لك الأعمدة دي: {list}. تمام ولا نعدّل؟ 1. تمام 2. عدّل
- gulf: من كلامك اقترحت لك هالأعمدة: {list}. تمام أو نعدّل؟ 1. تمام 2. عدّل
- levant: من كلامك اقترحت عليك هالأعمدة: {list}. تمام ولا منعدّل؟ 1. تمام 2. عدّل
- msa-white: بناءً على كلامك اقترحت هذه الأعمدة: {list}. هل نعتمدها أم نعدّلها؟ 1. نعتمدها 2. نعدّل
- en: From what you told me I suggest these pillars: {list}. Good, or change them? 1. Good 2. Change

#### ST-02 · role models
`strategy.roleModels[]` · up to 10 names. *Why:* names only; their style is never copied.
- eg: مين الحسابات اللي بتعتبرهم قدوة في مجالك؟ (لحد 5 أسماء)
- gulf: مين الحسابات اللي تعتبرهم قدوة بمجالك؟ (لين 5 أسماء)
- levant: مين الحسابات اللي بتعتبرن قدوة بمجالك؟ (لحد 5 أسماء)
- msa-white: من الحسابات التي تعتبرها قدوة في مجالك؟ (حتى 5 أسماء)
- en: Which accounts do you look up to in your field? (up to 5 names)

#### ST-03 · posts per week
`strategy.postsPerWeek` · 1 to 14, suggest 3 to 5. *Why:* the weekly plan is built around what you can keep up.
- eg: كام بوست في الأسبوع تقدر تلتزم بيه؟ 1. 3 2. 4 3. 5
- gulf: كم بوست بالأسبوع تقدر تلتزم فيه؟ 1. 3 2. 4 3. 5
- levant: كم بوست بالأسبوع بتقدر تلتزم فيه؟ 1. 3 2. 4 3. 5
- msa-white: كم منشورًا في الأسبوع يمكنك الالتزام به؟ 1. 3 2. 4 3. 5
- en: How many posts a week can you keep up? 1. 3 2. 4 3. 5

#### ST-04 · best hours
`strategy.bestHours` · time zone plus slots. *Why:* the plan suggests publishing times from it.
- eg: أنسب ساعات نشر لجمهورك؟ لو مش متأكد هنبدأ من 20:00 لحد 23:00 بتوقيت {tz}.
- gulf: وش أنسب ساعات نشر لجمهورك؟ لو مو متأكد نبدأ من 20:00 لين 23:00 بتوقيت {tz}.
- levant: شو أنسب ساعات نشر لجمهورك؟ إذا مش متأكد منبدا من 20:00 لحد 23:00 بتوقيت {tz}.
- msa-white: ما أنسب ساعات النشر لجمهورك؟ إن لم تكن متأكدًا فنبدأ من 20:00 حتى 23:00 بتوقيت {tz}.
- en: What are the best hours to post for your audience? If unsure we start with 20:00 to 23:00 in {tz}.

#### ST-05 · intent mix
`strategy.intentMix` · four shares that add up to about 1. *Why:* it balances posts made to be saved, sent, seen and sold.
- eg: توزيع المحتوى المقترح لهدفك: حفظ {save}%، إرسال {send}%، وصول {reach}%، بيع {sell}%. نمشي بيه؟ 1. أيوه 2. غيّر
- gulf: توزيع المحتوى المقترح لهدفك: حفظ {save}%، إرسال {send}%، وصول {reach}%، بيع {sell}%. نمشي فيه؟ 1. إي 2. غيّر
- levant: توزيع المحتوى المقترح لهدفك: حفظ {save}%، إرسال {send}%، وصول {reach}%، بيع {sell}%. منمشي فيه؟ 1. إي 2. غيّر
- msa-white: توزيع المحتوى المقترح لهدفك: حفظ {save}%، إرسال {send}%، وصول {reach}%، بيع {sell}%. هل نعتمده؟ 1. نعم 2. غيّر
- en: Suggested content mix for your goal: save {save}%, send {send}%, reach {reach}%, sell {sell}%. Use it? 1. Yes 2. Change

## Section 6 · tools

#### TL-02 · consent mode
`tools.consent` · 1 ask-each-post · 2 batch-ok · 3 never. Asked only when a capability was found. *Why:* nothing is generated or sent to an outside tool without your say-so.
- eg: لو في أدوات صور أو فيديو متوصّلة، تحب: 1. تسألني في كل بوست 2. تشتغل لوحدها في الدفعات 3. ما تستخدمش أي أداة؟
- gulf: لو فيه أدوات صور أو فيديو متوصّلة، تبي: 1. تسألني بكل بوست 2. تشتغل لحالها بالدفعات 3. ما تستخدم أي أداة؟
- levant: إذا في أدوات صور أو فيديو موصولة، بتحب: 1. تسألني بكل بوست 2. تشتغل لحالها بالدفعات 3. ما تستخدم أي أداة؟
- msa-white: إن وُجدت أدوات صور أو فيديو متصلة، فهل تفضّل: 1. أن أسألك عن كل منشور 2. أن تعمل وحدها في الدفعات 3. ألّا أستخدم أي أداة؟
- en: If image or video tools are connected, should I: 1. Ask before each post 2. Work on my own in batches 3. Never use them?

#### TL-03 · own data (only when an `insights.ownData` capability exists)
Consent to read the results of past posts, to fill `hooks.familyPriors`. *Why:* it ranks hook families by what worked on your account; it stays in your brand profile.
- eg: تسمح إني أقرا نتايج بوستاتك القديمة من أداة التحليلات عشان أرتّب الهوكات على اللي نجح عندك؟ 1. أيوه 2. لأ
- gulf: تسمح لي أقرا نتائج بوستاتك القديمة من أداة التحليلات عشان أرتّب الهوكات على اللي نجح عندك؟ 1. إي 2. لا
- levant: بتسمحلي أقرا نتايج بوستاتك القديمة من أداة التحليلات كرمال أرتّب الهوكات على اللي نجح عندك؟ 1. إي 2. لأ
- msa-white: هل تسمح لي بقراءة نتائج منشوراتك السابقة من أداة التحليلات لأرتّب الهوكات بحسب ما نجح عندك؟ 1. نعم 2. لا
- en: May I read the results of your past posts from the analytics tool, to rank hooks by what worked for you? 1. Yes 2. No
