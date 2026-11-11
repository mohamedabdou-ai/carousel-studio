import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { loadPlanner, planSpec } from '../../../../plugins/carousel-studio/skills/carousel-design/scripts/plan.mjs';

const runtimeDir = path.join(os.tmpdir(), 'cs-r3/free');
execFileSync(process.execPath, ['tools/build.mjs', '--out', runtimeDir], { windowsHide: true });
const { CS } = loadPlanner({ runtimeDir }), F = CS.visual.free;
const plain = v => JSON.parse(JSON.stringify(v));
const sample = JSON.parse(fs.readFileSync('tests/fixtures/free/sample.spec.json', 'utf8'));

test('a tone paints a readable panel, never an empty track', () => {
  assert.throws(() => F.sanitize('<div class="f-track" data-tone="field"><span class="f-fill"></span></div>'), /data-tone.*panel/i);
  assert.doesNotThrow(() => F.sanitize('<div data-tone="field"><p data-field="body"></p></div>'));
});

test('free CSS errors name accepted logical spellings', () => {
  for (const [prop, accepted] of [['border-left', 'border-inline-start'], ['inset-block', 'inset-block-start'], ['left', 'inset-inline-start']]) {
    assert.throws(() => F.css('.f-card{' + prop + ':2px}', 's03'), new RegExp(accepted));
  }
});

test('whitelist parser preserves allowed tags, attributes, classes and literal entities', () => {
  const html = '<div class="f-card wrong cs-slot" dir="rtl" data-tone="field"><h2 data-field="items.0.title"></h2><p data-edit="">مرحبا &amp; أهلا &#x31;</p><br></div>';
  assert.equal(F.sanitize(html), html.replace('f-card wrong cs-slot', 'f-card cs-slot').replace('&#x31;', '1'));
  assert.deepEqual(plain(F.literals(html)), ['مرحبا & أهلا 1']);
});

