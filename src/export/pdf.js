/*
 * CS.export · PDF writer.
 * One page per slide, each page one full-bleed JPEG (DCTDecode) - nothing else. The document carries a Title and the
 * producer "Carousel Studio"; no author, no creator, no dates, nothing that names a person.
 */

/** Width, height and component count of a baseline or progressive JPEG. */
function jpegInfo(bytes) {
  var i = 2, marker, len;
  if (bytes[0] !== 0xFF || bytes[1] !== 0xD8) throw exportError("E_USAGE", "A PDF page needs a JPEG image.");
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xFF) { i++; continue; }
    marker = bytes[i + 1];
    if (marker === 0xFF) { i++; continue; }
    if (marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC) {
      return { h: (bytes[i + 5] << 8) | bytes[i + 6], w: (bytes[i + 7] << 8) | bytes[i + 8], components: bytes[i + 9] };
    }
    len = (bytes[i + 2] << 8) | bytes[i + 3];
    i += 2 + len;
  }
  throw exportError("E_USAGE", "The JPEG has no frame header.");
}

function pdfText(text) {                        // UTF-16BE hex string: safe for Arabic and for any other script
  var hex = "FEFF", i, c;
  for (i = 0; i < text.length; i++) { c = text.charCodeAt(i); hex += ("000" + c.toString(16)).slice(-4).toUpperCase(); }
  return "<" + hex + ">";
}

/** pdfBytes(pages: [{ jpeg: Uint8Array, w, h }], title) -> Uint8Array */
function pdfBytes(pages, title) {
  var chunks = [], offsets = [], length = 0, n = pages.length;
  var push = function (part) { var b = typeof part === "string" ? latin1Bytes(part) : part; chunks.push(b); length += b.length; };
  var begin = function (id) { offsets[id] = length; push(id + " 0 obj\n"); };
  push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  // object ids: 1 catalog, 2 pages, 3 info, then per page: page, contents, image
  begin(1); push("<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  var kids = [], i, id;
  for (i = 0; i < n; i++) kids.push((4 + i * 3) + " 0 R");
  begin(2); push("<< /Type /Pages /Kids [" + kids.join(" ") + "] /Count " + n + " >>\nendobj\n");
  begin(3); push("<< /Title " + pdfText(title || "") + " /Producer (Carousel Studio) >>\nendobj\n");
  pages.forEach(function (pg, k) {
    id = 4 + k * 3;
    var content = "q " + pg.w + " 0 0 " + pg.h + " 0 0 cm /Im0 Do Q\n";
    begin(id); push("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + pg.w + " " + pg.h + "] /Resources << /XObject << /Im0 " + (id + 2) + " 0 R >> >> /Contents " + (id + 1) + " 0 R >>\nendobj\n");
    begin(id + 1); push("<< /Length " + content.length + " >>\nstream\n" + content + "endstream\nendobj\n");
    begin(id + 2);
    push("<< /Type /XObject /Subtype /Image /Width " + pg.w + " /Height " + pg.h + " /ColorSpace " + (pg.components === 1 ? "/DeviceGray" : "/DeviceRGB") +
      " /BitsPerComponent 8 /Filter /DCTDecode /Length " + pg.jpeg.length + " >>\nstream\n");
    push(pg.jpeg);
    push("\nendstream\nendobj\n");
  });
  var xrefAt = length, total = 4 + n * 3, rows = "xref\n0 " + total + "\n0000000000 65535 f \n";
  for (id = 1; id < total; id++) rows += ("0000000000" + offsets[id]).slice(-10) + " 00000 n \n";
  push(rows + "trailer\n<< /Size " + total + " /Root 1 0 R /Info 3 0 R >>\nstartxref\n" + xrefAt + "\n%%EOF\n");
  var out = new Uint8Array(length), pos = 0;
  chunks.forEach(function (c) { out.set(c, pos); pos += c.length; });
  return out;
}

function latin1Bytes(text) {
  var out = new Uint8Array(text.length), i;
  for (i = 0; i < text.length; i++) out[i] = text.charCodeAt(i) & 0xFF;
  return out;
}
