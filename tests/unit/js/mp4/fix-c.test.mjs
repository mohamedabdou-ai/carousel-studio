import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = ["src/mp4/mp4.js", "src/mp4/clip.js"].map(p => fs.readFileSync(p, "utf8")).join("\n");
const motion = () => ({ recipe: "calm", seconds: 12, clip: { file: "demo.mp4", in: 0, out: 4, fit: "cover", focus: { x: .5, y: .5 }, ending: "auto" } });

function element(tag) {
  return { tag, children: [], style: {}, classList: { add() {}, remove() {} },
    setAttribute(name, value) { this[name] = value; },
    appendChild(child) { this.children.push(child); return child; },
    append(...children) { this.children.push(...children); },
    replaceChildren(...children) { this.children = children; },
    removeAttribute(name) { delete this[name]; }, load() {},
    set src(value) { this._src = value; queueMicrotask(() => this.onloadedmetadata?.()); }
  };
}

function harness(options = {}) {
  const calls = [], track = {
    getCodecParameterString: async () => "avc1.64001e", canDecode: async () => !options.unsupported,
    computeDuration: async () => 4, getFirstTimestamp: async () => .1
  };
  let disposed = 0;
  const MB = {
    Input: class { async getPrimaryVideoTrack() { return track; } dispose() { disposed++; } },
    BlobSource: class {}, ALL_FORMATS: [],
    VideoSampleSink: class { async getSample(time) {
      calls.push(time);
      if (options.decoderError) throw new Error("decoder lost its reference frame");
      return options.empty || time < .1 ? null : { time };
    } }
  };
  const context = { CS: { export: {} }, Blob, URL, Uint8Array, Uint32Array, console,
    document: { createElement(tag) { return Object.assign(element(tag), tag === "video" ? { duration: 4.1 } : {}); } }, MB
  };
  vm.createContext(context);
  vm.runInContext(source + "\nloadMediabunny = async function () { return MB; };", context);
  return { context, clip: context.CS.export.mp4.clip, calls, disposed: () => disposed };
}

test("C2: in=0 samples the first video timestamp rather than reporting a codec failure", async () => {
  const h = harness(), reader = await h.context.openClip(new Blob());
  try { assert.equal((await reader.sample(0)).time, .1); assert.deepEqual(h.calls, [.1]); }
  finally { reader.close(); }
  assert.equal(h.disposed(), 1);
});

test("C2: no sample is a data error, while decoder failures retain their actual cause", async () => {
  for (const [options, code, text] of [[{ empty: true }, "E_SCHEMA", /no frame at/i], [{ decoderError: true }, "E_NO_CAPABILITY", /decoder lost its reference frame/]]) {
    const h = harness(options), reader = await h.context.openClip(new Blob());
    try { await assert.rejects(reader.sample(1), e => e.code === code && text.test(e.message)); }
    finally { reader.close(); }
  }
  const h = harness({ unsupported: true });
  await assert.rejects(h.context.openClip(new Blob()), e => e.code === "E_NO_CAPABILITY" && /no browser decoder/.test(e.message));
  assert.equal(h.disposed(), 1);
});

test("C3: picker uses the video track duration and disposes the reader", async () => {
  const h = harness(), ctx = { spec: { format: "carousel" }, index: () => 0, setMotion(m) { this.motion = m; } };
  const picker = h.clip.picker(ctx, "en"); picker.update();
  const input = picker.children.find(n => n.tag === "input"), file = new Blob(["local video"]); file.name = "demo.mp4";
  input.files = [file]; await input.onchange();
  assert.equal(ctx.motion?.clip.out, 4);
  assert.equal(ctx.motion.seconds, 6);
  assert.equal(h.disposed(), 1);
});

test("C7: single-post clip validation rejects before layout or exporting misnamed stills", () => {
  const h = harness(), spec = { format: "single", cover: { motion: motion() }, slides: [{}] };
  assert.throws(() => h.clip.layoutSpec(spec), e => e.code === "E_SCHEMA" && /single/i.test(e.message));
  assert.throws(() => h.clip.validate(spec.cover.motion, spec), e => e.code === "E_SCHEMA");
});

test("C7: single-post picker explains why the clip choice is unavailable", () => {
  const h = harness(), ctx = { spec: { format: "single" }, index: () => 0 };
  const picker = h.clip.picker(ctx, "en"); picker.update();
  assert.equal(picker.children.some(n => n.tag === "input" || n.tag === "button"), false);
  assert.match(picker.textContent, /single.*carousel|carousel.*single/i);
});

test("C6: clip Motion tab shows its own duration and no engine recipe or 5/6 controls", () => {
  const h = harness(), segments = [], ctx = { spec: { cover: { motion: motion() } }, preset: () => ({}), slides: () => [], bus: { on() {} } };
  Object.assign(h.context, { window: {}, h(tag, props, ...children) { const n = Object.assign(element(tag), props); n.children.push(...children.flat().filter(Boolean)); return n; },
    clear(n) { n.replaceChildren(); }, t: (key, args) => key === "motion.seconds.n" ? `${args.n} seconds` : key,
    icon: () => null, bidi: x => x, msgOf: x => x.en, pill: () => null,
    guard(name, fn, fallback) { try { return fn(); } catch { return fallback; } },
    segmented(values) { segments.push(values); return element("segmented"); }
  });
  vm.runInContext(fs.readFileSync("src/brandbook/screens/motion.js", "utf8"), h.context);
  const screen = h.context.MotionScreen(ctx); screen.show();
  const nodes = [];
  function walk(n) { if (!n || typeof n !== "object") return; nodes.push(n); n.children?.forEach(walk); }
  walk(screen.el);
  assert.equal(segments.length, 0);
  assert.equal(nodes.some(n => n.class === "ui-recipe"), false);
  assert.ok(nodes.some(n => n.children?.some(c => typeof c === "string" && c.includes("12"))), "clip duration is shown");
});
