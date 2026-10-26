// tests/unit/js/visual/plan-choice.test.mjs · PLAN-CHOICE (round 3, wave 2b): what the planner chooses once the slice acceptance failed (CD 4.9, designer 5.6).
// Demo first (a mock that draws the demo keeps its place at fit level 2, the note plan.demo-undrawn names a demo that reaches no slide), icon honesty (a lone icon is an object
// the slide's own noun names; metaphors and stretches lose points; plates carry the rest), the tone rhythm (>= 6 inner slides: 2 non-base, a field and an invert, never 3
// equal tones in a row, the CTA may be field), and the V2 musts: the numeral width equals the builder's, S-13 holds for words, a lock without an anchor is held fixed.
// The planner is loaded the way the chunk wraps it (tests/visual/expected/support.mjs) with the real data blocks and the wave-2 slice capabilities.
// Run: node --test tests/unit/js/visual/plan-choice.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import { ROOT, SK, SLICE, boot, clone, plain, preset, readJson } from "../../../visual/expected/support.mjs";

const CS = boot(), V = CS.visual, PL = V._.pl;
const DATA = readJson(join(SK, "data", "art-direction.json"));
const P = Object.fromEntries(["creator", "poster"].map((id) => [id, preset(id)]));
const AUTO = Object.fromEntries(["eg", "en", "gulf", "levant"].map((f) => [f, readJson(join(ROOT, "tests", "fixtures", "auto", f + ".json"))]));
const SLICES = { creator: AUTO.eg[2], poster: AUTO.eg[0] };   // the two slice decks: the creator deck is eg-2, the poster deck is eg-0

// A capture of the choices (ch) of the last plan: P.run is wrapped once, the wrapper is transparent.
let last = null;
const run0 = PL.run;
PL.run = function (Fs, X) { const ch = run0.call(this, Fs, X); last = { Fs, ch, X }; return ch; };
const bare = (spec) => { const d = clone(spec); for (const s of d.slides) delete s.visual; return d; };
const plan = (spec, pid = "creator", opts = {}) => V.plan(spec, null, opts.preset || P[pid], null, { caps: SLICE, ...opts });
const slide = (out, id) => out.slides.find((s) => s.id === id)?.visual;
const notes = (out, code) => plain(out.notes.filter((n) => n.code === code).map((n) => n.slide));   // plain: the arrays of the planner vm are not the arrays of this realm
const choice = (id) => last.ch[last.Fs.find((F) => F.id === id).i];
/** A throw-away deck on the creator slice deck: slides given as fields; ids s02..; the cover stays. */
function mk(slides, base = AUTO.eg[2]) {
  const d = bare(base);
  d.slides = [d.slides[0], ...slides.map((s, i) => ({ id: "s" + String(i + 2).padStart(2, "0"), n: i + 2, ...s }))];
  return d;
}
const tonesOf = (out) => out.slides.map((s) => s.visual.tone);
const letters = (out, spec) => spec.slides.filter((s) => s.type !== "cover").map((s) => { const v = slide(out, s.id); return v ? v.tone[0] : s.visual?.tone?.[0] || "b"; }).join("");   // a locked slide has no entry: its stored tone counts
const DEMO = (...lines) => ({ lines: lines.map(([who, text, hi]) => ({ who, text, ...(hi ? { hi: true } : {}) })), caption: "رسالة" });

/* ---- demo first -------------------------------------------------------------------------------------------------------- */

test("demo first: creator s08 (testimonial) and s09 (cta) and poster s07 (setup) draw their demo with a mock chat or notes", () => {
  const c = plan(bare(SLICES.creator), "creator");
  for (const id of ["s08", "s09"]) {
    const v = slide(c, id);
    assert.equal(v.anchor.kind, "mock", `${id}: ${JSON.stringify(v.anchor)}`);
    assert.equal(v.anchor.mock.kind, "chat", id);
    assert.ok(PL.cands && choice(id).c.id.endsWith("mock-chat"), choice(id).c.id);
  }
  assert.deepEqual(notes(c, "plan.demo-undrawn"), [], "every demo of the creator deck reaches a slide");
  const p = plan(bare(SLICES.poster), "poster"), v = slide(p, "s07");
  assert.deepEqual([v.anchor.kind, v.anchor.mock.kind], ["mock", "notes"]);
  assert.equal(choice("s07").c.id, "setup.mock-notes");
  assert.deepEqual(notes(p, "plan.demo-undrawn"), []);
  assert.equal(slide(c, "s08").relax || 0, 0);
  assert.equal(slide(p, "s07").relax || 0, 0);
});

