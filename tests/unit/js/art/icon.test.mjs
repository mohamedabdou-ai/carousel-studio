// tests/unit/js/art/icon.test.mjs · CS.art.icon (packages A1, A1b): the eight treatments over the six DNAs, the duo tint, dots, modifiers, mirror, the retrace (S-2),
// the object roles, replay parity and the contact sheets of the package acceptance (node tests/unit/js/art/run.mjs --only icon [--out DIR]). Objects and anchors: object.test.mjs.
import { PRESETS, TONES } from "./support/dna.mjs";

const TR = ["bare", "chip", "tile", "ring", "duo", "sticker", "badge", "giant"];
const MODS = ["slash", "cross", "plus", "check", "question", "sparkle"];
const MULT = { bare: 1, chip: 1.6, tile: 1.7, ring: 1.8, duo: 1.5, sticker: 1.6, badge: 1.5, giant: 1.75 };
const ICONS = ["clock", "hourglass", "coins", "trophy", "megaphone", "lightbulb"];
const OBJECTS = ["coin-stack", "phone", "lightbulb", "trophy"];

export default {
  module: "icon",
  tests: [
    {
      name: "every treatment x 3 sizes x the six DNAs renders and passes safe() (A1-A14, path-only icons, budget); the sheet paints alike in both painters (SSIM >= 0.98)",
      async run(t) {
        for (const size of ["xs", "md", "lg"]) {
          const probe = await t.art.evaluate(([size]) => Math.max(...["chip", "tile", "ring", "sticker", "giant", "badge", "duo"].map((tr) => ["swiss", "creator", "notebook", "poster", "interface", "heritage"].map((p) => CS.art.icon.measure({ ctx: __art.ctx({ preset: p }), size, treatment: tr }).w)).flat()), [size]);
          const cw = Math.ceil(probe) + 16, items = [];
          PRESETS.forEach((p, i) => TR.forEach((tr) => items.push({ kind: "icon", name: ICONS[i], preset: p, opts: { size, treatment: tr, name: ICONS[i] } })));
          const sh = await t.art.sheet({ cols: TR.length, cw, ch: cw, items });
          const s = await t.art.safe(sh);
          t.eq(s.violations, [], `${size}: safe() ${JSON.stringify(s.violations.slice(0, 3))}`);
          const n = await t.art.evaluate((sel) => document.querySelectorAll(sel + " svg.cs-icon").length + "/" + document.querySelectorAll(sel + " [data-sheet]").length, sh.sel);
          t.eq(n, "48/0", `${size}: all 48 icons drawn, none missing`);
          if (size === "md") {
            const p = await t.art.paintBoth(sh);
            t.gte(p.ssim, 0.98, `md sheet: svg and replay painters agree (${p.ssim.toFixed(4)})`);
          }
        }
      }
    },
    {
      name: "a treatment's container is a multiple of the glyph box (chip 1.6, tile 1.7, ring 1.8, duo 1.5, sticker 1.6, badge 1.5, giant 1.75) and the svg holds outline, paper, lift and tilt",
      async run(t) {
        const r = await t.art.evaluate(([TR, PRESETS]) => {
          const out = {};
          for (const p of PRESETS) for (const tr of TR) for (const s of ["sm", "md", "xl"]) {
            const o = { ctx: __art.ctx({ preset: p }), size: s, treatment: tr, name: "clock" }, m = CS.art.icon.measure(o), f = CS.art.icon.full("clock", o), el = f.el;
            out[[p, tr, s].join("/")] = { S: m.S, g: m.g, pad: m.pad, w: m.w, fw: f.w, attr: parseFloat(el.getAttribute("width")), vb: el.getAttribute("viewBox"), same: m.S === f.S && m.pad === f.pad };
          }
          return out;
        }, [TR, PRESETS]);
        const G = { sm: 64, md: 96, xl: 240 };
        for (const [k, v] of Object.entries(r)) {
          const [p, tr, s] = k.split("/");
          t.near(v.S, MULT[tr] * G[s], 0.001, k + ": container side"); t.eq(v.g, G[s]); t.near(v.attr, v.w, 0.001, k + ": the svg is S + 2 pad"); t.ok(v.same && v.fw === v.w, k + ": measure() equals the drawing");
          t.eq(v.vb, `0 0 ${+v.w.toFixed(2)} ${+v.w.toFixed(2)}`, k + ": viewBox");
          t.ok(tr === "bare" ? v.pad === 0 : v.pad >= 0 && v.pad < v.S * 0.35, k + ": pad " + v.pad);
        }
        t.near(r["swiss/chip/sm"].S, 102.4, 0.01, "an sm chip is 102 px (spec 3.1)"); t.near(r["swiss/chip/md"].S, 153.6, 0.01, "an md chip is 154 px");
        t.ok(r["creator/sticker/md"].pad > r["swiss/sticker/md"].pad, "a creator sticker reserves room for its outline, paper, hard shadow and tilt");
      }
    },
    {
      name: "nothing is clipped by its own svg: with a 24 px margin added around the viewBox no treatment x DNA x size draws a pixel outside the original frame (outline, paper, lift, tilt and hand wobble fit the pad)",
      async run(t) {
        const bad = await t.art.evaluate(async ([TR, PRESETS]) => {
          const out = [], jobs = [], M = 24;
          for (const p of PRESETS) for (const tr of TR) for (const size of ["sm", "md", "lg"]) for (const kind of ["icon", "object"]) {
            if (kind === "object" && tr === "ring") continue;
            const ctx = __art.ctx({ preset: p }), el = kind === "icon" ? CS.art.icon("coins", { ctx, size, treatment: tr, name: "coins", modifier: tr === "bare" ? ["check", "sparkle", "slash", "question"][PRESETS.indexOf(p) % 4] : null }) : CS.art.object("trophy", { ctx, size, treatment: tr === "sticker" || tr === "bare" ? tr : "bare" });
            const W = parseFloat(el.getAttribute("width")), N = Math.ceil(W + 2 * M);
            el.setAttribute("viewBox", [-M, -M, W + 2 * M, W + 2 * M].join(" ")); el.setAttribute("width", W + 2 * M); el.setAttribute("height", W + 2 * M);
            const xml = new XMLSerializer().serializeToString(el), img = new Image();
            jobs.push(new Promise((res) => {
              img.onload = () => {
                const c = document.createElement("canvas"); c.width = N; c.height = N; const x = c.getContext("2d"); x.drawImage(img, 0, 0, N, N);
                const d = x.getImageData(0, 0, N, N).data; let hit = 0;
                for (let y = 0; y < N; y++) for (let xx = 0; xx < N; xx++) if ((xx < M - 1 || xx > M + W + 1 || y < M - 1 || y > M + W + 1) && d[(y * N + xx) * 4 + 3] > 24) hit++;
                if (hit) out.push([p, kind, tr, size, hit]);
                res();
              };
              img.onerror = () => { out.push([p, kind, tr, size, "load"]); res(); };
              img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(xml);
            }));
          }
          await Promise.all(jobs);
          return out;
        }, [TR, PRESETS]);
        t.eq(bad, [], "drawn outside the svg frame: " + JSON.stringify(bad.slice(0, 8)));
      }
    },
    {
      name: "duo tints only the closed subpaths listed in f; open strokes stay ink; solid dots are filled and grown to the stroke's diameter (A14)",
      async run(t) {
        const r = await t.art.evaluate(() => {
          const pack = CS.visual._.block("cs-icon-pack").icons, out = {};
          for (const [name, p] of [["calendar-check", "swiss"], ["triangle-alert", "poster"], ["triangle-alert", "swiss"], ["clock", "creator"]]) {
            const ctx = __art.ctx({ preset: p }), el = CS.art.icon(name, { ctx, size: "xl", treatment: "duo" }), tk = CS.art.kit.palette(ctx.tokens), g = el.querySelector("g"), ps = [].slice.call(g.querySelectorAll("path")), rec = pack[name];
            const fills = ps.filter((x) => x.getAttribute("fill") !== "none" && !x.getAttribute("stroke")), strokes = ps.filter((x) => x.getAttribute("stroke") && x.getAttribute("fill") === "none"), dots = ps.filter((x) => x.getAttribute("fill") !== "none" && x.getAttribute("stroke"));
            const dot = (rec.s || []).length ? ps.filter((x) => x.getAttribute("d") === rec.d[rec.s[0]]).map((x) => ({ fill: x.getAttribute("fill"), stroke: x.getAttribute("stroke"), sw: x.getAttribute("stroke-width") }))[0] : null;
            out[name + "/" + p] = { f: rec.f || [], s: rec.s || [], d: rec.d.length, fills: fills.filter((x) => !(rec.s || []).some((i) => rec.d[i] === x.getAttribute("d"))).map((x) => [x.getAttribute("d"), x.getAttribute("fill")]), nStrokes: strokes.length, dot: dot, accent: tk.accent, rec: rec.d, ink: tk.ink,
              inkStrokes: strokes.every((x) => x.getAttribute("stroke") === tk.ink), sw: strokes[0] && parseFloat(strokes[0].getAttribute("stroke-width")) };
          }
          return out;
        });
        const ca = r["calendar-check/swiss"];
        t.eq(ca.fills.length, ca.f.length, "one tint fill per f entry"); t.eq(ca.fills.map((x) => x[0]), ca.f.map((i) => ca.rec[i]), "the tinted paths are exactly the f subpaths");
        t.ok(ca.fills.every((x) => x[1] === ca.accent), "tinted with the accent"); t.eq(ca.nStrokes, ca.d, "every path is stroked in ink on top"); t.ok(ca.inkStrokes, "open strokes stay ink");
        const ta = r["triangle-alert/poster"], ts = r["triangle-alert/swiss"];
        t.eq(ta.s, [2]); t.eq(ta.dot.fill, ta.ink, "the dot is filled with the ink"); t.eq(ta.dot.stroke, ta.ink); t.near(parseFloat(ta.dot.sw), 0.5, 0.01, "poster 2.5 units: the dot grows by 0.5 (stroke-width = stroke - 2)");
        t.eq(ts.dot.fill, ts.ink); t.eq(ts.dot.stroke, null, "stroke 2.0: the dot is already the stroke's diameter"); t.eq(ts.fills.length, 1, "the dot is not a tint fill");
        t.eq(r["clock/creator"].fills.length, 1, "clock: its face is the one closed subpath");
      }
    },
    {
      name: "modifiers: slash is a knock-out stroke under an ink stroke, badges sit at the end-bottom corner (0.42 of the glyph), sparkle at the top; unknown modifiers draw nothing",
      async run(t) {
        const r = await t.art.evaluate(([MODS]) => {
          const out = {}, run = (m, rtl, tr) => { const el = CS.art.icon("clock", { ctx: __art.ctx({ preset: "creator", rtl }), size: "lg", treatment: tr || "sticker", modifier: m, name: "clock" }); return { n: el.querySelectorAll("path").length }; };
          out.none = run(null, true).n;
          for (const m of MODS) out[m] = run(m, true).n - out.none;
          out.bogus = run("bogus", true).n - out.none; out.noneStr = run("none", true).n - out.none;
          const probe = (rtl) => { const el = CS.art.icon("clock", { ctx: __art.ctx({ preset: "swiss", rtl }), size: "lg", treatment: "bare", modifier: "check" }), gs = el.querySelectorAll(":scope > g"), ps = gs[1].querySelectorAll("path"), host = document.createElement("div"); document.body.appendChild(host); host.appendChild(el); const bb = ps[0].getBBox(); host.remove(); return { cx: bb.x + bb.width / 2, w: bb.width }; };
          out.badgeR = probe(true); out.badgeL = probe(false);
          const sl = CS.art.icon("clock", { ctx: __art.ctx({ preset: "swiss" }), size: "lg", treatment: "chip", modifier: "slash" }), sg = sl.querySelectorAll(":scope > g")[1].querySelectorAll("path");
          out.slash = { n: sg.length, knock: sg[0].getAttribute("stroke"), ink: sg[1].getAttribute("stroke"), kw: parseFloat(sg[0].getAttribute("stroke-width")), iw: parseFloat(sg[1].getAttribute("stroke-width")), chipFill: sl.querySelector("path").getAttribute("fill") };
          const tk = CS.art.kit.palette(__art.ctx({ preset: "swiss" }).tokens); out.chipTint = tk.tint;
          const cr = CS.art.icon("clock", { ctx: __art.ctx({ preset: "creator" }), size: "lg", treatment: "chip", modifier: "check" }), cp = cr.querySelectorAll(":scope > g")[1].querySelectorAll("path"); out.creatorBadge = [cp[0].getAttribute("fill"), cp[1].getAttribute("fill")];
          return out;
        }, [MODS]);
        t.eq(r.bogus, 0, "an unknown modifier draws nothing"); t.eq(r.noneStr, 0, '"none" draws nothing');
        t.eq(r.slash.n, 2, "slash = knock-out stroke + ink stroke"); t.ok(r.slash.kw > r.slash.iw * 2, "the knock-out is wider than the stroke"); t.eq(r.slash.knock, r.slash.chipFill, "the knock-out is the container's own colour (no mask)");
        for (const m of ["cross", "plus", "check", "question"]) t.ok(r[m] >= 3, m + ": ground ring, badge disc and symbol");
        t.eq(r.sparkle, 1); t.eq(r.question, 4, "question adds the dot of the mark");
        t.ok(r.badgeR.cx < r.badgeL.cx, "the badge is at the end side: left in RTL, right in LTR"); t.near(r.badgeR.w, 10.4, 0.1, "the badge ring is 10.4 units, 0.43 of the glyph box (spec: 0.42)");
        t.ok(r.creatorBadge[0] !== r.creatorBadge[1], "a badge that would vanish on its ground changes colour: " + r.creatorBadge.join(" on "));
      }
    },
    {
      name: "mirror:true flips the glyph only; drawOn puts pathLength=1 and data-m=stroke on glyph paths and nowhere else (A10); a missing icon is null and a bad treatment throws",
      async run(t) {
        const r = await t.art.evaluate(() => {
          const ctx = __art.ctx({ preset: "swiss" }), a = CS.art.icon("arrow-left", { ctx, size: "md", treatment: "chip", mirror: true, drawOn: true }), b = CS.art.icon("arrow-left", { ctx, size: "md", treatment: "chip" });
          const err = (f) => { try { f(); return "none"; } catch (e) { return e.code; } };
          return { aT: a.querySelector("g").getAttribute("transform"), bT: b.querySelector("g").getAttribute("transform"), aPl: a.querySelectorAll("[pathLength]").length, aStroke: a.querySelectorAll('path[data-m="stroke"]').length, bPl: b.querySelectorAll("[pathLength]").length, svgM: a.getAttribute("data-m"), nonPath: [].slice.call(a.querySelectorAll("[pathLength]")).filter((e) => e.localName !== "path").length,
            miss: CS.art.icon("no-such-icon", { ctx }), noPack: CS.art.icon("clock", { ctx, pack: { icons: {} } }), bad: err(() => CS.art.icon("clock", { ctx, treatment: "fancy" })), custom: !!CS.art.icon("cs-fanous", { ctx, size: "lg", treatment: "duo" }),
            glyph: [].slice.call(a.querySelector("g").querySelectorAll("path")).length };
        });
        t.ok(/scale\(-/.test(r.aT) && !/scale\(-/.test(r.bT), "mirror flips the glyph"); t.eq(r.aPl, r.glyph, "every glyph path carries pathLength"); t.eq(r.aStroke, r.glyph); t.eq(r.bPl, 0, "off by default"); t.eq(r.nonPath, 0);
        t.eq(r.svgM, "decor-item"); t.eq(r.miss, null); t.eq(r.noPack, null); t.eq(r.bad, "E_USAGE"); t.ok(r.custom, "custom cs- icons draw like any other");
      }
    },
    {
      name: "objects: base, shade (base mixed 18% toward ink) and hi roles, the outline of S-2 (3.5% of the glyph box), the die-cut keyline under a sticker, a visible base on all 18 tones",
      async run(t) {
        const r = await t.art.evaluate(([TONES, OBJECTS]) => {
          const out = { tones: [] }, ctx = __art.ctx({ preset: "swiss" }), k = CS.art.kit, c = CS.core.color, tk = k.palette(ctx.tokens);
          const el = CS.art.object("phone", { ctx, size: "lg" }), ps = [].slice.call(el.querySelectorAll("path"));
          out.fills = [...new Set(ps.map((p) => p.getAttribute("fill")))]; out.base = tk.accent; out.shade = c.mix(tk.accent, tk.ink, 0.18); out.hi = tk.surface;
          const g = el.querySelector("g"), sc = parseFloat(/scale\(([-\d.]+)/.exec(g.getAttribute("transform"))[1]); out.px = parseFloat(ps[0].getAttribute("stroke-width")) * sc; out.rule = Math.min(20, Math.max(4, Math.round(0.035 * 160))); out.ladder = k.ladder("lg", 2.0);
          const st = CS.art.object("phone", { ctx: __art.ctx({ preset: "creator" }), size: "lg", treatment: "sticker" }), top = [].slice.call(st.querySelectorAll("path"));
          const paper = c.mix("#FFFFFF", "#FFFFFF", 0); out.sticker = { n: top.length, paperStroke: top.filter((p) => p.getAttribute("stroke") === "#FFFFFF" && p.getAttribute("fill") === "#FFFFFF").length, shadow: top.filter((p) => p.getAttribute("fill") === "#14120F" && p.getAttribute("stroke") === "#14120F").length, tilt: /rotate\(/.test(st.innerHTML), w: parseFloat(st.getAttribute("width")), svg: st.getAttribute("data-object") };
          for (const p in TONES) for (const tone in TONES[p]) { const t0 = k.palette(__art.ctx({ preset: p, tone }).tokens), b = k.base(t0, t0.bg, false); out.tones.push({ id: p + "/" + tone, vsInk: c.contrast(b, t0.ink), vsBg: c.contrast(b, t0.bg) }); }
          out.ids = CS.art.object.ids(); out.missing = CS.art.object("nope", { ctx });
          out.containers = ["chip", "tile", "giant", "duo", "badge", "ring"].map((tr) => !!CS.art.object("trophy", { ctx, size: "md", treatment: tr }));
          return out;
        }, [TONES, OBJECTS]);
        t.ok(r.fills.includes(r.base) && r.fills.includes(r.shade) && r.fills.includes(r.hi), "fills are the three roles: " + r.fills.join(" "));
        t.near(r.px, r.rule, 0.05, "outline px = round(0.035 x 160) = 6 at lg (S-2), not 2x the ladder"); t.ok(r.px < r.ladder, "thinner than the icon ladder (" + r.ladder.toFixed(1) + " px)");
        t.eq(r.sticker.paperStroke > 0 && r.sticker.shadow > 0 && r.sticker.tilt, true, "creator sticker: paper keyline, hard shadow, tilt"); t.eq(r.sticker.svg, "phone");
        for (const x of r.tones) { t.ok(x.vsInk >= 1.8, x.id + ": base differs from the ink (" + x.vsInk.toFixed(2) + ")"); t.ok(x.vsBg >= 1.8, x.id + ": base is visible on the ground (" + x.vsBg.toFixed(2) + ")"); }
        for (const id of OBJECTS) t.ok(r.ids.includes(id), id + " is in the object data"); t.gte(r.ids.length, 4, "at least the four fixture objects (real data holds more)"); t.eq(r.missing, null);
        t.eq(r.containers, [true, true, true, true, true, true], "an object also sits in the container treatments");
      }
    },
    {
      name: "retrace (S-2): off by default; art.retrace adds one stroke-only pass under the glyph (offset, turned, tinted); S, pad and the svg size do not change; the stroke px stays at the ladder; o.retrace overrides the preset",
      async run(t) {
        const r = await t.art.evaluate(() => {
          const out = {}, k = CS.art.kit, base = __art.ctx({ preset: "notebook" }), tk = k.palette(base.tokens);
          const mk = (art, o) => { const ctx = __art.ctx({ preset: "notebook" }); ctx.art = Object.assign({}, ctx.art, art); return CS.art.icon.full("clock", Object.assign({ ctx, size: "lg", treatment: "bare" }, o)); };
          const info = (r) => {
            const g = r.el.querySelector("g"), rt = r.el.querySelector('[data-part="retrace"]'), main = [].slice.call(g.querySelectorAll(":scope > path")), sc = parseFloat(/scale\(([-\d.]+)/.exec(g.getAttribute("transform"))[1]);
            return { w: r.w, pad: r.pad, vb: r.el.getAttribute("viewBox"), rt: !!rt, rtTransform: rt && rt.getAttribute("transform"), mainPx: parseFloat(main[0].getAttribute("stroke-width")) * sc, n: main.length, first: g.firstElementChild === rt, inkUnder: !!rt && rt.nextElementSibling === main[0],
              rtPaths: rt ? [].slice.call(rt.querySelectorAll("path")).map((p) => [p.getAttribute("fill"), p.getAttribute("stroke"), parseFloat(p.getAttribute("stroke-width")) * sc, p.getAttribute("pathLength"), p.getAttribute("data-m")]) : [] };
          };
          out.off = info(mk({}, {})); out.on = info(mk({ retrace: true }, {})); out.spec = info(mk({ retrace: { dx: 1, dy: -0.5, rot: -2, tint: "accent2" } }, {})); out.forced = info(mk({}, { retrace: true })); out.killed = info(mk({ retrace: true }, { retrace: false }));
          out.mix = k.tint(tk.ink, tk.bg, 0.5); out.accent2 = tk.accent2; out.ladder = k.ladder("lg", 2.0);
          const c2 = __art.ctx({ preset: "notebook" }); c2.art = Object.assign({}, c2.art, { retrace: true });
          const duo = CS.art.icon("clock", { ctx: c2, size: "lg", treatment: "duo", name: "clock" }).querySelector("g");
          out.duo = [].slice.call(duo.children).map((x) => x.getAttribute("data-part") ? "retrace" : x.getAttribute("fill") !== "none" ? "fill" : "stroke");
          const m = CS.art.icon.measure({ ctx: c2, size: "lg", treatment: "sticker", name: "clock" }), f = CS.art.icon.full("clock", { ctx: c2, size: "lg", treatment: "sticker", name: "clock" });
          out.measure = [m.w, f.w, m.pad, f.pad];
          return out;
        });
        t.eq(r.off.rt, false, "no retrace unless asked"); t.eq(r.killed.rt, false, "o.retrace:false beats the preset"); t.ok(r.forced.rt, "o.retrace:true beats a preset without one"); t.ok(r.on.rt, "art.retrace:true draws it");
        t.eq([r.on.w, r.on.pad, r.on.vb], [r.off.w, r.off.pad, r.off.vb], "the svg, its pad and its viewBox are the same size with and without the retrace");
        t.ok(r.on.first && r.on.inkUnder, "the retrace is the first group under the glyph strokes");
        t.eq(r.on.rtPaths.length, r.off.n, "one retraced copy of every glyph path (clock has no dots)");
        t.ok(r.on.rtPaths.every((p) => p[0] === "none" && p[1] === r.mix && p[3] === null && p[4] === null), "stroke-only, in the ink mixed 50% toward the ground by default, no drawOn hooks: " + r.mix);
        t.ok(r.on.rtPaths.every((p) => Math.abs(p[2] - 0.85 * r.on.mainPx) < 0.05), "the retrace stroke is 0.85 of the main stroke");
        t.near(r.on.mainPx, r.off.mainPx, 0.05, "the main stroke px is unchanged by the retrace (the 1% shrink is paid back): " + r.on.mainPx);
        t.ok(/translate\(0\.5 0\.4\) rotate\(0\.8 12 12\)/.test(r.on.rtTransform), "defaults: +0.5 / +0.4 units, 0.8 degrees: " + r.on.rtTransform);
        t.ok(/translate\(1 -0\.5\) rotate\(-2 12 12\)/.test(r.spec.rtTransform) && r.spec.rtPaths.every((p) => p[1] === r.accent2), "a spec object sets dx, dy, rot and a tint role: " + r.spec.rtTransform);
        t.eq(r.duo.slice(0, 2), ["fill", "retrace"], "duo: the tint fill, then the retrace, then the ink strokes: " + r.duo.join(","));
        t.eq(r.measure[0], r.measure[1], "measure() equals the drawing with a retrace"); t.eq(r.measure[2], r.measure[3]);
      }
    },
    {
      name: "a retrace never leaves its svg: even at the schema's extremes (dx 2, dy 2, 5 degrees) the offset pass stays inside the frame, for icons and objects, bare and in a container",
      async run(t) {
        const bad = await t.art.evaluate(async () => {
          const out = [], jobs = [], M = 24, specs = [{ dx: 2, dy: 2, rot: 5, tint: "accent" }, { dx: -2, dy: 2, rot: -5 }];
          for (const p of ["notebook", "swiss", "creator"]) for (const kind of ["icon", "object"]) for (const [tr, size] of [["bare", "lg"], ["bare", "xl"], ["bare", "sm"], ["sticker", "lg"], ["chip", "md"]]) for (const spec of specs) {
            const ctx = __art.ctx({ preset: p }); ctx.art = Object.assign({}, ctx.art, { retrace: spec });
            const el = kind === "icon" ? CS.art.icon("coins", { ctx, size, treatment: tr, name: "coins" }) : CS.art.object("trophy", { ctx, size, treatment: tr });
            const W = parseFloat(el.getAttribute("width")), N = Math.ceil(W + 2 * M);
            el.setAttribute("viewBox", [-M, -M, W + 2 * M, W + 2 * M].join(" ")); el.setAttribute("width", W + 2 * M); el.setAttribute("height", W + 2 * M);
            const img = new Image();
            jobs.push(new Promise((res) => {
              img.onload = () => {
                const c = document.createElement("canvas"); c.width = N; c.height = N; const x = c.getContext("2d"); x.drawImage(img, 0, 0, N, N); const d = x.getImageData(0, 0, N, N).data; let hit = 0;
                for (let y = 0; y < N; y++) for (let xx = 0; xx < N; xx++) if ((xx < M - 1 || xx > M + W + 1 || y < M - 1 || y > M + W + 1) && d[(y * N + xx) * 4 + 3] > 24) hit++;
                if (hit) out.push([p, kind, tr, size, spec.dx, hit]);
                res();
              };
              img.onerror = () => { out.push([p, kind, tr, size, "load"]); res(); };
              img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(new XMLSerializer().serializeToString(el));
            }));
          }
          await Promise.all(jobs);
          return out;
        });
        t.eq(bad, [], "drawn outside the svg frame: " + JSON.stringify(bad.slice(0, 8)));
      }
    },
    {
      name: "same input, same bytes: icons, objects and anchors rebuild identically (determinism)",
      async run(t) {
        const r = await t.art.evaluate(([PRESETS]) => {
          const same = [];
          for (const p of PRESETS) for (const tr of ["sticker", "giant", "badge", "duo"]) {
            const mk = () => CS.art.icon("coins", { ctx: __art.ctx({ preset: p }), size: "lg", treatment: tr, modifier: "check", drawOn: true, name: "coins" }).outerHTML;
            const mo = () => CS.art.object("trophy", { ctx: __art.ctx({ preset: p }), size: "xl", treatment: tr === "duo" ? "bare" : tr }).outerHTML;
            same.push(mk() === mk(), mo() === mo());
          }
          return same;
        }, [PRESETS]);
        t.ok(r.every(Boolean), "every rebuild is byte-identical");
      }
    },
    {
      name: "stickers on the creator and notebook DNAs differ per icon (seeded tilt and hand circle) yet never leave the svg",
      async run(t) {
        const r = await t.art.evaluate(() => {
          const out = [];
          for (const p of ["creator", "notebook"]) for (const n of ["clock", "coins", "trophy", "megaphone", "lightbulb", "hourglass"]) {
            const el = CS.art.icon(n, { ctx: __art.ctx({ preset: p }), size: "lg", treatment: "sticker", name: n }), host = document.createElement("div"); document.body.appendChild(host); host.appendChild(el);
            const W = parseFloat(el.getAttribute("width")), rot = /rotate\(([-\d.]+)/.exec(el.innerHTML), ctm = el.getBoundingClientRect(); host.remove();
            out.push({ p, n, tilt: rot ? parseFloat(rot[1]) : 0, inside: ctm.width === W });
          }
          return out;
        });
        const tilts = r.filter((x) => x.p === "creator").map((x) => x.tilt);
        t.ok(tilts.every((x) => Math.abs(x) <= 8 && Math.abs(x) > 0), "creator tilt is at most 8 degrees: " + tilts.join(","));
        t.ok(new Set(tilts).size >= 1 && tilts.some((x) => x > 0) && tilts.some((x) => x < 0), "the sign is seeded per icon: " + tilts.join(","));
        t.ok(r.every((x) => x.inside));
      }
    },
    {
      name: "the stroke ladder in the drawing: the floors keep xs and sm glyphs at 4 and 5 px on every DNA, and nothing thins below the Arabic text beside it (1.4 px in the feed)",
      async run(t) {
        const r = await t.art.evaluate(([PRESETS]) => {
          const out = [];
          for (const p of PRESETS) for (const s of ["xs", "sm", "md"]) { const el = CS.art.icon("check", { ctx: __art.ctx({ preset: p }), size: s, treatment: "bare" }), g = el.querySelector("g"), sc = parseFloat(/scale\(([-\d.]+)/.exec(g.getAttribute("transform"))[1]); out.push([p, s, parseFloat(g.querySelector("path").getAttribute("stroke-width")) * sc]); }
          return out;
        }, [PRESETS]);
        for (const [p, s, px] of r) t.ok(px * 390 / 1080 >= 1.4 - 0.001, `${p} ${s}: ${px.toFixed(2)} px is ${(px * 390 / 1080).toFixed(2)} px in the feed`);
      }
    },
    {
      name: "contact sheets: 8 treatments x the six DNAs on the real pack (icon-treatments.png at 1x and at the 130 px profile size), sizes, modifiers and objects",
      real: true,
      async run(t) {
        const cols = ["bare", "chip", "tile", "ring", "duo", "sticker", "badge", "giant"], pr = PRESETS, names = ["clock", "hourglass", "coins", "trophy", "megaphone", "lightbulb"];
        const items = [];
        pr.forEach((p, i) => cols.forEach((tr) => items.push({ kind: "icon", name: names[i], preset: p, rtl: true, opts: { size: "lg", treatment: tr, name: names[i] }, label: p + " " + tr })));
        const sh = await t.art.sheet({ cols: 8, cw: 330, ch: 350, items, title: "A1 icon treatments x the six DNAs (lg, base tone, RTL) - real pack" });
        t.eq((await t.art.safe(sh)).violations, [], "treatments sheet is painter-safe");
        const png = await t.art.shot(sh, "icon-treatments.png");
        const small = await t.art.small(png, Math.round(sh.w * 130 / 1080));
        t.art.save("icon-treatments-130.png", small);
        t.gte((await t.art.paintBoth(sh)).ssim, 0.98, "treatments sheet: svg vs replay");
        const sizes = [];
        for (const p of pr) for (const [s, tr] of [["xs", "bare"], ["sm", "bare"], ["md", "chip"], ["lg", "chip"], ["xl", "duo"], ["hero", "bare"]]) sizes.push({ kind: "icon", name: "megaphone", preset: p, opts: { size: s, treatment: tr, name: "m" }, label: p + " " + s + " " + tr });
        const sz = await t.art.sheet({ cols: 6, cw: 420, ch: 460, items: sizes, title: "size tokens xs..hero, ladder and floors" });
        t.eq((await t.art.safe(sz)).violations, [], "sizes sheet is painter-safe"); await t.art.shot(sz, "art/icon-sizes.png");
        const mods = [];
        for (const p of pr) for (const m of MODS) mods.push({ kind: "icon", name: "clock", preset: p, opts: { size: "lg", treatment: p === "swiss" ? "chip" : "sticker", modifier: m, name: "clock" }, label: p + " " + m });
        const ms = await t.art.sheet({ cols: 6, cw: 320, ch: 340, items: mods, title: "modifiers" });
        t.eq((await t.art.safe(ms)).violations, []); await t.art.shot(ms, "art/icon-modifiers.png");
        const ids = await t.art.evaluate(() => CS.art.object.ids());
        const objs = [];
        pr.forEach((p, i) => ["bare", "sticker", "giant"].forEach((tr, j) => objs.push({ kind: "object", id: ids[(i * 3 + j) % ids.length], preset: p, opts: { size: tr === "giant" ? "lg" : "xl", treatment: tr }, label: p + " " + tr })));
        const os = await t.art.sheet({ cols: 6, cw: 330, ch: 360, items: objs, title: "objects (D5 hero set): bare, die-cut sticker, giant plate" });
        t.eq((await t.art.safe(os)).violations, []); await t.art.shot(os, "art/icon-objects.png");
        t.gte((await t.art.paintBoth(os)).ssim, 0.98, "objects sheet: svg vs replay");
      }
    },
    {
      name: "all 398 shipped icons draw in every DNA with the ladder and butt/miter caps without failing safe(); no icon exceeds the A9 budget",
      real: true,
      async run(t) {
        const names = await t.art.evaluate(() => Object.keys(CS.visual._.block("cs-icon-pack").icons));
        t.gte(names.length, 380, "the pack holds the shipped icons: " + names.length);
        for (const p of ["swiss", "creator", "heritage"]) {
          const items = names.map((n) => ({ kind: "icon", name: n, preset: p, opts: { size: "md", treatment: "chip", name: n } }));
          const sh = await t.art.sheet({ cols: 24, cw: 190, ch: 190, items });
          const s = await t.art.safe(sh);
          t.eq(s.violations, [], `${p}: ${names.length} icons, safe(): ${JSON.stringify(s.violations.slice(0, 3))}`);
          const missing = await t.art.evaluate((sel) => document.querySelectorAll(sel + " [data-sheet]").length, sh.sel);
          t.eq(missing, 0, p + ": nothing missing");
        }
      }
    }
  ]
};
