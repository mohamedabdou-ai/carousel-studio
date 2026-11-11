# The creator's own script

Use this when the user pastes a finished script: numbered slides (①, «1.», «١ | الغلاف», «**١ — الكافر**», «**سلايد ١ — label**», a bare «**سلايد ٣**» above its title) or sections split by `---`, or says «ده السكريبت» / «السكريبت جاهز». Blank lines and separators are optional. Their words are the script. This lane skips the writers' room: **do not read** `rounds.md`, `flow.md`, `architectures.md`, the team charter, the Creative Director manual, the hook files, the schemas or any script's source, and do not dispatch the strategist, copywriter, panel, motion designer or Creative Director. Read this page and its brand lookup and, if you are unsure of a word, the post's `dialects/<code>.md`.

## Steps
1. **Brand.** Find `brand.json` (`brand-lookup.md`, "Where to look"). Take the dialect and digits from it; ask nothing else.
2. **Save the script** exactly as pasted to `<post>/script.md` (the post folder is `post-YYYYMMDD-NNNN` in the workspace or next to the brand). Parse this file directly; never write a `script.parse.md` copy. Role labels, Markdown spans and backticks are formatting; their text stays. A quoted prompt stays copy. Trailing source names are reported as source mentions, not rendered text. Links become sources automatically, with tracking parameters removed and the originating slides linked; this does not fetch or verify a page.
3. **Structure:** `python scripts/script_to_spec.py --script <post>/script.md --brand brand.json --out <post> --architecture <one word>`, plus `--style <preset>` when the user named one. A long slide runs on at its own paragraph or sentence end, every word kept and in order, within the platform's slide budget (10). This includes the slide-2 and closing-slide splits. A script already over the limit is kept in full: offer the reported neighbouring merge candidates, shortest pair first; never merge or truncate on your own. When the user says the script is final («كما هو», «زي ما هو», «من غير تغيير», "as is"), add `--no-split` and record allowed length overrides in step 5 without asking again. The architecture is one of `news, story, case-study, listicle, steps, myth-fact, opinion, comparison, framework, results, offer, lead-magnet`; pick it from the topic in one thought. The command prints its decisions, the missing fill and fresh QA counts, even before the caption pack exists. Exit 2 can mean a saved spec with open BLOCKs; a `cs-error` means the write was refused.
4. **Fill:** write `<post>/fill.json` with only what it asks for, in the post's dialect:
   - `bridges`: one per slide from 2 to the last but one, at most 8 words; it opens the next slide and never repeats its title.
   - `emphasis` (optional): one keyword per slide that is already in its title or headline, e.g. `{"s04": "توقيت"}`.
   - `caption`: `firstLine` (at most 125 characters, a reason to tap «more», not the cover again), `keywordLine` (the words people search for), `body` (the whole caption 300 to 900 characters: the payoff in short lines, no new claims, no numbers that are not in the script), `cta` (the same single action as the last slide), `hashtags` (3 to 5, topic first, no tool or author tags). A caption the creator wrote is the caption: split it into these fields word for word, emoji included, and write only a missing field. Hashtags they named and the brand's `ext.alwaysHashtags` come first, inside the five.
   - `perSlide`: one line per slide, at most 100 characters. `alt`: one per slide, in the post's language, saying what the slide says and shows.
   - Existing `edits`, `motion`, `teamLog` and `keep` fields still work in older fill files. For deliberate changes after the first fill, use `spec_edit.py` below. Offer a shorter line or a single action in one line; never apply it without the creator's yes.
5. **Check:** `python scripts/script_to_spec.py --spec <post>/spec.json --fill <post>/fill.json --brand brand.json`. If `SRC1.missing` names the creator's own figures, ask once: «هل تؤكد أن الأرقام التي كتبتها صحيحة وتتحمل مسؤولية مصدرها، أم تريد إضافة مرجع؟». Only after confirmation, run `spec_edit.py source attest` or re-run this step with `--attest-numbers`. This creates a `user` source for the currently unsourced figures; it never replaces an attached reference. New figures require a new confirmation. For a supplied reference use `source add`; a source name without a URL is not verified evidence. For an allowed copy override, ask once and run `spec_edit.py keep C1.hero-words` (or `C2.body-words@s06`). Offer an approved shorter version through `cover`, `text` or `cta`. Technical and non-overridable BLOCKs stay open. Run `python ../arabic-proofread/scripts/ortho_lint.py --spec <post>/spec.json --brand brand.json` for Arabic; fix your own spelling and offer changes to the creator's words. The Arabic editor runs only on request.
   If the script ends on its last item, offer **one** closing line and explain its kind: save, send, question, keyword-dm (with delivery), or follow. Do not add a question or a reply request silently. On approval use `cta`; on «زي ما هو» use `cta --keep`. That records the creator's choice without adding words. The current shared rules do not permit waiving `C4.count` or `C5.skeleton`, so those findings remain visible and export stays blocked until the coordinator resolves the gate policy or the creator adds a CTA.
