/* ui/actions.js · named user actions used by several screens: preset, occasion, swipe cue, digits, dialect, media assets. */

function convertText(s, to) {
  if (typeof s !== "string" || !s) return s;
  return guard("text.digits.convert", function () { return CS.core.text.digits.convert(s, to); }, s);
}

/** Convert every digit of all visible copy and the caption pack to one system (never touches handles, tags, URLs; number.value stays Western). */
function convertSpecDigits(spec, to) {
  var next = clone(spec);
  next.slides.forEach(function (sl) {
    ["kicker", "headline", "sub", "title", "body", "bridge", "attribution"].forEach(function (k) { if (sl[k]) sl[k] = convertText(sl[k], to); });
    if (sl.bullets) sl.bullets = sl.bullets.map(function (b) { return convertText(b, to); });
    if (sl.sides) sl.sides = sl.sides.map(function (sd) { return Object.assign({}, sd, { label: sd.label ? convertText(sd.label, to) : sd.label, text: convertText(sd.text, to) }); });
    if (sl.cta && sl.cta.text) sl.cta.text = convertText(sl.cta.text, to);
    if (sl.number && sl.number.unit) sl.number.unit = convertText(sl.number.unit, to);
  });
  var cp = next.captionPack;
  if (cp) {
    ["firstLine", "keywordLine", "body", "cta"].forEach(function (k) { if (cp[k]) cp[k] = convertText(cp[k], to); });
    ["perSlide", "alt"].forEach(function (k) { if (cp[k]) cp[k] = cp[k].map(function (x) { return convertText(x, to); }); });
  }
  if (next.hook && next.hook.cover) next.hook.cover = convertText(next.hook.cover, to);
  next.locale = Object.assign({}, next.locale, { digits: to });
  return next;
}

var CUE_BY_APP_LANGUAGE = { ar: "arrow-rtl", en: "arrow-ltr", mixed: "neutral" };

/** A copy of the spec with the text-check record of one asset set (rec) or removed (null); spec.ext is dropped when it ends up empty. */
function withAssetCheck(spec, assetId, rec) {
  var ext = Object.assign({}, spec.ext || {});
  var checks = Object.assign({}, ext.assetChecks || {});
  if (rec) checks[assetId] = rec; else delete checks[assetId];
  if (Object.keys(checks).length) ext.assetChecks = checks; else delete ext.assetChecks;
  var next = Object.assign({}, spec);
  if (Object.keys(ext).length) next.ext = ext; else delete next.ext;
  return next;
}

