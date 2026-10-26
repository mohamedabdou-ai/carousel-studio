// tests/unit/js/icons/data.test.mjs · the real sources of tools/icons-src against the real vendored packages (research/vendor).
// Builds into a temp folder with --no-shards (an isolated base build, so another author's half-written shard never fails this file) and
// checks the plan's D1 acceptance list: every candidate resolves, path-only pack, caps, no http, blocklist, custom icons in 1..23, the
// directional review, the hand-reviewed duo tints, the emoji map. Skipped when the vendored packages are not on the machine.
// At an integration beat run it with CS_ICONS_SHARDS=1 to merge the real index, concepts and objects shards too.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, VS16, cleanup, hasVendor, readJson, run, tmp, tool } from "./helpers.mjs";

after(cleanup);
const skip = hasVendor() ? false : "the vendored icon packages are not on this machine (research/vendor)";
const SRC = tool.DEFAULTS.src;
const state = {};
// Spelled in pieces so this file never trips the repository greps it stands guard for (GR-3, GR-4, GR-5).
const FORBIDDEN = ["analy" + "tics", "lucide" + ".dev", "Math" + ".random", "new " + "Date", "Date" + ".now", "performance" + ".now", "fetch" + "(", "XMLHttp" + "Request", "maj" + "edphotos", "Web" + "Socket"];
const out = (name) => readJson(join(state.dir, name));

test("the lock pins the two tarballs that 13e fetched", { skip }, () => {
  const lock = readJson(tool.DEFAULTS.lock);
  assert.equal(lock.sources.lucide.version, "1.53.0");
  assert.equal(lock.sources.tabler.version, "3.49.0");
  assert.equal(lock.sources.lucide.tarball.sha256, "fe3788dfbfd332b91a58a5fec6b257dcd41ddef553c0dbdc1ed166a0eb657600");
  assert.equal(lock.sources.tabler.tarball.sha256, "aa3042907eb0bdb079fd70733e2d75f785683d4726279128a0ca2343099f7074");
  for (const k of ["lucide", "tabler"]) for (const p of ["tarball", "nodes"]) assert.match(lock.sources[k][p].sha256, /^[0-9a-f]{64}$/);
});

test("the live sources build (base build, no shards)", { skip }, () => {
  state.dir = tmp("live");
  const r = run(["--out", state.dir, "--no-shards", "--format", "json"]);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  state.result = JSON.parse(r.stdout);
  state.candidates = readJson(join(SRC, "candidates.json"));
});

test("every candidate resolves; the pack holds exactly the bundled ones", { skip }, () => {
  assert.ok(state.dir, "the live build failed");
  const pack = out("pack.json");
  const core = state.candidates.filter((c) => !c.optional).map((c) => c.name);
  assert.deepEqual(Object.keys(pack.icons).sort(), [...core].sort());
  assert.ok(core.length >= 395 && core.length <= 410, `${core.length} core icons`);
  assert.equal(state.result.counts.brandGlyphs, 10, "the ten opt-in brand glyphs resolve too but are not bundled");
  for (const c of state.candidates.filter((c) => c.optional)) assert.ok(!(c.name in pack.icons), c.name);
  const lucide = core.filter((n) => !/^(tb|cs)-/.test(n)).length;
  assert.equal(lucide, 368);
  assert.equal(core.filter((n) => n.startsWith("tb-")).length, 14);
  assert.ok(core.filter((n) => n.startsWith("cs-")).length >= 9, "at least the nine custom icons that read correctly");
});

test("the pack is path-only, valid, inside its cap, with no http and no degenerate stroke", { skip }, () => {
  assert.ok(state.dir, "the live build failed");
  const text = readFileSync(join(state.dir, "pack.json"), "utf8");
  assert.ok(Buffer.byteLength(text) <= 85000, `${Buffer.byteLength(text)} B`);
  assert.ok(!/http/i.test(text));
  const pack = JSON.parse(text);
  assert.equal(pack.schemaVersion, 2);
  assert.equal(pack.viewBox, 24);
  let solid = 0;
  for (const [name, icon] of Object.entries(pack.icons)) {
    assert.deepEqual(Object.keys(icon).filter((k) => !["d", "f", "s"].includes(k)), [], `${name}: only d, f and s`);
    assert.ok(Array.isArray(icon.d) && icon.d.length > 0, name);
    const s = new Set(icon.s || []);
    icon.d.forEach((d, i) => {
      assert.match(d, /^[MmLlHhVvCcSsQqTtAaZz0-9 .\-]+$/, `${name}[${i}]: path grammar only (no fill, no stroke, no element)`);
      const { bounds, subs } = tool.pathBounds(d);
      assert.ok(subs.every((x) => !x.dot), `${name}[${i}]: a dot is a filled circle, never a zero-length stroke`);
      assert.ok(bounds[0] >= -0.5 && bounds[1] >= -0.5 && bounds[2] <= 24.5 && bounds[3] <= 24.5, `${name}[${i}] stays on the 24 grid`);
      if (s.has(i)) { solid++; assert.ok(bounds[2] - bounds[0] <= 4.01, `${name}[${i}]: a solid dot is at most 4 units wide`); }
    });
    for (const i of [...(icon.f || []), ...(icon.s || [])]) assert.ok(Number.isInteger(i) && i >= 0 && i < icon.d.length, `${name}: index ${i}`);
    assert.deepEqual((icon.f || []).filter((i) => s.has(i)), [], `${name}: f and s are disjoint`);
  }
  assert.ok(solid >= 100, `${solid} solid dots`);
  for (const n of ["chart-scatter", "galaxy", "images", "key-round", "palette", "tag", "tag-plus", "tag-x", "tags", "vault"]) {
    if (pack.icons[n]) assert.ok((pack.icons[n].s || []).length > 0, `${n} is one of the ten currentColor-dot icons of Lucide`);
  }
});

