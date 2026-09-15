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
const DAY_MS = 86_400_000;

/**
 * "12 Mar 2026" as that calendar day, stamped at UTC midnight, or null.
 *
 * Dates on the exchange are days, not instants. The Worker that parses them
 * runs in UTC, so the number it has always handed the app is UTC midnight —
 * and that number is baked into every credited dividend's id. It is built
 * with Date.UTC on purpose, so the same page gives the same number wherever
 * this runs, and the phone turns it back into its own local day with
 * `exchangeDay` before comparing it with anything.
 */
export const parseDay = (text: string): number | null => {
  const m = /^\s*(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?,?\s+(\d{4})\s*$/.exec(text);
  if (!m) return null;
  const month = MONTHS.indexOf(m[2].toLowerCase());
  const day = Number(m[1]);
  const year = Number(m[3]);
  if (month < 0 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month, day));
  // Rejects the likes of "31 Feb 2026", which JavaScript would roll forward.
  if (date.getUTCMonth() !== month || date.getUTCDate() !== day) return null;
  return date.getTime();
};

/**
 * The local midnight, on this device, of the calendar day an exchange date
 * names.
 *
 * Announcements arrive stamped at UTC midnight (see parseDay), which in
 * Malaysia is eight in the morning. Compared as instants against the phone's
 * own midnight, a pay date was not "today" until the day after, and an
 * ex-date only counted as passed a day late. Comparing calendar days fixes
 * that without touching the stored number, which the ids are built from.
 *
 * Older data may carry local midnights instead. A local midnight only lands
 * exactly on a UTC midnight where the offset is zero, and there the two are
 * the same day anyway, so the test below reads either correctly.
 */
export const exchangeDay = (ms: number) => {
  if (ms % DAY_MS !== 0) return dayStart(ms);
  const d = new Date(ms);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()).getTime();
};

/**
 * A Bursa counter's code as KLSE Screener names it: four digits, plus the one
 * or two letters some securities carry — KLCC's stapled 5235SS, ETFs such as
 * 0800EA. Null for anything else. The app writes codes with Yahoo's ".KL".
 *
 * Only plain four-digit codes used to be accepted, so a REIT like KLCC was
 * dropped before it was ever looked up and the screen said nothing had been
 * announced.
 */
export const bursaCode = (symbol: string) => {
  const m = /^(\d{4}(?:[A-Z]{1,2})?)(?:\.KL)?$/i.exec(symbol.trim());
  return m ? m[1].toUpperCase() : null;
};

/** "0.3300" as ten-thousandths of a ringgit, so RM0.0125 survives intact. */
export const parsePoints = (text: string): number | null => {
  const cleaned = text.replace(/[,\s]/g, '');
  if (!/^\d*\.?\d+$/.test(cleaned)) return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 10_000);
};

/**
 * An announcement as the Worker sends it. `slot` tells apart dividends that
 * share a counter and an ex-date — 0 (and absent) for the first on the page,
 * 1, 2… for any others — so each can be credited once under its own id.
 */
export type AnnouncedDividend = Dividend & { slot?: number };

