# Alt text

Alt text describes a slide to someone who cannot see it, and it is also read by search. Every slide gets one (`captionPack.alt[i]`, same order and count as `slides`). Only about 6 percent of the Arabic carousels we studied had custom alt text, so this is cheap to do well. Missing alt text on any slide is a BLOCK; the target is **300 characters or fewer**, the hard limit is 1,000.

## What goes in it
In this order, as one or two plain sentences:
1. **The kind of slide**, one word: غلاف، سلايد، خطوة، مقارنة، خلاصة، دعوة…
2. **All the text on the slide, in reading order**, quoted as it appears (same words, same digits, Latin names unchanged). Shorten only when the slide is dense: keep the title and the key lines, then say «وبقية النقاط…» only if you truly omit some.
3. **What the visual shows**, if there is one: «على خلفية خضراء»، «لقطة شاشة لإعدادات الأداة»، «شخص يشير إلى الرقم». Describe what a person would see, not the style («تصميم عصري» is not a description).

Not allowed: credits or names that are not on the slide, a handle that is not on the slide, hashtags, keyword stuffing, «صورة لـ» or «image of» (the reader already knows it is an image), the AI-image prompt, or any claim that is not on the slide.

## Language
Write alt text in **white MSA** whatever the post's dialect: screen readers pronounce it best, and it reads as neutral description. **Quote the slide's own words exactly**, including their dialect spelling, between «» when they are a headline or a line that carries the message. Digits follow the post (Western by default). Latin names stay Latin and sit inside the sentence.

## By slide type
| Type | Pattern | Example (Egyptian post) |
|---|---|---|
| `cover` | «غلاف: {headline}. {visual}.» | غلاف: «6 أدوات ببلاش… بتغنيك عن المصمم» بخط أسود كبير على خلفية بيضاء. |
| `rehook` | «السلايد الثاني: {headline}. {bridge}» | السلايد الثاني: «الأداة الأولى بتختصر ساعة». |
| `item`, `step` | «{الخطوة/النقطة} {n}: {title}. {body}.» | النقطة 1: أداة التصميم. تكتب الفكرة وتطلعلك السلايدات جاهزة. |
| `stat` | «رقم: {number} {unit}. {title}.» | رقم: 5 ساعات. الوقت اللي بتوفّره. |
| `compare`, `myth-fact` | «مقارنة بين {A} و{B}: …» / «خرافة: … وحقيقة: …» | خرافة: «لازم مصمم». حقيقة: «المحرك بيعمل الشغل». |
| `checklist`, `summary` | «قائمة من {n} نقاط: …» (the points, comma separated) | خلاصة من 3 نقاط: أداة التصميم، أداة الكتابة، أداة المراجعة. |
| `proof` | «لقطة شاشة: {what it shows}. {caption}» | لقطة شاشة لنتيجة الأداة بعد دقيقة واحدة. |
| `quote`, `testimonial` | «اقتباس: «…» — {attribution}.» | اقتباس: «…» — صاحب مطعم. |
| `cta` | «دعوة: {title}. {cta text}» | دعوة: احفظ البوست. «احفظه لما تيجي تعمل البوست الجاي». |

## Mistakes to avoid
- Copying the caption into the alt text. The caption talks to the reader; the alt text describes the slide.
- Describing the layout instead of the content («عنوان في الأعلى ونص في الأسفل»).
- Leaving the cover's alt as only «غلاف»: the headline is the point.
- Different digits from the slide, or dropping the Latin name («أداة» for «Canva»).

## Checks
`lint_copy.py --text "…" --role alt` checks the length rules (C9.alt-length is a NOTE above 300, C9.alt-length-hard a BLOCK above 1,000) and the spelling and digit gates. In a whole spec, `C9.alt-missing` is a BLOCK for any slide without one.
