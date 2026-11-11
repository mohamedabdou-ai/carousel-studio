"use strict";
/* CS.qa API surface: summarize, override, autofix, report, rules, describe,
 * sevenErrors and the qa-rules.json invariants. */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { load, cleanSpec, clone } = require("./support/env.cjs");
const { DESIGN } = require("./support/stub-core.cjs");

const { CS, bundle } = load();
const plain = (v) => JSON.parse(JSON.stringify(v));
const run = (spec, extra) => plain(CS.qa.runText(Object.assign({ spec }, extra || {})));
const ids = (res) => res.map((r) => r.rule);
const slide = (spec, id) => spec.slides.find((s) => s.id === id);

/* ---------------------------------------------------- qa-rules.json shape */

test("qa-rules.json: every check has bilingual messages and valid severities", () => {
  const rules = plain(CS.qa.rules());
  assert.equal(rules.schemaVersion, 1);
  const seen = new Set();
  rules.gates.forEach((g) => {
    assert.ok(rules.order.includes(g.id), g.id + " is in order");
    g.checks.forEach((c) => {
      assert.ok(!seen.has(c.id), "duplicate " + c.id);
      seen.add(c.id);
      assert.ok(c.id.startsWith(g.id + "."));
      assert.ok(["BLOCK", "FIX", "NOTE"].includes(c.sev));
      assert.ok(c.msg.ar && c.msg.en && c.when, c.id);
      assert.ok(c.fix && c.fix.ar && c.fix.en, c.id + " has a fix hint");
      assert.match(c.id, /^[A-Z]{1,3}[0-9]{1,2}(\.[a-z0-9-]+)?$/);
    });
  });
  assert.deepEqual(rules.order, rules.gates.map((g) => g.id));
});

test("qa-rules.json: $platform references are resolved and no placeholder stays", () => {
  const refs = [];
  (function walk(v) {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") {
      if ("$platform" in v) refs.push(v);
      Object.keys(v).forEach((k) => walk(v[k]));
    }
  })(plain(CS.qa.rules()));
  assert.equal(refs.length, 0);
  assert.deepEqual(plain(CS.qa.rules().gates.find((g) => g.id === "C1").checks[0].params), { max: 6 });
});

test("qa-rules.json: the overridable set is C1.*, C2.body-hard, the creator-length C2 checks, C3.*, O1.* (+ the additive C10.*), and the ending a creator keeps (C4.count, C5.skeleton)", () => {
  const rules = plain(CS.qa.rules());
  const ovr = [];
  rules.gates.forEach((g) =>
    g.checks.forEach((c) => {
      if (c.overridable === true || (c.overridable === undefined && g.overridable === true)) ovr.push(c.id);
    })
  );
  // C4.count and C5.skeleton: a creator may keep their own script without a call to action («زي ما هو», owner's decision of 2026-11-11).
  ovr.forEach((id) => assert.match(id, /^(C1\.|C2\.(body-hard|title-words|body-words|bullets|dense-words|slide-words|cta-words|share-words)$|C3\.|O1\.|C10\.|C4\.count$|C5\.skeleton$)/, id));
  ["C1.hero-words", "C2.body-hard", "C2.body-words", "C2.cta-words", "C3.words", "O1.deny-marker", "C4.count", "C5.skeleton"].forEach((id) => assert.ok(ovr.includes(id), id));
  ["D1.png-size", "D4.hard", "N1.mixed", "X1.credit", "V1.loop", "SRC1.missing", "C4.bait", "C4.multiple", "C4.keyword-asset", "C4.early", "C5.slide-count", "C2.bridge-words", "C2.bullets-dense", "C2.text-dropped"].forEach((id) => assert.ok(!ovr.includes(id), id));
});

test("the owner's name never appears in the shipped QA files (X1 stores its needles as code points)", () => {
  // Needles are spelled from code points so this test file stays name-free too.
  const lat = (...c) => String.fromCharCode(...c);
  const needles = [
    String.fromCodePoint(1605, 1581, 1605, 1583),
    lat(109, 111, 104, 97, 109, 101, 100),
    lat(109, 111, 104, 97, 109, 109, 101, 100),
    lat(97, 98, 100, 111, 117),
    lat(112, 121, 114, 97, 97, 105),
    lat(112, 121, 114, 97, 109, 101, 100, 105, 97)
  ];
  ["data/qa-rules.json", "runtime/cs-qa.js", "references/qa-gates.md", "references/seven-errors.md"].forEach((rel) => {
    const raw = fs.readFileSync(rel === "runtime/cs-qa.js" && process.env.CS_QA_CHUNK || path.join(DESIGN, rel), "utf8").toLowerCase();
    needles.forEach((n, i) => assert.equal(raw.includes(n.toLowerCase()), false, rel + " contains credit needle #" + i));
  });
});

