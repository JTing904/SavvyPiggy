import React, { useMemo } from 'react';
import type { Dividend, Trade } from '../types';
import { declaredIncome, exchangeDay, upcomingDividends, yieldOnCost, type CreditedDividend } from '../services/dividends';
import { isDividendApiConfigured } from '../services/dividendApi';
import { dayStart, tradeCents } from '../services/holdings';
import { formatMoney, fromCents } from '../services/money';
import { useT } from '../contexts/LanguageContext';
import { dateLocale } from '../i18n';
import { EmptyState } from './ui/EmptyState';
import { Icon } from './ui/Icon';
import { IconTile } from './ui/IconTile';
import { BandLabel, PageBand } from './ui/PageBand';

interface DividendsProps {
  dividends: Dividend[];
  /** Already paid in: listed under what was received, not still to come. */
  credited: CreditedDividend[] | null;
  trades: Trade[];
  busy: boolean;
  /** False until a fetch has actually succeeded at least once. */
  known: boolean;
  onRefresh: () => void;
  onBack: () => void;
}

const money = (cents: number, opts?: { decimals?: 0 | 2; signed?: boolean }) =>
  formatMoney(fromCents(cents), opts);

const day = (ms: number) =>
  new Date(ms).toLocaleDateString(dateLocale('en-GB'), { day: 'numeric', month: 'short', year: 'numeric' });

/** RM0.3300 — dividends are quoted to four places, and the tail matters. */
const rate = (points: number) => `RM${(points / 10_000).toFixed(4)}`;

const Row: React.FC<{ label: string; value: string; strong?: boolean }> = ({ label, value, strong }) => (
  <div className="flex items-baseline gap-3 py-1 text-[13.5px]">
    <span className="flex-1 font-medium text-mute">{label}</span>
    <span className={strong ? 'text-[18px] font-bold tabular-nums text-pos' : 'font-bold tabular-nums'}>{value}</span>
  </div>
);

/**
 * What each counter is about to pay, and what it has paid.
 *
 * The figures here are worked out the same way the crediting is — from the
 * units the trade log says were held on the ex-date — so what this screen
 * shows before a payment is exactly what lands after it.
 */
