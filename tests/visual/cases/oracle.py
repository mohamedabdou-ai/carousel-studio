"""Geometric model of the dead-space measure (13-visual-language.md, section 7), revision 2.

What changed in revision 2 (the three review rounds asked for it):
  * An owner is no longer assumed to be full. `own(x, y, w, h, content)` carries the boxes it holds, and the owner guard of
    section 7.2 is modelled: the interior counts as occupied only when BOTH the rows and the columns of the owner (same 36 x 37 grid)
    that hold content (halo included) reach 65%. An owner that fails counts only through its content, so an empty card, a lone icon on
    a wide panel and a half-empty pillar are dead space instead of free passes.
  * An owner larger than 60% of the zone (a possible drenched ground) must pass the stricter 80% rows-and-columns test, so a
    rows card that is full of rows stays an owner while a colour ground with a centred paragraph does not.
  * Marks (`mark(...)`) are never counted as occupied space.
  * A registered bold pattern is an owner like any other (kind "pattern"): it counts only when the content drawn over it passes
    the same rows-and-columns test, so a wall behind a small card is dead space, not a free fill.
  * New cases: lone icon on a panel, empty card, drenched ground, pattern wall, half recipe, grid, timeline, rows, and the
    corrected Appendix A slides (28 px waffle, field 24 px below the header tab).

Boxes are in BODY-ZONE local coordinates (x from the LEFT edge, 0..852; y from the top, 0..888).
The real gate feeds DOM-derived boxes into the same function; this file only models layouts.
Standard library only. Run with: python -X utf8 deadspace_model.py   (add --json for a machine-readable dump)
"""
import json
import sys

W, H = 852, 888            # default body zone (canvas x 114..966, y 261..1149); poster/heritage use 840/844 high
COLS, ROWS = 36, 37        # one grid for every metric (cell ~23.7 x 24 px)
CW, CH = W / COLS, H / ROWS
OCC = 0.30                 # a cell is occupied when >= 30% covered
SUB = 4                    # sub-samples per cell side (union coverage)
CANVAS_H = 1440
OWNER_MIN = 0.65           # D9.container-fill: rows AND columns of the owner that hold content
OWNER_MIN_BIG = 0.80       # the same test for an owner larger than OWNER_BIG_SHARE of the zone (ground suspects)
OWNER_BIG_SHARE = 0.60
T, A = 16, 32              # halos: text, anchor ink


def txt(x, y, w, h): return ("txt", x, y, w, h)
def anc(x, y, w, h): return ("anc", x, y, w, h)
def mark(x, y, w, h): return ("mark", x, y, w, h)


def own(x, y, w, h, content=None, kind="owner"):
    return ("own", x, y, w, h, list(content) if content is not None else None, kind)


def halo_of(b):
    return T if b[0] == "txt" else A


def inflated(b):
    h = halo_of(b)
    return (b[1] - h, b[2] - h, b[1] + b[3] + h, b[2] + b[4] + h)


def clip(r):
    return (max(0, r[0]), max(0, r[1]), min(W, r[2]), min(H, r[3]))


