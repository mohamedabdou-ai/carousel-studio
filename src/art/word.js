
(function () {
 var art = CS.art, kit = art.kit, h = kit.html, A = Object.assign, LH = 1.15, GAP = 24, BAR = 48, PAD = 30, word = (art.word = { support: { sticker: true } }), len = t => Array.from(t.replace(/\s+/g, "")).length;

 word.derive = function (s) {
  var m = /==([^=]+)==|\*([^*]+)\*/.exec([s.headline, s.title, s.quote, s.sub, s.body].join("\n")), n = s.number || {};
  return s.type === "cta" && s.cta?.keyword || s.em || (m ? (m[1] || m[2]).trim() : n.value ? (n.value + " " + (n.unit || "")).trim() : String(s.title || s.headline || "").split(/\s+/).filter(t => !/^(عايز|عاوز|محتاج|احفظ|ابعت|لازم|the|and|your|this|with|want|save|send)$/i.test(t)).sort((a, b) => b.length - a.length)[0] || "");
 };
 function cut(t) {
  var m = t.length / 2, b = 0;
  t.replace(/[^\S\u00a0]+/g, (_, p) => { if (!/[0-9٠-٩۰-۹][%٪]?$/.test(t.slice(0, p))) b = !b || Math.abs(p - m) < Math.abs(b - m) ? p : b; });
  return b ? [t.slice(0, b), t.slice(b).trim()] : [t];
 }
 function put(l, st) { l.el.setAttribute("style", h("i", null, st).getAttribute("style")); return l.el; }

 function build(a, ctx) {
  var text = String(a.word || word.derive(ctx.slide || {})).trim(), sty = a.wordStyle || "solid", x = kit.session({ ctx: ctx }), tk = x.tk, dna = x.dna, sg = x.rtl ? -1 : 1, box = ctx.box || ctx.zone || { w: 852, h: 420 };
  if (!text) return null;
  var stk = sty === "sticker" && word.support.sticker, tile = sty === "sticker" && !stk, kb = !stk && ((ctx.visual || {}).marks || []).indexOf("kashida") >= 0, n = len(text), ln = /\s/.test(text) && n > 6 ? 2 : 1, lines = sty === "struck" && ln > 1 ? cut(text) : [text], two = lines.length > 1;
  var rx = stk ? PAD : tile ? 52 : sty === "struck" ? 16 : 0, ry = stk ? PAD : tile ? 32 : 0, avail = Math.min(852, box.w) - 2 * rx, extra = kb ? GAP + BAR : 0, S = Math.min(ln > 1 ? 360 : 520, Math.floor((box.h - 2 * ry - extra) / (ln * LH)), two ? Math.max(220, Math.floor(avail / Math.max(...lines.map(len)))) : 520);
  var labels = lines.map((t, i) => kit.label("word", i, t)), paper = tk.paper, i;
  for (i = 1; stk && i < 3; i++) labels.push(kit.label("word", i, text, { "aria-hidden": "true", "data-decor": "1" }));
  if (ctx.labelsOnly) return { el: null, boxes: [], labels: labels };
  if (S < 220 || avail < 220) return null;
  var base = { "font-size": S, "line-height": LH, "text-align": "center", "--cs-fit-ratio": (S / 520).toFixed(4), "white-space": ln > 1 && !two ? "normal" : null };
  var kids = lines.map((_, i) => put(labels[i], A({ position: "relative", color: tile ? kit.on(paper, tk) : tk.ink }, base))), wrap, w2 = { position: "relative", display: "inline-block", "max-width": avail, "margin-bottom": extra || null };
  var em = 0.58 * Math.ceil(n / ln), Se = Math.min(S, Math.floor(avail / em)), th = Math.round(ln * Se * LH), tw = Math.min(avail, Math.round(em * Se)), y0 = (box.y || 0) + (box.h - th - extra) / 2;
  var boxes = [{ x: (box.x || 0) + (box.w - tw) / 2, y: y0, w: tw, h: th, kind: "text", anchor: true }];
  if (stk) {
   var r = Math.max(6, Math.round(S / 36)), dx = sg * Math.max(dna.shadow.dx, Math.round(S / 40)), dy = Math.max(dna.shadow.dy, Math.round(S / 32));
   var lay = (l, c, ox, oy) => put(l, A({ position: "absolute", left: ox, top: oy, width: "100%", color: c, "-webkit-text-stroke": 2 * r + "px " + c }, base));
   wrap = h("div", { "data-part": "word" }, { position: "relative", width: avail }, [lay(labels[2], tk.ink, dx, dy), lay(labels[1], CS.core.color.contrast(tk.accent, tk.ink) >= 1.5 ? tk.accent : paper, 0, 0), kids[0]]);
  } else {
   var bw = dna.outline || 4, rec = (((ctx.data || {}).marks || {}).marks || []).find(m => m.id === "kashida-bar");
   if (sty === "struck") kids.forEach(k => k.setAttribute("data-mark-target", "strike-line"));
   if (kb && rec) {
    var s = kit.svg(100, 100, kit.g(kit.path(rec.d, { fill: kit.base(tk, tk.bg, false) }), x.rtl ? { transform: "matrix(-1 0 0 1 100 0)" } : null), { width: "100%", height: "100%" });
    s.setAttribute("preserveAspectRatio", "none");
    kids.push(h("div", { "data-part": "kashida" }, { position: "absolute", left: "7.5%", width: "85%", top: "100%", "margin-top": GAP, height: BAR }, s));
   }
   if (tile) {
    A(w2, { "box-sizing": "border-box", padding: "20px 40px", "background-color": paper, border: bw + "px solid " + tk.ink, "border-radius": dna.radius.card, "box-shadow": sg * 6 + "px 6px 0 " + tk.ink });
    boxes[0].ownerOf = "t"; boxes.unshift({ x: boxes[0].x - 40, y: y0 - 20, w: tw + 80, h: th + 40, kind: "owner", id: "t", fill: 1, border: bw });
   }
   wrap = h("div", { "data-part": "word" }, w2, kids);
   if (tile) kit.owner(wrap);
  }
  return { el: kit.wrap("word", x.seed, wrap, { style: { display: "flex", "flex-direction": "column", "align-items": "center", "justify-content": "center", "box-sizing": "border-box", width: box.w, height: box.h } }), boxes: boxes, labels: labels };
 }
 art.register("word", build, ["solid", "sticker", "struck"]);
})();
