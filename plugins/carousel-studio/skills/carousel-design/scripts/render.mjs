#!/usr/bin/env node
/*
 * render.mjs · the publishing kit from a spec, headless (Claude Code lane).
 *
 *   node render.mjs --spec FILE [--brand FILE] --out DIR [--formats png,jpeg,pdf,zip,qa[,source]] [--variants 3x4,4x5]
 *                   [--video internal|hyperframes|none] [--studio FILE] [--lang ar|en] [--timeout MS]
 *                   [--chromium PATH] [--headed] [--save-plan] [--contact-sheet] [--format json|text]
 *   node render.mjs --preflight --spec FILE [--brand FILE] [--presets creator,poster,notebook] [--format json|text]
 *
 * --preflight is for the design huddle: nothing is exported and no video is made. The cover and slide 2 of the post are rendered in each
 * candidate preset (all three shipped presets by default) and put through the rendered gates, so a cover too small at 130 px, with a
 * dead zone, fails a gate or does not allow the topic's motion is found before any design decision is made. One line per preset; a
 * JSON object with the findings when --format json.
 *
 * The Studio page (built from the spec with build_studio.py unless --studio is given) is served on loopback (127.0.0.1)
 * and opened in headless Chromium with automation on. The page's own exporter (CS.automation.exportAll) renders every file,
 * so the kit matches the Studio. Video defaults to the internal H.264 encoder in Chrome/Edge, with no tool download.
 * HyperFrames runs only with --video hyperframes (via cover_video.mjs); no download prompt.
 * Files land under --out with the kit's own names (3x4/…, 4x5/…, caption.txt, …); a JSON summary goes to stdout.
 * --save-plan persists the first automatic visual plan into the input spec. --contact-sheet writes
 * --out/contact-sheet.png with kind/recipe/tone rows, including unsaved automatic previews; it is not in the kit zip.
 * The default kit is the light one (about 3 MB for eight slides): add `source` to --formats for spec.json, cover.hf.html and
 * studio-source.html, which together weigh more than 10 MB (nearly all embedded fonts).
 * Exit code: 0 completed (pass or FIX), 1 FIX only with --strict, 2 BLOCK (64 usage, 65 bad data, 66 missing input,
 * 70 internal or missing tool, 73 cannot write). Errors go to stderr as `cs-error: <code>: <message>`.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { pathToFileURL, fileURLToPath } from "node:url";
import { EXIT, LaneError, buildStudioPage, haveTool, launchChromium, openStudio, renderCoverVideo, HYPERFRAMES_VERSION } from "./cover_video.mjs";
import { planSpec, savePlanSpec, readPlanSource, loadPlanner } from "./plan.mjs";
import { drawContact } from "./render_contact.mjs";

const CHUNK = 4 * 1024 * 1024;
const ALL_FORMATS = ["png", "jpeg", "pdf", "zip", "source", "qa"];
const DEFAULT_FORMATS = ALL_FORMATS.filter((f) => f !== "source");     // the source files are an opt-in, as in the Studio
const USAGE = "usage: node render.mjs --spec FILE [--brand FILE] --out DIR [--save-plan] [--contact-sheet] [--strict] [--formats png,jpeg,pdf,zip,qa[,source]] [--variants 3x4,4x5] [--video hyperframes|internal|none] [--studio FILE] [--lang ar|en] [--timeout MS] [--chromium PATH] [--headed] [--format json|text]\n       node render.mjs --preflight --spec FILE [--brand FILE] [--presets creator,poster,notebook] [--studio FILE] [--timeout MS] [--chromium PATH] [--format json|text]";

function parseArgs(argv) {
  const known = { spec: "specFile", brand: "brandFile", out: "outDir", formats: "formats", variants: "variants", video: "video", studio: "studioFile", lang: "lang", timeout: "timeout", chromium: "chromium", format: "format", presets: "presets" };
  const o = { formats: DEFAULT_FORMATS.join(","), variants: "3x4,4x5", video: "internal", lang: "ar", timeout: "300000", format: "json" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") { o.help = true; continue; }
    if (a === "--headed") { o.headed = true; continue; }
    if (a === "--preflight") { o.preflight = true; continue; }
    if (a === "--save-plan") { o.savePlan = true; continue; }
    if (a === "--contact-sheet") { o.contactSheet = true; continue; }
    if (a === "--strict") { o.strict = true; continue; }
    if (!a.startsWith("--") || !(a.slice(2) in known)) throw new LaneError("E_USAGE", `unknown argument ${a}`, EXIT.USAGE);
    const v = argv[++i];
    if (v === undefined) throw new LaneError("E_USAGE", `missing value for ${a}`, EXIT.USAGE);
    o[known[a.slice(2)]] = v;
  }
  o.formatList = o.formats.split(",").map((s) => s.trim()).filter(Boolean);
  o.variantList = o.variants.split(",").map((s) => s.trim()).filter(Boolean);
  o.timeoutMs = parseInt(o.timeout, 10);
  o.presetList = (o.presets || "").split(",").map((s) => s.trim()).filter(Boolean);
  return o;
}

function validate(o) {
  if (!o.specFile || (!o.outDir && !o.preflight)) throw new LaneError("E_USAGE", o.preflight ? "--spec is required" : "--spec and --out are required", EXIT.USAGE);
  if (o.preflight && o.contactSheet) throw new LaneError("E_USAGE", "--contact-sheet requires an export, not --preflight", EXIT.USAGE);
  const badFormat = o.formatList.find((f) => !ALL_FORMATS.includes(f));
  if (badFormat) throw new LaneError("E_USAGE", `--formats: unknown format "${badFormat}" (use ${ALL_FORMATS.join(", ")})`, EXIT.USAGE);
  const badVariant = o.variantList.find((v) => !["3x4", "4x5"].includes(v));
  if (badVariant || !o.variantList.length) throw new LaneError("E_USAGE", "--variants takes 3x4 and/or 4x5", EXIT.USAGE);
  if (!["hyperframes", "internal", "none"].includes(o.video)) throw new LaneError("E_USAGE", "--video is hyperframes, internal or none", EXIT.USAGE);
  if (!["ar", "en"].includes(o.lang)) throw new LaneError("E_USAGE", "--lang is ar or en", EXIT.USAGE);
  if (!(o.timeoutMs > 0)) throw new LaneError("E_USAGE", "--timeout must be a positive number of milliseconds", EXIT.USAGE);
  if (!["json", "text"].includes(o.format)) throw new LaneError("E_USAGE", "--format is json or text", EXIT.USAGE);
}

function readJson(file, what) {
  if (!fs.existsSync(file)) throw new LaneError("E_USAGE", `${what} not found: ${file}`, EXIT.NOINPUT);
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) { throw new LaneError("E_SCHEMA", `${what} is not valid JSON (${e.message})`, EXIT.DATA); }
}

// Older Python page builders do not embed the free contract yet. Complete the private,
// trusted Studio template before boot; never modify the caller's prebuilt page.
function freeContractPage(file, spec, work) {
  if (!spec.slides?.some(s => s.type !== "cover" && typeof s.free?.html === "string")) return file;
  const html = fs.readFileSync(file, "utf8");
  if (html.includes('id="cs-free-design"')) return file;
  const marker = '<script id="cs-boot">', at = html.indexOf(marker);
  if (at < 0) throw new LaneError("E_FREE_CONTRACT", "The Studio page needs a cs-free-design JSON block before boot.", EXIT.DATA);
  const data = readJson(path.join(path.dirname(fileURLToPath(import.meta.url)), "../data/free-design.json"), "free design contract");
  const block = '<script type="application/json" id="cs-free-design">' + JSON.stringify(data).replace(/</g, "\\u003c") + '</script>\n';
  const out = path.join(work, "free-studio.html");
  fs.writeFileSync(out, html.slice(0, at) + block + html.slice(at), "utf8");
  return out;
}

/** Does this kit path belong in the output the user asked for? */
function wanted(p, o) {
  const v = p.split("/")[0];
  if ((v === "3x4" || v === "4x5") && !o.variantList.includes(v)) return false;
  if (/\.mp4$/.test(p)) return o.video !== "none";
  if (/^3x4\/.*\.png$/.test(p)) return o.formatList.includes("png");
  if (/^4x5\/.*\.jpg$/.test(p)) return o.formatList.includes("jpeg");
  if (p === "carousel.pdf") return o.formatList.includes("pdf");
  if (/-kit\.zip$/.test(p)) return o.formatList.includes("zip");
  if (p === "spec.json" || p === "cover.hf.html" || p === "studio-source.html") return o.formatList.includes("source");
  if (/^qa-report\./.test(p)) return true;
  return true;
}

