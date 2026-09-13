import type { Activity, Holding, PiggyBank, Trade } from '../types';
import { averageCostCents, marketValueCents, tradeCents, type Quotes } from './holdings';
import { fromCents } from './money';
import { buildXlsx, type Cell } from './xlsx';
import { categoryOf } from './categories';
import { m, noteText } from '../i18n';

/**
 * The monthly statement as a spreadsheet.
 *
 * It used to be a CSV, and a CSV has no way of saying what encoding it is in
 * that every reader honours. Chinese goal names came out as mojibake: the
 * byte-order mark was ignored and Windows-1252 assumed, and moving to UTF-16
 * changed nothing except which wrong characters appeared. An .xlsx states its
 * encoding inside the file, so nothing has to guess.
 *
 * Amounts go in as numbers rather than text, which is the other half of being
 * a real spreadsheet: the columns can be summed.
 */

// Read when the sheet is built, so it comes out in the language chosen now.
const typeLabels = (): Record<Activity['type'], string> => ({
  'auto-save': m().common.activity.autoSave,
  manual: m().common.activity.manual,
  withdraw: m().files.withdrawal,
  borrow: m().common.activity.borrow,
  invest: m().common.activity.invest,
  divest: m().common.activity.divest,
});

const tradeLabels = (): Record<Trade['kind'], string> => m().files.trade;

/** Rounded to the sen the ledger stores, so no float tail reaches the sheet. */
const money = (n: number) => Math.round(n * 100) / 100;

const pad = (n: number) => String(n).padStart(2, '0');
const localDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const localTime = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/**
 * One row per transaction, one column per goal holding the signed amount that
 * reached it — everything needed to rebuild the ledger later.
 */
export const savingsRows = (activities: Activity[], banks: PiggyBank[]): Cell[][] => {
  // Distributions pointing at a goal that has since been deleted still hold
  // money that moved, so they get a column of their own.
  const orphaned = activities.some((a) =>
    a.distributions.some((d) => !banks.some((b) => b.id === d.bankId))
  );

  const f = m().files;
  const TYPE_LABEL = typeLabels();
  const header: Cell[] = [
    f.date,
    f.time,
    f.type,
    f.amount,
    f.repaidDebt,
    f.note,
    // Only spending has one; a deposit's cell stays empty rather than
    // claiming a category it was never given.
    f.category,
    ...banks.map((b) => b.name),
    ...(orphaned ? [f.deletedGoals] : []),
  ];

  const rows = [...activities]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((a): Cell[] => {
      const d = new Date(a.date);
      const perBank = banks.map((b) => {
        const sum = a.distributions.filter((x) => x.bankId === b.id).reduce((s, x) => s + x.amount, 0);
        return sum === 0 ? null : money(sum);
      });
      const other = a.distributions
        .filter((x) => !banks.some((b) => b.id === x.bankId))
        .reduce((s, x) => s + x.amount, 0);

      // Money moved for a trade names its counter, so the row reads as shares
      // bought or sold rather than as a deposit or spending.
      const trade = (a.type === 'invest' || a.type === 'divest') && a.counter;
      return [
        localDate(d),
        localTime(d),
        TYPE_LABEL[a.type] ?? a.type,
        money(a.amount),
        a.repaid ? money(a.repaid) : null,
        trade ? f.tradeNote(TYPE_LABEL[a.type], a.counter!) : a.note == null ? null : noteText(a.note),
        a.type === 'withdraw' ? categoryOf(a.category).label : null,
        ...perBank,
        ...(orphaned ? [other === 0 ? null : money(other)] : []),
      ];
    });

  return [header, ...rows];
};

export interface MonthSheetInput {
  label: string;
  activities: Activity[];
  banks: PiggyBank[];
  trades: Trade[];
  /** Positions as they stood at the end of the month. */
  holdings: Holding[];
  quotes: Quotes;
}

/**
 * One month, both halves, on one sheet.
 *
 * Saving and investing do not share a shape — a deposit is split across goals,
 * a trade is units at a price — so forcing them into one table would leave
 * most of every row empty. They go in as blocks instead, each under its own
 * heading, with a blank row between.
 *
 * They are never added together: the shares are not part of the savings
 * balance. The one place the two meet is a dividend, which appears in both
 * because it really is income from a holding and money that reached the goals.
 */
export const monthRows = ({ label, activities, banks, trades, holdings, quotes }: MonthSheetInput): Cell[][] => {
  const f = m().files;
  const TRADE_LABEL = tradeLabels();
  const rows: Cell[][] = [[f.sheetTitle, label], [], [f.savingsBlock]];

  if (activities.length === 0) rows.push([f.noRecordsThisMonth]);
  else rows.push(...savingsRows(activities, banks));

  rows.push([], [f.investmentsBlock]);
  if (trades.length === 0) {
    rows.push([f.noTradesThisMonth]);
  } else {
    rows.push([f.date, f.action, f.counter, f.name, f.units, f.perUnit, f.amount]);
    for (const t of [...trades].sort((a, b) => a.tradedAt - b.tradedAt)) {
      rows.push([
        localDate(new Date(t.tradedAt)),
        TRADE_LABEL[t.kind],
        t.symbol,
        t.name,
        t.units,
        // A dividend is quoted per unit in ten-thousandths of a ringgit.
        money(fromCents(t.kind === 'dividend' ? (t.perUnitPoints ?? 0) / 100 : t.priceCents)),
        money(fromCents(tradeCents(t))),
      ]);
    }
  }

  rows.push([], [f.positionsBlock]);
  if (holdings.length === 0) {
    rows.push([f.nothingHeld]);
  } else {
    rows.push([f.counter, f.name, f.units, f.averageCost, f.totalCost, f.marketValue, f.gain]);
    for (const h of holdings) {
      const price = quotes[h.symbol]?.priceCents ?? Math.round(averageCostCents(h));
      const value = marketValueCents(h, price);
      rows.push([
        h.symbol,
        h.name,
        h.units,
        money(fromCents(Math.round(averageCostCents(h)))),
        money(fromCents(h.costCents)),
        money(fromCents(value)),
        money(fromCents(value - h.costCents)),
      ]);
    }
  }

  return rows;
};

export const buildMonthWorkbook = (input: MonthSheetInput, now: Date = new Date()) =>
  buildXlsx(monthRows(input), input.label, now);

/** "SavvyPiggy-August-2026.xlsx" — the month is what people look for. */
export const monthFileName = (label: string, ext: string) =>
  `SavvyPiggy-${label.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '')}.${ext}`;
