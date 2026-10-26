// Unit tests for src/visual-ui/editors.js (U2a): the items, demo, numeral and chart editors. Run: node --test tests/unit/js/vui/editors.test.mjs
// The real cs-ui.js and cs-visual-ui.js are built privately, loaded in a vm with a small fake DOM and driven through their hooks.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../../..");
const skill = path.join(root, "plugins", "carousel-studio", "skills", "carousel-design");
const built = fs.mkdtempSync(path.join(process.env.CS_TMP || os.tmpdir(), "cs-u2a-editors-"));
after(() => fs.rmSync(built, { recursive: true, force: true }));
const run = spawnSync(process.execPath, ["tools/build.mjs", "--module", "ui", "--module", "visual-ui", "--out", built], { cwd: root, encoding: "utf8" });
assert.equal(run.status, 0, run.stderr || run.stdout);
const chunk = (name) => fs.readFileSync(path.join(built, name), "utf8");
const readJson = (...p) => JSON.parse(fs.readFileSync(path.join(skill, ...p), "utf8"));
const strings = { strings: { ...readJson("runtime", "ui-strings.json").strings, ...readJson("runtime", "ui-strings-visual.json").strings } };
const PLUGIN = readJson("data", "platform-instagram.json").plugin;
const SCHEMA = readJson("schemas", "spec.schema.json");

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
  vm.runInContext(chunk("cs-ui.js").replace(/\}\)\(\);\s*$/, "CS.ui.__test = { createCtx, slideEditors };\n})();"), sb, { filename: "cs-ui.js" });
  vm.runInContext(chunk("cs-visual-ui.js"), sb, { filename: "cs-visual-ui.js" });
  sb.CS.ui._pure.loadUiStrings();
  sb.CS.ui.setUiDialect("eg");
  return sb;
}

const deck = (dialect = "eg") => ({
  id: "t", locale: { dialect, digits: "western" }, style: { presetId: "poster@1.0" }, sources: [{ id: "src1", excerpt: "تقرير" }, { id: "src2" }],
  slides: [
    { id: "s01", n: 1, type: "cover", headline: "غلاف" },
    { id: "s02", n: 2, type: "grid", title: "شبكة" },
    { id: "s03", n: 3, type: "item", title: "نقطة" },
    { id: "s04", n: 4, type: "item", title: "صفوف", visual: { anchor: { kind: "rows" } } },
    { id: "s05", n: 5, type: "step", title: "خطوة" },
    { id: "s06", n: 6, type: "stat", number: { value: "74", unit: "%" }, visual: { anchor: { kind: "numeral" } } },
    { id: "s07", n: 7, type: "item", title: "رسم", visual: { anchor: { kind: "chart" } } },
    { id: "s08", n: 8, type: "item", title: "محادثة", visual: { anchor: { kind: "mock" } } },
    { id: "s09", n: 9, type: "timeline", title: "خط", items: [{ title: "أ" }, { title: "ب" }, { title: "ج" }] },
    { id: "s10", n: 10, type: "item", title: "حقل", visual: { anchor: { kind: "field" } } },
  ],
});

/** A Studio with a stand-in icon lookup (the shape of CS.visual.icons): `clock` is in the pack, the word «وقت» finds `hourglass`. */
function studio(dialect) {
  const sb = load(), lookups = [];
  sb.CS.visual = {
    icons: {
      has: (name) => ["clock", "hourglass", "coins"].includes(name),
      find: (q, o) => { lookups.push([q, o.dialect, o.k]); return q === "وقت" ? [{ name: "hourglass" }] : []; },
    },
  };
  const ctx = sb.CS.ui.__test.createCtx(sb.document.body, { spec: deck(dialect), brand: null }, {});
  ctx.plugin = PLUGIN;
  ctx.runTextQa = () => { ctx.qaRuns = (ctx.qaRuns || 0) + 1; };
  const U = sb.CS.ui._;
  return {
    sb, ctx, U, lookups,
    items: (id) => U.editors.items(ctx, ctx.slide(id)), demo: (id) => U.editors.demo(ctx, ctx.slide(id)),
    numeral: (id) => U.panels.visual.numeral(ctx, ctx.slide(id)), chart: (id) => U.panels.visual.chart(ctx, ctx.slide(id)),
  };
}

