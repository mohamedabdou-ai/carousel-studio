# Sensitivities (gate SEN1)

A read-through for content that is risky to publish in Arab markets, run by the model on every
post. Findings here are **BLOCK** and cannot be exported over: be precise, quote the sentence,
give a one-line reason and a safe alternative. When a case is truly borderline, ask the user one
question instead of blocking.

This is editorial caution, not legal advice. Where the law or a platform policy is involved, say
that a specialist should review it and do not decide for the user.

## 1. Defaults that apply to every post
| Category | Level | Flag | Safe version |
|---|---|---|---|
| **Quran and creed on promotion** | BLOCK | a Quran verse, the Shahada, or sacred names used as a hook, a sales device or decoration on a promotional slide | keep religious text for genuinely religious posts; promotions use a plain greeting |
| **Religious imagery for selling** | BLOCK | Kaaba, mosque, prayer imagery or the Saudi flag on a promotion (the `cs-art-director` and visual prompts check the image; here, check the words that call for it) | a neutral visual |
| **Disputed maps and names** | BLOCK | drawing or describing borders; contested territory names in a promotion | no map; use the audience country's official usage |
| **The Gulf's name** | BLOCK | any name for the Gulf other than «الخليج العربي» in a post aimed at a GCC audience | «الخليج العربي» |
| **Fear stacking** | BLOCK | two distinct fear words in one hook (the hook gate HG5) or three in one slide or caption (gate SEN1) (خطر، كارثة، خسارة، تهديد…), or a threat to push a sale | one concrete risk, then the fix |
| **Conspiracy framing** | BLOCK | «الشركات الكبيرة مش عايزاك تعرف», «اللي بيخبّوه عنك», «سر محدش يعرفه» | say what is true and verifiable |
| **Invented proof** | BLOCK (also SRC1) | a fabricated testimonial, quote or named customer; a made-up "study" | use only real, permitted quotes, or none |
| **Oaths as persuasion** | note | «والله هتكسب», «أقسم بالله إنه…» to add weight to a claim | remove the oath, state the fact |
| **Guarantees about people's lives** | note (copy gates) | promised income, cure, weight loss, visa, grades, job | describe what the product does, not what will happen to the reader |

Safe: «رمضان مبارك», «عيد مبارك», «كل عام وأنتم بخير», national-day greetings, a plain «بسم الله»
opening in a post that is not selling.

## 2. Occasion rules
When `spec.style.occasionId` names an installed pack, read its `sensitivities` object and apply every
flag (`noQuranOnPromo`, `noShahada`, `noSaudiFlagOnPromo`, `noKaabaForSelling`, `noDisputedMaps`,
`term`). Without a pack, section 1 applies unchanged. (In Ramadan engagement shifts to after iftar and late
night; that is a planning matter for content-plan, not a language rule.)

## 3. Regulated and age-restricted topics
Health, finance, legal and education claims, and products such as alcohol, gambling, tobacco, adult
services or weapons, depend on the market's law and on Instagram's rules. Do not decide: flag it as a
NOTE, suggest the simplified-MSA register for the regulated topics, avoid outcome promises, and
tell the user to check the rule for the target country.

## 4. People
No hate or contempt towards a nationality, religion, sect, gender or group. No jokes at the expense of
a religion. No personal data of a private individual (name, phone, address, photo) and nothing that
targets one. A public figure may be named only for a verifiable public fact.

## 5. How to report
```
حساسية: «{الجملة}» ← {الفئة}. السبب: {سطر واحد}. البديل: «{نص آمن}».
```
List all hits, then the verdict. A SEN1 hit forces VETO until the sentence changes. If the user
disagrees about a borderline case, restate the risk once; the decision to change the text is theirs,
and the post stays blocked until it does.

## 6. Where the word lists are
`copy.json` holds the machine lists for fear words, conspiracy phrases and overclaims (read by the
copy gates); this file holds the judgement the model applies on top. Image checks (AI letters,
watermarks, religious imagery) belong to the `cs-art-director`, the visual-prompts skill and the Studio's
asset flags.
