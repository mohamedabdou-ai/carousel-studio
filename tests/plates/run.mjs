// Run explicitly: node --test tests/plates/run.mjs (uses the real engine and Chrome).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { deflateSync } from "node:zlib";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const script = path.join(root, "plugins/carousel-studio/skills/carousel-design/scripts/plates.mjs");
const write = (p, v) => fs.writeFileSync(p, JSON.stringify(v, null, 2) + "\n", "utf8");
const read = p => JSON.parse(fs.readFileSync(p, "utf8"));
function png() {
  const w = 1000, h = 800, data = Buffer.alloc(h * (1 + w * 3));
  let seed = 7;
  for (let y = 0; y < h; y++) for (let x = 0; x < w * 3; x++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    data[y * (1 + w * 3) + x + 1] = seed >>> 24;
  }
  function chunk(type, bytes) {
    const body = Buffer.concat([Buffer.from(type), bytes]), head = Buffer.alloc(4), tail = Buffer.alloc(4);
    head.writeUInt32BE(bytes.length); let crc = 0xffffffff;
    for (const b of body) { crc ^= b; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); }
    tail.writeUInt32BE((crc ^ 0xffffffff) >>> 0); return Buffer.concat([head, body, tail]);
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(w); header.writeUInt32BE(h, 4); header[8] = 8; header[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", deflateSync(data)), chunk("IEND", Buffer.alloc(0))]);
}

test("slots and apply use real text, preserve originals, replay after rebuild and recrop after restyle", { timeout: 600000 }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cs-plates-test-")), specFile = path.join(dir, "spec.json");
  const args = ["--dir", dir, "--format", "json", "--timeout", "60000"];
  function cli(command, extra = [], expected = 0) {
    const r = spawnSync(process.execPath, [script, command, ...args, ...extra], { cwd: root, env: { ...process.env, PYTHONIOENCODING: "utf-8" }, encoding: "utf8", timeout: 120000, windowsHide: true, maxBuffer: 5e6 });
    assert.equal(r.status, expected, `${command}: ${r.error || ""}\n${r.stderr}\n${r.stdout}`);
    return JSON.parse(r.stdout);
  }
  try {
    const originalSpec = read(path.join(root, "tests/plates/post.spec.json"));
    write(specFile, originalSpec); fs.mkdirSync(path.join(dir, "plates"));
    const image = png(), source = path.join(dir, "plates", "original.png"); fs.writeFileSync(source, image);
    const slots = cli("slots");
    const frame = id => slots.slides.find(r => r.slideId === id);
    assert.equal(frame("s07").supported, false);
    assert.match(frame("s07").reason, /free/i);
    assert.ok(frame("s02").ratio > 1);
    assert.notEqual(frame("s02").ratio, frame("s03").ratio, "real text changes the mat ratio");
    for (const id of ["s04", "s05", "s06"]) assert.equal(frame(id).supported, true, id);
    const beforeFit = fs.readFileSync(specFile);
    const fit = cli("fit", ["--slide", "s02", "--source", "original.png", "--gravity", "top", "--crop"]);
    assert.equal(fs.readFileSync(fit.pictures[0].out).subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
    assert.deepEqual(fs.readFileSync(specFile), beforeFit);
    cli("embed", ["--slide", "s02", "--source", "original.png", "--prompt-id", "p-s02", "--tool", "fixture-image", "--text-checked-at", "2026-11-11T08:00:00Z"]);
    assert.equal(read(specFile).assets[0].id, "plate-s02");
    assert.equal(read(path.join(dir, "plates/plates.json")).plates[0].textCheck.sha256.length, 64);
    write(specFile, originalSpec);
    const records = ["s01", "s02", "s03", "s04", "s05", "s06"].map(slideId => ({ slideId, source: "original.png", promptId: "p-" + slideId, tool: "fixture-image", mode: "pad", flip: slideId === "s03", textCheck: { textChecked: true, at: "2026-11-11T08:00:00Z" } }));
    records[0].layout = { type: "cover", variant: "split", slot: "photo" };
    write(path.join(dir, "plates/plates.json"), { version: 1, plates: records });
    const firstApply = cli("apply");
    assert.equal(firstApply.pictures[0].variant, frame("s01").variant);
    assert.equal(firstApply.pictures[0].requestedVariant, "split");
    const applied = read(specFile), bytes = fs.readFileSync(specFile);
    assert.equal(applied.rev, 2); assert.deepEqual(fs.readFileSync(source), image);
    assert.equal(applied.ext.fixtureNote, originalSpec.ext.fixtureNote);
    for (const a of applied.assets) { assert.ok(a.ref.length <= 90000); assert.ok(a.width > 0 && a.height > 0); assert.equal(applied.ext.assetChecks[a.id].textChecked, true); }
    cli("apply"); assert.deepEqual(fs.readFileSync(specFile), bytes, "replay is byte-idempotent");
    fs.appendFileSync(source, Buffer.from([0]));
    cli("apply", [], 2); assert.deepEqual(fs.readFileSync(specFile), bytes, "a changed original cannot reuse its check");
    fs.writeFileSync(source, image);
    assert.deepEqual(cli("check").findings, []);
    const restyled = structuredClone(applied); restyled.style.presetId = "creator@1.0"; write(specFile, restyled);
    const stale = cli("check", [], 1); assert.ok(stale.findings.some(f => f.code === "ratio"));
    cli("restyle"); assert.deepEqual(cli("check").findings, []);
    write(specFile, originalSpec); cli("apply"); assert.deepEqual(read(specFile).assets, applied.assets, "durable manifest survives a rebuilt spec");
    const before = fs.readFileSync(specFile); records[1].textCheck.textChecked = false;
    write(path.join(dir, "plates/plates.json"), { version: 1, plates: records });
    cli("apply", [], 2); assert.deepEqual(fs.readFileSync(specFile), before, "failure leaves the spec intact");
    records[1].textCheck.textChecked = true; records[1].source = "broken.png";
    fs.writeFileSync(path.join(dir, "plates/broken.png"), "invalid pixels");
    write(path.join(dir, "plates/plates.json"), { version: 1, plates: records });
    cli("apply", [], 65); assert.deepEqual(fs.readFileSync(specFile), before, "a late decoding failure leaves the entire spec intact");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