test("caps: pack 85, index 70, concepts 140, objects 60, emoji 2 KB; no http anywhere", { skip }, () => {
  assert.ok(state.dir, "the live build failed");
  for (const [name, cap] of Object.entries({ "pack.json": 85000, "index.json": 70000, "concepts.json": 140000, "objects.json": 60000, "emoji-map.json": 2000 })) {
    const text = readFileSync(join(state.dir, name), "utf8");
    assert.ok(Buffer.byteLength(text) <= cap, `${name} ${Buffer.byteLength(text)} B > ${cap}`);
    assert.ok(!/http|<\/script|<!--/i.test(text), name);
    assert.ok(text.endsWith("\n") && !text.includes("\r"), `${name}: LF and a final newline`);
  }
});

test("blocklist of 13e section 3: nothing excluded is in the bundle", { skip }, () => {
  assert.ok(state.dir, "the live build failed");
  const names = Object.keys(out("pack.json").icons).map((n) => n.replace(/^(tb|cs)-/, ""));
  const exact = new Set(["wine", "wine-off", "bottle-wine", "beer", "beer-off", "hop", "hop-off", "martini", "ham", "cigarette", "cigarette-off", "cannabis", "cannabis-off",
    "dices", "spade", "club", "church", "cross", "skull", "biohazard", "pray", "jewish-star"]);
  for (const n of names) {
    assert.ok(!exact.has(n), n);
    assert.ok(!/^(dice-|playing-card|zodiac-)/.test(n), n);
    assert.ok(!/(^|-)(kaaba|quran|mushaf|rehal|prayer|worship|mecca|allah)(-|$)/.test(n), n);
  }
});

test("the Arabic keywords of the index: one orthography, folded, deduplicated, no Latin", { skip }, () => {
  assert.ok(state.dir, "the live build failed");
  const text = readFileSync(join(state.dir, "index.json"), "utf8");
  assert.ok(Buffer.byteLength(text) <= 70000);
  const rows = JSON.parse(text);
  assert.equal(rows.length, state.candidates.filter((c) => !c.optional).length);
  const shared = new Map();
  for (const [name, category, en, ar, flags] of rows) {
    assert.ok(/^[a-z][a-z0-9-]*$/.test(name) && typeof category === "string", name);
    assert.ok(en.length >= 3 && en.every((k) => /^[a-z0-9][a-z0-9 -]*$/.test(k)), `${name}: english`);
    assert.ok(ar.length >= 3 && ar.length <= 14, `${name}: ${ar.length} Arabic keywords`);
    assert.equal(new Set(ar).size, ar.length, `${name}: duplicates`);
    for (const k of ar) {
      assert.match(k, /^[ء-غف-ي]+( [ء-غف-ي]+)*$/, `${name}: ${k}`);
      assert.equal(tool.fold(k), k, `${name}: ${k} is folded`);
      shared.set(k, (shared.get(k) || 0) + 1);
    }
    assert.deepEqual(Object.keys(flags).filter((k) => !["d", "m", "p", "h", "a", "o", "c"].includes(k)), [], name);
    assert.ok(["l", "m", "h"].includes(flags.d), `${name}: detail`);
    if (flags.p) assert.ok(["neg", "warn"].includes(flags.p));
    for (const k of ["m", "h", "a", "o", "c"]) if (k in flags) assert.equal(flags[k], 1);
  }
  const over = [...shared].filter(([, n]) => n > 6).map(([k]) => k).sort();
  const reviewed = ["رحله", "شكل", "عمله", "فلوس"];       // synonyms of money, currency, trip and shape: reviewed on purpose (13e rule)
  assert.deepEqual(over.filter((k) => !reviewed.includes(k)), [], "no keyword on more than 6 icons without a reviewer note");
  const detail = { l: 0, m: 0, h: 0 };
  for (const r of rows) detail[r[4].d]++;
  assert.ok(detail.l >= 140 && detail.m >= 200 && detail.h >= 35, JSON.stringify(detail));
});

