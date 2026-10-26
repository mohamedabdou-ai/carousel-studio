import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { openGeometryPage } from '../geometry/page.mjs';
import { decodePng, ssim } from '../parity/lib/ssim.mjs';
const h=await openGeometryPage();
try {
 const runtime=path.join(os.tmpdir(),'cs-r3/last');
 await h.page.addScriptTag({content:fs.readFileSync(path.join(runtime,'cs-paint.js'),'utf8')});
 const base='tests/cover-baseline/baseline';
 const spec=JSON.parse(fs.readFileSync(path.join(base,'input/spec.json'),'utf8'));
 const brand=JSON.parse(fs.readFileSync(path.join(base,'input/brand.json'),'utf8'));
 if(brand.visual){delete brand.visual.palette;delete brand.visual.fonts}
 const manifest=JSON.parse(fs.readFileSync(path.join(base,'manifest.json'),'utf8'));
 let count=0;
 for(const [preset,b] of Object.entries(manifest.presets))for(const [name,entry]of Object.entries(b.entries)){
  if(name==='frame0')continue;
  const file=(entry.sameAs?b.entries[entry.sameAs]:entry).file;if(!file)continue;
  const png=await h.page.evaluate(async ({spec,brand,preset,variant})=>{
   spec=structuredClone(spec);spec.style.presetId=preset+'@1.0';delete spec.frozen;
   if(variant)spec.slides[0].variant=variant;
   const d=await CS.core.render.deck(spec,brand,{mode:'export',useFrozen:false,slideIds:[spec.slides[0].id]});
   try{return(await CS.paint.toCanvas(d.slides[0].el,{scale:.5,painter:'svg'})).toDataURL().split(',')[1]}finally{d.dispose()}
  },{spec,brand,preset,variant:entry.variant});
  const score=ssim(decodePng(fs.readFileSync(path.join(base,file))),decodePng(Buffer.from(png,'base64')));
  console.log(preset,name,score);assert.equal(score,1,`${preset}/${name} cover changed`);count++;
 }
 console.log(`${count} covers: SSIM 1.0`);
}finally{await h.close()}
