/* ui/index.js · the public surface of CS.ui (CONTRACT 4.8). Everything else in this chunk is private. */

Object.assign(CS.ui, {
  mountStudio: mountStudio,
  t: t,
  setUiDialect: setUiDialect,
  capabilities: capabilities,
  CAPABILITY_NAMES: CAPABILITY_NAMES,
  serializeSource: serializeSource,
  serializeForPublish: serializeForPublish,
  toast: toast,
  current: null,
  currentHome: null,
  /** Helpers for cs-brandbook.js, which is a separate script scope (see brandbook/shared.js). Not part of the contract. */
  _: {
    h: h, icon: icon, clear: clear, bidi: bidi, esc: esc, clone: clone, same: same, setPath: setPath, uid: uid, isoNow: isoNow, pad2: pad2, raf: raf, fmtDate: fmtDate,
    t: t, hasStr: hasStr, msgOf: msgOf, uiLang: uiLang, uiDir: uiDir, dialectLabel: dialectLabel, dialect: function () { return uiDialect; }, UI_DIALECTS: UI_DIALECTS,
    guard: guard, guardAsync: guardAsync, reportError: reportError, cleanText: cleanText, autosize: autosize, readJsonBlock: readJsonBlock, jsonForScript: jsonForScript,
    toast: toast, dialog: dialog, askText: askText, openMenu: openMenu, copyWithFeedback: copyWithFeedback, setLayer: setLayer,
    pill: pill, segmented: segmented, switchBox: switchBox, ltr: ltr, markSvg: markSvg, makeFrame: makeFrame, releaseFrames: releaseFrames,
    filmDirection: filmDirection, guidesLayer: guidesLayer, makeStageNav: makeStageNav,
    fontPairings: fontPairings, local: local, applyTheme: applyTheme, currentTheme: currentTheme, captureBoot: captureBoot, loadUiStrings: loadUiStrings, setUiDialect: setUiDialect,
    useCap: useCap, canPublish: canPublish, serializeBrandHome: serializeBrandHome, readSlotText: readSlotText,
    // Factories return a Node, {el: Node}, an array, or null. They are called afresh on refresh;
    // register persistent bus listeners outside factories. panels.<tab>[] and checkExtras[]
    // receive (ctx, slide); editors.<field>(ctx, slide, options) runs on both text surfaces.
    panels: {}, editors: {}, checkExtras: [], screens: {},
    textEditor: textEditor, selectBox: selectBox, sec: sec, field: field, runExtensions: runExtensions,
    addableTypes: addableTypes
  },
  /** Pure helpers, exposed for the unit tests (tests/unit/js/ui). Not part of the contract. */
  _pure: {
    validateVariant: validateVariant, summarizeFindings: summarizeFindings, carryOverrides: carryOverrides, lengthSiblings: lengthSiblings, placeCover: placeCover, realignCaption: realignCaption,
    convertSpecDigits: convertSpecDigits, fallbackDiff: fallbackDiff, fillTemplate: fillTemplate, fieldLimit: fieldLimit, slideTotals: slideTotals,
    toggleEmphasis: toggleEmphasis, loadUiStrings: loadUiStrings, jsonBlock: jsonBlock, htmlComment: htmlComment, sortFindings: sortFindings,
    withAssetCheck: withAssetCheck, pluralCategory: pluralCategory, fontPairings: fontPairings
  }
});
