// tests/unit/js/art/rows.test.mjs · CS.art "rows" (package A8a): the icon-list card (3-5 rows, chip + words + optional value column + tick or cross), spec 3.1 "Rows and grids",
// first-line chip alignment with art.chipOffset, S-11 (RTL logical order), S-17 (tick and cross never share a hue), S-21 (3-5 rows, no six-row exception), the ledger look, value columns
// that always mount their labels, width bounds, and the contact sheet of the package acceptance.
//   node tests/unit/js/art/run.mjs --only rows [--out DIR]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PRESETS } from "./support/dna.mjs";
import { decodePng, ssim } from "../../../parity/lib/ssim.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), SRC = path.resolve(HERE, "../../../../src/art/rows.js");
/* the harness sheet knows only small and body; the engine's primitives sheet sizes the other roles, so a test page carries the same sizes (word 260, numeral 340, title 64, chip 36) */
export const ROLE_CSS = `:is(.cs-slide,.cs-sheet) .cs-art-label{display:block;margin:0}
:is(.cs-slide,.cs-sheet) .cs-art-label[data-role="word"]{font:800 260px/1 Alexandria,sans-serif;white-space:nowrap;text-align:start}
:is(.cs-slide,.cs-sheet) .cs-art-label[data-role="numeral"]{font:800 340px/.9 Alexandria,sans-serif;white-space:nowrap;text-align:start}
:is(.cs-slide,.cs-sheet) .cs-art-label[data-role="title"]{font:700 64px/1.2 Alexandria,sans-serif;white-space:normal;text-align:start}
:is(.cs-slide,.cs-sheet) .cs-art-label[data-role="chip"]{font:700 36px/1.2 Alexandria,sans-serif;white-space:nowrap;text-align:start}
:is(.cs-slide,.cs-sheet) .cs-art-label[data-role="body"]{font:600 44px/1.3 "Readex Pro",sans-serif;white-space:normal;text-align:start}
:is(.cs-slide,.cs-sheet) .cs-art-label[data-role="small"]{font:500 36px/1.3 "Readex Pro",sans-serif;white-space:normal;text-align:start}`;
export async function roleCss(t) {
  await t.art.evaluate((css) => { if (document.getElementById("a8a-css")) return; const s = document.createElement("style"); s.id = "a8a-css"; s.setAttribute("data-cs-slide-css", ""); s.textContent = css; document.head.appendChild(s); }, ROLE_CSS);
}

const CHECK = [
  { title: "نطاق الشغل", text: "اللي هتسلمه بالظبط", icon: "target" },
  { title: "التعديلات", text: "عددها متفق عليه", icon: "pencil", mark: "tick" },
  { title: "ميعاد التسليم", text: "تاريخ مكتوب", icon: "calendar-check", mark: "cross" },
  { title: "الدفع", text: "نص الفلوس قبل ما تبدأ", icon: "coins" }
];
const HOOKS = [{ title: "الهوك في أول سطر", icon: "megaphone" }, { title: "فكرة واحدة بس", icon: "lightbulb" }, { title: "دعوة واضحة للحفظ", icon: "bookmark" }, { title: "من غير كلام زيادة", icon: "pencil" }];
const LEDGER = [
  { title: "مصاريف الشهر", value: "8,000", icon: "check" }, { title: "اللي عايز تكسبه", value: "12,000", icon: "bookmark" },
  { title: "ساعات شغل فعلية", value: "80", icon: "clock" }, { title: "سعر ساعتك", value: "250 جنيه", icon: "coins", hi: true }
];
const slide = (items, type = "checklist", extra = {}) => ({ id: "s11", type, title: "x", items, ...extra });
const render = (t, o = {}, anchor = { kind: "rows" }) => t.art.render(anchor, { preset: "creator", tone: "base", recipe: "full", slideId: "s11", box: { w: 852, h: 700 }, png: false, ...o });
/** runs fn with art.chipOffset = k px on one preset's art block (the per-font chip offset of the first-line alignment), then puts the block back */
export const withOffset = async (t, preset, k, fn) => {
  await t.art.evaluate(([p, k]) => { const P = window.__ART_PRESETS[p]; P.__art0 = P.__art0 || P.art; P.art = Object.assign({}, P.__art0, { chipOffset: k }); }, [preset, k]);
  try { return await fn(); } finally { await t.art.evaluate(([p]) => { const P = window.__ART_PRESETS[p]; if (P.__art0) { P.art = P.__art0; delete P.__art0; } }, [preset]); }
};

/** in-page: the geometry of a rendered rows anchor, relative to the body zone */
const probe = (sel) => {
  const root = document.querySelector(sel + " .cs-art"), card = root.querySelector("[data-owner]"), zone = document.querySelector(sel + " .cs-zone").getBoundingClientRect();
  const R = (e) => { const b = e.getBoundingClientRect(); return { x: b.left - zone.left, y: b.top - zone.top, w: b.width, h: b.height, r: b.right - zone.left }; };
  return { root: R(root), card: R(card), owners: root.querySelectorAll("[data-owner]").length, art: root.getAttribute("data-art"),
    rows: [...card.children].map((row) => ({ r: R(row), main: R(row.children[0]), kids: [...row.children].flatMap((k, i) => (i ? [k] : [...k.children])).map(R), chip: (row.querySelector("svg.cs-icon") || { getAttribute: () => null }).getAttribute("data-size"), labels: [...row.querySelectorAll("[data-slot=art]")].map((l) => ({ role: l.getAttribute("data-role"), key: l.getAttribute("data-slot-key"), text: l.textContent, c: getComputedStyle(l).color, h: l.getBoundingClientRect().height, lc: l.getBoundingClientRect().top - zone.top + parseFloat(getComputedStyle(l).lineHeight) / 2, lh: parseFloat(getComputedStyle(l).lineHeight) })) })) };
};

