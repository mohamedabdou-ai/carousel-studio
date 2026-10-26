---
description: خطة البوستات للأسبوع أو الشهر · Plan your week or month of posts
argument-hint: "[أسبوع | شهر]"
---

Plan content with the `content-plan` skill. Arguments: $ARGUMENTS

- «أسبوع» or `week` plans the next seven days; «شهر» or `month` (the default) plans the coming calendar month. With no brand profile, run `brand-setup` first for the pillars and the posting rhythm.
- Occasions come from `scripts/calendar.py` only; never work out a date or a Hijri date yourself. Hijri dates are flagged ±1 day: tell the user to confirm after the official announcement.
- Build the plan with `scripts/plan.py new`, lint it with `plan.py lint`, then show one Arabic line per slot. The file is `plan-YYYY-MM.json`.
- «اعمله دلوقتي» or «اعمل بوست الخانة 3» starts `carousel-create` on that slot.

Same thing in plain words: «خطة الأسبوع» · «خطة الشهر» · «إيه المناسبات الجاية؟» · «أفكار محتوى» · "plan my content".
