// tests/unit/js/visual/settle.test.mjs · CS.visual.settle (package A9, spec 3.5, rule A13): text-bound marks placed after fit and freeze.apply from the rects of [data-mark-target]
// elements, rotation aware, one target for the clones of a wrapped span (and only for those: separate phrases asking for the same mark stay separate), the preset's art.marks
// honoured before the seeded choice and by the direction-specific arrows, stored through CS.core.freeze.visual and reused with no layout read at all (rects, computed style and
// every layout-dependent dimension getter are counted). The page is the art harness (privately built cs-core, cs-art, cs-visual and the test fonts); the marks library is injected as the block cs-art-marks.
// Identity: wrapLinesBy clones a span per .cs-ln with cloneNode(false), so the clones carry the same attributes (data-mark-id included) and nothing else. settle merges clones that follow each other
// across a line break (the first closes a line, the next opens the one after), or that share a data-mark-id. Known limit: two UNSTAMPED targets with the same mark that abut exactly across
// a break look like the clones of one wrapped span; a producer that can emit both stamps data-mark-id (request to E2a / compose).
// Run: node --test tests/unit/js/visual/settle.test.mjs      (CS_ART_OUT=DIR also saves the contact sheet marks-settle.png and marks-settle-130.png; CS_TMP=DIR moves the private chunk build when the system temp is not writable)
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { withArt } from "../art/harness.mjs";
import { loadMarks } from "../marks/lib.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const LIB = loadMarks();
let art, release, done;

/** In-page helpers: window.__st. Words are .w units like compose makes them; a slide is a 1080 x 1350 .cs-slide in RTL. */
function setup() {
  const css = document.createElement("style");
  css.setAttribute("data-cs-slide-css", "");
  css.textContent = ".cs-slide .w{white-space:nowrap}.cs-slide .cs-ln{display:block;white-space:nowrap}.cs-slide .cs-em{display:inline-block;background:none;color:inherit}.st-t{position:absolute;margin:0;text-align:start;line-height:1.5;font-weight:800}.cs-slide.st-bare{width:1080px;height:1440px}";
  document.head.appendChild(css);
  const W = (s) => s.split(" ").map((w) => `<span class="w">${w}</span>`).join(" ");
  const rel = (el, root) => { const r = el.getBoundingClientRect(), q = root.getBoundingClientRect(); return { x: r.left - q.left, y: r.top - q.top, w: r.width, h: r.height }; };
  const calls = [];
  window.__st = {
    W, rel, calls,
    slide(id, o) {
      o = o || {};
      const c = __art.ctx({ preset: o.preset || "creator", tone: o.tone || "base" }), t = c.tokens, root = document.createElement("section");
      root.className = "cs-slide"; root.id = id; root.setAttribute("data-cs-slide", id); root.setAttribute("data-tone", c.tone); root.setAttribute("dir", "rtl"); root.setAttribute("lang", "ar");
      root.setAttribute("style", `--cs-bg:${t.bg};--cs-surface:${t.surface};--cs-ink:${t.ink};--cs-accent:${t.accent};position:absolute;left:${o.x || 0}px;top:${o.y || 0}px;width:${o.w || 1080}px;height:${o.h || 1350}px;background-color:${t.bg};color:${t.ink}`);
      root.innerHTML = o.html; document.body.appendChild(root);
      CS.core.freeze.visual.set(id, null);
      return root;
    },
    cx(root, o) {
      o = o || {};
      const tone = root.getAttribute("data-tone"), c = __art.ctx({ preset: o.preset || "creator", tone }), a = Object.assign({}, c.art, o.art);
      return { tokens: { tones: { [tone]: c.tokens }, art: a }, art: a, spec: { id: o.deck || "deck-1" }, zone: o.zone || { x: 114, y: 261, w: 852, h: 998 }, id: root.id, data: { marks: CS.visual._.block("cs-art-marks") } };
    },
    card(x, y, w, h) { return `<div class="cs-art" data-owner="1" style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;background:#FFD23F;border:5px solid #14120F;border-radius:36px"></div>`; },
    spy() { const M = CS.art.marks, orig = M.place; calls.length = 0; M.place = function (m, t, c, o) { const r = orig.apply(this, arguments); calls.push({ id: m.id, t, form: o.form, bow: o.bow, rot: o.rot, w: r.w, f: r.f, A: r.A }); return r; }; return () => { M.place = orig; }; },
    count(fn) {   // how many layout reads fn makes: rects, computed style, and the dimension and text getters that force layout
      const E = Element.prototype, H = HTMLElement.prototype, G = SVGGraphicsElement.prototype, R = Range.prototype, undo = []; let n = 0;
      const hook = (obj, name) => {
        const d = Object.getOwnPropertyDescriptor(obj, name); if (!d) return;
        const w = d.get ? { get() { n++; return d.get.call(this); } } : { value() { n++; return d.value.apply(this, arguments); } };
        Object.defineProperty(obj, name, Object.assign({}, d, w)); undo.push(() => Object.defineProperty(obj, name, d));
      };
      for (const k of ["getBoundingClientRect", "getClientRects", "clientWidth", "clientHeight", "clientLeft", "clientTop", "scrollWidth", "scrollHeight", "scrollLeft", "scrollTop"]) hook(E, k);
      for (const k of ["offsetWidth", "offsetHeight", "offsetLeft", "offsetTop", "offsetParent", "innerText"]) hook(H, k);
      for (const k of ["getBBox", "getCTM", "getScreenCTM"]) hook(G, k);
      for (const k of ["getBoundingClientRect", "getClientRects"]) hook(R, k);
      hook(window, "getComputedStyle");
      try { fn(); } finally { undo.reverse().forEach((u) => u()); }
      return n;
    },
    probeCount() {   // the counter itself must see each read it claims to cover
      const root = document.createElement("div"); root.style.cssText = "position:absolute;left:0;top:0;width:10px;height:10px"; document.body.appendChild(root);
      const reads = { rect: (e) => e.getBoundingClientRect(), rects: (e) => e.getClientRects(), style: (e) => getComputedStyle(e), offsetWidth: (e) => e.offsetWidth, offsetHeight: (e) => e.offsetHeight, offsetLeft: (e) => e.offsetLeft, offsetTop: (e) => e.offsetTop, clientWidth: (e) => e.clientWidth, clientHeight: (e) => e.clientHeight, scrollWidth: (e) => e.scrollWidth, scrollHeight: (e) => e.scrollHeight, innerText: (e) => e.innerText, range: (e) => { const r = document.createRange(); r.selectNodeContents(e); return r.getBoundingClientRect(); } };
      const out = {}; for (const k of Object.keys(reads)) out[k] = this.count(() => reads[k](root));
      root.remove(); return out;
    },
    bbox(root, i) { const p = root.querySelectorAll("svg.cs-marks path")[i], b = p.getBBox(); return { x: b.x, y: b.y, w: b.width, h: b.height }; },
    samples(root, i) { const p = root.querySelectorAll("svg.cs-marks path")[i], L = p.getTotalLength(), out = []; for (let k = 0; k <= 160; k++) { const q = p.getPointAtLength(L * k / 160); out.push([q.x, q.y]); } return out; }
  };
}

