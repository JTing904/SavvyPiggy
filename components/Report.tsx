import React, { useMemo, useState } from 'react';
import type { Activity, Budgets, PiggyBank } from '../types';
import { PERIODS, forecastFor, spendingByCategory, summarize, type Period, type StreakRun } from '../services/analytics';
import { budgetRows, TOTAL, type BudgetRow } from '../services/budgets';
import { categoryOf } from '../services/categories';
import { safeGoalIcon } from '../services/goalIcons';
import { formatMoney, fromCents } from '../services/money';
import type { TrendPoint } from '../services/netWorth';
import { reportNeedsFrom } from '../services/ledgerWindow';
import { addMonthsTo, centsChange, creditedByGoal, figuresFor, monthFigures, monthKeyOf, monthStartOf, pointsChange } from '../services/review';
import { useLedgerRange, type Ledger } from '../hooks/useOlderLedger';
import { useT } from '../contexts/LanguageContext';
import { dateLocale } from '../i18n';
import { PageBand } from './ui/PageBand';
import { Bar, Donut, LineChart, Ring, type ChartColor } from './ui/Charts';
import { EmptyState } from './ui/EmptyState';
import { Group } from './ui/Group';
import { Icon } from './ui/Icon';
import { IconTile, TINT_ORDER, type IconTint } from './ui/IconTile';
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
  onBack: () => void;
  onOpenStrategy: () => void;
  /** The empty report's one action. */
  onDeposit?: () => void;
  onOpenStatements: () => void;
  /** Opens the full review of the month starting on this day. */
  onOpenReview: (month: Date) => void;
  onOpenBudgets: () => void;
  /** What is known less what is owed, the two sides of it, and how it has moved. */
  netWorth: { totalCents: number; changeCents: number | null; assetsCents: number; debtsCents: number; trend: TrendPoint[] };
  onOpenNetWorth: () => void;
}

const longDate = (d: Date) => d.toLocaleDateString(dateLocale('en-US'), { month: 'short', day: 'numeric', year: 'numeric' });

/** A chart colour in the order the tiles take theirs, so a row and its slice match. */
const colorAt = (i: number) => ((i % 5) + 1) as ChartColor;

const Card: React.FC<{ className?: string; children: React.ReactNode }> = ({ className = '', children }) => (
  <div className={`rounded-3xl bg-card p-3.5 ${className}`}>{children}</div>
);

const Heading: React.FC<{ title: string; hint?: string }> = ({ title, hint }) => (
  <div className="mt-3 px-1">
    <h2 className="text-[15px] font-bold">{title}</h2>
    {hint && <p className="text-[12.5px] font-medium text-mute">{hint}</p>}
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
    className={`flex items-baseline justify-between gap-3 ${rule ? 'mt-1.5 border-t border-line/10 pt-2.5' : ''} ${
      sub ? 'py-0.5 pl-4 text-[12.5px]' : strong ? 'py-1 text-[15px]' : 'py-1 text-[14px]'
    }`}
  >
    <span className={`min-w-0 ${strong ? 'font-bold' : sub || muted ? 'font-medium text-mute' : 'font-semibold'}`}>{label}</span>
    <span className={`shrink-0 whitespace-nowrap tabular-nums ${strong ? 'font-bold' : sub || muted ? 'font-semibold text-mute' : 'font-bold'}`}>
      {formatMoney(fromCents(cents), { signed: false })}
    </span>
  </div>
);

/** A place to go from here. */
const LinkRow: React.FC<{ icon: string; tint: IconTint; title: string; sub?: React.ReactNode; onClick: () => void }> = ({ icon, tint, title, sub, onClick }) => (
  <button type="button" onClick={onClick} className="flex min-h-14 w-full items-center gap-2.5 py-2 text-left active:opacity-70">
    <IconTile icon={icon} tint={tint} size={38} />
    <span className="min-w-0 flex-1">
      <span className="block text-[14.5px] font-bold">{title}</span>
      {sub && <span className="block text-[12.5px] font-semibold leading-snug text-mute">{sub}</span>}
    </span>
    <Icon name="chev" size={18} strokeWidth={2} className="text-mute" />
  </button>
);

