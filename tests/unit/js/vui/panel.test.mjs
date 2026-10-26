// Unit tests for src/visual-ui/panel.js (U2a): the plan section of the Visual tab. Run: node --test tests/unit/js/vui/panel.test.mjs
// The real cs-ui.js and cs-visual-ui.js are built privately, loaded in a vm with a small fake DOM and driven through their hooks.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { loadPlanner } from "../../../../plugins/carousel-studio/skills/carousel-design/scripts/plan.mjs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../../..");
const skill = path.join(root, "plugins", "carousel-studio", "skills", "carousel-design");
const built = fs.mkdtempSync(path.join(process.env.CS_TMP || os.tmpdir(), "cs-u2a-panel-"));
after(() => fs.rmSync(built, { recursive: true, force: true }));
const run = spawnSync(process.execPath, ["tools/build.mjs", "--module", "ui", "--module", "visual-ui", "--module", "core", "--module", "art", "--module", "visual", "--out", built], { cwd: root, encoding: "utf8" });
assert.equal(run.status, 0, run.stderr || run.stdout);
const chunk = (name) => fs.readFileSync(path.join(built, name), "utf8");
const readJson = (...p) => JSON.parse(fs.readFileSync(path.join(skill, ...p), "utf8"));
const strings = { strings: { ...readJson("runtime", "ui-strings.json").strings, ...readJson("runtime", "ui-strings-visual.json").strings } };
const PLUGIN = readJson("data", "platform-instagram.json").plugin;

/* ---- harness: the real cs-ui and cs-visual-ui chunks in a vm with a small fake DOM -------------------------------------------- */
const kebabToCamel = (k) => k.replace(/-([a-z])/g, (m, c) => c.toUpperCase());
class FakeNode {
  constructor(tag) {
    Object.assign(this, { tagName: String(tag).toUpperCase(), nodeType: 1, children: [], parentNode: null, attrs: {}, style: {}, dataset: {}, handlers: {},
      className: "", innerHTML: "", ownText: "", hidden: false, disabled: false, value: "", checked: false, selected: false });
  }
  get firstChild() { return this.children[0] || null; }
  get firstElementChild() { return this.children.find((c) => c.nodeType === 1) || null; }
  get textContent() { return this.ownText + this.innerHTML.replace(/<[^>]*>/g, "") + this.children.map((c) => (c.nodeType === 3 ? c.nodeValue : c.textContent)).join(""); }
  set textContent(v) { this.children = []; this.ownText = String(v); }
  appendChild(n) { if (n.parentNode) n.parentNode.removeChild(n); n.parentNode = this; this.children.push(n); return n; }
  insertBefore(n, ref) { if (n.parentNode) n.parentNode.removeChild(n); n.parentNode = this; const i = this.children.indexOf(ref); this.children.splice(i < 0 ? this.children.length : i, 0, n); return n; }
  removeChild(n) { const i = this.children.indexOf(n); if (i >= 0) this.children.splice(i, 1); n.parentNode = null; return n; }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  setAttribute(k, v) { this.attrs[k] = String(v); if (k === "class") this.className = String(v); }
  getAttribute(k) { return k === "class" ? this.className : k in this.attrs ? this.attrs[k] : null; }
  addEventListener(type, fn) { (this.handlers[type] = this.handlers[type] || []).push(fn); }
  fire(type) { const ev = { type, target: this, key: "", preventDefault() {} }; (this.handlers[type] || []).slice().forEach((f) => f(ev)); }
  click() { if (!this.disabled) this.fire("click"); }
  focus() {}
  blur() {}
  select() {}
  get classList() {
    const el = this, list = () => el.className.split(" ").filter(Boolean);
    return { add: (c) => { if (!list().includes(c)) el.className = list().concat(c).join(" "); }, remove: (c) => { el.className = list().filter((x) => x !== c).join(" "); }, contains: (c) => list().includes(c) };
  }
  attr(name) { return name === "class" ? this.className : name.startsWith("data-") ? this.dataset[kebabToCamel(name.slice(5))] : this.attrs[name]; }
  is(compound) {
    const m = /^([a-z0-9-]*)((?:\.[\w-]+|\[[^\]]+\])*)$/i.exec(compound);
    if (!m) throw new Error("selector not supported by the fake DOM: " + compound);
    if (m[1] && this.tagName !== m[1].toUpperCase()) return false;
    return (m[2].match(/\.[\w-]+|\[[^\]]+\]/g) || []).every((part) => {
      if (part[0] === ".") return this.classList.contains(part.slice(1));
      const [, name, value] = /^\[([\w-]+)(?:="?([^"\]]*)"?)?\]$/.exec(part);
      const have = this.attr(name);
      return value === undefined ? have !== undefined && have !== null : String(have) === value;
    });
  }
  all(sel) {
    const parts = sel.trim().split(/\s+/), out = [];
    const walk = (node, ancestors) => node.children.forEach((c) => {
      if (c.nodeType !== 1) return;
      if (c.is(parts[parts.length - 1])) {
        let i = parts.length - 2, a = ancestors.length - 1;
        while (i >= 0 && a >= 0) { if (ancestors[a].is(parts[i])) i--; a--; }
        if (i < 0) out.push(c);
      }
      walk(c, ancestors.concat(c));
    });
    walk(this, []);
    return out;
  }
  querySelectorAll(sel) { return this.all(sel); }
  querySelector(sel) { return this.all(sel)[0] || null; }
}
const plain = (v) => JSON.parse(JSON.stringify(v));

