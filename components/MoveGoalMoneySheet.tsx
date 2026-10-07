import { safeGoalIcon } from '../services/goalIcons';
import React, { useState } from 'react';
import type { PiggyBank } from '../types';
import { archiveStrategy, isArchived, isInSplit, type GoalMoneyChoice } from '../services/ledger';
import { formatMoney, fromCents, toCents } from '../services/money';
import { Button } from './ui/Button';
import { Sheet } from './ui/Sheet';
import { useT } from '../contexts/LanguageContext';
import { ChoiceRow } from './invest/RefundSheet';

/**
 * Asked before deleting a goal that still holds money, or that auto deposits
 * save into. Deleting used to take the balance with it and leave those auto
 * deposits aimed at nothing; now both have to go somewhere first — another
 * goal, or split like a deposit — and the app will not pick for the person.
 *
 * An overspent goal can only hand its shortfall to one goal. If there is no
 * other goal at all there is nowhere to put the money, so the sheet says so
 * and points at archiving, which keeps the goal, its money and its auto deposits.
 */
const MoveGoalMoneySheet: React.FC<{
  bank: PiggyBank;
  banks: PiggyBank[];
  /** How many auto deposits save straight into this goal. */
  aimed: number;
  /** `scheduleTarget`: where those auto deposits save from now on — a goal id, or null for auto split. */
  onConfirm: (choice: GoalMoneyChoice | null, scheduleTarget: string | null | undefined) => void;
  onArchive: () => void;
  onClose: () => void;
}> = ({ bank, banks, aimed, onConfirm, onArchive, onClose }) => {
  const t = useT();
  const w = t.goals.moveMoney;
  const cents = toCents(bank.currentAmount);
  const others = banks.filter((b) => b.id !== bank.id && !isArchived(b));
  // Auto split follows the strategy as it will be once this goal's share is handed on.
  const splitAfter = archiveStrategy(banks, bank.id).some((b) => b.id !== bank.id && isInSplit(b));
  const canSplit = cents > 0 && splitAfter;
  const [choice, setChoice] = useState<GoalMoneyChoice | null>(null);
  /** undefined until picked; null is auto split. */
  const [scheduleTarget, setScheduleTarget] = useState<string | null | undefined>(undefined);

  const money = (c: number) => formatMoney(fromCents(c));
  const holdsMoney = cents !== 0;
  const nowhere = holdsMoney && others.length === 0;
  const ready = (!holdsMoney || !!choice) && (aimed === 0 || scheduleTarget !== undefined);

  const heading = (text: string) => <p className="mt-5 px-1 text-[13.5px] font-extrabold leading-snug">{text}</p>;

  return (
    <Sheet
      title={holdsMoney ? w.title(bank.name, money(Math.abs(cents))) : w.titleEmpty(bank.name)}
      z={60}
      onClose={onClose}
      footer={
        <div className="flex gap-3">
          <Button variant="ghost" full={false} className="flex-1" onClick={nowhere ? onArchive : onClose}>
            {nowhere ? w.archiveInstead : t.common.cancel}
          </Button>
          {!nowhere && (
            <Button variant="danger" full={false} className="flex-1" disabled={!ready} onClick={() => ready && onConfirm(holdsMoney ? choice : null, aimed > 0 ? scheduleTarget : undefined)}>
              {holdsMoney ? w.confirm : w.confirmEmpty}
            </Button>
          )}
        </div>
      }
    >
      <p className="px-1 text-[13.5px] font-medium leading-relaxed text-mute">
        {nowhere ? w.nowhere : !holdsMoney ? (others.length > 0 ? t.goals.deleteBody : t.goals.deleteBodyLast) : cents < 0 ? w.bodyOverspent : w.body}
      </p>

      {holdsMoney && !nowhere && (
        <>
          {aimed > 0 && heading(w.moneyHeading)}
          <div className="mt-3 space-y-2">
            {others.map((b) => (
              <ChoiceRow
                key={`money-${b.id}`}
                icon={safeGoalIcon(b.icon)}
                label={b.name}
                value={money(toCents(b.currentAmount))}
                on={choice?.mode === 'goal' && choice.goalId === b.id}
                onClick={() => setChoice({ mode: 'goal', goalId: b.id })}
              />
            ))}
            {canSplit && <ChoiceRow icon="call_split" tone="split" label={t.common.autoSplit} sub={w.splitSub} on={choice?.mode === 'split'} onClick={() => setChoice({ mode: 'split' })} />}
          </div>
        </>
      )}

      {aimed > 0 && !nowhere && (
        <>
          {heading(w.schedules(aimed, bank.name))}
          <div className="mt-3 space-y-2">
            {others.map((b) => (
              <ChoiceRow key={`schedule-${b.id}`} icon={safeGoalIcon(b.icon)} label={b.name} on={scheduleTarget === b.id} onClick={() => setScheduleTarget(b.id)} />
            ))}
            <ChoiceRow
              icon="call_split"
              tone="split"
              label={t.common.autoSplit}
              sub={splitAfter ? w.scheduleSplitSub : w.scheduleSplitWaiting}
              on={scheduleTarget === null}
              onClick={() => setScheduleTarget(null)}
            />
          </div>
        </>
      )}
    </Sheet>
  );
};

export default MoveGoalMoneySheet;
