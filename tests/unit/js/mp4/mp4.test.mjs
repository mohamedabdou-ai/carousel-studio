// cs-mp4: the H.264 capability check and the MP4 writer (mediabunny is loaded from jsDelivr at 1.61.0 the first time).
// The in-page reader below follows the ISO base media format just far enough to check what the Instagram gate cares about.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { checkVideo } from "../../../../plugins/carousel-studio/skills/carousel-design/scripts/check_video.mjs";

const haveTool = (cmd) => { const r = spawnSync(cmd, ["-version"], { encoding: "utf8", windowsHide: true }); return !r.error && r.status === 0; };

// avcC records written by three real encoders for 1080x1440 at 30 fps (hex): a hardware encoder (level 5.0, no colour description in the
// SPS), Chromium's software encoder (level 4.0, "sRGB" transfer) and x264 as HyperFrames runs it (level 4.0, BT.709 limited, five references).
const AVCC = {
  hardware: "01640032ffe1001b67640032ac2b7022016bcbe022000003000200000300791b43865c01000468ee3cb0fdf8f800",
  software: "01640c28ffe1001467640c28ac18d008805af2f35010d0107844235001000468ce3c80fdf8f800",
  x264: "01640028ffe1001d67640028acb3008805af2f80b501010140000003004000000f03c60c9a01000668e9702f2c8bfdf8f800"
};
const READER = `
  window.__mp4info = function (bytes) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), cc = (o) => String.fromCharCode(bytes[o], bytes[o + 1], bytes[o + 2], bytes[o + 3]);
    const info = { top: [], sync: null, samples: 0, width: 0, height: 0, avcC: null, sampleEntry: "", timescale: 0, duration: 0, personal: [] };
    const CONT = new Set(["moov", "trak", "mdia", "minf", "stbl", "udta", "ilst"]);
    const walk = (start, end, depth) => {
      for (let o = start; o + 8 <= end;) {
        let size = dv.getUint32(o); const type = cc(o + 4);
        if (size === 1) size = dv.getUint32(o + 12); else if (size === 0) size = end - o;
        if (size < 8 || o + size > end) break;
        const body = o + 8, stop = o + size;
        if (depth === 0) info.top.push(type);
        if (["\\u00A9ART", "\\u00A9aut", "\\u00A9cpy", "auth", "cprt"].includes(type)) info.personal.push(type);
        if (type === "tkhd") { const v = bytes[body]; info.width = dv.getUint32(body + (v ? 88 : 76)) / 65536; info.height = dv.getUint32(body + (v ? 92 : 80)) / 65536; }
        if (type === "mdhd") { const v = bytes[body]; info.timescale = dv.getUint32(body + (v ? 20 : 12)); info.duration = dv.getUint32(body + (v ? 28 : 16)); }
        if (type === "stsz") info.samples = dv.getUint32(body + 8);
        if (type === "stss") { info.sync = []; const n = dv.getUint32(body + 4); for (let i = 0; i < n; i++) info.sync.push(dv.getUint32(body + 8 + i * 4)); }
        if (type === "stsd") { info.sampleEntry = cc(body + 12); walk(body + 8, stop, depth + 1); }
        else if (type === "avc1") walk(body + 78, stop, depth + 1);
        else if (type === "avcC") info.avcC = [bytes[body + 1], bytes[body + 2], bytes[body + 3]];
        else if (CONT.has(type)) walk(body, stop, depth + 1);
        o += size;
      }
    };
    walk(0, bytes.length, 0);
    return info;
  };`;

