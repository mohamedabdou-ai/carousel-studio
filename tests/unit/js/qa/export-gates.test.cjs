"use strict";
/* Export-scope gates of cs-qa: D1 file format, V1 cover video, X1 clean export.
 * Files are synthetic buffers with just enough structure for the header readers. */

const test = require("node:test");
const assert = require("node:assert/strict");
const { load, cleanSpec } = require("./support/env.cjs");

const { CS } = load();
const positive = (gates) => Object.fromEntries(Object.entries(gates).filter(([, n]) => n > 0));
const plain = (v) => JSON.parse(JSON.stringify(v));
const ids = (res) => res.map((r) => r.rule);
const cp = (...codes) => String.fromCodePoint(...codes);
// The owner's name, spelled from code points so this test file stays name-free.
const OWNER_AR = cp(1605, 1581, 1605, 1583, 32, 1593, 1576, 1583, 1607);
const OWNER_EN = cp(77, 111, 104, 97, 109, 101, 100, 32, 65, 98, 100, 111, 117);

/* ------------------------------------------------------------ builders */

const u32 = (n) => {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n >>> 0);
  return b;
};
const chunk = (type, data) => Buffer.concat([u32(data.length), Buffer.from(type, "latin1"), data, Buffer.alloc(4)]);

function png(w, h, o) {
  o = o || {};
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = o.colorType === undefined ? 2 : o.colorType;
  const parts = [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr)];
  if (o.text) parts.push(chunk("tEXt", Buffer.from("Author\0someone")));
  if (o.trns) parts.push(chunk("tRNS", Buffer.from([0])));
  if (o.iccp) parts.push(chunk("iCCP", Buffer.concat([Buffer.from(o.iccp + "\0\0"), Buffer.alloc(4)])));
  parts.push(chunk("IDAT", Buffer.alloc(8)), chunk("IEND", Buffer.alloc(0)));
  return new Uint8Array(Buffer.concat(parts));
}

function jpeg(w, h, o) {
  o = o || {};
  const seg = (m, data) => Buffer.concat([Buffer.from([0xff, m, (data.length + 2) >> 8, (data.length + 2) & 255]), data]);
  const parts = [Buffer.from([0xff, 0xd8]), seg(0xe0, Buffer.from("JFIF\0\x01\x01\0\0\x01\0\x01\0\0", "latin1"))];
  if (o.exif) parts.push(seg(0xe1, Buffer.from("Exif\0\0data", "latin1")));
  const sof = Buffer.alloc(15);
  sof[0] = 8;
  sof.writeUInt16BE(h, 1);
  sof.writeUInt16BE(w, 3);
  sof[5] = o.components || 3;
  parts.push(seg(0xc0, sof), Buffer.from([0xff, 0xd9]));
  if (o.pad) parts.push(Buffer.alloc(o.pad));
  return new Uint8Array(Buffer.concat(parts));
}

function box(type, ...payload) {
  const body = Buffer.concat(payload);
  return Buffer.concat([u32(8 + body.length), Buffer.from(type, "latin1"), body]);
}

