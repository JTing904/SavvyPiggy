import React, { useEffect, useMemo, useState } from 'react';
import type { Holding, InvestSettings, Trade } from '../types';
import { useT } from '../contexts/LanguageContext';
import { dateLocale, type Messages } from '../i18n';
import { byValueDesc, portfolioTotals, type Quotes } from '../services/holdings';
import { formatMoney, fromCents, toCents } from '../services/money';
import { since, type DailyClose, type ValuePoint } from '../services/trails';
import { dayKey } from '../services/analytics';
import HoldingStack from './HoldingStack';
import PickCard from './invest/PickCard';
import { LineChart } from './ui/Charts';
import { EmptyState } from './ui/EmptyState';
import { Icon } from './ui/Icon';
import { QuickAction } from './ui/IconTile';
import { BandLabel, PageBand } from './ui/PageBand';

type Range = 'month' | 'half' | 'year';
const RANGES: Range[] = ['month', 'half', 'year'];
const RANGE_MONTHS: Record<Range, number> = { month: 1, half: 6, year: 12 };

interface InvestHomeProps {
  holdings: Holding[];
  trades: Trade[];
  quotes: Quotes;
  investSettings?: InvestSettings;
  /** The shares' value at each close; null when a counter could not be priced. */
  trail: ValuePoint[] | null;
  closes: Record<string, DailyClose[]>;
  onOpenTrades: () => void;
  onOpenDividends: () => void;
  onOpenGrowth: () => void;
  onTrade: (holding: Holding, kind: 'buy' | 'sell') => void;
  onNewTrade: (kind: 'buy' | 'sell') => void;
  onMove: () => void;
  onOpenMonthlyBuy: () => void;
}

/** "2 min ago": how stale the worst price on screen is. */
const ago = (t: Messages, at: number, now: number) => {
  const minutes = Math.floor((now - at) / 60_000);
  if (minutes < 1) return t.home.ago.justNow;
  if (minutes < 60) return t.home.ago.minutes(minutes);
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t.home.ago.hours(hours);
  return t.home.ago.days(Math.floor(hours / 24));
};

const parseDay = (day: string) => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d);
};

/**
 * Investing: what the shares and the cash beside them are worth, how that has
 * moved day by day, and the counters. Savings never feed into these numbers.
 */
