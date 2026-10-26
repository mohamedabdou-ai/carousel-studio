
(function () {
  var core = (CS.core = CS.core || {});

  var AR_CH = "\\u0621-\\u064A\\u064B-\\u0652\\u0640\\u066E-\\u06D3\\u06D5\\u06FA-\\u06FF\\u0750-\\u077F\\u08A0-\\u08FF\\uFB50-\\uFDFF\\uFE70-\\uFEFF";
  var WS = " \\t\\n\\r\\f\\v\\u00A0\\u202F";
  var RE_LATIN_PUNCT = new RegExp("([" + AR_CH + "])[" + WS + "]*([,;?])(?=[" + WS + "]|$|\\u2026)", "g");
  var RE_SPACE_BEFORE = new RegExp("[" + WS + "]+([\\u060C\\u061B\\u061F])", "g");
  var AR_PUNCT = { ",": "،", ";": "؛", "?": "؟" };

  function T() { return core.text; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function el(tag, cls) { var e = document.createElement(tag); if (cls) e.className = cls; return e; }
  function set(e, attrs) { Object.keys(attrs).forEach(function (k) { if (attrs[k] !== null && attrs[k] !== undefined) e.setAttribute(k, String(attrs[k])); }); return e; }
  function fmt(tpl, params) {
    if (typeof core.format === "function") return core.format(tpl, params);
    return String(tpl).replace(/\{(\w+)\}/g, function (m, k) { return Object.prototype.hasOwnProperty.call(params, k) ? params[k] : m; });
  }

  function slotKey(slideId, slot, index) {
    return slideId + "." + slot + (index === undefined || index === null ? "" : "." + index);
  }

  

  function makeContext(spec, slide, tokens, brand, opts) {
    var locale = spec.locale || {}, slides = spec.slides || [], rules = core.registry.rules();
    var dialect = tokens.dialect || locale.dialect || "eg";
    var lang = dialect === "en" ? "en" : "ar";
    var index = slides.indexOf(slide);
    if (index < 0) index = slides.findIndex(function (s) { return s.id === slide.id; });
    if (index < 0) index = Math.max(0, (slide.n || 1) - 1);
    var swipe = locale.swipeCue || (rules.locale.swipeCue.byAppLanguage || {})[locale.appLanguage || "ar"] || "arrow-rtl";
    var kashidaOwner = null;
    for (var i = 0; i < slides.length; i++) { if (slides[i].kashidaWord) { kashidaOwner = slides[i].id; break; } }
    var steps = slides.filter(function (s) { return s.type === "step"; }).length;
    var archetype = core.registry.getArchetype(slide.type);
    return {
      spec: spec, slide: slide, tokens: tokens, brand: brand || null, opts: opts || {}, rules: rules, locale: rules.locale,
      id: slide.id, type: slide.type, index: index, total: Math.max(slides.length, 1), dialect: dialect, lang: lang, dir: lang === "en" ? "ltr" : "rtl",
      digits: tokens.digits || locale.digits || "western", swipe: swipe, archetype: archetype,
      variant: core.resolve.variantFor(tokens, slide).variant, kashidaOwner: kashidaOwner, steps: steps,
      isEdit: (opts && opts.mode) === "edit", kashida: false
    };
  }

  

  
  function prepText(value, cx) {
    var s = T().normalize(String(value === undefined || value === null ? "" : value));
    s = s.replace(/\.{3,}/g, "…");
    if (cx.lang === "ar") {
      s = s.replace(RE_LATIN_PUNCT, function (m, ch, p) { return ch + AR_PUNCT[p]; });
      s = s.replace(RE_SPACE_BEFORE, "$1");
    }
    return s;
  }

  function html(value, cx, o) {
    o = o || {};
    var opts = { digits: cx.digits, lang: cx.lang, markup: o.markup !== false, wordSpans: o.words !== false };
    if (o.kashidaWord) { opts.kashidaWord = o.kashidaWord; opts.allowKashida = !!cx.tokens.decor.kashida.allowed; }
    return T().toHTML(prepText(value, cx), opts);
  }

  function tagWords(root, slotName) {
    var ws = root.querySelectorAll(".w");
    for (var i = 0; i < ws.length; i++) ws[i].setAttribute("data-m-slot", slotName);
  }

  function lineHeightFor(role, text) {
    if (!T().arabic.hasTashkeel(text)) return null;
    if (role === "hero" || role === "h1") return "calc(var(--cs-lh-display) + 0.15)";
    if (role === "title" || role === "h2") return "calc(var(--cs-lh-heading) + 0.15)";
    return "calc(var(--cs-lh-body) + 0.2)";
  }

  
  function roleFor(node, variant) {
    var by = node.getAttribute("data-role-by-variant");
    if (by) {
      var pairs = by.split(/[ \t]+/);
      for (var i = 0; i < pairs.length; i++) { var kv = pairs[i].split(":"); if (kv[0] === variant && kv[1]) return kv[1]; }
    }
    return node.getAttribute("data-role");
  }

  
  function applyMaxLines(node, variant) {
    var by = node.getAttribute("data-max-lines-by-variant");
    if (!by) return;
    by.split(/[ \t]+/).forEach(function (pair) { var kv = pair.split(":"); if (kv[0] === variant && /^[0-9]+$/.test(kv[1] || "")) node.setAttribute("data-max-lines", kv[1]); });
  }

  function markFit(node, cx, slot, index, role) {
    set(node,{"data-slot-key":slotKey(cx.id,slot,index),"data-role":role});
  }

  
  function vis(kind,cx,arg){var v=(cx.tokens.art||CS.visual?.free?.active(cx.slide))&&cx.type!=="cover"&&CS.visual;return v?.[kind]?.(...kind==="fill"?[arg.kind,cx,arg.index]:kind==="decorate"?[arg,cx]:[cx,arg]);}

  
  function label(n,text,cx,o) {
    o=o||{};
    var s=o.slot||"art",r=o.role||"small",f=cx.rules.platform.plugin.visual.artLabel;
    set(n,{"data-slot":s,"data-index":o.index,"data-kind":"text","data-floor":s==="art"?f[/^(numeral|word|chart)$/.test(r)?r:T().arabic.hasArabic(text)?"arabic":r==="tool"?r:"latin"]:null});
    markFit(n,cx,s,o.index,r);n.innerHTML=html(text,cx);tagWords(n,s);return n;
  }

  

  var FILL = {
    text: function (node, value, cx) {
      var raw = value === undefined || value === null ? "" : String(value);
      var slot = node.getAttribute("data-slot"), role = roleFor(node, cx.variant);
      markFit(node, cx, slot, null, role);
      applyMaxLines(node, cx.variant);
      if(cx.variant==="statement"&&slot===(cx.type==="rehook"?"headline":"body")){role="hero";node.dataset.role=role;node.dataset.maxLines=4;}
      if (!raw.trim()) return false;
      var kw = null;
      if (node.getAttribute("data-field") === "headline" && cx.kashidaOwner === cx.slide.id && cx.slide.kashidaWord && cx.tokens.decor.kashida.allowed) kw = cx.slide.kashidaWord;
      node.innerHTML = html(raw, cx, { kashidaWord: kw });
      tagWords(node, slot);
      if (node.querySelector(".cs-kashida")) cx.kashida = true;
      var lh = lineHeightFor(role, raw);
      if (lh) node.style.lineHeight = lh;
      return true;
    },

    list: function (node, items, cx) {
      if (!Array.isArray(items) || !items.length) return false;
      var slot = node.getAttribute("data-slot"), role = node.getAttribute("data-role"), max = node.getAttribute("data-max-lines"), any = false;
      items.forEach(function (text, i) {
        if (typeof text !== "string" || !text.trim()) return;
        var li = el("li", "cs-bullet");
        set(li, { "data-m": "bullet", "data-m-i": i, "data-slot": slot, "data-field": "bullets", "data-index": i, "data-kind": "text", "data-max-lines": max, "data-edit": "text" });
        markFit(li, cx, slot, i, role);
        li.innerHTML = html(text, cx);
        var icon=vis("fill",cx,{kind:"rowicon",index:i});
        if(icon){icon.setAttribute("data-part","icon");li.insertBefore(icon,li.firstChild);}
        tagWords(li, slot);
        var lh = lineHeightFor(role, text);
        if (lh) li.style.lineHeight = lh;
        if (li.querySelector(".cs-kashida")) cx.kashida = true;
        node.appendChild(li);
        any = true;
      });
      node.removeAttribute("data-edit");
      return any;
    },

    sides: function (node, sides, cx) {
      if (!Array.isArray(sides) || !sides.length) return false;
      var S = cx.locale.slideStrings, defaults = ["", ""];
      if (cx.type === "myth-fact") defaults = [S.mythLabel[cx.dialect], S.factLabel[cx.dialect]];
      var slot = node.getAttribute("data-slot"), role = node.getAttribute("data-role"), max = node.getAttribute("data-max-lines");
      for (var i = 0; i < 2; i++) {
        var s = sides[i] || {}, side = el("div", "cs-side");
        set(side, { "data-side": i, "data-m": "side", "data-m-i": i });
        var label = (s.label && String(s.label).trim()) || defaults[i];
        if (label) {
          var lab = el("span", "cs-side-label");
          lab.innerHTML = html(label, cx, { markup: false, words: false });
          side.appendChild(lab);
        }
        var p = el("p", "cs-side-text");
        set(p, { "data-slot": slot, "data-field": "sides", "data-index": i, "data-kind": "text", "data-max-lines": max, "data-edit": "text" });
        markFit(p, cx, slot, i, role);
        if (s.text) {
          p.innerHTML = html(s.text, cx);
          tagWords(p, slot);
          var lh = lineHeightFor(role, s.text);
          if (lh) p.style.lineHeight = lh;
        }
        side.appendChild(p);
        node.appendChild(side);
      }
      if (cx.type === "compare") node.setAttribute("data-vs", S.versusLabel[cx.dialect]);
      node.removeAttribute("data-edit");
      return true;
    },

    number: function (node, number, cx) {
      if (!number || number.value === undefined || number.value === null || String(number.value) === "") return false;
      var value = String(number.value), decimals = (value.split(".")[1] || "").length;
      markFit(node, cx, node.getAttribute("data-slot"), null, roleFor(node, cx.variant));
      var shown = T().digits.formatNumber(value, cx.digits);
      
      var num = '<bdi dir="ltr" class="' + (cx.digits === "arabic-indic" ? "cs-num" : "cs-ltr cs-num") + '" data-m="num" data-run="number" data-value="' + esc(value) + '" data-decimals="' + decimals + '">' + esc(shown) + "</bdi>";
      var unit = "", unitText = number.unit ? String(number.unit).trim() : "";
      if (unitText === "%" && cx.digits === "arabic-indic") unitText = "٪";
      if (unitText) unit = '<span class="cs-unit" data-m="unit">' + html(unitText, cx, { markup: false, words: false }) + "</span>";
      
      if (unit && cx.dir === "rtl" && !/[\u0600-\u06FF]/.test(unitText)) node.innerHTML = '<bdi dir="ltr" data-unit-join>' + num + unit + "</bdi>";
      else node.innerHTML = num + unit;
      return true;
    },

    ord: function (node, _value, cx) {
      var s = cx.slide, slides = cx.spec.slides || [], n = 0;
      if (typeof s.ord === "number") n = s.ord;
      else if (cx.type !== "story-beat") { for (var i = 0; i <= cx.index; i++) { if (slides[i] && slides[i].type === s.type) n++; } }
      if (!n) return false;
      markFit(node, cx, node.getAttribute("data-slot"), null, roleFor(node, cx.variant));
      var conv = function (x) { return T().digits.convert(String(x), cx.digits); };
      var asLabel = cx.type === "step" && cx.variant !== "ghost-number" && cx.steps > 0;
      var label = asLabel ? fmt(cx.locale.slideStrings.stepLabel[cx.dialect], { i: conv(n), n: conv(cx.steps) }) : conv(n);
      node.setAttribute("data-ord", n);
      node.innerHTML = T().toHTML(prepText(label, cx), { digits: cx.digits, lang: cx.lang, markup: false, wordSpans: false });
      return true;
    },

    cta: function (node, cta, cx) {
      if (!cta || !cta.text || !String(cta.text).trim()) return false;
      var slot = node.getAttribute("data-slot"), role = node.getAttribute("data-role");
      node.setAttribute("data-cta", cta.kind || "");
      var text = el("span", "cs-cta-text");
      set(text, { "data-slot": slot, "data-field": "cta", "data-kind": "text", "data-max-lines": node.getAttribute("data-max-lines"), "data-edit": "text" });
      markFit(text, cx, slot, null, role);
      text.innerHTML = html(cta.text, cx);
      tagWords(text, slot);
      var icon = el("span", "cs-cta-icon");
      icon.setAttribute("aria-hidden", "true");
      node.appendChild(text);
      node.appendChild(icon);
      return true;
    },

    media: function (node, media, cx) {
      if (!media || !media.slot || media.slot === "none") return false;
      var kind = media.slot, asset = findAsset(cx, media.assetId);
      node.setAttribute("data-media-kind", kind);
      if (media.calmZone) node.setAttribute("data-calm", media.calmZone);
      if (media.ai) node.setAttribute("data-ai", "1");
      if (media.assetId) node.setAttribute("data-asset", media.assetId);
      if (!asset) { node.setAttribute("data-media-state", "missing"); return true; }
      if (asset.mirror === "auto" && kind === "icon" && cx.dir === "rtl") node.setAttribute("data-mirror", "1");
      if (asset.aiGenerated) node.setAttribute("data-ai", "1");
      var isVideo = /^video\//.test(asset.mime || "") || asset.kind === "video";
      var inline = kind === "icon" ? inlineSvg(asset) : null;
      if (inline) node.appendChild(inline);
      else if (isVideo) {
        var v = el("video");
        set(v, { src: asset.url, muted: "", playsinline: "", loop: "", preload: "auto", "aria-hidden": "true" });
        v.muted = true;
        node.appendChild(v);
      } else {
        var img = el("img");
        set(img, { src: asset.url, alt: "", decoding: "async", draggable: "false" });
        if (/^https?:/i.test(asset.url)) img.setAttribute("crossorigin", "anonymous");
        node.appendChild(img);
      }
      return true;
    }
  };

  
  function findAsset(cx, id) {
    if (!id) return null;
    var a = null, spec = cx.spec;
    var rec = (spec.assets || []).filter(function (x) { return x.id === id; })[0] || null;
    if (typeof cx.opts.assets === "function") {
      var r = cx.opts.assets(id);
      if (r && r.url) a = { url: r.url, mime: r.mime || (rec && rec.mime) || "", w: r.w, h: r.h };
    }
    if (!a && rec && /^data:/i.test(rec.ref || "")) a = { url: rec.ref, mime: rec.mime || (/^data:([^;,]+)/i.exec(rec.ref) || [])[1] || "" };
    if (!a) return null;
    if (rec) { a.kind = rec.kind; a.mirror = rec.mirror; a.aiGenerated = !!rec.aiGenerated; }
    return a;
  }

  
  function inlineSvg(asset) {
    var m = /^data:image\/svg\+xml(;base64)?,(.*)$/is.exec(asset.url || "");
    if (!m) return null;
    var text;
    try {
      if (m[1]) { var bin = atob(m[2]), bytes = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); text = new TextDecoder("utf-8").decode(bytes); }
      else text = decodeURIComponent(m[2]);
    } catch (e) { return null; }
    var doc = new DOMParser().parseFromString(text, "image/svg+xml");
    var svg = doc.documentElement;
    if (!svg || svg.nodeName.toLowerCase() !== "svg" || doc.getElementsByTagName("parsererror").length) return null;
    var all = Array.prototype.slice.call(svg.querySelectorAll("*")), i2;
    all.unshift(svg);
    for (i2 = all.length - 1; i2 >= 0; i2--) {
      var n = all[i2], tag = n.nodeName.toLowerCase();
      if (n !== svg && (tag === "script" || tag === "foreignobject")) { n.remove(); continue; }
      for (var j = n.attributes.length - 1; j >= 0; j--) {
        var an = n.attributes[j].name, av = n.attributes[j].value;
        if (/^on/i.test(an) || ((an === "href" || an === "xlink:href") && /^\s*javascript:/i.test(av))) n.removeAttribute(an);
      }
    }
    var node = document.importNode(svg, true);
    node.setAttribute("aria-hidden", "true");
    node.setAttribute("focusable", "false");
    return node;
  }

  

  function parseSlot(name, fallback) {
    var m = /^(header|footer)-(start|center|end)$/.exec(name || fallback);
    return m ? { band: m[1], pos: m[2] } : parseSlot(fallback, "header-start");
  }

  function chromeItem(cx, cls, name, slotName, fallback) {
    var p = parseSlot(slotName, fallback), e = el("span", cls);
    set(e, { "data-slot": name, "data-m": name, "data-pos": p.pos });
    return { name: name, band: p.band, pos: p.pos, el: e };
  }

  function counterText(cx) {
    var cfg = cx.tokens.chrome.counter || {}, fmtStr = cfg.format || cx.locale.counter.formats[cx.lang];
    if (cx.lang === "en" && /[\u0600-\u06FF]/.test(fmtStr)) fmtStr = cx.locale.counter.formats.en;
    var conv = function (x) { return T().digits.convert(String(x), cx.digits); };
    return fmt(fmtStr, { i: conv(cx.index + 1), n: conv(cx.total) });
  }

  
  var ARROW_PATHS = { left: "M19 12H5M11 6l-6 6 6 6", right: "M5 12h14M13 6l6 6-6 6" };

  function arrowSvg(dir) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" data-dir="' + dir + '"><path d="' + ARROW_PATHS[dir] + '"/></svg>';
  }

  
  function swipeCue(cx) {
    var style = (cx.tokens.chrome.swipe || {}).style || "label+chevron";
    if (style === "none") return null;
    var label = (cx.locale.swipeCue.labels[cx.swipe] || {})[cx.dialect];
    if (!label) return null;
    var glyph = (/[\u2190\u2192]\s*$/.exec(label) || [""])[0].trim();
    var arrow = glyph === "\u2190" ? "left" : glyph === "\u2192" ? "right" : null;
    var word = label.replace(/\s*[\u2190\u2192]\s*$/, "");
    var i = cx.index + 1, k = cx.total - i, from = cx.locale.counter.remainingFromSlideCount || 2;
    if (i > 1 && k >= 1 && k <= from) word = T().digits.remaining(k, cx.digits, cx.lang);
    if (style === "chevron") return arrow ? { word: null, arrow: arrow } : null;
    if (style === "label") return { word: word, arrow: null };
    return { word: word, arrow: arrow };
  }

  function buildChrome(cx) {
    var t = cx.tokens, ch = t.chrome || {}, brand = cx.brand, arch = cx.archetype.chrome, items = [];
    var isLast = cx.index === cx.total - 1, multi = cx.total > 1;

    if (arch.indexOf("handle") >= 0 && brand && brand.handle) {
      var h = chromeItem(cx, "cs-handle", "handle", ch.handle && ch.handle.slot, "header-start");
      var logoUrl = null;
      if (!ch.handle || ch.handle.logo !== "never") {
        var logo = typeof cx.opts.assets === "function" ? cx.opts.assets("logo") : null;
        logoUrl = (logo && logo.url) || (brand.visual && brand.visual.logo && brand.visual.logo.dataUri) || null;
      }
      var inner = "";
      if (logoUrl) inner += '<img alt="" data-logo decoding="async" draggable="false" src="' + esc(logoUrl) + '">';
      inner += T().toHTML("@" + String(brand.handle).replace(/^@/, ""), { digits: cx.digits, lang: cx.lang, markup: false, wordSpans: false });
      h.el.innerHTML = inner;
      items.push(h);
    }
    var meta = cx.spec.style && cx.spec.style.metaLabel;
    if (arch.indexOf("meta") >= 0 && meta && String(meta).trim()) {
      var m = chromeItem(cx, "cs-meta", "meta", ch.meta && ch.meta.slot, "header-end");
      m.el.innerHTML = html(meta, cx, { markup: false, words: false });
      items.push(m);
    }
    var pill = ch.savePill;
    var showOn = (pill && pill.showOn) || ["cover", "cta"];
    if (arch.indexOf("savepill") >= 0 && pill && showOn.indexOf(cx.type) >= 0) {
      var sp = chromeItem(cx, "cs-savepill", "savepill", pill.slot, "footer-start");
      
      sp.el.innerHTML = "<span>" + html(cx.locale.slideStrings.savePill[cx.dialect], cx, { markup: false, words: false }) + "</span>";
      items.push(sp);
    }
    if (arch.indexOf("counter") >= 0 && multi) {
      var c = chromeItem(cx, "cs-counter", "counter", ch.counter && ch.counter.slot, "footer-center");
      var ctext = counterText(cx);
      
      c.el.innerHTML = /[\u0600-\u06FF]/.test(ctext) ? html(ctext, cx, { markup: false, words: false }) : '<bdi dir="ltr" class="cs-ltr" data-run="number">' + esc(ctext) + "</bdi>";
      items.push(c);
    }
    if (arch.indexOf("swipe") >= 0 && multi && !isLast && cx.swipe !== "neutral") {
      var cue = swipeCue(cx);
      if (cue) {
        var sw = chromeItem(cx, "cs-swipe", "swipe", ch.swipe && ch.swipe.slot, "footer-end");
        sw.el.innerHTML = (cue.word ? html(cue.word, cx, { markup: false, words: false }) : "") + (cue.arrow ? arrowSvg(cue.arrow) : "");
        items.push(sw);
      }
    }

    var header = set(el("header", "cs-header"), { "data-layer": "chrome", "data-m": "chrome" });
    var footer = set(el("footer", "cs-footer"), { "data-layer": "chrome", "data-m": "footer", "data-swipe": cx.swipe });
    var order = ["handle", "meta", "savepill", "counter", "swipe"];
    items.sort(function (a, b) { return order.indexOf(a.name) - order.indexOf(b.name); });
    items.forEach(function (it) { (it.band === "header" ? header : footer).appendChild(it.el); });
    var r=vis("chrome",cx);
    if(r&&r.rail&&c){r=r.rail;var x=el("span","cs-rail");set(x,{"aria-hidden":true,"data-style":r.style});for(var j=0;j<r.n;j++)x.appendChild(set(el("i","cs-rail-seg"),{"data-on":j<=r.on?1:0}));c.el.appendChild(x);}
    return { header: header, footer: footer };
  }

  

  function slide(spec, slideSpec, tokens, brand, opts) {
    opts = opts || {};
    var cx = makeContext(spec, slideSpec, tokens, brand, opts);
    var root = el("section", "cs-slide");
    var canvas = spec.canvas || {};
    set(root, {
      dir: cx.dir, lang: cx.lang, "data-cs-slide": cx.id, "data-n": cx.index + 1, "data-total": cx.total, "data-last": cx.index === cx.total - 1 ? 1 : 0,
      "data-type": cx.type, "data-variant": cx.variant, "data-preset": tokens.presetId, "data-occasion": tokens.occasionId || "",
      "data-dialect": cx.dialect, "data-digits": cx.digits, "data-swipe": cx.swipe, "data-align": tokens.layout.align, "data-cover-anchor": tokens.layout.coverAnchor,
      "data-hl": tokens.decor.highlight, "data-numbering": tokens.decor.numbering, "data-kashida": 0, "data-bgkind": tokens.background.kind,
      "data-texture": tokens.decor.texture && tokens.decor.texture !== "none" ? tokens.decor.texture : null, "data-motif": tokens.decor.motif || null
    });
    Object.keys(tokens.css).forEach(function (k) { root.style.setProperty(k, tokens.css[k]); });
    root.style.width = (canvas.w || core.constants.CANVAS.w) + "px";
    root.style.height = (canvas.h || core.constants.CANVAS.h) + "px";

    var bg = set(el("div", "cs-bg"), { "data-layer": "bg", "data-m": "bg", "aria-hidden": "true" });
    var decor = set(el("div", "cs-decor"), { "data-layer": "decor", "data-m": "decor", "aria-hidden": "true" });
    var bar = buildChrome(cx);

    var main = CS.visual?.free?.compose(cx) || cx.archetype.template.content.firstElementChild.cloneNode(true);
    // bridge is shared spec copy, including on types whose base template has no
    // bridge slot. Keep the template contract and materialize it when supplied.
    if (!main.classList.contains("cs-free") && cx.slide.bridge && !main.querySelector('[data-slot="bridge"]')) {
      main.appendChild(set(el("p", "cs-slot cs-bridge"), { "data-slot": "bridge", "data-field": "bridge", "data-kind": "text", "data-role": "small", "data-max-lines": "2", "data-m": "bridge", "data-optional": "", "data-edit": "text" }));
    }
    vis("begin",cx);
    var bgMedia = (cx.slide.media && cx.slide.media.slot === "plate") || (cx.variant === "photo" && ["cover", "quote", "poster"].indexOf(cx.type) >= 0);
    if (!main.classList.contains("cs-free")) main.querySelectorAll("[data-slot]").forEach(function (node) {
      var kind = node.getAttribute("data-kind"), field = node.getAttribute("data-field");
      var filled = FILL[kind] ? FILL[kind](node, cx.slide[field], cx) : vis("slot",cx,node);
      if (!filled && node.hasAttribute("data-optional")) node.remove();
    });
    var media = main.querySelector(".cs-media-slot");
    if (bgMedia && media) { media.removeAttribute("data-optional"); bg.appendChild(media); }

    root.appendChild(bg);
    root.appendChild(decor);
    root.appendChild(bar.header);
    root.appendChild(main);
    root.appendChild(bar.footer);
    vis("decorate",cx,root);

    var local = core.registry.decorLocal(tokens.presetId, tokens.roles);
    if (local.css) {
      var style = el("style");
      style.setAttribute("data-cs-decor-local", "");
      style.textContent = local.css;
      root.appendChild(style);
      root.setAttribute("data-decor-key", local.key);
    }
    if (cx.kashida) root.setAttribute("data-kashida", "1");

    if (cx.isEdit) {
      root.querySelectorAll('[data-edit="text"]').forEach(function (n) { n.setAttribute("contenteditable", "true"); n.setAttribute("spellcheck", "false"); });
    } else {
      root.querySelectorAll("[data-edit]").forEach(function (n) { n.removeAttribute("data-edit"); });
    }
    return root;
  }

  function chrome(spec, slideSpec, tokens, brand) {
    var cx = makeContext(spec, slideSpec, tokens, brand, {});
    return buildChrome(cx);
  }

  
  function slots(slideEl) {
    var out = [];
    slideEl.querySelectorAll("[data-slot-key]").forEach(function (n) {
      var idx = n.getAttribute("data-index");
      out.push({
        key: n.getAttribute("data-slot-key"), slot: n.getAttribute("data-slot"), el: n, role: n.getAttribute("data-role"),
        field: n.getAttribute("data-field"), index: idx === null ? null : parseInt(idx, 10)
      });
    });
    return out;
  }

  
  function prepare(value, spec) {
    var dialect = ((spec && spec.locale) || {}).dialect || "eg";
    return prepText(value, { lang: dialect === "en" ? "en" : "ar" });
  }

  core.compose = { slide: slide, chrome: chrome, slotKey: slotKey, slots: slots, prepare: prepare, html: html, label: label, context: makeContext };
})();
