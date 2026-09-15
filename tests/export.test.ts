import { buildMonthWorkbook, ledgerAmount, monthFileName, monthRows, savingsRows, unitPrice } from '../services/export';
import { buildImagePdf } from '../services/pdf';
import { buildSheetXml, columnName, crc32, zip } from '../services/xlsx';
import type { Activity, PiggyBank, Trade } from '../types';
import { eq, report } from './harness';

const bank = (id: string, name: string): PiggyBank => ({
  id,
  name,
  targetAmount: 100,
  currentAmount: 0,
  splitPercentage: 0,
  icon: 'savings',
  imageUrl: '',
  isLocked: false,
  autoSplit: true,
  createdAt: 0,
});

const BANKS = [bank('a', 'Car'), bank('b', '股票 & "stocks"')];
const ACTS: Activity[] = [
  {
    id: '2',
    type: 'withdraw',
    date: new Date(2026, 8, 5, 9, 7).toISOString(),
    amount: 5,
    distributions: [{ bankId: 'a', amount: -5, percentage: 100 }],
    note: 'coffee\nand cake',
  },
  {
    id: '1',
    type: 'manual',
    date: new Date(2026, 8, 4, 18, 30).toISOString(),
    amount: 100,
    distributions: [
      { bankId: 'a', amount: 60, percentage: 60 },
      { bankId: 'b', amount: 35, percentage: 35 },
      { bankId: 'gone', amount: 5, percentage: 5 },
    ],
    repaid: 0,
  },
];

// --- the savings table
const rows = savingsRows(ACTS, BANKS);
eq('a goal name goes in as it was written', rows[0][8], '股票 & "stocks"');
eq('a deleted goal keeps its own column', rows[0][9], 'Deleted goals');
eq('rows are oldest first', rows[1][0], '2026-09-04');
eq('amounts are numbers, not text', rows[1].slice(3, 5), [100, null]);
eq('what reached each goal', rows[1].slice(7), [60, 35, 5]);
eq('a goal that got nothing is left empty', rows[2].slice(7), [-5, null, null]);
eq('a multi-line note survives whole', rows[2][5], 'coffee\nand cake');
eq('no deleted-goal column when none is needed', savingsRows([ACTS[0]], BANKS)[0].length, 9);

// The category column: spending carries one, nothing else does, and an
// entry made before categories existed reads as Other rather than blank --
// a blank would drop it out of any total built from this sheet.
eq('the category column is named', rows[0][6], 'Category');
eq('an uncategorised withdrawal reads as Other', rows[2][6], 'Other');
eq('a deposit has no category at all', rows[1][6], null);
{
  const labelled = savingsRows([{ ...ACTS[0], category: 'food' }], BANKS);
  eq('a categorised withdrawal carries its label', labelled[1][6], 'Food & drink');
  const unknown = savingsRows([{ ...ACTS[0], category: 'from-a-later-version' }], BANKS);
  eq('a key this version does not know still totals as Other', unknown[1][6], 'Other');
}

// --- money moved for shares
{
  const TRADES: Activity[] = [
    {
      id: 'inv',
      type: 'invest',
      date: new Date(2026, 8, 6, 10, 0).toISOString(),
      amount: 799.24,
      distributions: [{ bankId: 'b', amount: -799.24, percentage: 100 }],
      tradeId: 't1',
      counter: 'RHBBANK',
      units: 100,
    },
    {
      id: 'div',
      type: 'divest',
      date: new Date(2026, 8, 7, 10, 0).toISOString(),
      amount: 1070.32,
      distributions: [{ bankId: 'a', amount: 1020.32, percentage: 100 }],
      repaid: 50,
      tradeId: 't2',
      counter: 'MAYBANK',
      units: 100,
    },
  ];
  const sheet = savingsRows([...ACTS, ...TRADES], BANKS);
  const [buy, sale] = [sheet[3], sheet[4]];
  eq('a purchase is typed as invested', buy[2], 'Invested');
  eq('and names its counter', buy[5], 'Invested · RHBBANK');
  eq('a sale names its counter too', sale[5], 'Sale proceeds · MAYBANK');
  eq('shares carry no category', [buy[6], sale[6]], [null, null]);
  eq('the goal a purchase was paid from goes down', buy.slice(7), [null, -799.24, null]);
  eq('a sale shows what cleared spent ahead and what reached a goal', [sale[3], sale[4], ...sale.slice(7)], [1070.32, 50, 1020.32, null, null]);
  const noCounter = savingsRows([{ ...TRADES[0], counter: undefined, note: 'kept' }], BANKS);
  eq('a row without a counter keeps its own note', noCounter[1][5], 'kept');
}

