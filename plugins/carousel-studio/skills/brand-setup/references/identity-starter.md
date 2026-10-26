# Identity starter: a look for people without a brand kit

For a user who answers «لأ، اقترح عليّا» to `VI-02`. The starter gives a complete, accessible look
from presets, OKLCH palettes and font pairings that already ship with the plugin. It never makes
art: **no generated logos, illustrations, textures or backgrounds**, and never an image with Arabic
letters in it.

## 1. Flow
1. **Mood** (`VI-09`): one of bold, calm, warm, cool, earthy, playful, luxury. The user may also name a colour they love.
2. **Seed colour:** if the user named one, convert it to hex (confirm it); otherwise offer six swatches of the mood (section 2) on the board, or two in plain chat.
3. **Palettes:** `python palette.py --seed "#RRGGBB" --mood <mood> --count 3 --format json`. You get three accessible palettes (tinted, paper, high contrast). The seed stays the accent exactly when text on it already reaches 4.5:1; a very light seed such as yellow stays but is flagged `accent-fill-only` in `notes` (tell the user it is for fills, not for text).
4. **Preset and fonts:** take the top 3 presets for the mood (section 3). Each preset brings its own font pairing (section 4); the user may swap to another pairing on the board.
5. **The board:** the user's own hook in 3 presets × 2 palettes (palettes 1 and 2 of step 3; palette 3 appears when the user asks for "more contrast"). Six tiles, each with preset name, palette name, fonts and the contrast line. The user answers `VI-10` with a tile number; the next two best tiles of different presets become `presetAlternates`.
6. **Save** `visual.palette` (the six roles), `visual.fonts`, `visual.presetId`, `visual.presetAlternates`, and an empty `visual.locks` unless `VI-11` gave some. Then delete the board data: `brand_io.py set --slug S --path ext.starterBoard --json null`.

## 2. Seed swatches by mood
| Mood | Swatches (hex, name) |
|---|---|
| bold | `#E3262B` أحمر · `#FF6A00` برتقالي · `#0057FF` أزرق ملكي · `#7A2BFF` بنفسجي · `#00B36B` أخضر · `#FFC400` أصفر |
| calm | `#4A7C8C` تركوازي رمادي · `#6B8F71` أخضر مريمية · `#8A7FB5` لافندر · `#5B7DB1` أزرق هادئ · `#A68A7B` طيني · `#7D8F99` أردوازي |
| warm | `#D9822B` عنبري · `#C8553D` تيراكوتا · `#E0A458` عسلي · `#B5473A` قرميدي · `#D96C75` مرجاني · `#A8742F` كراميل |
| cool | `#2A6F97` أزرق فولاذي · `#1B998B` تركواز · `#3A5BA0` نيلي · `#5C7AEA` أزرق بنفسجي · `#2D4A5A` أخضر مزرق داكن · `#4E8098` دنيم |
| earthy | `#7A5C3E` بني ترابي · `#6B7A3A` زيتي · `#9C6644` بني محمر · `#5E6B52` طحلبي · `#B08968` رملي · `#7F5539` جوزي |
| playful | `#FF4D8D` وردي · `#FFB400` شمسي · `#00C2A8` نعناعي · `#7C4DFF` عنبي · `#FF6B35` يوسفي · `#2EC4B6` أكوا |
| luxury | `#B8962E` ذهبي · `#1F6F5C` زمردي · `#5B1A2B` عنابي · `#1B2A41` أزرق ليلي · `#6D4C41` قهوة · `#C0A062` شامبانيا |

Luxury palettes are dark by default (`--bg auto`); every other mood is light. Pass `--bg dark|light`
when the user wants the other.

## 3. Mood to presets
| Mood | Top 3 presets (order) | Why |
|---|---|---|
| bold | creator, poster, notebook | heavy type, one strong accent |
| calm | notebook, poster, creator | quiet paper, clean rules |
| warm | poster, creator, notebook | cream and rust, friendly faces |
| cool | creator, notebook, poster | product and tool looks |
| earthy | poster, notebook, creator | natural colour, rules and pills |
| playful | creator, notebook, poster | stickers, marker, labels |
| luxury | poster, creator, notebook | deep colour, rules, one strong accent |

Only `creator`, `notebook` and `poster` ship in this release; `swiss`, `interface` and `heritage` are held back for a later update and are never offered.

A reference-based pick (`reference-analysis.md`) overrides this table: put the nearest preset first.

## 4. Preset fonts (registry ids; the preset index of carousel-design is authoritative)
| Preset | Display and headings | Body | Latin |
|---|---|---|---|
| swiss | `ibm-plex-sans-arabic` | `readex-pro` | `ibm-plex-sans` |
| creator | `alexandria` | `readex-pro` | `inter` |
| notebook | `playpen-sans-arabic` | `readex-pro` | `inter` |
| poster | `alexandria` or `noto-kufi-arabic` | `readex-pro` | `inter` |
| interface | `readex-pro` | `readex-pro` | `inter` |
| heritage | `reem-kufi` | `el-messiri` | `el-messiri` |

Three neutral pairings the user can switch to on any tile: **Plex** (`ibm-plex-sans-arabic` with `ibm-plex-sans`), **Kufi** (`noto-kufi-arabic` with `noto-sans-arabic` and `inter`), **Alexandria** (`alexandria` with `readex-pro` and `inter`). `cairo` and `rubik` are valid choices when the user insists, but they are the most used fonts on Arabic Instagram: say once that they look "default". A font that is not in the registry is never suggested.

## 4b. The sample hook
Use the user's own cover line if they have one. Otherwise write one short cover line from their niche
in the brand dialect: at most 6 words in the main run, Western digits, no statistic and no claim
(a count such as «3 أدوات في {niche}» is fine, «زوّد مبيعاتك 300%» is not). Mark it as a sample
on the board.

## 5. Board data (for the Brand Home page)
Write it to `ext.starterBoard` with `brand_io.py set --path ext.starterBoard --json ...`, then build
the page with carousel-design (`build_studio.py --brand-home --brand brand.json`):
```json
{ "hook": "3 أدوات ببلاش…\nبتغنيك عن المصمم", "mood": "bold", "seed": "#E3262B",
  "candidates": [
    { "n": 1, "presetId": "creator", "paletteName": "bold-tinted",
      "roles": { "bg": "#F6F1F0", "surface": "#FEFCFB", "ink": "#1A1514", "inkMuted": "#5C5656", "accent": "#E3262B", "accent2": "#AE6200" },
      "fonts": { "display": "alexandria", "body": "readex-pro", "latin": "inter" },
      "contrast": { "inkOnBg": 16.15, "onAccent": 4.59 } } ] }
```
`candidates` has up to 6 entries ordered as the tiles; `n` is the number the user types. If the
Brand Home build does not render a starter board, use the chat fallback below.

**Chat fallback (no page).** Offer at most 4 numbered options, each on one Arabic line with the
preset name in Arabic, the palette mood and the three main hex codes in parentheses, for example
«1. بوستر: كريمي وأخضر ونحاسي». Explain that the page shows the real result
and offer to open it when it is available.

## 6. Guardrails
- Every text pair in a palette is at least 4.5:1 (`palette.py` guarantees it); do not hand-edit a role afterwards without re-running it.
- Keep the user's colour if they gave one, even when it is unfashionable; improve it only through lightness for contrast, and say so.
- Never mix a user-uploaded font into the starter; uploaded fonts are for users who already have a kit.
- A brand with no logo gets a wordmark of its handle in the display font in the header; never invent a logo.
