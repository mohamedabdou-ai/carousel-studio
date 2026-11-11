"use strict";
/*
 * Runs rendered/scenario.js in headless Chrome and returns its result object.
 * The page is built on the fly from the stubbed CS.core libraries, the rule
 * bundle and the cs-qa chunk, so nothing here needs a network or a server.
 * Returns null when no Chrome is available (the caller skips the test).
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const cp = require("child_process");
const { loadBundle, DESIGN, REPO } = require("../support/stub-core.cjs");

function findChrome() {
  const env = process.env.CS_CHROME || process.env.CHROME || process.env.CHROME_PATH;
  const list = [env].concat(
    process.platform === "win32"
      ? [
          "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
          "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
          "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
        ]
      : ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"]
  );
  return list.find((p) => p && fs.existsSync(p)) || null;
}

const inline = (js) => js.replace(/<\/script/gi, "<\\/script");

function buildPage() {
  const bundle = JSON.stringify(loadBundle()).replace(/<\//g, "<\\/");
  const read = (p) => fs.readFileSync(p, "utf8");
  return [
    '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>cs-qa rendered</title>',
    "<style>html,body{margin:0;background:#fff}.cs-ltr{direction:ltr;unicode-bidi:isolate}</style></head><body>",
    '<div id="stage"></div><pre id="out"></pre>',
    "<script>window.__BUNDLE=" + bundle + ";</script>",
    "<script>" + inline(read(path.join(__dirname, "../support/stub-lib.js"))) + "</script>",
    "<script>window.CS={version:'cs-1.1.1',emit:function(){},core:{text:StubLib.text,color:StubLib.color,registry:{rules:function(){return window.__BUNDLE},fontCss:function(){return '\"x\"'},missingGlyphs:function(){return []}}}};</script>",
    "<script>" + inline(read(path.join(REPO, "src/lib/text.js"))) + "\nCS.core.text=Object.assign({},StubLib.text,{visualFields:CS.core.text.visualFields});</script>",
    "<script>" + inline(read(process.env.CS_QA_CHUNK || path.join(DESIGN, "runtime/cs-qa.js"))) + "</script>",
    "<script>window.__loadSpace=function(){" + inline(read(path.join(DESIGN, "runtime/cs-visual.js")) + read(path.join(REPO, "src/qa-visual/register.js")) + read(path.join(REPO, "src/qa-visual/deadspace-gates.js"))) + "};</script>",
    "<script>window.__loadText=function(){" + inline(read(path.join(REPO, "src/lib/text.js")) + read(path.join(REPO, "src/core/compose.js")) + read(path.join(REPO, "src/qa-visual/text-integrity.js"))) + "};</script>",
    "<script>" + inline(read(path.join(__dirname, "scenario.js"))) + "</script>",
    "</body></html>"
  ].join("\n");
}

function runScenario() {
  const chrome = findChrome();
  if (!chrome) return null;
  const tmp = process.env.CS_QA_TEMP || path.join(os.tmpdir(), "cs-qa-render");
  fs.mkdirSync(tmp, { recursive: true });
  const dir = fs.mkdtempSync(path.join(tmp, "run-"));
  const page = path.join(dir, "page.html");
  fs.writeFileSync(page, buildPage(), "utf8");
  const r = cp.spawnSync(
    process.execPath, [__filename, "--worker", page],
    { encoding: "utf8", maxBuffer: 256 * 1024 * 1024, timeout: 120000, windowsHide: true }
  );
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (e) {
    /* temp cleanup is best effort */
  }
  const encoded = String(r.stdout || "").trim();
  if (!encoded) throw new Error("scenario produced no output: " + String(r.error || r.stderr || "").slice(0, 400));
  const out = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
  if (out.__error) throw new Error(out.__error);
  return out;
}

module.exports = { runScenario, findChrome };

if (require.main === module && process.argv.includes("--worker")) {
  (async () => {
    const { chromium } = require("playwright-core");
    const { pathToFileURL } = require("node:url");
    const browser = await chromium.launch({ executablePath: findChrome(), headless: true, args: ["--disable-gpu", "--no-sandbox"] });
    try {
      const page = await browser.newPage();
      await page.goto(pathToFileURL(process.argv[3]).href);
      await page.waitForFunction(() => /^(done|failed)$/.test(document.title), { timeout: 90000 });
      console.log(await page.locator("#out").textContent());
    } finally { await browser.close(); }
  })().catch(e => { console.error(e); process.exitCode = 1; });
} else if (require.main === module) {
  const out = runScenario();
  console.log(out ? JSON.stringify(out, null, 1) : "no Chrome found");
}
