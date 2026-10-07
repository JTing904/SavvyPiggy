import { eq, report } from './harness';
import { groupRows, readReceipt, type ReadLine } from '../services/receipt';

const NOW = new Date(2026, 9, 7, 15);
const ymd = (d: Date | null) => (d ? `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}` : null);

/** Lines laid out top to bottom, one per row; a pair makes a label on the left and a figure on the right. */
const screen = (rows: (string | [string, string])[]): ReadLine[] =>
  rows.flatMap((row, i): ReadLine[] =>
    typeof row === 'string'
      ? [{ text: row, top: 100 + i * 60, left: 40, height: 30 }]
      : [
          { text: row[0], top: 100 + i * 60, left: 40, height: 30 },
          { text: row[1], top: 102 + i * 60, left: 600, height: 28 },
        ]
  );

// --- rows of the picture
eq(
  'a label and its figure on the same row become one row',
  groupRows(screen([['Total Paid', 'RM12.50'], 'Thank you'])),
  ['Total Paid RM12.50', 'Thank you']
);
eq('lines out of order are read top to bottom, left to right', groupRows([
  { text: 'RM12.50', top: 100, left: 600, height: 30 },
  { text: 'Paid', top: 101, left: 40, height: 30 },
  { text: 'Below', top: 200, left: 40, height: 30 },
]), ['Paid RM12.50', 'Below']);

// --- an e-wallet screen: what was paid, not the basket
{
  const r = readReceipt(
    screen([
      'Payment Successful',
      ['Order value', 'RM15.00'],
      ['Coins used', '-RM2.50'],
      ['Total Paid', 'RM12.50'],
      ['Paid to', 'Kopitiam Ah Seng'],
      ['Date', '06/10/2026 12:03'],
    ]),
    NOW
  );
  eq('the paid line, not the basket', [r.cents, r.income, r.zeroPaid], [1250, false, false]);
  eq('the date is day first', ymd(r.day), '2026-10-6');
  eq('the merchant', r.merchant, 'Kopitiam Ah Seng');
  eq('where it was read from', [r.evidence.amount, r.evidence.date], ['Total Paid RM12.50', '06/10/2026']);
  eq('every amount is offered too', r.candidates, [1500, 250, 1250]);
}

// --- Chinese
{
  const r = readReceipt(screen(['付款成功', ['订单金额', 'RM48.00'], ['您已支付', 'RM39.90'], ['付款给', 'Mydin'], '2026年10月5日 18:20']), NOW);
  eq('您已支付', r.cents, 3990);
  eq('a date written in Chinese', ymd(r.day), '2026-10-5');
  eq('付款给', r.merchant, 'Mydin');
}

// --- the figure on the line under the label
eq(
  'the figure under the label',
  readReceipt(screen(['Amount Paid', 'RM8.00', 'Order value', 'RM10.00']), NOW).cents,
  800
);

// --- money in
eq('a plus is income', (() => { const r = readReceipt(screen(['Received', ['From Ali', '+RM50.00']]), NOW); return [r.cents, r.income]; })(), [5000, true]);
eq('a received line is income', (() => { const r = readReceipt(screen([['Money received', 'RM30.00']]), NOW); return [r.cents, r.income]; })(), [3000, true]);

// --- paid with coins: asks, never writes a zero
{
  const r = readReceipt(screen([['Order value', 'RM9.00'], ['Total Paid', 'RM0.00']]), NOW);
  eq('RM0 paid is not an amount', [r.cents, r.zeroPaid], [null, true]);
  eq('but the other figure is offered', r.candidates, [900]);
}

// --- when it cannot tell
{
  const r = readReceipt(screen([['Item A', 'RM48.00'], ['Item B', 'RM9.00'], ['Item C', 'RM39.00']]), NOW);
  eq('no paid line: nothing filled in', r.cents, null);
  eq('the figures are listed for the person to pick', r.candidates, [4800, 900, 3900]);
}
{
  const r = readReceipt(screen([['Total Paid', 'RM10.00'], ['Total Paid', 'RM12.00']]), NOW);
  eq('two different paid lines: nothing filled in', [r.cents, r.candidates], [null, [1000, 1200]]);
}
eq('a plain total on a paper receipt', readReceipt(screen([['Subtotal', 'RM40.00'], ['TOTAL', 'RM42.40']]), NOW).cents, null);
eq('a single TOTAL is used', readReceipt(screen([['Item', 'RM40.00'], ['TOTAL', 'RM42.40']]), NOW).cents, 4240);
eq('nothing at all', (() => { const r = readReceipt([], NOW); return [r.cents, r.day, r.merchant, r.candidates]; })(), [null, null, null, []]);

// --- dates
eq('a month name', ymd(readReceipt(screen(['6 Oct 2026']), NOW).day), '2026-10-6');
eq('a long month name', ymd(readReceipt(screen(['6 October 2026']), NOW).day), '2026-10-6');
eq('month first', ymd(readReceipt(screen(['Oct 6, 2026']), NOW).day), '2026-10-6');
eq('year first', ymd(readReceipt(screen(['2026-10-06 12:03']), NOW).day), '2026-10-6');
eq('a date in the future is not believed', readReceipt(screen(['25/12/2026']), NOW).day, null);
eq('a day that does not exist', readReceipt(screen(['31/02/2026']), NOW).day, null);
eq('two-digit years are not guessed at', readReceipt(screen(['06/10/26']), NOW).day, null);

report();
