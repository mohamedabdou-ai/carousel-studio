# Translationese: Arabic words in English order

Text whose every word is Arabic and whose structure is English reads as translated. The marks below
show where to look; the verdict falls on the **sentence's construction**, not on a word's presence.
This reference feeds gate C8 (voice) and the model read in step 2 of `SKILL.md`. Findings here are
FIX suggestions, never a VETO on their own. Adapted in part from the MIT-licensed ad-copy pack
listed in NOTICE.

## 1. Construction marks (the dangerous ones: invisible word by word)
| Seen | Why it reads translated | Write instead |
|---|---|---|
| «قم بـ» + verbal noun: «قم بالنقر على الرابط» | English "do the clicking" | «اضغط الرابط» |
| agentless passive: «يتم الشحن خلال يومين» | Arabic wants the doer | «يوصلك خلال يومين» |
| «من قبل» for the doer: «تم تطويره من قبل فريقنا» | English "by" | «طوّره فريقنا» |
| «وذلك من خلال»: «وفّر وقتك وذلك من خلال الحجز» | filler link | «احجز مسبقًا فتوفّر وقتك» |
| a doubled possessive: «سلتك الخاصة بك» | the attached pronoun already says it | «سلّتك» |
| subject before verb in an ad: «نحن نقدّم لك حلولًا» | English order; puts the brand first | start from the reader's problem |
| a 12-word sentence with no verb | a text that does not move | give it a verb |
| essay connectors: «بالإضافة إلى ذلك، علاوة على ما سبق» | an article, not a post | full stop, new sentence |
| «سواء كنت… أو كنت…» | tries to address everyone, addresses nobody | pick one reader |
| a long parenthetical between subject and verb | buries the first line | split the sentence |
| «يُعتبر / يُعدّ» + a superlative | report voice before an unproven claim | state what it does |
| «حيث إن» + clause, «في حين أن» as glue | translated "whereas / since" | «لأن», «بينما», or a new sentence |

## 2. Vocabulary marks
«لا تتردد في التواصل» · «اعرف المزيد» as a call · «اكتشف» for everything · «حلول متكاملة» ·
«تجربة فريدة من نوعها» · «نسعى جاهدين / نحرص على» · «في عالمنا اليوم» · «حان الوقت لـ» ·
«تخيّل أن…» in place of the real fact · «مصمَّم خصيصًا لـ» · «بنقرة واحدة» · «الآن وبكل سهولة» ·
«نحن هنا من أجلك» · «أنت تستحق» · «ابدأ رحلتك» · «احصل على… اليوم» · «ما يميّزنا هو» ·
«بأسعار تنافسية» · «للاستفسار يُرجى التواصل» · «انقر هنا» · «الأفضل / الأول / الوحيد» with no proof ·
«عرض لفترة محدودة» with no date.

Carousel and AI-copy stock phrases to watch (the lists live in `copy.json`): «ثورة في…», «في خضم…»,
«عالم مليء بـ…», «غوص عميق», «سر خطير», «الحقيقة الصادمة», and openers that announce the post
(«في هذا المنشور سنتعرّف على…»).

## 3. Three tests on the whole text
1. **Read it aloud** as if telling a friend. If you stumble or sound like a newsreader, the sentence is translated even if every word is Arabic: rebuild it, do not swap words.
2. **Translate it back** to English in your head. If the English comes out smoother than the Arabic, the Arabic was English first.
3. **Delete test:** remove every word that carries no information. If less than half is left, the rest was filler.

## 4. When a mark is not a flaw
- **«يتم» in regulatory or financial text** where the actor is deliberately unnamed.
- **«نحن» in a brand-identity post** that introduces the company; wrong in a performance post about the reader.
- **Simplified MSA reads formal, not translated.** Judge construction, not coldness. A formal register for government, finance or health is the correct choice.
- **Emoji** in a market and sector that expect them is a brand decision.

## 5. Repairing a user's text
1. Write the *information* in plain lines: the offer, the proof, the audience, the call.
2. Strike everything that is not information; what disappeared was the filler.
3. Rebuild the sentence in Arabic from the information, in the post's dialect.
4. Show the original and the rebuild side by side with the number of the mark fixed. Never add a claim the original did not make.

## 6. Dialect reminder
In dialect copy, translated structure usually shows as standard-Arabic connectors and passives
(«حيث إن», «يتم») left inside a dialect sentence. Fix it by rebuilding the sentence with the
dialect's own particles for negation, future and questions (`dialect-purity.md`), not by
sprinkling local words over the same skeleton.
