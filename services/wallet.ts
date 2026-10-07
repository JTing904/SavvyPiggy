import type { Loan, PiggyBank, WalletSettings } from '../types';
import { effectiveSplit, isArchived, outstandingCents, planDeposit, type Movement, type RepaymentStep } from './ledger';
import { splitByPercentage, splitProportionally, toCents } from './money';

/**
 * The wallet: money that has arrived but is not in a goal yet.
 *
 * Everything here is pure and in whole cents; the writers in firestore.ts only
 * apply a plan. Income lands in the wallet or in the goals (or both), spending
 * can come out of the wallet, and the wallet may go below zero (an overdraft),
 * which the next income clears before anything else is placed.
 */

export const DEFAULT_WALLET: WalletSettings = { balance: 0, goalsPercent: 100 };

/** Whatever was stored, as a usable setting: the share is a whole number from 0 to 100. */
export const cleanWallet = (raw: Partial<WalletSettings> | undefined | null): WalletSettings => {
  const balance = Number(raw?.balance);
  const percent = Number(raw?.goalsPercent);
  return {
    balance: Number.isFinite(balance) ? balance : 0,
    goalsPercent: Number.isFinite(percent) ? Math.min(100, Math.max(0, Math.round(percent))) : 100,
  };
};

export const walletCents = (wallet: WalletSettings) => toCents(wallet.balance);

/** Where a new income goes. `rule` uses the wallet's share; `split` ignores it and feeds every goal in the split. */
export type IncomeTarget = { mode: 'rule' } | { mode: 'split' } | { mode: 'wallet' } | { mode: 'goal'; goalId: string };

export type IncomeProblem = 'amountPositive' | 'noDestination' | 'goalGone' | 'goalArchived';

export interface IncomePlan {
  /** Old spent-ahead debt cleared first, oldest first. Leaves the app, as it always did. */
  repayments: RepaymentStep[];
  repaidCents: number;
  /** Overdraft cleared out of this income, before it is placed. */
  coveredCents: number;
  /** Everything this income adds to the wallet: the overdraft cleared plus what is kept. */
  walletCents: number;
  /** What lands in the goals. */
  movements: Movement[];
}

export interface IncomeInput {
  amountCents: number;
  banks: PiggyBank[];
  /** Spent-ahead debts from before the wallet existed. */
  loans: Loan[];
  /** What the wallet holds now, in cents; below zero is an overdraft. */
  wallet: number;
  goalsPercent: number;
  target: IncomeTarget;
  overflow: boolean;
}

export const planIncome = (i: IncomeInput): { plan: IncomePlan } | { problem: IncomeProblem } => {
  if (!(i.amountCents > 0)) return { problem: 'amountPositive' };

  // One goal named: an explicit instruction, so neither debt nor overdraft is touched.
  if (i.target.mode === 'goal') {
    const goalId = i.target.goalId;
    const goal = i.banks.find((b) => b.id === goalId);
    if (!goal) return { problem: 'goalGone' };
    if (isArchived(goal)) return { problem: 'goalArchived' };
    const movements = [{ bankId: goal.id, cents: i.amountCents, percentage: 100 }];
    return { plan: { repayments: [], repaidCents: 0, coveredCents: 0, walletCents: 0, movements } };
  }

  let remaining = i.amountCents;
  const repayments: RepaymentStep[] = [];
  const open = i.loans.filter((l) => outstandingCents(l) > 0).sort((a, b) => a.createdAt - b.createdAt);
  for (const loan of open) {
    if (remaining <= 0) break;
    const cents = Math.min(outstandingCents(loan), remaining);
    repayments.push({ loan, cents });
    remaining -= cents;
  }
  const repaidCents = i.amountCents - remaining;

  // An overdraft is owed first, then the rest is placed.
  const covered = i.wallet < 0 ? Math.min(remaining, -i.wallet) : 0;
  remaining -= covered;

  let toGoals = 0;
  let toWallet = 0;
  if (i.target.mode === 'wallet') toWallet = remaining;
  else if (i.target.mode === 'split') toGoals = remaining;
  else {
    const percent = Math.min(100, Math.max(0, Math.round(i.goalsPercent)));
    const shares = splitProportionally(remaining, [
      { item: 'goals' as const, weight: percent },
      { item: 'wallet' as const, weight: 100 - percent },
    ]);
    toGoals = shares.find((s) => s.item === 'goals')?.cents ?? 0;
    toWallet = shares.find((s) => s.item === 'wallet')?.cents ?? 0;
  }

  let movements: Movement[] = [];
  if (toGoals > 0) {
    movements = splitByPercentage(toGoals, effectiveSplit(i.banks, i.overflow)).map((share) => ({
      bankId: share.item.id,
      cents: share.cents,
      percentage: Math.round(share.weight * 100) / 100,
    }));
    const placed = movements.reduce((s, m) => s + m.cents, 0);
    // The rule keeps the wallet whole: what no goal takes (no goal in the split, or shares under
    // 100%) stays in the wallet rather than being lost. An explicit "split" with nowhere to go is
    // refused instead, as a deposit always was.
    if (i.target.mode === 'rule') toWallet += toGoals - placed;
    else if (placed === 0 && repayments.length === 0 && covered === 0) return { problem: 'noDestination' };
    movements = movements.filter((m) => m.cents !== 0);
  }

  if (movements.length === 0 && repayments.length === 0 && covered + toWallet === 0) return { problem: 'noDestination' };
  return { plan: { repayments, repaidCents, coveredCents: covered, walletCents: covered + toWallet, movements } };
};

