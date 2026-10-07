import React, { useMemo, useState } from 'react';
import type { Liability, PiggyBank } from '../types';
import { interestFor, monthlyInterest, planPayment, planSettlement, suggestPayment } from '../services/debts';
import { isArchived } from '../services/ledger';
import { amountToCents, typedFromCents } from '../services/keypad';
import { formatMoney, fromCents, toCents } from '../services/money';
import { WALLET_SOURCE } from '../services/bills';
import { dateLocale } from '../i18n';
import { localDate } from '../services/schedules';
import { useT } from '../contexts/LanguageContext';
import { Sheet } from './ui/Sheet';
import { Tile, type TileTint } from './ui/Tile';
import { Button } from './ui/Button';
import { Icon } from './ui/Icon';
import { AmountInput } from './AmountInput';

export type PaymentMode = 'month' | 'extra' | 'settle';

interface DebtPaymentSheetProps {
  debt: Liability;
  mode: PaymentMode;
  /** The pay day being answered ("2026-10-28"): only for `month`. */
  day?: string;
  banks: PiggyBank[];
  /** What the wallet holds, in cents. */
  walletCents: number;
  /** Resolves once recorded; a refusal rejects and the sheet stays. */
  onRecord: (payment: { totalCents: number; interestCents: number; source: string }) => void | Promise<void>;
  /** `month` only: pass over this pay day without recording. */
  onSkip?: () => void | Promise<void>;
  onClose: () => void;
}

const TINTS: TileTint[] = ['peach', 'lav', 'sun', 'mint'];

/**
 * One payment on a debt. Each month it comes filled in (the usual amount, the
 * interest worked out from the rate) for the person to check against the
 * statement; paying extra starts with no interest, since the monthly payment
 * has paid it; paying it all off takes the bank's settlement figure and calls
 * whatever is more than what is owed interest.
 */
