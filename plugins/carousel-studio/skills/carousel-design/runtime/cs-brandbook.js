/*! Carousel Studio runtime chunk cs-brandbook.js · cs-1.2.0 · Apache-2.0 */
(function () {
  "use strict";
  var CS = (window.CS = window.CS || {});
  /* ---- file: shared.js ---- */
/* brandbook/shared.js · aliases for the helpers of cs-ui.js.
 *
 * This chunk carries every surface that is not the core editor: the Brand Book, Brand Home and the Studio's secondary screens
 * (Preview, Motion, Copy, Export, About). cs-ui.js has a 200 KiB budget, so those surfaces live here and register themselves in
 * CS.ui._.screens; the shell builds them on first use. All helpers come from CS.ui._ (cs-ui.js loads first). */

CS.ui = CS.ui || {};
CS.ui._.screens = CS.ui._.screens || {};

var U = CS.ui._;
var h = U.h, icon = U.icon, clear = U.clear, bidi = U.bidi, clone = U.clone, same = U.same, uid = U.uid, isoNow = U.isoNow, pad2 = U.pad2;
var t = U.t, hasStr = U.hasStr, msgOf = U.msgOf, uiLang = U.uiLang, uiDir = U.uiDir;
var guard = U.guard, reportError = U.reportError, raf = U.raf, fmtDate = U.fmtDate, cleanText = U.cleanText, autosize = U.autosize;
var toast = U.toast, dialog = U.dialog, askText = U.askText, openMenu = U.openMenu, copyWithFeedback = U.copyWithFeedback;
var pill = U.pill, segmented = U.segmented, switchBox = U.switchBox, ltr = U.ltr, markSvg = U.markSvg;
var makeFrame = U.makeFrame, releaseFrames = U.releaseFrames, filmDirection = U.filmDirection, guidesLayer = U.guidesLayer, makeStageNav = U.makeStageNav;

  /* ---- file: css.js ---- */
/* brandbook/css.js · styles of the Brand Book. They live with the book so the printable copy can reuse them.
 * Colours come only from the --bb-* tokens that mountBook sets from the brand palette. */

var BB_CSS = [
  ".bb{background:var(--bb-bg);color:var(--bb-ink);font-family:var(--bb-body,'Readex Pro','Segoe UI',Tahoma,sans-serif);font-size:15px;line-height:1.75;border-radius:14px;overflow:hidden;box-shadow:0 0 0 1px var(--bb-line)}",
  ".bb *,.bb *::before,.bb *::after{box-sizing:border-box}",
  ".bb bdi{unicode-bidi:isolate}",
  ".bb-cover{display:flex;align-items:center;justify-content:space-between;gap:24px;padding:clamp(24px,5vw,48px);background:var(--bb-accent);color:var(--bb-on-accent)}",
  ".bb-kicker{display:block;font-size:13px;font-weight:600;opacity:.85}",
  ".bb-cover .bb-kicker{opacity:1}",
  ".bb-title{margin:6px 0 0;font-family:var(--bb-display,inherit);font-weight:800;font-size:clamp(30px,6vw,52px);line-height:1.25}",
  ".bb-handle{margin:6px 0 0;font-family:var(--bb-latin,inherit);font-size:16px}",
  ".bb-meta{margin:10px 0 0;font-size:14px}",
  ".bb-logo{flex:none;width:88px;height:88px;border-radius:20px;background:#fff;object-fit:contain;padding:10px}",
  ".bb-logo--mono{display:grid;place-items:center;font-family:var(--bb-display,inherit);font-weight:800;font-size:44px;color:var(--bb-accent)}",
  ".bb-sec{padding:clamp(20px,4vw,40px);border-top:1px solid var(--bb-line);display:grid;gap:22px}",
  ".bb-sec-head{display:flex;flex-direction:column;gap:2px}",
  ".bb-sec-head .bb-kicker{color:var(--bb-accent)}",
  ".bb-h2{margin:0;font-family:var(--bb-display,inherit);font-weight:700;font-size:clamp(22px,3.4vw,30px);line-height:1.35}",
  ".bb-h3{margin:0 0 8px;font-size:14px;font-weight:600;color:var(--bb-muted)}",
  ".bb-lede{margin:0;font-size:16px}",
  ".bb-muted{color:var(--bb-muted);margin:0}",
  ".bb-block{display:grid;gap:8px;align-content:start;min-width:0}",
  ".bb-cols{display:grid;gap:22px;grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}",
  ".bb-cols--2{grid-template-columns:repeat(auto-fit,minmax(260px,1fr))}",
  ".bb-facts{display:grid;gap:10px;margin:0}",
  ".bb-fact{display:grid;grid-template-columns:minmax(96px,160px) 1fr;gap:6px 16px;padding-block:8px;border-bottom:1px dashed var(--bb-line)}",
  ".bb-fact dt{color:var(--bb-muted);font-size:14px}.bb-fact dd{margin:0;min-width:0}",
  ".bb-list{margin:0;padding:0;list-style:none;display:grid;gap:6px}",
  ".bb-list li{padding-inline-start:16px;position:relative}",
  ".bb-list li::before{content:'';position:absolute;inset-inline-start:0;top:.8em;width:6px;height:6px;border-radius:50%;background:var(--bb-accent)}",
  ".bb-list--chips{display:flex;flex-wrap:wrap;gap:8px}",
  ".bb-list--chips li{padding:2px 12px;border:1px solid var(--bb-line);border-radius:999px;background:var(--bb-surface)}",
  ".bb-list--chips li::before{display:none}",
  ".bb-block--do .bb-h3{color:var(--bb-accent)}",
  ".bb-chips{display:flex;flex-wrap:wrap;gap:8px;margin:0;align-items:center}",
  ".bb-chip{padding:2px 12px;border:1px solid var(--bb-line);border-radius:999px;background:var(--bb-surface);font-size:14px}",
  ".bb-label{font-size:13px;color:var(--bb-muted)}",
  ".bb-tone{display:grid;gap:10px}",
  ".bb-tone-row{display:grid;grid-template-columns:minmax(70px,1fr) auto minmax(70px,1fr);gap:12px;align-items:center;font-size:14px}",
  ".bb-tone-row span:last-child{text-align:end}",
  ".bb-dots{display:flex;gap:8px}",
  ".bb-dot{width:14px;height:14px;border-radius:50%;border:2px solid var(--bb-line)}",
  ".bb-dot.is-on{background:var(--bb-accent);border-color:var(--bb-accent)}",
  ".bb-quotes{display:grid;gap:10px}",
  ".bb-quote{margin:0;padding:12px 16px;border-inline-start:4px solid var(--bb-accent);background:var(--bb-surface);border-radius:8px}",
  ".bb-fp{display:grid;gap:10px}",
  ".bb-fp-row{display:grid;grid-template-columns:minmax(110px,170px) 1fr auto;gap:12px;align-items:center;font-size:14px}",
  ".bb-fp-row b{font-weight:600;font-variant-numeric:tabular-nums}",
  ".bb-fp-bar,.bb-fp-range{position:relative;height:10px;border-radius:999px;background:var(--bb-line);overflow:hidden}",
  ".bb-fp-bar>span{display:block;height:100%;background:var(--bb-accent);border-radius:999px}",
  ".bb-fp-range{overflow:visible}",
  ".bb-fp-whisker{position:absolute;top:4px;height:2px;background:var(--bb-muted)}",
  ".bb-fp-box{position:absolute;top:0;height:10px;background:var(--bb-accent);border-radius:4px}",
  ".bb-fp-med{position:absolute;top:-3px;width:3px;height:16px;background:var(--bb-ink);border-radius:2px}",
  ".bb-swatches{display:grid;grid-template-columns:repeat(auto-fill,minmax(112px,1fr));gap:12px}",
  ".bb-swatch{display:grid;gap:2px;font-size:13px}",
  ".bb-swatch-chip{display:block;height:56px;border-radius:10px;box-shadow:inset 0 0 0 1px rgba(127,127,127,.35)}",
  ".bb-swatch code{font-family:var(--bb-latin,ui-monospace,monospace);color:var(--bb-muted);font-size:12.5px}",
  ".bb-matrix{width:100%;border-collapse:collapse;font-size:14px}",
  ".bb-matrix th{text-align:start;font-weight:600;color:var(--bb-muted);padding:6px 8px;border-bottom:1px solid var(--bb-line)}",
  ".bb-matrix td{padding:8px;border-bottom:1px solid var(--bb-line);vertical-align:middle}",
  ".bb-pairchip{display:inline-block;padding:0 8px;border-radius:6px;font-weight:700;margin-inline-end:6px;box-shadow:inset 0 0 0 1px rgba(127,127,127,.35)}",
  ".bb-grade{display:inline-block;padding:1px 10px;border-radius:999px;font-size:12.5px;font-weight:700}",
  ".bb-grade--ok{background:var(--bb-surface);color:var(--bb-ink);box-shadow:inset 0 0 0 1px var(--bb-line)}",
  ".bb-grade--warn,.bb-grade--bad{background:var(--bb-ink);color:var(--bb-bg)}",
  ".bb-fontrow{display:flex;flex-wrap:wrap;gap:8px}.bb-fontpairs{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}",
  ".bb-fontbtn{font:inherit;font-size:16px;padding:6px 14px;border-radius:999px;border:1px solid var(--bb-line);background:var(--bb-surface);color:var(--bb-ink);cursor:pointer}",
  ".bb-fontbtn[aria-checked=true]{background:var(--bb-accent);color:var(--bb-on-accent);border-color:var(--bb-accent)}",
  ".bb-fontsample{margin:8px 0 0;font-size:clamp(28px,5vw,44px);line-height:1.4;font-weight:700}",
  ".bb-fontbody{margin:0;color:var(--bb-muted)}",
  ".bb-fontpair{display:grid;gap:4px;align-content:start;text-align:start;border-radius:14px;padding:12px 14px}",
  ".bb-fontpair .bb-fontsample{margin:0;font-size:clamp(22px,3vw,28px)}",
  ".bb-fontpair .bb-fontbody{font-size:14px;line-height:1.6;color:inherit}",
  ".bb-fontpair .bb-fontname{font-size:12px}",
  ".bb-slides{display:flex;flex-wrap:wrap;gap:16px;align-items:flex-start}",
  ".bb-slidefig{margin:0;width:min(200px,44%);display:grid;gap:6px;font-size:13px;color:var(--bb-muted)}",
  ".bb-slides--alts .bb-slidefig{width:min(140px,40%)}",
  ".bb-frame{border-radius:8px;box-shadow:0 0 0 1px var(--bb-line)}",
  ".bb-slideimg{display:block;width:100%;height:auto;border-radius:8px;box-shadow:0 0 0 1px var(--bb-line)}",
  ".bb-bars{display:grid;gap:10px}",
  ".bb-bar-row{display:grid;grid-template-columns:minmax(90px,160px) 1fr auto;gap:12px;align-items:center;font-size:14px}",
  ".bb-bar{height:10px;border-radius:999px;background:var(--bb-line);overflow:hidden;display:block}",
  ".bb-bar>span{display:block;height:100%;background:var(--bb-accent)}",
  ".bb-stack{display:flex;height:34px;border-radius:10px;overflow:hidden;font-size:13px;font-weight:700;color:var(--bb-on-accent)}",
  ".bb-stack-seg{display:grid;place-items:center;min-width:34px}",
  ".bb-stack-seg--0,.bb-chip--k0{background:var(--bb-accent)}.bb-stack-seg--1,.bb-chip--k1{background:var(--bb-accent2);color:var(--bb-on-accent)}",
  ".bb-stack-seg--2{background:var(--bb-muted)}.bb-stack-seg--3{background:var(--bb-ink);color:var(--bb-bg)}",
  ".bb-chip--k0{color:var(--bb-on-accent);border-color:transparent}.bb-chip--k1{border-color:transparent}",
  ".bb-chip--k2{border-style:dashed}.bb-chip--k3{border-style:dotted}",
  ".bb-foot{padding:16px clamp(20px,4vw,40px);border-top:1px solid var(--bb-line);color:var(--bb-muted);font-size:13px}",
  "@media print{.bb{border-radius:0;box-shadow:none}.bb-sec{break-inside:avoid}.bb-fontbtn{border-color:var(--bb-line)}}",
  "@media(max-width:759px){#cs-app.ui-app--home .ui-main--home{grid-template-columns:minmax(0,1fr)}#cs-app.ui-app--home .ui-tabs--page{min-width:0;overflow-x:auto}#cs-app.ui-app--home .ui-top-in{display:grid;grid-template-columns:30px minmax(0,1fr) auto;gap:8px}#cs-app.ui-app--home .ui-top-actions{display:flex;gap:4px;min-width:0}#cs-app.ui-app--home .ui-top-actions .ui-btn{width:auto;flex:none}#cs-app.ui-app--home .ui-doc{min-width:0}#cs-app.ui-app--home .ui-actionbar{flex-wrap:nowrap;padding:8px 10px;gap:8px;bottom:calc(8px + env(safe-area-inset-bottom,0px))}#cs-app.ui-app--home .ui-actionbar-info{min-width:0;overflow:hidden;flex-wrap:nowrap}#cs-app.ui-app--home .ui-actionbar-info .ui-pill{overflow:hidden;text-overflow:ellipsis;display:block}#cs-app.ui-app--home .ui-actionbar>.ui-row{flex:none;flex-wrap:nowrap}#cs-app.ui-app--home .ui-actionbar .ui-home-secondary{display:none}#cs-app.ui-app--home .ui-actionbar .ui-btn--primary{width:auto;white-space:nowrap}.ui-app--home .bb-cols,.ui-app--home .bb-cols--2{grid-template-columns:minmax(0,1fr)}}"
].join("\n");

  /* ---- file: book.js ---- */
/* brandbook/book.js · the Brand Book: identity, voice, visual identity and strategy of one brand, set in the brand's own look.
 * Mounted by Brand Home (CS.ui.mountBrandHome). The book is credit-free by construction: it never reads an about.* string. */

var BB_ROLES = ["bg", "surface", "ink", "inkMuted", "accent", "accent2"];
var TONE_AXES = [["formalFriendly", "bb.tone.formal", "bb.tone.friendly"], ["seriousPlayful", "bb.tone.serious", "bb.tone.playful"], ["calmEnergetic", "bb.tone.calm", "bb.tone.energetic"]];
var INTENT_KEYS = ["save", "send", "reach", "sell"];

function bbHex(v, fallback) { return /^#[0-9a-f]{6}$/i.test(v || "") ? v : fallback; }

function bbContrast(fg, bg) {
  return U.guard("color.contrast", function () { return CS.core.color.contrast(fg, bg); }, null);
}

function bbMix(a, b, tt) {
  return U.guard("color.mix", function () { return CS.core.color.mix(a, b, tt); }, a);
}

function bbOnColor(bg) {
  return U.guard("color.onColor", function () { return CS.core.color.onColor(bg); }, "#FFFFFF");
}

/** Resolve palette and fonts for the book from the brand, falling back to its preset. */
function bbTheme(brand) {
  var v = brand.visual || {};
  var preset = U.guard("getPreset", function () { return CS.core.registry.getPreset(v.presetId || CS.core.DEFAULT_PRESET); }, null);
  var pr = (preset && preset.roles) || {};
  var pal = v.palette || {};
  var bg = bbHex(pal.bg, bbHex(pr.bg, "#F4F4F2"));
  var ink = bbHex(pal.ink, bbHex(pr.ink, "#111111"));
  var accent = bbHex(pal.accent, bbHex(pr.accent, "#0B6B52"));
  var surface = bbHex(pal.surface, bbHex(pr.surface, bbMix(bg, ink, 0.04)));
  var inkMuted = bbHex(pal.inkMuted, bbHex(pr.inkMuted, bbMix(ink, bg, 0.4)));
  var accent2 = bbHex(pal.accent2, bbHex(pr.accent2, accent));
  var fonts = v.fonts || {};
  var tp = (preset && preset.type) || {};
  function fam(id, fallbackId) {
    var use = id || fallbackId;
    return use ? U.guard("fontCss", function () { return CS.core.registry.fontCss(use); }, null) : null;
  }
  return {
    roles: { bg: bg, surface: surface, ink: ink, inkMuted: inkMuted, accent: accent, accent2: accent2 },
    onAccent: bbOnColor(accent),
    display: fam(fonts.display, tp.display && tp.display.family), body: fam(fonts.body, tp.body && tp.body.family), latin: fam(fonts.latin, tp.latin && tp.latin.family),
    displayId: fonts.display || (tp.display && tp.display.family), bodyId: fonts.body || (tp.body && tp.body.family)
  };
}

function bbSection(id, title, kicker, children) {
  return U.h("section", { class: "bb-sec", id: "bb-" + id },
    U.h("header", { class: "bb-sec-head" }, kicker ? U.h("span", { class: "bb-kicker" }, kicker) : null, U.h("h2", { class: "bb-h2" }, title)),
    children);
}

function bbList(items, cls) {
  if (!items || !items.length) return U.h("p", { class: "bb-muted" }, U.t("bb.none"));
  return U.h("ul", { class: "bb-list " + (cls || "") }, items.map(function (x) { return U.h("li", { html: U.bidi(x) }); }));
}

function bbFact(label, value) {
  if (!value) return null;
  return U.h("div", { class: "bb-fact" }, U.h("dt", {}, label), U.h("dd", { html: U.bidi(value) }));
}

/* ---- sections --------------------------------------------------------------------------------------------------- */
function secCover(brand, theme) {
  var logo = brand.visual && brand.visual.logo && brand.visual.logo.dataUri;
  return U.h("header", { class: "bb-cover" },
    U.h("div", { class: "bb-cover-main" },
      U.h("span", { class: "bb-kicker" }, U.t("bb.cover.kicker")),
      U.h("h1", { class: "bb-title" }, brand.name),
      brand.handle ? U.h("p", { class: "bb-handle" }, U.ltr(brand.handle.charAt(0) === "@" ? brand.handle : "@" + brand.handle)) : null,
      U.h("p", { class: "bb-meta" }, U.t("bb.kind." + brand.kind), brand.approvedAt ? " · " + U.t("bb.version", { v: brand.version }) : " · " + U.t("bb.draft"))),
    logo ? U.h("img", { class: "bb-logo", src: logo, alt: "" }) : U.h("span", { class: "bb-logo bb-logo--mono", "aria-hidden": "true" }, String(brand.name || "?").charAt(0).toUpperCase()));
}

function secIdentity(brand) {
  var id = brand.identity || {}, au = brand.audience || {};
  var goalMap = { followers: "bb.goal.followers", clients: "bb.goal.clients", sales: "bb.goal.sales" };
  return bbSection("identity", U.t("bb.identity"), U.t("bb.n", { n: 1 }), [
    U.h("dl", { class: "bb-facts" }, bbFact(U.t("bb.who"), id.who), bbFact(U.t("bb.niche"), id.niche), bbFact(U.t("bb.offer"), id.offer), bbFact(U.t("bb.goal"), id.goal ? U.t(goalMap[id.goal]) : "")),
    id.proofPoints && id.proofPoints.length ? U.h("div", { class: "bb-block" }, U.h("h3", { class: "bb-h3" }, U.t("bb.proof")), bbList(id.proofPoints.map(function (p) { return p.claim; }))) : null,
    U.h("div", { class: "bb-cols" },
      U.h("div", { class: "bb-block" }, U.h("h3", { class: "bb-h3" }, U.t("bb.persona")), au.persona ? U.h("p", { html: U.bidi(au.persona) }) : U.h("p", { class: "bb-muted" }, U.t("bb.none"))),
      U.h("div", { class: "bb-block" }, U.h("h3", { class: "bb-h3" }, U.t("bb.pains")), bbList(au.pains)),
      U.h("div", { class: "bb-block" }, U.h("h3", { class: "bb-h3" }, U.t("bb.desires")), bbList(au.desires)),
      U.h("div", { class: "bb-block" }, U.h("h3", { class: "bb-h3" }, U.t("bb.objections")), bbList(au.objections)))
  ]);
}

function secLocale(brand) {
  var l = brand.locale || {};
  var rules = U.guard("rules", function () { return CS.core.registry.rules(); }, null);
  var cueLabels = rules && rules.locale && rules.locale.swipeCue && rules.locale.swipeCue.labels && rules.locale.swipeCue.labels[l.swipeCue];
  var cueText = cueLabels ? (cueLabels[l.dialect] || cueLabels["msa-white"] || cueLabels.en) : U.t("bb.cue." + l.swipeCue);
  return bbSection("locale", U.t("bb.locale"), U.t("bb.n", { n: 2 }), [
    U.h("dl", { class: "bb-facts" },
      bbFact(U.t("bb.dialect"), U.dialectLabel(l.dialect) + (l.subVariety ? " · " + l.subVariety : "")),
      /* Gulf and Levantine chrome is white MSA until a native speaker has reviewed it; say so where the dialect is shown */
      l.uiDialect === "gulf" || l.uiDialect === "levant" ? bbFact(U.t("bb.uidialect"), U.dialectLabel(l.uiDialect) + " — " + U.t("bb.uidialect.white")) : null,
      bbFact(U.t("bb.register"), U.t("bb.register." + l.register)),
      bbFact(U.t("bb.digits"), U.t("digits." + l.digits) + (l.digitsReason ? " — " + l.digitsReason : "")),
      bbFact(U.t("bb.swipe"), cueText + " — " + U.t("cue.reason." + l.swipeCue)),
      bbFact(U.t("bb.applang"), U.t("applang." + l.appLanguage)),
      bbFact(U.t("bb.countries"), (l.countries || []).join(" · "))),
    l.latinTerms && l.latinTerms.length ? U.h("div", { class: "bb-block" }, U.h("h3", { class: "bb-h3" }, U.t("bb.latin")), U.h("p", { class: "bb-chips" }, l.latinTerms.map(function (x) { return U.h("span", { class: "bb-chip" }, U.ltr(x)); }))) : null
  ]);
}

function toneBars(tone) {
  return U.h("div", { class: "bb-tone" }, TONE_AXES.map(function (a) {
    var v = tone && tone[a[0]];
    var dots = [1, 2, 3, 4, 5].map(function (i) { return U.h("span", { class: "bb-dot" + (v === i ? " is-on" : "") }); });
    return U.h("div", { class: "bb-tone-row" }, U.h("span", {}, U.t(a[1])), U.h("span", { class: "bb-dots", dir: "ltr", role: "img", "aria-label": v ? v + "/5" : "" }, dots), U.h("span", {}, U.t(a[2])));
  }));
}

function fingerprintChart(fp) {
  if (!fp) return U.h("p", { class: "bb-muted" }, U.t("bb.fp.none"));
  var s = fp.sentLen || {};
  var max = Math.max(30, s.p90 || 0) * 1.1;
  function pct(x) { return Math.round(100 * x / max * 10) / 10; }
  var box = s.p25 !== undefined ? U.h("div", { class: "bb-fp-range", dir: "ltr", role: "img", "aria-label": U.t("bb.fp.sentlen") + " " + s.p25 + "–" + s.p75 },
    U.h("span", { class: "bb-fp-whisker", style: { left: pct(s.p25) + "%", width: pct((s.p90 || s.p75) - s.p25) + "%" } }),
    U.h("span", { class: "bb-fp-box", style: { left: pct(s.p25) + "%", width: pct(s.p75 - s.p25) + "%" } }),
    U.h("span", { class: "bb-fp-med", style: { left: pct(s.p50) + "%" } })) : null;
  function meter(label, value, unit, scaleMax) {
    if (value === undefined) return null;
    return U.h("div", { class: "bb-fp-row" }, U.h("span", {}, label), U.h("span", { class: "bb-fp-bar", dir: "ltr" }, U.h("span", { style: { width: Math.min(100, 100 * value / scaleMax) + "%" } })), U.h("b", { dir: "ltr" }, value + unit));
  }
  return U.h("div", { class: "bb-fp" },
    box ? U.h("div", { class: "bb-fp-row bb-fp-row--range" }, U.h("span", {}, U.t("bb.fp.sentlen")), box, U.h("b", { dir: "ltr" }, s.p25 + " – " + s.p75)) : null,
    meter(U.t("bb.fp.emoji"), fp.emojiPer100w, "", 10), meter(U.t("bb.fp.latin"), fp.latinMixPct, "%", 50),
    meter(U.t("bb.fp.ellipsis"), fp.ellipsisRate, "", 1), meter(U.t("bb.fp.qbang"), fp.questionBangRate, "", 1),
    fp.person ? U.h("p", { class: "bb-muted" }, U.t("bb.fp.person." + fp.person)) : null,
    fp.signatures && fp.signatures.length ? U.h("p", { class: "bb-chips" }, U.h("span", { class: "bb-label" }, U.t("bb.fp.signatures")), fp.signatures.slice(0, 6).map(function (x) { return U.h("span", { class: "bb-chip" }, x); })) : null);
}

function secVoice(brand) {
  var v = brand.voice || {};
  var samples = (v.samples || []).slice(0, 3);
  return bbSection("voice", U.t("bb.voice"), U.t("bb.n", { n: 3 }), [
    toneBars(v.tone),
    U.h("div", { class: "bb-cols bb-cols--2" },
      U.h("div", { class: "bb-block bb-block--do" }, U.h("h3", { class: "bb-h3" }, U.t("bb.say")), bbList(v.use, "bb-list--chips")),
      U.h("div", { class: "bb-block bb-block--dont" }, U.h("h3", { class: "bb-h3" }, U.t("bb.avoid")), bbList(v.avoid, "bb-list--chips"))),
    v.ctaStyle ? U.h("dl", { class: "bb-facts" }, bbFact(U.t("bb.cta"), v.ctaStyle)) : null,
    U.h("div", { class: "bb-block" }, U.h("h3", { class: "bb-h3" }, U.t("bb.fingerprint")), fingerprintChart(v.fingerprint)),
    samples.length ? U.h("div", { class: "bb-block" }, U.h("h3", { class: "bb-h3" }, U.t("bb.samples")), U.h("div", { class: "bb-quotes" }, samples.map(function (s) { return U.h("blockquote", { class: "bb-quote", html: U.bidi(s) }); }))) : null
  ]);
}

function secVisual(brand, theme, state) {
  var v = brand.visual || {};
  var swatches = U.h("div", { class: "bb-swatches" }, BB_ROLES.map(function (r) {
    var hex = theme.roles[r];
    if (!hex || (r === "accent2" && hex === theme.roles.accent && !(v.palette && v.palette.accent2))) return null;
    return U.h("div", { class: "bb-swatch" }, U.h("span", { class: "bb-swatch-chip", style: { background: hex } }), U.h("b", {}, U.t("bb.role." + r)), U.h("code", { dir: "ltr" }, hex.toUpperCase()));
  }));
  var pairs = [["ink", "bg", theme.roles.ink, theme.roles.bg], ["inkMuted", "bg", theme.roles.inkMuted, theme.roles.bg], ["accent", "bg", theme.roles.accent, theme.roles.bg], ["onAccent", "accent", theme.onAccent, theme.roles.accent]];
  var matrix = U.h("table", { class: "bb-matrix" },
    U.h("thead", {}, U.h("tr", {}, U.h("th", {}, U.t("bb.pair")), U.h("th", {}, U.t("bb.ratio")), U.h("th", {}, U.t("bb.wcag")))),
    U.h("tbody", {}, pairs.map(function (p) {
      var r = bbContrast(p[2], p[3]);
      var grade = r === null ? "" : r >= 7 ? "AAA" : r >= 4.5 ? "AA" : r >= 3 ? "AA-large" : "fail";
      return U.h("tr", {}, U.h("td", {}, U.h("span", { class: "bb-pairchip", style: { background: p[3], color: p[2] } }, "Aa أب"), " " + U.t("bb.role." + p[0]) + " / " + U.t("bb.role." + p[1])),
        U.h("td", { dir: "ltr" }, r === null ? "–" : (Math.round(r * 10) / 10) + ":1"), U.h("td", {}, U.h("span", { class: "bb-grade bb-grade--" + (grade === "fail" ? "bad" : grade === "AA-large" ? "warn" : "ok") }, grade === "fail" ? U.t("bb.fail") : grade)));
    })));
  var fonts = bbFontPicker(brand, theme, state);
  return bbSection("visual", U.t("bb.visual"), U.t("bb.n", { n: 4 }), [
    U.h("div", { class: "bb-cols bb-cols--2" },
      U.h("div", { class: "bb-block" }, U.h("h3", { class: "bb-h3" }, U.t("bb.palette")), swatches),
      U.h("div", { class: "bb-block" }, U.h("h3", { class: "bb-h3" }, U.t("bb.contrast")), matrix)),
    fonts
  ]);
}

function bbFontPicker(brand, theme, state) {
  var reg = CS.core && CS.core.registry;
  var meta = U.readJsonBlock("cs-fonts-meta");
  var families = (meta && meta.registry && meta.registry.families) || [];
  if (!reg || families.length < 2) return null;
  var v = brand.visual || {};
  var cur = v.fonts || {};
  var preset = U.guard("getPreset", function () { return reg.getPreset(v.presetId || CS.core.DEFAULT_PRESET); }, null);
  var ty = (preset && preset.type) || {};
  var own = { display: ty.display && ty.display.family, body: ty.body && ty.body.family, latin: ty.latin && ty.latin.family };
  /* the brand picks from the stock faces too: a font the brand chose is never judged by D7 */
  var pairs = U.fontPairings(families, own, v.presetId || CS.core.DEFAULT_PRESET, true);
  if (!pairs.length) return null;
  var hook = state.sampleHook || brand.name;
  var bodyText = (brand.voice && brand.voice.samples && brand.voice.samples[0]) || U.t("bb.font.body-sample");
  var row = U.h("div", { class: "bb-fontrow bb-fontpairs", role: "radiogroup", "aria-label": U.t("bb.font.pick") });
  function fam(id) { var f = reg.fontEntry(id); return f ? f.family : id; }
  var picked = cur.display || own.display;
  pairs.forEach(function (p) {
    var btn = U.h("button", {
      type: "button", role: "radio", class: "bb-fontbtn bb-fontpair", "aria-checked": String(p.display === picked), dataset: { id: p.display },
      onclick: function () {
        Array.prototype.forEach.call(row.children, function (b) { b.setAttribute("aria-checked", "false"); });
        btn.setAttribute("aria-checked", "true");
        state.onChange({ visual: { fonts: { display: p.display, body: p.body, latin: p.latin } } });
      }
    }, U.h("span", { class: "bb-fontsample", style: { fontFamily: reg.fontCss(p.display) } }, hook),
    U.h("span", { class: "bb-fontbody", style: { fontFamily: reg.fontCss(p.body) } }, bodyText),
    U.h("span", { class: "bb-fontname" }, U.h("bdi", { dir: "ltr" }, fam(p.display) + " + " + fam(p.body))));
    row.appendChild(btn);
  });
  return U.h("div", { class: "bb-block" }, U.h("h3", { class: "bb-h3" }, U.t("bb.fonts")), U.h("p", { class: "bb-muted" }, U.t("bb.font.hint")), row);
}

/** Demo spec used to show the brand's preset as cover, slide 2 and CTA. */
function bbDemoSpec(brand, presetId, hook) {
  var base = U.guard("spec.blank", function () { return CS.core.spec.blank(brand, {}); }, null);
  if (!base) return null;
  var preset = U.guard("getPreset", function () { return CS.core.registry.getPreset(presetId); }, null);
  var spec = U.clone(base);
  spec.id = "brandbook-demo";
  spec.format = "carousel";
  spec.checkpoint = "design";
  spec.style = { presetId: presetId + "@" + ((preset && preset.version) || "1.0") };
  spec.slides = [
    { id: "s01", n: 1, type: "cover", headline: hook, media: { slot: "none" } },
    { id: "s02", n: 2, type: "rehook", headline: U.t("bb.demo.slide2"), bridge: U.t("bb.demo.bridge") },
    { id: "s03", n: 3, type: "cta", title: U.t("bb.demo.cta"), cta: { kind: "save", text: U.t("bb.demo.cta.text") } }
  ];
  return spec;
}

function secPreset(brand, theme, state) {
  var v = brand.visual || {};
  var presetId = v.presetId || CS.core.DEFAULT_PRESET;
  var alts = (v.presetAlternates || []).slice(0, 2);
  var row = U.h("div", { class: "bb-slides" });
  var altRow = U.h("div", { class: "bb-slides bb-slides--alts" });
  var hook = state.sampleHook || brand.name;
  var demo = bbDemoSpec(brand, presetId, hook);
  function slot(label, host) { return U.h("figure", { class: "bb-slidefig" }, host.frame, U.h("figcaption", {}, label)); }
  function show(spec, i, host) {
    U.guard("render", function () {
      CS.core.render.slide(spec, brand, i, { mode: "thumb" }).then(function (r) {
        if (!host.frame.isConnected) return;
        host.inner.appendChild(r.el);
        host.frame.classList.remove("is-loading");
        var rec = { frame: host.frame, uri: null };
        state.slides.push(rec);
        setTimeout(function () { capture(r.el, rec); }, 450);
      }, function () { host.frame.classList.remove("is-loading"); host.frame.classList.add("is-failed"); });
    });
  }
  if (demo) {
    [["bb.slide.cover", 0], ["bb.slide.second", 1], ["bb.slide.cta", 2]].forEach(function (d) {
      var host = U.makeFrame(1080, 1440, "bb-frame is-loading");
      row.appendChild(slot(U.t(d[0]), host));
      show(demo, d[1], host);
    });
    alts.forEach(function (a) {
      var spec = bbDemoSpec(brand, a, hook);
      var host = U.makeFrame(1080, 1440, "bb-frame is-loading");
      var altPreset = U.guard("getPreset", function () { return CS.core.registry.getPreset(a); }, null);
      altRow.appendChild(slot(altPreset ? U.msgOf(altPreset.name) : a, host));
      if (spec) show(spec, 0, host);
    });
  }
  var pr = U.guard("getPreset", function () { return CS.core.registry.getPreset(presetId); }, null);
  return bbSection("preset", U.t("bb.preset"), U.t("bb.n", { n: 5 }), [
    pr ? U.h("p", { class: "bb-lede" }, U.h("b", {}, U.msgOf(pr.name)), " — " + U.msgOf(pr.description)) : null,
    demo ? row : U.h("p", { class: "bb-muted" }, U.t("bb.preset.unavailable")),
    alts.length ? U.h("div", { class: "bb-block" }, U.h("h3", { class: "bb-h3" }, U.t("bb.alternates")), altRow) : null
  ]);
}

function secStrategy(brand) {
  var s = brand.strategy || {};
  var pillars = s.pillars || [];
  var mix = s.intentMix || {};
  var tools = (brand.tools && brand.tools.caps) || {};
  var capKeys = Object.keys(tools).filter(function (k) { return tools[k] && tools[k].length; });
  var best = s.bestHours;
  return bbSection("strategy", U.t("bb.strategy"), U.t("bb.n", { n: 6 }), [
    pillars.length ? U.h("div", { class: "bb-block" }, U.h("h3", { class: "bb-h3" }, U.t("bb.pillars")),
      U.h("div", { class: "bb-bars" }, pillars.map(function (p) {
        return U.h("div", { class: "bb-bar-row" }, U.h("span", {}, p.name), U.h("span", { class: "bb-bar", dir: "ltr" }, U.h("span", { style: { width: Math.round((p.share || 0) * 100) + "%" } })), U.h("b", { dir: "ltr" }, Math.round((p.share || 0) * 100) + "%"));
      }))) : null,
    Object.keys(mix).length ? U.h("div", { class: "bb-block" }, U.h("h3", { class: "bb-h3" }, U.t("bb.mix")),
      U.h("div", { class: "bb-stack", dir: "ltr", role: "img", "aria-label": U.t("bb.mix") }, INTENT_KEYS.filter(function (k) { return mix[k]; }).map(function (k, i) {
        return U.h("span", { class: "bb-stack-seg bb-stack-seg--" + i, style: { flexGrow: mix[k] } }, Math.round(mix[k] * 100) + "%");
      })),
      U.h("p", { class: "bb-chips" }, INTENT_KEYS.filter(function (k) { return mix[k]; }).map(function (k, i) { return U.h("span", { class: "bb-chip bb-chip--k" + i }, U.t("intent." + k)); }))) : null,
    U.h("dl", { class: "bb-facts" },
      bbFact(U.t("bb.rhythm"), s.postsPerWeek ? U.t("bb.perweek", { n: s.postsPerWeek }) : ""),
      best ? bbFact(U.t("bb.hours"), best.tz + (best.slots && best.slots.length ? " · " + best.slots.map(function (x) { return (x.day === "any" ? "" : x.day + " ") + x.from + "-" + x.to; }).join("، ") : "")) : null,
      bbFact(U.t("bb.models"), (s.roleModels || []).join("، "))),
    capKeys.length ? U.h("div", { class: "bb-block" }, U.h("h3", { class: "bb-h3" }, U.t("bb.tools")), U.h("p", { class: "bb-chips" }, capKeys.map(function (k) { return U.h("span", { class: "bb-chip" }, U.ltr(k)); }))) : null
  ]);
}

/** Mount the Brand Book into `root`. opts: {sampleHook, onChange(patch)}. Returns {destroy, toPrintableHtml}. */
function mountBook(root, brand, opts) {
  opts = opts || {};
  var current = U.clone(brand);
  var state = { sampleHook: opts.sampleHook || brand.name, slides: [], onChange: function (patch) { current = bbMerge(current, patch); if (opts.onChange) opts.onChange(patch); } };
  var theme = bbTheme(current);
  U.clear(root);
  ensureStyle();
  var el = U.h("article", { class: "bb", dir: U.uiDir(), lang: U.uiLang() });
  bbApplyTheme(el, theme);
  el.appendChild(secCover(current, theme));
  [secIdentity(current), secLocale(current), secVoice(current), secVisual(current, theme, state), secPreset(current, theme, state), secStrategy(current)].forEach(function (s) { el.appendChild(s); });
  el.appendChild(U.h("footer", { class: "bb-foot" }, current.approvedAt ? U.t("bb.approved", { v: current.version, date: U.fmtDate(current.approvedAt, U.uiLang()) }) : U.t("bb.draft")));
  root.appendChild(el);
  return {
    destroy: function () { U.releaseFrames(el); U.clear(root); },
    toPrintableHtml: function () { return printableHtml(el, current, theme, state); }
  };
}

function bbMerge(base, patch) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return patch;
  var out = Object.assign({}, base);
  Object.keys(patch).forEach(function (k) {
    out[k] = patch[k] && typeof patch[k] === "object" && !Array.isArray(patch[k]) && base && base[k] && typeof base[k] === "object" ? bbMerge(base[k], patch[k]) : patch[k];
  });
  return out;
}

function bbApplyTheme(el, theme) {
  var r = theme.roles;
  var st = el.style;
  st.setProperty("--bb-bg", r.bg); st.setProperty("--bb-surface", r.surface); st.setProperty("--bb-ink", r.ink); st.setProperty("--bb-muted", r.inkMuted);
  st.setProperty("--bb-accent", r.accent); st.setProperty("--bb-accent2", r.accent2); st.setProperty("--bb-on-accent", theme.onAccent);
  st.setProperty("--bb-line", bbMix(r.ink, r.bg, 0.84));
  if (theme.display) st.setProperty("--bb-display", '"' + theme.display + '"'); else st.removeProperty("--bb-display");
  if (theme.body) st.setProperty("--bb-body", '"' + theme.body + '"'); else st.removeProperty("--bb-body");
  if (theme.latin) st.setProperty("--bb-latin", '"' + theme.latin + '"'); else st.removeProperty("--bb-latin");
}

function ensureStyle() {
  if (document.getElementById("cs-bb-css")) return;
  var s = document.createElement("style");
  s.id = "cs-bb-css";
  s.textContent = BB_CSS;
  document.head.appendChild(s);
}

  /* ---- file: printable.js ---- */
/* brandbook/printable.js · a standalone, credit-free HTML copy of the Brand Book (print it to PDF from any browser).
 * window.print() is blocked inside artifacts, so the book leaves the page as a file the user opens locally. */

function b64(bytes) {
  var s = "", step = 0x8000;
  for (var i = 0; i < bytes.length; i += step) s += String.fromCharCode.apply(null, bytes.subarray(i, i + step));
  return btoa(s);
}

/** Paint a rendered demo slide to a PNG data URI so the printable copy can show it without the Studio runtime. */
function capture(slideEl, rec) {
  if (!(CS.paint && CS.paint.raster) || !slideEl) return;
  CS.paint.raster(slideEl, { type: "png", paintScale: 1 }).then(function (r) { rec.uri = "data:image/png;base64," + b64(r.bytes); }, function () { /* the slide stays a placeholder */ });
}

/** The @font-face rules of the families the book uses, taken from the page's embedded font block. */
function usedFontFaces(families) {
  var node = document.getElementById("cs-fonts");
  if (!node) return "";
  var wanted = families.filter(Boolean);
  var rules = node.textContent.match(/@font-face\s*\{[^}]*\}/g) || [];
  return rules.filter(function (r) {
    var m = /font-family:\s*["']?([^;"']+)["']?/.exec(r);
    return m && wanted.indexOf(m[1].trim()) >= 0;
  }).join("\n");
}

function printableHtml(el, brand, theme, state) {
  var copy = el.cloneNode(true);
  copy.querySelectorAll(".bb-fontrow").forEach(function (n) { n.remove(); });
  var live = el.querySelectorAll(".bb-frame");
  copy.querySelectorAll(".bb-frame").forEach(function (f, i) {
    var rec = state.slides.filter(function (s) { return s.frame === live[i]; })[0];
    if (rec && rec.uri) f.replaceWith(U.h("img", { class: "bb-slideimg", src: rec.uri, alt: "" }));
    else f.remove();
  });
  var faces = usedFontFaces([theme.display, theme.body, theme.latin]);
  var dir = U.uiDir(), lang = U.uiLang();
  return "<!doctype html><html lang=\"" + lang + "\" dir=\"" + dir + "\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>" +
    U.esc(brand.name) + "</title><style>" + faces + "\n" + BB_CSS + "\nbody{margin:0;padding:clamp(12px,3vw,32px);background:" + theme.roles.bg + "}</style></head><body>" + copy.outerHTML + "</body></html>";
}

  /* ---- file: home.js ---- */
/* ui/brand-home.js · Brand Home: the long-lived page of one brand (Brand Book, Plan, Ideas, Posts). CONTRACT 8.7. */

var HOME_TABS = ["book", "plan", "ideas", "posts", "team"];
var STATUS_ORDER = ["idea", "angled", "scripted", "designed", "exported", "posted"];

function mountBrandHome(root, data) {
  if (!data || !data.brand) throw new CS.CSError("E_SCHEMA", "mountBrandHome needs a brand");
  U.captureBoot(root);
  U.loadUiStrings();
  var saved = U.local.get("cs-theme", null);
  if (saved && !document.documentElement.getAttribute("data-theme")) U.applyTheme(saved);
  var pref = U.local.get("cs-ui-dialect", null);
  var brandDialect = data.brand.locale && (data.brand.locale.uiDialect || data.brand.locale.dialect);
  U.setUiDialect(pref && U.UI_DIALECTS.indexOf(pref) >= 0 ? pref : (data.config && data.config.uiDialect) || brandDialect || "msa-white");

  var state = {
    brand: clone(data.brand), base: clone(data.brand), dirty: false, tab: U.local.get("cs-home-tab", "book"), writer: true,
    plan: data.plan || null, ideas: data.ideas || (data.plan && data.plan.ideaBank) || [], posts: data.posts || [],
    filter: { pillar: "", intent: "" }
  };
  if (HOME_TABS.indexOf(state.tab) < 0) state.tab = "book";
  var chrome = {};
  var book = null;

  function paintTop() {
    var b = state.brand;
    chrome.title.textContent = b.name;
    clear(chrome.state);
    chrome.state.appendChild(document.createTextNode(b.approvedAt ? t("home.approved", { v: b.version, date: fmtDate(b.approvedAt, uiLang()) }) : t("home.draft")));
    if (state.dirty) chrome.state.appendChild(h("span", { class: "ui-dirty" }, t("top.unsaved")));
    chrome.save.disabled = !state.dirty;
  }

  /* ---- publishing ------------------------------------------------------------------------------------------- */
  async function save() {
    var pub = await U.useCap("publish");
    var can = pub ? await U.canPublish() : false;
    var next = clone(state.brand);
    next.updatedAt = isoNow();
    if (pub && can && state.writer) {
      try {
        await pub.publish(U.serializeBrandHome(next));
        state.brand = next; state.base = clone(next); state.dirty = false; paintTop();
        toast(t("save.done"), "ok");
        return { ok: true, mode: "publish", rev: next.version };
      } catch (e) {
        if (e && e.code === "conflict") { toast(t("save.conflict.toast"), "warn"); return { ok: false, mode: "publish", rev: state.brand.version, conflict: true }; }
        if (["not_writer", "not_granted", "consent_required", "capability_disabled", "capability_removed", "not_declared"].indexOf(e && e.code) >= 0) state.writer = false;
        else { reportError("brand save", e); toast(t("save.failed"), "error"); return { ok: false, mode: "publish", rev: state.brand.version }; }
      }
    }
    await downloadBrand();
    return { ok: true, mode: "patch", rev: state.brand.version };
  }

  async function downloadBrand() {
    var dl = await U.useCap("downloads");
    var text = JSON.stringify(state.brand, null, 2) + "\n";
    if (!dl) { await copyWithFeedback(text, t("home.brand-json")); return; }
    try { await dl.save({ filename: (state.brand.slug || "brand") + ".brand.json", data: text }); toast(t("export.saved", { n: 1 }), "ok"); }
    catch (e) { if (!(e && e.code === "declined")) toast(t("export.failed", { n: 1 }), "error"); }
  }

  async function approveBook() {
    var ok = await dialog({
      title: t("home.approve.title"), body: t("home.approve.text"),
      actions: [{ label: t("common.cancel"), value: false, kind: "ghost" }, { label: t("home.approve"), value: true, kind: "primary" }]
    });
    if (!ok) return null;
    var now = isoNow();
    state.brand.version = (state.brand.version || 0) + 1;
    state.brand.approvedAt = now;
    state.brand.onboarding = Object.assign({}, state.brand.onboarding, { bookApprovedAt: now });
    state.dirty = true;
    paintTop();
    CS.emit("cs:approve", { checkpoint: "design", rev: state.brand.version });
    return save();
  }

  function capsule() {
    var b = state.brand, l = b.locale || {}, v = b.visual || {}, p = v.palette || {}, f = v.fonts || {};
    var use = ((b.voice && b.voice.use) || []).slice(0, 8).join("، ");
    var avoid = ((b.voice && b.voice.avoid) || []).slice(0, 8).join("، ");
    var lines = [
      "[Carousel Studio brand capsule v1]",
      "brand: " + b.name + " (" + b.slug + ") | dialect: " + l.dialect + " | register: " + l.register + " | digits: " + l.digits + " | swipe: " + l.swipeCue,
      ("voice: " + (use ? "use " + use : "") + (avoid ? " ; avoid " + avoid : "")).slice(0, 210),
      "palette: bg " + (p.bg || "-") + " ink " + (p.ink || "-") + " accent " + (p.accent || "-") + " | fonts: " + [f.display, f.body, f.latin].filter(Boolean).join(" / ") + " | preset: " + (v.presetId || "-"),
      "home: " + (b.homeUrl || "-")
    ];
    return lines.join("\n");
  }

  /* ---- tabs ------------------------------------------------------------------------------------------------- */
  function paintBook() {
    clear(chrome.panel);
    var host = h("div", { class: "ui-bookhost" });
    chrome.panel.appendChild(host);
    chrome.panel.appendChild(h("div", { class: "ui-actionbar" },
      h("div", { class: "ui-actionbar-info" }, state.brand.approvedAt ? pill(t("home.approved", { v: state.brand.version, date: fmtDate(state.brand.approvedAt, uiLang()) }), "ok", "circle-check") : pill(t("home.draft"), "mute")),
      h("div", { class: "ui-row ui-row--wrap" },
        h("button", { type: "button", class: "ui-btn ui-btn--ghost ui-home-secondary", onclick: function () { copyWithFeedback(capsule(), t("home.capsule")); } }, icon("copy"), t("home.capsule.copy")),
        h("button", { type: "button", class: "ui-btn ui-btn--ghost ui-home-secondary", onclick: printable }, icon("download"), t("home.print")),
        h("button", { type: "button", class: "ui-btn ui-btn--primary", dataset: { csAction: "approve-brand" }, onclick: approveBook }, icon("badge-check"), t("home.approve")))));
    if (CS.ui.brandBook && CS.ui.brandBook.mount) {
      if (book) { try { book.destroy(); } catch (e) { /* ignore */ } }
      book = CS.ui.brandBook.mount(host, state.brand, {
        sampleHook: pickSampleHook(),
        onChange: function (patch) {
          state.brand = deepMerge(state.brand, patch);
          state.dirty = !same(state.brand, state.base);
          paintTop();
        }
      });
    } else host.appendChild(h("p", { class: "ui-empty" }, t("home.book.unavailable")));
  }

  function pickSampleHook() {
    var b = state.brand;
    return (b.voice && b.voice.samples && b.voice.samples[0] && String(b.voice.samples[0]).split(/[.\n؟?!]/)[0].trim().slice(0, 60)) || b.name;
  }

  async function printable() {
    if (!book) return;
    var html = book.toPrintableHtml();
    var dl = await U.useCap("downloads");
    if (!dl) { toast(t("export.no-downloads"), "warn"); return; }
    try { await dl.save({ filename: (state.brand.slug || "brand") + "-brand-book.html", data: html }); toast(t("home.print.saved"), "ok"); }
    catch (e) { if (!(e && e.code === "declined")) toast(t("export.failed", { n: 1 }), "error"); }
  }

  function statusPill(s) {
    var kind = s === "posted" || s === "exported" ? "ok" : s === "designed" || s === "scripted" ? "info" : "mute";
    return pill(t("status." + s), kind);
  }

  function paintPlan() {
    clear(chrome.panel);
    var plan = state.plan;
    if (!plan) { chrome.panel.appendChild(emptyState("calendar", t("home.plan.empty"), t("home.plan.empty.hint"))); return; }
    var slots = (plan.slots || []).slice().sort(function (a, b) { return (a.date + (a.time || "")).localeCompare(b.date + (b.time || "")); });
    var counts = {};
    slots.forEach(function (s) { counts[s.status] = (counts[s.status] || 0) + 1; });
    var head = h("div", { class: "ui-card ui-card--hero" },
      h("div", { class: "ui-eyebrow" }, t("home.plan.period")),
      h("p", { class: "ui-topic", dir: "ltr" }, plan.period),
      h("div", { class: "ui-chips" },
        h("span", { class: "ui-chip" }, h("span", { class: "ui-chip-k" }, t("home.plan.goal")), h("span", { class: "ui-chip-v" }, t("goal." + plan.goal))),
        plan.cadence ? h("span", { class: "ui-chip" }, h("span", { class: "ui-chip-k" }, t("home.plan.cadence")), h("span", { class: "ui-chip-v" }, t("home.plan.perweek", { n: plan.cadence.perWeek }))) : null,
        plan.cadence && plan.cadence.tz ? h("span", { class: "ui-chip" }, h("span", { class: "ui-chip-k" }, t("home.plan.tz")), h("bdi", { class: "ui-chip-v", dir: "ltr" }, plan.cadence.tz)) : null),
      h("div", { class: "ui-chips" }, STATUS_ORDER.filter(function (s) { return counts[s]; }).map(function (s) { return h("span", { class: "ui-chip" }, statusPill(s), h("span", { class: "ui-chip-v", dir: "ltr" }, String(counts[s]))); })));
    chrome.panel.appendChild(head);
    if (!slots.length) { chrome.panel.appendChild(emptyState("calendar", t("home.plan.noslots"), "")); return; }
    var list = h("div", { class: "ui-slots" });
    slots.forEach(function (s) {
      var d = new Date(s.date + "T00:00:00");
      var wd = d.toLocaleDateString(uiLang() === "en" ? "en-GB" : "ar-EG-u-nu-latn", { weekday: "long" });
      var pillar = ((state.brand.strategy && state.brand.strategy.pillars) || []).filter(function (p) { return p.id === s.pillarId; })[0];
      list.appendChild(h("article", { class: "ui-slot" },
        h("div", { class: "ui-slot-date" }, h("strong", { dir: "ltr" }, s.date.slice(8)), h("small", {}, wd)),
        h("div", { class: "ui-slot-body" },
          h("p", { class: "ui-slot-title", html: bidi(s.title || (s.architecture ? t("arch." + s.architecture) : t("home.plan.untitled"))) }),
          h("div", { class: "ui-chips" },
            s.time ? h("span", { class: "ui-chip" }, h("bdi", { class: "ui-chip-v", dir: "ltr" }, s.time)) : null,
            pillar ? h("span", { class: "ui-chip" }, h("span", { class: "ui-chip-v" }, pillar.name)) : null,
            h("span", { class: "ui-chip" }, h("span", { class: "ui-chip-v" }, t("intent." + s.intent))),
            h("span", { class: "ui-chip" }, h("span", { class: "ui-chip-v" }, t("format." + s.format))),
            statusPill(s.status)),
          s.note ? h("p", { class: "ui-hint", html: bidi(s.note) }) : null),
        s.studioUrl ? h("a", { class: "ui-btn ui-btn--secondary ui-btn--sm", href: s.studioUrl, target: "_blank", rel: "noopener noreferrer" }, icon("external-link"), t("home.open-studio")) : null));
    });
    chrome.panel.appendChild(list);
  }

  function emptyState(ic, title, text) {
    return h("div", { class: "ui-empty" }, icon(ic), h("strong", {}, title), text ? h("p", { class: "ui-hint" }, text) : null);
  }

  function paintIdeas() {
    clear(chrome.panel);
    var ideas = state.ideas || [];
    if (!ideas.length) { chrome.panel.appendChild(emptyState("lightbulb", t("home.ideas.empty"), t("home.ideas.empty.hint"))); return; }
    var pillars = (state.brand.strategy && state.brand.strategy.pillars) || [];
    var bar = h("div", { class: "ui-chips ui-chips--pick" });
    bar.appendChild(h("button", { type: "button", class: "ui-chip-btn", "aria-pressed": String(!state.filter.pillar), onclick: function () { state.filter.pillar = ""; paintIdeas(); } }, t("home.ideas.all")));
    pillars.forEach(function (p) {
      bar.appendChild(h("button", { type: "button", class: "ui-chip-btn", "aria-pressed": String(state.filter.pillar === p.id), onclick: function () { state.filter.pillar = p.id; paintIdeas(); } }, p.name));
    });
    chrome.panel.appendChild(bar);
    var shown = ideas.filter(function (i) { return !state.filter.pillar || i.pillarId === state.filter.pillar; });
    var list = h("div", { class: "ui-ideas" });
    shown.forEach(function (i) {
      var pillar = pillars.filter(function (p) { return p.id === i.pillarId; })[0];
      list.appendChild(h("article", { class: "ui-idea" },
        h("p", { class: "ui-idea-text", html: bidi(i.text) }),
        h("div", { class: "ui-chips" },
          pillar ? h("span", { class: "ui-chip" }, h("span", { class: "ui-chip-v" }, pillar.name)) : null,
          (i.intents || []).map(function (n) { return h("span", { class: "ui-chip" }, h("span", { class: "ui-chip-v" }, t("intent." + n))); }),
          i.source ? h("span", { class: "ui-chip" }, h("span", { class: "ui-chip-k" }, t("home.ideas.source")), h("span", { class: "ui-chip-v" }, t("source." + i.source))) : null),
        h("button", { type: "button", class: "ui-btn ui-btn--ghost ui-btn--sm", onclick: function () { copyWithFeedback(t("home.ideas.prompt", { idea: i.text }), t("home.ideas.copy")); } }, icon("copy"), t("home.ideas.start"))));
    });
    chrome.panel.appendChild(list);
  }

  function paintPosts() {
    clear(chrome.panel);
    var posts = state.posts || [];
    if (!posts.length) { chrome.panel.appendChild(emptyState("layout-grid", t("home.posts.empty"), t("home.posts.empty.hint"))); return; }
    var list = h("div", { class: "ui-slots" });
    posts.forEach(function (p) {
      list.appendChild(h("article", { class: "ui-slot" },
        h("div", { class: "ui-slot-date" }, p.date ? [h("strong", { dir: "ltr" }, p.date.slice(8)), h("small", {}, p.date.slice(0, 7))] : icon("layers")),
        h("div", { class: "ui-slot-body" }, h("p", { class: "ui-slot-title", html: bidi(p.title) }), h("div", { class: "ui-chips" }, statusPill(p.status))),
        p.studioUrl ? h("a", { class: "ui-btn ui-btn--secondary ui-btn--sm", href: p.studioUrl, target: "_blank", rel: "noopener noreferrer" }, icon("external-link"), t("home.open-studio")) : null));
    });
    chrome.panel.appendChild(list);
  }

  /** The values the last two posts shared: a third time would repeat the same family, move or recipe three posts running. */
  function teamRest(memory) {
    var out = [];
    if (memory.length < 2) return out;
    var a = memory[memory.length - 2], b = memory[memory.length - 1];
    [["family", "team.k.family", function (v) { return v; }], ["move", "team.k.move", function (v) { return t("team.move." + v); }],
      ["motion", "team.k.motion", function (v) { return v; }], ["preset", "team.k.preset", function (v) { return v; }],
      ["intent", "team.k.intent", function (v) { return t("intent." + v); }]].forEach(function (k) {
      if (a[k[0]] && a[k[0]] === b[k[0]]) out.push(t(k[1]) + ": " + k[2](b[k[0]]));
    });
    return out;
  }

  function paintTeam() {
    clear(chrome.panel);
    var memory = (state.brand.creativeMemory || []).slice();
    chrome.panel.appendChild(h("div", { class: "ui-card ui-card--hero" },
      h("div", { class: "ui-eyebrow" }, t("home.team.title")),
      h("p", { class: "ui-hint" }, t("home.team.hint", { n: 30 }))));
    if (!memory.length) { chrome.panel.appendChild(emptyState("users", t("home.team.empty"), t("home.team.empty.hint"))); return; }
    var rest = teamRest(memory);
    if (rest.length) chrome.panel.appendChild(h("p", { class: "ui-note", dataset: { csTeamRest: "" } }, icon("info"), h("span", { html: bidi(t("home.team.rest") + " " + rest.join("، ")) })));
    var ctas = [];
    memory.slice(-2).forEach(function (e) { if (e.cta && ctas.indexOf(t("cta.kind." + e.cta)) < 0) ctas.push(t("cta.kind." + e.cta)); });
    if (ctas.length) chrome.panel.appendChild(h("p", { class: "ui-note", dataset: { csTeamCta: "" } }, icon("info"), h("span", { html: bidi(t("home.team.cta") + " " + ctas.join("، ")) })));
    var list = h("div", { class: "ui-slots" });
    memory.slice().reverse().forEach(function (e) {
      list.appendChild(h("article", { class: "ui-slot", dataset: { csMemory: e.postId } },
        h("div", { class: "ui-slot-date" }, e.date ? [h("strong", { dir: "ltr" }, e.date.slice(8)), h("small", {}, e.date.slice(0, 7))] : icon("users")),
        h("div", { class: "ui-slot-body" },
          h("p", { class: "ui-slot-title", html: bidi(e.idea) }),
          e.hook ? h("p", { class: "ui-hint" }, t("team.hook") + ": ", h("span", { html: bidi(e.hook) })) : null,
          h("div", { class: "ui-chips" },
            e.family ? h("span", { class: "ui-chip" }, h("span", { class: "ui-chip-k" }, t("team.k.family")), h("bdi", { class: "ui-chip-v", dir: "ltr" }, e.family)) : null,
            e.move ? h("span", { class: "ui-chip" }, h("span", { class: "ui-chip-k" }, t("team.k.move")), h("span", { class: "ui-chip-v" }, t("team.move." + e.move))) : null,
            e.preset ? h("span", { class: "ui-chip" }, h("span", { class: "ui-chip-k" }, t("team.k.preset")), h("bdi", { class: "ui-chip-v", dir: "ltr" }, e.preset)) : null,
            e.motion ? h("span", { class: "ui-chip" }, h("span", { class: "ui-chip-k" }, t("team.k.motion")), h("bdi", { class: "ui-chip-v", dir: "ltr" }, e.motion)) : null,
            e.intent ? h("span", { class: "ui-chip" }, h("span", { class: "ui-chip-v" }, t("intent." + e.intent))) : null,
            e.pitch ? h("span", { class: "ui-chip" }, h("span", { class: "ui-chip-k" }, t("team.k.pitch")), h("span", { class: "ui-chip-v" }, t("team.pitch." + e.pitch))) : null,
            e.cta ? h("span", { class: "ui-chip" }, h("span", { class: "ui-chip-k" }, t("team.k.cta")), h("span", { class: "ui-chip-v" }, t("cta.kind." + e.cta))) : null,
            e.series ? h("span", { class: "ui-chip" }, h("span", { class: "ui-chip-k" }, t("team.k.series")), h("span", { class: "ui-chip-v", html: bidi(e.series) })) : null,
            e.panel ? h("span", { class: "ui-chip", dataset: { csPanel: "" } }, h("span", { class: "ui-chip-k" }, t("team.k.panel")), h("span", { class: "ui-chip-v" }, t("team.panel", { n: e.panel.stops }) + (e.panel.depth && e.panel.slides ? " · " + t("team.panel.depth", { d: e.panel.depth, n: e.panel.slides }) : ""))) : null,
            e.verdict ? statusChip(t("team.verdict." + e.verdict), e.verdict) : null),
          e.loved ? h("p", { class: "ui-hint" }, icon("heart"), " " + t("team.loved") + ": ", h("span", { html: bidi(e.loved) })) : null,
          e.rejected ? h("p", { class: "ui-hint" }, icon("x"), " " + t("team.rejected") + ": ", h("span", { html: bidi(e.rejected) })) : null)));
    });
    chrome.panel.appendChild(list);
  }

  function statusChip(label, verdict) {
    return pill(label, verdict === "ship" ? "ok" : verdict === "killed" ? "bad" : "info");
  }

  function paintTab() {
    HOME_TABS.forEach(function (n) {
      var b = chrome.tabs.querySelector('[data-cs-tab="' + n + '"]');
      b.setAttribute("aria-selected", String(n === state.tab));
    });
    if (state.tab === "book") paintBook(); else if (state.tab === "plan") paintPlan(); else if (state.tab === "ideas") paintIdeas(); else if (state.tab === "team") paintTeam(); else paintPosts();
  }

  function openMenu2() {
    var theme = U.currentTheme();
    var next = theme === "auto" ? "light" : theme === "light" ? "dark" : "auto";
    openMenu(chrome.menu, [
      { label: t("menu.theme", { mode: t("theme." + theme) }), hint: t("theme." + next), icon: theme === "dark" ? "moon" : "sun", onSelect: function () { U.applyTheme(next); } },
      { label: U.dialect() === "en" ? t("menu.lang.ar") : t("menu.lang.en"), icon: "languages", onSelect: function () {
        var target = U.dialect() === "en" ? ((data.config && data.config.uiDialect && data.config.uiDialect !== "en") ? data.config.uiDialect : "msa-white") : "en";
        U.local.set("cs-ui-dialect", target); U.setUiDialect(target); build();
      } },
      { divider: true },
      ...(window.matchMedia("(max-width:759px)").matches ? [
        { label: t("home.capsule.copy"), icon: "copy", onSelect: function () { copyWithFeedback(capsule(), t("home.capsule")); } },
        { label: t("home.print"), icon: "download", onSelect: printable }
      ] : []),
      { label: t("home.brand-json"), icon: "download", onSelect: downloadBrand }
    ]);
  }

  function build() {
    clear(root);
    root.className = "ui-app ui-app--home";
    root.setAttribute("dir", uiDir());
    root.setAttribute("lang", uiLang());
    chrome.title = h("span", { class: "ui-doc-title" });
    chrome.state = h("span", { class: "ui-doc-state" });
    chrome.save = h("button", { type: "button", class: "ui-btn ui-btn--primary", dataset: { csAction: "save" }, onclick: save }, icon("save"), h("span", {}, t("top.save")));
    chrome.menu = h("button", { type: "button", class: "ui-btn ui-btn--icon ui-btn--ghost", "aria-label": t("top.menu"), "aria-haspopup": "menu", onclick: openMenu2 }, icon("ellipsis"));
    chrome.tabs = h("div", { class: "ui-tabs ui-tabs--page", role: "tablist", "aria-label": t("home.tabs") },
      HOME_TABS.map(function (n) {
        return h("button", { type: "button", role: "tab", class: "ui-tab", dataset: { csTab: n }, onclick: function () { state.tab = n; U.local.set("cs-home-tab", n); paintTab(); } },
          icon(n === "book" ? "book-open" : n === "plan" ? "calendar" : n === "ideas" ? "lightbulb" : n === "team" ? "users" : "layout-grid"), h("span", {}, t("home.tab." + n)));
      }));
    chrome.panel = h("section", { class: "ui-screen ui-home-panel", role: "tabpanel" });
    var foot = h("footer", { class: "ui-foot" }, hasStr("about.credit") ? h("span", { class: "ui-credit", dataset: { csCredit: "" } }, t("about.credit")) : null);
    var layer = h("div", { class: "ui-layer" });
    root.appendChild(h("header", { class: "ui-top" }, h("div", { class: "ui-top-in" },
      h("div", { class: "ui-wordmark" }, markSvg(), h("span", { class: "ui-wordmark-text" }, t("home.app"))),
      h("div", { class: "ui-doc" }, chrome.title, chrome.state),
      h("div", { class: "ui-top-actions" }, chrome.save, chrome.menu))));
    root.appendChild(h("main", { class: "ui-main ui-main--home", id: "ui-main" }, chrome.tabs, chrome.panel, foot));
    root.appendChild(layer);
    U.setLayer(layer);
    paintTop();
    paintTab();
  }

  build();
  window.__csReady = false;
  var fonts = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
  fonts.then(function () { return raf(); }).then(function () { return raf(); }).then(function () { window.__csReady = true; CS.emit("cs:ready", { ms: 0 }); });

  var controller = {
    getBrand: function () { return state.brand; },
    setBrand: function (brand) { state.brand = clone(brand); state.dirty = !same(state.brand, state.base); paintTop(); paintTab(); },
    setTab: function (n) { if (HOME_TABS.indexOf(n) >= 0) { state.tab = n; paintTab(); } },
    approveBook: approveBook,
    save: save,
    copyCapsule: async function () { var c = capsule(); await copyWithFeedback(c, t("home.capsule")); return c; },
    destroy: function () { if (book) { try { book.destroy(); } catch (e) { /* ignore */ } } clear(root); }
  };
  CS.ui.currentHome = controller;
  return controller;
}

/** Deep merge for plain JSON objects; arrays and scalars in `patch` replace. */
function deepMerge(base, patch) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return patch;
  var out = Object.assign({}, base);
  Object.keys(patch).forEach(function (k) {
    out[k] = patch[k] && typeof patch[k] === "object" && !Array.isArray(patch[k]) && base && typeof base[k] === "object" && base[k] ? deepMerge(base[k], patch[k]) : patch[k];
  });
  return out;
}

  /* ---- file: screens/preview.js ---- */
