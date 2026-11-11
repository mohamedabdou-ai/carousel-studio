/*! Carousel Studio runtime chunk cs-visual.js · cs-1.1.1 · Apache-2.0 */
(function () {
  "use strict";
  var CS = (window.CS = window.CS || {});
  /* ---- file: root.js ---- */
/* src/visual/root.js - owned by F3. CS.visual (IS-2): members arrive through _.register; the hooks below are
 * no-op defaults that hooks.js (E2a) and settle.js (A9) replace. */
(function () {
  var V = (CS.visual = CS.visual || {}), cache = Object.create(null), none = function () { return null; };
  V.version = "1.1.0";
  V._ = V._ || {};
  V._.errors = {};

  /** Parsed JSON block (cs-icon-pack ...) or null. Node tests set V._.blocks = { id: value }, which wins. */
  V._.block = function block(id) {
    var shim = V._.blocks, reg = CS.core && CS.core.registry;
    if (shim && Object.prototype.hasOwnProperty.call(shim, id)) return shim[id];
    if (!(id in cache)) {
      cache[id] = null;
      try { if (reg && typeof document !== "undefined") cache[id] = reg.readBlock(document, id); }
      catch (e) { V._.errors[id] = String(e.message || e); }
    }
    return cache[id];
  };
  V._.reset = function reset() { cache = Object.create(null); V._.errors = {}; };
  V._.register = function register(name, member) {
    if (typeof name !== "string" || !/^[a-z][A-Za-z0-9]*$/.test(name) || name === "version") throw new Error("CS.visual: bad member " + name);
    return (V[name] = member);
  };

  V.fill = none;
  V.decorate = function () {};
  V.chrome = function () { return { rail: null, motif: null }; };
  V.settle = function () { return { marks: [] }; };
  V.expected = none;
  V.autoPreview = function () { return []; };
})();

  /* ---- file: api.js ---- */
/* C1: guarded art API and DOM-free slice capabilities. */
(function () {
  function A() { return CS.art || null; }
  CS.visual._.register("art", {
    caps: function () { var a = A(); return a ? a.caps() : { v: 1, art: {} }; },
    has: function (kind, sub) { var a = A(); return !!(a && a.has(kind, sub)); },
    kinds: function () { var a = A(); return a ? a.kinds() : []; },
    build: function (anchor, ctx) { var a = A(); return a ? a.build(anchor, ctx) : null; },
    icon: function (name, o) { var a = A(); return a && a.icon ? a.icon(name, o) : null; },
    object: function (id, o) { var a = A(); return a && a.object ? a.object(id, o) : null; },
    measure: function (o) { var a = A(); return a && a.icon ? a.icon.measure(o) : null; }
  });
  
  CS.visual.caps = function caps() {
    var c = CS.visual.art.caps();
    c.recipes = ["under", "over", "full", "center"];
    c.variants = { stat: ["icon", "chart"], compare: ["table", "before-after"], quote: ["statement"], rehook: ["statement"], step: ["track"], cta: ["action"], item: ["numeral"], grid: ["bento"], timeline: ["rail"] };
    c.types = "cover rehook item step stat compare myth-fact quote story-beat checklist summary setup proof share cta offer testimonial poster grid timeline".split(" ");
    c.tones = ["base", "invert", "field"];
    c.hash = CS.core.canon.fnv1a64(CS.core.canon.canonicalJSON(c));
    return c;
  };
})();

  /* ---- file: hooks.js ---- */
(function(){
var V=CS.visual,C=CS.core,M=new WeakMap,B=new WeakMap,X;
function e(c,t){var n=document.createElement(t||"div");if(c)n.className=c;return n}
function F(v){if(v&&typeof v==="object"){Object.values(v).forEach(F);Object.freeze(v)}return v}
function build(c,l){var b=CS.art?.build?.(c.v.anchor,{...c.a,box:c.box,labelsOnly:!!l});
if(b&&c.tokens.presetId==="poster"&&/^(icon|field):icon$/.test(kind(c))){var n=e("cs-figure"),t=(c.lang==="ar"?"شكل ":"Fig. ")+(c.index+1);(b.labels||=[]).push({el:n,text:t,role:"chip",index:b.labels.length});if(!l)b.el.appendChild(n)}
if(b&&!l){c.anchorMin=b.minHeight;(b.labels||[]).forEach(l=>C.compose.label(l.el,l.text,c,l))}return b}

var OWN={"field:panel":["sides"],"rows:list":["bullets","items"],"mock:chat":["number"],"mock:notes":["number","bullets","items"]},
NUM=/^(numeral:|field:numeral$)/,SEL=".cs-side-label,.cs-side-text,.cs-bullet,[data-part=title],[data-part=text],[data-part=value],.cs-num,.cs-unit",MARK=/^(circle|underline|strike|arrow)(-|$)/;
function W(s){return String(s??"").normalize("NFC").replace(/[\u064B-\u065F\u0670\u0640]/g,"").replace(/[\u0660-\u0669\u06F0-\u06F9]/g,d=>d.charCodeAt(0)&15).replace(/[\u066A\uFE6A\uFF05]/g,"%").toLowerCase().match(/[\p{L}\p{N}]+|[%\u2030\u00B0\p{Sc}\p{Sm}]/gu)||[]}
function kind(c){var a=c.v.anchor,s=a&&CS.art?._?.sub?.(a);return a&&s!==undefined?a.kind+":"+s:""}
function nat(n){var a=[...n.querySelectorAll(SEL)];return(a.length?a:[n]).map(x=>x.textContent)}
function has(t,x){var n=W(x).join(" ");return!n||(/^\d/.test(n)?(" "+t+" ").includes(" "+n+" "):t.includes(n))}
function take(c,n){var d=c.d.join(" "),t=W(d).join(" "),s=new Set(W(d)),m=c.slide.number||{};
return/^mock:/.test(kind(c))&&n.dataset.slot==="number"?[m.value,m.unit].every(x=>has(t,x)):nat(n).every(x=>W(x).every(w=>s.has(w)))}
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
B.set(p,c.brand);var R=C.freeze.visual;if(c.opts.frozenOk){var f=R.get(c.id,p.frozen);c.box=f.anchor||c.box;
// A frozen native fallback has neither a measured anchor nor any art labels.
if(!f.anchor&&!Object.keys(p.frozen.sizes||{}).some(k=>k.startsWith(c.id+'.art.')))c.v={...c.v,anchor:{kind:'none'}};}
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
// A word may replace a complete side label, never its surrounding sentence.
if(sl&&c.d&&/^(word:|field:word$)/.test(k)){var label=[...r.querySelectorAll('.cs-side-label')].find(n=>c.d.some(t=>W(t).join(" ")===W(n.textContent).join(" ")));if(label){c.o.push({n:label,p:label.parentNode,x:label.nextSibling});label.remove()}}
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
// Prediction cannot guarantee that a display word or plate fits the real font.
// If the measured composition fails at its floors, restore the native slots.
// A demo has no native twin, so its mock must stay and report a genuine failure.
V.anchorFit=(r,report,o)=>{var m=r.querySelector('.cs-content'),c=M.get(m),n=r.querySelector('.cs-anchor-slot');
if(o.frozen||report.ok||!c||!n||c.slide.demo?.lines?.length&&/^mock:/.test(kind(c)))return false;
back(c,r);n.remove();delete m.dataset.recipe;delete r.dataset.anchorKind;
r.querySelectorAll('[data-widened]').forEach(n=>{n.style.removeProperty('inline-size');delete n.dataset.widened});
C.freeze.visual.set(c.id,null);return true;
};
V.verify=(p,t,b)=>{B.set(p,b);X={p,t};try{return C.freeze.verify(p,t)}finally{X=null}};
V.expected=(p,key)=>{var m=/^(s\d+)\.art\.(\d+)$/.exec(key),s=m&&p.slides.find(x=>x.id===m[1]);if(!s)return null;
var t=C.resolve.slide(X?.p===p?X.t:C.resolve.post(p,B.get(p)),s),c=C.compose.context(p,s,t,B.get(p),{labelsOnly:true});
V.begin(c);return(c.v.anchor&&build(c,true)?.labels?.find(x=>x.index===+m[2])?.text)??null;
};
})();

  /* ---- file: stem.js ---- */
/* src/visual/stem.js - owned by D3. Arabic fold, tokens and the light dialect stemmer of spec 3.1. Every table is data (block cs-icon-stem). */
(function () {
  var V = CS.visual, MARK = /[\u0640\u064B-\u065F\u0670]/g, memo = null, memoKey = null;
  var FROM = "\u0623\u0625\u0622\u0671\u0649\u0629\u0624\u0626\u06A9\u06CC\u06A4\u067E", TO = "\u0627\u0627\u0627\u0627\u064A\u0647\u0648\u064A\u0643\u064A\u0641\u0628";

  function fold(s) {
    return s.replace(MARK, "").replace(/[\u0623\u0625\u0622\u0671\u0649\u0629\u0624\u0626\u06A9\u06CC\u06A4\u067E]/g, function (c) { return TO.charAt(FROM.indexOf(c)); });
  }
  /** Tokens of a text: [{n: folded lower-case token, r: the token as typed without tashkeel}]. Digits are Western; marks and bidi controls vanish. */
  function tok(text) {
    var s = String(text == null ? "" : text).normalize("NFKC").replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF\u061C]/g, "")
      .replace(/[\u0660-\u0669\u06F0-\u06F9]/g, function (c) { return String(c.charCodeAt(0) & 15); });
    var m = s.match(/[0-9A-Za-z\u0621-\u063A\u0640-\u065F\u0670\u0671\u067E\u06A4\u06A9\u06CC]+/g) || [], out = [], i, r, n;
    for (i = 0; i < m.length; i++) { r = m[i].replace(MARK, ""); n = fold(r).toLowerCase(); if (n) out.push({ n: n, r: r }); }
    return out;
  }
  function norm(text) { return tok(text).map(function (t) { return t.n; }).join(" "); }

  function words(s) { return s ? String(s).split(" ") : []; }
  function tbl() {
    var raw = V._.block("cs-icon-stem"), b = raw || {}, t;
    if (memo && memoKey === raw) return memo;
    t = { raw: b, art: words(b.art), prep: words(b.prep), asp: words(b.asp), per: words(b.per), suf: words(b.suf), pl: words(b.pl), br: Object.create(null), stop: Object.create(null) };
    words(b.br).forEach(function (x) { var p = x.split(">"); t.br[p[0]] = p[1]; });
    words(b.stop).forEach(function (x) { t.stop[x] = 1; });
    memoKey = raw;
    return (memo = t);
  }

  /* One stripping step. node = [word, stage, usedBits]; a step is allowed when its stage is not below the node's stage and its bit is unused,
     so the order is article/preposition, aspect prefix, person prefix, suffix, plural. A strip keeps three letters, the article two (al-sirr, the secret). */
  function steps(node, T, d) {
    var w = node[0], g = node[1], m = node[2], L = w.length, r = [], i, p, at, x;
    function add(y, s, b, mn) { if (y.length >= (mn || 3)) r.push([y, s, m | b]); }
    function pre(list, s, b, alif, mn) {
      if (g > s || (m & b)) return;
      for (i = 0; i < list.length; i++) {
        p = list[i]; at = p.indexOf("@");
        if (at > 0) { if (d && d !== "auto" && p.slice(at + 1) !== d) continue; p = p.slice(0, at); }
        if (L - p.length >= (mn || 3) && w.indexOf(p) === 0) {
          x = w.slice(p.length); add(x, s, b, mn);
          if (alif && x.charAt(0) !== "\u0627") add("\u0627" + x, s, b);
        }
      }
    }
    pre(T.art, 1, 1, 0, 2); pre(T.prep, 1, 2); pre(T.asp, 2, 4); pre(T.per, 3, 8, 1);
    if (g <= 4 && !(m & 16)) for (i = 0; i < T.suf.length; i++) {
      p = T.suf[i];
      if (L - p.length >= 3 && w.slice(L - p.length) === p) { x = w.slice(0, L - p.length); add(x, 4, 16); if (x.slice(-1) === "\u062A") add(x.slice(0, -1) + "\u0647", 4, 16); }
    }
    if (g <= 5 && !(m & 32)) for (i = 0; i < T.pl.length; i++) {
      p = T.pl[i];
      if (L - p.length >= 3 && w.slice(L - p.length) === p) { x = w.slice(0, L - p.length); add(x + "\u0647", 5, 32); add(x, 5, 32); }
    }
    if (g <= 5 && !(m & 64) && T.br[w]) add(T.br[w], 5, 64);
    return r;
  }

  /** Stem candidates of one folded token, the token itself first, then by number of strips (breadth first); at most 40. */
  function cands(w, d) {
    var T = tbl(), out = [w], seen = Object.create(null), q = [[w, 0, 0]], k, j, o;
    seen[w] = 1;
    if (!/[\u0621-\u064A]/.test(w)) { if (w.length > 3 && w.charAt(w.length - 1) === "s") out.push(w.slice(0, -1)); return out; }
    for (k = 0; k < q.length && out.length < 40; k++) {
      o = steps(q[k], T, d);
      for (j = 0; j < o.length; j++) if (!seen[o[j][0]]) { seen[o[j][0]] = 1; out.push(o[j][0]); q.push(o[j]); }
    }
    return out;
  }
  /** The verb inside a bound negation: "ma" + verb + "sh" (or "m" + verb + "sh"), else null. */
  function negIn(n) {
    var m = /^\u0645\u0627(.{2,})\u0634$/.exec(n) || /^\u0645(.{3,})\u0634$/.exec(n);
    return m ? m[1] : null;
  }
  /** The token without its definite article (used by the stop list). */
  function base(w) {
    var A = tbl().art, i;
    for (i = 0; i < A.length; i++) if (w.length - A[i].length >= 2 && w.indexOf(A[i]) === 0) return w.slice(A[i].length);
    return w;
  }

  /** Every folded token of a query (string, field or list of fields) with its stem candidates: the cue words a homograph looks for. */
  function bag(q) {
    var b = Object.create(null);
    (Array.isArray(q) ? q : [q]).forEach(function (f) { tok(f && typeof f === "object" ? f.text : f).forEach(function (t) { cands(t.n).forEach(function (c) { b[c] = 1; }); }); });
    return b;
  }
  /** The sense of a homograph word: most cue words in the bag (the word's own variants do not count), else the first sense whose categories meet the topic, else the first. */
  function pick(ss, b, tp, skip) {
    var best = 0, hit = 0, bi = 99, i, j, c;
    for (i = 0; i < ss.length; i++) {
      c = ss[i].cues.filter(function (w) { return b[w] && skip.indexOf(w) < 0; }).length;
      if (c > hit) { hit = c; best = i; }
    }
    if (hit) return best;
    for (i = 0; i < ss.length; i++) for (j = 0; j < tp.length; j++) if (j < bi && ss[i].cats.indexOf(tp[j]) >= 0) { bi = j; best = i; }
    return best;
  }

  V._.stem = { fold: fold, tok: tok, norm: norm, cands: cands, negIn: negIn, base: base, tbl: tbl, bag: bag, pick: pick };
})();

  /* ---- file: icons.js ---- */