/* ---- a small JSON-schema check against the shipped spec schema (the keywords these defs use) ---------------------------------- */
function violations(schema, value) {
  const out = [];
  const walk = (s, v, at) => {
    if (s.$ref) return walk(SCHEMA.$defs[s.$ref.split("/").pop()], v, at);
    if (s.enum && !s.enum.includes(v)) out.push(`${at}: ${JSON.stringify(v)} is not allowed`);
    if (s.type === "object") {
      if (typeof v !== "object" || v === null || Array.isArray(v)) return out.push(`${at}: not an object`);
      (s.required || []).forEach((k) => { if (!(k in v)) out.push(`${at}: ${k} is missing`); });
      Object.keys(v).forEach((k) => {
        if (s.properties && s.properties[k]) walk(s.properties[k], v[k], `${at}.${k}`);
        else if (s.additionalProperties === false) out.push(`${at}: unknown key ${k}`);
      });
    } else if (s.type === "array") {
      if (!Array.isArray(v)) return out.push(`${at}: not an array`);
      if (s.minItems !== undefined && v.length < s.minItems) out.push(`${at}: fewer than ${s.minItems}`);
      if (s.maxItems !== undefined && v.length > s.maxItems) out.push(`${at}: more than ${s.maxItems}`);
      v.forEach((x, i) => walk(s.items, x, `${at}[${i}]`));
    } else if (s.type === "string") {
      if (typeof v !== "string") return out.push(`${at}: not a string`);
      if (s.maxLength !== undefined && v.length > s.maxLength) out.push(`${at}: longer than ${s.maxLength}`);
      if (s.pattern && !new RegExp(s.pattern).test(v)) out.push(`${at}: does not match ${s.pattern}`);
    } else if (s.type === "number" || s.type === "integer") {
      if (typeof v !== "number" || !Number.isFinite(v)) out.push(`${at}: not a number`);
    } else if (s.type === "boolean" && typeof v !== "boolean") out.push(`${at}: not a boolean`);
  };
  walk(schema, value, "$");
  return out;
}
const slideProp = (name) => SCHEMA.$defs.slide.properties[name];
const valid = (ctx, id, ...names) => names.forEach((name) => assert.deepEqual(violations(slideProp(name), ctx.slide(id)[name]), [], name + " breaks the schema"));

const rows = (ed) => ed.all(".ui-bullet-edit");
const inputs = (el) => el.all("input.ui-input");
const areas = (el) => el.all("textarea");
const add = (ed) => ed.all('.ui-btn[data-vis-action="add"]')[0];
const control = (row, i) => row.all(".ui-bullet-ctl .ui-btn")[i];   // 0 up, 1 down, 2 remove
const type = (el, value) => { el.value = value; el.fire("change"); };
const count = (ed) => ed.all(".ui-field-head .ui-hint")[0];
const items = (ctx, id = "s02") => plain(ctx.slide(id).items);

/* ---- items ---------------------------------------------------------------------------------------------------------------------- */
test("the items editor shows for grid, timeline, rows anchors and slides that have items, and is the key that unlocks grid and timeline", () => {
  const s = studio();
  assert.equal(typeof s.U.editors.items, "function");
  assert.equal(s.items("s03"), null, "a plain item slide has no items editor");
  for (const id of ["s02", "s04", "s09"]) assert.ok(s.items(id), id);
  s.ctx.setSlide("s03", { items: [{ title: "x" }] }, { origin: "form" });
  assert.ok(s.items("s03"), "a slide that has items keeps its editor");
  assert.equal(rows(s.items("s09")).length, 3);
});

