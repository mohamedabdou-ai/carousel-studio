import test from 'node:test';
import assert from 'node:assert/strict';
import { boot, clone, preset, readJson, SLICE } from './expected/support.mjs';

test('approved demo runs stay at level zero and vary supported readers without changing copy', () => {
  const CS = boot(), source = readJson('tests/fixtures/auto/eg.json')[1];
  const before = JSON.stringify(source);
  const plan = () => CS.visual.plan(source, null, preset('creator'), null, { caps: SLICE });
  const out = plan(), steps = out.slides.filter(s => ['s03', 's04', 's05'].includes(s.id));
  assert.equal(steps.length, 3);
  assert.ok(steps.every(s => s.visual.anchor.kind === 'mock' && !s.visual.relax));
  assert.deepEqual(Array.from(steps, s => s.visual.anchor.mock.kind), ['notes', 'chat', 'notes']);
  assert.ok(!out.notes.some(n => /demo-first|demo-undrawn/.test(n.code)));
  assert.equal(JSON.stringify(plan()), JSON.stringify(out));
  assert.equal(JSON.stringify(source), before);

  const notesOnly = clone(SLICE); notesOnly.art.mock = ['notes'];
  const constrained = CS.visual.plan(source, null, preset('creator'), null, { caps: notesOnly });
  const constrainedSteps = constrained.slides.filter(s => ['s03', 's04', 's05'].includes(s.id));
  assert.equal(constrainedSteps.length, 3);
  assert.ok(constrainedSteps.every(s => s.visual.anchor.mock.kind === 'notes' && !s.visual.relax));
});