// --- the month, both halves
{
  const sheet = monthRows({
    label: 'September 2026',
    activities: ACTS,
    banks: BANKS,
    trades: [],
    holdings: [],
    quotes: {},
  });
  const flat = sheet.map((r) => r[0]);
  eq('the month is named at the top', sheet[0], ['SavvyPiggy statement', 'September 2026']);
  eq('every block is present and in order',
    flat.filter((c) => typeof c === 'string' && /^[A-Z ]+$/.test(c)),
    ['SAVINGS', 'INVESTMENTS', 'POSITIONS AT MONTH END']);
  eq('an empty half says so rather than vanishing',
    [flat.includes('No trades this month'), flat.includes('Nothing held')], [true, true]);
}

// --- a transfer carries its own sign
{
  const handedOn: Activity = {
    id: 't', type: 'transfer', date: new Date(2026, 8, 8).toISOString(), amount: 20,
    distributions: [{ bankId: 'a', amount: -20, percentage: 100 }], fromGoal: 'Old',
  };
  eq('an overspent goal handed on reads as a minus', ledgerAmount(handedOn), -20);
  eq('a positive one as a plus', ledgerAmount({ ...handedOn, distributions: [{ bankId: 'a', amount: 20, percentage: 100 }] }), 20);
  eq('other rows keep their type\'s direction', [ledgerAmount(ACTS[0]), ledgerAmount(ACTS[1])], [-5, 100]);
  eq('and the sheet shows the transfer signed', savingsRows([handedOn], BANKS)[1][3], -20);
}

// --- trades reconcile: value, fees, total
{
  eq('a half-sen price keeps its digits', [unitPrice(3450), unitPrice(125), unitPrice(100_000)], ['0.345', '0.0125', '10.00']);
  const buy: Trade = {
    id: 'b', symbol: '0001.KL', name: 'PENNY', kind: 'buy', units: 1000, priceCents: 35, pricePoints: 3450,
    tradedAt: new Date(2026, 8, 6).getTime(), createdAt: 0,
    fees: { brokerageCents: 800, clearingCents: 100, stampCents: 100, sstCents: 64 },
  };
  const div: Trade = {
    id: 'd', symbol: '0001.KL', name: 'PENNY', kind: 'dividend', units: 1000, priceCents: 0, perUnitPoints: 125,
    tradedAt: new Date(2026, 8, 7).getTime(), createdAt: 0,
  };
  const sheet = monthRows(
    { label: 'September 2026', activities: [], banks: BANKS, trades: [buy, div], holdings: [], quotes: {} },
    new Date(2026, 8, 13)
  );
  const at = sheet.findIndex((r) => r[0] === 'INVESTMENTS');
  eq('the trade header has value, fees and total', sheet[at + 1].slice(5), ['Per unit', 'Value', 'Fees', 'Total']);
  eq('a buy: exact price, value before fees, fees, and what it cost', sheet[at + 2].slice(5), [0.345, 345, 10.64, 355.64]);
  eq('a dividend has no fees', sheet[at + 3].slice(5), [0.0125, 12.5, null, 12.5]);
}

