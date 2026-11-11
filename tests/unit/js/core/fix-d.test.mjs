// Package D regressions: private source builds, real fonts and real Chromium geometry.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { withQav } from '../qav/harness.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const sk = path.join(root, 'plugins/carousel-studio/skills/carousel-design');
const read = p => fs.readFileSync(path.join(sk, p), 'utf8');
const json = p => JSON.parse(read(p));
const presets = ['swiss', 'creator', 'notebook', 'poster', 'interface', 'heritage'];

test('D6: archetype reference variants and fields agree with the templates', () => {
  const doc = read('references/archetypes.md'), html = read('templates/archetypes.html');
  for (const type of ['item', 'checklist', 'summary', 'cta', 'offer']) {
    const cells = doc.split('\n').find(line => line.startsWith('|') && line.split('|')[2]?.trim() === '`' + type + '`').split('|');
    const template = html.match(new RegExp('<template\\b[^>]*data-archetype="' + type + '"[^>]*>'))[0];
    assert.equal(cells[4].trim().replaceAll('`', ''), /data-variants="([^"]+)"/.exec(template)[1], type);
    if (['checklist', 'summary', 'cta', 'offer'].includes(type)) assert.ok(cells[3].includes('`media`'), type + ' documents media');
    if (type === 'summary') assert.match(cells[3], /`cta`.*opt/);
    if (type === 'cta') assert.doesNotMatch(cells[5], /only slide/);
  }
});

