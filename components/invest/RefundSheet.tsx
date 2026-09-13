import React, { useState } from 'react';
import type { Activity, PiggyBank } from '../../types';
import type { MoneyChoice } from '../../services/tradeMoney';
import { isInSplit } from '../../services/ledger';
import { formatMoney, fromCents, toCents } from '../../services/money';
import { useBackHandler } from '../../hooks/useBackHandler';
import { useT } from '../../contexts/LanguageContext';
import { goneGoalHint } from '../goneGoalHint';

/**
 * One option in a "where does the money go" list: a goal, Auto split, or no
 * goal at all. Shared by the trade sheet and the refund question so the two
 * read as the same choice.
 */
export const ChoiceRow: React.FC<{
  icon: string;
  label: string;
  sub?: string;
  value?: string;
  on: boolean;
  onClick: () => void;
  /** Auto split and "no goal" get their own quieter tint, so they don't read as goals. */
  tone?: 'goal' | 'split' | 'none';
}> = ({ icon, label, sub, value, on, onClick, tone = 'goal' }) => (
  <button
    type="button"
    onClick={onClick}
    className={`w-full flex items-center gap-3 p-3 rounded-2xl border text-left active:scale-[0.98] transition-all ${
      on ? 'bg-accent/10 border-accent/40' : 'bg-white/5 border-white/10'
    }`}
  >
    <span
      className={`size-9 shrink-0 rounded-xl flex items-center justify-center ${
        tone === 'goal' ? 'bg-accent/10 text-accent' : tone === 'split' ? 'bg-primary/10 text-primary' : 'bg-white/5 text-slate-400'
      }`}
    >
      <span className="material-symbols-rounded text-lg">{icon}</span>
    </span>
    <div className="flex-1 min-w-0">
      <p className="text-white text-sm font-black truncate">{label}</p>
      {sub && <p className="text-slate-500 text-[11px] font-bold mt-0.5 leading-snug">{sub}</p>}
    </div>
    {value && <span className="text-slate-300 text-[13px] font-black shrink-0">{value}</span>}
    <span className={`material-symbols-rounded text-xl shrink-0 ${on ? 'text-accent fill-1' : 'text-slate-600'}`}>
      {on ? 'check_circle' : 'radio_button_unchecked'}
    </span>
  </button>
);

interface RefundSheetProps {
  /** What the buy took from the goal that is gone. */
  amountCents: number;
  /** Every goal; only the active ones are offered. */
  banks: PiggyBank[];
  /** "Save changes" or "Delete trade" — whatever was being done when this came up. */
  confirmLabel: string;
  busy: boolean;
  /** The deleted goal the buy was paid from, and History, to say where its money went. */
  goneGoalId?: string;
  activities?: Activity[];
  onChoose: (choice: MoneyChoice) => void;
  onClose: () => void;
}

const key = (choice: MoneyChoice | null) => (!choice ? null : choice.mode === 'goal' ? choice.goalId : choice.mode);

/**
 * Asked when a buy is corrected or deleted and the goal it was paid from has
 * been deleted since. The money has to land somewhere — or, if the person
 * says so, nowhere — and the app will not pick for them.
 */
const RefundSheet: React.FC<RefundSheetProps> = ({ amountCents, banks, confirmLabel, busy, goneGoalId, activities = [], onChoose, onClose }) => {
  const t = useT();
  useBackHandler(true, onClose);

  const goals = banks.filter((b) => !b.archivedAt);
  // Auto split into a strategy nobody takes part in would quietly put nothing
  // back, so it is only offered when some goal would actually receive a share.
  const canSplit = banks.some(isInSplit);
  // Nothing is picked for the person: where money lands is theirs to say.
  const [choice, setChoice] = useState<MoneyChoice | null>(null);
  const hint = goneGoalId ? goneGoalHint(t, goneGoalId, banks, activities) : null;

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
          {t.invest.refundTitle(formatMoney(fromCents(amountCents)))}
        </h3>
        <p className="text-slate-400 text-[13px] font-medium mt-2 leading-relaxed">{t.invest.refundBody}</p>
        {hint && (
          <p className="text-amber-200/90 text-[12px] font-bold mt-3 leading-relaxed rounded-2xl bg-amber-500/10 border border-amber-500/20 px-3.5 py-3">
            {hint}
          </p>
        )}

        <div className="mt-5 space-y-2">
          {goals.map((b) => (
            <ChoiceRow
              key={b.id}
              icon={b.icon}
              label={b.name}
              value={formatMoney(fromCents(toCents(b.currentAmount)))}
              on={key(choice) === b.id}
              onClick={() => setChoice({ mode: 'goal', goalId: b.id })}
            />
          ))}
          {canSplit && (
            <ChoiceRow
              icon="call_split"
              tone="split"
              label={t.common.autoSplit}
              sub={t.invest.refundSplitSub}
              on={choice?.mode === 'split'}
              onClick={() => setChoice({ mode: 'split' })}
            />
          )}
          <ChoiceRow
            icon="block"
            tone="none"
            label={t.invest.refundNone}
            sub={t.invest.refundNoneSub}
            on={choice?.mode === 'none'}
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

export default RefundSheet;
