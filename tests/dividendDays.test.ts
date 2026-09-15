import { declaredIncome, dividendTradeId, dueDividends, parseDividends, upcomingDividends } from '../services/dividends';
import type { Dividend, Trade } from '../types';
import { eq, report } from './harness';

/*
  Dividend dates as a phone in Malaysia sees them.

  The Worker stamps each date at UTC midnight, which is 08:00 in Kuala Lumpur,
  and the phone compares against its own local midnight. Every instant below
  is written out with its offset, so nothing depends on where the tests run;
  only "today" on the phone is local by nature, so the process is put in
  Malaysia's zone for this file (Node re-reads TZ when it is set) and the
  result is checked before anything is trusted.
*/
process.env.TZ = 'Asia/Kuala_Lumpur';

const myt = (iso: string) => Date.parse(`${iso}+08:00`);

eq('the process really is on Malaysia time', new Date(Date.parse('2026-03-26T00:00:00Z')).getHours(), 8);

const dividend: Dividend = {
  symbol: '1155.KL',
  subject: 'Second Interim Dividend',
  // What the Worker sends: UTC midnights.
  exDate: Date.parse('2026-03-12T00:00:00Z'),
  payDate: Date.parse('2026-03-26T00:00:00Z'),
  perUnitPoints: 3300,
  announcedAt: Date.parse('2026-02-27T00:00:00Z'),
};

const trade = (id: string, kind: Trade['kind'], units: number, tradedAt: number): Trade => ({
  id,
  symbol: '1155.KL',
  name: 'MAYBANK',
  kind,
  units,
  priceCents: 1000,
  tradedAt,
  createdAt: 0,
});

// Trades are stored at local midnight.
const held = [trade('b1', 'buy', 500, myt('2026-03-01T00:00:00'))];

// The bug: at 00:30 on the pay date the payment stamped 08:00 was still "tomorrow".
eq('it falls due in the first minutes of the pay date',
  dueDividends([dividend], held, [], myt('2026-03-26T00:30:00')).map((d) => d.amountCents), [16500]);
eq('and not on the evening before',
  dueDividends([dividend], held, [], myt('2026-03-25T23:59:00')), []);

// The ex-date locks the payment in from its first minute, not from 08:00 — or the day after.
eq('the ex-date locks it in from midnight',
  declaredIncome([dividend], held, myt('2026-03-12T00:10:00')).lockedCents, 16500);
eq('but not the evening before',
  declaredIncome([dividend], held, myt('2026-03-11T23:50:00')).lockedCents, 0);

// Entitlement is still settled by the close of the day before the ex-date.
eq('bought the day before the ex-date, it is yours',
  dueDividends([dividend], [trade('b2', 'buy', 500, myt('2026-03-11T00:00:00'))], [], myt('2026-03-26T09:00:00'))
    .map((d) => d.units), [500]);
eq('bought on the ex-date, it is not',
  dueDividends([dividend], [trade('b3', 'buy', 500, myt('2026-03-12T00:00:00'))], [], myt('2026-03-26T09:00:00')), []);

eq('the pay date is still upcoming until its day ends',
  upcomingDividends([dividend], held, myt('2026-03-26T23:59:00')).length, 1);
eq('and gone the next morning', upcomingDividends([dividend], held, myt('2026-03-27T00:01:00')).length, 0);

// The id is the stored number, unchanged by any of this.
eq('the id is what it always was', dividendTradeId(dividend.symbol, dividend.exDate), 'div_1155.KL_1773273600000');
eq('a paid dividend stays paid',
  dueDividends([dividend], held, ['div_1155.KL_1773273600000'], myt('2026-03-26T09:00:00')), []);

// Parsing here, in Malaysia, gives the same numbers the Worker gives in UTC.
{
  const page = `<table><thead><tr><th>Announced</th><th>Subject</th><th>EX Date</th><th>Payment Date</th><th>Amount</th></tr></thead>
    <tbody><tr><td>27 Feb 2026</td><td>Second Interim Dividend</td><td>12 Mar 2026</td><td>26 Mar 2026</td><td>0.3300</td></tr></tbody></table>`;
  eq('a parse on the phone matches the Worker to the millisecond', parseDividends(page, '1155.KL'), [dividend]);
}

report();