test("the built chunk stays under its 190,000 B ceiling", () => {
  const size = fs.statSync(process.env.CS_QA_CHUNK || path.join(DESIGN, "runtime/cs-qa.js")).size;
  assert.ok(size <= 190000);  // 176,000 until 1.2.0 added the rendered gates for jammed text, clipped children and orphans
  // The old 4 KiB delta budget over the 170,547 B baseline ended with 1.2.0: the ceiling above is the single limit.
  assert.ok(fs.statSync(path.join(DESIGN, "data/qa-rules.json")).size < 256 * 1024);
});

/* ------------------------------------------------------------- summarize */

test("summarize: status and exit codes", () => {
  const mk = (sev, extra) => Object.assign({ gate: "C2", rule: "C2.body-words", sev, msg: { ar: "a", en: "a" } }, extra);
  assert.deepEqual(plain(CS.qa.summarize([])), { status: "pass", counts: { block: 0, fix: 0, note: 0 }, exitCode: 0 });
  assert.equal(CS.qa.summarize([mk("NOTE")]).exitCode, 0);
  assert.equal(CS.qa.summarize([mk("NOTE"), mk("FIX")]).exitCode, 1);
  assert.equal(CS.qa.summarize([mk("FIX"), mk("BLOCK")]).status, "block");
  const overridden = mk("BLOCK", { gate: "C1", rule: "C1.hero-words", overridden: { reason: "x", at: "2026-10-22T10:00:00Z" } });
  assert.equal(CS.qa.summarize([overridden]).status, "pass");
  assert.equal(CS.qa.summarize([mk("BLOCK", { gate: "C1", rule: "C1.hero-words" })], [{ gate: "C1" }]).status, "pass");
  assert.equal(CS.qa.summarize([mk("BLOCK", { gate: "N1", rule: "N1.mixed" })], [{ gate: "N1" }]).status, "block", "N1 cannot be overridden");
});

/* -------------------------------------------------------------- override */

function withQa(spec) {
  const out = clone(spec);
  const results = run(spec);
  out.qa = { status: CS.qa.summarize(results).status, results };
  return out;
}

test("override: marks overridable findings, records the reason and clears the status", () => {
  const spec = cleanSpec();
  slide(spec, "s01").headline = "كلمة كلمة كلمة كلمة كلمة كلمة كلمة";
  const stored = withQa(spec);
  assert.equal(stored.qa.status, "block");
  const next = plain(CS.qa.override(stored, "C1", { reason: "العنوان قصير بصريًا", at: "2026-10-22T10:00:00Z" }));
  assert.equal(next.qa.status, "pass");
  assert.deepEqual(next.qa.results[0].overridden, { reason: "العنوان قصير بصريًا", at: "2026-10-22T10:00:00Z" });
  assert.equal(stored.qa.results[0].overridden, undefined, "the input spec is not mutated");
  // the mark survives a new run
  const again = plain(CS.qa.runText({ spec: next }));
  assert.ok(again.every((r) => r.gate !== "C1" || r.overridden));
});

test("override: refuses technical gates and empty reasons", () => {
  const spec = cleanSpec();
  slide(spec, "s03").body = "وفر ٥\u00A0ساعات";
  const stored = withQa(spec);
  assert.throws(() => CS.qa.override(stored, "N1", { reason: "لا" }), (e) => e.code === "E_USAGE");
  assert.throws(() => CS.qa.override(stored, "C1", { reason: "لا" }), (e) => e.code === "E_USAGE", "nothing to override");
  assert.throws(() => CS.qa.override(stored, "N1", { reason: "" }), (e) => e.code === "E_USAGE");
});

/* --------------------------------------------------------------- autofix */

test("autofix: digits, bindings and spacing are repaired, the rest stays", () => {
  const spec = cleanSpec();
  slide(spec, "s03").body = "وفر ٥\u00A0ساعات مع لـ ChatGPT";
  slide(spec, "s04").body = "ثلاثة\u00A0خطوات ،  ونص طويل";
  slide(spec, "s05").body = "الوقت قصير... جدا";
  const before = run(spec);
  const fixable = before.filter((r) => CS.qa.isAutofixable(r));
  assert.ok(fixable.length >= 3);
  const out = CS.qa.autofix(spec, before, {});
  const fixed = plain(out.spec);
  assert.equal(fixed.slides.find((s) => s.id === "s03").body.includes("٥"), false);
  assert.match(fixed.slides.find((s) => s.id === "s03").body, /لـChatGPT/);
  assert.match(fixed.slides.find((s) => s.id === "s05").body, /…/);
  assert.equal(out.applied.every((r) => r.autofixed === true), true);
  assert.equal(slide(spec, "s03").body.includes("٥"), true, "the original spec is untouched");
  const after = run(fixed);
  assert.equal(after.some((r) => CS.qa.isAutofixable(r)), false, "nothing fixable remains");
});

test("autofix converts a whole post to Arabic-Indic digits when the brand opted in", () => {
  const spec = cleanSpec();
  spec.locale.digits = "arabic-indic";
  slide(spec, "s03").body = "وفر 50% من الوقت";
  const res = run(spec);
  const out = CS.qa.autofix(spec, res, {});
  assert.equal(slide(plain(out.spec), "s03").body, "وفر ٥٠٪\u00A0من الوقت", "digits converted and the number bound to its noun");
});

