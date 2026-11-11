# Posting guide: what to tell the user

The plugin prepares a **publishing kit**; it does not publish or ship anything specific to a publishing tool. After creator design approval, memory/history and the kit, ask once in their dialect: use a connected publishing tool, or files to post by hand? Read `brand.ext.publish` first: `manual`/`tool` skips this preference question. Store the answer through brand-setup. Never assume a platform. The kit's guide comes from `data/posting-guide.json` in the post's dialect.

## 1. The four steps (the guide's cards)
1. **Pick the files in order.** New post → select multiple → tap the files in order: `3x4/01-cover.mp4` first (or `01-cover.png` for a still cover; never both), then `02.png`, `03.png` … to the end. A carousel video has no cover picker, which is why frame 0 of the video is the finished cover.
2. **Keep 3:4.** All files are 1080×1440. If the app offers a crop control or another ratio, keep the original so nothing is cut. Instagram crops every item to the first item's ratio; the `4x5/` folder is only for schedulers.
3. **Paste the caption.** From `caption.txt`. About the first 125 characters show before «المزيد», so line 1 is the reason to swipe. At most 5 hashtags, at the end. The per-slide captions (`slide-captions.txt`, Instagram's "multiple captions", available since June 2026) are optional: a slide without one posts normally.
4. **Add the alt text.** In the advanced settings, write the alt text of each picture from `alt-text.txt`.
5. **Only when any asset is AI-generated: switch on Instagram's AI label** in the advanced settings. The reminder is the guide's fifth card, built from the `aiLabel` block of `posting-guide.json`; the caption file never carries it, because the caption is pasted as it is. The Studio adds the card whenever a slide is flagged AI or an asset has `aiGenerated: true`, in all five dialects.

At most 10 slides, including the still or video cover: Instagram’s publishing API and most schedulers accept at most 10 items. A focused carousel of 4, 5 or 6 slides is complete; 6 to 10 is an optional sweet spot, never a reason to pad the post.

## 2. Facts to rely on (Oct 2026)
- Up to 10 items including the still or video cover; photos and videos can mix; "Reels cannot be added to a carousel".
- After posting the user can reorder slides and delete one while at least two remain, but cannot add a slide.
- Hashtags: 5 at most, in the caption; they categorise, they do not add reach. Keywords belong in the caption's second sentence.
- A 1080×1440 MP4 was accepted as the first item of a carousel with the sizes intact (tested on a real account, 22 Oct 2026). Whether a carousel video needs an audio track is still unverified; the kit's cover has none.
- The profile grid shows 3:4 thumbnails; essential elements stay in the safe box (`design-system.md`), so the grid crop of a 4:5 post is harmless.
- Swipe direction: Instagram on the web mirrors the carousel for Arabic-UI viewers (slide 2 on the left). Phone confirmation is pending, which is why the swipe cue is a per-brand setting.

## 3. Timing
Use the plan's slot time. With no plan: evening 20:00–23:00 local, then the user's own best hours once they have them. In Ramadan engagement moves to after iftar and late night. Do not promise reach from a time.

## 4. A connected publishing tool
Read the creator's tool's own instructions and current limits from that tool, then follow them on the creator's word **each time**, only for the accounts and platforms they name. A saved `tool` preference is not permission to send. Never choose a service, account or platform for them, and never invent a tool call or reuse a bundled recipe.

Check supported media, ratio, mixed photo/video, alt text and AI labelling against the actual tool. The kit offers 3:4 PNG (1080×1440) and 4:5 JPEG (1080×1350), plus the motion cover. Keep one ratio, at most 10 items including cover; put MP4 first when mixed media is supported, otherwise use the still cover with the creator's agreement. Preserve caption/alt text and AI-label reminder within the tool's limits; say plainly when a manual step remains. If no named tool is available, give the four manual steps instead of claiming publication.

## 5. Things to repeat when relevant
- **Original content**: a repurposed post must be transformed, not reposted; attribute quoted material in the caption (the originality gate C10 compares the post with the user's sources).
- **No bait**: a bare «اكتب كلمة…» request can cost recommendations; a keyword-to-DM call to action only works when the file really arrives instantly.
- **Do not add** any "made with" line, credit or promotion to the caption or slides.
- **Alt text** matters more than it seems: only about 6% of Arabic carousels have a custom one.
- Third-party watermarks, other people's screenshots and logos are flagged in the QA report.

## 6. After posting (optional)
Offer to set the plan slot to `posted` (the `content-plan` skill does it) and to note the result for next time. Do not ask for numbers the user has not offered.

## 7. Short lines in Egyptian (adapt to the user's dialect)
«الملفات جاهزة بالترتيب. افتح بوست جديد، اختار الكل بالترتيب والغلاف الأول، وسيب المقاس 3:4 من غير قص.» · «الكابشن في caption.txt، الصقه كله.» · «لو في صورة اتعملت بالذكاء الاصطناعي، فعّل علامة الذكاء الاصطناعي قبل النشر.»