export default {
  module: "rows",
  tests: [
    {
      name: "registration: rows:list only; 3-5 rows build one owner card, 0, 1, 2 and 6 rows build nothing (a list below 3 rows is not an anchor; S-21, no six-row exception); items, else bullets with visual.rowIcons, else anchor.captions",
      async run(t) {
        await roleCss(t);
        t.eq(await t.art.evaluate(() => ({ has: CS.art.has("rows", "list"), other: CS.art.has("rows", "bento"), caps: CS.art.caps().art.rows })), { has: true, other: false, caps: ["list"] });
        t.eq(await render(t, { slide: slide([]) }), null, "no data, no anchor");
        t.eq(await render(t, { slide: slide([HOOKS[0]]) }), null, "one row is not a list");
        t.eq(await render(t, { slide: slide(HOOKS.slice(0, 2), "summary") }), null, "two rows never earn anchor credit (at least 3 rows)");
        t.eq(await t.art.evaluate(([slide]) => CS.art.build({ kind: "rows" }, __art.ctx({ preset: "creator", slide, labelsOnly: true })), [slide(HOOKS.slice(0, 2), "summary")]), null, "and labelsOnly agrees: the hook drops the anchor");
        const six = [...HOOKS, { title: "خامسة", icon: "heart" }, { title: "سادسة", icon: "star" }];
        t.eq(await render(t, { slide: slide(six) }), null, "six items: the plain list carries them, there is no anchor claim");
        t.eq(await render(t, { slide: { id: "s11", type: "summary", bullets: ["1", "2", "3", "4", "5", "6"] } }), null, "six bullets");
        for (const n of [3, 4, 5]) {
          const r = await render(t, { slide: slide(HOOKS.concat(CHECK).slice(0, n), "summary") });
          const p = await t.art.evaluate(probe, r.sel);
          t.eq([p.art, p.owners, p.rows.length], ["rows", 1, n], n + " rows: one owner card of n rows");
        }
        const b = await render(t, { slide: { id: "s11", type: "checklist", bullets: ["الهوك", "الفكرة", "الطلب"], visual: { rowIcons: ["megaphone", "lightbulb", "bookmark"] } } });
        t.eq(b.labels.map((l) => l.text), ["الهوك", "الفكرة", "الطلب"], "bullets are the row words");
        const bp = await t.art.evaluate(probe, b.sel);
        t.eq(bp.rows.map((r) => r.chip === null), [false, false, false], "visual.rowIcons are the chips");
        const c = await render(t, { slide: { id: "s11", type: "summary" } }, { kind: "rows", captions: ["واحد", "اتنين", "تلاتة"], icons: ["clock", "check", "x"] });
        t.eq(c.labels.map((l) => l.text), ["واحد", "اتنين", "تلاتة"], "anchor.captions, with anchor.icons as chips");
        const tx = await render(t, { slide: { id: "s11", type: "summary" } }, { kind: "rows", captions: ["واحد", "اتنين", "تلاتة"] });
        t.eq((await t.art.evaluate(probe, tx.sel)).rows.map((r) => r.chip), [null, null, null], "no icon anywhere: no chip column, words only");
      }
    },
    {
      name: "labels: title, text and value per row in a fixed order with the roles body, small, body (title on the hi row); text is copied from the slide; labelsOnly returns the same labels with no markup; keys sNN.art.<i>",
      async run(t) {
        await roleCss(t);
        const r = await render(t, { slide: slide(CHECK) });
        const want = []; let i = 0;
        for (const it of CHECK) { want.push({ text: it.title, role: "body", index: i++ }); want.push({ text: it.text, role: "small", index: i++ }); }
        t.eq(r.labels, want, "row 1 title, text; row 2 title, text ...");
        const p = await t.art.evaluate(probe, r.sel);
        t.eq(p.rows.flatMap((x) => x.labels.map((l) => l.key)), want.map((l) => "s11.art." + l.index), "data-slot-key follows the label index");
        const l = await render(t, { slide: slide(LEDGER, "item") });
        t.eq(l.labels.map((x) => x.role + ":" + x.index + ":" + x.text), ["body:0:مصاريف الشهر", "body:1:8,000", "body:2:اللي عايز تكسبه", "body:3:12,000", "body:4:ساعات شغل فعلية", "body:5:80", "body:6:سعر ساعتك", "title:7:250 جنيه"], "the hi row's value is a title-role label");
        const only = await t.art.evaluate(([slide]) => { const c = __art.ctx({ preset: "creator", slide, labelsOnly: true }), b = CS.art.build({ kind: "rows" }, c); return { el: b.el, boxes: b.boxes.length, labels: b.labels.map((x) => ({ text: x.text, role: x.role, index: x.index })) }; }, [slide(CHECK)]);
        t.eq(only, { el: null, boxes: 0, labels: want }, "labelsOnly: the labels CS.visual.expected reads, and nothing else");
        const lens = await t.art.evaluate(([slide]) => { const c = __art.ctx({ preset: "swiss", slide, box: { w: 300, h: 100 } }), n = CS.art.build({ kind: "rows" }, c); const d = __art.ctx({ preset: "swiss", slide, box: { w: 300, h: 100 }, labelsOnly: true }); return { built: n, only: CS.art.build({ kind: "rows" }, d).labels.length }; }, [slide(CHECK)]);
        t.eq([lens.built, lens.only], [null, 8], "a box too small builds nothing, yet labelsOnly still lists the words (the hook decides first)");
      }
    },
    {
      name: "size by box: md chips (154 px) only for 4 rows or fewer without a value column, sm (102 px) at a pitch of 128 or more, xs (64 px) below that, nothing when a row would get under 80 px or its words and chip cannot share it; chips share one axis and sit on the first line",
      async run(t) {
        await roleCss(t);
        const size = async (items, h, type = "summary") => { const r = await render(t, { slide: slide(items, type), box: { w: 852, h } }); return r && await t.art.evaluate(probe, r.sel); };
        const a = await size(HOOKS, 700); t.eq(a.rows.map((x) => x.chip), ["md", "md", "md", "md"], "4 rows, room: md");
        t.eq(await size(HOOKS.slice(0, 3), 700).then((p) => p.rows.map((x) => x.chip)), ["md", "md", "md"]);
        const five = await size(HOOKS.concat([CHECK[0]]), 700); t.eq(five.rows.map((x) => x.chip), ["sm", "sm", "sm", "sm", "sm"], "5 rows: sm (md is for 4 or fewer)");
        t.gte(five.rows[0].r.h, 128, "five rows at 700 px keep a pitch of at least 128");
        t.eq((await size(LEDGER, 700)).rows.map((x) => x.chip), ["sm", "sm", "sm", "sm"], "a value column leaves the words room: sm");
        const plain5 = HOOKS.concat([{ title: "خامسة", icon: "heart" }]);
        t.eq((await size(plain5, 480)).rows.map((x) => x.chip), ["xs", "xs", "xs", "xs", "xs"], "5 rows in 480 px: xs chips");
        t.eq(await size(HOOKS.concat([CHECK[0]]), 480), null, "a row with a second line (title + text, 108 px) cannot share a 94 px pitch with its chip: nothing fits, the caller drops the anchor");
        t.eq(await size(plain5, 360), null, "5 rows in 360 px (under 80 px a row): nothing fits, the caller drops the anchor");
        const tall = await size(HOOKS, 900); t.near(tall.card.h, 4 * 200 + 8, 1, "the card stops growing at a 200 px pitch (4 rows) and sits centred in a taller box"); t.near(tall.card.y, (900 - tall.card.h) / 2, 1);
        const xs = a.rows.map((x) => x.kids[0].x), ys = a.rows.map((x) => x.kids[0].y + x.kids[0].h / 2 - x.labels[0].lc);
        t.ok(xs.every((v) => Math.abs(v - xs[0]) < 0.5), "chips share one axis: " + xs.join(","));
        t.ok(ys.every((v) => Math.abs(v) <= 1.5), "each chip is centred on the first line of its words (line box 57.2 px; the builder's estimate is 59): " + ys.join(","));
        t.near(a.card.w, 852, 0.5, "the card spans the box (at least 70% of the zone width)");
        const narrow = await render(t, { slide: slide(CHECK), box: { w: 600, h: 700 } }); t.ok(narrow, "a narrower box rebuilds"); t.near((await t.art.evaluate(probe, narrow.sel)).card.w, 600, 0.5);
      }
    },
    {
      name: "S-11 mirror: RTL puts chip, words, value and mark in logical order from the right; LTR (en) is the exact mirror",
      async run(t) {
        await roleCss(t);
        const items = LEDGER.slice(0, 3).map((x, i) => ({ ...x, mark: i === 1 ? "tick" : undefined }));
        for (const rtl of [true, false]) {
          const r = await render(t, { rtl, slide: slide(items, "checklist"), box: { w: 852, h: 700 } }), p = await t.art.evaluate(probe, r.sel);
          for (const row of p.rows) {
            t.eq(row.kids.length, 4, "chip, words, value, mark");
            const cx = row.kids.map((k) => k.x + k.w / 2);
            t.ok(rtl ? cx[0] > cx[1] && cx[1] > cx[2] && cx[2] > cx[3] : cx[0] < cx[1] && cx[1] < cx[2] && cx[2] < cx[3], (rtl ? "rtl" : "ltr") + " logical order: " + cx.map(Math.round).join(" "));
          }
          t.near(rtl ? p.rows[0].kids[0].r : p.rows[0].kids[0].x, rtl ? 852 - 4 - 32 : 4 + 32, 1, "the chip sits 32 px inside the start edge of the 4 px card border");
          const own = r.boxes.filter((b) => b.ownerOf === "c");
          const chips = own.filter((b) => b.kind === "ink" && b.w > 70).map((b) => b.x), marks = own.filter((b) => b.kind === "ink" && b.w === 56).map((b) => b.x);
          t.ok(rtl ? Math.min(...chips) > Math.max(...marks) : Math.max(...chips) < Math.min(...marks), "the predicted boxes follow the same side: " + chips[0] + " / " + marks[0]);
        }
      }
    },
    {
      name: "ledger look: a value column behind a 3 px rule (equal width on every plain row), numbers in one LTR run, the hi row a full band in the accent with on-accent words at 4.5:1",
      async run(t) {
        await roleCss(t);
        for (const preset of ["poster", "creator", "swiss"]) {
          const r = await render(t, { preset, slide: slide(LEDGER, "item") }), p = await t.art.evaluate(probe, r.sel);
          const plain = p.rows.slice(0, 3).map((row) => row.kids[2]);
          t.ok(plain.every((c) => Math.abs(c.x - plain[0].x) < 0.5 && Math.abs(c.w - plain[0].w) < 0.5), preset + ": the rule is one vertical line through the plain rows: " + plain.map((c) => c.x + "/" + c.w).join(","));
          const q = await t.art.evaluate(([sel]) => {
            const rows = [...document.querySelectorAll(sel + " [data-owner] > div")], v = rows[0].children[1], hi = rows[3], l = [...hi.querySelectorAll("[data-slot=art]")], bg = getComputedStyle(hi).backgroundColor;
            return { rule: getComputedStyle(v).borderInlineStartWidth, ruleStyle: getComputedStyle(v).borderInlineStartStyle, bg, ink: l.map((x) => getComputedStyle(x).color), radius: getComputedStyle(hi).borderBottomLeftRadius, bdi: [...rows[0].querySelectorAll("[data-index='1'] bdi")].map((b) => b.textContent + "|" + b.getAttribute("dir")) };
          }, [r.sel]);
          t.eq(q.rule, "3px"); t.eq(q.ruleStyle, "solid"); t.eq(q.bdi, ["8,000|ltr"], "the comma-grouped number is one LTR run");
          const accent = await t.art.evaluate(([p]) => { const k = CS.art.kit, tk = k.palette(__art.ctx({ preset: p }).tokens), C = CS.core.color; return { accent: C.toHex(C.parse(tk.accent)), on: k.on(tk.accent, tk), cr: C.contrast(k.on(tk.accent, tk), tk.accent) }; }, [preset]);
          const rgb = (s) => "#" + (s.match(/\d+/g).slice(0, 3).map((n) => (+n).toString(16).padStart(2, "0")).join("")).toUpperCase();
          t.eq(rgb(q.bg), accent.accent.toUpperCase(), preset + ": the hi row is a band in the accent");
          t.ok(q.ink.every((c) => rgb(c) === accent.on.toUpperCase()), preset + ": its words are the on-accent colour " + accent.on);
          t.gte(accent.cr, 4.5, preset + ": on-accent over accent");
        }
        const last = await render(t, { preset: "creator", slide: slide(LEDGER, "item") });
        const rr = await t.art.evaluate(([sel]) => { const hi = [...document.querySelectorAll(sel + " [data-owner] > div")][3]; return [getComputedStyle(hi).borderBottomLeftRadius, getComputedStyle(hi).borderBottomRightRadius]; }, [last.sel]);
        t.eq(rr, ["32px", "32px"], "a band in a rounded card follows its corner (radius minus border), nothing overflows the card (A15)");
      }
    },
    {
      name: "first-line alignment (3.1): the chip's centre is the centre of the first line of its words plus art.chipOffset (positive moves the chip down), on one-line and on wrapped Arabic titles; the chip stays in its row and boxes[] put a one-line row's chip where the DOM does",
      async run(t) {
        await roleCss(t);
        const TITLES = ["مراجعة العقد بنداً بنداً قبل أي توقيع", "اتفق على عدد التعديلات والمواعيد كتابةً قبل البدء", "قصير"];
        const items = TITLES.map((title, i) => ({ title, icon: ["target", "pencil", "clock"][i] }));
        for (const k of [0, 10, -10, 24, -24]) {
          const { r, p } = await withOffset(t, "creator", k, async () => { const r = await render(t, { slide: slide(items, "summary"), box: { w: 852, h: 800 } }); return { r, p: await t.art.evaluate(probe, r.sel) }; });
          t.ok(p.rows[0].labels[0].h > 1.8 * p.rows[0].labels[0].lh && p.rows[1].labels[0].h > 1.8 * p.rows[1].labels[0].lh, "the two long titles wrap to two lines or more: " + p.rows.map((x) => Math.round(x.labels[0].h)));
          p.rows.forEach((row, i) => {
            const chip = row.kids[0];
            t.near(chip.y + chip.h / 2 - row.labels[0].lc, k, 1.5, "offset " + k + ", row " + i + ": chip centre minus the first line's centre (line box 57.2 px; the builder's estimate is 59)");
            t.ok(chip.y >= row.r.y - 0.5 && chip.y + chip.h <= row.r.y + row.r.h + 0.5, "offset " + k + ", row " + i + ": the chip stays inside its row");
          });
          const last = p.rows[2].kids[0], pred = r.boxes.filter((b) => b.kind === "ink")[2];
          t.near(pred.y + pred.h / 2, last.y + last.h / 2, 2, "offset " + k + ": the one-line row's predicted chip centre");
          t.near(pred.x + pred.w / 2, last.x + last.w / 2, 2, "offset " + k + ": and its x");
        }
        const a = await withOffset(t, "creator", 0, () => render(t, { slide: slide(items, "summary"), box: { w: 852, h: 800 } })), b = await withOffset(t, "creator", 20, () => render(t, { slide: slide(items, "summary"), box: { w: 852, h: 800 } }));
        t.near((b.boxes[2].y - b.boxes[1].y) - (a.boxes[2].y - a.boxes[1].y), -20, 0.5, "the offset moves the predicted words 20 px up against the chip (the markup and the boxes read one token)");
        const big = await withOffset(t, "creator", 24, () => render(t, { slide: slide(HOOKS.concat([{ title: "خامسة", icon: "heart" }]), "summary"), box: { w: 852, h: 620 } }));
        t.ok(big && big.boxes.filter((x) => x.kind === "ink").every((x) => x.h > 0), "a large offset still builds (the size choice counts the offset)");
      }
    },
    {
      name: "value column: a value is mounted whoever carries it (plain rows, the highlighted row alone, one row of several, 12 characters); every label the builder returns is attached to the markup, and the cell is wide enough for title-size digits",
      async run(t) {
        await roleCss(t);
        const T = ["الإيجار", "الكهرباء", "الإجمالي"], ic = ["clock", "check", "coins"];
        const mk = (vals, hi) => T.map((title, i) => ({ title, icon: ic[i], ...(vals[i] ? { value: vals[i] } : {}), ...(hi === i ? { hi: true } : {}) }));
        const cases = [
          ["highlighted row alone", mk([0, 0, "250"], 2)], ["plain rows", mk(["8,000", 0, "12,000"], -1)], ["plain and highlighted", mk(["8,000", "12,000", "250 جنيه"], 2)],
          ["highlighted without a value", mk(["8,000", "12,000", 0], 2)], ["one plain row of three", mk([0, "80", 0], -1)], ["12 characters, plain", mk(["12,345,678.9", "98,765,432.1", "11,111,111.1"], -1)],
          ["no icons, highlighted alone", [{ title: "A" }, { title: "B" }, { title: "Total", hi: true, value: "250" }]]
        ];
        for (const preset of ["creator", "poster", "swiss"]) for (const rtl of [true, false]) {
          const rep = await t.art.evaluate(([cases, preset, rtl]) => cases.map(([name, items]) => {
            const b = CS.art.build({ kind: "rows" }, __art.ctx({ preset, rtl, slide: { id: "s11", type: "item", items }, box: { w: 852, h: 700 } }));
            return [name, b && b.labels.map((l) => [l.text, l.role, b.el.contains(l.el)])];
          }), [cases, preset, rtl]);
          for (const [name, labels] of rep) {
            t.ok(labels, preset + (rtl ? "" : "/ltr") + " " + name + ": builds at 852 px");
            t.eq(labels.filter((l) => !l[2]).map((l) => l[0]), [], preset + (rtl ? "" : "/ltr") + " " + name + ": every returned label is attached");
          }
          t.ok(rep[0][1].some((l) => l[0] === "250" && l[1] === "title"), "the highlighted value is a title-role label that is returned and attached");
        }
        const r = await render(t, { slide: slide(cases[0][1], "item") }), p = await t.art.evaluate(probe, r.sel);
        t.eq(p.rows.map((x) => x.kids.length), [2, 2, 3], "only the row that has a value gets a value cell (the highlighted one)");
        const cell = await t.art.evaluate(([sel]) => { const row = [...document.querySelectorAll(sel + " [data-owner] > div")][2], c = row.children[1], l = c.querySelector("[data-role=title]"), a = c.getBoundingClientRect(), b = l.getBoundingClientRect(); return { cell: a.width, label: b.width, inside: b.left >= a.left - 0.5 && b.right <= a.right + 0.5, text: l.textContent }; }, [r.sel]);
        t.ok(cell.inside && cell.text === "250", "the title-size digits sit inside their cell: " + JSON.stringify(cell));
        const v = r.boxes.filter((b) => b.kind === "text")[3];
        t.ok(v && v.w >= cell.label + 27 - 1 && Math.abs(v.w - cell.cell) <= 2, "the predicted cell (" + (v && v.w) + ") is at least rule + padding + digits and matches the markup (" + cell.cell + ")");
        t.eq(await render(t, { slide: slide(mk(["12,345,678.9", "98,765,432.1", "11,111,111.1"], 2), "item") }), null, "a 12-character highlighted value (64 px digits, about 490 px) next to a chip leaves the words under 200 px: nothing is built");
        const mixed = await render(t, { slide: slide(cases[2][1], "item") }), mp = await t.art.evaluate(probe, mixed.sel);
        t.eq(mp.rows.map((x) => x.kids.length), [3, 3, 3], "a value on any plain row gives every row its cell (the rule runs through the card)");
        t.ok(mp.rows[2].kids[2].w > mp.rows[0].kids[2].w, "the highlighted cell is wider for its larger digits while the plain cells stay equal: " + mp.rows.map((x) => Math.round(x.kids[2].w)));
      }
    },
    {
      name: "bounds: every content box has a positive size and sits inside the owner card; the words keep at least 200 px; a box too narrow for the chip, the value column and the mark builds nothing (3 icon rows, a 12-character value, 600 x 700) - across 6 presets, both directions, widths 560-852 and value lengths 0-12",
      async run(t) {
        await roleCss(t);
        const rep = await t.art.evaluate(([PRESETS]) => {
          const out = [], V = "12,345,678.9";
          for (const preset of PRESETS) for (const rtl of [true, false]) for (const w of [560, 600, 700, 852]) for (const len of [0, 5, 12]) for (const hi of [false, true]) for (const type of ["item", "checklist"]) {
            const items = ["الإيجار", "الكهرباء", "الإجمالي"].map((title, i) => ({ title, icon: ["clock", "check", "coins"][i], ...(len ? { value: V.slice(0, len) } : {}), ...(hi && i === 2 ? { hi: true } : {}) }));
            const b = CS.art.build({ kind: "rows" }, __art.ctx({ preset, rtl, slide: { id: "s11", type, items }, box: { w, h: 700, x: 20, y: 30 } })), key = [preset, rtl ? "rtl" : "ltr", w, len, hi, type].join("/");
            if (!b) { out.push([key, null]); continue; }
            const o = b.boxes[0], rest = b.boxes.slice(1), per = rest.length / 3, bad = [];
            rest.forEach((x, i) => {
              if (!(x.w > 0 && x.h > 0)) bad.push("size " + i);
              if (x.x < o.x - 0.5 || x.x + x.w > o.x + o.w + 0.5 || x.y < o.y - 0.5 || x.y + x.h > o.y + o.h + 0.5) bad.push("outside " + i);
              if (x.ownerOf !== "c") bad.push("owner " + i);
              if (i % per === 1 && x.w < 200) bad.push("words " + Math.round(x.w));
            });
            out.push([key, bad, b.labels.every((l) => b.el.contains(l.el))]);
          }
          return out;
        }, [PRESETS]);
        t.ok(rep.length === 6 * 2 * 4 * 3 * 2 * 2, "cases: " + rep.length);
        t.eq(rep.filter((x) => x[1] && (x[1].length || !x[2])).map((x) => x[0] + ":" + x[1].join("|") + (x[2] ? "" : " detached")), [], "built cards are valid and attached");
        t.eq(rep.filter((x) => x[0].split("/")[2] === "852" && x[1] === null && !x[0].split("/")[3].startsWith("12")).map((x) => x[0]), [], "at the full width everything with values up to 5 characters builds");
        t.eq(rep.filter((x) => x[0].split("/")[2] === "852" && x[1] === null && x[0].includes("/12/false/item")).map((x) => x[0]), [], "and so do 12-character plain values without a mark column");
        t.eq(rep.filter((x) => x[0].split("/").slice(2, 4).join("/") === "600/12" && x[0].endsWith("checklist") && x[1] !== null).map((x) => x[0]), [], "3 icon rows with a 12-character value, a mark column and 600 px build nothing (the words would be crushed)");
        t.ok(rep.filter((x) => x[1] === null).length > 0 && rep.filter((x) => x[1] !== null).length > 100, "both outcomes occur: " + rep.filter((x) => x[1] === null).length + " null, " + rep.filter((x) => x[1] !== null).length + " built");
        const mid = await render(t, { slide: slide([{ title: "الإيجار", icon: "clock", value: "12,345,678.9" }, { title: "الكهرباء", icon: "check", value: "12,345,678.9" }, { title: "الإجمالي", icon: "coins", value: "12,345,678.9" }], "item"), box: { w: 852, h: 700 } }), mp = await t.art.evaluate(probe, mid.sel);
        t.gte(Math.min(...mp.rows.map((x) => x.kids[1].w)), 200, "at the full width the words keep their room beside the widest value");
        t.ok(mp.rows.every((x) => x.kids[1].h < 2 * x.labels[0].lh + 1), "and do not wrap beyond two lines");
      }
    },
    {
      name: "tick and cross (S-17): a checklist keeps an empty box on every row; tick and cross are drawn with the second support hue and the accent, never one hue, on all 6 presets x 3 tones; empty boxes stay empty",
      async run(t) {
        await roleCss(t);
        const r = await render(t, { slide: slide(CHECK) });
        const m = await t.art.evaluate(([sel]) => [...document.querySelectorAll(sel + " [data-owner] > div")].map((row) => { const s = [...row.children].pop(); return { w: s.getAttribute("width"), paths: [...s.querySelectorAll("path")].map((p) => [p.getAttribute("stroke"), p.getAttribute("stroke-width")]) }; }), [r.sel]);
        t.eq(m.map((x) => x.paths.length), [1, 3, 3, 1], "an empty box is one path (nothing pre-ticked); tick and cross add an ink outline stroke and a colour stroke");
        t.eq(m.map((x) => x.w), ["56", "56", "56", "56"]);
        const col = await t.art.evaluate(() => { const tk = CS.art.kit.palette(__art.ctx({ preset: "creator" }).tokens); return { tick: tk.support[1], cross: tk.accent, ink: tk.ink }; });
        t.eq([m[1].paths[1][0], m[1].paths[2][0]], [col.ink, col.tick], "tick: ink outline under the second support hue");
        t.eq([m[2].paths[1][0], m[2].paths[2][0]], [col.ink, col.cross], "cross: ink outline under the accent");
        const rows = await t.art.evaluate(([PRESETS]) => {
          const hue = (h) => { const n = parseInt(h.slice(1), 16), r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; if (d < 0.08) return null; const x = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return (x * 60 + 360) % 360; };
          const out = [];
          for (const p of PRESETS) for (const tone of ["base", "invert", "field"]) { const tk = CS.art.kit.palette(__art.ctx({ preset: p, tone }).tokens), a = hue(tk.support[1]), b = hue(tk.accent), dd = a == null || b == null ? 180 : Math.min(Math.abs(a - b), 360 - Math.abs(a - b)); out.push([p + "/" + tone, tk.support[1], tk.accent, Math.round(dd)]); }
          return out;
        }, [PRESETS]);
        const bad = rows.filter((x) => x[3] < 25);
        t.eq(bad, [], "tick and cross hues are at least 25 degrees apart, or one is neutral: " + JSON.stringify(bad));
        const none = await render(t, { slide: slide(HOOKS, "summary") }), np = await t.art.evaluate(([sel]) => document.querySelectorAll(sel + " [data-owner] svg:not(.cs-icon)").length, [none.sel]);
        t.eq(np, 0, "a summary has no box column");
        const circle = await render(t, { slide: slide(CHECK.map((x, i) => ({ ...x, mark: i ? "circle" : "redact" }))) });
        t.eq(await t.art.evaluate(([sel]) => [...document.querySelectorAll(sel + " [data-owner] > div")].map((row) => [...row.children].pop().querySelectorAll("path").length), [circle.sel]), [1, 1, 1, 1], "circle and redact are not row shapes: an empty box, never a tick");
      }
    },
    {
      name: "chip fills read at 4.5:1 with their glyph on every preset x tone and never put a glyph on a low-contrast support hue (S-8); the hi row's chip sits on the surface",
      async run(t) {
        await roleCss(t);
        const rep = await t.art.evaluate(async ([PRESETS, items]) => {
          const C = CS.core.color, out = [];
          for (const p of PRESETS) for (const tone of ["base", "invert", "field"]) {
            const ctx = __art.ctx({ preset: p, tone, slide: { id: "s11", type: "checklist", items } }); ctx.box = { w: 852, h: 700 };
            const b = CS.art.build({ kind: "rows" }, ctx); if (!b) { out.push([p + "/" + tone, "null"]); continue; }
            const tk = CS.art.kit.palette(ctx.tokens), chips = [...b.el.querySelectorAll("svg.cs-icon")];
            for (const s of chips) { const ps = [...s.querySelectorAll(":scope > path")], fill = ps.map((x) => x.getAttribute("fill")).find((f) => f && f !== "none"), glyph = s.querySelector("g path"); const gl = glyph && glyph.getAttribute("stroke"); if (fill && gl) out.push([p + "/" + tone, fill, gl, +C.contrast(fill, gl).toFixed(2), tk.support[0] === fill]); }
          }
          return out;
        }, [PRESETS, HOOKS]);
        t.ok(rep.length > 50, "chips inspected: " + rep.length);
        t.eq(rep.filter((x) => x[1] === "null"), [], "every preset x tone builds");
        t.eq(rep.filter((x) => x[3] < 4.5).map((x) => x.slice(0, 4)), [], "fill and glyph pairs under 4.5:1");
        t.eq(rep.filter((x) => x[0].startsWith("poster/base") && x[4]).length, 0, "poster: the ochre support hue (S-8) carries no glyph");
      }
    },
    {
      name: "boxes[] agree with the DOM: the owner card and every chip, words column, value cell and mark sit inside the predicted box (2 px), in the zone coordinates of ctx.box (including its origin); the owner carries fill and border so the gate can see it",
      async run(t) {
        await roleCss(t);
        for (const [items, type, box, rtl] of [[CHECK, "checklist", { w: 852, h: 700, x: 0, y: 24 }, true], [LEDGER, "item", { w: 852, h: 640, x: 0, y: 0 }, true], [HOOKS, "summary", { w: 700, h: 760, x: 76, y: 10 }, false]]) {
          const r = await render(t, { slide: slide(items, type), box, rtl }), p = await t.art.evaluate(probe, r.sel);
          const o = r.boxes[0];
          t.eq([o.kind, o.id, o.fill, o.border >= 3], ["owner", "c", 1, true], "owner with fill and border");
          const root = await t.art.evaluate(([sel]) => { const z = document.querySelector(sel + " .cs-zone").getBoundingClientRect(), c = document.querySelector(sel + " [data-owner]").getBoundingClientRect(); return { x: c.left - z.left, y: c.top - z.top, w: c.width, h: c.height }; }, [r.sel]);
          t.near(root.x, o.x, 2, "owner x"); t.near(root.y, o.y, 2, "owner y"); t.near(root.w, o.w, 2, "owner w"); t.near(root.h, o.h, 2, "owner h");
          const kids = r.boxes.slice(1);
          t.ok(kids.length >= items.length * 2 && kids.every((b) => b.ownerOf === "c"), "every content box names its owner");
          const per = kids.length / items.length;
          p.rows.forEach((row, i) => {
            kids.slice(i * per, (i + 1) * per).forEach((b, k) => {
              const d = row.kids[k];
              if (items[i].hi && b.kind !== "ink") return;   // the hi row's value takes the room of its title-size digits: its words column is an estimate
              if (b.kind === "ink") { t.near(d.x + d.w / 2, b.x + b.w / 2, 2, "row " + i + " ink " + k + " centre x"); t.near(d.y + d.h / 2, b.y + b.h / 2, 3, "row " + i + " ink " + k + " centre y"); }
              else { t.near(d.x, b.x, 2, "row " + i + " column " + k + " x"); t.near(d.w, b.w, 2, "row " + i + " column " + k + " w"); if (k === 1) { t.near(d.y, b.y, 3, "row " + i + " words y"); t.near(d.h, b.h, 5, "row " + i + " words h"); } }
            });
          });
        }
      }
    },
    {
      name: "dead space: the card is an owner that holds its rows (CS.visual.deadSpace on the predicted boxes: owner ok, rect under the 20% FIX limit), and the empty-card cheat built from the same box is not",
      async run(t) {
        await roleCss(t);
        const r = await render(t, { slide: slide(CHECK) });
        const m = await t.art.evaluate(([boxes]) => CS.visual.deadSpace(boxes, { w: 852, h: 700 }), [r.boxes]);
        t.ok(m.owners.length === 1 && m.owners[0].ok, "the rows card owns its interior: " + JSON.stringify(m.owners));
        t.lte(m.rect, 15, "largest empty rectangle " + m.rect + "% of the anchor box (NOTE limit 15)");
        const empty = await t.art.evaluate(([b]) => CS.visual.deadSpace([b], { w: 852, h: 700 }), [r.boxes[0]]);
        t.ok(!empty.owners[0].ok, "the same card with no content is not an owner");
      }
    },
    {
      name: "painter-safe (A1-A17) on 6 presets x 3 tones x LTR and RTL, deterministic (same input, same bytes), the card paints alike in both painters (SSIM >= 0.98 on the slide and the card region)",
      async run(t) {
        await roleCss(t);
        for (const rtl of [true, false]) for (const preset of PRESETS) for (const tone of ["base", "invert", "field"]) {
          const o = { preset, tone, rtl, slide: slide(preset === "poster" ? LEDGER : CHECK, preset === "poster" ? "item" : "checklist") };
          const a = await render(t, o), b = await render(t, o);
          t.ok(a && a.html === b.html && JSON.stringify(a.boxes) === JSON.stringify(b.boxes), preset + "/" + tone + ": two builds are byte-identical");
          const s = await t.art.safe(b); t.eq(s.violations, [], preset + "/" + tone + (rtl ? "" : "/ltr") + ": " + JSON.stringify(s.violations.slice(0, 3)));
        }
        const full = await t.art.safe(await render(t, { slide: slide(CHECK) }), { content: true }); t.eq(full.violations, [], "the card stays inside the content box (A12)");
        for (const [preset, items, type] of [["creator", CHECK, "checklist"], ["poster", LEDGER, "item"], ["swiss", HOOKS, "summary"]]) {
          const r = await render(t, { preset, slide: slide(items, type), png: false }), p = await t.art.paintBoth(r);
          t.gte(p.ssim, 0.98, preset + ": svg and replay painters agree on the slide (" + p.ssim.toFixed(4) + ")");
          const at = await t.art.evaluate(([sel]) => { const s = document.querySelector(sel).getBoundingClientRect(), R = (e) => { const b = e.getBoundingClientRect(); return [Math.round(b.left - s.left), Math.round(b.top - s.top), Math.round(b.width), Math.round(b.height)]; }, card = document.querySelector(sel + " [data-owner]"); return { card: R(card), words: R(card.children[0].children[0].children[1]) }; }, [r.sel]);
          const a = decodePng(p.svgPng), b = decodePng(p.replayPng), crop = (im, [x, y, w, h]) => { const d = new Uint8ClampedArray(w * h * 4); for (let j = 0; j < h; j++) d.set(im.data.subarray(((y + j) * im.width + x) * 4, ((y + j) * im.width + x + w) * 4), j * w * 4); return { width: w, height: h, data: d }; };
          for (const k of ["card", "words"]) t.gte(ssim(crop(a, at[k]), crop(b, at[k])), 0.98, preset + ": the " + k + " region of the slide paints alike (" + ssim(crop(a, at[k]), crop(b, at[k])).toFixed(4) + ")");
        }
      }
    },
    {
      name: "hard rules and budget: no clock, random, network, letter-spacing, italic, justify or opacity in the source; no document at load; rows.js stays within its 4 KiB allocation",
      async run(t) {
        const src = fs.readFileSync(SRC, "utf8");
        for (const bad of [/Math\.random/, /\bDate\b/, /performance\./, /fetch\(/, /XMLHttpRequest/, /analytics/, /letter-spacing|letterSpacing/, /italic|oblique/, /text-?justify|["']justify["']/i, /opacity/i, /\bdocument\b/, /\bwindow\b/, /Math\.random/i]) t.ok(!bad.test(src), "forbidden: " + bad);
        t.lte(Buffer.byteLength(src, "utf8"), 4096, "rows.js is " + Buffer.byteLength(src, "utf8") + " B; allocation 4,096");
        t.ok(src.startsWith("/* src/art/rows.js - A8a."), "names its owner");
      }
    },
    {
      name: "contact sheet (the package acceptance): rows on creator, poster, swiss and notebook, a checklist, a ledger, a summary, RTL and LTR, at 1x and at the 130 px profile size",
      real: true,
      async run(t) {
        await roleCss(t);
        const cell = (preset, items, type, extra = {}) => ({ kind: "anchor", anchor: { kind: "rows" }, preset, tone: extra.tone || "base", rtl: extra.rtl !== false, slide: slide(items, type), box: { w: 852, h: extra.h || 700 }, label: preset + " " + type + (extra.rtl === false ? " ltr" : "") });
        const LTR = [{ title: "Hook in the first line", icon: "megaphone" }, { title: "One idea only", icon: "lightbulb" }, { title: "A clear save ask", icon: "bookmark" }];
        const items = [cell("creator", CHECK, "checklist"), cell("poster", LEDGER, "item"), cell("swiss", HOOKS, "summary"), cell("notebook", CHECK, "checklist"), cell("interface", HOOKS, "summary", { tone: "invert" }), cell("creator", LTR, "summary", { rtl: false, h: 560 })];
        const sh = await t.art.sheet({ cols: 2, cw: 900, ch: 760, items });
        t.eq((await t.art.safe(sh)).violations, [], "sheet is painter-safe");
        const missing = await t.art.evaluate((sel) => document.querySelectorAll(sel + " [data-sheet]:not(.cap):not(.row-title)").length, sh.sel);
        t.eq(missing, 0, "no cell is missing");
        const png = await t.art.shot(sh, "art/rows.png"); t.art.save("art/rows-130.png", await t.art.small(png, Math.round(sh.w * 130 / 1080)));
      }
    }
  ]
};
