import type { Activity, Loan, PiggyBank, Trade, TradeMoney } from '../types';
import { tradeTotalCents } from './holdings';
import { goneShareCents, outstandingCents, planDeposit, type GoneShareChoice } from './ledger';
import { fromCents, toCents } from './money';

/**
 * The money side of a trade, worked out before anything is written.
 *
 * A buy can be paid straight out of one goal; a sale can be put back into one
 * goal or split like any deposit. Recording, correcting and deleting a trade
 * all come down to the same two steps — undo what the trade did last time, then
 * do what it should do now — so they share this one plan, and the plan is pure
 * so it can be tested without a database.
 *
 * One trade is only ever one row in History. A correction rewrites that row
 * and moves each goal by the difference; it never adds a "returned" line next
 * to the original, which read as the money arriving twice.
 */

export type MoneyChoice = { mode: 'goal'; goalId: string } | { mode: 'split' } | { mode: 'pot' } | { mode: 'none' };

/**
 * The money stamp a trade will carry for a choice, before the History row's id
 * is known — enough to tell a back-filled buy from a paid one.
 */
export const stampOf = (choice: MoneyChoice): TradeMoney =>
  choice.mode === 'goal'
    ? { mode: 'goal', goalId: choice.goalId, activityId: '' }
    : choice.mode === 'split'
      ? { mode: 'split', activityId: '' }
      : { mode: choice.mode };

export interface TradeSide {
  kind: 'buy' | 'sell';
  /** What moved: a buy's cost with fees, a sale's proceeds after them. */
  totalCents: number;
  choice: MoneyChoice;
  counter: string;
  units: number;
}

export interface TradeMoneyInput {
  /** The trade as it stands, with the History row it wrote. Null when recording a new one. */
  previous: { trade: Trade; activity: Activity | null } | null;
  /** What it should be now. Null when deleting. */
  next: TradeSide | null;
  banks: PiggyBank[];
  loans: Loan[];
  overflow: boolean;
  /**
   * Where money goes back when the goal a buy was paid from no longer exists.
   * Without it, the plan stops and asks.
   */
  refund?: MoneyChoice;
  /**
   * Where a sale's share is taken back from when a goal it went into has been
   * deleted. Without it, the plan stops and asks.
   */
  takeBack?: GoneShareChoice;
  /** The investment pot's balance now, in sen. */
  potCents?: number;
  /**
   * What the change does to dividends already paid into the pot (see
   * reconcileDividends), in sen. Moves the pot with the trade, so it is held
   * to the same never-below-zero rule.
   */
  dividendDeltaCents?: number;
}

export type TradeMoneyProblem =
  | { kind: 'goalGone'; cents: number }
  /** A sale fed a goal that has been deleted since; `cents` is that goal's share. */
  | { kind: 'saleGoalGone'; cents: number }
  /** A split sale whose History row has been cleared, so the split cannot be undone exactly. */
  | { kind: 'rowGone' }
  | { kind: 'insufficient'; goalId: string; availableCents: number; neededCents: number }
  | { kind: 'nothingToSplit' }
  /** A sale worth less than its fees costs money, and that has to come out of a named goal. */
  | { kind: 'saleBelowFees'; cents: number }
  /** The investment pot would go below zero; it never may. */
  | { kind: 'potShort'; availableCents: number; neededCents: number };

export interface ActivityDraft {
  type: 'invest' | 'divest';
  amount: number;
  distributions: Activity['distributions'];
  repaid: number;
  repayments: { loanId: string; amount: number }[];
  counter: string;
  units: number;
}

export interface TradeMoneyPlan {
  /** Change to each goal's balance, in sen. */
  bankDeltas: Record<string, number>;
  /** Change to each debt's outstanding, in sen (positive puts debt back). */
  loanDeltas: Record<string, number>;
  /** Outstanding after the plan, for the debts it touched — to settle or reopen them. */
  loanOutstanding: Record<string, number>;
  /** Change to the investment pot, in sen, dividends adjusted included. */
  potDelta: number;
  /** The part of potDelta that corrects dividends already paid in. */
  dividendCents: number;
  activity:
    | { write: 'none' }
    | { write: 'delete'; id: string }
    | { write: 'create'; draft: ActivityDraft }
    | { write: 'update'; id: string; draft: ActivityDraft }
    /** The row this trade wrote is not loaded (older than the kept window): remove it by id, write a fresh one. */
    | { write: 'replace'; oldId: string; draft: ActivityDraft };
  /** What to store on the trade; `activityId` is filled in by the writer for a new row. */
  money: TradeMoney | null;
}

