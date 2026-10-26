# Angle lenses

A lens is a question you ask of a topic. One topic put through different lenses gives different posts, so run **at least 6 different lenses** per request (5 to 10 angles in all) and never offer two angles from the same lens unless the topic is thin. The lens id is what `spec.angle.lens` stores.

Each entry: families, intent, awareness, architecture, needs, failure and examples. Titles ≤14 words name the angle; hooks come later. The last three lenses are optional.

Priors: `data/priors.json`; scoring: `scoring.md`.

| id | Arabic label (white MSA, for chat) | Question |
|---|---|---|
| contrarian | عكس السائد | What does everyone assume here that is wrong or only half true? |
| costly-mistake | غلطة مكلفة | What mistake costs the audience something they can feel? |
| free-vs-paid | مجاني مقابل مدفوع | What can they get free that they now pay for? |
| tested-ranked | جرّبته ورتّبته | What did you actually try, and in what order does it rank? |
| identity | لمن هذا؟ | Who exactly is this for, in a way they recognise themselves? |
| before-after | قبل وبعد | What changed, from what to what, and what caused it? |
| myth | خرافة وحقيقة | Which belief is a myth, and what is the fact? |
| story | قصة | What happened, step by step, that makes the point without preaching? |
| framework | إطار عمل | What is the named, reusable structure behind this? |
| news | خبر جديد | What just changed that the audience has not heard yet? |
| setup | الإعداد خطوة بخطوة | What do they need, and what do they do first, to start? |
| imagine | تخيّل | What does the finished result look like? |
| your-call | إنت تختار | Which of two options would the reader pick, and why? |
| behind-the-work | ورا الشغل | How was a real job built? |
| if-i-started-over | لو هبدأ من الأول | What would you change with today's lessons? |

---

### contrarian
- **Families:** P4 flip, F17 reframe, F21 stance. **Intent:** reach and send; save when it is a reframe. **Awareness:** unaware, problem. **Architecture:** myth-fact, opinion.
- **Needs:** a reason that can be shown on slide 2 in 12 words. No facts required, but any figure used still needs a source.
- **Fails when:** the contrary view is a mood, not a claim.
- eg: «النشر كل يوم مش هو اللي بيكبّر حسابك»

### costly-mistake
- **Families:** P3 mistake, F18 irony. **Intent:** save, sell. **Awareness:** problem. **Architecture:** myth-fact, steps.
- **Needs:** one mistake, one visible cost, one fix. Fear is allowed once; two distinct fear words in one hook is stacking (the hook gate HG5 fails), and three in one slide or caption blocks the post (gate SEN1).
- **Fails when:** the cost is vague («بتخسر فرص») or invented.
- eg: «الغلطة اللي بتخلّي الكابشن يضيع قبل ما حد يقراه»

### free-vs-paid
- **Families:** P2 vs, S1 offer when it sells. **Intent:** save, send. **Awareness:** solution. **Architecture:** comparison, listicle.
- **Needs:** every price and every "free" claim sourced or attested; a free tool's limits stated honestly. Check the plan names before writing them.
- **Fails when:** the free option is not really equivalent.
- eg: «أدوات ببلاش بتعمل شغل الأدوات المدفوعة»

### tested-ranked
- **Families:** P15 ranked, P1 list. **Intent:** save, send. **Awareness:** solution. **Architecture:** listicle.
- **Needs:** the user really tested it. Ask which items and what each did; never invent a ranking or a test. The count N must equal the item slides.
- **Fails when:** nothing was tested.
- eg: «جرّبت أدوات المونتاج دي ورتّبتها من الأسوأ للأحسن»

### identity
- **Families:** P10 identity label, F21 stance. **Intent:** send. **Awareness:** problem. **Architecture:** framework, opinion.
- **Needs:** one specific reader (a job, a situation), not "everyone". The send CTA names that person.
- **Fails when:** the label is flattering but broad.
- eg: «لو عندك مطعم وبترد على الرسايل بنفسك، ده ليك»