const percent = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

const Report: React.FC<ReportProps> = ({
  banks,
  activities,
  ledger,
  streak,
  budgets,
  walletCents,
  onBack,
  onOpenStrategy,
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
  const p = t.pro.report;

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
          funded: b.targetAmount > 0 ? Math.floor((b.currentAmount / b.targetAmount) * 100) : null,
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
  const plain = (cents: number) => formatMoney(fromCents(cents), { symbol: false });

  const head = (
    <div role="tablist" aria-label={v.period} className="flex gap-0.5 rounded-[10px] bg-card p-0.5">
      {PERIODS.map((option) => {
        const on = option.key === period;
        return (
          <button
            key={option.key}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => {
              setPeriod(option.key);
              setPicked(null);
            }}
            className={`min-h-11 min-w-0 flex-1 whitespace-nowrap rounded-lg px-1 text-[13px] font-bold ${on ? 'bg-page text-ink' : 'text-mute'}`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );

  const frame = (children: React.ReactNode) => (
    <div className="flex min-h-full flex-col pb-10 font-figtree text-ink">
      <PageBand title={r.title} onBack={onBack} overlap={16} trailing={<span className="min-w-0 truncate text-[14px] font-bold">{range.label}</span>} />
      <div className="-mt-[58px] flex flex-col gap-2.5 px-4">{children}</div>
    </div>
  );

  // Nothing is summed from part of a period: until its older records are
  // here, the figures wait rather than read as a smaller total.
  if (older !== 'ready') {
    return frame(
      <>
        {head}
        <Notice status={older} onRetry={ledger.retry} />
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
          className="mt-6"
        />
      </>
    );
  }

  const monthName = (d: Date) => r.monthsLong[d.getMonth()];
  const reviewChange = review ? pointsChange(review.target.rate, review.prior.rate) : null;
  const rate = figures.rate;
  // A month the app was not opened has no point; the ticks name the months that do.
  const trend = netWorth.trend.flatMap((point) => (point.cents === null ? [] : [{ value: point.cents, label: r.monthsShort[Number(point.month.slice(5, 7)) - 1] }]));
  const ticks = trend.length < 2 ? [] : [trend[0].label, ...(trend.length > 2 ? [trend[Math.floor((trend.length - 1) / 2)].label] : []), trend[trend.length - 1].label];

  return frame(
    <>
      {/* What came in, and how much of it was kept. */}
      <div className="flex items-center gap-4 rounded-3xl bg-card p-3.5 shadow-[0_2px_10px_rgba(20,35,58,0.1)]">
        <Ring percent={rate} color={rate !== null && rate < 0 ? 4 : 1} size={96} width={11} label={rate === null ? v.rate : `${v.rate} ${rate}%`}>
          <span className={`block text-[20px] font-bold leading-tight tabular-nums ${rate !== null && rate < 0 ? 'text-neg' : ''}`}>{rate === null ? '—' : `${rate}%`}</span>
          <span className="block text-[11px] font-semibold leading-tight text-mute">{v.rate}</span>
        </Ring>
        <div className="min-w-0 flex-1 text-[14px] font-semibold tabular-nums">
          {[
            { label: v.income, cents: figures.incomeCents },
            { label: r.spent, cents: figures.spentCents },
            { label: v.intoGoals, cents: figures.putInCents },
          ].map((row) => (
            <div key={row.label} className="flex items-baseline justify-between gap-2 py-1">
              <span className="min-w-0 truncate text-mute">{row.label}</span>
              <span className="shrink-0 font-bold">{plain(row.cents)}</span>
            </div>
          ))}
        </div>
      </div>

      {spending.length > 0 && (
        <div className="rounded-3xl bg-card p-3.5">
          <h2 className="text-[15px] font-bold">{r.whereItWent}</h2>
          <div className="mb-1 mt-2 flex justify-center">
            <Donut
              slices={spending.map((row, i) => ({ value: row.cents, color: colorAt(i) }))}
              size={170}
              width={20}
              label={p.donut(money(spentTotal), spending.slice(0, 5).map((row) => `${categoryOf(row.key).label} ${row.share}%`).join('，'))}
            >
              <span className="block text-[12px] font-semibold text-mute">{p.totalSpent}</span>
              <span className="block text-[17px] font-bold tabular-nums">{plain(spentTotal)}</span>
            </Donut>
          </div>

          {totalRow && totalRow.limitCents !== null && (
            <div className="my-2 rounded-2xl bg-page px-3.5 py-2.5">
              <div className="flex items-baseline justify-between gap-3 text-[14px] font-bold">
                <span>{v.totalBudget}</span>
                <span className="tabular-nums">{v.usedOf(money(totalRow.spentCents), money(totalRow.limitCents))}</span>
              </div>
              <Meter percent={totalRow.used ?? 0} status={totalRow.status} label={v.totalBudget} className="mt-2" />
              <p className={`mt-1.5 text-[12.5px] font-semibold ${totalRow.status === 'over' ? 'text-neg' : 'text-mute'}`}>
                {(totalRow.leftCents ?? 0) >= 0 ? v.budgetLeft(money(totalRow.leftCents ?? 0)) : v.budgetOver(money(-(totalRow.leftCents ?? 0)))}
              </p>
            </div>
          )}

          {spending.map((row, i) => {
            const lim = limitOf(row.key);
            const limited = lim && lim.limitCents !== null;
            const category = categoryOf(row.key);
            return (
              <div key={row.key} className="flex min-h-14 items-center gap-2.5 py-1.5">
                <IconTile
                  icon={<span className="material-symbols-rounded text-[20px] leading-none">{category.icon}</span>}
                  tint={TINT_ORDER[i % TINT_ORDER.length]}
                  size={38}
                  round
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2 text-[14.5px] font-bold tabular-nums">
                    <span className="min-w-0 truncate">
                      {category.label} <span className="text-[12.5px] font-semibold text-mute">{row.share}%</span>
                      {limited && (
                        <span
                          className={`ml-1.5 rounded-md px-1.5 py-0.5 align-middle text-[11.5px] font-bold ${
                            lim.status === 'over' ? 'bg-peach text-neg' : lim.status === 'near' ? 'bg-sun' : 'bg-mint text-pos'
                          }`}
                        >
                          {lim.status === 'over' ? v.overTag : v.usedPct(lim.used ?? 0)}
                        </span>
                      )}
                    </span>
                    <span className={`shrink-0 ${lim?.status === 'over' ? 'text-neg' : ''}`}>{plain(row.cents)}</span>
                  </span>
                  <Bar percent={row.share} color={colorAt(i)} height={6} className="mt-1.5" />
                  <span className="mt-1 flex justify-between gap-3 text-[12px] font-semibold text-mute">
                    <span className="min-w-0 truncate">
                      {limited
                        ? `${v.budgetOf(money(lim.limitCents ?? 0))} · ${
                            (lim.leftCents ?? 0) >= 0 ? v.budgetLeft(money(lim.leftCents ?? 0)) : v.budgetOver(money(-(lim.leftCents ?? 0)))
                          }`
                        : isMonth
                          ? v.noBudget
                          : ''}
                    </span>
                    <span className="shrink-0">{r.times(row.entries)}</span>
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* What is known less what is owed. */}
      <div className="rounded-3xl bg-card p-3.5">
        <button type="button" onClick={onOpenNetWorth} className="block min-h-11 w-full text-left active:opacity-70">
          <span className="flex items-baseline justify-between gap-3">
            <span className="text-[13.5px] font-semibold text-mute">{t.net.cardTitle}</span>
            <span className="flex items-center gap-0.5 text-[13.5px] font-bold text-tblue">
              {t.net.view}
              <Icon name="chev" size={15} strokeWidth={2} />
            </span>
          </span>
          <span className={`mt-0.5 block text-[26px] font-bold leading-tight tabular-nums ${netWorth.totalCents < 0 ? 'text-neg' : ''}`}>{money(netWorth.totalCents)}</span>
          <span className="mt-1 flex flex-wrap gap-x-4 text-[13px] font-semibold tabular-nums text-mute">
            <span>{p.assets(plain(netWorth.assetsCents))}</span>
            <span>{p.debts(plain(netWorth.debtsCents))}</span>
          </span>
        </button>
        {trend.length >= 2 && (
          <div className="mt-2.5">
            <LineChart
              points={trend}
              ticks={ticks}
              height={92}
              format={(cents) => formatMoney(fromCents(cents), { decimals: 0 })}
              label={p.netTrend(money(netWorth.totalCents))}
            />
          </div>
        )}
        {netWorth.changeCents !== null && (
          <p
            className={`mt-2 inline-block rounded-full px-3 py-1 text-[12.5px] font-bold ${
              netWorth.changeCents > 0 ? 'bg-mint text-pos' : netWorth.changeCents < 0 ? 'bg-peach text-neg' : 'bg-page text-mute'
            }`}
          >
            {netWorth.changeCents > 0
              ? t.net.betterBy(money(netWorth.changeCents))
              : netWorth.changeCents < 0
                ? t.net.worseBy(money(-netWorth.changeCents))
                : t.net.sameAs}
          </p>
        )}
        <p className="mt-2 text-[12.5px] font-medium text-mute">{t.net.cardNote}</p>
      </div>

      {/* Everything else, quieter: which period the figures are for, then the detail under them. */}
      <div className="mt-3">{head}</div>

      <div className="flex items-baseline justify-between gap-3 px-1">
        <p className="min-w-0 truncate text-[15px] font-bold">{range.label}</p>
        <p className="shrink-0 text-[12.5px] font-semibold text-mute">{r.days(range.days)}</p>
      </div>

      {/* The four headline numbers. */}
      <div className="grid grid-cols-2 gap-2">
        <div className="min-w-0 rounded-3xl bg-card p-3.5">
          <p className="text-[12.5px] font-semibold text-mute">{v.intoGoalsTile}</p>
          <p className="mt-0.5 truncate text-[18px] font-bold tabular-nums">{money(figures.putInCents)}</p>
          <p className={`mt-0.5 text-[12.5px] font-semibold ${change === null ? 'text-mute' : change >= 0 ? 'text-pos' : 'text-neg'}`}>
            {change === null
              ? range.previous
                ? r.nothingPrevious
                : r.everythingOnRecord
              : r.vsPrevious(`${change >= 0 ? '+' : ''}${change}`)}
          </p>
        </div>
        <div className="min-w-0 rounded-3xl bg-card p-3.5">
          <p className="text-[12.5px] font-semibold text-mute">{r.perDay}</p>
          <p className="mt-0.5 truncate text-[18px] font-bold tabular-nums">{money(perDay)}</p>
          <p className="mt-0.5 text-[12.5px] font-semibold text-mute">{r.transactions(summary.transactions)}</p>
        </div>
        <div className="min-w-0 rounded-3xl bg-card p-3.5">
          <p className="text-[12.5px] font-semibold text-mute">{r.topGoal}</p>
          {top ? (
            <>
              <p className="mt-0.5 truncate text-[17px] font-bold">{top.bank.name}</p>
              <p className="mt-0.5 flex items-center gap-2 text-[12.5px] font-semibold tabular-nums text-mute">
                <span className="rounded-md bg-mint px-1.5 py-0.5 font-bold text-pos">{percent(top.credited, creditedTotal)}%</span>
                {money(top.credited)}
              </p>
            </>
          ) : (
            <p className="mt-1.5 text-[13px] font-semibold text-mute">{r.noDepositsYet}</p>
          )}
        </div>
        <div className="min-w-0 rounded-3xl bg-card p-3.5">
          <p className="text-[12.5px] font-semibold text-mute">{r.allGoals}</p>
          {summary.collective.funded === null ? (
            <p className="mt-1.5 text-[13px] font-semibold text-mute">{r.noTargetSet}</p>
          ) : (
            <>
              <p className="mt-0.5 text-[18px] font-bold tabular-nums text-pos">{summary.collective.funded}%</p>
              <p className="mt-0.5 text-[12.5px] font-semibold text-mute">{r.reachedOf(summary.collective.reached, summary.collective.goals)}</p>
            </>
          )}
        </div>
      </div>

      {/* Where the money went, with every line a number the ledger holds. */}
      <Heading title={r.inAndOut} hint={r.inAndOutHint} />
      <Card className="!py-2.5">
        <Line label={v.income} cents={figures.incomeCents} />
        {summary.repaid > 0 && <Line label={r.coveredEarlier} cents={Math.round(summary.repaid * 100)} muted />}
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
          <p className="mt-2 text-[12.5px] font-medium leading-relaxed text-mute">{r.sharesNote}</p>
        )}
        {summary.borrowed > 0 && <p className="mt-2 text-[12.5px] font-medium leading-relaxed text-mute">{r.borrowNote}</p>}
      </Card>

      {/* Where this period's deposits went. */}
      <Heading title={r.allocation} hint={r.allocationHint} />
      <div className="divide-y divide-line/10 rounded-3xl bg-card px-3.5 py-1">
        {bankStats.length === 0 && <p className="py-4 text-center text-[13px] font-medium text-mute">{r.noGoalsYet}</p>}
        {bankStats.map((s) => (
          <div key={s.bank.id} className="flex min-h-14 items-center gap-2.5 py-2">
            <IconTile
              icon={<span className="material-symbols-rounded text-[20px] leading-none">{safeGoalIcon(s.bank.icon)}</span>}
              tint={TINT_ORDER[s.index % TINT_ORDER.length]}
              size={38}
            />
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-2 text-[14.5px] font-bold tabular-nums">
                <span className="min-w-0 truncate">
                  {s.bank.name}
                  {s.credited > 0 && <span className="ml-1.5 text-[12.5px] font-semibold text-mute">{percent(s.credited, creditedTotal)}%</span>}
                </span>
                {s.funded === null ? (
                  <span className="shrink-0 text-[13px] font-semibold text-mute">{formatMoney(s.bank.currentAmount, { decimals: 0 })}</span>
                ) : (
                  <span className={`shrink-0 ${s.bank.currentAmount < 0 ? 'text-neg' : ''}`}>{s.funded}%</span>
                )}
              </span>
              {s.funded !== null && <Bar percent={s.funded} color={colorAt(s.index)} height={6} className="mt-1.5" />}
              <span className="mt-1 flex justify-between gap-3 text-[12px] font-semibold text-mute">
                <span className="min-w-0 truncate">{s.credited > 0 ? r.credited(money(s.credited)) : r.nothingCredited}</span>
                {s.funded !== null && <span className="shrink-0">{r.ofTarget(formatMoney(s.bank.targetAmount, { decimals: 0 }))}</span>}
              </span>
            </span>
          </div>
        ))}
      </div>

      {/* How regularly money is reaching the goals. */}
      <Heading title={r.pacing} hint={r.pacingHint} />
      <div className="grid grid-cols-3 gap-2">
        {[
          {
            // Only a window of history is loaded, so a streak reaching its first day may be longer than it can be counted to.
            value: streak.capped ? r.streakAtLeast(streak.days) : r.streakValue(streak.days),
            label: r.streak,
          },
          { value: `${summary.activeDays}/${range.days}`, label: r.daysSaved },
          { value: formatMoney(summary.maxDay, { decimals: 0 }), label: r.bestDay },
        ].map((s) => (
          <div key={s.label} className="min-w-0 rounded-3xl bg-card px-2 py-3 text-center">
            <p className="truncate text-[16px] font-bold tabular-nums">{s.value}</p>
            <p className="mt-0.5 truncate text-[12px] font-semibold text-mute">{s.label}</p>
          </div>
        ))}
      </div>
      <Card>
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
                      className="absolute left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-lg bg-cta px-2 py-1 text-[11px] font-bold text-cta-fg"
                      // A full-height bar would push the readout out of the card, so it sits just inside the top instead.
                      style={{ bottom: `calc(${Math.min(h, 92)}% + 5px)` }}
                    >
                      {formatMoney(b.amount)}
                    </span>
                  )}
                  <span
                    className={`block w-full rounded-t-md ${b.amount > 0 ? 'bg-c1' : 'bg-track'} ${b.current || on ? '' : 'opacity-50'}`}
                    style={{ height: `${h}%` }}
                  />
                </span>
                <span className={`${summary.buckets.length > 8 ? 'text-[9px]' : 'text-[11px]'} font-bold ${on ? 'text-ink' : b.current ? 'text-tblue' : 'text-mute'}`}>
                  {b.label}
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-2.5 text-center text-[12.5px] font-semibold text-mute">
          {picked === null
            ? r.bestAndTotal(formatMoney(maxBucket), formatMoney(summary.distributed))
            : r.pickedBar(summary.buckets[picked].label, formatMoney(summary.buckets[picked].amount))}
        </p>
      </Card>

      {/* Forecast */}
      <Card>
        <p className="flex items-center gap-2 text-[13.5px] font-bold">
          <Icon name="spark" size={16} strokeWidth={2} className="text-tamber" />
          {r.forecast}
        </p>
        {forecast ? (
          <>
            <p className="mt-1.5 text-[14px] font-semibold leading-relaxed">
              {r.pace.lead}
              <b className="font-bold">{r.pace.rate(formatMoney(forecast.dailyRate))}</b>
              {r.pace.into}
              <b className="font-bold">{forecast.name}</b>
              {r.pace.reach}
              <b className="font-bold">{r.pace.days(forecast.days)}</b>
              {r.pace.tail(longDate(forecast.date))}
            </p>
            <p className="mt-1.5 text-[12.5px] font-medium text-mute">
              {r.stillToGo(formatMoney(forecast.remaining), PERIODS.find((option) => option.key === period)?.label ?? '')}
            </p>
          </>
        ) : (
          <p className="mt-1.5 text-[13px] font-medium leading-relaxed text-mute">{r.noPace}</p>
        )}
      </Card>

      {/* Where to go from here. */}
      <Group>
        {review && (
          <LinkRow
            icon="chart"
            tint="blue"
            title={review.current ? v.reviewSoFar(monthName(review.target.start)) : v.reviewCard(monthName(review.target.start))}
            sub={
              <>
                <span className="block tabular-nums">
                  {v.rate} {review.target.rate === null ? '—' : `${review.target.rate}%`}
                  {reviewChange !== null && (
                    <span className={reviewChange > 0 ? 'text-pos' : reviewChange < 0 ? 'text-neg' : ''}> · {v.vsMonth(reviewChange, monthName(review.prior.start))}</span>
                  )}
                </span>
                <span className="block tabular-nums">
                  {review.target.incomeCents > 0 ? v.savedIncome(money(review.target.savedCents), money(review.target.incomeCents)) : v.noIncomeYet}
                </span>
              </>
            }
            onClick={() => onOpenReview(review.target.start)}
          />
        )}
        {isMonth && spending.length > 0 && (
          <LinkRow
            icon="wallet"
            tint="amber"
            title={Object.keys(budgets.categories).length === 0 && budgets.total.length === 0 ? v.setBudgets : v.allBudgets}
            onClick={onOpenBudgets}
          />
        )}
        <LinkRow icon="pie" tint="teal" title={r.adjustSplit} onClick={onOpenStrategy} />
        <LinkRow icon="doc" tint="violet" title={r.statements} sub={r.statementsHint} onClick={onOpenStatements} />
      </Group>
      <p className="px-2 text-center text-[12.5px] font-medium leading-relaxed text-mute">{r.periodNote}</p>
    </>
  );
};

export default Report;
