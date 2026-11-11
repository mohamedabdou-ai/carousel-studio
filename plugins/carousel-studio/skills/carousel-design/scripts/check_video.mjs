#!/usr/bin/env node
/*
 * check_video.mjs · gate V1 for a finished cover video (Claude Code lane).
 *
 *   node check_video.mjs FILE.mp4 [--poster PNG] [--expect 1080x1440] [--seconds 6] [--fps 30]
 *                        [--audio none|silent-aac] [--format text|json]
 *
 * ffprobe and an MP4 box reader fill the facts (codec, profile, level, pixel format, colour range and tags, size, frame rate, frame
 * count, fast start, keyframe at zero, closed GOP, audio). Instagram wants 8-bit 4:2:0 (yuv420p) in limited (tv) range, BT.709 when
 * the file names its colours, and H.264 level 4.1 or lower; the Studio and HyperFrames lanes both write level 4.0. ffmpeg adds the
 * pixel checks: no blank frame between the hold-in and settle times, at most three flashes per second, and the loop: the last
 * frame against frame 0 (SSIM 0.995 and 45 dB) and frame 0 against the poster (SSIM 0.99 and 32 dB, the lower floor a lossy
 * 4:2:0 encode can meet against a lossless PNG).
 * Without ffmpeg the pixel checks are skipped with a NOTE. Exit: 0 pass, 1 FIX findings, 2 BLOCK findings, 64 usage,
 * 66 file missing, 70 internal error (ffprobe missing). Errors go to stderr as `cs-error: <code>: <message>`.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EXIT = { OK: 0, FIX: 1, BLOCK: 2, USAGE: 64, DATA: 65, NOINPUT: 66, INTERNAL: 70 };

/* ------------------------------------------------------------------ thresholds and messages (from the shared rule data when present) */

const DEFAULTS = {
  fps: 30, defaultSeconds: 6, holdIn: 0.4, settleBy: 5.6, loopSsimMin: 0.995, loopPsnrMinDb: 45, maxFlashesPerSecond: 3,
  width: 1080, height3x4: 1440, height4x5: 1350, audio: "none", blankDelta: 6, blankPixels: 3, flashDelta: 24, posterSsimMin: 0.99, posterPsnrMin: 32,
  pixelFormat: "yuv420p", range: "tv", matrix: "bt709", maxLevel: 41,
  stillMaxShare: 0.6, stillDelta: 0.03, thinShare: 0.25, thinMaxSeconds: 0.6
};

/** "4.1" -> 41 (the level_idc a stream carries). */
const levelNumber = (text) => Math.round(parseFloat(text) * 10);