/** Spending from the wallet: it only has to come out of it, however little it holds. */
export const planWalletSpend = (amountCents: number): { walletCents: number } | { problem: 'amountPositive' } =>
  amountCents > 0 ? { walletCents: -amountCents } : { problem: 'amountPositive' };

export type WalletMoveProblem = 'amountPositive' | 'walletShort' | 'goalShort' | 'goalGone' | 'goalArchived' | 'noDestination';

export type WalletMove =
  | { direction: 'toGoals'; target: { mode: 'split' } | { mode: 'goal'; goalId: string } }
  | { direction: 'toWallet'; goalId: string };

export interface WalletMovePlan {
  /** Signed per goal: positive goes into a goal, negative comes out of one. */
  movements: Movement[];
  /** Signed: negative when the wallet gives money to goals. */
  walletCents: number;
}

/**
 * Moving money between the wallet and the goals by hand. Neither side may be
 * overdrawn by a move: spending is where going short is allowed, not here.
 */
export const planWalletMove = (i: {
  amountCents: number;
  move: WalletMove;
  banks: PiggyBank[];
  /** In cents. */
  wallet: number;
  overflow: boolean;
}): { plan: WalletMovePlan } | { problem: WalletMoveProblem; availableCents?: number } => {
  if (!(i.amountCents > 0)) return { problem: 'amountPositive' };
  const { move } = i;

  if (move.direction === 'toWallet') {
    const goal = i.banks.find((b) => b.id === move.goalId);
    if (!goal) return { problem: 'goalGone' };
    const held = toCents(goal.currentAmount);
    if (held < i.amountCents) return { problem: 'goalShort', availableCents: Math.max(0, held) };
    return {
      plan: { movements: [{ bankId: goal.id, cents: -i.amountCents, percentage: 100 }], walletCents: i.amountCents },
    };
  }

  if (i.wallet < i.amountCents) return { problem: 'walletShort', availableCents: Math.max(0, i.wallet) };
  const { target } = move;
  if (target.mode === 'goal') {
    const goal = i.banks.find((b) => b.id === target.goalId);
    if (!goal) return { problem: 'goalGone' };
    if (isArchived(goal)) return { problem: 'goalArchived' };
    return { plan: { movements: [{ bankId: goal.id, cents: i.amountCents, percentage: 100 }], walletCents: -i.amountCents } };
  }

  const split = planDeposit(i.amountCents, i.banks, [], null, i.overflow).movements.filter((m) => m.cents !== 0);
  const placed = split.reduce((s, m) => s + m.cents, 0);
  // Money that cannot be placed stays in the wallet: refuse rather than lose or park it silently.
  if (split.length === 0 || placed < i.amountCents) return { problem: 'noDestination' };
  return { plan: { movements: split, walletCents: -i.amountCents } };
};