/* ui/screen-preview.js · how the post will look: the phone feed, the profile grid, the 130 px tile test and the guide overlays. */

var PREVIEW_VIEWS = ["feed", "grid", "tile", "guides"];

function monogram(ctx) {
  var name = (ctx.brand && ctx.brand.name) || (ctx.brand && ctx.brand.handle) || "?";
  return String(name).replace(/^@/, "").trim().charAt(0).toUpperCase();
}

function brandAvatar(ctx) {
  var logo = ctx.assets("logo");
  if (logo) return h("img", { class: "ui-avatar", src: logo.url, alt: "" });
  return h("span", { class: "ui-avatar ui-avatar--mono", "aria-hidden": "true" }, monogram(ctx));
}

function handleOf(ctx) {
  var hnd = (ctx.brand && ctx.brand.handle) || "";
  return hnd ? (hnd.charAt(0) === "@" ? hnd : "@" + hnd) : "";
}

function PreviewScreen(ctx) {
  var el = h("section", { class: "ui-screen ui-screen--preview", dataset: { csScreen: "preview" }, "aria-labelledby": "ui-h-preview" });
  var view = "feed";
  var body = h("div", { class: "ui-preview-body" });
  var switcher = segmented(PREVIEW_VIEWS.map(function (v) { return { value: v, label: t("preview." + v) }; }), view, function (v) { view = v; paint(); }, "ui-seg--wide");
  var stale = true;
  var guideSel = null;

  el.appendChild(h("header", { class: "ui-screen-head" }, h("h1", { class: "ui-h1", id: "ui-h-preview" }, t("preview.title")), h("p", { class: "ui-lede" }, t("preview.lede"))));
  el.appendChild(switcher);
  el.appendChild(body);

  /* ---- feed ------------------------------------------------------------------------------------------------- */
  function captionPreview() {
    var full = guard("assembleCaption", function () { return CS.core.spec.assembleCaption(ctx.spec); }, "");
    var fold = ctx.plugin ? ctx.plugin.caption.firstLineMaxChars : 125;
    var chars = Array.from(full);
    var head = chars.slice(0, fold).join("");
    var tail = chars.slice(fold).join("");
    var expanded = false;
    var cap = h("div", { class: "ui-phone-cap" });
    function paint() {
      clear(cap);
      var handle = handleOf(ctx);
      var line = h("p", { class: "ui-cap-text", dir: ctx.isEn() ? "ltr" : "rtl" });
      if (handle) line.appendChild(h("strong", { class: "ui-cap-handle" }, ltr(handle)));
      line.appendChild(document.createTextNode(" " + (expanded ? full : head)));
      if (!expanded && tail) {
        line.appendChild(document.createTextNode("… "));
        line.appendChild(h("button", { type: "button", class: "ui-cap-more", onclick: function () { expanded = true; paint(); } }, t("preview.more")));
      }
      cap.appendChild(line);
      if (tail && !expanded) cap.appendChild(h("p", { class: "ui-hint" }, icon("info"), t("preview.fold", { n: fold })));
      if (!full) cap.appendChild(h("p", { class: "ui-hint" }, t("preview.nocaption")));
    }
    paint();
    return cap;
  }

  function feed() {
    var dir = filmDirection(ctx);
    var slides = ctx.slides();
    var scroller = h("div", { class: "ui-phone-scroll", dir: dir, tabindex: "0", "aria-label": t("preview.feed.scroll") });
    slides.forEach(function (s) {
      var f = ctx.slideFrame(s.id, "ui-phone-slide");
      scroller.appendChild(h("div", { class: "ui-phone-cell" }, f.frame));
    });
    var dots = h("div", { class: "ui-dots", "aria-hidden": "true" }, slides.map(function () { return h("span", { class: "ui-dot" }); }));
    function paintDots() {
      var w = scroller.clientWidth || 1;
      var i = Math.round(Math.abs(scroller.scrollLeft) / w);
      Array.prototype.forEach.call(dots.children, function (d, k) { d.classList.toggle("is-on", k === i); });
    }
    scroller.addEventListener("scroll", paintDots, { passive: true });
    requestAnimationFrame(paintDots);
    var phone = h("div", { class: "ui-phone" },
      h("div", { class: "ui-phone-head" }, brandAvatar(ctx), h("div", { class: "ui-phone-who" }, h("strong", {}, handleOf(ctx) ? ltr(handleOf(ctx)) : (ctx.brand && ctx.brand.name) || ""), h("small", {}, t("preview.sponsor")))),
      scroller, dots,
      h("div", { class: "ui-phone-actions", "aria-hidden": "true" }, icon("heart"), icon("message-circle"), icon("send"), h("span", { class: "ui-grow" }), icon("bookmark")),
      captionPreview());
    return h("div", { class: "ui-preview-center" }, phone,
      h("p", { class: "ui-note" }, icon("info"), h("span", { html: bidi(t("preview.feed.note", { dir: dir === "rtl" ? t("preview.dir.rtl") : t("preview.dir.ltr") })) })));
  }

  /* ---- grid ------------------------------------------------------------------------------------------------- */
  function grid() {
    var first = ctx.slides()[0];
    var g = h("div", { class: "ui-grid3", dir: filmDirection(ctx) === "ltr" ? "ltr" : "rtl" });
    for (var i = 0; i < 9; i++) {
      if (i === 0 && first) { var f = ctx.slideFrame(first.id, "ui-grid-tile"); f.frame.classList.add("is-mine"); g.appendChild(f.frame); }
      else g.appendChild(h("div", { class: "ui-grid-ghost", "aria-hidden": "true" }, h("span", {})));
    }
    return h("div", { class: "ui-preview-center" },
      h("div", { class: "ui-phone ui-phone--grid" }, h("div", { class: "ui-phone-head" }, brandAvatar(ctx), h("div", { class: "ui-phone-who" }, h("strong", {}, handleOf(ctx) ? ltr(handleOf(ctx)) : ""), h("small", {}, t("preview.profile")))), g),
      h("p", { class: "ui-note" }, icon("info"), h("span", { html: bidi(t("preview.grid.note")) })));
  }

  /* ---- tile ------------------------------------------------------------------------------------------------- */
  function tile() {
    var first = ctx.slides()[0];
    var width = ctx.plugin ? ctx.plugin.thumbnail.widthPx : 130;
    var f = first ? ctx.slideFrame(first.id, "ui-tile-frame") : null;
    var verdict = h("div", { class: "ui-verdict" }, h("span", { class: "ui-spinner", "aria-hidden": "true" }), h("span", {}, t("preview.tile.checking")));
    var box = h("div", { class: "ui-tile-box" }, f ? h("div", { class: "ui-tile-slot", style: { width: width + "px" } }, f.frame) : null);
    if (f) {
      // the QA thumbnail test needs a laid-out slide, so wait for the clone to be in the frame
      setTimeout(function () { runTileTest(f, verdict); }, 120);
    }
    return h("div", { class: "ui-preview-center ui-tile-view" },
      h("div", { class: "ui-card" }, h("h2", { class: "ui-h2" }, t("preview.tile.title")), h("p", { class: "ui-lede" }, t("preview.tile.lede", { px: width })), h("div", { class: "ui-tile-row" }, box, verdict)));
  }

  async function runTileTest(f, host) {
    var slideEl = f.inner.querySelector(".cs-slide");
    if (!slideEl) { clear(host); host.appendChild(h("p", { class: "ui-hint" }, t("preview.tile.unavailable"))); return; }
    var res = null;
    try { res = await CS.qa.thumbnail(slideEl); } catch (e) { reportError("qa.thumbnail", e); }
    if (!host.isConnected) return;
    clear(host);
    if (!res) { host.appendChild(h("p", { class: "ui-hint" }, t("preview.tile.unavailable"))); return; }
    var kind = res.pass ? "ok" : res.fix ? "warn" : "bad";
    host.appendChild(h("div", { class: "ui-verdict-main ui-verdict--" + kind },
      icon(kind === "ok" ? "circle-check" : kind === "warn" ? "triangle-alert" : "circle-alert"),
      h("div", {}, h("strong", {}, t("preview.tile.verdict." + kind)), h("p", { class: "ui-hint" }, t("preview.tile.verdict." + kind + ".text")))));
    host.appendChild(h("dl", { class: "ui-facts" },
      h("div", {}, h("dt", {}, t("preview.tile.hero")), h("dd", { dir: "ltr" }, (Math.round(res.heroPx * 10) / 10) + " px")),
      h("div", {}, h("dt", {}, t("preview.tile.contrast")), h("dd", { dir: "ltr" }, (Math.round(res.localContrast * 10) / 10) + ":1"))));
    if (!res.pass) host.appendChild(h("button", { type: "button", class: "ui-btn ui-btn--secondary ui-btn--sm", onclick: function () { ctx.select(ctx.slides()[0].id); ctx.go("design"); } }, icon("palette"), t("preview.tile.fix")));
  }

  /* ---- guides ----------------------------------------------------------------------------------------------- */
  function guideView() {
    if (!guideSel || !ctx.slide(guideSel)) guideSel = ctx.slides()[0] && ctx.slides()[0].id;
    var c = ctx.canvas();
    var f = ctx.slideFrame(guideSel, "ui-guide-frame");
    f.inner.appendChild(guidesLayer(ctx, ctx.guides));
    var toggles = h("div", { class: "ui-toggles" },
      [["safe", "guides.safe"], ["crop", "guides.crop"], ["content", "guides.content"], ["keepouts", "guides.keepouts"]].map(function (g) {
        return switchBox(t(g[1]), ctx.guides[g[0]], function (on) { ctx.guides[g[0]] = on; paint(); });
      }));
    var idx = ctx.index(guideSel);
    var nav = makeStageNav(ctx, function (d) { var list = ctx.slides(); guideSel = list[Math.max(0, Math.min(list.length - 1, idx + d))].id; paint(); });
    nav.update(idx, ctx.slides().length);
    return h("div", { class: "ui-guides-view" },
      h("div", { class: "ui-guides-stage" }, nav.el, h("div", { class: "ui-guides-frame" }, f.frame)),
      h("div", { class: "ui-card" }, h("h2", { class: "ui-h2" }, t("guides.title")), h("p", { class: "ui-hint" }, t("guides.lede", { w: c.w, h: c.h })), toggles));
  }

  function paint() {
    releaseFrames(body);
    clear(body);
    switcher.setValue(view);
    if (!ctx.slides().length) { body.appendChild(h("p", { class: "ui-empty" }, t("preview.empty"))); return; }
    body.appendChild(view === "feed" ? feed() : view === "grid" ? grid() : view === "tile" ? tile() : guideView());
    stale = false;
  }

  ctx.bus.on("spec", function () { stale = true; if (!el.hidden) paint(); });
  ctx.bus.on("thumbs", function () { /* frames repaint themselves */ });

  return {
    el: el,
    show: function () { if (stale || !body.firstChild) paint(); },
    hide: function () { releaseFrames(body); stale = true; }
  };
}

  /* ---- file: screens/motion.js ---- */
