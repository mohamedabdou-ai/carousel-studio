// B1: report-only must preserve the entire fixture, including file metadata and missing output directories.
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeFixture, overheadOf } from "./fixture.mjs";

// Exclude access time: reading source files is allowed. Include inode/mtime/ctime to catch identical-byte rewrites.
function manifest(root, prefix = "") {
  return readdirSync(root).sort().flatMap((name) => {
    const path = join(root, name), key = prefix + name, stat = statSync(path, { bigint: true });
    const entry = { path: key, ino: String(stat.ino), mtime: String(stat.mtimeNs), ctime: String(stat.ctimeNs) };
    if (stat.isDirectory()) return [entry, ...manifest(path, key + "/")];
    return [{ ...entry, bytes: Number(stat.size), hash: createHash("sha256").update(readFileSync(path)).digest("hex") }];
  });
}

function repeatReadOnly(fx, args, expectedStatus) {
  const before = manifest(fx.root);
  const first = fx.run(...args), second = fx.run(...args);
  for (const result of [first, second]) assert.equal(result.status, expectedStatus, result.stdout + result.stderr);
  assert.equal(second.stdout, first.stdout, "identical input produces identical report bytes");
  assert.equal(second.stderr, first.stderr);
  assert.deepEqual(manifest(fx.root), before, "report/check changes no paths, bytes or write metadata");
  return first;
}

for (const format of ["text", "json"]) {
  for (const existing of [false, true]) {
    test(`--report (${format}, runtime ${existing ? "exists" : "missing"}) writes nothing, twice`, () => {
      const fx = makeFixture([{ module: "qa" }, { module: "visual" }]);
      try {
        if (existing) {
          mkdirSync(fx.runtime, { recursive: true });
          writeFileSync(join(fx.runtime, "cs-qa.js"), "stale runtime\r\n", "utf8");
        }
        const result = repeatReadOnly(fx, ["--report", "--format", format], 0);
        assert.doesNotMatch(result.stdout, /wrote /);
        if (format === "json") {
          const row = JSON.parse(result.stdout).chunks.find((r) => r.chunk === "cs-qa.js");
          assert.equal(row.ceiling, 176000);
          assert.equal(row.committed, existing ? Buffer.byteLength("stale runtime\n") : null);
          assert.equal(row.delta, existing ? row.bytes - row.committed : null);
        } else assert.match(result.stdout, /^chunk\s+bytes/m);
        if (!existing) assert.equal(existsSync(fx.runtime), false);
      } finally { fx.cleanup(); }
    });
  }
}

test("--report honours --module without creating output", () => {
  const fx = makeFixture([{ module: "core" }, { module: "qa" }]);
  try {
    const result = repeatReadOnly(fx, ["--module", "core", "--report", "--format", "json"], 0);
    assert.deepEqual(JSON.parse(result.stdout).chunks.map((r) => r.chunk), ["cs-core.js"]);
  } finally { fx.cleanup(); }
});

test("--out explicitly opts into writing with --report; repeated builds have identical bytes", () => {
  const fx = makeFixture([{ module: "visual" }]);
  try {
    const out = join(fx.root, "private");
    const first = fx.run("--out", out, "--report", "--format", "json");
    assert.equal(first.status, 0, first.stderr);
    const file = join(out, "cs-visual.js"), bytes = readFileSync(file);
    const second = fx.run("--report", "--format", "json", "--out", out);
    assert.equal(second.status, 0, second.stderr);
    assert.equal(second.stdout, first.stdout);
    assert.deepEqual(readFileSync(file), bytes);
    assert.equal(JSON.parse(second.stdout).chunks[0].bytes, bytes.length);
    assert.equal(existsSync(fx.runtime), false);
  } finally { fx.cleanup(); }
});

test("explicit --out equal to the default is still a build request", () => {
  const fx = makeFixture([{ module: "visual" }]);
  try {
    assert.equal(fx.run("--report", "--out", fx.runtime).status, 0);
    const before = readFileSync(join(fx.runtime, "cs-visual.js"));
    assert.equal(fx.run("--out", fx.runtime, "--report").status, 0);
    assert.deepEqual(readFileSync(join(fx.runtime, "cs-visual.js")), before);
  } finally { fx.cleanup(); }
});

test("--check --report stays read-only and returns 2 for stale or missing output, 0 for matching output", () => {
  const fx = makeFixture([{ module: "visual" }]);
  try {
    const args = ["--report", "--format", "json", "--check"];
    repeatReadOnly(fx, args, 2);
    assert.equal(fx.run().status, 0);
    repeatReadOnly(fx, args, 0);
    writeFileSync(join(fx.runtime, "cs-visual.js"), "stale\n", "utf8");
    repeatReadOnly(fx, args, 2);
    repeatReadOnly(fx, [...args, "--out", join(fx.root, "missing")], 2);
  } finally { fx.cleanup(); }
});

test("--report still enforces ceilings, reports the overrun and writes nothing", () => {
  const fx = makeFixture([{ module: "qa", files: { "a.js": 176001 - overheadOf("qa") } }]);
  try {
    const result = repeatReadOnly(fx, ["--report", "--format", "json"], 70);
    const row = JSON.parse(result.stdout).chunks[0];
    assert.equal(row.bytes, 176001);
    assert.equal(row.headroom, -1);
    assert.equal(row.status, "OVER");
  } finally { fx.cleanup(); }
});
