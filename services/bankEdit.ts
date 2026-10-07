import type { PiggyBank } from '../types';
import { fromCents, toCents } from './money';

/**
 * Editing a goal's name, target and icon.
 *
 * The balance is deliberately not editable here: it is only ever moved by
 * entries in History, so a goal's money always adds up to its ledger.
 */

export interface BankEdit {
  name?: string;
  /** 0 makes the goal open-ended. */
  targetAmount?: number;
  icon?: string;
}

export type GoalEditProblem = 'nameEmpty' | 'nameTooLong' | 'targetInvalid' | 'iconUnknown';

export const GOAL_NAME_MAX = 40;

export type BankPatch = Partial<Pick<PiggyBank, 'name' | 'targetAmount' | 'icon'>>;

export const planBankEdit = (
  bank: PiggyBank,
  edit: BankEdit,
  knownIcons?: ReadonlySet<string>
): { patch: BankPatch; belowBalance: boolean } | { problem: GoalEditProblem } => {
  const patch: BankPatch = {};
  let belowBalance = false;

  if (edit.name !== undefined) {
    const name = edit.name.trim();
    if (name.length === 0) return { problem: 'nameEmpty' };
    // Characters, not UTF-16 units, so a Chinese or emoji name is not cut short.
    if (Array.from(name).length > GOAL_NAME_MAX) return { problem: 'nameTooLong' };
    patch.name = name;
  }

  if (edit.targetAmount !== undefined) {
    if (typeof edit.targetAmount !== 'number' || !Number.isFinite(edit.targetAmount) || edit.targetAmount < 0) {
      return { problem: 'targetInvalid' };
    }
    const target = fromCents(toCents(edit.targetAmount));
    patch.targetAmount = target;
    // Allowed (the goal simply counts as reached), but worth saying so first.
    belowBalance = target > 0 && toCents(target) <= toCents(bank.currentAmount);
  }

  if (edit.icon !== undefined) {
    if (knownIcons && !knownIcons.has(edit.icon)) return { problem: 'iconUnknown' };
    patch.icon = edit.icon;
  }

  return { patch, belowBalance };
};
