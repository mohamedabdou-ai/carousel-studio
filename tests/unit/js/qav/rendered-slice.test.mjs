import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { withQav, allIds } from './harness.mjs';

const box = (x, y, w, h, attrs = '', content = '') => `<div ${attrs} style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px">${content}</div>`;
const icon = (x, y, size = 100) => `<svg class="cs-icon" style="position:absolute;left:${x}px;top:${y}px;width:${size}px;height:${size}px" viewBox="0 0 100 100"><rect x="1" y="1" width="98" height="98" fill="#111"/></svg>`;
const owner = (x, y, w, h, content = '') => `<div data-owner="1" style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;background:#ddd;border:4px solid #111;box-sizing:border-box">${content}</div>`;
const content = s => `<div class="cs-content">${s}</div>`;
const short = box(0, 0, 700, 100, 'data-slot-key="s02.title"', '<span class="cs-ln">عنوان واضح</span>');

test('Q3a: rendered acceptance, real QA integration, deterministic runs', async t => {
  await withQav(async h => {
    async function twice(input, ids = allIds) {
      const a = await h.runGates(input, ids), b = await h.runGates(input, ids);
      assert.deepEqual(a, b, 'same DOM and spec yield byte-equal findings, stats and boxes');
      for (const f of a) for (const bundle of [f.msg, f.fix]) for (const text of Object.values(bundle || {})) {
        assert.ok(!text.includes('{'), `${f.rule}: unresolved placeholder: ${text}`);
      }
      return a;
    }
    await t.test('five cheats and old 144 x 400 empty frame fail', async () => {
      const cheats = {
        'empty-card': [owner(0, 180, 852, 344), 'D9.container-fill'],
        'lone-icon-panel': [owner(0, 180, 852, 344, icon(376, 120)), 'D9.container-fill'],
        'drenched-ground': [owner(0, 0, 852, 998, '<span data-slot-key="s02.body">نص واضح</span>'), 'D9.container-fill'],
        'scattered-marks': [[150, 400, 700].map(y => `<svg class="cs-marks" style="position:absolute;top:${y}px;width:852px;height:80px"><rect width="852" height="80" fill="#111"/></svg>`).join(''), 'D9.fill'],
        'pattern-wall': [owner(0, 180, 852, 700, '<svg class="cs-bg" width="852" height="700"><rect width="852" height="700" fill="#111"/></svg>'), 'D9.container-fill'],
        'old-frame': [owner(400, 160, 144, 400), 'D9.container-fill']
      };
      for (const [name, [html, rule]] of Object.entries(cheats)) {
        const r = await twice(content(short + html));
        assert.ok(r.some(f => f.rule === rule && f.prospect === true), `${name} must fail ${rule}: ${JSON.stringify(r)}`);
        if (name === 'drenched-ground') {
          const message = r.find(f => f.rule === rule).msg.en;
          assert.match(message, /minimum is 80%/);
        }
        assert.ok(r.every(f => f.prospect && f.sev !== 'BLOCK'));
        assert.ok(r.filter(f => f.rule.startsWith('D9.')).every(f => f.sev === 'NOTE'), 'stage 0 caps dead-space');
      }
    });
    await t.test('filled rows pass; rejected empty owners never gain interior occupancy', async () => {
      const rows = [0, 200, 400, 600, 800].map(y => box(16, y + 10, 810, 150, '', `<svg width="810" height="150"><rect width="810" height="150" fill="#111"/></svg>`)).join('');
      const r = await twice(content(`<div class="cs-art">${owner(0, 0, 852, 998, rows)}</div>`), ['D9.band', 'D9.rect', 'D9.fill', 'D9.container-fill', 'VA2.anchor-size']);
      assert.equal(r.length, 0, JSON.stringify(r));
      const gradient = content(`<div class="cs-art">${owner(0, 0, 852, 998, rows).replace('background:#ddd;border:4px solid #111', 'background:linear-gradient(#fff,#ddd);border:0')}</div>`);
      const g = await twice(gradient, ['D9.container-fill']);
      assert.equal(g.length, 0);
      assert.equal(g.boxes.find(b => b.kind === 'owner').fill, 1);
      const partial = [0, 250, 500, 750].map(y => box(16, y + 10, 810, 110, '', '<svg width="810" height="110"><rect width="810" height="110" fill="#111"/></svg>')).join('');
      const big = await twice(content(owner(0, 0, 852, 998, partial)), ['D9.container-fill']);
      assert.equal(big[0].prospect, false);
      assert.match(big[0].msg.en, /only 73%.*minimum is 80%/);
    });
    await t.test('Arabic 30px is FIX; chart/tool/digits floors and data-floor cannot weaken it', async () => {
      const cases = [['body', 'نص واضح', 30, 1], ['body', 'نص واضح', 36, 0], ['chart', '42', 36, 1], ['tool', 'Figma', 30, 0], ['tool', 'نص واضح', 30, 1], ['tool', '42', 30, 1], ['numeral', '42', 199, 1], ['word', 'واضح', 219, 1]];
      for (const [role, text, px, count] of cases) {
        const r = await twice(content(`<div class="cs-art"><span class="cs-art-label" data-slot-key="s02.art.0" data-role="${role}" data-floor="1" style="font-size:${px}px">${text}</span></div>`), ['D10.art-label']);
        assert.equal(r.length, count, `${role}/${text}/${px}`);
        if (count) { assert.equal(r[0].sev, 'FIX'); assert.equal(r[0].el, 's02.art.0'); }
      }
    });
    await t.test('nesting depth 3 fails, depth 2 passes', async () => {
      for (const depth of [2, 3]) {
        let html = icon(0, 0);
        for (let i = 0; i < depth; i++) html = owner(0, 0, 600 - i * 20, 600 - i * 20, html);
        const r = await twice(content(`<div class="cs-art">${html}</div>`), ['D10.nesting']);
        assert.equal(r.length, depth === 3 ? 1 : 0);
      }
    });
    await t.test('three sibling icon-over-title tiles fail; side-by-side rows pass', async () => {
      for (const top of [true, false]) {
        const tiles = [0, 1, 2].map(i => `<article class="cs-item" style="position:absolute;left:${i * 280}px;width:260px;height:260px">${icon(0, 0)}${box(top ? 0 : 110, top ? 120 : 0, 150, 80, 'data-part="title"', 'عنوان')}</article>`).join('');
        const r = await twice(content(tiles), ['D10.icon-tile-stack']); assert.equal(r.length, top ? 1 : 0);
      }
    });
    await t.test('SVG strokes measured in canvas px, independent of slide preview scale', async () => {
      for (const scale of [1, 0.36]) for (const width of [1, 5]) {
        const html = content(`<div class="cs-art"><svg width="240" height="240" viewBox="0 0 24 24"><path d="M2 2L22 22" fill="none" stroke="#111" stroke-width="${width / 10}"/></svg></div>`);
        const r = await twice({ html, scale }, ['D10.stroke-feed']); assert.equal(r.length, width === 1 ? 1 : 0);
      }
    });
    await t.test('collector emits Box, excludes decor/marks/chrome/ghost/tint, samples diagonal', async () => {
      const html = content(short + `<div class="cs-art"><svg width="800" height="800"><path d="M0 0L800 800" stroke="#111" stroke-width="5" fill="none"/></svg></div><span data-ghost="1">999</span><span style="color:#ddd">خافت</span><div class="cs-decor">زخرفة</div>`);
      const a = await twice(html, ['D9.rect']);
      assert.ok(a.boxes.some(b => b.path && b.path.length > 2));
      assert.ok(a.boxes.every(b => ['text', 'ink', 'owner', 'pattern', 'image', 'mark', 'decor'].includes(b.kind)));
      assert.equal(a.boxes.filter(b => b.kind === 'text').length, 1);
      assert.ok(a.boxes.filter(b => b.kind === 'text').every(b => b.y >= 0 && b.y < 100), 'black title, not tint, is counted at body-zone origin');
      const scaled = await twice({ html, scale: 0.36 }, ['D9.rect']); assert.deepEqual(a.boxes, scaled.boxes);
    });
    await t.test('glyph-icon belongs only to the text gate owner', async () => {
      const scopes = await h.page.evaluate(() => ({ text: CS.qa._.gates.text.filter(g => g.ids.includes('D10.glyph-icon')).length, rendered: CS.qa._.gates.rendered.filter(g => g.ids.includes('D10.glyph-icon')).length }));
      assert.deepEqual(scopes, { text: 1, rendered: 0 });
    });
    await t.test('local backgrounds preserve white text; faint tint is excluded; unresolved ground keeps text', async () => {
      const lines = [0, 1, 2, 3, 4].map(i => box(0, i * 160, 800, 100, `data-slot-key="s02.art.${i}"`, 'نص واضح')).join('');
      for (const [bg, ink] of [['#073d32', '#fff'], ['#eee', '#111']]) {
        const r = await twice({ html: content(short + `<div data-owner="1" style="position:absolute;top:130px;width:852px;height:850px;background:${bg};color:${ink}">${lines}</div>` ) }, ['D9.container-fill']);
        assert.equal(r.boxes.filter(b => b.kind === 'text' && b.ownerOf).length, 5);
        assert.equal(r.boxes.filter(b => b.kind === 'text' && !b.ownerOf).length, 1);
      }
      const r = await twice(content(short + box(0, 200, 700, 100, 'data-slot-key="s02.body"', '<span style="color:#ddd">خافت</span>')), ['D9.fill']);
      assert.equal(r.boxes.filter(b => b.kind === 'text').length, 1);
      const ungrounded = await h.page.evaluate(() => {
        const root = document.querySelector('.cs-slide'); root.style.setProperty('background', 'transparent', 'important');
        return CS.qav.collectBoxes(root).filter(b => b.kind === 'text').length;
      });
      assert.equal(ungrounded, 2);
    });
    await t.test('VA2 checks share, glyph pixels, mock width, and both compare sides', async () => {
      const share = await twice(content(`<div class="cs-art">${icon(0, 0, 200)}</div>`), ['VA2.anchor-size']);
      assert.equal(share[0].prospect, true); assert.match(share[0].msg.en, /needs 24/);
      const glyph = await twice(content(`<div class="cs-art">${icon(0, 0, 100)}</div>`), ['VA2.anchor-size']);
      assert.match(glyph[0].msg.en, /small: 98; it needs 160/);
      for (const kind of ['mock', 'chart']) for (const width of [400, 700]) {
        const r = await twice({ html: content(`<div class="cs-art" style="width:${width}px;height:800px">${icon(0, 0, 700)}</div>`), slide: { visual: { anchor: { kind } } } }, ['VA2.anchor-size']);
        assert.equal(r.length, width === 400 ? 1 : 0);
        if (r.length) assert.match(r[0].msg.en, /small: 46.9; it needs 60/);
      }
      for (const height of [200, 450, 550]) {
        const sides = [0, 1].map(i => box(i * 426, 0, 400, height, `class="cs-side" data-slot-key="s02.sides.${i}"`, icon(0, 0, 160))).join('');
        const r = await twice({ html: content(sides), slide: { type: 'compare' } }, ['VA2.anchor-size']);
        assert.equal(r.length, height === 550 ? 0 : 2);
        if (r.length) assert.ok(r.every(f => f.prospect === (height === 200) && f.msg.en.includes('needs 12')));
      }
    });
    await t.test('band reports the longest empty run rather than the whole zone', async () => {
      const r = await twice(content(icon(0, 0, 300)), ['D9.band']);
      const match = r[0].msg.en.match(/y (\d+) to (\d+)/);
      assert.ok(Number(match[1]) > 550 && Number(match[1]) < 650, r[0].msg.en);
      assert.equal(Number(match[2]), 1259);
    });
    await t.test('missing visual measure does not suppress D10 findings', async () => {
      await h.page.evaluate(() => { window.__measure = CS.visual.deadSpace; delete CS.visual.deadSpace; });
      try {
        const r = await twice(content('<span class="cs-art-label" data-role="body" style="font-size:30px">نص واضح</span>'));
        assert.deepEqual(r.map(f => f.rule), ['D10.art-label']);
      } finally { await h.page.evaluate(() => { CS.visual.deadSpace = window.__measure; delete window.__measure; }); }
    });
    await t.test('real creator and poster fixture decks compose and execute every shipped gate', async () => {
      const fixture = JSON.parse(fs.readFileSync(new URL('../../../../docs/examples/spec.example.json', import.meta.url), 'utf8'));
      for (const preset of ['creator', 'poster']) {
        const spec = structuredClone(fixture); spec.style = { presetId: `${preset}@1.0`, visualMode: 'directed' };
        const r = await twice(spec);
        for (const id of allIds) assert.ok(r.stats.gates[id] > 0, id);
        assert.equal(await h.page.locator('.cs-slide').count(), 8);
        assert.equal(await h.page.locator('[data-qav-fixture]').count(), 0);
        assert.ok(r.boxes.some(b => b.kind === 'text'));
      }
      await h.page.locator('.cs-slide').nth(1).screenshot({ path: path.join(path.dirname(h.work), 'composed-poster.png') });
    });
    await t.test('all shipped gates execute on clean input and disabled mode is respected', async () => {
      const r = await twice(content(short));
      for (const id of allIds) assert.equal(r.stats.gates[id], 1, id);
      assert.equal((await twice({ html: content(short), visualMode: 'off' })).length, 0);
      const active = await twice({ html: content(short), stage: 1 }, ['D9.rect']); assert.equal(active[0].sev, 'FIX');
    });
    // A reproducible rendered fixture for visual inspection, kept outside the repository.
    await h.runGates(content(short + owner(400, 160, 144, 400)));
    const png = path.join(path.dirname(h.work), 'empty-frame.png');
    await h.page.locator('.cs-slide').screenshot({ path: png });
    assert.ok(fs.statSync(png).size > 1000);
  });
});