/* ---- one Studio in a vm ------------------------------------------------------------------------------------------------------ */
function load() {
  const body = new FakeNode("body"), blocks = { "cs-ui-strings": { textContent: JSON.stringify(strings) } };
  const sb = {
    console: { error() {}, log: console.log }, TextDecoder, AbortController, setTimeout: () => 0, clearTimeout() {}, navigator: {}, requestAnimationFrame() {},
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    document: {
      documentElement: new FakeNode("html"), body, head: new FakeNode("head"), getElementById: (id) => blocks[id] || null, addEventListener() {},
      createElement: (tag) => new FakeNode(tag), createElementNS: (ns, tag) => new FakeNode(tag), createTextNode: (s) => ({ nodeType: 3, nodeValue: String(s), parentNode: null }),
    },
    CS: {
      emit() {}, CSError: class extends Error {},
      core: {
        text: { wordCount: (s) => String(s || "").replace(/==/g, "").split(/\s+/).filter(Boolean).length },
        registry: { getPreset: (id) => ({ id }), listPresets: () => [] },
      },
    },
  };
  sb.window = sb;
  vm.createContext(sb);
  vm.runInContext(chunk("cs-ui.js").replace(/\}\)\(\);\s*$/, "CS.ui.__test = { createCtx };\n})();"), sb, { filename: "cs-ui.js" });
  vm.runInContext(chunk("cs-visual-ui.js"), sb, { filename: "cs-visual-ui.js" });
  sb.CS.ui._pure.loadUiStrings();
  sb.CS.ui.setUiDialect("eg");
  return sb;
}

const deck = () => ({
  id: "t", locale: { dialect: "eg", digits: "western" }, style: { presetId: "poster@1.0" }, sources: [{ id: "src1", excerpt: "تقرير" }],
  slides: [
    { id: "s01", n: 1, type: "cover", headline: "غلاف" },
    { id: "s02", n: 2, type: "item", title: "ب" },
    { id: "s03", n: 3, type: "item", title: "ج", visual: { anchor: { kind: "icon", icon: "clock" }, recipe: "under", lock: true } },
    { id: "s04", n: 4, type: "stat", number: { value: "74", unit: "%" }, visual: { anchor: { kind: "numeral" }, recipe: "over" } },
    { id: "s05", n: 5, type: "cta", title: "د" },
  ],
});

/** A Studio with a fake planner (the shape of CS.visual.plan, IS-10): locked slides come back as they are, the others get their partial
 *  visual completed or a word anchor. `answer` overrides the kind it picks. */
