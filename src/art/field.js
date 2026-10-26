/* src/art/field.js - A8a. Anchor "field": word, numeral or two cards on an owner panel. */
(function () {
var art=CS.art,kit=art.kit,h=kit.html,_=art._,M=Math,Z={word:260,numeral:300};
art.register("field",(a,c)=>{
var sub=_.sub(a),s=c.slide||{},sd=s.sides||[],P=sub==="panel",L=[];
if(P&&sd.length!==2)return null;
var cells=P?sd.map(q=>[q.label&&_.lab(L,"chip",q.label),_.lab(L,"title",q.text)]):[sub==="word"?[_.lab(L,"word",a.word)]:[_.lab(L,"numeral",a.value),a.unit&&_.lab(L,"title",a.unit)]];
if(c.labelsOnly)return {el:null,boxes:[],labels:L};
var x=kit.session({ctx:c}),tk=x.tk,R=x.rtl,b=c.box||{w:852,h:620},z=c.zone||{x:114,y:261},bx=b.x||0,by=b.y||0,sd2=x.seed+"|"+(c.slideId||""),box=[],f,g,el;
var st=(n,v)=>n&&n.setAttribute("style",v);
if(P){
var cw=(b.w-24)/2,m=M.round(b.h*.8),y=by+(b.h-m)/2,inner=cw-70;
if(inner<100||m<147)return null;
var glyphs=sd.map((q,i)=>{
var ic=(a.icons||[])[i],need=M.ceil(String(q.text).length*24/inner)*59,room=M.min(inner,m-70-(q.label?72:0)-M.max(77,need)-20),gl;
if(ic){for(var sz of ["lg","md","sm","xs"]){gl=art.icon.full(ic,{ctx:c,size:sz,treatment:a.treatment||"sticker",name:ic});if(gl&&gl.w<=room)return gl;}return false;}
return s.type==="myth-fact"?(room>=88?{el:_.mark(i?"tick":"cross",88,x),w:88}:false):null;});
if(glyphs.includes(false))return null;
el=kit.wrap("field",sd2,cells.map((k,i)=>{
f=i?tk.accent:tk.surface;g=kit.on(f,tk);
var gl=glyphs[i],q=sd[i],id="c"+i,x0=bx+(R?1-i:i)*(cw+24),G=gl?gl.w:0;
var A=y+(q.label?107:35),B=y+m-35-(G&&G+20),n=String(q.text).length*44,t=M.min(B-A,M.ceil(n/(cw-70))*77),K=(w,yy,hh,kind)=>box.push({x:R?x0+cw-35-w:x0+35,y:yy,w,h:hh,kind,ownerOf:id});
st(k[0],"color:"+f+";background-color:"+g+";padding:4px 20px;line-height:44px;border-radius:"+M.min(x.dna.radius.chip,24)+"px;");st(k[1],"color:"+g+";align-self:stretch;margin:auto 0;max-height:"+t+"px;");
box.push({x:x0,y,w:cw,h:m,kind:"owner",id,fill:1,border:3});
if(q.label)K(M.min(cw-70,q.label.length*22+40),y+35,52,"text");
K(M.min(n,cw-70),A+(B-A-t)/2,t,"text");
if(G)K(G,B+20,G,"ink");
return kit.owner(h("div",{dir:R?"rtl":"ltr"},Object.assign(_.card(x,f,3),{flex:"1 1 0",minWidth:0,height:m,display:"flex",flexDirection:"column",justifyContent:"space-between",alignItems:"flex-start",gap:20,padding:32}),[k[0],k[1],gl&&gl.el]));
}),{style:{display:"flex",gap:24,alignItems:"center",width:b.w,height:b.h}});
}else{
var e={l:z.x+bx,r:1080-z.x-bx-b.w,t:z.y+by,b:1440-z.y-by-b.h},E={l:0,r:0,t:0,b:0},k=({both:"lr",start:R?"r":"l",end:R?"l":"r",top:"t",bottom:"b"})[(c.visual||{}).bleed]||"",T=-24;
for(var d of k)E[d]=e[d];
var sm=c.recipe==="over"&&!E.t?M.max(0,24-by):0,W=b.w+E.l+E.r,H=b.h-sm+E.t+E.b;
f=c.tone==="field"?tk.surface:tk.accent;g=kit.on(f,tk);
L.forEach(l=>{var sz=Z[l.role]||72;st(l.el,"color:"+g+";--cs-fit-ratio:"+(sz/(/^(word|numeral)$/.test(l.role)?520:72))+";max-width:80%;");T+=sz+24;});
box.push({x:bx-E.l,y:by+sm-E.t,w:W,h:H,kind:"owner",id:"f",fill:1,border:x.dna.outline},{x:bx+b.w*.1,y:by+sm+(b.h-sm-T)/2,w:b.w*.8,h:T,kind:"text",ownerOf:"f"});
el=kit.wrap("field",sd2,cells[0],{panel:true,style:{position:"relative",width:b.w,height:b.h},panelStyle:Object.assign(_.card(x,f,x.dna.outline),{position:"absolute",left:-E.l,top:sm-E.t,width:W,height:H,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:24,padding:[E.t,E.r,E.b,E.l].join("px ")+"px"})});
if(E.l+E.r+E.t+E.b)el.firstChild.setAttribute("data-bleed","1");
}
return {el,boxes:box,labels:L};
},["word","numeral","panel"]);
})();
