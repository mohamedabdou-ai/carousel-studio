/*
 * Test double for the parts of CS.core and CS root that cs-paint / cs-motion / cs-hf / cs-export call.
 * Package B3 tests its own code in isolation; the real engine (B2) and root utilities (B4) replace this at integration.
 * It follows CONTRACT 5.1 (slide DOM), 5.3 (cover / item / cta) and 6.2 (tokens) closely enough to exercise every painter feature.
 */
(function () {
  "use strict";
  var CS = (window.CS = window.CS || {});
  CS.version = "cs-1.1.1";             // the engine of tools/build.mjs ENGINE; test_build_studio holds the two together
  var listeners = {};

  function CSError(code, message, detail) { var e = new Error(message || code); e.name = "CSError"; e.code = code; e.detail = detail; return e; }
  CSError.prototype = Object.create(Error.prototype);
  CS.CSError = CSError;
  CS.on = function (type, fn) { (listeners[type] = listeners[type] || []).push(fn); return function () { CS.off(type, fn); }; };
  CS.off = function (type, fn) { listeners[type] = (listeners[type] || []).filter(function (f) { return f !== fn; }); };
  CS.once = function (type, fn) { var off = CS.on(type, function (d, e) { off(); fn(d, e); }); return off; };
  CS.emit = function (type, detail) {
    (listeners[type] || []).slice().forEach(function (f) { f(detail); });
    document.dispatchEvent(new CustomEvent(type, { detail: detail }));
  };
  CS.util = {
    isWebKit: function () { return /AppleWebKit/.test(navigator.userAgent) && !/Chrome|Chromium|Edg/.test(navigator.userAgent); },
    raf2: function () { return new Promise(function (r) { requestAnimationFrame(function () { requestAnimationFrame(function () { r(); }); }); }); },
    sleep: function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  };

  /* ---- palettes (swiss, heritage): subset of CONTRACT 6.2 ---- */
  var PALETTES = {
    swiss: { bg: "#F4F4F2", surface: "#FFFFFF", ink: "#111111", inkMuted: "#5A5A5A", accent: "#E3262B", onAccent: "#FFFFFF", line: "#D6D6D2", bgImage: "none", hl: "bar" },
    heritage: { bg: "#1F5A47", surface: "#27664F", ink: "#F7F1E3", inkMuted: "#BFCCC4", accent: "#E8B05C", onAccent: "#14302A", line: "#3E7A63",
      bgImage: "linear-gradient(160deg, #1F5A47 0%, #133B31 100%)", hl: "bar" }
  };

  var ARCHETYPE_CSS = [
    ".cs-slide{position:relative;width:1080px;height:1440px;overflow:hidden;background:var(--cs-bg);background-image:var(--cs-bg-image);color:var(--cs-ink);font-family:var(--cs-font-body);font-weight:400;text-align:start;font-size:44px;line-height:1.6}",
    ".cs-slide *{box-sizing:border-box;margin:0;padding:0}",
    ".cs-bg,.cs-decor{position:absolute;inset:0}",
    ".cs-header,.cs-footer{position:absolute;inset-inline:98px;height:80px;display:flex;justify-content:space-between;align-items:flex-start;font-size:30px;font-weight:600;color:var(--cs-ink-muted)}",
    ".cs-header{top:110px}.cs-footer{top:1250px}",
    ".cs-handle .cs-ltr{unicode-bidi:isolate}",
    ".cs-content{position:absolute;inset-inline:98px;top:206px;height:1028px;display:flex;flex-direction:column;gap:40px;justify-content:flex-start}",
    ".cs-kicker{font-family:var(--cs-font-heading);font-weight:700;font-size:36px;color:var(--cs-accent);line-height:1.4}",
    ".cs-headline{font-family:var(--cs-font-display);font-weight:800;font-size:150px;line-height:1.3;color:var(--cs-ink)}",
    ".cs-title{font-family:var(--cs-font-display);font-weight:800;font-size:88px;line-height:1.35}",
    ".cs-sub,.cs-body{font-size:50px;line-height:1.55;color:var(--cs-ink-muted);max-width:860px}",
    ".w{display:inline-block}",
    ".cs-ltr{font-family:var(--cs-font-latin);font-weight:var(--cs-wght-latin);unicode-bidi:isolate}",
    ".cs-number{position:absolute;inset-inline-start:70px;top:170px;font-family:var(--cs-font-display);font-weight:800;font-size:560px;line-height:1;color:var(--cs-line)}",
    ".cs-cta{align-self:flex-start;display:inline-flex;align-items:center;gap:20px;background:var(--cs-accent);color:var(--cs-on-accent);font-family:var(--cs-font-display);font-weight:700;font-size:46px;padding:24px 44px;border-radius:999px}",
    ".cs-cta svg{width:44px;height:44px}",
    ".cs-a-item,.cs-a-cta{justify-content:center}",
    ".cs-savepill{display:inline-block;border:3px solid var(--cs-line);border-radius:999px;padding:4px 22px;color:var(--cs-ink)}"
  ].join("\n");

  var DECOR_CSS = {
    swiss: '.cs-slide[data-preset="swiss"] mark.cs-em{background:linear-gradient(to top,var(--cs-accent) 0,var(--cs-accent) 24%,transparent 24%);color:inherit}',
    heritage: [
      '.cs-slide[data-preset="heritage"] .cs-bg{background-image:repeating-linear-gradient(45deg,rgba(232,176,92,0.16) 0,rgba(232,176,92,0.16) 2px,transparent 2px,transparent 64px),repeating-linear-gradient(-45deg,rgba(232,176,92,0.16) 0,rgba(232,176,92,0.16) 2px,transparent 2px,transparent 64px)}',
      '.cs-slide[data-preset="heritage"] .cs-decor-orb{position:absolute;width:560px;height:560px;border-radius:50%;background:rgba(232,176,92,0.14);inset-inline-end:-190px;bottom:-190px}',
      '.cs-slide[data-preset="heritage"] mark.cs-em{background:linear-gradient(to top,rgba(232,176,92,0.9) 0,rgba(232,176,92,0.9) 20%,transparent 20%);color:inherit}',
      '.cs-slide[data-preset="heritage"] .cs-kicker::before{content:"";display:inline-block;width:46px;height:6px;border-radius:3px;background:var(--cs-accent);margin-inline-end:16px;vertical-align:middle}'
    ].join("\n")
  };

  // build_studio.py (B5) embeds these blocks in the page; the live DOM needs them so layout and fonts resolve like in the Studio.
  function addStyle(id, css, decor) {
    var st = document.createElement("style");
    if (id) st.id = id;
    if (decor) st.setAttribute("data-cs-decor", decor);
    st.textContent = css;
    document.head.appendChild(st);
  }
  addStyle("cs-archetype-css", ARCHETYPE_CSS);
  Object.keys(DECOR_CSS).forEach(function (k) { addStyle(null, DECOR_CSS[k], k); });

  CS.core = CS.core || {};
  CS.core.registry = {
    archetypeCss: function () { return ARCHETYPE_CSS; },
    decorCss: function (id) { return DECOR_CSS[id] || ""; },
    fontCss: function (id) { return { "alexandria": "Alexandria", "readex-pro": "Readex Pro" }[id] || id; }
  };

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function wordHtml(word, i, slot) {
    var attrs = ' class="w" data-w="' + i + '" data-m-slot="' + slot + '"';
    if (/^[$€£]?[0-9٠-٩][0-9٠-٩.,٫٬]*[%٪]?$/.test(word)) return "<span" + attrs + '><bdi dir="ltr" class="cs-ltr" data-run="number">' + esc(word) + "</bdi></span>";
    if (/^[A-Za-z][A-Za-z0-9._-]*$/.test(word)) return "<span" + attrs + '><bdi dir="ltr" class="cs-ltr" data-run="latin">' + esc(word) + "</bdi></span>";
    return "<span" + attrs + ">" + esc(word) + "</span>";
  }
  function toHTML(text, slot) {
    var i = 0, parts = String(text || "").split(/(==[^=]+==)/), out = [];
    parts.forEach(function (p) {
      if (!p) return;
      var em = /^==(.+)==$/.test(p), raw = em ? p.slice(2, -2) : p;
      var html = raw.split(/\n/).map(function (line) { return line.split(/\s+/).filter(Boolean).map(function (w) { return wordHtml(w, i++, slot); }).join(" "); }).join("<br>");
      out.push(em ? '<mark class="cs-em" data-m="em">' + html + "</mark>" : html);
    });
    return out.join(" ");
  }

  function tokensFor(spec) {
    var id = String(spec.style && spec.style.presetId || "swiss").split("@")[0], p = PALETTES[id] || PALETTES.swiss;
    var css = {
      "--cs-bg": p.bg, "--cs-surface": p.surface, "--cs-ink": p.ink, "--cs-ink-muted": p.inkMuted, "--cs-accent": p.accent, "--cs-accent-2": p.accent, "--cs-on-accent": p.onAccent,
      "--cs-line": p.line, "--cs-bg-image": p.bgImage,
      "--cs-font-display": '"Alexandria"', "--cs-font-heading": '"Alexandria"', "--cs-font-body": '"Readex Pro"', "--cs-font-latin": '"Alexandria"',
      "--cs-wght-display": "800", "--cs-wght-heading": "700", "--cs-wght-body": "400", "--cs-wght-latin": "800"
    };
    return { presetId: id, css: css, fonts: ["alexandria", "readex-pro"], hash: "stub" };
  }

  function composeSlide(spec, slide, tokens, index, total) {
    var digits = spec.locale && spec.locale.digits || "western", swipe = spec.locale && spec.locale.swipeCue || "arrow-rtl", last = index === total - 1;
    var english = spec.locale && spec.locale.dialect === "en", dirAttr = english ? "ltr" : "rtl", langAttr = english ? "en" : "ar";
    var style = Object.keys(tokens.css).map(function (k) { return k + ":" + tokens.css[k]; }).join(";") + ";width:1080px;height:1440px";
    var chrome = '<header class="cs-header" data-layer="chrome" data-m="chrome"><span class="cs-handle" data-slot="handle" data-m="handle"><bdi dir="ltr" class="cs-ltr" data-run="handle">@yourbrand</bdi></span>' +
      '<span class="cs-meta" data-slot="meta" data-m="meta">' + esc(spec.style && spec.style.metaLabel || "") + "</span></header>";
    var counter = english ? index + 1 + "/" + total : index + 1 + " من " + total;
    var foot = '<footer class="cs-footer" data-layer="chrome" data-m="footer" data-swipe="' + swipe + '"><span class="cs-savepill" data-slot="savepill" data-m="savepill">' +
      (slide.type === "cover" || slide.type === "cta" ? "احفظ البوست" : "") + '</span><span class="cs-counter" data-slot="counter" data-m="counter">' + counter + "</span>" +
      (swipe === "neutral" || last ? "" : '<span class="cs-swipe" data-slot="swipe" data-m="swipe">' + (english ? "Swipe →" : swipe === "arrow-rtl" ? "اسحب ←" : "اسحب →") + "</span>") + "</footer>";
    var body = "";
    if (slide.type === "cover") {
      body = '<main class="cs-content cs-a-cover" data-layer="content">' +
        (slide.kicker ? '<div class="cs-slot cs-kicker" data-slot="kicker" data-m="kicker" data-role="small">' + toHTML(slide.kicker, "kicker") + "</div>" : "") +
        '<h1 class="cs-slot cs-headline" data-slot="headline" data-m="headline" data-role="hero">' + toHTML(slide.headline, "headline") + "</h1>" +
        (slide.sub ? '<p class="cs-slot cs-sub" data-slot="sub" data-m="sub" data-role="body">' + toHTML(slide.sub, "sub") + "</p>" : "") + "</main>";
    } else if (slide.type === "cta") {
      body = '<main class="cs-content cs-a-cta" data-layer="content"><h2 class="cs-slot cs-title" data-slot="title" data-m="title">' + toHTML(slide.title, "title") + "</h2>" +
        '<p class="cs-slot cs-body" data-slot="body" data-m="body">' + toHTML(slide.body || "", "body") + "</p>" +
        '<span class="cs-slot cs-cta" data-slot="cta" data-m="cta"><span class="cs-cta-text">' + esc(slide.cta && slide.cta.text || "احفظ وارجعله") + '</span><span class="cs-cta-icon" aria-hidden="true">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"><path d="M6 3h12v18l-6-4.5L6 21z"/></svg></span></span></main>';
    } else {
      body = '<main class="cs-content cs-a-item" data-layer="content"><div class="cs-number" aria-hidden="true">' + (index) + "</div>" +
        '<h2 class="cs-slot cs-title" data-slot="title" data-m="title">' + toHTML(slide.title, "title") + "</h2>" +
        '<p class="cs-slot cs-body" data-slot="body" data-m="body">' + toHTML(slide.body || "", "body") + "</p></main>";
    }
    var decorItems = tokens.presetId === "heritage" ? '<div class="cs-decor-orb" data-m="decor-item" data-m-i="0"></div>' : "";
    var html = '<section class="cs-slide" dir="' + dirAttr + '" lang="' + langAttr + '" data-cs-slide="' + slide.id + '" data-n="' + (index + 1) + '" data-total="' + total + '" data-last="' + (last ? 1 : 0) + '" data-type="' + slide.type +
      '" data-variant="top" data-preset="' + tokens.presetId + '" data-digits="' + digits + '" data-swipe="' + swipe + '" data-hl="bar">' +
      '<div class="cs-bg" data-layer="bg" data-m="bg" aria-hidden="true"></div><div class="cs-decor" data-layer="decor" data-m="decor" aria-hidden="true">' + decorItems + "</div>" + chrome + body + foot + "</section>";
    var t = document.createElement("template");
    t.innerHTML = html;
    var el = t.content.firstElementChild;
    el.setAttribute("style", style);
    return el;
  }

  CS.core.render = {
    deck: async function (spec, brand, opts) {
      opts = opts || {};
      var tokens = tokensFor(spec), stage = document.createElement("div"), slides = [], total = spec.slides.length;
      stage.setAttribute("style", "position:fixed;left:-12000px;top:0;width:1080px;pointer-events:none;contain:layout paint");
      document.body.appendChild(stage);
      spec.slides.forEach(function (s, i) {
        if (opts.slideIds && opts.slideIds.indexOf(s.id) < 0) return;
        var el = composeSlide(spec, s, tokens, i, total);
        stage.appendChild(el);
        slides.push({ id: s.id, index: i, el: el, tokens: tokens, fit: { slideId: s.id, ok: true, slots: {}, warnings: [] } });
      });
      await document.fonts.ready;
      return { tokens: tokens, slides: slides, stage: stage, frozenOk: true, dispose: function () { if (stage.parentNode) stage.parentNode.removeChild(stage); } };
    }
  };
  CS.core.spec = {
    assembleCaption: function (spec) {
      var c = spec.captionPack || {};
      return [[c.firstLine, c.keywordLine].filter(Boolean).join("\n"), c.body, c.cta, (c.hashtags || []).join(" ")].filter(Boolean).join("\n\n");
    }
  };
})();

// The page is "ready" when fonts are in and two frames have been painted (CONTRACT 4.2).
window.__csReady = false;
document.fonts.ready.then(function () { return CS.util.raf2(); }).then(function () {
  window.__csReady = true;
  CS.emit("cs:ready", { ms: 0 });
});
