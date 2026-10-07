import { eq, report } from './harness';
import type { Activity, Liability } from '../types';
import { changeSinceLastMonth, largestFirst, needsSnapshot, netWorthOf, trendOf } from '../services/netWorth';
import {
  debtDaysOutsideHistory,
  dueDebtDays,
  interestFor,
  monthlyInterest,
  paidSoFar,
  paymentsFor,
  pendingDebts,
  planPayment,
  planSettlement,
  suggestPayment,
} from '../services/debts';
import { monthFigures } from '../services/review';
import { spendingByCategory } from '../services/analytics';

const NOW = new Date(2026, 9, 29, 12); // 29 Oct 2026

const debt = (id: string, balance: number, over: Partial<Liability> = {}): Liability => ({
  id,
  name: id,
  kind: 'car',
  balance,
  monthly: 850,
  rate: 4.2,
  rateType: 'eir',
  payDay: 28,
  lastRunAt: new Date(2026, 8, 28, 12).toISOString(),
  createdAt: 1,
  ...over,
});

// --- what is known less what is owed
{
  const n = netWorthOf({ walletCents: 31200, goalsCents: 423000, potCents: 25000, holdingsCents: 660000, liabilities: [debt('car', 31400), debt('ptptn', 14200)] });
  eq('wallet and goals', n.savingsCents, 454200);
  eq('the pot and the shares', n.investingCents, 685000);
  eq('debts, as a positive number', n.debtsCents, 4560000);
  eq('the total, which can be negative', n.totalCents, 454200 + 685000 - 4560000);
}
eq('an overdrawn wallet takes off', netWorthOf({ walletCents: -5000, goalsCents: 10000, potCents: 0, holdingsCents: 0, liabilities: [] }).totalCents, 5000);
eq('a debt cannot be negative', netWorthOf({ walletCents: 0, goalsCents: 0, potCents: 0, holdingsCents: 0, liabilities: [debt('x', -50)] }).debtsCents, 0);
eq(
  'largest first, ties by when added',
  largestFirst([debt('a', 10, { createdAt: 1 }), debt('b', 30, { createdAt: 2 }), debt('c', 30, { createdAt: 3 })], (d) => d.balance).map((d) => d.id),
  ['b', 'c', 'a']
);

