import React, { useState } from 'react';
import type { PiggyBank } from '../types';
import { archiveStrategy, isArchived, isInSplit, type GoalMoneyChoice } from '../services/ledger';
import { formatMoney, fromCents, toCents } from '../services/money';
import { useBackHandler } from '../hooks/useBackHandler';
import { useT } from '../contexts/LanguageContext';
import { ChoiceRow } from './invest/RefundSheet';

/**
 * Asked before deleting a goal that still holds money. Deleting used to take
 * the balance with it; now the money has to go somewhere first — another goal,
 * or split like a deposit — and the app will not pick for the person.
 *
 * An overspent goal can only hand its shortfall to one goal. If there is no
 * other goal at all there is nowhere to put the money, so the sheet says so
 * and points at archiving, which keeps both the goal and its money.
 */
const MoveGoalMoneySheet: React.FC<{
  bank: PiggyBank;
  banks: PiggyBank[];
  onConfirm: (choice: GoalMoneyChoice) => void;
  onArchive: () => void;
  onClose: () => void;
}> = ({ bank, banks, onConfirm, onArchive, onClose }) => {
  const t = useT();
  const w = t.goals.moveMoney;
  useBackHandler(true, onClose);

  const cents = toCents(bank.currentAmount);
  const others = banks.filter((b) => b.id !== bank.id && !isArchived(b));
  // Auto split follows the strategy as it will be once this goal's share is handed on.
  const canSplit = cents > 0 && archiveStrategy(banks, bank.id).some((b) => b.id !== bank.id && isInSplit(b));
  const [choice, setChoice] = useState<GoalMoneyChoice | null>(null);

  const money = (c: number) => formatMoney(fromCents(c));
  const nowhere = others.length === 0;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/85 veil-in" onClick={onClose}>
      <div
        className="w-full max-w-md bg-surface rounded-t-[3rem] sm:rounded-[3rem] sm:mb-6 shadow-2xl sheet-rise p-7 safe-pb max-h-[90%] overflow-y-auto no-scrollbar"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="size-12 rounded-2xl flex items-center justify-center mb-4 bg-red-500/10 text-red-400">
          <span className="material-symbols-rounded text-2xl">delete</span>
        </div>
        <h3 className="text-white text-2xl font-black tracking-tight">{w.title(bank.name, money(Math.abs(cents)))}</h3>
        <p className="text-slate-400 text-sm font-medium mt-3 leading-relaxed">
          {nowhere ? w.nowhere : cents < 0 ? w.bodyOverspent : w.body}
        </p>

        {!nowhere && (
          <div className="mt-5 space-y-2">
            {others.map((b) => (
              <ChoiceRow
                key={b.id}
                icon={b.icon}
                label={b.name}
                value={money(toCents(b.currentAmount))}
                on={choice?.mode === 'goal' && choice.goalId === b.id}
                onClick={() => setChoice({ mode: 'goal', goalId: b.id })}
              />
            ))}
            {canSplit && (
              <ChoiceRow
                icon="call_split"
                tone="split"
                label={t.common.autoSplit}
                sub={w.splitSub}
                on={choice?.mode === 'split'}
                onClick={() => setChoice({ mode: 'split' })}
              />
            )}
          </div>
        )}

        <div className="flex gap-3 mt-6">
          <button
            onClick={nowhere ? onArchive : onClose}
            className="flex-1 h-14 rounded-2xl glass text-slate-300 font-black active:scale-95 transition-transform"
          >
            {nowhere ? w.archiveInstead : t.common.cancel}
          </button>
          {!nowhere && (
            <button
              onClick={() => choice && onConfirm(choice)}
              disabled={!choice}
              className="flex-1 h-14 rounded-2xl bg-red-500 text-white font-black disabled:opacity-30 active:scale-95 transition-transform"
            >
              {w.confirm}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default MoveGoalMoneySheet;
