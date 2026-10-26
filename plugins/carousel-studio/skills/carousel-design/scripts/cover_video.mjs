#!/usr/bin/env node
/*
 * cover_video.mjs · the animated cover as an MP4 through HyperFrames (Claude Code lane).
 *
 *   node cover_video.mjs --spec FILE [--brand FILE] --out FILE.mp4 [--variant 3x4|4x5] [--fps 30]
 *                        [--quality draft|standard|high] [--keep-dir DIR] [--hyperframes-version X]
 *                        [--studio FILE] [--chromium PATH] [--format text|json]
 *
 * 1. The Studio page (built from the spec unless --studio is given) is opened in headless Chromium over loopback (127.0.0.1),
 *    and its own engine writes the cover as one HyperFrames composition (CS.motion.hf.composition) plus the poster PNG.
 * 2. `npx hyperframes@<pin> render` turns the composition into an MP4 (30 fps, nothing sent anywhere).
 * 3. check_video.mjs verifies it (H.264, fast start, frame count, keyframe, no blank frame, loop). Exit 0 / 1 / 2 as there.
 *    The poster that frame 0 is compared with is a screenshot of the composition at t = 0 in the same Chromium that HyperFrames
 *    uses to draw the frames, not the Studio painter's PNG: the two rasterisers differ at glyph and texture edges, and on the
 *    textured presets (notebook, heritage) that difference alone put frame 0 at SSIM 0.988 against the painter's PNG (0.992 against
 *    the native one) and blocked a correct video. The kit's own 01-cover.png stays the painter's.
 *
 * This file also exports the helpers render.mjs shares: loadPlaywright, launchChromium, serveDirectory, buildStudioPage,
 * openStudio. Errors go to stderr as `cs-error: <code>: <message>`; exit codes follow the plugin table (64 usage, 65 bad data,
 * 66 missing input, 70 internal or missing tool, 73 cannot write).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { createRequire } from "node:module";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { checkVideo } from "./check_video.mjs";

/** Pinned HyperFrames CLI. 0.8.185 was the newest release on 2026-10-22 and passed the smoke render of this script the same day. */
export const HYPERFRAMES_VERSION = "0.8.185";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const EXIT = { OK: 0, FIX: 1, BLOCK: 2, USAGE: 64, DATA: 65, NOINPUT: 66, INTERNAL: 70, NOWRITE: 73 };

export class LaneError extends Error {
  constructor(code, message, exit = EXIT.INTERNAL) { super(message); this.code = code; this.exit = exit; }
}

/* ------------------------------------------------------------------ small utilities */

export function shellQuote(arg) {
  const s = String(arg);
  return process.platform === "win32" ? `"${s.replace(/"/g, '\\"')}"` : `'${s.replace(/'/g, "'\\''")}'`;
}

export function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: "utf8", windowsHide: true, maxBuffer: 256 * 1024 * 1024, ...opts });
  return { code: r.status, stdout: r.stdout || "", stderr: r.stderr || "", error: r.error };
}

export function haveTool(cmd, versionArg = "-version") {
  const r = run(cmd, [versionArg]);
  return !r.error && r.code === 0;
}

function readJson(file, what) {
  if (!fs.existsSync(file)) throw new LaneError("E_USAGE", `${what} not found: ${file}`, EXIT.NOINPUT);
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch (e) { throw new LaneError("E_SCHEMA", `${what} is not valid JSON (${e.message})`, EXIT.DATA); }
}

function checkNode() {
  const major = parseInt(process.versions.node.split(".")[0], 10);
  if (major < 22) throw new LaneError("E_NO_CAPABILITY", `Node.js 22 or newer is required (this is ${process.versions.node}). Install it from nodejs.org`, EXIT.INTERNAL);
}

/* ------------------------------------------------------------------ Playwright and Chromium */

function globalNodeModules() {
  const r = run("npm", ["root", "-g"], { shell: process.platform === "win32" });
  return r.code === 0 ? r.stdout.trim() : "";
}

/** playwright-core (or playwright) from, in order: this script's resolution, the working directory, CS_PLAYWRIGHT_PATH, the global folder. */
export async function loadPlaywright() {
  const names = ["playwright-core", "playwright"];
  for (const name of names) {
    try { return await import(name); } catch { /* try the next place */ }
  }
  const roots = [process.cwd(), process.env.CS_PLAYWRIGHT_PATH, globalNodeModules() && path.join(globalNodeModules(), "..")].filter(Boolean);
  for (const root of roots) {
    for (const name of names) {
      try { return await import(pathToFileURL(createRequire(path.join(root, "noop.js")).resolve(name)).href); } catch { /* keep looking */ }
    }
  }
  throw new LaneError("E_NO_CAPABILITY", "playwright-core is not installed. Fix: run `npm install playwright-core` in your project folder (the browser it needs is usually already on this machine: set --chromium PATH if not).", EXIT.INTERNAL);
}