test("a mock that draws the demo stays a candidate at fit level 2, gets +6000 and half the level penalty, and variety never waits for it", () => {
  const spec = bare(SLICES.creator);
  plan(spec, "creator");
  const F8 = last.Fs.find((F) => F.id === "s08"), mock = F8.cs.find((c) => c.id === "testimonial.mock-chat");
  assert.ok(mock && mock.f.lvl === 2 && mock.f.feas, "level 2 and feasible: it is kept");
  const D = clone(DATA); D.rhythm.scoring.adjust.demo = 0;
  plan(spec, "creator", { data: D });
  const m2 = last.Fs.find((F) => F.id === "s08").cs.find((c) => c.id === "testimonial.mock-chat");
  assert.equal(mock.s - m2.s, 6000, "the bonus is the table's +6000");
  // s09 follows a chat of the same kind and recipe (S1 + S2 would cost 6000): the demo is still drawn
  plan(spec, "creator");
  assert.equal(choice("s09").c.kind, "mock");
  assert.equal(choice("s08").c.kind, "mock");
  // without a demo the same candidates are not offered at all
  const nodemo = bare(SLICES.creator); delete nodemo.slides.find((s) => s.id === "s08").demo;
  plan(nodemo, "creator");
  assert.ok(!last.Fs.find((F) => F.id === "s08").cs.some((c) => c.kind === "mock"));
});

test("plan.demo-undrawn: a demo that no chosen anchor draws is named (no mock in caps, a stored anchor of another kind, unsupported builders)", () => {
  const demo = DEMO(["me", "هوك"], ["sys", "وصلتك الورقة"]), cta = { type: "cta", title: "عايز الورقة؟", cta: { kind: "keyword-dm", text: "ابعتلي كلمة هوك" }, demo };
  const nomock = { ...SLICE, art: { ...SLICE.art, mock: [] } };
  assert.deepEqual(notes(plan(mk([cta]), "creator", { caps: nomock }), "plan.demo-undrawn"), ["s02"], "no builder for a chat or notes: the note");
  assert.deepEqual(notes(plan(mk([cta]), "creator"), "plan.demo-undrawn"), [], "the slice builds them: no note");
  const stored = mk([{ ...cta, visual: { anchor: { kind: "word" } } }]);
  assert.deepEqual(notes(plan(stored, "creator"), "plan.demo-undrawn"), ["s02"], "the stored anchor kind wins over the demo, and the note says so");
  const steps = mk([1, 2, 3].map((i) => ({ type: "step", ord: i, title: "خطوة " + i, body: "اكتب الخطوة", demo: DEMO(["me", "ابدأ"], ["sys", "تم"]) })));
  const out = plan(steps, "creator");
  assert.deepEqual(notes(out, "plan.demo-undrawn"), [], "all three demos survive the variety conflict");
  assert.deepEqual(plain(out.slides.map((s) => s.visual.anchor.kind)), ["mock", "mock", "mock"]);
  assert.ok(out.slides.every((s) => !(s.visual.relax > 0)), "demo slides are exempt from the kind-run rule, so nothing relaxes");
  assert.deepEqual(plain(plan(steps, "creator")), plain(out), "repeat-identical choices");
  const locked = mk([{ ...cta, visual: { lock: true, anchor: { kind: "word", word: "هوك" } } }]);
  assert.deepEqual(notes(plan(locked, "creator"), "plan.demo-undrawn"), [], "a locked slide is the owner's choice");
});

