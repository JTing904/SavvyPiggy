import React, { useState } from 'react';
import type { Holding } from '../types';
import { averageCostCents, dayChangeCents, quoteValueCents, type Quotes } from '../services/holdings';
import { formatMoney, fromCents } from '../services/money';
import { useT } from '../contexts/LanguageContext';
import { Amount } from './ui/Amount';
import { Icon } from './ui/Icon';

interface HoldingStackProps {
  holdings: Holding[];
  quotes: Quotes;
  /** Counters with no price at all, so the note can say they are held at cost. */
  missing: string[];
  onTrade: (holding: Holding, kind: 'buy' | 'sell') => void;
}

const money = (cents: number, opts?: { decimals?: 0 | 2; signed?: boolean }) => formatMoney(fromCents(cents), opts);

/**
 * The positions themselves: one row each, opening to what is held, what it
 * cost, and the two things you can do about it. Nothing here writes: every
 * change goes through the trade log, so a row offers Buy and Sell and the log
 * is where a mistake gets fixed.
 */
const HoldingStack: React.FC<HoldingStackProps> = ({ holdings, quotes, missing, onTrade }) => {
  const t = useT();
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="divide-y divide-line/10 rounded-3xl bg-card px-4 py-1 text-ink">
      {holdings.map((holding) => {
        const open = openId === holding.id;
        const quote = quotes[holding.symbol];
        // With no price the position is worth what was paid for it, which
        // beats rendering a zero and making money look like it vanished.
        const priceNow = quote?.priceCents ?? Math.round(averageCostCents(holding));
        // Valued in points, so a half-sen price is not rounded down per unit.
        const valueNow = quote ? quoteValueCents(holding, quote) : holding.costCents;
        const gainCents = valueNow - holding.costCents;
        const gainPercent = holding.costCents > 0 ? Math.round((gainCents / holding.costCents) * 1000) / 10 : 0;
        const day = quote ? dayChangeCents(holding, quote) : 0;
        const falling = !!quote && quote.previousCloseCents > 0 && quote.priceCents < quote.previousCloseCents;
        const movePercent =
          quote && quote.previousCloseCents > 0
            ? Math.abs(Math.round(((quote.priceCents - quote.previousCloseCents) / quote.previousCloseCents) * 1000) / 10)
            : null;

        return (
          <div key={holding.id}>
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setOpenId(open ? null : holding.id)}
              className="flex min-h-16 w-full items-center gap-3 py-3 text-left active:opacity-70"
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-lav text-[11px] font-extrabold">
                {holding.name.slice(0, 3).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-bold">{holding.name}</span>
                <span className="block truncate text-[12px] font-medium text-mute">
                  {holding.units.toLocaleString('en-US')} · {money(priceNow)}
                  {movePercent !== null && (
                    <span className={falling ? 'font-bold text-neg' : 'font-bold text-pos'}>
                      {' '}
                      {falling ? '▼' : '▲'} {movePercent}%
                    </span>
                  )}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <Amount cents={valueNow} size="sm" />
                {quote && day !== 0 && (
                  <span className={`block text-[11.5px] font-bold ${day < 0 ? 'text-neg' : 'text-pos'}`}>{t.home.stack.today(money(day, { signed: true }))}</span>
                )}
              </span>
            </button>

            {open && (
              <div className="pb-4">
                <div className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-2xl bg-line/5 p-4">
                  <div>
                    <p className="text-[11.5px] font-bold text-mute">{t.home.stack.units}</p>
                    <p className="text-[15px] font-extrabold tabular-nums">{holding.units.toLocaleString('en-US')}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[11.5px] font-bold text-mute">{t.home.stack.avgCost}</p>
                    <p className="text-[15px] font-extrabold tabular-nums">{money(Math.round(averageCostCents(holding)))}</p>
                  </div>
                  <div>
                    <p className="text-[11.5px] font-bold text-mute">{t.home.stack.invested}</p>
                    <p className="text-[15px] font-extrabold tabular-nums">{money(holding.costCents)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[11.5px] font-bold text-mute">{t.home.stack.gain}</p>
                    <p className={`text-[15px] font-extrabold tabular-nums ${gainCents < 0 ? 'text-neg' : 'text-pos'}`}>
                      {money(gainCents, { signed: true })} ({gainPercent >= 0 ? '+' : ''}
                      {gainPercent}%)
                    </p>
                  </div>
                </div>
                {missing.includes(holding.symbol) && (
                  <p className="mt-3 flex items-start gap-2 text-[12px] font-medium leading-relaxed text-mute">
                    <Icon name="bell" size={14} className="mt-0.5" />
                    {t.home.stack.noPrice}
                  </p>
                )}
                <div className="mt-3 flex gap-2">
                  <button type="button" onClick={() => onTrade(holding, 'buy')} className="min-h-12 flex-1 rounded-full bg-cta text-[14px] font-extrabold text-cta-fg active:opacity-80">
                    {t.home.stack.buyMore}
                  </button>
                  <button type="button" onClick={() => onTrade(holding, 'sell')} className="min-h-12 flex-1 rounded-full bg-line/10 text-[14px] font-extrabold active:opacity-80">
                    {t.home.stack.sell}
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default HoldingStack;