/** Newest Chromium that a previous Playwright install left on this machine (no download is ever started). */
export function findInstalledChromium() {
  const bases = [];
  if (process.env.PLAYWRIGHT_BROWSERS_PATH && process.env.PLAYWRIGHT_BROWSERS_PATH !== "0") bases.push(process.env.PLAYWRIGHT_BROWSERS_PATH);
  if (process.platform === "win32" && process.env.LOCALAPPDATA) bases.push(path.join(process.env.LOCALAPPDATA, "ms-playwright"));
  if (process.platform === "darwin") bases.push(path.join(os.homedir(), "Library", "Caches", "ms-playwright"));
  bases.push(path.join(os.homedir(), ".cache", "ms-playwright"));
  const tails = ["chrome-win64/chrome.exe", "chrome-win/chrome.exe", "chrome-linux64/chrome", "chrome-linux/chrome",
    "chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing", "chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
    "chrome-mac/Chromium.app/Contents/MacOS/Chromium", "chrome-mac-arm64/Chromium.app/Contents/MacOS/Chromium"];
  for (const base of bases) {
    if (!fs.existsSync(base)) continue;
    const dirs = fs.readdirSync(base).filter((d) => /^chromium-\d+$/.test(d)).sort((a, b) => parseInt(b.split("-")[1], 10) - parseInt(a.split("-")[1], 10));
    for (const d of dirs) for (const t of tails) { const exe = path.join(base, d, t); if (fs.existsSync(exe)) return exe; }
  }
  return null;
}

/** Launches Chromium: --chromium PATH, then CS_CHROMIUM, then Playwright's own, an installed one, then the system Chrome or Edge. */
export async function launchChromium({ chromium: exe, headed = false, channelFirst = false } = {}) {
  const pw = await loadPlaywright();
  const engine = pw.chromium || (pw.default && pw.default.chromium);
  const tries = [];
  const explicit = exe || process.env.CS_CHROMIUM;
  if (explicit) tries.push({ executablePath: explicit });
  if (channelFirst) tries.push({ channel: "chrome" }, { channel: "msedge" });
  tries.push({});
  const installed = findInstalledChromium();
  if (installed) tries.push({ executablePath: installed });
  if (!channelFirst) tries.push({ channel: "chrome" }, { channel: "msedge" });
  let lastError = null;
  for (const t of tries) {
    try { return await engine.launch({ headless: !headed, ...t }); } catch (e) { lastError = e; }
  }
  throw new LaneError("E_NO_CAPABILITY", `No Chromium could be started (${String(lastError && lastError.message).split("\n")[0]}). Fix: pass --chromium PATH, or install Chrome.`, EXIT.INTERNAL);
}

/* ------------------------------------------------------------------ the local server and the Studio page */

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".mp4": "video/mp4" };

/** Serves `dir` on the loopback address (127.0.0.1) at a random port. (Never file://: Windows blocks module and font loading there.) */
export async function serveDirectory(dir) {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent((req.url || "/").split("?")[0]).replace(/^\/+/, "") || "studio.html";
    if (rel === "favicon.ico") { res.writeHead(204); res.end(); return; }   // the browser asks for it once; answer quietly so the console stays clean
    const file = path.resolve(dir, rel);
    if (!file.startsWith(path.resolve(dir))) { res.writeHead(403); res.end(); return; }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); res.end("not found"); return; }
      res.writeHead(200, { "content-type": MIME[path.extname(file)] || "application/octet-stream", "cache-control": "no-store" });
      res.end(data);
    });
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  return { url: `${"http"}://127.0.0.1:${server.address().port}`, close: () => new Promise((r) => server.close(() => r())) };
}

export function findPython() {
  for (const cmd of [["python3"], ["python"], ["py", "-3"]]) {
    const r = run(cmd[0], [...cmd.slice(1), "--version"]);
    if (!r.error && r.code === 0) return cmd;
  }
  throw new LaneError("E_NO_CAPABILITY", "Python 3.11+ is needed to build the Studio page (python build_studio.py). Install it from python.org or pass a prebuilt page with --studio FILE.", EXIT.INTERNAL);
}

