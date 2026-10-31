import React, { useMemo, useState } from 'react';
import type { Activity, Budgets } from '../types';
import { budgetRows, TOTAL } from '../services/budgets';
import { categoryOf } from '../services/categories';
import { formatMoney, fromCents } from '../services/money';
import { addMonthsTo, monthFigures, monthKeyOf, monthStartOf, pointsChange, rateSeries } from '../services/review';
import { useLedgerRange, type Ledger } from '../hooks/useOlderLedger';
import { useT } from '../contexts/LanguageContext';
import { Button } from './ui/Button';
import { Icon } from './ui/Icon';
import { IconTile } from './ui/IconTile';
import { Meter } from './ui/Meter';
import { Notice } from './ui/Notice';
import { BandLabel, PageBand } from './ui/PageBand';
import { Ring } from './ui/Charts';
import { Sheet } from './ui/Sheet';

interface MonthReviewProps {
  activities: Activity[];
  ledger: Ledger;
  budgets: Budgets;
  /** The month to open on: any day in it. */
  month: Date;
  onBack: () => void;
  onOpenBudgets: () => void;
  onOpenEntry: (id: string) => void;
}

const Tile: React.FC<{ label: string; children: React.ReactNode; sub: string }> = ({ label, children, sub }) => (
  <div className="min-w-0 rounded-3xl bg-card p-3.5">
    <p className="text-[12.5px] font-semibold text-mute">{label}</p>
    <p className="mt-0.5 truncate text-[18px] font-bold tabular-nums">{children}</p>
    <p className="mt-0.5 truncate text-[12.5px] font-semibold text-mute">{sub}</p>
  </div>
);

/**
 * One month, read back: what came in, what went out, how much was set aside,
 * and how that sits against the month before and against the budget.
 */
