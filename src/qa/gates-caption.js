/* Carousel Studio · cs-qa · gate C9 (caption pack)
 *
 * Runs once a caption pack exists, or from checkpoint "design" on (when the
 * pack must be complete). Lengths follow the CONTRACT: the 300-900 band is
 * counted in code points after NFC, Instagram's hard cap in UTF-16 units.
 */

function gateC9(ctx, out) {
  const spec = ctx.spec;
  const hasPack = isObj(spec.captionPack);
  if (!hasPack && ckptIndex(ctx.checkpoint) < ckptIndex("design")) return;
  const pack = hasPack ? spec.captionPack : {};
  const slides = ctx.slides;
  const caption = assembleCaption(spec);
  const chars = cc(caption);

  if (active(ctx, "C9.length")) {
    const p = param(ctx, "C9.length");
    const lo = p.range[0];
    const hi = p.range[1];
    if (chars < lo || chars > hi) {
      const inFastBand = ctx.fast && chars >= p.fastRange[0] && chars <= p.fastRange[1];
      if (inFastBand) {
        if (active(ctx, "C9.short-caption")) emit(ctx, out, "C9.short-caption", { el: "caption", vars: { count: chars, min: lo } });
      } else {
        emit(ctx, out, "C9.length", { el: "caption", vars: { count: chars, min: lo, max: hi } });
      }
    }
  }

  if (active(ctx, "C9.length-hard")) {
    const units = caption.normalize("NFC").length;
    const max = param(ctx, "C9.length-hard").max;
    if (units > max) emit(ctx, out, "C9.length-hard", { el: "caption", vars: { count: units, max } });
  }

  if (active(ctx, "C9.first-line") && nonEmpty(pack.firstLine)) {
    const n = cc(pack.firstLine);
    const max = param(ctx, "C9.first-line").max;
    if (n > max) emit(ctx, out, "C9.first-line", { el: "caption.firstLine", vars: { count: n, max } });
  }
  if (active(ctx, "C9.first-line-similarity") && nonEmpty(pack.firstLine)) {
    const cover = coverText(spec);
    if (cover) {
      const sim = TX().similarity(strip(pack.firstLine), cover);
      if (sim >= param(ctx, "C9.first-line-similarity").max) {
        emit(ctx, out, "C9.first-line-similarity", { el: "caption.firstLine", vars: { score: Math.round(sim * 100) } });
      }
    }
  }
  if (active(ctx, "C9.keyword-line") && !nonEmpty(pack.keywordLine)) {
    emit(ctx, out, "C9.keyword-line", { el: "caption.keywordLine" });
  }

  if (active(ctx, "C9.hashtags")) {
    const n = TX().tokenize(caption).filter((t) => t.kind === "tag").length;
    const max = param(ctx, "C9.hashtags").max;
    if (n > max) emit(ctx, out, "C9.hashtags", { el: "caption.hashtags", vars: { count: n, max } });
  }
  if (active(ctx, "C9.hashtags-form") && Array.isArray(pack.hashtags)) {
    const seen = new Set();
    pack.hashtags.forEach((h, i) => {
      const key = String(h).normalize("NFC").toLowerCase();
      if (!/^#[^\s\u00A0#]+$/.test(String(h)) || seen.has(key)) {
        emit(ctx, out, "C9.hashtags-form", { el: "caption.hashtags." + i, vars: { text: String(h) } });
      }
      seen.add(key);
    });
  }

  const per = Array.isArray(pack.perSlide) ? pack.perSlide : [];
  const alt = Array.isArray(pack.alt) ? pack.alt : [];
  slides.forEach((s, i) => {
    const n = i + 1;
    if (active(ctx, "C9.per-slide", s) && param(ctx, "C9.per-slide").required !== false) {
      if (!nonEmpty(per[i])) {
        emit(ctx, out, "C9.per-slide", { slide: s.id, el: "caption.perSlide." + i, vars: { n } });
      } else if (active(ctx, "C9.per-slide-length", s)) {
        const len = cc(per[i]);
        const max = param(ctx, "C9.per-slide-length").max;
        if (len > max) emit(ctx, out, "C9.per-slide-length", { slide: s.id, el: "caption.perSlide." + i, vars: { n, count: len, max } });
      }
    }
    if (active(ctx, "C9.alt-missing", s) && param(ctx, "C9.alt-missing").required !== false) {
      if (!nonEmpty(alt[i])) {
        emit(ctx, out, "C9.alt-missing", { slide: s.id, el: "caption.alt." + i, vars: { n } });
      } else {
        const len = cc(alt[i]);
        const hard = param(ctx, "C9.alt-length-hard").max;
        const soft = param(ctx, "C9.alt-length");
        if (len > hard) {
          emit(ctx, out, "C9.alt-length-hard", { slide: s.id, el: "caption.alt." + i, vars: { n, count: len, max: hard } });
        } else if (len > soft.max && active(ctx, "C9.alt-length", s)) {
          emit(ctx, out, "C9.alt-length", { slide: s.id, el: "caption.alt." + i, vars: { n, count: len, max: soft.max } });
        }
      }
    }
  });
}