/* ui/screen-motion.js · the animated cover: pick a recipe, watch the loop, check that frame 0 equals the last frame.
 * The live preview animates its own render of slide 1; it never touches the shared thumbs. */

function MotionScreen(ctx) {
  var el = h("section", { class: "ui-screen ui-screen--motion", dataset: { csScreen: "motion" }, "aria-labelledby": "ui-h-motion" });
  var stageHost = h("div", { class: "ui-motion-stage" });
  var controls = h("div", { class: "ui-motion-controls" });
  var chipsHost = h("div", { class: "ui-motion-recipes" });
  var infoHost = h("div", { class: "ui-motion-info" });
  var badgeHost = h("div", { class: "ui-loopbadge" });
  var player = null, timeline = null, frame = null, scrub = null, timeLabel = null, playBtn = null;
  var gen = 0;
  var stale = true;
  var fullMotion = false;
  var reduced = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  el.appendChild(h("header", { class: "ui-screen-head" }, h("h1", { class: "ui-h1", id: "ui-h-motion" }, t("motion.title")), h("p", { class: "ui-lede" }, t("motion.lede"))));
  el.appendChild(h("div", { class: "ui-motion" },
    h("div", { class: "ui-motion-left" }, stageHost, controls, badgeHost),
    h("div", { class: "ui-motion-right" }, chipsHost, infoHost)));

  function currentMotion() { return (ctx.spec.cover && ctx.spec.cover.motion) || { recipe: "calm", seconds: 6, fps: 30, source: "internal" }; }

  function recipeList() {
    var list = guard("motion.list", function () { return CS.motion.list({ shippedOnly: true }); }, []);
    if (!list.some(function (r) { return r.id === "none"; })) list = list.concat([{ id: "none", label: { ar: "من غير حركة", en: "No motion" }, feel: "calm" }]);
    return list;
  }

  function teardown() {
    if (player) { try { player.destroy(); } catch (e) { /* already gone */ } }
    player = null; timeline = null;
  }

  function fmtTime(t0) { return (Math.round(t0 * 10) / 10).toFixed(1) + " / " + (timeline ? timeline.duration.toFixed(1) : "6.0") + "s"; }

  async function mountPlayer() {
    var my = ++gen;
    teardown();
    clear(stageHost); clear(controls); clear(badgeHost);
    var first = ctx.slides()[0];
    if (!first) return;
    var c = ctx.canvas();
    var f = makeFrame(c.w, c.h, "ui-motion-frame is-loading");
    frame = f;
    stageHost.appendChild(f.frame);
    var m = currentMotion();
    if (m.clip) {
      try {
        var poster = await ctx.renderFresh(0, "thumb");
        if (my !== gen) return;
        f.inner.appendChild(poster.el);
        f.frame.classList.remove("is-loading");
        controls.appendChild(h("p", { class: "ui-note" }, t("motion.poster-first")));
      } catch (e) { reportError("clip poster", e); f.frame.classList.add("is-failed"); }
      return;
    }
    if (m.recipe === "none") {
      f.frame.classList.remove("is-loading");
      var still = ctx.thumbClone(first.id);
      if (still) f.inner.appendChild(still);
      controls.appendChild(h("p", { class: "ui-note" }, icon("info"), h("span", { html: bidi(t("motion.static")) })));
      return;
    }
    var r;
    try { r = await ctx.renderFresh(0, "thumb"); } catch (e) { reportError("motion render", e); f.frame.classList.add("is-failed"); return; }
    if (my !== gen) return;
    f.inner.appendChild(r.el);
    f.frame.classList.remove("is-loading");
    try {
      timeline = CS.motion.build(r.el, { recipe: m.recipe, seconds: m.seconds || 6, fps: 30, feel: m.feel, reducedMotion: reduced && !fullMotion });
      player = CS.motion.mount(r.el, timeline, { loop: true, autoplay: !(reduced && !fullMotion) });
    } catch (e) {
      reportError("motion build", e);
      stageHost.appendChild(h("p", { class: "ui-note ui-note--warn" }, icon("triangle-alert"), h("span", { html: bidi(t("motion.failed")) })));
      return;
    }
    playBtn = h("button", { type: "button", class: "ui-btn ui-btn--secondary ui-btn--icon", "aria-label": t("motion.play-pause"), onclick: function () { player.toggle(); paintPlay(); } });
    scrub = h("input", {
      type: "range", class: "ui-range", min: 0, max: timeline.duration, step: 1 / 30, value: 0, "aria-label": t("motion.scrub"),
      oninput: function () { player.pause(); player.seek(+scrub.value); paintPlay(); timeLabel.textContent = fmtTime(+scrub.value); }
    });
    timeLabel = h("span", { class: "ui-time", dir: "ltr" }, fmtTime(0));
    var replay = h("button", { type: "button", class: "ui-btn ui-btn--ghost ui-btn--icon", "aria-label": t("motion.restart"), onclick: function () { player.seek(0); player.play(); paintPlay(); } }, icon("rotate-ccw"));
    controls.appendChild(h("div", { class: "ui-transport", dir: "ltr" }, playBtn, replay, scrub, timeLabel));
    player.onframe = function (tm) { scrub.value = tm; timeLabel.textContent = fmtTime(tm); };
    paintPlay();
    if (reduced) controls.appendChild(switchBox(t("motion.reduced"), fullMotion, function (on) { fullMotion = on; mountPlayer(); }, t("motion.reduced.hint")));
    setTimeout(function () { if (my === gen) checkLoop(my); }, 500);
  }

  function paintPlay() {
    if (!playBtn || !player) return;
    clear(playBtn);
    playBtn.appendChild(icon(player.playing ? "pause" : "play"));
  }

  async function checkLoop(my) {
    clear(badgeHost);
    if (!player || !frame) return;
    badgeHost.appendChild(h("div", { class: "ui-verdict" }, h("span", { class: "ui-spinner", "aria-hidden": "true" }), h("span", {}, t("motion.loop.checking"))));
    var slideEl = frame.inner.querySelector(".cs-slide");
    var wasPlaying = player.playing, at = player.time;
    var res = null;
    try {
      player.pause();
      var scale = 0.25;
      player.seekFrame(0);
      await raf();
      var c0 = await CS.paint.toCanvas(slideEl, { scale: scale });
      player.seekFrame(timeline.frames - 1);
      await raf();
      var c1 = await CS.paint.toCanvas(slideEl, { scale: scale });
      var posterHost = ctx.thumbClone(ctx.slides()[0].id);
      var tmp = h("div", { class: "ui-offscreen" }, posterHost);
      ctx.root.appendChild(tmp);
      var cp = await CS.paint.toCanvas(posterHost, { scale: scale });
      tmp.remove();
      res = CS.qa.loopCheck(c0, c1, cp);
    } catch (e) { reportError("loop check", e); }
    try { player.seek(at); if (wasPlaying) player.play(); } catch (e) { /* player destroyed meanwhile */ }
    paintPlay();
    if (my !== gen) return;
    clear(badgeHost);
    if (!res) { badgeHost.appendChild(h("p", { class: "ui-hint" }, icon("info"), t("motion.loop.unavailable"))); return; }
    badgeHost.appendChild(h("div", { class: "ui-verdict-main ui-verdict--" + (res.ok ? "ok" : "bad") },
      icon(res.ok ? "circle-check" : "circle-alert"),
      h("div", {}, h("strong", {}, res.ok ? t("motion.loop.ok") : t("motion.loop.bad")),
        h("p", { class: "ui-hint", dir: "ltr" }, "SSIM " + res.ssim.toFixed(3) + " · PSNR " + Math.round(res.psnr) + " dB"))));
  }

  function paintRecipes() {
    clear(chipsHost); clear(infoHost);
    var m = currentMotion();
    if (m.clip) {
      infoHost.appendChild(h("div", { class: "ui-label" }, t("motion.seconds")));
      infoHost.appendChild(h("p", { class: "ui-note" }, t("motion.seconds.n", { n: m.seconds })));
      infoHost.appendChild(h("p", { class: "ui-hint" }, t("motion.poster-first")));
      return;
    }
    var preset = ctx.preset();
    var allowed = preset && preset.motion && preset.motion.allowed;
    var rec = guard("motion.recommend", function () { return CS.motion.recommend(ctx.spec); }, null);
    chipsHost.appendChild(h("h2", { class: "ui-h2" }, t("motion.recipes")));
    var list = h("div", { class: "ui-recipes" });
    recipeList().forEach(function (r) {
      var ok = r.id === "none" || !allowed || allowed.indexOf(r.id) >= 0;
      list.appendChild(h("button", {
        type: "button", class: "ui-recipe", "aria-pressed": String(m.recipe === r.id), disabled: !ok, title: ok ? "" : t("motion.not-allowed"),
        onclick: function () { ctx.setMotion({ recipe: r.id, feel: r.feel || "calm", source: "internal" }); }
      }, h("strong", {}, msgOf(r.label)), h("small", {}, r.id === "none" ? t("motion.feel.none") : t("motion.feel." + (r.feel || "calm"))),
        rec && rec.recipe === r.id ? pill(t("motion.recommended"), "ok", "sparkles") : null));
    });
    chipsHost.appendChild(list);
    if (rec) infoHost.appendChild(h("p", { class: "ui-note" }, icon("lightbulb"), h("span", { html: bidi(msgOf(rec.why)) })));
    infoHost.appendChild(h("div", { class: "ui-label" }, t("motion.seconds")));
    infoHost.appendChild(segmented([{ value: "5", label: t("motion.seconds.n", { n: 5 }) }, { value: "6", label: t("motion.seconds.n", { n: 6 }) }], String(m.seconds || 6), function (v) { ctx.setMotion({ seconds: +v }); }));
    infoHost.appendChild(h("div", { class: "ui-card ui-card--quiet" }, h("strong", {}, t("motion.plate")), h("p", { class: "ui-hint", html: bidi(t("motion.plate.text")) })));
    infoHost.appendChild(h("p", { class: "ui-hint" }, icon("info"), t("motion.poster-first")));
  }

  ctx.bus.on("spec", function (d) {
    var motionChanged = d.path === "/cover/motion" || d.slides === "all" || d.structure || (d.slides && d.slides.indexOf((ctx.slides()[0] || {}).id) >= 0);
    if (!motionChanged) return;
    stale = true;
    if (!el.hidden) { paintRecipes(); mountPlayer(); stale = false; }
  });

  return {
    el: el,
    show: function () { if (stale || !player) { paintRecipes(); mountPlayer(); stale = false; } else if (player) { player.play(); paintPlay(); } },
    hide: function () { teardown(); gen++; releaseFrames(stageHost); stale = true; }
  };
}

  /* ---- file: screens/copy.js ---- */
