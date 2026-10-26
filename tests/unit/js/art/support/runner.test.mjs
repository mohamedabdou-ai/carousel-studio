import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { runCase, resultCode } from "../run.mjs";
import { withArt } from "../harness.mjs";

test("runner fails closed on FAIL, skipped/empty/incomplete execution", async () => {
  await assert.rejects(runCase({ name: "fail", run(t) { t.fail("sentinel"); } }, {}), /sentinel/);
  await assert.rejects(runCase({ name: "skip", run(t) { t.skip("sentinel skip"); } }, {}), { skip: true });
  await assert.rejects(runCase({ name: "hidden skip", skip: true, run() {} }, {}), /marked skipped/);
  await assert.rejects(runCase({ name: "missing" }, {}), /no run/);
  for (const counts of [{pass:0,fail:1,skip:0,total:1}, {pass:1,fail:0,skip:1,total:2}, {pass:0,fail:0,skip:0,total:0}, {pass:1,fail:0,skip:0,total:2}]) assert.equal(resultCode(counts), 1);
  assert.equal(resultCode({pass:2,fail:0,skip:0,total:2}), 0);
});

test("--final refuses fixture and custom data before starting a browser", async () => {
  for (const data of ["fixtures", {}]) await assert.rejects(withArt(() => assert.fail("must not run"), { final: true, data }), /requires real data/);
});

test("the page harness refuses a missing real compose.label", () => {
  const source = fs.readFileSync(new URL("./page.js", import.meta.url), "utf8");
  for (const core of [{}, { compose: {} }]) assert.throws(() => vm.runInNewContext(source, { CS: { core } }), /requires real CS.core.compose.label/);
});

test("each case resets the page before drawing", async () => {
  const calls = [];
  await runCase({ name: "draw", run() { calls.push("draw"); } }, { async reset() { calls.push("reset"); } });
  assert.deepEqual(calls, ["reset", "draw"]);
});

test("builder contexts carry real rules and compose keyed labels deterministically", async () => {
  await withArt(async art => {
    const a = await art.ctx({ preset: 'creator' }), b = await art.ctx({ preset: 'creator' });
    assert.deepEqual(a, b);
    assert.ok(a.rules.platform.plugin.visual.artLabel.arabic > 0);
    const anchor = { kind: 'word', word: 'وضوح' }, o = { preset: 'creator', png: false };
    const first = await art.render(anchor, o), second = await art.render(anchor, o);
    assert.equal(first.html, second.html);
    assert.match(first.html, /data-floor="[1-9][0-9]*"/);
    assert.match(first.html, /data-slot-key="s05.art.0"/);
  });
});
