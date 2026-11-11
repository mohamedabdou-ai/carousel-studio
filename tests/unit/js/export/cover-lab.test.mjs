import fs from "node:fs";
import path from "node:path";
import * as render from "../../../../plugins/carousel-studio/skills/carousel-design/scripts/render.mjs";
import { openGeometryPage } from "../../../geometry/page.mjs";

const skill = "plugins/carousel-studio/skills/carousel-design";
const spec = () => JSON.parse(fs.readFileSync("tests/fixtures/spec.eg.8slides.json", "utf8"));
async function realPage() {
  const h = await openGeometryPage();
  for (const name of ["paint", "motion", "hf"]) await h.page.addScriptTag({ content: fs.readFileSync(path.join(skill, "runtime/cs-" + name + ".js"), "utf8") });
  return h;
}

export default {
  module: "cover-lab",
  tests: [
    {
      name: "candidate input, mode isolation and scalar range guidance",
      async run(t) {
        const o = render.parseArgs(["--covers", "hooks.json", "--spec", "post.json", "--out", "lab", "--presets", "all"]);
        t.eq(o.coversFile, "hooks.json");
        t.ok(typeof render.validate === "function", "mode validation is testable");
        render.validate(o);
        for (const extra of [["--save-plan"], ["--preflight"], ["--style-sheet"], ["--contact-sheet"]]) {
          let error;
          try { render.validate(render.parseArgs(["--covers", "hooks.json", "--spec", "post.json", "--out", "lab", ...extra])); } catch (e) { error = e; }
          t.eq(error?.exit, 64, extra.join(" ") + " cannot mutate or export from the lab");
        }
        t.eq(render.coverCandidates([{ headline: "فكرة جديدة", sub: "خطوة عملية" }])[0].headline, "فكرة جديدة");
        for (const input of [[], [{ headline: " " }], [{ headline: 4 }], [{ headline: "جديد", sub: null }], [{ headline: "جديد", surprise: "x" }]]) {
          let error; try { render.coverCandidates(input); } catch (e) { error = e; }
          t.eq(error?.exit, 2, "bad candidates are data errors");
        }
        const s = spec(); s.style.overrides = { "type.scale.hero": [120, 150] };
        let error; try { render.checkCoverControls(s); } catch (e) { error = e; }
        t.eq(error?.exit, 2); t.ok(error.message.includes('"120,150"'), "range error names the working string form");
      }
    },
    {
      name: "lab ranks rendered covers, reports the real empty band, draws only a sheet and never changes inputs",
      async run(t) {
        const h = await realPage(), s = spec(), before = JSON.stringify(s);
        try {
          const covers = [{ headline: "أفكار جديدة للعمل" }, { headline: "منتجك ثابت؟\nحرّكه في ChatGPT", sub: "خطوة جديدة" }];
          const result = await render.coverLab(h.page, s, null, { mode: "covers", presets: ["creator", "poster"], candidates: covers });
          t.eq(result.rows.length, 4); t.eq(JSON.stringify(s), before);
          t.eq(result.ranking.length, 4); t.eq(result.rows.map(r => r.rank).sort(), [1, 2, 3, 4]);
          for (const r of result.rows) {
            t.ok(!r.error, JSON.stringify(r)); t.gte(r.hero130Px, 0); t.gte(r.lines, 1);
            t.ok(Number.isFinite(r.headlineWidthRatio) && Number.isFinite(r.deadZonePct), "physical metrics");
            t.ok(r.findings.every(f => f.rule && f.sev && f.msg && f.fix !== undefined), "complete findings including notes and fixes");
          }
          const bytes = Buffer.from(result.image, "base64"); t.eq([...bytes.subarray(1, 4)], [80, 78, 71]);
          const beat = await render.coverLab(h.page, s, null, { mode: "covers", presets: ["creator"], candidates: [{ headline: "Atlas يراجع… وأنت تتخذ ==القرار==" }] });
          t.ok(beat.rows[0].arrangement.movedSecondBeat, "a smaller second beat can grow the hero");
          t.ok(!beat.rows[0].findings.some(f => f.rule === "C2.text-dropped"), "a preview beat is checked against its arranged fields");
          const fields = beat.rows[0].arrangement.fields;
          t.ok((fields.headline + (fields.sub || "")).includes("==القرار=="), "saving the arrangement keeps emphasis");
          const approved = await h.page.evaluate(async ({ s, fields }) => {
            s.style = { presetId: "creator@1.0" }; for (const k of ["headline", "sub", "kicker"]) delete s.slides[0][k]; Object.assign(s.slides[0], fields); delete s.frozen;
            const deck = await CS.core.render.deck(s, null, { mode: "export", useFrozen: false, slideIds: [s.slides[0].id] });
            s.frozen = CS.core.freeze.capture(deck.slides, s, deck.tokens);
            const valid = CS.core.freeze.verify(s, deck.tokens); deck.dispose(); return valid;
          }, { s, fields });
          t.ok(approved.ok, "the accepted fields freeze without text drift: " + JSON.stringify(approved));
          const sheet = await render.coverLab(h.page, s, null, { mode: "style-sheet", presets: ["all"] });
          t.eq(sheet.rows.map(r => r.preset).sort(), ["creator", "notebook", "poster"]);
          t.ok(sheet.rows.every(r => r.previewSlides.length === 2), "both actual slides per style");
          t.ok(sheet.image.length > 1000, "labelled picture returned");
        } finally { await h.close(); }
      }
    },
    {
      name: "fit preserves words, forced breaks and emphasis; creator anchoring and body scale work",
      async run(t) {
        const h = await realPage();
        try {
          const r = await h.page.evaluate(async s => {
            s.style = { presetId: "creator@1.0" }; delete s.frozen;
            s.slides[0] = { id: "s01", n: 1, type: "cover", variant: "center", headline: "صورة ==منتجك==\nثابتة؟ حرّكها\nفي ChatGPT", sub: "جربها اليوم" };
            const a = await CS.core.render.slide(s, null, 0, { useFrozen: false });
            const hero = a.el.querySelector('[data-slot="headline"]'), sub = a.el.querySelector('[data-slot="sub"]');
            const out = { variant: a.el.dataset.variant, y: hero.getBoundingClientRect().y - a.el.getBoundingClientRect().y,
              words: Array.from(hero.querySelectorAll('.w')).map(w => w.textContent), lines: CS.core.fit.measureLines(hero).text,
              em: hero.querySelector('mark')?.textContent, body: parseFloat(getComputedStyle(sub).fontSize), coverFit: a.fit.cover };
            a.el.remove();
            s.slides[0].variant = "top"; s.slides[0].overrides = { "type.scale.body": 64 };
            const b = await CS.core.render.slide(s, null, 0, { useFrozen: false });
            out.topY = b.el.querySelector('[data-slot="headline"]').getBoundingClientRect().y - b.el.getBoundingClientRect().y;
            out.bigSub = parseFloat(getComputedStyle(b.el.querySelector('[data-slot="sub"]')).fontSize); b.el.remove();
            return out;
          }, spec());
          t.eq(r.variant, "center"); t.ok(r.y > r.topY + 10, "center and top produce different anchors");
          t.eq(r.words, ["صورة", "منتجك", "ثابتة؟", "حرّكها", "في", "ChatGPT"]);
          t.eq(r.lines.length, 3); t.eq(r.em, "منتجك"); t.gte(r.bigSub, 64); t.ok(r.bigSub > r.body);
          t.ok(r.coverFit && r.coverFit.arrangements > 0, "cover search is reported");
          const busy = await h.page.evaluate(async s => {
            s.style = { presetId: "creator@1.0" };
            s.slides[0] = { id: "s01", n: 1, type: "cover", headline: "فكرة واضحة\nخطوة واحدة\nقرار أفضل", kicker: "دليل عملي جديد لتصميم منشور واضح", sub: "ابدأ اليوم", overrides: { "type.scale.body": 64 } };
            const r = await CS.core.render.slide(s, null, 0, { mode: "export", useFrozen: false });
            const out = { sub: r.fit.slots["s01.sub"].fontPx, hero: r.fit.slots["s01.headline"].fontPx, ok: r.fit.ok }; r.el.remove(); return out;
          }, spec());
          t.eq(busy.sub, 64, "an explicit sub-line size reserves room before growing the hero: " + JSON.stringify(busy));
          t.ok(busy.ok, "the hero gives the explicit sub-line room");
          const symbol = await h.page.evaluate(s => { s.ext = { coverSymbol: "coins" }; return CS.motion.recommend(s).metaphor; }, spec());
          t.eq(symbol, "coins", "the exporter can choose a story symbol through spec.ext");
          const packed = await h.page.evaluate(async s => {
            s.style = { presetId: "creator@1.0", overrides: { "type.display.lh": 1.55 } }; s.locale.dialect = "en";
            s.slides[0] = { id: "s01", n: 1, type: "cover", headline: "A\nB\nPreview" };
            const r = await CS.core.render.slide(s, null, 0, { mode: "export", useFrozen: false });
            let error = null; try { CS.motion.build(r.el, { recipe: "story", metaphor: "spark" }); } catch (e) { error = { code: e.code, message: e.message }; }
            const out = { fits: r.fit.ok, error }; r.el.remove(); return out;
          }, spec());
          t.ok(packed.fits, "the crowded still itself fits");
          t.eq(packed.error, null, "the short symbol can use clear space occupied by later text");
        } finally { await h.close(); }
      }
    },
    {
      name: "motion keeps number posters aligned, draws an unmarked stamp and never loses the hero",
      async run(t) {
        const h = await realPage();
        try {
          const r = await h.page.evaluate(async s => {
            const errors = [], scores = [], visibility = [];
            function ink(canvas) {
              const crop = document.createElement("canvas"); crop.width = 85; crop.height = 89;
              const c = crop.getContext("2d"); c.drawImage(canvas, 114 * canvas.width / 1080, 261 * canvas.height / 1440, 852 * canvas.width / 1080, 888 * canvas.height / 1440, 0, 0, 85, 89);
              const data = c.getImageData(0, 0, 85, 89).data, hist = new Uint32Array(256), values = [];
              for (let i = 0; i < data.length; i += 4) { const value = Math.round(.299 * data[i] + .587 * data[i + 1] + .114 * data[i + 2]); hist[value]++; values.push(value); }
              let sum = 0, median = 0; for (let i = 0; i < 256; i++) { sum += hist[i]; if (sum >= values.length / 2) { median = i; break; } }
              return values.filter(value => Math.abs(value - median) > 18).length;
            }
            for (const preset of ["creator", "poster", "notebook"]) for (const recipe of ["stamp", "highlight-sweep", "story", "counter"]) {
              s.style = { presetId: preset + "@1.0" }; delete s.frozen;
              s.slides[0] = { id: "s01", n: 1, type: "cover", variant: "number", headline: "5 أفكار تحسن عملك" };
              const deck = await CS.core.render.deck(s, null, { useFrozen: false, slideIds: ["s01"] }), el = deck.slides[0].el;
              const poster = await CS.paint.toCanvas(el, { scale: .3 });
              const tl = CS.motion.build(el, { recipe, metaphor: "spark" }), ctrl = CS.motion.hf.engine.attach(el, tl, { driver: "style" });
              ctrl.seek(0); const first = await CS.paint.toCanvas(el, { scale: .3 });
              scores.push({ preset, recipe, ssim: CS.paint.metrics.ssim(poster, first) });
              const words = [...el.querySelectorAll('[data-slot="headline"] .w')];
              const base = words.reduce((sum, w) => { const b = w.getBoundingClientRect(); return sum + b.width * b.height; }, 0);
              let min = 1, minAt = 0;
              for (let frame = 0; frame < 180; frame++) {
                ctrl.seek(frame / 30); let area = 0;
                for (const w of words) {
                  let alpha = 1, clipped = false;
                  for (let p = w; p && p !== el; p = p.parentElement) {
                    const c = getComputedStyle(p); alpha *= +c.opacity;
                    if (c.visibility === "hidden" || /inset\([^)]*100%/.test(c.clipPath)) clipped = true;
                  }
                  const b = w.getBoundingClientRect(); if (alpha >= .35 && !clipped) area += b.width * b.height;
                }
                if (area / base < min) { min = area / base; minAt = frame / 30; }
              }
              ctrl.seek(minAt); const inkRatio = ink(await CS.paint.toCanvas(el, { scale: .3 })) / ink(poster);
              visibility.push({ preset, recipe, min, inkRatio });
              if (recipe === "stamp") {
                ctrl.seek(2.4); const ring = el.querySelector('[data-m-ov="stamp-ring"]');
                if (!ring || +getComputedStyle(ring).opacity < .9 || !(+getComputedStyle(ring).zIndex >= 3)) errors.push(preset + ": unmarked stamp is hidden behind content");
                const number = el.querySelector('[data-run="number"]'), range = document.createRange(); range.selectNodeContents(number);
                const glyphWidth = range.getBoundingClientRect().width / (el.getBoundingClientRect().width / el.offsetWidth);
                if (tl.overlays.find(o => o.id === "stamp-ring").rect.w > glyphWidth + 50) errors.push(preset + ": the stamp surrounds the layout row instead of the numeral ink");
              }
              if (recipe === "story") {
                const symbol = tl.overlays.find(o => o.id === "story-spark");
                if (!tl.metaphor || !symbol || !(symbol.z >= 3)) errors.push(preset + ": missing visible chosen symbol");
                ctrl.seek(1);
                const root = el.getBoundingClientRect(), scale = root.width / el.offsetWidth;
                for (const word of words) {
                  let alpha = 1; for (let p = word; p && p !== el; p = p.parentElement) alpha *= +getComputedStyle(p).opacity;
                  if (alpha < .35) continue;
                  const b = word.getBoundingClientRect(), x = (b.left - root.left) / scale, y = (b.top - root.top) / scale;
                  if (x < symbol.rect.x + symbol.rect.w && x + b.width / scale > symbol.rect.x && y < symbol.rect.y + symbol.rect.h && y + b.height / scale > symbol.rect.y) { errors.push(preset + ": the symbol covers readable headline content"); break; }
                }
              }
              ctrl.destroy(); deck.dispose();
            }
            return { errors, scores, visibility };
          }, spec());
          t.eq(r.errors, []);
          for (const r0 of r.scores) t.gte(r0.ssim, .995, JSON.stringify(r0));
          for (const v of r.visibility) t.gte(v.min, .25, "no nearly blank frame: " + JSON.stringify(v));
          for (const v of r.visibility) t.gte(v.inkRatio, .25, "content ink at the least visible frame, excluding chrome: " + JSON.stringify(v));
        } finally { await h.close(); }
      }
    }
  ]
};
