// tests/unit/js/build/ceilings.test.mjs · tools/build.mjs: chunk names, CHUNK_CEILINGS (IS-1), --report, --check.
// Every case builds a throwaway fixture tree with the real tools/build.mjs copied into it (fixture.mjs).
// Run: node --test "tests/unit/js/build/*.test.mjs"
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeFixture, overheadOf, REAL_ROOT } from "./fixture.mjs";
import { spawnSync } from "node:child_process";

const KIB = 1024;
/* IS-1, written out again on purpose: the test is the second copy that catches a typo in the tool. cs-ui.js is the one chunk over its
 * ceiling today, so the tool holds it at its current size (INTERIM_CEILINGS) until the entry is deleted; this file follows that entry. */
const INTERIM = JSON.parse(readFileSync(join(REAL_ROOT, "tools", "build.mjs"), "utf8").match(/const INTERIM_CEILINGS = (\{[^}]*\});/)[1]);
const UI_TARGET = 201000;
const CEILINGS = {
  "cs-core.js": 203400, "cs-qa.js": 176000, "cs-ui.js": INTERIM["cs-ui.js"] ?? UI_TARGET,
  "cs-visual.js": 190 * KIB, "cs-art.js": 190 * KIB, "cs-visual-ui.js": 190 * KIB, "cs-qa-visual.js": 190 * KIB,
  "cs-brandbook.js": 190 * KIB, "cs-export.js": 190 * KIB, "cs-hf.js": 190 * KIB, "cs-motion.js": 190 * KIB, "cs-mp4.js": 190 * KIB, "cs-paint.js": 190 * KIB
};
const moduleOf = (chunk) => chunk.slice(3, -3);
const report = (fx, ...extra) => JSON.parse(fx.run("--report", "--format", "json", "--out", join(fx.root, "out"), ...extra).stdout);

for (const [chunk, ceiling] of Object.entries(CEILINGS)) {
  test(`${chunk}: a build exactly at its ceiling (${ceiling} B) passes and one byte more exits 70 without writing`, () => {
    const module = moduleOf(chunk);
    const room = ceiling - overheadOf(module);
    const ok = makeFixture([{ module, files: { "a.js": room } }, { module: "zz", files: { "a.js": 50 } }]);
    const bad = makeFixture([{ module, files: { "a.js": room + 1 } }, { module: "zz", files: { "a.js": 50 } }]);
    try {
      const pass = ok.run("--out", join(ok.root, "out"));
      assert.equal(pass.status, 0, pass.stderr);
      assert.ok(existsSync(join(ok.root, "out", chunk)));
      const fail = bad.run("--out", join(bad.root, "out"));
      assert.equal(fail.status, 70, fail.stdout + fail.stderr);
      assert.match(fail.stderr, new RegExp(chunk.replace(".", "\\.") + " is "));
      assert.match(fail.stderr, /over its ceiling of/);
      assert.ok(!existsSync(join(bad.root, "out")), "a failing build writes nothing, not even the chunks that were fine");
    } finally { ok.cleanup(); bad.cleanup(); }
  });
}

test("--report --format json carries the IS-1 ceiling table, the interim cs-ui entry and the planning caps of the four new chunks", () => {
  const fx = makeFixture(Object.keys(CEILINGS).map((c) => ({ module: moduleOf(c), chunk: c })));
  try {
    const doc = report(fx);
    assert.equal(doc.engine, "cs-1.1.1");
    assert.equal(doc.chunks.length, 13);
    for (const row of doc.chunks) {
      assert.equal(row.ceiling, CEILINGS[row.chunk], row.chunk);
      assert.equal(row.headroom, row.ceiling - row.bytes);
      assert.equal(row.status, "ok");
      assert.equal(row.committed, null);
      assert.equal(row.delta, null);
    }
    const ui = doc.chunks.find((r) => r.chunk === "cs-ui.js");
    assert.equal(ui.targetCeiling, UI_TARGET);
    assert.equal(ui.interim, "cs-ui.js" in INTERIM);
    assert.deepEqual(doc.chunks.filter((r) => r.interim).map((r) => r.chunk), Object.keys(INTERIM));
    const caps = Object.fromEntries(doc.chunks.filter((r) => r.planningCap !== null).map((r) => [r.chunk, r.planningCap / KIB]));
    assert.deepEqual(caps, { "cs-art.js": 150, "cs-qa-visual.js": 60, "cs-visual-ui.js": 60, "cs-visual.js": 120 });
  } finally { fx.cleanup(); }
});

