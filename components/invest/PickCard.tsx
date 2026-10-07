import React, { useMemo } from 'react';
import type { InvestSettings } from '../../types';
import type { Quotes } from '../../services/holdings';
import { readCache as readQuoteCache } from '../../services/quotes';
import { useAdvisor } from '../../hooks/useAdvisor';
import { useT } from '../../contexts/LanguageContext';
import { dateLocale } from '../../i18n';
import { activeStyles, mergeQuotes, monthDate, watchSymbols } from './monthlyPlan';
import { Icon } from '../ui/Icon';

interface PickCardProps {
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
const PickCard: React.FC<PickCardProps> = ({ invest, quotes, onOpen }) => {
  const t = useT();
  const c = t.plan.card;
  const symbols = useMemo(() => watchSymbols(invest.watchlist), [invest.watchlist]);
  const mix = invest.style?.mix ?? null;
  // The app's quotes only move when the app itself refreshes; the monthly buy
  // page fetches its own and they land in the phone's quote cache. Taking the
  // later of the two means both screens score with the same prices and name
  // the same counter. Still no network from here.
  const prices = useMemo(() => mergeQuotes(quotes, readQuoteCache()), [quotes]);
  const advisor = useAdvisor({ watchlist: symbols, mix, quotes: prices, enabled: symbols.length >= 2 && !!mix });

  const month = monthDate(advisor.month).toLocaleDateString(dateLocale('en-GB'), { month: 'long' });
  const pick = advisor.status === 'ready' ? advisor.ranked[0] ?? null : null;
  // Ready with nothing ranked: no counter on the list has the history to be scored.
  const nothingScored = advisor.status === 'ready' && !pick;

  let headline: string;
  let why: string | null = null;

  if (!mix) {
    headline = c.setUp;
    why = c.setUpHint;
  } else if (symbols.length < 2) {
    headline = c.addCounters;
    why = c.addCountersHint;
  } else if (advisor.status === 'unavailable') {
    headline = c.unavailable;
    why = c.unavailableHint;
  } else if (nothingScored) {
    headline = c.noPick;
    why = t.plan.noScores;
  } else if (!pick) {
    headline = c.working;
  } else {
    headline = invest.watchlist.find((w) => w.symbol === pick.symbol)?.name ?? pick.symbol;
    why = c.bestMatchFor(
      activeStyles(mix)
        .map((s) => `${t.plan.styles[s]} ${mix[s]}%`)
        .join(' · ')
    );
  }

  const working = !!mix && symbols.length >= 2 && !pick && !nothingScored && advisor.status !== 'unavailable';

  return (
    <button type="button" onClick={onOpen} className="flex w-full items-center gap-3 rounded-3xl bg-sun px-5 py-4 text-left text-ink active:opacity-80">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] font-bold">{c.pick(month)}</span>
        <span className={`mt-0.5 block truncate font-extrabold tracking-tight ${pick ? 'text-[24px]' : 'text-[16px]'}`}>{headline}</span>
        {why && <span className="mt-0.5 block text-[12.5px] font-medium leading-snug opacity-75">{why}</span>}
      </span>
      <span className={`grid size-10 shrink-0 place-items-center rounded-full bg-cta text-cta-fg ${working ? 'animate-pulse motion-reduce:animate-none' : ''}`}>
        <Icon name="chev" size={18} />
      </span>
    </button>
  );
};

export default PickCard;
