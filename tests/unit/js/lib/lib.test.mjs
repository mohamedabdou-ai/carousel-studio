// tests/unit/js/lib/lib.test.mjs · the library half of cs-core.js (src/lib): canon, patch, colour, schema, text.
// Run: node --test tests/unit/js/lib/
// The Python twin (scripts/_cs) is held to the same verdicts by tests/conformance/run_js.mjs + run_py.py.
import test from "node:test";
import assert from "node:assert/strict";
import { loadLib, readJson } from "./load-lib.mjs";

const CS = loadLib();
const { canon, patch, color, schema, text } = CS.core;
/* The library runs in its own realm (a vm context), so its arrays and objects have other prototypes: compare plain JSON. */
const plain = (v) => JSON.parse(JSON.stringify(v === undefined ? null : v));
const eq = (actual, expected, message) => assert.deepEqual(plain(actual), plain(expected), message);

/* ---- root ---------------------------------------------------------------------------------------------------- */

test("CSError carries a code and a detail; the event bus delivers, unsubscribes and survives a throwing listener", () => {
  const e = new CS.CSError("E_SCHEMA", "bad", { path: "/x" });
  assert.equal(e.code, "E_SCHEMA");
  assert.equal(e.message, "bad");
  eq(e.detail, { path: "/x" });
  assert.equal(e.name, "CSError");
  const seen = [];
  const off = CS.on("t:x", (d) => seen.push(d));
  CS.on("t:x", () => { throw new Error("listener failure"); });
  CS.emit("t:x", 1);
  off();
  CS.emit("t:x", 2);
  eq(seen, [1]);
  let once = 0;
  CS.once("t:once", () => once++);
  CS.emit("t:once"); CS.emit("t:once");
  assert.equal(once, 1);
});

test("format fills {name} placeholders and leaves unknown ones alone", () => {
  assert.equal(CS.core.format("{a} من {b} و{c}", { a: 3, b: 8 }), "3 من 8 و{c}");
});

/* ---- canon --------------------------------------------------------------------------------------------------- */

test("canonicalJSON sorts keys, drops whitespace, normalises to NFC and escapes minimally", () => {
  assert.equal(canon.canonicalJSON({ b: 1, a: [true, null, "x"] }), '{"a":[true,null,"x"],"b":1}');
  assert.equal(canon.canonicalJSON("é"), '"é"');
  assert.equal(canon.canonicalJSON('a"b\\c\n\u0001'), '"a\\"b\\\\c\\n\\u0001"');
  assert.equal(canon.canonicalJSON("الكاروسيل"), '"الكاروسيل"');
  assert.equal(canon.canonicalJSON({ x: undefined, y: 2 }), '{"y":2}');
});

test("numbers: integral floats print as integers, -0 as 0, out-of-range values are errors", () => {
  assert.equal(canon.canonicalJSON([3.0, -0, 0.25, 1e20, 0.000001]), "[3,0,0.25,100000000000000000000,0.000001]");
  for (const bad of [NaN, Infinity, 1e21, 1e-7]) assert.throws(() => canon.canonicalJSON(bad), (e) => e.code === "E_SCHEMA");
});

test("fnv1a64 matches the published FNV-1a 64-bit vectors", () => {
  assert.equal(canon.fnv1a64(""), "cbf29ce484222325");
  assert.equal(canon.fnv1a64("a"), "af63dc4c8601ec8c");
  assert.equal(canon.fnv1a64("foobar"), "85944171f73967e8");
});

test("fnv1a64 agrees with a BigInt reference on UTF-8 text", () => {
  const reference = (s) => {
    let h = 0xcbf29ce484222325n;
    for (const b of new TextEncoder().encode(s)) { h ^= BigInt(b); h = (h * 0x100000001b3n) & 0xffffffffffffffffn; }
    return h.toString(16).padStart(16, "0");
  };
  for (const s of ["الكاروسيل", "😀 emoji", "x".repeat(1000), JSON.stringify(readJson("tests/fixtures/spec.eg.8slides.json"))]) assert.equal(canon.fnv1a64(s), reference(s));
});

test("brandSnapshot leaves out what changes on every save; hashable leaves out the derived token fields", () => {
  const brand = { slug: "b", updatedAt: "x", createdAt: "y", ext: { a: 1 }, onboarding: { s: 1 }, hooks: { history: [1], approved: [] }, visual: { logo: { dataUri: "data:...", alt: "l" } } };
  eq(canon.brandSnapshot(brand), { slug: "b", hooks: { approved: [] }, visual: { logo: { alt: "l" } } });
  eq(canon.hashable({ presetId: "swiss", provenance: {}, adjustments: [], css: {}, hash: "x" }), { presetId: "swiss" });
  assert.equal(brand.updatedAt, "x", "the input is never modified");
});