### before-after
- **Families:** P8 before to after, P7 sharp-number result. **Intent:** sell, save. **Awareness:** solution, product. **Architecture:** case-study, results.
- **Needs:** a real result, its start and end values, and permission when it is a client's. Without them this lens is closed.
- **Fails when:** the "after" has no cause shown.
- eg: «اللي اتغيّر في حساب واحد بين أول الشهر وآخره»

### myth
- **Families:** P4 flip, F17 reframe. **Intent:** reach, send. **Awareness:** unaware, problem. **Architecture:** myth-fact.
- **Needs:** the myth stated once, the fact made bigger and last. A myth the audience does not hold is not a myth.
- **Fails when:** the "fact" needs a number you do not have.
- eg: «خرافة: الهاشتاجات هي اللي بتجيب الوصول»

### story
- **Families:** P9 cold open. **Intent:** send, reach. **Awareness:** unaware, problem. **Architecture:** story.
- **Needs:** a true story from the user (ask for the beats), stakes, a turn, one lesson. Never invent a person, client or quote.
- **Fails when:** it is a lesson wearing a costume.
- eg: «العميل اللي ردّ على رسالتي بعد تلات شهور»

### framework
- **Families:** P11 pack or checklist, P1 list. **Intent:** save. **Awareness:** problem, solution. **Architecture:** framework, steps, listicle.
- **Needs:** a name or a count, and parts that are not interchangeable. This lens carries the strongest save record on file.
- **Fails when:** the parts are generic tips.
- eg: «إطار من 4 خطوات لكتابة أول سطر»

### news
- **Families:** P12 dated news. **Intent:** reach. **Awareness:** unaware. **Architecture:** news.
- **Needs:** a dated change and where it came from (user link or attested). Reach, not saves: expect views without many saves.
- **Fails when:** the date or the change is unverified.
- eg: «Instagram حدّد عدد الهاشتاجات بخمسة»

### setup
- **Families:** P14 X without Y, P1 list. **Intent:** save. **Awareness:** solution. **Architecture:** steps (with a `setup` slide).
- **Needs:** requirements (tool, plan, device, price) and the first three actions. For tool topics always offer it: the audience asks how to set it up, whether it is free, and whether it runs on Mac.
- **Fails when:** a step depends on a screen you have not seen.
- eg: «أول مرة تشغّل الأداة؟ ده اللي محتاجه بالظبط»

### imagine
- **Families:** P13 imagine. **Intent:** send, sell. **Awareness:** unaware, solution. **Architecture:** news, offer, opinion.
- **Needs:** a simple input and a complete output the reader can picture. The picture must be true to the product.
- **Fails when:** the result promised is bigger than the tool does.
- eg: «تخيّل تبعت فويس نوت… ويرجعلك كاروسيل جاهز»

### your-call · إنت تختار (optional)
- **Families:** P2, F21. **Intent:** send. **Awareness:** solution. **Architecture:** comparison, opinion.
- **Needs:** two real options; ask for a one-line reason. **Fails when:** a one-word vote. eg: «تختار وقت أقل ولا تحكّم أكتر، وليه؟» · en: "Less time or more control, and why?"

### behind-the-work · ورا الشغل (optional)
- **Families:** P9, F22. **Intent:** save, sell. **Awareness:** solution. **Architecture:** case-study.
- **Needs:** a real job and its build decisions. **Fails when:** invented process. eg: «إزاي بنينا الشغل ده» · en: "How we built this job"

### if-i-started-over · لو هبدأ من الأول (optional)
- **Families:** P9, P3. **Intent:** save. **Awareness:** problem. **Architecture:** story, steps.
- **Needs:** the creator's real lessons. **Fails when:** generic advice. eg: «لو هبدأ من الأول هغيّر دول» · en: "What I'd change starting over"

---

## Choosing the mix
- Cover the intent: for a **save** goal make at least 3 of the angles framework, free-vs-paid, setup or tested-ranked; add contrarian or myth for reach and sends.
- Add **setup** for any tool or software topic. Add **news** only when the user gave you the news.
- If the user gave notes, results or screenshots, build **before-after**, **story** and **tested-ranked** from them first; they are the lenses a generic model cannot fake.
- Close a lens when its "Needs" is missing, and say why in one line instead of inventing the missing material.
