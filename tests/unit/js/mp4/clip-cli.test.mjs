import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { resolveCoverClip } from "../../../../plugins/carousel-studio/skills/carousel-design/scripts/cover_video.mjs";

test("CLI accepts only an existing post-local cover file", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cs-clip-local-"));
  try {
    const specFile = path.join(root, "spec.json"), file = "assets/own.mp4";
    fs.mkdirSync(path.join(root, "assets")); fs.writeFileSync(path.join(root, file), "synthetic");
    const spec = { cover: { motion: { clip: { file } } } };
    assert.equal(resolveCoverClip(specFile, spec).file, fs.realpathSync(path.join(root, file)));
    for (const bad of ["../own.mp4", "https://example.test/a.mp4", "C:/a.mp4", "a%2fb", "a\\b.mp4", "./a.mp4"]) {
      assert.throws(() => resolveCoverClip(specFile, { cover: { motion: { clip: { file: bad } } } }), e => e.code === "E_SCHEMA");
    }
    assert.throws(() => resolveCoverClip(specFile, { cover: { motion: { clip: { file: "gone.mp4" } } } }), e => e.exit === 66);
    assert.equal(resolveCoverClip(specFile, {}), null);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});


test("checker rejects an unknown cover kind before requiring a file or codec tools", () => {
  const result = spawnSync(process.execPath, ["plugins/carousel-studio/skills/carousel-design/scripts/check_video.mjs", "missing.mp4", "--kind", "other"], { encoding: "utf8", windowsHide: true });
  assert.equal(result.status, 64);
  assert.match(result.stderr, /kind/);
});
