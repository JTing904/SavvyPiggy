import React, { useMemo } from 'react';
import type { Snapshot, Trade } from '../types';
import {
  averageCostCents,
  buildHoldings,
  costByMonth,
  marketValueCents,
  performance,
  type Quotes,
} from '../services/holdings';
import { formatMoney, fromCents } from '../services/money';
import { SLICE_COLORS } from './DonutChart';
import { useT } from '../contexts/LanguageContext';
import { dateLocale } from '../i18n';

interface GrowthProps {
  trades: Trade[];
  quotes: Quotes;
  /** Month-end values, recorded as the months pass. Never back-dated. */
  snapshots: Snapshot[];
  onBack: () => void;
}

const money = (cents: number, opts?: { decimals?: 0 | 2; signed?: boolean }) =>
  formatMoney(fromCents(cents), opts);

const tone = (cents: number) => (cents < 0 ? 'text-red-400' : cents > 0 ? 'text-primary' : 'text-white');

/**
 * Whether the investing is actually ahead.
 *
 * The number on the Home card is only the paper gain on what is still held,
 * which is the flattering half of the story: it says nothing about what past
 * sales made or lost, and nothing about the dividends. This screen adds all
 * three and measures them against every ringgit ever put in.
 *
 * There is no chart. Drawing one would need a price for every past day, which
 * the app does not have and would have to invent.
 */
