# QA gates

Deterministic gates run on text, renders and exports; rules: `data/qa-rules.json`, thresholds: `data/platform-instagram.json`. Python checks text; the Studio checks rendered/export scopes.

Contents: [Scopes](#1-where-the-gates-run) · [Findings](#2-a-finding) · [Overrides](#3-severity-overrides-and-auto-fix)
[Gates](#4-gate-reference) · [Model checks](#5-checks-a-model-runs) · [Checkpoints](#6-checkpoints)
[Inputs](#7-what-the-gates-read) · [Python](#8-notes-for-the-python-engine-and-for-editors-of-the-rule-files) · [Credits](#9-gate-x1-and-the-owners-credit) · [Changes](#10-changing-the-gates)


## 1. Where the gates run

| Scope | Gates | Runs in | Needs |
|---|---|---|---|
| text | C1-C10, O1, N1, B1 (text part), B2, SRC1, SEN1, D8, visual spec gates | Studio, Claude Code, the Python sandbox | the spec, the **brand** (B2 reads its handle and name; without it only the series label is judged) and optionally the post history |
| rendered | D1 (slide size), D2-D7, D9.*, D10 craft, T1, B1 (rendered part), A1 | Studio, Claude Code | a DOM: the rendered deck |
| export | D1 (files), V1, X1, A1 | Studio, Claude Code | the files the exporter produced |

```js
const text = CS.qa.runText({ spec, brand, history });                        // QAResult[]
const dom  = await CS.qa.runRendered({ spec, tokens, deck });                // QAResult[]
const out  = await CS.qa.runExport({ spec, files, video });                  // QAResult[]
const rep  = await CS.qa.run({ spec, brand, tokens, deck, files, lane: "studio" });   // QAReport
CS.qa.report.toMarkdown(rep, "ar");                                          // qa-report.md
```

`run` merges the scopes the inputs allow, sorts the findings, emits `cs:qa` and returns the report (`qa-report.schema.json`); store `CS.qa.specQa(rep)` in `spec.qa`. The kit's own report (`qa-report.json` in the kit, in both lanes) passes the live deck as well as the files, so it carries all three scopes: a report with zero notes is only a clean report when it holds `thumbnail` and `painter`, which only the rendered scope writes. `runText` accepts `opts.gates` (for example `["C2","N1"]`), `opts.slides` (slide ids, to re-check one slide after an edit) and `opts.fast`. Python gives the text scope only: `validate.py spec FILE --lint`, `lint_copy.py`.

| Status | Meaning | CLI exit code |
|---|---|---|
| `pass` | no open BLOCK or FIX (NOTE is advice) | 0 |
| `fix` | a FIX is open: the kit exports with a badge | 1 for lint/validate; render.mjs returns 0 (1 with `--strict`) |
| `block` | a BLOCK is open: «حزمة النشر» stays disabled | 2 |

## 2. A finding

```json
{ "gate": "C2", "rule": "C2.body-words", "sev": "FIX", "slide": "s04", "el": "s04.body",
  "msg": { "ar": "...", "en": "..." }, "fix": { "ar": "...", "en": "..." }, "autofixed": false }
```

- `rule` is the check id from `qa-rules.json`. Orthography findings carry the id of the `ortho.json` rule in lower case: `O1.ortho-dig-004`.
- `el` is an element key: `s03.title`, `s03.bullets.2`, `s06.sides.1`, `s06.sides.1.label`, `s05.number`, `s08.cta`, `caption.firstLine`, `caption.keywordLine`, `caption.body`, `caption.cta`, `caption.perSlide.2`, `caption.alt.2`, `caption.hashtags.1`, or just the slide id for slide-level findings. Rendered findings use the same keys, taken from `data-slot` and `data-m-i`.
- Messages are white MSA and English, with `{name}` placeholders already filled. A snippet of user text is at most 40 code points. The messages of gate X1 never repeat the text they found.
- Order: severity (BLOCK, FIX, NOTE), gate order of `qa-rules.json`, slide position, element key, rule id. Identical gate, rule, slide, element and message collapse into one.

## 3. Severity, overrides and auto-fix

- **BLOCK** disables the kit. **FIX** exports with a badge. **NOTE** is advice. A finding that has `overridden: {reason, at}` no longer counts.
- **Overridable** (the user may tap «صدّر رغم ذلك», logged with a reason in `spec.qa` and in the report): `C1.*`, `C2.body-hard`, `C3.*`, `C4.count`, `C5.skeleton`, `O1.*` and the originality checks `C10.*`. An explicitly kept ending without a CTA may override `C4.count` and `C5.skeleton`; other C4 rules stay locked. Everything technical (D, V1, X1, A1, N1, B1 rendered, SRC1, C6, C9) is never overridable. `CS.qa.override(spec, gateOrRule, {slide?, reason, at?})` throws `E_USAGE` for a locked rule or when nothing matches; `run` carries earlier overrides onto matching findings (same gate, rule, slide and element).
- **Auto-fix** (`CS.qa.autofix(spec, results, {brand})` returns `{spec, applied, remaining}`, never mutating its input) repairs text only, from the rule and element key of a finding:

| Kind | Repairs | Rules |
|---|---|---|
| `digits` | converts every digit and the percent sign to `locale.digits` (handles, tags, URLs and Latin tokens untouched) | N1.* |
| `bind` | joins a stranded «لـ/بـ/الـ» to its word; number/noun bindings belong to rendering | B1.stranded-lam |
| `ortho` | every `ortho.json` rule with `autofix: true`: space before ، ؛ ؟, Latin `, ; ?` in Arabic, spaces after marks and between digit and letter, double spaces, repeated marks, `...` to the ellipsis character, programmatic tatweel outside the slide's `kashidaWord`, Persian letters | O1.ortho-* |
| `refit`, `split`, `scrim`, `oklch` | layout repairs done by the engine or the Studio; `autofix` leaves these in `remaining` | D2.overflow, B1.isolation, D3.*, D4.* |

`CS.qa.isAutofixable(result)` tells the Check screen whether to show «صلّح تلقائياً» for a finding. Every check also has a human `fix` hint, in both languages.

## 4. Gate reference

Thresholds are shown as resolved from `platform-instagram.json`; change a number there and every package follows. "Ovr" = overridable. "Engine": `py` (Python), `js` (browser/Node), `model` (judged by an agent).

### Text scope

#### C1 · Cover limits · حدود الغلاف

Scope `text`.
Applies to slideTypes [cover, poster].

| Rule | Sev | Ovr | Auto-fix | Engine | Condition |
|---|---|---|---|---|---|
| `C1.hero-words` | BLOCK | yes |  | py+js | The first beat of a cover or poster headline has more than params.max words. Params: `max` = 6. |
| `C1.total-words` | BLOCK | yes |  | py+js | wordCount of kicker + headline + sub (each markup-stripped) is greater than params.max. Params: `max` = 12. |
| `C1.lines` | FIX | yes |  | py+js | The number of forced line breaks (newline characters) in the headline plus one is greater than params.max. Params: `max` = 3. |
| `C1.number-words` | FIX | yes |  | py+js | An entry of copy.json lists[params.list] matches the cover text (kicker + headline + sub, markup-stripped). Params: `list` = numberWords. |
| `C1.meaning-word` | FIX | yes |  | model | Model check: the first words of the headline carry the meaning (number, outcome or tension), not filler. |
| `C1.gap-answered` | BLOCK | yes |  | model | Model check: the cover leaves one specific gap open and does not answer it. |

#### C2 · Text limits · حدود النص

Scope `text`.

| Rule | Sev | Ovr | Auto-fix | Engine | Condition |
|---|---|---|---|---|---|
| `C2.title-words` | FIX |  |  | py+js | wordCount(stripMarkup(title)) is greater than params.max on slides of the listed types. Params: `max` = 6. |
| `C2.body-words` | FIX |  |  | py+js | On slides of the listed types, any body or side text has more words than params.max and at most params.hardMax. Params: `max` = 25; `hardMax` = 35. |
| `C2.body-hard` | BLOCK | yes |  | py+js | On slides of the listed types, any body or side text has more words than params.max. Params: `max` = 35. |
| `C2.bullets` | FIX |  |  | py+js | A slide whose type is not in params.denseTypes has more bullets than params.max. Params: `max` = 4; `denseTypes` = [checklist, summary]. |
| `C2.bullets-dense` | BLOCK |  |  | py+js | A checklist or summary slide has more bullets than params.max. Params: `max` = 8; `denseTypes` = [checklist, summary]. |
| `C2.dense-words` | FIX |  |  | py+js | Words of title + bullets + bridge on a checklist or summary slide are greater than params.max. Params: `max` = 45. |
| `C2.slide-words` | FIX |  |  | py+js | Words of all visible slide copy (kicker, headline, title, number, sub, body, bullets, sides, attribution, bridge, CTA text) are greater than params.max. Params: `max` = 50. |
| `C2.bridge-words` | FIX |  |  | py+js | wordCount(stripMarkup(bridge)) is greater than params.max. Params: `max` = 8. |
| `C2.cta-words` | FIX |  |  | py+js | Words of title + body + CTA text on a cta slide are greater than params.max. Params: `max` = 12. |
| `C2.share-words` | FIX |  |  | py+js | Words of headline + sub on a share slide are greater than params.max. Params: `max` = 12. |

#### C3 · Slide 2 · السلايد الثاني

Scope `text`.
Applies to formats [carousel], slidePositions [2].

| Rule | Sev | Ovr | Auto-fix | Engine | Condition |
|---|---|---|---|---|---|
| `C3.words` | BLOCK | yes |  | py+js | Words of the slide-2 copy (all visible fields except bridge and CTA text) are greater than params.max. Params: `max` = 12. |
| `C3.intro` | BLOCK | yes |  | py+js | An entry of copy.json lists[params.list] matches the slide-2 copy. Params: `list` = introPhrases. |
| `C3.type` | NOTE | yes |  | py+js | The type of slide 2 is not in params.allowed. Params: `allowed` = [rehook, item, stat, proof, myth-fact]. |

#### C4 · Call to action · دعوة الإجراء

Scope `text`.

| Rule | Sev | Ovr | Auto-fix | Engine | Condition |
|---|---|---|---|---|---|
| `C4.count` | BLOCK | yes |  | py+js | Carousel with slides in which no slide carries a cta object. |
| `C4.multiple` | BLOCK |  |  | py+js | Carousel in which the cta objects use more than one distinct kind (the same kind repeated, for example on an offer slide and the closing slide, counts as one ask). |
| `C4.position` | FIX |  |  | py+js | A cta slide is neither the last slide nor the one before it. |
| `C4.intent` | FIX |  |  | py+js | spec.intent is set and a cta kind is not in params.allowedByIntent[intent]. Params: `allowedByIntent`: see rule file. |
| `C4.bait` | BLOCK |  |  | py+js | An entry of copy.json lists[params.list] matches a slide cta text or captionPack.cta. Params: `list` = commentBait. |
| `C4.keyword-asset` | BLOCK |  |  | py+js | A cta has kind keyword-dm and captionPack.asset is missing or its delivery is not instant. Params: `requireInstant` = true. |
| `C4.early` | BLOCK |  |  | py+js | In a carousel, a cta (on any slide that is not an offer slide) sits in the first half of the deck: its position is at most floor(slideCount / 2). |

#### C5 · Structure · بنية الكاروسيل

Scope `text`.
Applies to formats [carousel].

| Rule | Sev | Ovr | Auto-fix | Engine | Condition |
|---|---|---|---|---|---|
| `C5.slide-count` | BLOCK |  |  | py+js | The carousel has at least one slide and fewer than params.min or more than params.max slides. Params: `min` = 2; `max` = 10. |
| `C5.slide-count-low` | FIX |  |  | py+js | The slide count is at least params.hardMin and below params.min. Params: `hardMin` = 2; `min` = 4; `recMin` = 6; `recMax` = 10. |
| `C5.slide-count-range` | NOTE |  |  | py+js | The slide count is from params.warnBelow up to params.hardMax but outside params.min to params.max. Params: `warnBelow` = 4; `hardMax` = 10; `min` = 6; `max` = 10. |
| `C5.skeleton` | FIX | yes |  | py+js | The first slide is not of type cover, or the last slide is not of type cta or offer. Params: `first` = [cover]; `last` = [cta, offer]. |
| `C5.bridge` | FIX |  |  | py+js | A slide of one of params.types, that is not the last slide, has no bridge text. Params: `types` = [9 items]. |
| `C5.voice-drift` | FIX |  |  | py | Python only (voice_check.py): a style metric of the copy lies more than params.iqr times the interquartile range outside the brand fingerprint. Params: `iqr` = 1.5. |

#### C6 · List count · عدّاد القائمة

Scope `text`.
Applies to formats [carousel].

| Rule | Sev | Ovr | Auto-fix | Engine | Condition |
|---|---|---|---|---|---|
| `C6.list-count` | BLOCK |  |  | py+js | Count distinct positive integer `ord` members across slide types, not unnumbered context. With no ord, use `item` for listicle or `step` for steps; when the primary type is absent, count the other list type. A nonzero count that disagrees with the cover numeral is BLOCK. |
| `C6.slide2-promise` | FIX |  |  | py+js | Architecture is listicle, steps or framework, the cover text names a counted integer (2 to 99) in front of a noun, slide 2 is not itself an item or step slide, and slide 2 contains neither one of those integers (digits of either system) nor the title of the first item or step slide that follows it. A viewer Instagram re-serves from slide 2 never saw the cover's promise. Params: `architectures` = [listicle, steps, framework]; `itemTypes` = [item, step]. |

#### C7 · Repetition · التكرار

Scope `text`.

| Rule | Sev | Ovr | Auto-fix | Engine | Condition |
|---|---|---|---|---|---|
| `C7.cta-repeat` | FIX |  |  | py+js | The cta kind of this post equals the cta of one of the last params.window posts in history. Params: `window` = 2. |
| `C7.family-repeat` | FIX |  |  | py+js | spec.hook.family equals the family of one of the last params.window posts in history. Params: `window` = 2. |
| `C7.hook-similar` | FIX |  |  | py+js | similarity(hook cover, cover or text of a history entry) is at least params.max. Params: `max` = 0.8. |
| `C7.max-use` | FIX |  |  | py+js | The caller passed familyLimits for spec.hook.family and the family appears in history more often than allowed within the last limit.posts posts. |

#### C8 · Voice · لغة الكتابة

Scope `text`.

| Rule | Sev | Ovr | Auto-fix | Engine | Condition |
|---|---|---|---|---|---|
| `C8.ai-words` | FIX |  |  | py+js | An entry of copy.json lists[params.list] matches slide or caption copy. Params: `list` = aiWords. |
| `C8.stock-opener` | FIX |  |  | py+js | An entry of lists[params.list] matches at the start of the cover headline, the slide-2 headline or caption.firstLine. Params: `list` = stockOpeners. |
| `C8.translationese` | FIX |  |  | py+js | An entry of lists[params.list] matches slide or caption copy. Params: `list` = translationese. |
| `C8.stiff-msa` | FIX |  |  | py+js | Dialect posts only (eg, gulf, levant): an entry of lists[params.list] matches slide or caption copy. Params: `list` = stiffMsa. |
| `C8.hype` | FIX |  |  | py+js | An entry of lists[params.list] matches slide or caption copy. Params: `list` = hypeWords. |
| `C8.abstract` | NOTE |  |  | py+js | An entry of lists[params.list] matches slide or caption copy. Params: `list` = abstractWords. |

#### C9 · Caption pack · الكابشن

Scope `text`.

| Rule | Sev | Ovr | Auto-fix | Engine | Condition |
|---|---|---|---|---|---|
| `C9.length` | FIX |  |  | py+js | Characters (code points, NFC) of the assembled caption lie outside params.range (guided mode) or outside both params.range and params.fastRange (fast mode). Params: `range` = [300, 900]; `fastRange` = [100, 300]. |
| `C9.short-caption` | NOTE |  |  | py+js | Fast mode: the caption is shorter than params.range[0] but inside params.fastRange. Params: `range` = [300, 900]; `fastRange` = [100, 300]. |
| `C9.length-hard` | BLOCK |  |  | py+js | UTF-16 length of the assembled caption (NFC) is greater than params.max. Params: `max` = 2200. |
| `C9.first-line` | FIX |  |  | py+js | Characters of captionPack.firstLine are greater than params.max. Params: `max` = 125. |
| `C9.first-line-similarity` | FIX |  |  | py+js | similarity(firstLine, cover text) is at least params.max. Params: `max` = 0.6. |
| `C9.keyword-line` | FIX |  |  | py+js | captionPack.keywordLine is empty. |
| `C9.hashtags` | BLOCK |  |  | py+js | The number of hashtags (captionPack.hashtags plus #tags written inside the caption text) is greater than params.max. Params: `max` = 5. |
| `C9.hashtags-form` | FIX |  |  | py+js | A hashtag is duplicated (case-insensitive after NFC) or does not match # followed by non-space characters. |
| `C9.per-slide` | BLOCK |  |  | py+js | captionPack.perSlide is missing, shorter than the slide list, or an entry is empty. Params: `required` = true. |
| `C9.per-slide-length` | FIX |  |  | py+js | Characters of a perSlide entry are greater than params.max. Params: `max` = 100. |
| `C9.alt-missing` | BLOCK |  |  | py+js | captionPack.alt is missing, shorter than the slide list, or an entry is empty. Params: `required` = true. |
| `C9.alt-length` | NOTE |  |  | py+js | Characters of an alt entry are greater than params.max and at most params.hardMax. Params: `max` = 300; `hardMax` = 1000. |
| `C9.alt-length-hard` | BLOCK |  |  | py+js | Characters of an alt entry are greater than params.max. Params: `max` = 1000. |

#### C10 · Originality · الأصالة

Scope `text`.

| Rule | Sev | Ovr | Auto-fix | Engine | Condition |
|---|---|---|---|---|---|
| `C10.overlap-block` | BLOCK | yes |  | py+js | Share of the word 5-grams of a slide's copy or of the caption that also occur in the excerpts of url and file sources is at least params.blockAt. Params: `ngram` = 5; `minGrams` = 3; `blockAt` = 0.5; `fixAt` = 0.25. |
| `C10.overlap` | FIX | yes |  | py+js | Same measure, at least params.fixAt but below params.blockAt. Params: `ngram` = 5; `minGrams` = 3; `blockAt` = 0.5; `fixAt` = 0.25. |
| `C10.third-party` | FIX | yes |  | model | Model check: a slide shows a screenshot, logo or watermark that belongs to someone else. |

#### O1 · Orthography and dialect · الإملاء واللهجة

Scope `text+model`.

| Rule | Sev | Ovr | Auto-fix | Engine | Condition |
|---|---|---|---|---|---|
| `O1.ortho` | FIX | yes | ortho | py+js+model | Template for every rule of ortho.json (the finding id is O1.<rule id in lower case>); severity, message and autofix come from the rule. Rules owned by N1 and B1 are skipped. |
| `O1.deny-marker` | BLOCK | yes |  | py+js+model | A deny entry of dialects/<dialect>.json matches slide or caption copy and the word is not in brand.voice.allow. |
| `O1.warn-marker` | FIX | yes |  | py+js+model | A warn entry of dialects/<dialect>.json matches slide or caption copy and the word is not in brand.voice.allow. |
| `O1.proofreader-veto` | BLOCK | yes |  | model | Model check: the proofreader vetoes the copy (agreement, register, spelling it cannot fix deterministically). |
| `O1.dialect-purity` | FIX | yes |  | model | Model check: the copy mixes two dialects beyond the deny markers. |

#### N1 · Digits · الأرقام

Scope `text`.

| Rule | Sev | Ovr | Auto-fix | Engine | Condition |
|---|---|---|---|---|---|
| `N1.mixed` | BLOCK |  | digits | py+js | A field holds both Western and Arabic-Indic digits, ignoring handles, tags, URLs, e-mails, phones and tokens that carry a Latin letter (a field with Persian digits is reported by N1.persian instead). Slides, caption and alt text are all scanned. |
| `N1.persian` | BLOCK |  | digits | py+js | A field contains a Persian digit (U+06F0 to U+06F9) outside the excluded tokens. |
| `N1.system` | BLOCK |  | digits | py+js | A field uses exactly one digit system (Western or Arabic-Indic) and it differs from spec.locale.digits. |
| `N1.percent` | BLOCK |  | digits | py+js | A percent sign next to a digit (one optional space) does not match the digit system: % belongs to Western digits and ٪ to Arabic-Indic digits. |

#### B1 · Bidi · اتجاه النص

Scope `text+rendered`.

| Rule | Sev | Ovr | Auto-fix | Engine | Condition |
|---|---|---|---|---|---|
| `B1.stranded-lam` | BLOCK |  | bind | py+js | A one-letter or short clitic (لـ بـ كـ الـ بالـ وبـ …) ends in tatweel and is followed by whitespace and a Latin word, digit or currency sign. |
| `B1.unbound-pair` | FIX | | refit | js | Rendered number/noun or name/version pairs occupy different lines; ordinary spaces are valid copy. |
| `B1.isolation` | BLOCK | | refit | js | An atomic number, handle or URL splits over lines, or an engine-bound pair separates. A Latin phrase may wrap within its isolate. |
| `B1.raw-ltr` | BLOCK |  |  | js | Rendered: Latin letters sit in a text node that is not inside a .cs-ltr isolate. |

#### B2 · Placeholder chrome · عناصر الرأس الجاهزة

Scope `text`.

| Rule | Sev | Ovr | Auto-fix | Engine | Condition |
|---|---|---|---|---|---|
| `B2.placeholder-chrome` | BLOCK |  |  | py+js | The brand handle, the brand name or `spec.style.metaLabel` (the strings printed in the header of every slide, the MP4 and the PDF) is a stock example: a template token (angle, curly or square brackets), a value of the lists in the rule (compared after NFC, lower case, folding marks and punctuation; handles also without spaces: `@yourbrand`, `@handle`, `براند تجريبي`, `Meta label`…), contains `yourbrand`, `yourhandle`, `placeholder` or `lorem`, or has no letter or digit at all. Only strings that are present are judged: an empty handle passes (the slot is left out). |

Nothing else reads these strings: the slide text gates read `spec.json`, and the handle lives in `brand.json`. The first dogfood post shipped `@yourbrand` on every slide, the MP4 and the 4:5 set with a report of no findings. The lists equal `PLACEHOLDER_*` in `brand_io.py`, which refuses the same values at write time (a unit test keeps them equal), and `docs/examples/brand.example.json` keeps its stock handle and name on purpose so that a copy of the example cannot ship.

#### SRC1 · Sources · المصادر

Scope `text`.

| Rule | Sev | Ovr | Auto-fix | Engine | Condition |
|---|---|---|---|---|---|
| `SRC1.missing` | BLOCK |  |  | py+js | A claimed number has no source: a number block (stat, proof, testimonial, offer) or a number in front of a unit word, percent or currency sign. Counts of items, dates, years, ordinals, step labels, counters, handles and phones are exempt. A slide's claim needs slide.sourceIds (or number.sourceId) that resolve in spec.sources, else any source whose excerpt, ref, location or formula holds the same number. A caption number needs any matching source or a sourced slide claim. Params: `units`: see rule file; `labelsList` = bindLabels; `magnitudeMinValue` = 10; `yearMin` = 1900; `yearMax` = 2100. |
| `SRC1.mismatch` | FIX |  |  | py+js | A slide's linked sources hold readable text (excerpt, ref, location, formula; calc sources are skipped), and none of it contains the claimed number after digit normalisation. |
| `SRC1.unverified` | BLOCK |  |  | py+js | A source linked from a slide has verified set to false. |

#### SEN1 · Sensitivities · الحساسيات

Scope `text+model`.

| Rule | Sev | Ovr | Auto-fix | Engine | Condition |
|---|---|---|---|---|---|
| `SEN1.gulf-name` | BLOCK |  |  | py+js+model | GCC audience (dialect gulf, or a GCC country in brand.locale.countries): copy names the Gulf with a term from params.terms. Params: `terms` = [الخليج الفارسي, خليج فارس, persian gulf, gulf of persia]; `countries` = [SA, AE, KW, QA, BH, OM]. |
| `SEN1.conspiracy` | BLOCK |  |  | py+js+model | An entry of copy.json lists[params.list] matches slide or caption copy. Params: `list` = conspiracy. |
| `SEN1.fear-stacking` | BLOCK |  |  | py+js+model | At least params.minDistinct different entries of lists[params.list] match inside one slide, or inside the caption. Params: `list` = fearWords; `minDistinct` = 3. |
| `SEN1.religious-promo` | BLOCK |  |  | py+js+model | Promotional post (contentType soft-sell or intent sell): copy holds Quran brackets (U+FD3E, U+FD3F) or the Shahada. Params: `patterns`: see rule file. |
| `SEN1.religious-imagery` | BLOCK |  |  | model | Model check: selling content uses Kaaba or mosque imagery. |
| `SEN1.disputed-map` | BLOCK |  |  | model | Model check: a map shows disputed borders or names. |

### Rendered scope

#### D1 · Export format · صيغة التصدير

Scope `rendered`.

| Rule | Sev | Ovr | Auto-fix | Engine | Condition |
|---|---|---|---|---|---|
| `D1.render-size` | BLOCK |  |  | js | Rendered: a .cs-slide root is not laid out at spec.canvas.w by spec.canvas.h. |
| `D1.png-size` | BLOCK |  |  | js | Export: a PNG is not params.w by params.h. Params: `w` = 1080; `h` = 1440. |
| `D1.jpeg-size` | BLOCK |  |  | js | Export: a JPEG is not params.w by params.h. Params: `w` = 1080; `h` = 1350. |
| `D1.ratio` | BLOCK |  |  | js | Export: the PNG files (or the JPEG files) do not all share one pixel size. |
| `D1.alpha` | BLOCK |  |  | js | Export: a PNG header declares an alpha channel (colour type 4 or 6, or a tRNS chunk). |
| `D1.srgb` | BLOCK |  |  | js | Export: an embedded colour profile is present and is not sRGB, or a JPEG is not 3-component. |
| `D1.jpeg-bytes` | BLOCK |  |  | js | Export: a JPEG is larger than params.max bytes. Params: `max` = 8000000. |
| `D1.decode` | BLOCK |  |  | js | Export: a .png or .jpg file has no readable header. |

#### D2 · Layout · التخطيط

Scope `rendered`.

| Rule | Sev | Ovr | Auto-fix | Engine | Condition |
|---|---|---|---|---|---|
| `D2.overflow` | BLOCK |  | refit | js | Rendered: the fit report says overflow for a slot, the text of a slot runs outside the slot's own box by more than params.tolerancePx, or text lies outside the slide. Text rectangles are line boxes: a font content area taller than the line height is trimmed to it. Params: `tolerancePx` = 2. |
| `D2.outside-content` | BLOCK |  |  | js | Rendered: a text rectangle leaves params.box (the content box) by more than params.tolerancePx. Text under aria-hidden is ignored. Params: `box`: see rule file; `tolerancePx` = 1. |
| `D2.keep-out` | BLOCK |  |  | js | Rendered: a text rectangle overlaps one of params.zones by more than params.tolerancePx. Params: `zones`: see rule file; `tolerancePx` = 1. |
| `D2.chrome-band` | BLOCK |  |  | js | Rendered: header chrome is not inside params.header, footer chrome is not inside params.footer, or a footer item is taller than params.footer.itemMaxHeightPx. Params: `header`: see rule file; `footer`: see rule file; `tolerancePx` = 1. |
| `D2.chrome-drift` | BLOCK |  |  | js | Rendered: a chrome element (handle, meta, counter, swipe, save pill) moves by more than params.maxPx between slides on every anchor (start edge, end edge, centre) of one axis. Params: `maxPx` = 2. |
| `D2.accent-count` | FIX |  |  | js | Rendered: a slide uses more than params.max distinct chromatic colours for text, highlight fills or underlines outside the palette roles (ink, inkMuted, bg, surface, line, onAccent). Params: `max` = 2; `minChroma` = 0.05. |

#### D3 · Sizes · الأحجام

Scope `rendered`.

| Rule | Sev | Ovr | Auto-fix | Engine | Condition |
|---|---|---|---|---|---|
| `D3.body-floor` | BLOCK |  | split | js | Rendered: a text element with role body is set smaller than params.min px (the resolved tokens' floors.body wins when present). Params: `min` = 42. |
| `D3.meta-floor` | BLOCK |  | split | js | Rendered: a small or micro text element, or a chrome item, is set smaller than params.min px (floors.meta of the resolved tokens wins when present). Params: `min` = 30. |
| `D3.hero-floor` | BLOCK |  |  | js | Rendered: the hero text of a cover or poster is set smaller than params.min px (floors.hero of the resolved tokens wins when present). Params: `min` = 96. |

#### D4 · Contrast · التباين

Scope `rendered`.

| Rule | Sev | Ovr | Auto-fix | Engine | Condition |
|---|---|---|---|---|---|
| `D4.contrast` | FIX |  | scrim | js | Rendered: the contrast of a text element on the worst decile of its background is below params.body (params.large for text of at least params.largeMinPx px, or params.largeBoldMinPx px in bold) but not below params.hardBlockBelow. Params: `body` = 4.5; `large` = 3.0; `largeMinPx` = 66; `largeBoldMinPx` = 52; `hardBlockBelow` = 3.0; `decile` = 0.1. |
| `D4.hard` | BLOCK |  | oklch | js | Rendered: the same measure is below params.hardBlockBelow. Params: `hardBlockBelow` = 3.0. |
| `D4.unmeasured` | NOTE |  |  | js | Rendered: the background under the text is a photo and no pixel mask (CS.paint.textMask) is available. |

#### D5 · Arabic rules · قواعد الحروف العربية

Scope `rendered`.

| Rule | Sev | Ovr | Auto-fix | Engine | Condition |
|---|---|---|---|---|---|
| `D5.letter-spacing` | BLOCK |  |  | js | Rendered: computed letter-spacing of Arabic text is not 0 or normal. |
| `D5.justify` | BLOCK |  |  | js | Rendered: computed text-align or text-align-last of Arabic text is justify. |
| `D5.italic` | BLOCK |  |  | js | Rendered: computed font-style of Arabic text is italic or oblique. |
| `D5.font-synthesis` | BLOCK |  |  | js | Rendered: the browser would fake a bold face for Arabic text (font-synthesis allows weight, the requested weight is 600 or more and no loaded face of the family covers it). |
| `D5.text-opacity` | BLOCK |  |  | js | Rendered: Arabic text has a colour alpha below 1, or an ancestor with opacity below 1 that is neither a data-m-group=opacity wrapper nor aria-hidden. |
| `D5.kashida-count` | BLOCK |  |  | js | Rendered: the post has more than params.max words containing tatweel (U+0640). A tatweel after a clitic letter (ل ب ك, as in «الـAgent» or «بـClaude») that is followed by a Latin letter, a digit or a mark is the documented connector (ORTHO-BIDI-001) and is not counted. Params: `max` = 1. |
| `D5.kashida-preset` | BLOCK |  |  | js | Rendered: a tatweel is present although tokens.decor.kashida.allowed is false. A tatweel after a clitic letter (ل ب ك, as in «الـAgent» or «بـClaude») that is followed by a Latin letter, a digit or a mark is the documented connector (ORTHO-BIDI-001) and is not counted. |
| `D5.kashida-body` | BLOCK |  |  | js | Rendered: a tatweel sits outside the headline of a cover or poster. A tatweel after a clitic letter (ل ب ك, as in «الـAgent» or «بـClaude») that is followed by a Latin letter, a digit or a mark is the documented connector (ORTHO-BIDI-001) and is not counted. |
| `D5.kashida-joining` | BLOCK |  |  | js | Rendered: a tatweel does not sit between a dual-joining letter and a dual- or right-joining letter. A tatweel after a clitic letter (ل ب ك, as in «الـAgent» or «بـClaude») that is followed by a Latin letter, a digit or a mark is the documented connector (ORTHO-BIDI-001) and is not counted. |
| `D5.glyph-missing` | BLOCK |  |  | js | Rendered: CS.core.registry.missingGlyphs(font, text) is not empty for a text element (invisible formatting characters are ignored). |
| `D5.fallback-font` | BLOCK |  |  | js | Rendered: the first font family of an Arabic text element is one the engine resolved (tokens.fonts) or a face that failed to load, and no loaded @font-face backs it, so the browser substitutes a fallback. |
| `D5.tashkeel` | FIX |  |  | js | Rendered: the Arabic text of one slot has diacritics on at least params.ratio of its letters (and at least params.minLetters letters). Params: `ratio` = 0.4; `minLetters` = 8. |

#### D6 · Composition · التكوين

Scope `rendered`.

| Rule | Sev | Ovr | Auto-fix | Engine | Condition |
|---|---|---|---|---|---|
| `D6.headline-width` | FIX |  |  | js | Rendered: on a cover or poster, the widest hero line is narrower than tokens.layout.headlineWidth[0] or wider than headlineWidth[1] of the content width, each with params.tolerance slack. Params: `tolerance` = 0.05; `contentWidth` = 884. |
| `D6.lone-word` | FIX |  |  | js | Rendered: the last line of a text with two or more lines holds one word narrower than 35% of the widest line. Params: `minShare` = 0.35. |
| `D6.lines` | FIX |  |  | js | Rendered: the main text of a slide runs over more visual lines than params.limits allows for its type (cover and poster: headline; rehook: headline and sub; cta: title and body; checklist and summary: title and bullets; every other type: body). Params: `limits` = {7 keys}. |
| `D6.rows` | FIX |  |  | js | Rendered: the cover has more than params.max text rows. Params: `max` = 8. |
| `D6.families` | FIX |  |  | js | Rendered: Arabic text uses more than params.max font families across the deck. Params: `max` = 2. |
| `D6.latin-match` | FIX |  |  | js | Rendered: a Latin run differs from the nearest Arabic word in the same slot by more than params.weightTolerance in weight or in colour (when both are inside or both outside an emphasis mark). Params: `weightTolerance` = 100. |

#### D7 · Default look · الطابع الافتراضي

Scope `rendered`.

| Rule | Sev | Ovr | Auto-fix | Engine | Condition |
|---|---|---|---|---|---|
| `D7.no-brand` | NOTE |  |  | js | Rendered: no resolved token comes from the brand layer. |
| `D7.default-fonts` | NOTE |  |  | js | Rendered: the display or body family is one of params.families and the brand did not choose it. Params: `families` = [cairo, rubik, tajawal]. |
| `D7.default-layout` | NOTE |  |  | js | Rendered: more than params.share of the slides use the preset's default variant with no overrides. Params: `share` = 0.6. |

#### D8 · Slide rhythm · إيقاع السلايدات

Scope `text`.
Applies to formats [carousel].

| Rule | Sev | Ovr | Auto-fix | Engine | Condition |
|---|---|---|---|---|---|
| `D8.rhythm` | FIX |  |  | py+js | A run of consecutive slides with the same type and the same variant (a slide with no variant counts as one variant of its type) is longer than params.max. One finding per run, on the first slide past the limit. Params: `max` = 3. |

The first dogfood post had seven item slides in one template. Vary the variant, put an item in its `media` variant with a picture, add a payoff slide of another type, or add a demonstration slide (`archetypes.md` section 6).

#### D9 · Dead zone · المساحة الميتة

Scope `rendered`.

| Rule | Sev | Ovr | Auto-fix | Engine | Condition |
|---|---|---|---|---|---|
| `D9.dead-zone` | FIX |  |  | js | Rendered: on a cover or poster with no plate behind the text, the tallest empty vertical band between the header band and the footer band (measured over the text and media of the content area, chrome and decoration excluded) is at least params.maxShare of the canvas height. Params: `types` = [cover, poster]; `maxShare` = 0.25. |

The dogfood cover left 30% of the sheet empty under a three-line hero. Use the `center` or `number` cover variant, or a larger hero. `render.mjs --preflight` reports the band for every preset before a preset is chosen.

#### Visual checks · D9.*, D10.*, VA1

Stage 0 caps D9.*, VA1/VA2/VA9 and visual rhythm findings at **NOTE**; `prospect` records their uncapped severity. Do not relabel the engine report. Team design targets still require cover band <15%, working band <12%; inspect CSS drawings when occupancy is misleading.

| Check | Engine threshold / severity |
|---|---|
| `D9.band` | cover NOTE ≥10%, FIX ≥15%; working NOTE ≥8%, FIX ≥12%; pause 18/24%; BLOCK switches off |
| `D9.rect` | cover NOTE ≥20%, FIX ≥24%; working 15/20%; pause 30/40%; BLOCK switches off |
| `D9.fill` | working empty cells NOTE ≥40%, FIX ≥50%; pause 60/70% |
| `D9.container-fill` | occupied rows/columns ≥65%; large container ≥80%; populated panels below these thresholds receive NOTE; genuinely empty panels warrant FIX |
| `VA1.anchor-present` | spec-scope missing anchors; stage-0 NOTE, not permission to omit one |
| `D10.nesting` | >2 nested owners: FIX |
| `D10.icon-tile-stack` | ≥3 sibling icon-over-heading tiles: FIX |
| `D10.stroke-feed` | inner art stroke <1.4px at 0.36 feed scale: NOTE |
| `D10.art-label` | below role floor: FIX; Arabic 36, Latin/digits 34, chart 38, tool 30, numeral 200, word 220px |
| `D10.glyph-icon` | text-scope Unicode glyph used as icon: FIX; use pack art |

Design body ≤18 with card/field, ≤25 only in text-led D at ≥64px. C2's general engine bounds remain 25/35. Bridge is small 34px, bold 700, ink; free root end padding 32px. Cover hero target ≥14px at 130px; engine type target 150px, floor 96px. Footer bands y1165 cover / y1275 inner; D2 drift compares offsets **inside each band**, not absolute y. App-language arrows: ar ←, en →, mixed counter only. Free icons never bare.

#### T1 · Thumbnail · المصغّر

Scope `rendered`.

| Rule | Sev | Ovr | Auto-fix | Engine | Condition |
|---|---|---|---|---|---|
| `T1.hero-small` | FIX |  |  | js | Rendered: the cover hero at 130 px wide is smaller than params.pass but not smaller than params.fixMin px (below that D3.hero-floor already blocks). Params: `pass` = 14; `fixMin` = 11.5; `widthPx` = 130. |
| `T1.local-contrast` | FIX |  |  | js | Rendered: the hero's contrast against the average background under it is below params.min. Params: `min` = 3.0. |

### After generation and export scope

#### A1 · AI imagery · الصور المولّدة

Scope `after-generation`.

| Rule | Sev | Ovr | Auto-fix | Engine | Condition |
|---|---|---|---|---|---|
| `A1.flag` | BLOCK |  |  | js | A slide's media has ai true and its asset is missing or lacks aiGenerated true. |
| `A1.calm-zone` | BLOCK |  |  | js | A slide with a plate (or any AI image) behind text declares no calm zone (calmZone absent or none). |
| `A1.text-check` | BLOCK |  |  | js | An AI asset used by a slide has no recorded check in spec.ext.assetChecks[assetId].textChecked. Params: `recordPath` = ext.assetChecks. |
| `A1.ai-text` | BLOCK |  |  | model | Model check: an AI image contains letters, Arabic text or a watermark. |

#### V1 · Video cover · الفيديو

Scope `export`.

| Rule | Sev | Ovr | Auto-fix | Engine | Condition |
|---|---|---|---|---|---|
| `V1.codec` | BLOCK |  |  | js | Export: the cover video codec string does not start with params.prefix. Params: `prefix` = avc1. |
| `V1.profile` | FIX |  |  | js | Export: the H.264 profile is not High (avc1.64…). Instagram accepts the other profiles, so this is advice. |
| `V1.pixfmt` | BLOCK |  |  | js | Export: the pixel format is not params.expected (8-bit 4:2:0). A full-range yuvj420p file counts as yuv420p here and is judged by V1.range. Params: `expected` = yuv420p. |
| `V1.range` | BLOCK |  |  | js | Export: the video is full range (color_range pc, or a yuvj pixel format) when params.expected (tv, limited) is required. Params: `expected` = tv. |
| `V1.colour` | FIX |  |  | js | Export: the file names a colour primaries, transfer or matrix other than params.expected (bt709). Untagged files pass. Params: `expected` = bt709. |
| `V1.level` | FIX |  |  | js | Export: the H.264 level is higher than params.max (4.1). The Studio and HyperFrames lanes write 4.0; a hardware encoder may write 5.0 and the Studio then lowers it when the stream fits, so this is advice. Params: `max` = 4.1. |
| `V1.size` | BLOCK |  |  | js | Export: the video is not 1080×1440 (or 1080×1350 for the 4:5 variant). Params: `w` = 1080; `h3x4` = 1440; `h4x5` = 1350. |
| `V1.fps` | BLOCK |  |  | js | Export: the frame rate is not params.fps (constant). Params: `fps` = 30. |
| `V1.frames` | BLOCK |  |  | js | Export: the frame count differs from round(seconds × fps) by more than one frame. Params: `defaultSeconds` = 6. |
| `V1.audio` | BLOCK |  |  | js | Export: the audio track differs from params.expected (none unless SP7 says a silent track is needed). Params: `expected` = none. |
| `V1.faststart` | BLOCK |  |  | js | Export: the moov box does not come before the mdat box. Params: `required` = true. |
| `V1.keyframe` | BLOCK |  |  | js | Export: the first frame is not a keyframe. |
| `V1.closed-gop` | BLOCK |  |  | js | Export: the encoder reports closedGop false. |
| `V1.loop` | BLOCK |  |  | js | Export: the SSIM of the last frame against frame 0 (or, in the Studio, of the painted frame 0 against the poster) is below params.ssim, or the PSNR below params.psnr dB (params: `ssim` = 0.995; `psnr` = 45). Frame 0 of the encoded MP4 is also compared with the poster PNG (`check_video.mjs`), at the lower floor `plugin.motion.posterSsimMin` / `posterPsnrMinDb` (0.99 / 32 dB) of `platform-instagram.json`, because a lossy 4:2:0 encode cannot match a lossless PNG at the binding bar. |
| `V1.blank` | BLOCK |  |  | js | Export: the video reports blank frames between the hold-in and settle times. |
| `V1.flashes` | BLOCK |  |  | js | Export: the video flashes more than params.max times per second. Params: `max` = 3. |
| `V1.still-hold` | NOTE |  |  | js | Export, engine loops only: more than params.maxShare of the frames repeat the frame before them (a mean change under params.delta luma levels on a 108x144 grey copy), so the loop is mostly a held picture. Target stillShare ≤60% (motion ≥40%). Clip covers omit this whole-frame statistic because it cannot measure movement inside their media window. Params: `maxShare` = 0.6; `delta` = 0.03. |
| `V1.thin-frames` | NOTE |  |  | js | Export: between the hold-in and settle times a run of consecutive frames longer than params.maxSeconds holds less than params.share of the content of frame 0, so the viewer sees only the header and footer and a ghost of the hero. Params: `maxSeconds` = 0.6; `share` = 0.25. |
| `V1.static` | NOTE |  |  | js | Export: motion is off (recipe none or compat.mp4 off) or the kit holds no cover video. |

#### X1 · Clean export · تصدير نظيف

Scope `export`.

| Rule | Sev | Ovr | Auto-fix | Engine | Condition |
|---|---|---|---|---|---|
| `X1.credit` | BLOCK |  |  | js | Export: a kit file contains, after folding to lower-case letters and digits, a credit line or a name or brand needle. Credit lines are searched first; then the user's own brand strings (name, handle, slug, home URL) are masked out, and the name and brand needles are searched in what remains. Needles are stored as code points so this file never contains them. Params: `lines`: see rule file; `names`: see rule file; `brands`: see rule file; `encoding`: see rule file; `fold`: see rule file. |
| `X1.credit-markup` | BLOCK |  |  | js | Export: an HTML file contains a data-cs-credit attribute. Params: `markers` = [data-cs-credit]. |
| `X1.metadata` | BLOCK |  |  | js | Export: a PNG has tEXt, zTXt, iTXt or eXIf chunks; a JPEG has APP1, APP13 or COM segments; a PDF has /Author or a /Producer or /Creator other than params.producer; an MP4 has author-style metadata atoms. Params: `producer` = Carousel Studio. |
| `X1.complete` | BLOCK |  |  | js | Export: a path of CS.export.kitFiles(spec) (or input.expected) is neither among the files nor listed as skipped. |
| `X1.secrets` | BLOCK |  |  | js | Export: a text file matches a secret pattern (base64 data URIs are removed before the scan). Params: `patterns`: see rule file. |
| `X1.font-license` | BLOCK |  |  | js | Export: an @font-face family in an exported HTML file is not an OFL family of the font registry, or an exported file is a font file. Params: `allowedLicenses` = [OFL-1.1, OFL]. |

`D1` has two parts: `D1.render-size` runs on the rendered deck, the other `D1.*` checks run on the exported files.

## 5. Checks a model runs

These checks are never emitted by code. The `cs-arabic-editor` and `cs-art-director` agents (or the inline role pass in the Claude app, where agents are ignored) run them from the descriptions below and report in the same finding shape.

| Rule | Sev | Reviewer | What to judge |
|---|---|---|---|
| `C1.meaning-word` | FIX | cs-arabic-editor | the first words of the headline carry the meaning (number, outcome or tension), not filler. |
| `C1.gap-answered` | BLOCK | cs-arabic-editor | the cover leaves one specific gap open and does not answer it. |
| `C5.voice-drift` | FIX | `voice_check.py` | Python only (voice_check.py): a style metric of the copy lies more than params.iqr times the interquartile range outside the brand fingerprint. |
| `C10.third-party` | FIX | cs-art-director | a slide shows a screenshot, logo or watermark that belongs to someone else. |
| `O1.proofreader-veto` | BLOCK | cs-arabic-editor | the proofreader vetoes the copy (agreement, register, spelling it cannot fix deterministically). |
| `O1.dialect-purity` | FIX | cs-arabic-editor | the copy mixes two dialects beyond the deny markers. |
| `SEN1.religious-imagery` | BLOCK | cs-art-director | selling content uses Kaaba or mosque imagery. |
| `SEN1.disputed-map` | BLOCK | cs-art-director | a map shows disputed borders or names. |
| `A1.ai-text` | BLOCK | cs-art-director | an AI image contains letters, Arabic text or a watermark. |

Arabic OCR never gates anything: the DOM text must equal the spec text, and fonts and glyph coverage are checked instead.

## 6. Checkpoints

| Checkpoint | Gates that must be clean of BLOCK |
|---|---|
| `script` | text scope: C1-C10, O1, N1, B1 (text), SRC1, SEN1 |
| `design` | plus rendered scope: D1-D7, T1, B1 (rendered), A1 |
| `ready` | all of the above, and `frozen` must verify |
| `exported` | plus export scope: D1, V1, X1 on the produced files |

A post with no slides yet (checkpoint `angle`) raises nothing. The caption gate C9 starts when a caption pack exists, or from checkpoint `design`, when the pack must be complete.

## 7. What the gates read

| Input | Used for |
|---|---|
| `spec` | everything; `spec.locale.digits`, `dialect`, `intent`, `contentType`, `architecture`, `format`, `mode`, `sources`, `assets`, `captionPack`, `cover.motion`, `compat.mp4`, `ext.assetChecks` |
| `brand` | `voice.allow` (words the user approved, O1), `locale.countries` (GCC audience, SEN1), `name`, `handle`, `slug`, `homeUrl` (strings X1 masks as the user's own), `visual.fonts.userFonts` (X1.font-license) |
| `history` | the previous posts, newest last: `[{postId, family, cta, architecture, cover?, text?}]`, as in `brand.hooks.history`, with the optional `cover` or `text` of the hook for similarity. Defaults to `brand.hooks.history`. The current post is ignored if it is in the list. |
| `familyLimits` | `{P1: {posts: 5, count: 1}}` from `hooks/families.json`; without it `C7.max-use` stays silent |
| `tokens`, `deck` | rendered scope: resolved tokens (roles, floors, layout, decor, provenance, variants, fonts) and the `DeckRender` of `CS.core.render.deck` |
| `files`, `video`, `expected`, `skipped`, `fonts` | export scope: `ExportFile[]`; a `VideoInfo` (or an array of them, matched by `file`) possibly with `loopSsim`, `loopPsnr`, `loop: {frame0VsPoster, lastVsFrame0}`, `blankFrames`, `flashesPerSecondMax`, `closedGop`; the expected kit paths (default `CS.export.kitFiles(spec)`); the `skipped` list of the kit; the font registry (default: the `cs-fonts-meta` block of the page) |

Missing pieces degrade quietly: no word list means no word-list findings, no `video` means the MP4 is inspected from its bytes (`CS.qa.inspectMp4`), no `CS.paint.textMask` means contrast is measured against the DOM background (gradients by their colour stops, photos reported as a NOTE).

## 8. Notes for the Python engine and for editors of the rule files

The Python implementation must give the same verdicts (gate, rule, sev, slide, el) on the shared corpus. The normative points:

- **Word and character counts** use `wordCount(stripMarkup(text))` and NFC code points (the engine's text model). The slide word totals add the fields in this order: kicker, headline, title, number (value and unit), sub, body, bullets, side labels and texts, attribution, then bridge and CTA text only where a check says so. `C2.slide-words` counts all of them; `C3.words` leaves out bridge and CTA text.
- **Caption** is assembled as `firstLine` and `keywordLine` joined by one newline, then `body`, `cta` and the hashtags joined by a space, empty parts dropped, parts joined by a blank line. `C9.length` counts code points, `C9.length-hard` counts UTF-16 units.
- **Word-list matching** (`copy.json`, dialect `deny` and `warn`) follows the engine's matching rules on text with U+064B-065F, U+0670 and U+0640 removed. A word is a maximal run of Arabic letters, a Latin word (letters, digits and the apostrophe inside it), or a digit run, so entries such as «اكتب 1 لو» match. A phrase needs whitespace and nothing else between its words. `clitics: true` lets the first word carry one proclitic of `ortho.json`. `dialects` on an entry limits it; `sev` on an entry overrides the check severity; a regex is trimmed to its first and last letter or digit.
- **Digits**: a field is scanned after blanking URLs, e-mails, handles, tags, phones and every token that carries a Latin letter. `N1.persian` wins over `N1.mixed`.
- **Claimed numbers** (SRC1): a number block, or a number token with a percent sign, a currency sign, a Latin `k`/`m`/`b` (10 and above) or `x`/currency/unit suffix, or one that is followed by a word (or two-word phrase) of the unit lists in the rule file, with one proclitic allowed. Step labels (`bindLabels`), years (1900-2100) with a time unit, counters and item counts are not claims. Source text is searched for the same number after digit normalisation; URLs are never searched.
- **List count (C6)**: for a counted architecture, compare the promised cover count with the distinct positive integer `ord` values across all slide types, including `proof`; repeated ordinals on continuations count once and unnumbered context is excluded. With no `ord`, use only `item` for `listicle` or only `step` for `steps`; a disagreement is BLOCK.
- **Originality (C10)**: share of the word 5-grams (alef, ya, ta marbuta folded, digits Western) of one slide or of the caption that occur in a `url` or `file` source excerpt; units with fewer than 3 grams are skipped.
- **`qa-report.md`** is fixed so that both engines print the same bytes: `# {title} — {specId}`, a blank line, `**{status label}:** {status} · **{revision label}:** {rev}` plus ` · **{checkpoint label}:** {checkpoint}` when present, the table `| level | count |` with the rows BLOCK, FIX, NOTE, then `No findings.` when nothing is open, one `## BLOCK|FIX|NOTE` section per severity that has open findings with bullets `- {slide or —} · {rule} · {msg} — {fix}`, an overrides section (`- {gate} · {slide or —} · {reason} ({at})`) and an environment section (painter, dialect, digits, fonts). Labels are in the report language (`ar` or `en`); the file ends with exactly one newline.

## 9. Gate X1 and the owner's credit

The tool's own screens carry the owner's name, socials and thank-you line; nothing exported may. X1 therefore searches every exported file, binary files included (image and video metadata, PDF strings), for the credit lines, the owner's name in both spellings and the brand and store domains. Two details matter:

- The needles are stored as code points in `qa-rules.json`, not as text, and compared after folding to lower-case letters and digits. This keeps the gate from tripping over its own data: `studio-source.html` embeds the runtime and the rules, and it is scanned too.
- The strings the user typed into their own brand (name, handle, slug, home URL) are masked before the name and domain needles are searched, so a creator who shares the owner's name, or whose handle contains it, is not blocked. The credit lines themselves are searched first, unmasked, and `data-cs-credit` markup outside scripts is always reported.

## 10. Changing the gates

- A threshold: edit `data/platform-instagram.json`; checks never repeat numbers.
- A word list: edit `data/rules/copy.json` (lists `aiWords`, `stockOpeners`, `hypeWords`, `abstractWords`, `fearWords`, `conspiracy`, `commentBait`, `introPhrases`, `stiffMsa`, `translationese`, `bindLabels`, `numberWords`); a spelling rule: `data/rules/ortho.json`; a dialect marker: `data/dialects/*.json`.
- The unit words that make a number a claim: `SRC1.missing` params in `qa-rules.json`.
- A severity: change `sev` of the check. The manifest rule downgrades a gate that misses the zero-false-BLOCK bar one level at a time (BLOCK to FIX to NOTE); the export-integrity gates D1, X1, A1 and V1 never downgrade.

## 11. Registry additions
The registry is authoritative; model judgement never replaces engine findings. Keep stage-0 prospects visible.

## Count, creator copy and export completion
At most 10 slides, including the still or video cover: Instagram’s publishing API and most schedulers accept at most 10 items. A focused carousel of 4, 5 or 6 slides is complete; 6 to 10 is an optional sweet spot, never a reason to pad the post.

`C6.list-count` counts distinct positive integer `ord` values across slide types, including `proof`. Unnumbered context before or after the numbered list is excluded. With no `ord`, legacy `listicle` uses `item`, and `steps` uses `step`; when the primary type is absent, count the other list type. The Studio numbers mixed `item` and `step` layouts with one running counter. A continuation with the same `ord` is the same member. A real disagreement is BLOCK.

The ready-script marker is `ext.source: "creator-script"`. Only `C7.cta-repeat` and `C7.family-repeat` become NOTE there; team-written copy keeps FIX. Do not rewrite the creator’s question to clear a variety preference.

C1 and HG1 use `_cs.qa.split_cover` / `CS.qa.splitCover`: the first beat is the hero, the remaining beat is the sub-line. Boundaries are question/exclamation marks followed by whitespace, ellipsis, colon followed by whitespace, or newline. All beats still count toward the whole-cover limit.

The schema rejects new specs over 10 slides. The Studio, `build_studio.py` and `spec_edit.py show`/`text` accept an older spec whose only schema error is `/slides` `maxItems`, so it can be shortened; C5 still blocks its export. `lint_copy.py --spec` reports the same C5 BLOCK without failing to load it.

`render.mjs` always writes both QA reports, regardless of `--formats`. A complete export with FIX exits 0; `--strict` restores 1. BLOCK and real failures stay nonzero. A requested missing MP4 is `X1.complete` BLOCK even if skipped, is named on stderr and in JSON `video.missing` / `video.errors`, and exits nonzero. `--video none` explicitly requests a still-only kit.

## Mixed text and painted layout

- `O1.ortho-enc-007` is a BLOCK on controls (except tab, LF and CR); `O1.ortho-enc-008` blocks unassigned characters and isolated surrogates in every string leaf of the spec, including caption body, per-slide captions, alt, hashtags and nested additions. Prior `qa` and `frozen` reports are excluded. Controls can be deleted safely; unassigned characters need review. Direction/layout controls have deterministic repairs, and rendered geometry ignores their zero-ink ranges. ZWNJ and ZWJ remain meaningful input.
- `D2.text-padding` (FIX) measures painted glyph ink against the nearest body-panel edge. `D2.block-gap` (FIX) measures edge gaps between painted sibling containers with text. Both use 2 units of the rendered `--cs-unit`, falling back to `geometry.grid.baselinePx`, with a quarter-unit tolerance for rounding and small transforms. Compact text badges (`small`, `micro`, `chip`, `tool`) paint emphasis rather than body panels. Marks and slide backgrounds are excluded. Adjoining cells in one enclosing painted border share that frame; their internal text padding still counts.
- `D2.clipped-paint` (BLOCK) checks painted content, including SVG strokes, against each ancestor's overflow clip. Tolerance is one eighth of a baseline-grid unit. Intentionally hidden slide decoration is excluded; an icon's decorative accessibility label does not exempt its visible stroke.
- `D6.orphan-connector` (FIX) reports a one- or two-letter Arabic word, or «ولا», stranded at a non-final line end or alone on the last line. The engine binds ordinary copy; explicit author line breaks remain reviewable.
- `D9.container-fill` includes free-lane painted panels even without `data-owner`. Empty free panels produce a real FIX independently of the visual rollout. Low row/column coverage in a populated panel is only a NOTE: centred icon cells and score bars deliberately leave air, so coverage alone cannot justify a required redesign. The occupancy thresholds still inform the dead-space measure.
- `D4` measures a cover sub-line too. The painted `.cs-bg` layer takes precedence over the root's fallback colour; a coloured ground cannot inherit a false contrast pass from the paper behind it.

The new D2 and D6 checks are DOM measurements (JS only, like their existing gate families). Python keeps the text-gate and free-validator twins; it does not claim to measure an unrendered slide.

Safe proofread repair runs in `_cs.lint.check_text`: apply deterministic repairs, re-lint the actual result, repeat to stability (at most 4 passes). Both proofread CLIs use it with `--fix --out spec.fixed.json`; `--no-autofix` disables repair. `applied` lists the actual before/after field values and paths; `issues` contains what remains. Continue checks and rendering from the saved fixed spec. The input file is never overwritten. Browser repairs remain `CS.qa.autofix(spec, results)`; `{autofix:false}` returns the unchanged spec.

All text-scope gates receive a normalised copy of slide, hook and caption text: special spaces become spaces and non-rendering controls are removed. Word and caption limits therefore count the copy the reader sees. O1 always scans the original strings, so this view cannot hide a control, a direction workaround or a spelling finding. The spec itself is unchanged until a repaired copy is saved. The JS input hook lives with the lint helpers; `_cs.text.gate_input` and `_cs.qa.Ctx` provide the Python twin.

Language fixes leave URLs, e-mail, handles, hashtags and phone identifiers intact. Encoding checks still inspect them for hidden controls and unknown characters. Safe repairs process encoding, then clitic attachment, before other spelling or punctuation repairs.