const InvestHome: React.FC<InvestHomeProps> = ({
  holdings,
  trades,
  quotes,
  investSettings,
  trail,
  closes,
  onOpenTrades,
  onOpenDividends,
  onOpenGrowth,
  onTrade,
  onNewTrade,
  onMove,
  onOpenMonthlyBuy,
}) => {
  const t = useT();
  const p = t.pro.invest;
  const money = (cents: number) => formatMoney(fromCents(cents));
  const [range, setRange] = useState<Range>('half');

  const portfolio = portfolioTotals(holdings, quotes);
  const potCents = toCents(investSettings?.potBalance ?? 0);
  const total = portfolio.valueCents + potCents;

  // The pick downloads months of prices, so it waits until this page is actually on screen.
  const [pickReady, setPickReady] = useState(false);
  useEffect(() => setPickReady(true), []);

  // The line ends on today's price when the market has one, so it agrees with the figure above it.
  const points = useMemo(() => {
    if (!trail || trail.length === 0) return [];
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth() - RANGE_MONTHS[range], now.getDate());
    const shown = since(trail, dayKey(from));
    const today = dayKey(now);
    const last = shown[shown.length - 1];
    if (portfolio.quotedAt === null || portfolio.missing.length > 0 || !last) return shown;
    return last.day === today ? [...shown.slice(0, -1), { day: today, cents: portfolio.valueCents }] : [...shown, { day: today, cents: portfolio.valueCents }];
  }, [trail, range, portfolio.quotedAt, portfolio.valueCents, portfolio.missing.length]);

  const dayLabel = (day: string) => parseDay(day).toLocaleDateString(dateLocale('en-GB'), { day: 'numeric', month: 'short' });
  const ticks = useMemo(() => {
    if (points.length < 2) return [];
    const at = (f: number) => points[Math.round((points.length - 1) * f)].day;
    return [0, 0.5, 1].map((f) => dayLabel(at(f)));
  }, [points]); // eslint-disable-line react-hooks/exhaustive-deps

  const gain = portfolio.gainCents;
  const gainText = gain < 0 ? t.pro.home.lost(money(-gain)) : t.pro.home.earned(money(gain));
  // Too few points is a new holding's history still filling, unless a held counter has no closes to read at all.
  const unread = trail === null || holdings.some((h) => !closes[h.symbol]?.length);

  return (
    <div className="flex min-h-full flex-col pb-24 font-figtree text-ink">
      <PageBand title={t.nav.invest} overlap={16}>
        <BandLabel className="mt-1">{p.total}</BandLabel>
        <p className="mt-0.5 truncate text-[34px] font-bold leading-[1.15] tracking-[-0.015em] tabular-nums">{money(total)}</p>
        {holdings.length > 0 && <p className="mt-1 truncate text-[13.5px] font-semibold tabular-nums text-band-sub">{p.upAndPot(gainText, money(potCents))}</p>}
      </PageBand>

      <div className="-mt-11 flex flex-col gap-2.5 px-4">
        {holdings.length > 0 && (
          <div className="rounded-3xl bg-card px-3.5 pb-2.5 pt-3 shadow-[0_2px_10px_rgba(20,35,58,0.1)]">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="min-w-0 truncate text-[12.5px] font-semibold text-mute">
                {points.length > 0 ? p.asOf(dayLabel(points[points.length - 1].day)) : p.shareValue}
              </span>
              <span role="group" aria-label={p.range} className="flex shrink-0 gap-0.5 rounded-[9px] bg-page p-0.5">
                {RANGES.map((r) => (
                  <button
                    key={r}
                    type="button"
                    aria-pressed={range === r}
                    onClick={() => setRange(r)}
                    className={`min-h-7 min-w-9 rounded-[7px] px-1 text-[12px] font-bold ${range === r ? 'bg-card text-ink' : 'text-mute'}`}
                  >
                    {p.ranges[r]}
                  </button>
                ))}
              </span>
            </div>
            {points.length >= 2 ? (
              <LineChart
                points={points.map((pt) => ({ value: pt.cents, label: dayLabel(pt.day) }))}
                ticks={ticks}
                color={5}
                format={(cents) => formatMoney(fromCents(cents), { decimals: 0 })}
                label={p.chart(money(points[points.length - 1].cents))}
              />
            ) : (
              <p className="py-6 text-center text-[13px] font-medium text-mute">{unread ? p.noLine : p.lineBuilding}</p>
            )}
          </div>
        )}

        <div className="grid grid-cols-4 rounded-3xl bg-card px-1 py-2.5">
          <QuickAction icon="plus" tint="blue" label={p.buy} onClick={() => onNewTrade('buy')} />
          <QuickAction icon="minus" tint="coral" label={p.sell} onClick={() => onNewTrade('sell')} />
          <QuickAction icon="coin" tint="amber" label={p.dividends} onClick={onOpenDividends} />
          <QuickAction icon="swap" tint="teal" label={p.move} onClick={onMove} />
        </div>

        {holdings.length === 0 ? (
          <>
            <EmptyState icon="trend" title={t.home.noCounters} body={t.home.noCountersHint} action={{ label: p.buy, onClick: () => onNewTrade('buy') }} />
            {/* Everything sold: the trades, and correcting a dividend among them, are still behind this. */}
            {trades.length > 0 && (
              <button type="button" onClick={onOpenTrades} className="min-h-9 self-center text-[13.5px] font-bold text-tblue active:opacity-70">
                {t.home.allTrades(trades.length)}
              </button>
            )}
          </>
        ) : (
          <div>
            <div className="flex min-h-9 items-center justify-between gap-2 px-1">
              <h2 className="text-[15px] font-bold">{p.holdings}</h2>
              <button type="button" onClick={onOpenTrades} className="min-h-9 text-[13.5px] font-bold text-tblue active:opacity-70">
                {t.home.allTrades(trades.length)}
              </button>
            </div>
            <HoldingStack holdings={byValueDesc(holdings, (h) => quotes[h.symbol])} quotes={quotes} closes={closes} missing={portfolio.missing} onTrade={onTrade} />
            <p className="mt-1.5 px-1 text-[12.5px] font-medium text-mute">
              {portfolio.quotedAt === null ? t.home.noPrices : t.home.priced(ago(t, portfolio.quotedAt, Date.now()))}
              {portfolio.missing.length > 0 && ` · ${t.home.heldAtCost(portfolio.missing.length)}`}
            </p>
          </div>
        )}

        {pickReady && investSettings && <PickCard invest={investSettings} quotes={quotes} onOpen={onOpenMonthlyBuy} />}

        <button type="button" onClick={onOpenGrowth} className="flex min-h-14 items-center justify-between rounded-3xl bg-card px-3.5 text-[14.5px] font-bold active:opacity-80">
          {p.growth}
          <Icon name="chev" size={18} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
};

export default InvestHome;
