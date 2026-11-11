#!/usr/bin/env node
/* Text-free pictures on slides, Claude Code lane. Originals stay in plates/.
 * node plates.mjs slots|apply|restyle|check --dir POST [--brand FILE] [--format text|json]
 * node plates.mjs fit|embed --dir POST --slide s02 [--source original.png] [--crop|--pad]
 *   [--gravity center|top|bottom] [--focus x,y,w,h] [--flip] [--out FILE] (fit only)
 *   [--prompt-id ID --tool REF --text-checked-at ISO] (embed without a manifest record)
 *   [--layout-type proof --variant screenshot --slot screenshot]
 * Shared options: --spec FILE --chromium PATH --headed --timeout MS.
 * JSON goes only to stdout; progress and cs-error messages go to stderr.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";
import { EXIT, LaneError, launchChromium, buildStudioPage, serveDirectory } from "./cover_video.mjs";
import { readPlanSource, savePlanSpec } from "./plan.mjs";
import { validateManifest, refCap, makeAsset, attachPlate, plateFindings } from "./plates-lib.mjs";
import { measureSlots, fitImage } from "./plates-browser.mjs";

const SK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const COMMANDS = ["slots", "fit", "embed", "apply", "restyle", "check"];
const USAGE = "usage: node plates.mjs slots|apply|restyle|check --dir POST [--brand FILE] [--format text|json]\n       node plates.mjs fit|embed --dir POST --slide s02 [--source original.png] [--gravity center|top|bottom] [--focus x,y,w,h] [--crop|--pad] [--flip]\n         [--prompt-id ID --tool REF --text-checked-at ISO] [--layout-type proof --variant screenshot --slot screenshot]\n         [--out FILE (fit only)] [--spec FILE] [--chromium PATH] [--headed] [--timeout MS]";
const PLACEHOLDER = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const fail = (msg, code = EXIT.BLOCK) => { throw new LaneError(code === EXIT.USAGE ? "E_USAGE" : "E_SCHEMA", msg, code); };
const hash = data => createHash("sha256").update(data).digest("hex");

export function parseArgs(argv) {
  const o = { command: argv[0], format: "json", timeout: 180000 };
  const names = { dir: "dir", spec: "spec", brand: "brand", slide: "slideId", source: "source", gravity: "gravity", focus: "focus", out: "out", format: "format", timeout: "timeout", chromium: "chromium", "prompt-id": "promptId", tool: "tool", "text-checked-at": "checkedAt", "layout-type": "layoutType", variant: "variant", slot: "slot" };
  if (argv.includes("--help") || argv.includes("-h")) return { help: true };
  if (!COMMANDS.includes(o.command)) fail("choose " + COMMANDS.join(", "), EXIT.USAGE);
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (["--pad", "--crop"].includes(a)) { if (o.mode) fail("choose --crop or --pad", EXIT.USAGE); o.mode = a.slice(2); continue; }
    if (a === "--flip") { o.flip = true; continue; }
    if (a === "--headed") { o.headed = true; continue; }
    if (!a.startsWith("--") || !Object.hasOwn(names, a.slice(2))) fail("unknown argument " + a, EXIT.USAGE);
    const v = argv[++i];
    if (v === undefined || v.startsWith("--")) fail("missing value for " + a, EXIT.USAGE);
    o[names[a.slice(2)]] = v;
  }
  if (!["text", "json"].includes(o.format)) fail("--format is text or json", EXIT.USAGE);
  o.timeout = Number(o.timeout);
  if (!Number.isInteger(o.timeout) || o.timeout < 1) fail("--timeout must be positive milliseconds", EXIT.USAGE);
  if (o.focus) { const a = o.focus.split(",").map(Number); if (a.length !== 4 || a.some(n => !Number.isFinite(n))) fail("--focus is normalized x,y,w,h", EXIT.USAGE); o.focus = Object.fromEntries(["x", "y", "w", "h"].map((k, i) => [k, a[i]])); }
  const single = ["fit", "embed"].includes(o.command);
  if (single && !o.slideId) fail("--slide is required", EXIT.USAGE);
  if (!single && ["slideId", "source", "mode", "gravity", "focus", "flip", "out", "promptId", "tool", "checkedAt", "layoutType", "variant", "slot"].some(k => o[k] !== undefined)) fail("picture options are only for fit and embed; use plates/plates.json for apply", EXIT.USAGE);
  if (o.out && o.command !== "fit") fail("--out is only for fit", EXIT.USAGE);
  return o;
}

function schemaRuntime() {
  const box = { TextEncoder, TextDecoder, console: { log() {}, warn() {}, error() {} } }; box.window = box;
  vm.createContext(box, { codeGeneration: { strings: false, wasm: false } });
  vm.runInContext(fs.readFileSync(path.join(SK, "runtime/cs-core.js"), "utf8"), box, { timeout: 10000 });
  const schema = readPlanSource(path.join(SK, "schemas/spec.schema.json")).value;
  box.CS.core.schema.register("spec", schema);
  return { schema, validate: spec => {
    const checked = box.CS.core.schema.validateAgainst(schema, spec);
    return checked.ok ? box.CS.core.spec.validate(spec) : { ...checked, structure: [] };
  } };
}

function contained(base, target) {
  const rel = path.relative(base, target);
  return rel !== "" && !rel.startsWith(".." + path.sep) && rel !== ".." && !path.isAbsolute(rel);
}

/** Fitted previews have their own output folder. Compare every original, not
 * only this slide's source, and refuse linked output paths before any mkdir. */
