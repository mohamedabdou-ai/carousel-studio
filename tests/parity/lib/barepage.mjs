// tests/parity/lib/barepage.mjs · run a browser test file on its own, with nothing but privately built chunks (round 3, package F1).
//
// The browser tests of tests/unit/js/{paint,export} are modules for the runner of tests/video (node tests/video/run.mjs: the harness page with
// a stub core and fixtures). A test that needs only cs-paint and cs-export can also run by itself, which is what `node --test` does with the
// paint tests: this file supplies the page and the `t` object that the runner would have supplied.
//
//   if (isMain(import.meta.url)) await runAsNodeTests(mod, { modules: ["paint"] });      // at the bottom of a *.test.mjs
//
//   - the chunks are built privately (node tools/build.mjs --module <m> --out <tmp>), or taken from $CS_RUNTIME when it names a folder of
//     cs-*.js files; nothing under runtime/ is read or written;
//   - the page is a blank document served from the loopback address, with the chunks added as scripts (so CS.paint, CS.export exist); with
//     CS_HARNESS=1 (or { harness: true }) it is instead the harness page of tests/video, built from the same private chunks (stub core,
//     fixtures, test fonts), for the tests that need CS_FIXTURES; the modules then are paint, motion, hf, mp4 and export;
//   - `t` has the runner's assertions (ok, eq, near, gte, lte, fail, skip) and `t.page`; a test with `needsPage: false` gets no browser.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import { launchChromium, serveDirectory } from "../../../plugins/carousel-studio/skills/carousel-design/scripts/cover_video.mjs";
import { REPO, tempDir } from "./studio.mjs";

export function isMain(metaUrl) { return !!process.argv[1] && metaUrl === pathToFileURL(path.resolve(process.argv[1])).href; }

/** The runner's `t` helpers, over node:assert. */
export function assertions() {
  const j = (x) => JSON.stringify(x);
  return {
    ok: (cond, msg) => assert.ok(cond, msg || "expected a truthy value"),
    eq: (a, b, msg) => assert.equal(j(a), j(b), `${msg || "values differ"}: got ${j(a)}, expected ${j(b)}`),
    near: (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || "values differ"}: got ${a}, expected ${b} +- ${tol}`),
    gte: (a, b, msg) => assert.ok(a >= b, `${msg || "too small"}: got ${a}, expected >= ${b}`),
    lte: (a, b, msg) => assert.ok(a <= b, `${msg || "too large"}: got ${a}, expected <= ${b}`),
    fail: (msg) => assert.fail(msg),
    skip: (why) => { throw Object.assign(new Error(why), { skip: true }); }
  };
}

/** A page holding the chunks of `modules` ("paint", "export", "mp4", ...): blank, or the tests/video harness. Resolves to { page, errors, close, chunkDir }. */
export async function openBare({ modules = ["paint"], runtime = process.env.CS_RUNTIME || null, harness = process.env.CS_HARNESS === "1" } = {}) {
  const work = tempDir("cs-bare-");
  const mods = harness ? ["paint", "motion", "hf", "mp4", "export"] : modules;
  let chunkDir = runtime, built = false;
  if (!chunkDir) {
    chunkDir = path.join(work, "chunks");
    execFileSync(process.execPath, [path.join(REPO, "tools/build.mjs"), ...mods.flatMap((m) => ["--module", m]), "--out", chunkDir], { stdio: "pipe" });
    built = true;
  }
  for (const m of mods) if (!fs.existsSync(path.join(chunkDir, `cs-${m}.js`))) throw new Error(`no chunk ${path.join(chunkDir, `cs-${m}.js`)}${built ? "" : " (from $CS_RUNTIME)"}`);
  if (harness) execFileSync(process.execPath, [path.join(REPO, "tests/video/harness/build-harness.mjs"), "--runtime", chunkDir, "--out", work], { stdio: "pipe" });
  else fs.writeFileSync(path.join(work, "harness.html"), '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>bare</title></head><body style="margin:0"></body></html>');
  const server = await serveDirectory(work), browser = await launchChromium({});
  const context = await browser.newContext({ viewport: { width: 1200, height: 1600 }, deviceScaleFactor: 1 }), page = await context.newPage(), errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/favicon|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  const close = async () => { await context.close().catch(() => {}); await browser.close().catch(() => {}); await server.close().catch(() => {}); try { fs.rmSync(work, { recursive: true, force: true }); } catch { /* temp files */ } };
  try {
    await page.goto(server.url + "/harness.html");
    if (harness) await page.waitForFunction(() => window.__csReady === true, null, { timeout: 30000 });
    else for (const m of mods) await page.addScriptTag({ content: fs.readFileSync(path.join(chunkDir, `cs-${m}.js`), "utf8") });
  } catch (e) { await close(); throw e; }
  return { page, errors, chunkDir, close };
}

/** Registers every test of `mod` with node:test, over one shared bare page. */
export async function runAsNodeTests(mod, { modules = ["paint"] } = {}) {
  const { test, after } = await import("node:test");
  let bare = null;
  const need = async () => bare || (bare = await openBare({ modules }));
  after(async () => { if (bare) await bare.close(); });
  for (const tc of mod.tests) {
    test(tc.name, async (ctx) => {
      const t = assertions();
      if (tc.needsPage !== false) { const b = await need(); t.page = b.page; t.logs = b.errors; }
      try { await tc.run(t); } catch (e) { if (e && e.skip) { ctx.skip(e.message); return; } throw e; }
    });
  }
}
