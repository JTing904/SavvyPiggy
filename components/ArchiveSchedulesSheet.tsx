import React, { useState } from 'react';
import type { PiggyBank } from '../types';
import { archiveStrategy, isArchived, isInSplit } from '../services/ledger';
import { useBackHandler } from '../hooks/useBackHandler';
import { useT } from '../contexts/LanguageContext';
import { ChoiceRow } from './invest/RefundSheet';

/**
 * Asked before archiving a goal that auto deposits save straight into. An
 * archived goal takes no new money, so those rules have to point somewhere
 * else — another goal, or auto split — and, as when deleting, the person picks.
 */
const ArchiveSchedulesSheet: React.FC<{
  bank: PiggyBank;
  banks: PiggyBank[];
  aimed: number;
  /** A goal id, or null for auto split. */
  onConfirm: (target: string | null) => void;
  onClose: () => void;
}> = ({ bank, banks, aimed, onConfirm, onClose }) => {
  const t = useT();
  const w = t.goals.archiveSchedules;
  useBackHandler(true, onClose);

  const others = banks.filter((b) => b.id !== bank.id && !isArchived(b));
  const splitAfter = archiveStrategy(banks, bank.id).some((b) => b.id !== bank.id && isInSplit(b));
  /** undefined until picked; null is auto split. */
  const [target, setTarget] = useState<string | null | undefined>(undefined);

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/85 veil-in" onClick={onClose}>
      <div
        className="w-full max-w-md bg-surface rounded-t-[3rem] sm:rounded-[3rem] sm:mb-6 shadow-2xl sheet-rise p-7 safe-pb max-h-[90%] overflow-y-auto no-scrollbar"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="size-12 rounded-2xl flex items-center justify-center mb-4 bg-white/5 text-slate-300">
          <span className="material-symbols-rounded text-2xl">inventory_2</span>
        </div>
        <h3 className="text-white text-2xl font-black tracking-tight">{w.title(bank.name)}</h3>
        <p className="text-slate-400 text-sm font-medium mt-3 leading-relaxed">{t.goals.moveMoney.schedules(aimed, bank.name)}</p>

        <div className="mt-5 space-y-2">
          {others.map((b) => (
            <ChoiceRow key={b.id} icon={b.icon} label={b.name} on={target === b.id} onClick={() => setTarget(b.id)} />
          ))}
          <ChoiceRow
            icon="call_split"
            tone="split"
            label={t.common.autoSplit}
            sub={splitAfter ? t.goals.moveMoney.scheduleSplitSub : t.goals.moveMoney.scheduleSplitWaiting}
            on={target === null}
            onClick={() => setTarget(null)}
          />
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 h-14 rounded-2xl glass text-slate-300 font-black active:scale-95 transition-transform">
            {t.common.cancel}
          </button>
          <button
            onClick={() => target !== undefined && onConfirm(target)}
            disabled={target === undefined}
            className="flex-1 h-14 rounded-2xl bg-primary text-black font-black disabled:opacity-30 active:scale-95 transition-transform"
          >
            {w.confirm}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ArchiveSchedulesSheet;
