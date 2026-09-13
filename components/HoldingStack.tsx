import React, { useState } from 'react';
import type { Holding } from '../types';
import {
  averageCostCents,
  dayChangeCents,
  quoteValueCents,
  type Quotes,
} from '../services/holdings';
import { formatMoney, fromCents } from '../services/money';
import { SLICE_COLORS } from './DonutChart';
import { useT } from '../contexts/LanguageContext';

interface HoldingStackProps {
  holdings: Holding[];
  quotes: Quotes;
  /** Counters with no price at all, so the note can say they are held at cost. */
  missing: string[];
  onTrade: (holding: Holding, kind: 'buy' | 'sell') => void;
}

const money = (cents: number, opts?: { decimals?: 0 | 2; signed?: boolean }) =>
  formatMoney(fromCents(cents), opts);

/**
 * Card colours are mixed towards black and white rather than faded to an
 * alpha: the cards overlap, and a translucent one shows the card beneath
 * straight through it.
 */
const mix = (hex: string, amount: number, towards: number) => {
  const value = parseInt(hex.replace('#', ''), 16);
  const channel = (shift: number) => {
    const c = (value >> shift) & 255;
    return Math.round(c + (towards - c) * amount);
  };
  return `rgb(${channel(16)}, ${channel(8)}, ${channel(0)})`;
};

const darken = (hex: string) => mix(hex, 0.42, 0);
/** The lit corner, where the light in the gradient comes from. */
const lighten = (hex: string) => mix(hex, 0.28, 255);

/**
 * The positions themselves, stacked like cards in a wallet. Nothing here
 * writes: every change goes through the trade log, so a card offers Buy and
 * Sell and the log is where a mistake gets fixed.
 */
