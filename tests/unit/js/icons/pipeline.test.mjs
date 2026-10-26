// tests/unit/js/icons/pipeline.test.mjs · the whole of tools/build-icons.mjs against a tiny fixture world (vendor, lock and sources written
// to a temp folder), so it runs anywhere. Covers: the lock, the whitelist, the outputs and their shapes, determinism, --check, the three
// merges and every rejection the build plan names (fewer than 8 forms, unknown icon, unnormalised form, bad lock hash, caps).
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { FIXTURE_CANDIDATES, FIXTURE_LUCIDE, VS16, build, cleanup, concept, heartObject, makeWorld, outJson, readJson, run, tmp, withFatha, writeJson } from "./helpers.mjs";

after(cleanup);
const world = (over) => makeWorld(tmp("pipe"), over);
const ok = (r) => assert.equal(r.status, 0, `exit ${r.status}\n${r.stderr}${r.stdout}`);
const fails = (r, status, pattern) => { assert.equal(r.status, status, `exit ${r.status}\n${r.stderr}`); assert.match(r.stderr, pattern); };

test("--help prints the usage and exits 0; a bad flag is a usage error", () => {
  const h = run(["--help"]);
  assert.equal(h.status, 0);
  assert.match(h.stdout, /node tools\/build-icons\.mjs \[--out DIR\]/);
  assert.match(h.stdout, /OUTPUTS/);
  assert.match(h.stdout, /Exit codes/);
  fails(run(["--bogus"]), 64, /E_USAGE/);
  fails(run(["--format", "yaml"]), 64, /E_USAGE/);
  fails(run(["--no-shards", "--merge-index"]), 64, /E_USAGE/);
});

test("the base build: path-only pack, index rows, emoji map, empty concept and object blocks, cheat sheet", () => {
  const w = world();
  ok(build(w, ["--no-shards"]));
  const pack = outJson(w, "pack.json");
  assert.equal(pack.schemaVersion, 2);
  assert.equal(pack.viewBox, 24);
  assert.equal(pack.dataVersion, "1.1.0");
  assert.deepEqual(Object.keys(pack.icons), ["arrow-right", "circle-check", "cs-egp", "ellipsis", "heart", "palette", "scale", "search", "server", "tb-currency-dirham"], "sorted, no opt-in brand glyph");
  for (const [name, icon] of Object.entries(pack.icons)) {
    assert.deepEqual(Object.keys(icon).filter((k) => !["d", "f", "s"].includes(k)), [], `${name}: only d f s`);
    for (const d of icon.d) assert.match(d, /^[MmLlHhVvCcSsQqTtAaZz0-9 .\-]+$/, `${name}: path grammar only`);
    for (const i of [...(icon.f || []), ...(icon.s || [])]) assert.ok(Number.isInteger(i) && i >= 0 && i < icon.d.length, `${name}: index ${i}`);
    assert.deepEqual((icon.f || []).filter((i) => (icon.s || []).includes(i)), [], `${name}: f and s are disjoint`);
  }
  assert.equal(pack.icons["circle-check"].d[0], "M2 12a10 10 0 1 0 20 0 10 10 0 1 0 -20 0z");
  assert.deepEqual(pack.icons["circle-check"].f, [0], "the ring takes the tint, the tick does not");
  assert.deepEqual(pack.icons.server.f, [0, 1], "two rounded rectangles");
  assert.deepEqual(pack.icons.server.s, [2, 3], "the two LED dots are solid");
  assert.deepEqual(pack.icons.palette.s, [1, 2], "currentColor circles are solid dots of radius 1.5");
  assert.equal(pack.icons.palette.d[1], "M12 6.5a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0 -3 0z");
  assert.equal(pack.icons.scale.d.length, 7, "the two 'zV7' paths split into a closed body and an open stem");
  const index = outJson(w, "index.json");
  assert.ok(Array.isArray(index) && index.length === 10);
  const row = (n) => index.find((r) => r[0] === n);
  assert.deepEqual(row("arrow-right"), ["arrow-right", "arrows-ui", ["next", "right", "go"], ["التالي", "يمين", "اذهب"], { d: "l", m: 1 }]);
  assert.deepEqual(row("cs-egp")[4], { d: "l", c: 1 }, "custom detail is computed from its geometry; flag c comes from custom.json");
  assert.deepEqual(row("tb-currency-dirham")[4], { d: "m", c: 1 }, "tb-currency-dirham: detail from the candidate, c from the defaults");
  assert.deepEqual(row("circle-check")[4], { d: "l" });
  assert.ok(!index.some((r) => r[0] === "tb-brand-x"));
  assert.deepEqual(outJson(w, "concepts.json").concepts, []);
  assert.deepEqual(outJson(w, "objects.json").objects, []);
  assert.deepEqual(outJson(w, "emoji-map.json").map, { "✅": "circle-check", "❤": "heart" });
  const sheet = readFileSync(join(w.out, "icons.md"), "utf8");
  for (const n of Object.keys(pack.icons)) assert.ok(sheet.includes(n), n);
  assert.ok(!sheet.includes("tb-brand-x"));
});