/** QA's exitCode describes its findings; this exit describes whether the export completed. */
function exportExitCode(report, ok, strict) {
  if (report && report.status === "block") return EXIT.BLOCK;
  if (!ok || !report) return EXIT.INTERNAL;
  return strict && report.status === "fix" ? 1 : EXIT.OK;
}

/** True when this run is expected to produce a cover video. The spec decides, the flag only narrows: a single post, a cover with no
 *  motion (`recipe: "none"`), a spec that switched MP4 off, or `--video none` asks for stills only, so a missing MP4 is not a failure
 *  there. An external motion plate is rendered by HyperFrames in Claude Code, never by the Studio's own encoder. */
function wantsCoverVideo(o, spec) {
  const motion = spec && spec.cover && spec.cover.motion;
  if (o.video === "none" || !spec || spec.format === "single") return false;
  if (!motion || motion.recipe === "none") return false;
  if (spec.compat && spec.compat.mp4 === "off") return false;
  if (motion.source === "external" && o.video !== "hyperframes") return false;
  return true;
}

function coverVideoOutcome(result, variants, requested) {
  const files = (result.files || []).filter((f) => /\.mp4$/i.test(f.path) && f.bytes > 0);
  const missing = requested ? variants.map((v) => `${v}/01-cover.mp4`).filter((p) => !files.some((f) => f.path === p)) : [];
  return { requested, failed: missing.length > 0, files, missing,
    errors: missing.map((p) => ({ path: p, reason: (result.skipped || []).find((s) => s.path === p)?.reason || "The requested cover video was not produced." })) };
}