test("a testimonial's own figure stays native unless the demo shows it, and the prediction counts it; bullets beside a demo stay native too", () => {
  const body = "جرّبت التعديلات في بوست واحد. الفرق ظهر في الحفظ.", number = { value: "120", unit: "حفظ" };
  const inDemo = mk([{ type: "testimonial", body, attribution: "متدرّبة", number, demo: DEMO(["them", "الحفظ زاد من 40 إلى 120 في بوست واحد"], ["me", "إنتي عملتي إيه؟"]) }]);
  const outDemo = mk([{ type: "testimonial", body, attribution: "متدرّبة", number, demo: DEMO(["them", "الحفظ زاد كتير في بوست واحد"], ["me", "إنتي عملتي إيه؟"]) }]);
  plan(inDemo, "creator");
  const a = last.Fs[1].cs.find((c) => c.kind === "mock"), sa = a.share;
  plan(outDemo, "creator");
  const b = last.Fs[1].cs.find((c) => c.kind === "mock");
  assert.ok(a && sa >= 50, "the demo shows the figure: the chat takes the room");
  assert.ok(!b || b.share < sa, `the figure stays a native block of 360 px: the mock gets less room (${b?.share} against ${sa})`);
  // a long body and the native figure leave no room for the chat: the slide falls back, and the note says the demo is not drawn
  const wordy = "جرّبت التعديلات دي في بوست واحد من غير ما أغيّر أي حاجة تانية في الصفحة، والفرق ظهر في الحفظ قبل التعليقات وقبل المشاركات وقبل أي حاجة تانية، وده خلاني أكمل على نفس الطريقة في كل البوستات اللي بعدها.";
  const long = mk([{ type: "testimonial", body: wordy, attribution: "متدرّبة", number, demo: DEMO(["them", "الحفظ زاد كتير في بوست واحد"], ["me", "إنتي عملتي إيه؟"]) }]);
  const lo = plan(long, "creator");
  assert.notEqual(slide(lo, "s02").anchor.kind, "mock");
  assert.deepEqual(notes(lo, "plan.demo-undrawn"), ["s02"]);
  assert.ok(!last.Fs[1].cs.some((c) => c.kind === "mock"), "an infeasible mock is not kept at level 2");
  // bullets: three fit beside the notes, five long ones leave no room: the demo falls back and the note says so, the bullets are never dropped
  const setup = (bullets) => mk([{ type: "setup", title: "اللي هتحتاجه", bullets, demo: DEMO(["sys", "تحويل تلقائي"], ["sys", "كل أول شهر", true]) }], AUTO.eg[0]);
  const short = ["حساب ادخار منفصل", "تطبيق البنك على موبايلك", "ربع ساعة أول كل شهر"];
  const longer = ["حساب ادخار منفصل عن حساب المرتب الأساسي", "تطبيق البنك على موبايلك مع الإشعارات", "ربع ساعة أول كل شهر لمراجعة الأرقام", "ورقة بالنسب اللي اتفقنا عليها", "شخص تحاسبه على الالتزام"];
  const three = plan(setup(short), "poster"), five = plan(setup(longer), "poster");
  assert.equal(slide(three, "s02").anchor.mock.kind, "notes");
  assert.deepEqual(notes(three, "plan.demo-undrawn"), []);
  assert.notEqual(slide(five, "s02").anchor.kind, "mock", "five long bullets and a demo do not fit under one another");
  assert.deepEqual(notes(five, "plan.demo-undrawn"), ["s02"]);
  const notesFit = (spec) => { plan(spec, "poster"); return last.Fs[1].cs.find((c) => c.id === "setup.mock-notes"); };
  assert.ok(!notesFit(setup(longer)) || notesFit(setup(longer)).share < notesFit(setup(short)).share, "the bullets are part of the predicted blocks");
});

test("share: the chat sits under the text so its predicted share reaches the type minimum (35): the three share slides of the auto decks stay at relax 0", () => {
  for (const [f, i, id] of [["eg", 1, "s08"], ["eg", 5, "s09"], ["gulf", 0, "s08"]]) {
    const spec = bare(AUTO[f][i]), pid = String(spec.style.presetId).split("@")[0], out = plan(spec, pid), v = slide(out, id);
    assert.equal(v.anchor.kind, "mock", `${f}-${i} ${id}`);
    assert.ok(!v.relax, `${f}-${i} ${id} stays at relax 0 (it was 8)`);
    assert.ok(choice(id).c.share >= DATA.anchorTable.types.share.min, `${f}-${i}: ${choice(id).c.share}`);
  }
  // no demo: the floor reaches the minimum too, the slide does not fall to the last rung
  const bareShare = mk([{ type: "share", headline: "ابعتها لزميلك اللي بيبدأ يومه بالرسايل", sub: "هيشكرك بعدين" }]);
  assert.ok(!slide(plan(bareShare, "creator"), "s02").relax);
});

test("auto decks only relax variety when three consecutive demos require mocks", () => {
  for (const [f, list] of Object.entries(AUTO)) list.forEach((deck, i) => {
    const spec = bare(deck), out = plan(spec, String(spec.style.presetId).split("@")[0]);
    for (const q of out.slides.filter((s) => s.visual.relax)) {
      assert.ok(q.visual.relax >= 6, `${f}-${i}`);
      assert.equal(q.visual.anchor.kind, "mock");
      assert.ok(out.notes.some((n) => n.slide === q.id && n.code === "plan.demo-first"));
    }
  });
});

/* ---- icon honesty ---------------------------------------------------------------------------------------------------------- */

