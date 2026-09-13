import React, { useMemo, useState } from 'react';
import type { Activity, PiggyBank } from '../types';
import { PERIODS, spendingByCategory, summarize, type Period } from '../services/analytics';
import { categoryOf } from '../services/categories';
import DonutChart, { SLICE_COLORS } from './DonutChart';
import Avatar from './Avatar';
import { formatMoney, fromCents } from '../services/money';
import { useT } from '../contexts/LanguageContext';
import { dateLocale } from '../i18n';

interface ReportProps {
  banks: PiggyBank[];
  activities: Activity[];
  onOpenStrategy: () => void;
  onOpenProfile: () => void;
  onOpenStatements: () => void;
}

const longDate = (d: Date) => d.toLocaleDateString(dateLocale('en-US'), { month: 'short', day: 'numeric', year: 'numeric' });

const Card: React.FC<{ className?: string; children: React.ReactNode }> = ({ className = '', children }) => (
  <div className={`bg-surface border border-white/5 rounded-[2rem] shadow-xl ${className}`}>{children}</div>
);

const Metric: React.FC<{ label: string; icon: string; children: React.ReactNode }> = ({ label, icon, children }) => (
  <Card className="p-5 min-w-0">
    <div className="flex items-center justify-between gap-2 mb-3">
      <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest truncate">{label}</p>
      <span className="material-symbols-rounded text-primary/60 text-lg shrink-0">{icon}</span>
    </div>
    {children}
  </Card>
);

/**
 * One line of the money-flow card: what happened, and how much.
 *
 * Amounts are signed by the caller, so a line that takes money away reads as
 * one — the minus is the point, not decoration. `rule` draws the line above a
 * subtotal, which is where the arithmetic actually lands.
 */
const Line: React.FC<{
  label: string;
  value: number;
  rule?: boolean;
  strong?: boolean;
  muted?: boolean;
  small?: boolean;
}> = ({ label, value, rule, strong, muted, small }) => (
  <div className={rule ? 'pt-3 border-t border-white/10' : ''}>
    <div className="flex items-baseline justify-between gap-3">
      <p
        className={`min-w-0 truncate ${
          small ? 'text-[11px]' : 'text-[13px]'
        } ${strong ? 'text-white font-black' : muted ? 'text-slate-500 font-bold' : 'text-slate-300 font-bold'}`}
      >
        {label}
      </p>
      <p
        className={`shrink-0 tabular-nums ${
          small ? 'text-[11px]' : strong ? 'text-[15px]' : 'text-[13px]'
        } font-black ${strong ? 'text-white' : value < 0 ? 'text-slate-400' : 'text-slate-300'}`}
      >
        {formatMoney(value)}
      </p>
    </div>
  </div>
);

