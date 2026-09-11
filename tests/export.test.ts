import { buildCsv, buildMonthCsv, exportFileName } from '../services/export';
import { buildImagePdf } from '../services/pdf';
import type { Activity, PiggyBank } from '../types';
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

const BANKS = [bank('a', 'Car'), bank('b', '股票, "stocks"')];
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

const csv = buildCsv(ACTS, BANKS);
const lines = csv.split('\r\n');

// Tabs, not commas: the file is written as UTF-16 so Chinese goal names
// survive, and a spreadsheet reading a two-byte encoding looks for tabs.
eq('columns are separated by tabs', lines[0].includes('\t'), true);
eq('a goal name with a comma needs no quoting now', lines[0].split('\t')[6], 'Car');
eq('but one with a quote still does',
  lines[0].split('\t').slice(7).join('\t'), '"\u80a1\u7968, ""stocks"""\tDeleted goals');
eq('rows are oldest first', lines[1], '2026-09-04\t18:30\tDeposit\t100.00\t\t\t60.00\t35.00\t5.00');
eq('multi-line note is quoted', lines[2], '2026-09-05\t09:07\tWithdrawal\t5.00\t\t"coffee\nand cake"\t-5.00\t\t');
eq('the block carries no mark of its own', csv.charCodeAt(0) === 0xfeff, false);
eq('and no trailing blank line', csv.endsWith('\r\n'), false);
eq('no deleted-goal column when none needed',
  buildCsv([ACTS[0]], BANKS).split('\r\n')[0].endsWith('"\u80a1\u7968, ""stocks"""'), true);

// --- the month file, as bytes
{
  const bytes = buildMonthCsv({
    label: 'September 2026', activities: ACTS, banks: BANKS, trades: [], holdings: [], quotes: {},
  });
  eq('it opens with the UTF-16 byte-order mark', [bytes[0], bytes[1]], [0xff, 0xfe]);
  // A decoder consumes the mark, which is how it should be: the bytes carry it
  // for the reader, and the text itself starts at the first real character.
  const text = new TextDecoder('utf-16le').decode(bytes);
  const rows = text.split('\r\n');
  eq('the month is named at the top', rows[0], 'SavvyPiggy statement\tSeptember 2026');
  eq('both halves are present',
    [rows[2], rows.includes('INVESTMENTS'), rows.includes('POSITIONS AT MONTH END')],
    ['SAVINGS', true, true]);
  // A Chinese name surviving the round trip is the whole point of the change.
  eq('Chinese goal names come back intact', text.includes('\u80a1\u7968'), true);
}

eq('file name is filesystem-safe', exportFileName('Sep 1 – Sep 30, 2026', 'csv', new Date(2026, 8, 5)), 'SavvyPiggy_2026-09-05_Sep-1-Sep-30-2026.csv');

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
