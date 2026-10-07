import React, { useMemo, useState } from 'react';
import type { Activity, Liability, PiggyBank } from '../types';
import type { NewLiability } from '../services/firestore';
import { largestFirst, type NetWorthParts, type TrendPoint } from '../services/netWorth';
import { paidSoFar, paymentsFor } from '../services/debts';
import { amountToCents, typedFromCents } from '../services/keypad';
import { formatMoney, fromCents, toCents } from '../services/money';
import { useT } from '../contexts/LanguageContext';
import { dateLocale } from '../i18n';
import { Amount } from './ui/Amount';
import { Button } from './ui/Button';
import { Group } from './ui/Group';
import { Icon } from './ui/Icon';
import { Row } from './ui/Row';
import { Sheet } from './ui/Sheet';
import { AmountInput } from './AmountInput';
import DebtSheet from './DebtSheet';
import DebtPaymentSheet, { type PaymentMode } from './DebtPaymentSheet';

interface NetWorthPageProps {
  parts: NetWorthParts;
  trend: TrendPoint[];
  /** Today less last month, in cents; null when last month has no record. */
  change: number | null;
  liabilities: Liability[];
  activities: Activity[];
  banks: PiggyBank[];
  walletCents: number;
  onBack: () => void;
  onCreateDebt: (debt: NewLiability) => void | Promise<void>;
  onUpdateDebt: (id: string, patch: Partial<Liability>) => void | Promise<void>;
  onDeleteDebt: (id: string) => void;
  onSetBalance: (id: string, balance: number) => void | Promise<void>;
  onPay: (debt: Liability, payment: { totalCents: number; interestCents: number; source: string }) => void | Promise<void>;
  onOpenEntry: (id: string) => void;
}

type Open =
  | { kind: 'new' }
  | { kind: 'edit'; id: string }
  | { kind: 'detail'; id: string }
  | { kind: 'pay'; id: string; mode: PaymentMode }
  | { kind: 'correct'; id: string }
  | null;

/** The six months as one line; a month the app was not opened is a gap, not a zero. */
const TrendLine: React.FC<{ points: TrendPoint[]; label: string }> = ({ points, label }) => {
  const values = points.map((p) => p.cents).filter((c): c is number => c !== null);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const x = (i: number) => 10 + (i * 280) / Math.max(1, points.length - 1);
  const y = (c: number) => (max === min ? 48 : 84 - ((c - min) / (max - min)) * 72);
  const runs: { x: number; y: number }[][] = [];
  points.forEach((p, i) => {
    if (p.cents === null) return runs.push([]);
    if (runs.length === 0) runs.push([]);
    runs[runs.length - 1].push({ x: x(i), y: y(p.cents) });
  });
  const last = points.length - 1;
  // The line is stretched to the width; the dots are plain boxes so they stay round.
  return (
    <div role="img" aria-label={label} className="relative h-24 w-full">
      <svg viewBox="0 0 300 96" className="absolute inset-0 block size-full" preserveAspectRatio="none" aria-hidden="true">
        {runs
          .filter((run) => run.length > 1)
          .map((run, i) => (
            <polyline
              key={i}
              points={run.map((p) => `${p.x},${p.y}`).join(' ')}
              fill="none"
              stroke="rgb(var(--ink))"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          ))}
      </svg>
      {points.map((p, i) =>
        p.cents === null ? null : (
          <span
            key={p.month}
            className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink"
            style={{ left: `${(x(i) / 300) * 100}%`, top: `${(y(p.cents) / 96) * 100}%`, width: i === last ? 11 : 7, height: i === last ? 11 : 7 }}
          />
        )
      )}
    </div>
  );
};

