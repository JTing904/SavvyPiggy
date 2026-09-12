import React, { useMemo } from 'react';
import type { Dividend, Trade } from '../types';
import { declaredIncome, upcomingDividends, yieldOnCost } from '../services/dividends';
import { isDividendApiConfigured } from '../services/dividendApi';
import { tradeCents, unitsOnExDate } from '../services/holdings';
import { formatMoney, fromCents } from '../services/money';

interface DividendsProps {
  dividends: Dividend[];
  trades: Trade[];
  busy: boolean;
  /** False until a fetch has actually succeeded at least once. */
  known: boolean;
  onRefresh: () => void;
  onBack: () => void;
}

const money = (cents: number, opts?: { decimals?: 0 | 2; signed?: boolean }) =>
  formatMoney(fromCents(cents), opts);

const day = (ms: number) =>
  new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

/** RM0.3300 — dividends are quoted to four places, and the tail matters. */
const rate = (points: number) => `RM${(points / 10_000).toFixed(4)}`;

const Row: React.FC<{ label: string; value: string; strong?: boolean }> = ({ label, value, strong }) => (
  <div className="flex items-baseline gap-3 text-[13px]">
    <span className="text-slate-400 font-bold flex-1">{label}</span>
    <span className={strong ? 'text-accent font-black text-lg' : 'text-white font-black'}>{value}</span>
  </div>
);

/**
 * What each counter is about to pay, and what it has paid.
 *
 * The figures here are worked out the same way the crediting is — from the
 * units the trade log says were held on the ex-date — so what this screen
 * shows before a payment is exactly what lands after it.
 */