/* ui/screen-copy.js · the post caption (with the 125-character fold), hashtags, per-slide captions and alt text, each with Copy. */

function charCount(s) { return Array.from(String(s || "")).length; }

function ensureLen(arr, n) {
  var out = (arr || []).slice(0, n);
  while (out.length < n) out.push("");
  return out;
}

function CopyScreen(ctx) {
  var el = h("section", { class: "ui-screen ui-screen--copy", dataset: { csScreen: "copy" }, "aria-labelledby": "ui-h-copy" });
  var host = h("div", { class: "ui-copy" });
  var stale = true;
  var foldView = null, totalMeter = null;

  el.appendChild(h("header", { class: "ui-screen-head" }, h("h1", { class: "ui-h1", id: "ui-h-copy" }, t("copy.title")), h("p", { class: "ui-lede" }, t("copy.lede"))));
  el.appendChild(host);

  function cp() { return ctx.spec.captionPack || {}; }
  function plug() { return ctx.plugin || { caption: { defaultChars: [300, 900], firstLineMaxChars: 125 }, hashtags: { max: 5 }, perSlideCaption: { maxChars: 100 }, alt: { targetMaxChars: 300, hardMaxChars: 1000 } }; }

  function copyBtn(getText, label, cls) {
    return h("button", { type: "button", class: "ui-btn ui-btn--ghost ui-btn--sm" + (cls ? " " + cls : ""), onclick: function () { copyWithFeedback(getText(), label); } }, icon("copy"), t("common.copy"));
  }

  function counter(n, lo, hi, hard) {
    var kind = hard && n > hard ? "bad" : n < lo || n > hi ? "warn" : "ok";
    return h("span", { class: "ui-meter ui-meter--" + kind, dir: "ltr" }, h("span", { class: "ui-meter-n" }, String(n)), h("span", { class: "ui-meter-max" }, "/" + hi));
  }

  /* ---- caption ---------------------------------------------------------------------------------------------- */
  function captionSection() {
    var p = plug().caption;
    var fields = [["firstLine", "copy.firstLine", 2200, 1], ["keywordLine", "copy.keywordLine", 2200, 1], ["body", "copy.body", 2200, 3], ["cta", "copy.cta", 600, 1]];
    var editors = fields.map(function (f) {
      var key = f[0];
      var id = uid("c");
      var ta = h("textarea", {
        class: "ui-input ui-text", id: id, rows: f[3], maxlength: f[2], dir: ctx.isEn() ? "ltr" : "rtl", spellcheck: "false", dataset: { field: key },
        "aria-label": t(f[1])
      });
      ta.value = cp()[key] || "";
      var meterHost = h("span", {});
      function paint() {
        clear(meterHost);
        var n = charCount(ta.value);
        if (key === "firstLine") meterHost.appendChild(counter(n, 0, p.firstLineMaxChars, 0));
        else meterHost.appendChild(h("span", { class: "ui-meter ui-meter--ok", dir: "ltr" }, h("span", { class: "ui-meter-n" }, String(n))));
      }
      ta.addEventListener("input", function () { autosize(ta); paint(); });
      ta.addEventListener("change", function () { var patch = {}; patch[key] = cleanText(ta.value); ctx.setCaption(patch); ctx.runTextQa(); paintFold(); });
      requestAnimationFrame(function () { autosize(ta); });
      paint();
      return h("div", { class: "ui-field" }, h("div", { class: "ui-field-head" }, h("label", { class: "ui-label", for: id }, t(f[1])), meterHost), ta,
        key === "firstLine" ? h("p", { class: "ui-hint" }, t("copy.firstLine.hint", { n: p.firstLineMaxChars })) : key === "keywordLine" ? h("p", { class: "ui-hint" }, t("copy.keywordLine.hint")) : null);
    });
    foldView = h("div", { class: "ui-foldview" });
    totalMeter = h("div", { class: "ui-copy-total" });
    var head = h("div", { class: "ui-row ui-row--between" }, h("h2", { class: "ui-h2" }, t("copy.caption")),
      h("button", { type: "button", class: "ui-btn ui-btn--secondary", dataset: { csAction: "copy-caption" }, onclick: function () { copyWithFeedback(assembled(), t("copy.caption")); } }, icon("copy"), t("copy.copy-all")));
    paintFold();
    return h("div", { class: "ui-card" }, head, editors, totalMeter, foldView);
  }

  function assembled() { return guard("assembleCaption", function () { return CS.core.spec.assembleCaption(ctx.spec); }, ""); }

  function paintFold() {
    if (!foldView) return;
    var p = plug().caption;
    var full = assembled();
    var chars = Array.from(full);
    var total = chars.length;
    clear(totalMeter);
    totalMeter.appendChild(h("span", { class: "ui-label" }, t("copy.total")));
    totalMeter.appendChild(counter(total, p.defaultChars[0], p.defaultChars[1], 2200));
    totalMeter.appendChild(h("span", { class: "ui-hint" }, t("copy.total.hint", { lo: p.defaultChars[0], hi: p.defaultChars[1] })));
    clear(foldView);
    if (!total) { foldView.appendChild(h("p", { class: "ui-hint" }, t("copy.empty"))); return; }
    var fold = p.firstLineMaxChars;
    var head = chars.slice(0, fold).join(""), tail = chars.slice(fold).join("");
    foldView.appendChild(h("div", { class: "ui-label" }, t("copy.fold.title")));
    foldView.appendChild(h("p", { class: "ui-fold-text", dir: ctx.isEn() ? "ltr" : "rtl" },
      h("span", { class: "ui-fold-visible" }, head),
      tail ? [h("span", { class: "ui-fold-mark", title: t("copy.fold.mark") }, t("copy.fold.mark")), h("span", { class: "ui-fold-hidden" }, tail)] : null));
  }

  /* ---- hashtags --------------------------------------------------------------------------------------------- */
  function hashtagSection() {
    var max = plug().hashtags.max;
    var tags = (cp().hashtags || []).slice();
    var chips = h("div", { class: "ui-chips ui-chips--tags" });
    var err = h("p", { class: "ui-hint ui-hint--bad", hidden: true }, "");
    var input = h("input", { class: "ui-input", type: "text", dir: "auto", maxlength: 61, placeholder: t("copy.tags.add"), "aria-label": t("copy.tags.add") });
    function add() {
      var v = input.value.trim().replace(/^#*/, "#");
      if (v === "#") return;
      if (!/^#[^ \t\n\r\u00A0#]{1,60}$/.test(v)) { err.textContent = t("copy.tags.invalid"); err.hidden = false; return; }
      if (tags.indexOf(v) >= 0) { err.textContent = t("copy.tags.duplicate"); err.hidden = false; return; }
      if (tags.length >= max) { err.textContent = t("copy.tags.max", { n: max }); err.hidden = false; return; }
      err.hidden = true;
      tags.push(v);
      input.value = "";
      commit();
    }
    function remove(i) { tags.splice(i, 1); commit(); }
    function commit() { ctx.setCaption({ hashtags: tags.slice() }); ctx.runTextQa(); paintTags(); paintFold(); }
    function paintTags() {
      clear(chips);
      tags.forEach(function (tg, i) {
        chips.appendChild(h("span", { class: "ui-tag" }, h("bdi", { dir: "auto" }, tg), h("button", { type: "button", "aria-label": t("common.delete") + " " + tg, onclick: function () { remove(i); } }, icon("x"))));
      });
      if (!tags.length) chips.appendChild(h("span", { class: "ui-hint" }, t("copy.tags.none")));
    }
    input.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(); } });
    paintTags();
    return h("div", { class: "ui-card" },
      h("div", { class: "ui-row ui-row--between" }, h("h2", { class: "ui-h2" }, t("copy.tags")), h("span", { class: "ui-meter ui-meter--" + (tags.length > max ? "bad" : "ok"), dir: "ltr" }, tags.length + "/" + max)),
      h("p", { class: "ui-hint" }, t("copy.tags.hint")),
      chips,
      h("div", { class: "ui-row" }, input, h("button", { type: "button", class: "ui-btn ui-btn--secondary", onclick: add }, icon("plus"), t("common.add")), copyBtn(function () { return tags.join(" "); }, t("copy.tags"))),
      err);
  }

  /* ---- per slide --------------------------------------------------------------------------------------------- */
  function perSlideSection() {
    var n = ctx.slides().length;
    var per = ensureLen(cp().perSlide, n), alt = ensureLen(cp().alt, n);
    var p = plug();
    var rows = h("div", { class: "ui-persl" });
    ctx.slides().forEach(function (s, i) {
      var f = ctx.slideFrame(s.id, "ui-mini-frame");
      var cap = h("input", {
        class: "ui-input", type: "text", maxlength: 300, dir: ctx.isEn() ? "ltr" : "rtl", "aria-label": t("copy.per") + " " + (i + 1),
        onchange: function () { var a = ensureLen(cp().perSlide, n); a[i] = cleanText(cap.value); ctx.setCaption({ perSlide: a }); ctx.runTextQa(); paintCap(); }
      });
      cap.value = per[i] || "";
      var capMeter = h("span", {});
      function paintCap() { clear(capMeter); capMeter.appendChild(counter(charCount(cap.value), 0, p.perSlideCaption.maxChars, 0)); }
      cap.addEventListener("input", paintCap);
      paintCap();
      var altEl = h("textarea", {
        class: "ui-input ui-text", rows: 2, maxlength: 1000, dir: ctx.isEn() ? "ltr" : "rtl", "aria-label": t("copy.alt") + " " + (i + 1),
        onchange: function () { var a = ensureLen(cp().alt, n); a[i] = cleanText(altEl.value); ctx.setCaption({ alt: a }); ctx.runTextQa(); paintAlt(); }
      });
      altEl.value = alt[i] || "";
      var altMeter = h("span", {});
      function paintAlt() { clear(altMeter); altMeter.appendChild(counter(charCount(altEl.value), 0, p.alt.targetMaxChars, p.alt.hardMaxChars)); }
      altEl.addEventListener("input", function () { autosize(altEl); paintAlt(); });
      paintAlt();
      requestAnimationFrame(function () { autosize(altEl); });
      rows.appendChild(h("article", { class: "ui-persl-row", dataset: { sid: s.id } },
        h("div", { class: "ui-persl-thumb" }, f.frame, h("span", { class: "ui-persl-n", dir: "ltr" }, String(i + 1))),
        h("div", { class: "ui-persl-fields" },
          h("div", { class: "ui-field" }, h("div", { class: "ui-field-head" }, h("span", { class: "ui-label" }, t("copy.per")), capMeter, copyBtn(function () { return cap.value; }, t("copy.per"))), cap),
          h("div", { class: "ui-field" }, h("div", { class: "ui-field-head" }, h("span", { class: "ui-label" }, t("copy.alt")), altMeter, copyBtn(function () { return altEl.value; }, t("copy.alt"))), altEl))));
    });
    return h("div", { class: "ui-card" },
      h("div", { class: "ui-row ui-row--between" }, h("h2", { class: "ui-h2" }, t("copy.persl")),
        h("div", { class: "ui-row" },
          copyBtn(function () { return lines(cp().perSlide); }, t("copy.per-all")),
          copyBtn(function () { return lines(cp().alt); }, t("copy.alt-all")))),
      h("p", { class: "ui-hint" }, t("copy.persl.hint")),
      rows);
  }

  /** "NN: text" lines with Western digits, the same format as the kit's text files. */
  function lines(list) {
    return (list || []).map(function (x, i) { return pad2(i + 1) + ": " + (x || ""); }).join("\n");
  }

  function build() {
    releaseFrames(host);
    clear(host);
    [captionSection(), hashtagSection(), perSlideSection()].forEach(function (s) { host.appendChild(s); });
    stale = false;
  }

  ctx.bus.on("spec", function (d) {
    if (d.path && d.path.indexOf("/captionPack") === 0) return;      // our own edits: leave the form alone
    stale = true;
    if (!el.hidden) build();
  });

  return {
    el: el,
    show: function () { if (stale) build(); paintFold(); },
    hide: function () { releaseFrames(host); stale = true; }
  };
}

  /* ---- file: exportflow.js ---- */
