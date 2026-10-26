(function(){
var V=CS.visual,C=CS.core,M=new WeakMap,B=new WeakMap,X;
function e(c,t){var n=document.createElement(t||"div");if(c)n.className=c;return n}
function F(v){if(v&&typeof v==="object"){Object.values(v).forEach(F);Object.freeze(v)}return v}
function build(c,l){var b=CS.art?.build?.(c.v.anchor,{...c.a,box:c.box,labelsOnly:!!l});
if(b&&c.tokens.presetId==="poster"&&/^(icon|field):icon$/.test(kind(c))){var n=e("cs-figure"),t=(c.lang==="ar"?"شكل ":"Fig. ")+(c.index+1);(b.labels||=[]).push({el:n,text:t,role:"chip",index:b.labels.length});if(!l)b.el.appendChild(n)}
if(b&&!l){c.anchorMin=b.minHeight;(b.labels||[]).forEach(l=>C.compose.label(l.el,l.text,c,l))}return b}

var OWN={"field:panel":["sides"],"rows:list":["bullets","items"],"mock:chat":["number"],"mock:notes":["number"]},
NUM=/^(numeral:|field:numeral$)/,SEL=".cs-side-label,.cs-side-text,.cs-bullet,[data-part=title],[data-part=text],[data-part=value],.cs-num,.cs-unit",MARK=/^(circle|underline|strike|arrow)(-|$)/;
function W(s){return String(s??"").normalize("NFC").replace(/[\u064B-\u065F\u0670\u0640]/g,"").replace(/[\u0660-\u0669\u06F0-\u06F9]/g,d=>d.charCodeAt(0)&15).replace(/[\u066A\uFE6A\uFF05]/g,"%").toLowerCase().match(/[\p{L}\p{N}]+|[%\u2030\u00B0\p{Sc}\p{Sm}]/gu)||[]}
function kind(c){var a=c.v.anchor,s=a&&CS.art?._?.sub?.(a);return a&&s!==undefined?a.kind+":"+s:""}
function nat(n){var a=[...n.querySelectorAll(SEL)];return(a.length?a:[n]).map(x=>x.textContent)}
function has(t,x){var n=W(x).join(" ");return!n||(/^\d/.test(n)?(" "+t+" ").includes(" "+n+" "):t.includes(n))}
function take(c,n){var d=c.d.join(" "),t=W(d).join(" "),s=new Set(W(d)),m=c.slide.number||{};
return/^mock:/.test(kind(c))?[m.value,m.unit].every(x=>has(t,x)):nat(n).every(x=>W(x).every(w=>s.has(w)))}
function keep(c,r){if(NUM.test(kind(c))&&!c.slide.media?.assetId)["number","ord"].forEach(k=>{var n=r.querySelector('[data-slot="'+k+'"]');if(n&&(k==="number"||c.variant==="numeral"))n.dataset.anchor=1})}
function back(c,r){c.o.reverse().forEach(o=>o.p.insertBefore(o.n,o.x?.parentNode===o.p?o.x:null));c.o=[];keep(c,r)}
function ord(c,n){var o=n.parentNode.querySelector('[data-slot="ord"]'),a=c.v.anchor;return!!o&&c.variant==="numeral"&&a?.kind==="numeral"&&(a.value==null||W(a.value).join()===W(o.getAttribute("data-ord")).join())}
V.begin=c=>{
var s=c.slide,t=c.tokens,p=c.spec,v=s.visual;
if(V.free?.active(s)){if(!c.opts.frozenOk)C.freeze.visual.set(c.id,null);return;}
if(!v)v=V.autoPreview(p,c.brand,C.registry.getPreset(t.presetId))?.[c.index];
c.v=v||{};c.recipe=c.v.recipe||"under";c.tone=c.v.tone||"base";
c.zone=C.registry.geometry(parseInt(t.css["--cs-h"])||1440,{inner:s.type!=="poster",presetId:t.presetId,type:s.type}).zone;
c.box={w:c.zone.w,h:420};
B.set(p,c.brand);var R=C.freeze.visual;if(c.opts.frozenOk)c.box=R.get(c.id,p.frozen).anchor||c.box;
if(!c.opts.labelsOnly)R.set(c.id,null);
c.a={slideId:c.id,seed:C.canon.fnv1a64(c.id+"|anchor"),rtl:c.dir!=="ltr",lang:c.lang,digits:c.digits,dialect:c.dialect,tone:c.tone,recipe:c.recipe,size:c.v.anchor?.size,zone:c.zone,tokens:t.tones[c.tone]||t.tones.base,art:t.art,slide:F(JSON.parse(JSON.stringify(s))),brand:c.brand&&{handle:c.brand.handle,name:c.brand.name,art:c.brand.visual?.art},sources:{},data:{pack:V._.block("cs-icon-pack"),objects:V._.block("cs-icon-objects"),marks:V._.block("cs-art-marks")}};
c.a.visual=c.a.slide.visual||c.v;
(p.sources||[]).forEach(x=>c.a.sources[x.id]=x.shortLabel);
};
V.fill=(k,c,i,hi)=>{
if(k==="anchor"){var b=!c.slide.media?.assetId&&c.v.anchor&&build(c);if(!b&&c.v.anchor?.kind==="mock"){c.box.h=c.zone.h;b=build(c)}if(b)c.d=(b.labels||[]).map(l=>l.text);return b?.el}
var n=k==="motif"?c.spec.style?.motif:k==="rowicon"?c.v.rowIcons?.[i]:k==="itemicon"?i:V._.block("cs-emoji-map")?.map?.[String(i).replace(/\ufe0f/g,"")];
return n&&CS.art?.icon?.(n,{ctx:c.a,size:k.endsWith("icon")?"sm":"xs",treatment:"bare",ink:hi?c.a.tokens.onAccent:null});
};
V.slot=(c,n)=>{
var k=n.getAttribute("data-slot");
if(k==="anchor"){var b=!ord(c,n)&&V.fill(k,c);if(b)n.appendChild(b);return !!b}
if(k!=="items")return;
(c.slide.items||[]).forEach((x,i)=>{var li=e("cs-item","li"),y=V.fill("itemicon",c,x.icon||c.v.rowIcons?.[i],x.hi);li.dataset.index=i;if(x.hi)li.dataset.hi=1;if(y){y.dataset.part="icon";li.appendChild(y)}
["title","text","value"].forEach(p=>{if(x[p]==null)return;var z=e("","span");z.dataset.part=p;C.compose.label(z,x[p],c,{slot:p==="title"?"items":"items-"+p,index:i,role:p==="title"?"h2":"body"});if(c.type==="grid"&&p==="value"&&/^\d{1,3}%?$/.test(x[p]))z.dataset.floor=120;if(c.type==="grid"){if(p==="title")z.dataset.floor=44;z.dataset.maxLines=p==="text"?2:1;}li.appendChild(z)});n.appendChild(li)});return !!n.children.length;
};
V.decorate=(r,c)=>{
if(V.free?.active(c.slide)){r.dataset.free="1";r.dataset.tone="base";return;}
var q=s=>r.querySelector(s),m=q(".cs-content");M.set(m,c);
var sl=q(".cs-anchor-slot"),k=kind(c);c.o=[];
if(sl){m.dataset.recipe=c.recipe;r.dataset.anchorKind=c.v.anchor.kind;if(c.anchorMin)sl.style.minHeight=c.anchorMin+"px"}
r.dataset.tone=c.tone;
if(c.tone!=="base")["bg","surface","ink","inkMuted","accent","accent2","onAccent","line"].forEach(k=>r.style.setProperty("--cs-"+({inkMuted:"ink-muted",accent2:"accent-2",onAccent:"on-accent"}[k]||k),c.a.tokens[k]));
var counter=q(".cs-counter");if(counter)counter.style.color=C.color.onColor(c.a.tokens.bg);
if(c.spec.style.thread==="on"&&c.a.art.thread&&c.a.art.thread.style!=="none")r.appendChild(e("cs-thread","i"));
var motif=V.fill("motif",c);if(motif)q(".cs-header").appendChild(motif);
r.querySelectorAll(".cs-emoji").forEach(n=>{var x=V.fill("emoji",c,n.textContent);if(x)n.replaceWith(x)});
var bg=CS.art?.bg?.(c.a);if(bg)q(".cs-bg").appendChild(bg);
if(sl&&c.d)(NUM.test(k)?["number"].concat(c.variant==="numeral"?"ord":[]):OWN[k]||[]).forEach(t=>{var n=q('[data-slot="'+t+'"]');if(n&&take(c,n)){c.o.push({n,p:n.parentNode,x:n.nextSibling});n.remove()}});
else keep(c,r);
var mk=[...new Set((c.v.marks||[]).filter(x=>MARK.test(x)))],em;
if(mk.length)["title","headline","sub","body"].some(t=>em=q('.cs-content [data-slot="'+t+'"] mark.cs-em'))&&(em.dataset.markTarget=mk.join(" "),em.dataset.markId=c.id+"-m0");
var hs=r.dataset.variant==="statement"&&{quote:"body",rehook:"headline"}[c.type],h=hs&&q('[data-slot="'+hs+'"]');
if(h){h.dataset.role="hero";h.dataset.maxLines="4";if(h.style.lineHeight)h.style.lineHeight="calc(var(--cs-lh-display) + 0.15)"}
};
V.chrome=c=>{var v=c.spec.style?.rail||"auto",n=Math.min(12,c.total);return{rail:v!=="off"&&(v!=="auto"||c.swipe==="neutral")?{n,on:Math.floor(c.index*n/c.total),style:v==="on"?"on":"quiet"}:null,motif:null}};
V.anchorSync=(r,o)=>{var m=r.querySelector(".cs-content"),c=M.get(m),n=r.querySelector(".cs-anchor-slot");if(!c||!c.v.anchor||!n)return false;
var f=o.frozen,b=f?c.box:{w:n.clientWidth,h:n.clientHeight},changed=!f&&b.w>0&&b.h>0&&(Math.abs(b.w-c.box.w)>2||Math.abs(b.h-c.box.h)>2);
if(changed){c.box=b;var a=build(c);if(a)n.replaceChildren(a.el);else{back(c,r);n.remove();delete m.dataset.recipe;delete r.dataset.anchorKind}}C.freeze.visual.set(c.id,{anchor:c.box});return changed;
};
V.verify=(p,t,b)=>{B.set(p,b);X={p,t};try{return C.freeze.verify(p,t)}finally{X=null}};
V.expected=(p,key)=>{var m=/^(s\d+)\.art\.(\d+)$/.exec(key),s=m&&p.slides.find(x=>x.id===m[1]);if(!s)return null;
var t=C.resolve.slide(X?.p===p?X.t:C.resolve.post(p,B.get(p)),s),c=C.compose.context(p,s,t,B.get(p),{labelsOnly:true});
V.begin(c);return(c.v.anchor&&build(c,true)?.labels?.find(x=>x.index===+m[2])?.text)??null;
};
})();
