# Where the profile lives

`brand.json` is the one source of truth for a brand. Where it is kept depends on the surface,
because the Claude app has no persistent disk. This file also covers multi-brand work, privacy
and migration.

## 1. Lookup order (every skill, at the start of a task)
1. A `brand.json` the user attached to the conversation.
2. The brand capsule in the Project's files (a short text block, section 3). It names the brand, the dialect and the Brand Home address.
3. **Brand Home**: read the published page (`Artifact read`), then ask carousel-design to extract the `cs-brand` block (its `extract_spec.py --kind brand`) to get the profile.
4. The workspace folder (`brands/<slug>/brand.json`), in Claude Code and in Cowork with a mounted folder.
5. Nothing found: offer the onboarding (`/brand new`). Never write posts for an unknown brand without saying so; the fast mode may use neutral defaults and flag them.

## 2. Canonical copy per surface
| Surface | Canonical `brand.json` | Also keep |
|---|---|---|
| **Claude app** (web, desktop, phone) | embedded in the **Brand Home** page (`cs-brand` block) | one Project per brand holding the capsule; for an agency, one Project per client |
| **Cowork** | workspace folder `brands/<slug>/` | Brand Home page, same address |
| **Claude Code** | `${user_config.workspace_dir}/brands/<slug>/brand.json` (default `~/CarouselStudio`; `CS_WORKSPACE` overrides; pass `--dir` to the scripts) | Brand Home page when published |

In the Claude app the working copy lives in a scratch folder for the session
(`brand_io.py --dir <scratch>`); the **published Brand Home is the durable copy**. After any change:
validate, rebuild with carousel-design `build_studio.py --brand-home --brand brand.json`, republish
to the **same address**, and tell the user to replace the capsule in the Project files. If the page
cannot be published on this surface, keep `brand.json` itself as the Project file and say that
large profiles may not fit.

Workspace layout:
```
brands/<slug>/brand.json          the profile
brands/<slug>/assets/             logo, photos, uploaded fonts (user-supplied fonts stay here)
brands/<slug>/hooks/<pack>.ar.json   brand-private hook pack(s), plus <pack>.en.json
brands/<slug>/plans/ ideas.json   written by content-plan
brands/<slug>/posts/<spec-id>/    written by carousel-create and carousel-design
.default                          the default brand slug (brand_io.py use)
```

## 3. The capsule
At most 1,500 bytes; produced by `brand_io.py capsule`. Format and use are in `brand-book.md`
section 4. It is regenerated after every change that touches dialect, digits, swipe cue, voice,
palette, fonts, preset or the Brand Home address, and it is the thing the user pastes into a new Project.

## 4. Multi-brand
- One profile per brand, creator or client (`kind`). The UX is tuned for one brand: with a single brand every command assumes it; with more, ask "أي براند؟" unless a default is set (`brand_io.py use`) or the conversation already names one.
- Switching brands changes the dialect, digits, swipe cue, voice, look and hook pack together; say which brand you are working on at the top of a drafting session.
- Never copy words, hooks, proof points or photos from one client's profile into another's. The hook pack, voice samples and references of a client stay in that client's folder or Project.
- A hook bank that mixes the owner's own lines with client copy is split on import (`import_hooks.py` leaves client sections out unless asked).

## 5. Privacy and safety
- **Data minimisation.** The profile holds a persona (an aggregate description), never the name, phone, e-mail or photo of a real person other than the user. Strip such details from pasted captions and FAQs before saving (data-protection rules in several Arab countries restrict storing personal data, including cross-border).
- **No secrets.** Never store keys, tokens, passwords or card details. If pasted, do not use or echo them: keep keys in the connector's own settings, never in chat.
- **Fonts and assets.** Registry fonts are OFL. A font the user uploads is recorded by asset id with `license: user-supplied`, stays in their workspace or Brand Home, and is never embedded in an exported source file; the logo's data URI is at most 60 KB.
- **Nothing leaves the user's side.** No script here touches the network. Analytics connectors are read only after an explicit yes (`TL-03`), and what they return is stored in the user's own profile only.
- **The `ext` namespace** is private to tools (reference-analysis hints, the starter board, voice rewrites). Engines ignore it and `snapshotHash` excludes it.

## 6. Migration and recovery
- `brand_io.py migrate --slug S` upgrades older files to `schemaVersion` 1 (the pre-contract draft shape: snake_case tone keys, user fonts as objects, underscore metrics). A file from a newer plugin than the one installed is refused.
- `brand_io.py import --file brand.json [--overwrite]` brings in a profile exported from Brand Home or from another machine; without `--overwrite` an existing slug is a conflict (exit 75).
- Every write is atomic (temp file then rename) and is validated first; an invalid change is refused, so a `brand.json` never ends half-written.
- To back up, copy the `brands/<slug>/` folder or export the Brand Home page; to move a brand to a new workspace, copy the folder and run `validate`.

## 7. The creative team's memory
`creativeMemory[]` in `brand.json` is what the Creative Director reads at the start of every post and writes at the end of it. It keeps the last 30 approved posts, newest last, and it is outside the brand snapshot hash, so remembering a post never makes the earlier posts look stale.

| Field | Meaning |
|---|---|
| `postId`, `date`, `idea` | required: the post, the day, the big idea in one sentence |
| `hook` | the winning cover text, so the next cover does not echo it |
| `family`, `move`, `pitch` | the hook family, the creative move (ten fixed ids) and which pitch direction won (`safe`, `bold`, `merged`) |
| `preset`, `motion`, `intent`, `cta` | the style, the cover's motion recipe, the goal and the call-to-action kind |
| `panel` | the audience panel's result: `stops` (0 to 3), `depth` and `slides` (a structured gut check, never analytics) |
| `verdict` | `ship`, `revised` or `killed` (a killed angle is kept with its reason in `rejected`, so it is not offered again) |
| `series`, `loved`, `rejected` | the series the post belongs to; what the creator loved; what the creator turned down |

Commands: `brand_io.py remember --slug S --json ENTRY` (or `--file F`) appends one entry, replaces an earlier entry of the same `postId`, fills a missing `date`, validates against the schema and keeps the last 30. `brand_io.py memory --slug S` prints what the director reads: the recent posts, the hook families of the last two posts to avoid, the values to rest (move, recipe, preset and intent used by both of the last two posts), the call-to-action kinds of the last two posts to avoid, the last five covers, the creator's pitch habit (`safe` or `bold` when chosen in 3 of the last 4), the open series, the killed ideas, and what was loved or rejected. Brand Home's team tab shows the same memory to the creator, newest first, with the values the team will rest next time. In the Claude app the memory travels inside the published Brand Home like the rest of the profile.
