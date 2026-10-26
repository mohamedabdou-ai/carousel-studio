"""Dead-space measure and recipe geometry (spec 7.1, 7.2, 4.1, 4.2): the Python twin of src/visual/space.js and geometry.js (V1b, contract v2).

UNITS. Lengths px (body-zone origin). band, rect, fill, anchorShare and owners[].rows|cols are PERCENT 0-100 to one decimal (band of the 1440 canvas height,
the rest of the zone). Options occ min big bigShare fill are percent (65; 0.65 reads as 65, so 1 is 100); halos and border px; box["fill"] is an OPACITY 0-1.
Box: x, y, w, h, kind (text | ink | owner | pattern | image | mark | decor; else ink), id, ownerOf, fill, border, anchor (True or False overrides: every kind
but text is an anchor), path ([[x, y], ...]), ground, ghost, lettermark, contrast. An owner needs fill >= 35% opacity or border >= 3 px AND 65% (80% above 60%
of the zone) of its rows AND columns holding content. opts["strict"] (default True; only False turns it off): no valid fill and no valid border means not an
owner; owners[i]["meta"] is "ok", "weak" or "none". Rows are capped at ROWS_MAX = 5 (S-21). Integer comparisons; standard library only.
"""
from __future__ import annotations

import math

SUB = 4
D = {"cols": 36, "rows": 37, "occ": 30, "canvasH": 1440, "hText": 16, "hInk": 32, "hOwn": 0, "min": 65, "big": 80, "bigShare": 60, "fill": 35, "border": 3}
G, GAP = 40, 20
SIZE = {"icon": (280, 560), "mock": (300, 560), "scene": (320, 0), "chart": (360, 0), "numeral": (300, 0), "field": (280, 0), "photo": (320, 0), "word": (280, 0), "pattern": (280, 0)}
PAD = {"poster": 48, "heritage": 44}
RECIPES = ("under", "over", "start", "end", "full", "band", "corner", "center", "half")
ROWS_MAX = 5


def _rnd(v):
    return math.floor(v + 0.5)


def _pc(v):
    return _rnd(v * 100) if v <= 1 else v


def _pct(n, d):
    return math.floor((2000 * n + d) / (2 * d)) / 10 if d else 0


def _cfg(o):
    o = o or {}
    c = {k: (o[k] if isinstance(o.get(k), (int, float)) else v) for k, v in D.items()}
    g, h, w = o.get("grid") or {}, o.get("halo") or {}, o.get("owner") or {}
    if isinstance(g, (list, tuple)):
        g = {"cols": g[0], "rows": g[1]}
    c["cols"], c["rows"] = g.get("cols") or c["cols"], g.get("rows") or c["rows"]
    c["strict"] = o.get("strict") is not False
    for key, v in (("hText", h.get("text")), ("hInk", h.get("ink")), ("hOwn", h.get("owner")), ("min", w.get("min")), ("big", w.get("big")),
                   ("bigShare", w.get("bigShare")), ("fill", w.get("fill")), ("border", w.get("border"))):
        if v is not None:
            c[key] = v
    for key in ("occ", "min", "big", "bigShare", "fill"):
        c[key] = _pc(c[key])
    return c


def stroke_boxes(path, step=32, size=48):
    """One ink box of ``size`` per ``step`` px of the polyline [[x, y], ...], centred on its chunk."""
    n, cum, out = len(path), [0], []
    for i in range(1, n):
        dx, dy = path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]
        cum.append(cum[i - 1] + math.sqrt(dx * dx + dy * dy))
    length, k = cum[n - 1], 0
    while k == 0 or k * step < length:
        d = (k * step + min((k + 1) * step, length)) / 2
        i = 1
        while i < n - 1 and cum[i] < d:
            i += 1
        a = path[i - 1]
        b = path[i] if i < n else a
        t = (d - cum[i - 1]) / (cum[i] - cum[i - 1]) if i < n and cum[i] > cum[i - 1] else 0
        out.append({"x": _rnd(a[0] + t * (b[0] - a[0]) - size / 2), "y": _rnd(a[1] + t * (b[1] - a[1]) - size / 2), "w": size, "h": size, "kind": "ink"})
        k += 1
    return out


def _expand(boxes):
    out = []
    for b in boxes:
        k = (b or {}).get("kind") or "ink"
        if not b or k in ("mark", "decor") or b.get("ground") or b.get("ghost") or b.get("lettermark") or (b.get("contrast") is not None and b["contrast"] < 0.35):
            continue
        for q in (stroke_boxes(b["path"]) if b.get("path") else [b]):
            if q["w"] > 0 and q["h"] > 0:
                out.append({"k": "t" if k == "text" else "g" if k == "image" else "o" if k in ("owner", "pattern") else "i",
                            "r": [q["x"], q["y"], q["x"] + q["w"], q["y"] + q["h"]], "id": "#%d" % len(out) if b.get("id") is None else b["id"],
                            "up": b.get("ownerOf"), "an": b.get("anchor"), "fill": b.get("fill"), "border": b.get("border")})
    return out


