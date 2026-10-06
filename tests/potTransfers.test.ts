import { DEFAULT_SAVINGS } from '../services/alerts';
import { planPotTransferDelete, planPotTransferEdit } from '../services/potTransfers';
import type { Activity, PiggyBank } from '../types';
import { eq, report } from './harness';

const bank = (id: string, pct: number, balance: number, extra: Partial<PiggyBank> = {}): PiggyBank => ({
  id,
  name: id,
  targetAmount: 0,
  currentAmount: balance,
  splitPercentage: pct,
  icon: 'savings',
  imageUrl: '',
  isLocked: false,
  autoSplit: true,
  createdAt: 0,
  ...extra,
});

const BANKS = [bank('car', 50, 200), bank('trip', 50, 300)];
const SAVINGS = DEFAULT_SAVINGS;
const NOW = new Date(2026, 9, 6, 12);
const NOT_BEFORE = new Date(2026, 3, 1);

const toInvest = (goal: string, amount: number, extra: Partial<Activity> = {}): Activity => ({
  id: 'a1',
  type: 'toInvest',
  date: '2026-09-01T10:00:00.000Z',
  amount,
  distributions: [{ bankId: goal, amount: -amount, percentage: 100 }],
  ...extra,
});

const fromInvest = (amount: number, distributions: Activity['distributions'], extra: Partial<Activity> = {}): Activity => ({
  id: 'a2',
  type: 'fromInvest',
  date: '2026-09-01T10:00:00.000Z',
  amount,
  distributions,
  ...extra,
});

const del = (activity: Activity, potCents: number, extra: Partial<Parameters<typeof planPotTransferDelete>[0]> = {}) =>
  planPotTransferDelete({ activity, banks: BANKS, potCents, savings: SAVINGS, ...extra });

const edit = (
  activity: Activity,
  change: Parameters<typeof planPotTransferEdit>[0]['edit'],
  potCents: number,
  banks: PiggyBank[] = BANKS
) => planPotTransferEdit({ activity, edit: change, banks, potCents, notBefore: NOT_BEFORE, now: NOW, savings: SAVINGS });

// --- deleting a toInvest row

eq('delete toInvest returns goal and drains pot', del(toInvest('car', 50), 8000), {
  plan: { bankDeltas: { car: 5000 }, potDelta: -5000 },
});
eq('delete toInvest refused when the pot is spent (potShort with amounts)', del(toInvest('car', 50), 3000), {
  problem: 'potShort',
  availableCents: 3000,
  neededCents: 5000,
});
eq('delete toInvest to a deleted goal needs a choice', del(toInvest('gone', 50), 8000), { problem: 'needsChoice' });
eq('delete toInvest to a deleted goal with a goal choice', del(toInvest('gone', 50), 8000, { returnTo: { mode: 'goal', goalId: 'trip' } }), {
  plan: { bankDeltas: { trip: 5000 }, potDelta: -5000 },
});
eq('delete toInvest to a deleted goal with a split choice places every sen', del(toInvest('gone', 0.01), 8000, { returnTo: { mode: 'split' } }), {
  plan: { bankDeltas: { car: 1 }, potDelta: -1 },
});
eq(
  'delete toInvest to an archived goal ok',
  del(toInvest('old', 50), 8000, { banks: [...BANKS, bank('old', 0, 10, { archivedAt: 1, autoSplit: false })] }),
  { plan: { bankDeltas: { old: 5000 }, potDelta: -5000 } }
);
eq('pot exactly zero allowed (delete drains it to zero)', del(toInvest('car', 50), 5000), {
  plan: { bankDeltas: { car: 5000 }, potDelta: -5000 },
});

// --- deleting a fromInvest row

const SPLIT = [
  { bankId: 'car', amount: 25, percentage: 50 },
  { bankId: 'trip', amount: 25, percentage: 50 },
];
eq('delete fromInvest fills the pot', del(fromInvest(50, SPLIT), 0), {
  plan: { bankDeltas: { car: -2500, trip: -2500 }, potDelta: 5000 },
});
eq('delete fromInvest refused when a goal is short', del(fromInvest(50, SPLIT), 0, { banks: [bank('car', 50, 10), bank('trip', 50, 300)] }), {
  problem: 'goalShort',
  goalId: 'car',
  availableCents: 1000,
  neededCents: 2500,
});
eq('delete fromInvest with a deleted goal needs a choice', del(fromInvest(50, [{ bankId: 'gone', amount: 50, percentage: 100 }]), 0), {
  problem: 'needsChoice',
});
eq(
  'delete fromInvest takes a deleted goal share from the goal chosen',
  del(fromInvest(50, [{ bankId: 'gone', amount: 50, percentage: 100 }]), 0, { returnTo: { mode: 'goal', goalId: 'trip' } }),
  { plan: { bankDeltas: { trip: -5000 }, potDelta: 5000 } }
);