/* ---------------------------------------------------------------- report */

test("report: JSON follows the schema fields and Markdown is stable", () => {
  const spec = cleanSpec();
  slide(spec, "s01").headline = "كلمة كلمة كلمة كلمة كلمة كلمة كلمة";
  slide(spec, "s03").bridge = "";
  const results = run(spec);
  const rep = plain(CS.qa.report.toJSON(spec, results, { lane: "studio", painter: "svg", createdAt: "2026-10-22T11:00:00Z", fonts: ["Alexandria"] }));
  assert.deepEqual(Object.keys(rep).slice(0, 9), ["schemaVersion", "specId", "rev", "engine", "createdAt", "checkpoint", "lane", "status", "exitCode"]);
  assert.equal(rep.status, "block");
  assert.equal(rep.exitCode, 2);
  assert.deepEqual(rep.environment, { painter: "svg", fonts: ["Alexandria"], dialect: "eg", digits: "western" });
  const md = CS.qa.report.toMarkdown(rep, "ar");
  assert.equal(md, CS.qa.report.toMarkdown(rep, "ar"));
  assert.match(md, /^# تقرير الجودة — post-20261022-clean\n/);
  assert.match(md, /\n## BLOCK\n\n- s01 · C1\.hero-words · /);
  assert.match(md, /\n## FIX\n/);
  assert.match(md, /\n- الرسّام: svg\n/);
  const en = CS.qa.report.toMarkdown(rep, "en");
  assert.match(en, /^# QA report — post-20261022-clean\n\n\*\*Status:\*\* Blocked · \*\*Revision:\*\* 1 · \*\*Checkpoint:\*\* script\n/);
  assert.equal(md.endsWith("\n") && !md.endsWith("\n\n"), true);
  const clean = plain(CS.qa.report.toJSON(cleanSpec(), [], { createdAt: "2026-10-22T11:00:00Z" }));
  assert.match(CS.qa.report.toMarkdown(clean, "en"), /No findings\./);
});

test("report: overridden findings move to the overrides list", () => {
  const spec = cleanSpec();
  slide(spec, "s01").headline = "كلمة كلمة كلمة كلمة كلمة كلمة كلمة";
  const next = CS.qa.override(withQa(spec), "C1", { reason: "مقصود", at: "2026-10-22T10:00:00Z" });
  const rep = plain(CS.qa.report.toJSON(next, plain(next.qa.results), { createdAt: "2026-10-22T11:00:00Z" }));
  assert.equal(rep.status, "pass");
  assert.equal(rep.overrides.length, 1);
  const md = CS.qa.report.toMarkdown(rep, "en");
  assert.match(md, /## Overrides\n\n- C1 · s01 · مقصود \(2026-10-22T10:00:00Z\)/);
  assert.equal(/## BLOCK/.test(md), false);
});

test("run: merges the scopes, sets exit code and emits cs:qa", async () => {
  const events = [];
  const { CS: C } = load(null, {});
  C.emit = (t, d) => events.push([t, d]);
  const spec = cleanSpec();
  slide(spec, "s03").body = "كلمة ".repeat(40);
  const rep = await C.qa.run({ spec, lane: "claude-code" }, { createdAt: "2026-10-22T11:00:00Z" });
  assert.equal(rep.status, "block");
  assert.equal(rep.lane, "claude-code");
  assert.equal(events[0][0], "cs:qa");
  const sq = C.qa.specQa(rep);
  assert.deepEqual(Object.keys(sq), ["status", "runAt", "engine", "results"]);
});

/* ------------------------------------------------------- describe / seven */

test("describe returns the rule card used by the Check screen", () => {
  const d = plain(CS.qa.describe("C2.body-hard"));
  assert.equal(d.sev, "BLOCK");
  assert.equal(d.overridable, true);
  assert.ok(d.when);
  assert.equal(CS.qa.describe("nope.x"), null);
  assert.ok(CS.qa.describe("O1.ortho-hamza-001"));
});

test("sevenErrors groups findings and reports the slide count", () => {
  const spec = cleanSpec();
  slide(spec, "s03").body = "كلمة ".repeat(30);
  slide(spec, "s04").bridge = "";
  spec.slides = spec.slides.slice(0, 5).concat(spec.slides.slice(-1));
  const res = plain(CS.qa.runText({ spec }));
  const rep = plain(CS.qa.sevenErrors(res, spec, { rendered: false, export: false }));
  const by = Object.fromEntries(rep.errors.map((e) => [e.id, e.status]));
  assert.equal(by.crowding, "fix");
  assert.equal(by["random-structure"], "block", "the cover promises 5 items but only 3 remain");
  assert.equal(by["small-text"], "n/a");
  assert.equal(by["repeated-cta"], "pass");
  assert.equal(rep.slideCount.n, 6);
  assert.equal(rep.slideCount.status, "pass");
});