const DebtPaymentSheet: React.FC<DebtPaymentSheetProps> = ({ debt, mode, day, banks, walletCents, onRecord, onSkip, onClose }) => {
  const t = useT();
  const n = t.net;
  const balance = toCents(debt.balance);
  const suggestion = useMemo(() => (mode === 'month' ? suggestPayment(debt) : null), [debt, mode]);

  const [total, setTotal] = useState(() =>
    typedFromCents(mode === 'month' ? (suggestion?.totalCents ?? toCents(debt.monthly ?? 0)) : mode === 'settle' ? balance : 0)
  );
  // The interest as the person has set it; until they do, it follows the amount.
  const [interestText, setInterestText] = useState<string | null>(null);
  const [source, setSource] = useState(WALLET_SOURCE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalCents = amountToCents(total);
  const worked = mode === 'month' ? (suggestion?.interestCents ?? monthlyInterest(debt)) : 0;
  const interestCents =
    mode === 'settle' ? Math.max(0, totalCents - balance) : interestText !== null ? amountToCents(interestText) : Math.min(worked, totalCents);

  const plan =
    mode === 'settle'
      ? planSettlement({ totalCents, balanceCents: balance })
      : planPayment({ totalCents, interestCents, balanceCents: balance });
  const problem = 'problem' in plan ? plan.problem : null;
  const shown = 'plan' in plan ? plan.plan : null;

  const goals = useMemo(() => banks.filter((g) => !isArchived(g)), [banks]);
  const sourceGoal = source === WALLET_SOURCE ? undefined : goals.find((g) => g.id === source);
  const walletAfter = walletCents - totalCents;
  const overdrawn = source === WALLET_SOURCE && totalCents > 0 && walletAfter < 0;
  const money = (cents: number) => formatMoney(fromCents(cents));
  const rateText = debt.rate != null ? `${debt.rate}%` : '';
  const dateText = day ? localDate(day).toLocaleDateString(dateLocale('en-GB'), { day: 'numeric', month: 'short' }) : '';

  const problemText =
    problem === 'interestTooBig'
      ? n.interestTooBig
      : problem === 'overBalance'
        ? n.overBalance(money(balance))
        : problem === 'underBalance'
          ? n.underBalance(money(balance))
          : null;

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

  const title =
    mode === 'month' ? n.monthTitle(debt.name, dateText) : mode === 'extra' ? n.extraTitle(debt.name) : n.settleTitle(debt.name);

  return (
    <Sheet
      title={title}
      onClose={onClose}
      height="tall"
      footer={
        <div className="space-y-2">
          <Button variant="danger" disabled={!shown} loading={busy} onClick={() => shown && run(() => onRecord({ totalCents: shown.totalCents, interestCents: shown.interestCents, source }))}>
            {shown ? n.pay(money(shown.totalCents)) : n.pay('')}
          </Button>
          {mode === 'month' && onSkip && (
            <Button variant="ghost" disabled={busy} onClick={() => run(onSkip)}>
              {n.skip}
            </Button>
          )}
        </div>
      }
    >
      <AmountInput
        label={mode === 'month' ? n.payTotalMonth : mode === 'extra' ? n.payTotalExtra : n.payTotalSettle}
        value={total}
        onChange={setTotal}
        startOpen={mode !== 'month'}
        placeholder={n.payTotal}
      />

      {shown && (
        <div className="mt-4 rounded-3xl bg-card px-4 py-1">
          <div className="flex items-baseline justify-between gap-3 py-2.5 text-[14.5px]">
            <span className="min-w-0 font-semibold">
              {n.payInterest}
              {mode === 'month' && debt.rate != null && interestText === null && (
                <span className="block text-[11.5px] font-medium text-mute">
                  {n.interestFrom(money(debt.rateType === 'flat' ? toCents(debt.original ?? 0) : balance), rateText)}
                </span>
              )}
            </span>
            <b className="shrink-0 tabular-nums">{money(shown.interestCents)}</b>
          </div>
          <div className="flex items-baseline justify-between gap-3 border-t border-line/10 py-2.5 text-[14.5px]">
            <span className="font-semibold">{n.payPrincipal}</span>
            <b className="tabular-nums">{money(shown.principalCents)}</b>
          </div>
          <div className="flex items-baseline justify-between gap-3 border-t border-line/10 py-2.5 text-[14.5px] font-extrabold">
            <span>{n.owedAfter(debt.name)}</span>
            <span className="text-right tabular-nums">
              {money(balance)} → {money(shown.balanceAfterCents)}
            </span>
          </div>
        </div>
      )}

      {mode !== 'settle' && (
        <AmountInput
          className="mt-4"
          label={mode === 'month' ? n.interestEdit : n.payInterest}
          value={interestText ?? typedFromCents(interestCents)}
          onChange={setInterestText}
          placeholder="RM0.00"
          hint={mode === 'extra' ? n.interestExtraNote : undefined}
        />
      )}
      {mode === 'settle' && <p className="mt-3 px-1 text-[12.5px] font-medium leading-relaxed text-mute">{n.settleNote}</p>}
      {mode === 'extra' && shown && debt.rate != null && (
        <p className="mt-2 px-1 text-[12.5px] font-semibold text-mute">
          {n.nextInterest(money(interestFor(debt.rateType === 'flat' ? toCents(debt.original ?? 0) : shown.balanceAfterCents, debt.rate)))}
        </p>
      )}
      {problemText && totalCents > 0 && <p className="mt-3 rounded-3xl bg-card px-4 py-3 text-[13px] font-bold text-neg">{problemText}</p>}

      <p className="mb-2 mt-5 px-0.5 text-[12.5px] font-bold text-mute">{n.payFrom}</p>
      <div className="flex flex-wrap gap-2">
        <div className="w-40 shrink-0">
          <Tile tint="mint" selected={source === WALLET_SOURCE} onClick={() => setSource(WALLET_SOURCE)}>
            <span className="flex items-center gap-1.5 pr-6 text-[14px] font-extrabold">
              <Icon name="wallet" size={16} />
              {t.wallet.name}
            </span>
            <span className="mt-0.5 block text-[12px] font-semibold opacity-70">{money(walletCents)}</span>
          </Tile>
        </div>
        {goals.map((g, i) => (
          <div key={g.id} className="w-40 shrink-0">
            <Tile tint={TINTS[i % TINTS.length]} selected={source === g.id} onClick={() => setSource(g.id)}>
              <span className="block truncate pr-6 text-[14px] font-extrabold">{g.name}</span>
              <span className="mt-0.5 block text-[12px] font-semibold opacity-70">{money(toCents(g.currentAmount))}</span>
            </Tile>
          </div>
        ))}
      </div>
      {overdrawn && <p className="mt-3 rounded-3xl bg-sun px-4 py-3 text-[13px] font-semibold leading-snug text-ink">{n.overdrawnBy(money(-walletAfter))}</p>}
      {sourceGoal && totalCents > toCents(sourceGoal.currentAmount) && (
        <p className="mt-3 px-1 text-[12.5px] font-semibold text-neg">{t.money.overBalance(formatMoney(sourceGoal.currentAmount))}</p>
      )}

      {error && (
        <p role="alert" className="mt-4 rounded-3xl bg-card px-4 py-3 text-[13px] font-bold text-neg">
          {error}
        </p>
      )}
    </Sheet>
  );
};

export default DebtPaymentSheet;
