/* Q4 spec gates. */
(function (){
const V=()=>CS.visual||{},T=()=>CS.core.text;const arr=v=>Array.isArray(v)?v:[],vis=s=>V().free?.active(s)?{}:s.visual||{},anc=s=>vis(s).anchor||{};
const old={cover:"top center split photo number",rehook:"base split big-number",item:"base ghost-number side-number media",step:"base ghost-number pill media",stat:"base bar",compare:"columns stacked versus","myth-fact":"stacked columns stamp",quote:"base mark photo","story-beat":"base panel media",checklist:"base boxes ruled media",summary:"list grid media",setup:"base cards",proof:"screenshot base",share:"base big-word",cta:"base pill keyword media",offer:"base card media",testimonial:"base photo card",poster:"top center split photo"};const free=s=>!!V().free?.active(s);const inner=s=>s.type!=="cover"&&s.type!=="poster"&&!free(s),pause=s=>!!vis(s).pause;const words=t=>T().wordCount(t||""),plain=t=>T().stripMarkup(String(t||""));const block=id=>V()._?.block?.(id),fields=s=>CS.qa._.slideFields(s);const west=t=>String(t).replace(/[٠-٩۰-۹]/g,d=>d.charCodeAt(0)-(d>="۰"?1776:1632)).replace(/٫/g,".").replace(/٬/g,",");function emit(c,out,id,s,vars,sev,el){
const e=c.R.checks[id];if(!e||c.gates&&!c.gates.has(id)&&!c.gates.has(e.gate.id)) return;const a=e.def.appliesTo||e.gate.appliesTo||{};if(a.formats&&!a.formats.includes(c.format)||s&&a.slideTypes&&!a.slideTypes.includes(s.type)) return;const format=t=>String(t).replace(/\{([a-zA-Z0-9_]+)\}/g,(m,k)=>vars[k] ?? m);const p=e.def.params||{},next=sev||e.def.sev,r=p.rollout;const f={gate:e.gate.id,rule:id,sev:r?.stage===0?r.stage0Sev:next};if(r?.stage===0) f.prospect=next!==f.sev;if(s) f.slide=s.id;if(el) f.el=el;f.msg={ar:format(e.def.msg.ar),en:format(e.def.msg.en)};if(e.def.fix) f.fix={ar:format(e.def.fix.ar),en:format(e.def.fix.en)};f.autofixed=false;out.push(f);}
function add(id,run){
CS.qav.add("text",{id,ids:[id],run(c){
if(/^VA/.test(id)) c={...c,slides:c.slides.map(s=>free(s)?{id:s.id,type:"cover"}:s)};
const p=c.R.checks[id]?.def.params;if(!p||c.spec.style?.visualMode==="off") return [];const out=[];run(c,out,p,(s,v,sev,key)=>emit(c,out,id,s,v,sev,key));return out;}});}
function demoBad(s,d){
const x=s.demo,out=[],put=(el,count,max)=>{if(count>max) out.push({el:s.id+"."+el,count,max});};if(!x) return out;put("demo",arr(x.lines).length,d.lines);arr(x.lines).forEach((l,i)=>{put("demo."+i,words(l.text),d.lineWords);put("demo."+i,[...plain(l.text)].length,d.lineChars);});put("demo-caption",words(x.caption),d.captionWords);put("demo-caption",[...plain(x.caption)].length,d.captionChars);return out;}
function refs(s){
const a=anc(s),out=[],put=(n,obj,key)=>{if(n) out.push({n,obj,key:s.id+"."+key});};put(a.icon,false,"anchor.icon");put(a.object,true,"anchor.object");arr(a.icons).forEach((n,i)=>put(n,false,"anchor.icons."+i));arr(vis(s).rowIcons).forEach((n,i)=>put(n,false,"rowIcons."+i));arr(s.items).forEach((x,i)=>put(x.icon,false,"items."+i));arr(a.chart?.values).forEach((x,i)=>put(x.icon,false,"chart."+i+".icon"));return out;}
add("VA1.anchor-present",(c,o,p,e)=>{
let run=0;c.slides.forEach(s=>{
if(!inner(s)||pause(s)||s.media?.assetId||anc(s).kind&&anc(s).kind!=="none"){run=0;return;}
run++;e(s,{run},!s.visual?p.unplannedSev:run>=p.runMin&&p.block.enabled?"BLOCK":"FIX");});});
add("VA3.valid",(c,o,p,e)=>{
const caps=V().caps?.(),pack=block("cs-icon-pack"),objects=block("cs-icon-objects");c.slides.forEach((s,i)=>{
if(!s.visual) return;const v=vis(s),a=anc(s),bad=(el,detail)=>e(s,{el:s.id+"."+el,detail},null,s.id+"."+el);if(caps){
const sub=CS.art?._?.sub?.(a);if(a.kind&&a.kind!=="none"&&!(caps.art[a.kind]||[]).includes(sub)) bad("anchor","unknown kind/sub");if(v.recipe&&!caps.recipes.includes(v.recipe)) bad("recipe","unknown recipe");if(s.variant&&!(caps.variants[s.type]||[]).concat((old[s.type]||"").split(" ")).includes(s.variant)) bad("variant","unknown variant");}
refs(s).forEach(r=>{
if(r.obj?objects&&!arr(objects.objects).some(x=>x.id===r.n):pack&&!Object.hasOwn(pack.icons||{},r.n)) bad(r.key.slice(s.id.length+1),"unknown "+(r.obj?"object":"icon"));});const rows=arr(s.bullets).length||arr(s.items).length;if(arr(v.rowIcons).length>rows||arr(v.rowIcons).length>Math.min(5,p.rowIconsMax)) bad("rowIcons","row icon count");const n=arr(s.items).length,range=p.itemsByType[s.type];if(n>p.itemsMax||range&&(n<range[0]||n>range[1])||s.type==="grid"&&s.variant==="bento"&&n>4||s.type==="timeline"&&s.variant==="rail"&&n>4) bad("items","item count");if(a.kind==="rows"&&Math.max(n,arr(s.bullets).length)>5) bad("anchor","icon row count");if(v.span&&![c.slides[i-1]?.id,c.slides[i+1]?.id].includes(v.span.with)) bad("span","non-adjacent span");if(a.mock?.kind==="artefact"&&!a.mock.artefact) bad("mock","artefact missing");demoBad(s,p.demo).forEach(x=>bad(x.el.slice(s.id.length+1),"demo limit"));const ch=a.chart;if(ch){
const vs=arr(ch.values),r=p.chartValues[ch.kind];if(!r||vs.length<r[0]||vs.length>r[1]||vs.some(x=>!Number.isFinite(x.value)||x.value<0)) bad("chart","chart values");if(ch.kind==="pictogram"&&ch.total>p.pictogramMaxIcons) bad("chart","pictogram total");if(ch.kind==="donut"&&vs.every(x=>Number.isFinite(x.value)&&x.value>=0)){
const ns=vs.map(x=>{const [m,e]=String(x.value).split("e");return [BigInt(m.replace(".","")),+(e||0)-(m.split(".")[1]||"").length];});const k=Math.min(...ns.map(x=>x[1])),xs=ns.map(([n,e])=>n*10n**BigInt(e-k)),sum=xs.reduce((a,b)=>a+b,0n);if(!sum||xs.some((x,i)=>xs.slice(i+1).some(y=>(x>y?x-y:y-x)*100n<BigInt(p.donutMinGapPct)*sum))) bad("chart","donut gap");}
}
});});
add("VA4.chart-honesty",(c,o,p,e)=>c.slides.forEach(s=>{
const ch=anc(s).chart;if(!ch||!arr(ch.values).length) return;const el=s.id+".chart";if(!ch.illustrative&&!arr(s.sourceIds).some(id=>arr(c.spec.sources).some(x=>x.id===id))) e(s,{el},"BLOCK",el);else if(ch.illustrative&&!CS.art?.chart?.proof&&!fields(s).some(f=>/رسم توضيحي|illustrative/i.test(f.text))) e(s,{el},p.tagSev,el);}));
add("VA6.pause",(c,o,p,e)=>{
const ss=c.slides.filter(inner),ps=ss.filter(pause);const bad=(s,detail)=>e(s,{detail});if(ps.length*p.per>ss.length*p.max) bad(ps[0],"pause share");ss.forEach((s,i)=>{
if(pause(s)&&(pause(ss[i+1]||{})||ss[i+1]?.type==="cta")) bad(s,"adjacent pause or CTA");if(s.variant==="statement"&&[s.title||s.headline,s.sub,s.body].reduce((n,t)=>n+words(t),0)>p.statementWords) bad(s,"statement words");});});
add("VA7.agreement",(c,o,p,e)=>c.slides.forEach(s=>{
if(!s.visual||!V().icons) return;const text=fields(s).filter(f=>!/^(anchor|mock|chart)\./.test(f.field)).map(f=>f.text).join(" ");const opts={dialect:c.dialect,k:p.topN},picks=V().icons.find(text,opts),hits=V().icons.concepts(text,opts);refs(s).filter(r=>!r.obj).forEach(r=>{
const neg=hits.some(x=>x.neg||x.pol==="neg"||x.pol==="warn");const joy=/(?:smil|grin|laugh|party|confetti|celebrat|thumbs-up)/.test(r.n);if(neg&&joy) e(s,{icon:r.n},"FIX",r.key);else if(!s.notes&&!s.visual.why&&!picks.some(x=>x.name===r.n)) e(s,{icon:r.n},"NOTE",r.key);});}));
add("VA8.constraints",(c,o,p,e)=>{
const rules=c.brand?.visual?.art?.constraints||{},index=arr(block("cs-icon-index"));c.slides.forEach(s=>refs(s).forEach(r=>{
const row=index.find(x=>x[0]===r.n),f=row?.[4]||{},n=r.n;const cats={figures:!!f.h||/person|user|face|smile/.test(n),animals:!!f.a||/camel|falcon|horse|bird|cat$|dog$/.test(n),music:/music|guitar|drum|piano|violin/.test(n),maps:/map|globe|navigation/.test(n)};Object.keys(cats).forEach(k=>{
if(cats[k]&&(rules[k]==="none"||rules[k]===false||rules[k]==="forbid"||k==="figures"&&rules[k]==="faceless"&&/face|smile|laugh/.test(n))) e(s,{icon:n,rule:k},null,r.key);});}));});
add("D8.anchor-run",(c,o,p,e)=>{
const key=s=>inner(s)&&s.visual?[s.type,s.variant||"",vis(s).recipe||"under",anc(s).kind||"none"].join("|"):null;const ss=c.slides,ks=ss.map(key);for(let i=0;i<ss.length;){
let j=i+1;while (ks[i]&&ks[j]===ks[i]) j++;if(j-i>=p.run) e(ss[i],{count:j-i,detail:ks[i]});i=j;}
for(let i=0;i<ss.length;){
let j=i+2;if(ks[i]&&ks[i+1]&&ks[i]!==ks[i+1]) while (j<ss.length&&ks[j]===ks[i+(j-i) % 2]) j++;if(j-i>=p.altWindow){e(ss[i],{count:j-i,detail:"alternation"});i=j;}else i++;}
});
add("D8.tone-run",(c,o,p,e)=>{
const ss=c.slides.filter(s=>s.type!=="cover"&&s.type!=="poster"),bias=p.toneBias[c.spec.style?.world?.toneBias||"balanced"];let count=0,start,total=0;ss.forEach(s=>{
if(!free(s)&&s.visual&&vis(s).tone&&vis(s).tone!=="base"){if(!count) start=s;count++;total++;}
else{if(count>p.maxRun) e(start,{count,max:p.maxRun});count=0;}
});if(count>p.maxRun) e(start,{count,max:p.maxRun});if(total*100>ss.length*bias) e(null,{count:total,max:Math.floor(ss.length*bias/100)});});
add("D10.glyph-icon",(c,o,p,e)=>c.slides.forEach(s=>fields(s).forEach(f=>{
const text=f.text.replace(/<span\b[^>]*class=["'][^"']*\bcs-emoji\b[^"']*["'][^>]*>[\s\S]*?<\/span>/gi,"");const hit=Array.from(plain(text)).find(ch=>p.glyphs.includes(ch.codePointAt(0))||!/[©®™]/u.test(ch)&&/[\p{Extended_Pictographic}\p{Regional_Indicator}\u20e3]/u.test(ch));if(hit) e(s,{text:hit,el:f.key},null,f.key);})));
add("C2.body-with-art",(c,o,p,e)=>c.slides.forEach(s=>{
const a=anc(s);if(a.kind==="mock"||a.kind==="chart"&&arr(a.chart?.values).some(v=>v.label)){
const count=words(s.body);if(count>p.bodyMax) e(s,{count,max:p.bodyMax},"NOTE",s.id+".body");}
}));
add("C2.demo-words",(c,o,p,e)=>c.slides.forEach(s=>demoBad(s,p.demo).forEach(x=>e(s,x,null,x.el))));
add("C2.demo-missing",(c,o,p,e)=>c.slides.forEach(s=>{
if(p.needsDemo.includes(s.type)&&(s.type!=="cta"||s.variant==="keyword"||s.cta?.kind==="keyword-dm")&&!arr(s.demo?.lines).some(x=>plain(x.text).trim())) e(s,{type:s.type});}));
add("C2.demo-duplicate",(c,o,p,e)=>c.slides.forEach(s=>{
const lex=t=>plain(t).toLowerCase().match(/[\p{L}\p{N}]+/gu)||[],body=new Set(lex(s.body));arr(s.demo?.lines).forEach((l,i)=>{
const w=lex(l.text),n=w.filter(x=>body.has(x)).length;if(n*100>w.length*p.demo.duplicateShare){const el=s.id+".demo."+i;e(s,{el,pct:Math.floor(n*100/w.length)},null,el);}
});}));
add("C2.figure-repeat",(c,o,p,e)=>c.slides.forEach(s=>{
const a=anc(s),all=fields(s).map(f=>f.text).concat(s.number?.value||"",a.value||"",arr(a.chart?.values).map(v=>v.value).join(" ")),counts=new Map();all.forEach(t=>{for(const m of west(plain(t)).matchAll(/[0-9]+(?:[,.][0-9]+)*(?:\s*[/∕]\s*[0-9]+)?/g)){const n=m[0].replace(/,/g,"").replace(/\s/g,"").replace(/∕/g,"/");counts.set(n,(counts.get(n)||0)+1);}});counts.forEach((count,text)=>{if(count>p.max) e(s,{text,count,max:p.max});});}));
add("C2.word-echo",(c,o,p,e)=>{
const lex=t=>plain(t).toLowerCase().match(/[\p{L}\p{N}]+/gu)||[],texts=c.slides.flatMap(s=>[s.title,s.headline,s.cta?.text].filter(Boolean));
c.slides.forEach(s=>{const a=anc(s),w=a.kind==="word"?lex(a.word||""):[];if(w.length!==1)return;
const n=texts.reduce((k,t)=>k+lex(t).filter(x=>x===w[0]).length,0);if(n>=p.max) e(s,{word:a.word});});});
})();
