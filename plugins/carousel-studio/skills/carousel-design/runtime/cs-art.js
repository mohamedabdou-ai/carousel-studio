/*! Carousel Studio runtime chunk cs-art.js · cs-1.1.0 · Apache-2.0 */
(function () {
  "use strict";
  var CS = (window.CS = window.CS || {});
  /* ---- file: root.js ---- */
/* C1: strict (kind, sub) registry. */
(function () {
var a = CS.art = CS.art || {}, t = Object.create(null);
a.kit = a.kit || {}; a._ = a._ || {};
a._.sub = function (v) {
var k = v.kind;
return k === "icon" ? k : k === "scene" ? v.template || "solo" : k === "chart" || k === "mock" ? (v[k] || {}).kind : k === "pattern" ? v.pattern : k === "numeral" ? v.companion || "none" : k === "word" ? v.wordStyle || "solid" : k === "rows" ? "list" : k === "field" ? v.value ? "numeral" : v.word ? "word" : v.icon || v.object ? "icon" : "panel" : undefined;
};
function fail(code) { var e = new Error(code); e.code = code; throw e; }
a.register = function (k, f, s) {
var seen = Object.create(null), r = /^[a-z][a-z0-9-]*$/;
if (typeof k !== "string" || !r.test(k) || typeof f !== "function" || !Array.isArray(s) || !s.length || Array.from(s).some(function (v) { return typeof v !== "string" || !r.test(v); })) fail("E_ART_REGISTER");
s.forEach(function (v) { if (seen[v] || t[k] && t[k][v]) fail("E_ART_DUPLICATE"); seen[v] = 1; });
t[k] = t[k] || Object.create(null); s.forEach(function (v) { t[k][v] = f; }); return f;
};
a.has = function (k, s) { return !!(t[k] && (s === undefined || t[k][s])); };
a.kinds = function () { return Object.keys(t).sort(); };
a.caps = function () { var c = {}; a.kinds().forEach(function (k) { c[k] = Object.keys(t[k]).sort(); }); return { v: 1, art: c }; };
a.build = function (v, c) { var s = v && a._.sub(v), f = v && s !== undefined && t[v.kind] && t[v.kind][s]; return f ? f(v, c) || null : null; };
})();

  /* ---- file: kit.js ---- */
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

  /* ---- file: icon.js ---- */
/* src/art/icon.js - owned by A1b. CS.art.icon(name, o) -> <svg class="cs-icon"> | null (spec 3.1); o: see support/API.txt, plus retrace. icon.full -> { el, w, S, pad, g, fill, glyph };
 * icon.measure(o) sizes one. Also art._.retrace / retraceG, which object.js shares (S-2). */
(function () {
  var art = CS.art, kit = art.kit, n = kit.n;
  function xf(cx, cy, g, flip) { var k = g / 24; return "translate(" + n(flip ? cx + g / 2 : cx - g / 2) + " " + n(cy - g / 2) + ") scale(" + n(flip ? -k : k) + " " + n(k) + ")"; }

  /* S-2 retrace: art.retrace (true | { dx, dy, rot, tint }; o.retrace overrides, false = off): a second stroke pass under the drawing, offset dx dy (24-unit space), turned rot degrees,
   * in a solid tint. The drawing shrinks by f (about 1%) so the pass stays inside the box: S, pad and the svg do not change. */
  function lim(v, lo, hi, d) { return typeof v === "number" && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; }
  art._.retrace = function (o, tk, sw) {   // sw: the stroke in 24-unit space
    var r = o.retrace != null ? o.retrace : (o.art || (o.ctx || {}).art || {}).retrace, dx, dy, rot;
    if (!r) return null;
    if (r === true) r = {};
    dx = lim(r.dx, -2, 2, 0.5); dy = lim(r.dy, -2, 2, 0.4); rot = lim(r.rot, -5, 5, 0.8);
    return { dx: dx, dy: dy, rot: rot, tint: typeof r.tint === "string" ? kit.role(tk, r.tint, null) : null, f: Math.min(1, (12 - Math.hypot(dx, dy) - 0.3 * Math.abs(rot) + 0.1 * sw) / 11.5) };
  };
  art._.retraceG = function (rt, ds, sc, sw, tint) {   // sc: grid units per 24 (icon 1, object 2); sw: the main stroke in grid units
    var m = 12 * sc;
    return kit.g(ds.map(function (d) { return kit.path(d, { fill: "none", stroke: tint, "stroke-width": sw * 0.85, "stroke-linecap": "round", "stroke-linejoin": "round" }); }), { "data-part": "retrace", transform: "translate(" + n(rt.dx * sc) + " " + n(rt.dy * sc) + ") rotate(" + n(rt.rot) + " " + m + " " + m + ")" });
  };

  /* a glyph in 24-unit space: tinted closed subpaths (f) first, the retrace, then every stroke; dots (s) grow to the stroke's diameter (they are r = 1) */
  function glyph(rec, a) {
    var kids = [], s = rec.s || [];
    if (a.tint) (rec.f || []).forEach(function (i) { kids.push(kit.path(rec.d[i], { fill: a.tint })); });
    if (a.rt) kids.push(art._.retraceG(a.rt, rec.d.filter(function (d, i) { return s.indexOf(i) < 0; }), 1, a.sw, a.rt.tint || kit.tint(a.ink, a.ground, 0.5)));
    rec.d.forEach(function (d, i) {
      if (s.indexOf(i) >= 0) kids.push(kit.path(d, { fill: a.ink, stroke: a.sw > 2 ? a.ink : null, "stroke-width": a.sw > 2 ? a.sw - 2 : null, "stroke-linejoin": "round" }));
      else kids.push(kit.path(d, { fill: "none", stroke: a.ink, "stroke-width": a.sw, "stroke-linecap": a.cap, "stroke-linejoin": a.join, "stroke-miterlimit": a.join === "miter" ? 2.4 : null, pathLength: a.drawOn ? 1 : null, "data-m": a.drawOn ? "stroke" : null, "data-m-i": a.drawOn ? i : null }));
    });
    return kit.g(kids, { transform: xf(a.cx, a.cy, a.g, a.mirror) });
  }

  /* slash: a knock-out stroke under an ink stroke; cross plus check question: a corner badge (10.4 units); sparkle: a star at the top corner. Never mirrored. */
  function modifier(m, a) {
    var sw = a.sw, bx = a.rtl ? 5.4 : 18.6, by = 18.6, sym;
    if (m === "slash") return [kit.path("M3.5 3.5L20.5 20.5", { fill: "none", stroke: a.ground, "stroke-width": sw * 2.6, "stroke-linecap": "round" }), kit.path("M3.5 3.5L20.5 20.5", { fill: "none", stroke: a.ink, "stroke-width": sw, "stroke-linecap": "round" })];
    if (m === "sparkle") return [kit.path(kit.star(a.rtl ? 6 : 18, 6, 5, 1.3, 4), { fill: a.badge, stroke: a.ground, "stroke-width": 1.4, "stroke-linejoin": "round" })];
    sym = { check: "M" + (bx - 2.6) + " " + by + "l1.9 1.9 3.3-3.7", cross: "M" + (bx - 2.2) + " " + (by - 2.2) + "l4.4 4.4M" + (bx + 2.2) + " " + (by - 2.2) + "l-4.4 4.4", plus: "M" + bx + " " + (by - 2.6) + "v5.2M" + (bx - 2.6) + " " + by + "h5.2", question: "M" + (bx - 1.7) + " " + (by - 1.3) + "a1.7 1.7 0 1 1 2.5 1.5c-.7.4-.8.8-.8 1.4" }[m];
    if (!sym) return [];
    return [kit.path(kit.disc(bx, by, 5.2), { fill: a.ground }), kit.path(kit.disc(bx, by, 4.2), { fill: a.badge }), kit.path(sym, { fill: "none", stroke: a.onBadge, "stroke-width": Math.max(1.6, sw * 0.8), "stroke-linecap": "round", "stroke-linejoin": "round" })].concat(m === "question" ? kit.path(kit.disc(bx, by + 2.5, 0.8), { fill: a.onBadge }) : []);
  }

  function resolve(o) {
    var x = kit.session(o), size = o.size == null ? "md" : o.size, tr = o.treatment || "bare";
    if (!kit.MULT[tr]) kit.fail('unknown treatment "' + tr + '"', "E_USAGE");
    return { x: x, size: size, tr: tr, g: kit.gOf(size), sw: kit.units(size, o.stroke != null ? o.stroke : x.dna.stroke), fo: Object.assign({}, o, { dna: x.dna, tk: x.tk, rtl: x.rtl, seed: x.seed + "|" + (o.name || ""), ink: o.ink && kit.role(x.tk, o.ink) }) };
  }

  function make(name, o) {
    o = o || {};
    var p = o.pack || (CS.visual && CS.visual._ && CS.visual._.block("cs-icon-pack")), rec = p && p.icons && p.icons[name], r, m, sw, tk, rt;
    if (!rec) return null;
    r = resolve(Object.assign({ name: name }, o)); m = o.modifier || o.badge; tk = r.x.tk; sw = r.sw; rt = art._.retrace(o, tk, sw);
    r.fo.attrs = { "data-icon": name, "data-treatment": r.tr, "data-size": kit.SIZES[r.size] ? r.size : r.g, "data-m": "decor-item" };
    return kit.frame(r.tr, r.g, r.fo, function (cx, cy, g, ink, x) {
      var f = rt ? rt.f : 1, out = [glyph(rec, { cx: cx, cy: cy, g: g * f, ink: ink, sw: sw / f, cap: r.x.dna.cap, join: r.x.dna.join, tint: x.tint, mirror: !!o.mirror, drawOn: !!o.drawOn, rt: rt, ground: x.ground })], bf;
      if (m) {   // the badge takes the accent unless it vanishes on its ground (1.8:1), then a support hue, then the ink
        bf = [tk.accent, tk.support[0], tk.support[1], tk.ink].filter(function (c) { return CS.core.color.contrast(c, x.ground) >= 1.8; })[0] || tk.ink;
        out.push(kit.g(modifier(m, { sw: sw, ink: ink, ground: x.ground, rtl: r.x.rtl, badge: bf, onBadge: kit.on(bf, tk) }), { transform: xf(cx, cy, g, false) }));
      }
      return out;
    });
  }
  function icon(name, o) { var r = make(name, o); return r && r.el; }
  icon.full = make;
  icon.measure = function measure(o) { o = o || {}; var r = resolve(o); return kit.measure(r.tr, r.g, r.fo); };
  art.icon = icon;
})();

  /* ---- file: object.js ---- */
/* src/art/object.js - owned by A1b. CS.art.object(id, o) -> <svg class="cs-icon"> | null (spec 3.1.1): a filled object on a 48 grid, roles base / shade (base 18% toward the outline
 * colour) / hi (surface). S-2: outline = art.objectOutline (0.03-0.04, default 0.035) of the glyph box, 4-20 px, in art.outlineColor (ink), miter limit 2; art.retrace adds a second pass.
 * treatment "bare", "sticker" (die-cut keyline, then the lift) or a container. o as CS.art.icon plus base, objectOutline, outlineColor. */
(function () {
  var art = CS.art, kit = art.kit, n = kit.n, maps = new WeakMap();
  function block(o) { var b = o.objects || (CS.visual && CS.visual._ && CS.visual._.block("cs-icon-objects")); return b && (b.objects || b); }
  function find(o, id) {
    var l = block(o), m;
    if (!l) return null;
    if (!(m = maps.get(l))) { m = {}; l.forEach(function (r) { m[r.id] = r; }); maps.set(l, m); }
    return m[id] || null;
  }
  function raw(o) { return o.art || (o.ctx || {}).art || {}; }
  function paths(rec, fills, stroke, sw, dna) {
    return rec.paths.map(function (p) { return kit.path(p.d, { fill: fills ? fills[p.role] || fills.base : stroke, stroke: stroke, "stroke-width": sw, "stroke-linecap": dna.cap, "stroke-linejoin": dna.join, "stroke-miterlimit": dna.join === "miter" ? 2 : null, "data-m": fills ? "decor-item" : null }); });
  }
  function make(id, o) {
    o = o || {};
    var rec = find(o, id), x, tr, size, g, px, k, sw, fo, m, dna, tk, rt, oc, vb, f;
    if (!rec) return null;
    x = kit.session(o); dna = x.dna; tk = x.tk; tr = o.treatment || "bare"; size = o.size == null ? "lg" : o.size; g = kit.gOf(size); vb = rec.viewBox || 48;
    if (!kit.MULT[tr]) kit.fail('unknown treatment "' + tr + '"', "E_USAGE");
    px = object.outline(size, o); rt = art._.retrace(o, tk, px * 24 / g); f = rt ? rt.f : 1; k = g * f / vb; sw = px / k;
    oc = kit.role(tk, o.outlineColor || o.ink || raw(o).outlineColor, tk.ink);
    fo = Object.assign({}, o, { dna: dna, tk: tk, rtl: x.rtl, seed: x.seed + "|" + id, ink: o.ink && kit.role(tk, o.ink), attrs: { "data-object": id, "data-treatment": tr, "data-size": kit.SIZES[size] ? size : g, "data-m": "decor-item" } });
    function body(ground) {   // retrace (if any) under the filled paths; base (supplied or derived) never equals the outline colour or vanishes on the ground
      var C = CS.core.color, base = kit.role(tk, o.base) || kit.base(Object.assign({}, tk, { ink: oc }), ground, dna.outline >= 3), c;
      if (C.contrast(base, oc) < 1.8) base = [tk.support[0], tk.support[1], tk.surface, tk.bg, tk.ink].filter(function (v) { return C.contrast(v, oc) >= 1.8; })[0] || base;   // no hue clears the outline colour: any that does
      c = { base: base, shade: kit.tint(base, oc, 0.18), hi: tk.surface };
      return (rt ? [art._.retraceG(rt, rec.paths.map(function (p) { return p.d; }), vb / 24, sw, rt.tint || kit.tint(oc, ground, 0.5))] : []).concat(paths(rec, c, oc, sw, dna));
    }
    if (tr === "sticker") {   // die-cut: the paper keyline follows the silhouette, the lift sits under it
      fo.outline = px; m = kit.measure("die", g, fo);
      var W = m.w, c = W / 2, kw = sw + 2 * m.paper / k, ink = fo.ink || tk.ink, s = m.sh, i, nodes = [], T = function (ox, oy) { return "translate(" + n(c - g * f / 2 + ox * k) + " " + n(c - g * f / 2 + oy * k) + ") scale(" + n(k) + ")"; };
      var at = T((x.rtl ? -1 : 1) * s.dx / k, s.dy / k);
      if (m.lift === "hard") nodes.push(kit.g(paths(rec, null, ink, kw, dna), { transform: at }));
      else if (m.lift === "soft") for (i = 0; i < 6; i++) nodes.push(kit.g(rec.paths.map(function (p) { return kit.path(p.d, { fill: "#000000", stroke: "#000000", "stroke-width": kw + i / 10 * s.blur / k, "stroke-linejoin": "round", "fill-opacity": 0.035, "stroke-opacity": 0.035 }); }), { transform: at }));
      nodes.push(kit.g(paths(rec, null, tk.paper, kw, { cap: "round", join: "round" }), { transform: T(0, 0) }), kit.g(body(tk.bg), { transform: T(0, 0) }));
      if (m.tilt) nodes = [kit.g(nodes, { transform: "rotate(" + n(m.tilt) + " " + n(c) + " " + n(c) + ")" })];
      return { el: kit.svg(W, W, nodes, Object.assign({ class: "cs-icon" }, fo.attrs)), w: W, S: g, pad: m.pad, g: g };
    }
    return kit.frame(tr, g, fo, function (cx, cy, gg, ink, y) {
      return [kit.g(body(y.fill || o.ground || tk.bg), { transform: "translate(" + n(cx - gg * f / 2) + " " + n(cy - gg * f / 2) + ") scale(" + n(gg * f / vb) + ")" })];
    });
  }
  function object(id, o) { var r = make(id, o); return r && r.el; }
  object.full = make;
  object.ids = function ids(o) { var l = block(o || {}); return l ? l.map(function (r) { return r.id; }) : []; };
  object.outline = function outline(size, o) {
    var r = o && o.objectOutline != null ? o.objectOutline : o && raw(o).objectOutline;
    r = typeof r === "number" && isFinite(r) ? Math.min(0.04, Math.max(0.03, r)) : 0.035;
    return Math.min(20, Math.max(4, Math.round(r * kit.gOf(size))));
  };
  art.object = object;
})();

  /* ---- file: anchor-icon.js ---- */
/* src/art/anchor-icon.js - owned by A1b. Anchors "icon" and "field" (sub "icon"): one container (an object, else a glyph) centred in ctx.box with an optional caption; "field" sets it on a
 * colour panel (the plate, the owner). kind icon: anchor.size is a ceiling, the largest token that fits the box is drawn, none fits -> null. kind field: the container is sized from the BOX,
 * not from the token ladder: the largest (at most 600 px, a breath short of the inside) that fits once the panel's own border (2 x dna.outline, inside its border-box) and the caption line
 * are taken out; anchor.size is not read. cs-price-tag-ar carries captions[0] in its empty box (24-grid x10 y9 w10 h6) from g 240 up when it fits, else below; role "chip", coloured against
 * what is painted behind it. On a field a bare or ring glyph reads on the panel. The plate marks itself data-plate="1" data-art="icon" (presets paint its pattern). */
(function () {
  var art = CS.art, kit = art.kit, PEAK = { over: 1, center: 1, half: 1, full: 1, band: 1 }, GAP = 24, CAP = 56, SIZES = ["hero", "xl", "lg", "md", "sm"], TAG = "cs-price-tag-ar", MAX = 600, MIN = 64;

  function build(anchor, ctx, field) {
    var iconPanel = !field && ctx.slide?.type !== "cover" && ctx.visual?.field === true;
    field = field || iconPanel;
    var text = anchor.captions && anchor.captions[0] ? String(anchor.captions[0]) : null, tag = !!text && anchor.icon === TAG && !anchor.object;
    var cap = text ? kit.label(tag ? "chip" : "small", 0, text) : null, labels = cap ? [cap] : [];
    if (ctx.labelsOnly) return { el: null, boxes: [], labels: labels };
    var x = kit.session({ ctx: ctx }), tk = x.tk, dna = x.dna, box = ctx.box || ctx.zone || { w: 852, h: 420 }, obj = anchor.object, big = !!PEAK[ctx.recipe], req = anchor.size || ctx.size, q = SIZES.indexOf(req);
    var sizes = req ? q >= 0 ? SIZES.slice(q) : [req] : SIZES, tr = anchor.treatment || (field ? "sticker" : big ? "giant" : obj ? "sticker" : "duo"), bw = field ? dna.outline : 0;
    var iw = box.w - 2 * bw, ih = box.h - 2 * bw;   // the panel's border is inside its border-box: fit and caption width use what is left
    var o = { ctx: ctx, treatment: tr, drawOn: true, modifier: anchor.badge, mirror: anchor.mirror, name: obj || anchor.icon }, r = null, inTag = false, below = false, avail, i, g;
    if (field) { o.fill = tk.surface; o.base = "surface"; if (tr === "bare" || tr === "ring") { o.ink = kit.on(tk.accent, tk); o.ground = tk.accent; } }
    function tagged(g) { return tag && g >= 240 && Array.from(text).length * 0.62 * kit.labelFloor("chip", text) <= g * 10 / 24; }
    function draw(sz) {
      o.size = sz;
      var c = obj ? art.object.full(obj, o) : null;
      return c || (anchor.icon ? art.icon.full(anchor.icon, o) : null);   // no object: the Lucide glyph
    }
    if (field) {   // the largest glyph (px) whose container fits: the container only grows with it, so a bisection finds it
      for (i = 0; i < (tag ? 2 : 1) && !r; i++) {
        inTag = tag && !i; below = !!text && !inTag; avail = Math.min(iw, ih - (below ? CAP + GAP : 0)); avail = Math.min(MAX, avail - 2 * Math.min(14, Math.round(avail * 0.03)));
        if (inTag) o.tilt = 0; else delete o.tilt;   // a tilted sticker would turn under its upright label
        for (var lo = MIN, hi = Math.floor(avail), m, c; lo <= hi;) { m = (lo + hi) >> 1; c = draw(m); if (c && c.w <= avail) { r = c; lo = m + 1; } else hi = m - 1; }
        if (r && inTag && !tagged(r.g)) r = null;
      }
      if (!r) return null;
    } else {
      for (i = 0; i < sizes.length; i++) {   // the named size or smaller, else the largest token whose container fits the box
        g = kit.gOf(sizes[i]); inTag = tagged(g);
        if (inTag) o.tilt = 0; else delete o.tilt;
        below = !!text && !inTag; avail = Math.min(box.w, box.h - (below ? CAP + GAP : 0));
        r = draw(sizes[i]);
        if (!r || r.w <= avail) break;
      }
      if (!r || r.w > avail) return null;   // nothing fits: the caller drops the anchor
    }
    var pw = iconPanel ? Math.min(box.w, Math.max(r.S + 96, below ? Math.min(box.w, 560) + 2 * bw : 0)) : box.w, ph = iconPanel ? Math.min(box.h, r.w + (below ? GAP + CAP : 0) + 48) : box.h;
    var ox = box.x || 0, oy = box.y || 0, bx = ox + (box.w - r.w) / 2, by = oy + (box.h - r.w - (below ? GAP + CAP : 0)) / 2, boxes = [], owned = !!r.fill, own = field ? "f" : owned ? "c" : null, kids = [r.el];   // r.fill: a filled container (a die-cut object has none)
    if (owned && !field) kit.owner(r.el);
    if (field) boxes.push({ x: ox + (box.w - pw) / 2, y: oy + (box.h - ph) / 2, w: pw, h: ph, kind: "owner", id: "f", fill: 1, border: bw });
    boxes.push(Object.assign({ x: bx + r.pad, y: by + r.pad, w: r.S, h: r.S }, field ? { kind: "ink", ownerOf: "f" } : owned ? { kind: "owner", id: "c" } : { kind: "ink" }));
    if (owned && !field) boxes.push({ x: bx + (r.w - r.g) / 2, y: by + (r.w - r.g) / 2, w: r.g, h: r.g, kind: "ink", ownerOf: "c" });
    if (inTag) {   // the label sits in the tag's empty box, in the colour that reads on what is behind it
      var u = r.g / 24, lx = (r.w - r.g) / 2 + (anchor.mirror ? 4 : 10) * u, ly = (r.w - r.g) / 2 + 9 * u, under = tr === "duo" || tr === "giant" ? kit.role(tk, o.tintFill, r.fill === tk.accent ? tk.surface : tk.accent) : r.fill || o.ground || tk.bg;
      cap.el.setAttribute("style", "color:" + kit.on(under, tk) + ";");
      kids = [kit.html("div", { "data-part": "glyph" }, { position: "relative", width: r.w, height: r.w, flex: "none" }, [r.el, kit.html("div", { "data-part": "tag" }, { position: "absolute", left: lx, top: ly, width: 10 * u, height: 6 * u, display: "flex", "align-items": "center", "justify-content": "center" }, cap.el)])];
      boxes.push(Object.assign({ x: bx + lx, y: by + ly, w: 10 * u, h: 6 * u, kind: "text" }, own ? { ownerOf: own } : null));
    } else if (cap) {
      var cw = Math.min(iw, 560);
      cap.el.setAttribute("style", "width:" + kit.n(cw) + "px;height:" + CAP + "px;text-align:center;" + (field ? "color:" + kit.on(tk.accent, tk) + ";" : ""));   // on the panel the caption takes the colour that reads on it
      kids.push(cap.el); boxes.push(Object.assign({ x: ox + (box.w - cw) / 2, y: by + r.w + GAP, w: cw, h: CAP, kind: "text" }, own === "f" ? { ownerOf: "f" } : null));
    }
    var flex = { display: "flex", "flex-direction": "column", "align-items": "center", "justify-content": "center", gap: GAP, "box-sizing": "border-box", width: box.w, height: box.h }, seed = x.seed + "|" + (ctx.slideId || ""), w;
    if (!field) return { el: kit.wrap("icon", seed, kids, { style: flex }), boxes: boxes, labels: labels };
    Object.assign(flex, { width: pw, height: ph, "background-color": tk.accent, "border-radius": dna.radius.panel, border: bw ? bw + "px solid " + tk.ink : null });
    w = kit.wrap("field", seed, kids, { panel: true, panelStyle: flex, style: Object.assign({ display: "flex", width: box.w, height: box.h }, iconPanel ? { "align-items": "center", "justify-content": "center" } : {}) });
    w.firstChild.setAttribute("data-plate", "1"); w.firstChild.setAttribute("data-art", "icon");   // the plate: presets paint [data-plate="1"]
    if (iconPanel) { w.setAttribute("data-art", "icon"); w.setAttribute("data-anchor-kind", "icon"); }
    return { el: w, boxes: boxes, labels: labels };
  }
  art.register("icon", function (anchor, ctx) { return build(anchor, ctx, false); }, ["icon"]);
  art.register("field", function (anchor, ctx) { return build(anchor, ctx, true); }, ["icon"]);
})();

  /* ---- file: index.js ---- */
/* src/art/index.js - owned by A1. The public face of cs-art: version and the enumerations every package reads (sizes, treatments, modifiers). */
(function () {
  var art = CS.art, kit = art.kit;
  art.version = "1.1.0";
  art.sizes = kit.SIZES;
  art.treatments = Object.keys(kit.MULT);
  art.modifiers = ["slash", "cross", "plus", "check", "question", "sparkle"];
  art.describe = function describe() { return { version: art.version, kinds: art.kinds(), treatments: art.treatments, modifiers: art.modifiers, sizes: art.sizes }; };
})();

  /* ---- file: scene.js ---- */
/* src/art/scene.js - owned by A2 - stub */

  /* ---- file: scene-more.js ---- */
/* src/art/scene-more.js - owned by A3 - stub */

  /* ---- file: diagram.js ---- */
/* src/art/diagram.js - owned by A3 - stub */

  /* ---- file: mock.js ---- */

(function () {
  var art = CS.art, kit = art.kit, n = kit.n, h = kit.html, own = kit.owner, K = 0.56, LH = { body: 63, small: 52 }, CH = 60, GAP = 16, PX = 30, PY = 12, TXT = "text-align:start;white-space:normal;flex:1;min-width:0;";
  var BG = "background-color", BR = "border-radius", BS = "box-shadow", FD = "flex-direction", JC = "justify-content", AI = "align-items", MH = "min-height";

  function norm(s) { return String(s == null ? "" : s).replace(/\s+/g, " ").trim(); }
  function cnt(s) { s = norm(s); return s ? s.split(" ").length : 0; }
  function runs(L) {
    return L.map(function (l, i) { var a = i, b = i; while (a && L[a - 1].who === l.who) a--; while (L[b + 1] && L[b + 1].who === l.who) b++; return b > a ? i - a + 1 : 0; });
  }
  function words(a, ctx, notes) {
    var m = a.mock || {}, s = ctx.slide || {}, d = s.demo || {}, q = s.quote, si = s.sides || [], it = s.items || [], prev, L, g = function (l, k) { return (l || []).map(function (x) { return x && x[k]; }); };
    q = (q && q.body) || (typeof q === "string" ? q : "") || (s.type === "quote" ? s.body : "");
    var p = [d.caption, q].concat(s.bullets || [], g(d.lines, "text"), g(si, "text"), g(si, "label"), g(it, "title"), g(it, "text")).map(norm).filter(Boolean);
    var ok = function (t) { return p.indexOf(norm(t)) >= 0; }, fit = function (t) { return ok(t) && cnt(t) <= 12; }, keep = function (l) { return !!l && fit(l.text); };
    var tot = function (A, c) { var u = runs(A), t = cnt(c); A.forEach(function (l, i) { t += cnt(l.text) + (u[i] && !notes ? 1 : 0); }); return t; };
    var demo = !m.lines && (d.lines || []).length, dl = d.lines || [];
    if (demo && (dl.length > (notes ? 5 : 4) || dl.some(function (l) { return !keep(l); }))) return { lines: [], caption: "" };
    L = (m.lines || []).filter(keep);
    if (!L.length) L = (d.lines || []).filter(keep);
    if (!L.length && notes) [m.items, g(it, "title"), s.bullets].some(function (l) { L = (l || []).filter(fit).map(function (t) { return { text: t }; }); return L.length; });
    if (!L.length && !notes) L = (q ? [{ who: "them", text: q }] : si.length > 1 ? si.slice(0, 2).map(function (x, i) { return { who: i ? "me" : "them", text: x.text }; }) : []).filter(keep);
    L = L.slice(0, notes ? 5 : 4).map(function (l, i) { var w = l.who === "me" || l.who === "them" ? l.who : prev === "them" ? "me" : "them"; prev = w; return { who: w, text: String(l.text), hi: !!l.hi || m.highlight === i }; });
    if (demo && tot(L, m.caption || d.caption) > 24) return { lines: [], caption: "" };
    while (L.length && tot(L) > 24) L.pop();
    q = runs(L); L.forEach(function (l, i) { l.n = notes ? 0 : q[i]; });
    var caption = m.caption == null ? d.caption : m.caption;
    return { lines: L, caption: ok(caption) && tot(L, caption) <= 24 ? String(caption) : "" };
  }

  function env(ctx) {
    var x = kit.session({ ctx: ctx }), tk = x.tk, dna = x.dna, c = CS.core.color, ow = dna.outline, sh = dna.shadow, bw = ow || 3;
    return { tk: tk, dna: dna, rtl: x.rtl, bw: bw, L: [], seed: x.seed, bd: bw + "px solid " + (ow ? tk.ink : tk.line), ink: bw + "px solid " + tk.ink,
      soft: function (v) { for (var i = 0; i < 14 && c.contrast(tk.ink, v) < 4.5; i++) v = c.mix(v, tk.surface, 0.12); return v; },
      lift: function (k) { return sh.kind === "hard" ? n((x.rtl ? -sh.dx : sh.dx) * k) + "px " + n(sh.dy * k) + "px 0 " + tk.ink : sh.kind === "soft" ? "0 " + n(sh.dy) + "px " + n(sh.blur) + "px rgba(0,0,0,0.14)" : null; } };
  }
  function fx(s, al) { return Object.assign({ display: "flex", [AI]: al || "center", "box-sizing": "border-box" }, al === "stretch" ? { [FD]: "column" } : null, s); }
  function lab(E, role, text, color, css) {
    var l = kit.label(role, E.L.length, text);
    E.L.push(l); l.el.setAttribute("style", "color:" + color + ";" + (css || TXT) + (LH[role] ? "line-height:" + LH[role] + "px;" : ""));
    return l.el;
  }
  function chip(E, fill, kid) {
    return own(h("div", {}, fx({ width: CH, height: CH, flex: "none", [BR]: Math.min(E.dna.radius.chip, CH / 2), [BG]: fill, border: E.bd, [JC]: "center" }), kid));
  }
  function avatar(E, who) {
    var fill = who === "me" ? E.tk.accent : E.tk.surface, g = kit.on(fill, E.tk);
    return chip(E, fill, kit.svg(34, 34, [kit.path(kit.disc(17, 12, 7), { fill: g }), kit.path("M4 32a13 11 0 0 1 26 0z", { fill: g })]));
  }
  function nl(t, w, z) { return Math.max(1, Math.ceil(t.length * z * K / w)); }

  function chat(w, E, box, cap) {
    var tk = E.tk, dna = E.dna, rtl = E.rtl, bw = E.bw, W = box.w, ox = box.x || 0, avail = box.h - cap, ground = E.soft(tk.support[1]), me = E.soft(tk.support[0]), f = kit.flip(rtl, W), P, y, col = [];
    var rows = w.lines.slice(), Rb = Math.min(40, Math.max(14, dna.radius.card)), pad = 34, R = W - 2 * pad, bm = Math.round(R * 0.72);
    if (rows.every(function (r) { return r.who === rows[0].who; })) rows.push({ who: rows[0].who === "me" ? "them" : "me", typing: true });
    function plan(ro) {
      var z = ro === "body" ? 44 : 36, lh = LH[ro], H = 20 + 2 * bw, out = rows.map(function (r) {
        var b = r.typing ? 150 : Math.round(Math.min(bm, Math.max(360, r.text.length * z * K + 2 * PX + 2 * bw)));
        return Object.assign({}, r, { b: b, ln: r.typing ? 1 : nl(r.text, b - 2 * PX - 2 * bw, z) });
      });
      out.forEach(function (r, q) { r.h = r.typing ? 76 : r.ln * lh + 2 * PY + 2 * bw; H += r.h + (q ? GAP : 0); });
      return { rows: out, H: H, ro: ro, lh: lh };
    }
    P = plan("body");
    if (P.H > avail) P = plan("small");
    if (P.H > avail) return null;
    var pt = Math.floor((box.h - P.H - cap) / 2), top = (box.y || 0) + pt, boxes = [{ x: ox, y: top, w: W, h: P.H, kind: "owner", id: "w", fill: 1, border: bw }];
    y = top + bw + 10;
    P.rows.forEach(function (r) {
      var mine = r.who === "me", bx = pad + (mine ? R - (CH + GAP + r.b) : CH + GAP), cx = pad + (mine ? R - CH : 0), fill = r.hi ? tk.accent : mine ? me : tk.surface, tw = r.b - 2 * PX - 2 * bw, q4 = [Rb, Rb, Rb, Rb], cc, bub;
      cc = r.n ? chip(E, tk.accent, lab(E, "chip", r.n + "", kit.on(tk.accent, tk), "text-align:center;white-space:nowrap;")) : avatar(E, r.who);
      q4[(r.who === "them") === rtl ? 2 : 3] = 4;
      bub = h("div", { "data-part": r.typing ? "typing" : "bubble" }, fx(Object.assign(r.typing ? { width: 150, height: 76 } : { width: r.b, padding: PY + "px " + PX + "px" },
        { flex: "none", [BG]: r.typing ? me : fill, border: E.bd, [BR]: q4.join("px ") + "px", [BS]: E.lift(0.8), [JC]: "center" })),
        r.typing ? kit.svg(70, 18, [9, 35, 61].map(function (x) { return kit.path(kit.disc(x, 9, 8), { fill: tk.ink }); })) : lab(E, P.ro, r.text, kit.on(fill, tk), TXT + (r.hi ? "font-weight:700;" : "")));
      col.push(h("div", { "data-part": "row", "data-who": r.who }, fx({ gap: GAP, "align-self": mine ? "flex-end" : "flex-start", flex: "none" }, r.n ? "center" : "flex-end"), mine ? [bub, cc] : [cc, bub]));
      boxes.push(r.typing ? { x: ox + f(bx + 40, 70), y: y + 29, w: 70, h: 18, kind: "ink", ownerOf: "w" } : { x: ox + f(bx + PX + bw, tw), y: y + PY + bw, w: tw, h: r.ln * P.lh, kind: "text", ownerOf: "w" },
        { x: ox + f(cx, CH), y: y + (r.n ? (r.h - CH) / 2 : r.h - CH), w: CH, h: CH, kind: "ink", ownerOf: "w" });
      y += r.h + GAP;
    });
    var win = own(h("div", { class: "cs-art-panel" }, fx({ width: W, [MH]: P.H, [BG]: ground, border: E.bd, [BR]: dna.radius.window, [BS]: E.lift(1) }, "stretch"),
      h("div", {}, fx({ [JC]: "space-evenly", "row-gap": GAP, flex: 1, padding: "10px " + pad + "px" }, "stretch"), col)));
    return { kids: [win], boxes: boxes, below: top + P.H, pt: pt, minHeight: plan("small").H + cap + 8 };
  }

  function note(w, E, box, cap) {
    var tk = E.tk, dna = E.dna, rtl = E.rtl, bw = E.bw, W = box.w, ox = box.x || 0, rows = w.lines, avail = box.h - cap, TOP = 30, CK = 48, pad = 40, vp = 16, ry = 10, P, y, col = [];
    var tl = dna.tilt ? Math.min(1.5, dna.tilt * 0.22) * kit.rng(E.seed + "tilt").sign() : 0, p = tl ? Math.ceil(W * Math.sin(Math.abs(tl) * Math.PI / 180) / 2) + 4 : 0, PW = W - 2 * p, band = E.soft(tk.support[0]);
    function plan(ro) {
      var z = ro === "body" ? 44 : 36, lh = LH[ro], H = TOP + 2 * (vp + bw), hs = rows.map(function (r) { return Math.max(CK, nl(r.text, PW - 2 * pad - 8 - CK - 62, z) * lh) + 2 * ry; });
      hs.forEach(function (v, q) { H += v + (q ? 18 : 0); });
      return { hs: hs, H: H, ro: ro };
    }
    P = plan("body");
    if (P.H + p > avail) P = plan("small");
    if (P.H + p > avail) return null;
    var pt = Math.floor((box.h - P.H - p - cap) / 2), top = (box.y || 0) + pt, tx = Math.round(rtl ? W * 0.18 : W * 0.82 - 190), rw = PW - 2 * (pad + 4 + bw), rx = ox + p + bw + pad + 4;
    var boxes = [{ x: ox + p, y: top + TOP, w: PW, h: P.H - TOP, kind: "owner", id: "p", fill: 1, border: bw }, { x: ox + tx, y: top + 6, w: 190, h: 50, kind: "decor" }];
    y = top + TOP + bw + vp;
    rows.forEach(function (r, q) {
      var b = r.hi ? bw : 0, mark = kit.svg(CK, CK, [kit.path(kit.rrect(6, 6, 36, 36, Math.min(10, dna.radius.tile)), { fill: tk.surface, stroke: tk.ink, "stroke-width": 4, "stroke-linejoin": "round" })]
        .concat(r.hi ? [kit.path("M13 25l8 9 15-19", { fill: "none", stroke: tk.ink, "stroke-width": 6, "stroke-linecap": "round", "stroke-linejoin": "round" })] : []));
      col.push(h("div", { "data-part": "row" }, fx(Object.assign({ gap: 22, padding: (ry - b) + "px " + (20 - b) + "px", flex: "none" }, r.hi ? { [BG]: band, border: E.ink, [BR]: Math.max(10, dna.radius.tile), [BS]: E.lift(0.6) } : null)),
        [mark, lab(E, P.ro, r.text, kit.on(r.hi ? band : tk.note, tk), TXT + (r.hi ? "font-weight:700;" : ""))]));
      boxes.push({ x: rx, y: y, w: rw, h: P.hs[q], kind: "text", ownerOf: "p" });
      y += P.hs[q] + 18;
    });
    var paper = own(h("div", { class: "cs-art-panel" }, fx({ [JC]: "space-evenly", "row-gap": 18, width: PW, [MH]: P.H - TOP, margin: TOP + "px auto 0", padding: vp + "px " + (pad + 4) + "px",
      [BG]: tk.note, border: E.ink, [BR]: dna.radius.card, [BS]: E.lift(1), transform: tl ? "rotate(" + n(tl) + "deg)" : null }, "stretch"), col));
    var tape = h("div", {}, { position: "absolute", top: 6, left: tx, width: 190, height: 50, [BG]: tk.support[1], border: E.ink, "box-sizing": "border-box", transform: "rotate(3deg)" });
    return { kids: [h("div", {}, { position: "relative", width: W, flex: "none", "padding-bottom": p }, [paper, tape])], boxes: boxes, below: top + P.H + p, pt: pt, minHeight: plan("small").H + p + cap + 8 };
  }

  function build(a, ctx) {
    var kind = a.mock && a.mock.kind, notes = kind === "notes", w = words(a, ctx, notes);
    if (!w.lines.length) return null;
    if (ctx.labelsOnly) {
      var labels = [], add = function (role, text) { labels.push(kit.label(role, labels.length, text)); };
      w.lines.forEach(function (l) { if (l.n) add("chip", String(l.n)); add("body", l.text); });
      if (w.caption) add("small", w.caption);
      return { el: null, boxes: [], labels: labels };
    }
    // The inner body extends 4px into the bottom keep-outs; inset full-width captions.
    var E = env(ctx), box = ctx.box || ctx.zone || { w: 852, h: 560 }, cap = w.caption ? 24 + nl(w.caption, box.w, 36) * LH.small : 0, b = (notes ? note : chat)(w, E, Object.assign({}, box, { h: box.h - 8 }), cap);
    if (!b) return null;
    if (w.caption) { b.kids.push(lab(E, "small", w.caption, E.tk.ink, TXT + "align-self:stretch;flex:none;height:" + (cap - 24) + "px;")); b.boxes.push({ x: box.x || 0, y: b.below + 24, w: box.w, h: cap - 24, kind: "text" }); }
    var el = kit.wrap("mock", E.seed, b.kids, { style: fx({ [FD]: "column", gap: 24, position: "relative", width: box.w, [MH]: box.h, "padding-top": b.pt }) });
    el.setAttribute("data-mock", kind); el.setAttribute("dir", E.rtl ? "rtl" : "ltr");
    return { el: el, boxes: b.boxes, labels: E.L, minHeight: b.minHeight };
  }

  art.mock = { words: words };
  art.register("mock", build, ["chat", "notes"]);
})();

  /* ---- file: mock-more.js ---- */
/* src/art/mock-more.js - owned by A5 - stub */

  /* ---- file: artefact.js ---- */
/* src/art/artefact.js - owned by A5b - stub */

  /* ---- file: chart.js ---- */
/* src/art/chart.js - A6a. Kind "chart", sub "bars-h", and CS.art.chart (div at ol ew cw mixTo pal bar share proof chip waffle comp burst), the helpers numeral.js shares; manifest.json loads this first. */
(() => {
  const art = CS.art, kit = art.kit, K = (art.chart = {}), M = Math, C = () => CS.core.color, T = [[0.4, 0.58, 0.84, 0.28, 0.53, 0.6], [0.55, 0.7, 1.02, 0.34, 0.72, 0.7]];

  K.div = (st, kids, at) => kit.html("div", at || {}, st, kids);
  K.at = (l, t, w, h, kid, mid) => K.div({ position: "absolute", left: l, top: t, width: w, height: h, ...(mid && { display: "flex", alignItems: "center" }) }, kid);
  K.ol = (dna) => (dna.outline > 0 ? M.min(dna.outline, 4) : 0);
  K.ew = (s, hi) => {   // em width in a heavy face: false = a floor (fit never grows past the plan), true = typical (boxes)
    let w = 0;
    for (const c of String(s)) w += T[hi ? 1 : 0][c === "1" ? 0 : /[0-9٠-٩]/.test(c) ? 1 : /[%٪]/.test(c) ? 2 : /[.,٫٬ \/]/.test(c) ? 3 : /[؀-ۿ]/.test(c) ? 4 : 5];
    return w;
  };
  K.sty = (w, h, f, lh) => `display:block;white-space:nowrap;text-align:center;width:${w}px;height:${h}px;font-size:${f}px;line-height:${lh};`;   // a centred figure label
  K.cw = (pr) => M.ceil(K.ew(pr.text, true) * 36 + 50);
  K.mixTo = (bg, ink, min) => { const c = C(); let t = 0.06, v = c.mix(bg, ink, t); while (t < 1 && c.contrast(v, bg) < min) v = c.mix(bg, ink, (t += 0.06)); return v; };
  K.pal = (tk, ol) => {   // G1/G2: outlined marks: paper "off", ink edge; else "on" is 3:1 on the ground, "off" a faint fill with a 3:1 edge tint
    const c = C(), off = ol ? tk.surface : K.mixTo(tk.bg, tk.ink, 1.5), on = [tk.accent, tk.support[0], tk.support[1]].find((v) => c.contrast(v, off) >= 1.5 && (ol || c.contrast(v, tk.bg) >= 3));
    return { on: on || tk.ink, off, edge: ol ? tk.ink : K.mixTo(tk.bg, tk.ink, 3) };
  };
  K.bar = (x, y, w, h, r, fill, ink, ol) => kit.path(kit.rrect(x + ol / 2, y + ol / 2, w - ol, h - ol, M.min(h / 2, r)), { fill, stroke: ol ? ink : null, "stroke-width": ol || null, "stroke-linejoin": ol ? "round" : null });
  K.share = (a, v, u) => {   // 0..1, or null unless filled/of, n%, n/m, or n with a "%" / "من N" unit says a share (28/30 is 93%)
    const f = (s) => (s + "").replace(/[٠-٩]/g, (d) => d.charCodeAt(0) - 1632).replace("٫", ".").trim(), t = f(u), of = +a.of > 0 ? +a.of : 0, q = /^(\d+(?:\.\d+)?)\s*(?:([%٪])|[\/∕]\s*(\d+(?:\.\d+)?))?$/.exec(f(v));
    let n, d;
    if (a.filled != null) { n = +a.filled; d = of || 100; }
    else if (q) { n = +q[1]; d = q[3] ? +q[3] : q[2] || /^(%|٪|percent|(?:في|ب)ال(?:مية|مئة))$/i.test(t) ? 100 : of || +(/(?:من|out of|per|of) (?:كل )?(\d+)$/.exec(t) || [])[1]; }
    return n >= 0 && d > 0 && n <= d ? n / d : null;
  };
  K.proof = (ctx, ill) => {   // sourced: a chip with the first source (its id when the label is too long); else the illustrative tag
    const id = ((ctx.slide && ctx.slide.sourceIds) || [])[0], en = ctx.lang === "en", p = en ? "Source: " : "المصدر: ", t = p + ((ctx.sources || {})[id] || id);
    return ill || !id ? { src: false, text: en ? "Illustrative" : "رسم توضيحي" } : { src: true, text: K.ew(t, true) * 36 + 50 > 440 ? p + id : t };
  };
  K.chip = (x, pr, l) => {   // 36 px text in a 56 px pill: the tag on paper with an ink outline, the source muted
    const tk = x.tk, fill = pr.src ? null : tk.surface;
    l.el.setAttribute("style", `display:block;white-space:nowrap;line-height:44px;color:${pr.src ? tk.inkMuted : kit.on(fill, tk)};`);
    return { w: K.cw(pr), el: K.div({ display: "flex", alignItems: "center", height: 50, padding: "0 22px", border: `3px solid ${pr.src ? tk.line : tk.ink}`, borderRadius: M.min(28, x.dna.radius.chip), backgroundColor: fill }, l.el, { "data-part": "chip" }) };
  };
  const cell = (sh, x, y, z) => (sh === "disc" ? kit.disc(x + z / 2, y + z / 2, z / 2) : sh === "arch" ? kit.arch(x, y, z, z, 0.5, 2) : kit.rrect(x, y, z, z, sh));
  K.waffle = (o) => {   // 10 x 10 cells (size c, gap g), the first n filled from the start edge; outlines (sw filled, so empty, in oc) sit inside their cell
    const p = o.c + o.g, q = 10 * p - o.g, a = [[], o.sw], b = [[], o.so];
    for (let i = 0, g; i < 100; i++) { g = i < o.n ? a : b; g[0].push(cell(o.shape, (o.rtl ? 9 - (i % 10) : i % 10) * p + g[1] / 2, M.floor(i / 10) * p + g[1] / 2, o.c - g[1])); }
    return kit.svg(q, q, [b, a].map(([d, s], k) => kit.path(d.join(""), { fill: k ? o.on : o.off, stroke: s ? (k ? o.line : o.oc) : null, "stroke-width": s || null, "stroke-linejoin": s ? "round" : null })));
  };
  K.comp = (sub, a, ctx, x, p, W, H, rw) => {   // the companion of a row (beside) or column (under) layout: { w, h, el } | null
    const tk = x.tk, dna = x.dna, ol = K.ol(dna), pal = K.pal(tk, !!ol), room = rw ? M.min(H, W * 0.42) : H * 0.42, c = dna.container;
    let e, h, f;
    if (sub === "waffle") {
      e = M.max(28, M.min(38, M.floor((room - 36) / 10))); h = 10 * e + 36;
      return { w: h, h, el: K.waffle({ n: M.round(p * 100), c: e, g: 4, sw: ol ? 3 : 0, so: 3, rtl: x.rtl, on: pal.on, off: pal.off, oc: pal.edge, line: tk.ink, shape: c === "disc" || c === "hand-circle" ? "disc" : c === "arch" ? "arch" : c === "app-tile" ? M.round(e * 0.3) : 0 }) };
    }
    if (sub === "bar") {
      h = 28 + 2 * ol; e = M.max(h, M.round(W * p));
      return { w: W, h, el: kit.svg(W, h, [K.bar(0, 0, W, h, h, pal.off, pal.edge, ol || 3), p ? K.bar(kit.flip(x.rtl, W)(0, e), 0, e, h, h, pal.on, tk.ink, ol) : null]) };
    }
    ["xl", "lg"].some((z) => {   // the counted thing as a sticker (the object, else the glyph): the largest size that fits
      const o = { ctx, treatment: "sticker", size: z, name: a.object || a.icon };
      f = (a.object && art.object.full(a.object, o)) || (a.icon && art.icon.full(a.icon, o));
      return !f || f.w <= room || z === "lg";
    });
    return f && { w: f.w, h: f.w, el: f.fill ? kit.owner(f.el) : f.el };
  };
  K.burst = (x, d) => {   // a starburst sticker of d px: a support hue, the ink outline, the preset's hard shadow
    const tk = x.tk, sh = x.dna.shadow, R = d / 2 - 10, c = d / 2, bw = M.max(K.ol(x.dna), 3), star = (cx, cy) => kit.star(cx, cy, R, R * 0.83, 14), fill = [tk.support[0], tk.accent, tk.surface].find((v) => C().contrast(tk.ink, v) >= 4.5) || tk.surface;
    return { fill, bw, el: kit.owner(kit.svg(d, d, [sh.kind === "hard" ? kit.path(star(c + (x.rtl ? -sh.dx : sh.dx), c + sh.dy), { fill: tk.ink }) : null, kit.path(star(c, c), { fill, stroke: tk.ink, "stroke-width": bw, "stroke-linejoin": "round" })])) };
  };

  const bars = (anchor, ctx) => {
    const ch = anchor.chart || {}, v = ch.values, un = ch.unit ? String(ch.unit) : "", pr = K.proof(ctx, ch.illustrative), L = [], w38 = (s) => K.ew(s, true) * 38;
    if (!Array.isArray(v) || !v.length || v.length > 7) return null;
    const rows = v.map((q, k) => ({ k, label: q && q.label != null ? String(q.label).trim() : "", value: q ? +q.value : NaN, hi: !!(q && q.hi) }));
    if (rows.some((q) => !isFinite(q.value) || q.value < 0 || !q.label)) return null;
    rows.sort((a, b) => b.value - a.value || a.k - b.k);
    if (!rows.some((q) => q.hi)) rows[0].hi = true;
    const n = rows.length;
    let Vw = 0;
    rows.forEach((q, k) => {
      const t = w38(q.label), m = M.max(...q.label.split(/\s+/).map(w38));
      q.t = t + 8; q.n2 = M.max(m, (t + m + 13) / 2) + 8;   // the category on one line, on two (a word never breaks)
      q.text = q.value + (un ? (/^[%٪]/.test(un) ? "" : " ") + un : ""); Vw = M.max(Vw, w38(q.text) + 8);
      L.push((q.l = kit.label("chart", 2 * k, q.label)), (q.v = kit.label("chart", 2 * k + 1, q.text)));
    });
    const cl = kit.label("chip", 2 * n, pr.text);
    L.push(cl);
    if (ctx.labelsOnly) return { el: null, boxes: [], labels: L };
    const x = kit.session({ ctx }), tk = x.tk, dna = x.dna, rtl = x.rtl && (((ctx.brand || {}).art || {}).chartAxis || {}).categories !== "ltr", box = ctx.box || ctx.zone || { w: 852, h: 420 }, W = box.w, H = box.h, ox = box.x || 0, oy = box.y || 0, flip = kit.flip(rtl, W);
    const ol = K.ol(dna), pal = K.pal(tk, !!ol), tint = K.mixTo(tk.bg, tk.ink, 3), pitch = M.min(96, M.floor((H - 80) / n)), mx = (f) => M.ceil(M.max(...rows.map(f))), B = (l, t, w, h, kind) => ({ x: ox + l, y: oy + t, w, h, kind });
    let Lw = mx((q) => q.t), wr = 0;
    Vw = M.ceil(Vw);
    if (Lw > W * 0.42 && (wr = 1)) Lw = mx((q) => q.n2);   // a category wider than 42% of the box takes two 38 px lines
    if (pitch < (wr ? 92 : 54) || K.cw(pr) > W) return null;   // two 38 px lines or the chip would not fit
    const A = W - Lw - 36 - Vw;
    if (A < 120) return null;
    const bt = M.max(30, M.min(56, M.floor(pitch * 0.6))), top = M.floor((H - n * pitch - 80) / 2), sc = M.max(+ch.total || 0, rows[0].value) || 1, kids = [], boxes = [];
    const nodes = [kit.path(kit.rrect(flip(Lw + 17, 3), top, 3, n * pitch, 0), { fill: tint })];   // the zero line: one hairline, no grid
    rows.forEach((q, k) => {
      const len = q.value > 0 ? M.max(6, M.round((A * q.value) / sc)) : 0, y = top + k * pitch, bx = flip(Lw + 20, len), vx = rtl ? bx - 16 - Vw : bx + len + 16;
      if (len) nodes.push(K.bar(bx, y + (pitch - bt) / 2, len, bt, dna.radius.chip, q.hi ? pal.on : ol ? tk.surface : tint, tk.ink, ol));
      q.l.el.setAttribute("style", `display:block;width:${Lw}px;white-space:${wr ? "normal" : "nowrap"};`); q.v.el.setAttribute("style", `display:block;width:${Vw}px;white-space:nowrap;font-variant-numeric:normal;`);
      kids.push(K.at(flip(0, Lw), y, Lw, pitch, q.l.el, 1), K.at(vx, y, Vw, pitch, q.v.el, 1));
      boxes.push(B(bx, y + (pitch - bt) / 2, len, bt, "ink"), B(flip(0, Lw), y, Lw, pitch, "text"), B(vx, y, Vw, pitch, "text"));
    });
    const cp = K.chip(x, pr, cl), cx = rtl ? 0 : W - cp.w, cy = top + n * pitch + 24;
    kids.push(K.at(cx, cy, cp.w, 56, cp.el)); boxes.push(B(cx, cy, cp.w, 56, "text"));
    return { el: kit.wrap("chart", `${x.seed}|${ctx.slideId || ""}`, [K.div({ position: "absolute", left: 0, top: 0 }, kit.svg(W, H, nodes)), ...kids], { style: { position: "relative", width: W, height: H } }), boxes, labels: L };
  };
  art.register("chart", bars, ["bars-h"]);
})();

  /* ---- file: numeral.js ---- */

(() => {
  const art = CS.art, kit = art.kit, K = art.chart, M = Math, G = 40;
  if (!K) throw Object.assign(new Error("numeral.js needs chart.js loaded first"), { code: "E_ART_REGISTER" });

  const s = (v) => (v == null ? "" : String(v).trim());
  const build = (anchor, ctx) => {
    const sl = ctx.slide || {}, nb = sl.number || {}, val = s(anchor.value != null ? anchor.value : nb.value), unit = s(anchor.unit != null ? anchor.unit : nb.unit);
    let sub = art._.sub(anchor), ul, cl;
    if (!val) return null;
    const p = K.share(anchor, val, unit), ordinal = /^(item|step)$/.test(sl.type || "") && !unit && val === String(sl.ord) && !nb.value, pr = ordinal ? null : K.proof(ctx, false), nl = kit.label("numeral", 0, val), L = [nl];
    if (((sub === "waffle" || sub === "bar") && p == null) || (sub === "icon" && !(anchor.object || anchor.icon))) sub = "none";
    if (sub === "none" && pr && !pr.src && p != null) sub = "waffle";
    if (unit) L.push((ul = kit.label("title", 1, unit)));
    if (pr) L.push((cl = kit.label("chip", L.length, pr.text)));
    if (ctx.labelsOnly) return { el: null, boxes: [], labels: L };
    const x = kit.session({ ctx }), dna = x.dna, rtl = x.rtl, box = ctx.box || ctx.zone || { w: 852, h: 420 }, W = box.w, H = box.h, ox = box.x || 0, oy = box.y || 0, ew = K.ew(val);
    const uw = unit ? M.ceil(K.ew(unit) * 72) + 8 : 0, want = anchor.treatment ? /^(badge|sticker|giant)$/.test(anchor.treatment) : dna.container === "disc" && dna.mark === "outline", cap = M.floor(W * 0.7), chip = pr ? K.cw(pr) : 0;
    const lo = M.ceil((206 * K.ew(val, true)) / ew);
    const fit = (w, h, bu) => {
      const rh = h - (pr ? 80 : 0);
      let best = { s: 0, u: 0, d: 0 };
      if (chip > w) return best;
      [0, 1].forEach((u) => {
        if ((u && (!unit || uw > w)) || (bu && !u && unit)) return;
        const uh = unit && u ? 96 : 0, d = M.min(w, rh - uh), v = M.floor(M.min(520, cap / ew, bu ? M.min(d * 0.85, (d * 0.72) / ew) : M.min((w - (unit && !u ? uw + 24 : 0)) / ew, (rh - uh) / 0.9)));
        if (v > best.s * 1.1) best = { s: v, u, d };
      });
      return best;
    };
    let lay, comp, row, cw, ch, burst;
    [[1, want], [1, 0], [0, want], [0, 0]].some((t, i) => {
      const use = t[0] && sub !== "none";
      let b = { l: { s: 0 }, w: W, h: H, c: null };
      (use ? (sub === "bar" ? [0] : [1, 0]) : [0]).forEach((rw) => {
        const c = use ? K.comp(sub, anchor, ctx, x, p, W, H, rw) : null, w = c ? (rw ? W - c.w - G : W) : W, h = c ? (rw ? H : H - c.h - G) : H, l = fit(w, h, t[1]);
        if (l.s > b.l.s) b = { l, c, rw, w, h };
      });
      ({ l: lay, c: comp, rw: row, w: cw, h: ch } = b); burst = t[1];
      return lay.s >= 280 || (i === 3 && lay.s >= lo);
    });
    if (lay.s < lo) return null;
    const S = lay.s, d = M.round(lay.d), nw = M.floor(S * ew), fh = M.round(S * 0.9), un = lay.u && unit ? 96 : 0, bh = burst ? d : fh, nbw = burst ? d : nw, y0 = (ch - bh - un - (pr ? 80 : 0)) / 2, cx = comp && row && rtl ? W - cw : 0;
    const bd = un || !unit ? 0 : uw + 24, l0 = cx + (cw - nbw - bd) / 2, nx = rtl ? l0 + bd : l0, kids = [], boxes = [], b = burst && K.burst(x, d);
    const B = (l, t, w, h, kind, o) => ({ x: ox + l, y: oy + t, w, h, kind, ...o }), put = (l, t, w, h, el, kind, o) => { kids.push(K.at(l, t, w, h, el)); boxes.push(B(l, t, w, h, kind, o)); };
    nl.el.setAttribute("style", K.sty(nw, fh, S, 0.9) + (b ? `color:${kit.on(b.fill, x.tk)};` : ""));
    if (b) { const bs = M.round(1.1 * (d / 2 - 10)); kids.push(K.at(nx, y0, d, d, b.el)); boxes.push(B(nx + (d - bs) / 2, y0 + (d - bs) / 2, bs, bs, "owner", { id: "b", fill: 1, border: b.bw })); }
    put(nx + (nbw - nw) / 2, y0 + (bh - fh) / 2, nw, fh, nl.el, "text", { anchor: true, ...(b && { ownerOf: "b" }) });
    if (ul) { ul.el.setAttribute("style", K.sty(uw, 96, 72, "96px")); put(un ? cx + (cw - uw) / 2 : rtl ? l0 : l0 + nbw + 24, un ? y0 + bh : y0 + (bh - 96) / 2, uw, 96, ul.el, "text"); }
    if (cl) { const cp = K.chip(x, pr, cl); put(cx + (cw - cp.w) / 2, y0 + bh + un + 24, cp.w, 56, cp.el, "text"); }
    const out = [K.div({ position: "absolute", left: 0, top: 0, width: W, height: H }, kids, { "data-part": "figure" })];
    if (comp) {
      const bx = row ? (rtl ? 0 : W - comp.w) : (W - comp.w) / 2, by = row ? (H - comp.h) / 2 : ch + G;
      out.push(K.at(bx, by, comp.w, comp.h, comp.el));
      boxes.push(B(bx, by, comp.w, comp.h, "ink"));
    }
    return { el: kit.wrap("numeral", `${x.seed}|${ctx.slideId || ""}`, out, { style: { position: "relative", width: W, height: H } }), boxes, labels: L };
  };
  art.register("numeral", build, ["none", "waffle", "bar", "icon"]);
})();

  /* ---- file: chart-more.js ---- */
/* src/art/chart-more.js - owned by A7 - stub */

  /* ---- file: rows.js ---- */
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

  /* ---- file: field.js ---- */
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

  /* ---- file: marks.js ---- */
/* src/art/marks.js - owned by A9. CS.art.marks: the cs-art-marks library as geometry (px, rounded to 0.5) and painter-safe nodes (spec 3.5). Text-bound marks: CS.visual.settle; anchor-bound:
 * make(id, {x,y,w,h} | {from,to}, ctx, {form,color,rot,bow}) -> { el, rec, box } | null; entry { id, f: line|brush|fill, d, w, c: colour role, k, A: ink px2 }. */
(function () {
  var kit = CS.art.kit, M = (CS.art.marks = {}), Z = Math, D = Z.PI / 180;
  function R(v) { return Z.round(v * 2) / 2; }
  function P(p) { return R(p[0]) + " " + R(p[1]); }
  function hy(a, b) { return Z.hypot(b[0] - a[0], b[1] - a[1]); }
  M.lib = function (c) { var V = CS.visual; return (c && c.data && c.data.marks) || (V && V._.block("cs-art-marks")) || null; };
  function parse(d) {
    var t = d.match(/[MLCZ]|-?\d*\.?\d+/g), i = 0, s = [], c, k, n, a;
    while (i < t.length) {
      k = t[i++];
      if (k === "Z") c.z = 1;
      else { for (a = [], n = k === "C" ? 3 : 1; n--;) a.push([+t[i++], +t[i++]]); if (k === "M") s.push(c = { p: a[0], g: [] }); else c.g.push({ t: k, p: a }); }
    }
    return s;
  }
  function map(s, f) { return s.map(function (c) { return { p: f(c.p), z: c.z, g: c.g.map(function (q) { return { t: q.t, p: q.p.map(f) }; }) }; }); }
  function flat(c) {
    var o = [c.p], p = c.p;
    c.g.forEach(function (q) {
      var n = q.t === "L" ? 1 : 5, k, t, Q;
      for (k = 1; k <= n; k++) { for (t = k / n, Q = [p].concat(q.p); Q.length > 1;) Q = Q.slice(1).map(function (b, i) { return [Q[i][0] + (b[0] - Q[i][0]) * t, Q[i][1] + (b[1] - Q[i][1]) * t]; }); o.push(Q[0]); }
      p = q.p[q.p.length - 1];
    });
    return o;
  }
  function len(p) { return p.reduce(function (a, v, i) { return i ? a + hy(p[i - 1], v) : 0; }, 0); }
  function brush(p, w, f) {   // centreline widened by profile f
    var a = [], b = [], n = p.length, L = len(p) || 1, s = 0, i, j, u, h, x, y, m, v;
    for (i = 0; i < n; i++) {
      s += i ? hy(p[i - 1], p[i]) : 0;
      for (j = 1; j < f.length - 1 && s / L > f[j][0];) j++;
      u = Z.min(1, Z.max(0, (s / L - f[j - 1][0]) / (f[j][0] - f[j - 1][0] || 1))); h = w * (f[j - 1][1] + (f[j][1] - f[j - 1][1]) * u) / 2;
      v = p[Z.max(0, i - 1)]; x = p[Z.min(n - 1, i + 1)][0] - v[0]; y = p[Z.min(n - 1, i + 1)][1] - v[1]; m = Z.hypot(x, y) || 1;
      a.push([p[i][0] - y / m * h, p[i][1] + x / m * h]); b.push([p[i][0] + y / m * h, p[i][1] - x / m * h]);
    }
    return a.concat(b.reverse());
  }
  function poly(p) {
    var o = "M" + P(p[0]), x = R(p[0][0]), y = R(p[0][1]), i, a, b;
    for (i = 1; i < p.length; i++) { a = R(p[i][0]); b = R(p[i][1]); if (a !== x || b !== y) o += "l" + (a - x) + " " + (b - y); x = a; y = b; }
    return o + "z";
  }
  function area(p) { var s = 0, i, a, b; for (i = 0; i < p.length; i++) { a = p[i]; b = p[(i + 1) % p.length]; s += a[0] * b[1] - b[0] * a[1]; } return Z.abs(s) / 2; }
  M.jitter = function (seed, deck, k) {
    var r = kit.rng(seed + "|j"), g = kit.rng("hand|" + (deck || "")).sign();
    k = k || 1;
    return { rot: g * (0.3 + 0.7 * r()) * 3 * k, sc: 1 + (r() * 2 - 1) * 0.04, sk: g * (0.3 + 0.7 * r()) * 2 * k, dx: (r() * 2 - 1) * 6, dy: (r() * 2 - 1) * 6 };
  };
  /* place(template, target, ctx, {form, rtl, seed, deck, bow, rot, color, k}) -> entry; the deck fixes the lean */
  M.place = function (m, t, c, o) {
    o = o || {};
    var L = M.lib(c), F = m.form === "fill" ? "fill" : o.form === "brush" ? "brush" : "line", B = F === "brush", rt = B ? L.brush : L.line, j = M.jitter(o.seed || m.id, o.deck, t.w && Z.min(1, 4 * t.h / t.w)), d = "", A = 0, s = parse(m.d);
    var at, lim = 1, z, k, f, w, e, l, g, jc = Z.cos(j.rot * D) * j.sc, js = Z.sin(j.rot * D) * j.sc, jk = Z.tan(j.sk * D), rc = Z.cos((o.rot || 0) * D), rs = Z.sin((o.rot || 0) * D);
    if (m.fit === "pair") {
      e = [m.tip[0] - m.tail[0], m.tip[1] - m.tail[1]]; l = Z.hypot(e[0], e[1]) || 1; z = hy(t.from, t.to); at = t.to; lim = 0;
      g = Z.atan2(t.to[1] - t.from[1], t.to[0] - t.from[0]) - Z.atan2(e[1], e[0]);
      f = function (p) { var x = p[0] - m.tail[0], y = p[1] - m.tail[1], q = 2 * (x * e[0] + y * e[1]) / l / l; if (o.bow) { x = q * e[0] - x; y = q * e[1] - y; } return [t.from[0] + (x * Z.cos(g) - y * Z.sin(g)) * z / l, t.from[1] + (x * Z.sin(g) + y * Z.cos(g)) * z / l]; };
    } else {
      z = Z.sqrt(t.w * t.h); at = [t.x + t.w / 2, t.y + t.h / 2]; lim = Z.min(1, Z.min(t.w, t.h) / 50); g = m.aspect || 1;
      k = m.fit === "uniform" ? Z.min(t.w / (g >= 1 ? 100 : 100 * g), t.h / (g >= 1 ? 100 / g : 100)) : 0;
      f = function (p) { var x = o.rtl === false ? p[0] : 100 - p[0]; return k ? [at[0] + (x - 50) * k, at[1] + (p[1] - 50) * k] : [t.x + x * t.w / 100, t.y + p[1] * t.h / 100]; };
    }
    s = map(s, function (p) {
      var q = f(p), x = q[0] - at[0], y = q[1] - at[1];
      x += y * jk; q = [at[0] + x * jc - y * js + j.dx * lim, at[1] + x * js + y * jc + j.dy * lim];
      return [q[0] * rc - q[1] * rs, q[0] * rs + q[1] * rc];
    });
    w = Z.max(rt.wMin, Z.min(rt.wMax, z * rt.wRatio) * (m[B ? "bw" : "lw"] || 1));
    s.forEach(function (c) {
      var p = flat(c);
      if (B) { p = brush(p, w, m.profile || L.brush.profile); d += poly(p); A += area(p); }
      else { d += "M" + P(c.p) + c.g.map(function (v) { return v.t + v.p.map(P).join(" "); }).join("") + (c.z ? "Z" : ""); A += F === "line" ? w * len(p) : area(p); }
    });
    return { id: m.id, f: F, d: d, w: R(w), c: o.color || "accent", k: o.k || 0, A: Z.round(A) };
  };
  /* preset art.marks: the families or ids it draws (none = all); art.doodle marker or brush = brush marks */
  M.allow = function (art, m, want) {
    var l = art && art.marks;
    if (Array.isArray(l) && l.indexOf(m.family) < 0 && l.indexOf(m.id) < 0) return null;
    return want || (art && /marker|brush/.test(art.doodle) ? "brush" : "line");
  };
  M.pick = function (L, key, seed, art) {   // an id, or a family without its hand-placed cousins (open ring, cross, bracket, down, hook); only what the preset's art.marks allows, before the seeded choice
    var l = L.marks.filter(function (m) { return (m.id === key || m.family === key && !/cross|open|bracket|down|hook/.test(m.id)) && M.allow(art, m); });
    return l.length ? kit.rng(seed).pick(l) : null;
  };
  M.color = function (tk, role) {
    var p = kit.palette(tk), C = CS.core.color;
    return (role === "ink" ? [] : [p.accent, p.accent2, p.support[0], p.support[1]]).filter(function (c) { return C.contrast(c, p.bg) >= 3 && C.contrast(c, p.surface) >= 3; })[0] || p.ink;
  };
  M.nodes = function (e, tk) {
    var c = /^#[0-9a-f]{6}$/i.test(e.c || "") ? e.c : M.color(tk, e.c);
    return kit.path(e.d, Object.assign({ "data-mark": e.id }, e.f === "line" ? { fill: "none", stroke: c, "stroke-width": e.w, "stroke-linecap": "round", "stroke-linejoin": "round", pathLength: 1, "data-m": "stroke" } : { fill: c, "data-m": "decor-item" }));
  };
  M.layer = function (es, tk, W, H) {
    var s = kit.svg(W, H, es.map(function (e) { return M.nodes(e, tk); }), { class: "cs-marks", "data-m": "decor-item" });
    s.setAttribute("style", "position:absolute;left:0;top:0;pointer-events:none");
    return s;
  };
  /* At most 3 marks, 1 arrow, ink under 8%; sets k. */
  M.limit = function (es, zone) {
    var o = [], ar = 0, b, i;
    es.forEach(function (e) { var x = /^arrow/.test(e.id); if (o.length < 3 && !(x && ar)) { o.push(e); ar += x; } });
    while (o.length && o.reduce(function (a, e) { return a + e.A; }, 0) >= 0.08 * zone) { for (b = i = 0; ++i < o.length;) if (o[i].A >= o[b].A) b = i; o.splice(b, 1); }
    o.forEach(function (e, n) { e.k = n; });
    return { kept: o, dropped: es.length - o.length };
  };
  M.make = function (id, t, c, o) {
    var L = M.lib(c), seed = o?.seed || (c.slideId || "") + "|" + id, m = L && M.pick(L, id, seed, c.art), f = m && M.allow(c.art, m, o && o.form), e;
    if (!f) return null;
    e = M.place(m, t, c, Object.assign({ rtl: c.rtl, seed: (c.slideId || "") + "|" + id }, o, { form: f }));
    return { el: M.nodes(e, c.tokens), rec: e, box: Object.assign({ kind: "mark" }, t.from ? { x: Z.min(t.from[0], t.to[0]), y: Z.min(t.from[1], t.to[1]), w: Z.abs(t.to[0]-t.from[0]), h: Z.abs(t.to[1]-t.from[1]) } : t) };
  };
})();

  /* ---- file: word.js ---- */

(function () {
 var art = CS.art, kit = art.kit, h = kit.html, A = Object.assign, LH = 1.15, GAP = 24, BAR = 48, PAD = 30, word = (art.word = { support: { sticker: true } }), len = t => Array.from(t.replace(/\s+/g, "")).length;

 word.derive = function (s) {
  var m = /==([^=]+)==|\*([^*]+)\*/.exec([s.headline, s.title, s.quote, s.sub, s.body].join("\n")), n = s.number || {};
  return s.type === "cta" && s.cta?.keyword || s.em || (m ? (m[1] || m[2]).trim() : n.value ? (n.value + " " + (n.unit || "")).trim() : String(s.title || s.headline || "").split(/\s+/).filter(t => !/^(عايز|عاوز|محتاج|احفظ|ابعت|لازم|the|and|your|this|with|want|save|send)$/i.test(t)).sort((a, b) => b.length - a.length)[0] || "");
 };
 function cut(t) {
  var m = t.length / 2, b = 0;
  t.replace(/[^\S\u00a0]+/g, (_, p) => { if (!/[0-9٠-٩۰-۹][%٪]?$/.test(t.slice(0, p))) b = !b || Math.abs(p - m) < Math.abs(b - m) ? p : b; });
  return b ? [t.slice(0, b), t.slice(b).trim()] : [t];
 }
 function put(l, st) { l.el.setAttribute("style", h("i", null, st).getAttribute("style")); return l.el; }

 function build(a, ctx) {
  var text = String(a.word || word.derive(ctx.slide || {})).trim(), sty = a.wordStyle || "solid", x = kit.session({ ctx: ctx }), tk = x.tk, dna = x.dna, sg = x.rtl ? -1 : 1, box = ctx.box || ctx.zone || { w: 852, h: 420 };
  if (!text) return null;
  var stk = sty === "sticker" && word.support.sticker, tile = sty === "sticker" && !stk, kb = !stk && ((ctx.visual || {}).marks || []).indexOf("kashida") >= 0, n = len(text), ln = /\s/.test(text) && n > 6 ? 2 : 1, lines = sty === "struck" && ln > 1 ? cut(text) : [text], two = lines.length > 1;
  var rx = stk ? PAD : tile ? 52 : sty === "struck" ? 16 : 0, ry = stk ? PAD : tile ? 32 : 0, avail = Math.min(852, box.w) - 2 * rx, extra = kb ? GAP + BAR : 0, S = Math.min(ln > 1 ? 360 : 520, Math.floor((box.h - 2 * ry - extra) / (ln * LH)), two ? Math.max(220, Math.floor(avail / Math.max(...lines.map(len)))) : 520);
  var labels = lines.map((t, i) => kit.label("word", i, t)), paper = tk.paper, i;
  for (i = 1; stk && i < 3; i++) labels.push(kit.label("word", i, text, { "aria-hidden": "true", "data-decor": "1" }));
  if (ctx.labelsOnly) return { el: null, boxes: [], labels: labels };
  if (S < 220 || avail < 220) return null;
  var base = { "font-size": S, "line-height": LH, "text-align": "center", "--cs-fit-ratio": (S / 520).toFixed(4), "white-space": ln > 1 && !two ? "normal" : null };
  var kids = lines.map((_, i) => put(labels[i], A({ position: "relative", color: tile ? kit.on(paper, tk) : tk.ink }, base))), wrap, w2 = { position: "relative", display: "inline-block", "max-width": avail, "margin-bottom": extra || null };
  var em = 0.58 * Math.ceil(n / ln), Se = Math.min(S, Math.floor(avail / em)), th = Math.round(ln * Se * LH), tw = Math.min(avail, Math.round(em * Se)), y0 = (box.y || 0) + (box.h - th - extra) / 2;
  var boxes = [{ x: (box.x || 0) + (box.w - tw) / 2, y: y0, w: tw, h: th, kind: "text", anchor: true }];
  if (stk) {
   var r = Math.max(6, Math.round(S / 36)), dx = sg * Math.max(dna.shadow.dx, Math.round(S / 40)), dy = Math.max(dna.shadow.dy, Math.round(S / 32));
   var lay = (l, c, ox, oy) => put(l, A({ position: "absolute", left: ox, top: oy, width: "100%", color: c, "-webkit-text-stroke": 2 * r + "px " + c }, base));
   wrap = h("div", { "data-part": "word" }, { position: "relative", width: avail }, [lay(labels[2], tk.ink, dx, dy), lay(labels[1], CS.core.color.contrast(tk.accent, tk.ink) >= 1.5 ? tk.accent : paper, 0, 0), kids[0]]);
  } else {
   var bw = dna.outline || 4, rec = (((ctx.data || {}).marks || {}).marks || []).find(m => m.id === "kashida-bar");
   if (sty === "struck") kids.forEach(k => k.setAttribute("data-mark-target", "strike-line"));
   if (kb && rec) {
    var s = kit.svg(100, 100, kit.g(kit.path(rec.d, { fill: kit.base(tk, tk.bg, false) }), x.rtl ? { transform: "matrix(-1 0 0 1 100 0)" } : null), { width: "100%", height: "100%" });
    s.setAttribute("preserveAspectRatio", "none");
    kids.push(h("div", { "data-part": "kashida" }, { position: "absolute", left: "7.5%", width: "85%", top: "100%", "margin-top": GAP, height: BAR }, s));
   }
   if (tile) {
    A(w2, { "box-sizing": "border-box", padding: "20px 40px", "background-color": paper, border: bw + "px solid " + tk.ink, "border-radius": dna.radius.card, "box-shadow": sg * 6 + "px 6px 0 " + tk.ink });
    boxes[0].ownerOf = "t"; boxes.unshift({ x: boxes[0].x - 40, y: y0 - 20, w: tw + 80, h: th + 40, kind: "owner", id: "t", fill: 1, border: bw });
   }
   wrap = h("div", { "data-part": "word" }, w2, kids);
   if (tile) kit.owner(wrap);
  }
  return { el: kit.wrap("word", x.seed, wrap, { style: { display: "flex", "flex-direction": "column", "align-items": "center", "justify-content": "center", "box-sizing": "border-box", width: box.w, height: box.h } }), boxes: boxes, labels: labels };
 }
 art.register("word", build, ["solid", "sticker", "struck"]);
})();

  /* ---- file: frames.js ---- */
/* src/art/frames.js - owned by A11 - stub */

  /* ---- file: pattern.js ---- */
/* src/art/pattern.js - owned by A11 - stub */

  /* ---- file: bg.js ---- */
/* src/art/bg.js - owned by A11 - stub */
})();