const Dividends: React.FC<DividendsProps> = ({ dividends, credited, trades, busy, known, onRefresh, onBack }) => {
  const t = useT();
  const paidIds = useMemo(() => (credited ?? []).map((c) => c.id), [credited]);
  const upcoming = useMemo(() => upcomingDividends(dividends, trades, Date.now(), paidIds), [dividends, trades, paidIds]);
  const year = useMemo(() => declaredIncome(dividends, trades, Date.now(), paidIds), [dividends, trades, paidIds]);
  const today = dayStart(Date.now());

  const paid = useMemo(
    () =>
      trades
        .filter((t) => t.kind === 'dividend')
        .sort((a, b) => b.tradedAt - a.tradedAt),
    [trades]
  );

  const paidTotal = paid.reduce((sum, t) => sum + tradeCents(t), 0);

  /** One row per counter that has actually paid something in the last year. */
  const yields = useMemo(() => {
    const seen = new Map<string, string>();
    for (const t of trades) seen.set(t.symbol, t.name);
    return [...seen.entries()]
      .map(([symbol, name]) => ({ symbol, name, y: yieldOnCost(trades, symbol) }))
      .filter((row): row is { symbol: string; name: string; y: NonNullable<typeof row.y> } => row.y !== null)
      .sort((a, b) => b.y.percent - a.y.percent);
  }, [trades]);

  return (
    <div className="flex min-h-full flex-col pb-40 font-figtree text-ink">
      <PageBand
        title={t.invest.dividendsTitle}
        onBack={onBack}
        trailing={
          // With no trades there is no counter to ask about, so refreshing would do nothing.
          trades.length > 0 && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={busy}
              aria-label={t.common.older.retry}
              className="-mr-2.5 grid size-11 shrink-0 place-items-center active:opacity-70 disabled:opacity-40"
            >
              <Icon name="repeat" size={21} strokeWidth={1.9} className={busy ? 'animate-spin motion-reduce:animate-none' : ''} />
            </button>
          )
        }
      >
        {paid.length > 0 && (
          <>
            <BandLabel className="mt-1">{t.invest.receivedSoFar}</BandLabel>
            <p className="mt-0.5 truncate text-[34px] font-bold leading-[1.15] tracking-[-0.015em] tabular-nums">{money(paidTotal)}</p>
            <p className="mt-1 truncate text-[13.5px] font-semibold text-band-sub">{t.invest.acrossPayments(paid.length)}</p>
          </>
        )}
      </PageBand>

      <div className="flex flex-col gap-2.5 px-4 pt-3">
        {!isDividendApiConfigured && (
          <div className="rounded-3xl bg-sun px-3.5 py-3">
            <p className="text-[14px] font-bold">{t.invest.notConnected}</p>
            <p className="mt-0.5 text-[12.5px] font-medium leading-relaxed">{t.invest.notConnectedBody}</p>
          </div>
        )}

        {yields.length > 0 && (
          <>
            <h2 className="px-1 text-[15px] font-bold">{t.invest.yieldHeading}</h2>
            <div className="divide-y divide-line/10 rounded-3xl bg-card px-3.5 py-0.5">
              {yields.map(({ symbol, name, y }) => (
                <div key={symbol} className="flex min-h-14 items-center gap-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14.5px] font-bold">{name}</p>
                    <p className="text-[12.5px] font-semibold text-mute">{t.invest.yieldLine(money(y.paidCents), money(y.costCents))}</p>
                  </div>
                  <p className="shrink-0 text-[20px] font-bold tabular-nums text-pos">{y.percent}%</p>
                </div>
              ))}
            </div>
            <p className="px-1 text-[12.5px] font-medium leading-relaxed text-mute">{t.invest.yieldNote}</p>
          </>
        )}

        {/*
          Declared income only.

          Every figure is a company's own announcement times the units the log
          says were held: nothing annualised, nothing assumed to repeat. The
          two halves are kept apart because they are not equally certain: once
          the ex-date has passed the money is owed whatever happens next, while
          before it the payment depends on still holding the shares that day.
          One combined number would claim the second half is as settled as the
          first.
        */}
        {year.rows.length > 0 && (
          <div className="rounded-3xl bg-card p-3.5">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-[13.5px] font-semibold text-mute">{t.invest.declaredNext12}</p>
              <span className="shrink-0 text-[18px] font-bold tabular-nums text-pos">{money(year.totalCents)}</span>
            </div>
            <div className="mt-2">
              <Row label={t.invest.alreadyYours} value={money(year.lockedCents)} />
              <Row label={t.invest.ifStillHeld} value={money(year.pendingCents)} />
            </div>
            <p className="mt-2 text-[12.5px] font-medium leading-relaxed text-mute">{t.invest.declaredNote}</p>
          </div>
        )}

        {trades.length > 0 && <h2 className="mt-2 px-1 text-[15px] font-bold">{t.invest.comingUp}</h2>}
        {trades.length === 0 ? (
          <EmptyState icon="coin" title={t.invest.noDividends} body={t.invest.noDividendsBody} />
        ) : upcoming.length === 0 ? (
          <div className="rounded-3xl bg-card p-3.5">
            {/*
              An empty list means one of two very different things, and saying
              the wrong one is a claim about the user's own holdings. Until a
              fetch has succeeded, the honest answer is that we do not know.
            */}
            <p className="text-[13px] font-medium leading-relaxed text-mute">{known ? t.invest.nothingAnnounced : t.invest.couldNotFetch}</p>
          </div>
        ) : (
          upcoming.map(({ id, dividend, units, amountCents }) => (
            // The dividend's own id: two can share a counter and an ex-date.
            <div key={id} className="rounded-3xl bg-card p-3.5">
              <div className="flex items-baseline gap-3">
                {/* The counter code never truncates: a "1155" shortened to
                    "115" names a different company. The subject gives way. */}
                <p className="shrink-0 text-[15.5px] font-bold">{dividend.symbol}</p>
                <span className="min-w-0 flex-1 truncate text-right text-[12.5px] font-semibold text-mute">{dividend.subject}</span>
              </div>
              <div className="mt-2">
                {/* As calendar days: west of Greenwich a UTC-midnight stamp would read as the day before. */}
                <Row label={t.invest.exDate} value={day(exchangeDay(dividend.exDate))} />
                <Row label={t.invest.payDate} value={day(exchangeDay(dividend.payDate))} />
                <Row label={t.invest.perUnit} value={rate(dividend.perUnitPoints)} />
                <Row label={t.invest.unitsOnExDate} value={units.toLocaleString('en-US')} />
              </div>
              <div className="my-2 h-px bg-line/10" />
              {/* Owed once the ex-date has passed; before it, only what it would come to. */}
              {units > 0 && (
                <Row label={exchangeDay(dividend.exDate) <= today ? t.invest.owedToYou : t.invest.comesTo} value={money(amountCents)} strong />
              )}
              {units === 0 && (
                <p className="text-[12.5px] font-medium leading-relaxed text-mute">
                  {exchangeDay(dividend.exDate) > today ? t.invest.holdToQualify(day(exchangeDay(dividend.exDate))) : t.invest.notYours}
                </p>
              )}
            </div>
          ))
        )}

        {paid.length > 0 && (
          <>
            <h2 className="mt-2 px-1 text-[15px] font-bold">{t.invest.paidIn}</h2>
            <div className="divide-y divide-line/10 rounded-3xl bg-card px-3.5 py-0.5">
              {paid.map((trade) => (
                <div key={trade.id} className="flex min-h-[60px] items-center gap-2.5 py-2">
                  <IconTile icon="coin" tint="amber" size={38} round />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14.5px] font-bold">
                      {trade.name}
                      {(trade.amountCents !== undefined || credited?.some((c) => c.id === trade.id && c.corrected)) && (
                        <span className="ml-1.5 rounded-md bg-sun px-1.5 py-0.5 align-middle text-[11.5px] font-bold">{t.invest.dividendCorrected}</span>
                      )}
                    </p>
                    <p className="text-[12.5px] font-semibold text-mute">
                      {day(trade.tradedAt)} · {t.common.units(trade.units.toLocaleString('en-US'))} × {rate(trade.perUnitPoints ?? 0)}
                    </p>
                  </div>
                  <p className="shrink-0 text-[14.5px] font-bold tabular-nums text-pos">+{money(tradeCents(trade))}</p>
                </div>
              ))}
            </div>
          </>
        )}

        {trades.length > 0 && <p className="mt-1 px-3 text-center text-[12.5px] font-medium leading-relaxed text-mute">{t.invest.dividendsFooter}</p>}
      </div>
    </div>
  );
};

export default Dividends;
