import { planActivityEdit, staleCheck, type ActivityEdit } from '../services/activityEdit';
import { toCents } from '../services/money';
import type { Activity, Loan, PiggyBank } from '../types';
import { eq, report } from './harness';

const bank = (id: string, pct: number, balance = 0, extra: Partial<PiggyBank> = {}): PiggyBank => ({
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

const loan = (id: string, amount: number, outstanding: number, createdAt: number, extra: Partial<Loan> = {}): Loan => ({
  id,
  amount,
  outstanding,
  note: '',
  sources: [],
  createdAt,
  settledAt: outstanding === 0 ? '2026-09-01T00:00:00.000Z' : null,
  ...extra,
});

const now = new Date(2026, 9, 6, 15, 30);
const notBefore = new Date(2025, 9, 6);
const ON = new Date(2026, 8, 20, 12).toISOString();

const row = (extra: Partial<Activity>): Activity => ({
  id: 'r1',
  type: 'manual',
  date: ON,
  amount: 0,
  distributions: [],
  ...extra,
});

const plan = (activity: Activity, edit: ActivityEdit, banks: PiggyBank[], loans: Loan[] = [], overflow = false) =>
  planActivityEdit({ activity, edit, banks, loans, overflow, notBefore, now });
const planOf = (r: ReturnType<typeof plan>) => ('plan' in r ? r.plan : null);
const kindOf = (r: ReturnType<typeof plan>) => ('problem' in r ? r.problem.kind : null);
const sum = (o: Record<string, number>) => Object.values(o).reduce((s, n) => s + n, 0);
const distCents = (a: Partial<Activity> | undefined) => (a?.distributions ?? []).reduce((s, d) => s + toCents(d.amount), 0);

const THREE = [bank('a', 33), bank('b', 33), bank('c', 34)];

// --- plain deposit: same goals, same percentages
const tiny = row({
  amount: 0.1,
  distributions: [
    { bankId: 'a', amount: 0.03, percentage: 33 },
    { bankId: 'b', amount: 0.03, percentage: 33 },
    { bankId: 'c', amount: 0.04, percentage: 34 },
  ],
});
const big = planOf(plan(tiny, { amount: 1000 }, THREE));
eq(
  'amount-only deposit keeps the stored percentages (RM0.10 at 33/33/34 re-split to RM1000)',
  big?.patch.distributions?.map((d) => toCents(d.amount)),
  [33000, 33000, 34000]
);
eq('amount-only deposit moves each goal by the difference', big?.bankDeltas, { a: 32997, b: 32997, c: 33996 });
const odd = planOf(plan(tiny, { amount: 1.01 }, THREE));
eq('the odd cent goes to the largest share', odd?.patch.distributions?.map((d) => toCents(d.amount)), [33, 33, 35]);
eq('the plan never moves the pot', big?.potDelta, 0);

// --- changing the target
const split100 = row({
  amount: 100,
  distributions: [
    { bankId: 'a', amount: 50, percentage: 50 },
    { bankId: 'b', amount: 50, percentage: 50 },
  ],
});
const toGoal = plan(split100, { target: { mode: 'goal', goalId: 'c' } }, [bank('a', 50, 50), bank('b', 50, 50), bank('c', 0, 0)]);
eq('a split deposit moved to one goal reverses every old share', planOf(toGoal)?.bankDeltas, { a: -5000, b: -5000, c: 10000 });
eq('and writes a single distribution at 100%', planOf(toGoal)?.patch.distributions, [{ bankId: 'c', amount: 100, percentage: 100 }]);

// --- repaid deposits
const L1 = loan('L1', 60, 0, 1000);
const L2 = loan('L2', 50, 0, 2000);
const repaidRow = row({
  amount: 110,
  distributions: [],
  repaid: 110,
  repayments: [
    { loanId: 'L1', amount: 60 },
    { loanId: 'L2', amount: 50 },
  ],
});
const AB = [bank('a', 50), bank('b', 50)];
const lower = planOf(plan(repaidRow, { amount: 70 }, AB, [L1, L2]));
eq('repaid deposit lowered: oldest debt is repaid first, the newer one is reopened', lower?.loanOutstanding, { L2: 4000 });
eq('and only the reopened loan changes', lower?.loanDeltas, { L2: 4000 });
eq('repayments are rewritten oldest first', lower?.patch.repayments, [
  { loanId: 'L1', amount: 60 },
  { loanId: 'L2', amount: 10 },
]);
eq('nothing reaches the goals while debt takes it all', lower?.bankDeltas, {});
const higher = planOf(plan(repaidRow, { amount: 130 }, AB, [L1, L2]));
eq('repaid deposit raised: the surplus is split across the goals', higher?.bankDeltas, { a: 1000, b: 1000 });
eq('and both debts stay settled', higher?.loanDeltas, {});

const goalOnRepaid = planOf(plan(repaidRow, { target: { mode: 'goal', goalId: 'a' } }, AB, [L1, L2]));
eq('a goal target on a repaid deposit reopens every repayment', goalOnRepaid?.loanOutstanding, { L1: 6000, L2: 5000 });
eq('and puts all of it into the goal', goalOnRepaid?.bankDeltas, { a: 11000 });
eq('and clears the repayments', [goalOnRepaid?.patch.repaid, goalOnRepaid?.patch.repayments], [0, []]);
eq('a reopened loan owes money, so its settledAt is to be cleared', (goalOnRepaid?.loanOutstanding.L1 ?? 0) > 0, true);

// A deleted debt has nothing to give back and is skipped.
const skipGone = planOf(plan(repaidRow, { amount: 30 }, AB, [L2]));
eq('a loan that no longer exists is skipped on reversal', skipGone?.loanOutstanding, { L2: 2000 });

// A back-dated deposit does not repay a debt created later.
const early = new Date(2026, 8, 10, 12).toISOString();
const later = loan('L3', 40, 40, new Date(2026, 8, 25, 18).getTime());
const manualSplit = row({ amount: 20, distributions: [{ bankId: 'a', amount: 20, percentage: 100 }] });
const backdated = planOf(plan(manualSplit, { date: early, target: { mode: 'split' } }, AB, [later]));
eq('a back-dated deposit skips a debt created later', backdated?.loanDeltas, {});
const sameDay = planOf(plan(manualSplit, { date: new Date(2026, 8, 25, 12).toISOString(), target: { mode: 'split' } }, AB, [later]));
eq('a deposit on the day of the debt still repays it', sameDay?.loanOutstanding, { L3: 2000 });

// --- invariants over several deposit edits
const scenarios: [string, Activity, ActivityEdit, Loan[]][] = [
  ['amount only', tiny, { amount: 12.34 }, []],
  ['to a goal', split100, { target: { mode: 'goal', goalId: 'c' } }, []],
  ['repaid lowered', repaidRow, { amount: 70 }, [L1, L2]],
  ['repaid raised', repaidRow, { amount: 130 }, [L1, L2]],
];
for (const [name, activity, edit, loans] of scenarios) {
  const banks = [bank('a', 33), bank('b', 33), bank('c', 34)];
  const p = planOf(plan(activity, edit, banks, loans));
  const old = activity.distributions.reduce((s, d) => s + toCents(d.amount), 0);
  eq(`invariant (${name}): goal deltas = new distributions - old`, sum(p?.bankDeltas ?? {}), distCents(p?.patch) - old);

  const after = loans.map((l) => ({ ...l, outstandingCents: p?.loanOutstanding[l.id] ?? toCents(l.outstanding) }));
  const repayments = p?.patch.repayments ?? activity.repayments ?? [];
  eq(
    `invariant (${name}): loan amount - outstanding = what was repaid`,
    after.map((l) => toCents(l.amount) - l.outstandingCents),
    after.map((l) => repayments.filter((r) => r.loanId === l.id).reduce((s, r) => s + toCents(r.amount), 0))
  );
}

// --- refusals
eq(
  'a deposit with a deleted goal is refused',
  plan(tiny, { amount: 5 }, [bank('a', 50), bank('b', 50)]),
  { problem: { kind: 'goalGone', goalId: 'c' } }
);
eq(
  'an archived new target is refused',
  plan(split100, { target: { mode: 'goal', goalId: 'c' } }, [bank('a', 50), bank('b', 50), bank('c', 0, 0, { archivedAt: 5 })]),
  { problem: { kind: 'goalArchived', goalId: 'c' } }
);
eq(
  'a new target that is gone is refused',
  kindOf(plan(split100, { target: { mode: 'goal', goalId: 'zzz' } }, AB)),
  'goalGone'
);
eq(
  'a split with nowhere to go and no debt is refused',
  kindOf(plan(split100, { target: { mode: 'split' } }, [bank('a', 0), bank('b', 0)])),
  'noDestination'
);
eq('an archived goal the row already used is simply adjusted', kindOf(plan(tiny, { amount: 5 }, [bank('a', 33), bank('b', 33), bank('c', 34, 0, { archivedAt: 1 })])), null);

// --- withdraw
const spend = row({ type: 'withdraw', amount: 50, distributions: [{ bankId: 'a', amount: -50, percentage: 100 }], category: 'food' });
const moved = planOf(plan(spend, { source: 'b' }, AB));
eq('a withdraw moved to another goal gives one back and takes from the other', moved?.bankDeltas, { a: 5000, b: -5000 });
eq('and nets to zero overall', sum(moved?.bankDeltas ?? {}), 0);
eq('and writes a negative distribution', moved?.patch.distributions, [{ bankId: 'b', amount: -50, percentage: 100 }]);
const over = plan(spend, { amount: 500 }, [bank('a', 50, 10), bank('b', 50)]);
eq('a withdraw may exceed the balance', planOf(over)?.bankDeltas, { a: -45000 });
eq('a withdraw cannot move to an archived goal', kindOf(plan(spend, { source: 'b' }, [bank('a', 50), bank('b', 50, 0, { archivedAt: 1 })])), 'goalArchived');
eq('the same goal as the source changes nothing', planOf(plan(spend, { source: 'a' }, AB))?.bankDeltas, {});
eq('a withdraw from a deleted goal cannot change its amount', kindOf(plan(spend, { amount: 40 }, [bank('b', 100)])), 'goalGone');
eq('a category must be a known key', kindOf(plan(spend, { category: 'nonsense' }, AB)), 'unknownCategory');
eq('a known category is patched', planOf(plan(spend, { category: 'travel' }, AB))?.patch.category, 'travel');
eq('a category on a deposit is refused', kindOf(plan(tiny, { category: 'food' }, THREE)), 'notEditable');

// --- borrow
const debt = loan('D', 100, 100, 5000);
const borrowRow = row({ type: 'borrow', amount: 100, loanId: 'D' });
const uncovered = planOf(plan(borrowRow, { amount: 150 }, AB, [debt]));
eq('an uncovered borrow rewrites the loan', [uncovered?.patch.amount, uncovered?.loanOutstanding, uncovered?.loanDeltas], [150, { D: 15000 }, { D: 5000 }]);
const partly = loan('D', 100, 40, 5000);
eq('a borrow below what is covered is refused', plan(borrowRow, { amount: 50 }, AB, [partly]), {
  problem: { kind: 'borrowBelowCovered', cents: 6000 },
});
eq('a borrow raised above what is covered keeps outstanding = new - covered', planOf(plan(borrowRow, { amount: 200 }, AB, [partly]))?.loanOutstanding, { D: 14000 });
eq('a borrow lowered to exactly what is covered is settled', planOf(plan(borrowRow, { amount: 60 }, AB, [partly]))?.loanOutstanding, { D: 0 });
eq('a legacy borrow amount is refused', kindOf(plan(borrowRow, { amount: 150 }, AB, [loan('D', 100, 100, 5000, { sources: [{ bankId: 'a', amount: 100 }] })])), 'legacyBorrow');
eq('a borrow whose loan is gone is refused', kindOf(plan(borrowRow, { amount: 150 }, AB, [])), 'loanGone');
eq('a borrow note is only a patch', planOf(plan(borrowRow, { note: ' lunch ' }, AB, [debt])), {
  bankDeltas: {},
  loanDeltas: {},
  loanOutstanding: {},
  patch: { note: 'lunch' },
  potDelta: 0,
  walletDelta: 0,
});

// --- note and date never recompute money
const noMoney = planOf(plan(repaidRow, { note: 'x', date: new Date(2026, 8, 22, 12).toISOString() }, AB, [L1, L2]));
eq('note and date on a repaid deposit produce no deltas', [noMoney?.bankDeltas, noMoney?.loanDeltas], [{}, {}]);
eq('and are patched', [noMoney?.patch.note, noMoney?.patch.date], ['x', new Date(2026, 8, 22, 12).toISOString()]);
eq('an auto-save row may change its note', kindOf(plan({ ...tiny, type: 'auto-save' }, { note: 'x' }, THREE)), null);

// --- dates and amounts
eq('a future date is refused', kindOf(plan(tiny, { date: new Date(2026, 9, 7).toISOString() }, THREE)), 'dateFuture');
eq('a date before the cutoff is refused', kindOf(plan(tiny, { date: new Date(2025, 9, 5).toISOString() }, THREE)), 'dateTooOld');
eq('a repaid row cannot move before the retention cutoff', kindOf(plan(repaidRow, { date: new Date(1970, 0, 1).toISOString() }, AB, [L1, L2])), 'dateTooOld');
const lateLoan = loan('L9', 60, 0, new Date(2026, 8, 21, 9).getTime());
eq(
  'a repaid row cannot move before its debt existed',
  kindOf(plan(row({ amount: 60, repaid: 60, repayments: [{ loanId: 'L9', amount: 60 }] }), { date: new Date(2026, 8, 18, 12).toISOString() }, AB, [lateLoan])),
  'dateBeforeDebt'
);
eq('zero amount is refused', kindOf(plan(tiny, { amount: 0 }, THREE)), 'amountPositive');
eq('NaN amount is refused', kindOf(plan(tiny, { amount: NaN }, THREE)), 'amountPositive');
eq('an unknown type is not editable', kindOf(plan({ ...tiny, type: 'income' as Activity['type'] }, { note: 'x' }, THREE)), 'notEditable');
eq('a trade row is not editable here', kindOf(plan({ ...tiny, type: 'invest' }, { note: 'x' }, THREE)), 'notEditable');

// --- stale detection
const fresh = { ...repaidRow };
eq('an unchanged row and debts are not stale', staleCheck(repaidRow, fresh, [L1, L2], [L1, L2]), null);
eq('different distributions are a stale row', staleCheck(tiny, { ...tiny, distributions: [{ bankId: 'a', amount: 0.1, percentage: 100 }] }, [], []), 'staleRow');
eq('a different repaid figure is a stale row', staleCheck(repaidRow, { ...repaidRow, repaid: 60 }, [L1, L2], [L1, L2]), 'staleRow');
eq('a debt owing something else is stale', staleCheck(repaidRow, fresh, [L1, L2], [L1, loan('L2', 50, 20, 2000)]), 'staleDebt');
eq('a debt deleted since is stale', staleCheck(repaidRow, fresh, [L1, L2], [L1]), 'staleDebt');
eq('a borrow whose loan changed is stale', staleCheck(borrowRow, borrowRow, [debt], [loan('D', 100, 30, 5000)]), 'staleDebt');
eq('a note changed elsewhere is not stale', staleCheck(repaidRow, { ...repaidRow, note: 'y' }, [L1, L2], [L1, L2]), null);

// --- the wallet took part
const keptSome = row({
  type: 'manual',
  amount: 100,
  wallet: 30,
  distributions: [
    { bankId: 'a', amount: 70, percentage: 100 },
  ],
});
eq('income partly kept in the wallet: a new amount is refused', kindOf(plan(keptSome, { amount: 120 }, AB)), 'walletRow');
eq('income partly kept in the wallet: a new target is refused', kindOf(plan(keptSome, { target: { mode: 'split' } }, AB)), 'walletRow');
eq('income partly kept in the wallet: a note still goes through', planOf(plan(keptSome, { note: 'pay' }, AB))?.patch, { note: 'pay' });
eq('and so does a new date', planOf(plan(keptSome, { date: new Date(2026, 8, 18, 12).toISOString() }, AB))?.walletDelta, 0);

const walletSpend = row({ type: 'withdraw', amount: 40, wallet: -40, distributions: [], category: 'food' });
{
  const r = planOf(plan(walletSpend, { amount: 55 }, AB));
  eq('spending from the wallet: a bigger amount takes more from it', r?.walletDelta, -1500);
  eq('and the row says so', [r?.patch.amount, r?.patch.wallet], [55, -55]);
  eq('no goal is touched', r?.bankDeltas, {});
}
{
  const r = planOf(plan(walletSpend, { amount: 25 }, AB));
  eq('a smaller amount gives some back', r?.walletDelta, 1500);
}
eq('spending from the wallet cannot be moved to a goal here', kindOf(plan(walletSpend, { source: 'a' }, AB)), 'walletRow');
eq('its category can change', planOf(plan(walletSpend, { category: 'transport' }, AB))?.patch, { category: 'transport' });
eq('wallet moves are not editable', kindOf(plan(row({ type: 'walletMove', amount: 5, wallet: -5, distributions: [{ bankId: 'a', amount: 5, percentage: 100 }] }), { amount: 6 }, AB)), 'notEditable');


report();
