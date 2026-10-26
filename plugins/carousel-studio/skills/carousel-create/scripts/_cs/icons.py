"""Arabic icon lookup (spec 3.1): the Python twin of src/visual/stem.js and icons.js. Same data files, same integer scores (x10).

normalize, stem_candidates, find, concepts, topic, explain, has. A query is a string or a list of fields (a string or
{"text", "w"}, w in percent). use({...}) injects pack/index/concepts/stem blocks (tests). Pure, deterministic, stdlib only."""
import math
import re
import unicodedata
from pathlib import Path
from types import SimpleNamespace as NS

from . import paths

_MARK = re.compile("[\u0640\u064b-\u065f\u0670]")
_DROP = re.compile("[\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff\u061c]")
_DIGIT = re.compile("[\u0660-\u0669\u06f0-\u06f9]")
_WORD = re.compile("[0-9A-Za-z\u0621-\u063a\u0640-\u065f\u0670\u0671\u067e\u06a4\u06a9\u06cc]+")
_FOLD = str.maketrans("\u0623\u0625\u0622\u0671\u0649\u0629\u0624\u0626\u06a9\u06cc\u06a4\u067e", "\u0627\u0627\u0627\u0627\u064a\u0647\u0648\u064a\u0643\u064a\u0641\u0628")
_BITS = {"eg": 1, "gulf": 2, "lev": 4, "mag": 8, "msa": 16, "loan": 32}
_STAGES = (("art", 1, 1, 2), ("prep", 1, 2, 3), ("asp", 2, 4, 3), ("per", 3, 8, 3), ("suf", 4, 16, 3), ("pl", 5, 32, 3))
_src, _dir, _T, _K = {}, None, None, None


def use(blocks=None, folder=None):
    """Inject blocks {"pack", "index", "concepts", "stem"} and/or a data folder; no arguments: back to data/icons/."""
    global _src, _dir, _T, _K
    _src, _dir, _T, _K = dict(blocks or {}), folder, None, None


def _block(name):
    if name in _src:
        return _src[name]
    p = Path(_dir or paths.data_path("icons")) / (name + ".json")
    return paths.read_json(p) if p.is_file() else None


def _words(s):
    return str(s).split(" ") if s else []


def _put(d, k, v):
    d.setdefault(k, []).append(v)


def _tok(text):
    s = _DROP.sub("", unicodedata.normalize("NFKC", "" if text is None else str(text)))
    s = _DIGIT.sub(lambda m: str(ord(m.group()) & 15), s)
    toks = [_MARK.sub("", m) for m in _WORD.findall(s)]
    return [{"n": r.translate(_FOLD).lower(), "r": r, "x": 0, "s": 0} for r in toks if r]


def normalize(text):
    """Strip tashkeel and tatweel, fold the letters of spec 3.1, Western digits, lower case; tokens joined by one space."""
    return " ".join(t["n"] for t in _tok(text))


def _tables():
    global _T
    if _T is None:
        raw = _block("stem") or {}
        _T = {k: _words(raw.get(k)) for k in ("art", "prep", "asp", "per", "suf", "pl")}
        _T["br"] = {p[0]: (p + [""])[1] for p in (x.split(">") for x in _words(raw.get("br")))}
        _T["stop"], _T["raw"] = set(_words(raw.get("stop"))), raw
    return _T


def _steps(w, g, m, T, d):
    """The strips of one word at stage g with bits m used: article, preposition, aspect, person prefix, suffix, plural, broken plural."""
    r = []
    for key, s, b, mn in _STAGES:
        if g > s or m & b:
            continue
        for p in T[key]:
            at = p.find("@")
            if at > 0:
                if d and d != "auto" and p[at + 1:] != d:
                    continue
                p = p[:at]
            k = len(w) - len(p)
            if k < mn or not (w.startswith(p) if s < 4 else w[k:] == p):
                continue
            x = w[len(p):] if s < 4 else w[:k]
            if key == "per":
                v = [x] + (["\u0627" + x] if x[:1] != "\u0627" else [])
            elif key == "suf":
                v = [x] + ([x[:-1] + "\u0647"] if x[-1:] == "\u062a" else [])
            else:
                v = [x + "\u0647", x] if key == "pl" else [x]
            r += [(y, s, m | b) for y in v if len(y) >= mn]
    y = T["br"].get(w)
    if g <= 5 and not m & 64 and y and len(y) >= 3:
        r.append((y, 5, m | 64))
    return r


def _cands(w, d=None):
    T, out, q, k = _tables(), [w], [(w, 0, 0)], 0
    if not re.search("[\u0621-\u064a]", w):
        return out + ([w[:-1]] if len(w) > 3 and w[-1] == "s" else [])
    while k < len(q) and len(out) < 40:
        for y in _steps(*q[k], T, d):
            if y[0] not in out:
                out.append(y[0])
                q.append(y)
        k += 1
    return out


