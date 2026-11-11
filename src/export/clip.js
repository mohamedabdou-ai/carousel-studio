/* Clip covers use the browser compositor in every lane. The encoded first frame supplies every still. */
async function clipDeck(spec, ctx, signal) {
  var first = spec.slides && spec.slides[0];
  return CS.core.render.deck(X.mp4.clip.layoutSpec(spec), ctx.brand || null,
    deckOptions(ctx, { slideIds: first ? [first.id] : undefined, signal: signal }));
}

async function renderClipCover(spec, ctx, o) {
  var signal = o.signal || ctx.signal, deck = await clipDeck(spec, ctx, signal), prep;
  var started = performance.now();
  try {
    prep = await X.mp4.clip.prepare(spec, deck.slides[0].el, deck.tokens, signal);
    var variants = o.variants || ["3x4"], small = makeCanvas(108, 144), stats = [], firstContent;
    var bytes = await X.mp4.encodeMany({
      canvases: variants.map(function (v) { return v === "4x5" ? { canvas: prep.canvas, y: 45, height: 1350 } : prep.canvas; }),
      frames: prep.frames, fps: FPS_EXPORT, signal: signal,
      onProgress: function (p) { reportProgress(o, p); },
      drawFrame: async function (i) {
        await prep.drawFrame(i);
        var s = lumaStats(prep.canvas, small); stats.push(s);
        if (i === 0) firstContent = s.deviating;
        if (s.deviating < Math.max(BLANK_PIXELS, firstContent * THIN_SHARE)) throw exportError("E_NO_CAPABILITY",
          "Clip frame " + i + " (" + (i / FPS_EXPORT).toFixed(3) + " s) is blank or nearly blank. Choose a different clip segment.", { reason: "clip-blank", frame: i });
      }
    });
    var files = [], info = [], posters = {}, stills = [];
    for (var k = 0; k < variants.length; k++) {
      var v = variants[k], file = v + "/01-cover.mp4";
      var poster = await X.mp4.clip.decodePoster(bytes[k]), last = await X.mp4.clip.decodePoster(bytes[k], (prep.frames - 1) / FPS_EXPORT);
      posters[v] = poster;
      files.push(makeFile(file, bytes[k], { w: 1080, h: poster.height }));
      // Both metrics compare decoded pixels. The PNG never takes a second colour trip through the encoder.
      info.push(Object.assign({ file: file, kind: "clip", ending: prep.ending, endpointSsim: prep.endpointSsim,
        loop: { frame0VsPoster: loopMetrics(poster, poster), lastVsFrame0: loopMetrics(last, poster) }, blankFrames: 0,
        constantRate: true, audio: "none", flashesPerSecondMax: clipFlashes(stats),
        composeSeconds: Math.round((performance.now() - started) / 10) / 100 }, headerFacts(bytes[k])));
      var type = v === "4x5" ? "jpeg" : "png";
      stills.push(makeFile(v + "/01-cover." + (type === "png" ? "png" : "jpg"), await encodeBytes(poster, type === "png" ? "image/png" : "image/jpeg", JPEG_QUALITY), { w: 1080, h: poster.height }));
    }
    return { files: files, info: info, stills: stills, posters: posters, composition: null,
      mediaPoster: prep.mediaPoster.toDataURL("image/png"), timeline: { duration: prep.duration, frames: prep.frames, fps: FPS_EXPORT, recipe: "clip", ending: prep.ending } };
  } finally { if (prep) prep.close(); deck.dispose(); }
}

function clipFlashes(stats) {
  var jumps = [], max = 0;
  stats.forEach(function (s, i) {
    if (i && Math.abs(s.mean - stats[i - 1].mean) > FLASH_DELTA) jumps.push(i);
    max = Math.max(max, jumps.filter(function (j) { return j > i - FPS_EXPORT; }).length);
  });
  return max;
}

/** A one-frame encode is enough for a preview with the same encoder colour path as the full cover. */
async function previewClipCover(spec, ctx) {
  ctx = ctx || {};
  var deck = await clipDeck(spec, ctx, ctx.signal), prep;
  try {
    prep = await X.mp4.clip.prepare(spec, deck.slides[0].el, deck.tokens, ctx.signal);
    var bytes = await X.mp4.encode({ canvas: prep.canvas, frames: 1, fps: FPS_EXPORT, signal: ctx.signal, drawFrame: prep.drawFrame });
    return X.mp4.clip.decodePoster(bytes);
  } finally { if (prep) prep.close(); deck.dispose(); }
}

X.clipPoster = previewClipCover;