test("items: add, title, text, value, reorder and remove write schema-valid items, and the list says when it is out of range", () => {
  const { ctx, items: editor } = studio();
  const ed = editor("s02");
  assert.ok(count(ed).className.includes("ui-hint--bad"), "a grid wants 3 to 6 and has none");
  assert.ok(count(ed).innerHTML.includes("0") && count(ed).innerHTML.includes("6"));
  add(ed).click();
  assert.deepEqual(items(ctx), [{ title: "" }]);
  type(areas(rows(ed)[0])[0], "تويتر");
  type(areas(rows(ed)[0])[1], "نص قصير");
  type(inputs(rows(ed)[0])[0], "74");
  assert.equal(inputs(rows(ed)[0])[0].style.flex, "0 0 30%", "the value box is the narrow one, so the icon box can show its hint");
  assert.deepEqual(items(ctx), [{ title: "تويتر", text: "نص قصير", value: "74" }]);
  add(ed).click();
  add(ed).click();
  type(areas(rows(ed)[1])[0], "ب");
  type(areas(rows(ed)[2])[0], "ج");
  assert.ok(!count(ed).className.includes("ui-hint--bad"), "three items are in range");
  control(rows(ed)[2], 0).click();
  assert.deepEqual(items(ctx).map((i) => i.title), ["تويتر", "ج", "ب"]);
  assert.equal(control(rows(ed)[0], 0).disabled, true, "the first row cannot move up");
  assert.equal(control(rows(ed)[2], 1).disabled, true, "the last row cannot move down");
  control(rows(ed)[1], 2).click();
  assert.deepEqual(items(ctx).map((i) => i.title), ["تويتر", "ب"]);
  type(areas(rows(ed)[1])[0], "");
  assert.equal(items(ctx)[1].title, "", "a title may be emptied (it is required) and stays");
  type(inputs(rows(ed)[0])[0], "");
  assert.equal("value" in items(ctx)[0], false, "an emptied value is dropped");
  valid(ctx, "s02", "items");
  control(rows(ed)[1], 2).click();
  control(rows(ed)[0], 2).click();
  assert.equal("items" in plain(ctx.slide("s02")), false, "no items leaves no key");
  assert.ok(ctx.qaRuns >= 8, "text QA runs after every write");
});

test("items: at most six, and the add button says so", () => {
  const { ctx, items: editor } = studio();
  const ed = editor("s02");
  for (let i = 0; i < 9; i++) if (!add(ed).disabled) add(ed).click();
  assert.equal(items(ctx).length, 6);
  assert.equal(add(ed).disabled, true);
  valid(ctx, "s02", "items");
  const timeline = editor("s09");
  add(timeline).click();
  add(timeline).click();
  assert.equal(add(timeline).disabled, true, "a timeline takes at most 5");
});

test("items: the icon box takes a pack name or finds one from the words, and refuses what it cannot find", () => {
  const { ctx, items: editor, lookups } = studio();
  const ed = editor("s02");
  add(ed).click();
  const icon = () => inputs(rows(ed)[0])[1];
  type(icon(), " Clock ");
  assert.equal(items(ctx)[0].icon, "clock");
  assert.deepEqual(lookups, [], "a name in the pack needs no lookup");
  type(icon(), "وقت");
  assert.equal(items(ctx)[0].icon, "hourglass");
  assert.equal(icon().value, "hourglass", "the box shows the name that was chosen");
  assert.deepEqual(lookups[0], ["وقت", "eg", 1]);
  type(icon(), "zzz");
  assert.equal(items(ctx)[0].icon, "hourglass", "nothing is written for a word with no icon");
  assert.equal(icon().getAttribute("aria-invalid"), "true");
  type(icon(), "coins");
  assert.equal(icon().getAttribute("aria-invalid"), "false");
  type(icon(), "");
  assert.equal("icon" in items(ctx)[0], false);
  valid(ctx, "s02", "items");
});

test("items: the lookup is told the dialect it knows", () => {
  for (const [dialect, expected] of [["levant", "lev"], ["msa-white", "msa"], ["gulf", "gulf"], ["eg", "eg"]]) {
    const { items: editor, lookups } = studio(dialect);
    const ed = editor("s02");
    add(ed).click();
    type(inputs(rows(ed)[0])[1], "وقت");
    assert.equal(lookups[0][1], expected, dialect);
  }
});

test("items: the text boxes carry the slot names of the text twins and the platform word limits", () => {
  const { ctx, items: editor } = studio();
  const ed = editor("s02");
  add(ed).click();
  assert.deepEqual(areas(ed).map((a) => a.dataset.field), ["items", "items-text"]);
  assert.ok(areas(ed).every((a) => a.attrs.maxlength !== undefined));
  assert.deepEqual(areas(ed).map((a) => a.attrs.maxlength), ["40", "80"]);
  assert.ok(ctx.plugin.visual.words.art.cardTitle > 0, "the limit the meter reads exists in the platform data");
});

test("the Studio's own text surfaces run the items and demo editors after the built-in fields", () => {
  const { ctx, sb } = studio();
  const editors = (id) => sb.CS.ui.__test.slideEditors(ctx, ctx.slide(id), { origin: "form" });
  assert.equal(editors("s03").length, 3, "an item slide shows title, body and bridge only");
  assert.equal(editors("s02").length, 3, "a grid slide shows title, bridge and the items editor");
  assert.ok(editors("s02")[2].textContent.includes("العناصر"), "the items editor comes last");
  assert.equal(editors("s05").length, 4, "a step slide shows the demo editor");
  assert.ok(editors("s05")[3].textContent.includes("سطور المثال"));
});

