// The same real-engine page as the rendered corpus, extended to all six presets.
// No Python or writes to the shipped runtime are needed for geometry checks.
import fs from 'node:fs';
import path from 'node:path';
import { openPage, ROOT } from '../corpus-bad/rendered.mjs';

export async function openGeometryPage() {
  const h = await openPage();
  try {
    const sk = path.join(ROOT, 'plugins/carousel-studio/skills/carousel-design');
    const read = p => fs.readFileSync(path.join(sk, p), 'utf8');
    const json = p => JSON.parse(read(p));
    const ids = json('styles/index.json').presets.map(p => typeof p === 'string' ? p : p.id);
    const presets = ids.map(id => ({ preset: json(`styles/${id}/preset.json`), css: read(`styles/${id}/decor.css`) }));
    const registry = json('fonts/registry.json'), coverage = json('fonts/coverage.json');
    const faces = registry.families.flatMap(f => f.files.map(file => `@font-face{font-family:"${f.family}";font-style:${file.style || 'normal'};font-weight:${Array.isArray(file.wght) ? file.wght.join(' ') : file.wght};src:url(data:font/woff2;base64,${fs.readFileSync(path.join(sk, 'fonts', file.file)).toString('base64')}) format('woff2')}`)).join('\n');
    await h.page.evaluate(faces => { document.getElementById('cs-fonts').textContent += '\n' + faces; }, faces);
    await h.page.evaluate(({presets, registry, coverage, brand}) => {
      document.getElementById('cs-presets').textContent = JSON.stringify(presets.map(p => p.preset));
      document.getElementById('cs-fonts-meta').textContent = JSON.stringify({registry, coverage});
      for (const p of presets) {
        let style = document.querySelector(`[data-cs-decor="${p.preset.id}"]`);
        if (!style) { style = document.createElement('style'); style.dataset.csDecor = p.preset.id; document.head.append(style); }
        style.textContent = p.css;
      }
      const data = document.createElement('script'); data.type = 'application/json'; data.id = 'cs-brand'; data.textContent = JSON.stringify(brand); document.head.append(data);
      CS.core.registry.loadPage(document);
    }, {presets, registry, coverage, brand: JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures/brand.eg.creator.json'), 'utf8'))});
    await h.page.evaluate(async () => { await Promise.all(Array.from(document.fonts, f => f.load())); await document.fonts.ready; });
    return h;
  } catch (error) { await h.close(); throw error; }
}