test("the opt-in brand glyphs only appear with --with-brands, in their own file", () => {
  const w = world();
  ok(build(w, ["--no-shards"]));
  assert.ok(!existsSync(join(w.out, "brands.json")));
  ok(build(w, ["--no-shards", "--with-brands"]));
  const b = outJson(w, "brands.json");
  assert.equal(b.optional, true);
  assert.deepEqual(Object.keys(b.icons), ["tb-brand-x"]);
  assert.equal(b.index[0][0], "tb-brand-x");
});

test("two builds are byte-identical", () => {
  const a = world(), b = world();
  ok(build(a)); ok(build(b));
  for (const f of ["pack.json", "index.json", "concepts.json", "objects.json", "emoji-map.json", "icons.md"]) assert.equal(readFileSync(join(a.out, f), "utf8"), readFileSync(join(b.out, f), "utf8"), f);
});

test("a bad lock hash, a changed package file or a missing tarball stops the build before anything is read", () => {
  const w = world();
  const lock = readJson(w.lock);
  const bad = structuredClone(lock);
  bad.sources.lucide.tarball.sha256 = "0".repeat(64);
  writeJson(w.lock, bad);
  fails(build(w), 2, /E_CONFLICT.*does not match tools\/icons\.lock\.json/s);
  assert.ok(!existsSync(join(w.out, "pack.json")), "nothing written");
  const bad2 = structuredClone(lock);
  bad2.sources.tabler.nodes.sha256 = "f".repeat(64);
  writeJson(w.lock, bad2);
  fails(build(w), 2, /tabler nodes/);
  writeJson(w.lock, lock);
  ok(build(w));
  // the package JSON changed after the lock was written
  const file = join(w.vendor, lock.sources.lucide.dir, lock.sources.lucide.nodes.file);
  writeFileSync(file, readFileSync(file, "utf8").replace("heart", "heart2"));
  fails(build(w), 2, /lucide nodes/);
  const w2 = world();
  const lock2 = readJson(w2.lock);
  lock2.sources.lucide.tarball.file = "gone.tgz";
  writeJson(w2.lock, lock2);
  fails(build(w2), 66, /tarball not found/);
  writeFileSync(w2.lock, "{ nope");
  fails(build(w2), 65, /not valid JSON/);
  writeJson(w2.lock, { sources: {} });
  fails(build(w2), 2, /sources\.lucide is missing/);
});

test("the whitelist stops the build on a vendored element or attribute it does not know", () => {
  for (const [nodes, pattern] of [
    [[["path", { d: "M1 1h2", stroke: "red" }]], /attribute "stroke"/],
    [[["path", { d: "M1 1h2", style: "x" }]], /attribute "style"/],
    [[["g", {}]], /element <g>/],
    [[["path", { d: "M1 1h2", fill: "red" }]], /fill="red"/],
    [[["path", { d: "M1 1h2", opacity: "1" }]], /attribute "opacity"/],
  ]) {
    const w = world({ lucide: { ...FIXTURE_LUCIDE, heart: nodes } });
    fails(build(w), 2, pattern);
  }
});

test("a candidate with no icon in the package, a blocklisted name and a bad keyword are refused", () => {
  fails(build(world({ candidates: [...FIXTURE_CANDIDATES, { name: "no-such-icon", category: "social", en: ["x"], ar: ["مجهول"] }] })), 2, /no icon "no-such-icon"/);
  fails(build(world({ candidates: [...FIXTURE_CANDIDATES, { name: "wine", category: "food", en: ["wine"], ar: ["نبيذ"] }] })), 2, /exclusion list/);
  fails(build(world({ candidates: [{ ...FIXTURE_CANDIDATES[0], ar: ["done"] }, ...FIXTURE_CANDIDATES.slice(1)] })), 2, /character outside the Arabic letters/);
  fails(build(world({ candidates: [{ ...FIXTURE_CANDIDATES[0], en: ["Done"] }, ...FIXTURE_CANDIDATES.slice(1)] })), 2, /lowercase/);
  fails(build(world({ candidates: [...FIXTURE_CANDIDATES, FIXTURE_CANDIDATES[0]] })), 2, /duplicate name/);
  fails(build(world({ candidates: [{ ...FIXTURE_CANDIDATES[0], colour: "red" }, ...FIXTURE_CANDIDATES.slice(1)] })), 2, /unknown key "colour"/);
  fails(build(world({ candidates: "nope" })), 2, /must be an array/);
});

