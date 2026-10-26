# Cadence: how often, which days, which hours

`plan.py new` applies these defaults; the user's own words always win.

## 1. Posts per week
- Default **4**, normal range 3–5. Posting 3–5 times a week roughly doubles follower growth compared with 1–2 (a large cross-account study), and a rhythm the user can keep beats a bigger one that collapses in week three. Start lower and raise it after a month that went to plan.
- 1–2 a week is fine for a busy business owner; say it will grow more slowly.
- `plan.py` generates up to 7 a week. For more, generate 7 and add the extra slots by hand.
- Produce in batches: two weeks of posts in one sitting is faster than one post a day, and the plan makes that possible.

## 2. Days
Most of the region works Sunday to Thursday; weekends are Friday–Saturday in Egypt and most of the Gulf, and Saturday–Sunday in the UAE, Lebanon, Tunisia and Morocco (`locale-defaults.json → countries[].weekend`). Weeks in a plan start on **Sunday**.

| Posts per week | Default days |
|---|---|
| 1 | Wednesday |
| 2 | Sunday, Wednesday |
| 3 | Sunday, Tuesday, Thursday |
| 4 | Sunday, Tuesday, Wednesday, Thursday |
| 5 | Sunday to Thursday |
| 6 | Sunday to Thursday and Saturday |
| 7 | every day |

If the user knows their audience's active days, use them (`--days sun,tue,thu`); `plan.py` then follows the number of days given. Do not claim a best day without the user's own numbers.

## 3. Hours
- Default **evening, 20:00–23:00 in the audience's time zone**; `plan.py` posts at 20:30 unless the brand stores best hours (then it uses the start of the window plus 30 minutes) or `--hours` is given.
- Best hours stated by the user (`strategy.bestHours`) beat any default. Hours derived from their own insights are a later feature; never invent them.
- **Time zone**: the brand's, else the first audience country's. With mixed audiences (UAE and Egypt) choose the zone of the larger share and say that the other audience sees the post one or two hours off.
- **Ramadan**: after iftar. `plan.py` moves any slot inside Ramadan that falls before 21:00 to 21:30; engagement shifts to after iftar and late at night.
- Eid days and the last ten nights of Ramadan: fewer, warmer posts; do not stack a sale on top of the greeting.

## 4. Series
A series keeps readers coming back: «الجزء 2 الخميس». Rules: at most one running series; a fixed weekday; part number and the next date in the call to action of the previous post (`follow` kind); one `metaLabel` (`style.metaLabel`) shown in the slide header so the series is recognisable; three to six parts. Put the series in consecutive slots of the plan and mention it in each slot's `note`.

## 5. Lead times
Occasions need planning earlier than a normal slot: start 28 days before (`plan` window), teasers from 7 days before (`pre`), and a thank-you or recap up to 3 days after. Retail occasions such as White Friday usually start earlier than that; widen the teaser window by hand.

## 6. Checking a plan against the rhythm
`plan.py lint` notes a week holding more posts than the rhythm says and a week with no save-intent list (`intent-mix.md`). It cannot see whether the user will actually have time: ask once, «تقدر تلتزم بـ4 في الأسبوع؟».