/** Diagnose an older oversized post before the strict page builder sees it. */
function slideCountReport(spec, brand) {
  const skill = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const max = readJson(path.join(skill, "data/platform-instagram.json"), "platform").plugin.slides.hardMax;
  if (spec.format !== "carousel" || !Array.isArray(spec.slides) || spec.slides.length <= max) return null;
  const { CS } = loadPlanner();
  const context = { CS, TextEncoder, TextDecoder, console };
  context.window = context;
  vm.runInNewContext(fs.readFileSync(path.join(skill, "runtime/cs-qa.js"), "utf8"), context);
  const findings = CS.qa.runText({ spec, brand, gates: ["C5"] }).filter((r) => r.rule === "C5.slide-count");
  return JSON.parse(JSON.stringify(CS.qa.report.toJSON(spec, findings, { lane: "claude-code", checkpoint: spec.checkpoint || "script" })));
}

async function pullFile(page, filePath, bytes) {
  const chunks = [];
  for (let offset = 0; offset < bytes; offset += CHUNK) {
    const b64 = await page.evaluate(([p, off, len]) => window.CS.automation.readChunk(p, off, len), [filePath, offset, CHUNK]);
    chunks.push(Buffer.from(b64, "base64"));
  }
  return Buffer.concat(chunks.length ? chunks : [Buffer.alloc(0)]);
}

function videoInfoFrom(check) {
  const info = { blankFrames: check.blankFrames === null ? undefined : check.blankFrames, flashesPerSecondMax: check.flashesPerSecondMax === null ? undefined : check.flashesPerSecondMax,
    stillShare: check.stillShare === null ? undefined : check.stillShare, thinRunSeconds: check.thinRunSeconds === null ? undefined : check.thinRunSeconds, closedGop: check.info.closedGop, constantRate: check.info.constantRate,
    pixFmt: check.info.pixFmt, range: check.info.range, level: check.info.level === null ? undefined : check.info.level, colour: check.info.colour };
  // only the same-encode comparison goes to the QA gate: a decoded 4:2:0 frame can never match a lossless poster to the gate's 45 dB
  if (check.loop && check.loop.lastVsFrame0) info.loop = { lastVsFrame0: check.loop.lastVsFrame0 };
  return info;
}