test("mirror.json, duo.json and emoji-map.json are validated", () => {
  fails(build(world({ mirror: { mirror: ["nope"], keep: {} } })), 2, /not a candidate/);
  fails(build(world({ mirror: { mirror: ["heart"], keep: { heart: "x" } } })), 2, /both mirror and keep/);
  fails(build(world({ mirror: { mirror: ["heart"] } })), 2, /needs/);
  fails(build(world({ emoji: { map: { "✅": "nope" } } })), 2, /not a bundled icon/);
  fails(build(world({ emoji: { map: { ["❤" + VS16]: "heart" } } })), 2, /U\+FE0F/);
  fails(build(world({ emoji: { map: { ab: "heart" } } })), 2, /single emoji/);
  const w = world({ duo: { icons: { heart: { f: [0], n: 1 }, "circle-check": { f: [1], n: 2 } } } });
  ok(build(w));
  assert.deepEqual(outJson(w, "pack.json").icons["circle-check"].f, [1], "the hand-reviewed list replaces the derived one");
  fails(build(world({ duo: { icons: { heart: { f: [3], n: 1 } } } })), 2, /needs f/);
  fails(build(world({ duo: { icons: { heart: { f: [0], n: 4 } } } })), 2, /review it again/);
  fails(build(world({ duo: { icons: { nope: { f: [], n: 1 } } } })), 2, /not a bundled icon/);
  fails(build(world({ duo: { icons: { server: { f: [2], n: 4 } } } })), 2, /solid dot/);
});

test("custom.json: path-only, coordinates 1..23, no dots, known names; placeholders without it", () => {
  const good = { name: "cs-egp", d: ["M5 5h14v14H5z"] };
  ok(build(world({ custom: [good] })));
  fails(build(world({ custom: [{ ...good, fill: "red" }] })), 2, /unknown key "fill"/);
  fails(build(world({ custom: [{ ...good, markup: "<circle/>" }] })), 2, /unknown key "markup"/);
  fails(build(world({ custom: [{ ...good, d: ["<circle cx='1'/>"] }] })), 2, /unexpected/);
  fails(build(world({ custom: [{ ...good, d: ["M0 5h10"] }] })), 2, /leave the 1\.\.23 box/);
  fails(build(world({ custom: [{ ...good, d: ["M5 5h19"] }] })), 2, /leave the 1\.\.23 box/);
  ok(build(world({ custom: [{ ...good, d: ["M2 12a10 10 0 1 0 20 0 10 10 0 1 0 -20 0z", "M1 1h22v22H1z"] }] })));
});

test("custom.json problems, continued", () => {
  const good = { name: "cs-egp", d: ["M5 5h14v14H5z"] };
  fails(build(world({ custom: [{ ...good, d: ["M5 5h.01"] }] })), 2, /dot/);
  fails(build(world({ custom: [{ name: "cs-nope", d: ["M5 5h4"] }] })), 2, /no custom candidate/);
  fails(build(world({ custom: [{ name: "heart", d: ["M5 5h4"] }] })), 2, /needs a name like cs-name/);
  fails(build(world({ custom: [good, good] })), 2, /duplicate/);
  fails(build(world({ custom: [{ ...good, flags: { z: 1 } }] })), 2, /flags may only hold/);
  fails(build(world({ custom: [{ ...good, d: ["M5 5" + "h1v1".repeat(400) + "z"] }] })), 2, /bytes of path data/);
  fails(build(world({ custom: [{ ...good, d: [] }] })), 2, /non-empty array/);
  const w = world({ custom: null });
  const r = run(w.args(["--no-shards", "--format", "json"]));
  ok(r);
  assert.match(JSON.parse(r.stdout).warnings.join("\n"), /placeholders used: cs-egp/);
  fails(build(world({ custom: null }), ["--strict"]), 2, /not drawn yet/);
});

