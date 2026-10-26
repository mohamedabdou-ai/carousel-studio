// tests/unit/js/visual/lookup.test.mjs · the Arabic icon lookup of Carousel Studio 1.1 (spec 3.1, build plan D3).
// root.js, stem.js and icons.js are loaded exactly the way the chunk wraps them, into a fresh Node vm per test group. The data is the
// fixture of tests/icons/lookup-vectors.json (entry 0) plus the real data/icons/stem.json; nothing here needs the icon tool or the vendored
// packages, except the one test that checks the stem.json icon names against the built index (skipped when the tool cannot run).
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const SRC = join(ROOT, "src", "visual");
const DATA = join(ROOT, "plugins", "carousel-studio", "skills", "carousel-design", "data", "icons");
const STEM = JSON.parse(readFileSync(join(DATA, "stem.json"), "utf8"));
const VEC = JSON.parse(readFileSync(join(ROOT, "tests", "icons", "lookup-vectors.json"), "utf8"));
const FX = VEC[0].fixtures.base;
const CASES = VEC.slice(1);

const made = [];
const tmp = () => { const d = mkdtempSync(join(tmpdir(), "cs-lookup-")); made.push(d); return d; };
test.after(() => { for (const d of made) { try { rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ } } });

function wrap(files) {
  const text = files.map((f) => readFileSync(join(SRC, f), "utf8")).join("\n");
  return `(function(){"use strict";var CS=(window.CS=window.CS||{});\n${text}\n})();`;
}
// Results of the vm come back as plain main-realm data (a vm array is not deepStrictEqual to an array of this realm).
const plain = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));
const lift = (o) => Object.fromEntries(Object.entries(o).map(([k, f]) => [k, (...a) => plain(f(...a))]));
function boot(blocks, code = wrap(["root.js", "stem.js", "icons.js"])) {
  const sb = {}; sb.window = sb; vm.createContext(sb);
  vm.runInContext(code, sb);
  const v = sb.CS.visual;
  v._.blocks = blocks;
  return { icons: lift(v.icons), stem: { ...lift({ tok: v._.stem.tok, cands: v._.stem.cands }), norm: v._.stem.norm, fold: v._.stem.fold }, set: (b) => { v._.blocks = b; }, version: v.version };
}
const fixtureBlocks = (extra = {}) => ({ "cs-icon-pack": FX.pack, "cs-icon-index": FX.index, "cs-icon-concepts": FX.concepts, "cs-icon-stem": STEM, ...extra });
const V = boot(fixtureBlocks());
const I = V.icons, S = V.stem;
const names = (r) => r.map((x) => x.name);
const top = (q, o) => I.find(q, { k: 8, ...(o || {}) });
const code = (...n) => String.fromCharCode(...n);

test("the sources are plain ASCII, inside their budgets, and free of anything forbidden", () => {
  const sizes = { "stem.js": 6 * 1024, "icons.js": 12 * 1024 };
  for (const [f, max] of Object.entries(sizes)) {
    const text = readFileSync(join(SRC, f), "utf8");
    assert.ok(Buffer.byteLength(text) <= max, `${f} is ${Buffer.byteLength(text)} B, budget ${max}`);
    assert.ok(!/[^\x09\x0A\x20-\x7E]/.test(text), `${f} holds a non-ASCII character`);
    for (const bad of ["Math.random", "Date", "performance", "analytics", "fetch(", "XMLHttpRequest", "localStorage", "document.write"]) assert.ok(!text.includes(bad), `${f} mentions ${bad}`);
    assert.ok(text.startsWith(`/* src/visual/${f} - owned by D3`));
  }
  assert.ok(statSync(join(DATA, "stem.json")).size <= 10000, "stem.json is over its 10 KB cap");
});

test("the normaliser folds exactly as spec 3.1 says and nothing else", () => {
  const n = (t) => S.norm(t);
  assert.equal(n("السَّاعات"), "الساعات");
  assert.equal(n("ـــمحتـــوى"), "محتوي");
  assert.equal(n("أإآ ى ة ؤ ئ"), "ااا ي ه و ي");
  assert.equal(n("ٱلكتاب"), "الكتاب");
  assert.equal(n("کتاب ڤيديو پيتزا"), "كتاب فيديو بيتزا");
  assert.equal(n("٧٤٪ من الناس ۱۲"), "74 من الناس 12");
  assert.equal(n(`${code(0x200f)}قبل${code(0x200e)} وبعد${code(0x202c)}`), "قبل وبعد");
  assert.equal(n("هوك، كونتنت؛ ريتش؟ (فولورز)"), "هوك كونتنت ريتش فولورز");
  assert.equal(n("Reels HOOK مع ١٢٣"), "reels hook مع 123");
  assert.equal(n("ﻣﺮﺣﺒﺎ ﻻ ﷲ"), "مرحبا لا الله", "presentation forms from a PDF paste");
  assert.equal(n("ا" + code(0x654) + "حمد و" + code(0x654)), "احمد و", "decomposed hamza vanishes with the marks");
  assert.equal(n("１２ ａｂ"), "12 ab", "full-width forms");
  assert.equal(n(""), "");
  assert.equal(n(null), "");
  assert.equal(n("   \n\t"), "");
  for (const t of ["الأفكار", "السَّرّ مش في التَّصميم", "إيه ده؟", "mixed text123 مع أرقام ١٢٣"]) assert.equal(n(n(t)), n(t), `idempotent: ${t}`);
  const tk = S.tok("إيهِ");
  assert.deepEqual([tk[0].n, tk[0].r], ["ايه", "إيه"], "tokens keep the typed letters without marks");
  assert.deepEqual(S.tok("a,b").map((t) => t.n), ["a", "b"]);
});