const MonthReview: React.FC<MonthReviewProps> = ({ activities, ledger, budgets, month, onBack, onOpenBudgets, onOpenEntry }) => {
  const t = useT();
  const v = t.review;
  const r = t.report;
  const [start, setStart] = useState(() => monthStartOf(month));
  const [explaining, setExplaining] = useState(false);

  const now = new Date();
  const thisMonth = monthStartOf(now);
  const isCurrent = start.getTime() === thisMonth.getTime();
  const oldest = monthStartOf(ledger.keptFrom);
  const canGoBack = start.getTime() > oldest.getTime();
  const canGoOn = start.getTime() < thisMonth.getTime();

  // The six-month chart and the month before both reach back.
  const older = useLedgerRange(ledger, addMonthsTo(start, -5));

  const fig = useMemo(() => monthFigures(activities, start, now), [activities, start]); // eslint-disable-line react-hooks/exhaustive-deps
  const prior = useMemo(() => monthFigures(activities, addMonthsTo(start, -1), now), [activities, start]); // eslint-disable-line react-hooks/exhaustive-deps
  const series = useMemo(() => rateSeries(activities, start, 6, now), [activities, start]); // eslint-disable-line react-hooks/exhaustive-deps
  const rows = useMemo(
    () => budgetRows(budgets, monthKeyOf(start), fig.categories, fig.spentCents),
    [budgets, start, fig]
  );
  const totalRow = rows.find((row) => row.key === TOTAL);
  const categoryRows = rows.filter((row) => row.key !== TOTAL && row.limitCents !== null);
  const hasBudgets = Object.keys(budgets.categories).length > 0 || budgets.total.length > 0;

  const money = (cents: number) => formatMoney(fromCents(cents));
  const monthName = (d: Date) => r.monthsLong[d.getMonth()];
  const priorName = monthName(prior.start);
  const change = pointsChange(fig.rate, prior.rate);
  const maxRate = Math.max(1, ...series.map((p) => Math.max(0, p.rate ?? 0)));

  const steps = (
    <span className="-mr-2.5 flex shrink-0">
      <button
        type="button"
        disabled={!canGoBack}
        onClick={() => setStart(addMonthsTo(start, -1))}
        aria-label={r.monthsLong[addMonthsTo(start, -1).getMonth()]}
        className="grid size-11 place-items-center disabled:opacity-30 active:opacity-70"
      >
        <Icon name="left" size={20} strokeWidth={2.2} />
      </button>
      <button
        type="button"
        disabled={!canGoOn}
        onClick={() => setStart(addMonthsTo(start, 1))}
        aria-label={r.monthsLong[addMonthsTo(start, 1).getMonth()]}
        className="grid size-11 place-items-center disabled:opacity-30 active:opacity-70"
      >
        <Icon name="right" size={20} strokeWidth={2.2} />
      </button>
    </span>
  );

  return (
    <div className="flex min-h-full flex-col pb-40 font-figtree text-ink">
      <PageBand title={v.title(monthName(start))} onBack={onBack} trailing={steps} overlap={16}>
        {isCurrent && <BandLabel>{v.monthSoFar}</BandLabel>}
      </PageBand>

      <div className={`${isCurrent ? '-mt-[52px]' : '-mt-[58px]'} flex flex-col gap-2.5 px-4`}>
        {older !== 'ready' ? (
          <Notice status={older} onRetry={ledger.retry} />
        ) : fig.entries === 0 ? (
          <p className="rounded-3xl bg-card px-5 py-10 text-center text-[13.5px] font-semibold text-mute shadow-[0_2px_10px_rgba(20,35,58,0.1)]">{v.nothingInMonth}</p>
        ) : (
          <>
            {/* The one number this page is about. */}
            <div className="flex items-center gap-4 rounded-3xl bg-card p-3.5 shadow-[0_2px_10px_rgba(20,35,58,0.1)]">
              <Ring percent={fig.rate} color={fig.rate !== null && fig.rate < 0 ? 4 : 1} size={96} width={11} label={fig.rate === null ? v.rate : `${v.rate} ${fig.rate}%`}>
                <span className={`text-[22px] font-bold tabular-nums ${fig.rate === null ? 'text-mute' : fig.rate < 0 ? 'text-neg' : ''}`}>{fig.rate === null ? '—' : `${fig.rate}%`}</span>
              </Ring>
              <div className="min-w-0 flex-1">
                {fig.rate === null ? (
                  <p className="text-[13px] font-medium leading-relaxed text-mute">{v.noIncomeNote}</p>
                ) : fig.rate >= 0 ? (
                  <p className="text-[14px] font-semibold leading-snug">
                    {v.heroLead} {fig.rate}% {v.heroTail}
                  </p>
                ) : (
                  <p className="text-[14px] font-semibold leading-snug">
                    {v.heroDownLead} {fig.rate}% {v.heroDownTail}
                  </p>
                )}
                {change !== null && (
                  <p className={`mt-1 text-[12.5px] font-bold ${change > 0 ? 'text-pos' : change < 0 ? 'text-neg' : 'text-mute'}`}>
                    {v.vsMonth(change, priorName)}
                    {prior.rate !== null && ` (${prior.rate}%)`}
                  </p>
                )}
                <button type="button" onClick={() => setExplaining(true)} className="min-h-11 text-[13.5px] font-bold text-tblue active:opacity-70">
                  {v.howItWorks}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Tile label={v.moneyIn} sub={v.lastMonth(money(prior.incomeCents))}>
                <span className="text-pos">{money(fig.incomeCents)}</span>
              </Tile>
              <Tile label={v.moneyOut} sub={v.lastMonth(money(prior.spentCents))}>
                <span className="text-neg">{money(fig.spentCents)}</span>
              </Tile>
              <Tile label={v.putAside} sub={v.lastMonth(money(prior.savedCents))}>
                {money(fig.savedCents)}
              </Tile>
              <Tile label={v.walletMoved} sub={v.lastMonth(money(prior.walletChangeCents))}>
                {formatMoney(fromCents(fig.walletChangeCents), { signed: true })}
              </Tile>
            </div>

            {/* Six months of the same number. */}
            <div className="rounded-3xl bg-card px-3.5 py-3">
              <h2 className="text-[15px] font-bold">{v.trendTitle}</h2>
              <div className="mt-2.5 flex h-24 items-end gap-2" role="img" aria-label={v.trendTitle}>
                {series.map((p, i) => {
                  const last = i === series.length - 1;
                  const height = p.has && p.rate !== null && p.rate > 0 ? Math.max(6, (p.rate / maxRate) * 100) : 3;
                  return (
                    <div key={p.start.getTime()} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
                      <span className="text-[11.5px] font-bold tabular-nums text-mute">{p.has && p.rate !== null ? `${p.rate}%` : ''}</span>
                      <span
                        className={`block w-full rounded-t ${p.has && p.rate !== null ? (last ? 'bg-c1' : 'bg-c1/30') : 'bg-track'}`}
                        style={{ height: `${height}%` }}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="mt-1 flex gap-2">
                {series.map((p) => (
                  <span key={p.start.getTime()} className="min-w-0 flex-1 text-center text-[11.5px] font-semibold text-mute">
                    {r.monthsShort[p.start.getMonth()]}
                  </span>
                ))}
              </div>
              <p className="mt-2 text-[12.5px] font-medium text-mute">{v.trendNote}</p>
            </div>

            {/* The budget, month by month. */}
            <div className="mt-1 flex items-baseline justify-between gap-3 px-1">
              <h2 className="text-[15px] font-bold">{v.budgetTitle}</h2>
              <button type="button" onClick={onOpenBudgets} className="flex min-h-11 items-center gap-0.5 text-[13.5px] font-bold text-tblue active:opacity-70">
                {hasBudgets ? v.allBudgets : v.setBudgets}
                <Icon name="chev" size={15} strokeWidth={2} />
              </button>
            </div>
            {totalRow && totalRow.limitCents !== null && (
              <div className="rounded-3xl bg-card p-3.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[13.5px] font-semibold text-mute">{v.totalBudget}</span>
                  <span className="text-[13px] font-bold tabular-nums">{v.usedPct(totalRow.used ?? 0)}</span>
                </div>
                <p className="mt-0.5 text-[20px] font-bold tabular-nums">
                  {money(totalRow.spentCents)} <span className="text-[13.5px] font-semibold text-mute">/ {money(totalRow.limitCents)}</span>
                </p>
                <Meter percent={totalRow.used ?? 0} status={totalRow.status} label={v.totalBudget} className="mt-2" />
                <p className={`mt-1.5 text-[12.5px] font-semibold ${totalRow.status === 'over' ? 'text-neg' : 'text-mute'}`}>
                  {(totalRow.leftCents ?? 0) >= 0 ? v.budgetLeft(money(totalRow.leftCents ?? 0)) : v.budgetOver(money(-(totalRow.leftCents ?? 0)))}
                </p>
              </div>
            )}
            {categoryRows.length > 0 && (
              <div className="divide-y divide-line/10 rounded-3xl bg-card px-3.5 py-1">
                {categoryRows.map((row) => (
                  <div key={row.key} className="py-2.5">
                    <div className="flex items-baseline justify-between gap-3 text-[14.5px] font-bold">
                      <span className="min-w-0 truncate">
                        {categoryOf(row.key).label}
                        <span
                          className={`ml-1.5 rounded-md px-1.5 py-0.5 align-middle text-[11.5px] font-bold ${
                            row.status === 'over' ? 'bg-peach text-neg' : row.status === 'near' ? 'bg-sun' : 'bg-mint text-pos'
                          }`}
                        >
                          {row.status === 'over' ? v.overTag : v.usedPct(row.used ?? 0)}
                        </span>
                      </span>
                      <span className={`shrink-0 tabular-nums ${row.status === 'over' ? 'text-neg' : ''}`}>
                        {money(row.spentCents)} <span className="font-semibold text-mute">/ {money(row.limitCents ?? 0)}</span>
                      </span>
                    </div>
                    <Meter percent={row.used ?? 0} status={row.status} label={categoryOf(row.key).label} className="mt-2" />
                    <p className={`mt-1 text-[12.5px] font-semibold ${row.status === 'over' ? 'text-neg' : 'text-mute'}`}>
                      {(row.leftCents ?? 0) >= 0 ? v.budgetLeft(money(row.leftCents ?? 0)) : v.budgetOver(money(-(row.leftCents ?? 0)))}
                    </p>
                  </div>
                ))}
              </div>
            )}
            {!totalRow?.limitCents && categoryRows.length === 0 && (
              <p className="rounded-3xl bg-card px-5 py-6 text-center text-[13px] font-semibold text-mute">{v.budgetEmpty}</p>
            )}

            {/* The biggest spends, and the bills among them. */}
            <h2 className="mt-1 px-1 text-[15px] font-bold">{v.biggestTitle}</h2>
            {fig.biggest.length === 0 ? (
              <p className="rounded-3xl bg-card px-5 py-6 text-center text-[13px] font-semibold text-mute">{v.noSpends}</p>
            ) : (
              <div className="divide-y divide-line/10 rounded-3xl bg-card px-3.5 py-0.5">
                {fig.biggest.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => onOpenEntry(b.id)}
                    className="flex min-h-14 w-full items-center gap-2.5 py-2 text-left active:opacity-70"
                  >
                    <IconTile
                      icon={<span className="material-symbols-rounded text-[20px] leading-none">{categoryOf(b.category).icon}</span>}
                      tint="coral"
                      size={38}
                      round
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14.5px] font-bold">{b.note || categoryOf(b.category).label}</span>
                      <span className="block truncate text-[12.5px] font-semibold text-mute">
                        {[String(new Date(b.date).getDate()), b.note ? categoryOf(b.category).label : '', b.auto ? v.auto : ''].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    <span className="shrink-0 text-[14.5px] font-bold tabular-nums text-neg">−{money(b.cents)}</span>
                  </button>
                ))}
              </div>
            )}

            {fig.billCount > 0 && (
              <div className="flex items-center gap-2.5 rounded-3xl bg-card p-3.5">
                <IconTile icon="doc" tint="coral" size={38} />
                <div className="min-w-0 flex-1">
                  <p className="text-[14.5px] font-bold">{v.billsTotal}</p>
                  <p className="text-[12.5px] font-semibold text-mute">{v.billsCount(fig.billCount)}</p>
                </div>
                <span className="shrink-0 text-[18px] font-bold tabular-nums">{money(fig.billsCents)}</span>
              </div>
            )}
          </>
        )}
      </div>

      {explaining && (
        <Sheet
          title={v.explainTitle}
          onClose={() => setExplaining(false)}
          footer={
            <Button onClick={() => setExplaining(false)}>{v.close}</Button>
          }
        >
          <div className="rounded-3xl bg-card px-4 py-3 text-[14px] tabular-nums">
            <div className="flex items-baseline justify-between gap-3 py-1.5">
              <span className="font-semibold">{v.explainIncome}</span>
              <b>{money(fig.incomeCents)}</b>
            </div>
            <div className="flex items-baseline justify-between gap-3 py-1.5">
              <span className="min-w-0 font-semibold">{v.explainPutIn}</span>
              <b className="shrink-0">{money(fig.putInCents)}</b>
            </div>
            <div className="flex items-baseline justify-between gap-3 py-1.5">
              <span className="min-w-0 font-semibold">{v.explainTakenOut}</span>
              <b className="shrink-0">−{money(fig.takenOutCents)}</b>
            </div>
            <div className="mt-1 flex items-baseline justify-between gap-3 border-t border-line/10 pt-2.5 text-[15px] font-extrabold">
              <span>{v.explainSaved}</span>
              <span>{money(fig.savedCents)}</span>
            </div>
            <p className="mt-2.5 border-t border-line/10 pt-2.5 text-[14px] font-extrabold">
              {fig.rate === null ? '—' : v.explainRate(money(fig.savedCents), money(fig.incomeCents))}
              {fig.rate !== null && ` = ${fig.rate}%`}
            </p>
          </div>
          <p className="mt-4 text-[13px] font-medium leading-relaxed text-mute">{v.explainWallet}</p>
          <p className="mt-2 text-[13px] font-medium leading-relaxed text-mute">{v.explainNoIncome}</p>
          <p className="mt-2 text-[13px] font-medium leading-relaxed text-mute">{v.explainRepaid}</p>
          <p className="mt-2 text-[13px] font-medium leading-relaxed text-mute">{v.explainInvest}</p>
        </Sheet>
      )}
    </div>
  );
};

export default MonthReview;
