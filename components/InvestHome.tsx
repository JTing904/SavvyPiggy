import React, { useEffect, useRef, useState } from 'react';
import type { Holding, InvestSettings, Trade } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useT } from '../contexts/LanguageContext';
import { byValueDesc, portfolioTotals, type Quotes } from '../services/holdings';
import { formatMoney, fromCents, toCents } from '../services/money';
import type { Messages } from '../i18n';
import type { Mode as NavMode } from './Navigation';
import Avatar from './Avatar';
import HoldingStack from './HoldingStack';
import PickCard from './invest/PickCard';
import PotCard from './invest/PotCard';
import { Amount } from './ui/Amount';
import { EmptyState } from './ui/EmptyState';
import { Icon } from './ui/Icon';

interface InvestHomeProps {
  holdings: Holding[];
  trades: Trade[];
  quotes: Quotes;
  investSettings?: InvestSettings;
  unreadAlerts: number;
  onModeChange: (mode: NavMode) => void;
  onOpenProfile: () => void;
  onOpenAlerts: () => void;
  onOpenTrades: () => void;
  onTrade: (holding: Holding, kind: 'buy' | 'sell') => void;
  /** Opens moving money between savings and the investment pot. */
  onPotMove?: (direction: 'in' | 'out') => void;
  onOpenMonthlyBuy?: () => void;
}

/** "2 min ago" — how stale the worst price on screen is. */
const ago = (t: Messages, at: number, now: number) => {
  const minutes = Math.floor((now - at) / 60_000);
  if (minutes < 1) return t.home.ago.justNow;
  if (minutes < 60) return t.home.ago.minutes(minutes);
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t.home.ago.hours(hours);
  return t.home.ago.days(Math.floor(hours / 24));
};

const greeting = (t: Messages) => {
  const hour = new Date().getHours();
  if (hour < 12) return t.home.greeting.morning;
  if (hour < 18) return t.home.greeting.afternoon;
  return t.home.greeting.evening;
};

/**
 * Home, the investing half: what the shares are worth, the cash waiting in the
 * pot, this month's pick, and the counters themselves. Savings never feed into
 * these numbers.
 */
