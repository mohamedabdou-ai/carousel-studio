/* src/art/rows.js - A8a. Anchor "rows" (list): a 3-5 row owner card, chip on the first line + art.chipOffset, words, value, tick or cross. art._.lab, card and mark serve field.js too. */
(function () {
var art=CS.art,kit=art.kit,h=kit.html,_=art._,GP=24,LH=59,SH=49;
_.lab=(L,r,t)=>{var l=kit.label(r,L.length,String(t));L.push(l);return l.el;};
_.card=(x,f,w)=>{var d=x.dna,s=d.shadow,i=x.tk.ink;return {boxSizing:"border-box",backgroundColor:f,border:w?w+"px solid "+i:null,borderRadius:d.radius.panel,boxShadow:s.kind==="hard"?(x.rtl?-s.dx:s.dx)+"px "+s.dy+"px 0 "+i:null};};
_.mark=(k,S,x)=>{
var t=x.tk,X=k==="cross",p=X?"M18 18l20 20M38 18l-20 20":"M15 29l9 9 17-20",f=(w,c)=>kit.path(p,{fill:"none",stroke:c,"stroke-width":w,"stroke-linecap":"round"});
return kit.svg(56,56,[kit.path(kit.rrect(3,3,50,50,Math.min(x.dna.radius.tile,12)),{fill:t.surface,stroke:t.ink,"stroke-width":4})].concat(X||k==="tick"?[f(13,t.ink),f(6,X?t.accent:t.support[1])]:[]),{width:S,height:S});
};
art.register("rows",(a,c)=>{
var s=c.slide||{},I=(s.items&&s.items.length?s.items:(s.bullets||a.captions||[]).map(t=>({title:t}))).slice(0,6),N=I.length,L=[],pr=(c.visual||{}).rowIcons||[];
if(N<3||N>5)return null;
var chk=s.type==="checklist"||I.some(r=>r.mark==="tick"||r.mark==="cross"),E=I.map((r,i)=>{var u=r.value==null?"":String(r.value);return {r,i:r.icon||(a.icons||[])[i]||pr[i],t:_.lab(L,"body",r.title),s:r.text&&_.lab(L,"small",r.text),n:u.length,v:u&&_.lab(L,r.hi?"title":"body",u)};});
if(c.labelsOnly)return {el:null,boxes:[],labels:L};
var x=kit.session({ctx:c}),tk=x.tk,d=x.dna,R=x.rtl,b=c.box||{w:852,h:620},W=b.w,bw=Math.max(d.outline,3),H=Math.min(b.h,N*(N<5?200:150)+2*bw),P=(H-2*bw)/N,T=a.treatment||"chip",ox=b.x||0,oy=(b.y||0)+(b.h-H)/2,bx=[],C=CS.core.color;
var F=[tk.accent,tk.support[0],tk.support[1]].filter(q=>C.contrast(q,tk.ink)>=4.5||C.contrast(q,tk.surface)>=4.5),m=q=>art.icon.measure({ctx:c,size:q,treatment:T}).w;
var D=q=>(q-LH)/2-d.chipOffset,ct=q=>Math.max(0,-D(q)),tt=q=>Math.max(0,D(q)),th=e=>LH+(e.s?SH:0),Y=(q,t)=>Math.max(q+ct(q),tt(q)+t),U=Math.max(...E.map(e=>e.r.hi?0:e.n));
var z=(E.some(e=>e.i)?["md","sm","xs"]:[0]).filter(q=>(q!=="md"||N<5&&!E.some(e=>e.n))&&Y(q&&m(q),Math.max(...E.map(th)))<=P-4)[0];
if(z===undefined||P<80)return null;
var cw=z?m(z):0,V=e=>Math.max(U&&U*28+40,e.r.hi&&e.n?e.n*41+40:0),Wi=W-2*bw-64-(chk?56+GP:0)-(cw?cw+GP:0),TW=e=>Wi-(V(e)?V(e)+GP:0);
if(E.some(e=>TW(e)<200))return null;
return {el:kit.wrap("rows",x.seed+"|"+(c.slideId||""),[kit.owner(h("div",{dir:R?"rtl":"ltr"},Object.assign(_.card(x,tk.surface,bw),{width:W,height:H,flex:"none"}),E.map((e,j)=>{
var hi=e.r.hi,fg=hi?kit.on(tk.accent,tk):tk.ink,y=oy+bw+j*P,o=bw+32,k=[],vw=V(e),g=y+(P-Y(cw,th(e)))/2,q=z&&e.i&&art.icon.full(e.i,{ctx:c,size:z,treatment:T,name:e.i,fill:hi?"surface":F[j%F.length]||tk.accent});
var seg=(w,kind,yy,hh)=>{bx.push({x:ox+(R?W-o-w:o),y:yy,w,h:hh,kind,ownerOf:"c"});o+=w+GP;},col=(n,v)=>n&&n.setAttribute("style","color:"+v+";");
col(e.t,fg);col(e.s,hi?fg:tk.inkMuted);col(e.v,fg);
if(cw){seg(cw,"ink",g+ct(cw),cw);q||bx.pop();k.push(h("div",{},{display:"flex",flex:"none",width:cw,marginTop:ct(cw)},q&&q.el));}
seg(TW(e),"text",g+tt(cw),th(e));k.push(h("div",{},{flex:"1 1 0",minWidth:0,marginTop:tt(cw)},[e.t,e.s]));
if(vw)seg(vw,"text",y+(P-LH)/2,LH);
if(chk)seg(56,"ink",y+(P-56)/2,56);
return h("div",{},{display:"flex",alignItems:"center",gap:GP,height:P,padding:"0 32px",boxSizing:"border-box",backgroundColor:hi?tk.accent:null,borderBottom:j<N-1?"2px solid "+tk.line:null,borderRadius:hi?Math.max(0,d.radius.panel-bw)+"px":null},[h("div",{},{display:"flex",alignItems:"flex-start",gap:GP,flex:"1 1 0",minWidth:0},k),vw&&h("div",{},{flex:"none",minWidth:vw,alignSelf:"stretch",display:"flex",alignItems:"center",boxSizing:"border-box",borderInlineStart:"3px solid "+fg,paddingInlineStart:GP},e.v),chk&&_.mark(e.r.mark,56,x)]);
})))],{style:{display:"flex",flexDirection:"column",justifyContent:"center",width:W,height:b.h}}),boxes:[{x:ox,y:oy,w:W,h:H,kind:"owner",id:"c",fill:1,border:bw}].concat(bx),labels:L};
},["list"]);
})();
