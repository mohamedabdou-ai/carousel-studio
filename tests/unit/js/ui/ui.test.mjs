// Unit tests for the pure parts of cs-ui.js and cs-brandbook.js. Run: node --test tests/unit/js/ui/*.test.mjs
// The chunks are evaluated in a vm context with the smallest possible DOM, so no browser or package is needed.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const { load: loadQa, cleanSpec } = createRequire(import.meta.url)("../qa/support/env.cjs");
const qa = loadQa().CS.qa;

const here = path.dirname(fileURLToPath(import.meta.url));
const skill = path.resolve(here, "../../../../plugins/carousel-studio/skills/carousel-design");
const root = path.resolve(here, "../../../..");
const scratch = path.join(os.tmpdir(), "cs-r3", "U1");
fs.mkdirSync(scratch, { recursive: true });
const built = fs.mkdtempSync(path.join(scratch, "unit-"));
const build = (out) => {
  const result = spawnSync(process.execPath, ["tools/build.mjs", "--module", "ui", "--module", "brandbook", "--out", out], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
};
build(built);
const chunkText = (name) => fs.readFileSync(path.join(built, name), "utf8");

class Element {
  constructor(tag) { this.tagName = tag; this.nodeType = 1; this.children = []; this.style = {}; this.dataset = {}; this.attrs = {}; }
  appendChild(node) { this.children.push(node); return node; }
  removeChild(node) { this.children.splice(this.children.indexOf(node), 1); }
  get firstChild() { return this.children[0] || null; }
  setAttribute(key, value) { this.attrs[key] = value; }
  addEventListener(type, fn) { (this.listeners ||= {})[type] = fn; }
  insertBefore(node, before) { this.children.splice(this.children.indexOf(before), 0, node); }
}
const strings = JSON.parse(fs.readFileSync(path.join(skill, "runtime", "ui-strings.json"), "utf8"));

/** A context with just enough of a browser for the chunk to load and for the pure helpers to run. */
function loadChunks(extra = {}) {
  const attrs = {};
  const blocks = { "cs-ui-strings": { textContent: JSON.stringify(strings) }, ...extra.blocks };
  const sandbox = {
    console: extra.console || console,
    TextDecoder, AbortController,
    setTimeout, clearTimeout,
    navigator: {},
    requestAnimationFrame: (fn) => setTimeout(fn, 0),
    document: {
      documentElement: { setAttribute: (k, v) => { attrs[k] = v; }, getAttribute: (k) => attrs[k] ?? null },
      getElementById: (id) => blocks[id] ?? null,
      createElement: (tag) => new Element(tag),
      createElementNS: (ns, tag) => new Element(tag),
      createTextNode: (t) => ({ nodeType: 3, nodeValue: t }),
      addEventListener() {},
      head: { querySelectorAll: () => [] },
    },
    CS: {
      qa,
      emit() {},
      CSError: class extends Error { constructor(code, msg) { super(msg); this.code = code; } },
      core: {
        text: {
          wordCount: (s) => String(s || "").replace(/==/g, "").split(/\s+/).filter(Boolean).length,
          digits: { convert: (s, to) => (to === "arabic-indic" ? s.replace(/[0-9]/g, (d) => String.fromCharCode(0x660 + +d)) : s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660))) },
        },
      },
    },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  let ui = chunkText("cs-ui.js");
  if (extra.internals) ui = ui.replace(/\}\)\(\);\s*$/, "CS.ui.__test = { slideEditors, SlideTab, VisualTab, CheckScreen, ensureExport, lateScreen, createCtx };\n})();");
  if (extra.toasts) { sandbox.__toasts = extra.toasts; ui = ui.replace(/\}\)\(\);\s*$/, "toast = function (message) { window.__toasts.push(message); };\n})();"); }
  vm.runInContext(ui, sandbox, { filename: "cs-ui.js" });
  if (!extra.coreOnly) vm.runInContext(chunkText("cs-brandbook.js"), sandbox, { filename: "cs-brandbook.js" });
  return sandbox;
}

const win = loadChunks();
const U = win.CS.ui._;
const P = win.CS.ui._pure;
const plain = (v) => JSON.parse(JSON.stringify(v)); // vm objects have another prototype; compare as plain data

test("Studio add, duplicate and split refuse the eleventh slide with a localized message", () => {
  for (const dialect of ["msa-white", "en"]) {
    const messages = [], w = loadChunks({ internals: true, toasts: messages, coreOnly: true });
    vm.runInContext(fs.readFileSync(path.join(root, "src/core/spec.js"), "utf8"), w);
    w.CS.ui._pure.loadUiStrings();
    w.CS.ui.setUiDialect(dialect);
    const spec = { locale: { dialect }, slides: Array.from({ length: 10 }, (_, i) => ({ id: "s" + String(i + 1).padStart(2, "0"), n: i + 1, type: "item", body: "one two three four" })) };
    const ctx = w.CS.ui.__test.createCtx(new Element("div"), { spec }, {});
    assert.equal(ctx.insertSlide("item", 10), null);
    assert.equal(ctx.duplicateSlide("s01"), null);
    assert.equal(ctx.splitSlide("s01"), false);
    assert.equal(ctx.slides().length, 10);
    assert.equal(ctx.past.length, 0);
    assert.equal(messages.length, 3);
    for (const m of messages) { assert.match(m, /10/); assert.match(m, dialect === "en" ? /cover/i : /الغلاف/); }
  }
});

