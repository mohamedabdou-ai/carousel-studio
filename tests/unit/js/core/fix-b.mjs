// Source-built integration checks; avoids the Python Studio assembler and never writes shared runtime.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { withArt } from '../art/harness.mjs';
import { decodePng, ssim } from '../../../parity/lib/ssim.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../..');
const sk=path.join(root,'plugins/carousel-studio/skills/carousel-design');
const read=f=>fs.readFileSync(f,'utf8'), json=f=>JSON.parse(read(f));
const fonts=json(path.join(sk,'fonts/registry.json'));
const fontCss=fonts.families.flatMap(f=>f.files.map(x=>`@font-face{font-family:"${f.family}";font-style:normal;font-weight:${Array.isArray(x.wght)?x.wght.join(' '):x.wght};src:url(data:font/woff2;base64,${fs.readFileSync(path.join(sk,'fonts',x.file)).toString('base64')})}`)).join('\n');
const ids=['swiss','creator','notebook','poster','interface','heritage'];
const presets=ids.map(id=>({p:json(path.join(sk,'styles',id,'preset.json')),css:read(path.join(sk,'styles',id,'decor.css'))}));
const baseline=path.join(root,'tests/cover-baseline/baseline');
const manifest=json(path.join(baseline,'manifest.json'));
const brand=json(path.join(baseline,'input/brand.json'));delete brand.visual.palette;delete brand.visual.fonts;
let failures=0;
function check(name,fn){try{fn();console.log('ok '+name)}catch(e){failures++;console.log('FAIL '+name+': '+e.message)}}
await withArt(async art=>{
  await art.evaluate(({fonts,coverage,fontCss,arche,primitives,presets,marks})=>{
    document.querySelectorAll('style').forEach(n=>n.remove());
    const font=document.createElement('style');font.id='cs-fonts';font.textContent=fontCss;document.head.appendChild(font);
    CS.core.registry.registerFonts({registry:fonts,coverage});
    CS.core.registry.registerArchetypes(new DOMParser().parseFromString(arche.replace('</style>','\n'+primitives+'\n</style>'),'text/html'));
    for(const {p,css} of presets)CS.core.registry.registerPreset(p,css);
    CS.visual._.blocks['cs-art-marks']=marks;
  },{fonts,coverage:json(path.join(sk,'fonts/coverage.json')),fontCss,arche:read(path.join(sk,'templates/archetypes.html')),primitives:read(path.join(sk,'templates/primitives.css')),presets,marks:json(path.join(sk,'data/art/marks.json'))});
  if(!process.argv.includes('--no-covers'))for(const [id,variant] of ['creator','poster'].flatMap(id=>['default',...manifest.presets[id].coverVariants].map(v=>[id,v]))){
    const spec=json(path.join(baseline,'input/spec.json'));spec.style.presetId=id+'@1.0';
    if(variant!=='default')spec.slides[0].variant=variant;
    const records=await art.evaluate(async({spec,brand})=>{
      const out=[];
      for(let i=0;i<2;i++){
        const d=await CS.core.render.deck(spec,brand,{mode:'export',useFrozen:false,slideIds:[spec.slides[0].id]});
        const c=await CS.paint.toCanvas(d.slides[0].el,{scale:.5,painter:'svg'});
        out.push({png:c.toDataURL('image/png').split(',')[1],html:d.slides[0].el.outerHTML});d.dispose();
      }return out;
    },{spec,brand});
    check(id+' cover '+variant+' deterministic',()=>assert.deepEqual(records[0],records[1]));
    let entry=manifest.presets[id].entries[variant==='default'?'cover':'cover@'+variant];if(entry.sameAs)entry=manifest.presets[id].entries[entry.sameAs];
    const score=ssim(decodePng(Buffer.from(records[0].png,'base64')),decodePng(fs.readFileSync(path.join(baseline,entry.file))));
    check(id+' approved cover '+variant+' SSIM '+score.toFixed(8),()=>assert.equal(score,1));
    if(process.argv.includes('--cover-diag')){
      const legacy=process.env.CS_LEGACY_ROOT;
      if(!legacy){console.log('skip cover diagnostics: CS_LEGACY_ROOT is unset');continue;}
      const before=presets.find(x=>x.p.id===id),css=read(path.join(legacy,'plugins/carousel-studio/skills/carousel-design/styles',id,'decor.css'));
      console.log('cover CSS differences '+id,await art.evaluate(async({spec,brand,before,css})=>{
        const snapshots=[];
        for(const sheet of [before.css,css]){
          CS.core.registry.registerPreset(before.p,sheet);
          const d=await CS.core.render.deck(spec,brand,{mode:'export',useFrozen:false,slideIds:[spec.slides[0].id]});
          snapshots.push([...d.slides[0].el.querySelectorAll('*')].filter(n=>n.classList.length&&!n.classList.contains('w')&&!n.classList.contains('cs-ln')).flatMap(n=>['','::before','::after'].map(p=>{
            const s=getComputedStyle(n,p);return {el:n.className.baseVal||n.className,p,style:Object.fromEntries([...s].filter(k=>!k.startsWith('--')).map(k=>[k,s.getPropertyValue(k)]))};
          })));d.dispose();
        }
        CS.core.registry.registerPreset(before.p,before.css);
        return snapshots[0].flatMap((a,i)=>Object.entries(a.style).filter(([k,v])=>snapshots[1][i]?.style[k]!==v).map(([k,v])=>[a.el,a.p,k,v,snapshots[1][i]?.style[k]]));
      },{spec,brand,before,css}));
    }
    if(process.env.CS_ART_OUT){fs.mkdirSync(process.env.CS_ART_OUT,{recursive:true});fs.writeFileSync(path.join(process.env.CS_ART_OUT,id+'-cover.png'),Buffer.from(records[0].png,'base64'));}
  }
  for(const id of ['creator','poster']){
    const dir=process.env.CS_SLICE_ROOT;
    if(!dir){console.log('skip '+id+' external slice: CS_SLICE_ROOT is unset');continue;}
    if(!fs.existsSync(path.join(dir,id,'spec.planned.json')))continue;
    const spec=json(path.join(dir,id,'spec.planned.json')),b=json(path.join(dir,id,'brand.json'));
    const runs=[];
    for(let i=0;i<2;i++)runs.push(await art.evaluate(async({spec,b})=>{
      const d=await CS.core.render.deck(spec,b,{mode:'export',useFrozen:false});
      const out=d.slides.filter(r=>r.el.querySelector('[data-anchor-kind="field"],[data-anchor-kind="rows"]')||['compare','setup','grid','timeline'].includes(r.el.dataset.type)).map(r=>{
        const el=r.el,rect=el.getBoundingClientRect(),a=el.querySelector('.cs-anchor-slot'),parts=[...el.querySelectorAll('[data-slot="art"],.cs-side-text,.cs-bullet')];
        return {id:r.id,type:el.dataset.type,html:el.outerHTML,fit:r.fit.ok,native:el.querySelectorAll('.cs-sides,.cs-bullets').length,anchor:!!a,bottom:a?a.getBoundingClientRect().bottom-rect.top:0,footer:el.querySelector('.cs-footer').getBoundingClientRect().top-rect.top,text:parts.map(n=>n.textContent)};
      });d.dispose();return out;
    },{spec,b}));
    check(id+' slice deterministic',()=>assert.deepEqual(runs[0],runs[1]));
    for(const r of runs[0]){
      if(r.type==='grid')check(id+' '+r.id+' grid fits',()=>assert(r.fit));
      if(['compare','setup'].includes(r.type)){
        check(id+' '+r.id+' exactly one text owner',()=>{assert(r.anchor);assert.equal(r.native,0)});
        check(id+' '+r.id+' anchor above footer',()=>assert(r.bottom<r.footer));
        check(id+' '+r.id+' fits',()=>assert(r.fit));
      }
    }
  }
  // Actual composed roots and descendants must read the same eight aliases as the resolver.
  const tones=await art.evaluate(({ids,brand})=>{
    const roles={bg:'bg',surface:'surface',ink:'ink',inkMuted:'ink-muted',accent:'accent',accent2:'accent-2',onAccent:'on-accent',line:'line'},out=[];
    for(const id of ids)for(const tone of ['base','invert','field']){
      const s={canvas:{w:1080,h:1440},locale:{dialect:'eg'},style:{presetId:id+'@1.0'},slides:[{id:'s02',type:'item',title:'عنوان',visual:{tone,anchor:{kind:'none'}}}]};
      const t=CS.core.resolve.post(s,brand);if(!t.art)continue;
      const el=CS.core.compose.slide(s,s.slides[0],CS.core.resolve.slide(t,s.slides[0]),brand,{});document.body.appendChild(el);
      const tk=t.tones[tone];
      for(const [k,v] of Object.entries(roles))for(const n of [el,el.querySelector('.cs-content')])out.push([id,tone,k,tk[k],getComputedStyle(n).getPropertyValue('--cs-'+v).trim()]);
      el.remove();
    }return out;
  },{ids,brand});
  check('tone root and descendant aliases',()=>{assert(tones.length>=96);assert.deepEqual(tones.filter(x=>x[3].toLowerCase()!==x[4].toLowerCase()),[])});
  const structures=await art.evaluate(async({brand})=>{
    const out=[];
    for(const h of [1440,1350])for(const lang of ['ar','en'])for(const type of ['grid','timeline']){
      const s={canvas:{w:1080,h},locale:{dialect:lang==='ar'?'eg':'en'},style:{presetId:'poster@1.0'},slides:[{id:'s98',type,title:lang==='ar'?'خطوات بسيطة':'Simple steps',items:Array.from({length:type==='grid'?3:4},(_,i)=>({title:lang==='ar'?'خطوة واضحة':'Clear step',text:lang==='ar'?'ابدأ الآن':'Start now',value:type==='grid'?String([50,30,20][i])+'%':String(i+1),hi:type==='grid'&&i===0})),visual:{tone:'base',recipe:'full',rowIcons:['check','check','check','check'],anchor:{kind:'none'}}}]};
      for(let repeat=0;repeat<2;repeat++){
        const r=await CS.core.render.slide(s,brand,0,{mode:'export',useFrozen:false}),el=r.el,nodes=[...el.querySelectorAll('.cs-item')];
        out.push({h,lang,type,repeat,fit:r.fit,html:el.outerHTML,icons:nodes.map(n=>{const i=n.querySelector('[data-part="icon"]').getBoundingClientRect();return[i.width,i.height]}),heights:nodes.map(n=>n.getBoundingClientRect().height),vw:nodes.map(n=>{const p=n.querySelector('[data-part=value]');return [p.clientWidth,...[...p.querySelectorAll('.w')].map(w=>w.getBoundingClientRect().width)]}),values:nodes.map(n=>parseFloat(getComputedStyle(n.querySelector('[data-part="value"]')).fontSize)),bad:nodes.flatMap(n=>{const b=n.getBoundingClientRect();return [...n.querySelectorAll('[data-part]')].filter(p=>{const q=p.getBoundingClientRect();return q.left<b.left-1||q.right>b.right+1||q.top<b.top-1||q.bottom>b.bottom+1}).map(p=>p.dataset.part)})});
        if(h===1440&&lang==='ar'){
          const a=await CS.paint.toCanvas(el,{painter:'svg',scale:1}),b=await CS.paint.toCanvas(el,{painter:'replay',scale:1});
          out[out.length-1].paintScore=CS.paint.metrics.ssim(a,b);
          out[out.length-1].paintPng=[a.toDataURL('image/png').split(',')[1],b.toDataURL('image/png').split(',')[1]];
        }
        el.remove();
      }
    }return out;
  },{brand});
  check('real grid and rail geometry, both directions and canvases, twice',()=>{
    for(let i=0;i<structures.length;i+=2){const a=structures[i],b=structures[i+1];assert.equal(a.html,b.html);assert(a.fit.ok,JSON.stringify([a.h,a.lang,a.type,a.vw,a.fit]));assert.deepEqual(a.bad,[],JSON.stringify([a.h,a.lang,a.type,a.bad]));assert(a.icons.every(x=>x[0]>0&&x[1]>0));if(a.type==='grid')assert(a.values.every(x=>x>=120));else assert(Math.max(...a.heights)-Math.min(...a.heights)<1);}
  });
  check('grid and rail paint in both engines, twice',()=>{
    const painted=structures.filter(r=>r.paintScore!=null);
    for(const r of painted){
      if(process.env.CS_ART_OUT){fs.mkdirSync(process.env.CS_ART_OUT,{recursive:true});r.paintPng.forEach((b,i)=>fs.writeFileSync(path.join(process.env.CS_ART_OUT,r.type+'-'+r.repeat+'-'+i+'.png'),Buffer.from(b,'base64')));}
      console.log('painter SSIM '+r.type+' '+r.paintScore);
    }
    assert(painted.every(r=>r.paintScore>=.98),'full-slide painter SSIM is below .98');
    assert.equal(structures.filter(r=>r.paintScore!=null).length,4);
  });
  const figures=await art.evaluate(async({brand})=>{
    const out=[];
    for(const lang of ['ar','en'])for(const type of ['item','quote','step']){
      const s={canvas:{w:1080,h:1440},locale:{dialect:lang==='ar'?'eg':'en'},style:{presetId:'poster@1.0'},slides:[{id:'s96',type,title:'عنوان',body:'نص واضح',visual:{tone:'base',recipe:'under',anchor:{kind:'icon',icon:'check'}}}]};
      for(let repeat=0;repeat<2;repeat++){
        const r=await CS.core.render.slide(s,brand,0,{mode:'export',useFrozen:false}),f=r.el.querySelector('.cs-figure');
        out.push({type,lang,html:r.el.outerHTML,key:f?.dataset.slotKey,floor:f?.dataset.floor,text:f?.textContent,expected:f&&CS.core.freeze.expectedText(s,f.dataset.slotKey)});r.el.remove();
      }
    }return out;
  },{brand});
  check('poster figure labels are composed, keyed, floored and enumerable without ordinals, twice',()=>{
    for(let i=0;i<figures.length;i+=2){const a=figures[i];assert.deepEqual(a,figures[i+1]);assert(a.key);assert(+a.floor>=34);assert.equal(a.text,a.expected);}
  });
  // The same compose inputs used by tests/golden/run.mjs, using freshly built sources.
  const raw=await art.evaluate(({showcase,brand,ids})=>{
    const out={};
    for(const id of ids){const s=JSON.parse(JSON.stringify(showcase));s.style.presetId=id+'@1.0';const p=CS.core.resolve.post(s,brand);out[id]={tokens:p.hash,slides:{}};
      for(const x of s.slides)out[id].slides[x.type]=CS.core.compose.slide(s,x,CS.core.resolve.slide(p,x),brand,{mode:'export'}).outerHTML;
    }return out;
  },{showcase:json(path.join(root,'tools/examples/showcase.spec.json')),brand,ids});
  const golden=json(path.join(root,'tests/golden/manifest.json')),sha=s=>crypto.createHash('sha256').update(s).digest('hex').slice(0,16);
  for(const [id,p] of Object.entries(raw))console.log('golden differences '+id+': '+[...(sha(p.tokens)!==golden.presets[id].tokens?['tokens']:[]),...Object.entries(p.slides).filter(([type,html])=>sha(html)!==golden.presets[id].slides[type]).map(([type])=>type)].join(','));
  check('no browser errors',()=>assert.deepEqual(art.errors,[]));
},{data:'real'});
process.exitCode=failures?1:0;
