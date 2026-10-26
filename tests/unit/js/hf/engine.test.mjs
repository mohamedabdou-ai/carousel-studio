// cs-hf: the timeline engine (easing, the poster-first state function, counters, install / HyperFrames hooks, the two drivers).
export default {
  module: "hf",
  tests: [
    {
      name: "easing: endpoints, monotonic, out-back overshoot at most 6 %",
      async run(t) {
        const r = await t.page.evaluate(() => {
          const e = CS.motion.hf.engine, out = {};
          e.EASE_NAMES.forEach((n) => {
            let prev = -1, monotonic = true, max = 0;
            for (let i = 0; i <= 200; i++) { const v = e.ease(n, i / 200); if (v < prev - 1e-9 && n !== "out-back") monotonic = false; prev = v; max = Math.max(max, v); }
            out[n] = { start: e.ease(n, 0), end: e.ease(n, 1), monotonic, max };
          });
          return { out, names: e.EASE_NAMES, clamped: [e.ease("out-cubic", -3), e.ease("out-cubic", 7), e.ease("nope", 0.5)] };
        });
        t.eq(r.names.length, 11, "the ease list of CONTRACT 5.6");
        for (const [n, v] of Object.entries(r.out)) { t.near(v.start, 0, 1e-9, n + " start"); t.near(v.end, 1, 1e-9, n + " end"); t.ok(v.monotonic, n + " must be monotonic"); }
        t.lte(r.out["out-back"].max, 1.06, "out-back overshoot");
        t.gte(r.out["out-back"].max, 1.03, "out-back should overshoot a little");
        t.eq(r.clamped, [0, 1, 0.5], "ease clamps t to 0..1 and unknown names are linear");
      }
    },
    {
      name: "poster-first state function: rest, break-apart, hold, build, rest",
      async run(t) {
        const r = await t.page.evaluate(() => {
          const root = document.createElement("section"); root.className = "cs-slide"; root.setAttribute("dir", "rtl");
          root.style.cssText = "position:absolute;left:0;top:0;width:600px;height:400px";
          root.innerHTML = '<div id="a" data-m="kicker" style="position:absolute;left:10px;top:10px;width:100px;height:30px">A</div>';
          document.body.appendChild(root);
          const tl = { v: 1, recipe: "t", feel: "calm", seed: 1, duration: 6, fps: 30, frames: 180, times: { holdIn: 0.4, resetEnd: 0.75, settleBy: 5.6 }, counters: [],
            tracks: [{ id: "a", sel: "#a", from: { opacity: 0, y: 40 }, t0: 1, t1: 2, ease: "linear", reset: { ease: "linear", delay: 0 } }] };
          const eng = CS.motion.hf.engine.attach(root, tl, {});
          const el = root.querySelector("#a"), snap = (time) => { eng.seek(time); return { o: el.style.opacity, tr: el.style.transform, group: el.getAttribute("data-m-group") }; };
          const out = { rest0: snap(0), rest04: snap(0.4), mid: snap(0.575), held: snap(0.9), build: snap(1.5), done: snap(2.5), last: snap(5.9), back: snap(0.9) };
          eng.destroy(); root.remove();
          return out;
        });
        t.eq(r.rest0, { o: "", tr: "", group: "opacity" }, "frame 0 is the poster (no inline opacity or transform)");
        t.eq(r.rest04.o, "", "the hold-in time is still the poster");
        t.ok(parseFloat(r.mid.o) > 0.05 && parseFloat(r.mid.o) < 0.95, "mid break-apart is partly faded: " + r.mid.o);
        t.eq(r.held.o, "0", "held at `from` after the break-apart");
        t.near(parseFloat(r.build.o), 0.5, 0.001, "linear build at the midpoint");
        t.ok(/translate\(0px,\s*20px\)/.test(r.build.tr), "y interpolates 40 -> 0: " + r.build.tr);
        t.eq(r.done.o, "", "after the build the element is at rest");
        t.eq(r.last, { o: "", tr: "", group: "opacity" }, "the last frame is the poster");
        t.eq(r.back, r.held, "seeking backwards gives the same state (pure function of t)");
      }
    },
    {
      name: "seek order does not matter",
      async run(t) {
        const r = await t.page.evaluate(async () => {
          const deck = await CS.core.render.deck(CS_FIXTURES.mistakes, null, { slideIds: ["s01"] });
          const el = deck.slides[0].el, tl = CS.motion.build(el, { recipe: "story" });
          const eng = CS.motion.hf.engine.attach(el, tl, {});
          const state = () => Array.from(el.querySelectorAll("[data-m-id]")).map((n) => n.style.cssText).join("|") + "#" + Array.from(el.querySelectorAll("[data-m-count]")).map((n) => n.textContent).join(",");
          const times = [0.1, 0.9, 1.4, 2.2, 3.1, 4.4, 5.0, 5.8], forward = {};
          times.forEach((x) => { eng.seek(x); forward[x] = state(); });
          const shuffled = [5.0, 0.9, 5.8, 2.2, 0.1, 4.4, 1.4, 3.1], mismatches = [];
          shuffled.forEach((x) => { eng.seek(x); if (state() !== forward[x]) mismatches.push(x); });
          eng.destroy(); deck.dispose();
          return mismatches;
        });
        t.eq(r, [], "states differ when seeking in another order");
      }
    },
    {
      name: "then-chain: the swipe-cue nudge returns to rest by itself",
      async run(t) {
        const r = await t.page.evaluate(() => {
          const root = document.createElement("section"); root.className = "cs-slide"; root.setAttribute("dir", "rtl");
          root.style.cssText = "position:absolute;left:0;top:0;width:600px;height:400px";
          root.innerHTML = '<span id="n" data-m="swipe" style="position:absolute;left:0;top:0">x</span>';
          document.body.appendChild(root);
          const tl = { v: 1, recipe: "t", feel: "calm", seed: 1, duration: 6, fps: 30, frames: 180, times: { holdIn: 0.4, resetEnd: 0.75, settleBy: 5.6 }, counters: [],
            tracks: [{ id: "n", sel: "#n", from: { x: 0 }, to: { x: -20 }, t0: 4, t1: 4.2, ease: "linear", then: [{ dt: 0.4, to: { x: 0 }, ease: "linear" }, { dt: 0.2, to: { x: -10 }, ease: "linear" }, { dt: 0.2, to: { x: 0 }, ease: "linear" }] }] };
          const eng = CS.motion.hf.engine.attach(root, tl, {}), el = root.querySelector("#n"), x = (time) => { eng.seek(time); const m = /translate\(([-\d.]+)px/.exec(el.style.transform); return m ? parseFloat(m[1]) : 0; };
          const out = { start: x(3.9), mid: x(4.1), peak: x(4.2), back: x(4.4), second: x(4.7), peak2: x(4.8), end: x(5.0), after: x(5.2) };
          eng.destroy(); root.remove();
          return out;
        });
        t.near(r.mid, -10, 0.01, "halfway to the peak"); t.near(r.peak, -20, 0.01, "peak");
        t.near(r.back, -10, 0.01, "halfway back"); t.near(r.second, -5, 0.01, "second lean builds"); t.near(r.peak2, -10, 0.01, "second, smaller peak"); t.near(r.end, 0, 0.01, "settled"); t.eq(r.after, 0, "rest");
        t.eq(r.start, 0, "before the nudge");
      }
    },
    {
      name: "counters: western and Arabic-Indic digits, grouping, decimals, prefix and suffix, width reserved, text restored",
      async run(t) {
        const r = await t.page.evaluate(() => {
          const e = CS.motion.hf.engine;
          const parse = (s) => { const p = e.parseNumberText(s); return p && { prefix: p.prefix, suffix: p.suffix, value: p.value, decimals: p.decimals, arabic: p.arabic, grouped: p.grouped }; };
          const fmt = (s, v) => e.formatNumber(v, e.parseNumberText(s));
          const out = { parse1: parse("$1,200.50"), parse2: parse("٨٨٪"), parse3: parse("5 أخطاء"), none: parse("بدون"), f1: fmt("$1,200.50", 987.5), f2: fmt("٨٨٪", 41), f3: fmt("413", 7), f4: fmt("1,200", 45000) };
          const root = document.createElement("section"); root.className = "cs-slide"; root.setAttribute("dir", "rtl");
          root.style.cssText = "position:absolute;left:0;top:0;width:600px;height:400px;font:40px sans-serif";
          root.innerHTML = '<p>لـ <span class="w" id="num" data-m-count="1">٤١٣</span> نقطة</p>';
          document.body.appendChild(root);
          const num = root.querySelector("#num"), w0 = num.getBoundingClientRect().width;
          const tl = { v: 1, recipe: "t", feel: "calm", seed: 1, duration: 6, fps: 30, frames: 180, times: { holdIn: 0.4, resetEnd: 0.75, settleBy: 5.6 }, tracks: [],
            counters: [{ id: "c", sel: "[data-m-count]", from: 0, to: 413, t0: 1, t1: 2, ease: "linear", decimals: 0 }] };
          const eng = CS.motion.hf.engine.attach(root, tl, {}), texts = {};
          [0, 0.6, 0.9, 1.5, 2.5, 5.7].forEach((x) => { eng.seek(x); texts[x] = num.textContent; });
          eng.seek(0.9); const widthDuring = num.getBoundingClientRect().width;
          eng.destroy(); const after = { text: num.textContent, display: num.style.display, minWidth: num.style.minWidth };
          root.remove();
          return Object.assign(out, { texts, w0, widthDuring, after });
        });
        t.eq(r.parse1, { prefix: "$", suffix: "", value: 1200.5, decimals: 2, arabic: false, grouped: true }, "$1,200.50");
        t.eq(r.parse2, { prefix: "", suffix: "٪", value: 88, decimals: 0, arabic: true, grouped: false }, "٨٨٪");
        t.eq(r.parse3.value, 5, "first number of a phrase"); t.eq(r.none, null, "text without digits");
        t.eq([r.f1, r.f2, r.f3, r.f4], ["$987.50", "٤١٪", "7", "45,000"], "formatting keeps prefix, suffix, digit system, grouping and decimals");
        t.eq(r.texts[0], "٤١٣", "frame 0 shows the poster number"); t.eq(r.texts[0.6], "٤١٣", "break-apart keeps the number");
        t.eq(r.texts[0.9], "٠", "held at the start value in Arabic-Indic digits"); t.eq(r.texts[1.5], "٢٠٧", "halfway: 206.5 rounds to 207");
        t.eq(r.texts[2.5], "٤١٣", "after the count"); t.eq(r.texts[5.7], "٤١٣", "rest");
        t.near(r.widthDuring, r.w0, 0.6, "the counter keeps its final width while counting");
        t.eq(r.after, { text: "٤١٣", display: "", minWidth: "" }, "destroy restores text and styles");
      }
    },
    {
      name: "dash draws a stroke from nothing to complete and hides it at zero",
      async run(t) {
        const r = await t.page.evaluate(() => {
          const root = document.createElement("section"); root.className = "cs-slide"; root.setAttribute("dir", "rtl");
          root.style.cssText = "position:absolute;left:0;top:0;width:600px;height:400px";
          root.innerHTML = '<svg width="300" height="100" viewBox="0 0 300 100"><path id="p" data-m="stroke" pathLength="1" d="M0 50H300" stroke="red" stroke-width="10"/></svg>';
          document.body.appendChild(root);
          const tl = { v: 1, recipe: "t", feel: "calm", seed: 1, duration: 6, fps: 30, frames: 180, times: { holdIn: 0.4, resetEnd: 0.75, settleBy: 5.6 }, counters: [],
            tracks: [{ id: "p", sel: "#p", from: { dash: 0 }, to: { dash: 1 }, t0: 1, t1: 2, ease: "linear" }] };
          const eng = CS.motion.hf.engine.attach(root, tl, {}), p = root.querySelector("#p"), s = (x) => { eng.seek(x); return { off: p.style.strokeDashoffset, vis: p.style.visibility, arr: p.style.strokeDasharray }; };
          const out = { rest: s(0), held: s(0.9), half: s(1.5), full: s(2.5) };
          eng.destroy(); root.remove();
          return out;
        });
        t.eq(r.held.vis, "hidden", "no round-cap dot while the stroke has not started"); t.eq(r.held.off, "1");
        t.eq(r.half.off, "0.5"); t.eq(r.half.vis, ""); t.eq(r.full.off, "", "rest: the original (undrawn-offset) style");
        t.eq(r.held.arr.replace(/,/g, ""), "1 2", "a gap longer than the path: nothing wraps around");
      }
    },
    {
      name: "install: registry, HyperFrames controller methods, hf-seek event, fonts-ready flag, clean destroy",
      async run(t) {
        const r = await t.page.evaluate(async () => {
          const deck = await CS.core.render.deck(CS_FIXTURES.counter, null, { slideIds: ["s01"] });
          const el = deck.slides[0].el, before = el.outerHTML, tl = CS.motion.build(el, { recipe: "counter" }), built = el.outerHTML;
          const ctrl = CS.motion.hf.install(document, tl, "cs-test");
          await ctrl.ready;
          const out = { registered: window.__timelines && window.__timelines["cs-test"] === ctrl, ready: window.__csHfReady, duration: ctrl.duration(), paused: ctrl.paused(), methods: ["duration", "time", "seek", "totalTime", "progress", "pause", "play", "paused"].every((m) => typeof ctrl[m] === "function") };
          ctrl.totalTime(2); out.time = ctrl.time(); out.progress = ctrl.progress();
          window.dispatchEvent(new CustomEvent("hf-seek", { detail: { time: 3, waitUntil() {} } })); out.afterEvent = ctrl.time();
          ctrl.progress(0.5); out.progressSet = ctrl.time();
          ctrl.destroy();
          out.removed = !(window.__timelines && window.__timelines["cs-test"]);
          out.clean = el.outerHTML === built;
          out.overlays = el.querySelectorAll("[data-m-ov]").length;
          deck.dispose();
          return out;
        });
        t.ok(r.registered, "window.__timelines[id]"); t.ok(r.ready, "__csHfReady after fonts"); t.eq(r.duration, 6); t.ok(r.paused, "paused() is true: the engine, not a clock, moves time");
        t.ok(r.methods, "controller API"); t.eq(r.time, 2); t.near(r.progress, 2 / 6, 1e-9); t.eq(r.afterEvent, 3, "hf-seek moves the timeline");
        t.eq(r.progressSet, 3, "progress(0.5)"); t.ok(r.removed, "destroy unregisters"); t.ok(r.clean, "destroy restores every inline style"); t.eq(r.overlays, 0);
      }
    },
    {
      name: "style driver and waapi driver agree on every animated property",
      async run(t) {
        const r = await t.page.evaluate(async () => {
          const make = async () => { const deck = await CS.core.render.deck(CS_FIXTURES.mistakes, null, { slideIds: ["s01"] }); return { deck, el: deck.slides[0].el }; };
          const a = await make(), b = await make();
          const tl = CS.motion.build(a.el, { recipe: "story" }), tl2 = CS.motion.build(b.el, { recipe: "story" });
          const ea = CS.motion.hf.engine.attach(a.el, tl, { driver: "style" }), eb = CS.motion.hf.engine.attach(b.el, tl2, { driver: "waapi" });
          const read = (el) => Array.from(el.querySelectorAll("[data-m-id],[data-m-ov] *")).map((n) => { const cs = getComputedStyle(n); return { o: parseFloat(cs.opacity), tr: cs.transform === "none" ? [1, 0, 0, 1, 0, 0] : cs.transform.match(/[-\d.e]+/g).map(Number), clip: cs.clipPath }; });
          let worst = 0, clipMismatch = 0, count = 0;
          [0.5, 0.9, 1.3, 1.8, 2.4, 3.2, 4.1, 4.4].forEach((x) => {
            ea.seek(x); eb.seek(x);
            const ra = read(a.el), rb = read(b.el);
            ra.forEach((s, i) => { count++; worst = Math.max(worst, Math.abs(s.o - rb[i].o) * 100, ...s.tr.map((v, k) => Math.abs(v - rb[i].tr[k]))); if (s.clip !== rb[i].clip && !(s.clip === "none" && /inset\(0/.test(rb[i].clip))) clipMismatch++; });
          });
          const driver = eb.driver;
          ea.destroy(); eb.destroy(); a.deck.dispose(); b.deck.dispose();
          return { worst, clipMismatch, count, driver };
        });
        t.eq(r.driver, "waapi", "the waapi driver was used");
        t.lte(r.worst, 0.6, "style and waapi differ (opacity in %, transform in px)");
        t.eq(r.clipMismatch, 0, "clip-path agrees");
        t.gte(r.count, 50, "enough elements were compared");
      }
    }
  ]
};
