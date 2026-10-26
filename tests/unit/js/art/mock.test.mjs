// tests/unit/js/art/mock.test.mjs · CS.art mock anchors chat and notes (package A4a; spec 3.4 M1-M6, r2 S-9 and S-11): registration, words only as exact copies of demo / quote / sides / items /
// bullets (partial-word matches refused), the 12-word bubble and 24-word mock budgets (chip digits and caption count), the end and start sides (RTL and LTR) with tails and chips, numbered runs,
// the typing bubble, M6 rows-and-columns ownership through CS.visual.deadSpace, the notes row highlight, label roles / floors / order, predicted boxes against the real DOM, fit and
// containment in tight boxes, painter safety, 4.5:1 text on every fill, both painters on the slide and on its text-bearing regions, determinism, the source budget and the contact sheets
// (node tests/unit/js/art/run.mjs --only mock [--out DIR]).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PRESETS } from "./support/dna.mjs";
import { decodePng, ssim } from "../../../parity/lib/ssim.mjs";

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../src/art/mock.js");
const ME = "اكتبلي 5 هوكات عن توفير الوقت", T1 = "بدل ساعة، اكتبه في 5 دقايق.", T2 = "وقتك أغلى من كابشن بيتعدّي.", CAP = "وغيّر الموضوع بتاعك", BODY = "جملة من نص الشريحة لا يجوز أن تظهر داخل المحاكاة";
const SLIDE = { id: "s05", type: "step", title: "ابدأ بالهوك", body: BODY, demo: { lines: [{ who: "me", text: ME }, { who: "them", text: T1 }, { who: "them", text: T2 }], caption: CAP }, bullets: ["ليه الكابشن بياخد ساعة؟", "كابشنك بياخد ساعة؟ اكتبه في 5 دقايق", "احفظ البوست ده"] };
const chat = (m) => ({ kind: "mock", mock: Object.assign({ kind: "chat" }, m) }), notes = (m) => ({ kind: "mock", mock: Object.assign({ kind: "notes" }, m) });
const BOX = { w: 852, h: 700 };
const texts = (r) => r.labels.map((l) => l.text), roles = (r) => r.labels.map((l) => l.role);
const draw = (t, anchor, o) => t.art.render(anchor, Object.assign({ preset: "creator", tone: "base", box: BOX, slide: SLIDE, png: false }, o));
const lines = (...a) => ({ id: "s05", demo: { lines: a } });
// words of a given count: a tag word then k-1 more Arabic words, so every line is distinct and countable
const WD = ["شرح", "سعر", "وقت", "بيع", "حجز", "طلب", "خطة", "عرض", "ملف", "فكرة", "نتيجة", "خبرة", "رحلة"];
const L = (k, tag) => [tag].concat(WD.slice(0, k - 1)).join(" ");
const wc = (r) => r.labels.reduce((s, l) => s + l.text.split(/\s+/).filter(Boolean).length, 0);   // every label word, chip digits included

// in-page helpers: geometry of the mounted slide, relative to the zone origin
const GEO = (sel) => {
  const root = document.querySelector(sel), R = root.getBoundingClientRect(), z = { x: 114, y: 261 };
  const rc = (e) => { const b = e.getBoundingClientRect(); return { x: b.left - R.left - z.x, y: b.top - R.top - z.y, w: b.width, h: b.height }; };
  const art = root.querySelector(".cs-art"), win = art.querySelector(".cs-art-panel");
  return { art: rc(art), win: Object.assign(rc(win), { oh: win.offsetHeight }), rows: [...art.querySelectorAll("[data-part=row]")].map((e) => Object.assign(rc(e), { who: e.getAttribute("data-who"), owner: e.hasAttribute("data-owner"), bg: getComputedStyle(e).backgroundColor })),
    bubbles: [...art.querySelectorAll("[data-part=bubble],[data-part=typing]")].map((e) => Object.assign(rc(e), { part: e.getAttribute("data-part"), fill: getComputedStyle(e).backgroundColor, radii: [e.style.borderTopLeftRadius, e.style.borderTopRightRadius, e.style.borderBottomRightRadius, e.style.borderBottomLeftRadius] })),
    labels: [...art.querySelectorAll("[data-slot=art]")].map((e) => Object.assign(rc(e), { role: e.getAttribute("data-role"), floor: +e.getAttribute("data-floor"), index: +e.getAttribute("data-index"), text: e.textContent })) };
};
// in-page: how far anything inside the mount reaches, relative to the mount's own top-left (the mount is the anchor box)
const REACH = (sel) => {
  const art = document.querySelector(sel + " .cs-art"), A = art.getBoundingClientRect(), o = { artH: A.height, maxB: 0, maxR: 0, minX: 0, minY: 0 };
  for (const e of art.querySelectorAll("*")) { const b = e.getBoundingClientRect(); o.maxB = Math.max(o.maxB, b.bottom - A.top); o.maxR = Math.max(o.maxR, b.right - A.left); o.minX = Math.min(o.minX, b.left - A.left); o.minY = Math.min(o.minY, b.top - A.top); }
  return o;
};
const contained = async (t, r, W, H, id) => { const g = await t.art.evaluate(REACH, r.sel); t.ok(g.artH <= H + 0.5 && g.maxB <= H + 0.5 && g.maxR <= W + 0.5 && g.minX >= -0.5 && g.minY >= -0.5, id + ": everything lies inside the " + W + " x " + H + " box " + JSON.stringify(g)); };
const owners = (t, boxes, zone) => t.art.evaluate(([b, z]) => CS.visual.deadSpace(b, z).owners, [boxes, zone]);