const MESSAGES = {
  "V1.codec": { sev: "BLOCK", msg: { ar: "ترميز الفيديو ({codec}) ليس H.264.", en: "The video codec ({codec}) is not H.264." } },
  "V1.profile": { sev: "FIX", msg: { ar: "ملف H.264 ليس High ({codec}).", en: "The H.264 profile is not High ({codec})." } },
  "V1.pixfmt": { sev: "BLOCK", msg: { ar: "صيغة البكسل {pixfmt} والمطلوب {expected}.", en: "The pixel format is {pixfmt}; expected {expected}." } },
  "V1.range": { sev: "BLOCK", msg: { ar: "مدى الألوان في الفيديو كامل ({range}) والمطلوب مدى محدود ({expected}).", en: "The video uses full-range colour ({range}); limited range ({expected}) is required." } },
  "V1.colour": { sev: "FIX", msg: { ar: "وسوم الألوان في الفيديو ({tags}) ليست {expected}.", en: "The colour tags ({tags}) are not {expected}." } },
  "V1.level": { sev: "FIX", msg: { ar: "مستوى H.264 هو {level} وهو أعلى من {max}، وقد لا تشغّله بعض الأجهزة القديمة.", en: "The H.264 level is {level}, above {max}; some older phones may not play it." } },
  "V1.size": { sev: "BLOCK", msg: { ar: "حجم الفيديو {w}×{h} والمطلوب {ew}×{eh}.", en: "The video is {w}×{h}; expected {ew}×{eh}." } },
  "V1.fps": { sev: "BLOCK", msg: { ar: "معدل الإطارات {fps} والمطلوب {ef}.", en: "The frame rate is {fps}; expected {ef}." } },
  "V1.frames": { sev: "BLOCK", msg: { ar: "عدد الإطارات {count} والمتوقع {n}.", en: "The video has {count} frames; expected {n}." } },
  "V1.audio": { sev: "BLOCK", msg: { ar: "مسار الصوت ({audio}) لا يطابق المطلوب ({expected}).", en: "The audio track ({audio}) does not match what is required ({expected})." } },
  "V1.faststart": { sev: "BLOCK", msg: { ar: "بيانات الفيديو غير مهيأة للتشغيل السريع.", en: "The video is not prepared for fast start." } },
  "V1.keyframe": { sev: "BLOCK", msg: { ar: "الإطار الأول في الفيديو ليس إطارًا مفتاحيًا.", en: "The first video frame is not a keyframe." } },
  "V1.closed-gop": { sev: "BLOCK", msg: { ar: "مجموعة الإطارات ليست مغلقة.", en: "The group of pictures is not closed." } },
  "V1.loop": { sev: "BLOCK", msg: { ar: "الفيديو لا يعود إلى الغلاف بدقة (SSIM {ssim} وPSNR {psnr}).", en: "The loop does not land on the poster (SSIM {ssim}, PSNR {psnr})." } },
  "V1.blank": { sev: "BLOCK", msg: { ar: "في الفيديو {count} إطارات فارغة.", en: "The video has {count} blank frames." } },
  "V1.flashes": { sev: "BLOCK", msg: { ar: "وميض الفيديو {count} مرات في الثانية والحد {max}.", en: "The video flashes {count} times a second; the limit is {max}." } },
  "V1.still-hold": { sev: "NOTE", msg: { ar: "الغلاف ثابت في {pct}% من مدة الحلقة ({sec} ثانية)، فالحركة قصيرة.", en: "The cover holds still for {pct}% of the loop ({sec} s); the motion is short." } },
  "V1.thin-frames": { sev: "NOTE", msg: { ar: "الغلاف شبه فارغ لمدة {sec} ثانية في الحلقة؛ لا يظهر فيه إلا الرأس والتذييل.", en: "The cover is nearly empty for {sec} s of the loop; only the header and footer are on screen." } },
  "V1.tools": { sev: "NOTE", msg: { ar: "ffmpeg غير موجود، فتخطّينا فحص الحلقة والإطارات الفارغة والوميض.", en: "ffmpeg is not installed, so the loop, blank-frame and flash checks were skipped." } }
};

/** Shared rule data (../data/qa-rules.json) wins over the built-in copy above, so messages and severities have one source. */
function loadRuleData() {
  const out = { messages: MESSAGES, limits: { ...DEFAULTS } };
  try {
    const platform = JSON.parse(fs.readFileSync(path.join(HERE, "..", "data", "platform-instagram.json"), "utf8"));
    const m = platform.plugin && platform.plugin.motion, e = platform.plugin && platform.plugin.export;
    if (m) Object.assign(out.limits, { fps: m.fps, defaultSeconds: m.defaultSeconds, holdIn: m.holdInSeconds, settleBy: m.settleBySeconds, loopSsimMin: m.loopSsimMin, loopPsnrMinDb: m.loopPsnrMinDb, maxFlashesPerSecond: m.maxFlashesPerSecond, posterSsimMin: m.posterSsimMin, posterPsnrMin: m.posterPsnrMinDb,
      stillMaxShare: m.stillMaxShare, stillDelta: m.stillDeltaLuma, thinShare: m.thinShare, thinMaxSeconds: m.thinMaxSeconds });
    if (e) Object.assign(out.limits, { width: e.png.w, height3x4: e.png.h, height4x5: e.jpeg4x5.h, audio: e.mp4.audio, pixelFormat: e.mp4.pixelFormat, range: e.mp4.range, matrix: e.mp4.matrix, maxLevel: levelNumber(e.mp4.maxLevel) });
  } catch { /* defaults stay */ }
  try {
    const rules = JSON.parse(fs.readFileSync(path.join(HERE, "..", "data", "qa-rules.json"), "utf8"));
    const gate = (rules.gates || []).find((g) => g.id === "V1");
    for (const c of (gate && gate.checks) || []) if (c.msg) out.messages = { ...out.messages, [c.id]: { sev: c.sev || (MESSAGES[c.id] && MESSAGES[c.id].sev) || "BLOCK", msg: c.msg } };
  } catch { /* built-in messages stay */ }
  return out;
}

