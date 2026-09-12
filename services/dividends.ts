import type { Dividend, Trade } from '../types';
import { dayStart, replay, tradeCents, unitsOnExDate } from './holdings';

/**
 * Dividends: reading the announcements, and deciding what is owed.
 *
 * Everything here is pure, and deliberately shared between the app and the
 * Cloudflare Worker that does the scraping — the parser is the part most
 * likely to break when the source site changes its markup, so it is the part
 * that gets held to unit tests rather than being trusted in production.
 *
 * Two rules run through all of it:
 *
 * A dividend belongs to whoever held the shares on the ex-date, not on the
 * day it pays. So the amount is worked out from the trade log as it stood
 * then, never from the units held today.
 *
 * And nothing is ever recorded on a guess. If the announcement cannot be read
 * the answer is "no dividends", not "probably this much" — money missing from
 * the app is a nuisance, money invented in it is a lie.
 */

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/**
 * "12 Mar 2026" as the local midnight of that day, or null. Dates on the
 * exchange are days, not instants, and the app compares them as days.
 */
export const parseDay = (text: string): number | null => {
  const m = /^\s*(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?,?\s+(\d{4})\s*$/.exec(text);
  if (!m) return null;
  const month = MONTHS.indexOf(m[2].toLowerCase());
  const day = Number(m[1]);
  const year = Number(m[3]);
  if (month < 0 || day < 1 || day > 31) return null;
  const date = new Date(year, month, day);
  // Rejects the likes of "31 Feb 2026", which JavaScript would roll forward.
  if (date.getMonth() !== month || date.getDate() !== day) return null;
  return dayStart(date.getTime());
};

/** "0.3300" as ten-thousandths of a ringgit, so RM0.0125 survives intact. */
export const parsePoints = (text: string): number | null => {
  const cleaned = text.replace(/[,\s]/g, '');
  if (!/^\d*\.?\d+$/.test(cleaned)) return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 10_000);
};

const strip = (html: string) =>
  html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * The dividend announcements out of a KLSE Screener stock page.
 *
 * The page carries several tables, so the right one is found by its own
 * headings rather than by position — a layout change should make this return
 * nothing, which is the safe direction, instead of silently reading share
 * transfers as dividends. Rows without both dates, or that announce something
 * other than cash, are dropped.
 */
