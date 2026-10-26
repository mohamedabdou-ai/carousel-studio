# Occasions: windows, uncertain dates, tone and sensitivities

The calendar (`data/calendar-2026-28.json`, 46 occasion series, 2026–2028) lists religious, national and commercial occasions of the Arab region with explicit dates. Hijri dates are looked up in the Umm al-Qura table (`data/hijri-ummalqura.json`). Never compute a date yourself; ask `calendar.py`.

## 1. Reading an occasion
| Field | Meaning |
|---|---|
| `start`, `end` | the dates of the occasion (Eid al-Fitr is 3 days; Ramadan is the whole month) |
| `confidence` | `exact` = fixed by law or rule; `±1d` = Hijri-based, may land a day earlier or later in any country |
| `windows` | `planFrom` (28 days before: start planning) · `preFrom` (7 days before: teasers) · `postTo` (3 days after: a thank-you or recap still fits) |
| `moonCheck` | the evening the new moon is looked for (the 29th day of the previous Hijri month); the announcement follows |
| `importance` | 3 = plan a post by default, 2 = suggest (default threshold of `plan.py`), 1 = list only |
| `tone` | `reverent`, `solemn`, `festive`, `patriotic`, `respectful`, `commercial` |
| `suggestedIntent` | the intent a slot takes on that occasion |
| `countries` | where it applies; a region-wide occasion (`regionWide`) applies to every country, except those it excludes (Mawlid is not an official occasion in Saudi Arabia) |
| `partOf` | belongs to a longer occasion (the last ten nights and Laylat al-Qadr belong to Ramadan) and gets no slot of its own |
| `sensitivities`, `pack` | see §3 and §4 |

Phases a query reports: `in-range` (the occasion itself), `pre` (teaser window), `plan` (planning window), `post` (afterglow).

## 2. Uncertain dates (±1d)
- Say it plainly once: «التاريخ ده تقريبي لأن الهلال بيحدد البداية، ممكن يتحرك يوم في أي دولة». Write the approximate date and the evening to confirm (`moonCheck`).
- Prepare, don't post: draft the Eid or Ramadan post early; schedule the exact day only after the official announcement. For a fixed-hour scheduler, queue a draft and ask the user to release it.
- Anything that sits on top of a Hijri date (Eid sales, Arafah content, the end of Ramadan) inherits the uncertainty.
- Fixed Gregorian days (national days, Mother's Day, White Friday, New Year) are `exact`; a few official holiday lengths are announced yearly (Oman, Eid): the note says so.

## 3. Tone and sensitivities
| Tone | Write | Never |
|---|---|---|
| `reverent` (Ramadan, last ten nights, Laylat al-Qadr, Arafah, Mawlid, Islamic New Year) | simple greetings: «رمضان مبارك» (safe everywhere), «رمضان كريم» (Egypt and the Levant); useful, calm content | tie a product benefit to prayer or fasting, quote the Quran on a promotion, use a mosque or the Kaaba to sell |
| `festive` (Eids, Sham El-Nessim, Mother's Day, New Year) | «كل عام وأنتم بخير», «عيدكم مبارك»; warm, short, shareable | stack a hard sale on the greeting |
| `patriotic` (national days) | pride and history, local words; the country's colours as colour | disputed maps, political claims, a national flag or emblem on a product without checking local rules |
| `respectful` (Christmas, Coptic Christmas, Coptic Easter) | a short respectful greeting | promotion; religious imagery for selling |
| `solemn` (Ashura, UAE Commemoration Day) | quiet, brief, dignified, or silence | promotion, humour, a call to action beyond follow or send |
| `commercial` (White Friday) | clear offers with real numbers and real deadlines; a real stock limit if there is one | fake scarcity, unsourced discounts, religious or national symbols |

Sensitivity flags carried by an occasion (the SEN1 gate checks them on the finished post):
- `noQuranOnPromo`: no verse of the Quran on any promotional slide.
- `noShahada`: no Shahada, and therefore no Saudi flag, on promotions.
- `noSaudiFlagOnPromo`: the Saudi flag (it bears the Shahada) is not used on promotional content.
- `noKaabaForSelling`: no Kaaba or mosque imagery for selling.
- `noDisputedMaps`: no maps of disputed borders; prefer no map at all.
- `term`: in a post for a Gulf audience say «الخليج العربي», not any other name for the Gulf.
Pass the occasion's flags to `carousel-create` with the slot.

## 4. Packs (data only, none in this release)
A pack is an overlay: `roles.accent2`, `background.texture`, `decor.motif` only, allowed for listed presets, plus a copy kit (greetings per dialect, seed angles) and the timing shift. It never changes the logo, main font or handle. No pack ships yet. White Friday and UAE National Day have no pack in v1: use the brand's styling. Tell the user once, in their `uiDialect`: eg «مفيش ستايل جاهز للمناسبة دي دلوقتي، هنستخدم ستايل البراند» · gulf «ما فيه ستايل جاهز لهالمناسبة الحين، بنستخدم ستايل البراند» · levant «ما في ستايل جاهز للمناسبة هاي هلق، رح نستخدم ستايل البراند» · msa-white «لا يوجد ستايل جاهز لهذه المناسبة حاليًا، سنستخدم ستايل البراند». If a pack is installed (the Studio page lists `cs-occasions`), set `style.occasionId` and let the plan carry the id.

## 5. What `plan.py` does with occasions
- Lists every relevant occasion of the month (any phase) in the plan's `occasions` (up to 24, most important first).
- Gives a slot of its own to each importance-2 or importance-3 occasion that starts in the month (or up to a week after it), at most half of the slots, preferring the free slot closest to the start and not after it; its `title` is the occasion's name, its `note` carries the date and the tone.
- Ramadan (`tagAllSlots`): every slot inside the month carries the occasion id and posts at 21:30 when it was earlier.
- Warns when an occasion has no free slot nearby ("add one by hand").
- Uses the brand's countries; a brand with no countries gets region-wide occasions only.

## 6. Notes on specific occasions
- **Ramadan**: content that helps (routines, budgeting, planning, recipes by niche); series work well; posts after iftar; the last ten nights are reflective.
- **Eid al-Fitr and Eid al-Adha**: holiday length differs by country (in the Gulf the Eid al-Adha holiday often starts on the Day of Arafah). Greetings first; offers after.
- **Saudi Founding Day (22 Feb) and National Day (23 Sep)**: 22 Feb 2027 falls inside Ramadan; keep the tone reverent as well as proud.
- **UAE National Day (2–3 Dec)** and **Bahrain (16–17 Dec)**, **Qatar (18 Dec)**, **Kuwait (25–26 Feb)**, **Oman (18 Nov, holidays announced yearly)**: celebratory, local.
- **Mother's Day (21 Mar)**: celebrated across the Arab world except the Maghreb; warm and personal.
- **White Friday** (the Friday after US Thanksgiving): retail teasers start two to three weeks earlier.
- **Valentine's Day**: some audiences object; follow the audience, skip it for a mainly conservative one.
- **Mawlid**: not an official occasion in Saudi Arabia.
- **Ashura**: observed differently across communities; never promotional.
- The calendar leaves out occasions that are politically disputed or whose dates are unsettled (for example Palestine, Syria, Sudan, Yemen, Libya): if the user wants one, ask for the date and the tone and treat it as `exact` only if they confirm.
