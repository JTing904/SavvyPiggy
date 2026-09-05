import type { Loan, PiggyBank } from '../types';
import { splitByPercentage, splitProportionally, toCents } from './money';

/** A single goal's movement, in cents. Positive is in, negative is out. */
export interface Movement {
  bankId: string;
  cents: number;
  percentage: number;
}

/** A finished goal the user has put away. It keeps its money and its history. */
export const isArchived = (bank: PiggyBank) => !!bank.archivedAt;

/** Goals created before autoSplit existed have no flag, and default to in. */
export const isInSplit = (bank: PiggyBank) =>
  bank.autoSplit !== false && bank.splitPercentage > 0 && !isArchived(bank);

/** Open-ended goals have no finish line, so they are never full. */
export const isFull = (bank: PiggyBank) =>
  bank.targetAmount > 0 && toCents(bank.currentAmount) >= toCents(bank.targetAmount);

/**
 * The percentages one deposit is actually split by. With overflow on, a goal
 * that has reached its target stops taking a cut and its share is handed to
 * the goals still short of theirs, in proportion to what they already take.
 * A strategy that deliberately adds up to less than 100 stays that way: only
 * the full goals' share moves, never the part the user left unallocated.
 */
export const effectiveSplit = (banks: PiggyBank[], overflow: boolean) => {
  const inSplit = banks.filter(isInSplit);
  const plain = inSplit.map((bank) => ({ item: bank, percentage: bank.splitPercentage }));
  if (!overflow) return plain;

  const open = inSplit.filter((b) => !isFull(b));
  const freed = inSplit.filter(isFull).reduce((sum, b) => sum + b.splitPercentage, 0);
  // Every goal is full: overflow has nowhere to go, so the deposit lands the
  // way the strategy says rather than being refused.
  if (freed === 0 || open.length === 0) return plain;

  const openTotal = open.reduce((sum, b) => sum + b.splitPercentage, 0);
  return open.map((bank) => ({
    item: bank,
    percentage: bank.splitPercentage + (freed * bank.splitPercentage) / openTotal,
  }));
};

/**
 * The strategy after a goal is put away: it stops taking a cut, and the share
 * it used to take is passed to the goals still in the split. Percentages are
 * whole numbers, so the division floors and the odd point left over goes to
 * the biggest share — the same rule the money itself follows.
 */
export const archiveStrategy = (banks: PiggyBank[], id: string): PiggyBank[] => {
  const target = banks.find((b) => b.id === id);
  const freed = target && isInSplit(target) ? target.splitPercentage : 0;
  const shares = splitProportionally(
    freed,
    banks.filter((b) => b.id !== id && isInSplit(b)).map((bank) => ({ item: bank, weight: bank.splitPercentage }))
  );

  return banks.map((bank) => {
    if (bank.id === id) return { ...bank, splitPercentage: 0, autoSplit: false };
    const share = shares.find((s) => s.item.id === bank.id);
    return share ? { ...bank, splitPercentage: bank.splitPercentage + share.cents } : bank;
  });
};

export const outstandingCents = (loan: Loan) => toCents(loan.outstanding);

export const totalDebtCents = (loans: Loan[]) =>
  loans.reduce((sum, l) => sum + outstandingCents(l), 0);

export interface RepaymentStep {
  loan: Loan;
  cents: number;
}

export interface DepositPlan {
  /** Debt cleared first, oldest loan before newest. */
  repayments: RepaymentStep[];
  repaidCents: number;
  /** Whatever survives the debt, fed through the strategy. */
  splitMovements: Movement[];
  /** What actually lands in the goals — repayments leave the app entirely. */
  movements: Movement[];
}

/**
 * Works out where incoming money goes. Borrowed money never came out of the
 * goals, so paying it back does not go into them either — it leaves, and only
 * what survives reaches the strategy split.
 */
export const planDeposit = (
  amountCents: number,
  banks: PiggyBank[],
  loans: Loan[],
  targetBankId: string | null,
  overflow = false
): DepositPlan => {
  // A deposit aimed at one goal is an explicit instruction, so debt is skipped.
  if (targetBankId) {
    const movements = [{ bankId: targetBankId, cents: amountCents, percentage: 100 }];
    return { repayments: [], repaidCents: 0, splitMovements: movements, movements };
  }

  let remaining = amountCents;
  const repayments: RepaymentStep[] = [];

  const open = loans
    .filter((l) => outstandingCents(l) > 0)
    .sort((a, b) => a.createdAt - b.createdAt);

  for (const loan of open) {
    if (remaining <= 0) break;
    const cents = Math.min(outstandingCents(loan), remaining);
    repayments.push({ loan, cents });
    remaining -= cents;
  }

  const splitMovements = splitByPercentage(remaining, effectiveSplit(banks, overflow)).map((share) => ({
    bankId: share.item.id,
    cents: share.cents,
    // The share this deposit actually used, which is what editing it replays.
    percentage: Math.round(share.weight * 100) / 100,
  }));

  return {
    repayments,
    repaidCents: amountCents - remaining,
    splitMovements,
    movements: splitMovements,
  };
};

/**
 * Spending always names the goal it comes out of. Going past the balance is
 * allowed on purpose — the goal simply runs negative until it is topped up.
 */
export const planWithdrawal = (amountCents: number, sourceBankId: string): Movement[] =>
  amountCents > 0 ? [{ bankId: sourceBankId, cents: -amountCents, percentage: 100 }] : [];

/** What a goal holds right now, which a withdrawal is allowed to exceed. */
export const balanceCents = (banks: PiggyBank[], bankId: string | null) =>
  bankId ? toCents(banks.find((b) => b.id === bankId)?.currentAmount ?? 0) : 0;