const ev = (fn, arg) => art.evaluate(fn, arg);
before(async () => {
  await new Promise((resolve, reject) => {
    done = withArt(async (a) => { art = a; resolve(); await new Promise((r) => { release = r; }); }).catch(reject);
  });
  await ev((l) => { CS.visual._.blocks["cs-art-marks"] = l; }, LIB);
  await ev(setup);
});
after(async () => { if (release) release(); await done; });

test("settle.js stays inside 4 KiB, follows the build rules, and registers CS.visual.settle", async () => {
  const src = fs.readFileSync(path.join(REPO, "src/visual/settle.js"), "utf8");
  assert.ok(Buffer.byteLength(src, "utf8") <= 4096, "settle.js is " + Buffer.byteLength(src, "utf8") + " B");
  for (const bad of [/Math\.random/, /\bDate\b/, /performance\./, /\bfetch\b/, /XMLHttpRequest/, /letter-spacing/, /opacity/, /italic/, /analytics/i, /offsetLeft/, /offsetTop/, /offsetWidth/, /offsetHeight/, /clientWidth/, /clientHeight/, /scrollWidth/, /scrollHeight/, /innerText/, /getBBox/]) assert.ok(!bad.test(src), "forbidden: " + bad);
  assert.equal(await ev(() => typeof CS.visual.settle + typeof CS.visual.settle.rects), "functionfunction");
  assert.deepEqual(art.errors, []);
});

test("rects: a rotated ancestor is undone (angle, unrotated size, centre) for 0, -2.5, 3.5 and 12 degrees", async () => {
  const rows = await ev(() => {
    const out = [];
    for (const deg of [0, -2.5, 3.5, 12]) {
      const id = "rot" + String(deg).replace(/\W/g, "_"), root = __st.slide(id, { html: `<div data-slot="title" class="st-t" style="left:200px;top:300px;width:700px;font-size:90px;transform:rotate(${deg}deg)"><span id="${id}-t" data-mark-target="circle">${__st.W("وبقى البوست")}</span></div>` });
      const el = root.querySelector("span[data-mark-target]"), o = root.getBoundingClientRect(), bb = (e) => { const r = e.getBoundingClientRect(); return { x: r.left - o.left, y: r.top - o.top, w: r.width, h: r.height }; };
      const U = CS.visual.settle.rects([el], root, bb), a = U.a * Math.PI / 180, cx = U.x + U.w / 2, cy = U.y + U.h / 2, box = bb(el);
      out.push({ deg, a: U.a, w: U.w, h: U.h, cx: cx * Math.cos(a) - cy * Math.sin(a), cy: cx * Math.sin(a) + cy * Math.cos(a), bx: box.x + box.w / 2, by: box.y + box.h / 2, aabbW: box.w, aabbH: box.h });
      root.style.display = "none";
    }
    return out;
  });
  const ref = rows[0];
  for (const r of rows) {
    assert.ok(Math.abs(r.a - r.deg) < 0.06, `angle ${r.a} for ${r.deg}`);
    assert.ok(Math.abs(r.w - ref.w) < 2 && Math.abs(r.h - ref.h) < 2, `unrotated size ${r.w.toFixed(1)} x ${r.h.toFixed(1)} against ${ref.w.toFixed(1)} x ${ref.h.toFixed(1)} at ${r.deg}`);
    assert.ok(Math.abs(r.cx - r.bx) < 2 && Math.abs(r.cy - r.by) < 2, `centre (${r.cx.toFixed(1)}, ${r.cy.toFixed(1)}) against (${r.bx.toFixed(1)}, ${r.by.toFixed(1)}) at ${r.deg}`);
  }
  assert.ok(rows[3].aabbH > ref.h + 40, "at 12 degrees the client rect is visibly taller than the unrotated size, so the correction is doing work");
});