test("a pick is honest when the word that made the hit is one of the icon's own labels; a topic default never is", () => {
  const e = (name, via, rung = 2, o = {}) => ({ name, via, rung, concept: "x", ...o });
  const X = { ld: "eg" };
  assert.equal(PL.noun(e("circle-question-mark", "سؤال"), X), true, "a question mark for «سؤال»");
  assert.equal(PL.noun(e("lightbulb", "بالفكرة", 5), X), true, "the article and the preposition do not hide the noun");
  assert.equal(PL.noun(e("pencil", "تعديلات"), X), true, "a plural is the same noun");
  assert.equal(PL.noun(e("wrench", "تعديلات"), X), false, "a wrench is not the word «edits»");
  assert.equal(PL.noun(e("trophy", "رقم", 2, { object: "trophy" }), X), false, "the trophy for «رقم» (record-number) is a polysemy");
  assert.equal(PL.noun(e("award", "رقم"), X), false);
  assert.equal(PL.noun(e("camera", "creator", 7), X), false, "rung 7 is the topic category, not a word of the slide");
  assert.equal(PL.noun(e("target", "بالنتيجة", 5, { concept: "result" }), X), true, "the label is there; the concept is what the metaphor penalty reads");
});

test("the cliche data holds target, trophy, award, flag, circle-check and chart-line, and the metaphor concepts of the brief", () => {
  const cl = DATA.rhythm.scoring.cliche;
  for (const n of ["target", "trophy", "award", "flag", "circle-check", "chart-line"]) assert.ok(cl.icons.includes(n), n);
  assert.deepEqual(cl.metaphorConcepts, ["result", "record-number", "success", "goal", "growth"]);
  assert.ok(cl.objects.includes("trophy"));
});

test("a pick that came through a metaphor concept, or through a stretch at rung 5, loses 2000; an honest pick does not", () => {
  const spec = mk([{ type: "stat", number: { value: "40", unit: "%" }, title: "النمو في الحفظ", body: "زاد الحفظ بعد التعديل", sourceIds: [] }]);
  const score = (D) => { plan(spec, "creator", { data: D }); const F = last.Fs[1], c = F.cs.find((q) => q.id === "stat.numeral-icon"); return [c && c.s, F.pool[0]]; };
  const [s1, top] = score(DATA);
  if (s1 == null) return;   // no icon candidate on this slide
  const D = clone(DATA); D.rhythm.scoring.cliche.metaphorConcepts = [];
  const [s2] = score(D);
  const metaphor = DATA.rhythm.scoring.cliche.metaphorConcepts.includes(top.concept);
  assert.equal(s2 - s1, metaphor ? 2000 : 0, `${top.name} via ${top.via} (${top.concept}, rung ${top.rung})`);
  // the real concept ids exist in the lookup data, so the list is not a dead letter
  const ids = new Set(readJson(join(SK, "data", "icons", "concepts.json")).concepts.map((c) => c.id));
  for (const c of DATA.rhythm.scoring.cliche.metaphorConcepts) assert.ok(ids.has(c), c);
});

test("no lone target, trophy or award on the slice decks, no icon alone on an item slide without its own noun, and numeral-icon is not offered on a variant-numeral item", () => {
  for (const pid of ["creator", "poster"]) {
    const spec = bare(SLICES[pid]), out = plan(spec, pid);
    for (const s of out.slides) {
      const a = s.visual.anchor;
      assert.ok(!(a.kind === "icon" && /^(?:target|trophy|award|flag|circle-check|chart-line)$/.test(a.icon || a.object || "")), `${pid} ${s.id}: ${JSON.stringify(a)}`);
      assert.ok(a.object !== "trophy", `${pid} ${s.id}`);
    }
    for (const x of last.ch.filter(Boolean)) if (x.F.type === "item" && x.c.kind === "icon") assert.ok(x.nm[0].o && PL.noun(x.nm[0].e, last.X), `${pid} ${x.F.id}: a lone icon on an item is an object the slide names`);
  }
  const out = plan(bare(SLICES.creator), "creator"), item4 = last.Fs.find((F) => F.id === "s04");
  assert.equal(item4.v, "numeral");
  assert.ok(!item4.cs.some((c) => c.id === "item.numeral-icon"), "the native ordinal numeral owns that slide");
  assert.ok(out.slides.length === 8);
});