/* src/visual/icons.js - owned by D3. CS.visual.icons: the lookup ladder of spec 3.1 (integer scores 35 30 30 20, 75% for stems, 10, 5). Pure. */
(function () {
  var V = CS.visual, S = V._.stem, st = null, BITS = { eg: 1, gulf: 2, lev: 4, mag: 8, msa: 16, loan: 32 };

  function dict() { return Object.create(null); }
  function put(m, k, v) { (m[k] = m[k] || []).push(v); }
  function words(s) { return s ? String(s).split(" ") : []; }
  function lt(a, b) { return a < b ? -1 : a > b ? 1 : 0; }

  function build() {
    var b = V._.block, k = [b("cs-icon-pack"), b("cs-icon-index"), b("cs-icon-concepts"), b("cs-icon-stem")], T, K, H, list, w;
    if (st && st.k[0] === k[0] && st.k[1] === k[1] && st.k[2] === k[2] && st.k[3] === k[3]) return st;
    T = S.tbl(); H = T.raw.home || {};
    K = st = { k: k, T: T, P: (k[0] && k[0].icons) || {}, R: dict(), cp: dict(), ct: dict(), kp: dict(), kt: dict(), en: dict(), hk: dict(), hc: dict(), al: dict(), neg: dict(), def: T.raw.def || {} };
    (k[1] || []).forEach(function (r) { K.R[r[0]] = { name: r[0], cat: r[1], en: r[2] || [], ar: r[3] || [], fl: r[4] || {} }; });
    words(T.raw.neg).forEach(function (x) { var p = x.split("@"); K.neg[p[0].split("_").join(" ")] = p[1] || ""; });
    Object.keys(H).forEach(function (key) {
      K.hk[key] = H[key].map(function (s, i) { var c = words(s[0]); return { cats: c, cues: words(s[2]), c: { id: "home:" + key + ":" + i, cat: c[0], icons: words(s[1]), home: key } }; });
    });
    list = ((k[2] && k[2].concepts) || []).slice();
    w = T.raw.warn;
    if (w && !list.some(function (c) { return c.id === "warning"; })) list.push({ id: "warning", cat: "arrows-ui", pol: "warn", icons: words(w.i), forms: { msa: words(w.f) } });
    list = list.map(function (c) {
      var cf = dict(), dn;
      for (dn in BITS) (c.forms && c.forms[dn] || []).forEach(function (x) { var f = S.norm(x); if (f) cf[f] = (cf[f] || 0) | BITS[dn]; });
      return [c, cf, c.home && S.norm(c.home)];
    });
    list.forEach(function (x) {
      var h = x[2];
      if (!h || !K.hk[h]) return;
      put(K.hc, h, x[0]);
      Object.keys(x[1]).forEach(function (f) { if (f.indexOf(" ") < 0 && f !== h && S.cands(f).indexOf(h) > 0) { K.al[f] = h; K.hk[f] = K.hk[h]; } });
    });
    list.forEach(function (x) {
      Object.keys(x[1]).forEach(function (f) { if (f.indexOf(" ") > 0) put(K.cp, f, [x[0], x[1][f]]); else if (!K.hk[f]) put(K.ct, f, [x[0], x[1][f]]); });
    });
    Object.keys(K.R).forEach(function (n) {
      var r = K.R[n];
      r.ar.forEach(function (x) { var f = S.norm(x); if (f.indexOf(" ") > 0) put(K.kp, f, n); else if (f && !K.hk[f]) put(K.kt, f, n); });
      r.en.concat(n.indexOf("-") < 0 || /^(?:cs|tb)-/.test(n) ? [] : [n]).forEach(function (x) { var f = S.norm(x); if (f) put(K.en, f, n); });
    });
    return K;
  }

  function topics(t) { return t ? (typeof t === "string" ? [t] : t.slice()) : []; }
  function negOk(K, key, d) { var v = K.neg[key]; return v !== undefined && (!v || !d || d === "auto" || v === d); }
  function combos(lists) {
    var out = [""];
    lists.forEach(function (c) { var nx = []; out.forEach(function (p) { c.forEach(function (x) { nx.push(p ? p + " " + x : x); }); }); out = nx; });
    return out;
  }
  function firstOf(a, fn) { var i; for (i = 1; i < a.length; i++) if (fn(a[i])) return a[i]; return null; }

  /* Ladder hits {k: c|i, ref, r: rung, s: score, fi, i, e, f: form, rw: as typed, a: dialect, n: negated}. */
  function scan(q, o) {
    var K = build(), T = K.T, d = o.dialect, db = BITS[d] ? BITS[d] | 48 : 0, tp = topics(o.topic), H = [], N = [], bag = S.bag(q);
    (Array.isArray(q) ? q : [q]).forEach(function (fld, fi) {
      var f = fld && typeof fld === "object" ? { text: fld.text, w: fld.w == null ? 100 : fld.w } : { text: fld, w: 100 };
      var tk = S.tok(f.text), n = tk.length, cm = dict(), i, l, ph, t, cc, A, B, a, b;
      function cs(x) { return cm[x] || (cm[x] = S.cands(x, d)); }
      function add(kind, ref, rung, base, bits) {
        var s = Math.floor(base * f.w / 100);
        if (s > 0) H.push({ k: kind, ref: ref, r: rung, s: s, fi: fi, i: i, e: i + l - 1, f: ph, a: bits & db ? 1 : 0, rw: tk.slice(i, i + l).map(function (x) { return x.r; }).join(" ") });
      }
      function adds(list, kind, rung, base) {
        (list || []).forEach(function (x) { if (kind === "c") add("c", x[0], rung, base, x[1]); else add("i", x, rung, base, 0); });
      }
      function sense(key, rung, base) {
        var ss = K.hk[key], hc = K.hc[K.al[key] || key] || [], s = ss[S.pick(ss, bag, tp, cs(K.al[key] || key))], c = s.c, j;
        for (j = 0; j < hc.length; j++) if (s.cats.indexOf(hc[j].cat) >= 0) { c = hc[j]; break; }
        add("c", c, rung, base, 0);
      }
      for (i = 0; i < n; i++) {
        if (S.negIn(tk[i].n)) { tk[i].n = S.negIn(tk[i].n); N.push({ fi: fi, at: i, end: i, own: 1 }); }
        else if (negOk(K, tk[i].n, d)) { tk[i].x = 1; N.push({ fi: fi, at: i, end: i }); }
        else if (i + 1 < n && negOk(K, tk[i].n + " " + tk[i + 1].n, d)) { tk[i].x = tk[i + 1].x = 1; N.push({ fi: fi, at: i, end: i + 1 }); i++; }
      }
      for (i = 0; i < n; i++) tk[i].s = tk[i].x || tk[i].n.length < 2 || T.stop[tk[i].n] || T.stop[S.base(tk[i].n)];
      for (i = 0; i < n; i++) for (l = Math.min(3, n - i); l > 0; l--) {
        ph = tk.slice(i, i + l).map(function (x) { return x.n; }).join(" ");
        adds(K.en[ph] || (l === 1 && K.en[cs(ph)[1]]), "i", 6, 10);
        if (l > 1) {
          adds(K.cp[ph], "c", 1, 35); adds(K.kp[ph], "i", 3, 30);
          if (!K.cp[ph] && !K.kp[ph]) {
            combos(tk.slice(i, i + l).map(function (x) { return cs(x.n).slice(0, 4); })).slice(1).forEach(function (p) { adds(K.cp[p], "c", 5, 26); adds(K.kp[p], "i", 5, 22); });
          }
        } else if (!tk[i].s) {
          t = tk[i].n; cc = cs(t); A = K.ct[t]; B = K.kt[t];
          if (K.hk[t]) sense(t, 2, 30);
          adds(A, "c", 2, 30); adds(B, "i", 4, 20);
          if (!K.hk[t] && !A && !B) {
            a = firstOf(cc, function (c) { return K.ct[c] || K.hk[c]; });
            b = firstOf(cc, function (c) { return K.kt[c]; });
            if (a && K.hk[a]) sense(a, 5, 22); else adds(K.ct[a], "c", 5, 22);
            adds(K.kt[b], "i", 5, 15);
          }
        }
      }
    });
    /* A negation marks the hits of the nearest word after it (3 tokens at most), else before it; a bound one marks its own. */
    N.forEach(function (m) {
      var best = null, bd = 99;
      H.forEach(function (h) {
        var x;
        if (h.fi !== m.fi || (h.k === "c" && h.ref.pol)) return;
        x = m.own ? (h.i <= m.at && h.e >= m.at ? 0 : 99) : h.i > m.end && h.i - m.end <= 3 ? h.i - m.end : h.e < m.at && m.at - h.e <= 3 ? 10 + m.at - h.e : 99;
        if (x < bd || (x === bd && best && h.s > best.s)) { bd = x; best = h; }
      });
      if (best) H.forEach(function (h) { if (h.fi === best.fi && h.i === best.i) h.n = 1; });
    });
    return H;
  }

  /* One entry per concept (best hit, support), best first. */
  function ranked(H) {
    var by = dict(), arr = [];
    H.forEach(function (h) {
      var e;
      if (h.k !== "c") return;
      e = by[h.ref.id] || (by[h.ref.id] = { c: h.ref, s: 0, r: 9, g: 1e9, sup: 0, a: 0, rw: "", neg: false });
      if (!e.sup) arr.push(e);
      e.sup++; e.a = e.a || h.a; e.neg = e.neg || !!h.n;
      if (h.s > e.s || (h.s === e.s && h.fi * 1000 + h.i < e.g)) { e.s = h.s; e.r = h.r; e.g = h.fi * 1000 + h.i; e.rw = h.rw; }
    });
    return arr.sort(function (a, b) { return b.s - a.s || b.neg - a.neg || b.sup - a.sup || b.a - a.a || a.g - b.g || lt(a.c.id, b.c.id); });
  }

  function find(q, o) {
    var K, H, cs, cand = dict(), arr = [], ex = dict(), k, pol, j;
    o = o || {}; K = build(); H = scan(q, o); cs = ranked(H); k = o.k > 0 ? o.k : 5;
    (o.exclude || []).forEach(function (n) { ex[n] = 1; });
    function upd(n, s, r, src, rank, c, sup, via, a, ng, g) {
      var e = cand[n];
      if (!e) { e = cand[n] = { name: n, s: -1, src: 9, rank: 99, sup: 0 }; arr.push(e); }
      e.sup += sup;
      if (s > e.s || (s === e.s && (src < e.src || (src === e.src && rank < e.rank)))) { e.s = s; e.r = r; e.src = src; e.rank = rank; e.c = c; e.via = via; e.a = a; e.ng = ng; e.g = g; }
    }
    cs.forEach(function (e) { (e.c.icons || []).forEach(function (n, i) { upd(n, e.s, e.r, 0, i, e.c, e.sup, e.rw, e.a, e.neg, e.g); }); });
    H.forEach(function (h) { if (h.k === "i") upd(h.ref, h.s, h.r, h.r === 6 ? 2 : 1, 0, null, 1, h.rw, h.a, !!h.n, h.fi * 1000 + h.i); });
    topics(o.topic).forEach(function (cat) { words(K.def[cat]).forEach(function (n) { if (!(K.R[n] && K.R[n].fl.o)) upd(n, 5, 7, 3, 0, null, 0, cat, 0, false, 0); }); });
    pol = cs.some(function (e) { return e.c.pol; });
    arr = arr.filter(function (e) {
      var row = K.R[e.name], fl = row ? row.fl : {};
      if (ex[e.name] || (!row && !K.P[e.name]) || (o.hero && fl.d === "h")) return false;
      for (j = 0; j < (o.avoid || []).length; j++) if (fl[o.avoid[j]]) return false;
      e.fp = pol && fl.p ? 0 : 1;
      return true;
    }).sort(function (a, b) { return a.fp - b.fp || b.s - a.s || b.ng - a.ng || b.sup - a.sup || a.src - b.src || a.rank - b.rank || b.a - a.a || a.g - b.g || lt(a.name, b.name); });
    if (o.avoidCat && arr.length > 1 && K.R[arr[0].name] && K.R[arr[0].name].cat === o.avoidCat) {
      for (j = 1; j < arr.length && arr[j].s >= arr[0].s - 5; j++) if (!K.R[arr[j].name] || K.R[arr[j].name].cat !== o.avoidCat) { arr.unshift(arr.splice(j, 1)[0]); break; }
    }
    return arr.slice(0, k).map(function (e) {
      var c = e.c, row = K.R[e.name], t = K.T.raw.why || {}, tpl = t[o.dialect] || t.msa;
      return {
        name: e.name, score: e.s, rung: e.r, concept: c ? c.id : null, cat: row ? row.cat : null, via: e.via, neg: !!e.ng, primitive: c && c.primitive || null, object: c && c.object || null,
        why: tpl ? tpl.split("{n}").join(row && row.en[0] || e.name).split("{w}").join(e.via.slice(0, 30)) : ""
      };
    });
  }

  function concepts(q, o) {
    return ranked(scan(q, o || {})).map(function (e) {
      var c = e.c;
      return { id: c.id, cat: c.cat, score: e.s, rung: e.r, icons: c.icons || [], object: c.object || null, primitive: c.primitive || null, pol: c.pol || null, neg: e.neg, via: e.rw };
    });
  }
  /** The deck topic: up to two categories of the strongest concepts (homograph senses do not vote). */
  function topic(q, o) {
    var sum = dict(), cats = [];
    ranked(scan(q, o || {})).forEach(function (e) { if (e.c.home) return; if (!(e.c.cat in sum)) { sum[e.c.cat] = 0; cats.push(e.c.cat); } sum[e.c.cat] += e.s; });
    return cats.sort(function (a, b) { return sum[b] - sum[a] || lt(a, b); }).slice(0, 2);
  }
  /** The find entry of one icon for a query (name, rung, score, concept, via, why) or null. */
  function explain(name, q, dialect) {
    var r = find(q, { dialect: dialect, k: 999 }), i;
    for (i = 0; i < r.length; i++) if (r[i].name === name) return r[i];
    return null;
  }
  function has(name) { var K = build(); return !!(K.R[name] || K.P[name]); }
  function meta(name) {
    var K = build(), r = K.R[name], p = K.P[name];
    return r || p ? { name: name, cat: r ? r.cat : null, en: r ? r.en : [], ar: r ? r.ar : [], flags: r ? r.fl : {}, f: p && p.f || [], s: p && p.s || [] } : null;
  }
  /** Path elements in the 24 box: solid dots take o.ink, closed paths o.tint. */
  function markup(name, o) {
    var p = build().P[name], out = [], i;
    o = o || {};
    if (!p) return null;
    for (i = 0; i < p.d.length; i++) out.push('<path d="' + p.d[i] + '"' + ((p.s || []).indexOf(i) >= 0 ? ' fill="' + (o.ink || "currentColor") + '" stroke="none"' : o.tint && (p.f || []).indexOf(i) >= 0 ? ' fill="' + o.tint + '"' : "") + "/>");
    return out.join("");
  }

  V._.register("icons", { has: has, markup: markup, meta: meta, find: find, concepts: concepts, explain: explain, topic: topic });
})();

  /* ---- file: space.js ---- */
/* src/visual/space.js - owned by V1b. CS.visual.deadSpace(boxes, zone, opts): the dead-space measure of the planner, the sketch and the gates (spec 7.1-7.2).
 * UNITS: lengths px (body-zone origin); results band, rect, fill, anchorShare, owners[].rows|cols are PERCENT 0-100 to one decimal (band of the 1440 canvas
 * height, the rest of the zone); opts occ min big bigShare fill are percent (65; 0.65 reads as 65, so 1 is 100); halos, border px; box.fill an OPACITY 0-1.
 * Box {x, y, w, h, kind: text|ink|owner|pattern|image|mark|decor (else ink), id?, ownerOf? (id of its owner), fill?, border?, anchor? (true|false overrides:
 * every kind but text is an anchor), path? ([[x, y], ...]: a 48 px ink box per 32 px), ground?, ghost?, lettermark?, contrast? (< 0.35 never counts)}.
 * An owner (owner|pattern) owns its interior only if fill >= 35% opacity or border >= 3 px AND 65% (80% above 60% of the zone) of its rows AND columns hold
 * content. opts.strict (default true): no valid fill and no valid border = not an owner; strict:false lets it qualify. owners[]: {id, rows, cols, ok, need,
 * meta "ok"|"weak"|"none"}. 36 x 37 grid, 4 x 4 samples, 30% occupied, integers: _cs/space.py agrees to the cell. opts: flat keys or nested grid/halo/owner. */
