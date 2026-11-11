// Fresh, text-free fixtures; no bundled or third-party marks. Also runs inside test:geometry.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { openGeometryPage } from './page.mjs';

const skill = new URL('../../plugins/carousel-studio/skills/carousel-design/', import.meta.url);

export async function checkPictures(page) {
  for (const chunk of ['paint', 'motion', 'hf']) {
    await page.addScriptTag({ content: fs.readFileSync(new URL(`runtime/cs-${chunk}.js`, skill), 'utf8') });
  }
  const freeContract = JSON.parse(fs.readFileSync(new URL('data/free-design.json', skill), 'utf8'));
  await page.evaluate(data => {
    const block = document.createElement('script'); block.type = 'application/json'; block.id = 'cs-free-design';
    block.textContent = JSON.stringify(data); document.head.append(block);
  }, freeContract);
  const template = fs.readFileSync(new URL('templates/cover.hf.html', skill), 'utf8');
  const base = JSON.parse(fs.readFileSync(new URL('../fixtures/spec.eg.8slides.json', import.meta.url), 'utf8'));
  const rows = await page.evaluate(async ({ template, base }) => {
    const failures = [], check = (ok, why) => { if (!ok) failures.push(why); };
    const c = document.createElement('canvas'); c.width = 240; c.height = 80;
    const g = c.getContext('2d'); g.fillStyle = '#e60020'; g.fillRect(0, 0, 240, 80);
    const ref = c.toDataURL('image/png');
    const asset = { id: 'fresh-picture', ref, kind: 'image', mime: 'image/png', width: 240, height: 80, aiGenerated: false };
    g.fillStyle = '#145ac8'; g.fillRect(0, 0, 240, 80);
    const scene = { ...asset, id: 'cover-scene', ref: c.toDataURL('image/png') };
    const types = ['step', 'checklist', 'summary', 'cta', 'offer'];
    const inside = (a, b) => a.x >= b.x - 1 && a.y >= b.y - 1 && a.right <= b.right + 1 && a.bottom <= b.bottom + 1;
    async function paintedRed(el, width) {
      const canvas = await CS.paint.toCanvas(el, { painter: 'replay', scale: width / 1080 });
      const root = el.getBoundingClientRect(), mark = el.querySelector('[data-slot="logo"]').getBoundingClientRect();
      const sx = canvas.width / root.width, sy = canvas.height / root.height;
      const x = Math.max(0, Math.floor((mark.left - root.left) * sx)), y = Math.max(0, Math.floor((mark.top - root.top) * sy));
      const w = Math.min(canvas.width - x, Math.ceil(mark.width * sx)), h = Math.min(canvas.height - y, Math.ceil(mark.height * sy));
      if (w <= 0 || h <= 0) return 0;
      const px = canvas.getContext('2d').getImageData(x, y, w, h).data;
      let red = 0; for (let i = 0; i < px.length; i += 4) if (Math.abs(px[i] - 230) <= 2 && px[i + 1] <= 2 && Math.abs(px[i + 2] - 32) <= 2) red++;
      return red;
    }
    let layouts = 0, logos = 0;
    const hf = document.createElement('script'); hf.id = 'cs-hf-template'; hf.type = 'text/plain'; hf.textContent = template; document.head.append(hf);
    for (const p of CS.core.registry.listPresets()) {
      for (const height of [1440, 1350]) {
        for (const type of types) {
          const spec = structuredClone(base); delete spec.frozen;
          spec.canvas.h = height; spec.style = { presetId: p.id + '@' + p.version };
          const s = { id: 's02', n: 2, type, variant: 'media', title: 'فكرة واحدة واضحة', body: 'جرّب الفكرة ثم راجع النتيجة.',
            visual: { anchor: { kind: 'none' }, tone: 'base' }, media: { slot: 'photo', assetId: asset.id, calmZone: 'bottom' } };
          if (type === 'step') s.ord = 1;
          if (['checklist', 'summary', 'offer'].includes(type)) s.bullets = ['اختر فكرة واحدة', 'راجع النتيجة', 'احتفظ بالمفيد'];
          if (['cta', 'summary', 'offer'].includes(type)) s.cta = { kind: 'save', text: 'احفظ الفكرة لتجربتها' };
          spec.slides = [{ id: 's01', n: 1, type: 'cover', headline: 'خطوة لفكرة أفضل' }, s]; spec.assets = [asset];
          if (type === 'step') { spec.architecture = 'steps'; spec.slides[0].headline = '1 خطوة لفكرة أفضل'; check(!CS.qa.runText({ spec }, { gates: ['C6'] }).some(f => f.rule === 'C6.list-count'), p.id + ': numbered picture step keeps the cover count'); }
          const r = await CS.core.render.slide(spec, null, 1, { useFrozen: false });
          try {
            const label = `${p.id}/${type}/media/${height}`, main = r.el.querySelector('.cs-content');
            const pic = r.el.querySelector('[data-slot="media"]'), box = pic?.getBoundingClientRect();
            check(r.el.dataset.variant === 'media', label + ': registered');
            check(box && box.height >= (height === 1440 ? 400 : 360) && inside(box, main.getBoundingClientRect()), label + ': substantial picture inside content');
            if (box) for (const n of main.querySelectorAll('[data-kind="text"],.cs-bullets,.cs-cta')) {
              const b = n.getBoundingClientRect();
              check(inside(b, main.getBoundingClientRect()), label + ': copy inside content');
              check(box.height > b.height, label + ': picture is largest element');
              check(b.bottom <= box.top + 1 || b.top >= box.bottom - 1, label + ': picture clears copy');
            }
            if (['cta', 'summary', 'offer'].includes(type)) check(r.el.querySelector('.cs-cta-text')?.textContent.includes('احفظ'), label + ': closing CTA retained');
            if (type === 'step') check(r.el.querySelector('[data-ord="1"]')?.textContent.includes('1'), label + ': step label and ordinal');
            check(r.fit.ok, label + ': no overflow');
            layouts++;
          } finally { r.el.remove(); }
        }
      }
      const spec = structuredClone(base); delete spec.frozen;
      spec.style = { presetId: p.id + '@' + p.version }; spec.assets = [asset, scene];
      spec.slides = [{ id: 's01', n: 1, type: 'cover', kicker: 'أداة جديدة', headline: 'فكرة تستحق التجربة', sub: 'اختبرها اليوم', variant: 'photo', media: { slot: 'photo', assetId: scene.id } }];
      spec.cover = { ...spec.cover, logo: { assetId: asset.id, ground: p.id === 'creator' ? 'dark' : 'light' } };
      const r = await CS.core.render.slide(spec, null, 0, { useFrozen: false });
      try {
        const logo = r.el.querySelector('[data-slot="logo"]'), img = logo?.querySelector('img'), b = logo?.getBoundingClientRect();
        check(logo?.closest('.cs-content') && !logo?.closest('.cs-bg'), p.id + ': logo stays separate from the cover picture');
        check(img?.naturalWidth === 240, p.id + ': logo decoded');
        check(b && b.width <= 192 && b.height <= 88 && b.width >= 144 && b.height >= 64, p.id + ': bounded logo');
        if (b) {
          const root = r.el.getBoundingClientRect();
          check(b.top - root.top >= 261 && b.bottom - root.top < 1165, p.id + ': logo clears platform chrome');
          for (const n of r.el.querySelectorAll('.cs-content [data-kind="text"]')) {
            const t = n.getBoundingClientRect(); check(t.bottom <= b.top + 1 || t.top >= b.bottom - 1, p.id + ': logo clears copy');
          }
        }
        check(getComputedStyle(logo).backgroundColor === (p.id === 'creator' ? 'rgb(21, 21, 21)' : 'rgb(255, 255, 255)'), p.id + ': clear logo ground');
        check(getComputedStyle(img).objectFit === 'contain', p.id + ': logo never cropped');
        for (const width of [1080, 130]) {
          const red = await paintedRed(r.el, width);
          check(red > (width === 130 ? 8 : 400), `${p.id}: logo paints at ${width} px`);
        }
        const findings = await CS.qa.runRendered({ spec, deck: { slides: [r] } });
        check(!findings.some(f => f.sev === 'BLOCK' && /D2|D3|D5/.test(f.gate) && /logo/.test(f.el || '')), p.id + ': known logo slot');
        const timeline = CS.motion.build(r.el, { recipe: 'calm', seconds: 6 });
        const player = CS.motion.mount(r.el, timeline);
        try {
          for (const time of [0, 3, 6 - 1 / 30]) {
            player.seek(time);
            check(await paintedRed(r.el, 130) > 8, `${p.id}: logo paints in cover motion at ${time}s`);
          }
        } finally { player.poster(); player.destroy(); }
        const composition = await CS.motion.hf.composition({ slideEl: r.el, timeline, embedFonts: false });
        check(composition.includes('data-slot="logo"') && composition.includes(ref), p.id + ': cover composition retains embedded logo');
        logos++;
      } finally { r.el.remove(); }
    }
    const spec = structuredClone(base); delete spec.frozen;
    spec.assets = [asset, { ...asset, id: 'picture-upload', ref: 'asset:fresh-picture' }];
    spec.slides = [{ id: 's02', n: 1, type: 'step', title: 'صورة داخل الشريحة', media: { slot: 'photo', assetId: asset.id },
      free: { html: '<div class="f-picture" data-picture="fresh-picture" data-fit="contain"></div><p data-field="title"></p>', css: '.f-picture{width:100%;height:520px;flex-shrink:0}' } }];
    const r = await CS.core.render.slide(spec, null, 0, { useFrozen: false });
    try {
      const image = r.el.querySelector('[data-picture] img');
      check(image?.naturalWidth === 240 && image.getAttribute('src') === ref, 'free placeholder resolves its asset without a host resolver');
      check(image && getComputedStyle(image).objectFit === 'contain', 'free placeholder uses requested fit');
      check(!r.el.querySelector('.cs-bg [data-picture]'), 'free picture stays in authored position');
    } finally { r.el.remove(); }
    delete spec.slides[0].free;
    spec.slides[0].media.assetId = 'picture-upload';
    const opaque = CS.core.compose.slide(spec, spec.slides[0], CS.core.resolve.post(spec), null);
    check(opaque.querySelector('img')?.getAttribute('src') === '/_blob/fresh-picture', 'upload ids remain distinct from spec asset ids');
    const custom = CS.core.compose.slide(spec, spec.slides[0], CS.core.resolve.post(spec), null, { assets: () => ({ url: scene.ref, mime: 'image/png' }) });
    check(custom.querySelector('img')?.getAttribute('src') === scene.ref, 'explicit asset resolvers keep priority');
    return { failures, layouts, logos };
  }, { template, base });
  assert.deepEqual(rows.failures, [], rows.failures.join('\n'));
  console.log(`ok   pictures ${rows.layouts} layouts, ${rows.logos} logos at feed and 130 px, free pictures and upload refs`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const h = await openGeometryPage();
  try { await checkPictures(h.page); } finally { await h.close(); }
}
