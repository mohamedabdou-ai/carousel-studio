// tests/unit/js/art/field.test.mjs · CS.art "field" (package A8a): the committed colour panel (an owner) that carries a word, a numeral or the two sides of a compare or myth slide;
// the 24 px seam under the header (4.1), bleed to the canvas edges (A12a), S-11 mirror, the content boxes of the panel cards (IS-3), the contact sheet of the package acceptance.
//   node tests/unit/js/art/run.mjs --only field [--out DIR]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PRESETS } from "./support/dna.mjs";
import { decodePng, ssim } from "../../../parity/lib/ssim.mjs";
import { roleCss } from "./rows.test.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), SRC = path.resolve(HERE, "../../../../src/art/field.js");
const SIDES = [{ label: "قبل", text: "نصايح عن كتابة الكابشن" }, { label: "بعد", text: "كابشن بياخد 5\u00a0دقايق بدل ساعة" }];
const MYTH = [{ label: "خرافة", text: "الهوك لازم يصدم" }, { label: "حقيقة", text: "الهوك لازم يوعد" }];
const WORD = { kind: "field", word: "احفظ" }, NUM = { kind: "field", value: "30", unit: "%" };
const render = (t, o = {}, anchor = WORD) => t.art.render(anchor, { preset: "creator", tone: "base", recipe: "under", slideId: "s05", box: { w: 852, h: 420 }, png: false, ...o });
const sl = (extra = {}, visual) => ({ id: "s05", type: "stat", title: "x", ...(visual ? { visual } : {}), ...extra });

/** in-page: the owner panel(s), their labels and the zone-relative rectangles of a rendered field anchor */
const probe = (sel) => {
  const root = document.querySelector(sel + " .cs-art"), slide = document.querySelector(sel).getBoundingClientRect(), zone = document.querySelector(sel + " .cs-zone").getBoundingClientRect();
  const R = (e, o) => { const b = e.getBoundingClientRect(), q = o || zone; return { x: b.left - q.left, y: b.top - q.top, w: b.width, h: b.height }; };
  const C = CS.core.color, rgb = (c) => "#" + c.match(/\d+/g).slice(0, 3).map((n) => (+n).toString(16).padStart(2, "0")).join("").toUpperCase();
  return { art: root.getAttribute("data-art"), root: R(root), owners: [...root.querySelectorAll("[data-owner]")].map((o) => ({ r: R(o), s: R(o, slide), bg: rgb(getComputedStyle(o).backgroundColor), bleed: o.hasAttribute("data-bleed"), border: getComputedStyle(o).borderTopWidth,
      labels: [...o.querySelectorAll("[data-slot=art]")].map((l) => ({ role: l.getAttribute("data-role"), key: l.getAttribute("data-slot-key"), r: R(l), s: R(l, slide), fg: rgb(getComputedStyle(l).color), bg: rgb(getComputedStyle(l).backgroundColor), floor: l.getAttribute("data-floor") })),
      svgs: [...o.querySelectorAll("svg")].map((s) => [s.getAttribute("class"), s.getAttribute("width")]), contrast: 0 })) };
};
const rgbOf = (hex) => hex.toUpperCase();