(function () {
  var SUB = 4, KIND = { text: "t", image: "g", owner: "o", pattern: "o" };
  var D = { cols: 36, rows: 37, occ: 30, canvasH: 1440, hText: 16, hInk: 32, hOwn: 0, min: 65, big: 80, bigShare: 60, fill: 35, border: 3 };

  function pc(v) { return v <= 1 ? Math.round(v * 100) : v; }
  function pct(n, d) { return d ? Math.floor((2000 * n + d) / (2 * d)) / 10 : 0; }

  function cfg(o) {
    var c = {}, k, g, h, w;
    o = o || {}; g = o.grid || {}; h = o.halo || {}; w = o.owner || {};
    for (k in D) c[k] = typeof o[k] === "number" ? o[k] : D[k];
    c.cols = g.cols || g[0] || c.cols; c.rows = g.rows || g[1] || c.rows; c.strict = o.strict !== false;
    [["hText", h.text], ["hInk", h.ink], ["hOwn", h.owner], ["min", w.min], ["big", w.big], ["bigShare", w.bigShare], ["fill", w.fill], ["border", w.border]].forEach(function (p) { if (p[1] != null) c[p[0]] = p[1]; });
    ["occ", "min", "big", "bigShare", "fill"].forEach(function (q) { c[q] = pc(c[q]); });
    return c;
  }

  function strokeBoxes(path, step, size) {
    var s = step || 32, z = size || 48, out = [], cum = [0], n = path.length, i, k, d, t, a, b, len, dx, dy;
    for (i = 1; i < n; i++) { dx = path[i][0] - path[i - 1][0]; dy = path[i][1] - path[i - 1][1]; cum.push(cum[i - 1] + Math.sqrt(dx * dx + dy * dy)); }
    len = cum[n - 1];
    for (k = 0; k === 0 || k * s < len; k++) {
      d = (k * s + Math.min((k + 1) * s, len)) / 2;
      for (i = 1; i < n - 1 && cum[i] < d; i++);
      a = path[i - 1]; b = path[i] || a;
      t = cum[i] > cum[i - 1] ? (d - cum[i - 1]) / (cum[i] - cum[i - 1]) : 0;
      out.push({ x: Math.floor(a[0] + t * (b[0] - a[0]) - z / 2 + 0.5), y: Math.floor(a[1] + t * (b[1] - a[1]) - z / 2 + 0.5), w: z, h: z, kind: "ink" });
    }
    return out;
  }

  function expand(boxes) {
    var out = [];
    boxes.forEach(function (b) {
      var k = b && b.kind || "ink";
      if (!b || k === "mark" || k === "decor" || b.ground || b.ghost || b.lettermark || (b.contrast != null && b.contrast < 0.35)) return;
      (b.path && b.path.length ? strokeBoxes(b.path) : [b]).forEach(function (q) {
        if (q.w > 0 && q.h > 0) {
          out.push({ k: KIND[k] || "i", r: [q.x, q.y, q.x + q.w, q.y + q.h],
            id: b.id == null ? "#" + out.length : b.id, up: b.ownerOf, an: b.anchor, fill: b.fill, border: b.border });
        }
      });
    });
    return out;
  }

  function infl(m, c) { var h = m.k === "t" ? c.hText : m.k === "i" ? c.hInk : c.hOwn; return [m.r[0] - h, m.r[1] - h, m.r[2] + h, m.r[3] + h]; }

  function held(m, c, x) {
    var out = m.hd;
    if (out) return out;
    out = [];
    m.busy = 1;
    x.items.forEach(function (k) {
      if (k === m || k.busy || k.up == null || k.up !== m.id) return;
      if (k.k === "o") judge(k, c, x);
      (k.k !== "o" ? [infl(k, c)] : k.ok ? [k.r] : held(k, c, x)).forEach(function (r) { if (out.indexOf(r) < 0) out.push(r); });
    });
    m.busy = 0;
    return (m.hd = out);
  }

  function meta(m, c) {
    var f = typeof m.fill === "number" && m.fill >= 0 && m.fill <= 1 ? m.fill : -1, b = typeof m.border === "number" && m.border >= 0 ? m.border : -1;
    return f < 0 && b < 0 ? "none" : f >= c.fill / 100 || b >= c.border ? "ok" : "weak";
  }

  function judge(m, c, x) {
    if (m.done) return;
    m.done = 1;
    var W = x.W, H = x.H, C = c.cols, R = c.rows, X0 = Math.max(0, m.r[0]), Y0 = Math.max(0, m.r[1]), X1 = Math.min(W, m.r[2]), Y1 = Math.min(H, m.r[3]),
        cont = held(m, c, x), rh = 0, ch = 0, rn = 0, cn = 0, ra, ca, i;
    if (X1 > X0 && Y1 > Y0) {
      ra = Math.floor(Y0 * R / H); ca = Math.floor(X0 * C / W);
      rn = Math.floor((Y1 - 1) * R / H) - ra + 1; cn = Math.floor((X1 - 1) * C / W) - ca + 1;
      for (i = ra; i < ra + rn; i++) if (cont.some(function (q) { return (Math.min(q[3] * R, (i + 1) * H) - Math.max(q[1] * R, i * H)) * 100 >= c.occ * H; })) rh++;
      for (i = ca; i < ca + cn; i++) if (cont.some(function (q) { return (Math.min(q[2] * C, (i + 1) * W) - Math.max(q[0] * C, i * W)) * 100 >= c.occ * W; })) ch++;
    }
    m.need = (X1 - X0) * (Y1 - Y0) * 100 > c.bigShare * W * H ? c.big : c.min;
    m.rs = pct(rh, rn); m.cs = pct(ch, cn); m.meta = meta(m, c);
    m.ok = rn > 0 && cn > 0 && rh * 100 >= m.need * rn && ch * 100 >= m.need * cn && (m.meta === "ok" || (m.meta === "none" && !c.strict));
  }

  function at(v, S, n) { var i = 0; while (i < n && S * (2 * i + 1) < v * 2 * n) i++; return i; }

  function cover(rs, c, W, H) {
    var C = c.cols, R = c.rows, nx = C * SUB, ny = R * SUB, need = (SUB * SUB * c.occ + 99) / 100 | 0, g = [], o = [], n = 0, y, r, k, s, a, b;
    for (y = 0; y < ny; y++) g.push(new Uint8Array(nx));
    rs.forEach(function (q) {
      var x0 = Math.max(0, q[0]), y0 = Math.max(0, q[1]), x1 = Math.min(W, q[2]), y1 = Math.min(H, q[3]), i0, i1, j, j1;
      if (x1 <= x0 || y1 <= y0) return;
      i0 = at(x0, W, nx); i1 = at(x1, W, nx); j1 = at(y1, H, ny);
      for (j = at(y0, H, ny); j < j1; j++) g[j].fill(1, i0, i1);
    });
    for (r = 0; r < R; r++) {
      o.push([]);
      for (k = 0; k < C; k++) {
        for (s = 0, a = 0; a < SUB; a++) for (b = 0; b < SUB; b++) s += g[r * SUB + a][k * SUB + b];
        o[r].push(s >= need ? 1 : 0); n += o[r][k];
      }
    }
    return { o: o, n: n };
  }

  function bigRect(o, R, C) {
    var h = [], best = 0, r, i, j, m;
    for (i = 0; i < C; i++) h.push(0);
    for (r = 0; r < R; r++) {
      for (i = 0; i < C; i++) h[i] = o[r][i] ? 0 : h[i] + 1;
      for (i = 0; i < C; i++) for (j = i, m = h[i]; j < C && h[j]; j++) { m = Math.min(m, h[j]); best = Math.max(best, m * (j - i + 1)); }
    }
    return best;
  }

  function deadSpace(boxes, zone, opts) {
    var c = cfg(opts), W = (zone && zone.w) || 852, H = (zone && zone.h) || 888, x = { items: expand(boxes || []), W: W, H: H },
        rects = [], anch = [], owners = [], g, a, run = 0, best = 0;
    x.items.forEach(function (m) {
      if (m.k === "o") {
        judge(m, c, x);
        owners.push({ id: m.id, rows: m.rs, cols: m.cs, ok: m.ok, need: m.need, meta: m.meta });
        if (m.ok) rects.push(m.r);
      } else rects.push(infl(m, c));
      if (m.an == null ? m.k !== "t" : m.an) anch.push(m.r);
    });
    g = cover(rects, c, W, H); a = cover(anch, c, W, H);
    g.o.forEach(function (row) {
      if (row.reduce(function (p, v) { return p + v; }, 0) <= 1) best = Math.max(best, ++run); else run = 0;
    });
    return {
      band: pct(best * H, c.rows * c.canvasH), rect: pct(bigRect(g.o, c.rows, c.cols), c.rows * c.cols),
      fill: pct(c.rows * c.cols - g.n, c.rows * c.cols), anchorShare: pct(a.n, c.rows * c.cols),
      cells: g.o.map(function (row) { return row.map(function (v) { return v ? "#" : "."; }).join(""); }), owners: owners
    };
  }

  deadSpace.strokeBoxes = strokeBoxes;
  CS.visual._.register("deadSpace", deadSpace);
})();

  /* ---- file: geometry.js ---- */
/* src/visual/geometry.js - owned by V1b. CS.visual.geometry (spec 4.1-4.2): zone(preset, h, type) -> the computed body zone {x, y, w, h}
 * (registry.geometry(h).body minus the preset's own end padding: poster 48, heritage 44, 24 on their single-post type), and
 * recipe(name, {zone, T, kind, rtl, ...}) -> {anchor, text, ok, reason, owner, A, caption?}. Rects are body-zone px, x from the left;
 * "start" is the right side unless rtl === false. T is the fitted text height, G = 40 the gap, A = zone.h - T - G.
 * opts: zone T kind (icon mock scene chart numeral field photo word pattern rows) n (rows) rtl field seam captionH footH pillar (272 344 380)
 * pillarH ("text") phone parts (elements in the owner) words side ("start" for half) top (corner) share (half, 45-50) canvasW.
 * reasons: recipe text-share anchor-min rows-max words start-short pillar text-tall full-min band-min corner-collide center-min half-thin.
 * UNITS: every length px from the zone origin (a bleed has x < 0; canvasW is the canvas width); share (half) is percent 0-100, never a fraction. ROWS: at
 * most rowsMax = 5 icon rows (S-21): six to eight rows are a plain list with no anchor claim, so recipe() reports rows-max for n > 5 and limits() answers
 * for 5 rows (the same in _cs/space.py). */
(function () {
  var G = 40, GAP = 20, ROWS = 5, PAD = { poster: 48, heritage: 44 };
  var SIZE = { icon: [280, 560], mock: [300, 560], scene: [320, 0], chart: [360, 0], numeral: [300, 0], field: [280, 0], photo: [320, 0], word: [280, 0], pattern: [280, 0] };
  var OWNER = { start: 1, end: 1, band: 1, half: 1 };

  function zone(preset, h, type) {
    var id = preset && preset.id || preset, b = null, pad = Object.prototype.hasOwnProperty.call(PAD, id) ? (type === "poster" ? 24 : PAD[id]) : 0;
    h = h || 1440;
    try { b = CS.core.registry.geometry(h).body; } catch (e) { b = null; }
    b = b || { x: 114, y: 261, w: 852, h: 888 + h - 1440 };
    return { x: b.x, y: b.y, w: b.w, h: b.h - pad };
  }

  /** [min, max] anchor height in px (4.5), max 0 = none; rows are 128 a row (at most ROWS) plus 40 of card padding. */
  function limits(kind, n) {
    var k = Math.max(1, Math.min(ROWS, Math.floor(n || 3)));
    return kind === "rows" ? [128 * k, 128 * k + 40] : SIZE[kind] || [280, 0];
  }

  function recipe(name, o) {
    o = o || {};
    var z = o.zone || zone(), W = z.w, H = z.h, zx = z.x == null ? 114 : z.x, cw = o.canvasW || 1080, T = o.T || 0, kind = o.kind || "icon", rtl = o.rtl !== false,
        lim = limits(kind, o.n), A = H - T - G, cap = o.captionH || 0, right = (name === "start") === rtl, r, a, P, ph, sm, av, side, fh, hw;
    r = { anchor: null, text: { x: 0, y: 0, w: W, h: T }, ok: true, reason: "", owner: !!(OWNER[name] || o.field || kind === "field"), A: A };
    function fail(why) { if (r.ok) { r.ok = false; r.reason = why; } }
    if ((name === "under" || name === "over" || name === "band") && T * 100 > 55 * H) fail("text-share");
    if (o.words > 12 && (name === "half" || o.phone)) fail("words");
    if (kind === "rows" && o.n > ROWS) fail("rows-max");
    switch (name) {
      case "under": case "over":
        sm = name === "over" && (o.seam != null ? o.seam : kind === "field" || o.field ? 24 : 0) || 0;
        a = Math.min(A - sm, lim[1] || A);
        r.anchor = { x: 0, y: name === "over" ? sm : T + G, w: W, h: a };
        if (name === "over") r.text.y = sm + a + G;
        if (a < lim[0]) fail("anchor-min");
        break;
      case "start": case "end":
        P = o.pillar || (o.phone ? 380 : kind === "icon" ? 272 : 344);
        ph = o.pillarH === "text" ? Math.min(H, Math.max(T, 420)) : H;
        r.anchor = { x: right ? W - P : 0, y: Math.floor((H - ph) / 2), w: P, h: ph };
        r.text = { x: right ? 0 : P + GAP, y: Math.floor((H - T) / 2), w: W - P - GAP, h: T };
        if ([272, 344, 380].indexOf(P) < 0) fail("pillar");
        if (T > H) fail("text-tall"); else if (T < 488 && !(o.parts >= 2)) fail("start-short");
        break;
      case "full":
        av = A - (cap ? cap + G : 0);
        r.anchor = { x: 0, y: T + G, w: W, h: av };
        if (cap) r.caption = { x: 0, y: T + G + av + G, w: W, h: cap };
        if (av < 620) fail("full-min");
        break;
      case "band":
        r.anchor = { x: -zx, y: T + G, w: cw, h: Math.min(A, Math.floor(H * 56 / 100)) };
        if (A < Math.floor(H * 40 / 100)) fail("band-min");
        break;
      case "corner":
        r.anchor = { x: rtl ? 0 : W - 340, y: o.top ? 0 : H - 340, w: 340, h: 340 };
        if (o.top) r.text.y = 340 + G;
        if (T + G > H - 340) fail("corner-collide");
        break;
      case "center":
        fh = o.footH == null ? 96 : o.footH;
        av = H - T - fh - 2 * G;
        side = Math.max(440, Math.min(560, av));
        r.anchor = { x: Math.floor((W - side) / 2), y: T + G + Math.floor((av - side) / 2), w: side, h: side };
        r.caption = { x: 0, y: H - fh, w: W, h: fh };
        if (av < 440) fail("center-min");
        break;
      case "half":
        hw = Math.floor(W * (o.share || 50) / 100);
        right = (o.side === "start") === rtl;
        r.anchor = { x: right ? W - hw : -zx, y: 0, w: hw + (right ? cw - zx - W : zx), h: H };
        r.text = { x: right ? 0 : hw + GAP, y: Math.floor((H - T) / 2), w: W - hw - GAP, h: T };
        if (T > H) fail("text-tall");
        if (o.parts != null && o.parts < 3) fail("half-thin");
        break;
      default:
        r.ok = false; r.reason = "recipe";
    }
    return r;
  }

  CS.visual._.register("geometry", { zone: zone, recipe: recipe, limits: limits, G: G, GAP: GAP, rowsMax: ROWS, recipes: ["under", "over", "start", "end", "full", "band", "corner", "center", "half"] });
})();

  /* ---- file: plan-features.js ---- */