test("Design split at ten slides shows only the limit toast", () => {
  const messages = [], w = loadChunks({ internals: true, toasts: messages, coreOnly: true });
  vm.runInContext(fs.readFileSync(path.join(root, "src/core/spec.js"), "utf8"), w);
  w.CS.ui._pure.loadUiStrings();
  w.CS.ui.setUiDialect("en");
  const spec = { locale: { dialect: "en" }, slides: Array.from({ length: 10 }, (_, i) => ({ id: "s" + String(i + 1).padStart(2, "0"), n: i + 1, type: "item", body: "one two three four" })) };
  const c = w.CS.ui.__test.createCtx(new Element("div"), { spec }, {});
  c.preset = () => null;
  const tab = w.CS.ui.__test.SlideTab(c);
  const nodes = (n) => [n, ...(n.children || []).flatMap(nodes)];
  const split = nodes(tab.el).find((n) => n.tagName === "button" && n.children.some((s) => s.nodeValue === w.CS.ui.t("slide.split")));
  assert.ok(split);
  split.listeners.click();
  assert.equal(messages.length, 1, messages.join(" | "));
  assert.match(messages[0], /10/);
  assert.equal(c.slides().length, 10);
});

test("both chunks load and publish the contract surface", () => {
  const ui = win.CS.ui;
  for (const name of ["mountStudio", "mountBrandHome", "t", "setUiDialect", "capabilities", "serializeSource", "serializeForPublish", "toast"]) {
    assert.equal(typeof ui[name], "function", name);
  }
  assert.equal(typeof ui.brandBook.mount, "function");
  assert.deepEqual(plain(ui.CAPABILITY_NAMES), { downloads: "downloads", assets: "assets", sample: "sample", user: "user", publish: "artifact" });
  assert.deepEqual(Object.keys(ui._.screens).sort(), ["about", "copy", "export", "motion", "preview"]);
});

test("t() follows the dialect chain and never returns blank", () => {
  P.loadUiStrings();
  win.CS.ui.setUiDialect("gulf");
  assert.equal(win.CS.ui.t("nav.design"), "التصميم");
  win.CS.ui.setUiDialect("en");
  assert.equal(win.CS.ui.t("nav.design"), "Design");
  assert.equal(win.CS.ui.t("top.qa.fix", { n: 3 }), "To review: 3");
  assert.equal(win.CS.ui.t("no.such.key"), "no.such.key");
  win.CS.ui.setUiDialect("klingon"); // unknown dialects fall back to white Arabic
  assert.equal(win.CS.ui.t("nav.design"), strings.strings["nav.design"]["msa-white"]);
  win.CS.ui.setUiDialect("eg");
});

test("setUiDialect sets lang and dir on the root", () => {
  win.CS.ui.setUiDialect("en");
  assert.equal(win.document.documentElement.getAttribute("dir"), "ltr");
  win.CS.ui.setUiDialect("levant");
  assert.equal(win.document.documentElement.getAttribute("dir"), "rtl");
  assert.equal(win.document.documentElement.getAttribute("lang"), "ar");
});

test("bidi() escapes text and isolates LTR runs without eating punctuation", () => {
  assert.equal(U.bidi("حمّل ملف MP4."), 'حمّل ملف <bdi dir="ltr">MP4</bdi>.');
  assert.equal(U.bidi("ChatGPT Plus و Claude"), '<bdi dir="ltr">ChatGPT Plus</bdi> و <bdi dir="ltr">Claude</bdi>');
  assert.equal(U.bidi("a < b & c"), '<bdi dir="ltr">a</bdi> &lt; <bdi dir="ltr">b</bdi> &amp; <bdi dir="ltr">c</bdi>');
  assert.equal(U.bidi("3 من 8"), '<bdi dir="ltr">3</bdi> من <bdi dir="ltr">8</bdi>');
  assert.equal(U.bidi("<img src=x onerror=1>"), '&lt;<bdi dir="ltr">img src</bdi>=<bdi dir="ltr">x onerror</bdi>=<bdi dir="ltr">1</bdi>&gt;');
  assert.equal(U.bidi(null), "");
  assert.equal(U.esc('"q"'), "&quot;q&quot;");
});

test("setPath is immutable and shares untouched branches", () => {
  const doc = { slides: [{ id: "s01", t: "a" }, { id: "s02", t: "b" }], style: { x: 1 } };
  const next = U.setPath(doc, ["slides", 1, "t"], "B");
  assert.equal(doc.slides[1].t, "b");
  assert.equal(next.slides[1].t, "B");
  assert.equal(next.slides[0], doc.slides[0]);
  assert.equal(next.style, doc.style);
  const gone = U.setPath(doc, ["style", "x"], undefined);
  assert.deepEqual(plain(gone.style), {});
  assert.deepEqual(plain(U.setPath({}, ["a", "b"], 1)), { a: { b: 1 } });
});

test("jsonForScript is safe inside a script element", () => {
  const text = U.jsonForScript({ a: "x</script><!-- y z" });
  assert.ok(!text.includes("</"));
  assert.ok(!text.includes("<!--"));
  assert.ok(!text.includes(" "));
  assert.deepEqual(JSON.parse(text), { a: "x</script><!-- y z" });
  assert.match(P.jsonBlock("cs-spec", { a: 1 }), /^<script type="application\/json" id="cs-spec">\{"a":1\}<\/script>$/);
});

