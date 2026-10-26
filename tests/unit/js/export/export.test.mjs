// cs-export: ZIP, PDF, text files, kit file lists, slides, the whole kit, save, automation.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const CTX = "{ brand: null, assets: () => null, sourceHtml: () => '<!doctype html><title>Studio</title>' }";
const ZIP_READER = `
  window.__readZip = function (u8) {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    let eocd = u8.length - 22; if (dv.getUint32(eocd, true) !== 0x06054B50) return { error: "no EOCD" };
    const count = dv.getUint16(eocd + 10, true), cdOff = dv.getUint32(eocd + 16, true), out = [];
    const crcTable = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c >>> 0; }
    let o = cdOff;
    for (let i = 0; i < count; i++) {
      if (dv.getUint32(o, true) !== 0x02014B50) return { error: "bad central header " + i };
      const flags = dv.getUint16(o + 8, true), method = dv.getUint16(o + 10, true), crc = dv.getUint32(o + 16, true), size = dv.getUint32(o + 24, true), nameLen = dv.getUint16(o + 28, true), local = dv.getUint32(o + 42, true);
      const name = new TextDecoder().decode(u8.subarray(o + 46, o + 46 + nameLen));
      const lh = local, lnl = dv.getUint16(lh + 26, true), lel = dv.getUint16(lh + 28, true), data = u8.subarray(lh + 30 + lnl + lel, lh + 30 + lnl + lel + size);
      let c = 0xFFFFFFFF; for (let k = 0; k < data.length; k++) c = crcTable[(c ^ data[k]) & 255] ^ (c >>> 8);
      out.push({ name, method, utf8: !!(flags & 0x800), size, dosTime: dv.getUint16(o + 12, true), dosDate: dv.getUint16(o + 14, true), crcOk: ((c ^ 0xFFFFFFFF) >>> 0) === crc, localSig: dv.getUint32(lh, true) === 0x04034B50 });
      o += 46 + nameLen;
    }
    return { count, entries: out };
  };`;

