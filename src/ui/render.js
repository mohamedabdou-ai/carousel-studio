/* ui/render.js · spec -> slide DOM for every surface of the Studio.
 *
 * Slides are rendered by CS.core.render into its off-screen, unscaled stage so the fit measurements are exact. The Studio then keeps
 *   - one editable render of the selected slide (mode "edit"), moved into the big frame, and
 *   - one thumb render per slide, parked in a hidden holder and cloned wherever a small copy is needed.
 * Nothing here repaints on a timer: renders follow spec changes, serialised through one queue. */

function attachRender(ctx) {
  var holder = h("div", { class: "ui-holder", hidden: true, "aria-hidden": "true" });
  ctx.holder = holder;
  ctx.root.appendChild(holder);
  var chain = Promise.resolve();
  var slideGen = {};
  var variantCache = new Map();
  function previewSpec(s) { return CS.export?.mp4?.clip?.layoutSpec(s) || s; }
  function clipPoster(s, r, i) { return CS.export?.mp4?.clip?.preview(s, ctx, r, i) || r; }
  if (CS.on) CS.on("cs:cover-clip", function () { ctx.renderAll(); });
  ctx.renderError = null;
  ctx.deck = null;
  ctx.tokens = null;

  function queue(fn) {
    var p = chain.then(fn, fn);
    chain = p.catch(function () { /* the caller handles its own rejection */ });
    return p;
  }

  function engineReady() { return !!(window.CS && CS.core && CS.core.render && CS.core.render.slide); }

  function fail(e) {
    ctx.renderError = e;
    reportError("render", e);
    ctx.bus.emit("render-error", e);
  }

  /** Render every slide as a thumb (used after structural, style and locale changes). */
  ctx.renderAll = function () {
    var gen = ++ctx.thumbGen;
    return queue(async function () {
      if (gen !== ctx.thumbGen || !engineReady()) return;
      var deck;
      try { deck = await CS.core.render.deck(previewSpec(ctx.spec), ctx.brand, { mode: "thumb", assets: ctx.assets }); }
      catch (e) { fail(e); return; }
      if (gen !== ctx.thumbGen) { try { deck.dispose(); } catch (e) { /* stage already gone */ } return; }
      await Promise.all(deck.slides.map(function (r, i) { return clipPoster(ctx.spec, r, i); }));
      ctx.renderError = null;
      var old = ctx.deck;
      clear(holder);
      ctx.thumbs.clear();
      deck.slides.forEach(function (r) {
        holder.appendChild(r.el);
        ctx.thumbs.set(r.id, { el: r.el, fit: r.fit, tokens: r.tokens });
      });
      ctx.tokens = deck.tokens;
      ctx.deck = deck;
      if (old) { try { old.dispose(); } catch (e) { /* ignore */ } }
      variantCache.clear();
      ctx.bus.emit("thumbs", { all: true });
    });
  };

  /** Re-render one slide's thumb (a text edit changes only that slide). */
  ctx.renderOne = function (id) {
    var gen = slideGen[id] = (slideGen[id] || 0) + 1;
    return queue(async function () {
      if (gen !== slideGen[id] || !engineReady()) return;
      var i = ctx.index(id);
      if (i < 0) return;
      var r;
      try { r = await CS.core.render.slide(previewSpec(ctx.spec), ctx.brand, i, { mode: "thumb", assets: ctx.assets }); }
      catch (e) { fail(e); return; }
      await clipPoster(ctx.spec, r, i);
      if (gen !== slideGen[id]) return;
      var prev = ctx.thumbs.get(id);
      if (prev && prev.el.parentNode) prev.el.remove();
      holder.appendChild(r.el);
      ctx.thumbs.set(id, { el: r.el, fit: r.fit, tokens: r.tokens });
      ctx.renderError = null;
      variantCache.clear();
      ctx.bus.emit("thumbs", { ids: [id] });
    });
  };

  /** Editable render of a slide for the big frame. */
  ctx.renderEditor = function (id) {
    return queue(async function () {
      if (!engineReady()) throw new CS.CSError("E_USAGE", "engine not loaded");
      var i = ctx.index(id);
      if (i < 0) throw new CS.CSError("E_USAGE", "unknown slide " + id);
      return clipPoster(ctx.spec, await CS.core.render.slide(previewSpec(ctx.spec), ctx.brand, i, { mode: "edit", assets: ctx.assets }), i);
    });
  };

  /** Render slide `index` of a variant spec (used by the Style tab to show every preset with this post's hook). Cached per variant. */
  ctx.renderVariant = function (key, variantSpec, index) {
    if (variantCache.has(key)) return Promise.resolve(variantCache.get(key));
    return queue(async function () {
      if (variantCache.has(key)) return variantCache.get(key);
      var r = await CS.core.render.slide(previewSpec(variantSpec), ctx.brand, index || 0, { mode: "thumb", assets: ctx.assets, useFrozen: false });
      await clipPoster(variantSpec, r, index || 0);
      holder.appendChild(r.el);
      variantCache.set(key, r.el);
      return r.el;
    });
  };

  /** A fresh render of slide `index` that the caller owns (the motion preview animates it, so it must not be shared). */
  ctx.renderFresh = function (index, mode) {
    return queue(async function () { return clipPoster(ctx.spec, await CS.core.render.slide(previewSpec(ctx.spec), ctx.brand, index, { mode: mode || "thumb", assets: ctx.assets }), index); });
  };

  /** Render a whole deck for one operation (QA, freeze, export-like checks) and always dispose it. */
  ctx.withDeck = function (spec, mode, fn, useFrozen) {
    return queue(async function () {
      var deck = await CS.core.render.deck(spec, ctx.brand, { mode: mode, assets: ctx.assets, useFrozen: useFrozen });
      try { return await fn(deck); }
      finally { try { deck.dispose(); } catch (e) { /* stage already gone */ } }
    });
  };

  /** A detached copy of the thumb of a slide, or null when it has not rendered yet. */
  ctx.thumbClone = function (id) {
    var t0 = ctx.thumbs.get(id);
    return t0 ? t0.el.cloneNode(true) : null;
  };

  ctx.fitOf = function (id) { var t0 = ctx.thumbs.get(id); return t0 ? t0.fit : null; };

  /** Put a clone of a slide into a scaled frame. Returns the frame element (empty skeleton while the slide renders). */
  ctx.slideFrame = function (id, cls) {
    var c = ctx.canvas();
    var f = makeFrame(c.w, c.h, cls);
    var el = ctx.thumbClone(id);
    if (el) f.inner.appendChild(el); else f.frame.classList.add("is-loading");
    f.frame.dataset.sid = id;
    f.frame.dataset.live = "1";
    return f;
  };

  /** Refresh every frame that shows a slide when its thumb changes. Frames are tagged with data-sid and data-live. */
  ctx.bus.on("thumbs", function (d) {
    ctx.root.querySelectorAll('.ui-frame[data-live][data-sid]').forEach(function (frame) {
      var id = frame.dataset.sid;
      if (d.ids && d.ids.indexOf(id) < 0) return;
      var el = ctx.thumbClone(id);
      var inner = frame.firstElementChild;
      if (!inner) return;
      var old = inner.querySelector(".cs-slide");
      if (el) {
        if (old) old.replaceWith(el); else inner.insertBefore(el, inner.firstChild);
        frame.classList.remove("is-loading");
      }
    });
  });

  /** Respond to spec changes: refresh whatever the change touches, coalescing bursts (colour pickers, typing). */
  var renderAllSoon = debounce(function () { ctx.renderAll(); }, 140);
  ctx.bus.on("spec", function (d) {
    if (d.slides === "all" || d.structure) renderAllSoon();
    else d.slides.forEach(function (id) { ctx.renderOne(id); });
  });
  ctx.flushRender = function () { renderAllSoon.flush(); return chain; };

  return ctx;
}