test("stem candidates: the token first, no repeats, at most 40, three letters kept (two after an article)", () => {
  for (const [t, d] of [["الساعات"], ["بطاقتك"], ["للمصممين"], ["هيشكرك"], ["كيكتب", "mag"], ["والمتابعين"], ["حفظها"], ["اللي"], ["السر"], ["ثواني"], ["مدراء"]]) {
    const c = S.cands(t, d);
    assert.equal(c[0], t);
    assert.equal(new Set(c).size, c.length, `repeats for ${t}`);
    assert.ok(c.length <= 40);
    for (const w of c.slice(1)) assert.ok(w.length >= 3 || (w.length === 2 && /^(?:وال|بال|فال|كال|لل|ال)/.test(t)), `${t} -> ${w}`);
    assert.deepEqual(c, S.cands(t, d), "deterministic");
  }
  assert.deepEqual(S.cands("سر"), ["سر"], "a two-letter word has no candidates");
  assert.deepEqual(S.cands("hooks"), ["hooks", "hook"]);
});

test("the stemmer reaches the forms the spec names", () => {
  const has = (t, w, d) => assert.ok(S.cands(t, d).includes(w), `${t} should reach ${w}: ${S.cands(t, d).join(" ")}`);
  has("ساعات", "ساعه");
  has("بتقرا", "قرا"); has("بتقرا", "اقرا");
  has("هتكتب", "كتب"); has("هتكتب", "اكتب");
  has("حيكتب", "كتب");
  has("بيتحفظ", "حفظ");
  has("هيشكرك", "شكر");
  has("حفظها", "حفظ");
  has("بطاقتك", "بطاقه");
  has("وصفتك", "وصفه");
  has("الافكار", "فكره"); has("نصايح", "نصيحه"); has("اخطاء", "خطا"); has("ثواني", "ثانيه"); has("قنوات", "قناه");
  has("لتوفير", "توفير"); has("والمتابعين", "متابع"); has("للمصممين", "مصمم");
  has("السر", "سر");
  has("اكتبوا", "اكتب");
  has("احذروا", "احذر");
  has("خسارتك", "خساره");
  has("كيكتب", "كتب", "mag");
  assert.deepEqual(S.cands("كيكتب", "eg"), ["كيكتب"], "the Maghrebi progressive prefix is dialect-gated");
  assert.ok(S.cands("كيكتب").includes("كتب"), "and applies when the dialect is unknown");
});

test("the unstripped token leads: بطاقة is a card, never energy; وصفة a recipe, never a trait", () => {
  assert.ok(S.cands("بطاقه").includes("طاقه"), "the collapsing candidate exists");
  assert.equal(I.find("بطاقة")[0].concept, "card");
  assert.deepEqual(I.concepts("بطاقة").map((c) => c.id), ["card"]);
  assert.deepEqual(I.concepts("وصفة").map((c) => c.id), ["recipe"]);
  assert.deepEqual(I.concepts("طاقة").map((c) => c.id), ["energy"]);
  assert.equal(I.concepts("بطاقتك")[0].id, "card", "with a possessive the stem is allowed and still finds the card");
  const own = boot(fixtureBlocks());
  own.icons.find("x");
  assert.equal(own.icons.concepts("وصفتك")[0].id, "recipe");
});

test("the ladder scores are the integers of spec 3.1", () => {
  const one = (q, o) => I.find(q, o)[0];
  let r = one("قبل وبعد"); assert.deepEqual([r.rung, r.score], [1, 35]);
  r = one("طاقة"); assert.deepEqual([r.rung, r.score], [2, 30]);
  r = one("ساعة رملية"); assert.deepEqual([r.name, r.rung, r.score], ["hourglass", 3, 30]);
  r = one("ساعة"); assert.deepEqual([r.name, r.rung, r.score], ["clock", 4, 20]);
  r = one("وقتك"); assert.deepEqual([r.rung, r.score], [5, 22], "a stemmed concept token is 75% of 30");
  r = one("ساعات"); assert.deepEqual([r.name, r.rung, r.score], ["clock", 5, 15], "a stemmed keyword is 75% of 20");
  r = one("وفر وقتنا"); assert.deepEqual([r.concept, r.rung, r.score], ["time-saving", 5, 26], "a stemmed phrase is 75% of 35");
  r = one("clock"); assert.deepEqual([r.name, r.rung, r.score], ["clock", 6, 10]);
  r = one("ده كل اللي في الموضوع", { topic: ["finance"] }); assert.deepEqual([r.name, r.rung, r.score], ["coins", 7, 5]);
  assert.deepEqual(I.find("hourglass timer").map((x) => x.rung), [6, 6]);
});

test("a phrase beats its words: توفير الوقت is time-saving (hourglass), not the coins of saving", () => {
  const r = I.find("توفير الوقت", { dialect: "eg" });
  assert.equal(r[0].concept, "time-saving");
  assert.equal(r[0].name, "hourglass");
  assert.ok(names(r).includes("piggy-bank"), "the single word still ranks lower");
  assert.ok(names(r).indexOf("piggy-bank") > names(r).indexOf("clock"));
  assert.equal(I.concepts("توفير الوقت").map((c) => c.id).join(), "time-saving,saving,time");
});