// --- editing the amount

eq('edit toInvest amount up nets goal and pot', edit(toInvest('car', 50), { amount: 80 }, 1000), {
  plan: {
    bankDeltas: { car: -3000 },
    potDelta: 3000,
    activity: { amount: 80, distributions: [{ bankId: 'car', amount: -80, percentage: 100 }] },
  },
});
eq('edit toInvest amount down nets goal and pot', edit(toInvest('car', 50), { amount: 20 }, 4000), {
  plan: {
    bankDeltas: { car: 3000 },
    potDelta: -3000,
    activity: { amount: 20, distributions: [{ bankId: 'car', amount: -20, percentage: 100 }] },
  },
});
eq('edit toInvest down refused when the pot lacks the difference', edit(toInvest('car', 50), { amount: 20 }, 2000), {
  problem: 'potShort',
  availableCents: 2000,
  neededCents: 3000,
});
eq('edit toInvest up refused when the goal lacks the difference', edit(toInvest('car', 50), { amount: 300 }, 0), {
  problem: 'goalShort',
  goalId: 'car',
  availableCents: 20000,
  neededCents: 25000,
});
eq('edit toInvest down to pot exactly zero is allowed', edit(toInvest('car', 50), { amount: 20 }, 3000).hasOwnProperty('plan'), true);

{
  const out = edit(fromInvest(50, SPLIT), { amount: 0.1 }, 0);
  const plan = 'plan' in out ? out.plan : null;
  eq('edit fromInvest keeps the cents total', plan && Object.values(plan.bankDeltas).reduce((a, b) => a + b, 0), plan && -plan.potDelta);
  eq('edit fromInvest down gives the pot the difference', plan?.potDelta, 4990);
  const up = edit(fromInvest(0.03, [{ bankId: 'car', amount: 0.01, percentage: 33 }, { bankId: 'trip', amount: 0.02, percentage: 67 }]), { amount: 1000 }, 100_000);
  const upPlan = 'plan' in up ? up.plan : null;
  eq('edit fromInvest re-splits by the stored percentages', upPlan?.bankDeltas, { car: 32999, trip: 66998 });
  eq('edit fromInvest up takes the whole difference from the pot', upPlan?.potDelta, -99_997);
}
eq('edit fromInvest up refused when the pot lacks the difference', edit(fromInvest(50, SPLIT), { amount: 80 }, 2000), {
  problem: 'potShort',
  availableCents: 2000,
  neededCents: 3000,
});
eq(
  'edit fromInvest down refused when a goal would go below zero',
  edit(fromInvest(50, SPLIT), { amount: 10 }, 0, [bank('car', 50, 5), bank('trip', 50, 300)]),
  { problem: 'goalShort', goalId: 'car', availableCents: 500, neededCents: 2000 }
);
eq('edit amount to zero refused', edit(toInvest('car', 50), { amount: 0 }, 9999), { problem: 'amountPositive' });

// --- editing the date

eq('date-only edit has no deltas', edit(toInvest('car', 50), { date: '2026-09-15' }, 0), {
  plan: { bankDeltas: {}, potDelta: 0, activity: { date: '2026-09-15' } },
});
eq('future date refused', edit(toInvest('car', 50), { date: '2026-10-07' }, 0), { problem: 'dateFuture' });
eq("today's date is allowed", edit(toInvest('car', 50), { date: '2026-10-06' }, 0).hasOwnProperty('plan'), true);
eq('a date before the kept window is refused', edit(toInvest('car', 50), { date: '2026-03-31' }, 0), { problem: 'dateTooOld' });

// --- what is not a pot row

eq('transfer row refused', del({ ...toInvest('car', 50), type: 'transfer' }, 9999), { problem: 'notPotRow' });
eq('transfer row edit refused', edit({ ...toInvest('car', 50), type: 'transfer' }, { amount: 10 }, 9999), { problem: 'notPotRow' });
eq('a manual deposit is not a pot row', del({ ...toInvest('car', 50), type: 'manual' }, 9999), { problem: 'notPotRow' });

report();
