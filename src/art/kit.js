/* C1 art kit; public API: tests/unit/js/art/support/API.txt */
(function () {
var art=(CS.art=CS.art || {}),kit=(art.kit=art.kit || {}),NS="http://www.w3.org/2000/svg",cache=new WeakMap();
var SIZES={ xs: 40,sm: 64,md: 96,lg: 160,xl: 240,hero: 320 },FLOOR={ xs: 4,sm: 5,md: 5 };
var MULT={ bare: 1,chip: 1.6,tile: 1.7,ring: 1.8,duo: 1.5,sticker: 1.6,badge: 1.5,giant: 1.75 };
var TAGS=" svg g path circle rect ellipse line polyline polygon defs linearGradient radialGradient stop clipPath use ";
var ATTR=/^(d|fill|stroke|stroke-width|stroke-linecap|stroke-linejoin|stroke-miterlimit|fill-opacity|stroke-opacity|opacity|fill-rule|transform|cx|cy|r|rx|ry|x|y|width|height|x1|y1|x2|y2|points|id|class|viewBox|pathLength|offset|stop-color|gradientUnits|gradientTransform|clip-path|href|aria-hidden|focusable|data-[a-z0-9-]+)$/;
var COLOR=/^(none|#[0-9A-Fa-f]{6}|#[0-9A-Fa-f]{3}|url\(#[A-Za-z0-9_-]+\))$/,BANK=/outline|border-image|background-clip|mask|filter|clip-path|letter-spacing|opacity|text-justify/i,BANV=/conic|inset|color-mix|var\(|justify|italic|oblique/i;
var PLAIN=/^(flex|z-index|line-height|font-weight|order|flex-grow|flex-shrink)$/;

function fail(msg,code) { throw new CS.CSError(code || "E_PAINT_UNSUPPORTED","CS.art.kit: " + msg);}
function n(x) { if (!isFinite(x)) fail("a non-finite number in art geometry");x=Math.round(x * 100) / 100;return String(x === 0 ? 0 : x);}
function put(e,kids) { [].concat(kids == null ? [] : kids).forEach(function (k) { if (k) e.appendChild(typeof k === "string" ? document.createTextNode(k) : k);});return e;}
kit.n=n;kit.fail=fail;kit.SIZES=SIZES;kit.MULT=MULT;

kit.el=function el(tag,attrs,kids) {
if (TAGS.indexOf(" " + tag + " ") < 0) fail("<" + tag + "> is not painter-safe (A1)");
var e=document.createElementNS(NS,tag),k,v;
for (k in attrs) {
v=attrs[k];
if (v == null || v === false) continue;
if (!ATTR.test(k)) fail("attribute " + k + " on <" + tag + ">");
v=typeof v === "number" ? n(v) : String(v);
if ((/^(fill|stroke|stop-color)$/.test(k) && !COLOR.test(v)) || /var\(|color-mix\(/.test(v)) fail(k + '="' + v + '" is not a resolved hex colour (A2)');
e.setAttribute(k,v);
}
return put(e,kids);
};
kit.path=function path(d,a) { return kit.el("path",Object.assign({ d: d },a));};
kit.g=function g(kids,a) { return kit.el("g",a,kids);};
kit.svg=function svg(w,h,kids,attrs) {
var a={ class: "cs-art-svg",viewBox: "0 0 " + n(w) + " " + n(h),width: w,height: h,"aria-hidden": "true",focusable: "false" },k,d=attrs && attrs.defs;
for (k in attrs) if (k !== "defs") a[k]=attrs[k];
return kit.el("svg",a,d && d.length ? [kit.el("defs",null,d)].concat(kids || []) : kids);
};
kit.html=function html(tag,attrs,style,kids) {
if (!/^(div|span|i|b)$/.test(tag)) fail("<" + tag + "> is not allowed in art markup");
var e=document.createElement(tag),k,v,p,s="";
for (k in attrs) {
if (!/^(class|id|dir|lang|aria-hidden|data-[a-z0-9-]+)$/.test(k)) fail("attribute " + k + " on <" + tag + ">");
if (attrs[k] != null && attrs[k] !== false) e.setAttribute(k,String(attrs[k]));
}
for (k in style) {
if (style[k] == null) continue;
p=k.replace(/[A-Z]/g,function (m) { return "-" + m.toLowerCase();});
v=typeof style[k] === "number" && !PLAIN.test(p) ? n(style[k]) + "px" : String(style[k]);
if (BANK.test(p) || BANV.test(v)) fail("style " + p + ":" + v + " is not allowed (A6)");
s += p + ":" + v + ";";
}
if (s) e.setAttribute("style",s);
return put(e,kids);
};
kit.label=function label(role,index,text,attrs) {
if (!/^(small|body|title|numeral|word|chip|chart|tool)$/.test(role) || !Number.isInteger(index) || index < 0) fail("invalid label role or index","E_ART_LABEL");
return { el: kit.html("span",Object.assign({},attrs,{ class: "cs-art-label","data-slot": "art","data-index": index,"data-role": role,"data-floor": kit.labelFloor(role,text),"data-m": "decor-item","data-m-i": index })),text: text,role: role,index: index };
};
kit.labelFloor=function labelFloor(role,text,floors) {
var f=floors || {},arabic=/[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff\ufb50-\ufdff\ufe70-\ufeff]/.test(String(text));
var base=arabic ? f.arabic || 36 : f.latin || 34;
return role === "numeral" ? f.numeral || 200 : role === "word" ? f.word || 220 : role === "chart" ? Math.max(base,f.chart || 38) : role === "tool" && !arabic ? f.tool || 30 : base;
};
kit.wrap=function wrap(kind,seed,kids,o) {
o=o || {};
return kit.html("div",{ class: "cs-art","data-art": kind,"data-anchor-kind": kind,"data-m": "media","data-seed": kit.hash(seed).slice(0,8) },o.style,o.panel ? kit.owner(kit.html("div",{ class: "cs-art-panel" },o.panelStyle,kids)) : kids);
};
kit.owner=function owner(el) { el.setAttribute("data-owner","1");return el;};
kit.uid=function uid(slideId,ns) {
var i=0,p="v" + String(slideId == null ? "x" : slideId).replace(/[^A-Za-z0-9_-]/g,"") + (ns ? "-" + ns : "") + "-";
return function () { return p + ++i;};
};
kit.flip=function flip(rtl,W) { return function (x,w) { return rtl ? W - x - (w || 0) : x;};};

kit.hash=function hash(s) { return CS.core.canon.fnv1a64(String(s));};
kit.rng=function rng(seed) {
var h=kit.hash(seed),a=(parseInt(h.slice(0,8),16) ^ Math.imul(parseInt(h.slice(8,16),16),0x9E3779B1)) | 0;
function r() { a=(a + 0x6D2B79F5) | 0;var t=Math.imul(a ^ (a >>> 15),1 | a);t=(t + Math.imul(t ^ (t >>> 7),61 | t)) ^ t;return ((t ^ (t >>> 14)) >>> 0) / 4294967296;}
r.range=function (lo,hi) { return lo + (hi - lo) * r();};
r.int=function (m) { return Math.floor(r() * m);};
r.pick=function (l) { return l[Math.floor(r() * l.length)];};
r.sign=function () { return r() < 0.5 ? -1 : 1;};
return r;
};

kit.disc=function disc(cx,cy,r) { return "M" + n(cx - r) + " " + n(cy) + "a" + n(r) + " " + n(r) + " 0 1 0 " + n(2 * r) + " 0a" + n(r) + " " + n(r) + " 0 1 0 " + n(-2 * r) + " 0z";};
function arc(r,x,y) { return r ? "A" + n(r) + " " + n(r) + " 0 0 1 " + n(x) + " " + n(y) : "";}
kit.rrect=function rrect(x,y,w,h,r) {
var m=Math.min(w,h) / 2,q=(Array.isArray(r) ? r : [r,r,r,r]).map(function (v) { return Math.max(0,Math.min(+v || 0,m));});
return "M" + n(x + q[0]) + " " + n(y) + "H" + n(x + w - q[1]) + arc(q[1],x + w,y + q[1]) + "V" + n(y + h - q[2]) + arc(q[2],x + w - q[2],y + h) + "H" + n(x + q[3]) + arc(q[3],x,y + h - q[3]) + "V" + n(y + q[0]) + arc(q[0],x + q[0],y) + "Z";
};
kit.arch=function archShape(x,y,w,h,top,rb) {
var t=Math.min(w * Math.min(top == null ? 0.5 : top,0.5),h);
rb=Math.min(rb || 0,w / 2,h - t);
return "M" + n(x) + " " + n(y + t) + arc(t,x + t,y) + "H" + n(x + w - t) + arc(t,x + w,y + t) + "V" + n(y + h - rb) + arc(rb,x + w - rb,y + h) + "H" + n(x + rb) + arc(rb,x,y + h - rb) + "Z";
};
kit.curve=function curve(p,closed) {
var N=p.length,d="M" + n(p[0][0]) + " " + n(p[0][1]),i,a,b,c,e;
for (i=0;i < (closed ? N : N - 1);i++) {
a=p[closed ? (i + N - 1) % N : Math.max(i - 1,0)];b=p[i];c=p[(i + 1) % N];e=p[closed ? (i + 2) % N : Math.min(i + 2,N - 1)];
d += "C" + n(b[0] + (c[0] - a[0]) / 6) + " " + n(b[1] + (c[1] - a[1]) / 6) + " " + n(c[0] - (e[0] - b[0]) / 6) + " " + n(c[1] - (e[1] - b[1]) / 6) + " " + n(c[0]) + " " + n(c[1]);
}
return d + (closed ? "Z" : "");
};
kit.poly=function poly(p,closed) { return "M" + p.map(function (q) { return n(q[0]) + " " + n(q[1]);}).join("L") + (closed ? "Z" : "");};
kit.wobble=function wobble(p,amp,seed) { var r=kit.rng(seed);return p.map(function (q) { return [q[0] + (r() - 0.5) * 2 * amp,q[1] + (r() - 0.5) * 2 * amp];});};
function ring(cx,cy,rx,ry,k,rot,f) { var out=[],i,a,m;for (i=0;i < k;i++) { a=rot + 2 * Math.PI * i / k;m=f ? f(i) : 1;out.push([cx + Math.cos(a) * rx * m,cy + Math.sin(a) * ry * m]);} return out;}
kit.hand=function hand(cx,cy,rx,ry,amp,seed,k) { var q=kit.rng(seed),ph=q() * 6.2832;return kit.curve(ring(cx,cy,rx,ry,k || 10,ph,function () { return 1 + (q() - 0.5) * 2 * amp;}),true);};
kit.blob=function blob(cx,cy,r,seed,amp,k) { return kit.hand(cx,cy,r,r,amp == null ? 0.12 : amp,seed,k || 7);};
kit.star=function star(cx,cy,R,r,k,rot) { return kit.poly(ring(cx,cy,R,R,(k || 8) * 2,rot == null ? -Math.PI / 2 : rot,function (i) { return i % 2 ? r / R : 1;}),true);};
kit.scallop=function scallop(cx,cy,r,k,depth,amp,seed) {
var q=amp ? kit.rng(seed) : null;
return kit.curve(ring(cx,cy,r,r,(k || 10) * 2,-Math.PI / 2,function (i) { var m=i % 2 ? 1 - (depth == null ? 0.08 : depth) : 1;return q ? m * (1 + (q() - 0.5) * 2 * amp) : m;}),true);
};
kit.ribbon=function ribbon(x,y,w,h,notch) { var t=notch == null ? h * 0.3 : notch;return kit.poly([[x,y],[x + w,y],[x + w - t,y + h / 2],[x + w,y + h],[x,y + h],[x + t,y + h / 2]],true);};

function gOf(s) { return typeof s === "number" ? s : SIZES[s] || SIZES.md;}
function tokOf(s) { if (SIZES[s]) return s;var g=gOf(s);return g <= 48 ? "xs" : g <= 80 ? "sm" : g <= 120 ? "md" : "lg";}
kit.gOf=gOf;kit.tokenOf=tokOf;
kit.ladder=function ladder(size,units) { return Math.max(units * gOf(size) / 24,FLOOR[tokOf(size)] || 0);};
kit.units=function units(size,u) { return kit.ladder(size,u) * 24 / gOf(size);};

function C() { return CS.core.color;}
function hx(v,d) { try { return C().toHex(C().parse(v));} catch (e) { return d;} }
kit.tint=function tint(a,b,t) { return C().mix(a,b,t);};
kit.palette=function palette(t) {
if (t && cache.has(t)) return cache.get(t);
var c=C(),s=t || {},bg=hx(s.bg,"#F4F4F2"),su=hx(s.surface,"#FFFFFF"),ink=hx(s.ink,"#111111"),ac=hx(s.accent,"#E3262B"),sp=s.support || [],tt=0.62;
var o={ bg: bg,surface: su,ink: ink,accent: ac,inkMuted: hx(s.inkMuted,c.mix(ink,bg,0.4)),accent2: hx(s.accent2,ac),onAccent: hx(s.onAccent,c.onColor(ac)),line: hx(s.line,c.mix(bg,ink,0.14)),note: hx(s.note,"#FFE88A"),paper: su };
o.support=[hx(sp[0],c.mix(ac,ink,0.35)),hx(sp[1],c.mix(ac,su,0.45))];
o.tint=c.luminance(su) < 0.2 ? su : c.mix(ac,su,tt);
while (tt < 0.98 && c.contrast(ink,o.tint) < 4.5) o.tint=c.mix(ac,su,(tt += 0.04));
if (t) cache.set(t,o);
return o;
};
kit.role=function role(tk,name,d) {
if (!name) return d;
return name.charAt(0) === "#" ? hx(name,d) : { support1: tk.support[0],support2: tk.support[1] }[name] || tk[name] || d;
};
kit.on=function on(fill,tk) {
var c=C(),w=fill === tk.accent ? [tk.onAccent,tk.ink,tk.bg] : fill === tk.ink ? [tk.bg,tk.surface,tk.onAccent] : [tk.ink,tk.onAccent,tk.bg],i;
for (i=0;i < w.length;i++) if (c.contrast(w[i],fill) >= 4.5) return w[i];
return c.contrast("#111111",fill) >= c.contrast("#FFFFFF",fill) ? "#111111" : "#FFFFFF";
};
kit.base=function base(tk,ground,outlined) {
var c=C(),l=[tk.accent,tk.support[0],tk.support[1]],i;
if (outlined && c.contrast(tk.accent,tk.ink) >= 1.8) return tk.accent;
for (i=0;i < l.length;i++) if (c.contrast(l[i],ground) >= 1.8 && c.contrast(l[i],tk.ink) >= 1.8) return l[i];
for (i=0;i < 6;i++) { l=c.mix(tk.ink,ground,[0.6,0.5,0.7,0.4,0.8,0.3][i]);if (c.contrast(l,ground) >= 1.8 && c.contrast(l,tk.ink) >= 1.8) return l;}
return tk.accent;
};

kit.dna=function dna(a) {
if (a && cache.has(a)) return cache.get(a);
var s=a || {},r=s.radius || {},sh=s.shadow || {},v=function (x,d) { return typeof x === "number" && isFinite(x) ? x : d;},R=function (k,d) { return v(r[k],d);},hard=sh.kind === "hard";
var o={
stroke: v(s.stroke,2),cap: /^(butt|round|square)$/.test(s.cap) ? s.cap : "round",join: /^(miter|round|bevel)$/.test(s.join) ? s.join : "round",container: s.container || "square",
radius: { chip: R("chip",0),tile: R("tile",0),card: R("card",0),panel: R("panel",R("card",0)),window: R("window",R("card",0)) },
shadow: hard || sh.kind === "soft" ? { kind: sh.kind,dx: v(sh.dx,hard ? 6 : 0),dy: v(sh.dy,hard ? 6 : 12),blur: hard ? 0 : v(sh.blur,24) } : { kind: "none",dx: 0,dy: 0,blur: 0 },
outline: v(s.outline,0),wobble: v(s.wobble,0),tilt: v(s.tilt,0),mark: s.mark || "fill",chipOffset: v(s.chipOffset,0),badge: s.badge || null,fills: s.fills || null
};
if (a) cache.set(a,o);
return o;
};
kit.session=function session(o) {
var x=(o && o.ctx) || {};
return { tk: kit.palette((o && o.tokens) || x.tokens),dna: kit.dna((o && o.art) || x.art),rtl: o && o.rtl != null ? !!o.rtl : x.rtl !== false,seed: (o && o.seed) || x.seed || x.slideId || "art",slideId: x.slideId };
};

function bump(b,e) { return { x: b.x - e,y: b.y - e,w: b.w + 2 * e,h: b.h + 2 * e };}
kit.shape=function shape(kind,b,dna,seed) {
var c=dna.container,R=dna.radius,S=Math.min(b.w,b.h),cx=b.x + b.w / 2,cy=b.y + b.h / 2,q=kit.rng(seed + kind),amp=0.03 + dna.wobble * 0.05,small=kind === "chip" || kind === "tile" || kind === "plate";
var rad=kind === "chip" ? R.chip : kind === "tile" ? R.tile : kind === "panel" ? R.panel : kind === "window" ? R.window : R.card,bd;
if (kind === "badge") {
bd=dna.badge || (c === "square" || c === "arch" ? "star" : c === "stamp" ? "stamp" : "scallop");
return { d: bd === "star" ? kit.star(cx,cy,S / 2,S * 0.4,8,-Math.PI / 8) : bd === "stamp" ? kit.scallop(cx,cy,S / 2,24,0.04) : c === "app-tile" ? kit.scallop(cx,cy,S / 2,12,0.05) : kit.scallop(cx,cy,S / 2,10,0.08,amp > 0.04 ? amp : 0,seed),x: bd === "stamp" ? [kit.disc(cx,cy,S * 0.39)] : [] };
}
if (c === "hand-circle") {
if (kind === "chip") return { d: kit.hand(cx,cy,S / 2,S / 2,amp,seed),x: [kit.hand(cx,cy,S / 2 - 2,S / 2 - 2,amp,seed + "r")] };
return { d: kit.rrect(b.x,b.y,b.w,b.h,[0,0,0,0].map(function () { return rad * (0.4 + q() * 1.2);})),x: [] };
}
if (c === "arch" && small) return { d: kit.arch(b.x,b.y,b.w,b.h,0.5,rad || 12),x: [] };
return { d: kit.rrect(b.x,b.y,b.w,b.h,rad),x: c === "stamp" && small ? [kit.rrect(b.x + S * 0.07,b.y + S * 0.07,b.w - S * 0.14,b.h - S * 0.14,Math.max(0,rad - 2))] : [] };
};
kit.plate=function plate(kind,b,o) {
var dna=o.dna,tk=o.tk,ink=o.ink || tk.ink,sh=kit.shape(kind,b,dna,o.seed),out=[],P=o.paper || 0,ow=o.outline || 0,s=o.sh || dna.shadow,S=Math.min(b.w,b.h),i;
var at={ x: b.x + (o.rtl ? -1 : 1) * s.dx,y: b.y + s.dy,w: b.w,h: b.h };
if (o.lift === "hard") out.push(kit.path(kit.shape(kind,bump(at,P),dna,o.seed).d,{ fill: ink }));
else if (o.lift === "soft") for (i=0;i < 6;i++) out.push(kit.path(kit.shape(kind,bump(at,i / 5 * s.blur / 2 + P),dna,o.seed).d,{ fill: "#000000","fill-opacity": 0.035 }));
if (P) out.push(kit.path(kit.shape(kind,bump(b,P),dna,o.seed).d,{ fill: tk.paper }));
out.push(kit.path(sh.d,{ fill: o.fill,stroke: ow ? ink : null,"stroke-width": ow || null,"stroke-linejoin": ow ? "round" : null }));
sh.x.forEach(function (d) { out.push(kit.path(d,{ fill: "none",stroke: ow ? ink : o.glyph || ink,"stroke-width": ow ? ow / 2 : Math.max(1.5,S * 0.016),"stroke-linejoin": "round" }));});
return out;
};

function liftOf(tr,o,dna) {
return o.lift === false ? "none" : o.lift === true ? (dna.shadow.kind === "none" ? "hard" : dna.shadow.kind) : o.lift || (tr === "sticker" || tr === "tile" || tr === "giant" || tr === "die" ? dna.shadow.kind : "none");
}
kit.measure=function measure(tr,g,o) {
var dna=o.dna,S=g * (MULT[tr] || 1),ow=tr === "ring" ? 6 : tr === "bare" || tr === "duo" ? 0 : o.outline != null ? o.outline : dna.outline,die=tr === "sticker" || tr === "die",P=die ? (o.paper != null ? o.paper : 8) : 0;
var L=liftOf(tr,o,dna),z=Math.min(1,Math.max(0.5,g / 160)),s={ dx: dna.shadow.dx * z,dy: dna.shadow.dy * z,blur: dna.shadow.blur * z };
var ext=L === "hard" ? Math.max(Math.abs(s.dx),Math.abs(s.dy)) : L === "soft" ? Math.abs(s.dy) + s.blur / 2 : 0;
var tilt=o.tilt != null ? o.tilt : die ? kit.rng(o.seed + "tilt").sign() * Math.min(8,dna.tilt) : 0,t=Math.abs(tilt) * Math.PI / 180;
var pad=Math.ceil(ow / 2 + P + ext + (tr === "duo" ? 0.08 * g : 0) + (tilt ? S / 2 * (Math.sin(t) + Math.cos(t) - 1) : 0) + (dna.container === "hand-circle" && tr !== "bare" && tr !== "ring" ? S / 2 * (0.03 + dna.wobble * 0.05) * 1.7 : 0));
return { S: S,g: g,outline: ow,paper: P,lift: L,tilt: tilt,pad: pad,w: S + 2 * pad,sh: s };
};
var FILL={ chip: "tint",tile: "accent",sticker: "tint",duo: "tint",badge: "accent",giant: "tint" };
kit.frame=function frame(tr,g,o,draw) {
var m=kit.measure(tr,g,o),dna=o.dna,tk=o.tk,W=m.w,c=W / 2,off=tr === "duo" ? 0.08 * g : 0,ink=o.ink || tk.ink,nodes=[],fill=null,fr,glyph;
var kind=tr === "tile" ? "tile" : tr === "giant" ? "plate" : tr === "badge" ? "badge" : "chip",box={ x: c - m.S / 2 + (o.rtl ? -off : off),y: c - m.S / 2 + off,w: m.S,h: m.S };
if (tr !== "bare" && tr !== "ring") {
fr=o.fill || (dna.fills && dna.fills[tr]) || ((tr === "chip" || tr === "sticker" || tr === "giant") && dna.mark === "outline" && dna.container === "disc" ? "accent" : tr === "tile" && dna.container === "square" ? "ink" : FILL[tr]);
fill=kit.role(tk,fr,tk.tint);
}
glyph=o.glyph || (fill && tr !== "duo" && tr !== "giant" ? kit.on(fill,tk) : ink);
if (tr === "ring") nodes.push(kit.path(kit.disc(c,c,m.S / 2 - 3),{ fill: "none",stroke: ink,"stroke-width": 6 }));
else if (tr !== "bare") nodes=kit.plate(kind,box,{ dna: dna,tk: tk,seed: o.seed,rtl: o.rtl,fill: fill,ink: ink,glyph: glyph,outline: m.outline,paper: m.paper,lift: m.lift,sh: m.sh });
nodes=nodes.concat(draw(c,c,g,glyph,{ fill: fill,ground: o.ground || fill || tk.bg,tint: tr === "duo" || tr === "giant" ? kit.role(tk,o.tintFill,fill === tk.accent ? tk.surface : tk.accent) : null }));
if (m.tilt) nodes=[kit.g(nodes,{ transform: "rotate(" + n(m.tilt) + " " + n(c) + " " + n(c) + ")" })];
return { el: kit.svg(W,W,nodes,Object.assign({ class: "cs-icon" },o.attrs)),w: W,S: m.S,pad: m.pad,g: g,fill: fill,glyph: glyph };
};
})();