const Growth: React.FC<GrowthProps> = ({ trades, quotes, snapshots, onBack }) => {
  const t = useT();
  const total = useMemo(() => performance(trades, quotes), [trades, quotes]);
  const holdings = useMemo(() => buildHoldings(trades), [trades]);

  /* The chart. Cost is replayed; value only exists where a snapshot does. */
  const months = useMemo(() => costByMonth(trades), [trades]);
  const valued = useMemo(
    () => snapshots.filter((s) => months.some((m) => m.key === s.id)),
    [snapshots, months]
  );

  const W = 320;
  const H = 120;
  const top = Math.max(
    1,
    ...months.map((m) => m.costCents),
    ...valued.map((s) => s.valueCents)
  );
  const x = (i: number) => (months.length < 2 ? 0 : (i / (months.length - 1)) * W);
  const y = (cents: number) => H - (cents / top) * (H - 8) - 4;
  const line = (pick: (m: (typeof months)[number]) => number) =>
    months.map((m, i) => `${x(i)},${y(pick(m))}`).join(' ');
  const valuedLine = valued
    .map((s) => `${x(months.findIndex((m) => m.key === s.id))},${y(s.valueCents)}`)
    .join(' ');

  /**
   * The month a snapshot describes, from its own id. Not from `at`, which is
   * the month *end* — an August record carries the first of September, and
   * naming it "September" would misdate the one thing this chart promises to
   * get right.
   */
  const monthName = (id: string) => {
    const [year, month] = id.split('-').map(Number);
    return new Date(year, month - 1, 1).toLocaleDateString(dateLocale('en-GB'), {
      month: 'long',
      year: 'numeric',
    });
  };

  const parts = [
    { label: t.invest.onHeld, cents: total.unrealisedCents, note: t.invest.onHeldNote },
    { label: t.invest.onSold, cents: total.realisedCents, note: t.invest.onSoldNote },
    { label: t.invest.dividendsPaidIn, cents: total.dividendCents, note: t.invest.dividendsPaidInNote },
  ];

  return (
    <div className="flex flex-col h-full bg-bg-dark safe-pt">
      <div className="flex items-center px-6 py-4 gap-4 sticky top-0 bg-bg-dark/95 z-20">
        <button
          onClick={onBack}
          className="size-10 shrink-0 rounded-full glass flex items-center justify-center text-slate-300 active:scale-90 transition-transform"
        >
          <span className="material-symbols-rounded text-xl">arrow_back_ios_new</span>
        </button>
        <h2 className="text-white text-2xl font-black tracking-tight">{t.invest.growthTitle}</h2>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar px-6 pb-40">
        {trades.length === 0 ? (
          <div className="text-center py-20">
            <span className="material-symbols-rounded text-slate-700 text-5xl">trending_up</span>
            <p className="text-white font-black mt-4">{t.invest.nothingToMeasure}</p>
            <p className="text-slate-500 text-xs font-bold mt-2 leading-relaxed px-6">
              {t.invest.nothingToMeasureBody}
            </p>
          </div>
        ) : (
          <>
            <div className="rounded-[2rem] bg-surface border border-white/5 p-6 shadow-xl">
              <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest">
                {t.invest.totalReturn}
              </p>
              <p className={`text-4xl font-black tracking-tight mt-1 ${tone(total.totalCents)}`}>
                {money(total.totalCents, { signed: true })}
              </p>
              <p className="text-slate-500 text-xs font-bold mt-1">
                {t.invest.returnOn(`${total.returnPercent >= 0 ? '+' : ''}${total.returnPercent}`, money(total.investedCents))}
              </p>

              <div className="h-px bg-white/10 my-5" />

              <div className="space-y-4">
                {parts.map((part) => (
                  <div key={part.label} className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-[13px] font-black">{part.label}</p>
                      <p className="text-slate-600 text-[11px] font-bold mt-0.5">{part.note}</p>
                    </div>
                    <p className={`text-[13px] font-black shrink-0 ${tone(part.cents)}`}>
                      {money(part.cents, { signed: true })}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mt-4">
              <div className="rounded-3xl glass p-5">
                <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest">{t.invest.heldNow}</p>
                <p className="text-white text-xl font-black mt-1">{money(total.valueCents)}</p>
                <p className="text-slate-600 text-[11px] font-bold mt-0.5">
                  {t.invest.cost(money(total.costCents))}
                </p>
              </div>
              <div className="rounded-3xl glass p-5">
                <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest">
                  {t.invest.income}
                </p>
                <p className="text-accent text-xl font-black mt-1">{money(total.dividendCents)}</p>
                <p className="text-slate-600 text-[11px] font-bold mt-0.5">
                  {total.costCents > 0
                    ? t.invest.ofCost(Math.round((total.dividendCents / total.costCents) * 1000) / 10)
                    : t.invest.noPositions}
                </p>
              </div>
            </div>

            {months.length > 1 && (
              <>
                <p className="text-slate-500 text-[10px] font-black tracking-widest mt-8 mb-3">
                  {t.invest.overTime}
                </p>
                <div className="rounded-[2rem] bg-surface border border-white/5 p-5 shadow-xl">
                  <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={t.invest.chartLabel}>
                    <polyline
                      fill="none"
                      stroke="#64748B"
                      strokeWidth="2"
                      strokeLinejoin="round"
                      points={line((m) => m.costCents)}
                    />
                    {valued.length > 1 && (
                      <polyline
                        fill="none"
                        stroke="#4ADE80"
                        strokeWidth="2.5"
                        strokeLinejoin="round"
                        points={valuedLine}
                      />
                    )}
                  </svg>
                  <div className="flex items-center gap-5 mt-3">
                    <span className="flex items-center gap-2 text-[11px] font-bold text-slate-400">
                      <span className="w-4 h-0.5 bg-slate-500" /> {t.invest.whatItCost}
                    </span>
                    <span className="flex items-center gap-2 text-[11px] font-bold text-slate-400">
                      <span className="w-4 h-0.5 bg-primary" /> {t.invest.whatItWasWorth}
                    </span>
                  </div>
                  <p className="text-slate-600 text-[11px] font-bold mt-3 leading-relaxed">
                    {t.invest.chartNote(
                      valued.length === 0
                        ? t.invest.noMonthRecorded
                        : valued.length === 1
                          ? t.invest.oneMonthRecorded(monthName(valued[0].id))
                          : t.invest.lineStartsAt(monthName(valued[0].id))
                    )}
                  </p>
                </div>
              </>
            )}

            {holdings.length > 0 && (
              <>
                <p className="text-slate-500 text-[10px] font-black tracking-widest mt-8 mb-3">
                  {t.invest.byCounter}
                </p>
                <div className="space-y-2.5">
                  {holdings.map((holding, index) => {
                    const price = quotes[holding.symbol]?.priceCents ?? Math.round(averageCostCents(holding));
                    const value = marketValueCents(holding, price);
                    const gainCents = value - holding.costCents;
                    const share = total.valueCents > 0 ? Math.round((value / total.valueCents) * 100) : 0;
                    return (
                      <div key={holding.id} className="flex items-center gap-3 p-4 rounded-3xl glass">
                        <span
                          className="size-2.5 rounded-full shrink-0"
                          style={{ background: SLICE_COLORS[index % SLICE_COLORS.length] }}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-white font-black text-[13px] truncate">{holding.name}</p>
                          <p className="text-slate-500 text-[11px] font-bold mt-0.5">
                            {t.invest.shareOfPortfolio(share, t.common.units(holding.units.toLocaleString('en-US')))}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-white text-[13px] font-black">{money(value)}</p>
                          <p className={`text-[11px] font-black ${tone(gainCents)}`}>
                            {money(gainCents, { signed: true })}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            <p className="text-slate-600 text-[11px] font-bold text-center mt-8 leading-relaxed px-2">
              {t.invest.growthFooter}
            </p>
          </>
        )}
      </div>
    </div>
  );
};

export default Growth;