/** The design huddle's pre-flight: the cover and slide 2 of the post in each candidate preset, through the rendered gates (runs in the page). */
async function preflight(page, spec, brand, presets) {
  return page.evaluate(async ({ spec, brand, presets }) => {
    const reg = CS.core.registry, all = reg.listPresets(), ids = presets.length ? presets : all.map((p) => p.id), rec = CS.motion.recommend(spec), wanted = (spec.cover && spec.cover.motion && spec.cover.motion.recipe) || rec.recipe;
    const d9 = CS.qa.rules().gates.find((g) => g.id === "D9").checks[0].params, keep = d9.maxShare;
    const rows = [];
    for (const id of ids) {
      const meta = all.find((p) => p.id === id);
      if (!meta) { rows.push({ preset: id, error: "unknown preset" }); continue; }
      const s = JSON.parse(JSON.stringify(spec));
      s.style = Object.assign({}, s.style, { presetId: id + "@" + meta.version });
      d9.maxShare = 0;                                              // report the empty band of every cover, not only the ones over the limit
      try {
        const tokens = CS.core.resolve.post(s, brand);
        const deck = await CS.core.render.deck(s, brand, { mode: "export", useFrozen: false, slideIds: s.slides.slice(0, 2).map((x) => x.id) });
        const found = await CS.qa.runRendered({ spec: s, tokens, deck });
        const tile = await CS.qa.thumbnail(deck.slides[0].el);
        deck.dispose();
        const band = found.find((r) => r.rule === "D9.dead-zone"), allowed = (reg.getPreset(id).motion || {}).allowed || [];
        const real = found.filter((r) => !(r.rule === "D9.dead-zone" && Number((/(\d+)%/.exec(r.msg.en) || [])[1]) < Math.round(keep * 100)));
        rows.push({
          preset: id, hero130Px: Math.round(tile.heroPx * 10) / 10, deadZonePct: band ? Number((/(\d+)%/.exec(band.msg.en) || [])[1]) : 0,
          recipe: wanted, recipeAllowed: allowed.indexOf(wanted) >= 0 || wanted === "none",
          counts: { block: real.filter((r) => r.sev === "BLOCK").length, fix: real.filter((r) => r.sev === "FIX").length, note: real.filter((r) => r.sev === "NOTE").length },
          findings: real.filter((r) => r.sev !== "NOTE").map((r) => ({ sev: r.sev, rule: r.rule, slide: r.slide || "", msg: r.msg.en }))
        });
      } catch (e) { rows.push({ preset: id, error: String((e && e.message) || e) }); }
      finally { d9.maxShare = keep; }
    }
    return rows;
  }, { spec, brand, presets });
}

