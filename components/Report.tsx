import React, { useMemo, useState } from 'react';
import type { Activity, PiggyBank } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { PERIODS, RETENTION_MONTHS, archivable, retentionCutoff, summarize, type Period } from '../services/analytics';
import { buildCsv, exportFileName } from '../services/export';
import { buildStatementPdf } from '../services/statement';
import { saveFile } from '../services/share';
import { pruneActivities } from '../services/firestore';
import DonutChart, { SLICE_COLORS } from './DonutChart';
import Avatar from './Avatar';
import { useBackHandler } from '../hooks/useBackHandler';

interface ReportProps {
  uid: string;
  banks: PiggyBank[];
  activities: Activity[];
  onOpenStrategy: () => void;
  onOpenProfile: () => void;
}

const money = (n: number) => `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const whole = (n: number) => `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
const longDate = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

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

type Busy = 'csv' | 'pdf' | 'clear' | null;

const Report: React.FC<ReportProps> = ({ uid, banks, activities, onOpenStrategy, onOpenProfile }) => {
  const { user } = useAuth();
  const [period, setPeriod] = useState<Period>('month');
  const [busy, setBusy] = useState<Busy>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  // Which cadence bar the user tapped, so it can show what it is worth.
  const [picked, setPicked] = useState<number | null>(null);
  useBackHandler(confirmClear, () => setConfirmClear(false));
  const [exported, setExported] = useState(false);

  const now = new Date();
  const summary = useMemo(() => summarize(activities, banks, period, now), [activities, banks, period]); // eslint-disable-line react-hooks/exhaustive-deps
  const old = useMemo(() => archivable(activities, now), [activities]); // eslint-disable-line react-hooks/exhaustive-deps
  const cutoff = retentionCutoff(now);

  const owner = user?.displayName || user?.email || 'SavvyPiggy';
  const colorOf = (bankId: string) => SLICE_COLORS[Math.max(0, banks.findIndex((b) => b.id === bankId)) % SLICE_COLORS.length];

  const inPeriod = activities.filter((a) => {
    const d = new Date(a.date);
    return d >= summary.range.start && d < summary.range.end;
  });

  const notify = (text: string) => {
    setMessage(text);
    setTimeout(() => setMessage(null), 4000);
  };

  const run = async (kind: Exclude<Busy, null>, job: () => Promise<void>) => {
    if (busy) return;
    setBusy(kind);
    try {
      await job();
    } catch (e) {
      const text = e instanceof Error ? e.message : String(e);
      // Backing out of the share sheet is not a failure worth reporting.
      if (!/cancel/i.test(text)) notify(text);
    } finally {
      setBusy(null);
    }
  };

  const exportCsv = (rows: Activity[], label: string) =>
    run('csv', async () => {
      await saveFile(exportFileName(label, 'csv', now), 'text/csv;charset=utf-8', buildCsv(rows, banks));
      setExported(true);
    });

  const exportPdf = () =>
    run('pdf', async () => {
      const pdf = buildStatementPdf({ summary, activities, banks, owner, now });
      await saveFile(exportFileName(summary.range.label, 'pdf', now), 'application/pdf', pdf);
      setExported(true);
    });

  const clearOld = () =>
    run('clear', async () => {
      const n = await pruneActivities(uid, old.map((a) => a.id));
      setConfirmClear(false);
      notify(`Cleared ${n} old record${n === 1 ? '' : 's'}. Balances unchanged.`);
    });

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
          <h2 className="text-white text-3xl font-black tracking-tight">Report</h2>
          <p className="text-slate-500 text-sm font-medium mt-1">Where your deposits went, and how fast.</p>
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
          {summary.range.days} day{summary.range.days === 1 ? '' : 's'}
        </p>
      </div>

      {/* Headline metrics */}
      <div className="px-6 mt-5 grid grid-cols-2 gap-3">
        <Metric label="Saved" icon="savings">
          <p className="text-white text-2xl font-black tabular-nums truncate">{money(summary.distributed)}</p>
          <p className={`text-[11px] font-bold mt-1 ${summary.change === null ? 'text-slate-500' : summary.change >= 0 ? 'text-primary' : 'text-red-400'}`}>
            {summary.change === null
              ? summary.range.previous ? 'Nothing in the previous period' : 'Everything on record'
              : `${summary.change >= 0 ? '+' : ''}${summary.change}% vs previous`}
          </p>
        </Metric>

        <Metric label="Per day" icon="speed">
          <p className="text-white text-2xl font-black tabular-nums truncate">{money(summary.dailyAverage)}</p>
          <p className="text-slate-500 text-[11px] font-bold mt-1">
            {summary.transactions} transaction{summary.transactions === 1 ? '' : 's'}
          </p>
        </Metric>

        <Metric label="Top goal" icon="workspace_premium">
          {summary.top ? (
            <>
              <p className="text-white text-lg font-black truncate leading-tight">{summary.top.name}</p>
              <p className="text-[11px] font-bold mt-1 flex items-center gap-2">
                <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-full">{summary.top.share}%</span>
                <span className="text-slate-500">{money(summary.top.credited)}</span>
              </p>
            </>
          ) : (
            <p className="text-slate-500 text-sm font-bold">No deposits yet</p>
          )}
        </Metric>

        <Metric label="All goals" icon="flag">
          {summary.collective.funded === null ? (
            <p className="text-slate-500 text-sm font-bold">No target set</p>
          ) : (
            <>
              <p className="text-primary text-2xl font-black tabular-nums">{summary.collective.funded}%</p>
              <p className="text-slate-500 text-[11px] font-bold mt-1">
                {summary.collective.reached} of {summary.collective.goals} reached
              </p>
            </>
          )}
        </Metric>
      </div>

      {/* Allocation */}
      <div className="px-6 mt-4">
        <Card className="p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-white text-lg font-black">Piggy Allocation</h3>
              <p className="text-slate-500 text-xs font-medium mt-0.5">How this period's deposits were split.</p>
            </div>
            <span className="shrink-0 bg-primary/10 text-primary text-[10px] font-black px-2.5 py-1 rounded-full">
              {slices.length} of {banks.length}
            </span>
          </div>

          <div className="flex justify-center py-6">
            <DonutChart
              slices={slices}
              total={sliceTotal}
              size={180}
              center={
                <>
                  <p className="text-slate-500 text-[9px] font-black uppercase tracking-widest">Deposited</p>
                  <p className="text-white text-2xl font-black tabular-nums leading-tight">{whole(summary.distributed)}</p>
                  <p className="text-slate-500 text-[10px] font-bold">{slices.length} goal{slices.length === 1 ? '' : 's'}</p>
                </>
              }
            />
          </div>

          <div className="space-y-2">
            {summary.banks.length === 0 && (
              <p className="text-slate-500 text-sm font-medium text-center py-4">No goals yet.</p>
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
                        {b.credited > 0 ? `${money(b.credited)} credited` : 'Nothing credited'}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      {b.funded === null ? (
                        <p className="text-slate-400 text-xs font-bold">{whole(b.current)}</p>
                      ) : (
                        <>
                          <p className={`text-sm font-black tabular-nums ${b.current < 0 ? 'text-red-400' : 'text-white'}`}>{b.funded}%</p>
                          <p className="text-slate-500 text-[10px] font-medium">of {whole(b.target)}</p>
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

      {/* Cadence */}
      <div className="px-6 mt-4">
        <Card className="p-6">
          <h3 className="text-white text-lg font-black">Pacing &amp; Cadence</h3>
          <p className="text-slate-500 text-xs font-medium mt-0.5">How regularly money is reaching your goals.</p>

          <div className="grid grid-cols-3 gap-2 mt-5">
            {[
              { value: `${summary.streak}d`, label: 'Streak' },
              { value: `${summary.activeDays}/${summary.range.days}`, label: 'Days saved' },
              { value: whole(summary.maxDay), label: 'Best day' },
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
                        {money(b.amount)}
                      </span>
                    )}
                    <div
                      className={`w-full rounded-t-lg transition-opacity ${b.amount > 0 ? 'bg-gradient-to-t from-primary/60 to-primary' : 'bg-white/10'} ${b.current || on ? '' : 'opacity-70'}`}
                      style={{ height: `${h}%` }}
                      title={money(b.amount)}
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
              ? `Best ${money(maxBucket)} · Total ${money(summary.distributed)}`
              : `${summary.buckets[picked].label}: ${money(summary.buckets[picked].amount)} · tap again to clear`}
          </p>
        </Card>
      </div>

      {/* Forecast */}
      <div className="px-6 mt-4">
        <Card className="p-6 border-primary/20 bg-primary/5">
          <div className="flex items-center gap-2 mb-3">
            <span className="material-symbols-rounded text-primary">auto_awesome</span>
            <p className="text-primary text-[10px] font-black uppercase tracking-widest">Forecast</p>
          </div>
          {summary.forecast ? (
            <>
              <p className="text-white text-base font-bold leading-relaxed">
                At your pace of <span className="text-primary">{money(summary.forecast.dailyRate)}/day</span> into{' '}
                <span className="text-primary">{summary.forecast.name}</span>, you'll reach it in{' '}
                <span className="bg-primary/15 text-primary px-2 py-0.5 rounded-lg">{summary.forecast.days} day{summary.forecast.days === 1 ? '' : 's'}</span>{' '}
                ({longDate(summary.forecast.date)}).
              </p>
              <p className="text-slate-500 text-xs font-medium mt-3">
                {money(summary.forecast.remaining)} still to go, based on the {PERIODS.find((p) => p.key === period)?.label.toLowerCase()} view.
              </p>
            </>
          ) : (
            <p className="text-slate-400 text-sm font-medium leading-relaxed">
              No pace to go on yet — once deposits reach a goal with a target in this period, the forecast appears here.
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
          Adjust Distribution Split
        </button>

        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => exportCsv(inPeriod, summary.range.label)}
            disabled={busy !== null}
            className="h-14 rounded-[1.75rem] glass border border-white/10 text-white font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-40"
          >
            <span className="material-symbols-rounded text-primary">table_view</span>
            {busy === 'csv' ? 'Saving…' : 'Export CSV'}
          </button>
          <button
            onClick={exportPdf}
            disabled={busy !== null}
            className="h-14 rounded-[1.75rem] glass border border-white/10 text-white font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-40"
          >
            <span className="material-symbols-rounded text-primary">picture_as_pdf</span>
            {busy === 'pdf' ? 'Rendering…' : 'Export PDF'}
          </button>
        </div>
        <p className="text-slate-600 text-[10px] font-bold text-center">
          Exports cover the selected period. Choose All Time for everything.
        </p>

        {/* Housekeeping */}
        <Card className="p-5 mt-2">
          <div className="flex items-start gap-3">
            <span className="material-symbols-rounded text-slate-400">cleaning_services</span>
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-bold">Old records</p>
              <p className="text-slate-500 text-xs font-medium leading-relaxed mt-1">
                Records older than {RETENTION_MONTHS} months (before {longDate(cutoff)}) can be cleared to keep the app
                fast. Goal balances and debts are never touched.
              </p>
              <button
                onClick={() => setConfirmClear(true)}
                disabled={old.length === 0 || busy !== null}
                className="mt-3 h-11 px-5 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-black active:scale-95 transition-transform disabled:opacity-40"
              >
                {old.length === 0 ? 'Nothing to clear' : `Clear ${old.length} record${old.length === 1 ? '' : 's'}`}
              </button>
            </div>
          </div>
        </Card>
      </div>

      {message && (
        <div className="fixed left-0 right-0 bottom-28 z-40 flex justify-center px-6 pointer-events-none">
          <p className="bg-surface border border-white/10 text-white text-sm font-bold px-5 py-3 rounded-2xl shadow-2xl max-w-md text-center">
            {message}
          </p>
        </div>
      )}

      {confirmClear && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => busy === null && setConfirmClear(false)}
        >
          <div
            className="w-full max-w-md bg-surface rounded-t-[3rem] sm:rounded-[3rem] sm:mb-6 shadow-2xl animate-in slide-in-from-bottom duration-300 p-7 safe-pb"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-white text-2xl font-black">Clear {old.length} old record{old.length === 1 ? '' : 's'}?</h3>
            <p className="text-slate-400 text-sm font-medium leading-relaxed mt-2">
              Everything dated before {longDate(cutoff)} will be removed from the history. Your goal balances, targets,
              and debts stay exactly as they are — this only trims the log. It cannot be undone, so export first.
            </p>

            <button
              onClick={() => exportCsv(old, 'Archive')}
              disabled={busy !== null}
              className="mt-5 w-full h-14 rounded-[1.75rem] glass border border-white/10 text-white font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-40"
            >
              <span className="material-symbols-rounded text-primary">download</span>
              {busy === 'csv' ? 'Saving…' : 'Export these records (CSV)'}
            </button>

            <label className="mt-4 flex items-center gap-3 text-slate-300 text-sm font-bold">
              <input
                type="checkbox"
                checked={exported}
                onChange={(e) => setExported(e.target.checked)}
                className="size-5 accent-[#4ADE80]"
              />
              I have a copy of these records
            </label>

            <div className="grid grid-cols-2 gap-3 mt-5">
              <button
                onClick={() => setConfirmClear(false)}
                disabled={busy !== null}
                className="h-14 rounded-[1.75rem] glass text-white font-bold active:scale-95 transition-transform disabled:opacity-40"
              >
                Keep them
              </button>
              <button
                onClick={clearOld}
                disabled={!exported || busy !== null}
                className="h-14 rounded-[1.75rem] bg-red-500 text-white font-black active:scale-95 transition-transform disabled:opacity-40"
              >
                {busy === 'clear' ? 'Clearing…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Report;
