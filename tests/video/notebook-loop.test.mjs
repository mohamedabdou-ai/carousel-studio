// Real Playpen layout: promoting inline words must not change the notebook poster holds.
import fs from 'node:fs';
import path from 'node:path';
import { openGeometryPage } from '../geometry/page.mjs';

export default {
  module: 'notebook-loop',
  tests: [{
    name: 'all notebook recipes preserve poster pixels at rest in both drivers and crops',
    async run(t) {
      const root = process.cwd(), sk = path.join(root, 'plugins/carousel-studio/skills/carousel-design');
      const h = await openGeometryPage();
      try {
        for (const chunk of ['paint', 'motion', 'hf']) await h.page.addScriptTag({ content: fs.readFileSync(path.join(sk, 'runtime/cs-' + chunk + '.js'), 'utf8') });
        const spec = JSON.parse(fs.readFileSync(path.join(root, 'tests/cover-baseline/baseline/input/spec.json'), 'utf8'));
        spec.style.presetId = 'notebook@1.0';
        spec.slides[0].headline = 'إزاي وكلاء AI\nاتواصلوا من غير شبكة؟';
        spec.slides[0].sub = 'إيه اللي حصل في اختبارات OpenAI؟';
        const rows = await h.page.evaluate(async spec => {
          const brand = JSON.parse(document.getElementById('cs-brand').textContent);
          if (brand.visual) { delete brand.visual.fonts; delete brand.visual.palette; }
          const recipes = CS.core.registry.getPreset('notebook').motion.allowed, rows = [];
          const crop = c => { const out = document.createElement('canvas'); out.width = 1080; out.height = 1350; out.getContext('2d').drawImage(c, 0, -45); return out; };
          const cases = recipes.map(recipe => ({ recipe, headline: spec.slides[0].headline }));
          cases.push({ recipe: 'counter', headline: '413 وكلاء AI\nاتواصلوا من غير شبكة؟', numeric: true });
          for (const entry of cases) for (const driver of ['style', 'waapi']) {
            const { recipe } = entry;
            spec.slides[0].headline = entry.headline;
            const deck = await CS.core.render.deck(spec, brand, { mode: 'export', useFrozen: false, slideIds: [spec.slides[0].id] });
            try {
              const el = deck.slides[0].el, timeline = CS.motion.build(el, { recipe, seconds: 6 });
              if (entry.numeric && !timeline.counters.length) throw new Error('numeric cover must exercise a real counter');
              const poster = await CS.paint.toCanvas(el, { scale: 1 }), croppedPoster = crop(poster);
              const ctrl = CS.motion.hf.install(el, timeline, 'notebook-loop', { driver });
              try {
                await ctrl.ready;
                // Visit moving frames and reverse seeks too: restoring the first hold alone is insufficient.
                for (const time of [0, 1.5, 179 / 30, 0, 0.4, 0.9, 5.59, 5.6]) {
                  ctrl.seek(time);
                  const frame = await CS.paint.toCanvas(el, { scale: 1, settle: true });
                  if (time === 1.5 || time === 0.9) {
                    rows.push({ recipe, driver, time, moving: CS.paint.metrics.ssim(frame, poster) < 0.999 });
                  } else for (const variant of ['3x4', '4x5']) {
                    const a = variant === '3x4' ? frame : crop(frame), b = variant === '3x4' ? poster : croppedPoster;
                    rows.push({ recipe, driver, time, variant, ssim: CS.paint.metrics.ssim(a, b), psnr: CS.paint.metrics.psnr(a, b) });
                  }
                }
              } finally { ctrl.destroy(); }
            } finally { deck.dispose(); }
          }
          return rows;
        }, spec);
        for (const row of rows) {
          const label = `${row.recipe}/${row.driver}/${row.time}/${row.variant || 'motion'}`;
          if ('moving' in row) t.ok(row.moving, label + ' still animates');
          else { t.eq(row.ssim, 1, label + ' poster SSIM'); t.eq(row.psnr, 100, label + ' poster PSNR'); }
        }
      } finally { await h.close(); }
    }
  }]
};