function studio({ caps, planner = true, answer, everything = false, noCaps = false, realPlanner = false } = {}) {
  const sb = load(), seen = [], calls = [];
  const art = caps || { icon: ["icon"], numeral: ["none"], chart: ["bars-h"], mock: ["chat", "notes"], rows: ["list"], word: ["solid"], field: ["panel"], scene: ["solo"] };
  sb.CS.visual = {
    art: { caps: () => ({ v: 1, art }) },
    /* the shape of CS.visual.caps (contract v2): the art caps plus the planner's tables and a hash */
    ...(noCaps ? {} : { caps: () => ({ v: 1, art, recipes: ["under", "over", "full", "center"], tones: ["base", "invert", "field"], hash: "caps-1" }) }),
    ...(planner ? {
      plan(spec) {
        calls.push(Array.from(arguments));
        seen.push(plain(spec.slides.map((s) => ({ id: s.id, visual: s.visual }))));
        return {
          slides: spec.slides.filter((s) => everything || s.type !== "cover").map((s) => {
            const v = s.visual || {};
            if (v.lock) return { id: s.id, visual: v };
            const kind = answer || (v.anchor && v.anchor.kind) || "word";
            return { id: s.id, visual: { ...v, anchor: { word: "كلمة", ...v.anchor, kind }, recipe: "under", why: "x" } };
          }),
          style: { planV: "1.1.0+0a1b2c3d" }, notes: [],
        };
      },
    } : {}),
  };
  if (realPlanner) sb.CS.visual = loadPlanner({ runtimeDir: built }).CS.visual;
  const ctx = sb.CS.ui.__test.createCtx(sb.document.body, { spec: deck(), brand: null }, {});
  ctx.plugin = PLUGIN;
  if (realPlanner) ctx.preset = () => readJson("styles", "poster", "preset.json");
  ctx.runTextQa = () => { ctx.qaRuns = (ctx.qaRuns || 0) + 1; };
  const section = (id = "s02") => sb.CS.ui._.panels.visual.plan(ctx, ctx.slide(id));
  return { sb, ctx, seen, calls, section, U: sb.CS.ui._ };
}
const visualOf = (ctx, id) => plain((ctx.slide(id) || {}).visual);
const chipKinds = (sec) => sec.all(".ui-chip-btn").map((b) => b.dataset.kind);
const chip = (sec, kind) => sec.all(`.ui-chip-btn[data-kind="${kind}"]`)[0];
const action = (sec, name) => sec.all(`.ui-btn[data-vis-action="${name}"]`)[0];

/* ---- registration ------------------------------------------------------------------------------------------------------------- */
test("CS.vui is created first, and the chunk does nothing without cs-ui", () => {
  const source = fs.readFileSync(path.join(root, "src", "visual-ui", "panel.js"), "utf8");
  assert.equal(source.replace(/^\/\*[\s\S]*?\*\/\s*/, "").split("\n")[0], "CS.vui = CS.vui || {};");
  const bare = { CS: {} };
  bare.window = bare;
  vm.createContext(bare);
  vm.runInContext(chunk("cs-visual-ui.js"), bare);
  assert.deepEqual(plain(bare.CS.vui), {});
});

test("the chunk registers the plan section, the numeral and chart editors, and the items and demo editors", () => {
  const { sb, U } = studio();
  assert.equal(typeof sb.CS.vui.plan, "function");
  assert.deepEqual(Object.keys(U.panels.visual), ["plan", "numeral", "chart"]);
  assert.equal(typeof U.editors.items, "function");
  assert.equal(typeof U.editors.demo, "function");
  assert.ok(U.addableTypes().includes("grid") && U.addableTypes().includes("timeline"), "the items editor unlocks grid and timeline");
});

test("there is no plan section without a planner", () => {
  const { section } = studio({ planner: false });
  assert.equal(section(), null);
});

test("kind chips follow the builders that are registered", () => {
  assert.deepEqual(chipKinds(studio().section()), ["auto", "none", "icon", "numeral", "chart", "mock", "rows", "word", "field"]);
  assert.deepEqual(chipKinds(studio({ caps: { icon: ["icon"], word: ["solid"] } }).section()), ["auto", "none", "icon", "word"]);
  assert.equal(chip(studio().section(), "auto").getAttribute("aria-pressed"), "true", "a slide with no anchor is on auto");
});

