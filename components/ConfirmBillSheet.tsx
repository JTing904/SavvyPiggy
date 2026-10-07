import React, { useMemo, useState } from 'react';
import type { Activity, PiggyBank } from '../types';
import type { PendingBill } from '../services/bills';
import { expectedCents, recentAmounts, WALLET_SOURCE } from '../services/bills';
import { amountToCents, typedFromCents } from '../services/keypad';
import { formatMoney, fromCents, toCents } from '../services/money';
import { localDate } from '../services/schedules';
import { dateLocale } from '../i18n';
import { useT } from '../contexts/LanguageContext';
import { Sheet } from './ui/Sheet';
import { Chip } from './ui/Chip';
import { Button } from './ui/Button';
import { Keypad } from './ui/Keypad';
import { Icon } from './ui/Icon';

interface ConfirmBillSheetProps {
  pending: PendingBill;
  banks: PiggyBank[];
  activities: Activity[];
  /** What the wallet holds, in cents. */
  walletCents: number;
  /** Resolves once recorded; a refusal rejects and the sheet stays. */
  onRecord: (amount: number) => void | Promise<void>;
  onSkip: () => void | Promise<void>;
  onClose: () => void;
}

/** A bill that changes each time: the amount is filled in from last time, and nothing moves until it is confirmed. */
const ConfirmBillSheet: React.FC<ConfirmBillSheetProps> = ({ pending, banks, activities, walletCents, onRecord, onSkip, onClose }) => {
  const t = useT();
  const b = t.bills;
  const { bill, day } = pending;

  const recent = useMemo(() => recentAmounts(activities, bill.id, 3), [activities, bill.id]);
  const [text, setText] = useState(() => typedFromCents(expectedCents(bill, activities)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cents = amountToCents(text);
  const money = (c: number) => formatMoney(fromCents(c));
  const when = localDate(day).toLocaleDateString(dateLocale('en-GB'), { day: 'numeric', month: 'short' });
  const fromWallet = bill.sourceId === WALLET_SOURCE;
  const source = fromWallet ? undefined : banks.find((g) => g.id === bill.sourceId);
  const after = fromWallet ? walletCents - cents : source ? toCents(source.currentAmount) - cents : 0;
  const overdrawn = fromWallet && cents > 0 && after < 0;

  const run = async (job: () => void | Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await job();
      onClose();
    } catch (e) {
      setBusy(false);
      setError(e instanceof Error ? e.message : t.ui.toastError);
    }
  };

  return (
    <Sheet
      title={b.confirmTitle(bill.name, when)}
      onClose={onClose}
      height="tall"
      footer={
        <div className="space-y-2">
          <Button variant="danger" disabled={cents <= 0} loading={busy} onClick={() => run(() => onRecord(fromCents(cents)))}>
            {cents > 0 ? b.record(money(cents)) : b.recordPlain}
          </Button>
          <Button variant="ghost" disabled={busy} onClick={() => run(onSkip)}>
            {b.skipThis}
          </Button>
        </div>
      }
    >
      {recent.length > 0 && (
        <>
          <p className="mb-2 px-0.5 text-[12.5px] font-bold text-mute">{b.recent}</p>
          <div role="group" aria-label={b.recent} className="flex flex-wrap gap-2">
            {recent.map((r) => (
              <Chip key={r.date} selected={cents === r.cents} onClick={() => setText(typedFromCents(r.cents))}>
                {b.recentLabel(new Date(r.date).toLocaleDateString(dateLocale('en-GB'), { month: 'short' }), money(r.cents))}
              </Chip>
            ))}
          </div>
        </>
      )}

      <Keypad value={text} onChange={setText} className="mt-1" />

      {cents > 0 && (
        <div className="mt-4 rounded-3xl bg-card px-4 py-3">
          <div className="flex items-center justify-between gap-3 py-0.5">
            <span className="flex items-center gap-1.5 text-[13.5px] font-semibold">
              {fromWallet && <Icon name="wallet" size={15} />}
              {fromWallet ? b.walletAfter : source?.name}
            </span>
            <span className="text-[13.5px] font-extrabold tabular-nums">
              {money(fromWallet ? walletCents : toCents(source?.currentAmount ?? 0))} → {money(after)}
            </span>
          </div>
          {overdrawn && <p className="mt-2 rounded-2xl bg-sun px-3 py-2 text-[12.5px] font-semibold leading-snug">{b.overdrawnBy(money(-after))}</p>}
        </div>
      )}

      {error && (
        <p role="alert" className="mt-4 rounded-3xl bg-card px-4 py-3 text-[13px] font-bold text-neg">
          {error}
        </p>
      )}
    </Sheet>
  );
};

export default ConfirmBillSheet;