function fmt(template, vars) { return String(template).replace(/\{(\w+)\}/g, (all, k) => (vars && k in vars ? String(vars[k]) : all)); }

/* ------------------------------------------------------------------ process helpers */

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: "utf8", maxBuffer: 512 * 1024 * 1024, windowsHide: true, ...opts });
  return { code: r.status, stdout: r.stdout || "", stderr: r.stderr || "", error: r.error };
}

function have(cmd) {
  const r = run(cmd, ["-version"]);
  return !r.error && r.code === 0;
}

/* ------------------------------------------------------------------ the MP4 box reader */

const CONTAINERS = new Set(["moov", "trak", "mdia", "minf", "stbl"]);

/** Top-level box order, the video track's sync-sample table and the avcC bytes. No decoding. */
export function readMp4Boxes(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const cc = (o) => String.fromCharCode(bytes[o], bytes[o + 1], bytes[o + 2], bytes[o + 3]);
  const info = { top: [], sync: null, avcC: null, handler: "", personal: [] };
  let inVideo = false;
  const walk = (start, end, depth) => {
    let o = start;
    while (o + 8 <= end) {
      let size = dv.getUint32(o), head = 8;
      const type = cc(o + 4);
      if (size === 1 && o + 16 <= end) { size = dv.getUint32(o + 8) * 2 ** 32 + dv.getUint32(o + 12); head = 16; }
      else if (size === 0) size = end - o;
      if (size < head || o + size > end) break;
      const body = o + head, stop = o + size;
      if (depth === 0) info.top.push(type);
      if (type === "©ART" || type === "©aut" || type === "©cpy" || type === "©own" || type === "auth" || type === "cprt") info.personal.push(type);
      if (type === "trak") inVideo = false;
      if (type === "hdlr") { info.handler = cc(body + 8); if (info.handler === "vide") inVideo = true; }
      if (inVideo && type === "stss") {
        const n = dv.getUint32(body + 4); info.sync = [];
        for (let i = 0; i < n && body + 8 + i * 4 + 4 <= stop; i++) info.sync.push(dv.getUint32(body + 8 + i * 4));
      }
      if (inVideo && type === "avcC" && !info.avcC) info.avcC = [bytes[body + 1], bytes[body + 2], bytes[body + 3]];
      if (type === "stsd") walk(body + 8, stop, depth + 1);
      else if (type === "avc1") walk(body + 78, stop, depth + 1);
      else if (CONTAINERS.has(type) || type === "udta" || type === "ilst") walk(body, stop, depth + 1);
      o += size;
    }
  };
  walk(0, bytes.length, 0);
  return info;
}

/* ------------------------------------------------------------------ ffprobe and ffmpeg */

function probe(file) {
  const r = run("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", file]);
  if (r.error || r.code !== 0) throw Object.assign(new Error("ffprobe failed: " + (r.stderr || r.error)), { code: "E_USAGE" });
  return JSON.parse(r.stdout);
}