/* src/visual/plan-features.js - owned by V2. Planner steps 1-2 (spec 5.3): slide features, text blocks, concept lookup. V._.pl.feat(spec, X) -> [F] sorted by n. */
(function () {
  const V = CS.visual, P = (V._.pl = V._.pl || {});
  const PCT = /^(?:%|٪|percent|في ال(?:مية|مئة)|بال(?:مية|مئة))$/i, OF = /^(?:من|of|out of) ([0-9]{1,3})$/, ALN = /[A-Za-z0-9ء-ي]/;
  const UNIT = /^(\s*[%٪])?(?:\s+((?:من|of|out\s+of)\s+[0-9]{1,3}(?![0-9.,])|(?!(?:من|of)\s)[^\s0-9.,;:!?"()،؛؟«»=%٪-]{1,16}))?/, SER = /^([$€£¥])?\s*([-−‑‒+]?)([0-9]{1,3}(?:,[0-9]{3})+|[0-9]+)(\.[0-9]+)?(?:\s*([%٪]|[^\s0-9.,;:!?"()،؛؟«»=%٪-]{1,16}))?$/;
  const SPLIT = /[\s،,.:;!?؟…"()«»]+/, TAIL = /^[\s.,;:!?…،؛؟"'«»()-]+|[\s.,;:!?…،؛؟"'«»()-]+$/g;
  const clean = (s) => `${s ?? ""}`.replace(/==|\*/g, "").replace(/\s+/g, " ").trim(), two = (s) => clean(s).split(" ").slice(0, 2).join(" "), lines = (s, n) => Math.ceil(clean(s).length / n);
  const fold = (s) => `${s ?? ""}`.replace(/[٠-٩۰-۹]/g, (d) => d.charCodeAt(0) - (d.charCodeAt(0) > 1775 ? 1776 : 1632)).replace(/٫/g, ".").replace(/٬/g, ","), span = (s) => (/==(.+?)==/.exec(`${s ?? ""}`) || [])[1]?.replace(TAIL, "") || null;

  /** Number tokens of a digit-folded text: v as written for anchor.value (sign, grouping, decimals, a stuck unit letter or +; at most 10 characters), k the plain number, s the suffix, c a currency sign in front.
   * A token glued to a word, a range, a ratio, a date, a time or a list is bad: a figure is never cut out of those. */
  function nums(t) {
    const out = [];
    for (const m of t.matchAll(/[0-9]{1,3}(?:,[0-9]{3})+(?:\.[0-9]+)?|[0-9]+(?:\.[0-9]+)?/g)) {
      const d = m[0], i = m.index, s = (/^(?:[A-Za-z]{1,3}(?![A-Za-z])|\+)/.exec(t.slice(i + d.length)) || [""])[0], e = i + d.length + s.length, pre = t.slice(Math.max(0, i - 8), i), post = t.slice(e, e + 8), p = pre.slice(-1);
      const g = /[-−‑‒+]/.test(p) && !ALN.test(pre.slice(-2, -1)) ? (p === "+" ? "+" : "-") : "";
      const bad = /[A-Za-z.,]$/.test(pre) || /[A-Za-z0-9ء-ي][-−‑‒+–—]$/.test(pre) || /[0-9]\s*[-−‑‒–—\/:]\s*$/.test(pre) || /^[A-Za-z]|^[ء-ي]|^\s*[-−‑‒–—\/:]\s*[0-9]|^[.,][0-9]/.test(post) || (g + d + s).length > 10;   // glued to a word, in a range, ratio, date, time or list
      out.push({ v: g + d + s, k: (g === "-" ? "-" : "") + d.replace(/,/g, ""), s, e, c: /[$€£¥]/.test(p) ? p : "", bad });
    }
    return out;
  }

  /** slide.number, else the first whole number of headline, title, sub, kicker (never a year); a percent or "x of y" unit gives of/fill for the waffle, a negative, signed or suffixed figure never does. */
  function figure(s) {
    const n = s.number, own = n?.value != null;
    for (const f of own ? [n.value] : [s.headline, s.title, s.sub, s.body, s.kicker]) {
      const t = fold(clean(f));
      for (const x of nums(t)) {
        const m = UNIT.exec(t.slice(x.e)), pc = !!m[1], u = pc ? "%" : own ? clean(n.unit) : x.c || (/^(?:بدل|instead|than)$/.test(m[2]) ? "" : m[2]) || "", v = +x.k, of = PCT.test(u) ? 100 : +(OF.exec(u) || [])[1], ok = !x.s && /^[0-9]/.test(x.v);
        if (x.bad || (!own && !pc && !x.s && v >= 1900 && v <= 2100)) continue;
        const r = { v: x.v, k: x.k, s: x.s, u, src: (own && n.sourceId) || s.sourceIds?.[0], own: +own, pct: ok && of === 100 && v <= 100 };
        if (ok && of >= 2 && of <= 100 && v <= of && (of === 100 || Number.isInteger(v))) { r.of = of; r.fill = (v + 0.5) | 0; }
        return r;
      }
    }
  }

  /** The values of a numeric series in items: whole numbers (sign, grouping, decimals) with one unit shared by all or none (a suffix or a currency sign), none negative (bars start at zero), 2 to 7, labels of at most 24 characters; else null. */
  function series(s) {
    const out = [];
    for (const it of s.items || []) {
      const m = SER.exec(fold(clean(it.value))), w = clean(it.title), d = m && m[3].replace(/,/g, ""), x = m && Number((/[-−‑‒]/.test(m[2]) ? "-" : "") + d + (m[4] || "")), u = m ? m[1] || (m[5] === "٪" ? "%" : m[5]) || "" : "";
      if (!m || d.length > 15 || !(x >= 0) || !w || w.length > 24 || (m[1] && m[5]) || (out.length && out.u !== u)) return null;
      if (!out.length) out.u = u;
      out.push({ label: it.title, value: x, hi: !!it.hi });
    }
    return out.length > 1 && out.length < 8 ? out : null;
  }

  function keywords(t) {
    const S = V._.stem, st = S ? S.tbl().stop : {}, skip = /^(?:و|ف)?(?:عايز|عاوز|محتاج|احفظها|احفظ|ابعت|اكتب|ابدأ|حط|اقطع|الخلاصة|لازم|مفيش|اللي|عشان|علشان|كده|أول|آخر|أقل|أكتر|ده|دي|بس|مش|the|and|your|this|that|with|want|save|send|start|write)$/i;
    return clean(t).split(SPLIT).filter((x) => x.length > 2 && !skip.test(x) && !S.cands(S.norm(x)).some((w) => st[w] || skip.test(w)) && !/^[0-9]+$/.test(x)).sort((a, b) => b.length - a.length);
  }

  /** The lookup fields, weighted: title 100, number 120, sides 80, bullets 70, body 60, demo 70, bridge 20. */
  function fields(s) {
    const f = [], add = (t, w) => { t = clean(t); if (t) f.push({ text: t, w }); };
    add(s.title, 100); add(s.headline, 100); add(s.kicker, 40); add(s.sub, 60); add(s.body, 60); add(s.number?.unit, 120); add(s.bridge, 20);
    for (const x of s.sides || []) { add(x.label, 80); add(x.text, 80); }
    for (const x of s.bullets || []) add(x, 70);
    for (const x of s.items || []) { add(x.title, 70); add(x.text, 60); }
    for (const l of s.demo?.lines || []) add(l.text, 70);
    return f;
  }

  P.feat = function (spec, X) {
    const D = X.D, I = V.icons;
    let ord = 0;
    const out = (spec.slides || []).slice().sort((a, b) => (a.n || 0) - (b.n || 0)).map((s, i) => {
      const t = s.type, b = s.bullets || [], it = s.items || [], sd = s.sides || [], d = s.demo?.lines || [], q = t === "quote" && s.body ? 1 : 0;
      if (t === "item" || t === "step") ord++;
      const F = { s, id: s.id, type: t, i, v: s.variant || "", fields: fields(s), bridge: !!s.bridge, ord: s.ord || ord, num: figure(s), ser: series(s), n: { demo: d.length, sides: sd.length, items: it.length, bullets: b.length },
        role: D.roles.variants?.[s.variant] || D.roles.types?.[t] || "read", main: `${s.title || s.headline || ""}`, sub: `${s.body || s.sub || s.cta?.text || ""}`, asset: !!(s.media?.assetId || /^(?:photo|cutout|plate|screenshot|ui)$/.test(s.media?.slot)),
        span: span(s.headline) || span(s.title) || span(s.sub) || span(s.body) || span(s.bridge), rowsN: b.length >= 3 && b.length <= 5 ? b.length : it.length >= 3 && it.length <= 5 ? it.length : 0,
        list: b.length ? b.map(clean) : sd.map((x) => clean(x.text)), mwc: d.length + q + (sd.length === 2 ? 2 : 0), mwn: d.length + it.length + b.length + q };
      F.words = clean(F.main + " " + F.sub).split(" ").filter(Boolean).length;
      F.span = F.span || s.em || (/\*([^*]+)\*/.exec([s.headline, s.title, s.sub, s.body].join("\n")) || [])[1] || null;
      F.wts = [...new Set([t === "cta" && s.cta?.keyword, F.span && two(F.span), ...keywords(F.sub), ...keywords(F.main)].filter(Boolean))]; F.key = F.wts[0] || "";
      F.ew = F.num ? Array.from(F.num.v).reduce((w, c) => w + (c === "1" ? 0.4 : /[0-9]/.test(c) ? 0.58 : /[%٪]/.test(c) ? 0.84 : /[.,]/.test(c) ? 0.28 : 0.6), 0) : 0;   // the width of the figure in em, as the numeral builder counts it: it draws at 200 px at least
      F.reps = F.num ? nums(fold(F.fields.map((f) => f.text).join(" "))).filter((q) => !q.bad && q.k + q.s === F.num.k + F.num.s).length : 0;   // S-13: a figure shows at most twice on a slide
      F.wt = t === "cta" && s.cta?.keyword || (F.span ? two(F.span) : F.num ? F.num.v + (F.num.u ? (F.num.pct ? "" : "\u00a0") + F.num.u : "") : F.key);
      if (F.wt && !F.num && !(t === "cta" && s.cta?.keyword) && clean(F.main).includes(F.wt)) F.wt = F.wts.find((w) => !clean(F.main).includes(w)) || F.wt;
      return F;
    });
    X.topic = I ? I.topic([].concat(...out.map((F) => F.fields)), { dialect: X.ld }) : [];
    for (const F of out) {
      const seen = {};
      F.pool = I && F.fields.length ? I.find(F.fields, { dialect: X.ld, topic: X.topic, k: 12, hero: true, avoid: X.avoid }) : [];
      F.hits = F.pool.filter((e) => e.concept && !seen[e.concept] && (seen[e.concept] = 1)).map((e) => ({ n: Math.min(100, ((e.score * 100 + 17) / 35) | 0), via: e.via, obj: e.object || e.name }));
    }
    return out;
  };

  /** Text blocks beside a candidate: title 68 px (25 chars a line, pitch 92), body 46 px (40, 74), hero 84 px (18, 112); a full recipe keeps its body as a caption. */
  P.blocks = function (F, c) {
    const hero = /^(?:cover|rehook|share|poster)$/.test(F.type), out = [], add = (x, cpl, k, h, g) => out.push({ w: Math.min(852, Math.min(clean(x).length, cpl) * k), h: lines(x, cpl) * h, g });
    if (F.main) add(F.main, hero ? 18 : 25, hero ? 42 : 34, hero ? 112 : 92, 24);
    if (F.sub && !(c.kind === "mock" && F.type === "quote") && c.recipe !== "full") add(F.sub, 40, 21, 74, 40);
    if (c.kind !== "rows" && c.kind !== "mock" && c.sub !== "panel" && !c.own) for (const x of F.list) add(x, 40, 21, 74, 24);
    return out;
  };
  P.height = (b) => b.reduce((h, x, i) => h + x.h + (i < b.length - 1 ? x.g : 0), 0);
  P.clean = clean;
  P.demoFits = (s, notes) => {
    const wc = (t) => String(t ?? "").split(/\s+/).filter(Boolean).length;
    let prev, total = wc(s.demo?.caption);
    const lines = s.demo?.lines || [], speakers = lines.map((l) => (prev = /^(?:me|them)$/.test(l.who) ? l.who : prev === "them" ? "me" : "them"));
    return lines.length > 0 && lines.length <= (notes ? 5 : 4) && lines.every((l, i) => {
      const n = wc(l.text);
      total += n + (!notes && (speakers[i] === speakers[i - 1] || speakers[i] === speakers[i + 1]) ? 1 : 0);
      return n > 0 && n <= 12;
    }) && total <= 24;
  };
  /** The sub an anchor asks for in so many words ("" when it leaves it open), and its canonical sub (IS-3 v2 `_.sub`). */
  P.want = (a) => ({ icon: "icon", scene: a.template, chart: a.chart?.kind, mock: a.mock?.kind, pattern: a.pattern, numeral: a.companion, word: a.wordStyle, field: a.value ? "numeral" : a.word ? "word" : a.icon || a.object ? "icon" : "" })[a.kind] || "";
  P.sub = (a) => P.want(a) || ({ scene: "solo", numeral: "none", word: "solid", rows: "list", field: "panel" })[a.kind] || "";
})();

  /* ---- file: plan-score.js ---- */
/* src/visual/plan-score.js - owned by V2. Planner steps 3-7 (spec 5.3-5.5): candidates, the fit pass (CS.visual.deadSpace on predicted boxes), the integer score, H1-H8, the ladder R0-R8, S1-S5 and tones.
 * V._.pl.run(Fs, X) -> [{c nm F rl d tn lock? skip?}] with .notes. Integers only; ties end in a hash. PLAN-CHOICE: a demo goes first, a lone icon must be honest, tones are a rhythm. */
