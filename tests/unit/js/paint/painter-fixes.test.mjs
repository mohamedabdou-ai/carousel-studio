// cs-paint, round 3 (package F1): the two bugs that made the replay painter (Safari, every iPhone browser) lose decoration, and the Node-side SSIM.
//   1. a url() whose data: URI holds single quotes (every decor.css pattern) was skipped, so paper, rules, lattices and frames never reached the canvas;
//   2. color(srgb ...) (what Chromium computes color-mix() to) was not a colour for parseColor, so every ghost numeral was dropped as transparent.
// Run by node tests/video/run.mjs (module "paint-fixes", on the harness page) and on its own by `node --test tests/unit/js/paint/*.test.mjs`
// (a bare page with a privately built cs-paint, see tests/parity/lib/barepage.mjs). The source-level tests need no browser.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { isMain, runAsNodeTests } from "../../../parity/lib/barepage.mjs";
import { decodePng, psnr, ssim } from "../../../parity/lib/ssim.mjs";
import { paintBoth, paintBothScored } from "../../../parity/lib/painters.mjs";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

/** The real src/paint/core.js (plain declarations, no side effects) evaluated alone, so its private helpers can be called. */
function loadCore() {
  const code = fs.readFileSync(path.join(repo, "src/paint/core.js"), "utf8") + "\nthis.__core = { parseColor: parseColor, canvasColor: canvasColor, isTransparent: isTransparent, cssUrlRe: cssUrlRe };";
  const sandbox = { CS: {}, Map };
  vm.runInNewContext(code, sandbox);
  return sandbox.__core;
}

const SVG_TILE = "%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40'%3E%3Crect width='40' height='40' fill='%23d62828'/%3E%3C/svg%3E";

