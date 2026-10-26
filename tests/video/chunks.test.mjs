// The engine-side chunks of the visual language inside the harness page (IS-1): cs-art and cs-visual load after the painters, publish their
// namespaces and throw nothing while loading under the stub core. They are built into the runtime only at an integration beat, so each test
// skips while the page has neither chunk. cs-qa-visual and cs-visual-ui are not hosted here (they need cs-qa and cs-ui).
const ORDER = ["paint", "motion", "hf", "mp4", "export", "art", "visual"];

async function probe(t) {
  return t.page.evaluate(() => ({
    ids: Array.from(document.querySelectorAll('script[id^="cs-chunk-"]')).map((s) => s.id.slice("cs-chunk-".length)),
    errors: (window.__loadErrors || []).slice(),
    art: typeof CS.art === "object" && CS.art ? { kinds: typeof CS.art.kinds, has: typeof CS.art.has, build: typeof CS.art.build, register: typeof CS.art.register, kit: typeof CS.art.kit } : null,
    visual: typeof CS.visual === "object" && CS.visual ? { version: CS.visual.version, block: typeof (CS.visual._ || {}).block, register: typeof (CS.visual._ || {}).register } : null,
    qav: typeof CS.qav,
    vui: typeof CS.vui
  }));
}

export default {
  module: "visual-chunks",
  tests: [
    {
      name: "the hosted chunks follow the load order of IS-1 and the two UI-side chunks are not hosted",
      async run(t) {
        const r = await probe(t);
        if (!r.ids.includes("art") && !r.ids.includes("visual")) t.skip("cs-art.js and cs-visual.js are not in this runtime yet");
        const at = r.ids.map((id) => ORDER.indexOf(id));
        t.ok(at.every((i) => i >= 0), "only hosted chunks are in the harness: " + r.ids.join(", "));
        t.eq(at.slice().sort((a, b) => a - b), at, "chunks appear in the order " + ORDER.join(" "));
        t.ok(!r.ids.includes("qa-visual") && !r.ids.includes("visual-ui"), "cs-qa-visual and cs-visual-ui need cs-qa and cs-ui");
      }
    },
    {
      name: "cs-art and cs-visual publish CS.art and CS.visual and throw nothing while loading",
      async run(t) {
        const r = await probe(t);
        if (!r.ids.includes("art") && !r.ids.includes("visual")) t.skip("cs-art.js and cs-visual.js are not in this runtime yet");
        t.eq(r.errors, [], "no chunk throws at load under the stub core");
        if (r.ids.includes("art")) t.eq(r.art, { kinds: "function", has: "function", build: "function", register: "function", kit: "object" }, "CS.art surface of IS-3");
        if (r.ids.includes("visual")) t.eq(r.visual, { version: "1.1.0", block: "function", register: "function" }, "CS.visual surface of IS-2");
      }
    },
    {
      name: "CS.art builds nothing for a kind nobody registered",
      async run(t) {
        const r = await t.page.evaluate(() => (CS.art && CS.art.build ? { nothing: CS.art.build({ kind: "no-such-kind" }, {}), has: CS.art.has("no-such-kind") } : null));
        if (!r) t.skip("cs-art.js is not in this runtime yet");
        t.eq(r, { nothing: null, has: false });
      }
    }
  ]
};
