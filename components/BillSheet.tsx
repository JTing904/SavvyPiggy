import React, { useMemo, useState } from 'react';
import type { Bill, BillMode, PiggyBank } from '../types';
import { CATEGORIES, UNCATEGORISED } from '../services/categories';
import { amountToCents, typedFromCents } from '../services/keypad';
import { formatMoney, fromCents, toCents } from '../services/money';
import { describe } from '../services/schedules';
import { WALLET_SOURCE } from '../services/bills';
import { isArchived } from '../services/ledger';
import { useT } from '../contexts/LanguageContext';
import type { NewBill } from '../services/firestore';
import { Sheet } from './ui/Sheet';
import { Segmented } from './ui/Segmented';
import { Chip } from './ui/Chip';
import { Button } from './ui/Button';
import { Field } from './ui/Field';
import { Keypad } from './ui/Keypad';
import { Toggle } from './ui/Toggle';
import { Amount } from './ui/Amount';
import { RepeatFields, type Repeat } from './RepeatFields';

const NAME_MAX = 40;

interface BillSheetProps {
  /** Absent: a new bill. */
  bill?: Bill;
  /** Every goal; the ones put away are not offered unless the bill already comes out of one. */
  banks: PiggyBank[];
  /** Resolves when saved; a refusal rejects and the sheet stays. For an edit only what changed is sent. */
  onSave: (shape: NewBill | Partial<Bill>) => void | Promise<void>;
  onDelete?: () => void;
  onClose: () => void;
}

const Label: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="mb-2 mt-5 px-0.5 text-[12.5px] font-bold text-mute">{children}</p>
);

