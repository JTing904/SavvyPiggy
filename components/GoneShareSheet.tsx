import { safeGoalIcon } from '../services/goalIcons';
import React, { useState } from 'react';
import type { Activity, PiggyBank } from '../types';
import { goneGoalIds, goneShareCents, isArchived, type GoneShareChoice } from '../services/ledger';
import { formatMoney, fromCents, toCents } from '../services/money';
import { Button } from './ui/Button';
import { Sheet } from './ui/Sheet';
import { useT } from '../contexts/LanguageContext';
import { ChoiceRow } from './invest/RefundSheet';
import { goneGoalHint } from './goneGoalHint';

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
  const cents = goneShareCents(distributions, banks);
  // Positive: the record put money in, so undoing takes it back out.
  const taking = cents > 0;
  const goals = banks.filter((b) => !isArchived(b));
  const [choice, setChoice] = useState<GoneShareChoice | null>(null);

  const hints = goneGoalIds(distributions, banks).map((id) => goneGoalHint(t, id, banks, activities));

  const on = (c: GoneShareChoice) => !!choice && choice.mode === c.mode && (c.mode === 'none' || (choice.mode === 'goal' && choice.goalId === c.goalId));

  return (
    <Sheet
      title={(taking ? w.takeTitle : w.giveTitle)(formatMoney(fromCents(Math.abs(cents))))}
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
      <p className="px-1 text-[13.5px] font-medium leading-relaxed text-mute">{taking ? w.takeBody : w.giveBody}</p>
      {[...new Set(hints)].map((hint) => (
        <p key={hint} className="mt-3 rounded-3xl bg-sun px-4 py-3 text-[12.5px] font-semibold leading-relaxed">
          {hint}
        </p>
      ))}

      <div className="mt-4 space-y-2">
        {goals.map((b) => (
          <ChoiceRow
            key={b.id}
            icon={safeGoalIcon(b.icon)}
            label={b.name}
            value={formatMoney(fromCents(toCents(b.currentAmount)))}
            on={on({ mode: 'goal', goalId: b.id })}
            onClick={() => setChoice({ mode: 'goal', goalId: b.id })}
          />
        ))}
        <ChoiceRow icon="block" tone="none" label={taking ? w.takeNone : w.giveNone} sub={taking ? w.takeNoneSub : w.giveNoneSub} on={on({ mode: 'none' })} onClick={() => setChoice({ mode: 'none' })} />
      </div>
    </Sheet>
  );
};

export default GoneShareSheet;