const mod = {
  module: "paint-fixes",
  tests: [
    {
      name: "cssUrlRe(): a quoted data: SVG whose attributes use single quotes is ONE url, plain and unquoted urls still match, layers are found one by one",
      needsPage: false,
      async run(t) {
        const { cssUrlRe } = loadCore(), urls = (s) => { const re = cssUrlRe(), out = []; let m; while ((m = re.exec(s))) out.push(m[2]); return out; };
        const data = "data:image/svg+xml," + SVG_TILE;
        t.eq(urls(`url("${data}")`), [data], "double-quoted, single quotes inside (what getComputedStyle returns for decor.css)");
        t.eq(urls(`url('data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22%3E%3C/svg%3E')`), ["data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22%3E%3C/svg%3E"], "single-quoted, double quotes inside");
        t.eq(urls("url(data:image/png;base64,AAAA=)"), ["data:image/png;base64,AAAA="], "unquoted");
        t.eq(urls('url( "a.png" )'), ["a.png"], "spaces inside the brackets");
        t.eq(urls(`url("a.png"), linear-gradient(rgba(0, 0, 0, 0) 0%, rgb(1, 2, 3) 100%), url("${data}")`), ["a.png", data], "several layers in one value");
        t.eq(urls("none"), [], "no url, no match");
        t.ok(!/url\(\s*(['"]?)([^'")]+)\1\s*\)/.test(`url("${data}")`), "the pattern of 1.0 could not read that value: this test would have failed there");
      }
    },
    {
      name: "parseColor(): rgb(), rgba() and color(srgb ...) (channels 0..1, optional alpha); other colour spaces and junk are not guessed",
      needsPage: false,
      async run(t) {
        const { parseColor, canvasColor, isTransparent } = loadCore(), near = (c, want) => t.ok(c && ["r", "g", "b", "a"].every((k, i) => Math.abs(c[k] - want[i]) < 1e-9), JSON.stringify(c) + " is not " + JSON.stringify(want));
        near(parseColor("color(srgb 0.1 0.2 0.3 / 0.5)"), [25.5, 51, 76.5, 0.5]);
        near(parseColor("color(srgb 1 0 0)"), [255, 0, 0, 1]);
        near(parseColor("  color(srgb  0.6 0.6 0.6)  "), [153, 153, 153, 1]);
        near(parseColor("rgb(10, 20, 30)"), [10, 20, 30, 1]);
        near(parseColor("rgba(10, 20, 30, 0.4)"), [10, 20, 30, 0.4]);
        near(parseColor("rgb(10 20 30 / 0.25)"), [10, 20, 30, 0.25]);
        for (const bad of ["color(display-p3 1 0 0)", "oklch(0.5 0.1 200)", "#336699", "transparent", "", "color(srgb)"]) t.eq(parseColor(bad), null, "not guessed: " + bad);
        t.eq(canvasColor("color(srgb 0.1 0.2 0.3 / 0.5)"), "rgba(26,51,77,0.5)", "the form every canvas accepts");
        t.eq(canvasColor("rgb(10, 20, 30)"), "rgba(10,20,30,1)"); t.eq(canvasColor("oklch(0.5 0.1 200)"), "oklch(0.5 0.1 200)", "an unreadable colour comes back unchanged");
        t.ok(isTransparent("color(srgb 1 1 1 / 0)") && isTransparent("rgba(0, 0, 0, 0)") && !isTransparent("color(srgb 0.1 0.2 0.3 / 0.5)") && !isTransparent("color(srgb 0 0 0)"), "isTransparent follows");
      }
    },
    {
      name: "replay painter: a background layer whose data: URI contains single quotes is drawn, and the svg painter agrees",
      async run(t) {
        const r = await t.page.evaluate(async (svg) => {
          const el = document.createElement("div");
          el.style.cssText = `position:absolute;left:0;top:0;width:200px;height:120px;background-color:#ffffff;background-image:url("data:image/svg+xml,${svg}");background-size:100% 100%;background-repeat:no-repeat`;
          document.body.appendChild(el);
          const computed = getComputedStyle(el).backgroundImage, px = (c) => Array.from(c.getContext("2d").getImageData(100, 60, 1, 1).data);
          try {
            const rep = await CS.paint.toCanvas(el, { scale: 1, painter: "replay" }), sv = await CS.paint.toCanvas(el, { scale: 1, painter: "svg" });
            return { quotes: computed.includes("xmlns='"), replay: px(rep), svg: px(sv), ssim: CS.paint.metrics.ssim(rep, sv) };
          } finally { el.remove(); }
        }, SVG_TILE);
        t.ok(r.quotes, "the computed value does hold single quotes inside the double-quoted url: " + r.quotes);
        t.ok(r.svg[0] > 180 && r.svg[1] < 80, "the svg painter shows the red tile: " + r.svg);
        t.ok(r.replay[0] > 180 && r.replay[1] < 80, "so does the replay painter (it painted white before the fix): " + r.replay);
        t.gte(r.ssim, 0.99, "the two painters agree on the box");
      }
    },
    {
      name: "replay painter: a ghost numeral coloured by color-mix() is drawn (computed as color(srgb ...)), opaque and with alpha",
      async run(t) {
        const r = await t.page.evaluate(async () => {
          const make = (color) => {
            const el = document.createElement("div");
            el.style.cssText = "position:absolute;left:0;top:0;width:300px;height:260px;background:#ffffff;overflow:hidden";
            el.innerHTML = `<span style="position:absolute;left:30px;top:10px;font:800 230px/1 sans-serif;color:${color}">8</span>`;
            document.body.appendChild(el);
            return el;
          };
          const count = (c, lo, hi) => { const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] >= lo && d[i] <= hi && Math.abs(d[i] - d[i + 1]) < 4 && Math.abs(d[i] - d[i + 2]) < 4) n++; return n; };
          const out = {};
          for (const [name, color, lo, hi] of [["opaque", "color-mix(in srgb, #000000 40%, #ffffff)", 148, 158], ["alpha", "color-mix(in srgb, #000000 50%, transparent)", 120, 136]]) {
            const el = make(color);
            try {
              const rep = await CS.paint.toCanvas(el, { scale: 1, painter: "replay" }), sv = await CS.paint.toCanvas(el, { scale: 1, painter: "svg" });
              out[name] = { computed: getComputedStyle(el.firstChild).color, replay: count(rep, lo, hi), svg: count(sv, lo, hi) };
            } finally { el.remove(); }
          }
          return out;
        });
        for (const k of ["opaque", "alpha"]) {
          t.ok(r[k].svg > 3000, `${k}: the svg painter draws the numeral (${r[k].computed}): ${r[k].svg} pixels of the mixed grey`);
          t.ok(r[k].replay > 0.8 * r[k].svg && r[k].replay < 1.25 * r[k].svg, `${k}: the replay painter draws it too, in the same grey and at the same size (it drew nothing before the fix): ${r[k].replay} pixels against ${r[k].svg}`);
        }
      }
    },
    {
      name: "tests/parity/lib/painters.mjs: paintBoth() hands back the two painters' PNG files of one element, forced svg then replay, scored like the page scores them",
      async run(t) {
        await t.page.evaluate(() => {
          const el = document.createElement("div");
          el.id = "pb-probe";
          el.style.cssText = "position:absolute;left:0;top:0;width:240px;height:160px;background:linear-gradient(135deg,#2255cc 0%,#f4f4f2 100%);border:6px solid #112244;border-radius:24px;box-sizing:border-box";
          document.body.appendChild(el);
        });
        try {
          const own = await t.page.evaluate(async () => { const el = document.getElementById("pb-probe"), a = await CS.paint.toCanvas(el, { scale: 1, painter: "svg" }), b = await CS.paint.toCanvas(el, { scale: 1, painter: "replay" }); return { w: a.width, h: a.height, ssim: CS.paint.metrics.ssim(a, b) }; });
          const both = await paintBoth(t.page, "#pb-probe"), svg = decodePng(both.svgPng), rep = decodePng(both.replayPng), scored = await paintBothScored(t.page, "#pb-probe", { scale: 0.5 });
          t.eq([svg.width, svg.height, rep.width, rep.height], [own.w, own.h, own.w, own.h], "scale 1: the element's size, both pictures");
          t.eq([both.svgPng.subarray(0, 4).toString("hex"), both.replayPng.subarray(0, 4).toString("hex")], ["89504e47", "89504e47"], "PNG files");
          t.near(ssim(both.svgPng, both.replayPng), own.ssim, 1e-4, "Node and page agree on the score of the same two pictures"); t.gte(own.ssim, 0.98);
          t.eq([decodePng(scored.svgPng).width, decodePng(scored.svgPng).height], [120, 80], "opts.scale"); t.ok(scored.ssim > 0.9 && scored.ssim <= 1, "scored: " + scored.ssim);
          let msg = null; try { await paintBoth(t.page, "#no-such-element"); } catch (e) { msg = e.message; }
          t.ok(/no element matches/.test(msg || ""), "a selector that matches nothing is an error: " + msg);
        } finally { await t.page.evaluate(() => { const el = document.getElementById("pb-probe"); if (el) el.remove(); }); }
      }
    },
    {
      name: "tests/parity/lib/ssim.mjs: agrees with CS.paint.metrics.ssim, reads the engine's own RGB PNG files, and 1 / 100 dB for identical images",
      async run(t) {
        const r = await t.page.evaluate(async () => {
          const make = (shift, tone) => {
            const c = document.createElement("canvas"); c.width = 160; c.height = 120;
            const x = c.getContext("2d", { alpha: false }); x.fillStyle = "#ffffff"; x.fillRect(0, 0, 160, 120);
            x.fillStyle = tone; x.font = "bold 60px sans-serif"; x.fillText("Aa", 20 + shift, 80 + shift);
            x.fillStyle = "#c33"; x.fillRect(100, 20 + shift, 30, 50);
            return c;
          };
          const bytes = (u8) => { let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
          const a = make(0, "#111111"), same = make(0, "#111111"), shifted = make(6, "#111111"), dim = make(0, "#222222"), m = CS.paint.metrics;
          return {
            png: { a: bytes(await CS.paint.encode(a, "png")), same: bytes(await CS.paint.encode(same, "png")), shifted: bytes(await CS.paint.encode(shifted, "png")), dim: bytes(await CS.paint.encode(dim, "png")) },
            data: { a: a.toDataURL("image/png").split(",")[1], shifted: shifted.toDataURL("image/png").split(",")[1] },
            page: { shifted: m.ssim(a, shifted), dim: m.ssim(a, dim), psnrDim: m.psnr(a, dim) }
          };
        });
        const buf = (b64) => Buffer.from(b64, "base64"), img = decodePng(buf(r.png.a));
        t.eq([img.width, img.height], [160, 120], "an RGB (colour type 2) PNG from cs-paint decodes");
        t.eq(buf(r.png.a)[25], 2, "cs-paint writes colour type 2 (RGB, no alpha)"); t.eq(buf(r.data.a)[25], 6, "the browser's toDataURL writes RGBA: both readable");
        t.near(ssim(buf(r.png.a), buf(r.png.same)), 1, 1e-12, "identical images"); t.eq(psnr(buf(r.png.a), buf(r.png.same)), 100);
        t.near(ssim(buf(r.png.a), buf(r.png.shifted)), r.page.shifted, 1e-4, "a shifted copy: Node and the page give the same number");
        t.near(ssim(buf(r.png.a), buf(r.png.dim)), r.page.dim, 1e-4, "a slightly darker copy");
        t.near(psnr(buf(r.png.a), buf(r.png.dim)), r.page.psnrDim, 1e-3, "psnr too");
        t.near(ssim(buf(r.data.a), buf(r.data.shifted)), ssim(buf(r.png.a), buf(r.png.shifted)), 1e-9, "RGBA and RGB files of the same pixels score the same");
        t.ok(r.page.shifted < 0.9, "a 6 px shift is clearly different: " + r.page.shifted);
        let threw = null; try { ssim(buf(r.png.a), { width: 8, height: 8, data: new Uint8ClampedArray(256) }); } catch (e) { threw = e.message; }
        t.ok(/same size/.test(threw || ""), "different sizes are refused: " + threw);
      }
    }
  ]
};

export default mod;

if (isMain(import.meta.url)) await runAsNodeTests(mod, { modules: ["paint"] });
