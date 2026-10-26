#!/usr/bin/env node
// tests/privacy/run.mjs · nothing about the person who is looking at the Studio ends up in a spec, a kit or a published page (draft 13.4).
//
//   node tests/privacy/run.mjs [--headed]
//
// The Studio runs inside a viewer that knows who is looking. The mock capability host (tests/mobile-e2e/mock-claude.js, flag "identity") gives
// the viewer a name, an e-mail and an id, and logs every read of the "user" namespace. The test then
//   1. edits a slide, saves (publishes) the page and exports the whole kit,
//   2. fails when the name, the e-mail or the id appears anywhere: the spec, the brand, the serialized source, the published document, every file
//      of the kit (the ZIP is stored uncompressed, so its bytes are searched too) or the page's own DOM,
//   3. fails when the page reads anything from the "user" namespace except the yes/no questions isOwner, canEdit and can,
//   4. fails when the page makes a network request to anything but the local test server (and data:/blob: URLs).
// Exit code 0 = pass, 1 = leak, 0 with a SKIP line when Playwright is missing.
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const mobile = path.resolve(here, "../mobile-e2e");
const headed = process.argv.includes("--headed");

let chromium;
try { ({ chromium } = await import("playwright-core")); }
catch {
  try { ({ chromium } = await import("playwright")); }
  catch { console.log("SKIP: playwright is not installed (npm i -D playwright-core)"); process.exit(0); }
}

const out = fs.mkdtempSync(path.join(os.tmpdir(), "cs-privacy-"));
const built = spawnSync(process.platform === "win32" ? "python" : "python3", [path.join(mobile, "build_fixture.py"), "--out", out, "--real-engine"], { encoding: "utf8" });
if (built.status !== 0) { console.error(built.stderr || built.stdout); process.exit(1); }
const server = http.createServer((req, res) => {
  const file = path.join(out, decodeURIComponent(new URL(req.url, "http://x").pathname).replace(/^\/+/, ""));
  if (!file.startsWith(out) || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const origin = `http://127.0.0.1:${server.address().port}`;

const { findInstalledChromium } = await import(pathToFileURL(path.resolve(mobile, "../../plugins/carousel-studio/skills/carousel-design/scripts/cover_video.mjs")).href);
const installed = findInstalledChromium();
const browser = await chromium.launch({ headless: !headed, ...(installed ? { executablePath: installed } : {}) });

const problems = [];
const fail = (msg) => { problems.push(msg); console.log("FAIL " + msg); };
const outside = [];
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 }, locale: "ar" });
  await context.addInitScript({ path: path.join(mobile, "mock-claude.js") });
  const page = await context.newPage();
  page.on("request", (r) => { const u = r.url(); if (!u.startsWith(origin) && !/^(data|blob|about):/.test(u)) outside.push(u); });
  await page.goto(`${origin}/studio.html?mock=identity&automation=1`);
  await page.evaluate(() => sessionStorage.clear());
  await page.goto(`${origin}/studio.html?mock=identity&automation=1`);
  await page.waitForFunction(() => window.__csReady === true);

  // a normal session: edit, save (publish), export the kit
  await page.click('.ui-nav-btn[data-screen="design"]');
  await page.waitForSelector('.ui-big [data-edit="text"]');
  const kicker = page.locator('.ui-big [data-field="kicker"]').first();
  await kicker.click(); await page.keyboard.press("Control+A"); await page.keyboard.type("محفوظ"); await page.keyboard.press("Enter");
  await page.waitForTimeout(400);
  await page.click('[data-cs-action="save"]');
  await page.waitForTimeout(800);
  const kit = await page.evaluate(async () => {
    const res = await CS.automation.exportAll({ video: false, zip: true });
    const files = {};
    window.__csFiles.forEach((bytes, p) => { files[p] = Array.from(bytes, (b) => String.fromCharCode(b)).join(""); });  // one char per byte: ASCII and UTF-8 text are searchable
    return { files };
  });
  if (Object.keys(kit.files).length < 5) fail(`the kit export did not produce files (${Object.keys(kit.files).length})`);

  const surfaces = await page.evaluate(() => ({
    viewer: window.__viewer,
    spec: JSON.stringify(CS.ui.current.getSpec()),
    source: CS.ui.serializeSource ? CS.ui.serializeSource({}) : "",
    published: window.__lastPublished || "",
    dom: document.documentElement.outerHTML,
    log: window.__mockLog.map((x) => x.cap)
  }));
  if (!surfaces.published) fail("the page was not published, so the published document could not be checked");
  const secrets = Object.values(surfaces.viewer || {});
  if (secrets.length !== 3) fail("the mock viewer has no identity to look for");
  const utf8AsBytes = (s) => Array.from(new TextEncoder().encode(s), (b) => String.fromCharCode(b)).join("");
  const look = (where, text) => { for (const s of secrets) if (text.includes(s) || text.includes(utf8AsBytes(s))) fail(`"${s}" appears in ${where}`); };
  look("the spec", surfaces.spec);
  look("the serialized source", surfaces.source);
  look("the published document", surfaces.published);
  look("the page's DOM", surfaces.dom);
  for (const [file, text] of Object.entries(kit.files)) look("kit file " + file, text);

  // the brand file the Brand Home would save
  await page.goto(`${origin}/brand-home.html?mock=identity`);
  await page.waitForFunction(() => window.__csReady === true);
  const brand = await page.evaluate(() => ({ json: JSON.stringify(CS.ui.currentHome.getBrand()), dom: document.documentElement.outerHTML, viewer: window.__viewer }));
  for (const s of Object.values(brand.viewer || {})) {
    if (brand.json.includes(s)) fail(`"${s}" appears in the brand`);
    if (brand.dom.includes(s)) fail(`"${s}" appears in Brand Home`);
  }

  // what the page asked the viewer
  const allowed = new Set(["isOwner", "canEdit", "can", "then"]);
  const reads = [...new Set([...surfaces.log, ...(await page.evaluate(() => window.__mockLog.map((x) => x.cap)))].filter((c) => c.startsWith("user.")).map((c) => c.slice(5)))];
  const extra = reads.filter((r) => !allowed.has(r));
  if (extra.length) fail("the page read from the user namespace: " + extra.join(", "));
  if (outside.length) fail("network requests outside the test server: " + outside.slice(0, 3).join(", "));
  await context.close();
} catch (e) {
  fail("the test could not run: " + e.message);
} finally {
  await browser.close();
  server.close();
  fs.rmSync(out, { recursive: true, force: true });
}
if (problems.length) { console.error(`\n${problems.length} privacy problem(s)`); process.exit(1); }
console.log("ok   no name, e-mail or id of the viewer in the spec, brand, source, published page or kit; the page asks only isOwner, canEdit and can; no outside requests");