/* ---- patch --------------------------------------------------------------------------------------------------- */

test("patch.apply returns a new document, supports add/remove/replace/test and appends with '-'", () => {
  const doc = { a: [1, 2], b: { c: 1 } };
  const out = patch.apply(doc, [
    { op: "add", path: "/a/-", value: 3 }, { op: "add", path: "/a/0", value: 0 }, { op: "remove", path: "/a/1" },
    { op: "replace", path: "/b/c", value: 2 }, { op: "add", path: "/b/d~1e", value: true }, { op: "test", path: "/b/c", value: 2 }
  ]);
  eq(out, { a: [0, 2, 3], b: { c: 2, "d/e": true } });
  eq(doc, { a: [1, 2], b: { c: 1 } });
});

test("a failing test or a vanished path is E_CONFLICT; a malformed operation is E_USAGE", () => {
  assert.throws(() => patch.apply({ rev: 2 }, [{ op: "test", path: "/rev", value: 1 }]), (e) => e.code === "E_CONFLICT");
  assert.throws(() => patch.apply({}, [{ op: "replace", path: "/x", value: 1 }]), (e) => e.code === "E_CONFLICT");
  assert.throws(() => patch.apply({}, [{ op: "move", path: "/x" }]), (e) => e.code === "E_USAGE");
});

test("diff then apply reproduces the target; envelope puts a test on /rev first", () => {
  const a = readJson("tests/fixtures/spec.eg.8slides.json");
  const b = JSON.parse(JSON.stringify(a));
  b.slides[2].title = "عنوان جديد"; b.slides.splice(4, 1); b.slides.push({ id: "s09" }); delete b.compat; b.rev = 2;
  const ops = patch.diff(a, b);
  assert.equal(canon.hash(patch.apply(a, ops)), canon.hash(b));
  const env = patch.envelope(a, ops.slice(0, 1));
  assert.equal(env.carouselStudioPatch, 1);
  assert.equal(env.baseRev, a.rev);
  eq(env.patch[0], { op: "test", path: "/rev", value: a.rev });
});

/* ---- colour -------------------------------------------------------------------------------------------------- */

test("contrast and luminance follow WCAG", () => {
  assert.equal(color.contrast("#000000", "#FFFFFF").toFixed(2), "21.00");
  assert.equal(color.contrast("#777777", "#FFFFFF").toFixed(2), "4.48");
  assert.equal(color.luminance("#FFFFFF"), 1);
  assert.equal(color.onColor("#E3262B"), "#FFFFFF");
  assert.equal(color.onColor("#FFD23F"), "#111111");
});

test("hex parsing, upper-case output and OKLCH round trip", () => {
  eq(color.parse("#abc"), { r: 170, g: 187, b: 204 });
  assert.equal(color.toHex({ r: 227, g: 38, b: 43 }), "#E3262B");
  for (const hex of ["#E3262B", "#133B31", "#4F46E5", "#FFD23F"]) assert.equal(color.fromOklch(color.toOklch(hex)), hex);
});

test("mix is linear-light and ensureContrast moves lightness only", () => {
  assert.equal(color.mix("#000000", "#FFFFFF", 0), "#000000");
  assert.equal(color.mix("#000000", "#FFFFFF", 1), "#FFFFFF");
  assert.equal(color.mix("#000000", "#FFFFFF", 0.5), "#BCBCBC");
  const r = color.ensureContrast("#E8B05C", "#1F5A47", 4.5);
  assert.equal(r.changed, true);
  assert.ok(color.contrast(r.hex, "#1F5A47") >= 4.5);
  const before = color.toOklch("#E8B05C"), after = color.toOklch(r.hex);
  assert.ok(Math.abs(before.h - after.h) < 4, "the hue is kept");
  eq(color.ensureContrast("#111111", "#F4F4F2", 4.5), { hex: "#111111", changed: false, steps: 0 });
});

/* ---- schema -------------------------------------------------------------------------------------------------- */

const KINDS = ["brand", "spec", "preset", "occasion", "hook", "plan", "qa-report"];
KINDS.forEach((k) => schema.register(k, readJson(`plugins/carousel-studio/skills/carousel-design/schemas/${k}.schema.json`)));

test("every example document validates against its schema and no schema uses a keyword outside the subset", () => {
  for (const k of KINDS) {
    const r = schema.validate(k, readJson(`docs/examples/${k}.example.json`));
    eq(r.errors, [], k);
    eq(schema.unsupportedKeywords(readJson(`plugins/carousel-studio/skills/carousel-design/schemas/${k}.schema.json`)), [], k);
  }
});