(function () {
var U = CS.ui._;
var guardAsync = U.guardAsync;
var serializeSource = CS.ui.serializeSource;
/* brandbook/exportflow.js · the export operations behind the Export screen: publishing kit, single files and the progress state.
 * Everything is derived from the spec by CS.export; the Studio only gates, reports progress and saves. */

var EXPORT_ERRORS = ["E_ENCODER_UNSUPPORTED", "E_DEP_LOAD", "E_PAINT_TAINTED", "E_PAINT_UNSUPPORTED", "E_FONT_MISSING", "E_FIT_OVERFLOW"];

function attachExport(ctx) {
  ctx.exp = { running: false, done: 0, total: 0, label: "", ctrl: null, last: null, caps: null, options: { video: true, variants4x5: true, pdf: true, source: false } };      // source files are opt-in (CONTRACT 4.7)

  function note() { ctx.bus.emit("export"); }

  function exportCtx(signal) {
    return {
      brand: ctx.brand, assets: ctx.assets, dialect: U.dialect(), signal: signal,
      sourceHtml: function () { return serializeSource(); },
      onProgress: function (p) {
        ctx.exp.done = p.done; ctx.exp.total = p.total;
        ctx.exp.label = p.label || p.job || "";
        note();
      }
    };
  }

  ctx.exportCaps = function () {
    if (ctx.exp.caps) return ctx.exp.caps;
    ctx.exp.caps = guardAsync("export.capabilities", function () { return CS.export.capabilities(); }, null).then(function (c) {
      ctx.exp.caps = Promise.resolve(c);
      ctx.exp.capsValue = c;
      note();
      return c;
    });
    return ctx.exp.caps;
  };

  function explain(e) {
    var code = e && e.code;
    if (code === "E_ABORTED") return null;
    if (EXPORT_ERRORS.indexOf(code) >= 0) return t("export.err." + code);
    return t("export.err.generic");
  }

  /** Run one export job with progress, cancel and uniform error handling. Resolves the job's value or null. */
  async function job(label, fn) {
    if (ctx.exp.running) return null;
    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    ctx.exp.running = true; ctx.exp.ctrl = ctrl; ctx.exp.done = 0; ctx.exp.total = 0; ctx.exp.label = label;
    note();
    try {
      return await fn(exportCtx(ctrl && ctrl.signal), ctrl && ctrl.signal);
    } catch (e) {
      var msg = explain(e);
      if (msg) { reportError("export", e); toast(msg, "error"); CS.emit("cs:export-error", { code: (e && e.code) || "E_USAGE", message: String((e && e.message) || e) }); }
      return null;
    } finally {
      ctx.exp.running = false; ctx.exp.ctrl = null;
      note();
    }
  }

  ctx.cancelExport = function () { if (ctx.exp.ctrl) ctx.exp.ctrl.abort(); };

  /** Save files through CS.export.save and summarise the outcome for the user. */
  async function deliver(files, saveOpts) {
    var list = Array.isArray(files) ? files : [files];
    var res = await CS.export.save(list, Object.assign({ mode: "auto", onStatus: function (s) { ctx.exp.label = s; note(); } }, saveOpts || {}));
    ctx.exp.last = { at: Date.now(), saved: res.saved || [], declined: res.declined || [], failed: res.failed || [], skipped: ctx.exp.last && ctx.exp.last.skipped || [] };
    if ((res.saved || []).length) toast(t("export.saved", { n: res.saved.length }), "ok");
    else if ((res.declined || []).length) toast(t("export.declined"), "info");
    if ((res.failed || []).length) toast(t("export.failed", { n: res.failed.length }), "error");
    CS.emit("cs:export-done", { files: list.map(function (f) { return { path: f.path || f.name, bytes: f.bytes ? f.bytes.length : 0 }; }) });
    note();
    return res;
  }

  /** Make sure the layout is approved and frozen before producing final files. */
  ctx.ensureFrozen = async function () {
    var ok = ctx.spec.frozen && guard("freeze.verify", function () { return CS.core.freeze.verify(ctx.spec, ctx.tokens || CS.core.resolve.post(ctx.spec, ctx.brand)).ok; }, false);
    if (ok) return true;
    await ctx.approve("design", { save: false });
    return !!ctx.spec.frozen;
  };

  /** Everything that must hold before a kit can be written. Returns {ok, reason}. */
  ctx.exportGate = async function () {
    if (ctx.qa.stale || !ctx.qa.all) await ctx.runQa();
    var hard = ctx.blockers();
    if (hard.length) return { ok: false, reason: "blocked", blockers: hard };
    return { ok: true };
  };

  ctx.exportKit = async function (opts) {
    opts = Object.assign({}, ctx.exp.options, opts || {});
    var gate = await ctx.exportGate();
    if (!gate.ok) { toast(t("export.blocked", { n: gate.blockers.length }), "warn"); ctx.go("export"); return { mode: "downloads", saved: [], declined: [], failed: [{ name: "kit", error: "qa-blocked" }] }; }
    if (!(await ctx.ensureFrozen())) return { mode: "downloads", saved: [], declined: [], failed: [{ name: "kit", error: "not-approved" }] };
    var kit = await job(t("export.job.kit"), async function (ectx, signal) {
      return CS.export.kit(ctx.spec, ectx, {
        video: opts.video, variants4x5: opts.variants4x5, pdf: opts.pdf, source: opts.source, zip: true, dialect: U.dialect(),
        onProgress: ectx.onProgress, signal: signal
      });
    });
    if (!kit) return { mode: "downloads", saved: [], declined: [], failed: [{ name: "kit", error: "export-failed" }] };
    var exportBlocks = (kit.report && kit.report.results || []).filter(function (r) { return r.sev === "BLOCK" && !r.overridden; });
    if (exportBlocks.length) {
      ctx.qa.exportBlocks = exportBlocks;
      toast(t("export.kit.blocked", { n: exportBlocks.length }), "error");
      ctx.bus.emit("qa", { kind: "export" });
      return { mode: "downloads", saved: [], declined: [], failed: [{ name: "kit", error: "export-qa" }] };
    }
    ctx.exp.last = { at: Date.now(), saved: [], declined: [], failed: [], skipped: kit.skipped || [] };
    if ((kit.skipped || []).some(function (s) { return /mp4/.test(s.path); })) toast(t("export.video.skipped"), "warn");
    var res = await job(t("export.job.save"), function () { return deliver(kit.zip ? [kit.zip] : kit.files); });
    if (res && (res.saved || []).length) {
      ctx.commit(function (sp) {
        var next = Object.assign({}, sp, { checkpoint: "exported" });
        if (kit.report) next.qa = { status: kit.report.status, runAt: kit.report.createdAt || isoNow(), engine: kit.report.engine || CS.version, results: (kit.report.results || []).slice(0, 400) };
        return next;
      }, { layout: false, slides: [], origin: "export" });
    }
    return res || { mode: "downloads", saved: [], declined: [], failed: [] };
  };

  /** Single-file exports: png | png-one | jpeg | mp4 | mp4-4x5 | pdf | source | text:<name> | photos. */
  ctx.exportFiles = async function (kind, o) {
    o = o || {};
    var spec = ctx.spec;
    return job(t("export.job." + kind.split(":")[0]), async function (ectx, signal) {
      var files, saveOpts;
      if (kind === "png" || kind === "photos") {
        files = await CS.export.slides(spec, ectx, { format: "png", onProgress: ectx.onProgress, signal: signal });
        if (kind === "photos") {
          if (spec.cover && spec.cover.motion && spec.cover.motion.recipe !== "none" && o.video !== false) {
            try { files.unshift(await CS.export.cover(spec, ectx, { variant: "3x4", onProgress: ectx.onProgress, signal: signal })); }
            catch (e) { if (e && e.code === "E_ABORTED") throw e; toast(t("export.video.skipped"), "warn"); }
          }
          saveOpts = { mode: "share" };
        }
      } else if (kind === "png-one") files = await CS.export.slides(spec, ectx, { format: "png", only: [o.slideId || ctx.sel], onProgress: ectx.onProgress, signal: signal });
      else if (kind === "jpeg") files = await CS.export.slides(spec, ectx, { format: "jpeg4x5", onProgress: ectx.onProgress, signal: signal });
      else if (kind === "mp4") files = [await CS.export.cover(spec, ectx, { variant: "3x4", onProgress: ectx.onProgress, signal: signal })];
      else if (kind === "mp4-4x5") files = [await CS.export.cover(spec, ectx, { variant: "4x5", onProgress: ectx.onProgress, signal: signal })];
      else if (kind === "pdf") {
        var pages = await CS.export.slides(spec, ectx, { format: "png", onProgress: ectx.onProgress, signal: signal });
        files = [await CS.export.pdf(pages, { title: (spec.brief && spec.brief.topic) || "carousel" })];
      } else if (kind === "source") {
        var src = await CS.export.source(spec, ectx, { signal: signal, check: true });
        files = [CS.export.zip(src.files, { name: spec.id + "-source.zip", root: "carousel-source" })];
        if (src.skipped.length) toast(t("export.source.partial"), "warn");
      } else if (kind.indexOf("text:") === 0) {
        var name = kind.slice(5);
        var tx = CS.export.text;
        if (name === "caption") files = [tx.caption(spec)];
        else if (name === "hashtags") files = [tx.hashtags(spec)];
        else if (name === "slideCaptions") files = [tx.slideCaptions(spec)];
        else if (name === "alt") files = [tx.alt(spec)];
        else if (name === "postingGuide") files = [tx.postingGuide(U.dialect(), { anyAi: ctx.anyAi() })];
        else throw new CS.CSError("E_USAGE", "unknown text export " + name);
      } else throw new CS.CSError("E_USAGE", "unknown export " + kind);
      var res = await deliver(files, saveOpts);
      if (saveOpts && saveOpts.mode === "share" && res && !(res.saved || []).length && !(res.declined || []).length) res = await deliver(files, { mode: "auto" });
      return res;
    });
  };

  /** The posting guide as Markdown text (the Export screen renders it as cards). */
  ctx.postingGuideText = function () {
    var f = guard("export.text.postingGuide", function () { return CS.export.text.postingGuide(U.dialect(), { anyAi: ctx.anyAi() }); }, null);
    if (!f || !f.bytes) return "";
    try { return new TextDecoder("utf-8").decode(f.bytes); } catch (e) { return ""; }
  };
}

U.attachExport = attachExport;
})();

  /* ---- file: screens/export.js ---- */
