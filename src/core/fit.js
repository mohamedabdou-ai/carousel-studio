/* core/fit.js · auto-fit text into its box by size, never by tracking (CONTRACT 4.3.2, "Fit algorithm"). */
(function () {
  var core = (CS.core = CS.core || {});

  var PRIORITY = { hero: 0, numeral: 1, word: 1, number: 1, h1: 2, title: 3, h2: 4, body: 5, small: 6, micro: 7 };
  var DEFAULT_LINES = { hero: 3, h1: 3, title: 3, h2: 3, body: 6, number: 1, numeral: 1 };
  var EPS = 0.75;
  var LONE_RATIO = 0.35, BALANCE_RATIO = 0.3, LONE_SEARCH = 0.8;

  function M(ar, en) { return { ar: ar, en: en }; }
  function r2(n) { return Math.round(n * 100) / 100; }

  /* ---- role sizes ------------------------------------------------------------------------------------------ */

  /** {min,max}: the nominal range of a role in px at 1080 wide. */
  function rangeFor(role, tokens) {
    var sc = tokens.type.scale;
    switch (role) {
      case "numeral": var nr = sc.numeral || [280, 520]; return { min: nr[0], max: nr[1] };
      case "word": return { min: 220, max: 520 };
      case "chart": return { min: 38, max: 48 };
      case "hero": return { min: sc.hero[0], max: sc.hero[1] };
      case "number": return { min: Math.round(sc.hero[0] * 1.5), max: sc.hero[1] * 2 };
      case "h1": case "h2": case "title": case "body": return { min: sc[role][0], max: sc[role][1] };
      case "micro": return { min: sc.micro, max: sc.micro };
      default: return { min: sc.small, max: sc.small };
    }
  }

  /* The smallest size a role may reach: hero = floors.hero (96); body and bullets = floors.body (42); small, micro, kicker, bridge, attribution, labels = floors.meta (30); h1/h2/title = round(0.8 x range.min). */
  function floorPx(role, tokens) {
    var F = tokens.floors, sc = tokens.type.scale;
    switch (role) {
      case "numeral": return 200;
      case "word": return 220;
      case "chart": return 38;
      case "hero": case "number": return F.hero;
      case "body": return F.body;
      case "h1": case "h2": case "title": return Math.round(0.8 * sc[role][0]);
      default: return F.meta;
    }
  }

  function slotFloor(el, role, tokens) {
    var floor = parseFloat(el.getAttribute("data-floor"));
    return floor > 0 && isFinite(floor) ? Math.max(12, floor) : Math.min(floorPx(role, tokens), rangeFor(role, tokens).min);
  }

  /* ---- geometry helpers -------------------------------------------------------------------------------------- */

  function slideOf(node) { return node.closest ? node.closest(".cs-slide") : null; }

  function makeCtx(slideEl, tokens) {
    var rr = slideEl.getBoundingClientRect(), ow = slideEl.offsetWidth;
    if (!ow || !rr.width) throw new CS.CSError("E_USAGE", "fit needs a slide that is laid out (attached to the page and not display:none).");
    var scale = rr.width / ow;
    var geo = core.registry.geometry(slideEl.offsetHeight || core.constants.CANVAS.h, { inner: !!(tokens && tokens.art && ["cover", "poster"].indexOf(slideEl.getAttribute("data-type")) < 0) });
    var content = slideEl.querySelector(".cs-content");
    var ctx = { slide: slideEl, tokens: tokens, left: rr.left, top: rr.top, scale: scale, geo: geo, content: content, flow: [], contentBox: null, native: false };
    try { ctx.native = !!(window.CSS && CSS.supports && CSS.supports("text-wrap", "balance")); } catch (e) { ctx.native = false; }
    if (content) {
      /* the stack is measured inside the block padding of the content box: the room an archetype keeps above and below its stack is never spent on text */
      var cb = rel(content.getBoundingClientRect(), ctx), ccs = getComputedStyle(content);
      var padT = parseFloat(ccs.paddingTop) || 0, padB = parseFloat(ccs.paddingBottom) || 0;
      ctx.contentBox = { x: cb.x, y: cb.y + padT, w: cb.w, h: Math.max(0, cb.h - padT - padB) };
      Array.prototype.forEach.call(content.children, function (c) { if (getComputedStyle(c).position !== "absolute") ctx.flow.push(c); });
    }
    return ctx;
  }

  function rel(r, ctx) { return { x: (r.left - ctx.left) / ctx.scale, y: (r.top - ctx.top) / ctx.scale, w: r.width / ctx.scale, h: r.height / ctx.scale }; }

  function intersects(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }

  /** Word boxes of a slot grouped into physical lines (a new line starts when the vertical centre moves by more than 0.6 of the font size). */
  function measure(node, ctx, px, words) {
    var units = words || wordsOf(node), lines = [], cur = null, thr = 0.6 * px * ctx.scale;
    var minL = Infinity, maxR = -Infinity;
    for (var i = 0; i < units.length; i++) {
      var rs = units[i].getClientRects();
      if (!rs.length) continue;
      var r = rs[0], l = r.left, rt = r.right, t = r.top, b = r.bottom, j;
      for (j = 1; j < rs.length; j++) { l = Math.min(l, rs[j].left); rt = Math.max(rt, rs[j].right); t = Math.min(t, rs[j].top); b = Math.max(b, rs[j].bottom); }
      var cy = (t + b) / 2;
      if (!cur || Math.abs(cy - cur.cy) > thr) { cur = { cy: cy, n: 0, l: Infinity, r: -Infinity, t: Infinity, b: -Infinity, words: [] }; lines.push(cur); }
      cur.n++; cur.words.push(units[i]);
      cur.l = Math.min(cur.l, l); cur.r = Math.max(cur.r, rt); cur.t = Math.min(cur.t, t); cur.b = Math.max(cur.b, b);
      minL = Math.min(minL, l); maxR = Math.max(maxR, rt);
    }
    return { lines: lines, minL: minL, maxR: maxR };
  }

  function wordsOf(node) {
    var w = node.querySelectorAll(".w");
    if (w.length) return Array.prototype.slice.call(w);
    var parts = node.querySelectorAll(".cs-num, .cs-unit");
    return parts.length ? Array.prototype.slice.call(parts) : [node];
  }

  function contentBoxOf(node, ctx) {
    var cs = getComputedStyle(node), r = rel(node.getBoundingClientRect(), ctx);
    var pl = parseFloat(cs.paddingLeft) || 0, pr = parseFloat(cs.paddingRight) || 0, bl = parseFloat(cs.borderLeftWidth) || 0, br = parseFloat(cs.borderRightWidth) || 0;
    return { l: r.x + bl + pl, r: r.x + r.w - br - pr, rect: r };
  }

  function lineWidth(l) { return l.r - l.l; }

  function isLone(m) {
    var L = m.lines;
    if (L.length < 2) return false;
    var last = L[L.length - 1];
    if (last.n >= 2) return false;
    var widest = 0;
    L.forEach(function (x) { widest = Math.max(widest, lineWidth(x)); });
    return lineWidth(last) < LONE_RATIO * widest;
  }

  function isUnbalanced(m, boxWidthPx, ctx) {
    var L = m.lines;
    if (L.length < 3) return false;
    var mx = 0, mn = Infinity;
    for (var i = 0; i < L.length - 1; i++) { var w = lineWidth(L[i]); mx = Math.max(mx, w); mn = Math.min(mn, w); }
    return (mx - mn) / ctx.scale > BALANCE_RATIO * boxWidthPx;
  }

  /* ---- fit units ---- */

  /** Groups bullets of one list and the two sides of a comparison into one unit: they share one size, scaled by --cs-fit-ratio. */
  function buildUnits(slots, tokens) {
    var units = [], byGroup = {};
    slots.forEach(function (s, order) {
      var grouped = (s.field === "bullets" || s.field === "sides") && s.index !== null;
      var gk = grouped ? s.slot + ":" + s.field : s.key;
      var u = byGroup[gk];
      if (!u) {
        var role = s.role || "body", rg = rangeFor(role, tokens);
        u = byGroup[gk] = { key: gk, role: role, min: rg.min, max: rg.max, floor: slotFloor(s.el, role, tokens), css: s.el.getAttribute("data-fit") === "css", members: [], order: order };
        units.push(u);
      }
      u.floor = Math.max(u.floor, slotFloor(s.el, s.role || "body", tokens));
      var ratio = parseFloat(getComputedStyle(s.el).getPropertyValue("--cs-fit-ratio")) || 1;
      var ml = parseInt(s.el.getAttribute("data-max-lines"), 10) || DEFAULT_LINES[s.role] || 2;
      u.members.push({ slot: s, el: s.el, key: s.key, ratio: ratio, maxLines: ml, words: wordsOf(s.el), hasWords: !!s.el.querySelector(".w") });
    });
    units.sort(function (a, b) { return (PRIORITY[a.role] !== undefined ? PRIORITY[a.role] : 6) - (PRIORITY[b.role] !== undefined ? PRIORITY[b.role] : 6) || a.order - b.order; });
    return units;
  }

  function memberPx(u, m, S) { return Math.max(u.floor, Math.round(S * m.ratio)); }

  function stackOK(ctx) {
    if (!ctx.contentBox) return true;
    var cb = ctx.contentBox;
    for (var i = 0; i < ctx.flow.length; i++) {
      var r = rel(ctx.flow[i].getBoundingClientRect(), ctx);
      if (r.y + r.h > cb.y + cb.h + EPS || r.y < cb.y - EPS || r.x + r.w > cb.x + cb.w + EPS || r.x < cb.x - EPS) return false;
    }
    return true;
  }

  /** Line limits, capped heights, slot containment and keep-outs. */
  function ownOK(m, mm, ctx) {
    if (mm.lines.length > m.maxLines) return false;
    if (mm.lines.length) {
      var box = contentBoxOf(m.el, ctx);
      if (mm.minL < box.l * ctx.scale + ctx.left - EPS * ctx.scale || mm.maxR > box.r * ctx.scale + ctx.left + EPS * ctx.scale) return false;
      var cs = getComputedStyle(m.el), cap = parseFloat(cs.maxHeight);
      if (m.el.classList.contains("cs-art-label") && cap > 0 && mm.lines.length * parseFloat(cs.lineHeight) > cap + EPS) return false;
      var c = ctx.geo.content, sr = box.rect;
      // Fixed art-label boxes must contain the real font's vertical extents too,
      // including the changed baseline after export wraps Arabic-Indic digits.
      if (m.el.classList.contains("cs-art-label") && m.el.style.height && mm.lines.some(function (l) { return (l.t - ctx.top) / ctx.scale < sr.y - EPS || (l.b - ctx.top) / ctx.scale > sr.y + sr.h + EPS; })) return false;
      if (sr.x < c.x - EPS || sr.y < c.y - EPS || sr.x + sr.w > c.x + c.w + EPS || sr.y + sr.h > c.y + c.h + EPS) return false;
      for (var i = 0; i < ctx.geo.keepOuts.length; i++) { if (intersects(sr, ctx.geo.keepOuts[i])) return false; }
    }
    return true;
  }

  /** Widens eligible headlines to the content width after fitting fails. */
  function widen(u) {
    var did = false;
    u.members.forEach(function (m) {
      if (m.el.hasAttribute("data-fit-widen") && !m.el.hasAttribute("data-widened")) { m.el.style.inlineSize = "100%"; m.el.setAttribute("data-widened", "1"); did = true; }
    });
    return did;
  }

  /** Undo widen() when it did not help, so a headline only loses its preset width when that is what makes the slide fit. */
  function unwiden(u) {
    u.members.forEach(function (m) {
      if (m.el.hasAttribute("data-widened")) { m.el.style.removeProperty("inline-size"); m.el.removeAttribute("data-widened"); }
    });
  }

  function searchUnit(u, ctx) {
    var cache = {}, floor = u.floor, max = Math.max(u.max, floor);
    function apply(S) { u.members.forEach(function (m) { m.el.style.fontSize = memberPx(u, m, S) + "px"; }); }
    function probe(S) {
      if (cache[S]) return cache[S];
      apply(S);
      var p = { S: S, own: true, lone: false, ms: [] };
      u.members.forEach(function (m) {
        var px = memberPx(u, m, S), mm = measure(m.el, ctx, px, m.words);
        p.ms.push(mm);
        if (!ownOK(m, mm, ctx)) p.own = false;
        if (isLone(mm)) p.lone = true;
      });
      p.stack = stackOK(ctx);
      p.hard = p.own && p.stack;
      return (cache[S] = p);
    }
    var result = { size: floor, overflow: false, stackLimited: false, loneWord: false };
    var pf = probe(floor);
    if (!pf.own && widen(u)) { cache = {}; pf = probe(floor); }
    else if (pf.own && !pf.stack && widen(u)) {
      /* every slot sits at its floor and the stack is still too tall: a wider headline may need fewer lines */
      cache = {};
      var wider = probe(floor);
      if (wider.own && wider.stack) pf = wider; else { unwiden(u); cache = {}; pf = probe(floor); }
    }
    if (!pf.own) { result.overflow = true; apply(floor); return result; }
    if (!pf.stack) { result.stackLimited = true; apply(floor); return result; }
    var s0;
    if (probe(max).hard) s0 = max;
    else {
      var lo = floor, hi = max;
      while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (probe(mid).hard) lo = mid; else hi = mid; }
      s0 = lo;
    }
    var chosen = null, lowest = Math.max(floor, Math.ceil(s0 * LONE_SEARCH));
    for (var S = s0; S >= lowest; S--) {
      var p = probe(S);
      if (!p.hard) continue;
      if (!p.lone) { chosen = S; break; }
    }
    if (chosen === null) { chosen = s0; result.loneWord = true; }
    apply(chosen);
    result.size = chosen;
    return result;
  }

  function statusOf(px, u, ratio, overflow) {
    if (overflow) return "overflow";
    if (px >= Math.round(u.min * ratio)) return "fit";
    if (px <= u.floor) return "floor";
    return "shrunk";
  }

  /* ---- public: fitSlide / fitSlot ---- */

  function collect(u, ctx, report, forceOverflow, loneWord) {
    u.members.forEach(function (m) {
      var px = parseFloat(m.el.style.fontSize) || parseFloat(getComputedStyle(m.el).fontSize) || u.max;
      var mm = measure(m.el, ctx, px, m.words), box = rel(m.el.getBoundingClientRect(), ctx);
      var overflow = forceOverflow || (!u.css && (m.hasWords || mm.lines.length > 0) && !ownOK(m, mm, ctx));
      var lone = loneWord && isLone(mm);
      var res = {
        key: m.key, role: u.role, fontPx: Math.round(px), minPx: Math.round(u.min * m.ratio), maxPx: Math.round(u.max * m.ratio),
        lines: mm.lines.length, words: m.el.querySelectorAll(".w").length, box: { x: r2(box.x), y: r2(box.y), w: r2(box.w), h: r2(box.h) },
        loneWord: !!lone, status: statusOf(Math.round(px), u, m.ratio, overflow)
      };
      report.slots[m.key] = res;
      if (res.status === "overflow") report.warnings.push(M("النص في «" + m.key + "» لا يتسع في مكانه حتى بأصغر حجم مسموح (" + Math.round(px) + " بكسل).", "The text in " + m.key + " does not fit its place even at the smallest allowed size (" + Math.round(px) + " px)."));
      else if (res.loneWord) report.warnings.push(M("آخر سطر في «" + m.key + "» كلمة وحيدة.", "The last line of " + m.key + " is a single word."));
      if (!ctx.native && isUnbalanced(mm, box.w, ctx)) report.warnings.push(M("أسطر «" + m.key + "» غير متوازنة.", "The lines of " + m.key + " are not balanced."));
    });
  }

  /** Fits a slide synchronously with loaded fonts, optionally replaying frozen sizes. */
  function fitSlide(slideEl, tokens, opts) {
    opts = opts || {};
    var ctx = makeCtx(slideEl, tokens), slots = core.compose.slots(slideEl), units = buildUnits(slots, tokens);
    var report = { slideId: slideEl.getAttribute("data-cs-slide") || "", ok: true, slots: {}, warnings: [] };
    var frozen = opts.frozenSizes || null, lone = {};

    units.forEach(function (u) {
      if (u.css) { u.members.forEach(function (m) { m.el.style.removeProperty("font-size"); }); return; }
      u.members.forEach(function (m) {
        var fz = frozen && frozen[m.key];
        m.el.style.fontSize = (fz ? fz : memberPx(u, m, u.floor)) + "px";
      });
    });
    if (!frozen) {
      units.forEach(function (u) {
        if (u.css) return;
        var r = searchUnit(u, ctx);
        u.result = r;
        lone[u.key] = r.loneWord;
      });
    } else {
      /* a frozen headline that was wider than its preset width keeps the width it needed */
      units.forEach(function (u) {
        if (u.css) return;
        var bad = u.members.some(function (m) { return !ownOK(m, measure(m.el, ctx, parseFloat(m.el.style.fontSize) || u.max, m.words), ctx); });
        if (bad) widen(u);
      });
    }
    var stackBad = !stackOK(ctx);
    units.forEach(function (u) {
      collect(u, ctx, report, !!(stackBad && u.result && (u.result.stackLimited || u.result.overflow)), !!lone[u.key]);
    });
    report.ok = !Object.keys(report.slots).some(function (k) { return report.slots[k].status === "overflow"; });
    return report;
  }

  /** Fits one slot in the slide's current layout (the other slots stay as they are). */
  function fitSlot(slotEl, role, tokens) {
    var slideEl = slideOf(slotEl);
    if (!slideEl) throw new CS.CSError("E_USAGE", "fitSlot needs a slot inside a .cs-slide.");
    var ctx = makeCtx(slideEl, tokens), r = role || slotEl.getAttribute("data-role") || "body", rg = rangeFor(r, tokens);
    var key = slotEl.getAttribute("data-slot-key") || "";
    var member = { el: slotEl, key: key, ratio: 1, maxLines: parseInt(slotEl.getAttribute("data-max-lines"), 10) || DEFAULT_LINES[r] || 2, words: wordsOf(slotEl), hasWords: !!slotEl.querySelector(".w") };
    var u = { key: key, role: r, min: rg.min, max: rg.max, floor: slotFloor(slotEl, r, tokens), members: [member] };
    var res = searchUnit(u, ctx), report = { slots: {}, warnings: [] };
    collect(u, ctx, report, res.overflow || (res.stackLimited && !stackOK(ctx)), res.loneWord);
    return report.slots[key];
  }

  /* ---- lines ------------------------------------------------------------------------------------------------------- */

  function lineText(words) {
    var out = "";
    for (var i = 0; i < words.length; i++) {
      if (i) out += separator(words[i - 1], words[i]);
      out += words[i].textContent;
    }
    return out;
  }

  /** "" | " " | U+00A0: what separates two word units in the DOM (a number is bound to its noun with U+00A0). */
  function separator(a, b) {
    var rg = document.createRange();
    try { rg.setStartAfter(a); rg.setEndBefore(b); } catch (e) { return " "; }
    var t = rg.toString();
    if (t.indexOf("\u00A0") >= 0) return "\u00A0";
    return /[ \t\n\r\f]/.test(t) ? " " : "";
  }

  /** Physical lines of a slot, from the boxes of its words: [[word text]], one rect per line (slide coordinates), and the text of each line. */
  function measureLines(slotEl) {
    var slideEl = slideOf(slotEl), ctx = makeCtx(slideEl, null);
    var px = parseFloat(getComputedStyle(slotEl).fontSize) || 16, m = measure(slotEl, ctx, px);
    return {
      lines: m.lines.map(function (l) { return l.words.map(function (w) { return w.textContent; }); }),
      rects: m.lines.map(function (l) { return rel({ left: l.l, top: l.t, width: l.r - l.l, height: l.b - l.t }, ctx); }),
      text: m.lines.map(function (l) { return lineText(l.words); })
    };
  }

  function chainOf(w, root) {
    var chain = [], n = w.parentNode;
    while (n && n !== root) { chain.unshift(n); n = n.parentNode; }
    return chain;
  }

  /** Regroups the .w units of a slot into <span class="cs-ln"> blocks of the given sizes (counts of words per line). Wrappers (emphasis, LTR runs) are cloned per line. */
  function wrapLinesBy(slotEl, counts) {
    var all = Array.prototype.slice.call(slotEl.querySelectorAll(".w"));
    var total = counts.reduce(function (a, b) { return a + b; }, 0);
    if (!all.length || total !== all.length) return null;
      slotEl.querySelectorAll('[data-mark-target]:not([data-mark-id])').forEach(function(n,i){n.dataset.markId=slotEl.getAttribute('data-slot-key')+'-m'+i;});
    var slotName = slotEl.getAttribute("data-slot") || "";
    var chains = all.map(function (w) { return chainOf(w, slotEl); });
    var seps = all.map(function (w, i) { return i < all.length - 1 ? separator(w, all[i + 1]) : ""; });
    var frag = document.createDocumentFragment(), out = [], at = 0;
    counts.forEach(function (n, li) {
      var ln = document.createElement("span");
      ln.className = "cs-ln";
      ln.setAttribute("data-m", "ln"); ln.setAttribute("data-m-i", li); ln.setAttribute("data-m-slot", slotName);
      var open = [];
      for (var k = 0; k < n; k++, at++) {
        var chain = chains[at], common = 0;
        if (k > 0) {
          while (common < open.length && common < chain.length && open[common].orig === chain[common]) common++;
          open.length = common;
          var host = common ? open[common - 1].clone : ln;
          if (seps[at - 1]) host.appendChild(document.createTextNode(seps[at - 1]));
        } else open.length = 0;
        for (var d = common; d < chain.length; d++) {
          var c = chain[d].cloneNode(false);
          (d ? open[d - 1].clone : ln).appendChild(c);
          open[d] = { orig: chain[d], clone: c };
        }
        (chain.length ? open[chain.length - 1].clone : ln).appendChild(all[at]);
      }
      frag.appendChild(ln);
      out.push(ln);
    });
    slotEl.textContent = "";
    slotEl.appendChild(frag);
    return out;
  }

  /** Idempotent: groups the .w units of a slot into physical lines as they are laid out now. Used by motion and freeze. */
  function wrapLines(slotEl) {
    var existing = Array.prototype.filter.call(slotEl.children, function (c) { return c.classList && c.classList.contains("cs-ln"); });
    if (existing.length) return existing;
    var slideEl = slideOf(slotEl);
    if (!slideEl || !slotEl.querySelector(".w")) return [];
    var ctx = makeCtx(slideEl, null), px = parseFloat(getComputedStyle(slotEl).fontSize) || 16;
    var m = measure(slotEl, ctx, px);
    return wrapLinesBy(slotEl, m.lines.map(function (l) { return l.n; })) || [];
  }

  /** Settles frozen lines when Arabic shaping changes their measured width. */
  function settleLines(slideEl, tokens, report) {
    var ctx = makeCtx(slideEl, tokens);
    core.compose.slots(slideEl).forEach(function (s) {
      var el = s.el;
      if (el.getAttribute("data-fit") === "css" || !el.querySelector(".cs-ln")) return;
      var role = s.role || "body", floor = slotFloor(el, role, tokens);
      var px = parseFloat(el.style.fontSize) || 0, member = { el: el, maxLines: 99 }, start = px;
      if (!px) return;
      var mm = measure(el, ctx, px);
      while (!ownOK(member, mm, ctx) && px > floor) {
        px -= 1;
        el.style.fontSize = px + "px";
        mm = measure(el, ctx, px);
      }
      var rs = report && report.slots && report.slots[s.key];
      if (!rs) return;
      var bad = !ownOK(member, mm, ctx);
      if (px !== start) {
        rs.fontPx = Math.round(px);
        if (rs.status === "fit" && rs.fontPx < rs.minPx) rs.status = rs.fontPx <= floor ? "floor" : "shrunk";
      }
      if (bad && rs.status !== "overflow") {
        rs.status = "overflow";
        report.ok = false;
        report.warnings.push(M("النص في «" + s.key + "» لا يتسع في مكانه حتى بأصغر حجم مسموح (" + Math.round(px) + " بكسل).", "The text in " + s.key + " does not fit its place even at the smallest allowed size (" + Math.round(px) + " px)."));
      }
    });
  }

  core.fit = {
    fitSlide: fitSlide, fitSlot: fitSlot, measureLines: measureLines, wrapLines: wrapLines, floorPx: function (role, tokens) { return floorPx(role, tokens); },
    rangeFor: rangeFor, wrapLinesBy: wrapLinesBy, settleLines: settleLines
  };
})();