export default {
  module: "mock",
  tests: [
    {
      name: "FIX-A: labelsOnly is independent of geometry and slice demos keep all words and captions, twice",
      async run(t) {
        const slice = { id: "s08", type: "testimonial", demo: { lines: [{ who: "them", text: "الحفظ زاد من 40 إلى 120 في بوست واحد" }, { who: "me", text: "إنتي عملتي إيه؟" }, { who: "them", text: "غيّرت أول سطر بس", hi: true }], caption: "رسالة بعد أول أسبوع" } };
        const results = [];
        for (let i = 0; i < 2; i++) {
          const full = await draw(t, chat({}), { slide: slice, box: { w: 852, h: 750 } });
          t.ok(full);
          const only = await t.art.evaluate((slide) => CS.art.build({ kind: "mock", mock: { kind: "chat" } }, __art.ctx({ slide, labelsOnly: true, box: { w: 1, h: 1 } })).labels.map((l) => [l.text, l.index]), slice);
          t.eq(only, full.labels.map((l) => [l.text, l.index]), "text lookup matches rendering even in a 1px box");
          for (const line of slice.demo.lines) t.ok(full.labels.some((l) => l.text.replace(/\u00a0/g, " ") === line.text));
          t.eq(full.labels.at(-1).text, slice.demo.caption);
          results.push({ html: full.html, boxes: full.boxes, only });
        }
        t.eq(results[0], results[1]);
      }
    },
    {
      name: "registers mock with exactly chat and notes (strict, atomic); other mock kinds build null; a second owner of a pair throws E_ART_DUPLICATE",
      async run(t) {
        const r = await t.art.evaluate(() => {
          const out = { caps: CS.art.caps().art.mock, has: [CS.art.has("mock", "chat"), CS.art.has("mock", "notes"), CS.art.has("mock", "browser"), CS.art.has("mock", "poll"), CS.art.has("mock")], sub: [CS.art._.sub({ kind: "mock", mock: { kind: "chat" } }), CS.art._.sub({ kind: "mock", mock: { kind: "notes" } })] };
          for (const [k, s] of [["mock", ["chat"]], ["mock", ["notes", "x1"]]]) { try { CS.art.register(k, () => null, s); out.dup = (out.dup || []).concat("none"); } catch (e) { out.dup = (out.dup || []).concat(e.code); } }
          out.afterAtomic = CS.art.has("mock", "x1");
          out.browser = CS.art.build({ kind: "mock", mock: { kind: "browser", lines: [{ text: "x" }] } }, __art.ctx({ slide: { id: "s01", demo: { lines: [{ text: "x" }] } } }));
          out.words = typeof CS.art.mock.words;
          return out;
        });
        t.eq(r.caps, ["chat", "notes"], "caps"); t.eq(r.has, [true, true, false, false, true], "has"); t.eq(r.sub, ["chat", "notes"], "_.sub");
        t.eq(r.dup, ["E_ART_DUPLICATE", "E_ART_DUPLICATE"], "duplicates throw"); t.eq(r.afterAtomic, false, "a refused registration adds nothing"); t.eq(r.browser, null, "browser is not built here"); t.eq(r.words, "function");
      }
    },
    {
      name: "words come only from demo.lines, quote, sides, items and bullets as exact copies: invented lines are dropped, none left builds null, slide body and title are never used, NBSP survives",
      async run(t) {
        const NB = "ساعة 5 دقايق";
        const only = await draw(t, chat({ lines: [{ who: "them", text: "سطر مخترع غير موجود" }, { who: "me", text: T1 }] }));
        t.eq(texts(only).filter((x) => x !== CAP), [T1], "only the real line is drawn: " + JSON.stringify(texts(only)));
        t.eq(await draw(t, chat({ lines: [{ text: "سطر مخترع" }, { text: "كلام آخر مخترع" }] }), { slide: { id: "s05", type: "step", body: BODY } }), null, "no allowed text -> null");
        t.eq(await draw(t, chat({}), { slide: { id: "s05", type: "item", title: "عنوان", body: BODY } }), null, "body and title are not a source (chat)");
        t.eq(await draw(t, notes({}), { slide: { id: "s05", type: "item", title: "عنوان", body: BODY } }), null, "body and title are not a source (notes)");
        t.eq(await draw(t, chat({ lines: [{ text: "x" }] }), { slide: { id: "s05" } }), null, "a slide with no fields offers no words");
        t.eq(texts(await draw(t, chat({}), { slide: { id: "s05", demo: { lines: [{ who: "me", text: ME }, { who: "them", text: T1 }] } } })), [ME, T1], "demo.lines when the anchor has no lines");
        const q = await draw(t, chat({}), { slide: { id: "s05", type: "quote", body: "البوست اللي بيتحفظ بيبدأ بسؤال" } });
        t.eq(texts(q), ["البوست اللي بيتحفظ بيبدأ بسؤال"], "quote slide: the quote is the bubble"); t.eq(await t.art.evaluate((s) => document.querySelectorAll(s + " [data-part=typing]").length, q.sel), 1, "and the typing bubble sits opposite");
        const q2 = await draw(t, chat({}), { slide: { id: "s05", type: "step", quote: { body: "اقتباس بصيغة كائن" } } });
        t.eq(texts(q2), ["اقتباس بصيغة كائن"], "slide.quote may be an object with body");
        t.eq(await draw(t, chat({}), { slide: { id: "s05", type: "step", quote: {} } }), null, "an empty quote object offers nothing");
        t.eq(texts(await draw(t, chat({}), { slide: { id: "s05", type: "step", quote: "اقتباس نصي مباشر" } })), ["اقتباس نصي مباشر"], "slide.quote may be a plain string");
        const s = await draw(t, chat({}), { slide: { id: "s05", type: "compare", sides: [{ label: "قبل", text: "ساعة كاملة للكابشن" }, { label: "بعد", text: "خمس دقايق بس" }] } });
        t.eq(texts(s), ["ساعة كاملة للكابشن", "خمس دقايق بس"], "compare sides: first = them, second = me");
        t.eq(await t.art.evaluate((sel) => [...document.querySelectorAll(sel + " [data-part=row]")].map((e) => e.getAttribute("data-who")), s.sel), ["them", "me"]);
        t.eq(texts(await draw(t, notes({}), { slide: { id: "s05", bullets: ["أولا", "ثانيا"] } })), ["أولا", "ثانيا"], "notes: bullets");
        t.eq(texts(await draw(t, notes({}), { slide: { id: "s05", items: [{ title: "بند واحد", text: "شرح" }, { title: "بند اتنين" }] } })), ["بند واحد", "بند اتنين"], "notes: item titles");
        t.eq(texts(await draw(t, notes({ items: ["عنصر من الموك", "نص غريب"] }), { slide: { id: "s05", bullets: ["عنصر من الموك"] } })), ["عنصر من الموك"], "notes: mock.items must also be copies");
        t.eq(texts(await draw(t, chat({ lines: [{ who: "me", text: NB }] }), { slide: { id: "s05", demo: { lines: [{ text: "ساعة 5 دقايق" }] } } })), [NB], "NBSP matches a plain space in the source and is kept in the label");
        t.eq(texts(await draw(t, chat({ lines: [{ who: "me", text: "ساعة   5  دقايق" }] }), { slide: { id: "s05", demo: { lines: [{ text: "ساعة 5 دقايق" }] } } })).length, 1, "runs of spaces fold: still a copy");
        t.eq(texts(await draw(t, chat({ caption: "تعليق مخترع" }))).includes("تعليق مخترع"), false, "an invented caption is dropped");
        t.eq(texts(await draw(t, chat({ caption: CAP }))).slice(-1), [CAP], "a caption copied from demo.caption is the last label");
        const many = { id: "s05", demo: { lines: Array.from({ length: 6 }, (_, i) => ({ text: "سطر رقم " + (i + 1) })) }, bullets: Array.from({ length: 8 }, (_, i) => "نقطة " + (i + 1)) };
        t.eq((await draw(t, chat({ lines: many.demo.lines }), { slide: many })).labels.filter((l) => l.role !== "chip").length, 4, "at most 4 bubbles");
        t.eq(await draw(t, notes({}), { slide: many, box: { w: 852, h: 1100 } }), null, "an oversized demo is rejected whole, never silently truncated");
      }
    },
    {
      name: "a word is not a copy of a longer word: partial-word, prefix and excerpt matches are refused for lines, items and captions (regressions of the substring check)",
      async run(t) {
        // the exact repro: "paid" is inside "unpaid" but the source never says "paid"
        const w = await t.art.evaluate(() => { const f = CS.art.mock.words; return [f({ mock: { lines: [{ text: "paid" }] } }, { slide: { bullets: ["unpaid"] } }, false).lines.length, f({ mock: { lines: [{ text: "paid" }] } }, { slide: { bullets: ["unpaid"] } }, true).lines.map((l) => l.text), f({ mock: { lines: [{ text: "unpaid" }] } }, { slide: { bullets: ["unpaid"] } }, false).lines.length]; });
        t.eq(w, [0, ["unpaid"], 1], "words(): 'paid' is refused, the real bullet is the only note, 'unpaid' is accepted");
        const S = { id: "s05", demo: { lines: [{ text: "ساعتين كاملتين للكابشن" }, { text: T1 }], caption: "وغيّر الموضوع بتاعك" } };
        const pool = (...bullets) => ({ id: "s05", bullets, items: bullets.map((title) => ({ title })) });   // the longer text sits in bullets and item titles: in the pool, never in demo.lines
        t.eq(await draw(t, chat({ lines: [{ who: "them", text: "ساعة" }] }), { slide: pool("ساعتين") }), null, "chat: a prefix of a word is not a copy (the pool says ساعتين, not ساعة)");
        t.eq(await draw(t, chat({ lines: [{ who: "them", text: "ساع" }] }), { slide: pool("ساعة") }), null, "chat: a middle part is not a copy");
        t.eq(texts(await draw(t, chat({ lines: [{ who: "them", text: "ساعة" }] }), { slide: Object.assign(pool("ساعتين"), lines({ text: "ساعتين" })) })), ["ساعتين"], "the partial line is dropped and the slide's own demo line takes over");
        t.eq(texts(await draw(t, chat({ lines: [{ who: "them", text: "ساعة" }, { who: "me", text: T1 }] }), { slide: S })).filter((x) => x !== CAP), [T1], "the partial line is dropped, the real one stays");
        t.eq(await draw(t, chat({ lines: [{ who: "them", text: "بدل ساعة" }] }), { slide: pool(T1) }), null, "a run of whole tokens cut out of a sentence is not a copy either");
        t.eq(await draw(t, chat({ lines: [{ who: "them", text: T1 + " وأكتر" }] }), { slide: pool(T1) }), null, "a line that extends a source sentence is not a copy");
        t.eq(texts(await draw(t, chat({ lines: [{ who: "them", text: T1 }] }), { slide: pool(T1) })), [T1], "the same sentence, whole, is accepted from the pool");
        t.eq(texts(await draw(t, chat({ lines: [{ who: "them", text: T1 }], caption: "الموضوع" }), { slide: S })).includes("الموضوع"), false, "a caption that is a word of the source caption is dropped");
        t.eq(texts(await draw(t, chat({ lines: [{ who: "them", text: T1 }], caption: "وغيّر الموضوع بتاعك" }), { slide: S })).slice(-1), ["وغيّر الموضوع بتاعك"], "the whole caption is accepted");
        t.eq(texts(await draw(t, notes({ items: ["دفع", "مدفوع"] }), { slide: { id: "s05", items: [{ title: "مدفوع" }, { title: "غير مدفوع" }] } })), ["مدفوع"], "notes: 'دفع' is not in the pool as a whole text; 'مدفوع' is");
      }
    },
    {
      name: "word budgets: complete demos fit 12 words per line and 24 including chips and caption, or are refused whole",
      async run(t) {
        for (let run = 0; run < 2; run++) {
          for (const kind of ["chat", "notes"]) {
            const a = { kind: "mock", mock: { kind } };
            for (const slide of [lines({ text: L(13, "long") }, { text: T1 }), lines(...[1, 2, 3].map((i) => ({ text: L(12, String(i)) }))), { id: "s05", demo: { lines: [{ who: "me", text: L(12, "a") }, { who: "them", text: L(12, "b") }], caption: "extra" } }]) {
              t.eq(await draw(t, a, { slide, box: { w: 852, h: 1100 } }), null, "no source line or caption is silently omitted");
            }
            const valid = { id: "s05", demo: { lines: [{ who: "me", text: L(10, "a") }, { who: "them", text: L(11, "b") }], caption: "three word caption" } };
            const r = await draw(t, a, { slide: valid, box: { w: 852, h: 1100 } });
            t.ok(r); t.eq(wc(r), 24); t.eq(texts(r).at(-1), valid.demo.caption);
          }
          const a = chat({}), valid = lines({ who: "me", text: L(10, "a") }, { who: "them", text: L(6, "b") }, { who: "them", text: L(6, "c") });
          const r = await draw(t, a, { slide: valid, box: { w: 852, h: 1100 } });
          t.ok(r); t.eq(wc(r), 24, "numbered chips also count");
        }
      }
    },

    {
      name: "S-11 mirror: me sits at the END side and them at the START side in RTL and LTR (rows, chips and tails), on all six presets",
      async run(t) {
        for (const rtl of [true, false]) for (const preset of PRESETS) {
          const r = await draw(t, chat({}), { preset, rtl, slide: Object.assign({}, SLIDE, { demo: { lines: [{ who: "them", text: T1 }, { who: "me", text: T2 }, { who: "them", text: ME }] } }), box: { w: 852, h: 800 } });
          const g = await t.art.evaluate(GEO, r.sel), mid = (b) => b.x + b.w / 2, W = g.win.w, id = preset + (rtl ? " rtl" : " ltr");
          const me = g.rows.filter((x) => x.who === "me"), them = g.rows.filter((x) => x.who === "them");
          const start = (b) => (rtl ? W - mid(b) : mid(b)), startEdge = (b) => (rtl ? g.win.x + W - (b.x + b.w) : b.x - g.win.x);
          const s0 = startEdge(them[0]);
          t.ok(them.every((b) => Math.abs(startEdge(b) - s0) < 1.5) && s0 < 50, id + ": them rows start at the start padding (" + them.map((b) => startEdge(b)).join(",") + ")");
          t.gte(Math.min(...me.map((b) => startEdge(b))), s0 + 60, id + ": the me row is pushed to the end side");
          t.ok(start(me[0]) > start(them[0]), id + ": me is nearer the end than them");
          // rows run in reading order, top to bottom
          t.eq(g.rows.map((x) => x.who), ["them", "me", "them"], id + " order"); t.ok(g.rows.every((b, i) => i === 0 || b.y > g.rows[i - 1].y), id + ": rows go down in order");
          // tails: the small corner is at the speaker's own side, below; every other corner is round
          const rad = (b) => b.radii.map(parseFloat);
          const tail = (b) => { const m = rad(b), i = m.indexOf(Math.min(...m)); return ["tl", "tr", "br", "bl"][i]; };
          const bs = g.bubbles, themTail = rtl ? "br" : "bl", meTail = rtl ? "bl" : "br";
          t.eq([tail(bs[0]), tail(bs[1]), tail(bs[2])], [themTail, meTail, themTail], id + ": tails follow the logical sides");
          t.ok(bs.every((b) => rad(b).filter((v) => v === 4).length === 1), id + ": exactly one small corner");
          // the chip of a row sits at the outer side of its bubble
          const chipX = await t.art.evaluate((sel) => [...document.querySelectorAll(sel + " [data-part=row]")].map((row) => { const c = row.querySelector("svg, [data-role=chip]").closest("div").getBoundingClientRect(), bb = row.querySelector("[data-part=bubble]").getBoundingClientRect(); return (c.left + c.width / 2) - (bb.left + bb.width / 2); }), r.sel);
          t.ok(chipX.every((d, i) => (g.rows[i].who === "me") === (rtl ? d < 0 : d > 0)), id + ": the chip is at the outer side of its bubble " + chipX.map(Math.round));
          const dir = await t.art.evaluate((sel) => document.querySelector(sel + " .cs-art").getAttribute("dir"), r.sel); t.eq(dir, rtl ? "rtl" : "ltr");
          // the predicted boxes mirror the same way: the chip box of a me row is nearer the end than the chip box of a them row
          const chips = r.boxes.filter((b) => b.kind === "ink" && b.w === 60), cm = (b) => (rtl ? 852 - (b.x + b.w / 2) : b.x + b.w / 2);
          t.eq(chips.length, 3, id + ": one chip box a row"); t.ok(cm(chips[1]) > cm(chips[0]) + 300 && cm(chips[2]) < cm(chips[1]), id + ": predicted chips sit on the logical sides");
        }
      }
    },
    {
      name: "S-9 numbered chips: a run of two or more lines by one speaker gets one chip per bubble, beside it and never inside; a single line gets a faceless avatar and no digit",
      async run(t) {
        const r = await draw(t, chat({ caption: CAP }));   // me, them, them
        t.eq(roles(r), ["body", "chip", "body", "chip", "body", "small"], "label roles in creation order: " + roles(r)); t.eq(texts(r), [ME, "1", T1, "2", T2, CAP], "chips are digits 1 2 in order");
        t.eq(r.labels.map((l) => l.index), [0, 1, 2, 3, 4, 5], "indices are consecutive from 0");
        const f = await t.art.evaluate((sel) => {
          const art = document.querySelector(sel + " .cs-art"), owners = [...art.querySelectorAll("[data-owner]")];
          const depth = (e) => { let d = 0; for (let q = e.parentElement; q && q !== art; q = q.parentElement) if (q.hasAttribute("data-owner")) d++; return d; };
          const chips = [...art.querySelectorAll("[data-role=chip]")];
          return { chipInBubble: chips.map((c) => !!c.closest("[data-part=bubble]")), depths: [...art.querySelectorAll("[data-slot=art]")].map(depth), avatars: art.querySelectorAll("svg").length, rowChips: [...art.querySelectorAll("[data-part=row]")].map((row) => row.querySelectorAll("[data-role=chip]").length), maxOwnerDepth: Math.max(...owners.map(depth)) };
        }, r.sel);
        t.eq(f.chipInBubble, [false, false], "chips sit beside the bubble"); t.eq(f.rowChips, [0, 1, 1], "the me line (a run of one) has an avatar, no digit"); t.ok(f.avatars >= 1, "avatar svg");
        t.lte(f.maxOwnerDepth, 1, "nesting: window > chip; owner depth below the window is at most 1: " + f.maxOwnerDepth);
        t.lte(Math.max(...f.depths), 2, "no label has more than two containers around it: " + f.depths);
        const solo = await draw(t, chat({}), { slide: { id: "s05", demo: { lines: [{ who: "me", text: ME }, { who: "them", text: T1 }] } } });
        t.eq(roles(solo), ["body", "body"], "an alternating chat carries no digits");
        const r3 = await draw(t, chat({}), { slide: { id: "s05", demo: { lines: [{ who: "them", text: "أ" }, { who: "them", text: "ب" }, { who: "them", text: "ج" }] } } });
        t.eq(texts(r3).filter((x) => /^\d$/.test(x)), ["1", "2", "3"], "a run of three counts to 3"); t.eq(roles(r3), ["chip", "body", "chip", "body", "chip", "body"], "chip before its bubble, in creation order");
      }
    },
    {
      name: "M6 through CS.visual.deadSpace: the chat window and the notes paper own their interior - rows AND columns at least 65% (80% above 60% of the zone) - for one-line, alternating, numbered and note conversations on six presets, box heights 420-1000, in a zone equal to the box and in the 998 px body zone",
      async run(t) {
        const C = {
          one: lines({ who: "them", text: "hello" }), oneAr: lines({ who: "them", text: T1 }), alt: lines({ who: "me", text: "hello" }, { who: "them", text: "world" }),
          run: lines({ who: "me", text: ME }, { who: "them", text: T1 }, { who: "them", text: T2 }), four: lines(...["واحد", "اتنين", "تلاتة", "اربعة"].map((text, i) => ({ who: i % 2 ? "them" : "me", text })))
        };
        const N = { n1: lines({ text: "ليه" }), n2: lines({ text: "ليه الكابشن بياخد ساعة؟" }, { text: T1, hi: true }), n3: lines({ text: "ليه" }, { text: "كده" }, { text: "تمام" }), n5: lines(...["أول", "تاني", "تالت", "رابع", "خامس"].map((text, i) => ({ text, hi: i === 2 }))) };
        const must = new Set(["one", "oneAr", "alt", "n1", "n2", "n3"]);   // short conversations always build in 420 px and more
        let checked = 0, nulls = 0, minRows = 100, minCols = 100;
        for (const preset of PRESETS) for (const H of [420, 560, 700, 1000]) for (const [kind, set] of [["chat", C], ["notes", N]]) for (const [name, slide] of Object.entries(set)) {
          const r = await draw(t, kind === "chat" ? chat({}) : notes({}), { preset, slide, box: { w: 852, h: H } }), id = [preset, H, name].join(" ");
          if (!r) { nulls++; t.ok(!must.has(name), id + ": a short conversation must build"); continue; }
          for (const zone of [{ w: 852, h: H }, { w: 852, h: 998 }]) {
            const o = await owners(t, r.boxes, zone), z = id + " zone " + zone.h;
            t.eq(o.length, 1, z + ": the window / paper is the only owner (bubbles and bands are content)"); const m = o[0];
            t.ok(m.ok, z + ": the owner passes " + JSON.stringify(m)); t.gte(m.rows, m.need, z + ": rows " + m.rows + " of " + m.need); t.gte(m.cols, m.need, z + ": columns " + m.cols + " of " + m.need);
            t.gte(m.rows, 65, z + ": rows are at least 65%"); t.gte(m.cols, 65, z + ": columns are at least 65%");
            minRows = Math.min(minRows, m.rows); minCols = Math.min(minCols, m.cols); checked++;
          }
        }
        t.gte(checked, 400, "owner checks: " + checked + " (nulls " + nulls + "); weakest rows " + minRows + " columns " + minCols);
        // the reviewed repros, by name
        for (const [slide, label] of [[C.one, "one them:'hello'"], [C.alt, "hello / world"]]) { const r = await draw(t, chat({}), { slide, box: { w: 852, h: 560 } }), m = (await owners(t, r.boxes, { w: 852, h: 560 }))[0]; t.ok(m.ok && m.rows >= 65 && m.cols >= 65, label + ": window rows " + m.rows + " columns " + m.cols); }
        // the typing bubble and the chips are painted content in boxes[], where the DOM paints them
        const one = await draw(t, chat({}), { slide: C.one }), g = await t.art.evaluate(GEO, one.sel);
        const dots = one.boxes.filter((b) => b.kind === "ink" && b.w === 70 && b.h === 18), ty = g.bubbles.find((b) => b.part === "typing");
        t.eq(dots.length, 1, "one dots box for the typing bubble"); t.ok(Math.abs(dots[0].x + 35 - (ty.x + ty.w / 2)) < 30 && Math.abs(dots[0].y + 9 - (ty.y + ty.h / 2)) < 30, "the dots box sits in the typing bubble: " + JSON.stringify(dots[0]) + " vs " + JSON.stringify(ty));
        t.eq(one.boxes.filter((b) => b.kind === "ink" && b.w === 60).length, g.rows.length, "a chip / avatar box per row");
        t.eq(one.boxes.filter((b) => b.kind === "text").length, 1, "one text box (the typing bubble has no words)"); t.eq(texts(one), ["hello"]);
        // the typing bubble alone would not own anything: without its dots and chips the same window fails (what the review measured)
        const bare = await owners(t, one.boxes.filter((b) => b.kind === "owner" || b.kind === "text"), { w: 852, h: 560 });
        t.ok(bare[0].cols < 65 || bare[0].rows < 65, "without the dots and chips the window would fail: " + JSON.stringify(bare[0]));
        const meOnly = await draw(t, chat({}), { slide: lines({ who: "me", text: T1 }) });
        t.eq(await t.art.evaluate((sel) => [...document.querySelectorAll(sel + " [data-part=row]")].map((e) => e.getAttribute("data-who")), meOnly.sel), ["me", "them"], "a lone me line gets the typing bubble on the them side");
        for (const preset of PRESETS) {
          const one = await draw(t, chat({}), { preset, slide: lines({ who: "them", text: T1 }) }), g = await t.art.evaluate(GEO, one.sel);
          t.eq(g.bubbles.map((b) => b.part), ["bubble", "typing"], preset + ": the typing bubble follows"); t.eq(texts(one), [T1], preset + ": typing carries no words"); t.eq(g.rows.map((x) => x.who), ["them", "me"], preset + ": typing sits opposite");
        }
      }
    },
    {
      name: "S-9 notes: one tick box per row at the start side, the flagged row (hi or mock.highlight) is the only band with a tick, tape, tilt follows the DNA and is seeded",
      async run(t) {
        const NS = { id: "s05", type: "step", demo: { lines: [{ text: "ليه الكابشن بياخد ساعة؟" }, { text: T1, hi: true }, { text: T2 }] } };
        for (const preset of PRESETS) {
          const r = await draw(t, notes({}), { preset, slide: NS, box: { w: 852, h: 560 } });
          const f = await t.art.evaluate((sel) => {
            const art = document.querySelector(sel + " .cs-art"), rows = [...art.querySelectorAll("[data-part=row]")], paper = art.querySelector(".cs-art-panel");
            return { rows: rows.map((e) => { const b = e.getBoundingClientRect(), s = e.querySelector("svg").getBoundingClientRect(), l = e.querySelector("[data-slot=art]").getBoundingClientRect(); return { ticks: e.querySelectorAll("svg path").length, y: b.top, boxX: s.left + s.width / 2, textX: l.left + l.width / 2, band: getComputedStyle(e).backgroundColor !== "rgba(0, 0, 0, 0)", bordered: parseFloat(getComputedStyle(e).borderTopWidth) > 0 }; }),
              tilt: paper.style.transform, tape: art.querySelectorAll("div[style*='rotate(3deg)']").length, own: art.querySelectorAll("[data-owner]").length, paperOwner: paper.hasAttribute("data-owner") };
          }, r.sel);
          t.eq(f.rows.map((x) => x.band), [false, true, false], preset + ": only the flagged row is a band"); t.eq(f.rows.map((x) => x.bordered), [false, true, false], preset + ": and only it is outlined");
          t.eq(f.rows.map((x) => x.ticks), [1, 2, 1], preset + ": only the flagged row carries a tick (box + tick)");
          t.ok(f.rows.every((x) => x.boxX > x.textX), preset + ": the tick box is at the start (right) side"); t.ok(f.rows.every((x, i) => i === 0 || x.y > f.rows[i - 1].y), preset + ": rows in order");
          t.eq(f.tape, 1, preset + ": tape"); t.eq(f.own, 1, preset + ": the paper is the only owner (the band is content, not an owner)"); t.ok(f.paperOwner);
          if (preset === "creator" || preset === "notebook") t.ok(/rotate\(-?\d/.test(f.tilt), preset + ": tilted " + f.tilt); else t.eq(f.tilt, "", preset + ": flat");
          t.eq(r.boxes.filter((b) => b.kind === "text").length, 3, preset + ": one text box a row");
        }
        const NH = { id: "s05", type: "step", demo: { lines: [{ text: "ليه الكابشن بياخد ساعة؟" }, { text: T1 }, { text: T2 }] } };
        const a = await draw(t, notes({ highlight: 2 }), { slide: NH }), b = await draw(t, notes({ highlight: 2 }), { slide: NH });
        t.eq(a.html, b.html, "same input, same bytes"); t.eq(await t.art.evaluate((s) => [...document.querySelectorAll(s + " [data-part=row]")].map((e) => getComputedStyle(e).backgroundColor !== "rgba(0, 0, 0, 0)"), b.sel), [false, false, true], "mock.highlight flags a row by index");
        const sg = async (id) => (await t.art.evaluate((s) => document.querySelector(s + " .cs-art-panel").style.transform, (await draw(t, notes({}), { slideId: id, slide: NS })).sel));
        const signs = new Set(); for (const id of ["s01", "s02", "s03", "s04", "s05", "s06", "s07", "s08"]) signs.add(Math.sign(parseFloat(/rotate\((-?[\d.]+)/.exec(await sg(id))[1])));
        t.eq([...signs].sort(), [-1, 1], "the tilt direction is seeded per slide (both directions occur)");
        t.eq(await sg("s03"), await sg("s03"), "and stable for one slide");
      }
    },
    {
      name: "labels: roles, floors and order; every word is a label; labelsOnly returns the same strings and no element; Arabic labels at least 36, digits 34",
      async run(t) {
        for (const anchor of [chat({}), notes({})]) {
          const r = await draw(t, anchor), g = await t.art.evaluate(GEO, r.sel);
          t.ok(g.labels.length >= 3 && g.labels.every((l) => l.floor > 0), "every label has a floor");
          t.ok(g.labels.every((l) => (l.role === "chip" ? l.floor === 34 : l.floor >= 36)), "floors: Arabic 36, digits 34: " + g.labels.map((l) => l.floor));
          const loose = await t.art.evaluate((sel) => { const out = []; const w = document.createTreeWalker(document.querySelector(sel + " .cs-art"), NodeFilter.SHOW_TEXT); for (let n; (n = w.nextNode());) if (n.nodeValue.trim() && !n.parentElement.closest("[data-slot=art]")) out.push(n.nodeValue); return out; }, r.sel);
          t.eq(loose, [], "no text outside a label (A4)");
          const lo = await t.art.evaluate((a) => { const c = __art.ctx({ slide: { id: "s05", type: "step", demo: { lines: [{ who: "me", text: "أ" }, { who: "them", text: "ب" }, { who: "them", text: "ج" }], caption: "ك" }, bullets: ["أ"] }, labelsOnly: true, box: { w: 852, h: 800 } }); const f = CS.art.build(a, c); return f && { el: f.el, boxes: f.boxes.length, labels: f.labels.map((l) => [l.text, l.role, l.index]) }; }, anchor.mock.kind === "chat" ? chat({ caption: "ك", lines: [{ who: "me", text: "أ" }, { who: "them", text: "ب" }, { who: "them", text: "ج" }] }) : notes({ items: ["أ"] }));
          t.ok(lo && lo.el === null && lo.boxes === 0 && lo.labels.length >= 1, "labelsOnly: no element, no boxes");
        }
        const strings = await t.art.evaluate(([a, s]) => { const c = __art.ctx({ slide: s, box: { w: 852, h: 700 } }); const full = CS.art.build(a, c).labels.map((l) => [l.text, l.role, l.index]); c.labelsOnly = true; const only = CS.art.build(a, c).labels.map((l) => [l.text, l.role, l.index]); return [full, only]; }, [chat({}), SLIDE]);
        t.eq(strings[0], strings[1], "labelsOnly equals the full build (what CS.visual.expected reads)");
      }
    },
    {
      name: "boxes: valid Box types, the owner spans the anchor box, nothing leaves the box, the predicted window / paper height equals the DOM (within 3%), and predicted text boxes track the real labels",
      async run(t) {
        const KINDS = ["text", "ink", "owner", "pattern", "image", "mark", "decor"];
        for (const [anchor, h] of [[chat({}), 700], [chat({}), 900], [notes({}), 560], [notes({ highlight: 1 }), 700]]) for (const preset of ["creator", "poster", "interface"]) {
          const r = await draw(t, anchor, { preset, box: { w: 852, h } }), g = await t.art.evaluate(GEO, r.sel), id = anchor.mock.kind + " " + preset + " " + h;
          t.ok(r.boxes.length >= 3 && r.boxes.every((b) => KINDS.includes(b.kind) && b.w > 0 && b.h > 0), id + ": Box shape");
          t.ok(r.boxes.every((b) => b.x >= -0.5 && b.y >= -0.5 && b.x + b.w <= 852.5 && b.y + b.h <= h + 0.5), id + ": every box is inside the anchor box: " + JSON.stringify(r.boxes.filter((b) => b.x < -0.5 || b.y < -0.5 || b.x + b.w > 852.5 || b.y + b.h > h + 0.5)));
          const owner = r.boxes[0]; t.eq([owner.kind, owner.fill, owner.border > 0], ["owner", 1, true], id + ": the panel is the owner"); t.gte(g.win.w, 0.6 * 852, id + ": M2, at least 60% of the zone width");
          t.ok(r.boxes.filter((b) => (b.kind === "text" || b.kind === "ink") && b.y < owner.y + owner.h).every((b) => b.ownerOf), id + ": panel content belongs to its owner; the caption sits below it");
          t.ok(Math.abs(owner.h - g.win.oh) / g.win.oh <= 0.03, id + ": window / paper height predicted " + owner.h + " real " + g.win.oh);
          const texts_ = r.boxes.filter((b) => b.kind === "text"), real = g.labels.filter((l) => l.role !== "chip");
          t.eq(texts_.length, real.length, id + ": one text box per label");
          texts_.forEach((b, i) => { t.ok(Math.abs(b.y + b.h / 2 - (real[i].y + real[i].h / 2)) <= 45, id + ": label " + i + " y " + (b.y + b.h / 2) + " vs " + (real[i].y + real[i].h / 2)); if (anchor.mock.kind === "chat") t.ok(Math.abs(b.x + b.w / 2 - (real[i].x + real[i].w / 2)) <= 90, id + ": label " + i + " x " + (b.x + b.w / 2) + " vs " + (real[i].x + real[i].w / 2)); });
          if (anchor.mock.kind === "chat") { const chips = r.boxes.filter((b) => b.kind === "ink" && b.w === 60); t.eq(chips.length, g.rows.length, id + ": a chip box per row"); chips.forEach((b, i) => t.ok(Math.abs(b.y + 30 - (g.rows[i].y + g.rows[i].h / 2)) <= g.rows[i].h / 2 + 12, id + ": chip " + i + " sits in its row")); }
        }
      }
    },
    {
      name: "fit: 44 px text first, 36 px (role small) when the box is short, null when even that cannot fit (window, borders, tape, tilt and caption included); every build lies inside its box; the window is not stretched",
      async run(t) {
        const MS = Object.assign({}, SLIDE, { demo: Object.assign({}, SLIDE.demo, { caption: undefined }) });
        const tall = await draw(t, chat({}), { box: { w: 852, h: 1000 }, slide: MS }), g = await t.art.evaluate(GEO, tall.sel);
        t.ok(roles(tall).includes("body") && !roles(tall).includes("small"), "a tall box keeps the body role"); t.ok(Math.abs(g.win.h - tall.boxes[0].h) <= 2 && g.win.h < 700, "the window is exactly its content, not stretched to a 1000 px box: " + g.win.h);
        await contained(t, tall, 852, 1000, "tall chat");
        // the sweep: null, then small, then body as the box grows; everything that builds is contained; the caption is part of the fit
        const sweep = async (anchor, preset, slide, capSlide) => {
          const out = [];
          for (let H = 200; H <= 900; H += 20) {
            const r = await draw(t, anchor, { preset, slide: capSlide || slide, box: { w: 852, h: H } });
            out.push(r ? roles(r).includes("body") ? "body" : "small" : "null");
            if (r) await contained(t, r, 852, H, anchor.mock.kind + " " + preset + " " + H + (capSlide ? " + caption" : ""));
          }
          return out;
        };
        const order = (a) => a.filter((x, i) => i === 0 || x !== a[i - 1]).join(",");
        const NS = { id: "s05", demo: { lines: [{ text: "ليه الكابشن بياخد ساعة؟" }, { text: T1 }, { text: T2 }] } };
        const WC = Object.assign({}, MS, { demo: Object.assign({}, MS.demo, { caption: CAP }) }), NC = { id: "s05", demo: { lines: NS.demo.lines, caption: CAP } };
        const firstBody = (a, H0 = 200) => H0 + 20 * a.indexOf("body"), firstFit = (a, H0 = 200) => H0 + 20 * a.findIndex((x) => x !== "null");
        const res = {};
        for (const [name, anchor, slide, cs, capA] of [["chat", chat({}), MS, WC, chat({ caption: CAP })], ["notes", notes({}), NS, NC, notes({ caption: CAP })]]) for (const preset of ["creator", "swiss"]) {
          const a = await sweep(anchor, preset, slide), b = await sweep(capA, preset, slide, cs), id = name + " " + preset;
          t.eq(order(a), "null,small,body", id + ": null -> small -> body as the box grows: " + a.join(" ")); t.eq(order(b), "null,small,body", id + " with a caption: " + b.join(" "));
          t.gte(firstFit(b), firstFit(a) + 40, id + ": the caption (gap + one line) is part of the fit: needs " + firstFit(b) + " vs " + firstFit(a)); t.gte(firstBody(b), firstBody(a) + 40, id + ": and of the 44 px fit");
          res[id] = firstFit(a);
        }
        t.eq(await draw(t, chat({}), { box: { w: 852, h: 260 } }), null, "a 260 px box cannot hold three bubbles: null so the caller falls back");
        t.eq(await draw(t, notes({}), { box: { w: 852, h: 200 } }), null, "nor a notes card");
        // the reviewed case: creator DNA (tilt reserve), three short notes lines, 330 px - the old build returned a paper spanning y 14-346 and tape at y -10
        const three = { id: "s05", demo: { lines: [{ text: "ليه الكابشن بياخد ساعة؟" }, { text: T1 }, { text: T2 }] } };
        t.eq(await draw(t, notes({}), { preset: "creator", box: { w: 852, h: 330 }, slide: three }), null, "creator, 3 notes lines, 330 px: the layout does not fit, so null");
        const swiss = await draw(t, notes({}), { preset: "swiss", box: { w: 852, h: 330 }, slide: three }); t.ok(swiss && roles(swiss).every((x) => x === "small"), "swiss has no tilt reserve: the same three lines fit at 36 px");
        await contained(t, swiss, 852, 330, "swiss notes 330");
        // the tape stays in the box in the tightest creator build, and the rotated paper too
        const tight = await draw(t, notes({}), { preset: "creator", box: { w: 852, h: res["notes creator"] }, slide: three, png: false });
        t.ok(tight, "creator notes build at the first fitting height " + res["notes creator"]); await contained(t, tight, 852, res["notes creator"], "creator notes at the minimum");
        const tp = await t.art.evaluate((sel) => { const A = document.querySelector(sel + " .cs-art").getBoundingClientRect(), e = document.querySelector(sel + " div[style*='rotate(3deg)']").getBoundingClientRect(); return { top: e.top - A.top, bottom: e.bottom - A.top }; }, tight.sel);
        t.ok(tp.top >= 0 && tp.bottom <= res["notes creator"], "the tape lies inside the box " + JSON.stringify(tp));
      }
    },
    {
      name: "painter safety A1-A17 and the Arabic rules, with the content box (A12), on 6 presets x 3 tones x chat / notes x RTL / LTR; no overflow:hidden, no opacity, no letter-spacing",
      async run(t) {
        const EN = { id: "s05", type: "step", demo: { lines: [{ who: "me", text: "Write five hooks about saving time" }, { who: "them", text: "Swap the hour for five minutes." }, { who: "them", text: "Your time beats one more caption." }] } };
        for (const preset of PRESETS) for (const tone of ["base", "invert", "field"]) for (const rtl of [true, false]) for (const anchor of [chat({}), notes({ highlight: 0 })]) {
          const r = await draw(t, anchor, { preset, tone, rtl, slide: rtl ? SLIDE : EN, box: { w: 852, h: anchor.mock.kind === "chat" ? 760 : 560 } }), id = [preset, tone, rtl ? "rtl" : "ltr", anchor.mock.kind].join(" ");
          t.ok(r, id + ": built");
          const s = await t.art.safe(r, { content: true }); t.eq(s.violations, [], id + ": safe()");
        }
        const src = fs.readFileSync(SRC, "utf8");
        t.ok(!new RegExp("Math\\.random|Date|performance|fetch\\(|XMLHttp|analy" + "tics|letter-spacing|overflow|opacity|italic|justify[^-]").test(src.replace(/justify-content/g, "")), "source has none of the banned tokens");
      }
    },
    {
      name: "every label reads at 4.5:1 on the colour behind it, on 6 presets x 3 tones x chat / notes (bubble, band, paper, window)",
      async run(t) {
        const HI = Object.assign({}, SLIDE, { demo: Object.assign({}, SLIDE.demo, { lines: SLIDE.demo.lines.map((l, i) => Object.assign({}, l, i === 1 ? { hi: true } : null)) }) });   // a flagged bubble is an accent fill
        const rows = await t.art.evaluate(([SL, P]) => {
          const out = [], c = CS.core.color, num = (s) => s.match(/[\d.]+/g).map(Number), hex = (s) => { const [r, g, b] = num(s); return c.toHex({ r, g, b }); };
          for (const preset of P) for (const tone of ["base", "invert", "field"]) for (const a of [{ kind: "mock", mock: { kind: "chat", caption: SL.demo.caption } }, { kind: "mock", mock: { kind: "notes", highlight: 1 } }]) {
            const r = __art.render(a, { preset, tone, slide: SL, box: { w: 852, h: 760 } });
            document.querySelectorAll(r.sel + " [data-slot=art]").forEach((e) => {
              let bg = e; while (bg && (getComputedStyle(bg).backgroundColor === "rgba(0, 0, 0, 0)" || getComputedStyle(bg).backgroundColor === "transparent")) bg = bg.parentElement;
              const fg = hex(getComputedStyle(e).color), under = bg.classList.contains("cs-slide") ? getComputedStyle(bg).backgroundColor : getComputedStyle(bg).backgroundColor;
              out.push({ id: [preset, tone, a.mock.kind, e.getAttribute("data-role"), e.textContent.slice(0, 8)].join("/"), ratio: c.contrast(fg, hex(under)) });
            });
          }
          return out;
        }, [HI, PRESETS]);
        t.ok(rows.length > 120, "labels checked: " + rows.length);
        const bad = rows.filter((x) => x.ratio < 4.5); t.eq(bad, [], "labels under 4.5:1");
      }
    },
    {
      name: "both painters agree (svg and replay) on complete slides and on the text-bearing regions - the panel, a bubble's / row's text, the numbered chip, the flagged bubble or band - creator and poster, chat and notes, RTL and LTR; same input, same bytes",
      async run(t) {
        const EN = { id: "s05", type: "step", demo: { lines: [{ who: "me", text: "Write five hooks about saving time" }, { who: "them", text: "Swap the hour for five minutes.", hi: true }, { who: "them", text: "Your time beats one more caption." }], caption: "Change the topic" } };
        const AR = { id: "s05", type: "step", demo: { lines: [{ who: "me", text: ME }, { who: "them", text: T1, hi: true }, { who: "them", text: T2 }], caption: CAP } };
        const crop = (im, [x, y, w, h]) => { const d = new Uint8ClampedArray(w * h * 4); for (let j = 0; j < h; j++) d.set(im.data.subarray(((y + j) * im.width + x) * 4, ((y + j) * im.width + x + w) * 4), j * w * 4); return { width: w, height: h, data: d }; };
        let regions = 0;
        for (const preset of ["creator", "poster"]) for (const [anchor, rtl] of [[chat({ caption: CAP }), true], [notes({ highlight: 1, caption: CAP }), true], [chat({ caption: "Change the topic" }), false], [notes({ highlight: 1, caption: "Change the topic" }), false]]) {
          const slide = rtl ? AR : EN, o = { preset, rtl, slide, box: { w: 852, h: anchor.mock.kind === "chat" ? 760 : 560 }, png: false }, a = await t.art.render(anchor, o), b = await t.art.render(anchor, o);
          const id = preset + " " + anchor.mock.kind + " " + (rtl ? "rtl" : "ltr");
          t.eq(a.html, b.html, id + ": same input, same bytes");
          const p = await t.art.paintBoth(b);   // the complete slide in both painters, with its .cs-slide styling
          t.gte(p.ssim, 0.98, id + " slide (" + p.ssim.toFixed(4) + ")");
          const at = await t.art.evaluate(([sel, kind]) => {
            const s = document.querySelector(sel).getBoundingClientRect(), art = document.querySelector(sel + " .cs-art");
            const R = (e) => { const q = e.getBoundingClientRect(), x = Math.max(0, Math.floor(q.left - s.left)), y = Math.max(0, Math.floor(q.top - s.top)); return [x, y, Math.min(1080 - x, Math.ceil(q.width)), Math.min(1440 - y, Math.ceil(q.height))]; };
            const body = art.querySelector("[data-slot=art]:not([data-role=chip])"), chipEl = art.querySelector("[data-role=chip]"), flag = kind === "chat" ? art.querySelectorAll("[data-part=bubble]")[1] : [...art.querySelectorAll("[data-part=row]")].find((e) => parseFloat(getComputedStyle(e).borderTopWidth) > 0);
            const o = { panel: R(art.querySelector(".cs-art-panel")), text: R(body), flag: R(flag), caption: R([...art.querySelectorAll("[data-slot=art]")].pop()) };
            if (chipEl) o.chip = R(chipEl.parentElement);
            return o;
          }, [b.sel, anchor.mock.kind]);
          const A = decodePng(p.svgPng), B = decodePng(p.replayPng);
          for (const [k, rect] of Object.entries(at)) { const v = ssim(crop(A, rect), crop(B, rect)); regions++; t.gte(v, 0.98, id + ": the " + k + " region paints alike (" + v.toFixed(4) + " at " + rect.join(",") + ")"); }
        }
        t.eq(regions, 36, "regions compared (5 per chat slide, 4 per notes slide, 2 presets x 4 slides): " + regions);
      }
    },
    {
      name: "source budget: src/art/mock.js is at most 12 KiB; contact sheets of chat and notes on six presets saved at 1x and at the 130 px profile size",
      async run(t) {
        t.lte(fs.statSync(SRC).size, 12288, "mock.js bytes");
        const items = [];
        for (const preset of PRESETS) for (const anchor of [chat({ caption: CAP }), notes({ highlight: 1 })]) items.push([anchor, preset]);
        const tiles = [];
        for (const [anchor, preset] of items) tiles.push((await t.art.render(anchor, { preset, tone: "base", slide: SLIDE, box: { w: 852, h: anchor.mock.kind === "chat" ? 760 : 560 }, png: true })).png);
        const sheet = await t.art.evaluate(async ([b64s]) => {
          const imgs = await Promise.all(b64s.map(async (b) => { const i = new Image(); i.src = "data:image/png;base64," + b; await i.decode(); return i; }));
          const cols = 4, cw = 540, ch = 720, c = document.createElement("canvas"); c.width = cols * cw; c.height = Math.ceil(imgs.length / cols) * ch; const x = c.getContext("2d"); x.imageSmoothingQuality = "high";
          imgs.forEach((im, i) => x.drawImage(im, (i % cols) * cw, Math.floor(i / cols) * ch, cw, ch));
          return c.toDataURL("image/png").split(",")[1];
        }, [tiles.map((b) => b.toString("base64"))]);
        const png = Buffer.from(sheet, "base64"); t.ok(png.length > 20000, "sheet png");
        t.art.save("mock.png", png); t.art.save("mock-130.png", await t.art.small(png, Math.round(2160 * 130 / 1080)));
      }
    }
  ]
};
