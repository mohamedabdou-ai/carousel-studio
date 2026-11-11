/* Free design: untrusted HTML is parsed into an allow-listed tree, never inserted as HTML.
 * Hosts embed data/free-design.json as cs-free-design (Node: visual._.blocks).
 * The parser is DOM-free so copy QA, the CLI and Studio share the same literal twin. */
(function () {
  var V = CS.visual, C = CS.core;
  function fail(message, code) { var e = new Error(message); e.code = code || "E_FREE_HTML"; throw e; }
  function contract() {
    var d = V._.block("cs-free-design");
    if (!d || d.schemaVersion !== 1) fail("Missing cs-free-design contract", "E_FREE_CONTRACT");
    return d;
  }
  function active(s) { return !!s && s.type !== "cover" && typeof s.free?.html === "string"; }
  function bytes(s) { return new TextEncoder().encode(s).length; }
  function field(path) {
    return contract().fields.allowed.some(function (p) { return new RegExp("^" + p.split(".").map(function (k) { return k === "N" ? "(?:0|[1-9][0-9]*)" : k; }).join("\\.") + "$").test(path); });
  }
  function value(s, path) {
    if (!field(path)) return "";
    var v = path.split(".").reduce(function (o, k) { return o == null ? undefined : o[k]; }, s);
    if (path === "number" && v && typeof v === "object") return String(v.value ?? "") + (v.unit ? " " + v.unit : "");
    return typeof v === "string" || typeof v === "number" ? String(v) : "";
  }
  function decode(s) {
    return s.replace(/&(#x[0-9a-f]+|#[0-9]+|amp|lt|gt|quot|apos|nbsp|lrm|rlm);/gi, function (m, k) {
      if (k[0] !== "#") return { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00a0", lrm: "\u200e", rlm: "\u200f" }[k.toLowerCase()] || m;
      var n = k[1].toLowerCase() === "x" ? parseInt(k.slice(2), 16) : +k.slice(1);
      return n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : "\ufffd";
    });
  }
  function attr(name, v, d) {
    if (!d.html.attributes.includes(name) || /(?:javascript\s*:|url\s*\()/i.test(v)) return null;
    if (name === "class") return v.split(/\s+/).filter(function (x) { return new RegExp(d.html.classPattern).test(x); }).join(" ");
    if (name === "dir") return /^(rtl|ltr|auto)$/.test(v) ? v : null;
    if (name === "data-field") return field(v) ? v : null;
    if (name === "data-icon") return Object.hasOwn(V._.block("cs-icon-pack")?.icons || {}, v) ? v : null;
    if (name === "data-object") return (V._.block("cs-icon-objects")?.objects || []).some(function (o) { return o.id === v; }) ? v : null;
    if (name === "data-picture") return /^[A-Za-z0-9_-]{1,64}$/.test(v) ? v : null;
    if (name === "data-fit") return /^(cover|contain)$/.test(v) ? v : null;
    var a = d.art, enums = { "data-size": a.icon.sizes, "data-treatment": a.icon.treatments, "data-mark": a.mark.values, "data-tone": a.tone.values, "data-from": a.chat.values };
    if (enums[name]) return enums[name].includes(v) ? v : null;
    if (name === "data-role") return /^(hero|title|h1|h2|body|small|micro|number|chip|tool)$/.test(v) ? v : null;
    return /^[a-zA-Z0-9_.-]{0,100}$/.test(v) ? v : null;
  }
  // A small whitelist parser. Unknown elements and their subtrees are dropped; unknown voids cannot swallow following copy.
  // Malformed, deeply nested or unterminated input is refused, rather than repaired into a different executable DOM.
  function parse(input) {
    var d = contract(), s = String(input), root = { children: [] }, stack = [{ tag: "", node: root }], i = 0;
    if (bytes(s) > d.html.maxBytes) fail("free.html exceeds maxBytes");
    function add(n) { var p = stack[stack.length - 1].node; if (p) p.children.push(n); }
    while (i < s.length) {
      if (s[i] !== "<") { var end = s.indexOf("<", i); if (end < 0) end = s.length; add({ text: decode(s.slice(i, end)) }); i = end; continue; }
      if (s.slice(i, i + 4) === "<" + "!--") { var ce = s.indexOf("-->", i + 4); if (ce < 0) fail("Unterminated HTML comment"); i = ce + 3; continue; }
      var start = i++, close = s[i] === "/"; if (close) i++;
      var tag = /^[a-z][a-z0-9-]*/i.exec(s.slice(i));
      if (!tag) { add({ text: "<" }); i = start + 1; continue; }
      tag = tag[0].toLowerCase(); i += tag.length;
      var attrs = {}, rawAttrs = Object.create(null), names = [], self = false;
      while (i < s.length && s[i] !== ">") {
        if (/\s/.test(s[i])) { i++; continue; }
        if (s[i] === "/" && s[i + 1] === ">") { self = true; i++; break; }
        var am = /^[^\s=<>/'"`]+/.exec(s.slice(i)); if (!am) fail("Malformed HTML attribute");
        var name = am[0].toLowerCase(), av = ""; i += am[0].length;
        while (/\s/.test(s[i] || "") && i < s.length) i++;
        if (s[i] === "=") {
          i++; while (/\s/.test(s[i] || "") && i < s.length) i++;
          var q = s[i];
          if (q === '"' || q === "'") { var qe = s.indexOf(q, ++i); if (qe < 0) fail("Unterminated HTML attribute"); av = s.slice(i, qe); i = qe + 1; }
          else { var vm = /^[^\s<>`'"=]+/.exec(s.slice(i)); if (!vm) fail("Malformed HTML value"); av = vm[0]; i += av.length; }
        }
        av = decode(av); names.push(name); rawAttrs[name] = av;
        var safe = attr(name, av, d); if (safe !== null && !Object.hasOwn(attrs, name)) attrs[name] = safe;
      }
      if (s[i] !== ">") fail("Unterminated HTML tag"); i++;
      if (!close && stack.some(function (p) { return p.node?.attrs?.["data-picture"]; })) fail("A picture placeholder must be empty");
      if (!close && Object.hasOwn(rawAttrs, "data-picture")) {
        if (tag !== "div" || !attrs["data-picture"] || names.some(function (k, at) { return !/^(class|data-picture|data-fit)$/.test(k) || names.indexOf(k) !== at; }) ||
            Object.hasOwn(rawAttrs, "data-fit") && !attrs["data-fit"]) fail("Use an empty div with data-picture and optional data-fit=cover|contain");
      } else if (!close && Object.hasOwn(rawAttrs, "data-fit")) fail("data-fit belongs to a picture placeholder");
      if (attrs["data-object"] && attrs["data-size"] && !d.art.object.sizes.includes(attrs["data-size"])) delete attrs["data-size"];
      if (close) { for (var j = stack.length - 1; j > 0; j--) if (stack[j].tag === tag) { stack.length = j; break; } continue; }
      var allowed = d.html.tags.includes(tag), node = allowed && stack[stack.length - 1].node ? { tag: tag, attrs: attrs, children: [] } : null;
      if (node) add(node);
      if (/^(script|style|textarea|title|xmp|iframe|noembed|noframes|plaintext)$/.test(tag)) {
        var raw = new RegExp("<\\/" + tag + "\\s*>", "ig"); raw.lastIndex = i; var match = raw.exec(s); i = match ? raw.lastIndex : s.length; continue;
      }
      if (!self && !/^(br|img|hr|input|meta|link|source|area|base|embed|wbr|param|track|col)$/.test(tag)) stack.push({ tag: tag, node: node });
      if (stack.length > 64) fail("HTML nesting exceeds 64");
    }
    function pictures(n) {
      if (n.attrs?.["data-picture"] && n.children.some(function (c) { return c.tag || c.text.trim(); })) fail("A picture placeholder must be empty");
      (n.children || []).forEach(pictures);
    }
    pictures(root); return root;
  }
  function literals(input) {
    var out = [];
    function walk(n) { if (n.text !== undefined) { if (n.text.trim()) out.push(n.text); return; } if (n.attrs?.["data-field"]) return; n.children.forEach(walk); }
    walk(parse(input)); return out;
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function serialize(n) {
    if (n.text !== undefined) return esc(n.text);
    if (!n.tag) return n.children.map(serialize).join("");
    return "<" + n.tag + Object.keys(n.attrs).map(function (k) { return " " + k + '="' + esc(n.attrs[k]) + '"'; }).join("") + ">" + n.children.map(serialize).join("") + (n.tag === "br" ? "" : "</" + n.tag + ">");
  }
  function sanitize(input) { return serialize(parse(input)); }
  function edit(input, index, text) {
    var tree = parse(input), count = 0, done = false;
    function walk(n) {
      if (n.attrs && Object.hasOwn(n.attrs, "data-edit") && !n.attrs["data-field"]) { if (count++ === +index) { n.children = [{ text: String(text) }]; done = true; } return; }
      (n.children || []).forEach(walk);
    }
    walk(tree); if (!done) fail("Free edit target no longer exists"); return serialize(tree);
  }
  function expected(s, key) {
    var seq = 0, edits = 0, out = Object.create(null);
    function text(n) { return n.text !== undefined ? n.text : n.tag === "br" ? "\n" : n.children.map(text).join(""); }
    function walk(n, editable) {
      if (n.text !== undefined) { if (n.text.trim() && !editable) out[s.id + ".free." + seq++] = n.text; return; }
      var path = n.attrs?.["data-field"];
      if (path) { out[s.id + "." + path + "." + seq++] = value(s, path); return; }
      if (!editable && n.attrs && Object.hasOwn(n.attrs, "data-edit")) { out[s.id + ".free-edit." + edits++] = text(n); editable = true; }
      n.children.forEach(function (ch) { walk(ch, editable); });
    }
    walk(parse(s.free.html), false); return out[key] ?? null;
  }
  // Base rules of the free lane, scoped to one slide like its own css (kept out of primitives.css: they are not archetype rules).
  function base(id) {
    var p = ".cs-slide[data-cs-slide=\"" + id + "\"] ", f = p + ".cs-free ", c = f + ".f-chat > [data-from";
    return p + ".cs-content.cs-free{--cs-fs-h:var(--cs-fs-h2);display:flex;flex-direction:column;gap:0;padding:0;text-align:start}" +
      p + ".cs-content.cs-free > :only-child{flex:1 1 auto;min-block-size:0}" +
      f + "[data-free-literal]{font:inherit;color:inherit;text-wrap:inherit}" +
      f + "h2," + f + "h3{font-family:var(--cs-font-heading);font-weight:var(--cs-wght-heading);font-size:var(--cs-fs-h2);line-height:var(--cs-lh-heading)}" +
      f + "em{font-style:normal}" + f + ".cs-ltr{font-weight:inherit}" + f + "style{display:none}" +
      f + "[data-picture]{position:relative;min-inline-size:0;min-block-size:0;overflow:hidden;flex-shrink:0}" +
      f + "[data-picture] > img{position:absolute;inset:0;display:block;width:100%;height:100%;object-position:50% 50%}" +
      f + ".f-chat{display:flex;flex-direction:column;gap:calc(var(--cs-unit)*3)}" +
      c + "]{max-inline-size:85%;padding:calc(var(--cs-unit)*3);border-radius:calc(var(--cs-unit)*3);background:var(--cs-surface);color:var(--cs-ink);border:3px solid var(--cs-ink)}" +
      c + "=\"me\"]{align-self:flex-end;background:var(--cs-accent);color:var(--cs-on-accent)}" +
      c + "=\"them\"]{align-self:flex-start}";
  }
  function css(input, id) {
    var d = contract(), s = String(input || ""), out = [], pos = 0;
    function bad() { fail("Invalid or unsafe free.css", "E_FREE_CSS"); }
    if (bytes(s) > d.css.maxBytes || /[\\@<>\u0000-\u0008\u000b\u000e-\u001f]|\/\*|\*\/|!\s*important/i.test(s)) bad();
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) bad();
    var prefix = '.cs-slide[data-cs-slide="' + id + '"] .cs-free';
    function selector(x) {
      var rest = x.trim(), tokens = 0;
      while (rest) {
        var m = /^(?:\s+|[>+~]\s*|\.(?:f|cs)-[a-z0-9-]+\b|::(?:before|after)\b|:(?:first-child|last-child)\b|:nth-child\(\s*(?:odd|even|[+-]?[0-9]*n(?:\s*[+-]\s*[0-9]+)?|[0-9]+)\s*\)|\[(?:[a-z][a-z0-9-]*)(?:\s*(?:[~|^$*]?=)\s*(?:"[a-zA-Z0-9_. -]*"|'[a-zA-Z0-9_. -]*'|[a-zA-Z0-9_.-]+))?\s*\]|[a-z][a-z0-9-]*)/.exec(rest);
        if (!m) bad(); var t = m[0];
        if (t[0] === "[" && !d.html.attributes.includes(/^\[([a-z0-9-]+)/.exec(t)[1])) bad();
        if (/^[a-z]/.test(t) && !d.html.tags.includes(t)) bad();
        if (!tokens && /^[>+~]/.test(t)) bad();
        tokens++; rest = rest.slice(t.length);
      }
      if (!tokens || /[>+~]\s*$/.test(x)) bad();
      x = x.trim();
      if (x.startsWith(".cs-free ")) { if (/^\s*[+~]/.test(x.slice(8))) bad(); return prefix + x.slice(8); }
      return x === ".cs-free" ? prefix : prefix + " " + x;
    }
    // Split only outside strings and function parentheses, so gradients, grid areas and quoted content remain intact.
    function split(s, sep) {
      var parts = [], from = 0, depth = 0, quote = "";
      for (var i = 0; i < s.length; i++) { var c = s[i]; if (quote) { if (c === quote) quote = ""; continue; } if (c === '"' || c === "'") quote = c; else if (c === "(") depth++; else if (c === ")") { if (--depth < 0) bad(); } else if (c === sep && !depth) { parts.push(s.slice(from, i)); from = i + 1; } }
      if (depth || quote) bad(); parts.push(s.slice(from)); return parts;
    }
    while (pos < s.length) {
      if (!s.slice(pos).trim()) break;
      var open = s.indexOf("{", pos), end = s.indexOf("}", open); if (open < 0 || end < 0) bad();
      var selectors = split(s.slice(pos, open), ",").map(selector), body = s.slice(open + 1, end), decls = [];
      if (/[{}]/.test(body)) bad();
      split(body, ";").forEach(function (decl) {
        if (!decl.trim()) return; var colon = decl.indexOf(":"), p = decl.slice(0, colon).trim(), v = decl.slice(colon + 1).trim();
        if (colon < 0 || !d.css.properties.includes(p) || !v || /!/.test(v)) bad();
        var low = v.toLowerCase().replace(/\s+/g, " ");
        if (d.css.forbiddenValues.some(function (x) { return low.includes(x); }) || /(?:url|expression|image-set|element)\s*\(|javascript\s*:/.test(low)) bad();
        if (p === "font-family" && !d.css.fontFamilyValues.includes(v) || p === "text-align" && low === "justify" || p === "position" && /^(fixed|sticky)$/.test(low)) bad();
        if (p === "content" && !/^(?:"[^"\n]*"|'[^'\n]*')$/.test(v)) bad();
        var funcs = [...v.matchAll(/([a-zA-Z][a-zA-Z0-9-]*)\s*\(/g)].map(function (m) { return m[1]; });
        if (funcs.some(function (f) { return !/^(var|calc|min|max|clamp|repeat|minmax|rgb|rgba|hsl|hsla|linear-gradient|rotate|scale|scaleX|scaleY|translate|translateX|translateY)$/.test(f); })) bad();
        if (/var\(\s*(?!--cs-[a-z0-9-]+\s*\))/.test(v)) bad();
        if (p === "transform" && (funcs.some(function (f) { return !/^(rotate|scale|scaleX|scaleY|translate|translateX|translateY|var|calc)$/.test(f); }) || !/^(none|(?:rotate|scale|translate)[XY]?\()/.test(v))) bad();
        if ((p === "background" || p === "background-color") && /gradient/.test(low) && (p !== "background" || !/^linear-gradient\(\s*[+-]?(?:\d+(?:\.\d*)?|\.\d+)deg\s*,/.test(v))) bad();
        split(v, "\u0000"); decls.push(p + ":" + v);
      });
      out.push(selectors.join(",") + "{" + decls.join(";") + "}"); pos = end + 1;
    }
    return out.join("\n");
  }
  function artContext(cx, tk) {
    return { slideId: cx.id, seed: cx.id + "|free", rtl: cx.dir !== "ltr", lang: cx.lang, digits: cx.digits, tokens: tk, art: cx.tokens.art || {}, data: { pack: V._.block("cs-icon-pack"), objects: V._.block("cs-icon-objects"), marks: V._.block("cs-art-marks") } };
  }
  function markExtra(A, m, U, ctx, o, name) {
    if (/^arrow/.test(name)) { var p = [U.x + U.w / 2, U.y + U.h + 8]; return A.place(m, { from: p, to: [p[0] + (name === "arrow-hook" ? (ctx.rtl ? -70 : 70) : 0), p[1] + 72] }, ctx, o); }
    var size = Math.min(72, Math.max(36, U.h * .6));
    return A.place(m, { x: U.x - size * .7, y: U.y - size * .4, w: size, h: size }, ctx, o);
  }
  function markColor(r, node, cx, underline) {
    var st = getComputedStyle(node), base = cx?.tokens?.roles || {}, tk = {};
    ["bg", "surface", "ink", "accent", "accent2"].forEach(function (k) { tk[k] = st.getPropertyValue("--cs-" + (k === "accent2" ? "accent-2" : k)).trim() || base[k]; });
    r.c = CS.art.marks.color(tk, underline ? "ink" : "accent");
  }
  function tone(n, tk, base) {
    // A local panel has one ground. A brand can make the preset's two-ground ink unattainable;
    // recheck it against this panel's actual ground before handing the palette to its art.
    tk = Object.assign({}, tk);
    // A tone that keeps the slide ground and moves the surface (creator field: a yellow card on paper) paints the surface.
    if (base && tk.bg === base.bg && tk.surface && tk.surface !== base.surface) tk.bg = tk.surface;
    ["ink", "inkMuted"].forEach(function (k) { tk[k] = C.color.ensureContrast(tk[k] || tk.ink, tk.bg, 4.5).hex; });
    ["bg", "surface", "ink", "inkMuted", "accent", "onAccent", "line"].forEach(function (k) { if (tk[k]) n.style.setProperty("--cs-" + ({ inkMuted: "ink-muted", onAccent: "on-accent" }[k] || k), tk[k]); });
    n.style.backgroundColor = "var(--cs-bg)"; n.style.color = "var(--cs-ink)";
    return tk;
  }
  function compose(cx) {
    if (!active(cx.slide)) return null;
    var tree = parse(cx.slide.free.html), scoped = css(cx.slide.free.css, cx.id), main = document.createElement("main"), seq = 0, edits = 0, marks = 0;
    main.className = "cs-content cs-free"; main.dataset.layer = "content"; main.dir = cx.dir;
    function label(n, text, path) {
      var role = n.getAttribute("data-role") || (/^(title|headline)$/.test(path) || /^H[23]$/.test(n.tagName) ? "h2" : "body");
      C.compose.label(n, text, cx, { slot: path || "free", index: seq++, role: role });
      n.dataset.floor = role === "body" ? "42" : "30"; n.dataset.fit = "css";
    }
    function build(node, parent, tk, editable) {
      if (node.text !== undefined) {
        if (!node.text.trim()) { parent.appendChild(document.createTextNode(node.text)); return; }
        var span = document.createElement("span");
        if (editable) span.innerHTML = C.compose.html(node.text, cx);
        else { span.dataset.role = parent.getAttribute("data-role") || (/^H[23]$/.test(parent.tagName) ? "h2" : "body"); label(span, node.text); span.dataset.freeLiteral = "1"; }
        parent.appendChild(span); return;
      }
      var n = document.createElement(node.tag), a = node.attrs;
      Object.keys(a).forEach(function (k) { n.setAttribute(k, a[k]); }); parent.appendChild(n);
      if (a["data-picture"]) {
        n.classList.add("cs-media-slot"); n.dataset.slot = "media"; n.dataset.kind = "media"; n.dataset.m = "media";
        C.compose.media(n, { slot: "photo", assetId: a["data-picture"], imageOnly: true, calmZone: "bottom" }, cx);
        if (n.firstElementChild) n.firstElementChild.style.objectFit = a["data-fit"] || "cover";
        return;
      }
      if (a["data-tone"]) { var name = a["data-tone"]; tk = cx.tokens.tones?.[name] || (name === "s1" || name === "s2" ? Object.assign({}, tk, { bg: cx.tokens.css["--cs-art-" + name] || tk.surface, ink: C.color.onColor(cx.tokens.css["--cs-art-" + name] || tk.surface), inkMuted: C.color.onColor(cx.tokens.css["--cs-art-" + name] || tk.surface) }) : tk); tk = tone(n, tk, cx.tokens.roles); }
      var path = a["data-field"], isEdit = Object.hasOwn(a, "data-edit") && !path;
      if (path && editable) fail("data-edit must contain literal copy only");
      if (path) { label(n, value(cx.slide, path), path); n.dataset.edit = "text"; }
      else if (isEdit && !editable) {
        n.dataset.freeEdit = edits++; n.dataset.edit = "text";
        // One editable literal owns its complete subtree; labels inside it retain the authored inline structure.
        n.dataset.slotKey = cx.id + ".free-edit." + n.dataset.freeEdit; n.dataset.slot = "free"; n.dataset.kind = "text"; n.dataset.role = a["data-role"] || (/^H[23]$/.test(n.tagName) ? "h2" : "body"); n.dataset.fit = "css"; n.dataset.field = "free-edit." + n.dataset.freeEdit;
        node.children.forEach(function (ch) { build(ch, n, tk, true); });
      } else { n.removeAttribute("data-edit"); node.children.forEach(function (ch) { build(ch, n, tk, editable); }); }
      var A = CS.art, ctx = artContext(cx, tk), art;
      if (a["data-icon"]) art = A?.icon?.(a["data-icon"], { ctx: ctx, size: a["data-size"] || "md", treatment: a["data-treatment"] || "bare" });
      else if (a["data-object"]) art = A?.object?.(a["data-object"], { ctx: ctx, size: contract().art.object.sizes.includes(a["data-size"]) ? a["data-size"] : "md", treatment: a["data-treatment"] || "bare" });
      if (art) n.appendChild(art);
      if (a["data-mark"]) { n.dataset.markTarget = a["data-mark"]; n.dataset.markId = cx.id + "-free-" + marks++; }
    }
    tree.children.forEach(function (n) { build(n, main, cx.tokens.roles, false); });
    var style = document.createElement("style"); style.dataset.csFreeCss = ""; style.textContent = base(cx.id) + (scoped || ""); main.appendChild(style);
    return main;
  }
  V.free = { active: active, contract: contract, parse: parse, sanitize: sanitize, literals: literals, css: css, field: field, value: value, edit: edit, expected: expected, compose: compose, markExtra: markExtra, markColor: markColor };
})();