function mp4(o) {
  o = Object.assign({ w: 1080, h: 1440, fps: 30, frames: 180, faststart: true, profile: 0x64, level: 0x28, audio: false, personal: false, syncFirst: 1 }, o);
  const scale = 30000;
  const delta = Math.round(scale / o.fps);
  const ftyp = box("ftyp", Buffer.from("isom"), u32(512), Buffer.from("isomiso2avc1mp41"));
  const tkhd = Buffer.alloc(84);
  tkhd.writeUInt32BE(o.w * 65536, 76);
  tkhd.writeUInt32BE(o.h * 65536, 80);
  const mdhd = Buffer.alloc(24);
  mdhd.writeUInt32BE(scale, 12);
  mdhd.writeUInt32BE(delta * o.frames, 16);
  const hdlr = (t) => Buffer.concat([Buffer.alloc(8), Buffer.from(t), Buffer.alloc(13)]);
  const avcC = box("avcC", Buffer.from([1, o.profile, 0, o.level, 0xff, 0xe1, 0, 0]));
  const entry = Buffer.concat([u32(86 + avcC.length), Buffer.from("avc1"), Buffer.alloc(78), avcC]);
  const stsd = box("stsd", Buffer.alloc(4), u32(1), entry);
  const stts = box("stts", Buffer.alloc(4), u32(1), u32(o.frames), u32(delta));
  const stsz = box("stsz", Buffer.alloc(4), u32(0), u32(o.frames));
  const stss = box("stss", Buffer.alloc(4), u32(2), u32(o.syncFirst), u32(o.frames - 29));
  const video = box("trak", box("tkhd", tkhd), box("mdia", box("mdhd", mdhd), box("hdlr", hdlr("vide")), box("minf", box("stbl", stsd, stts, stsz, stss))));
  const traks = [video];
  if (o.audio) {
    traks.push(box("trak", box("tkhd", Buffer.alloc(84)), box("mdia", box("mdhd", mdhd), box("hdlr", hdlr("soun")), box("minf", box("stbl", box("stsd", Buffer.alloc(4), u32(1), Buffer.concat([u32(16), Buffer.from("mp4a"), Buffer.alloc(8)])))))));
  }
  const udta = o.personal ? box("udta", box("©ART", Buffer.from("someone"))) : Buffer.alloc(0);
  const moov = box("moov", ...traks, udta);
  const mdat = box("mdat", Buffer.alloc(64));
  return new Uint8Array(Buffer.concat(o.faststart ? [ftyp, moov, mdat] : [ftyp, mdat, moov]));
}

function pdf(o) {
  o = o || {};
  return new Uint8Array(Buffer.from("%PDF-1.4\n1 0 obj\n<< /Producer (" + (o.producer || "Carousel Studio") + ") /Title (Post)" + (o.author ? " /Author (" + o.author + ")" : "") + " >>\nendobj\n%%EOF", "latin1"));
}

const text = (s) => new Uint8Array(Buffer.from(s, "utf8"));
const file = (path, bytes, mime) => ({ path, name: path.split("/").pop(), mime: mime || "application/octet-stream", bytes });

function goodKit(spec) {
  return [
    file("3x4/01-cover.png", png(1080, 1440)),
    file("3x4/02.png", png(1080, 1440)),
    file("4x5/01-cover.jpg", jpeg(1080, 1350)),
    file("4x5/02.jpg", jpeg(1080, 1350)),
    file("3x4/01-cover.mp4", mp4()),
    file("carousel.pdf", pdf()),
    file("caption.txt", text("مرحبا بكم في البوست")),
    file("spec.json", text(JSON.stringify(spec)))
  ];
}

const specWithMotion = () => {
  const s = cleanSpec();
  s.cover = { motion: { recipe: "calm", seconds: 6, fps: 30, source: "internal" } };
  return s;
};

const exportRun = async (spec, files, extra) => plain(await CS.qa.runExport(Object.assign({ spec, files }, extra || {})));

/* --------------------------------------------------------------- tests */

test("a well-formed kit passes D1, V1 and X1", async () => {
  const spec = specWithMotion();
  const res = await exportRun(spec, goodKit(spec), { expected: ["3x4/01-cover.png", "3x4/02.png", "caption.txt"] });
  assert.deepEqual(res, []);
});

test("export execution counts include clean and failing gates and merge into full reports", async () => {
  const spec = specWithMotion();
  const input = { spec, files: goodKit(spec) };
  const expected = { D1: 1, V1: 1, X1: 1, A1: 1 };
  const a = await CS.qa.runExport(input), b = await CS.qa.runExport(input);
  assert.deepEqual(plain(a), []);
  assert.deepEqual(plain(a), plain(b));
  assert.deepEqual(positive(plain(a.stats.gates)), expected);
  assert.deepEqual(plain(a.stats), plain(b.stats));
  const opts = { gates: Object.keys(expected), createdAt: "2026-10-23T00:00:00Z" };
  for (const files of [input.files, [file("3x4/01-cover.png", png(100, 100))]]) {
    const x = await CS.qa.run({ spec, files }, opts), y = await CS.qa.run({ spec, files }, opts);
    assert.deepEqual(plain(x), plain(y));
    assert.deepEqual(positive(plain(x.results.stats.gates)), expected);
    assert.deepEqual(plain(x.results.stats), plain(y.results.stats));
    if (files !== input.files) assert.ok(x.results.length > 0);
  }
  const filtered = await CS.qa.runExport(input, { gates: ["D1"] });
  assert.deepEqual(positive(plain(filtered.stats.gates)), { D1: 1 });
});