/* ---- demo ----------------------------------------------------------------------------------------------------------------------- */
test("the demo editor shows for the types that need a demo, for mock anchors and for slides that have one", () => {
  const s = studio();
  assert.equal(s.demo("s03"), null);
  assert.ok(s.demo("s05"), "step");
  assert.ok(s.demo("s08"), "a mock anchor");
  s.ctx.setSlide("s03", { demo: { lines: [{ text: "x" }] } }, { origin: "form" });
  assert.ok(s.demo("s03"), "an existing demo keeps its editor");
});

test("demo: lines alternate me and them, who can be changed, the caption follows the first line, three lines at most", () => {
  const { ctx, demo: editor } = studio();
  const ed = editor("s05");
  const demo = () => plain(ctx.slide("s05").demo);
  assert.equal(areas(ed).length, 0, "no caption before there is a line");
  add(ed).click();
  add(ed).click();
  assert.deepEqual(demo().lines.map((l) => l.who), ["me", "them"]);
  type(areas(rows(ed)[0])[0], "5 نصايح للكتابة");
  type(areas(rows(ed)[1])[0], "ليه محدش بيكمّل بوستك؟");
  const who = ed.all(".ui-seg")[1].all(".ui-seg-btn");
  assert.deepEqual(who.map((b) => b.dataset.value), ["me", "them"]);
  who[0].click();
  assert.deepEqual(demo().lines.map((l) => l.who), ["me", "me"]);
  assert.equal(areas(ed).filter((a) => a.dataset.field === "demo-caption").length, 1, "the caption box appears with the first line");
  type(areas(ed).find((a) => a.dataset.field === "demo-caption"), "ده اللي بيوقّف الإبهام");
  assert.equal(demo().caption, "ده اللي بيوقّف الإبهام");
  add(ed).click();
  assert.equal(add(ed).disabled, true, "three lines at most");
  assert.deepEqual(areas(ed).map((a) => a.dataset.field), ["demo", "demo", "demo", "demo-caption"]);
  valid(ctx, "s05", "demo");
  type(areas(ed).find((a) => a.dataset.field === "demo-caption"), "");
  assert.equal("caption" in demo(), false);
  for (let i = 0; i < 3; i++) control(rows(ed)[0], 2).click();
  assert.equal("demo" in plain(ctx.slide("s05")), false, "no lines leave no demo at all");
  assert.equal(areas(ed).length, 0);
});

test("demo: a line may be emptied and reordered, a system line keeps its who", () => {
  const { ctx, demo: editor } = studio();
  ctx.setSlide("s05", { demo: { lines: [{ who: "sys", text: "أ" }, { who: "them", text: "ب", hi: true }] } }, { origin: "form" });
  const ed = editor("s05");
  control(rows(ed)[1], 0).click();
  assert.deepEqual(plain(ctx.slide("s05").demo.lines), [{ who: "them", text: "ب", hi: true }, { who: "sys", text: "أ" }], "hi travels with its line");
  type(areas(rows(ed)[0])[0], "");
  assert.equal(plain(ctx.slide("s05").demo.lines)[0].text, "");
  valid(ctx, "s05", "demo");
});

/* ---- numeral -------------------------------------------------------------------------------------------------------------------- */
test("the numeral editor shows for numeral anchors and field anchors that carry a value", () => {
  const s = studio();
  assert.equal(s.numeral("s03"), null);
  assert.ok(s.numeral("s06"));
  assert.equal(s.numeral("s10"), null, "a field with no value is a word or icon field");
  s.ctx.setSlide("s10", { visual: { anchor: { kind: "field", value: "5" } } }, { origin: "form" });
  assert.ok(s.numeral("s10"));
});

test("editing a field numeral preserves its companion and chosen icon treatment", () => {
  const { ctx, numeral } = studio();
  ctx.setSlide("s10", { visual: { anchor: { kind: "field", value: "5", unit: "%", icon: "clock", object: "coin-stack", treatment: "sticker", companion: "icon" } } }, { origin: "form" });
  const [value, unit] = inputs(numeral("s10"));
  type(value, "٧٤"); type(unit, "يوم");
  assert.deepEqual(plain(ctx.slide("s10").visual.anchor), { kind: "field", value: "74", unit: "يوم", icon: "clock", object: "coin-stack", treatment: "sticker", companion: "icon" });
});

