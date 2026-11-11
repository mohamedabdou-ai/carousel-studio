"use strict";
/* Rendered-scope gates of cs-qa (D1-D7, T1, B1) against real layout in
 * headless Chrome. The scenario builds slide DOM in the vocabulary of
 * CONTRACT 5.1, runs CS.qa.runRendered and reports rule ids per case.
 * The suite is skipped when no Chrome/Edge is installed (set CHROME to point
 * at one). */

const test = require("node:test");
const assert = require("node:assert/strict");
const { runScenario, findChrome } = require("./rendered/run-browser.cjs");

const chrome = findChrome();
let out = null;
const rules = (name) => (out[name] || []).map((x) => x.split("@")[0]);
const has = (name, rule, el) => (out[name] || []).some((x) => (el ? x === rule + "@" + el : x.split("@")[0] === rule));
const sev = (name, rule) => ((out[name + ":sev"] || []).find((x) => x.startsWith(rule + "=")) || "").split("=")[1];
const opts = { skip: chrome ? false : "no Chrome or Edge found (set CHROME)" };

test("D9 treats sparse score bars and icon cells as advice while empty panels need fixing", opts, () => {
  if (!out) out = runScenario();
  assert.ok(has('deliberate-panels', 'D9.container-fill'));
  assert.ok(out['deliberate-panels:sev'].every(f => f.endsWith('=NOTE')));
  assert.equal(sev('empty-panels', 'D9.container-fill'), 'FIX');
});

test("painted padding, sibling gaps, clipping, orphans and cover sub-lines", opts, () => {
  if (!out) out = runScenario();
  assert.ok(has("packed-bars", "D2.text-padding"));
  assert.ok(has("packed-bars", "D2.block-gap"));
  assert.equal(has("airy-bars", "D2.text-padding"), false);
  assert.equal(has("airy-bars", "D2.block-gap"), false);
  assert.equal(has("framed-cells", "D2.block-gap"), false, "cells in a shared frame need internal padding, not gaps");
  assert.equal(has("compact-badge", "D2.text-padding"), false, "an inline text badge is not a body panel");
  assert.equal(has("ink-padding", "D2.text-padding"), false, "painted glyphs, not the font em-box, own the inset");
  assert.ok(has("clipped-icon", "D2.clipped-paint"));
  assert.ok(has("clipped-text-ink", "D2.clipped-paint"), "the painted descenders clip even when the line box fits");
  assert.equal(has("transparent-clip", "D2.clipped-paint"), false);
  assert.equal(sev("clipped-icon", "D2.clipped-paint"), "BLOCK");
  assert.equal(sev("clipped-shape", "D2.clipped-paint"), "FIX", "a drawn shape cut by its frame may be a deliberate bleed");
  assert.equal(has("unclipped-icon", "D2.clipped-paint"), false);
  assert.ok(has("orphan-connector", "D6.orphan-connector"));
  assert.equal(has("joined-connector", "D6.orphan-connector"), false);
  assert.equal(rules("direction-controls").some(r => /^D2\./.test(r)), false);
  assert.equal(rules("connector-tatweel").some(r => /^D5\.kashida-/.test(r)), false);
  assert.ok(has("cover-sub-contrast", "D4.hard", "s01.sub"));
  assert.equal(out['empty-panel-count'], 4);
  assert.ok(has('empty-panels', 'D9.container-fill'));
  assert.equal(sev('empty-panels', 'D9.container-fill'), 'FIX');
  assert.deepEqual(out['good-panels'], []);
  for (const [key, value] of Object.entries(out)) if (key.startsWith('visible-copy-')) assert.deepEqual(value, [], key);
});

test("scenario runs in the browser", opts, () => {
  out = out || runScenario();
  assert.ok(out && out.clean, "scenario output");
});

test("a well-built deck passes every rendered gate", opts, () => {
  const bad = (out["clean:sev"] || []).filter((x) => /^(D1|D2|D3|D4|D5|D9|B1|T1)\./.test(x) || x.endsWith("=BLOCK"));
  assert.deepEqual(bad, []);
});