test("the directional review: about 60 icons, flag m only on the ones that mean next or back", { skip }, () => {
  assert.ok(state.dir, "the live build failed");
  const mirror = readJson(join(SRC, "mirror.json"));
  const names = new Set(state.candidates.map((c) => c.name));
  const reviewed = [...mirror.mirror, ...Object.keys(mirror.keep)];
  assert.ok(reviewed.length >= 55 && reviewed.length <= 70, `${reviewed.length} reviewed`);
  assert.equal(new Set(reviewed).size, reviewed.length, "no name twice");
  for (const n of reviewed) assert.ok(names.has(n), n);
  assert.deepEqual([...mirror.mirror].sort(), ["arrow-big-left", "arrow-big-right", "arrow-left", "arrow-right", "chevron-left", "chevron-right", "chevrons-right", "corner-down-right", "reply", "send", "undo-2"]);
  for (const n of ["play", "clock", "phone-call", "search", "check", "mic", "heart"]) assert.ok(!mirror.mirror.includes(n), `${n} never mirrors`);
  const flagged = out("index.json").filter((r) => r[4].m).map((r) => r[0]).sort();
  assert.deepEqual(flagged, [...mirror.mirror].sort());
});

test("custom icons: path-only, coordinates in 1..23, faceless names, drawn (no placeholder) when custom.json exists", { skip }, () => {
  assert.ok(state.dir, "the live build failed");
  const pack = out("pack.json").icons;
  const customs = Object.keys(pack).filter((n) => n.startsWith("cs-"));
  assert.ok(customs.length >= 9);
  for (const n of customs) {
    for (const d of pack[n].d) {
      const { bounds } = tool.pathBounds(d);
      assert.ok(bounds[0] >= 1 - 1e-6 && bounds[1] >= 1 - 1e-6 && bounds[2] <= 23 + 1e-6 && bounds[3] <= 23 + 1e-6, `${n}: [${bounds.map((v) => v.toFixed(2))}]`);
    }
    assert.equal((pack[n].s || []).length, 0, `${n}: no solid dots in a custom icon`);
    assert.ok(!/person-(ghutra|man)|face/.test(n), `${n}: faceless`);
  }
  if (existsSync(join(SRC, "custom.json"))) assert.equal(state.result.counts.placeholders, 0, `placeholders: ${state.result.warnings.join(" | ")}`);
  for (const n of ["cs-tea-glass", "cs-scooter-delivery", "cs-pos-terminal", "cs-ewallet", "cs-topup-card", "cs-price-tag-ar"]) assert.ok(state.candidates.some((c) => c.name === n), `${n} is a candidate`);
  for (const n of ["cs-date", "cs-person-ghutra", "cs-mabkhara", "cs-oud", "cs-abaya", "cs-falcon", "cs-aed"]) assert.ok(!state.candidates.some((c) => c.name === n), `${n} was retired`);
});

test("heritage and sensitive flags: the gated icons carry flag o, people and faces flag h, animals flag a, currency glyphs flag c", { skip }, () => {
  assert.ok(state.dir, "the live build failed");
  const names = new Set(state.candidates.map((c) => c.name));
  for (const [k, list] of Object.entries(tool.DEFAULT_FLAGS)) for (const n of list) assert.ok(names.has(n), `default ${k}: ${n} is a candidate`);
  const rows = new Map(out("index.json").map((r) => [r[0], r[4]]));
  for (const n of ["mosque", "dome", "moon-star", "tb-building-mosque", "cs-fanous", "cs-dallah", "cs-camel", "cs-dunes"]) assert.equal(rows.get(n).o, 1, n);
  for (const n of ["users", "baby", "cs-person-hijab", "face-angry"]) assert.equal(rows.get(n).h, 1, n);
  assert.equal(rows.get("tb-horse").a, 1);
  for (const n of ["saudi-riyal", "tb-currency-dirham", "cs-egp", "dollar-sign"]) assert.equal(rows.get(n).c, 1, n);
  assert.equal(rows.get("triangle-alert").p, "warn");
  assert.equal(rows.get("circle-x").p, "neg");
});

