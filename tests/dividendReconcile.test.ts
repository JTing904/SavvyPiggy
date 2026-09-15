import {
  declaredIncome,
  dividendsAfterChange,
  dividendTradeId,
  dividendUnits,
  dueDividends,
  reconcileDividends,
  settleSlots,
  slotOf,
  upcomingDividends,
  type CreditedDividend,
} from '../services/dividends';
import { dayStart, replay } from '../services/holdings';
import type { Dividend, Trade } from '../types';
import { eq, report } from './harness';

/** A local midnight on this machine: how trades and "now" are dated. */
const on = (year: number, month: number, day: number) => dayStart(new Date(year, month - 1, day).getTime());
const utc = (year: number, month: number, day: number) => Date.UTC(year, month - 1, day);

let seq = 0;
const trade = (extra: Partial<Trade> & Pick<Trade, 'kind' | 'units' | 'tradedAt'>): Trade => ({
  id: `t${++seq}`,
  symbol: '1155.KL',
  name: 'MAYBANK',
  priceCents: 1000,
  createdAt: extra.tradedAt,
  money: { mode: 'pot' },
  ...extra,
});

// Ex 12 Mar 2026, pays 26 Mar 2026, RM0.33.
const march: Dividend = {
  symbol: '1155.KL',
  subject: 'Second Interim Dividend',
  exDate: utc(2026, 3, 12),
  payDate: utc(2026, 3, 26),
  perUnitPoints: 3300,
  announcedAt: utc(2026, 2, 27),
};
const marchId = dividendTradeId('1155.KL', march.exDate);

// --- 1. back-filled buys do not earn dividends already paid
{
  const backfill = trade({ kind: 'buy', units: 1000, tradedAt: on(2025, 1, 5), createdAt: on(2026, 9, 1), money: { mode: 'none' } });
  eq('a buy filled in after the pay date earns nothing from it', dueDividends([march], [backfill], [], on(2026, 9, 2)), []);
  eq('nor with no money stamp at all', dueDividends([march], [{ ...backfill, money: undefined }], [], on(2026, 9, 2)), []);
  eq('filled in on the pay date itself, it still counts',
    dueDividends([march], [{ ...backfill, createdAt: on(2026, 3, 26) + 3_600_000 }], [], on(2026, 3, 26))[0]?.units, 1000);
  eq('the same buy paid from the pot counts as dated',
    dueDividends([march], [{ ...backfill, money: { mode: 'pot' } }], [], on(2026, 9, 2))[0]?.units, 1000);
  eq('and so does one paid from a goal',
    dueDividends([march], [{ ...backfill, money: { mode: 'goal', goalId: 'g', activityId: 'a' } }], [], on(2026, 9, 2))[0]?.units, 1000);

  const pot = trade({ kind: 'buy', units: 500, tradedAt: on(2026, 1, 10) });
  eq('a pot buy alongside it counts on its own', dividendUnits([backfill, pot], march), 500);
  const sold = trade({ kind: 'sell', units: 800, tradedAt: on(2026, 2, 1) });
  eq('sales left bigger than the counted buys stop at zero', dividendUnits([backfill, pot, sold], march), 0);
  eq('the log itself still holds the shares', replay([backfill, pot, sold]).units, 700);

  const upcomingPay: Dividend = { ...march, exDate: utc(2026, 10, 1), payDate: utc(2026, 10, 20) };
  eq('a dividend still to pay counts a back-filled buy entered before it pays',
    upcomingDividends([upcomingPay], [backfill], on(2026, 9, 2))[0].units, 1000);
}

// --- 3. same-day order: buys first
{
  const sell = trade({ kind: 'sell', units: 100, tradedAt: on(2026, 2, 2), createdAt: 1 });
  const buy = trade({ kind: 'buy', units: 100, tradedAt: on(2026, 2, 2), createdAt: 2 });
  eq('a sale entered before its same-day buy still sells what was bought', replay([sell, buy]).units, 0);
  eq('and the cost leaves with it', replay([sell, buy]).costCents, 0);
}

// --- 8. a dividend paid today is not also still to come
{
  const held = [trade({ kind: 'buy', units: 500, tradedAt: on(2026, 1, 5) })];
  eq('paid today and not yet credited, it is upcoming', upcomingDividends([march], held, on(2026, 3, 26)).length, 1);
  eq('once credited it is not', upcomingDividends([march], held, on(2026, 3, 26), [marchId]).length, 0);
  eq('and the year ahead does not count it twice', declaredIncome([march], held, on(2026, 3, 26), [marchId]).totalCents, 0);
}