test("dialect verbs reach their concept: بتقرا, هتكتب, حيكتب, رح يكتب", () => {
  assert.equal(I.concepts("بتقرا", { dialect: "eg" })[0].id, "reading");
  assert.equal(I.concepts("هتكتب", { dialect: "eg" })[0].id, "writing");
  assert.equal(I.concepts("حيكتب", { dialect: "eg" })[0].id, "writing");
  const w = I.concepts("رح يكتب", { dialect: "lev" })[0];
  assert.deepEqual([w.id, w.rung], ["writing", 2]);
  assert.equal(I.concepts("كيكتب", { dialect: "mag" })[0].id, "writing");
  assert.equal(I.concepts("كيكتب", { dialect: "eg" }).length, 0, "the Maghrebi prefix needs the Maghrebi dialect");
  assert.equal(I.concepts("ميتقراش", { dialect: "eg" })[0].id, "reading", "ma + verb + sh is read through");
});

test("a negation puts slash on the concept's own icon and never picks the alert icon", () => {
  const r = I.find("السر مش في التصميم", { dialect: "eg", k: 12 });
  assert.equal(r[0].concept, "design", "the negated concept leads on a tie");
  assert.equal(r[0].neg, true);
  assert.ok(["palette", "pen-tool", "layout-template"].includes(r[0].name));
  assert.ok(!names(r).includes("triangle-alert"), "a negation alone never selects the alert icon");
  const c = I.concepts("السر مش في التصميم", { dialect: "eg" });
  assert.deepEqual(c.map((x) => [x.id, x.neg]), [["design", true], ["secret", false]]);
  assert.deepEqual(I.concepts("ماتشتريش", { dialect: "eg" }).map((x) => [x.id, x.neg]), [["shopping", true]]);
  assert.deepEqual(I.concepts("مفيش وقت", { dialect: "eg" }).map((x) => [x.id, x.neg]), [["time", true]]);
  assert.deepEqual(I.concepts("مش لازم تبقى مصمم", { dialect: "eg" }).map((x) => [x.id, x.neg]), [["designer", true]]);
  assert.deepEqual(I.concepts("لا تنشر قبل ما تراجع", { dialect: "msa" }).map((x) => [x.id, x.neg]), [["publish", true]]);
  assert.deepEqual(I.concepts("التصميم مش مهم", { dialect: "eg" }).map((x) => [x.id, x.neg]), [["design", true]], "no concept after it: the one before");
  assert.equal(I.find("من غير كاميرا", { dialect: "eg" })[0].neg, true, "a keyword icon is bound too");
  assert.equal(I.find("بدون كاميرا", { dialect: "msa" })[0].neg, true);
  assert.equal(I.find("كاميرا")[0].neg, false);
  assert.deepEqual(I.find("مش كده"), [], "a negation with nothing to negate finds nothing");
  assert.equal(I.concepts("ماشي التصميم", { dialect: "eg" })[0].neg, false, "ماشي negates only in the Maghrebi dialect");
  assert.equal(I.concepts("ماشي التصميم", { dialect: "mag" })[0].neg, true);
});

test("structural words become primitives, not icons", () => {
  const c = I.concepts("قبل وبعد")[0];
  assert.deepEqual([c.id, c.primitive, c.rung, c.score], ["before-after", "before-after", 1, 35]);
  assert.equal(I.find("قبل وبعد")[0].primitive, "before-after");
  const v = I.concepts("الكاروسيل ضد الريل");
  assert.equal(v[0].primitive, "versus");
  assert.equal(v[1].id, "carousel");
  assert.equal(I.concepts("قبل وبعد")[0].object, null);
  assert.equal(I.concepts("فولورز")[0].object, "star", "an object rides along");
});

test("homographs resolve by the topic category; with no topic the first sense wins", () => {
  const sense = (topic, q = "عنوان") => I.find(q, { topic })[0];
  assert.equal(sense().concept, "headline", "first sense (the concept that declares home)");
  assert.equal(sense(["creator"]).concept, "headline");
  assert.equal(sense(["education"]).concept, "headline");
  assert.deepEqual([sense(["sales"]).name, sense(["sales"]).concept], ["map-pin", "home:عنوان:1"]);
  assert.equal(sense(["travel", "sales"]).name, "map-pin");
  assert.equal(sense("sales").name, "map-pin", "a string topic works");
  assert.equal(sense(["real-estate"], "العناوين").name, "map-pin", "a plural reaches the same senses");
  assert.equal(sense(["creator"], "العناوين").concept, "headline");
  assert.equal(sense(["sales"], "العنوان").name, "map-pin");
  assert.equal(sense(["unknown-category"]).concept, "headline", "no sense matches: the first");
  assert.equal(sense(["sales", "creator"]).name, "map-pin", "the first topic wins");
  assert.equal(sense(["creator", "sales"]).concept, "headline");
  // without the concept layer the table alone resolves them
  const bare = boot({ ...fixtureBlocks(), "cs-icon-concepts": { concepts: [] } }).icons;
  assert.equal(bare.find("عنوان")[0].name, "type");
  assert.equal(bare.find("عنوان", { topic: ["sales"] })[0].name, "map-pin");
  assert.deepEqual(bare.find("قناة", { topic: ["travel"] }).map((r) => r.rung), [7], "icons the index lacks are never returned: only the topic default is left");
  assert.deepEqual(bare.find("قناة", { topic: ["social"] }).map((r) => r.name), ["heart"]);
  // the topic of a script comes from its concepts, and a homograph does not vote
  assert.deepEqual(I.topic("فلوس وتوفير وعنوان"), ["finance"]);
  assert.deepEqual(I.topic(["الفلوس", { text: "التصميم والكاميرا", w: 60 }]).slice(0, 1), ["finance"]);
  assert.deepEqual(I.topic("في من على"), []);
});