/** Making a bill, or changing one. Fixed bills record themselves; the others ask. */
const BillSheet: React.FC<BillSheetProps> = ({ bill, banks, onSave, onDelete, onClose }) => {
  const t = useT();
  const b = t.bills;

  const [name, setName] = useState(bill?.name ?? '');
  const [mode, setMode] = useState<BillMode>(bill?.mode ?? 'fixed');
  const [text, setText] = useState(() => typedFromCents(toCents(bill?.amount ?? 0)));
  const [pad, setPad] = useState(!bill);
  const [repeat, setRepeat] = useState<Repeat>({
    frequency: bill?.frequency ?? 'monthly',
    weekday: bill?.weekday ?? 1,
    dayOfMonth: bill?.dayOfMonth ?? 1,
    month: bill?.month ?? 1,
  });
  const [sourceId, setSourceId] = useState(bill?.sourceId ?? WALLET_SOURCE);
  const [category, setCategory] = useState(bill?.category ?? UNCATEGORISED);
  const [enabled, setEnabled] = useState(bill?.enabled ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const goals = useMemo(() => banks.filter((g) => !isArchived(g) || g.id === bill?.sourceId), [banks, bill?.sourceId]);
  const cents = amountToCents(text);
  const missingName = name.trim().length === 0;
  const missingAmount = mode === 'fixed' && cents <= 0;
  const sourceName = sourceId === WALLET_SOURCE ? t.wallet.name : (banks.find((g) => g.id === sourceId)?.name ?? t.profile.deletedGoal);
  const when = describe(repeat);

  const save = async () => {
    if (missingName) return setError(b.needName);
    if (missingAmount) return setError(b.needAmount);
    if (busy) return;
    setBusy(true);
    setError(null);
    const shape = {
      name: name.trim().slice(0, NAME_MAX),
      mode,
      amount: fromCents(cents),
      ...repeat,
      sourceId,
      category,
      enabled,
    };
    try {
      if (!bill) await onSave(shape);
      else {
        // Only what changed is sent: the whole form read as a reschedule every time, and restarted the clock.
        const was: Record<string, unknown> = {
          name: bill.name,
          mode: bill.mode,
          amount: toCents(bill.amount),
          frequency: bill.frequency,
          weekday: bill.weekday,
          dayOfMonth: bill.dayOfMonth,
          month: bill.month,
          sourceId: bill.sourceId,
          category: bill.category,
          enabled: bill.enabled,
        };
        const now: Record<string, unknown> = { ...shape, amount: toCents(shape.amount) };
        const patch = Object.fromEntries(
          Object.keys(now)
            .filter((key) => now[key] !== was[key])
            .map((key) => [key, key === 'amount' ? shape.amount : now[key]])
        ) as Partial<Bill>;
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
      title={bill ? b.sheetEdit : b.sheetNew}
      onClose={onClose}
      height="tall"
      footer={
        <Button loading={busy} onClick={save}>
          {bill ? b.saveChanges : b.save}
        </Button>
      }
    >
      <Field label={b.name} value={name} onChange={setName} placeholder={b.namePlaceholder} maxLength={NAME_MAX} autoComplete="off" />

      <Label>{b.modeLabel}</Label>
      <Segmented<BillMode>
        ariaLabel={b.modeLabel}
        value={mode}
        onChange={setMode}
        options={[
          { value: 'fixed', label: b.modeFixed },
          { value: 'variable', label: b.modeVariable },
        ]}
      />

      <Label>{mode === 'fixed' ? b.amount : b.amountRef}</Label>
      {pad ? (
        <>
          <Keypad value={text} onChange={setText} />
          <Button variant="ghost" onClick={() => setPad(false)} className="mt-2">
            {t.entry.amountDone}
          </Button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setPad(true)}
          className="flex min-h-14 w-full items-center rounded-[18px] bg-field px-4 py-2.5 text-left active:opacity-80"
        >
          {cents > 0 ? <Amount cents={cents} size="md" /> : <span className="text-base font-semibold text-mute">{b.amountNone}</span>}
        </button>
      )}

      <RepeatFields value={repeat} onChange={setRepeat} />

      <Label>{b.sourceLabel}</Label>
      <div role="group" aria-label={b.sourceLabel} className="flex flex-wrap gap-2">
        <Chip selected={sourceId === WALLET_SOURCE} onClick={() => setSourceId(WALLET_SOURCE)}>
          {t.wallet.name}
        </Chip>
        {goals.map((g) => (
          <Chip key={g.id} selected={sourceId === g.id} onClick={() => setSourceId(g.id)}>
            {g.name}
          </Chip>
        ))}
      </div>

      <Label>{b.categoryLabel}</Label>
      <div role="group" aria-label={b.categoryLabel} className="flex flex-wrap gap-2">
        {CATEGORIES.map((c) => (
          <Chip key={c.key} selected={category === c.key} onClick={() => setCategory(c.key)}>
            {c.label}
          </Chip>
        ))}
      </div>

      <div className="mt-5 rounded-3xl bg-card px-4 py-3 text-[13.5px] font-semibold leading-snug">
        <p>
          {mode === 'fixed'
            ? b.summaryFixed(cents > 0 ? `${formatMoney(fromCents(cents))} · ${when}` : when, sourceName)
            : b.summaryVariable(when)}
        </p>
        {!bill && <p className="mt-1 text-[12px] font-medium text-mute">{b.startsNext}</p>}
      </div>

      {bill && (
        <div className="mt-5 flex items-center justify-between rounded-3xl bg-card px-4 py-1">
          <span className="text-[14.5px] font-bold">{b.pause}</span>
          <Toggle checked={!enabled} onChange={(paused) => setEnabled(!paused)} label={b.pause} />
        </div>
      )}

      {bill && onDelete && (
        <>
          <button
            type="button"
            onClick={() => {
              onDelete();
              onClose();
            }}
            className="mt-4 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-card px-6 font-figtree text-[15.5px] font-extrabold text-neg active:opacity-80"
          >
            {b.delete}
          </button>
          <p className="mt-2 px-1 text-center text-[12px] font-medium text-mute">{b.deleteNote}</p>
        </>
      )}

      {error && (
        <p role="alert" className="mt-4 rounded-3xl bg-card px-4 py-3 text-[13px] font-bold text-neg">
          {error}
        </p>
      )}
    </Sheet>
  );
};

export default BillSheet;
