/**
 * A minimal PDF writer: one full-page JPEG per page, nothing else. Pages are
 * rendered by the browser onto a canvas first, so any script the goals are
 * named in comes out right — a text-based PDF would need a font shipped for
 * every one of them.
 */

export interface PdfPage {
  jpeg: Uint8Array;
  width: number;
  height: number;
}

/** A4 in PDF points. */
export const A4 = { width: 595.28, height: 841.89 };

const ascii = (s: string) => new TextEncoder().encode(s);

const concat = (parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};

export const buildImagePdf = (pages: PdfPage[], size = A4): Uint8Array => {
  const objects: Uint8Array[] = [];
  const add = (parts: (string | Uint8Array)[]) => {
    const id = objects.length + 1;
    objects.push(concat([ascii(`${id} 0 obj\n`), ...parts.map((p) => (typeof p === 'string' ? ascii(p) : p)), ascii('\nendobj\n')]));
    return id;
  };

  // Objects 1 and 2 are placeholders filled in once the page ids are known.
  add(['']);
  add(['']);

  const pageIds = pages.map((page) => {
    const image = add([
      `<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpeg.length} >>\nstream\n`,
      page.jpeg,
      '\nendstream',
    ]);
    // Fit the image to the page width; the canvas already has the page's aspect.
    const w = size.width;
    const h = (page.height / page.width) * w;
    const draw = `q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} 0 ${(size.height - h).toFixed(2)} cm /Im0 Do Q`;
    const content = add([`<< /Length ${draw.length} >>\nstream\n${draw}\nendstream`]);
    return add([
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${size.width} ${size.height}] ` +
        `/Resources << /XObject << /Im0 ${image} 0 R >> >> /Contents ${content} 0 R >>`,
    ]);
  });

  objects[0] = concat([ascii('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n')]);
  objects[1] = concat([
    ascii(`2 0 obj\n<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>\nendobj\n`),
  ]);

  // The high-bit comment on line two is the convention that marks a binary file.
  const header = concat([ascii('%PDF-1.4\n%'), Uint8Array.from([0xe2, 0xe3, 0xcf, 0xd3]), ascii('\n')]);
  const offsets: number[] = [];
  let at = header.length;
  for (const obj of objects) {
    offsets.push(at);
    at += obj.length;
  }

  const xref =
    `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` +
    offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('') +
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${at}\n%%EOF\n`;

  return concat([header, ...objects, ascii(xref)]);
};