/* ---- kind chips and the planner ------------------------------------------------------------------------------------------------- */
test("a kind chip is a level-2 pick: the planner completes the rest around it, in one undo step", () => {
  const { ctx, section, seen } = studio();
  const before = plain(ctx.spec), steps = ctx.past.length;
  chip(section(), "chart").click();
  const v = visualOf(ctx, "s02");
  assert.equal(v.anchor.kind, "chart");
  assert.equal(v.recipe, "under", "the recipe came from the planner");
  assert.equal(ctx.spec.style.planV, "1.1.0+0a1b2c3d");
  assert.equal(ctx.past.length, steps + 1);
  assert.equal(seen[0].find((s) => s.id === "s04").visual.lock, true, "a slide that has an anchor reaches the planner locked");
  assert.equal(plain(ctx.slide("s04")).visual.lock, undefined, "and is not locked in the spec");
  assert.deepEqual(visualOf(ctx, "s03"), before.slides[2].visual);
  assert.equal(ctx.slide("s05").visual, undefined, "slides that were not asked for are not written");
  ctx.undo();
  assert.deepEqual(plain(ctx.spec), before);
});

test("a kind the planner would change stays as it was picked", () => {
  const { ctx, section } = studio({ answer: "word" });
  chip(section(), "chart").click();
  assert.deepEqual(visualOf(ctx, "s02"), { anchor: { kind: "chart" } });
  assert.equal(chip(section(), "chart").getAttribute("aria-pressed"), "true");
});

test("auto drops the pick and plans the slide again; on a slide with no anchor it does nothing", () => {
  const { ctx, section } = studio();
  const steps = ctx.past.length;
  chip(section(), "auto").click();
  assert.equal(ctx.past.length, steps);
  chip(section(), "mock").click();
  assert.equal(visualOf(ctx, "s02").anchor.kind, "mock");
  chip(section(), "auto").click();
  assert.equal(visualOf(ctx, "s02").anchor.kind, "word", "the planner decided again");
});

test("the lock toggle writes lock, and a locked slide cannot be picked or planned", () => {
  const { ctx, section } = studio();
  assert.equal(section().all("input.ui-switch-in").length, 0, "nothing to lock before there is an anchor");
  chip(section(), "word").click();
  let sw = section().all("input.ui-switch-in")[0];
  sw.checked = true;
  sw.fire("change");
  assert.equal(visualOf(ctx, "s02").lock, true);
  const locked = section();
  assert.ok(locked.all(".ui-chip-btn").every((b) => b.disabled), "chips are off while locked");
  assert.equal(action(locked, "plan-slide").disabled, true);
  assert.equal(locked.all(".ui-pill").length, 1);
  chip(locked, "chart").click();
  assert.equal(visualOf(ctx, "s02").anchor.kind, "word", "a locked slide ignores a pick");
  sw = locked.all("input.ui-switch-in")[0];
  sw.checked = false;
  sw.fire("change");
  assert.equal("lock" in visualOf(ctx, "s02"), false, "unlocking removes the key");
});

test("plan slide plans this slide only; the others reach the planner locked", () => {
  const { ctx, section, seen } = studio();
  action(section(), "plan-slide").click();
  const sent = Object.fromEntries(seen[0].map((s) => [s.id, s.visual]));
  assert.equal(sent.s02, undefined);
  assert.equal(sent.s03.lock, true);
  assert.equal(sent.s04.lock, true);
  assert.equal(visualOf(ctx, "s02").anchor.kind, "word");
  assert.equal(ctx.slide("s05").visual, undefined);
  assert.deepEqual(visualOf(ctx, "s04"), { anchor: { kind: "numeral" }, recipe: "over" });
});

test("plan the deck fills the slides that have no anchor and starts a partial visual from what it has", () => {
  const { ctx, section, seen } = studio();
  ctx.setSlide("s05", { visual: { recipe: "full" } }, { origin: "form" });
  action(section(), "plan-deck").click();
  assert.equal(seen[0].find((s) => s.id === "s05").visual.recipe, "full");
  assert.equal(visualOf(ctx, "s05").recipe, "under", "(the stand-in planner sets its own recipe)");
  assert.equal(visualOf(ctx, "s05").anchor.kind, "word");
  assert.equal(visualOf(ctx, "s02").anchor.kind, "word");
  assert.deepEqual(visualOf(ctx, "s04"), { anchor: { kind: "numeral" }, recipe: "over" }, "a slide that already has an anchor is kept");
});