test("settle places the circle, underline, strike and arrow, draws one layer above the content and stores the marks through freeze.visual", async () => {
  const r = await ev(() => {
    const body = `<div data-slot="body" class="st-t" style="left:114px;top:560px;width:852px;font-size:64px;font-weight:600"><span data-mark-target="underline">${__st.W("اكتب هدفك")}</span> ${__st.W("في سطر")}</div>
      <div data-slot="note" class="st-t" style="left:560px;top:820px;width:400px;font-size:48px;font-weight:600"><span data-mark-target="arrow">${__st.W("ده السر")}</span></div>${__st.card(120, 1000, 420, 220)}`;
    const root = __st.slide("p1", { html: `<div data-slot="title" class="st-t" style="left:114px;top:230px;width:852px;font-size:96px">${__st.W("غيّرت الغلاف")} <mark class="cs-em" data-mark-target="circle">${__st.W("وبقى البوست")}</mark></div>` + body });
    const cx = __st.cx(root, { art: { doodle: "marker" } }), res = CS.visual.settle(root, cx), res2 = CS.visual.settle(root, cx);
    const layers = root.querySelectorAll("svg.cs-marks"), stored = CS.core.freeze.visual.get("p1").marks, circle = root.querySelector("mark").getBoundingClientRect(), q = root.getBoundingClientRect();
    const rc = { x: circle.left - q.left, y: circle.top - q.top, w: circle.width, h: circle.height }, cb = __st.bbox(root, 0), ub = __st.bbox(root, 1), ab = __st.bbox(root, 2);
    const card = __st.rel(root.querySelector(".cs-art"), root), und = __st.rel(root.querySelector("[data-mark-target=underline]"), root), arr = __st.samples(root, 2), src = __st.rel(root.querySelector("[data-mark-target=arrow]"), root);
    const dist = (p, b) => Math.hypot(Math.max(b.x - p[0], 0, p[0] - b.x - b.w), Math.max(b.y - p[1], 0, p[1] - b.y - b.h));
    return {
      ids: res.marks.map((m) => m.id), forms: res.marks.map((m) => m.f), keys: res.marks.map((m) => Object.keys(m).sort().join()), dropped: res.dropped, again: JSON.stringify(res2.marks) === JSON.stringify(res.marks), layers: layers.length, last: root.lastElementChild === layers[0],
      aria: layers[0].getAttribute("aria-hidden"), cls: layers[0].getAttribute("class"), size: [layers[0].getAttribute("width"), layers[0].getAttribute("height")], same: JSON.stringify(stored) === JSON.stringify(res.marks), ks: res.marks.map((m) => m.k), colors: res.marks.map((m) => m.c),
      circleCovers: cb.x < rc.x && cb.y < rc.y && cb.x + cb.w > rc.x + rc.w && cb.y + cb.h > rc.y + rc.h, circlePad: [rc.x - cb.x, cb.x + cb.w - rc.x - rc.w],
      under: [ub.x - und.x, ub.x + ub.w - und.x - und.w, ub.y - und.y, ub.y + ub.h - und.y - und.h, und.h], tip: Math.min.apply(0, arr.map((p) => dist(p, card))), tail: Math.min.apply(0, arr.map((p) => dist(p, src))), paths: root.querySelectorAll("svg.cs-marks path").length
    };
  });
  assert.deepEqual(r.ids.map((i) => i.split("-")[0]), ["circle", "underline", "arrow"].slice(0, r.ids.length));
  assert.equal(r.ids.length, 3, "three marks: " + r.ids);
  assert.deepEqual(r.forms, ["brush", "brush", "brush"], "art.doodle marker draws brush marks");
  assert.deepEqual(r.keys, ["A,c,d,f,id,k,w", "A,c,d,f,id,k,w", "A,c,d,f,id,k,w"], "stored entries: id, f, d, w, c, k and A (ink area)");
  assert.deepEqual(r.ks, [0, 1, 2]); assert.equal(r.dropped, 0);
  assert.equal(r.layers, 1, "one layer even after a second settle"); assert.ok(r.last, "the layer is the last child, above the content");
  assert.equal(r.aria, "true"); assert.equal(r.cls, "cs-marks"); assert.deepEqual(r.size, ["1080", "1350"]);
  assert.ok(r.same, "stored through freeze.visual.set"); assert.ok(r.again, "a second call reuses the stored marks");
  assert.equal(r.paths, 3);
  assert.ok(r.circleCovers, "the ring surrounds the whole emphasis span, padding " + r.circlePad);
  assert.ok(r.under[0] > -12 && r.under[1] < 12 && r.under[2] > 0 && r.under[3] < 70, "the underline sits under its span: " + r.under);
  assert.ok(r.tip > 5 && r.tip < 40, "the arrow ends just outside the anchor: " + r.tip);
  assert.ok(r.tail < 40, "the arrow starts at the sentence: " + r.tail);
});

test("same slide, same marks (twice, byte for byte); another slide id or deck gives another hand", async () => {
  const r = await ev(() => {
    const html = `<div data-slot="title" class="st-t" style="left:114px;top:230px;width:852px;font-size:96px">${__st.W("غيّرت")} <mark class="cs-em" data-mark-target="circle">${__st.W("وبقى البوست")}</mark> <span data-mark-target="underline">${__st.W("يتحفظ")}</span></div>`;
    const run = (id, deck) => { const root = __st.slide(id, { html }), res = CS.visual.settle(root, __st.cx(root, { deck, art: { doodle: "marker" } })); root.remove(); return JSON.stringify(res.marks); };
    return { a: run("d1", "deck"), b: run("d1", "deck"), c: run("d2", "deck"), d: run("d1", "other") };
  });
  assert.equal(r.a, r.b, "run twice, compare");
  assert.notEqual(r.a, r.c, "the slide id seeds the template and the jitter");
  assert.notEqual(r.a, r.d, "the deck seeds the lean");
});

test("placement reads rects and writes nothing but the layer; reusing stored marks reads no layout at all", async () => {
  const r = await ev(() => {
    const root = __st.slide("p2", { html: `<div data-slot="title" class="st-t" style="left:114px;top:230px;width:852px;font-size:96px">${__st.W("غيّرت")} <mark class="cs-em" data-mark-target="circle">${__st.W("وبقى البوست")}</mark></div>` + __st.card(120, 900, 420, 220) });
    const before = root.outerHTML, cx = __st.cx(root);
    const first = __st.count(() => CS.visual.settle(root, cx)), layer = root.querySelector("svg.cs-marks");
    layer.remove(); const after = root.outerHTML;
    const reuse = __st.count(() => CS.visual.settle(root, cx)), size = [root.querySelector("svg.cs-marks").getAttribute("width"), root.querySelector("svg.cs-marks").getAttribute("height")];
    CS.visual.settle(root, cx); const layers = root.querySelectorAll("svg.cs-marks").length;
    // a slide without inline size gets the canvas (CS.core.constants.CANVAS), still with no layout read
    const bare = __st.slide("p2b", { html: `<div data-slot="title" class="st-t" style="left:114px;top:230px;width:852px;font-size:96px"><mark class="cs-em" data-mark-target="circle">${__st.W("وبقى")}</mark></div>` });
    bare.style.removeProperty("width"); bare.style.removeProperty("height"); bare.classList.add("st-bare");
    const cxb = __st.cx(bare); CS.visual.settle(bare, cxb); bare.querySelector("svg.cs-marks").remove();
    const bareReplay = __st.count(() => CS.visual.settle(bare, cxb)), canvas = CS.core.constants.CANVAS, bsz = [bare.querySelector("svg.cs-marks").getAttribute("width"), bare.querySelector("svg.cs-marks").getAttribute("height")];
    return { untouched: before === after, first, reuse, layers, size, bareReplay, bsz, canvas: [String(canvas.w), String(canvas.h)], probe: __st.probeCount() };
  });
  assert.ok(r.untouched, "no attribute, style or node of the slide changed except the added layer");
  assert.ok(r.first > 0, "the first pass measures");
  for (const [k, v] of Object.entries(r.probe)) assert.ok(v >= 1, `the counter sees ${k} (${v})`);
  assert.equal(r.reuse, 0, "the second pass reads no rect, no client rect, no computed style and no offset, client or scroll dimension");
  assert.deepEqual(r.size, ["1080", "1350"], "the layer is the canvas size, taken from the slide's inline size");
  assert.equal(r.bareReplay, 0, "a replay on a slide without inline size reads no layout either");
  assert.deepEqual(r.bsz, r.canvas, "and the layer is the canvas (CS.core.constants.CANVAS)");
  assert.equal(r.layers, 1);
});

