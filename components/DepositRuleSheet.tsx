import React, { useMemo, useState } from 'react';
import type { PiggyBank, Schedule } from '../types';
import { amountToCents, typedFromCents } from '../services/keypad';
import { formatMoney, fromCents, toCents } from '../services/money';
import { describe } from '../services/schedules';
import { isArchived } from '../services/ledger';
import { useT } from '../contexts/LanguageContext';
import { Sheet } from './ui/Sheet';
import { Chip } from './ui/Chip';
import { Button } from './ui/Button';
import { Keypad } from './ui/Keypad';
import { RepeatFields, type Repeat } from './RepeatFields';

type Shape = Pick<Schedule, 'amount' | 'frequency' | 'weekday' | 'dayOfMonth' | 'month' | 'targetBankId'>;

interface DepositRuleSheetProps {
  /** Absent: a new rule. */
  schedule?: Schedule;
  banks: PiggyBank[];
  /** A new rule gets the whole shape; an edit only what changed, so correcting a figure never restarts the clock. */
  onSave: (shape: Shape | Partial<Shape>) => void | Promise<void>;
  onDelete?: () => void;
  onClose: () => void;
}

const Label: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="mb-2 mt-5 px-0.5 text-[12.5px] font-bold text-mute">{children}</p>
);

/** Making or changing a scheduled deposit: money that goes into the goals on a repeating day. */
const DepositRuleSheet: React.FC<DepositRuleSheetProps> = ({ schedule, banks, onSave, onDelete, onClose }) => {
  const t = useT();
  const b = t.bills;
  const [text, setText] = useState(() => typedFromCents(toCents(schedule?.amount ?? 0)));
  const [repeat, setRepeat] = useState<Repeat>({
    frequency: schedule?.frequency ?? 'monthly',
    weekday: schedule?.weekday ?? 1,
    dayOfMonth: schedule?.dayOfMonth ?? 1,
    month: schedule?.month ?? 1,
  });
  /** null follows the income rule. */
  const [target, setTarget] = useState<string | null>(schedule?.targetBankId ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Goals put away are named on rules that still point at them, but take no new rules.
  const goals = useMemo(() => banks.filter((g) => !isArchived(g) || g.id === schedule?.targetBankId), [banks, schedule?.targetBankId]);
  const cents = amountToCents(text);
  const ready = cents > 0 && !busy;

  const save = async () => {
    if (!ready) return;
    setBusy(true);
    setError(null);
    const shape: Shape = { amount: fromCents(cents), ...repeat, targetBankId: target };
    try {
      if (!schedule) await onSave(shape);
      else {
        const was: Shape = {
          amount: schedule.amount,
          frequency: schedule.frequency,
          weekday: schedule.weekday ?? 1,
          dayOfMonth: schedule.dayOfMonth ?? 1,
          month: schedule.month ?? 1,
          targetBankId: schedule.targetBankId,
        };
        const patch = Object.fromEntries(
          (Object.keys(shape) as (keyof Shape)[]).filter((key) => shape[key] !== was[key]).map((key) => [key, shape[key]])
        ) as Partial<Shape>;
        if (Object.keys(patch).length > 0) await onSave(patch);
      }
      onClose();
    } catch (e) {
      setBusy(false);
      setError(e instanceof Error ? e.message : t.ui.toastError);
    }
  };

  return (
    <Sheet
      title={schedule ? b.depositEdit : b.depositNew}
      onClose={onClose}
      height="tall"
      footer={
        <Button disabled={!ready} loading={busy} onClick={save}>
          {schedule ? b.saveChanges : b.save}
        </Button>
      }
    >
      <Keypad value={text} onChange={setText} />
      <RepeatFields value={repeat} onChange={setRepeat} />

      <Label>{b.goesTo}</Label>
      <div role="group" aria-label={b.goesTo} className="flex flex-wrap gap-2">
        <Chip selected={target === null} onClick={() => setTarget(null)}>
          {b.byRule}
        </Chip>
        {goals.map((g) => (
          <Chip key={g.id} selected={target === g.id} onClick={() => setTarget(g.id)}>
            {g.name}
          </Chip>
        ))}
      </div>

      <div className="mt-5 rounded-3xl bg-card px-4 py-3 text-[13.5px] font-semibold">
        {b.depositSummary(formatMoney(fromCents(cents)), describe(repeat))}
      </div>

      {schedule && onDelete && (
        <button
          type="button"
          onClick={() => {
            onDelete();
            onClose();
          }}
          className="mt-4 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-card px-6 font-figtree text-[15.5px] font-extrabold text-neg active:opacity-80"
        >
          {b.depositDelete}
        </button>
      )}

      {error && (
        <p role="alert" className="mt-4 rounded-3xl bg-card px-4 py-3 text-[13px] font-bold text-neg">
          {error}
        </p>
      )}
    </Sheet>
  );
};

export default DepositRuleSheet;