export default {
  module: "export",
  tests: [
    {
      name: "zip(): STORE entries, valid CRC-32, UTF-8 names (Arabic included), rooted at carousel-kit/, same bytes for the same input",
      async run(t) {
        await t.page.evaluate(ZIP_READER);
        const r = await t.page.evaluate(() => {
          const f = (path, text) => ({ path, name: path.split("/").pop(), mime: "text/plain", bytes: new TextEncoder().encode(text) });
          const files = [f("caption.txt", "غلاف يخلّي الناس تسحب."), f("3x4/02.png", "x".repeat(5000)), f("ملف.txt", ""), f("a/b/c.txt", "hello")];
          const date = new Date("2026-10-22T10:06:00Z"), z1 = CS.export.zip(files, { name: "k.zip", root: "carousel-kit", date }), z2 = CS.export.zip(files, { name: "k.zip", root: "carousel-kit", date });
          const flat = CS.export.zip(files.slice(0, 1), { name: "k.zip", root: "" });
          return { name: z1.name, mime: z1.mime, zip: window.__readZip(z1.bytes), same: z1.bytes.length === z2.bytes.length && z1.bytes.every((v, i) => v === z2.bytes[i]), flat: window.__readZip(flat.bytes).entries[0].name };
        });
        t.eq(r.name, "k.zip"); t.eq(r.mime, "application/zip"); t.eq(r.zip.count, 4);
        t.eq(r.zip.entries.map((e) => e.name), ["carousel-kit/caption.txt", "carousel-kit/3x4/02.png", "carousel-kit/ملف.txt", "carousel-kit/a/b/c.txt"]);
        t.ok(r.zip.entries.every((e) => e.method === 0 && e.utf8 && e.crcOk && e.localSig), "STORE, UTF-8 flag, CRC ok, local headers"); t.ok(r.same, "deterministic"); t.eq(r.flat, "caption.txt", "root: \"\" writes no folder");

        // the stamp comes from the UTC fields: a date object whose local fields say something else must not change the bytes
        const e0 = r.zip.entries[0];
        t.eq(e0.dosTime, (10 << 11) | (6 << 5) | 0, "DOS time is the UTC time of day"); t.eq(e0.dosDate, ((2026 - 1980) << 9) | (10 << 5) | 22, "DOS date is the UTC date");
        const skew = await t.page.evaluate(() => {
          const real = new Date("2026-10-22T23:30:10Z"), fake = { getUTCFullYear: () => real.getUTCFullYear(), getUTCMonth: () => real.getUTCMonth(), getUTCDate: () => real.getUTCDate(), getUTCHours: () => real.getUTCHours(), getUTCMinutes: () => real.getUTCMinutes(), getUTCSeconds: () => real.getUTCSeconds(),
            getFullYear: () => 1999, getMonth: () => 0, getDate: () => 1, getHours: () => 3, getMinutes: () => 3, getSeconds: () => 3 };
          const z = CS.export.zip([{ path: "a.txt", name: "a.txt", mime: "text/plain", bytes: new TextEncoder().encode("a") }], { name: "k.zip", root: "", date: fake });
          return window.__readZip(z.bytes).entries[0];
        });
        t.eq(skew.dosTime, (23 << 11) | (30 << 5) | 5, "local getters are not used"); t.eq(skew.dosDate, ((2026 - 1980) << 9) | (10 << 5) | 22);
      }
    },
    {
      name: "pdf(): one JPEG page per slide at the slide size, a UTF-16 Title, producer Carousel Studio, no author or dates, valid xref",
      async run(t) {
        const r = await t.page.evaluate(async () => {
          const deck = await CS.core.render.deck(CS_FIXTURES.mistakes, null, {});
          const files = [];
          for (const s of deck.slides) { const x = await CS.paint.raster(s.el, { type: "png" }); files.push({ path: `3x4/0${s.index + 1}.png`, name: "x.png", mime: "image/png", bytes: x.bytes }); }
          deck.dispose();
          const pdf = await CS.export.pdf(files, { title: "5 أخطاء بتموّت الكاروسيل" });
          const text = new TextDecoder("latin1").decode(pdf.bytes);
          const xrefAt = parseInt(/startxref\n(\d+)/.exec(text)[1], 10), xref = text.slice(xrefAt).split("\n"), n = parseInt(xref[1].split(" ")[1], 10), offsets = [];
          for (let i = 1; i < n; i++) offsets.push(parseInt(xref[2 + i].slice(0, 10), 10));
          const objectsAtOffsets = offsets.every((o, i) => text.slice(o, o + 12).startsWith(`${i + 1} 0 obj`));
          return { name: pdf.name, mime: pdf.mime, head: text.slice(0, 8), pages: (text.match(/\/Type \/Page /g) || []).length, count: /\/Count (\d+)/.exec(text)[1], media: Array.from(new Set(text.match(/\/MediaBox \[[^\]]+\]/g))), dct: (text.match(/\/DCTDecode/g) || []).length,
            title: /\/Title <FEFF([0-9A-F]+)>/.exec(text)[1].length / 4, producer: /\/Producer \(([^)]+)\)/.exec(text)[1], author: /\/Author|\/Creator|\/CreationDate|\/ModDate/.test(text), objectsAtOffsets, eof: text.trimEnd().endsWith("%%EOF") };
        });
        t.eq(r.name, "carousel.pdf"); t.eq(r.mime, "application/pdf"); t.eq(r.head, "%PDF-1.4"); t.eq([r.pages, r.count, r.dct], [4, "4", 4]); t.eq(r.media, ["/MediaBox [0 0 1080 1440]"]);
        t.eq(r.title, 24, "the Title is UTF-16 (24 characters)"); t.eq(r.producer, "Carousel Studio"); t.ok(!r.author, "no author, creator or dates"); t.ok(r.objectsAtOffsets, "every xref offset points at its object"); t.ok(r.eof);
      }
    },
    {
      name: "text files: caption, hashtags, slide captions and alt text (NN labels with Western digits), LF newlines, no BOM, no credit",
      async run(t) {
        const r = await t.page.evaluate(() => {
          const spec = CS_FIXTURES.counter, tx = CS.export.text, dec = (f) => new TextDecoder("utf-8", { fatal: true }).decode(f.bytes);
          const out = { caption: tx.caption(spec), tags: tx.hashtags(spec), per: tx.slideCaptions(spec), alt: tx.alt(spec) };
          const text = Object.fromEntries(Object.entries(out).map(([k, v]) => [k, dec(v)]));
          return { names: Object.values(out).map((f) => f.path), mime: Object.values(out).map((f) => f.mime), text, bom: Object.values(out).map((f) => f.bytes[0] === 0xEF), crlf: Object.values(text).some((s) => s.includes("\r")) };
        });
        t.eq(r.names, ["caption.txt", "hashtags.txt", "slide-captions.txt", "alt-text.txt"]); t.ok(r.mime.every((m) => m.startsWith("text/plain")));
        t.eq(r.text.caption, "غلاف يخلّي الناس تسحب.\nاعمل كاروسيل بالعربي من غير مصمم.\n\n1. غلاف واضح\n2. نص صغير يتقري\n\nاحفظ البوست.\n\n#كاروسيل #تصميم\n", "hook, keyword line, body, cta, tags");
        t.eq(r.text.tags, "#كاروسيل #تصميم\n"); t.eq(r.text.per.split("\n").slice(0, 2), ["01: الغلاف", "02: غلاف من غير وعد"], "NN labels"); t.eq(r.text.alt.split("\n")[0], "01: غلاف: العنوان الرئيسي");
        t.ok(!r.bom.some(Boolean), "no BOM"); t.ok(!r.crlf, "LF only");
      }
    },
    {
      name: "postingGuide(): dialect with fallback to msa-white and en, kit bullets only for files that exist, the video note only when skipped",
      async run(t) {
        const r = await t.page.evaluate(() => {
          const tx = CS.export.text, dec = (f) => new TextDecoder().decode(f.bytes);
          const eg = dec(tx.postingGuide("eg")), en = dec(tx.postingGuide("en")), gulf = dec(tx.postingGuide("gulf"));
          const some = dec(tx.postingGuide("eg", { present: ["3x4/01-cover.png", "caption.txt"], videoSkipped: true })), full = dec(tx.postingGuide("eg", { present: ["3x4/01-cover.mp4"], videoSkipped: false }));
          return { eg: eg.split("\n")[0], en: en.split("\n")[0], gulf: gulf.split("\n")[0], some, full, name: tx.postingGuide("eg").path };
        });
        t.eq(r.name, "posting-guide.md"); t.eq(r.eg, "# دليل النشر"); t.eq(r.en, "# Posting guide"); t.eq(r.gulf, "# دليل النشر", "gulf falls back to white MSA");
        t.ok(r.some.includes("`caption.txt`") && !r.some.includes("`carousel.pdf`"), "only existing files are listed"); t.ok(r.some.includes("صدّر الفيديو من الكمبيوتر"), "the video-missing note");
        t.ok(!r.full.includes("صدّر الفيديو من الكمبيوتر"), "no note when the video exists"); t.ok(/## 1\. /.test(r.some), "numbered cards");
      }
    },
    {
      name: "postingGuide(): with the real posting-guide.json every dialect gets its own text, and the AI-label card is the last card in all five when an asset is AI",
      async run(t) {
        const guide = JSON.parse(fs.readFileSync(path.join(repo, "plugins/carousel-studio/skills/carousel-design/data/posting-guide.json"), "utf8"));
        const r = await t.page.evaluate((guide) => {
          const tx = CS.export.text, dec = (f) => new TextDecoder().decode(f.bytes), out = {}, prev = CS.export.postingGuideData;
          CS.export.postingGuideData = guide;
          for (const d of ["eg", "gulf", "levant", "msa-white", "en"]) {
            const plain = dec(tx.postingGuide(d)), ai = dec(tx.postingGuide(d, { anyAi: true }));
            out[d] = { plain, ai, cards: (ai.match(/^## [0-9]+\. /gm) || []).length, plainCards: (plain.match(/^## [0-9]+\. /gm) || []).length };
          }
          out.usesAi = [tx.usesAi({ assets: [{ id: "a", aiGenerated: true }], slides: [] }), tx.usesAi({ assets: [], slides: [{ media: { ai: true } }] }), tx.usesAi({ assets: [{ id: "a", aiGenerated: false }], slides: [{ media: { ai: false } }] })];
          CS.export.postingGuideData = prev;
          return out;
        }, guide);
        for (const d of ["eg", "gulf", "levant", "msa-white", "en"]) {
          t.eq(r[d].plainCards, 4, d + ": four cards without AI"); t.eq(r[d].cards, 5, d + ": the AI-label card is the fifth");
          const lines = r[d].ai.split("\n"), at = lines.findIndex((l) => l.startsWith("## 5. "));
          t.eq(lines[at].slice(6), guide.aiLabel.title[d], d + ": card title"); t.ok(r[d].ai.includes(guide.aiLabel.body[d]), d + ": card body"); t.ok(!r[d].plain.includes(guide.aiLabel.body[d]), d + ": no card when nothing is AI");
        }
        t.ok(r.levant.plain.includes("slide-captions.txt") && !r.levant.plain.includes("بـ slide-captions.txt"), "levant: the prefix stays attached to the Latin file name");
        t.ok(r.gulf.plain !== r["msa-white"].plain && r.levant.plain !== r["msa-white"].plain, "gulf and levant have their own guide, not the white MSA fallback");
        t.eq(r.usesAi, [true, true, false], "usesAi: an AI asset or a slide marked AI");
      }
    },
    {
      name: "kitFiles(): the expected paths for carousels and single posts, with every option",
      async run(t) {
        const r = await t.page.evaluate(() => {
          const spec = CS_FIXTURES.counter, k = CS.export.kitFiles;
          const single = Object.assign({}, spec, { format: "single", slides: [spec.slides[0]] });
          const src = { source: true };
          return { full: k(spec), withSource: k(spec, src), sourceOnly: CS.export.sourceFiles(spec), sourceSingle: CS.export.sourceFiles(single), noVideo: k(spec, { video: false, source: true }), no45: k(spec, { variants4x5: false, pdf: false }),
            single: k(single, src), noMotion: k(Object.assign({}, spec, { cover: { motion: { recipe: "none" } } }), src), mp4Off: k(Object.assign({}, spec, { compat: { mp4: "off" } }), src) };
        });
        const light = ["3x4/01-cover.mp4", "3x4/01-cover.png", "3x4/02.png", "3x4/03.png", "3x4/04.png", "4x5/01-cover.mp4", "4x5/01-cover.jpg", "4x5/02.jpg", "4x5/03.jpg", "4x5/04.jpg",
          "caption.txt", "hashtags.txt", "slide-captions.txt", "alt-text.txt", "posting-guide.md", "carousel.pdf"];
        t.eq(r.full, light.concat(["qa-report.md", "qa-report.json"]), "the default kit is the light one: no spec, no composition, no Studio page");
        t.eq(r.withSource, light.concat(["spec.json", "cover.hf.html", "studio-source.html", "qa-report.md", "qa-report.json"]), "source: true adds the three source files before the QA report");
        t.eq(r.sourceOnly, ["spec.json", "cover.hf.html", "studio-source.html"]); t.eq(r.sourceSingle, ["spec.json", "studio-source.html"], "a single post has no cover composition");
        t.ok(!r.noVideo.some((p) => p.endsWith(".mp4"))); t.ok(r.noVideo.includes("cover.hf.html"), "the composition stays: it needs no encoder");
        t.eq(r.no45, ["3x4/01-cover.mp4", "3x4/01-cover.png", "3x4/02.png", "3x4/03.png", "3x4/04.png", "caption.txt", "hashtags.txt", "slide-captions.txt", "alt-text.txt", "posting-guide.md", "qa-report.md", "qa-report.json"]);
        t.eq(r.single.filter((p) => /^(3x4|4x5)\/post\./.test(p)), ["3x4/post.png", "4x5/post.jpg"]); t.ok(!r.single.some((p) => p.endsWith(".mp4") || p === "cover.hf.html"), "single posts have no video");
        t.ok(!r.noMotion.some((p) => p.endsWith(".mp4") || p === "cover.hf.html"), "motion none: no video and no composition"); t.ok(!r.mp4Off.some((p) => p.endsWith(".mp4")), "compat.mp4 off");
      }
    },
    {
      name: "source(): spec.json, the cover composition and the Studio page, with what could not be made listed as skipped",
      async run(t) {
        const r = await t.page.evaluate(async (ctx) => {
          const spec = CS_FIXTURES.counter, ctxx = eval("(" + ctx + ")"), full = await CS.export.source(spec, ctxx);
          const bare = await CS.export.source(spec, { brand: null, assets: () => null }), single = await CS.export.source(Object.assign({}, spec, { format: "single", slides: [spec.slides[0]] }), ctxx);
          const qa = CS.qa, seen = [];                                          // with check: true the files go through gate X1 first (the real gate is exercised by the Studio smoke test)
          CS.qa = { runExport: async (input, o) => { seen.push({ gates: o.gates, files: input.files.map((f) => f.path), expected: input.expected }); return window.__x1 || []; } };
          const checked = await CS.export.source(spec, ctxx, { check: true });
          window.__x1 = [{ sev: "BLOCK", rule: "X1.credit" }];
          let code = null, rules = null; try { await CS.export.source(spec, ctxx, { check: true }); } catch (e) { code = e.code; rules = e.detail && e.detail.rules; }
          const unchecked = await CS.export.source(spec, ctxx);
          CS.qa = qa;
          return { full: full.files.map((f) => [f.path, f.mime, f.bytes.length > 0]), skipped: full.skipped, bare: { files: bare.files.map((f) => f.path), skipped: bare.skipped.map((s) => s.path) }, single: single.files.map((f) => f.path),
            x1: { seen: seen[0], again: seen.length, ok: checked.files.length, code, rules, unchecked: unchecked.files.length } };
        }, CTX);
        t.eq(r.full, [["spec.json", "application/json", true], ["cover.hf.html", "text/html;charset=utf-8", true], ["studio-source.html", "text/html;charset=utf-8", true]]); t.eq(r.skipped, []);
        t.eq(r.bare, { files: ["spec.json", "cover.hf.html"], skipped: ["studio-source.html"] }, "no Studio page to serialise: listed, not silently dropped"); t.eq(r.single, ["spec.json", "studio-source.html"]);
        t.eq(r.x1.seen, { gates: ["X1"], files: ["spec.json", "cover.hf.html", "studio-source.html"], expected: [] }, "check: true runs only gate X1, on the three files, with no kit completeness to judge"); t.eq(r.x1.ok, 3);
        t.eq([r.x1.code, r.x1.rules], ["E_QA_BLOCK", ["X1.credit"]], "a BLOCK refuses the export"); t.eq(r.x1.again, 2, "without check the gate is not run (a kit's own QA covers its files)"); t.eq(r.x1.unchecked, 3);
      }
    },
    {
      name: "slides(): PNG 3x4 and JPEG 4x5 files named like the kit, `only` selects slides, progress is reported",
      async run(t) {
        const r = await t.page.evaluate(async (ctx) => {
          const spec = CS_FIXTURES.counter, ctxx = eval("(" + ctx + ")"), prog = [];
          const png = await CS.export.slides(spec, ctxx, { format: "png", onProgress: (p) => prog.push(p.done + "/" + p.total) });
          const jpg = await CS.export.slides(spec, ctxx, { format: "jpeg4x5", only: ["s02"] });
          const single = await CS.export.slides(Object.assign({}, spec, { format: "single", slides: [spec.slides[0]] }), ctxx, { format: "png" });
          return { png: png.map((f) => [f.path, f.w, f.h, f.mime]), jpg: jpg.map((f) => [f.path, f.w, f.h, f.mime, f.bytes[0], f.bytes[1]]), single: single.map((f) => f.path), prog };
        }, CTX);
        t.eq(r.png.map((x) => x[0]), ["3x4/01-cover.png", "3x4/02.png", "3x4/03.png", "3x4/04.png"]); t.ok(r.png.every((x) => x[1] === 1080 && x[2] === 1440 && x[3] === "image/png"));
        t.eq(r.jpg, [["4x5/02.jpg", 1080, 1350, "image/jpeg", 255, 216]]); t.eq(r.single, ["3x4/post.png"]); t.eq(r.prog, ["1/4", "2/4", "3/4", "4/4"]);
      }
    },
    {
      name: "cover(): an MP4 at 1080x1440 (or 1080x1350), refused with a clear code for external plates and motion none",
      async run(t) {
        const sup = await t.page.evaluate(() => CS.export.mp4.support(1080, 1440, 30));
        if (!sup.supported) t.skip("no H.264 encoder");
        const r = await t.page.evaluate(async (ctx) => {
          const spec = CS_FIXTURES.counter, ctxx = eval("(" + ctx + ")");
          const a = await CS.export.cover(spec, ctxx), b = await CS.export.cover(spec, ctxx, { variant: "4x5" });
          const err = async (s) => { try { await CS.export.cover(s, ctxx); return null; } catch (e) { return e.code + ":" + (e.detail && e.detail.reason); } };
          const external = await err(Object.assign({}, spec, { cover: { motion: { recipe: "story", source: "external" } } })), none = await err(Object.assign({}, spec, { cover: { motion: { recipe: "none" } } }));
          return { a: [a.path, a.w, a.h, a.mime, a.bytes.length > 1e5], b: [b.path, b.w, b.h], external, none };
        }, CTX);
        t.eq(r.a, ["3x4/01-cover.mp4", 1080, 1440, "video/mp4", true]); t.eq(r.b, ["4x5/01-cover.mp4", 1080, 1350]); t.eq(r.external, "E_NO_CAPABILITY:external-plate"); t.eq(r.none, "E_NO_CAPABILITY:motion-off");
      }
    },
    {
      name: "kit(): the files match kitFiles (minus what is reported as skipped), the ZIP is complete, nothing carries a credit, the video loop is measured",
      async run(t) {
        await t.page.evaluate(ZIP_READER);
        const r = await t.page.evaluate(async (ctx) => {
          const spec = CS_FIXTURES.mistakes, ctxx = eval("(" + ctx + ")"), steps = [];
          const kit = await CS.export.kit(spec, ctxx, { video: false, onProgress: (p) => { if (p.job === "kit") steps.push(p.label); } });
          const heavy = await CS.export.kit(spec, ctxx, { video: false, source: true, zip: false });
          const paths = kit.files.map((f) => f.path), expected = CS.export.kitFiles(spec, { video: false }).filter((p) => !/^qa-report/.test(p));
          const zip = window.__readZip(kit.zip.bytes);
          const needles = ["محمد عبده", "mohamedabdou", "Mohamed Abdou", "mohamed.abdou", "data-cs-credit"];
          const hits = kit.files.filter((f) => /\.(txt|md|json|html)$/.test(f.path)).filter((f) => needles.some((n) => new TextDecoder().decode(f.bytes).includes(n))).map((f) => f.path);
          const second = await CS.export.kit(spec, ctxx, { video: false });
          const same = kit.zip.bytes.length === second.zip.bytes.length && kit.zip.bytes.every((v, i) => v === second.zip.bytes[i]);
          const text = (k, path) => new TextDecoder().decode(k.files.find((f) => f.path === path).bytes);
          const hf = text(heavy, "cover.hf.html");
          return { paths, expected, skipped: kit.skipped, zip: zip.entries.map((e) => [e.name, e.crcOk]), zipName: kit.zip.name, steps, hits, same,
            lightBytes: kit.zip.bytes.length, sourceNames: ["spec.json", "cover.hf.html", "studio-source.html"].filter((p) => paths.includes(p)),
            heavyPaths: heavy.files.map((f) => f.path), heavyExpected: CS.export.kitFiles(spec, { video: false, source: true }).filter((p) => !/^qa-report/.test(p)), heavySkipped: heavy.skipped.map((s) => s.path),
            spec: JSON.parse(text(heavy, "spec.json")).id, studio: text(heavy, "studio-source.html").slice(0, 15), hf: hf.slice(0, 15),
            hfHeader: (/<!--([^]*?)-->/.exec(hf.slice(0, 2000)) || [])[1] || "", hfFamilies: Array.from(new Set(Array.from(hf.matchAll(/font-family:\s*"([^"]+)"/g), (m) => m[1]))) };
        }, CTX);
        t.eq(r.paths, r.expected, "kit files in kitFiles order"); t.eq(r.skipped.map((s) => s.path), ["qa-report.md", "qa-report.json"], "only the QA report is missing (the QA module is a test double here)");
        t.eq(r.zipName, "fx-mistakes-kit.zip"); t.eq(r.zip.map((z) => z[0]), r.expected.map((p) => "carousel-kit/" + p)); t.ok(r.zip.every((z) => z[1]), "every entry's CRC");
        t.eq(r.hits, [], "no credit or owner name in any text file"); t.ok(r.same, "the ZIP is byte-identical when nothing in it changed (no timestamps from the clock)");
        t.eq(r.sourceNames, [], "the default kit leaves the source files out"); t.ok(r.steps.includes("slides") && r.steps.includes("zip"));
        t.eq(r.heavyPaths, r.heavyExpected, "with source: true the kit holds the spec, the composition and the Studio page"); t.eq(r.heavySkipped.filter((p) => !/^qa-report/.test(p)), []);
        t.eq(r.spec, "fx-mistakes"); t.eq(r.hf, "<!doctype html>", "cover.hf.html is a full document"); t.eq(r.studio, "<!doctype html>");
        t.ok(/Apache-2\.0/.test(r.hfHeader) && /SIL Open Font License 1\.1/.test(r.hfHeader) && /HyperFrames/.test(r.hfHeader), "cover.hf.html opens with its licence header: Apache-2.0, the SIL Open Font License 1.1 for the fonts, the HyperFrames format");
        t.ok(r.hfFamilies.length > 0 && r.hfFamilies.every((f) => r.hfHeader.includes(f)), "the header names every font family the file embeds: " + r.hfFamilies.join(", "));
        t.ok(r.lightBytes > 0 && r.lightBytes < 4 * 1024 * 1024, "the light kit without video is far below the 4 MB target: " + r.lightBytes);
      }
    },
    {
      name: "kit(): with video it carries 3x4 and 4x5 MP4s that loop on the poster, and falls back to a skipped entry when the cover is external",
      async run(t) {
        const sup = await t.page.evaluate(() => CS.export.mp4.support(1080, 1440, 30));
        if (!sup.supported) t.skip("no H.264 encoder");
        const r = await t.page.evaluate(async (ctx) => {
          const ctxx = eval("(" + ctx + ")");
          const seenAll = []; const qa = CS.qa; CS.qa = { run: async (input) => { seenAll.push({ video: input.video, expected: input.expected, skipped: input.skipped, files: input.files.map((f) => f.path) }); return { status: "pass", counts: { block: 0, fix: 0, note: 0 }, exitCode: 0, results: [], schemaVersion: 1 }; }, report: { toMarkdown: () => "# report\n" } };
          const kit = await CS.export.kit(CS_FIXTURES.mistakes, ctxx, { dialect: "eg" });
          const ext = await CS.export.kit(Object.assign({}, CS_FIXTURES.mistakes, { cover: { motion: { recipe: "story", source: "external" } } }), ctxx, { video: true, variants4x5: false, pdf: false });
          CS.qa = qa;
          return { paths: kit.files.map((f) => f.path), seen: seenAll[0], ext: { skipped: ext.skipped, mp4: ext.files.filter((f) => /mp4$/.test(f.path)).length, guide: new TextDecoder().decode(ext.files.find((f) => f.path === "posting-guide.md").bytes).includes("صدّر الفيديو") }, report: !!kit.report };
        }, CTX);
        t.ok(r.paths.includes("3x4/01-cover.mp4") && r.paths.includes("4x5/01-cover.mp4") && r.paths.includes("qa-report.md") && r.paths.includes("qa-report.json"), "videos and QA reports in the kit");
        const infos = r.seen.video, a = infos.find((v) => v.file === "3x4/01-cover.mp4"), b = infos.find((v) => v.file === "4x5/01-cover.mp4");
        for (const [v, name] of [[a, "3x4"], [b, "4x5"]]) {
          t.eq(v.loop.frame0VsPoster, { ssim: 1, psnr: 100 }, name + ": frame 0 is the poster before encoding"); t.eq(v.loop.lastVsFrame0, { ssim: 1, psnr: 100 }, name + ": the last frame is frame 0");
          t.eq(v.blankFrames, 0, name + ": no blank frame"); t.lte(v.flashesPerSecondMax, 3, name + ": flashes"); t.eq(v.audio, "none");
          t.eq([v.pixFmt, v.range, v.level], ["yuv420p", "tv", 40], name + ": the file's own headers say 8-bit 4:2:0, limited range, level 4.0");
          t.eq(v.colour, { primaries: "bt709", transfer: "bt709", matrix: "bt709" }, name + ": tagged BT.709");
        }
        t.eq(r.seen.skipped, []); t.ok(!r.seen.expected.some((p) => /^qa-report/.test(p)), "the QA report files are not 'expected' by the report that creates them");
        t.eq(r.ext.skipped.map((s) => s.path), ["3x4/01-cover.mp4"], "an external motion plate is rendered in Claude Code: the Studio lists the video as skipped"); t.eq(r.ext.mp4, 0);
        t.ok(r.ext.guide, "the posting guide carries the «export the video from a computer» note");
      }
    },
    {
      name: "save(anchor): every file is offered as a download with its own name; a declined or failing save is reported, not thrown",
      async run(t) {
        const downloads = [];
        t.page.on("download", (d) => downloads.push(d.suggestedFilename()));
        const r = await t.page.evaluate(async () => {
          const f = (name, text) => ({ path: name, name, mime: "text/plain", bytes: new TextEncoder().encode(text) });
          const res = await CS.export.save([f("a.txt", "A"), f("b.txt", "B")], { mode: "anchor" });
          const none = await CS.export.save([], { mode: "auto" });
          const share = await CS.export.save([f("c.txt", "C")], { mode: "share" });
          return { res, none, share };
        });
        await t.page.waitForTimeout(600);
        t.eq(r.res, { mode: "anchor", saved: ["a.txt", "b.txt"], declined: [], failed: [] }); t.eq(downloads.sort(), ["a.txt", "b.txt"]); t.eq(r.none, { mode: "downloads", saved: [], declined: [], failed: [] });
        t.eq(r.share.mode, "share"); t.eq(r.share.saved.length + r.share.declined.length + r.share.failed.length, 1, "mode share reports its outcome instead of throwing");
      }
    },
    {
      name: "save(downloads capability): one ZIP above three files, files one by one when archives are not enabled, `declined` is not an error",
      async run(t) {
        const r = await t.page.evaluate(async () => {
          const f = (name) => ({ path: name, name, mime: "text/plain", bytes: new TextEncoder().encode(name) });
          const files = ["1.txt", "2.txt", "3.txt", "4.txt"].map(f), calls = [];
          window.claude = { use: async () => ({ save: async ({ filename }) => { calls.push(filename); if (window.__mode === "noZip" && filename.endsWith(".zip")) throw Object.assign(new Error("x"), { code: "extension_not_enabled" }); if (window.__mode === "declined") return { status: "declined" }; return { status: "saved" }; } }) };
          const out = {};
          window.__mode = "ok"; out.zip = { res: await CS.export.save(files, { mode: "auto" }), calls: calls.splice(0) };
          return out;
        });
        t.eq(r.zip.calls, ["carousel-kit.zip"], "more than three files go as one archive"); t.eq(r.zip.res.mode, "downloads"); t.eq(r.zip.res.saved.length, 4);
        const r2 = await (await t.open("harness.html")).evaluate(async () => {
          const f = (name) => ({ path: name, name, mime: "text/plain", bytes: new TextEncoder().encode(name) }), files = ["1.txt", "2.txt", "3.txt", "4.txt"].map(f), calls = [];
          window.claude = { use: async () => ({ save: async ({ filename }) => { calls.push(filename); if (filename.endsWith(".zip")) throw Object.assign(new Error("x"), { code: "extension_not_enabled" }); return { status: "saved" }; } }) };
          return { res: await CS.export.save(files, { mode: "downloads" }), calls };
        });
        t.eq(r2.calls, ["carousel-kit.zip", "1.txt", "2.txt", "3.txt", "4.txt"], "extension_not_enabled falls back to files one by one"); t.eq(r2.res.saved.length, 4);
        const r3 = await (await t.open("harness.html")).evaluate(async () => {
          window.claude = { use: async () => ({ save: async () => ({ status: "declined" }) }) };
          return CS.export.save([{ path: "a.txt", name: "a.txt", mime: "text/plain", bytes: new Uint8Array(1) }], { mode: "auto" });
        });
        t.eq(r3, { mode: "downloads", saved: [], declined: ["a.txt"], failed: [] });
      }
    },
    {
      name: "capabilities(): reports the painter, H.264 and sharing support without making a network request",
      async run(t) {
        const requests = [];
        t.page.on("request", (rq) => { if (!rq.url().startsWith("http://127.0.0.1") && !rq.url().startsWith("data:") && !rq.url().startsWith("blob:")) requests.push(rq.url()); });
        const r = await t.page.evaluate(() => CS.export.capabilities());
        t.eq(Object.keys(r).sort(), ["downloads", "h264", "mediabunny", "painter", "videoEncoder", "webShare", "webShareFiles"]); t.eq(r.painter, "svg"); t.eq(typeof r.h264, "boolean"); t.eq(requests, [], "no request");
      }
    },
    {
      name: "CS.automation: only active with ?automation=1; exportAll returns the kit in memory and readChunk streams it in slices",
      async run(t) {
        const plain = await t.page.evaluate(() => typeof CS.automation);
        t.eq(plain, "undefined", "a normal page has no automation hook");
        const page = await t.open("studio-counter.html", "?automation=1");
        const r = await page.evaluate(async () => {
          await CS.automation.ready;
          const first = await CS.automation.exportAll({ video: false, zip: true });
          const total = first.files.find((f) => /-kit\.zip$/.test(f.path)), slices = [];
          for (let off = 0; off < total.bytes; off += 100000) slices.push(await CS.automation.readChunk(total.path, off, 100000));
          const parts = slices.map((b) => Uint8Array.from(atob(b), (c) => c.charCodeAt(0))), u8 = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let at = 0; parts.forEach((p) => { u8.set(p, at); at += p.length; });
          let bad = null; try { await CS.automation.readChunk("nope.txt", 0, 1); } catch (e) { bad = e.code; }
          const comp = await CS.automation.composition({ variant: "4x5" });
          return { ok: first.ok, n: first.files.length, mem: window.__csFiles instanceof Map && window.__csFiles.size === first.files.length, zipHead: Array.from(u8.slice(0, 4)), sizeOk: u8.length === total.bytes, bad, comp: { html: comp.html.includes('data-height="1350"'), seconds: comp.seconds, frames: comp.frames, recipe: comp.recipe, poster: comp.posterBase64.slice(0, 8) } };
        });
        t.ok(r.ok); t.gte(r.n, 15); t.ok(r.mem, "bytes are kept in window.__csFiles"); t.eq(r.zipHead, [0x50, 0x4B, 3, 4]); t.ok(r.sizeOk, "slices add up to the file size"); t.eq(r.bad, "E_USAGE");
        t.ok(r.comp.html && r.comp.seconds === 6 && r.comp.frames === 180, "composition for the 4:5 variant"); t.eq(r.comp.poster, "iVBORw0K", "the poster is a PNG");
      }
    }
  ]
};