test("D1: sizes, alpha, ratio, colour profile and JPEG weight", async () => {
  const spec = specWithMotion();
  const files = [
    file("3x4/01-cover.png", png(1080, 1350)),
    file("3x4/02.png", png(1080, 1440, { colorType: 6 })),
    file("3x4/03.png", png(1080, 1440, { iccp: "Display P3" })),
    file("4x5/01.jpg", jpeg(1080, 1440)),
    file("4x5/02.jpg", jpeg(1080, 1350, { pad: 8100000 })),
    file("4x5/03.jpg", jpeg(1080, 1350, { components: 1 })),
    file("4x5/broken.jpg", new Uint8Array([1, 2, 3, 4]))
  ];
  const res = (await exportRun(spec, files)).filter((r) => r.gate === "D1");
  ["D1.png-size", "D1.jpeg-size", "D1.alpha", "D1.srgb", "D1.jpeg-bytes", "D1.ratio", "D1.decode"].forEach((r) => assert.ok(ids(res).includes(r), r));
  assert.ok(res.every((r) => r.sev === "BLOCK"));
  const size = res.find((r) => r.rule === "D1.png-size");
  assert.match(size.msg.en, /3x4\/01-cover\.png is 1080×1350; expected 1080×1440/);
});

test("V1: encoding facts of the cover video", async () => {
  const spec = specWithMotion();
  const bad = [
    file("3x4/01-cover.mp4", mp4({ w: 1080, h: 1350, fps: 24, frames: 100, faststart: false, audio: true, syncFirst: 5, profile: 0x4d }))
  ];
  const res = await exportRun(spec, bad);
  ["V1.size", "V1.fps", "V1.frames", "V1.faststart", "V1.audio", "V1.keyframe", "V1.profile"].forEach((r) => assert.ok(ids(res).includes(r), r));
  assert.equal(res.find((r) => r.rule === "V1.profile").sev, "FIX");
});

test("V1: pixel format, range, colour tags and level (what the Studio reads from its SPS, what check_video.mjs reads from ffprobe)", async () => {
  const spec = specWithMotion();
  const bt709 = { primaries: "bt709", transfer: "bt709", matrix: "bt709" };
  const run = (video, o) => exportRun(spec, [file("3x4/01-cover.mp4", mp4(o))], { video });
  assert.deepEqual(await run({ pixFmt: "yuv420p", range: "tv", colour: bt709 }), [], "yuv420p, limited range, BT.709, level 4.0");
  assert.deepEqual(await run({ pixFmt: "yuv420p", range: "unspecified", colour: { primaries: null, transfer: null, matrix: null } }), [], "an untagged file is not accused of anything");
  assert.deepEqual(await run({ pixFmt: "yuv420p", range: "tv", colour: bt709 }, { level: 0x29 }), [], "level 4.1 is the ceiling");
  const full = await run({ pixFmt: "yuvj420p", range: "pc", colour: { primaries: "bt709", transfer: "iec61966-2-1", matrix: "smpte170m" } }, { level: 0x32 });
  assert.deepEqual(ids(full), ["V1.range", "V1.colour", "V1.level"], "full range is one finding (yuvj is its pixel format), then the odd tags, then level 5.0");
  assert.deepEqual(full.map((r) => r.sev), ["BLOCK", "FIX", "FIX"]);
  assert.match(full[1].msg.en, /transfer iec61966-2-1, matrix smpte170m/);
  assert.match(full[2].msg.en, /level is 5\.0, above 4\.1/);
  const odd = await run({ pixFmt: "yuv444p", range: "tv", colour: bt709 });
  assert.deepEqual(ids(odd), ["V1.pixfmt"]);
  assert.equal(odd[0].sev, "BLOCK");
  assert.match((await run({ pixFmt: "yuv420p", range: "tv" }, { level: 0x2a }))[0].msg.en, /level is 4\.2, above 4\.1/, "the level comes from the file's own bytes even when the exporter says nothing about it");
  assert.deepEqual(await run({ level: 40 }, { level: 0x28 }), [], "a level the exporter reports (ffprobe) is accepted when the bytes agree");
});

