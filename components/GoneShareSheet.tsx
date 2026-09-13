import React, { useState } from 'react';
import type { Activity, PiggyBank } from '../types';
import { goneGoalIds, goneShareCents, isArchived, type GoneShareChoice } from '../services/ledger';
import { formatMoney, fromCents, toCents } from '../services/money';
import { useBackHandler } from '../hooks/useBackHandler';
import { useT } from '../contexts/LanguageContext';
import { ChoiceRow } from './invest/RefundSheet';

/**
 * Asked when a record is undone — deleted from History, or a sale corrected or
 * deleted — and part of it went through a goal that has been deleted since.
 *
 * Deleting a goal hands its money on, so that part now sits in another goal
 * and has to be settled there. The person picks the goal; the app only says
 * where the deleted goal's money went, if it has a record of it. Goals deleted
 * before money was handed on took it with them, which is what "none" is for.
 */
const GoneShareSheet: React.FC<{
  distributions: Activity['distributions'];
  /** Every goal, archived ones included — only a goal that is really gone counts as gone. */
  banks: PiggyBank[];
  /** Loaded History, to find the "Moved in" rows written when those goals were deleted. */
  activities: Activity[];
  confirmLabel: string;
  busy?: boolean;
  onChoose: (choice: GoneShareChoice) => void;
  onClose: () => void;
}> = ({ distributions, banks, activities, confirmLabel, busy = false, onChoose, onClose }) => {
  const t = useT();
  const w = t.goals.goneShare;
  useBackHandler(true, onClose);

  const cents = goneShareCents(distributions, banks);
  // Positive: the record put money in, so undoing takes it back out.
  const taking = cents > 0;
  const goals = banks.filter((b) => !isArchived(b));
  const [choice, setChoice] = useState<GoneShareChoice | null>(null);

  const nameOf = (id: string) => banks.find((b) => b.id === id)?.name ?? t.history.deletedGoal;
  const hints = goneGoalIds(distributions, banks).map((id) => {
    const moved = activities.find((a) => a.type === 'transfer' && a.fromGoalId === id);
    if (!moved) return w.noRecord;
    const to = moved.distributions.map((d) => w.quoted(nameOf(d.bankId))).join(w.listJoin);
    return w.movedTo(moved.fromGoal || t.history.deletedGoal, to);
  });

  const on = (c: GoneShareChoice) => !!choice && choice.mode === c.mode && (c.mode === 'none' || (choice.mode === 'goal' && choice.goalId === c.goalId));

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/85 veil-in" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md mx-auto bg-surface sheet-rise rounded-t-[2rem] border-t border-white/10 px-6 pt-4 pb-8 max-h-[90%] overflow-y-auto no-scrollbar safe-pb"
      >
        <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-5" />
        <div className="size-12 rounded-2xl flex items-center justify-center mb-4 bg-white/5 text-slate-300">
          <span className="material-symbols-rounded text-2xl">undo</span>
        </div>
        <h3 className="text-white text-xl font-black tracking-tight">
          {(taking ? w.takeTitle : w.giveTitle)(formatMoney(fromCents(Math.abs(cents))))}
        </h3>
        <p className="text-slate-400 text-[13px] font-medium mt-2 leading-relaxed">{taking ? w.takeBody : w.giveBody}</p>
        {[...new Set(hints)].map((hint) => (
          <p key={hint} className="text-amber-200/90 text-[12px] font-bold mt-3 leading-relaxed rounded-2xl bg-amber-500/10 border border-amber-500/20 px-3.5 py-3">
            {hint}
          </p>
        ))}

        <div className="mt-5 space-y-2">
          {goals.map((b) => (
            <ChoiceRow
              key={b.id}
              icon={b.icon}
              label={b.name}
              value={formatMoney(fromCents(toCents(b.currentAmount)))}
              on={on({ mode: 'goal', goalId: b.id })}
              onClick={() => setChoice({ mode: 'goal', goalId: b.id })}
            />
          ))}
          <ChoiceRow
            icon="block"
            tone="none"
            label={taking ? w.takeNone : w.giveNone}
            sub={taking ? w.takeNoneSub : w.giveNoneSub}
            on={on({ mode: 'none' })}
            onClick={() => setChoice({ mode: 'none' })}
          />
        </div>

        <button
          type="button"
          onClick={() => choice && onChoose(choice)}
          disabled={busy || !choice}
          className="w-full h-14 mt-6 rounded-full bg-primary text-black font-black disabled:opacity-30 active:scale-95 transition-all"
        >
          {confirmLabel}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="w-full h-12 mt-3 rounded-full glass border border-white/10 text-white font-black active:scale-95 transition-transform"
        >
          {t.common.cancel}
        </button>
      </div>
    </div>
  );
};

export default GoneShareSheet;
