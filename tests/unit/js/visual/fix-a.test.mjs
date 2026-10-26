import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { ROOT, SK, boot, SLICE, preset, clone, plain, readJson } from "../../../visual/expected/support.mjs";
import { loadPlanner, planSpec } from "../../../../plugins/carousel-studio/skills/carousel-design/scripts/plan.mjs";

const CS = boot(), V = CS.visual, P = preset("creator"), decks = readJson(join(ROOT, "tests/fixtures/auto/eg.json"));
const plan = (s, p = P) => plain(V.plan(s, null, p, null, { caps: SLICE }));
const twice = (s, p) => { const a = plan(s, p); assert.deepEqual(plan(s, p), a); return a; };
function deck(slides) {
  const d = clone(decks[2]);
  d.slides = [d.slides[0], ...slides.map((s, i) => ({ ...s, id: `s${i + 2}`, n: i + 2 }))];
  return d;
}

test("three consecutive demos keep every source line, with no variety relaxation (demo slides are exempt from the kind-run rule)", () => {
  const src = clone(decks[2].slides.find((s) => s.id === "s08"));
  const d = deck([src, src, src]), out = twice(d);
  assert.equal(out.slides.length, 3);
  assert.ok(out.slides.every((s) => s.visual.anchor.kind === "mock"));
  assert.ok(out.slides.every((s) => !(s.visual.relax > 0)), "demo slides are exempt from the kind-run rule, so nothing relaxes");
  assert.ok(!out.notes.some((n) => n.code === "plan.demo-undrawn"));
  for (const s of out.slides) assert.equal(s.visual.anchor.mock.caption, src.demo.caption);
});

test("the planner never promises a mock that would truncate an over-budget demo", () => {
  const d = deck([{ type: "cta", title: "الورقة", cta: { kind: "save", text: "احفظ الورقة" }, demo: { lines: Array.from({ length: 6 }, (_, i) => ({ text: `سطر ${i}` })) } }]);
  const a = twice(d);
  assert.ok(a.slides.every((s) => s.visual.anchor.kind !== "mock"));
  assert.ok(a.notes.some((n) => n.code === "plan.demo-undrawn"));
});

test("CTA keywords beat function words; body nouns avoid echoing the title; emphasis is supported", () => {
  const d = deck([
    { type: "cta", title: "عايز الورقة؟", cta: { kind: "keyword-dm", keyword: "هوك", text: "ابعت هوك" } },
    { type: "item", ord: 1, title: "اقطع الجملة", body: "احتفظ بالفكرة" },
    { type: "item", ord: 2, title: "وضّح *الرسالة*", body: "تجربة بسيطة" },
  ]);
  const features = V._.pl.feat(d, { D: V._.block("cs-art-direction"), ld: "eg", avoid: [] });
  assert.equal(features[1].wt, "هوك");
  assert.equal(features[2].wt, "بالفكرة");
  assert.equal(features[3].span, "الرسالة");
  twice(d);
});

test("a claim figure in the body outranks the ordinal and never gets a plain icon", () => {
  const s = deck([{ type: "item", ord: 2, title: "حط رقم محدد", body: "قول 3 بدل كتير" }]);
  const out = twice(s).slides[0].visual.anchor;
  assert.equal(out.kind, "numeral");
  assert.equal(out.value, "3");
  assert.ok(!out.unit, "بدل is a preposition, not a unit");
});

test("Arabic separators cannot print an already repeated figure a third time as a word", () => {
  for (const [value, printed] of [["12,500", "12٬500"], ["12.5", "12٫5"]]) {
    const out = twice(deck([{ type: "stat", number: { value }, title: `==${printed}== result`, body: `Value ${printed}` }]));
    for (const s of out.slides) assert.ok(!s.visual.anchor.word?.includes(printed));
  }
});

test("nine to eighteen calm inner slides never have three equal tones; cap concessions are recorded", () => {
  for (const n of [9, 12, 18]) {
    const d = deck(Array.from({ length: n }, (_, i) => ({ type: "item", ord: i + 1, title: "فكرة واضحة", body: "اكتب الرسالة" })));
    d.style.world = { id: "calm", toneBias: "calm" };
    const out = twice(d), tones = out.slides.map((s) => s.visual.tone[0]).join("");
    assert.ok(!/(.)\1\1/.test(tones), tones);
    assert.ok(tones.includes("f") && tones.includes("i"), tones);
    if ([...tones].filter((t) => t !== "b").length > Math.max(2, Math.floor(n / 5))) assert.ok(out.notes.some((n) => n.code === "plan.tones-relaxed"));
  }
});

test("private CLI planning keeps saved designs by default, replans explicitly and persists item icons", () => {
  const dir = mkdtempSync(join(tmpdir(), "cs-fix-a-"));
  try {
    execFileSync(process.execPath, [join(ROOT, "tools/build.mjs"), "--module", "core", "--module", "visual", "--module", "art", "--out", dir]);
    const runtime = loadPlanner({ runtimeDir: dir }), s = clone(decks[0]);
    const saved = { anchor: { kind: "word", word: "اختبار" }, recipe: "under", tone: "base" };
    s.slides[1].visual = saved;
    const before = clone(s);
    const normal = planSpec(s, null, { runtime });
    assert.deepEqual(normal.spec.slides[1].visual, saved);
    const a = planSpec(s, null, { runtime, replan: true }), b = planSpec(s, null, { runtime, replan: true });
    assert.deepEqual(a, b);
    assert.deepEqual(a.spec.slides[0], s.slides[0]);
    for (const q of a.spec.slides.filter((q) => /^(grid|timeline)$/.test(q.type))) {
      assert.equal(q.visual.rowIcons.length, q.items.length);
      assert.ok(q.items.every((it, i) => it.icon === q.visual.rowIcons[i]));
    }
    assert.deepEqual(s, before, "the source spec is not mutated");
    assert.deepEqual(plain(planSpec(a.spec, null, { runtime }).spec), plain(a.spec));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
