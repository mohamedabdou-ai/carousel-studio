/* brandbook/shared.js · aliases for the helpers of cs-ui.js.
 *
 * This chunk carries every surface that is not the core editor: the Brand Book, Brand Home and the Studio's secondary screens
 * (Preview, Motion, Copy, Export, About). cs-ui.js has a 200 KiB budget, so those surfaces live here and register themselves in
 * CS.ui._.screens; the shell builds them on first use. All helpers come from CS.ui._ (cs-ui.js loads first). */

CS.ui = CS.ui || {};
CS.ui._.screens = CS.ui._.screens || {};

var U = CS.ui._;
var h = U.h, icon = U.icon, clear = U.clear, bidi = U.bidi, clone = U.clone, same = U.same, uid = U.uid, isoNow = U.isoNow, pad2 = U.pad2;
var t = U.t, hasStr = U.hasStr, msgOf = U.msgOf, uiLang = U.uiLang, uiDir = U.uiDir;
var guard = U.guard, reportError = U.reportError, raf = U.raf, fmtDate = U.fmtDate, cleanText = U.cleanText, autosize = U.autosize;
var toast = U.toast, dialog = U.dialog, askText = U.askText, openMenu = U.openMenu, copyWithFeedback = U.copyWithFeedback;
var pill = U.pill, segmented = U.segmented, switchBox = U.switchBox, ltr = U.ltr, markSvg = U.markSvg;
var makeFrame = U.makeFrame, releaseFrames = U.releaseFrames, filmDirection = U.filmDirection, guidesLayer = U.guidesLayer, makeStageNav = U.makeStageNav;
