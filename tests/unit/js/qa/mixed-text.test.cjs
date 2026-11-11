"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { load, cleanSpec } = require("./support/env.cjs");

test("plain number/noun pairs belong to the renderer, not copy lint", () => {
  const { CS } = load();
  assert.equal(CS.qa.lintText("20 عقد وOpus 5.5").some(i => i.rule === "ORTHO-BIDI-002"), false);
  const spec = cleanSpec(); spec.slides[2].body = "20 عقد";
  assert.equal(CS.qa.runText({ spec }, { gates: ["B1"] }).some(f => f.rule === "B1.unbound-pair"), false);
});

test("encoding checks include every string, caption alt and nested additions", () => {
  const { CS } = load(), spec = cleanSpec();
  spec.captionPack = { body: "Opus\u0001 5.5", perSlide: ["نص\u0081"], alt: ["وصف\u0001"] };
  spec.slides[2].items = [{ title: "عنوان\u0378" }];
  spec.ext = { note: "ملاحظة\u0001" };
  const results = CS.qa.runText({ spec }, { gates: ["O1"] });
  const invalid = results.filter(f => /^O1\.ortho-enc-00[78]$/.test(f.rule));
  assert.equal(invalid.length, 5);
  assert.ok(invalid.every(f => f.sev === "BLOCK"));
  assert.equal(CS.qa.isAutofixable(invalid.find(f => f.rule === "O1.ortho-enc-008")), false);
  const repaired = CS.qa.autofix(spec, results);
  assert.equal(repaired.spec.captionPack.body, "Opus 5.5");
  assert.equal(repaired.spec.captionPack.alt[0], "وصف");
  assert.equal(repaired.spec.ext.note, "ملاحظة");
  assert.equal(repaired.spec.slides[2].items[0].title, "عنوان\u0378", "unassigned characters require review");
  assert.equal(repaired.applied.length, 4);
});

test("direction marks have a deterministic repair and joining controls remain meaningful", () => {
  const { CS } = load(), spec = cleanSpec();
  spec.slides[2].body = "جرّب \u2066Google Search & Other\u2069";
  const results = CS.qa.runText({ spec }, { gates: ["O1"] });
  assert.equal(CS.qa.autofix(spec, results).spec.slides[2].body, "جرّب Google Search & Other");
  assert.equal(CS.qa.lintText("نص\u200c آخر\u200d").some(i => /enc-00[457]/i.test(i.rule)), false);
});

test("clitic connectors survive handles, numbers and trailing punctuation", () => {
  const { CS } = load();
  for (const text of ["الـAPI،", "بـ@الاسم", "بـ50%", "لـGoogle.", "وبـ50%", "الـAgent!"]) {
    assert.equal(CS.qa.lintText(text).some(i => i.rule === "ORTHO-TATWEEL-001"), false, text);
  }
  assert.ok(CS.qa.lintText("كلمـــة").some(i => i.rule === "ORTHO-TATWEEL-001"));
});

test("the marked verb تجرّبه is not the noun تجربة", () => {
  const { CS } = load();
  assert.equal(CS.qa.lintText("يمكنك تجرّبه اليوم").some(i => i.rule === "ORTHO-TAA-001"), false);
  assert.ok(CS.qa.lintText("هذه مدرسه").some(i => i.rule === "ORTHO-TAA-001"));
});

test("copy limits see rendered spaces while encoding lint still sees raw input", () => {
  const {CS} = load(), spec = cleanSpec();
  spec.slides[0].headline = "أفكار\u2009مفيدة\u2009واضحة\u2009تساعد\u2009القارئ\u2009في\u2009عمله";
  assert.ok(CS.qa.runText({spec}, {gates:["C1"]}).some(f => f.rule === "C1.hero-words"));
  spec.slides[2].body = "Opus\u00015.5";
  assert.ok(CS.qa.runText({spec}, {gates:["O1"]}).some(f => f.rule === "O1.ortho-enc-007"));
});

test("safe fixes apply after rendered-space checks and cannot allow hidden controls", () => {
  const {CS} = load();
  for(const input of ["لـ\u202fGoogle", "بـ @الاسم", "لـ\u2009Google"]) {
    const spec=cleanSpec();spec.slides[2].body=input;
    const found=CS.qa.runText({spec},{gates:["B1"]}),out=CS.qa.autofix(spec,found);
    assert.equal(out.spec.slides[2].body,input.replace(/[ \u202f\u2009]/g,''));
    assert.ok(out.applied.some(f=>f.rule==='B1.stranded-lam'));
  }
  const spec=cleanSpec();spec.slides[2].body='خصم 50\u2009٪';
  const out=CS.qa.autofix(spec,CS.qa.runText({spec},{gates:['N1']}));
  assert.equal(out.spec.slides[2].body,'خصم 50\u2009%');
  assert.equal(out.remaining.length,0);
  assert.ok(CS.qa.lintText('نص\u0001',{allow:['\u0001']}).some(i=>i.rule==='ORTHO-ENC-007'));
});

test("encoding repairs preserve opaque metadata and run before clitic attachment", () => {
  const {CS}=load(),spec=cleanSpec();
  spec.ext={url:'https://مثال.کوم/٥\u0001'};
  spec.slides[2].body='ل\u0001ـ Google';
  const out=CS.qa.autofix(spec,CS.qa.runText({spec},{gates:['O1','B1']}));
  assert.equal(out.spec.ext.url,'https://مثال.کوم/٥');
  assert.equal(out.spec.slides[2].body,'لـGoogle');
});

test("the complete eight-field caption pack is checked and repaired", () => {
  const {CS}=load(),spec=cleanSpec();
  spec.captionPack={firstLine:'عنوان\u0001',keywordLine:'تفصيل\u0001',body:'Opus\u0001 5.5',cta:'احفظه\u0001',perSlide:['نص\u0001','شرح\u0001'],alt:['وصف\u0001','صورة\u0001']};
  const found=CS.qa.runText({spec},{gates:['O1']}).filter(f=>f.rule==='O1.ortho-enc-007');
  assert.equal(found.length,8);
  const repaired=CS.qa.autofix(spec,found);
  assert.equal(repaired.applied.length,8);assert.equal(JSON.stringify(repaired.spec.captionPack).includes('\\u0001'),false);
});

test("copy repairs keep URLs opaque while removing hidden controls", () => {
  const {CS}=load(),spec=cleanSpec();spec.slides[2].body='رابط https://مثال.کوم/نص,نص';
  const out=CS.qa.autofix(spec,CS.qa.runText({spec},{gates:['O1']}));
  assert.equal(out.spec.slides[2].body,spec.slides[2].body);
  assert.ok(CS.qa.lintText('https://مثال.کوم/نص\u0001').some(i=>i.rule==='ORTHO-ENC-007'));
});
