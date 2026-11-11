# Fonts

The open-source typefaces Carousel Studio draws with. Every font file here is an unmodified upstream release under the SIL Open Font License 1.1; nothing is subset, renamed or re-encoded. Fonts that are free to use but not open are never added. They enter a design only as a user's own upload and are never embedded in an export.

## What is in this folder

| File | Purpose |
|---|---|
| `registry.json` | One entry per family: files, weight range and axes, scripts, roles, pairings, presets that use it, licence and upstream source (repository, commit, path, git blob id) |
| `coverage.json` | The code points each family can draw, read from the font's own `cmap` table. The layout engine and the quality gates use it to catch a missing glyph before export |
| `<id>/` | The font files of one family and its `OFL.txt` |

## Families

| Family | Id | Scripts | Weights | Files | Used by |
|---|---|---|---|---|---|
| IBM Plex Sans Arabic | `ibm-plex-sans-arabic` | arabic | 100-700 | 7 static, 1652 KB | swiss |
| Readex Pro | `readex-pro` | arabic+latin | 200-700 | variable, 272 KB | swiss, creator, notebook, interface |
| Alexandria | `alexandria` | arabic+latin | 100-900 | variable, 325 KB | creator, poster |
| Playpen Sans Arabic | `playpen-sans-arabic` | arabic | 100-800 | variable, 740 KB | notebook |
| Noto Kufi Arabic | `noto-kufi-arabic` | arabic | 100-900 | variable, 424 KB | poster |
| Reem Kufi | `reem-kufi` | arabic | 400-700 | variable, 124 KB | heritage |
| El Messiri | `el-messiri` | arabic+latin | 400-700 | variable, 135 KB | heritage |
| Noto Sans Arabic | `noto-sans-arabic` | arabic | 100-900 | variable, 825 KB | brand choice |
| Cairo | `cairo` | arabic+latin | 200-900 | variable, 585 KB | brand choice |
| IBM Plex Sans | `ibm-plex-sans` | latin | 100-700 | variable, 525 KB | swiss |
| Inter | `inter` | latin | 100-900 | variable, 856 KB | interface |

Only upright faces ship, because the engine never draws italic or slanted text. Cairo carries a slant axis; the engine never sets it, so the font default (0) applies.

## Known gaps

These come from the fonts themselves and are visible in `coverage.json`:

- Arrows `←` `→` `↑` (U+2190-2192) exist only in Alexandria, IBM Plex Sans Arabic, IBM Plex Sans and Inter. Draw arrows as icons, not as text.
- Reem Kufi has no Arabic percent, decimal or thousands separators (`٪` `٫` `٬`). They matter only when a heritage design opts into Arabic-Indic digits.
- Readex Pro has no Persian letters (`پ چ ژ گ ک ی`), which are an error in Arabic copy anyway.
- IBM Plex Sans and Inter have no Arabic. They serve the Latin role only.

## Checking and changing

From the repository root:

```
python tools/font_coverage.py --check     # verify; writes nothing
python tools/font_coverage.py             # rewrite coverage.json from the fonts
```

The check re-reads every font and compares `registry.json` with it: size, SHA-256, git blob id, weight range, axes, family name, licence file, and that every Arabic family covers the Arabic letters, both digit sets, the Arabic punctuation marks and tatweel. Run it after any change.

To add a family: put the upstream files and its `OFL.txt` in a new `<id>/` folder (unmodified, LF line endings in the licence text), add its entry to `registry.json`, run the tool, and commit both JSON files.

## Licence

Each family keeps its own copyright holders and Reserved Font Names, recorded in its `OFL.txt` and in `registry.json`. Anything that embeds a font, such as an exported HTML file, must carry that family's copyright line and licence text.