test("htmlComment never contains a closing sequence inside its text", () => {
  assert.equal(P.htmlComment("a b"), "<!-- a b -->");
});

/* ---- reading edited slides back into stored markup ------------------------------------------------------------------------ */
const node = (tag, classes, ...kids) => ({ nodeType: 1, tagName: tag.toUpperCase(), classList: { contains: (c) => classes.includes(c) }, childNodes: kids });
const text = (s) => ({ nodeType: 3, nodeValue: s });

test("readSlotText restores ==emphasis==, forced breaks and drops engine characters", () => {
  const el = node("h1", [],
    node("span", ["cs-ln"], node("span", ["w"], text("6")), text(" "), node("span", ["w"], text("أدوات"))),
    node("br", []),
    node("span", ["cs-ln"], node("span", ["w"], text("بتغنيك عن")), text(" "),
      node("mark", ["cs-em"], node("span", ["w", "cs-kashida"], text("المصــمم")))));
  assert.equal(U.readSlotText(el), "6 أدوات\nبتغنيك عن ==المصمم==");
});

test("readSlotText treats typed blocks as line breaks and strips direction marks", () => {
  const root = node("p", [], text("سطر‏ أول"), node("div", [], text("سطر ثانٍ")));
  assert.equal(U.readSlotText(root), "سطر أول\nسطر ثانٍ");
});

/* ---- limits and totals ------------------------------------------------------------------------------------------------------ */
const plugin = {
  cover: { heroMaxWords: 6, totalMaxWords: 12 }, slide2: { maxWords: 12 },
  text: { titleMaxWords: 6, bodyMaxWords: 25, bodyHardMaxWords: 35, bridgeMaxWords: 8, shareMaxWords: 12, denseTypes: ["checklist", "summary"], denseMaxWords: 45, slideMaxWords: 50, ctaMaxWords: 12 },
};
const ctx = { plugin, words: (s) => win.CS.core.text.wordCount(s) };

test("fieldLimit picks the platform limit that applies to the field", () => {
  assert.deepEqual(plain(P.fieldLimit(ctx, { type: "cover", n: 1 }, "headline")), { soft: 6 });
  assert.deepEqual(plain(P.fieldLimit(ctx, { type: "rehook", n: 2 }, "headline")), { soft: 12 });
  assert.equal(P.fieldLimit(ctx, { type: "item", n: 3 }, "headline"), null);
  assert.deepEqual(plain(P.fieldLimit(ctx, { type: "item", n: 3 }, "body")), { soft: 25, hard: 35 });
  assert.deepEqual(plain(P.fieldLimit(ctx, { type: "item", n: 3 }, "title")), { soft: 6 });
  assert.equal(P.fieldLimit({ plugin: null }, { type: "item" }, "body"), null);
});

test("slideTotals counts every text of a slide against the right whole-slide limit", () => {
  const cover = P.slideTotals(ctx, { type: "cover", n: 1, kicker: "للمبتدئين", headline: "6 أدوات ==ببلاش==", sub: "من غير مصمم" });
  assert.deepEqual(plain(cover), { words: 7, limit: 12 });
  const dense = P.slideTotals(ctx, { type: "summary", n: 7, title: "الخلاصة", bullets: ["أ ب", "ج"] });
  assert.deepEqual(plain(dense), { words: 4, limit: 45 });
  assert.equal(P.slideTotals(ctx, { type: "item", n: 3, title: "x" }).limit, 50);
});

/* ---- QA bookkeeping ------------------------------------------------------------------------------------------------------------ */
test("summarizeFindings ignores overridden items and ranks the status", () => {
  const sum = (list) => plain(P.summarizeFindings(list));
  assert.deepEqual(sum([]), { status: "pass", counts: { block: 0, fix: 0, note: 0 }, exitCode: 0 });
  assert.equal(sum([{ sev: "NOTE" }]).status, "pass");
  assert.equal(sum([{ sev: "FIX" }, { sev: "NOTE" }]).status, "fix");
  assert.equal(sum([{ sev: "BLOCK" }, { sev: "FIX" }]).exitCode, 2);
  assert.equal(sum([{ sev: "BLOCK", overridden: { reason: "x", at: "t" } }]).status, "pass");
});

test("carryOverrides keeps an override on the same rule and slide through a re-run", () => {
  const prev = [{ rule: "C1.hero-words", slide: "s01", sev: "BLOCK", overridden: { reason: "r", at: "t" } }];
  const fresh = [{ rule: "C1.hero-words", slide: "s01", el: "s01.headline", sev: "BLOCK" }, { rule: "C1.hero-words", slide: "s02", sev: "BLOCK" }];
  const out = plain(P.carryOverrides(prev, fresh));
  assert.equal(out[0].overridden.reason, "r");
  assert.equal(out[1].overridden, undefined);
  const sib = plain(P.carryOverrides(prev, [{ rule: "C1.total-words", slide: "s01", sev: "BLOCK" }, { rule: "C1.gap-answered", slide: "s01", sev: "BLOCK" }]));
  assert.equal(sib[0].overridden.reason, "r", "a hero-words override also covers total-words on the same slide");
  assert.equal(sib[1].overridden, undefined, "but not an unrelated cover rule");
});

