/*
 * CS.motion · mount(): a live player for the Studio's Motion screen.
 * It drives the same engine the exporter uses (inline styles, driver "style"), so what the user previews is what gets exported.
 */

function mountPlayer(slideEl, timeline, opts) {
  opts = opts || {};
  var engine = hfEngine().attach(slideEl, timeline, { driver: "style" });
  var duration = timeline.duration, fps = timeline.fps || FPS, frames = timeline.frames || Math.round(duration * fps);
  var st = { t: 0, playing: false, loop: opts.loop !== false, raf: 0, last: 0, destroyed: false };
  var player = {
    get duration() { return duration; },
    get fps() { return fps; },
    get frames() { return frames; },
    get time() { return st.t; },
    set time(v) { player.seek(v); },
    get playing() { return st.playing; },
    get loop() { return st.loop; },
    set loop(v) { st.loop = !!v; },
    onframe: null,
    seek: function (t) {
      if (st.destroyed) return;
      st.t = clampNum(Number(t) || 0, 0, duration);
      engine.seek(st.t);
      emitFrame();
    },
    seekFrame: function (i) { player.seek(clampNum(Math.round(i), 0, frames - 1) / fps); },
    play: function () {
      if (st.destroyed || st.playing) return;
      if (st.t >= duration) st.t = 0;
      st.playing = true; st.last = 0;
      st.raf = requestAnimationFrame(tick);
    },
    pause: function () { st.playing = false; if (st.raf) cancelAnimationFrame(st.raf); st.raf = 0; },
    toggle: function () { if (st.playing) player.pause(); else player.play(); },
    poster: function () { player.seek(0); },
    destroy: function () {
      if (st.destroyed) return;
      player.pause(); st.destroyed = true; engine.destroy();
    }
  };

  function emitFrame() {
    if (typeof player.onframe === "function") player.onframe(st.t);
    if (typeof CS.emit === "function") CS.emit("cs:motion-frame", { t: st.t });
  }

  function tick(now) {
    if (!st.playing) return;
    var dt = st.last ? (now - st.last) / 1000 : 0;
    st.last = now;
    st.t += Math.min(dt, 0.1);
    if (st.t >= duration) {
      if (st.loop) st.t = st.t % duration;
      else { st.t = duration; engine.seek(duration); emitFrame(); player.pause(); return; }
    }
    engine.seek(st.t);
    emitFrame();
    st.raf = requestAnimationFrame(tick);
  }

  engine.seek(0);
  if (opts.autoplay) player.play();
  return player;
}