6. **Design:** hand off to carousel-design in the Design view (its "Fast lane"). The cover motion is already set by the Studio's own rule; the Motion tab offers the alternatives, so no motion agent and no storyboard unless the user asks. The art director owns every slide, the cover first. If the creator asks for something the engine's cover cannot hold (a video playing inside the cover, a photo cut-out) and you build that cover yourself, it is still a slide: send the art director its frame-0 image and its source files with the inner slides, and never tell the art director to leave slide 1 alone.

## Change a finished spec

Use `python scripts/spec_edit.py --spec <post>/spec.json --brand brand.json COMMAND`. Never patch `spec.json` with Python heredocs, JSON substitutions or other ad-hoc code. `show` is read-only; every successful change increments `rev`, invalidates the frozen design, validates the schema before writing and prints open BLOCK and FIX counts. Use `--format json` for one JSON object and `--expect-rev N` when acting on a previously read revision. Exit 75 means re-read and retry; never overwrite a conflict. The shared lock is `spec.json.lock`; inspect an abandoned lock before removing it.

```text
show
style notebook
cover --headline "موعد واضح" --sub "خطوة صغيرة" --kicker "دليل عملي"
text s02 --field body --text "النص الذي وافق عليه المنشئ."
text s03 --field bridge --text "والخطوة التالية؟"
source add --url "<source-url>" --label "تقرير النتائج" --slide s02 s03
source attest
alt s02 "وصف الشريحة بعد المراجعة."
caption --field firstLine "سبب واضح لقراءة التفاصيل."
caption --field perSlide --slide s02 "تعليق الشريحة."
caption --field hashtags "#تنظيم" "#عمل"
cta --kind save --title "ارجع إلى الخطوات" --text "احفظ القائمة."
cta --kind keyword-dm --title "دليل الخطوات" --text "اكتب «دليل»." --keyword "دليل" --delivery instant
cta --keep --reason "المنشئ اختار النهاية كما هي"
override post roles.accent=#2468AC
override s02 type.scale.body=48
keep C2.body-words@s06
apply --file approved-design.json
```

`text` accepts `title`, `body` or `bridge`; `alt` and per-slide captions accept a stable id or position. `caption` also accepts `keywordLine`, `body`, `cta`, and `asset` with `--keyword`, `--delivery` and optional `--description`. A cover edit updates the hook and exact cover quotes in captions, per-slide captions and alt text; unrelated descriptions stay. Override values are scalars only; an unknown key reports the valid engine token paths. Sources use `location` for the label (the schema has no `label` field). No reference is fetched. A caption has no `sourceIds` field: attach references to slides.

For approved picture assets, motion, free designs or a Studio URL, `apply --file` accepts `{"post": {"assets": [...], "meta": {"studioUrl": "..."}}, "slides": {"s02": {"media": {...}, "free": {...}}}}`. Write that design file, then let the command validate and record it. It cannot change identities, revisions, approvals, frozen data or QA. Never bypass the command with ad-hoc code. After changing copy on a free slide, have its design updated and rechecked too.

## What survives a re-run

Keep `script.md`, `fill.json` and **`spec.edits.json`** with the post. The edit record is written by the commands; do not hand-edit it. Old fill files require no conversion. On the first rebuild of an older spec, existing sources, assets, media, cover lines, captions and design fields are captured in the record once.

Every run applies, in order: parsed script (or the current spec for step 2), the retained legacy fill, deliberate edits in their recorded order, then attestation of the unchanged figures. It binds numbers, validates the schema, re-runs QA and applies only permitted copy overrides before replacing the files atomically. Deliberate edits win over an older fill file. The record is written before the spec so a run interrupted between replacements can recover by replay. A changed slide structure with saved edits is a conflict; review the record against the new structure before rebuilding, rather than moving an edit onto a different slide. New content or design edits require design review again.

## In chat
Four short lines at most before the link: what you kept («سكريبتك زي ما هو»), the one or two decisions (e.g. slides 6 and 8 run on into a second slide each), what the art director fixed, and the next word to say («تمام، صمّم» or «صدّر»). Never paste the script or the caption back.
