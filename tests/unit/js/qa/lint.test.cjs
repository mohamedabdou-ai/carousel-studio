"use strict";
/* CS.qa.lintText: ortho.json rules, the built-in Arabic checks and dialect markers. */

const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./support/env.cjs");

const { CS } = load();
const plain = (v) => JSON.parse(JSON.stringify(v));
const lint = (text, opts) => plain(CS.qa.lintText(text, Object.assign({ dialect: "eg" }, opts || {})));
const byCheck = (issues, id) => issues.filter((i) => i.rule === id);
const NBSP = "\u00A0";

// ortho.json rule ids come from B8's data; look them up by the check each one wraps.
const ortho = load().bundle.ortho;
const ruleOf = (check) => (ortho.rules.find((r) => r.kind === "check" && r.check === check) || {}).id;

function expectIssue(text, check, expectFix) {
  const id = ruleOf(check);
  assert.ok(id, "ortho.json has a rule for " + check);
  const hits = byCheck(lint(text), id);
  assert.ok(hits.length > 0, check + " on " + JSON.stringify(text));
  if (expectFix !== undefined) assert.equal(hits[0].fix, expectFix);
  return hits;
}

test("space before and missing space after Arabic punctuation", () => {
  expectIssue("مرحبا ، كيف حالك", "space-before-punct", "");
  expectIssue("مرحبا،كيف حالك", "missing-space-after-punct", "، ");
});

test("Latin punctuation inside Arabic is replaced", () => {
  expectIssue("ازاي? ده سؤال", "latin-punct-in-arabic", "؟");
  assert.equal(byCheck(lint("what? ازاي"), ruleOf("latin-punct-in-arabic")).length, 0, "Latin context keeps its punctuation");
});

test("digits glued to Arabic words get a space", () => {
  const hits = expectIssue("3000سعرة في اليوم", "digit-glued-to-word");
  assert.equal(hits[0].fix, "0 س");
  assert.equal(byCheck(lint("خلّي ال5 " + "ثابتة"), ruleOf("digit-glued-to-word")).length > 0, true);
  assert.equal(lint("بـ5 دقايق").filter((i) => i.rule === ruleOf("digit-glued-to-word")).length, 0, "the prefix form بـ5 is allowed");
});

test("double spaces, ellipsis dots and repeated punctuation", () => {
  expectIssue("كلمة  كلمة", "double-space", " ");
  expectIssue("استنى... هقولك", "ellipsis-dots", "…");
  expectIssue("ايه ده؟؟ مش معقول!!", "repeated-punct");
  assert.equal(byCheck(lint("رابط https://a.example.com/x... طويل"), ruleOf("ellipsis-dots")).length, 0, "URLs are left alone");
});

test("Persian letters and digits, Latin prefixes stranded from their word", () => {
  expectIssue("كتاب کی", "persian-letters");
  expectIssue("استخدم لـ ChatGPT", "lam-latin-stranded", "");
  assert.equal(byCheck(lint("استخدم لـChatGPT"), ruleOf("lam-latin-stranded")).length, 0);
});

test("ordinary number/noun spaces are accepted; layout owns binding", () => {
  for (const text of ["وفر 5 ساعات", "وفر 5" + NBSP + "ساعات", "اقرأ الخطوة 3 الآن"]) {
    assert.equal(byCheck(lint(text), ruleOf("number-noun-unbound")).length, 0);
  }
});

test("tatweel is flagged unless it stretches the kashida word or joins a Latin word", () => {
  expectIssue("كلمـــة", "programmatic-tatweel", "");
  assert.equal(byCheck(lint("المـــصمم", { kashidaWord: "المصمم" }), ruleOf("programmatic-tatweel")).length, 0);
  assert.equal(byCheck(lint("لـChatGPT"), ruleOf("programmatic-tatweel")).length, 0);
});

test("emoji at the edge of an Arabic line is a NOTE-level issue", () => {
  expectIssue("🔥 كلمة", "emoji-edge");
  assert.equal(byCheck(lint("كلمة 🔥 كلمة"), ruleOf("emoji-edge")).length, 0);
});

test("dialect deny and warn markers follow the dialect and the allow list", () => {
  assert.ok(lint("شنو كده", { dialect: "eg" }).some((i) => i.rule === "deny-marker"));
  assert.equal(lint("شنو كده", { dialect: "gulf" }).some((i) => i.rule === "deny-marker"), false);
  assert.equal(lint("شنو كده", { dialect: "eg", allow: ["شنو"] }).some((i) => i.rule === "deny-marker"), false);
  const warn = lint("لماذا نحتاج هذا", { dialect: "eg" }).filter((i) => i.rule === "warn-marker");
  assert.ok(warn.length > 0);
  assert.equal(warn[0].fix, "ليه");
});

test("ordinary words are never flagged as another dialect or split into clitic + stem", () => {
  const ruleIds = (text, dialect) => lint(text, { dialect }).filter((i) => /deny-marker|ortho|warn-marker/.test(i.rule)).map((i) => i.rule + ":" + i.original);
  // «دول» is the plural of «دولة» in every register, not only the Egyptian demonstrative
  for (const dialect of ["msa-white", "gulf", "levant", "eg"]) {
    for (const text of ["أفضل دول الخليج للاستثمار", "الأردن من أرخص دول المنطقة", "دول مجلس التعاون"]) {
      assert.equal(lint(text, { dialect }).some((i) => i.rule === "deny-marker"), false, dialect + " | " + text);
    }
  }
  // «مو» may be a name; it is advice in an Egyptian post, never a block
  assert.equal(lint("مو صلاح لاعب كبير", { dialect: "eg" }).some((i) => i.rule === "deny-marker"), false);
  // كانت، كانا، باين، بانت are words of their own: no «ك/ب + أنت/أنا/أين» hamza split
  for (const dialect of ["msa-white", "gulf", "levant", "eg"]) {
    for (const text of ["كانت النتيجة مختلفة", "كانا في الطريق", "باين عليه التعب", "بانت الحقيقة"]) {
      assert.deepEqual(ruleIds(text, dialect).filter((x) => /hamza/i.test(x)), [], dialect + " | " + text);
    }
  }
  // the real slips are still found, with the connecting letters و ف allowed in front
  assert.ok(lint("انا وانت", { dialect: "msa-white" }).some((i) => i.fix === "أنا") && lint("انا وانت", { dialect: "msa-white" }).some((i) => i.fix === "وأنت"));
});

test("a number after a one-letter prefix takes the connector, never a stranded space", () => {
  const glued = (text) => lint(text).filter((i) => i.rule === ruleOf("digit-glued-to-word"));
  assert.equal(glued("و12 تفاعل").length, 0, "«و12» is ordinary Arabic");
  assert.equal(glued("في5 دقايق").length > 0, true, "a real word glued to a digit is still reported");
  const hits = glued("ب5 دقايق");
  assert.equal(hits.length, 1);
  assert.equal(hits[0].fix, "بـ5");
});

test("matching ignores tashkeel and tatweel but not hamza", () => {
  const w = CS.qa.lintText("لِمَاذَا نحتاج", { dialect: "eg" });
  assert.ok(plain(w).some((i) => i.rule === "warn-marker"), "diacritics do not hide a word");
});

test("a text with nothing to report returns an empty list", () => {
  assert.deepEqual(lint("مرحبا بكم في كاروسيل ستوديو"), []);
  assert.deepEqual(lint(""), []);
});