/** Net worth: what is known, less what is owed; and the debts, each worked out and confirmed month by month. */
const NetWorthPage: React.FC<NetWorthPageProps> = ({
  parts,
  trend,
  change,
  liabilities,
  activities,
  banks,
  walletCents,
  onBack,
  onCreateDebt,
  onUpdateDebt,
  onDeleteDebt,
  onSetBalance,
  onPay,
  onOpenEntry,
}) => {
  const t = useT();
  const n = t.net;
  const [open, setOpen] = useState<Open>(null);
  const money = (cents: number) => formatMoney(fromCents(cents));
  const sorted = useMemo(() => largestFirst(liabilities, (d) => toCents(d.balance)), [liabilities]);
  const find = (id: string) => liabilities.find((d) => d.id === id);
  const monthName = (month: string) => t.report.monthsShort[Number(month.slice(5, 7)) - 1];

  const debtSub = (d: Liability) => {
    const rate = d.rate != null ? n.rateShort(d.rate, d.rateType === 'flat') : '';
    return d.payDay && d.monthly ? n.debtSub(rate, d.payDay, money(toCents(d.monthly))) : n.debtSubNoDay(rate);
  };

  const current = open && 'id' in open ? find(open.id) : undefined;

  return (
    <div className="flex min-h-full flex-col px-4 pb-40 pt-3 safe-pt font-figtree text-ink">
      <div className="flex items-center gap-3 px-1">
        <button type="button" onClick={onBack} aria-label={t.common.back} className="grid size-11 place-items-center rounded-full bg-card active:opacity-80">
          <Icon name="back" size={20} />
        </button>
      </div>
      <h1 className="mt-1 px-1 text-[30px] font-extrabold tracking-tight">{n.title}</h1>

      <div className="mt-4 rounded-3xl bg-lav px-5 py-6 text-center">
        <p className="text-[12.5px] font-bold">{n.heroLabel}</p>
        <div className="mt-1.5">
          <Amount cents={parts.totalCents} size="lg" tone={parts.totalCents < 0 ? 'neg' : 'ink'} />
        </div>
        {change !== null && (
          <p
            className={`mx-auto mt-3 inline-block rounded-full px-3 py-1 text-[12.5px] font-extrabold ${
              change > 0 ? 'bg-mint text-pos' : change < 0 ? 'bg-peach text-neg' : 'bg-line/10 text-mute'
            }`}
          >
            {change > 0 ? n.betterBy(money(change)) : change < 0 ? n.worseBy(money(-change)) : n.sameAs}
          </p>
        )}
      </div>

      <div className="mt-2.5 rounded-3xl bg-card px-5 py-2">
        <div className="flex items-baseline justify-between gap-3 py-2.5 text-[14.5px] font-bold">
          <span className="flex items-center gap-2.5">
            <span className="size-2.5 rounded-full bg-cat1" />
            {n.walletGoals}
          </span>
          <span className="tabular-nums">{money(parts.savingsCents)}</span>
        </div>
        <div className="flex items-baseline justify-between gap-3 border-t border-line/10 py-2.5 text-[14.5px] font-bold">
          <span className="flex items-center gap-2.5">
            <span className="size-2.5 rounded-full bg-cat3" />
            {n.investing}
          </span>
          <span className="tabular-nums">{money(parts.investingCents)}</span>
        </div>
        <div className="flex items-baseline justify-between gap-3 border-t border-line/10 py-2.5 text-[14.5px] font-bold">
          <span className="flex items-center gap-2.5">
            <span className="size-2.5 rounded-full bg-neg" />
            {n.debts}
          </span>
          <span className="tabular-nums text-neg">−{money(parts.debtsCents)}</span>
        </div>
        <p className="border-t border-line/10 pb-1.5 pt-3 text-[12px] font-medium leading-relaxed text-mute">{n.leftOut}</p>
      </div>

      <div className="mt-2.5 rounded-3xl bg-card p-5">
        <p className="text-[12.5px] font-bold text-mute">{n.trendTitle}</p>
        <div className="mt-2">
          <TrendLine points={trend} label={n.trendTitle} />
        </div>
        <div className="mt-1 flex justify-between text-[10.5px] font-bold text-mute">
          {trend.map((p) => (
            <span key={p.month}>{monthName(p.month)}</span>
          ))}
        </div>
        <p className="mt-3 text-[11.5px] font-medium leading-relaxed text-mute">{n.trendNote}</p>
      </div>

      <div className="mb-2 mt-7 flex items-center justify-between px-1">
        <h2 className="text-[17px] font-extrabold">{n.debtsTitle}</h2>
        <button type="button" onClick={() => setOpen({ kind: 'new' })} className="flex min-h-11 items-center gap-1 text-[13px] font-bold text-mute">
          <Icon name="plus" size={14} strokeWidth={2.4} />
          {n.add}
        </button>
      </div>
      {sorted.length === 0 ? (
        <p className="rounded-3xl bg-card px-5 py-8 text-center text-[13px] font-semibold leading-relaxed text-mute">{n.noDebts}</p>
      ) : (
        <Group>
          {sorted.map((d) => (
            <Row
              key={d.id}
              icon="wallet"
              tint="peach"
              title={d.name}
              sub={debtSub(d)}
              trailing={toCents(d.balance) > 0 ? money(toCents(d.balance)) : n.paidOff}
              tone={toCents(d.balance) > 0 ? 'neg' : 'mute'}
              onClick={() => setOpen({ kind: 'detail', id: d.id })}
            />
          ))}
        </Group>
      )}

      {open?.kind === 'new' && <DebtSheet onSave={(shape) => onCreateDebt(shape as NewLiability)} onClose={() => setOpen(null)} />}
      {open?.kind === 'edit' && current && <DebtSheet debt={current} onSave={(patch) => onUpdateDebt(current.id, patch as Partial<Liability>)} onClose={() => setOpen({ kind: 'detail', id: current.id })} />}
      {open?.kind === 'detail' && current && (
        <DebtDetail
          debt={current}
          payments={paymentsFor(activities, current.id)}
          onClose={() => setOpen(null)}
          onEdit={() => setOpen({ kind: 'edit', id: current.id })}
          onCorrect={() => setOpen({ kind: 'correct', id: current.id })}
          onExtra={() => setOpen({ kind: 'pay', id: current.id, mode: 'extra' })}
          onSettle={() => setOpen({ kind: 'pay', id: current.id, mode: 'settle' })}
          onDelete={() => {
            onDeleteDebt(current.id);
            setOpen(null);
          }}
          onOpenEntry={(id) => {
            setOpen(null);
            onOpenEntry(id);
          }}
        />
      )}
      {open?.kind === 'pay' && current && (
        <DebtPaymentSheet
          debt={current}
          mode={open.mode}
          banks={banks}
          walletCents={walletCents}
          onRecord={(payment) => onPay(current, payment)}
          onClose={() => setOpen({ kind: 'detail', id: current.id })}
        />
      )}
      {open?.kind === 'correct' && current && (
        <CorrectBalance debt={current} onSave={(balance) => onSetBalance(current.id, balance)} onClose={() => setOpen({ kind: 'detail', id: current.id })} />
      )}
    </div>
  );
};

