// tests/unit/js/core/run.mjs
// Runs the engine tests in headless Chromium using the existing playwright-core pipe transport and a static file server.
//
//   node tests/unit/js/core/run.mjs [--lib stub|real] [--cases registry,fit] [--real-presets] [--gallery out.png] [--gallery-query "types=cover&big=1"]
//   --real-presets   register the presets of styles/index.json (B6) instead of the fixture presets and run cases/real.test.js
//   --visual-out DIR  save the visual-compose fixtures at 1080 px and 130 px, after the tests (no release files written)
//   env CHROME_PATH or CS_CHROME   path of a Chromium/Chrome/Edge executable (otherwise searched in the usual places)
//   env CS_TEST_FONTS              folder with the prototype woff2 fonts (used only while fonts/registry.json is not in the repo)
import http from "node:http";
import { readFileSync, existsSync, statSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import { dirname, join, resolve, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { buildChunk } from "./_build.mjs";
import { chromium } from "playwright-core";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const args = process.argv.slice(2);
const opt = (name, def = null) => { const i = args.indexOf("--" + name); return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : def; };
const lib = opt("lib", "auto");
const cases = opt("cases");
const galleryOut = opt("gallery");
const galleryQuery = opt("gallery-query", "");
const visualOut = opt("visual-out");
const realPresets = args.includes("--real-presets");

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".css": "text/css; charset=utf-8", ".woff2": "font/woff2", ".ttf": "font/ttf", ".svg": "image/svg+xml", ".png": "image/png" };

function findChrome() {
  const envPath = process.env.CS_CHROME || process.env.CHROME_PATH;
  if (envPath && existsSync(envPath)) return envPath;
  const local = process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "ms-playwright") : join(process.env.HOME || "", ".cache", "ms-playwright");
  const found = [];
  if (existsSync(local)) {
    for (const d of readdirSync(local).filter((n) => /^chromium-\d+$/.test(n)).sort().reverse()) {
      for (const rel of ["chrome-win64/chrome.exe", "chrome-win/chrome.exe", "chrome-linux/chrome", "chrome-linux64/chrome", "chrome-mac/Chromium.app/Contents/MacOS/Chromium"]) found.push(join(local, d, rel));
    }
  }
  found.push("C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome");
  const hit = found.find((p) => existsSync(p));
  if (!hit) throw new Error("No Chromium found. Set CHROME_PATH.");
  return hit;
}

function protoFonts() {
  const cand = process.env.CS_TEST_FONTS || resolve(ROOT, "..", "prototypes", "studio-prototype", "fonts");
  return existsSync(cand) ? cand : null;
}

function startServer(chunk) {
  const fonts = protoFonts();
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (url === "/__build__/cs-core.js") { res.writeHead(200, { "content-type": MIME[".js"], "cache-control": "no-store" }); return res.end(chunk); }
    let file = null;
    if (url.startsWith("/__proto_fonts__/") && fonts) file = resolve(fonts, url.slice("/__proto_fonts__/".length));
    else file = resolve(ROOT, "." + url);
    const base = url.startsWith("/__proto_fonts__/") ? fonts : ROOT;
    if (!file || !base || !(file === base || file.startsWith(base + sep)) || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); return res.end("not found"); }
    res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream", "cache-control": "no-store" });
    res.end(readFileSync(file));
  });
  return new Promise((ok) => server.listen(0, "127.0.0.1", () => ok({ server, port: server.address().port })));
}

async function launch() {
  // Pipe transport avoids a second localhost server just for DevTools, and owns cleanup even on launch failure.
  const browser = await chromium.launch({ executablePath: findChrome(), headless: true, timeout: 20000, args: ["--disable-gpu", "--hide-scrollbars", "--allow-file-access-from-files"] });
  const context = await browser.newContext({ viewport: { width: 1500, height: 1100 }, deviceScaleFactor: 1 });
  const page = await context.newPage(), session = await context.newCDPSession(page);
  const cdp = { send: (method, params = {}) => session.send(method, params),
    async eval(expression) {
      const r = await session.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    },
    on: (fn) => ["Runtime.consoleAPICalled", "Runtime.exceptionThrown"].forEach((method) => session.on(method, (params) => fn({ method, params }))) };
  await cdp.send("Runtime.enable"); await cdp.send("Page.enable");
  return { cdp, close: () => browser.close() };
}

async function waitFor(cdp, expr, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await cdp.eval(expr)) return true; await new Promise((r) => setTimeout(r, 150)); }
  return false;
}

