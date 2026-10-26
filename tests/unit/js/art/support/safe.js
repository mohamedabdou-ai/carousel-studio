/* C1: painter-safety checker, rules A1-A17 and Arabic text rules. Loaded by harness.mjs.
 * window.__artSafe(root, { content: bool }) -> { ok, violations: [{ rule, node, msg }] }. `content` also checks A12 against the content box (114,125,852,1190).
 * Elements inside [data-sheet] (the captions of contact sheets) are skipped. A7 (logical coordinates), A8 (no clock) and A13 (settle marks) are not DOM facts:
 * kit.test.mjs scans the sources for A8 and mirrors a build for A7. */
(function () {
  var SVG = "http://www.w3.org/2000/svg", OK = {}, AR = /[؀-ۿ]/, LAT = /[A-Za-z0-9]/;
  "svg g path circle rect ellipse line polyline polygon defs linearGradient radialGradient stop clipPath use".split(" ").forEach(function (t) { OK[t] = 1; });

  function desc(el) {
    var s = el.localName + (el.id ? "#" + el.id : "") + (typeof el.className === "string" && el.className ? "." + el.className.split(" ")[0] : ""), p = el.parentNode, i = 0, q = el;
    while ((q = q.previousElementSibling)) i++;
    return s + "[" + i + "]" + (p && p.localName ? " in " + p.localName + (typeof p.className === "string" && p.className ? "." + p.className.split(" ")[0] : "") : "");
  }

  window.__artSafe = function (root, opts) {
    opts = opts || {};
    var V = [], all = [root].concat([].slice.call(root.querySelectorAll("*"))).filter(function (e) { return !e.closest("[data-sheet]"); });
    function add(rule, el, msg) { V.push({ rule: rule, node: desc(el), msg: msg }); }
    var seen = {}, rootRect = (root.closest(".cs-slide") || root).getBoundingClientRect();
    all.forEach(function (el) {
      var isSvg = el.namespaceURI === SVG, tag = el.localName, st = el.getAttribute("style") || "", cs;
      if (isSvg) {
        if (!OK[tag]) add("A1", el, "<" + tag + "> is not allowed in art svg");
        [].forEach.call(el.attributes, function (a) {
          var v = a.value;
          if (/var\(|color-mix\(/.test(v)) add("A2", el, a.name + " carries var() or color-mix()");
          if (/^(fill|stroke|stop-color)$/.test(a.name) && !/^(none|#[0-9a-f]{3}|#[0-9a-f]{6}|url\(#[^)]+\))$/i.test(v)) add("A2", el, a.name + "=" + v + " is not a resolved hex colour");
          if (a.name === "pathLength" && tag !== "path") add("A10", el, "pathLength on <" + tag + ">");
          if (a.name === "data-m" && !/^(media|decor-item|stroke|num)$/.test(v)) add("A10", el, "data-m=" + v);
          if (a.name === "href" && v.charAt(0) !== "#") add("A1", el, "external href " + v);
          if (a.name === "id") { if (seen[v]) add("A3", el, "duplicate id " + v); seen[v] = 1; if (!/^v[A-Za-z0-9_-]+-\d+$/.test(v)) add("A3", el, "id " + v + " is not v<slideId>-<n>"); }
        });
      } else {
        if (tag === "style" || tag === "script") add("A11", el, "<" + tag + "> inside art");
        if (tag === "img" || tag === "canvas") add("A1", el, "<" + tag + "> inside art");
      }
      if (/var\(|color-mix\(/.test(st)) add("A2", el, "inline style carries var() or color-mix()");
      if (/outline|border-image|background-clip|mask|filter|clip-path|conic|inset|backdrop|letter-spacing|text-justify|opacity/.test(st)) add("A6", el, "inline style: " + st);
      if (!isSvg) {
        cs = getComputedStyle(el);
        if (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0) add("A6", el, "outline");
        if (cs.borderImageSource !== "none") add("A6", el, "border-image");
        if (cs.boxShadow.indexOf("inset") >= 0) add("A6", el, "inset shadow");
        if (cs.backgroundImage.indexOf("conic") >= 0) add("A6", el, "conic gradient");
        if ((cs.maskImage && cs.maskImage !== "none") || (cs.webkitMaskImage && cs.webkitMaskImage !== "none")) add("A6", el, "mask");
        if (cs.filter !== "none" || (cs.backdropFilter && cs.backdropFilter !== "none")) add("A6", el, "filter");
        if (cs.clipPath !== "none") add("A6", el, "clip-path on html");
        if (cs.webkitBackgroundClip === "text" || cs.backgroundClip === "text") add("A6", el, "background-clip:text");
        if (cs.transform !== "none" && cs.display === "inline") add("A5", el, "transform on display:inline");
        var radius = [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomLeftRadius, cs.borderBottomRightRadius].some(function (v) { return parseFloat(v) > 0; });
        var border = [cs.borderTopWidth, cs.borderRightWidth, cs.borderBottomWidth, cs.borderLeftWidth].some(function (v) { return parseFloat(v) > 0; });
        if ((cs.overflowX === "hidden" || cs.overflowY === "hidden") && (radius || border)) add("A15", el, "overflow:hidden with radius or border");
        if (cs.display === "inline" && (cs.boxShadow !== "none" || radius && (cs.backgroundColor !== "rgba(0, 0, 0, 0)" || cs.backgroundImage !== "none"))) add("A16", el, "inline background with radius or shadow");
      }
      if (el.getAttribute("data-slot") === "art") {
        if (!/^\d+$/.test(el.getAttribute("data-index") || "")) add("A4", el, "art label without data-index");
        if (!/^(small|body|title|numeral|word|chip|chart|tool)$/.test(el.getAttribute("data-role") || "")) add("A4", el, "art label has an invalid role");
        if (!(Number(el.getAttribute("data-floor")) > 0)) add("A4", el, "art label without data-floor");
      }
      /* Arabic rules: the text-bearing element itself */
      var own = [].filter.call(el.childNodes, function (c) { return c.nodeType === 3 && AR.test(c.nodeValue); });
      if (own.length) {
        cs = getComputedStyle(el);
        if (cs.letterSpacing !== "normal" && parseFloat(cs.letterSpacing) !== 0) add("AR", el, "letter-spacing on Arabic");
        if (cs.fontStyle !== "normal") add("AR", el, "italic Arabic");
        if (cs.textAlign === "justify") add("AR", el, "justified Arabic");
        for (var q = el; q && q !== root.parentNode; q = q.parentElement) if (getComputedStyle(q).opacity !== "1") { add("AR", el, "opacity on Arabic (" + desc(q) + ")"); break; }
      }
      var label = el.closest("[data-slot='art']"), isolation = el.closest("bdi");
      /* LTR labels leave Latin/digits bare and isolate Arabic instead. An explicit
         bdi must still isolate a Latin run as LTR, even on an LTR label base. */
      if (label && AR.test(label.textContent) && LAT.test([].map.call(el.childNodes, function (c) { return c.nodeType === 3 ? c.nodeValue : ""; }).join("")) &&
          (isolation ? isolation.getAttribute("dir") !== "ltr" : getComputedStyle(label).direction !== "ltr")) add("AR", el, "a Latin or digit run needs an LTR base or <bdi dir=ltr>");
    });
    /* A slide wins over cells inside it. Contact sheets budget each cell separately.
       Subtree checks still include all independent layers of the containing scope. */
    var cellSelector = ".cell,[data-budget]", budgetRoot = root.closest(".cs-slide") || root.closest(cellSelector) || root;
    var budgets = new Map(), encoder = new TextEncoder();
    [budgetRoot].concat([].slice.call(budgetRoot.querySelectorAll("*"))).forEach(function (e) {
      if (e.namespaceURI !== SVG || e.closest("[data-sheet]")) return;
      var scope = e.closest(".cs-slide") || e.closest(cellSelector) || budgetRoot;
      var b = budgets.get(scope) || { count: 0, bytes: 0 };
      b.count++;
      var attr = e.localName === "path" ? "d" : /^(polyline|polygon)$/.test(e.localName) ? "points" : null;
      if (attr) b.bytes += encoder.encode(e.getAttribute(attr) || "").length;
      budgets.set(scope, b);
    });
    budgets.forEach(function (b, scope) {
      if (b.count > 800) add("A9", scope, b.count + " svg elements per slide/cell (> 800)");
      if (b.bytes > 24000) add("A9", scope, b.bytes + " path bytes per slide/cell (> 24000)");
    });
    /* Per svg: references stay local; icons are path-only. */
    all.filter(function (e) { return e.localName === "svg"; }).forEach(function (svg) {
      if (svg.closest("[data-sheet]")) return;
      var refs = [], paths = 0, count = svg.querySelectorAll("*").length;
      [svg].concat([].slice.call(svg.querySelectorAll("*"))).forEach(function (e) {
        [].forEach.call(e.attributes, function (a) { var m = /url\(#([^)]+)\)/.exec(a.value); if (m) refs.push(m[1]); if (a.name === "href" && a.value.charAt(0) === "#") refs.push(a.value.slice(1)); });
        if (e.localName === "path") paths += (e.getAttribute("d") || "").length;
      });
      refs.forEach(function (id) { if (!svg.querySelector("[id='" + id + "']")) add("A3", svg, "reference #" + id + " has no target inside its own svg"); });
      if (svg.classList.contains("cs-icon")) [].forEach.call(svg.querySelectorAll("*"), function (e) { if (e.localName !== "path" && e.localName !== "g") add("A14", e, "<" + e.localName + "> in an icon (path-only)"); });
    });
    /* A17: slide rules overriding named text roles must survive the painter's later role sheet.
       Test role/preset/type/variant selectors; generic structural CSS is not a role override. */
    function selectors(s) {
      var out = [], start = 0, depth = 0, quote = "";
      for (var i = 0; i < s.length; i++) {
        var ch = s[i]; if (ch === "\\") { i++; continue; }
        if (quote) { if (ch === quote) quote = ""; continue; }
        if (ch === '"' || ch === "'") { quote = ch; continue; }
        if (ch === "(" || ch === "[") depth++; else if (ch === ")" || ch === "]") depth--;
        else if (ch === "," && !depth) { out.push(s.slice(start, i)); start = i + 1; }
      }
      out.push(s.slice(start)); return out;
    }
    function specificity(s) {
      var a = 0, b = 0, m;
      while ((m = /:(where|is|not|has)\(/.exec(s))) {
        var end = m.index + m[0].length, depth = 1, begin = end;
        while (end < s.length && depth) { if (s[end] === "(") depth++; else if (s[end] === ")") depth--; end++; }
        if (m[1] !== "where") {
          var best = [0, 0]; selectors(s.slice(begin, end - 1)).forEach(function (v) { var p = specificity(v); if (p[0] > best[0] || p[0] === best[0] && p[1] > best[1]) best = p; });
          a += best[0]; b += best[1];
        }
        s = s.slice(0, m.index) + s.slice(end);
      }
      s = s.replace(/::[\w-]+/g, "").replace(/\[[^\]]*\]/g, function () { b++; return ""; });
      return [a + (s.match(/#[\w-]+/g) || []).length, b + (s.match(/\.[\w-]+|:(?!:)[\w-]+/g) || []).length];
    }
    function checkRules(rules) {
      [].forEach.call(rules, function (r) {
        if (r.cssRules && !r.selectorText) { checkRules(r.cssRules); return; }
        if (!r.selectorText || !/font-size|font-weight|line-height|color|font-family/.test(r.style.cssText)) return;
        selectors(r.selectorText).forEach(function (sel) {
          if (!/\[data-(?:role|preset|type|variant)[=\]]/.test(sel)) return;
          var sp = specificity(sel); if (sp[0] || sp[1] >= 3) return;
          all.forEach(function (e) { if (e.hasAttribute("data-role") && e.matches(sel)) add("A17", e, "role override below (0,3,0): " + sel); });
        });
      });
    }
    [].forEach.call(document.querySelectorAll("style[data-cs-slide-css],style[data-cs-decor],style#cs-archetype-css"), function (s) { if (s.sheet) checkRules(s.sheet.cssRules); });
    if (opts.content) {
      var B = { l: 114, t: 125, r: 966, b: 1315 };
      [].forEach.call(root.querySelectorAll(".cs-art, .cs-art *"), function (e) {
        if (e.closest("[data-bleed],[data-seam]") || e.closest("[data-sheet]")) return;
        var r = e.getBoundingClientRect(), x = r.left - rootRect.left, y = r.top - rootRect.top, over = e.closest("[data-treatment='sticker']") ? 30 : 0;
        if (!r.width || !r.height || e.localName === "path" || e.localName === "g") return;
        if (x < B.l - over - 0.5 || y < B.t - over - 0.5 || x + r.width > B.r + over + 0.5 || y + r.height > B.b + over + 0.5) add("A12", e, "leaves the content box: " + [x, y, r.width, r.height].map(Math.round).join(","));
      });
    }
    return { ok: !V.length, violations: V };
  };
})();