test("an icon is offered only for an object the slide's own noun names and uses a hero container", () => {
  const out = plan(bare(SLICES.creator), "creator"), X = last.X, offered = (id) => plain(PL.cands(last.Fs.find((F) => F.id === id), X).map((c) => c.id));
  // s06 «اقطع الجملة»: the lightbulb is an object and «فكرة» is its label: offered (fit 40), ranked under numeral-plain and field-word
  const F6 = last.Fs.find((F) => F.id === "s06"), icon = F6.cs.find((c) => c.id === "item.icon-duo");
  assert.ok(offered("s06").includes("item.icon-duo") && icon, offered("s06").join());
  assert.ok(icon.field && ["xl", "hero"].includes(icon.f.sz), "a single icon owns a large container");
  assert.ok(icon.needs.includes("objnoun"), "the object is named by the slide");
  assert.notEqual(choice("s06").c.id, "item.icon-duo");
  // s05 «حط رقم محدد»: the trophy comes through record-number («رقم»): no icon candidate of any kind
  assert.ok(!offered("s05").some((id) => /icon/.test(id) && id !== "item.numeral-icon"), offered("s05").join());
  // s03 «ابدأ بالنتيجة»: the target is no object, so it is never an icon alone; the plate may carry it (its label is «نتيجة»), at the price of the metaphor
  assert.ok(!offered("s03").includes("item.icon-duo"), offered("s03").join());
  assert.ok(out.slides.length === 8);
});

test("a plate: an icon on a filled field, offered for item, step, myth-fact and quote when the noun is the icon's own; ART-WORD-ICON grows the glyph", () => {
  const nonum = { ...SLICE, art: { ...SLICE.art, numeral: [] } };   // without the ordinal numeral the plate is the honest picture
  const ask = mk([{ type: "item", ord: 1, title: "اسأل سؤال بيوجع", body: "سؤال عن مشكلة حقيقية بيخلّي القارئ يقول: ده أنا." }]);
  const out = plan(ask, "creator", { caps: nonum }), v = slide(out, "s02"), F = last.Fs[1];
  assert.ok(F.cs.some((c) => c.id === "item.field-icon"), F.cs.map((c) => c.id).join());
  assert.equal(v.anchor.kind, "field");
  assert.equal(v.anchor.icon, "circle-question-mark");
  assert.equal(v.field, true);
  for (const type of ["item", "step", "myth-fact", "quote"]) {
    const ids = DATA.anchorTable.types[type].candidates.filter((c) => c.kind === "field" && c.sub === "icon");
    assert.equal(ids.length, 1, type);
    assert.deepEqual(ids[0].sizes, ["lg", "xl", "hero"]);
    assert.deepEqual(ids[0].needs, ["hit:1", "noun"]);
  }
  // the trophy is never on a plate for «رقم»
  const rank = mk([{ type: "item", ord: 1, title: "حط رقم محدد", body: "رقم محدد بيتصدّق أكتر." }]);
  const o2 = plan(rank, "creator", { caps: nonum });
  assert.notEqual(slide(o2, "s02").anchor.icon, "trophy");
  assert.notEqual(slide(o2, "s02").anchor.object, "trophy");
});

/* ---- the tone rhythm -------------------------------------------------------------------------------------------------------- */

const runs3 = (s) => /(.)\1\1/.test(s);

test("tone rhythm: every deck of six inner slides or more shows a field, an invert and two non-base slides, never three equal tones in a row (base counts)", () => {
  let lastField = 0;
  for (const [f, list] of Object.entries(AUTO)) list.forEach((deck, i) => {
    const spec = bare(deck), pid = String(spec.style.presetId).split("@")[0], out = plan(spec, pid), L = letters(out, spec), n = L.length;
    assert.ok(n >= 6, `${f}-${i}`);
    const nb = [...L].filter((c) => c !== "b").length;
    assert.ok(nb >= 2 && L.includes("f") && L.includes("i"), `${f}-${i} ${L}`);
    assert.ok(!runs3(L), `${f}-${i}: ${L}`);
    assert.ok(nb * 100 <= 40 * n, `${f}-${i}: ${L} stays inside the balanced share`);
    assert.ok(!/[fi]{3}/.test(L), "H6: at most two non-base slides in a row");
    if (L.endsWith("f")) lastField++;
  });
  assert.ok(lastField >= 6, `the CTA is a field slide in most decks (${lastField}), as both M0 CTAs are`);
});

