// tests/unit/js/art/word.test.mjs · package A10a (WORD-LITE): the `word` anchor, built only from the slide's own words (spec 3.10, S-3, S-5, S-9).
// styles solid, sticker (three text slots: ink, paper ring, hard shadow), struck (the strike is a text-bound mark, rule A13: the anchor tags each ink line, a wrapped phrase is one label per line,
// and the real settle pass draws one strike per fitted line after the real fit); the kashida bar; the replay-painter probe (its flag handling included) and the solid-on-a-tile fallback.
// Fit is the real one (CS.core.fit.fitSlide through word-probe.mjs renderFit); the display role comes from the real primitives.css rule (word-probe.mjs prepare).
//   node tests/unit/js/art/run.mjs --only word [--out DIR]      (the contact sheets are written only with --out)
import fs from "node:fs";
import path from "node:path";
import { REPO } from "../../../parity/lib/studio.mjs";
import { prepare, renderFit, parity, measure, probe, agrees, settleSlide, verdict, montage, FLOOR } from "./word-probe.mjs";

const WORD = (word, wordStyle) => ({ kind: "word", word, wordStyle });
const at = (preset, tone, h = 440, o = {}) => ({ preset, tone, recipe: "under", box: { w: 852, h }, ...o });
const SRC = fs.readFileSync(path.join(REPO, "src/art/word.js"), "utf8");
const BANNED = /opacity|letter-spacing|justify|italic|oblique|filter|mask|clip-path|outline|inset|var\(|color-mix/;

/** the facts about the rendered word anchor that several tests read (positions are slide px) */
const facts = (sel) => {
  const r = (e) => { const b = e.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; };
  const art = document.querySelector(sel + " .cs-art"), wrap = art.querySelector("[data-part=word]");
  return {
    art: r(art), wrap: r(wrap), bar: art.querySelector("[data-part=kashida]") ? r(art.querySelector("[data-part=kashida]")) : null, strike: art.querySelector("[data-mark=strike]") ? r(art.querySelector("[data-mark=strike]")) : null,
    labels: [...art.querySelectorAll("[data-slot=art]")].map((e) => ({ index: +e.getAttribute("data-index"), key: e.getAttribute("data-slot-key"), role: e.getAttribute("data-role"), px: parseFloat(getComputedStyle(e).fontSize), decor: e.hasAttribute("data-decor"), hidden: e.getAttribute("aria-hidden"), style: e.getAttribute("style"), rect: r(e), text: e.textContent })),
    styles: [...art.querySelectorAll("*")].map((e) => e.getAttribute("style") || "").filter(Boolean)
  };
};

export default {
  module: "word",
  tests: [
    {
      name: "FIX-A: number-noun groups remain indivisible through real fit and settle, twice",
      async run(t) {
        await prepare(t.art, { quick: true });
        for (const text of ["2,500 جنيه", "2,500\u00a0جنيه"]) {
          const out = [];
          for (let i = 0; i < 2; i++) {
            const r = await renderFit(t.art, WORD(text, "struck"), at("creator", "base", 720));
            t.ok(r, "builds");
            t.eq(r.labels.length, 1, "the pair is never split into separate block labels");
            const f = await t.art.evaluate(facts, r.sel), settled = await settleSlide(t.art, r);
            t.ok(f.labels[0].text.includes("2,500\u00a0جنيه"), "compose binds the ordinary-space pair too");
            t.ok(r.fit.ok || r.fit.warnings.length > 0, "an indivisible overflow is reported by real fit");
            t.eq(settled.paths.length, 1, "one measured strike target");
            out.push({ html: r.html, labels: r.labels, boxes: r.boxes, paths: settled.paths });
          }
          t.eq(out[0], out[1], "same input, same markup, labels, boxes and settled mark");
        }
        t.eq(await t.art.evaluate(() => CS.art.word.derive({ type: "cta", title: "عايز ورقة؟", cta: { keyword: "هوك" } })), "هوك");
      }
    },
    {
      name: "registers solid, sticker and struck for kind word, strictly (one owner per sub)",
      async run(t) {
        const caps = await t.art.evaluate(() => CS.art.caps().art.word);
        t.eq(caps, ["solid", "sticker", "struck"]);
        t.eq(await t.art.evaluate(() => ["solid", "sticker", "struck", "hollow", "lettermark"].map((s) => CS.art.has("word", s))), [true, true, true, false, false], "hollow and lettermark are A10b (S-3)");
        t.eq(await t.art.evaluate(() => { try { CS.art.register("word", () => null, ["sticker"]); return "registered"; } catch (e) { return e.code; } }), "E_ART_DUPLICATE");
        t.eq(await t.art.evaluate(() => CS.visual.art.has("word", "solid")), true, "visible to the planner through CS.visual.art");
      }
    },
    {
      name: "the word is the slide's own: anchor.word first, else the ==emphasis== span, else number and unit, else the title's longest word; nothing to say -> no anchor",
      async run(t) {
        await prepare(t.art, { quick: true });
        const d = await t.art.evaluate(() => {
          const f = CS.art.word.derive;
          return [f({ title: "اكتب ==الهوك== الأول", body: "ثم الباقي" }), f({ headline: "خرافة", number: { value: "74%", unit: "من الناس" } }), f({ title: "تسعير الفريلانس بذكاء" }), f({}), f({ body: "هذا ==أول سطر== بس" })];
        });
        t.eq(d, ["الهوك", "74% من الناس", "الفريلانس", "", "أول سطر"]);
        const slide = { id: "s05", type: "item", title: "اكتب ==الهوك== الأول", visual: {} };
        const own = await t.art.render({ kind: "word" }, { ...at("creator", "base"), slide, png: false });
        t.eq(own.labels.map((l) => l.text), ["الهوك"], "derived from the slide");
        const given = await t.art.render({ kind: "word", word: "احفظ" }, { ...at("creator", "base"), slide, png: false });
        t.eq(given.labels.map((l) => l.text), ["احفظ"], "anchor.word wins");
        t.eq(await t.art.render({ kind: "word" }, { ...at("creator", "base"), slide: { id: "s05", type: "item" }, png: false }), null, "no word, no anchor");
        t.eq(await t.art.render({ kind: "word", word: "احفظ" }, { ...at("creator", "base", 200), png: false }), null, "a box under 220 px of type + the floor drops the anchor (the caller falls back)");
      }
    },
    {
      name: "every style x creator, poster, swiss x three tones builds, fits at the real fit, is painter-safe (A1-A17, Arabic rules) and keeps the word inside its box",
      async run(t) {
        await prepare(t.art, { quick: true });
        for (const style of ["solid", "sticker", "struck"]) for (const preset of ["creator", "poster", "swiss"]) for (const tone of ["base", "invert", "field"]) {
          const r = await renderFit(t.art, WORD("احفظ", style), at(preset, tone));
          t.ok(r, `${style} ${preset} ${tone} builds`);
          t.ok(r.fit.ok, `${style} ${preset} ${tone}: fit ok ${r.fit.warnings.join("|")}`);
          const s = await t.art.safe(r, { content: true });
          t.eq(s.violations, [], `${style} ${preset} ${tone} safe()`);
          const f = await t.art.evaluate(facts, r.sel);
          t.lte(f.wrap.w, 852 + 0.5, `${style} ${preset} ${tone}: the word is at most 852 px wide`);
          t.gte(f.wrap.x, f.art.x - 0.5, "the word starts inside its box"); t.lte(f.wrap.x + f.wrap.w, f.art.x + f.art.w + 0.5, "the word ends inside its box");
          t.lte(f.wrap.y + f.wrap.h, f.art.y + f.art.h + 0.5, "and above the bottom"); t.gte(f.wrap.y, f.art.y - 0.5, "and below the top");
          for (const l of f.labels) { t.eq(l.role, "word"); t.gte(l.px, 220, "word labels never go under their 220 px floor"); }
        }
      }
    },
    {
      name: "no letter-spacing, justification, italic, opacity, filter, mask, clip-path, outline, var() or color-mix on or around the word (computed and inline), Latin and digit runs sit in <bdi dir=ltr>",
      async run(t) {
        await prepare(t.art, { quick: true });
        for (const [word, style, rtl] of [["احفظ", "sticker", true], ["لازم مصمم", "struck", true], ["8 دقايق", "solid", true], ["Save", "sticker", false]]) {
          const r = await renderFit(t.art, WORD(word, style), { ...at("creator", "base", 640), rtl });
          if (!r) continue;
          const f = await t.art.evaluate(facts, r.sel);
          for (const st of f.styles) t.ok(!BANNED.test(st), `${style}: an inline style carries a banned token: ${st}`);
          const bad = await t.art.evaluate((sel) => [...document.querySelectorAll(sel + " .cs-art-label, " + sel + " .cs-art-label *")].filter((e) => { const c = getComputedStyle(e); return (c.letterSpacing !== "normal" && parseFloat(c.letterSpacing) !== 0) || c.fontStyle !== "normal" || c.textAlign === "justify" || c.opacity !== "1" || c.filter !== "none"; }).length, r.sel);
          t.eq(bad, 0, `${word}: computed styles of the labels`);
          t.eq((await t.art.safe(r)).violations, [], `${word} ${style}: safe() including the bdi rule`);
        }
      }
    },
    {
      name: "sticker = three slots of one text (ink, paper ring, hard shadow) that the real fit sizes alike; the copies are aria-hidden; ink is on top; the shadow falls to the end side of reading",
      async run(t) {
        await prepare(t.art, { quick: true });
        for (const rtl of [true, false]) {
          const r = await renderFit(t.art, WORD("احفظ", "sticker"), { ...at("creator", "base", 560), rtl });
          const f = await t.art.evaluate(facts, r.sel);
          t.eq(f.labels.map((l) => l.index), [2, 1, 0], "DOM order: shadow, ring, ink");
          t.eq(f.labels.map((l) => l.decor), [true, true, false]);
          t.eq(f.labels.map((l) => l.hidden), ["true", "true", null], "only the ink word is read");
          t.eq(new Set(f.labels.map((l) => l.px)).size, 1, "all three layers have one size after fit");
          t.eq(new Set(f.labels.map((l) => l.text)).size, 1, "one text");
          t.eq(r.fit.slots["s05.art.0"].px, r.fit.slots["s05.art.1"].px); t.eq(r.fit.slots["s05.art.1"].px, r.fit.slots["s05.art.2"].px, "fit reports one size for the three keys");
          const dx = parseFloat(/left:\s*(-?[\d.]+)px/.exec(f.labels[0].style)[1]);
          t.ok(rtl ? dx < 0 : dx > 0, `the shadow offset follows the reading direction (rtl ${rtl}: ${dx})`);
          t.eq(await t.art.evaluate((sel) => { const e = [...document.querySelectorAll(sel + " [data-slot=art]")]; return e.map((x) => x.style.position); }, r.sel), ["absolute", "absolute", "relative"], "the ink is the only one in flow, painted last");
        }
        // the ring is the accent when it differs from the ink (creator field: the white of M0 L1/12), else the paper colour (poster field: accent and ink are one cream)
        const ring = async (preset, tone) => { const r = await renderFit(t.art, WORD("احفظ", "sticker"), at(preset, tone, 560)); return t.art.evaluate((sel) => [1, 0, 2].map((i) => getComputedStyle(document.querySelector(sel + ` [data-index="${i}"]`)).color), r.sel); };
        const cf = await ring("creator", "field"), pf = await ring("poster", "field");
        t.eq(cf, ["rgb(255, 255, 255)", "rgb(20, 18, 15)", "rgb(20, 18, 15)"], "creator field: white ring, ink word, ink shadow");
        t.eq(pf, ["rgb(150, 72, 37)", "rgb(243, 235, 216)", "rgb(243, 235, 216)"], "poster field: accent equals ink, so the ring is the paper colour");
      }
    },
    {
      name: "a short word in a short box is capped by the box (fit may not pick 520 px in 420 px); in a tall box the width decides; the cap survives the real fit (guards --cs-fit-ratio against fit.js)",
      async run(t) {
        await prepare(t.art, { quick: true });
        if (t.art.coreFallback) t.skip("src/core did not build; there is no fit to run");
        const short = await renderFit(t.art, WORD("ده", "sticker"), at("creator", "base", 420));
        t.eq(short.fit.slots["s05.art.0"].px, Math.floor((420 - 60) / 1.15), "ده in 420 px: the height cap (360 / 1.15)");
        const solid = await renderFit(t.art, WORD("ده", "solid"), at("creator", "base", 420));
        t.eq(solid.fit.slots["s05.art.0"].px, Math.floor(420 / 1.15), "solid: the same rule without the sticker pad");
        const tall = await renderFit(t.art, WORD("احفظ", "solid"), at("creator", "base", 900));
        const px = tall.fit.slots["s05.art.0"].px, f = await t.art.evaluate(facts, tall.sel);
        t.ok(px > 220 && px < 520, "احفظ in a tall box is limited by the width: " + px);
        t.gte(f.labels[0].rect.w, 852 * 0.9, "and fills at least 90% of the width");
        const two = await renderFit(t.art, WORD("لازم مصمم", "solid"), at("creator", "base", 640));
        t.eq(two.fit.slots["s05.art.0"].lines, 2, "two words of seven letters stack on two lines");
        t.ok(two.fit.ok, "and fit");
        t.lte(two.fit.slots["s05.art.0"].px, 360, "two-word size range tops at 360");
      }
    },
    {
      name: "wrapping: the anchor never passes 852 px; a word too long for the 220 px floor is reported by fit as an overflow, not hidden",
      async run(t) {
        await prepare(t.art, { quick: true });
        for (const style of ["solid", "sticker"]) {
          const r = await renderFit(t.art, WORD("المتابعين الجدد", style), at("creator", "base", 700));
          const f = await t.art.evaluate(facts, r.sel);
          t.lte(f.wrap.w, 852 + 0.5, style + ": wrapper width");
          t.lte(f.wrap.x + f.wrap.w, f.art.x + f.art.w + 0.5); t.gte(f.wrap.x, f.art.x - 0.5);
          const ink = f.labels.find((l) => l.index === 0), lines = r.fit.slots["s05.art.0"].lines;
          t.lte(lines, 2, "two lines at most");
          t.ok(r.fit.ok || r.fit.warnings.some((w) => /does not fit/.test(w)), "a result either fits or says so");
          t.ok(ink.rect.w <= 852.5);
        }
        const wide = await renderFit(t.art, WORD("المتابعين", "solid"), at("creator", "base", 700));
        t.ok(!wide.fit.ok && wide.fit.warnings.length === 1, "a nine-letter word cannot reach 220 px in 852 px: fit says so");
        t.eq(wide.fit.slots["s05.art.0"].px, 220, "and stays at the floor");
        t.eq((await t.art.safe(wide)).violations, [], "still painter-safe");
      }
    },
    {
      name: "struck (A13): the anchor draws no stripe; the ink label alone carries data-mark-target and the real settle pass, run after the real fit, strikes the fitted word (a line through it), stores the mark and repeats it",
      async run(t) {
        await prepare(t.art, { quick: true });
        const r = await renderFit(t.art, WORD("خرافة", "struck"), at("creator", "base", 440));
        const f = await t.art.evaluate(facts, r.sel);
        t.eq(f.strike, null, "nothing is drawn at compose time");
        t.eq(await t.art.evaluate((sel) => [...document.querySelectorAll(sel + " .cs-art [data-mark-target]")].map((e) => [e.getAttribute("data-mark-target"), e.getAttribute("data-index"), e.hasAttribute("data-decor")]), r.sel), [["strike-line", "0", false]], "one target: the ink word");
        t.eq(await t.art.evaluate((sel) => document.querySelectorAll(sel + " .cs-art svg, " + sel + " .cs-art [data-mark]").length, r.sel), 0, "and no svg or mark inside the anchor");
        const st = await settleSlide(t.art, r), line = st.lines[0], p = st.paths[0];
        t.eq([st.marks, st.dropped, st.layers, st.last, st.paths.length, st.lines.length, st.stored], [["strike-line"], 0, 1, true, 1, 1, true], "one strike-line mark in one layer above the content, stored for the freeze");
        t.ok(p.w >= 0.9 * line.w && Math.abs(p.x + p.w / 2 - (line.x + line.w / 2)) <= 0.05 * line.w, `the strike spans the whole word, centred on it (${p.x.toFixed(0)}..${(p.x + p.w).toFixed(0)} over ${line.x.toFixed(0)}..${(line.x + line.w).toFixed(0)})`);
        const cy = p.y + p.h / 2;
        t.ok(cy >= line.y + 0.2 * line.h && cy <= line.y + 0.85 * line.h, `through the middle of the word (strike ${cy.toFixed(0)} in ${line.y.toFixed(0)}..${(line.y + line.h).toFixed(0)})`);
        t.eq((await settleSlide(t.art, r)).paths, st.paths, "the same slide gives the same mark");
        t.eq((await t.art.safe(r, { content: true })).violations, [], "painter-safe with the marks layer, anchor inside the content box");
        const solid = await renderFit(t.art, WORD("خرافة", "solid"), at("creator", "base", 440)), ss = await settleSlide(t.art, solid);
        t.eq([ss.targets, ss.marks.length, ss.layers], [[], 0, 0], "solid carries no target and gets no mark");
      }
    },
    {
      name: "struck, wrapped (A13): a phrase of two words is two labels (one per line, one size after the real fit), each its own settle target; the settle pass strikes each fitted line, in creator, poster, swiss, RTL and LTR, and no stripe crosses the block",
      async run(t) {
        await prepare(t.art, { quick: true });
        const lab = (word) => t.art.render(WORD(word, "struck"), { ...at("creator", "base", 640), labelsOnly: true, png: false }).then((r) => r.labels.map((l) => l.text));
        t.eq(await lab("لازم مصمم"), ["لازم", "مصمم"], "split at the space");
        t.eq(await lab("اكتب هدفك الأول يوميا"), ["اكتب هدفك", "الأول يوميا"], "four words: the space nearest the middle");
        t.eq(await lab("هتخسر فلوسك كلها"), ["هتخسر", "فلوسك كلها"], "a tie goes to the earlier space");
        t.eq(await lab("لا أبدا"), ["لا أبدا"], "six letters or fewer stay one line");
        t.eq(await lab("خرافة"), ["خرافة"], "one word, one label");
        t.eq((await t.art.render(WORD("لازم مصمم", "solid"), { ...at("creator", "base", 640), labelsOnly: true, png: false })).labels.map((l) => l.text), ["لازم مصمم"], "only struck splits: solid keeps one label that wraps");
        for (const [word, preset, tone, rtl, doodle] of [["لازم مصمم", "creator", "base", true, "marker"], ["لازم مصمم", "poster", "invert", true, "pen"], ["لازم مصمم", "swiss", "field", true, "pen"], ["Not true", "creator", "invert", false, "marker"]]) {
          const tag = `${word} ${preset} ${tone} rtl ${rtl}`, r = await renderFit(t.art, WORD(word, "struck"), { ...at(preset, tone, 640), rtl });
          t.ok(r && r.fit.ok, `${tag}: builds and fits ${r && r.fit.warnings.join("|")}`);
          const f = await t.art.evaluate(facts, r.sel), k0 = r.fit.slots["s05.art.0"], k1 = r.fit.slots["s05.art.1"];
          t.eq(f.labels.map((l) => [l.index, l.key, l.role, l.decor]), [[0, "s05.art.0", "word", false], [1, "s05.art.1", "word", false]], `${tag}: two ink labels, keyed like any art label`);
          t.eq([k0.lines, k1.lines, k0.px === k1.px, k0.px >= 220], [1, 1, true, true], `${tag}: one line each, one size (${k0.px} and ${k1.px} px), not under the floor`);
          t.eq(f.strike, null, `${tag}: no compose-time stripe across the block`);
          t.eq(await t.art.evaluate((sel) => [...document.querySelectorAll(sel + " .cs-art [data-mark-target]")].map((e) => [e.getAttribute("data-mark-target"), e.getAttribute("data-index")]), r.sel), [["strike-line", "0"], ["strike-line", "1"]], `${tag}: each line is a settle target of its own`);
          const st = await settleSlide(t.art, r, { doodle });
          t.eq(st.lines.length, 2, `${tag}: two fitted lines are measured`);
          t.eq([st.marks, st.layers, st.paths.length, st.dropped, st.stored], [["strike-line", "strike-line"], 1, 2, 0, true], `${tag}: one strike per line, one layer above the content`);
          for (const [i, l] of st.lines.entries()) {
            const b = st.paths[i], cy = b.y + b.h / 2;
            t.ok(b.w >= 0.9 * l.w && Math.abs(b.x + b.w / 2 - (l.x + l.w / 2)) <= 0.05 * l.w, `${tag}: strike ${i + 1} spans its line, centred on it (${b.x.toFixed(0)}..${(b.x + b.w).toFixed(0)} over ${l.x.toFixed(0)}..${(l.x + l.w).toFixed(0)})`);
            t.ok(cy >= l.y + 0.2 * l.h && cy <= l.y + 0.85 * l.h, `${tag}: strike ${i + 1} runs through the middle of its own line (${cy.toFixed(0)} in ${l.y.toFixed(0)}..${(l.y + l.h).toFixed(0)})`);
            const other = st.lines[1 - i], oy = other.y + other.h / 2;
            t.ok(Math.abs(cy - (l.y + l.h / 2)) < Math.abs(cy - oy), `${tag}: and is nearer its own line than the other`);
          }
          t.eq((await settleSlide(t.art, r, { doodle })).paths, st.paths, `${tag}: same slide, same marks`);
          t.eq((await t.art.safe(r, { content: true })).violations, [], `${tag}: safe()`);
        }
        const short = await renderFit(t.art, WORD("لا أبدا", "struck"), at("creator", "base", 640));
        t.eq([short.labels.length, (await settleSlide(t.art, short)).marks], [1, ["strike-line"]], "six letters or fewer: one line, one strike");
      }
    },
    {
      name: "kashida bar (S-5): 85% of the word, at least 24 px under it, the tapered end toward the end of reading; only with visual.marks kashida; a sticker never carries it",
      async run(t) {
        await prepare(t.art, { quick: true });
        const slide = (marks) => ({ id: "s05", type: "item", visual: { marks } });
        for (const rtl of [true, false]) {
          const r = await renderFit(t.art, WORD("الهوك", "solid"), { ...at("poster", "base", 560, { slide: slide(["kashida"]) }), rtl });
          const f = await t.art.evaluate(facts, r.sel);
          t.ok(f.bar, "the bar exists");
          t.near(f.bar.w / f.wrap.w, 0.85, 0.01, "85% of the word");
          t.gte(f.bar.y - (f.wrap.y + f.wrap.h), 24 - 0.5, "a gap of at least 24 px below the word box");
          t.near(f.bar.x + f.bar.w / 2, f.wrap.x + f.wrap.w / 2, 1, "centred under the word");
          t.lte(f.bar.y + f.bar.h, f.art.y + f.art.h + 0.5, "inside the anchor box");
          const mirrored = await t.art.evaluate((sel) => !!document.querySelector(sel + " [data-part=kashida] g[transform]"), r.sel);
          t.eq(mirrored, rtl, "the polygon is mirrored for RTL (x runs from the reading start)");
          t.eq((await t.art.safe(r)).violations, [], "safe()");
        }
        const none = await renderFit(t.art, WORD("الهوك", "solid"), at("poster", "base", 560));
        t.eq((await t.art.evaluate(facts, none.sel)).bar, null, "no bar unless the plan asks");
        const stk = await renderFit(t.art, WORD("احفظ", "sticker"), at("poster", "base", 560, { slide: slide(["kashida"]) }));
        t.eq((await t.art.evaluate(facts, stk.sel)).bar, null, "a sticker carries no bar");
        const tall = await renderFit(t.art, WORD("الهوك", "solid"), at("poster", "base", 300, { slide: slide(["kashida"]) }));
        t.eq(tall, null, "the bar's 72 px come out of the box: 300 px no longer holds a 220 px word");
      }
    },
    {
      name: "fallback: when the sticker probe fails (word.support.sticker = false) the word is solid on a sticker tile (owner with fill and border), one label, still fit and painter-safe",
      async run(t) {
        await prepare(t.art, { quick: true });
        t.eq(await t.art.evaluate(() => CS.art.word.support.sticker), true, "shipped verdict");
        await t.art.evaluate(() => { CS.art.word.support.sticker = false; });
        try {
          const r = await renderFit(t.art, WORD("احفظ", "sticker"), at("creator", "base", 560));
          t.ok(r, "still builds");
          t.eq(r.labels.map((l) => l.index), [0], "one label, no copies");
          const o = r.boxes.filter((b) => b.kind === "owner");
          t.eq(o.length, 1); t.eq(o[0].id, "t"); t.eq(r.boxes.find((b) => b.kind === "text").ownerOf, "t", "the text is inside the tile");
          const f = await t.art.evaluate((sel) => { const w = document.querySelector(sel + " [data-part=word]"), c = getComputedStyle(w); return { owner: w.getAttribute("data-owner"), bg: c.backgroundColor, border: c.borderTopWidth, shadow: c.boxShadow, text: [...w.querySelectorAll("[data-slot=art]")].length }; }, r.sel);
          t.eq(f.owner, "1"); t.ok(f.bg !== "rgba(0, 0, 0, 0)", "paper fill"); t.ok(parseFloat(f.border) > 0, "outline"); t.ok(f.shadow !== "none", "hard shadow"); t.eq(f.text, 1);
          t.ok(r.fit.ok, "fit ok");
          t.eq((await t.art.safe(r, { content: true })).violations, [], "safe()");
          const p = await parity(t.art, r);
          t.gte(p.slide, FLOOR, "tile: slide parity"); t.gte(p.anchor, FLOOR, `tile: anchor parity ${p.anchor.toFixed(4)} (the probe's floor: a fallback the probe rejects is not accepted here either)`);
        } finally { await t.art.evaluate(() => { CS.art.word.support.sticker = true; }); }
        const back = await t.art.render(WORD("احفظ", "sticker"), { ...at("creator", "base", 560), png: false });
        t.eq(back.labels.length, 3, "the flag is restored: the sticker is back");
      }
    },
    {
      name: "the probe judges the flag the page was given and puts it back: measure and probe from support.sticker true and from false, and after a build that throws; the verdict check reads the shipped value",
      async run(t) {
        await prepare(t.art, { quick: true });
        const sub = { presets: ["creator"], tones: ["base"] }, get = () => t.art.evaluate(() => CS.art.word.support.sticker), set = (v) => t.art.evaluate((v) => { CS.art.word.support.sticker = v; }, v);
        t.eq(await get(), true, "shipped flag");
        try {
          for (const start of [true, false]) for (const fallback of [false, true]) {
            await set(start);
            const m = await measure(t.art, { fallback, ...sub });
            t.eq(m.cases.length, 1, "one case measured");
            t.eq(await get(), start, `measure(fallback ${fallback}) from ${start}: the flag is what it was`);
            let err = null;
            try { await measure(t.art, { fallback, word: "", ...sub }); } catch (e) { err = e; }
            t.ok(err && /did not build/.test(err.message), `an empty word does not build, measure throws (${err && err.message})`);
            t.eq(await get(), start, `measure(fallback ${fallback}) from ${start}: put back after the throw`);
          }
          for (const start of [true, false]) {
            await set(start);
            const res = await probe(t.art, { quick: true, ...sub });
            t.eq(res.shipped, start, `probe from ${start}: shipped is the flag the page had, not what a measurement left behind`);
            t.eq(await get(), start, `probe from ${start}: the flag is still ${start}`);
            t.eq(verdict(res.sticker), "ok", "the sticker measures ok on creator");
            t.eq(agrees(verdict(res.sticker), res.shipped), start, `probe from ${start}: it agrees with a shipped true and reports a mismatch for a shipped false`);
          }
        } finally { await set(true); }
        t.eq([agrees("ok", true), agrees("ok", false), agrees("fail", true), agrees("fail", false)], [true, false, false, true], "ok <=> support.sticker true");
      }
    },
    {
      name: "both painters draw the word alike (SSIM >= 0.98 on the complete slide and on the anchor crop): solid, struck, kashida, sticker x creator, poster, swiss x base, field; the shipped probe verdict agrees with support.sticker",
      async run(t) {
        await prepare(t.art, { quick: true });
        const worst = [];
        for (const [style, preset, tone, marks] of [["solid", "creator", "base"], ["struck", "poster", "base"], ["solid", "poster", "invert", ["kashida"]], ["sticker", "creator", "base"], ["sticker", "creator", "field"], ["sticker", "poster", "base"], ["sticker", "swiss", "invert"], ["sticker", "swiss", "field"]]) {
          const r = await renderFit(t.art, WORD("احفظ", style), at(preset, tone, 560, { slide: { id: "s05", type: "item", visual: { marks: marks || [] } } }));
          if (style === "struck") t.eq((await settleSlide(t.art, r, { doodle: "pen" })).marks.length, 1, "the strike is on the slide before the painters compare it");
          const p = await parity(t.art, r);
          t.gte(p.slide, FLOOR, `${style} ${preset} ${tone}: slide ${p.slide.toFixed(4)}`); t.gte(p.anchor, FLOOR, `${style} ${preset} ${tone}: anchor ${p.anchor.toFixed(4)}`);
          worst.push(p.anchor);
        }
        const wr = await renderFit(t.art, WORD("لازم مصمم", "struck"), at("creator", "base", 640));
        t.eq((await settleSlide(t.art, wr, { doodle: "marker" })).marks.length, 2, "a strike through each of the two lines is on the slide");
        const wp = await parity(t.art, wr);
        t.gte(wp.slide, FLOOR, `struck two lines: slide ${wp.slide.toFixed(4)}`); t.gte(wp.anchor, FLOOR, `struck two lines: anchor ${wp.anchor.toFixed(4)}`);
        const m = await measure(t.art, { word: "احفظ" });
        t.eq(verdict(m), "ok", `probe verdict ${verdict(m)} (min slide ${m.min.slide.toFixed(4)}, anchor ${m.min.anchor.toFixed(4)}) must equal support.sticker = true`);
      }
    },
    {
      name: "the same input gives the same bytes (all three styles, both directions, twice); labelsOnly returns the labels of the full build",
      async run(t) {
        await prepare(t.art, { quick: true });
        for (const style of ["solid", "sticker", "struck"]) for (const rtl of [true, false]) {
          const o = { ...at("creator", "base", 560), rtl, png: false }, a = await t.art.render(WORD("احفظ", style), o), b = await t.art.render(WORD("احفظ", style), o);
          t.eq(a.html, b.html, `${style} rtl ${rtl}: same bytes`); t.eq(a.boxes, b.boxes);
          const only = await t.art.render(WORD("احفظ", style), { ...o, labelsOnly: true });
          t.eq(only.html, "", "labelsOnly builds no element"); t.eq(only.labels, a.labels, `${style}: the labels the hook (and CS.visual.expected) sees`);
          t.eq(a.labels.map((l) => l.role), a.labels.map(() => "word"));
        }
        t.eq((await t.art.render(WORD("احفظ", "sticker"), { ...at("creator", "base", 560), png: false })).labels.map((l) => l.index), [0, 1, 2], "index 0 is the ink word, 1 and 2 are the ring and the shadow");
      }
    },
    {
      name: "boxes: the word is text with anchor:true inside the anchor box; a tile is an owner holding it; marks are not painted space; budgets and rules of the source (A8, 5 KiB)",
      async run(t) {
        await prepare(t.art, { quick: true });
        for (const style of ["solid", "sticker", "struck"]) {
          const r = await t.art.render(WORD("احفظ", style), { ...at("creator", "base", 560), png: false }), b = r.boxes[0];
          t.eq(b.kind, "text"); t.eq(b.anchor, true);
          t.ok(b.x >= -0.5 && b.y >= -0.5 && b.x + b.w <= 852.5 && b.y + b.h <= 560.5, `${style}: the text box lies inside the anchor box ${JSON.stringify(b)}`);
          for (const x of r.boxes) t.ok(["text", "owner", "mark", "ink"].includes(x.kind));
        }
        t.ok(!/Math\.random|Date\b|performance\./.test(SRC), "A8: no clock and no Math.random");
        t.ok(!/"data-mark"|rotate\(|52%/.test(SRC), "A13: the builder places no mark that depends on where the words landed (the strike is the settle pass's)");
        t.ok(!/\bdocument\.(body|getElement|query)|getBoundingClientRect|getComputedStyle/.test(SRC), "a builder never reads layout");
        t.ok(!/analytics|lucide\.dev/i.test(SRC), "GR-4 and GR-5 words");
        t.lte(Buffer.byteLength(SRC, "utf8"), 5 * 1024, "src/art/word.js is within its 5 KiB budget");
      }
    },
    {
      name: "contact sheet: sticker, solid, struck (one word and wrapped, with the settled strike), kashida and the tile fallback on creator and poster (1x and the 130 px profile size), safe and read back by the package",
      async run(t) {
        await prepare(t.art, { quick: true });
        const V = [
          ["احفظ", "sticker", "creator", "base"], ["احفظ", "sticker", "creator", "field"], ["احفظ", "sticker", "creator", "invert"], ["احفظ", "sticker", "poster", "base"],
          ["الهوك", "solid", "poster", "base", ["kashida"]], ["خرافة", "struck", "creator", "base"], ["لازم مصمم", "solid", "creator", "invert", [], 640], ["8", "sticker", "poster", "invert"], ["احفظ", "tile", "creator", "base"], ["لازم مصمم", "struck", "poster", "base", [], 640]
        ];
        const pngs = [];
        for (const [word, style, preset, tone, marks, h] of V) {
          if (style === "tile") await t.art.evaluate(() => { CS.art.word.support.sticker = false; });
          try {
            const r = await renderFit(t.art, WORD(word, style === "tile" ? "sticker" : style), at(preset, tone, h || 440, { slide: { id: "s05", type: "item", visual: { marks: marks || [] } } }));
            t.ok(r && r.fit.ok, `${word} ${style} ${preset} ${tone} builds and fits`);
            if (style === "struck") { const st = await settleSlide(t.art, r, { doodle: preset === "creator" ? "marker" : "pen" }); t.eq([st.marks.length, st.lines.length > 0], [r.labels.length, true], `${word}: one strike per line, drawn by the settle pass`); }
            t.eq((await t.art.safe(r, { content: true })).violations, [], `${style} ${preset} ${tone}: safe()`);
            pngs.push(await t.art.shot(r.sel + " .cs-art"));
          } finally { await t.art.evaluate(() => { CS.art.word.support.sticker = true; }); }
        }
        const sheet = await montage(t.art, pngs, { cols: 3, width: 852 });
        t.art.save("art/word.png", sheet);
        const w = 3 * 852 + 4 * 12;
        t.art.save("art/word-130.png", await t.art.small(sheet, Math.round(w * 130 / 1080)));
        t.ok(sheet.length > 20000, "the sheet is not blank");
      }
    }
  ]
};