(function () {
  const V = CS.visual, P = (V._.pl = V._.pl || {}), SZ = { xs: 40, sm: 64, md: 96, lg: 160, xl: 240, hero: 320 }, LAD = ["lg", "xl", "hero"], BAND = [[8, 15, 40, 12, 20, 50], [18, 30, 60, 24, 40, 70], [10, 20, 101, 15, 24, 101]];
  const FOOT = { numeral: [62, 66], "numeral:waffle": [100, 72], "numeral:icon": [78, 66], word: [82, 62], "field:word": [82, 62] }, CHAT = /^(?:chat|dm|notification|poll|profile)$/, OWN = /^(?:mock|chart|rows|scene|pattern|photo)$/;
  const demoOK = (F, c) => !/^(chat|notes)$/.test(c.sub) || P.demoFits(F.s, c.sub === "notes");
  const NEED = { number: (F) => !!F.num, ordinal: (F) => /^(?:item|step)$/.test(F.type), percent: (F) => !!F.num?.pct, series: (F) => !!F.ser, demo: (F, c) => F.n.demo > 0 && demoOK(F, c), sides: (F) => F.n.sides === 2,
    rows: (F) => F.rowsN > 0, ordered: (F) => F.rowsN > 0, short: (F) => F.words <= 12, mockwords: (F, c) => (CHAT.test(c.sub) ? F.mwc : F.mwn) > 0 && (!F.n.demo || demoOK(F, c)),
    noun: (F, c, X) => F.pool.some((e) => nounOf(e, X)), objnoun: (F, c, X) => F.pool.some((e) => nounOf(e, X) && X.objs[e.object]) };
  const OLD = /^(?:stamp|grid|cards|keyword)$/;   // variants the 1.0 engine drew: a preset that lists one may use it; a newer variant needs the capabilities to list it
  const icons = (c) => c.kind === "icon" || c.kind === "scene", hitN = (c) => +(c.needs.find((n) => n.startsWith("hit:")) || "hit:0").slice(4), kind = (x) => x.c.kind;
  const iconic = (c) => icons(c) || (/^(?:field|numeral|chart)$/.test(c.kind) && /^icon(?:-bars)?$/.test(c.sub));
  const carries = (c) => c.kind === "mock" && /^(?:chat|notes)$/.test(c.sub) && (c.needs || []).some((n) => n === "demo" || n === "mockwords");   // a mock that draws the demo lines
  const dmo = (F, c) => F.n.demo > 0 && carries(c);
  const has = (t, k) => (`${t}`.replace(/[٠-٩۰-۹]/g, (d) => d.charCodeAt(0) & 15).replace(/٫/g, ".").replace(/٬/g, ",").match(/[0-9]{1,3}(?:,[0-9]{3})+(?:\.[0-9]+)?|[0-9]+(?:\.[0-9]+)?/g) || []).some((m) => m.replace(/,/g, "") === k.replace(/^-/, ""));   // a figure token inside a text, whole: digits and separators folded as plan-features folds them
  const blk = (x) => { const n = P.clean(x).length; return { w: Math.min(852, Math.min(n, 40) * 21), h: Math.ceil(n / 40) * 74, g: 24 }; };   // a native bullet: body 46 px, 40 characters a line

  
  function nounOf(e, X) {
    const S = V._.stem;
    if (e.nn == null) {
      const L = [e.name, e.object].flatMap((n) => { const m = n && V.icons.meta(n); return m ? m.ar.concat(m.en) : []; }).map((x) => S.norm(x));
      e.nn = e.rung < 7 && !!e.via && (L.includes(S.norm(e.via)) || S.tok(e.via).some((t) => S.cands(t.n, X.ld).some((w) => L.includes(w))));
    }
    return e.nn;
  }
  
  const bad = (e, X) => { const cl = X.D.rhythm.scoring.cliche; return !!e && ((cl.metaphorConcepts || []).includes(e.concept) || (e.rung >= 5 && !nounOf(e, X)) || (e.rung >= cl.fromRung && (cl.icons.includes(e.name) || cl.objects.includes(e.object)))); };
  
  const elig = (e, c, X) => nounOf(e, X) && (!c.needs.includes("objnoun") || !!X.objs[e.object]);

  
  function wide(v, w) {
    const K = CS.art?.chart?.ew, cap = ((w * 7) / 10) | 0;
    if (K) { const e = K(v); return Math.floor(Math.min(520, cap / e)) < Math.ceil((206 * K(v, true)) / e); }
    return 206 * Array.from(`${v}`).reduce((a, c) => a + (c === "1" ? 0.55 : /[%٪]/.test(c) ? 1.02 : /[.,٫٬ \/]/.test(c) ? 0.34 : 0.72), 0) > cap;
  }

  function need(n, F, c, X) {
    const m = /^(items|bullets|hit):(\d+)(?:-(\d+))?$/.exec(n), k = m && (m[1] === "hit" ? F.hits.length : F.n[m[1]]);
    return m ? k >= m[2] && k <= (m[3] || 99) : !!NEED[n]?.(F, c, X);
  }

  function cands(F, X) {
    const t = X.D.anchorTable.types[F.type], v = F.s.visual, a = v?.anchor, vs = X.caps.variants?.[F.type] || [], pv = X.preset.variants?.[F.type] || [], rc = X.caps.recipes, out = [];
    const w = a?.kind && P.want(a), sb = (r) => (r.kind === "icon" ? "icon" : r.sub === "@signature" ? X.sig : r.sub), exact = w && t?.candidates?.some((r) => r.kind === a.kind && sb(r) === w);   // the sub the stored anchor asks for
    if (!t || t.planned === false || F.asset) return out;
    if (F.num && F.reps > 1 && F.wt && has(F.wt, F.num.k)) F.wt = [].concat(F.wts || [], F.key || []).find((x) => !has(x, F.num.k)) || "";   // S-13: a word that is the figure would print it a third time
    for (const r of t.candidates) {
      const sub = w && !exact && r.kind === a.kind && X.has(r.kind, w) ? w : sb(r), own = /^(?:bento|tiles|rail)$/.test(r.sub), c = { ...r, sub, own, sizes: r.sizes || [], needs: r.needs || [] };
      if (!a?.kind && r.kind === "icon" && (F.num || F.n.demo || F.rowsN)) continue;
      if (!sub || (rc && !rc.includes(r.recipe)) || X.art.avoid?.includes(r.kind) || (a?.kind && a.kind !== r.kind) || (w && sub !== w) || (v?.recipe && v.recipe !== r.recipe)) continue;
      if (own ? !vs.includes(sub) : !X.has(r.kind, sub) || (r.variant && !vs.includes(r.variant) && !(OLD.test(r.variant) && pv.includes(r.variant)))) continue;
      if (c.needs.some((n) => !need(n, F, c, X)) || ((r.kind === "word" || sub === "word") && !F.wt) || ((r.kind === "numeral" || sub === "numeral") && F.reps > 1)) continue;
      if (r.kind === "numeral" && sub === "icon" && (F.v || r.variant) === "numeral") continue;   // the native ordinal numeral owns that slide: it has no room for a companion icon
      if (r.icon && !(r.icon === "@cta" ? X.D.ctaIcons[F.s.cta?.kind] : V.icons?.has(r.icon))) continue;
      if (F.num && r.kind === "numeral" && c.needs.includes("ordinal") && F.v !== "numeral" && !a?.kind) {
        delete c.variant; c.bold = true;
        if (c.sub === "none" && F.num.pct && X.has("numeral", "waffle")) c.sub = "waffle";
      }
      out.push(c);
    }
    // A demo may use either supported reader, provided every line fits it.
    if (F.n.demo && !w && [-2, -1, 0].some((o) => [0, 1, 2].every((n) => X.Fs?.[F.i + o + n]?.n.demo))) for (const c of out.slice()) if (carries(c)) {
      const sub = c.sub === "notes" ? "chat" : "notes", alt = { ...c, id: c.id + "." + sub, sub, demoAlternative: true };
      if (X.has("mock", sub) && demoOK(F, alt) && !out.some((q) => q.kind === "mock" && q.sub === sub && q.recipe === c.recipe)) out.push(alt);
    }
    return out;
  }

  
  const keep = (F, c) => (F.v === "numeral" && c.kind !== "numeral" ? [{ w: 700, h: 350, g: 24 }] : []).concat(F.n.demo && carries(c) ? (F.s.bullets || []).map(blk).concat(F.type === "testimonial" && F.num && !has(F.s.demo.lines.map((l) => l.text).join(" "), F.num.k) ? [{ w: 600, h: 360, g: 24 }] : []) : []);

  
  function fit(F, c, X) {
    const Z = X.zone(F.type), z = { ...Z, h: Z.h - (F.bridge ? 86 : 0) }, bl = P.blocks(F, c).concat(keep(F, c)), G = V.geometry, k = c.kind, s = c.sub, cap = c.recipe === "full" && F.sub ? 56 : 0, own = OWN.test(k), n = F.rowsN || F.n.items;
    const mn = c.pause ? 0 : X.D.anchorTable.types[F.type].min || 0, cls = BAND[c.pause ? 1 : F.type === "poster" ? 2 : 0], ig = k === "icon" || (k === "scene" && s === "solo") || (k === "field" && s === "icon");
    const lm = c.own ? [0, 0] : k === "rows" && n < 5 ? [164 * n, 200 * n + 40] : G.limits(k, n || 3), q = FOOT[k + ":" + s] || FOOT[k];
    let best = { lvl: 2, sz: null, share: 0, tf: 0 };
    for (const sz of c.sizes.length ? c.sizes : ig ? LAD : [null]) {
      const R = G.recipe(c.recipe, { zone: z, T: P.height(bl), kind: k, n, field: c.field, words: F.words, rtl: X.rtl, captionH: cap }), B = [], at = (kind, x, y, w, h, o) => B.push({ kind, x, y, w, h, ...o });
      const d = R.A - R.anchor.h, ab = d > 0 && d <= 150 && /^(?:under|over)$/.test(c.recipe) ? d : 0, a = { ...R.anchor, h: R.anchor.h + ab };   // up to 150 px left over: the text grows to take it
      let y = R.text.y + (c.recipe === "over" ? ab : 0), w = a.w, h = Math.max(Math.min(lm[1] && a.h - lm[1] > 150 ? lm[1] : a.h, a.h), Math.min(lm[0], a.h));
      if (ig) w = h = ((SZ[sz || "xl"] * (c.treatment === "giant" ? 175 : 160)) / 100) | 0;
      else if (q) { w = ((a.w * q[0]) / 100) | 0; h = Math.min(a.h, Math.max(lm[0], ((a.h * q[1]) / 100) | 0)); }
      for (const b of bl) { at("text", c.recipe === "center" ? ((R.text.w - b.w) / 2) | 0 : X.rtl ? R.text.x + R.text.w - b.w : R.text.x, y, b.w, b.h); y += b.h + b.g; }
      if (own || c.field) {
        const t = ig && c.field, pw = t ? Math.min(a.w, w + 96) : a.w, ph = Math.min(a.h, t ? h + 96 : own ? h : a.h), x = a.x + (((a.w - pw) / 2) | 0), o = a.y + (((a.h - ph) / 2) | 0);
        at("owner", x, o, pw, ph, { id: "a", fill: 1 }); at("ink", x + 36, o + 36, Math.max(1, pw - 72), Math.max(1, ph - 72), { ownerOf: "a" });
      } else at("ink", a.x + (((a.w - w) / 2) | 0), a.y + (((a.h - h) / 2) | 0), w, h);
      const H = R.caption ? R.caption.y : z.h, m = V.deadSpace(B, { w: Z.w, h: H }), share = ((m.anchorShare * H) / Z.h + 0.5) | 0;   // the bridge and the caption line stay outside the measured zone
      const feas = R.ok && w <= a.w && h <= a.h && m.owners.every((o) => o.ok) && !((k === "numeral" || s === "numeral") && wide(c.variant === "numeral" || !F.num ? `${F.ord}` : F.num.v, a.w)), lvl = !feas ? 2 : share >= mn && m.band < cls[0] && m.rect < cls[1] && m.fill < cls[2] ? 0 : share * 5 >= mn * 4 && m.band < cls[3] && m.rect < cls[4] && m.fill < cls[5] ? 1 : 2;
      if (lvl < best.lvl || !best.sz) best = { lvl, feas, sz, share, tf: R.ok ? 100 : 0 };   // level 0: no NOTE-level dead space; 1: FIX-level only; 2: over it
      if (!lvl) break;
    }
    return best;
  }

  
  function base(F, c, X) {
    const sc = X.D.rhythm.scoring, cl = sc.cliche, hn = hitN(c), top = F.pool.find((e) => elig(e, c, X)), w = X.w, mem = [].concat(...X.mem), st = F.i === X.bold ? "reveal" : /^(?:rehook|cta)$/.test(F.type) ? F.type : F.role === "operate" ? "operate" : "read", dm = dmo(F, c);
    const ev = Math.max(c.needs.some((n) => !n.startsWith("hit:")) ? 100 : 0, (hn && F.hits[hn - 1]?.n) || 0), nv = mem.filter((e) => e.kind === c.kind && (!e.treatment || !c.treatment || e.treatment === c.treatment)).length;
    let s = 30 * c.fit + 40 * ev + 15 * (X.aff[c.kind] ?? 50) + 10 * (mem.length ? 100 - Math.floor((200 * nv + mem.length) / (2 * mem.length)) : 100) + 5 * c.f.tf - (dm ? 1500 : 3000) * c.f.lvl + (dm ? sc.adjust.demo : 0);
    if (X.art.prefer?.includes(c.kind)) s += sc.adjust.brandPrefer;
    s += Math.max(-1500, Math.min(1500, X.pri[c.kind] || 0));
    if (iconic(c) && !c.icon && bad(top, X)) s += cl.points;
    if (c.kind === "icon" && !c.field && !c.icon) s += sc.adjust.lone;   // numeral-plain and field-word outrank an icon the lookup picked alone on the page
    if (iconic(c) && top?.object && X.objs[top.object] && !bad(top, X)) s += 1800;
    if (F.num && c.kind === "numeral" && c.variant !== "numeral") s += /^(?:waffle|bar)$/.test(c.sub) ? 2200 : c.sub === "none" ? 1200 : 0;
    if (w && (w.mockPrefer?.some((m) => c.kind === "mock" && (m === c.sub || m === c.artefact)) || [].concat(w.sequence?.[st] || []).some((e) => e.kind === c.kind && (!e.sub || e.sub === c.sub)))) s += sc.adjust.world;
    return s;
  }

  
  function names(F, c, X, ch, R) {
    if (!iconic(c)) return [];
    const used = {}, adj = {}, out = [], seen = {}, mx = R.H3?.maxUses ?? 99, n = c.kind === "scene" ? Math.max(hitN(c), 1) : 1, fx = c.icon === "@cta" ? X.D.ctaIcons[F.s.cta?.kind] : c.icon;
    ch.forEach((x, j) => { if (x && j !== F.i) for (const e of x.nm) { used[e.n] = (used[e.n] || 0) + 1; if (R.H3 && Math.abs(j - F.i) <= 1) adj[e.n] = 1; } });
    const free = (k) => k === X.motif || ((used[k] || 0) < mx && !adj[k]);
    if (fx) return free(fx) ? [{ n: fx }] : null;
    for (const e of F.pool) {
      const o = e.object && X.objs[e.object], k = o ? e.object : e.name;
      if (out.length >= n || seen[e.concept || k] || !free(k) || !elig(e, c, X)) continue;
      seen[e.concept || k] = 1; out.push({ n: k, o: o ? 1 : 0, e });
    }
    return out.length >= n ? out : null;
  }

  function rules(X, L) {
    if (X.RL[L]) return X.RL[L];
    const R = {};
    for (const [k, v] of Object.entries(X.D.rhythm.hard)) R[k] = { ...v };
    for (let i = 0; i <= L; i++) {
      const r = X.D.rhythm.relax[i];
      for (const k of r.drop) delete R[k];
      for (const [k, v] of Object.entries(r.set)) { const q = k.split("."); (R[q[0]] = R[q[0]] || {})[q[1]] = v; }
    }
    return (X.RL[L] = R);
  }

  const key2 = (x) => [x.F.type, x.v, x.c.recipe, x.c.kind].join("|");
  const runKind = (x) => x.F.n.demo ? null : kind(x);
  const runKey = (x) => x.F.n.demo ? null : key2(x);
  function runOf(ch, i, f, w) { let n = 1, j; for (j = i - 1; ch[j] && f(ch[j]) === f(w); j--) n++; for (j = i + 1; ch[j] && f(ch[j]) === f(w); j++) n++; return n; }

  function valid(F, ch, c, X, R, nm, ex) {
    const i = F.i, Fs = X.Fs, w = { c, F, v: F.v || c.variant, nm }, nb = [ch[i - 1], ch[i + 1]], k = [-5, -4, -3, -2, -1, 0].map((o) => (o ? ch[i + o] && key2(ch[i + o]) : key2(w)));
    if (R.H1 && !ex && ((!F.n.demo && runOf(ch, i, runKind, w) > R.H1.maxRunKind) || (R.H1.maxRunKind < 3 && icons(c) && nb.some((x) => x && icons(x.c))))) return false;
    if (R.H2 && !ex && ((!F.n.demo && runOf(ch, i, runKey, w) > R.H2.maxRunKey) || (!k.includes(undefined) && k[0] === k[2] && k[2] === k[4] && k[1] === k[3] && k[3] === k[5] && k[0] !== k[1]))) return false;
    if (R.H5 && c.pause && (nb.some((x) => x?.c.pause) || ch.filter((x, q) => x?.c.pause && q !== i).length + 1 > Math.max(1, (X.n / R.H5.per) | 0) || Fs[i + 1]?.type === "cta")) return false;
    return !(R.H7 && X.bold === i && !c.bold) && !(R.H8 && R.H8.types.includes(F.type) && c.share < R.H8.minShare);
  }

  function dyn(F, c, ch, X) {
    const p = ch[F.i - 1], q = X.D.rhythm.soft, dm = dmo(F, c);   // a drawn demo does not wait for variety
    return c.s + (!dm && p?.c.kind === c.kind ? q.S1 : 0) + (!dm && p?.c.recipe === c.recipe ? q.S2 : 0) + (X.mem[0]?.[F.i]?.kind === c.kind ? q.S3 : 0) + (ch.some((x) => x?.c.kind === c.kind) ? 0 : q.S4)
      + (F.role === "read" && p?.F.role === "peak" && c.share <= (X.D.anchorTable.types[F.type].target ?? -1) ? q.S5 : 0);
  }

  
  function choose(F, ch, X, L, skip, ex) {
    const R = rules(X, L), pool = [];
    for (const c of F.cs) { const nm = names(F, c, X, ch, R), e = { c, nm, d: 0 }; if (nm && !skip?.(e)) { e.d = dyn(F, c, ch, X); pool.push(e); } }
    const sameDemo = (e) => dmo(F, e.c) ? [ch[F.i - 1], ch[F.i + 1]].filter((x) => x && dmo(x.F, x.c) && x.c.sub === e.c.sub).length : 0;
    pool.sort((a, b) => sameDemo(a) - sameDemo(b) || +!!a.c.demoAlternative - +!!b.c.demoAlternative || b.d - a.d || b.c.share - a.c.share || icons(a.c) - icons(b.c) || (a.c.h < b.c.h ? -1 : 1));
    for (const e of pool) if (valid(F, ch, e.c, X, R, e.nm, ex)) return { c: e.c, F, v: F.v || e.c.variant, nm: e.nm, rl: L, d: e.d };
  }

  function bolds(Fs, X) {
    const inner = Fs.filter((F) => F.cs.length), t = ((66 * inner.length + 50) / 100) | 0, b = X.w?.boldMove?.slide, w = b && Fs.find((F) => F.id === b), can = (F) => F && !F.s.visual?.lock && !(F.n.demo && F.cs.some(carries)) && F.cs.some((c) => c.bold);   // a slide whose demo is drawn is not the bold one
    if (can(w)) return w.i;
    for (let d = 0; d < inner.length; d++) for (const F of [inner[t - 1 + d], inner[t - 1 - d]]) if (can(F)) return F.i;
    return -1;
  }

  
  function repair(Fs, ch, X) {
    const H4 = X.D.rhythm.hard.H4, kinds = () => new Set(ch.filter(Boolean).map(kind));
    for (let sw = 0; X.n >= H4.minInner && kinds().size < H4.minKinds && sw < H4.maxSwaps; sw++) {
      const ks = kinds();
      let best = null;
      for (const F of Fs) {
        const x = ch[F.i], y = x && !x.lock && F.role !== "peak" && F.i !== X.bold && !dmo(F, x.c) && choose(F, ch, X, x.rl, (e) => ks.has(e.c.kind));
        if (y && (!best || x.d - y.d < best.l)) best = { y, l: x.d - y.d };
      }
      if (!best) break;
      ch[best.y.F.i] = best.y;
    }
    return X.n >= H4.minInner && kinds().size < H4.minKinds;
  }

  
  function tones(ch, X) {
    const T = X.D.tones, W = T.cost, Q = T.rhythm, S = X.Fs.filter((F) => F.type !== "cover"), n = S.length, tk = X.tok, TN = ["base", tk.field && "field", tk.invert && "invert"].filter(Boolean);
    const R = rules(X, Math.max(0, ...ch.filter(Boolean).map((x) => x.rl))), must = n >= Q.minInner && !!(tk.field && tk.invert), run = R.H6?.maxRunNonBase ?? 99;
    const lim = (add) => Math.max(Q.minNonBase, (((T.toneBias[X.w?.toneBias || "balanced"] + add) * n) / 100) | 0), r3 = X.D.rhythm.relax[3].set;
    const fr = X.preset.tones?.field?.roles || {}, rr = X.preset.roles || {}, hx = (v) => (typeof v === "string" && rr[v]) || "", blind = !!hx(fr.accent) && hx(fr.accent) === hx(fr.bg);   // the field tone paints card 2 in the page colour
    const O = S.map((F) => {
      const x = ch[F.i], st = F.s.visual?.tone;
      if (!x || x.lock || x.skip || st) return [[st || "base", 0]];
      const ps = x.c.pause || F.role === "pause", w0 = T.desire[ps ? "pause" : F.role], want = TN.includes(w0) ? w0 : "base", bd = F.i === X.bold && !ps && want === "base";
      const no = blind && /^(?:compare|myth-fact)$/.test(F.type) && x.c.kind === "field" && x.c.sub === "panel";
      return TN.filter((t) => !(no && t === "field")).map((t) => [t, t === want ? 0 : want === "base" ? (bd && t === T.desire.bold ? W.boldBreak : t === T.breakRun.tone ? W.extra : W.extra + 1) : W.miss + (t === "base" ? +(F.type === "cta") : W.extra)]);
    });
    const solve = (cap, run, must, hard) => {
      let cur = new Map([["|0|0|00", { c: 0, a: [] }]]), best = null;
      S.forEach((F, i) => {
        const nx = new Map();
        for (const [key, st] of cur) {
          const [l, r0, k0, fl] = key.split("|");
          for (const [t, cs] of O[i]) {
            const nb = t !== "base", r = nb ? +r0 + 1 : 0, k = +k0 + nb, e = t[0];
            const tr = must && l === e + e;
            if (r > run || k > cap || (tr && hard)) continue;
            const c = st.c + cs + (tr ? W.triple : 0) + (nb && l.slice(-1) === e ? W.same : 0), f = +(fl[0] === "1" || t === "field"), v = +(fl[1] === "1" || t === "invert"), kk = [(l + e).slice(-2), r, k, "" + f + v].join("|"), old = nx.get(kk);
            if (!old || c < old.c) nx.set(kk, { c, a: st.a.concat(t) });
          }
        }
        cur = nx;
      });
      for (const [key, st] of cur) { const q = key.split("|"); if ((!must || (+q[2] >= Q.minNonBase && q[3] === "11")) && (!best || st.c < best.c)) best = st; }
      return best;
    };
    const c0 = lim(T.shareCapAdd), r3n = r3["H6.maxRunNonBase"] || run;
    let H;
    if (must) for (const r of [run, r3n]) for (let c = c0; !H && c <= n; c++) { const a = solve(c, r, must, 1); if (a) H = { a, c, r }; }   // the share cap yields by the fewest slides the rule needs
    const res = H ? H.a : solve(lim(r3["tones.shareCapAdd"] || 0), r3n, must) || solve(c0, run, false) || solve(99, 99, false);   // else relax level 3, then the field and invert it owes are given up
    if (H && (H.c > c0 || H.r > run)) ch.notes.push({ slide: S[0].id, code: "plan.tones-relaxed", cap: c0, share: H.a.a.filter((t) => t !== "base").length, run: H.r });
    S.forEach((F, i) => { if (ch[F.i]) ch[F.i].tn = res ? res.a[i] : "base"; });
  }

  P.cands = cands; P.wide = wide; P.noun = nounOf;
  P.run = function (Fs, X) {
    const ch = [], fixed = (F, c, nm, o) => (ch[F.i] = { c, F, nm, rl: 0, d: 0, ...o });
    ch.notes = []; X.RL = []; X.Fs = Fs;
    for (const F of Fs) {
      const v = F.s.visual, a = v?.anchor, all = cands(F, X), dm = F.n.demo > 0;
      for (const c of all) { c.f = fit(F, c, X); c.share = c.f.share; c.h = X.fnv(F.id + "|" + c.id); }
      F.cs = all.filter((c) => c.f.lvl < 2 || c.floor || c.own || (c.f.feas && ((dm && carries(c)) || (F.num && c.kind === "numeral"))));
      if (F.cs.some((c) => c.own)) F.cs = F.cs.filter((c) => c.own);   // grid and timeline draw their items themselves: that layout is the anchor
      for (const c of F.cs) if (c.own) c.kind = "none";
      if (F.asset) fixed(F, { kind: "photo", recipe: "under", share: 50 }, [], { skip: 1 });
      else if (v?.lock) fixed(F, { kind: a?.kind || "none", recipe: v.recipe || "under", share: 50, pause: !!v.pause }, [a?.icon, a?.object].filter(Boolean).map((n) => ({ n })), { lock: 1, v: F.v });
    }
    X.bold = bolds(Fs, X);
    for (const F of Fs) for (const c of F.cs) c.s = base(F, c, X);
    const dm = (F) => F.n.demo > 0 && F.cs.some(carries), few = (F) => (dm(F) ? -1 : +(F.cs.filter((c) => !c.floor).length > 1));   // a demo slide, then a slide with one real candidate (or none), is chosen first: the others work around it
    for (const F of Fs.slice().sort((a, b) => few(a) - few(b) || a.i - b.i)) for (const ex of dm(F) ? [1, 0] : [0]) for (let L = 0; L <= 8 && !ch[F.i] && F.cs.length; L++) {
      const x = choose(F, ch, X, L, ex ? ((e) => !carries(e.c)) : undefined, ex);   // a mock that draws the demo first, whatever the kind and key runs say: the note names the ladder level they would have needed
      let l = L;
      if (x) { while (ex && l < 8 && !valid(F, ch, x.c, X, rules(X, l), x.nm)) l++; if (l > L) { x.rl = l; ch.notes.push({ slide: F.id, code: "plan.demo-first", level: l }); } }
      ch[F.i] = x;
    }
    const weak = repair(Fs, ch, X), f0 = Fs.find((F) => F.cs.length)?.id;
    tones(ch, X);
    if (weak) { (ch.find((y) => y && !y.lock && !y.skip) || {}).rl = 2; ch.notes.push({ slide: f0, code: "VA5.variety" }); }
    if (X.bold < 0 && f0) ch.notes.push({ slide: f0, code: "VA5.no-bold" });
    for (const F of Fs) if (F.n.demo && F.type !== "cover" && !F.asset && !ch[F.i]?.lock && !carries(ch[F.i]?.c || {})) ch.notes.push({ slide: F.id, code: "plan.demo-undrawn" });   // the demo lines reach no slide
    return ch;
  };
})();

  /* ---- file: plan-emit.js ---- */