test("D2: overflow, content box, keep-outs, chrome bands and chrome drift", opts, () => {
  ["D2.overflow", "D2.outside-content", "D2.keep-out"].forEach((r) => assert.ok(has("overflow", r), r));
  assert.ok(has("keepout", "D2.keep-out", "s01.note"));
  assert.ok(has("keepout", "D2.outside-content", "s01.note"));
  assert.ok(has("band", "D2.chrome-band", "s01.handle"));
  assert.ok(has("drift", "D2.chrome-drift"), "handle moved 9 px on slide 2");
  assert.equal(has("drift-ok", "D2.chrome-drift"), false, "a wider counter text is not drift");
  assert.equal(sev("overflow", "D2.overflow"), "BLOCK");
  assert.ok(has("slot-overflow", "D2.overflow", "s01.body"), "text running out of a fixed-height slot");
  assert.equal(rules("tight-line-height").some((r) => r.startsWith("D2")), false, "a font content area taller than the line box is trimmed to the line box");
});

test("D1/D3: slide size and type floors", opts, () => {
  assert.deepEqual(rules("render-size").filter((r) => r.startsWith("D2")), [], "a mis-sized slide does not cascade into geometry noise");
  assert.ok(has("render-size", "D1.render-size", "s01"));
  assert.ok(has("sizes", "D3.body-floor", "s01.body"));
  assert.ok(has("sizes", "D3.hero-floor", "s01.headline"));
  ["handle", "meta", "counter", "savepill", "swipe"].forEach((k) => assert.ok(has("sizes", "D3.meta-floor", "s01." + k), k));
  assert.deepEqual(out["only-d3"].map((x) => x.split("@")[0]), ["D3.body-floor", "D3.hero-floor"], "opts.gates limits the run");
});

test("D2 preserves off-mode footer geometry and checks art-mode seating", opts, () => {
  for (const name of ["footer-off", "footer-art"]) {
    assert.deepEqual(rules(name).filter((r) => /^D2\.(chrome-band|chrome-drift|outside-content)$/.test(r)), [], name);
  }
  assert.ok(has("footer-art-misplaced", "D2.chrome-band", "s02.counter"));
  assert.equal(sev("footer-art-misplaced", "D2.chrome-band"), "BLOCK");
  assert.ok(has("footer-art-misplaced", "D2.chrome-drift"));
  for (const name of ["footer-off", "footer-art", "footer-art-misplaced"]) assert.equal(out[name + "-deterministic"], true);
  assert.ok(has("chrome-outside", "D2.outside-content", "s01.handle"));
  assert.equal(out["chrome-outside-deterministic"], true);
});

test("D2 checks the decorative rail's own bounds and drift", opts, () => {
  assert.equal(has("rail-clean", "D2.chrome-band", "s01.rail"), false);
  assert.equal(has("rail-clean", "D2.chrome-drift"), false);
  assert.ok(has("rail-band", "D2.chrome-band", "s01.rail"));
  assert.ok(has("rail-drift", "D2.chrome-drift"));
  assert.equal(has("rail-hidden", "D2.chrome-band", "s01.rail"), false);
  assert.equal(out["rail-deterministic"], true);
});

test("rendered extension gates run, retain prospect and report deterministic execution counts", opts, () => {
  assert.ok(has("rendered-hook", "VA2.anchor", "s01"));
  assert.equal(has("rendered-hook-filtered", "VA2.anchor"), false);
  assert.deepEqual(out["rendered-stats"], [3, 1, true, 1]);
  assert.deepEqual(out["rendered-prospect"], [true, true, true]);
});

test("D4 reads computed sRGB and color-mix and keeps indexed art keys", opts, () => {
  assert.ok(has("contrast-srgb", "D4.hard", "s01.body"));
  assert.ok(has("contrast-mix", "D4.hard", "s01.body"));
  assert.ok(has("contrast-gradient-mix", "D4.hard", "s01.body"));
  assert.equal(out["contrast-gradient-mix-deterministic"], true);
  assert.ok(has("art-key", "D4.hard", "s01.art.2"));
});

test("D4: worst-decile contrast, large-text threshold and the pixel path", opts, () => {
  assert.equal(sev("contrast", "D4.contrast"), "FIX");
  assert.ok(has("contrast", "D4.contrast", "s01.body"));
  assert.equal(has("contrast", "D4.contrast", "s01.headline"), false, "large text only needs 3:1");
  assert.equal(sev("contrast-hard", "D4.hard"), "BLOCK");
  assert.ok(has("contrast-hard", "D4.hard", "s01.headline"));
  assert.equal(rules("contrast-pill").some((r) => r.startsWith("D4")), false, "white on the accent pill passes");
  assert.ok(has("contrast-gradient", "D4.hard", "s01.body"), "dark ink against the dark stop of a gradient background");
  assert.ok(has("contrast-photo", "D4.unmeasured", "s01.body"), "a photo background cannot be judged without CS.paint.textMask");
  assert.ok(has("contrast-pixel", "D4.hard", "s01.headline"), "CS.paint.textMask pixels decide when available");
  assert.deepEqual(out.measure, [true, true, true]);
});