def _infl(m, c):
    h = c["hText"] if m["k"] == "t" else c["hInk"] if m["k"] == "i" else c["hOwn"]
    r = m["r"]
    return [r[0] - h, r[1] - h, r[2] + h, r[3] + h]


def _held(m, c, x):
    if "hd" in m:
        return m["hd"]
    out = []
    m["busy"] = 1
    for k in x["items"]:
        if k is m or k.get("busy") or k["up"] is None or k["up"] != m["id"]:
            continue
        if k["k"] == "o":
            _judge(k, c, x)
        for r in [_infl(k, c)] if k["k"] != "o" else [k["r"]] if k["ok"] else _held(k, c, x):
            if not any(r is q for q in out):
                out.append(r)
    m["busy"] = 0
    m["hd"] = out
    return out


def _num(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def _meta(m, c):
    f = m["fill"] if _num(m["fill"]) and 0 <= m["fill"] <= 1 else -1
    b = m["border"] if _num(m["border"]) and m["border"] >= 0 else -1
    return "none" if f < 0 and b < 0 else "ok" if f >= c["fill"] / 100 or b >= c["border"] else "weak"


def _judge(m, c, x):
    if m.get("done"):
        return
    m["done"] = 1
    W, H, C, R = x["W"], x["H"], c["cols"], c["rows"]
    X0, Y0, X1, Y1 = max(0, m["r"][0]), max(0, m["r"][1]), min(W, m["r"][2]), min(H, m["r"][3])
    cont, rh, ch, rn, cn = _held(m, c, x), 0, 0, 0, 0
    if X1 > X0 and Y1 > Y0:
        ra, ca = math.floor(Y0 * R / H), math.floor(X0 * C / W)
        rn, cn = math.floor((Y1 - 1) * R / H) - ra + 1, math.floor((X1 - 1) * C / W) - ca + 1
        rh = sum(1 for i in range(ra, ra + rn) if any((min(q[3] * R, (i + 1) * H) - max(q[1] * R, i * H)) * 100 >= c["occ"] * H for q in cont))
        ch = sum(1 for i in range(ca, ca + cn) if any((min(q[2] * C, (i + 1) * W) - max(q[0] * C, i * W)) * 100 >= c["occ"] * W for q in cont))
    m["need"] = c["big"] if (X1 - X0) * (Y1 - Y0) * 100 > c["bigShare"] * W * H else c["min"]
    m["rs"], m["cs"], m["meta"] = _pct(rh, rn), _pct(ch, cn), _meta(m, c)
    m["ok"] = bool(rn > 0 and cn > 0 and rh * 100 >= m["need"] * rn and ch * 100 >= m["need"] * cn and (m["meta"] == "ok" or (m["meta"] == "none" and not c["strict"])))


def _at(v, S, n):
    i = 0
    while i < n and S * (2 * i + 1) < v * 2 * n:
        i += 1
    return i


def _cover(rs, c, W, H):
    C, R = c["cols"], c["rows"]
    nx, ny = C * SUB, R * SUB
    need = int((SUB * SUB * c["occ"] + 99) / 100)
    g = [bytearray(nx) for _ in range(ny)]
    for q in rs:
        x0, y0, x1, y1 = max(0, q[0]), max(0, q[1]), min(W, q[2]), min(H, q[3])
        if x1 <= x0 or y1 <= y0:
            continue
        i0, i1 = _at(x0, W, nx), _at(x1, W, nx)
        for j in range(_at(y0, H, ny), _at(y1, H, ny)):
            g[j][i0:i1] = b"" * (i1 - i0)
    o = [[1 if sum(sum(g[r * SUB + a][k * SUB:(k + 1) * SUB]) for a in range(SUB)) >= need else 0 for k in range(C)] for r in range(R)]
    return o, sum(map(sum, o))


def _big_rect(o, R, C):
    h, best = [0] * C, 0
    for r in range(R):
        h = [0 if o[r][i] else h[i] + 1 for i in range(C)]
        st = []
        for i in range(C + 1):
            cur, s = (h[i] if i < C else 0), i
            while st and st[-1][1] >= cur:
                t = st.pop()
                best = max(best, t[1] * (i - t[0]))
                s = t[0]
            st.append((s, cur))
    return best


def dead_space(boxes, zone=None, opts=None):
    c = _cfg(opts)
    W, H = (zone or {}).get("w") or 852, (zone or {}).get("h") or 888
    x = {"items": _expand(boxes or []), "W": W, "H": H}
    rects, anch, owners = [], [], []
    for m in x["items"]:
        if m["k"] == "o":
            _judge(m, c, x)
            owners.append({"id": m["id"], "rows": m["rs"], "cols": m["cs"], "ok": m["ok"], "need": m["need"], "meta": m["meta"]})
            if m["ok"]:
                rects.append(m["r"])
        else:
            rects.append(_infl(m, c))
        if (m["k"] != "t") if m["an"] is None else m["an"]:
            anch.append(m["r"])
    o, n = _cover(rects, c, W, H)
    _, an = _cover(anch, c, W, H)
    run = best = 0
    for row in o:
        if sum(row) <= 1:
            run += 1
            best = max(best, run)
        else:
            run = 0
    cells = c["rows"] * c["cols"]
    return {"band": _pct(best * H, c["rows"] * c["canvasH"]), "rect": _pct(_big_rect(o, c["rows"], c["cols"]), cells), "fill": _pct(cells - n, cells),
            "anchorShare": _pct(an, cells), "cells": ["".join("#" if v else "." for v in row) for row in o], "owners": owners}


def zone(preset=None, h=None, type=None):
    pid = preset.get("id") if isinstance(preset, dict) else preset
    pad = (24 if type == "poster" else PAD[pid]) if pid in PAD else 0
    h = h or 1440
    return {"x": 114, "y": 261, "w": 852, "h": 888 + h - 1440 - pad}


def limits(kind, n=None):
    k = max(1, min(ROWS_MAX, math.floor(n or 3)))
    return (128 * k, 128 * k + 40) if kind == "rows" else SIZE.get(kind, (280, 0))


def recipe(name, o=None):
    o = o or {}
    z = o.get("zone") or zone()
    W, H, zx = z["w"], z["h"], 114 if z.get("x") is None else z["x"]
    cw, T, kind, rtl = o.get("canvasW") or 1080, o.get("T") or 0, o.get("kind") or "icon", o.get("rtl") is not False
    lim, A, cap, right = limits(kind, o.get("n")), H - T - G, o.get("captionH") or 0, (name == "start") == rtl
    r = {"anchor": None, "text": {"x": 0, "y": 0, "w": W, "h": T}, "ok": True, "reason": "", "A": A,
         "owner": bool(name in ("start", "end", "band", "half") or o.get("field") or kind == "field")}

    def fail(why):
        if r["ok"]:
            r["ok"], r["reason"] = False, why

    if name in ("under", "over", "band") and T * 100 > 55 * H:
        fail("text-share")
    if (o.get("words") or 0) > 12 and (name == "half" or o.get("phone")):
        fail("words")
    if kind == "rows" and (o.get("n") or 0) > ROWS_MAX:
        fail("rows-max")
    if name in ("under", "over"):
        seam = o.get("seam") if o.get("seam") is not None else 24 if (kind == "field" or o.get("field")) else 0
        sm = (seam or 0) if name == "over" else 0
        a = min(A - sm, lim[1] or A)
        r["anchor"] = {"x": 0, "y": sm if name == "over" else T + G, "w": W, "h": a}
        if name == "over":
            r["text"]["y"] = sm + a + G
        if a < lim[0]:
            fail("anchor-min")
    elif name in ("start", "end"):
        p = o.get("pillar") or (380 if o.get("phone") else 272 if kind == "icon" else 344)
        ph = min(H, max(T, 420)) if o.get("pillarH") == "text" else H
        r["anchor"] = {"x": W - p if right else 0, "y": math.floor((H - ph) / 2), "w": p, "h": ph}
        r["text"] = {"x": 0 if right else p + GAP, "y": math.floor((H - T) / 2), "w": W - p - GAP, "h": T}
        if p not in (272, 344, 380):
            fail("pillar")
        if T > H:
            fail("text-tall")
        elif T < 488 and not (o.get("parts") or 0) >= 2:
            fail("start-short")
    elif name == "full":
        av = A - (cap + G if cap else 0)
        r["anchor"] = {"x": 0, "y": T + G, "w": W, "h": av}
        if cap:
            r["caption"] = {"x": 0, "y": T + G + av + G, "w": W, "h": cap}
        if av < 620:
            fail("full-min")
    elif name == "band":
        r["anchor"] = {"x": -zx, "y": T + G, "w": cw, "h": min(A, math.floor(H * 56 / 100))}
        if A < math.floor(H * 40 / 100):
            fail("band-min")
    elif name == "corner":
        r["anchor"] = {"x": 0 if rtl else W - 340, "y": 0 if o.get("top") else H - 340, "w": 340, "h": 340}
        if o.get("top"):
            r["text"]["y"] = 340 + G
        if T + G > H - 340:
            fail("corner-collide")
    elif name == "center":
        fh = 96 if o.get("footH") is None else o["footH"]
        av = H - T - fh - 2 * G
        side = max(440, min(560, av))
        r["anchor"] = {"x": math.floor((W - side) / 2), "y": T + G + math.floor((av - side) / 2), "w": side, "h": side}
        r["caption"] = {"x": 0, "y": H - fh, "w": W, "h": fh}
        if av < 440:
            fail("center-min")
    elif name == "half":
        hw = math.floor(W * (o.get("share") or 50) / 100)
        right = (o.get("side") == "start") == rtl
        r["anchor"] = {"x": W - hw if right else -zx, "y": 0, "w": hw + (cw - zx - W if right else zx), "h": H}
        r["text"] = {"x": 0 if right else hw + GAP, "y": math.floor((H - T) / 2), "w": W - hw - GAP, "h": T}
        if T > H:
            fail("text-tall")
        if o.get("parts") is not None and o["parts"] < 3:
            fail("half-thin")
    else:
        r["ok"], r["reason"] = False, "recipe"
    return r