def owner_report(o):
    """Returns (passes, rows_share, cols_share). Content is clipped to the owner box."""
    _, x, y, w, h, content, kind = o
    if content is None:
        return True, 1.0, 1.0       # legacy: not modelled, assumed full (never used in revision 2 cases)
    rows = set()
    cols = set()
    r0, r1 = int(max(0, y) // CH), int(min(H - 1, (y + h - 1)) // CH)
    c0, c1 = int(max(0, x) // CW), int(min(W - 1, (x + w - 1)) // CW)
    rr = list(range(r0, r1 + 1))
    cc = list(range(c0, c1 + 1))
    for b in content:
        if b[0] == "mark":
            continue
        ix0, iy0, ix1, iy1 = inflated(b)
        for r in rr:
            by0, by1 = r * CH, (r + 1) * CH
            if min(iy1, by1) - max(iy0, by0) >= 0.3 * CH:
                rows.add(r)
        for c in cc:
            bx0, bx1 = c * CW, (c + 1) * CW
            if min(ix1, bx1) - max(ix0, bx0) >= 0.3 * CW:
                cols.add(c)
    rs = len(rows) / max(1, len(rr))
    cs = len(cols) / max(1, len(cc))
    share = (min(W, x + w) - max(0, x)) * (min(H, y + h) - max(0, y)) / (W * H)
    need = OWNER_MIN_BIG if share > OWNER_BIG_SHARE else OWNER_MIN
    ok = rs >= need and cs >= need
    return ok, rs, cs


def rects_for(boxes):
    """Flatten the model boxes into occupied rectangles (x0, y0, x1, y1), applying the owner guard."""
    out = []
    notes = []
    for b in boxes:
        k = b[0]
        if k == "mark":
            continue
        if k in ("txt", "anc"):
            out.append(clip(inflated(b)))
        else:
            ok, rs, cs = owner_report(b)
            _, x, y, w, h, content, kind = b
            notes.append({"owner": (x, y, w, h), "kind": kind, "rows": round(rs, 2), "cols": round(cs, 2), "ok": ok})
            if ok:
                out.append(clip((x, y, x + w, y + h)))
            for c in content or []:
                if c[0] != "mark":
                    out.append(clip(inflated(c)))
    return out, notes


def occupancy(boxes):
    rects, _ = rects_for(boxes)
    grid = [[False] * COLS for _ in range(ROWS)]
    for r in range(ROWS):
        for c in range(COLS):
            hit = 0
            for sy in range(SUB):
                for sx in range(SUB):
                    px = (c + (sx + 0.5) / SUB) * CW
                    py = (r + (sy + 0.5) / SUB) * CH
                    for (x0, y0, x1, y1) in rects:
                        if x0 <= px < x1 and y0 <= py < y1:
                            hit += 1
                            break
            grid[r][c] = (hit / (SUB * SUB)) >= OCC
    return grid


def largest_empty_rect(grid):
    best = 0
    heights = [0] * COLS
    for r in range(ROWS):
        for c in range(COLS):
            heights[c] = 0 if grid[r][c] else heights[c] + 1
        stack = []
        for c in range(COLS + 1):
            cur = heights[c] if c < COLS else 0
            start = c
            while stack and stack[-1][1] >= cur:
                s, hh = stack.pop()
                best = max(best, hh * (c - s))
                start = s
            stack.append((start, cur))
    return best / (ROWS * COLS)


def tallest_band(grid):
    run = best = 0
    for r in range(ROWS):
        occupied = sum(1 for c in range(COLS) if grid[r][c])
        if occupied <= 1:          # < 3% of the zone width
            run += 1
            best = max(best, run)
        else:
            run = 0
    return best * CH / CANVAS_H


def metrics(boxes):
    g = occupancy(boxes)
    empty = sum(1 for r in g for c in r if not c)
    _, notes = rects_for(boxes)
    failed = [n for n in notes if not n["ok"]]
    return {"band_pct_canvas": round(100 * tallest_band(g), 1),
            "ler_pct_zone": round(100 * largest_empty_rect(g), 1),
            "empty_cells_pct": round(100 * empty / (ROWS * COLS), 1),
            "owner_fail": len(failed)}


def anchor_share(anchor_boxes):
    """Union of anchor boxes (container included, no halo) over the zone."""
    g = [[False] * COLS for _ in range(ROWS)]
    for r in range(ROWS):
        for c in range(COLS):
            hit = 0
            for sy in range(SUB):
                for sx in range(SUB):
                    px = (c + (sx + 0.5) / SUB) * CW
                    py = (r + (sy + 0.5) / SUB) * CH
                    for (x, y, w, h) in anchor_boxes:
                        if x <= px < x + w and y <= py < y + h:
                            hit += 1
                            break
            g[r][c] = (hit / (SUB * SUB)) >= OCC
    return round(100 * sum(1 for r in g for c in r if c) / (ROWS * COLS), 1)


CASES = {}
SHARES = {}

# ---- Today (1.0) ------------------------------------------------------------------------------------------------
CASES["today swiss setup (text only)"] = [txt(452, 90, 400, 100), txt(492, 215, 360, 74), txt(492, 289, 360, 74), txt(492, 363, 360, 74)]
# the 144 x 400 empty icon frame is an owner with no content: it fails the guard and is dead space
CASES["today creator item (text + 144 px empty frame)"] = [txt(212, 120, 640, 97), txt(112, 241, 740, 148), own(708, 420, 144, 144, [])]

# ---- Cheats the guard must catch (new in revision 2) ---------------------------------------------------------------
CASES["cheat: empty card 852x344"] = [txt(212, 0, 640, 194), txt(212, 218, 640, 148), own(0, 430, 852, 344, [])]
CASES["cheat: lone 300 px icon on a 852x344 panel"] = [txt(212, 0, 640, 194), txt(212, 218, 640, 148), own(0, 430, 852, 344, [anc(276, 452, 300, 300)])]
CASES["cheat: drenched ground (owner 100% of zone), text only"] = [own(0, 0, 852, 888, [txt(112, 330, 640, 194), txt(212, 548, 640, 148)])]
CASES["cheat: three 80 px marks scattered"] = [txt(212, 0, 640, 194), txt(212, 218, 640, 148),
                                                mark(100, 480, 80, 80), mark(660, 560, 80, 80), mark(380, 700, 80, 80)]
CASES["cheat: bold-dots wall over dead area, no content on it"] = [txt(212, 0, 640, 194), txt(212, 218, 640, 148),
                                                                   own(0, 400, 852, 488, [], "pattern")]

# ---- Recipes of section 4.2 ----------------------------------------------------------------------------------------
CASES["recipe under: anchor fills the remainder (scene 852x430)"] = [own(0, 0, 852, 430, [anc(120, 40, 600, 350)]), txt(212, 478, 640, 194), txt(212, 696, 640, 148)]
CASES["recipe start: icon tile 272x272 only"] = [own(580, 0, 272, 272, [anc(636, 56, 160, 160)]), txt(40, 0, 520, 194), txt(40, 218, 520, 296)]
CASES["recipe start: pillar of 3 stacked tiles, text at top"] = [own(580, 0, 272, 888, [anc(612, 40, 208, 208), anc(612, 300, 208, 208), anc(612, 560, 208, 208)]),
                                                               txt(40, 0, 520, 194), txt(40, 218, 520, 296)]
CASES["recipe start: pillar of 3 stacked tiles, text centred"] = [own(580, 0, 272, 888, [anc(612, 40, 208, 208), anc(612, 300, 208, 208), anc(612, 560, 208, 208)]),
                                                                 txt(40, 200, 520, 194), txt(40, 418, 520, 296)]
CASES["recipe start: single tall pillar with one glyph"] = [own(580, 0, 272, 888, [anc(612, 330, 208, 208)]), txt(40, 200, 520, 194), txt(40, 418, 520, 296)]
CASES["bare 240 px icon, no container"] = [txt(212, 0, 640, 194), txt(212, 218, 640, 148), anc(306, 420, 240, 240)]
CASES["recipe band: scene 852x420 under text"] = [txt(212, 0, 640, 194), txt(212, 218, 640, 148), own(0, 420, 852, 420, [anc(60, 440, 732, 380)])]
CASES["recipe under: scene capped at 300 px (3 objects)"] = [own(0, 0, 852, 300, [anc(20, 20, 250, 260), anc(300, 20, 250, 260), anc(580, 20, 250, 260)]), txt(212, 348, 640, 194), txt(212, 566, 640, 148)]
CASES["recipe half: field with one object + caption (too thin)"] = [own(426, 0, 426, 888, [anc(466, 200, 346, 346), txt(466, 640, 346, 74)]),
                                                                  txt(20, 250, 380, 276), txt(20, 560, 380, 148)]
CASES["recipe half: field with icon + numeral + pictogram"] = [own(426, 0, 426, 888, [anc(466, 90, 346, 346), txt(466, 470, 346, 74), anc(466, 600, 346, 200)]),
                                                              txt(20, 250, 380, 276), txt(20, 560, 380, 148)]
CASES["pause: 3 hero lines centred, no anchor (pause thresholds)"] = [txt(100, 210, 752, 468)]

# ---- New layouts of section 4.4 (geometry arithmetic) --------------------------------------------------------------
# grid:bento, 4 cards of 414 x 280 under a one-line title (92) and a bridge, gap 24
bento = [txt(212, 0, 640, 92)]
for i, (cx, cy) in enumerate([(0, 140), (438, 140), (0, 444), (438, 444)]):
    bento.append(own(cx, cy, 414, 280, [anc(cx + 40, cy + 30, 120, 120), txt(cx + 30, cy + 170, 354, 74)]))
bento.append(txt(412, 790, 440, 46))
CASES["grid:bento 2x2 (4 cards 414x280)"] = bento
# grid:tiles, 6 tiles of 414 x 200, gap 24
tiles = [txt(212, 0, 640, 92)]
for r in range(3):
    for c in range(2):
        cx, cy = c * 438, 128 + r * 224
        tiles.append(own(cx, cy, 414, 200, [anc(cx + 280, cy + 40, 96, 96), txt(cx + 30, cy + 70, 230, 60)]))
tiles.append(txt(412, 812, 440, 46))
CASES["grid:tiles 3x2 (6 tiles 414x200)"] = tiles
# timeline:rail, 4 nodes at a 165 px pitch, rail at the start edge
tl = [txt(212, 0, 640, 92), anc(600, 160, 96, 96), anc(600, 325, 96, 96), anc(600, 490, 96, 96), anc(600, 655, 96, 96), mark(640, 256, 6, 69)]
for i in range(4):
    tl.append(txt(40, 150 + i * 165, 500, 130))
tl.append(txt(412, 820, 440, 46))
CASES["timeline:rail (4 nodes, 165 px pitch)"] = tl
# rows: 5 icon rows in a card, pitch 128, chip 102 (sm), text beside
rows = [txt(212, 0, 640, 92), own(0, 128, 852, 680, [])]
rows_content = []
for i in range(5):
    y = 148 + i * 128
    rows_content.append(anc(24, y, 102, 102))
    rows_content.append(txt(160, y + 12, 660, 74))
rows[1] = own(0, 128, 852, 680, rows_content)
CASES["rows: 5 icon rows (pitch 128) in a card"] = rows

# ---- Appendix A, revision 2 -------------------------------------------------------------------------------------------
# A.1 notebook step: track + title + body + notes-page mock (the page owns its lines) + bridge
page = own(36, 401, 780, 390, [txt(120, 440, 620, 70), txt(120, 530, 620, 80), txt(120, 626, 620, 70), txt(200, 712, 420, 58)])
CASES["A.1 notebook step (mock:notes)"] = [anc(380, 0, 472, 64), txt(212, 96, 640, 97), txt(72, 217, 780, 148), page, txt(332, 823, 520, 46)]
# A.2 swiss stat, 28 px waffle (316 box), numeral 290 px, field starts 24 px below the header tab and bleeds both canvas edges
fld = own(-114, 24, 1080, 420, [anc(36, 76, 316, 316), anc(388, 74, 428, 330)])
CASES["A.2 swiss stat (field, numeral 290, waffle 316)"] = [fld, txt(152, 484, 700, 194), txt(292, 702, 560, 74), txt(432, 820, 420, 40)]
SHARES["A.2 swiss stat (field, numeral 290, waffle 316)"] = [(0, 24, 852, 420)]
# A.3 interface before/after: two panels with chat bubbles
p1 = own(0, 129, 852, 250, [txt(36, 150, 200, 50), txt(100, 214, 420, 74), txt(420, 300, 380, 60)])
p2 = own(0, 423, 852, 330, [txt(36, 444, 200, 50), txt(90, 508, 560, 148), txt(400, 668, 380, 60)])
CASES["A.3 interface before/after (two panels)"] = [txt(292, 0, 560, 97), p1, anc(398, 379, 56, 44), p2, txt(512, 781, 340, 60)]
SHARES["A.1 notebook step (mock:notes)"] = [(36, 401, 780, 390), (380, 0, 472, 64)]
SHARES["A.3 interface before/after (two panels)"] = [(0, 129, 852, 250), (0, 423, 852, 330)]

if __name__ == "__main__":
    dump = {}
    for name, boxes in CASES.items():
        m = metrics(boxes)
        dump[name] = m
        if "--json" not in sys.argv:
            print(f"{name:62s}", m)
    for name, s in SHARES.items():
        sh = anchor_share(s)
        dump[name]["anchor_share"] = sh
        if "--json" not in sys.argv:
            print("anchor share", name, sh, "% of zone")
    if "--json" in sys.argv:
        print(json.dumps(dump, ensure_ascii=False, indent=1))