test("lengthSiblings: one override of the cover's length covers its open siblings on that slide", () => {
  const hero = { rule: "C1.hero-words", slide: "s01", sev: "BLOCK" };
  const total = { rule: "C1.total-words", slide: "s01", sev: "BLOCK" };
  const lines = { rule: "C1.lines", slide: "s01", sev: "FIX", overridden: { reason: "r", at: "t" } };
  const other = { rule: "C1.total-words", slide: "s09", sev: "BLOCK" };
  const gap = { rule: "C1.gap-answered", slide: "s01", sev: "BLOCK" };
  assert.deepEqual(plain(P.lengthSiblings([hero, total, lines, other, gap], hero)).map((r) => r.rule + "@" + r.slide), ["C1.total-words@s01"]);
  assert.deepEqual(plain(P.lengthSiblings([hero, total], gap)), []);
});

test("placeCover: the same first beat as C1 becomes the headline even below six total words", () => {
  const wc = (x) => x.trim().split(/\s+/).filter(Boolean).length;
  const NL = String.fromCharCode(10);
  const twoBeats = "وكلاء AI اتواصلوا…" + NL + "من غير إنترنت!";
  assert.deepEqual(plain(P.placeCover(twoBeats, 6, wc)), { headline: "وكلاء AI اتواصلوا", sub: "من غير إنترنت!" });
  assert.deepEqual(plain(P.placeCover("5 تطبيقات ببلاش… بتخليك تتحكم في مصاريفك", 6, wc)), { headline: "5 تطبيقات ببلاش", sub: "بتخليك تتحكم في مصاريفك" });
  const question = "إزاي وكلاء AI" + NL + "اتواصلوا من غير شبكة؟";
  assert.deepEqual(plain(P.placeCover(question, 6, wc)), { headline: "إزاي وكلاء AI", sub: "اتواصلوا من غير شبكة؟" });
  for (const mark of ["؟", "?", "!", ":", "\n"]) {
    const head = "كيف تبدأ مشروعك اليوم";
    const suffix = /[؟?!]/.test(mark) ? mark : "";
    assert.deepEqual(plain(P.placeCover(head + mark + " بخطوات واضحة من البداية", 6, wc)), { headline: head + suffix, sub: "بخطوات واضحة من البداية" });
  }
  const long = "one two three four five six seven? next beat";
  assert.deepEqual(plain(P.placeCover(long, 6, wc)), { headline: long });
});

test("cover headline meter measures the C1 hero while total words keep both beats", () => {
  const w = loadChunks({ internals: true, coreOnly: true });
  const slide = { id: "s01", type: "cover", n: 1, headline: "كيف تبدأ مشروعك اليوم؟ بخطوات واضحة من البداية" };
  const c = { plugin, words: ctx.words, isEn: () => false, slide: () => slide };
  const fields = w.CS.ui.__test.slideEditors(c, slide);
  const nodes = (n) => [n, ...(n.children || []).flatMap(nodes)];
  const field = fields.find((f) => nodes(f).some((n) => n.dataset?.field === "headline"));
  const count = () => nodes(field).find((n) => n.className === "ui-meter-n").children[0].nodeValue;
  assert.equal(count(), "4");
  assert.equal(P.slideTotals(c, slide).words, 8);
  const ta = nodes(field).find((n) => n.tagName === "textarea");
  ta.value = "كيف تبدأ؟ خطوة واضحة";
  ta.listeners.input();
  assert.equal(count(), "2");
  ta.value = "==كيف تبدأ؟ بخطوة واضحة== قبل نهاية اليوم";
  ta.listeners.input();
  assert.equal(count(), "7", "C1 does not split inside an emphasis span");
});

test("renumber shares ordinals across item and step layouts so C6 counts every member", () => {
  const w = loadChunks({ coreOnly: true });
  vm.runInContext(fs.readFileSync(path.join(root, "src/core/spec.js"), "utf8"), w);
  const spec = cleanSpec();
  spec.slides.filter((s) => s.type === "item").forEach((s, i) => { if (i >= 3) s.type = "step"; });
  const next = w.CS.core.spec.renumber(spec);
  assert.deepEqual(plain(next.slides.filter((s) => ["item", "step"].includes(s.type)).map((s) => s.ord)), [1, 2, 3, 4, 5]);
  assert.equal(qa.runText({ spec: next, gates: ["C6"] }).filter((r) => r.rule === "C6.list-count").length, 0);
  assert.equal(w.CS.core.spec.renumber(next), next, "stable on the second pass");
  assert.deepEqual(spec.slides.filter((s) => s.type === "step").map((s) => s.ord), [4, 5], "input untouched");
});

const registryFamilies = JSON.parse(fs.readFileSync(path.join(skill, "fonts", "registry.json"), "utf8")).families;
const presetOwn = (id) => {
  const type = JSON.parse(fs.readFileSync(path.join(skill, "styles", id, "preset.json"), "utf8")).type;
  return { display: type.display.family, body: type.body.family, latin: type.latin.family };
};

