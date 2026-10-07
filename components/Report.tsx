import React, { useMemo, useState } from 'react';
import type { Activity, Budgets, PiggyBank } from '../types';
import { PERIODS, forecastFor, spendingByCategory, summarize, type Period, type StreakRun } from '../services/analytics';
import { budgetRows, TOTAL, type BudgetRow } from '../services/budgets';
import { categoryOf } from '../services/categories';
import { safeGoalIcon } from '../services/goalIcons';
import { formatMoney, fromCents } from '../services/money';
import { reportNeedsFrom } from '../services/ledgerWindow';
import { addMonthsTo, centsChange, creditedByGoal, figuresFor, monthFigures, monthKeyOf, monthStartOf, pointsChange } from '../services/review';
import { useLedgerRange, type Ledger } from '../hooks/useOlderLedger';
import { useT } from '../contexts/LanguageContext';
import { dateLocale } from '../i18n';
import Avatar from './Avatar';
import { Amount } from './ui/Amount';
import { Button } from './ui/Button';
import { EmptyState } from './ui/EmptyState';
import { Icon } from './ui/Icon';
import { Meter } from './ui/Meter';
import { Notice } from './ui/Notice';

interface ReportProps {
  banks: PiggyBank[];
  activities: Activity[];
  /** How far back `activities` goes; a year or "all" asks for the older part. */
  ledger: Ledger;
  /** The saving streak, counted by the app rather than from the loaded window. */
  streak: StreakRun;
  budgets: Budgets;
  /** What the wallet holds now, in cents. */
  walletCents: number;
  onOpenStrategy: () => void;
  /** The empty report's one action. */
  onDeposit?: () => void;
  onOpenProfile: () => void;
  onOpenStatements: () => void;
  /** Opens the full review of the month starting on this day. */
  onOpenReview: (month: Date) => void;
  onOpenBudgets: () => void;
  /** What is known less what is owed, and how it compares with last month. */
  netWorth: { totalCents: number; changeCents: number | null };
  onOpenNetWorth: () => void;
}

const longDate = (d: Date) => d.toLocaleDateString(dateLocale('en-US'), { month: 'short', day: 'numeric', year: 'numeric' });

// Full literal class strings so the build keeps every one of them.
const CAT_BG = ['bg-cat1', 'bg-cat2', 'bg-cat3', 'bg-cat4', 'bg-cat5', 'bg-cat6'];
const TINT_BG = ['bg-peach', 'bg-lav', 'bg-mint', 'bg-sun'];

const Card: React.FC<{ className?: string; children: React.ReactNode }> = ({ className = '', children }) => (
  <div className={`rounded-3xl bg-card p-5 ${className}`}>{children}</div>
);

const Heading: React.FC<{ title: string; hint?: string; className?: string }> = ({ title, hint, className = '' }) => (
  <div className={`px-1 ${className}`}>
    <h2 className="text-[17px] font-extrabold">{title}</h2>
    {hint && <p className="mt-0.5 text-[12.5px] font-medium text-mute">{hint}</p>}
  </div>
);

/** One line of the money-flow card. Amounts are signed by the caller; `rule` draws the line above a subtotal. */
const Line: React.FC<{ label: string; cents: number; rule?: boolean; strong?: boolean; sub?: boolean; muted?: boolean }> = ({
  label,
  cents,
  rule,
  strong,
  sub,
  muted,
}) => (
  <div
    className={`flex items-baseline justify-between gap-3 ${rule ? 'mt-1.5 border-t border-line/10 pt-3' : ''} ${
      sub ? 'py-1 pl-4 text-[12.5px]' : strong ? 'py-1.5 text-[15px]' : 'py-1.5 text-[14px]'
    }`}
  >
    <span className={`min-w-0 ${strong ? 'font-extrabold' : sub || muted ? 'font-medium text-mute' : 'font-semibold'}`}>{label}</span>
    <span className={`shrink-0 whitespace-nowrap tabular-nums ${strong ? 'font-extrabold' : sub || muted ? 'font-semibold text-mute' : 'font-bold'}`}>
      {formatMoney(fromCents(cents), { signed: false })}
    </span>
  </div>
);

const percent = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