test("plan again clears the unlocked slides and leaves the locked ones as they are; one undo restores all", () => {
  const { ctx, section, seen } = studio();
  const before = plain(ctx.spec), steps = ctx.past.length;
  action(section(), "replan").click();
  const sent = Object.fromEntries(seen[0].map((s) => [s.id, s.visual]));
  assert.deepEqual(plain(sent.s03), before.slides[2].visual, "the locked slide goes in whole");
  assert.equal(sent.s04, undefined, "an unlocked slide goes in empty");
  assert.deepEqual(visualOf(ctx, "s03"), before.slides[2].visual);
  assert.equal(visualOf(ctx, "s04").anchor.kind, "word");
  assert.equal(ctx.past.length, steps + 1);
  ctx.undo();
  assert.deepEqual(plain(ctx.spec), before);
});

test("planning says so once, with an undo; the quiet line shows once a plan is stored", () => {
  const { ctx, sb, section } = studio();
  assert.ok(!section().textContent.includes("اتضافت صور تلقائي"));
  const before = plain(ctx.spec);
  action(section(), "plan-deck").click();
  const toasts = sb.document.body.all(".ui-toast");
  assert.equal(toasts.length, 1);
  assert.ok(toasts[0].textContent.includes("اتضافت صور تلقائي"));
  assert.ok(section().textContent.includes("اتضافت صور تلقائي"));
  toasts[0].all(".ui-toast-act")[0].click();
  assert.deepEqual(plain(ctx.spec), before);
});

test("a plan, a pick and a lock rebuild the Visual tab; typing in a box does not", () => {
  const { ctx, section } = studio(), origins = [];
  ctx.bus.on("spec", (d) => origins.push(d.origin));
  chip(section(), "mock").click();
  const sw = section().all("input.ui-switch-in")[0];
  sw.checked = true;
  sw.fire("change");
  sw.checked = false;
  sw.fire("change");
  action(section(), "plan-slide").click();
  const box = section().all("input.ui-input")[0];
  box.value = "x";
  box.fire("change");
  assert.deepEqual(origins, ["visual", "visual", "visual", "visual", "form"]);
});

test("a cover has no plan section; a slide with the user's own file keeps its file and is left out of the deck plans", () => {
  const { ctx, section } = studio({ everything: true });
  assert.equal(section("s01"), null, "the cover is not planned from the Studio");
  ctx.setSlide("s02", { media: { slot: "photo", assetId: "a1" } }, { origin: "form" });
  const held = section("s02");
  assert.ok(held.all(".ui-chip-btn").every((b) => b.disabled), "chips are off");
  assert.equal(action(held, "plan-slide").disabled, true);
  assert.equal(action(held, "plan-deck").disabled, false);
  action(held, "plan-deck").click();
  assert.equal(ctx.slide("s01").visual, undefined, "the cover is never written");
  assert.equal(ctx.slide("s02").visual, undefined, "a slide with a file is never written");
  assert.equal(visualOf(ctx, "s05").anchor.kind, "word");
  action(held, "replan").click();
  assert.equal(ctx.slide("s01").visual, undefined);
  assert.equal(ctx.slide("s02").visual, undefined);
});

test("the big word of a word anchor is written to anchor.word and text QA runs", () => {
  const { ctx, section } = studio();
  chip(section(), "word").click();
  const box = section().all("input.ui-input")[0];
  box.value = "  جديدة ";
  box.fire("change");
  assert.equal(visualOf(ctx, "s02").anchor.word, "جديدة");
  assert.equal(visualOf(ctx, "s02").anchor.kind, "word");
  assert.ok(ctx.qaRuns >= 1);
});

