// tests/unit/js/art/marks.test.mjs · CS.art.marks (package A9): the cs-art-marks library as pure geometry (spec 3.5, rules A2 A8 A13), the r2 placement rules (brush >= 7 px, line 3-7 px,
// output rounded to 0.5, one hand per deck, <= 3 marks, 1 arrow, ink area < 8% of the zone), painter parity, and the marks contact sheet on the creator, poster and notebook grounds.
// The geometry is DOM free: the same source runs in a bare vm and in the page and gives the same bytes. Run: node tests/unit/js/art/run.mjs --only marks [--out DIR]
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { loadMarks } from "../marks/lib.mjs";
import { PRESETS, TONES, ART } from "./support/dna.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const LIB = loadMarks();
const read = (f) => fs.readFileSync(path.join(REPO, f), "utf8");
const inject = (t) => t.art.evaluate((l) => { CS.visual._.blocks["cs-art-marks"] = l; }, LIB);

/** Test targets: a 300 x 160 rect for box and uniform fits (30 px high for the thin templates), a 300 x 120 diagonal for pairs. */
const targetFor = (m) => (m.fit === "pair" ? { from: [100, 100], to: [400, 220] } : { x: 100, y: 100, w: 300, h: m.aspect > 8 ? 30 : 160 });

export default {
  module: "marks",
  tests: [
    {
      name: "anchor-bound family selection varies with slide seed and repeats exactly",
      async run(t){
        await inject(t);
        const run=()=>t.art.evaluate(()=>Array.from({length:60},(_,i)=>CS.art.marks.make('circle',{x:20,y:20,w:200,h:80},{...__art.ctx(),slideId:'s'+i,art:{}},{form:'line'}).rec.id));
        const a=await run();t.eq(a,await run());t.ok(new Set(a).size>=3,'all eligible circle shapes are reached');
      }
    },
    {
      name: "settle keeps independent targets on adjacent wrapped lines separate, twice",
      async run(t){
        await inject(t);
        const run=()=>t.art.evaluate(()=>{
          const sl=document.createElement('section');sl.className='cs-slide';sl.dataset.csSlide='s97';sl.style.cssText='width:1080px;height:1440px';
          sl.innerHTML='<div class="cs-ln"><mark data-mark-target="strike-line" style="display:inline-block;width:100px;height:40px"><span class="w">first</span></mark></div><div class="cs-ln"><mark data-mark-target="strike-line" style="display:inline-block;width:100px;height:40px"><span class="w">second</span></mark></div>';
          document.body.appendChild(sl);CS.core.freeze.visual.set('s97',null);
          const r=CS.visual.settle(sl,{art:{},tokens:{},zone:{w:852,h:998}});sl.remove();return r.marks;
        });
        const a=await run();t.eq(a,await run());t.eq(a.length,2,'two original targets produce two marks');
      }
    },
    {
      name: "source: 8 KiB, no clock, random, network, letter-spacing, opacity or italic; loads in a bare vm without document, registers no anchor kind; same bytes as the page",
      async run(t) {
        const src = read("src/art/marks.js");
        t.lte(Buffer.byteLength(src, "utf8"), 8320, "marks.js budget (8320: free slides draw marks on authored elements)");
        for (const bad of [/Math\.random/, /\bDate\b/, /performance\./, /\bfetch\b/, /XMLHttpRequest/, /letter-spacing/, /opacity/, /italic/, /analytics/i, /Intl\./]) t.ok(!bad.test(src), "forbidden: " + bad);
        const cx = vm.createContext({ CS: {} });
        for (const f of ["src/lib/canon.js", "src/lib/color.js", "src/art/root.js", "src/art/kit.js", "src/art/marks.js"]) vm.runInContext(read(f), cx, { filename: f });
        t.eq(typeof cx.document, "undefined", "no document in the vm");
        t.eq(Object.keys(cx.CS.art.marks).sort(), ["allow", "color", "jitter", "layer", "lib", "limit", "make", "nodes", "pick", "place"], "the public surface");
        t.eq(JSON.parse(JSON.stringify(cx.CS.art.caps())), { v: 1, art: {} }, "marks are not an anchor kind: the capability hash does not move");
        const ctx = { slideId: "s02", data: { marks: LIB }, art: {} };
        const run = (M, id, tg, o) => M.place(LIB.marks.find((m) => m.id === id), tg, ctx, o).d;
        const a = run(cx.CS.art.marks, "circle-scribble", { x: 10, y: 20, w: 300, h: 120 }, { form: "brush", seed: "s02|m0.0", deck: "d" });
        const b = await t.art.evaluate((l) => CS.art.marks.place(l.marks.find((m) => m.id === "circle-scribble"), { x: 10, y: 20, w: 300, h: 120 }, { slideId: "s02", data: { marks: l }, art: {} }, { form: "brush", seed: "s02|m0.0", deck: "d" }).d, LIB);
        t.eq(a, b, "vm and browser agree byte for byte");
      }
    },
    {
      name: "templates: all 28 place as line, brush and fill with 0.5 px output, stroke 3-7 px (line) and at least 7 px (brush), twice the same",
      async run(t) {
        await inject(t);
        const run = () => t.art.evaluate(() => {
          const L = CS.visual._.block("cs-art-marks"), M = CS.art.marks, out = [], ctx = { slideId: "s02", data: { marks: L }, art: {}, tokens: {} };
          const half = (d) => (d.match(/-?\d*\.?\d+/g) || []).every((n) => Math.abs(n * 2 - Math.round(n * 2)) < 1e-9);
          const grammar = /^(M-?[\d.]+ -?[\d.]+(?:[lLC][-\d. ]*)*[zZ]?)+$/;
          for (const m of L.marks) {
            const tg = m.fit === "pair" ? { from: [100, 100], to: [400, 220] } : { x: 100, y: 100, w: 300, h: m.aspect > 8 ? 30 : 160 };
            for (const form of ["line", "brush"]) {
              const e = M.place(m, tg, ctx, { form, seed: "s02|" + m.id });
              const f = m.form === "fill" ? "fill" : form;
              out.push({ id: m.id, form, f: e.f, w: e.w, ok: half(e.d) && grammar.test(e.d) && !/NaN|Infinity/.test(e.d), A: e.A > 0, closed: f === "line" || /z$/i.test(e.d), len: e.d.length, bw: m.bw || 1, lw: m.lw || 1 });
            }
          }
          return out;
        });
        const a = await run(), b = await run();
        t.eq(a, b, "same input, same result");
        t.eq(a.length, 56);
        for (const r of a) {
          t.ok(r.ok, r.id + " " + r.form + ": grammar and 0.5 px rounding");
          t.ok(r.A, r.id + ": a positive ink area");
          t.ok(r.closed, r.id + " " + r.form + ": a filled mark is closed");
          if (r.id === "kashida-bar") t.eq(r.f, "fill", "the kashida bar is always a filled polygon");
          else if (r.form === "brush") { t.eq(r.f, "brush"); t.gte(r.w, 7, r.id + ": brush >= 7 px"); }
          else { t.eq(r.f, "line"); t.gte(r.w, 3, r.id + ": line >= 3 px"); t.lte(r.w, 7 * r.lw + 0.25, r.id + ": line <= 7 px x lw (stored to 0.5)"); }
          t.lte(r.len, 2200, r.id + ": a stored mark stays small");
        }
      }
    },
    {
      name: "the hand: template and jitter come from fnv1a64(slide + part), limits 3 deg, 4%, 2 deg, 6 px; one lean per deck; two decks lean both ways",
      async run(t) {
        await inject(t);
        const r = await t.art.evaluate(() => {
          const M = CS.art.marks, L = CS.visual._.block("cs-art-marks"), seeds = Array.from({ length: 60 }, (_, i) => "s" + (i + 1) + "|m0.0");
          const j = seeds.map((s) => M.jitter(s, "deck-a")), lean = (d) => seeds.map((s) => Math.sign(M.jitter(s, d).rot) + "" + Math.sign(M.jitter(s, d).sk));
          const leans = Array.from({ length: 24 }, (_, i) => lean("deck-" + i)[0]);
          const picks = seeds.map((s) => M.pick(L, "circle", s).id);
          return {
            rot: Math.max.apply(0, j.map((x) => Math.abs(x.rot))), sc: Math.max.apply(0, j.map((x) => Math.abs(x.sc - 1))), sk: Math.max.apply(0, j.map((x) => Math.abs(x.sk))), off: Math.max.apply(0, j.map((x) => Math.max(Math.abs(x.dx), Math.abs(x.dy)))),
            oneLean: new Set(lean("deck-a")).size, bothLeans: new Set(leans).size, templates: new Set(picks).size, again: JSON.stringify(seeds.map((s) => M.jitter(s, "deck-a"))) === JSON.stringify(j),
            hard: picks.filter((id) => /open/.test(id)).length
          };
        });
        t.lte(r.rot, 3); t.lte(r.sc, 0.04); t.lte(r.sk, 2); t.lte(r.off, 6);
        t.eq(r.oneLean, 1, "every mark of a deck leans the same way");
        t.gte(r.bothLeans, 2, "decks differ");
        t.gte(r.templates, 2, "the seed chooses among the templates of a family");
        t.eq(r.hard, 0, "the open ring is only picked by its id");
        t.ok(r.again, "same seed, same jitter");
      }
    },
    {
      name: "place rules: an arrow's tip lands on `to` and its tail near `from`; bow mirrors across the axis; rtl mirrors box fits; rot turns about the origin; the target rect holds a circle",
      async run(t) {
        await inject(t);
        const r = await t.art.evaluate(() => {
          const M = CS.art.marks, L = CS.visual._.block("cs-art-marks"), ctx = { slideId: "s09", data: { marks: L }, art: {}, tokens: {} }, out = {};
          const pts = (d) => { const n = d.match(/-?\d*\.?\d+/g).map(Number), p = []; for (let i = 0; i + 1 < n.length; i += 2) p.push([n[i], n[i + 1]]); return p; };
          const near = (p, q) => Math.min.apply(0, p.map((v) => Math.hypot(v[0] - q[0], v[1] - q[1])));
          const from = [150, 120], to = [520, 400], len = Math.hypot(370, 280);
          out.arrows = L.marks.filter((m) => m.family === "arrow").map((m) => {
            const e = M.place(m, { from, to }, ctx, { form: "line", seed: "a|" + m.id }), p = pts(e.d);
            return { id: m.id, tip: near(p, to), tail: near(p, from) / len };
          });
          const m = L.marks.find((x) => x.id === "arrow-curve"), s = (o) => pts(M.place(m, { from, to }, ctx, Object.assign({ form: "line", seed: "z" }, o)).d);
          const plain = s({}), bowed = s({ bow: true }), ax = [to[0] - from[0], to[1] - from[1]];
          const side = (p) => p.reduce((a, v) => a + ((v[0] - from[0]) * ax[1] - (v[1] - from[1]) * ax[0]), 0) / p.length;
          out.bow = [side(plain), side(bowed)];
          const box = L.marks.find((x) => x.id === "underline-straight"), pr = M.place(box, { x: 100, y: 100, w: 400, h: 30 }, ctx, { form: "line", seed: "u" }), pl = M.place(box, { x: 100, y: 100, w: 400, h: 30 }, ctx, { form: "line", seed: "u", rtl: false });
          out.rtl = [pts(pr.d)[0][0], pts(pl.d)[0][0]];
          const ring = L.marks.find((x) => x.id === "circle-scribble"), rr = M.place(ring, { x: 200, y: 300, w: 300, h: 120 }, ctx, { form: "line", seed: "c" }), pp = pts(rr.d);
          out.ring = [Math.min.apply(0, pp.map((v) => v[0])), Math.max.apply(0, pp.map((v) => v[0])), Math.min.apply(0, pp.map((v) => v[1])), Math.max.apply(0, pp.map((v) => v[1]))];
          const t0 = pts(M.place(ring, { x: 200, y: 300, w: 300, h: 120 }, ctx, { form: "line", seed: "c", rot: 90 }).d), c0 = pts(rr.d);
          out.rot = [c0[3][0], c0[3][1], t0[3][0], t0[3][1]];
          return out;
        });
        for (const a of r.arrows) { t.lte(a.tip, 1.5, a.id + ": the tip stays on `to` (the jitter turns about it)"); t.lte(a.tail, 0.12, a.id + ": the tail within the jitter of `from`"); }
        t.ok(r.bow[0] * r.bow[1] < 0, "bow puts the bulge on the other side of the axis");
        t.ok(r.rtl[0] > 300 && r.rtl[1] < 300, "an rtl underline starts at the end side, an ltr one at the start side: " + r.rtl.join(","));
        t.ok(r.ring[0] > 150 && r.ring[1] < 550 && r.ring[2] > 260 && r.ring[3] < 470, "a ring stays within its rect and the jitter: " + r.ring.join(","));
        t.near(r.rot[2], -r.rot[1], 0.6, "rot 90 maps (x, y) to (-y, x)"); t.near(r.rot[3], r.rot[0], 0.6);
      }
    },
    {
      name: "limits: at most 3 marks, one arrow, ink under 8% of the zone with the largest dropped first, k renumbered; allow and pick follow the preset",
      async run(t) {
        await inject(t);
        const r = await t.art.evaluate(() => {
          const M = CS.art.marks, L = CS.visual._.block("cs-art-marks"), g = (id, A) => ({ id: id, A: A, k: 9 }), zone = 100000, out = {};
          let x = M.limit([g("circle-scribble", 1000), g("arrow-curve", 1000), g("arrow-loop", 1000), g("underline-wavy", 1000), g("strike-line", 1000)], zone);
          out.count = [x.kept.length, x.kept.filter((q) => /^arrow/.test(q.id)).length, x.dropped, x.kept.map((q) => q.k)];
          x = M.limit([g("circle-scribble", 3000), g("underline-wavy", 4000), g("strike-line", 2000)], zone);
          out.area = [x.kept.map((q) => q.id), x.dropped];
          x = M.limit([g("circle-double", 9000)], zone);
          out.huge = [x.kept.length, x.dropped];
          const pol = (art, id) => M.allow(art, L.marks.find((m) => m.id === id));
          out.policy = [pol({}, "circle-scribble"), pol({ doodle: "marker" }, "circle-scribble"), pol({ doodle: "brush" }, "strike-line"), pol({ doodle: "pencil" }, "strike-line"), pol({ marks: ["arrow", "circle"] }, "underline-wavy"), pol({ marks: ["arrow", "circle"], doodle: "marker" }, "circle-open"), pol({ marks: ["sparkle"] }, "sparkle"), pol(null, "tick"), M.allow({ doodle: "marker" }, L.marks[0], "line")];
          out.pick = [M.pick(L, "arrow-hook", "x").id, M.pick(L, "strike-cross", "x").id, M.pick(L, "arrow", "s1").id, M.pick(L, "nothing", "x")];
          const fam = new Set(); for (let i = 0; i < 80; i++) fam.add(M.pick(L, "arrow", "s" + i).id);
          out.arrowFam = [...fam].sort();
          const only = (marks, key) => { const q = new Set(); for (let i = 0; i < 60; i++) { const m = M.pick(L, key, "s" + i, { marks: marks }); q.add(m && m.id); } return [...q].sort(); };
          out.filtered = [only(["circle-double"], "circle"), only(["arrow-curve"], "arrow-down"), only(["arrow-curve"], "arrow"), only(["underline"], "circle"), only(["arrow-down"], "arrow"), only([], "circle"), only(["arrow", "circle"], "circle"), only(["arrow", "circle"], "arrow-down")];
          out.unrestricted = [M.pick(L, "circle", "s7").id === M.pick(L, "circle", "s7", {}).id, M.pick(L, "circle", "s7").id === M.pick(L, "circle", "s7", { doodle: "marker" }).id, M.pick(L, "circle", "s7").id === M.pick(L, "circle", "s7", null).id];
          return out;
        });
        t.eq(r.count, [3, 1, 2, [0, 1, 2]], "3 marks, 1 arrow, k renumbered");
        t.eq(r.area, [["circle-scribble", "strike-line"], 1], "9000 of 100000 is over 8%: the largest (4000) goes");
        t.eq(r.huge, [0, 1], "one mark over 8% of the zone is dropped");
        t.eq(r.policy, ["line", "brush", "brush", "line", null, "brush", "line", "line", "line"], "policy: no list = all as lines; doodle marker or brush draws brush; art.marks restricts by family or id; the caller's form wins");
        t.eq(r.pick, ["arrow-hook", "strike-cross", r.pick[2], null]);
        t.ok(!/down|hook|bracket/.test(r.pick[2]), "a family never yields down, hook or bracket on its own");
        t.eq(r.arrowFam, ["arrow-curve", "arrow-dashed", "arrow-double", "arrow-loop", "arrow-scribble"], "the seed spreads over the other five arrows");
        t.eq(r.filtered.slice(0, 6), [["circle-double"], [null], ["arrow-curve"], [null], [null], [null]], "pick filters by art.marks before the seeded choice: an allowed template is always found, a prohibited id, family or a hand-placed cousin never");
        t.eq(r.filtered[6], ["circle-double", "circle-rough-rect", "circle-scribble"], "a family in art.marks keeps the whole seeded spread"); t.eq(r.filtered[7], ["arrow-down"], "and its hand-placed cousins stay reachable by id");
        t.eq(r.unrestricted, [true, true, true], "no art.marks, no change: the same template as before for the same seed");
      }
    },
    {
      name: "colour: 3:1 on the bg and the surface of every preset and tone (G1-G2), else the ink; roles ink and accent",
      async run(t) {
        await inject(t);
        const rows = await t.art.evaluate(([presets, tones, arts]) => {
          const M = CS.art.marks, C = CS.core.color, out = [];
          for (const p of presets) for (const tn of ["base", "invert", "field"]) {
            const v = tones[p][tn], tk = { bg: v[0], surface: v[1], ink: v[2], inkMuted: v[3], accent: v[4], accent2: v[4], support: arts[p].colors.support };
            for (const role of ["accent", "ink"]) { const c = M.color(tk, role); out.push({ p, tn, role, c, a: C.contrast(c, v[0]), b: C.contrast(c, v[1]), ink: v[2], accent: v[4] }); }
          }
          return out;
        }, [PRESETS, TONES, ART]);
        for (const r of rows) {
          t.ok(r.a >= 3 && r.b >= 3, `${r.p}/${r.tn}/${r.role}: ${r.c} holds ${r.a.toFixed(2)} on bg and ${r.b.toFixed(2)} on surface`);
          if (r.role === "ink") t.eq(r.c.toLowerCase(), r.ink.toLowerCase(), "the ink role is the ink");
        }
        t.ok(rows.some((r) => r.role === "accent" && r.c.toLowerCase() === r.accent.toLowerCase()), "some grounds keep the accent");
        t.ok(rows.some((r) => r.role === "accent" && r.c.toLowerCase() === r.ink.toLowerCase()), "some fall back to the ink (a yellow accent on cream)");
      }
    },
    {
      name: "make (anchor-bound marks): { el, rec, box } with a box of kind mark, null for an unknown id or a family the preset does not draw, the preset's form, the caller's colour role",
      async run(t) {
        await inject(t);
        const r = await t.art.evaluate(() => {
          const M = CS.art.marks, L = CS.visual._.block("cs-art-marks"), tk = { bg: "#F3EBD8", surface: "#FBF6E9", ink: "#1B4332", accent: "#B04A1E", accent2: "#B04A1E", support: ["#A8741A", "#3A6EA5"] };
          const ctx = (art) => ({ slideId: "s07", data: { marks: L }, art: art, tokens: tk, rtl: true });
          const a = M.make("sparkle", { x: 100, y: 40, w: 80, h: 80 }, ctx({ doodle: "marker" })), b = M.make("arrow-curve", { from: [300, 400], to: [100, 120] }, ctx({}), { color: "ink" });
          return {
            box: a.box, form: a.rec.f, path: a.el.getAttribute("fill"), unknown: M.make("nothing", { x: 0, y: 0, w: 10, h: 10 }, ctx({})), off: M.make("sparkle", { x: 0, y: 0, w: 10, h: 10 }, ctx({ marks: ["arrow", "circle"] })),
            picked: [...new Set(["s01", "s02", "s03", "s04", "s05", "s06", "s07", "s08", "s09", "s10"].map((sid) => M.make("circle", { x: 10, y: 10, w: 300, h: 120 }, Object.assign(ctx({ marks: ["circle-double"] }), { slideId: sid })).rec.id))], none: M.make("circle", { x: 10, y: 10, w: 300, h: 120 }, ctx({ marks: ["underline"] })),
            pair: b.box, line: b.rec.f, stroke: b.el.getAttribute("stroke"), role: b.rec.c, tag: b.el.localName, mark: b.el.getAttribute("data-mark"), same: JSON.stringify(M.make("sparkle", { x: 100, y: 40, w: 80, h: 80 }, ctx({ doodle: "marker" })).rec) === JSON.stringify(a.rec)
          };
        });
        t.eq(r.box, { kind: "mark", x: 100, y: 40, w: 80, h: 80 }); t.eq(r.pair, { kind: "mark", x: 100, y: 120, w: 200, h: 280 });
        t.eq(r.form, "brush"); t.ok(/^#[0-9A-F]{6}$/i.test(r.path), "a resolved hex colour (A2)");
        t.eq(r.unknown, null); t.eq(r.off, null);
        t.eq(r.picked, ["circle-double"], "make picks among the templates the preset allows (ten slide ids), never a prohibited one"); t.eq(r.none, null, "and draws nothing when none is allowed");
        t.eq(r.line, "line"); t.eq(r.stroke.toLowerCase(), "#1b4332"); t.eq(r.role, "ink"); t.eq(r.tag, "path"); t.eq(r.mark, "arrow-curve"); t.ok(r.same, "same input, same entry");
      }
    },
    {
      name: "painters: a cell of every family (line, brush, fill) is safe() and agrees between the svg and the replay painter, twice the same markup",
      async run(t) {
        await inject(t);
        const draw = () => t.art.mount((CS, ctx) => {
          const k = CS.art.kit, M = CS.art.marks, c = Object.assign({}, ctx, { art: Object.assign({}, ctx.art, { doodle: "marker" }) }), nodes = [];
          const put = (id, tg, o) => { const r = M.make(id, tg, c, o); if (r) nodes.push(r.el); };
          put("circle-double", { x: 20, y: 20, w: 260, h: 110 }, { form: "line" }); put("underline-wavy", { x: 300, y: 70, w: 240, h: 40 }); put("strike-scribble", { x: 20, y: 160, w: 260, h: 70 }, { color: "ink" });
          put("arrow-curve", { from: [320, 240], to: [560, 150] }); put("sparkle", { x: 560, y: 20, w: 90, h: 90 }); put("burst", { x: 600, y: 160, w: 100, h: 100 }, { color: "ink" }); put("kashida-bar", { x: 20, y: 270, w: 380, h: 40 }); put("squiggle", { x: 420, y: 280, w: 280, h: 40 }, { form: "line" });
          return k.wrap("field", ctx.seed, k.svg(720, 340, nodes, {}), { style: { width: 720, height: 340 } });
        }, null, { preset: "creator", box: { w: 720, h: 340 } });
        const a = await draw(), b = await draw();
        t.eq(a.html, b.html, "same input, same markup");
        t.eq((await t.art.safe(b)).violations, []);
        const p = await t.art.paintBoth(b, { regions: [b.sel + " svg"] });
        t.gte(p.ssim, 0.98, "complete slide"); t.gte(p.regions[0].ssim, 0.98, "the marks region");
        const n = await t.art.evaluate((s) => document.querySelectorAll(s + " svg path").length, b.sel);
        t.eq(n, 8);
      }
    },
    {
      name: "marks never change a dead-space number: boxes of kind mark are ignored by deadSpace",
      async run(t) {
        await inject(t);
        const r = await t.art.evaluate(() => {
          const M = CS.art.marks, L = CS.visual._.block("cs-art-marks"), ctx = { slideId: "s03", data: { marks: L }, art: {}, tokens: {} }, zone = { w: 852, h: 888 };
          const base = [{ kind: "text", x: 40, y: 60, w: 760, h: 180 }, { kind: "owner", id: "c", x: 100, y: 330, w: 640, h: 360, fill: 1 }, { kind: "ink", x: 160, y: 380, w: 520, h: 260, ownerOf: "c" }];
          const marks = ["circle-scribble", "arrow-curve", "sparkle"].map((id) => { const r = M.make(id, id === "arrow-curve" ? { from: [60, 700], to: [500, 400] } : { x: 100, y: 100, w: 300, h: 140 }, ctx, { form: "line" }); return { kind: "mark", x: 0, y: 0, w: 852, h: 888, id: r.rec.id }; });
          const scatter = [[0, 700], [300, 760], [600, 700]].map((p) => ({ kind: "mark", x: p[0], y: p[1], w: 80, h: 80 }));
          const a = JSON.stringify(CS.visual.deadSpace(base, zone)), b = JSON.stringify(CS.visual.deadSpace(base.concat(marks, scatter), zone));
          return { same: a === b, a };
        });
        t.ok(r.same, "three scattered marks and three whole-zone marks change nothing: " + r.a);
      }
    },
    {
      name: "sheet: all 28 marks on the creator, poster and notebook grounds at 1x and 130 px (saved to --out as marks.png and marks-130.png)",
      async run(t) {
        await inject(t);
        const sheet = await t.art.evaluate(([presets, tones, arts]) => {
          document.querySelectorAll("#marks-sheet").forEach((e) => e.remove());
          const k = CS.art.kit, M = CS.art.marks, L = CS.visual._.block("cs-art-marks"), CW = 176, CH = 120, COLS = 7, rows = Math.ceil(L.marks.length / COLS), grounds = [["creator", "marker"], ["poster", "pen"], ["notebook", "pencil"]];
          const host = document.createElement("div"); host.id = "marks-sheet"; host.className = "cs-sheet"; host.style.cssText = `width:${COLS * CW}px;height:${grounds.length * rows * CH}px`;
          let bad = 0;
          grounds.forEach(([p, doodle], gi) => {
            const v = tones[p].base, tk = { bg: v[0], surface: v[1], ink: v[2], inkMuted: v[3], accent: v[4], accent2: v[4], support: arts[p].colors.support };
            const ctx = { slideId: "s0" + (gi + 1), tokens: tk, art: Object.assign({}, arts[p], { doodle }), data: { marks: L }, rtl: true };
            L.marks.forEach((m, i) => {
              const cell = document.createElement("div"), x = (i % COLS) * CW, y = (gi * rows + Math.floor(i / COLS)) * CH, cap = document.createElement("span");
              cell.className = "cell"; cell.style.cssText = `left:${x}px;top:${y}px;width:${CW}px;height:${CH}px;background-color:${v[0]}`;
              const tg = m.fit === "pair" ? { from: [28, 82], to: [CW - 28, 34] } : m.fit === "uniform" ? { x: 40, y: 14, w: CW - 80, h: CH - 44 } : { x: 22, y: m.aspect > 8 ? 30 : 16, w: CW - 44, h: m.aspect > 8 ? 36 : CH - 46 };
              const r = M.make(m.id, tg, ctx, { part: "sheet" });
              if (r) cell.appendChild(k.svg(CW, CH, [r.el], {})); else bad++;
              cap.className = "cap"; cap.setAttribute("data-sheet", "1"); cap.style.color = v[3]; cap.textContent = p[0] + " " + m.id; cell.appendChild(cap); host.appendChild(cell);
            });
          });
          document.body.appendChild(host);
          return { sel: "#marks-sheet", bad, n: L.marks.length * grounds.length };
        }, [PRESETS, TONES, ART]);
        t.eq(sheet.bad, 0, "every mark draws on every ground");
        t.eq(await t.art.evaluate(() => document.querySelectorAll("#marks-sheet svg path").length), sheet.n);
        const png = await t.art.shot(sheet.sel);
        t.art.save("marks.png", png); t.art.save("marks-130.png", await t.art.small(png, 130));
        t.eq((await t.art.safe(sheet.sel)).violations, [], "the sheet is painter-safe (each of its cells is its own budget)");
      }
    }
  ]
};