test("duo.json: about 60 hand-reviewed scene icons, applied to the pack", { skip }, () => {
  assert.ok(state.dir, "the live build failed");
  const duo = readJson(join(SRC, "duo.json")).icons;
  const names = Object.keys(duo);
  assert.ok(names.length >= 55 && names.length <= 70, `${names.length} reviewed`);
  const pack = out("pack.json").icons;
  for (const n of names) {
    assert.ok(pack[n], n);
    assert.equal(duo[n].n, pack[n].d.length, `${n}: reviewed with ${duo[n].n} entries`);
    assert.deepEqual(pack[n].f || [], duo[n].f, n);
  }
  for (const n of ["hourglass", "lightbulb", "heart", "clock", "rocket", "trophy", "gift", "camera"]) assert.ok(duo[n], `${n} is a scene icon`);
});

test("emoji map: about 40 pairs or more, 2 KB, no religious emoji, every value bundled", { skip }, () => {
  assert.ok(state.dir, "the live build failed");
  const map = out("emoji-map.json").map;
  const pack = out("pack.json").icons;
  assert.ok(Object.keys(map).length >= 40);
  for (const [e, n] of Object.entries(map)) {
    assert.ok(pack[n], `${e} -> ${n}`);
    assert.ok(!e.includes(VS16) && [...e].length === 1, e);
  }
  for (const e of ["🕌", "🕋", "🙏", "🤲", "📿", "✝", "☪", "🕉", "✡"]) assert.ok(!(e in map), e);
  for (const [e, n] of [["✅", "circle-check"], ["❌", "circle-x"], ["💡", "lightbulb"], ["📌", "pin"], ["🔥", "flame"], ["👉", "arrow-right"]]) assert.equal(map[e], n, e);
  assert.equal(tool.checkBlocklist("arrow-right"), null);
});

test("the cheat sheet lists every icon once and stays small enough to read whole", { skip }, () => {
  assert.ok(state.dir, "the live build failed");
  const sheet = readFileSync(join(state.dir, "icons.md"), "utf8");
  assert.ok(Buffer.byteLength(sheet) <= 6000, `${Buffer.byteLength(sheet)} B`);
  const lists = sheet.split("\n").filter((l) => /^[a-z-]+: /.test(l) && !l.startsWith("Rules"));
  const listed = lists.flatMap((l) => l.slice(l.indexOf(": ") + 2).split(" "));
  const names = Object.keys(out("pack.json").icons);
  assert.deepEqual([...listed].sort(), [...names].sort());
  assert.match(sheet, /^# Icons/);
  assert.match(sheet, /\n1\. .*\n2\. .*\n3\. .*\n4\. .*\n5\. /);
  assert.ok(!/[؀-ۿ]/.test(sheet), "ASCII only");
});

test("two builds of the live sources are byte-identical, and --check agrees with them", { skip }, () => {
  assert.ok(state.dir, "the live build failed");
  const again = tmp("live2");
  assert.equal(run(["--out", again, "--no-shards"]).status, 0);
  for (const f of ["pack.json", "index.json", "concepts.json", "objects.json", "emoji-map.json", "icons.md"]) assert.equal(readFileSync(join(again, f), "utf8"), readFileSync(join(state.dir, f), "utf8"), f);
  const check = run(["--check", "--out", state.dir, "--no-shards"]);
  assert.equal(check.status, 0, check.stderr);
  assert.match(check.stdout, /ok\s+pack\.json/);
});

test("the tool follows the global rules: no network, no clock, no randomness, nothing excluded", () => {
  for (const file of [join(ROOT, "tools", "build-icons.mjs"), join(ROOT, "tools", "icons.lock.json")]) {
    const text = readFileSync(file, "utf8");
    for (const bad of FORBIDDEN) assert.ok(!text.includes(bad), `${file}: ${bad}`);
    assert.ok(!/https?:\/\//.test(text), `${file}: no URL`);
    assert.ok(!/child_process|node:net|node:http/.test(text), `${file}: no process or network module`);
  }
  for (const file of ["candidates.json", "mirror.json", "duo.json", "emoji-map.json"]) {
    const text = readFileSync(join(SRC, file), "utf8");
    assert.ok(!/https?:\/\//.test(text) && !new RegExp("maj" + "edphotos", "i").test(text), file);
  }
});

test("at an integration beat the real shards merge (CS_ICONS_SHARDS=1)", { skip: process.env.CS_ICONS_SHARDS ? skip : "set CS_ICONS_SHARDS=1 to run the real shards" }, () => {
  const dir = tmp("shards");
  const r = run(["--out", dir, "--all", "--format", "json"]);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const j = JSON.parse(r.stdout);
  assert.ok(j.counts.concepts > 0 && j.counts.objects > 0, JSON.stringify(j.counts));
  const concepts = readFileSync(join(dir, "concepts.json"), "utf8");
  assert.ok(Buffer.byteLength(concepts) <= 140000);
});
