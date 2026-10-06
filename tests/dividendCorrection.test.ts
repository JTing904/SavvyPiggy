import { planDividendCorrection, planDividendRemoval } from '../services/dividendCorrection';
import { dividendsAfterChange, dividendTradeId, dueDividends, type CreditedDividend } from '../services/dividends';
import { dayStart, tradeCents, tradeTotalCents } from '../services/holdings';
import type { Dividend, Trade } from '../types';
import { eq, report } from './harness';

const on = (year: number, month: number, day: number) => dayStart(new Date(year, month - 1, day).getTime());
const utc = (year: number, month: number, day: number) => Date.UTC(year, month - 1, day);

// Ex 12 Mar 2026, pays 26 Mar 2026, RM0.33 a unit on 1,000 units: RM330.00.
const march: Dividend = {
  symbol: '1155.KL',
  subject: 'Second Interim Dividend',
  exDate: utc(2026, 3, 12),
  payDate: utc(2026, 3, 26),
  perUnitPoints: 3300,
  announcedAt: utc(2026, 2, 27),
};
const marchId = dividendTradeId('1155.KL', march.exDate);

const buy: Trade = {
  id: 'b1', symbol: '1155.KL', name: 'MAYBANK', kind: 'buy', units: 1000, priceCents: 1000,
  tradedAt: on(2026, 1, 5), createdAt: on(2026, 1, 5), money: { mode: 'pot' },
};
const row: Trade = {
  id: marchId, symbol: '1155.KL', name: 'MAYBANK', kind: 'dividend', units: 1000, priceCents: 0,
  perUnitPoints: 3300, exDate: march.exDate, tradedAt: on(2026, 3, 26), createdAt: on(2026, 3, 26), money: { mode: 'pot' },
};
const marker: CreditedDividend = {
  id: marchId, symbol: '1155.KL', exDate: march.exDate, payDate: march.payDate, perUnitPoints: 3300, units: 1000, amountCents: 33000, pot: true,
};

// --- the amount a row is worth

eq('tradeCents derives a dividend from units and rate', tradeCents(row), 33000);
eq('tradeCents prefers amountCents', tradeCents({ ...row, amountCents: 29700 }), 29700);
eq('and so does the total a dividend moved', tradeTotalCents({ ...row, amountCents: 29700 }), 29700);
eq('a buy ignores amountCents', tradeCents({ ...buy, amountCents: 5 }), 1000 * 1000);

// --- correcting

eq('correct down reduces the pot by the delta', planDividendCorrection({ trade: row, marker, newCents: 29700, potCents: 100_000 }), {
  plan: { oldCents: 33000, deltaCents: -3300, potDelta: -3300, trade: { amountCents: 29700 }, marker: { amountCents: 29700, corrected: true } },
});
eq('correct up raises the pot', planDividendCorrection({ trade: row, marker, newCents: 33500, potCents: 0 }), {
  plan: { oldCents: 33000, deltaCents: 500, potDelta: 500, trade: { amountCents: 33500 }, marker: { amountCents: 33500, corrected: true } },
});
eq('correct below what the pot still holds is refused (potShort)', planDividendCorrection({ trade: row, marker, newCents: 29700, potCents: 1000 }), {
  problem: 'potShort', availableCents: 1000, neededCents: 3300,
});
eq('pot holding exactly the difference is allowed', 'plan' in planDividendCorrection({ trade: row, marker, newCents: 29700, potCents: 3300 }), true);
eq('out-of-sync marker refused', planDividendCorrection({ trade: row, marker: { ...marker, amountCents: 20000 }, newCents: 29700, potCents: 100_000 }), {
  problem: 'outOfSync',
});
eq('a marker with no amount is out of sync, not guessed', planDividendCorrection({ trade: row, marker: { ...marker, amountCents: undefined }, newCents: 100, potCents: 1 }), {
  problem: 'outOfSync',
});
eq('zero amount refused', planDividendCorrection({ trade: row, marker, newCents: 0, potCents: 100_000 }), { problem: 'amountPositive' });
eq('a part of a sen refused', planDividendCorrection({ trade: row, marker, newCents: 10.5, potCents: 100_000 }), { problem: 'amountPositive' });
eq('a buy is not a dividend', planDividendCorrection({ trade: buy, marker, newCents: 100, potCents: 1 }), { problem: 'notDividend' });
eq('a dividend that did not go to the pot is refused', planDividendCorrection({ trade: { ...row, money: { mode: 'none' } }, marker, newCents: 100, potCents: 1 }), {
  problem: 'notPot',
});
{
  const again = { ...row, amountCents: 29700 };
  const out = planDividendCorrection({ trade: again, marker: { ...marker, amountCents: 29700, corrected: true }, newCents: 30000, potCents: 0 });
  eq('a second correction starts from the corrected amount', 'plan' in out && [out.plan.oldCents, out.plan.potDelta], [29700, 300]);
}

// --- reconcile and the paid list

{
  const corrected: CreditedDividend = { ...marker, amountCents: 29700, corrected: true, correctedAt: '2026-10-06T00:00:00.000Z' };
  const log = [buy, { ...row, amountCents: 29700 }];
  const fewer = (m: CreditedDividend) =>
    dividendsAfterChange({ trades: log, credited: [m], dividends: [], previousId: buy.id, next: { ...buy, units: 900 } });
  eq('an uncorrected marker follows the units', fewer(marker).deltaCents, -3300);
  eq('corrected marker skipped by reconcile', fewer(corrected), { deltaCents: 0, changes: [] });

  const removed: CreditedDividend = { ...marker, amountCents: 0, removed: true };
  eq('removed marker skipped by reconcile', fewer(removed), { deltaCents: 0, changes: [] });
  const added = dividendsAfterChange({
    trades: log, credited: [removed], dividends: [], previousId: null,
    next: { ...buy, id: 'b2', units: 200, tradedAt: on(2026, 2, 1), createdAt: on(2026, 9, 1) },
  });
  eq('and is not resurrected by a buy that would owe it again', added, { deltaCents: 0, changes: [] });

  const held = [buy];
  eq('dueDividends still treats corrected as paid', dueDividends([march], held, [corrected.id], on(2026, 4, 1)), []);
  eq('and removed as paid', dueDividends([march], held, [removed.id], on(2026, 4, 1)), []);
  eq('while an unpaid one is still due', dueDividends([march], held, [], on(2026, 4, 1)).length, 1);
}

// --- removing

eq('remove reverses the pot and keeps the marker', planDividendRemoval({ trade: row, marker, potCents: 100_000 }), {
  plan: { potDelta: -33000, marker: { removed: true, amountCents: 0 } },
});
eq('remove reverses a corrected amount', planDividendRemoval({ trade: { ...row, amountCents: 29700 }, marker: { ...marker, amountCents: 29700, corrected: true }, potCents: 29700 }), {
  plan: { potDelta: -29700, marker: { removed: true, amountCents: 0 } },
});
eq('remove refused when the pot no longer holds it', planDividendRemoval({ trade: row, marker, potCents: 5000 }), {
  problem: 'potShort', availableCents: 5000, neededCents: 33000,
});
eq('remove refused when out of sync', planDividendRemoval({ trade: row, marker: { ...marker, amountCents: 1 }, potCents: 100_000 }), { problem: 'outOfSync' });
eq('removing twice is refused', planDividendRemoval({ trade: row, marker: { ...marker, removed: true, amountCents: 0 }, potCents: 100_000 }), { problem: 'outOfSync' });

report();