test("polarity: a warning slide takes the flagged icons first, a plain one is untouched", () => {
  const warn = I.find("احذر الغلطة دي في الغلاف", { dialect: "eg" });
  assert.equal(warn[0].name, "triangle-alert");
  assert.ok(names(warn).slice(0, 5).every((n) => ["triangle-alert", "circle-alert", "circle-x", "heart-crack", "thumbs-down"].includes(n)));
  assert.equal(I.concepts("احذر")[0].pol, "warn");
  const mixed = I.find("5 أخطاء بتموّت الكاروسيل", { dialect: "eg", k: 8 });
  assert.equal(mixed[0].name, "triangle-alert", "flagged icons come before the carousel icons");
  assert.ok(names(mixed).includes("gallery-horizontal"));
  assert.ok(names(mixed).indexOf("gallery-horizontal") > names(mixed).indexOf("thumbs-down"));
  assert.ok(!names(I.find("كاروسيل")).includes("triangle-alert"));
  assert.deepEqual(I.concepts("خطا واضح").map((c) => c.id), [], "the bare خطأ is not a warning (it folds like the font خطًا)");
});

test("no repeats: exclude gives the next best, avoidCat prefers another category within five points", () => {
  assert.equal(I.find("توفير الوقت")[0].name, "hourglass");
  assert.equal(I.find("توفير الوقت", { exclude: ["hourglass"] })[0].name, "clock");
  assert.ok(!names(I.find("توفير الوقت", { exclude: ["hourglass", "clock", "timer"], k: 9 })).includes("timer"));
  assert.deepEqual(names(I.find("فلوس", { k: 3 })), ["coins", "wallet", "piggy-bank"]);
  const plain = I.find("الفلوس والمتابعين", { k: 6 });
  assert.equal(plain[0].cat, "finance");
  const avoided = I.find("الفلوس والمتابعين", { k: 6, avoidCat: "finance" });
  assert.notEqual(avoided[0].cat, "finance");
  assert.equal(avoided.length, plain.length);
  const near = I.find("توفير الوقت", { k: 6, avoidCat: "productivity" });
  assert.deepEqual([near[0].name, near[0].cat, near[0].score], ["piggy-bank", "finance", 30], "30 is within 5 points of 35");
  const far = I.find("وقت", { k: 4, avoidCat: "productivity" });
  assert.equal(far[0].name, "clock", "nothing of another category: the order stays");
  const gap = I.find("توفير الوقت", { k: 6, avoidCat: "productivity", exclude: ["hourglass", "clock", "timer"] });
  assert.equal(gap[0].cat, "finance");
  assert.equal(I.find("فلوس", { k: 2 }).length, 2);
  assert.equal(I.find("فلوس").length, 3, "k defaults to 5 and the concept holds three icons");
});

test("hero size takes light icons only; avoid drops flagged ones; an occasion icon needs the slide's own word", () => {
  assert.ok(names(I.find("صاروخ")).includes("rocket"));
  assert.ok(!names(I.find("صاروخ", { hero: true })).includes("rocket"), "a high-detail icon never goes to xl or hero");
  assert.ok(names(I.find("جمهور")).includes("users"));
  assert.ok(!names(I.find("جمهور", { avoid: ["h"] })).includes("users"), "faceless brands drop figure icons");
  assert.ok(!names(I.find("قطة", { avoid: ["a"] })).includes("cat"));
  assert.ok(names(I.find("مسجد")).includes("mosque"), "its own word brings it");
  const withDefault = boot({ ...fixtureBlocks(), "cs-icon-stem": { ...STEM, def: { mena: "mosque coins" } } }).icons;
  assert.deepEqual(names(withDefault.find("في من", { topic: ["mena"] })), ["coins"], "a topic default is never an occasion icon");
});

test("several fields are weighted like the planner does", () => {
  const f = I.find([{ text: "وقتك", w: 100 }, { text: "فلوس", w: 60 }], { k: 6 });
  assert.deepEqual([f[0].name, f[0].score], ["clock", 22]);
  const money = f.find((x) => x.name === "coins");
  assert.equal(money.score, 18, "30 x 60 / 100");
  const swap = I.find([{ text: "وقتك", w: 60 }, { text: "فلوس", w: 100 }], { k: 6 });
  assert.equal(swap[0].name, "coins");
  assert.equal(swap[0].score, 30);
  assert.equal(I.find([{ text: "فلوس", w: 0 }]).length, 0, "a zero weight silences a field");
  assert.equal(I.find(["فلوس", "وقت"], { k: 6 }).length, 6, "plain strings are full-weight fields");
  const c = I.concepts([{ text: "وقتك", w: 100 }, { text: "وقت", w: 60 }]);
  assert.equal(c[0].id, "time");
  assert.equal(c[0].score, 22, "the best hit counts, hits do not add");
});