const InvestHome: React.FC<InvestHomeProps> = ({
  holdings,
  trades,
  quotes,
  investSettings,
  unreadAlerts,
  onModeChange,
  onOpenProfile,
  onOpenAlerts,
  onOpenTrades,
  onTrade,
  onPotMove,
  onOpenMonthlyBuy,
}) => {
  const { user } = useAuth();
  const t = useT();
  const displayName = user?.displayName || user?.email?.split('@')[0] || t.home.defaultName;

  // Prices are whatever the holdings screen last cached: Home never goes to the network itself.
  const portfolio = portfolioTotals(holdings, quotes);
  // The investing total is the shares plus the cash waiting in the pot; savings never count it.
  const potCents = toCents(investSettings?.potBalance ?? 0);
  const investedTotal = portfolio.valueCents + potCents;
  const empty = holdings.length === 0 && potCents === 0;

  // The pick downloads months of prices, so it waits until this half is actually on screen.
  const [pickReady, setPickReady] = useState(false);
  useEffect(() => setPickReady(true), []);

  // A swipe to the right goes back to savings, as a swipe to the left there comes here.
  const start = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (!start.current) return;
    const dx = e.changedTouches[0].clientX - start.current.x;
    const dy = e.changedTouches[0].clientY - start.current.y;
    if (dx > 80 && Math.abs(dx) > Math.abs(dy) * 2) onModeChange('save');
  };

  return (
    <div className="flex min-h-full flex-col px-4 pb-40 pt-3 safe-pt font-figtree text-ink" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <div className="mb-2 flex items-center justify-between px-1">
        <div className="min-w-0">
          <p className="text-[12px] font-semibold text-mute">{greeting(t)}</p>
          <p className="truncate text-[17px] font-extrabold">{displayName}</p>
        </div>
        <div className="flex items-center gap-3">
          <button type="button" onClick={onOpenAlerts} aria-label={t.home.alerts} className="relative grid size-11 place-items-center rounded-full bg-card active:opacity-80">
            <Icon name="bell" size={20} />
            {unreadAlerts > 0 && <span className="absolute right-2.5 top-2.5 size-2.5 rounded-full bg-neg ring-2 ring-card" />}
          </button>
          <Avatar plain onClick={onOpenProfile} />
        </div>
      </div>

      <div role="tablist" aria-label={t.home.modeSwitch} className="flex items-baseline gap-5 px-1">
        {(['save', 'invest'] as const).map((m) => {
          const on = m === 'invest';
          return (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => onModeChange(m)}
              className={`min-h-11 text-left font-extrabold tracking-tight ${on ? 'text-[30px] text-ink' : 'text-[21px] text-mute'}`}
            >
              {m === 'save' ? t.home.modeSavings : t.home.modeInvesting}
            </button>
          );
        })}
      </div>

      {empty ? (
        <div className="mt-2 rounded-[28px] bg-lav p-5">
          <p className="text-[12.5px] font-bold">{t.home.investments}</p>
          <h2 className="mt-1 text-[22px] font-extrabold leading-snug tracking-tight">{t.home.trackHoldings}</h2>
          <p className="mt-1.5 text-[13px] font-medium leading-relaxed opacity-75">{t.home.trackHoldingsHint}</p>
          <button type="button" onClick={onOpenTrades} className="mt-4 inline-flex min-h-11 items-center gap-1 rounded-full bg-cta px-5 text-[14px] font-extrabold text-cta-fg active:opacity-80">
            {t.home.getStarted}
            <Icon name="chev" size={16} />
          </button>
        </div>
      ) : (
        <button type="button" onClick={onOpenTrades} className="mt-2 rounded-[28px] bg-lav p-5 text-left active:opacity-90">
          <p className="text-[12.5px] font-bold">{t.home.investments}</p>
          <Amount cents={investedTotal} size="xl" className="mt-1 block" />
          <p className="mt-1 flex items-center gap-1.5 text-[13px] font-extrabold">
            <span className={portfolio.dayChangeCents < 0 ? 'text-neg' : 'text-pos'}>
              {portfolio.dayChangeCents < 0 ? '▼' : '▲'} {formatMoney(fromCents(Math.abs(portfolio.dayChangeCents)))}
            </span>
            <span className="font-bold text-mute">{t.home.today}</span>
          </p>
          <div className="mt-2 flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-mute">
              {t.home.sharesAndPot(formatMoney(fromCents(portfolio.valueCents)), formatMoney(fromCents(potCents)))}
            </span>
            <span className="inline-flex shrink-0 items-center gap-0.5 text-[13px] font-extrabold">
              {t.home.view}
              <Icon name="chev" size={14} />
            </span>
          </div>
        </button>
      )}

      {investSettings && onPotMove && (
        <div className="mt-3">
          <PotCard balance={investSettings.potBalance ?? 0} onMoveIn={() => onPotMove('in')} onMoveOut={() => onPotMove('out')} />
        </div>
      )}

      {pickReady && investSettings && onOpenMonthlyBuy && (
        <div className="mt-3">
          <PickCard invest={investSettings} quotes={quotes} onOpen={onOpenMonthlyBuy} />
        </div>
      )}

      {holdings.length === 0 ? (
        <EmptyState icon="trend" title={t.home.noCounters} body={t.home.noCountersHint} className="mt-4" />
      ) : (
        <>
          <div className="mb-1 mt-6 flex items-baseline justify-between gap-3 px-1">
            <h2 className="text-[16px] font-extrabold">{t.home.yourCounters}</h2>
            <span className={`text-[13px] font-extrabold ${portfolio.gainCents < 0 ? 'text-neg' : 'text-pos'}`}>
              {formatMoney(fromCents(portfolio.gainCents), { signed: true })} · {portfolio.gainPercent >= 0 ? '+' : ''}
              {portfolio.gainPercent}%
            </span>
          </div>
          <p className="mb-2 px-1 text-[12px] font-medium text-mute">
            {portfolio.quotedAt === null ? t.home.noPrices : t.home.priced(ago(t, portfolio.quotedAt, Date.now()))}
            {portfolio.missing.length > 0 && ` · ${t.home.heldAtCost(portfolio.missing.length)}`}
          </p>

          <HoldingStack holdings={byValueDesc(holdings, (h) => quotes[h.symbol])} quotes={quotes} missing={portfolio.missing} onTrade={onTrade} />

          <button type="button" onClick={onOpenTrades} className="mt-3 flex min-h-12 w-full items-center justify-center rounded-3xl bg-card text-[14.5px] font-extrabold active:opacity-80">
            {t.home.allTrades(trades.length)}
          </button>
        </>
      )}
    </div>
  );
};

export default InvestHome;