const withLib = lib === "real" || (lib === "auto" && existsSync(join(ROOT, "src/lib/manifest.json")) && JSON.parse(readFileSync(join(ROOT, "src/lib/manifest.json"), "utf8")).files?.length > 0);
const chunk = buildChunk({ withLib });
const { server, port } = await startServer(chunk);
let launched;
try { launched = await launch(); } catch (e) { server.close(); throw e; }
const { cdp, close } = launched;
const logs = [];
cdp.on((m) => {
  if (m.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(m.params.type)) logs.push(m.params.type + ": " + m.params.args.map((a) => a.value ?? a.description).join(" "));
  if (m.method === "Runtime.exceptionThrown") logs.push("exception: " + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
});

let failed = 0;
try {
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1500, height: 1100, deviceScaleFactor: 1, mobile: false });
  const q = `lib=${withLib ? "real" : "stub"}${cases ? "&cases=" + cases : ""}${realPresets ? "&presets=real" : ""}`;
  await cdp.send("Page.navigate", { url: `http://127.0.0.1:${port}/tests/unit/js/core/harness.html?${q}` });
  if (!(await waitFor(cdp, "!!window.__CST_DONE", 180000))) throw new Error("tests did not finish in time");
  const done = await cdp.eval("window.__CST_DONE");
  console.log(`engine tests · lib=${done.lib} · ${done.ua.split(") ").pop()}`);
  for (const r of done.results) {
    console.log(`${r.ok ? "  ok  " : " FAIL "} ${r.name} (${r.ms} ms)`);
    if (!r.ok) { failed++; console.log("        " + String(r.error).split("\n").join("\n        ")); }
  }
  console.log(`\n${done.results.length - failed}/${done.results.length} passed`);
  if (logs.length) console.log("\nbrowser log:\n  " + logs.slice(0, 20).join("\n  "));

  if (visualOut) {
    mkdirSync(visualOut, { recursive: true });
    for (const width of [1080, 130]) {
      const dims = await cdp.eval(`(() => {
        if (!window.__CST_VISUALS?.length) throw new Error("--visual-out requires visual-compose cases");
        const g=document.getElementById("gallery");g.replaceChildren();g.style.cssText="display:flex;gap:0;padding:0;direction:ltr;width:max-content";
        window.__CST_VISUALS.forEach(n=>{const frame=document.createElement("div");frame.style.cssText="position:relative;overflow:hidden;width:${width}px;height:"+Math.ceil(parseInt(n.style.height)*${width}/1080)+"px";
          const s=n.cloneNode(true);s.style.position="absolute";s.style.left="0";s.style.top="0";s.style.transformOrigin="0 0";s.style.transform="scale("+${width}/1080+")";frame.appendChild(s);g.appendChild(frame)});
        return {w:g.offsetWidth,h:g.offsetHeight};})()`);
      await cdp.send("Emulation.setDeviceMetricsOverride", { width: dims.w, height: dims.h, deviceScaleFactor: 1, mobile: false });
      const shot=await cdp.send("Page.captureScreenshot", { format: "png", clip: {x:0,y:0,width:dims.w,height:dims.h,scale:1} });
      const file=join(visualOut, `visual-${width}.png`);writeFileSync(file,Buffer.from(shot.data,"base64"));console.log(`visual sheet -> ${file} (${dims.w}x${dims.h})`);
    }
  }

  if (galleryOut) {
    const extra = galleryQuery ? "&" + galleryQuery : "";
    await cdp.send("Page.navigate", { url: `http://127.0.0.1:${port}/tests/unit/js/core/harness.html?lib=${withLib ? "real" : "stub"}&mode=gallery${realPresets ? "&presets=real" : ""}${extra}` });
    if (!(await waitFor(cdp, "!!window.__CST_GALLERY_DONE", 120000))) throw new Error("gallery did not finish");
    const dims = await cdp.eval("({w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight})");
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: dims.w, height: dims.h, deviceScaleFactor: 1, mobile: false });
    await new Promise((r) => setTimeout(r, 400));
    const shot = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    writeFileSync(galleryOut, Buffer.from(shot.data, "base64"));
    console.log(`gallery -> ${galleryOut} (${dims.w}x${dims.h})`);
  }
} catch (e) {
  console.error("runner error:", e.message);
  failed = failed || 1;
} finally {
  await close(); server.close();
}
process.exit(failed ? 1 : 0);
