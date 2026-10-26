import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { withFreeStudio, PRIVATE } from './free-harness.mjs';
import { paintBothScored } from '../parity/lib/painters.mjs';

test('free design: real compose, painters, safety QA, Studio editing and determinism', { timeout: 180000 }, async t => {
  await withFreeStudio(async ({ page, errors }) => {
    await t.test('creator and poster compose fields, literals, art, marks, tones and scoped CSS in RTL', async () => {
      const result = await page.evaluate(async () => {
        window.__freeSpec = JSON.parse(document.getElementById('cs-spec').textContent);
        window.__freeBrand = JSON.parse(document.getElementById('cs-brand').textContent);
        const rows = [];
        for (const preset of ['creator', 'poster']) {
          const spec = structuredClone(__freeSpec); spec.style.presetId = preset + '@1.0';
          const r = await CS.core.render.slide(spec, __freeBrand, 1, { mode: 'export', useFrozen: false });
          r.el.dataset.testPreset = preset;
          const field = r.el.querySelector('[data-field="headline"]'), tone = r.el.querySelector('[data-tone="field"]');
          rows.push({ preset, free: !!r.el.querySelector('main.cs-content.cs-free[data-layer="content"]'), dir: r.el.dir, text: field.textContent, expected: spec.slides[1].headline, words: field.querySelectorAll('.w').length, icon: !!r.el.querySelector('.cs-free svg[data-icon]'), object: !!r.el.querySelector('.cs-free svg[data-object]'), marks: r.el.querySelectorAll('.cs-marks path').length, tone: getComputedStyle(tone).backgroundColor, expectedTone: r.tokens.tones.field.bg, scoped: r.el.querySelector('[data-cs-free-css]').textContent, size: getComputedStyle(field).fontSize, chrome: !!r.el.querySelector('.cs-header') && !!r.el.querySelector('.cs-counter'), anchor: !!r.el.querySelector('.cs-art'), html: r.el.outerHTML });
        }
        return rows;
      });
      for (const r of result) {
        assert.equal(r.free, true, r.preset); assert.equal(r.dir, 'rtl'); assert.equal(r.text, r.expected);
        assert.ok(r.words > 0); assert.equal(r.icon, true); assert.equal(r.object, true); assert.ok(r.marks > 0, r.preset + ' marks');
        assert.equal(r.size, '80px'); assert.equal(r.chrome, true); assert.equal(r.anchor, false);
        assert.match(r.scoped, /\.cs-slide\[data-cs-slide="s02"\] \.cs-free/);
        assert.doesNotMatch(r.tone, /rgba\(0, 0, 0, 0\)/);
      }
    });
    await t.test('both painters agree on two free slides at SSIM >= 0.98', async () => {
      await page.evaluate(async () => {
        window.__freeDeck = await CS.core.render.deck(__freeSpec, __freeBrand, { mode: 'export', useFrozen: false, slideIds: ['s02', 's03'] });
        __freeDeck.slides.forEach(r => { r.el.dataset.parity = r.id; });
      });
      for (const id of ['s02', 's03']) {
        const r = await paintBothScored(page, `[data-parity="${id}"]`, { scale: .5 });
        fs.writeFileSync(path.join(PRIVATE, id + '-svg.png'), r.svgPng); fs.writeFileSync(path.join(PRIVATE, id + '-replay.png'), r.replayPng);
        console.log(`${id} painter SSIM ${r.ssim}`); assert.ok(r.ssim >= .98, `${id}: ${r.ssim}`);
      }
    });
    await t.test('all contract mark names settle and every local tone remains readable', async () => {
      const rows = await page.evaluate(async () => {
        const out = [];
        for (const mark of CS.visual.free.contract().art.mark.values) {
          const spec = structuredClone(__freeSpec); spec.slides[1].free.html = '<h2 data-tone="invert" data-field="headline" data-mark="' + mark + '"></h2>'; spec.slides[1].free.css = 'h2{font-size:64px}';
          const r = await CS.core.render.slide(spec, __freeBrand, 1, { mode: 'export', useFrozen: false });
          const path = r.el.querySelector('.cs-marks path');
          out.push({ mark, marks: r.el.querySelectorAll('.cs-marks path').length, contrast: path ? CS.core.color.contrast(path.getAttribute('stroke') || path.getAttribute('fill'), r.tokens.tones.invert.bg) : 0 }); r.el.remove();
        }
        const d = await CS.core.render.deck(__freeSpec, __freeBrand, { mode: 'export', useFrozen: false, slideIds: ['s02', 's03', 's04'] });
        const findings = await CS.qa.runRendered({ spec: __freeSpec, tokens: d.tokens, deck: d }, { gates: ['D3', 'D4', 'D5', 'C2.text-dropped', 'C2.text-duplicated'] });
        d.dispose(); return { out, findings };
      });
      for (const r of rows.out) { assert.ok(r.marks > 0, r.mark); assert.ok(r.contrast >= 3, r.mark + ' contrast'); }
      assert.deepEqual(rows.findings, []);
    });
    await t.test('preset chrome retains the native band geometry on every free slide', async () => {
      const result = await page.evaluate(async () => {
        function chrome(deck) { return deck.slides.slice(1).filter(r => r.el.dataset.type !== 'cta').map(r => {
          const root = r.el.getBoundingClientRect();
          return ['.cs-header', '.cs-footer', '.cs-counter', '.cs-swipe'].map(sel => {
            const n = r.el.querySelector(sel); if (!n) return null;
            const rect = n.getBoundingClientRect(); return { text: n.textContent, x: rect.x - root.x, y: rect.y - root.y, w: rect.width, h: rect.height, color: getComputedStyle(n).color };
          });
        }); }
        const native = structuredClone(__freeSpec); native.slides.forEach(s => { if (s.free) { delete s.free; s.visual = { anchor: { kind: 'none' }, tone: 'base', recipe: 'under' }; } });
        const freeDeck = await CS.core.render.deck(__freeSpec, __freeBrand, { mode: 'export', useFrozen: false });
        const nativeDeck = await CS.core.render.deck(native, __freeBrand, { mode: 'export', useFrozen: false });
        // A free CTA carries its own ask: the save pill steps aside and the counter keeps the place it has on every other slide.
        const counters = freeDeck.slides.slice(1).map(r => { const c = r.el.querySelector('.cs-counter'), p = r.el.querySelector('.cs-savepill'); return { x: Math.round(c.getBoundingClientRect().x - r.el.getBoundingClientRect().x), pill: !!p && getComputedStyle(p).display !== 'none' }; });
        const out = { free: chrome(freeDeck), native: chrome(nativeDeck), counters }; freeDeck.dispose(); nativeDeck.dispose(); return out;
      });
      assert.deepEqual(result.free, result.native);
      assert.equal(new Set(result.counters.map(c => c.x)).size, 1, JSON.stringify(result.counters));
      assert.ok(result.counters.every(c => !c.pill));
    });
    await t.test('frozen free copy verifies and HTML or CSS changes invalidate it', async () => {
      const result = await page.evaluate(async () => {
        const spec = structuredClone(__freeSpec), deck = await CS.core.render.deck(spec, __freeBrand, { mode: 'export', useFrozen: false });
        spec.frozen = CS.core.freeze.capture(deck.slides, spec, deck.tokens);
        const ok = CS.core.freeze.verify(spec, deck.tokens);
        const css = structuredClone(spec); css.slides[1].free.css += 'h2{color:var(--cs-ink)}';
        const html = structuredClone(spec); html.slides[1].free.html += '<p>new literal</p>';
        const again = await CS.core.render.deck(spec, __freeBrand, { mode: 'export' });
        const integrity = await CS.qa.runRendered({ spec, tokens: again.tokens, deck: again }, { gates: ['C2.text-dropped', 'C2.text-duplicated'] });
        deck.dispose(); again.dispose(); return { ok, css: CS.core.freeze.verify(css, deck.tokens), html: CS.core.freeze.verify(html, deck.tokens), integrity };
      });
      assert.equal(result.ok.ok, true, JSON.stringify(result.ok));
      assert.equal(result.css.ok, false); assert.equal(result.html.ok, false); assert.deepEqual(result.integrity, []);
    });
    await t.test('missing text, duplicate text and overflow are caught; planner gates skip free slides', async () => {
      const result = await page.evaluate(async () => {
        const spec = structuredClone(__freeSpec), s = spec.slides[1];
        s.free.html = '<h2 data-field="headline"></h2><p class="f-over">Visible text</p>';
        s.free.css = '.f-over{width:20px;height:20px;white-space:nowrap;font-size:48px}';
        s.visual = { anchor: { kind: 'icon', icon: 'nonexistent', value: '99 99 99' }, tone: 'invert', recipe: 'nonsense' };
        const deck = await CS.core.render.deck(spec, __freeBrand, { mode: 'export', useFrozen: false, slideIds: [s.id] });
        const findings = await CS.qa.runRendered({ spec, brand: __freeBrand, tokens: deck.tokens, deck }, { gates: ['D2', 'D3', 'D4', 'D5', 'D9', 'C2.text-dropped', 'C2.text-duplicated', 'VA2.anchor-size'] });
        const text = CS.qa.runText({ spec, brand: __freeBrand }, { gates: ['VA1', 'VA3', 'VA4', 'VA6', 'VA7', 'VA8', 'D8.anchor-run', 'D8.tone-run', 'C2.figure-repeat'] });
        const duplicateSpec = structuredClone(__freeSpec), ds = duplicateSpec.slides[1]; ds.free.html += '<p data-field="headline"></p>';
        const dup = await CS.core.render.deck(duplicateSpec, __freeBrand, { mode: 'export', useFrozen: false, slideIds: [ds.id] });
        const dupFindings = await CS.qa.runRendered({ spec: duplicateSpec, tokens: dup.tokens, deck: dup }, { gates: ['C2.text-duplicated'] });
        deck.dispose(); dup.dispose();
        return { findings, text, dupFindings };
      });
      assert.ok(result.findings.some(f => f.rule === 'D2.overflow'), JSON.stringify(result.findings));
      assert.ok(result.findings.some(f => f.rule === 'C2.text-dropped' && f.el === 's02.sub'));
      assert.ok(result.dupFindings.some(f => f.rule === 'C2.text-duplicated'));
      assert.ok(!result.findings.some(f => f.rule.startsWith('VA')));
      assert.ok(!result.text.some(f => f.slide === 's02' && /^(VA|D8\.)/.test(f.rule)), JSON.stringify(result.text));
      assert.ok(!result.text.some(f => f.slide === 's02' && f.rule === 'C2.figure-repeat'));
    });
    await t.test('same free render produces identical DOM and PNG bytes twice', async () => {
      const result = await page.evaluate(async () => {
        const out = [];
        for (let i = 0; i < 2; i++) {
          const r = await CS.core.render.slide(__freeSpec, __freeBrand, 1, { mode: 'export', useFrozen: false });
          const canvas = await CS.paint.toCanvas(r.el, { painter: 'svg', scale: .5 });
          out.push({ html: r.el.outerHTML, png: canvas.toDataURL('image/png') }); r.el.remove();
        }
        return { html: out[0].html === out[1].html, png: out[0].png === out[1].png };
      });
      assert.deepEqual(result, { html: true, png: true });
    });
    await t.test('Studio edits fields and literal source; Slide tab resets to automatic', async () => {
      await page.evaluate(() => { CS.ui.current.select('s02'); });
      const selector = '.ui-frame-in > .cs-slide[data-cs-slide="s02"] .cs-free';
      await page.locator(selector + ' [data-field="headline"][contenteditable="true"]').waitFor();
      const edit = page.locator(selector + ' [data-free-edit="0"][contenteditable="true"]');
      await edit.fill('نص جديد للتجربة'); await edit.blur();
      await page.waitForFunction(() => CS.ui.current.getSpec().slides[1].free.html.includes('نص جديد للتجربة'));
      const field = page.locator(selector + ' [data-field="headline"][contenteditable="true"]');
      await field.fill('عنوان جديد للتجربة'); await field.blur();
      await page.waitForFunction(() => CS.ui.current.getSpec().slides[1].headline === 'عنوان جديد للتجربة');
      await page.evaluate(() => CS.ui.current._ctx.setTab('slide'));
      await page.locator('[data-free-reset]').click();
      await page.waitForFunction(() => !CS.ui.current.getSpec().slides[1].free);
      assert.equal(await page.evaluate(() => CS.ui.current.getSpec().slides[1].headline), 'عنوان جديد للتجربة');
    });
    assert.deepEqual(errors, []);
  });
});
