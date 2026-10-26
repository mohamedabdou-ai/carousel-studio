// Builds a self-contained test page (harness.html) from the runtime chunks, the stub core, fixtures, test fonts and the
// real cover.hf.html template, exactly the way build_studio.py (B5) embeds them in the Studio. Usage:
//   node build-harness.mjs --runtime <dir with cs-*.js> --out <dir>
// The chunks it hosts are the painters and the exporter (cs-paint, cs-motion, cs-hf, cs-mp4, cs-export) and, when they exist in --runtime, the two
// engine-side chunks of the visual language, cs-art and cs-visual, in the load order of IS-1 (they follow cs-export). cs-qa-visual and cs-visual-ui
// are not hosted: they register into CS.qa._ and CS.ui._, and this page has neither cs-qa nor cs-ui. A chunk that is missing is left out, a chunk
// that throws while loading does not stop the page: its message is kept in window.__loadErrors for tests/video/chunks.test.mjs to report.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../../..");
const arg = (name, fallback) => { const i = process.argv.indexOf("--" + name); return i > 0 ? process.argv[i + 1] : fallback; };
const runtimeDir = arg("runtime", path.join(repo, "plugins/carousel-studio/skills/carousel-design/runtime"));
const outDir = arg("out", path.join(here, ".out"));
const specFile = arg("spec", null);              // embeds this spec as <script id="cs-spec">, like a built Studio page
const pageName = arg("name", specFile ? "studio.html" : "harness.html");

const faces = [
  ["Alexandria", "700 800", "Alexandria-arabic.woff2", "U+0600-06FF,U+0750-077F,U+0870-088E,U+0890-0891,U+0897-08E1,U+08E3-08FF,U+200C-200E,U+2010-2011,U+204F,U+2E41,U+FB50-FDFF,U+FE70-FE74,U+FE76-FEFC"],
  ["Alexandria", "700 800", "Alexandria-latin.woff2", "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD"],
  ["Readex Pro", "400 600", "ReadexPro-arabic.woff2", "U+0600-06FF,U+0750-077F,U+0870-088E,U+0890-0891,U+0897-08E1,U+08E3-08FF,U+200C-200E,U+2010-2011,U+204F,U+2E41,U+FB50-FDFF,U+FE70-FE74,U+FE76-FEFC"],
  ["Readex Pro", "400 600", "ReadexPro-latin.woff2", "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD"]
];
const fontCss = faces.map(([family, weight, file, range]) => {
  const b64 = fs.readFileSync(path.join(here, "fonts", file)).toString("base64");
  return `@font-face{font-family:"${family}";font-style:normal;font-weight:${weight};font-display:block;src:url(data:font/woff2;base64,${b64}) format("woff2");unicode-range:${range};}`;
}).join("\n");

const template = fs.readFileSync(path.join(repo, "plugins/carousel-studio/skills/carousel-design/templates/cover.hf.html"), "utf8").replace(/<\//g, "<\\/");
const HOSTED = ["cs-paint", "cs-motion", "cs-hf", "cs-mp4", "cs-export", "cs-art", "cs-visual"];
const chunks = HOSTED.filter((c) => fs.existsSync(path.join(runtimeDir, c + ".js")));
const scripts = chunks.map((c) => `<script id="cs-chunk-${c.slice(3)}">\n${fs.readFileSync(path.join(runtimeDir, c + ".js"), "utf8").replace(/<\/script/gi, "<\\/script")}\n</script>`).join("\n");

const html = `<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>harness</title>
<style id="cs-fonts">${fontCss}</style>
<style>body{margin:0;background:#888}</style>
<script type="text/plain" id="cs-hf-template">${template}</script>
</head><body>
<div id="cs-app"></div>
${specFile ? `<script type="application/json" id="cs-spec">${fs.readFileSync(specFile, "utf8").replace(/<\//g, "<\\/")}</script>
<script type="application/json" id="cs-brand">null</script>` : ""}
<script>window.__loadErrors = []; window.addEventListener("error", function (e) { window.__loadErrors.push(String(e.message)); });</script>
<script>${fs.readFileSync(path.join(here, "stub-core.js"), "utf8")}</script>
${scripts}
<script>${fs.readFileSync(path.join(here, "fixtures.js"), "utf8")}</script>
<script>window.__harnessReady = document.fonts.ready.then(function () { return true; });</script>
</body></html>`;

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, pageName), html, "utf8");
console.log(`${pageName}  ${(html.length / 1024).toFixed(0)} KiB  chunks: ${chunks.join(", ")}`);