test("an interim ceiling is always looser than its target, so deleting the entry can only tighten the build", () => {
  const target = { "cs-ui.js": UI_TARGET };   // IS-1; the entry is deleted once cs-ui.js is under it
  assert.ok(Object.keys(INTERIM).every((c) => c === "cs-ui.js"), "only cs-ui.js was ever over its ceiling");
  for (const [chunk, bytes] of Object.entries(INTERIM)) assert.equal(bytes, 203991, `${chunk}: pinned at the size it had when the ceilings began`);
  for (const [chunk, bytes] of Object.entries(INTERIM)) assert.ok(bytes > target[chunk], chunk);
});

test("a chunk above its planning cap is flagged in the report but still builds (exit 0)", () => {
  const fx = makeFixture([{ module: "visual", files: { "a.js": 121 * KIB } }]);
  try {
    const res = fx.run("--report", "--format", "json", "--out", join(fx.root, "out"));
    assert.equal(res.status, 0, res.stderr);
    assert.equal(JSON.parse(res.stdout).chunks[0].status, "over cap");
  } finally { fx.cleanup(); }
});

test("the 200 KiB limit is still the last line, with its own message", () => {
  const fx = makeFixture([{ module: "hf", files: { "a.js": 205000 } }]);
  try {
    const res = fx.run("--out", join(fx.root, "out"));
    assert.equal(res.status, 70);
    assert.match(res.stderr, /the limit is 200 KiB/);
  } finally { fx.cleanup(); }
});

/* ---- chunk names ----------------------------------------------------------------------------------------------------- */

test("hyphenated chunk names are accepted (B-2)", () => {
  const fx = makeFixture([
    { module: "visual-ui", chunk: "cs-visual-ui.js" }, { module: "qa-visual", chunk: "cs-qa-visual.js" }, { module: "abc", chunk: "cs-a-b-c.js" }, { module: "plain", chunk: "cs-plain.js" }
  ]);
  try {
    const res = fx.run("--list");
    assert.equal(res.status, 0, res.stderr);
    for (const name of ["cs-visual-ui.js", "cs-qa-visual.js", "cs-a-b-c.js", "cs-plain.js"]) assert.match(res.stdout, new RegExp("^" + name.replace(/\./g, "\\.") + "  <-", "m"));
    const built = fx.run("--out", join(fx.root, "out"));
    assert.equal(built.status, 0, built.stderr);
    assert.ok(existsSync(join(fx.root, "out", "cs-qa-visual.js")));
  } finally { fx.cleanup(); }
});

for (const bad of ["cs-Visual.js", "cs--x.js", "cs-x-.js", "cs-.js", "visual.js", "cs-x.mjs", "cs-x_y.js", "cs-x.js.js", "cs x.js"]) {
  test(`the chunk name "${bad}" is rejected with exit 70`, () => {
    const fx = makeFixture([{ module: "x", chunk: bad }]);
    try {
      const res = fx.run("--list");
      assert.equal(res.status, 70, res.stdout);
      assert.match(res.stderr, /is not cs-<name>\.js/);
    } finally { fx.cleanup(); }
  });
}

/* ---- --check, header, determinism ------------------------------------------------------------------------------------ */

test("--check stays 0 on an untouched tree, exits 2 when a source or a chunk changed", () => {
  const fx = makeFixture([{ module: "core", files: { "a.js": "var a = 1;\n", "b.js": "var b = 2;\n" } }, { module: "qa-visual" }]);
  try {
    const built = fx.run();
    assert.equal(built.status, 0, built.stderr);
    const clean = fx.run("--check");
    assert.equal(clean.status, 0, clean.stderr);
    assert.match(clean.stdout, /^ok\s+cs-core\.js$/m);
    writeFileSync(join(fx.root, "src", "core", "b.js"), "var b = 3;\n", "utf8");
    const dirty = fx.run("--check");
    assert.equal(dirty.status, 2);
    assert.match(dirty.stdout, /^DIFFERS\s+cs-core\.js$/m);
    assert.match(dirty.stderr, /E_CONFLICT/);
    const only = fx.run("--check", "--module", "qa-visual");
    assert.equal(only.status, 0, "--module narrows the check to its chunk");
  } finally { fx.cleanup(); }
});

test("--check also normalises line endings, like a Windows checkout", () => {
  const fx = makeFixture([{ module: "core" }]);
  try {
    fx.run();
    const file = join(fx.runtime, "cs-core.js");
    writeFileSync(file, readFileSync(file, "utf8").replace(/\n/g, "\r\n"), "utf8");
    assert.equal(fx.run("--check").status, 0);
  } finally { fx.cleanup(); }
});