test("the three merges: a valid shard of each kind lands in the outputs", () => {
  const w = world({
    shards: {
      "concepts.a.json": { concepts: [concept()] },
      "objects.hero.json": { objects: [heartObject()] },
      "index.a.json": { icons: { heart: { ar: ["غرام", "هيام"], en: ["romance"], remove: ["اعجاب"], flags: { p: "warn", h: 1 } }, search: { d: "m", o: 1 } } },
    },
  });
  const r = run(w.args(["--merge-index", "--merge-concepts", "--merge-objects", "--format", "json"]));
  ok(r);
  const result = JSON.parse(r.stdout);
  assert.deepEqual(result.shards.concepts, { a: 1 });
  assert.deepEqual(result.shards.objects, { hero: 1 });
  assert.deepEqual(result.shards.index, ["a"]);
  const c = outJson(w, "concepts.json").concepts;
  assert.equal(c.length, 1);
  assert.deepEqual(c[0], { id: "love", cat: "social", forms: concept().forms, icons: ["heart", "circle-check", "search"], object: "heart" }, "compact: nulls are omitted");
  const o = outJson(w, "objects.json");
  assert.equal(o.viewBox, 48);
  assert.deepEqual(o.objects[0], { id: "heart", viewBox: 48, paths: [{ d: "M10 10h28v28H10z", role: "base" }, { d: "M16 16h16v16H16z", role: "hi" }] });
  const heart = outJson(w, "index.json").find((x) => x[0] === "heart");
  assert.deepEqual(heart[3], ["قلب", "حب", "غرام", "هيام"], "ar adds, remove deletes, all folded");
  assert.deepEqual(heart[2], ["heart", "love", "like", "romance"]);
  assert.deepEqual(heart[4], { d: "l", p: "warn", h: 1 });
  assert.deepEqual(outJson(w, "index.json").find((x) => x[0] === "search")[4], { d: "m", o: 1 });
  assert.match(readFileSync(join(w.out, "icons.md"), "utf8"), /\(.*search.*\)/, "an o-flagged icon is listed with the gated ones");
});

test("a merge flag with no shard is an input error; --no-shards ignores broken shards", () => {
  const w = world();
  fails(build(w, ["--merge-index"]), 66, /no index shard/);
  fails(build(w, ["--merge-concepts"]), 66, /no concepts shard/);
  fails(build(w, ["--merge-objects"]), 66, /no objects shard/);
  const w2 = world({ shards: { "concepts.a.json": { concepts: [{ id: "x" }] } } });
  fails(build(w2), 2, /concepts/);
  ok(build(w2, ["--no-shards"]));
});

