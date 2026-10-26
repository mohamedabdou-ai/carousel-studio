/* src/visual/geometry.js - owned by V1b. CS.visual.geometry (spec 4.1-4.2): zone(preset, h, type) -> the computed body zone {x, y, w, h}
 * (registry.geometry(h).body minus the preset's own end padding: poster 48, heritage 44, 24 on their single-post type), and
 * recipe(name, {zone, T, kind, rtl, ...}) -> {anchor, text, ok, reason, owner, A, caption?}. Rects are body-zone px, x from the left;
 * "start" is the right side unless rtl === false. T is the fitted text height, G = 40 the gap, A = zone.h - T - G.
 * opts: zone T kind (icon mock scene chart numeral field photo word pattern rows) n (rows) rtl field seam captionH footH pillar (272 344 380)
 * pillarH ("text") phone parts (elements in the owner) words side ("start" for half) top (corner) share (half, 45-50) canvasW.
 * reasons: recipe text-share anchor-min rows-max words start-short pillar text-tall full-min band-min corner-collide center-min half-thin.
 * UNITS: every length px from the zone origin (a bleed has x < 0; canvasW is the canvas width); share (half) is percent 0-100, never a fraction. ROWS: at
 * most rowsMax = 5 icon rows (S-21): six to eight rows are a plain list with no anchor claim, so recipe() reports rows-max for n > 5 and limits() answers
 * for 5 rows (the same in _cs/space.py). */
(function () {
  var G = 40, GAP = 20, ROWS = 5, PAD = { poster: 48, heritage: 44 };
  var SIZE = { icon: [280, 560], mock: [300, 560], scene: [320, 0], chart: [360, 0], numeral: [300, 0], field: [280, 0], photo: [320, 0], word: [280, 0], pattern: [280, 0] };
  var OWNER = { start: 1, end: 1, band: 1, half: 1 };

  function zone(preset, h, type) {
    var id = preset && preset.id || preset, b = null, pad = Object.prototype.hasOwnProperty.call(PAD, id) ? (type === "poster" ? 24 : PAD[id]) : 0;
    h = h || 1440;
    try { b = CS.core.registry.geometry(h).body; } catch (e) { b = null; }
    b = b || { x: 114, y: 261, w: 852, h: 888 + h - 1440 };
    return { x: b.x, y: b.y, w: b.w, h: b.h - pad };
  }

  /** [min, max] anchor height in px (4.5), max 0 = none; rows are 128 a row (at most ROWS) plus 40 of card padding. */
  function limits(kind, n) {
    var k = Math.max(1, Math.min(ROWS, Math.floor(n || 3)));
    return kind === "rows" ? [128 * k, 128 * k + 40] : SIZE[kind] || [280, 0];
  }

  function recipe(name, o) {
    o = o || {};
    var z = o.zone || zone(), W = z.w, H = z.h, zx = z.x == null ? 114 : z.x, cw = o.canvasW || 1080, T = o.T || 0, kind = o.kind || "icon", rtl = o.rtl !== false,
        lim = limits(kind, o.n), A = H - T - G, cap = o.captionH || 0, right = (name === "start") === rtl, r, a, P, ph, sm, av, side, fh, hw;
    r = { anchor: null, text: { x: 0, y: 0, w: W, h: T }, ok: true, reason: "", owner: !!(OWNER[name] || o.field || kind === "field"), A: A };
    function fail(why) { if (r.ok) { r.ok = false; r.reason = why; } }
    if ((name === "under" || name === "over" || name === "band") && T * 100 > 55 * H) fail("text-share");
    if (o.words > 12 && (name === "half" || o.phone)) fail("words");
    if (kind === "rows" && o.n > ROWS) fail("rows-max");
    switch (name) {
      case "under": case "over":
        sm = name === "over" && (o.seam != null ? o.seam : kind === "field" || o.field ? 24 : 0) || 0;
        a = Math.min(A - sm, lim[1] || A);
        r.anchor = { x: 0, y: name === "over" ? sm : T + G, w: W, h: a };
        if (name === "over") r.text.y = sm + a + G;
        if (a < lim[0]) fail("anchor-min");
        break;
      case "start": case "end":
        P = o.pillar || (o.phone ? 380 : kind === "icon" ? 272 : 344);
        ph = o.pillarH === "text" ? Math.min(H, Math.max(T, 420)) : H;
        r.anchor = { x: right ? W - P : 0, y: Math.floor((H - ph) / 2), w: P, h: ph };
        r.text = { x: right ? 0 : P + GAP, y: Math.floor((H - T) / 2), w: W - P - GAP, h: T };
        if ([272, 344, 380].indexOf(P) < 0) fail("pillar");
        if (T > H) fail("text-tall"); else if (T < 488 && !(o.parts >= 2)) fail("start-short");
        break;
      case "full":
        av = A - (cap ? cap + G : 0);
        r.anchor = { x: 0, y: T + G, w: W, h: av };
        if (cap) r.caption = { x: 0, y: T + G + av + G, w: W, h: cap };
        if (av < 620) fail("full-min");
        break;
      case "band":
        r.anchor = { x: -zx, y: T + G, w: cw, h: Math.min(A, Math.floor(H * 56 / 100)) };
        if (A < Math.floor(H * 40 / 100)) fail("band-min");
        break;
      case "corner":
        r.anchor = { x: rtl ? 0 : W - 340, y: o.top ? 0 : H - 340, w: 340, h: 340 };
        if (o.top) r.text.y = 340 + G;
        if (T + G > H - 340) fail("corner-collide");
        break;
      case "center":
        fh = o.footH == null ? 96 : o.footH;
        av = H - T - fh - 2 * G;
        side = Math.max(440, Math.min(560, av));
        r.anchor = { x: Math.floor((W - side) / 2), y: T + G + Math.floor((av - side) / 2), w: side, h: side };
        r.caption = { x: 0, y: H - fh, w: W, h: fh };
        if (av < 440) fail("center-min");
        break;
      case "half":
        hw = Math.floor(W * (o.share || 50) / 100);
        right = (o.side === "start") === rtl;
        r.anchor = { x: right ? W - hw : -zx, y: 0, w: hw + (right ? cw - zx - W : zx), h: H };
        r.text = { x: right ? 0 : hw + GAP, y: Math.floor((H - T) / 2), w: W - hw - GAP, h: T };
        if (T > H) fail("text-tall");
        if (o.parts != null && o.parts < 3) fail("half-thin");
        break;
      default:
        r.ok = false; r.reason = "recipe";
    }
    return r;
  }

  CS.visual._.register("geometry", { zone: zone, recipe: recipe, limits: limits, G: G, GAP: GAP, rowsMax: ROWS, recipes: ["under", "over", "start", "end", "full", "band", "corner", "center", "half"] });
})();
