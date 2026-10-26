/*
 * CS.export · public API (CONTRACT 4.7). CS.export.mp4 and CS.export.DEPS come from cs-mp4.js.
 */

async function capabilitiesOf() {
  var painter = await CS.paint.detect(), h264 = await X.mp4.support(CANVAS_W, CANVAS_H, FPS_EXPORT), shareFilesOk = false;
  try { shareFilesOk = !!(navigator.canShare && navigator.canShare({ files: [new File([new Uint8Array(1)], "a.png", { type: "image/png" })] })); } catch (e) { shareFilesOk = false; }
  return {
    downloads: !!(window.claude && typeof window.claude.use === "function") || ("download" in HTMLAnchorElement.prototype),
    webShare: typeof navigator !== "undefined" && typeof navigator.share === "function",
    webShareFiles: shareFilesOk,
    videoEncoder: typeof VideoEncoder !== "undefined",
    h264: h264.supported,
    painter: painter.painter,
    mediabunny: true                       // loaded on demand; a failed load surfaces as E_DEP_LOAD when an MP4 is requested
  };
}

X.capabilities = capabilitiesOf;
X.slides = exportSlides;
X.cover = exportCover;
X.pdf = exportPdf;
X.zip = exportZip;
X.text = textApi;
X.kitFiles = kitFilesOf;
X.sourceFiles = sourceFilesOf;
X.source = exportSource;
X.kit = buildKit;
X.save = saveFiles;
CS.export = X;

if (automationActive()) CS.automation = createAutomation();
