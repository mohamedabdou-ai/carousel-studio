/* Q9a: complete real-engine slides, both painters, complete/anchor/label SSIM.
 * No Python or shared runtime writes. --runtime DIR measures a lead's build;
 * otherwise the corpus harness builds current sources privately. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { openPage, resolveRef } from '../corpus-bad/rendered.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const cases = JSON.parse(fs.readFileSync(new URL('./fixtures/art/slice.json', import.meta.url), 'utf8'));
const runtimeFlag = process.argv.indexOf('--runtime');
const runtime = runtimeFlag < 0 ? null : path.resolve(process.argv[runtimeFlag + 1]);
const h = await openPage();
const failures = [];
try {
  execFileSync(process.execPath, ['tools/build.mjs', '--module', 'paint', '--out', h.work], { cwd: root, windowsHide: true, stdio: 'pipe' });
  for (const m of ['core', 'paint', 'art', 'visual', 'qa', 'qa-visual']) {
    const file = path.join(runtime || h.work, `cs-${m}.js`);
    if (m === 'paint' || runtime) await h.page.addScriptTag({ content: fs.readFileSync(file, 'utf8') });
  }
  if (runtime) await h.page.evaluate(() => CS.core.registry.loadPage(document));
  await h.page.evaluate(async () => { await Promise.all(Array.from(document.fonts, face => face.load())); await document.fonts.ready; });
  const coverage = await h.page.evaluate(rows => {
    const seen = new Set(rows.map(c => c.anchor.kind + ':' + CS.art._.sub(c.anchor)));
    return Object.entries(CS.visual.caps().art).flatMap(([kind, subs]) => subs.map(sub => kind + ':' + sub)).filter(k => !seen.has(k));
  }, cases);
  assert.deepEqual(coverage, [], 'fixture matrix must cover every shipped (kind, sub)');
  const base = resolveRef('tests/fixtures/auto/eg.json#2');
  for (const preset of ['creator', 'poster']) for (const c of cases) {
    try {
      const result = await h.page.evaluate(async ({ base, preset, c }) => {
        async function run() {
          const spec = structuredClone(base);
          delete spec.frozen;
          spec.style = { presetId: preset + '@1.0', visualMode: 'directed' };
          spec.sources = [{ id: 'source1', kind: 'ownData', label: 'بيانات المثال' }];
          const slide = { id: 's02', n: 2, type: c.type || 'item', title: 'فكرة واحدة واضحة', sourceIds: ['source1'],
            visual: { anchor: c.anchor, recipe: c.type ? 'full' : 'center', tone: 'base', marks: c.id === 'word-struck' ? ['strike'] : [] } };
          for (const k of ['sides', 'bullets', 'demo']) if (c[k]) slide[k] = c[k];
          spec.slides = [slide];
          const host = document.getElementById('stage'); host.replaceChildren();
          const deck = await CS.core.render.deck(spec, null, { stage: host, mode: 'export', useFrozen: false });
          try {
            await document.fonts.ready;
            const el = deck.slides[0].el, art = el.querySelector('.cs-art');
            if (!art || !art.children.length) throw new Error('anchor did not render');
            const svg = await CS.paint.toCanvas(el, { painter: 'svg', scale: 1 });
            const replay = await CS.paint.toCanvas(el, { painter: 'replay', scale: 1 });
            const box = el.getBoundingClientRect(), scale = box.width / 1080;
            function crop(canvas, node) {
              const r = node.getBoundingClientRect(), x = Math.max(0, Math.floor((r.left - box.left) / scale)), y = Math.max(0, Math.floor((r.top - box.top) / scale));
              const w = Math.min(canvas.width - x, Math.ceil(r.width / scale)), ht = Math.min(canvas.height - y, Math.ceil(r.height / scale));
              if (w <= 0 || ht <= 0) throw new Error('empty crop');
              const out = document.createElement('canvas'); out.width = w; out.height = ht;
              out.getContext('2d').drawImage(canvas, x, y, w, ht, 0, 0, w, ht); return out;
            }
            const regions = [['slide', el], ['anchor', art]];
            for (const label of art.querySelectorAll('.cs-art-label')) if (!label.closest('[aria-hidden="true"]') && label.textContent.trim()) regions.push([label.getAttribute('data-slot-key'), label]);
            const scores = regions.map(([name, node]) => ({ name, ssim: CS.paint.metrics.ssim(crop(svg, node), crop(replay, node)) }));
            return { scores, markup: el.outerHTML, svg: svg.toDataURL(), replay: replay.toDataURL() };
          } finally { deck.dispose(); }
        }
        const a = await run(), b = await run();
        return { scores: a.scores, deterministic: a.markup === b.markup && a.svg === b.svg && a.replay === b.replay,
          changed: ['markup', 'svg', 'replay'].filter(k => a[k] !== b[k]) };
      }, { base, preset, c });
      assert.equal(result.deterministic, true, 'markup and both painter PNGs must repeat exactly: ' + result.changed.join(', '));
      for (const score of result.scores) if (!Number.isFinite(score.ssim) || score.ssim < .98) failures.push(`${preset}/${c.id}/${score.name}: ${score.ssim}`);
      console.log(`${preset}/${c.id}: min SSIM ${Math.min(...result.scores.map(s => s.ssim)).toFixed(5)} (${result.scores.length} regions, repeated twice)`);
    } catch (e) { failures.push(`${preset}/${c.id}: ${e.message}`); }
  }
  assert.deepEqual(h.errors, [], 'page errors');
  console.log(`${cases.length * 2} complete slides; ${failures.length} failures`);
  if (failures.length) { console.error(failures.join('\n')); process.exitCode = 1; }
} finally { await h.close(); }