function attachActions(ctx) {
  ctx.applyPreset = function (id) {
    var p = ctx.preset(id);
    if (!p) return false;
    var changed = ctx.setStyle({ presetId: id + "@" + p.version });
    if (changed) toast(t("style.preset.applied", { name: msgOf(p.name) }), "ok", { action: { label: t("common.undo"), fn: function () { ctx.undo(); } } });
    return changed;
  };

  ctx.applyOccasion = function (id) {
    return ctx.setStyle({ occasionId: id || undefined });
  };

  ctx.setAppLanguage = function (lang) {
    return ctx.setLocale({ appLanguage: lang, swipeCue: CUE_BY_APP_LANGUAGE[lang] || "neutral" });
  };

  ctx.setCue = function (cue) { return ctx.setLocale({ swipeCue: cue }); };

  ctx.setDigits = function (to) {
    if (ctx.spec.locale.digits === to) return false;
    var done = ctx.commit(function (spec) { return convertSpecDigits(spec, to); }, { path: "/locale/digits" });
    if (done) {
      ctx.runTextQa();
      toast(t("text.digits.changed", { system: t("digits." + to) }), "ok", { action: { label: t("common.undo"), fn: function () { ctx.undo(); } } });
    }
    return done;
  };

  ctx.setDialect = function (d) {
    if (ctx.spec.locale.dialect === d) return false;
    var register = d === "msa-white" ? "white" : d === "en" ? "white" : "dialect";
    var done = ctx.setLocale({ dialect: d, register: register });
    if (done) { ctx.runTextQa(); toast(t("text.dialect.changed"), "info"); }
    return done;
  };

  /** Only one kashida word per post, and only where the preset allows it. */
  ctx.setKashida = function (slideId, word) {
    return ctx.commit(function (spec) {
      var next = clone(spec);
      next.slides.forEach(function (s) { if (s.kashidaWord) delete s.kashidaWord; });
      if (word) next.slides[slideIndex(next, slideId)].kashidaWord = word;
      return next;
    }, { path: "/slides/kashidaWord" });
  };

  /* ---- media assets ----------------------------------------------------------------------------------------- */
  function nextAssetId(spec) {
    var used = {};
    (spec.assets || []).forEach(function (a) { used[a.id] = 1; });
    for (var i = 1; i < 100; i++) if (!used["a" + i]) return "a" + i;
    return "a" + uid("").slice(0, 6);
  }

  function readDataUri(blob) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(String(r.result)); };
      r.onerror = function () { reject(r.error); };
      r.readAsDataURL(blob);
    });
  }

  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error("image decode failed")); };
      img.src = src;
    });
  }

  /** Re-encode an image until its data URI fits the spec limit (about 90,000 characters). */
  async function shrinkToDataUri(file, keepAlpha) {
    var raw = await readDataUri(file);
    var img = await loadImage(raw);
    var sides = [1080, 800, 600, 440, 320, 220];
    var qualities = [0.86, 0.72, 0.58, 0.44];
    var type = keepAlpha ? "image/webp" : "image/jpeg";
    for (var s = 0; s < sides.length; s++) {
      var k = Math.min(1, sides[s] / Math.max(img.naturalWidth, img.naturalHeight));
      var c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(img.naturalWidth * k));
      c.height = Math.max(1, Math.round(img.naturalHeight * k));
      var g = c.getContext("2d");
      if (!keepAlpha) { g.fillStyle = "#ffffff"; g.fillRect(0, 0, c.width, c.height); }
      g.drawImage(img, 0, 0, c.width, c.height);
      for (var q = 0; q < qualities.length; q++) {
        var uri = c.toDataURL(type, qualities[q]);
        if (uri.length <= 89000) return { uri: uri, w: c.width, h: c.height, mime: /^data:([^;]+)/.exec(uri)[1] };
      }
    }
    throw new Error("image too large to embed");
  }

  /** Attach an uploaded file to a slide. Uses the assets capability when this view has it, else embeds a small data URI. */
  ctx.attachFile = async function (slideId, file, slot) {
    var kind = /^video\//.test(file.type) ? "video" : file.type === "image/svg+xml" ? "svg" : "image";
    if (!/^(image|video)\//.test(file.type)) { toast(t("visual.type.unsupported"), "warn"); return false; }
    var ref = null, w, h2, mime = file.type, bytes = file.size;
    var store = await useCap("assets");
    try {
      if (kind !== "svg") {
        var url = URL.createObjectURL(file);
        if (kind === "image") { var im = await loadImage(url); w = im.naturalWidth; h2 = im.naturalHeight; }
        URL.revokeObjectURL(url);
      }
      if (store) {
        var res = await store.upload(file, { type: file.type });
        ref = "asset:" + res.id;
        bytes = res.sizeBytes || bytes;
      } else if (kind === "video") {
        toast(t("visual.video.needs-assets"), "warn");
        return false;
      } else if (kind === "svg") {
        if (file.size > 60000) { toast(t("visual.too-large"), "warn"); return false; }
        ref = await readDataUri(file);
      } else {
        var small = await shrinkToDataUri(file, slot === "cutout" || file.type === "image/png");
        ref = small.uri; w = small.w; h2 = small.h; mime = small.mime;
        bytes = Math.round(small.uri.length * 0.75);
      }
    } catch (e) {
      reportError("attachFile", e);
      toast(t("visual.upload.failed"), "error");
      return false;
    }
    var assetId = nextAssetId(ctx.spec);
    /* A file arrives as AI-generated when the person marked the slide's image as AI before uploading (the switch on the Visual tab),
       and it always starts unchecked: the text check is recorded per asset id, so a replaced image must be looked at again. */
    var before = (ctx.slide(slideId) || {}).media || {};
    var arrivesAi = before.ai === true;
    var asset = { id: assetId, kind: kind, ref: ref, mime: mime, bytes: bytes, aiGenerated: arrivesAi };
    if (w) asset.width = w;
    if (h2) asset.height = h2;
    ctx.commit(function (spec) {
      var next = Object.assign({}, spec, { assets: (spec.assets || []).concat([asset]) });
      var i = slideIndex(next, slideId);
      var old = next.slides[i].media && next.slides[i].media.assetId;
      var media = Object.assign({}, next.slides[i].media, { slot: slot, assetId: assetId, ai: arrivesAi });
      next = setPath(next, ["slides", i, "media"], media);
      return old ? withAssetCheck(next, old, null) : next;
    }, { slides: [slideId], path: "/assets" });
    toast(t("visual.attached"), "ok");
    return true;
  };

  ctx.removeMedia = function (slideId) {
    ctx.commit(function (spec) {
      var i = slideIndex(spec, slideId);
      var gone = spec.slides[i].media && spec.slides[i].media.assetId;
      var next = setPath(spec, ["slides", i, "media"], { slot: "none", ai: false });
      if (gone) {
        var stillUsed = next.slides.some(function (s) { return s.media && s.media.assetId === gone; });
        if (!stillUsed) {
          next = Object.assign({}, next, { assets: (next.assets || []).filter(function (a) { return a.id !== gone; }) });
          next = withAssetCheck(next, gone, null);
        }
      }
      return next;
    }, { slides: [slideId], path: "/slides/media" });
  };

  ctx.setAiFlag = function (slideId, on) {
    ctx.commit(function (spec) {
      var i = slideIndex(spec, slideId);
      var media = Object.assign({}, spec.slides[i].media, { ai: !!on });
      var next = setPath(spec, ["slides", i, "media"], media);
      if (media.assetId) next = Object.assign({}, next, { assets: (next.assets || []).map(function (a) { return a.id === media.assetId ? Object.assign({}, a, { aiGenerated: !!on }) : a; }) });
      return next;
    }, { slides: [slideId], path: "/slides/media/ai" });
  };

  /** The person's own confirmation that a flagged AI image holds no letters and no watermark (gate A1.text-check, never overridable).
   *  It is stored as spec.ext.assetChecks[assetId] = { textChecked, at } and is gone as soon as the asset is replaced or removed. */
  ctx.setTextChecked = function (assetId, on) {
    if (!assetId) return;
    ctx.commit(function (spec) { return withAssetCheck(spec, assetId, on ? { textChecked: true, at: isoNow() } : null); },
      { slides: [], layout: false, path: "/ext/assetChecks" });
    ctx.runQa();
  };
  ctx.textChecked = function (assetId) {
    var checks = ctx.spec.ext && ctx.spec.ext.assetChecks;
    return !!(checks && assetId && checks[assetId] && checks[assetId].textChecked === true);
  };

  /** «الرقم ده من عندي» (gate SRC1.missing): the person states the number themselves. A source of kind "user" that holds the number is
   *  added and linked to the slide, so the finding is answered by the person's own word and by nothing else. */
  ctx.attestNumber = function (finding) {
    var quoted = /«([^»]+)»|“([^”]+)”/.exec(msgOf(finding.msg) || "");
    var text = quoted ? (quoted[1] || quoted[2]) : "";
    var taken = (ctx.spec.sources || []).map(function (x) { return x.id; });
    var n = 1;
    while (taken.indexOf("src" + n) >= 0) n++;
    var source = { id: "src" + n, kind: "user", ref: "user-attested", verified: true };
    if (text) source.excerpt = text;
    ctx.commit(function (spec) {
      var next = Object.assign({}, spec, { sources: (spec.sources || []).concat([source]) });
      var i = finding.slide ? slideIndex(next, finding.slide) : -1;
      if (i >= 0) next = setPath(next, ["slides", i, "sourceIds"], (next.slides[i].sourceIds || []).concat([source.id]));
      return next;
    }, { slides: finding.slide ? [finding.slide] : [], layout: false, path: "/sources" });
    ctx.runTextQa();
    toast(t("check.attested"), "ok", { action: { label: t("common.undo"), fn: function () { ctx.undo(); ctx.runTextQa(); } } });
  };

  ctx.anyAi = function () { return (ctx.spec.assets || []).some(function (a) { return a.aiGenerated; }) || ctx.slides().some(function (s) { return s.media && s.media.ai; }); };
}
