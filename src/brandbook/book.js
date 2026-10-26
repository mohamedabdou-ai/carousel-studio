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
