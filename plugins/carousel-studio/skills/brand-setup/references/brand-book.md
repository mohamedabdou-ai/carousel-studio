# The Brand Book

The Brand Book is the last thing the onboarding produces and the document the user approves. It
is one tab of Brand Home (`CS.ui.brandBook.mount(root, brand, { sampleHook })`, built by
carousel-design from `brand.json`); this file says what it contains, which field feeds each block,
how gaps are shown, and how approval works. The page, its PDF and the copied brand card carry no
credit or name of the maker; the single thank-you line is chat text after approval
(`sections.md` section 6).

## 1. Blocks
| # | Block | Fed by | When data is missing |
|---|---|---|---|
| 1 | **Identity**: who, niche, offer, goal, handle | `name`, `handle`, `kind`, `identity.*` | «ناقص» + button to answer (opens section 1) |
| 2 | **Persona**: the person written for, pains, desires, objections, FAQs, awareness | `audience.*` | «ناقص» |
| 3 | **Dialect, digits and swipe**: dialect and sub-variety, register, digits with its reason, swipe cue with its reason, countries | `locale.*` | never missing (set at step 0), shown with the evidence line for digits |
| 4 | **Do and don't**: «قل / لا تقل» lists in the dialect, the words the brand uses and avoids, the Latin terms | `voice.use`, `voice.avoid`, `locale.latinTerms`, the dialect file's `deny` highlights | the dialect defaults, labelled «افتراضي» |
| 5 | **Voice fingerprint**: sentence length, emoji, English mix, ellipsis, question habit, person, signatures; a small chart of the percentiles | `voice.fingerprint` | «ناقص: ابعت 3 كابشنات» |
| 6 | **In your voice**: three lines the user confirmed | `ext.voiceRewrites` | block hidden |
| 7 | **Logo and palette**: logo on light and dark, the six roles, the **WCAG matrix** (ink and muted on bg and surface, text on accent, accent on bg, each with its ratio and a pass mark) | `visual.logo`, `visual.palette` | «ناقص» + starter button |
| 8 | **Fonts**: the display, body and Latin faces, a live picker that shows the user's own hook in each candidate | `visual.fonts`, `sampleHook` | the preset's own fonts, labelled «افتراضي» |
| 9 | **The look**: the chosen preset rendered as cover, slide 2 and CTA with the user's hook, plus the 2 alternates | `visual.presetId`, `presetAlternates` | «ناقص» |
| 10 | **References**: the user's own work and inspiration, nearest preset and confidence, and a "too close to a competitor" note when it applies | `references[]` | block hidden |
| 11 | **Strategy**: pillars with shares, posts per week, best hours with time zone, the intent mix | `strategy.*` | «ناقص» |
| 12 | **Tools**: capabilities found, the consent mode, one neutral tip | `tools.*` | «لم يُفحص» |
| 13 | **Hook pack**: how many hooks are imported, by family, and which are unverified | `hooks.packs` and the pack file | block hidden |

`sampleHook` is the user's own cover line, or the sample line of `identity-starter.md` section 4b.
Labels and the «ناقص» marks follow `locale.uiDialect`.

## 2. Gaps
A block with no data shows «ناقص» and one button that goes back to that section. `brand_io.py
resume` returns `gaps` (sections not `done`) for the page to read; a skipped section is a gap, a
`todo` section is a gap. A Brand Book with gaps can still be approved; the gaps stay marked, and
the section returns just in time (voice before the first caption, visual before the first design).

## 3. Approval
1. The user reviews the page and asks for changes in chat or on the page; changes go through `brand_io.py set` or `save-section`, then the page is rebuilt and republished at the same address.
2. «اعتمد» (button or chat) runs `python brand_io.py approve --slug S`: the first approval sets `approvedAt` and `onboarding.bookApprovedAt` and keeps `version` at 1; a later approval raises `version` by one. `onboarding.current` becomes `close`.
3. Rebuild and republish Brand Home so the embedded `brand.json` carries the stamp.
4. Print the capsule: `python brand_io.py capsule --slug S` (at most 1,500 bytes) and ask the user to keep it as the Project file («انسخ كارت البراند»). The page offers the same copy button.
5. Offer the credit-free PDF of the Brand Book (`toPrintableHtml()`), then the thank-you line (once) and the first-carousel offer.

Approval is explicit. Never approve on the user's behalf, and never stamp a brand that fails
`brand_io.py validate`.

## 4. The brand card (capsule)
```
[Carousel Studio brand capsule v1]
brand: <name> (<slug>) | dialect: eg | register: dialect | digits: western | swipe: arrow-rtl
voice: <at most 200 characters of tone, words to use and avoid>
palette: bg #F6F2EA ink #14120F accent #FFD23F | fonts: alexandria / readex-pro / inter | preset: creator
home: <Brand Home URL or ->
```
It is the only part of the profile that has to survive in a new chat; with it Claude finds
the Brand Home page and reads the rest. It holds no contact details and no secrets.

## 5. Versions
`version` counts approved Brand Books (a draft is version 1 until approved). `snapshotHash`
(`brand_io.py snapshot-hash`) ignores `updatedAt`, `createdAt`, `ext`, `onboarding`,
`creativeMemory`, `hooks.history` and the logo data URI, so a post's `brand.snapshotHash` changes only when something
that affects the design or the copy changes. When it differs from the hash stored in an old spec,
tell the user, in their `uiDialect` (eg «البراند اتغيّر من أول البوست ده» · gulf and levant «البراند تغيّر من هالبوست» · msa-white «تغيّر البراند منذ هذا المنشور» · en "the brand has changed since this post"), and offer to re-run the checks.