test("a wrapped two-line target keeps its ring: the clones of the span (one per .cs-ln) are one target with one ring around both lines", async () => {
  const r = await ev(() => {
    const html = `<div data-slot="title" class="st-t" style="left:114px;top:240px;width:560px;font-size:96px">${__st.W("غيّرت")} <mark class="cs-em" data-mark-target="circle">${__st.W("الغلاف الجديد بتاعك")}</mark> ${__st.W("بسرعة")}</div>`;
    const root = __st.slide("w1", { html }), slot = root.querySelector("[data-slot=title]"), rows = [], ws = [...slot.querySelectorAll(".w")];
    let last = -1; ws.forEach((w) => { const y = Math.round(w.getBoundingClientRect().top / 20); if (y !== last) { rows.push(0); last = y; } rows[rows.length - 1]++; });
    CS.core.fit.wrapLinesBy(slot, rows);
    const clones = root.querySelectorAll("[data-mark-target]").length, words = [...root.querySelectorAll("[data-mark-target] .w")].map((w) => __st.rel(w, root));
    const res = CS.visual.settle(root, __st.cx(root)), b = __st.bbox(root, 0);
    const u = { x: Math.min.apply(0, words.map((w) => w.x)), y: Math.min.apply(0, words.map((w) => w.y)), X: Math.max.apply(0, words.map((w) => w.x + w.w)), Y: Math.max.apply(0, words.map((w) => w.y + w.h)) };
    return { rows, clones, lines: root.querySelectorAll(".cs-ln").length, n: res.marks.length, id: res.marks[0] && res.marks[0].id, covers: b.x < u.x && b.y < u.y && b.x + b.w > u.X && b.y + b.h > u.Y, tall: b.h > 1.6 * (words[0].h) };
  });
  assert.ok(r.rows.length >= 3 && r.clones >= 2, "the setup wraps the span over at least two lines: rows " + r.rows + ", clones " + r.clones);
  assert.equal(r.n, 1, "one ring, not one per line"); assert.match(r.id, /^circle/);
  assert.ok(r.covers, "the ring's box holds the words of both lines"); assert.ok(r.tall, "and is as tall as two lines");
});

test("separate targets that ask for the same mark stay separate: two strikes in one slot with words between them are two marks, each as wide as its own phrase", async () => {
  const r = await ev(() => {
    const html = `<div data-slot="body" class="st-t" style="left:114px;top:420px;width:852px;font-size:56px;font-weight:600;white-space:nowrap"><span id="ta" data-mark-target="strike-line">${__st.W("أول")}</span> ${__st.W("كلام فاصل بينهم")} <span id="tb" data-mark-target="strike-line">${__st.W("تاني")}</span></div>`;
    const root = __st.slide("sep1", { html }), stop = __st.spy(), res = CS.visual.settle(root, __st.cx(root)); stop();
    const mid = [...root.querySelectorAll(".w")].filter((w) => !w.closest("[data-mark-target]")).map((w) => __st.rel(w, root));
    return { n: res.marks.length, ids: res.marks.map((m) => m.id), calls: __st.calls.map((c) => ({ x: c.t.x + 6, w: c.t.w - 12 })), a: __st.rel(root.querySelector("#ta"), root), b: __st.rel(root.querySelector("#tb"), root), mid };
  });
  assert.equal(r.n, 2, "two phrases, two marks (not one strike across everything between them)"); assert.deepEqual(r.ids, ["strike-line", "strike-line"]);
  for (const tg of [r.a, r.b]) assert.ok(r.calls.some((c) => Math.abs(c.x - tg.x) <= 2 && Math.abs(c.w - tg.w) <= 2), `a strike sits on exactly ${tg.x.toFixed(0)} + ${tg.w.toFixed(0)}: ` + JSON.stringify(r.calls));
  assert.ok(r.a.w < 250 && r.b.w < 250 && Math.abs(r.a.x - r.b.x) > 400, "the setup: two short phrases far apart");
  for (const c of r.calls) for (const m of r.mid) assert.ok(m.x >= c.x + c.w - 1 || m.x + m.w <= c.x + 1, "no strike crosses the words between the phrases");
});

test("a target wrapped over lines is one target; a separate phrase with the same mark is another: only the clones of one span merge", async () => {
  const r = await ev(() => {
    const html = `<div data-slot="title" class="st-t" style="left:114px;top:240px;width:852px;font-size:72px;font-weight:600">${__st.W("واحد")} <mark class="cs-em" data-mark-target="strike-scribble">${__st.W("اتنين تلاتة")}</mark> ${__st.W("اربعة خمسة")} <span data-mark-target="strike-scribble">${__st.W("ستة")}</span></div>`;
    const root = __st.slide("wr1", { html }), slot = root.querySelector("[data-slot=title]");
    CS.core.fit.wrapLinesBy(slot, [2, 2, 2]);
    const clones = [...root.querySelectorAll("[data-mark-target]")], box = (els) => { const q = els.flatMap((e) => [...e.querySelectorAll(".w")]).map((w) => __st.rel(w, root)); return { x: Math.min(...q.map((b) => b.x)), X: Math.max(...q.map((b) => b.x + b.w)), y: Math.min(...q.map((b) => b.y)), Y: Math.max(...q.map((b) => b.y + b.h)) }; };
    const one = box(clones.slice(0, 2)), two = box(clones.slice(2)), stop = __st.spy(), res = CS.visual.settle(root, __st.cx(root)); stop();
    return { lines: root.querySelectorAll(".cs-ln").length, clones: clones.length, lineOf: clones.map((c) => [...root.querySelectorAll(".cs-ln")].indexOf(c.closest(".cs-ln"))), n: res.marks.length, calls: __st.calls.map((c) => c.t), one, two };
  });
  assert.equal(r.lines, 3); assert.deepEqual(r.lineOf, [0, 1, 2], "the first phrase is cloned onto lines 1 and 2, the second sits on line 3");
  assert.equal(r.n, 2, "two marks: one for the wrapped phrase, one for the separate phrase");
  const [t1, t2] = r.calls;
  assert.ok(Math.abs(t1.x + 6 - r.one.x) <= 2 && Math.abs(t1.w - 12 - (r.one.X - r.one.x)) <= 2, "the first mark spans the words of both lines: " + JSON.stringify([t1, r.one]));
  assert.ok(t1.h > 1.6 * t2.h, `and is as tall as two lines (${t1.h.toFixed(0)} against ${t2.h.toFixed(0)})`);
  assert.ok(Math.abs(t2.x + 6 - r.two.x) <= 2 && Math.abs(t2.w - 12 - (r.two.X - r.two.x)) <= 2, "the second mark is as wide as its own word: " + JSON.stringify([t2, r.two]));
});