function packetTimes(file) {
  const r = run("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "packet=pts_time,dts_time,flags", "-of", "csv=p=0", file]);
  return r.stdout.split(/\r?\n/).filter(Boolean).map((line) => { const [pts, dts, flags] = line.split(","); return { pts: parseFloat(pts), dts: parseFloat(dts), key: /K/.test(flags || "") }; });
}

/** Closed GOP: no picture that follows a keyframe in decode order is presented before it. Without B-frames this is always true. */
function closedGop(packets, hasBFrames) {
  if (!hasBFrames) return true;
  let keyPts = null;
  for (const p of packets) {
    if (p.key) keyPts = p.pts;
    else if (keyPts !== null && p.pts < keyPts - 1e-6) return false;
  }
  return true;
}

function constantRate(packets) {
  const times = packets.map((p) => p.pts).filter(Number.isFinite).sort((a, b) => a - b);
  if (times.length < 3) return true;
  const base = times[1] - times[0];
  return times.every((t, i) => i === 0 || Math.abs(t - times[i - 1] - base) < base * 0.02 + 1e-6);
}

const SMALL_W = 108, SMALL_H = 144;

/**
 * Per-frame luma statistics on a 108x144 grayscale copy of every frame (area-averaged, so codec noise vanishes and a thin
 * line of text does not): the mean, the median, how many pixels differ from the median by more than blankDelta levels, and
 * the mean change from the frame before (`change`, in luma levels).
 */
function frameStats(file, blankDelta) {
  const r = run("ffmpeg", ["-hide_banner", "-v", "error", "-i", file, "-an", "-vf", `scale=${SMALL_W}:${SMALL_H}:flags=area,format=gray`, "-f", "rawvideo", "-pix_fmt", "gray", "-"], { encoding: "buffer" });
  if (r.error || r.code !== 0) return null;
  const buf = r.stdout, size = SMALL_W * SMALL_H, frames = [];
  for (let off = 0; off + size <= buf.length; off += size) {
    const hist = new Uint32Array(256);
    let sum = 0;
    for (let i = 0; i < size; i++) { const v = buf[off + i]; hist[v]++; sum += v; }
    let acc = 0, median = 0;
    for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= size / 2) { median = v; break; } }
    let deviating = 0;
    for (let v = 0; v < 256; v++) if (Math.abs(v - median) > blankDelta) deviating += hist[v];
    let change = 0;
    if (off >= size) { for (let i = 0; i < size; i++) change += Math.abs(buf[off + i] - buf[off - size + i]); change /= size; }
    frames.push({ mean: sum / size, median, deviating, change });
  }
  return frames;
}

/** SSIM and PSNR between two single frames, both decoded the same way (BT.709, RGB). Poster = a PNG of the same size. */
function compareFrames(file, a, b, decodedPoster = false) {
  // Native canvas posters interpolate 4:2:0 chroma. swscale's fast RGB path
  // repeats chroma samples instead, making coloured edges disagree with the
  // very frame the browser decoded. Reconstruct chroma for clip posters only;
  // luma stays at full resolution and same-encode loop comparisons are unchanged.
  const chroma = decodedPoster ? ":flags=gauss+accurate_rnd+full_chroma_int" : "";
  const rgb = `scale=in_range=tv:out_range=pc:in_color_matrix=bt709:out_color_matrix=bt709${chroma},format=rgb24`;
  const pick = (n) => `select='eq(n,${n})',setpts=PTS-STARTPTS,${rgb}`;
  // a poster goes through the same RGB -> YUV 4:2:0 -> RGB trip as the video, so only the codec's own loss is measured
  const roundTrip = decodedPoster ? "format=rgb24" : "scale=in_range=pc:out_range=tv:out_color_matrix=bt709,format=yuv420p,scale=in_range=tv:out_range=pc:in_color_matrix=bt709:out_color_matrix=bt709,format=rgb24";
  const poster = a.kind === "poster" ? a : b.kind === "poster" ? b : null;
  let source;
  if (!poster) source = `[0:v]split[s0][s1];[s0]${pick(a.n)}[a];[s1]${pick(b.n)}[b]`;
  else if (a.kind === "poster") source = `[0:v]${pick(b.n)}[b];[1:v]${roundTrip}[a]`;
  else source = `[0:v]${pick(a.n)}[a];[1:v]${roundTrip}[b]`;
  const inputs = ["-i", file, ...(poster ? ["-i", poster.path] : [])];
  const go = (filter) => run("ffmpeg", ["-hide_banner", "-v", "info", ...inputs, "-filter_complex", `${source};[a][b]${filter}`, "-f", "null", "-"]);
  const ps = go("psnr"), ss = go("ssim");
  const psnr = /PSNR.*average:([\d.]+|inf)/.exec(ps.stderr), ssim = /SSIM.*All:(-?[\d.]+)/.exec(ss.stderr);
  if (!psnr || !ssim) return null;
  return { ssim: Math.round(parseFloat(ssim[1]) * 100000) / 100000, psnr: psnr[1] === "inf" ? 100 : Math.round(parseFloat(psnr[1]) * 100) / 100 };
}

