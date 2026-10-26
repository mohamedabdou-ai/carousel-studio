/* E2a: exercise the actual hooks with deterministic builders, through the real render/fit/freeze pipeline. */
(function () {
  var test=CST.test, eq=CST.eq, assert=CST.assert, C=CS.core, hooks, init;
  function load(url) { return new Promise(function(ok,no){var s=document.createElement("script");s.src=url;s.onload=ok;s.onerror=no;document.head.appendChild(s)}); }
  async function setup() {
    await FX.setup();
    if (!init) init=(async function(){
      var p=JSON.parse(JSON.stringify(C.registry.getPreset("swiss")));
      // Stable fixture: shipping preset styling changes independently of compose.
      var art={"art":{"stroke":2.5,"cap":"round","join":"round","container":"disc","radius":{"chip":999,"tile":28,"card":36,"panel":36,"window":36},"shadow":{"kind":"hard","dx":6,"dy":6},"outline":4,"objectOutline":0.035,"outlineColor":"ink","fill":"flat","wobble":0.2,"tilt":6,"texture":"grain","doodle":"marker","colors":{"note":"#FFE88A","support":["#FF8FB1","#6EC6FF"]},"mark":"outline","badge":"star","fills":{"giant":"surface"},"hand":{"family":"playpen-sans-arabic","wght":700},"chipOffset":0,"templates":["pile","trio","duo-stack","versus"],"affinity":{"icon":0.8,"scene":0.6,"rows":0.5,"numeral":0.8,"chart":0.5,"mock":0.8,"photo":0.7,"field":0.7,"word":0.9,"pattern":0.4},"marks":["arrow","circle","underline","strike","doodle"],"rail":{"style":"dots"},"thread":{"style":"none"},"motif":"corner-sticker"},"tones":{"invert":{"roles":{"bg":{"mix":["ink","bg",0.005]},"surface":{"mix":["ink","bg",0.03]},"ink":"bg","inkMuted":{"muted":4.7},"accent":"accent"}},"field":{"roles":{"bg":"bg","surface":"accent","ink":"ink","inkMuted":"ink","accent":"surface"}}}};
      p.id="visual-test";p.art=art.art;p.tones=art.tones;C.registry.registerPreset(p,"");
      await load("/src/visual/root.js");await load("/src/visual/hooks.js");hooks=CS.visual;
    })();
    await init;CS.visual=hooks;
  }
  function spec(h) {
    var s=FX.example();s.style.presetId="visual-test@1.0";s.style.overrides={};s.canvas.h=h||1440;
    s.slides[2].visual={recipe:"under",tone:"base",anchor:{kind:"word",word:"اختيارك",wordStyle:"solid"}};
    s.slides[2].body="اختار خطوة واحدة وابدأ بيها النهارده. ".repeat(3);
    return s;
  }
  function builder(calls) {
    CS.art={build:function(a,c){
      calls.push(c);assert(Object.isFrozen(c.slide)&&Object.isFrozen(c.slide.visual),"deep frozen slide");
      if(c.slide.visual)assert(c.visual===c.slide.visual,"visual aliases the frozen slide plan");
      var label=document.createElement("p");label.className="cs-art-label";
      label.style.cssText="font-size:44px;max-width:100%;margin:0";
      var result={el:null,boxes:[],labels:[{el:label,text:a.captions?.[0]||"2,500 خطوة واضحة",index:0,role:"body"}]};
      if(c.labelsOnly)return result;
      var el=document.createElement("div");el.className="cs-art";
      el.style.cssText="display:flex;align-items:center;justify-content:center;box-sizing:border-box;border:4px solid #111111;border-radius:24px;background:#F4CF50;width:"+c.box.w+"px;height:"+c.box.h+"px";
      el.appendChild(label);result.el=el;return result;
    },icon:function(){var n=document.createElement("span");n.className="cs-icon";return n}};
  }
  test("visual compose: absence, off and art-less presets preserve baseline bytes twice",async function(){
    await setup();var s=spec();s.style.visualMode="off";
    var absent=CS.visual;delete CS.visual;var a=FX.build(s,2).outerHTML;CS.visual=absent;
    eq(FX.build(s,2).outerHTML,a);eq(FX.build(s,2).outerHTML,a);
    s.style.presetId="swiss@1.0";delete s.style.visualMode;
    a=FX.build(s,2).outerHTML;delete CS.visual;eq(FX.build(s,2).outerHTML,a);CS.visual=absent;
    eq(FX.build(s,2).outerHTML,a);
  });
  test("visual compose: labels, NBSP, grouped LTR numbers, floors and expected text twice",async function(){
    await setup();var calls=[];builder(calls);var s=spec(),a=FX.build(s,2),b=FX.build(s,2);
    eq(a.outerHTML,b.outerHTML);var lab=a.querySelector('[data-slot-key="s03.art.0"]');
    assert(lab,"indexed art label");eq(lab.getAttribute("data-floor"),"36");eq(lab.getAttribute("data-role"),"body");
    assert(lab.textContent.includes("2,500\u00a0خطوة"),"number bound to noun");
    eq(lab.querySelector('bdi[dir="ltr"]').textContent,"2,500");
    eq(C.freeze.expectedText(s,"s03.art.0"),"2,500 خطوة واضحة");eq(C.freeze.expectedText(s,"s03.art.0"),"2,500 خطوة واضحة");
    assert(calls.some(c=>c.labelsOnly),"expected uses labelsOnly");
    var cx=C.compose.context(s,s.slides[2],C.resolve.slide(C.resolve.post(s,null),s.slides[2]),null,{});
    ["numeral","word","chart","tool"].forEach(function(role){var n=document.createElement("p");C.compose.label(n,"12",cx,{role:role,index:0});eq(+n.getAttribute("data-floor"),{numeral:200,word:220,chart:38,tool:30}[role]);});
  });
  test("visual compose: items keyed by part, rail buckets and row icon hook twice",async function(){
    await setup();builder([]);var s=spec();s.slides[2].type="grid";s.slides[2].items=[{title:"الأولى",text:"2 خطوة",value:"25",hi:true,icon:"check"},{title:"التانية",text:"ابدأ دلوقتي"}];s.style.rail="on";
    var a=FX.build(s,2);eq(a.outerHTML,FX.build(s,2).outerHTML);
    eq(a.querySelectorAll("li.cs-item").length,2);assert(a.querySelector('[data-slot-key="s03.items-text.0"][data-part="text"]'),"items text key");
    assert(a.querySelector('[data-slot-key="s03.items-value.0"]'),"items value key");eq(a.querySelectorAll(".cs-rail-seg").length,8);
    assert(a.querySelector('.cs-counter > .cs-rail > [data-on="1"]'),"rail belongs to counter and its filled segments paint");
    assert(a.querySelector('li.cs-item[data-hi="1"] > [data-part="icon"]'),"highlighted item and icon");
    s.slides[2].visual.rowIcons=["check","check"];var rows=FX.build(s,2);eq(rows.outerHTML,FX.build(s,2).outerHTML);eq(rows.querySelectorAll('li.cs-item > [data-part="icon"]').length,2,"planner rowIcons fill every grid icon slot");
    var icon=CS.art.icon,inks=[];CS.art.icon=function(id,o){inks.push(o.ink);return icon(id,o)};
    try{FX.build(s,2);eq(inks[0],C.resolve.post(s,FX.brand()).tones.base.onAccent,"highlighted cell icon uses its readable on-accent ink")}finally{CS.art.icon=icon}
    eq(a.querySelector('[data-slot-key="s03.items.0"]').textContent,"الأولى");
    var cx=C.compose.context(s,s.slides[2],C.resolve.post(s,null),null,{});cx.total=24;cx.index=23;
    eq(CS.visual.chrome(cx).rail.n,12);eq(CS.visual.chrome(cx).rail.on,11);
    s.style.rail="auto";cx.swipe="arrow-rtl";eq(CS.visual.chrome(cx).rail,null);cx.swipe="neutral";eq(CS.visual.chrome(cx).rail.style,"quiet");
    s.slides[6].visual={rowIcons:["check"]};s.slides[6].visual.anchor=null;
    assert(FX.build(s,6).querySelector(".cs-bullet .cs-icon"),"row icon");
  });
  test("visual compose: stored plans, user media, covers, emoji and guarded hook arguments twice",async function(){
    await setup();var calls=[];builder(calls);var s=spec(),preview=CS.visual.autoPreview,fill=CS.visual.fill,seen=[];
    CS.visual.autoPreview=function(){seen.push("preview");return []};
    CS.visual.fill=function(k,c,arg){seen.push(k);assert(c.id&&c.slide&&c.tokens,"compose context");return fill(k,c,arg)};
    try {
      var first=FX.build(s,2).outerHTML;eq(FX.build(s,2).outerHTML,first);assert(!seen.includes("preview"),"stored plan wins");
      s.slides[2].media={slot:"screenshot",assetId:"user-image"};
      first=FX.build(s,2).outerHTML;eq(FX.build(s,2).outerHTML,first);assert(!first.includes('data-anchor-kind='),"user asset wins");
      s.slides[2].visual=null;FX.build(s,2);FX.build(s,2);eq(seen.filter(x=>x==="preview").length,2);
      first=FX.build(s,0).outerHTML;eq(FX.build(s,0).outerHTML,first);assert(!first.includes('data-tone='),"cover has no visual hook markup");
      assert(seen.includes("anchor"),"canonical anchor kind");
      CS.visual._.blocks={"cs-emoji-map":{map:{"💡":"lightbulb"}}};s=spec();s.slides[2].body="💡 فكرة واضحة";
      first=FX.build(s,2).outerHTML;eq(FX.build(s,2).outerHTML,first);assert(!FX.build(s,2).querySelector(".cs-emoji"),"known emoji replaced");
      var cx=C.compose.context(s,s.slides[2],C.resolve.post(s,null),null,{});CS.visual.begin(cx);
      assert(!CS.visual.fill("emoji",cx,"unknown"),"unknown emoji has no fabricated icon");
    } finally {CS.visual.autoPreview=preview;CS.visual.fill=fill;delete CS.visual._.blocks;}
  });
  test("visual compose: both canvases bound rebuilds, wrapped labels, freeze replay and update twice",async function(){
    await setup();
    window.__CST_VISUALS=[];
    for(var h of [1440,1350]){
      var calls=[];builder(calls);var s=spec(h);s.slides[2].visual.anchor.captions=["اختار خطوة واضحة وابدأ بيها قبل ما تختار خطوة تانية خالص"];
      var a=await C.render.slide(s,FX.brand(),2,{mode:"export"});
      window.__CST_VISUALS.push(a.el.cloneNode(true));
      var builds=calls.filter(c=>!c.labelsOnly);eq(builds.length,2,"one rebuild after fit");
      var measured=C.freeze.visual.get("s03").anchor;assert(measured.h>0&&measured.h!==420,"measured anchor box");
      assert(a.el.querySelectorAll('.cs-art-label .cs-ln').length>1,"wrapped label");
      s.frozen=C.freeze.capture([a],s,C.resolve.post(s,FX.brand()));
      assert(s.frozen.visual.anchors.s03,"anchor captured");var html=a.el.outerHTML;
      calls.length=0;var b=await C.render.slide(s,FX.brand(),2,{mode:"export"});
      eq(calls.filter(c=>!c.labelsOnly).length,1,"frozen replay never rebuilds");
      eq(b.el.querySelector(".cs-art").style.height,measured.h+"px");
      eq(b.el.querySelector(".cs-art-label").textContent,a.el.querySelector(".cs-art-label").textContent);
      eq(C.freeze.visual.get("s03").anchor.h,measured.h);
      var d=await C.render.slide(s,FX.brand(),2,{mode:"export"});eq(b.el.outerHTML,d.el.outerHTML,"replay deterministic");
      delete s.frozen;calls.length=0;await C.render.update(b,s,FX.brand(),{mode:"thumb"});eq(calls.filter(c=>!c.labelsOnly).length,2,"update keeps context with main");
      a.el.remove();b.el.remove();d.el.remove();assert(html.length>0);
    }
  });
  test("visual compose: unavailable art and a rejected measured box leave no ghost anchor twice",async function(){
    await setup();var s=spec();CS.art={};var a=FX.build(s,2);eq(a.outerHTML,FX.build(s,2).outerHTML);assert(!a.querySelector(".cs-anchor-slot"),"missing builder drops optional slot");
    builder([]);var build=CS.art.build;
    CS.art.build=function(a,c){return c.labelsOnly||c.box.h===420?build(a,c):null};
    var first=await C.render.slide(s,FX.brand(),2,{mode:"thumb"}),second=await C.render.slide(s,FX.brand(),2,{mode:"thumb"});
    eq(first.el.outerHTML,second.el.outerHTML);assert(!first.el.querySelector(".cs-anchor-slot"),"rebuild failure drops slot");
    assert(!first.el.querySelector("[data-recipe]")&&!first.el.hasAttribute("data-anchor-kind"),"no ghost metadata");first.el.remove();second.el.remove();
  });
  test("visual compose: thread enum and preset data, motif and geometry twice",async function(){
    await setup();builder([]);var original=C.registry.getPreset("visual-test"),p=JSON.parse(JSON.stringify(original));
    try {
      for(var thread of [{style:"line"},{style:"none"},null]){
        if(thread)p.art.thread=thread;else delete p.art.thread;C.registry.registerPreset(p,"");
        for(var mode of [undefined,"off","on"]){
          var s=spec();if(mode)s.style.thread=mode;
          var a=FX.build(s,2);eq(a.outerHTML,FX.build(s,2).outerHTML);
          eq(a.querySelectorAll(".cs-thread").length,mode==="on"&&thread?.style==="line"?1:0);
        }
      }
      var s=spec();s.style.motif="check";var a=FX.build(s,2);
      eq(a.outerHTML,FX.build(s,2).outerHTML);assert(a.querySelector(".cs-header > .cs-icon"),"motif in header");
      var t=C.resolve.slide(C.resolve.post(s,null),s.slides[2]);t.presetId="poster";
      for(var type of ["poster","item"]){
        var slide={...s.slides[2],type},c=C.compose.context(s,slide,t,null,{});
        CS.visual.begin(c);CST.deepEq(c.zone,C.registry.geometry(s.canvas.h,{inner:type!=="poster",presetId:"poster",type}).zone);
        CS.visual.begin(c);CST.deepEq(c.zone,C.registry.geometry(s.canvas.h,{inner:type!=="poster",presetId:"poster",type}).zone);
      }
    } finally {C.registry.registerPreset(original,"");}
  });
  test("visual compose: library-only load does not require core.freeze twice",async function(){
    var source=await fetch("/src/visual/hooks.js").then(r=>r.text());
    for(var i=0;i<2;i++){var cs={core:{},visual:{}};new Function("CS",source)(cs);assert(typeof cs.visual.begin==="function","lazy core dependencies");}
  });
  test("visual compose: brand preview freezes and verifies once per render twice",async function(){
    await setup();var preview=CS.visual.autoPreview,post=C.resolve.post,verify=C.freeze.verify;
    try {
      CS.visual.autoPreview=function(s,b){return s.slides.map(()=>({recipe:"under",anchor:{kind:b?.visual?.art?.prefer?.[0]||"icon",word:"???????"}}))};
      builder([]);var build=CS.art.build;
      CS.art.build=function(a,c){var b=build(a,c);b.labels[0].text=c.brand?.name||"";return b};
      var s=spec(),brand=FX.brand();delete s.slides[2].visual;brand.visual={art:{prefer:["word"]}};
      var a=await C.render.slide(s,brand,2,{mode:"export"});
      eq(a.el.dataset.anchorKind,"word");eq(C.freeze.expectedText(s,"s03.art.0"),brand.name);
      s.frozen=C.freeze.capture([a],s,post(s,brand));var count=0,posts=0;
      C.freeze.verify=function(...args){count++;return verify(...args)};
      C.resolve.post=function(...args){posts++;return post(...args)};
      var previous;
      for(var i=0;i<2;i++){
        count=posts=0;var b=await C.render.slide(s,brand,2,{mode:"export"});
        eq(count,1,"one verification");eq(posts,1,"one post resolution including expected labels");
        eq(b.el.querySelector(".cs-art").outerHTML,a.el.querySelector(".cs-art").outerHTML);
        if(previous)eq(b.el.outerHTML,previous);previous=b.el.outerHTML;b.el.remove();
      }
      var opts=Object.freeze({mode:"thumb"});var d=await C.render.deck(s,brand,opts);eq(count,2,"one verification for whole deck");d.dispose();
      a.el.remove();
    } finally {CS.visual.autoPreview=preview;C.resolve.post=post;C.freeze.verify=verify;}
  });
  test("visual compose: real registered word builder renders and replays on both canvases twice",async function(){
    await setup();await load("/src/art/root.js");await load("/src/art/kit.js");await load("/src/art/word.js");
    window.__CST_VISUALS=[];
    for(var h of [1440,1350]){
      var s=spec(h);s.slides[2].body="اختار خطوة واحدة وابدأ بيها النهارده.";
      var a=await C.render.slide(s,FX.brand(),2,{mode:"export"}),b=await C.render.slide(s,FX.brand(),2,{mode:"export"});
      eq(a.el.outerHTML,b.el.outerHTML);assert(a.el.querySelector('.cs-art[data-anchor-kind="word"]'),"actual registered builder");
      eq(a.el.querySelector('[data-slot-key="s03.art.0"]').getAttribute("data-floor"),"220");
      s.frozen=C.freeze.capture([a],s,C.resolve.post(s,FX.brand()));
      var c=await C.render.slide(s,FX.brand(),2,{mode:"export"}),d=await C.render.slide(s,FX.brand(),2,{mode:"export"});
      eq(c.el.outerHTML,d.el.outerHTML);eq(c.el.querySelector('.cs-art').outerHTML,a.el.querySelector('.cs-art').outerHTML,"real art freeze bytes");
      window.__CST_VISUALS.push(c.el.cloneNode(true));[a,b,c,d].forEach(r=>r.el.remove());
    }
  });
  /* ---- SLOT-OWNERSHIP: one owner per text, mark targets, statement role, item part roles ------------------------- */
  async function canonSub(){var src=await fetch("/src/art/root.js").then(r=>r.text()),cs={};new Function("CS",src)(cs);return cs.art._.sub}
  /* A builder that draws `words` as labels. mode "refuse": null on any box but the predicted 420 px one; "none": always null. */
  function drawing(calls,words,sub,mode){
    CS.art={_:{sub:sub},build:function(a,c){
      calls.push(c);var L=words.map(function(t,i){var p=document.createElement("p");p.className="cs-art-label";p.style.cssText="margin:0";return{el:p,text:t,index:i,role:"body"}});
      if(c.labelsOnly)return{el:null,boxes:[],labels:L};
      if(mode==="none"||(mode==="refuse"&&c.box.h!==420))return null;
      var el=document.createElement("div");el.className="cs-art";el.style.cssText="box-sizing:border-box;border:4px solid #111;background:#F4CF50;width:"+c.box.w+"px;height:"+Math.min(c.box.h,300)+"px";
      L.forEach(function(l){el.appendChild(l.el)});var m=document.createElement("mark");m.className="cs-em";m.textContent="x";el.appendChild(m);return{el:el,boxes:[],labels:L};
    },icon:function(){var n=document.createElement("span");n.className="cs-icon";return n}};
  }
  /* the fixture preset lists the variants its own layouts use; the ones the hooks react to are added for one test */
  async function withVariants(fn){
    var original=C.registry.getPreset("visual-test"),p=JSON.parse(JSON.stringify(original));
    p.variants.item.push("numeral");p.variants.rehook.push("statement");p.variants.quote.push("statement");C.registry.registerPreset(p,"");
    try {await fn()} finally {C.registry.registerPreset(original,"")}
  }
  function names(root){return Array.from(root.querySelector(".cs-content").children).map(function(n){return n.getAttribute("data-slot")})}
  function compareSpec(){
    var s=spec(),x=s.slides[5];x.type="compare";x.variant="before-after";x.sides=[{label:"قبل",text:"نصايح لكتابة كابشن"},{label:"بعد",text:"الكابشن اللي خلّى بوستي يتحفظ"}];
    x.visual={recipe:"full",tone:"base",anchor:{kind:"field"}};return s;
  }
  var SIDES=["قبل","نصايح لكتابة كابشن","بعد","الكابشن اللي خلّى بوستي يتحفظ"];
  function flat(t){return t.replace(/\s+/g,"")}
  function copies(root,text){return Array.from(root.querySelectorAll("*")).filter(function(n){return flat(n.textContent)===flat(text)&&!Array.from(n.children).some(function(c){return flat(c.textContent)===flat(text)})}).length}
  test("visual compose: an anchor that draws every word owns the native slot, and the slot returns in place when the measured box refuses it twice",async function(){
    await setup();var sub=await canonSub(),calls=[],s=compareSpec();
    drawing(calls,SIDES,sub);var a=FX.build(s,5);eq(a.outerHTML,FX.build(s,5).outerHTML);
    assert(!a.querySelector('[data-slot="sides"]'),"owned sides leave the slide");assert(a.querySelector(".cs-anchor-slot .cs-art"),"anchor drawn");
    SIDES.forEach(function(t){eq(copies(a,t),1,"one copy of "+t)});
    var bare=compareSpec();bare.slides[5].visual={recipe:"under",tone:"base",anchor:{kind:"none"}};
    drawing(calls=[],SIDES,sub,"none");var plain=await C.render.slide(bare,FX.brand(),5,{mode:"thumb"});
    drawing(calls=[],SIDES,sub,"refuse");
    var first=await C.render.slide(s,FX.brand(),5,{mode:"thumb"}),second=await C.render.slide(s,FX.brand(),5,{mode:"thumb"});
    eq(first.el.outerHTML,second.el.outerHTML);eq(calls.filter(function(c){return !c.labelsOnly}).length,4,"built, then refused on the measured box, twice");
    eq(first.el.querySelectorAll(".cs-side-text").length,2,"native sides are back");assert(!first.el.querySelector(".cs-anchor-slot")&&!first.el.querySelector("[data-recipe]")&&!first.el.hasAttribute("data-anchor-kind"),"no ghost anchor");
    CST.deepEq(names(first.el),names(plain.el),"restored at the original position");
    ["نصايح لكتابة كابشن","الكابشن اللي خلّى بوستي يتحفظ"].forEach(function(t){eq(copies(first.el,t),1,"one copy of "+t)});
    drawing(calls=[],["قبل","نصايح لكتابة كابشن"],sub);var part=FX.build(s,5);
    assert(part.querySelector('[data-slot="sides"]'),"words the anchor does not draw keep the native slot");
    drawing(calls=[],SIDES,sub,"none");assert(FX.build(s,5).querySelector('[data-slot="sides"]'),"no anchor, native slot stays");
    [plain,first,second].forEach(function(r){r.el.remove()});
  });
  test("visual compose: rows own bullets, a numeral owns number, a kept native numeral is the anchor twice",async function(){
    await setup();var sub=await canonSub(),calls=[],s=spec(),b=s.slides[6];
    b.visual={recipe:"full",tone:"base",anchor:{kind:"rows"}};
    drawing(calls,b.bullets,sub);var a=FX.build(s,6);eq(a.outerHTML,FX.build(s,6).outerHTML);
    assert(!a.querySelector('[data-slot="bullets"]'),"bullets owned by rows");b.bullets.forEach(function(t){eq(copies(a,t),1,t)});
    drawing(calls,b.bullets.slice(0,2),sub);assert(FX.build(s,6).querySelector('[data-slot="bullets"]'),"a bullet the rows do not draw keeps the list");
    var st=s.slides[4];st.visual={recipe:"under",tone:"base",anchor:{kind:"numeral"}};
    drawing(calls,["5","ساعات"],sub);var n=FX.build(s,4);eq(n.outerHTML,FX.build(s,4).outerHTML);
    assert(!n.querySelector('[data-slot="number"]'),"numeral owns number");assert(n.querySelector(".cs-anchor-slot"),"numeral drawn");
    drawing(calls,["7"],sub);var other=FX.build(s,4);assert(other.querySelector('[data-slot="number"]')&&!other.querySelector('[data-anchor="1"]'),"a different figure leaves the native number alone");
    drawing(calls,["5","ساعات"],sub,"none");var kept=FX.build(s,4);eq(kept.outerHTML,FX.build(s,4).outerHTML);
    assert(kept.querySelector('.cs-number[data-anchor="1"]')&&!kept.querySelector(".cs-anchor-slot"),"native number kept because the builder returned null is the anchor");
    drawing(calls,["5","ساعات"],sub,"refuse");var r1=await C.render.slide(s,FX.brand(),4,{mode:"thumb"});
    assert(r1.el.querySelector('.cs-number[data-anchor="1"]')&&!r1.el.querySelector(".cs-anchor-slot"),"restored number is the anchor");
    eq(r1.el.querySelectorAll('[data-slot="number"]').length,1);r1.el.remove();
    s.slides[4].visual={recipe:"under",tone:"base",anchor:{kind:"icon",icon:"check"}};drawing(calls,[],sub);assert(FX.build(s,4).querySelector('[data-slot="number"]'),"an icon owns nothing");
  });
  test("visual compose: an ordinal numeral keeps the native node as the anchor and builds no art twice",async function(){
    await setup();var sub=await canonSub();await withVariants(async function(){var calls=[],s=spec(),i=s.slides[2];
    i.variant="numeral";i.ord=1;i.visual={recipe:"under",tone:"base",anchor:{kind:"numeral",value:"1",companion:"icon",icon:"check"}};
    drawing(calls,["1"],sub);var a=FX.build(s,2);eq(a.outerHTML,FX.build(s,2).outerHTML);
    eq(a.getAttribute("data-variant"),"numeral");eq(calls.filter(function(c){return !c.labelsOnly}).length,0,"no art is built for the ordinal");
    assert(a.querySelector('.cs-ord[data-anchor="1"]'),"native ordinal carries data-anchor");assert(!a.querySelector(".cs-anchor-slot")&&!a.hasAttribute("data-anchor-kind"),"no anchor slot");
    i.visual.anchor.value="9";drawing(calls,["9"],sub);var o=FX.build(s,2);assert(o.querySelector(".cs-anchor-slot .cs-art"),"another figure is drawn");
    assert(o.querySelector(".cs-ord")&&!o.querySelector('[data-anchor="1"]'),"ordinal stays, not an anchor");
    i.visual.anchor={kind:"numeral",value:"1"};i.variant="side-number";assert(!FX.build(s,2).querySelector('[data-anchor="1"]'),"only the numeral variant");
    });
  });
  test("visual compose: a chat mock owns number only when its words carry the value and the unit twice",async function(){
    await setup();var sub=await canonSub(),calls=[],s=spec(),t=s.slides[4];
    t.type="testimonial";t.body="جرّبت التعديلات في بوست واحد.";t.attribution="متدرّبة";t.number={value:"120",unit:"حفظ"};delete t.title;
    ["chat","notes"].forEach(function(k){
      t.visual={recipe:"under",tone:"base",anchor:{kind:"mock",mock:{kind:k}}};
      drawing(calls,["الحفظ زاد من 40 إلى 120 في بوست واحد"],sub);var a=FX.build(s,4);eq(a.outerHTML,FX.build(s,4).outerHTML);
      assert(!a.querySelector('[data-slot="number"]')&&a.querySelector(".cs-anchor-slot"),k+": value and unit inside the words");
      drawing(calls,["الحفظ زاد من 40 إلى 100 في بوست واحد"],sub);assert(FX.build(s,4).querySelector('[data-slot="number"]'),k+": value missing");
      drawing(calls,["زاد من 40 إلى 120 في بوست واحد"],sub);assert(FX.build(s,4).querySelector('[data-slot="number"]'),k+": unit missing");
    });
    t.visual={recipe:"under",tone:"base",anchor:{kind:"chart",chart:{kind:"bar"}}};drawing(calls,["الحفظ 120"],sub);assert(FX.build(s,4).querySelector('[data-slot="number"]'),"a chart owns no number");
  });
  test("visual compose: mark targets on the first emphasis span with unique ids, never inside the art or on a cover twice",async function(){
    await setup();var sub=await canonSub(),calls=[],s=spec();
    s.slides[2].title="أداة ==التصميم== الأولى";s.slides[2].body="وجرّب ==الثانية== كمان";
    s.slides[2].visual={recipe:"under",tone:"base",marks:["underline","strike","sparkle","kashida"],anchor:{kind:"word",word:"اختيارك"}};
    s.slides[1].headline="غيّرت ==أول سطر== بس";s.slides[1].visual={recipe:"under",tone:"base",marks:["circle"],anchor:{kind:"none"}};
    s.slides[3].title="من غير تمييز";s.slides[3].visual={recipe:"under",tone:"base",marks:["underline"],anchor:{kind:"none"}};
    s.slides[0].headline="غلاف ==واضح==";s.slides[0].visual={marks:["underline"],anchor:{kind:"none"}};
    drawing(calls,["كلمة"],sub);var d=[0,1,2,3].map(function(k){return FX.build(s,k)}),again=FX.build(s,2);
    eq(d[2].outerHTML,again.outerHTML);
    var t=d[2].querySelectorAll("[data-mark-target]");eq(t.length,1,"one target on the slide");
    eq(t[0].getAttribute("data-mark-target"),"underline strike","only the families settle draws");eq(t[0].getAttribute("data-mark-id"),"s03-m0");
    assert(t[0].matches(".cs-title mark.cs-em")&&t[0].textContent==="التصميم","first emphasis span of the title");
    assert(!d[2].querySelector(".cs-art [data-mark-target]"),"never inside the art");
    eq(d[1].querySelector("[data-mark-target]").getAttribute("data-mark-target"),"circle");eq(d[1].querySelector("[data-mark-target]").getAttribute("data-mark-id"),"s02-m0");
    assert(!d[3].querySelector("[data-mark-target]"),"no emphasis span, no mark");assert(!d[0].querySelector("[data-mark-target]"),"covers are untouched");
    var ids=d.map(function(r){return Array.from(r.querySelectorAll("[data-mark-id]")).map(function(n){return n.getAttribute("data-mark-id")})}).flat();eq(new Set(ids).size,ids.length,"unique ids");
    var off=spec();off.style.visualMode="off";off.slides[2].title="أداة ==التصميم==";off.slides[2].visual={recipe:"under",marks:["underline"],anchor:{kind:"none"}};assert(!FX.build(off,2).querySelector("[data-mark-target]"),"off mode");
  });
  test("visual compose: the statement role comes from the hooks, not from the template twice",async function(){
    await setup();var sub=await canonSub();await withVariants(async function(){var calls=[],s=spec();drawing(calls,["x"],sub);
    s.slides[1].variant="statement";s.slides[1].visual={recipe:"under",tone:"base",anchor:{kind:"none"}};
    var q=s.slides[7];q.type="quote";q.body="كلمة صغيرة بتفرق";q.attribution="مدرّب";delete q.title;delete q.cta;q.variant="statement";q.visual={recipe:"under",tone:"base",anchor:{kind:"none"}};
    var saved=[];["rehook","quote"].forEach(function(type){assert(!C.registry.getArchetype(type).template.content.querySelector('[data-role-by-variant*="statement"],[data-max-lines-by-variant*="statement"]'),"statement metadata never leaks into legacy variants")});
    try {
      var a=FX.build(s,1),b=FX.build(s,7);eq(a.outerHTML,FX.build(s,1).outerHTML);eq(b.outerHTML,FX.build(s,7).outerHTML);
      var h=a.querySelector('[data-slot="headline"]'),w=b.querySelector('[data-slot="body"]');
      eq(h.getAttribute("data-role"),"hero");eq(h.getAttribute("data-max-lines"),"4");eq(w.getAttribute("data-role"),"hero");eq(w.getAttribute("data-max-lines"),"4");
      s.slides[1].variant="base";s.slides[7].variant="base";
      eq(FX.build(s,1).querySelector('[data-slot="headline"]').getAttribute("data-role"),"h1","other variants keep their role");
      eq(FX.build(s,7).querySelector('[data-slot="body"]').getAttribute("data-role"),"h2");
      s.slides[1].variant="statement";s.style.visualMode="off";
      eq(FX.build(s,1).querySelector('[data-slot="headline"]').getAttribute("data-role"),"hero","the new statement variant keeps its typography without visual hooks");
    } finally {saved.forEach(function(x){x[0].setAttribute("data-role-by-variant",x[1]);x[0].setAttribute("data-max-lines-by-variant",x[2])})}
    });
  });
  test("visual compose: item part titles are h2, texts and values stay body, keys unchanged twice",async function(){
    await setup();builder([]);var s=spec();s.slides[2].type="timeline";s.slides[2].items=[{title:"الأسبوع الأول",text:"ابدأ",value:"1"},{title:"التاني",text:"كمّل"}];
    var a=FX.build(s,2);eq(a.outerHTML,FX.build(s,2).outerHTML);
    eq(a.querySelector('[data-slot-key="s03.items.0"]').getAttribute("data-role"),"h2");eq(a.querySelector('[data-slot-key="s03.items.1"]').getAttribute("data-role"),"h2");
    eq(a.querySelector('[data-slot-key="s03.items-text.0"]').getAttribute("data-role"),"body");eq(a.querySelector('[data-slot-key="s03.items-value.0"]').getAttribute("data-role"),"body");
    eq(a.querySelectorAll('[data-part="title"]').length,2);
  });
  test("visual compose: the owned-slot decision replays from the frozen box twice",async function(){
    await setup();var sub=await canonSub(),calls=[];
    for(var mode of ["refuse","accept"]){
      var s=compareSpec();drawing(calls=[],SIDES,sub,mode==="refuse"?"refuse":undefined);
      var a=await C.render.slide(s,FX.brand(),5,{mode:"export"});
      var homed=mode==="refuse";eq(!!a.el.querySelector('[data-slot="sides"]'),homed,mode+": first render");
      s.frozen=C.freeze.capture([a],s,C.resolve.post(s,FX.brand()));assert(s.frozen.visual&&s.frozen.visual.anchors.s06,"anchor box stored");
      eq(Object.keys(s.frozen.visual.anchors.s06).sort().join(),"h,w","closed schema");
      calls.length=0;var b=await C.render.slide(s,FX.brand(),5,{mode:"export"}),c=await C.render.slide(s,FX.brand(),5,{mode:"export"});
      eq(calls.filter(function(x){return !x.labelsOnly}).length,2,mode+": one build per replay, never a rebuild");
      eq(!!b.el.querySelector('[data-slot="sides"]'),homed,mode+": replay takes the same decision");eq(!!b.el.querySelector(".cs-anchor-slot"),!homed);
      eq(b.el.outerHTML,c.el.outerHTML,"replay deterministic");
      eq(b.el.querySelectorAll(".cs-side-text").length,homed?2:0);
      [a,b,c].forEach(function(r){r.el.remove()});
    }
    var s2=spec();s2.slides[4].visual={recipe:"under",tone:"base",anchor:{kind:"numeral"}};drawing(calls=[],["5","ساعات"],sub,"refuse");
    var n=await C.render.slide(s2,FX.brand(),4,{mode:"export"});s2.frozen=C.freeze.capture([n],s2,C.resolve.post(s2,FX.brand()));
    var m=await C.render.slide(s2,FX.brand(),4,{mode:"export"});assert(m.el.querySelector('.cs-number[data-anchor="1"]')&&!m.el.querySelector(".cs-anchor-slot"),"replay keeps the native numeral as the anchor");
    n.el.remove();m.el.remove();
  });
  test("visual compose: art-less presets and off mode keep the native slots and the baseline bytes twice",async function(){
    await setup();var sub=await canonSub(),calls=[],s=compareSpec();drawing(calls,SIDES,sub);
    var live=FX.build(s,5).outerHTML;s.style.visualMode="off";var off=FX.build(s,5);eq(off.outerHTML,FX.build(s,5).outerHTML);
    assert(off.querySelector('[data-slot="sides"]')&&!off.querySelector("[data-anchor-kind],[data-anchor],[data-mark-target]"),"off mode: native slots only");
    var absent=CS.visual;delete CS.visual;var bare=FX.build(s,5).outerHTML;CS.visual=absent;eq(off.outerHTML,bare,"off mode equals a page without hooks");
    delete s.style.visualMode;s.style.presetId="swiss@1.0";var sw=FX.build(s,5);eq(sw.outerHTML,FX.build(s,5).outerHTML);
    assert(sw.querySelector('[data-slot="sides"]')&&!sw.querySelector("[data-anchor-kind],[data-anchor],[data-mark-target]"),"art-less preset: native slots only");
    delete CS.visual;bare=FX.build(s,5).outerHTML;CS.visual=absent;eq(sw.outerHTML,bare,"art-less preset equals a page without hooks");assert(live.length>0);
  });
  /* ---- SLOT-OWNERSHIP round 2: symbols are part of the text, field:numeral owns the ordinal ----------------------- */
  function numberSpec(value,unit,anchor){var s=spec(),n=s.slides[4];n.number={value:value,unit:unit};n.visual={recipe:"under",tone:"base",anchor:anchor};return s}
  var ANCHORS={field:{kind:"field",value:"25"},numeral:{kind:"numeral",unit:""}};
  test("visual compose: a symbol unit stays native unless the anchor draws it, owned, restored and replayed twice",async function(){
    await setup();var sub=await canonSub(),calls=[];
    for(var unit of ["%","$"])for(var k of ["field","numeral"]){
      var s=numberSpec("25",unit,ANCHORS[k]),tag=k+" "+unit;
      drawing(calls,["25"],sub);var part=FX.build(s,4);eq(part.outerHTML,FX.build(s,4).outerHTML);
      assert(part.querySelector('[data-slot="number"]'),tag+": the anchor draws 25 only, the native number stays");eq(copies(part,unit),1,tag+": one "+unit);
      drawing(calls,["25",unit],sub);var all=FX.build(s,4);assert(!all.querySelector('[data-slot="number"]')&&all.querySelector(".cs-anchor-slot"),tag+": drawn in full, owned");
      eq(copies(all,unit),1,tag+": one "+unit+" after the hand-over");
      drawing(calls,["25",unit],sub,"refuse");var r=await C.render.slide(s,FX.brand(),4,{mode:"export"});
      assert(r.el.querySelector('[data-slot="number"][data-anchor="1"]')&&!r.el.querySelector(".cs-anchor-slot"),tag+": refused box, native number back as the anchor");
      eq(copies(r.el,unit),1,tag+": the unit is back once");
      s.frozen=C.freeze.capture([r],s,C.resolve.post(s,FX.brand()));var f=await C.render.slide(s,FX.brand(),4,{mode:"export"});
      assert(f.el.querySelector('[data-slot="number"]')&&!f.el.querySelector(".cs-anchor-slot"),tag+": replay takes the same decision");eq(copies(f.el,unit),1);
      drawing(calls,["25",unit],sub);var q=await C.render.slide(s,FX.brand(),4,{mode:"export"});
      s.frozen=C.freeze.capture([q],s,C.resolve.post(s,FX.brand()));var g=await C.render.slide(s,FX.brand(),4,{mode:"export"});
      assert(!g.el.querySelector('[data-slot="number"]')&&g.el.querySelector(".cs-anchor-slot"),tag+": accepted box replays owned");eq(copies(g.el,unit),1);
      [r,f,q,g].forEach(function(x){x.el.remove()});
    }
  });
  test("visual compose: a mock owns number only when its words carry the symbol too, whole numbers only twice",async function(){
    await setup();var sub=await canonSub(),calls=[];
    ["chat","notes"].forEach(function(m){
      var s=numberSpec("25","%",{kind:"mock",mock:{kind:m}});
      drawing(calls,["وصلنا 25 حفظ"],sub);assert(FX.build(s,4).querySelector('[data-slot="number"]'),m+": no percent sign in the words");
      drawing(calls,["وصلنا 25% حفظ"],sub);var a=FX.build(s,4);eq(a.outerHTML,FX.build(s,4).outerHTML);assert(!a.querySelector('[data-slot="number"]')&&a.querySelector(".cs-anchor-slot"),m+": 25% in the words");
      drawing(calls,["وصلنا 25 ٪ حفظ"],sub);assert(!FX.build(s,4).querySelector('[data-slot="number"]'),m+": the Arabic percent sign counts");
      var t=numberSpec("25","حفظ",{kind:"mock",mock:{kind:m}});
      drawing(calls,["وصلنا 125 حفظ"],sub);assert(FX.build(t,4).querySelector('[data-slot="number"]'),m+": 25 is not inside 125");
      drawing(calls,["وصلنا 25 حفظ"],sub);assert(!FX.build(t,4).querySelector('[data-slot="number"]'),m+": value and unit present");
    });
  });
  test("visual compose: a field numeral owns the ordinal on the numeral variant and returns it as the anchor twice",async function(){
    await setup();var sub=await canonSub();await withVariants(async function(){
      var calls=[],s=spec(),i=s.slides[2];i.variant="numeral";i.ord=1;i.visual={recipe:"under",tone:"base",anchor:{kind:"field",value:"1"}};
      drawing(calls,["1"],sub);var a=FX.build(s,2);eq(a.outerHTML,FX.build(s,2).outerHTML);
      assert(!a.querySelector('[data-slot="ord"]')&&a.querySelector(".cs-anchor-slot .cs-art"),"the field draws the ordinal, the native one leaves");eq(copies(a,"1"),1,"one copy of 1");
      drawing(calls,["9"],sub);var o=FX.build(s,2);assert(o.querySelector('[data-slot="ord"]')&&!o.querySelector('[data-anchor="1"]'),"another figure leaves the ordinal alone");
      drawing(calls,["1"],sub);i.variant="side-number";assert(FX.build(s,2).querySelector('[data-slot="ord"]'),"only the numeral variant hands the ordinal over");i.variant="numeral";
      drawing(calls,["1"],sub,"refuse");var r=await C.render.slide(s,FX.brand(),2,{mode:"export"});
      assert(r.el.querySelector('.cs-ord[data-anchor="1"]')&&!r.el.querySelector(".cs-anchor-slot"),"refused box: the ordinal is back and is the anchor");eq(copies(r.el,"1"),1);
      s.frozen=C.freeze.capture([r],s,C.resolve.post(s,FX.brand()));var f=await C.render.slide(s,FX.brand(),2,{mode:"export"});
      assert(f.el.querySelector('.cs-ord[data-anchor="1"]')&&!f.el.querySelector(".cs-anchor-slot"),"replay takes the same decision");eq(copies(f.el,"1"),1);
      r.el.remove();f.el.remove();
    });
  });
})();
