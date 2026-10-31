import React, { useMemo, useState } from 'react';
import type { Activity, Dividend, InvestSettings, Loan, PiggyBank, SavingsSettings, Trade } from '../types';
import type { CreditedDividend } from '../services/dividends';
import { ordered, pricePointsOf, tradeTotalCents, type Quotes } from '../services/holdings';
import { formatMoney, fromCents, toCents } from '../services/money';
import * as api from '../services/firestore';
import TradeSheet, { type TradeDraft } from './TradeSheet';
import { OlderRecordsSheet } from './OlderRecordsNotice';
import { useTradeRow } from '../hooks/useTradeRow';
import { useT } from '../contexts/LanguageContext';
import { dateLocale, type Messages } from '../i18n';
import { totalFees } from '../services/fees';
import { Chip } from './ui/Chip';
import { EmptyState } from './ui/EmptyState';
import { IconTile, type IconTint } from './ui/IconTile';
import { PageBand } from './ui/PageBand';

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
  /** Last prices, for the buy form's price hint. */
  quotes?: Quotes;
  /** The empty list's one action. */
  onRecordBuy?: () => void;
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

/** "Today · Sep 8", matching the savings history, because it reads the same way. */
const dayLabel = (d: Date, now: Date, t: Messages) => {
  const date = d.toLocaleDateString(dateLocale('en-US'), { month: 'short', day: 'numeric' });
  if (sameDay(d, now)) return t.invest.dayHeading(t.common.today, date);
  if (sameDay(d, new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1))) return t.invest.dayHeading(t.common.yesterday, date);
  return t.invest.dayHeading(t.common.weekdaysLong[d.getDay()], date);
};

/** How each kind of line looks: a tinted tile, and whether its amount is money coming in. */
const KIND: Record<Trade['kind'], { icon: string; tint: IconTint; inflow: boolean }> = {
  buy: { icon: 'plus', tint: 'blue', inflow: false },
  sell: { icon: 'minus', tint: 'coral', inflow: true },
  dividend: { icon: 'coin', tint: 'amber', inflow: true },
};

type Filter = 'all' | Trade['kind'];
const FILTERS: Filter[] = ['all', 'buy', 'sell', 'dividend'];

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
  quotes,
  onRecordBuy,
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

  const [filter, setFilter] = useState<Filter>('all');
  const shown = useMemo(() => (filter === 'all' ? trades : trades.filter((tr) => tr.kind === filter)), [trades, filter]);

  const days = useMemo(() => {
    const groups: { key: number; date: Date; rows: Trade[] }[] = [];
    // Newest first on the screen; the replay does its own ordering.
    for (const trade of ordered(shown).reverse()) {
      const last = groups[groups.length - 1];
      if (last && last.key === trade.tradedAt) last.rows.push(trade);
      else groups.push({ key: trade.tradedAt, date: new Date(trade.tradedAt), rows: [trade] });
    }
    return groups;
  }, [shown]);

  return (
    <div className="flex min-h-full flex-col pb-40 font-figtree text-ink">
      <PageBand title={t.invest.tradesTitle} onBack={onBack} />

      <div className="flex flex-col gap-2.5 px-4 pt-3">
        {note && (
          <div role="status" className="rounded-3xl bg-mint px-3.5 py-2.5">
            <p className="text-[13px] font-bold">{note}</p>
          </div>
        )}

        {trades.length === 0 ? (
          <EmptyState
            icon="list"
            title={t.invest.noTrades}
            body={t.invest.noTradesBody}
            action={onRecordBuy ? { label: t.invest.noTradesAction, onClick: onRecordBuy } : undefined}
            className="mt-3"
          />
        ) : (
          <>
            <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
              {FILTERS.map((f) => (
                <Chip key={f} selected={filter === f} onClick={() => setFilter(f)}>
                  {f === 'all' ? t.alerts.filters.all : t.invest.tag[f]}
                </Chip>
              ))}
            </div>

            {days.map((day) => (
              <section key={day.key}>
                <h2 className="mb-1 px-1 text-[12.5px] font-bold text-mute">{dayLabel(day.date, now, t)}</h2>
                <div className="divide-y divide-line/10 rounded-3xl bg-card px-3.5 py-0.5">
                  {day.rows.map((trade) => {
                    const kind = KIND[trade.kind];
                    const fees = totalFees(trade.fees);
                    return (
                      <button key={trade.id} type="button" onClick={() => setDraft({ mode: 'edit', trade })} className="flex min-h-[60px] w-full items-center gap-2.5 py-2 text-left active:opacity-70">
                        <IconTile icon={kind.icon} tint={kind.tint} size={38} round />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14.5px] font-bold">{trade.name}</span>
                          <span className="block truncate text-[12.5px] font-semibold text-mute">
                            {t.invest.tag[trade.kind]} · {t.common.units(trade.units.toLocaleString('en-US'))} {trade.kind === 'dividend' ? '×' : '@'} {rate(trade)}
                          </span>
                          {fees > 0 && (
                            <span className="block text-[12.5px] font-semibold text-mute">
                              {t.invest.fees} {money(fees)}
                            </span>
                          )}
                        </span>
                        {/* The money that actually moved: a buy with its fees, a sale after them. */}
                        <span className={`shrink-0 text-[14.5px] font-bold tabular-nums ${kind.inflow ? 'text-pos' : ''}`}>
                          {/* A sale below its fees came to less than nothing: the sign follows the figure. */}
                          {trade.kind === 'buy' ? money(tradeTotalCents(trade)) : money(tradeTotalCents(trade), { signed: true })}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}

            <p className="mt-1 px-3 text-center text-[12.5px] font-medium leading-relaxed text-mute">{t.invest.tradesFooter}</p>
          </>
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
          quotes={quotes}
          potCents={toCents(invest.potBalance ?? 0)}
          dividendMarker={draft.mode === 'edit' ? credited?.find((c) => c.id === draft.trade.id) ?? null : null}
          onCorrectDividend={(tradeId, cents) => api.correctDividend(uid, tradeId, cents)}
          onRemoveDividend={(tradeId) => api.removeDividend(uid, tradeId)}
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
