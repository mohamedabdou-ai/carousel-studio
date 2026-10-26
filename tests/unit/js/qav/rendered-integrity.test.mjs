import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import { withQav } from './harness.mjs';

test('rendered copy, art floors, contrast and native anchors are deterministic', async t => {
  await withQav(async h => {
    const twice = async (input, ids) => {
      const a = await h.runGates(input, ids), b = await h.runGates(input, ids);
      assert.deepEqual(a, b);
      return a;
    };
    const content = text => `<div class="cs-content">${text}</div>`;
    const label = (key, text, style = '') => `<span class="cs-art-label" data-slot-key="s02.${key}" data-slot="art" data-role="body" data-floor="36" style="${style}">${text}</span>`;
    const ids = ['C2.text-dropped', 'C2.text-duplicated'];
    await t.test('Arabic-Indic numeral labels fit their fixed boxes after export line wrapping', async () => {
      const spec = JSON.parse(fs.readFileSync(new URL('../../../../tools/examples/showcase.spec.json', import.meta.url), 'utf8'));
      spec.style = { presetId: 'creator@1.0' };
      spec.locale.digits = 'arabic-indic';
      spec.slides = [spec.slides.find(s => s.id === 's03')];
      spec.slides[0].visual = { anchor: { kind: 'numeral', value: '1' }, recipe: 'under', tone: 'base' };
      assert.deepEqual(Array.from(await h.runGates(spec, ['D2'].concat(ids))), []);
    });
    await t.test('an optional anchor that cannot fit at its floor falls back to the complete native text', async () => {
      const spec = JSON.parse(fs.readFileSync(new URL('../../../../tools/examples/showcase.spec.json', import.meta.url), 'utf8'));
      spec.style = { presetId: 'creator@1.0' };
      spec.slides = [spec.slides.find(s => s.id === 's19')];
      spec.slides[0].visual = { anchor: { kind: 'field', word: 'القارئ' }, recipe: 'center', tone: 'base' };
      const r = await h.runGates(spec, ids.concat(['D2']));
      assert.deepEqual(Array.from(r), []);
      assert.equal(await h.page.locator('.cs-anchor-slot').count(), 0);
      const replay = await h.page.evaluate(async spec => {
        const first = await CS.core.render.deck(spec, null, { mode: 'export', useFrozen: false });
        const tokens = CS.core.resolve.post(spec, null);
        spec.frozen = CS.core.freeze.capture(first.slides, spec, tokens);
        const hadAnchor = !!first.slides[0].el.querySelector('.cs-anchor-slot');
        first.dispose();
        const second = await CS.core.render.deck(spec, null, { mode: 'export' });
        try { return { hadAnchor, frozenOk: CS.core.freeze.verify(spec, tokens).ok, replayAnchor: !!second.slides[0].el.querySelector('.cs-anchor-slot'), findings: Array.from(await CS.qa.runRendered({ spec, deck: second }, { gates: ['C2.text-dropped', 'C2.text-duplicated', 'D2'] })) }; }
        finally { second.dispose(); }
      }, spec);
      assert.deepEqual(replay, { hadAnchor: false, frozenOk: true, replayAnchor: false, findings: [] });
    });
    await t.test('quote bridges and composed word and notes replacements preserve copy exactly once', async () => {
      const spec = JSON.parse(fs.readFileSync(new URL('../../../../tools/examples/showcase.spec.json', import.meta.url), 'utf8'));
      spec.slides = spec.slides.filter(s => ['s07', 's08', 's12', 's16'].includes(s.id));
      for (const s of spec.slides) s.visual = { anchor: s.id === 's07' ? { kind: 'word', word: s.sides[0].label } : s.id === 's12' ? { kind: 'mock', mock: { kind: 'notes' } } : { kind: 'none' }, recipe: s.id === 's12' ? 'full' : 'under', tone: 'base' };
      for (const preset of ['creator', 'poster']) {
        spec.style = { presetId: preset + '@1.0' };
        const result = await h.runGates(spec, ids);
        assert.deepEqual(Array.from(result), [], preset);
      }
    });
    await t.test('real composed export cover passes; removed and duplicated composed copy BLOCK', async () => {
      const base = JSON.parse(fs.readFileSync(new URL('../../../fixtures/auto/eg.json', import.meta.url), 'utf8'))[2];
      for (const preset of ['creator', 'poster']) {
        const spec = structuredClone(base);
        spec.style = { presetId: preset + '@1.0', visualMode: 'off' };
        spec.slides = [{ id: 's01', n: 1, type: 'cover', kicker: 'للصنّاع', headline: '4\u00a0تعديلات في الهوك\nتزوّد ==الحفظ==', sub: 'خطوة خطوة', kashidaWord: 'تعديلات' }];
        const result = await h.page.evaluate(async ({ spec, ids }) => {
          const deck = await CS.core.render.deck(spec, null, { mode: 'export', useFrozen: false });
          try {
            const root = deck.slides[0].el, headline = root.querySelector('[data-slot="headline"]');
            const run = async () => Array.from(await CS.qa.runRendered({ spec, deck }, { gates: ids })).map(f => ({ rule: f.rule, el: f.el, sev: f.sev }));
            const clean = await run();
            headline.after(headline.cloneNode(true));
            const doubled = await run();
            headline.nextElementSibling.remove(); headline.replaceChildren();
            const missing = await run();
            return { clean, doubled, missing, stageHidden: deck.stage.getAttribute('aria-hidden') };
          } finally { deck.dispose(); }
        }, { spec, ids });
        assert.equal(result.stageHidden, 'true');
        assert.deepEqual(result.clean, [], preset);
        assert.deepEqual(result.doubled, [{ rule: 'C2.text-duplicated', el: 's01.headline', sev: 'BLOCK' }]);
        assert.deepEqual(result.missing, [{ rule: 'C2.text-dropped', el: 's01.headline', sev: 'BLOCK' }]);
      }
    });
    await t.test('detects native/art duplicates, same-key duplicates and missing demo lines', async () => {
      for (const key of ['bullets.0', 'sides.0', 'title']) {
        const slide = key.startsWith('bullets') ? { bullets: ['نص واضح'] } : key.startsWith('sides') ? { sides: [{ text: 'نص واضح' }] } : { title: 'نص واضح' };
        for (const copyKey of [key, 'art.0']) {
          const r = await twice({ slide, html: content(label(key, 'نص واضح') + label(copyKey, 'نص واضح')) }, ids);
          assert.ok(r.some(f => f.rule === 'C2.text-duplicated' && f.sev === 'BLOCK' && f.el === `s02.${key}`));
        }
      }
      const slide = { visual: { anchor: { kind: 'mock' } }, demo: { lines: [{ text: 'الدليل الأول' }, { text: 'رد واضح' }], caption: 'المثال' } };
      const r = await twice({ slide, html: content(label('art.0', 'الدليل الأول')) }, ids);
      assert.deepEqual(r.map(f => f.el).sort(), ['s02.demo-caption', 's02.demo.1']);
      assert.ok(r.every(f => f.sev === 'BLOCK'));
    });
    await t.test('inactive demo input is not promised copy; numeral components form one visible number', async () => {
      const demo = { lines: [{ text: 'رسالة بديلة' }], caption: 'مثال بديل' };
      const slide = { demo, number: { value: '120', unit: 'حفظ' }, visual: { anchor: { kind: 'numeral' } } };
      const figure = parts => content(`<div data-art="numeral"><div data-part="figure">${parts}</div></div>`);
      const parts = label('art.0', '120') + label('art.1', 'حفظ');
      assert.equal((await twice({ slide, html: figure(parts) }, ids)).length, 0);
      for (const part of [label('art.0', '120'), label('art.1', 'حفظ')]) {
        const r = await twice({ slide, html: figure(part) }, ids);
        assert.ok(r.some(f => f.rule === 'C2.text-dropped' && f.el === 's02.number'));
      }
      assert.ok((await twice({ slide, html: figure(parts + parts) }, ids)).some(f => f.rule === 'C2.text-duplicated'));
      assert.ok((await twice({ slide, html: figure(parts) + label('art.0', '120 حفظ') }, ids)).some(f => f.rule === 'C2.text-duplicated'));
      for (const attrs of ['aria-hidden="true"', 'data-decor="1"', 'style="display:none"', 'style="visibility:hidden"', 'style="opacity:0"']) {
        const hidden = `<div ${attrs}>${figure(parts)}</div>`;
        assert.ok((await twice({ slide, html: hidden }, ids)).some(f => f.rule === 'C2.text-dropped'));
        assert.equal((await twice({ slide, html: figure(parts) + hidden }, ids)).length, 0);
      }
    });
    await t.test('art replacement, split inline markup, bidi, NBSP and intentional repeated spec copy pass', async () => {
      const slide = { title: 'جرّب ==هذا==', body: 'جرّب هذا', number: { value: '12', unit: 'حفظ' } };
      const html = content(label('art.0', '<span>جرّب</span> <bdi>هذا</bdi>') + label('body', 'جرّب هذا') + label('number', '<bdi dir="ltr">12</bdi>&nbsp;حفظ'));
      assert.equal((await twice({ slide, html }, ids)).length, 0);
      assert.equal((await twice({ slide: { title: 'كلمة جديدة' }, html: content(label('title', '<span>كل</span><bdi dir="rtl">مة</bdi><br>جديـدة')) }, ids)).length, 0);
      assert.equal((await twice({ slide: { title: 'جرّب هذا, الآن?', number: { value: '12500', unit: '%' } }, html: content(label('title', 'جرّب هذا، الآن؟') + label('number', '12,500٪')) }, ids)).length, 0);
    });
    await t.test('hidden and decorative copies do not satisfy or duplicate text', async () => {
      for (const attrs of ['aria-hidden="true"', 'data-decor="1"', 'style="display:none"', 'style="visibility:hidden"', 'style="opacity:0"', 'style="color:transparent"']) {
        const slide = { title: 'نص مطلوب' }, hidden = `<div ${attrs}>${label('art.0', slide.title)}</div>`;
        assert.equal((await twice({ slide, html: content(hidden) }, ids))[0].rule, 'C2.text-dropped');
        assert.equal((await twice({ slide, html: content(label('title', slide.title) + hidden) }, ids)).length, 0);
      }
    });
    await t.test('art data-floor overrides the body floor, without weakening native copy', async () => {
      for (const px of [35, 36]) {
        const r = await twice(content(label('art.0', 'نص واضح', `font-size:${px}px`) + '<span data-role="body" data-floor="1" data-slot-key="s02.body" style="font-size:36px">نص عادي</span>'), ['D3']);
        assert.equal(r.some(f => f.el === 's02.art.0'), px < 36);
        assert.ok(r.some(f => f.el === 's02.body' && f.rule === 'D3.body-floor'));
      }
    });
    await t.test('native numerals, words and user media count as anchors at preview scales', async () => {
      for (const scale of [1, 0.36]) for (const type of ['number', 'ord', 'word', 'media']) {
        const html = type === 'media' ? '<div data-slot="media"><img width="800" height="650" src="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22800%22 height=%22650%22%3E%3Crect width=%22800%22 height=%22650%22 fill=%22black%22/%3E%3C/svg%3E"></div>' : `<div ${type === 'number' ? 'class="cs-number" data-slot="number"' : type === 'ord' ? 'class="cs-ord"' : 'class="cs-big-word"'} style="font-size:440px;line-height:1.2">${type === 'word' ? 'وضوح' : '120'}</div>`;
        const r = await twice({ html: content(html), scale, slide: { variant: type === 'ord' ? 'numeral' : 'base' } }, ['VA2.anchor-size']);
        assert.ok(r.boxes.some(b => b.anchor && (b.kind === 'text' || b.kind === 'image')), type);
        assert.ok(!r.some(f => /too small: 0;/.test(f.msg.en)), type);
      }
    });
    await t.test('contrast samples painted art glyphs instead of blank line-box margins', async () => {
      await h.page.evaluate(() => {
        function canvas(painted) {
          const c = document.createElement('canvas'); c.width = 1080; c.height = 1440;
          const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
          const root = document.querySelector('.cs-slide').getBoundingClientRect(), label = document.querySelector('.cs-art-label,.native-probe'), range = document.createRange();
          range.selectNodeContents(label); const r = range.getBoundingClientRect(), x = r.left - root.left, y = r.top - root.top;
          g.fillStyle = '#E3262B'; g.fillRect(x, y + r.height * .3, r.width, r.height * .5);
          if (painted) { g.fillStyle = '#fff'; g.fillRect(x + 2, y + r.height * .4, Math.max(1, r.width - 4), r.height * .2); }
          return c;
        }
        CS.paint = { textMask: async () => canvas(false), toCanvas: async () => canvas(true) };
      });
      const html = content(label('art.0', 'نص واضح', 'color:#fff;background:#E3262B;font-size:80px'));
      assert.equal((await twice(html, ['D4'])).length, 0);
      const native = content('<span class="native-probe" data-slot-key="s02.body" data-role="body" style="color:#fff;background:#E3262B;font-size:80px">نص واضح</span>');
      assert.equal((await twice(native, ['D4'])).length, 0, 'native glyphs exclude marks in blank line-box margins too');
      await h.page.evaluate(() => { delete CS.paint; });
      assert.equal((await twice(html, ['D4'])).length, 0);
      assert.ok((await twice(content(label('art.0', 'نص واضح', 'color:#fff;background:#fff')), ['D4'])).some(f => f.rule === 'D4.hard'));
    });
  });
});