def stem_candidates(word, dialect=None):
    """The first token of word, then its stems by number of strips (at most 40); [] for an empty text."""
    t = _tok(word)
    return _cands(t[0]["n"], dialect) if t else []


def _neg_in(n):
    m = re.fullmatch("\u0645\u0627(.{2,})\u0634", n) or re.fullmatch("\u0645(.{3,})\u0634", n)
    return m.group(1) if m else None


def _base(w):
    return next((w[len(a):] for a in _tables()["art"] if len(w) - len(a) >= 2 and w.startswith(a)), w)


def _fields(q):
    return [{"text": f.get("text"), "w": 100 if f.get("w") is None else f["w"]} if isinstance(f, dict) else {"text": f, "w": 100}
            for f in (q if isinstance(q, (list, tuple)) else [q])]


def _pick(ss, bag, tp, skip):
    """The sense of a homograph: most cue words in the bag, else the first sense whose categories meet the topic, else the first."""
    best, hit, bi = 0, 0, 99
    for i, s in enumerate(ss):
        c = sum(1 for w in s["cues"] if w in bag and w not in skip)
        if c > hit:
            hit, best = c, i
    for i, s in enumerate(ss if not hit else ()):
        for j, t in enumerate(tp):
            if j < bi and t in s["cats"]:
                bi, best = j, i
    return best


def _build():
    T = _tables()
    raw = T["raw"]
    K = NS(P=(_block("pack") or {}).get("icons") or {}, R={}, cp={}, ct={}, kp={}, kt={}, en={}, hk={}, hc={}, al={}, neg={}, df=raw.get("def") or {})
    for r in _block("index") or []:
        n, cat, en, ar, fl = (list(r) + [None] * 5)[:5]
        K.R[n] = {"name": n, "cat": cat, "en": en or [], "ar": ar or [], "fl": fl or {}}
    for x in _words(raw.get("neg")):
        p = x.split("@") + [""]
        K.neg[p[0].replace("_", " ")] = p[1]
    for key, ss in (raw.get("home") or {}).items():
        K.hk[key] = []
        for i, s in enumerate(ss):
            cats, ics, cues = (list(s) + ["", "", ""])[:3]
            K.hk[key].append({"cats": _words(cats), "cues": _words(cues), "c": {"id": "home:%s:%d" % (key, i), "cat": (_words(cats) or [None])[0], "icons": _words(ics), "home": key}})
    cl, w = list((_block("concepts") or {}).get("concepts") or []), raw.get("warn")
    if w and not any(c.get("id") == "warning" for c in cl):
        cl.append({"id": "warning", "cat": "arrows-ui", "pol": "warn", "icons": _words(w.get("i")), "forms": {"msa": _words(w.get("f"))}})
    ent = []
    for c in cl:
        cf = {}
        for dn, bit in _BITS.items():
            for x in (c.get("forms") or {}).get(dn) or []:
                if normalize(x):
                    cf[normalize(x)] = cf.get(normalize(x), 0) | bit
        ent.append((c, cf, c.get("home") and normalize(c["home"])))
    for c, cf, h in ent:
        if h and h in K.hk:
            K.hc.setdefault(h, []).append(c)
            for f in cf:
                if " " not in f and f != h and h in _cands(f):
                    K.al[f], K.hk[f] = h, K.hk[h]
    for c, cf, h in ent:
        for f, b in cf.items():
            if " " in f or f not in K.hk:
                _put(K.cp if " " in f else K.ct, f, (c, b))
    for n, r in K.R.items():
        for x in r["ar"]:
            f = normalize(x)
            if " " in f or (f and f not in K.hk):
                _put(K.kp if " " in f else K.kt, f, (n, 0))
        for x in r["en"] + ([] if "-" not in n or n.startswith(("cs-", "tb-")) else [n]):
            if normalize(x):
                _put(K.en, normalize(x), (n, 0))
    return K


def _kit():
    global _K
    if _K is None:
        _K = _build()
    return _K


def _topics(t):
    return [t] if isinstance(t, str) else list(t or [])


def _neg_ok(K, key, d):
    v = K.neg.get(key)
    return v is not None and (not v or not d or d == "auto" or v == d)


def _combos(lists):
    out = [""]
    for c in lists:
        out = [p + " " + x if p else x for p in out for x in c]
    return out