const Report: React.FC<ReportProps> = ({ banks, activities, onOpenStrategy, onOpenProfile, onOpenStatements }) => {
  const [period, setPeriod] = useState<Period>('month');
  const [message, setMessage] = useState<string | null>(null);
  // Which cadence bar the user tapped, so it can show what it is worth.
  const [picked, setPicked] = useState<number | null>(null);
  const t = useT();

  const now = new Date();
  // `t` is a dependency so the period's labels are reworded when the language changes.
  const summary = useMemo(() => summarize(activities, banks, period, now), [activities, banks, period, t]); // eslint-disable-line react-hooks/exhaustive-deps

  // What actually arrived: whatever reached a goal, plus whatever went
  // straight back out to clear a debt on the way.
  const arrived = summary.distributed + summary.repaid;
  // Spending is both kinds — out of a goal, and on credit against future
  // deposits. Splitting them is the point; hiding either is not.
  const outgoings = summary.spent + summary.borrowed;
  // Sale proceeds that cleared spent ahead came back from shares without
  // reaching a goal, so they are taken off before the goals' total.
  const sharesToDebt = Math.max(0, fromCents(Math.round((summary.cameBack - summary.cameBackToGoals) * 100)));
  const grewBy = fromCents(
    Math.round((summary.distributed - summary.spent - summary.invested + summary.cameBackToGoals) * 100)
  );
  const spending = useMemo(
    () => spendingByCategory(activities, summary.range, now),
    [activities, summary.range] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const spentTotal = spending.reduce((sum, row) => sum + row.cents, 0);

  const colorOf = (bankId: string) => SLICE_COLORS[Math.max(0, banks.findIndex((b) => b.id === bankId)) % SLICE_COLORS.length];

  const notify = (text: string) => {
    setMessage(text);
    setTimeout(() => setMessage(null), 4000);
  };

  const slices = summary.banks
    .filter((b) => b.credited > 0)
    .map((b) => ({ id: b.bankId, value: b.share, color: colorOf(b.bankId) }));
  const sliceTotal = slices.reduce((s, x) => s + x.value, 0);
  const maxBucket = Math.max(0, ...summary.buckets.map((b) => b.amount));

  return (
    <div className="flex flex-col min-h-full pb-40 safe-pt">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-6 pt-6">
        <div className="min-w-0">
          <h2 className="text-white text-3xl font-black tracking-tight">{t.report.title}</h2>
          <p className="text-slate-500 text-sm font-medium mt-1">{t.report.subtitle}</p>
        </div>
        <Avatar onClick={onOpenProfile} />
      </div>

      {/* Period */}
      <div className="flex gap-2 px-6 mt-6 overflow-x-auto no-scrollbar">
        {PERIODS.map((p) => (
          <button
            key={p.key}
            onClick={() => {
              setPeriod(p.key);
              setPicked(null);
            }}
            className={`shrink-0 h-9 px-4 rounded-full text-xs font-black transition-colors ${
              period === p.key ? 'bg-primary text-black' : 'glass text-slate-300'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="flex items-center justify-between gap-3 px-6 mt-4">
        <div className="flex items-center gap-2 min-w-0">
          <span className="material-symbols-rounded text-primary text-lg">calendar_month</span>
          <p className="text-white text-sm font-bold truncate">{summary.range.label}</p>
        </div>
        <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest shrink-0">
          {t.report.days(summary.range.days)}
        </p>
      </div>

      {/* Headline metrics */}
      <div className="px-6 mt-5 grid grid-cols-2 gap-3">
        <Metric label={t.report.saved} icon="savings">
          <p className="text-white text-2xl font-black tabular-nums truncate">{formatMoney(summary.distributed)}</p>
          <p className={`text-[11px] font-bold mt-1 ${summary.change === null ? 'text-slate-500' : summary.change >= 0 ? 'text-primary' : 'text-red-400'}`}>
            {summary.change === null
              ? summary.range.previous ? t.report.nothingPrevious : t.report.everythingOnRecord
              : t.report.vsPrevious(`${summary.change >= 0 ? '+' : ''}${summary.change}`)}
          </p>
        </Metric>

        <Metric label={t.report.perDay} icon="speed">
          <p className="text-white text-2xl font-black tabular-nums truncate">{formatMoney(summary.dailyAverage)}</p>
          <p className="text-slate-500 text-[11px] font-bold mt-1">
            {t.report.transactions(summary.transactions)}
          </p>
        </Metric>

        <Metric label={t.report.topGoal} icon="workspace_premium">
          {summary.top ? (
            <>
              <p className="text-white text-lg font-black truncate leading-tight">{summary.top.name}</p>
              <p className="text-[11px] font-bold mt-1 flex items-center gap-2">
                <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-full">{summary.top.share}%</span>
                <span className="text-slate-500">{formatMoney(summary.top.credited)}</span>
              </p>
            </>
          ) : (
            <p className="text-slate-500 text-sm font-bold">{t.report.noDepositsYet}</p>
          )}
        </Metric>

        <Metric label={t.report.allGoals} icon="flag">
          {summary.collective.funded === null ? (
            <p className="text-slate-500 text-sm font-bold">{t.report.noTargetSet}</p>
          ) : (
            <>
              <p className="text-primary text-2xl font-black tabular-nums">{summary.collective.funded}%</p>
              <p className="text-slate-500 text-[11px] font-bold mt-1">
                {t.report.reachedOf(summary.collective.reached, summary.collective.goals)}
              </p>
            </>
          )}
        </Metric>
      </div>

      {/*
        Where the money went.

        `summarize` has always worked all four of these out, and only the first
        ever reached a screen. Without the other three "Saved RM103.88" is an
        answer with its working hidden: it is already net of clearing debt, so
        it does not match what arrived, and it says nothing about what was
        spent. Deposits arriving, debt cleared, goals funded, goals drawn down —
        every line here is a number the ledger already holds.
      */}
      <div className="px-6 mt-4">
        <Card className="p-6">
          <h3 className="text-white text-lg font-black">{t.report.inAndOut}</h3>
          <p className="text-slate-500 text-xs font-medium mt-0.5">
            {t.report.inAndOutHint}
          </p>

          <div className="mt-5 space-y-3">
            <Line label={t.report.putIn} value={arrived} />
            {summary.repaid > 0 && (
              <Line label={t.report.coveredEarlier} value={-summary.repaid} muted />
            )}
            <Line label={t.report.reachedGoals} value={summary.distributed} rule strong />

            {outgoings > 0 && (
              <>
                <Line label={t.report.spent} value={-outgoings} />
                {summary.spent > 0 && summary.borrowed > 0 && (
                  <div className="pl-4 space-y-2">
                    <Line label={t.report.outOfGoal} value={-summary.spent} muted small />
                    <Line label={t.common.spentAhead} value={-summary.borrowed} muted small />
                  </div>
                )}
              </>
            )}

            {/* Shares are neither spending nor saving, so they get lines of
                their own; the money still left and reached the goals, so it
                still counts towards what they grew by. */}
            {summary.invested > 0 && <Line label={t.report.movedIntoShares} value={-summary.invested} />}
            {summary.cameBack > 0 && (
              <>
                <Line label={t.report.cameBackFromShares} value={summary.cameBack} />
                {sharesToDebt > 0 && (
                  <div className="pl-4 space-y-2">
                    <Line label={t.report.coveredEarlier} value={-sharesToDebt} muted small />
                  </div>
                )}
              </>
            )}

            <Line label={t.report.goalsGrewBy} value={grewBy} rule strong />
          </div>

          {(summary.invested > 0 || summary.cameBack > 0) && (
            <p className="text-slate-500 text-[11px] font-medium mt-4 leading-relaxed">
              {t.report.sharesNote}
            </p>
          )}

          {summary.borrowed > 0 && (
            <p className="text-slate-500 text-[11px] font-medium mt-4 leading-relaxed">
              {t.report.borrowNote}
            </p>
          )}
        </Card>
      </div>

      {/* Allocation */}
      <div className="px-6 mt-4">
        <Card className="p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-white text-lg font-black">{t.report.allocation}</h3>
              <p className="text-slate-500 text-xs font-medium mt-0.5">{t.report.allocationHint}</p>
            </div>
            <span className="shrink-0 bg-primary/10 text-primary text-[10px] font-black px-2.5 py-1 rounded-full">
              {t.report.slicesOf(slices.length, banks.length)}
            </span>
          </div>

          <div className="flex justify-center py-6">
            <DonutChart
              slices={slices}
              total={sliceTotal}
              size={180}
              center={
                <>
                  <p className="text-slate-500 text-[9px] font-black uppercase tracking-widest">{t.report.deposited}</p>
                  <p className="text-white text-2xl font-black tabular-nums leading-tight">{formatMoney(summary.distributed, { decimals: 0 })}</p>
                  <p className="text-slate-500 text-[10px] font-bold">{t.report.goalsCount(slices.length)}</p>
                </>
              }
            />
          </div>

          <div className="space-y-2">
            {summary.banks.length === 0 && (
              <p className="text-slate-500 text-sm font-medium text-center py-4">{t.report.noGoalsYet}</p>
            )}
            {summary.banks.map((b) => {
              const color = colorOf(b.bankId);
              const width = b.funded === null ? 0 : Math.min(100, Math.max(0, b.funded));
              return (
                <div key={b.bankId} className="bg-white/5 rounded-2xl px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div
                      className="size-9 rounded-xl flex items-center justify-center shrink-0"
                      style={{ backgroundColor: `${color}1f`, color }}
                    >
                      <span className="material-symbols-rounded text-xl">{b.icon}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <p className="text-white text-sm font-bold truncate">{b.name}</p>
                        {b.credited > 0 && (
                          <span
                            className="shrink-0 text-[10px] font-black px-1.5 py-0.5 rounded-md"
                            style={{ backgroundColor: `${color}26`, color }}
                          >
                            {b.share}%
                          </span>
                        )}
                      </div>
                      <p className="text-slate-500 text-[11px] font-medium truncate">
                        {b.credited > 0 ? t.report.credited(formatMoney(b.credited)) : t.report.nothingCredited}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      {b.funded === null ? (
                        <p className="text-slate-400 text-xs font-bold">{formatMoney(b.current, { decimals: 0 })}</p>
                      ) : (
                        <>
                          <p className={`text-sm font-black tabular-nums ${b.current < 0 ? 'text-red-400' : 'text-white'}`}>{b.funded}%</p>
                          <p className="text-slate-500 text-[10px] font-medium">{t.report.ofTarget(formatMoney(b.target, { decimals: 0 }))}</p>
                        </>
                      )}
                    </div>
                  </div>
                  {b.funded !== null && (
                    <div className="h-1.5 mt-3 bg-white/5 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${width}%`, backgroundColor: color }} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {/* Where it went. Only spending appears here: a deposit has no heading,
          and borrowing is money moved forward rather than money spent. */}
      {spending.length > 0 && (
        <div className="px-6 mt-4">
          <Card className="p-6">
            <h3 className="text-white text-lg font-black">{t.report.whereItWent}</h3>
            <p className="text-slate-500 text-xs font-medium mt-1">
              {t.report.spentInPeriod(formatMoney(fromCents(spentTotal)))}
            </p>

            <div className="flex items-center gap-6 mt-5">
              <DonutChart
                slices={spending.map((row, i) => ({
                  id: row.key,
                  value: row.share,
                  color: SLICE_COLORS[i % SLICE_COLORS.length],
                }))}
                total={100}
                size={128}
                center={
                  <p className="text-white text-lg font-black tabular-nums leading-none">
                    {formatMoney(fromCents(spentTotal), { decimals: 0 })}
                  </p>
                }
              />
              <div className="flex-1 min-w-0 space-y-2.5">
                {spending.slice(0, 4).map((row, i) => (
                  <div key={row.key} className="flex items-center gap-2.5">
                    <span
                      className="size-2.5 rounded-full shrink-0"
                      style={{ background: SLICE_COLORS[i % SLICE_COLORS.length] }}
                    />
                    <span className="text-slate-300 text-xs font-bold truncate flex-1">
                      {categoryOf(row.key).label}
                    </span>
                    <span className="text-white text-xs font-black shrink-0">{row.share}%</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-5 space-y-2">
              {spending.map((row) => (
                <div key={row.key} className="flex items-center gap-3">
                  <span className={`material-symbols-rounded text-lg ${categoryOf(row.key).tint}`}>
                    {categoryOf(row.key).icon}
                  </span>
                  <span className="text-slate-300 text-xs font-bold truncate flex-1">
                    {categoryOf(row.key).label}
                  </span>
                  <span className="text-slate-600 text-[10px] font-bold shrink-0">
                    {t.report.times(row.entries)}
                  </span>
                  <span className="text-white text-sm font-black shrink-0 w-24 text-right">
                    {formatMoney(fromCents(row.cents))}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* Cadence */}
      <div className="px-6 mt-4">
        <Card className="p-6">
          <h3 className="text-white text-lg font-black">{t.report.pacing}</h3>
          <p className="text-slate-500 text-xs font-medium mt-0.5">{t.report.pacingHint}</p>

          <div className="grid grid-cols-3 gap-2 mt-5">
            {[
              { value: t.report.streakValue(summary.streak), label: t.report.streak },
              { value: `${summary.activeDays}/${summary.range.days}`, label: t.report.daysSaved },
              { value: formatMoney(summary.maxDay, { decimals: 0 }), label: t.report.bestDay },
            ].map((s) => (
              <div key={s.label} className="bg-white/5 rounded-2xl py-4 text-center min-w-0">
                <p className="text-primary text-xl font-black tabular-nums truncate px-1">{s.value}</p>
                <p className="text-slate-500 text-[9px] font-black uppercase tracking-widest mt-1 px-1 truncate">{s.label}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 pt-6 flex items-end gap-1.5 h-[9.5rem]">
            {summary.buckets.map((b, i) => {
              const h = maxBucket > 0 ? Math.max(b.amount > 0 ? 6 : 2, (b.amount / maxBucket) * 100) : 2;
              const on = picked === i;
              return (
                <button
                  key={`${b.label}-${i}`}
                  onClick={() => setPicked(on ? null : i)}
                  className="flex-1 min-w-0 h-full flex flex-col items-center justify-end gap-1.5"
                >
                  <div className="w-full flex-1 flex items-end relative">
                    {on && (
                      <span
                        className={`absolute left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-bg-dark/95 border border-primary/30 text-white text-[10px] font-black px-2 py-1 shadow-lg z-10`}
                        // A full-height bar would push the readout out of the
                        // card, so it sits just inside the top instead.
                        style={{ bottom: `calc(${Math.min(h, 92)}% + 5px)` }}
                      >
                        {formatMoney(b.amount)}
                      </span>
                    )}
                    <div
                      className={`w-full rounded-t-lg transition-opacity ${b.amount > 0 ? 'bg-gradient-to-t from-primary/60 to-primary' : 'bg-white/10'} ${b.current || on ? '' : 'opacity-70'}`}
                      style={{ height: `${h}%` }}
                      title={formatMoney(b.amount)}
                    />
                  </div>
                  <p className={`${summary.buckets.length > 8 ? 'text-[8px]' : 'text-[9px]'} font-black uppercase ${on ? 'text-white' : b.current ? 'text-primary' : 'text-slate-500'}`}>
                    {b.label}
                  </p>
                </button>
              );
            })}
          </div>
          <p className="text-slate-600 text-[10px] font-bold text-center mt-3">
            {picked === null
              ? t.report.bestAndTotal(formatMoney(maxBucket), formatMoney(summary.distributed))
              : t.report.pickedBar(summary.buckets[picked].label, formatMoney(summary.buckets[picked].amount))}
          </p>
        </Card>
      </div>

      {/* Forecast */}
      <div className="px-6 mt-4">
        <Card className="p-6 border-primary/20 bg-primary/5">
          <div className="flex items-center gap-2 mb-3">
            <span className="material-symbols-rounded text-primary">auto_awesome</span>
            <p className="text-primary text-[10px] font-black uppercase tracking-widest">{t.report.forecast}</p>
          </div>
          {summary.forecast ? (
            <>
              <p className="text-white text-base font-bold leading-relaxed">
                {t.report.pace.lead}
                <span className="text-primary">{t.report.pace.rate(formatMoney(summary.forecast.dailyRate))}</span>
                {t.report.pace.into}
                <span className="text-primary">{summary.forecast.name}</span>
                {t.report.pace.reach}
                <span className="bg-primary/15 text-primary px-2 py-0.5 rounded-lg">{t.report.pace.days(summary.forecast.days)}</span>
                {t.report.pace.tail(longDate(summary.forecast.date))}
              </p>
              <p className="text-slate-500 text-xs font-medium mt-3">
                {t.report.stillToGo(formatMoney(summary.forecast.remaining), PERIODS.find((p) => p.key === period)?.label ?? '')}
              </p>
            </>
          ) : (
            <p className="text-slate-400 text-sm font-medium leading-relaxed">
              {t.report.noPace}
            </p>
          )}
        </Card>
      </div>

      {/* Actions */}
      <div className="px-6 mt-6 space-y-3">
        <button
          onClick={onOpenStrategy}
          className="w-full h-16 rounded-[2rem] bg-primary text-black font-black flex items-center justify-center gap-3 active:scale-95 transition-transform"
        >
          <span className="material-symbols-rounded">tune</span>
          {t.report.adjustSplit}
        </button>

        <button
          onClick={onOpenStatements}
          className="w-full flex items-center gap-4 p-5 rounded-[2rem] glass border border-white/10 active:scale-[0.985] transition-transform text-left"
        >
          <span className="size-11 shrink-0 rounded-2xl bg-primary/15 text-primary flex items-center justify-center">
            <span className="material-symbols-rounded">description</span>
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-white text-sm font-black">{t.report.statements}</span>
            <span className="block text-slate-500 text-[11px] font-bold mt-0.5 leading-relaxed">
              {t.report.statementsHint}
            </span>
          </span>
          <span className="material-symbols-rounded text-slate-600">chevron_right</span>
        </button>

        <p className="text-slate-600 text-[10px] font-bold text-center leading-relaxed">
          {t.report.periodNote}
        </p>
      </div>

      {message && (
        <div className="fixed left-0 right-0 bottom-28 z-40 flex justify-center px-6 pointer-events-none">
          <p className="bg-surface border border-white/10 text-white text-sm font-bold px-5 py-3 rounded-2xl shadow-2xl max-w-md text-center">
            {message}
          </p>
        </div>
      )}

    </div>
  );
};

export default Report;
