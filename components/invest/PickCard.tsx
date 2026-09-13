import React, { useMemo } from 'react';
import type { InvestSettings, PiggyBank } from '../../types';
import type { Quotes } from '../../services/holdings';
import { brokerById, securityTypeOf } from '../../services/fees';
import { formatMoney, fromCents, toCents } from '../../services/money';
import { useAdvisor } from '../../hooks/useAdvisor';
import { useT } from '../../contexts/LanguageContext';
import { dateLocale } from '../../i18n';
import { activeStyles, monthDate, pricePointsOfQuote, sizeBuy, watchSymbols } from './monthlyPlan';

interface PickCardProps {
  banks: PiggyBank[];
  invest: InvestSettings;
  quotes: Quotes;
  onOpen: () => void;
}

/**
 * This month's pick, on the investing Home, above the counters.
 *
 * It reads the same caches the monthly buy page fills, so once the page has
 * run this month the card costs a re-score and nothing more. It never goes to
 * the network for prices: whatever the app last priced is what it sizes with,
 * and without a price it simply names the counter.
 */
const PickCard: React.FC<PickCardProps> = ({ banks, invest, quotes, onOpen }) => {
  const t = useT();
  const c = t.plan.card;
  const symbols = useMemo(() => watchSymbols(invest.watchlist), [invest.watchlist]);
  const mix = invest.style?.mix ?? null;
  const advisor = useAdvisor({ watchlist: symbols, mix, quotes, enabled: symbols.length >= 2 && !!mix });

  const month = monthDate(advisor.month).toLocaleDateString(dateLocale('en-GB'), { month: 'long' });
  const pick = advisor.status === 'ready' ? advisor.ranked[0] ?? null : null;

  let headline: string;
  let meta: string | null = null;
  let why: string | null = null;
  let icon = 'chevron_right';

  if (!mix) {
    headline = c.setUp;
    why = c.setUpHint;
  } else if (symbols.length < 2) {
    headline = c.addCounters;
    why = c.addCountersHint;
  } else if (advisor.status === 'unavailable') {
    headline = c.unavailable;
    why = c.unavailableHint;
    icon = 'cloud_off';
  } else if (!pick) {
    headline = c.working;
    icon = 'progress_activity';
  } else {
    headline = invest.watchlist.find((w) => w.symbol === pick.symbol)?.name ?? pick.symbol;
    why = c.bestMatchFor(
      activeStyles(mix)
        .map((s) => `${t.plan.styles[s]} ${mix[s]}%`)
        .join(' · ')
    );
    // Sized only from the goal the monthly buy is paid from; with none chosen
    // there is no budget to size against, and the card does not invent one.
    const goal = invest.budgetGoalId ? banks.find((b) => b.id === invest.budgetGoalId && !b.archivedAt) : null;
    const broker = brokerById(invest.brokerId, invest.customRule);
    const points = pricePointsOfQuote(quotes[pick.symbol]);
    if (goal && broker && points) {
      const sizing = sizeBuy(
        Math.max(0, toCents(goal.currentAmount)),
        points,
        broker,
        securityTypeOf(pick.symbol, invest.typeOverrides),
        false
      );
      meta =
        sizing.kind === 'lots'
          ? c.unitsWithFees(sizing.order.units.toLocaleString('en-US'), formatMoney(fromCents(sizing.order.totalCents)))
          : c.notALot;
    }
  }

  const working = !!mix && symbols.length >= 2 && !pick && advisor.status !== 'unavailable';

  return (
    <button
      onClick={onOpen}
      className="w-full text-left rounded-3xl px-5 py-4 border border-accent/30 bg-gradient-to-b from-accent/10 to-accent/[0.03] active:scale-[0.99] transition-transform"
    >
      <div className="flex items-center gap-2">
        <span className="flex-1 min-w-0 truncate text-accent text-[10px] font-black uppercase tracking-widest">{c.pick(month)}</span>
        <span className={`material-symbols-rounded text-accent text-lg shrink-0 ${working ? 'animate-spin' : ''}`}>{icon}</span>
      </div>
      <p className={`mt-1 font-black tracking-tight truncate ${pick ? 'text-white text-xl' : working ? 'text-slate-400 text-sm' : 'text-white text-base'}`}>
        {headline}
      </p>
      {meta && <p className="mt-0.5 text-slate-300 text-xs font-bold tabular-nums truncate">{meta}</p>}
      {why && <p className="mt-2 text-slate-500 text-[11px] font-bold leading-snug">{why}</p>}
    </button>
  );
};

export default PickCard;
