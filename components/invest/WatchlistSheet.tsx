import React, { useEffect, useMemo, useState } from 'react';
import type { InvestSettings, Trade } from '../../types';
import { buildHoldings, normalizeSymbol, type Quotes } from '../../services/holdings';
import { searchSymbols, type SymbolHit } from '../../services/quotes';
import { saveInvest } from '../../services/firestore';
import { BOARD_LOT, valueCents } from '../../services/fees';
import { formatMoney, fromCents } from '../../services/money';
import { useBackHandler } from '../../hooks/useBackHandler';
import { useT } from '../../contexts/LanguageContext';
import { pricePointsOfQuote, priceText } from './monthlyPlan';

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

  useBackHandler(true, onClose);

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
    <div className="fixed inset-0 z-50 flex items-end bg-black/85 veil-in" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md mx-auto bg-surface sheet-rise rounded-t-[2rem] border-t border-white/10 px-6 pt-4 pb-8 max-h-[90%] overflow-y-auto no-scrollbar safe-pb"
      >
        <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-5" />

        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <h3 className="text-white text-xl font-black">{w.title}</h3>
            <p className="text-slate-500 text-[11px] font-bold mt-1 leading-relaxed">{w.hint}</p>
          </div>
          <button
            onClick={onClose}
            aria-label={t.common.close}
            className="size-10 shrink-0 rounded-full glass flex items-center justify-center text-slate-400 active:scale-90 transition-transform"
          >
            <span className="material-symbols-rounded">close</span>
          </button>
        </div>

        <div className="mt-4 flex items-center gap-3 h-12 px-4 rounded-2xl bg-white/5 border border-white/10 focus-within:border-accent/50 transition-colors">
          <span className="material-symbols-rounded text-slate-500 text-xl">search</span>
          <input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder={w.search}
            className="w-full min-w-0 border-0 bg-transparent text-white text-sm font-bold focus:outline-none placeholder:text-slate-600"
          />
          {term && (
            <button onClick={() => setTerm('')} aria-label={t.common.cancel} className="text-slate-500 shrink-0">
              <span className="material-symbols-rounded text-lg">close</span>
            </button>
          )}
        </div>

        {searching && <p className="text-slate-500 text-xs font-bold mt-3">{w.searching}</p>}
        {!searching && term.trim().length >= 2 && hits.length === 0 && (
          <p className="text-slate-500 text-xs font-bold mt-3 leading-relaxed">{w.noMatch}</p>
        )}
        {hits.length > 0 && (
          <div className="mt-3 space-y-2">
            {hits.map((hit) => {
              const on = has(normalizeSymbol(hit.symbol));
              return (
                <button
                  key={hit.symbol}
                  onClick={() => add(hit.symbol, hit.name)}
                  disabled={on}
                  aria-label={w.add(hit.name)}
                  className="w-full flex items-center gap-3 p-3 rounded-2xl bg-white/5 border border-white/10 text-left active:scale-95 transition-transform disabled:active:scale-100"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-black text-sm truncate">{hit.name}</p>
                    <p className="text-slate-500 text-[11px] font-bold truncate">
                      {on ? `${hit.symbol} · ${w.added}` : hit.symbol}
                    </p>
                  </div>
                  <span className={`material-symbols-rounded ${on ? 'text-accent' : 'text-slate-500'}`}>
                    {on ? 'check' : 'add'}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* An empty list is most easily started from what is already owned. */}
        {list.length === 0 && held.length > 0 && (
          <button
            onClick={() => save(held.filter((h, i) => held.findIndex((x) => x.symbol === h.symbol) === i))}
            className="w-full mt-4 flex items-center gap-3 p-3 rounded-2xl bg-accent/10 border border-accent/30 text-left active:scale-95 transition-transform"
          >
            <span className="size-9 shrink-0 rounded-xl bg-accent/15 text-accent flex items-center justify-center">
              <span className="material-symbols-rounded text-xl">playlist_add</span>
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-white font-black text-sm">{w.addHeld}</p>
              <p className="text-slate-400 text-[11px] font-bold truncate">
                {w.addHeldHint(held.length)} · {held.map((h) => h.name).join(', ')}
              </p>
            </div>
          </button>
        )}

        <div className="mt-4 space-y-2">
          {list.length === 0 ? (
            <p className="text-slate-600 text-xs font-bold py-4 text-center">{w.empty}</p>
          ) : (
            list.map((item) => {
              const points = pricePointsOfQuote(quotes[item.symbol]);
              return (
                <div
                  key={item.symbol}
                  className="flex items-center gap-3 pl-4 pr-2 py-2.5 rounded-2xl bg-white/5 border border-white/10"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-black text-sm truncate">{item.name}</p>
                    <p className="text-slate-500 text-[11px] font-bold truncate">
                      {points
                        ? w.lot(priceText(points), formatMoney(fromCents(valueCents(BOARD_LOT, points)), { decimals: 0 }))
                        : item.symbol}
                    </p>
                  </div>
                  <button
                    onClick={() => remove(item.symbol)}
                    aria-label={w.remove(item.name)}
                    className="size-9 shrink-0 rounded-full border border-white/10 flex items-center justify-center text-slate-400 active:scale-90 transition-transform"
                  >
                    <span className="material-symbols-rounded text-lg">close</span>
                  </button>
                </div>
              );
            })
          )}
        </div>

        {problem && <p className="text-red-400 text-xs font-bold mt-3">{w.couldNotSave}</p>}
        <p className="text-slate-500 text-[11px] font-semibold mt-4 leading-relaxed">{w.needsHistory}</p>
      </div>
    </div>
  );
};

export default WatchlistSheet;
