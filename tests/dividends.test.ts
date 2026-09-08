import {
  dividendCents,
  dividendTradeId,
  dueDividends,
  parseDay,
  parseDividends,
  parsePoints,
  upcomingDividends,
} from '../services/dividends';
import { dayStart } from '../services/holdings';
import type { Trade } from '../types';
import { eq, report } from './harness';

const on = (year: number, month: number, day: number) => dayStart(new Date(year, month - 1, day).getTime());

// --- dates
eq('a listed date becomes local midnight', parseDay('12 Mar 2026'), on(2026, 3, 12));
eq('a leading space and comma are tolerated', parseDay(' 27 Feb, 2026 '), on(2026, 2, 27));
eq('a full month name still reads', parseDay('1 September 2025'), on(2025, 9, 1));
eq('a date that does not exist is refused', parseDay('31 Feb 2026'), null);
eq('anything else is refused', parseDay('soon'), null);
eq('an empty cell is refused', parseDay(''), null);

// --- amounts
eq('an amount is kept to a hundredth of a sen', parsePoints('0.3300'), 3300);
eq('a sub-sen dividend survives', parsePoints('0.0125'), 125);
eq('thousands separators are ignored', parsePoints('1,0.5000'), 105000);
eq('a zero amount is no dividend', parsePoints('0.0000'), null);
eq('a dash is no dividend', parsePoints('-'), null);

// --- the announcement table
const HTML = `
<h3>Shareholding changes</h3>
<table><thead><tr><th>Announced</th><th>Date Change</th><th>Type</th></tr></thead>
<tbody><tr><td>21 Jan 2026</td><td>16 Jan 2026</td><td>Disposed</td></tr></tbody></table>
<h3>Dividends</h3>
<table>
  <thead><tr>
    <th>Announced</th><th>Financial Year</th><th>Subject</th>
    <th>EX Date</th><th>Payment Date</th><th>Amount</th><th>Indicator</th><th></th>
  </tr></thead>
  <tbody><tr><td colspan="100"><small><strong>31 Dec, 2025</strong></small></td></tr></tbody>
  <tbody><tr>
    <td>27 Feb 2026</td><td>31 Dec 2025</td><td>Second Interim Dividend</td>
    <td>12 Mar 2026</td><td>26 Mar 2026</td><td>0.3300</td><td>Currency</td><td><a href="#">View</a></td>
  </tr></tbody>
  <tbody><tr>
    <td>27 Aug 2025</td><td>31 Dec 2025</td><td>First Interim Dividend</td>
    <td>11 Sep 2025</td><td>26 Sep 2025</td><td>0.3000</td><td>Currency</td><td><a href="#">View</a></td>
  </tr></tbody>
  <tbody><tr>
    <td>1 Aug 2025</td><td>31 Dec 2025</td><td>Bonus Issue</td>
    <td>5 Aug 2025</td><td>19 Aug 2025</td><td>1.0000</td><td>Ratio</td><td></td>
  </tr></tbody>
  <tbody><tr>
    <td>1 Jul 2025</td><td>31 Dec 2025</td><td>Interim Dividend</td>
    <td>&nbsp;</td><td>&nbsp;</td><td>0.1000</td><td>Currency</td><td></td>
  </tr></tbody>
</table>`;

const parsed = parseDividends(HTML, '1155.KL');
eq('only the cash dividends are taken', parsed.length, 2);
eq('the newest comes first', parsed[0], {
  symbol: '1155.KL',
  subject: 'Second Interim Dividend',
  exDate: on(2026, 3, 12),
  payDate: on(2026, 3, 26),
  perUnitPoints: 3300,
  announcedAt: on(2026, 2, 27),
});
eq('a bonus issue is not money', parsed.some((d) => /bonus/i.test(d.subject)), false);
eq('an announcement with no dates yet is left out', parsed.some((d) => d.perUnitPoints === 1000), false);

