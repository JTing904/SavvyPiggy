import { buildCsv, exportFileName } from '../services/export';
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

eq('starts with a BOM', csv.charCodeAt(0), 0xfeff);
eq('header quotes tricky goal names', lines[0].slice(1), 'Date,Time,Type,Amount,Repaid debt,Note,Car,"股票, ""stocks""",Deleted goals');
eq('rows are oldest first', lines[1], '2026-09-04,18:30,Deposit,100.00,,,60.00,35.00,5.00');
eq('multi-line note is quoted', lines[2], '2026-09-05,09:07,Withdrawal,5.00,,"coffee\nand cake",-5.00,,');
eq('ends with a newline', csv.endsWith('\r\n'), true);
eq('no deleted-goal column when none needed', buildCsv([ACTS[0]], BANKS).split('\r\n')[0].endsWith('"股票, ""stocks"""'), true);

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
