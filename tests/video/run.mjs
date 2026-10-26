#!/usr/bin/env node
// Browser test runner for the paint / motion / hf / mp4 / export modules (package B3).
//
//   node tests/video/run.mjs [--runtime DIR] [--filter TEXT] [--chromium PATH] [--headed] [--list]
//
// It assembles the harness page (the runtime chunks, a test double for CS.core, fonts, fixtures, the real cover.hf.html template),
// serves it over loopback, opens it in Chromium and runs every `*.test.mjs` under tests/unit/js/{paint,motion,hf,mp4,export},
// tests/parity and tests/video. A test file exports `{ module, tests: [{ name, run(t) }] }`; `t` offers `page`, `open(name)`,
// `assert`-style helpers and `screenshot`. Playwright must be resolvable (see cover_video.mjs: cwd, CS_PLAYWRIGHT_PATH or global).
// Exit 0 when everything passes, 1 otherwise.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { launchChromium, serveDirectory } from "../../plugins/carousel-studio/skills/carousel-design/scripts/cover_video.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../..");
const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf("--" + name); return i >= 0 ? args[i + 1] : fallback; };
const runtimeDir = path.resolve(opt("runtime", path.join(repo, "plugins/carousel-studio/skills/carousel-design/runtime")));
const filter = opt("filter", "");

const SUITES = ["tests/unit/js/hf", "tests/unit/js/motion", "tests/unit/js/paint", "tests/unit/js/mp4", "tests/unit/js/export", "tests/parity", "tests/video"];

function discover() {
  const files = [];
  for (const d of SUITES) {
    const dir = path.join(repo, d);
    if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir).sort()) if (f.endsWith(".test.mjs") && /export default/.test(fs.readFileSync(path.join(dir, f), "utf8"))) files.push(path.join(dir, f)); // standalone scripts (no default export, e.g. tests/parity/art-matrix.test.mjs) run on their own
  }
  return files;
}

class Failure extends Error {}

function helpers() {
  const fail = (msg) => { throw new Failure(msg); };
  return {
    ok: (cond, msg) => { if (!cond) fail(msg || "expected a truthy value"); },
    eq: (a, b, msg) => { const x = JSON.stringify(a), y = JSON.stringify(b); if (x !== y) fail(`${msg || "values differ"}: got ${x}, expected ${y}`); },
    near: (a, b, tol, msg) => { if (!(Math.abs(a - b) <= tol)) fail(`${msg || "values differ"}: got ${a}, expected ${b} ± ${tol}`); },
    gte: (a, b, msg) => { if (!(a >= b)) fail(`${msg || "too small"}: got ${a}, expected >= ${b}`); },
    lte: (a, b, msg) => { if (!(a <= b)) fail(`${msg || "too large"}: got ${a}, expected <= ${b}`); },
    fail
  };
}

async function main() {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "cs-b3-tests-"));
  execFileSync(process.execPath, [path.join(here, "harness/make-specs.mjs")], { stdio: "ignore" });
  execFileSync(process.execPath, [path.join(here, "harness/build-harness.mjs"), "--runtime", runtimeDir, "--out", work], { stdio: "inherit" });
  for (const name of ["mistakes", "counter"]) {
    execFileSync(process.execPath, [path.join(here, "harness/build-harness.mjs"), "--runtime", runtimeDir, "--out", work, "--spec", path.join(here, `harness/specs/${name}.spec.json`), "--name", `studio-${name}.html`], { stdio: "ignore" });
  }
  const server = await serveDirectory(work);
  const browser = await launchChromium({ chromium: opt("chromium"), headed: args.includes("--headed"), channelFirst: true });
  const files = discover();
  let passed = 0, failed = 0, skipped = 0, n = 0;
  console.log(`TAP version 13\n# ${files.length} test files · runtime ${path.relative(repo, runtimeDir)}`);
  for (const file of files) {
    const mod = (await import(pathToFileURL(file).href)).default;
    const label = mod.module || path.basename(file);
    for (const test of mod.tests) {
      if (filter && !(label + " " + test.name).includes(filter)) continue;
      if (args.includes("--list")) { console.log(`# ${label}: ${test.name}`); continue; }
      n++;
      const context = await browser.newContext({ viewport: { width: 1200, height: 1600 }, deviceScaleFactor: 1, acceptDownloads: true });
      const t = { ...helpers(), skip: (why) => { throw Object.assign(new Error(why), { skip: true }); } };
      t.logs = [];
      t.open = async (name = "harness.html", query = "") => {
        const page = await context.newPage();
        page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|favicon/.test(m.text())) t.logs.push(m.text()); });
        page.on("pageerror", (e) => t.logs.push("pageerror: " + e.message));
        await page.goto(`${server.url}/${name}${query}`);
        await page.waitForFunction(() => window.__csReady === true, null, { timeout: 30000 });
        return page;
      };
      const started = Date.now();
      try {
        t.page = await t.open();
        await test.run(t);
        passed++;
        console.log(`ok ${n} - ${label}: ${test.name} (${Date.now() - started} ms)`);
      } catch (e) {
        if (e && e.skip) { skipped++; console.log(`ok ${n} - ${label}: ${test.name} # SKIP ${e.message}`); }
        else { failed++; console.log(`not ok ${n} - ${label}: ${test.name}\n  ---\n  message: ${String(e && e.message).split("\n")[0]}\n  ${t.logs.length ? "page: " + t.logs.slice(0, 3).join(" | ") : ""}\n  ...`); if (!(e instanceof Failure) && e && e.stack) console.log(e.stack.split("\n").slice(1, 4).join("\n")); }
      } finally { await context.close(); }
    }
  }
  await browser.close(); await server.close();
  fs.rmSync(work, { recursive: true, force: true });
  console.log(`1..${n}\n# pass ${passed}  fail ${failed}  skip ${skipped}`);
  return failed ? 1 : 0;
}

main().then((c) => { process.exitCode = c; }, (e) => { console.error(e); process.exitCode = 1; });