test("data-mark-id names a target: clones with one id are one target; different ids stay apart even where one phrase opens the line another closes", async () => {
  const r = await ev(() => {
    const run = (ia, ib, slideId) => {
      const html = `<div data-slot="title" class="st-t" style="left:114px;top:240px;width:852px;font-size:72px;font-weight:600">${__st.W("واحد")} <span data-mark-target="strike-line" data-mark-id="${ia}">${__st.W("اتنين")}</span> <span data-mark-target="strike-line" data-mark-id="${ib}">${__st.W("تلاتة")}</span> ${__st.W("اربعة")}</div>`;
      const root = __st.slide(slideId, { html }); CS.core.fit.wrapLinesBy(root.querySelector("[data-slot=title]"), [2, 2]);
      const n = CS.visual.settle(root, __st.cx(root)).marks.length; root.remove(); return n;
    };
    return { apart: run("a", "b", "id1"), together: run("a", "a", "id2") };
  });
  assert.equal(r.apart, 2, "ids a and b: two targets"); assert.equal(r.together, 1, "the same id: one target");
});

test("a rotated ancestor: the ring follows the tilt (12 degrees) and stays around the words", async () => {
  const r = await ev(() => {
    const out = {};
    for (const deg of [0, 12]) {
      const root = __st.slide("t" + deg, { html: `<div data-slot="title" class="st-t" style="left:150px;top:420px;width:700px;font-size:90px;transform:rotate(${deg}deg)"><span data-mark-target="circle">${__st.W("وبقى البوست")}</span></div>` }), el = root.querySelector("span[data-mark-target]");
      const o = root.getBoundingClientRect(), bb = (e) => { const q = e.getBoundingClientRect(); return { x: q.left - o.left, y: q.top - o.top, w: q.width, h: q.height }; }, U = CS.visual.settle.rects([el], root, bb);
      const res = CS.visual.settle(root, __st.cx(root)), a = -U.a * Math.PI / 180, pts = __st.samples(root, 0).map((p) => [p[0] * Math.cos(a) - p[1] * Math.sin(a), p[0] * Math.sin(a) + p[1] * Math.cos(a)]);
      const x0 = Math.min.apply(0, pts.map((p) => p[0])), x1 = Math.max.apply(0, pts.map((p) => p[0])), y0 = Math.min.apply(0, pts.map((p) => p[1])), y1 = Math.max.apply(0, pts.map((p) => p[1]));
      const corners = [[U.x, U.y], [U.x + U.w, U.y], [U.x, U.y + U.h], [U.x + U.w, U.y + U.h]], inRing = corners.every((c) => c[0] > x0 && c[0] < x1 && c[1] > y0 && c[1] < y1);
      out[deg] = { w: x1 - x0, h: y1 - y0, uw: U.w, uh: U.h, inRing, n: res.marks.length };
    }
    return out;
  });
  for (const deg of [0, 12]) {
    const q = r[deg];
    assert.equal(q.n, 1);
    assert.ok(q.inRing, `at ${deg} degrees the unrotated corners of the words are inside the ring`);
    assert.ok(q.w > q.uw && q.w < q.uw * 1.55 + 40, `ring width in the target's own frame ${q.w.toFixed(0)} for words ${q.uw.toFixed(0)} (${deg})`);
    assert.ok(q.h > q.uh && q.h < q.uh * 1.7 + 40, `ring height in the target's own frame ${q.h.toFixed(0)} for words ${q.uh.toFixed(0)} (${deg})`);
  }
});

test("a scaled preview (the slide inside a 0.4 stage) gives the same marks as 1x, within 2 px", async () => {
  const r = await ev(() => {
    const html = `<div data-slot="title" class="st-t" style="left:114px;top:230px;width:852px;font-size:96px">${__st.W("غيّرت")} <mark class="cs-em" data-mark-target="circle">${__st.W("وبقى البوست")}</mark> <span data-mark-target="underline">${__st.W("يتحفظ")}</span></div>`;
    const one = __st.slide("sc", { html }); CS.visual.settle(one, __st.cx(one, { art: { doodle: "marker" } }));
    const A = [0, 1].map((i) => __st.bbox(one, i)); one.remove();
    const stage = document.createElement("div"); stage.style.cssText = "position:absolute;left:1300px;top:20px;width:1080px;height:1350px;transform:scale(0.4);transform-origin:0 0"; document.body.appendChild(stage);
    const small = __st.slide("sc", { html }); stage.appendChild(small); small.style.left = "0px"; small.style.top = "0px";
    CS.visual.settle(small, __st.cx(small, { art: { doodle: "marker" } }));
    const B = [0, 1].map((i) => __st.bbox(small, i)), k = small.getBoundingClientRect().width / small.offsetWidth; stage.remove();
    return { A, B, k, d: A.map((a, i) => Math.max(Math.abs(a.x - B[i].x), Math.abs(a.y - B[i].y), Math.abs(a.w - B[i].w), Math.abs(a.h - B[i].h))) };
  });
  assert.ok(Math.abs(r.k - 0.4) < 0.001, "the stage really scales the slide: " + r.k);
  for (const d of r.d) assert.ok(d <= 2, "a mark moved " + d.toFixed(2) + " px between 1x and the scaled preview");
});