test('package D rendered regressions', async t => {
  await withQav(async h => {
    await h.page.evaluate(({ presets, free, copy, ortho }) => {
      for (const p of presets) CS.core.registry.registerPreset(p.preset, p.css);
      CS.visual._.blocks = { 'cs-free-design': free };
      CS.core.registry.registerRules({ ...__qavBundle, copy, ortho });
      window.dCompose = (slides, extra = {}, preset = 'creator') => {
        const spec = { canvas: { w: 1080, h: 1440 }, locale: { dialect: 'eg', digits: 'western' },
          style: { presetId: preset + '@1.0', visualMode: 'off' }, slides, ...extra };
        const tokens = CS.core.resolve.post(spec, null);
        return { spec, els: slides.map(s => {
          const el = CS.core.compose.slide(spec, s, CS.core.resolve.slide(tokens, s), null, { mode: 'export' });
          document.body.appendChild(el); return el;
        }) };
      };
    }, { presets: presets.map(id => ({ preset: json(`styles/${id}/preset.json`), css: read(`styles/${id}/decor.css`) })),
      free: json('data/free-design.json'), copy: json('data/rules/copy.json'), ortho: json('data/rules/ortho.json') });

    for (const [copy, pieces] of [
      ['الساعة 10:30 ص', ['10', ':', '30']], ['نسبة 3:1', ['3', ':', '1']],
      ['9:00-10:30', ['9', ':', '00', '-', '10', ':', '30']],
      ['Q&A', ['Q', '&', 'A']], ['AT&T', ['AT', '&', 'T']],
      ['Google; Apple', ['Google', ';', 'Apple']], ['السعر $50 اليوم', ['$', '50']]
    ]) await t.test('D7: LTR ink order for ' + copy, async () => {
      const rows = await h.page.evaluate(async ({ copy, pieces, presets }) => {
        const out = [];
        for (const preset of presets) {
          const { els: [el] } = dCompose([{ id: 's03', type: 'item', title: 'عنوان', body: 'نص' }], {}, preset);
          const slot = el.querySelector('[data-slot="body"]');
          slot.style.cssText += ';width:852px;font-size:44px;white-space:nowrap';
          slot.innerHTML = CS.core.compose.html(copy, { lang: 'ar', digits: 'western' });
          await document.fonts.ready;
          // Locate each occurrence by a source-text offset, including repeated colons.
          const walker = document.createTreeWalker(slot, NodeFilter.SHOW_TEXT), nodes = [];
          let node, offset = 0;
          while ((node = walker.nextNode())) { nodes.push({ node, offset }); offset += node.length; }
          let from = 0;
          const boxes = pieces.map(piece => {
            const at = slot.textContent.indexOf(piece, from); from = at + piece.length;
            const first = nodes.find(n => n.offset <= at && n.offset + n.node.length > at);
            const last = nodes.find(n => n.offset < from && n.offset + n.node.length >= from);
            const range = document.createRange(); range.setStart(first.node, at - first.offset); range.setEnd(last.node, from - last.offset);
            const r = range.getBoundingClientRect(); return { text: piece, x: r.x, right: r.right, y: r.y, h: r.height };
          });
          out.push({ preset, boxes, text: slot.textContent }); el.remove();
        }
        return out;
      }, { copy, pieces, presets });
      for (const row of rows) {
        assert.equal(row.text.replace(/\u00a0/g, ' '), copy);
        for (let i = 1; i < row.boxes.length; i++) {
          assert.ok(row.boxes[i].x >= row.boxes[i - 1].right - 1, JSON.stringify(row));
          assert.ok(Math.abs(row.boxes[i].y - row.boxes[0].y) < row.boxes[0].h / 2, JSON.stringify(row));
        }
      }
    });

    await t.test('D7: earlier clitic runs retain paragraph order and the visible gap', async () => {
      const rows = await h.page.evaluate(async presets => {
        const out = [];
        for (const preset of presets) {
          const { els: [el] } = dCompose([{ id: 's03', type: 'item', title: 'عنوان', body: 'نص' }], {}, preset);
          const slot = el.querySelector('[data-slot="body"]');
          slot.style.cssText += ';width:852px;font-size:44px;white-space:nowrap';
          slot.innerHTML = CS.core.compose.html('في الـAPI. وبـ50% من الحالات', { lang: 'ar', digits: 'western' });
          const runs = [...slot.querySelectorAll('bdi.cs-ltr')].map(n => ({ text: n.textContent, x: n.getBoundingClientRect().x }));
          slot.innerHTML = CS.core.compose.html('وGoogle', { lang: 'ar', digits: 'western' });
          await document.fonts.ready;
          const [clitic, latin] = [...slot.querySelectorAll('.w')];
          out.push({ preset, runs, gap: clitic.getBoundingClientRect().left - latin.getBoundingClientRect().right, text: slot.textContent });
          el.remove();
        }
        return out;
      }, presets);
      for (const row of rows) {
        assert.deepEqual(row.runs.map(r => r.text), ['API', '50%']);
        assert.ok(row.runs[0].x > row.runs[1].x, JSON.stringify(row));
        assert.ok(row.gap >= 44 * 0.1, JSON.stringify(row));
        assert.equal(row.text, 'وGoogle');
      }
    });

    for (const digits of ['western', 'arabic-indic']) await t.test('D8: Latin names bind integers; B1 detects only a split pair, digits=' + digits, async () => {
      const rows = await h.page.evaluate(async digits => {
        const out = [];
        for (const name of ['iPhone 15', 'GPT 5', 'Opus 5']) {
          const { spec, els: [el] } = dCompose([{ id: 's03', type: 'item', title: 'عنوان', body: 'قبل ' + name }], { locale: { dialect: 'eg', digits } });
          const slot = el.querySelector('[data-slot="body"]');
          slot.style.cssText += ';inline-size:120px;font-size:44px;text-wrap:wrap';
          await document.fonts.ready;
          const displayed = CS.core.text.digits.convert(name, digits);
          const words = [...slot.querySelectorAll('.w')].filter(n => displayed.split(' ').includes(n.textContent));
          const pair = slot.querySelector('[data-cs-bind="pair"]');
          const deck = { slides: [{ id: 's03', el, tokens: {} }] };
          const good = await CS.qa.runRendered({ spec, deck }, { gates: ['B1'] });
          const ys = words.map(n => n.getBoundingClientRect().y);
          if (pair) pair.replaceWith(...pair.childNodes);
          words.forEach(n => { n.style.display = 'block'; });
          const bad = await CS.qa.runRendered({ spec, deck }, { gates: ['B1'] });
          out.push({ name, text: slot.textContent, bound: !!pair, ys, good: good.filter(r => r.rule === 'B1.unbound-pair').map(r => r.rule), bad: bad.filter(r => r.rule === 'B1.unbound-pair').map(r => r.rule) }); el.remove();
        }
        return out;
      }, digits);
      for (const row of rows) {
        assert.ok(row.bound, row.name);
        assert.equal(row.ys.length, 2, row.name);
        assert.equal(row.text, 'قبل ' + (digits === 'western' ? row.name : row.name.replace(/[0-9]/g, n => '٠١٢٣٤٥٦٧٨٩'[+n])));
        assert.ok(Math.abs(row.ys[0] - row.ys[1]) < 1, JSON.stringify(row));
        assert.deepEqual(row.good, []);
        assert.deepEqual(row.bad, ['B1.unbound-pair']);
      }
    });

    await t.test('D1: absent and unresolved optional media use the same text layout in six presets', async () => {
      const rows = await h.page.evaluate(presets => {
        const out = [];
        for (const preset of presets) {
          const slide = { id: 's03', type: 'step', variant: 'media', title: 'ابدأ هنا', body: 'فكرة واضحة' };
          const measure = media => {
            const { els: [el] } = dCompose([{ ...slide, media }], {}, preset);
            const main = el.querySelector('.cs-content'), title = el.querySelector('[data-slot="title"]');
            const m = main.getBoundingClientRect(), r = title.getBoundingClientRect();
            const v = { slots: el.querySelectorAll('.cs-media-slot').length, top: r.top - m.top, h: r.height, contentH: m.height };
            el.remove(); return v;
          };
          out.push({ preset, absent: measure(undefined), missing: measure({ slot: 'photo', assetId: 'missing' }) });
        }
        return out;
      }, presets);
      for (const row of rows) assert.deepEqual(row.missing, row.absent, row.preset);
    });

    await t.test('D2: unresolved, video and non-image cover logos leave no solid slot', async () => {
      const rows = await h.page.evaluate(() => {
        return [null, { kind: 'video', mime: 'video/mp4' }, { kind: 'file', mime: 'application/pdf' }, { kind: 'image', mime: 'image/svg+xml' }].map(asset => {
          const { els: [el] } = dCompose([{ id: 's01', type: 'cover', headline: 'عنوان واضح' }], {
            cover: { logo: { assetId: 'logo' } }, assets: asset ? [{ id: 'logo', ref: 'data:' + asset.mime + ',test', ...asset }] : []
          });
          const logo = el.querySelector('[data-slot="logo"]'), result = { asset, exists: !!logo, children: logo?.children.length || 0 };
          el.remove(); return result;
        });
      });
      assert.deepEqual(rows.map(r => r.exists), [false, false, false, true]);
      assert.equal(rows[3].children, 1);
    });

    await t.test('D5: clip cover logo precedes kicker in its own row in all presets', async () => {
      const rows = await h.page.evaluate(presets => presets.map(preset => {
        const { els: [el] } = dCompose([{ id: 's01', type: 'cover', headline: 'عنوان واضح', kicker: 'مقدمة', media: { slot: 'photo', assetId: 'clip' } }], {
          cover: { motion: { clip: { assetId: 'clip' } }, logo: { assetId: 'logo' } }, assets: [{ id: 'clip', kind: 'video', mime: 'video/mp4', ref: 'data:video/mp4,' },
            { id: 'logo', kind: 'image', mime: 'image/svg+xml', ref: 'data:image/svg+xml,' }]
        }, preset);
        const logo = el.querySelector('[data-slot="logo"]').getBoundingClientRect(), kicker = el.querySelector('[data-slot="kicker"]').getBoundingClientRect();
        const result = { preset, logoBottom: logo.bottom, kickerTop: kicker.top, clip: el.dataset.coverClip }; el.remove(); return result;
      }), presets);
      for (const row of rows) { assert.equal(row.clip, '1'); assert.ok(row.logoBottom <= row.kickerTop, JSON.stringify(row)); }
    });

    for (const explicit of [true, false]) await t.test('D10/D11: mixed ordinals and step-only labels, explicit=' + explicit, async () => {
      const rows = await h.page.evaluate(explicit => {
        const slides = ['item', 'item', 'item', 'step', 'step'].map((type, i) => ({ id: 's0' + (i + 1), type, title: 'عنوان', body: 'نص',
          ...(explicit ? { ord: i + 1 } : {}) }));
        const { els } = dCompose(slides);
        const out = els.map(el => { const n = el.querySelector('[data-slot="ord"]'); return { text: n.textContent, ord: n.dataset.ord }; });
        els.forEach(el => el.remove()); return out;
      }, explicit);
      assert.deepEqual(rows.map(r => r.ord), ['1', '2', '3', '4', '5']);
      assert.match(rows[3].text.replace(/\u00a0/g, ' '), /1 من 2/);
      assert.match(rows[4].text.replace(/\u00a0/g, ' '), /2 من 2/);
    });
    assert.deepEqual(h.errors, []);
  });
});