test("fontPairings: the preset's own pairing leads, three distinct display faces, no stock face on the Style tab", () => {
  for (const id of ["swiss", "creator", "notebook", "poster", "interface", "heritage"]) {
    const out = plain(P.fontPairings(registryFamilies, presetOwn(id), id, false));
    assert.ok(out.length >= 2 && out.length <= 3, id + ": two or three pairings");
    assert.deepEqual(out[0], presetOwn(id), id + ": its own pairing first");
    assert.equal(new Set(out.map((p) => p.display)).size, out.length, id + ": one pairing per display face");
    for (const p of out) {
      assert.ok(registryFamilies.find((f) => f.id === p.display).scripts.includes("arabic"), "display covers Arabic");
      assert.ok(registryFamilies.find((f) => f.id === p.body).roles.includes("body"), "body face has the body role");
      assert.ok(registryFamilies.find((f) => f.id === p.latin).scripts.includes("latin"), "Latin face has Latin glyphs");
    }
    assert.ok(out.slice(1).every((p) => !registryFamilies.find((f) => f.id === p.display).defaultLook), id + ": stock faces stay out");
  }
});

test("fontPairings: the Brand Book may offer the stock faces, and a page with no pair to offer gets none", () => {
  const out = plain(P.fontPairings(registryFamilies, presetOwn("swiss"), "swiss", true));
  assert.equal(out.length, 3);
  assert.deepEqual(plain(P.fontPairings([], presetOwn("swiss"), "swiss", true)), []);
  const only = registryFamilies.filter((f) => f.id === "ibm-plex-sans-arabic");
  assert.deepEqual(plain(P.fontPairings(only, presetOwn("swiss"), "swiss", false)), [], "no body or Latin face to pair with");
});

test("sortFindings orders by severity, slide position and rule", () => {
  const spec = { slides: [{ id: "s01" }, { id: "s02" }] };
  const out = P.sortFindings([
    { sev: "NOTE", slide: "s01", gate: "T1" }, { sev: "FIX", slide: "s02", gate: "C2", rule: "C2.body-words" },
    { sev: "BLOCK", slide: "s02", gate: "C1", rule: "C1.hero-words" }, { sev: "FIX", slide: "s01", gate: "C2", rule: "C2.title-words" }], spec);
  assert.deepEqual(plain(out).map((r) => r.sev + (r.slide || "")), ["BLOCKs02", "FIXs01", "FIXs02", "NOTEs01"]);
});

/* ---- spec edits ------------------------------------------------------------------------------------------------------------------ */
const spec3 = () => ({
  slides: [{ id: "s01" }, { id: "s02" }, { id: "s03" }],
  captionPack: { perSlide: ["أ", "ب", "ج"], alt: ["١", "٢", "٣"], firstLine: "x" },
});

test("realignCaption follows slides by id when they are moved, removed or added", () => {
  const old = spec3();
  const moved = { ...old, slides: [{ id: "s03" }, { id: "s01" }, { id: "s02" }] };
  assert.deepEqual(plain(P.realignCaption(old, moved).captionPack.perSlide), ["ج", "أ", "ب"]);
  const removed = { ...old, slides: [{ id: "s01" }, { id: "s03" }] };
  assert.deepEqual(plain(P.realignCaption(old, removed).captionPack.alt), ["١", "٣"]);
  const added = { ...old, slides: [{ id: "s01" }, { id: "s09" }, { id: "s02" }, { id: "s03" }] };
  const out = P.realignCaption(old, added).captionPack;
  assert.deepEqual(plain(out.perSlide), ["أ", "", "ب", "ج"]);
  assert.equal(out.firstLine, "x");
  const noPack = { slides: [{ id: "s01" }] };
  assert.equal(P.realignCaption(noPack, noPack), noPack);
});

test("convertSpecDigits converts copy and caption but not number values or the input", () => {
  const spec = {
    locale: { digits: "western" }, hook: { cover: "6 أدوات" },
    slides: [{ id: "s01", headline: "6 أدوات", number: { value: "5", unit: "ساعات" }, bullets: ["1 أ"], sides: [{ text: "2 ب" }], cta: { text: "3 ج" } }],
    captionPack: { firstLine: "7 نقاط", alt: ["8"], hashtags: ["#9"] },
  };
  const out = plain(P.convertSpecDigits(spec, "arabic-indic"));
  assert.equal(out.slides[0].headline, "٦ أدوات");
  assert.equal(out.slides[0].number.value, "5");
  assert.equal(out.slides[0].bullets[0], "١ أ");
  assert.equal(out.slides[0].sides[0].text, "٢ ب");
  assert.equal(out.slides[0].cta.text, "٣ ج");
  assert.equal(out.captionPack.firstLine, "٧ نقاط");
  assert.equal(out.captionPack.hashtags[0], "#9");
  assert.equal(out.locale.digits, "arabic-indic");
  assert.equal(spec.slides[0].headline, "6 أدوات");
});

test("fallbackDiff produces top-level operations", () => {
  const ops = plain(P.fallbackDiff({ a: 1, b: 2, c: 3 }, { a: 1, b: 5, d: 4 }));
  assert.deepEqual(ops, [{ op: "replace", path: "/b", value: 5 }, { op: "add", path: "/d", value: 4 }, { op: "remove", path: "/c" }]);
});

test("toggleEmphasis wraps the word at the caret once and removes it again", () => {
  const ta = { value: "بتغنيك عن المصمم", selectionStart: 12, selectionEnd: 12 };
  const on = P.toggleEmphasis(ta);
  assert.equal(on, "بتغنيك عن ==المصمم==");
  assert.equal(P.toggleEmphasis({ value: on, selectionStart: 0, selectionEnd: 0 }), "بتغنيك عن المصمم");
  const sel = { value: "ا ب ج", selectionStart: 2, selectionEnd: 3 };
  assert.equal(P.toggleEmphasis(sel), "ا ==ب== ج");
});