/* ------------------------------------------------------------------ the check */

/**
 * checkVideo(file, options) -> { ok, file, info, loop, blankFrames, flashesPerSecondMax, results, status, exitCode }
 * options: { poster, expect: "1080x1440", seconds, fps, audio }
 */
export function checkVideo(file, options = {}) {
  const rules = loadRuleData(), L = rules.limits, results = [];
  const emit = (id, vars) => { const m = rules.messages[id]; results.push({ gate: "V1", rule: id, sev: m.sev, msg: { ar: fmt(m.msg.ar, vars), en: fmt(m.msg.en, vars) } }); };
  const bytes = fs.readFileSync(file), boxes = readMp4Boxes(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength));
  const meta = probe(file), v = (meta.streams || []).find((s) => s.codec_type === "video") || {};
  const audioStreams = (meta.streams || []).filter((s) => s.codec_type === "audio");
  const packets = packetTimes(file);
  const [fnum, fden] = String(v.r_frame_rate || "0/1").split("/").map(Number), fps = fden ? fnum / fden : 0;
  const frames = parseInt(v.nb_frames, 10) || packets.length;
  const seconds = parseFloat(v.duration || (meta.format && meta.format.duration)) || (fps ? frames / fps : 0);
  const [ew, eh] = options.expect ? options.expect.split("x").map(Number) : [L.width, null];
  const spec = options.spec ? JSON.parse(fs.readFileSync(options.spec, "utf8")) : null;
  const motion = spec?.cover?.motion;
  const kind = options.kind || (motion?.clip ? "clip" : "engine");
  const expectedFps = options.fps || L.fps, expectedSeconds = options.seconds ?? motion?.seconds ?? L.defaultSeconds;
  if (!["engine", "clip"].includes(kind) || !Number.isFinite(expectedSeconds) || expectedSeconds <= 0) throw Object.assign(new Error("Choose kind engine or clip and a positive duration."), { code: "E_USAGE" });
  if (kind === "clip" && (expectedSeconds < 6 || expectedSeconds > 15)) throw Object.assign(new Error("Clip covers must last 6 to 15 seconds."), { code: "E_USAGE" });
  if (kind === "clip" && !options.poster) throw Object.assign(new Error("A clip cover check needs --poster from the same kit."), { code: "E_USAGE" });
  const codecString = boxes.avcC ? "avc1." + boxes.avcC.map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase() : (v.codec_tag_string === "avc1" ? "avc1" : String(v.codec_name || ""));
  const level = boxes.avcC ? boxes.avcC[2] : Number.isFinite(v.level) && v.level > 0 ? v.level : null;      // level_idc: 40 is level 4.0
  const fullRange = v.color_range === "pc" || /^yuvj/.test(v.pix_fmt || "");
  const tag = (x) => (x && x !== "unknown" && x !== "unspecified" ? x : null);
  const info = {
    file: path.basename(file), width: v.width, height: v.height, fps, seconds: Math.round(seconds * 1000) / 1000, frames, codec: codecString, profile: v.profile, level,
    pixFmt: v.pix_fmt, range: fullRange ? "pc" : v.color_range === "tv" ? "tv" : "unspecified", colour: { primaries: tag(v.color_primaries), transfer: tag(v.color_transfer), matrix: tag(v.color_space) },
    moovBeforeMdat: boxes.top.indexOf("moov") >= 0 && boxes.top.indexOf("moov") < boxes.top.indexOf("mdat"),
    keyframeAtZero: boxes.sync === null ? true : boxes.sync[0] === 1,
    closedGop: closedGop(packets, (v.has_b_frames || 0) > 0), constantRate: constantRate(packets),
    audio: audioStreams.length ? "silent-aac" : "none", personalAtoms: boxes.personal
  };
  const wantAudio = options.audio || L.audio;

  if (!/^avc1/i.test(info.codec) || v.codec_name !== "h264") emit("V1.codec", { codec: info.codec || v.codec_name });
  else if (!/^avc1\.64/i.test(info.codec)) emit("V1.profile", { codec: info.codec });
  if (v.codec_name === "h264") {
    if (info.pixFmt && info.pixFmt.replace(/^yuvj/, "yuv") !== L.pixelFormat) emit("V1.pixfmt", { pixfmt: info.pixFmt, expected: L.pixelFormat });
    if (fullRange) emit("V1.range", { range: v.color_range === "pc" ? "pc" : info.pixFmt, expected: L.range });
    const odd = Object.entries(info.colour).filter(([, name]) => name && name !== L.matrix).map(([k, name]) => `${k} ${name}`);
    if (odd.length) emit("V1.colour", { tags: odd.join(", "), expected: L.matrix });
    if (info.level !== null && info.level > L.maxLevel) emit("V1.level", { level: (info.level / 10).toFixed(1), max: (L.maxLevel / 10).toFixed(1) });
  }
  const expectedH = eh || (info.height === L.height4x5 ? L.height4x5 : L.height3x4);
  if (info.width !== ew || info.height !== expectedH) emit("V1.size", { w: info.width, h: info.height, ew, eh: expectedH });
  if (Math.abs(info.fps - expectedFps) > 0.05 || !info.constantRate) emit("V1.fps", { fps: Math.round(info.fps * 100) / 100, ef: expectedFps });
  if (Math.abs(info.frames - Math.round(expectedSeconds * expectedFps)) > 1) emit("V1.frames", { count: info.frames, n: Math.round(expectedSeconds * expectedFps) });
  if (info.audio !== wantAudio) emit("V1.audio", { audio: info.audio, expected: wantAudio });
  if (!info.moovBeforeMdat) emit("V1.faststart");
  if (!info.keyframeAtZero) emit("V1.keyframe");
  if (!info.closedGop) emit("V1.closed-gop");

  let loop = null, blankFrames = null, flashesPerSecondMax = null, stillShare = null, thinRunSeconds = null;
  if (have("ffmpeg")) {
    const stats = frameStats(file, L.blankDelta);
    if (stats && stats.length) {
      const from = kind === "clip" ? 0 : Math.round(L.holdIn * info.fps), to = kind === "clip" ? stats.length - 1 : Math.min(stats.length - 1, Math.round(L.settleBy * info.fps));
      blankFrames = 0;
      for (let i = from; i <= to; i++) {
        const s = stats[i];
        if (s && s.deviating < (kind === "clip" ? Math.max(L.blankPixels, L.thinShare * stats[0].deviating) : L.blankPixels)) blankFrames++;
      }
      const jumps = [];
      for (let i = 1; i < stats.length; i++) if (Math.abs(stats[i].mean - stats[i - 1].mean) > L.flashDelta) jumps.push(i);
      flashesPerSecondMax = 0;
      for (let i = 0; i < stats.length; i++) flashesPerSecondMax = Math.max(flashesPerSecondMax, jumps.filter((j) => j > i - info.fps && j <= i).length);
      if (blankFrames > 0) emit("V1.blank", { count: blankFrames });
      if (flashesPerSecondMax > L.maxFlashesPerSecond) emit("V1.flashes", { count: flashesPerSecondMax, max: L.maxFlashesPerSecond });
      // frame metrics (NOTE): how much of the loop is a held picture, and how long only the chrome is on screen
      // Whole-frame downsampling dilutes dark footage behind static type and chrome.
      // Clips have no media-window measurement here, so do not label them as held loops.
      if (kind !== "clip") {
        const still = stats.slice(1).filter((s) => s.change < L.stillDelta).length;
        stillShare = Math.round(still / Math.max(1, stats.length - 1) * 1000) / 1000;
      }
      let run = 0, longest = 0;
      for (let i = from; i <= to; i++) { if (stats[i].deviating < L.thinShare * stats[0].deviating) { run++; longest = Math.max(longest, run); } else run = 0; }
      thinRunSeconds = Math.round(longest / info.fps * 100) / 100;
      if (stillShare !== null && stillShare > L.stillMaxShare) emit("V1.still-hold", { pct: Math.round(stillShare * 100), sec: Math.round(stillShare * info.seconds * 10) / 10 });
      if (thinRunSeconds > L.thinMaxSeconds) emit("V1.thin-frames", { sec: Math.round(thinRunSeconds * 10) / 10 });
    }
    const last = Math.max(0, info.frames - 1);
    loop = { lastVsFrame0: compareFrames(file, { kind: "frame", n: last }, { kind: "frame", n: 0 }) };
    if (options.poster) loop.frame0VsPoster = compareFrames(file, { kind: "frame", n: 0 }, { kind: "poster", path: options.poster }, kind === "clip");
    // last vs first frame: both are decoded from the same encode, so the full contract thresholds apply.
    // first frame vs poster: a lossless PNG against a lossy 4:2:0 video, so the codec's own loss is allowed for. The lower floor (SSIM 0.99 / 32 dB) lives in
    // platform-instagram.json -> plugin.motion.posterSsimMin / posterPsnrMinDb, with the reason; the binding bar is last frame vs frame 0.
    const bad = [];
    if (loop.lastVsFrame0 && (loop.lastVsFrame0.ssim < L.loopSsimMin || loop.lastVsFrame0.psnr < L.loopPsnrMinDb)) bad.push(loop.lastVsFrame0);
    if (loop.frame0VsPoster && (loop.frame0VsPoster.ssim < L.posterSsimMin || loop.frame0VsPoster.psnr < L.posterPsnrMin)) bad.push(loop.frame0VsPoster);
    if (bad.length) emit("V1.loop", { ssim: Math.min(...bad.map((p) => p.ssim)), psnr: Math.min(...bad.map((p) => p.psnr)) });
  } else emit("V1.tools");

  const counts = { block: 0, fix: 0, note: 0 };
  for (const r of results) counts[r.sev.toLowerCase()]++;
  const status = counts.block ? "block" : counts.fix ? "fix" : "pass";
  return { ok: status !== "block", file, kind, info, loop, blankFrames, flashesPerSecondMax, stillShare, thinRunSeconds, results, counts, status, exitCode: counts.block ? EXIT.BLOCK : counts.fix ? EXIT.FIX : EXIT.OK };
}