test("tone rhythm on the slice decks: the CTA and the stat are fields, an invert breaks the base run (the bold slide when it can), the strip alternates", () => {
  const creator = bare(SLICES.creator), pc = plan(creator, "creator"), c = letters(pc, creator);
  assert.equal(slide(pc, "s09").tone, "field", "the CTA is a peak: a field, as the M0 CTAs are");
  assert.equal(slide(pc, "s06").tone, "invert", "the bold slide is the cheapest place for the invert that breaks the item run");
  const poster = bare(SLICES.poster), pp = plan(poster, "poster"), p = letters(pp, poster);
  assert.equal(slide(pp, "s03").tone, "field", "the stat is a peak");
  assert.equal(slide(pp, "s09").tone, "field");
  for (const L of [c, p]) {
    assert.equal(L.length, 8);
    assert.ok(!runs3(L), L);
    assert.ok(L.includes("f") && L.includes("i"), L);
    assert.ok([...L].filter((x) => x !== "b").length >= 2 && [...L].filter((x) => x !== "b").length <= 3, L);
  }
  // the same on the other palette of the same preset: the rhythm does not read colours
  for (const pid of ["creator", "poster"]) assert.equal(letters(plan(bare(SLICES[pid]), pid, { preset: { ...P[pid], roles: { ...P[pid].roles, accent: "#E3262B" } } }), bare(SLICES[pid])), pid === "creator" ? c : p);
});

test("tone rhythm: toneBias bounds the non-base share (never below two slides), a preset without both tones plans what it has, a short deck is left alone", () => {
  const spec = bare(SLICES.creator);
  for (const [bias, cap] of [["calm", 20], ["balanced", 40], ["drenched", 50]]) {
    const d = clone(spec); d.style.world = { id: "x", toneBias: bias };
    const L = letters(plan(d, "creator"), d), nb = [...L].filter((x) => x !== "b").length;
    assert.ok(nb >= 2, `${bias} ${L}`);
    assert.ok(nb <= Math.max(2, Math.floor((cap * L.length) / 100)), `${bias} ${L}`);
  }
  const noInvert = clone(P.creator); delete noInvert.tones.invert;
  const L = letters(plan(spec, "creator", { preset: noInvert }), spec);
  assert.ok(!L.includes("i") && L.includes("f"), `field only: ${L}`);
  const noTones = clone(P.creator); delete noTones.tones;
  assert.equal(letters(plan(spec, "creator", { preset: noTones }), spec), "bbbbbbbb", "a preset without tones plans base only");
  const short = mk([{ type: "item", ord: 1, title: "تحميص طازج", body: "كل أسبوع." }, { type: "item", ord: 2, title: "توصيل سريع", body: "في نفس اليوم." }, { type: "cta", title: "اطلب", cta: { kind: "save", text: "احفظ" } }]);
  const S = letters(plan(short, "creator"), short);
  assert.equal(S.length, 3);
  assert.ok(S.includes("b") && S.endsWith("f"), `a deck under six inner slides keeps the role's desire: ${S}`);
});

test("tone rhythm: a stored tone and a lock stay as they are and count in the rhythm; relax level 3 is the row the rhythm reads (H6 run 3, +10 share)", () => {
  const spec = bare(SLICES.creator);
  spec.slides.find((s) => s.id === "s04").visual = { anchor: { kind: "word", word: "اسأل" }, recipe: "under", tone: "field" };
  spec.slides.find((s) => s.id === "s05").visual = { lock: true, anchor: { kind: "word", word: "رقم" }, recipe: "under", tone: "invert" };
  const out = plan(spec, "creator"), L = letters(out, spec);
  assert.equal(slide(out, "s04").tone, "field");
  assert.ok(!out.slides.some((s) => s.id === "s05"), "a lock has no entry");
  assert.equal(choice("s05").tn, "invert");
  assert.equal(L.slice(2, 4), "fi", L);
  assert.ok(!runs3(L), `the fixed tones count: ${L}`);
  assert.ok([...L].filter((c) => c !== "b").length <= 3, L);
  // the ladder row of level 3 is the one the rhythm reads
  assert.deepEqual(plain(DATA.rhythm.relax[3].set), { "H6.maxRunNonBase": 3, "tones.shareCapAdd": 10 });
  assert.equal(DATA.rhythm.hard.H6.maxRunNonBase, 2);
  // a deck that had to climb to level 3 may run three non-base slides and 10 points more: three fields in a row are legal there and not below
  const same = bare(SLICES.creator);
  for (const id of ["s03", "s04", "s05", "s06"]) same.slides.find((s) => s.id === id).visual = { anchor: { kind: "word", word: "اكتب" }, recipe: "under", tone: "field" };
  const M = letters(plan(same, "creator"), same);
  assert.equal(M.slice(1, 5), "ffff", "stored tones are the owner's, whatever the rhythm would say");
});

