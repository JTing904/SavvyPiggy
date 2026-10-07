import React, { useEffect, useMemo, useState } from 'react';
import type { InvestSettings, Trade } from '../../types';
import { buildHoldings, normalizeSymbol, type Quotes } from '../../services/holdings';
import { searchSymbols, type SymbolHit } from '../../services/quotes';
import { saveInvest } from '../../services/firestore';
import { BOARD_LOT, valueCents } from '../../services/fees';
import { formatMoney, fromCents } from '../../services/money';
import { useT } from '../../contexts/LanguageContext';
import { pricePointsOfQuote, priceText } from './monthlyPlan';
import { Icon } from '../ui/Icon';
import { Sheet } from '../ui/Sheet';

type Watchlist = InvestSettings['watchlist'];

interface WatchlistSheetProps {
  uid: string;
  watchlist: Watchlist;
  /** For "add what you already hold". */
  trades: Trade[];
  /** Prices for the rows, when there are any. */
  quotes: Quotes;
  onClose: () => void;
}

/**
 * The counters someone would buy. Only adding and removing — no weights —
 * because the pick is a comparison between them, not a portfolio to balance.
 *
 * Every change is saved the moment it is made. The list shown is kept here as
 * well, so two quick taps in a row each build on the one before rather than on
 * a snapshot that has not come back yet.
 */
const WatchlistSheet: React.FC<WatchlistSheetProps> = ({ uid, watchlist, trades, quotes, onClose }) => {
  const t = useT();
  const w = t.plan.watch;
  const [list, setList] = useState<Watchlist>(watchlist);
  const [term, setTerm] = useState('');
  const [hits, setHits] = useState<SymbolHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [problem, setProblem] = useState(false);

  // A change from elsewhere (another phone) still shows up.
  useEffect(() => setList(watchlist), [watchlist]);

  // Searching runs a beat after typing stops, so a name costs one request.
  useEffect(() => {
    const text = term.trim();
    if (text.length < 2) {
      setHits([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = setTimeout(async () => {
      setHits(await searchSymbols(text));
      setSearching(false);
    }, 350);
    return () => clearTimeout(timer);
  }, [term]);

  const save = (next: Watchlist) => {
    setList(next);
    setProblem(false);
    saveInvest(uid, { watchlist: next }).catch(() => setProblem(true));
  };

  const has = (symbol: string) => list.some((x) => x.symbol === symbol);

  const add = (symbol: string, name: string) => {
    const clean = normalizeSymbol(symbol);
    if (!clean || has(clean)) return;
    save([...list, { symbol: clean, name: name || clean }]);
  };

  const remove = (symbol: string) => save(list.filter((x) => x.symbol !== symbol));

  const held = useMemo(() => buildHoldings(trades).map((h) => ({ symbol: normalizeSymbol(h.symbol), name: h.name })), [trades]);

  return (
    <Sheet title={w.title} onClose={onClose} height="tall">
      <p className="px-1 text-[13px] font-medium leading-relaxed text-mute">{w.hint}</p>

      <div className="mt-4 flex min-h-12 items-center gap-3 rounded-[18px] bg-field px-4 focus-within:outline focus-within:outline-2 focus-within:outline-ink">
        <Icon name="ser" size={18} className="text-mute" />
        <input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder={w.search}
          aria-label={w.search}
          className="min-h-6 w-full min-w-0 border-0 bg-transparent p-0 text-[15px] font-semibold text-ink placeholder:text-mute focus:ring-0"
        />
        {term && (
          <button type="button" onClick={() => setTerm('')} aria-label={t.common.cancel} className="grid size-11 shrink-0 place-items-center text-mute">
            <Icon name="close" size={16} />
          </button>
        )}
      </div>

      {searching && <p className="mt-3 px-1 text-[12.5px] font-semibold text-mute">{w.searching}</p>}
      {!searching && term.trim().length >= 2 && hits.length === 0 && <p className="mt-3 px-1 text-[12.5px] font-semibold leading-relaxed text-mute">{w.noMatch}</p>}
      {hits.length > 0 && (
        <div className="mt-3 divide-y divide-line/10 rounded-3xl bg-card px-4 py-1">
          {hits.map((hit) => {
            const on = has(normalizeSymbol(hit.symbol));
            return (
              <button
                key={hit.symbol}
                type="button"
                onClick={() => add(hit.symbol, hit.name)}
                disabled={on}
                aria-label={w.add(hit.name)}
                className="flex min-h-14 w-full items-center gap-3 py-2.5 text-left active:opacity-70"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-bold">{hit.name}</span>
                  <span className="block truncate text-[12px] font-medium text-mute">{on ? `${hit.symbol} · ${w.added}` : hit.symbol}</span>
                </span>
                <Icon name={on ? 'check' : 'plus'} size={20} className={on ? 'text-pos' : 'text-mute'} />
              </button>
            );
          })}
        </div>
      )}

      {/* An empty list is most easily started from what is already owned. */}
      {list.length === 0 && held.length > 0 && (
        <button
          type="button"
          onClick={() => save(held.filter((h, i) => held.findIndex((x) => x.symbol === h.symbol) === i))}
          className="mt-4 flex w-full items-center gap-3 rounded-3xl bg-mint p-4 text-left active:opacity-80"
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-card/70">
            <Icon name="list" size={20} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[14.5px] font-extrabold">{w.addHeld}</span>
            <span className="block truncate text-[12px] font-medium opacity-75">
              {w.addHeldHint(held.length)} · {held.map((h) => h.name).join(', ')}
            </span>
          </span>
        </button>
      )}

      <div className="mt-4">
        {list.length === 0 ? (
          <p className="py-4 text-center text-[13px] font-semibold text-mute">{w.empty}</p>
        ) : (
          <div className="divide-y divide-line/10 rounded-3xl bg-card px-4 py-1">
            {list.map((item) => {
              const points = pricePointsOfQuote(quotes[item.symbol]);
              return (
                <div key={item.symbol} className="flex min-h-14 items-center gap-3 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-bold">{item.name}</span>
                    <span className="block truncate text-[12px] font-medium text-mute">
                      {points ? w.lot(priceText(points), formatMoney(fromCents(valueCents(BOARD_LOT, points)), { decimals: 0 })) : item.symbol}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => remove(item.symbol)}
                    aria-label={w.remove(item.name)}
                    className="grid size-11 shrink-0 place-items-center rounded-full bg-line/10 text-mute active:opacity-70"
                  >
                    <Icon name="close" size={16} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {problem && <p className="mt-3 px-1 text-[12.5px] font-bold text-neg">{w.couldNotSave}</p>}
      <p className="mt-4 px-1 text-[12px] font-medium leading-relaxed text-mute">{w.needsHistory}</p>
    </Sheet>
  );
};

export default WatchlistSheet;
