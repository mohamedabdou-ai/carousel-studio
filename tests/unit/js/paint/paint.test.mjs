// cs-paint: detection, production rasters (PNG / JPEG), downscale, metrics, markup, fonts, text mask.
export default {
  module: "paint",
  tests: [
    {
      name: "detect(): a foreignObject drawing is readable on Chromium, so the svg painter is chosen",
      async run(t) {
        const r = await t.page.evaluate(async () => ({ d: await CS.paint.detect({ force: true }), again: await CS.paint.detect() }));
        t.eq(r.d.painter, "svg"); t.eq(r.d.engine, "blink"); t.ok(r.d.reason.length > 5); t.eq(r.again, r.d, "the result is cached");
      }
    },
    {
      name: "setPainter validates, and toCanvas honours the forced painter",
      async run(t) {
        const r = await t.page.evaluate(async () => {
          const deck = await CS.core.render.deck(CS_FIXTURES.mistakes, null, { slideIds: ["s01"] });
          const el = deck.slides[0].el;
          let bad = null; try { CS.paint.setPainter("canvas2"); } catch (e) { bad = e.code; }
          CS.paint.setPainter("replay");
          const viaPref = await CS.paint.raster(el, { type: "png" });
          CS.paint.setPainter("auto");
          const forced = await CS.paint.raster(el, { type: "png", paintScale: 1 });
          const named = [viaPref.painter, forced.painter];
          deck.dispose();
          return { bad, named };
        });
        t.eq(r.bad, "E_USAGE"); t.eq(r.named, ["replay", "svg"], "preference replay, then auto -> svg");
      }
    },
    {
      name: "raster(png): exactly 1080x1440, 8-bit RGB without an alpha channel, no text chunks, repeatable",
      async run(t) {
        const r = await t.page.evaluate(async () => {
          const deck = await CS.core.render.deck(CS_FIXTURES.mistakes, null, { slideIds: ["s01"] });
          const el = deck.slides[0].el, a = await CS.paint.raster(el, { type: "png" }), b = await CS.paint.raster(el, { type: "png" });
          const u = a.bytes, dv = new DataView(u.buffer, u.byteOffset), chunks = [];
          for (let o = 8; o < u.length;) { const len = dv.getUint32(o), type = String.fromCharCode(u[o + 4], u[o + 5], u[o + 6], u[o + 7]); chunks.push(type); o += 12 + len; }
          deck.dispose();
          return { w: a.w, h: a.h, sig: Array.from(u.slice(0, 8)), ihdr: { w: dv.getUint32(16), h: dv.getUint32(20), depth: u[24], color: u[25] }, chunks, same: a.bytes.length === b.bytes.length && a.bytes.every((v, i) => v === b.bytes[i]), size: u.length };
        });
        t.eq([r.w, r.h], [1080, 1440]); t.eq(r.sig, [137, 80, 78, 71, 13, 10, 26, 10]); t.eq(r.ihdr, { w: 1080, h: 1440, depth: 8, color: 2 }, "IHDR: RGB, no alpha");
        t.ok(!r.chunks.some((c) => ["tEXt", "zTXt", "iTXt", "eXIf"].includes(c)), "no text or EXIF chunks: " + r.chunks.join(","));
        t.ok(r.same, "painting the same slide twice gives the same bytes"); t.lte(r.size, 400000, "a swiss cover is small");
      }
    },
    {
      name: "png writer: the file decodes to exactly the canvas pixels, with or without the browser's compressor (stored blocks are the fallback)",
      async run(t) {
        const r = await t.page.evaluate(async () => {
          const c = document.createElement("canvas"); c.width = 97; c.height = 61;
          const g = c.getContext("2d", { alpha: false, willReadFrequently: true });
          for (let y = 0; y < 61; y++) for (let x = 0; x < 97; x++) { g.fillStyle = `rgb(${(x * 7 + y) & 255},${(y * 13) & 255},${(x * y) & 255})`; g.fillRect(x, y, 1, 1); }
          const want = g.getImageData(0, 0, 97, 61).data;
          const decode = async (bytes) => {
            const bmp = await createImageBitmap(new Blob([bytes], { type: "image/png" })), d = document.createElement("canvas"); d.width = 97; d.height = 61;
            const dg = d.getContext("2d", { willReadFrequently: true }); dg.drawImage(bmp, 0, 0);
            const got = dg.getImageData(0, 0, 97, 61).data; let bad = 0; for (let i = 0; i < got.length; i++) if (got[i] !== want[i]) bad++;
            return bad;
          };
          const packed = await CS.paint.encode(c, "png"), original = window.CompressionStream;
          window.CompressionStream = undefined;
          let stored; try { stored = await CS.paint.encode(c, "png"); } finally { window.CompressionStream = original; }
          const color = (u) => u[25];
          return { packedBad: await decode(packed), storedBad: await decode(stored), colors: [color(packed), color(stored)], storedBigger: stored.length > packed.length };
        });
        t.eq(r.packedBad, 0, "compressed file decodes to the same pixels"); t.eq(r.storedBad, 0, "stored-block file decodes to the same pixels");
        t.eq(r.colors, [2, 2], "both are RGB, no alpha"); t.ok(r.storedBigger, "the fallback is the larger one");
      }
    },
    {
      name: "raster(jpeg 4x5): 1080x1350 from y 45, JPEG without APP1/COM segments, within 8,000,000 bytes, quality steps down to fit",
      async run(t) {
        const r = await t.page.evaluate(async () => {
          const deck = await CS.core.render.deck(CS_FIXTURES.heritage, null, { slideIds: ["s01"] });
          const el = deck.slides[0].el, a = await CS.paint.raster(el, { type: "jpeg", crop: "4x5" }), tight = await CS.paint.raster(el, { type: "jpeg", crop: "4x5", maxBytes: 90000 });
          const markers = (u) => { const out = []; for (let i = 2; i + 4 < u.length;) { if (u[i] !== 0xFF) { i++; continue; } const m = u[i + 1]; out.push(m); if (m === 0xDA) break; i += 2 + ((u[i + 2] << 8) | u[i + 3]); } return out; };
          const dims = (u) => { for (let i = 2; i + 9 < u.length;) { if (u[i] === 0xFF && u[i + 1] >= 0xC0 && u[i + 1] <= 0xC2) return [(u[i + 7] << 8) | u[i + 8], (u[i + 5] << 8) | u[i + 6]]; i += 2 + ((u[i + 2] << 8) | u[i + 3]); } return null; };
          const out = { a: { w: a.w, h: a.h, soi: [a.bytes[0], a.bytes[1]], dims: dims(a.bytes), markers: markers(a.bytes), size: a.bytes.length }, tight: { size: tight.bytes.length } };
          deck.dispose();
          return out;
        });
        t.eq([r.a.w, r.a.h], [1080, 1350]); t.eq(r.a.soi, [0xFF, 0xD8]); t.eq(r.a.dims, [1080, 1350], "the JPEG frame header");
        t.ok(!r.a.markers.includes(0xE1) && !r.a.markers.includes(0xFE) && !r.a.markers.includes(0xED), "no EXIF/XMP, comment or Photoshop segments: " + r.a.markers.map((m) => m.toString(16)));
        t.lte(r.a.size, 8000000); t.lte(r.tight.size, 90000, "maxBytes lowers the quality in steps");
      }
    },
    {
      name: "downscale: an exact 2x reduction is the 2x2 box average, other ratios land on the requested size",
      async run(t) {
        const r = await t.page.evaluate(() => {
          const src = document.createElement("canvas"); src.width = 64; src.height = 48;
          const cx = src.getContext("2d", { alpha: false }); const img = cx.createImageData(64, 48);
          for (let i = 0; i < 64 * 48; i++) { const v = (i * 2654435761 >>> 0); img.data[i * 4] = v & 255; img.data[i * 4 + 1] = (v >>> 8) & 255; img.data[i * 4 + 2] = (v >>> 16) & 255; img.data[i * 4 + 3] = 255; }
          cx.putImageData(img, 0, 0);
          const half = CS.paint.downscale(src, 32, 24), hd = half.getContext("2d").getImageData(0, 0, 32, 24).data;
          let worst = 0;
          for (let y = 0; y < 24; y++) for (let x = 0; x < 32; x++) for (let c = 0; c < 3; c++) {
            const s = (xx, yy) => img.data[(yy * 64 + xx) * 4 + c], avg = (s(2 * x, 2 * y) + s(2 * x + 1, 2 * y) + s(2 * x, 2 * y + 1) + s(2 * x + 1, 2 * y + 1)) / 4;
            worst = Math.max(worst, Math.abs(avg - hd[(y * 32 + x) * 4 + c]));
          }
          const odd = CS.paint.downscale(src, 21, 17), same = CS.paint.downscale(src, 64, 48);
          return { worst, odd: [odd.width, odd.height], same: same === src || (same.width === 64 && same.height === 48), alpha: half.getContext("2d").getContextAttributes().alpha };
        });
        t.lte(r.worst, 1, "box average within one level"); t.eq(r.odd, [21, 17]); t.ok(r.same);
      }
    },
    {
      name: "metrics: identical images are SSIM 1 / PSNR 100 dB, noise and shifts lower them in the expected order",
      async run(t) {
        const r = await t.page.evaluate(() => {
          const make = (fn) => { const c = document.createElement("canvas"); c.width = 160; c.height = 120; const x = c.getContext("2d", { alpha: false }); x.fillStyle = "#fff"; x.fillRect(0, 0, 160, 120); fn(x); return c; };
          const base = make((x) => { x.fillStyle = "#111"; x.font = "bold 60px sans-serif"; x.fillText("Aa", 20, 80); });
          const same = make((x) => { x.fillStyle = "#111"; x.font = "bold 60px sans-serif"; x.fillText("Aa", 20, 80); });
          const shifted = make((x) => { x.fillStyle = "#111"; x.font = "bold 60px sans-serif"; x.fillText("Aa", 26, 86); });
          const dim = make((x) => { x.fillStyle = "#222"; x.font = "bold 60px sans-serif"; x.fillText("Aa", 20, 80); });
          const m = CS.paint.metrics;
          let err = null; try { m.ssim(base, document.createElement("canvas")); } catch (e) { err = e.code; }
          return { same: [m.ssim(base, same), m.psnr(base, same)], shifted: [m.ssim(base, shifted), m.psnr(base, shifted)], dim: [m.ssim(base, dim), m.psnr(base, dim)], err };
        });
        t.eq(r.same, [1, 100]); t.ok(r.shifted[0] < 0.9 && r.shifted[1] < 20, "a 6 px shift is clearly different"); t.ok(r.dim[0] > 0.98 && r.dim[1] > 30 && r.dim[1] < 60, "a slight tone change stays high: " + r.dim); t.eq(r.err, "E_USAGE");
      }
    },
    {
      name: "svgMarkup(): well-formed XML, foreignObject at the slide size, only the faces in use are embedded",
      async run(t) {
        const r = await t.page.evaluate(async () => {
          const deck = await CS.core.render.deck(CS_FIXTURES.mistakes, null, { slideIds: ["s01"] });
          const el = deck.slides[0].el, m = CS.paint.svgMarkup(el, { scale: 2 }), doc = new DOMParser().parseFromString(m, "image/svg+xml");
          const all = CS.paint.fontCss(), only = CS.paint.fontCss(["alexandria"]), byId = CS.paint.fontCss(["readex-pro"]), used = CS.paint.usedFamilies(el);
          const out = {
            parsed: !doc.querySelector("parsererror"), svg: doc.documentElement.getAttribute("width") + "x" + doc.documentElement.getAttribute("height"), view: doc.documentElement.getAttribute("viewBox"),
            fo: !!doc.querySelector("foreignObject"), slide: !!doc.querySelector(".cs-slide"), contenteditable: m.includes("contenteditable"), families: (m.match(/font-family:"([^"]+)"/g) || []).length,
            allFaces: (all.match(/@font-face/g) || []).length, onlyAlexandria: (only.match(/@font-face/g) || []).length, onlyHasReadex: /Readex/.test(only), byIdReadex: /Readex/.test(byId) && !/Alexandria/.test(byId), used
          };
          deck.dispose();
          return out;
        });
        t.ok(r.parsed, "markup parses as XML"); t.eq(r.svg, "2160x2880"); t.eq(r.view, "0 0 1080 1440"); t.ok(r.fo && r.slide); t.ok(!r.contenteditable);
        t.eq(r.allFaces, 4); t.eq(r.onlyAlexandria, 2, "filtering by CSS family"); t.ok(!r.onlyHasReadex); t.ok(r.byIdReadex, "registry ids map to CSS family names");
        t.ok(r.used.includes("alexandria") && r.used.includes("readex pro"), "used families: " + r.used);
      }
    },
    {
      name: "toCanvas(): scale, crop and the opaque sRGB context",
      async run(t) {
        const r = await t.page.evaluate(async () => {
          const deck = await CS.core.render.deck(CS_FIXTURES.mistakes, null, { slideIds: ["s01"] });
          const el = deck.slides[0].el;
          const full = await CS.paint.toCanvas(el, { scale: 0.5 }), crop = await CS.paint.toCanvas(el, { scale: 1, crop: { x: 0, y: 45, w: 1080, h: 1350 } }), own = document.createElement("canvas"), re = await CS.paint.toCanvas(el, { scale: 1, canvas: own });
          const attrs = full.getContext("2d").getContextAttributes();
          const px = (c, x, y) => Array.from(c.getContext("2d").getImageData(x, y, 1, 1).data);
          const out = { full: [full.width, full.height], crop: [crop.width, crop.height], reuse: re === own && own.width === 1080, alpha: attrs.alpha, cs: attrs.colorSpace, bg: px(full, 3, 3), cropTop: px(crop, 3, 3) };
          deck.dispose();
          return out;
        });
        t.eq(r.full, [540, 720]); t.eq(r.crop, [1080, 1350]); t.ok(r.reuse, "a canvas passed in is reused and resized"); t.eq(r.alpha, false); t.eq(r.cs, "srgb");
        t.eq(r.bg, [244, 244, 242, 255], "the slide background, opaque"); t.eq(r.cropTop[3], 255);
      }
    },
    {
      name: "textMask(): every glyph disappears, backgrounds stay (the D4 contrast method)",
      async run(t) {
        const r = await t.page.evaluate(async () => {
          const deck = await CS.core.render.deck(CS_FIXTURES.mistakes, null, { slideIds: ["s01"] });
          const el = deck.slides[0].el, normal = await CS.paint.toCanvas(el, { scale: 0.5 }), masked = await CS.paint.textMask(el);
          const dark = (c) => { const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] < 60 && d[i + 1] < 60 && d[i + 2] < 60) n++; return n; };
          const small = document.createElement("canvas"); small.width = 540; small.height = 720; small.getContext("2d").drawImage(masked, 0, 0, 540, 720);
          const red = (c) => { const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 200 && d[i + 1] < 80) n++; return n; };
          const out = { darkNormal: dark(normal), darkMasked: dark(small), redNormal: red(normal), redMasked: red(small) };
          deck.dispose();
          return out;
        });
        t.gte(r.darkNormal, 3000, "the unmasked cover has dark glyph pixels"); t.eq(r.darkMasked, 0, "no dark glyph pixel survives in the mask");
        t.gte(r.redMasked, 200, "the highlight bar behind the text is still painted");
      }
    },
    {
      name: "prepare / inline: external images become data URIs byte for byte, caches clear",
      async run(t) {
        const r = await t.page.evaluate(async () => {
          const bytes = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));
          const url = URL.createObjectURL(new Blob([bytes], { type: "image/png" }));
          const root = document.createElement("div"); root.innerHTML = `<img src="${url}" alt=""><div style="background-image:url(${url})"></div>`;
          document.body.appendChild(root);
          await new Promise((r) => root.querySelector("img").complete ? r() : root.querySelector("img").addEventListener("load", r));
          const clone = root.cloneNode(true);
          await CS.paint.inline(clone);
          const src = clone.querySelector("img").getAttribute("src"), bg = clone.querySelector("div").getAttribute("style");
          const decoded = Uint8Array.from(atob(src.split(",")[1]), (c) => c.charCodeAt(0));
          root.remove(); CS.paint.clearCache();
          return { isData: /^data:image\/png;base64,/.test(src), same: decoded.length === bytes.length && decoded.every((v, i) => v === bytes[i]), bgData: /url\("data:image\/png/.test(bg) };
        });
        t.ok(r.isData, "img src is a data URI"); t.ok(r.same, "same bytes"); t.ok(r.bgData, "inline background url() as well");
      }
    }
  ]
};
