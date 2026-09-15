import React, { useMemo, useState } from 'react';
import type { Activity, Dividend, InvestSettings, Loan, PiggyBank, SavingsSettings, Trade } from '../types';
import type { CreditedDividend } from '../services/dividends';
import { ordered, pricePointsOf, tradeTotalCents } from '../services/holdings';
import { formatMoney, fromCents } from '../services/money';
import TradeSheet, { type TradeDraft } from './TradeSheet';
import { OlderRecordsSheet } from './OlderRecordsNotice';
import { useTradeRow } from '../hooks/useTradeRow';
import { useT } from '../contexts/LanguageContext';
import { dateLocale, type Messages } from '../i18n';

interface TradesProps {
  uid: string;
  trades: Trade[];
  onBack: () => void;
  /** Passed through to the trade sheet, which moves goal money with a trade. */
  activities: Activity[];
  /** Where the kept ledger starts, for finding an older trade's History row. */
  keptFrom: Date;
  banks: PiggyBank[];
  loans: Loan[];
  savings: SavingsSettings;
  invest: InvestSettings;
  /** Dividends already paid in (null until known), and the announcements: a correction can move them. */
  credited: CreditedDividend[] | null;
  dividends: Dividend[];
  alertIds: string[];
  onEditBroker: () => void;
  onCreateGoal?: () => void;
}

const money = (cents: number, opts?: { decimals?: 0 | 2; signed?: boolean }) =>
  formatMoney(fromCents(cents), opts);

/**
 * What one unit of this trade was worth. A dividend is quoted per unit in
 * ten-thousandths of a ringgit and leaves `priceCents` at zero, so reading
 * that field instead showed every dividend ever credited as RM0.00.
 */
const rate = (trade: Trade) =>
  trade.kind === 'dividend'
    ? `RM${((trade.perUnitPoints ?? 0) / 10_000).toFixed(4)}`
    : price(pricePointsOf(trade));

/**
 * A share price to as many places as it has, between two and four. Read from
 * `priceCents` it was cut to the sen, so a buy at RM0.345 showed as RM0.34 —
 * a price nobody paid.
 */
const price = (points: number) => {
  const [whole, fraction] = (points / 10_000).toFixed(4).split('.');
  return `RM${Number(whole).toLocaleString('en-US')}.${fraction.replace(/0{1,2}$/, '')}`;
};

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/**
 * TODAY, SEP 8 — matching the savings history, because it reads the same way.
 * Chinese has no capitals, so the same call reads 今天 · 9月8日 there.
 */
const dayLabel = (d: Date, now: Date, t: Messages) => {
  const date = d.toLocaleDateString(dateLocale('en-US'), { month: 'short', day: 'numeric' }).toUpperCase();
  if (sameDay(d, now)) return t.invest.dayHeading(t.common.today.toUpperCase(), date);
  if (sameDay(d, new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)))
    return t.invest.dayHeading(t.common.yesterday.toUpperCase(), date);
  return t.invest.dayHeading(t.common.weekdaysLong[d.getDay()].toUpperCase(), date);
};

// The chip's words are looked up by kind at render, so they follow the language.
const TAG: Record<Trade['kind'], { className: string; amountClass: string }> = {
  buy: { className: 'bg-primary/15 text-primary', amountClass: 'text-white' },
  sell: { className: 'bg-red-500/15 text-red-400', amountClass: 'text-red-400' },
  dividend: { className: 'bg-accent/15 text-accent', amountClass: 'text-accent' },
};

/**
 * Every trade, newest first, grouped by the day it was done. This is the only
 * place a position can be changed: units and cost are replayed from these
 * lines, so correcting a wrong number here fixes that line and leaves the
 * rest of the history — and any dividend already worked out from it — alone.
 */
const Trades: React.FC<TradesProps> = ({
  uid,
  trades,
  onBack,
  activities,
  keptFrom,
  banks,
  loans,
  savings,
  invest,
  credited,
  dividends,
  alertIds,
  onEditBroker,
  onCreateGoal,
}) => {
  const t = useT();
  const [draft, setDraft] = useState<TradeDraft | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const row = useTradeRow(uid, draft, activities, keptFrom);
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
        <h2 className="text-white text-2xl font-black tracking-tight">{t.invest.tradesTitle}</h2>
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
            <p className="text-white font-black mt-4">{t.invest.noTrades}</p>
            <p className="text-slate-500 text-xs font-bold mt-2 leading-relaxed px-6">
              {t.invest.noTradesBody}
            </p>
          </div>
        ) : (
          days.map((day) => (
            <div key={day.key}>
              <p className="text-slate-500 text-[10px] font-black tracking-widest mt-6 mb-3">
                {dayLabel(day.date, now, t)}
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
                        {t.invest.tag[trade.kind]}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-black text-[13px] truncate">{trade.name}</p>
                        <p className="text-slate-500 text-[11px] font-bold mt-0.5">
                          {t.common.units(trade.units.toLocaleString('en-US'))} {trade.kind === 'dividend' ? '×' : '@'}{' '}
                          {rate(trade)}
                        </p>
                      </div>
                      {/* The money that actually moved: a buy with its fees, a sale after them. */}
                      <p className={`text-[13px] font-black shrink-0 ${tag.amountClass}`}>
                        {/* A sale below its fees came to less than nothing: the sign follows the figure. */}
                        {trade.kind === 'buy' ? money(tradeTotalCents(trade)) : money(tradeTotalCents(trade), { signed: true })}
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
            {t.invest.tradesFooter}
          </p>
        )}
      </div>

      {draft && row.status !== 'ready' && (
        <OlderRecordsSheet status={row.status} onRetry={row.retry} onClose={() => setDraft(null)} />
      )}
      {draft && row.status === 'ready' && (
        <TradeSheet
          uid={uid}
          trades={trades}
          activities={row.activities}
          banks={banks}
          loans={loans}
          savings={savings}
          invest={invest}
          credited={credited}
          dividends={dividends}
          alertIds={alertIds}
          draft={draft}
          onClose={() => setDraft(null)}
          onDone={say}
          onEditBroker={onEditBroker}
          onCreateGoal={onCreateGoal}
        />
      )}
    </div>
  );
};

export default Trades;