/* ---- regenerate: validating what the model sends back --------------------------------------------------------------------------------- */
test("validateVariant accepts only the slide's own text fields within the schema limits", () => {
  const slide = { id: "s03", type: "item", title: "أداة التصميم", body: "تكتب الفكرة وتطلع السلايدات.", bridge: "الأداة اللي بعدها" };
  assert.deepEqual(plain(P.validateVariant(slide, { title: "تصميم بدون مصمم", extra: "x" })), { title: "تصميم بدون مصمم" });
  assert.equal(P.validateVariant(slide, { title: "أداة التصميم" }), null, "no change");
  assert.equal(P.validateVariant(slide, { title: "x".repeat(161) }), null, "too long");
  assert.equal(P.validateVariant(slide, { number: { value: "9" } }), null, "not a field of this slide");
  assert.equal(P.validateVariant(slide, "text"), null);
  assert.equal(P.validateVariant(slide, [1]), null);
  assert.deepEqual(plain(P.validateVariant(slide, { body: "  جملة   مضغوطة ‏ " })), { body: "جملة مضغوطة" });
});

test("validateVariant checks lists, sides and calls to action", () => {
  const list = { id: "s07", type: "summary", title: "ت", bullets: ["أ", "ب"] };
  assert.deepEqual(plain(P.validateVariant(list, { bullets: ["ج", "د", "هـ"] })).bullets.length, 3);
  assert.equal(P.validateVariant(list, { bullets: [] }), null);
  assert.equal(P.validateVariant(list, { bullets: ["ج", ""] }), null);
  const versus = { id: "s06", type: "myth-fact", sides: [{ label: "خرافة", text: "أ" }, { label: "حقيقة", text: "ب" }] };
  const ok = plain(P.validateVariant(versus, { sides: [{ label: "خرافة", text: "جديد" }, { text: "ب" }] }));
  assert.equal(ok.sides[0].text, "جديد");
  assert.equal(ok.sides[1].label, "حقيقة", "a missing label keeps the old one");
  assert.equal(P.validateVariant(versus, { sides: [{ text: "x" }] }), null);
  const cta = { id: "s08", type: "cta", title: "ت", cta: { kind: "save", text: "احفظ" } };
  assert.deepEqual(plain(P.validateVariant(cta, { cta: { text: "احفظه الآن" } })), { cta: { kind: "save", text: "احفظه الآن" } });
});

test("fillTemplate leaves unknown placeholders alone", () => {
  assert.equal(P.fillTemplate("{a} و {b}", { a: 1 }), "1 و {b}");
  assert.equal(P.fillTemplate("لا شيء", null), "لا شيء");
});

test("every dynamic key family used by the UI has an entry for each value the data can take", () => {
  const keys = Object.keys(strings.strings);
  const have = (k) => keys.includes(k);
  for (const type of ["cover", "rehook", "item", "step", "stat", "compare", "myth-fact", "quote", "story-beat", "checklist", "summary", "setup", "proof", "share", "cta", "offer", "testimonial", "poster", "grid", "timeline"]) assert.ok(have("type." + type), type);
  for (const k of ["reach", "save", "send", "sell"]) assert.ok(have("intent." + k), k);
  for (const k of ["listicle", "steps", "myth-fact", "story", "case-study", "framework", "comparison", "opinion", "news", "offer", "results", "lead-magnet"]) assert.ok(have("arch." + k), k);
  for (const k of ["western", "arabic-indic"]) assert.ok(have("digits." + k), k);
  for (const k of ["arrow-rtl", "arrow-ltr", "neutral"]) { assert.ok(have("cue." + k), k); assert.ok(have("cue.reason." + k), k); }
  for (const k of ["idea", "angled", "scripted", "designed", "exported", "posted"]) assert.ok(have("status." + k), k);
});

test("the text-check record of an AI image is written, replaced and cleared with its asset (gate A1.text-check)", () => {
  const spec = { slides: [], ext: { other: 1 } };
  const checked = P.withAssetCheck(spec, "plate1", { textChecked: true, at: "2026-10-22T10:00:00Z" });
  assert.deepEqual(plain(checked.ext), { other: 1, assetChecks: { plate1: { textChecked: true, at: "2026-10-22T10:00:00Z" } } });
  assert.equal(spec.ext.assetChecks, undefined, "the input is never modified");
  const twice = P.withAssetCheck(checked, "plate2", { textChecked: true, at: "2026-10-22T10:01:00Z" });
  assert.deepEqual(Object.keys(twice.ext.assetChecks).sort(), ["plate1", "plate2"]);
  const cleared = P.withAssetCheck(checked, "plate1", null);
  assert.deepEqual(plain(cleared.ext), { other: 1 }, "an emptied record leaves the rest of ext alone");
  const bare = P.withAssetCheck({ slides: [] }, "plate1", { textChecked: true, at: "x" });
  assert.equal("ext" in P.withAssetCheck(bare, "plate1", null), false, "ext disappears when nothing is left in it");
});

test("the controls that the gate messages point at have strings in every dialect", () => {
  for (const key of ["check.attest", "check.attested", "visual.textcheck", "visual.textcheck.hint", "check.override", "bb.uidialect", "bb.uidialect.white"]) {
    for (const lang of ["eg", "gulf", "levant", "msa-white", "en"]) {
      assert.ok(strings.strings[key] && strings.strings[key][lang], key + " / " + lang);
    }
  }
});