test("arrows: arrow-down for an anchor straight below, arrow-hook at the same height, never down, hook or bracket on a diagonal; ends 16 px outside the anchor; short ones are dropped", async () => {
  const r = await ev(() => {
    const out = {};
    const cases = { below: [`left:560px;top:300px`, __st.card(520, 800, 420, 220)], level: [`left:560px;top:300px`, __st.card(110, 250, 300, 200)], diag: [`left:560px;top:300px`, __st.card(110, 800, 420, 220)], near: [`left:560px;top:300px`, __st.card(540, 380, 300, 200)] };
    for (const [name, [pos, card]] of Object.entries(cases)) {
      const root = __st.slide("ar-" + name, { html: `<div data-slot="note" class="st-t" style="${pos};width:400px;font-size:56px;font-weight:600"><span data-mark-target="arrow">${__st.W("ده السر")}</span></div>` + card });
      const stop = __st.spy(), res = CS.visual.settle(root, __st.cx(root, { art: { doodle: "marker" } }));
      stop();
      const c = __st.calls[0], a = root.querySelector(".cs-art").getBoundingClientRect(), q = root.getBoundingClientRect();
      out[name] = { n: res.marks.length, id: c && c.id, bow: c && c.bow, from: c && c.t.from, to: c && c.t.to, anchor: { x: a.left - q.left, y: a.top - q.top, w: a.width, h: a.height }, rot: c && c.rot };
    }
    return out;
  });
  assert.equal(r.below.id, "arrow-down"); assert.equal(r.level.id, "arrow-hook");
  assert.ok(r.diag.id && !/down|hook|bracket/.test(r.diag.id), "diagonal: " + r.diag.id);
  assert.equal(r.near.n, 0, "an arrow shorter than 60 px is not drawn");
  assert.equal(r.level.bow, true, "an arrow going toward the start side bows so the arch stays above"); assert.equal(r.below.rot, 0);
  for (const name of ["below", "level", "diag"]) {
    const { to, anchor: a } = r[name], d = Math.hypot(Math.max(a.x - to[0], 0, to[0] - a.x - a.w), Math.max(a.y - to[1], 0, to[1] - a.y - a.h));
    assert.ok(d > 8 && d < 26, `${name}: the tip is ${d.toFixed(1)} px from the anchor (16 asked)`);
  }
});

test("preset art.marks is applied before the seeded choice and by the direction-specific arrows: an allowed template is always found, a prohibited one is never drawn", async () => {
  const r = await ev(() => {
    const out = { circle: [], family: new Set(), none: null, arrows: {} };
    const title = `<div data-slot="title" class="st-t" style="left:114px;top:230px;width:852px;font-size:96px"><mark class="cs-em" data-mark-target="circle">${__st.W("وبقى البوست")}</mark></div>`;
    for (const id of ["s01", "s02", "s03", "s04", "s05", "s06", "s07", "s08", "s09", "s10", "s11", "s12"]) {
      const root = __st.slide(id, { html: title }); out.circle.push(CS.visual.settle(root, __st.cx(root, { art: { marks: ["circle-double"] } })).marks.map((m) => m.id).join()); root.remove();
      const fam = __st.slide(id, { html: title }); CS.visual.settle(fam, __st.cx(fam, { art: { marks: ["circle"] } })).marks.forEach((m) => out.family.add(m.id)); fam.remove();
    }
    const none = __st.slide("nn", { html: title }), nres = CS.visual.settle(none, __st.cx(none, { art: { marks: ["underline"] } }));
    out.none = [nres.marks.length, none.querySelectorAll("svg.cs-marks").length];
    const arrow = (name, art, tk, card) => {
      const root = __st.slide("pr-" + name, { html: `<div data-slot="note" class="st-t" style="left:560px;top:300px;width:400px;font-size:56px;font-weight:600"><span data-mark-target="${tk}">${__st.W("ده السر")}</span></div>` + card });
      const stop = __st.spy(), res = CS.visual.settle(root, __st.cx(root, { art })); stop(); root.remove();
      return __st.calls.map((c) => c.id).join() + "/" + res.marks.map((m) => m.id).join();
    };
    const below = __st.card(520, 800, 420, 220), level = __st.card(110, 250, 300, 200);
    out.arrows = {
      curveBelow: arrow("a1", { marks: ["arrow-curve"] }, "arrow-curve", below), curveBelowFam: arrow("a2", { marks: ["arrow-curve"] }, "arrow", below), curveLevel: arrow("a3", { marks: ["arrow-curve"] }, "arrow", level),
      famBelow: arrow("a4", { marks: ["arrow"] }, "arrow", below), famLevel: arrow("a5", { marks: ["arrow"] }, "arrow", level), idDown: arrow("a6", { marks: ["arrow-curve", "arrow-down"] }, "arrow", below), downOnly: arrow("a7", { marks: ["arrow-down"] }, "arrow-down", level), free: arrow("a8", {}, "arrow-curve", below)
    };
    return Object.assign(out, { family: [...out.family].sort() });
  });
  assert.deepEqual(r.circle, Array(12).fill("circle-double"), "art.marks [circle-double] and the target circle: circle-double on every slide, never nothing");
  assert.ok(r.family.length >= 2 && r.family.every((i) => /^circle/.test(i)), "art.marks [circle] keeps the seeded spread over the circle family: " + r.family);
  assert.deepEqual(r.none, [0, 0], "a family the preset does not draw draws nothing and adds no layer");
  assert.equal(r.arrows.curveBelow, "arrow-curve/arrow-curve", "only arrow-curve allowed, anchor straight below: no arrow-down");
  assert.equal(r.arrows.curveBelowFam, "arrow-curve/arrow-curve"); assert.equal(r.arrows.curveLevel, "arrow-curve/arrow-curve", "and no arrow-hook at the same height");
  assert.equal(r.arrows.famBelow, "arrow-down/arrow-down", "the family allowed: the vertical replacement still happens"); assert.equal(r.arrows.famLevel, "arrow-hook/arrow-hook");
  assert.equal(r.arrows.idDown, "arrow-down/arrow-down", "arrow-down allowed by id: used when the anchor is below");
  assert.equal(r.arrows.downOnly, "arrow-down/arrow-down", "arrow-down is the only arrow allowed: a level anchor cannot swap it for the prohibited hook");
  assert.equal(r.arrows.free, "arrow-down/arrow-down", "no restriction: the replacement for an anchor below is arrow-down, as before");
});