test("dialect lists break ties: a form of the speaker's own dialect leads", () => {
  assert.equal(I.find("حاجتي", { dialect: "eg" })[0].concept, "thing-eg");
  assert.equal(I.find("حاجتي", { dialect: "gulf" })[0].concept, "thing-gulf");
  assert.equal(I.find("فولورز", { dialect: "lev" })[0].concept, "followers", "loan words count for every dialect");
});

test("explain says why, in the dialect, at most 120 characters, from the words as typed", () => {
  const e = I.explain("hourglass", "توفير الوقت", "eg");
  assert.deepEqual([e.name, e.rung, e.concept], ["hourglass", 1, "time-saving"]);
  assert.equal(e.via, "توفير الوقت");
  assert.ok(e.why.includes("hourglass") && e.why.includes("توفير الوقت") && e.why.startsWith("اخترنا"));
  for (const d of ["eg", "gulf", "lev", "mag", "msa", "xx"]) {
    const w = I.explain("clock", "الساعات بتجري", d).why;
    assert.ok(w.length > 0 && w.length <= 120 && w.includes("clock") && w.includes("الساعات"), `${d}: ${w}`);
  }
  assert.notEqual(I.explain("clock", "وقتك", "eg").why, I.explain("clock", "وقتك", "lev").why, "five dialects, five templates");
  assert.equal(I.explain("rocket", "فلوس", "eg"), null);
  assert.equal(I.find("إيه", { dialect: "eg" }).length, 0);
});

test("has, meta and markup", () => {
  assert.equal(I.has("clock"), true);
  assert.equal(I.has("dot-test"), true);
  assert.equal(I.has("nope"), false);
  assert.equal(I.meta("nope"), null);
  const m = I.meta("triangle-alert");
  assert.deepEqual([m.name, m.cat, m.flags.p, m.flags.d], ["triangle-alert", "arrows-ui", "warn", "l"]);
  assert.ok(m.en.includes("warning"));
  assert.deepEqual(I.meta("clock").f, [1]);
  assert.equal(I.markup("nope"), null);
  assert.equal(I.markup("clock"), '<path d="M12 6v6l4 2"/><path d="M2 12a10 10 0 1 0 20 0 10 10 0 1 0 -20 0z"/>');
  assert.equal(I.markup("clock", { tint: "#ffd166" }), '<path d="M12 6v6l4 2"/><path d="M2 12a10 10 0 1 0 20 0 10 10 0 1 0 -20 0z" fill="#ffd166"/>');
  assert.equal(I.markup("dot-test", { ink: "#111111" }), '<path d="M12 5v8"/><path d="M12 17a1 1 0 1 0 0.01 0z" fill="#111111" stroke="none"/>');
  assert.ok(I.markup("dot-test").includes('fill="currentColor"'));
});

test("the lookup is deterministic and independent of call order and of a fresh context", () => {
  const qs = CASES.filter((c) => c.fx).map((c) => c.in);
  const run = (v) => qs.map((q) => JSON.stringify([v.icons.find(q, { k: 6 }), v.icons.concepts(q)]));
  const a = run(V), b = run(V), fresh = run(boot(fixtureBlocks()));
  assert.deepEqual(a, b);
  assert.deepEqual(a, fresh);
  const reversed = qs.slice().reverse().map((q) => JSON.stringify([V.icons.find(q, { k: 6 }), V.icons.concepts(q)])).reverse();
  assert.deepEqual(a, reversed);
});

test("blocks are cached by identity: new data is seen at once, missing data degrades to nothing", () => {
  const v = boot(fixtureBlocks());
  assert.equal(v.icons.concepts("فلوس")[0].id, "money");
  v.set(fixtureBlocks({ "cs-icon-concepts": { concepts: FX.concepts.concepts.filter((c) => c.id !== "money") } }));
  assert.equal(v.icons.concepts("فلوس").length, 0);
  assert.deepEqual([v.icons.find("كاش")[0].name, v.icons.find("كاش")[0].rung], ["coins", 4], "the keyword of the icon still answers (rung 4)");
  v.set({});
  assert.deepEqual(v.icons.find("فلوس"), []);
  assert.deepEqual(v.icons.concepts("فلوس"), []);
  assert.equal(v.icons.has("clock"), false);
  assert.deepEqual(v.icons.topic("فلوس"), []);
  assert.deepEqual(v.stem.cands("ساعات"), ["ساعات"], "no stem block: no candidates, no error");
  assert.equal(v.icons.find("clock").length, 0);
});

test("a long mixed text is fast and keeps the best hits", () => {
  const text = Array.from({ length: 60 }, (_, i) => ["فلوس", "الوقت", "بتقرا", "هتكتب", "في", "من", "mixed", "123", "الكاروسيل"][i % 9]).join(" ");
  const t0 = process.hrtime.bigint();
  const r = I.find(text, { k: 4 });
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  assert.ok(ms < 500, `${ms} ms`);
  assert.equal(r.length, 4);
});

