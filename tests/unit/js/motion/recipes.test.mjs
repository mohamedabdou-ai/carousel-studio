// cs-motion: topic spotting, recommend(), every recipe's Timeline, the Arabic and motion rules, metaphors.
const FIXTURE_RECIPE = [
  ["counter", "counter"], ["mistakes", "story"], ["urgent", "drop-clock"], ["spread", "map-dots"],
  ["myth", "stamp"], ["steps", "reorder"], ["opinion", "highlight-sweep"], ["opinion", "calm"], ["heritage", "story"]
];

export default {
  module: "motion",
  tests: [
    {
      name: "recipes: six shipped in v1 plus the named variants, the rest marked 1.1",
      async run(t) {
        const r = await t.page.evaluate(() => ({ shipped: CS.motion.list({ shippedOnly: true }).map((x) => x.id), all: CS.motion.list().map((x) => x.id), alias: CS.motion.alias, meta: CS.motion.recipes.counter,
          metaphors: Object.keys(CS.motion.metaphors), tween: [CS.motion.tween.ease("out-cubic", 1), CS.motion.tween.lerp(0, 10, 0.25), CS.motion.tween.counter(0, 413, 0.5, 0)] }));
        for (const id of ["calm", "counter", "highlight-sweep", "stamp", "reorder", "story", "map-dots", "drop-clock", "none"]) t.ok(r.shipped.includes(id), id + " ships in 1.0");
        for (const id of ["morph", "split", "cash-wipe", "scale"]) t.ok(r.all.includes(id) && !r.shipped.includes(id), id + " is listed but not shipped");
        t.eq(r.alias["counter-roll"], "counter"); t.eq(r.alias["word-cascade"], "highlight-sweep"); t.eq(r.alias["racing-clock"], "drop-clock");
        t.eq(r.meta.feel, "calm"); t.ok(r.meta.label.ar && r.meta.label.en, "bilingual label");
        t.gte(r.metaphors.length, 6, "at least six metaphors"); t.ok(r.metaphors.includes("heartbeat") && r.metaphors.includes("clock") && r.metaphors.includes("dots"), "heartbeat, clock, dots");
        t.eq(r.tween, [1, 2.5, 207], "tween helpers");
      }
    },
    {
      name: "topic words per dialect: the ordinary words of each register steer the motion, and a word that means something else in another register does not",
      async run(t) {
        const table = [
          // [register, cover text, tags that must be found, tags that must not be found]
          ["eg", "6 أدوات دول بتغنيك عن المصمم", [], ["spread", "urgency"]],
          ["eg", "5 أدوات توفر وقتك", [], ["urgency"]],
          ["eg", "قرر دلوقتي قبل ما يفوت", ["urgency"], []],
          ["gulf", "لازم تبدأ الحين", ["urgency"], []],
          ["gulf", "شلون تبدأ بدون خبرة", ["steps"], []],
          ["gulf", "دول مجلس التعاون", [], ["spread"]],
          ["levant", "هلق أو ما بتلحق", ["urgency"], []],
          ["levant", "هسا قبل ما يفوت", ["urgency"], []],
          ["levant", "مصاري كتيرة بتروح", ["money"], []],
          ["levant", "خسارة كبيرة بالسوق", ["mistakes"], []],
          ["msa-white", "ينتهي الوقت غدا", ["urgency"], []],
          ["msa-white", "أفضل دول العالم للسفر", ["spread"], []],
          ["msa-white", "كان الوقت كافيا", [], ["urgency"]],
          ["en", "Last chance to join", ["urgency"], []],
          ["en", "Why most launches fail", ["mistakes"], []]
        ];
        const r = await t.page.evaluate((table) => table.map(([reg, text]) => [reg, text, CS.motion.detectTopics(text).tags]), table);
        r.forEach(([reg, text, tags], i) => {
          const [, , want, not] = table[i];
          want.forEach((w) => t.ok(tags.includes(w), `${reg} "${text}" should read as ${w}, got [${tags}]`));
          not.forEach((n) => t.ok(!tags.includes(n), `${reg} "${text}" must not read as ${n}, got [${tags}]`));
        });
      }
    },
    {
      name: "topic detection and recommend(): number-led, mistakes, urgency, spread, decision, steps, default",
      async run(t) {
        const r = await t.page.evaluate(() => {
          const out = {};
          Object.keys(CS_FIXTURES).forEach((k) => { const x = CS.motion.recommend(CS_FIXTURES[k]); out[k] = { recipe: x.recipe, metaphor: x.metaphor, feel: x.feel, why: x.why }; });
          out.tags = CS.motion.detectTopics("بيتموت وبيضيع الوقت، آخر فرصة").tags;
          out.none = CS.motion.detectTopics("كلام عادي جدا").tags;
          out.year = CS.motion.recommend({ hook: { cover: "أفضل أدوات 2026" }, slides: [{ type: "cover", headline: "أفضل أدوات 2026" }] }).recipe;
          return out;
        });
        for (const [fx, recipe] of Object.entries({ counter: "counter", mistakes: "story", urgent: "drop-clock", spread: "map-dots", myth: "stamp", steps: "reorder", opinion: "highlight-sweep", heritage: "story" })) t.eq(r[fx].recipe, recipe, "recommend for " + fx);
        t.eq(r.mistakes.metaphor, "heartbeat", "kills / mistakes -> heartbeat"); t.eq(r.urgent.metaphor, "clock"); t.eq(r.spread.metaphor, "dots");
        t.ok(r.counter.why.ar && r.counter.why.en, "a bilingual reason");
        t.ok(r.tags.includes("mistakes") && r.tags.includes("urgency"), "tags: " + r.tags);
        t.eq(r.none, [], "no tags for plain text");
        t.eq(r.year, "highlight-sweep", "a year is not a number to count up; calm is never the default");
      }
    },
    {
      name: "build(): every recipe on its fixtures gives a valid, deterministic, JSON-serialisable Timeline",
      async run(t) {
        const r = await t.page.evaluate(async (cases) => {
          const out = [];
          for (const [fx, recipe] of cases) {
            const deck = await CS.core.render.deck(CS_FIXTURES[fx], null, { slideIds: ["s01"] });
            const el = deck.slides[0].el, tl = CS.motion.build(el, { recipe }), again = CS.motion.build(el, { recipe });
            const json = JSON.stringify(tl), T = tl.times;
            out.push({ fx, recipe, problems: CS.motion.validate(el, tl), deterministic: json === JSON.stringify(again), roundTrip: JSON.stringify(JSON.parse(json)) === json,
              frames: tl.frames, duration: tl.duration, times: T, tracks: tl.tracks.length, v: tl.v, firstEntrance: Math.min(...tl.tracks.filter((x) => x.from && x.from.opacity === 0).map((x) => x.t0)),
              ends: Math.max(...tl.tracks.map((x) => x.t1 + (x.then || []).reduce((s, y) => s + y.dt, 0))), keys: Array.from(new Set(tl.tracks.flatMap((x) => [x.from, x.to, x.rest].filter(Boolean).flatMap(Object.keys)))), size: json.length });
            deck.dispose();
          }
          return out;
        }, FIXTURE_RECIPE);
        const allowed = ["opacity", "x", "y", "scale", "scaleX", "scaleY", "rotate", "clipInset", "dash"];
        for (const x of r) {
          const id = `${x.fx}/${x.recipe}`;
          t.eq(x.problems, [], id + " validate()"); t.ok(x.deterministic, id + " is deterministic"); t.ok(x.roundTrip, id + " survives JSON");
          t.eq([x.v, x.frames, x.duration], [1, 180, 6], id + " header"); t.eq(x.times, { holdIn: 0.4, resetEnd: 0.75, settleBy: 5.6 }, id + " times");
          t.near(x.firstEntrance, 0.75, 0.002, id + " the first piece enters exactly when the break-apart ends (no dead air)");
          t.lte(x.ends, 5.6 + 0.0005, id + " everything is settled by 5.6 s"); t.ok(x.keys.every((k) => allowed.includes(k)), id + " only whitelisted properties: " + x.keys);
          t.lte(x.size, 60000, id + " timeline stays small");
        }
      }
    },
    {
      name: "build(): 5 s covers shrink the story, unknown ids fall back to calm, reduced motion keeps only opacity",
      async run(t) {
        const r = await t.page.evaluate(async () => {
          const deck = await CS.core.render.deck(CS_FIXTURES.mistakes, null, { slideIds: ["s01"] });
          const el = deck.slides[0].el;
          const five = CS.motion.build(el, { recipe: "story", seconds: 5 }), fb = CS.motion.build(el, { recipe: "morph" }), unk = CS.motion.build(el, { recipe: "nonsense" });
          const reduced = CS.motion.build(el, { recipe: "story", reducedMotion: true }), none = CS.motion.build(el, { recipe: "none" }), alias = CS.motion.build(el, { recipe: "heartbeat" });
          const out = {
            five: { problems: CS.motion.validate(el, five), duration: five.duration, frames: five.frames, settleBy: five.times.settleBy },
            fb: { recipe: fb.recipe, from: fb.fallbackFrom }, unk: { recipe: unk.recipe, from: unk.fallbackFrom },
            reduced: { keys: Array.from(new Set(reduced.tracks.flatMap((x) => Object.keys(x.from || {})))), counters: reduced.counters.length, overlays: (reduced.overlays || []).length, tracks: reduced.tracks.length },
            none: { tracks: none.tracks.length, recipe: none.recipe }, alias: alias.recipe, long: CS.motion.build(el, { recipe: "calm", seconds: 9 }).duration
          };
          deck.dispose();
          return out;
        });
        t.eq(r.five.problems, [], "5 s timeline fits"); t.eq([r.five.duration, r.five.frames], [5, 150]); t.near(r.five.settleBy, 4.6, 0.001, "settleBy = seconds - 0.4");
        t.eq(r.fb, { recipe: "calm", from: "morph" }, "an unshipped recipe falls back to calm"); t.eq(r.unk, { recipe: "calm", from: "nonsense" });
        t.eq(r.reduced.keys, ["opacity"], "reduced motion: opacity only"); t.eq([r.reduced.counters, r.reduced.overlays], [0, 0]); t.gte(r.reduced.tracks, 1);
        t.eq(r.none, { tracks: 0, recipe: "none" }); t.eq(r.alias, "story", "heartbeat is the story recipe's metaphor"); t.eq(r.long, 6, "seconds are clamped to 5..6");
      }
    },
    {
      name: "story: the metaphor follows the topic, lives in an overlay and leaves no trace on the slide",
      async run(t) {
        const r = await t.page.evaluate(async () => {
          const out = {};
          for (const [fx, recipe, metaphor] of [["mistakes", "story", null], ["urgent", "story", null], ["spread", "story", null], ["mistakes", "story", "bars"]]) {
            const deck = await CS.core.render.deck(CS_FIXTURES[fx], null, { slideIds: ["s01"] });
            const el = deck.slides[0].el, tl = CS.motion.build(el, { recipe, metaphor: metaphor || undefined });
            out[fx + "/" + (metaphor || "auto")] = { metaphor: tl.metaphor, mode: tl.mode, overlay: (tl.overlays || []).map((o) => ({ id: o.id, w: o.rect.w, hasSvg: /^<svg/.test(o.html), parse: !new DOMParser().parseFromString(o.html, "image/svg+xml").querySelector("parsererror") })) };
            deck.dispose();
          }
          return out;
        });
        t.eq(r["mistakes/auto"].metaphor, "heartbeat"); t.eq(r["urgent/auto"].metaphor, "clock"); t.eq(r["spread/auto"].metaphor, "dots"); t.eq(r["mistakes/bars"].metaphor, "bars", "an explicit metaphor wins");
        for (const k of Object.keys(r)) { t.ok(["band", "center"].includes(r[k].mode), k + " placement mode"); t.eq(r[k].overlay.length, 1); t.ok(r[k].overlay[0].hasSvg && r[k].overlay[0].parse, k + " overlay is well-formed inline SVG"); }
      }
    },
    {
      name: "metaphors: inline SVG, drawn paths use pathLength and data-m, colours resolved, no text inside",
      async run(t) {
        const r = await t.page.evaluate(() => Object.values(CS.motion.metaphors).map((m) => {
          const doc = new DOMParser().parseFromString(m.svg, "image/svg+xml"), made = m.make({ rtl: true, colors: { accent: "#E3262B", ink: "#111111", muted: "#8A8A8A" } });
          return { id: m.id, label: !!(m.label.ar && m.label.en), topics: m.topics.length, parsed: !doc.querySelector("parsererror"), text: doc.querySelectorAll("text").length, vars: /var\(/.test(m.svg), strokes: doc.querySelectorAll('[data-m="stroke"]').length,
            pathLength: Array.from(doc.querySelectorAll('[data-m="stroke"]')).every((n) => n.getAttribute("pathLength") === "1"), choreo: typeof made.choreo, ltrVsRtl: made.html !== m.svg || m.id === "check" };
        }));
        for (const m of r) { t.ok(m.label && m.topics > 0, m.id + " label and topics"); t.ok(m.parsed, m.id + " parses"); t.eq(m.text, 0, m.id + " has no <text>: AI and engine never draw words in symbols"); t.ok(!m.vars, m.id + " has no CSS variables (works in every painter)"); t.ok(m.pathLength, m.id + " strokes use pathLength=1"); t.eq(m.choreo, "function"); }
        t.ok(r.filter((m) => m.strokes > 0).length >= 4, "most metaphors are drawn with strokes");
      }
    },
    {
      name: "stamp: the ring keeps clear of every other word and of the header rules, stays through the story, and is gone before the poster rests",
      async run(t) {
        const r = await t.page.evaluate(async () => {
          const deck = await CS.core.render.deck(CS_FIXTURES.myth, null, { slideIds: ["s01"] });
          const el = deck.slides[0].el, tl = CS.motion.build(el, { recipe: "stamp" }), ring = (tl.overlays || []).find((o) => o.id === "stamp-ring");
          const root = el.getBoundingClientRect(), scale = root.width / (el.offsetWidth || root.width);
          const ink = (w) => { const b = w.getBoundingClientRect(), fs = parseFloat(getComputedStyle(w).fontSize) || b.height / 1.3, h = Math.min(b.height / scale, fs * 0.85), cy = (b.top - root.top) / scale + b.height / scale / 2; return { x: (b.left - root.left) / scale, y: cy - h / 2, w: b.width / scale, h: h }; };
          const gapOf = (a, b) => Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w), b.y - (a.y + a.h), a.y - (b.y + b.h));
          const rect = ring ? ring.rect : null;
          const others = Array.from(el.querySelectorAll(".cs-content .w")).map(ink).filter((w) => !(rect && w.x >= rect.x + 20 && w.x + w.w <= rect.x + rect.w - 20 && w.y >= rect.y && w.y + w.h <= rect.y + rect.h));
          const fade = tl.tracks.find((x) => x.id === "stamp-ring.fade");
          const out = { rect, minGap: others.length ? Math.min(...others.map((w) => gapOf(rect, w))) : 999, headerRules: rect ? rect.y : 0,
            fade: fade ? { in: fade.t0, out: fade.t1 + fade.then.reduce((s, y) => s + y.dt, 0) } : null, problems: CS.motion.validate(el, tl), slam: tl.tracks.filter((x) => /^slam-/.test(x.id)).map((x) => ({ from: x.from.scale, then: (x.then || []).map((y) => y.to.scale) })) };
          deck.dispose();
          return out;
        });
        t.ok(r.rect, "the stamp draws a ring");
        t.gte(r.minGap, 11.5, "the ring keeps about 12 px from every other word (" + r.minGap + ")");
        t.gte(r.headerRules, 270 + 11, "and from the header rules, which end by y 270 (" + r.headerRules + ")");
        t.gte(r.fade.out - r.fade.in, 2.4, "the ring stays on screen for at least 2.4 s (" + (r.fade.out - r.fade.in) + ")");
        t.lte(r.fade.out, 5.6, "and has faded by 5.6 s, so the last frame is frame 0");
        t.eq(r.problems, [], "the timeline validates");
        t.ok(r.slam.length > 0 && r.slam.every((s) => s.from === 1.55 && s.then.length === 2 && s.then[0] === 0.97 && s.then[1] === 1), "the word drops from 1.55 with one 3% squash and settles at 1");
      }
    },
    {
      name: "Arabic and motion rules hold at every sampled frame: words and lines only, opacity on groups, no forbidden properties",
      async run(t) {
        const r = await t.page.evaluate(async (cases) => {
          const bad = [];
          for (const [fx, recipe] of cases) {
            const deck = await CS.core.render.deck(CS_FIXTURES[fx], null, { slideIds: ["s01"] });
            const el = deck.slides[0].el, tl = CS.motion.build(el, { recipe });
            const eng = CS.motion.hf.engine.attach(el, tl, { driver: "style" });
            const selectors = tl.tracks.map((x) => x.sel).concat(tl.counters.map((x) => x.sel));
            selectors.forEach((s) => { if (/\[data-ch|\.ch\b|letter/i.test(s)) bad.push(`${fx}/${recipe}: per-letter selector ${s}`); });
            for (const x of [0.5, 1.0, 1.6, 2.3, 3.4, 5.0]) {
              eng.seek(x);
              el.querySelectorAll("*").forEach((n) => {
                const cs = getComputedStyle(n), own = n.style;
                if (own.filter || own.backdropFilter || own.mixBlendMode || own.letterSpacing || own.fontSize && n.hasAttribute("data-m-id")) bad.push(`${fx}/${recipe}@${x}: forbidden inline style on ${n.tagName}`);
                if (n.closest("svg")) return;
                const hasText = Array.from(n.childNodes).some((c) => c.nodeType === 3 && c.nodeValue.trim());
                if (hasText && parseFloat(cs.opacity) < 1 && !n.hasAttribute("data-m-group") && !n.closest('[data-m-group="opacity"]')) bad.push(`${fx}/${recipe}@${x}: text node with opacity outside a group`);
                if (cs.letterSpacing !== "normal" && cs.letterSpacing !== "0px") bad.push(`${fx}/${recipe}@${x}: letter-spacing`);
                if (cs.fontStyle !== "normal") bad.push(`${fx}/${recipe}@${x}: italic`);
              });
            }
            eng.destroy(); deck.dispose();
          }
          return bad;
        }, FIXTURE_RECIPE);
        t.eq(r, [], "rule violations");
      }
    }
  ]
};