// --- positions say their prices are today's
{
  const sheet = monthRows(
    {
      label: 'August 2026', activities: [], banks: BANKS, trades: [],
      holdings: [{ id: '1155.KL', symbol: '1155.KL', name: 'MAYBANK', units: 100, costCents: 100_000, createdAt: 0 }],
      quotes: {},
    },
    new Date(2026, 8, 13)
  );
  const at = sheet.findIndex((r) => r[0] === 'POSITIONS AT MONTH END');
  eq('the positions block notes the date its prices are from', String(sheet[at + 1][0]).includes('2026-09-13'), true);
}

// --- the file itself
eq('a zip of nothing is just its end record', zip([], new Date(2026, 8, 5)).length, 22);
eq('crc32 of the usual check string', crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
eq('columns run past Z', [columnName(0), columnName(25), columnName(26), columnName(27)], ['A', 'Z', 'AA', 'AB']);

{
  const xml = buildSheetXml([['a & b', 5, null], []]);
  eq('the sheet declares its own encoding', xml.startsWith('<?xml version="1.0" encoding="UTF-8"'), true);
  eq('text is escaped', xml.includes('<t xml:space="preserve">a &amp; b</t>'), true);
  eq('numbers are numbers', xml.includes('<c r="B1"><v>5</v></c>'), true);
  eq('an empty cell is written as nothing at all', xml.includes('C1'), false);
  eq('an empty row still holds its place', xml.includes('<row r="2"/>'), true);
}

{
  const book = buildMonthWorkbook(
    { label: 'September 2026', activities: ACTS, banks: BANKS, trades: [], holdings: [], quotes: {} },
    new Date(2026, 8, 5, 12)
  );
  const text = new TextDecoder('latin1').decode(book);
  eq('it is a zip', [book[0], book[1], book[2], book[3]], [0x50, 0x4b, 0x03, 0x04]);
  eq('with the parts a workbook needs',
    ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/worksheets/sheet1.xml']
      .every((name) => text.includes(name)),
    true);
  eq('the end-of-directory record is last', text.slice(-22, -18), 'PK');
  eq('and counts every part', book[book.length - 12], 5);

  // The whole reason for this format: the name has to come back byte for byte.
  const utf8 = new TextDecoder('utf-8').decode(book);
  eq('a Chinese goal name is stored as UTF-8', utf8.includes('股票 &amp; &quot;stocks&quot;'), true);
}

eq('the file is named after the month', monthFileName('September 2026', 'xlsx'), 'SavvyPiggy-September-2026.xlsx');

// --- pdf
const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]);
const pdf = buildImagePdf([
  { jpeg, width: 10, height: 20 },
  { jpeg, width: 10, height: 20 },
]);
const text = new TextDecoder('latin1').decode(pdf);

eq('pdf header', text.startsWith('%PDF-1.4\n'), true);
eq('pdf trailer', text.trimEnd().endsWith('%%EOF'), true);
eq('two pages', (text.match(/\/Type \/Page\b/g) ?? []).length, 2);
eq('page tree count', /\/Count 2/.test(text), true);

// Every xref offset must point at "<n> 0 obj".
const xrefAt = Number(text.slice(text.lastIndexOf('startxref') + 10).trim().split('\n')[0]);
eq('startxref points at the xref table', text.slice(xrefAt, xrefAt + 4), 'xref');
const entries = text
  .slice(xrefAt)
  .split('\n')
  .slice(2)
  .filter((l) => / n $/.test(l))
  .map((l, i) => text.slice(Number(l.slice(0, 10)), Number(l.slice(0, 10)) + `${i + 1} 0 obj`.length) === `${i + 1} 0 obj`);
eq('all 8 objects are addressed correctly', entries, [true, true, true, true, true, true, true, true]);
eq('image bytes are embedded verbatim', text.includes('stream\n\xff\xd8\xff\xd9\nendstream'), true);

report();