test("every vector of tests/icons/lookup-vectors.json replays exactly", () => {
  assert.ok(CASES.length >= 60, `${CASES.length} cases`);
  for (const c of CASES) {
    assert.equal(S.norm(c.in), c.norm, `norm ${JSON.stringify(c.in)}`);
    const tk = S.tok(c.in);
    if (c.cands) { assert.equal(tk.length, 1); assert.deepEqual(S.cands(tk[0].n, c.dialect), c.cands, `cands ${JSON.stringify(c.in)}`); }
    if (!c.fx) continue;
    const o = {};
    for (const k of ["dialect", "topic", "exclude", "avoidCat"]) if (c[k] !== undefined) o[k] = c[k];
    const hits = I.find(c.in, { ...o, k: 5 }).map((r) => ({ name: r.name, rung: r.rung, score: r.score, concept: r.concept, neg: r.neg, primitive: r.primitive, via: r.via }));
    assert.deepEqual(hits, c.hits, `hits ${JSON.stringify(c.in)} ${JSON.stringify(o)}`);
    const cs = I.concepts(c.in, o).map((r) => ({ id: r.id, rung: r.rung, score: r.score, neg: r.neg, primitive: r.primitive, pol: r.pol }));
    assert.deepEqual(cs, c.cs, `concepts ${JSON.stringify(c.in)}`);
  }
  const must = ["السَّاعات", "بطاقة", "وصفة", "بتقرا", "هتكتب", "رح يكتب", "قبل وبعد", "عنوان", "السر مش في التصميم", "ماتشتريش"];
  for (const m of must) assert.ok(CASES.some((c) => c.in === m), `vector for ${m}`);
  assert.ok(CASES.every((c) => !("hits" in c) || c.fx === "base"));
});

test("the fixture of the vectors is folded data in the shapes of the icon tool", () => {
  for (const r of FX.index) {
    assert.equal(r.length, 5);
    for (const k of r[3]) assert.equal(S.norm(k), k, `index keyword ${k}`);
  }
  for (const c of FX.concepts.concepts) {
    assert.ok(/^[a-z][a-z0-9-]*$/.test(c.id));
    for (const list of Object.values(c.forms)) for (const f of list) assert.equal(S.norm(f), f, `${c.id} form ${f}`);
    for (const n of c.icons) assert.ok(FX.index.some((r) => r[0] === n), `${c.id} icon ${n}`);
  }
});

test("stem.json: folded words, valid shapes, nothing that collides with a stop word", () => {
  const words = (s) => s.split(" ");
  const folded = (w) => S.fold(w) === w && /^[ء-غف-ي]+$/.test(w);
  for (const k of ["art", "prep", "asp", "per", "suf", "pl"]) for (const w of words(STEM[k])) assert.ok(folded(w.split("@")[0]), `${k}: ${w}`);
  assert.deepEqual(words(STEM.asp).filter((w) => w.includes("@")), ["ك@mag"]);
  const pairs = words(STEM.br).map((p) => p.split(">"));
  assert.ok(pairs.length >= 100, `${pairs.length} broken plurals`);
  const seen = new Set();
  for (const [a, b] of pairs) { assert.ok(folded(a) && folded(b), `${a}>${b}`); assert.notEqual(a, b); assert.ok(!seen.has(a), `duplicate ${a}`); seen.add(a); assert.ok(b.length >= 2); }
  const stop = words(STEM.stop);
  for (const w of stop) assert.ok(folded(w), `stop ${w}`);
  assert.equal(new Set(stop).size, stop.length);
  for (const w of words(STEM.neg)) assert.ok(folded(w.split("@")[0].split("_").join("")), `neg ${w}`);
  for (const w of words(STEM.warn.f)) { assert.ok(folded(w), `warn ${w}`); assert.ok(!stop.includes(w)); }
  assert.ok(!words(STEM.warn.f).includes("خطا") && !words(STEM.warn.f).includes("وهم"), "the ambiguous warning words stay out");
  const homos = Object.keys(STEM.home);
  assert.ok(homos.length >= 20 && homos.length <= 30, `${homos.length} homograph words`);
  for (const [k, senses] of Object.entries(STEM.home)) {
    assert.ok(folded(k), k); assert.ok(!stop.includes(k), `${k} is a stop word`);
    assert.ok(senses.length >= 2 && senses.length <= 3, `${k} has ${senses.length} senses`);
    for (const [cats, icons] of senses) { assert.ok(words(cats).length >= 1); assert.ok(words(icons).length >= 3); }
  }
  for (const w of ["عنوان", "دور", "صفحة", "جملة", "علامة", "رقم", "خط", "سلسلة"]) assert.ok(homos.includes(S.fold(w)), `${w} is a homograph word`);
  assert.deepEqual(Object.keys(STEM.why).sort(), ["eg", "gulf", "lev", "mag", "msa"]);
  for (const t of Object.values(STEM.why)) assert.ok(t.includes("{n}") && t.includes("{w}"));
  assert.ok(!JSON.stringify(STEM).includes("http"));
});