test("errors carry a JSON pointer, the keyword and are sorted by path then keyword", () => {
  const spec = readJson("docs/examples/spec.example.json");
  spec.rev = 0; spec.slides[0].type = "nope"; spec.zz = 1; delete spec.brand;
  const errs = schema.validate("spec", spec).errors;
  eq(errs.map((e) => [e.path, e.keyword]), [["/brand", "required"], ["/rev", "minimum"], ["/slides/0/type", "enum"], ["/zz", "additionalProperties"]]);
});

test("integer accepts 3.0 and rejects booleans; lengths count code points; patterns are anchored by the schema", () => {
  const sc = { type: "object", properties: { n: { type: "integer" }, s: { type: "string", maxLength: 2 }, id: { type: "string", pattern: "^s[0-9]{2}$" } } };
  assert.equal(schema.validateAgainst(sc, { n: 3.0 }).ok, true);
  assert.equal(schema.validateAgainst(sc, { n: true }).ok, false);
  assert.equal(schema.validateAgainst(sc, { s: "😀😀" }).ok, true);
  assert.equal(schema.validateAgainst(sc, { s: "😀😀😀" }).ok, false);
  assert.equal(schema.validateAgainst(sc, { id: "s01\n" }).ok, false, "a trailing newline does not match $");
});

test("oneOf yields one error, $ref resolves, a hook library validates through its def", () => {
  const sc = { oneOf: [{ type: "string" }, { type: "integer" }] };
  assert.equal(schema.validateAgainst(sc, 1.5).errors.length, 1);
  const lib = { schemaVersion: 1, kind: "hook-library", language: "ar", visibility: "public", entries: [] };
  assert.equal(schema.validate("hook-library", lib).ok, true);
  assert.equal(schema.validate("hook", lib, { def: "library" }).ok, true);
  assert.throws(() => schema.validate("nope", {}), (e) => e.code === "E_USAGE");
});

/* ---- text ---------------------------------------------------------------------------------------------------- */

test("the tokenizer follows the contract: kinds, offsets in code points, LTR flags", () => {
  const toks = text.tokenize("اشترك في @mohamed.abdou90 😀 بـ$20");
  eq(toks.filter((t) => t.kind !== "space").map((t) => [t.kind, t.text]), [["ar", "اشترك"], ["ar", "في"], ["handle", "@mohamed.abdou90"], ["emoji", "😀"], ["ar", "بـ"], ["number", "$20"]]);
  assert.equal(toks[toks.length - 1].end, Array.from("اشترك في @mohamed.abdou90 😀 بـ$20").length);
  assert.equal(toks.find((t) => t.kind === "handle").ltr, true);
  assert.equal(text.tokenize("١٢٣")[0].ltr, false);
});

test("clarified edges: an e-mail stays one token, a handle and a hashtag give back the sentence's punctuation", () => {
  eq(text.tokenize("john.doe@x.com").map((t) => t.kind), ["email"]);
  eq(text.tokenize("@me. #AI،").map((t) => [t.kind, t.text]).filter((x) => x[0] !== "space"), [["handle", "@me"], ["punct", "."], ["tag", "#AI"], ["punct", "،"]]);
  assert.equal(text.tokenize("example.com/ar")[0].kind, "url");
});

test("the shared bidi fixtures: tokens, word counts and digit systems (tests/fixtures/bidi-strings.json)", () => {
  for (const c of readJson("tests/fixtures/bidi-strings.json").cases) {
    const got = text.tokenize(c.text).filter((t) => t.kind !== "space").map((t) => [t.kind, t.text]);
    eq(got, c.expect.tokens, c.id + " tokens");
    assert.equal(text.wordCount(c.text), c.expect.words, c.id + " words");
    assert.equal(text.digits.detect(c.text), c.expect.digits, c.id + " digits");
  }
});

test("wordCount: markup stripped, clitics and glued Latin are one word, punctuation and emoji alone are not words", () => {
  assert.equal(text.wordCount("==الذكاء== الاصطناعي في ChatGPT Plus"), 5);
  assert.equal(text.wordCount("وبالمنتج لـChatGPT … — 😀"), 2);
  assert.equal(text.wordCount("5 ساعات"), 2);
  assert.equal(text.charCount("é😀"), 2);
});

test("parseMarkup: one emphasis span, never across a newline, unmatched markers are literal", () => {
  eq(text.parseMarkup("a ==b c== d"), { plain: "a b c d", spans: [{ start: 2, end: 5 }], breaks: [] });
  eq(text.parseMarkup("==a\nb==").spans, []);
  assert.equal(text.parseMarkup("x == y").plain, "x == y");
  eq(text.parseMarkup("سطر\nآخر").breaks, [3]);
  assert.equal(text.stripMarkup("أ\nب"), "أ ب");
});