test("counted nouns take the Arabic form for 1, 2, 3-10, 11-99 and 100+ (and the English one / other)", () => {
  P.loadUiStrings();
  win.CS.ui.setUiDialect("msa-white");
  const slides = [1, 2, 3, 10, 11, 99, 100].map((n) => win.CS.ui.t("script.count", { n }));
  assert.deepEqual(slides, ["سلايد واحد", "سلايدين", "3 سلايدات", "10 سلايدات", "11 سلايد", "99 سلايد", "100 سلايد"]);
  assert.equal(win.CS.ui.t("export.blocked", { n: 2 }), "التصدير متوقف: ملاحظتان حاجبتان.");
  assert.equal(win.CS.ui.t("export.blocked", { n: 5 }), "التصدير متوقف: 5 ملاحظات حاجبة.");
  assert.equal(win.CS.ui.t("export.saved", { n: 4 }), "تم حفظ 4 ملفات");
  assert.equal(win.CS.ui.t("meter.words", { n: 6, max: 25 }), "6 كلمات، الحد 25");
  win.CS.ui.setUiDialect("eg");
  assert.equal(win.CS.ui.t("script.count", { n: 2 }), "سلايدين");
  assert.equal(win.CS.ui.t("export.saved", { n: 1 }), "اتحفظ ملف واحد");
  assert.equal(win.CS.ui.t("export.saved", { n: 12 }), "اتحفظ 12 ملف");
  win.CS.ui.setUiDialect("en");
  assert.equal(win.CS.ui.t("export.saved", { n: 1 }), "Saved 1 file");
  assert.equal(win.CS.ui.t("export.saved", { n: 3 }), "Saved 3 files");
  assert.equal(win.CS.ui.t("script.count", { n: 0 }), "0 slides");
  win.CS.ui.setUiDialect("eg");
});

test("every plural entry has the form a count can need, in every dialect", () => {
  for (const [key, entry] of Object.entries(strings.strings)) {
    for (const lang of ["eg", "gulf", "levant", "msa-white", "en"]) {
      const v = entry[lang];
      if (v && typeof v === "object") {
        assert.ok(typeof v.other === "string", key + " / " + lang + ": needs an 'other' form");
        assert.ok(typeof v.one === "string", key + " / " + lang + ": needs a 'one' form");
        if (lang !== "en") assert.ok(typeof v.two === "string" && typeof v.few === "string", key + " / " + lang + ": needs 'two' and 'few'");
      }
    }
  }
});

test("private UI builds are deterministic and remain under their ceilings", () => {
  const again = path.join(built, "again");
  build(again);
  for (const [file, ceiling] of [["cs-ui.js", 201000], ["cs-brandbook.js", 190 * 1024]]) {
    const bytes = fs.readFileSync(path.join(built, file));
    assert.ok(bytes.length <= ceiling, `${file}: ${bytes.length} > ${ceiling}`);
    assert.deepEqual(bytes, fs.readFileSync(path.join(again, file)));
  }
});

test("the core UI loads without optional chunks and addable items types follow live registration", () => {
  for (let run = 0; run < 2; run++) {
    const w = loadChunks({ coreOnly: true, internals: true });
    const u = w.CS.ui._;
    assert.equal(u.attachExport, undefined);
    assert.deepEqual(plain(u.checkExtras), []);
    assert.deepEqual(plain(u.panels), {});
    const before = plain(u.addableTypes());
    assert.ok(!before.includes("grid") && !before.includes("timeline"));
    u.editors.items = true;
    assert.deepEqual(plain(u.addableTypes()), before, "only a callable editor unlocks insertion");
    u.editors.items = () => null;
    assert.deepEqual(plain(u.addableTypes()).slice(-2), ["grid", "timeline"]);
    delete u.editors.items;
    assert.deepEqual(plain(u.addableTypes()), before);
    assert.throws(() => w.CS.ui.__test.ensureExport({}), { code: "E_DEP_LOAD" });
  }
});

test("panel, editor and Check hooks render on their real surfaces and refresh without duplicates", () => {
  const snapshots = [];
  for (let run = 0; run < 2; run++) {
    const w = loadChunks({ coreOnly: true, internals: true });
    const u = w.CS.ui._, api = w.CS.ui.__test;
    const slide = { id: "s03", n: 3, type: "unknown", media: { slot: "none" } };
    const ctx = {
      slide: () => slide, spec: { locale: { swipeCue: "neutral" } },
      anyAi: () => false, bus: { on() {} }, qa: { all: {}, stale: false },
      results: () => [], summary: () => ({ status: "pass" }),
    };
    // The absent factories also work through the actual rendering paths.
    assert.deepEqual(plain(api.slideEditors(ctx, slide)), []);
    const visual = api.VisualTab(ctx);
    const original = visual.el.children.length;
    api.CheckScreen(ctx).show();
    u.panels.visual = [(c, s) => { assert.equal(c, ctx); assert.equal(s, slide); return { el: new Element("visual-extension") }; }];
    u.editors.items = (c, s, opts) => { assert.equal(c, ctx); assert.equal(s, slide); assert.equal(opts.origin, "test"); return [new Element("items-editor"), null]; };
    u.checkExtras.push(() => new Element("check-extension"));
    visual.refresh();
    visual.refresh();
    assert.equal(visual.el.children.length, original + 1);
    assert.equal(visual.el.children.at(-1).tagName, "visual-extension");
    const editors = api.slideEditors(ctx, slide, { origin: "test" });
    assert.equal(editors.length, 1);
    const check = api.CheckScreen(ctx);
    check.show(); check.show();
    assert.equal(check.el.children.at(-1).children.length, 1);
    snapshots.push([visual.el.children.at(-1).tagName, editors[0].tagName, check.el.children.at(-1).children[0].tagName]);
  }
  assert.deepEqual(snapshots[0], snapshots[1]);
});

