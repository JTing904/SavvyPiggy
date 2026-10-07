import React, { useMemo, useState } from 'react';
import type { Activity, Budgets } from '../types';
import { budgetRows, TOTAL } from '../services/budgets';
import { categoryOf } from '../services/categories';
import { formatMoney, fromCents } from '../services/money';
import { addMonthsTo, monthFigures, monthKeyOf, monthStartOf, pointsChange, rateSeries } from '../services/review';
import { useLedgerRange, type Ledger } from '../hooks/useOlderLedger';
import { useT } from '../contexts/LanguageContext';
import { Amount } from './ui/Amount';
import { Button } from './ui/Button';
import { Icon } from './ui/Icon';
import { Meter } from './ui/Meter';
import { Notice } from './ui/Notice';
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
  <div className="min-w-0 rounded-3xl bg-card p-4">
    <p className="text-[12px] font-bold text-mute">{label}</p>
    <div className="mt-1">{children}</div>
    <p className="mt-1 truncate text-[12px] font-medium text-mute">{sub}</p>
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

  const title = (
    <div className="mt-1 flex items-center justify-between gap-3 px-1">
      <h1 className="min-w-0 truncate text-[30px] font-extrabold tracking-tight">{v.title(monthName(start))}</h1>
      <div className="flex shrink-0 gap-2">
        <button
          type="button"
          disabled={!canGoBack}
          onClick={() => setStart(addMonthsTo(start, -1))}
          aria-label={r.monthsLong[addMonthsTo(start, -1).getMonth()]}
          className="grid size-11 place-items-center rounded-full bg-card disabled:opacity-30 active:opacity-70"
        >
          <Icon name="left" size={18} />
        </button>
        <button
          type="button"
          disabled={!canGoOn}
          onClick={() => setStart(addMonthsTo(start, 1))}
          aria-label={r.monthsLong[addMonthsTo(start, 1).getMonth()]}
          className="grid size-11 place-items-center rounded-full bg-card disabled:opacity-30 active:opacity-70"
        >
          <Icon name="right" size={18} />
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-full flex-col px-4 pb-40 pt-3 safe-pt font-figtree text-ink">
      <div className="flex items-center gap-3 px-1">
        <button type="button" onClick={onBack} aria-label={t.common.back} className="grid size-11 place-items-center rounded-full bg-card active:opacity-80">
          <Icon name="back" size={20} />
        </button>
      </div>
      {title}
      {isCurrent && <p className="mt-0.5 px-1 text-[13px] font-semibold text-mute">{v.monthSoFar}</p>}

      {older !== 'ready' ? (
        <Notice status={older} onRetry={ledger.retry} className="mt-5" />
      ) : fig.entries === 0 ? (
        <p className="mt-6 rounded-3xl bg-card px-5 py-10 text-center text-[13.5px] font-semibold text-mute">{v.nothingInMonth}</p>
      ) : (
        <>
          {/* The one number this page is about. */}
          <div className="mt-4 rounded-3xl bg-hero px-5 py-6 text-center">
            {fig.rate === null ? (
              <>
                <p className="text-[56px] font-extrabold leading-none tracking-[-0.04em] text-mute">—</p>
                <p className="mx-auto mt-3 max-w-[30ch] text-[13px] font-medium leading-relaxed text-mute">{v.noIncomeNote}</p>
              </>
            ) : fig.rate >= 0 ? (
              <>
                <p className="text-[13px] font-bold">{v.heroLead}</p>
                <p className="my-1.5 text-[64px] font-extrabold leading-none tracking-[-0.04em] tabular-nums">
                  {fig.rate}
                  <span className="text-[28px] text-mute">%</span>
                </p>
                <p className="text-[13px] font-bold">{v.heroTail}</p>
              </>
            ) : (
              <>
                <p className="text-[13px] font-bold">{v.heroDownLead}</p>
                <p className="my-1.5 text-[64px] font-extrabold leading-none tracking-[-0.04em] tabular-nums text-neg">
                  {fig.rate}
                  <span className="text-[28px]">%</span>
                </p>
                <p className="text-[13px] font-bold">{v.heroDownTail}</p>
              </>
            )}
            {change !== null && (
              <p
                className={`mx-auto mt-3 inline-block rounded-full px-3 py-1 text-[12.5px] font-extrabold ${
                  change > 0 ? 'bg-mint text-pos' : change < 0 ? 'bg-peach text-neg' : 'bg-line/10 text-mute'
                }`}
              >
                {v.vsMonth(change, priorName)}
                {prior.rate !== null && ` (${prior.rate}%)`}
              </p>
            )}
            <div>
              <button type="button" onClick={() => setExplaining(true)} className="mt-2 min-h-11 text-[13px] font-extrabold underline">
                {v.howItWorks}
              </button>
            </div>
          </div>

          <div className="mt-2.5 grid grid-cols-2 gap-2.5">
            <Tile label={v.moneyIn} sub={v.lastMonth(money(prior.incomeCents))}>
              <Amount cents={fig.incomeCents} size="md" tone="pos" />
            </Tile>
            <Tile label={v.moneyOut} sub={v.lastMonth(money(prior.spentCents))}>
              <Amount cents={fig.spentCents} size="md" tone="neg" />
            </Tile>
            <Tile label={v.putAside} sub={v.lastMonth(money(prior.savedCents))}>
              <Amount cents={fig.savedCents} size="md" />
            </Tile>
            <Tile label={v.walletMoved} sub={v.lastMonth(money(prior.walletChangeCents))}>
              <Amount cents={fig.walletChangeCents} size="md" signed />
            </Tile>
          </div>

          {/* Six months of the same number. */}
          <div className="mt-2.5 rounded-3xl bg-card p-5">
            <p className="text-[12.5px] font-bold text-mute">{v.trendTitle}</p>
            <div className="mt-3 flex h-24 items-end gap-2" role="img" aria-label={v.trendTitle}>
              {series.map((p, i) => {
                const last = i === series.length - 1;
                const height = p.has && p.rate !== null && p.rate > 0 ? Math.max(6, (p.rate / maxRate) * 100) : 3;
                return (
                  <div key={p.start.getTime()} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5">
                    <span className="text-[10.5px] font-extrabold tabular-nums text-mute">{p.has && p.rate !== null ? `${p.rate}%` : ''}</span>
                    <span
                      className={`block w-full rounded-t-lg ${last ? 'bg-cta' : p.has && p.rate !== null ? 'bg-pos/40' : 'bg-line/10'}`}
                      style={{ height: `${height}%` }}
                    />
                  </div>
                );
              })}
            </div>
            <div className="mt-1.5 flex gap-2">
              {series.map((p) => (
                <span key={p.start.getTime()} className="min-w-0 flex-1 text-center text-[10.5px] font-bold text-mute">
                  {r.monthsShort[p.start.getMonth()]}
                </span>
              ))}
            </div>
            <p className="mt-3 text-[11.5px] font-medium text-mute">{v.trendNote}</p>
          </div>

          {/* The budget, month by month. */}
          <div className="mt-7 flex items-baseline justify-between gap-3 px-1">
            <h2 className="text-[17px] font-extrabold">{v.budgetTitle}</h2>
            <button type="button" onClick={onOpenBudgets} className="flex min-h-11 items-center gap-0.5 text-[13px] font-bold text-mute">
              {hasBudgets ? v.allBudgets : v.setBudgets}
              <Icon name="chev" size={14} />
            </button>
          </div>
          {totalRow && totalRow.limitCents !== null && (
            <div className="mt-1 rounded-3xl bg-card p-5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[12.5px] font-bold text-mute">{v.totalBudget}</span>
                <span className="text-[12.5px] font-extrabold">{v.usedPct(totalRow.used ?? 0)}</span>
              </div>
              <p className="mt-1 text-[22px] font-extrabold tabular-nums">
                {money(totalRow.spentCents)} <span className="text-[14px] font-bold text-mute">/ {money(totalRow.limitCents)}</span>
              </p>
              <Meter percent={totalRow.used ?? 0} status={totalRow.status} label={v.totalBudget} className="mt-2.5" />
              <p className={`mt-1.5 text-[12px] font-semibold ${totalRow.status === 'over' ? 'text-neg' : 'text-mute'}`}>
                {(totalRow.leftCents ?? 0) >= 0 ? v.budgetLeft(money(totalRow.leftCents ?? 0)) : v.budgetOver(money(-(totalRow.leftCents ?? 0)))}
              </p>
            </div>
          )}
          {categoryRows.length > 0 && (
            <div className="mt-2.5 divide-y divide-line/10 rounded-3xl bg-card px-4 py-1">
              {categoryRows.map((row) => (
                <div key={row.key} className="py-3">
                  <div className="flex items-baseline justify-between gap-3 text-[14.5px] font-bold">
                    <span className="min-w-0 truncate">
                      {categoryOf(row.key).label}
                      <span
                        className={`ml-2 rounded-full px-2 py-0.5 align-middle text-[10.5px] font-extrabold ${
                          row.status === 'over' ? 'bg-peach text-neg' : row.status === 'near' ? 'bg-sun' : 'bg-mint text-pos'
                        }`}
                      >
                        {row.status === 'over' ? v.overTag : v.usedPct(row.used ?? 0)}
                      </span>
                    </span>
                    <span className={`shrink-0 tabular-nums font-extrabold ${row.status === 'over' ? 'text-neg' : ''}`}>
                      {money(row.spentCents)} <span className="font-bold text-mute">/ {money(row.limitCents ?? 0)}</span>
                    </span>
                  </div>
                  <Meter percent={row.used ?? 0} status={row.status} label={categoryOf(row.key).label} className="mt-2" />
                  <p className={`mt-1 text-[12px] font-medium ${row.status === 'over' ? 'text-neg' : 'text-mute'}`}>
                    {(row.leftCents ?? 0) >= 0 ? v.budgetLeft(money(row.leftCents ?? 0)) : v.budgetOver(money(-(row.leftCents ?? 0)))}
                  </p>
                </div>
              ))}
            </div>
          )}
          {!totalRow?.limitCents && categoryRows.length === 0 && (
            <p className="mt-1 rounded-3xl bg-card px-5 py-6 text-center text-[13px] font-semibold text-mute">{v.budgetEmpty}</p>
          )}

          {/* The biggest spends, and the bills among them. */}
          <h2 className="mt-7 px-1 text-[17px] font-extrabold">{v.biggestTitle}</h2>
          {fig.biggest.length === 0 ? (
            <p className="mt-2 rounded-3xl bg-card px-5 py-6 text-center text-[13px] font-semibold text-mute">{v.noSpends}</p>
          ) : (
            <div className="mt-2 divide-y divide-line/10 rounded-3xl bg-card px-4 py-1">
              {fig.biggest.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => onOpenEntry(b.id)}
                  className="flex min-h-14 w-full items-center gap-3 py-2.5 text-left active:opacity-70"
                >
                  <span className="w-9 shrink-0 text-[12px] font-bold text-mute tabular-nums">{new Date(b.date).getDate()}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14.5px] font-bold">{b.note || categoryOf(b.category).label}</span>
                    {(b.note || b.auto) && (
                      <span className="block truncate text-[11.5px] font-medium text-mute">
                        {[b.note ? categoryOf(b.category).label : '', b.auto ? v.auto : ''].filter(Boolean).join(' · ')}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-[14.5px] font-extrabold tabular-nums text-neg">−{money(b.cents)}</span>
                </button>
              ))}
            </div>
          )}

          {fig.billCount > 0 && (
            <div className="mt-2.5 flex items-baseline justify-between gap-3 rounded-3xl bg-peach px-5 py-4">
              <div className="min-w-0">
                <p className="text-[12.5px] font-bold">{v.billsTotal}</p>
                <p className="mt-0.5 text-[12px] font-medium opacity-70">{v.billsCount(fig.billCount)}</p>
              </div>
              <span className="shrink-0 text-[22px] font-extrabold tabular-nums">{money(fig.billsCents)}</span>
            </div>
          )}
        </>
      )}

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
