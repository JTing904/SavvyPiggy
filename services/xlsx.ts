/**
 * A real spreadsheet file, written by hand.
 *
 * The exports used to be text, and text has no way of saying what encoding it
 * is in that every reader honours. A UTF-8 byte-order mark was ignored and the
 * Chinese goal names came out as mojibake; UTF-16's mark was ignored too, by
 * the same reader, which went on to read two-byte characters one byte at a
 * time. A file that has to be guessed at will eventually be guessed wrong.
 *
 * An .xlsx cannot be guessed wrong. It is a zip of XML documents, and every
 * one of them declares `encoding="UTF-8"` in its first line — the format says
 * what it is instead of hoping. Excel, Google Sheets and LibreOffice all read
 * it the same way.
 *
 * Nothing is compressed. The zip format allows entries to be stored as-is, a
 * statement is a few kilobytes either way, and storing them means this needs
 * no deflate implementation to go wrong.
 */

import { m } from '../i18n';

const encoder = new TextEncoder();
const bytes = (text: string) => encoder.encode(text);

/* --------------------------------------------------------------------- zip */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

export const crc32 = (data: Uint8Array) => {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

interface Entry {
  name: string;
  data: Uint8Array;
}

/** MS-DOS packs a timestamp into two 16-bit words; seconds lose their last bit. */
const dosTime = (d: Date) => ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xffff;
const dosDate = (d: Date) =>
  (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xffff;

/** A zip archive with every entry stored uncompressed. */
export const zip = (entries: Entry[], now: Date = new Date()): Uint8Array => {
  const time = dosTime(now);
  const date = dosDate(now);

  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = bytes(entry.name);
    const crc = crc32(entry.data);

    const local = new DataView(new ArrayBuffer(30 + name.length));
    local.setUint32(0, 0x04034b50, true); // local file header
    local.setUint16(4, 20, true); // version needed
    local.setUint16(6, 0, true); // flags
    local.setUint16(8, 0, true); // stored, not deflated
    local.setUint16(10, time, true);
    local.setUint16(12, date, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, entry.data.length, true);
    local.setUint32(22, entry.data.length, true);
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true); // no extra field
    const localBytes = new Uint8Array(local.buffer);
    localBytes.set(name, 30);

    const central = new DataView(new ArrayBuffer(46 + name.length));
    central.setUint32(0, 0x02014b50, true); // central directory header
    central.setUint16(4, 20, true); // version made by
    central.setUint16(6, 20, true); // version needed
    central.setUint16(8, 0, true);
    central.setUint16(10, 0, true);
    central.setUint16(12, time, true);
    central.setUint16(14, date, true);
    central.setUint32(16, crc, true);
    central.setUint32(20, entry.data.length, true);
    central.setUint32(24, entry.data.length, true);
    central.setUint16(28, name.length, true);
    central.setUint16(30, 0, true);
    central.setUint16(32, 0, true);
    central.setUint16(34, 0, true);
    central.setUint16(36, 0, true);
    central.setUint32(38, 0, true);
    central.setUint32(42, offset, true);
    const centralBytes = new Uint8Array(central.buffer);
    centralBytes.set(name, 46);

    locals.push(localBytes, entry.data);
    centrals.push(centralBytes);
    offset += localBytes.length + entry.data.length;
  }

  const centralSize = centrals.reduce((n, c) => n + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); // end of central directory
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);

  const parts = [...locals, ...centrals, new Uint8Array(end.buffer)];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
};

/* -------------------------------------------------------------------- xlsx */

const escapeXml = (text: string) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    // Control characters are not legal in XML at all, and a note pasted from
    // somewhere else can carry them.
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '');

/** 0 → A, 25 → Z, 26 → AA. */
export const columnName = (index: number) => {
  let name = '';
  let n = index;
  while (n >= 0) {
    name = String.fromCharCode(65 + (n % 26)) + name;
    n = Math.floor(n / 26) - 1;
  }
  return name;
};

export type Cell = string | number | null;

/**
 * Text goes in as an inline string rather than through a shared-strings table:
 * a statement repeats almost nothing, so the table would save no space and add
 * a file that could disagree with the sheet.
 */
const cellXml = (value: Cell, ref: string) => {
  if (value === null || value === '') return '';
  if (typeof value === 'number' && Number.isFinite(value)) return `<c r="${ref}"><v>${value}</v></c>`;
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(String(value))}</t></is></c>`;
};

export const buildSheetXml = (rows: Cell[][]) => {
  const body = rows
    .map((row, r) => {
      const cells = row.map((value, c) => cellXml(value, `${columnName(c)}${r + 1}`)).join('');
      return cells ? `<row r="${r + 1}">${cells}</row>` : `<row r="${r + 1}"/>`;
    })
    .join('');

  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    `<sheetData>${body}</sheetData>` +
    '</worksheet>'
  );
};

const CONTENT_TYPES =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
  '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
  '</Types>';

const ROOT_RELS =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
  '</Relationships>';

const WORKBOOK_RELS =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
  '</Relationships>';

const workbookXml = (sheetName: string) =>
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
  `<sheets><sheet name="${escapeXml(sheetName)}" sheetId="1" r:id="rId1"/></sheets>` +
  '</workbook>';

/** One sheet, which is all a monthly statement needs. */
export const buildXlsx = (rows: Cell[][], sheetName: string = m().files.sheetName, now: Date = new Date()) =>
  zip(
    [
      { name: '[Content_Types].xml', data: bytes(CONTENT_TYPES) },
      { name: '_rels/.rels', data: bytes(ROOT_RELS) },
      { name: 'xl/workbook.xml', data: bytes(workbookXml(sheetName)) },
      { name: 'xl/_rels/workbook.xml.rels', data: bytes(WORKBOOK_RELS) },
      { name: 'xl/worksheets/sheet1.xml', data: bytes(buildSheetXml(rows)) },
    ],
    now
  );