test("limits: at most 3 marks and one arrow per slide, ink area under 8% of the zone, the dropped count is reported and remembered", async () => {
  const r = await ev(() => {
    const html = `<div data-slot="title" class="st-t" style="left:114px;top:230px;width:852px;font-size:96px"><mark class="cs-em" data-mark-target="circle">${__st.W("وبقى")}</mark> <span data-mark-target="underline">${__st.W("البوست")}</span></div>
      <div data-slot="body" class="st-t" style="left:114px;top:480px;width:852px;font-size:60px;font-weight:600"><span data-mark-target="strike">${__st.W("لازم مصمم")}</span></div>
      <div data-slot="n1" class="st-t" style="left:560px;top:700px;width:400px;font-size:48px"><span data-mark-target="arrow">${__st.W("ده السر")}</span></div>
      <div data-slot="n2" class="st-t" style="left:560px;top:800px;width:400px;font-size:48px"><span data-mark-target="arrow">${__st.W("وده كمان")}</span></div>${__st.card(120, 1000, 420, 220)}`;
    const root = __st.slide("lim", { html }), stop = __st.spy(), res = CS.visual.settle(root, __st.cx(root)); stop();
    const small = __st.slide("lim2", { html }), tiny = CS.visual.settle(small, __st.cx(small, { zone: { x: 0, y: 0, w: 100, h: 100 } }));
    const kept = res.marks.map((m) => m.id), ink = __st.calls.filter((c) => kept.indexOf(c.id) >= 0).reduce((a, c) => a + c.A, 0);
    return { kept, dropped: res.dropped, ink, ks: res.marks.map((m) => m.k), stored: CS.core.freeze.visual.get("lim").marks.length, tiny: [tiny.marks.length, tiny.dropped, small.querySelectorAll("svg.cs-marks").length, (CS.core.freeze.visual.get("lim2").marks || []).length] };
  });
  assert.equal(r.kept.length, 3); assert.ok(r.kept.filter((i) => /^arrow/.test(i)).length <= 1, "one arrow at most: " + r.kept);
  assert.ok(r.dropped >= 2, "five requested, two dropped: " + r.dropped); assert.deepEqual(r.ks, [0, 1, 2]);
  assert.ok(r.ink < 0.08 * 852 * 998, "ink " + r.ink + " px2 of " + 852 * 998);
  assert.equal(r.stored, 3);
  assert.deepEqual(r.tiny, [0, 5, 0, 0], "in a 100 x 100 zone every mark is over 8%: none is drawn, no layer, and the empty answer is stored");
});

test("r2 rules: the double underline's rect is at least 30 px, a brush is at least 7 px, a line stroke is 3 to 7 px", async () => {
  const r = await ev(() => {
    const out = {};
    for (const [name, doodle] of [["brush", "marker"], ["line", "pencil"]]) {
      const root = __st.slide("r2" + name, { html: `<div data-slot="title" class="st-t" style="left:114px;top:230px;width:852px;font-size:34px;font-weight:600"><span data-mark-target="underline-double">${__st.W("سطر صغير")}</span> <span data-mark-target="strike-line">${__st.W("وده")}</span> <span data-mark-target="circle-double">${__st.W("ده")}</span></div>` });
      const stop = __st.spy(); CS.visual.settle(root, __st.cx(root, { art: { doodle } })); stop();
      out[name] = __st.calls.map((c) => ({ id: c.id, h: c.t.h, w: c.w, f: c.f }));
    }
    return out;
  });
  for (const name of ["brush", "line"]) {
    assert.equal(r[name].length, 3);
    const dbl = r[name].find((c) => c.id === "underline-double");
    assert.ok(dbl.h >= 30, `${name}: the double underline's rect is ${dbl.h.toFixed(1)} px high`);
    for (const c of r[name]) { assert.equal(c.f, name); if (name === "brush") assert.ok(c.w >= 7, `${c.id} brush ${c.w}`); else assert.ok(c.w >= 3 && c.w <= 7, `${c.id} line ${c.w}`); }
  }
});

test("stored marks are reused as they are: from freeze.visual.set and from freeze.apply(frozen), with no placement and no measuring", async () => {
  const r = await ev(() => {
    const keep = { id: "circle-open", f: "line", d: "M100 100C200 100 300 100 300 200C300 300 100 300 100 200Z", w: 5, c: "ink", k: 0 }, out = {};
    const html = `<div data-slot="title" class="st-t" style="left:114px;top:230px;width:852px;font-size:96px"><mark class="cs-em" data-mark-target="circle">${__st.W("وبقى البوست")}</mark></div>`;
    const a = __st.slide("fz1", { html }); CS.core.freeze.visual.set("fz1", { marks: [keep] });
    let stop = __st.spy(), n = __st.count(() => CS.visual.settle(a, __st.cx(a))); stop();
    out.set = [a.querySelector("svg.cs-marks path").getAttribute("d"), a.querySelector("svg.cs-marks path").getAttribute("stroke-width"), __st.calls.length, n];
    const b = __st.slide("fz2", { html }), frozen = { engine: CS.version, lines: {}, sizes: {}, visual: { marks: { fz2: [keep] }, anchors: {} } };
    CS.core.freeze.apply(b, frozen);
    stop = __st.spy(); n = __st.count(() => CS.visual.settle(b, __st.cx(b))); stop();
    out.apply = [b.querySelector("svg.cs-marks path").getAttribute("d"), __st.calls.length, n];
    out.keep = keep.d;
    return out;
  });
  assert.equal(r.set[0], r.keep); assert.equal(r.set[1], "5"); assert.equal(r.set[2], 0, "no placement"); assert.equal(r.set[3], 0, "no layout read");
  assert.equal(r.apply[0], r.keep); assert.equal(r.apply[1], 0); assert.equal(r.apply[2], 0);
});

test("approval storage: freeze.capture stores the marks settle placed, and freeze.apply of the captured layout reproduces them with no placement and no layout read", async (t) => {
  const r = await ev(() => {
    if (typeof CS.core.freeze.capture !== "function" || typeof CS.core.freeze.apply !== "function") return { missing: true };
    const html = `<div data-slot="title" class="st-t" style="left:114px;top:230px;width:852px;font-size:96px">${__st.W("غيّرت")} <mark class="cs-em" data-mark-target="circle">${__st.W("وبقى البوست")}</mark> <span data-mark-target="underline">${__st.W("يتحفظ")}</span></div>`;
    const c = __st.slide("fz3", { html }), cx = __st.cx(c), res = CS.visual.settle(c, cx);
    const f = CS.core.freeze.capture([{ id: "fz3", el: c }], { slides: [] }, cx.tokens.tones.base);
    const stored = f.visual && f.visual.marks && f.visual.marks.fz3, out = { placed: JSON.stringify(res.marks), captured: JSON.stringify(stored), n: res.marks.length };
    c.remove();
    const b = __st.slide("fz3", { html }); CS.core.freeze.apply(b, JSON.parse(JSON.stringify(f)));
    const stop = __st.spy(); let again; out.reads = __st.count(() => { again = CS.visual.settle(b, __st.cx(b)); }); stop();
    out.replayed = JSON.stringify(again.marks); out.calls = __st.calls.length; out.d = [...b.querySelectorAll("svg.cs-marks path")].map((p) => p.getAttribute("d")).join("|"); out.dOrig = res.marks.map((m) => m.d).join("|");
    return out;
  });
  if (r.missing) { t.skip("freeze.capture or freeze.apply is not in this build"); return; }
  assert.ok(r.n >= 2, "the setup placed a circle and an underline");
  assert.equal(r.captured, r.placed, "freeze.capture stores exactly the marks settle placed");
  assert.equal(r.replayed, r.placed, "freeze.apply of the captured layout hands settle the same marks"); assert.equal(r.d, r.dOrig, "and the layer paints the same paths");
  assert.equal(r.calls, 0, "no placement on the replay"); assert.equal(r.reads, 0, "no layout read on the replay");
});

