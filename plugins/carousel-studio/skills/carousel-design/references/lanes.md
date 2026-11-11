# Lanes: where each step runs

One engine, three places to run it. Pick the lane from what the session can do, say which one you are using only when it changes what the user can get, and never assume a capability you have not seen.

| Lane | Where | Can do | Cannot do |
|---|---|---|---|
| `studio` | the user's browser, on any device | render, edit in place, restyle, QA, PNG / JPEG / PDF / ZIP, MP4 cover | run Python or Node |
| `sandbox` | Claude app (web, desktop, mobile) and Cowork's cloud session | Python standard library: validate, lint, build the Studio page, extract a spec | assume Chromium, Node, ffmpeg or fonts on the machine; load agents (Claude app) |
| `claude-code` | the user's own computer | everything above plus headless `render.mjs`, internal H.264 video, batch runs, agents | nothing special; needs the preflight below |

## 1. Claude app (chat) and Cowork
- Run `validate.py`, `build_studio.py` and `extract_spec.py` from the skill folder. They need no packages. Publish the built page with the Artifact tool from the sandbox file (`handoff.md`).
- Rendering and export happen **in the user's browser** inside the Studio. Do not try to screenshot slides yourself.
- Agents are ignored in the Claude app: do the proofread and the art-director review as inline role passes (`audit.md`, and `arabic-proofread` for the copy). Cowork and Claude Code load the nine `carousel-studio:cs-*` agents of the creative team.
- Cloud Chromium in Cowork is not assumed (a later spike); the Studio does the rendering there too.
- Nothing persists on disk between sessions. The published Studio is the durable copy of a post; Brand Home holds the brand.

## 2. Claude Code
Preflight, once per session, before any `render` or video step. Check, then print one line per missing item and stop:

| Check | Command | Fix line to print |
|---|---|---|
| Node 22 or newer | `node --version` | install Node 22+ |
| ffmpeg and ffprobe (optional) | `ffmpeg -version`, `ffprobe -version` | only for the HyperFrames fallback and `check_video.mjs`; the default MP4 needs neither |
| a Chromium for Playwright | resolved by `render.mjs` | `npx playwright install chromium`; ask before running it |
| `playwright-core` (npm) | `render.mjs` and `cover_video.mjs` import it | `npm install playwright-core` in the project folder; ask before running it |
| HyperFrames (explicit only) | `--video hyperframes` | pinned npm package; no download prompt; never the default |

Rules for the lane:
- Run these only when the user asked for a local render (`/studio render`, or the MP4 or a batch run locally). The internal encoder needs no download.
- `HYPERFRAMES_NO_TELEMETRY=1` is set by the scripts for every HyperFrames call; keep it if you ever call the CLI yourself.
- The Studio is served over a loopback address (127.0.0.1) and opened there, never opened as a local file (Windows paths break fonts and fetches). All files are read and written as UTF-8.
- Python: `python` or `python3`; Windows consoles may default to a legacy code page, so the scripts switch stdout to UTF-8 themselves.

### Commands
```
python <skill>/scripts/validate.py spec spec.json --checkpoint design --lint --brand brand.json
python <skill>/scripts/build_studio.py --spec spec.json --brand brand.json --view design --out studio.html
node   <skill>/scripts/render.mjs --spec spec.json --brand brand.json --out out/ --formats png,jpeg,pdf,zip,qa --variants 3x4,4x5   # MP4 cover via the built-in encoder (--video internal)
# HyperFrames only when requested: add --video hyperframes to render.mjs
node   <skill>/scripts/check_video.mjs out/3x4/01-cover.mp4 --poster out/3x4/01-cover.png --expect 1080x1440 --seconds 6 --fps 30
```
`render.mjs` builds the Studio when `--studio` is absent, waits for the page to report ready, calls the page's own export, pulls the bytes out, writes the kit tree, runs the QA on the live deck and the exported files (text, rendered and export scopes, so `qa-report.json` holds the rendered gates too) and prints a JSON summary. Pass `--brand`: the placeholder-chrome gate (B2) reads the brand's handle and name.

The design huddle's **pre-flight** exports nothing: `node <skill>/scripts/render.mjs --preflight --spec spec.json --brand brand.json [--presets creator,poster,notebook] --format text` renders the cover and slide 2 in each candidate preset (all three shipped presets by default) and prints, per preset, the rendered-gate findings, the cover's hero size at 130 px, its empty band and whether the preset allows the post's motion recipe. `--video internal` uses the Studio's own encoder; `--video none` skips video. Other options: `--lang`, `--timeout`, `--chromium`, `--headed`.

### Pictures on slides
Choose picture slides before free design. The local path is `plates.mjs slots --dir POST --format json`, prompts using the measured ratio, approved tool results saved under plates/, inspection and plates/plates.json, `plates.mjs apply`, `check`, then render. `restyle` remeasures after text/style changes; `apply` restores pictures after spec rebuilds. Still images are fitted and embedded by canvas, with no image packages or FFmpeg. Details and commands: `plates.md`. Without a local browser, use the hosted asset workflow when available or keep the preset design; do not claim a local frame measurement.

### Exit codes (all scripts)
| Code | Meaning |
|---|---|
| 0 | pass |
| 1 | FIX items pending |
| 2 | BLOCK items, or input invalid against its schema |
| 64 / 65 / 66 | bad arguments / unreadable data / missing input file |
| 70 / 73 | internal error (a missing Playwright is a 70 with an install hint) / cannot write |
| 75 | conflict: the page's `rev` differs from the one you expected; re-read and merge |

## 3. Workspace on disk (Claude Code and Cowork)
The workspace folder is the plugin setting `workspace_dir` (written `${user_config.workspace_dir}` in these files), default `~/CarouselStudio`; the environment variable `CS_WORKSPACE` overrides it. In Claude Code the text `${user_config.workspace_dir}` is replaced by the folder in the plugin settings when this file loads; scripts do not see that setting, so pass the folder as `--dir` (brand_io.py) or export `CS_WORKSPACE` before running them. If the placeholder still shows literally, use `~/CarouselStudio`.
```
brands/<slug>/brand.json  assets/  ideas.json  plans/plan-YYYY-MM.json
brands/<slug>/posts/<spec-id>/spec.json  studio.html  kit/  qa-report.md
```
In the Claude app there is no persistent disk: keep working files in a scratch folder for the session and treat the published Studio as the post's home.

## 4. Choosing quickly
| Situation | Lane and action |
|---|---|
| user wants to see and tweak the post | Studio: build, publish, hand over the link |
| user wants the MP4 or a batch without opening a page | Claude Code: `render.mjs`, after the preflight |
| Claude Code session, no Playwright or browser | use the Studio lane and say what the local render would add |
| a screenshot audit | any lane; vision only (`audit.md`) |
| page-side publishing blocked | the Studio's «انسخ التعديلات» patch, applied with `extract_spec.py --apply-patch` |