test("stem.json: every icon it names exists in the real index, and the warning icons are flagged", (t) => {
  const out = tmp();
  const r = spawnSync(process.execPath, [join(ROOT, "tools", "build-icons.mjs"), "--out", out, "--no-shards"], { encoding: "utf8", cwd: ROOT });
  if (r.status !== 0 || !existsSync(join(out, "index.json"))) { t.skip(`the icon tool cannot run here (exit ${r.status})`); return; }
  const index = JSON.parse(readFileSync(join(out, "index.json"), "utf8"));
  const byName = new Map(index.map((row) => [row[0], row]));
  const cats = new Set(index.map((row) => row[1]));
  const need = (n, where) => assert.ok(byName.has(n), `${where}: unknown icon ${n}`);
  for (const [k, senses] of Object.entries(STEM.home)) for (const [c, icons] of senses) { for (const n of icons.split(" ")) need(n, k); for (const cat of c.split(" ")) assert.ok(cats.has(cat), `${k}: unknown category ${cat}`); }
  for (const [cat, icons] of Object.entries(STEM.def)) { assert.ok(cats.has(cat), `def: ${cat}`); for (const n of icons.split(" ")) { need(n, `def ${cat}`); assert.ok(!byName.get(n)[4].o, `${n} is an occasion icon`); } }
  for (const n of STEM.warn.i.split(" ")) { need(n, "warn"); assert.ok(byName.get(n)[4].p, `${n} carries a polarity flag`); }
  // the real pack and index load and answer through the same code
  const real = boot({ "cs-icon-pack": JSON.parse(readFileSync(join(out, "pack.json"), "utf8")), "cs-icon-index": index, "cs-icon-concepts": { concepts: [] }, "cs-icon-stem": STEM }).icons;
  assert.equal(real.has("clock"), true);
  assert.ok(real.markup("clock").startsWith("<path d="));
  assert.equal(real.find("عنوان", { topic: ["sales"] })[0].name, "map-pin");
  assert.equal(real.find("احذر")[0].name, "triangle-alert");
  assert.ok(real.find("فلوس").length > 0);
  assert.equal(real.find("clock")[0].name, "clock");
});

test("the Arabic of the why templates passes the orthography lint", (t) => {
  const lint = join(ROOT, "plugins", "carousel-studio", "skills", "arabic-proofread", "scripts", "ortho_lint.py");
  if (!existsSync(lint)) { t.skip("ortho_lint.py is absent"); return; }
  const dialects = { eg: "eg", gulf: "gulf", lev: "levant", mag: "msa-white", msa: "msa-white" };
  for (const [d, tpl] of Object.entries(STEM.why)) {
    const text = tpl.split("{n}").join("clock").split("{w}").join("الوقت");
    const r = spawnSync("python", ["-X", "utf8", lint, "--text", text, "--dialect", dialects[d], "--format", "json"], { encoding: "utf8" });
    if (r.error) { t.skip("python is not available"); return; }
    const report = JSON.parse(r.stdout);
    assert.equal(report.summary.counts.BLOCK + report.summary.counts.FIX, 0, `${d}: ${text} ${JSON.stringify(report.issues)}`);
  }
});

test("the built chunk publishes the same lookup (node tools/build.mjs --module visual)", () => {
  const out = tmp();
  const r = spawnSync(process.execPath, [join(ROOT, "tools", "build.mjs"), "--module", "visual", "--out", out], { encoding: "utf8", cwd: ROOT });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const chunk = readFileSync(join(out, "cs-visual.js"), "utf8");
  assert.ok(Buffer.byteLength(chunk) <= 190 * 1024, "inside the CI ceiling");
  const v = boot(fixtureBlocks(), chunk);
  assert.equal(typeof v.icons.find, "function");
  assert.equal(JSON.stringify(v.icons.find("توفير الوقت", { k: 4 })), JSON.stringify(I.find("توفير الوقت", { k: 4 })));
  assert.equal(v.version, "1.1.0");
});