/* ---- the planner call (contract v2) --------------------------------------------------------------------------------------------- */
test("every plan call passes the capability manifest of the runtime as the fifth argument", () => {
  const { sb, section, calls } = studio();
  chip(section(), "chart").click();
  action(section(), "plan-slide").click();
  action(section(), "plan-deck").click();
  action(section(), "replan").click();
  assert.equal(calls.length, 4);
  for (const args of calls) {
    assert.equal(args.length, 5, "spec, brand, preset, memory, options");
    assert.equal(args[3], null, "no memory");
    assert.deepEqual(Object.keys(args[4]), ["caps"]);
    assert.deepEqual(plain(args[4].caps), plain(sb.CS.visual.caps()), "the manifest of CS.visual.caps()");
  }
  assert.equal(calls[0][4].caps.hash, "caps-1");
  assert.deepEqual(plain(calls[0][4].caps.recipes), ["under", "over", "full", "center"]);
});

test("a runtime without CS.visual.caps still plans, with no manifest to pass", () => {
  const { ctx, section, calls } = studio({ noCaps: true });
  chip(section(), "mock").click();
  assert.equal(calls[0].length, 5);
  assert.equal(calls[0][4].caps, undefined, "the planner falls back to its own default");
  assert.equal(visualOf(ctx, "s02").anchor.kind, "mock");
});

/* ---- a pick keeps the rest of the visual ------------------------------------------------------------------------------------------ */
const ANCHOR = {
  icon: "clock", object: "coin-stack", size: "xl", treatment: "ring", badge: "check", captions: ["وقت"], template: "trio", icons: ["clock"], roles: ["dominant"],
  value: "74", unit: "%", companion: "ring", of: 10, filled: 7, chart: { kind: "bars-h", values: [{ label: "أ", value: 1 }] }, mock: { kind: "chat" },
  word: "كلمة", wordStyle: "solid", pattern: "stripes",
};
const OTHER = { recipe: "full", tone: "invert", marks: ["arrow", "sparkle"], bleed: "both", field: true, pause: true, idea: "فكرة" };
const NOTES = { why: "قديم", alt: "وصف قديم", relax: 2, rowIcons: ["clock", "coins"] };
const pick = (visual, kind, opts) => {
  const s = studio(opts);
  s.ctx.setSlide("s02", { visual }, { origin: "form" });
  chip(s.section(), kind).click();
  return { ...s, sent: s.seen[0].find((x) => x.id === "s02").visual };
};

test("a pick keeps recipe, tone, marks and the other visual choices, and drops the planner's notes on the old anchor", () => {
  const { sent } = pick({ anchor: { kind: "scene", ...ANCHOR }, ...OTHER, ...NOTES }, "numeral");
  assert.deepEqual(sent, { anchor: { kind: "numeral", value: "74", unit: "%", companion: "ring", of: 10, filled: 7, treatment: "ring", icon: "clock", object: "coin-stack" }, ...OTHER });
  for (const k of Object.keys(NOTES)) assert.equal(k in sent, false, k + " described the old anchor");
});

test("icon -> field -> icon retains the chosen glyph settings with the real planner, twice", () => {
  const finals = [];
  for (const run of [0, 1]) {
    const { ctx, section } = studio({ realPlanner: true });
    const chosen = { icon: "clock", object: "coin-stack", size: "lg", treatment: "ring", badge: "check", mirror: true, captions: ["وقت"] };
    ctx.setSlide("s02", { visual: { anchor: { kind: "icon", ...chosen }, recipe: "under", tone: "base" } }, { origin: "form" });
    chip(section(), "field").click();
    assert.deepEqual(visualOf(ctx, "s02").anchor, { kind: "field", ...chosen });
    assert.equal(section().all("input.ui-input").length, 0, "an icon field has no word box that would change its subtype");
    chip(section(), "icon").click();
    assert.deepEqual(visualOf(ctx, "s02").anchor, { kind: "icon", ...chosen });
    finals.push(JSON.stringify(ctx.spec));
  }
  assert.equal(finals[0], finals[1]);
});