const add = (map: Record<string, number>, key: string, cents: number) => {
  if (cents === 0) return;
  map[key] = (map[key] ?? 0) + cents;
};

const exists = (banks: PiggyBank[], id: string) => banks.some((b) => b.id === id);

export const planTradeMoney = (input: TradeMoneyInput): { plan: TradeMoneyPlan } | { problem: TradeMoneyProblem } => {
  const { previous, next, banks, loans, overflow } = input;
  const bankDeltas: Record<string, number> = {};
  const loanDeltas: Record<string, number> = {};
  const potCents = input.potCents ?? 0;
  let potDelta = 0;

  // ---- 1. undo what the trade did before
  const before = previous?.trade.money;
  if (previous && before?.mode === 'pot') {
    // The pot is one balance, so a trade that used it is undone from the trade alone.
    const cents = tradeTotalCents(previous.trade);
    potDelta += previous.trade.kind === 'buy' ? cents : -cents;
  } else if (previous && before && before.mode !== 'none') {
    const { trade, activity } = previous;
    if (trade.kind === 'buy') {
      // A buy only ever takes from one goal.
      const paid = activity ? -activity.distributions.reduce((s, d) => s + toCents(d.amount), 0) : null;
      // A History row cleared by the retention setting no longer says what was
      // paid; the trade itself still does.
      const cents = paid ?? tradeTotalCents(trade);
      const goalId = before.mode === 'goal' ? before.goalId : null;
      if (cents > 0) {
        if (goalId && exists(banks, goalId)) {
          add(bankDeltas, goalId, cents);
        } else {
          const refund = input.refund;
          if (!refund) return { problem: { kind: 'goalGone', cents } };
          if (refund.mode === 'goal') add(bankDeltas, refund.goalId, cents);
          else if (refund.mode === 'split') {
            const back = planDeposit(cents, banks, [], null, overflow);
            back.movements.forEach((mv) => add(bankDeltas, mv.bankId, mv.cents));
          }
        }
      }
    } else if (trade.kind === 'sell') {
      if (!activity && before.mode === 'goal') {
        // A sale into one goal put exactly its proceeds there and covered no
        // debt, so it can be undone from the trade alone.
        const cents = tradeTotalCents(trade);
        if (exists(banks, before.goalId)) add(bankDeltas, before.goalId, -cents);
        else {
          const takeBack = input.takeBack;
          if (!takeBack || (takeBack.mode === 'goal' && !exists(banks, takeBack.goalId))) {
            return { problem: { kind: 'saleGoalGone', cents } };
          }
          if (takeBack.mode === 'goal') add(bankDeltas, takeBack.goalId, -cents);
        }
      } else if (!activity) return { problem: { kind: 'rowGone' } };
      else {
        // Every goal the sale fed gives back exactly what it got. A deleted
        // goal's share was handed on when it was deleted, so it is taken back
        // from wherever the person says.
        for (const d of activity.distributions) {
          if (exists(banks, d.bankId)) add(bankDeltas, d.bankId, -toCents(d.amount));
        }
        const gone = goneShareCents(activity.distributions, banks);
        if (gone !== 0) {
          const takeBack = input.takeBack;
          if (!takeBack) return { problem: { kind: 'saleGoalGone', cents: gone } };
          if (takeBack.mode === 'goal') {
            if (!exists(banks, takeBack.goalId)) return { problem: { kind: 'saleGoalGone', cents: gone } };
            add(bankDeltas, takeBack.goalId, -gone);
          }
        }
        for (const r of activity.repayments ?? []) add(loanDeltas, r.loanId, toCents(r.amount));
      }
    }
  }

  // ---- 2. do what it should do now
  let draft: ActivityDraft | null = null;
  let money: TradeMoney | null = null;
  const existingId = previous?.activity?.id ?? null;
  // A trade older than the loaded History still knows the id of its row.
  const staleId =
    !existingId && previous?.trade.money && 'activityId' in previous.trade.money ? previous.trade.money.activityId || null : null;

  if (next) {
    const { choice, totalCents } = next;
    if (choice.mode === 'none') {
      money = { mode: 'none' };
    } else if (choice.mode === 'pot') {
      // Kept as a pot trade even when it comes to nothing: stored as "none", a
      // later correction to a real amount would skip the pot without a word.
      // The investment pot: a buy comes out of it, a sale's proceeds (negative
      // when the fees were bigger) go into it. No savings History row — the
      // savings side never sees it.
      potDelta += next.kind === 'buy' ? -totalCents : totalCents;
      money = { mode: 'pot' };
    } else if (totalCents === 0 || (next.kind === 'buy' && totalCents < 0)) {
      money = { mode: 'none' };
    } else if (next.kind === 'sell' && totalCents < 0) {
      // The fees were bigger than the sale, so it cost money: the shortfall is
      // taken from one goal. Splitting a cost like a deposit would read as
      // saving in reverse, so a goal has to be named.
      if (choice.mode !== 'goal') return { problem: { kind: 'saleBelowFees', cents: -totalCents } };
      add(bankDeltas, choice.goalId, totalCents);
      draft = {
        type: 'divest',
        amount: fromCents(-totalCents),
        distributions: [{ bankId: choice.goalId, amount: fromCents(totalCents), percentage: 100 }],
        repaid: 0,
        repayments: [],
        counter: next.counter,
        units: next.units,
      };
      money = { mode: 'goal', goalId: choice.goalId, activityId: existingId ?? '' };
    } else if (next.kind === 'buy') {
      if (choice.mode !== 'goal') return { problem: { kind: 'nothingToSplit' } };
      const bank = banks.find((b) => b.id === choice.goalId);
      const available = toCents(bank?.currentAmount ?? 0) + (bankDeltas[choice.goalId] ?? 0);
      if (!bank || available < totalCents) {
        return { problem: { kind: 'insufficient', goalId: choice.goalId, availableCents: Math.max(0, available), neededCents: totalCents } };
      }
      add(bankDeltas, choice.goalId, -totalCents);
      draft = {
        type: 'invest',
        amount: fromCents(totalCents),
        distributions: [{ bankId: choice.goalId, amount: fromCents(-totalCents), percentage: 100 }],
        repaid: 0,
        repayments: [],
        counter: next.counter,
        units: next.units,
      };
      money = { mode: 'goal', goalId: choice.goalId, activityId: existingId ?? '' };
    } else {
      // A sale: into one goal, or split — with any debt the undo just put back counted.
      const current = loans.map((l) => ({ ...l, outstanding: fromCents(outstandingCents(l) + (loanDeltas[l.id] ?? 0)) }));
      const plan = planDeposit(totalCents, banks, current, choice.mode === 'goal' ? choice.goalId : null, overflow);
      if (plan.movements.length === 0 && plan.repayments.length === 0) return { problem: { kind: 'nothingToSplit' } };
      plan.movements.forEach((mv) => add(bankDeltas, mv.bankId, mv.cents));
      plan.repayments.forEach((r) => add(loanDeltas, r.loan.id, -r.cents));
      draft = {
        type: 'divest',
        amount: fromCents(totalCents),
        distributions: plan.movements.map((mv) => ({ bankId: mv.bankId, amount: fromCents(mv.cents), percentage: mv.percentage })),
        repaid: fromCents(plan.repaidCents),
        repayments: plan.repayments.map((r) => ({ loanId: r.loan.id, amount: fromCents(r.cents) })),
        counter: next.counter,
        units: next.units,
      };
      money =
        choice.mode === 'goal'
          ? { mode: 'goal', goalId: choice.goalId, activityId: existingId ?? '' }
          : { mode: 'split', activityId: existingId ?? '' };
    }
  }

  const dividendCents = input.dividendDeltaCents ?? 0;
  potDelta += dividendCents;

  // The pot never goes below zero, whatever brought it there: a buy it cannot
  // pay for, a sale whose fees it cannot cover, or undoing a sale already spent.
  if (potDelta < 0 && potCents + potDelta < 0) {
    return { problem: { kind: 'potShort', availableCents: Math.max(0, potCents), neededCents: -potDelta } };
  }

  // An undo and a redo that cancel out touch nothing.
  for (const map of [bankDeltas, loanDeltas]) for (const k of Object.keys(map)) if (map[k] === 0) delete map[k];

  const loanOutstanding: Record<string, number> = {};
  for (const id of Object.keys(loanDeltas)) {
    const loan = loans.find((l) => l.id === id);
    if (loan) loanOutstanding[id] = Math.max(0, outstandingCents(loan) + loanDeltas[id]);
  }

  const activity: TradeMoneyPlan['activity'] = draft
    ? existingId
      ? { write: 'update', id: existingId, draft }
      : staleId
        ? { write: 'replace', oldId: staleId, draft }
        : { write: 'create', draft }
    : existingId || staleId
      ? { write: 'delete', id: (existingId ?? staleId) as string }
      : { write: 'none' };

  return { plan: { bankDeltas, loanDeltas, loanOutstanding, potDelta, dividendCents, activity, money } };
};