/** Runs build_studio.py (same folder) and returns the path of the page it wrote. */
export function buildStudioPage({ specFile, brandFile, outFile }) {
  const py = findPython(), script = path.join(HERE, "build_studio.py");
  if (!fs.existsSync(script)) throw new LaneError("E_NO_CAPABILITY", `build_studio.py is missing next to this script (${script}); pass a prebuilt page with --studio FILE.`, EXIT.INTERNAL);
  const args = [...py.slice(1), script, "--spec", specFile, "--view", "design", "--standalone", "--out", outFile];
  if (brandFile) args.push("--brand", brandFile);
  const r = run(py[0], args);
  if (r.code !== 0) throw new LaneError("E_SCHEMA", `build_studio.py failed (exit ${r.code}): ${(r.stderr || r.stdout).trim().split("\n").slice(-3).join(" | ")}`, r.code === 2 ? EXIT.BLOCK : EXIT.INTERNAL);
  return outFile;
}

/** Opens the Studio page with automation on and waits until it is ready. Returns { page, close }. */
export async function openStudio({ browser, studioFile, timeout = 180000 }) {
  const dir = path.dirname(path.resolve(studioFile)), name = path.basename(studioFile);
  const server = await serveDirectory(dir);
  const context = await browser.newContext({ viewport: { width: 1280, height: 1600 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/favicon/.test(m.text())) errors.push(m.text()); });
  await page.goto(`${server.url}/${encodeURIComponent(name)}?automation=1`, { waitUntil: "load", timeout });
  try { await page.waitForFunction(() => window.__csReady === true, null, { timeout }); }
  catch { throw new LaneError("E_NO_CAPABILITY", `The Studio page did not become ready in ${timeout} ms.${errors.length ? " Page errors: " + errors.slice(0, 3).join(" | ") : ""}`, EXIT.INTERNAL); }
  const hasAutomation = await page.evaluate(() => !!(window.CS && window.CS.automation));
  if (!hasAutomation) throw new LaneError("E_NO_CAPABILITY", "This Studio page has no CS.automation (build it with the current build_studio.py).", EXIT.INTERNAL);
  return { page, errors, close: async () => { await context.close(); await server.close(); } };
}

/** A screenshot of the composition at t = 0 in the same browser engine HyperFrames draws its frames with (null when the page cannot be driven).
 *  `projectDir` holds index.html; `context` is any open Playwright context. */
export async function nativePoster({ context, projectDir, variant, outFile }) {
  const server = await serveDirectory(projectDir);
  let page = null;
  try {
    const height = variant === "4x5" ? 1350 : 1440;
    page = await context.newPage();
    await page.setViewportSize({ width: 1080, height });
    await page.goto(`${server.url}/index.html`, { waitUntil: "load" });
    await page.waitForFunction(() => window.__timelines && window.__timelines["cs-cover"], null, { timeout: 30000 });
    await page.evaluate(async () => { const t = window.__timelines["cs-cover"]; if (t && t.seek) await t.seek(0); await document.fonts.ready; });
    await page.screenshot({ path: outFile, clip: { x: 0, y: 0, width: 1080, height } });
    return outFile;
  } catch { return null; }
  finally { if (page) await page.close().catch(() => {}); await server.close(); }
}

/* ------------------------------------------------------------------ HyperFrames */

function hyperframesCommand(version, dir, out, fps, quality) {
  const args = ["--yes", `hyperframes@${version}`, "render", dir, "--fps", String(fps), "--quality", quality, "--output", out];
  return { line: `npx ${args.map(shellQuote).join(" ")}`, args };
}

function runHyperframes({ version, dir, out, fps, quality, onProgress }) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env, HYPERFRAMES_NO_TELEMETRY: "1", DO_NOT_TRACK: "1" };
    const cmd = hyperframesCommand(version, dir, out, fps, quality);
    process.stderr.write(`cs-note: npx fetches hyperframes@${version} from the npm registry if it is not cached yet (first run only); nothing from the post is sent.\n`);
    const child = spawn(cmd.line, { shell: true, env, windowsHide: true, cwd: dir });
    let tail = "";
    const eat = (chunk) => {
      const text = chunk.toString("utf8");
      tail = (tail + text).slice(-6000);
      for (const m of text.matchAll(/@hf-progress (\{[^\n]*\})/g)) { try { const p = JSON.parse(m[1]); if (onProgress) onProgress(p); } catch { /* not JSON */ } }
    };
    child.stdout.on("data", eat); child.stderr.on("data", eat);
    child.on("error", (e) => reject(new LaneError("E_NO_CAPABILITY", `Could not start npx: ${e.message}. Fix: install Node.js 22+ (it ships npx).`, EXIT.INTERNAL)));
    child.on("close", (code) => {
      if (code === 0) resolve(tail);
      else reject(new LaneError("E_INTERNAL", `hyperframes@${version} render failed (exit ${code}). Last output: ${tail.trim().split("\n").slice(-6).join(" | ")}`, EXIT.INTERNAL));
    });
  });
}

