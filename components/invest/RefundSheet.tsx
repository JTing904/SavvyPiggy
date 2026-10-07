import { safeGoalIcon } from '../../services/goalIcons';
import React, { useState } from 'react';
import type { Activity, PiggyBank } from '../../types';
import type { MoneyChoice } from '../../services/tradeMoney';
import { isInSplit } from '../../services/ledger';
import { formatMoney, fromCents, toCents } from '../../services/money';
import { useT } from '../../contexts/LanguageContext';
import { goneGoalHint } from '../goneGoalHint';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { Sheet } from '../ui/Sheet';

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
    aria-pressed={on}
    className={`flex min-h-14 w-full items-center gap-3 rounded-3xl bg-card p-3 text-left text-ink active:opacity-80 ${on ? 'outline outline-2 outline-ink' : ''}`}
  >
    <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${tone === 'goal' ? 'bg-lav' : tone === 'split' ? 'bg-mint' : 'bg-line/10'}`}>
      <span className="material-symbols-rounded" style={{ fontSize: 20 }}>
        {icon}
      </span>
    </span>
    <span className="min-w-0 flex-1">
      <span className="block truncate text-[15px] font-bold">{label}</span>
      {sub && <span className="block text-[12px] font-medium leading-snug text-mute">{sub}</span>}
    </span>
    {value && <span className="shrink-0 text-[13.5px] font-bold tabular-nums text-mute">{value}</span>}
    <span className={`grid size-6 shrink-0 place-items-center rounded-full ${on ? 'bg-cta text-cta-fg' : 'border-2 border-mute/50'}`}>
      {on && <Icon name="check" size={14} strokeWidth={2.4} />}
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
  const goals = banks.filter((b) => !b.archivedAt);
  // Auto split into a strategy nobody takes part in would quietly put nothing
  // back, so it is only offered when some goal would actually receive a share.
  const canSplit = banks.some(isInSplit);
  // Nothing is picked for the person: where money lands is theirs to say.
  const [choice, setChoice] = useState<MoneyChoice | null>(null);
  const hint = goneGoalId ? goneGoalHint(t, goneGoalId, banks, activities) : null;

  return (
    <Sheet
      title={t.invest.refundTitle(formatMoney(fromCents(amountCents)))}
      z={60}
      onClose={onClose}
      footer={
        <div className="space-y-2">
          <Button disabled={!choice} loading={busy} onClick={() => choice && onChoose(choice)}>
            {confirmLabel}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            {t.common.cancel}
          </Button>
        </div>
      }
    >
      <p className="px-1 text-[13.5px] font-medium leading-relaxed text-mute">{t.invest.refundBody}</p>
      {hint && <p className="mt-3 rounded-3xl bg-sun px-4 py-3 text-[12.5px] font-semibold leading-relaxed">{hint}</p>}

      <div className="mt-4 space-y-2">
        {goals.map((b) => (
          <ChoiceRow
            key={b.id}
            icon={safeGoalIcon(b.icon)}
            label={b.name}
            value={formatMoney(fromCents(toCents(b.currentAmount)))}
            on={key(choice) === b.id}
            onClick={() => setChoice({ mode: 'goal', goalId: b.id })}
          />
        ))}
        {canSplit && <ChoiceRow icon="call_split" tone="split" label={t.common.autoSplit} sub={t.invest.refundSplitSub} on={choice?.mode === 'split'} onClick={() => setChoice({ mode: 'split' })} />}
        <ChoiceRow icon="block" tone="none" label={t.invest.refundNone} sub={t.invest.refundNoneSub} on={choice?.mode === 'none'} onClick={() => setChoice({ mode: 'none' })} />
      </div>
    </Sheet>
  );
};

export default RefundSheet;