/* ---- in-place editing: read edited DOM back into spec text ------------------------------------------------------- */

/** Editable slots of a rendered slide: [{key, field, index, el}]. Uses CS.core.compose.slots, falling back to data attributes. */
function listSlots(slideEl) {
  var slots = guard("compose.slots", function () { return CS.core.compose.slots(slideEl); }, null);
  if (slots && slots.length) {
    return slots.filter(function (s) { return s.el && s.el.getAttribute("data-edit") === "text"; });
  }
  var out = [];
  slideEl.querySelectorAll('[data-edit="text"]').forEach(function (el) {
    var holderEl = el.closest("[data-field]") || el;
    var field = holderEl.getAttribute("data-field") || el.getAttribute("data-field");
    if (!field) return;
    var index = null;
    var li = el.closest("[data-m-i]");
    if (field === "bullets" && li) index = +li.getAttribute("data-m-i");
    var side = el.closest("[data-side]");
    if (side) index = +side.getAttribute("data-side");
    out.push({ key: el.getAttribute("data-slot-key") || field, field: field, index: index, el: el });
  });
  return out;
}

var BLOCK_TAGS = { DIV: 1, P: 1, LI: 1, H1: 1, H2: 1, H3: 1 };

/**
 * Read a slot back into stored markup: <mark class="cs-em"> -> ==x==, <br> / typed blocks -> \n, physical-line wrappers (.cs-ln) -> a space.
 * Engine-added characters never reach the stored copy: NBSP bindings and tatweel in the kashida word.
 */
