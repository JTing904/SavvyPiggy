import React, { useMemo, useState } from 'react';
import type { Trade } from '../types';
import { ordered } from '../services/holdings';
import { formatMoney, fromCents } from '../services/money';
import TradeSheet, { type TradeDraft } from './TradeSheet';

interface TradesProps {
  uid: string;
  trades: Trade[];
  onBack: () => void;
}

const money = (cents: number, opts?: { decimals?: 0 | 2; signed?: boolean }) =>
  formatMoney(fromCents(cents), opts);

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** TODAY, SEP 8 — matching the savings history, because it reads the same way. */
const dayLabel = (d: Date, now: Date) => {
  const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();
  if (sameDay(d, now)) return `TODAY, ${date}`;
  if (sameDay(d, new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1))) return `YESTERDAY, ${date}`;
  return `${d.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase()}, ${date}`;
};

const TAG: Record<Trade['kind'], { label: string; className: string; amountClass: string }> = {
  buy: { label: 'BUY', className: 'bg-primary/15 text-primary', amountClass: 'text-white' },
  sell: { label: 'SELL', className: 'bg-red-500/15 text-red-400', amountClass: 'text-red-400' },
  dividend: { label: 'DIVIDEND', className: 'bg-accent/15 text-accent', amountClass: 'text-accent' },
};

/**
 * Every trade, newest first, grouped by the day it was done. This is the only
 * place a position can be changed: units and cost are replayed from these
 * lines, so correcting a wrong number here fixes that line and leaves the
 * rest of the history — and any dividend already worked out from it — alone.
 */
const Trades: React.FC<TradesProps> = ({ uid, trades, onBack }) => {
  const [draft, setDraft] = useState<TradeDraft | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const now = new Date();

  const say = (text: string) => {
    setNote(text);
    setTimeout(() => setNote(null), 4000);
  };

  const days = useMemo(() => {
    const groups: { key: number; date: Date; rows: Trade[] }[] = [];
    // Newest first on the screen; the replay does its own ordering.
    for (const trade of ordered(trades).reverse()) {
      const last = groups[groups.length - 1];
      if (last && last.key === trade.tradedAt) last.rows.push(trade);
      else groups.push({ key: trade.tradedAt, date: new Date(trade.tradedAt), rows: [trade] });
    }
    return groups;
  }, [trades]);

  return (
    <div className="flex flex-col h-full bg-bg-dark safe-pt">
      <div className="flex items-center px-6 py-4 gap-4 sticky top-0 bg-bg-dark/95 z-20">
        <button
          onClick={onBack}
          className="size-10 shrink-0 rounded-full glass flex items-center justify-center text-slate-300 active:scale-90 transition-transform"
        >
          <span className="material-symbols-rounded text-xl">arrow_back_ios_new</span>
        </button>
        <h2 className="text-white text-2xl font-black tracking-tight">Trades</h2>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar px-6 pb-40">
        {note && (
          <div className="mb-4 rounded-2xl bg-primary/10 border border-primary/25 px-4 py-3">
            <p className="text-primary text-xs font-black">{note}</p>
          </div>
        )}

        {trades.length === 0 ? (
          <div className="text-center py-20">
            <span className="material-symbols-rounded text-slate-700 text-5xl">receipt_long</span>
            <p className="text-white font-black mt-4">No trades yet</p>
            <p className="text-slate-500 text-xs font-bold mt-2 leading-relaxed px-6">
              Record a buy with the button below. Every trade keeps the day it was done, which is what
              decides who a dividend belongs to.
            </p>
          </div>
        ) : (
          days.map((day) => (
            <div key={day.key}>
              <p className="text-slate-500 text-[10px] font-black tracking-widest mt-6 mb-3">
                {dayLabel(day.date, now)}
              </p>
              <div className="space-y-2.5">
                {day.rows.map((trade) => {
                  const tag = TAG[trade.kind];
                  return (
                    <button
                      key={trade.id}
                      onClick={() => setDraft({ mode: 'edit', trade })}
                      className="w-full flex items-center gap-3 p-4 rounded-3xl glass text-left active:scale-[0.98] transition-transform"
                    >
                      <span className={`text-[9px] font-black px-2.5 py-1 rounded-full tracking-wider ${tag.className}`}>
                        {tag.label}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-black text-[13px] truncate">{trade.name}</p>
                        <p className="text-slate-500 text-[11px] font-bold mt-0.5">
                          {trade.units.toLocaleString('en-US')} units{' '}
                          {trade.kind === 'dividend' ? '×' : '@'} {money(trade.priceCents, { decimals: 2 })}
                        </p>
                      </div>
                      <p className={`text-[13px] font-black shrink-0 ${tag.amountClass}`}>
                        {trade.kind === 'buy' ? '' : '+'}
                        {money(trade.units * trade.priceCents)}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          ))
        )}

        {trades.length > 0 && (
          <p className="text-slate-600 text-[11px] font-bold text-center mt-8 leading-relaxed px-4">
            Tap any trade to change its date, units or price — or to delete it. Units and cost are worked
            out again from the whole list.
          </p>
        )}
      </div>

      {draft && (
        <TradeSheet
          uid={uid}
          trades={trades}
          draft={draft}
          onClose={() => setDraft(null)}
          onDone={say}
        />
      )}
    </div>
  );
};

export default Trades;
