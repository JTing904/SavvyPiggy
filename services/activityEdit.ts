import type { Activity, Loan, PiggyBank } from '../types';
import { debtExistedOn, checkActivityDate } from './activityDate';
import { CATEGORIES } from './categories';
import { isArchived, outstandingCents, planDeposit } from './ledger';
import { fromCents, resplitDeposit, splitProportionally, toCents } from './money';

/**
 * Correcting a row in History, worked out before anything is written.
 *
 * Like the trade plan, an edit is "undo what the row did, do what it should
 * do now", and the plan is pure so the rules can be tested without a
 * database. All money in a plan is whole cents; the transaction that applies
 * it converts with fromCents and re-reads every row it touches first (see
 * staleCheck).
 */

export interface ActivityEdit {
  amount?: number;
  /** toISOString() */
  date?: string;
  note?: string;
  category?: string;
  /** Deposit and auto-save only; omitted keeps the distributions as they are. */
  target?: { mode: 'split' } | { mode: 'goal'; goalId: string };
  /** Withdraw only: the goal id the money comes out of. */
  source?: string;
}

export type ActivityEditProblem =
  | 'notEditable'
  | 'amountPositive'
  | 'dateFuture'
  | 'dateTooOld'
  | 'goalGone'
  | 'goalArchived'
  | 'staleRow'
  | 'staleDebt'
  | 'loanGone'
  | 'legacyBorrow'
  | 'borrowBelowCovered'
  | 'dateBeforeDebt'
  | 'unknownCategory'
  /** A deposit re-split with no goal in the strategy and no debt to repay would lose its money. */
  | 'noDestination'
  /** An income partly kept in the wallet, or spending from it, cannot be re-split or moved to another source. */
  | 'walletRow';

export interface ActivityEditPlan {
  /** Net change per goal, in cents; goals that end up unchanged are left out. */
  bankDeltas: Record<string, number>;
  /** Net change to what a loan still owes, in cents; unchanged loans are left out. */
  loanDeltas: Record<string, number>;
  /**
   * What each changed loan owes afterwards, in cents. A loan above zero is not
   * settled, so its settledAt is cleared; a borrow's new amount is the plan's
   * patch.amount, which is also the loan's new amount.
   */
  loanOutstanding: Record<string, number>;
  patch: Partial<Activity>;
  /** Editing never moves the investment pot. */
  potDelta: 0;
  /** Net change to the wallet, in cents; only spending from the wallet can change it. */
  walletDelta: number;
}

export type ActivityEditResult =
  | { plan: ActivityEditPlan }
  | { problem: { kind: ActivityEditProblem; cents?: number; goalId?: string } };

export interface ActivityEditInput {
  activity: Activity;
  edit: ActivityEdit;
  banks: PiggyBank[];
  loans: Loan[];
  overflow: boolean;
  /** The retention cutoff: nothing may be moved to a day that would be cleared at once. */
  notBefore: Date;
  now: Date;
}

const EDITABLE = new Set<string>(['manual', 'auto-save', 'withdraw', 'borrow']);

const problem = (kind: ActivityEditProblem, extra: { cents?: number; goalId?: string } = {}) => ({
  problem: { kind, ...extra },
});

const bump = (map: Record<string, number>, id: string, cents: number) => {
  map[id] = (map[id] ?? 0) + cents;
};

const withoutZeros = (map: Record<string, number>) =>
  Object.fromEntries(Object.entries(map).filter(([, cents]) => cents !== 0));

const loanDay = (loan: Loan) => new Date(loan.createdAt).toISOString();