/* ------------------------------------------------------------------ CLI */

const USAGE = "usage: node check_video.mjs FILE.mp4 [--poster PNG] [--expect 1080x1440] [--seconds 6] [--fps 30] [--audio none|silent-aac] [--kind engine|clip] [--spec FILE] [--format text|json]";

function parseArgs(argv) {
  const opts = { format: "text" }, rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") opts.help = true;
    else if (a.startsWith("--")) {
      const key = a.slice(2);
      if (!["poster", "expect", "seconds", "fps", "audio", "format", "kind", "spec"].includes(key)) throw Object.assign(new Error("unknown option " + a), { code: "E_USAGE" });
      opts[key] = argv[++i];
      if (opts[key] === undefined) throw Object.assign(new Error("missing value for " + a), { code: "E_USAGE" });
    } else rest.push(a);
  }
  if (rest.length) opts.file = rest[0];
  if (opts.seconds) opts.seconds = parseFloat(opts.seconds);
  if (opts.fps) opts.fps = parseFloat(opts.fps);
  if (opts.kind && !["engine", "clip"].includes(opts.kind)) throw Object.assign(new Error("--kind is engine or clip"), { code: "E_USAGE" });
  return opts;
}

function printText(r) {
  const out = [];
  out.push(`${r.status === "pass" ? "✔" : r.status === "fix" ? "!" : "✘"} ${path.basename(r.file)}  ${r.info.width}×${r.info.height} · ${r.info.fps} fps · ${r.info.frames} frames · ${r.info.codec} (${r.info.profile || "?"})`);
  out.push(`  ${r.info.pixFmt || "?"} · range ${r.info.range} · level ${r.info.level === null ? "?" : (r.info.level / 10).toFixed(1)} · colour ${["primaries", "transfer", "matrix"].map((k) => r.info.colour[k] || "untagged").join("/")}`);
  out.push(`  faststart ${r.info.moovBeforeMdat ? "yes" : "NO"} · keyframe at 0 ${r.info.keyframeAtZero ? "yes" : "NO"} · closed GOP ${r.info.closedGop ? "yes" : "NO"} · audio ${r.info.audio}`);
  if (r.loop) out.push(`  loop: last vs first SSIM ${r.loop.lastVsFrame0 ? r.loop.lastVsFrame0.ssim + " / " + r.loop.lastVsFrame0.psnr + " dB" : "n/a"}` + (r.loop.frame0VsPoster ? ` · first vs poster ${r.loop.frame0VsPoster.ssim} / ${r.loop.frame0VsPoster.psnr} dB` : ""));
  if (r.blankFrames !== null) out.push(`  blank frames ${r.blankFrames} · flashes/s (max) ${r.flashesPerSecondMax}` + (r.stillShare !== null ? ` · held ${Math.round(r.stillShare * 100)}% · nearly empty ${r.thinRunSeconds} s` : ""));
  for (const f of r.results) out.push(`  ${f.sev.padEnd(5)} ${f.rule}: ${f.msg.ar} — ${f.msg.en}`);
  return out.join("\n");
}