test("painters: a complete slide with marks is safe() and agrees between the svg and the replay painter (whole slide, small slide, marks layer)", async () => {
  await ev(() => document.querySelectorAll("section.cs-slide").forEach((e) => e.remove()));
  const ids = await ev(() => {
    const mk = (id, w, h, size, o) => {
      const root = __st.slide(id, { w, h, html: `<div data-slot="title" class="st-t" style="left:${w * 0.06}px;top:${h * 0.12}px;width:${w * 0.88}px;font-size:${size}px">${__st.W("غيّرت")} <mark class="cs-em" data-mark-target="circle">${__st.W("وبقى البوست")}</mark></div>
        <div data-slot="body" class="st-t" style="left:${w * 0.06}px;top:${h * 0.5}px;width:${w * 0.6}px;font-size:${size * 0.6}px;font-weight:600"><span data-mark-target="underline">${__st.W("يتحفظ أكتر")}</span></div>
        <div data-slot="note" class="st-t" style="left:${w * 0.5}px;top:${h * 0.64}px;width:${w * 0.4}px;font-size:${size * 0.5}px;font-weight:600"><span data-mark-target="arrow">${__st.W("ده السر")}</span></div>${__st.card(w * 0.1, h * 0.8, w * 0.38, h * 0.14)}` });
      CS.visual.settle(root, __st.cx(root, o)); return "#" + id;
    };
    return [mk("pa1", 1080, 1350, 96, { art: { doodle: "marker" } }), mk("pa2", 540, 300, 44, { art: { doodle: "pencil" } })];
  });
  for (const sel of ids) {
    assert.deepEqual((await art.safe(sel)).violations, [], sel + " is painter-safe");
    const p = await art.paintBoth(sel, { regions: [sel + " svg.cs-marks"] });
    assert.ok(p.ssim >= 0.98, `${sel}: complete slide ${p.ssim}`);
    assert.ok(p.regions[0].ssim >= 0.98, `${sel}: marks layer ${p.regions[0].ssim}`);
  }
  assert.deepEqual(art.errors, []);
});

test("contact sheet: creator (brush), poster (line) and notebook (pencil, tilted) slides with text-bound marks, saved when CS_ART_OUT is set", async () => {
  await ev(() => document.querySelectorAll("section.cs-slide, #settle-sheet").forEach((e) => e.remove()));
  const sel = await ev(() => {
    const host = document.createElement("div"); host.id = "settle-sheet"; host.style.cssText = "position:absolute;left:0;top:0;width:3300px;height:1350px;background:#888"; document.body.appendChild(host);
    const scene = (preset, i, tilt, doodle, title, body, note) => {
      const id = "sh" + i, root = __st.slide(id, { preset, x: i * 1110, y: 0, html: `<div data-slot="title" class="st-t" style="left:114px;top:200px;width:852px;font-size:88px;${tilt ? "transform:rotate(" + tilt + "deg);" : ""}">${title}</div>
        <div data-slot="body" class="st-t" style="left:114px;top:560px;width:852px;font-size:56px;font-weight:600">${body}</div>
        <div data-slot="note" class="st-t" style="left:560px;top:790px;width:400px;font-size:52px;font-weight:700">${note}</div><div class="cs-art" id="anchor${i}" style="position:absolute;left:120px;top:960px;width:420px;height:300px"></div>` });
      host.appendChild(root); root.style.left = i * 1110 + "px";
      const c = __art.ctx({ preset, tone: "base", box: { w: 420, h: 300 } }), r = CS.art.build({ kind: "icon", icon: "bookmark", object: "lightbulb" }, c);
      if (r && r.el) root.querySelector(".cs-art").appendChild(r.el);
      CS.visual.settle(root, __st.cx(root, { preset, art: { doodle } }));
    };
    scene("creator", 0, 0, "marker", `${__st.W("غيّرت الغلاف")} <mark class="cs-em" data-mark-target="circle">${__st.W("بس")}</mark><br>${__st.W("وبقى البوست")} <span data-mark-target="underline">${__st.W("يتحفظ")}</span>`, `${__st.W("الغلاف الأول هو اللي بيوقّف الإصبع")}`, `<span data-mark-target="arrow">${__st.W("احفظه")}</span>`);
    scene("poster", 1, 0, "pen", `${__st.W("الغلاف اللي")} <mark class="cs-em" data-mark-target="underline">${__st.W("بيتحفظ")}</mark><br>${__st.W("بيبدأ بسؤال")}`, `${__st.W("مش")} <span data-mark-target="circle">${__st.W("40 دقيقة")}</span> ${__st.W("كل يوم")}`, `<span data-mark-target="arrow">${__st.W("ابدأ هنا")}</span>`);
    scene("notebook", 2, -2.5, "pencil", `${__st.W("اكتب هدفك")} <mark class="cs-em" data-mark-target="circle-double">${__st.W("في سطر")}</mark><br>${__st.W("واحد بس")}`, `${__st.W("مش")} <span data-mark-target="strike-scribble">${__st.W("عشرة أهداف")}</span> ${__st.W("مرة واحدة")}`, `<span data-mark-target="arrow">${__st.W("جرّبها")}</span>`);
    return "#settle-sheet";
  });
  const counts = await ev(() => [0, 1, 2].map((i) => document.querySelectorAll("#sh" + i + " svg.cs-marks path").length));
  assert.deepEqual(counts, [3, 3, 3], "each slide carries its three marks");
  const png = await art.shot(sel);
  art.save("marks-settle.png", png); art.save("marks-settle-130.png", await art.small(png, 390));
  assert.deepEqual((await art.safe("#sh0")).violations, []);
  assert.deepEqual((await art.safe("#sh1")).violations, []);
  assert.deepEqual(art.errors, []);
});