test("switching kinds retains compatible builder payloads and discards unrelated data", () => {
  assert.deepEqual(pick({ anchor: { kind: "word", word: "كلمة", wordStyle: "hollow" } }, "field").sent.anchor, { kind: "field", word: "كلمة", wordStyle: "hollow" });
  assert.deepEqual(pick({ anchor: { kind: "numeral", value: "5", unit: "%" } }, "field").sent.anchor, { kind: "field", value: "5", unit: "%" });
  assert.deepEqual(pick({ anchor: { kind: "icon", icon: "clock", size: "lg", treatment: "sticker", object: "coin-stack", captions: ["وقت"] } }, "numeral").sent.anchor,
    { kind: "numeral", icon: "clock", treatment: "sticker", object: "coin-stack" });
  assert.deepEqual(pick({ anchor: { kind: "scene", icons: ["clock"], treatment: "chip", captions: ["وقت"], template: "trio", chart: {} } }, "rows").sent.anchor,
    { kind: "rows", icons: ["clock"], treatment: "chip", captions: ["وقت"] });
  assert.deepEqual(pick({ anchor: { kind: "icon", icon: "clock", size: "lg" } }, "chart").sent.anchor, { kind: "chart" });
  assert.deepEqual(pick({ anchor: { kind: "chart", chart: { kind: "bars-h" }, value: "5" } }, "none").sent.anchor, { kind: "none" });
});

test("rowIcons stay only for rows", () => {
  assert.deepEqual(pick({ anchor: { kind: "icon", icon: "clock" }, ...NOTES }, "rows").sent, { anchor: { kind: "rows" }, rowIcons: NOTES.rowIcons });
  assert.equal("rowIcons" in pick({ anchor: { kind: "rows" }, ...NOTES }, "chart").sent, false);
});

test("what the planner leaves of a pick is written with the choices that were already there", () => {
  const { ctx } = pick({ anchor: { kind: "icon", icon: "clock" }, ...OTHER, ...NOTES }, "numeral");
  const v = visualOf(ctx, "s02");
  assert.equal(v.anchor.kind, "numeral");
  assert.equal(v.tone, "invert");
  assert.deepEqual(v.marks, ["arrow", "sparkle"]);
  assert.equal(v.bleed, "both");
  assert.equal(v.idea, "فكرة");
  assert.equal(v.recipe, "under", "(the stand-in planner sets its own recipe)");
  const { ctx: refused } = pick({ anchor: { kind: "icon", icon: "clock" }, ...OTHER, ...NOTES }, "chart", { answer: "word" });
  assert.deepEqual(visualOf(refused, "s02"), { anchor: { kind: "chart" }, ...OTHER }, "a pick the planner would change is written with the rest of the slide's visual");
});

test("the chip of the kind a slide already has does nothing", () => {
  const { ctx, section, calls } = studio();
  chip(section(), "chart").click();
  const steps = ctx.past.length, spec = plain(ctx.spec);
  chip(section(), "chart").click();
  assert.equal(calls.length, 1);
  assert.equal(ctx.past.length, steps);
  assert.deepEqual(plain(ctx.spec), spec);
});

test("auto drops the anchor and the notes on it and keeps the other choices", () => {
  assert.deepEqual(pick({ anchor: { kind: "icon", icon: "clock" }, ...OTHER, ...NOTES }, "auto").sent, OTHER);
  assert.deepEqual(pick({ anchor: { kind: "icon" } }, "auto").sent, {});
});

/* ---- the slides that are not asked for -------------------------------------------------------------------------------------------- */
test("every slide that is not asked for reaches the planner locked, with or without an anchor, and none of them is written", () => {
  const { ctx, section, seen } = studio({ everything: true });
  ctx.setSlide("s05", { media: { slot: "photo", assetId: "a1" } }, { origin: "form" });
  const before = plain(ctx.spec).slides;
  chip(section(), "chart").click();
  const sent = Object.fromEntries(seen[0].map((s) => [s.id, s.visual]));
  assert.deepEqual(sent.s01, { lock: true }, "the cover, which has no visual");
  assert.deepEqual(sent.s05, { lock: true }, "a slide with the user's own file, which has no visual");
  assert.equal(sent.s03.lock, true);
  assert.equal(sent.s04.lock, true);
  assert.deepEqual(sent.s04.anchor, { kind: "numeral" }, "an anchor goes in as it is");
  assert.equal(sent.s02.lock, undefined, "the slide that was asked for");
  const after = plain(ctx.spec).slides;
  for (const i of [0, 2, 3, 4]) assert.deepEqual(after[i], before[i], before[i].id + " is as it was");
  assert.equal(after[1].visual.anchor.kind, "chart");
});

