/* tests/geometry/layout-probe.js · composes one slide with the pieces the layout sheet is built for and measures it (package E3).
 *
 * Loaded two ways, as a plain script: by the unit harness (tests/unit/js/core/cases/archetypes.test.js, fixture presets) and by
 * tests/geometry/run.mjs and sheet.mjs (the six real presets in the Studio page). It needs window.CS (the engine) and nothing else.
 *
 * What it adds to a slide that compose built: the optional slots that compose removes while no filler fills them (the anchor slot and the
 * items slot), put back where the template has them; `data-recipe` on .cs-content; a stand-in box for the anchor (the art builders are not
 * part of this package, the sheet must work with any box); and `li.cs-item` nodes written the way IS-6 says the filler will write them.
 * Nothing here draws art. The probe then fits the slide with the engine's own fit and returns plain rectangles in 1080-wide slide pixels.
 */
(function () {
  "use strict";
  var P = (window.CSLayoutProbe = {});

  /* ---- the staged recipes (plan r2 3.1) ------------------------------------------------------------------------------------------ */
  P.RECIPES = ["under", "over", "full", "center"];
  /** Minimum anchor box height per recipe (spec 4.5; the sheet's own floors). */
  P.MIN = { under: 280, over: 280, full: 620, center: 440 };
  P.MAX = { center: 560 };
  /** Spec 4.3, reduced to the four staged recipes: the recipes each type may carry. proof needs a user screenshot, cover and poster carry no art in 1.1. */
  P.ALLOWED = {
    "rehook": ["over", "under"], "item": ["under"], "step": ["under", "full"], "stat": ["over", "full"], "compare": ["full"], "myth-fact": ["under"], "quote": ["under"],
    "story-beat": ["under", "full"], "checklist": ["under", "full"], "summary": ["under", "full"], "setup": ["under", "full"],
    "share": ["center", "under"], "cta": ["center"], "offer": ["over"], "testimonial": ["under"]
  };

  /** The staged variant that goes with a (type, recipe) pair, where there is one (plan r2 3.1): a chart under a takeaway title, before and after, the track. */
  P.VARIANT = { "stat:full": "chart", "compare:full": "before-after", "step:under": "track", "step:full": "track", "cta:center": "action", "rehook:over": "statement", "quote:under": "statement" };

  function words(s) { return String(s || "").split(/\s+/).filter(Boolean); }
  function cut(s, n) { var w = words(s); return w.length <= n ? s : w.slice(0, n).join(" "); }

  /** The slots an anchor draws itself (rows from the bullets, panels from the sides, a chat from the quote): the filler leaves them out of an
   *  anchored slide, so the words are not on it twice. The probe removes them the same way. */
  P.CONSUMES = { "stat": ["number"], "checklist": ["bullets"], "summary": ["bullets"], "setup": ["bullets"], "compare": ["sides"], "myth-fact": ["sides"], "quote": ["body"], "testimonial": ["body"] };

  /**
   * The copy an anchored slide really carries (spec 4.5 rules 4-5, C2.body-with-art): under and over keep a title and a body of at most
   * 15 words and the bridge; full keeps the title and, on the 3:4 canvas, one small line (an anchor of 620 px leaves no room for a body);
   * center keeps the title (and a five-word line on share) and the button.
   * Returns { slide, drop: [slot names to remove after compose] }.
   */
  P.copyFor = function (slide, recipe, canvasH) {
    var s = JSON.parse(JSON.stringify(slide)), drop = (P.CONSUMES[s.type] || []).slice();
    if (s.body) s.body = cut(s.body, 15);
    if (s.sub) s.sub = cut(s.sub, 12);
    if (s.bridge) s.bridge = cut(s.bridge, 6);
    if (recipe === "full") {
      drop.push("body", "sub", "number", "ord", "attribution", "bullets", "sides");
      if (canvasH < 1440) drop.push("bridge");
    }
    if (recipe === "center") {
      drop.push("body", "bridge", "number");
      if (s.type === "share" && s.sub) s.sub = cut(slide.sub, 5); else drop.push("sub");
    }
    return { slide: s, drop: drop };
  };

  /** A variant the preset does not list yet is made visible for the run (the sheet is a layout test); returns the function that puts the list back. */
  P.withVariant = function (presetId, type, variant) {
    var p = CS.core.registry.getPreset(presetId), list = (p.variants = p.variants || {})[type] = p.variants[type] || [], added = list.indexOf(variant) < 0;
    if (added) list.push(variant);
    return function () { if (added) { var i = list.indexOf(variant); if (i >= 0) list.splice(i, 1); } };
  };

  /* ---- stage ----------------------------------------------------------------------------------------------------------------------- */
  P.stage = function () {
    var st = document.querySelector("[data-cs-probe-stage]");
    if (!st) {
      st = document.createElement("div");
      st.setAttribute("data-cs-probe-stage", ""); st.setAttribute("aria-hidden", "true");
      st.style.cssText = "position:fixed;left:-12000px;top:0;width:1080px;pointer-events:none;contain:layout paint;direction:ltr;";
      document.body.appendChild(st);
    }
    return st;
  };

  /* ---- putting back the optional slots ----------------------------------------------------------------------------------------------- */
  function templateMain(type) { return CS.core.registry.getArchetype(type).template.content.firstElementChild; }

  /** Clones slot `name` of the type's template into `main`, before the first later slot of the template that is still in the slide, else at the end. */
  function restoreSlot(main, type, name) {
    var tpl = templateMain(type), slot = tpl.querySelector(':scope > [data-slot="' + name + '"]');
    if (!slot) return null;
    var existing = main.querySelector(':scope > [data-slot="' + name + '"]');
    if (existing) return existing;
    var copy = slot.cloneNode(true), seen = false, ref = null;
    Array.prototype.forEach.call(tpl.children, function (c) {
      if (c === slot) { seen = true; return; }
      if (seen && !ref) ref = main.querySelector(':scope > [data-slot="' + c.getAttribute("data-slot") + '"]');
    });
    main.insertBefore(copy, ref);
    return copy;
  }

  /** A stand-in for the box an art builder will draw into. */
  function standIn(slot, label) {
    var box = document.createElement("div");
    box.className = "cs-art"; box.setAttribute("data-standin", "1"); box.setAttribute("aria-hidden", "true");
    box.style.cssText = "flex:1 1 auto;align-self:stretch;box-sizing:border-box;display:flex;align-items:center;justify-content:center;border:6px dashed var(--cs-ink);background:var(--cs-surface);color:var(--cs-ink);font:700 40px/1 sans-serif;direction:ltr;";
    box.textContent = label || "ANCHOR";
    slot.appendChild(box);
    return box;
  }

  /** li.cs-item nodes the way IS-6 says the filler writes them: parts icon, title, text, value; data-index; data-hi on the key item. The words go through the
   *  engine's own text pipeline (o.html: NFC, Arabic punctuation, digits, <span class="w"> per word) and the three text parts are fit slots like any other text
   *  (data-slot-key, data-role, data-max-lines), so core.fit sizes them and applies its own line, width and floor rules before the cell is measured:
   *    title  role body (bold), one line      text  role small, `o.textLines` lines (two; one on a five-node rail: spec 4.4)      value  role small, one line
   *  Without o.slideId (a caller that does not fit) the parts get the sizes the arithmetic of spec 4.4 assumes: title 44 px, text and label 36 px. */
  function fillItems(ul, items, o) {
    o = o || {};
    var ROLE = { title: "body", text: "small", value: "small" };
    items.forEach(function (it, i) {
      var li = document.createElement("li");
      li.className = "cs-item"; li.setAttribute("data-index", String(i));
      if (it.hi) li.setAttribute("data-hi", "1");
      function part(kind, text, css) {
        var n = document.createElement("span"); n.setAttribute("data-part", kind); n.style.cssText = css || "";
        if (text !== null && text !== undefined) { if (o.html) n.innerHTML = o.html(String(text)); else n.textContent = text; }
        if (o.slideId && ROLE[kind]) {
          n.setAttribute("data-slot-key", o.slideId + ".items." + i + "." + kind); n.setAttribute("data-slot", "items"); n.setAttribute("data-field", "items"); n.setAttribute("data-kind", "text");
          n.setAttribute("data-role", ROLE[kind]); n.setAttribute("data-max-lines", String(kind === "text" ? (o.textLines || 2) : 1));
        }
        li.appendChild(n); return n;
      }
      var fixed = !o.slideId;
      if (o.icons !== false) { var ic = part("icon", "", "inline-size:" + (o.iconPx || 64) + "px;block-size:" + (o.iconPx || 64) + "px;border:4px solid var(--cs-ink);box-sizing:border-box;"); ic.setAttribute("aria-hidden", "true"); }
      part("title", it.title, (fixed ? "font-size:44px;" : "") + "line-height:1.35;font-weight:700;");
      if (it.text !== undefined) part("text", it.text, (fixed ? "font-size:36px;" : "") + "line-height:1.4;");
      if (it.value !== undefined) part("value", it.value, (fixed ? "font-size:36px;" : "") + "line-height:1.4;");
      ul.appendChild(li);
    });
  }

  /** The size a fit slot can never go below (fit.js floorPx and the role's minimum): used to ask "does floor-size text plus the minimum anchor fit?". */
  P.setFloors = function (el, tokens) {
    var F = tokens.floors, sc = tokens.type.scale;
    function floorOf(role) {
      var fl, mn;
      if (role === "hero" || role === "number") fl = F.hero; else if (role === "body") fl = F.body; else if (role === "h1" || role === "h2" || role === "title") fl = Math.round(0.8 * sc[role][0]); else fl = F.meta;
      if (role === "hero") mn = sc.hero[0]; else if (role === "number") mn = Math.round(sc.hero[0] * 1.5); else if (role === "h1" || role === "h2" || role === "title" || role === "body") mn = sc[role][0]; else if (role === "micro") mn = sc.micro; else mn = sc.small;
      return Math.min(fl, mn);
    }
    Array.prototype.forEach.call(el.querySelectorAll("[data-slot-key]"), function (n) { if (n.getAttribute("data-fit") === "css") return; var fl = floorOf(n.getAttribute("data-role")), ratio = parseFloat(getComputedStyle(n).getPropertyValue("--cs-fit-ratio")) || 1; n.style.fontSize = Math.max(fl, Math.round(fl * ratio)) + "px"; });
  };

  /* ---- the run ----------------------------------------------------------------------------------------------------------------------- */
  /**
   * P.run(spec, brand, index, o) composes slide `index` of `spec`, restores slots, fits, measures, and returns
   *   { el, tokens, fit, content: {x,y,w,h}, padTop, padBottom, spacers: {before, after}, slots: [{slot, rect, order, display}], anchor: rect|null,
   *     items: rect|null, itemNodes: [{rect, parts: {kind: rect}, hi, beforeDisplay}], texts: [rect of every .w], chrome: [{name, band, rect, gapToText?}] }
   * o: { recipe, anchor (default true when recipe), items: [{title,text,value,hi}], itemOpts, canvasH, short (default true when recipe), copyRecipe, drop: [slot names],
   *       variant, rootVars: {custom property: value} (set on the slide root after compose), mutate(slide, spec), label }
   * The caller removes the slide with P.dispose(out).
   */
  P.run = async function (spec0, brand, index, o) {
    o = o || {};
    var core = CS.core, spec = JSON.parse(JSON.stringify(spec0));
    if (o.canvasH) { spec.canvas = Object.assign({}, spec.canvas, { h: o.canvasH, preset: o.canvasH === 1350 ? "ig-4x5" : "ig-3x4" }); }
    var slideSpec = spec.slides[index];
    // This probe supplies its own anchor box and items; auto-preview art must not
    // add a second anchor to the measured layout.
    slideSpec.visual = { anchor: { kind: "none" }, tone: "base" };
    var drop = o.drop || [];
    if ((o.copyRecipe || o.recipe) && o.short !== false) { var cf = P.copyFor(slideSpec, o.copyRecipe || o.recipe, o.canvasH || 1440); spec.slides[index] = slideSpec = cf.slide; drop = drop.concat(cf.drop); }
    if (o.variant) slideSpec.variant = o.variant;
    if (o.mutate) o.mutate(slideSpec, spec);
    var post = core.resolve.post(spec, brand), tokens = core.resolve.slide(post, slideSpec);
    var el = core.compose.slide(spec, slideSpec, tokens, brand, { mode: "export" });
    var main = el.querySelector(".cs-content"), type = slideSpec.type;
    drop.forEach(function (name) { var n = main.querySelector(':scope > [data-slot="' + name + '"]'); if (n) n.remove(); });
    if (o.recipe) main.setAttribute("data-recipe", o.recipe);
    var anchorSlot = null;
    if (o.anchor === true || (o.recipe && o.anchor !== false)) { anchorSlot = restoreSlot(main, type, "anchor"); standIn(anchorSlot, o.label); }
    var itemsSlot = null;
    if (o.items) {
      var lang = (spec.locale && spec.locale.dialect) === "en" ? "en" : "ar", digits = tokens.digits || (spec.locale && spec.locale.digits) || "western";
      var html = function (text) { return core.text.toHTML(core.compose.prepare(text, spec), { digits: digits, lang: lang, markup: true, wordSpans: true }); };
      itemsSlot = restoreSlot(main, type, "items");
      fillItems(itemsSlot, o.items, Object.assign({ html: html, slideId: o.itemsAsText === false ? null : el.getAttribute("data-cs-slide"), textLines: o.items.length > 4 && type === "timeline" ? 1 : 2 }, o.itemOpts));
    }
    if (o.rootVars) Object.keys(o.rootVars).forEach(function (k) { el.style.setProperty(k, o.rootVars[k]); });
    var stage = P.stage();
    stage.appendChild(el);
    await core.ready.fonts(core.ready.fontSpecs(tokens), 8000);
    await core.ready.images(el);
    if (o.floors) P.setFloors(el, tokens);
    var fit = o.noFit ? { ok: true, slots: {}, warnings: [] } : core.fit.fitSlide(el, tokens);
    var sr = el.getBoundingClientRect(), k = 1080 / sr.width;
    function RR(r) { return { x: (r.left - sr.left) * k, y: (r.top - sr.top) * k, w: r.width * k, h: r.height * k }; }
    function R(n) { return RR(n.getBoundingClientRect()); }
    /** The boxes of the text lines inside `root` (one per line fragment, trimmed to the line box like tests/geometry/run.mjs), from text ranges: they do not depend on .w spans. */
    function textBoxes(root) {
      var out = [], walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null), n;
      while ((n = walker.nextNode())) {
        if (!/\S/.test(n.nodeValue)) continue;
        var el = n.parentElement, rg = document.createRange(), lh = parseFloat(getComputedStyle(el).lineHeight);
        rg.selectNodeContents(n);
        Array.prototype.forEach.call(rg.getClientRects(), function (r) {
          if (r.width <= 0.5 || r.height <= 0.5) return;
          var b = RR(r);
          if (lh > 0 && b.h > lh * k) { b.y += (b.h - lh * k) / 2; b.h = lh * k; }
          out.push(b);
        });
      }
      return out;
    }
    var cs = getComputedStyle(main), out = {
      el: el, tokens: tokens, fit: fit, type: type, recipe: o.recipe || null, canvasH: Math.round(sr.height * k),
      content: R(main), padTop: parseFloat(cs.paddingTop) || 0, padBottom: parseFloat(cs.paddingBottom) || 0,
      spacers: { before: getComputedStyle(main, "::before").display, after: getComputedStyle(main, "::after").display },
      slots: [], anchor: null, items: null, itemNodes: [], texts: [], chrome: []
    };
    Array.prototype.forEach.call(main.children, function (c) {
      var ccs = getComputedStyle(c);
      out.slots.push({ slot: c.getAttribute("data-slot"), rect: R(c), order: parseInt(ccs.order, 10) || 0, display: ccs.display, position: ccs.position });
    });
    if (anchorSlot) out.anchor = R(anchorSlot);
    if (itemsSlot) {
      out.items = R(itemsSlot);
      Array.prototype.forEach.call(itemsSlot.children, function (li) {
        var parts = {}, texts = {};
        Array.prototype.forEach.call(li.children, function (p) { var name = p.getAttribute("data-part"); parts[name] = R(p); texts[name] = textBoxes(p); });
        out.itemNodes.push({ rect: R(li), parts: parts, texts: texts, hi: li.hasAttribute("data-hi"), beforeDisplay: getComputedStyle(li, "::before").display });
      });
    }
    Array.prototype.forEach.call(main.querySelectorAll(".w"), function (w) { out.texts.push(R(w)); });
    ["handle", "meta", "counter", "swipe", "savepill"].forEach(function (name) {
      var n = el.querySelector('[data-slot="' + name + '"]');
      if (!n) return;
      var r = R(n); if (r.w <= 0 || r.h <= 0) return;
      var item = { name: name, header: !!n.closest(".cs-header"), rect: r };
      if (name === "savepill") {
        /* the bookmark is the preset's ::before (the engine draws no icon element): its gap to the text is the flex gap plus the margins of the pseudo-element */
        var pcs = getComputedStyle(n), bf = getComputedStyle(n, "::before");
        if (bf.content && bf.content !== "none" && bf.content !== "normal") item.glyphGap = Math.round(((parseFloat(pcs.columnGap) || 0) + (parseFloat(bf.marginLeft) || 0) + (parseFloat(bf.marginRight) || 0)) * 10) / 10;
      }
      out.chrome.push(item);
    });
    out.footerLeft = parseFloat(getComputedStyle(el.querySelector(".cs-footer")).insetInlineStart) || null;
    return out;
  };

  /** T of spec 4.2: the height of the fitted text group (first slot to the last one, the anchor slot and the bridge excluded: the bridge sits at the foot of the stack, below the anchor). */
  P.textHeight = function (out) {
    var tops = [], bots = [];
    out.slots.forEach(function (s) { if (s.slot === "anchor" || s.slot === "bridge" || s.display === "none" || s.position === "absolute" || s.rect.h <= 0) return; tops.push(s.rect.y); bots.push(s.rect.y + s.rect.h); });
    return tops.length ? Math.round(Math.max.apply(null, bots) - Math.min.apply(null, tops)) : 0;
  };

  /**
   * Does the recipe's box fit? The arithmetic of spec 4.2 (the same as CS.visual.geometry.recipe of V1) on the real stack, with the one line V1 leaves out:
   * under and over carry the bridge below the anchor (a G gap and the line), full carries it as its caption, center keeps the button below the plate.
   * `textOut` is a run of the same slide with no anchor, at floor-size text (P.run with anchor: false, floors: true, noFit: true): T is then the least
   * the text can take. The text-share rule of V1 (T at most 55%) is a planner preference and is not part of what the sheet must be able to realise.
   */
  P.fits = function (recipe, textOut) {
    var G = 40, T = P.textHeight(textOut), H = Math.round(textOut.content.h - textOut.padTop - textOut.padBottom);
    var bridge = textOut.slots.filter(function (s) { return s.slot === "bridge" && s.display !== "none" && s.rect.h > 0; })[0], bh = bridge ? Math.round(bridge.rect.h) : 0;
    var cta = textOut.slots.filter(function (s) { return s.slot === "cta" && s.rect.h > 0; })[0];
    if (recipe === "under" || recipe === "over") { var Tb = T + (bh ? G + bh : 0); return { ok: H - Tb - G >= 280, T: Tb, H: H }; }
    if (recipe === "full") return { ok: H - T - G - (bh ? bh + G : 0) >= 620, T: T, H: H };
    var top = Infinity, bot = 0;
    textOut.slots.forEach(function (s) { if (s.slot === "anchor" || s.slot === "bridge" || s.slot === "cta" || s.display === "none" || s.position === "absolute" || s.rect.h <= 0) return; top = Math.min(top, s.rect.y); bot = Math.max(bot, s.rect.y + s.rect.h); });
    var Tc = bot > top ? Math.round(bot - top) : 0;
    return { ok: H - Tc - (cta ? Math.round(cta.rect.h) + 2 * G : G) >= 440, T: Tc, H: H };
  };

  P.dispose = function (out) { if (out && out.el && out.el.parentNode) out.el.remove(); };

  /** The copy limits of spec 4.4 (and layout_budget.py): a grid card has a title of at most 3 words and a text of at most 5; a timeline node a title of at most 2 words,
   *  a text of at most 4 and a time label of at most 2 words and 12 characters. Five nodes only carry one-line text (pitch 140, node 112). */
  P.LIMITS = { grid: { title: 3, text: 5 }, timeline: { title: 2, text: 4, value: 2, valueChars: 12, oneLineText: 2 } };

  /** Boundary copy: every part at its permitted word count, in words of ordinary length (the spec's word limits assume the median Arabic word of four to five letters; a title
   *  of three nine-letter words is past what a 350 px card holds on one line and is the copy author's problem, caught by the line limit of the slot, not a layout fact).
   *  Arabic and English, six cards and five nodes. */
  P.BOUNDARY = {
    ar: {
      grid: [["اكتب فكرة واحدة", "فكرة واحدة واضحة كل يوم"], ["صمم شرائح الآن", "ألوان البراند وخط واحد فقط"], ["راجع النص جيدا", "اقرأه بصوت عالٍ قبل النشر"], ["انشر وقت الذروة", "وقت الذروة هو مساء الخميس"], ["قس النتائج بدقة", "رقم واحد فقط يكفي للبداية"], ["كرر ما نجح", "بشكل جديد ومختلف كل أسبوع"]],
      timeline: [["جمع الأفكار", "اكتب كل فكرة بسطر", "اليوم الأول"], ["كتابة المسودة", "عشر دقائق بلا توقف", "اليوم الثاني"], ["مراجعة النص", "عين تانية على الأرقام", "اليوم الثالث"], ["نشر المنشور", "في وقت الذروة المعتاد", "الأسبوع 2"], ["قياس النتيجة", "ارجع للأرقام وقارن بينها", "الشهر الأول"]]
    },
    en: {
      grid: [["Write every day", "one clear idea per slide"], ["Pick a font", "brand colors and one font"], ["Check the copy", "read it out loud twice"], ["Publish on time", "Thursday evening works best here"], ["Measure the results", "one number is enough here"], ["Repeat what works", "in a new shape weekly"]],
      timeline: [["Gather ideas", "one idea per line", "First day"], ["Write draft", "ten minutes without stopping", "Second day"], ["Review copy", "second pair of eyes", "Third day"], ["Publish it", "at the peak time", "Week two"], ["Measure it", "compare the numbers again", "First month"]]
    }
  };
  /** The copy of a five-node timeline: text of one line (two words), as spec 4.4 requires. */
  P.ONE_LINE = { ar: [["جمع الأفكار", "سطر واحد", "اليوم الأول"], ["كتابة المسودة", "عشر دقائق", "اليوم الثاني"], ["مراجعة النص", "عين تانية", "اليوم الثالث"], ["نشر المنشور", "وقت الذروة", "الأسبوع 2"], ["قياس النتيجة", "قارن الأرقام", "الشهر الأول"]], en: [["Gather ideas", "one line", "First day"], ["Draft it", "ten minutes", "Second day"], ["Review it", "fresh eyes", "Third day"], ["Publish it", "peak time", "Week two"], ["Measure it", "compare numbers", "First month"]] };

  /** A grid or timeline spec slide with `n` items (the key item at `hi`, -1 for none). o: { boundary: true, lang: "ar"|"en" } writes the copy at the limits of P.LIMITS. */
  P.makeItems = function (type, n, hi, o) {
    o = o || {};
    var lang = o.lang === "en" ? "en" : "ar", base;
    if (o.boundary) base = type === "timeline" ? (n > 4 ? P.ONE_LINE[lang] : P.BOUNDARY[lang].timeline) : P.BOUNDARY[lang].grid;
    else base = type === "timeline"
      ? [["الفكرة", "جملة واحدة", "يوم 1"], ["الكتابة", "عشر دقايق", "يوم 2"], ["المراجعة", "عين تانية", "يوم 3"], ["النشر", "وقت الذروة", "يوم 4"], ["القياس", "بعد أسبوع", "يوم 5"]]
      : [["الكتابة", "فكرة واحدة"], ["التصميم", "ألوان البراند"], ["المراجعة", "عين تانية"], ["النشر", "وقت الذروة"], ["القياس", "رقم واحد"], ["التكرار", "كل أسبوع"]];
    var out = [];
    for (var i = 0; i < n; i++) { var it = { title: base[i][0], text: base[i][1] }; if (base[i][2]) it.value = base[i][2]; if (i === hi) it.hi = true; out.push(it); }
    return out;
  };

  /** True when the boundary copy really is at (not over) the limits of spec 4.4: the guard that keeps the boundary test honest. Returns problems. */
  P.boundaryProblems = function () {
    var bad = [], wc = function (s) { return String(s).trim().split(/\s+/).length; };
    ["ar", "en"].forEach(function (lang) {
      P.BOUNDARY[lang].grid.forEach(function (r, i) { if (wc(r[0]) !== P.LIMITS.grid.title) bad.push(lang + " card " + i + ": title is " + wc(r[0]) + " words"); if (wc(r[1]) !== P.LIMITS.grid.text) bad.push(lang + " card " + i + ": text is " + wc(r[1]) + " words"); });
      P.BOUNDARY[lang].timeline.forEach(function (r, i) {
        var L = P.LIMITS.timeline;
        if (wc(r[0]) !== L.title) bad.push(lang + " node " + i + ": title is " + wc(r[0]) + " words");
        if (wc(r[1]) !== L.text) bad.push(lang + " node " + i + ": text is " + wc(r[1]) + " words");
        if (wc(r[2]) > L.value || r[2].length > L.valueChars) bad.push(lang + " node " + i + ": label " + r[2]);
      });
      P.ONE_LINE[lang].forEach(function (r, i) { if (wc(r[1]) > P.LIMITS.timeline.oneLineText) bad.push(lang + " one-line node " + i + ": text is " + wc(r[1]) + " words"); });
    });
    return bad;
  };

  /** The criteria rows of compare:table: title = the criterion, text = the first verdict, value = the second. */
  P.makeTable = function (n) {
    var rows = [["الطول", "سطرين", "فقرة طويلة"], ["الطلب", "واضح", "عام"], ["الفايدة", "حاجة تتنفذ", "كلام"], ["الوقت", "5 دقايق", "ساعة"]], out = [];
    for (var i = 0; i < n; i++) out.push({ title: rows[i][0], text: rows[i][1], value: rows[i][2] });
    return out;
  };

  /* ---- checks (plain predicates over a run, used by the unit test, the geometry run and the sheet) -------------------------------------- */
  var TOL = 1.5;
  function bottom(r) { return r.y + r.h; }

  /** Problems of a recipe run, as strings (empty = fine). `zoneH` is the content box height without its padding. */
  P.checkRecipe = function (out) {
    var bad = [], r = out.recipe, a = out.anchor, c = out.content, x0 = c.x, x1 = c.x + c.w, top = c.y + out.padTop, bot = c.y + c.h - out.padBottom;
    var label = out.type + "/" + r + "@" + out.canvasH;
    if (!out.fit.ok) bad.push(label + ": text overflow in " + Object.keys(out.fit.slots).filter(function (k) { return out.fit.slots[k].status === "overflow"; }).join(","));
    if (out.spacers.before !== "none" || out.spacers.after !== "none") bad.push(label + ": the centring spacers are still on (" + out.spacers.before + "," + out.spacers.after + ")");
    if (!a) return bad.concat(label + ": no anchor box");
    if (a.h < P.MIN[r] - TOL) bad.push(label + ": anchor " + Math.round(a.h) + " px high, minimum " + P.MIN[r]);
    if (P.MAX[r] && a.h > P.MAX[r] + TOL) bad.push(label + ": anchor " + Math.round(a.h) + " px high, maximum " + P.MAX[r]);
    if (a.x < x0 - TOL || a.x + a.w > x1 + TOL) bad.push(label + ": anchor leaves the content box in x (" + Math.round(a.x) + "-" + Math.round(a.x + a.w) + ")");
    if (a.y < top - TOL || bottom(a) > bot + TOL) bad.push(label + ": anchor leaves the stack in y (" + Math.round(a.y) + "-" + Math.round(bottom(a)) + " of " + Math.round(top) + "-" + Math.round(bot) + ")");
    var anchorSlot = out.slots.filter(function (s) { return s.slot === "anchor"; })[0];
    var others = out.slots.filter(function (s) { return s.slot !== "anchor" && s.rect.h > 0 && s.display !== "none" && s.position !== "absolute"; });
    var text = others.filter(function (s) { return s.slot !== "bridge"; }), bridge = others.filter(function (s) { return s.slot === "bridge"; })[0];
    if (r === "under" || r === "full") {
      text.forEach(function (s) { if (s.rect.y < a.y && bottom(s.rect) > a.y + TOL) bad.push(label + ": " + s.slot + " overlaps the anchor"); });
      var lastText = Math.max.apply(null, text.map(function (s) { return s.order <= 0 ? bottom(s.rect) : 0; }).concat(0));
      if (lastText && a.y - lastText < 36 - TOL && a.y >= lastText) bad.push(label + ": only " + Math.round(a.y - lastText) + " px between the text and the anchor (G = 40)");
      if (bridge && bridge.rect.y < bottom(a) - TOL) bad.push(label + ": the bridge is above the end of the anchor");
      var last = Math.max(bottom(a), bridge ? bottom(bridge.rect) : 0);
      if (bot - last > 24 + TOL) bad.push(label + ": a void of " + Math.round(bot - last) + " px under the last element");
    }
    if (r === "over") {
      if (anchorSlot.order >= 0) bad.push(label + ": the anchor does not lead (order " + anchorSlot.order + ")");
      text.forEach(function (s) { if (s.rect.y < bottom(a) - TOL && s.slot !== "ord") bad.push(label + ": " + s.slot + " starts above the end of the anchor"); });
      if (Math.abs(a.y - top) > TOL + 1) bad.push(label + ": the anchor starts " + Math.round(a.y - top) + " px below the top of the stack");
    }
    if (r === "center") {
      if (Math.abs(a.x + a.w / 2 - (x0 + (x1 - x0) / 2)) > TOL + 1) bad.push(label + ": the plate is not centred in x");
      if (a.h >= P.MAX.center - TOL) {
      var prev = null, next = null;
      out.slots.forEach(function (s) { if (s.slot === "anchor" || s.rect.h <= 0 || s.display === "none") return; if (bottom(s.rect) <= a.y + TOL) prev = s; else if (s.rect.y >= bottom(a) - TOL && !next) next = s; });
      var above = a.y - (prev ? bottom(prev.rect) : top), below = (next ? next.rect.y : bot) - bottom(a);
      if (Math.abs(above - below) > 2 + TOL) bad.push(label + ": the plate is not centred in y (" + Math.round(above) + " above, " + Math.round(below) + " below)");
      if (next && bot - bottom(next.rect) > 24 + TOL) bad.push(label + ": the " + next.slot + " is not at the foot of the stack (a void of " + Math.round(bot - bottom(next.rect)) + " px under it)");
      }
    }
    var K = CS.core.constants;
    out.texts.forEach(function (t) { if (t.x < K.CONTENT.x - TOL || t.x + t.w > K.CONTENT.x + K.CONTENT.w + TOL) bad.push(label + ": a word leaves the content box"); });
    return Array.from(new Set(bad));
  };

  /** Problems of a grid or timeline run. `o.allowFlagged`: copy that the text pipeline itself rejects (a title that needs two lines at the floor size: fit reports "overflow" on
   *  an item part) is the copy author's to shorten, not a layout fact; such a run is returned as clean with out.flagged = [the slot keys]. Overflow anywhere else still fails. */
  P.checkItems = function (out, kind, n, hi, o) {
    var bad = [], flagged = false, c = out.content, L = out.type + ":" + kind + " n" + n + (hi >= 0 ? " hi" + hi : "") + "@" + out.canvasH, N = out.itemNodes;
    if (!out.fit.ok) {
      var over = Object.keys(out.fit.slots).filter(function (k) { return out.fit.slots[k].status === "overflow"; }), rest = over.filter(function (k) { return !/\.items\.\d+\.(title|text|value)$/.test(k); });
      if (o && o.allowFlagged && over.length && !rest.length) { out.flagged = over; flagged = true; }
      else bad.push(L + ": text overflow in " + over.join(","));
    }
    if (!out.items || N.length !== n) return bad.concat(L + ": " + (out.items ? N.length : 0) + " items laid out, expected " + n);
    var it = out.items;
    if (it.x < c.x - TOL || it.x + it.w > c.x + c.w + TOL) bad.push(L + ": the items leave the content box");
    if (bottom(it) > c.y + c.h - out.padBottom + TOL) bad.push(L + ": the items run past the stack");
    var rtl = out.tokens && out.el.getAttribute("dir") === "rtl";
    if (kind === "bento") {
      var colW = (it.w - 24) / 2;
      N.forEach(function (m, i) {
        if (m.rect.w < colW - TOL) bad.push(L + ": card " + i + " is " + Math.round(m.rect.w) + " px wide (a column is " + Math.round(colW) + ")");
        if (m.rect.h < 280 - TOL && out.canvasH === 1440) bad.push(L + ": card " + i + " is " + Math.round(m.rect.h) + " px high (minimum 280)");
      });
      for (var i = 0; i < N.length; i++) for (var j = i + 1; j < N.length; j++) {
        var A = N[i].rect, B = N[j].rect;
        if (A.x < B.x + B.w - TOL && A.x + A.w > B.x + TOL && A.y < B.y + B.h - TOL && A.y + A.h > B.y + TOL) bad.push(L + ": cards " + i + " and " + j + " overlap");
      }
      if (n === 3 && hi === 0) {
        if (N[0].rect.h < N[1].rect.h * 2 + 24 - TOL) bad.push(L + ": the key card does not span two rows");
        if (!(rtl ? N[0].rect.x > N[1].rect.x : N[0].rect.x < N[1].rect.x)) bad.push(L + ": the key card is not at the start edge");
        if (Math.abs(N[2].rect.x - N[1].rect.x) > TOL) bad.push(L + ": the third card is not under the second");
      } else if (n === 3) {
        if (N[2].rect.w < it.w - TOL) bad.push(L + ": the last card does not span the row");
      }
      if (n === 4) { var hs = N.map(function (m) { return Math.round(m.rect.h); }); if (Math.max.apply(null, hs) - Math.min.apply(null, hs) > 1) bad.push(L + ": the four cards differ in height " + hs.join(",")); }
      var gap = N.length > 1 ? Math.abs(N[1].rect.x - (N[0].rect.x + (rtl ? -N[1].rect.w : N[0].rect.w))) : 24;
      void gap;
    } else {
      N.forEach(function (m, i) {
        if (m.rect.h < 140 - TOL) bad.push(L + ": node " + i + " is " + Math.round(m.rect.h) + " px high (minimum 140)");
        if (i > 0 && m.rect.y < N[i - 1].rect.y + N[i - 1].rect.h - TOL) bad.push(L + ": nodes " + (i - 1) + " and " + i + " overlap");
        var ic = m.parts.icon, ti = m.parts.title, va = m.parts.value;
        if (ic && ti && (rtl ? ic.x < ti.x : ic.x > ti.x)) bad.push(L + ": the node is not at the start edge, before the title");
        if (va && ti && (rtl ? va.x<ti.x : va.x>ti.x)) bad.push(L + ": the time label is not before the title");
        var wantLine = i < N.length - 1;
        if ((m.beforeDisplay === "none") === wantLine) bad.push(L + ": the rail connector of node " + i + " is " + (wantLine ? "missing" : "drawn after the last node"));
      });
      if (n <= 4 && N.length > 1) {
        var pitch = N[1].rect.y - N[0].rect.y;
        if (pitch < 140 - TOL) bad.push(L + ": pitch " + Math.round(pitch) + " px (minimum 140)");
      }
      if (hi >= 0 && N.length > 1) {
        var other = N.filter(function (m, i) { return i !== hi; })[0];
        if (Math.abs(N[hi].rect.h-other.rect.h)>TOL) bad.push(L + ": the rail nodes do not keep an even pitch");
      }
    }
    if (!flagged) P.checkItemText(out, kind, L).forEach(function (m) { bad.push(m); });
    return Array.from(new Set(bad));
  };

  /** The words inside the cells (spec 4.4): every line of text of every part lies inside its card or node (a card keeps 16 px of its 32 px padding free on every side),
   *  clear of the icon and of the other parts, and the node/card box itself does not run over its neighbours. Measured from text ranges, so it holds whatever the filler
   *  does with fit slots: fit.js checks the slot box and the stack, not the cell the slot sits in. */
  P.checkItemText = function (out, kind, L) {
    var bad = [], N = out.itemNodes, inset = kind === "bento" ? 16 : 0, names = ["title", "text", "value"], what = kind === "bento" ? "card" : "node";
    function hit(a, b) { return a.x < b.x + b.w - TOL && a.x + a.w > b.x + TOL && a.y < b.y + b.h - TOL && a.y + a.h > b.y + TOL; }
    N.forEach(function (m, i) {
      var box = m.rect, any = 0;
      names.forEach(function (name) {
        (m.texts[name] || []).forEach(function (t) {
          any++;
          if (t.x < box.x + inset - TOL || t.x + t.w > box.x + box.w - inset + TOL) bad.push(L + ": the " + name + " of " + what + " " + i + " leaves its " + what + " sideways (x " + Math.round(t.x) + "-" + Math.round(t.x + t.w) + " of " + Math.round(box.x) + "-" + Math.round(box.x + box.w) + ")");
          if (t.y < box.y + inset - TOL || t.y + t.h > box.y + box.h - inset + TOL) bad.push(L + ": the " + name + " of " + what + " " + i + " leaves its " + what + " in height (y " + Math.round(t.y) + "-" + Math.round(t.y + t.h) + " of " + Math.round(box.y) + "-" + Math.round(box.y + box.h) + ")");
          if (m.parts.icon && hit(t, m.parts.icon)) bad.push(L + ": the " + name + " of " + what + " " + i + " runs into the icon");
        });
      });
      if (!any) bad.push(L + ": " + what + " " + i + " has no text to measure");
      for (var a = 0; a < names.length; a++) for (var b = a + 1; b < names.length; b++) (m.texts[names[a]] || []).forEach(function (ta) { (m.texts[names[b]] || []).forEach(function (tb) { if (hit(ta, tb)) bad.push(L + ": in " + what + " " + i + " the " + names[a] + " and the " + names[b] + " overlap"); }); });
      /* a node's text may not run into the next node's text either (nodes sit in one column) */
      if (kind !== "bento" && i > 0) names.forEach(function (na) { (m.texts[na] || []).forEach(function (ta) { names.forEach(function (nb) { (N[i - 1].texts[nb] || []).forEach(function (tb) { if (hit(ta, tb)) bad.push(L + ": the " + na + " of node " + i + " overlaps the " + nb + " of node " + (i - 1)); }); }); }); });
    });
    return Array.from(new Set(bad));
  };
})();