/** Copies the video stream, drops any audio and puts the index first (cheap; no re-encode). */
function remuxFastStart(file) {
  const tmp = file + ".fix.mp4";
  const r = run("ffmpeg", ["-y", "-v", "error", "-i", file, "-an", "-map", "0:v:0", "-c:v", "copy", "-movflags", "+faststart", tmp]);
  if (r.code !== 0) return false;
  fs.renameSync(tmp, file);
  return true;
}

/* ------------------------------------------------------------------ the whole job */

/**
 * renderCoverVideo({ specFile, brandFile, outFile, variant, fps, quality, keepDir, version, studioFile, chromium, browser?, page?, log })
 * -> { out, variant, bytes, seconds, frames, check }
 * Pass `page` (an already open Studio page) to reuse it; otherwise a browser and a page are created and closed here.
 */
export async function renderCoverVideo(o) {
  const log = o.log || (() => {});
  const variant = o.variant === "4x5" ? "4x5" : "3x4", fps = o.fps || 30, quality = o.quality || "high", version = o.version || HYPERFRAMES_VERSION;
  const work = o.keepDir ? path.resolve(o.keepDir) : fs.mkdtempSync(path.join(os.tmpdir(), "cs-cover-"));
  fs.mkdirSync(work, { recursive: true });
  const project = path.join(work, "hf-project");
  fs.mkdirSync(project, { recursive: true });
  let ownBrowser = null, ownStudio = null, page = o.page;
  try {
    if (!page) {
      let studioFile = o.studioFile;
      if (!studioFile) { log("جاري بناء صفحة الأستوديو…"); studioFile = buildStudioPage({ specFile: o.specFile, brandFile: o.brandFile, outFile: path.join(work, "studio.html") }); }
      ownBrowser = await launchChromium({ chromium: o.chromium });
      ownStudio = await openStudio({ browser: ownBrowser, studioFile });
      page = ownStudio.page;
      const spec = readJson(o.specFile, "spec"), brand = o.brandFile ? readJson(o.brandFile, "brand") : undefined;
      await page.evaluate(([s, b]) => window.CS.automation.setSpec(s, b), [spec, brand]);
    }
    log("جاري تجهيز تركيب الغلاف…");
    const comp = await page.evaluate((v) => window.CS.automation.composition({ variant: v }), variant);
    fs.writeFileSync(path.join(project, "index.html"), comp.html, "utf8");
    const painterPoster = path.join(work, `poster-${variant}.png`);
    fs.writeFileSync(painterPoster, Buffer.from(comp.posterBase64, "base64"));
    const posterFile = (await nativePoster({ context: page.context(), projectDir: project, variant, outFile: path.join(work, `poster-native-${variant}.png`) })) || painterPoster;
    const out = path.resolve(o.outFile);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    const raw = path.join(work, `cover-${variant}.mp4`);
    log(`جاري تصدير الفيديو عبر HyperFrames ${version}…`);
    let last = -1;
    await runHyperframes({ version, dir: project, out: raw, fps, quality, onProgress: (p) => { const pct = Math.floor((p.pct || 0) / 10) * 10; if (pct !== last) { last = pct; log(`   ${p.code === "encode" ? "ترميز" : "التقاط"} ${pct}٪`); } } });
    if (!fs.existsSync(raw)) throw new LaneError("E_INTERNAL", "HyperFrames finished without writing a video.", EXIT.INTERNAL);
    const expect = `1080x${variant === "4x5" ? 1350 : 1440}`;
    let check = checkVideo(raw, { poster: posterFile, expect, seconds: comp.seconds, fps });
    if (check.results.some((r) => r.rule === "V1.faststart" || r.rule === "V1.audio") && remuxFastStart(raw)) check = checkVideo(raw, { poster: posterFile, expect, seconds: comp.seconds, fps });
    try { fs.copyFileSync(raw, out); } catch (e) { throw new LaneError("E_USAGE", `Cannot write ${out}: ${e.message}`, EXIT.NOWRITE); }
    return { out, variant, bytes: fs.statSync(out).size, seconds: comp.seconds, frames: comp.frames, recipe: comp.recipe, check, poster: posterFile, posterKind: posterFile === painterPoster ? "painter" : "native" };
  } finally {
    if (ownStudio) await ownStudio.close().catch(() => {});
    if (ownBrowser) await ownBrowser.close().catch(() => {});
    if (!o.keepDir) fs.rmSync(work, { recursive: true, force: true });
  }
}