test("a partial visual on a slide that is not asked for goes in whole, and locked", () => {
  const { ctx, section, seen } = studio();
  ctx.setSlide("s05", { visual: { recipe: "full", tone: "field" } }, { origin: "form" });
  action(section(), "plan-slide").click();
  assert.deepEqual(seen[0].find((x) => x.id === "s05").visual, { recipe: "full", tone: "field", lock: true });
  assert.deepEqual(visualOf(ctx, "s05"), { recipe: "full", tone: "field" });
});

test("the deck plans lock the cover, the slides with the user's own file and the slides they do not plan", () => {
  const { ctx, section, seen } = studio({ everything: true });
  ctx.setSlide("s05", { media: { slot: "photo", assetId: "a1" } }, { origin: "form" });
  action(section(), "plan-deck").click();
  action(section(), "replan").click();
  for (const call of seen) {
    const sent = Object.fromEntries(call.map((s) => [s.id, s.visual]));
    assert.deepEqual(sent.s01, { lock: true });
    assert.deepEqual(sent.s05, { lock: true });
    assert.equal(sent.s03.lock, true);
  }
  assert.equal(ctx.slide("s01").visual, undefined);
  assert.equal(ctx.slide("s05").visual, undefined);
});

/* ---- the contract of the file ----------------------------------------------------------------------------------------------- */
const SOURCES = ["panel.js", "editors.js"].map((f) => [f, fs.readFileSync(path.join(root, "src", "visual-ui", f), "utf8")]);

test("every string key the two files use exists in the shipped strings, in all five dialects", () => {
  const visual = readJson("runtime", "ui-strings-visual.json").strings, base = readJson("runtime", "ui-strings.json").strings;
  const KINDS = ["auto", "none", "icon", "numeral", "chart", "mock", "rows", "word", "field"];
  const used = new Set();
  for (const [, text] of SOURCES) {
    for (const m of text.matchAll(/"((?:vis|common|edit|field)\.[a-z0-9.-]*)"/g)) {
      if (m[1].endsWith(".")) KINDS.forEach((k) => used.add(m[1] + k)); else used.add(m[1]);
    }
  }
  assert.ok(used.size >= 30, "found " + used.size + " keys");
  for (const key of used) {
    const entry = key.startsWith("vis.") ? visual[key] : base[key];
    assert.ok(entry, "missing string " + key);
    for (const d of ["eg", "gulf", "levant", "msa-white", "en"]) assert.ok(entry[d], `${key} has no ${d}`);
  }
});

test("the two files stay inside their budget and the hard content rules", () => {
  const sizes = Object.fromEntries(SOURCES.map(([f, text]) => [f, Buffer.byteLength(text, "utf8")]));
  // 8320: the free lane adds two guards that keep the planner panel off hand-designed slides.
  assert.ok(sizes["panel.js"] <= 8320, "panel.js is " + sizes["panel.js"]);
  assert.ok(sizes["editors.js"] <= 9216, "editors.js is " + sizes["editors.js"]);
  for (const [f, text] of SOURCES) {
    assert.ok(!/Math\.random|\bDate\b|performance\.|fetch\(|XMLHttpRequest|WebSocket|sendBeacon|navigator\./.test(text), f + " uses a clock, randomness or the network");
    assert.ok(!/letter-spacing|italic|justify|opacity|analytics/i.test(text), f + " breaks a content rule");
    assert.ok(!text.includes("\r"), f + " has CRLF line endings");
  }
});

test("run twice, same bytes", () => {
  const finals = [0, 1].map(() => {
    const { ctx, section } = studio();
    chip(section(), "mock").click();
    action(section("s05"), "plan-deck").click();
    action(section(), "replan").click();
    return JSON.stringify(ctx.spec);
  });
  assert.equal(finals[0], finals[1]);
});