test("V1: the 4:5 variant is judged at 1080×1350 and loop results come from the exporter", async () => {
  const spec = specWithMotion();
  const ok = await exportRun(spec, [file("4x5/01-cover.mp4", mp4({ h: 1350 }))]);
  assert.deepEqual(ok, []);
  const res = await exportRun(spec, [file("3x4/01-cover.mp4", mp4())], {
    video: { loopSsim: 0.98, loopPsnr: 40, blankFrames: 3, flashesPerSecondMax: 5, closedGop: false }
  });
  ["V1.loop", "V1.blank", "V1.flashes", "V1.closed-gop"].forEach((r) => assert.ok(ids(res).includes(r), r));
  const good = await exportRun(spec, [file("3x4/01-cover.mp4", mp4())], { video: { loop: { frame0VsPoster: { ssim: 1, psnr: 99 }, lastVsFrame0: { ssim: 0.9999, psnr: 60 } } } });
  assert.deepEqual(good, []);
});

test("V1: no video, or motion switched off, is only a NOTE", async () => {
  const spec = specWithMotion();
  let res = await exportRun(spec, [file("3x4/01-cover.png", png(1080, 1440))]);
  assert.deepEqual(ids(res), ["V1.static"]);
  assert.equal(res[0].sev, "NOTE");
  spec.cover.motion.recipe = "none";
  res = await exportRun(spec, [file("3x4/01-cover.mp4", mp4())]);
  assert.deepEqual(ids(res), ["V1.static"]);
});

test("inspectMp4 reads size, frames, rate, keyframes and codec", () => {
  const info = plain(CS.qa.inspectMp4(mp4()));
  assert.equal(info.width, 1080);
  assert.equal(info.height, 1440);
  assert.equal(info.frames, 180);
  assert.equal(info.fps, 30);
  assert.equal(info.seconds, 6);
  assert.equal(info.moovBeforeMdat, true);
  assert.equal(info.keyframeAtZero, true);
  assert.equal(info.audio, "none");
  assert.match(info.codec, /^avc1\.640028$/);
  assert.equal(CS.qa.inspectMp4(mp4({ faststart: false })).moovBeforeMdat, false);
  assert.equal(CS.qa.inspectMp4(mp4({ audio: true })).audio, "silent-aac");
});

test("X1: credit text and the owner's name are found in any file", async () => {
  const spec = specWithMotion();
  for (const leak of [OWNER_AR, OWNER_EN, "@" + OWNER_EN.toLowerCase().replace(" ", ".") + "90", "https://store." + cp(112, 121, 114, 97, 97, 105) + ".cloud"]) {
    const files = goodKit(spec).concat([file("posting-guide.md", text("# guide\nmade with ♥ by " + leak))]);
    const res = await exportRun(spec, files);
    assert.deepEqual(ids(res), ["X1.credit"], leak.length + "-char leak");
    assert.equal(res[0].msg.en.includes(leak), false, "the message never repeats the leaked text");
  }
  const line = goodKit(spec).concat([file("a.txt", text(cp(1589, 1606, 1593, 32, 1576, 1608, 1575, 1587, 1591, 1577, 32) + OWNER_AR))]);
  assert.ok(ids(await exportRun(spec, line)).includes("X1.credit"));
});

test("X1: a user who is named like the owner is not blocked for their own brand strings", async () => {
  const spec = specWithMotion();
  const brand = { name: OWNER_EN, handle: "@" + OWNER_EN.toLowerCase().replace(" ", ""), slug: "x-brand" };
  const files = goodKit(spec).concat([file("cover.hf.html", text("<div>" + brand.handle + "</div><p>" + brand.name + "</p>"))]);
  assert.deepEqual(await exportRun(spec, files, { brand }), []);
  // ...but the credit line itself is still caught
  const leak = goodKit(spec).concat([file("x.txt", text("Made by " + OWNER_EN))]);
  assert.ok(ids(await exportRun(spec, leak, { brand })).includes("X1.credit"));
});

test("X1: a name the creator lists under identity.otherNames is their own, not a credit", async () => {
  const spec = specWithMotion();
  const own = cp(80, 121, 114, 97, 109, 101, 100, 105, 97, 88);
  const files = goodKit(spec).concat([file("hashtags.txt", text("#" + own))]);
  assert.ok(ids(await exportRun(spec, files)).includes("X1.credit"), "without the brand entry it is still caught");
  const brand = { name: "Someone Else", handle: "@someone.else", slug: "x-brand", identity: { otherNames: ["#" + own] } };
  assert.deepEqual(await exportRun(spec, files, { brand }), []);
});

