import test from "node:test";
import assert from "node:assert/strict";
import { loadLib } from "./load-lib.mjs";

const { compose } = loadLib({ coreFiles: ["compose.js"] }).core;
const context = { lang: "ar", digits: "western" };
const plain = (html) => html.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"');
const runs = (html) => [...html.matchAll(/<bdi dir="ltr"[^>]*>([\s\S]*?)<\/bdi>/g)].map((m) => plain(m[1]));

// One outer LTR isolate across these boundaries would exchange the two runs.
for (const [copy, expected] of [
  ["جرّب API 50% اليوم", ["API", "50%"]],
  ["الشات مع Work… هيبدأ اختبار دمجهم", ["Work"]],
  ["جرّب 50% API اليوم", ["50%", "API"]],
  ["جرّب Opus 5.5 اليوم", ["Opus", "5.5"]],
  ["جرّب وMax 5x اليوم", ["Max", "5x"]],
  ["جرّب Opus 5.5. اليوم", ["Opus", "5.5"]],
  ["في الـAPI. وبـ50% من الحالات", ["API", "50%"]],
  ["في وبـ50% ثم الـAPI اليوم", ["50%", "API"]],
  ["جرّب API. 50% اليوم", ["API", "50%"]],
  ["جرّب API، 50% اليوم", ["API", "50%"]],
  ["جرّب API: 50% اليوم", ["API", "50%"]],
  ["جرّب API — 50% اليوم", ["API", "50%"]],
  ["جرّب API & 50% اليوم", ["API", "50%"]],
  ["جرّب API،50% اليوم", ["API", "50%"]],
  ["جرّب API:50% اليوم", ["API", "50%"]],
  ["جرّب API&50% اليوم", ["API", "50%"]],
  ["جرّب Alpha—Beta اليوم", ["Alpha", "Beta"]],
  ["جرّب Alpha. Beta اليوم", ["Alpha", "Beta"]],
  ["جرّب Alpha، Beta اليوم", ["Alpha", "Beta"]],
  ["جرّب Alpha: Beta اليوم", ["Alpha", "Beta"]],
  ["جرّب Yes, and don't ask again اليوم", ["Yes, and don't ask again"]],
  ['"Yes, and don\'t ask again" خطر', ['"Yes, and don\'t ask again"']],
  ["جرّب Google Search & Other اليوم", ["Google Search & Other"]]
]) {
  test("mixed text isolates the intended runs: " + copy, () => {
    const html = compose.html(copy, context);
    assert.deepEqual(runs(html), expected);
    assert.equal(plain(html).replace(/\u00a0/g, " "), copy);
  });
}

test("sentence punctuation remains outside its Latin and clitic isolates", () => {
  const html = compose.html("في الـAPI. وبـ50% من الحالات", context);
  assert.match(html, /<\/bdi><\/span>[^]*?\.[^]*?<span data-cs-bind="clitic"/);
  assert.ok(runs(html).every((run) => !/[\u0600-\u06ff]/.test(run)), "Arabic prefixes stay outside foreign runs");
});

test("version punctuation stays outside the ordered name/version binding", () => {
  const html = compose.html("جرّب وOpus 5.5. اليوم", context);
  assert.match(html, /data-cs-bind="pair" dir="ltr"/);
  assert.match(html, /<\/bdi><\/span><\/span><span[^>]*>\.<\/span>/);
});
