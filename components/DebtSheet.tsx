import React, { useState } from 'react';
import type { Liability, LiabilityKind } from '../types';
import type { NewLiability } from '../services/firestore';
import { amountToCents, typedFromCents } from '../services/keypad';
import { formatMoney, fromCents, toCents } from '../services/money';
import { interestFor } from '../services/debts';
import { useT } from '../contexts/LanguageContext';
import { Sheet } from './ui/Sheet';
import { Segmented } from './ui/Segmented';
import { Chip } from './ui/Chip';
import { Button } from './ui/Button';
import { Field } from './ui/Field';
import { AmountInput } from './AmountInput';

const NAME_MAX = 40;
const KINDS: LiabilityKind[] = ['home', 'car', 'ptptn', 'card', 'other'];
const DAYS = [1, 5, 10, 15, 20, 25, 28, 31];

interface DebtSheetProps {
  /** Absent: a new debt. */
  debt?: Liability;
  /** A new debt gets the whole shape; an edit only what changed, so correcting a figure never restarts the clock. */
  onSave: (shape: NewLiability | Partial<Liability>) => void | Promise<void>;
  onClose: () => void;
}

const Label: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="mb-2 mt-5 px-0.5 text-[12.5px] font-bold text-mute">{children}</p>
);

/** The yearly rate typed as a person writes it ("4.2"), or null for none. */
const parseRate = (text: string): number | null => {
  const n = Number(text.trim().replace(',', '.'));
  return text.trim() !== '' && Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
};

/** Making a debt, or changing its terms. What is still owed is changed from the debt's own page. */
const DebtSheet: React.FC<DebtSheetProps> = ({ debt, onSave, onClose }) => {
  const t = useT();
  const n = t.net;
  const [name, setName] = useState(debt?.name ?? '');
  const [kind, setKind] = useState<LiabilityKind>(debt?.kind ?? 'car');
  const [owed, setOwed] = useState(() => typedFromCents(toCents(debt?.balance ?? 0)));
  const [rateType, setRateType] = useState<'eir' | 'flat'>(debt?.rateType ?? 'eir');
  const [rate, setRate] = useState(debt?.rate != null ? String(debt.rate) : '');
  const [original, setOriginal] = useState(() => typedFromCents(toCents(debt?.original ?? 0)));
  const [monthly, setMonthly] = useState(() => typedFromCents(toCents(debt?.monthly ?? 0)));
  const [payDay, setPayDay] = useState<number | null>(debt?.payDay ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const owedCents = amountToCents(owed);
  const originalCents = amountToCents(original);
  const monthlyCents = amountToCents(monthly);
  const rateValue = parseRate(rate);
  const flat = rateType === 'flat';
  const flatInterest = flat && rateValue !== null && originalCents > 0 ? interestFor(originalCents, rateValue) : 0;

  const save = async () => {
    if (name.trim().length === 0) return setError(n.needName);
    if (!debt && owedCents <= 0) return setError(n.needOwed);
    if (flat && originalCents <= 0) return setError(n.needOriginal);
    if (payDay !== null && monthlyCents <= 0) return setError(n.needMonthly);
    if (busy) return;
    setBusy(true);
    setError(null);
    const shape = {
      name: name.trim().slice(0, NAME_MAX),
      kind,
      monthly: monthlyCents > 0 ? fromCents(monthlyCents) : null,
      rate: rateValue,
      rateType,
      original: flat ? fromCents(originalCents) : null,
      payDay,
    };
    try {
      if (!debt) await onSave({ ...shape, balance: fromCents(owedCents) });
      else {
        // Only what changed is sent: a new pay day restarts the clock, and a correction must not.
        const was: Record<string, unknown> = {
          name: debt.name,
          kind: debt.kind,
          monthly: debt.monthly ?? null,
          rate: debt.rate ?? null,
          rateType: debt.rateType ?? 'eir',
          original: debt.original ?? null,
          payDay: debt.payDay ?? null,
        };
        const patch = Object.fromEntries(Object.entries(shape).filter(([key, value]) => value !== was[key]));
        if (Object.keys(patch).length > 0) await onSave(patch as Partial<Liability>);
      }
      onClose();
    } catch (e) {
      setBusy(false);
      setError(e instanceof Error ? e.message : t.ui.toastError);
    }
  };

  return (
    <Sheet
      title={debt ? n.debtEdit : n.debtNew}
      onClose={onClose}
      height="tall"
      footer={
        <Button loading={busy} onClick={save}>
          {t.common.save}
        </Button>
      }
    >
      <Field label={n.debtName} value={name} onChange={setName} placeholder={n.debtNamePlaceholder} maxLength={NAME_MAX} autoComplete="off" />

      <div role="group" aria-label={n.debtName} className="mt-3 flex flex-wrap gap-2">
        {KINDS.map((k) => (
          <Chip key={k} selected={kind === k} onClick={() => setKind(k)}>
            {n.debtKinds[k]}
          </Chip>
        ))}
      </div>

      {!debt && <AmountInput className="mt-5" label={n.owedNow} value={owed} onChange={setOwed} placeholder={n.owedHint} startOpen hint={n.owedHint} />}

      <Label>{n.rateTypeLabel}</Label>
      <Segmented<'eir' | 'flat'>
        ariaLabel={n.rateTypeLabel}
        value={rateType}
        onChange={setRateType}
        options={[
          { value: 'eir', label: n.rateEir },
          { value: 'flat', label: n.rateFlat },
        ]}
      />

      <Field
        className="mt-3"
        label={flat ? n.rateFlatLabel : n.rate}
        value={rate}
        onChange={setRate}
        inputMode="decimal"
        placeholder="4.2"
        autoComplete="off"
      />
      {flat && <AmountInput className="mt-3" label={n.original} value={original} onChange={setOriginal} placeholder={n.original} />}

      <AmountInput className="mt-5" label={n.monthly} value={monthly} onChange={setMonthly} placeholder={n.monthly} />

      <Label>{n.payDay}</Label>
      <div role="group" aria-label={n.payDay} className="flex flex-wrap gap-2">
        {DAYS.map((d) => (
          <Chip key={d} selected={payDay === d} onClick={() => setPayDay(payDay === d ? null : d)}>
            {d}
          </Chip>
        ))}
      </div>

      <div className="mt-5 rounded-3xl bg-card px-4 py-3 text-[13px] font-medium leading-relaxed text-mute">
        <p>{flat ? n.flatNote(formatMoney(fromCents(flatInterest))) : n.eirNote}</p>
        <p className="mt-1.5">{n.noForecast}</p>
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-3xl bg-card px-4 py-3 text-[13px] font-bold text-neg">
          {error}
        </p>
      )}
    </Sheet>
  );
};

export default DebtSheet;