test("the concept merge rejects fewer than 8 forms, unknown icons, unnormalised forms and the rest", () => {
  const bad = (c, pattern, extra = {}) => fails(build(world({ shards: { "concepts.a.json": { concepts: [c], ...extra } } })), 2, pattern);
  bad(concept({ forms: { eg: ["حب", "عشق", "بحب"], gulf: ["هيام", "غرام"], lev: ["ولع"], msa: ["هوي"] } }), /7 distinct forms, at least 8/);
  bad(concept({ forms: { eg: ["حب", "عشق", "بحب"], msa: ["هوي", "شغف", "ود"], loan: ["لوف"] } }), /7 distinct forms/);
  bad(concept({ icons: ["heart", "no-such-icon"] }), /unknown icon "no-such-icon"/);
  bad(concept({ forms: { ...concept().forms, msa: ["هوي", "شغف", "مدرسة"] } }), /not normalised \(expected "مدرسه"/);
  bad(concept({ forms: { ...concept().forms, msa: ["هوي", "شغف", "أفكار"] } }), /not normalised/);
  bad(concept({ forms: { ...concept().forms, msa: ["هوي", "شغف", "love"] } }), /not normalised/);
  bad(concept({ forms: { ...concept().forms, msa: ["هوي", "شغف", withFatha("كتب")] } }), /not normalised/);
  bad(concept({ forms: { ...concept().forms, msa: ["هوي", "شغف", "حب كبير جدا اوي"] } }), /more than 3 tokens/);
  bad(concept({ forms: { ...concept().forms, msa: ["هوي", "شغف", "و"] } }), /too short/);
  bad(concept({ forms: { ...concept().forms, copt: ["حب"] } }), /unknown dialect list "copt"/);
  bad(concept({ primitive: "rainbow" }), /primitive must be one of/);
  bad(concept({ pol: "sad" }), /pol must be neg, warn or null/);
  bad(concept({ object: "unicorn" }), /unknown object/);
  bad(concept({ cat: "weather" }), /unknown category/);
  bad(concept({ id: "Love Me" }), /id must be kebab-case/);
  bad(concept({ home: "ساعة" }), /home must be a normalised word/);
  bad(concept({ icons: [] }), /non-empty array/);
  bad(concept({ colour: "red" }), /unknown key "colour"/);
  const dup = world({ shards: { "concepts.a.json": { concepts: [concept()] }, "concepts.b.json": { concepts: [concept()] } } });
  fails(build(dup), 2, /duplicate concept id \(also in concepts\.a\.json\)/);
  ok(build(world({ shards: { "concepts.a.json": [concept({ primitive: "versus", pol: "neg", home: "عنوان", object: "bag" })] } })), "a bare array works; bag is the alias of shopping-bag");
});

test("concept icons that were retired or are opt-in brand glyphs are dropped with a warning, not an error", () => {
  const w = world({ shards: { "concepts.a.json": { concepts: [concept({ icons: ["heart", "cs-date", "tb-brand-x", "search"] })] } } });
  const r = run(w.args(["--format", "json"]));
  ok(r);
  const out = JSON.parse(r.stdout);
  assert.equal(out.warnings.filter((x) => /retired|opt-in brand glyph/.test(x)).length, 2);
  assert.deepEqual(outJson(w, "concepts.json").concepts[0].icons, ["heart", "search"]);
});

test("the index merge rejects unknown icons, Latin keywords, flag m and an icon left without keywords", () => {
  const bad = (icons, pattern) => fails(build(world({ shards: { "index.a.json": { icons } } })), 2, pattern);
  bad({ nope: { ar: ["شيء"] } }, /unknown icon/);
  bad({ heart: { ar: ["love"] } }, /character outside the Arabic letters/);
  bad({ heart: { en: ["love!"] } }, /lowercase/);
  bad({ heart: { flags: { m: 1 } } }, /flag m comes from mirror\.json/);
  bad({ heart: { flags: { d: "x" } } }, /flag d must be l, m or h/);
  bad({ heart: { flags: { p: "sad" } } }, /flag p must be neg, warn or null/);
  bad({ heart: { flags: { h: "yes" } } }, /flag h must be 1/);
  bad({ heart: { flags: { z: 1 } } }, /unknown flag/);
  bad({ heart: { colour: "x" } }, /unknown key "colour"/);
  bad({ heart: { remove: ["قلب", "حب", "اعجاب"] } }, /no Arabic keyword/);
  bad({ heart: { ar: "قلب" } }, /must be an array of strings/);
  const ok1 = world({ shards: { "index.a.json": [{ name: "heart", ar: ["ود"], h: 0, p: "neg" }], "index.b.json": { heart: ["غرام"], "cs-falcon": { ar: ["صقر"] } } } });
  const r = run(ok1.args(["--format", "json"]));
  ok(r);
  const w = JSON.parse(r.stdout).warnings.join("\n");
  assert.match(w, /"cs-falcon" was retired/);
  assert.match(w, /"heart" is patched by shards a, b/);
  const row = outJson(ok1, "index.json").find((x) => x[0] === "heart");
  assert.deepEqual(row[3], ["قلب", "حب", "اعجاب", "ود", "غرام"]);
  assert.deepEqual(row[4], { d: "l", p: "neg" });
});

test("the object merge: closed paths, 0..48, at most 12 paths and 1.5 KB, the 40 ids, no duplicates", () => {
  const bad = (o, pattern) => fails(build(world({ shards: { "objects.hero.json": { objects: [o] } } })), 2, pattern);
  bad(heartObject({ paths: [{ d: "M10 10h28v28", role: "base" }] }), /every sub-path must be closed/);
  bad(heartObject({ paths: [{ d: "M10 10h40v20H10z", role: "base" }] }), /leave the 0\.\.48 grid/);
  bad(heartObject({ paths: [{ d: "M-1 10h20v20H-1z", role: "base" }] }), /leave the 0\.\.48 grid/);
  bad(heartObject({ paths: Array.from({ length: 13 }, () => ({ d: "M10 10h5v5H10z", role: "base" })) }), /13 paths, at most 12/);
  bad(heartObject({ paths: [{ d: "M10 10h5v5H10z", role: "tint" }] }), /role must be base, shade or hi/);
  bad(heartObject({ paths: [{ d: "M10 10h5v5H10z", role: "base", fill: "red" }] }), /unknown key "fill"/);
  bad(heartObject({ id: "unicorn" }), /not one of the 40 objects/);
  bad(heartObject({ viewBox: 24 }), /viewBox must be 48/);
  bad(heartObject({ paths: [] }), /non-empty array/);
  bad(heartObject({ paths: [{ d: Array.from({ length: 150 }, (_, i) => `M${1 + (i % 40)} ${1 + Math.floor(i / 40)}h1v1H${1 + (i % 40)}z`).join(""), role: "base" }] }), /bytes of path data/);
  bad(heartObject({ paths: [{ d: "M10 10h5v5H10z M20 20h5", role: "base" }] }), /every sub-path must be closed/);
  const dup = world({ shards: { "objects.hero.json": { objects: [heartObject()] }, "objects.rest.json": { objects: [heartObject()] } } });
  fails(build(dup), 2, /duplicate object/);
  ok(build(world({ shards: { "objects.hero.json": [heartObject({ id: "bag" })] } })));
  const strictShards = { "concepts.a.json": { concepts: [concept()] }, "index.a.json": { icons: { heart: { ar: ["ود"] } } }, "objects.hero.json": { objects: [heartObject()] } };
  fails(build(world({ shards: strictShards }), ["--strict"]), 2, /the 12 hero objects are required/);
});

test("size caps are enforced on every output", () => {
  const letters = "ابتثجحخدذرزسشصضطظعغفقكلمنهوي";
  const word = (i) => [0, 1, 2, 3, 4].map((k) => letters[Math.floor(i / 28 ** k) % 28]).join("");
  const many = Array.from({ length: 7000 }, (_, i) => word(i));
  fails(build(world({ shards: { "index.a.json": { icons: { heart: { ar: many } } } } })), 2, /index\.json is \d+ B, the limit is 70000 B/);
});

test("--check: ok on fresh outputs, DIFFERS on a stale one, absent before the first generation; --strict makes absence an error", () => {
  const w = world();
  const absent = run(w.args(["--check"]));
  ok(absent);
  assert.match(absent.stdout, /absent\s+pack\.json/);
  fails(run(w.args(["--check", "--strict"])), 66, /no index shard/);
  ok(build(w));
  const fresh = run(w.args(["--check"]));
  ok(fresh);
  assert.match(fresh.stdout, /ok\s+pack\.json/);
  assert.equal(readFileSync(join(w.out, "pack.json"), "utf8").endsWith("\n"), true);
  // CRLF checkouts do not count as a difference
  writeFileSync(join(w.out, "emoji-map.json"), readFileSync(join(w.out, "emoji-map.json"), "utf8").replace(/\n/g, "\r\n"));
  ok(run(w.args(["--check"])));
  writeFileSync(join(w.out, "pack.json"), readFileSync(join(w.out, "pack.json"), "utf8").replace("heart", "hearts"));
  const stale = run(w.args(["--check"]));
  fails(stale, 2, /pack\.json differs from a fresh build/);
  assert.match(stale.stdout + stale.stderr, /pack\.json/);
});

test("--check without the vendored packages validates the committed outputs on their own", () => {
  const w = world();
  ok(build(w));
  const args = ["--check", "--vendor", join(w.dir, "nowhere"), "--out", w.out];
  const r = run(args);
  ok(r);
  assert.match(r.stdout, /standalone/);
  writeFileSync(join(w.out, "index.json"), "[");
  fails(run(args), 2, /index\.json is not valid JSON/);
  writeFileSync(join(w.out, "index.json"), '["see https://x"]');
  fails(run(args), 2, /contains "http"/);
});

test("outputs never contain http, a closing script tag or an HTML comment opener", () => {
  const w = world({ candidates: [{ ...FIXTURE_CANDIDATES[0], en: ["see http docs"] }, ...FIXTURE_CANDIDATES.slice(1)] });
  fails(build(w), 2, /contains "http"/);
});

test("--format json prints one document on stdout with the counts", () => {
  const w = world();
  const r = run(w.args(["--format", "json", "--no-shards"]));
  ok(r);
  const j = JSON.parse(r.stdout);
  assert.equal(j.ok, true);
  assert.equal(j.counts.icons, 10);
  assert.equal(j.counts.lucide, 8);
  assert.equal(j.counts.tabler, 1);
  assert.equal(j.counts.custom, 1);
  assert.equal(j.counts.brandGlyphs, 1);
  assert.equal(j.files.map((f) => f.file).join(), "pack.json,index.json,concepts.json,objects.json,emoji-map.json,icons.md");
});