/* ui/screen-export.js · «حزمة النشر» (the publishing kit), single files, save-to-photos on phones and the posting guide. */

var SINGLE_EXPORTS = [
  ["png", "image", "export.single.png"], ["png-one", "image", "export.single.png-one"], ["mp4", "film", "export.single.mp4"], ["mp4-4x5", "film", "export.single.mp4-4x5"],
  ["jpeg", "crop", "export.single.jpeg"], ["pdf", "file-text", "export.single.pdf"], ["source", "square-pen", "export.single.source"],
  ["text:caption", "message-square-text", "export.single.caption"], ["text:hashtags", "hash", "export.single.hashtags"],
  ["text:slideCaptions", "list-checks", "export.single.slideCaptions"], ["text:alt", "eye", "export.single.alt"], ["text:postingGuide", "book-open", "export.single.postingGuide"]
];

function isTouchDevice() {
  var viaUtil = guard("util.isTouch", function () { return CS.util.isTouch(); }, null);
  if (viaUtil !== null) return !!viaUtil;
  return !!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches);
}

/** Tiny renderer for the posting guide Markdown: "# title", intro text, "## n. card" sections and "- file" bullets. */
function renderGuide(md, aiCard) {
  var wrap = h("div", { class: "ui-guide-cards" });
  var cur = null, intro = [], title = "", files = h("ul", { class: "ui-guide-files" });
  md.split(/\r?\n/).forEach(function (line) {
    var m;
    if ((m = /^#\s+(.*)$/.exec(line))) title = m[1];
    else if ((m = /^##\s+(?:(\d+)\.\s*)?(.*)$/.exec(line))) {
      cur = h("article", { class: "ui-gcard" }, h("span", { class: "ui-gcard-n", dir: "ltr" }, m[1] || ""), h("div", { class: "ui-gcard-body" }, h("h3", { class: "ui-h3" }, m[2])));
      wrap.appendChild(cur);
    } else if ((m = /^[-*]\s+(.*)$/.exec(line))) {
      var isFile = /^`?[\w.\-\/]+\.(png|jpe?g|mp4|txt|md|pdf|json|html|zip)/i.test(m[1]);
      if (cur && !isFile) cur.lastChild.appendChild(h("p", { class: "ui-gcard-text", html: bidi(m[1]) }));
      else files.appendChild(h("li", {}, h("code", { dir: "ltr" }, m[1].replace(/`/g, ""))));
    } else if (line.trim()) {
      if (cur) cur.lastChild.appendChild(h("p", { class: "ui-gcard-text", html: bidi(line.trim()) })); else intro.push(line.trim());
    }
  });
  if (aiCard && wrap.lastChild) {
    /* the AI-label card is the last card of the guide text itself (posting-guide.json); it only gets its own look here */
    wrap.lastChild.classList.add("ui-gcard--ai");
    var num = wrap.lastChild.querySelector(".ui-gcard-n");
    if (num) { clear(num); num.appendChild(icon("sparkles")); }
  }
  return { title: title, intro: intro.join(" "), cards: wrap, files: files.children.length ? files : null };
}