test("numeral: value and unit are written to the anchor, digits are Western, a non-number is refused, the source is the slide's", () => {
  const { ctx, numeral: editor } = studio();
  const ed = editor("s06");
  const [value, unit] = inputs(ed), err = ed.all(".ui-hint--bad")[0];
  const anchor = () => plain(ctx.slide("s06").visual.anchor);
  assert.equal(value.attrs.maxlength, "10");
  assert.deepEqual([value.placeholder, unit.placeholder], ["74", "%"], "the slide's own number shows as the fallback the builder reads");
  type(value, "٧٤");
  assert.deepEqual(anchor(), { kind: "numeral", value: "74" });
  assert.equal(err.hidden, true);
  type(value, "abc");
  assert.equal(err.hidden, false, "the shared error is shown");
  assert.equal(anchor().value, "74", "and nothing is written");
  type(value, "1.2.3");
  assert.equal(err.hidden, false, "two decimal points are not a number");
  assert.equal(anchor().value, "74");
  type(value, "1,200");
  assert.equal(anchor().value, "1,200");
  assert.equal(err.hidden, true);
  type(unit, "%");
  assert.deepEqual(anchor(), { kind: "numeral", value: "1,200", unit: "%" });
  type(value, "");
  type(unit, "");
  assert.deepEqual(anchor(), { kind: "numeral" }, "emptied fields leave the kind alone");
  const source = ed.all("select")[0];
  assert.deepEqual(source.children.map((o) => o.value), ["", "src1", "src2"]);
  source.value = "src1";
  source.fire("change");
  assert.deepEqual(plain(ctx.slide("s06").sourceIds), ["src1"]);
  source.value = "";
  source.fire("change");
  assert.equal("sourceIds" in plain(ctx.slide("s06")), false);
  valid(ctx, "s06", "visual");
  assert.ok(ctx.qaRuns >= 6);
});

test("numeral: commas are only thousands groups; a stray comma is refused, the earlier value stays and the error is shown", () => {
  const { ctx, numeral: editor } = studio();
  const ed = editor("s06"), [value] = inputs(ed), err = ed.all(".ui-hint--bad")[0];
  const stored = () => plain(ctx.slide("s06").visual.anchor).value;
  type(value, "74");
  for (const bad of ["1,,2", "12,", ",5", "1,20", "1,2000", "1,200,", "1,,200", "٧٤,", "1.2,3", "1,200.", "1 200"]) {
    type(value, bad);
    assert.equal(err.hidden, false, JSON.stringify(bad) + " shows the error");
    assert.equal(stored(), "74", JSON.stringify(bad) + " writes nothing");
  }
  for (const [typed, saved] of [["1,200", "1,200"], ["1,200,000", "1,200,000"], ["12", "12"], ["0.5", "0.5"], ["1,200.50", "1,200.50"], ["٣٬٠٠٠", "3,000"], ["٣٫٥", "3.5"]]) {
    type(value, typed);
    assert.equal(err.hidden, true, typed + " is a number");
    assert.equal(stored(), saved);
    assert.equal(value.value, saved, "the box shows what was saved");
  }
  type(value, "1,,2");
  assert.equal(err.hidden, false);
  assert.equal(stored(), "3.5", "the value before is the one that stays");
  valid(ctx, "s06", "visual");
});

/* ---- chart ---------------------------------------------------------------------------------------------------------------------- */
test("the chart editor shows for chart anchors only", () => {
  const s = studio();
  assert.equal(s.chart("s03"), null);
  assert.equal(s.chart("s06"), null);
  assert.ok(s.chart("s07"));
});