function readSlotText(el) {
  var out = "";
  function walk(node, inKashida) {
    if (node.nodeType === 3) { out += node.nodeValue; return; }
    if (node.nodeType !== 1) return;
    var tag = node.tagName;
    if (tag === "BR") { out += "\n"; return; }
    var cls = node.classList;
    var isEm = cls && cls.contains("cs-em");
    var kash = inKashida || (cls && cls.contains("cs-kashida"));
    var isLn = cls && cls.contains("cs-ln");
    var isBlock = BLOCK_TAGS[tag] && node !== el && !isLn;
    if (isBlock && out && out.charAt(out.length - 1) !== "\n") out += "\n";
    if (isEm) out += "==";
    Array.prototype.forEach.call(node.childNodes, function (c) { walk(c, kash); });
    if (isEm) out += "==";
    if (isLn) out += " ";
  }
  walk(el, false);
  return out
    .replace(/[\u200E\u200F]/g, "")
    .replace(/\u00A0/g, " ")
    .replace(/\u0640+/g, "")
    .replace(/[ \t\f\v\r]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/====/g, "")
    .trim();
}

/** Insert plain text at the caret (paste handler) so pasted HTML never enters a slot. */
function insertPlain(text) {
  if (document.queryCommandSupported && document.queryCommandSupported("insertText")) document.execCommand("insertText", false, text);
  else {
    var sel = window.getSelection();
    if (!sel.rangeCount) return;
    var r = sel.getRangeAt(0);
    r.deleteContents();
    r.insertNode(document.createTextNode(text));
    r.collapse(false);
  }
}

/* ---- guides: safe zone, 4:5 crop, keep-outs and content box, drawn in slide coordinates -------------------------------- */

function guidesLayer(ctx, opts) {
  var k = guard("constants", function () { return CS.core.constants; }, null);
  var layer = h("div", { class: "ui-guides", "aria-hidden": "true" });
  var c = ctx.canvas();
  function box(r, cls, label) {
    return h("div", { class: "ui-guide " + cls, style: { left: r.x + "px", top: r.y + "px", width: r.w + "px", height: r.h + "px" } }, label ? h("span", { class: "ui-guide-label" }, label) : null);
  }
  var safe = (k && k.SAFE) || { x: 34, y: 45, w: 1012, h: 1350 };
  var crop = (k && k.CROP_4X5) || { x: 0, y: 45, w: 1080, h: 1350 };
  var content = (k && k.CONTENT) || { x: 114, y: 125, w: 852, h: 1190 };
  var keeps = (k && k.KEEP_OUTS) || [];
  if (opts.safe) layer.appendChild(box(safe, "ui-guide--safe", t("guides.safe")));
  if (opts.content) layer.appendChild(box(content, "ui-guide--content", t("guides.content")));
  if (opts.crop && c.h > crop.h) {
    layer.appendChild(h("div", { class: "ui-guide-shade", style: { left: 0, top: 0, width: c.w + "px", height: crop.y + "px" } }));
    layer.appendChild(h("div", { class: "ui-guide-shade", style: { left: 0, top: (crop.y + crop.h) + "px", width: c.w + "px", height: (c.h - crop.y - crop.h) + "px" } }));
    layer.appendChild(box(crop, "ui-guide--crop", t("guides.crop")));
  }
  if (opts.keepouts) keeps.forEach(function (r) { layer.appendChild(box(r, "ui-guide--keep")); });
  return layer;
}
