// Browser smoke test of the Studio and Brand Home (stub engine). Needs Playwright (`npm i -D playwright && npx playwright install chromium`).
// Run: node tests/mobile-e2e/studio-smoke.mjs [--headed] [--real-engine]   (--real-engine runs the same flows on the shipped engine chunks)
//
// It builds the fixture pages (tests/mobile-e2e/build_fixture.py), serves them on 127.0.0.1 and walks the flows a user takes: edit a word in place,
// undo, restyle, switch digits, regenerate a slide, save (publish and patch fallback), restore after a reload, run the checks, export the kit,
// open Brand Home. Every step must finish without a console error. Exit code 0 = pass, 1 = fail, 0 with a SKIP line when Playwright is missing.
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const headed = process.argv.includes("--headed");

let chromium;
try { ({ chromium } = await import("playwright-core")); }
catch {
  try { ({ chromium } = await import("playwright")); }
  catch { console.log("SKIP: playwright is not installed (npm i -D playwright-core; a Chromium from an earlier Playwright install is reused)"); process.exit(0); }
}
const realEngine = process.argv.includes("--real-engine");

const out = fs.mkdtempSync(path.join(os.tmpdir(), "cs-e2e-"));
const built = spawnSync(process.platform === "win32" ? "python" : "python3", [path.join(here, "build_fixture.py"), "--out", out, ...(realEngine ? ["--real-engine"] : [])], { encoding: "utf8" });
if (built.status !== 0) { console.error(built.stderr || built.stdout); process.exit(1); }