test("chart: values are added, labelled, valued, reordered and removed; the chart appears with the first value and goes with the last", () => {
  const { ctx, chart: editor } = studio();
  const ed = editor("s07");
  const chart = () => plain(ctx.slide("s07").visual.anchor.chart);
  assert.equal("chart" in plain(ctx.slide("s07").visual.anchor), false);
  assert.equal(ed.all("input.ui-switch-in").length, 0, "no illustrative switch while there is no chart to flag");
  add(ed).click();
  assert.equal(ed.all("input.ui-switch-in").length, 1, "it appears with the first value");
  assert.deepEqual(chart(), { kind: "bars-h", values: [{ label: "", value: 0 }] });
  type(areas(rows(ed)[0])[0], "ساعات");
  type(inputs(rows(ed)[0])[0], "12.5");
  add(ed).click();
  type(areas(rows(ed)[1])[0], "أيام");
  type(inputs(rows(ed)[1])[0], "٣٠");
  assert.deepEqual(chart().values, [{ label: "ساعات", value: 12.5 }, { label: "أيام", value: 30 }]);
  type(inputs(rows(ed)[1])[0], "1,200");
  assert.equal(chart().values[1].value, 1200);
  const err = ed.all(".ui-hint--bad").find((n) => n.tagName === "P");
  type(inputs(rows(ed)[1])[0], "abc");
  assert.equal(err.hidden, false);
  assert.equal(chart().values[1].value, 1200, "a non-number is not written");
  type(inputs(rows(ed)[1])[0], "");
  assert.equal(chart().values[1].value, 0, "an emptied value is zero (it is required)");
  assert.equal(err.hidden, true);
  control(rows(ed)[1], 0).click();
  assert.deepEqual(chart().values.map((v) => v.label), ["أيام", "ساعات"]);
  assert.equal(areas(ed).every((a) => a.dataset.field === "chart"), true);
  valid(ctx, "s07", "visual");
  control(rows(ed)[1], 2).click();
  control(rows(ed)[0], 2).click();
  assert.deepEqual(plain(ctx.slide("s07").visual.anchor), { kind: "chart" }, "no values leave no chart");
});

test("chart: a stray comma is refused, not read as another number; the earlier value stays and the error is shown", () => {
  const { ctx, chart: editor } = studio();
  const ed = editor("s07");
  add(ed).click();
  const value = () => inputs(rows(ed)[0])[0], err = ed.all(".ui-hint--bad").find((n) => n.tagName === "P");
  const stored = () => plain(ctx.slide("s07").visual.anchor.chart.values[0].value);
  type(value(), "30");
  for (const bad of ["1,,2", "12,", ",5", "1,20", "1,2000", "٣٬٠٠"]) {
    type(value(), bad);
    assert.equal(err.hidden, false, JSON.stringify(bad) + " shows the error");
    assert.equal(stored(), 30, JSON.stringify(bad) + " writes nothing (not 12)");
  }
  for (const [typed, saved] of [["1,200", 1200], ["1,200,000", 1200000], ["٣٬٠٠٠", 3000], ["0.5", 0.5], ["12", 12]]) {
    type(value(), typed);
    assert.equal(err.hidden, true, typed + " is a number");
    assert.equal(stored(), saved);
  }
  valid(ctx, "s07", "visual");
});

test("chart: seven values at most; the source is the slide's; the illustrative switch writes and clears its flag", () => {
  const { ctx, chart: editor } = studio();
  const ed = editor("s07");
  for (let i = 0; i < 10; i++) if (!add(ed).disabled) add(ed).click();
  assert.equal(plain(ctx.slide("s07").visual.anchor.chart.values).length, 7);
  assert.equal(add(ed).disabled, true);
  const source = ed.all("select")[0];
  source.value = "src2";
  source.fire("change");
  assert.deepEqual(plain(ctx.slide("s07").sourceIds), ["src2"]);
  const sw = ed.all("input.ui-switch-in")[0];
  sw.checked = true;
  sw.fire("change");
  assert.equal(plain(ctx.slide("s07").visual.anchor.chart).illustrative, true);
  sw.checked = false;
  sw.fire("change");
  assert.equal("illustrative" in plain(ctx.slide("s07").visual.anchor.chart), false);
  valid(ctx, "s07", "visual", "sourceIds");
  assert.ok(ed.textContent.includes("رسم توضيحي"), "the source hint names the tag");
});

test("every edit is one undo step and run twice gives the same bytes", () => {
  const finals = [0, 1].map(() => {
    const { ctx, items: editor } = studio();
    const ed = editor("s02"), before = plain(ctx.spec), steps = ctx.past.length;
    add(ed).click();
    type(areas(rows(ed)[0])[0], "أ");
    assert.equal(ctx.past.length, steps + 2);
    ctx.undo();
    ctx.undo();
    assert.deepEqual(plain(ctx.spec), before);
    add(ed).click();
    type(areas(rows(ed)[0])[0], "أ");
    return JSON.stringify(ctx.spec);
  });
  assert.equal(finals[0], finals[1]);
});