test("toHTML reproduces the example of CONTRACT 3.3 (the space before 'شهريًا' is a no-break space)", () => {
  const html = text.toHTML("==الذكاء== الاصطناعي في ChatGPT Plus بـ$20 شهريًا");
  const expected =
    '<mark class="cs-em" data-m="em"><span class="w" data-w="0">الذكاء</span></mark> <span class="w" data-w="1">الاصطناعي</span> <span class="w" data-w="2">في</span> ' +
    '<bdi dir="ltr" class="cs-ltr" data-run="latin"><span class="w" data-w="3">ChatGPT</span> <span class="w" data-w="4">Plus</span></bdi> ' +
    '<span class="w" data-w="5">بـ<bdi dir="ltr" class="cs-ltr" data-run="number">$20</bdi></span> <span class="w" data-w="6">شهريًا</span>';
  assert.equal(html, expected);
});

test("toHTML: digits follow the post's system, emphasis wraps whole words, English needs no isolation", () => {
  assert.equal(text.toHTML("الخطوة 3 من 8", { digits: "arabic-indic", markup: false, wordSpans: false }), "الخطوة ٣ من ٨");
  assert.match(text.toHTML("جرّب ==ChatGPT Plus== اليوم"), /<mark class="cs-em" data-m="em"><bdi dir="ltr" class="cs-ltr" data-run="latin">/);
  assert.equal(text.toHTML("Stop ==now==", { lang: "en" }), '<span class="w" data-w="0">Stop</span> <mark class="cs-em" data-m="em"><span class="w" data-w="1">now</span></mark>');
  assert.equal(text.toHTML("أ\nب", { wordSpans: false }), "أ<br>ب");
  assert.match(text.toHTML("سلام", { kashidaWord: "سلام", allowKashida: true }), /class="w cs-kashida"[^>]*>سـ{3}لام</);
  assert.equal(text.toHTML("سلام", { kashidaWord: "سلام" }), '<span class="w" data-w="0">سلام</span>', "kashida only where the preset allows");
});

test("bind and digits: bindings, conversion, detection, counters", () => {
  assert.equal(text.bind("5 ساعات و الخطوة 3 و رقم 7"), "5 ساعات و الخطوة 3 و رقم 7");
  assert.equal(text.digits.convert("1,200 و 3.5 و 50%", "arabic-indic"), "١٬٢٠٠ و ٣٫٥ و ٥٠٪");
  assert.equal(text.digits.convert("٣٫٥ و ٥٠٪", "western"), "3.5 و 50%");
  assert.equal(text.digits.convert("GPT4 و 4K و @u2 و 5", "arabic-indic"), "GPT4 و 4K و @u2 و ٥");
  assert.equal(text.digits.detect("5 و ٥"), "mixed");
  assert.equal(text.digits.detect("۵"), "persian");
  assert.equal(text.digits.detect("GPT4"), "none");
  assert.equal(text.digits.counter(3, 8, "arabic-indic", "ar"), "٣ من ٨");
  assert.equal(text.digits.counter(3, 8, "western", "en"), "3/8");
  assert.equal(text.digits.remaining(2, "western", "ar"), "باقي 2");
});

test("similarity: Dice over trigram skeletons; hamza, ya, ta marbuta, tashkeel and digit systems are folded", () => {
  assert.equal(text.similarity("", ""), 1);
  assert.equal(text.similarity("a", ""), 0);
  assert.equal(text.similarity("إنشاء", "انشاء"), 1);
  assert.equal(text.similarity("٣ نصائح", "3 نصائح"), 1);
  assert.equal(text.skeleton("مَدْرَسَة!"), "مدرسه");
  assert.ok(text.similarity("5 أخطاء بتموّت الكاروسيل", "مشكلة كاروسيلك غالبا مش في الألوان") < 0.3);
});

test("Arabic helpers: joining types, kashida positions and the single best insertion", () => {
  const jt = text.arabic.joiningType;
  eq(["ب", "ا", "ء", "ـ", "َ"].map((c) => jt(c.codePointAt(0))), ["D", "R", "U", "C", "T"]);
  assert.equal(text.arabic.kashida.apply("سلام"), "ســـلام");
  assert.equal(text.arabic.kashida.apply("نشر"), "نشـــر", "after شين before نون");
  assert.equal(text.arabic.kashida.apply("دار"), "دار", "nothing joins");
  assert.equal(text.arabic.kashida.apply("لا"), "لا", "fewer than three letters");
  assert.equal(text.arabic.hasArabic("abc ب"), true);
  assert.equal(text.arabic.hasTashkeel("مَرحبا"), true);
});

test("slideText reads a slide in reading order with markup removed and digits converted", () => {
  const slide = { type: "stat", number: { value: "74", unit: "%" }, title: "من ==الناس==", body: "نص", bullets: ["أ"], bridge: "جسر" };
  eq(text.slideText(slide), ["74%", "من الناس", "نص", "أ", "جسر"]);
  eq(text.slideText(slide, "arabic-indic")[0], "٧٤٪");
});
