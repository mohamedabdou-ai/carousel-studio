// cs-export, round 3 (package F1): the licence comment of the icon sets in HTML and SVG exports (owner decision 5, spec 10.5).
// The ISC and MIT licences of Lucide, Feather and Tabler ask that their notice travels with copies of the icons. An HTML or SVG export holds
// the path data, so it ends with one comment line; a PNG, JPEG, PDF or MP4 is a picture and carries nothing. It is a notice and not a credit:
// no owner name, no handle, no link, so gate X1 and the "no credit in any exported file" rule stay as they are.
// Run by node tests/video/run.mjs (module "export-licence", on the harness page) and on its own by `node tests/unit/js/export/licence.test.mjs`
// (a bare page with privately built cs-paint and cs-export, see tests/parity/lib/barepage.mjs).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isMain, runAsNodeTests } from "../../../parity/lib/barepage.mjs";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const NOTICE = "icons: Lucide ISC / Feather MIT / Tabler MIT, see NOTICE";
const COMMENT = "<" + "!-- " + NOTICE + " -->";
const CTX = "{ brand: null, assets: () => null, sourceHtml: () => '<!doctype html><html lang=\"ar\" dir=\"rtl\"><head><meta charset=\"utf-8\"><title>Studio</title></head><body><p>مرحبا <bdi dir=\"ltr\">abc</bdi></p></body></html>' }";

/** The X1 credit needles of qa-rules.json (stored as code points), folded the way gate X1 folds a file. */
function creditNeedles() {
  const file = path.join(repo, "plugins/carousel-studio/skills/carousel-design/data/qa-rules.json");
  const find = (o) => { if (o && typeof o === "object") { if (o.id === "X1.credit" && o.params) return o; for (const v of Object.values(o)) { const r = find(v); if (r) return r; } } return null; };
  const rule = find(JSON.parse(fs.readFileSync(file, "utf8")));
  if (!rule) return null;
  const fold = (s) => String(s).normalize("NFC").toLowerCase().replace(/ـ/g, "").replace(/[^\p{L}\p{N}]+/gu, "");
  const all = [].concat(rule.params.lines || [], rule.params.names || [], rule.params.brands || []);
  return { fold, needles: all.map((n) => fold(String.fromCodePoint.apply(null, n.cp))).filter(Boolean) };
}