const Report: React.FC<ReportProps> = ({
  banks,
  activities,
  ledger,
  streak,
  budgets,
  walletCents,
  onOpenStrategy,
  onOpenProfile,
  onOpenStatements,
  onDeposit,
  onOpenReview,
  onOpenBudgets,
  netWorth,
  onOpenNetWorth,
}) => {
  const [period, setPeriod] = useState<Period>('month');
  // Which cadence bar the user tapped, so it can show what it is worth.
  const [picked, setPicked] = useState<number | null>(null);
  const t = useT();
  const r = t.report;
  const v = t.review;

  const now = new Date();
  // A quarter's comparison, a year or "all" reach past the live three months.
  const needFrom = reportNeedsFrom(period, now, ledger.liveFrom, ledger.keptFrom);
  const older = useLedgerRange(ledger, needFrom);
  // `t` is a dependency so the period's labels are reworded when the language changes.
  const summary = useMemo(() => summarize(activities, banks, period, now), [activities, banks, period, t]); // eslint-disable-line react-hooks/exhaustive-deps
  const range = summary.range;

  const figures = useMemo(() => figuresFor(activities, range.start, range.end, now), [activities, range]); // eslint-disable-line react-hooks/exhaustive-deps
  const before = useMemo(
    () => (range.previous ? figuresFor(activities, range.previous.start, range.previous.end, now) : null),
    [activities, range] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const change = before ? centsChange(figures.putInCents, before.putInCents) : null;
  const perDay = Math.floor(figures.putInCents / range.days);

  // The month card: the month that just finished, or this one so far when that one has nothing in it.
  const review = useMemo(() => {
    const last = monthFigures(activities, addMonthsTo(now, -1), now);
    const target = last.entries > 0 ? last : monthFigures(activities, monthStartOf(now), now);
    if (target.entries === 0) return null;
    const prior = monthFigures(activities, addMonthsTo(target.start, -1), now);
    return { target, prior, current: target.start.getTime() === monthStartOf(now).getTime() };
  }, [activities]); // eslint-disable-line react-hooks/exhaustive-deps

  const spending = useMemo(() => spendingByCategory(activities, range, now), [activities, range]); // eslint-disable-line react-hooks/exhaustive-deps
  const spentTotal = figures.spentCents;
  const isMonth = period === 'month';
  const limits = useMemo(
    () => (isMonth ? budgetRows(budgets, monthKeyOf(now), spending, spentTotal) : []),
    [isMonth, budgets, spending, spentTotal] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const limitOf = (key: string): BudgetRow | undefined => limits.find((row) => row.key === key);
  const totalRow = limitOf(TOTAL);

  // What reached each goal: put straight in, or moved in from the wallet.
  const credited = useMemo(() => creditedByGoal(activities, range.start, range.end, now), [activities, range]); // eslint-disable-line react-hooks/exhaustive-deps
  const creditedTotal = [...credited.values()].reduce((sum, c) => sum + c, 0);
  const bankStats = useMemo(
    () =>
      banks
        .map((b, i) => ({
          bank: b,
          index: i,
          credited: credited.get(b.id) ?? 0,
          funded: b.targetAmount > 0 ? Math.round((b.currentAmount / b.targetAmount) * 100) : null,
        }))
        .sort((x, y) => y.credited - x.credited || x.index - y.index),
    [banks, credited]
  );
  const top = bankStats.find((s) => s.credited > 0) ?? null;
  const forecast = useMemo(
    () =>
      forecastFor(
        bankStats.map((s) => ({ bankId: s.bank.id, name: s.bank.name, credited: fromCents(s.credited), target: s.bank.targetAmount, current: s.bank.currentAmount })),
        range.days,
        now
      ),
    [bankStats, range] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Where "goals grew by" lands: saved, less spent from goals, less moved to shares, plus what came back, plus wallet moves.
  const sharesToDebt = Math.max(0, fromCents(Math.round((summary.cameBack - summary.cameBackToGoals) * 100)));
  const grewBy = Math.round(
    (summary.distributed - summary.spent - summary.invested + summary.cameBackToGoals + summary.walletMoved) * 100
  );
  const maxBucket = Math.max(0, ...summary.buckets.map((b) => b.amount));
  const money = (cents: number) => formatMoney(fromCents(cents));

  const head = (
    <>
      <div className="flex items-start justify-between gap-3 px-1">
        <div className="min-w-0">
          <h1 className="text-[30px] font-extrabold tracking-tight">{r.title}</h1>
          <p className="mt-0.5 text-[13.5px] font-semibold text-mute">{v.reportHint}</p>
        </div>
        <Avatar plain onClick={onOpenProfile} />
      </div>

      <div role="tablist" aria-label={v.period} className="mt-4 flex rounded-full bg-line/10 p-1">
        {PERIODS.map((p) => {
          const on = p.key === period;
          return (
            <button
              key={p.key}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => {
                setPeriod(p.key);
                setPicked(null);
              }}
              className={`min-h-11 min-w-0 flex-1 whitespace-nowrap rounded-full px-1 text-[13px] font-extrabold ${on ? 'bg-card text-ink' : 'text-mute'}`}
            >
              {p.label}
            </button>
          );
        })}
      </div>
    </>
  );

  const frame = (children: React.ReactNode) => (
    <div className="flex min-h-full flex-col px-4 pb-40 pt-3 safe-pt font-figtree text-ink">{children}</div>
  );

  // Nothing is summed from part of a period: until its older records are
  // here, the figures wait rather than read as a smaller total.
  if (older !== 'ready') {
    return frame(
      <>
        {head}
        <Notice status={older} onRetry={ledger.retry} className="mt-5" />
      </>
    );
  }

  // Nothing to sum yet: say so and offer the one thing that fills it.
  if (activities.length === 0) {
    return frame(
      <>
        {head}
        <EmptyState
          icon="chart"
          title={r.emptyTitle}
          body={r.emptyBody}
          action={onDeposit ? { label: r.emptyAction, onClick: onDeposit } : undefined}
          className="mt-8"
        />
      </>
    );
  }

  const monthName = (d: Date) => r.monthsLong[d.getMonth()];
  const reviewChange = review ? pointsChange(review.target.rate, review.prior.rate) : null;

  return frame(
    <>
      {head}

      {/* What is known less what is owed. */}
      <button type="button" onClick={onOpenNetWorth} className="mt-4 block w-full rounded-3xl bg-lav p-5 text-left active:opacity-80">
        <span className="flex items-baseline justify-between gap-3">
          <span className="text-[12.5px] font-bold">{t.net.cardTitle}</span>
          <span className="flex items-center gap-0.5 text-[12.5px] font-bold text-mute">
            {t.net.view}
            <Icon name="chev" size={14} />
          </span>
        </span>
        <span className="mt-1 block">
          <Amount cents={netWorth.totalCents} size="lg" tone={netWorth.totalCents < 0 ? 'neg' : 'ink'} />
        </span>
        {netWorth.changeCents !== null && (
          <span
            className={`mt-2 inline-block rounded-full px-3 py-1 text-[12.5px] font-extrabold ${
              netWorth.changeCents > 0 ? 'bg-mint text-pos' : netWorth.changeCents < 0 ? 'bg-peach text-neg' : 'bg-line/10 text-mute'
            }`}
          >
            {netWorth.changeCents > 0
              ? t.net.betterBy(money(netWorth.changeCents))
              : netWorth.changeCents < 0
                ? t.net.worseBy(money(-netWorth.changeCents))
                : t.net.sameAs}
          </span>
        )}
        <span className="mt-2 block text-[12px] font-medium text-mute">{t.net.cardNote}</span>
      </button>

      {/* The month's review, one tap from here. */}
      {review && (
        <button
          type="button"
          onClick={() => onOpenReview(review.target.start)}
          className="mt-2.5 block w-full rounded-3xl bg-hero p-5 text-left active:opacity-80"
        >
          <span className="flex items-baseline justify-between gap-3">
            <span className="text-[12.5px] font-bold">
              {review.current ? v.reviewSoFar(monthName(review.target.start)) : v.reviewCard(monthName(review.target.start))}
            </span>
            <span className="flex items-center gap-0.5 text-[12.5px] font-bold text-mute">
              {v.view}
              <Icon name="chev" size={14} />
            </span>
          </span>
          <span className="mt-2 flex items-end justify-between gap-3">
            <span className="min-w-0">
              {review.target.rate === null ? (
                <span className="block text-[56px] font-extrabold leading-none tracking-[-0.04em] text-mute">—</span>
              ) : (
                <span className="block text-[56px] font-extrabold leading-none tracking-[-0.04em] tabular-nums">
                  {review.target.rate}
                  <span className="text-[26px] text-mute">%</span>
                </span>
              )}
              <span className="mt-1 block text-[12.5px] font-bold text-mute">{v.rate}</span>
            </span>
            <span className="flex min-w-0 flex-col items-end gap-2 text-right">
              {reviewChange !== null && (
                <span
                  className={`rounded-full px-3 py-1 text-[12.5px] font-extrabold ${
                    reviewChange > 0 ? 'bg-mint text-pos' : reviewChange < 0 ? 'bg-peach text-neg' : 'bg-line/10 text-mute'
                  }`}
                >
                  {v.vsMonth(reviewChange, monthName(review.prior.start))}
                </span>
              )}
              <span className="text-[12px] font-medium text-mute">
                {review.target.incomeCents > 0 ? v.savedIncome(money(review.target.savedCents), money(review.target.incomeCents)) : v.noIncomeYet}
              </span>
            </span>
          </span>
        </button>
      )}

      <div className="mt-5 flex items-baseline justify-between gap-3 px-1">
        <p className="min-w-0 truncate text-[15px] font-extrabold">{range.label}</p>
        <p className="shrink-0 text-[12.5px] font-bold text-mute">{r.days(range.days)}</p>
      </div>

      {/* The four headline numbers. */}
      <div className="mt-2.5 grid grid-cols-2 gap-2.5">
        <div className="min-w-0 rounded-3xl bg-card p-4">
          <p className="text-[12px] font-bold text-mute">{v.intoGoalsTile}</p>
          <Amount cents={figures.putInCents} size="md" className="mt-1" />
          <p className={`mt-1 text-[12px] font-semibold ${change === null ? 'text-mute' : change >= 0 ? 'text-pos' : 'text-neg'}`}>
            {change === null
              ? range.previous
                ? r.nothingPrevious
                : r.everythingOnRecord
              : r.vsPrevious(`${change >= 0 ? '+' : ''}${change}`)}
          </p>
        </div>
        <div className="min-w-0 rounded-3xl bg-card p-4">
          <p className="text-[12px] font-bold text-mute">{r.perDay}</p>
          <Amount cents={perDay} size="md" className="mt-1" />
          <p className="mt-1 text-[12px] font-semibold text-mute">{r.transactions(summary.transactions)}</p>
        </div>
        <div className="min-w-0 rounded-3xl bg-card p-4">
          <p className="text-[12px] font-bold text-mute">{r.topGoal}</p>
          {top ? (
            <>
              <p className="mt-1 truncate text-[17px] font-extrabold">{top.bank.name}</p>
              <p className="mt-1 flex items-center gap-2 text-[12px] font-semibold text-mute">
                <span className="rounded-full bg-mint px-2 py-0.5 font-extrabold text-pos">{percent(top.credited, creditedTotal)}%</span>
                {money(top.credited)}
              </p>
            </>
          ) : (
            <p className="mt-2 text-[13px] font-semibold text-mute">{r.noDepositsYet}</p>
          )}
        </div>
        <div className="min-w-0 rounded-3xl bg-card p-4">
          <p className="text-[12px] font-bold text-mute">{r.allGoals}</p>
          {summary.collective.funded === null ? (
            <p className="mt-2 text-[13px] font-semibold text-mute">{r.noTargetSet}</p>
          ) : (
            <>
              <p className="mt-1 text-[22px] font-extrabold tabular-nums text-pos">{summary.collective.funded}%</p>
              <p className="mt-1 text-[12px] font-semibold text-mute">{r.reachedOf(summary.collective.reached, summary.collective.goals)}</p>
            </>
          )}
        </div>
      </div>

      {/* Where the money went, with every line a number the ledger holds. */}
      <Heading title={r.inAndOut} hint={r.inAndOutHint} className="mt-7" />
      <Card className="mt-2.5 !py-3">
        <Line label={v.income} cents={figures.incomeCents} />
        {summary.repaid > 0 && <Line label={r.coveredEarlier} cents={-Math.round(summary.repaid * 100)} muted />}
        <Line label={v.intoGoals} cents={figures.putInCents} />
        {figures.spentCents > 0 && (
          <>
            <Line label={r.spent} cents={-figures.spentCents} />
            {figures.spentFromWalletCents > 0 && <Line label={v.fromWallet} cents={-figures.spentFromWalletCents} sub />}
            {figures.spentFromGoalsCents > 0 && <Line label={v.fromGoals} cents={-figures.spentFromGoalsCents} sub />}
            {summary.borrowed > 0 && <Line label={t.common.spentAhead} cents={-Math.round(summary.borrowed * 100)} sub />}
          </>
        )}
        {summary.invested > 0 && <Line label={r.movedIntoShares} cents={-Math.round(summary.invested * 100)} />}
        {summary.cameBack > 0 && (
          <>
            <Line label={r.cameBackFromShares} cents={Math.round(summary.cameBack * 100)} />
            {sharesToDebt > 0 && <Line label={r.coveredEarlier} cents={-Math.round(sharesToDebt * 100)} sub />}
          </>
        )}
        <Line label={r.goalsGrewBy} cents={grewBy} rule strong />
        <Line label={v.walletNow} cents={walletCents} strong />
        {(summary.invested > 0 || summary.cameBack > 0) && (
          <p className="mt-3 text-[11.5px] font-medium leading-relaxed text-mute">{r.sharesNote}</p>
        )}
        {summary.borrowed > 0 && <p className="mt-3 text-[11.5px] font-medium leading-relaxed text-mute">{r.borrowNote}</p>}
      </Card>

      {spending.length > 0 && (
        <>
          <Heading title={r.whereItWent} hint={r.spentInPeriod(money(spentTotal))} className="mt-7" />
          <Card className="mt-2.5">
            <div className="flex h-3.5 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={r.whereItWent}>
              {spending.map((row, i) => (
                <i
                  key={row.key}
                  className={`block h-full min-w-[3px] ${CAT_BG[i % CAT_BG.length]}`}
                  style={{ width: `${(row.cents / spentTotal) * 100}%` }}
                />
              ))}
            </div>

            {totalRow && totalRow.limitCents !== null && (
              <div className="mt-4 rounded-2xl bg-line/5 px-4 py-3">
                <div className="flex items-baseline justify-between gap-3 text-[14px] font-extrabold">
                  <span>{v.totalBudget}</span>
                  <span className="tabular-nums">
                    {v.usedOf(money(totalRow.spentCents), money(totalRow.limitCents))}
                  </span>
                </div>
                <Meter percent={totalRow.used ?? 0} status={totalRow.status} label={v.totalBudget} className="mt-2" />
                <p className={`mt-1.5 text-[12px] font-semibold ${totalRow.status === 'over' ? 'text-neg' : 'text-mute'}`}>
                  {(totalRow.leftCents ?? 0) >= 0 ? v.budgetLeft(money(totalRow.leftCents ?? 0)) : v.budgetOver(money(-(totalRow.leftCents ?? 0)))}
                </p>
              </div>
            )}

            <div className="mt-2 divide-y divide-line/10">
              {spending.map((row, i) => {
                const lim = limitOf(row.key);
                const limited = lim && lim.limitCents !== null;
                return (
                  <div key={row.key} className="py-3">
                    <div className="flex items-center gap-2.5">
                      <span className={`size-2.5 shrink-0 rounded-full ${CAT_BG[i % CAT_BG.length]}`} />
                      <span className="min-w-0 flex-1 truncate text-[14.5px] font-bold">
                        {categoryOf(row.key).label}
                        {limited && (
                          <span
                            className={`ml-2 rounded-full px-2 py-0.5 align-middle text-[10.5px] font-extrabold ${
                              lim.status === 'over' ? 'bg-peach text-neg' : lim.status === 'near' ? 'bg-sun' : 'bg-mint text-pos'
                            }`}
                          >
                            {lim.status === 'over' ? v.overTag : v.usedPct(lim.used ?? 0)}
                          </span>
                        )}
                      </span>
                      <span className={`shrink-0 whitespace-nowrap text-[14.5px] font-extrabold tabular-nums ${lim?.status === 'over' ? 'text-neg' : ''}`}>
                        {money(row.cents)}
                      </span>
                    </div>
                    {limited && <Meter percent={lim.used ?? 0} status={lim.status} label={categoryOf(row.key).label} className="ml-5 mt-2" />}
                    <div className="ml-5 mt-1 flex justify-between gap-3 text-[12px] font-medium text-mute">
                      <span className="min-w-0 truncate">
                        {limited
                          ? `${v.budgetOf(money(lim.limitCents ?? 0))} · ${
                              (lim.leftCents ?? 0) >= 0 ? v.budgetLeft(money(lim.leftCents ?? 0)) : v.budgetOver(money(-(lim.leftCents ?? 0)))
                            }`
                          : isMonth
                            ? v.noBudget
                            : ''}
                      </span>
                      <span className="shrink-0">{v.shareTimes(row.share, r.times(row.entries))}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {isMonth && (
              <button
                type="button"
                onClick={onOpenBudgets}
                className="mt-2 inline-flex min-h-11 items-center gap-1 rounded-full bg-line/10 px-4 text-[13.5px] font-extrabold active:opacity-80"
              >
                {Object.keys(budgets.categories).length === 0 && budgets.total.length === 0 ? v.setBudgets : v.allBudgets}
                <Icon name="chev" size={16} />
              </button>
            )}
          </Card>
        </>
      )}

      {/* Where this period's deposits went. */}
      <Heading title={r.allocation} hint={r.allocationHint} className="mt-7" />
      <Card className="mt-2.5 !py-2">
        {bankStats.length === 0 && <p className="py-4 text-center text-[13px] font-medium text-mute">{r.noGoalsYet}</p>}
        <div className="divide-y divide-line/10">
          {bankStats.map((s, i) => {
            const width = s.funded === null ? 0 : Math.min(100, Math.max(0, s.funded));
            return (
              <div key={s.bank.id} className="py-3">
                <div className="flex items-center gap-3">
                  <span className={`grid size-9 shrink-0 place-items-center rounded-xl text-ink ${TINT_BG[i % TINT_BG.length]}`}>
                    <span className="material-symbols-rounded text-[20px]">{safeGoalIcon(s.bank.icon)}</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-[14.5px] font-bold">{s.bank.name}</span>
                      {s.credited > 0 && (
                        <span className="shrink-0 rounded-full bg-line/10 px-2 py-0.5 text-[10.5px] font-extrabold">
                          {percent(s.credited, creditedTotal)}%
                        </span>
                      )}
                    </span>
                    <span className="block truncate text-[11.5px] font-medium text-mute">
                      {s.credited > 0 ? r.credited(money(s.credited)) : r.nothingCredited}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    {s.funded === null ? (
                      <span className="text-[13px] font-bold text-mute">{formatMoney(s.bank.currentAmount, { decimals: 0 })}</span>
                    ) : (
                      <>
                        <span className={`block text-[14.5px] font-extrabold tabular-nums ${s.bank.currentAmount < 0 ? 'text-neg' : ''}`}>
                          {s.funded}%
                        </span>
                        <span className="block text-[11px] font-medium text-mute">{r.ofTarget(formatMoney(s.bank.targetAmount, { decimals: 0 }))}</span>
                      </>
                    )}
                  </span>
                </div>
                {s.funded !== null && (
                  <div className="ml-12 mt-2.5 h-2 overflow-hidden rounded-full bg-line/10">
                    <div className={`h-full rounded-full ${CAT_BG[s.index % CAT_BG.length]}`} style={{ width: `${width}%` }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {/* How regularly money is reaching the goals. */}
      <Heading title={r.pacing} hint={r.pacingHint} className="mt-7" />
      <div className="mt-2.5 grid grid-cols-3 gap-2.5">
        {[
          {
            // Only a window of history is loaded, so a streak reaching its first day may be longer than it can be counted to.
            value: streak.capped ? r.streakAtLeast(streak.days) : r.streakValue(streak.days),
            label: r.streak,
          },
          { value: `${summary.activeDays}/${range.days}`, label: r.daysSaved },
          { value: formatMoney(summary.maxDay, { decimals: 0 }), label: r.bestDay },
        ].map((s) => (
          <div key={s.label} className="min-w-0 rounded-3xl bg-card px-2 py-4 text-center">
            <p className="truncate text-[18px] font-extrabold tabular-nums">{s.value}</p>
            <p className="mt-0.5 truncate text-[11.5px] font-bold text-mute">{s.label}</p>
          </div>
        ))}
      </div>
      <Card className="mt-2.5">
        <div className="flex h-[8.5rem] items-end gap-1.5 pt-6">
          {summary.buckets.map((b, i) => {
            const h = maxBucket > 0 ? Math.max(b.amount > 0 ? 6 : 2, (b.amount / maxBucket) * 100) : 2;
            const on = picked === i;
            return (
              <button
                key={`${b.label}-${i}`}
                type="button"
                onClick={() => setPicked(on ? null : i)}
                aria-pressed={on}
                aria-label={`${b.label}: ${formatMoney(b.amount)}`}
                className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5"
              >
                <span className="relative flex w-full flex-1 items-end">
                  {on && (
                    <span
                      className="absolute left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-lg bg-cta px-2 py-1 text-[10.5px] font-extrabold text-cta-fg"
                      // A full-height bar would push the readout out of the card, so it sits just inside the top instead.
                      style={{ bottom: `calc(${Math.min(h, 92)}% + 5px)` }}
                    >
                      {formatMoney(b.amount)}
                    </span>
                  )}
                  <span
                    className={`block w-full rounded-t-lg ${b.amount > 0 ? 'bg-pos' : 'bg-line/10'} ${b.current || on ? '' : 'opacity-60'}`}
                    style={{ height: `${h}%` }}
                  />
                </span>
                <span className={`${summary.buckets.length > 8 ? 'text-[9px]' : 'text-[10.5px]'} font-extrabold ${on ? 'text-ink' : b.current ? 'text-pos' : 'text-mute'}`}>
                  {b.label}
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-center text-[11.5px] font-semibold text-mute">
          {picked === null
            ? r.bestAndTotal(formatMoney(maxBucket), formatMoney(summary.distributed))
            : r.pickedBar(summary.buckets[picked].label, formatMoney(summary.buckets[picked].amount))}
        </p>
      </Card>

      {/* Forecast */}
      <div className="mt-2.5 rounded-3xl bg-mint p-5">
        <p className="flex items-center gap-2 text-[12.5px] font-extrabold">
          <Icon name="spark" size={16} />
          {r.forecast}
        </p>
        {forecast ? (
          <>
            <p className="mt-2 text-[15.5px] font-bold leading-relaxed">
              {r.pace.lead}
              <b className="font-extrabold">{r.pace.rate(formatMoney(forecast.dailyRate))}</b>
              {r.pace.into}
              <b className="font-extrabold">{forecast.name}</b>
              {r.pace.reach}
              <b className="font-extrabold">{r.pace.days(forecast.days)}</b>
              {r.pace.tail(longDate(forecast.date))}
            </p>
            <p className="mt-2 text-[12.5px] font-medium text-mute">
              {r.stillToGo(formatMoney(forecast.remaining), PERIODS.find((p) => p.key === period)?.label ?? '')}
            </p>
          </>
        ) : (
          <p className="mt-2 text-[13.5px] font-medium leading-relaxed text-mute">{r.noPace}</p>
        )}
      </div>

      {/* Actions */}
      <Button className="mt-6" onClick={onOpenStrategy}>
        <Icon name="pie" size={18} />
        {r.adjustSplit}
      </Button>
      <button
        type="button"
        onClick={onOpenStatements}
        className="mt-2.5 flex w-full items-center gap-3 rounded-3xl bg-card p-4 text-left active:opacity-80"
      >
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-mint">
          <Icon name="doc" size={20} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14.5px] font-extrabold">{r.statements}</span>
          <span className="mt-0.5 block text-[12px] font-medium leading-snug text-mute">{r.statementsHint}</span>
        </span>
        <Icon name="chev" size={18} className="text-mute" />
      </button>
      <p className="mt-4 px-2 text-center text-[11.5px] font-medium leading-relaxed text-mute">{r.periodNote}</p>
    </>
  );
};

export default Report;