test("the chunk header names the engine cs-1.1.1, and two builds are byte-identical", () => {
  const fx = makeFixture([{ module: "visual" }]);
  try {
    fx.run("--out", join(fx.root, "o1"));
    fx.run("--out", join(fx.root, "o2"));
    const a = readFileSync(join(fx.root, "o1", "cs-visual.js"), "utf8");
    assert.ok(a.startsWith("/*! Carousel Studio runtime chunk cs-visual.js · cs-1.1.1 · Apache-2.0 */\n"));
    assert.equal(a, readFileSync(join(fx.root, "o2", "cs-visual.js"), "utf8"));
  } finally { fx.cleanup(); }
});

/* ---- --report text, committed delta, usage ----------------------------------------------------------------------------- */

test("--report prints a table with headroom, the interim footnote, and honours --module", () => {
  const fx = makeFixture([{ module: "ui" }, { module: "core" }, { module: "qa" }]);
  try {
    const all = fx.run("--report", "--out", join(fx.root, "out"));
    assert.equal(all.status, 0, all.stderr);
    const lines = all.stdout.split("\n");
    const head = lines.find((l) => /^chunk\s+bytes/.test(l));
    for (const col of ["KiB", "ceiling", "headroom", "cap", "committed", "delta", "status"]) assert.ok(head.includes(col), col);
    if ("cs-ui.js" in INTERIM) {
      assert.match(all.stdout, /^cs-ui\.js .*203,991\*/m);
      assert.match(all.stdout, /^\* cs-ui\.js: interim ceiling 203,991 B .* the target is 201,000 B/m);
    } else {
      assert.match(all.stdout, /^cs-ui\.js .*201,000\s/m);
      assert.ok(!/interim|\*/.test(all.stdout));
    }
    const one = fx.run("--report", "--module", "core", "--out", join(fx.root, "out2"));
    assert.ok(/^cs-core\.js /m.test(one.stdout) && !/^cs-ui\.js /m.test(one.stdout));
    assert.ok(!/interim/.test(one.stdout));
  } finally { fx.cleanup(); }
});

test("the report compares with the chunk committed in the runtime folder, whatever --out says", () => {
  const fx = makeFixture([{ module: "core", files: { "a.js": 1000 } }]);
  try {
    mkdirSync(fx.runtime, { recursive: true });
    writeFileSync(join(fx.runtime, "cs-core.js"), "x".repeat(900), "utf8");
    const row = report(fx).chunks[0];
    assert.equal(row.committed, 900);
    assert.equal(row.delta, row.bytes - 900);
  } finally { fx.cleanup(); }
});

test("a failing build still prints the report first, so the overrun can be read", () => {
  const room = 190 * KIB - overheadOf("art");
  const fx = makeFixture([{ module: "art", files: { "a.js": room + 500 } }]);
  try {
    const res = fx.run("--report", "--format", "json", "--out", join(fx.root, "out"));
    assert.equal(res.status, 70);
    const row = JSON.parse(res.stdout).chunks[0];
    assert.equal(row.status, "OVER");
    assert.equal(row.headroom, -500);
  } finally { fx.cleanup(); }
});

test("usage errors exit 64 and --help exits 0 with a usage line", () => {
  const run = (...args) => spawnSync(process.execPath, [join(REAL_ROOT, "tools", "build.mjs"), ...args], { encoding: "utf8" });
  assert.equal(run("--help").status, 0);
  assert.match(run("--help").stdout, /usage: node tools\/build\.mjs/);
  assert.match(run("--help").stdout, /--report/);
  assert.equal(run("--format", "json").status, 64);
  assert.equal(run("--report", "--format", "xml").status, 64);
  assert.equal(run("--no-such-flag").status, 64);
  assert.equal(run("--module", "no-such-module").status, 64);
  assert.equal(run("--all", "--module", "core").status, 64);
});

test("the real tree lists the four Round 3 chunks next to the nine of 1.0", () => {
  const res = spawnSync(process.execPath, [join(REAL_ROOT, "tools", "build.mjs"), "--list"], { encoding: "utf8" });
  assert.equal(res.status, 0, res.stderr);
  const names = res.stdout.split("\n").filter(Boolean).map((l) => l.split(/\s+/)[0]);
  assert.ok(names.length >= 13, names.join(" "));
  for (const n of ["cs-visual.js", "cs-art.js", "cs-visual-ui.js", "cs-qa-visual.js", "cs-core.js", "cs-qa.js", "cs-ui.js", "cs-paint.js", "cs-motion.js", "cs-hf.js", "cs-mp4.js", "cs-export.js", "cs-brandbook.js"]) assert.ok(names.includes(n), n);
});