async function main(argv) {
  const o = parseArgs(argv);
  if (o.help) { process.stdout.write(USAGE + "\n"); return EXIT.OK; }
  validate(o);
  const major = parseInt(process.versions.node.split(".")[0], 10);
  if (major < 22) throw new LaneError("E_NO_CAPABILITY", `Node.js 22 or newer is required (this is ${process.versions.node}).`, EXIT.INTERNAL);
  const input = readPlanSource(o.specFile, "spec");
  let spec = input.value;
  const brand = o.brandFile ? readJson(o.brandFile, "brand") : null;
  const log = (m) => process.stderr.write(m + "\n");
  const countReport = slideCountReport(spec, brand);
  if (countReport) {
    const files = [], out = o.outDir ? path.resolve(o.outDir) : null;
    if (!o.preflight) {
      const { CS } = loadPlanner(), context = { CS, TextEncoder, TextDecoder, console }; context.window = context;
      vm.runInNewContext(fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../runtime/cs-qa.js"), "utf8"), context);
      try {
        fs.mkdirSync(out, { recursive: true });
        for (const [name, body] of [["qa-report.json", JSON.stringify(countReport, null, 2) + "\n"], ["qa-report.md", CS.qa.report.toMarkdown(countReport, o.lang)]]) {
          fs.writeFileSync(path.join(out, name), body, "utf8"); files.push({ path: name, bytes: Buffer.byteLength(body) });
        }
      } catch (e) { throw new LaneError("E_USAGE", `Cannot write QA report: ${e.message}`, EXIT.NOWRITE); }
    }
    log("cs-error: C5.slide-count: " + countReport.results[0].msg.en);
    const summary = { ok: false, exitCode: EXIT.BLOCK, out, specId: spec.id, files, exported: false, qa: countReport };
    process.stdout.write(o.format === "text" ? countReport.results[0].msg[o.lang] + "\n" : JSON.stringify(summary) + "\n");
    return EXIT.BLOCK;
  }
  const planned = o.savePlan || o.contactSheet ? planSpec(spec, brand) : null;
  if (o.savePlan) {
    const added = planned.spec.slides.some((s, i) => s.visual && !spec.slides[i].visual);
    spec = planned.spec;
    if (savePlanSpec(o.specFile, spec, input.raw) && added) log("اتضافت صور تلقائي");
  }
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "cs-render-"));
  const outDir = o.outDir ? path.resolve(o.outDir) : work;
  if (!o.preflight) { try { fs.mkdirSync(outDir, { recursive: true }); } catch (e) { throw new LaneError("E_USAGE", `Cannot create ${outDir}: ${e.message}`, EXIT.NOWRITE); } }
  let browser = null, studio = null;
  try {
    let studioFile = o.studioFile;
    if (!studioFile) { log("جاري بناء صفحة الأستوديو…"); studioFile = buildStudioPage({ specFile: path.resolve(o.specFile), brandFile: o.brandFile && path.resolve(o.brandFile), outFile: path.join(work, "studio.html") }); }
    studioFile = freeContractPage(studioFile, spec, work);
    browser = await launchChromium({ chromium: o.chromium, headed: o.headed, channelFirst: o.video === "internal" });
    studio = await openStudio({ browser, studioFile, timeout: o.timeoutMs });
    const { page } = studio;
    await page.evaluate(([s, b]) => window.CS.automation.setSpec(s, b), [spec, brand]);

    if (o.preflight) {
      const rows = await preflight(page, spec, brand, o.presetList);
      if (o.format === "text") {
        const line = (r) => r.error ? `  ${r.preset.padEnd(10)} error: ${r.error}` : `  ${r.preset.padEnd(10)} BLOCK ${r.counts.block} · FIX ${r.counts.fix} · NOTE ${r.counts.note}   hero at 130 px ${String(r.hero130Px).padStart(5)}   empty band ${String(r.deadZonePct).padStart(2)}%   motion ${r.recipe}${r.recipeAllowed ? "" : " (not allowed by this preset)"}`;
        process.stdout.write("preflight: the cover and slide 2 in each preset, rendered gates only\n" + rows.map(line).join("\n") + "\n" + rows.flatMap((r) => (r.findings || []).map((f) => `    ${r.preset} · ${f.sev} ${f.rule} ${f.slide} ${f.msg}`)).join("\n") + "\n");
      } else process.stdout.write(JSON.stringify({ ok: !rows.some((r) => r.error), specId: spec.id, presets: rows, pageErrors: studio.errors.slice(0, 5) }) + "\n");
      return rows.some((r) => r.error) ? EXIT.INTERNAL : EXIT.OK;
    }

    const motion = spec.cover && spec.cover.motion;
    const wantsVideo = wantsCoverVideo(o, spec);
    const videos = [], videoSummary = { mode: o.video, files: [], skipped: [] };
    if (!wantsVideo && o.video === "internal" && motion && motion.source === "external")
      videoSummary.skipped.push({ path: "3x4/01-cover.mp4", reason: "The cover uses an external motion plate: render it with --video hyperframes." });
    if (o.video === "hyperframes" && wantsVideo) {
      for (const variant of o.variantList.includes("4x5") ? ["3x4", "4x5"] : ["3x4"]) {
          const rel = `${variant}/01-cover.mp4`, dest = path.join(outDir, rel);
          try {
          if (motion?.source === "external") throw new Error("External motion plate: attach the plate clip and render it with HyperFrames by hand.");
          if (!haveTool("ffmpeg") || !haveTool("ffprobe")) throw new Error("ffmpeg and ffprobe are required for the HyperFrames cover. Install FFmpeg or use --video none.");
          log(`الغلاف المتحرك (${variant})…`);
          const r = await renderCoverVideo({ page, specFile: o.specFile, variant, outFile: dest, quality: "high", version: HYPERFRAMES_VERSION, log });
          videos.push({ path: rel, base64: fs.readFileSync(dest).toString("base64"), info: videoInfoFrom(r.check) });
          videoSummary.files.push({ path: rel, bytes: r.bytes, check: r.check.status });
          } catch (e) { videoSummary.skipped.push({ path: rel, reason: String(e.message || e) }); }
      }
    }
    log("جاري تصدير الحزمة…");
    const dialect = o.lang === "en" ? "en" : undefined;
    let exportTimer;     // cleared once the race is decided: a pending timer keeps Node alive for the whole --timeout after the kit is written
    const result = await Promise.race([
      page.evaluate((opts) => window.CS.automation.exportAll(opts), { video: wantsVideo, videos, videoErrors: videoSummary.skipped, variants4x5: o.variantList.includes("4x5"), pdf: o.formatList.includes("pdf"), source: o.formatList.includes("source"), zip: o.formatList.includes("zip"), dialect }),
      new Promise((_, reject) => { exportTimer = setTimeout(() => reject(new LaneError("E_INTERNAL", `The export did not finish within ${o.timeoutMs} ms.`, EXIT.INTERNAL)), o.timeoutMs); })
    ]).finally(() => clearTimeout(exportTimer));
    const written = [];
    for (const f of result.files) {
      if (!wanted(f.path, o)) continue;
      const dest = path.join(outDir, f.path);
      if (videos.some((v) => v.path === f.path)) { written.push({ path: f.path, bytes: f.bytes }); continue; }     // the HyperFrames file is already on disk
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      try { fs.writeFileSync(dest, await pullFile(page, f.path, f.bytes)); } catch (e) { throw new LaneError("E_USAGE", `Cannot write ${dest}: ${e.message}`, EXIT.NOWRITE); }
      written.push({ path: f.path, bytes: f.bytes });
    }
    const report = result.report || null, status = report ? report.status : "pass";
    if (o.contactSheet) {
      const pngs = result.files.filter((f) => /^3x4\/.*\.png$/.test(f.path));
      if (pngs.length !== spec.slides.length) throw new LaneError("E_CONTACT", "export did not provide one 3x4 PNG per slide", EXIT.INTERNAL);
      const renders = [];
      for (let i = 0; i < pngs.length; i++) renders.push({ id: spec.slides[i].id, bytes: await pullFile(page, pngs[i].path, pngs[i].bytes) });
      const sheet = await drawContact(renders, planned.plan, path.join(outDir, "contact-sheet.png"), { browser });
      written.push({ path: "contact-sheet.png", bytes: sheet.bytes });
    }
    const outcome = coverVideoOutcome(result, o.variantList, wantsVideo);
    outcome.errors.forEach((e) => log(`cs-error: E_VIDEO_MISSING: ${e.path}: ${e.reason} Use --video none for a still-only export.`));
    const exitCode = outcome.failed ? EXIT.BLOCK : exportExitCode(report, result.ok, o.strict);
    const summary = { ok: result.ok && !outcome.failed, exitCode, out: outDir, specId: spec.id, files: written, skipped: result.skipped || [], video: Object.assign(videoSummary, outcome), qa: report ? { status, counts: report.counts, exitCode: report.exitCode } : null, pageErrors: studio.errors.slice(0, 5) };
    if (o.format === "text") {
      process.stdout.write(`${summary.ok ? "Exported" : "Incomplete"}: ${written.length} files in ${outDir}\n` + (report ? `  QA: ${status} (BLOCK ${report.counts.block} · FIX ${report.counts.fix} · NOTE ${report.counts.note})\n` : "") + (summary.skipped.length ? summary.skipped.map((s) => `  skipped ${s.path}: ${s.reason}`).join("\n") + "\n" : ""));
    } else process.stdout.write(JSON.stringify(summary) + "\n");
    return exitCode;
  } finally {
    if (studio) await studio.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
    fs.rmSync(work, { recursive: true, force: true });
  }
}

export { parseArgs, wanted, exportExitCode, coverVideoOutcome, wantsCoverVideo, slideCountReport };

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then((c) => { process.exitCode = c; }, (e) => {
    process.stderr.write(`cs-error: ${e.code || "E_INTERNAL"}: ${e.message}\n${e.code === "E_USAGE" && e.exit === EXIT.USAGE ? USAGE + "\n" : ""}`);
    process.exitCode = e.exit || EXIT.INTERNAL;
  });
}

