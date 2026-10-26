# Pillars and the idea bank

## 1. What a pillar is
A pillar is a recurring theme the audience follows the account for. A brand has **3–5** (the profile allows 6). Each one stores:

| Field | Rule |
|---|---|
| `id` | short lowercase id (`tools`, `stories`), used by every slot |
| `name` | at most 3 words, in the brand's dialect |
| `share` | the part of the posts it should get; shares add up to 1 (±0.05) |
| `intents` | the intents it usually serves: `reach`, `save`, `send`, `sell` |

A pillar earns its place only if it answers a real pain, desire or objection of the audience and can feed at least eight posts without repeating itself. Two pillars that would produce the same post are one pillar.

## 2. Proposing pillars
Read the brand's identity (who, niche, offer, goal) and audience (pains, desires, objections, FAQ). Propose 3–5, each with a one-line reason, a share and its intents, and let the user change them. Ask at most two questions.

A balanced starting set, adapted to the niche and renamed in the user's words:

| Role | Serves | Usual intents | Share (followers goal) |
|---|---|---|---|
| Teach (how-to, lists, frameworks, checklists, prompts, tools) | saves | save | 35–45% |
| Prove (cases, results, before and after, tested and ranked) | trust, sends | send, sell | 15–20% |
| Opinion and story (myths, mistakes, a stance, a lesson) | reach, sends | reach, send | 20–30% |
| Offer (a lead magnet, a launch, a service, testimonials) | revenue | sell | 10–20% |

For a clients or sales goal move share from Teach to Prove and Offer. Examples of the same set in other niches: finance (budget habits · myths about money · real cases · the paid plan), fitness (exercises and plans · mistakes · transformations · the programme), food (recipes · kitchen mistakes · what a dish really costs · the cookbook), careers (CV and interview checklists · myths · stories · the course), AI and tools (tool packs and prompts · free versus paid · tested and ranked · the service).

Evidence worth saying aloud when the user asks why: on Arabic Instagram the top carousels are lists, resources and cheat-sheets (15 of the top 30 in a 488-carousel study), then frameworks and steps; news and generic "you" scenarios rarely earn saves. That is why Teach leads the default mix.

## 3. Changing pillars
Pillars change slowly. Edit them in `brand.json` (`strategy.pillars`) through `brand-setup`, never inside one plan; a plan only refers to ids. If the user drops a pillar, re-run `plan.py new` for the months not yet produced and leave finished months alone.

## 4. The idea bank
Ideas are one-line seeds that wait for an angle. Each has an `id` (`i1`, `i2` …), `text` (at most 300 characters), optional `pillarId` and `intents`, a `source` (`user`, `audience-faq`, `occasion`, `repurposed`, `claude`) and `createdAt`. A plan holds up to 300.

File an idea when the user says «فكرة: …» or «احفظ الفكرة دي»: `plan.py add-idea plan.json --text "…" --pillar tools --intent save`. Seed the bank from three places: the audience's FAQ and objections (`audience-faq`), the month's occasions (`occasion`), and the user's own notes or past posts that deserve a second life (`repurposed`; a repurposed idea must be transformed, never reposted).

When asked «أفكار محتوى»: cross the pillars with the audience's questions and the month's occasions, give 8–12 one-line ideas that begin with Arabic, tag each with its pillar and intent, and offer to file the chosen ones. Never attach a number or a result to an idea unless the user supplied it.

## 5. The angle bank
`content-angles` returns 5–10 scored angles for a topic and the user picks one. The angles not picked go to `angleBank` (`id`, `title`, `lens`, `score`, `topic`, `pillarId`) so a later month can reuse them. Do not rescore angles here.

## 6. Where they live
Claude Code and Cowork: `brands/<slug>/ideas.json` (same entry shape as `ideaBank`) and each month's plan. Claude app: the Brand Home page (Ideas tab) built from the same data; rebuild it after changes (`carousel-design`).