// --- 2. correcting a trade moves dividends already paid into the pot
{
  const b1 = trade({ kind: 'buy', units: 1000, tradedAt: on(2026, 1, 5) });
  const row: Trade = {
    id: marchId, symbol: '1155.KL', name: 'MAYBANK', kind: 'dividend', units: 1000, priceCents: 0,
    perUnitPoints: 3300, exDate: march.exDate, tradedAt: on(2026, 3, 26), createdAt: on(2026, 3, 26), money: { mode: 'pot' },
  };
  const log = [b1, row];
  const marker: CreditedDividend = { id: marchId, symbol: '1155.KL', exDate: march.exDate, payDate: march.payDate, perUnitPoints: 3300, units: 1000, amountCents: 33000, pot: true };

  const fewer = dividendsAfterChange({ trades: log, credited: [marker], dividends: [], previousId: b1.id, next: { ...b1, units: 900 } });
  eq('100 units fewer takes RM33.00 back out of the pot', fewer.deltaCents, -3300);
  eq('and the marker says what is now owed', fewer.changes.map((c) => [c.id, c.units, c.amountCents]), [[marchId, 900, 29700]]);

  const gone = dividendsAfterChange({ trades: log, credited: [marker], dividends: [], previousId: b1.id, next: null });
  eq('deleting the only buy takes it all back', [gone.deltaCents, gone.changes[0].units], [-33000, 0]);

  const later = dividendsAfterChange({ trades: log, credited: [marker], dividends: [], previousId: b1.id, next: { ...b1, tradedAt: on(2026, 3, 12) } });
  eq('re-dating the buy to the ex-date loses the dividend', later.deltaCents, -33000);

  const added = dividendsAfterChange({
    trades: log, credited: [marker], dividends: [], previousId: null,
    next: trade({ kind: 'buy', units: 200, tradedAt: on(2026, 2, 1), createdAt: on(2026, 9, 1) }),
  });
  eq('a back-dated pot buy before the ex-date tops it up', [added.deltaCents, added.changes[0].units], [6600, 1200]);

  const backfilled = dividendsAfterChange({
    trades: log, credited: [marker], dividends: [], previousId: null,
    next: trade({ kind: 'buy', units: 200, tradedAt: on(2026, 2, 1), createdAt: on(2026, 9, 1), money: { mode: 'none' } }),
  });
  eq('a back-filled buy added later does not', backfilled, { deltaCents: 0, changes: [] });

  const afterEx = dividendsAfterChange({ trades: log, credited: [marker], dividends: [], previousId: null, next: trade({ kind: 'sell', units: 500, tradedAt: on(2026, 4, 1) }) });
  eq('a sale after the ex-date changes nothing', afterEx.changes, []);

  // Credited under the old rules with a back-filled buy counted: the new rule alone reverses nothing.
  const oldBackfill = { ...b1, money: { mode: 'none' as const }, createdAt: on(2026, 9, 1) };
  const unrelated = dividendsAfterChange({
    trades: [oldBackfill, row], credited: [marker], dividends: [], previousId: null,
    next: trade({ kind: 'buy', units: 100, tradedAt: on(2026, 2, 1) }),
  });
  eq('an unrelated pot buy only adds its own units', [unrelated.deltaCents, unrelated.changes[0].units], [3300, 1100]);

  const legacy = { ...marker, pot: undefined, perUnitPoints: undefined, payDate: undefined };
  eq('a dividend paid into goals before the pot is left alone',
    reconcileDividends({ credited: [legacy], dividends: [march], before: [b1], after: [{ ...b1, units: 900 }] }), { deltaCents: 0, changes: [] });
  eq('an older pot marker reads its amount and dates from its log row',
    reconcileDividends({ credited: [legacy], dividends: [], before: log, after: [{ ...b1, units: 900 }, row] }).deltaCents, -3300);
  eq('or from the announcement',
    reconcileDividends({ credited: [{ ...legacy, pot: true }], dividends: [march], before: [b1], after: [{ ...b1, units: 900 }] }).deltaCents, -3300);
  eq('with neither, nothing is guessed',
    reconcileDividends({ credited: [{ ...legacy, pot: true }], dividends: [], before: [b1], after: [{ ...b1, units: 900 }] }).changes, []);

  const zeroed = { ...marker, units: 0, amountCents: 0 };
  eq('a dividend taken back to nothing grows again when the buy comes back',
    reconcileDividends({ credited: [zeroed], dividends: [], before: [], after: [b1] }).changes.map((c) => [c.units, c.amountCents]), [[1000, 33000]]);
}

// --- 12. same-ex-date slots follow what was paid, not page order
{
  const interim: Dividend = march;
  const special: Dividend & { slot?: number } = { ...march, subject: 'Special Dividend', perUnitPoints: 500 };
  // The interim was paid alone under the plain id; then the special is announced above it.
  const page = [{ ...special }, { ...interim, slot: 1 }];
  const paid: CreditedDividend = { id: marchId, units: 1000, amountCents: 33000 };
  const settled = settleSlots(page, [paid], []);
  eq('the paid interim keeps the plain id', settled.map((d) => [d.subject, slotOf(d)]), [['Special Dividend', 1], ['Second Interim Dividend', 0]]);
  const log = [trade({ kind: 'buy', units: 1000, tradedAt: on(2026, 1, 5) })];
  eq('so only the special falls due', dueDividends(settled, log, [marchId], on(2026, 3, 26)).map((d) => [d.id, d.amountCents]), [[`${marchId}_2`, 5000]]);
  eq('without that, the interim would have been paid twice',
    dueDividends(page, log, [marchId], on(2026, 3, 26)).map((d) => d.dividend.subject), ['Second Interim Dividend']);

  eq('nothing paid, page order stands', settleSlots(page, [], []), page);
  eq('a marker whose amount matches nothing on the page leaves page order',
    settleSlots(page, [{ id: marchId, perUnitPoints: 3500, units: 1000, amountCents: 35000 }], []), page);
  eq('a marker read from its log row matches too',
    settleSlots(page, [{ id: marchId }], [{ ...log[0], id: marchId, kind: 'dividend', perUnitPoints: 3300 }]).map(slotOf), [1, 0]);
  const both = settleSlots(page, [paid, { id: `${marchId}_2`, perUnitPoints: 500 }], []);
  eq('both paid: each keeps its own id', both.map(slotOf), [1, 0]);
  eq('an order that already agrees is returned untouched', settleSlots([interim, { ...special, slot: 1 }], [paid], []).map(slotOf), [0, 1]);
}

report();