function ExportScreen(ctx) {
  var el = h("section", { class: "ui-screen ui-screen--export", dataset: { csScreen: "export" }, "aria-labelledby": "ui-h-export" });
  var readyHost = h("div", {});
  var kitHost = h("div", {});
  var progressHost = h("div", {});
  var resultHost = h("div", {});
  var singlesHost = h("div", {});
  var guideHost = h("div", {});
  var noteHost = h("div", {});
  var stale = true;

  el.appendChild(h("header", { class: "ui-screen-head" }, h("h1", { class: "ui-h1", id: "ui-h-export" }, t("export.title")), h("p", { class: "ui-lede" }, t("export.lede"))));
  [noteHost, readyHost, kitHost, progressHost, resultHost, singlesHost, guideHost].forEach(function (x) { el.appendChild(x); });

  function verifyOk() {
    return !!ctx.spec.frozen && guard("freeze.verify", function () { return CS.core.freeze.verify(ctx.spec, ctx.tokens || CS.core.resolve.post(ctx.spec, ctx.brand)).ok; }, true);
  }

  function step(ok, title, text, action) {
    return h("li", { class: "ui-step" + (ok ? " is-ok" : "") },
      h("span", { class: "ui-step-mark", "aria-hidden": "true" }, ok ? icon("check") : null),
      h("div", { class: "ui-step-body" }, h("strong", {}, title), h("small", {}, text)), action || null);
  }

  function paintReady() {
    clear(readyHost);
    var sum = ctx.summary();
    var guided = ctx.spec.mode === "guided";
    var scriptOk = !guided || !!(ctx.spec.approvals && ctx.spec.approvals.script);
    var designOk = verifyOk();
    var qaOk = !ctx.blockers().length;
    var list = h("ol", { class: "ui-steps-list" },
      guided ? step(scriptOk, t("export.step.script"), scriptOk ? t("export.step.done") : t("export.step.script.todo"), scriptOk ? null : h("button", { type: "button", class: "ui-btn ui-btn--ghost ui-btn--sm", onclick: function () { ctx.go("script"); } }, t("export.step.go"))) : null,
      step(designOk, t("export.step.design"), designOk ? t("export.step.done") : t("export.step.design.todo"), designOk ? null : h("button", { type: "button", class: "ui-btn ui-btn--ghost ui-btn--sm", dataset: { csAction: "approve-design" }, onclick: function () { ctx.approve("design"); } }, t("design.approve"))),
      step(qaOk, t("export.step.qa"), qaOk ? (sum.counts.fix ? t("export.step.qa.fix", { n: sum.counts.fix }) : t("export.step.done")) : t("export.step.qa.todo", { n: ctx.blockers().length }),
        qaOk ? null : h("button", { type: "button", class: "ui-btn ui-btn--ghost ui-btn--sm", onclick: function () { ctx.go("check"); } }, t("export.step.go"))));
    readyHost.appendChild(h("div", { class: "ui-card" }, h("h2", { class: "ui-h2" }, t("export.ready")), list));
  }

  function paintKit() {
    clear(kitHost);
    var caps = ctx.exp.capsValue;
    var videoOk = !caps || (caps.videoEncoder !== false && caps.h264 !== false);
    var opts = ctx.exp.options;
    if (!videoOk) opts.video = false;
    var blockers = ctx.blockers();
    var hard = ctx.hardBlockers();
    var running = ctx.exp.running;
    var exportBtn;
    if (blockers.length && !hard.length) {
      exportBtn = h("button", { type: "button", class: "ui-btn ui-btn--danger ui-btn--lg", disabled: running, dataset: { csAction: "export-kit" }, onclick: exportAnyway }, icon("lock-open"), t("export.anyway"));
    } else {
      exportBtn = h("button", { type: "button", class: "ui-btn ui-btn--primary ui-btn--lg", disabled: running || blockers.length > 0, dataset: { csAction: "export-kit" }, onclick: function () { ctx.exportKit(); } }, icon("package-open"), t("export.kit.button"));
    }
    var files = [["export.kit.f.slides", true], ["export.kit.f.video", opts.video], ["export.kit.f.crop", opts.variants4x5], ["export.kit.f.pdf", opts.pdf], ["export.kit.f.text", true], ["export.kit.f.guide", true]].concat(opts.source ? [["export.kit.f.source", true]] : []);   // the source files are listed only when asked for
    kitHost.appendChild(h("div", { class: "ui-card ui-card--kit" },
      h("div", { class: "ui-kit-head" }, h("span", { class: "ui-kit-ico" }, icon("package-open")), h("div", {}, h("h2", { class: "ui-h2" }, t("export.kit.title")), h("p", { class: "ui-hint" }, t("export.kit.lede")))),
      h("ul", { class: "ui-kit-files" }, files.map(function (f) { return h("li", { class: f[1] ? "" : "is-off" }, icon(f[1] ? "check" : "x"), t(f[0])); })),
      h("div", { class: "ui-toggles" },
        switchBox(t("export.opt.video"), opts.video && videoOk, function (on) { opts.video = on; paintKit(); }, videoOk ? t("export.opt.video.hint") : t("export.opt.video.no")),
        switchBox(t("export.opt.crop"), opts.variants4x5, function (on) { opts.variants4x5 = on; paintKit(); }, t("export.opt.crop.hint")),
        switchBox(t("export.opt.pdf"), opts.pdf, function (on) { opts.pdf = on; paintKit(); }),
        switchBox(t("export.opt.source"), opts.source, function (on) { opts.source = on; paintKit(); }, t("export.opt.source.hint"))),
      blockers.length ? h("p", { class: "ui-note ui-note--" + (hard.length ? "bad" : "warn") }, icon("circle-alert"), h("span", { html: bidi(hard.length ? t("export.blocked.hard", { n: hard.length }) : t("export.blocked.soft", { n: blockers.length })) })) : null,
      exportBtn));
    if (isTouchDevice()) {
      kitHost.appendChild(h("div", { class: "ui-card ui-card--quiet" },
        h("div", { class: "ui-row ui-row--between" }, h("div", {}, h("strong", {}, t("export.photos.title")), h("p", { class: "ui-hint" }, t("export.photos.text"))),
          h("button", { type: "button", class: "ui-btn ui-btn--secondary", disabled: running, onclick: function () { ctx.exportFiles("photos"); } }, icon("download"), t("export.photos.button")))));
    }
  }

  async function exportAnyway() {
    var list = ctx.blockers();
    var reason = await askText({ title: t("export.anyway.title"), text: t("export.anyway.text", { n: list.length }), placeholder: t("check.override.ph"), confirm: t("export.anyway"), danger: true });
    if (reason === null) return;
    if (!reason) { toast(t("check.override.need-reason"), "warn"); return; }
    list.forEach(function (r) { ctx.override(r, reason); });
    await ctx.runQa();
    if (!ctx.blockers().length) ctx.exportKit(); else paintAll();
  }

  function paintProgress() {
    clear(progressHost);
    if (!ctx.exp.running) return;
    var pct = ctx.exp.total ? Math.round(100 * ctx.exp.done / ctx.exp.total) : null;
    progressHost.appendChild(h("div", { class: "ui-card ui-card--progress", role: "status" },
      h("div", { class: "ui-row ui-row--between" }, h("strong", {}, ctx.exp.label || t("export.working")), pct !== null ? h("span", { class: "ui-time", dir: "ltr" }, pct + "%") : null),
      h("div", { class: "ui-progress" + (pct === null ? " is-indeterminate" : "") }, h("span", { style: pct === null ? {} : { width: pct + "%" } })),
      h("button", { type: "button", class: "ui-btn ui-btn--ghost ui-btn--sm", onclick: function () { ctx.cancelExport(); } }, t("common.cancel"))));
  }

  function paintResult() {
    clear(resultHost);
    var last = ctx.exp.last;
    if (!last) return;
    var card = h("div", { class: "ui-card" }, h("h2", { class: "ui-h2" }, t("export.result")));
    var ul = h("ul", { class: "ui-result" });
    last.saved.forEach(function (n) { ul.appendChild(h("li", { class: "is-ok" }, icon("circle-check"), h("code", { dir: "ltr" }, n))); });
    last.declined.forEach(function (n) { ul.appendChild(h("li", { class: "is-mute" }, icon("circle-help"), h("code", { dir: "ltr" }, n), h("small", {}, t("export.result.declined")))); });
    last.failed.forEach(function (f) { ul.appendChild(h("li", { class: "is-bad" }, icon("circle-alert"), h("code", { dir: "ltr" }, f.name), h("small", {}, f.error))); });
    last.skipped.forEach(function (s) { ul.appendChild(h("li", { class: "is-warn" }, icon("triangle-alert"), h("code", { dir: "ltr" }, s.path), h("small", {}, s.reason))); });
    card.appendChild(ul);
    if (last.saved.length) card.appendChild(h("p", { class: "ui-hint" }, t("export.result.next")));
    resultHost.appendChild(card);
  }

  function paintSingles() {
    clear(singlesHost);
    var caps = ctx.exp.capsValue;
    var running = ctx.exp.running;
    var grid = h("div", { class: "ui-singles" });
    SINGLE_EXPORTS.forEach(function (s) {
      var noVideo = /^mp4/.test(s[0]) && caps && (caps.videoEncoder === false || caps.h264 === false);
      var cover = ctx.slides()[0];
      var off = noVideo || (/^mp4/.test(s[0]) && cover && ctx.spec.cover && ctx.spec.cover.motion && ctx.spec.cover.motion.recipe === "none");
      grid.appendChild(h("button", {
        type: "button", class: "ui-single", disabled: running || !!off, title: off ? t("export.single.off") : "", dataset: { kind: s[0] },
        onclick: function () { ctx.exportFiles(s[0]); }
      }, icon(s[1]), h("span", {}, t(s[2]))));
    });
    singlesHost.appendChild(h("div", { class: "ui-card" }, h("h2", { class: "ui-h2" }, t("export.singles")), h("p", { class: "ui-hint" }, t("export.singles.hint")), grid));
  }

  function paintGuide() {
    clear(guideHost);
    var md = ctx.postingGuideText();
    if (!md) return;
    var g = renderGuide(md, ctx.anyAi());
    guideHost.appendChild(h("div", { class: "ui-card" },
      h("div", { class: "ui-row ui-row--between" }, h("h2", { class: "ui-h2" }, g.title || t("export.guide")), h("button", { type: "button", class: "ui-btn ui-btn--ghost ui-btn--sm", onclick: function () { ctx.exportFiles("text:postingGuide"); } }, icon("download"), t("common.save"))),
      g.intro ? h("p", { class: "ui-hint", html: bidi(g.intro) }) : null, g.cards,
      g.files ? h("details", { class: "ui-details" }, h("summary", {}, t("export.guide.files")), g.files) : null));
  }

  function paintNote() {
    clear(noteHost);
    if (ctx.caps.downloads === false) noteHost.appendChild(h("p", { class: "ui-note ui-note--warn" }, icon("triangle-alert"), h("span", { html: bidi(t("export.no-downloads")) })));
  }

  function paintAll() { paintNote(); paintReady(); paintKit(); paintProgress(); paintResult(); paintSingles(); paintGuide(); stale = false; }

  ctx.bus.on("export", function () { if (el.hidden) return; paintProgress(); paintKit(); paintSingles(); paintResult(); });
  ctx.bus.on("qa", function () { if (!el.hidden) { paintReady(); paintKit(); } });
  ctx.bus.on("spec", function (d) { stale = true; if (!el.hidden && d.origin !== "export") { paintReady(); paintKit(); } });

  return {
    el: el,
    show: function () {
      paintAll();
      ctx.exportCaps();
      if (ctx.qa.stale || !ctx.qa.all) ctx.runQa();
    },
    hide: function () { stale = true; }
  };
}

  /* ---- file: screens/about.js ---- */