test("X1: credit markup, metadata, secrets, fonts and missing files", async () => {
  const spec = specWithMotion();
  const files = [
    file("studio-source.html", text('<html><body><div data-cs-credit>x</div><script>var s="[data-cs-credit]"</script></body></html>')),
    file("3x4/01.png", png(1080, 1440, { text: true })),
    file("4x5/01.jpg", jpeg(1080, 1350, { exif: true })),
    file("carousel.pdf", pdf({ author: "someone" })),
    file("3x4/01-cover.mp4", mp4({ personal: true })),
    file("spec.json", text('{"k":"sk-abcdefghijklmnopqrstuvwx1234"}')),
    file("font.ttf", new Uint8Array([0, 1, 0, 0]))
  ];
  const res = await exportRun(spec, files, { expected: ["caption.txt"] });
  ["X1.credit-markup", "X1.metadata", "X1.secrets", "X1.font-license", "X1.complete"].forEach((r) => assert.ok(ids(res).includes(r), r));
  assert.equal(res.filter((r) => r.rule === "X1.metadata").length, 4);
  assert.equal(res.filter((r) => r.rule === "X1.credit-markup").length, 1);

  // the attribute inside a script string is not markup
  const onlyScript = await exportRun(spec, [file("studio-source.html", text('<script>var s="data-cs-credit"</script><div class="a"></div>'))]);
  assert.equal(ids(onlyScript).includes("X1.credit-markup"), false);
});

test("X1: a requested MP4 is BLOCK even when skipped; base64 payloads are not scanned for secrets", async () => {
  const spec = specWithMotion();
  const b64 = "data:font/ttf;base64," + "AIza".concat("A".repeat(35)) + "A".repeat(200);
  const res = await exportRun(spec, [file("a.html", text("<style>@font-face{src:url(" + b64 + ")}</style>"))], {
    expected: ["3x4/01-cover.mp4", "a.html"],
    skipped: [{ path: "carousel-kit/3x4/01-cover.mp4", reason: "no H.264 encoder" }]
  });
  assert.equal(res.find((r) => r.rule === "X1.complete").sev, "BLOCK");
  assert.equal(ids(res).includes("X1.secrets"), false);
});

test("render CLI: FIX is successful unless strict, BLOCK and real failures stay nonzero", async () => {
  const { exportExitCode, parseArgs, wanted, coverVideoOutcome } = await import("../../../../plugins/carousel-studio/skills/carousel-design/scripts/render.mjs");
  assert.equal(exportExitCode({ status: "pass" }, true, false), 0);
  assert.equal(exportExitCode({ status: "fix", exitCode: 1 }, true, false), 0);
  assert.equal(exportExitCode({ status: "fix" }, true, true), 1);
  assert.equal(exportExitCode({ status: "block" }, false, false), 2);
  assert.notEqual(exportExitCode(null, false, false), 0);
  const opts = parseArgs(["--formats", "png", "--strict"]);
  assert.equal(opts.strict, true);
  assert.equal(wanted("qa-report.md", opts), true);
  assert.equal(wanted("qa-report.json", opts), true);
  const result = { files: [{ path: "3x4/01-cover.mp4", bytes: 4 }], skipped: [{ path: "4x5/01-cover.mp4", reason: "encode failed" }] };
  assert.deepEqual(coverVideoOutcome(result, ["3x4", "4x5"], true).missing, ["4x5/01-cover.mp4"]);
  assert.equal(coverVideoOutcome(result, ["3x4", "4x5"], false).failed, false);
});

test("render diagnoses an older eleven-slide spec with C5 before strict schema loading", async () => {
  const { slideCountReport } = await import("../../../../plugins/carousel-studio/skills/carousel-design/scripts/render.mjs");
  const spec = cleanSpec();
  spec.slides.push({ id: "s10", n: 10, type: "summary" });
  assert.equal(slideCountReport(spec, null), null);
  spec.slides.push({ id: "s11", n: 11, type: "summary" });
  const report = slideCountReport(spec, null);
  assert.equal(report.status, "block");
  assert.equal(report.results[0].rule, "C5.slide-count");
});