function main(argv) {
  let opts;
  try { opts = parseArgs(argv); } catch (e) { process.stderr.write(`cs-error: E_USAGE: ${e.message}\n${USAGE}\n`); return EXIT.USAGE; }
  if (opts.help) { process.stdout.write(USAGE + "\n"); return EXIT.OK; }
  if (!opts.file) { process.stderr.write(`cs-error: E_USAGE: no input file\n${USAGE}\n`); return EXIT.USAGE; }
  if (!["text", "json"].includes(opts.format)) { process.stderr.write("cs-error: E_USAGE: --format is text or json\n"); return EXIT.USAGE; }
  if (!fs.existsSync(opts.file)) { process.stderr.write(`cs-error: E_USAGE: file not found: ${opts.file}\n`); return EXIT.NOINPUT; }
  if (!have("ffprobe")) { process.stderr.write("cs-error: E_NO_CAPABILITY: ffprobe is not installed (it ships with ffmpeg: ffmpeg.org/download.html)\n"); return EXIT.INTERNAL; }
  try {
    const r = checkVideo(opts.file, opts);
    process.stdout.write((opts.format === "json" ? JSON.stringify(r) : printText(r)) + "\n");
    return r.exitCode;
  } catch (e) {
    process.stderr.write(`cs-error: ${e.code || "E_INTERNAL"}: ${e.message}\n`);
    return e.code === "E_USAGE" ? EXIT.DATA : EXIT.INTERNAL;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = main(process.argv.slice(2));