/* ui/screen-about.js · what this tool is, who made it, the licence and the privacy promise.
 * The credit block and the social links come only from the about.* strings, which are compiled out of credit-free builds
 * (the studio-source.html inside the kit), so nothing here can leak into an export. */

var SOCIALS = ["instagram", "tiktok", "youtube", "linkedin", "facebook", "store"];
var SOCIAL_ICON = { instagram: "image", tiktok: "film", youtube: "play", linkedin: "users", facebook: "message-circle", store: "globe" };

function AboutScreen(ctx) {
  var el = h("section", { class: "ui-screen ui-screen--about", dataset: { csScreen: "about" }, "aria-labelledby": "ui-h-about" });
  var built = false;

  function row(label, value) { return h("div", {}, h("dt", {}, label), h("dd", { dir: "ltr" }, value)); }

  function build() {
    clear(el);
    var cfg = ctx.config || {};
    el.appendChild(h("header", { class: "ui-screen-head" }, h("h1", { class: "ui-h1", id: "ui-h-about" }, t("legal.title")), h("p", { class: "ui-lede" }, t("legal.lede"))));

    var info = h("dl", { class: "ui-facts" }, row(t("legal.version"), CS.version || "cs-1.2.0"));
    if (cfg.buildId) info.appendChild(row(t("legal.build"), cfg.buildId));
    if (cfg.builtAt) info.appendChild(row(t("legal.built"), fmtDate(cfg.builtAt, uiLang())));
    var painter = window.__csPainter || null;
    if (painter) info.appendChild(row(t("legal.painter"), painter));
    el.appendChild(h("div", { class: "ui-card ui-about-hero" }, h("div", { class: "ui-about-mark" }, markSvg()), h("div", {}, h("h2", { class: "ui-h2" }, t("app.name")), h("p", { class: "ui-hint" }, t("legal.tagline"))), info));

    el.appendChild(h("div", { class: "ui-card" }, h("h2", { class: "ui-h2" }, t("legal.own.title")), h("p", { class: "ui-p", html: bidi(t("legal.own")) })));

    if (hasStr("about.credit")) {
      var links = h("ul", { class: "ui-socials" });
      SOCIALS.forEach(function (k) {
        if (!hasStr("about.social." + k) || !hasStr("about.url." + k)) return;
        links.appendChild(h("li", {}, h("a", { class: "ui-social", href: t("about.url." + k), target: "_blank", rel: "noopener noreferrer" },
          icon(SOCIAL_ICON[k] || "link"), h("span", { class: "ui-social-k" }, t("social." + k)), h("bdi", { dir: "ltr", class: "ui-social-v" }, t("about.social." + k)))));
      });
      el.appendChild(h("div", { class: "ui-card", dataset: { csCredit: "" } },
        h("p", { class: "ui-credit-line" }, t("about.credit")),
        hasStr("about.thanks") ? h("p", { class: "ui-p" }, t("about.thanks")) : null,
        links.children.length ? links : null));
    }

    el.appendChild(h("div", { class: "ui-card" }, h("h2", { class: "ui-h2" }, t("legal.privacy.title")), h("p", { class: "ui-p", html: bidi(t("legal.privacy")) })));
    el.appendChild(h("div", { class: "ui-card" }, h("h2", { class: "ui-h2" }, t("legal.license.title")),
      h("p", { class: "ui-p", html: bidi(t("legal.license")) }),
      h("ul", { class: "ui-bullets" }, ["legal.third.fonts", "legal.third.icons", "legal.third.mp4"].map(function (k) { return h("li", { html: bidi(t(k)) }); }))));

    el.appendChild(h("div", { class: "ui-card" }, h("h2", { class: "ui-h2" }, t("legal.keys.title")),
      h("dl", { class: "ui-facts ui-facts--keys" }, [
        ["Ctrl / ⌘ + S", t("legal.keys.save")], ["Ctrl / ⌘ + Z", t("legal.keys.undo")], ["Ctrl / ⌘ + Shift + Z", t("legal.keys.redo")], ["Esc", t("legal.keys.esc")]
      ].map(function (k) { return h("div", {}, h("dt", {}, k[1]), h("dd", { dir: "ltr" }, k[0])); }))));
    built = true;
  }

  return {
    el: el,
    show: function () { if (!built) build(); },
    hide: function () { },
    rebuild: function () { built = false; if (!el.hidden) build(); }
  };
}

  /* ---- file: index.js ---- */
/* brandbook/index.js · CS.ui.brandBook (CONTRACT 4.8). */

CS.ui.brandBook = { mount: mountBook };
CS.ui.mountBrandHome = mountBrandHome;
Object.assign(CS.ui._.screens, { preview: PreviewScreen, motion: MotionScreen, copy: CopyScreen, export: ExportScreen, about: AboutScreen });
})();
