import React, { useMemo } from 'react';
import type { Snapshot, Trade } from '../types';
import {
  averageCostCents,
  buildHoldings,
  byValueDesc,
  costByMonth,
  marketValueCents,
  performance,
  quoteValueCents,
  type Quotes,
} from '../services/holdings';
import { formatMoney, fromCents } from '../services/money';
import { useT } from '../contexts/LanguageContext';
import { dateLocale } from '../i18n';
import { EmptyState } from './ui/EmptyState';
import { IconTile } from './ui/IconTile';
import { BandLabel, PageBand } from './ui/PageBand';

interface GrowthProps {
  trades: Trade[];
  quotes: Quotes;
  /** Month-end values, recorded as the months pass. Never back-dated. */
  snapshots: Snapshot[];
  onBack: () => void;
}

const money = (cents: number, opts?: { decimals?: 0 | 2; signed?: boolean }) =>
  formatMoney(fromCents(cents), opts);

const tone = (cents: number) => (cents < 0 ? 'text-neg' : cents > 0 ? 'text-pos' : 'text-ink');

/**
 * Whether the investing is actually ahead.
 *
 * The number on the Home card is only the paper gain on what is still held,
 * which is the flattering half of the story: it says nothing about what past
 * sales made or lost, and nothing about the dividends. This screen adds all
 * three and measures them against every ringgit ever put in.
 *
 * The chart holds only what was recorded: cost replayed from the trades, and
 * value at the month ends that kept a snapshot. Nothing is drawn between them,
 * because the app would have to invent it.
 */
const Growth: React.FC<GrowthProps> = ({ trades, quotes, snapshots, onBack }) => {
  const t = useT();
  const total = useMemo(() => performance(trades, quotes), [trades, quotes]);
  const holdings = useMemo(() => byValueDesc(buildHoldings(trades), (h) => quotes[h.symbol]), [trades, quotes]);

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
    <div className="flex min-h-full flex-col pb-40 font-figtree text-ink">
      <PageBand title={t.invest.growthTitle} onBack={onBack} overlap={trades.length === 0 ? 0 : 16}>
        {trades.length > 0 && (
          <>
            <BandLabel className="mt-1">{t.invest.totalReturn}</BandLabel>
            <p className="mt-0.5 truncate text-[34px] font-bold leading-[1.15] tracking-[-0.015em] tabular-nums">{money(total.totalCents, { signed: true })}</p>
            <p className="mt-1 truncate text-[13.5px] font-semibold tabular-nums text-band-sub">
              {t.invest.returnOn(`${total.returnPercent >= 0 ? '+' : ''}${total.returnPercent}`, money(total.investedCents))}
            </p>
          </>
        )}
      </PageBand>

      {trades.length === 0 ? (
        <EmptyState icon="trend" title={t.invest.nothingToMeasure} body={t.invest.nothingToMeasureBody} className="mt-3" />
      ) : (
        <div className="-mt-11 flex flex-col gap-2.5 px-4">
          <div className="divide-y divide-line/10 rounded-3xl bg-card px-3.5 py-0.5 shadow-[0_2px_10px_rgba(20,35,58,0.1)]">
            {parts.map((part) => (
              <div key={part.label} className="flex min-h-14 items-start gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-[14.5px] font-bold">{part.label}</p>
                  <p className="text-[12.5px] font-semibold text-mute">{part.note}</p>
                </div>
                <p className={`shrink-0 text-[14.5px] font-bold tabular-nums ${tone(part.cents)}`}>{money(part.cents, { signed: true })}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="min-w-0 rounded-3xl bg-card p-3.5">
              <p className="text-[12.5px] font-semibold text-mute">{t.invest.heldNow}</p>
              <p className="mt-0.5 truncate text-[18px] font-bold tabular-nums">{money(total.valueCents)}</p>
              <p className="mt-0.5 text-[12.5px] font-semibold text-mute">{t.invest.cost(money(total.costCents))}</p>
            </div>
            <div className="min-w-0 rounded-3xl bg-card p-3.5">
              <p className="text-[12.5px] font-semibold text-mute">{t.invest.income}</p>
              <p className="mt-0.5 truncate text-[18px] font-bold tabular-nums text-pos">{money(total.dividendCents)}</p>
              <p className="mt-0.5 text-[12.5px] font-semibold text-mute">
                {total.costCents > 0 ? t.invest.ofCost(Math.round((total.dividendCents / total.costCents) * 1000) / 10) : t.invest.noPositions}
              </p>
            </div>
          </div>

          {months.length > 1 && (
            <div className="rounded-3xl bg-card px-3.5 py-3">
              <h2 className="mb-2.5 text-[15px] font-bold">{t.invest.overTime}</h2>
              <svg viewBox={`0 0 ${W} ${H}`} className="w-full overflow-visible" role="img" aria-label={t.invest.chartLabel}>
                <polyline fill="none" stroke="rgb(var(--mute))" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" points={line((m) => m.costCents)} />
                {valued.length > 1 && (
                  <polyline fill="none" stroke="rgb(var(--c1))" strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" points={valuedLine} />
                )}
              </svg>
              <div className="mt-2.5 flex items-center gap-5">
                <span className="flex items-center gap-2 text-[12.5px] font-semibold text-mute">
                  <span className="h-0.5 w-4 bg-mute" /> {t.invest.whatItCost}
                </span>
                <span className="flex items-center gap-2 text-[12.5px] font-semibold">
                  <span className="h-0.5 w-4 bg-c1" /> {t.invest.whatItWasWorth}
                </span>
              </div>
              <p className="mt-2 text-[12.5px] font-medium leading-relaxed text-mute">
                {t.invest.chartNote(
                  valued.length === 0
                    ? t.invest.noMonthRecorded
                    : valued.length === 1
                      ? t.invest.oneMonthRecorded(monthName(valued[0].id))
                      : t.invest.lineStartsAt(monthName(valued[0].id))
                )}
              </p>
            </div>
          )}

          {holdings.length > 0 && (
            <>
              <h2 className="mt-1 px-1 text-[15px] font-bold">{t.invest.byCounter}</h2>
              <div className="divide-y divide-line/10 rounded-3xl bg-card px-3.5 py-0.5">
                {holdings.map((holding) => {
                  // Valued in points, so a half-sen price is not rounded down per unit.
                  const quote = quotes[holding.symbol];
                  const value = quote ? quoteValueCents(holding, quote) : marketValueCents(holding, Math.round(averageCostCents(holding)));
                  const gainCents = value - holding.costCents;
                  const share = total.valueCents > 0 ? Math.round((value / total.valueCents) * 100) : 0;
                  return (
                    <div key={holding.id} className="flex min-h-[60px] items-center gap-2.5 py-2">
                      <IconTile icon={<span className="text-[15px] font-extrabold">{holding.name.charAt(0).toUpperCase()}</span>} tint="violet" size={38} round />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[14.5px] font-bold">{holding.name}</p>
                        <p className="text-[12.5px] font-semibold text-mute">{t.invest.shareOfPortfolio(share, t.common.units(holding.units.toLocaleString('en-US')))}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-[14.5px] font-bold tabular-nums">{money(value)}</p>
                        <p className={`text-[12.5px] font-bold tabular-nums ${tone(gainCents)}`}>{money(gainCents, { signed: true })}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          <p className="mt-1 px-3 text-center text-[12.5px] font-medium leading-relaxed text-mute">{t.invest.growthFooter}</p>
        </div>
      )}
    </div>
  );
};

export default Growth;