// --- the trend
{
  const points = [
    { month: '2026-06', cents: 5590000 },
    { month: '2026-09', cents: 6198000 },
  ];
  const t = trendOf(points, NOW, 6309200);
  eq('six months, oldest first', t.map((p) => p.month), ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']);
  eq('months never opened are blank', t.map((p) => p.cents), [null, 5590000, null, null, 6198000, 6309200]);
  eq('change since last month', changeSinceLastMonth(points, NOW, 6309200), 111200);
  eq('no record last month, no change', changeSinceLastMonth([{ month: '2026-06', cents: 1 }], NOW, 5), null);
  eq('a year boundary', trendOf([], new Date(2027, 0, 5), 0, 3).map((p) => p.month), ['2026-11', '2026-12', '2027-01']);
  eq('a snapshot is needed when this month has none', needsSnapshot(points, NOW, 6309200), true);
  eq('not when it already matches', needsSnapshot([{ month: '2026-10', cents: 6 }], NOW, 6), false);
}

// --- interest
eq('a month of interest, rounded down', interestFor(3140000, 4.2), 10990);
eq('a rate with decimals', interestFor(3140000, 4.35), 11382);
eq('no balance, no interest', interestFor(0, 4.2), 0);
eq('no rate, no interest', interestFor(3140000, 0), 0);
eq(
  'on what is left, interest follows the balance',
  [monthlyInterest(debt('a', 31400)), monthlyInterest(debt('a', 25659.9))],
  [10990, 8980]
);
eq(
  'flat: the same whatever is left',
  [
    monthlyInterest(debt('a', 31400, { rateType: 'flat', rate: 3, original: 48000 })),
    monthlyInterest(debt('a', 5000, { rateType: 'flat', rate: 3, original: 48000 })),
  ],
  [12000, 12000]
);
eq('flat with no original amount has no interest', monthlyInterest(debt('a', 31400, { rateType: 'flat', rate: 3, original: null })), 0);

// --- this month's payment, suggested
{
  const p = suggestPayment(debt('a', 31400));
  eq('the usual payment, interest worked out', p, { totalCents: 85000, interestCents: 10990, principalCents: 74010, balanceAfterCents: 3065990 });
  eq('flat splits the same way', suggestPayment(debt('a', 31400, { rateType: 'flat', rate: 3, original: 48000 }))?.interestCents, 12000);
  const last = suggestPayment(debt('a', 500));
  eq('the last payment clears what is left, and the interest on it', last, { totalCents: 50000 + 175, interestCents: 175, principalCents: 50000, balanceAfterCents: 0 });
  eq('interest bigger than the payment is all interest', suggestPayment(debt('a', 100000, { monthly: 100, rate: 12 }))?.principalCents, 0);
  eq('nothing owed, nothing to pay', suggestPayment(debt('a', 0)), null);
  eq('no usual payment, nothing suggested', suggestPayment(debt('a', 100, { monthly: null })), null);
}

// --- a payment, checked
{
  const r = planPayment({ totalCents: 85000, interestCents: 10990, balanceCents: 3140000 });
  eq('the principal is what is left after the interest', 'plan' in r && [r.plan.principalCents, r.plan.balanceAfterCents], [74010, 3065990]);
  eq('nothing paid is refused', planPayment({ totalCents: 0, interestCents: 0, balanceCents: 5 }), { problem: 'amountPositive' });
  eq('interest cannot be more than the payment', planPayment({ totalCents: 5000, interestCents: 6000, balanceCents: 100000 }), { problem: 'interestTooBig' });
  eq('and cannot be negative', planPayment({ totalCents: 5000, interestCents: -1, balanceCents: 100000 }), { problem: 'interestTooBig' });
  eq('the principal cannot pass what is owed', planPayment({ totalCents: 5000, interestCents: 0, balanceCents: 4000 }), { problem: 'overBalance' });
  eq('an extra payment with no interest is all principal', 'plan' in planPayment({ totalCents: 500000, interestCents: 0, balanceCents: 3065990 }), true);
}

// --- paying it all off
eq('the settlement figure clears the debt, the extra is interest', planSettlement({ totalCents: 3100000, balanceCents: 3065990 }), {
  plan: { totalCents: 3100000, interestCents: 34010, principalCents: 3065990, balanceAfterCents: 0 },
});
eq('exactly what is owed has no interest', 'plan' in planSettlement({ totalCents: 5000, balanceCents: 5000 }), true);
eq('less than what is owed is not a settlement', planSettlement({ totalCents: 4000, balanceCents: 5000 }), { problem: 'underBalance' });
eq('nothing is refused', planSettlement({ totalCents: 0, balanceCents: 5000 }), { problem: 'amountPositive' });

// --- when it is asked
{
  const asked = pendingDebts([debt('car', 31400)], NOW, new Date(2026, 7, 1));
  eq('the 28th has come: one waiting', asked.map((p) => [p.debt.id, p.day, p.waiting]), [['car', '2026-10-28', 1]]);
  eq('before the 28th: nothing', pendingDebts([debt('car', 31400)], new Date(2026, 9, 20, 12), new Date(2026, 7, 1)), []);
  eq('answered already: nothing', pendingDebts([debt('car', 31400, { lastRunAt: new Date(2026, 9, 28, 12).toISOString() })], NOW, new Date(2026, 7, 1)), []);
  eq(
    'months missed wait behind each other',
    pendingDebts([debt('car', 31400, { lastRunAt: new Date(2026, 6, 28, 12).toISOString() })], NOW, new Date(2026, 5, 1))[0].waiting,
    3
  );
  eq('a debt with no pay day is never asked', dueDebtDays(debt('car', 31400, { payDay: null }), NOW), []);
  eq('a paid-off debt is never asked', dueDebtDays(debt('car', 0), NOW), []);
  eq('a debt with no usual payment is never asked', dueDebtDays(debt('car', 31400, { monthly: null }), NOW), []);
  eq(
    'days older than the history are only passed over',
    debtDaysOutsideHistory(debt('car', 31400, { lastRunAt: new Date(2026, 5, 28, 12).toISOString() }), NOW, new Date(2026, 8, 1)),
    ['2026-07-28', '2026-08-28']
  );
  eq(
    'the oldest first',
    pendingDebts(
      [debt('b', 1, { payDay: 28 }), debt('a', 1, { payDay: 5, lastRunAt: new Date(2026, 8, 5, 12).toISOString() })],
      NOW,
      new Date(2026, 7, 1)
    ).map((p) => p.debt.id),
    ['a', 'b']
  );
}

// --- payments in the records
const pay = (id: string, date: Date, total: number, interest: number, over: Partial<Activity> = {}): Activity => ({
  id,
  type: 'loanPayment',
  date: date.toISOString(),
  amount: total,
  principal: total - interest,
  interest,
  liabilityId: 'car',
  note: 'car',
  category: 'interest',
  distributions: [],
  wallet: -total,
  ...over,
});
{
  const rows = [pay('a', new Date(2026, 8, 6), 850, 115), pay('b', new Date(2026, 9, 6), 850, 110), pay('c', new Date(2026, 9, 6), 100, 0, { liabilityId: 'other' })];
  eq('payments for one debt, newest first', paymentsFor(rows, 'car').map((a) => a.id), ['b', 'a']);
  eq('what they add up to', paidSoFar(paymentsFor(rows, 'car')), { principalCents: 73500 + 74000, interestCents: 22500 });
}

// --- how a payment shows in the month
{
  const rows = [
    pay('p1', new Date(2026, 9, 6, 12), 850, 110),
    pay('p2', new Date(2026, 9, 7, 9), 200, 20, { wallet: undefined, distributions: [{ bankId: 'g', amount: -200, percentage: 100 }] }),
  ];
  const f = monthFigures(rows, new Date(2026, 9, 1), NOW);
  eq('only the interest is spent', f.spentCents, 13000);
  eq('from the wallet and from a goal', [f.spentFromWalletCents, f.spentFromGoalsCents], [11000, 2000]);
  eq('a payment out of a goal takes the whole payment off what was saved', f.takenOutCents, 20000);
  eq('the principal is not income or saving', [f.incomeCents, f.putInCents], [0, 0]);
  eq(
    'the interest is a category of its own',
    spendingByCategory(rows, { start: new Date(2026, 9, 1), end: new Date(2026, 10, 1) }, NOW).map((c) => [c.key, c.cents]),
    [['interest', 13000]]
  );
  eq('and shows among the biggest spends', f.biggest.map((b) => [b.category, b.cents]), [['interest', 11000], ['interest', 2000]]);
  eq('the wallet change is the whole payment', f.walletChangeCents, -85000);
}

report();