/* src/visual/plan-emit.js - owned by V2. Planner steps 7-8 (spec 5.3): anchor data, marks, row icons, why and alt in the post's dialect, notes.
 * V._.pl.emit(Fs, ch, X) -> {slides: [{id, visual, variant?}], notes, motif}. Every word, figure and name comes from the slide's own fields or the lookup. */
(function () {
  const V = CS.visual, P = (V._.pl = V._.pl || {});
  const label = (n, X) => { const m = V.icons?.meta(n.n), a = X.lang === "en" ? m?.en : m?.ar; return n.o ? n.e?.via || n.n : a?.[0] || n.n; };
  const tpl = (X, g, k, p) => (X.D.templates[g]?.[k]?.[X.dk] || "").replace(/\{(\w+)\}/g, (m, q) => p[q] ?? "").replace(/\s%/g, "%").trim().slice(0, g === "alt" ? 160 : 200);

  function anchor(x) {
    const F = x.F, c = x.c, N = F.num, k = c.kind, s = c.sub, n = x.nm[0], a = { kind: k };
    if (c.own) return { kind: "none" };
    if (n && (k === "icon" || s === "icon")) a[n.o ? "object" : "icon"] = n.n;
    if (k === "icon") { if (c.treatment && (c.treatment !== "duo" || !a.object)) a.treatment = c.treatment; a.size = c.f.sz; }
    if (k === "scene") { a.template = s; a.icons = x.nm.map((q) => q.n); a.roles = x.nm.map((q, i) => (i ? "support" : "dominant")); if (c.f.sz) a.size = c.f.sz; }
    if (k === "numeral" || (k === "field" && s === "numeral")) { if (c.variant === "numeral" || !N) a.value = `${F.ord}`; else if (!N.own) { a.value = N.v; if (N.u) a.unit = N.u; } }
    if (k === "numeral" && s !== "none") a.companion = s;
    if (k === "numeral" && N?.of && /^(?:waffle|ring|bar)$/.test(s)) { a.of = N.of; a.filled = N.fill; }
    if (k === "chart") a.chart = { kind: s, values: F.ser.map((v) => (v.hi ? v : { label: v.label, value: v.value })), ...(F.ser.u ? { unit: F.ser.u } : {}), ...(F.s.sourceIds?.length ? {} : { illustrative: true }) };
    if (k === "mock") a.mock = { kind: s, ...(F.s.demo?.caption ? { caption: F.s.demo.caption } : {}), ...(c.artefact ? { artefact: c.artefact } : {}) };
    if (k === "word" || (k === "field" && s === "word")) a.word = F.wt;
    if (k === "word" && s !== "solid") a.wordStyle = s;
    return a;
  }

  /** why and alt: the data's templates filled with names and words of the slide. */
  function words(x, X) {
    const F = x.F, c = x.c, n = x.nm, k = c.kind, s = c.sub, L = X.D.labels, g = X.lang, N = F.num, d = F.s.demo?.lines?.[0], o = n[0]?.o ? "object" : "icon", solo = k === "scene" && s === "solo", wd = k === "word" || (k === "field" && s === "word");
    const l = (k === "mock" ? L[s === "artefact" ? "artefact." + c.artefact : "mock." + s] : k === "chart" ? L["chart." + s] : null)?.[g];
    const p = { word: F.wt, count: F.rowsN || F.n.bullets, summary: P.clean(F.main).slice(0, 60), text: P.clean(d?.text || F.list[0] || F.sub || F.main).slice(0, 80), icon: n[0] ? label(n[0], X) : "",
      concept: n[0]?.e?.via || F.hits[0]?.via || F.key, icons: n.map((e) => label(e, X)).join(g === "en" ? ", " : " و"), value: N ? N.v : `${F.ord}`, unit: N ? N.u : "", chart: l, mock: l, artefact: l };
    const why = c.pause ? "pause" : wd ? "field" : k === "mock" && s === "artefact" ? "artefact" : k === "field" ? (s === "numeral" ? "numeral" : s === "icon" ? "icon" : "") : solo ? "icon" : c.own ? "rows" : k;
    const alt = c.own ? "" : k === "field" || k === "word" ? (s === "numeral" ? "numeral" : s === "icon" ? o : s === "panel" ? "" : "word") : k === "icon" || solo ? o : k;
    return { why: why && tpl(X, "why", why, p), alt: alt && tpl(X, "alt", alt, p) };
  }

  /** A stored anchor merged into the plan must still be one a builder is registered for: else the slide is left to its stored visual and a note says what was asked. */
  function ok(F, a, X, notes) {
    const good = !a || a.kind === "none" || X.has(a.kind, P.sub(a));
    if (!good) notes.push({ slide: F.id, code: "plan.unsupported", want: [a.kind, P.sub(a)].filter(Boolean).join(":") });
    return good;
  }

  P.emit = function (Fs, ch, X) {
    const slides = [], notes = ch.notes.slice(), used = [], M = X.D.marks;
    for (const x of ch) for (const n of x?.nm || []) used.push(n.n);
    for (const F of Fs) {
      const x = ch[F.i], sv = F.s.visual;
      if (F.type === "cover" || sv?.lock) continue;
      if (/^(?:step|story-beat|setup|share|testimonial)$/.test(F.type) && !F.n.demo && !(F.type === "story-beat" && F.n.items)) notes.push({ slide: F.id, code: "C2.demo-missing" });
      if (F.asset) { notes.push({ slide: F.id, code: "plan.media" }); continue; }
      if (!x) { if (!ok(F, sv?.anchor, X, notes)) continue; slides.push({ id: F.id, visual: { anchor: { kind: "none" }, recipe: "under", tone: "base", ...sv } }); notes.push({ slide: F.id, code: "plan.no-builder" }); continue; }
      const c = x.c, w = words(x, X), a = anchor(x), st = c.own ? c.variant || c.sub : c.variant, pk = F.role === "peak";
      let v = { anchor: a, recipe: c.recipe, tone: x.tn };
      if (c.field) v.field = true;
      if (c.field && c.recipe === "over") v.bleed = "both";
      if (F.span && !(c.kind === "word" && c.sub === "struck")) {   // one text-bound mark on the emphasis span, as the preset allows; an arrow on a mock, chart or scene
        const m = [(pk ? ["circle", "underline"] : ["underline", "kashida", "circle"]).find((t) => X.marks.includes(t)), M.arrowNeeds.anchorKinds.includes(c.kind) && !pk && "arrow"].filter((t) => t && X.marks.includes(t));
        if (m.length) v.marks = m.slice(0, M.perSlide[c.pause ? "pause" : pk ? "peak" : "read"]);
      }
      if (c.own || c.kind === "rows") {
        const rows = F.s.bullets || (F.s.items || []).map((it) => [it.title, it.text].filter(Boolean).join(" "));
        if (rows.length) v.rowIcons = rows.slice(0, 8).map((b) => {
          const pool = V.icons?.find([{ text: P.clean(b), w: 100 }], { dialect: X.ld, k: 12, avoid: X.avoid }) || [];
          return pool.find((e) => P.noun(e, X))?.name || "circle";
        });
      }
      if (c.pause) v.pause = true;
      if (w.why) v.why = w.why;
      if (w.alt) v.alt = w.alt;
      if (x.rl) v.relax = x.rl;
      if (sv) { v = { ...v, ...sv }; if (sv.anchor) v.anchor = { ...a, ...sv.anchor }; }
      if (!ok(F, sv?.anchor && v.anchor, X, notes)) continue;
      if (x.rl) notes.push({ slide: F.id, code: "VA5.relaxed", level: x.rl });
      slides.push(F.v || !st ? { id: F.id, visual: v } : { id: F.id, visual: v, variant: st });
    }
    return { slides, notes, motif: Fs.find((F) => F.hits[0])?.hits[0].obj || "" };
  };
})();

  /* ---- file: plan-api.js ---- */
