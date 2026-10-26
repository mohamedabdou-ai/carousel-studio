/* src/visual/stem.js - owned by D3. Arabic fold, tokens and the light dialect stemmer of spec 3.1. Every table is data (block cs-icon-stem). */
(function () {
  var V = CS.visual, MARK = /[\u0640\u064B-\u065F\u0670]/g, memo = null, memoKey = null;
  var FROM = "\u0623\u0625\u0622\u0671\u0649\u0629\u0624\u0626\u06A9\u06CC\u06A4\u067E", TO = "\u0627\u0627\u0627\u0627\u064A\u0647\u0648\u064A\u0643\u064A\u0641\u0628";

  function fold(s) {
    return s.replace(MARK, "").replace(/[\u0623\u0625\u0622\u0671\u0649\u0629\u0624\u0626\u06A9\u06CC\u06A4\u067E]/g, function (c) { return TO.charAt(FROM.indexOf(c)); });
  }
  /** Tokens of a text: [{n: folded lower-case token, r: the token as typed without tashkeel}]. Digits are Western; marks and bidi controls vanish. */
  function tok(text) {
    var s = String(text == null ? "" : text).normalize("NFKC").replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF\u061C]/g, "")
      .replace(/[\u0660-\u0669\u06F0-\u06F9]/g, function (c) { return String(c.charCodeAt(0) & 15); });
    var m = s.match(/[0-9A-Za-z\u0621-\u063A\u0640-\u065F\u0670\u0671\u067E\u06A4\u06A9\u06CC]+/g) || [], out = [], i, r, n;
    for (i = 0; i < m.length; i++) { r = m[i].replace(MARK, ""); n = fold(r).toLowerCase(); if (n) out.push({ n: n, r: r }); }
    return out;
  }
  function norm(text) { return tok(text).map(function (t) { return t.n; }).join(" "); }

  function words(s) { return s ? String(s).split(" ") : []; }
  function tbl() {
    var raw = V._.block("cs-icon-stem"), b = raw || {}, t;
    if (memo && memoKey === raw) return memo;
    t = { raw: b, art: words(b.art), prep: words(b.prep), asp: words(b.asp), per: words(b.per), suf: words(b.suf), pl: words(b.pl), br: Object.create(null), stop: Object.create(null) };
    words(b.br).forEach(function (x) { var p = x.split(">"); t.br[p[0]] = p[1]; });
    words(b.stop).forEach(function (x) { t.stop[x] = 1; });
    memoKey = raw;
    return (memo = t);
  }

  /* One stripping step. node = [word, stage, usedBits]; a step is allowed when its stage is not below the node's stage and its bit is unused,
     so the order is article/preposition, aspect prefix, person prefix, suffix, plural. A strip keeps three letters, the article two (al-sirr, the secret). */
  function steps(node, T, d) {
    var w = node[0], g = node[1], m = node[2], L = w.length, r = [], i, p, at, x;
    function add(y, s, b, mn) { if (y.length >= (mn || 3)) r.push([y, s, m | b]); }
    function pre(list, s, b, alif, mn) {
      if (g > s || (m & b)) return;
      for (i = 0; i < list.length; i++) {
        p = list[i]; at = p.indexOf("@");
        if (at > 0) { if (d && d !== "auto" && p.slice(at + 1) !== d) continue; p = p.slice(0, at); }
        if (L - p.length >= (mn || 3) && w.indexOf(p) === 0) {
          x = w.slice(p.length); add(x, s, b, mn);
          if (alif && x.charAt(0) !== "\u0627") add("\u0627" + x, s, b);
        }
      }
    }
    pre(T.art, 1, 1, 0, 2); pre(T.prep, 1, 2); pre(T.asp, 2, 4); pre(T.per, 3, 8, 1);
    if (g <= 4 && !(m & 16)) for (i = 0; i < T.suf.length; i++) {
      p = T.suf[i];
      if (L - p.length >= 3 && w.slice(L - p.length) === p) { x = w.slice(0, L - p.length); add(x, 4, 16); if (x.slice(-1) === "\u062A") add(x.slice(0, -1) + "\u0647", 4, 16); }
    }
    if (g <= 5 && !(m & 32)) for (i = 0; i < T.pl.length; i++) {
      p = T.pl[i];
      if (L - p.length >= 3 && w.slice(L - p.length) === p) { x = w.slice(0, L - p.length); add(x + "\u0647", 5, 32); add(x, 5, 32); }
    }
    if (g <= 5 && !(m & 64) && T.br[w]) add(T.br[w], 5, 64);
    return r;
  }

  /** Stem candidates of one folded token, the token itself first, then by number of strips (breadth first); at most 40. */
  function cands(w, d) {
    var T = tbl(), out = [w], seen = Object.create(null), q = [[w, 0, 0]], k, j, o;
    seen[w] = 1;
    if (!/[\u0621-\u064A]/.test(w)) { if (w.length > 3 && w.charAt(w.length - 1) === "s") out.push(w.slice(0, -1)); return out; }
    for (k = 0; k < q.length && out.length < 40; k++) {
      o = steps(q[k], T, d);
      for (j = 0; j < o.length; j++) if (!seen[o[j][0]]) { seen[o[j][0]] = 1; out.push(o[j][0]); q.push(o[j]); }
    }
    return out;
  }
  /** The verb inside a bound negation: "ma" + verb + "sh" (or "m" + verb + "sh"), else null. */
  function negIn(n) {
    var m = /^\u0645\u0627(.{2,})\u0634$/.exec(n) || /^\u0645(.{3,})\u0634$/.exec(n);
    return m ? m[1] : null;
  }
  /** The token without its definite article (used by the stop list). */
  function base(w) {
    var A = tbl().art, i;
    for (i = 0; i < A.length; i++) if (w.length - A[i].length >= 2 && w.indexOf(A[i]) === 0) return w.slice(A[i].length);
    return w;
  }

  /** Every folded token of a query (string, field or list of fields) with its stem candidates: the cue words a homograph looks for. */
  function bag(q) {
    var b = Object.create(null);
    (Array.isArray(q) ? q : [q]).forEach(function (f) { tok(f && typeof f === "object" ? f.text : f).forEach(function (t) { cands(t.n).forEach(function (c) { b[c] = 1; }); }); });
    return b;
  }
  /** The sense of a homograph word: most cue words in the bag (the word's own variants do not count), else the first sense whose categories meet the topic, else the first. */
  function pick(ss, b, tp, skip) {
    var best = 0, hit = 0, bi = 99, i, j, c;
    for (i = 0; i < ss.length; i++) {
      c = ss[i].cues.filter(function (w) { return b[w] && skip.indexOf(w) < 0; }).length;
      if (c > hit) { hit = c; best = i; }
    }
    if (hit) return best;
    for (i = 0; i < ss.length; i++) for (j = 0; j < tp.length; j++) if (j < bi && ss[i].cats.indexOf(tp[j]) >= 0) { bi = j; best = i; }
    return best;
  }

  V._.stem = { fold: fold, tok: tok, norm: norm, cands: cands, negIn: negIn, base: base, tbl: tbl, bag: bag, pick: pick };
})();