/* ------------------------------------------------------------------ CLI */

const USAGE = "usage: node cover_video.mjs --spec FILE [--brand FILE] --out FILE.mp4 [--variant 3x4|4x5] [--fps 30] [--quality draft|standard|high] [--keep-dir DIR] [--hyperframes-version X] [--studio FILE] [--chromium PATH] [--format text|json]";

function parseArgs(argv) {
  const known = { spec: "specFile", brand: "brandFile", out: "outFile", variant: "variant", fps: "fps", quality: "quality", "keep-dir": "keepDir", "hyperframes-version": "version", studio: "studioFile", chromium: "chromium", format: "format" };
  const o = { format: "text" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") { o.help = true; continue; }
    if (!a.startsWith("--") || !(a.slice(2) in known)) throw new LaneError("E_USAGE", `unknown argument ${a}`, EXIT.USAGE);
    const v = argv[++i];
    if (v === undefined) throw new LaneError("E_USAGE", `missing value for ${a}`, EXIT.USAGE);
    o[known[a.slice(2)]] = v;
  }
  if (o.fps !== undefined) o.fps = parseInt(o.fps, 10);
  return o;
}

async function main(argv) {
  let o;
  try { o = parseArgs(argv); } catch (e) { process.stderr.write(`cs-error: ${e.code}: ${e.message}\n${USAGE}\n`); return e.exit; }
  if (o.help) { process.stdout.write(USAGE + "\n"); return EXIT.OK; }
  try {
    if (!o.specFile || !o.outFile) throw new LaneError("E_USAGE", "--spec and --out are required", EXIT.USAGE);
    if (!["3x4", "4x5", undefined].includes(o.variant)) throw new LaneError("E_USAGE", "--variant is 3x4 or 4x5", EXIT.USAGE);
    if (!["draft", "standard", "high", undefined].includes(o.quality)) throw new LaneError("E_USAGE", "--quality is draft, standard or high", EXIT.USAGE);
    if (!["text", "json"].includes(o.format)) throw new LaneError("E_USAGE", "--format is text or json", EXIT.USAGE);
    if (o.fps !== undefined && o.fps !== 30) throw new LaneError("E_USAGE", "the cover is 30 fps (the contract fixes it)", EXIT.USAGE);
    checkNode();
    if (!haveTool("ffmpeg") || !haveTool("ffprobe")) throw new LaneError("E_NO_CAPABILITY", "ffmpeg and ffprobe are required. Fix: install FFmpeg (ffmpeg.org/download.html) and make sure both are on PATH.", EXIT.INTERNAL);
    readJson(o.specFile, "spec"); if (o.brandFile) readJson(o.brandFile, "brand");
    const log = (m) => { if (o.format === "text") process.stderr.write(m + "\n"); };
    const r = await renderCoverVideo({ ...o, log });
    const summary = { out: r.out, variant: r.variant, bytes: r.bytes, seconds: r.seconds, frames: r.frames, recipe: r.recipe, check: { status: r.check.status, counts: r.check.counts, results: r.check.results, info: r.check.info, loop: r.check.loop } };
    process.stdout.write((o.format === "json" ? JSON.stringify(summary) : `✔ ${r.out}  (${(r.bytes / 1024).toFixed(0)} KiB, ${r.seconds} s, ${r.frames} frames, ${r.recipe})\n${r.check.results.map((f) => `  ${f.sev} ${f.rule}: ${f.msg.ar} — ${f.msg.en}`).join("\n")}`.trimEnd()) + "\n");
    return r.check.exitCode;
  } catch (e) {
    process.stderr.write(`cs-error: ${e.code || "E_INTERNAL"}: ${e.message}\n`);
    return e.exit || EXIT.INTERNAL;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2)).then((c) => { process.exitCode = c; });