export default {
  module: "mp4",
  tests: [
    {
      name: "support(): High, then Main, then Baseline at level 4.0; a huge size is refused with a reason",
      async run(t) {
        const r = await t.page.evaluate(async () => ({ ok: await CS.export.mp4.support(1080, 1440, 30), huge: await CS.export.mp4.support(16000, 16000, 30), deps: CS.export.DEPS }));
        if (!r.ok.supported) t.skip("this browser has no H.264 encoder: " + r.ok.reason);
        t.ok(["avc1.640028", "avc1.4d0028", "avc1.42E028"].includes(r.ok.codec), "codec: " + r.ok.codec);
        t.eq(r.huge.supported, false); t.ok(r.huge.reason && r.huge.codec === null, "reason given");
        t.eq(r.deps.mediabunny.version, "1.61.0"); t.eq(Object.keys(r.deps), ["mediabunny"]);
        t.eq(r.deps.mediabunny.url, "https://cdn.jsdelivr.net/npm/mediabunny@1.61.0/+esm");
      }
    },
    {
      name: "encodeMany(): two crops of one paint become two fast-start MP4s with a keyframe at frame 0 and no personal atoms",
      async run(t) {
        const sup = await t.page.evaluate(() => CS.export.mp4.support(1080, 1440, 30));
        if (!sup.supported) t.skip("no H.264 encoder");
        await t.page.evaluate(READER);
        const r = await t.page.evaluate(async () => {
          const a = document.createElement("canvas"); a.width = 1080; a.height = 1440; const b = document.createElement("canvas"); b.width = 1080; b.height = 1350;
          const ca = a.getContext("2d", { alpha: false }), cb = b.getContext("2d", { alpha: false });
          const frames = 45, progress = [];
          const out = await CS.export.mp4.encodeMany({ canvases: [a, b], frames, fps: 30, onProgress: (p) => progress.push(p.done), drawFrame: async (i) => {
            ca.fillStyle = "#F4F4F2"; ca.fillRect(0, 0, 1080, 1440); ca.fillStyle = "#E3262B"; ca.fillRect(40 + i * 18, 400, 200, 200); cb.drawImage(a, 0, 45, 1080, 1350, 0, 0, 1080, 1350);
          } });
          const single = await CS.export.mp4.encode({ canvas: a, frames: 8, fps: 30, drawFrame: async (i) => { ca.fillStyle = i % 2 ? "#fff" : "#000"; ca.fillRect(0, 0, 1080, 1440); } });
          let aborted = null; const ac = new AbortController(); ac.abort();
          try { await CS.export.mp4.encode({ canvas: a, frames: 4, fps: 30, signal: ac.signal, drawFrame: async () => {} }); } catch (e) { aborted = e.code; }
          let usage = null; try { await CS.export.mp4.encode({ canvas: a, frames: 0, fps: 30, drawFrame() {} }); } catch (e) { usage = e.code; }
          return { files: out.map((u) => window.__mp4info(u)), sizes: out.map((u) => u.length), single: window.__mp4info(single), progress: [progress[0], progress[progress.length - 1]], aborted, usage };
        });
        const [full, crop] = r.files;
        t.eq(full.top, ["ftyp", "moov", "mdat"], "fast start: moov before mdat"); t.eq(crop.top, ["ftyp", "moov", "mdat"]);
        t.eq([full.width, full.height], [1080, 1440]); t.eq([crop.width, crop.height], [1080, 1350]); t.eq(full.sampleEntry, "avc1"); t.ok(full.avcC && full.avcC[0] > 0, "avcC present");
        t.eq(full.samples, 45); t.eq(full.sync[0], 1, "frame 0 is a keyframe"); t.ok(full.timescale > 0 && Math.abs(full.duration / full.timescale - 1.5) < 0.04, "45 frames at 30 fps = 1.5 s");
        t.eq(full.personal, []); t.eq(r.single.samples, 8); t.eq(r.aborted, "E_ABORTED"); t.eq(r.usage, "E_USAGE"); t.eq(r.progress[1], 45);
      }
    },
    {
      name: "normalise(): level 5.0 becomes 4.0 when the stream fits, and every encoder's SPS ends up BT.709 limited range",
      async run(t) {
        const r = await t.page.evaluate(async (avcc) => {
          const hex = (h) => Uint8Array.from(h.match(/../g).map((x) => parseInt(x, 16)));
          const out = {};
          for (const [k, h] of Object.entries(avcc)) {
            const n = CS.export.mp4.normalise(hex(h), { fps: 30, bitrate: 8e6 }), again = CS.export.mp4.normalise(n.record, { fps: 30, bitrate: 8e6 });
            out[k] = { before: n.before, after: n.after, idempotent: Array.from(again.record).join() === Array.from(n.record).join(), head: Array.from(n.record.subarray(0, 4)) };
          }
          out.tooFast = CS.export.mp4.normalise(hex(avcc.hardware), { fps: 120, bitrate: 8e6 }).after;   // 6120 macroblocks x 120 fps is beyond level 4.0
          out.garbage = (() => { try { CS.export.mp4.normalise(new Uint8Array([9, 9, 9]), {}); return "no error"; } catch (e) { return e.name; } })();
          return out;
        }, AVCC);
        for (const k of ["hardware", "software", "x264"]) {
          const a = r[k].after;
          t.eq([a.profile, a.level, a.width, a.height], [100, 40, 1080, 1440], k + ": High 4.0, 1080x1440");
          t.eq([a.primaries, a.transfer, a.matrix, a.fullRange], [1, 1, 1, false], k + ": BT.709 limited");
          t.ok(r[k].idempotent, k + ": a second pass changes nothing");
          t.eq([r[k].head[0], r[k].head[1], r[k].head[3]], [1, 100, 40], k + ": the record's own profile and level bytes follow the SPS");
        }
        t.eq([r.hardware.before.level, r.hardware.before.fullRange, r.hardware.before.transfer], [50, null, null], "the hardware SPS said level 5.0 and nothing about colour");
        t.eq([r.software.before.level, r.software.before.transfer], [40, 13], "the software SPS tagged the sRGB transfer");
        t.eq([r.x264.after.numRefFrames, r.x264.before.numRefFrames], [5, 5], "everything else is copied bit for bit");
        t.eq([r.tooFast.level, r.tooFast.matrix, r.tooFast.fullRange], [50, 1, false], "a stream that does not fit level 4.0 keeps its level but still gets honest colour tags");
        t.eq(r.garbage, "RangeError", "headers it cannot read are refused, never half-rewritten");
      }
    },
    {
      name: "encodeMany(): the file is yuv420p, limited range, BT.709, High 4.0, the colours survive, and ffprobe, ffmpeg and check_video agree",
      async run(t) {
        const sup = await t.page.evaluate(() => CS.export.mp4.support(1080, 1440, 30));
        if (!sup.supported) t.skip("no H.264 encoder");
        if (!haveTool("ffprobe") || !haveTool("ffmpeg")) t.skip("ffmpeg and ffprobe are needed to check the file");
        const SW = ["#E3262B", "#1E40AF", "#0A6B50", "#000000", "#FFFFFF", "#808080", "#F5C518", "#7C3AED"], N = 45;
        const r = await t.page.evaluate(async ([swatches, frames]) => {
          const a = document.createElement("canvas"); a.width = 1080; a.height = 1440;
          const ca = a.getContext("2d", { alpha: false, colorSpace: "srgb", willReadFrequently: true });
          const b64 = (u) => { let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
          const out = await CS.export.mp4.encodeMany({ canvases: [a, { canvas: a, y: 45, height: 1350 }], frames, fps: 30, drawFrame: async (i) => {
            ca.fillStyle = "#F4F1EA"; ca.fillRect(0, 0, 1080, 1440);
            swatches.forEach((c, k) => { ca.fillStyle = c; ca.fillRect(40 + (k % 4) * 250, 200 + Math.floor(k / 4) * 300, 220, 260); });
            ca.fillStyle = "#E3262B"; ca.fillRect(40 + i * 18, 1100, 200, 200);
          } });
          return { files: out.map(b64), inspected: out.map((u) => CS.export.mp4.inspect(u)) };
        }, [SW, N]);
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cs-mp4-"));
        try {
          const files = r.files.map((b, k) => { const f = path.join(dir, k ? "crop.mp4" : "full.mp4"); fs.writeFileSync(f, Buffer.from(b, "base64")); return f; });
          const probe = (f, extra = []) => {
            const p = spawnSync("ffprobe", ["-v", "error", ...extra, "-select_streams", "v:0", "-show_entries", "stream=profile,level,pix_fmt,color_range,color_space,color_transfer,color_primaries,width,height", "-of", "json", f], { encoding: "utf8", windowsHide: true });
            return JSON.parse(p.stdout).streams[0];
          };
          const want = { profile: "High", level: 40, pix_fmt: "yuv420p", color_range: "tv", color_space: "bt709", color_transfer: "bt709", color_primaries: "bt709" };
          files.forEach((f, k) => {
            const label = k ? "4:5" : "3:4", v = probe(f);
            Object.entries(want).forEach(([key, val]) => t.eq(v[key], val, `${label} ${key}`));
            t.eq([v.width, v.height], k ? [1080, 1350] : [1080, 1440]);
            // the same facts read from the SPS alone (an Annex B copy has no container to take colour tags from)
            const raw = path.join(dir, "raw" + k + ".h264");
            spawnSync("ffmpeg", ["-v", "error", "-y", "-i", f, "-c:v", "copy", "-bsf:v", "h264_mp4toannexb", "-f", "h264", raw], { windowsHide: true });
            const rv = probe(raw, ["-f", "h264"]);
            t.eq([rv.level, rv.pix_fmt, rv.color_range, rv.color_space, rv.color_transfer, rv.color_primaries], [40, "yuv420p", "tv", "bt709", "bt709", "bt709"], "SPS-only read of " + label);
            const ins = r.inspected[k];
            t.eq([ins.level, ins.pixFmt, ins.range, ins.colour.matrix, ins.colour.transfer, ins.colour.primaries, ins.colr.matrix, ins.colr.fullRange], [40, "yuv420p", "tv", "bt709", "bt709", "bt709", "bt709", false], "inspect() reads the same");
            const dec = spawnSync("ffmpeg", ["-v", "error", "-i", f, "-f", "null", "-"], { encoding: "utf8", windowsHide: true });
            t.eq(dec.stderr.trim(), "", "the stream decodes without a single error");
            const gate = checkVideo(f, { expect: k ? "1080x1350" : "1080x1440", seconds: N / 30 });
            const bad = gate.results.filter((x) => /^V1\.(codec|profile|size|fps|frames|audio|faststart|keyframe|closed-gop|pixfmt|range|colour|level)$/.test(x.rule));
            t.eq(bad.map((x) => x.rule), [], "check_video finds nothing wrong with the encoding");
            t.eq([gate.info.pixFmt, gate.info.range, gate.info.level], ["yuv420p", "tv", 40]);
          });
          // colours: decode a frame the way a player does (BT.709, limited range) and compare the swatches with what was painted
          const frameAt = (f, n) => spawnSync("ffmpeg", ["-v", "error", "-i", f, "-vf", `select=eq(n\\,${n}),scale=in_range=tv:in_color_matrix=bt709:out_range=pc:out_color_matrix=bt709,format=rgb24`, "-frames:v", "1", "-f", "rawvideo", "-"], { maxBuffer: 1 << 28, windowsHide: true }).stdout;
          const px = (rgb, x, y, off) => { const o = ((y - off) * 1080 + x) * 3; return [rgb[o], rgb[o + 1], rgb[o + 2]]; };
          const full = frameAt(files[0], 30), crop = frameAt(files[1], 30);
          SW.forEach((c, k) => {
            const x = 40 + (k % 4) * 250 + 110, y = 200 + Math.floor(k / 4) * 300 + 130, exp = [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
            [[full, 0], [crop, 45]].forEach(([rgb, off]) => { const got = px(rgb, x, y, off); t.lte(Math.max(...exp.map((e, i) => Math.abs(e - got[i]))), 3, `${c} decodes to ${got} in the ${off ? "4:5" : "3:4"} video`); });
          });
          // motion: in a late frame the square is where it was painted and not where it was (unchanged blocks are skipped, so stale pixels would show)
          const late = frameAt(files[0], 40), sq = (i) => [40 + i * 18 + 100, 1200], near = (a, b) => Math.max(...a.map((v, i) => Math.abs(v - b[i]))) <= 6;
          t.ok(near(px(late, ...sq(40), 0), [0xE3, 0x26, 0x2B]), "the square is red at its frame-40 position");
          t.ok(near(px(late, ...sq(10), 0), [0xF4, 0xF1, 0xEA]), "its frame-10 position is background again");
        } finally { fs.rmSync(dir, { recursive: true, force: true }); }
      }
    },
    {
      name: "check_video: a full-range level 5.0 file tagged BT.601, and a 4:4:4 file, are caught; the Studio's own encoding and the HyperFrames-style one are not",
      async run(t) {
        if (!haveTool("ffmpeg") || !haveTool("ffprobe")) t.skip("ffmpeg and ffprobe are needed to make the test files");
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cs-gate-"));
        try {
          const make = (name, args) => {
            const f = path.join(dir, name);
            const r = spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=1080x1440:rate=30", "-t", "1", "-c:v", "libx264", "-preset", "ultrafast", ...args, "-movflags", "+faststart", f], { encoding: "utf8", windowsHide: true });
            if (r.status !== 0) t.skip("this ffmpeg has no libx264: " + r.stderr.split("\n")[0]);
            return f;
          };
          const rules = (f) => checkVideo(f, { expect: "1080x1440", seconds: 1 }).results.filter((x) => /^V1\.(pixfmt|range|colour|level)$/.test(x.rule)).map((x) => x.rule + ":" + x.sev);
          t.eq(rules(make("full.mp4", ["-pix_fmt", "yuvj420p", "-color_range", "pc", "-colorspace", "smpte170m", "-level:v", "5.0", "-profile:v", "high"])), ["V1.range:BLOCK", "V1.colour:FIX", "V1.level:FIX"], "full range is a BLOCK (yuvj is its pixel format, so one finding), BT.601 tags and level 5.0 are FIX");
          t.eq(rules(make("444.mp4", ["-pix_fmt", "yuv444p", "-profile:v", "high444"])), ["V1.pixfmt:BLOCK"], "4:4:4 is a pixel-format BLOCK");
          t.eq(rules(make("good.mp4", ["-pix_fmt", "yuv420p", "-color_range", "tv", "-colorspace", "bt709", "-color_trc", "bt709", "-color_primaries", "bt709", "-level:v", "4.0", "-profile:v", "high"])), [], "what HyperFrames writes passes");
          t.eq(rules(make("l41.mp4", ["-pix_fmt", "yuv420p", "-level:v", "4.1", "-profile:v", "high"])), [], "level 4.1 and untagged colour are accepted");
          t.eq(rules(make("l42.mp4", ["-pix_fmt", "yuv420p", "-level:v", "4.2", "-profile:v", "high"])), ["V1.level:FIX"], "level 4.2 is above the ceiling");
        } finally { fs.rmSync(dir, { recursive: true, force: true }); }
      }
    },
    {
      name: "check_video: frame metrics are NOTEs: a loop held still for most of its length, and a long stretch with almost nothing on screen",
      async run(t) {
        if (!haveTool("ffmpeg") || !haveTool("ffprobe")) t.skip("ffmpeg and ffprobe are needed to make the test files");
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cs-frames-"));
        try {
          const make = (name, graph) => {
            const f = path.join(dir, name);
            const r = spawnSync("ffmpeg", ["-v", "error", "-y", "-filter_complex", graph, "-map", "[v]", "-t", "6", "-r", "30", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-color_range", "tv", "-colorspace", "bt709", "-color_trc", "bt709", "-color_primaries", "bt709", "-profile:v", "high", "-level:v", "4.0", "-movflags", "+faststart", f], { encoding: "utf8", windowsHide: true });
            if (r.status !== 0) t.skip("this ffmpeg cannot make the test files: " + r.stderr.split("\n")[0]);
            return f;
          };
          const moving = "testsrc2=size=1080x1440:rate=30:duration=6[v]";
          const held = "testsrc2=size=1080x1440:rate=30:duration=1,tpad=stop_mode=clone:stop_duration=5[v]";
          const hollow = "testsrc2=size=1080x1440:rate=30:duration=0.5[a];color=c=0x808080:size=1080x1440:rate=30:duration=1.5[b];testsrc2=size=1080x1440:rate=30:duration=4[c];[a][b][c]concat=n=3:v=1:a=0[v]";
          const run = (f) => checkVideo(f, { expect: "1080x1440", seconds: 6 });
          const notes = (r) => r.results.filter((x) => /^V1\.(still-hold|thin-frames)$/.test(x.rule)).map((x) => x.rule + ":" + x.sev);
          const a = run(make("moving.mp4", moving)), b = run(make("held.mp4", held)), c = run(make("hollow.mp4", hollow));
          t.eq(notes(a), [], "a loop that changes all the time is not held");
          t.ok(a.stillShare < 0.05, "a moving loop holds almost no frame (" + a.stillShare + ")");
          t.eq(notes(b), ["V1.still-hold:NOTE"], "one second of motion and five held is flagged");
          t.ok(b.stillShare > 0.75 && b.stillShare < 0.9, "the held share is measured (" + b.stillShare + ")");
          t.ok(notes(c).includes("V1.thin-frames:NOTE") && c.thinRunSeconds >= 1.4, "1.5 s with almost nothing on screen is a thin stretch (" + c.thinRunSeconds + " s)");
          t.ok([a, b, c].every((r) => r.results.filter((x) => /^V1\.(still-hold|thin-frames)$/.test(x.rule)).every((x) => x.sev === "NOTE")), "the frame metrics are advice: they never raise a FIX or a BLOCK on their own");
        } finally { fs.rmSync(dir, { recursive: true, force: true }); }
      }
    }
  ]
};