/* src/visual/plan-api.js - owned by V2. CS.visual.plan(spec, brand, preset, memory, opts) -> {slides: [{id, visual, variant?}], style: {planV, motif?}, notes} (IS-10). Pure.
 * Tables: block cs-art-direction (opts.data); capabilities: opts.caps, else CS.visual.caps(); memory = {posts: [[{kind, treatment?}] by slide, newest first], priors: {kind: points}}.
 * autoPreview(spec, brand, preset) -> [visual | null] aligned with spec.slides, never over a stored plan. */
(function () {
  const V = CS.visual, SIG = /^(?:pile|cluster|specimen|sheet|widgets|niche)$/, SLICE = ["arrow", "underline", "circle", "strike", "sparkle", "kashida"];
  let last;

  function plan(spec, brand, preset, memory, opts) {
    const c = CS.core.canon, st = spec.style || {}, dia = spec.locale?.dialect || "eg", g = brand?.visual?.art || {}, H = spec.canvas?.h || 1440, w = st.world, zones = {}, objs = {};
    opts = opts || {}; memory = memory || opts.memory || {};
    const D = opts.data || V._.block("cs-art-direction"), caps = opts.caps || V.caps?.() || { v: 1, art: {} }, pid = preset?.id || `${st.presetId}`.split("@")[0], aff = preset?.art?.affinity || D?.affinity?.[pid] || {};
    const planV = () => "1.1.0+" + c.fnv1a64(c.canonicalJSON(D)).slice(0, 8) + "+" + `${caps.hash || c.fnv1a64(c.canonicalJSON(caps))}`.slice(0, 8), none = (code) => ({ slides: [], style: { planV: D ? planV() : "" }, notes: [{ slide: "", code }] });
    if (!D?.anchorTable) return none("plan.no-tables");
    if (!preset?.art || st.visualMode === "off") return none("plan.off");
    const cur = w && D.worlds?.find((q) => q.id === w.id), X = {
      D, caps, preset, art: g, mem: (memory.posts || []).slice(0, 3).map((p) => (p || []).map((e) => (typeof e === "string" ? { kind: e } : e || {}))), objs, aff: {},
      avoid: [g.constraints?.figures === "none" && "h", g.constraints?.animals === "none" && "a"].filter(Boolean), pri: opts.priors || memory.priors || {}, rtl: dia !== "en", lang: dia === "en" ? "en" : "ar", dk: dia,
      ld: { levant: "lev", "msa-white": "msa" }[dia] || dia, fnv: c.fnv1a64, tok: { invert: !!preset.tones?.invert, field: !!preset.tones?.field }, sig: (preset.art.templates || []).find((t) => SIG.test(t)) || "",
      motif: st.motif || g.motifIcon || "", n: (spec.slides || []).filter((s) => s.type !== "cover").length, has: (k, s) => !!caps.art?.[k]?.includes(s), marks: (D.marks?.presets?.[pid]?.allow || []).filter((m) => (caps.marks || SLICE).includes(m)) };
    for (const o of V._.block("cs-icon-objects")?.objects || []) objs[o.id] = 1;
    for (const k of Object.keys(aff)) X.aff[k] = aff[k] <= 1 ? (aff[k] * 100 + 0.5) | 0 : aff[k];
    X.zone = (type) => {                      // the computed body zone; the inner one (S-1) on a slide that is not a cover or poster
      const z = V.geometry.zone(preset, H, type), r = CS.core.registry;
      let d = 110;
      try { d = r.geometry(H, { inner: true }).body.h - r.geometry(H).body.h; } catch (e) { d = 110; }
      return (zones[type] = zones[type] || (type === "cover" || type === "poster" ? z : { ...z, h: z.h + d }));
    };
    X.w = w && { ...(cur && Object.values(cur.sequence || {}).flat().every((e) => !e?.sub || X.has(e.kind, e.sub)) ? cur : {}), ...w };
    const input = { ...spec, slides: (spec.slides || []).filter(s => !V.free?.active(s)) };
    const Fs = V._.pl.feat(input, X), out = V._.pl.emit(Fs, V._.pl.run(Fs, X), X), style = { planV: planV() };
    if (!st.motif && (g.motifIcon || out.motif)) style.motif = g.motifIcon || out.motif;
    return { slides: out.slides, style, notes: out.notes };
  }

  /** The preview of the slides without a stored visual, kept only while nothing it was planned from changes: the deck, the whole effective preset, the brand art, the canvas, the capabilities and the art-direction table (by identity). */
  const ids = new WeakMap();
  let seq = 0;
  function autoPreview(spec, brand, preset) {
    const D = V._.block("cs-art-direction"), key = JSON.stringify([spec.id, preset, brand?.visual?.art, spec.slides, spec.locale, spec.style, spec.canvas, V.caps?.(), D && (ids.get(D) || (ids.set(D, ++seq), seq))]), byId = {};
    if (last?.key === key) return last.out;
    for (const s of plan(spec, brand, preset, null).slides) byId[s.id] = s.visual;
    last = { key, out: (spec.slides || []).map((s) => (s.visual || V.free?.active(s) ? null : byId[s.id] || null)) };
    return last.out;
  }

  V._.register("plan", plan);
  V._.register("autoPreview", autoPreview);
})();

  /* ---- file: remix.js ---- */
/* src/visual/remix.js - owned by V4 - stub */

  /* ---- file: fix.js ---- */
/* src/visual/fix.js - owned by V5 - stub */

  /* ---- file: settle.js ---- */
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

  /* ---- file: sketch.js ---- */
/* src/visual/sketch.js - owned by V6b - stub */

  /* ---- file: free.js ---- */
/* Free design: untrusted HTML is parsed into an allow-listed tree, never inserted as HTML.
 * Hosts embed data/free-design.json as cs-free-design (Node: visual._.blocks).
 * The parser is DOM-free so copy QA, the CLI and Studio share the same literal twin. */
