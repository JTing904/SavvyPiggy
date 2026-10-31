import React, { useMemo, useState } from 'react';
import type { Activity, Liability, PiggyBank } from '../types';
import type { NewLiability } from '../services/firestore';
import { largestFirst, type NetWorthParts, type TrendPoint } from '../services/netWorth';
import { paidSoFar, paymentsFor } from '../services/debts';
import { amountToCents, typedFromCents } from '../services/keypad';
import { formatMoney, fromCents, toCents } from '../services/money';
import { useT } from '../contexts/LanguageContext';
import { dateLocale } from '../i18n';
import { Button } from './ui/Button';
import { Bar, Swatch } from './ui/Charts';
import { Group } from './ui/Group';
import { Icon } from './ui/Icon';
import { IconTile } from './ui/IconTile';
import { BandLabel, PageBand } from './ui/PageBand';
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
              stroke="rgb(var(--c1))"
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
            className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-c1"
            style={{ left: `${(x(i) / 300) * 100}%`, top: `${(y(p.cents) / 96) * 100}%`, width: i === last ? 11 : 7, height: i === last ? 11 : 7 }}
          />
        )
      )}
    </div>
  );
};

const DEBT_ICON: Record<string, string> = { car: 'car', home: 'home' };

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
  const p = t.pro.debt;
  const [open, setOpen] = useState<Open>(null);
  const money = (cents: number) => formatMoney(fromCents(cents));
  const plain = (cents: number) => formatMoney(fromCents(cents), { symbol: false });
  const sorted = useMemo(() => largestFirst(liabilities, (d) => toCents(d.balance)), [liabilities]);
  const find = (id: string) => liabilities.find((d) => d.id === id);
  const monthName = (month: string) => t.report.monthsShort[Number(month.slice(5, 7)) - 1];

  const debtSub = (d: Liability) => {
    const rate = d.rate != null ? n.rateShort(d.rate, d.rateType === 'flat') : '';
    return d.payDay && d.monthly ? n.debtSub(rate, d.payDay, money(toCents(d.monthly))) : n.debtSubNoDay(rate);
  };

  const current = open && 'id' in open ? find(open.id) : undefined;

  return (
    <div className="flex min-h-full flex-col pb-40 font-figtree text-ink">
      <PageBand
        title={n.title}
        onBack={onBack}
        overlap={16}
        trailing={
          <button type="button" onClick={() => setOpen({ kind: 'new' })} className="-mr-2 flex min-h-11 shrink-0 items-center gap-1 px-2 text-[14px] font-bold active:opacity-70">
            <Icon name="plus" size={19} strokeWidth={2.4} />
            {n.add}
          </button>
        }
      >
        <BandLabel className="mt-1">{n.heroLabel}</BandLabel>
        <p className="mt-0.5 truncate text-[34px] font-bold leading-[1.15] tracking-[-0.015em] tabular-nums">{money(parts.totalCents)}</p>
        {change !== null && (
          <p className="mt-1 truncate text-[13.5px] font-semibold tabular-nums text-band-sub">
            {change > 0 ? n.betterBy(money(change)) : change < 0 ? n.worseBy(money(-change)) : n.sameAs}
          </p>
        )}
      </PageBand>

      <div className="-mt-11 flex flex-col gap-2.5 px-4">
        <div className="rounded-3xl bg-card px-3.5 py-1.5 shadow-[0_2px_10px_rgba(20,35,58,0.1)]">
          <div className="flex items-baseline justify-between gap-3 py-2 text-[14.5px] font-bold">
            <span className="flex min-w-0 items-center gap-2.5">
              <Swatch color={1} />
              {n.walletGoals}
            </span>
            <span className="shrink-0 tabular-nums">{money(parts.savingsCents)}</span>
          </div>
          <div className="flex items-baseline justify-between gap-3 border-t border-line/10 py-2 text-[14.5px] font-bold">
            <span className="flex min-w-0 items-center gap-2.5">
              <Swatch color={5} />
              {n.investing}
            </span>
            <span className="shrink-0 tabular-nums">{money(parts.investingCents)}</span>
          </div>
          <div className="flex items-baseline justify-between gap-3 border-t border-line/10 py-2 text-[14.5px] font-bold">
            <span className="flex min-w-0 items-center gap-2.5">
              <Swatch color={4} />
              {n.debts}
            </span>
            <span className="shrink-0 tabular-nums text-neg">
              {parts.debtsCents !== 0 && '−'}
              {money(parts.debtsCents)}
            </span>
          </div>
          <p className="border-t border-line/10 pb-1 pt-2 text-[12.5px] font-medium leading-relaxed text-mute">{n.leftOut}</p>
        </div>

        <div className="rounded-3xl bg-card px-3.5 py-3">
          <h2 className="text-[15px] font-bold">{n.trendTitle}</h2>
          <div className="mt-2">
            <TrendLine points={trend} label={n.trendTitle} />
          </div>
          <div className="mt-1 flex justify-between text-[11.5px] font-semibold text-mute">
            {trend.map((point) => (
              <span key={point.month}>{monthName(point.month)}</span>
            ))}
          </div>
          <p className="mt-2 text-[12.5px] font-medium leading-relaxed text-mute">{n.trendNote}</p>
        </div>

        <h2 className="mt-2 px-1 text-[15px] font-bold">{n.debtsTitle}</h2>
        {sorted.length === 0 ? (
          <p className="rounded-3xl bg-card px-5 py-8 text-center text-[13px] font-semibold leading-relaxed text-mute">{n.noDebts}</p>
        ) : (
          sorted.map((d) => {
            const owed = toCents(d.balance);
            // Only a debt that knows what was first borrowed can say how far along it is.
            const first = toCents(d.original ?? 0);
            const paid = first > 0 ? Math.max(0, first - owed) : null;
            const percent = paid === null ? 0 : Math.floor((paid * 100) / first);
            return (
              <button key={d.id} type="button" onClick={() => setOpen({ kind: 'detail', id: d.id })} className="block w-full rounded-3xl bg-card p-3.5 text-left active:opacity-80">
                <span className="flex items-center gap-3">
                  <IconTile icon={DEBT_ICON[d.kind] ?? 'wallet'} tint="coral" size={44} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15.5px] font-bold">{d.name}</span>
                    <span className="block truncate text-[12.5px] font-semibold text-mute">{debtSub(d)}</span>
                  </span>
                  <span className={`shrink-0 text-[15.5px] font-bold tabular-nums ${owed > 0 ? '' : 'text-mute'}`}>{owed > 0 ? plain(owed) : n.paidOff}</span>
                </span>
                {paid !== null && owed > 0 && (
                  <>
                    <Bar percent={percent} color={2} className="mt-3" />
                    <span className="mt-1.5 flex justify-between gap-3 text-[12.5px] font-semibold tabular-nums text-mute">
                      <span className="min-w-0 truncate">{p.paid(plain(paid))}</span>
                      <span className="shrink-0">{percent}%</span>
                    </span>
                  </>
                )}
              </button>
            );
          })
        )}
      </div>

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
      <div className="rounded-3xl bg-card p-3.5">
        <p className="text-[13.5px] font-semibold text-mute">{n.stillOwed}</p>
        <p className="mt-0.5 truncate text-[28px] font-bold leading-tight tabular-nums">{money(owed)}</p>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {owed > 0 && (
          <>
            <Button className="!px-2" onClick={onExtra}>
              {n.extra}
            </Button>
            <Button variant="ghost" className="!px-2" onClick={onSettle}>
              {n.settle}
            </Button>
          </>
        )}
        <Button variant="ghost" className="col-span-2 !px-2" onClick={onCorrect}>
          {n.correct}
        </Button>
      </div>

      <div className="mt-2.5 rounded-3xl bg-card px-3.5 py-1.5">
        <p className="pt-1 text-[13.5px] font-semibold text-mute">{n.soFar}</p>
        <div className="flex items-baseline justify-between gap-3 py-2 text-[14.5px] font-bold">
          <span>{n.principalPaid}</span>
          <span className="tabular-nums">{money(sofar.principalCents)}</span>
        </div>
        <div className="flex items-baseline justify-between gap-3 border-t border-line/10 py-2 text-[14.5px] font-bold">
          <span>{n.interestPaid}</span>
          <span className="tabular-nums">{money(sofar.interestCents)}</span>
        </div>
      </div>

      <h3 className="mb-1.5 mt-3 px-1 text-[15px] font-bold">{n.paymentsTitle}</h3>
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
          <Button variant="danger" className="!px-2" onClick={onDelete}>
            {t.common.confirm}
          </Button>
        ) : (
          <Button variant="ghost" className="!px-2 !text-neg" onClick={() => setConfirming(true)}>
            {n.deleteDebt}
          </Button>
        )}
      </div>
      <p className="mt-2 px-1 text-center text-[12.5px] font-medium text-mute">{n.deleteDebtNote}</p>
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