/** One debt: what is owed, the payments so far, and what can be done to it. */
const DebtDetail: React.FC<{
  debt: Liability;
  payments: Activity[];
  onClose: () => void;
  onEdit: () => void;
  onCorrect: () => void;
  onExtra: () => void;
  onSettle: () => void;
  onDelete: () => void;
  onOpenEntry: (id: string) => void;
}> = ({ debt, payments, onClose, onEdit, onCorrect, onExtra, onSettle, onDelete, onOpenEntry }) => {
  const t = useT();
  const n = t.net;
  const [confirming, setConfirming] = useState(false);
  const money = (cents: number) => formatMoney(fromCents(cents));
  const owed = toCents(debt.balance);
  const sofar = paidSoFar(payments);
  const when = (iso: string) => new Date(iso).toLocaleDateString(dateLocale('en-GB'), { day: 'numeric', month: 'short' });

  return (
    <Sheet title={debt.name} onClose={onClose} height="tall">
      <div className="rounded-3xl bg-peach px-5 py-5">
        <p className="text-[12.5px] font-bold">{n.stillOwed}</p>
        <div className="mt-1">
          <Amount cents={owed} size="lg" />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {owed > 0 && (
            <>
              <Button full={false} onClick={onExtra}>
                {n.extra}
              </Button>
              <Button full={false} variant="ghost" onClick={onSettle}>
                {n.settle}
              </Button>
            </>
          )}
          <Button full={false} variant="ghost" onClick={onCorrect}>
            {n.correct}
          </Button>
        </div>
      </div>

      <div className="mt-2.5 rounded-3xl bg-card px-5 py-2">
        <p className="pt-2 text-[12.5px] font-bold text-mute">{n.soFar}</p>
        <div className="flex items-baseline justify-between gap-3 py-2.5 text-[14.5px] font-bold">
          <span>{n.principalPaid}</span>
          <span className="tabular-nums">{money(sofar.principalCents)}</span>
        </div>
        <div className="flex items-baseline justify-between gap-3 border-t border-line/10 py-2.5 text-[14.5px] font-bold">
          <span>{n.interestPaid}</span>
          <span className="tabular-nums">{money(sofar.interestCents)}</span>
        </div>
      </div>

      <h3 className="mb-2 mt-6 px-1 text-[15px] font-extrabold">{n.paymentsTitle}</h3>
      {payments.length === 0 ? (
        <p className="rounded-3xl bg-card px-5 py-6 text-center text-[13px] font-semibold text-mute">{n.noPayments}</p>
      ) : (
        <Group>
          {payments.map((p) => (
            <Row
              key={p.id}
              icon="out"
              tint="peach"
              title={money(toCents(p.amount))}
              sub={n.paymentSub(money(toCents(p.principal ?? 0)), money(toCents(p.interest ?? 0)), when(p.date))}
              onClick={() => onOpenEntry(p.id)}
            />
          ))}
        </Group>
      )}

      <div className="mt-5 flex gap-2">
        <Button variant="ghost" onClick={onEdit}>
          {n.edit}
        </Button>
        {confirming ? (
          <button
            type="button"
            onClick={onDelete}
            className="inline-flex min-h-12 w-full items-center justify-center rounded-full bg-neg px-6 font-figtree text-[15.5px] font-extrabold text-cta-fg active:opacity-80"
          >
            {t.common.confirm}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="inline-flex min-h-12 w-full items-center justify-center rounded-full bg-card px-6 font-figtree text-[15.5px] font-extrabold text-neg active:opacity-80"
          >
            {n.deleteDebt}
          </button>
        )}
      </div>
      <p className="mt-2 px-1 text-center text-[12px] font-medium text-mute">{n.deleteDebtNote}</p>
    </Sheet>
  );
};

/** For when the bank's figure and the app's have drifted apart. */
const CorrectBalance: React.FC<{ debt: Liability; onSave: (balance: number) => void | Promise<void>; onClose: () => void }> = ({ debt, onSave, onClose }) => {
  const t = useT();
  const n = t.net;
  const [text, setText] = useState(() => typedFromCents(toCents(debt.balance)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cents = amountToCents(text);

  const save = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSave(fromCents(cents));
      onClose();
    } catch (e) {
      setBusy(false);
      setError(e instanceof Error ? e.message : t.ui.toastError);
    }
  };

  return (
    <Sheet
      title={n.correct}
      onClose={onClose}
      footer={
        <Button loading={busy} onClick={save}>
          {t.common.save}
        </Button>
      }
    >
      <AmountInput label={n.newBalance} value={text} onChange={setText} startOpen />
      {error && <p role="alert" className="mt-4 rounded-3xl bg-card px-4 py-3 text-[13px] font-bold text-neg">{error}</p>}
    </Sheet>
  );
};

export default NetWorthPage;
