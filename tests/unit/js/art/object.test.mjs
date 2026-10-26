// tests/unit/js/art/object.test.mjs · CS.art.object and the icon / field anchors (package A1b, r2 S-2): the outline rule, its colour, the miter limit, the retrace, the registrations,
// rebuild on a new box and the null at the limit (no token fits), caption floors and boxes, the price-tag label box and its colour on the painted background (field, every treatment x tone),
// field objects under an outline-colour override, and the contact sheets (node tests/unit/js/art/run.mjs --only object [--out DIR]).
import { PRESETS } from "./support/dna.mjs";

const TAG = { d: ["M2.5 12L7 6h12.5a2 2 0 0 1 2 2v8a2 2 0 0 1 -2 2H7z", "M7 12a.5.5 0 1 0 1 0 .5.5 0 1 0 -1 0"], f: [0, 1] };   // the shipped cs-price-tag-ar (checked against the real pack below)
const rule = (ratio, g) => Math.min(20, Math.max(4, Math.round(Math.min(0.04, Math.max(0.03, ratio)) * g)));

export default {
  module: "object",
  tests: [
    {
      name: "FIX-A: a planned inner icon field draws a real panel with measured ownership; covers keep the original icon, twice",
      async run(t) {
        const anchor = { kind: "icon", icon: "clock", size: "hero" }, out = [];
        for (let i = 0; i < 2; i++) {
          const r = await t.art.render(anchor, { preset: "creator", box: { w: 852, h: 600 }, slide: { id: "s05", type: "item", visual: { field: true } }, png: false });
          t.ok(r);
          const facts = await t.art.evaluate(sel => { const e = document.querySelector(sel + " .cs-art"); return { kind: e.dataset.anchorKind, panel: !!e.querySelector("[data-plate]"), width: e.querySelector("svg").getBoundingClientRect().width }; }, r.sel);
          t.eq(facts.kind, "icon"); t.ok(facts.panel); t.gte(facts.width, 500, "the icon grows to own its zone");
          t.ok(r.boxes.some(b => b.kind === "owner" && b.fill === 1 && b.border > 0));
          const owners = await t.art.evaluate(boxes => CS.visual.deadSpace(boxes, { w: 852, h: 600 }).owners, r.boxes);
          t.ok(owners.length === 1 && owners[0].ok, "the real dead-space measure accepts the panel's painted coverage");
          t.eq((await t.art.safe(r, { content: true })).violations, []);
          t.gte((await t.art.paintBoth(r)).ssim, 0.98);
          out.push({ html: r.html, boxes: r.boxes, facts });
        }
        t.eq(out[0], out[1]);
        const c = { id: "s01", type: "cover" }, a = await t.art.render(anchor, { slide: c, png: false }), b = await t.art.render(anchor, { slide: { ...c, visual: { field: true } }, png: false });
        t.eq(a.html, b.html, "cover markup is unchanged by the new inner field behavior");
      }
    },
    {
      name: "S-2 outline: px = clamp(round(ratio x glyph box), 4, 20) with the ratio held to 0.03-0.04 (0.035 by default); the same on every DNA, whatever the icon stroke; o.objectOutline wins over art.objectOutline",
      async run(t) {
        const r = await t.art.evaluate(([PRESETS]) => {
          const out = { sizes: {}, ratios: {}, dna: {} };
          const px = (o, art, preset) => {
            const ctx = __art.ctx({ preset: preset || "swiss" }); if (art) ctx.art = Object.assign({}, ctx.art, art);
            const el = CS.art.object("trophy", Object.assign({ ctx, treatment: "bare" }, o)), g = el.querySelector("g"), sc = parseFloat(/scale\(([-\d.]+)/.exec(g.getAttribute("transform"))[1]);
            return Math.round(parseFloat(el.querySelector("path").getAttribute("stroke-width")) * sc);
          };
          for (const s of ["xs", "sm", "md", "lg", "xl", "hero", 480, 640, 24]) out.sizes[s] = px({ size: s });
          for (const q of [0.03, 0.035, 0.04, 0.5, 0.001, "x", null]) out.ratios[q] = px({ size: "xl" }, { objectOutline: q });
          out.override = [px({ size: "xl" }, { objectOutline: 0.03 }, "swiss"), px({ size: "xl", objectOutline: 0.04 }, { objectOutline: 0.03 }, "swiss")];
          for (const p of PRESETS) out.dna[p] = px({ size: "lg" }, null, p);
          out.stroke = [px({ size: "lg", stroke: 1.5 }), px({ size: "lg", stroke: 3 })];
          out.fn = [CS.art.object.outline("lg", {}), CS.art.object.outline("hero", { objectOutline: 0.04 }), CS.art.object.outline(640, {}), CS.art.object.outline("xs")];
          return out;
        }, [PRESETS]);
        const G = { xs: 40, sm: 64, md: 96, lg: 160, xl: 240, hero: 320, 480: 480, 640: 640, 24: 24 };
        for (const [s, v] of Object.entries(r.sizes)) t.eq(v, rule(0.035, G[s]), `size ${s}: ${v} px`);
        t.eq([r.sizes.xs, r.sizes.sm, r.sizes.md, r.sizes.lg, r.sizes.xl, r.sizes.hero], [4, 4, 4, 6, 8, 11], "the table of S-2: 4 4 4 6 8 11 px at xs sm md lg xl hero"); t.eq(r.sizes[640], 20, "never above 20 px"); t.eq(r.sizes[24], 4, "never below 4 px");
        for (const [q, v] of Object.entries(r.ratios)) t.eq(v, rule(!isNaN(+q) && q !== "null" ? +q : 0.035, 240), `ratio ${q} -> ${v} px at xl`);
        t.eq([r.ratios[0.5], r.ratios[0.001]], [10, 7], "a ratio outside 0.03-0.04 is held to the range: 10 px at 0.5, 7 px at 0.001 (xl)");
        t.eq(r.override, [7, 10], "o.objectOutline beats art.objectOutline"); t.ok(Object.values(r.dna).every((v) => v === 6), "the outline does not depend on the DNA stroke: " + JSON.stringify(r.dna)); t.eq(r.stroke, [6, 6], "nor on o.stroke");
        t.eq(r.fn, [6, 13, 20, 4], "CS.art.object.outline(size, o) is the same rule");
      }
    },
    {
      name: "the outline colour: ink by default; art.outlineColor (role or hex) and o.outlineColor (which wins) recolour every path; junk falls back to ink; base never equals or vanishes against the outline",
      async run(t) {
        const r = await t.art.evaluate(() => {
          const out = {}, k = CS.art.kit, c = CS.core.color, tk = k.palette(__art.ctx({ preset: "notebook" }).tokens);
          const draw = (art, o, preset) => {
            const ctx = __art.ctx({ preset: preset || "notebook" }); if (art) ctx.art = Object.assign({}, ctx.art, art);
            const ps = [].slice.call(CS.art.object("phone", Object.assign({ ctx, size: "xl" }, o)).querySelectorAll("path"));
            return { strokes: [...new Set(ps.map((p) => p.getAttribute("stroke")))], fills: [...new Set(ps.map((p) => p.getAttribute("fill")))] };
          };
          out.def = draw(); out.role = draw({ outlineColor: "accent" }); out.hex = draw({ outlineColor: "#1D2B5A" }); out.sup = draw({ outlineColor: "support1" }); out.o = draw({ outlineColor: "accent" }, { outlineColor: "#112233" }); out.junk = draw({ outlineColor: "navy" });
          out.legacy = draw(null, { ink: "accent" }); out.tk = { ink: tk.ink, accent: tk.accent, support1: tk.support[0], bg: tk.bg };
          out.baseVs = out.role.fills.filter((f) => f !== tk.surface).map((f) => c.contrast(f, tk.accent));
          out.tones = [];
          for (const p of ["swiss", "creator", "notebook", "poster", "interface", "heritage"]) for (const tone of ["base", "invert", "field"]) for (const oc of ["ink", "accent"]) {
            const ctx = __art.ctx({ preset: p, tone }); ctx.art = Object.assign({}, ctx.art, { outlineColor: oc }); const t0 = k.palette(ctx.tokens);
            const ps = [].slice.call(CS.art.object("trophy", { ctx, size: "lg" }).querySelectorAll("path")), line = ps[0].getAttribute("stroke"), fills = [...new Set(ps.map((x) => x.getAttribute("fill")))];
            out.tones.push({ id: p + "/" + tone + "/" + oc, line, want: oc === "ink" ? t0.ink : t0.accent, fills, minVsLine: Math.max(...fills.filter((f) => f !== t0.surface).map((f) => c.contrast(f, line))) });
          }
          return out;
        });
        t.eq(r.def.strokes, [r.tk.ink], "ink by default"); t.eq(r.role.strokes, [r.tk.accent], "art.outlineColor: accent"); t.eq(r.hex.strokes, ["#1D2B5A"], "art.outlineColor: a hex"); t.eq(r.sup.strokes, [r.tk.support1], "art.outlineColor: support1");
        t.eq(r.o.strokes, ["#112233"], "o.outlineColor beats the preset"); t.eq(r.junk.strokes, [r.tk.ink], "an unknown colour name falls back to ink"); t.eq(r.legacy.strokes, [r.tk.accent], "o.ink is still read as the outline colour");
        t.ok(!r.role.fills.includes(r.tk.accent), "with an accent outline the base binds to another hue: " + r.role.fills.join(" "));
        for (const x of r.tones) { t.eq(x.line, x.want, x.id + ": the outline colour"); t.ok(x.minVsLine >= 1.8, x.id + ": a fill differs from the outline (" + x.minVsLine.toFixed(2) + ")"); }
      }
    },
    {
      name: "miter limit 2 on every outline path of a miter DNA (swiss, poster), none on round DNAs; the die-cut keyline is always round",
      async run(t) {
        const r = await t.art.evaluate(() => {
          const out = {}, ids = CS.art.object.ids();
          for (const p of ["swiss", "poster", "creator", "notebook", "interface", "heritage"]) {
            const ctx = __art.ctx({ preset: p }), all = [];
            for (const id of ids) { const ps = [].slice.call(CS.art.object(id, { ctx, size: "xl" }).querySelectorAll("path")); ps.forEach((x) => all.push(x.getAttribute("stroke-miterlimit") + "|" + x.getAttribute("stroke-linejoin"))); }
            const st = [].slice.call(CS.art.object(ids[0], { ctx, size: "xl", treatment: "sticker" }).querySelectorAll("path"));
            out[p] = { all: [...new Set(all)], paper: [...new Set(st.filter((x) => x.getAttribute("stroke") === ctx.tokens.surface).map((x) => x.getAttribute("stroke-miterlimit") + "|" + x.getAttribute("stroke-linejoin")))] };
          }
          return out;
        });
        for (const p of ["swiss", "poster"]) t.eq(r[p].all, ["2|miter"], p + ": miterlimit 2, miter joins");
        for (const p of ["creator", "notebook", "interface", "heritage"]) t.eq(r[p].all, ["null|round"], p + ": round joins, no miter limit");
        for (const p of Object.keys(r)) t.ok(r[p].paper.every((v) => v === "null|round"), p + ": the paper keyline is round: " + r[p].paper);
      }
    },
    {
      name: "the retrace of an object: the same S-2 pass on the 48 grid (offsets doubled), under the filled paths, above the die-cut keyline; the outline px and the svg size do not change",
      async run(t) {
        const r = await t.art.evaluate(() => {
          const k = CS.art.kit, out = {};
          const mk = (art, o, preset) => { const ctx = __art.ctx({ preset: preset || "notebook" }); ctx.art = Object.assign({}, ctx.art, art); return CS.art.object.full("trophy", Object.assign({ ctx, size: "xl" }, o)); };
          const info = (r) => {
            const rt = r.el.querySelector('[data-part="retrace"]'), main = rt ? rt.parentNode : [].slice.call(r.el.querySelectorAll("g")).filter((x) => /scale\(/.test(x.getAttribute("transform") || "")).pop(), sc = parseFloat(/scale\(([-\d.]+)/.exec(main.getAttribute("transform"))[1]), fills = [].slice.call(main.querySelectorAll(":scope > path"));
            return { w: r.w, pad: r.pad, vb: r.el.getAttribute("viewBox"), has: !!rt, tr: rt && rt.getAttribute("transform"), first: !!rt && main.firstElementChild === rt, px: parseFloat(fills[0].getAttribute("stroke-width")) * sc, n: fills.length,
              copies: rt ? [].slice.call(rt.querySelectorAll("path")).map((p) => [p.getAttribute("fill"), p.getAttribute("stroke"), parseFloat(p.getAttribute("stroke-width")) * sc, p.getAttribute("stroke-linejoin")]) : [], groups: [].slice.call(r.el.children).filter((x) => x.localName === "g").length };
          };
          out.off = info(mk({}, {})); out.on = info(mk({ retrace: true }, {})); out.spec = info(mk({ retrace: { dx: -1, dy: 1.5, rot: 3, tint: "accent" } }, {})); out.killed = info(mk({ retrace: true }, { retrace: false }));
          out.sticker = info(mk({ retrace: true }, { treatment: "sticker" }, "creator")); out.stickerOff = info(mk({}, { treatment: "sticker" }, "creator")); out.chip = info(mk({ retrace: true }, { treatment: "chip" }));
          const ctx = __art.ctx({ preset: "notebook" }), tk = k.palette(ctx.tokens); out.mix = k.tint(tk.ink, tk.bg, 0.5); out.accent = tk.accent;
          return out;
        });
        t.eq(r.off.has, false, "off by default"); t.eq(r.killed.has, false, "o.retrace:false beats the preset"); t.ok(r.on.has && r.on.first, "art.retrace:true: the pass is the first group of the object");
        t.eq([r.on.w, r.on.pad, r.on.vb], [r.off.w, r.off.pad, r.off.vb], "the svg is the same size with and without it"); t.near(r.on.px, r.off.px, 0.1, "the outline px is unchanged: " + r.on.px);
        t.eq(r.on.copies.length, r.on.n, "one copy of every path"); t.ok(r.on.copies.every((c) => c[0] === "none" && c[1] === r.mix && Math.abs(c[2] - 0.85 * r.on.px) < 0.1 && c[3] === "round"), "stroke-only, the ink mixed 50% toward the ground, 0.85 of the outline, round joins");
        t.ok(/translate\(1 0\.8\) rotate\(0\.8 24 24\)/.test(r.on.tr), "defaults on the 48 grid: dx 0.5 and dy 0.4 units become 1 and 0.8: " + r.on.tr);
        t.ok(/translate\(-2 3\) rotate\(3 24 24\)/.test(r.spec.tr) && r.spec.copies.every((c) => c[1] === r.accent), "a spec object: dx -1, dy 1.5, rot 3, tint accent: " + r.spec.tr);
        t.eq([r.sticker.w, r.sticker.pad], [r.stickerOff.w, r.stickerOff.pad], "a die-cut sticker keeps its size"); t.ok(r.sticker.has && r.sticker.copies.length === r.sticker.n, "the sticker carries the retrace in its main group, after the paper keyline");
        t.ok(r.chip.has, "a container treatment carries it too");
      }
    },
    {
      name: "registrations: icon and field own the sub \"icon\"; a second owner of either pair throws E_ART_DUPLICATE atomically; caps report both; the sub of an anchor routes to them",
      async run(t) {
        const r = await t.art.evaluate(() => {
          const A = CS.art, err = (f) => { try { f(); return "none"; } catch (e) { return e.code; } }, before = JSON.stringify(A.caps());
          const out = { caps: A.caps().art, has: [A.has("icon", "icon"), A.has("field", "icon"), A.has("icon", "nope"), A.has("icon"), A.has("field")] };
          out.dup = [err(() => A.register("icon", () => null, ["icon"])), err(() => A.register("field", () => null, ["icon"])), err(() => A.register("field", () => null, ["zz", "icon"]))];
          out.atomic = [A.has("field", "zz"), JSON.stringify(A.caps()) === before]; out.sub = [A._.sub({ kind: "icon", icon: "clock" }), A._.sub({ kind: "field", icon: "clock" }), A._.sub({ kind: "field", object: "trophy" }), A._.sub({ kind: "field", word: "x" })];
          const c = __art.ctx({ preset: "swiss", box: { w: 852, h: 420 } });
          out.build = [!!A.build({ kind: "icon", icon: "clock" }, c), !!A.build({ kind: "field", icon: "clock" }, c), A.build({ kind: "field", word: "x" }, c) === null || A.has("field", "word")];
          return out;
        });
        t.ok(r.caps.icon.includes("icon") && r.caps.field.includes("icon"), "caps(): icon [icon], field includes icon: " + JSON.stringify(r.caps)); t.eq(r.has, [true, true, false, true, true]);
        t.eq(r.dup, ["E_ART_DUPLICATE", "E_ART_DUPLICATE", "E_ART_DUPLICATE"], "a second owner throws, also inside a longer list"); t.eq(r.atomic, [false, true], "a refused registration changes nothing");
        t.eq(r.sub, ["icon", "icon", "icon", "word"]); t.eq(r.build, [true, true, true], "the icon and field anchors build through CS.art.build; a field word is another package's sub");
      }
    },
    {
      name: "rebuild on a new box (anchorSync): the same anchor on 852x420, 852x280, 600x300, 852x900 and back gives the same bytes for the same box; the size follows the box and never overflows; anchor.size is a ceiling; labels do not depend on the box",
      async run(t) {
        const r = await t.art.evaluate(() => {
          const run = (anchor, box, extra) => {
            const c = __art.ctx(Object.assign({ preset: "creator", box }, extra)), res = CS.art.build(anchor, c);
            if (!res) return null;
            const sv = res.el.querySelector("svg.cs-icon");
            return { html: res.el.outerHTML, size: sv.getAttribute("data-size"), w: parseFloat(sv.getAttribute("width")), boxes: res.boxes, labels: res.labels.map((l) => [l.text, l.role, l.index, l.el.getAttribute("data-floor")]) };
          };
          const out = { rows: {} }, anchor = { kind: "icon", icon: "clock", captions: ["وقت"] }, SZ = ["sm", "md", "lg", "xl", "hero"];
          const boxes = { A: { w: 852, h: 420 }, B: { w: 852, h: 280 }, C: { w: 600, h: 300 }, D: { w: 852, h: 900 }, E: { w: 852, h: 420, x: 0, y: 40 } };
          for (const [k, b] of Object.entries(boxes)) out.rows[k] = run(anchor, b);
          out.again = run(anchor, boxes.A); out.back = run(anchor, boxes.A); out.fieldA = run({ kind: "field", object: "trophy", captions: ["أول"] }, boxes.A); out.fieldB = run({ kind: "field", object: "trophy", captions: ["أول"] }, boxes.B); out.fieldA2 = run({ kind: "field", object: "trophy", captions: ["أول"] }, boxes.A);
          out.ceil = SZ.map((s) => run({ kind: "icon", icon: "clock", size: s }, boxes.D).size); out.ceilSmall = SZ.map((s) => run({ kind: "icon", icon: "clock", size: s }, boxes.B).size);
          out.noCap = run({ kind: "icon", icon: "clock" }, boxes.B); out.ctxSize = run({ kind: "icon", icon: "clock" }, boxes.D, { size: "md" }).size;
          const lo = (b) => { const c = __art.ctx({ preset: "creator", box: b, labelsOnly: true }), r2 = CS.art.build({ kind: "icon", icon: "cs-price-tag-ar", captions: ["250"] }, c); return { el: r2.el, boxes: r2.boxes, labels: r2.labels.map((l) => [l.text, l.role, l.index]) }; };
          out.lo = [lo(boxes.A), lo(boxes.B), lo(boxes.D)];
          return out;
        });
        const order = ["sm", "md", "lg", "xl", "hero"], ix = (k) => order.indexOf(r.rows[k].size);
        t.ok(ix("B") <= ix("A") && ix("A") <= ix("D") && ix("B") < ix("D"), "a smaller box draws a smaller token: " + ["B", "A", "D"].map((k) => r.rows[k].size).join(" <= ") + " (C " + r.rows.C.size + ")");
        t.eq(r.back.html, r.rows.A.html, "A, then B, C, D, E, then A again: the same bytes"); t.eq(r.again.html, r.rows.A.html, "the same box twice: the same bytes");
        const room = { A: [0, 0, 852, 420], B: [0, 0, 852, 280], C: [0, 0, 600, 300], D: [0, 0, 852, 900], E: [0, 40, 852, 420] };
        for (const [k, [ox, oy, w, h]] of Object.entries(room)) for (const b of r.rows[k].boxes) t.ok(b.x >= ox - 0.5 && b.y >= oy - 0.5 && b.x + b.w <= ox + w + 0.5 && b.y + b.h <= oy + h + 0.5, `${k}: the ${b.kind} box stays in the anchor box: ${[b.x, b.y, b.w, b.h].map(Math.round)}`);
        t.ok(r.rows.A.w <= 420 - 80 && r.rows.B.w <= 280 - 80 && r.rows.C.w <= 300 - 80, "the container plus its caption line fits the height of the box");
        t.eq(r.rows.A.labels, [["وقت", "small", 0, "36"]], "caption: role small, floor 36 for Arabic (kit.label)"); t.eq(r.rows.B.labels, r.rows.A.labels, "labels do not depend on the box");
        t.eq(r.fieldA.html === r.fieldA2.html, true, "a field rebuilds to the same bytes"); t.ok(r.fieldB.boxes[0].h === 280 && r.fieldB.boxes[0].kind === "owner", "the field panel follows the box");
        t.eq(r.ceil, ["sm", "md", "lg", "xl", "hero"], "anchor.size on a roomy box is drawn as named"); t.ok(r.ceilSmall.every((s, i) => order.indexOf(s) <= i) && r.ceilSmall[4] !== "hero", "on a small box a named size steps down instead of overflowing: " + r.ceilSmall.join(","));
        t.ok(order.indexOf(r.noCap.size) >= order.indexOf(r.rows.B.size), "without a caption the container may use the caption's room"); t.eq(r.ctxSize, "md", "ctx.size is read when the anchor names none");
        for (const l of r.lo) t.eq(l, { el: null, boxes: [], labels: [["250", "chip", 0]] }, "labelsOnly: the price-tag label is the same whatever the box, no geometry");
      }
    },
    {
      name: "the caption is a kit.label fit slot with its floor (Arabic 36, Latin and digits 34); its element is exactly the box the anchor reports; the container sits where the boxes say; safe() inside the content box",
      async run(t) {
        const cases = [["وقت", "36"], ["Top 3", "34"], ["250", "34"]];
        for (const preset of PRESETS) for (const [text, floor] of cases) for (const kind of ["icon", "field"]) {
          const box = { w: 852, h: 440, x: 0, y: 24 }, r = await t.art.render({ kind, icon: "clock", captions: [text] }, { preset, box, png: false });
          const dom = await t.art.evaluate(() => {
            const z = document.querySelector("#art-stage .cs-zone").getBoundingClientRect(), l = document.querySelector("#art-stage .cs-art-label"), b = l.getBoundingClientRect(), s = document.querySelector("#art-stage svg.cs-icon").getBoundingClientRect();
            return { floor: l.getAttribute("data-floor"), role: l.getAttribute("data-role"), key: l.getAttribute("data-slot-key"), x: b.left - z.left, y: b.top - z.top, w: b.width, h: b.height, cx: s.left + s.width / 2 - z.left, cy: s.top + s.height / 2 - z.top };
          });
          const tb = r.boxes.find((b) => b.kind === "text"), cb = r.boxes.find((b) => (b.kind === "owner" && b.id === "c") || (b.kind === "ink")), id = `${preset}/${kind}/${text}`;
          t.eq([dom.floor, dom.role], [floor, "small"], id + ": data-floor and role from kit.label"); t.ok(/\.art\.0$/.test(dom.key), id + ": slot key " + dom.key);
          t.ok(Math.abs(dom.x - tb.x) < 1 && Math.abs(dom.y - tb.y) < 1 && Math.abs(dom.w - tb.w) < 1 && Math.abs(dom.h - tb.h) < 1, `${id}: the label is the reported text box ${[dom.x, dom.y, dom.w, dom.h].map(Math.round)} vs ${[tb.x, tb.y, tb.w, tb.h].map(Math.round)}`);
          t.ok(Math.abs(cb.x + cb.w / 2 - dom.cx) < 1 && Math.abs(cb.y + cb.h / 2 - dom.cy) < 1, `${id}: the container is centred where its box says (${Math.round(dom.cx)},${Math.round(dom.cy)})`);
          t.eq((await t.art.safe(r, { content: true })).violations, [], id + ": safe()");
        }
      }
    },
    {
      name: "a field caption reads on its panel and an icon caption on the slide ground: contrast at least 4.5 on every preset x tone",
      async run(t) {
        const r = await t.art.evaluate(() => {
          const out = [];
          for (const p of ["swiss", "creator", "notebook", "poster", "interface", "heritage"]) for (const tone of ["base", "invert", "field"]) for (const kind of ["icon", "field"]) {
            const res = __art.render({ kind, icon: "clock", captions: ["وقت"] }, { preset: p, tone, box: { w: 852, h: 440 }, png: false }), c = __art.ctx({ preset: p, tone }), l = document.querySelector("#art-stage .cs-art-label");
            const m = /rgb\((\d+), (\d+), (\d+)\)/.exec(getComputedStyle(l).color), hex = "#" + [1, 2, 3].map((i) => (+m[i]).toString(16).padStart(2, "0")).join("");
            out.push({ id: [p, tone, kind].join("/"), contrast: CS.core.color.contrast(hex, kind === "field" ? c.tokens.accent : c.tokens.bg) });
          }
          return out;
        });
        for (const x of r) t.gte(x.contrast, 4.5, x.id + ": caption contrast " + x.contrast.toFixed(2));
      }
    },
    {
      name: "the price tag (cs-price-tag-ar): captions[0] sits in the tag's empty box (x10 y9 w10 h6 of the 24 grid) from xl up when it fits, below as a chip otherwise; readable on what is behind it; upright; mirror moves the box",
      async run(t) {
        await t.art.evaluate(([TAG]) => { const p = CS.visual._.blocks["cs-icon-pack"]; window.__prevTag = p.icons["cs-price-tag-ar"] || null; p.icons["cs-price-tag-ar"] = TAG; }, [TAG]);
        try {
          const probe = (anchor, render) => t.art.evaluate(([anchor, render]) => {
            const res = __art.render(anchor, Object.assign({ png: false }, render));
            if (!res) return null;
            const st = document.querySelector("#art-stage"), z = st.querySelector(".cs-zone").getBoundingClientRect(), svg = st.querySelector("svg.cs-icon"), l = st.querySelector(".cs-art-label"), wrap = l.closest('[data-part="tag"]');
            const rel = (b) => ({ x: b.left - z.left, y: b.top - z.top, w: b.width, h: b.height }), kids = [].slice.call(svg.children), gl = kids.find((x) => x.localName === "g"), direct = kids.filter((x) => x.localName === "path" && x.getAttribute("fill") !== "none");
            const tint = gl && [].slice.call(gl.children).find((p) => p.localName === "path" && p.getAttribute("fill") !== "none" && !p.getAttribute("stroke")), under = tint ? tint.getAttribute("fill") : direct.length ? direct[direct.length - 1].getAttribute("fill") : __art.ctx(render).tokens.bg;
            const m = /rgb\((\d+), (\d+), (\d+)\)/.exec(l.style.color), color = m ? "#" + [1, 2, 3].map((i) => (+m[i]).toString(16).padStart(2, "0")).join("").toUpperCase() : null;
            return { role: l.getAttribute("data-role"), floor: l.getAttribute("data-floor"), inTag: !!wrap, size: svg.getAttribute("data-size"), rotated: /rotate\(/.test(svg.innerHTML), svg: rel(svg.getBoundingClientRect()), wrap: wrap && rel(wrap.getBoundingClientRect()), label: rel(l.getBoundingClientRect()),
              color, under, contrast: color ? CS.core.color.contrast(color, under) : null, nText: res.boxes.filter((b) => b.kind === "text").length, below: !wrap && !!l.style.height, own: res.boxes.filter((b) => b.kind === "text").map((b) => b.ownerOf || null) };
          }, [anchor, render]);
          const tag = (extra, render, text) => probe(Object.assign({ kind: "icon", icon: "cs-price-tag-ar", captions: [text || "250"] }, extra), render);
          const G = { lg: 160, xl: 240, hero: 320 };
          // the label box inside the svg, in zone px: the glyph box is centred in the svg, the label box is 10 x 6 units at (10, 9)
          const expect = (r, mirror) => { const g = G[r.size], u = g / 24, o = (r.svg.w - g) / 2; return { x: r.svg.x + o + (mirror ? 4 : 10) * u, y: r.svg.y + o + 9 * u, w: 10 * u, h: 6 * u }; };
          const near = (a, b) => ["x", "y", "w", "h"].every((k) => Math.abs(a[k] - b[k]) < 1);
          let tested = 0;
          for (const preset of PRESETS) for (const tone of ["base", "invert", "field"]) for (const rtl of [true, false]) for (const [size, treatment, recipe] of [["xl", undefined, "under"], ["hero", undefined, "over"], ["xl", "bare", "under"], ["xl", "chip", "under"], ["xl", "tile", "under"], ["xl", "sticker", "under"]]) {
            const id = [preset, tone, rtl ? "rtl" : "ltr", size, treatment || "default-" + recipe].join("/"), r = await tag({ size, treatment }, { preset, tone, rtl, recipe, box: { w: 852, h: size === "hero" ? 820 : 520 }, slideId: "s07" }, "250");
            t.ok(r && r.inTag && r.role === "chip" && r.floor === "34" && r.size === size, id + ": the label is in the tag, role chip, floor 34"); if (!r || !r.inTag) continue;
            const e = expect(r, false);
            t.ok(near(r.wrap, e), `${id}: the label box is the tag's empty box ${JSON.stringify(r.wrap)} vs ${JSON.stringify(e)}`);
            t.ok(r.label.x >= r.wrap.x - 1 && r.label.x + r.label.w <= r.wrap.x + r.wrap.w + 1 && r.label.y >= r.wrap.y - 1 && r.label.y + r.label.h <= r.wrap.y + r.wrap.h + 1, id + ": the text fits the box");
            t.gte(r.contrast, 4.5, `${id}: the label colour ${r.color} reads on ${r.under} (${r.contrast && r.contrast.toFixed(2)})`); t.eq(r.rotated, false, id + ": upright, no tilt under a label"); t.eq(r.nText, 1); tested++;
          }
          t.gte(tested, 200, "cases tested: " + tested);
          const m = await tag({ size: "xl", mirror: true }, { preset: "swiss", box: { w: 852, h: 460 } });
          t.ok(near(m.wrap, expect(m, true)), "mirror: the label box moves to x 4 of the 24 grid: " + JSON.stringify(m.wrap));
          const lg = await tag({ size: "lg" }, { preset: "creator", box: { w: 852, h: 460 } }), l1 = await tag({ size: "xl" }, { preset: "creator", box: { w: 852, h: 460 } }, "1,200"), lh = await tag({ size: "hero" }, { preset: "creator", box: { w: 852, h: 760 }, recipe: "over" }, "1,200");
          t.ok(!lg.inTag && lg.role === "chip" && lg.size === "lg" && lg.below, "below xl the label is the caption under the tag (still role chip)"); t.ok(!l1.inTag && l1.below, "1,200 does not fit the 100 px xl box: caption below"); t.ok(lh.inTag, "1,200 fits the 133 px hero box");
          const ar = await tag({ size: "xl" }, { preset: "creator", box: { w: 852, h: 460 } }, "مية جنيه"); t.ok(!ar.inTag && ar.floor === "36" && ar.role === "chip", "an Arabic label of seven characters goes below, floor 36");
          const ob = await tag({ object: "no-such-object", size: "xl" }, { preset: "creator", box: { w: 852, h: 460 } }); t.ok(ob && ob.role === "small" && !ob.inTag, "an anchor that names an object is not a price tag: a plain caption, role small");
          const sk = await tag({ size: "xl", treatment: "sticker" }, { preset: "creator", box: { w: 852, h: 460 } }), sk2 = await tag({ size: "lg", treatment: "sticker" }, { preset: "creator", box: { w: 852, h: 460 } });
          t.eq([sk.rotated, sk2.rotated], [false, true], "the sticker tilts only when there is no label in the tag");
          for (const p of ["creator", "poster", "heritage"]) {
            const r = await t.art.render({ kind: "icon", icon: "cs-price-tag-ar", captions: ["250"], size: "xl" }, { preset: p, box: { w: 852, h: 460 }, png: false });
            t.eq((await t.art.safe(r, { content: true })).violations, [], p + ": safe() with the label"); t.gte((await t.art.paintBoth(r)).ssim, 0.98, p + ": both painters agree with the label in the tag");
            const tb = r.boxes.find((b) => b.kind === "text"); t.ok(tb && tb.ownerOf === "c", p + ": the label box names the container as its owner");
          }
          const f = await t.art.render({ kind: "field", icon: "cs-price-tag-ar", captions: ["99"], size: "xl" }, { preset: "creator", box: { w: 852, h: 460 }, png: false });
          t.ok(f.boxes.find((b) => b.kind === "text").ownerOf === "f", "on a field the label names the panel"); t.eq((await t.art.safe(f, { content: true })).violations, [], "field: safe()");
        } finally {
          await t.art.evaluate(() => { const p = CS.visual._.blocks["cs-icon-pack"]; if (window.__prevTag) p.icons["cs-price-tag-ar"] = window.__prevTag; else delete p.icons["cs-price-tag-ar"]; });
        }
      }
    },
    {
      name: "the shipped price tag leaves the box the anchor uses: x10..20 y9..15 is inside the tag body and clear of the punch hole (real pack)",
      real: true,
      async run(t) {
        const r = await t.art.evaluate(() => {
          const rec = CS.visual._.block("cs-icon-pack").icons["cs-price-tag-ar"], NS = "http://www.w3.org/2000/svg", svg = document.createElementNS(NS, "svg"), host = document.createElement("div"); document.body.appendChild(host); host.appendChild(svg);
          const bb = rec.d.map((d) => { const p = document.createElementNS(NS, "path"); p.setAttribute("d", d); svg.appendChild(p); const b = p.getBBox(); return [b.x, b.y, b.x + b.width, b.y + b.height]; }); host.remove();
          return { d: rec.d, bb, f: rec.f };
        });
        const [body, hole] = r.bb, box = [10, 9, 20, 15];
        t.ok(body[0] <= box[0] && body[1] <= box[1] && body[2] >= box[2] && body[3] >= box[3], "the label box lies inside the tag body " + JSON.stringify(body));
        t.ok(hole[2] < box[0] || hole[0] > box[2] || hole[3] < box[1] || hole[1] > box[3], "and clear of the punch hole " + JSON.stringify(hole)); t.eq(r.d.length, 2, "two paths: the body and the hole");
      }
    },
    {
      name: "rebuild-safe at the limit: when no token fits the box the anchor returns null (never an oversize container or a box outside the anchor box); the smallest box that builds is exactly the smallest container, plus the caption line; labelsOnly still answers",
      async run(t) {
        const r = await t.art.evaluate(() => {
          const ctxOf = (box, extra) => __art.ctx(Object.assign({ preset: "creator", box }, extra));
          const build = (anchor, box) => {
            const res = CS.art.build(anchor, ctxOf(box));
            if (!res) return null;
            const sv = res.el.querySelector("svg.cs-icon");
            return { size: sv.getAttribute("data-size"), w: parseFloat(sv.getAttribute("width")), boxes: res.boxes, labels: res.labels.length };
          };
          const scan = (anchor, axis) => {   // first value that builds; nulls after it; boxes outside the anchor box
            const rows = []; let first = null, gaps = 0, out = 0;
            for (let v = 20; v <= 720; v++) {
              const box = axis === "h" ? { w: 852, h: v } : { w: v, h: 720 }, res = build(anchor, box);
              if (res && first == null) first = { v, size: res.size, w: res.w };
              if (!res && first != null) gaps++;
              if (res) res.boxes.forEach((b) => { if (b.x < -0.5 || b.y < -0.5 || b.x + b.w > box.w + 0.5 || b.y + b.h > box.h + 0.5) out++; });
            }
            return { first, gaps, out };
          };
          const A = [["icon", { kind: "icon", icon: "clock", captions: ["وقت"], size: "hero" }], ["iconNoCap", { kind: "icon", icon: "clock", size: "hero" }], ["field", { kind: "field", object: "trophy", captions: ["أول"] }], ["fieldNoCap", { kind: "field", object: "trophy" }],
            ["tag", { kind: "icon", icon: "clock", captions: ["250"], size: "xl" }], ["named", { kind: "icon", icon: "clock", captions: ["وقت"], size: "sm" }]];
          const out = { h: {}, w: {} };
          for (const [k, a] of A) { out.h[k] = scan(a, "h"); out.w[k] = scan(a, "w"); }
          out.sm = CS.art.icon.full("clock", { ctx: ctxOf({ w: 852, h: 420 }), treatment: "duo", size: "sm" }).w;
          out.repro = [build(A[0][1], { w: 852, h: 150 }), build(A[0][1], { w: 40, h: 600 }), build(A[1][1], { w: 852, h: 40 })];
          const lo = CS.art.build(A[0][1], Object.assign(ctxOf({ w: 852, h: 20 }), { labelsOnly: true }));
          out.lo = { el: lo.el, boxes: lo.boxes, labels: lo.labels.map((l) => [l.text, l.role, l.index]) };
          return out;
        });
        const sm = Math.ceil(r.sm);
        t.eq(r.repro, [null, null, null], "hero + caption on 852x150, a 40 px wide box and a 40 px tall box: null, not an oversize sm container");
        t.eq(r.h.icon.first.v, sm + 80, "icon + caption: the first height that builds is the sm duo container (" + r.sm + " px) + the 56 px caption + the 24 px gap"); t.eq(r.h.iconNoCap.first.v, sm, "without a caption: exactly the container");
        t.eq(r.h.icon.first.size, "sm", "and it is the smallest token (the loop stepped down hero > xl > lg > md > sm)"); t.eq(r.w.icon.first.v, sm, "narrow boxes: the first width that builds is the container width"); t.eq(r.w.iconNoCap.first.v, sm);
        t.eq(r.h.field.first.v - r.h.fieldNoCap.first.v, 80, "a field object: the caption costs 80 px of height"); t.ok(r.w.field.first.v === r.w.fieldNoCap.first.v && r.w.field.first.v > 0, "and nothing of width: " + r.w.field.first.v);
        for (const axis of ["h", "w"]) for (const [k, v] of Object.entries(r[axis])) { t.ok(v.first, axis + "/" + k + ": builds from some size up"); t.eq([v.gaps, v.out], [0, 0], axis + "/" + k + ": once it builds it keeps building as the box grows, and no box leaves the anchor box"); }
        t.ok(r.h.named.first.v >= sm + 80 && r.h.named.first.size === "sm", "anchor.size sm is a ceiling, never a floor: the same limit");
        t.eq(r.lo, { el: null, boxes: [], labels: [["وقت", "small", 0]] }, "labelsOnly answers whatever the box: the caption, no geometry, no null");
      }
    },
    {
      name: "the price tag on a field and on the slide: the label colour reads (4.5:1) on what is painted behind it for every treatment x tone x DNA (bare and ring included); a bare or ring glyph reads (3:1) on the panel",
      async run(t) {
        await t.art.evaluate(([TAG]) => { const p = CS.visual._.blocks["cs-icon-pack"]; window.__prevTag = p.icons["cs-price-tag-ar"] || null; p.icons["cs-price-tag-ar"] = TAG; }, [TAG]);
        try {
          const r = await t.art.evaluate(([PRESETS]) => {
            const C = CS.core.color, hexOf = (s) => { const m = /rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)/.exec(s); return m && (m[4] == null || +m[4] === 1) ? "#" + [1, 2, 3].map((i) => (+m[i]).toString(16).padStart(2, "0")).join("").toUpperCase() : null; };
            const behind = (x, y) => {   // the first layer under the text that paints: an svg shape with a solid fill, else a solid html background
              for (const e of document.elementsFromPoint(x, y)) {
                const s = getComputedStyle(e), c = e instanceof SVGGeometryElement ? (+s.fillOpacity === 1 ? hexOf(s.fill) : null) : e instanceof SVGElement ? null : hexOf(s.backgroundColor);
                if (c) return c;
              }
              return null;
            };
            const out = { n: 0, bad: [], glyph: 0, inTag: 0, below: 0, seen: {} };
            for (const preset of PRESETS) for (const tone of ["base", "invert", "field"]) for (const kind of ["icon", "field"]) for (const treatment of ["bare", "ring", "chip", "tile", "sticker", "badge", "duo", "giant"]) for (const size of ["xl", "hero"]) {
              const id = [preset, tone, kind, treatment, size].join("/"), tk = CS.art.kit.palette(__art.ctx({ preset, tone }).tokens);
              const res = __art.render({ kind, icon: "cs-price-tag-ar", captions: ["250"], size, treatment }, { preset, tone, rtl: true, box: { w: 852, h: size === "hero" ? 820 : 520 }, slideId: "s07", png: false });
              if (!res) { out.bad.push(id + ": null"); continue; }
              const st = document.querySelector("#art-stage"), l = st.querySelector(".cs-art-label"), wrap = l.closest('[data-part="tag"]'), b = (wrap || l).getBoundingClientRect(), color = hexOf(getComputedStyle(l).color), cx = b.left + b.width / 2, cy = b.top + b.height / 2;
              const under = [[cx, b.top + 3], [cx, b.bottom - 3], [b.left + 3, cy], [b.right - 3, cy]].map(([x, y]) => behind(x, y));
              out.n++; if (wrap) out.inTag++; else {
                const sz = st.querySelector("svg.cs-icon").getAttribute("data-size"), g = CS.art.kit.gOf(sz in CS.art.kit.SIZES ? sz : +sz);
                if (g >= 240) out.bad.push(id + ": a fitting xl label fell below the tag"); else out.below++;
              }
              if (under.some((u) => !u)) { out.bad.push(id + ": nothing paints behind the label"); continue; }
              const worst = Math.min(...under.map((u) => C.contrast(color, u)));
              if (worst < 4.5) out.bad.push(id + ": label " + color + " on " + under.join("/") + " = " + worst.toFixed(2));
              if (kind === "field" && (treatment === "bare" || treatment === "ring")) {
                if (under.some((u) => u !== tk.accent)) out.bad.push(id + ": expected the panel " + tk.accent + " behind the label, got " + under.join("/"));
                const stroke = st.querySelector("svg.cs-icon path[stroke]").getAttribute("stroke"), gc = C.contrast(stroke, tk.accent); out.glyph++;
                if (gc < 3) out.bad.push(id + ": glyph " + stroke + " on the panel " + tk.accent + " = " + gc.toFixed(2));
              }
            }
            return out;
          }, [PRESETS]);
          t.eq(r.n, 6 * 3 * 2 * 8 * 2, "cases rendered: " + r.n); t.eq(r.inTag + r.below, r.n, "a fitting xl label stays in the tag; smaller glyphs put it below"); t.eq(r.glyph, 6 * 3 * 2 * 2, "bare and ring glyphs on a field checked: " + r.glyph);
          t.eq(r.bad, [], "no label or glyph falls below its floor: " + r.bad.slice(0, 4).join(" | "));
          const reviewed = [["heritage", "base"], ["poster", "base"], ["notebook", "base"]];
          for (const [preset, tone] of reviewed) {
            const f = await t.art.render({ kind: "field", icon: "cs-price-tag-ar", captions: ["250"], size: "xl", treatment: "bare" }, { preset, tone, box: { w: 852, h: 460 }, png: false });
            const m = await t.art.evaluate(() => { const l = document.querySelector("#art-stage .cs-art-label"); return getComputedStyle(l).color; });
            t.ok(f && /rgb\(/.test(m), preset + "/" + tone + ": the bare field tag from the review builds and its label has a colour " + m); t.eq((await t.art.safe(f, { content: true })).violations, [], preset + "/" + tone + ": safe()");
          }
        } finally {
          await t.art.evaluate(() => { const p = CS.visual._.blocks["cs-icon-pack"]; if (window.__prevTag) p.icons["cs-price-tag-ar"] = window.__prevTag; else delete p.icons["cs-price-tag-ar"]; });
        }
      }
    },
    {
      name: "an outline colour override cannot erase a field object: with art.outlineColor as a role or the same colour as a hex, base and shade stay apart from the outline on every DNA x tone, as a die-cut and bare; a supplied o.base that equals the outline is replaced, a junk base is ignored",
      async run(t) {
        const r = await t.art.evaluate(([PRESETS]) => {
          const C = CS.core.color, k = CS.art.kit, out = { n: 0, bad: [] };
          const roles = (tk) => ({ surface: tk.surface, bg: tk.bg, ink: tk.ink, accent: tk.accent, support1: tk.support[0], support2: tk.support[1] });
          const check = (id, el, line) => {
            const body = [].slice.call(el.querySelectorAll('g[transform*="scale("]')).pop(), ps = [].slice.call(body.querySelectorAll("path")), fills = [...new Set(ps.map((p) => p.getAttribute("fill")))];
            const apart = fills.filter((f) => f !== line), best = Math.max(...fills.map((f) => C.contrast(f, line)));
            out.n++;
            if (ps.every((p) => p.getAttribute("fill") === p.getAttribute("stroke"))) out.bad.push(id + ": every path is " + line + " on " + line);
            else if (apart.length < 2 || best < 1.8) out.bad.push(id + ": fills " + fills.join(" ") + " vs the outline " + line + " (best " + best.toFixed(2) + ")");
          };
          for (const preset of PRESETS) for (const tone of ["base", "invert", "field"]) {
            const tk = k.palette(__art.ctx({ preset, tone }).tokens);
            for (const [name, hx] of Object.entries(roles(tk))) for (const spec of [name, hx, hx.toLowerCase()]) for (const treatment of [undefined, "bare"]) {
              const ctx = __art.ctx({ preset, tone, box: { w: 600, h: 400 } }); ctx.art = Object.assign({}, ctx.art, { outlineColor: spec });
              const res = CS.art.build({ kind: "field", object: "trophy", treatment }, ctx), id = [preset, tone, spec, treatment || "sticker"].join("/");
              // a bare field object outlines in the colour that reads on the panel (o.ink beats art.outlineColor); a die-cut honours the override
              check(id, res.el.querySelector("svg.cs-icon"), treatment ? k.on(tk.accent, tk) : (C.toHex(C.parse(spec.charAt(0) === "#" ? spec : roles(tk)[spec]))));
            }
            for (const [base, line] of [["accent", "accent"], ["ink", "ink"], ["surface", "surface"], ["#" + tk.accent.slice(1).toLowerCase(), "accent"]]) {
              const ctx = __art.ctx({ preset, tone }), el = CS.art.object.full("trophy", { ctx, size: "lg", treatment: "bare", base, outlineColor: line }).el, ln = roles(tk)[line];
              check([preset, tone, "o.base=" + base, "o.outlineColor=" + line].join("/"), el, ln);
            }
            const junk = CS.art.object.full("trophy", { ctx: __art.ctx({ preset, tone }), size: "lg", base: "nope" }); out.n++; if (!junk || !junk.el.querySelector("path")) out.bad.push(preset + "/" + tone + ": a junk base drew nothing");
          }
          return out;
        }, [PRESETS]);
        t.gte(r.n, 6 * 3 * (6 * 3 * 2 + 4 + 1), "cases checked: " + r.n); t.eq(r.bad, [], "base and shade never collapse into the outline: " + r.bad.slice(0, 3).join(" | "));
      }
    },
    {
      name: "outline does not swallow the drawing: on the 12 hero objects at lg and xl the outline covers a bounded share of the object, far below the 2x-ladder look it replaces",
      real: true,
      async run(t) {
        const r = await t.art.evaluate(async () => {
          const ids = CS.art.object.ids(), out = [];
          const share = (el, ink, thick) => new Promise((res) => {
            if (thick) [].slice.call(el.querySelectorAll("path")).forEach((p) => { if (p.getAttribute("stroke")) p.setAttribute("stroke-width", parseFloat(p.getAttribute("stroke-width")) * thick); });
            const W = parseFloat(el.getAttribute("width")), N = Math.round(W), img = new Image();
            img.onload = () => {
              const c = document.createElement("canvas"); c.width = N; c.height = N; const x = c.getContext("2d"); x.drawImage(img, 0, 0, N, N); const d = x.getImageData(0, 0, N, N).data, h = ink.replace("#", ""), R = parseInt(h.slice(0, 2), 16), G = parseInt(h.slice(2, 4), 16), B = parseInt(h.slice(4, 6), 16); let tot = 0, line = 0;
              for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200) { tot++; if (Math.abs(d[i] - R) + Math.abs(d[i + 1] - G) + Math.abs(d[i + 2] - B) < 60) line++; }
              res(line / tot);
            };
            img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(new XMLSerializer().serializeToString(el));
          });
          for (const p of ["swiss", "creator", "poster"]) for (const size of ["lg", "xl"]) for (const id of ids) {
            const ctx = __art.ctx({ preset: p }), ink = CS.art.kit.palette(ctx.tokens).ink, mk = () => CS.art.object(id, { ctx, size, treatment: "bare" });
            const ladder = CS.art.kit.ladder(size, ctx.art.stroke) * 2 / CS.art.object.outline(size, { ctx });
            out.push({ id: [p, size, id].join("/"), share: await share(mk(), ink), old: await share(mk(), ink, ladder) });
          }
          return out;
        });
        const worst = Math.max(...r.map((x) => x.share)), mean = r.reduce((a, x) => a + x.share, 0) / r.length, oldMean = r.reduce((a, x) => a + x.old, 0) / r.length;
        t.ok(worst <= 0.6, "no object is more than 60% outline (worst " + worst.toFixed(2) + ")"); t.ok(mean <= 0.4, "the mean outline share is at most 40% (" + mean.toFixed(2) + "), the 2x ladder gave " + oldMean.toFixed(2));
        t.ok(oldMean > mean + 0.12, "control: the old thickness measures clearly heavier (" + oldMean.toFixed(2) + " vs " + mean.toFixed(2) + ")");
      }
    },
    {
      name: "contact sheets: the 12 hero objects on the six DNAs at lg, the notebook retrace, stickers, outline colours, the price tag and the anchors (object-outline*.png at 1x and the 130 px profile size)",
      real: true,
      async run(t) {
        const ids = await t.art.evaluate(() => CS.art.object.ids()), items = [];
        PRESETS.forEach((p) => ids.forEach((id) => items.push({ kind: "object", id, preset: p, opts: { size: "lg", treatment: "bare" }, label: p + " " + id })));
        const sh = await t.art.sheet({ cols: 12, cw: 200, ch: 220, items, title: "A1b S-2: the 12 hero objects, outline 3.5% of the glyph box (lg = 6 px), six DNAs, base tone" });
        t.eq((await t.art.safe(sh)).violations, [], "objects sheet is painter-safe"); const png = await t.art.shot(sh, "object-outline.png"); t.art.save("object-outline-130.png", await t.art.small(png, Math.round(sh.w * 130 / 1080)));
        t.gte((await t.art.paintBoth(sh)).ssim, 0.98, "objects sheet: svg vs replay");
        const big = [];
        for (const [p, tone] of [["swiss", "base"], ["creator", "base"], ["poster", "invert"], ["heritage", "base"]]) for (const size of ["md", "xl", "hero"]) for (const id of ["phone", "key", "lightbulb"]) big.push({ kind: "object", id, preset: p, tone, opts: { size, treatment: size === "hero" ? "sticker" : "bare" }, label: [p, tone, size, id].join(" ") });
        const bs = await t.art.sheet({ cols: 9, cw: 420, ch: 440, items: big, title: "sizes md xl hero (hero as die-cut sticker): 4 / 8 / 11 px outlines" });
        t.eq((await t.art.safe(bs)).violations, []); await t.art.shot(bs, "object-outline-sizes.png");
        const nb = [];
        for (const id of ids.slice(0, 6)) for (const rt of [false, true, { dx: 1, dy: 1, rot: 2, tint: "accent" }]) nb.push({ kind: "object", id, preset: "notebook", opts: { size: "xl", treatment: "bare", retrace: rt }, label: "notebook " + id + (rt ? " retrace" : "") });
        for (const n of ["clock", "coins", "trophy"]) for (const rt of [false, true]) nb.push({ kind: "icon", name: n, preset: "notebook", opts: { size: "lg", treatment: rt ? "chip" : "bare", retrace: rt, name: n }, label: "icon " + n + (rt ? " retrace" : "") });
        const ns = await t.art.sheet({ cols: 6, cw: 330, ch: 360, items: nb, title: "notebook retrace on objects and icons (off, default, a spec object)" });
        t.eq((await t.art.safe(ns)).violations, []); await t.art.shot(ns, "object-retrace.png");
        const oc = [];
        for (const [p, tone, col] of [["heritage", "base", "accent"], ["heritage", "base", "ink"], ["notebook", "base", "#1D2B5A"], ["interface", "field", "ink"], ["poster", "field", "ink"], ["creator", "field", "ink"]]) for (const id of ["coin-stack", "trophy", "megaphone"]) oc.push({ kind: "object", id, preset: p, tone, opts: { size: "xl", treatment: "bare", outlineColor: col }, label: [p, tone, col, id].join(" ") });
        const os = await t.art.sheet({ cols: 6, cw: 360, ch: 380, items: oc, title: "outline colour parameter; field tones bind the base to a support hue" });
        t.eq((await t.art.safe(os)).violations, []); await t.art.shot(os, "object-outline-colour.png");
        const an = [];
        for (const p of ["creator", "poster", "heritage"]) for (const text of ["250", "99", "1,200"]) an.push({ kind: "anchor", anchor: { kind: "icon", icon: "cs-price-tag-ar", captions: [text], size: "xl" }, preset: p, box: { w: 420, h: 440 }, label: [p, text, "xl"].join(" ") });
        for (const p of PRESETS) an.push({ kind: "anchor", anchor: { kind: "field", object: "trophy", captions: ["أول مكان"] }, preset: p, tone: "base", box: { w: 400, h: 420 }, label: p + " field object" });
        const as = await t.art.sheet({ cols: 6, cw: 440, ch: 460, items: an, title: "price tag with its label box at xl (1,200 falls below), and field anchors" });
        t.eq((await t.art.safe(as)).violations, []); await t.art.shot(as, "object-anchors.png");
        const hero = [];
        for (const p of ["creator", "poster"]) for (const text of ["250", "1,200"]) hero.push({ kind: "anchor", anchor: { kind: "icon", icon: "cs-price-tag-ar", captions: [text], size: "hero" }, preset: p, box: { w: 640, h: 640 }, label: [p, text, "hero"].join(" ") });
        const hs = await t.art.sheet({ cols: 4, cw: 660, ch: 680, items: hero, title: "price tag at hero (default treatment under: duo)" });
        t.eq((await t.art.safe(hs)).violations, []); await t.art.shot(hs, "object-anchors-hero.png");
        const fl = [];   // the price tag on a field, every container (the review's failing tones first), and a field with no room for a caption
        for (const [p, tone] of [["heritage", "base"], ["poster", "base"], ["notebook", "base"], ["swiss", "field"], ["creator", "invert"]]) for (const tr of ["bare", "ring", "chip", "duo"]) fl.push({ kind: "anchor", anchor: { kind: "field", icon: "cs-price-tag-ar", captions: ["250"], size: "xl", treatment: tr }, preset: p, tone, box: { w: 420, h: 440 }, label: [p, tone, tr].join(" ") });
        const fs2 = await t.art.sheet({ cols: 4, cw: 440, ch: 460, items: fl, title: "field price tag: the label and a bare or ring glyph read on the panel (xl)" });
        t.eq((await t.art.safe(fs2)).violations, []); await t.art.shot(fs2, "object-anchors-field.png");
        const fo = [];   // a field object whose outline takes the colour of its base (o.base surface): the base steps aside, the drawing stays
        for (const [p, tone] of [["swiss", "base"], ["poster", "base"], ["heritage", "base"], ["notebook", "base"], ["creator", "field"], ["interface", "field"]]) for (const col of ["surface", "accent", "ink"]) fo.push({ kind: "object", id: "trophy", preset: p, tone, opts: { size: "xl", treatment: "sticker", base: "surface", fill: "surface", outlineColor: col }, label: [p, tone, "outline " + col].join(" ") });
        const fos = await t.art.sheet({ cols: 6, cw: 360, ch: 380, items: fo, title: "object with a supplied base (field): outline colour = surface / accent / ink never erases the drawing" });
        t.eq((await t.art.safe(fos)).violations, []); await t.art.shot(fos, "object-outline-field.png");
      }
    }
  ]
};
