'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const { REPO, DESIGN } = require('./support/stub-core.cjs');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-fix-d-qa-'));
execFileSync(process.execPath, [path.join(REPO, 'tools/build.mjs'), '--module', 'qa', '--out', work], { stdio: 'pipe', windowsHide: true });
process.env.CS_QA_CHUNK = path.join(work, 'cs-qa.js');
const { load, cleanSpec } = require('./support/env.cjs');
const { CS, ctx } = load();
test.after(() => fs.rmSync(work, { recursive: true, force: true }));

for (const kind of ['media', 'logo', 'picture']) test('D1: A1 blocks dangling ' + kind + ' ids and accepts resolved ids', async () => {
  const spec = cleanSpec(), s = kind === 'logo' ? spec.slides[0] : spec.slides[2];
  if (kind === 'media') s.media = { slot: 'photo', assetId: 'missing' };
  if (kind === 'logo') spec.cover = { logo: { assetId: 'missing' } };
  if (kind === 'picture') s.free = { html: '<div data-picture="missing"></div>', css: '' };
  const run = async () => Array.from(await CS.qa.runExport({ spec, files: [] }, { gates: ['A1'] })).filter(r => r.rule === 'A1.asset-missing');
  const missing = await run();
  assert.equal(missing.length, 1);
  assert.equal(missing[0].sev, 'BLOCK');
  assert.equal(missing[0].slide, s.id);
  spec.assets = [{ id: 'missing', kind: 'image', ref: 'asset:missing' }];
  assert.equal((await run()).length, 0);
});

test('D4: a picture with a dropped invalid class is refused, including a quoted >', () => {
  CS.visual = { _: { block: id => id === 'cs-free-design' ? JSON.parse(fs.readFileSync(path.join(DESIGN, 'data/free-design.json'), 'utf8')) : null } };
  vm.runInContext(fs.readFileSync(path.join(REPO, 'src/visual/free.js'), 'utf8'), ctx);
  for (const value of ['f-photo >', 'f-photo BAD', 'f-photo &#62;', 'javascript:x']) {
    assert.throws(() => CS.visual.free.sanitize('<div class="' + value + '" data-picture="ai-photo"></div>'), { code: 'E_FREE_HTML' }, value);
  }
  assert.equal(CS.visual.free.sanitize('<div class=" f-photo   cs-card " data-picture="ai-photo"></div>'), '<div class="f-photo cs-card" data-picture="ai-photo"></div>');
});

test('D12: C6 counts mixed unnumbered item/step lists and still blocks a wrong promise', () => {
  for (const architecture of ['steps', 'listicle']) {
    const spec = cleanSpec(); spec.architecture = architecture;
    spec.slides.forEach(s => { delete s.ord; });
    spec.slides.filter(s => s.type === 'item').slice(2).forEach(s => { s.type = 'step'; });
    const run = () => Array.from(CS.qa.runText({ spec }, { gates: ['C6'] })).filter(r => r.rule === 'C6.list-count');
    spec.slides[0].headline = '5 خطوات واضحة'; spec.slides[0].kicker = '';
    assert.equal(run().length, 0, architecture);
    spec.slides[0].headline = '4 خطوات واضحة';
    assert.equal(run()[0]?.sev, 'BLOCK', architecture);
  }
});

test('D13: C7 posts=1 ignores prior posts but still enforces the current-post limit', () => {
  const spec = cleanSpec(), history = [{ family: 'P1' }, { family: 'P1' }];
  const run = (posts, count) => Array.from(CS.qa.runText({ spec, history, familyLimits: { P1: { posts, count } } }, { gates: ['C7'] })).filter(r => r.rule === 'C7.max-use');
  assert.equal(run(1, 1).length, 0);
  assert.equal(run(1, 0)[0]?.rule, 'C7.max-use');
  assert.equal(run(2, 1)[0]?.rule, 'C7.max-use');
  assert.equal(run(2, 2).length, 0);
});