test("MP4 dependency loader retries three times, shares success, and resets after exhaustion", async () => {
  const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
  const source = fs.readFileSync(path.resolve(__dirname, "../../../../src/mp4/mp4.js"), "utf8").replace("import(DEPS.mediabunny.url)", "__import()");
  let attempts = 0, failThrough = 2;
  const delays = [], module = { writer: true };
  const ctx = vm.createContext({ CS: { export: {} }, setTimeout: (fn, ms) => { delays.push(ms); fn(); }, __import: async () => { if (++attempts <= failThrough) throw new Error("transient"); return module; } });
  vm.runInContext(source, ctx);
  assert.equal(await ctx.loadMediabunny(), module);
  assert.equal(attempts, 3);
  assert.equal(await ctx.loadMediabunny(), module);
  assert.equal(attempts, 3);
  assert.deepEqual(delays, [250, 500]);
  ctx.mediabunnyPromise = null;
  failThrough = 6;
  await assert.rejects(ctx.loadMediabunny(), (e) => e.code === "E_DEP_LOAD");
  assert.equal(attempts, 6);
  assert.equal(await ctx.loadMediabunny(), module);
  assert.equal(attempts, 7);
  assert.deepEqual(Object.keys(ctx.CS.export.DEPS), ["mediabunny"]);
});

test("X1: @font-face families must be OFL families of the registry", async () => {
  const spec = specWithMotion();
  const fonts = { registry: { families: [{ family: "Alexandria", license: "OFL-1.1" }, { family: "Thmanyah", license: "user-supplied" }] } };
  const css = (f) => "<style>@font-face{font-family:'" + f + "';src:url(data:font/ttf;base64,AAAA)}</style>";
  const video = file("3x4/01-cover.mp4", mp4());
  assert.deepEqual(await exportRun(spec, [video, file("a.html", text(css("Alexandria")))], { fonts }), []);
  const bad = await exportRun(spec, [video, file("a.html", text(css("Thmanyah")))], { fonts });
  assert.deepEqual(ids(bad), ["X1.font-license"]);
});

test("loopCheck: identical frames pass, a changed last frame fails", () => {
  const img = (v) => ({ width: 64, height: 64, data: new Uint8ClampedArray(64 * 64 * 4).fill(v) });
  const noisy = (seed) => {
    const d = new Uint8ClampedArray(64 * 64 * 4);
    for (let i = 0; i < d.length; i += 4) {
      const v = ((i * 7 + seed) % 200) + 20;
      d[i] = d[i + 1] = d[i + 2] = v;
      d[i + 3] = 255;
    }
    return { width: 64, height: 64, data: d };
  };
  const a = noisy(1);
  assert.deepEqual(plain(CS.qa.loopCheck(a, a, a)), { ssim: 1, psnr: 99, ok: true });
  const r = CS.qa.loopCheck(a, noisy(40), a);
  assert.equal(r.ok, false);
  assert.ok(r.ssim < 0.995);
  assert.ok(CS.qa.metrics.psnr(img(100), img(101)) > 40);
});


test("V1: a 12-second clip uses its real 360 frames in both kit ratios", async () => {
  const spec = specWithMotion();
  spec.cover.motion.seconds = 12;
  spec.cover.motion.clip = { file: "assets/fresh.mp4", in: 0, out: 10, fit: "cover", focus: { x: 0.5, y: 0.5 }, ending: "auto" };
  const files = [file("3x4/01-cover.mp4", mp4({ frames: 360 })), file("4x5/01-cover.mp4", mp4({ frames: 360, h: 1350 }))];
  const loop = { frame0VsPoster: { ssim: 1, psnr: 100 }, lastVsFrame0: { ssim: 0.9999, psnr: 60 } };
  assert.deepEqual(await exportRun(spec, files, { video: files.map(f => ({ file: f.path, loop })) }), []);
  const truncated = await exportRun(spec, [file("3x4/01-cover.mp4", mp4({ frames: 180 }))]);
  assert.ok(ids(truncated).includes("V1.frames"));
  const wrongEnd = await exportRun(spec, files, { video: { loop: { frame0VsPoster: { ssim: 1, psnr: 100 }, lastVsFrame0: { ssim: 0.98, psnr: 40 } } } });
  assert.ok(ids(wrongEnd).includes("V1.loop"), "clip covers retain the same strict return-to-poster gate");
});