export const parseDividends = (html: string, symbol: string): Dividend[] => {
  const marker = html.indexOf('EX Date');
  if (marker < 0) return [];

  const start = html.lastIndexOf('<table', marker);
  const end = html.indexOf('</table>', marker);
  if (start < 0 || end < 0) return [];

  const table = html.slice(start, end);
  // The heading row has to be the one we think it is before any row is trusted.
  const headings = [...table.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((m) => strip(m[1]).toLowerCase());
  const exAt = headings.indexOf('ex date');
  const payAt = headings.indexOf('payment date');
  const amountAt = headings.indexOf('amount');
  const subjectAt = headings.indexOf('subject');
  const announcedAt = headings.indexOf('announced');
  if (exAt < 0 || payAt < 0 || amountAt < 0) return [];

  const out: Dividend[] = [];
  for (const row of table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const cells = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => strip(m[1]));
    // Year separators are a single spanning cell; the heading row has none.
    if (cells.length <= amountAt) continue;

    const exDate = parseDay(cells[exAt]);
    const payDate = parseDay(cells[payAt]);
    const perUnitPoints = parsePoints(cells[amountAt]);
    if (exDate === null || payDate === null || perUnitPoints === null) continue;

    const subject = subjectAt >= 0 ? cells[subjectAt] : 'Dividend';
    // Bonus issues and share splits share this table and are not money.
    if (!/dividend|distribution/i.test(subject)) continue;

    out.push({
      symbol,
      subject,
      exDate,
      payDate,
      perUnitPoints,
      announcedAt: (announcedAt >= 0 ? parseDay(cells[announcedAt]) : null) ?? exDate,
    });
  }

  // Newest first, and one row per ex-date: a re-announcement is not a second
  // payment.
  const seen = new Set<string>();
  return out
    .sort((a, b) => b.exDate - a.exDate)
    .filter((d) => {
      const key = String(d.exDate);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

/* ------------------------------------------------------------------ money */

/**
 * What a dividend comes to on a number of units, rounded down to the sen.
 * Money never rounds up in this app, and a fraction of a sen is not payable.
 */
export const dividendCents = (units: number, perUnitPoints: number) =>
  Math.floor((units * perUnitPoints) / 100);

/** The trade log's own id for a credited dividend: one per counter per ex-date. */
export const dividendTradeId = (symbol: string, exDate: number) =>
  `div_${symbol.replace(/[^A-Za-z0-9.]/g, '')}_${exDate}`;

export interface DueDividend {
  dividend: Dividend;
  /** Units held at the close of the day before the ex-date. */
  units: number;
  amountCents: number;
}

/**
 * The dividends that should have landed by now and have not been recorded.
 *
 * A dividend qualifies once its pay date has arrived, on the units the log
 * says were held on its ex-date.
 *
 * What counts as "already paid" is the `credited` list, not the trade log.
 * They used to be the same thing, and deleting the dividend's row from the
 * log — which reads like tidying away a record — made the dividend fall due
 * again while its money was still sitting in the goals. The record is the
 * user's to edit; whether the money moved is not.
 */
export const dueDividends = (
  dividends: Dividend[],
  trades: Trade[],
  credited: Iterable<string> = [],
  now = Date.now()
): DueDividend[] => {
  const today = dayStart(now);
  const recorded = new Set(credited);

  return dividends
    .filter((d) => d.payDate <= today)
    .filter((d) => !recorded.has(dividendTradeId(d.symbol, d.exDate)))
    .map((d) => {
      const units = unitsOnExDate(
        trades.filter((t) => t.symbol === d.symbol),
        d.exDate
      );
      return { dividend: d, units, amountCents: dividendCents(units, d.perUnitPoints) };
    })
    // Nothing held then, nothing owed — and a sub-sen amount is not money.
    .filter((due) => due.units > 0 && due.amountCents > 0)
    .sort((a, b) => a.dividend.payDate - b.dividend.payDate);
};

/**
 * What a counter has actually paid, against what it cost.
 *
 * Worked out from the trade log, never stored: the dividends are the ones
 * credited in the last twelve months, and the cost is what the position is
 * held at now. It is a yield on cost — what this holding returns to the
 * person who owns it — not the market yield a quote screen shows, which
 * moves with the share price and says nothing about what anyone paid.
 *
 * Null when there is nothing to divide by, or nothing has been paid yet;
 * a zero would read as "this pays nothing", which is a different claim.
 */
export const yieldOnCost = (trades: Trade[], symbol: string, now = Date.now()) => {
  const mine = trades.filter((t) => t.symbol === symbol);
  const costCents = replay(mine).costCents;
  if (costCents <= 0) return null;

  const since = new Date(now);
  since.setFullYear(since.getFullYear() - 1);

  const paid = mine
    .filter((t) => t.kind === 'dividend' && t.tradedAt >= since.getTime())
    .reduce((sum, t) => sum + tradeCents(t), 0);
  if (paid <= 0) return null;

  return { paidCents: paid, costCents, percent: Math.round((paid / costCents) * 1000) / 10 };
};
export interface DeclaredRow extends DueDividend {
  /**
   * The ex-date has arrived, so these units are already entitled: selling
   * tomorrow does not take the payment away.
   */
  locked: boolean;
}

/**
 * What the next twelve months will pay, counting only what has been declared.
 *
 * Every figure here comes from a company's own announcement — the per-unit
 * amount, the ex-date, the pay date — multiplied by the units the trade log
 * says were held. Nothing is annualised, extrapolated from last year, or
 * assumed to repeat. A counter that has declared one dividend contributes one
 * dividend, and a counter that has declared none contributes nothing at all.
 *
 * The split matters more than the total. Once the ex-date has passed the
 * money is owed whatever happens next; before it, the payment only arrives if
 * the shares are still held on the day. Presenting them as one number would
 * claim a certainty the second half does not have.
 */
export const declaredIncome = (dividends: Dividend[], trades: Trade[], now = Date.now()) => {
  const today = dayStart(now);
  const start = new Date(today);
  const horizon = new Date(start.getFullYear() + 1, start.getMonth(), start.getDate()).getTime();

  const rows: DeclaredRow[] = upcomingDividends(dividends, trades, now)
    .filter((r) => r.dividend.payDate < horizon)
    // Nothing held on the ex-date, nothing owed — the same rule dueDividends
    // applies, so the two lists never disagree about a counter.
    .filter((r) => r.units > 0 && r.amountCents > 0)
    .map((r) => ({ ...r, locked: r.dividend.exDate <= today }));

  const sum = (only: boolean) =>
    rows.filter((r) => r.locked === only).reduce((total, r) => total + r.amountCents, 0);

  const lockedCents = sum(true);
  const pendingCents = sum(false);
  return { rows, lockedCents, pendingCents, totalCents: lockedCents + pendingCents };
};

/**
 * Dividends still to come, for the screen that lists them. Includes today's,
 * since a pay date arrives before the money does.
 */
export const upcomingDividends = (dividends: Dividend[], trades: Trade[], now = Date.now()) => {
  const today = dayStart(now);
  return dividends
    .filter((d) => d.payDate >= today)
    .map((d) => {
      const units = unitsOnExDate(
        trades.filter((t) => t.symbol === d.symbol),
        d.exDate
      );
      return { dividend: d, units, amountCents: dividendCents(units, d.perUnitPoints) };
    })
    .sort((a, b) => a.dividend.payDate - b.dividend.payDate);
};
