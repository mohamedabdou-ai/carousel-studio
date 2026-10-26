/* A9: settle text-bound marks after layout, merging wrapped targets by data-mark-id.
 * Frozen marks replay without measuring. Free placement helpers live in free.js. */
(function(){
var Z=Math,D=Z.PI/180;
function rects(els,sl,bb){   // {a: degrees,x,y,w,h}: one target, a rotated ancestor undone
var m=new DOMMatrix,ws=[],U={x:1e9,y:1e9,w:-1e9,h:-1e9},n,s,a,c,d;
for(n=els[0];n&&n!==sl;n=n.parentElement){s=getComputedStyle(n);if(s.transform!=="none"&&s.display!=="inline")m=new DOMMatrix(s.transform).multiply(m)}
a=Z.atan2(m.b,m.a);c=Z.cos(a);s=Z.sin(a);d=c*c-s*s;
els.forEach(function(e){var w=e.querySelectorAll(".w");ws.push.apply(ws,w.length?w:[e])});
ws.forEach(function(e){
var r=bb(e),x=r.x+r.w/2,y=r.y+r.h/2,u=x*c+y*s,v=y*c-x*s,W=r.w,H=r.h;
if(d>.5){W=(r.w*Z.abs(c)-r.h*Z.abs(s))/d;H=(r.h*Z.abs(c)-r.w*Z.abs(s))/d}
if(W>0&&H>0)U={x:Z.min(U.x,u-W/2),y:Z.min(U.y,v-H/2),w:Z.max(U.w,u+W/2),h:Z.max(U.h,v+H/2)}});
U.w-=U.x;U.h-=U.y;U.a=a/D;return U}
function edge(c,r,t){   // where the ray from c to t leaves r, +16 px
var x=t[0]-c[0],y=t[1]-c[1],k=Z.min(x?r.w/2/Z.abs(x):1e9,y?r.h/2/Z.abs(y):1e9),l=Z.hypot(x,y)||1;
return[c[0]+x*k+x/l*16,c[1]+y*k+y/l*16]}
function same(a,e){
var i=e.getAttribute("data-mark-id"),j=a.getAttribute("data-mark-id");return !!i&&i===j}
function plan(sl,cx,id,A,art,W){
var ctx={slideId:id,art:art,data:cx&&cx.data,rtl:sl.getAttribute("dir")!=="ltr"},L=A.lib(ctx),gs=[],out=[],o=sl.getBoundingClientRect(),k=o.width/W||1,an=sl.querySelector(".cs-art");
function bb(e){var r=e.getBoundingClientRect();return{x:(r.left-o.left)/k,y:(r.top-o.top)/k,w:r.width/k,h:r.height/k}}
if(L)sl.querySelectorAll("[data-mark-target]").forEach(function(e){
var v=e.getAttribute("data-mark-target"),g=gs.filter(function(q){return q.v===v&&same(q.e[q.e.length-1],e)})[0];
if(g)g.e.push(e);else gs.push({v:v,e:[e]})});
gs.forEach(function(g,gi){
var U=rects(g.e,sl,bb),c=Z.cos(U.a*D),s=Z.sin(U.a*D);
g.v.split(/[\s,]+/).forEach(function(tk,ti){
var free=sl.dataset.free==="1";if(free&&tk==="scribble")tk="strike-scribble";
var seed=id+"|m"+gi+"."+ti,fam=tk.split("-")[0],m=A.pick(L,tk,seed,art),f=m&&A.allow(art,m),u=fam==="underline",r,p,q,a,b,x,y,h,e=Z.min(U.w*.1,24)+8;
var o={form:f,rtl:ctx.rtl,seed:seed,deck:cx&&cx.spec&&cx.spec.id,rot:U.a,color:u?"ink":"accent"};
if(!f||!(U.w>0)||!/^(circle|underline|strike|arrow)$/.test(fam)&&!(free&&/^(sparkle|tick)$/.test(fam)))return;
if(free&&/^(sparkle|tick|arrow)$/.test(fam))r=CS.visual.free.markExtra(A,m,U,ctx,o,tk);
else if(fam==="circle")r=A.place(m,{x:U.x-e,y:U.y-U.h*.12-8,w:U.w+2*e,h:U.h*1.24+16},ctx,o);
else if(fam!=="arrow"){h=Z.max(m.id==="underline-double"?30:18,U.h*.26);r=A.place(m,{x:U.x+(u?U.w*.04:-6),y:U.y+U.h*(u?.84:.44)-h/2,w:u?U.w*.92:U.w+12,h:m.id==="strike-scribble"?U.h*.7:h},ctx,o)}
else if(an){
p=[(U.x+U.w/2)*c-(U.y+U.h/2)*s,(U.x+U.w/2)*s+(U.y+U.h/2)*c];b=bb(an);q=[b.x+b.w/2,b.y+b.h/2];
a=edge(p,U,q);b=edge(q,b,p);x=Z.abs(b[0]-a[0]);y=Z.abs(b[1]-a[1]);
if(Z.hypot(x,y)>60)r=A.place(A.pick(L,x<y*.3?"arrow-down":y<x*.3?"arrow-hook":tk,seed,art)||m,{from:a,to:b},ctx,Object.assign(o,{rot:0,bow:b[0]<a[0]}))}
if(r){if(free)CS.visual.free.markColor(r,g.e[0],cx,u);out.push(r)}})});
return out}
function settle(sl,cx){
var A=CS.art&&CS.art.marks,C=CS.core,F=C&&C.freeze&&C.freeze.visual,id=sl.getAttribute("data-cs-slide")||cx&&cx.id||"",ms=F&&F.get(id).marks,z=cx&&cx.zone,T=cx&&cx.tokens||{},old=sl.querySelector(":scope>svg.cs-marks"),d=0,r,W,H;
if(old)old.remove();
if(!A||!sl.isConnected)return{marks:[],dropped:0};
r=C.constants.CANVAS;W=parseFloat(sl.style.width)||r.w;H=parseFloat(sl.style.height)||r.h;
if(!ms){r=A.limit(plan(sl,cx,id,A,cx&&(cx.art||T.art)||{},W),z?z.w*z.h:852*998);ms=r.kept;d=r.dropped;if(F&&(ms.length||d))F.set(id,{marks:ms})}
if(ms.length)sl.appendChild(A.layer(ms,T.tones&&T.tones[sl.getAttribute("data-tone")||cx&&cx.tone||"base"]||T.roles||T,W,H));
return{marks:ms,dropped:d}}
settle.rects=rects;
CS.visual._.register("settle",settle)})();