export function fitOutputPath(plateDir, requested, originals) {
  const logicalRoot = path.resolve(plateDir), logical = path.resolve(requested);
  if (!contained(path.join(logicalRoot, "fitted"), logical)) fail("fit output must be inside plates/fitted/", EXIT.USAGE);
  const root = fs.realpathSync(logicalRoot), dest = path.resolve(root, path.relative(logicalRoot, logical));
  const same = (a, b) => process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;
  let ancestor = dest;
  while (!fs.existsSync(ancestor)) ancestor = path.dirname(ancestor);
  if (!same(fs.realpathSync(ancestor), ancestor)) fail("fit output cannot follow a symbolic link", EXIT.USAGE);
  for (const source of originals) {
    const original = path.resolve(source), real = fs.existsSync(original) ? fs.realpathSync(original) : original;
    if (same(dest, original) || same(dest, real)) fail("fit cannot overwrite an original", EXIT.USAGE);
  }
  return dest;
}

function sourceFile(plateDir, relative) {
  const base = fs.realpathSync(plateDir), file = path.resolve(base, relative);
  if (!contained(base, file)) fail("source must stay inside plates/");
  let resolved;
  try { resolved = fs.realpathSync(file); } catch (e) { fail(`source not found: ${relative}`, e.code === "ENOENT" ? EXIT.NOINPUT : EXIT.DATA); }
  if (!contained(base, resolved) || !fs.statSync(resolved).isFile()) fail("source links must stay inside plates/");
  const bytes = fs.readFileSync(resolved), ext = path.extname(resolved).toLowerCase(), mime = ({ ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" })[ext];
  if (!mime) fail("source must be PNG, JPEG or WebP");
  return { file: resolved, bytes, sha256: hash(bytes), ref: `data:${mime};base64,` + bytes.toString("base64") };
}

function atomicFile(file, bytes, original = null) {
  const read = () => fs.existsSync(file) ? fs.readFileSync(file) : null;
  const same = () => original === null ? read() === null : read()?.equals(Buffer.from(original));
  let work;
  try {
    if (!same()) throw new LaneError("E_CONFLICT", "file changed while preparing plates: " + file, 75);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    work = fs.mkdtempSync(path.join(path.dirname(file), ".cs-plate-"));
    const tmp = path.join(work, "output"); fs.writeFileSync(tmp, bytes);
    if (!same()) throw new LaneError("E_CONFLICT", "file changed while preparing plates: " + file, 75);
    fs.renameSync(tmp, file);
  } catch (e) {
    if (e instanceof LaneError) throw e;
    throw new LaneError("E_WRITE", `cannot write ${file}: ${e.code}`, EXIT.NOWRITE);
  } finally { if (work) fs.rmSync(work, { recursive: true, force: true }); }
}

async function openPage(o, specFile, brandFile, work, log) {
  log("جاري تجهيز قياس إطارات الصور…");
  const studioFile = buildStudioPage({ specFile, brandFile, outFile: path.join(work, "studio.html") });
  const browser = await launchChromium({ chromium: o.chromium || process.env.CS_CHROME, headed: o.headed, channelFirst: true });
  let server, context;
  try {
    server = await serveDirectory(work);
    context = await browser.newContext({ viewport: { width: 1280, height: 1600 }, deviceScaleFactor: 1, serviceWorkers: "block" });
    // Install before navigation: nothing from this command reaches a remote host,
    // even if a supplied spec or page tries. Image bytes travel as data URIs.
    await context.route("**/*", route => {
      const u = new URL(route.request().url());
      return u.origin === server.url || ["data:", "blob:"].includes(u.protocol) ? route.continue() : route.abort();
    });
    const page = await context.newPage(); page.setDefaultTimeout(o.timeout);
    await page.goto(server.url + "/studio.html?automation=1", { waitUntil: "load", timeout: o.timeout });
    await page.waitForFunction(() => window.__csReady === true, null, { timeout: o.timeout });
    return { page, close: async () => { try { await context.close(); } finally { try { await browser.close(); } finally { await server.close(); } } } };
  } catch (e) {
    if (context) await context.close(); await browser.close(); if (server) await server.close(); throw e;
  }
}

function resultCode(findings) {
  return findings.some(f => f.severity === "BLOCK") ? EXIT.BLOCK : findings.length ? EXIT.FIX : EXIT.OK;
}

export async function runPlates(argv, { log = m => process.stderr.write(m + "\n") } = {}) {
  const o = parseArgs(argv);
  if (o.help) return { code: 0, help: USAGE };
  if (Number(process.versions.node.split(".")[0]) < 22) throw new LaneError("E_NO_CAPABILITY", "Node.js 22 or newer is required", EXIT.INTERNAL);
  process.env.PYTHONIOENCODING ||= "utf-8";
  const dir = path.resolve(o.dir || (o.spec ? path.dirname(path.resolve(o.spec)) : process.cwd()));
  const specFile = o.spec ? path.resolve(o.spec) : path.join(dir, "spec.json");
  if (path.dirname(specFile) !== dir) fail("--spec must be in the --dir post folder", EXIT.USAGE);
  const input = readPlanSource(specFile, "spec"), runtime = schemaRuntime(), cap = refCap(runtime.schema);
  let spec = input.value;
  const valid = runtime.validate(spec), errors = [...valid.errors, ...valid.structure];
  if (!valid.ok) {
    if (o.command !== "check") fail("spec does not match the schema: " + JSON.stringify(errors.slice(0, 4)));
    const findings = errors.map(e => ({ code: "schema", severity: "BLOCK", message: e.path + ": " + e.message }));
    findings.push(...plateFindings(spec, null, cap));
    return { code: 2, result: { ok: false, command: o.command, findings, framesMeasured: false } };
  }
  const brandFile = o.brand ? path.resolve(o.brand) : fs.existsSync(path.join(dir, "brand.json")) ? path.join(dir, "brand.json") : undefined;
  const brand = brandFile ? readPlanSource(brandFile, "brand").value : null;
  const plateDir = path.join(dir, "plates"), manifestFile = path.join(plateDir, "plates.json");
  const saved = o.command !== "slots" && fs.existsSync(manifestFile) ? readPlanSource(manifestFile, "plate manifest") : { value: { version: 1, plates: [] }, raw: null };
  const manifest = structuredClone(saved.value), slideIds = spec.slides.map(s => s.id);
  const initialProblems = validateManifest(manifest, slideIds);
  if (initialProblems.length) fail(initialProblems.join("; "));
  let records = [];
  if (["apply", "restyle"].includes(o.command)) {
    if (saved.raw === null) fail("plates/plates.json not found", EXIT.NOINPUT);
    records = manifest.plates;
  } else if (["fit", "embed"].includes(o.command)) {
    const old = manifest.plates?.find(r => r.slideId === o.slideId) || {};
    const r = { ...old, slideId: o.slideId };
    for (const k of ["source", "gravity", "focus", "flip", "promptId", "tool"]) if (o[k] !== undefined) r[k] = o[k];
    if (o.mode) { r.mode = o.mode; delete r.pad; }
    if (o.checkedAt) r.textCheck = { textChecked: true, at: o.checkedAt };
    if (o.layoutType || o.variant || o.slot) r.layout = { ...r.layout, ...(o.layoutType ? { type: o.layoutType } : {}), ...(o.variant ? { variant: o.variant } : {}), ...(o.slot ? { slot: o.slot } : {}) };
    // Fitting alone makes no asset or confirmation. Reuse the same validator for
    // its geometry and path, with private dummy provenance that is never saved.
    const check = o.command === "fit" ? { ...r, tool: r.tool || "fit-only", promptId: r.promptId || "fit-only", textCheck: { textChecked: true, at: "2000-01-01T00:00:00Z" } } : r;
    const problems = validateManifest({ version: 1, plates: [check] }, slideIds);
    if (problems.length) fail(problems.join("; "));
    records = [r];
    if (o.command === "embed") {
      const i = manifest.plates.findIndex(x => x.slideId === r.slideId);
      if (i < 0) manifest.plates.push(r); else manifest.plates[i] = r;
    }
  }
  if (o.command !== "fit") {
    const problems = validateManifest(manifest, slideIds);
    if (problems.length) fail(problems.join("; "));
  }
  const sources = new Map();
  for (const r of records) {
    if (!fs.existsSync(plateDir)) fail("plates/ folder not found", EXIT.NOINPUT);
    if (!contained(fs.realpathSync(dir), fs.realpathSync(plateDir))) fail("plates/ must be inside the post folder");
    const source = sourceFile(plateDir, r.source); sources.set(r.slideId, source);
    if (o.command !== "fit") {
      if (r.textCheck.sha256 && r.textCheck.sha256 !== source.sha256) fail(`${r.slideId}: original changed; inspect it and replace the textCheck record before applying`);
      r.textCheck.sha256 = source.sha256;
    }
  }
  // A valid private preview uses the proposed engine layout before measuring it.
  let planned = spec;
  try {
    for (const r of records) planned = attachPlate(planned, { ...r, textCheck: r.textCheck || {} }, { id: "plate-" + r.slideId, kind: "image", ref: PLACEHOLDER, mime: "image/png", width: 1, height: 1, aiGenerated: false });
  } catch (e) { fail(e.message); }
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "cs-plates-"));
  let session;
  try {
    const previewFile = path.join(work, "spec.json"); fs.writeFileSync(previewFile, JSON.stringify(planned) + "\n", "utf8");
    session = await openPage(o, previewFile, brandFile, work, log);
    const slides = await measureSlots(session.page, planned, brand);
    if (o.command === "slots") return { code: 0, result: { ok: true, command: o.command, presetId: spec.style.presetId, slides } };
    if (o.command === "check") {
      const findings = plateFindings(spec, slides, cap);
      return { code: resultCode(findings), result: { ok: !findings.length, command: o.command, findings, slides } };
    }
    const fitted = [];
    for (const r of records) {
      const frame = slides.find(f => f.slideId === r.slideId);
      if (!frame?.supported) fail(`${r.slideId}: ${frame?.reason || "no picture frame"}`);
      if (frame.requestedVariant && frame.requestedVariant !== frame.variant) log(`الشريحة ${r.slideId.slice(1)} تستخدم البديل ${frame.variant} في النمط الحالي بدلا من ${frame.requestedVariant}.`);
      log(`جاري تجهيز صورة الشريحة ${r.slideId.slice(1)}…`);
      let image;
      try { image = await fitImage(session.page, sources.get(r.slideId).ref, frame, r, { cap, png: o.command === "fit" }); }
      catch (e) {
        if (/EncodingError|canvas size limit/.test(e.message)) throw new LaneError("E_SCHEMA", `${r.slideId}: ${e.message}`, EXIT.DATA);
        throw e;
      }
      if (o.command === "fit") {
        const requested = o.out ? path.resolve(dir, o.out) : path.join(plateDir, "fitted", r.slideId + ".png");
        const dest = fitOutputPath(plateDir, requested, [...manifest.plates.map(x => path.resolve(plateDir, x.source)), sources.get(r.slideId).file]);
        atomicFile(dest, Buffer.from(image.ref.split(",")[1], "base64"), fs.existsSync(dest) ? fs.readFileSync(dest) : null);
        fitted.push({ slideId: r.slideId, out: dest, width: image.width, height: image.height, mode: image.geometry.mode, ratio: frame.ratio, variant: frame.variant, requestedVariant: frame.requestedVariant });
      } else {
        spec = attachPlate(spec, r, makeAsset(r, image, cap));
        fitted.push({ slideId: r.slideId, assetId: "plate-" + r.slideId, width: image.width, height: image.height, bytes: image.bytes, mode: image.geometry.mode, ratio: frame.ratio, variant: frame.variant, requestedVariant: frame.requestedVariant });
      }
    }
    if (o.command === "fit") return { code: 0, result: { ok: true, command: o.command, pictures: fitted } };
    const findings = plateFindings(spec, slides, cap).filter(f => records.some(r => r.slideId === f.slideId));
    if (findings.length) fail("prepared pictures failed checks: " + JSON.stringify(findings));
    const changed = !isDeepStrictEqual(spec, input.value);
    if (changed) {
      delete spec.frozen;
      if (["ready", "exported"].includes(spec.checkpoint)) spec.checkpoint = "design";
      spec.rev++;
      spec.meta = { ...spec.meta, updatedAt: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"), updatedBy: "tool" };
    }
    const outputValid = runtime.validate(spec);
    if (!outputValid.ok) fail("prepared spec does not match the schema: " + JSON.stringify([...outputValid.errors, ...outputValid.structure].slice(0, 4)));
    for (const source of sources.values()) if (hash(fs.readFileSync(source.file)) !== source.sha256) throw new LaneError("E_CONFLICT", "original changed while preparing plates", 75);
    if (fs.readFileSync(specFile, "utf8") !== input.raw) throw new LaneError("E_CONFLICT", "spec changed while preparing plates", 75);
    if ((fs.existsSync(manifestFile) ? fs.readFileSync(manifestFile, "utf8") : null) !== saved.raw) throw new LaneError("E_CONFLICT", "manifest changed while preparing plates", 75);
    if (!isDeepStrictEqual(manifest, saved.value)) atomicFile(manifestFile, JSON.stringify(manifest, null, 2) + "\n", saved.raw);
    // The durable record is written first; a failed spec save can be replayed.
    // Each file is atomically replaced, and the spec is never partially written.
    savePlanSpec(specFile, spec, input.raw);
    return { code: 0, result: { ok: true, command: o.command, changed, pictures: fitted, spec: specFile, manifest: manifestFile } };
  } finally { try { if (session) await session.close(); } finally { fs.rmSync(work, { recursive: true, force: true }); } }
}

function textResult(r) {
  if (r.slides && r.command === "slots") return r.slides.map(s => s.supported ? `${s.slideId} ${s.type}/${s.variant} ${s.frame.width.toFixed(1)} × ${s.frame.height.toFixed(1)} px · ${s.ratio.toFixed(4)}:1 · subject band 55%` : `${s.slideId}: ${s.reason} → ${s.suggestion.type}/${s.suggestion.variant}`).join("\n");
  if (r.findings) return r.findings.length ? r.findings.map(f => `${f.severity} ${f.slideId || "spec"} ${f.code}: ${f.message}`).join("\n") : "الصور مطابقة للإطارات، وسجلات الفحص مكتملة.";
  return (r.pictures || []).map(p => `${p.slideId}: ${p.width} × ${p.height} · ${p.mode} · ${p.out || p.assetId}`).join("\n") || "لا توجد صور في السجل.";
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const argv = process.argv.slice(2);
  const text = argv.indexOf("--format") >= 0 && argv[argv.indexOf("--format") + 1] === "text";
  runPlates(argv).then(({ code, result, help }) => { process.stdout.write(help ? help + "\n" : (text ? textResult(result) : JSON.stringify(result)) + "\n"); process.exitCode = code; }).catch(e => {
    const code = e.exit || (e.code === "ENOENT" ? EXIT.NOINPUT : EXIT.INTERNAL);
    process.stderr.write(`cs-error: ${e.code || "E_INTERNAL"}: ${e.message}\n`);
    if (!text) process.stdout.write(JSON.stringify({ ok: false, error: { code: e.code || "E_INTERNAL", message: e.message } }) + "\n");
    process.exitCode = code;
  });
}
