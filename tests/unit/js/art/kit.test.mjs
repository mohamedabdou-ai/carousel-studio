// tests/unit/js/art/kit.test.mjs · CS.art register/build and CS.art.kit (package A1): painter-safe elements and shapes (A1-A14), seeded determinism (A8), the stroke ladder,
// token normalisers, the container grammar, the single-container anchors. Browser tests on the shared harness (node tests/unit/js/art/run.mjs --only kit).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PRESETS, TONES, ART } from "./support/dna.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
// layout_budget.py, "optical stroke ladder": stroke px per size token (xs sm md lg xl hero) for each preset's stroke units
const LADDER = {
  swiss: [4.0, 5.33, 8.0, 13.33, 20.0, 26.67], creator: [4.17, 6.67, 10.0, 16.67, 25.0, 33.33], notebook: [4.0, 5.33, 8.0, 13.33, 20.0, 26.67],
  poster: [4.17, 6.67, 10.0, 16.67, 25.0, 33.33], interface: [4.0, 5.33, 8.0, 13.33, 20.0, 26.67], heritage: [4.0, 5.0, 6.0, 10.0, 15.0, 20.0]
};
const SIZES = ["xs", "sm", "md", "lg", "xl", "hero"];

export default {
  module: "kit",
  tests: [
    {
      name: "real compose.label stamps slide keys and floors and isolates Latin word spans, twice",
      async run(t) {
        const draw = () => t.art.render({ kind: "icon", icon: "clock", captions: ["وقت Canva 25"] }, { slideId: "s09", png: false });
        const a = await draw(), b = await draw();
        t.eq(a.html, b.html, "same real labels twice");
        const meta = await t.art.evaluate((sel) => {
          const l = document.querySelector(sel + " [data-slot=art]");
          return { key: l.dataset.slotKey, floor: +l.dataset.floor, latin: !!l.querySelector('bdi[dir="ltr"] .w'), rules: __art.ctx().rules === CS.core.registry.rules(), id: __art.ctx({ slide: { id: "s03" } }).id };
        }, b.sel);
        t.eq(meta, { key: "s09.art.0", floor: 36, latin: true, rules: true, id: "s03" });
        t.eq((await t.art.safe(b)).violations, []);
        t.eq(await t.art.evaluate(() => [2, 7].map((index) => {
          const l = CS.art.kit.label("chart", index, "25");
          CS.core.compose.label(l.el, l.text, __art.ctx({ slideId: "s03" }), l);
          return [l.el.dataset.slotKey, +l.el.dataset.floor];
        })), [["s03.art.2", 38], ["s03.art.7", 38]]);
        if (t.art.outDir) await t.art.shot(b, "real-label.png");
      }
    },
    {
      name: "safe accepts nested Latin under bdi dir=ltr and rejects missing or wrong isolation",
      async run(t) {
        for (const run of [0, 1]) {
          const r = await t.art.mount(() => {
            const d = document.createElement("div");
            d.innerHTML = '<div data-slot="art" data-index="0" data-role="body" data-floor="36">وقت <bdi dir="ltr"><em><span class="w">Canva 25</span></em></bdi></div>';
            return d;
          });
          t.ok(!(await t.art.safe(r)).violations.some((v) => v.rule === "AR"), "LTR ancestor accepted");
          for (const dir of ["rtl", ""]) {
            await t.art.evaluate(([sel, dir]) => document.querySelector(sel + " bdi").setAttribute("dir", dir), [r.sel, dir]);
            t.ok((await t.art.safe(r)).violations.some((v) => v.rule === "AR"), "invalid isolation rejected");
          }
          await t.art.evaluate((sel) => document.querySelector(sel + " bdi").replaceWith(document.createTextNode("Canva 25")), r.sel);
          t.ok((await t.art.safe(r)).violations.some((v) => v.rule === "AR"), "bare Latin rejected");
        }
      }
    },
    {
      name: "safe respects LTR label bases while rejecting Latin in wrong or empty bdi isolation, twice",
      async run(t) {
        const draw = () => t.art.render({ kind: "icon", icon: "clock", captions: ["وقت Canva 25"] }, { rtl: false, png: false });
        const a = await draw(), b = await draw();
        t.eq(a.html, b.html, "same real LTR labels twice");
        const meta = await t.art.evaluate((sel) => {
          const label = document.querySelector(sel + " [data-slot=art]");
          return { direction: getComputedStyle(label).direction, lang: label.closest("[lang]").lang,
            arabic: !!label.querySelector('bdi[dir="rtl"]'), latin: !!label.querySelector('bdi[dir="ltr"]'), text: label.textContent };
        }, b.sel);
        t.eq(meta, { direction: "ltr", lang: "en", arabic: true, latin: false, text: "وقت Canva 25" });
        t.eq((await t.art.safe(b)).violations, [], "real LTR pipeline needs no LTR isolation");
        for (const run of [0, 1]) {
          const r = await t.art.mount(() => {
            const d = document.createElement("div");
            d.innerHTML = '<div data-slot="art" data-index="0" data-role="body" data-floor="36"><bdi dir="rtl">وقت</bdi> <span class="w">Canva 5</span></div>';
            return d;
          }, null, { rtl: false });
          t.eq((await t.art.safe(r)).violations, [], "LTR base accepts bare Latin and digits");
          for (const dir of ["rtl", ""]) {
            await t.art.evaluate(([sel, dir]) => {
              const label = document.querySelector(sel + " [data-slot=art]"), span = label.querySelector("span.w"), bdi = document.createElement("bdi");
              bdi.setAttribute("dir", dir); span.replaceWith(bdi); bdi.appendChild(span);
            }, [r.sel, dir]);
            t.ok((await t.art.safe(r)).violations.some((v) => v.rule === "AR"), "invalid Latin isolation rejected on LTR base");
            await t.art.evaluate((sel) => {
              const span = document.querySelector(sel + " span.w"); span.parentElement.replaceWith(span);
            }, r.sel);
          }
        }
      }
    },
    {
      name: "kit contract sheet renders complete-slide and art-region parity with 130px preview",
      async run(t) {
        const draw = () => t.art.mount((CS, ctx) => {
          const k = CS.art.kit, shapes = [k.disc(96, 96, 70), k.rrect(30, 26, 132, 140, 24), k.star(96, 96, 74, 40, 6), k.arch(28, 22, 136, 148, 0.5, 12)];
          const svgs = shapes.map((d) => k.svg(192, 192, [k.path(d, { fill: ctx.tokens.accent, stroke: ctx.tokens.ink, "stroke-width": 5, "pathLength": 1, "data-m": "stroke" })]));
          return k.wrap("field", ctx.seed, svgs, { style: { display: "flex", "align-items": "center", "justify-content": "space-around", width: ctx.box.w, height: ctx.box.h } });
        }, null, { preset: "creator", box: { w: 852, h: 420 } });
        const a = await draw(), b = await draw(); t.eq(a.html, b.html, "same input, same markup");
        t.eq((await t.art.safe(b)).violations, []);
        const p = await t.art.paintBoth(b, { regions: [b.sel + " .cs-art"] });
        t.gte(p.ssim, 0.98); t.gte(p.regions[0].ssim, 0.98);
        const png = await t.art.shot(b); t.art.save("contract-kit.png", png); t.art.save("contract-kit-130.png", await t.art.small(png, 130));
      }
    },
    {
      name: "v2 label roles/floors and frozen slide context are deterministic",
      async run(t) {
        const check = () => t.art.evaluate(() => {
          const k = CS.art.kit, rows = [];
          for (const role of ["small", "body", "title", "numeral", "word", "chip", "chart", "tool"]) {
            for (const text of ["وقت", "2,500", "Canva"]) {
              const l = k.label(role, 0, text, { "data-floor": 1, "data-role": "invalid" });
              rows.push({ role: l.role, floor: +l.el.dataset.floor, text: l.text, empty: l.el.textContent === "", stamped: l.el.dataset.role === role });
            }
          }
          const c = __art.ctx({ slide: { id: "s05", items: [{ title: "وقت" }] } });
          const errors = [["invalid", 0], ["body", -1], ["body", 0.5], ["body", "0"], ["body", NaN], ["body", Infinity]].map(([role, index]) => {
            try { k.label(role, index, "x"); return "accepted"; } catch (e) { return e.code; }
          });
          return { rows, errors, frozen: Object.isFrozen(c.slide) && Object.isFrozen(c.slide.items[0]), keys: ["visual", "brand", "sources", "data", "tone"].every((key) => key in c) };
        });
        const a = await check(); t.eq(await check(), a, "run twice"); t.ok(a.frozen && a.keys);
        t.eq(a.errors, Array(6).fill("E_ART_LABEL"));
        for (const [i, row] of a.rows.entries()) {
          const base = i % 3 === 0 ? 36 : 34;
          const floor = row.role === "numeral" ? 200 : row.role === "word" ? 220 : row.role === "chart" ? 38 : row.role === "tool" && i % 3 !== 0 ? 30 : base;
          t.eq(row.floor, floor); t.ok(row.empty && row.stamped);
        }
      }
    },
    {
      name: "A9 budgets a 100-icon contact sheet by cell, including subtree checks, twice",
      async run(t) {
        let previous;
        for (let run = 0; run < 2; run++) {
          const sheet = await t.art.sheet({ cols: 10, cw: 100, ch: 100, items: Array.from({ length: 100 }, () => ({ kind: "icon", name: "clock", preset: "notebook", opts: { size: "xs", treatment: "chip" } })) });
          const totalBytes = await t.art.evaluate((sel) => Array.from(document.querySelector(sel).querySelectorAll("path")).reduce((n, e) => n + new TextEncoder().encode(e.getAttribute("d") || "").length, 0), sheet.sel);
          t.ok(totalBytes > 24000, "the aggregate sheet exceeds one slide budget, so this detects the original regression");
          const result = await t.art.safe(sheet);
          t.eq(result.violations, [], "100 independent icons pass as a sheet");
          t.eq((await t.art.safe(sheet.sel + " .cell svg")).violations, [], "a cell subtree uses its cell budget");
          if (previous) t.eq(result, previous, "same sheet, same result");
          previous = result;
          const scoped = await t.art.evaluate((sel) => {
            const cell = document.querySelector(sel + " .cell"), svg = cell.querySelector("svg"), ns = svg.namespaceURI;
            for (let i = 0; i < 801; i++) svg.appendChild(document.createElementNS(ns, "path"));
            const marked = cell.cloneNode(true); marked.className = ""; marked.setAttribute("data-budget", "cell"); cell.after(marked);
            return [__artSafe(cell).violations, __artSafe(svg).violations, __artSafe(marked).violations, __artSafe(document.querySelector(sel)).violations].map((vs) => vs.filter((v) => v.rule === "A9").length);
          }, sheet.sel);
          t.eq(scoped, [1, 1, 1, 2], "overlarge cells fail independently, including explicit data-budget scopes");
        }
      }
    },
    {
      name: "A9 aggregates separate svg layers and includes a supplied svg root, twice",
      async run(t) {
        for (let run = 0; run < 2; run++) {
          const record = await t.art.mount((CS) => {
            const k = CS.art.kit, parts = [];
            for (let j = 0; j < 2; j++) parts.push(k.svg(10, 10, Array.from({ length: 400 }, () => k.path("M0 0h1"))));
            return k.html("div", {}, {}, parts);
          });
          t.ok((await t.art.safe(record)).violations.some((v) => v.rule === "A9"), "two individually legal SVGs exceed the slide total");
          const paths = await t.art.mount((CS) => {
            const k = CS.art.kit;
            return k.html("div", {}, {}, [1, 2].map(() => k.svg(10, 10, [k.path("M0 0" + "h1".repeat(6500))])));
          });
          t.ok((await t.art.safe(paths)).violations.some((v) => v.rule === "A9"), "path bytes sum over SVGs");
          t.ok((await t.art.safe(paths.sel + " svg")).violations.some((v) => v.rule === "A9"), "checking a subtree still checks its whole slide");
          const cells = await t.art.evaluate((sel) => {
            const slide = document.querySelector(sel), ns = "http://www.w3.org/2000/svg";
            slide.innerHTML = '<div class="cell"><svg></svg></div><div data-budget="cell"><svg></svg></div>';
            slide.querySelectorAll("svg").forEach((svg) => { for (let i = 0; i < 400; i++) svg.appendChild(document.createElementNS(ns, "path")); });
            return __artSafe(slide.querySelector("svg")).violations.filter((v) => v.rule === "A9").length;
          }, paths.sel);
          t.eq(cells, 1, "cell markers cannot split a real slide budget");
          const points = await t.art.mount((CS) => CS.art.kit.svg(10, 10, [CS.art.kit.el("polyline", { points: "0,0 ".repeat(6001) })]));
          t.ok((await t.art.safe(points)).violations.some((v) => v.rule === "A9"), "points bytes count toward the geometry budget");
        }
      }
    },
    {
      name: "A15-A17 reject known replay losses and allow inline-block and specific rules, twice",
      async run(t) {
        for (let run = 0; run < 2; run++) {
          const r = await t.art.mount(() => {
            const el = document.createElement("div");
            el.innerHTML = '<div style="overflow:hidden;border-top-right-radius:8px;width:50px;height:50px"></div><span style="background:#ffffff;border-radius:8px">x</span><span style="box-shadow:2px 2px 0 #000000">x</span><span style="display:inline-block;background:#ffffff;border-radius:8px">x</span><div data-role="body">x</div>';
            return el;
          });
          await t.art.evaluate(() => { const s = document.createElement("style"); s.id = "c1-role-test"; s.setAttribute("data-cs-slide-css", ""); s.textContent = '.cs-slide [data-role="body"]{font-size:48px}'; document.head.appendChild(s); });
          try {
            const bad = await t.art.safe(r), rules = bad.violations.map((v) => v.rule);
            t.eq(rules.filter((v) => v === "A15").length, 1); t.eq(rules.filter((v) => v === "A16").length, 2); t.ok(rules.includes("A17"));
            await t.art.evaluate(() => { document.getElementById("c1-role-test").textContent = '.cs-slide .cs-zone [data-role="body"]{font-size:48px}'; });
            t.ok(!(await t.art.safe(r)).violations.some((v) => v.rule === "A17"));
            await t.art.evaluate(() => { document.getElementById("c1-role-test").textContent = ':where(.cs-slide .cs-zone) [data-role="body"]{font-size:48px}'; });
            t.ok((await t.art.safe(r)).violations.some((v) => v.rule === "A17"), ":where has zero specificity");
            await t.art.evaluate(() => {
              const s = document.getElementById("c1-role-test"); s.removeAttribute("data-cs-slide-css"); s.setAttribute("data-cs-decor", "");
              s.textContent = '.cs-slide [data-role="body"]{color:#123456}';
            });
            t.ok((await t.art.safe(r)).violations.some((v) => v.rule === "A17"), "decor role overrides are checked");
            await t.art.evaluate(() => { document.getElementById("c1-role-test").textContent = '.cs-slide .cs-zone [data-role="body"]{color:#123456}'; });
            t.ok(!(await t.art.safe(r)).violations.some((v) => v.rule === "A17"), "specific decor overrides pass");
          } finally { await t.art.evaluate(() => document.getElementById("c1-role-test").remove()); }
        }
      }
    },
    {
      name: "the art chunk exposes guarded delegates and its public enumerations (IS-3 v2)",
      async run(t) {
        const r = await t.art.evaluate(() => {
          const A = CS.art, out = { kinds: A.kinds(), has: [A.has("icon"), A.has("field"), A.has("scene"), A.has("nothing")] };
          out.none = A.build({ kind: "never-registered" }, {}); out.empty = A.build(null, {});
          out.describe = A.describe(); out.api = typeof CS.visual.art.build + typeof CS.visual.art.icon + CS.visual.art.has("icon") + CS.visual.art.kinds().length;
          return out;
        });
        t.ok(r.kinds.includes("icon") && r.kinds.includes("field"), "icon and field are registered by anchor-icon.js");
        t.eq(r.has.slice(0, 2), [true, true]); t.eq(r.has[3], false); t.eq(r.none, null); t.eq(r.empty, null);
        t.eq(r.describe.treatments, ["bare", "chip", "tile", "ring", "duo", "sticker", "badge", "giant"]);
        t.eq(r.describe.modifiers, ["slash", "cross", "plus", "check", "question", "sparkle"]); t.eq(r.describe.sizes, { xs: 40, sm: 64, md: 96, lg: 160, xl: 240, hero: 320 });
        t.ok(/^function/.test(r.api) && /true/.test(r.api), "CS.visual.art delegates to CS.art (api.js)");
      }
    },
    {
      name: "every kit shape is a closed path, deterministic, and the elements pass safe() (A1, A2, A9, A10, A14)",
      async run(t) {
        const m = await t.art.mount((CS, ctx) => {
          const k = CS.art.kit, c = CS.core.color, ink = ctx.tokens.ink, acc = ctx.tokens.accent, u = k.uid(ctx.slideId), id = u();
          const shapes = [k.disc(60, 60, 40), k.rrect(10, 10, 100, 80, [4, 20, 4, 20]), k.arch(10, 10, 100, 120, 0.5, 8), k.blob(60, 60, 40, "b", 0.12, 7), k.hand(60, 60, 50, 40, 0.05, "h"),
            k.star(60, 60, 50, 30, 8), k.scallop(60, 60, 50, 10, 0.08), k.ribbon(10, 40, 100, 50, 18), k.curve(k.wobble([[0, 0], [30, 40], [60, 10], [90, 50]], 3, "w"), false), k.poly([[0, 0], [50, 0], [25, 40]], true)];
          const kids = shapes.map((d, i) => k.path(d, { fill: i % 2 ? c.mix(acc, "#FFFFFF", 0.5) : acc, stroke: ink, "stroke-width": 3, pathLength: i === 0 ? 1 : null, "data-m": "stroke" }));
          const grad = k.el("linearGradient", { id: id, x1: 0, y1: 0, x2: 1, y2: 1 }, [k.el("stop", { offset: 0, "stop-color": acc }), k.el("stop", { offset: 1, "stop-color": ink })]);
          kids.push(k.path(k.rrect(0, 130, 120, 40, 8), { fill: "url(#" + id + ")" }));
          const svg = k.svg(130, 180, kids, { defs: [grad], "data-m": "media" });
          svg.setAttribute("style", "display:block");
          window.__shapes = shapes;
          return svg;
        }, null, { preset: "creator" });
        const s = await t.art.safe(m);
        t.eq(s.violations, [], "safe(): " + JSON.stringify(s.violations.slice(0, 3)));
        const d = await t.art.evaluate(() => window.__shapes);
        d.slice(0, 8).forEach((x, i) => t.ok(/Z$|z$/.test(x), "shape " + i + " is closed: " + x.slice(-12)));
        t.ok(d.every((x) => /^M[-\d. ]+/.test(x) && !/NaN|undefined|Infinity/.test(x)), "no NaN in path data");
        const again = await t.art.evaluate(() => { const k = CS.art.kit; return [k.blob(60, 60, 40, "b", 0.12, 7), k.hand(60, 60, 50, 40, 0.05, "h"), k.curve(k.wobble([[0, 0], [30, 40], [60, 10], [90, 50]], 3, "w"), false)]; });
        t.eq([d[3], d[4], d[8]], again, "same seed, same path data");
      }
    },
    {
      name: "unique ids per slide, each svg with its own defs (A3); two instances never collide",
      async run(t) {
        const build = (CS, ctx) => {
          const k = CS.art.kit, u = k.uid(ctx.slideId), mk = (ns) => { const uu = ns ? k.uid(ctx.slideId, ns) : u, id = uu(), id2 = uu(); return k.svg(60, 60, [k.path(k.disc(30, 30, 20), { fill: "url(#" + id + ")", "clip-path": "url(#" + id2 + ")" })], { defs: [k.el("radialGradient", { id: id }, [k.el("stop", { offset: 0, "stop-color": "#FF0000" }), k.el("stop", { offset: 1, "stop-color": "#0000FF" })]), k.el("clipPath", { id: id2 }, [k.el("rect", { x: 0, y: 0, width: 60, height: 60 })])] }); };
          const wrap = document.createElement("div"); wrap.appendChild(mk()); wrap.appendChild(mk("r2")); wrap.appendChild(mk("r3"));
          return wrap;
        };
        const a = await t.art.mount(build, null, { slideId: "s05" }), b = await t.art.mount(build, null, { slideId: "s06", keep: true });
        t.eq((await t.art.safe(a)).violations, []);
        const ids = await t.art.evaluate(() => [].map.call(document.querySelectorAll("#art-stage svg [id]"), (e) => e.id));
        t.eq(new Set(ids).size, ids.length, "ids are unique across slides and instances: " + ids.join(","));
        t.ok(ids.every((i) => /^v(s05|s06)(-r\d)?-\d+$/.test(i)), "ids look like v<slideId>[-ns]-<n>");
        // a reference to an id that lives in another svg is a violation (replay serialises every svg standalone)
        const bad = await t.art.mount((CS, ctx) => { const k = CS.art.kit, w = document.createElement("div"), u = k.uid("x"); const id = u();
          w.appendChild(k.svg(10, 10, [], { defs: [k.el("linearGradient", { id: id })] })); w.appendChild(k.svg(10, 10, [k.path("M0 0h10v10z", { fill: "url(#" + id + ")" })])); return w; });
        const sb = await t.art.safe(bad);
        t.ok(sb.violations.some((v) => v.rule === "A3"), "safe() catches a cross-svg reference");
        t.ok(b.html === "" || typeof b.html === "string");
      }
    },
    {
      name: "the budget of A9 (24 KB of path data, 800 elements) and the element rules are enforced by safe(); the kit refuses what a painter cannot draw",
      async run(t) {
        const many = await t.art.mount((CS) => { const k = CS.art.kit, kids = []; for (let i = 0; i < 801; i++) kids.push(k.path("M0 0h1", { fill: "none", stroke: "#000000" })); return k.svg(10, 10, kids); });
        t.ok((await t.art.safe(many)).violations.some((v) => v.rule === "A9"), "801 elements trip A9");
        const long = await t.art.mount((CS) => { const k = CS.art.kit; return k.svg(10, 10, [k.path("M0 0" + "h1v1h-1".repeat(3500), { fill: "none", stroke: "#000000" })]); });
        t.ok((await t.art.safe(long)).violations.some((v) => v.rule === "A9"), "25 KB of path data trips A9");
        const raw = await t.art.mount((CS) => { const d = document.createElement("div"); d.innerHTML = '<svg viewBox="0 0 10 10"><text x="1" y="5">x</text><filter id="vf"/><path d="M0 0" fill="var(--x)" pathLength="1"/><g pathLength="1" data-m="bogus"/></svg><span style="outline:2px solid #000;opacity:.5">a</span><style>.a{}</style>'; return d; });
        const rules = new Set((await t.art.safe(raw)).violations.map((v) => v.rule));
        for (const r of ["A1", "A2", "A6", "A10", "A11"]) t.ok(rules.has(r), "safe() reports " + r + ": " + [...rules].join(","));
        const refused = await t.art.evaluate(() => {
          const k = CS.art.kit, tries = {
            text: () => k.el("text", {}), filter: () => k.el("filter", {}), image: () => k.el("image", {}), foreign: () => k.el("foreignObject", {}), style: () => k.el("style", {}),
            varFill: () => k.el("path", { d: "M0 0", fill: "var(--cs-accent)" }), mixFill: () => k.el("path", { d: "M0 0", fill: "color-mix(in srgb, red, blue)" }), rgbFill: () => k.el("path", { d: "M0 0", fill: "rgb(1,2,3)" }),
            namedFill: () => k.el("path", { d: "M0 0", stroke: "red" }), onclick: () => k.el("path", { d: "M0 0", onclick: "x()" }), styleAttr: () => k.el("path", { d: "M0 0", style: "fill:red" }),
            filterCss: () => k.html("div", null, { filter: "blur(2px)" }), outline: () => k.html("div", null, { outline: "2px solid #000" }), opacity: () => k.html("div", null, { opacity: 0.5 }),
            spacing: () => k.html("span", null, { letterSpacing: "2px" }), justify: () => k.html("div", null, { textAlign: "justify" }), italic: () => k.html("span", null, { fontStyle: "italic" }),
            mask: () => k.html("div", null, { maskImage: "linear-gradient(#000,#fff)" }), clip: () => k.html("div", null, { clipPath: "circle(40%)" }), conic: () => k.html("div", null, { background: "conic-gradient(red, blue)" }),
            inset: () => k.html("div", null, { boxShadow: "inset 0 0 4px #000" }), img: () => k.html("img"), cssVar: () => k.html("div", null, { color: "var(--cs-ink)" }), nan: () => k.disc(NaN, 0, 5), inf: () => k.path("M0 0", { "stroke-width": Infinity })
          }, out = {};
          for (const n in tries) { try { tries[n](); out[n] = "accepted"; } catch (e) { out[n] = e.code; } }
          out.flex = (() => { try { k.html("div", { class: "x" }, { display: "flex", justifyContent: "center", gap: 24, flex: 1 }); return "ok"; } catch (e) { return e.message; } })();
          return out;
        });
        for (const [n, v] of Object.entries(refused)) if (n !== "flex") t.eq(v, "E_PAINT_UNSUPPORTED", n + " is refused");
        t.eq(refused.flex, "ok", "flex layout (justify-content) is allowed");
      }
    },
    {
      name: "seeded randomness (A8): the same seed gives the same sequence, nothing reads a clock, and no source uses Math.random or Date",
      needsPage: false,
      async run(t) {
        const files = ["root", "kit", "icon", "object", "anchor-icon", "index"].map((f) => path.join(REPO, "src/art", f + ".js")).concat(path.join(REPO, "src/visual/api.js"));
        for (const f of files) {
          const src = fs.readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
          t.ok(!/Math\.random|\bDate\b|performance\.|setTimeout|fetch\(|XMLHttpRequest|localStorage|getBoundingClientRect/.test(src), path.basename(f) + " reads no clock, network, storage or layout");
          t.ok(/^\(function \(\) \{/m.test(src) && /\}\)\(\);\s*$/.test(src), path.basename(f) + " wraps itself in one IIFE");
          t.ok(!/analytics|lucide\.dev/.test(src), path.basename(f) + " carries no forbidden word");
        }
      }
    },
    {
      name: "rng and hash are deterministic and match CS.core.canon.fnv1a64",
      async run(t) {
        const r = await t.art.evaluate(() => {
          const k = CS.art.kit, a = k.rng("seed-1"), b = k.rng("seed-1"), c = k.rng("seed-2"), sa = [a(), a(), a.range(5, 6), a.int(10)], sb = [b(), b(), b.range(5, 6), b.int(10)];
          return { eq: JSON.stringify(sa) === JSON.stringify(sb), diff: c() !== k.rng("seed-1")(), inRange: sa.slice(0, 2).every((x) => x >= 0 && x < 1) && sa[2] >= 5 && sa[2] < 6 && sa[3] >= 0 && sa[3] < 10, hash: k.hash("s05anchor") === CS.core.canon.fnv1a64("s05anchor"), len: k.hash("x").length,
            mean: (() => { const q = k.rng("mean"); let s = 0; for (let i = 0; i < 2000; i++) s += q(); return s / 2000; })(), pick: k.rng("p").pick(["a", "b", "c"]), sign: [k.rng("1").sign(), k.rng("2").sign(), k.rng("3").sign(), k.rng("4").sign()] };
        });
        t.ok(r.eq, "same seed, same numbers"); t.ok(r.diff, "another seed differs"); t.ok(r.inRange, "range, int and unit interval hold"); t.ok(r.hash, "hash is fnv1a64"); t.eq(r.len, 16);
        t.near(r.mean, 0.5, 0.03, "the generator is roughly uniform"); t.ok(["a", "b", "c"].includes(r.pick)); t.ok(r.sign.every((x) => x === 1 || x === -1));
      }
    },
    {
      name: "the stroke ladder equals the table of layout_budget.py: stroke_px = max(units x g / 24, floor), floors 4 px at xs and 5 px at sm and md",
      async run(t) {
        const r = await t.art.evaluate(([SIZES, PRESETS]) => {
          const k = CS.art.kit, out = {};
          for (const p of PRESETS) {
            const art = __art.ctx({ preset: p }).art;
            out[p] = SIZES.map((s) => Math.round(k.ladder(s, art.stroke) * 100) / 100);
            // the rendered glyph: stroke-width (24-unit) x scale = px
            out[p + ":svg"] = SIZES.map((s) => { const el = CS.art.icon("clock", { ctx: __art.ctx({ preset: p }), size: s, treatment: "bare" }), g = el.querySelector("g"), path = g.querySelector("path"); const sc = parseFloat(/scale\(([-\d.]+)/.exec(g.getAttribute("transform"))[1]); return Math.round(parseFloat(path.getAttribute("stroke-width")) * sc * 100) / 100; });
          }
          out.units = [k.units("xs", 2), k.units("md", 2), k.units("lg", 2)];
          return out;
        }, [SIZES, PRESETS]);
        for (const p of PRESETS) {
          r[p].forEach((v, i) => t.near(v, LADDER[p][i], 0.01, `${p} ${SIZES[i]}: ladder`));
          r[p + ":svg"].forEach((v, i) => t.near(v, LADDER[p][i], 0.06, `${p} ${SIZES[i]}: rendered stroke in px`));
        }
        t.near(r.units[0], 2.4, 0.01, "2.0 units at xs is laddered to 4 px = 2.4 units"); t.near(r.units[1], 2.0, 0.01); t.near(r.units[2], 2.0, 0.01);
        t.near(LADDER.heritage[2] * 390 / 1080, 2.17, 0.01, "heritage at md is 2.2 px in the feed");
      }
    },
    {
      name: "kit.palette resolves every role as hex for all 18 tones: ink reads on the tint at 4.5:1, onAccent on the accent, supports and paper exist",
      async run(t) {
        const r = await t.art.evaluate(([TONES, ART]) => {
          const k = CS.art.kit, c = CS.core.color, out = [];
          for (const p in TONES) for (const tone in TONES[p]) {
            const tk = __art.ctx({ preset: p, tone }).tokens, pal = k.palette(tk), hex = /^#[0-9A-F]{6}$/;
            out.push({ id: p + "/" + tone, hex: ["bg", "surface", "ink", "inkMuted", "accent", "accent2", "onAccent", "line", "tint", "paper", "note"].every((r) => hex.test(pal[r])) && pal.support.every((s) => hex.test(s)),
              tintInk: c.contrast(pal.ink, pal.tint), on: c.contrast(k.on(pal.accent, pal), pal.accent), onTint: c.contrast(k.on(pal.tint, pal), pal.tint), sup: pal.support.join(), same: k.palette(tk) === pal,
              base: k.base(pal, pal.bg, false), baseVsInk: c.contrast(k.base(pal, pal.bg, false), pal.ink) });
          }
          const bare = k.palette(), partial = k.palette({ accent: "#0B5" });
          return { rows: out, bare: [bare.bg, bare.ink, bare.accent, bare.tint], partial: partial.accent, none: k.dna().cap + k.dna().container + k.dna().shadow.kind };
        }, [TONES, ART]);
        t.eq(r.rows.length, 18);
        for (const row of r.rows) {
          t.ok(row.hex, row.id + ": every role is hex"); t.ok(row.tintInk >= 4.5, row.id + ": ink on tint " + row.tintInk.toFixed(2)); t.ok(row.on >= 4.5, row.id + ": glyph on accent " + row.on.toFixed(2));
          t.ok(row.onTint >= 4.5, row.id + ": glyph on tint"); t.ok(row.same, row.id + ": the palette is memoised per tokens object");
        }
        t.eq(r.bare.length, 4); t.eq(r.partial, "#00BB55", "a 3-digit accent is expanded"); t.eq(r.none, "roundsquarenone", "an empty art block is a neutral DNA");
        t.eq(r.rows.find((x) => x.id === "creator/base").sup, "#FF8FB1,#6EC6FF", "support hues come from the preset");
      }
    },
    {
      name: "kit.dna fills every field and rejects junk; kit.session reads ctx, options win",
      async run(t) {
        const r = await t.art.evaluate(() => {
          const k = CS.art.kit, d = k.dna({ stroke: "x", cap: "weird", join: 5, radius: { chip: 9 }, shadow: { kind: "hard" }, outline: -1 }), s = k.session({ ctx: __art.ctx({ preset: "creator" }), rtl: false, seed: "zz" });
          return { d: d, s: { rtl: s.rtl, seed: s.seed, cap: s.dna.cap, accent: s.tk.accent }, dflt: k.session({}).rtl, soft: k.dna({ shadow: { kind: "soft" } }).shadow, none: k.dna({ shadow: { kind: "glow" } }).shadow.kind, ctxSeed: k.session({ ctx: { slideId: "s09" } }).seed };
        });
        t.eq(r.d.stroke, 2); t.eq(r.d.cap, "round"); t.eq(r.d.join, "round"); t.eq(r.d.radius, { chip: 9, tile: 0, card: 0, panel: 0, window: 0 }); t.eq(r.d.shadow, { kind: "hard", dx: 6, dy: 6, blur: 0 });
        t.eq(r.s, { rtl: false, seed: "zz", cap: "round", accent: "#FFD23F" }); t.eq(r.dflt, true, "Arabic first: rtl defaults to true"); t.eq(r.soft, { kind: "soft", dx: 0, dy: 12, blur: 24 }); t.eq(r.none, "none"); t.eq(r.ctxSeed, "s09");
      }
    },
    {
      name: "the container grammar follows the preset DNA: disc, hand circle with a retrace, stamp with an inner rule, app tile, arch, square; badges differ",
      async run(t) {
        const r = await t.art.evaluate((PRESETS) => {
          const k = CS.art.kit, b = { x: 0, y: 0, w: 100, h: 100 }, out = {};
          for (const p of PRESETS) {
            const dna = k.dna(__art.ctx({ preset: p }).art);
            out[p] = ["chip", "tile", "plate", "card", "badge"].map((kind) => { const s = k.shape(kind, b, dna, "seed"); return { kind, d: s.d.length, closed: /[Zz]$/.test(s.d), extra: s.x.length, arcs: (s.d.match(/A/g) || []).length, curves: (s.d.match(/C/g) || []).length, again: JSON.stringify(s) === JSON.stringify(k.shape(kind, b, dna, "seed")) }; });
          }
          return out;
        }, PRESETS);
        const get = (p, kind) => r[p].find((x) => x.kind === kind);
        for (const p of PRESETS) for (const x of r[p]) { t.ok(x.closed && x.d > 10, `${p} ${x.kind} is a closed path`); t.ok(x.again, `${p} ${x.kind} is deterministic`); }
        t.eq(get("creator", "chip").arcs >= 4, true, "creator chip is a disc (arcs)"); t.eq(get("notebook", "chip").extra, 1, "notebook chip has a retrace line"); t.ok(get("notebook", "chip").curves >= 8, "notebook chip is a hand-drawn blob");
        t.eq(get("poster", "chip").extra, 1, "poster chip carries the stamp's inner rule"); t.eq(get("poster", "card").extra, 0, "a stamp card does not");
        t.eq(get("swiss", "tile").arcs, 0, "swiss is square"); t.ok(get("interface", "tile").arcs >= 4, "interface tiles are rounded"); t.ok(get("heritage", "chip").arcs >= 2, "heritage chips are arches");
        t.ok(get("heritage", "plate").arcs >= 2 && get("heritage", "card").arcs <= 4, "a heritage plate is an arch, a card stays a card");
        t.eq(new Set(PRESETS.map((p) => get(p, "badge").d)).size >= 4, true, "badges are not one shape for every preset");
      }
    },
    {
      name: "RTL and LTR build in logical coordinates (A7): the duo offset and the shadow follow the end side; only a mirror:true glyph is flipped",
      async run(t) {
        const r = await t.art.evaluate(() => {
          const out = {}, mk = (rtl, o) => CS.art.icon("arrow-left", Object.assign({ ctx: __art.ctx({ preset: "creator", rtl }), size: "lg", treatment: "duo" }, o));
          for (const rtl of [true, false]) {
            const host = document.createElement("div"); document.body.appendChild(host);
            const el = mk(rtl), c = el.querySelector("path"); // the duo container
            host.appendChild(el);
            const bb = c.getBBox(), W = parseFloat(el.getAttribute("width"));
            out[rtl ? "rtl" : "ltr"] = { cx: bb.x + bb.width / 2 - W / 2, cy: bb.y + bb.height / 2 - W / 2 }; el.remove();
            const st = CS.art.icon("clock", { ctx: __art.ctx({ preset: "creator", rtl }), size: "lg", treatment: "tile" }), sh = st.querySelector("path"); host.appendChild(st);
            const sb = sh.getBBox(); out[(rtl ? "rtl" : "ltr") + "Shadow"] = sb.x + sb.width / 2 - parseFloat(st.getAttribute("width")) / 2; st.remove(); host.remove();
          }
          out.mirror = [mk(true, { mirror: true }).querySelector("g").getAttribute("transform"), mk(true).querySelector("g").getAttribute("transform")];
          out.flip = [CS.art.kit.flip(true, 100)(10, 20), CS.art.kit.flip(false, 100)(10, 20)];
          return out;
        });
        t.ok(r.rtl.cx < -1 && r.ltr.cx > 1, `the duo container moves toward the end side (rtl ${r.rtl.cx.toFixed(1)}, ltr ${r.ltr.cx.toFixed(1)})`); t.ok(r.rtl.cy > 1 && r.ltr.cy > 1, "and down");
        t.ok(r.rtlShadow < -1 && r.ltrShadow > 1, "the hard shadow falls toward the end side");
        t.ok(/scale\(-/.test(r.mirror[0]) && !/scale\(-/.test(r.mirror[1]), "mirror:true flips the glyph and nothing else"); t.eq(r.flip, [70, 10]);
      }
    },
    {
      name: "the icon anchor: one container centred in its box, an owner, its caption a fit slot, boxes in body-zone coordinates, labelsOnly skips geometry",
      async run(t) {
        const anchor = { kind: "icon", icon: "clock", captions: ["وقت"] };
        for (const preset of PRESETS) {
          const r = await t.art.render(anchor, { preset, box: { w: 852, h: 420, x: 0, y: 40 }, png: false });
          t.ok(r && r.rect.w === 852 && r.rect.h === 420, preset + ": the anchor fills its box");
          t.eq((await t.art.safe(r, { content: true })).violations, [], preset + ": safe()");
          const owner = r.boxes.find((b) => b.kind === "owner"), text = r.boxes.find((b) => b.kind === "text"), ink = r.boxes.find((b) => b.kind === "ink");
          t.ok(owner && text && ink, preset + ": owner, ink and text boxes"); t.ok(owner.y >= 40 && owner.y + owner.h <= 40 + 420, preset + ": the container stays in the box");
          t.ok(owner.w >= 240 - 0.5 && Math.abs(owner.w - owner.h) < 0.01, preset + ": a container of at least 240 px, square: " + owner.w);
          t.eq(r.labels, [{ text: "وقت", role: "small", index: 0 }]);
          t.ok(ink.ownerOf === owner.id, "the glyph names its owner");
        }
        const peek = await t.art.render(anchor, { preset: "creator", recipe: "over", box: { w: 852, h: 560 }, png: false });
        t.ok(/data-treatment="giant"/.test(peek.html), "a peak recipe takes the giant treatment");
        const small = await t.art.render({ kind: "icon", icon: "clock" }, { preset: "swiss", box: { w: 852, h: 280 }, png: false });
        t.ok(small.boxes[0].h <= 280, "the largest size whose container fits a 280 px box is chosen: " + small.boxes[0].h);
        const lo = await t.art.evaluate(() => { const c = __art.ctx({ preset: "swiss", labelsOnly: true }), r = CS.art.build({ kind: "icon", icon: "clock", captions: ["a b"] }, c); return { el: r.el, boxes: r.boxes, labels: r.labels.map((l) => l.text) }; });
        t.eq(lo, { el: null, boxes: [], labels: ["a b"] }, "labelsOnly returns the labels and no geometry");
        const fb = await t.art.render({ kind: "icon", object: "no-such-object", icon: "trophy" }, { preset: "swiss", png: false });
        t.ok(fb && /data-icon="trophy"/.test(fb.html), "a missing object falls back to its Lucide glyph");
        t.eq(await t.art.render({ kind: "icon", icon: "no-such-icon" }, { png: false }), null, "nothing to draw returns null");
        const a = await t.art.render(anchor, { preset: "notebook", png: false }), b = await t.art.render(anchor, { preset: "notebook", png: false });
        t.eq(a.html, b.html, "same input, same bytes");
      }
    },
    {
      name: "the icon and field anchors build in every preset x tone x direction (RTL and LTR) with a box origin, stay inside the content box, and paint alike in both painters",
      async run(t) {
        const kinds = [{ kind: "icon", icon: "clock", captions: ["وقت"] }, { kind: "icon", object: "trophy", captions: ["Top 3"] }, { kind: "field", icon: "target", captions: ["هدف"] }];
        for (const preset of PRESETS) for (const tone of ["base", "invert", "field"]) for (const rtl of [true, false]) for (const [i, anchor] of kinds.entries()) {
          const r = await t.art.render(anchor, { preset, tone, rtl, slideId: "s0" + (i + 3), box: { w: 852, h: 440, x: 0, y: 24 }, png: false });
          t.ok(r, `${preset}/${tone}/${rtl ? "rtl" : "ltr"}/${i}: builds`);
          const s = await t.art.safe(r, { content: true });
          t.eq(s.violations, [], `${preset}/${tone}/${rtl ? "rtl" : "ltr"}/${i}: ${JSON.stringify(s.violations.slice(0, 2))}`);
        }
        for (const preset of ["swiss", "creator", "notebook", "poster", "interface", "heritage"]) {
          const r = await t.art.render({ kind: "icon", icon: "clock", captions: ["وقت"] }, { preset, png: false }), p = await t.art.paintBoth(r);
          t.gte(p.ssim, 0.98, `${preset}: the anchor slide paints alike in the svg and replay painters (${p.ssim.toFixed(4)})`);
        }
        const dup = await t.art.render(kinds[0], { preset: "creator", png: false });
        t.eq((await t.art.evaluate(() => [].map.call(document.querySelectorAll("#art-stage [data-seed]"), (e) => e.getAttribute("data-seed")))).length, 1, "one anchor per render"); t.ok(dup.html.includes('data-seed="'));
      }
    },
    {
      name: "the field anchor: a colour panel that is an owner, with the same single container on it; the outline of the DNA is its border",
      async run(t) {
        for (const preset of PRESETS) {
          const r = await t.art.render({ kind: "field", object: "trophy", captions: ["أول مكان"] }, { preset, box: { w: 852, h: 460 }, png: false });
          t.ok(r, preset + ": builds");
          t.eq((await t.art.safe(r, { content: true })).violations, [], preset + ": safe()");
          t.ok(/data-art="field"/.test(r.html) && /<div class="cs-art-panel"[^>]*data-owner="1"/.test(r.html), preset + ": the panel is the owner");
          t.ok(r.boxes[0].kind === "owner" && r.boxes[0].w === 852 && r.boxes[0].h === 460, preset + ": the owner box is the panel");
          t.ok(r.boxes.slice(1).every((b) => b.ownerOf === "f"), preset + ": content names the panel");
        }
        const cr = await t.art.render({ kind: "field", icon: "clock" }, { preset: "creator", png: false });
        t.ok(/border:4px solid #14120F/i.test(cr.html), "creator's 4 px ink outline is the panel border");
      }
    }
  ]
};
