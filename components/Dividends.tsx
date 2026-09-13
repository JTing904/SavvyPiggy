import React, { useMemo } from 'react';
import type { Dividend, Trade } from '../types';
import { declaredIncome, exchangeDay, upcomingDividends, yieldOnCost } from '../services/dividends';
import { isDividendApiConfigured } from '../services/dividendApi';
import { tradeCents, unitsOnExDate } from '../services/holdings';
import { formatMoney, fromCents } from '../services/money';
import { useT } from '../contexts/LanguageContext';
import { dateLocale } from '../i18n';

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
  new Date(ms).toLocaleDateString(dateLocale('en-GB'), { day: 'numeric', month: 'short', year: 'numeric' });

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
  const t = useT();
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
        <h2 className="text-white text-2xl font-black tracking-tight">{t.invest.dividendsTitle}</h2>
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
            <p className="text-amber-300 font-black text-sm">{t.invest.notConnected}</p>
            <p className="text-amber-200/70 text-[11px] font-bold mt-2 leading-relaxed">
              {t.invest.notConnectedBody}
            </p>
          </div>
        )}

        {yields.length > 0 && (
          <>
            <p className="text-slate-500 text-[10px] font-black tracking-widest mt-7 mb-3">
              {t.invest.yieldHeading}
            </p>
            <div className="space-y-2.5">
              {yields.map(({ symbol, name, y }) => (
                <div key={symbol} className="flex items-center gap-3 p-4 rounded-3xl glass">
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-black text-[13px] truncate">{name}</p>
                    <p className="text-slate-500 text-[11px] font-bold mt-0.5">
                      {t.invest.yieldLine(money(y.paidCents), money(y.costCents))}
                    </p>
                  </div>
                  <p className="text-accent text-lg font-black shrink-0">{y.percent}%</p>
                </div>
              ))}
            </div>
            <p className="text-slate-600 text-[11px] font-bold mt-3 leading-relaxed px-1">
              {t.invest.yieldNote}
            </p>
          </>
        )}

        {paid.length > 0 && (
          <div className="rounded-3xl bg-accent/10 border border-accent/25 p-5 mt-5">
            <p className="text-accent/70 text-[10px] font-black uppercase tracking-widest">{t.invest.receivedSoFar}</p>
            <p className="text-accent text-3xl font-black tracking-tight mt-1">{money(paidTotal)}</p>
            <p className="text-accent/60 text-[11px] font-bold mt-1">
              {t.invest.acrossPayments(paid.length)}
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
                {t.invest.declaredNext12}
              </p>
              <p className="text-accent text-2xl font-black tabular-nums">{money(year.totalCents)}</p>
            </div>
            <div className="mt-4 space-y-2.5">
              <Row label={t.invest.alreadyYours} value={money(year.lockedCents)} />
              <Row label={t.invest.ifStillHeld} value={money(year.pendingCents)} />
            </div>
            <p className="text-slate-600 text-[11px] font-medium mt-4 leading-relaxed">
              {t.invest.declaredNote}
            </p>
          </div>
        )}

        <p className="text-slate-500 text-[10px] font-black tracking-widest mt-7 mb-3">{t.invest.comingUp}</p>
        {upcoming.length === 0 ? (
          <div className="rounded-3xl glass p-5">
            {/*
              An empty list means one of two very different things, and saying
              the wrong one is a claim about the user's own holdings. Until a
              fetch has succeeded, the honest answer is that we do not know.
            */}
            <p className="text-slate-400 text-xs font-bold leading-relaxed">
              {known
                ? t.invest.nothingAnnounced
                : t.invest.couldNotFetch}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {upcoming.map(({ id, dividend, units, amountCents }) => (
              // The dividend's own id: two can share a counter and an ex-date.
              <div key={id} className="rounded-3xl glass p-5">
                <div className="flex items-baseline gap-3">
                  {/* The counter code never truncates: a "1155" shortened to
                      "115" names a different company. The subject gives way. */}
                  <p className="text-white font-black text-[15px] shrink-0">{dividend.symbol}</p>
                  <span className="text-slate-500 text-[10px] font-black text-right flex-1 min-w-0 truncate">
                    {dividend.subject}
                  </span>
                </div>
                <div className="mt-4 space-y-2.5">
                  {/* As calendar days: west of Greenwich a UTC-midnight stamp would read as the day before. */}
                  <Row label={t.invest.exDate} value={day(exchangeDay(dividend.exDate))} />
                  <Row label={t.invest.payDate} value={day(exchangeDay(dividend.payDate))} />
                  <Row label={t.invest.perUnit} value={rate(dividend.perUnitPoints)} />
                  <Row label={t.invest.unitsOnExDate} value={units.toLocaleString('en-US')} />
                </div>
                <div className="h-px bg-white/10 my-4" />
                <Row label={units > 0 ? t.invest.comesTo : t.invest.owedToYou} value={money(amountCents)} strong />
                {units === 0 && (
                  <p className="text-slate-500 text-[11px] font-bold mt-3 leading-relaxed">
                    {t.invest.notYours}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        {paid.length > 0 && (
          <>
            <p className="text-slate-500 text-[10px] font-black tracking-widest mt-8 mb-3">{t.invest.paidIn}</p>
            <div className="space-y-2.5">
              {paid.map((trade) => (
                <div key={trade.id} className="flex items-center gap-3 p-4 rounded-3xl glass">
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-black text-[13px] truncate">{trade.name}</p>
                    <p className="text-slate-500 text-[11px] font-bold mt-0.5">
                      {day(trade.tradedAt)} · {t.common.units(trade.units.toLocaleString('en-US'))} ×{' '}
                      {rate(trade.perUnitPoints ?? 0)}
                    </p>
                  </div>
                  <p className="text-accent text-[13px] font-black shrink-0">+{money(tradeCents(trade))}</p>
                </div>
              ))}
            </div>
          </>
        )}

        <p className="text-slate-600 text-[11px] font-bold text-center mt-8 leading-relaxed px-2">
          {t.invest.dividendsFooter}
        </p>
      </div>
    </div>
  );
};

export default Dividends;