const mod = {
  module: "export-licence",
  tests: [
    {
      name: "text.file(): an HTML or SVG file ends with the licence comment, once; text, markdown, JSON and the rest never get it; the start of the file is untouched",
      async run(t) {
        const r = await t.page.evaluate(({ NOTICE }) => {
          const dec = (f) => new TextDecoder().decode(f.bytes), count = (s) => s.split(NOTICE).length - 1, T = CS.export.text;
          const html = '<!doctype html>\n<html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>x</title></head><body><p>أهلا <bdi dir="ltr">12</bdi></p></body></html>';
          const svg = '<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M3 3h18v18H3z"/></svg>\n';
          const out = { mime: T.file("a.svg", svg).mime, htmlMime: T.file("a.html", html).mime, files: {} };
          for (const [name, body] of [["a.html", html], ["page.HTM", html], ["icon.svg", svg], ["Big.SVG", svg], ["a.txt", html], ["a.md", html], ["a.json", "{}"], ["a.csv", "a,b"], ["notes.html.txt", html], ["a.svgz", svg], ["noext", html], ["a.mp4", "x"], ["a.png", "x"], ["a.pdf", "x"], ["a.jpg", "x"]]) {
            const f = T.file(name, body), text = dec(f);
            out.files[name] = { count: count(text), startsWith: text.startsWith(body.replace(/\n$/, "")), endsWithComment: text.endsWith("<" + "!-- " + NOTICE + " -->\n"), trailing: text.endsWith("\n") && !text.endsWith("\n\n"), crlf: text.includes("\r") };
          }
          const again = dec(T.file("again.html", dec(T.file("a.html", html))));       // a body that already holds the notice is not given a second one
          out.again = count(again);
          const parsed = new DOMParser().parseFromString(dec(T.file("icon.svg", svg)), "image/svg+xml");
          out.svgOk = !parsed.querySelector("parsererror") && parsed.documentElement.nodeName === "svg";
          out.xmlFirst = dec(T.file("icon.svg", svg)).startsWith("<?xml");
          const doc = new DOMParser().parseFromString(dec(T.file("a.html", html)), "text/html");
          out.htmlBody = doc.body.textContent.includes("أهلا") && !doc.body.textContent.includes("icons:");
          out.notice = T.licenceNotice;
          return out;
        }, { NOTICE });
        t.eq(r.notice, NOTICE, "the exact line of owner decision 5");
        t.eq(r.mime, "image/svg+xml"); t.eq(r.htmlMime, "text/html;charset=utf-8");
        for (const name of ["a.html", "page.HTM", "icon.svg", "Big.SVG"]) {
          const f = r.files[name];
          t.eq([f.count, f.endsWithComment, f.trailing, f.startsWith, f.crlf], [1, true, true, true, false], `${name}: one notice, as the last line, one final newline, the body first`);
        }
        for (const name of ["a.txt", "a.md", "a.json", "a.csv", "notes.html.txt", "a.svgz", "noext", "a.mp4", "a.png", "a.pdf", "a.jpg"]) t.eq(r.files[name].count, 0, `${name}: no notice (only .html, .htm and .svg)`);
        t.eq(r.again, 1, "idempotent"); t.ok(r.svgOk && r.xmlFirst, "the SVG is still valid XML and keeps its declaration first"); t.ok(r.htmlBody, "the comment is not page text");
      }
    },
    {
      name: "the notice is a notice, not a credit: no name, handle or link, and nothing gate X1 looks for",
      needsPage: false,
      async run(t) {
        t.ok(NOTICE.length <= 70, "short: " + NOTICE.length);
        t.ok(!/mohamed|mohammed|abdou|abdo\b|pyra|محمد|عبده|عبدو|@|https?:|www\.|\.com|\.dev|\.io/i.test(NOTICE), "no owner name, handle, domain or link");
        t.ok(!/--/.test(NOTICE), "legal inside an HTML comment (no double hyphen)");
        const x1 = creditNeedles();
        if (!x1) t.skip("qa-rules.json has no X1.credit rule to read the needles from");
        t.ok(x1.needles.length >= 5, "read the X1 needles: " + x1.needles.length);
        const hits = x1.needles.filter((n) => x1.fold(COMMENT).includes(n));
        t.eq(hits, [], "no X1.credit needle appears in the comment");
        t.ok(!/data-cs-credit/.test(COMMENT) && !/\bcredit\b/i.test(COMMENT), "nothing the credit-markup check looks for");
      }
    },
    {
      name: "source(): studio-source.html ends with the notice after its doctype, spec.json has none; a PNG and a PDF carry none",
      async run(t) {
        const r = await t.page.evaluate(async ({ ctx, NOTICE }) => {
          const ctxx = eval("(" + ctx + ")"), dec = (b) => new TextDecoder("latin1").decode(b), has = (b) => dec(b).includes(NOTICE);
          const spec = { id: "fx-licence", specVersion: 1, format: "single", slides: [{ id: "s01", type: "cover" }], cover: { motion: { recipe: "none" } } };
          const src = await CS.export.source(spec, ctxx), byPath = Object.fromEntries(src.files.map((f) => [f.path, f]));
          const html = new TextDecoder().decode(byPath["studio-source.html"].bytes), json = new TextDecoder().decode(byPath["spec.json"].bytes);
          const el = document.createElement("div");
          el.style.cssText = "position:absolute;left:0;top:0;width:1080px;height:1440px;background:#f4f4f2";
          document.body.appendChild(el);
          let png, pdf;
          try {
            png = await CS.paint.raster(el, { type: "png", paintScale: 1 });
            pdf = await CS.export.pdf([{ path: "3x4/01.png", name: "01.png", mime: "image/png", bytes: png.bytes }]);
          } finally { el.remove(); }
          return { paths: src.files.map((f) => f.path), htmlStart: html.slice(0, 15), htmlEnd: html.endsWith("\n" + "<" + "!-- " + NOTICE + " -->\n"), htmlCount: html.split(NOTICE).length - 1, htmlMime: byPath["studio-source.html"].mime, jsonHas: json.includes(NOTICE), pngHas: has(png.bytes), pdfHas: has(pdf.bytes), pngSig: Array.from(png.bytes.slice(0, 4)), pdfHead: dec(pdf.bytes.slice(0, 5)) };
        }, { ctx: CTX, NOTICE });
        t.eq(r.paths, ["spec.json", "studio-source.html"]); t.eq(r.htmlStart, "<!doctype html>", "the doctype is still first");
        t.eq([r.htmlCount, r.htmlEnd, r.htmlMime], [1, true, "text/html;charset=utf-8"]); t.ok(!r.jsonHas, "spec.json carries no notice");
        t.eq(r.pngSig, [137, 80, 78, 71]); t.eq(r.pdfHead, "%PDF-"); t.ok(!r.pngHas && !r.pdfHas, "no notice in the PNG or the PDF");
      }
    },
    {
      name: "kit(source: true): cover.hf.html keeps its own licence header first and gets the notice last, the Studio page too; the light kit's binary files carry none",
      async run(t) {
        const r = await t.page.evaluate(async ({ ctx, NOTICE }) => {
          if (typeof CS_FIXTURES === "undefined" || !CS.core || !CS.core.render) return null;
          const ctxx = eval("(" + ctx + ")"), dec = (f) => new TextDecoder().decode(f.bytes), has = (f) => new TextDecoder("latin1").decode(f.bytes).includes(NOTICE);
          const spec = CS_FIXTURES.mistakes, heavy = await CS.export.kit(spec, ctxx, { video: false, source: true, zip: false }), light = await CS.export.kit(spec, ctxx, { video: false });
          const get = (kit, p) => kit.files.find((f) => f.path === p), hf = dec(get(heavy, "cover.hf.html")), studio = dec(get(heavy, "studio-source.html"));
          const end = "\n" + "<" + "!-- " + NOTICE + " -->\n";
          return { hfStart: hf.slice(0, 15), hfEnd: hf.endsWith(end), hfCount: hf.split(NOTICE).length - 1, firstComment: (/<!--([^]*?)-->/.exec(hf.slice(0, 2000)) || [])[1] || "", studioEnd: studio.endsWith(end), studioCount: studio.split(NOTICE).length - 1,
            textHas: light.files.filter((f) => /\.(txt|md|json)$/.test(f.path)).filter(has).map((f) => f.path), binHas: light.files.filter((f) => /\.(png|jpg|pdf)$/.test(f.path)).filter(has).map((f) => f.path), zipHas: has(light.zip), nBin: light.files.filter((f) => /\.(png|jpg|pdf)$/.test(f.path)).length };
        }, { ctx: CTX, NOTICE });
        if (!r) t.skip("needs the harness page of tests/video (fixtures and the stub core)");
        t.eq(r.hfStart, "<!doctype html>"); t.eq([r.hfCount, r.hfEnd, r.studioCount, r.studioEnd], [1, true, 1, true]);
        t.ok(/Apache-2\.0/.test(r.firstComment) && !r.firstComment.includes("Lucide"), "the first comment of cover.hf.html is still its own licence header");
        t.eq(r.textHas, [], "no notice in text, markdown or JSON files"); t.eq(r.binHas, [], "none in PNG, JPEG or PDF"); t.ok(r.nBin > 0); t.ok(!r.zipHas, "nor in the ZIP's own bytes (STORE entries of text and pictures that hold none)");
      }
    }
  ]
};

export default mod;

if (isMain(import.meta.url)) await runAsNodeTests(mod, { modules: ["paint", "export"] });
