/* ui/screen-copy.js · the post caption (with the 125-character fold), hashtags, per-slide captions and alt text, each with Copy. */

function charCount(s) { return Array.from(String(s || "")).length; }

function ensureLen(arr, n) {
  var out = (arr || []).slice(0, n);
  while (out.length < n) out.push("");
  return out;
}

function CopyScreen(ctx) {
  var el = h("section", { class: "ui-screen ui-screen--copy", dataset: { csScreen: "copy" }, "aria-labelledby": "ui-h-copy" });
  var host = h("div", { class: "ui-copy" });
  var stale = true;
  var foldView = null, totalMeter = null;

  el.appendChild(h("header", { class: "ui-screen-head" }, h("h1", { class: "ui-h1", id: "ui-h-copy" }, t("copy.title")), h("p", { class: "ui-lede" }, t("copy.lede"))));
  el.appendChild(host);

  function cp() { return ctx.spec.captionPack || {}; }
  function plug() { return ctx.plugin || { caption: { defaultChars: [300, 900], firstLineMaxChars: 125 }, hashtags: { max: 5 }, perSlideCaption: { maxChars: 100 }, alt: { targetMaxChars: 300, hardMaxChars: 1000 } }; }

  function copyBtn(getText, label, cls) {
    return h("button", { type: "button", class: "ui-btn ui-btn--ghost ui-btn--sm" + (cls ? " " + cls : ""), onclick: function () { copyWithFeedback(getText(), label); } }, icon("copy"), t("common.copy"));
  }

  function counter(n, lo, hi, hard) {
    var kind = hard && n > hard ? "bad" : n < lo || n > hi ? "warn" : "ok";
    return h("span", { class: "ui-meter ui-meter--" + kind, dir: "ltr" }, h("span", { class: "ui-meter-n" }, String(n)), h("span", { class: "ui-meter-max" }, "/" + hi));
  }

  /* ---- caption ---------------------------------------------------------------------------------------------- */
  function captionSection() {
    var p = plug().caption;
    var fields = [["firstLine", "copy.firstLine", 2200, 1], ["keywordLine", "copy.keywordLine", 2200, 1], ["body", "copy.body", 2200, 3], ["cta", "copy.cta", 600, 1]];
    var editors = fields.map(function (f) {
      var key = f[0];
      var id = uid("c");
      var ta = h("textarea", {
        class: "ui-input ui-text", id: id, rows: f[3], maxlength: f[2], dir: ctx.isEn() ? "ltr" : "rtl", spellcheck: "false", dataset: { field: key },
        "aria-label": t(f[1])
      });
      ta.value = cp()[key] || "";
      var meterHost = h("span", {});
      function paint() {
        clear(meterHost);
        var n = charCount(ta.value);
        if (key === "firstLine") meterHost.appendChild(counter(n, 0, p.firstLineMaxChars, 0));
        else meterHost.appendChild(h("span", { class: "ui-meter ui-meter--ok", dir: "ltr" }, h("span", { class: "ui-meter-n" }, String(n))));
      }
      ta.addEventListener("input", function () { autosize(ta); paint(); });
      ta.addEventListener("change", function () { var patch = {}; patch[key] = cleanText(ta.value); ctx.setCaption(patch); ctx.runTextQa(); paintFold(); });
      requestAnimationFrame(function () { autosize(ta); });
      paint();
      return h("div", { class: "ui-field" }, h("div", { class: "ui-field-head" }, h("label", { class: "ui-label", for: id }, t(f[1])), meterHost), ta,
        key === "firstLine" ? h("p", { class: "ui-hint" }, t("copy.firstLine.hint", { n: p.firstLineMaxChars })) : key === "keywordLine" ? h("p", { class: "ui-hint" }, t("copy.keywordLine.hint")) : null);
    });
    foldView = h("div", { class: "ui-foldview" });
    totalMeter = h("div", { class: "ui-copy-total" });
    var head = h("div", { class: "ui-row ui-row--between" }, h("h2", { class: "ui-h2" }, t("copy.caption")),
      h("button", { type: "button", class: "ui-btn ui-btn--secondary", dataset: { csAction: "copy-caption" }, onclick: function () { copyWithFeedback(assembled(), t("copy.caption")); } }, icon("copy"), t("copy.copy-all")));
    paintFold();
    return h("div", { class: "ui-card" }, head, editors, totalMeter, foldView);
  }

  function assembled() { return guard("assembleCaption", function () { return CS.core.spec.assembleCaption(ctx.spec); }, ""); }

  function paintFold() {
    if (!foldView) return;
    var p = plug().caption;
    var full = assembled();
    var chars = Array.from(full);
    var total = chars.length;
    clear(totalMeter);
    totalMeter.appendChild(h("span", { class: "ui-label" }, t("copy.total")));
    totalMeter.appendChild(counter(total, p.defaultChars[0], p.defaultChars[1], 2200));
    totalMeter.appendChild(h("span", { class: "ui-hint" }, t("copy.total.hint", { lo: p.defaultChars[0], hi: p.defaultChars[1] })));
    clear(foldView);
    if (!total) { foldView.appendChild(h("p", { class: "ui-hint" }, t("copy.empty"))); return; }
    var fold = p.firstLineMaxChars;
    var head = chars.slice(0, fold).join(""), tail = chars.slice(fold).join("");
    foldView.appendChild(h("div", { class: "ui-label" }, t("copy.fold.title")));
    foldView.appendChild(h("p", { class: "ui-fold-text", dir: ctx.isEn() ? "ltr" : "rtl" },
      h("span", { class: "ui-fold-visible" }, head),
      tail ? [h("span", { class: "ui-fold-mark", title: t("copy.fold.mark") }, t("copy.fold.mark")), h("span", { class: "ui-fold-hidden" }, tail)] : null));
  }

  /* ---- hashtags --------------------------------------------------------------------------------------------- */
  function hashtagSection() {
    var max = plug().hashtags.max;
    var tags = (cp().hashtags || []).slice();
    var chips = h("div", { class: "ui-chips ui-chips--tags" });
    var err = h("p", { class: "ui-hint ui-hint--bad", hidden: true }, "");
    var input = h("input", { class: "ui-input", type: "text", dir: "auto", maxlength: 61, placeholder: t("copy.tags.add"), "aria-label": t("copy.tags.add") });
    function add() {
      var v = input.value.trim().replace(/^#*/, "#");
      if (v === "#") return;
      if (!/^#[^ \t\n\r\u00A0#]{1,60}$/.test(v)) { err.textContent = t("copy.tags.invalid"); err.hidden = false; return; }
      if (tags.indexOf(v) >= 0) { err.textContent = t("copy.tags.duplicate"); err.hidden = false; return; }
      if (tags.length >= max) { err.textContent = t("copy.tags.max", { n: max }); err.hidden = false; return; }
      err.hidden = true;
      tags.push(v);
      input.value = "";
      commit();
    }
    function remove(i) { tags.splice(i, 1); commit(); }
    function commit() { ctx.setCaption({ hashtags: tags.slice() }); ctx.runTextQa(); paintTags(); paintFold(); }
    function paintTags() {
      clear(chips);
      tags.forEach(function (tg, i) {
        chips.appendChild(h("span", { class: "ui-tag" }, h("bdi", { dir: "auto" }, tg), h("button", { type: "button", "aria-label": t("common.delete") + " " + tg, onclick: function () { remove(i); } }, icon("x"))));
      });
      if (!tags.length) chips.appendChild(h("span", { class: "ui-hint" }, t("copy.tags.none")));
    }
    input.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(); } });
    paintTags();
    return h("div", { class: "ui-card" },
      h("div", { class: "ui-row ui-row--between" }, h("h2", { class: "ui-h2" }, t("copy.tags")), h("span", { class: "ui-meter ui-meter--" + (tags.length > max ? "bad" : "ok"), dir: "ltr" }, tags.length + "/" + max)),
      h("p", { class: "ui-hint" }, t("copy.tags.hint")),
      chips,
      h("div", { class: "ui-row" }, input, h("button", { type: "button", class: "ui-btn ui-btn--secondary", onclick: add }, icon("plus"), t("common.add")), copyBtn(function () { return tags.join(" "); }, t("copy.tags"))),
      err);
  }

  /* ---- per slide --------------------------------------------------------------------------------------------- */
  function perSlideSection() {
    var n = ctx.slides().length;
    var per = ensureLen(cp().perSlide, n), alt = ensureLen(cp().alt, n);
    var p = plug();
    var rows = h("div", { class: "ui-persl" });
    ctx.slides().forEach(function (s, i) {
      var f = ctx.slideFrame(s.id, "ui-mini-frame");
      var cap = h("input", {
        class: "ui-input", type: "text", maxlength: 300, dir: ctx.isEn() ? "ltr" : "rtl", "aria-label": t("copy.per") + " " + (i + 1),
        onchange: function () { var a = ensureLen(cp().perSlide, n); a[i] = cleanText(cap.value); ctx.setCaption({ perSlide: a }); ctx.runTextQa(); paintCap(); }
      });
      cap.value = per[i] || "";
      var capMeter = h("span", {});
      function paintCap() { clear(capMeter); capMeter.appendChild(counter(charCount(cap.value), 0, p.perSlideCaption.maxChars, 0)); }
      cap.addEventListener("input", paintCap);
      paintCap();
      var altEl = h("textarea", {
        class: "ui-input ui-text", rows: 2, maxlength: 1000, dir: ctx.isEn() ? "ltr" : "rtl", "aria-label": t("copy.alt") + " " + (i + 1),
        onchange: function () { var a = ensureLen(cp().alt, n); a[i] = cleanText(altEl.value); ctx.setCaption({ alt: a }); ctx.runTextQa(); paintAlt(); }
      });
      altEl.value = alt[i] || "";
      var altMeter = h("span", {});
      function paintAlt() { clear(altMeter); altMeter.appendChild(counter(charCount(altEl.value), 0, p.alt.targetMaxChars, p.alt.hardMaxChars)); }
      altEl.addEventListener("input", function () { autosize(altEl); paintAlt(); });
      paintAlt();
      requestAnimationFrame(function () { autosize(altEl); });
      rows.appendChild(h("article", { class: "ui-persl-row", dataset: { sid: s.id } },
        h("div", { class: "ui-persl-thumb" }, f.frame, h("span", { class: "ui-persl-n", dir: "ltr" }, String(i + 1))),
        h("div", { class: "ui-persl-fields" },
          h("div", { class: "ui-field" }, h("div", { class: "ui-field-head" }, h("span", { class: "ui-label" }, t("copy.per")), capMeter, copyBtn(function () { return cap.value; }, t("copy.per"))), cap),
          h("div", { class: "ui-field" }, h("div", { class: "ui-field-head" }, h("span", { class: "ui-label" }, t("copy.alt")), altMeter, copyBtn(function () { return altEl.value; }, t("copy.alt"))), altEl))));
    });
    return h("div", { class: "ui-card" },
      h("div", { class: "ui-row ui-row--between" }, h("h2", { class: "ui-h2" }, t("copy.persl")),
        h("div", { class: "ui-row" },
          copyBtn(function () { return lines(cp().perSlide); }, t("copy.per-all")),
          copyBtn(function () { return lines(cp().alt); }, t("copy.alt-all")))),
      h("p", { class: "ui-hint" }, t("copy.persl.hint")),
      rows);
  }

  /** "NN: text" lines with Western digits, the same format as the kit's text files. */
  function lines(list) {
    return (list || []).map(function (x, i) { return pad2(i + 1) + ": " + (x || ""); }).join("\n");
  }

  function build() {
    releaseFrames(host);
    clear(host);
    [captionSection(), hashtagSection(), perSlideSection()].forEach(function (s) { host.appendChild(s); });
    stale = false;
  }

  ctx.bus.on("spec", function (d) {
    if (d.path && d.path.indexOf("/captionPack") === 0) return;      // our own edits: leave the form alone
    stale = true;
    if (!el.hidden) build();
  });

  return {
    el: el,
    show: function () { if (stale) build(); paintFold(); },
    hide: function () { releaseFrames(host); stale = true; }
  };
}