export const planActivityEdit = (i: ActivityEditInput): ActivityEditResult => {
  const { activity, edit, banks, loans, overflow, notBefore, now } = i;
  if (!EDITABLE.has(activity.type)) return problem('notEditable');

  const isDeposit = activity.type === 'manual' || activity.type === 'auto-save';
  const isWithdraw = activity.type === 'withdraw';
  // Anything the row's type cannot carry is refused, not dropped: the person asked for it.
  if ((edit.target && !isDeposit) || (edit.source !== undefined && !isWithdraw) || (edit.category !== undefined && !isWithdraw)) {
    return problem('notEditable');
  }

  const patch: Partial<Activity> = {};
  const bankDeltas: Record<string, number> = {};
  const loanDeltas: Record<string, number> = {};
  const loanOutstanding: Record<string, number> = {};
  let walletDelta = 0;
  const done = (): ActivityEditResult => {
    const changed = withoutZeros(loanDeltas);
    return {
      plan: {
        bankDeltas: withoutZeros(bankDeltas),
        loanDeltas: changed,
        loanOutstanding: Object.fromEntries(Object.keys(changed).map((id) => [id, loanOutstanding[id]])),
        patch,
        potDelta: 0,
        walletDelta,
      },
    };
  };

  const oldCents = toCents(activity.amount);
  const amountGiven = edit.amount !== undefined;
  const newCents = amountGiven ? toCents(edit.amount as number) : oldCents;
  if (amountGiven && !(Number.isFinite(edit.amount) && newCents > 0)) return problem('amountPositive');
  const amountEdit = amountGiven && newCents !== oldCents;

  if (edit.category !== undefined) {
    if (!CATEGORIES.some((c) => c.key === edit.category)) return problem('unknownCategory');
    patch.category = edit.category;
  }
  if (edit.note !== undefined) patch.note = edit.note.trim();

  const at = new Date(edit.date ?? activity.date);
  if (edit.date !== undefined) {
    const bad = checkActivityDate(at, now, notBefore);
    if (bad) return problem(bad === 'future' ? 'dateFuture' : 'dateTooOld');
    patch.date = edit.date;
    // A deposit cannot be moved to before a debt it already paid down.
    for (const r of activity.repayments ?? []) {
      const loan = loans.find((l) => l.id === r.loanId);
      if (loan && !debtExistedOn(loanDay(loan), at)) return problem('dateBeforeDebt');
    }
  }

  const repaid = toCents(activity.repaid ?? 0) > 0 || (activity.repayments?.length ?? 0) > 0;

  const touchesWallet = toCents(activity.wallet ?? 0) !== 0;

  if (isDeposit) {
    const targetGiven = !!edit.target;
    if (!amountEdit && !targetGiven) return done();
    // Part of this income went to (or cleared) the wallet: re-splitting it would need the rule it was
    // made under. Date, note and the like are fine; the amount means deleting it and entering it again.
    if (touchesWallet) return problem('walletRow');

    const gone = activity.distributions.find((d) => !banks.some((b) => b.id === d.bankId));
    if (gone) return problem('goalGone', { goalId: gone.bankId });

    // The common case: same goals, same percentages, a different amount.
    if (!targetGiven && !repaid) {
      const cents = resplitDeposit(newCents, oldCents, activity.distributions);
      patch.amount = fromCents(newCents);
      patch.distributions = activity.distributions.map((d, n) => ({ ...d, amount: fromCents(cents[n]) }));
      activity.distributions.forEach((d, n) => bump(bankDeltas, d.bankId, cents[n] - toCents(d.amount)));
      return done();
    }

    // Anything else is undone in full and done again, as a new deposit would be.
    const target = edit.target?.mode === 'goal' ? edit.target : null;
    if (target) {
      const goal = banks.find((b) => b.id === target.goalId);
      if (!goal) return problem('goalGone', { goalId: target.goalId });
      if (isArchived(goal)) return problem('goalArchived', { goalId: target.goalId });
    }

    const oldByBank: Record<string, number> = {};
    activity.distributions.forEach((d) => bump(oldByBank, d.bankId, toCents(d.amount)));

    // A debt that has since been deleted has nothing to give back.
    const reopened: Record<string, number> = {};
    for (const r of activity.repayments ?? []) {
      if (loans.some((l) => l.id === r.loanId)) bump(reopened, r.loanId, toCents(r.amount));
    }
    // What the goals held and the debts owed just before this deposit happened;
    // overflow and the oldest-first order both depend on it.
    const before = banks.map((b) => ({ ...b, currentAmount: fromCents(toCents(b.currentAmount) - (oldByBank[b.id] ?? 0)) }));
    const open = loans
      .map((l) => ({ ...l, outstanding: fromCents(outstandingCents(l) + (reopened[l.id] ?? 0)) }))
      .filter((l) => debtExistedOn(loanDay(l), at));

    const plan = planDeposit(newCents, before, open, target ? target.goalId : null, overflow);
    if (plan.movements.length === 0 && plan.repayments.length === 0) return problem('noDestination');

    const newByBank: Record<string, number> = {};
    plan.movements.forEach((m) => bump(newByBank, m.bankId, m.cents));
    for (const id of new Set([...Object.keys(oldByBank), ...Object.keys(newByBank)])) {
      bump(bankDeltas, id, (newByBank[id] ?? 0) - (oldByBank[id] ?? 0));
    }

    const paid: Record<string, number> = {};
    plan.repayments.forEach((r) => bump(paid, r.loan.id, r.cents));
    for (const id of new Set([...Object.keys(reopened), ...Object.keys(paid)])) {
      const loan = loans.find((l) => l.id === id) as Loan;
      loanDeltas[id] = (reopened[id] ?? 0) - (paid[id] ?? 0);
      loanOutstanding[id] = outstandingCents(loan) + loanDeltas[id];
    }

    patch.amount = fromCents(newCents);
    patch.distributions = plan.movements.map((m) => ({ bankId: m.bankId, amount: fromCents(m.cents), percentage: m.percentage }));
    patch.repaid = fromCents(plan.repaidCents);
    patch.repayments = plan.repayments.map((r) => ({ loanId: r.loan.id, amount: fromCents(r.cents) }));
    return done();
  }

  // Spending from the wallet: one figure to change, nothing to re-split.
  if (isWithdraw && touchesWallet) {
    if (edit.source !== undefined) return problem('walletRow');
    if (!amountEdit) return done();
    patch.amount = fromCents(newCents);
    patch.wallet = -fromCents(newCents);
    walletDelta = -(newCents - oldCents);
    return done();
  }

  if (isWithdraw) {
    const old = activity.distributions;
    const sameGoal = edit.source !== undefined && old.length === 1 && old[0].bankId === edit.source;
    const sourceEdit = edit.source !== undefined && !sameGoal;
    if (!amountEdit && !sourceEdit) return done();

    const gone = old.find((d) => !banks.some((b) => b.id === d.bankId));
    if (gone) return problem('goalGone', { goalId: gone.bankId });

    let next: { bankId: string; cents: number; percentage: number }[];
    if (sourceEdit) {
      const goal = banks.find((b) => b.id === edit.source);
      if (!goal) return problem('goalGone', { goalId: edit.source });
      // A goal the row already drew on may have been put away since; adjusting it is fine.
      if (isArchived(goal) && !old.some((d) => d.bankId === goal.id)) return problem('goalArchived', { goalId: goal.id });
      next = [{ bankId: goal.id, cents: newCents, percentage: 100 }];
    } else {
      // Spending from several goals (older rows) keeps its proportions.
      const shares = splitProportionally(
        newCents,
        old.map((d, n) => ({ item: n, weight: Math.abs(toCents(d.amount)) }))
      );
      if (shares.length === 0) return problem('notEditable');
      next = shares.map((s) => ({ bankId: old[s.item].bankId, cents: s.cents, percentage: old[s.item].percentage }));
    }

    // No balance check: spending past a goal's balance is allowed by design.
    old.forEach((d) => bump(bankDeltas, d.bankId, -toCents(d.amount)));
    next.forEach((m) => bump(bankDeltas, m.bankId, -m.cents));
    patch.amount = fromCents(newCents);
    patch.distributions = next.map((m) => ({ bankId: m.bankId, amount: -fromCents(m.cents), percentage: m.percentage }));
    return done();
  }

  // Borrow: the row and its debt are one thing, so the debt moves with it.
  if (!amountEdit) return done();
  const loan = loans.find((l) => l.id === activity.loanId);
  if (!loan) return problem('loanGone');
  if (loan.sources.length > 0) return problem('legacyBorrow');

  const covered = toCents(loan.amount) - outstandingCents(loan);
  if (newCents < covered) return problem('borrowBelowCovered', { cents: covered });
  patch.amount = fromCents(newCents);
  loanOutstanding[loan.id] = newCents - covered;
  loanDeltas[loan.id] = newCents - covered - outstandingCents(loan);
  return done();
};

