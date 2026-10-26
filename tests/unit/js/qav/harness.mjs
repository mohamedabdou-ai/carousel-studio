/* Q3a gate harness. Private source builds, real Chromium, real CS.qa hook and platform rules.
 * runGates(htmlOrSpec, ids) -> findings[] with .stats. withQav keeps one page for a test file.
 * HTML may also be {html, slide, stage, height, scale}; a plain spec uses core.render.deck. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { launchChromium } from '../../../../plugins/carousel-studio/skills/carousel-design/scripts/cover_video.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const SK = path.join(ROOT, 'plugins/carousel-studio/skills/carousel-design');
const BASE = path.join(os.tmpdir(), 'cs-r3/Q3a');
const MODULES = ['core', 'qa', 'art', 'visual', 'qa-visual'];
const read = p => fs.readFileSync(p, 'utf8');
const json = p => JSON.parse(read(p));
export const allIds = ['D9.band', 'D9.rect', 'D9.fill', 'D9.container-fill', 'VA2.anchor-size', 'D10.nesting', 'D10.icon-tile-stack', 'D10.stroke-feed', 'D10.art-label'];

export async function withQav(fn) {
  fs.mkdirSync(BASE, { recursive: true });
  const work = fs.mkdtempSync(path.join(BASE, 'run-'));
  execFileSync(process.execPath, [path.join(ROOT, 'tools/build.mjs'), ...MODULES.flatMap(m => ['--module', m]), '--out', work], { windowsHide: true, stdio: 'pipe' });
  const browser = await launchChromium();
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 1500 }, deviceScaleFactor: 1 });
    await page.route('**/*', route => route.abort());
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const font = fs.readFileSync(path.join(ROOT, 'tests/video/harness/fonts/ReadexPro-arabic.woff2')).toString('base64');
    await page.setContent(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><style>
      @font-face{font-family:Readex;src:url(data:font/woff2;base64,${font})}
      html,body{margin:0} .cs-slide{width:1080px;height:1440px;position:relative;font:36px/1.4 Readex,sans-serif;transform-origin:top left;direction:rtl}
      .cs-slide[data-qav-fixture]{background:#fff!important;color:#111!important}
      .cs-slide[data-qav-fixture] .cs-content{position:absolute!important;inset:auto!important;left:114px!important;top:261px!important;width:852px!important;height:998px!important;padding:0!important}
      .cs-art{position:relative}
      .cs-art-label{font-size:36px}svg{overflow:visible} .cs-ln{display:inline}
      </style></head><body><main id="test"></main></body></html>`);
    for (const m of MODULES) await page.addScriptTag({ content: read(path.join(work, `cs-${m}.js`)) });
    const registry = json(path.join(SK, 'fonts/registry.json'));
    const fontCss = registry.families.flatMap(f => f.files.map(file => {
      const weight = Array.isArray(file.wght) ? file.wght.join(' ') : file.wght;
      const data = fs.readFileSync(path.join(SK, 'fonts', file.file)).toString('base64');
      return `@font-face{font-family:"${f.family}";font-style:${file.style || 'normal'};font-weight:${weight};src:url(data:font/woff2;base64,${data})}`;
    })).join('\n');
    await page.addStyleTag({ content: fontCss });
    await page.evaluate(fonts => CS.core.registry.registerFonts(fonts), { registry, coverage: json(path.join(SK, 'fonts/coverage.json')) });
    const rules = { qaRules: json(path.join(SK, 'data/qa-rules.json')), platform: json(path.join(SK, 'data/platform-instagram.json')), locale: json(path.join(SK, 'data/locale-defaults.json')) };
    await page.evaluate(bundle => { window.__qavBundle = bundle; CS.core.registry.registerRules(bundle); CS.qav.flush(); }, rules);
    await page.evaluate(() => document.fonts.ready);
    const harness = {
      page, work, errors,
      async runGates(htmlOrSpec, ids = allIds) {
        const result = await page.evaluate(async ({ input, ids }) => {
          const o = typeof input === 'string' ? { html: input } : input;
          let deck, spec, host = document.getElementById('test'); host.textContent = '';
          const bundle = structuredClone(__qavBundle);
          if (o.stage != null) bundle.platform.plugin.visual.rollout.stage = o.stage;
          CS.core.registry.registerRules(bundle);
          if (o.slides && !o.html) {
            spec = o;
            deck = await CS.core.render.deck(spec, null, { stage: host });
          } else {
            const slide = Object.assign({ id: 's02', type: 'item', visual: { anchor: { kind: 'icon' } } }, o.slide || {});
            spec = { canvas: { w: 1080, h: o.height || 1440 }, locale: { dialect: 'eg', digits: 'western' }, style: { visualMode: o.visualMode || 'directed' }, slides: [slide] };
            const el = document.createElement('section'); el.className = 'cs-slide'; el.setAttribute('dir', 'rtl'); el.setAttribute('lang', 'ar');
            el.setAttribute('data-cs-slide', slide.id); el.setAttribute('data-type', slide.type); el.setAttribute('data-qav-fixture', '');
            if (slide.variant) el.setAttribute('data-variant', slide.variant);
            el.style.height = spec.canvas.h + 'px'; el.style.transform = `scale(${o.scale || 1})`;
            el.innerHTML = o.html || ''; host.appendChild(el);
            deck = { slides: [{ id: slide.id, el, tokens: { art: {} } }] };
          }
          await document.fonts.ready;
          const results = await CS.qa.runRendered({ spec, deck }, { gates: ids });
          const boxes = CS.qav.collectBoxes(deck.slides[0].el, { platform: bundle.platform, canvasH: spec.canvas.h });
          return { results: Array.from(results), stats: results.stats, boxes };
        }, { input: htmlOrSpec, ids });
        Object.assign(result.results, { stats: result.stats, boxes: result.boxes });
        if (errors.length) throw new Error(errors.join('\n'));
        return result.results;
      }
    };
    // Supply the real templates and preset registry for callers that pass a spec.
    await page.evaluate(({ html, presets }) => {
      const container = document.createElement('div'); container.innerHTML = html;
      CS.core.registry.registerArchetypes(container);
      for (const p of presets) CS.core.registry.registerPreset(p.preset, p.css);
    }, { html: read(path.join(SK, 'templates/archetypes.html')), presets: ['creator', 'poster'].map(p => ({ preset: json(path.join(SK, 'styles', p, 'preset.json')), css: read(path.join(SK, 'styles', p, 'decor.css')) })) });
    return await fn(harness);
  } finally {
    await browser.close();
    fs.rmSync(work, { recursive: true, force: true });
  }
}

export async function runGates(htmlOrSpec, ids) { return withQav(h => h.runGates(htmlOrSpec, ids)); }
