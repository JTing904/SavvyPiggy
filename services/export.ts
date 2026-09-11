import type { Activity, Holding, PiggyBank, Trade } from '../types';
import { averageCostCents, marketValueCents, tradeCents, type Quotes } from './holdings';
import { fromCents } from './money';

/**
 * A flat statement: one row per transaction, one column per goal holding the
 * signed amount that reached it, carrying everything needed to rebuild the
 * ledger later.
 *
 * It is written as UTF-16 with tabs, which is not what "CSV" suggests but is
 * what spreadsheets actually read correctly. Goal names are often Chinese, and
 * a file that is a few thousand ASCII digits around a dozen Chinese characters
 * gets guessed at: UTF-8 with a byte-order mark was still read as Windows-1252
 * and turned every name into mojibake. UTF-16's mark cannot be mistaken for
 * anything else, so nothing has to guess — and once a file is UTF-16, readers
 * look for tabs rather than commas, so the separator follows. This is the same
 * pairing Excel itself writes as "Unicode text".
 */

/** Tab, for the reason above. Everything here honours it. */
const SEP = '\t';

const TYPE_LABEL: Record<Activity['type'], string> = {
  'auto-save': 'Scheduled deposit',
  manual: 'Deposit',
  withdraw: 'Withdrawal',
  borrow: 'Borrowed',
};

/** Quotes a cell only when it holds something the format treats specially. */
const cell = (value: string | number) => {
  const s = String(value);
  return s.includes('"') || s.includes(SEP) || /[\r\n]/.test(s)
    ? `"${s.replace(/"/g, '""')}"`
    : s;
};

/**
 * UTF-16 little-endian. The text already opens with U+FEFF, which in this
 * encoding is the byte-order mark itself, so nothing needs prepending.
 */
const toUtf16le = (text: string) => {
  const out = new Uint8Array(text.length * 2);
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    out[i * 2] = code & 0xff;
    out[i * 2 + 1] = code >> 8;
  }
  return out;
};

const money = (n: number) => n.toFixed(2);

const pad = (n: number) => String(n).padStart(2, '0');
const localDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const localTime = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

export const buildCsv = (activities: Activity[], banks: PiggyBank[]): string => {
  // Distributions pointing at a goal that has since been deleted still hold
  // money that moved, so they get a column of their own.
  const orphaned = activities.some((a) =>
    a.distributions.some((d) => !banks.some((b) => b.id === d.bankId))
  );

  const header = [
    'Date',
    'Time',
    'Type',
    'Amount',
    'Repaid debt',
    'Note',
    ...banks.map((b) => b.name),
    ...(orphaned ? ['Deleted goals'] : []),
  ];

  const rows = [...activities]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((a) => {
      const d = new Date(a.date);
      const perBank = banks.map((b) => {
        const sum = a.distributions.filter((x) => x.bankId === b.id).reduce((s, x) => s + x.amount, 0);
        return sum === 0 ? '' : money(sum);
      });
      const other = a.distributions
        .filter((x) => !banks.some((b) => b.id === x.bankId))
        .reduce((s, x) => s + x.amount, 0);

      return [
        localDate(d),
        localTime(d),
        TYPE_LABEL[a.type] ?? a.type,
        money(a.amount),
        a.repaid ? money(a.repaid) : '',
        a.note ?? '',
        ...perBank,
        ...(orphaned ? [other === 0 ? '' : money(other)] : []),
      ];
    });

  return [header, ...rows].map((r) => r.map(cell).join(SEP)).join('\r\n');
};

/** "SavvyPiggy_2026-09-05_Month.csv" — safe on every filesystem. */
export const exportFileName = (label: string, ext: string, now: Date = new Date()) =>
  `SavvyPiggy_${localDate(now)}_${label.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '')}.${ext}`;


/* ------------------------------------------------------------- statements */

const TRADE_LABEL: Record<Trade['kind'], string> = {
  buy: 'Buy',
  sell: 'Sell',
  dividend: 'Dividend',
};

const lines = (rows: (string | number)[][]) => rows.map((r) => r.map(cell).join(SEP));

export interface MonthCsvInput {
  label: string;
  activities: Activity[];
  banks: PiggyBank[];
  trades: Trade[];
  /** Positions as they stood at the end of the month. */
  holdings: Holding[];
  quotes: Quotes;
}

/**
 * One month, both halves, in a single file.
 *
 * Saving and investing do not share a shape — a deposit is split across goals,
 * a trade is units at a price — so forcing them into one table would leave
 * most of every row empty. They go in as blocks instead, each with its own
 * heading, which a spreadsheet shows as tables one above the other.
 *
 * They are never added together: the shares are not part of the savings
 * balance. The one place the two meet is a dividend, which appears in both
 * because it really is income from a holding and money that reached the goals.
 */
export const buildMonthCsv = ({ label, activities, banks, trades, holdings, quotes }: MonthCsvInput): Uint8Array => {
  const out: string[] = [];

  out.push(...lines([['SavvyPiggy statement', label]]));
  out.push('');
  out.push(...lines([['SAVINGS']]));

  if (activities.length === 0) {
    out.push(...lines([['No records this month']]));
  } else {
    // The savings block is the ordinary export, reused whole so the two can
    // never drift apart.
    out.push(...buildCsv(activities, banks).split('\r\n'));
  }

  out.push('');
  out.push(...lines([['INVESTMENTS']]));
  if (trades.length === 0) {
    out.push(...lines([['No trades this month']]));
  } else {
    out.push(
      ...lines([
        ['Date', 'Action', 'Counter', 'Name', 'Units', 'Per unit', 'Amount'],
        ...[...trades]
          .sort((a, b) => a.tradedAt - b.tradedAt)
          .map((t) => [
            localDate(new Date(t.tradedAt)),
            TRADE_LABEL[t.kind],
            t.symbol,
            t.name,
            t.units,
            money(fromCents(t.kind === 'dividend' ? (t.perUnitPoints ?? 0) / 100 : t.priceCents)),
            money(fromCents(tradeCents(t))),
          ]),
      ])
    );
  }

  out.push('');
  out.push(...lines([['POSITIONS AT MONTH END']]));
  if (holdings.length === 0) {
    out.push(...lines([['Nothing held']]));
  } else {
    out.push(
      ...lines([
        ['Counter', 'Name', 'Units', 'Average cost', 'Total cost', 'Market value', 'Gain'],
        ...holdings.map((h) => {
          const price = quotes[h.symbol]?.priceCents ?? Math.round(averageCostCents(h));
          const value = marketValueCents(h, price);
          return [
            h.symbol,
            h.name,
            h.units,
            money(fromCents(Math.round(averageCostCents(h)))),
            money(fromCents(h.costCents)),
            money(fromCents(value)),
            money(fromCents(value - h.costCents)),
          ];
        }),
      ])
    );
  }

  return toUtf16le('\uFEFF' + out.join('\r\n') + '\r\n');
};

/** "SavvyPiggy-August-2026.csv" — the month is what people look for. */
export const monthFileName = (label: string, ext: string) =>
  `SavvyPiggy-${label.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '')}.${ext}`;