test("D5: letter-spacing, slant, justification, opacity, kashida, tashkeel and fallback fonts", opts, () => {
  ["D5.letter-spacing", "D5.italic", "D5.text-opacity"].forEach((r) => assert.ok(has("arabic-basic", r), r));
  assert.ok(has("arabic-justify", "D5.justify"));
  assert.ok(has("arabic-rgba", "D5.text-opacity"));
  assert.equal(has("arabic-group-opacity", "D5.text-opacity"), false, "data-m-group=opacity wrappers are allowed");
  ["D5.kashida-count", "D5.kashida-body", "D5.kashida-preset", "D5.kashida-joining"].forEach((r) => assert.ok(has("kashida", r), r));
  assert.deepEqual(rules("kashida-ok").filter((r) => r.startsWith("D5")), [], "one kashida headline word where the preset allows it");
  assert.deepEqual(rules("kashida-latin-join").filter((r) => r.startsWith("D5.kashida")), [], "«الـAgent» and «بـClaude» are the documented connector, even where the preset bans kashida");
  assert.ok(has("tashkeel", "D5.tashkeel", "s01.body"));
  assert.equal(sev("tashkeel", "D5.tashkeel"), "FIX");
  assert.ok(has("fallback", "D5.fallback-font", "s01.body"));
  if (out.__faceLoaded) assert.equal(has("fallback-loaded", "D5.fallback-font"), false, "a loaded @font-face is not a fallback");
  assert.equal(has("fallback-unknown", "D5.fallback-font"), false, "a family the engine did not resolve is not judged");
});

test("D6: lone word, rows, headline width, families and Latin matching", opts, () => {
  assert.ok(has("lone-word", "D6.lone-word", "s01.body"));
  assert.ok(has("rows", "D6.rows"));
  assert.ok(has("headline-width", "D6.headline-width", "s01.headline"));
  assert.ok(has("families", "D6.families"));
  assert.ok(has("latin-match", "D6.latin-match", "s01.body"));
  assert.equal(sev("lone-word", "D6.lone-word"), "FIX");
});

test("D6.lines: per-type line limits from 00-decisions", opts, () => {
  assert.deepEqual(out.lines.filter((x) => x.startsWith("D6.lines")).sort(), ["D6.lines@s01", "D6.lines@s02", "D6.lines@s03"]);
  assert.equal(out["lines-ok"].some((x) => x.startsWith("D6.lines")), false, "3 cover lines and 6 body lines are within the limits");
});

test("B1: a Latin run split over lines and Latin text outside an isolate", opts, () => {
  assert.equal(has("isolation", "B1.isolation", "s01.body"), false, "a Latin phrase may wrap within its isolate");
  assert.ok(has("raw-ltr", "B1.raw-ltr", "s01.body"));
  assert.equal(sev("atomic-isolation", "B1.isolation"), "BLOCK");
  assert.equal(sev("broken-version", "B1.unbound-pair"), "FIX");
});

test("T1: the cover hero at 130 px wide", opts, () => {
  assert.ok(has("thumbnail", "T1.hero-small", "s01.headline"));
  assert.deepEqual(out["thumbnail-api"], [12.04, false, true, true]);
  assert.deepEqual(out["thumbnail-big"], [18.06, true, false]);
  assert.ok(has("thumbnail-contrast", "T1.local-contrast", "s01.headline"));
  assert.equal(has("thumbnail-contrast", "T1.hero-small"), false);
});

test("D9.dead-zone is retired from cs-qa; cs-qa-visual owns its replacement", opts, () => {
  assert.equal(has("dead-zone", "D9.dead-zone"), false);
  assert.equal(has("dead-zone-filled", "D9.dead-zone"), false, "three hero lines fill the sheet");
  assert.equal(has("dead-zone-item", "D9.dead-zone"), false, "only covers and posters are judged");
  assert.equal(has("dead-zone-plate", "D9.dead-zone"), false, "a plate behind the text fills the sheet by design");
});

test("D7: default look is a NOTE and respects the brand's own font choice", opts, () => {
  assert.ok(has("default-look", "D7.no-brand"));
  assert.equal(rules("default-look").filter((r) => r === "D7.default-fonts").length, 2);
  assert.equal(sev("default-look", "D7.no-brand"), "NOTE");
  assert.deepEqual(out["default-look-brand"], [], "a brand-chosen Cairo is not a default look");
  assert.ok(has("overflow", "D7.default-layout"), "one untouched slide is 100% default layout");
});