const repaymentsOf = (a: Activity) => JSON.stringify((a.repayments ?? []).map((r) => [r.loanId, toCents(r.amount)]));
const distributionsOf = (a: Activity) =>
  JSON.stringify(a.distributions.map((d) => [d.bankId, toCents(d.amount), d.percentage]));

/**
 * For the transaction: whether the row, or a debt it touches, changed since
 * the copy on screen was read. The plan was made from the copy on screen, so
 * applying it to something else would move the money twice.
 */
export const staleCheck = (
  shown: Activity,
  fresh: Activity,
  loans: Loan[],
  freshLoans: Loan[]
): 'staleRow' | 'staleDebt' | null => {
  if (
    toCents(shown.amount) !== toCents(fresh.amount) ||
    toCents(shown.repaid ?? 0) !== toCents(fresh.repaid ?? 0) ||
    distributionsOf(shown) !== distributionsOf(fresh) ||
    repaymentsOf(shown) !== repaymentsOf(fresh)
  ) {
    return 'staleRow';
  }

  const ids = new Set([...(fresh.repayments ?? []).map((r) => r.loanId), ...(fresh.loanId ? [fresh.loanId] : [])]);
  const state = (list: Loan[], id: string) => {
    const loan = list.find((l) => l.id === id);
    return JSON.stringify(loan ? [outstandingCents(loan), toCents(loan.amount)] : null);
  };
  for (const id of ids) if (state(loans, id) !== state(freshLoans, id)) return 'staleDebt';
  return null;
};