def _scan(q, d, topic):
    """Ladder hits {k: c|i, ref, r: rung, s: score, fi: field, i/e: first/last token, a: own dialect, rw: as typed, n: negated}."""
    K, T, tp, H, N = _kit(), _tables(), _topics(topic), [], []
    db = _BITS[d] | 48 if d in _BITS else 0
    bag = {c for f in _fields(q) for t in _tok(f["text"]) for c in _cands(t["n"])}
    for fi, f in enumerate(_fields(q)):
        tk, cm = _tok(f["text"]), {}
        n = len(tk)

        def cs(x):
            if x not in cm:
                cm[x] = _cands(x, d)
            return cm[x]

        def add(kind, ref, rung, base, bits):
            s = math.floor(base * f["w"] / 100)
            if s > 0:
                H.append({"k": kind, "ref": ref, "r": rung, "s": s, "fi": fi, "i": i, "e": i + ln - 1, "a": 1 if bits & db else 0, "rw": " ".join(t["r"] for t in tk[i:i + ln])})

        def adds(lst, kind, rung, base):
            for ref, bits in lst or []:
                add(kind, ref, rung, base, bits)

        def sense(key, rung, base):
            k2 = K.al.get(key) or key
            ss = K.hk[key]
            s = ss[_pick(ss, bag, tp, cs(k2))]
            add("c", next((h for h in K.hc.get(k2) or [] if h["cat"] in s["cats"]), s["c"]), rung, base, 0)

        i = 0
        while i < n:
            v = _neg_in(tk[i]["n"])
            if v:
                tk[i]["n"] = v
                N.append((fi, i, i, 1))
            elif _neg_ok(K, tk[i]["n"], d):
                tk[i]["x"] = 1
                N.append((fi, i, i, 0))
            elif i + 1 < n and _neg_ok(K, tk[i]["n"] + " " + tk[i + 1]["n"], d):
                tk[i]["x"] = tk[i + 1]["x"] = 1
                N.append((fi, i, i + 1, 0))
                i += 1
            i += 1
        for t in tk:
            t["s"] = t["x"] or len(t["n"]) < 2 or t["n"] in T["stop"] or _base(t["n"]) in T["stop"]
        for i in range(n):
            for ln in range(min(3, n - i), 0, -1):
                ph = " ".join(t["n"] for t in tk[i:i + ln])
                adds(K.en.get(ph) or (ln == 1 and K.en.get((cs(ph) + [None])[1])), "i", 6, 10)
                if ln > 1:
                    adds(K.cp.get(ph), "c", 1, 35)
                    adds(K.kp.get(ph), "i", 3, 30)
                    if ph not in K.cp and ph not in K.kp:
                        for p in _combos([cs(t["n"])[:4] for t in tk[i:i + ln]])[1:]:
                            adds(K.cp.get(p), "c", 5, 26)
                            adds(K.kp.get(p), "i", 5, 22)
                elif not tk[i]["s"]:
                    t = tk[i]["n"]
                    cc, A, B = cs(t), K.ct.get(t), K.kt.get(t)
                    if t in K.hk:
                        sense(t, 2, 30)
                    adds(A, "c", 2, 30)
                    adds(B, "i", 4, 20)
                    if t not in K.hk and not A and not B:
                        a = next((c for c in cc[1:] if K.ct.get(c) or c in K.hk), None)
                        b = next((c for c in cc[1:] if K.kt.get(c)), None)
                        if a in K.hk:
                            sense(a, 5, 22)
                        else:
                            adds(K.ct.get(a), "c", 5, 22)
                        adds(K.kt.get(b), "i", 5, 15)
    for fi, at, end, own in N:  # a negation marks the nearest word after it (3 tokens at most), else before it; a bound one marks its own
        best, bd = None, 99
        for h in H:
            if h["fi"] != fi or (h["k"] == "c" and h["ref"].get("pol")):
                continue
            x = (0 if h["i"] <= at <= h["e"] else 99) if own else h["i"] - end if end < h["i"] <= end + 3 else 10 + at - h["e"] if h["e"] < at <= h["e"] + 3 else 99
            if x < bd or (x == bd and best and h["s"] > best["s"]):
                bd, best = x, h
        for h in H if best else ():
            if h["fi"] == best["fi"] and h["i"] == best["i"]:
                h["n"] = 1
    return H


def _ranked(H):
    """One entry per concept (best hit, support), best first."""
    by, arr = {}, []
    for h in H:
        if h["k"] != "c":
            continue
        e = by.setdefault(h["ref"]["id"], {"c": h["ref"], "s": 0, "r": 9, "g": 1e9, "sup": 0, "a": 0, "rw": "", "neg": False})
        if not e["sup"]:
            arr.append(e)
        g = h["fi"] * 1000 + h["i"]
        e["sup"], e["a"], e["neg"] = e["sup"] + 1, e["a"] or h["a"], e["neg"] or bool(h.get("n"))
        if h["s"] > e["s"] or (h["s"] == e["s"] and g < e["g"]):
            e["s"], e["r"], e["g"], e["rw"] = h["s"], h["r"], g, h["rw"]
    return sorted(arr, key=lambda e: (-e["s"], -e["neg"], -e["sup"], -e["a"], e["g"], e["c"]["id"]))


