// A private, Python-free Studio fixture, using the real templates, data, fonts and source chunks.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { loadPlanner } from '../../plugins/carousel-studio/skills/carousel-design/scripts/plan.mjs';
import { launchChromium, openStudio } from '../../plugins/carousel-studio/skills/carousel-design/scripts/cover_video.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const SK = path.join(ROOT, 'plugins/carousel-studio/skills/carousel-design');
export const PRIVATE = path.join(os.tmpdir(), 'cs-r3/free');
const read = p => fs.readFileSync(p, 'utf8'), json = p => JSON.parse(read(p));
export function buildFreeStudio() {
  execFileSync(process.execPath, [path.join(ROOT, 'tools/build.mjs'), '--out', PRIVATE], { windowsHide: true });
  const { CS } = loadPlanner({ runtimeDir: PRIVATE });
  const registry = json(path.join(SK, 'fonts/registry.json'));
  const faces = registry.families.flatMap(f => f.files.map(file => {
    const weight = Array.isArray(file.wght) ? file.wght.join(' ') : file.wght;
    return `@font-face{font-family:"${f.family}";font-style:${file.style || 'normal'};font-weight:${weight};src:url(data:font/woff2;base64,${fs.readFileSync(path.join(SK, 'fonts', file.file)).toString('base64')})${file.unicodeRange ? ';unicode-range:' + file.unicodeRange : ''}}`;
  })).join('\n');
  const presetIds = json(path.join(SK, 'styles/index.json')).presets.map(p => p.id);
  const schemas = Object.fromEntries(['brand', 'spec', 'preset', 'occasion', 'hook', 'plan', 'qa-report'].map(k => [k, json(path.join(SK, 'schemas', k + '.schema.json'))]));
  const strings = json(path.join(SK, 'runtime/ui-strings.json'));
  Object.assign(strings.strings, json(path.join(SK, 'runtime/ui-strings-visual.json')).strings);
  const blocks = {
    'cs-config': { engine: 'cs-1.2.0', view: 'design', uiDialect: 'eg', mode: 'full', lane: 'studio', buildId: 'free-test', builtAt: '2026-10-23T00:00:00Z', fonts: [], capabilities: [] },
    'cs-spec': json(path.join(ROOT, 'tests/fixtures/free/sample.spec.json')),
    'cs-brand': json(path.join(ROOT, 'tests/fixtures/brand.eg.creator.json')),
    'cs-presets': presetIds.map(id => json(path.join(SK, 'styles', id, 'preset.json'))),
    'cs-occasions': [], 'cs-rules': CS.core.registry.rules(), 'cs-schemas': schemas,
    'cs-fonts-meta': { registry, coverage: json(path.join(SK, 'fonts/coverage.json')) }, 'cs-ui-strings': strings,
    ...CS.visual._.blocks
  };
  const block = (id, v) => `<script type="application/json" id="${id}">${JSON.stringify(v).replace(/</g, '\\u003c')}</script>`;
  let arch = read(path.join(SK, 'templates/archetypes.html')).replace('</style>', read(path.join(SK, 'templates/primitives.css')) + '</style>');
  const chunks = ['core', 'paint', 'motion', 'hf', 'mp4', 'qa', 'export', 'ui', 'brandbook', 'art', 'visual', 'qa-visual', 'visual-ui'].map(id => `<script id="cs-chunk-${id}">${read(path.join(PRIVATE, 'cs-' + id + '.js'))}</script>`).join('\n');
  const decors = presetIds.map(id => `<style data-cs-decor="${id}">${read(path.join(SK, 'styles', id, 'decor.css'))}</style>`).join('\n');
  let page = read(path.join(SK, 'templates/studio.html'));
  const replacements = { NOTICE: '', STUDIO_CSS: read(path.join(SK, 'runtime/studio.css')), ICONS: read(path.join(SK, 'runtime/icons.svg')), FONTS: faces, BLOCKS: Object.entries(blocks).map(([k, v]) => block(k, v)).join('\n') + decors + arch, CHUNKS: chunks };
  for (const [k, v] of Object.entries(replacements)) page = page.replace(`<!--CS:${k}-->`, () => v);
  page = page.replace(/\{\{dir\}\}/g, 'rtl').replace(/\{\{lang\}\}/g, 'ar').replace(/\{\{t:([a-z0-9.-]+)\}\}/g, (_, k) => strings.strings[k]?.eg || k);
  const file = path.join(PRIVATE, 'studio.html');
  fs.writeFileSync(file, '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"></head><body>' + page + '</body></html>');
  return file;
}

export async function withFreeStudio(fn) {
  const file = buildFreeStudio(), browser = await launchChromium();
  let studio;
  try { studio = await openStudio({ browser, studioFile: file, timeout: 30000 }); return await fn(studio); }
  finally { if (studio) await studio.close(); await browser.close(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(buildFreeStudio());