const HoldingStack: React.FC<HoldingStackProps> = ({ holdings, quotes, missing, onTrade }) => {
  const t = useT();
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div>
      {holdings.map((holding, index) => {
        const open = openId === holding.id;
        // The card after an open one has to stop climbing over it, or the
        // overlap swallows the buttons the expansion exists to show.
        const followsOpen = index > 0 && openId === holdings[index - 1].id;
        const quote = quotes[holding.symbol];
        // With no price the position is worth what was paid for it, which
        // beats rendering a zero and making money look like it vanished.
        const priceNow = quote?.priceCents ?? Math.round(averageCostCents(holding));
        // Valued in points, so a half-sen price is not rounded down per unit.
        const valueNow = quote ? quoteValueCents(holding, quote) : holding.costCents;
        const position = {
          cents: valueNow - holding.costCents,
          percent: holding.costCents > 0 ? Math.round(((valueNow - holding.costCents) / holding.costCents) * 1000) / 10 : 0,
        };
        const day = quote ? dayChangeCents(holding, quote) : 0;
        const color = SLICE_COLORS[index % SLICE_COLORS.length];

        return (
          <div
            key={holding.id}
            onClick={() => setOpenId(open ? null : holding.id)}
            style={{
              background: `linear-gradient(152deg, ${lighten(color)} 0%, ${color} 38%, ${darken(color)} 100%)`,
              marginTop: index === 0 ? 0 : open || followsOpen ? 12 : -46,
              marginBottom: open ? 12 : 0,
              // Later cards lie on top, so their shadow falls across the one
              // behind rather than under it — except an open card, which has
              // to clear everything.
              zIndex: open ? holdings.length + 1 : index + 1,
              boxShadow: [
                // A tight contact shadow at the edge and a wide soft one
                // beneath: together they read as a card lifted off the page.
                // The insets are the bevel, lit along the top edge and shaded
                // along the bottom.
                '0 2px 3px rgba(0, 0, 0, 0.45)',
                open ? '0 26px 44px -14px rgba(0, 0, 0, 0.7)' : '0 16px 28px -12px rgba(0, 0, 0, 0.65)',
                'inset 0 1px 0 rgba(255, 255, 255, 0.5)',
                'inset 0 -1px 0 rgba(0, 0, 0, 0.22)',
                'inset 0 -16px 28px -20px rgba(0, 0, 0, 0.55)',
              ].join(', '),
            }}
            className="relative rounded-[1.6rem] px-5 pt-4 pb-5 text-black transition-all cursor-pointer"
          >
            {/* Light falling across the top-left corner. A flat rectangle only
                reads as a raised surface once something catches the light. */}
            <div
              className="pointer-events-none absolute inset-0 rounded-[1.6rem]"
              style={{
                background:
                  'radial-gradient(120% 90% at 8% -12%, rgba(255, 255, 255, 0.42) 0%, rgba(255, 255, 255, 0.10) 34%, rgba(255, 255, 255, 0) 62%)',
              }}
            />
            <div className="relative">
              <div className="flex items-center gap-2">
                <p className="font-black text-[15px] truncate">{holding.name}</p>
                <div className="flex-1" />
                <span className="text-[10px] font-black opacity-80 shrink-0">{holding.symbol}</span>
              </div>
              <div className="flex items-baseline gap-2 mt-0.5">
                <p className="text-xl font-black">{money(priceNow)}</p>
                {quote && quote.previousCloseCents > 0 && (
                  <span className="text-[11px] font-black opacity-80">
                    {quote.priceCents < quote.previousCloseCents ? '▼' : '▲'}{' '}
                    {Math.abs(
                      Math.round(((quote.priceCents - quote.previousCloseCents) / quote.previousCloseCents) * 1000) / 10
                    )}
                    %
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-1.5">
                {/* The position's own move in ringgit belongs next to the
                    position, not next to a per-unit price. */}
                <span className="text-[10px] font-bold opacity-75">
                  {t.home.stack.marketValue}{quote && day !== 0 ? ` · ${t.home.stack.today(money(day, { signed: true }))}` : ''}
                </span>
                <div className="flex-1" />
                <span className="text-sm font-black">{money(valueNow)}</span>
              </div>

              {open && (
                <div onClick={(e) => e.stopPropagation()}>
                  <div className="h-px bg-black/15 my-3" />
                  <div className="grid grid-cols-2 gap-y-3">
                    <div>
                      <p className="text-[9px] font-black opacity-70 tracking-wider">{t.home.stack.units}</p>
                      <p className="text-sm font-black">{holding.units.toLocaleString('en-US')}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[9px] font-black opacity-70 tracking-wider">{t.home.stack.avgCost}</p>
                      <p className="text-sm font-black">{money(Math.round(averageCostCents(holding)))}</p>
                    </div>
                    <div>
                      <p className="text-[9px] font-black opacity-70 tracking-wider">{t.home.stack.invested}</p>
                      <p className="text-sm font-black">{money(holding.costCents)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[9px] font-black opacity-70 tracking-wider">{t.home.stack.gain}</p>
                      <p className="text-sm font-black">
                        {money(position.cents, { signed: true })} ({position.percent >= 0 ? '+' : ''}
                        {position.percent}%)
                      </p>
                    </div>
                  </div>
                  {missing.includes(holding.symbol) && (
                    <p className="text-[10px] font-bold opacity-70 mt-3 leading-relaxed">
                      {t.home.stack.noPrice}
                    </p>
                  )}
                  <div className="flex gap-2 mt-4">
                    <button
                      onClick={() => onTrade(holding, 'buy')}
                      className="flex-1 h-10 rounded-full bg-black/15 text-xs font-black active:scale-95 transition-transform"
                    >
                      {t.home.stack.buyMore}
                    </button>
                    <button
                      onClick={() => onTrade(holding, 'sell')}
                      className="flex-1 h-10 rounded-full bg-black/15 text-xs font-black active:scale-95 transition-transform"
                    >
                      {t.home.stack.sell}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default HoldingStack;