def find(query, dialect=None, k=5, exclude=(), hero=False, topic=None, avoid=(), avoid_cat=None):
    """The k best icons [{name, score, rung, concept, cat, via, neg, primitive, object, why}], best first."""
    K, H, cand, arr = _kit(), _scan(query, dialect, topic), {}, []
    cs, ex, k = _ranked(H), set(exclude or ()), k if k and k > 0 else 5

    def upd(n, s, r, src, rank, c, sup, via, a, ng, g):
        e = cand.get(n)
        if e is None:
            e = cand[n] = {"name": n, "s": -1, "src": 9, "rank": 99, "sup": 0}
            arr.append(e)
        e["sup"] += sup
        if s > e["s"] or (s == e["s"] and (src, rank) < (e["src"], e["rank"])):
            e.update(s=s, r=r, src=src, rank=rank, c=c, via=via, a=a, ng=ng, g=g)

    for e in cs:
        for i, n in enumerate(e["c"].get("icons") or []):
            upd(n, e["s"], e["r"], 0, i, e["c"], e["sup"], e["rw"], e["a"], e["neg"], e["g"])
    for h in H:
        if h["k"] == "i":
            upd(h["ref"], h["s"], h["r"], 2 if h["r"] == 6 else 1, 0, None, 1, h["rw"], h["a"], bool(h.get("n")), h["fi"] * 1000 + h["i"])
    for cat in _topics(topic):
        for n in _words(K.df.get(cat)):
            if not (n in K.R and K.R[n]["fl"].get("o")):
                upd(n, 5, 7, 3, 0, None, 0, cat, 0, False, 0)
    pol = any(e["c"].get("pol") for e in cs)

    def keep(e):
        row = K.R.get(e["name"])
        fl = row["fl"] if row else {}
        e["fp"] = 0 if pol and fl.get("p") else 1
        return not (e["name"] in ex or (not row and e["name"] not in K.P) or (hero and fl.get("d") == "h") or any(fl.get(a) for a in avoid or ()))

    arr = sorted(filter(keep, arr), key=lambda e: (e["fp"], -e["s"], -e["ng"], -e["sup"], e["src"], e["rank"], -e["a"], e["g"], e["name"]))
    cat_of = lambda e: K.R.get(e["name"], {}).get("cat")  # noqa: E731
    if avoid_cat and len(arr) > 1 and cat_of(arr[0]) == avoid_cat:
        j = 1
        while j < len(arr) and arr[j]["s"] >= arr[0]["s"] - 5:
            if cat_of(arr[j]) != avoid_cat:
                arr.insert(0, arr.pop(j))
                break
            j += 1
    why, out = _tables()["raw"].get("why") or {}, []
    for e in arr[:k]:
        c, row = e.get("c"), K.R.get(e["name"])
        tpl = why.get(dialect) or why.get("msa")
        out.append({"name": e["name"], "score": e["s"], "rung": e["r"], "concept": c["id"] if c else None, "cat": row["cat"] if row else None, "via": e["via"], "neg": bool(e["ng"]),
                    "primitive": c and c.get("primitive") or None, "object": c and c.get("object") or None,
                    "why": tpl.replace("{n}", (row and row["en"] and row["en"][0]) or e["name"]).replace("{w}", e["via"][:30]) if tpl else ""})
    return out


def concepts(query, dialect=None, topic=None):
    """The concepts a text names, best first: [{id, cat, score, rung, icons, object, primitive, pol, neg, via}]."""
    return [{"id": c["id"], "cat": c.get("cat"), "score": e["s"], "rung": e["r"], "icons": c.get("icons") or [], "object": c.get("object") or None,
             "primitive": c.get("primitive") or None, "pol": c.get("pol") or None, "neg": e["neg"], "via": e["rw"]}
            for e in _ranked(_scan(query, dialect, topic)) for c in [e["c"]]]


def topic(query, dialect=None):
    """The deck topic: up to two categories of the strongest concepts (a homograph sense does not vote)."""
    tot = {}
    for e in _ranked(_scan(query, dialect, None)):
        if not e["c"].get("home") and e["c"].get("cat"):
            tot[e["c"]["cat"]] = tot.get(e["c"]["cat"], 0) + e["s"]
    return sorted(tot, key=lambda a: (-tot[a], a))[:2]


def explain(name, query, dialect=None):
    """The find() entry of one icon for a query, or None."""
    return next((r for r in find(query, dialect, k=999) if r["name"] == name), None)


def has(name):
    return name in _kit().R or name in _kit().P
