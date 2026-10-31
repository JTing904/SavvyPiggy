import type { Activity, Trade } from '../types';
import { toCents } from './money';
import { dayStart, ordered, pointsValueCents, unitsHeldOn } from './holdings';

/**
 * The lines on Home and the investing page. Nothing here is estimated: the
 * wallet's comes from what each entry did to it, the shares' from the units
 * held each day times that day's real close.
 */

const DAY_MS = 86_400_000;

/**
 * What the wallet held at the end of each of the last `days` days, oldest
 * first, today last. Walks back from today's balance, undoing each entry.
 */
export const walletTrail = (activities: Pick<Activity, 'date' | 'wallet'>[], walletCents: number, now: Date, days = 30): number[] => {
  const today = dayStart(now.getTime());
  const out: number[] = [];
  for (let back = days - 1; back >= 0; back--) {
    const endOfDay = today - (back - 1) * DAY_MS;
    const later = activities.reduce((sum, a) => (new Date(a.date).getTime() >= endOfDay ? sum + toCents(a.wallet ?? 0) : sum), 0);
    out.push(walletCents - later);
  }
  return out;
};

/** One symbol's closes, in points (ten-thousandths of a ringgit), oldest first. */
export interface DailyClose {
  /** The exchange's day, "YYYY-MM-DD". */
  day: string;
  points: number;
}

/** Bursa's offset from UTC, for a payload that does not say. */
const MYT_OFFSET_SECONDS = 8 * 3600;

/** Yahoo's daily chart, reduced to the days that really closed. Null if it could not be read. */
export const parseDailyCloses = (payload: unknown): DailyClose[] | null => {
  const result = (payload as {
    chart?: { result?: { meta?: { gmtoffset?: number }; timestamp?: number[]; indicators?: { quote?: { close?: (number | null)[] }[] } }[] };
  })?.chart?.result?.[0];
  const stamps = result?.timestamp;
  const closes = result?.indicators?.quote?.[0]?.close;
  if (!stamps || !closes || stamps.length === 0) return null;
  const offset = typeof result?.meta?.gmtoffset === 'number' ? result.meta.gmtoffset : MYT_OFFSET_SECONDS;
  const out: DailyClose[] = [];
  stamps.forEach((seconds, i) => {
    const close = closes[i];
    if (close == null || !(close > 0)) return;
    out.push({ day: new Date((seconds + offset) * 1000).toISOString().slice(0, 10), points: Math.round(close * 10_000) });
  });
  return out.length > 0 ? out : null;
};

export interface ValuePoint {
  day: string;
  cents: number;
}

/** The end of an exchange day, in this phone's clock, for asking what was held that day. */
const dayEnd = (day: string) => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d, 23, 59, 59).getTime();
};

/**
 * What the shares were worth at each close. Starts on the first day anything
 * was held. A counter with no close on a day keeps its last one, which is what
 * a day with no trades means; a counter held with no closes at all makes the
 * whole line null, because leaving it out would draw a fall that never happened.
 */
export const valueSeries = (trades: Trade[], closes: Record<string, DailyClose[]>): ValuePoint[] | null => {
  const log = ordered(trades).filter((t) => t.kind === 'buy' || t.kind === 'sell');
  if (log.length === 0) return [];
  const symbols = [...new Set(log.map((t) => t.symbol))];
  const days = [...new Set(symbols.flatMap((s) => (closes[s] ?? []).map((c) => c.day)))].sort();
  const bySymbol = symbols.map((symbol) => ({
    symbol,
    trades: log.filter((t) => t.symbol === symbol),
    closes: closes[symbol] ?? [],
    at: 0,
    last: null as number | null,
  }));

  const out: ValuePoint[] = [];
  for (const day of days) {
    const end = dayEnd(day);
    let cents = 0;
    let held = false;
    let priced = true;
    for (const counter of bySymbol) {
      while (counter.at < counter.closes.length && counter.closes[counter.at].day <= day) {
        counter.last = counter.closes[counter.at].points;
        counter.at += 1;
      }
      const units = unitsHeldOn(counter.trades, end);
      if (units <= 0) continue;
      held = true;
      if (counter.last === null) {
        if (counter.closes.length === 0) return null;
        // Held before its first close (allotted ahead of listing): that day has no value yet.
        priced = false;
      } else cents += pointsValueCents(units, counter.last);
    }
    if (!held || !priced) continue;
    out.push({ day, cents });
  }
  return out;
};

/** The points from `from` ("YYYY-MM-DD") on. */
export const since = (points: ValuePoint[], from: string) => points.filter((p) => p.day >= from);