/** A dividend's slot, treating anything missing or malformed as the first. */
export const slotOf = (dividend: Dividend) => {
  const slot = (dividend as AnnouncedDividend).slot;
  return typeof slot === 'number' && Number.isInteger(slot) && slot > 0 ? slot : 0;
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
export const parseDividends = (html: string, symbol: string): AnnouncedDividend[] => {
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

  const out: AnnouncedDividend[] = [];
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

  /*
    Newest first, and one row per payment.

    This used to keep one row per ex-date, so an interim and a special
    dividend going ex on the same day collapsed into one and the second was
    never paid. A payment is now the ex-date, the amount and the kind of
    dividend together; a row repeated word for word is still the same payment
    and is still dropped. So is an "amended" row beside its original even if
    the amount differs — it corrects that payment rather than adding one, and
    counting both would invent money. The first on the page stands, as before.

    The sort is stable, so rows sharing an ex-date stay in page order — which
    is what the old filter relied on too: the first of them on the page is
    the one it kept, and the one already-paid dividends were credited for.
    That row keeps slot 0 and so the exact id it always had. Only the rows the
    old filter threw away get a slot, and with it a new id.
  */
  const seen = new Set<string>();
  // Per ex-date and kind: whether any row kept for it was an amendment.
  const kinds = new Map<string, boolean>();
  const perDay = new Map<number, number>();
  return out
    .sort((a, b) => b.exDate - a.exDate)
    .filter((d) => {
      const kind = `${d.exDate}|${subjectKey(d.subject)}`;
      const key = `${kind}|${d.perUnitPoints}`;
      const amended = AMENDED.test(d.subject);
      if (seen.has(key)) return false;
      if (kinds.has(kind) && (amended || kinds.get(kind))) return false;
      seen.add(key);
      kinds.set(kind, amended || (kinds.get(kind) ?? false));
      return true;
    })
    .map((d) => {
      const slot = perDay.get(d.exDate) ?? 0;
      perDay.set(d.exDate, slot + 1);
      // Slot 0 is left off entirely, so a lone dividend looks exactly as it did.
      return slot === 0 ? d : { ...d, slot };
    });
};

const AMENDED = /\b(amended|amendment|revised|revision|corrected|correction)\b/i;

/** A subject reduced to what names the payment, so "Interim Dividend (Amended)" matches its original. */
const subjectKey = (subject: string) =>
  subject
    .toLowerCase()
    .replace(new RegExp(AMENDED.source, 'gi'), '')
    .replace(/[^a-z0-9]/g, '');

/* ------------------------------------------------------------------ money */

/**
 * What a dividend comes to on a number of units, rounded down to the sen.
 * Money never rounds up in this app, and a fraction of a sen is not payable.
 */
export const dividendCents = (units: number, perUnitPoints: number) =>
  Math.floor((units * perUnitPoints) / 100);

/**
 * The trade log's own id for a credited dividend: one per counter per ex-date,
 * and for a second dividend on the same ex-date a suffix after it.
 *
 * The first dividend on an ex-date (slot 0) gets exactly the id it always
 * had, built from the stored ex-date number as-is — that id is the key of the
 * "already paid" marker, and changing it would pay everything again.
 */
export const dividendTradeId = (symbol: string, exDate: number, slot = 0) =>
  `div_${symbol.replace(/[^A-Za-z0-9.]/g, '')}_${exDate}${slot > 0 ? `_${slot + 1}` : ''}`;

/** The id a particular announcement is credited under. */
export const dividendId = (dividend: Dividend) =>
  dividendTradeId(dividend.symbol, dividend.exDate, slotOf(dividend));

export interface DueDividend {
  /** The id it is credited under — see dividendId. */
  id: string;
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
    // As calendar days: a pay date stamped 08:00 Malaysia time is still today.
    .filter((d) => exchangeDay(d.payDate) <= today)
    .filter((d) => !recorded.has(dividendId(d)))
    .map((d) => owed(d, trades))
    // Nothing held then, nothing owed — and a sub-sen amount is not money.
    .filter((due) => due.units > 0 && due.amountCents > 0)
    .sort((a, b) => a.dividend.payDate - b.dividend.payDate || slotOf(a.dividend) - slotOf(b.dividend));
};

/**
 * Whether a trade's units can earn a dividend paid on `payDay` (a local
 * midnight).
 *
 * A buy recorded with no money moving ("not from the pot") is someone filling
 * in a trade from before they used the app. The dividends those shares earned
 * back then were received outside the app, so such a buy only earns dividends
 * paid on or after the day it was entered. A buy paid from the pot or a goal,
 * and every sale, counts from its trade date.
 */
export const countsForDividend = (trade: Trade, payDay: number) =>
  trade.kind !== 'buy' || (!!trade.money && trade.money.mode !== 'none') || dayStart(trade.createdAt) <= payDay;

/**
 * The units a dividend is owed on: held at the close before the ex-date, not
 * counting back-filled buys entered after it paid (see countsForDividend).
 * When a buy is left out, the sales come off what is left and the figure stops
 * at zero — the sales may well have been of the shares left out.
 */
export const dividendUnits = (trades: Trade[], d: Pick<Dividend, 'symbol' | 'exDate' | 'payDate'>) => {
  const exDay = exchangeDay(d.exDate);
  const payDay = exchangeDay(d.payDate);
  const cutoff = dayStart(exDay - 1);
  const mine = trades.filter((t) => t.symbol === d.symbol && t.tradedAt <= cutoff);
  if (mine.every((t) => countsForDividend(t, payDay))) return unitsOnExDate(mine, exDay);
  let units = 0;
  for (const t of mine) {
    if (t.kind === 'buy' && countsForDividend(t, payDay)) units += t.units;
    else if (t.kind === 'sell') units -= t.units;
  }
  return Math.max(0, units);
};

/** What one announcement comes to on the units held the day before its ex-date. */
const owed = (d: Dividend, trades: Trade[]): DueDividend => {
  const units = dividendUnits(trades, d);
  return { id: dividendId(d), dividend: d, units, amountCents: dividendCents(units, d.perUnitPoints) };
};

/* ------------------------------------------------------- already paid in */

/**
 * The marker a credited dividend leaves (users/{uid}/dividendsPaid/{id}).
 * Markers written before the investment pot carry only symbol, exDate, units
 * and amountCents; `pot`, `perUnitPoints` and `payDate` came with it.
 */
export interface CreditedDividend {
  id: string;
  symbol?: string;
  exDate?: number;
  payDate?: number;
  perUnitPoints?: number;
  units?: number;
  amountCents?: number;
  /** Paid into the investment pot, rather than split into goals as before it. */
  pot?: boolean;
}

export interface DividendChange {
  id: string;
  symbol: string;
  exDate: number;
  payDate: number;
  perUnitPoints: number;
  /** What the marker and the log row should say now. */
  units: number;
  amountCents: number;
  /** Into the pot (negative: out of it): the new amount less what was paid. */
  deltaCents: number;
}

/**
 * What correcting or deleting a trade does to dividends already paid into
 * the pot.
 *
 * Each credited dividend moves by exactly what the change moves: the units the
 * log owed it on before and after the change (by dividendUnits) are compared,
 * and only the difference is applied to what was actually paid. A dividend the
 * change does not touch is left exactly as it was, even if today's rules would
 * work it out differently — nothing is reversed or topped up just because the
 * rules moved. One the change makes eligible (a pot buy back-dated before its
 * ex-date) grows the same way.
 *
 * Dividends paid into goals before the pot existed are left alone: their money
 * is in savings, and the pot must not pay for it. So is any marker the app
 * cannot find a per-unit amount and dates for — nothing is guessed.
 */
export const reconcileDividends = ({
  credited,
  dividends,
  before,
  after,
}: {
  credited: CreditedDividend[];
  /** Announcements, for markers that do not carry their own amount and dates. */
  dividends: Dividend[];
  /** The whole log as it stands (dividend rows included), and as it would be. */
  before: Trade[];
  after: Trade[];
}): { deltaCents: number; changes: DividendChange[] } => {
  const rows = new Map(before.filter((t) => t.kind === 'dividend').map((t) => [t.id, t]));
  const announced = new Map(dividends.map((d) => [dividendId(d), d]));
  const changes: DividendChange[] = [];

  for (const marker of credited) {
    const row = rows.get(marker.id);
    const pot = marker.pot === true || row?.money?.mode === 'pot';
    if (!pot || typeof marker.units !== 'number' || typeof marker.amountCents !== 'number') continue;
    const ann = announced.get(marker.id);
    const symbol = marker.symbol ?? ann?.symbol ?? row?.symbol;
    const exDate = marker.exDate ?? ann?.exDate ?? row?.exDate;
    const payDate = marker.payDate ?? ann?.payDate ?? row?.tradedAt;
    const perUnitPoints = marker.perUnitPoints ?? ann?.perUnitPoints ?? row?.perUnitPoints;
    if (!symbol || typeof exDate !== 'number' || typeof payDate !== 'number' || !perUnitPoints) continue;

    const d = { symbol, exDate, payDate };
    const moved = dividendUnits(after, d) - dividendUnits(before, d);
    if (moved === 0) continue;
    const units = Math.max(0, marker.units + moved);
    const amountCents = dividendCents(units, perUnitPoints);
    if (units === marker.units && amountCents === marker.amountCents) continue;
    changes.push({ id: marker.id, symbol, exDate, payDate, perUnitPoints, units, amountCents, deltaCents: amountCents - marker.amountCents });
  }

  return { deltaCents: changes.reduce((sum, c) => sum + c.deltaCents, 0), changes };
};

/** reconcileDividends for one trade recorded, corrected (same id) or deleted (`next` null). */
export const dividendsAfterChange = ({
  trades,
  credited,
  dividends,
  previousId,
  next,
}: {
  trades: Trade[];
  credited: CreditedDividend[];
  dividends: Dividend[];
  previousId: string | null;
  next: Trade | null;
}) =>
  reconcileDividends({
    credited,
    dividends,
    before: trades,
    after: [...trades.filter((t) => t.id !== previousId), ...(next ? [next] : [])],
  });

/**
 * Pins dividends that share a counter and an ex-date to the ids they were
 * already paid under.
 *
 * The Worker numbers them by their order on the page, and the page is newest
 * first. A special dividend announced after an interim that was already paid
 * lands above it, takes slot 0 and with it the interim's id — so the special
 * read as paid and the interim fell due a second time.
 *
 * Here each paid marker for that ex-date is matched back to the announcement
 * it paid by its per-unit amount (stored on the marker, on its log row, or
 * failing both read back from its units and amount). A matched announcement
 * keeps the marker's slot; the rest take the free slots in page order. When a
 * marker does not match exactly one amount — an amended announcement, a record
 * with nothing to tell — the page order stands, as it always did.
 */
export const settleSlots = (dividends: AnnouncedDividend[], credited: CreditedDividend[], trades: Trade[]): AnnouncedDividend[] => {
  if (credited.length === 0) return dividends;
  const groups = new Map<string, Dividend[]>();
  for (const d of dividends) {
    const key = dividendTradeId(d.symbol, d.exDate);
    const list = groups.get(key);
    if (list) list.push(d);
    else groups.set(key, [d]);
  }

  const rows = new Map(trades.filter((t) => t.kind === 'dividend').map((t) => [t.id, t]));
  const slotFor = new Map<Dividend, number>();

  for (const [base, list] of groups) {
    const markers = credited
      .map((m) => ({
        m,
        slot: m.id === base ? 0 : m.id.startsWith(`${base}_`) && /^\d+$/.test(m.id.slice(base.length + 1)) ? Number(m.id.slice(base.length + 1)) - 1 : -1,
      }))
      .filter((x) => x.slot >= 0)
      .sort((a, b) => a.slot - b.slot);
    if (markers.length === 0) continue;

    const byPage = [...list].sort((a, b) => slotOf(a) - slotOf(b));
    const taken = new Map<Dividend, number>();
    let settled = true;
    for (const { m, slot } of markers) {
      const points = m.perUnitPoints ?? rows.get(m.id)?.perUnitPoints;
      const free = byPage.filter((d) => !taken.has(d));
      const units = m.units ?? 0;
      const matches =
        points !== undefined
          ? free.filter((d) => d.perUnitPoints === points)
          : units > 0 && typeof m.amountCents === 'number'
            ? free.filter((d) => dividendCents(units, d.perUnitPoints) === m.amountCents)
            : [];
      // Two different amounts that both fit is a guess; equal amounts are the same money either way.
      if (matches.length === 0 || matches.some((d) => d.perUnitPoints !== matches[0].perUnitPoints)) {
        settled = false;
        break;
      }
      taken.set(matches[0], slot);
    }
    if (!settled) continue;

    const used = new Set(taken.values());
    let next = 0;
    for (const d of byPage) {
      if (taken.has(d)) continue;
      while (used.has(next)) next++;
      taken.set(d, next);
      used.add(next);
    }
    for (const [d, slot] of taken) slotFor.set(d, slot);
  }

  if (slotFor.size === 0) return dividends;
  return dividends.map((d) => {
    const slot = slotFor.get(d);
    if (slot === undefined || slot === slotOf(d)) return d;
    const rest: AnnouncedDividend = { ...d };
    delete rest.slot;
    return slot === 0 ? rest : { ...rest, slot };
  });
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
export const declaredIncome = (dividends: Dividend[], trades: Trade[], now = Date.now(), credited: Iterable<string> = []) => {
  const today = dayStart(now);
  const start = new Date(today);
  const horizon = new Date(start.getFullYear() + 1, start.getMonth(), start.getDate()).getTime();

  const rows: DeclaredRow[] = upcomingDividends(dividends, trades, now, credited)
    .filter((r) => exchangeDay(r.dividend.payDate) < horizon)
    // Nothing held on the ex-date, nothing owed — the same rule dueDividends
    // applies, so the two lists never disagree about a counter.
    .filter((r) => r.units > 0 && r.amountCents > 0)
    .map((r) => ({ ...r, locked: exchangeDay(r.dividend.exDate) <= today }));

  const sum = (only: boolean) =>
    rows.filter((r) => r.locked === only).reduce((total, r) => total + r.amountCents, 0);

  const lockedCents = sum(true);
  const pendingCents = sum(false);
  return { rows, lockedCents, pendingCents, totalCents: lockedCents + pendingCents };
};

/**
 * Dividends still to come, for the screen that lists them. Includes today's,
 * since a pay date arrives before the money does — until it has been paid in,
 * when it belongs with what was received instead of being counted twice.
 */
export const upcomingDividends = (dividends: Dividend[], trades: Trade[], now = Date.now(), credited: Iterable<string> = []) => {
  const today = dayStart(now);
  const paid = new Set(credited);
  return dividends
    .filter((d) => exchangeDay(d.payDate) >= today)
    .filter((d) => !paid.has(dividendId(d)))
    .map((d) => owed(d, trades))
    .sort((a, b) => a.dividend.payDate - b.dividend.payDate || slotOf(a.dividend) - slotOf(b.dividend));
};