test("run-accept.mjs reads a corpus, filters it and reports (a tiny corpus over the fixture data)", () => {
  const dir = tmp();
  writeFileSync(join(dir, "pack.json"), JSON.stringify(FX.pack));
  writeFileSync(join(dir, "index.json"), JSON.stringify(FX.index));
  writeFileSync(join(dir, "concepts.json"), JSON.stringify(FX.concepts));
  const corpus = [
    { id: "t-1", dialect: "eg", slice: "H1", title: "وفر وقتك", body: "", accept: ["hourglass", "clock"], acceptObject: [], primitive: null, noIcon: false, tags: [] },
    { id: "t-2", dialect: "eg", slice: "H1", title: "السر مش في التصميم", body: "", accept: ["palette"], acceptObject: [], primitive: null, noIcon: false, tags: ["negation", "neg:slash"] },
    { id: "t-3", dialect: "gulf", slice: "H2", title: "عنوان المكتب", body: "", accept: ["map-pin"], acceptObject: [], primitive: null, noIcon: false, tags: ["homograph", "topic:sales"] },
    { id: "t-4", dialect: "msa", slice: "H2", title: "قبل وبعد", body: "", accept: ["nothing"], acceptObject: [], primitive: "before-after", noIcon: false, tags: [] },
    { id: "t-5", dialect: "lev", slice: "H2", title: "استنى شوي", body: "في شي كمان", accept: [], acceptObject: [], primitive: null, noIcon: true, tags: ["noicon"] },
    { id: "t-6", dialect: "mag", slice: "H1", title: "ريل", body: "", accept: ["camera"], acceptObject: [], primitive: null, noIcon: false, tags: [] },
    { id: "t-7", dialect: "mag", slice: "H2", title: "ريل", body: "", accept: ["camera"], acceptObject: [], primitive: null, noIcon: false, tags: [] }
  ];
  const file = join(dir, "corpus.json");
  writeFileSync(file, JSON.stringify(corpus));
  const run = (...a) => spawnSync(process.execPath, [join(ROOT, "tests", "icons", "run-accept.mjs"), "--file", file, "--data", dir, "--format", "json", ...a], { encoding: "utf8", cwd: ROOT });
  let r = run();
  assert.equal(r.status, 0, r.stderr);
  let rep = JSON.parse(r.stdout);
  assert.equal(rep.slides, 7);
  assert.equal(rep.overall.pass, 5, JSON.stringify(rep.misses));
  assert.deepEqual(rep.misses.map((m) => m.id), ["t-6"], "a miss on slice H2 is counted but never listed");
  assert.deepEqual([rep.missCount, rep.hiddenMisses], [2, 1]);
  assert.equal(rep.subsets.homograph.rate, 100);
  assert.equal(rep.subsets.noIcon.rate, 100);
  assert.equal(rep.subsets.primitive.rate, 100);
  assert.equal(rep.negationSlashOnTop1.rate, 100);
  assert.deepEqual(Object.keys(rep.byDialect), ["eg", "gulf", "lev", "mag", "msa"]);
  rep = JSON.parse(run("--slice", "H2").stdout);
  assert.equal(rep.slides, 4);
  assert.deepEqual([rep.overall.pass, rep.missCount, rep.misses.length], [3, 1, 0]);
  rep = JSON.parse(run("--dialect", "eg").stdout);
  assert.equal(rep.slides, 2);
  r = run("--gate");
  assert.equal(r.status, 2, "gates fail on this tiny corpus (mag is 0%)");
  assert.ok(JSON.parse(r.stdout).gate.failed.some((m) => m.startsWith("mag")));
  r = spawnSync(process.execPath, [join(ROOT, "tests", "icons", "run-accept.mjs"), "--file", file, "--data", dir, "--misses", "all"], { encoding: "utf8", cwd: ROOT });
  assert.equal(r.status, 0);
  assert.ok(r.stdout.includes("overall") && r.stdout.includes("t-6") && !r.stdout.includes("t-7") && r.stdout.includes("1 on slice H2, never listed"));
  assert.equal(spawnSync(process.execPath, [join(ROOT, "tests", "icons", "run-accept.mjs"), "--corpus", "nope"], { encoding: "utf8" }).status, 64);
  assert.equal(spawnSync(process.execPath, [join(ROOT, "tests", "icons", "run-accept.mjs"), "--help"], { encoding: "utf8" }).status, 0);
  // the same run twice prints the same bytes
  assert.equal(run().stdout, run().stdout);
});

test("odd inputs never throw", () => {
  for (const q of [undefined, null, 0, "", " ", [], [""], [null], [{ text: undefined }], [{ text: "فلوس" }], "123 456", "\u0000\u0001", "a".repeat(5000)]) {
    assert.doesNotThrow(() => { I.find(q); I.concepts(q); I.topic(q); }, JSON.stringify(q));
  }
  assert.deepEqual(I.find([]), []);
  assert.deepEqual(I.find([{ text: "فلوس" }], { k: 1 }).map((r) => r.name), ["coins"]);
  assert.doesNotThrow(() => I.find("فلوس", { topic: null, exclude: null, avoid: null, k: -3, dialect: "zz" }));
  assert.deepEqual(I.find("فلوس", { k: 0 }).length, 3, "a bad k falls back to 5");
  assert.equal(I.find("constructor __proto__ toString").length, 0, "prototype names are not words");
});

test("cue words choose the sense inside one category and against the deck topic", () => {
  const one = (q, topic, d = "eg") => I.find(q, { topic, dialect: d })[0];
  assert.equal(one("خط ايدك", ["creator"]).concept, "home:خط:2", "handwriting, though a font is the first creator sense");
  assert.equal(one("خط صغير", ["creator"]).concept, "home:خط:0");
  assert.equal(one("اكتب عنوان التوصيل صح", ["creator"]).concept, "home:عنوان:1", "a delivery address in a creator deck");
  assert.equal(one("عنوان بوستك", ["sales"]).concept, "headline", "a cue found through a possessive: post + your");
  assert.equal(one("دورك في الفريق", []).concept, "home:دور:0");
  assert.equal(one("جه دورك", ["business"]).concept, "home:دور:1", "the cue beats the business topic that would give a role");
  assert.equal(one("الدور الثالث في العمارة", []).concept, "home:دور:2");
  assert.equal(one("اشتري بالجملة", []).concept, "shopping");
  assert.deepEqual(I.concepts("اشتري بالجملة").map((c) => c.id), ["shopping", "home:جمله:1"], "wholesale, not a sentence");
  assert.deepEqual(I.concepts("جملة قصيرة وكلمات", { topic: ["sales"] }).map((c) => c.id), ["home:جمله:0"], "two cues for the sentence beat the sales topic");
  // the picker itself: most cues, then the topic, then the first
  const sb = boot(fixtureBlocks());
  void sb;
  const senses = STEM.home[S.fold("جملة")];
  assert.equal(senses.length, 2);
  assert.ok(senses.every((s) => s.length === 3 && s[2].split(" ").every((w) => S.fold(w) === w)), "cue words are folded");
});