const Dividends: React.FC<DividendsProps> = ({ dividends, trades, busy, known, onRefresh, onBack }) => {
  const upcoming = useMemo(() => upcomingDividends(dividends, trades), [dividends, trades]);
  const year = useMemo(() => declaredIncome(dividends, trades), [dividends, trades]);

  const paid = useMemo(
    () =>
      trades
        .filter((t) => t.kind === 'dividend')
        .sort((a, b) => b.tradedAt - a.tradedAt),
    [trades]
  );

  const paidTotal = paid.reduce((sum, t) => sum + tradeCents(t), 0);

  /** One row per counter that has actually paid something in the last year. */
  const yields = useMemo(() => {
    const seen = new Map<string, string>();
    for (const t of trades) seen.set(t.symbol, t.name);
    return [...seen.entries()]
      .map(([symbol, name]) => ({ symbol, name, y: yieldOnCost(trades, symbol) }))
      .filter((row): row is { symbol: string; name: string; y: NonNullable<typeof row.y> } => row.y !== null)
      .sort((a, b) => b.y.percent - a.y.percent);
  }, [trades]);

  return (
    <div className="flex flex-col h-full bg-bg-dark safe-pt">
      <div className="flex items-center px-6 py-4 gap-4 sticky top-0 bg-bg-dark/95 z-20">
        <button
          onClick={onBack}
          className="size-10 shrink-0 rounded-full glass flex items-center justify-center text-slate-300 active:scale-90 transition-transform"
        >
          <span className="material-symbols-rounded text-xl">arrow_back_ios_new</span>
        </button>
        <h2 className="text-white text-2xl font-black tracking-tight">Dividends</h2>
        <div className="flex-1" />
        <button
          onClick={onRefresh}
          disabled={busy}
          className="size-10 shrink-0 rounded-full glass flex items-center justify-center text-slate-300 active:scale-90 transition-transform disabled:opacity-40"
        >
          <span className={`material-symbols-rounded text-xl ${busy ? 'animate-spin' : ''}`}>refresh</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar px-6 pb-40">
        {!isDividendApiConfigured && (
          <div className="rounded-3xl bg-amber-500/10 border border-amber-500/25 p-5">
            <p className="text-amber-300 font-black text-sm">Not connected yet</p>
            <p className="text-amber-200/70 text-[11px] font-bold mt-2 leading-relaxed">
              Ex-dates and pay dates come from a small service of your own, because no free API carries
              them for Bursa. Until its address is set, nothing is fetched and nothing is credited — your
              trades are still recorded with the dates a dividend would be worked out from.
            </p>
          </div>
        )}

        {yields.length > 0 && (
          <>
            <p className="text-slate-500 text-[10px] font-black tracking-widest mt-7 mb-3">
              YIELD ON WHAT YOU PAID
            </p>
            <div className="space-y-2.5">
              {yields.map(({ symbol, name, y }) => (
                <div key={symbol} className="flex items-center gap-3 p-4 rounded-3xl glass">
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-black text-[13px] truncate">{name}</p>
                    <p className="text-slate-500 text-[11px] font-bold mt-0.5">
                      {money(y.paidCents)} paid on {money(y.costCents)} of cost, last 12 months
                    </p>
                  </div>
                  <p className="text-accent text-lg font-black shrink-0">{y.percent}%</p>
                </div>
              ))}
            </div>
            <p className="text-slate-600 text-[11px] font-bold mt-3 leading-relaxed px-1">
              This is what the holding returns against what you actually paid for it — not the yield a
              quote screen shows, which moves with the share price and says nothing about your cost.
            </p>
          </>
        )}

        {paid.length > 0 && (
          <div className="rounded-3xl bg-accent/10 border border-accent/25 p-5 mt-5">
            <p className="text-accent/70 text-[10px] font-black uppercase tracking-widest">Received so far</p>
            <p className="text-accent text-3xl font-black tracking-tight mt-1">{money(paidTotal)}</p>
            <p className="text-accent/60 text-[11px] font-bold mt-1">
              across {paid.length} payment{paid.length === 1 ? '' : 's'}
            </p>
          </div>
        )}

        {/*
          Declared income only.

          Every figure is a company's own announcement times the units the log
          says were held — nothing annualised, nothing assumed to repeat. The
          two halves are kept apart because they are not equally certain: once
          the ex-date has passed the money is owed whatever happens next, while
          before it the payment depends on still holding the shares that day.
          One combined number would claim the second half is as settled as the
          first.
        */}
        {year.rows.length > 0 && (
          <div className="rounded-3xl glass p-5 mt-7">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest">
                Declared, next 12 months
              </p>
              <p className="text-accent text-2xl font-black tabular-nums">{money(year.totalCents)}</p>
            </div>
            <div className="mt-4 space-y-2.5">
              <Row label="Already yours — ex-date has passed" value={money(year.lockedCents)} />
              <Row label="If you still hold on the ex-date" value={money(year.pendingCents)} />
            </div>
            <p className="text-slate-600 text-[11px] font-medium mt-4 leading-relaxed">
              Only what has actually been announced. A counter that has declared nothing for a quarter
              adds nothing here — this is not a forecast.
            </p>
          </div>
        )}

        <p className="text-slate-500 text-[10px] font-black tracking-widest mt-7 mb-3">COMING UP</p>
        {upcoming.length === 0 ? (
          <div className="rounded-3xl glass p-5">
            {/*
              An empty list means one of two very different things, and saying
              the wrong one is a claim about the user's own holdings. Until a
              fetch has succeeded, the honest answer is that we do not know.
            */}
            <p className="text-slate-400 text-xs font-bold leading-relaxed">
              {known
                ? 'Nothing announced for the counters you hold. A dividend appears here as soon as the company declares it, and is paid into your goals on its pay date.'
                : 'Announcements could not be fetched, so this is not a list of nothing — it is no answer at all. Pull the refresh above once you are back online.'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {upcoming.map(({ dividend, units, amountCents }) => (
              <div key={`${dividend.symbol}_${dividend.exDate}`} className="rounded-3xl glass p-5">
                <div className="flex items-baseline gap-3">
                  {/* The counter code never truncates: a "1155" shortened to
                      "115" names a different company. The subject gives way. */}
                  <p className="text-white font-black text-[15px] shrink-0">{dividend.symbol}</p>
                  <span className="text-slate-500 text-[10px] font-black text-right flex-1 min-w-0 truncate">
                    {dividend.subject}
                  </span>
                </div>
                <div className="mt-4 space-y-2.5">
                  <Row label="Ex-date" value={day(dividend.exDate)} />
                  <Row label="Pay date" value={day(dividend.payDate)} />
                  <Row label="Per unit" value={rate(dividend.perUnitPoints)} />
                  <Row label="Units on the ex-date" value={units.toLocaleString('en-US')} />
                </div>
                <div className="h-px bg-white/10 my-4" />
                <Row label={units > 0 ? 'Comes to' : 'Owed to you'} value={money(amountCents)} strong />
                {units === 0 && (
                  <p className="text-slate-500 text-[11px] font-bold mt-3 leading-relaxed">
                    Nothing was held before this ex-date, so this one is not yours. Buying now does not
                    qualify — the shares had to be held the day before.
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        {paid.length > 0 && (
          <>
            <p className="text-slate-500 text-[10px] font-black tracking-widest mt-8 mb-3">PAID IN</p>
            <div className="space-y-2.5">
              {paid.map((t) => (
                <div key={t.id} className="flex items-center gap-3 p-4 rounded-3xl glass">
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-black text-[13px] truncate">{t.name}</p>
                    <p className="text-slate-500 text-[11px] font-bold mt-0.5">
                      {day(t.tradedAt)} · {t.units.toLocaleString('en-US')} units ×{' '}
                      {rate(t.perUnitPoints ?? 0)}
                    </p>
                  </div>
                  <p className="text-accent text-[13px] font-black shrink-0">+{money(tradeCents(t))}</p>
                </div>
              ))}
            </div>
          </>
        )}

        <p className="text-slate-600 text-[11px] font-bold text-center mt-8 leading-relaxed px-2">
          A dividend belongs to whoever held the shares the day before the ex-date, so these are worked out
          from your trade log rather than from what you hold today. Companies deduct tax and fees — if the
          amount that reaches your account differs, correct that payment in Trades.
        </p>
      </div>
    </div>
  );
};

export default Dividends;