(function () {
  var V = CS.visual, C = CS.core;
  function fail(message, code) { var e = new Error(message); e.code = code || "E_FREE_HTML"; throw e; }
  function contract() {
    var d = V._.block("cs-free-design");
    if (!d || d.schemaVersion !== 1) fail("Missing cs-free-design contract", "E_FREE_CONTRACT");
    return d;
  }
  function active(s) { return !!s && s.type !== "cover" && typeof s.free?.html === "string"; }
  function bytes(s) { return new TextEncoder().encode(s).length; }
  function field(path) {
    return contract().fields.allowed.some(function (p) { return new RegExp("^" + p.split(".").map(function (k) { return k === "N" ? "(?:0|[1-9][0-9]*)" : k; }).join("\\.") + "$").test(path); });
  }
  function value(s, path) {
    if (!field(path)) return "";
    var v = path.split(".").reduce(function (o, k) { return o == null ? undefined : o[k]; }, s);
    if (path === "number" && v && typeof v === "object") return String(v.value ?? "") + (v.unit ? " " + v.unit : "");
    return typeof v === "string" || typeof v === "number" ? String(v) : "";
  }
  function decode(s) {
    return s.replace(/&(#x[0-9a-f]+|#[0-9]+|amp|lt|gt|quot|apos|nbsp|lrm|rlm);/gi, function (m, k) {
      if (k[0] !== "#") return { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00a0", lrm: "\u200e", rlm: "\u200f" }[k.toLowerCase()] || m;
      var n = k[1].toLowerCase() === "x" ? parseInt(k.slice(2), 16) : +k.slice(1);
      return n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : "\ufffd";
    });
  }
  function attr(name, v, d) {
    if (!d.html.attributes.includes(name) || /(?:javascript\s*:|url\s*\()/i.test(v)) return null;
    if (name === "class") return v.split(/\s+/).filter(function (x) { return new RegExp(d.html.classPattern).test(x); }).join(" ");
    if (name === "dir") return /^(rtl|ltr|auto)$/.test(v) ? v : null;
    if (name === "data-field") return field(v) ? v : null;
    if (name === "data-icon") return Object.hasOwn(V._.block("cs-icon-pack")?.icons || {}, v) ? v : null;
    if (name === "data-object") return (V._.block("cs-icon-objects")?.objects || []).some(function (o) { return o.id === v; }) ? v : null;
    if (name === "data-picture") return /^[A-Za-z0-9_-]{1,64}$/.test(v) ? v : null;
    if (name === "data-fit") return /^(cover|contain)$/.test(v) ? v : null;
    var a = d.art, enums = { "data-size": a.icon.sizes, "data-treatment": a.icon.treatments, "data-mark": a.mark.values, "data-tone": a.tone.values, "data-from": a.chat.values };
    if (enums[name]) return enums[name].includes(v) ? v : null;
    if (name === "data-role") return /^(hero|title|h1|h2|body|small|micro|number|chip|tool)$/.test(v) ? v : null;
    return /^[a-zA-Z0-9_.-]{0,100}$/.test(v) ? v : null;
  }
  // A small whitelist parser. Unknown elements and their subtrees are dropped; unknown voids cannot swallow following copy.
  // Malformed, deeply nested or unterminated input is refused, rather than repaired into a different executable DOM.
  function parse(input) {
    var d = contract(), s = String(input), root = { children: [] }, stack = [{ tag: "", node: root }], i = 0;
    if (bytes(s) > d.html.maxBytes) fail("free.html exceeds maxBytes");
    function add(n) { var p = stack[stack.length - 1].node; if (p) p.children.push(n); }
    while (i < s.length) {
      if (s[i] !== "<") { var end = s.indexOf("<", i); if (end < 0) end = s.length; add({ text: decode(s.slice(i, end)) }); i = end; continue; }
      if (s.slice(i, i + 4) === "<" + "!--") { var ce = s.indexOf("-->", i + 4); if (ce < 0) fail("Unterminated HTML comment"); i = ce + 3; continue; }
      var start = i++, close = s[i] === "/"; if (close) i++;
      var tag = /^[a-z][a-z0-9-]*/i.exec(s.slice(i));
      if (!tag) { add({ text: "<" }); i = start + 1; continue; }
      tag = tag[0].toLowerCase(); i += tag.length;
      var attrs = {}, rawAttrs = Object.create(null), names = [], self = false;
      while (i < s.length && s[i] !== ">") {
        if (/\s/.test(s[i])) { i++; continue; }
        if (s[i] === "/" && s[i + 1] === ">") { self = true; i++; break; }
        var am = /^[^\s=<>/'"`]+/.exec(s.slice(i)); if (!am) fail("Malformed HTML attribute");
        var name = am[0].toLowerCase(), av = ""; i += am[0].length;
        while (/\s/.test(s[i] || "") && i < s.length) i++;
        if (s[i] === "=") {
          i++; while (/\s/.test(s[i] || "") && i < s.length) i++;
          var q = s[i];
          if (q === '"' || q === "'") { var qe = s.indexOf(q, ++i); if (qe < 0) fail("Unterminated HTML attribute"); av = s.slice(i, qe); i = qe + 1; }
          else { var vm = /^[^\s<>`'"=]+/.exec(s.slice(i)); if (!vm) fail("Malformed HTML value"); av = vm[0]; i += av.length; }
        }
        av = decode(av); names.push(name); rawAttrs[name] = av;
        var safe = attr(name, av, d); if (safe !== null && !Object.hasOwn(attrs, name)) attrs[name] = safe;
      }
      if (s[i] !== ">") fail("Unterminated HTML tag"); i++;
      if (!close && stack.some(function (p) { return p.node?.attrs?.["data-picture"]; })) fail("A picture placeholder must be empty");
      if (!close && Object.hasOwn(rawAttrs, "data-picture")) {
        if (tag !== "div" || !attrs["data-picture"] || names.some(function (k, at) { return !/^(class|data-picture|data-fit)$/.test(k) || names.indexOf(k) !== at; }) ||
            Object.hasOwn(rawAttrs, "data-fit") && !attrs["data-fit"] ||
            Object.hasOwn(rawAttrs, "class") && attrs.class !== rawAttrs.class.trim().split(/\s+/).join(" ")) fail("Use an empty div with data-picture and optional data-fit=cover|contain");
      } else if (!close && Object.hasOwn(rawAttrs, "data-fit")) fail("data-fit belongs to a picture placeholder");
      if (attrs["data-object"] && attrs["data-size"] && !d.art.object.sizes.includes(attrs["data-size"])) delete attrs["data-size"];
      if (close) { for (var j = stack.length - 1; j > 0; j--) if (stack[j].tag === tag) { stack.length = j; break; } continue; }
      var allowed = d.html.tags.includes(tag), node = allowed && stack[stack.length - 1].node ? { tag: tag, attrs: attrs, children: [] } : null;
      if (node) add(node);
      if (/^(script|style|textarea|title|xmp|iframe|noembed|noframes|plaintext)$/.test(tag)) {
        var raw = new RegExp("<\\/" + tag + "\\s*>", "ig"); raw.lastIndex = i; var match = raw.exec(s); i = match ? raw.lastIndex : s.length; continue;
      }
      if (!self && !/^(br|img|hr|input|meta|link|source|area|base|embed|wbr|param|track|col)$/.test(tag)) stack.push({ tag: tag, node: node });
      if (stack.length > 64) fail("HTML nesting exceeds 64");
    }
    function pictures(n) {
      if (n.attrs?.["data-picture"] && n.children.some(function (c) { return c.tag || c.text.trim(); })) fail("A picture placeholder must be empty");
      (n.children || []).forEach(pictures);
    }
    function readable(n) { return n.text !== undefined ? /[\p{L}\p{N}]/u.test(n.text) : !!(n.attrs?.["data-field"] || n.attrs?.["data-icon"] || n.attrs?.["data-object"] || n.attrs?.["data-picture"]) || n.children.some(readable); }
    function panels(n) {
      if (n.attrs?.["data-tone"] && !readable(n)) fail("data-tone paints a readable panel; remove it from an empty track or decorative element");
      (n.children || []).forEach(panels);
    }
    pictures(root); panels(root); return root;
  }
  function literals(input) {
    var out = [];
    function walk(n) { if (n.text !== undefined) { if (n.text.trim()) out.push(n.text); return; } if (n.attrs?.["data-field"]) return; n.children.forEach(walk); }
    walk(parse(input)); return out;
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function serialize(n) {
    if (n.text !== undefined) return esc(n.text);
    if (!n.tag) return n.children.map(serialize).join("");
    return "<" + n.tag + Object.keys(n.attrs).map(function (k) { return " " + k + '="' + esc(n.attrs[k]) + '"'; }).join("") + ">" + n.children.map(serialize).join("") + (n.tag === "br" ? "" : "</" + n.tag + ">");
  }
  function sanitize(input) { return serialize(parse(input)); }
  function edit(input, index, text) {
    var tree = parse(input), count = 0, done = false;
    function walk(n) {
      if (n.attrs && Object.hasOwn(n.attrs, "data-edit") && !n.attrs["data-field"]) { if (count++ === +index) { n.children = [{ text: String(text) }]; done = true; } return; }
      (n.children || []).forEach(walk);
    }
    walk(tree); if (!done) fail("Free edit target no longer exists"); return serialize(tree);
  }
  function expected(s, key) {
    var seq = 0, edits = 0, out = Object.create(null);
    function text(n) { return n.text !== undefined ? n.text : n.tag === "br" ? "\n" : n.children.map(text).join(""); }
    function walk(n, editable) {
      if (n.text !== undefined) { if (n.text.trim() && !editable) out[s.id + ".free." + seq++] = n.text; return; }
      var path = n.attrs?.["data-field"];
      if (path) { out[s.id + "." + path + "." + seq++] = value(s, path); return; }
      if (!editable && n.attrs && Object.hasOwn(n.attrs, "data-edit")) { out[s.id + ".free-edit." + edits++] = text(n); editable = true; }
      n.children.forEach(function (ch) { walk(ch, editable); });
    }
    walk(parse(s.free.html), false); return out[key] ?? null;
  }
  // Base rules of the free lane, scoped to one slide like its own css (kept out of primitives.css: they are not archetype rules).
  function base(id) {
    var p = ".cs-slide[data-cs-slide=\"" + id + "\"] ", f = p + ".cs-free ", c = f + ".f-chat > [data-from";
    return p + ".cs-content.cs-free{--cs-fs-h:var(--cs-fs-h2);display:flex;flex-direction:column;gap:0;padding:0;text-align:start}" +
      p + ".cs-content.cs-free > :only-child{flex:1 1 auto;min-block-size:0}" +
      f + "[data-free-literal]{font:inherit;color:inherit;text-wrap:inherit}" +
      f + "h2," + f + "h3{font-family:var(--cs-font-heading);font-weight:var(--cs-wght-heading);font-size:var(--cs-fs-h2);line-height:var(--cs-lh-heading)}" +
      f + "em{font-style:normal}" + f + ".cs-ltr{font-weight:inherit}" + f + "style{display:none}" +
      f + "[data-picture]{position:relative;min-inline-size:0;min-block-size:0;overflow:hidden;flex-shrink:0}" +
      f + "[data-picture] > img{position:absolute;inset:0;display:block;width:100%;height:100%;object-position:50% 50%}" +
      f + ".f-chat{display:flex;flex-direction:column;gap:calc(var(--cs-unit)*3)}" +
      c + "]{max-inline-size:85%;padding:calc(var(--cs-unit)*3);border-radius:calc(var(--cs-unit)*3);background:var(--cs-surface);color:var(--cs-ink);border:3px solid var(--cs-ink)}" +
      c + "=\"me\"]{align-self:flex-end;background:var(--cs-accent);color:var(--cs-on-accent)}" +
      c + "=\"them\"]{align-self:flex-start}";
  }
  function css(input, id) {
    var d = contract(), s = String(input || ""), out = [], pos = 0;
    function bad(message) { fail(message || "Invalid or unsafe free.css", "E_FREE_CSS"); }
    function propertyError(p) {
      var sides = { left: "inline-start", right: "inline-end", top: "block-start", bottom: "block-end" }, m = /^(?:(border|padding|margin)-)?(left|right|top|bottom)$/.exec(p);
      var names = m ? [(m[1] || "inset") + "-" + sides[m[2]]] : /^(inset-inline|inset-block)$/.test(p) ? [p + "-start", p + "-end"] : [];
      return "Property " + p + " is not allowed. " + (names.length ? "Use " + names.filter(n => d.css.properties.includes(n)).join(" and ") + "." : "Use the logical properties listed in free-design.md.");
    }
    if (bytes(s) > d.css.maxBytes || /[\\@<>\u0000-\u0008\u000b\u000e-\u001f]|\/\*|\*\/|!\s*important/i.test(s)) bad();
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) bad();
    var prefix = '.cs-slide[data-cs-slide="' + id + '"] .cs-free';
    function selector(x) {
      var rest = x.trim(), tokens = 0;
      while (rest) {
        var m = /^(?:\s+|[>+~]\s*|\.(?:f|cs)-[a-z0-9-]+\b|::(?:before|after)\b|:(?:first-child|last-child)\b|:nth-child\(\s*(?:odd|even|[+-]?[0-9]*n(?:\s*[+-]\s*[0-9]+)?|[0-9]+)\s*\)|\[(?:[a-z][a-z0-9-]*)(?:\s*(?:[~|^$*]?=)\s*(?:"[a-zA-Z0-9_. -]*"|'[a-zA-Z0-9_. -]*'|[a-zA-Z0-9_.-]+))?\s*\]|[a-z][a-z0-9-]*)/.exec(rest);
        if (!m) bad(); var t = m[0];
        if (t[0] === "[" && !d.html.attributes.includes(/^\[([a-z0-9-]+)/.exec(t)[1])) bad();
        if (/^[a-z]/.test(t) && !d.html.tags.includes(t)) bad();
        if (!tokens && /^[>+~]/.test(t)) bad();
        tokens++; rest = rest.slice(t.length);
      }
      if (!tokens || /[>+~]\s*$/.test(x)) bad();
      x = x.trim();
      if (x.startsWith(".cs-free ")) { if (/^\s*[+~]/.test(x.slice(8))) bad(); return prefix + x.slice(8); }
      return x === ".cs-free" ? prefix : prefix + " " + x;
    }
    // Split only outside strings and function parentheses, so gradients, grid areas and quoted content remain intact.
    function split(s, sep) {
      var parts = [], from = 0, depth = 0, quote = "";
      for (var i = 0; i < s.length; i++) { var c = s[i]; if (quote) { if (c === quote) quote = ""; continue; } if (c === '"' || c === "'") quote = c; else if (c === "(") depth++; else if (c === ")") { if (--depth < 0) bad(); } else if (c === sep && !depth) { parts.push(s.slice(from, i)); from = i + 1; } }
      if (depth || quote) bad(); parts.push(s.slice(from)); return parts;
    }
    while (pos < s.length) {
      if (!s.slice(pos).trim()) break;
      var open = s.indexOf("{", pos), end = s.indexOf("}", open); if (open < 0 || end < 0) bad();
      var selectors = split(s.slice(pos, open), ",").map(selector), body = s.slice(open + 1, end), decls = [];
      if (/[{}]/.test(body)) bad();
      split(body, ";").forEach(function (decl) {
        if (!decl.trim()) return; var colon = decl.indexOf(":"), p = decl.slice(0, colon).trim(), v = decl.slice(colon + 1).trim();
        if (!d.css.properties.includes(p)) bad(propertyError(p));
        if (colon < 0 || !v || /!/.test(v)) bad();
        var low = v.toLowerCase().replace(/\s+/g, " ");
        if (d.css.forbiddenValues.some(function (x) { return low.includes(x); }) || /(?:url|expression|image-set|element)\s*\(|javascript\s*:/.test(low)) bad();
        if (p === "font-family" && !d.css.fontFamilyValues.includes(v) || p === "text-align" && low === "justify" || p === "position" && /^(fixed|sticky)$/.test(low)) bad();
        if (p === "content" && !/^(?:"[^"\n]*"|'[^'\n]*')$/.test(v)) bad();
        var funcs = [...v.matchAll(/([a-zA-Z][a-zA-Z0-9-]*)\s*\(/g)].map(function (m) { return m[1]; });
        if (funcs.some(function (f) { return !/^(var|calc|min|max|clamp|repeat|minmax|rgb|rgba|hsl|hsla|linear-gradient|rotate|scale|scaleX|scaleY|translate|translateX|translateY)$/.test(f); })) bad();
        if (/var\(\s*(?!--cs-[a-z0-9-]+\s*\))/.test(v)) bad();
        if (p === "transform" && (funcs.some(function (f) { return !/^(rotate|scale|scaleX|scaleY|translate|translateX|translateY|var|calc)$/.test(f); }) || !/^(none|(?:rotate|scale|translate)[XY]?\()/.test(v))) bad();
        if ((p === "background" || p === "background-color") && /gradient/.test(low) && (p !== "background" || !/^linear-gradient\(\s*[+-]?(?:\d+(?:\.\d*)?|\.\d+)deg\s*,/.test(v))) bad();
        split(v, "\u0000"); decls.push(p + ":" + v);
      });
      out.push(selectors.join(",") + "{" + decls.join(";") + "}"); pos = end + 1;
    }
    return out.join("\n");
  }
  function artContext(cx, tk) {
    return { slideId: cx.id, seed: cx.id + "|free", rtl: cx.dir !== "ltr", lang: cx.lang, digits: cx.digits, tokens: tk, art: cx.tokens.art || {}, data: { pack: V._.block("cs-icon-pack"), objects: V._.block("cs-icon-objects"), marks: V._.block("cs-art-marks") } };
  }
  function markExtra(A, m, U, ctx, o, name) {
    if (/^arrow/.test(name)) { var p = [U.x + U.w / 2, U.y + U.h + 8]; return A.place(m, { from: p, to: [p[0] + (name === "arrow-hook" ? (ctx.rtl ? -70 : 70) : 0), p[1] + 72] }, ctx, o); }
    var size = Math.min(72, Math.max(36, U.h * .6));
    return A.place(m, { x: U.x - size * .7, y: U.y - size * .4, w: size, h: size }, ctx, o);
  }
  function markColor(r, node, cx, underline) {
    var st = getComputedStyle(node), base = cx?.tokens?.roles || {}, tk = {};
    ["bg", "surface", "ink", "accent", "accent2"].forEach(function (k) { tk[k] = st.getPropertyValue("--cs-" + (k === "accent2" ? "accent-2" : k)).trim() || base[k]; });
    r.c = CS.art.marks.color(tk, underline ? "ink" : "accent");
  }
  function tone(n, tk, base) {
    // A local panel has one ground. A brand can make the preset's two-ground ink unattainable;
    // recheck it against this panel's actual ground before handing the palette to its art.
    tk = Object.assign({}, tk);
    // A tone that keeps the slide ground and moves the surface (creator field: a yellow card on paper) paints the surface.
    if (base && tk.bg === base.bg && tk.surface && tk.surface !== base.surface) tk.bg = tk.surface;
    ["ink", "inkMuted"].forEach(function (k) { tk[k] = C.color.ensureContrast(tk[k] || tk.ink, tk.bg, 4.5).hex; });
    ["bg", "surface", "ink", "inkMuted", "accent", "onAccent", "line"].forEach(function (k) { if (tk[k]) n.style.setProperty("--cs-" + ({ inkMuted: "ink-muted", onAccent: "on-accent" }[k] || k), tk[k]); });
    n.style.backgroundColor = "var(--cs-bg)"; n.style.color = "var(--cs-ink)";
    return tk;
  }
  function compose(cx) {
    if (!active(cx.slide)) return null;
    var tree = parse(cx.slide.free.html), scoped = css(cx.slide.free.css, cx.id), main = document.createElement("main"), seq = 0, edits = 0, marks = 0;
    main.className = "cs-content cs-free"; main.dataset.layer = "content"; main.dir = cx.dir;
    function label(n, text, path) {
      var role = n.getAttribute("data-role") || (/^(title|headline)$/.test(path) || /^H[23]$/.test(n.tagName) ? "h2" : "body");
      C.compose.label(n, text, cx, { slot: path || "free", index: seq++, role: role });
      n.dataset.floor = role === "body" ? "42" : "30"; n.dataset.fit = "css";
    }
    function build(node, parent, tk, editable) {
      if (node.text !== undefined) {
        if (!node.text.trim()) { parent.appendChild(document.createTextNode(node.text)); return; }
        var span = document.createElement("span");
        if (editable) span.innerHTML = C.compose.html(node.text, cx);
        else { span.dataset.role = parent.getAttribute("data-role") || (/^H[23]$/.test(parent.tagName) ? "h2" : "body"); label(span, node.text); span.dataset.freeLiteral = "1"; }
        parent.appendChild(span); return;
      }
      var n = document.createElement(node.tag), a = node.attrs;
      Object.keys(a).forEach(function (k) { n.setAttribute(k, a[k]); }); parent.appendChild(n);
      if (a["data-picture"]) {
        n.classList.add("cs-media-slot"); n.dataset.slot = "media"; n.dataset.kind = "media"; n.dataset.m = "media";
        C.compose.media(n, { slot: "photo", assetId: a["data-picture"], imageOnly: true, calmZone: "bottom" }, cx);
        if (n.firstElementChild) n.firstElementChild.style.objectFit = a["data-fit"] || "cover";
        return;
      }
      if (a["data-tone"]) { var name = a["data-tone"]; tk = cx.tokens.tones?.[name] || (name === "s1" || name === "s2" ? Object.assign({}, tk, { bg: cx.tokens.css["--cs-art-" + name] || tk.surface, ink: C.color.onColor(cx.tokens.css["--cs-art-" + name] || tk.surface), inkMuted: C.color.onColor(cx.tokens.css["--cs-art-" + name] || tk.surface) }) : tk); tk = tone(n, tk, cx.tokens.roles); }
      var path = a["data-field"], isEdit = Object.hasOwn(a, "data-edit") && !path;
      if (path && editable) fail("data-edit must contain literal copy only");
      if (path) { label(n, value(cx.slide, path), path); n.dataset.edit = "text"; }
      else if (isEdit && !editable) {
        n.dataset.freeEdit = edits++; n.dataset.edit = "text";
        // One editable literal owns its complete subtree; labels inside it retain the authored inline structure.
        n.dataset.slotKey = cx.id + ".free-edit." + n.dataset.freeEdit; n.dataset.slot = "free"; n.dataset.kind = "text"; n.dataset.role = a["data-role"] || (/^H[23]$/.test(n.tagName) ? "h2" : "body"); n.dataset.fit = "css"; n.dataset.field = "free-edit." + n.dataset.freeEdit;
        node.children.forEach(function (ch) { build(ch, n, tk, true); });
      } else { n.removeAttribute("data-edit"); node.children.forEach(function (ch) { build(ch, n, tk, editable); }); }
      var A = CS.art, ctx = artContext(cx, tk), art;
      if (a["data-icon"]) art = A?.icon?.(a["data-icon"], { ctx: ctx, size: a["data-size"] || "md", treatment: a["data-treatment"] || "bare" });
      else if (a["data-object"]) art = A?.object?.(a["data-object"], { ctx: ctx, size: contract().art.object.sizes.includes(a["data-size"]) ? a["data-size"] : "md", treatment: a["data-treatment"] || "bare" });
      if (art) n.appendChild(art);
      if (a["data-mark"]) { n.dataset.markTarget = a["data-mark"]; n.dataset.markId = cx.id + "-free-" + marks++; }
    }
    tree.children.forEach(function (n) { build(n, main, cx.tokens.roles, false); });
    var style = document.createElement("style"); style.dataset.csFreeCss = ""; style.textContent = base(cx.id) + (scoped || ""); main.appendChild(style);
    return main;
  }
  V.free = { active: active, contract: contract, parse: parse, sanitize: sanitize, literals: literals, css: css, field: field, value: value, edit: edit, expected: expected, compose: compose, markExtra: markExtra, markColor: markColor };
})();
})();
