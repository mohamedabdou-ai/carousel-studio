/* ui/screen-about.js · what this tool is, who made it, the licence and the privacy promise.
 * The credit block and the social links come only from the about.* strings, which are compiled out of credit-free builds
 * (the studio-source.html inside the kit), so nothing here can leak into an export. */

var SOCIALS = ["instagram", "tiktok", "youtube", "linkedin", "facebook", "store"];
var SOCIAL_ICON = { instagram: "image", tiktok: "film", youtube: "play", linkedin: "users", facebook: "message-circle", store: "globe" };

function AboutScreen(ctx) {
  var el = h("section", { class: "ui-screen ui-screen--about", dataset: { csScreen: "about" }, "aria-labelledby": "ui-h-about" });
  var built = false;

  function row(label, value) { return h("div", {}, h("dt", {}, label), h("dd", { dir: "ltr" }, value)); }

  function build() {
    clear(el);
    var cfg = ctx.config || {};
    el.appendChild(h("header", { class: "ui-screen-head" }, h("h1", { class: "ui-h1", id: "ui-h-about" }, t("legal.title")), h("p", { class: "ui-lede" }, t("legal.lede"))));

    var info = h("dl", { class: "ui-facts" }, row(t("legal.version"), CS.version || "cs-1.2.0"));
    if (cfg.buildId) info.appendChild(row(t("legal.build"), cfg.buildId));
    if (cfg.builtAt) info.appendChild(row(t("legal.built"), fmtDate(cfg.builtAt, uiLang())));
    var painter = window.__csPainter || null;
    if (painter) info.appendChild(row(t("legal.painter"), painter));
    el.appendChild(h("div", { class: "ui-card ui-about-hero" }, h("div", { class: "ui-about-mark" }, markSvg()), h("div", {}, h("h2", { class: "ui-h2" }, t("app.name")), h("p", { class: "ui-hint" }, t("legal.tagline"))), info));

    el.appendChild(h("div", { class: "ui-card" }, h("h2", { class: "ui-h2" }, t("legal.own.title")), h("p", { class: "ui-p", html: bidi(t("legal.own")) })));

    if (hasStr("about.credit")) {
      var links = h("ul", { class: "ui-socials" });
      SOCIALS.forEach(function (k) {
        if (!hasStr("about.social." + k) || !hasStr("about.url." + k)) return;
        links.appendChild(h("li", {}, h("a", { class: "ui-social", href: t("about.url." + k), target: "_blank", rel: "noopener noreferrer" },
          icon(SOCIAL_ICON[k] || "link"), h("span", { class: "ui-social-k" }, t("social." + k)), h("bdi", { dir: "ltr", class: "ui-social-v" }, t("about.social." + k)))));
      });
      el.appendChild(h("div", { class: "ui-card", dataset: { csCredit: "" } },
        h("p", { class: "ui-credit-line" }, t("about.credit")),
        hasStr("about.thanks") ? h("p", { class: "ui-p" }, t("about.thanks")) : null,
        links.children.length ? links : null));
    }

    el.appendChild(h("div", { class: "ui-card" }, h("h2", { class: "ui-h2" }, t("legal.privacy.title")), h("p", { class: "ui-p", html: bidi(t("legal.privacy")) })));
    el.appendChild(h("div", { class: "ui-card" }, h("h2", { class: "ui-h2" }, t("legal.license.title")),
      h("p", { class: "ui-p", html: bidi(t("legal.license")) }),
      h("ul", { class: "ui-bullets" }, ["legal.third.fonts", "legal.third.icons", "legal.third.mp4"].map(function (k) { return h("li", { html: bidi(t(k)) }); }))));

    el.appendChild(h("div", { class: "ui-card" }, h("h2", { class: "ui-h2" }, t("legal.keys.title")),
      h("dl", { class: "ui-facts ui-facts--keys" }, [
        ["Ctrl / ⌘ + S", t("legal.keys.save")], ["Ctrl / ⌘ + Z", t("legal.keys.undo")], ["Ctrl / ⌘ + Shift + Z", t("legal.keys.redo")], ["Esc", t("legal.keys.esc")]
      ].map(function (k) { return h("div", {}, h("dt", {}, k[1]), h("dd", { dir: "ltr" }, k[0])); }))));
    built = true;
  }

  return {
    el: el,
    show: function () { if (!built) build(); },
    hide: function () { },
    rebuild: function () { built = false; if (!el.hidden) build(); }
  };
}
