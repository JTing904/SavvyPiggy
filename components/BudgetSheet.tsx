import React, { useState } from 'react';
import { TOTAL } from '../services/budgets';
import { categoryOf } from '../services/categories';
import { amountToCents, typedFromCents } from '../services/keypad';
import { monthKeyOf, addMonthsTo } from '../services/review';
import { fromCents, formatMoney } from '../services/money';
import { useT } from '../contexts/LanguageContext';
import { Sheet } from './ui/Sheet';
import { Chip } from './ui/Chip';
import { Button } from './ui/Button';
import { Keypad } from './ui/Keypad';

interface BudgetSheetProps {
  /** `TOTAL` or a category key. */
  target: string;
  /** What the limit is this month, in cents; null when there is none. */
  current: number | null;
  /** Today, which decides "this month" and "next month". */
  now: Date;
  /** Resolves once saved; a refusal rejects and the sheet stays. 0 takes the limit away. */
  onSave: (cents: number, from: string) => void | Promise<void>;
  onClose: () => void;
}

/** Setting one monthly limit: how much, and from which month it holds. */
const BudgetSheet: React.FC<BudgetSheetProps> = ({ target, current, now, onSave, onClose }) => {
  const t = useT();
  const v = t.review;
  const [text, setText] = useState(() => typedFromCents(current ?? 0));
  const [next, setNext] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cents = amountToCents(text);
  const thisMonth = now;
  const nextMonth = addMonthsTo(now, 1);
  const from = monthKeyOf(next ? nextMonth : thisMonth);
  const name = target === TOTAL ? v.sheetTotal : categoryOf(target).label;
  const monthName = (d: Date) => t.report.monthsLong[d.getMonth()];

  const run = async (value: number) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSave(value, from);
      onClose();
    } catch (e) {
      setBusy(false);
      setError(e instanceof Error ? e.message : t.ui.toastError);
    }
  };

  return (
    <Sheet
      title={v.sheetTitle}
      onClose={onClose}
      height="tall"
      footer={
        <div className="space-y-2">
          <Button disabled={cents <= 0} loading={busy} onClick={() => run(cents)}>
            {v.sheetSave}
          </Button>
          {current !== null && (
            <button
              type="button"
              disabled={busy}
              onClick={() => run(0)}
              className="inline-flex min-h-12 w-full items-center justify-center rounded-full bg-card px-6 font-figtree text-[15px] font-extrabold text-neg active:opacity-80"
            >
              {v.sheetRemove}
            </button>
          )}
        </div>
      }
    >
      <p className="px-0.5 text-[12.5px] font-bold text-mute">{v.sheetFor}</p>
      <p className="mt-1 px-0.5 text-[20px] font-extrabold">{name}</p>

      <p className="mb-1 mt-5 px-0.5 text-[12.5px] font-bold text-mute">{v.sheetAmount}</p>
      <Keypad value={text} onChange={setText} />

      <p className="mb-2 mt-5 px-0.5 text-[12.5px] font-bold text-mute">{v.sheetFrom}</p>
      <div role="group" aria-label={v.sheetFrom} className="flex flex-wrap gap-2">
        <Chip selected={!next} onClick={() => setNext(false)}>
          {v.fromThis(monthName(thisMonth))}
        </Chip>
        <Chip selected={next} onClick={() => setNext(true)}>
          {v.fromNext(monthName(nextMonth))}
        </Chip>
      </div>

      <div className="mt-5 rounded-3xl bg-card px-4 py-3 text-[13px] font-medium leading-relaxed text-mute">
        <p className="font-extrabold text-ink">
          {name} · {formatMoney(fromCents(cents))}
        </p>
        <p className="mt-1">{v.sheetNote}</p>
        {current !== null && <p className="mt-1">{v.sheetRemoveNote}</p>}
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-3xl bg-card px-4 py-3 text-[13px] font-bold text-neg">
          {error}
        </p>
      )}
    </Sheet>
  );
};

export default BudgetSheet;
