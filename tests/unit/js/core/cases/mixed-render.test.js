/* Focused regressions for mixed-script geometry, with every shipped preset. */
(function () {
  var test = CST.test, assert = CST.assert, eq = CST.eq;

  // Canvas glyph bounds locate the ink inside each browser Range's advance box.
  function ink(word, text, range) {
    if (!range) { range = document.createRange(); range.selectNodeContents(word); }
    var box = range.getBoundingClientRect(), css = getComputedStyle(word);
    var ctx = document.createElement("canvas").getContext("2d");
    ctx.font = css.fontStyle + " " + css.fontWeight + " " + css.fontSize + " " + css.fontFamily;
    ctx.direction = css.direction; ctx.textAlign = "left";
    var glyph = ctx.measureText(text || word.textContent);
    return { left: box.left - glyph.actualBoundingBoxLeft, right: box.left + glyph.actualBoundingBoxRight,
      middle: box.top + box.height / 2, height: box.height };
  }

  test("mixed render: a fitted cover never breaks a line between a clitic and its number", async function () {
    await FX.setup({ real: true });
    for (var preset of ["poster@1.0", "creator@1.0", "notebook@1.0"]) {
      var spec = FX.example(); spec.style.presetId = preset; spec.style.overrides = {};
      spec.slides[0].headline = "كلود ==شال== حد الـ5 ساعات"; spec.slides[0].sub = "للحسابات الموثقة";
      var rendered = await CS.core.render.slide(spec, FX.brand(), 0, { mode: "export" });
      try {
        var words = Array.from(rendered.el.querySelectorAll('[data-slot="headline"] .w'));
        var article = words.find(function (w) { return w.textContent === "الـ"; }), number = words.find(function (w) { return w.textContent === "5"; });
        assert(article && number, preset + ": both parts of «الـ5» are on the cover");
        var a = article.getBoundingClientRect(), n = number.getBoundingClientRect();
        assert(Math.abs((a.top + a.bottom) / 2 - (n.top + n.bottom) / 2) < Math.min(a.height, n.height) / 2,
          preset + ": «الـ» and «5» share one line: " + JSON.stringify({ article: [Math.round(a.top), Math.round(a.bottom)], number: [Math.round(n.top), Math.round(n.bottom)] }));
        assert(a.left >= n.right - 2, preset + ": «الـ» stays on the right of its number");
      } finally { rendered.el.remove(); }
    }
  });

  test("mixed render: s03 keeps API to the right of 50% and each clitic with its run", async function () {
    await FX.setup({ real: true });
    var spec = FX.example(); spec.style.presetId = "poster@1.0"; spec.style.overrides = {};
    var rendered = await CS.core.render.slide(spec, FX.brand(), 2, { mode: "export" });
    try {
      var slot = rendered.el.querySelector('[data-slot="body"]');
      var copy = "في الـAPI. وبـ50% من الحالات";
      slot.style.cssText += ";width:852px;font-size:44px;white-space:nowrap";
      slot.innerHTML = CS.core.compose.html(copy, { lang: "ar", digits: "western" });
      function word(text) {
        var walker = document.createTreeWalker(slot, NodeFilter.SHOW_TEXT), node;
        while ((node = walker.nextNode())) {
          var start = node.nodeValue.indexOf(text);
          if (start < 0) continue;
          var range = document.createRange(); range.setStart(node, start); range.setEnd(node, start + text.length);
          return ink(node.parentElement, text, range);
        }
        throw new Error("missing visible text: " + text);
      }
      var api = word("API"), number = word("50%");
      var article = word("الـ"), clitic = word("وبـ");
      assert(number.right < api.left, "left-to-right order must be 50%, then API");
      assert(article.left >= api.right - 2 && clitic.left >= number.right - 2 && clitic.right < api.left,
        "each Arabic prefix stays on the right of its own run: " + JSON.stringify({ api, number, article, clitic }));
      assert(Math.abs(api.middle - number.middle) < 22, "the comparison is on one line");
      eq(slot.textContent.replace(/\u00a0/g, " "), copy, "read-back preserves the copy");
    } finally { rendered.el.remove(); }
  });

  test("mixed render: clitic ink has an em-sized gap at display and body sizes in all six styles", async function () {
    await FX.setup({ real: true });
    for (var preset of FX.realIndex.presets) {
      var spec = FX.example(); spec.style.presetId = preset.id + "@" + preset.version; spec.style.overrides = {};
      var rendered = await CS.core.render.slide(spec, FX.brand(), 2, { mode: "export" });
      var display = await CS.core.render.slide(spec, FX.brand(), 0, { mode: "export" });
      try {
        for (var role of ["headline", "body"]) {
          var slot = (role === "headline" ? display : rendered).el.querySelector('[data-slot="' + role + '"]');
          var size = role === "headline" ? 96 : 44;
          slot.style.cssText += ";font-size:" + size + "px;width:852px";
          for (var prefix of ["و", "ف", "ب", "ل", "ك", "وـ", "فـ", "بـ", "لـ", "كـ", "وَ"]) {
            var copy = prefix + (role === "headline" ? "Google" : "AI Mode");
            slot.innerHTML = CS.core.compose.html(copy, { lang: "ar", digits: "western" });
            await document.fonts.ready;
            var words = Array.from(slot.querySelectorAll(".w")), clitic = ink(words[0]);
            var latin = words.slice(1).map((w) => ink(w)), right = Math.max.apply(null, latin.map((b) => b.right));
            var gap = clitic.left - right, label = preset.id + "/" + role + "/" + prefix;
            assert(gap >= size * 0.1, label + " ink gap " + gap.toFixed(2) + "px must be >= " + size * 0.1);
            assert(Math.abs(clitic.middle - latin[0].middle) < clitic.height / 2, label + " stays on one line");
            eq(slot.textContent, copy, label + " adds no characters");
          }
        }
      } finally { rendered.el.remove(); display.el.remove(); }
    }
  });
})();
