// cs-motion: topic spotting, recommend(), every recipe's Timeline, the Arabic and motion rules, metaphors.
import fs from "node:fs";
import path from "node:path";
import { openGeometryPage } from "../../../geometry/page.mjs";
const FIXTURE_RECIPE = [
  ["counter", "counter"], ["mistakes", "story"], ["urgent", "drop-clock"], ["spread", "map-dots"],
  ["myth", "stamp"], ["steps", "reorder"], ["opinion", "highlight-sweep"], ["opinion", "calm"], ["heritage", "story"],
  ["opinion", "curtain"], ["opinion", "zoom"], ["counter", "notify"], ["english", "notify"], ["opinion", "split"]
];

export default {
  module: "motion",
  tests: [
    {
      name: "recipes: the four new stories ship in v1; only morph, cash-wipe and scale stay deferred",
      async run(t) {
        const r = await t.page.evaluate(() => ({ shipped: CS.motion.list({ shippedOnly: true }).map((x) => x.id), all: CS.motion.list().map((x) => x.id), alias: CS.motion.alias, meta: CS.motion.recipes.counter,
          metaphors: Object.keys(CS.motion.metaphors), tween: [CS.motion.tween.ease("out-cubic", 1), CS.motion.tween.lerp(0, 10, 0.25), CS.motion.tween.counter(0, 413, 0.5, 0)] }));
        for (const id of ["calm", "counter", "highlight-sweep", "stamp", "reorder", "story", "map-dots", "drop-clock", "curtain", "zoom", "notify", "split", "none"]) t.ok(r.shipped.includes(id), id + " ships in 1.0");
        for (const id of ["morph", "cash-wipe", "scale"]) t.ok(r.all.includes(id) && !r.shipped.includes(id), id + " is listed but not shipped");
        t.eq(r.alias["counter-roll"], "counter"); t.eq(r.alias["word-cascade"], "highlight-sweep"); t.eq(r.alias["racing-clock"], "drop-clock");
        t.eq(r.meta.feel, "calm"); t.ok(r.meta.label.ar && r.meta.label.en, "bilingual label");
        t.gte(r.metaphors.length, 6, "at least six metaphors"); t.ok(r.metaphors.includes("heartbeat") && r.metaphors.includes("clock") && r.metaphors.includes("dots"), "heartbeat, clock, dots");
        t.eq(r.tween, [1, 2.5, 207], "tween helpers");
      }
    },
    {
      name: "new stories: real six-preset matrix, RTL/LTR, 1–3 lines, sub/no-sub, photo/mock/no-media, 5/6 seconds",
      async run(t) {
        const h = await openGeometryPage(), skill = path.join(process.cwd(), "plugins/carousel-studio/skills/carousel-design");
        try {
          for (const chunk of ["paint", "motion", "hf"]) await h.page.addScriptTag({ content: fs.readFileSync(path.join(skill, "runtime/cs-" + chunk + ".js"), "utf8") });
          const base = JSON.parse(fs.readFileSync("tests/cover-baseline/baseline/input/spec.json", "utf8"));
          const r = await h.page.evaluate(async (base) => {
            const brand = JSON.parse(document.getElementById("cs-brand").textContent); if (brand.visual) { delete brand.visual.fonts; delete brand.visual.palette; }
            const problems = []; let builds = 0, cases = 0, notifyMinPadding = Infinity, notifyWordChecks = 0;
            for (const preset of ["creator", "poster", "notebook", "heritage", "interface", "swiss"]) for (const en of [false, true]) for (const lines of [1, 2, 3]) for (const feature of [0, 1, 2]) {
              const spec = JSON.parse(JSON.stringify(base)); spec.style = { presetId: preset + "@1.0" }; delete spec.frozen;
              spec.locale = { dialect: en ? "en" : "eg", register: "dialect", digits: "western", appLanguage: en ? "en" : "ar", swipeCue: en ? "arrow-ltr" : "arrow-rtl" };
              const realCover = !en && (lines === 3 ? (preset === "notebook" ? ["انهيار سهم", "Reddit…", "والسبب؟"] : preset === "poster" ? ["Claude", "بيراجع…", "والمحامي؟"] : null) : lines === 2 && preset === "creator" ? ["==90 دقيقة==…", "على إنستجرام!"] : null);
              const headline = (realCover || (en ? ["A ==change==", "for your work", "starts here"] : ["فكرة ==جديدة==", "بتغير شغلك", "من أول يوم"])).slice(0, lines).join("\n");
              spec.slides[0] = { id: "s01", n: 1, type: "cover", headline, kicker: en ? "For you" : "ليك", ...(feature === 1 ? { sub: en ? "An idea worth sharing." : "فكرة تستاهل المشاركة." } : {}) };
              if (feature) spec.slides[0].media = { slot: feature === 1 ? "photo" : "ui", assetId: "motion-photo", ...(feature === 2 ? { frame: "phone" } : {}) };
              spec.assets = [{ id: "motion-photo", kind: "photo", mime: "image/svg+xml", ref: "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><rect width="400" height="200" fill="#698577"/><circle cx="200" cy="100" r="50" fill="#ece2b8"/></svg>') }];
              const deck = await CS.core.render.deck(spec, brand, { mode: "export", useFrozen: false, slideIds: ["s01"] });
              try {
                const el = deck.slides[0].el;
                for (const recipe of ["curtain", "zoom", "notify", "split"]) for (const seconds of [5, 6]) {
                  const label = [preset, en ? "en" : "ar", lines, feature, recipe, seconds].join("/"), tl = CS.motion.build(el, { recipe, seconds, seed: 7 });
                  builds++; problems.push(...CS.motion.validate(el, tl).map((p) => label + ": " + p));
                  if (tl.recipe !== recipe || JSON.stringify(tl) !== JSON.stringify(CS.motion.build(el, { recipe, seconds, seed: 7 }))) problems.push(label + ": fallback or nondeterminism");
                  const root = el.getBoundingClientRect(), scale = root.width / el.offsetWidth;
                  const ink = (node) => { const b = node.getBoundingClientRect(), height = b.height / scale, h = Math.min(height, parseFloat(getComputedStyle(node).fontSize) * 0.85); return { x: (b.left - root.left) / scale, y: (b.top - root.top) / scale + (height - h) / 2, w: b.width / scale, h }; };
                  // Browser font boxes conservatively include Arabic dots/descenders; the old 0.85em estimate does not.
                  const headlineInk = (node) => { const range = document.createRange(); range.selectNodeContents(node); const a = node.getBoundingClientRect(), b = range.getBoundingClientRect(); return { x: (Math.min(a.left, b.left) - root.left) / scale, y: (Math.min(a.top, b.top) - root.top) / scale, w: (Math.max(a.right, b.right) - Math.min(a.left, b.left)) / scale, h: (Math.max(a.bottom, b.bottom) - Math.min(a.top, b.top)) / scale }; };
                  const gap = (a, b) => Math.max(b.x - a.x - a.w, a.x - b.x - b.w, b.y - a.y - a.h, a.y - b.y - b.h);
                  const notifyOverlaps = [];
                  for (const o of (tl.overlays || []).filter((o) => /^curtain-|^notify-bubble$/.test(o.id))) {
                    const members = recipe === "notify" ? Array.from(el.querySelectorAll('.w[data-m-slot="headline"]')) : tl.tracks.filter((x) => x.id.startsWith(o.id + ".word-") || x.id === o.id + ".reveal").map((x) => el.querySelector(x.sel));
                    const a = { ...o.rect };
                    if (recipe === "notify") { if (!en) a.x -= a.w * 0.03; a.y -= a.h * 0.03; a.w *= 1.03; a.h *= 1.03; }
                    for (const other of el.querySelectorAll(".cs-content .w")) if (!members.some((m) => m === other || m.contains(other))) {
                      if (gap(a, ink(other)) < 11.5) {
                        if (recipe === "notify") notifyOverlaps.push(other);
                        else problems.push(label + ": panel overlaps other ink: " + o.id + "/" + other.textContent);
                      }
                    }
                    const header = el.querySelector(".cs-header").getBoundingClientRect(), footer = el.querySelector(".cs-footer").getBoundingClientRect();
                    if (recipe === "notify") {
                      if (a.x < 15.5 || a.y < 15.5 || a.x + a.w > 1064.5 || a.y + a.h > el.offsetHeight - 15.5) problems.push(label + ": bubble escapes the 16 px slide inset");
                    } else if (a.y < (header.bottom - root.top) / scale + 11.5 || a.y + a.h > (footer.top - root.top) / scale - 11.5 || a.x < 44.5 || a.x + a.w > 1035.5) problems.push(label + ": panel escapes the chrome-safe area");
                  }
                  const engine = CS.motion.hf.engine.attach(el, tl, { driver: "style" });
                  if (recipe === "notify") {
                    const pop = tl.tracks.find((x) => x.id === "notify-pop"), typed = pop.t1 + pop.then[0].dt, gone = typed + pop.then[1].dt;
                    for (const time of [pop.t1, typed, (typed + gone) / 2, gone - 0.001]) {
                      engine.seek(time);
                      for (const other of notifyOverlaps) {
                        let opacity = 1; for (let node = other; node && node !== el; node = node.parentElement) opacity *= +getComputedStyle(node).opacity;
                        if (opacity > 0.001) problems.push(label + ": containment override covers visible context: " + other.textContent);
                      }
                    }
                    engine.seek(typed);
                    const o = tl.overlays.find((o) => o.id === "notify-bubble"), svg = el.querySelector('[data-m-ov="notify-bubble"] svg'), path = svg.querySelector("path");
                    const bodyH = +(svg.getAttribute("data-body-height") || o.rect.h - 16), padding = +(svg.getAttribute("data-padding") || 14), outline = +path.getAttribute("stroke-width");
                    if (padding < 14 || Math.abs(o.rect.h - bodyH - 16) > 0.1) problems.push(label + ": missing full body padding or external tail");
                    for (const s of [1, 1.03]) {
                      const x = o.rect.x - (en ? 0 : o.rect.w * (s - 1)), y = o.rect.y - o.rect.h * (s - 1);
                      const body = { x: x + outline * s, y: y + outline * s, right: x + (o.rect.w - outline) * s, bottom: y + (bodyH - outline) * s };
                      for (const word of el.querySelectorAll('.w[data-m-slot="headline"]')) {
                        const b = headlineInk(word), gaps = [b.x - body.x, b.y - body.y, body.right - b.x - b.w, body.bottom - b.y - b.h];
                        notifyMinPadding = Math.min(notifyMinPadding, ...gaps); notifyWordChecks++;
                        if (Math.min(...gaps) < padding - 0.15) problems.push(label + ": bubble does not contain " + word.textContent + " at scale " + s + ": " + JSON.stringify(gaps));
                        // Test each side's clearance against the drawn path, including rounded corners, not a fictitious rectangle.
                        const p = Math.max(0, padding - 0.2);
                        for (const [xx, yy] of [[b.x - p, b.y], [b.x - p, b.y + b.h], [b.x + b.w + p, b.y], [b.x + b.w + p, b.y + b.h], [b.x, b.y - p], [b.x + b.w, b.y - p], [b.x, b.y + b.h + p], [b.x + b.w, b.y + b.h + p]]) {
                          const point = new DOMPoint((xx - x) / s, (yy - y) / s);
                          if (!path.isPointInFill(point) || path.isPointInStroke(point)) problems.push(label + ": outline cuts padded ink: " + word.textContent + "/" + s);
                        }
                      }
                    }
                    if (realCover) {
                      const align = getComputedStyle(el.querySelector('.cs-ln[data-m-slot="headline"]')).textAlign;
                      if (preset === "notebook" && !["right", "start"].includes(align) || preset === "poster" && align !== "center") problems.push(label + ": real-cover alignment was lost");
                    }
                  }
                  if (recipe === "split") {
                    const tracks = tl.tracks.filter((x) => /^split-word-/.test(x.id)), k = (tl.times.settleBy - 0.75) / 4.85, at = (x) => 0.75 + (x - 0.75) * k;
                    for (const track of tracks) {
                      if (Math.abs(track.t1 - at(1.8)) > 0.002 || track.ease !== "in-cubic") problems.push(label + ": collision is not an accelerating 1.8 s meet");
                      if (track.then[0].to.scale !== 1.05 || Math.abs(track.then[0].to.x) !== 10 || track.then[1].to.scale !== 1 || track.then[1].to.x !== 0) problems.push(label + ": missing single impact/recoil");
                    }
                    if (tl.tracks.filter((x) => /^split-visible-|^split-mark-/.test(x.id)).some((x) => x.t1 > at(0.95) + 0.002)) problems.push(label + ": halves are not opaque by 0.95 s");
                    const extents = [];
                    for (const sign of [-1, 1]) {
                      const group = tracks.filter((x) => Math.sign(x.from.x) === sign), nodes = group.flatMap((x) => { const node = el.querySelector(x.sel); return node.matches(".w") ? [node] : Array.from(node.querySelectorAll(".w")); });
                      if (!nodes.length) continue;
                      const boxes = nodes.map(ink), left = Math.min(...boxes.map((b) => b.x)), right = Math.max(...boxes.map((b) => b.x + b.w));
                      extents.push({ w: right - left, h: Math.max(...boxes.map((b) => b.y + b.h)) - Math.min(...boxes.map((b) => b.y)) });
                      const content = el.querySelector('[data-m-layer="content"]').getBoundingClientRect(), edge = sign > 0 ? (content.right - root.left) / scale - left + 1 : right - (content.left - root.left) / scale + 1;
                      const limit = Math.min(...boxes.map((b) => sign > 0 ? 1080 - b.x : b.x + b.w)), distance = Math.min(Math.max(380, edge), limit);
                      if (group.some((x) => Math.abs(Math.abs(x.from.x) - distance) > 0.1)) problems.push(label + ": group is drifting instead of starting at its side/slide clamp");
                    }
                    const divider = tl.overlays.find((o) => o.id === "split-divider");
                    if (divider) {
                      const stroke = el.querySelector('[data-m-ov="split-divider"] path');
                      if (+stroke.getAttribute("stroke-width") < 6) problems.push(label + ": divider is too thin");
                      const axis = divider.rect.w === 8 ? "h" : "w";
                      if (divider.rect[axis] < Math.min(...extents.map((r) => r[axis])) - 0.2) problems.push(label + ": divider is shorter than the shorter half");
                      engine.seek(at(1.4));
                      if (+getComputedStyle(stroke.parentNode.parentNode).opacity < 0.99) problems.push(label + ": divider is absent during approach");
                      engine.seek(at(2.0));
                      if (+getComputedStyle(stroke.parentNode.parentNode).opacity > 0) problems.push(label + ": divider remains after impact");
                    }
                  }
                  const layerZ = parseInt(getComputedStyle(el.querySelector('[data-m-layer="content"]')).zIndex, 10) || 0;
                  for (const o of (tl.overlays || []).filter((o) => /^curtain-|^notify-bubble$/.test(o.id))) if (+getComputedStyle(el.querySelector('[data-m-ov="' + o.id + '"]')).zIndex < layerZ) problems.push(label + ": panel hidden below the content/background stack");
                  if (recipe === "zoom" && seconds === 6 && lines === 2 && feature === 0) {
                    engine.seek(1.0);
                    const frame = await CS.paint.toCanvas(el, { scale: 1 }), mask = await CS.paint.textMask(el), a = frame.getContext("2d").getImageData(70, 300, 940, 850).data, b = mask.getContext("2d").getImageData(70, 300, 940, 850).data;
                    let inkPixels = 0; for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 12) inkPixels++;
                    if (inkPixels < 1000) problems.push(label + ": camera target is absent from painted pixels (" + inkPixels + ")");
                  }
                  if (recipe === "curtain" && seconds === 6 && preset === "notebook") {
                    const line = el.querySelector('.cs-ln[data-m-slot="headline"]'), word = line.querySelector(".w"), at = tl.tracks.find((x) => x.id === "curtain-hero-0.reveal");
                    engine.seek(0); const before = word.getBoundingClientRect(); engine.seek(at.t0 + (at.t1 - at.t0) / 2); const after = word.getBoundingClientRect();
                    if (Math.abs(after.width - before.width) > 0.1 || Math.abs((after.left - before.left) / scale - (en ? -15 : 15)) > 0.1) problems.push(label + ": notebook line reshaped during the reveal");
                  }
                  for (const time of [0, 0.55, 0.75, 1.5, 2.7, tl.times.settleBy, seconds - 1 / 30]) engine.seek(time);
                  engine.destroy();
                  if (el.querySelector('[data-m-ov], [data-m-viewport]')) problems.push(label + ": runtime left temporary DOM behind");
                }
                cases++;
              } finally { deck.dispose(); }
            }
            return { problems, builds, cases, notifyMinPadding, notifyWordChecks };
          }, base);
          console.log("# notify matrix: " + JSON.stringify({ minimumPadding: r.notifyMinPadding, wordChecks: r.notifyWordChecks }));
          t.eq(r.problems, [], "all real layouts build valid deterministic motion and clean up"); t.eq(r.cases, 108); t.eq(r.builds, 864);
        } finally { await h.close(); }
      }
    },
    {
      name: "notify: slide-edge fallback reduces outline before padding and never trims its own ink",
      async run(t) {
        const r = await t.page.evaluate(async () => {
          const results = [];
          for (const en of [false, true]) {
            const spec = JSON.parse(JSON.stringify(CS_FIXTURES[en ? "english" : "opinion"]));
            spec.slides[0] = { id: "s01", n: 1, type: "cover", headline: en ? "Hello" : "سلام" };
            const deck = await CS.core.render.deck(spec, null, { slideIds: ["s01"] }), el = deck.slides[0].el, word = el.querySelector('.w[data-m-slot="headline"]');
            const root = el.getBoundingClientRect(); word.style.position = "relative"; word.style.fontSize = "48px";
            const before = word.getBoundingClientRect(), target = en ? 1052 - before.width : 30;
            word.style.left = (target - before.left + root.left) + "px";
            const b = word.getBoundingClientRect(), h = Math.min(b.height, 48 * 0.85), ink = { x: b.left - root.left, y: b.top - root.top + (b.height - h) / 2, w: b.width, h };
            const tl = CS.motion.build(el, { recipe: "notify" }), o = tl.overlays.find((o) => o.id === "notify-bubble"), engine = CS.motion.hf.engine.attach(el, tl, { driver: "style" });
            const svg = el.querySelector('[data-m-ov="notify-bubble"] svg'), outline = +svg.querySelector("path").getAttribute("stroke-width"), padding = +svg.getAttribute("data-padding"), bodyH = +svg.getAttribute("data-body-height");
            const gaps = [], edges = [];
            for (const s of [1, 1.03]) {
              const x = o.rect.x - (en ? 0 : o.rect.w * (s - 1)), y = o.rect.y - o.rect.h * (s - 1);
              gaps.push(ink.x - x - outline * s, ink.y - y - outline * s, x + (o.rect.w - outline) * s - ink.x - ink.w, y + (bodyH - outline) * s - ink.y - ink.h);
              edges.push(x, y, 1080 - x - o.rect.w * s, 1440 - y - o.rect.h * s);
            }
            results.push({ en, outline, padding, minimumGap: Math.min(...gaps), minimumEdge: Math.min(...edges), tail: o.rect.h - bodyH, problems: CS.motion.validate(el, tl) });
            engine.destroy(); deck.dispose();
          }
          return results;
        });
        console.log("# notify reduced-padding cases: " + JSON.stringify(r));
        for (const x of r) { t.lte(x.outline, 1); t.ok(x.padding > 0 && x.padding < 14); t.gte(x.minimumGap, x.padding - 0.1); t.gte(x.minimumEdge, 15.9); t.near(x.tail, 16, 0.1); t.eq(x.problems, []); }
      }
    },
    {
      name: "split: first marker includes its word; fallback is by line then word half, in both directions",
      async run(t) {
        const r = await t.page.evaluate(async () => {
          const out = [];
          for (const [headline, cut, en] of [["الأداة بقت استوديو", 2, false], ["Old → new", 2, true], ["كلمة أولى\nكلمة تانية", 2, false], ["One two three four", 2, true], ["كلمة", 1, false]]) {
            const spec = JSON.parse(JSON.stringify(CS_FIXTURES[en ? "english" : "opinion"])); spec.slides[0].headline = headline;
            const deck = await CS.core.render.deck(spec, null, { slideIds: ["s01"] }), el = deck.slides[0].el, tl = CS.motion.build(el, { recipe: "split" });
            const tracks = tl.tracks.filter((x) => /^split-word-/.test(x.id));
            out.push({ right: tracks.map((x, i) => (x.from.x > 0) === (en ? i >= cut : i < cut)), times: tracks.map((x) => [x.t0, x.t1]), scale: tracks.every((x) => x.then[0].to.scale === 1.05 && x.then[1].to.scale === 1), problems: CS.motion.validate(el, tl) });
            deck.dispose();
          }
          return out;
        });
        for (const x of r) { t.ok(x.right.every(Boolean)); t.ok(x.times.every((v) => JSON.stringify(v) === JSON.stringify(x.times[0])), "groups travel simultaneously"); t.ok(x.scale); t.eq(x.problems, []); }
      }
    },
    {
      name: "all existing recipes: without a kicker, even a fully marked title starts rebuilding at resetEnd",
      async run(t) {
        const r = await t.page.evaluate(async () => {
          const out = [];
          for (const recipe of ["calm", "counter", "highlight-sweep", "stamp", "reorder", "story", "map-dots", "drop-clock"]) {
            const spec = JSON.parse(JSON.stringify(CS_FIXTURES.opinion)); spec.slides[0] = { id: "s01", n: 1, type: "cover", headline: "==فكرة واضحة تستاهل وقتك==" };
            const deck = await CS.core.render.deck(spec, null, { slideIds: ["s01"] }), el = deck.slides[0].el, tl = CS.motion.build(el, { recipe });
            const enter = tl.tracks.filter((x) => { const c = x.from && x.from.clipInset; return x.from && (x.from.opacity === 0 || c && c[1] + c[3] >= 99.9); });
            out.push({ recipe, first: Math.min(...enter.map((x) => x.t0)), problems: CS.motion.validate(el, tl) }); deck.dispose();
          }
          return out;
        });
        for (const x of r) { t.near(x.first, 0.75, 0.002, x.recipe + " no empty entrance beat"); t.eq(x.problems, []); }
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
        for (const [fx, recipe] of Object.entries({ counter: "counter", mistakes: "story", urgent: "drop-clock", spread: "map-dots", myth: "stamp", steps: "reorder", opinion: "zoom", heritage: "story" })) t.eq(r[fx].recipe, recipe, "recommend for " + fx);
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
              frames: tl.frames, duration: tl.duration, times: T, tracks: tl.tracks.length, v: tl.v, firstEntrance: Math.min(...tl.tracks.filter((x) => x.from && (x.from.opacity === 0 || /^curtain-|^zoom-camera$/.test(x.id))).map((x) => x.t0)),
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
      name: "recommend(): bilingual story rules, first-match precedence and no change tag for ordinary conjunctions",
      async run(t) {
        const cases = [
          ["الأداة بقت استوديو", "split"], ["Old name → New name", "split"], ["Then vs now", "split"],
          ["رسميًا دخلت أداة جديدة", "curtain"], ["A new launch", "curtain"],
          ["Claude أعلنت تحديث", "notify"], ["ChatGPT update", "notify"], ["عندك فكرة؟", "notify"], ["Are you ready?", "notify"],
          ["Photoshop update", "notify"], ["عام٢٠٢٦", "highlight-sweep"], ["عام2026", "highlight-sweep"],
          ["إنت لسه مستني؟", "notify"], ["هل لديك حساب؟", "notify"], ["عندك مشكلة", "highlight-sweep"],
          ["إنت ==غلطان!==", "zoom"], ["A ==different== perspective", "zoom"], ["A ==very different new perspective==", "curtain"],
          ["لا شبكة ولا ملف", "highlight-sweep"], ["Now 12 tools", "split"], ["5 new tools", "counter"],
          ["How to launch Claude", "reorder"], ["Claude launch", "notify"], ["آخر فرصة بقت ساعات", "drop-clock"],
          ["خبر من غير اسم منتج", "story"], ["قصة من الحياة", "story"], ["وقت كافي", "highlight-sweep"]
        ];
        const r = await t.page.evaluate((cases) => cases.map(([headline]) => {
          const x = CS.motion.recommend({ slides: [{ type: "cover", headline }] });
          return { recipe: x.recipe, why: x.why, tags: CS.motion.detectTopics(headline).tags };
        }), cases);
        r.forEach((x, i) => { t.eq(x.recipe, cases[i][1], cases[i][0]); t.ok(x.why.ar && x.why.en, "bilingual reason"); });
        t.ok(!r[cases.findIndex(([s]) => s === "لا شبكة ولا ملف")].tags.includes("change"), "ولا is not a change marker");
        const outsideCover = await t.page.evaluate(() => CS.motion.recommend({ architecture: "news", brief: { topic: "Claude update" }, captionPack: { firstLine: "Gemini update" }, slides: [{ type: "cover", headline: "More possibilities for creators" }] }).recipe);
        t.eq(outsideCover, "story", "only a product named on the cover selects notify");
        const changedCover = await t.page.evaluate(() => [
          CS.motion.recommend({ architecture: "news", hook: { cover: "Claude update" }, slides: [{ type: "cover", headline: "More possibilities for creators" }] }).recipe,
          CS.motion.recommend({ architecture: "news", hook: { cover: "More possibilities for creators" }, slides: [{ type: "cover", headline: "ChatGPT update" }] }).recipe
        ]);
        t.eq(changedCover, ["story", "notify"], "the typeset cover takes priority over an older hook");
      }
    },
    {
      name: "counter: the surrounding headline has landed when counting starts; large values never count from zero",
      async run(t) {
        const r = await t.page.evaluate(async () => {
          const out = [];
          for (const recipe of ["counter", "story"]) for (const headline of ["413 ==مشترك== معانا", "٤١٣ ==مشترك==", "6 أدوات للمصمم"]) {
            const spec = JSON.parse(JSON.stringify(CS_FIXTURES.counter)); spec.slides[0].headline = headline; delete spec.slides[0].kicker;
            const deck = await CS.core.render.deck(spec, null, { slideIds: ["s01"] }), el = deck.slides[0].el;
            const tl = CS.motion.build(el, { recipe }), count = tl.counters[0], engine = CS.motion.hf.engine.attach(el, tl, { driver: "style" });
            const words = Array.from(el.querySelectorAll('.w[data-m-slot="headline"]')), number = el.querySelector('[data-m-count="1"]').closest(".w");
            const visible = (w) => { for (let n = w; n && n !== el; n = n.parentElement) { const c = getComputedStyle(n); if (+c.opacity < 0.9 || /100%/.test(c.clipPath)) return false; } return true; };
            engine.seek(count.t0 + 0.04);
            out.push({ from: count.from, to: count.to, others: words.filter((w) => w !== number).every(visible), problems: CS.motion.validate(el, tl) });
            engine.destroy(); deck.dispose();
          }
          return out;
        });
        for (const x of r) { t.ok(x.others, "the count has its headline context"); t.eq(x.problems, []); if (x.to > 9) { t.gte(x.from, x.to * 0.3); t.lte(x.from, x.to * 0.35); } }
      }
    },
    {
      name: "story center: a short symbol hands over to the headline by 1.5 seconds even without kicker or numeral",
      async run(t) {
        const r = await t.page.evaluate(async () => {
          const spec = JSON.parse(JSON.stringify(CS_FIXTURES.opinion));
          spec.slides[0] = { id: "s01", n: 1, type: "cover", headline: "أفكار ==واضحة==\nلناس بتصمم\nكل يوم", sub: "الفكرة قبل الشكل.\nوالمعنى هو الأساس." };
          const deck = await CS.core.render.deck(spec, null, { slideIds: ["s01"] }), el = deck.slides[0].el;
          const tl = CS.motion.build(el, { recipe: "story" }), hero = Array.from(el.querySelectorAll('.w[data-m-slot="headline"]'));
          const first = Math.min(...tl.tracks.filter((x) => hero.some((w) => w.matches(x.sel))).map((x) => x.t0));
          const end = Math.max(...tl.tracks.filter((x) => /^story-/.test(x.id)).map((x) => x.t1 + (x.then || []).reduce((s, y) => s + y.dt, 0)));
          const out = { mode: tl.mode, first, end, problems: CS.motion.validate(el, tl) }; deck.dispose(); return out;
        });
        t.eq(r.mode, "center"); t.lte(r.first, 1.5); t.lte(r.first - 0.75, 0.6); t.lte(r.end, 1.8); t.eq(r.problems, []);
      }
    },
    {
      name: "curtain clearance, notify containment over hidden later slots, and overlays clear before settleBy",
      async run(t) {
        const r = await t.page.evaluate(async () => {
          const out = [];
          for (const recipe of ["curtain", "notify"]) for (const fx of ["counter", "english", "heritage"]) {
            const deck = await CS.core.render.deck(CS_FIXTURES[fx], null, { slideIds: ["s01"] }), el = deck.slides[0].el;
            const tl = CS.motion.build(el, { recipe }), root = el.getBoundingClientRect();
            const ink = (w) => { const b = w.getBoundingClientRect(), h = Math.min(b.height, parseFloat(getComputedStyle(w).fontSize) * 0.85); return { x: b.left - root.left, y: b.top - root.top + (b.height - h) / 2, w: b.width, h }; };
            const gap = (a, b) => Math.max(b.x - a.x - a.w, a.x - b.x - b.w, b.y - a.y - a.h, a.y - b.y - b.h);
            const words = Array.from(el.querySelectorAll(".cs-content .w")).map((w) => ({ ...ink(w), slot: w.getAttribute("data-m-slot") })), engine = CS.motion.hf.engine.attach(el, tl, { driver: "style" });
            const panels = (tl.overlays || []).filter((o) => recipe === "curtain" ? /^curtain-/.test(o.id) : o.id === "notify-bubble");
            const gaps = panels.map((o) => {
              const a = o.rect, slot = /^curtain-slot-/.test(o.id) ? el.querySelectorAll('[data-m="sub"], [data-m="media"]')[+o.id.split("-").pop()].getAttribute("data-m") : null;
              const others = words.filter((b) => b.slot !== slot && !(b.x >= a.x - 1 && b.x + b.w <= a.x + a.w + 1 && b.y >= a.y - 1 && b.y + b.h <= a.y + a.h + 1));
              return Math.min(999, ...others.map((b) => gap(a, b)));
            });
            let hidden = true;
            if (recipe === "notify") {
              const pop = tl.tracks.find((x) => x.id === "notify-pop");
              engine.seek(pop.t1 + pop.then[0].dt);
              for (const word of el.querySelectorAll('.cs-content .w:not([data-m-slot="headline"])')) {
                let opacity = 1; for (let node = word; node && node !== el; node = node.parentElement) opacity *= +getComputedStyle(node).opacity;
                if (opacity > 0.001) hidden = false;
              }
            }
            engine.seek(5.55);
            const cleared = panels.every((o) => +getComputedStyle(el.querySelector('[data-m-ov="' + o.id + '"]')).opacity === 0);
            out.push({ recipe, fx, count: panels.length, gap: Math.min(...gaps), hidden, cleared, text: (tl.overlays || []).some((o) => /<text\b/.test(o.html)), problems: CS.motion.validate(el, tl) });
            engine.destroy(); deck.dispose();
          }
          return out;
        });
        for (const x of r) { t.gte(x.count, 1, x.recipe + " panels exist"); if (x.recipe === "curtain") t.gte(x.gap, 11.5, x.recipe + "/" + x.fx + " clearance"); else t.ok(x.hidden, "later context stays hidden while containment takes priority"); t.ok(x.cleared); t.ok(!x.text); t.eq(x.problems, []); }
      }
    },
    {
      name: "zoom: the camera preserves chrome pixels through reset, push and pull; the target is visible and centered",
      async run(t) {
        const r = await t.page.evaluate(async () => {
          const deck = await CS.core.render.deck(CS_FIXTURES.opinion, null, { slideIds: ["s01"] }), el = deck.slides[0].el;
          const poster = await CS.paint.toCanvas(el, { scale: 1 }), tl = CS.motion.build(el, { recipe: "zoom" }), engine = CS.motion.hf.engine.attach(el, tl, { driver: "style" });
          const top = el.querySelector(".cs-header").getBoundingClientRect().bottom - el.getBoundingClientRect().top;
          const bottom = el.querySelector(".cs-footer").getBoundingClientRect().top - el.getBoundingClientRect().top;
          const crop = (canvas, y, h) => { const c = document.createElement("canvas"); c.width = 1080; c.height = h; c.getContext("2d").drawImage(canvas, 0, y, 1080, h, 0, 0, 1080, h); return c; };
          const a = crop(poster, 0, Math.ceil(top)), b = crop(poster, Math.floor(bottom), 1440 - Math.floor(bottom)); let score = 1;
          for (const time of [0.45, 0.55, 0.65, 0.75, 1.1, 1.55, 1.8, 2.2, 2.55]) {
            engine.seek(time); const canvas = await CS.paint.toCanvas(el, { scale: 1 });
            score = Math.min(score, CS.paint.metrics.ssim(a, crop(canvas, 0, a.height)), CS.paint.metrics.ssim(b, crop(canvas, Math.floor(bottom), b.height)));
          }
          engine.seek(0.8); const target = el.querySelector("mark.cs-em .w"), root = el.getBoundingClientRect(), rect = target.getBoundingClientRect();
          const out = { recipe: tl.recipe, score, opacity: +getComputedStyle(target.closest("mark")).opacity, targetY: rect.top - root.top, targetBottom: rect.bottom - root.top, top, bottom, problems: CS.motion.validate(el, tl) };
          engine.destroy(); deck.dispose(); return out;
        });
        t.eq(r.recipe, "zoom"); t.gte(r.score, 0.99999, "header and footer stay pixel-identical"); t.eq(r.opacity, 1); t.gte(r.targetY, r.top); t.lte(r.targetBottom, r.bottom); t.eq(r.problems, []);
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
        for (const k of Object.keys(r)) { t.ok(["band", "center"].includes(r[k].mode), k + " placement mode"); t.gte(r[k].overlay.length, 1); t.ok(r[k].overlay.every((o) => o.hasSvg && o.parse), k + " overlays are well-formed inline SVG"); }
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