eq('a page without the table yields nothing', parseDividends('<p>nothing here</p>', '1155.KL'), []);
eq(
  'a table whose headings moved is not guessed at',
  parseDividends('<table><thead><tr><th>EX Date</th><th>Notes</th></tr></thead></table>', '1155.KL'),
  []
);
{
  // The shareholding table alone must never be read as dividends, even though
  // its rows are two dates and a number.
  const onlyChanges = HTML.slice(0, HTML.indexOf('<h3>Dividends'));
  eq('another table on the page is not mistaken for this one', parseDividends(onlyChanges, '1155.KL'), []);
}

// --- what is owed
let seq = 0;
const trade = (extra: Partial<Trade> & Pick<Trade, 'kind' | 'units' | 'tradedAt'>): Trade => ({
  id: `t${++seq}`,
  symbol: '1155.KL',
  name: 'MAYBANK',
  priceCents: 1000,
  ...extra,
  createdAt: seq,
});

const declared = parsed[1]; // ex 11 Sep 2025, pays 26 Sep 2025, RM0.30

// 500 units at RM0.30 is RM150.00.
eq('a dividend is worth units times the rate', dividendCents(500, 3000), 15000);
eq('and rounds down to the sen', dividendCents(333, 125), 416);

{
  const log = [trade({ kind: 'buy', units: 500, tradedAt: on(2025, 8, 1) })];
  const due = dueDividends([declared], log, on(2025, 9, 26));
  eq('it falls due on the pay date', due.length, 1);
  eq('on the units held before the ex-date', due[0].units, 500);
  eq('for the amount that follows from them', due[0].amountCents, 15000);
}
{
  const log = [trade({ kind: 'buy', units: 500, tradedAt: on(2025, 8, 1) })];
  eq('nothing is due the day before it pays', dueDividends([declared], log, on(2025, 9, 25)), []);
}
{
  // Bought after the ex-date: this one belongs to whoever sold.
  const log = [trade({ kind: 'buy', units: 500, tradedAt: on(2025, 9, 12) })];
  eq('a position opened after the ex-date is owed nothing', dueDividends([declared], log, on(2025, 9, 26)), []);
}
{
  // Sold after the ex-date: still owed, even though nothing is held now.
  const log = [
    trade({ kind: 'buy', units: 500, tradedAt: on(2025, 8, 1) }),
    trade({ kind: 'sell', units: 500, tradedAt: on(2025, 9, 15) }),
  ];
  const due = dueDividends([declared], log, on(2025, 9, 26));
  eq('a position closed after the ex-date is still paid', due[0].amountCents, 15000);
}
{
  // Topping up after the ex-date must not enlarge a dividend already decided.
  const log = [
    trade({ kind: 'buy', units: 500, tradedAt: on(2025, 8, 1) }),
    trade({ kind: 'buy', units: 500, tradedAt: on(2025, 9, 20) }),
  ];
  eq('a later top-up does not join it', dueDividends([declared], log, on(2025, 9, 26))[0].units, 500);
}
{
  const log = [
    trade({ kind: 'buy', units: 500, tradedAt: on(2025, 8, 1) }),
    {
      ...trade({ kind: 'dividend', units: 500, tradedAt: on(2025, 9, 26) }),
      id: dividendTradeId('1155.KL', declared.exDate),
      exDate: declared.exDate,
      perUnitPoints: 3000,
    },
  ];
  eq('one already in the log is not paid twice', dueDividends([declared], log, on(2025, 9, 26)), []);
}
{
  const other = [trade({ symbol: '5258.KL', name: 'BIMB', kind: 'buy', units: 500, tradedAt: on(2025, 8, 1) })];
  eq('a dividend for a counter you do not hold is skipped', dueDividends([declared], other, on(2025, 9, 26)), []);
}
eq('an id is one per counter per ex-date',
  dividendTradeId('1155.KL', on(2026, 3, 12)), `div_1155.KL_${on(2026, 3, 12)}`);

{
  const log = [trade({ kind: 'buy', units: 500, tradedAt: on(2025, 8, 1) })];
  const soon = upcomingDividends(parsed, log, on(2026, 1, 1));
  eq('only what has yet to pay is upcoming', soon.length, 1);
  // 500 units at RM0.33 is RM165.00.
  eq('with what it should come to', soon[0].amountCents, 16500);
  eq("today's payment still counts as upcoming",
    upcomingDividends(parsed, log, on(2026, 3, 26)).length, 1);
}

report();