test('untrusted HTML never imports executable nodes, style or URL attributes', () => {
  const html = '<div id="x" style="background:url(x)" onclick="evil()"><script>evil()</script><img src="x" onerror="evil()"><svg><script>evil()</script></svg><iframe src="javascript:evil()"></iframe><p class="f-good BAD" href="javascript:evil()" data-icon="javascript:evil()">safe</p><!-- hidden --></div>';
  const clean = F.sanitize(html);
  assert.equal(clean, '<div><p class="f-good">safe</p></div>');
  assert.doesNotMatch(clean, /script|onerror|onclick|style=|url\(|javascript:|href|src|<!--/i);
  assert.equal(F.sanitize('<div><unknown>drop <p>inside</p></unknown><p>keep</p></div>'), '<div><p>keep</p></div>');
  assert.equal(F.sanitize('<p data-field="__proto__.x">safe</p>'), '<p>safe</p>');
  assert.equal(F.sanitize('<span data-icon="constructor"></span><span data-object="__proto__"></span>'), '<span></span><span></span>');
  assert.equal(F.sanitize('<span data-object="book" data-size="xs"></span>'), '<span data-object="book"></span>');
  for (const s of ['<p class="unfinished', '<p x==x>', '<div>'.repeat(65)]) assert.throws(() => F.sanitize(s), { code: 'E_FREE_HTML' });
  assert.throws(() => F.sanitize('أ'.repeat(6001)), { code: 'E_FREE_HTML' });
});

test('incomplete tag tails are refused instead of silently discarded', () => {
  for (const tail of ['<img src=x onerror=alert(1)', '<p', '<p class="f-card', '</div']) {
    assert.throws(() => F.sanitize('<div>safe</div>' + tail), { code: 'E_FREE_HTML' }, tail);
  }
  assert.equal(F.sanitize('<p>&lt;img src=x onerror=alert(1)&gt;</p>'), '<p>&lt;img src=x onerror=alert(1)&gt;</p>');
});

test('CSS scopes every selector, preserves legitimate values and is deterministic', () => {
  const css = '.f-grid, h2:first-child{display:grid;grid-template-columns:1fr 2fr;gap:32px;background:linear-gradient(45deg,var(--cs-bg),var(--cs-surface));font-family:var(--cs-font-heading)}.f-grid::before{content:""}';
  const scoped = F.css(css, 's02');
  assert.match(scoped, /^\.cs-slide\[data-cs-slide="s02"\] \.cs-free \.f-grid,\.cs-slide\[data-cs-slide="s02"\] \.cs-free h2:first-child/);
  assert.equal(F.css(css, 's02'), scoped);
  assert.match(F.css('.cs-free{display:flex}', 's02'), /\.cs-free\{display:flex\}/);
});

test('CSS refuses forbidden properties, values, selector escapes and at-rules', () => {
  for (const decl of ['background:url(x)', 'background:uRl (x)', 'background:expression(x)', 'background:image-set(x)', 'background:linear-gradient(to top,red,blue)', 'background:radial-gradient(red,blue)', 'color:var(--evil)', 'font-family:Arial', 'letter-spacing:1px', 'word-spacing:2px', 'font-style:italic', 'text-align:justify', 'opacity:.1', 'position:fixed', 'position:sticky', 'transform:skew(2deg)', 'content:attr(data-field)', 'color:red!important', 'background:javascript:evil']) {
    assert.throws(() => F.css('.f-x{' + decl + '}', 's02'), { code: 'E_FREE_CSS' }, decl);
  }
  for (const css of ['@import "x";', '.f-x{color:r\\65d}', '.f-x{color:red}body{color:red}', '*{color:red}', '#id{color:red}', ':root{color:red}', '.f-x:has(p){color:red}', '[style]{color:red}', '> .f-x{color:red}', '.f-x{color:red} garbage', '.f-x{content:"bad}value"}']) assert.throws(() => F.css(css, 's02'), { code: 'E_FREE_CSS' }, css);
  assert.throws(() => F.css('.f-x{color:red}', 'a"] body'), { code: 'E_FREE_CSS' });
  for (const x of ['.cs-free + .cs-footer', '.cs-free ~ .cs-header']) assert.throws(() => F.css(x + '{display:none}', 's02'), { code: 'E_FREE_CSS' });
});

test('field paths resolve safely and the free twin includes fields plus literals only once', () => {
  const s = { id: 's02', type: 'item', title: 'عنوان', body: 'النص', ord: 2, items: [{ title: 'بند', text: 'تفصيل', value: '5' }], visual: { anchor: { word: 'stale planner label' } }, free: { html: '<p data-field="title">fallback hidden</p><p>حرفي &amp; واضح</p>' } };
  assert.equal(F.value(s, 'items.0.text'), 'تفصيل');
  for (const p of ['constructor', '__proto__.x', 'items.-1.title', 'items.01.title', 'items.0.icon']) assert.equal(F.field(p), false, p);
  const twin = plain(CS.core.text.slideText(s));
  assert.deepEqual(twin, ['عنوان', 'النص', '2', 'بند', 'تفصيل', '5', 'حرفي & واضح']);
  assert.equal(F.active({ type: 'cover', free: s.free }), false);
  assert.equal(F.active({ type: 'item', free: { html: '' } }), true);
});

test('literal editing escapes typed markup, keeps layout and never edits field fallbacks', () => {
  const html = '<div class="f-card"><p data-edit="text">old <strong>copy</strong></p><p data-field="body"></p></div>';
  const edited = F.edit(html, 0, '<img src=x onerror=evil()> & hello');
  assert.match(edited, /&lt;img src=x onerror=evil\(\)&gt; &amp; hello/);
  assert.match(edited, /class="f-card"/);
  assert.match(edited, /data-field="body"/);
  assert.throws(() => F.edit(html, 1, 'oops'), { code: 'E_FREE_HTML' });
});

test('planner ignores free slides and covers; CLI replan leaves free payload and saved visual alone', () => {
  const preset = JSON.parse(fs.readFileSync('plugins/carousel-studio/skills/carousel-design/styles/creator/preset.json', 'utf8'));
  const before = JSON.stringify(sample), p = CS.visual.plan(sample, null, preset);
  assert.deepEqual(plain(p.slides), []);
  assert.equal(JSON.stringify(sample), before);
  assert.deepEqual(plain(CS.visual.autoPreview(sample, null, preset)), [null, null, null, null]);
  const out = planSpec(sample, null, { runtime: { CS, caps: plain(CS.visual.caps()) }, replan: true });
  assert.deepEqual(out.spec.slides, sample.slides);
});