test("tone rhythm: compare and myth-fact on a field:panel anchor never take the field tone when the field paints card 2 in the page colour", () => {
  const blind = clone(P.creator);
  blind.roles = { ...blind.roles, surface: blind.roles.bg };   // field.accent = surface = the page colour
  const spec = bare(SLICES.creator);
  for (const pr of [P.creator, blind]) {
    const out = plan(spec, "creator", { preset: pr }), v = slide(out, "s07");
    assert.equal(v.anchor.kind, "field");
    if (pr === blind) assert.notEqual(v.tone, "field", "card 2 would vanish");
  }
  const myth = mk([...[1, 2, 3, 4, 5, 6].map((i) => ({ type: "item", ord: i, title: "بند " + i + " مهم", body: "جملة قصيرة هنا." })), { type: "myth-fact", sides: [{ label: "خرافة", text: "الهوك لازم يصدم" }, { label: "حقيقة", text: "الهوك لازم يوعد" }] }]);
  const out = plan(myth, "creator", { preset: blind });
  assert.notEqual(slide(out, "s08").tone, "field");
});

/* ---- V2 musts ---------------------------------------------------------------------------------------------------------------- */

// Measured with the real numeral builder (art chunk, box 852 x 420, probe builds.mjs on 12 stat slides): the figures it draws and the ones it refuses.
const BUILDER = { "4": 1, "7": 1, "50%": 1, "120": 1, "1,200": 0, "12,500": 0, "88888": 0, "1,234,567": 0, "-12": 1, "3.5%": 1, "100%": 0, "2024x": 0 };
function realEw() {
  const sb = {};
  sb.window = sb;
  vm.createContext(sb);
  vm.runInContext(`(function(){var CS=(window.CS={art:{kit:{},register(){}}});\n${readFileSync(join(ROOT, "src", "art", "chart.js"), "utf8")}\n})();`, sb);
  return sb.CS.art;
}