export default {
  module: "field",
  tests: [
    {
      name: "small panels: choose a fitting glyph or refuse; every returned content box stays inside its owner's border, twice",
      async run(t) {
        await roleCss(t);
        for(const h of [180,300,420,620])for(const type of ['compare','myth-fact'])for(const rtl of [true,false]){
          const opts={slide:sl({type,sides:SIDES}),recipe:'full',box:{w:852,h},rtl};
          const a=await render(t,opts,{kind:'field',icons:['x','check']}),b=await render(t,opts,{kind:'field',icons:['x','check']});
          t.eq(a?.html,b?.html);t.eq(a?.boxes,b?.boxes);
          if(!a)continue;
          const owners=a.boxes.filter(x=>x.kind==='owner');
          for(const x of a.boxes.filter(x=>x.ownerOf)){
            const o=owners.find(o=>o.id===x.ownerOf);
            t.ok(x.w>0&&x.h>0,'positive content dimensions');
            t.ok(x.x>=o.x+o.border&&x.y>=o.y+o.border&&x.x+x.w<=o.x+o.w-o.border&&x.y+x.h<=o.y+o.h-o.border,'inside border');
          }
        }
      }
    },
    {
      name: "registration: field:word, :numeral and :panel join A1b's :icon; word needs anchor.word, numeral anchor.value, panel exactly two slide.sides (else null); the canonical sub decides (value beats word)",
      async run(t) {
        await roleCss(t);
        t.eq(await t.art.evaluate(() => CS.art.caps().art.field), ["icon", "numeral", "panel", "word"]);
        t.eq(await render(t, { slide: sl() }, { kind: "field" }), null, "a panel with no sides builds nothing");
        t.eq(await render(t, { slide: sl({ sides: [SIDES[0]] }) }, { kind: "field" }), null, "one side is not a pair");
        for (const [anchor, art, n] of [[WORD, "field", 1], [NUM, "field", 1], [{ kind: "field", value: "30", word: "احفظ" }, "field", 1]]) {
          const r = await render(t, { slide: sl() }, anchor), p = await t.art.evaluate(probe, r.sel);
          t.eq([p.art, p.owners.length], [art, n], "one owner panel");
        }
        const both = await render(t, { slide: sl() }, { kind: "field", value: "30", word: "احفظ" });
        t.eq(both.labels.map((l) => l.role), ["numeral"], "value beats word: _.sub says numeral");
        const pn = await render(t, { slide: sl({ sides: SIDES }), recipe: "full", box: { w: 852, h: 700 } }, { kind: "field" });
        t.eq((await t.art.evaluate(probe, pn.sel)).owners.length, 2, "two cards, two owners");
      }
    },
    {
      name: "labels: word = one word-role label; numeral = numeral then title (unit); panel = chip (when labelled) then title per side; text is copied; labelsOnly gives the same labels; keys sNN.art.<i>",
      async run(t) {
        await roleCss(t);
        t.eq((await render(t, { slide: sl() })).labels, [{ text: "احفظ", role: "word", index: 0 }]);
        t.eq((await render(t, { slide: sl() }, NUM)).labels, [{ text: "30", role: "numeral", index: 0 }, { text: "%", role: "title", index: 1 }]);
        t.eq((await render(t, { slide: sl() }, { kind: "field", value: "8" })).labels, [{ text: "8", role: "numeral", index: 0 }], "no unit, no unit label");
        const pn = await render(t, { slide: sl({ sides: SIDES }), recipe: "full", box: { w: 852, h: 700 } }, { kind: "field" });
        t.eq(pn.labels, [{ text: "قبل", role: "chip", index: 0 }, { text: "نصايح عن كتابة الكابشن", role: "title", index: 1 }, { text: "بعد", role: "chip", index: 2 }, { text: "كابشن بياخد 5\u00a0دقايق بدل ساعة", role: "title", index: 3 }], "side 1 chip, text, side 2 chip, text");
        const p = await t.art.evaluate(probe, pn.sel);
        t.eq(p.owners.flatMap((o) => o.labels.map((l) => l.key)), ["s05.art.0", "s05.art.1", "s05.art.2", "s05.art.3"]);
        t.eq(p.owners.flatMap((o) => o.labels.map((l) => l.floor)), ["36", "36", "36", "36"], "data-floor from the kit: Arabic 36");
        const nl = await render(t, { slide: sl({ sides: [{ text: "أ" }, { text: "ب" }] }), recipe: "full", box: { w: 852, h: 700 } }, { kind: "field" });
        t.eq(nl.labels.map((l) => l.index + l.role), ["0title", "1title"], "a side without a label has no chip");
        const only = await t.art.evaluate(([slide]) => { const c = __art.ctx({ preset: "creator", slide, labelsOnly: true }), b = CS.art.build({ kind: "field" }, c); return { el: b.el, boxes: b.boxes.length, labels: b.labels.map((x) => ({ text: x.text, role: x.role, index: x.index })) }; }, [sl({ sides: SIDES })]);
        t.eq(only, { el: null, boxes: 0, labels: pn.labels }, "labelsOnly equals the built labels");
        const w = await t.art.evaluate(() => { const c = __art.ctx({ preset: "creator", labelsOnly: true }), b = CS.art.build({ kind: "field", word: "احفظ" }, c); return b.labels.map((x) => x.role + x.index + x.text); });
        t.eq(w, ["word0احفظ"]);
      }
    },
    {
      name: "seam (4.1): on over the panel starts 24 px below the zone top (less when the recipe box already starts at 24), never on under, never with bleed top; the words stay centred in what is left",
      async run(t) {
        await roleCss(t);
        const own = async (o, anchor = WORD) => { const r = await render(t, { slide: sl({}, o.visual), ...o }, anchor), p = await t.art.evaluate(probe, r.sel); return { r, p, ow: p.owners[0], box: r.boxes[0] }; };
        const a = await own({ recipe: "over", box: { w: 852, h: 560, x: 0, y: 0 } });
        t.near(a.ow.r.y, 24, 0.5, "over, box at the zone top: the panel starts at 24"); t.near(a.ow.r.h, 560 - 24, 0.5); t.near(a.box.y, 24, 0.5, "boxes[] agrees"); t.near(a.box.h, 536, 0.5);
        const b = await own({ recipe: "over", box: { w: 852, h: 536, x: 0, y: 24 } });
        t.near(b.ow.r.y, 24, 0.5, "the geometry already gave y 24 (V1b): no second inset"); t.near(b.ow.r.h, 536, 0.5);
        const c = await own({ recipe: "over", box: { w: 852, h: 560, x: 0, y: 10 } });
        t.near(c.ow.r.y, 24, 0.5, "box at y 10: topped up to 24 below the zone top"); t.near(c.ow.r.h, 560 - 14, 0.5);
        const d = await own({ recipe: "under", box: { w: 852, h: 420, x: 0, y: 200 } });
        t.near(d.ow.r.y, 200, 0.5, "under: no seam"); t.near(d.ow.r.h, 420, 0.5);
        const e = await own({ recipe: "over", box: { w: 852, h: 560, x: 0, y: 0 }, visual: { bleed: "top" } });
        t.near(e.ow.r.y, -261, 0.5, "bleed top: no seam, the panel runs up to the canvas top (behind the header)"); t.near(e.ow.r.h, 560 + 261, 0.5); t.ok(e.ow.bleed, "data-bleed marks it (A12a)");
        const word = a.ow.labels[0], mid = a.ow.r.y + a.ow.r.h / 2;
        t.near(word.r.y + word.r.h / 2, mid, 2, "the word is centred in the panel below the seam");
      }
    },
    {
      name: "bleed (A12a): both runs the panel to both canvas edges, start and end to one (RTL start is the right edge), bottom to the canvas foot; the words stay put inside the content box; boxes[] says the same",
      async run(t) {
        await roleCss(t);
        const run = async (bleed, rtl = true) => { const r = await render(t, { slide: sl({}, { bleed }), rtl, recipe: "over", box: { w: 852, h: 560, x: 0, y: 24 } }), p = await t.art.evaluate(probe, r.sel); return { r, ow: p.owners[0] }; };
        const both = await run("both");
        t.near(both.ow.s.x, 0, 0.5, "left canvas edge"); t.near(both.ow.s.w, 1080, 0.5, "right canvas edge"); t.ok(both.ow.bleed);
        t.near(both.r.boxes[0].x, -114, 0.5); t.near(both.r.boxes[0].w, 1080, 0.5);
        const lab = both.ow.labels[0].s; t.ok(lab.x >= 114 && lab.x + lab.w <= 966, "the word stays inside the content box: " + lab.x + ".." + (lab.x + lab.w));
        t.near(lab.x + lab.w / 2, 540, 2, "and centred on the box, not on the bled panel");
        const st = await run("start"), en = await run("end"), stl = await run("start", false);
        t.eq([Math.round(st.ow.s.x), Math.round(st.ow.s.w)], [114, 966], "RTL start: the panel reaches the right edge only");
        t.eq([Math.round(en.ow.s.x), Math.round(en.ow.s.w)], [0, 966], "RTL end: the left edge only");
        t.eq([Math.round(stl.ow.s.x), Math.round(stl.ow.s.w)], [0, 966], "LTR start: the left edge");
        const bt = await run("bottom"); t.near(bt.ow.s.y + bt.ow.s.h, 1440, 0.5, "bottom: to the canvas foot");
        const none = await run("none"); t.eq([none.ow.bleed, Math.round(none.ow.s.w)], [false, 852], "none: inside the box");
        const again = await render(t, { slide: sl({}, { bleed: "both" }), recipe: "over", box: { w: 852, h: 560, x: 0, y: 24 } }), safe = await t.art.safe(again, { content: true }); t.eq(safe.violations, [], "A12: a flagged bleed is exempt, the words are inside the content box");
      }
    },
    {
      name: "colour: base = the accent panel with the on-accent colour, tone field = the tone's surface with its ink; every word reads at 4.5:1 on every preset x tone; ink outline and hard shadow come from the DNA",
      async run(t) {
        await roleCss(t);
        const rows = await t.art.evaluate(([PRESETS]) => {
          const C = CS.core.color, out = [];
          const rgb = (c) => "#" + c.match(/\d+/g).slice(0, 3).map((n) => (+n).toString(16).padStart(2, "0")).join("").toUpperCase();
          for (const p of PRESETS) for (const tone of ["base", "invert", "field"]) {
            const ctx = __art.ctx({ preset: p, tone, slide: { id: "s05", type: "stat" } }); ctx.box = { w: 852, h: 420 }; ctx.recipe = "under";
            const b = CS.art.build({ kind: "field", word: "احفظ" }, ctx), tk = CS.art.kit.palette(ctx.tokens), host = document.createElement("div"); host.appendChild(b.el); document.body.appendChild(host);
            const o = b.el.querySelector("[data-owner]"), l = b.el.querySelector("[data-slot=art]"), bg = rgb(getComputedStyle(o).backgroundColor), fg = rgb(getComputedStyle(l).color);
            out.push([p + "/" + tone, bg, fg, +C.contrast(fg, bg).toFixed(2), bg === (tone === "field" ? tk.surface : tk.accent).toUpperCase(), getComputedStyle(o).boxShadow !== "none", getComputedStyle(o).borderTopWidth]); host.remove();
          }
          return out;
        }, [PRESETS]);
        t.eq(rows.length, 18);
        t.eq(rows.filter((r) => !r[4]).map((r) => r[0]), [], "panel colour: accent, or the surface on a field tone");
        t.eq(rows.filter((r) => r[3] < 4.5).map((r) => r.slice(0, 4)), [], "the word reads at 4.5:1 on its panel");
        t.eq(rows.filter((r) => r[0].startsWith("creator/base"))[0].slice(5), [true, "4px"], "creator: hard shadow and the 4 px ink outline");
        t.eq(rows.filter((r) => r[0].startsWith("swiss/base"))[0].slice(5), [false, "0px"], "swiss: flat, no outline");
      }
    },
    {
      name: "panel from slide.sides: two equal cards 24 px apart, the first side at the start edge (S-11, mirrored in LTR), a chip pill, the text in title role, myth-fact gets a cross then a tick, a compare gets none, anchor.icons put a chip glyph at the foot; cards hold 80% of the box height",
      async run(t) {
        await roleCss(t);
        const box = { w: 852, h: 700 };
        const go = async (sides, type, o = {}, anchor = { kind: "field" }) => { const r = await render(t, { slide: sl({ type, sides }), recipe: "full", box, ...o }, anchor), p = await t.art.evaluate(probe, r.sel); return { r, p }; };
        for (const rtl of [true, false]) {
          const { r, p } = await go(SIDES, "compare", { rtl }), [a, b] = p.owners;
          t.near(a.r.w, 414, 0.5); t.near(b.r.w, 414, 0.5); t.near(Math.abs(a.r.x - b.r.x) - 414, 24, 0.5, "24 px between the cards");
          t.ok(rtl ? a.r.x > b.r.x : a.r.x < b.r.x, (rtl ? "RTL" : "LTR") + ": the first side sits at the start edge");
          t.eq(r.boxes.filter((x) => x.kind === "owner").map((x) => Math.round(x.x)), [Math.round(a.r.x), Math.round(b.r.x)], "boxes[] follow the DOM order");
          t.near(a.r.h, 560, 0.5, "80% of the 700 px box"); t.near(a.r.y, 70, 0.5, "centred in the box"); t.eq(a.r.h, b.r.h, "equal heights");
          t.eq(a.svgs.length + b.svgs.length, 0, "compare: no marks");
        }
        const my = await go(MYTH, "myth-fact"); const [m0, m1] = my.p.owners;
        t.eq([m0.svgs.length, m1.svgs.length], [1, 1], "myth-fact: a mark on each card");
        const marks = await t.art.evaluate(([sel]) => [...document.querySelectorAll(sel + " [data-owner]")].map((o) => [...o.querySelectorAll("svg path")].slice(1).map((p) => p.getAttribute("d").slice(0, 6))), [my.r.sel]);
        t.eq(marks, [["M18 18", "M18 18"], ["M15 29", "M15 29"]], "the first card (the myth) crosses, the second (the fact) ticks");
        const ic = await go(SIDES, "compare", {}, { kind: "field", icons: ["x", "check"] }); t.eq(ic.p.owners.map((o) => o.svgs.length), [1, 1], "anchor.icons draw a chip at the foot of each card");
        for (const o of my.p.owners) {
          const chip = o.labels[0], text = o.labels[1], C = (a, b) => 0;
          t.ok(chip.bg !== "#000000" && chip.fg !== chip.bg, "the chip is a pill: " + chip.bg + " / " + chip.fg);
        }
        const cr = await t.art.evaluate(([sel]) => { const C = CS.core.color, rgb = (c) => "#" + c.match(/\d+/g).slice(0, 3).map((n) => (+n).toString(16).padStart(2, "0")).join("").toUpperCase(); return [...document.querySelectorAll(sel + " [data-owner]")].map((o) => { const f = rgb(getComputedStyle(o).backgroundColor), ls = [...o.querySelectorAll("[data-slot=art]")].map((l) => [rgb(getComputedStyle(l).color), rgb(getComputedStyle(l).backgroundColor)]); return { chip: C.contrast(ls[0][0], ls[0][1]), text: C.contrast(ls[1][0], f) }; }); }, [my.r.sel]);
        t.ok(cr.every((c) => c.chip >= 4.5 && c.text >= 4.5), "chip and text read at 4.5:1 on both cards: " + JSON.stringify(cr));
        const own = my.r.boxes.filter((b) => b.kind === "owner"); t.eq(own.map((b) => [b.fill, b.border]), [[1, 3], [1, 3]], "owner boxes carry fill and border");
      }
    },
    {
      name: "panel geometry (IS-3): each card is an owner with fill and border AND its content boxes - the chip pill, the title lines and the foot glyph or mark - name it in ownerOf, have positive sizes and sit inside it; filled cards are owners to CS.visual.deadSpace, a card holding one letter is not, and the boxes track the markup",
      async run(t) {
        await roleCss(t);
        const box = { w: 852, h: 700 }, MORE = [{ label: "قبل", text: "كابشن بياخد ساعة كاملة كل يوم" }, { label: "بعد", text: "كابشن بياخد خمس دقايق بقالب جاهز" }];
        const go = async (sides, type, anchor = { kind: "field" }, o = {}) => { const r = await render(t, { slide: sl({ type, sides }), recipe: "full", box, ...o }, anchor); return { r, ds: await t.art.evaluate(([b]) => CS.visual.deadSpace(b, { w: 852, h: 700 }), [r.boxes]) }; };
        const dom = (sel) => t.art.evaluate(([sel]) => { const z = document.querySelector(sel + " .cs-zone").getBoundingClientRect(), R = (e) => { const b = e.getBoundingClientRect(); return { x: b.left - z.left, y: b.top - z.top, w: b.width, h: b.height }; }; return [...document.querySelectorAll(sel + " [data-owner]")].map((o) => ({ chip: R(o.querySelector("[data-role=chip]")), title: R(o.querySelector("[data-role=title]")), svg: [...o.querySelectorAll(":scope > svg")].map(R) })); }, [sel]);
        for (const [name, sides, type, anchor, svgs] of [["myth-fact marks", MYTH, "myth-fact", { kind: "field" }, 1], ["compare, long titles", MORE, "compare", { kind: "field" }, 0]]) for (const rtl of [true, false]) {
          const { r, ds } = await go(sides, type, anchor, { rtl }), owners = r.boxes.filter((b) => b.kind === "owner"), kids = r.boxes.filter((b) => b.kind !== "owner");
          t.eq(owners.map((b) => [b.id, b.fill, b.border]), [["c0", 1, 3], ["c1", 1, 3]], name + ": two owners with fill and border");
          t.eq(kids.length, 2 * (2 + svgs), name + ": per card a chip, the title lines" + (svgs ? " and the mark" : ""));
          t.ok(kids.every((b) => b.w > 0 && b.h > 0 && (b.ownerOf === "c0" || b.ownerOf === "c1")), name + ": positive sizes, each names its owner");
          t.ok(kids.every((b) => { const o = owners.find((q) => q.id === b.ownerOf); return b.x >= o.x - 0.5 && b.x + b.w <= o.x + o.w + 0.5 && b.y >= o.y - 0.5 && b.y + b.h <= o.y + o.h + 0.5; }), name + ": every content box sits inside its owner");
          t.eq([0, 1].map((i) => kids.filter((b) => b.ownerOf === "c" + i).map((b) => b.kind)), svgs ? [["text", "text", "ink"], ["text", "text", "ink"]] : [["text", "text"], ["text", "text"]], name + ": kinds per card");
          t.eq(ds.owners.map((o) => [o.id, o.ok, o.meta]), [["c0", true, "ok"], ["c1", true, "ok"]], name + (rtl ? "" : "/ltr") + ": both cards own their interior: " + JSON.stringify(ds.owners));
          t.ok(ds.owners.every((o) => o.rows >= 65 && o.cols >= 65), name + ": occupancy at least 65% of rows and columns: " + ds.owners.map((o) => o.rows + "/" + o.cols));
          const d = await dom(r.sel);
          d.forEach((c, i) => {
            const mine = kids.filter((b) => b.ownerOf === "c" + i);
            t.near(mine[0].x + mine[0].w / 2, c.chip.x + c.chip.w / 2, 24, name + " card " + i + ": predicted chip centre x (the pill width is an estimate)"); t.near(mine[0].y + mine[0].h / 2, c.chip.y + c.chip.h / 2, 3, name + " card " + i + ": chip centre y");
            t.near(mine[1].y + mine[1].h / 2, c.title.y + c.title.h / 2, 80, name + " card " + i + ": title centre y (the line count is an estimate)");
            if (svgs) { t.near(mine[2].x, c.svg[0].x, 3, name + " card " + i + ": mark x"); t.near(mine[2].y, c.svg[0].y, 3, name + " card " + i + ": mark y"); t.near(mine[2].w, c.svg[0].w, 0.5, name + " card " + i + ": mark size"); }
          });
        }
        const glyph = await go(SIDES, "compare", { kind: "field", icons: ["x", "check"] }), gk = glyph.r.boxes.filter((b) => b.kind === "ink");
        t.eq(gk.map((b) => b.ownerOf), ["c0", "c1"], "anchor.icons: one glyph box per card");
        const gd = await dom(glyph.r.sel);
        gd.forEach((c, i) => { t.near(gk[i].w, c.svg[0].w, 0.5, "glyph size " + i); t.near(gk[i].x, c.svg[0].x, 3, "glyph x " + i); });
        const lone = await go([{ text: "أ" }, { text: "ب" }], "compare");
        t.eq(lone.ds.owners.map((o) => o.ok), [false, false], "a card that holds one letter in a 560 px field is not an owner (the gate sees the dead space): " + JSON.stringify(lone.ds.owners));
        const empty = await t.art.evaluate(([b]) => CS.visual.deadSpace(b.filter((x) => x.kind === "owner"), { w: 852, h: 700 }), [glyph.r.boxes]);
        t.eq(empty.owners.map((o) => o.ok), [false, false], "the same two cards with no content boxes are not owners either");
      }
    },
    {
      name: "boxes[] agree with the DOM for word and numeral panels (owner rectangle within 2 px, in zone coordinates with the box origin and the seam), the owner carries fill and border, and a word on its panel is an owner that holds its content",
      async run(t) {
        await roleCss(t);
        for (const [anchor, o] of [[WORD, { recipe: "under", box: { w: 852, h: 420, x: 0, y: 130 } }], [NUM, { recipe: "over", box: { w: 852, h: 560, x: 0, y: 24 } }], [WORD, { recipe: "over", box: { w: 700, h: 500, x: 76, y: 0 } }]]) {
          const r = await render(t, { slide: sl(), ...o }, anchor), p = await t.art.evaluate(probe, r.sel), own = r.boxes[0], ow = p.owners[0].r;
          t.eq([own.kind, own.id, own.fill, own.border], ["owner", "f", 1, o.recipe ? own.border : 0], "owner id and fill");
          for (const k of ["x", "y"]) t.near(ow[k], own[k], 2, k); t.near(ow.w, own.w, 2, "w"); t.near(ow.h, own.h, 2, "h");
          t.ok(r.boxes.slice(1).every((b) => b.ownerOf === "f" && b.x >= own.x && b.x + b.w <= own.x + own.w + 1), "content boxes sit inside the owner");
        }
        const r = await render(t, { slide: sl(), box: { w: 852, h: 420 } }), m = await t.art.evaluate(([boxes]) => CS.visual.deadSpace(boxes, { w: 852, h: 998 }), [r.boxes]);
        t.ok(m.owners.length === 1 && m.owners[0].ok, "the word panel owns its interior: " + JSON.stringify(m.owners));
      }
    },
    {
      name: "painter-safe (A1-A17) on 6 presets x 3 tones x RTL and LTR for word, numeral and panel, deterministic (same input, same bytes); the slide, the panel and the word region paint alike in both painters (SSIM >= 0.98)",
      async run(t) {
        await roleCss(t);
        const cases = [[WORD, { recipe: "over", box: { w: 852, h: 560, x: 0, y: 24 }, extra: { visual: { bleed: "both" } } }], [NUM, { recipe: "under", box: { w: 852, h: 460 } }], [{ kind: "field" }, { recipe: "full", box: { w: 852, h: 700 }, extra: { sides: SIDES, type: "myth-fact" } }]];
        for (const rtl of [true, false]) for (const preset of PRESETS) for (const tone of ["base", "invert", "field"]) for (const [anchor, c] of cases) {
          const o = { preset, tone, rtl, recipe: c.recipe, box: c.box, slide: { ...sl(), ...(c.extra || {}) } }, a = await render(t, o, anchor), b = await render(t, o, anchor);
          const k = [preset, tone, anchor.word ? "word" : anchor.value ? "numeral" : "panel", rtl ? "rtl" : "ltr"].join("/");
          t.ok(a && a.html === b.html && JSON.stringify(a.boxes) === JSON.stringify(b.boxes), k + ": two builds are byte-identical");
          const s = await t.art.safe(b, { content: true }); t.eq(s.violations, [], k + ": " + JSON.stringify(s.violations.slice(0, 3)));
        }
        for (const [preset, anchor, c] of [["creator", WORD, cases[0][1]], ["poster", NUM, cases[1][1]], ["swiss", { kind: "field" }, cases[2][1]], ["creator", { kind: "field" }, cases[2][1]]]) {
          const r = await render(t, { preset, recipe: c.recipe, box: c.box, slide: { ...sl(), ...(c.extra || {}) } }, anchor), p = await t.art.paintBoth(r);
          t.gte(p.ssim, 0.98, preset + ": svg and replay painters agree on the slide (" + p.ssim.toFixed(4) + ")");
          const at = await t.art.evaluate(([sel]) => { const s = document.querySelector(sel).getBoundingClientRect(), R = (e) => { const b = e.getBoundingClientRect(), x = Math.max(0, Math.round(b.left - s.left)), y = Math.max(0, Math.round(b.top - s.top)); return [x, y, Math.min(1080 - x, Math.round(b.width)), Math.min(1440 - y, Math.round(b.height))]; }; return { panel: R(document.querySelector(sel + " [data-owner]")), word: R(document.querySelector(sel + " [data-slot=art]")) }; }, [r.sel]);
          const a = decodePng(p.svgPng), b = decodePng(p.replayPng), crop = (im, [x, y, w, h]) => { const d = new Uint8ClampedArray(w * h * 4); for (let j = 0; j < h; j++) d.set(im.data.subarray(((y + j) * im.width + x) * 4, ((y + j) * im.width + x + w) * 4), j * w * 4); return { width: w, height: h, data: d }; };
          for (const k of ["panel", "word"]) { const v = ssim(crop(a, at[k]), crop(b, at[k])); t.gte(v, 0.98, preset + ": the " + k + " region paints alike (" + v.toFixed(4) + ")"); }
        }
      }
    },
    {
      name: "hard rules and budget: field fitting stays within 4 KiB, rows plus field within 8 KiB",
      async run(t) {
        const src = fs.readFileSync(SRC, "utf8"), rows = fs.readFileSync(path.join(path.dirname(SRC), "rows.js"), "utf8");
        for (const bad of [/Math\.random/, /\bDate\b/, /performance\./, /fetch\(/, /XMLHttpRequest/, /analytics/, /letter-spacing|letterSpacing/, /italic|oblique/, /text-?justify|["']justify["']/i, /opacity/i, /\bdocument\b/, /\bwindow\b/]) t.ok(!bad.test(src), "forbidden: " + bad);
        t.lte(Buffer.byteLength(src, "utf8"), 4096, "field.js bounds and fitting allocation: 4 KiB");
        t.lte(Buffer.byteLength(src, "utf8") + Buffer.byteLength(rows, "utf8"), 8192, "rows + field within 8 KiB");
        t.ok(src.startsWith("/* src/art/field.js - A8a."), "names its owner");
      }
    },
    {
      name: "contact sheet (the package acceptance): word, numeral and panel on creator, poster, swiss and notebook, over with bleed, under, the myth and compare panels, RTL and LTR, at 1x and at the 130 px profile size",
      real: true,
      async run(t) {
        await roleCss(t);
        const cell = (preset, anchor, o = {}) => ({ kind: "anchor", anchor, preset, tone: o.tone || "base", rtl: o.rtl !== false, recipe: o.recipe || "under", slide: { ...sl(), ...(o.slide || {}) }, box: o.box || { w: 852, h: 420 }, label: o.label });
        const items = [
          cell("creator", WORD, { recipe: "over", slide: { visual: { bleed: "both" } }, box: { w: 852, h: 460 }, label: "creator word over, bleed both" }),
          cell("poster", NUM, { tone: "field", recipe: "over", box: { w: 852, h: 560 }, label: "poster numeral on a field tone" }),
          cell("swiss", { kind: "field", word: "الهوك" }, { label: "swiss word" }),
          cell("notebook", { kind: "field", value: "8", unit: "جنيه" }, { box: { w: 852, h: 480 }, label: "notebook numeral + unit" }),
          cell("creator", { kind: "field" }, { recipe: "full", box: { w: 852, h: 700 }, slide: { type: "myth-fact", sides: MYTH }, label: "creator myth panel" }),
          cell("poster", { kind: "field" }, { recipe: "full", box: { w: 852, h: 700 }, slide: { type: "compare", sides: SIDES }, label: "poster compare panel" }),
          cell("interface", { kind: "field", word: "Save it" }, { tone: "invert", rtl: false, label: "interface word en" }),
          cell("heritage", { kind: "field" }, { recipe: "full", box: { w: 852, h: 700 }, slide: { type: "compare", sides: SIDES }, label: "heritage compare, anchor.icons" })
        ];
        items[7].anchor = { kind: "field", icons: ["x", "check"] };
        const sh = await t.art.sheet({ cols: 2, cw: 900, ch: 760, items });
        t.eq((await t.art.safe(sh)).violations, [], "sheet is painter-safe");
        t.eq(await t.art.evaluate((sel) => document.querySelectorAll(sel + " [data-sheet]:not(.cap):not(.row-title)").length, sh.sel), 0, "no cell is missing");
        const png = await t.art.shot(sh, "art/field.png"); t.art.save("art/field-130.png", await t.art.small(png, Math.round(sh.w * 130 / 1080)));
      }
    }
  ]
};