test("a throwing optional factory is reported and later factories still render", () => {
  for (let run = 0; run < 2; run++) {
    const w = loadChunks({ coreOnly: true, console: { error() {} } });
    const errors = [];
    w.CS.emit = (type, detail) => errors.push([type, detail.detail]);
    const host = new Element("host");
    w.CS.ui._.runExtensions(host, [() => { throw new Error("broken"); }, () => new Element("healthy")], {}, {});
    assert.deepEqual(errors, [["cs:error", "ui-extension:0"]]);
    assert.equal(host.children[0].tagName, "healthy");
  }
});

test("visual string blocks merge by dialect and keep the existing fallback", () => {
  for (let run = 0; run < 2; run++) {
    const w = loadChunks({ blocks: { "cs-ui-strings-visual": { textContent: JSON.stringify({ strings: { "app.name": { eg: "extension name" }, "visual.new": { en: "Visual extension" } } }) } } });
    w.CS.ui._pure.loadUiStrings();
    w.CS.ui.setUiDialect("eg");
    assert.equal(w.CS.ui.t("app.name"), "extension name");
    assert.equal(w.CS.ui.t("visual.new"), "Visual extension");
    w.CS.ui.setUiDialect("en");
    assert.equal(w.CS.ui.t("app.name"), strings.strings["app.name"].en);
  }
});

test("late export registration keeps capability caching, current dialect, source, progress and delivery", async () => {
  const runs = [];
  for (let run = 0; run < 2; run++) {
    const w = loadChunks({ coreOnly: true, internals: true });
    w.CS.ui._.toast = () => {};
    let progressed = false;
    const ctx = {
      spec: { id: "post", frozen: {} }, brand: {}, assets: () => null,
      bus: { emit() { if (ctx.exp && ctx.exp.done === 1) progressed = true; } }, qa: { all: {}, stale: false }, blockers: () => [],
      anyAi: () => false, commit(fn) { this.spec = fn(this.spec); },
    };
    vm.runInContext(chunkText("cs-brandbook.js"), w);
    const calls = [];
    let capsCalls = 0;
    w.CS.core.freeze = { verify: () => ({ ok: true }) };
    ctx.tokens = {};
    w.document.querySelectorAll = () => [];
    w.CS.export = {
      capabilities: async () => { capsCalls++; return { videoEncoder: true }; },
      kit: async (spec, context, opts) => {
        calls.push([context.dialect, opts.dialect, /Feather and Tabler, MIT/.test(context.sourceHtml())]);
        context.onProgress({ done: 1, total: 1, label: "kit" });
        return { zip: { path: "kit.zip", bytes: new Uint8Array([1]) }, skipped: [] };
      },
      slides: async () => [{ path: "slide.png", bytes: new Uint8Array([1]) }],
      cover: async () => { throw Object.assign(new Error("cancelled"), { code: "E_ABORTED" }); },
      save: async (files) => ({ saved: files.map((f) => f.path), failed: [], declined: [] }),
      text: { postingGuide: (dialect) => ({ bytes: new TextEncoder().encode(dialect) }) },
    };
    w.CS.ui.__test.ensureExport(ctx);
    const state = ctx.exp;
    w.CS.ui.__test.ensureExport(ctx);
    assert.equal(ctx.exp, state, "attaching again preserves export state");
    await Promise.all([ctx.exportCaps(), ctx.exportCaps()]);
    assert.equal(capsCalls, 1);
    w.CS.ui.setUiDialect("eg");
    assert.equal(ctx.postingGuideText(), "eg");
    w.CS.ui.setUiDialect("en");
    assert.equal(ctx.postingGuideText(), "en");
    const result = await ctx.exportKit();
    assert.deepEqual(plain(result.saved), ["kit.zip"]);
    assert.equal(ctx.spec.checkpoint, "exported");
    assert.equal(ctx.exp.running, false);
    assert.equal(progressed, true, "kit progress reaches the UI before the save job begins");
    assert.deepEqual(calls, [["en", "en", true]]);
    assert.deepEqual(plain((await ctx.exportFiles("png")).saved), ["slide.png"]);
    assert.equal(await ctx.exportFiles("mp4"), null);
    assert.equal(ctx.exp.running, false);
    assert.equal(ctx.exp.ctrl, null);
    runs.push(calls);
  }
  assert.deepEqual(runs[0], runs[1]);
});

test("serialized HTML notice agrees byte for byte with the Python builder", () => {
  const source = fs.readFileSync(path.join(root, "src/ui/serialize.js"), "utf8");
  const notice = JSON.parse(source.match(/var NOTICE_TEXT = (".*");/)[1]);
  const py = fs.readFileSync(path.join(skill, "scripts/build_studio.py"), "utf8");
  const parts = py.match(/NOTICE = \(([^]*?)\)\r?\n/)[1].match(/"[^"]*"/g).map((part) => JSON.parse(part));
  assert.equal(notice, parts.join(""));
});