test("numeral width: the planner asks the builder's own question (CS.art.chart.ew when loaded, a stricter table otherwise), and both agree with the builder", () => {
  const local = Object.fromEntries(Object.keys(BUILDER).map((v) => [v, PL.wide(v, 852) ? 0 : 1]));
  assert.deepEqual(local, BUILDER, "the local table: no CS.art in this vm");
  CS.art = realEw();
  try {
    const real = Object.fromEntries(Object.keys(BUILDER).map((v) => [v, PL.wide(v, 852) ? 0 : 1]));
    assert.deepEqual(real, BUILDER, "CS.art.chart.ew from src/art/chart.js");
    // the old test (F.ew * 200 > width, floor widths) let 1,200 through: the builder refuses it
    const K = CS.art.chart.ew;
    assert.ok(200 * K("1,200") <= 852 && PL.wide("1,200", 852), "what the old planner accepted");
    // a narrower box (the centre recipe, at most 560 px) refuses more
    assert.equal(PL.wide("120", 560), true);
    assert.equal(PL.wide("4", 560), false);
  } finally { delete CS.art; }
  const numeralJs = readFileSync(join(ROOT, "src", "art", "numeral.js"), "utf8");
  assert.ok(/206 \* K\.ew\(val, true\)/.test(numeralJs) && /W \* 0\.7/.test(numeralJs) && /M\.min\(520/.test(numeralJs), "numeral.js still asks 206 px inside 70 percent: the planner copies that rule");
});

test("numeral width: 12,500 and 88888 plan no numeral (field-word instead), 120 and 4 plan one; the check follows what the emit writes (the ordinal on a variant numeral)", () => {
  const stat = (number, unit) => mk([{ type: "stat", number: { value: number, unit }, title: "ارتفع", body: "عن الشهر اللي فات", sourceIds: [] }]);
  for (const v of ["12500", "88888"]) {
    const out = plan(stat(v, "جنيه"), "creator");
    assert.ok(!last.Fs[1].cs.some((c) => c.kind === "numeral"), `${v}: ${last.Fs[1].cs.map((c) => c.id).join()}`);
    assert.notEqual(slide(out, "s02").anchor.kind, "numeral");
    assert.equal(slide(out, "s02").anchor.kind, "field", `${v} falls back to field-word`);
  }
  for (const v of ["4", "120"]) {
    plan(stat(v, "مرة"), "creator");
    assert.ok(last.Fs[1].cs.some((c) => c.kind === "numeral"), v);
  }
  // an item with the ordinal on a variant numeral draws one digit, whatever the title says
  const item = mk([{ type: "item", ord: 3, variant: "numeral", title: "اكتب 12,500 كلمة", body: "ولا تكتب أكتر." }]);
  plan(item, "creator");
  assert.ok(last.Fs[1].cs.some((c) => c.id === "item.numeral-plain"));
});

test("S-13: a figure already shown twice gets no numeral and no word or field-word that is the figure; the ranked F.wts, or the longest word, take its place", () => {
  const two = mk([{ type: "stat", number: { value: "74", unit: "%" }, title: "74% من الناس بتقرا", body: "يعني 74 من كل 100 في الفيد", sourceIds: [] }]);
  const out = plan(two, "creator");
  const F = last.Fs[1];
  assert.ok(F.reps >= 2, `reps ${F.reps}`);
  assert.ok(!F.cs.some((c) => c.kind === "numeral"), "no numeral: it would be the third");
  for (const c of F.cs.filter((q) => q.kind === "word" || q.sub === "word")) assert.ok(!/74/.test(F.wt), `${c.id}: word «${F.wt}»`);
  const a = slide(out, "s02").anchor;
  if (a.word) assert.ok(!/74/.test(a.word), a.word);
  // the planner takes the next ranked word of PLAN-EMIT when it is given one
  const feat0 = PL.feat;
  PL.feat = function (spec, X) { const out = feat0.call(this, spec, X); for (const f of out) f.wts = ["الفيد", "بتقرا"]; return out; };
  try {
    const o2 = plan(two, "creator");
    assert.ok(!/74/.test(last.Fs[1].wt) && /^(?:الفيد|بتقرا)$/.test(last.Fs[1].wt), last.Fs[1].wt);
    if (slide(o2, "s02").anchor.word) assert.match(slide(o2, "s02").anchor.word, /^(?:الفيد|بتقرا)$/);
  } finally { PL.feat = feat0; }
  // a figure shown once is no problem: the word may be the figure
  const once = mk([{ type: "stat", number: { value: "74", unit: "%" }, title: "من الناس بتقرا", body: "جملة تانية عن الموضوع", sourceIds: [] }]);
  plan(once, "creator");
  assert.ok(last.Fs[1].cs.some((c) => c.kind === "numeral"), "twice in the plan is allowed: once in the text, once as the numeral");
});

test("a locked slide without an anchor is held fixed as `none`: no candidate is planned for it, and it counts as a neighbour", () => {
  const spec = bare(SLICES.creator);
  spec.slides.find((s) => s.id === "s04").visual = { lock: true };
  const out = plan(spec, "creator");
  assert.ok(!out.slides.some((s) => s.id === "s04"), "a lock has no entry");
  const x = last.ch[last.Fs.find((F) => F.id === "s04").i];
  assert.ok(x && x.lock === 1 && x.c.kind === "none", JSON.stringify(x && { lock: x.lock, kind: x.c.kind }));
  assert.deepEqual(plain(x.nm), []);
  // with an anchor it is still held as before
  spec.slides.find((s) => s.id === "s04").visual = { lock: true, anchor: { kind: "word", word: "اسأل" } };
  plan(spec, "creator");
  assert.equal(last.ch[last.Fs.find((F) => F.id === "s04").i].c.kind, "word");
});

/* ---- sizes ------------------------------------------------------------------------------------------------------------------- */

test("budget amendment r3b-1: plan-score.js <= 22 KiB, art-direction.json <= 70 KB, the planner files <= 48 KiB together, LF endings", () => {
  const size = (f) => statSync(f).size, vis = join(ROOT, "src", "visual");
  assert.ok(size(join(vis, "plan-score.js")) <= 22 * 1024, `plan-score.js ${size(join(vis, "plan-score.js"))}`);
  assert.ok(size(join(SK, "data", "art-direction.json")) <= 70000, `art-direction.json ${size(join(SK, "data", "art-direction.json"))}`);
  const total = ["plan-features.js", "plan-score.js", "plan-emit.js", "plan-api.js"].reduce((a, f) => a + size(join(vis, f)), 0);
  assert.ok(total <= 48 * 1024, `planner total ${total}`);
  for (const f of [join(vis, "plan-score.js"), join(SK, "data", "art-direction.json")]) {
    const t = readFileSync(f, "utf8");
    assert.ok(!t.includes("\r") && t.endsWith("\n"), f);
    assert.ok(!/Math\.random|\bDate\b|performance\.now|\bfetch\(|document\./.test(t), `${f} is pure`);
  }
});