const server = http.createServer((req, res) => {
  if (new URL(req.url, "http://x").pathname === "/favicon.ico") { res.writeHead(204); res.end(); return; }
  const file = path.join(out, decodeURIComponent(new URL(req.url, "http://x").pathname).replace(/^\/+/, ""));
  if (!file.startsWith(out) || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;

const { findInstalledChromium } = await import(pathToFileURL(path.resolve(here, "../../plugins/carousel-studio/skills/carousel-design/scripts/cover_video.mjs")).href);
const installed = findInstalledChromium();
const browser = await chromium.launch({ headless: !headed, ...(installed ? { executablePath: installed } : {}) });
let failed = 0;
const errors = [];

async function scenario(name, viewport, fn) {
  const context = await browser.newContext({ viewport, hasTouch: viewport.width < 600, locale: "ar" });
  if (realEngine) await context.addInitScript({ path: path.join(here, "mock-claude.js") });   // the stub engine carries this block itself
  const page = await context.newPage();
  const seen = [];
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") seen.push(m.text()); });
  page.on("pageerror", (e) => seen.push("pageerror: " + e.message));
  try {
    await fn(page, context);
    if (seen.length) throw new Error("console output: " + seen.join(" | "));
    console.log("ok   " + name);
  } catch (e) {
    failed++;
    errors.push(name + ": " + e.message);
    console.log("FAIL " + name + "\n     " + String(e.message).split("\n")[0]);
  } finally { await context.close(); }
}

const ready = (page, url) => page.goto(base + url).then(() => page.evaluate(() => sessionStorage.clear())).then(() => page.goto(base + url)).then(() => page.waitForFunction(() => window.__csReady === true));
const spec = (page) => page.evaluate(() => CS.ui.current.getSpec());
const eq = (a, b, what) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${what}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };

for (const [label, viewport] of [["phone", { width: 390, height: 844 }], ["desktop", { width: 1280, height: 860 }]]) {
  await scenario(`${label}: every screen opens without errors`, viewport, async (page) => {
    await ready(page, "/studio.html?mock=");
    for (const id of ["script", "design", "preview", "motion", "copy", "check", "export", "about"]) {
      await page.evaluate((s) => CS.ui.current._ctx.go(s), id);
      await page.waitForSelector(`section[data-cs-screen="${id}"]:not([hidden])`);
      await page.waitForTimeout(250);
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (overflow > 1) throw new Error("horizontal page scroll of " + overflow + "px");
  });
}

await scenario("edit in place, undo, restyle, digits, regenerate", { width: 1280, height: 860 }, async (page) => {
  await ready(page, "/studio.html?mock=");
  await page.click('.ui-nav-btn[data-screen="design"]');
  await page.waitForSelector('.ui-big [data-edit="text"]');
  const kicker = page.locator('.ui-big [data-field="kicker"]').first();
  await kicker.click(); await page.keyboard.press("Control+A"); await page.keyboard.type("جديد"); await page.keyboard.press("Enter");
  await page.waitForTimeout(500);
  eq((await spec(page)).slides[0].kicker, "جديد", "kicker");
  await page.click(".ui-top-actions .ui-btn--icon >> nth=0");
  await page.waitForTimeout(300);
  eq((await spec(page)).slides[0].kicker, "للمبتدئين", "after undo");
  await page.click('.ui-preset[data-preset="poster"]');
  await page.waitForTimeout(700);
  eq((await spec(page)).style.presetId, "poster@1.0", "preset");
  await page.click('[data-cs-tab="text"]');
  await page.click('.ui-radio[data-value="arabic-indic"]');
  await page.waitForTimeout(600);
  eq((await page.locator(".ui-big .cs-counter").innerText()).replace(/ /g, " "), "١ من ٨", "counter digits");
  await page.click('[data-cs-tab="slide"]');
  await page.click('[data-cs-action="regenerate"][data-mode="shorter"]');
  await page.waitForSelector(".ui-variant");
  eq(await page.locator(".ui-variant").count(), 3, "variants");
});

if (realEngine) await scenario("Style tab: three font pairings on the cover line; a pick overrides all four type families, reset restores the preset's own", { width: 1280, height: 860 }, async (page) => {
  await ready(page, "/studio.html?mock=");
  await page.click('.ui-nav-btn[data-screen="design"]');
  await page.waitForSelector(".ui-fontpair");
  const n = await page.locator(".ui-fontpair").count();
  if (n < 2 || n > 3) throw new Error("expected two or three pairings, found " + n);
  eq(await page.locator('.ui-fontpair[aria-pressed="true"]').count(), 1, "one pairing is current");
  await page.click(".ui-fontpair >> nth=1");
  await page.waitForTimeout(700);
  const ov = (await spec(page)).style.overrides || {};
  eq(["type.display.family", "type.heading.family", "type.body.family", "type.latin.family"].every((k) => typeof ov[k] === "string"), true, "all four families are set");
  eq(ov["type.display.family"], ov["type.heading.family"], "heading follows display");
  eq(await page.locator('.ui-fontpair[aria-pressed="true"]').getAttribute("data-display"), ov["type.display.family"], "the picked pairing is marked");
  await page.click(".ui-fontpair >> nth=0");
  await page.waitForTimeout(700);
  eq(Object.keys((await spec(page)).style.overrides || {}).filter((k) => k.indexOf("type.") === 0).length, 0, "the preset's own pairing clears the overrides");
});

await scenario("save publishes a document that boots again; patch fallback copies an envelope", { width: 1280, height: 860 }, async (page, context) => {
  await ready(page, "/studio.html?mock=");
  await page.click('.ui-nav-btn[data-screen="design"]');
  await page.waitForSelector('.ui-big [data-edit="text"]');
  const kicker = page.locator('.ui-big [data-field="kicker"]').first();
  await kicker.click(); await page.keyboard.press("Control+A"); await page.keyboard.type("محفوظ"); await page.keyboard.press("Enter");
  await page.waitForTimeout(400);
  await page.click('[data-cs-action="save"]');
  await page.waitForTimeout(800);
  const html = await page.evaluate(() => window.__lastPublished);
  if (!html || !html.startsWith("<!doctype html><html><head><meta charset=utf8>")) throw new Error("published document does not use the Artifact skeleton");
  const second = await context.newPage();
  await second.setContent(html);
  await second.waitForFunction(() => window.__csReady === true, null, { timeout: 15000 });
  eq(await second.evaluate(() => [CS.ui.current.getSpec().rev, CS.ui.current.getSpec().slides[0].kicker]), [2, "محفوظ"], "republished page");
  await second.close();
  await ready(page, "/studio.html?mock=noPublish");
  const text = await page.evaluate(() => CS.ui.current.copyPatch());
  const envelope = JSON.parse(text);
  eq([envelope.carouselStudioPatch, envelope.baseRev], [1, 1], "envelope header");
});

await scenario("checks, override and kit export", { width: 1280, height: 860 }, async (page) => {
  await ready(page, "/studio.html?mock=");
  await page.evaluate(() => CS.ui.current._ctx.setField("s01", "headline", "سبع كلمات قصيرة في عنوان الغلاف هنا", undefined, {}));
  await page.click('.ui-nav-btn[data-screen="export"]');
  await page.waitForTimeout(1500);
  await page.click('[data-cs-action="export-kit"]');
  await page.fill(".ui-dialog input", "مقصود");
  await page.click(".ui-dialog-actions .ui-btn--danger");
  await page.waitForSelector(".ui-result", { timeout: realEngine ? 600000 : 20000 });   // the real exporter encodes two MP4 covers
  const saved = await page.evaluate(() => window.__mockLog.filter((x) => x.cap === "downloads.save").map((x) => x.filename));
  eq(saved, ["post-20261022-0001-kit.zip"], "saved files");
  eq(await page.evaluate(() => CS.ui.current.getSpec().checkpoint), "exported", "checkpoint");
});

await scenario("an AI image blocks the kit until the person confirms it has no letters; a replaced image must be confirmed again", { width: 1280, height: 860 }, async (page) => {
  await ready(page, "/studio.html?mock=noAssets");   // small images are embedded as data URIs
  const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  await page.click('.ui-nav-btn[data-screen="design"]');
  await page.click('[data-cs-tab="visual"]');
  await page.selectOption(".ui-panel select", "plate");
  await page.locator(".ui-panel .ui-switch").first().click();   // «this image is AI-generated» before the upload: the file arrives flagged
  await page.setInputFiles(".ui-file", { name: "plate.png", mimeType: "image/png", buffer: PNG });
  await page.waitForSelector("[data-cs-text-check]");
  let s = await spec(page);
  eq([s.assets.length, s.assets[0].aiGenerated, s.slides[0].media.ai], [1, true, true], "the upload arrives flagged as AI");
  eq(s.ext && s.ext.assetChecks, undefined, "not confirmed yet");
  if (realEngine) {
    const blocked = await page.evaluate(async () => (await CS.ui.current._ctx.runQa()).results.some((r) => r.rule === "A1.text-check"));
    eq(blocked, true, "A1.text-check blocks");
  }
  await page.locator("[data-cs-text-check] .ui-switch").click();
  await page.waitForTimeout(300);
  s = await spec(page);
  const id = s.assets[0].id;
  eq(s.ext.assetChecks[id].textChecked, true, "the confirmation is recorded for that asset");
  if (realEngine) {
    const still = await page.evaluate(async () => (await CS.ui.current._ctx.runQa()).results.some((r) => r.rule === "A1.text-check"));
    eq(still, false, "A1.text-check is answered by the person's own confirmation");
  }
  await page.setInputFiles(".ui-file", { name: "plate2.png", mimeType: "image/png", buffer: PNG });   // replace the image
  await page.waitForTimeout(500);
  s = await spec(page);
  eq([s.assets.length >= 2, s.ext && s.ext.assetChecks && s.ext.assetChecks[id]], [true, undefined], "the old record is gone with the old image");
  eq(await page.locator("[data-cs-text-check] .ui-switch-in").isChecked(), false, "the new image has to be confirmed again");
});

await scenario("viewer without publish, sample or downloads degrades cleanly", { width: 390, height: 844 }, async (page) => {
  await ready(page, "/studio.html?mock=viewer,noPublish,noDownloads,noSample");
  await page.click('.ui-nav-btn[data-screen="design"]');
  await page.click('[data-cs-tab="slide"]');
  await page.waitForTimeout(400);
  eq(await page.locator('[data-cs-action="regenerate"]').count(), 0, "regenerate chips");
  eq(await page.locator(".ui-copyline").count(), 1, "chat line");
});

await scenario("English interface mirrors the layout", { width: 1280, height: 860 }, async (page) => {
  await ready(page, "/studio-en.html?mock=");
  eq(await page.evaluate(() => [document.documentElement.dir, document.documentElement.lang]), ["ltr", "en"], "root direction");
});

await scenario("Brand Home: book, font pick, approve", { width: 390, height: 844 }, async (page) => {
  await ready(page, "/brand-home.html?mock=");
  await page.waitForSelector(".bb-sec");
  await page.click(".bb-fontbtn >> nth=1");
  await page.click('[data-cs-action="approve-brand"]');
  await page.click(".ui-dialog-actions .ui-btn--primary");
  await page.waitForTimeout(600);
  eq(await page.evaluate(() => CS.ui.currentHome.getBrand().version), 2, "brand version");
  for (const tab of ["plan", "ideas", "posts"]) { await page.click(`[data-cs-tab="${tab}"]`); await page.waitForTimeout(150); }
  // the creative team's memory: empty first, then two posts that share a hook family and a move (the team rests both)
  await page.click('[data-cs-tab="team"]');
  eq(await page.evaluate(() => document.querySelectorAll("[data-cs-memory]").length), 0, "no memory yet");
  await page.evaluate(() => {
    const brand = CS.ui.currentHome.getBrand();
    CS.ui.currentHome.setBrand(Object.assign({}, brand, { creativeMemory: [
      { postId: "post-0001a", date: "2026-10-20", idea: "الغلط مش في البرومبت", hook: "بطّل تكتب برومبتات", family: "P4", move: "enemy", pitch: "bold", preset: "swiss", motion: "stamp", intent: "reach", cta: "save", panel: { stops: 2, depth: 10, slides: 10 }, verdict: "ship", series: "البرومبت", loved: "الرقم الكبير" },
      { postId: "post-0002b", date: "2026-10-21", idea: "5 أدوات ببلاش", family: "P4", move: "enemy", preset: "creator", motion: "counter", intent: "save", cta: "question", verdict: "ship", rejected: "الفيديو الطويل" }
    ] }));
    CS.ui.currentHome.setTab("team");
  });
  eq(await page.evaluate(() => document.querySelectorAll("[data-cs-memory]").length), 2, "two memory cards");
  eq(await page.evaluate(() => document.querySelector("[data-cs-memory]").getAttribute("data-cs-memory")), "post-0002b", "newest first");
  eq(await page.evaluate(() => /P4/.test(document.querySelector("[data-cs-team-rest]").textContent)), true, "the shared family is to rest");
  eq(await page.evaluate(() => document.querySelector("[data-cs-panel]").textContent.includes("2")), true, "the panel's result is shown");
  eq(await page.evaluate(() => document.querySelectorAll("[data-cs-team-cta]").length), 1, "the call-to-action kinds to avoid are named");
});

await scenario("the team log: a card under the script summary and under the design stage, six lines at most, text escaped", { width: 390, height: 844 }, async (page) => {
  await ready(page, "/studio.html?mock=");
  eq(await page.locator("[data-cs-team-log]").count(), 0, "a post with no log shows no card");
  await page.evaluate(() => {
    const keys = ["director", "pitch", "duel", "swipe", "editor", "design"];
    const log = keys.map((k) => ({ k, t: k === "pitch" ? "جريء <b>كسب</b>: اتنين من تلاتة وقفوا" : "قرار " + k + " وسببه" })).concat([{ k: "extra", t: "سطر زيادة" }]);
    CS.ui.current._ctx.commit((s) => ({ ...s, ext: { ...(s.ext || {}), teamLog: log } }), { layout: false, history: false, quiet: true, path: "/ext/teamLog", slides: [] });
  });
  await page.waitForSelector('section[data-cs-screen="script"] [data-cs-team-log]');
  eq(await page.locator('section[data-cs-screen="script"] .ui-team-list li').count(), 6, "six lines, the unknown key is dropped");
  eq(await page.locator('.ui-team-list b').count(), 0, "markup in a log line is text, not markup");
  eq(await page.evaluate(() => /جريء/.test(document.querySelector('[data-cs-team-log] li:nth-child(2)').textContent)), true, "the pitch line is shown");
  await page.evaluate(() => CS.ui.current._ctx.go("design"));
  await page.waitForSelector('section[data-cs-screen="design"]:not([hidden]) [data-cs-team-log]');
  eq(await page.locator('section[data-cs-screen="design"] .ui-team-list li').count(), 6, "the design stage shows the same log");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 1) throw new Error("horizontal page scroll of " + overflow + "px");
});

await browser.close();
server.close();
fs.rmSync(out, { recursive: true, force: true });
if (failed) { console.error(`\n${failed} scenario(s) failed:\n` + errors.join("\n")); process.exit(1); }
console.log("\nall scenarios passed");
